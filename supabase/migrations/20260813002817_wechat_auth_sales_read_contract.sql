-- WECHAT-001
-- Server-only WeChat challenge ledger plus authenticated, shop-scoped,
-- read-only POS sales RPCs for the Mini Program and personal-account clients.
--
-- Rollback/disablement (manual, reviewed operation only): disable every WeChat
-- surface flag first; revoke EXECUTE on the public functions; then drop the
-- functions and app_private challenge table only after outstanding challenges
-- have expired. The POS source tables/views and their grants are untouched.

begin;

create table app_private.wechat_auth_challenges (
  challenge_id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  nonce_hash text not null,
  surface text not null,
  mode text not null default 'login',
  device_hash text not null,
  ip_hash text not null,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  correlation_id uuid not null,
  constraint wechat_auth_challenges_hash_shape check (
    state_hash ~ '^[0-9a-f]{64}$'
    and nonce_hash ~ '^[0-9a-f]{64}$'
    and device_hash ~ '^[0-9a-f]{64}$'
    and ip_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint wechat_auth_challenges_surface_check check (
    surface in ('android', 'ios', 'mini_program')
  ),
  constraint wechat_auth_challenges_mode_check check (
    mode in ('login', 'link')
  ),
  constraint wechat_auth_challenges_expiry_check check (
    expires_at > created_at
    and expires_at <= created_at + interval '10 minutes'
  ),
  constraint wechat_auth_challenges_consumed_check check (
    consumed_at is null or consumed_at >= created_at
  )
);

create index wechat_auth_challenges_expiry_idx
  on app_private.wechat_auth_challenges(expires_at)
  where consumed_at is null;

create index wechat_auth_challenges_device_rate_idx
  on app_private.wechat_auth_challenges(device_hash, created_at desc);

create index wechat_auth_challenges_ip_rate_idx
  on app_private.wechat_auth_challenges(ip_hash, created_at desc);

revoke all on table app_private.wechat_auth_challenges
  from public, anon, authenticated;
grant select, insert, update, delete on table app_private.wechat_auth_challenges
  to service_role;

create or replace function public.wechat_auth_challenge_issue_v1(
  p_state_hash text,
  p_nonce_hash text,
  p_surface text,
  p_mode text,
  p_device_hash text,
  p_ip_hash text,
  p_correlation_id uuid,
  p_ttl_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'wechat_service_role_required';
  end if;

  if p_state_hash !~ '^[0-9a-f]{64}$'
    or p_nonce_hash !~ '^[0-9a-f]{64}$'
    or p_device_hash !~ '^[0-9a-f]{64}$'
    or p_ip_hash !~ '^[0-9a-f]{64}$'
    or p_surface not in ('android', 'ios', 'mini_program')
    or p_mode not in ('login', 'link')
    or p_correlation_id is null
    or p_ttl_seconds not between 60 and 600 then
    raise exception using errcode = '22023', message = 'wechat_challenge_invalid';
  end if;

  if (
    select count(*)
    from app_private.wechat_auth_challenges challenge
    where challenge.device_hash = p_device_hash
      and challenge.created_at >= v_now - interval '1 minute'
  ) >= 5 or (
    select count(*)
    from app_private.wechat_auth_challenges challenge
    where challenge.ip_hash = p_ip_hash
      and challenge.created_at >= v_now - interval '1 minute'
  ) >= 10 then
    raise exception using errcode = 'P0001', message = 'wechat_rate_limited';
  end if;

  delete from app_private.wechat_auth_challenges challenge
  where challenge.expires_at < v_now - interval '1 day';

  insert into app_private.wechat_auth_challenges (
    state_hash,
    nonce_hash,
    surface,
    mode,
    device_hash,
    ip_hash,
    expires_at,
    correlation_id
  ) values (
    p_state_hash,
    p_nonce_hash,
    p_surface,
    p_mode,
    p_device_hash,
    p_ip_hash,
    v_now + make_interval(secs => p_ttl_seconds),
    p_correlation_id
  );

  return jsonb_build_object(
    'ok', true,
    'expires_at', v_now + make_interval(secs => p_ttl_seconds)
  );
end;
$$;

revoke all on function public.wechat_auth_challenge_issue_v1(
  text, text, text, text, text, text, uuid, integer
) from public, anon, authenticated;
grant execute on function public.wechat_auth_challenge_issue_v1(
  text, text, text, text, text, text, uuid, integer
) to service_role;

create or replace function public.wechat_auth_challenge_consume_v1(
  p_state_hash text,
  p_nonce_hash text,
  p_surface text,
  p_mode text,
  p_device_hash text,
  p_ip_hash text,
  p_correlation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_consumed_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'wechat_service_role_required';
  end if;

  update app_private.wechat_auth_challenges challenge
  set consumed_at = statement_timestamp()
  where challenge.state_hash = p_state_hash
    and challenge.nonce_hash = p_nonce_hash
    and challenge.surface = p_surface
    and challenge.mode = p_mode
    and challenge.device_hash = p_device_hash
    and challenge.ip_hash = p_ip_hash
    and challenge.correlation_id = p_correlation_id
    and challenge.consumed_at is null
    and challenge.expires_at > statement_timestamp()
  returning challenge.challenge_id into v_consumed_id;

  return v_consumed_id is not null;
end;
$$;

revoke all on function public.wechat_auth_challenge_consume_v1(
  text, text, text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.wechat_auth_challenge_consume_v1(
  text, text, text, text, text, text, uuid
) to service_role;

create or replace function public.wechat_auth_audit_v1(
  p_event_key text,
  p_result text,
  p_correlation_id uuid,
  p_actor_profile_id uuid default null,
  p_subject_hash text default null,
  p_metadata_redacted jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'wechat_service_role_required';
  end if;

  if p_event_key not in (
      'auth.wechat.exchange_succeeded',
      'auth.wechat.exchange_blocked',
      'auth.wechat.link_succeeded',
      'auth.wechat.link_conflict'
    )
    or p_result not in ('success', 'blocked')
    or p_correlation_id is null
    or jsonb_typeof(coalesce(p_metadata_redacted, '{}'::jsonb)) <> 'object'
    or (p_subject_hash is not null and p_subject_hash !~ '^[0-9a-f]{64}$') then
    raise exception using errcode = '22023', message = 'wechat_audit_invalid';
  end if;

  insert into public.audit_logs (
    actor_profile_id,
    scope,
    event_key,
    severity,
    result,
    target_type,
    target_id,
    metadata_redacted
  ) values (
    p_actor_profile_id,
    'global',
    p_event_key,
    case when p_result = 'blocked' then 'warning' else 'info' end,
    p_result,
    'wechat_identity',
    p_subject_hash,
    coalesce(p_metadata_redacted, '{}'::jsonb)
      || jsonb_build_object('correlation_id', p_correlation_id)
  );
end;
$$;

revoke all on function public.wechat_auth_audit_v1(
  text, text, uuid, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.wechat_auth_audit_v1(
  text, text, uuid, uuid, text, jsonb
) to service_role;

create or replace function app_private.wechat_can_read_shop(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    auth.uid() is not null
    and exists (
      select 1
      from public.profiles profile
      join public.shop_members member
        on member.profile_id = profile.profile_id
      join public.shops shop
        on shop.shop_id = member.shop_id
      where profile.profile_id = auth.uid()
        and profile.profile_status = 'active'
        and member.shop_id = p_shop_id
        and member.membership_status = 'active'
        and member.role_key in ('shop_owner', 'shop_manager', 'viewer')
        and shop.shop_status = 'active'
    ),
    false
  );
$$;

revoke all on function app_private.wechat_can_read_shop(uuid)
  from public, anon, authenticated;

create or replace function public.wechat_authorized_shops_v1()
returns table (
  shop_id uuid,
  shop_code text,
  shop_name text,
  role_key text,
  currency_code text,
  time_zone text,
  server_time timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    shop.shop_id,
    shop.shop_code,
    shop.shop_name,
    member.role_key,
    coalesce(setting.currency_code, 'CLP') as currency_code,
    coalesce(setting.catalog_time_zone, 'America/Santiago') as time_zone,
    statement_timestamp() as server_time
  from public.shop_members member
  join public.shops shop on shop.shop_id = member.shop_id
  join public.profiles profile on profile.profile_id = member.profile_id
  left join public.storefront_settings setting on setting.shop_id = shop.shop_id
  where member.profile_id = auth.uid()
    and profile.profile_status = 'active'
    and member.membership_status = 'active'
    and member.role_key in ('shop_owner', 'shop_manager', 'viewer')
    and shop.shop_status = 'active'
  order by shop.shop_name, shop.shop_code;
$$;

revoke all on function public.wechat_authorized_shops_v1()
  from public, anon;
grant execute on function public.wechat_authorized_shops_v1()
  to authenticated;

create or replace function public.wechat_daily_sales_summary_v1(
  p_shop_id uuid,
  p_business_date date default null
)
returns table (
  shop_id uuid,
  business_date date,
  currency_code text,
  time_zone text,
  gross_sales_clp bigint,
  discounts_clp bigint,
  refunds_clp bigint,
  net_revenue_clp bigint,
  sale_count integer,
  refund_count integer,
  void_count integer,
  transaction_count integer,
  latest_ledger_at timestamptz,
  server_time timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_time_zone text;
  v_currency_code text;
  v_business_date date;
begin
  if not app_private.wechat_can_read_shop(p_shop_id) then
    return;
  end if;

  select
    coalesce(setting.catalog_time_zone, 'America/Santiago'),
    coalesce(setting.currency_code, 'CLP')
  into v_time_zone, v_currency_code
  from public.shops shop
  left join public.storefront_settings setting on setting.shop_id = shop.shop_id
  where shop.shop_id = p_shop_id;

  if not exists (select 1 from pg_catalog.pg_timezone_names zone where zone.name = v_time_zone) then
    raise exception using errcode = '22023', message = 'shop_time_zone_invalid';
  end if;

  v_business_date := coalesce(
    p_business_date,
    (statement_timestamp() at time zone v_time_zone)::date
  );

  return query
  select
    p_shop_id,
    v_business_date,
    v_currency_code,
    v_time_zone,
    coalesce(summary.gross_sales_clp, 0)::bigint,
    coalesce(summary.discounts_clp, 0)::bigint,
    coalesce(summary.refunds_clp, 0)::bigint,
    coalesce(summary.net_revenue_clp, 0)::bigint,
    coalesce(summary.sale_count, 0)::integer,
    coalesce(summary.refund_count, 0)::integer,
    coalesce(summary.void_count, 0)::integer,
    coalesce(summary.transaction_count, 0)::integer,
    summary.latest_ledger_at,
    statement_timestamp()
  from (select 1) singleton
  left join public.pos_revenue_daily_summary_v summary
    on summary.shop_id = p_shop_id
   and summary.business_date = v_business_date;
end;
$$;

revoke all on function public.wechat_daily_sales_summary_v1(uuid, date)
  from public, anon;
grant execute on function public.wechat_daily_sales_summary_v1(uuid, date)
  to authenticated;

create or replace function public.wechat_daily_sales_page_v1(
  p_shop_id uuid,
  p_business_date date default null,
  p_limit integer default 50,
  p_before_occurred_at timestamptz default null,
  p_before_sale_id uuid default null
)
returns table (
  pos_sale_id uuid,
  sale_number text,
  occurred_at timestamptz,
  business_date date,
  business_kind text,
  sale_status text,
  fiscal_status text,
  net_amount_clp bigint,
  currency_code text,
  time_zone text,
  latest_update_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_time_zone text;
  v_currency_code text;
  v_business_date date;
begin
  if not app_private.wechat_can_read_shop(p_shop_id) then
    return;
  end if;

  if p_limit is null
    or p_limit not between 1 and 100
    or ((p_before_occurred_at is null) <> (p_before_sale_id is null)) then
    raise exception using errcode = '22023', message = 'sales_page_invalid';
  end if;

  select
    coalesce(setting.catalog_time_zone, 'America/Santiago'),
    coalesce(setting.currency_code, 'CLP')
  into v_time_zone, v_currency_code
  from public.shops shop
  left join public.storefront_settings setting on setting.shop_id = shop.shop_id
  where shop.shop_id = p_shop_id;

  if not exists (select 1 from pg_catalog.pg_timezone_names zone where zone.name = v_time_zone) then
    raise exception using errcode = '22023', message = 'shop_time_zone_invalid';
  end if;

  v_business_date := coalesce(
    p_business_date,
    (statement_timestamp() at time zone v_time_zone)::date
  );

  return query
  select
    sale.pos_sale_id,
    sale.sale_number,
    sale.occurred_at,
    sale.business_date,
    sale.business_kind,
    sale.status,
    sale.fiscal_status,
    coalesce(
      sale.net_amount_clp,
      case when sale.business_kind = 'refund'
        then -round(sale.total)::bigint
        else round(sale.total)::bigint
      end
    )::bigint,
    v_currency_code,
    v_time_zone,
    greatest(sale.updated_at, sale.created_at)
  from public.pos_sales sale
  where sale.shop_id = p_shop_id
    and sale.business_date = v_business_date
    and sale.status = 'accepted'
    and (
      p_before_occurred_at is null
      or (sale.occurred_at, sale.pos_sale_id) < (p_before_occurred_at, p_before_sale_id)
    )
  order by sale.occurred_at desc, sale.pos_sale_id desc
  limit p_limit;
end;
$$;

revoke all on function public.wechat_daily_sales_page_v1(
  uuid, date, integer, timestamptz, uuid
) from public, anon;
grant execute on function public.wechat_daily_sales_page_v1(
  uuid, date, integer, timestamptz, uuid
) to authenticated;

create or replace function public.wechat_sale_detail_v1(
  p_shop_id uuid,
  p_pos_sale_id uuid
)
returns table (
  line_position integer,
  entry_type text,
  product_name text,
  quantity numeric,
  unit_amount_clp bigint,
  line_amount_clp bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ledger.line_position,
    ledger.entry_type,
    ledger.product_name,
    ledger.quantity,
    case
      when ledger.quantity is null or ledger.quantity = 0 then null
      else round(ledger.amount_clp::numeric / ledger.quantity)::bigint
    end,
    ledger.amount_clp
  from public.pos_revenue_ledger_entries ledger
  join public.pos_sales sale on sale.pos_sale_id = ledger.pos_sale_id
  where app_private.wechat_can_read_shop(p_shop_id)
    and sale.shop_id = p_shop_id
    and sale.pos_sale_id = p_pos_sale_id
    and sale.status = 'accepted'
    and ledger.shop_id = p_shop_id
    and ledger.entry_type in (
      'item', 'discount', 'tax', 'refund_item', 'void_marker'
    )
  order by ledger.line_position nulls last, ledger.pos_revenue_ledger_entry_id
  limit 200;
$$;

revoke all on function public.wechat_sale_detail_v1(uuid, uuid)
  from public, anon;
grant execute on function public.wechat_sale_detail_v1(uuid, uuid)
  to authenticated;

comment on function public.wechat_authorized_shops_v1() is
  'Read-only active personal-account shops for WECHAT-001; no staff/POS session support.';
comment on function public.wechat_daily_sales_summary_v1(uuid, date) is
  'Shop-scoped daily POS revenue summary using configured shop timezone/currency.';
comment on function public.wechat_daily_sales_page_v1(uuid, date, integer, timestamptz, uuid) is
  'Bounded keyset page of accepted POS sales; caller must be an active personal-account member.';
comment on function public.wechat_sale_detail_v1(uuid, uuid) is
  'Minimal bounded sale ledger detail for authorized personal-account members.';

commit;
