-- TASK-051: Platform provisioning fiscal identity and POS-first shop bootstrap.
-- Additive only. No production apply from Codex, no destructive migration, no raw credential storage.

alter table public.shops
  add column if not exists company_rut text,
  add column if not exists business_giro text,
  add column if not exists business_address text,
  add column if not exists business_city text,
  add column if not exists legal_representative_rut text,
  add column if not exists fiscal_identity_locked_by_platform boolean not null default true,
  add column if not exists fiscal_identity_updated_at timestamptz,
  add column if not exists fiscal_identity_updated_by_profile_id uuid references public.profiles(profile_id);

alter table public.shops
  drop constraint if exists shops_company_rut_format,
  add constraint shops_company_rut_format check (
    company_rut is null or company_rut ~ '^[0-9]{1,8}-[0-9K]$'
  );

alter table public.shops
  drop constraint if exists shops_legal_representative_rut_format,
  add constraint shops_legal_representative_rut_format check (
    legal_representative_rut is null
    or legal_representative_rut ~ '^[0-9]{1,8}-[0-9K]$'
  );

alter table public.shops
  drop constraint if exists shops_fiscal_identity_required_shape,
  add constraint shops_fiscal_identity_required_shape check (
    (
      company_rut is null
      and business_giro is null
      and business_address is null
      and business_city is null
      and legal_representative_rut is null
    )
    or (
      company_rut is not null
      and length(btrim(business_giro)) > 0
      and length(btrim(business_address)) > 0
      and length(btrim(business_city)) > 0
      and legal_representative_rut is not null
    )
  );

create unique index if not exists shops_company_rut_unique
  on public.shops(company_rut)
  where company_rut is not null;

create or replace function app_private.task051_normalize_rut(p_value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(upper(replace(replace(btrim(coalesce(p_value, '')), '.', ''), ' ', '')), '');
$$;

create or replace function app_private.task051_fiscal_fields_changed()
returns trigger
language plpgsql
set search_path = public, app_private, pg_temp
as $$
begin
  if old.company_rut is distinct from new.company_rut
    or old.business_giro is distinct from new.business_giro
    or old.business_address is distinct from new.business_address
    or old.business_city is distinct from new.business_city
    or old.legal_representative_rut is distinct from new.legal_representative_rut
    or old.fiscal_identity_locked_by_platform is distinct from new.fiscal_identity_locked_by_platform then
    if auth.uid() is null or not app_private.is_platform_admin() then
      raise exception 'shop fiscal identity is managed by platform';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists shops_task051_fiscal_identity_platform_only on public.shops;
create trigger shops_task051_fiscal_identity_platform_only
  before update on public.shops
  for each row execute function app_private.task051_fiscal_fields_changed();

revoke all on function app_private.task051_normalize_rut(text) from public;
revoke all on function app_private.task051_normalize_rut(text) from anon;
revoke all on function app_private.task051_normalize_rut(text) from authenticated;
revoke all on function app_private.task051_fiscal_fields_changed() from public;
revoke all on function app_private.task051_fiscal_fields_changed() from anon;
revoke all on function app_private.task051_fiscal_fields_changed() from authenticated;

create or replace function app_private.task051_platform_audit(
  p_actor_profile_id uuid,
  p_scope text,
  p_shop_id uuid,
  p_event_key text,
  p_severity text,
  p_result text,
  p_target_type text,
  p_target_id text,
  p_reason text,
  p_code text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_id uuid;
begin
  insert into public.audit_logs (
    actor_profile_id,
    scope,
    shop_id,
    event_key,
    severity,
    result,
    target_type,
    target_id,
    metadata_redacted
  )
  values (
    p_actor_profile_id,
    p_scope,
    p_shop_id,
    p_event_key,
    p_severity,
    p_result,
    p_target_type,
    p_target_id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'reason_redacted', nullif(left(btrim(coalesce(p_reason, '')), 240), ''),
        'code', p_code,
        'source', 'TASK-051'
      ) || coalesce(p_metadata, '{}'::jsonb)
    )
  )
  returning audit_log_id into inserted_id;

  return inserted_id;
end;
$$;

revoke all on function app_private.task051_platform_audit(
  uuid, text, uuid, text, text, text, text, text, text, text, jsonb
) from public;
revoke all on function app_private.task051_platform_audit(
  uuid, text, uuid, text, text, text, text, text, text, text, jsonb
) from anon;
revoke all on function app_private.task051_platform_audit(
  uuid, text, uuid, text, text, text, text, text, text, text, jsonb
) from authenticated;

create or replace function app_private.task051_validate_fiscal_identity(
  p_company_rut text,
  p_business_giro text,
  p_business_address text,
  p_business_city text,
  p_legal_representative_rut text
)
returns boolean
language sql
stable
set search_path = public, app_private, pg_temp
as $$
  select
    app_private.task051_normalize_rut(p_company_rut) ~ '^[0-9]{1,8}-[0-9K]$'
    and length(btrim(coalesce(p_business_giro, ''))) > 0
    and length(btrim(coalesce(p_business_address, ''))) > 0
    and length(btrim(coalesce(p_business_city, ''))) > 0
    and app_private.task051_normalize_rut(p_legal_representative_rut) ~ '^[0-9]{1,8}-[0-9K]$';
$$;

revoke all on function app_private.task051_validate_fiscal_identity(
  text, text, text, text, text
) from public;
revoke all on function app_private.task051_validate_fiscal_identity(
  text, text, text, text, text
) from anon;
revoke all on function app_private.task051_validate_fiscal_identity(
  text, text, text, text, text
) from authenticated;

create or replace function app_private.task051_insert_initial_manager(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_display_name text,
  p_staff_credential_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  created_staff_id uuid;
begin
  insert into public.staff_role_permissions (
    shop_id,
    role_key,
    permission_key,
    enabled,
    updated_by_profile_id,
    updated_at
  )
  values (
    p_shop_id,
    'manager',
    'shop_admin.full_access',
    true,
    p_actor_profile_id,
    now()
  )
  on conflict (shop_id, role_key, permission_key)
  do update set
    enabled = true,
    updated_by_profile_id = excluded.updated_by_profile_id,
    updated_at = now();

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
    p_shop_id,
    '1001',
    btrim(p_display_name),
    'manager',
    'active',
    'password',
    btrim(p_staff_credential_hash),
    now(),
    now() + interval '14 days',
    false,
    0,
    1,
    'active',
    p_actor_profile_id,
    p_actor_profile_id,
    now()
  )
  returning staff_id into created_staff_id;

  return created_staff_id;
end;
$$;

revoke all on function app_private.task051_insert_initial_manager(
  uuid, uuid, text, text
) from public;
revoke all on function app_private.task051_insert_initial_manager(
  uuid, uuid, text, text
) from anon;
revoke all on function app_private.task051_insert_initial_manager(
  uuid, uuid, text, text
) from authenticated;

create or replace function public.platform_create_shop_with_owner_bootstrap(
  p_shop_name text,
  p_shop_code text,
  p_company_rut text,
  p_business_giro text,
  p_business_address text,
  p_business_city text,
  p_legal_representative_rut text,
  p_owner_profile_id uuid,
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
  normalized_shop_name text := btrim(coalesce(p_shop_name, ''));
  normalized_shop_code text := upper(btrim(coalesce(p_shop_code, '')));
  normalized_company_rut text := app_private.task051_normalize_rut(p_company_rut);
  normalized_business_giro text := btrim(coalesce(p_business_giro, ''));
  normalized_business_address text := btrim(coalesce(p_business_address, ''));
  normalized_business_city text := btrim(coalesce(p_business_city, ''));
  normalized_legal_representative_rut text := app_private.task051_normalize_rut(p_legal_representative_rut);
  normalized_staff_display_name text := btrim(coalesce(p_staff_display_name, ''));
  normalized_credential_hash text := btrim(coalesce(p_staff_credential_hash, ''));
  redacted_reason text := btrim(coalesce(p_reason, ''));
  created_shop_id uuid;
  created_staff_id uuid;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  audit_event_id := app_private.task051_platform_audit(
    actor_id, 'global', null, 'platform.shop.owner_bootstrap.attempt',
    'info', 'success', 'shop', null, redacted_reason, 'attempt',
    jsonb_build_object('credential_generated', true, 'staff_code', '1001')
  );

  if length(normalized_shop_name) = 0
    or normalized_shop_code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'
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
      actor_id, 'global', null, 'platform.shop.owner_bootstrap.failure',
      'warning', 'blocked', 'shop', null, redacted_reason, 'validation_failed',
      jsonb_build_object('credential_generated', false)
    );
    return app_private.platform_action_result(false, 'validation_failed', null, audit_event_id);
  end if;

  if exists (select 1 from public.shops where shop_code = normalized_shop_code) then
    audit_event_id := app_private.task051_platform_audit(
      actor_id, 'global', null, 'platform.shop.owner_bootstrap.failure',
      'warning', 'blocked', 'shop', null, redacted_reason, 'duplicate_shop_code',
      jsonb_build_object('credential_generated', false)
    );
    return app_private.platform_action_result(false, 'duplicate_shop_code', null, audit_event_id);
  end if;

  if exists (select 1 from public.shops where company_rut = normalized_company_rut) then
    audit_event_id := app_private.task051_platform_audit(
      actor_id, 'global', null, 'platform.shop.owner_bootstrap.failure',
      'warning', 'blocked', 'shop', null, redacted_reason, 'duplicate_company_rut',
      jsonb_build_object('credential_generated', false)
    );
    return app_private.platform_action_result(false, 'duplicate_company_rut', null, audit_event_id);
  end if;

  if not exists (
    select 1
    from public.profiles
    where profile_id = p_owner_profile_id
      and profile_status = 'active'
  ) then
    audit_event_id := app_private.task051_platform_audit(
      actor_id, 'global', null, 'platform.shop.owner_bootstrap.failure',
      'warning', 'blocked', 'profile', p_owner_profile_id::text, redacted_reason, 'owner_not_active',
      jsonb_build_object('credential_generated', false)
    );
    return app_private.platform_action_result(false, 'owner_not_active', null, audit_event_id);
  end if;

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
    'active',
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

  insert into public.shop_members (
    profile_id,
    shop_id,
    role_key,
    membership_status,
    invited_by_profile_id
  )
  values (
    p_owner_profile_id,
    created_shop_id,
    'shop_owner',
    'active',
    actor_id
  );

  created_staff_id := app_private.task051_insert_initial_manager(
    created_shop_id,
    actor_id,
    normalized_staff_display_name,
    normalized_credential_hash
  );

  audit_event_id := app_private.task051_platform_audit(
    actor_id, 'shop', created_shop_id, 'platform.shop.owner_bootstrap.success',
    'info', 'success', 'shop', created_shop_id::text, redacted_reason, 'success',
    jsonb_build_object(
      'credential_generated', true,
      'staff_code', '1001',
      'staff_id', created_staff_id,
      'permission_key', 'shop_admin.full_access',
      'company_rut_present', true
    )
  );

  return app_private.platform_action_result(true, 'success', created_shop_id, audit_event_id)
    || jsonb_build_object(
      'staff_id', created_staff_id,
      'staff_code', '1001',
      'company_rut', normalized_company_rut,
      'shop_code', normalized_shop_code
    );
exception
  when unique_violation then
    audit_event_id := app_private.task051_platform_audit(
      actor_id, 'global', null, 'platform.shop.owner_bootstrap.failure',
      'warning', 'blocked', 'shop', null, redacted_reason, 'conflict',
      jsonb_build_object('credential_generated', false)
    );
    return app_private.platform_action_result(false, 'conflict', null, audit_event_id);
  when others then
    if actor_id is not null then
      audit_event_id := app_private.task051_platform_audit(
        actor_id, 'global', null, 'platform.shop.owner_bootstrap.failure',
        'critical', 'failure', 'shop', null, redacted_reason, 'db_failure',
        jsonb_build_object('credential_generated', false)
      );
    end if;
    return app_private.platform_action_result(false, 'db_failure', null, audit_event_id);
end;
$$;

create or replace function public.platform_create_pos_first_shop(
  p_shop_name text,
  p_shop_code text,
  p_company_rut text,
  p_business_giro text,
  p_business_address text,
  p_business_city text,
  p_legal_representative_rut text,
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
  normalized_shop_name text := btrim(coalesce(p_shop_name, ''));
  normalized_shop_code text := upper(btrim(coalesce(p_shop_code, '')));
  normalized_company_rut text := app_private.task051_normalize_rut(p_company_rut);
  normalized_business_giro text := btrim(coalesce(p_business_giro, ''));
  normalized_business_address text := btrim(coalesce(p_business_address, ''));
  normalized_business_city text := btrim(coalesce(p_business_city, ''));
  normalized_legal_representative_rut text := app_private.task051_normalize_rut(p_legal_representative_rut);
  normalized_staff_display_name text := btrim(coalesce(p_staff_display_name, ''));
  normalized_credential_hash text := btrim(coalesce(p_staff_credential_hash, ''));
  redacted_reason text := btrim(coalesce(p_reason, ''));
  created_shop_id uuid;
  created_staff_id uuid;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  audit_event_id := app_private.task051_platform_audit(
    actor_id, 'global', null, 'platform.shop.pos_first.create.attempt',
    'info', 'success', 'shop', null, redacted_reason, 'attempt',
    jsonb_build_object('credential_generated', true, 'staff_code', '1001')
  );

  if length(normalized_shop_name) = 0
    or normalized_shop_code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'
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
      actor_id, 'global', null, 'platform.shop.pos_first.create.failure',
      'warning', 'blocked', 'shop', null, redacted_reason, 'validation_failed',
      jsonb_build_object('credential_generated', false)
    );
    return app_private.platform_action_result(false, 'validation_failed', null, audit_event_id);
  end if;

  if exists (select 1 from public.shops where shop_code = normalized_shop_code) then
    audit_event_id := app_private.task051_platform_audit(
      actor_id, 'global', null, 'platform.shop.pos_first.create.failure',
      'warning', 'blocked', 'shop', null, redacted_reason, 'duplicate_shop_code',
      jsonb_build_object('credential_generated', false)
    );
    return app_private.platform_action_result(false, 'duplicate_shop_code', null, audit_event_id);
  end if;

  if exists (select 1 from public.shops where company_rut = normalized_company_rut) then
    audit_event_id := app_private.task051_platform_audit(
      actor_id, 'global', null, 'platform.shop.pos_first.create.failure',
      'warning', 'blocked', 'shop', null, redacted_reason, 'duplicate_company_rut',
      jsonb_build_object('credential_generated', false)
    );
    return app_private.platform_action_result(false, 'duplicate_company_rut', null, audit_event_id);
  end if;

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
    'active',
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

  created_staff_id := app_private.task051_insert_initial_manager(
    created_shop_id,
    actor_id,
    normalized_staff_display_name,
    normalized_credential_hash
  );

  audit_event_id := app_private.task051_platform_audit(
    actor_id, 'shop', created_shop_id, 'platform.shop.pos_first.create.success',
    'info', 'success', 'shop', created_shop_id::text, redacted_reason, 'success',
    jsonb_build_object(
      'credential_generated', true,
      'staff_code', '1001',
      'staff_id', created_staff_id,
      'permission_key', 'shop_admin.full_access',
      'company_rut_present', true
    )
  );

  return app_private.platform_action_result(true, 'success', created_shop_id, audit_event_id)
    || jsonb_build_object(
      'staff_id', created_staff_id,
      'staff_code', '1001',
      'company_rut', normalized_company_rut,
      'shop_code', normalized_shop_code
    );
exception
  when unique_violation then
    audit_event_id := app_private.task051_platform_audit(
      actor_id, 'global', null, 'platform.shop.pos_first.create.failure',
      'warning', 'blocked', 'shop', null, redacted_reason, 'conflict',
      jsonb_build_object('credential_generated', false)
    );
    return app_private.platform_action_result(false, 'conflict', null, audit_event_id);
  when others then
    if actor_id is not null then
      audit_event_id := app_private.task051_platform_audit(
        actor_id, 'global', null, 'platform.shop.pos_first.create.failure',
        'critical', 'failure', 'shop', null, redacted_reason, 'db_failure',
        jsonb_build_object('credential_generated', false)
      );
    end if;
    return app_private.platform_action_result(false, 'db_failure', null, audit_event_id);
end;
$$;

create or replace function public.platform_create_shop_with_pending_owner_invite(
  p_shop_name text,
  p_shop_code text,
  p_owner_email text,
  p_reason text,
  p_company_rut text,
  p_business_giro text,
  p_business_address text,
  p_business_city text,
  p_legal_representative_rut text
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
  redacted_reason text := btrim(coalesce(p_reason, ''));
  redacted_contact text;
  contact_digest text;
  created_shop_id uuid;
  invite_id uuid;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  audit_event_id := app_private.task051_platform_audit(
    actor_id, 'global', null, 'platform.shop.pending_owner_invite.attempt',
    'info', 'success', 'owner_invite', null, redacted_reason, 'attempt',
    jsonb_build_object('email_delivery_active', false)
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
    or length(redacted_reason) = 0 then
    audit_event_id := app_private.task051_platform_audit(
      actor_id, 'global', null, 'platform.shop.pending_owner_invite.failure',
      'warning', 'blocked', 'owner_invite', null, redacted_reason, 'validation_failed',
      jsonb_build_object('email_delivery_active', false)
    );
    return app_private.platform_action_result(false, 'validation_failed', null, audit_event_id);
  end if;

  if exists (select 1 from public.shops where shop_code = normalized_shop_code) then
    audit_event_id := app_private.task051_platform_audit(
      actor_id, 'global', null, 'platform.shop.pending_owner_invite.failure',
      'warning', 'blocked', 'shop', null, redacted_reason, 'duplicate_shop_code',
      jsonb_build_object('email_delivery_active', false)
    );
    return app_private.platform_action_result(false, 'duplicate_shop_code', null, audit_event_id);
  end if;

  if exists (select 1 from public.shops where company_rut = normalized_company_rut) then
    audit_event_id := app_private.task051_platform_audit(
      actor_id, 'global', null, 'platform.shop.pending_owner_invite.failure',
      'warning', 'blocked', 'shop', null, redacted_reason, 'duplicate_company_rut',
      jsonb_build_object('email_delivery_active', false)
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

  audit_event_id := app_private.task051_platform_audit(
    actor_id, 'shop', created_shop_id, 'platform.shop.pending_owner_invite.success',
    'info', 'success', 'owner_invite', invite_id::text, redacted_reason, 'success',
    jsonb_build_object('email_delivery_active', false, 'company_rut_present', true)
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
      'shop_code', normalized_shop_code
    );
exception
  when unique_violation then
    audit_event_id := app_private.task051_platform_audit(
      actor_id, 'global', null, 'platform.shop.pending_owner_invite.failure',
      'warning', 'blocked', 'owner_invite', null, redacted_reason, 'conflict',
      jsonb_build_object('email_delivery_active', false)
    );
    return app_private.platform_action_result(false, 'conflict', null, audit_event_id);
  when others then
    if actor_id is not null then
      audit_event_id := app_private.task051_platform_audit(
        actor_id, 'global', null, 'platform.shop.pending_owner_invite.failure',
        'critical', 'failure', 'owner_invite', null, redacted_reason, 'db_failure',
        jsonb_build_object('email_delivery_active', false)
      );
    end if;
    return app_private.platform_action_result(false, 'db_failure', null, audit_event_id);
end;
$$;

revoke all on function public.platform_create_shop_with_owner_bootstrap(
  text, text, text, text, text, text, text, uuid, text, text, text
) from public;
revoke all on function public.platform_create_shop_with_owner_bootstrap(
  text, text, text, text, text, text, text, uuid, text, text, text
) from anon;
revoke all on function public.platform_create_shop_with_owner_bootstrap(
  text, text, text, text, text, text, text, uuid, text, text, text
) from authenticated;
grant execute on function public.platform_create_shop_with_owner_bootstrap(
  text, text, text, text, text, text, text, uuid, text, text, text
) to authenticated;

revoke all on function public.platform_create_pos_first_shop(
  text, text, text, text, text, text, text, text, text, text
) from public;
revoke all on function public.platform_create_pos_first_shop(
  text, text, text, text, text, text, text, text, text, text
) from anon;
revoke all on function public.platform_create_pos_first_shop(
  text, text, text, text, text, text, text, text, text, text
) from authenticated;
grant execute on function public.platform_create_pos_first_shop(
  text, text, text, text, text, text, text, text, text, text
) to authenticated;

revoke all on function public.platform_create_shop_with_pending_owner_invite(
  text, text, text, text, text, text, text, text, text
) from public;
revoke all on function public.platform_create_shop_with_pending_owner_invite(
  text, text, text, text, text, text, text, text, text
) from anon;
revoke all on function public.platform_create_shop_with_pending_owner_invite(
  text, text, text, text, text, text, text, text, text
) from authenticated;
grant execute on function public.platform_create_shop_with_pending_owner_invite(
  text, text, text, text, text, text, text, text, text
) to authenticated;

notify pgrst, 'reload schema';
