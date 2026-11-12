-- ASUS-W7POS-019: explicitly negotiated persistent ordinary POS authority.
-- Existing expiry columns use the largest portable finite UTC value for this
-- policy. It represents no ordinary POS expiry, not a business/licence date.
-- Legacy clients, sessions and the 12-hour V3 policy remain unchanged.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15min';

create or replace function app_private.pos_runtime_lease_is_valid_v1(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_session_hint public.pos_sessions%rowtype;
  v_device_identifier text;
begin
  select session_row.* into v_session_hint
  from public.pos_sessions session_row
  where session_row.pos_session_id = p_pos_session_id;

  if not found
    or v_session_hint.shop_id <> p_shop_id
    or v_session_hint.shop_device_id <> p_shop_device_id
    or v_session_hint.staff_id <> p_staff_id then
    return false;
  end if;

  select device.device_identifier into v_device_identifier
  from public.shop_devices device
  where device.shop_device_id = p_shop_device_id
    and device.shop_id = p_shop_id;

  if v_device_identifier is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_shop_id::text || ':' || v_device_identifier, 0)
  );

  -- Global POS runtime row-lock order: shop -> staff -> device -> credential
  -- -> session.  Writers use the same device advisory key before this order.
  perform 1 from public.shops shop
  where shop.shop_id = p_shop_id and shop.shop_status = 'active'
  for share;
  if not found then return false; end if;

  perform 1 from public.staff_accounts staff
  where staff.staff_id = p_staff_id
    and staff.shop_id = p_shop_id
    and staff.status = 'active'
    and staff.credential_status = 'active'
    and staff.credential_version = v_session_hint.staff_credential_version
    and staff.must_change_credential = false
    and staff.credential_hash is not null
    and (staff.credential_expires_at is null or staff.credential_expires_at > now())
    and (staff.locked_until is null or staff.locked_until <= now())
    and (
      staff.session_invalidated_at is null
      or staff.session_invalidated_at <= v_session_hint.issued_at
    )
  for share;
  if not found then return false; end if;

  perform 1 from public.shop_devices device
  where device.shop_device_id = p_shop_device_id
    and device.shop_id = p_shop_id
    and device.device_identifier = v_device_identifier
    and device.status = 'active'
    and device.revoked_at is null
  for share;
  if not found then return false; end if;

  perform 1 from public.pos_device_credentials credential
  where credential.pos_device_credential_id = v_session_hint.pos_device_credential_id
    and credential.shop_id = p_shop_id
    and credential.shop_device_id = p_shop_device_id
    and credential.staff_id = p_staff_id
    and credential.status = 'active'
    and credential.revoked_at is null
    and credential.expires_at > now()
    and (credential.offline_authorization_policy_version is distinct from 'persistent-pos-v1'
      or credential.offline_authorization_invalidated_at is null)
    and credential.staff_credential_version = v_session_hint.staff_credential_version
  for share;
  if not found then return false; end if;

  perform 1 from public.pos_sessions session_row
  where session_row.pos_session_id = p_pos_session_id
    and session_row.shop_id = p_shop_id
    and session_row.shop_device_id = p_shop_device_id
    and session_row.staff_id = p_staff_id
    and session_row.pos_device_credential_id = v_session_hint.pos_device_credential_id
    and session_row.staff_credential_version = v_session_hint.staff_credential_version
    and session_row.status = 'active'
    and session_row.revoked_at is null
    and session_row.expires_at > now()
    and (session_row.offline_authorization_policy_version is distinct from 'persistent-pos-v1'
      or session_row.offline_authorization_invalidated_at is null)
    and session_row.issued_at = v_session_hint.issued_at
  for share;

  return found;
end;
$$;


create or replace function public.pos_runtime_first_login_commit_v4(
  p_shop_id uuid,p_staff_id uuid,p_expected_credential_version integer,
  p_device_identifier text,p_device_display_name text,p_app_version text,
  p_device_token_hash text,p_device_ttl_seconds integer,
  p_session_token_hash text,p_session_ttl_seconds integer,
  p_offline_authorization_max_age_seconds integer,
  p_offline_authorization_policy_version text,
  p_metadata_redacted jsonb default '{}'::jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_result jsonb;v_credential uuid;v_session uuid;v_expiry timestamptz;
  v_count integer;v_expiry_text text;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception using errcode='42501',message='pos_persistent_authorization_denied';
  end if;
  if p_offline_authorization_policy_version is distinct from 'persistent-pos-v1' then
    return pg_catalog.jsonb_build_object('ok',false,'code','offline_authorization_policy_invalid');
  end if;
  -- V3 retains the canonical device advisory lock, row-lock order, staff
  -- version/status/PIN-verification boundary and transactional issuance.
  v_result:=public.pos_runtime_first_login_commit_v3(
    p_shop_id,p_staff_id,p_expected_credential_version,p_device_identifier,
    p_device_display_name,p_app_version,p_device_token_hash,p_device_ttl_seconds,
    p_session_token_hash,p_session_ttl_seconds,p_offline_authorization_max_age_seconds,
    p_offline_authorization_policy_version,p_metadata_redacted);
  if v_result->>'ok' is distinct from 'true' then return v_result;end if;
  v_credential:=(v_result->>'posDeviceCredentialId')::uuid;
  v_session:=(v_result->>'posSessionId')::uuid;
  select coalesce(staff.credential_expires_at,
      '9999-12-31 23:59:59.999999+00'::timestamptz)
    into v_expiry from public.staff_accounts staff
    where staff.shop_id=p_shop_id and staff.staff_id=p_staff_id
      and staff.credential_version=p_expected_credential_version;
  if v_expiry is null or v_expiry<=pg_catalog.clock_timestamp() then
    raise exception using errcode='P0001',message='pos_persistent_authorization_not_permitted';
  end if;
  update public.pos_device_credentials set expires_at=v_expiry,
    offline_authorization_expires_at=v_expiry,
    offline_authorization_invalidated_at=null,
    updated_at=pg_catalog.clock_timestamp()
    where pos_device_credential_id=v_credential and shop_id=p_shop_id
      and staff_id=p_staff_id and staff_credential_version=p_expected_credential_version
      and status='active' and revoked_at is null;
  get diagnostics v_count=row_count;
  if v_count<>1 then raise exception 'pos_persistent_authorization_not_permitted';end if;
  -- The existing expiry-change trigger invalidates old receipts. Reissue the
  -- just-verified credential in the same transaction, after that invalidation.
  update public.pos_device_credentials set offline_authorization_invalidated_at=null
    where pos_device_credential_id=v_credential;
  update public.pos_sessions set expires_at=v_expiry,
    offline_authorization_expires_at=v_expiry,
    offline_authorization_invalidated_at=null,
    updated_at=pg_catalog.clock_timestamp()
    where pos_session_id=v_session and pos_device_credential_id=v_credential
      and shop_id=p_shop_id and staff_id=p_staff_id
      and staff_credential_version=p_expected_credential_version
      and status='active' and revoked_at is null;
  get diagnostics v_count=row_count;
  if v_count<>1 or not app_private.pos_runtime_lease_is_valid_v1(
      p_shop_id,(v_result->>'shopDeviceId')::uuid,p_staff_id,v_session) then
    raise exception 'pos_persistent_authorization_not_permitted';
  end if;
  v_expiry_text:=pg_catalog.to_char(v_expiry at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  return v_result||pg_catalog.jsonb_build_object(
    'sessionExpiresAt',v_expiry_text,
    'effectiveOfflineAuthorizationExpiresAt',v_expiry_text,
    'localAuthorizationPolicy','persistent-pos-v1');
exception when others then
  -- This exception block rolls back V3 issuance and every subsequent change.
  return pg_catalog.jsonb_build_object('ok',false,'code','offline_authorization_persistence_failed');
end;$$;

create or replace function public.pos_runtime_heartbeat_touch_v1(
  p_shop_id uuid,p_shop_device_id uuid,p_staff_id uuid,p_pos_session_id uuid,
  p_expires_at timestamptz,p_app_version text
) returns jsonb language plpgsql volatile security definer
set search_path=public,app_private,pg_temp as $$
declare v_heartbeat_count integer;v_persistent boolean;v_expiry timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('pos-heartbeat:'||p_pos_session_id::text,0));
  if p_expires_at is null or not isfinite(p_expires_at) or p_expires_at<=now()
    or not app_private.pos_runtime_lease_is_valid_v1(
      p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id) then
    return jsonb_build_object('ok',false,'code','denied');
  end if;
  -- The canonical lease helper has already locked the graph in its shared
  -- shop/staff/device/credential/session order. The heartbeat cannot turn a
  -- negotiated permanent grant back into a twelve-hour authorization.
  select credential.offline_authorization_policy_version='persistent-pos-v1'
      and session_row.offline_authorization_policy_version='persistent-pos-v1',
      coalesce(staff.credential_expires_at,'9999-12-31 23:59:59.999999+00'::timestamptz)
    into v_persistent,v_expiry
    from public.pos_sessions session_row
    join public.pos_device_credentials credential using(pos_device_credential_id)
    join public.staff_accounts staff on staff.staff_id=session_row.staff_id
      and staff.shop_id=session_row.shop_id
    where session_row.pos_session_id=p_pos_session_id;
  if not coalesce(v_persistent,false) then v_expiry:=p_expires_at;end if;
  if v_expiry<=now() or exists(
    select 1 from public.pos_sessions session_row
    join public.pos_device_credentials credential using(pos_device_credential_id)
    join public.staff_accounts staff on staff.staff_id=session_row.staff_id and staff.shop_id=session_row.shop_id
    where session_row.pos_session_id=p_pos_session_id and
      (v_expiry>credential.expires_at or
       (staff.credential_expires_at is not null and v_expiry>staff.credential_expires_at))) then
    return jsonb_build_object('ok',false,'code','denied');
  end if;
  update public.pos_sessions set expires_at=v_expiry,heartbeat_count=heartbeat_count+1,
    last_seen_at=now(),updated_at=now() where pos_session_id=p_pos_session_id
    returning heartbeat_count into v_heartbeat_count;
  update public.pos_device_credentials credential set last_used_at=now(),updated_at=now()
    from public.pos_sessions session_row where session_row.pos_session_id=p_pos_session_id
      and credential.pos_device_credential_id=session_row.pos_device_credential_id;
  update public.shop_devices set app_version=nullif(left(btrim(p_app_version),80),''),
    last_seen_at=now(),last_seen_principal_kind='pos_staff',last_seen_profile_id=null,
    last_seen_staff_id=p_staff_id,updated_at=now()
    where shop_device_id=p_shop_device_id and shop_id=p_shop_id;
  return jsonb_build_object('ok',true,'expiresAt',v_expiry,'heartbeatCount',v_heartbeat_count);
end;$$;

revoke all on function public.pos_runtime_first_login_commit_v4(
  uuid,uuid,integer,text,text,text,text,integer,text,integer,integer,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.pos_runtime_first_login_commit_v4(
  uuid,uuid,integer,text,text,text,text,integer,text,integer,integer,text,jsonb) to service_role;
revoke all on function public.pos_runtime_heartbeat_touch_v1(uuid,uuid,uuid,uuid,timestamptz,text)
  from public,anon,authenticated;
grant execute on function public.pos_runtime_heartbeat_touch_v1(uuid,uuid,uuid,uuid,timestamptz,text) to service_role;
revoke all on function app_private.pos_runtime_lease_is_valid_v1(uuid,uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
commit;
