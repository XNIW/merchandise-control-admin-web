-- WECHAT-004: recoverable, idempotent identity-link audit saga.
-- Provider codes, access tokens, refresh tokens and provider identifiers are
-- deliberately absent from this durable ledger.

create table app_private.wechat_link_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null
    references public.profiles(profile_id) on delete cascade,
  provider text not null check (provider = 'custom:wechat'),
  surface text not null check (surface in ('web', 'android', 'ios')),
  status text not null default 'pending' check (
    status in (
      'pending',
      'provider_completed',
      'audit_finalized',
      'failed',
      'conflict',
      'expired'
    )
  ),
  nonce_hash text not null check (nonce_hash ~ '^[0-9a-f]{64}$'),
  correlation_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  provider_completed_at timestamptz,
  audit_finalized_at timestamptz,
  audit_log_id uuid references public.audit_logs(audit_log_id),
  failure_code text,
  updated_at timestamptz not null default statement_timestamp(),
  constraint wechat_link_attempts_expiry_check check (
    expires_at > created_at
    and expires_at <= created_at + interval '15 minutes'
  ),
  constraint wechat_link_attempts_completion_check check (
    (status <> 'audit_finalized')
    or (
      provider_completed_at is not null
      and audit_finalized_at is not null
      and audit_log_id is not null
    )
  )
);

create index wechat_link_attempts_actor_pending_idx
  on app_private.wechat_link_attempts(actor_profile_id, created_at desc)
  where status in ('pending', 'provider_completed');
create index wechat_link_attempts_expiry_idx
  on app_private.wechat_link_attempts(expires_at)
  where status in ('pending', 'provider_completed');

revoke all on app_private.wechat_link_attempts from public;

create or replace function public.wechat_link_attempt_begin_v1(
  p_actor_profile_id uuid,
  p_provider text,
  p_surface text,
  p_nonce_hash text,
  p_correlation_id uuid,
  p_ttl_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, pg_temp
set statement_timeout = '5s'
as $$
declare
  v_attempt_id uuid;
  v_expires_at timestamptz;
begin
  perform app_private.wechat_require_service_role_v1();
  if p_actor_profile_id is null
    or p_provider <> 'custom:wechat'
    or p_surface not in ('web', 'android', 'ios')
    or coalesce(p_nonce_hash, '') !~ '^[0-9a-f]{64}$'
    or p_correlation_id is null
    or p_ttl_seconds is null
    or p_ttl_seconds < 60
    or p_ttl_seconds > 900 then
    raise exception 'wechat_link_attempt_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wechat-link:' || p_actor_profile_id::text, 0)
  );
  if not exists (
    select 1 from public.profiles profile
    where profile.profile_id = p_actor_profile_id
      and profile.profile_status = 'active'
      and profile.disabled_at is null
    for update
  ) then
    raise exception 'wechat_link_actor_inactive' using errcode = '42501';
  end if;

  update app_private.wechat_link_attempts attempt
  set status = 'expired',
      failure_code = 'expired',
      updated_at = statement_timestamp()
  where attempt.actor_profile_id = p_actor_profile_id
    and attempt.status in ('pending', 'provider_completed')
    and attempt.expires_at <= statement_timestamp();

  -- One account may have only one live provider-link attempt. This prevents a
  -- pre-existing identity or a later provider completion from being
  -- misattributed to several pending attempts during reconciliation.
  update app_private.wechat_link_attempts attempt
  set status = 'failed',
      failure_code = 'superseded',
      updated_at = statement_timestamp()
  where attempt.actor_profile_id = p_actor_profile_id
    and attempt.provider = p_provider
    and attempt.status in ('pending', 'provider_completed')
    and attempt.expires_at > statement_timestamp();

  if (
    select count(*)
    from app_private.wechat_link_attempts attempt
    where attempt.actor_profile_id = p_actor_profile_id
      and attempt.created_at >= statement_timestamp() - interval '15 minutes'
  ) >= 10 then
    raise exception 'wechat_rate_limited' using errcode = 'P0001';
  end if;

  v_expires_at := statement_timestamp() + make_interval(secs => p_ttl_seconds);
  insert into app_private.wechat_link_attempts(
    actor_profile_id,
    provider,
    surface,
    nonce_hash,
    correlation_id,
    expires_at
  ) values (
    p_actor_profile_id,
    p_provider,
    p_surface,
    p_nonce_hash,
    p_correlation_id,
    v_expires_at
  ) returning attempt_id into v_attempt_id;

  return jsonb_build_object(
    'ok', true,
    'attempt_id', v_attempt_id,
    'expires_at', v_expires_at,
    'status', 'pending'
  );
end;
$$;

create or replace function public.wechat_link_attempt_finalize_v1(
  p_actor_profile_id uuid,
  p_attempt_id uuid,
  p_nonce_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, pg_temp
set statement_timeout = '5s'
as $$
declare
  v_attempt app_private.wechat_link_attempts%rowtype;
  v_audit_id uuid;
begin
  perform app_private.wechat_require_service_role_v1();
  if p_actor_profile_id is null or p_attempt_id is null
    or coalesce(p_nonce_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'wechat_link_attempt_invalid' using errcode = '22023';
  end if;

  select attempt.* into v_attempt
  from app_private.wechat_link_attempts attempt
  where attempt.attempt_id = p_attempt_id
  for update;

  if not found
    or v_attempt.actor_profile_id <> p_actor_profile_id
    or v_attempt.nonce_hash <> p_nonce_hash then
    return jsonb_build_object('ok', false, 'code', 'link_attempt_invalid');
  end if;
  if v_attempt.status = 'audit_finalized' then
    return jsonb_build_object(
      'ok', true,
      'status', 'audit_finalized',
      'attempt_id', v_attempt.attempt_id,
      'audit_log_id', v_attempt.audit_log_id,
      'replayed', true
    );
  end if;
  if v_attempt.status in ('failed', 'conflict', 'expired')
    or v_attempt.expires_at <= statement_timestamp() then
    update app_private.wechat_link_attempts
    set status = case
          when status in ('pending', 'provider_completed') then 'expired'
          else status
        end,
        failure_code = coalesce(failure_code, 'expired'),
        updated_at = statement_timestamp()
    where attempt_id = p_attempt_id;
    return jsonb_build_object('ok', false, 'code', 'link_attempt_expired');
  end if;
  if not exists (
    select 1
    from auth.identities identity
    where identity.user_id = p_actor_profile_id
      and identity.provider = v_attempt.provider
  ) then
    return jsonb_build_object('ok', false, 'code', 'provider_not_linked');
  end if;

  v_audit_id := gen_random_uuid();
  update app_private.wechat_link_attempts
  set status = 'provider_completed',
      provider_completed_at = coalesce(
        provider_completed_at, statement_timestamp()
      ),
      updated_at = statement_timestamp()
  where attempt_id = p_attempt_id;

  insert into public.audit_logs(
    audit_log_id,
    actor_profile_id,
    scope,
    shop_id,
    event_key,
    severity,
    result,
    target_type,
    target_id,
    metadata_redacted
  ) values (
    v_audit_id,
    p_actor_profile_id,
    'global',
    null,
    'auth.wechat.link.saga_finalized',
    'info',
    'success',
    'profile',
    p_actor_profile_id::text,
    jsonb_build_object(
      'attemptId', p_attempt_id,
      'correlationId', v_attempt.correlation_id,
      'provider', v_attempt.provider,
      'surface', v_attempt.surface
    )
  );

  update app_private.wechat_link_attempts
  set status = 'audit_finalized',
      audit_finalized_at = statement_timestamp(),
      audit_log_id = v_audit_id,
      failure_code = null,
      updated_at = statement_timestamp()
  where attempt_id = p_attempt_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'audit_finalized',
    'attempt_id', p_attempt_id,
    'audit_log_id', v_audit_id,
    'replayed', false
  );
end;
$$;

create or replace function public.wechat_link_attempt_fail_v1(
  p_actor_profile_id uuid,
  p_attempt_id uuid,
  p_failure_code text,
  p_conflict boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public, app_private, auth, pg_temp
set statement_timeout = '5s'
as $$
declare
  v_attempt app_private.wechat_link_attempts%rowtype;
  v_audit_id uuid;
begin
  perform app_private.wechat_require_service_role_v1();
  if p_actor_profile_id is null or p_attempt_id is null
    or coalesce(p_failure_code, '') !~ '^[a-z0-9_]{1,64}$' then
    raise exception 'wechat_link_attempt_invalid' using errcode = '22023';
  end if;
  select attempt.* into v_attempt
  from app_private.wechat_link_attempts attempt
  where attempt.attempt_id = p_attempt_id
    and attempt.actor_profile_id = p_actor_profile_id
  for update;
  if not found or v_attempt.status = 'audit_finalized' then
    return false;
  end if;
  if v_attempt.audit_log_id is null then
    v_audit_id := gen_random_uuid();
    insert into public.audit_logs(
      audit_log_id, actor_profile_id, scope, shop_id, event_key,
      severity, result, target_type, target_id, metadata_redacted
    ) values (
      v_audit_id, p_actor_profile_id, 'global', null,
      case when p_conflict
        then 'auth.wechat.link.saga_conflict'
        else 'auth.wechat.link.saga_failed'
      end,
      'warning', 'blocked', 'profile', p_actor_profile_id::text,
      jsonb_build_object(
        'attemptId', p_attempt_id,
        'correlationId', v_attempt.correlation_id,
        'reason', p_failure_code,
        'surface', v_attempt.surface
      )
    );
  else
    v_audit_id := v_attempt.audit_log_id;
  end if;
  update app_private.wechat_link_attempts
  set status = case when p_conflict then 'conflict' else 'failed' end,
      failure_code = p_failure_code,
      audit_log_id = v_audit_id,
      updated_at = statement_timestamp()
  where attempt_id = p_attempt_id;
  return true;
end;
$$;

create or replace function public.wechat_link_attempt_reconcile_v1(
  p_actor_profile_id uuid,
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, pg_temp
set statement_timeout = '5s'
as $$
declare
  v_attempt record;
  v_audit_id uuid;
  v_completed integer := 0;
  v_expired integer := 0;
begin
  perform app_private.wechat_require_service_role_v1();
  if p_actor_profile_id is null or p_limit is null
    or p_limit < 1 or p_limit > 20 then
    raise exception 'wechat_link_attempt_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.profile_id = p_actor_profile_id
      and profile.profile_status = 'active'
      and profile.disabled_at is null
  ) then
    raise exception 'wechat_link_actor_inactive' using errcode = '42501';
  end if;

  for v_attempt in
    select attempt.*
    from app_private.wechat_link_attempts attempt
    where attempt.actor_profile_id = p_actor_profile_id
      and attempt.status in ('pending', 'provider_completed')
    order by attempt.created_at
    limit p_limit
    for update skip locked
  loop
    if exists (
      select 1 from auth.identities identity
      where identity.user_id = p_actor_profile_id
        and identity.provider = v_attempt.provider
    ) then
      v_audit_id := gen_random_uuid();
      insert into public.audit_logs(
        audit_log_id, actor_profile_id, scope, shop_id, event_key,
        severity, result, target_type, target_id, metadata_redacted
      ) values (
        v_audit_id, p_actor_profile_id, 'global', null,
        'auth.wechat.link.saga_reconciled', 'info', 'success',
        'profile', p_actor_profile_id::text,
        jsonb_build_object(
          'attemptId', v_attempt.attempt_id,
          'correlationId', v_attempt.correlation_id,
          'provider', v_attempt.provider,
          'surface', v_attempt.surface
        )
      );
      update app_private.wechat_link_attempts
      set status = 'audit_finalized',
          provider_completed_at = coalesce(
            provider_completed_at, statement_timestamp()
          ),
          audit_finalized_at = statement_timestamp(),
          audit_log_id = v_audit_id,
          failure_code = null,
          updated_at = statement_timestamp()
      where attempt_id = v_attempt.attempt_id;
      v_completed := v_completed + 1;
    elsif v_attempt.expires_at <= statement_timestamp() then
      update app_private.wechat_link_attempts
      set status = 'expired', failure_code = 'expired',
          updated_at = statement_timestamp()
      where attempt_id = v_attempt.attempt_id;
      v_expired := v_expired + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'completed', v_completed,
    'expired', v_expired
  );
end;
$$;

revoke all on function public.wechat_link_attempt_begin_v1(
  uuid, text, text, text, uuid, integer
) from public, anon, authenticated;
revoke all on function public.wechat_link_attempt_finalize_v1(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.wechat_link_attempt_fail_v1(
  uuid, uuid, text, boolean
) from public, anon, authenticated;
revoke all on function public.wechat_link_attempt_reconcile_v1(uuid, integer)
  from public, anon, authenticated;

grant execute on function public.wechat_link_attempt_begin_v1(
  uuid, text, text, text, uuid, integer
) to service_role;
grant execute on function public.wechat_link_attempt_finalize_v1(uuid, uuid, text)
  to service_role;
grant execute on function public.wechat_link_attempt_fail_v1(
  uuid, uuid, text, boolean
) to service_role;
grant execute on function public.wechat_link_attempt_reconcile_v1(uuid, integer)
  to service_role;
