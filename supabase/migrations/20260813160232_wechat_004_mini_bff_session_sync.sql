-- WECHAT-004: opaque Mini Program sessions and the single canonical sync lane.
-- Raw session tokens and device identifiers never enter the database.

create table app_private.wechat_mini_session_generations (
  actor_profile_id uuid primary key
    references public.profiles(profile_id) on delete cascade,
  generation bigint not null default 1 check (generation > 0),
  updated_at timestamptz not null default statement_timestamp()
);

create table app_private.wechat_mini_sessions (
  session_id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null
    references public.profiles(profile_id) on delete cascade,
  generation bigint not null check (generation > 0),
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  device_hash text not null
    check (device_hash ~ '^[0-9a-f]{64}$'),
  account_fingerprint text not null
    check (account_fingerprint ~ '^[0-9a-f]{64}$'),
  correlation_id uuid not null,
  issued_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default statement_timestamp(),
  constraint wechat_mini_sessions_expiry_check check (
    expires_at > issued_at
    and expires_at <= issued_at + interval '30 minutes'
  ),
  constraint wechat_mini_sessions_revoked_check check (
    revoked_at is null or revoked_at >= issued_at
  )
);

create index wechat_mini_sessions_actor_active_idx
  on app_private.wechat_mini_sessions(actor_profile_id, issued_at desc)
  where revoked_at is null;
create index wechat_mini_sessions_expiry_idx
  on app_private.wechat_mini_sessions(expires_at)
  where revoked_at is null;

revoke all on app_private.wechat_mini_session_generations from public;
revoke all on app_private.wechat_mini_sessions from public;

create or replace function app_private.wechat_require_service_role_v1()
returns void
language plpgsql
security definer
set search_path = pg_catalog, auth, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'wechat_service_role_required' using errcode = '42501';
  end if;
end;
$$;

revoke all on function app_private.wechat_require_service_role_v1() from public;

create or replace function app_private.wechat_mini_assume_actor_v1(
  p_actor_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth, pg_temp
as $$
begin
  perform app_private.wechat_require_service_role_v1();
  if p_actor_profile_id is null or not exists (
    select 1
    from public.profiles profile
    where profile.profile_id = p_actor_profile_id
      and profile.profile_status = 'active'
      and profile.disabled_at is null
  ) then
    raise exception 'wechat_mini_session_expired' using errcode = '28000';
  end if;

  perform set_config('request.jwt.claim.sub', p_actor_profile_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_actor_profile_id::text,
      'role', 'authenticated',
      'aal', 'aal1'
    )::text,
    true
  );
end;
$$;

revoke all on function app_private.wechat_mini_assume_actor_v1(uuid) from public;

create or replace function public.wechat_mini_session_issue_v1(
  p_actor_profile_id uuid,
  p_token_hash text,
  p_device_hash text,
  p_account_fingerprint text,
  p_correlation_id uuid,
  p_ttl_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, pg_temp
set statement_timeout = '5s'
as $$
declare
  v_generation bigint;
  v_session_id uuid;
  v_expires_at timestamptz;
begin
  perform app_private.wechat_require_service_role_v1();
  if p_actor_profile_id is null
    or coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_device_hash, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_account_fingerprint, '') !~ '^[0-9a-f]{64}$'
    or p_correlation_id is null
    or p_ttl_seconds is null
    or p_ttl_seconds < 60
    or p_ttl_seconds > 1800 then
    raise exception 'wechat_mini_session_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wechat-mini-session:' || p_actor_profile_id::text, 0)
  );

  if not exists (
    select 1
    from public.profiles profile
    where profile.profile_id = p_actor_profile_id
      and profile.profile_status = 'active'
      and profile.disabled_at is null
    for update
  ) then
    raise exception 'wechat_mini_session_expired' using errcode = '28000';
  end if;

  insert into app_private.wechat_mini_session_generations(actor_profile_id)
  values (p_actor_profile_id)
  on conflict (actor_profile_id) do nothing;

  select generation
  into strict v_generation
  from app_private.wechat_mini_session_generations
  where actor_profile_id = p_actor_profile_id
  for update;

  if (
    select count(*)
    from app_private.wechat_mini_sessions session
    where session.actor_profile_id = p_actor_profile_id
      and session.issued_at >= statement_timestamp() - interval '15 minutes'
  ) >= 20 then
    raise exception 'wechat_rate_limited' using errcode = 'P0001';
  end if;

  update app_private.wechat_mini_sessions session
  set revoked_at = coalesce(session.revoked_at, statement_timestamp())
  where session.actor_profile_id = p_actor_profile_id
    and session.revoked_at is null
    and (
      session.expires_at <= statement_timestamp()
      or session.session_id in (
        select active.session_id
        from app_private.wechat_mini_sessions active
        where active.actor_profile_id = p_actor_profile_id
          and active.revoked_at is null
          and active.expires_at > statement_timestamp()
        order by active.issued_at desc
        offset 4
      )
    );

  v_expires_at := statement_timestamp() + make_interval(secs => p_ttl_seconds);
  insert into app_private.wechat_mini_sessions(
    actor_profile_id,
    generation,
    token_hash,
    device_hash,
    account_fingerprint,
    correlation_id,
    expires_at
  ) values (
    p_actor_profile_id,
    v_generation,
    p_token_hash,
    p_device_hash,
    p_account_fingerprint,
    p_correlation_id,
    v_expires_at
  )
  returning session_id into v_session_id;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_session_id,
    'generation', v_generation,
    'expires_at', v_expires_at,
    'account_fingerprint', p_account_fingerprint
  );
end;
$$;

create or replace function public.wechat_mini_session_resolve_v1(
  p_token_hash text,
  p_device_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, pg_temp
set statement_timeout = '3s'
as $$
declare
  v_session app_private.wechat_mini_sessions%rowtype;
  v_generation bigint;
begin
  perform app_private.wechat_require_service_role_v1();
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_device_hash, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'session_expired');
  end if;

  select session.*
  into v_session
  from app_private.wechat_mini_sessions session
  where session.token_hash = p_token_hash
    and session.device_hash = p_device_hash
  for update;

  if not found
    or v_session.revoked_at is not null
    or v_session.expires_at <= statement_timestamp() then
    return jsonb_build_object('ok', false, 'code', 'session_expired');
  end if;

  select generation
  into v_generation
  from app_private.wechat_mini_session_generations
  where actor_profile_id = v_session.actor_profile_id;

  if v_generation is distinct from v_session.generation
    or not exists (
      select 1
      from public.profiles profile
      where profile.profile_id = v_session.actor_profile_id
        and profile.profile_status = 'active'
        and profile.disabled_at is null
    ) then
    update app_private.wechat_mini_sessions
    set revoked_at = coalesce(revoked_at, statement_timestamp())
    where session_id = v_session.session_id;
    return jsonb_build_object('ok', false, 'code', 'session_expired');
  end if;

  if v_session.last_seen_at < statement_timestamp() - interval '5 minutes' then
    update app_private.wechat_mini_sessions
    set last_seen_at = statement_timestamp()
    where session_id = v_session.session_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'actor_profile_id', v_session.actor_profile_id,
    'session_id', v_session.session_id,
    'generation', v_session.generation,
    'expires_at', v_session.expires_at,
    'account_fingerprint', v_session.account_fingerprint
  );
end;
$$;

create or replace function public.wechat_mini_session_revoke_v1(
  p_token_hash text,
  p_device_hash text
)
returns boolean
language plpgsql
security definer
set search_path = app_private, auth, pg_temp
set statement_timeout = '3s'
as $$
begin
  perform app_private.wechat_require_service_role_v1();
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_device_hash, '') !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  update app_private.wechat_mini_sessions
  set revoked_at = coalesce(revoked_at, statement_timestamp())
  where token_hash = p_token_hash
    and device_hash = p_device_hash;
  return found;
end;
$$;

create or replace function public.wechat_mini_read_v1(
  p_actor_profile_id uuid,
  p_rpc text,
  p_params jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, pg_temp
set statement_timeout = '5s'
as $$
declare
  v_result jsonb;
begin
  perform app_private.wechat_mini_assume_actor_v1(p_actor_profile_id);
  if p_params is null or jsonb_typeof(p_params) <> 'object'
    or octet_length(p_params::text) > 16384 then
    raise exception 'wechat_mini_read_invalid' using errcode = '22023';
  end if;

  case p_rpc
    when 'wechat_account_profile_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_account_profile_v1() row_data;
    when 'wechat_authorized_shops_v2' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_authorized_shops_v2() row_data;
    when 'wechat_catalog_history_page_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_catalog_history_page_v1(
        (p_params->>'p_shop_id')::uuid,
        coalesce((p_params->>'p_limit')::integer, 50),
        p_params->>'p_entity_type', p_params->>'p_operation',
        (p_params->>'p_from_at')::timestamptz,
        (p_params->>'p_to_at')::timestamptz,
        (p_params->>'p_entity_id')::uuid,
        (p_params->>'p_before_created_at')::timestamptz,
        (p_params->>'p_before_audit_log_id')::uuid
      ) row_data;
    when 'wechat_catalog_lifecycle_page_v2' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_catalog_lifecycle_page_v2(
        (p_params->>'p_shop_id')::uuid,
        coalesce(p_params->>'p_entity_type', 'product'),
        coalesce(p_params->>'p_state', 'all'),
        coalesce((p_params->>'p_limit')::integer, 50),
        (p_params->>'p_before_updated_at')::timestamptz,
        (p_params->>'p_before_id')::uuid
      ) row_data;
    when 'wechat_catalog_page_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_catalog_page_v1(
        (p_params->>'p_shop_id')::uuid,
        coalesce((p_params->>'p_limit')::integer, 50),
        p_params->>'p_search', (p_params->>'p_category_id')::uuid,
        (p_params->>'p_supplier_id')::uuid,
        (p_params->>'p_has_image')::boolean,
        coalesce(p_params->>'p_sort', 'updated_desc'),
        (p_params->>'p_cursor_at')::timestamptz,
        p_params->>'p_cursor_text', (p_params->>'p_cursor_id')::uuid
      ) row_data;
    when 'wechat_categories_page_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_categories_page_v1(
        (p_params->>'p_shop_id')::uuid,
        coalesce((p_params->>'p_limit')::integer, 50),
        p_params->>'p_search', p_params->>'p_after_name',
        (p_params->>'p_after_id')::uuid
      ) row_data;
    when 'wechat_daily_sales_page_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_daily_sales_page_v1(
        (p_params->>'p_shop_id')::uuid,
        (p_params->>'p_business_date')::date,
        coalesce((p_params->>'p_limit')::integer, 50),
        (p_params->>'p_before_occurred_at')::timestamptz,
        (p_params->>'p_before_sale_id')::uuid
      ) row_data;
    when 'wechat_daily_sales_summary_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_daily_sales_summary_v1(
        (p_params->>'p_shop_id')::uuid,
        (p_params->>'p_business_date')::date
      ) row_data;
    when 'wechat_price_history_page_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_price_history_page_v1(
        (p_params->>'p_shop_id')::uuid,
        (p_params->>'p_product_id')::uuid,
        coalesce((p_params->>'p_limit')::integer, 50),
        p_params->>'p_before_effective_at',
        (p_params->>'p_before_id')::uuid
      ) row_data;
    when 'wechat_product_detail_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_product_detail_v1(
        (p_params->>'p_shop_id')::uuid,
        (p_params->>'p_product_id')::uuid
      ) row_data;
    when 'wechat_sale_detail_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_sale_detail_v1(
        (p_params->>'p_shop_id')::uuid,
        (p_params->>'p_pos_sale_id')::uuid
      ) row_data;
    when 'wechat_sale_detail_v2' then
      v_result := public.wechat_sale_detail_v2(
        (p_params->>'p_shop_id')::uuid,
        (p_params->>'p_pos_sale_id')::uuid
      );
    when 'wechat_sales_filter_options_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_sales_filter_options_v1(
        (p_params->>'p_shop_id')::uuid,
        (p_params->>'p_from_date')::date,
        (p_params->>'p_to_date')::date
      ) row_data;
    when 'wechat_sales_page_v2' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_sales_page_v2(
        (p_params->>'p_shop_id')::uuid,
        (p_params->>'p_from_date')::date,
        (p_params->>'p_to_date')::date,
        coalesce((p_params->>'p_limit')::integer, 50),
        (p_params->>'p_before_occurred_at')::timestamptz,
        (p_params->>'p_before_sale_id')::uuid,
        p_params->>'p_status', p_params->>'p_business_kind',
        p_params->>'p_payment_method', (p_params->>'p_staff_id')::uuid,
        (p_params->>'p_device_id')::uuid, p_params->>'p_sale_number'
      ) row_data;
    when 'wechat_sales_period_summary_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_sales_period_summary_v1(
        (p_params->>'p_shop_id')::uuid,
        (p_params->>'p_from_date')::date,
        (p_params->>'p_to_date')::date
      ) row_data;
    when 'wechat_suppliers_page_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_suppliers_page_v1(
        (p_params->>'p_shop_id')::uuid,
        coalesce((p_params->>'p_limit')::integer, 50),
        p_params->>'p_search', p_params->>'p_after_name',
        (p_params->>'p_after_id')::uuid
      ) row_data;
    when 'wechat_sync_history_page_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_sync_history_page_v1(
        (p_params->>'p_shop_id')::uuid,
        coalesce((p_params->>'p_limit')::integer, 50),
        (p_params->>'p_before_id')::bigint
      ) row_data;
    else
      raise exception 'wechat_mini_read_not_allowed' using errcode = '42501';
  end case;

  if octet_length(coalesce(v_result, 'null'::jsonb)::text) > 131072 then
    raise exception 'wechat_mini_read_response_too_large' using errcode = '54000';
  end if;
  return coalesce(v_result, 'null'::jsonb);
end;
$$;

create or replace function app_private.wechat_mini_require_shop_reader_v1(
  p_actor_profile_id uuid,
  p_shop_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth, pg_temp
as $$
begin
  perform app_private.wechat_mini_assume_actor_v1(p_actor_profile_id);
  if p_shop_id is null or not exists (
    select 1
    from public.shops shop
    join public.shop_members member on member.shop_id = shop.shop_id
    where shop.shop_id = p_shop_id
      and shop.shop_status = 'active'
      and member.profile_id = p_actor_profile_id
      and member.membership_status = 'active'
      and member.role_key in ('shop_owner', 'shop_manager', 'viewer')
  ) then
    raise exception 'wechat_mini_membership_missing' using errcode = '42501';
  end if;
end;
$$;

revoke all on function app_private.wechat_mini_require_shop_reader_v1(uuid, uuid)
  from public;

-- The canonical mobile sync scope resolver is intentionally writer-fenced.
-- Mini viewers are still allowed to receive read-only invalidations, so the
-- BFF first authorizes the real viewer and then executes the existing sync
-- lane as a current active owner/manager of that same shop. This never changes
-- mutation attribution and does not create a second event channel.
create or replace function app_private.wechat_mini_assume_shop_sync_actor_v1(
  p_actor_profile_id uuid,
  p_shop_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth, pg_temp
as $$
declare
  v_sync_actor_id uuid;
begin
  perform app_private.wechat_mini_require_shop_reader_v1(
    p_actor_profile_id, p_shop_id
  );
  select member.profile_id
  into v_sync_actor_id
  from public.shop_members member
  join public.profiles profile on profile.profile_id = member.profile_id
  where member.shop_id = p_shop_id
    and member.membership_status = 'active'
    and member.role_key in ('shop_owner', 'shop_manager')
    and profile.profile_status = 'active'
    and profile.disabled_at is null
  order by case member.role_key when 'shop_owner' then 0 else 1 end,
    member.created_at,
    member.profile_id
  limit 1
  for share of member, profile;
  if v_sync_actor_id is null then
    raise exception 'wechat_mini_membership_missing' using errcode = '42501';
  end if;
  perform app_private.wechat_mini_assume_actor_v1(v_sync_actor_id);
  return v_sync_actor_id;
end;
$$;

revoke all on function app_private.wechat_mini_assume_shop_sync_actor_v1(
  uuid, uuid
) from public;

create or replace function public.wechat_mini_sync_checkpoint_v1(
  p_actor_profile_id uuid,
  p_shop_id uuid,
  p_device_identifier text,
  p_after_id text default '0',
  p_expected_scope_key text default null,
  p_last_reconciled_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, pg_temp
set statement_timeout = '5s'
as $$
declare
  v_scope record;
  v_event_max bigint;
  v_after bigint;
  v_status text := 'ready';
  v_reconcile boolean := false;
begin
  perform app_private.wechat_mini_assume_shop_sync_actor_v1(
    p_actor_profile_id, p_shop_id
  );
  if coalesce(p_device_identifier, '') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(p_after_id, '') !~ '^(0|[1-9][0-9]{0,18})$'
    or (p_expected_scope_key is not null
      and p_expected_scope_key !~ '^[0-9a-f]{64}$')
    or (p_last_reconciled_at is not null
      and not pg_catalog.isfinite(p_last_reconciled_at)) then
    raise exception 'wechat_mini_sync_invalid' using errcode = '22023';
  end if;
  begin
    v_after := p_after_id::bigint;
  exception when numeric_value_out_of_range then
    raise exception 'wechat_mini_sync_invalid' using errcode = '22023';
  end;

  select * into strict v_scope
  from app_private.resolve_shop_sync_recovery_scope(
    p_shop_id, p_device_identifier
  );
  v_event_max := app_private.shop_sync_scope_event_max_id_v1(
    p_shop_id, v_scope.scope_kind, v_scope.mapped_owner_id,
    v_scope.authorized_legacy_owner_id
  );

  if p_expected_scope_key is not null
    and p_expected_scope_key <> v_scope.scope_key then
    v_status := 'scope_changed';
    v_reconcile := true;
  elsif v_after > v_event_max then
    v_status := 'cursor_ahead';
    v_reconcile := true;
  elsif v_after = 0
    or p_last_reconciled_at is null
    or p_last_reconciled_at < statement_timestamp() - interval '7 days' then
    v_status := 'reconcile_required';
    v_reconcile := true;
  end if;

  return jsonb_build_object(
    'schemaVersion', 'wechat-mini-sync-checkpoint-v1',
    'status', v_status,
    'shopId', p_shop_id,
    'scopeKey', v_scope.scope_key,
    'eventMaxId', v_event_max::text,
    'domainMaxIds', jsonb_build_object(
      'catalog', app_private.shop_sync_scope_domain_event_max_id_v1(
        p_shop_id, v_scope.scope_kind, v_scope.mapped_owner_id,
        v_scope.authorized_legacy_owner_id, 'catalog', v_event_max
      )::text,
      'prices', app_private.shop_sync_scope_domain_event_max_id_v1(
        p_shop_id, v_scope.scope_kind, v_scope.mapped_owner_id,
        v_scope.authorized_legacy_owner_id, 'prices', v_event_max
      )::text,
      'history', app_private.shop_sync_scope_domain_event_max_id_v1(
        p_shop_id, v_scope.scope_kind, v_scope.mapped_owner_id,
        v_scope.authorized_legacy_owner_id, 'history', v_event_max
      )::text
    ),
    'requiresReconcile', v_reconcile,
    'serverTime', statement_timestamp()
  );
end;
$$;

create or replace function public.wechat_mini_sync_delta_v1(
  p_actor_profile_id uuid,
  p_shop_id uuid,
  p_device_identifier text,
  p_after_id text,
  p_limit integer,
  p_expected_scope_key text,
  p_expected_event_max_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, pg_temp
set statement_timeout = '6s'
as $$
declare
  v_result jsonb;
  v_safe_rows jsonb;
begin
  perform app_private.wechat_mini_assume_shop_sync_actor_v1(
    p_actor_profile_id, p_shop_id
  );
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'wechat_mini_sync_invalid' using errcode = '22023';
  end if;
  v_result := public.shop_sync_event_page_v1(
    p_shop_id,
    p_device_identifier,
    p_after_id,
    p_limit,
    p_expected_scope_key,
    p_expected_event_max_id
  );
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', row_data->>'id',
        'domain', row_data->>'domain',
        'event_type', row_data->>'event_type',
        'source', row_data->>'source',
        'changed_count', row_data->'changed_count',
        'entity_ids', coalesce(row_data->'entity_ids', '{}'::jsonb),
        'requires_full_recovery',
          coalesce((row_data->>'requires_full_recovery')::boolean, true),
        'created_at', row_data->>'created_at'
      )
      order by (row_data->>'id')::bigint
    ),
    '[]'::jsonb
  ) into v_safe_rows
  from jsonb_array_elements(coalesce(v_result->'rows', '[]'::jsonb)) row_data;

  v_result := jsonb_build_object(
    'schemaVersion', 'wechat-mini-sync-delta-v1',
    'shopId', v_result->'shopId',
    'scopeEventMaxId', v_result->'scopeEventMaxId',
    'asOfEventMaxId', v_result->'asOfEventMaxId',
    'asOfDomainEventMaxIds', v_result->'asOfDomainEventMaxIds',
    'rows', v_safe_rows,
    'nextAfterId', v_result->'nextAfterId',
    'hasMore', v_result->'hasMore'
  );
  if octet_length(v_result::text) > 262144 then
    raise exception 'wechat_mini_sync_response_too_large' using errcode = '54000';
  end if;
  return v_result;
end;
$$;

revoke all on function public.wechat_mini_session_issue_v1(
  uuid, text, text, text, uuid, integer
) from public, anon, authenticated;
revoke all on function public.wechat_mini_session_resolve_v1(text, text)
  from public, anon, authenticated;
revoke all on function public.wechat_mini_session_revoke_v1(text, text)
  from public, anon, authenticated;
revoke all on function public.wechat_mini_read_v1(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.wechat_mini_sync_checkpoint_v1(
  uuid, uuid, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.wechat_mini_sync_delta_v1(
  uuid, uuid, text, text, integer, text, text
) from public, anon, authenticated;

grant execute on function public.wechat_mini_session_issue_v1(
  uuid, text, text, text, uuid, integer
) to service_role;
grant execute on function public.wechat_mini_session_resolve_v1(text, text)
  to service_role;
grant execute on function public.wechat_mini_session_revoke_v1(text, text)
  to service_role;
grant execute on function public.wechat_mini_read_v1(uuid, text, jsonb)
  to service_role;
grant execute on function public.wechat_mini_sync_checkpoint_v1(
  uuid, uuid, text, text, text, timestamptz
) to service_role;
grant execute on function public.wechat_mini_sync_delta_v1(
  uuid, uuid, text, text, integer, text, text
) to service_role;
