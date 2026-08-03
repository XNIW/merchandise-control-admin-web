-- Storefront v1 / TASK-026 Admin control plane.
-- Fulfillment configuration remains shop-scoped, permission checked and audited.

begin;

create or replace function public.admin_storefront_fulfillment_read_v1(
  p_shop_id uuid,
  p_staff_id uuid default null,
  p_staff_web_session_id uuid default null,
  p_session_token_hash text default null,
  p_expected_credential_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_settings jsonb := 'null'::jsonb;
  v_points jsonb := '[]'::jsonb;
  v_zones jsonb := '[]'::jsonb;
  v_slots jsonb := '[]'::jsonb;
  v_audit jsonb := '[]'::jsonb;
  v_now timestamptz := statement_timestamp();
begin
  if p_shop_id is null then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id
    );
  end if;

  select jsonb_build_object(
    'storefrontEnabled', setting.storefront_enabled,
    'pickupEnabled', setting.pickup_enabled,
    'reservationEnabled', setting.reservation_enabled,
    'deliveryEnabled', setting.delivery_enabled,
    'currencyCode', setting.currency_code,
    'timeZone', setting.catalog_time_zone,
    'updatedAt', setting.updated_at
  ) into v_settings
  from public.storefront_settings setting
  where setting.shop_id = p_shop_id;
  if v_settings is null then
    return jsonb_build_object(
      'ok', false, 'code', 'not_found', 'shop_id', p_shop_id
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', point.id,
    'publicName', point.public_name,
    'addressLine1', point.address_line_1,
    'addressLine2', point.address_line_2,
    'commune', point.commune,
    'region', point.region,
    'publicInstructions', point.public_instructions,
    'enabled', point.enabled,
    'sortRank', point.sort_rank,
    'updatedAt', point.updated_at
  ) order by point.enabled desc, point.sort_rank, point.public_name, point.id), '[]'::jsonb)
  into v_points
  from public.storefront_pickup_points point
  where point.shop_id = p_shop_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', zone.id,
    'publicName', zone.public_name,
    'region', zone.region,
    'communes', coalesce((
      select jsonb_agg(commune.commune order by commune.commune)
      from public.storefront_delivery_zone_communes commune
      where commune.shop_id = zone.shop_id and commune.zone_id = zone.id
    ), '[]'::jsonb),
    'feeClp', zone.fee_clp,
    'enabled', zone.enabled,
    'sortRank', zone.sort_rank,
    'updatedAt', zone.updated_at
  ) order by zone.enabled desc, zone.sort_rank, zone.public_name, zone.id), '[]'::jsonb)
  into v_zones
  from public.storefront_delivery_zones zone
  where zone.shop_id = p_shop_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', slot.id,
    'mode', slot.fulfillment_mode,
    'pickupPointId', slot.pickup_point_id,
    'deliveryZoneId', slot.delivery_zone_id,
    'publicLabel', slot.public_label,
    'startsAt', slot.starts_at,
    'endsAt', slot.ends_at,
    'capacity', slot.capacity,
    'activeQuoteCount', (
      select count(*)::integer
      from public.customer_checkout_quotes quote
      where quote.slot_id = slot.id
        and quote.status in ('quoted', 'requires_review', 'confirmed')
        and quote.expires_at > v_now
    ),
    'enabled', slot.enabled,
    'updatedAt', slot.updated_at
  ) order by slot.starts_at, slot.id), '[]'::jsonb)
  into v_slots
  from public.storefront_fulfillment_slots slot
  where slot.shop_id = p_shop_id;

  if app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.audit.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', audit.audit_log_id,
      'eventKey', audit.event_key,
      'result', audit.result,
      'targetId', audit.target_id,
      'actorKind', case when audit.actor_staff_id is not null
        then 'pos_staff_manager' when audit.actor_profile_id is not null
        then 'personal_account' else 'system' end,
      'createdAt', audit.created_at,
      'before', audit.metadata_redacted->'before',
      'after', audit.metadata_redacted->'after',
      'updatedCount', 1
    ) order by audit.created_at desc, audit.audit_log_id desc), '[]'::jsonb)
    into v_audit
    from (
      select audit.*
      from public.audit_logs audit
      where audit.shop_id = p_shop_id
        and audit.event_key like 'shop.storefront.fulfillment.%'
      order by audit.created_at desc, audit.audit_log_id desc
      limit 100
    ) audit;
  end if;

  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    raise exception 'Storefront Admin authorization expired before fulfillment read'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'shop_id', p_shop_id,
    'settings', v_settings,
    'pickupPoints', v_points,
    'deliveryZones', v_zones,
    'slots', v_slots,
    'audit', v_audit
  );
exception
  when insufficient_privilege then
    return jsonb_build_object(
      'ok', false, 'code', 'session_expired', 'shop_id', p_shop_id
    );
end;
$$;

create or replace function public.admin_storefront_fulfillment_mutate_v1(
  p_shop_id uuid,
  p_operation text,
  p_payload jsonb,
  p_staff_id uuid default null,
  p_staff_web_session_id uuid default null,
  p_session_token_hash text default null,
  p_expected_credential_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_actor_staff_id uuid;
  v_actor_profile_id uuid;
  v_target_id uuid;
  v_before jsonb := 'null'::jsonb;
  v_after jsonb := 'null'::jsonb;
  v_audit_id uuid;
  v_enabled boolean;
  v_pickup_enabled boolean;
  v_reservation_enabled boolean;
  v_delivery_enabled boolean;
  v_public_name text;
  v_address_line_1 text;
  v_address_line_2 text;
  v_commune text;
  v_region text;
  v_instructions text;
  v_sort_rank bigint;
  v_fee_clp bigint;
  v_communes text[];
  v_mode text;
  v_pickup_point_id uuid;
  v_delivery_zone_id uuid;
  v_label text;
  v_time_zone text;
  v_starts_at_text text;
  v_ends_at_text text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_capacity integer;
  v_now timestamptz := statement_timestamp();
begin
  if p_shop_id is null
    or p_operation not in (
      'settings_upsert', 'pickup_upsert', 'zone_upsert', 'slot_upsert'
    )
    or jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
    or pg_column_size(p_payload) > 131072 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.settings.manage', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id
    );
  end if;
  v_actor_staff_id := case when auth.role() = 'service_role' then p_staff_id end;
  v_actor_profile_id := case when auth.role() = 'authenticated' then auth.uid() end;

  begin
    if p_operation = 'settings_upsert' then
      v_pickup_enabled := coalesce((p_payload->>'pickupEnabled')::boolean, false);
      v_reservation_enabled := coalesce(
        (p_payload->>'reservationEnabled')::boolean,
        false
      );
      v_delivery_enabled := coalesce((p_payload->>'deliveryEnabled')::boolean, false);
      if v_pickup_enabled and not exists (
        select 1
        from public.storefront_fulfillment_slots slot
        join public.storefront_pickup_points point
          on point.shop_id = slot.shop_id and point.id = slot.pickup_point_id
        where slot.shop_id = p_shop_id
          and slot.fulfillment_mode = 'pickup'
          and slot.enabled and point.enabled and slot.ends_at > v_now
      ) then
        return jsonb_build_object(
          'ok', false, 'code', 'pickup_configuration_required',
          'shop_id', p_shop_id
        );
      end if;
      if v_reservation_enabled and not exists (
        select 1
        from public.storefront_fulfillment_slots slot
        join public.storefront_pickup_points point
          on point.shop_id = slot.shop_id and point.id = slot.pickup_point_id
        where slot.shop_id = p_shop_id
          and slot.fulfillment_mode = 'reservation'
          and slot.enabled and point.enabled and slot.ends_at > v_now
      ) then
        return jsonb_build_object(
          'ok', false, 'code', 'reservation_configuration_required',
          'shop_id', p_shop_id
        );
      end if;
      if v_delivery_enabled and not exists (
        select 1
        from public.storefront_fulfillment_slots slot
        join public.storefront_delivery_zones zone
          on zone.shop_id = slot.shop_id and zone.id = slot.delivery_zone_id
        where slot.shop_id = p_shop_id
          and slot.fulfillment_mode = 'delivery'
          and slot.enabled and zone.enabled and slot.ends_at > v_now
          and exists (
            select 1 from public.storefront_delivery_zone_communes commune
            where commune.shop_id = zone.shop_id and commune.zone_id = zone.id
          )
      ) then
        return jsonb_build_object(
          'ok', false, 'code', 'delivery_configuration_required',
          'shop_id', p_shop_id
        );
      end if;
      select jsonb_build_object(
        'pickupEnabled', setting.pickup_enabled,
        'reservationEnabled', setting.reservation_enabled,
        'deliveryEnabled', setting.delivery_enabled
      ) into v_before
      from public.storefront_settings setting
      where setting.shop_id = p_shop_id
      for update;
      if not found then
        return jsonb_build_object(
          'ok', false, 'code', 'not_found', 'shop_id', p_shop_id
        );
      end if;
      update public.storefront_settings setting
      set pickup_enabled = v_pickup_enabled,
          reservation_enabled = v_reservation_enabled,
          delivery_enabled = v_delivery_enabled,
          updated_by_profile_id = v_actor_profile_id
      where setting.shop_id = p_shop_id;
      v_target_id := p_shop_id;
      v_after := jsonb_build_object(
        'pickupEnabled', v_pickup_enabled,
        'reservationEnabled', v_reservation_enabled,
        'deliveryEnabled', v_delivery_enabled
      );
    elsif p_operation = 'pickup_upsert' then
      v_target_id := nullif(p_payload->>'id', '')::uuid;
      v_public_name := regexp_replace(
        btrim(coalesce(p_payload->>'publicName', '')), '\s+', ' ', 'g'
      );
      v_address_line_1 := regexp_replace(
        btrim(coalesce(p_payload->>'addressLine1', '')), '\s+', ' ', 'g'
      );
      v_address_line_2 := nullif(regexp_replace(
        btrim(coalesce(p_payload->>'addressLine2', '')), '\s+', ' ', 'g'
      ), '');
      v_commune := regexp_replace(
        btrim(coalesce(p_payload->>'commune', '')), '\s+', ' ', 'g'
      );
      v_region := regexp_replace(
        btrim(coalesce(p_payload->>'region', '')), '\s+', ' ', 'g'
      );
      v_instructions := nullif(btrim(coalesce(
        p_payload->>'publicInstructions', ''
      )), '');
      v_enabled := coalesce((p_payload->>'enabled')::boolean, false);
      v_sort_rank := coalesce(nullif(p_payload->>'sortRank', '')::bigint, 0);
      if length(v_public_name) not between 1 and 120
        or length(v_address_line_1) not between 1 and 200
        or coalesce(length(v_address_line_2), 0) > 200
        or length(v_commune) not between 1 and 100
        or length(v_region) not between 1 and 100
        or coalesce(length(v_instructions), 0) > 500 then
        return jsonb_build_object(
          'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
        );
      end if;
      if v_target_id is not null then
        select jsonb_build_object(
          'id', point.id, 'publicName', point.public_name,
          'enabled', point.enabled, 'sortRank', point.sort_rank
        ) into v_before
        from public.storefront_pickup_points point
        where point.shop_id = p_shop_id and point.id = v_target_id
        for update;
        if not found then
          return jsonb_build_object(
            'ok', false, 'code', 'not_found', 'shop_id', p_shop_id
          );
        end if;
        if not v_enabled and exists (
          select 1 from public.customer_checkout_quotes quote
          where quote.pickup_point_id = v_target_id
            and quote.status in ('quoted', 'requires_review', 'confirmed')
            and quote.expires_at > v_now
        ) then
          return jsonb_build_object(
            'ok', false, 'code', 'active_checkout_conflict',
            'shop_id', p_shop_id
          );
        end if;
        update public.storefront_pickup_points point
        set public_name = v_public_name,
            address_line_1 = v_address_line_1,
            address_line_2 = v_address_line_2,
            commune = v_commune,
            region = v_region,
            public_instructions = v_instructions,
            enabled = v_enabled,
            sort_rank = v_sort_rank,
            updated_by_profile_id = v_actor_profile_id
        where point.shop_id = p_shop_id and point.id = v_target_id;
      else
        insert into public.storefront_pickup_points(
          shop_id, public_name, address_line_1, address_line_2,
          commune, region, public_instructions, enabled, sort_rank,
          updated_by_profile_id
        ) values (
          p_shop_id, v_public_name, v_address_line_1, v_address_line_2,
          v_commune, v_region, v_instructions, v_enabled, v_sort_rank,
          v_actor_profile_id
        ) returning id into v_target_id;
      end if;
      select jsonb_build_object(
        'id', point.id, 'publicName', point.public_name,
        'enabled', point.enabled, 'sortRank', point.sort_rank
      ) into v_after
      from public.storefront_pickup_points point
      where point.id = v_target_id;
    elsif p_operation = 'zone_upsert' then
      v_target_id := nullif(p_payload->>'id', '')::uuid;
      v_public_name := regexp_replace(
        btrim(coalesce(p_payload->>'publicName', '')), '\s+', ' ', 'g'
      );
      v_region := regexp_replace(
        btrim(coalesce(p_payload->>'region', '')), '\s+', ' ', 'g'
      );
      v_fee_clp := (p_payload->>'feeClp')::bigint;
      v_enabled := coalesce((p_payload->>'enabled')::boolean, false);
      v_sort_rank := coalesce(nullif(p_payload->>'sortRank', '')::bigint, 0);
      select array_agg(regexp_replace(btrim(value), '\s+', ' ', 'g') order by ordinality)
      into v_communes
      from jsonb_array_elements_text(p_payload->'communes')
        with ordinality entries(value, ordinality);
      if length(v_public_name) not between 1 and 120
        or length(v_region) not between 1 and 100
        or v_fee_clp not between 0 and 999999999999
        or coalesce(cardinality(v_communes), 0) not between 1 and 100
        or exists (
          select 1 from unnest(v_communes) commune
          where length(commune) not between 1 and 100
            or commune ~ '[[:cntrl:]]'
        )
        or cardinality(v_communes) <> (
          select count(distinct lower(commune))::integer from unnest(v_communes) commune
        ) then
        return jsonb_build_object(
          'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
        );
      end if;
      if v_target_id is not null then
        select jsonb_build_object(
          'id', zone.id, 'publicName', zone.public_name,
          'feeClp', zone.fee_clp, 'enabled', zone.enabled,
          'communes', coalesce((
            select jsonb_agg(commune.commune order by commune.commune)
            from public.storefront_delivery_zone_communes commune
            where commune.shop_id = zone.shop_id and commune.zone_id = zone.id
          ), '[]'::jsonb)
        ) into v_before
        from public.storefront_delivery_zones zone
        where zone.shop_id = p_shop_id and zone.id = v_target_id
        for update;
        if not found then
          return jsonb_build_object(
            'ok', false, 'code', 'not_found', 'shop_id', p_shop_id
          );
        end if;
        if not v_enabled and exists (
          select 1 from public.customer_checkout_quotes quote
          where quote.delivery_zone_id = v_target_id
            and quote.status in ('quoted', 'requires_review', 'confirmed')
            and quote.expires_at > v_now
        ) then
          return jsonb_build_object(
            'ok', false, 'code', 'active_checkout_conflict',
            'shop_id', p_shop_id
          );
        end if;
        update public.storefront_delivery_zones zone
        set public_name = v_public_name,
            region = v_region,
            fee_clp = v_fee_clp,
            enabled = v_enabled,
            sort_rank = v_sort_rank,
            updated_by_profile_id = v_actor_profile_id
        where zone.shop_id = p_shop_id and zone.id = v_target_id;
        delete from public.storefront_delivery_zone_communes commune
        where commune.shop_id = p_shop_id and commune.zone_id = v_target_id;
      else
        insert into public.storefront_delivery_zones(
          shop_id, public_name, region, fee_clp, enabled, sort_rank,
          updated_by_profile_id
        ) values (
          p_shop_id, v_public_name, v_region, v_fee_clp, v_enabled, v_sort_rank,
          v_actor_profile_id
        ) returning id into v_target_id;
      end if;
      insert into public.storefront_delivery_zone_communes(shop_id, zone_id, commune)
      select p_shop_id, v_target_id, commune
      from unnest(v_communes) commune;
      select jsonb_build_object(
        'id', zone.id, 'publicName', zone.public_name,
        'feeClp', zone.fee_clp, 'enabled', zone.enabled,
        'communes', (
          select jsonb_agg(commune.commune order by commune.commune)
          from public.storefront_delivery_zone_communes commune
          where commune.shop_id = zone.shop_id and commune.zone_id = zone.id
        )
      ) into v_after
      from public.storefront_delivery_zones zone
      where zone.id = v_target_id;
    else
      v_target_id := nullif(p_payload->>'id', '')::uuid;
      v_mode := p_payload->>'mode';
      v_pickup_point_id := nullif(p_payload->>'pickupPointId', '')::uuid;
      v_delivery_zone_id := nullif(p_payload->>'deliveryZoneId', '')::uuid;
      v_label := regexp_replace(
        btrim(coalesce(p_payload->>'publicLabel', '')), '\s+', ' ', 'g'
      );
      v_time_zone := coalesce(
        nullif(p_payload->>'timeZone', ''),
        'America/Santiago'
      );
      v_starts_at_text := nullif(p_payload->>'startsAt', '');
      v_ends_at_text := nullif(p_payload->>'endsAt', '');
      if v_time_zone not in ('America/Santiago', 'UTC')
        or v_starts_at_text is null
        or v_ends_at_text is null then
        return jsonb_build_object(
          'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
        );
      end if;
      v_starts_at := case
        when v_starts_at_text ~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
          then v_starts_at_text::timestamptz
        else v_starts_at_text::timestamp at time zone v_time_zone
      end;
      v_ends_at := case
        when v_ends_at_text ~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
          then v_ends_at_text::timestamptz
        else v_ends_at_text::timestamp at time zone v_time_zone
      end;
      v_capacity := (p_payload->>'capacity')::integer;
      v_enabled := coalesce((p_payload->>'enabled')::boolean, false);
      if v_mode not in ('pickup', 'reservation', 'delivery')
        or length(v_label) not between 1 and 120
        or v_starts_at >= v_ends_at
        or v_ends_at > v_starts_at + interval '24 hours'
        or v_starts_at < v_now - interval '1 day'
        or v_starts_at > v_now + interval '90 days'
        or v_capacity not between 1 and 1000
        or (v_mode in ('pickup', 'reservation') and (
          v_pickup_point_id is null or v_delivery_zone_id is not null
        ))
        or (v_mode = 'delivery' and (
          v_pickup_point_id is not null or v_delivery_zone_id is null
        )) then
        return jsonb_build_object(
          'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
        );
      end if;
      if v_enabled and (
        (v_mode in ('pickup', 'reservation') and not exists (
          select 1 from public.storefront_pickup_points point
          where point.shop_id = p_shop_id
            and point.id = v_pickup_point_id and point.enabled
        ))
        or (v_mode = 'delivery' and not exists (
          select 1 from public.storefront_delivery_zones zone
          where zone.shop_id = p_shop_id
            and zone.id = v_delivery_zone_id and zone.enabled
        ))
      ) then
        return jsonb_build_object(
          'ok', false, 'code', 'parent_configuration_required',
          'shop_id', p_shop_id
        );
      end if;
      if v_target_id is not null then
        select jsonb_build_object(
          'id', slot.id, 'mode', slot.fulfillment_mode,
          'startsAt', slot.starts_at, 'endsAt', slot.ends_at,
          'capacity', slot.capacity, 'enabled', slot.enabled
        ) into v_before
        from public.storefront_fulfillment_slots slot
        where slot.shop_id = p_shop_id and slot.id = v_target_id
        for update;
        if not found then
          return jsonb_build_object(
            'ok', false, 'code', 'not_found', 'shop_id', p_shop_id
          );
        end if;
        if exists (
          select 1 from public.customer_checkout_quotes quote
          where quote.slot_id = v_target_id
            and quote.status in ('quoted', 'requires_review', 'confirmed')
            and quote.expires_at > v_now
        ) then
          return jsonb_build_object(
            'ok', false, 'code', 'active_checkout_conflict',
            'shop_id', p_shop_id
          );
        end if;
        update public.storefront_fulfillment_slots slot
        set fulfillment_mode = v_mode,
            pickup_point_id = v_pickup_point_id,
            delivery_zone_id = v_delivery_zone_id,
            public_label = v_label,
            starts_at = v_starts_at,
            ends_at = v_ends_at,
            capacity = v_capacity,
            enabled = v_enabled,
            updated_by_profile_id = v_actor_profile_id
        where slot.shop_id = p_shop_id and slot.id = v_target_id;
      else
        insert into public.storefront_fulfillment_slots(
          shop_id, fulfillment_mode, pickup_point_id, delivery_zone_id,
          public_label, starts_at, ends_at, capacity, enabled,
          updated_by_profile_id
        ) values (
          p_shop_id, v_mode, v_pickup_point_id, v_delivery_zone_id,
          v_label, v_starts_at, v_ends_at, v_capacity, v_enabled,
          v_actor_profile_id
        ) returning id into v_target_id;
      end if;
      select jsonb_build_object(
        'id', slot.id, 'mode', slot.fulfillment_mode,
        'startsAt', slot.starts_at, 'endsAt', slot.ends_at,
        'capacity', slot.capacity, 'enabled', slot.enabled
      ) into v_after
      from public.storefront_fulfillment_slots slot
      where slot.id = v_target_id;
    end if;

    if not app_private.storefront_admin_authorized_v1(
      p_shop_id, 'storefront.settings.manage', p_staff_id, p_staff_web_session_id,
      p_session_token_hash, p_expected_credential_version
    ) then
      raise exception 'Storefront Admin authorization expired before fulfillment mutation'
        using errcode = '42501';
    end if;

    insert into public.audit_logs(
      actor_profile_id, actor_staff_id, scope, shop_id, event_key,
      severity, result, target_type, target_id, metadata_redacted
    ) values (
      v_actor_profile_id,
      v_actor_staff_id,
      'shop',
      p_shop_id,
      'shop.storefront.fulfillment.' || p_operation || '.success',
      'info',
      'success',
      'storefront_fulfillment',
      v_target_id::text,
      jsonb_build_object(
        'code', 'success',
        'source', 'storefront_admin',
        'operation', p_operation,
        'before', coalesce(v_before, 'null'::jsonb),
        'after', coalesce(v_after, 'null'::jsonb)
      )
    ) returning audit_log_id into v_audit_id;

    return jsonb_build_object(
      'ok', true,
      'code', 'success',
      'shop_id', p_shop_id,
      'target_id', v_target_id,
      'audit_event_id', v_audit_id
    );
  exception
    when invalid_text_representation or numeric_value_out_of_range
      or check_violation or foreign_key_violation or not_null_violation
      or invalid_datetime_format then
      return jsonb_build_object(
        'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
      );
    when unique_violation then
      return jsonb_build_object(
        'ok', false, 'code', 'conflict', 'shop_id', p_shop_id
      );
    when insufficient_privilege then
      return jsonb_build_object(
        'ok', false, 'code', 'session_expired', 'shop_id', p_shop_id
      );
  end;
end;
$$;

revoke all on function public.admin_storefront_fulfillment_read_v1(
  uuid, uuid, uuid, text, integer
) from public, anon;
revoke all on function public.admin_storefront_fulfillment_mutate_v1(
  uuid, text, jsonb, uuid, uuid, text, integer
) from public, anon;
grant execute on function public.admin_storefront_fulfillment_read_v1(
  uuid, uuid, uuid, text, integer
) to authenticated, service_role;
grant execute on function public.admin_storefront_fulfillment_mutate_v1(
  uuid, text, jsonb, uuid, uuid, text, integer
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
