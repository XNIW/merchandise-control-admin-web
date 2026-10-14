-- WECHAT-AUTH-RATELIMIT-002: make challenge issuance limits race-safe.
-- The public signature, error taxonomy and service-role-only boundary remain
-- unchanged.  Per-hash transaction locks serialize the existing count+insert
-- decision without trusting or interpreting raw forwarding headers in SQL.

begin;

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
    raise exception using errcode = '42501',
      message = 'wechat_service_role_required';
  end if;

  if p_state_hash !~ '^[0-9a-f]{64}$'
    or p_nonce_hash !~ '^[0-9a-f]{64}$'
    or p_device_hash !~ '^[0-9a-f]{64}$'
    or p_ip_hash !~ '^[0-9a-f]{64}$'
    or p_surface not in ('android', 'ios', 'mini_program')
    or p_mode not in ('login', 'link')
    or p_correlation_id is null
    or p_ttl_seconds not between 60 and 600 then
    raise exception using errcode = '22023',
      message = 'wechat_challenge_invalid';
  end if;

  -- Device and ingress buckets use disjoint lock namespaces and a fixed order.
  -- Requests sharing either hash therefore cannot both observe stale counts.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'wechat-auth-challenge:device:' || p_device_hash, 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'wechat-auth-challenge:ip:' || p_ip_hash, 0
  ));

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
) from public, anon, authenticated, service_role;
grant execute on function public.wechat_auth_challenge_issue_v1(
  text, text, text, text, text, text, uuid, integer
) to service_role;

comment on function public.wechat_auth_challenge_issue_v1(
  text, text, text, text, text, text, uuid, integer
) is 'Server-only WeChat challenge issuance with atomic 5/device and 10/ingress-hash one-minute limits.';

notify pgrst, 'reload schema';

commit;
