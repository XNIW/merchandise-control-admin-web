-- ASUS019 B2. A named session-bound read; no table grants or credential changes.
create function public.staff_web_shop_profile_read_v1(
  p_shop_id uuid, p_staff_id uuid, p_staff_web_session_id uuid,
  p_session_token_hash text, p_expected_credential_version integer,
  p_operation text
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_permission text;
  v_shop jsonb;
  v_members jsonb := '[]'::jsonb;
begin
  if p_shop_id is null or p_staff_id is null or p_staff_web_session_id is null
    or p_session_token_hash is null or p_session_token_hash !~ '^sha256:[0-9a-f]{64}$'
    or coalesce(p_expected_credential_version, 0) < 1 then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;
  if p_operation is null or p_operation not in ('overview', 'members', 'settings') then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  v_permission := case when p_operation = 'members' then 'members.view' else 'settings.read' end;
  if not app_private.staff_web_runtime_lease_is_valid_v1(
    p_shop_id, p_staff_id, p_staff_web_session_id, p_session_token_hash,
    p_expected_credential_version, v_permission
  ) then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;
  select jsonb_build_object(
    'shop_id', s.shop_id, 'shop_code', s.shop_code, 'shop_name', s.shop_name,
    'shop_status', s.shop_status, 'company_rut', s.company_rut,
    'business_address', s.business_address, 'business_city', s.business_city,
    'business_giro', s.business_giro, 'legal_representative_rut', s.legal_representative_rut,
    'fiscal_identity_locked_by_platform', s.fiscal_identity_locked_by_platform,
    'created_at', s.created_at, 'updated_at', s.updated_at,
    'status_changed_at', s.status_changed_at, 'suspended_at', s.suspended_at, 'archived_at', s.archived_at
  ) into v_shop from public.shops s where s.shop_id = p_shop_id;
  if p_operation = 'members' then
    select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at, m.shop_member_id), '[]'::jsonb)
    into v_members from (
      select shop_member_id, profile_id, role_key, membership_status, created_at, updated_at
      from public.shop_members where shop_id = p_shop_id
      order by created_at, shop_member_id limit 100
    ) m;
  end if;
  -- This helper locks shop/staff/permissions and the exact session for this transaction.
  -- Recheck time immediately before the publication audit/result, including slow reads.
  if not app_private.staff_web_runtime_lease_is_valid_v1(
    p_shop_id, p_staff_id, p_staff_web_session_id, p_session_token_hash,
    p_expected_credential_version, v_permission
  ) or not app_private.staff_web_runtime_lease_publishable_v1() then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;
  perform app_private.write_staff_shop_admin_audit(p_staff_id, p_shop_id,
    'shop.profile.staff_read', 'info', 'success', 'shop', p_shop_id::text,
    'success', jsonb_build_object('operation', p_operation));
  if not app_private.staff_web_runtime_lease_publishable_v1() then
    raise exception using errcode = '42501', message = 'staff_read_expired_before_publication';
  end if;
  return jsonb_build_object('ok', true, 'code', 'success', 'shop_id', p_shop_id,
    'actor_staff_id', p_staff_id, 'staff_web_session_id', p_staff_web_session_id,
    'credential_version', p_expected_credential_version, 'operation', p_operation,
    'shop', v_shop, 'members', v_members);
end;
$$;
revoke all on function public.staff_web_shop_profile_read_v1(uuid,uuid,uuid,text,integer,text)
  from public, anon, authenticated;
grant execute on function public.staff_web_shop_profile_read_v1(uuid,uuid,uuid,text,integer,text)
  to service_role;
comment on function public.staff_web_shop_profile_read_v1(uuid,uuid,uuid,text,integer,text)
  is 'ASUS019: closed shop profile/member DTO under the current staff web lease';
notify pgrst, 'reload schema';
