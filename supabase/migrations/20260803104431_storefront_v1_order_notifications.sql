-- Storefront v1 / TASK-031
--
-- Private, owner-scoped order notification pipeline. The order status timeline is the
-- authority; notification events and per-device deliveries are derived, retryable
-- hints. Raw routing tokens leave the database only through a service-role-only claim
-- RPC and are never copied into the lock-screen payload or persistent receipts.

begin;

alter table public.storefront_settings
  add column customer_order_push_enabled boolean not null default false;

create table public.customer_notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  shop_slug text not null,
  source_kind text not null,
  source_event_id uuid references public.customer_order_status_events(id)
    on delete cascade,
  order_id uuid references public.customer_orders(id) on delete cascade,
  reservation_hold_id uuid references public.customer_reservation_holds(id)
    on delete cascade,
  event_key text not null,
  event_version bigint not null,
  route_token uuid not null default gen_random_uuid(),
  public_order_code_short text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint customer_notification_events_route_unique unique (route_token),
  constraint customer_notification_events_shop_slug_check check (
    shop_slug = lower(btrim(shop_slug))
    and shop_slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'
  ),
  constraint customer_notification_events_source_kind_check check (
    source_kind in ('order_status', 'reservation_hold')
  ),
  constraint customer_notification_events_event_key_check check (
    event_key in (
      'confirmed', 'rejected', 'preparing', 'ready',
      'out_for_delivery', 'completed', 'cancelled',
      'reservation_expiring'
    )
  ),
  constraint customer_notification_events_source_check check (
    (
      source_kind = 'order_status'
      and source_event_id is not null
      and order_id is not null
      and reservation_hold_id is null
      and event_key <> 'reservation_expiring'
      and event_version >= 1
      and public_order_code_short ~ '^[0-9A-F]{6}$'
    )
    or (
      source_kind = 'reservation_hold'
      and source_event_id is null
      and order_id is null
      and reservation_hold_id is not null
      and event_key = 'reservation_expiring'
      and event_version = 1
      and public_order_code_short is null
    )
  ),
  constraint customer_notification_events_time_check check (
    pg_catalog.isfinite(occurred_at) and created_at >= occurred_at
  )
);

create unique index customer_notification_events_order_source_idx
  on public.customer_notification_events(source_event_id)
  where source_kind = 'order_status';
create unique index customer_notification_events_hold_source_idx
  on public.customer_notification_events(reservation_hold_id, event_key)
  where source_kind = 'reservation_hold';
create index customer_notification_events_owner_route_idx
  on public.customer_notification_events(user_id, shop_id, route_token);
create index customer_notification_events_order_version_idx
  on public.customer_notification_events(order_id, event_version desc)
  where source_kind = 'order_status';

create table public.customer_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.customer_notification_events(id)
    on delete cascade,
  device_id uuid not null references public.customer_devices(id) on delete cascade,
  destination_generation bigint not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  available_at timestamptz not null default statement_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  delivered_at timestamptz,
  provider_message_id_hash bytea,
  last_error_code text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  retained_until timestamptz not null
    default (statement_timestamp() + interval '30 days'),
  constraint customer_notification_deliveries_destination_unique unique (
    event_id,
    device_id,
    destination_generation
  ),
  constraint customer_notification_deliveries_generation_check check (
    destination_generation >= 1
  ),
  constraint customer_notification_deliveries_status_check check (
    status in ('pending', 'leased', 'delivered', 'suppressed', 'dead_letter')
  ),
  constraint customer_notification_deliveries_attempt_check check (
    attempt_count between 0 and 8
  ),
  constraint customer_notification_deliveries_lease_check check (
    (
      status = 'leased'
      and lease_token is not null
      and lease_expires_at is not null
    )
    or (
      status <> 'leased'
      and lease_token is null
      and lease_expires_at is null
    )
  ),
  constraint customer_notification_deliveries_delivered_check check (
    (status = 'delivered' and delivered_at is not null)
    or (status <> 'delivered' and delivered_at is null)
  ),
  constraint customer_notification_deliveries_provider_hash_check check (
    provider_message_id_hash is null
    or pg_catalog.octet_length(provider_message_id_hash) = 32
  ),
  constraint customer_notification_deliveries_error_check check (
    last_error_code is null
    or (
      last_error_code = btrim(last_error_code)
      and length(last_error_code) between 1 and 80
      and last_error_code ~ '^[a-z0-9_]+$'
    )
  ),
  constraint customer_notification_deliveries_retention_check check (
    retained_until > created_at
  )
);

create index customer_notification_deliveries_claim_idx
  on public.customer_notification_deliveries(
    status,
    available_at,
    created_at,
    id
  ) where status in ('pending', 'leased');
create index customer_notification_deliveries_device_idx
  on public.customer_notification_deliveries(
    device_id,
    destination_generation,
    status,
    id
  );
create index customer_notification_deliveries_retention_idx
  on public.customer_notification_deliveries(retained_until, id);

create table public.customer_notification_receipts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.customer_notification_deliveries(id)
    on delete cascade,
  ack_idempotency_key uuid not null,
  request_sha256 bytea not null,
  response_payload jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  retained_until timestamptz not null
    default (statement_timestamp() + interval '30 days'),
  constraint customer_notification_receipts_ack_key_unique
    unique (ack_idempotency_key),
  constraint customer_notification_receipts_digest_check check (
    pg_catalog.octet_length(request_sha256) = 32
  ),
  constraint customer_notification_receipts_payload_check check (
    jsonb_typeof(response_payload) = 'object'
    and pg_column_size(response_payload) <= 8192
  ),
  constraint customer_notification_receipts_retention_check check (
    retained_until > created_at
  )
);

create index customer_notification_receipts_delivery_idx
  on public.customer_notification_receipts(delivery_id, created_at, id);
create index customer_notification_receipts_retention_idx
  on public.customer_notification_receipts(retained_until, id);

create trigger customer_notification_deliveries_touch_updated_at
  before update on public.customer_notification_deliveries
  for each row execute function app_private.storefront_touch_updated_at_v1();

alter table public.customer_notification_events enable row level security;
alter table public.customer_notification_events force row level security;
alter table public.customer_notification_deliveries enable row level security;
alter table public.customer_notification_deliveries force row level security;
alter table public.customer_notification_receipts enable row level security;
alter table public.customer_notification_receipts force row level security;

revoke all on table public.customer_notification_events
  from public, anon, authenticated;
revoke all on table public.customer_notification_deliveries
  from public, anon, authenticated;
revoke all on table public.customer_notification_receipts
  from public, anon, authenticated;
grant select, insert, update, delete on table public.customer_notification_events
  to service_role;
grant select, insert, update, delete on table public.customer_notification_deliveries
  to service_role;
grant select, insert, update, delete on table public.customer_notification_receipts
  to service_role;

create or replace function app_private.customer_notification_event_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'customer_notification_event_append_only';
end;
$$;

create or replace function app_private.customer_notification_delivery_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.event_id is distinct from old.event_id
    or new.device_id is distinct from old.device_id
    or new.destination_generation is distinct from old.destination_generation
    or new.created_at is distinct from old.created_at
    or new.retained_until is distinct from old.retained_until then
    raise exception using
      errcode = '55000',
      message = 'customer_notification_delivery_envelope_immutable';
  end if;
  return new;
end;
$$;

create trigger customer_notification_events_guard
  before update on public.customer_notification_events
  for each row execute function app_private.customer_notification_event_guard_v1();
create trigger customer_notification_deliveries_guard
  before update on public.customer_notification_deliveries
  for each row execute function app_private.customer_notification_delivery_guard_v1();
create trigger customer_notification_receipts_guard
  before update on public.customer_notification_receipts
  for each row execute function app_private.customer_notification_event_guard_v1();

create or replace function app_private.customer_notification_materialize_v1(
  p_event_id uuid,
  p_at timestamptz
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.customer_notification_deliveries(
    event_id,
    device_id,
    destination_generation,
    status,
    available_at,
    created_at,
    updated_at,
    retained_until
  )
  select
    notification_event.id,
    device.id,
    device.registration_version,
    'pending',
    p_at,
    p_at,
    p_at,
    p_at + interval '30 days'
  from public.customer_notification_events notification_event
  join public.customer_devices device
    on device.user_id = notification_event.user_id
  where notification_event.id = p_event_id
    and device.consent_status = 'granted'
    and device.permission_status in ('authorized', 'provisional')
    and device.push_token is not null
    and device.push_token_hash is not null
    and device.expires_at > p_at
  on conflict (event_id, device_id, destination_generation) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function app_private.customer_notification_order_event_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  if new.status not in (
    'confirmed', 'rejected', 'preparing', 'ready',
    'out_for_delivery', 'completed', 'cancelled'
  ) then
    return new;
  end if;

  insert into public.customer_notification_events(
    user_id,
    shop_id,
    shop_slug,
    source_kind,
    source_event_id,
    order_id,
    event_key,
    event_version,
    public_order_code_short,
    occurred_at,
    created_at
  )
  select
    customer_order.user_id,
    customer_order.shop_id,
    setting.public_slug,
    'order_status',
    new.id,
    customer_order.id,
    new.status,
    new.event_version,
    right(customer_order.public_order_code, 6),
    new.created_at,
    greatest(statement_timestamp(), new.created_at)
  from public.customer_orders customer_order
  join public.storefront_settings setting
    on setting.shop_id = customer_order.shop_id
  where customer_order.id = new.order_id
    and customer_order.shop_id = new.shop_id
    and customer_order.user_id is not null
  on conflict do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select notification_event.id
    into v_event_id
    from public.customer_notification_events notification_event
    where notification_event.source_kind = 'order_status'
      and notification_event.source_event_id = new.id;
  end if;
  if v_event_id is not null then
    perform app_private.customer_notification_materialize_v1(
      v_event_id,
      statement_timestamp()
    );
  end if;
  return new;
end;
$$;

create trigger customer_order_status_events_notify
  after insert on public.customer_order_status_events
  for each row execute function app_private.customer_notification_order_event_v1();

create or replace function app_private.customer_notification_enqueue_expiring_v1(
  p_at timestamptz,
  p_limit integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_count integer := 0;
begin
  if p_at is null or p_limit not between 1 and 500 then
    return 0;
  end if;
  for v_event_id in
    insert into public.customer_notification_events(
      user_id,
      shop_id,
      shop_slug,
      source_kind,
      reservation_hold_id,
      event_key,
      event_version,
      occurred_at,
      created_at
    )
    select
      reservation_hold.user_id,
      reservation_hold.shop_id,
      setting.public_slug,
      'reservation_hold',
      reservation_hold.id,
      'reservation_expiring',
      1,
      p_at,
      p_at
    from public.customer_reservation_holds reservation_hold
    join public.storefront_settings setting
      on setting.shop_id = reservation_hold.shop_id
    where reservation_hold.status = 'active'
      and reservation_hold.expires_at > p_at
      and reservation_hold.expires_at <= p_at + interval '15 minutes'
      and setting.customer_order_push_enabled
      and not exists (
        select 1
        from public.customer_notification_events existing
        where existing.source_kind = 'reservation_hold'
          and existing.reservation_hold_id = reservation_hold.id
          and existing.event_key = 'reservation_expiring'
      )
    order by reservation_hold.expires_at, reservation_hold.id
    limit p_limit
    on conflict do nothing
    returning id
  loop
    perform app_private.customer_notification_materialize_v1(v_event_id, p_at);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function app_private.customer_notification_payload_v1(
  p_event public.customer_notification_events,
  p_locale text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'apiVersion', 'customer-notification.v1',
    'event', p_event.event_key,
    'title', case p_locale
      when 'it' then case when p_event.event_key = 'reservation_expiring'
        then 'Prenotazione in scadenza' else 'Aggiornamento ordine' end
      when 'en' then case when p_event.event_key = 'reservation_expiring'
        then 'Reservation expiring' else 'Order update' end
      when 'zh-Hans' then case when p_event.event_key = 'reservation_expiring'
        then '预留即将到期' else '订单更新' end
      else case when p_event.event_key = 'reservation_expiring'
        then 'Reserva por vencer' else 'Actualización de pedido' end
    end,
    'body', case p_locale
      when 'it' then case p_event.event_key
        when 'confirmed' then 'Il tuo ordine è stato confermato.'
        when 'rejected' then 'Il tuo ordine non può essere accettato.'
        when 'preparing' then 'Il tuo ordine è in preparazione.'
        when 'ready' then 'Il tuo ordine è pronto.'
        when 'out_for_delivery' then 'Il tuo ordine è in consegna.'
        when 'completed' then 'Il tuo ordine è stato completato.'
        when 'cancelled' then 'Il tuo ordine è stato annullato.'
        else 'La tua prenotazione scade a breve.'
      end
      when 'en' then case p_event.event_key
        when 'confirmed' then 'Your order has been confirmed.'
        when 'rejected' then 'Your order could not be accepted.'
        when 'preparing' then 'Your order is being prepared.'
        when 'ready' then 'Your order is ready.'
        when 'out_for_delivery' then 'Your order is out for delivery.'
        when 'completed' then 'Your order has been completed.'
        when 'cancelled' then 'Your order has been cancelled.'
        else 'Your reservation expires soon.'
      end
      when 'zh-Hans' then case p_event.event_key
        when 'confirmed' then '您的订单已确认。'
        when 'rejected' then '您的订单无法被接受。'
        when 'preparing' then '您的订单正在准备中。'
        when 'ready' then '您的订单已可取。'
        when 'out_for_delivery' then '您的订单正在配送。'
        when 'completed' then '您的订单已完成。'
        when 'cancelled' then '您的订单已取消。'
        else '您的预留即将到期。'
      end
      else case p_event.event_key
        when 'confirmed' then 'Tu pedido fue confirmado.'
        when 'rejected' then 'Tu pedido no pudo ser aceptado.'
        when 'preparing' then 'Tu pedido está en preparación.'
        when 'ready' then 'Tu pedido está listo.'
        when 'out_for_delivery' then 'Tu pedido va en camino.'
        when 'completed' then 'Tu pedido fue completado.'
        when 'cancelled' then 'Tu pedido fue cancelado.'
        else 'Tu reserva vence pronto.'
      end
    end,
    'orderCode', case when p_event.public_order_code_short is null
      then null else '…' || p_event.public_order_code_short end,
    'deepLink', 'com.xniw.clientmerchandisecontrol://storefront/' ||
      p_event.shop_slug || '/notification/' || p_event.route_token::text
  ));
$$;

create or replace function public.customer_notification_claim_v1(
  p_limit integer,
  p_lease_seconds integer,
  p_dispatcher_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_deliveries jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_limit not between 1 and 100
    or p_lease_seconds not between 5 and 300
    or p_dispatcher_id is null then
    return jsonb_build_object(
      'apiVersion', 'customer-notification-dispatch.v1',
      'status', 'invalid',
      'deliveries', '[]'::jsonb
    );
  end if;

  perform app_private.customer_notification_enqueue_expiring_v1(v_now, p_limit);

  update public.customer_notification_deliveries delivery
  set status = case when delivery.attempt_count >= 5
      then 'dead_letter' else 'pending' end,
      available_at = case when delivery.attempt_count >= 5
        then delivery.available_at else v_now end,
      lease_token = null,
      lease_expires_at = null,
      last_error_code = case when delivery.attempt_count >= 5
        then 'retry_budget_exhausted' else 'lease_expired' end
  where delivery.status = 'leased'
    and delivery.lease_expires_at <= v_now;

  update public.customer_notification_deliveries delivery
  set status = 'suppressed',
      lease_token = null,
      lease_expires_at = null,
      last_error_code = case when
        notification_event.source_kind = 'order_status'
        and delivery.status = 'pending'
        and exists (
          select 1
          from public.customer_notification_events newer_event
          where newer_event.order_id = notification_event.order_id
            and newer_event.source_kind = 'order_status'
            and newer_event.event_version > notification_event.event_version
        )
        then 'superseded_event'
        else 'destination_ineligible'
      end
  from public.customer_notification_events notification_event
  join public.customer_devices device
    on device.user_id = notification_event.user_id
  join public.storefront_settings setting
    on setting.shop_id = notification_event.shop_id
  where delivery.event_id = notification_event.id
    and delivery.device_id = device.id
    and delivery.status in ('pending', 'leased')
    and (
      delivery.destination_generation <> device.registration_version
      or device.consent_status <> 'granted'
      or device.permission_status not in ('authorized', 'provisional')
      or device.push_token is null
      or device.push_token_hash is null
      or device.expires_at is null
      or device.expires_at <= v_now
      or (
        notification_event.source_kind = 'order_status'
        and delivery.status = 'pending'
        and exists (
          select 1
          from public.customer_notification_events newer_event
          where newer_event.order_id = notification_event.order_id
            and newer_event.source_kind = 'order_status'
            and newer_event.event_version > notification_event.event_version
        )
      )
      or (
        notification_event.source_kind = 'reservation_hold'
        and not exists (
          select 1
          from public.customer_reservation_holds reservation_hold
          where reservation_hold.id = notification_event.reservation_hold_id
            and reservation_hold.user_id = notification_event.user_id
            and reservation_hold.status = 'active'
            and reservation_hold.expires_at > v_now
        )
      )
    );

  with candidates as (
    select delivery.id
    from public.customer_notification_deliveries delivery
    join public.customer_notification_events notification_event
      on notification_event.id = delivery.event_id
    join public.customer_devices device
      on device.id = delivery.device_id
     and device.user_id = notification_event.user_id
    join public.storefront_settings setting
      on setting.shop_id = notification_event.shop_id
    where delivery.status = 'pending'
      and delivery.available_at <= v_now
      and delivery.attempt_count < 5
      and delivery.destination_generation = device.registration_version
      and device.consent_status = 'granted'
      and device.permission_status in ('authorized', 'provisional')
      and device.push_token is not null
      and device.push_token_hash is not null
      and device.expires_at > v_now
      and setting.customer_order_push_enabled
      and (
        notification_event.source_kind <> 'order_status'
        or not exists (
          select 1
          from public.customer_notification_events newer_event
          where newer_event.order_id = notification_event.order_id
            and newer_event.source_kind = 'order_status'
            and newer_event.event_version > notification_event.event_version
        )
      )
      and (
        notification_event.source_kind = 'order_status'
        or exists (
          select 1
          from public.customer_reservation_holds reservation_hold
          where reservation_hold.id = notification_event.reservation_hold_id
            and reservation_hold.user_id = notification_event.user_id
            and reservation_hold.status = 'active'
            and reservation_hold.expires_at > v_now
        )
      )
    order by delivery.available_at, delivery.created_at, delivery.id
    for update of delivery skip locked
    limit p_limit
  ), leased as (
    update public.customer_notification_deliveries delivery
    set status = 'leased',
        attempt_count = delivery.attempt_count + 1,
        lease_token = gen_random_uuid(),
        lease_expires_at = v_now + pg_catalog.make_interval(
          secs => p_lease_seconds
        ),
        last_error_code = null
    from candidates
    where delivery.id = candidates.id
    returning delivery.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'deliveryId', leased.id,
    'leaseToken', leased.lease_token,
    'destinationGeneration', leased.destination_generation,
    'attempt', leased.attempt_count,
    'platform', device.platform,
    'pushToken', device.push_token,
    'payload', app_private.customer_notification_payload_v1(
      notification_event,
      device.locale
    )
  ) order by leased.created_at, leased.id), '[]'::jsonb)
  into v_deliveries
  from leased
  join public.customer_notification_events notification_event
    on notification_event.id = leased.event_id
  join public.customer_devices device on device.id = leased.device_id;

  return jsonb_build_object(
    'apiVersion', 'customer-notification-dispatch.v1',
    'status', 'ok',
    'dispatcherId', p_dispatcher_id,
    'claimedAt', v_now,
    'deliveries', v_deliveries
  );
end;
$$;

create or replace function public.customer_notification_ack_v1(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_destination_generation bigint,
  p_outcome text,
  p_ack_idempotency_key uuid,
  p_provider_message_id text default null,
  p_error_code text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_delivery public.customer_notification_deliveries%rowtype;
  v_device public.customer_devices%rowtype;
  v_previous public.customer_notification_receipts%rowtype;
  v_request_sha256 bytea;
  v_status text;
  v_code text := 'success';
  v_result jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_delivery_id is null
    or p_lease_token is null
    or p_ack_idempotency_key is null
    or coalesce(p_destination_generation, 0) < 1
    or p_outcome not in (
      'delivered', 'retryable', 'invalid_token', 'permanent_failure'
    )
    or (
      p_provider_message_id is not null
      and (
        p_provider_message_id <> btrim(p_provider_message_id)
        or length(p_provider_message_id) not between 1 and 512
        or p_provider_message_id ~ '[[:cntrl:]]'
      )
    )
    or (
      p_error_code is not null
      and (
        p_error_code <> btrim(p_error_code)
        or length(p_error_code) not between 1 and 80
        or p_error_code !~ '^[a-z0-9_]+$'
      )
    ) then
    return jsonb_build_object(
      'apiVersion', 'customer-notification-ack.v1',
      'status', 'invalid',
      'idempotent', false
    );
  end if;

  v_request_sha256 := extensions.digest(
    pg_catalog.convert_to(pg_catalog.jsonb_build_array(
      p_delivery_id,
      p_lease_token,
      p_destination_generation,
      p_outcome,
      coalesce(p_provider_message_id, ''),
      coalesce(p_error_code, '')
    )::text, 'UTF8'),
    'sha256'
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer-notification-ack:' || p_ack_idempotency_key::text,
    31031
  ));

  select receipt.* into v_previous
  from public.customer_notification_receipts receipt
  where receipt.ack_idempotency_key = p_ack_idempotency_key;
  if found then
    if v_previous.delivery_id <> p_delivery_id
      or v_previous.request_sha256 <> v_request_sha256 then
      return jsonb_build_object(
        'apiVersion', 'customer-notification-ack.v1',
        'status', 'idempotency_conflict',
        'idempotent', false
      );
    end if;
    return jsonb_set(
      v_previous.response_payload,
      '{idempotent}',
      'true'::jsonb
    );
  end if;

  select delivery.* into v_delivery
  from public.customer_notification_deliveries delivery
  where delivery.id = p_delivery_id
  for update;
  if not found then
    return jsonb_build_object(
      'apiVersion', 'customer-notification-ack.v1',
      'status', 'not_found',
      'idempotent', false
    );
  end if;

  if v_delivery.status <> 'leased'
    or v_delivery.lease_token <> p_lease_token
    or v_delivery.lease_expires_at <= v_now
    or v_delivery.destination_generation <> p_destination_generation then
    return jsonb_build_object(
      'apiVersion', 'customer-notification-ack.v1',
      'status', 'lease_conflict',
      'idempotent', false
    );
  end if;

  select device.* into v_device
  from public.customer_devices device
  where device.id = v_delivery.device_id
  for update;

  if p_outcome = 'delivered' and (
    not found
    or v_device.registration_version <> p_destination_generation
    or v_device.consent_status <> 'granted'
    or v_device.permission_status not in ('authorized', 'provisional')
    or v_device.push_token is null
    or v_device.expires_at <= v_now
  ) then
    v_status := 'suppressed';
    v_code := 'stale_destination';
  elsif p_outcome = 'delivered' then
    v_status := 'delivered';
  elsif p_outcome = 'retryable' and v_delivery.attempt_count < 5 then
    v_status := 'pending';
    v_code := 'retry_scheduled';
  elsif p_outcome = 'invalid_token' then
    v_status := 'suppressed';
    v_code := 'destination_revoked';
  else
    v_status := 'dead_letter';
    v_code := case when p_outcome = 'retryable'
      then 'retry_budget_exhausted' else 'permanent_failure' end;
  end if;

  update public.customer_notification_deliveries delivery
  set status = v_status,
      available_at = case when v_status = 'pending'
        then v_now + pg_catalog.make_interval(
          secs => least(
            3600,
            (30 * pg_catalog.power(
              2::numeric,
              greatest(0, v_delivery.attempt_count - 1)
            ))::integer
          )
        )
        else delivery.available_at
      end,
      lease_token = null,
      lease_expires_at = null,
      delivered_at = case when v_status = 'delivered' then v_now else null end,
      provider_message_id_hash = case
        when v_status = 'delivered' and p_provider_message_id is not null
          then extensions.digest(p_provider_message_id, 'sha256')
        else null
      end,
      last_error_code = case
        when v_status = 'delivered' then null
        else coalesce(p_error_code, v_code)
      end
  where delivery.id = v_delivery.id;

  if p_outcome = 'invalid_token'
    and v_device.id is not null
    and v_device.registration_version = p_destination_generation then
    update public.customer_devices device
    set consent_status = 'revoked',
        push_token = null,
        push_token_hash = null,
        revoked_at = v_now,
        expires_at = null,
        registration_version = device.registration_version + 1
    where device.id = v_device.id
      and device.registration_version = p_destination_generation;
  end if;

  v_result := jsonb_build_object(
    'apiVersion', 'customer-notification-ack.v1',
    'status', v_code,
    'deliveryStatus', v_status,
    'idempotent', false
  );
  insert into public.customer_notification_receipts(
    delivery_id,
    ack_idempotency_key,
    request_sha256,
    response_payload,
    created_at,
    retained_until
  ) values (
    v_delivery.id,
    p_ack_idempotency_key,
    v_request_sha256,
    v_result,
    v_now,
    v_now + interval '30 days'
  );
  return v_result;
end;
$$;

create or replace function public.customer_notification_route_v1(
  p_shop_slug text,
  p_route_token uuid
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
  v_event public.customer_notification_events%rowtype;
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
    or p_route_token is null then
    return jsonb_build_object(
      'apiVersion', 'customer-notification-route.v1',
      'status', 'invalid'
    );
  end if;

  select notification_event.* into v_event
  from public.customer_notification_events notification_event
  where notification_event.user_id = v_user_id
    and notification_event.shop_slug = p_shop_slug
    and notification_event.route_token = p_route_token;
  if not found then
    return jsonb_build_object(
      'apiVersion', 'customer-notification-route.v1',
      'status', 'not_found'
    );
  end if;

  return pg_catalog.jsonb_strip_nulls(jsonb_build_object(
    'apiVersion', 'customer-notification-route.v1',
    'status', 'ok',
    'target', case when v_event.order_id is null then 'cart' else 'order' end,
    'orderId', v_event.order_id,
    'event', v_event.event_key,
    'eventVersion', v_event.event_version
  ));
end;
$$;

do $grants$
begin
  revoke all on function app_private.customer_notification_event_guard_v1()
    from public, anon, authenticated, service_role;
  revoke all on function app_private.customer_notification_delivery_guard_v1()
    from public, anon, authenticated, service_role;
  revoke all on function app_private.customer_notification_materialize_v1(
    uuid, timestamptz
  ) from public, anon, authenticated, service_role;
  revoke all on function app_private.customer_notification_order_event_v1()
    from public, anon, authenticated, service_role;
  revoke all on function app_private.customer_notification_enqueue_expiring_v1(
    timestamptz, integer
  ) from public, anon, authenticated, service_role;
  revoke all on function app_private.customer_notification_payload_v1(
    public.customer_notification_events, text
  ) from public, anon, authenticated, service_role;

  revoke all on function public.customer_notification_claim_v1(
    integer, integer, uuid
  ) from public, anon, authenticated, service_role;
  revoke all on function public.customer_notification_ack_v1(
    uuid, uuid, bigint, text, uuid, text, text
  ) from public, anon, authenticated, service_role;
  revoke all on function public.customer_notification_route_v1(text, uuid)
    from public, anon, authenticated, service_role;

  grant execute on function public.customer_notification_claim_v1(
    integer, integer, uuid
  ) to service_role;
  grant execute on function public.customer_notification_ack_v1(
    uuid, uuid, bigint, text, uuid, text, text
  ) to service_role;
  grant execute on function public.customer_notification_route_v1(text, uuid)
    to authenticated;
end;
$grants$;

comment on column public.storefront_settings.customer_order_push_enabled is
  'Fail-closed per-shop flag for transactional order notification dispatch.';
comment on table public.customer_notification_events is
  'Append-only derived notification intents; order status events remain authoritative.';
comment on table public.customer_notification_deliveries is
  'Per-device-generation lease/retry ledger without persisted raw provider responses.';
comment on table public.customer_notification_receipts is
  'Idempotent dispatcher ack receipts; provider message identifiers are stored only as hashes.';
comment on function public.customer_notification_claim_v1(integer, integer, uuid) is
  'Service-role-only bounded claim returning an ephemeral routing token and privacy-allow-listed localized payload.';
comment on function public.customer_notification_ack_v1(
  uuid, uuid, bigint, text, uuid, text, text
) is
  'Service-role-only idempotent delivery ack with generation fencing and bounded retry.';
comment on function public.customer_notification_route_v1(text, uuid) is
  'Owner-scoped opaque notification route resolver; push payloads never contain internal order IDs.';

notify pgrst, 'reload schema';

commit;
