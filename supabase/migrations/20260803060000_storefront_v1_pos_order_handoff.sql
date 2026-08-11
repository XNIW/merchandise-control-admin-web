-- Storefront v1 / TASK-030
--
-- A bounded, lease-based Win7POS handoff for customer-order events.  The POS
-- receives an allow-listed operational snapshot and acknowledges it through a
-- service-role-only RPC bound to the existing trusted runtime lease.  Operational
-- outcomes never create a fiscal sale; an optional fiscal reference can only point
-- at an already committed POS sale from the same shop and device.

begin;

alter table public.customer_order_outbox
  add column lease_token uuid,
  add column leased_by_device_id uuid references public.shop_devices(shop_device_id)
    on delete set null,
  add column lease_session_id uuid references public.pos_sessions(pos_session_id)
    on delete set null;

-- No pre-TASK-030 consumer was authorized to own an outbox lease.  Fail safely if
-- a stale synthetic row exists instead of accepting an unverifiable owner.
update public.customer_order_outbox
set status = 'pending',
    lease_expires_at = null,
    lease_token = null,
    leased_by_device_id = null,
    lease_session_id = null,
    available_at = least(available_at, statement_timestamp())
where status = 'leased';

alter table public.customer_order_outbox
  drop constraint customer_order_outbox_lease_check;
alter table public.customer_order_outbox
  add constraint customer_order_outbox_lease_check check (
    (
      status = 'leased'
      and lease_expires_at is not null
      and lease_token is not null
      and leased_by_device_id is not null
      and lease_session_id is not null
    )
    or (
      status <> 'leased'
      and lease_expires_at is null
      and lease_token is null
      and leased_by_device_id is null
      and lease_session_id is null
    )
  );

alter table public.customer_order_outbox
  add constraint customer_order_outbox_shop_id_id_unique unique (shop_id, id);

create index customer_order_outbox_pos_claim_idx
  on public.customer_order_outbox(shop_id, status, available_at, created_at, id)
  where event_type in (
    'customer_order.accepted.v1',
    'customer_order.rejected.v1',
    'customer_order.preparing.v1',
    'customer_order.ready.v1',
    'customer_order.out_for_delivery.v1',
    'customer_order.completed.v1',
    'customer_order.cancelled.v1'
  );

create table public.customer_order_pos_receipts (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null,
  order_id uuid not null,
  shop_id uuid not null,
  shop_device_id uuid not null references public.shop_devices(shop_device_id)
    on delete restrict,
  staff_id uuid not null references public.staff_accounts(staff_id)
    on delete restrict,
  pos_session_id uuid not null references public.pos_sessions(pos_session_id)
    on delete restrict,
  outcome text not null,
  ack_idempotency_key uuid not null,
  lease_token uuid not null,
  expected_status_version bigint not null,
  committed_status_version bigint not null,
  request_sha256 text not null,
  pos_sale_id uuid references public.pos_sales(pos_sale_id) on delete restrict,
  response_payload jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  retained_until timestamptz not null default (
    statement_timestamp() + interval '90 days'
  ),
  constraint customer_order_pos_receipts_handoff_shop_fkey foreign key (
    shop_id,
    handoff_id
  ) references public.customer_order_outbox(shop_id, id) on delete cascade,
  constraint customer_order_pos_receipts_order_shop_fkey foreign key (
    shop_id,
    order_id
  ) references public.customer_orders(shop_id, id) on delete cascade,
  constraint customer_order_pos_receipts_ack_unique unique (
    shop_id,
    shop_device_id,
    ack_idempotency_key
  ),
  constraint customer_order_pos_receipts_outcome_unique unique (
    handoff_id,
    outcome
  ),
  constraint customer_order_pos_receipts_outcome_check check (
    outcome in ('accepted', 'rejected', 'prepared', 'completed')
  ),
  constraint customer_order_pos_receipts_version_check check (
    expected_status_version >= 1
    and committed_status_version >= expected_status_version
  ),
  constraint customer_order_pos_receipts_hash_check check (
    request_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint customer_order_pos_receipts_fiscal_check check (
    pos_sale_id is null or outcome = 'completed'
  ),
  constraint customer_order_pos_receipts_payload_check check (
    jsonb_typeof(response_payload) = 'object'
    and pg_column_size(response_payload) <= 65536
  ),
  constraint customer_order_pos_receipts_retention_check check (
    retained_until > created_at
  )
);

create index customer_order_pos_receipts_order_created_idx
  on public.customer_order_pos_receipts(shop_id, order_id, created_at, id);
create index customer_order_pos_receipts_retention_idx
  on public.customer_order_pos_receipts(retained_until, id);
create unique index customer_order_pos_receipts_fiscal_sale_unique
  on public.customer_order_pos_receipts(pos_sale_id)
  where pos_sale_id is not null;

create or replace function app_private.customer_order_pos_receipt_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'customer_order_pos_receipt_append_only';
end;
$$;

create trigger customer_order_pos_receipts_guard_append_only
  before update or delete on public.customer_order_pos_receipts
  for each row execute function app_private.customer_order_pos_receipt_guard_v1();

alter table public.customer_order_pos_receipts enable row level security;
alter table public.customer_order_pos_receipts force row level security;
revoke all on table public.customer_order_pos_receipts
  from public, anon, authenticated;
grant select, insert on table public.customer_order_pos_receipts to service_role;
revoke all on function app_private.customer_order_pos_receipt_guard_v1()
  from public, anon, authenticated, service_role;

create or replace function public.pos_customer_order_claim_v1(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_limit integer default 10
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_handoffs jsonb := '[]'::jsonb;
begin
  if p_shop_id is null
    or p_shop_device_id is null
    or p_staff_id is null
    or p_pos_session_id is null
    or coalesce(p_limit, 0) not between 1 and 25
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'validation_failed',
      'schemaVersion', 'pos-customer-order-handoff-v1'
    );
  end if;

  if not app_private.pos_runtime_lease_is_valid_v1(
    p_shop_id,
    p_shop_device_id,
    p_staff_id,
    p_pos_session_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'denied',
      'schemaVersion', 'pos-customer-order-handoff-v1'
    );
  end if;

  with candidates as (
    select
      outbox.id,
      (
        outbox.status = 'leased'
        and outbox.leased_by_device_id = p_shop_device_id
        and outbox.lease_session_id = p_pos_session_id
        and outbox.lease_expires_at > v_now
      ) as reusing_live_lease
    from public.customer_order_outbox outbox
    where outbox.shop_id = p_shop_id
      and outbox.event_type in (
        'customer_order.accepted.v1',
        'customer_order.rejected.v1',
        'customer_order.preparing.v1',
        'customer_order.ready.v1',
        'customer_order.out_for_delivery.v1',
        'customer_order.completed.v1',
        'customer_order.cancelled.v1'
      )
      and coalesce(outbox.payload->>'statusVersion', '') ~ '^[1-9][0-9]{0,18}$'
      and not exists (
        select 1
        from public.customer_order_status_events status_event
        where status_event.shop_id = outbox.shop_id
          and status_event.order_id = outbox.order_id
          and status_event.event_version = (outbox.payload->>'statusVersion')::bigint
          and status_event.actor_kind = 'pos'
      )
      and (
        (outbox.status = 'pending' and outbox.available_at <= v_now)
        or (outbox.status = 'leased' and outbox.lease_expires_at <= v_now)
        or (
          outbox.status = 'leased'
          and outbox.leased_by_device_id = p_shop_device_id
          and outbox.lease_session_id = p_pos_session_id
          and outbox.lease_expires_at > v_now
        )
      )
    order by outbox.created_at, outbox.id
    for update of outbox skip locked
    limit p_limit
  ), claimed as (
    update public.customer_order_outbox outbox
    set status = 'leased',
        attempt_count = case
          when candidate.reusing_live_lease then outbox.attempt_count
          else outbox.attempt_count + 1
        end,
        lease_token = case
          when candidate.reusing_live_lease then outbox.lease_token
          else gen_random_uuid()
        end,
        leased_by_device_id = p_shop_device_id,
        lease_session_id = p_pos_session_id,
        lease_expires_at = case
          when candidate.reusing_live_lease then outbox.lease_expires_at
          else v_now + interval '45 seconds'
        end,
        last_error_code = null
    from candidates candidate
    where outbox.id = candidate.id
    returning outbox.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'schemaVersion', 'pos-customer-order-handoff-v1',
    'handoffId', claimed.id,
    'leaseToken', claimed.lease_token,
    'leaseExpiresAt', claimed.lease_expires_at,
    'attemptCount', claimed.attempt_count,
    'eventType', claimed.event_type,
    'eventIdempotencyKey', claimed.idempotency_key,
    'correlationId', coalesce(
      nullif(claimed.payload->>'correlationId', ''),
      claimed.idempotency_key::text
    ),
    'order', jsonb_build_object(
      'documentKind', 'customer_order',
      'fiscalStatus', 'not_created',
      'orderId', customer_order.id,
      'orderCode', customer_order.public_order_code,
      'shopId', customer_order.shop_id,
      'status', customer_order.status,
      'statusVersion', (claimed.payload->>'statusVersion')::bigint,
      'currentStatusVersion', customer_order.status_version,
      'fulfillmentMode', customer_order.fulfillment_mode,
      'fulfillment', jsonb_strip_nulls(jsonb_build_object(
        'mode', customer_order.fulfillment_mode,
        'pickupPoint', case
          when jsonb_typeof(customer_order.fulfillment_snapshot->'pickupPoint') = 'object'
          then jsonb_strip_nulls(jsonb_build_object(
            'publicName', customer_order.fulfillment_snapshot#>>'{pickupPoint,publicName}',
            'commune', customer_order.fulfillment_snapshot#>>'{pickupPoint,commune}',
            'region', customer_order.fulfillment_snapshot#>>'{pickupPoint,region}'
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
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'linePosition', item.line_position,
          'publicName', item.public_name,
          'quantity', item.quantity,
          'unitPriceClp', item.unit_price_clp,
          'lineTotalClp', item.line_total_clp
        ) order by item.line_position)
        from public.customer_order_items item
        where item.shop_id = customer_order.shop_id
          and item.order_id = customer_order.id
      ), '[]'::jsonb),
      'placedAt', customer_order.placed_at,
      'updatedAt', customer_order.updated_at
    )
  ) order by claimed.created_at, claimed.id), '[]'::jsonb)
  into v_handoffs
  from claimed
  join public.customer_orders customer_order
    on customer_order.shop_id = claimed.shop_id
   and customer_order.id = claimed.order_id;

  if not app_private.pos_runtime_lease_is_valid_v1(
    p_shop_id,
    p_shop_device_id,
    p_staff_id,
    p_pos_session_id
  ) then
    raise exception 'POS runtime lease expired before order handoff publication'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'schemaVersion', 'pos-customer-order-handoff-v1',
    'serverTime', v_now,
    'handoffs', v_handoffs
  );
exception
  when insufficient_privilege then
    return jsonb_build_object(
      'ok', false,
      'code', 'denied',
      'schemaVersion', 'pos-customer-order-handoff-v1'
    );
end;
$$;

create or replace function public.pos_customer_order_ack_v1(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_handoff_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_expected_status_version bigint,
  p_ack_idempotency_key uuid,
  p_pos_sale_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_outbox public.customer_order_outbox%rowtype;
  v_order public.customer_orders%rowtype;
  v_previous public.customer_order_pos_receipts%rowtype;
  v_accepted_receipt public.customer_order_pos_receipts%rowtype;
  v_request_sha256 text;
  v_result jsonb;
  v_committed_version bigint;
  v_fiscal_status text := 'not_created';
  v_event_version bigint;
begin
  if p_shop_id is null
    or p_shop_device_id is null
    or p_staff_id is null
    or p_pos_session_id is null
    or p_handoff_id is null
    or p_lease_token is null
    or p_ack_idempotency_key is null
    or coalesce(p_expected_status_version, 0) < 1
    or p_outcome not in ('accepted', 'rejected', 'prepared', 'completed')
    or (p_outcome <> 'completed' and p_pos_sale_id is not null)
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'validation_failed',
      'schemaVersion', 'pos-customer-order-ack-v1'
    );
  end if;

  if not app_private.pos_runtime_lease_is_valid_v1(
    p_shop_id,
    p_shop_device_id,
    p_staff_id,
    p_pos_session_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'denied',
      'schemaVersion', 'pos-customer-order-ack-v1'
    );
  end if;

  v_request_sha256 := encode(extensions.digest(
    convert_to(jsonb_build_array(
      'pos_customer_order_ack_v1', p_shop_id, p_shop_device_id,
      p_staff_id, p_pos_session_id, p_handoff_id, p_lease_token,
      p_outcome, p_expected_status_version, p_ack_idempotency_key,
      p_pos_sale_id
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(
    'pos-order-ack:' || p_shop_id::text || ':' || p_shop_device_id::text || ':'
      || p_ack_idempotency_key::text,
    0
  ));

  select receipt.* into v_previous
  from public.customer_order_pos_receipts receipt
  where receipt.shop_id = p_shop_id
    and receipt.shop_device_id = p_shop_device_id
    and receipt.ack_idempotency_key = p_ack_idempotency_key
  for update;
  if found then
    if v_previous.request_sha256 <> v_request_sha256 then
      return jsonb_build_object(
        'ok', false,
        'code', 'idempotency_conflict',
        'schemaVersion', 'pos-customer-order-ack-v1'
      );
    end if;
    return jsonb_set(v_previous.response_payload, '{idempotent}', 'true'::jsonb);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'pos-order-handoff:' || p_shop_id::text || ':' || p_handoff_id::text,
    0
  ));

  select outbox.* into v_outbox
  from public.customer_order_outbox outbox
  where outbox.shop_id = p_shop_id
    and outbox.id = p_handoff_id
  for update;
  if not found
    or v_outbox.event_type not in (
      'customer_order.accepted.v1',
      'customer_order.rejected.v1',
      'customer_order.preparing.v1',
      'customer_order.ready.v1',
      'customer_order.out_for_delivery.v1',
      'customer_order.completed.v1',
      'customer_order.cancelled.v1'
    )
    or coalesce(v_outbox.payload->>'statusVersion', '') !~ '^[1-9][0-9]{0,18}$'
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_found',
      'schemaVersion', 'pos-customer-order-ack-v1'
    );
  end if;

  select customer_order.* into v_order
  from public.customer_orders customer_order
  where customer_order.shop_id = p_shop_id
    and customer_order.id = v_outbox.order_id
  for update;
  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_found',
      'schemaVersion', 'pos-customer-order-ack-v1'
    );
  end if;

  select receipt.* into v_previous
  from public.customer_order_pos_receipts receipt
  where receipt.handoff_id = p_handoff_id
    and receipt.outcome = p_outcome
  for update;
  if found then
    if v_previous.request_sha256 <> v_request_sha256 then
      return jsonb_build_object(
        'ok', false,
        'code', 'idempotency_conflict',
        'schemaVersion', 'pos-customer-order-ack-v1'
      );
    end if;
    return jsonb_set(v_previous.response_payload, '{idempotent}', 'true'::jsonb);
  end if;

  if p_outcome = 'accepted' then
    if v_outbox.status <> 'leased'
      or v_outbox.leased_by_device_id <> p_shop_device_id
      or v_outbox.lease_session_id <> p_pos_session_id
      or v_outbox.lease_token <> p_lease_token
      or v_outbox.lease_expires_at <= v_now
      or (v_outbox.payload->>'statusVersion')::bigint <> p_expected_status_version
    then
      return jsonb_build_object(
        'ok', false,
        'code', 'lease_conflict',
        'schemaVersion', 'pos-customer-order-ack-v1'
      );
    end if;

    update public.customer_order_outbox
    set status = 'delivered',
        delivered_at = v_now,
        lease_expires_at = null,
        lease_token = null,
        leased_by_device_id = null,
        lease_session_id = null,
        last_error_code = null
    where id = p_handoff_id;

    -- The accepted handoff delivers the confirmed order snapshot as well.  This
    -- keeps the pre-accept outbox record observable without sending a customer
    -- order to the POS before Admin acceptance.
    if v_outbox.event_type = 'customer_order.accepted.v1' then
      update public.customer_order_outbox
      set status = 'delivered',
          delivered_at = v_now,
          lease_expires_at = null,
          lease_token = null,
          leased_by_device_id = null,
          lease_session_id = null,
          last_error_code = null
      where shop_id = p_shop_id
        and order_id = v_outbox.order_id
        and event_type = 'customer_order.confirmed.v1'
        and status in ('pending', 'leased');
    end if;

    v_committed_version := v_order.status_version;
  else
    if v_outbox.event_type <> 'customer_order.accepted.v1'
      or v_order.status_version <> p_expected_status_version
    then
      return jsonb_build_object(
        'ok', false,
        'code', 'version_conflict',
        'schemaVersion', 'pos-customer-order-ack-v1',
        'currentStatus', v_order.status,
        'currentStatusVersion', v_order.status_version
      );
    end if;

    select receipt.* into v_accepted_receipt
    from public.customer_order_pos_receipts receipt
    where receipt.handoff_id = p_handoff_id
      and receipt.outcome = 'accepted'
      and receipt.shop_device_id = p_shop_device_id;
    if not found or v_accepted_receipt.lease_token <> p_lease_token then
      return jsonb_build_object(
        'ok', false,
        'code', 'lease_conflict',
        'schemaVersion', 'pos-customer-order-ack-v1'
      );
    end if;

    if p_outcome = 'rejected' and v_order.status <> 'accepted' then
      return jsonb_build_object(
        'ok', false, 'code', 'invalid_state',
        'schemaVersion', 'pos-customer-order-ack-v1',
        'currentStatus', v_order.status
      );
    elsif p_outcome = 'prepared' and v_order.status <> 'accepted' then
      return jsonb_build_object(
        'ok', false, 'code', 'invalid_state',
        'schemaVersion', 'pos-customer-order-ack-v1',
        'currentStatus', v_order.status
      );
    elsif p_outcome = 'completed' and not (
      (v_order.status = 'ready'
        and v_order.fulfillment_mode in ('pickup', 'reservation'))
      or (v_order.status = 'out_for_delivery'
        and v_order.fulfillment_mode = 'delivery')
    ) then
      return jsonb_build_object(
        'ok', false, 'code', 'invalid_state',
        'schemaVersion', 'pos-customer-order-ack-v1',
        'currentStatus', v_order.status
      );
    end if;

    if p_pos_sale_id is not null and not exists (
      select 1
      from public.pos_sales sale
      where sale.pos_sale_id = p_pos_sale_id
        and sale.shop_id = p_shop_id
        and sale.shop_device_id = p_shop_device_id
        and sale.status = 'accepted'
        and sale.business_kind = 'sale'
        and sale.currency = 'CLP'
        and sale.total = v_order.total_clp::numeric
    ) then
      return jsonb_build_object(
        'ok', false,
        'code', 'fiscal_sale_mismatch',
        'schemaVersion', 'pos-customer-order-ack-v1'
      );
    end if;

    if p_outcome = 'rejected' then
      v_committed_version := v_order.status_version + 1;
      update public.customer_orders
      set status = 'rejected',
          status_version = v_committed_version,
          updated_at = v_now
      where id = v_order.id and status_version = v_order.status_version;

      insert into public.customer_order_status_events(
        order_id, shop_id, event_version, status, actor_kind,
        metadata_redacted, created_at
      ) values (
        v_order.id, p_shop_id, v_committed_version, 'rejected', 'pos',
        jsonb_build_object('source', 'win7pos', 'outcome', 'rejected'), v_now
      );

      insert into public.customer_order_outbox(
        order_id, shop_id, event_type, idempotency_key, payload,
        status, available_at, created_at, updated_at
      ) values (
        v_order.id, p_shop_id, 'customer_order.rejected.v1', gen_random_uuid(),
        jsonb_build_object(
          'apiVersion', 'customer-order-outbox.v1',
          'eventType', 'customer_order.rejected.v1',
          'documentKind', 'customer_order',
          'fiscalStatus', 'not_created',
          'orderId', v_order.id,
          'orderCode', v_order.public_order_code,
          'shopId', p_shop_id,
          'status', 'rejected',
          'statusVersion', v_committed_version,
          'source', 'win7pos',
          'occurredAt', v_now
        ),
        'pending', v_now, v_now, v_now
      );
    elsif p_outcome = 'prepared' then
      v_committed_version := v_order.status_version + 2;
      update public.customer_orders
      set status = 'ready',
          status_version = v_committed_version,
          updated_at = v_now
      where id = v_order.id and status_version = v_order.status_version;

      for v_event_version in
        select generate_series(v_order.status_version + 1, v_committed_version)
      loop
        insert into public.customer_order_status_events(
          order_id, shop_id, event_version, status, actor_kind,
          metadata_redacted, created_at
        ) values (
          v_order.id,
          p_shop_id,
          v_event_version,
          case when v_event_version = v_order.status_version + 1
            then 'preparing' else 'ready' end,
          'pos',
          jsonb_build_object(
            'source', 'win7pos',
            'outcome', 'prepared',
            'stage', case when v_event_version = v_order.status_version + 1
              then 'preparing' else 'ready' end
          ),
          v_now
        );

        insert into public.customer_order_outbox(
          order_id, shop_id, event_type, idempotency_key, payload,
          status, available_at, created_at, updated_at
        ) values (
          v_order.id,
          p_shop_id,
          'customer_order.' || case
            when v_event_version = v_order.status_version + 1
              then 'preparing' else 'ready' end || '.v1',
          gen_random_uuid(),
          jsonb_build_object(
            'apiVersion', 'customer-order-outbox.v1',
            'eventType', 'customer_order.' || case
              when v_event_version = v_order.status_version + 1
                then 'preparing' else 'ready' end || '.v1',
            'documentKind', 'customer_order',
            'fiscalStatus', 'not_created',
            'orderId', v_order.id,
            'orderCode', v_order.public_order_code,
            'shopId', p_shop_id,
            'status', case
              when v_event_version = v_order.status_version + 1
                then 'preparing' else 'ready' end,
            'statusVersion', v_event_version,
            'source', 'win7pos',
            'occurredAt', v_now
          ),
          'pending', v_now, v_now, v_now
        );
      end loop;
    else
      v_committed_version := v_order.status_version + 1;
      v_fiscal_status := case when p_pos_sale_id is null
        then 'not_created' else 'linked' end;

      update public.customer_orders
      set status = 'completed',
          status_version = v_committed_version,
          updated_at = v_now
      where id = v_order.id and status_version = v_order.status_version;

      insert into public.customer_order_status_events(
        order_id, shop_id, event_version, status, actor_kind,
        metadata_redacted, created_at
      ) values (
        v_order.id, p_shop_id, v_committed_version, 'completed', 'pos',
        jsonb_strip_nulls(jsonb_build_object(
          'source', 'win7pos',
          'outcome', 'completed',
          'fiscalStatus', v_fiscal_status
        )),
        v_now
      );

      insert into public.customer_order_outbox(
        order_id, shop_id, event_type, idempotency_key, payload,
        status, available_at, created_at, updated_at
      ) values (
        v_order.id, p_shop_id, 'customer_order.completed.v1', gen_random_uuid(),
        jsonb_strip_nulls(jsonb_build_object(
          'apiVersion', 'customer-order-outbox.v1',
          'eventType', 'customer_order.completed.v1',
          'documentKind', 'customer_order',
          'fiscalStatus', v_fiscal_status,
          'orderId', v_order.id,
          'orderCode', v_order.public_order_code,
          'shopId', p_shop_id,
          'status', 'completed',
          'statusVersion', v_committed_version,
          'source', 'win7pos',
          'occurredAt', v_now
        )),
        'pending', v_now, v_now, v_now
      );
    end if;

    if p_outcome in ('rejected', 'completed') then
      perform app_private.storefront_reservation_refresh_availability_v1(
        affected.source_product_id,
        v_now
      )
      from (
        select distinct item.source_product_id
        from public.customer_order_items item
        where item.shop_id = p_shop_id and item.order_id = v_order.id
      ) affected;
    end if;

    insert into public.audit_logs(
      actor_staff_id, scope, shop_id, event_key, severity, result,
      target_type, target_id, metadata_redacted
    ) values (
      p_staff_id,
      'shop',
      p_shop_id,
      'shop.storefront.order.pos.' || p_outcome || '.success',
      'info',
      'success',
      'customer_order',
      v_order.id::text,
      jsonb_build_object(
        'source', 'win7pos',
        'outcome', p_outcome,
        'fromStatus', v_order.status,
        'expectedStatusVersion', p_expected_status_version,
        'committedStatusVersion', v_committed_version,
        'fiscalStatus', v_fiscal_status,
        'requestId', p_ack_idempotency_key
      )
    );
  end if;

  if not app_private.pos_runtime_lease_is_valid_v1(
    p_shop_id,
    p_shop_device_id,
    p_staff_id,
    p_pos_session_id
  ) then
    raise exception 'POS runtime lease expired before order acknowledgement publication'
      using errcode = '42501';
  end if;

  v_result := jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'code', 'success',
    'schemaVersion', 'pos-customer-order-ack-v1',
    'handoffId', p_handoff_id,
    'orderId', v_order.id,
    'outcome', p_outcome,
    'orderStatus', case p_outcome
      when 'rejected' then 'rejected'
      when 'prepared' then 'ready'
      when 'completed' then 'completed'
      else v_order.status
    end,
    'orderStatusVersion', v_committed_version,
    'fiscalStatus', v_fiscal_status,
    'posSaleId', p_pos_sale_id,
    'idempotent', false,
    'serverTime', v_now
  ));

  insert into public.customer_order_pos_receipts(
    handoff_id, order_id, shop_id, shop_device_id, staff_id, pos_session_id,
    outcome, ack_idempotency_key, lease_token, expected_status_version,
    committed_status_version, request_sha256, pos_sale_id, response_payload,
    created_at
  ) values (
    p_handoff_id, v_order.id, p_shop_id, p_shop_device_id, p_staff_id,
    p_pos_session_id, p_outcome, p_ack_idempotency_key, p_lease_token,
    p_expected_status_version, v_committed_version, v_request_sha256,
    p_pos_sale_id, v_result, v_now
  );

  return v_result;
exception
  when insufficient_privilege then
    return jsonb_build_object(
      'ok', false,
      'code', 'denied',
      'schemaVersion', 'pos-customer-order-ack-v1'
    );
  when unique_violation then
    return jsonb_build_object(
      'ok', false,
      'code', 'conflict',
      'schemaVersion', 'pos-customer-order-ack-v1'
    );
  when check_violation or foreign_key_violation or not_null_violation then
    return jsonb_build_object(
      'ok', false,
      'code', 'validation_failed',
      'schemaVersion', 'pos-customer-order-ack-v1'
    );
end;
$$;

revoke all on function public.pos_customer_order_claim_v1(
  uuid, uuid, uuid, uuid, integer
) from public, anon, authenticated;
revoke all on function public.pos_customer_order_ack_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, text, bigint, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.pos_customer_order_claim_v1(
  uuid, uuid, uuid, uuid, integer
) to service_role;
grant execute on function public.pos_customer_order_ack_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, text, bigint, uuid, uuid
) to service_role;

comment on table public.customer_order_pos_receipts is
  'Append-only Win7POS delivery/outcome receipts. A row never creates a fiscal sale.';
comment on function public.pos_customer_order_claim_v1(
  uuid, uuid, uuid, uuid, integer
) is
  'Trusted-runtime, bounded and lease-based privacy-safe customer-order handoff.';
comment on function public.pos_customer_order_ack_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, text, bigint, uuid, uuid
) is
  'Idempotent operational acknowledgement; optional fiscal reference must identify a pre-existing same-device sale.';

notify pgrst, 'reload schema';

commit;
