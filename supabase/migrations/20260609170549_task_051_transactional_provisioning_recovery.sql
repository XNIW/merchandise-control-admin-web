-- TASK-051: route provisioning services now use transactional RPCs end-to-end.
-- Additive only. Local/non-production apply required before runtime checks.

create or replace function public.platform_create_shop_with_pending_owner_invite(
  p_shop_name text,
  p_shop_code text,
  p_owner_email text,
  p_reason text,
  p_company_rut text,
  p_business_giro text,
  p_business_address text,
  p_business_city text,
  p_legal_representative_rut text,
  p_staff_display_name text,
  p_staff_credential_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  normalized_shop_name text := btrim(coalesce(p_shop_name, ''));
  normalized_shop_code text := upper(btrim(coalesce(p_shop_code, '')));
  normalized_owner_email text := lower(btrim(coalesce(p_owner_email, '')));
  normalized_company_rut text := app_private.task051_normalize_rut(p_company_rut);
  normalized_business_giro text := btrim(coalesce(p_business_giro, ''));
  normalized_business_address text := btrim(coalesce(p_business_address, ''));
  normalized_business_city text := btrim(coalesce(p_business_city, ''));
  normalized_legal_representative_rut text := app_private.task051_normalize_rut(p_legal_representative_rut);
  normalized_staff_display_name text := btrim(coalesce(p_staff_display_name, ''));
  normalized_credential_hash text := btrim(coalesce(p_staff_credential_hash, ''));
  redacted_reason text := btrim(coalesce(p_reason, ''));
  redacted_contact text;
  contact_digest text;
  created_shop_id uuid;
  created_staff_id uuid;
  invite_id uuid;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  audit_event_id := app_private.task051_platform_audit(
    actor_id, 'global', null, 'platform.shop.pending_owner_invite.attempt',
    'info', 'success', 'owner_invite', null, redacted_reason, 'attempt',
    jsonb_build_object(
      'credential_generated', true,
      'email_delivery_active', false,
      'staff_code', '1001'
    )
  );

  if length(normalized_shop_name) = 0
    or normalized_shop_code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'
    or normalized_owner_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or not app_private.task051_validate_fiscal_identity(
      normalized_company_rut,
      normalized_business_giro,
      normalized_business_address,
      normalized_business_city,
      normalized_legal_representative_rut
    )
    or length(normalized_staff_display_name) = 0
    or normalized_credential_hash !~ '^\$scrypt-v1\$'
    or length(redacted_reason) = 0 then
    audit_event_id := app_private.task051_platform_audit(
      actor_id, 'global', null, 'platform.shop.pending_owner_invite.failure',
      'warning', 'blocked', 'owner_invite', null, redacted_reason, 'validation_failed',
      jsonb_build_object('credential_generated', false, 'email_delivery_active', false)
    );
    return app_private.platform_action_result(false, 'validation_failed', null, audit_event_id);
  end if;

  if exists (select 1 from public.shops where shop_code = normalized_shop_code) then
    audit_event_id := app_private.task051_platform_audit(
      actor_id, 'global', null, 'platform.shop.pending_owner_invite.failure',
      'warning', 'blocked', 'shop', null, redacted_reason, 'duplicate_shop_code',
      jsonb_build_object('credential_generated', false, 'email_delivery_active', false)
    );
    return app_private.platform_action_result(false, 'duplicate_shop_code', null, audit_event_id);
  end if;

  if exists (select 1 from public.shops where company_rut = normalized_company_rut) then
    audit_event_id := app_private.task051_platform_audit(
      actor_id, 'global', null, 'platform.shop.pending_owner_invite.failure',
      'warning', 'blocked', 'shop', null, redacted_reason, 'duplicate_company_rut',
      jsonb_build_object('credential_generated', false, 'email_delivery_active', false)
    );
    return app_private.platform_action_result(false, 'duplicate_company_rut', null, audit_event_id);
  end if;

  redacted_contact := left(normalized_owner_email, 1) || '***@' || split_part(normalized_owner_email, '@', 2);
  contact_digest := encode(extensions.digest(normalized_owner_email, 'sha256'), 'hex');

  insert into public.shops (
    shop_code,
    shop_name,
    shop_status,
    company_rut,
    business_giro,
    business_address,
    business_city,
    legal_representative_rut,
    fiscal_identity_locked_by_platform,
    fiscal_identity_updated_at,
    fiscal_identity_updated_by_profile_id,
    created_by_profile_id,
    status_reason_redacted,
    status_changed_at,
    status_changed_by_profile_id
  )
  values (
    normalized_shop_code,
    normalized_shop_name,
    'pending_setup',
    normalized_company_rut,
    normalized_business_giro,
    normalized_business_address,
    normalized_business_city,
    normalized_legal_representative_rut,
    true,
    now(),
    actor_id,
    actor_id,
    left(redacted_reason, 240),
    now(),
    actor_id
  )
  returning shop_id into created_shop_id;

  insert into public.platform_owner_invites (
    shop_id,
    owner_contact_redacted,
    owner_contact_digest,
    requested_by_profile_id
  )
  values (
    created_shop_id,
    redacted_contact,
    contact_digest,
    actor_id
  )
  returning platform_owner_invite_id into invite_id;

  created_staff_id := app_private.task051_insert_initial_manager(
    created_shop_id,
    actor_id,
    normalized_staff_display_name,
    normalized_credential_hash
  );

  audit_event_id := app_private.task051_platform_audit(
    actor_id, 'shop', created_shop_id, 'platform.shop.pending_owner_invite.success',
    'info', 'success', 'owner_invite', invite_id::text, redacted_reason, 'success',
    jsonb_build_object(
      'credential_generated', true,
      'email_delivery_active', false,
      'company_rut_present', true,
      'staff_code', '1001',
      'staff_id', created_staff_id,
      'permission_key', 'shop_admin.full_access'
    )
  );

  update public.platform_owner_invites
  set audit_log_id = audit_event_id,
      updated_at = now()
  where platform_owner_invite_id = invite_id;

  return app_private.platform_action_result(true, 'success', created_shop_id, audit_event_id)
    || jsonb_build_object(
      'invite_id', invite_id,
      'delivery_status', 'pending_external_delivery',
      'company_rut', normalized_company_rut,
      'shop_code', normalized_shop_code,
      'staff_id', created_staff_id,
      'staff_code', '1001'
    );
exception
  when unique_violation then
    audit_event_id := app_private.task051_platform_audit(
      actor_id, 'global', null, 'platform.shop.pending_owner_invite.failure',
      'warning', 'blocked', 'owner_invite', null, redacted_reason, 'conflict',
      jsonb_build_object('credential_generated', false, 'email_delivery_active', false)
    );
    return app_private.platform_action_result(false, 'conflict', null, audit_event_id);
  when others then
    if actor_id is not null then
      audit_event_id := app_private.task051_platform_audit(
        actor_id, 'global', null, 'platform.shop.pending_owner_invite.failure',
        'critical', 'failure', 'owner_invite', null, redacted_reason, 'db_failure',
        jsonb_build_object('credential_generated', false, 'email_delivery_active', false)
      );
    end if;
    return app_private.platform_action_result(false, 'db_failure', null, audit_event_id);
end;
$$;

create or replace function public.platform_recover_initial_manager_1001(
  p_shop_id uuid,
  p_shop_code text,
  p_staff_display_name text,
  p_staff_credential_hash text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  normalized_shop_code text := upper(btrim(coalesce(p_shop_code, '')));
  normalized_staff_display_name text := btrim(coalesce(p_staff_display_name, ''));
  normalized_credential_hash text := btrim(coalesce(p_staff_credential_hash, ''));
  redacted_reason text := btrim(coalesce(p_reason, ''));
  target_staff_credential_status text;
  target_staff_credential_version integer;
  target_staff_id uuid;
  target_staff_must_change_credential boolean;
  target_staff_status text;
  target_staff_web_access_revoked_at timestamptz;
  target_shop_archived_at timestamptz;
  target_shop_code text;
  target_shop_id uuid;
  target_shop_name text;
  target_shop_status text;
  staff_count integer := 0;
  next_credential_version integer := 1;
  operation_result text := 'recreated';
  recovered_staff_id uuid;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  if length(redacted_reason) < 8
    or length(normalized_staff_display_name) = 0
    or normalized_credential_hash !~ '^\$scrypt-v1\$' then
    audit_event_id := app_private.task051_platform_audit(
      actor_id, 'global', null, 'platform.staff_manager.initial_recovery.failure',
      'warning', 'blocked', 'staff_account', null, redacted_reason, 'validation_failed',
      jsonb_build_object('credential_generated', false, 'staff_code', '1001')
    );
    return app_private.platform_action_result(false, 'validation_failed', null, audit_event_id);
  end if;

  if p_shop_id is not null then
    select shop_id, shop_code, shop_name, shop_status, archived_at
    into target_shop_id, target_shop_code, target_shop_name, target_shop_status, target_shop_archived_at
    from public.shops
    where shop_id = p_shop_id;
  end if;

  if target_shop_id is null
    and normalized_shop_code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$' then
    select shop_id, shop_code, shop_name, shop_status, archived_at
    into target_shop_id, target_shop_code, target_shop_name, target_shop_status, target_shop_archived_at
    from public.shops
    where shop_code = normalized_shop_code;
  end if;

  if target_shop_id is null then
    audit_event_id := app_private.task051_platform_audit(
      actor_id, 'global', null, 'platform.staff_manager.initial_recovery.failure',
      'warning', 'blocked', 'shop', null, redacted_reason, 'shop_not_found',
      jsonb_build_object('credential_generated', false, 'staff_code', '1001')
    );
    return app_private.platform_action_result(false, 'shop_not_found', null, audit_event_id);
  end if;

  if target_shop_status <> 'active' or target_shop_archived_at is not null then
    audit_event_id := app_private.task051_platform_audit(
      actor_id, 'shop', target_shop_id, 'platform.staff_manager.initial_recovery.failure',
      'warning', 'failure', 'staff_account', null, redacted_reason, 'shop_inactive',
      jsonb_build_object('credential_generated', false, 'staff_code', '1001')
    );
    return app_private.platform_action_result(false, 'shop_inactive', target_shop_id, audit_event_id);
  end if;

  select count(*)::integer
  into staff_count
  from public.staff_accounts
  where shop_id = target_shop_id
    and staff_code = '1001';

  if staff_count > 1 then
    audit_event_id := app_private.task051_platform_audit(
      actor_id, 'shop', target_shop_id, 'platform.staff_manager.initial_recovery.failure',
      'warning', 'failure', 'staff_account', null, redacted_reason, 'duplicate_initial_manager',
      jsonb_build_object(
        'credential_generated', false,
        'operation_result', 'duplicate_initial_manager',
        'staff_code', '1001'
      )
    );
    return app_private.platform_action_result(false, 'duplicate_initial_manager', target_shop_id, audit_event_id);
  end if;

  select staff_id, credential_version, status, credential_status,
         must_change_credential, web_access_revoked_at
  into target_staff_id, target_staff_credential_version, target_staff_status,
       target_staff_credential_status, target_staff_must_change_credential,
       target_staff_web_access_revoked_at
  from public.staff_accounts
  where shop_id = target_shop_id
    and staff_code = '1001';

  insert into public.staff_role_permissions (
    shop_id,
    role_key,
    permission_key,
    enabled,
    updated_by_profile_id,
    updated_at
  )
  values (
    target_shop_id,
    'manager',
    'shop_admin.full_access',
    true,
    actor_id,
    now()
  )
  on conflict (shop_id, role_key, permission_key)
  do update set
    enabled = true,
    updated_by_profile_id = excluded.updated_by_profile_id,
    updated_at = now();

  if target_staff_id is not null then
    if target_staff_status = 'active'
      and target_staff_credential_status = 'active'
      and target_staff_must_change_credential is not true
      and target_staff_web_access_revoked_at is null then
      operation_result := 'credential_reset';
    else
      operation_result := 'reactivated_reset';
    end if;

    next_credential_version := greatest(coalesce(target_staff_credential_version, 0) + 1, 1);

    update public.staff_accounts
    set credential_expires_at = null,
        credential_hash = normalized_credential_hash,
        credential_kind = 'password',
        credential_status = 'active',
        credential_updated_at = now(),
        credential_version = next_credential_version,
        failed_attempts = 0,
        locked_until = null,
        must_change_credential = false,
        session_invalidated_at = now(),
        status = 'active',
        updated_by_profile_id = actor_id,
        updated_at = now(),
        web_access_revoked_at = null,
        web_access_revoked_by_staff_id = null,
        web_access_revoked_reason = null
    where staff_id = target_staff_id
    returning staff_id into recovered_staff_id;
  else
    operation_result := 'recreated';

    insert into public.staff_accounts (
      shop_id,
      staff_code,
      display_name,
      role_key,
      status,
      credential_kind,
      credential_hash,
      credential_updated_at,
      credential_expires_at,
      must_change_credential,
      failed_attempts,
      credential_version,
      credential_status,
      created_by_profile_id,
      updated_by_profile_id,
      updated_at
    )
    values (
      target_shop_id,
      '1001',
      normalized_staff_display_name,
      'manager',
      'active',
      'password',
      normalized_credential_hash,
      now(),
      null,
      false,
      0,
      1,
      'active',
      actor_id,
      actor_id,
      now()
    )
    returning staff_id into recovered_staff_id;
  end if;

  audit_event_id := app_private.task051_platform_audit(
    actor_id, 'shop', target_shop_id, 'platform.staff_manager.initial_recovery.success',
    'info', 'success', 'staff_account', recovered_staff_id::text, redacted_reason, 'success',
    jsonb_build_object(
      'credential_generated', true,
      'operation_result', operation_result,
      'permission_key', 'shop_admin.full_access',
      'role_key', 'manager',
      'staff_code', '1001',
      'staff_id', recovered_staff_id
    )
  );

  return app_private.platform_action_result(true, 'success', target_shop_id, audit_event_id)
    || jsonb_build_object(
      'operation_result', operation_result,
      'shop_code', target_shop_code,
      'shop_name', target_shop_name,
      'staff_code', '1001',
      'staff_id', recovered_staff_id
    );
exception
  when unique_violation then
    audit_event_id := app_private.task051_platform_audit(
      actor_id, 'global', null, 'platform.staff_manager.initial_recovery.failure',
      'warning', 'blocked', 'staff_account', null, redacted_reason, 'conflict',
      jsonb_build_object('credential_generated', false, 'staff_code', '1001')
    );
    return app_private.platform_action_result(false, 'conflict', null, audit_event_id);
  when others then
    if actor_id is not null then
      audit_event_id := app_private.task051_platform_audit(
        actor_id, 'global', null, 'platform.staff_manager.initial_recovery.failure',
        'critical', 'failure', 'staff_account', null, redacted_reason, 'credential_update_database_error',
        jsonb_build_object('credential_generated', false, 'staff_code', '1001')
      );
    end if;
    return app_private.platform_action_result(false, 'credential_update_database_error', null, audit_event_id);
end;
$$;

revoke all on function public.platform_create_shop_with_pending_owner_invite(
  text, text, text, text, text, text, text, text, text, text, text
) from public;
revoke all on function public.platform_create_shop_with_pending_owner_invite(
  text, text, text, text, text, text, text, text, text, text, text
) from anon;
revoke all on function public.platform_create_shop_with_pending_owner_invite(
  text, text, text, text, text, text, text, text, text, text, text
) from authenticated;
grant execute on function public.platform_create_shop_with_pending_owner_invite(
  text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

revoke all on function public.platform_recover_initial_manager_1001(
  uuid, text, text, text, text
) from public;
revoke all on function public.platform_recover_initial_manager_1001(
  uuid, text, text, text, text
) from anon;
revoke all on function public.platform_recover_initial_manager_1001(
  uuid, text, text, text, text
) from authenticated;
grant execute on function public.platform_recover_initial_manager_1001(
  uuid, text, text, text, text
) to authenticated;

notify pgrst, 'reload schema';
