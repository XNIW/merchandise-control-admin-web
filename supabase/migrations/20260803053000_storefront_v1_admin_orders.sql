-- Storefront v1 / TASK-029
--
-- Shop-scoped Admin order queue/detail plus an explicit, versioned and
-- idempotent operational state machine. Customer orders remain distinct from
-- fiscal POS sales; every transition commits its status event, redacted audit
-- record and POS-neutral outbox envelope atomically.

begin;

alter table public.staff_role_permissions
  drop constraint if exists staff_role_permissions_permission_key_check,
  add constraint staff_role_permissions_permission_key_check check (
    permission_key in (
      'shop_admin.full_access',
      'pos.sell', 'pos.pay', 'pos.refund', 'pos.void', 'pos.discount',
      'pos.discount_over_limit', 'catalog.view', 'catalog.manage',
      'catalog.price_edit', 'catalog.import', 'catalog.export', 'catalog.read',
      'catalog.write', 'register.view', 'register.manage', 'users.view',
      'users.manage', 'staff.read', 'staff.write', 'devices.read',
      'devices.write', 'db.maintenance', 'settings.view', 'settings.write',
      'settings.manage', 'settings.read', 'printer.manage', 'sync.manage',
      'sync.read', 'sync.write', 'history.write', 'pos.dashboard.read',
      'audit.view', 'audit.read',
      'storefront.view', 'storefront.edit', 'storefront.publish',
      'storefront.bulk_publish', 'storefront.promotions.manage',
      'storefront.images.manage', 'storefront.settings.manage',
      'storefront.audit.view', 'orders.view', 'orders.manage'
    )
  );

create or replace function app_private.mac_admin_w7pos_009_pos_admin_permissions()
returns table(permission_key text)
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select permissions.permission_key
  from (
    values
      ('shop_admin.full_access'), ('pos.sell'), ('pos.pay'), ('pos.refund'),
      ('pos.void'), ('pos.discount'), ('catalog.view'), ('catalog.manage'),
      ('catalog.price_edit'), ('catalog.import'), ('catalog.export'),
      ('catalog.read'), ('catalog.write'), ('register.view'),
      ('register.manage'), ('users.view'), ('users.manage'), ('staff.read'),
      ('staff.write'), ('devices.read'), ('devices.write'),
      ('db.maintenance'), ('settings.view'), ('settings.write'),
      ('settings.manage'), ('settings.read'), ('printer.manage'),
      ('sync.manage'), ('sync.read'), ('sync.write'),
      ('pos.dashboard.read'), ('audit.view'), ('audit.read'),
      ('storefront.view'), ('storefront.edit'), ('storefront.publish'),
      ('storefront.bulk_publish'), ('storefront.promotions.manage'),
      ('storefront.images.manage'), ('storefront.settings.manage'),
      ('storefront.audit.view'), ('orders.view'), ('orders.manage')
  ) as permissions(permission_key);
$$;

create or replace function app_private.task140_safe_staff_web_permissions()
returns table(permission_key text)
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  values
    ('catalog.read'), ('catalog.write'), ('catalog.import'),
    ('catalog.export'), ('staff.read'), ('staff.write'), ('devices.read'),
    ('audit.read'), ('settings.read'), ('pos.dashboard.read'), ('sync.read'),
    ('sync.write'), ('storefront.view'), ('storefront.edit'),
    ('storefront.publish'), ('storefront.bulk_publish'),
    ('storefront.promotions.manage'), ('storefront.images.manage'),
    ('storefront.settings.manage'), ('storefront.audit.view'),
    ('orders.view'), ('orders.manage');
$$;

revoke all on function app_private.mac_admin_w7pos_009_pos_admin_permissions()
  from public, anon, authenticated, service_role;
revoke all on function app_private.task140_safe_staff_web_permissions()
  from public, anon, authenticated, service_role;

insert into public.staff_role_permissions (
  shop_id, role_key, permission_key, enabled, updated_by_profile_id, updated_at
)
select shop.shop_id, 'pos_admin', permission.permission_key, true, null, now()
from public.shops shop
cross join app_private.mac_admin_w7pos_009_pos_admin_permissions() permission
on conflict (shop_id, role_key, permission_key)
do update set enabled = true, updated_at = now();

alter table public.customer_order_outbox
  drop constraint if exists customer_order_outbox_event_check;
alter table public.customer_order_outbox
  add constraint customer_order_outbox_event_check check (
    event_type in (
      'customer_order.confirmed.v1',
      'customer_order.accepted.v1',
      'customer_order.rejected.v1',
      'customer_order.preparing.v1',
      'customer_order.ready.v1',
      'customer_order.out_for_delivery.v1',
      'customer_order.completed.v1',
      'customer_order.cancelled.v1'
    )
  );

create index if not exists customer_orders_shop_queue_idx
  on public.customer_orders(shop_id, placed_at desc, id desc);
create index if not exists customer_order_items_public_name_trgm_idx
  on public.customer_order_items using gin(public_name extensions.gin_trgm_ops);

create table public.customer_order_admin_mutations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  order_id uuid not null,
  idempotency_key uuid not null,
  operation text not null,
  expected_status_version bigint not null,
  request_sha256 text not null,
  actor_kind text not null,
  actor_profile_id uuid references public.profiles(profile_id),
  actor_staff_id uuid references public.staff_accounts(staff_id),
  response_payload jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  retained_until timestamptz not null default (
    statement_timestamp() + interval '30 days'
  ),
  constraint customer_order_admin_mutations_order_shop_fkey foreign key (
    shop_id,
    order_id
  ) references public.customer_orders(shop_id, id) on delete cascade,
  constraint customer_order_admin_mutations_key_unique unique (
    shop_id,
    idempotency_key
  ),
  constraint customer_order_admin_mutations_operation_check check (
    operation in (
      'accept', 'reject', 'preparing', 'ready', 'out_for_delivery',
      'complete', 'cancel'
    )
  ),
  constraint customer_order_admin_mutations_version_check check (
    expected_status_version >= 1
  ),
  constraint customer_order_admin_mutations_hash_check check (
    request_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint customer_order_admin_mutations_actor_check check (
    (actor_kind = 'personal_account'
      and actor_profile_id is not null and actor_staff_id is null)
    or
    (actor_kind = 'pos_staff_manager'
      and actor_profile_id is null and actor_staff_id is not null)
  ),
  constraint customer_order_admin_mutations_payload_check check (
    jsonb_typeof(response_payload) = 'object'
    and pg_column_size(response_payload) <= 65536
  ),
  constraint customer_order_admin_mutations_retention_check check (
    retained_until > created_at
  )
);

create index customer_order_admin_mutations_retention_idx
  on public.customer_order_admin_mutations(retained_until, id);

create or replace function app_private.customer_order_admin_mutation_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using
    errcode = '23514',
    message = 'customer_order_admin_mutation_immutable';
end;
$$;

create trigger customer_order_admin_mutations_guard_immutable
  before update on public.customer_order_admin_mutations
  for each row execute function app_private.customer_order_admin_mutation_guard_v1();

revoke all on function app_private.customer_order_admin_mutation_guard_v1()
  from public, anon, authenticated, service_role;

alter table public.customer_order_admin_mutations enable row level security;
alter table public.customer_order_admin_mutations force row level security;
revoke all on table public.customer_order_admin_mutations
  from public, anon, authenticated;
grant select, insert, delete on table public.customer_order_admin_mutations
  to service_role;

create or replace function app_private.customer_order_admin_personal_allowed_v1(
  p_shop_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_permission in ('orders.view', 'orders.manage')
    and exists (
      select 1
      from public.shop_members member
      join public.shops shop on shop.shop_id = member.shop_id
      where member.shop_id = p_shop_id
        and member.profile_id = auth.uid()
        and member.membership_status = 'active'
        and member.role_key in ('shop_owner', 'shop_manager')
        and shop.shop_status = 'active'
    );
$$;

create or replace function app_private.customer_order_admin_authorized_v1(
  p_shop_id uuid,
  p_permission text,
  p_staff_id uuid,
  p_staff_web_session_id uuid,
  p_session_token_hash text,
  p_expected_credential_version integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'authenticated' then
    if p_staff_id is not null
      or p_staff_web_session_id is not null
      or p_session_token_hash is not null
      or p_expected_credential_version is not null then
      return false;
    end if;
    return app_private.customer_order_admin_personal_allowed_v1(
      p_shop_id,
      p_permission
    );
  end if;

  if auth.role() = 'service_role' then
    return app_private.staff_web_runtime_lease_is_valid_v1(
      p_shop_id,
      p_staff_id,
      p_staff_web_session_id,
      p_session_token_hash,
      p_expected_credential_version,
      p_permission
    );
  end if;

  return false;
end;
$$;

revoke all on function app_private.customer_order_admin_personal_allowed_v1(
  uuid, text
) from public, anon, authenticated, service_role;
revoke all on function app_private.customer_order_admin_authorized_v1(
  uuid, text, uuid, uuid, text, integer
) from public, anon, authenticated, service_role;

create or replace function public.admin_customer_orders_read_v1(
  p_shop_id uuid,
  p_operation text,
  p_request jsonb default '{}'::jsonb,
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
  v_query text;
  v_status text;
  v_mode text;
  v_placed_from timestamptz;
  v_placed_to timestamptz;
  v_after_placed_at timestamptz;
  v_after_id uuid;
  v_limit integer;
  v_order_id uuid;
  v_rows jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_has_more boolean := false;
  v_next_placed_at timestamptz;
  v_next_id uuid;
  v_status_counts jsonb := '{}'::jsonb;
  v_order jsonb;
  v_items jsonb := '[]'::jsonb;
  v_timeline jsonb := '[]'::jsonb;
  v_audit jsonb := '[]'::jsonb;
  v_pos_handoff jsonb := jsonb_build_object('status', 'not_created');
begin
  if p_shop_id is null
    or p_operation not in ('queue', 'detail')
    or jsonb_typeof(coalesce(p_request, 'null'::jsonb)) <> 'object'
    or pg_column_size(p_request) > 16384 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  if not app_private.customer_order_admin_authorized_v1(
    p_shop_id, 'orders.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'permission_denied', 'shopId', p_shop_id
    );
  end if;

  if p_operation = 'queue' then
    v_query := nullif(btrim(coalesce(p_request->>'query', '')), '');
    v_status := nullif(p_request->>'status', '');
    v_mode := nullif(p_request->>'fulfillmentMode', '');
    v_limit := coalesce((p_request->>'limit')::integer, 25);
    v_placed_from := nullif(p_request->>'placedFrom', '')::timestamptz;
    v_placed_to := nullif(p_request->>'placedTo', '')::timestamptz;
    v_after_placed_at := nullif(p_request->>'afterPlacedAt', '')::timestamptz;
    v_after_id := nullif(p_request->>'afterId', '')::uuid;

    if octet_length(coalesce(v_query, '')) > 160
      or v_limit not between 1 and 50
      or (v_status is not null and v_status not in (
        'confirmed', 'accepted', 'rejected', 'preparing', 'ready',
        'out_for_delivery', 'completed', 'cancelled'
      ))
      or (v_mode is not null and v_mode not in (
        'pickup', 'reservation', 'delivery'
      ))
      or ((v_after_placed_at is null) <> (v_after_id is null))
      or (v_placed_from is not null and v_placed_to is not null
        and v_placed_from >= v_placed_to) then
      return jsonb_build_object(
        'ok', false, 'code', 'validation_failed', 'shopId', p_shop_id
      );
    end if;

    with filtered as materialized (
      select customer_order.*
      from public.customer_orders customer_order
      where customer_order.shop_id = p_shop_id
        and (v_status is null or customer_order.status = v_status)
        and (v_mode is null or customer_order.fulfillment_mode = v_mode)
        and (v_placed_from is null or customer_order.placed_at >= v_placed_from)
        and (v_placed_to is null or customer_order.placed_at < v_placed_to)
        and (
          v_query is null
          or position(lower(v_query) in lower(customer_order.public_order_code)) > 0
          or exists (
            select 1
            from public.customer_order_items item
            where item.order_id = customer_order.id
              and item.shop_id = p_shop_id
              and position(lower(v_query) in lower(item.public_name)) > 0
          )
        )
    ), page as materialized (
      select filtered.*,
        row_number() over (
          order by filtered.placed_at desc, filtered.id desc
        ) as page_row
      from filtered
      where v_after_placed_at is null
        or (filtered.placed_at, filtered.id) < (v_after_placed_at, v_after_id)
      order by filtered.placed_at desc, filtered.id desc
      limit v_limit + 1
    )
    select
      (select count(*)::integer from filtered),
      count(*) > v_limit,
      coalesce(jsonb_agg(jsonb_build_object(
        'orderId', page.id,
        'orderCode', page.public_order_code,
        'orderStatus', page.status,
        'orderVersion', page.status_version,
        'fulfillmentMode', page.fulfillment_mode,
        'currencyCode', page.currency_code,
        'totalClp', page.total_clp,
        'itemCount', (
          select count(*)::integer
          from public.customer_order_items item
          where item.order_id = page.id
        ),
        'itemSummary', (
          select string_agg(item.public_name || ' ×' || item.quantity, ', '
            order by item.line_position)
          from public.customer_order_items item
          where item.order_id = page.id
        ),
        'placedAt', page.placed_at,
        'updatedAt', page.updated_at
      ) order by page.placed_at desc, page.id desc)
        filter (where page.page_row <= v_limit), '[]'::jsonb),
      (array_agg(page.placed_at order by page.placed_at desc, page.id desc)
        filter (where page.page_row <= v_limit))[v_limit],
      (array_agg(page.id order by page.placed_at desc, page.id desc)
        filter (where page.page_row <= v_limit))[v_limit]
    into v_total, v_has_more, v_rows,
      v_next_placed_at, v_next_id
    from page;

    select coalesce(jsonb_object_agg(counted.status, counted.row_count), '{}'::jsonb)
    into v_status_counts
    from (
      select customer_order.status, count(*)::integer as row_count
      from public.customer_orders customer_order
      where customer_order.shop_id = p_shop_id
      group by customer_order.status
    ) counted;

    if not app_private.customer_order_admin_authorized_v1(
      p_shop_id, 'orders.view', p_staff_id, p_staff_web_session_id,
      p_session_token_hash, p_expected_credential_version
    ) then
      raise exception 'Order Admin authorization expired before queue publication'
        using errcode = '42501';
    end if;

    return jsonb_strip_nulls(jsonb_build_object(
      'ok', true,
      'code', 'success',
      'shopId', p_shop_id,
      'rows', v_rows,
      'statusCounts', v_status_counts,
      'pagination', jsonb_build_object(
        'limit', v_limit,
        'totalMatching', v_total,
        'hasMore', v_has_more,
        'nextPlacedAt', case when v_has_more then v_next_placed_at end,
        'nextId', case when v_has_more then v_next_id end
      )
    ));
  end if;

  v_order_id := nullif(p_request->>'orderId', '')::uuid;
  if v_order_id is null then
    return jsonb_build_object(
      'ok', false, 'code', 'validation_failed', 'shopId', p_shop_id
    );
  end if;

  select jsonb_build_object(
    'orderId', customer_order.id,
    'orderCode', customer_order.public_order_code,
    'orderStatus', customer_order.status,
    'orderVersion', customer_order.status_version,
    'fulfillmentMode', customer_order.fulfillment_mode,
    'fulfillment', jsonb_strip_nulls(jsonb_build_object(
      'mode', customer_order.fulfillment_snapshot->>'mode',
      'address', case
        when jsonb_typeof(customer_order.fulfillment_snapshot->'address') = 'object'
        then jsonb_strip_nulls(jsonb_build_object(
          'recipientName', customer_order.fulfillment_snapshot#>>'{address,recipientName}',
          'addressLine1', customer_order.fulfillment_snapshot#>>'{address,addressLine1}',
          'addressLine2', customer_order.fulfillment_snapshot#>>'{address,addressLine2}',
          'commune', customer_order.fulfillment_snapshot#>>'{address,commune}',
          'region', customer_order.fulfillment_snapshot#>>'{address,region}',
          'postalCode', customer_order.fulfillment_snapshot#>>'{address,postalCode}',
          'countryCode', customer_order.fulfillment_snapshot#>>'{address,countryCode}',
          'deliveryInstructions',
            customer_order.fulfillment_snapshot#>>'{address,deliveryInstructions}'
        ))
      end,
      'pickupPoint', case
        when jsonb_typeof(customer_order.fulfillment_snapshot->'pickupPoint') = 'object'
        then jsonb_strip_nulls(jsonb_build_object(
          'name', customer_order.fulfillment_snapshot#>>'{pickupPoint,name}',
          'addressLine1', customer_order.fulfillment_snapshot#>>'{pickupPoint,addressLine1}',
          'addressLine2', customer_order.fulfillment_snapshot#>>'{pickupPoint,addressLine2}',
          'commune', customer_order.fulfillment_snapshot#>>'{pickupPoint,commune}',
          'region', customer_order.fulfillment_snapshot#>>'{pickupPoint,region}',
          'instructions', customer_order.fulfillment_snapshot#>>'{pickupPoint,instructions}'
        ))
      end,
      'deliveryZone', case
        when jsonb_typeof(customer_order.fulfillment_snapshot->'deliveryZone') = 'object'
        then jsonb_strip_nulls(jsonb_build_object(
          'name', customer_order.fulfillment_snapshot#>>'{deliveryZone,name}',
          'region', customer_order.fulfillment_snapshot#>>'{deliveryZone,region}',
          'feeClp', customer_order.delivery_fee_clp
        ))
      end,
      'slot', jsonb_strip_nulls(jsonb_build_object(
        'label', customer_order.fulfillment_snapshot#>>'{slot,label}',
        'startsAt', customer_order.fulfillment_snapshot#>>'{slot,startsAt}',
        'endsAt', customer_order.fulfillment_snapshot#>>'{slot,endsAt}'
      ))
    )),
    'currencyCode', customer_order.currency_code,
    'subtotalClp', customer_order.subtotal_clp,
    'deliveryFeeClp', customer_order.delivery_fee_clp,
    'totalClp', customer_order.total_clp,
    'placedAt', customer_order.placed_at,
    'updatedAt', customer_order.updated_at
  ) into v_order
  from public.customer_orders customer_order
  where customer_order.shop_id = p_shop_id
    and customer_order.id = v_order_id;

  if v_order is null then
    return jsonb_build_object(
      'ok', false, 'code', 'not_found', 'shopId', p_shop_id
    );
  end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'linePosition', item.line_position,
    'publicName', item.public_name,
    'quantity', item.quantity,
    'unitPriceClp', item.unit_price_clp,
    'compareAtPriceClp', item.compare_at_price_clp,
    'lineTotalClp', item.line_total_clp,
    'promotionName', item.promotion_name,
    'promotionEndsAt', item.promotion_ends_at
  )) order by item.line_position), '[]'::jsonb)
  into v_items
  from public.customer_order_items item
  where item.shop_id = p_shop_id and item.order_id = v_order_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'eventVersion', event.event_version,
    'status', event.status,
    'actorKind', event.actor_kind,
    'reasonCode', event.metadata_redacted->>'reasonCode',
    'source', event.metadata_redacted->>'source',
    'createdAt', event.created_at
  ) order by event.event_version), '[]'::jsonb)
  into v_timeline
  from public.customer_order_status_events event
  where event.shop_id = p_shop_id and event.order_id = v_order_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'auditId', audit.audit_log_id,
    'eventKey', audit.event_key,
    'actorKind', case when audit.actor_staff_id is not null
      then 'pos_staff_manager' when audit.actor_profile_id is not null
      then 'personal_account' else 'system' end,
    'result', audit.result,
    'fromStatus', audit.metadata_redacted->>'fromStatus',
    'toStatus', audit.metadata_redacted->>'toStatus',
    'reasonCode', audit.metadata_redacted->>'reasonCode',
    'correlationId', audit.metadata_redacted->>'correlationId',
    'createdAt', audit.created_at
  ) order by audit.created_at desc, audit.audit_log_id desc), '[]'::jsonb)
  into v_audit
  from public.audit_logs audit
  where audit.shop_id = p_shop_id
    and audit.target_type = 'customer_order'
    and audit.target_id = v_order_id::text
    and audit.event_key like 'shop.storefront.order.transition.%';

  select jsonb_strip_nulls(jsonb_build_object(
    'status', outbox.status,
    'attemptCount', outbox.attempt_count,
    'lastErrorCode', outbox.last_error_code,
    'deliveredAt', outbox.delivered_at,
    'updatedAt', outbox.updated_at
  )) into v_pos_handoff
  from public.customer_order_outbox outbox
  where outbox.shop_id = p_shop_id
    and outbox.order_id = v_order_id
    and outbox.event_type = 'customer_order.confirmed.v1';
  v_pos_handoff := coalesce(
    v_pos_handoff,
    jsonb_build_object('status', 'not_created')
  );

  if not app_private.customer_order_admin_authorized_v1(
    p_shop_id, 'orders.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    raise exception 'Order Admin authorization expired before detail publication'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'shopId', p_shop_id,
    'order', v_order,
    'items', v_items,
    'timeline', v_timeline,
    'audit', v_audit,
    'delivery', jsonb_build_object(
      'pos', v_pos_handoff,
      'push', jsonb_build_object('status', 'not_configured')
    )
  );
exception
  when invalid_text_representation or numeric_value_out_of_range
    or invalid_datetime_format then
    return jsonb_build_object(
      'ok', false, 'code', 'validation_failed', 'shopId', p_shop_id
    );
  when insufficient_privilege then
    return jsonb_build_object(
      'ok', false, 'code', 'session_expired', 'shopId', p_shop_id
    );
end;
$$;

create or replace function public.admin_customer_order_transition_v1(
  p_shop_id uuid,
  p_order_id uuid,
  p_operation text,
  p_expected_status_version bigint,
  p_idempotency_key uuid,
  p_correlation_id uuid,
  p_reason_code text default null,
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
  v_now timestamptz := statement_timestamp();
  v_order public.customer_orders%rowtype;
  v_previous public.customer_order_admin_mutations%rowtype;
  v_next_status text;
  v_request_sha256 text;
  v_result jsonb;
  v_actor_kind text;
  v_actor_profile_id uuid;
  v_actor_staff_id uuid;
  v_audit_id uuid;
begin
  if p_shop_id is null
    or p_order_id is null
    or p_idempotency_key is null
    or p_correlation_id is null
    or coalesce(p_expected_status_version, 0) < 1
    or p_operation not in (
      'accept', 'reject', 'preparing', 'ready', 'out_for_delivery',
      'complete', 'cancel'
    )
    or (
      p_operation in ('reject', 'cancel')
      and coalesce(p_reason_code, '') not in (
        'customer_request', 'item_unavailable', 'shop_closed',
        'capacity_unavailable', 'delivery_unavailable',
        'payment_unavailable', 'operational_error', 'other'
      )
    )
    or (p_operation not in ('reject', 'cancel') and p_reason_code is not null)
  then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  if not app_private.customer_order_admin_authorized_v1(
    p_shop_id, 'orders.manage', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id
    );
  end if;

  if auth.role() = 'authenticated' then
    v_actor_kind := 'personal_account';
    v_actor_profile_id := auth.uid();
  else
    v_actor_kind := 'pos_staff_manager';
    v_actor_staff_id := p_staff_id;
  end if;

  v_request_sha256 := encode(extensions.digest(
    pg_catalog.convert_to(jsonb_build_array(
      'admin_customer_order_transition_v1', p_shop_id, p_order_id,
      p_operation, p_expected_status_version, p_reason_code,
      p_correlation_id, v_actor_kind, v_actor_profile_id, v_actor_staff_id
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(
    'admin-order-idempotency:' || p_shop_id::text || ':' || p_idempotency_key::text,
    0
  ));

  select mutation.* into v_previous
  from public.customer_order_admin_mutations mutation
  where mutation.shop_id = p_shop_id
    and mutation.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_previous.request_sha256 <> v_request_sha256 then
      return jsonb_build_object(
        'ok', false, 'code', 'idempotency_conflict',
        'shop_id', p_shop_id, 'target_id', p_order_id
      );
    end if;
    return jsonb_set(v_previous.response_payload, '{idempotent}', 'true'::jsonb);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'admin-order-transition:' || p_shop_id::text || ':' || p_order_id::text,
    0
  ));

  select customer_order.* into v_order
  from public.customer_orders customer_order
  where customer_order.shop_id = p_shop_id
    and customer_order.id = p_order_id
  for update;
  if not found then
    return jsonb_build_object(
      'ok', false, 'code', 'not_found',
      'shop_id', p_shop_id, 'target_id', p_order_id
    );
  end if;
  if v_order.status_version <> p_expected_status_version then
    return jsonb_build_object(
      'ok', false, 'code', 'version_conflict',
      'shop_id', p_shop_id, 'target_id', p_order_id,
      'current_status', v_order.status,
      'current_status_version', v_order.status_version
    );
  end if;

  v_next_status := case p_operation
    when 'accept' then 'accepted'
    when 'reject' then 'rejected'
    when 'preparing' then 'preparing'
    when 'ready' then 'ready'
    when 'out_for_delivery' then 'out_for_delivery'
    when 'complete' then 'completed'
    when 'cancel' then 'cancelled'
  end;

  if not (
    (p_operation = 'accept' and v_order.status = 'confirmed')
    or (p_operation = 'reject' and v_order.status = 'confirmed')
    or (p_operation = 'preparing' and v_order.status = 'accepted')
    or (p_operation = 'ready' and v_order.status = 'preparing')
    or (p_operation = 'out_for_delivery'
      and v_order.status = 'ready' and v_order.fulfillment_mode = 'delivery')
    or (p_operation = 'complete' and (
      (v_order.status = 'ready'
        and v_order.fulfillment_mode in ('pickup', 'reservation'))
      or (v_order.status = 'out_for_delivery'
        and v_order.fulfillment_mode = 'delivery')
    ))
    or (p_operation = 'cancel' and v_order.status in (
      'confirmed', 'accepted', 'preparing', 'ready', 'out_for_delivery'
    ))
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'invalid_state',
      'shop_id', p_shop_id, 'target_id', p_order_id,
      'current_status', v_order.status,
      'fulfillment_mode', v_order.fulfillment_mode
    );
  end if;

  begin
    update public.customer_orders customer_order
    set status = v_next_status,
        status_version = customer_order.status_version + 1,
        updated_at = v_now
    where customer_order.shop_id = p_shop_id
      and customer_order.id = p_order_id
      and customer_order.status = v_order.status
      and customer_order.status_version = p_expected_status_version;
    if not found then
      raise exception 'customer order status changed during transition'
        using errcode = '40001';
    end if;

    insert into public.customer_order_status_events(
      order_id, shop_id, event_version, status, actor_kind,
      metadata_redacted, created_at
    ) values (
      p_order_id, p_shop_id, p_expected_status_version + 1,
      v_next_status, 'admin',
      jsonb_strip_nulls(jsonb_build_object(
        'source', 'storefront_admin',
        'operation', p_operation,
        'reasonCode', p_reason_code,
        'correlationId', p_correlation_id
      )),
      v_now
    );

    if not app_private.customer_order_admin_authorized_v1(
      p_shop_id, 'orders.manage', p_staff_id, p_staff_web_session_id,
      p_session_token_hash, p_expected_credential_version
    ) then
      raise exception 'Order Admin authorization expired before transition publication'
        using errcode = '42501';
    end if;

    insert into public.audit_logs (
      actor_profile_id, actor_staff_id, scope, shop_id, event_key,
      severity, result, target_type, target_id, metadata_redacted
    ) values (
      v_actor_profile_id,
      v_actor_staff_id,
      'shop',
      p_shop_id,
      'shop.storefront.order.transition.' || p_operation || '.success',
      'info',
      'success',
      'customer_order',
      p_order_id::text,
      jsonb_strip_nulls(jsonb_build_object(
        'source', 'storefront_admin',
        'operation', p_operation,
        'fromStatus', v_order.status,
        'toStatus', v_next_status,
        'expectedStatusVersion', p_expected_status_version,
        'committedStatusVersion', p_expected_status_version + 1,
        'reasonCode', p_reason_code,
        'requestId', p_idempotency_key,
        'correlationId', p_correlation_id
      ))
    ) returning audit_log_id into v_audit_id;

    insert into public.customer_order_outbox(
      order_id, shop_id, event_type, idempotency_key, payload,
      status, available_at, created_at, updated_at
    ) values (
      p_order_id,
      p_shop_id,
      'customer_order.' || v_next_status || '.v1',
      p_idempotency_key,
      jsonb_strip_nulls(jsonb_build_object(
        'apiVersion', 'customer-order-outbox.v1',
        'eventType', 'customer_order.' || v_next_status || '.v1',
        'documentKind', 'customer_order',
        'fiscalStatus', 'not_created',
        'orderId', p_order_id,
        'orderCode', v_order.public_order_code,
        'shopId', p_shop_id,
        'idempotencyKey', p_idempotency_key,
        'correlationId', p_correlation_id,
        'status', v_next_status,
        'statusVersion', p_expected_status_version + 1,
        'fulfillmentMode', v_order.fulfillment_mode,
        'occurredAt', v_now
      )),
      'pending', v_now, v_now, v_now
    );

    if v_next_status in ('rejected', 'cancelled', 'completed') then
      perform app_private.storefront_reservation_refresh_availability_v1(
        affected.source_product_id,
        v_now
      )
      from (
        select distinct item.source_product_id
        from public.customer_order_items item
        where item.order_id = p_order_id and item.shop_id = p_shop_id
      ) affected;
    end if;

    v_result := jsonb_build_object(
      'ok', true,
      'code', 'success',
      'shop_id', p_shop_id,
      'target_id', p_order_id,
      'audit_event_id', v_audit_id,
      'order_status', v_next_status,
      'order_status_version', p_expected_status_version + 1,
      'idempotent', false,
      'correlation_id', p_correlation_id
    );

    insert into public.customer_order_admin_mutations(
      shop_id, order_id, idempotency_key, operation,
      expected_status_version, request_sha256, actor_kind,
      actor_profile_id, actor_staff_id, response_payload
    ) values (
      p_shop_id, p_order_id, p_idempotency_key, p_operation,
      p_expected_status_version, v_request_sha256, v_actor_kind,
      v_actor_profile_id, v_actor_staff_id, v_result
    );

    return v_result;
  exception
    when insufficient_privilege then
      return jsonb_build_object(
        'ok', false, 'code', 'session_expired',
        'shop_id', p_shop_id, 'target_id', p_order_id
      );
    when serialization_failure then
      return jsonb_build_object(
        'ok', false, 'code', 'version_conflict',
        'shop_id', p_shop_id, 'target_id', p_order_id
      );
    when unique_violation then
      return jsonb_build_object(
        'ok', false, 'code', 'conflict',
        'shop_id', p_shop_id, 'target_id', p_order_id
      );
    when check_violation or foreign_key_violation or not_null_violation then
      return jsonb_build_object(
        'ok', false, 'code', 'validation_failed',
        'shop_id', p_shop_id, 'target_id', p_order_id
      );
  end;
end;
$$;

revoke all on function public.admin_customer_orders_read_v1(
  uuid, text, jsonb, uuid, uuid, text, integer
) from public, anon;
revoke all on function public.admin_customer_order_transition_v1(
  uuid, uuid, text, bigint, uuid, uuid, text, uuid, uuid, text, integer
) from public, anon;
grant execute on function public.admin_customer_orders_read_v1(
  uuid, text, jsonb, uuid, uuid, text, integer
) to authenticated, service_role;
grant execute on function public.admin_customer_order_transition_v1(
  uuid, uuid, text, bigint, uuid, uuid, text, uuid, uuid, text, integer
) to authenticated, service_role;

comment on table public.customer_order_admin_mutations is
  'Private idempotency ledger for shop-authorized operational order transitions.';
comment on function public.admin_customer_orders_read_v1(
  uuid, text, jsonb, uuid, uuid, text, integer
) is
  'Shop-scoped, privacy-allow-listed Admin order queue/detail boundary.';
comment on function public.admin_customer_order_transition_v1(
  uuid, uuid, text, bigint, uuid, uuid, text, uuid, uuid, text, integer
) is
  'Versioned and idempotent Admin order state transition with atomic event, audit and POS-neutral outbox.';

notify pgrst, 'reload schema';

commit;
