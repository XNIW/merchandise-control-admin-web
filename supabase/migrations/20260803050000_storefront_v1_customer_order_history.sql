-- Storefront v1 / TASK-028
--
-- Owner-scoped order history, deterministic keyset pagination, append-only
-- timeline and an explicitly enabled, bounded, idempotent customer cancellation.
-- Cancellation remains fail-closed for every existing shop.

begin;

alter table public.storefront_settings
  add column if not exists customer_order_cancellation_enabled boolean
    not null default false,
  add column if not exists customer_order_cancellation_window_minutes integer
    not null default 15;

alter table public.storefront_settings
  drop constraint if exists storefront_settings_customer_order_cancellation_window_check;
alter table public.storefront_settings
  add constraint storefront_settings_customer_order_cancellation_window_check check (
    customer_order_cancellation_window_minutes between 0 and 1440
  );

alter table public.customer_order_mutations
  drop constraint if exists customer_order_mutations_operation_check;
alter table public.customer_order_mutations
  add constraint customer_order_mutations_operation_check check (
    operation in ('create', 'cancel')
  );

alter table public.customer_order_outbox
  drop constraint if exists customer_order_outbox_event_check;
alter table public.customer_order_outbox
  add constraint customer_order_outbox_event_check check (
    event_type in (
      'customer_order.confirmed.v1',
      'customer_order.cancelled.v1'
    )
  );

create index if not exists customer_orders_owner_shop_history_idx
  on public.customer_orders(user_id, shop_id, placed_at desc, id desc)
  where user_id is not null;

create or replace function app_private.customer_order_detail_payload_v1(
  p_order_id uuid,
  p_status text,
  p_idempotent boolean,
  p_at timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'apiVersion', 'customer-order-detail.v1',
    'status', p_status,
    'idempotent', p_idempotent,
    'orderId', customer_order.id,
    'orderCode', customer_order.public_order_code,
    'orderStatus', customer_order.status,
    'orderVersion', customer_order.status_version,
    'shopSlug', setting.public_slug,
    'fulfillmentMode', customer_order.fulfillment_mode,
    'fulfillment', customer_order.fulfillment_snapshot,
    'currencyCode', customer_order.currency_code,
    'subtotalClp', customer_order.subtotal_clp,
    'deliveryFeeClp', customer_order.delivery_fee_clp,
    'totalClp', customer_order.total_clp,
    'items', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(
        pg_catalog.jsonb_build_object(
          'publicationId', item.publication_id,
          'publicName', item.public_name,
          'quantity', item.quantity,
          'unitPriceClp', item.unit_price_clp,
          'compareAtPriceClp', item.compare_at_price_clp,
          'lineTotalClp', item.line_total_clp,
          'promotionName', item.promotion_name,
          'promotionEndsAt', item.promotion_ends_at
        )
      ) order by item.line_position)
      from public.customer_order_items item
      where item.order_id = customer_order.id
    ), '[]'::jsonb),
    'timeline', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'eventVersion', event.event_version,
        'status', event.status,
        'actorKind', event.actor_kind,
        'createdAt', event.created_at
      ) order by event.event_version)
      from public.customer_order_status_events event
      where event.order_id = customer_order.id
    ), '[]'::jsonb),
    'cancellation', pg_catalog.jsonb_build_object(
      'enabled', setting.customer_order_cancellation_enabled,
      'allowed', (
        setting.customer_order_cancellation_enabled
        and customer_order.status = 'confirmed'
        and p_at < least(
          customer_order.placed_at + pg_catalog.make_interval(
            mins => setting.customer_order_cancellation_window_minutes
          ),
          slot.starts_at
        )
      ),
      'deadline', least(
        customer_order.placed_at + pg_catalog.make_interval(
          mins => setting.customer_order_cancellation_window_minutes
        ),
        slot.starts_at
      )
    ),
    'placedAt', customer_order.placed_at,
    'updatedAt', customer_order.updated_at,
    'serverTime', p_at
  ))
  from public.customer_orders customer_order
  join public.storefront_settings setting
    on setting.shop_id = customer_order.shop_id
  join public.storefront_fulfillment_slots slot
    on slot.shop_id = customer_order.shop_id
   and slot.id = customer_order.slot_id
  where customer_order.id = p_order_id;
$$;

create or replace function app_private.customer_order_history_error_v1(
  p_api_version text,
  p_status text,
  p_idempotent boolean,
  p_at timestamptz,
  p_order_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'apiVersion', p_api_version,
    'status', p_status,
    'idempotent', p_idempotent,
    'orderId', p_order_id,
    'serverTime', p_at
  ));
$$;

create or replace function public.customer_order_list_v1(
  p_shop_slug text,
  p_limit integer default 20,
  p_before_placed_at timestamptz default null,
  p_before_order_id uuid default null
)
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
  v_shop_id uuid;
  v_orders jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor jsonb;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_shop_slug is null
    or p_shop_slug <> lower(btrim(p_shop_slug))
    or p_shop_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$'
    or p_limit is null
    or p_limit not between 1 and 50
    or ((p_before_placed_at is null) <> (p_before_order_id is null))
    or (
      p_before_placed_at is not null
      and not pg_catalog.isfinite(p_before_placed_at)
    ) then
    return pg_catalog.jsonb_build_object(
      'apiVersion', 'customer-order-list.v1',
      'status', 'invalid',
      'orders', '[]'::jsonb,
      'hasMore', false,
      'serverTime', v_now
    );
  end if;

  select setting.shop_id into v_shop_id
  from public.storefront_settings setting
  where setting.public_slug = p_shop_slug;
  if not found then
    return pg_catalog.jsonb_build_object(
      'apiVersion', 'customer-order-list.v1',
      'status', 'unavailable',
      'orders', '[]'::jsonb,
      'hasMore', false,
      'serverTime', v_now
    );
  end if;

  with page as materialized (
    select
      customer_order.id,
      customer_order.public_order_code,
      customer_order.status,
      customer_order.status_version,
      customer_order.fulfillment_mode,
      customer_order.currency_code,
      customer_order.total_clp,
      customer_order.placed_at,
      customer_order.updated_at,
      setting.customer_order_cancellation_enabled,
      setting.customer_order_cancellation_window_minutes,
      slot.starts_at,
      (select count(*)::integer
       from public.customer_order_items item
       where item.order_id = customer_order.id) as item_count,
      (select item.public_name
       from public.customer_order_items item
       where item.order_id = customer_order.id
       order by item.line_position
       limit 1) as primary_item_name
    from public.customer_orders customer_order
    join public.storefront_settings setting
      on setting.shop_id = customer_order.shop_id
    join public.storefront_fulfillment_slots slot
      on slot.shop_id = customer_order.shop_id
     and slot.id = customer_order.slot_id
    where customer_order.user_id = v_user_id
      and customer_order.shop_id = v_shop_id
      and (
        p_before_placed_at is null
        or (customer_order.placed_at, customer_order.id)
          < (p_before_placed_at, p_before_order_id)
      )
    order by customer_order.placed_at desc, customer_order.id desc
    limit p_limit + 1
  ), visible as (
    select * from page
    order by placed_at desc, id desc
    limit p_limit
  )
  select
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'orderId', visible.id,
      'orderCode', visible.public_order_code,
      'orderStatus', visible.status,
      'orderVersion', visible.status_version,
      'fulfillmentMode', visible.fulfillment_mode,
      'currencyCode', visible.currency_code,
      'totalClp', visible.total_clp,
      'itemCount', visible.item_count,
      'primaryItemName', visible.primary_item_name,
      'cancellationAllowed', (
        visible.customer_order_cancellation_enabled
        and visible.status = 'confirmed'
        and v_now < least(
          visible.placed_at + pg_catalog.make_interval(
            mins => visible.customer_order_cancellation_window_minutes
          ),
          visible.starts_at
        )
      ),
      'placedAt', visible.placed_at,
      'updatedAt', visible.updated_at
    ) order by visible.placed_at desc, visible.id desc), '[]'::jsonb),
    (select count(*) > p_limit from page),
    (
      select pg_catalog.jsonb_build_object(
        'beforePlacedAt', tail.placed_at,
        'beforeOrderId', tail.id
      )
      from visible tail
      order by tail.placed_at asc, tail.id asc
      limit 1
    )
  into v_orders, v_has_more, v_next_cursor
  from visible;

  return pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'apiVersion', 'customer-order-list.v1',
    'status', 'ok',
    'shopSlug', p_shop_slug,
    'orders', v_orders,
    'hasMore', v_has_more,
    'nextCursor', case when v_has_more then v_next_cursor end,
    'serverTime', v_now
  ));
end;
$$;

create or replace function public.customer_order_detail_v1(
  p_shop_slug text,
  p_order_id uuid
)
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
  if p_shop_slug is null
    or p_shop_slug <> lower(btrim(p_shop_slug))
    or p_shop_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$'
    or p_order_id is null then
    return app_private.customer_order_history_error_v1(
      'customer-order-detail.v1', 'invalid', true, v_now
    );
  end if;

  select customer_order.id into v_order_id
  from public.customer_orders customer_order
  join public.storefront_settings setting
    on setting.shop_id = customer_order.shop_id
  where customer_order.id = p_order_id
    and customer_order.user_id = v_user_id
    and setting.public_slug = p_shop_slug;
  if not found then
    return app_private.customer_order_history_error_v1(
      'customer-order-detail.v1', 'not_found', true, v_now
    );
  end if;
  return app_private.customer_order_detail_payload_v1(
    v_order_id, 'ok', true, v_now
  );
end;
$$;

create or replace function public.customer_order_cancel_v1(
  p_shop_slug text,
  p_order_id uuid,
  p_expected_status_version bigint,
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
  v_order public.customer_orders%rowtype;
  v_setting public.storefront_settings%rowtype;
  v_previous public.customer_order_mutations%rowtype;
  v_slot_starts_at timestamptz;
  v_deadline timestamptz;
  v_request_sha256 text;
  v_result jsonb;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_shop_slug is null
    or p_shop_slug <> lower(btrim(p_shop_slug))
    or p_shop_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$'
    or p_order_id is null
    or p_expected_status_version is null
    or p_expected_status_version < 1
    or p_idempotency_key is null then
    return app_private.customer_order_history_error_v1(
      'customer-order-detail.v1', 'invalid', false, v_now, p_order_id
    );
  end if;

  select customer_order.* into v_order
  from public.customer_orders customer_order
  join public.storefront_settings setting
    on setting.shop_id = customer_order.shop_id
  where customer_order.id = p_order_id
    and customer_order.user_id = v_user_id
    and setting.public_slug = p_shop_slug;
  if not found then
    return app_private.customer_order_history_error_v1(
      'customer-order-detail.v1', 'not_found', false, v_now
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer-order-cancel:' || v_order.id::text,
    28028
  ));

  select customer_order.* into v_order
  from public.customer_orders customer_order
  join public.storefront_settings setting
    on setting.shop_id = customer_order.shop_id
  where customer_order.id = p_order_id
    and customer_order.user_id = v_user_id
    and setting.public_slug = p_shop_slug
  for update;
  if not found then
    return app_private.customer_order_history_error_v1(
      'customer-order-detail.v1', 'not_found', false, v_now
    );
  end if;

  v_request_sha256 := pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(pg_catalog.jsonb_build_array(
      'cancel-order', p_order_id, p_expected_status_version
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  delete from public.customer_order_mutations mutation
  where mutation.user_id = v_user_id
    and mutation.shop_id = v_order.shop_id
    and mutation.retained_until <= v_now;

  select mutation.* into v_previous
  from public.customer_order_mutations mutation
  where mutation.user_id = v_user_id
    and mutation.shop_id = v_order.shop_id
    and mutation.idempotency_key = p_idempotency_key;
  if found then
    if v_previous.operation <> 'cancel'
      or v_previous.request_sha256 <> v_request_sha256
      or v_previous.order_id is distinct from v_order.id then
      return app_private.customer_order_history_error_v1(
        'customer-order-detail.v1', 'idempotency_conflict', false,
        v_now, v_previous.order_id
      );
    end if;
    return pg_catalog.jsonb_set(
      v_previous.response_payload,
      '{idempotent}',
      'true'::jsonb
    );
  end if;

  select setting.*
  into v_setting
  from public.storefront_settings setting
  join public.storefront_fulfillment_slots slot
    on slot.shop_id = setting.shop_id
   and slot.id = v_order.slot_id
  where setting.shop_id = v_order.shop_id;
  if not found or not v_setting.customer_order_cancellation_enabled then
    return app_private.customer_order_history_error_v1(
      'customer-order-detail.v1', 'not_cancellable', false,
      v_now, v_order.id
    );
  end if;

  select slot.starts_at into strict v_slot_starts_at
  from public.storefront_fulfillment_slots slot
  where slot.shop_id = v_order.shop_id
    and slot.id = v_order.slot_id;

  v_deadline := least(
    v_order.placed_at + pg_catalog.make_interval(
      mins => v_setting.customer_order_cancellation_window_minutes
    ),
    v_slot_starts_at
  );
  if v_order.status <> 'confirmed' or v_now >= v_deadline then
    return app_private.customer_order_history_error_v1(
      'customer-order-detail.v1', 'not_cancellable', false,
      v_now, v_order.id
    );
  end if;
  if v_order.status_version <> p_expected_status_version then
    return app_private.customer_order_history_error_v1(
      'customer-order-detail.v1', 'version_conflict', false,
      v_now, v_order.id
    );
  end if;

  update public.customer_orders customer_order
  set status = 'cancelled',
      status_version = customer_order.status_version + 1,
      updated_at = v_now
  where customer_order.id = v_order.id
    and customer_order.user_id = v_user_id
    and customer_order.status = 'confirmed'
    and customer_order.status_version = p_expected_status_version;
  if not found then
    return app_private.customer_order_history_error_v1(
      'customer-order-detail.v1', 'version_conflict', false,
      v_now, v_order.id
    );
  end if;

  insert into public.customer_order_status_events(
    order_id, shop_id, event_version, status, actor_kind,
    metadata_redacted, created_at
  ) values (
    v_order.id, v_order.shop_id, v_order.status_version + 1,
    'cancelled', 'customer',
    pg_catalog.jsonb_build_object('source', 'customer_request'), v_now
  );

  insert into public.customer_order_outbox(
    order_id, shop_id, event_type, idempotency_key, payload,
    status, available_at, created_at, updated_at
  ) values (
    v_order.id,
    v_order.shop_id,
    'customer_order.cancelled.v1',
    p_idempotency_key,
    pg_catalog.jsonb_build_object(
      'apiVersion', 'customer-order-outbox.v1',
      'eventType', 'customer_order.cancelled.v1',
      'documentKind', 'customer_order',
      'fiscalStatus', 'not_created',
      'orderId', v_order.id,
      'orderCode', v_order.public_order_code,
      'shopId', v_order.shop_id,
      'idempotencyKey', p_idempotency_key,
      'statusVersion', v_order.status_version + 1,
      'cancelledAt', v_now
    ),
    'pending', v_now, v_now, v_now
  );

  perform app_private.storefront_reservation_refresh_availability_v1(
    affected.source_product_id,
    v_now
  )
  from (
    select distinct item.source_product_id
    from public.customer_order_items item
    where item.order_id = v_order.id
  ) affected;

  v_result := app_private.customer_order_detail_payload_v1(
    v_order.id, 'ok', false, v_now
  );
  insert into public.customer_order_mutations(
    user_id, shop_id, order_id, idempotency_key, operation,
    request_sha256, response_payload
  ) values (
    v_user_id, v_order.shop_id, v_order.id, p_idempotency_key, 'cancel',
    v_request_sha256, v_result
  );
  return v_result;
end;
$$;

revoke all on function app_private.customer_order_detail_payload_v1(
  uuid, text, boolean, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function app_private.customer_order_history_error_v1(
  text, text, boolean, timestamptz, uuid
) from public, anon, authenticated, service_role;

revoke all on function public.customer_order_list_v1(
  text, integer, timestamptz, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.customer_order_detail_v1(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_order_cancel_v1(text, uuid, bigint, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.customer_order_list_v1(
  text, integer, timestamptz, uuid
) to authenticated;
grant execute on function public.customer_order_detail_v1(text, uuid)
  to authenticated;
grant execute on function public.customer_order_cancel_v1(text, uuid, bigint, uuid)
  to authenticated;

comment on column public.storefront_settings.customer_order_cancellation_enabled is
  'Fail-closed feature switch for owner-requested cancellation; defaults OFF.';
comment on function public.customer_order_list_v1(
  text, integer, timestamptz, uuid
) is
  'Owner/shop-scoped order cards with deterministic placed_at/id keyset pagination.';
comment on function public.customer_order_detail_v1(text, uuid) is
  'Owner/shop-only immutable order snapshot with append-only public status timeline.';
comment on function public.customer_order_cancel_v1(text, uuid, bigint, uuid) is
  'Idempotent owner/shop cancellation allowed only while server policy and status version permit it.';

notify pgrst, 'reload schema';

commit;
