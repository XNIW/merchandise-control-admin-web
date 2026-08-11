-- Storefront v1 / TASK-027
--
-- Atomically converts a confirmed checkout quote into a customer order, item
-- snapshots, initial event and POS-neutral outbox. Active customer orders replace
-- consumed holds/quotes as the private ATP and fulfillment-slot reservation.

begin;

create or replace function app_private.storefront_fulfillment_slot_active_uses_v1(
  p_slot_id uuid,
  p_excluded_cart_id uuid,
  p_at timestamptz
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      select count(*)
      from public.customer_checkout_quotes quote
      where quote.slot_id = p_slot_id
        and (p_excluded_cart_id is null or quote.cart_id <> p_excluded_cart_id)
        and quote.status in ('quoted', 'requires_review', 'confirmed')
        and quote.expires_at > p_at
    ) + (
      select count(*)
      from public.customer_orders customer_order
      where customer_order.slot_id = p_slot_id
        and customer_order.status in (
          'confirmed', 'accepted', 'preparing', 'ready', 'out_for_delivery'
        )
    );
$$;

create or replace function app_private.storefront_reservation_active_quantity_v1(
  p_source_product_id uuid,
  p_at timestamptz
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((
      select sum(hold.quantity)
      from public.customer_reservation_holds hold
      where hold.source_product_id = p_source_product_id
        and hold.status = 'active'
        and hold.expires_at > p_at
    ), 0)::numeric
    + coalesce((
      select sum(item.quantity)
      from public.customer_order_items item
      join public.customer_orders customer_order
        on customer_order.id = item.order_id
      where item.source_product_id = p_source_product_id
        and customer_order.status in (
          'confirmed', 'accepted', 'preparing', 'ready', 'out_for_delivery'
        )
    ), 0)::numeric;
$$;

create or replace function public.storefront_fulfillment_options_v1(
  p_shop_slug text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_setting public.storefront_settings%rowtype;
  v_now timestamptz := statement_timestamp();
  v_modes jsonb := '[]'::jsonb;
  v_points jsonb := '[]'::jsonb;
  v_zones jsonb := '[]'::jsonb;
  v_slots jsonb := '[]'::jsonb;
begin
  if p_shop_slug is null
    or p_shop_slug <> lower(btrim(p_shop_slug))
    or p_shop_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$' then
    return jsonb_build_object(
      'apiVersion', 'storefront-fulfillment.v1',
      'status', 'invalid',
      'serverTime', v_now
    );
  end if;

  select setting.* into v_setting
  from public.storefront_settings setting
  where setting.public_slug = p_shop_slug
    and setting.storefront_enabled;
  if not found then
    return jsonb_build_object(
      'apiVersion', 'storefront-fulfillment.v1',
      'status', 'unavailable',
      'serverTime', v_now
    );
  end if;

  with mode_rows(mode, enabled) as (
    values
      ('pickup'::text, v_setting.pickup_enabled and exists (
        select 1
        from public.storefront_fulfillment_slots slot
        join public.storefront_pickup_points point
          on point.shop_id = slot.shop_id and point.id = slot.pickup_point_id
        where slot.shop_id = v_setting.shop_id
          and slot.fulfillment_mode = 'pickup'
          and slot.enabled and point.enabled
          and slot.ends_at > v_now
          and slot.starts_at <= v_now + interval '14 days'
      )),
      ('reservation'::text, v_setting.reservation_enabled and exists (
        select 1
        from public.storefront_fulfillment_slots slot
        join public.storefront_pickup_points point
          on point.shop_id = slot.shop_id and point.id = slot.pickup_point_id
        where slot.shop_id = v_setting.shop_id
          and slot.fulfillment_mode = 'reservation'
          and slot.enabled and point.enabled
          and slot.ends_at > v_now
          and slot.starts_at <= v_now + interval '14 days'
      )),
      ('delivery'::text, v_setting.delivery_enabled and exists (
        select 1
        from public.storefront_fulfillment_slots slot
        join public.storefront_delivery_zones zone
          on zone.shop_id = slot.shop_id and zone.id = slot.delivery_zone_id
        where slot.shop_id = v_setting.shop_id
          and slot.fulfillment_mode = 'delivery'
          and slot.enabled and zone.enabled
          and slot.ends_at > v_now
          and slot.starts_at <= v_now + interval '14 days'
      ))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'mode', mode.mode,
    'enabled', mode.enabled
  ) order by case mode.mode when 'pickup' then 1 when 'reservation' then 2 else 3 end), '[]'::jsonb)
  into v_modes
  from mode_rows mode;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', point.id,
    'name', point.public_name,
    'addressLine1', point.address_line_1,
    'addressLine2', point.address_line_2,
    'commune', point.commune,
    'region', point.region,
    'instructions', point.public_instructions
  ) order by point.sort_rank, point.public_name, point.id), '[]'::jsonb)
  into v_points
  from public.storefront_pickup_points point
  where point.shop_id = v_setting.shop_id
    and point.enabled
    and exists (
      select 1 from public.storefront_fulfillment_slots slot
      where slot.shop_id = point.shop_id
        and slot.pickup_point_id = point.id
        and slot.enabled
        and slot.ends_at > v_now
        and slot.starts_at <= v_now + interval '14 days'
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', zone.id,
    'name', zone.public_name,
    'region', zone.region,
    'communes', coalesce((
      select jsonb_agg(commune.commune order by commune.commune)
      from public.storefront_delivery_zone_communes commune
      where commune.shop_id = zone.shop_id and commune.zone_id = zone.id
    ), '[]'::jsonb),
    'feeClp', zone.fee_clp
  ) order by zone.sort_rank, zone.public_name, zone.id), '[]'::jsonb)
  into v_zones
  from public.storefront_delivery_zones zone
  where zone.shop_id = v_setting.shop_id
    and zone.enabled
    and exists (
      select 1 from public.storefront_fulfillment_slots slot
      where slot.shop_id = zone.shop_id
        and slot.delivery_zone_id = zone.id
        and slot.enabled
        and slot.ends_at > v_now
        and slot.starts_at <= v_now + interval '14 days'
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', slot.id,
    'mode', slot.fulfillment_mode,
    'pickupPointId', slot.pickup_point_id,
    'deliveryZoneId', slot.delivery_zone_id,
    'label', slot.public_label,
    'startsAt', slot.starts_at,
    'endsAt', slot.ends_at,
    'status', 'available'
  ) order by slot.starts_at, slot.id), '[]'::jsonb)
  into v_slots
  from public.storefront_fulfillment_slots slot
  left join public.storefront_pickup_points point
    on point.shop_id = slot.shop_id and point.id = slot.pickup_point_id
  left join public.storefront_delivery_zones zone
    on zone.shop_id = slot.shop_id and zone.id = slot.delivery_zone_id
  where slot.shop_id = v_setting.shop_id
    and slot.enabled
    and slot.ends_at > v_now
    and slot.starts_at <= v_now + interval '14 days'
    and case slot.fulfillment_mode
      when 'pickup' then v_setting.pickup_enabled and point.enabled
      when 'reservation' then v_setting.reservation_enabled and point.enabled
      when 'delivery' then v_setting.delivery_enabled and zone.enabled
      else false
    end
    and slot.capacity >
      app_private.storefront_fulfillment_slot_active_uses_v1(
        slot.id,
        null,
        v_now
      );

  return jsonb_build_object(
    'apiVersion', 'storefront-fulfillment.v1',
    'status', 'ok',
    'shopSlug', p_shop_slug,
    'currencyCode', 'CLP',
    'modes', v_modes,
    'pickupPoints', v_points,
    'deliveryZones', v_zones,
    'slots', v_slots,
    'serverTime', v_now
  );
end;
$$;

create or replace function public.customer_order_create_v1(
  p_quote_id uuid,
  p_expected_quote_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_quote public.customer_checkout_quotes%rowtype;
  v_cart public.customer_carts%rowtype;
  v_previous public.customer_order_mutations%rowtype;
  v_existing_order_id uuid;
  v_order_id uuid;
  v_order_code text;
  v_request_sha256 text;
  v_validation jsonb;
  v_changed boolean;
  v_fulfillment_snapshot jsonb;
  v_result jsonb;
  v_line record;
  v_source_product_id uuid;
  v_hold public.customer_reservation_holds%rowtype;
  v_hold_id uuid;
  v_outbox_payload jsonb;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_quote_id is null
    or p_expected_quote_version is null
    or p_expected_quote_version < 1
    or p_idempotency_key is null then
    return app_private.customer_order_error_v1('invalid', false, v_now);
  end if;

  select quote.* into v_quote
  from public.customer_checkout_quotes quote
  where quote.id = p_quote_id
    and quote.user_id = v_user_id;
  if not found then
    return app_private.customer_order_error_v1('not_found', false, v_now);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer-checkout:' || v_user_id::text || ':' || v_quote.shop_id::text,
    26026
  ));

  select quote.* into v_quote
  from public.customer_checkout_quotes quote
  where quote.id = p_quote_id
    and quote.user_id = v_user_id
  for update;
  if not found then
    return app_private.customer_order_error_v1('not_found', false, v_now);
  end if;

  v_request_sha256 := encode(extensions.digest(
    pg_catalog.convert_to(jsonb_build_array(
      'create-order', p_quote_id, p_expected_quote_version
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  delete from public.customer_order_mutations mutation
  where mutation.user_id = v_user_id
    and mutation.shop_id = v_quote.shop_id
    and mutation.retained_until <= v_now;

  select mutation.* into v_previous
  from public.customer_order_mutations mutation
  where mutation.user_id = v_user_id
    and mutation.shop_id = v_quote.shop_id
    and mutation.idempotency_key = p_idempotency_key;
  if found then
    if v_previous.operation <> 'create'
      or v_previous.request_sha256 <> v_request_sha256 then
      return app_private.customer_order_error_v1(
        'idempotency_conflict', false, v_now, v_previous.order_id
      );
    end if;
    return jsonb_set(v_previous.response_payload, '{idempotent}', 'true'::jsonb);
  end if;

  select customer_order.id into v_existing_order_id
  from public.customer_orders customer_order
  where customer_order.quote_id = v_quote.id
    and customer_order.user_id = v_user_id
  for share;
  if found then
    v_result := app_private.customer_order_payload_v1(
      v_existing_order_id,
      'ok',
      true,
      v_now
    );
    insert into public.customer_order_mutations(
      user_id, shop_id, quote_id, order_id, idempotency_key,
      request_sha256, response_payload
    ) values (
      v_user_id, v_quote.shop_id, v_quote.id, v_existing_order_id,
      p_idempotency_key, v_request_sha256, v_result
    );
    return v_result;
  end if;

  if v_quote.status <> 'confirmed' then
    v_result := app_private.customer_order_error_v1(
      case
        when v_quote.status = 'requires_review' then 'requires_review'
        when v_quote.status = 'consumed' then 'invariant_error'
        when v_quote.status in ('expired', 'invalidated') then v_quote.status
        else 'quote_not_confirmed'
      end,
      false,
      v_now
    );
    insert into public.customer_order_mutations(
      user_id, shop_id, quote_id, idempotency_key,
      request_sha256, response_payload
    ) values (
      v_user_id, v_quote.shop_id, v_quote.id, p_idempotency_key,
      v_request_sha256, v_result
    );
    return v_result;
  end if;

  if v_quote.expires_at <= v_now then
    update public.customer_checkout_quotes quote
    set status = 'expired'
    where quote.id = v_quote.id and quote.status = 'confirmed';
    v_result := app_private.customer_order_error_v1('expired', false, v_now);
    insert into public.customer_order_mutations(
      user_id, shop_id, quote_id, idempotency_key,
      request_sha256, response_payload
    ) values (
      v_user_id, v_quote.shop_id, v_quote.id, p_idempotency_key,
      v_request_sha256, v_result
    );
    return v_result;
  end if;

  if v_quote.quote_version <> p_expected_quote_version then
    v_result := app_private.customer_order_error_v1(
      'quote_version_conflict', false, v_now
    );
    insert into public.customer_order_mutations(
      user_id, shop_id, quote_id, idempotency_key,
      request_sha256, response_payload
    ) values (
      v_user_id, v_quote.shop_id, v_quote.id, p_idempotency_key,
      v_request_sha256, v_result
    );
    return v_result;
  end if;

  select cart.* into v_cart
  from public.customer_carts cart
  where cart.id = v_quote.cart_id
    and cart.user_id = v_user_id
    and cart.shop_id = v_quote.shop_id
  for update;
  if not found or v_cart.cart_version <> v_quote.cart_version then
    update public.customer_checkout_quotes quote
    set status = 'invalidated'
    where quote.id = v_quote.id;
    v_result := app_private.customer_order_error_v1(
      'cart_version_conflict', false, v_now
    );
    insert into public.customer_order_mutations(
      user_id, shop_id, quote_id, idempotency_key,
      request_sha256, response_payload
    ) values (
      v_user_id, v_quote.shop_id, v_quote.id, p_idempotency_key,
      v_request_sha256, v_result
    );
    return v_result;
  end if;

  v_validation := app_private.customer_checkout_validate_v1(
    v_user_id,
    v_quote.shop_id,
    v_quote.cart_id,
    v_quote.cart_version,
    v_quote.fulfillment_mode,
    v_quote.address_id,
    v_quote.pickup_point_id,
    v_quote.slot_id,
    v_now
  );
  if v_validation->>'status' <> 'ok' then
    update public.customer_checkout_quotes quote
    set status = 'invalidated'
    where quote.id = v_quote.id;
    v_result := app_private.customer_order_error_v1(
      v_validation->>'status', false, v_now
    );
    insert into public.customer_order_mutations(
      user_id, shop_id, quote_id, idempotency_key,
      request_sha256, response_payload
    ) values (
      v_user_id, v_quote.shop_id, v_quote.id, p_idempotency_key,
      v_request_sha256, v_result
    );
    return v_result;
  end if;

  v_changed :=
    v_quote.subtotal_clp <> (v_validation->>'subtotalClp')::bigint
    or v_quote.delivery_fee_clp <> (v_validation->>'deliveryFeeClp')::bigint
    or v_quote.total_clp <> (v_validation->>'totalClp')::bigint
    or v_quote.items_snapshot <> v_validation->'items'
    or v_quote.address_snapshot is distinct from
      case when v_quote.fulfillment_mode = 'delivery'
        then v_validation->'addressSnapshot' end;
  if v_changed then
    update public.customer_checkout_quotes quote
    set quote_version = quote.quote_version + 1,
        status = 'requires_review',
        confirmed_at = null,
        subtotal_clp = (v_validation->>'subtotalClp')::bigint,
        delivery_fee_clp = (v_validation->>'deliveryFeeClp')::bigint,
        total_clp = (v_validation->>'totalClp')::bigint,
        items_snapshot = v_validation->'items',
        changes = v_validation->'changes',
        address_snapshot = case when quote.fulfillment_mode = 'delivery'
          then v_validation->'addressSnapshot' end,
        expires_at = least(
          v_now + interval '5 minutes',
          quote.quoted_at + interval '10 minutes'
        )
    where quote.id = v_quote.id;
    v_result := app_private.customer_order_error_v1(
      'requires_review', false, v_now
    );
    insert into public.customer_order_mutations(
      user_id, shop_id, quote_id, idempotency_key,
      request_sha256, response_payload
    ) values (
      v_user_id, v_quote.shop_id, v_quote.id, p_idempotency_key,
      v_request_sha256, v_result
    );
    return v_result;
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'mode', v_quote.fulfillment_mode,
    'address', v_quote.address_snapshot,
    'pickupPoint', case when point.id is not null then jsonb_build_object(
      'id', point.id,
      'name', point.public_name,
      'addressLine1', point.address_line_1,
      'addressLine2', point.address_line_2,
      'commune', point.commune,
      'region', point.region,
      'instructions', point.public_instructions
    ) end,
    'deliveryZone', case when zone.id is not null then jsonb_build_object(
      'id', zone.id,
      'name', zone.public_name,
      'region', zone.region,
      'feeClp', v_quote.delivery_fee_clp
    ) end,
    'slot', jsonb_build_object(
      'id', slot.id,
      'label', slot.public_label,
      'startsAt', slot.starts_at,
      'endsAt', slot.ends_at
    )
  )) into v_fulfillment_snapshot
  from public.storefront_fulfillment_slots slot
  left join public.storefront_pickup_points point
    on point.shop_id = slot.shop_id and point.id = v_quote.pickup_point_id
  left join public.storefront_delivery_zones zone
    on zone.shop_id = slot.shop_id and zone.id = v_quote.delivery_zone_id
  where slot.shop_id = v_quote.shop_id and slot.id = v_quote.slot_id;
  if v_fulfillment_snapshot is null then
    raise exception using
      errcode = '23514',
      message = 'validated fulfillment snapshot missing';
  end if;

  insert into public.customer_orders(
    user_id, shop_id, quote_id, cart_id, quote_version,
    fulfillment_mode, slot_id, subtotal_clp, delivery_fee_clp, total_clp,
    fulfillment_snapshot, placed_at
  ) values (
    v_user_id, v_quote.shop_id, v_quote.id, v_quote.cart_id,
    v_quote.quote_version, v_quote.fulfillment_mode, v_quote.slot_id,
    v_quote.subtotal_clp, v_quote.delivery_fee_clp, v_quote.total_clp,
    v_fulfillment_snapshot, v_now
  ) returning id, public_order_code into v_order_id, v_order_code;

  for v_line in
    select
      row_number() over (order by raw.ordinality)::integer as line_position,
      raw.item->>'publicationId' as publication_id_text,
      raw.item->>'publicName' as public_name,
      (raw.item->>'quantity')::integer as quantity,
      (raw.item->>'unitPriceClp')::bigint as unit_price_clp,
      nullif(raw.item->>'compareAtPriceClp', '')::bigint as compare_at_price_clp,
      (raw.item->>'lineTotalClp')::bigint as line_total_clp,
      nullif(raw.item->>'promotionName', '') as promotion_name,
      nullif(raw.item->>'promotionEndsAt', '')::timestamptz as promotion_ends_at,
      nullif(raw.item->>'holdId', '')::uuid as quoted_hold_id
    from jsonb_array_elements(v_validation->'items') with ordinality
      as raw(item, ordinality)
    order by raw.ordinality
  loop
    select publication.source_product_id into strict v_source_product_id
    from public.storefront_product_publications publication
    where publication.shop_id = v_quote.shop_id
      and publication.id = v_line.publication_id_text::uuid;

    update public.customer_reservation_holds hold
    set status = 'expired', terminal_at = v_now, updated_at = v_now
    where hold.user_id = v_user_id
      and hold.shop_id = v_quote.shop_id
      and hold.publication_id = v_line.publication_id_text::uuid
      and hold.status = 'active'
      and hold.expires_at <= v_now;

    select hold.* into v_hold
    from public.customer_reservation_holds hold
    where hold.user_id = v_user_id
      and hold.shop_id = v_quote.shop_id
      and hold.publication_id = v_line.publication_id_text::uuid
      and hold.status = 'active'
      and hold.expires_at > v_now
    order by hold.expires_at desc, hold.id
    limit 1
    for update;

    if found then
      if v_quote.fulfillment_mode = 'reservation'
        and v_hold.quantity < v_line.quantity then
        raise exception using
          errcode = '40001',
          message = 'reservation hold quantity changed during order commit';
      end if;
      update public.customer_reservation_holds hold
      set status = 'consumed', terminal_at = v_now, updated_at = v_now
      where hold.id = v_hold.id and hold.status = 'active'
      returning hold.id into v_hold_id;
      if not found then
        raise exception using
          errcode = '40001',
          message = 'reservation hold changed during order commit';
      end if;
    else
      insert into public.customer_reservation_holds(
        user_id, shop_id, publication_id, source_product_id, quantity,
        status, expires_at, terminal_at, create_idempotency_key,
        create_request_sha256, created_at, updated_at
      ) values (
        v_user_id, v_quote.shop_id, v_line.publication_id_text::uuid,
        v_source_product_id, v_line.quantity, 'consumed',
        v_now + interval '5 minutes', v_now, gen_random_uuid(),
        encode(extensions.digest(
          pg_catalog.convert_to(jsonb_build_array(
            'order-consume', v_order_id, v_line.publication_id_text,
            v_line.quantity
          )::text, 'UTF8'),
          'sha256'
        ), 'hex'),
        v_now, v_now
      ) returning id into v_hold_id;
    end if;

    insert into public.customer_order_items(
      order_id, shop_id, line_position, publication_id, source_product_id,
      hold_id, public_name, quantity, unit_price_clp, compare_at_price_clp,
      line_total_clp, promotion_name, promotion_ends_at, created_at
    ) values (
      v_order_id, v_quote.shop_id, v_line.line_position,
      v_line.publication_id_text::uuid, v_source_product_id, v_hold_id,
      v_line.public_name, v_line.quantity, v_line.unit_price_clp,
      v_line.compare_at_price_clp, v_line.line_total_clp,
      v_line.promotion_name, v_line.promotion_ends_at, v_now
    );
  end loop;

  if not exists (
    select 1 from public.customer_order_items item where item.order_id = v_order_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'order requires at least one item';
  end if;

  insert into public.customer_order_status_events(
    order_id, shop_id, event_version, status, actor_kind,
    metadata_redacted, created_at
  ) values (
    v_order_id, v_quote.shop_id, 1, 'confirmed', 'system',
    jsonb_build_object('source', 'customer_checkout_quote'), v_now
  );

  select jsonb_build_object(
    'apiVersion', 'customer-order-outbox.v1',
    'eventType', 'customer_order.confirmed.v1',
    'documentKind', 'customer_order',
    'fiscalStatus', 'not_created',
    'orderId', v_order_id,
    'orderCode', v_order_code,
    'shopId', v_quote.shop_id,
    'idempotencyKey', v_order_id,
    'fulfillment', v_fulfillment_snapshot,
    'currencyCode', 'CLP',
    'subtotalClp', v_quote.subtotal_clp,
    'deliveryFeeClp', v_quote.delivery_fee_clp,
    'totalClp', v_quote.total_clp,
    'items', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'publicationId', item.publication_id,
        'sourceProductId', item.source_product_id,
        'publicName', item.public_name,
        'quantity', item.quantity,
        'unitPriceClp', item.unit_price_clp,
        'lineTotalClp', item.line_total_clp
      )) order by item.line_position)
      from public.customer_order_items item
      where item.order_id = v_order_id
    ), '[]'::jsonb),
    'confirmedAt', v_now
  ) into v_outbox_payload;

  insert into public.customer_order_outbox(
    order_id, shop_id, event_type, idempotency_key, payload,
    status, available_at, created_at, updated_at
  ) values (
    v_order_id, v_quote.shop_id, 'customer_order.confirmed.v1', v_order_id,
    v_outbox_payload, 'pending', v_now, v_now, v_now
  );

  update public.customer_checkout_quotes quote
  set status = 'consumed', consumed_at = v_now
  where quote.id = v_quote.id and quote.status = 'confirmed';
  if not found then
    raise exception using
      errcode = '40001',
      message = 'checkout quote changed during order commit';
  end if;

  delete from public.customer_cart_items item
  where item.cart_id = v_cart.id;
  update public.customer_carts cart
  set cart_version = cart.cart_version + 1,
      last_revalidated_at = v_now
  where cart.id = v_cart.id;

  perform app_private.storefront_reservation_refresh_availability_v1(
    reserved.source_product_id,
    v_now
  )
  from (
    select distinct item.source_product_id
    from public.customer_order_items item
    where item.order_id = v_order_id
  ) reserved;

  v_result := app_private.customer_order_payload_v1(
    v_order_id,
    'ok',
    false,
    v_now
  );
  insert into public.customer_order_mutations(
    user_id, shop_id, quote_id, order_id, idempotency_key,
    request_sha256, response_payload
  ) values (
    v_user_id, v_quote.shop_id, v_quote.id, v_order_id,
    p_idempotency_key, v_request_sha256, v_result
  );
  return v_result;
end;
$$;

create or replace function public.customer_order_read_v1(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_order_id uuid;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_order_id is null then
    return app_private.customer_order_error_v1('invalid', true, v_now);
  end if;

  select customer_order.id into v_order_id
  from public.customer_orders customer_order
  where customer_order.id = p_order_id
    and customer_order.user_id = v_user_id;
  if not found then
    return app_private.customer_order_error_v1('not_found', true, v_now);
  end if;
  return app_private.customer_order_payload_v1(
    v_order_id,
    'ok',
    true,
    v_now
  );
end;
$$;

revoke all on function app_private.storefront_fulfillment_slot_active_uses_v1(
  uuid, uuid, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function app_private.storefront_reservation_active_quantity_v1(
  uuid, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function app_private.customer_checkout_validate_v1(
  uuid, uuid, uuid, bigint, text, uuid, uuid, uuid, timestamptz
) from public, anon, authenticated, service_role;

revoke all on function public.customer_order_create_v1(uuid, bigint, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_order_read_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_order_create_v1(uuid, bigint, uuid)
  to authenticated;
grant execute on function public.customer_order_read_v1(uuid)
  to authenticated;

comment on function public.customer_order_create_v1(uuid, bigint, uuid) is
  'Atomically creates one customer order from a confirmed quote; no client price, total, shop or owner input is accepted.';
comment on function public.customer_order_read_v1(uuid) is
  'Owner-only bounded read of the immutable customer order snapshot.';
comment on function app_private.storefront_fulfillment_slot_active_uses_v1(
  uuid, uuid, timestamptz
) is
  'Counts live checkout quotes and non-terminal customer orders without exposing capacity.';

notify pgrst, 'reload schema';

create or replace function app_private.customer_checkout_validate_v1(
  p_user_id uuid,
  p_shop_id uuid,
  p_cart_id uuid,
  p_cart_version bigint,
  p_fulfillment_mode text,
  p_address_id uuid,
  p_pickup_point_id uuid,
  p_slot_id uuid,
  p_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_setting public.storefront_settings%rowtype;
  v_slot public.storefront_fulfillment_slots%rowtype;
  v_zone public.storefront_delivery_zones%rowtype;
  v_address public.customer_addresses%rowtype;
  v_slot_uses bigint;
  v_item_count integer;
  v_invalid_count integer;
  v_subtotal bigint;
  v_items jsonb;
  v_changes jsonb;
  v_address_snapshot jsonb := null;
begin
  if p_user_id is null
    or p_shop_id is null
    or p_cart_id is null
    or p_cart_version is null
    or p_cart_version < 0
    or p_fulfillment_mode not in ('pickup', 'reservation', 'delivery')
    or p_slot_id is null
    or p_at is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select setting.* into v_setting
  from public.storefront_settings setting
  where setting.shop_id = p_shop_id
    and setting.storefront_enabled
  for share;
  if not found
    or (p_fulfillment_mode = 'pickup' and not v_setting.pickup_enabled)
    or (p_fulfillment_mode = 'reservation' and not v_setting.reservation_enabled)
    or (p_fulfillment_mode = 'delivery' and not v_setting.delivery_enabled) then
    return jsonb_build_object('status', 'mode_unavailable');
  end if;

  select slot.* into v_slot
  from public.storefront_fulfillment_slots slot
  where slot.shop_id = p_shop_id
    and slot.id = p_slot_id
    and slot.fulfillment_mode = p_fulfillment_mode
    and slot.enabled
    and slot.ends_at > p_at
    and slot.starts_at <= p_at + interval '14 days'
  for update;
  if not found then
    return jsonb_build_object('status', 'slot_unavailable');
  end if;

  if p_fulfillment_mode in ('pickup', 'reservation') then
    if p_address_id is not null
      or p_pickup_point_id is null
      or v_slot.pickup_point_id <> p_pickup_point_id then
      return jsonb_build_object('status', 'invalid_selection');
    end if;
    perform 1
    from public.storefront_pickup_points point
    where point.shop_id = p_shop_id
      and point.id = p_pickup_point_id
      and point.enabled
    for share;
    if not found then
      return jsonb_build_object('status', 'pickup_unavailable');
    end if;
  else
    if p_address_id is null
      or p_pickup_point_id is not null
      or v_slot.delivery_zone_id is null then
      return jsonb_build_object('status', 'invalid_selection');
    end if;
    select zone.* into v_zone
    from public.storefront_delivery_zones zone
    where zone.shop_id = p_shop_id
      and zone.id = v_slot.delivery_zone_id
      and zone.enabled
    for share;
    if not found then
      return jsonb_build_object('status', 'delivery_unavailable');
    end if;

    select address.* into v_address
    from public.customer_addresses address
    where address.user_id = p_user_id
      and address.id = p_address_id
      and address.country_code = 'CL'
    for share;
    if not found then
      return jsonb_build_object('status', 'invalid_address');
    end if;
    if lower(regexp_replace(v_address.region, '\s+', ' ', 'g'))
        <> lower(regexp_replace(v_zone.region, '\s+', ' ', 'g'))
      or not exists (
        select 1
        from public.storefront_delivery_zone_communes commune
        where commune.shop_id = p_shop_id
          and commune.zone_id = v_zone.id
          and lower(regexp_replace(commune.commune, '\s+', ' ', 'g'))
            = lower(regexp_replace(v_address.commune, '\s+', ' ', 'g'))
      ) then
      return jsonb_build_object('status', 'unsupported_zone');
    end if;
    v_address_snapshot := jsonb_build_object(
      'addressId', v_address.id,
      'recipientName', v_address.recipient_name,
      'addressLine1', v_address.address_line_1,
      'addressLine2', v_address.address_line_2,
      'commune', v_address.commune,
      'region', v_address.region,
      'postalCode', v_address.postal_code,
      'countryCode', v_address.country_code,
      'deliveryInstructions', v_address.delivery_instructions
    );
  end if;

  v_slot_uses := app_private.storefront_fulfillment_slot_active_uses_v1(
    v_slot.id,
    p_cart_id,
    p_at
  );
  if v_slot_uses >= v_slot.capacity then
    return jsonb_build_object('status', 'slot_unavailable');
  end if;

  perform product.id
  from public.customer_cart_items item
  join public.storefront_product_publications publication
    on publication.shop_id = item.shop_id
    and publication.id = item.publication_id
  join public.inventory_products product
    on product.id = publication.source_product_id
  where item.cart_id = p_cart_id
    and item.user_id = p_user_id
    and item.shop_id = p_shop_id
  order by product.id
  for update of product;

  with resolved as materialized (
    select
      item.id,
      item.publication_id,
      item.quantity,
      item.snapshot_price_clp,
      item.snapshot_promotion_id,
      source.publication_id as live_publication_id,
      source.public_name,
      source.price_clp,
      source.compare_at_price_clp,
      source.promotion_id,
      source.promotion_name,
      source.promotion_ends_at,
      source.pickup_enabled,
      source.delivery_enabled,
      source.reservation_enabled,
      source.availability_mode,
      product.id as source_product_id,
      product.stock_quantity,
      product.deleted_at,
      own_hold.id as hold_id,
      coalesce(own_hold.quantity, 0) as own_hold_quantity,
      case when product.id is null then 0::numeric else
        app_private.storefront_reservation_active_quantity_v1(product.id, p_at)
      end as active_hold_quantity
    from public.customer_cart_items item
    left join lateral app_private.storefront_catalog_source_v1(
      item.publication_id,
      p_shop_id,
      p_at
    ) source on true
    left join public.storefront_product_publications publication
      on publication.shop_id = item.shop_id
      and publication.id = item.publication_id
    left join public.inventory_products product
      on product.id = publication.source_product_id
    left join lateral (
      select hold.id, hold.quantity
      from public.customer_reservation_holds hold
      where hold.user_id = p_user_id
        and hold.shop_id = p_shop_id
        and hold.publication_id = item.publication_id
        and hold.status = 'active'
        and hold.expires_at > p_at
      order by hold.expires_at desc, hold.id
      limit 1
    ) own_hold on true
    where item.cart_id = p_cart_id
      and item.user_id = p_user_id
      and item.shop_id = p_shop_id
  ), evaluated as materialized (
    select
      resolved.*,
      (
        resolved.live_publication_id is not null
        and resolved.price_clp is not null
        and resolved.source_product_id is not null
        and resolved.deleted_at is null
        and resolved.stock_quantity is not null
        and resolved.stock_quantity not in (
          'Infinity'::double precision,
          '-Infinity'::double precision,
          'NaN'::double precision
        )
        and case p_fulfillment_mode
          when 'pickup' then resolved.pickup_enabled
          when 'reservation' then resolved.reservation_enabled
          when 'delivery' then resolved.delivery_enabled
          else false
        end
        and (
          resolved.own_hold_quantity >= resolved.quantity
          or (
            p_fulfillment_mode <> 'reservation'
            and resolved.availability_mode <> 'unavailable'
            and resolved.stock_quantity
              - resolved.active_hold_quantity::double precision
              >= resolved.quantity
          )
        )
      ) as eligible,
      case
        when resolved.live_publication_id is null then 'unavailable'
        when resolved.own_hold_quantity < resolved.quantity
          and p_fulfillment_mode = 'reservation' then 'hold_required'
        when resolved.availability_mode = 'unavailable'
          and resolved.own_hold_quantity < resolved.quantity then 'unavailable'
        when resolved.snapshot_price_clp <> resolved.price_clp then 'price_changed'
        when resolved.snapshot_promotion_id is distinct from resolved.promotion_id
          then 'promotion_changed'
        else 'none'
      end as change_type
    from resolved
  ), aggregated as (
    select
      count(*)::integer as item_count,
      count(*) filter (where evaluated.eligible is not true)::integer as invalid_count,
      coalesce(sum(
        evaluated.price_clp * evaluated.quantity
      ) filter (where evaluated.eligible), 0)::bigint as subtotal_clp,
      coalesce(jsonb_agg(jsonb_build_object(
        'publicationId', evaluated.publication_id,
        'publicName', evaluated.public_name,
        'quantity', evaluated.quantity,
        'unitPriceClp', evaluated.price_clp,
        'compareAtPriceClp', evaluated.compare_at_price_clp,
        'lineTotalClp', evaluated.price_clp * evaluated.quantity,
        'promotionId', evaluated.promotion_id,
        'promotionName', evaluated.promotion_name,
        'promotionEndsAt', evaluated.promotion_ends_at,
        'holdId', evaluated.hold_id
      ) order by evaluated.id) filter (where evaluated.eligible), '[]'::jsonb) as items,
      coalesce(jsonb_agg(jsonb_build_object(
        'publicationId', evaluated.publication_id,
        'type', evaluated.change_type,
        'previousPriceClp', evaluated.snapshot_price_clp,
        'currentPriceClp', evaluated.price_clp
      ) order by evaluated.id) filter (where evaluated.change_type <> 'none'), '[]'::jsonb) as changes
    from evaluated
  )
  select
    aggregated.item_count,
    aggregated.invalid_count,
    aggregated.subtotal_clp,
    aggregated.items,
    aggregated.changes
  into v_item_count, v_invalid_count, v_subtotal, v_items, v_changes
  from aggregated;

  if coalesce(v_item_count, 0) < 1 then
    return jsonb_build_object('status', 'cart_empty');
  end if;
  if coalesce(v_invalid_count, 0) > 0 then
    return jsonb_build_object(
      'status', 'cart_unavailable',
      'changes', coalesce(v_changes, '[]'::jsonb)
    );
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'subtotalClp', v_subtotal,
    'deliveryFeeClp', case
      when p_fulfillment_mode = 'delivery' then v_zone.fee_clp else 0 end,
    'totalClp', v_subtotal + case
      when p_fulfillment_mode = 'delivery' then v_zone.fee_clp else 0 end,
    'items', v_items,
    'changes', v_changes,
    'requiresReview', jsonb_array_length(v_changes) > 0,
    'addressSnapshot', v_address_snapshot,
    'deliveryZoneId', case
      when p_fulfillment_mode = 'delivery' then v_zone.id end
  );
end;
$$;

commit;
