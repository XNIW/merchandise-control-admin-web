-- Storefront v1 / TASK-032
--
-- Offline collection methods for v1, a private payment aggregate and a dormant
-- provider boundary. Payment, customer order and fiscal sale remain distinct.

begin;

create table public.storefront_payment_settings (
  shop_id uuid primary key references public.shops(shop_id) on delete cascade,
  pay_at_pickup_enabled boolean not null default false,
  cash_on_delivery_enabled boolean not null default false,
  online_payment_enabled boolean not null default false,
  online_provider text not null default 'none',
  revision bigint not null default 1,
  updated_by_profile_id uuid references public.profiles(profile_id)
    on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint storefront_payment_settings_provider_check check (
    online_provider = 'none'
    and not online_payment_enabled
  ),
  constraint storefront_payment_settings_revision_check check (revision >= 1),
  constraint storefront_payment_settings_time_check check (updated_at >= created_at)
);

create table public.customer_order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.customer_orders(id)
    on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  method text not null,
  status text not null,
  amount_clp bigint not null,
  currency_code text not null default 'CLP',
  provider_key text not null default 'none',
  provider_reference_sha256 text,
  failure_code text,
  status_version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  terminal_at timestamptz,
  constraint customer_order_payments_shop_id_id_unique unique (shop_id, id),
  constraint customer_order_payments_order_shop_fkey foreign key (shop_id, order_id)
    references public.customer_orders(shop_id, id) on delete cascade,
  constraint customer_order_payments_method_check check (
    method in ('pay_at_pickup', 'cash_on_delivery', 'online_payment')
  ),
  constraint customer_order_payments_status_check check (
    status in (
      'due_at_fulfillment', 'pending_provider', 'processing', 'authorized',
      'collected', 'failed', 'cancelled', 'refund_pending', 'refund_failed',
      'refunded'
    )
  ),
  constraint customer_order_payments_money_check check (
    currency_code = 'CLP' and amount_clp between 0 and 999999999999
  ),
  constraint customer_order_payments_provider_check check (
    (method in ('pay_at_pickup', 'cash_on_delivery') and provider_key = 'none')
    or (method = 'online_payment' and provider_key <> 'none')
  ),
  constraint customer_order_payments_provider_reference_check check (
    provider_reference_sha256 is null
    or provider_reference_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint customer_order_payments_failure_check check (
    failure_code is null
    or (
      failure_code = btrim(failure_code)
      and length(failure_code) between 1 and 80
      and failure_code ~ '^[a-z0-9_]+$'
    )
  ),
  constraint customer_order_payments_version_check check (status_version >= 1),
  constraint customer_order_payments_terminal_check check (
    (status in ('collected', 'failed', 'cancelled', 'refunded') and terminal_at is not null)
    or (status not in ('collected', 'failed', 'cancelled', 'refunded') and terminal_at is null)
  ),
  constraint customer_order_payments_time_check check (updated_at >= created_at)
);

create index customer_order_payments_owner_created_idx
  on public.customer_order_payments(user_id, created_at desc, id)
  where user_id is not null;
create index customer_order_payments_shop_status_idx
  on public.customer_order_payments(shop_id, status, updated_at, id);
create index customer_order_payments_shop_order_idx
  on public.customer_order_payments(shop_id, order_id);

create table public.customer_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.customer_order_payments(id)
    on delete cascade,
  shop_id uuid not null,
  attempt_number integer not null,
  idempotency_key uuid not null,
  status text not null,
  request_sha256 text not null,
  provider_key text not null default 'none',
  provider_attempt_sha256 text,
  failure_code text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint customer_payment_attempts_payment_shop_fkey foreign key (
    shop_id,
    payment_id
  ) references public.customer_order_payments(shop_id, id) on delete cascade,
  constraint customer_payment_attempts_number_unique unique (
    payment_id,
    attempt_number
  ),
  constraint customer_payment_attempts_key_unique unique (
    payment_id,
    idempotency_key
  ),
  constraint customer_payment_attempts_number_check check (
    attempt_number between 1 and 1000
  ),
  constraint customer_payment_attempts_status_check check (
    status in (
      'ready_for_fulfillment', 'pending_provider', 'processing', 'succeeded',
      'failed', 'cancelled', 'timed_out', 'refund_pending', 'refund_failed',
      'refunded'
    )
  ),
  constraint customer_payment_attempts_hash_check check (
    request_sha256 ~ '^[0-9a-f]{64}$'
    and (
      provider_attempt_sha256 is null
      or provider_attempt_sha256 ~ '^[0-9a-f]{64}$'
    )
  ),
  constraint customer_payment_attempts_provider_check check (
    provider_key = 'none' or provider_key ~ '^[a-z][a-z0-9_]{1,39}$'
  ),
  constraint customer_payment_attempts_failure_check check (
    failure_code is null
    or (
      failure_code = btrim(failure_code)
      and length(failure_code) between 1 and 80
      and failure_code ~ '^[a-z0-9_]+$'
    )
  ),
  constraint customer_payment_attempts_time_check check (updated_at >= created_at)
);

create index customer_payment_attempts_status_idx
  on public.customer_payment_attempts(status, updated_at, id);
create index customer_payment_attempts_shop_payment_idx
  on public.customer_payment_attempts(shop_id, payment_id);

create table public.customer_payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.customer_order_payments(id)
    on delete cascade,
  shop_id uuid not null,
  event_version bigint not null,
  event_type text not null,
  source text not null,
  provider_key text not null default 'none',
  provider_event_id_sha256 text,
  metadata_redacted jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint customer_payment_events_payment_shop_fkey foreign key (
    shop_id,
    payment_id
  ) references public.customer_order_payments(shop_id, id) on delete cascade,
  constraint customer_payment_events_version_unique unique (
    payment_id,
    event_version
  ),
  constraint customer_payment_events_provider_event_unique unique (
    provider_key,
    provider_event_id_sha256
  ),
  constraint customer_payment_events_version_check check (event_version >= 1),
  constraint customer_payment_events_type_check check (
    event_type in (
      'payment_due', 'provider_pending', 'processing', 'authorized',
      'collected', 'failed', 'cancelled', 'refund_pending', 'refund_failed',
      'refunded'
    )
  ),
  constraint customer_payment_events_source_check check (
    source in ('customer_order', 'admin', 'pos', 'provider', 'system')
  ),
  constraint customer_payment_events_provider_check check (
    provider_key = 'none' or provider_key ~ '^[a-z][a-z0-9_]{1,39}$'
  ),
  constraint customer_payment_events_provider_event_check check (
    provider_event_id_sha256 is null
    or provider_event_id_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint customer_payment_events_metadata_check check (
    jsonb_typeof(metadata_redacted) = 'object'
    and pg_column_size(metadata_redacted) <= 16384
  ),
  constraint customer_payment_events_occurred_check check (
    occurred_at <= created_at + interval '5 minutes'
  )
);

create index customer_payment_events_payment_created_idx
  on public.customer_payment_events(payment_id, event_version, created_at);
create index customer_payment_events_shop_payment_idx
  on public.customer_payment_events(shop_id, payment_id);

create table public.customer_payment_mutations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  payment_id uuid references public.customer_order_payments(id) on delete set null,
  order_id uuid references public.customer_orders(id) on delete set null,
  idempotency_key uuid not null,
  operation text not null,
  request_sha256 text not null,
  response_payload jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  retained_until timestamptz not null default (
    statement_timestamp() + interval '30 days'
  ),
  constraint customer_payment_mutations_owner_key_unique unique (
    user_id,
    shop_id,
    idempotency_key
  ),
  constraint customer_payment_mutations_operation_check check (
    operation in ('create_order', 'transition')
  ),
  constraint customer_payment_mutations_hash_check check (
    request_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint customer_payment_mutations_payload_check check (
    jsonb_typeof(response_payload) = 'object'
    and pg_column_size(response_payload) <= 524288
  ),
  constraint customer_payment_mutations_retention_check check (
    retained_until > created_at
  )
);

create index customer_payment_mutations_retention_idx
  on public.customer_payment_mutations(retained_until, id);
create index customer_payment_mutations_shop_created_idx
  on public.customer_payment_mutations(shop_id, created_at, id);
create index customer_payment_mutations_payment_idx
  on public.customer_payment_mutations(payment_id)
  where payment_id is not null;
create index customer_payment_mutations_order_idx
  on public.customer_payment_mutations(order_id)
  where order_id is not null;

create table public.customer_payment_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null,
  provider_event_id_sha256 text not null,
  payload_sha256 text not null,
  signature_validated boolean not null,
  status text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default statement_timestamp(),
  processed_at timestamptz,
  constraint customer_payment_webhook_receipts_event_unique unique (
    provider_key,
    provider_event_id_sha256
  ),
  constraint customer_payment_webhook_receipts_provider_check check (
    provider_key ~ '^[a-z][a-z0-9_]{1,39}$' and provider_key <> 'none'
  ),
  constraint customer_payment_webhook_receipts_hash_check check (
    provider_event_id_sha256 ~ '^[0-9a-f]{64}$'
    and payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint customer_payment_webhook_receipts_status_check check (
    status in ('accepted', 'duplicate', 'ignored', 'rejected')
  ),
  constraint customer_payment_webhook_receipts_time_check check (
    occurred_at <= received_at + interval '5 minutes'
    and (processed_at is null or processed_at >= received_at)
  )
);

create index customer_payment_webhook_receipts_received_idx
  on public.customer_payment_webhook_receipts(received_at desc, id);
create index storefront_payment_settings_actor_idx
  on public.storefront_payment_settings(updated_by_profile_id)
  where updated_by_profile_id is not null;

create or replace function app_private.customer_payment_guard_snapshot_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.order_id is distinct from old.order_id
    or (
      new.user_id is distinct from old.user_id
      and new.user_id is not null
    )
    or new.shop_id is distinct from old.shop_id
    or new.method is distinct from old.method
    or new.amount_clp is distinct from old.amount_clp
    or new.currency_code is distinct from old.currency_code
    or new.provider_key is distinct from old.provider_key
    or new.created_at is distinct from old.created_at then
    raise exception using
      errcode = '55000',
      message = 'customer_payment_snapshot_immutable';
  end if;
  return new;
end;
$$;

create or replace function app_private.customer_payment_event_guard_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'customer_payment_event_append_only';
end;
$$;

create trigger storefront_payment_settings_touch_updated_at
  before update on public.storefront_payment_settings
  for each row execute function app_private.storefront_touch_updated_at_v1();
create trigger customer_order_payments_guard_snapshot
  before update on public.customer_order_payments
  for each row execute function app_private.customer_payment_guard_snapshot_v1();
create trigger customer_order_payments_touch_updated_at
  before update on public.customer_order_payments
  for each row execute function app_private.storefront_touch_updated_at_v1();
create trigger customer_payment_attempts_touch_updated_at
  before update on public.customer_payment_attempts
  for each row execute function app_private.storefront_touch_updated_at_v1();
create trigger customer_payment_events_guard_append_only
  before update or delete on public.customer_payment_events
  for each row execute function app_private.customer_payment_event_guard_v1();

alter table public.storefront_payment_settings enable row level security;
alter table public.storefront_payment_settings force row level security;
alter table public.customer_order_payments enable row level security;
alter table public.customer_order_payments force row level security;
alter table public.customer_payment_attempts enable row level security;
alter table public.customer_payment_attempts force row level security;
alter table public.customer_payment_events enable row level security;
alter table public.customer_payment_events force row level security;
alter table public.customer_payment_mutations enable row level security;
alter table public.customer_payment_mutations force row level security;
alter table public.customer_payment_webhook_receipts enable row level security;
alter table public.customer_payment_webhook_receipts force row level security;

revoke all on table public.storefront_payment_settings
  from public, anon, authenticated;
revoke all on table public.customer_order_payments
  from public, anon, authenticated;
revoke all on table public.customer_payment_attempts
  from public, anon, authenticated;
revoke all on table public.customer_payment_events
  from public, anon, authenticated;
revoke all on table public.customer_payment_mutations
  from public, anon, authenticated;
revoke all on table public.customer_payment_webhook_receipts
  from public, anon, authenticated;

grant select, insert, update, delete on table public.storefront_payment_settings
  to service_role;
grant select, insert, update, delete on table public.customer_order_payments
  to service_role;
grant select, insert, update, delete on table public.customer_payment_attempts
  to service_role;
grant select, insert, update, delete on table public.customer_payment_events
  to service_role;
grant select, insert, update, delete on table public.customer_payment_mutations
  to service_role;
grant select, insert, update, delete on table public.customer_payment_webhook_receipts
  to service_role;

revoke all on function app_private.customer_payment_guard_snapshot_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.customer_payment_event_guard_v1()
  from public, anon, authenticated, service_role;

create or replace function app_private.customer_payment_error_v2(
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
    'apiVersion', 'customer-order.v2',
    'status', p_status,
    'idempotent', p_idempotent,
    'orderId', p_order_id,
    'serverTime', p_at
  ));
$$;

create or replace function app_private.customer_payment_public_payload_v1(
  p_payment_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'method', payment.method,
    'status', payment.status,
    'amountClp', payment.amount_clp,
    'currencyCode', payment.currency_code,
    'version', payment.status_version,
    'failureCode', payment.failure_code,
    'createdAt', payment.created_at,
    'updatedAt', payment.updated_at
  ))
  from public.customer_order_payments payment
  where payment.id = p_payment_id;
$$;

create or replace function app_private.customer_order_payload_v2(
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
  select
    (app_private.customer_order_payload_v1(
      p_order_id,
      p_status,
      p_idempotent,
      p_at
    ) - 'apiVersion')
    || pg_catalog.jsonb_build_object(
      'apiVersion', 'customer-order.v2',
      'payment', app_private.customer_payment_public_payload_v1(payment.id)
    )
  from public.customer_order_payments payment
  where payment.order_id = p_order_id;
$$;

create or replace function public.storefront_payment_options_v1(
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
  v_user_id uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_setting public.storefront_settings%rowtype;
  v_payment public.storefront_payment_settings%rowtype;
  v_pay_at_pickup boolean := false;
  v_cash_on_delivery boolean := false;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_shop_slug is null
    or p_shop_slug <> lower(btrim(p_shop_slug))
    or p_shop_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$' then
    return jsonb_build_object(
      'apiVersion', 'storefront-payment-options.v1',
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
      'apiVersion', 'storefront-payment-options.v1',
      'status', 'unavailable',
      'serverTime', v_now
    );
  end if;

  select payment.* into v_payment
  from public.storefront_payment_settings payment
  where payment.shop_id = v_setting.shop_id;
  if found then
    v_pay_at_pickup := v_payment.pay_at_pickup_enabled
      and (
        (
          v_setting.pickup_enabled
          and exists (
            select 1
            from public.storefront_fulfillment_slots slot
            join public.storefront_pickup_points point
              on point.shop_id = slot.shop_id
              and point.id = slot.pickup_point_id
            where slot.shop_id = v_setting.shop_id
              and slot.fulfillment_mode = 'pickup'
              and slot.enabled
              and point.enabled
              and slot.ends_at > v_now
              and slot.starts_at <= v_now + interval '14 days'
          )
        )
        or (
          v_setting.reservation_enabled
          and exists (
            select 1
            from public.storefront_fulfillment_slots slot
            join public.storefront_pickup_points point
              on point.shop_id = slot.shop_id
              and point.id = slot.pickup_point_id
            where slot.shop_id = v_setting.shop_id
              and slot.fulfillment_mode = 'reservation'
              and slot.enabled
              and point.enabled
              and slot.ends_at > v_now
              and slot.starts_at <= v_now + interval '14 days'
          )
        )
      );
    v_cash_on_delivery := v_payment.cash_on_delivery_enabled
      and v_setting.delivery_enabled
      and exists (
        select 1
        from public.storefront_fulfillment_slots slot
        join public.storefront_delivery_zones zone
          on zone.shop_id = slot.shop_id
          and zone.id = slot.delivery_zone_id
        where slot.shop_id = v_setting.shop_id
          and slot.fulfillment_mode = 'delivery'
          and slot.enabled
          and zone.enabled
          and slot.ends_at > v_now
          and slot.starts_at <= v_now + interval '14 days'
      );
  end if;

  return jsonb_build_object(
    'apiVersion', 'storefront-payment-options.v1',
    'status', 'ok',
    'shopSlug', p_shop_slug,
    'currencyCode', 'CLP',
    'methods', jsonb_build_array(
      jsonb_build_object(
        'method', 'pay_at_pickup',
        'enabled', v_pay_at_pickup,
        'fulfillmentModes', jsonb_build_array('pickup', 'reservation')
      ),
      jsonb_build_object(
        'method', 'cash_on_delivery',
        'enabled', v_cash_on_delivery,
        'fulfillmentModes', jsonb_build_array('delivery')
      ),
      jsonb_build_object(
        'method', 'online_payment',
        'enabled', false,
        'fulfillmentModes', '[]'::jsonb
      )
    ),
    'onlineConfiguration', 'not_configured',
    'serverTime', v_now
  );
end;
$$;

create or replace function public.admin_storefront_payment_read_v1(
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
  v_settings jsonb;
  v_audit jsonb := '[]'::jsonb;
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
    'configured', true,
    'payAtPickupEnabled', payment.pay_at_pickup_enabled,
    'cashOnDeliveryEnabled', payment.cash_on_delivery_enabled,
    'onlinePaymentEnabled', false,
    'onlineProvider', 'none',
    'revision', payment.revision,
    'updatedAt', payment.updated_at
  ) into v_settings
  from public.storefront_payment_settings payment
  where payment.shop_id = p_shop_id;

  if v_settings is null then
    v_settings := jsonb_build_object(
      'configured', false,
      'payAtPickupEnabled', false,
      'cashOnDeliveryEnabled', false,
      'onlinePaymentEnabled', false,
      'onlineProvider', 'none',
      'revision', 0,
      'updatedAt', null
    );
  end if;

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
        and audit.event_key = 'shop.storefront.payment.settings.success'
      order by audit.created_at desc, audit.audit_log_id desc
      limit 100
    ) audit;
  end if;

  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    raise exception 'Storefront Admin authorization expired before payment read'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'shop_id', p_shop_id,
    'settings', v_settings,
    'audit', v_audit
  );
exception
  when insufficient_privilege then
    return jsonb_build_object(
      'ok', false, 'code', 'session_expired', 'shop_id', p_shop_id
    );
end;
$$;

create or replace function public.admin_storefront_payment_mutate_v1(
  p_shop_id uuid,
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
  v_before jsonb;
  v_after jsonb;
  v_audit_id uuid;
  v_pay_at_pickup boolean;
  v_cash_on_delivery boolean;
  v_expected_revision bigint;
  v_current_revision bigint;
begin
  if p_shop_id is null
    or jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
    or pg_column_size(p_payload) > 8192
    or (p_payload - array[
      'payAtPickupEnabled', 'cashOnDeliveryEnabled',
      'onlinePaymentEnabled', 'expectedRevision'
    ]) <> '{}'::jsonb then
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
  if coalesce((p_payload->>'onlinePaymentEnabled')::boolean, false) then
    return jsonb_build_object(
      'ok', false, 'code', 'online_payment_not_configured', 'shop_id', p_shop_id
    );
  end if;

  v_actor_staff_id := case when auth.role() = 'service_role' then p_staff_id end;
  v_actor_profile_id := case when auth.role() = 'authenticated' then auth.uid() end;
  v_pay_at_pickup := coalesce(
    (p_payload->>'payAtPickupEnabled')::boolean,
    false
  );
  v_cash_on_delivery := coalesce(
    (p_payload->>'cashOnDeliveryEnabled')::boolean,
    false
  );
  v_expected_revision := coalesce(
    nullif(p_payload->>'expectedRevision', '')::bigint,
    0
  );
  if v_expected_revision < 0 then
    return jsonb_build_object(
      'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'storefront-payment-settings:' || p_shop_id::text,
    32032
  ));

  if v_pay_at_pickup and not exists (
    select 1
    from public.storefront_settings setting
    where setting.shop_id = p_shop_id
      and setting.storefront_enabled
      and (setting.pickup_enabled or setting.reservation_enabled)
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'pickup_configuration_required',
      'shop_id', p_shop_id
    );
  end if;
  if v_cash_on_delivery and not exists (
    select 1
    from public.storefront_settings setting
    where setting.shop_id = p_shop_id
      and setting.storefront_enabled
      and setting.delivery_enabled
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'delivery_configuration_required',
      'shop_id', p_shop_id
    );
  end if;

  select payment.revision, jsonb_build_object(
    'payAtPickupEnabled', payment.pay_at_pickup_enabled,
    'cashOnDeliveryEnabled', payment.cash_on_delivery_enabled,
    'onlinePaymentEnabled', false,
    'onlineProvider', 'none',
    'revision', payment.revision
  ) into v_current_revision, v_before
  from public.storefront_payment_settings payment
  where payment.shop_id = p_shop_id
  for update;

  if not found then
    v_current_revision := 0;
    v_before := jsonb_build_object(
      'payAtPickupEnabled', false,
      'cashOnDeliveryEnabled', false,
      'onlinePaymentEnabled', false,
      'onlineProvider', 'none',
      'revision', 0
    );
  end if;
  if v_current_revision <> v_expected_revision then
    return jsonb_build_object(
      'ok', false,
      'code', 'revision_conflict',
      'shop_id', p_shop_id,
      'current_revision', v_current_revision
    );
  end if;

  insert into public.storefront_payment_settings(
    shop_id,
    pay_at_pickup_enabled,
    cash_on_delivery_enabled,
    online_payment_enabled,
    online_provider,
    revision,
    updated_by_profile_id
  ) values (
    p_shop_id,
    v_pay_at_pickup,
    v_cash_on_delivery,
    false,
    'none',
    v_current_revision + 1,
    v_actor_profile_id
  )
  on conflict (shop_id) do update
  set pay_at_pickup_enabled = excluded.pay_at_pickup_enabled,
      cash_on_delivery_enabled = excluded.cash_on_delivery_enabled,
      online_payment_enabled = false,
      online_provider = 'none',
      revision = public.storefront_payment_settings.revision + 1,
      updated_by_profile_id = excluded.updated_by_profile_id;

  select jsonb_build_object(
    'payAtPickupEnabled', payment.pay_at_pickup_enabled,
    'cashOnDeliveryEnabled', payment.cash_on_delivery_enabled,
    'onlinePaymentEnabled', false,
    'onlineProvider', 'none',
    'revision', payment.revision
  ) into v_after
  from public.storefront_payment_settings payment
  where payment.shop_id = p_shop_id;

  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.settings.manage', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    raise exception 'Storefront Admin authorization expired before payment mutation'
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
    'shop.storefront.payment.settings.success',
    'info',
    'success',
    'storefront_payment_settings',
    p_shop_id::text,
    jsonb_build_object(
      'code', 'success',
      'source', 'storefront_admin',
      'before', v_before,
      'after', v_after
    )
  ) returning audit_log_id into v_audit_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'shop_id', p_shop_id,
    'target_id', p_shop_id,
    'audit_event_id', v_audit_id,
    'revision', v_current_revision + 1
  );
exception
  when invalid_text_representation or numeric_value_out_of_range
    or check_violation or foreign_key_violation or not_null_violation then
    return jsonb_build_object(
      'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
    );
  when insufficient_privilege then
    return jsonb_build_object(
      'ok', false, 'code', 'session_expired', 'shop_id', p_shop_id
    );
end;
$$;

create or replace function public.customer_order_create_v2(
  p_quote_id uuid,
  p_expected_quote_version bigint,
  p_payment_method text,
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
  v_setting public.storefront_settings%rowtype;
  v_payment_setting public.storefront_payment_settings%rowtype;
  v_previous public.customer_payment_mutations%rowtype;
  v_existing_order_id uuid;
  v_payment public.customer_order_payments%rowtype;
  v_request_sha256 text;
  v_order_result jsonb;
  v_result jsonb;
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
    or p_payment_method not in (
      'pay_at_pickup', 'cash_on_delivery', 'online_payment'
    )
    or p_idempotency_key is null then
    return app_private.customer_payment_error_v2('invalid', false, v_now);
  end if;

  select quote.* into v_quote
  from public.customer_checkout_quotes quote
  where quote.id = p_quote_id
    and quote.user_id = v_user_id;
  if not found then
    return app_private.customer_payment_error_v2('not_found', false, v_now);
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
    return app_private.customer_payment_error_v2('not_found', false, v_now);
  end if;

  v_request_sha256 := encode(extensions.digest(
    pg_catalog.convert_to(jsonb_build_array(
      'create-order-v2', p_quote_id, p_expected_quote_version, p_payment_method
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  delete from public.customer_payment_mutations mutation
  where mutation.user_id = v_user_id
    and mutation.shop_id = v_quote.shop_id
    and mutation.retained_until <= v_now;

  select mutation.* into v_previous
  from public.customer_payment_mutations mutation
  where mutation.user_id = v_user_id
    and mutation.shop_id = v_quote.shop_id
    and mutation.idempotency_key = p_idempotency_key;
  if found then
    if v_previous.operation <> 'create_order'
      or v_previous.request_sha256 <> v_request_sha256 then
      return app_private.customer_payment_error_v2(
        'idempotency_conflict',
        false,
        v_now,
        v_previous.order_id
      );
    end if;
    return jsonb_set(v_previous.response_payload, '{idempotent}', 'true'::jsonb);
  end if;

  select setting.* into v_setting
  from public.storefront_settings setting
  where setting.shop_id = v_quote.shop_id
    and setting.storefront_enabled;
  if not found then
    return app_private.customer_payment_error_v2(
      'payment_method_unavailable', false, v_now
    );
  end if;
  select payment.* into v_payment_setting
  from public.storefront_payment_settings payment
  where payment.shop_id = v_quote.shop_id;
  if not found then
    return app_private.customer_payment_error_v2(
      'payment_method_unavailable', false, v_now
    );
  end if;

  if p_payment_method = 'online_payment' then
    return app_private.customer_payment_error_v2(
      'online_payment_unavailable', false, v_now
    );
  elsif p_payment_method = 'pay_at_pickup'
    and (
      not v_payment_setting.pay_at_pickup_enabled
      or v_quote.fulfillment_mode not in ('pickup', 'reservation')
      or (
        v_quote.fulfillment_mode = 'pickup'
        and not v_setting.pickup_enabled
      )
      or (
        v_quote.fulfillment_mode = 'reservation'
        and not v_setting.reservation_enabled
      )
    ) then
    return app_private.customer_payment_error_v2(
      'payment_method_unavailable', false, v_now
    );
  elsif p_payment_method = 'cash_on_delivery'
    and (
      not v_payment_setting.cash_on_delivery_enabled
      or v_quote.fulfillment_mode <> 'delivery'
      or not v_setting.delivery_enabled
    ) then
    return app_private.customer_payment_error_v2(
      'payment_method_unavailable', false, v_now
    );
  end if;

  select customer_order.id into v_existing_order_id
  from public.customer_orders customer_order
  where customer_order.quote_id = v_quote.id
    and customer_order.user_id = v_user_id;
  if found then
    select payment.* into v_payment
    from public.customer_order_payments payment
    where payment.order_id = v_existing_order_id;
    if found then
      if v_payment.method <> p_payment_method then
        return app_private.customer_payment_error_v2(
          'payment_method_conflict', false, v_now, v_existing_order_id
        );
      end if;
      v_result := app_private.customer_order_payload_v2(
        v_existing_order_id,
        'ok',
        true,
        v_now
      );
      insert into public.customer_payment_mutations(
        user_id, shop_id, payment_id, order_id, idempotency_key,
        operation, request_sha256, response_payload
      ) values (
        v_user_id, v_quote.shop_id, v_payment.id, v_existing_order_id,
        p_idempotency_key, 'create_order', v_request_sha256, v_result
      );
      return v_result;
    end if;
  end if;

  v_order_result := public.customer_order_create_v1(
    p_quote_id,
    p_expected_quote_version,
    p_idempotency_key
  );
  if coalesce(v_order_result->>'status', '') <> 'ok'
    or nullif(v_order_result->>'orderId', '') is null then
    v_result := app_private.customer_payment_error_v2(
      coalesce(nullif(v_order_result->>'status', ''), 'unexpected'),
      coalesce((v_order_result->>'idempotent')::boolean, false),
      v_now,
      nullif(v_order_result->>'orderId', '')::uuid
    );
    insert into public.customer_payment_mutations(
      user_id, shop_id, order_id, idempotency_key,
      operation, request_sha256, response_payload
    ) values (
      v_user_id, v_quote.shop_id,
      nullif(v_order_result->>'orderId', '')::uuid,
      p_idempotency_key, 'create_order', v_request_sha256, v_result
    );
    return v_result;
  end if;

  v_existing_order_id := (v_order_result->>'orderId')::uuid;
  insert into public.customer_order_payments(
    order_id, user_id, shop_id, method, status,
    amount_clp, currency_code, provider_key,
    status_version, created_at, updated_at
  )
  select
    customer_order.id,
    customer_order.user_id,
    customer_order.shop_id,
    p_payment_method,
    'due_at_fulfillment',
    customer_order.total_clp,
    customer_order.currency_code,
    'none',
    1,
    v_now,
    v_now
  from public.customer_orders customer_order
  where customer_order.id = v_existing_order_id
    and customer_order.user_id = v_user_id
  returning * into v_payment;
  if not found then
    raise exception using
      errcode = '23514',
      message = 'customer payment order snapshot missing';
  end if;

  insert into public.customer_payment_attempts(
    payment_id, shop_id, attempt_number, idempotency_key,
    status, request_sha256, provider_key, created_at, updated_at
  ) values (
    v_payment.id, v_payment.shop_id, 1, p_idempotency_key,
    'ready_for_fulfillment', v_request_sha256, 'none', v_now, v_now
  );

  insert into public.customer_payment_events(
    payment_id, shop_id, event_version, event_type, source,
    provider_key, metadata_redacted, occurred_at, created_at
  ) values (
    v_payment.id,
    v_payment.shop_id,
    1,
    'payment_due',
    'customer_order',
    'none',
    jsonb_build_object(
      'collectionPoint', case p_payment_method
        when 'cash_on_delivery' then 'delivery'
        else 'pickup'
      end,
      'fiscalSaleCreated', false
    ),
    v_now,
    v_now
  );

  v_result := app_private.customer_order_payload_v2(
    v_existing_order_id,
    'ok',
    false,
    v_now
  );
  insert into public.customer_payment_mutations(
    user_id, shop_id, payment_id, order_id, idempotency_key,
    operation, request_sha256, response_payload
  ) values (
    v_user_id, v_quote.shop_id, v_payment.id, v_existing_order_id,
    p_idempotency_key, 'create_order', v_request_sha256, v_result
  );
  return v_result;
end;
$$;

create or replace function public.customer_order_read_v2(p_order_id uuid)
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
    return app_private.customer_payment_error_v2('invalid', true, v_now);
  end if;
  select customer_order.id into v_order_id
  from public.customer_orders customer_order
  join public.customer_order_payments payment
    on payment.order_id = customer_order.id
  where customer_order.id = p_order_id
    and customer_order.user_id = v_user_id;
  if not found then
    return app_private.customer_payment_error_v2('not_found', true, v_now);
  end if;
  return app_private.customer_order_payload_v2(v_order_id, 'ok', true, v_now);
end;
$$;

create or replace function public.service_customer_payment_transition_v1(
  p_payment_id uuid,
  p_target_status text,
  p_idempotency_key uuid,
  p_failure_code text default null,
  p_provider_reference_sha256 text default null,
  p_source text default 'system'
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
  v_payment public.customer_order_payments%rowtype;
  v_attempt public.customer_payment_attempts%rowtype;
  v_request_sha256 text;
  v_next_attempt integer;
  v_event_type text;
  v_attempt_status text;
  v_terminal_at timestamptz;
  v_changed boolean;
begin
  if auth.role() <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'service role required';
  end if;
  if p_payment_id is null
    or p_target_status not in (
      'due_at_fulfillment', 'pending_provider', 'processing', 'authorized',
      'collected', 'failed', 'cancelled', 'refund_pending', 'refund_failed',
      'refunded'
    )
    or p_idempotency_key is null
    or p_source not in ('admin', 'pos', 'provider', 'system')
    or (
      p_target_status in ('failed', 'refund_failed')
    ) <> (p_failure_code is not null)
    or (
      p_failure_code is not null
      and (
        p_failure_code <> btrim(p_failure_code)
        or length(p_failure_code) not between 1 and 80
        or p_failure_code !~ '^[a-z0-9_]+$'
      )
    )
    or (
      p_provider_reference_sha256 is not null
      and p_provider_reference_sha256 !~ '^[0-9a-f]{64}$'
    ) then
    return jsonb_build_object(
      'apiVersion', 'customer-payment-transition.v1',
      'status', 'invalid',
      'idempotent', false,
      'serverTime', v_now
    );
  end if;

  select payment.* into v_payment
  from public.customer_order_payments payment
  where payment.id = p_payment_id
  for update;
  if not found then
    return jsonb_build_object(
      'apiVersion', 'customer-payment-transition.v1',
      'status', 'not_found',
      'idempotent', false,
      'serverTime', v_now
    );
  end if;
  if v_payment.provider_key = 'none'
    and (p_provider_reference_sha256 is not null or p_source = 'provider') then
    return jsonb_build_object(
      'apiVersion', 'customer-payment-transition.v1',
      'status', 'provider_disabled',
      'idempotent', false,
      'payment', app_private.customer_payment_public_payload_v1(v_payment.id),
      'serverTime', v_now
    );
  end if;

  v_request_sha256 := encode(extensions.digest(
    pg_catalog.convert_to(jsonb_build_array(
      'payment-transition', p_payment_id, p_target_status,
      p_failure_code, p_provider_reference_sha256, p_source
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');
  select attempt.* into v_attempt
  from public.customer_payment_attempts attempt
  where attempt.payment_id = p_payment_id
    and attempt.idempotency_key = p_idempotency_key;
  if found then
    if v_attempt.request_sha256 <> v_request_sha256 then
      return jsonb_build_object(
        'apiVersion', 'customer-payment-transition.v1',
        'status', 'idempotency_conflict',
        'idempotent', false,
        'payment', app_private.customer_payment_public_payload_v1(v_payment.id),
        'serverTime', v_now
      );
    end if;
    return jsonb_build_object(
      'apiVersion', 'customer-payment-transition.v1',
      'status', 'ok',
      'idempotent', true,
      'payment', app_private.customer_payment_public_payload_v1(v_payment.id),
      'serverTime', v_now
    );
  end if;

  if p_target_status <> v_payment.status and not (
    (v_payment.status = 'due_at_fulfillment'
      and p_target_status in ('processing', 'collected', 'failed', 'cancelled'))
    or (v_payment.status = 'pending_provider'
      and p_target_status in ('processing', 'authorized', 'failed', 'cancelled'))
    or (v_payment.status = 'processing'
      and p_target_status in ('authorized', 'collected', 'failed', 'cancelled'))
    or (v_payment.status = 'authorized'
      and p_target_status in ('collected', 'cancelled'))
    or (v_payment.status = 'failed'
      and p_target_status in ('due_at_fulfillment', 'pending_provider'))
    or (v_payment.status = 'collected'
      and p_target_status = 'refund_pending')
    or (v_payment.status = 'refund_pending'
      and p_target_status in ('refunded', 'refund_failed'))
    or (v_payment.status = 'refund_failed'
      and p_target_status = 'refund_pending')
  ) then
    return jsonb_build_object(
      'apiVersion', 'customer-payment-transition.v1',
      'status', 'transition_conflict',
      'idempotent', false,
      'payment', app_private.customer_payment_public_payload_v1(v_payment.id),
      'serverTime', v_now
    );
  end if;

  v_next_attempt := coalesce((
    select max(attempt.attempt_number)
    from public.customer_payment_attempts attempt
    where attempt.payment_id = v_payment.id
  ), 0) + 1;
  v_attempt_status := case p_target_status
    when 'due_at_fulfillment' then 'ready_for_fulfillment'
    when 'pending_provider' then 'pending_provider'
    when 'processing' then 'processing'
    when 'authorized' then 'succeeded'
    when 'collected' then 'succeeded'
    when 'failed' then 'failed'
    when 'cancelled' then 'cancelled'
    when 'refund_pending' then 'refund_pending'
    when 'refund_failed' then 'refund_failed'
    when 'refunded' then 'refunded'
  end;
  v_event_type := case p_target_status
    when 'due_at_fulfillment' then 'payment_due'
    when 'pending_provider' then 'provider_pending'
    else p_target_status
  end;
  v_terminal_at := case
    when p_target_status in ('collected', 'failed', 'cancelled', 'refunded')
      then v_now
    else null
  end;

  insert into public.customer_payment_attempts(
    payment_id, shop_id, attempt_number, idempotency_key,
    status, request_sha256, provider_key, provider_attempt_sha256,
    failure_code, created_at, updated_at
  ) values (
    v_payment.id, v_payment.shop_id, v_next_attempt, p_idempotency_key,
    v_attempt_status, v_request_sha256, v_payment.provider_key,
    p_provider_reference_sha256, p_failure_code, v_now, v_now
  );

  v_changed := p_target_status <> v_payment.status;
  if v_changed then
    update public.customer_order_payments payment
    set status = p_target_status,
        status_version = payment.status_version + 1,
        provider_reference_sha256 = coalesce(
          p_provider_reference_sha256,
          payment.provider_reference_sha256
        ),
        failure_code = case
          when p_target_status in ('failed', 'refund_failed') then p_failure_code
          else null
        end,
        terminal_at = v_terminal_at
    where payment.id = v_payment.id
    returning * into v_payment;

    insert into public.customer_payment_events(
      payment_id, shop_id, event_version, event_type, source,
      provider_key, metadata_redacted, occurred_at, created_at
    ) values (
      v_payment.id,
      v_payment.shop_id,
      v_payment.status_version,
      v_event_type,
      p_source,
      v_payment.provider_key,
      jsonb_strip_nulls(jsonb_build_object(
        'failureCode', p_failure_code,
        'fiscalSaleCreated', false
      )),
      v_now,
      v_now
    );
  end if;

  return jsonb_build_object(
    'apiVersion', 'customer-payment-transition.v1',
    'status', 'ok',
    'idempotent', not v_changed,
    'payment', app_private.customer_payment_public_payload_v1(v_payment.id),
    'serverTime', v_now
  );
end;
$$;

create or replace function public.service_customer_payment_webhook_receive_v1(
  p_provider_key text,
  p_provider_event_id_sha256 text,
  p_payload_sha256 text,
  p_signature_validated boolean,
  p_occurred_at timestamptz
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
  v_receipt_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'service role required';
  end if;
  if p_provider_key is null
    or p_provider_key !~ '^[a-z][a-z0-9_]{1,39}$'
    or p_provider_key = 'none'
    or p_provider_event_id_sha256 !~ '^[0-9a-f]{64}$'
    or p_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_occurred_at is null
    or p_occurred_at < v_now - interval '5 minutes'
    or p_occurred_at > v_now + interval '5 minutes' then
    return jsonb_build_object(
      'apiVersion', 'customer-payment-webhook.v1',
      'status', 'invalid',
      'idempotent', false,
      'serverTime', v_now
    );
  end if;
  if not coalesce(p_signature_validated, false) then
    return jsonb_build_object(
      'apiVersion', 'customer-payment-webhook.v1',
      'status', 'invalid_signature',
      'idempotent', false,
      'serverTime', v_now
    );
  end if;
  if not exists (
    select 1
    from public.storefront_payment_settings payment
    where payment.online_payment_enabled
      and payment.online_provider = p_provider_key
  ) then
    return jsonb_build_object(
      'apiVersion', 'customer-payment-webhook.v1',
      'status', 'provider_disabled',
      'idempotent', false,
      'serverTime', v_now
    );
  end if;

  insert into public.customer_payment_webhook_receipts(
    provider_key, provider_event_id_sha256, payload_sha256,
    signature_validated, status, occurred_at, processed_at
  ) values (
    p_provider_key, p_provider_event_id_sha256, p_payload_sha256,
    true, 'accepted', p_occurred_at, v_now
  )
  on conflict (provider_key, provider_event_id_sha256) do nothing
  returning id into v_receipt_id;
  if v_receipt_id is null then
    return jsonb_build_object(
      'apiVersion', 'customer-payment-webhook.v1',
      'status', 'duplicate',
      'idempotent', true,
      'serverTime', v_now
    );
  end if;
  return jsonb_build_object(
    'apiVersion', 'customer-payment-webhook.v1',
    'status', 'accepted',
    'idempotent', false,
    'serverTime', v_now
  );
end;
$$;

revoke all on function app_private.customer_payment_error_v2(
  text, boolean, timestamptz, uuid
) from public, anon, authenticated, service_role;
revoke all on function app_private.customer_payment_public_payload_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.customer_order_payload_v2(
  uuid, text, boolean, timestamptz
) from public, anon, authenticated, service_role;

revoke all on function public.storefront_payment_options_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_storefront_payment_read_v1(
  uuid, uuid, uuid, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.admin_storefront_payment_mutate_v1(
  uuid, jsonb, uuid, uuid, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.customer_order_create_v2(
  uuid, bigint, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.customer_order_read_v2(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.service_customer_payment_transition_v1(
  uuid, text, uuid, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.service_customer_payment_webhook_receive_v1(
  text, text, text, boolean, timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.storefront_payment_options_v1(text)
  to authenticated;
grant execute on function public.admin_storefront_payment_read_v1(
  uuid, uuid, uuid, text, integer
) to authenticated, service_role;
grant execute on function public.admin_storefront_payment_mutate_v1(
  uuid, jsonb, uuid, uuid, text, integer
) to authenticated, service_role;
grant execute on function public.customer_order_create_v2(
  uuid, bigint, text, uuid
) to authenticated;
grant execute on function public.customer_order_read_v2(uuid)
  to authenticated;
grant execute on function public.service_customer_payment_transition_v1(
  uuid, text, uuid, text, text, text
) to service_role;
grant execute on function public.service_customer_payment_webhook_receive_v1(
  text, text, text, boolean, timestamptz
) to service_role;

comment on table public.storefront_payment_settings is
  'Shop-scoped Storefront collection methods. Online payment is fail-closed until a provider-specific migration is approved.';
comment on table public.customer_order_payments is
  'Private server-authoritative payment aggregate. It is neither a customer order nor a fiscal sale.';
comment on table public.customer_payment_attempts is
  'Idempotent payment attempt ledger without raw provider references or credentials.';
comment on table public.customer_payment_events is
  'Append-only payment lifecycle events with redacted metadata.';
comment on table public.customer_payment_webhook_receipts is
  'Replay-safe hashed provider webhook receipt ledger; dormant while online payment is disabled.';
comment on function public.customer_order_create_v2(uuid, bigint, text, uuid) is
  'Creates an order plus server-derived payment snapshot without accepting a client amount, discount or payment status.';
comment on function public.service_customer_payment_transition_v1(
  uuid, text, uuid, text, text, text
) is
  'Service-only idempotent payment state transition. No transition creates a fiscal sale.';

notify pgrst, 'reload schema';

commit;
