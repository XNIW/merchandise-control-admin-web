-- TASK-140 P1 follow-up.
--
-- The first TASK-140 migration was already applied to non-production staging
-- before final review. Keep this correction additive so the deployed history
-- can advance without rewriting an applied migration.

create or replace function app_private.task140_owner_only_staff_web_permissions()
returns table(permission_key text)
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  values
    ('shop_admin.full_access'),
    ('devices.write'),
    ('settings.write');
$$;
revoke all on function app_private.task140_owner_only_staff_web_permissions()
  from public, anon, authenticated, service_role;
create or replace function app_private.task140_safe_staff_web_permissions()
returns table(permission_key text)
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  values
    ('catalog.read'),
    ('catalog.write'),
    ('catalog.import'),
    ('catalog.export'),
    ('staff.read'),
    ('staff.write'),
    ('devices.read'),
    ('audit.read'),
    ('settings.read'),
    ('pos.dashboard.read'),
    ('sync.read'),
    ('sync.write');
$$;
revoke all on function app_private.task140_safe_staff_web_permissions()
  from public, anon, authenticated, service_role;
create or replace function app_private.task140_enforce_staff_role_permission_boundary()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_old_is_canonical_pos_admin boolean := false;
  v_new_is_canonical_pos_admin boolean := false;
  v_new_is_owner_only boolean := false;
begin
  if tg_op <> 'INSERT' then
    v_old_is_canonical_pos_admin := old.role_key = 'pos_admin'
      and exists (
        select 1
        from app_private.mac_admin_w7pos_009_pos_admin_permissions() as canonical
        where canonical.permission_key = old.permission_key
      );
  end if;

  if tg_op = 'DELETE' then
    if v_old_is_canonical_pos_admin
      and exists (
        select 1
        from public.shops as parent_shop
        where parent_shop.shop_id = old.shop_id
      )
      and not (
        app_private.is_platform_admin()
        and exists (
          select 1
          from public.shops as purge_shop
          where purge_shop.shop_id = old.shop_id
            and purge_shop.shop_status = 'archived'
            and (
              purge_shop.shop_code ~ '^(TASK|TEST|LOCAL|STAGING|DEV)[A-Z0-9_-]*$'
              or purge_shop.shop_code like '%_TEST_%'
          )
        )
      )
      and session_user not in ('postgres', 'supabase_admin') then
      raise exception using
        errcode = '23514',
        message = 'canonical POS Admin permissions cannot be removed';
    end if;

    return old;
  end if;

  v_new_is_canonical_pos_admin := new.role_key = 'pos_admin'
    and exists (
      select 1
      from app_private.mac_admin_w7pos_009_pos_admin_permissions() as canonical
      where canonical.permission_key = new.permission_key
    );
  v_new_is_owner_only := exists (
    select 1
    from app_private.task140_owner_only_staff_web_permissions() as owner_only
    where owner_only.permission_key = new.permission_key
  );

  if tg_op = 'UPDATE'
    and v_old_is_canonical_pos_admin
    and (
      not v_new_is_canonical_pos_admin
      or old.shop_id is distinct from new.shop_id
      or old.role_key is distinct from new.role_key
      or old.permission_key is distinct from new.permission_key
      or new.enabled is not true
    ) then
    raise exception using
      errcode = '23514',
      message = 'canonical POS Admin permissions cannot be reassigned or disabled';
  end if;

  if new.role_key = 'pos_admin'
    and (not v_new_is_canonical_pos_admin or new.enabled is not true) then
    raise exception using
      errcode = '23514',
      message = 'POS Admin permissions must remain canonical and enabled';
  end if;

  if new.role_key <> 'pos_admin'
    and v_new_is_owner_only then
    raise exception using
      errcode = '23514',
      message = 'owner-only permissions can only be assigned to POS Admin';
  end if;

  return new;
end;
$$;
revoke all on function app_private.task140_enforce_staff_role_permission_boundary()
  from public, anon, authenticated, service_role;
drop trigger if exists task140_enforce_staff_role_permission_boundary
  on public.staff_role_permissions;
create trigger task140_enforce_staff_role_permission_boundary
before insert or update or delete on public.staff_role_permissions
for each row execute function app_private.task140_enforce_staff_role_permission_boundary();
create or replace function app_private.task140_seed_pos_admin_permissions_for_shop()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  insert into public.staff_role_permissions (
    shop_id,
    role_key,
    permission_key,
    enabled,
    updated_by_profile_id,
    updated_at
  )
  select
    new.shop_id,
    'pos_admin',
    canonical.permission_key,
    true,
    new.created_by_profile_id,
    now()
  from app_private.mac_admin_w7pos_009_pos_admin_permissions() as canonical
  on conflict (shop_id, role_key, permission_key)
  do update set
    enabled = true,
    updated_by_profile_id = excluded.updated_by_profile_id,
    updated_at = now();

  return new;
end;
$$;
revoke all on function app_private.task140_seed_pos_admin_permissions_for_shop()
  from public, anon, authenticated, service_role;
drop trigger if exists task140_seed_pos_admin_permissions_for_shop
  on public.shops;
create trigger task140_seed_pos_admin_permissions_for_shop
after insert on public.shops
for each row execute function app_private.task140_seed_pos_admin_permissions_for_shop();
-- Reconcile the privileged role only after the structural trigger exists.
-- This makes the final state deterministic even if a legacy/non-production
-- database accumulated disabled canonical rows or non-canonical additions.
delete from public.staff_role_permissions as pos_admin_permission
where pos_admin_permission.role_key = 'pos_admin'
  and not exists (
    select 1
    from app_private.mac_admin_w7pos_009_pos_admin_permissions() as canonical
    where canonical.permission_key = pos_admin_permission.permission_key
  );
insert into public.staff_role_permissions (
  shop_id,
  role_key,
  permission_key,
  enabled,
  updated_by_profile_id,
  updated_at
)
select
  shop.shop_id,
  'pos_admin',
  canonical.permission_key,
  true,
  null,
  now()
from public.shops as shop
cross join app_private.mac_admin_w7pos_009_pos_admin_permissions() as canonical
on conflict (shop_id, role_key, permission_key)
do update set
  enabled = true,
  updated_at = now();
-- Earlier provisioning migrations assigned full Shop Admin access to the
-- shared manager role. The trigger is installed first, holding its DDL lock
-- through commit, so no concurrent owner-only grant can land between cleanup
-- and enforcement. Preserve the non-owner capability that full access used to
-- imply, then remove every owner-only row from every shared role.
with legacy_full_access_roles as materialized (
  select
    legacy_permission.shop_id,
    legacy_permission.role_key,
    legacy_permission.updated_by_profile_id
  from public.staff_role_permissions as legacy_permission
  where legacy_permission.role_key <> 'pos_admin'
    and legacy_permission.permission_key = 'shop_admin.full_access'
    and legacy_permission.enabled
)
insert into public.staff_role_permissions (
  shop_id,
  role_key,
  permission_key,
  enabled,
  updated_by_profile_id,
  updated_at
)
select
  legacy_role.shop_id,
  legacy_role.role_key,
  safe_permission.permission_key,
  true,
  legacy_role.updated_by_profile_id,
  now()
from legacy_full_access_roles as legacy_role
cross join app_private.task140_safe_staff_web_permissions() as safe_permission
on conflict (shop_id, role_key, permission_key)
do update set
  enabled = true,
  updated_by_profile_id = excluded.updated_by_profile_id,
  updated_at = now();
delete from public.staff_role_permissions as legacy_permission
using app_private.task140_owner_only_staff_web_permissions() as owner_only
where legacy_permission.role_key <> 'pos_admin'
  and legacy_permission.permission_key = owner_only.permission_key;
create or replace function app_private.task140_write_role_permission_audit(
  p_actor_profile_id uuid,
  p_actor_staff_id uuid,
  p_shop_id uuid,
  p_event_key text,
  p_severity text,
  p_result text,
  p_code text,
  p_role_key text,
  p_permission_count integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_audit_event_id uuid;
begin
  insert into public.audit_logs (
    actor_profile_id,
    actor_staff_id,
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
    p_actor_staff_id,
    'shop',
    p_shop_id,
    p_event_key,
    p_severity,
    p_result,
    'staff_role',
    p_role_key,
    jsonb_build_object(
      'actor_kind', case
        when p_actor_staff_id is null then 'personal_account'
        else 'pos_staff_manager'
      end,
      'code', p_code,
      'permission_count', greatest(coalesce(p_permission_count, 0), 0),
      'role_key', p_role_key,
      'source', 'TASK-140'
    )
  )
  returning audit_log_id into v_audit_event_id;

  return v_audit_event_id;
end;
$$;
revoke all on function app_private.task140_write_role_permission_audit(
  uuid, uuid, uuid, text, text, text, text, text, integer
) from public, anon, authenticated, service_role;
create or replace function public.shop_staff_replace_role_permissions_as_web(
  p_actor_staff_id uuid,
  p_actor_staff_web_session_id uuid,
  p_shop_id uuid,
  p_role_key text,
  p_permissions text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_auth_role text := coalesce(auth.role(), '');
  v_role_key text := btrim(coalesce(p_role_key, ''));
  v_permissions text[] := '{}'::text[];
  v_permission_count integer := 0;
  v_actor_profile_id uuid;
  v_actor_staff_id uuid;
  v_actor_role_key text;
  v_actor_credential_version integer;
  v_actor_session_invalidated_at timestamptz;
  v_final_permissions text[] := '{}'::text[];
  v_audit_event_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_auth_role not in ('authenticated', 'service_role') then
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      v_role_key,
      null,
      '{}'::jsonb
    );
  end if;

  if v_auth_role = 'authenticated' then
    if p_actor_staff_id is not null or p_actor_staff_web_session_id is not null then
      return app_private.shop_admin_action_result(
        false,
        'unauthorized',
        p_shop_id,
        v_role_key,
        null,
        '{}'::jsonb
      );
    end if;

    v_actor_profile_id := auth.uid();

    perform 1
    from public.shop_members as actor_membership
    join public.profiles as actor_profile
      on actor_profile.profile_id = actor_membership.profile_id
    join public.shops as shop_row
      on shop_row.shop_id = actor_membership.shop_id
    where actor_membership.profile_id = v_actor_profile_id
      and actor_membership.shop_id = p_shop_id
      and actor_membership.membership_status = 'active'
      and actor_membership.role_key in ('shop_owner', 'shop_manager')
      and actor_profile.profile_status = 'active'
      and shop_row.shop_status = 'active'
      and shop_row.archived_at is null
    for share of actor_membership, actor_profile, shop_row;

    if not found then
      perform 1
      from public.platform_admins as platform_actor
      join public.profiles as actor_profile
        on actor_profile.profile_id = platform_actor.profile_id
      join public.shops as shop_row
        on shop_row.shop_id = p_shop_id
      where platform_actor.profile_id = v_actor_profile_id
        and platform_actor.status = 'active'
        and platform_actor.revoked_at is null
        and actor_profile.profile_status = 'active'
        and shop_row.shop_status = 'active'
        and shop_row.archived_at is null
      for share of platform_actor, actor_profile, shop_row;
    end if;

    if not found then
      return app_private.shop_admin_action_result(
        false,
        'unauthorized',
        p_shop_id,
        v_role_key,
        null,
        '{}'::jsonb
      );
    end if;
  else
    if p_actor_staff_id is null or p_actor_staff_web_session_id is null then
      return app_private.shop_admin_action_result(
        false,
        'unauthorized',
        p_shop_id,
        v_role_key,
        null,
        '{}'::jsonb
      );
    end if;

    select
      actor_row.staff_id,
      actor_row.role_key,
      actor_row.credential_version,
      actor_row.session_invalidated_at
    into
      v_actor_staff_id,
      v_actor_role_key,
      v_actor_credential_version,
      v_actor_session_invalidated_at
    from public.staff_accounts as actor_row
    join public.shops as shop_row
      on shop_row.shop_id = actor_row.shop_id
    where actor_row.staff_id = p_actor_staff_id
      and actor_row.shop_id = p_shop_id
      and actor_row.role_key in ('manager', 'pos_admin')
      and actor_row.status = 'active'
      and actor_row.credential_kind is not null
      and actor_row.credential_hash is not null
      and (
        actor_row.credential_status = 'active'
        or (
          actor_row.credential_status = 'locked'
          and actor_row.locked_until <= v_now
        )
      )
      and actor_row.must_change_credential is not true
      and (actor_row.locked_until is null or actor_row.locked_until <= v_now)
      and (
        actor_row.credential_expires_at is null
        or actor_row.credential_expires_at > v_now
      )
      and actor_row.web_access_revoked_at is null
      and shop_row.shop_status = 'active'
      and shop_row.archived_at is null
    for share of actor_row, shop_row;

    if not found then
      return app_private.shop_admin_action_result(
        false,
        'unauthorized',
        p_shop_id,
        v_role_key,
        null,
        '{}'::jsonb
      );
    end if;

    perform 1
    from public.staff_web_sessions as actor_session
    where actor_session.staff_web_session_id = p_actor_staff_web_session_id
      and actor_session.shop_id = p_shop_id
      and actor_session.staff_id = p_actor_staff_id
      and actor_session.staff_credential_version = v_actor_credential_version
      and actor_session.status = 'active'
      and actor_session.revoked_at is null
      and actor_session.expires_at > v_now
      and (
        v_actor_session_invalidated_at is null
        or actor_session.issued_at >= v_actor_session_invalidated_at
      )
    for share;

    if not found then
      return app_private.shop_admin_action_result(
        false,
        'unauthorized',
        p_shop_id,
        v_role_key,
        null,
        '{}'::jsonb
      );
    end if;

    perform 1
    from public.staff_role_permissions as actor_permission
    where actor_permission.shop_id = p_shop_id
      and actor_permission.role_key = v_actor_role_key
      and actor_permission.permission_key = 'shop_admin.full_access'
      and actor_permission.enabled
    for share;

    if not found then
      return app_private.shop_admin_action_result(
        false,
        'unauthorized',
        p_shop_id,
        v_role_key,
        null,
        '{}'::jsonb
      );
    end if;
  end if;

  if v_role_key = 'pos_admin' then
    v_audit_event_id := app_private.task140_write_role_permission_audit(
      v_actor_profile_id,
      v_actor_staff_id,
      p_shop_id,
      'shop.staff.permissions.update.failure',
      'warning',
      'blocked',
      'unauthorized',
      v_role_key,
      coalesce(cardinality(p_permissions), 0)
    );
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      v_role_key,
      v_audit_event_id,
      '{}'::jsonb
    );
  end if;

  if v_role_key not in ('cashier', 'manager', 'viewer')
    or p_permissions is null
    or cardinality(p_permissions) > 100
    or array_position(p_permissions, null) is not null then
    v_audit_event_id := app_private.task140_write_role_permission_audit(
      v_actor_profile_id,
      v_actor_staff_id,
      p_shop_id,
      'shop.staff.permissions.update.failure',
      'warning',
      'blocked',
      'validation_failed',
      v_role_key,
      coalesce(cardinality(p_permissions), 0)
    );
    return app_private.shop_admin_action_result(
      false,
      'validation_failed',
      p_shop_id,
      v_role_key,
      v_audit_event_id,
      '{}'::jsonb
    );
  end if;

  select coalesce(
    array_agg(distinct requested_permission order by requested_permission),
    '{}'::text[]
  )
  into v_permissions
  from unnest(p_permissions) as requested(requested_permission);

  v_permission_count := cardinality(v_permissions);

  if exists (
    select 1
    from unnest(v_permissions) as requested(permission_key)
    join app_private.task140_owner_only_staff_web_permissions() as owner_only
      on owner_only.permission_key = requested.permission_key
  ) then
    v_audit_event_id := app_private.task140_write_role_permission_audit(
      v_actor_profile_id,
      v_actor_staff_id,
      p_shop_id,
      'shop.staff.permissions.update.failure',
      'warning',
      'blocked',
      'unauthorized',
      v_role_key,
      v_permission_count
    );
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      v_role_key,
      v_audit_event_id,
      '{}'::jsonb
    );
  end if;

  if exists (
    select 1
    from unnest(v_permissions) as requested(permission_key)
    where not exists (
      select 1
      from app_private.task140_safe_staff_web_permissions() as safe_permission
      where safe_permission.permission_key = requested.permission_key
    )
  ) then
    v_audit_event_id := app_private.task140_write_role_permission_audit(
      v_actor_profile_id,
      v_actor_staff_id,
      p_shop_id,
      'shop.staff.permissions.update.failure',
      'warning',
      'blocked',
      'validation_failed',
      v_role_key,
      v_permission_count
    );
    return app_private.shop_admin_action_result(
      false,
      'validation_failed',
      p_shop_id,
      v_role_key,
      v_audit_event_id,
      '{}'::jsonb
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'TASK140:STAFF_ROLE:' || p_shop_id::text || ':' || v_role_key,
      0
    )
  );

  perform 1
  from public.staff_role_permissions as target_permission
  where target_permission.shop_id = p_shop_id
    and target_permission.role_key = v_role_key
  order by target_permission.permission_key
  for update;

  if exists (
    select 1
    from public.staff_role_permissions as target_permission
    join app_private.task140_owner_only_staff_web_permissions() as owner_only
      on owner_only.permission_key = target_permission.permission_key
    where target_permission.shop_id = p_shop_id
      and target_permission.role_key = v_role_key
  ) then
    v_audit_event_id := app_private.task140_write_role_permission_audit(
      v_actor_profile_id,
      v_actor_staff_id,
      p_shop_id,
      'shop.staff.permissions.update.failure',
      'warning',
      'blocked',
      'unauthorized',
      v_role_key,
      v_permission_count
    );
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      v_role_key,
      v_audit_event_id,
      '{}'::jsonb
    );
  end if;

  begin
    delete from public.staff_role_permissions as stale_permission
    where stale_permission.shop_id = p_shop_id
      and stale_permission.role_key = v_role_key
      and exists (
        select 1
        from app_private.task140_safe_staff_web_permissions() as safe_permission
        where safe_permission.permission_key = stale_permission.permission_key
      )
      and not (stale_permission.permission_key = any(v_permissions));

    insert into public.staff_role_permissions (
      shop_id,
      role_key,
      permission_key,
      enabled,
      updated_by_profile_id,
      updated_at
    )
    select
      p_shop_id,
      v_role_key,
      requested_permission,
      true,
      v_actor_profile_id,
      v_now
    from unnest(v_permissions) as requested(requested_permission)
    on conflict (shop_id, role_key, permission_key)
    do update set
      enabled = true,
      updated_by_profile_id = excluded.updated_by_profile_id,
      updated_at = excluded.updated_at;

    select coalesce(
      array_agg(target_permission.permission_key order by target_permission.permission_key),
      '{}'::text[]
    )
    into v_final_permissions
    from public.staff_role_permissions as target_permission
    join app_private.task140_safe_staff_web_permissions() as safe_permission
      on safe_permission.permission_key = target_permission.permission_key
    where target_permission.shop_id = p_shop_id
      and target_permission.role_key = v_role_key
      and target_permission.enabled;

    if v_final_permissions is distinct from v_permissions then
      raise exception using
        errcode = '23514',
        message = 'staff role permission replace final-set mismatch';
    end if;
  exception
    when others then
      v_audit_event_id := app_private.task140_write_role_permission_audit(
        v_actor_profile_id,
        v_actor_staff_id,
        p_shop_id,
        'shop.staff.permissions.update.failure',
        'critical',
        'failure',
        'db_failure',
        v_role_key,
        v_permission_count
      );
      return app_private.shop_admin_action_result(
        false,
        'db_failure',
        p_shop_id,
        v_role_key,
        v_audit_event_id,
        '{}'::jsonb
      );
  end;

  v_audit_event_id := app_private.task140_write_role_permission_audit(
    v_actor_profile_id,
    v_actor_staff_id,
    p_shop_id,
    'shop.staff.permissions.update.success',
    'warning',
    'success',
    'success',
    v_role_key,
    v_permission_count
  );

  return app_private.shop_admin_action_result(
    true,
    'success',
    p_shop_id,
    v_role_key,
    v_audit_event_id,
    '{}'::jsonb
  );
end;
$$;
revoke all on function public.shop_staff_replace_role_permissions_as_web(
  uuid, uuid, uuid, text, text[]
) from public, anon, authenticated, service_role;
grant execute on function public.shop_staff_replace_role_permissions_as_web(
  uuid, uuid, uuid, text, text[]
) to authenticated, service_role;
create or replace function app_private.task140_enforce_pos_admin_owner_platform()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_new_role_has_owner_only boolean := false;
  v_old_role_has_owner_only boolean := false;
  v_owner_authorized boolean := false;
  v_protected_role boolean := false;
  v_role_promoted boolean;
  v_sensitive_owner_only_mutation boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  select exists (
    select 1
    from public.staff_role_permissions as protected_permission
    join app_private.task140_owner_only_staff_web_permissions() as owner_only
      on owner_only.permission_key = protected_permission.permission_key
    where protected_permission.shop_id = new.shop_id
      and protected_permission.role_key = new.role_key
      and protected_permission.enabled
  ) into v_new_role_has_owner_only;

  if tg_op = 'INSERT' then
    v_role_promoted := true;
    v_protected_role := new.role_key = 'pos_admin'
      or v_new_role_has_owner_only;
    v_sensitive_owner_only_mutation := true;
    v_owner_authorized := app_private.is_active_shop_owner_member(new.shop_id);
  else
    select exists (
      select 1
      from public.staff_role_permissions as protected_permission
      join app_private.task140_owner_only_staff_web_permissions() as owner_only
        on owner_only.permission_key = protected_permission.permission_key
      where protected_permission.shop_id = old.shop_id
        and protected_permission.role_key = old.role_key
        and protected_permission.enabled
    ) into v_old_role_has_owner_only;

    v_role_promoted := old.role_key is distinct from new.role_key
      or old.shop_id is distinct from new.shop_id;
    v_protected_role := old.role_key = 'pos_admin'
      or new.role_key = 'pos_admin'
      or v_old_role_has_owner_only
      or v_new_role_has_owner_only;
    v_sensitive_owner_only_mutation := v_role_promoted
      or old.staff_code is distinct from new.staff_code
      or old.display_name is distinct from new.display_name
      or old.status is distinct from new.status
      or old.credential_kind is distinct from new.credential_kind
      or old.credential_hash is distinct from new.credential_hash
      or old.credential_updated_at is distinct from new.credential_updated_at
      or old.credential_expires_at is distinct from new.credential_expires_at
      or old.credential_version is distinct from new.credential_version
      or old.must_change_credential is distinct from new.must_change_credential
      or old.session_invalidated_at is distinct from new.session_invalidated_at
      or old.web_access_revoked_at is distinct from new.web_access_revoked_at
      or old.web_access_revoked_by_staff_id
        is distinct from new.web_access_revoked_by_staff_id
      or old.web_access_revoked_reason
        is distinct from new.web_access_revoked_reason
      or (
        coalesce(auth.role(), '') <> 'service_role'
        and (
          old.failed_attempts is distinct from new.failed_attempts
          or old.locked_until is distinct from new.locked_until
        )
      )
      or (
        old.credential_status = 'locked'
        and (old.locked_until is null or old.locked_until > v_now)
        and new.credential_status = 'active'
        and new.failed_attempts = 0
        and new.locked_until is null
      );
    v_owner_authorized := app_private.is_active_shop_owner_member(new.shop_id)
      and app_private.is_active_shop_owner_member(old.shop_id);
  end if;

  if v_protected_role
    and v_sensitive_owner_only_mutation
    and coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin')
    and not v_owner_authorized
    and not app_private.is_platform_admin() then
    raise exception using
      errcode = '42501',
      message = 'owner-only staff mutation requires an active shop owner or platform admin';
  end if;

  return new;
end;
$$;
revoke all on function app_private.task140_enforce_pos_admin_owner_platform()
  from public, anon, authenticated, service_role;
drop trigger if exists task140_enforce_pos_admin_owner_platform
  on public.staff_accounts;
create trigger task140_enforce_pos_admin_owner_platform
before insert or update on public.staff_accounts
for each row execute function app_private.task140_enforce_pos_admin_owner_platform();
create or replace function public.shop_staff_lifecycle_as_staff_web(
  p_actor_staff_id uuid,
  p_actor_staff_web_session_id uuid,
  p_shop_id uuid,
  p_action text,
  p_target_staff_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reason text := app_private.normalize_admin_label(p_reason);
  v_reason_metadata jsonb;
  v_event_base text;
  v_actor_role_key text;
  v_actor_credential_version integer;
  v_actor_session_invalidated_at timestamptz;
  v_target_role_key text;
  v_target_role_has_owner_only boolean := false;
  v_mutated_staff_id uuid;
  v_audit_event_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  v_reason_metadata := jsonb_build_object(
    'reason_provided', length(v_reason) > 0,
    'reason_length', length(v_reason)
  );

  if coalesce(auth.role(), '') <> 'service_role' then
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      p_target_staff_id::text,
      null,
      jsonb_build_object('action', v_action)
    );
  end if;

  v_event_base := case v_action
    when 'suspend' then 'shop.staff.suspend'
    when 'reactivate' then 'shop.staff.reactivate'
    when 'archive' then 'shop.staff.archive'
    when 'force_credential_rotation' then 'shop.staff.credential.rotation.force'
    when 'revoke_web_access' then 'shop.staff.web_access.revoke'
    when 'revoke_web_sessions' then 'shop.staff.web_sessions.revoke'
    else null
  end;

  if v_event_base is null or p_target_staff_id is null then
    return app_private.shop_admin_action_result(
      false,
      'validation_failed',
      p_shop_id,
      p_target_staff_id::text,
      null,
      jsonb_build_object('action', v_action)
    );
  end if;

  select actor_row.role_key,
         actor_row.credential_version,
         actor_row.session_invalidated_at
  into v_actor_role_key,
       v_actor_credential_version,
       v_actor_session_invalidated_at
  from public.staff_accounts as actor_row
  join public.shops as shop_row
    on shop_row.shop_id = actor_row.shop_id
  where actor_row.staff_id = p_actor_staff_id
    and actor_row.shop_id = p_shop_id
    and actor_row.role_key in ('manager', 'pos_admin')
    and actor_row.status = 'active'
    and actor_row.credential_kind is not null
    and actor_row.credential_hash is not null
    and (
      actor_row.credential_status = 'active'
      or (
        actor_row.credential_status = 'locked'
        and actor_row.locked_until <= v_now
      )
    )
    and actor_row.must_change_credential is not true
    and (actor_row.locked_until is null or actor_row.locked_until <= v_now)
    and (
      actor_row.credential_expires_at is null
      or actor_row.credential_expires_at > v_now
    )
    and actor_row.web_access_revoked_at is null
    and shop_row.shop_status = 'active'
    and shop_row.archived_at is null
  for share of actor_row, shop_row;

  if not found then
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      p_target_staff_id::text,
      null,
      jsonb_build_object('action', v_action)
    );
  end if;

  perform 1
  from public.staff_web_sessions as actor_session
  where actor_session.staff_web_session_id = p_actor_staff_web_session_id
    and actor_session.shop_id = p_shop_id
    and actor_session.staff_id = p_actor_staff_id
    and actor_session.staff_credential_version = v_actor_credential_version
    and actor_session.status = 'active'
    and actor_session.revoked_at is null
    and actor_session.expires_at > v_now
    and (
      v_actor_session_invalidated_at is null
      or actor_session.issued_at >= v_actor_session_invalidated_at
    )
  for share;

  if not found then
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      p_target_staff_id::text,
      null,
      jsonb_build_object('action', v_action)
    );
  end if;

  perform 1
  from public.staff_role_permissions as actor_permission
  where actor_permission.shop_id = p_shop_id
    and actor_permission.role_key = v_actor_role_key
    and actor_permission.permission_key in ('staff.write', 'shop_admin.full_access')
    and actor_permission.enabled
  for share;

  if not found then
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      p_target_staff_id::text,
      null,
      jsonb_build_object('action', v_action)
    );
  end if;

  if length(v_reason) = 0 then
    v_audit_event_id := app_private.write_staff_shop_admin_audit(
      p_actor_staff_id,
      p_shop_id,
      v_event_base || '.failure',
      'warning',
      'blocked',
      'staff',
      p_target_staff_id::text,
      'reason_required',
      v_reason_metadata
    );
    return app_private.shop_admin_action_result(
      false,
      'reason_required',
      p_shop_id,
      p_target_staff_id::text,
      v_audit_event_id,
      jsonb_build_object('action', v_action)
    );
  end if;

  select target_row.role_key
  into v_target_role_key
  from public.staff_accounts as target_row
  where target_row.staff_id = p_target_staff_id
    and target_row.shop_id = p_shop_id
    and target_row.status <> 'archived'
  for update;

  if not found then
    v_audit_event_id := app_private.write_staff_shop_admin_audit(
      p_actor_staff_id,
      p_shop_id,
      v_event_base || '.failure',
      'warning',
      'blocked',
      'staff',
      p_target_staff_id::text,
      'not_found',
      v_reason_metadata
    );
    return app_private.shop_admin_action_result(
      false,
      'not_found',
      p_shop_id,
      p_target_staff_id::text,
      v_audit_event_id,
      jsonb_build_object('action', v_action)
    );
  end if;

  perform 1
  from public.staff_role_permissions as protected_permission
  join app_private.task140_owner_only_staff_web_permissions() as owner_only
    on owner_only.permission_key = protected_permission.permission_key
  where protected_permission.shop_id = p_shop_id
    and protected_permission.role_key = v_target_role_key
    and protected_permission.enabled
  for share of protected_permission;

  v_target_role_has_owner_only := found;

  if v_target_role_key = 'pos_admin' or v_target_role_has_owner_only then
    v_audit_event_id := app_private.write_staff_shop_admin_audit(
      p_actor_staff_id,
      p_shop_id,
      v_event_base || '.failure',
      'warning',
      'blocked',
      'staff',
      p_target_staff_id::text,
      'unauthorized',
      v_reason_metadata || jsonb_build_object('role_key', v_target_role_key)
    );
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      p_target_staff_id::text,
      v_audit_event_id,
      jsonb_build_object('action', v_action)
    );
  end if;

  if v_action in ('suspend', 'reactivate', 'archive') then
    update public.staff_accounts
    set status = case v_action
          when 'suspend' then 'suspended'
          when 'reactivate' then 'active'
          else 'archived'
        end,
        session_invalidated_at = case
          when v_action = 'reactivate' then session_invalidated_at
          else v_now
        end,
        updated_at = v_now
    where staff_id = p_target_staff_id
      and shop_id = p_shop_id
      and role_key = v_target_role_key
      and status <> 'archived'
    returning staff_id into v_mutated_staff_id;
  elsif v_action = 'force_credential_rotation' then
    update public.staff_accounts
    set credential_status = 'rotation_required',
        must_change_credential = true,
        session_invalidated_at = v_now,
        updated_at = v_now
    where staff_id = p_target_staff_id
      and shop_id = p_shop_id
      and role_key = v_target_role_key
      and status <> 'archived'
    returning staff_id into v_mutated_staff_id;
  elsif v_action = 'revoke_web_access' then
    update public.staff_accounts
    set session_invalidated_at = v_now,
        updated_at = v_now,
        web_access_revoked_at = v_now,
        web_access_revoked_by_staff_id = p_actor_staff_id,
        web_access_revoked_reason = left(v_reason, 240)
    where staff_id = p_target_staff_id
      and shop_id = p_shop_id
      and role_key = v_target_role_key
      and status <> 'archived'
    returning staff_id into v_mutated_staff_id;
  else
    update public.staff_accounts
    set session_invalidated_at = v_now,
        updated_at = v_now
    where staff_id = p_target_staff_id
      and shop_id = p_shop_id
      and role_key = v_target_role_key
      and status <> 'archived'
    returning staff_id into v_mutated_staff_id;
  end if;

  if v_mutated_staff_id is null then
    v_audit_event_id := app_private.write_staff_shop_admin_audit(
      p_actor_staff_id,
      p_shop_id,
      v_event_base || '.failure',
      'warning',
      'blocked',
      'staff',
      p_target_staff_id::text,
      'not_found',
      v_reason_metadata
    );
    return app_private.shop_admin_action_result(
      false,
      'not_found',
      p_shop_id,
      p_target_staff_id::text,
      v_audit_event_id,
      jsonb_build_object('action', v_action)
    );
  end if;

  if v_action in (
    'suspend',
    'archive',
    'force_credential_rotation',
    'revoke_web_access',
    'revoke_web_sessions'
  ) then
    update public.staff_web_sessions
    set status = 'revoked',
        revoked_at = v_now,
        revoked_reason = left(v_action, 240),
        updated_at = v_now
    where shop_id = p_shop_id
      and staff_id = p_target_staff_id
      and status = 'active';
  end if;

  v_audit_event_id := app_private.write_staff_shop_admin_audit(
    p_actor_staff_id,
    p_shop_id,
    v_event_base || '.success',
    case when v_action = 'reactivate' then 'info' else 'warning' end,
    'success',
    'staff',
    v_mutated_staff_id::text,
    'success',
    v_reason_metadata
  );

  return app_private.shop_admin_action_result(
    true,
    'success',
    p_shop_id,
    v_mutated_staff_id::text,
    v_audit_event_id,
    jsonb_build_object('action', v_action)
  );
end;
$$;
revoke all on function public.shop_staff_lifecycle_as_staff_web(
  uuid, uuid, uuid, text, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.shop_staff_lifecycle_as_staff_web(
  uuid, uuid, uuid, text, uuid, text
) to service_role;
create or replace function public.shop_staff_lifecycle_as_personal_account(
  p_shop_id uuid,
  p_action text,
  p_target_staff_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reason text := app_private.normalize_admin_label(p_reason);
  v_event_base text;
  v_actor_profile_id uuid := auth.uid();
  v_actor_membership_role text;
  v_actor_has_shop_membership boolean := false;
  v_actor_is_platform_admin boolean := false;
  v_target_role_key text;
  v_target_role_has_owner_only boolean := false;
  v_mutated_staff_id uuid;
  v_audit_event_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'authenticated'
    or v_actor_profile_id is null then
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      p_target_staff_id::text,
      null,
      jsonb_build_object('action', v_action)
    );
  end if;

  v_event_base := case v_action
    when 'revoke_web_access' then 'shop.staff.web_access.revoke'
    when 'revoke_web_sessions' then 'shop.staff.web_sessions.revoke'
    else null
  end;

  if p_shop_id is null
    or p_target_staff_id is null
    or v_event_base is null then
    return app_private.shop_admin_action_result(
      false,
      'validation_failed',
      p_shop_id,
      p_target_staff_id::text,
      null,
      jsonb_build_object('action', v_action)
    );
  end if;

  perform 1
  from public.profiles as actor_profile
  join public.shops as shop_row
    on shop_row.shop_id = p_shop_id
  where actor_profile.profile_id = v_actor_profile_id
    and actor_profile.profile_status = 'active'
    and actor_profile.disabled_at is null
    and shop_row.shop_status = 'active'
    and shop_row.archived_at is null
  for share of actor_profile, shop_row;

  if not found then
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      p_target_staff_id::text,
      null,
      jsonb_build_object('action', v_action)
    );
  end if;

  select actor_membership.role_key
  into v_actor_membership_role
  from public.shop_members as actor_membership
  where actor_membership.profile_id = v_actor_profile_id
    and actor_membership.shop_id = p_shop_id
    and actor_membership.membership_status = 'active'
    and actor_membership.role_key in ('shop_owner', 'shop_manager')
  for share of actor_membership;

  v_actor_has_shop_membership := found;

  perform 1
  from public.platform_admins as platform_actor
  where platform_actor.profile_id = v_actor_profile_id
    and platform_actor.status = 'active'
    and platform_actor.revoked_at is null
  for share of platform_actor;

  v_actor_is_platform_admin := found;

  if not v_actor_has_shop_membership
    and not v_actor_is_platform_admin then
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      p_target_staff_id::text,
      null,
      jsonb_build_object('action', v_action)
    );
  end if;

  if length(v_reason) = 0 then
    insert into public.audit_logs (
      actor_profile_id,
      actor_staff_id,
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
      v_actor_profile_id,
      null,
      'shop',
      p_shop_id,
      v_event_base || '.failure',
      'warning',
      'blocked',
      'staff',
      p_target_staff_id::text,
      jsonb_build_object(
        'action', v_action,
        'actor_kind', 'personal_account',
        'code', 'reason_required',
        'reason_length', 0,
        'reason_provided', false,
        'source', 'TASK-140'
      )
    )
    returning audit_log_id into v_audit_event_id;

    return app_private.shop_admin_action_result(
      false,
      'reason_required',
      p_shop_id,
      p_target_staff_id::text,
      v_audit_event_id,
      jsonb_build_object('action', v_action)
    );
  end if;

  select target_row.role_key
  into v_target_role_key
  from public.staff_accounts as target_row
  where target_row.staff_id = p_target_staff_id
    and target_row.shop_id = p_shop_id
    and target_row.status <> 'archived'
  for update of target_row;

  if not found then
    insert into public.audit_logs (
      actor_profile_id,
      actor_staff_id,
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
      v_actor_profile_id,
      null,
      'shop',
      p_shop_id,
      v_event_base || '.failure',
      'warning',
      'blocked',
      'staff',
      p_target_staff_id::text,
      jsonb_build_object(
        'action', v_action,
        'actor_kind', 'personal_account',
        'code', 'invalid_state_or_not_found',
        'reason_length', length(v_reason),
        'reason_provided', true,
        'source', 'TASK-140'
      )
    )
    returning audit_log_id into v_audit_event_id;

    return app_private.shop_admin_action_result(
      false,
      'invalid_state_or_not_found',
      p_shop_id,
      p_target_staff_id::text,
      v_audit_event_id,
      jsonb_build_object('action', v_action)
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'TASK140:STAFF_ROLE:' || p_shop_id::text || ':' || v_target_role_key,
      0
    )
  );

  perform 1
  from public.staff_role_permissions as target_permission
  where target_permission.shop_id = p_shop_id
    and target_permission.role_key = v_target_role_key
  order by target_permission.permission_key
  for share of target_permission;

  select exists (
    select 1
    from public.staff_role_permissions as protected_permission
    join app_private.task140_owner_only_staff_web_permissions() as owner_only
      on owner_only.permission_key = protected_permission.permission_key
    where protected_permission.shop_id = p_shop_id
      and protected_permission.role_key = v_target_role_key
      and protected_permission.enabled
  ) into v_target_role_has_owner_only;

  if (v_target_role_key = 'pos_admin' or v_target_role_has_owner_only)
    and v_actor_membership_role is distinct from 'shop_owner'
    and not v_actor_is_platform_admin then
    insert into public.audit_logs (
      actor_profile_id,
      actor_staff_id,
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
      v_actor_profile_id,
      null,
      'shop',
      p_shop_id,
      v_event_base || '.failure',
      'warning',
      'blocked',
      'staff',
      p_target_staff_id::text,
      jsonb_build_object(
        'action', v_action,
        'actor_kind', 'personal_account',
        'code', 'unauthorized',
        'reason_length', length(v_reason),
        'reason_provided', true,
        'role_key', v_target_role_key,
        'source', 'TASK-140'
      )
    )
    returning audit_log_id into v_audit_event_id;

    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      p_target_staff_id::text,
      v_audit_event_id,
      jsonb_build_object('action', v_action)
    );
  end if;

  if v_action = 'revoke_web_access' then
    update public.staff_accounts
    set session_invalidated_at = v_now,
        updated_at = v_now,
        updated_by_profile_id = v_actor_profile_id,
        web_access_revoked_at = v_now,
        web_access_revoked_by_staff_id = null,
        web_access_revoked_reason = left(v_reason, 240)
    where staff_id = p_target_staff_id
      and shop_id = p_shop_id
      and role_key = v_target_role_key
      and status <> 'archived'
    returning staff_id into v_mutated_staff_id;
  else
    update public.staff_accounts
    set session_invalidated_at = v_now,
        updated_at = v_now,
        updated_by_profile_id = v_actor_profile_id
    where staff_id = p_target_staff_id
      and shop_id = p_shop_id
      and role_key = v_target_role_key
      and status <> 'archived'
    returning staff_id into v_mutated_staff_id;
  end if;

  if v_mutated_staff_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'personal staff lifecycle target changed while locked';
  end if;

  update public.staff_web_sessions
  set status = 'revoked',
      revoked_at = v_now,
      revoked_reason = left(v_action, 240),
      updated_at = v_now
  where shop_id = p_shop_id
    and staff_id = p_target_staff_id
    and status = 'active'
    and revoked_at is null;

  insert into public.audit_logs (
    actor_profile_id,
    actor_staff_id,
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
    v_actor_profile_id,
    null,
    'shop',
    p_shop_id,
    v_event_base || '.success',
    'warning',
    'success',
    'staff',
    v_mutated_staff_id::text,
    jsonb_build_object(
      'action', v_action,
      'actor_kind', 'personal_account',
      'code', 'success',
      'reason_length', length(v_reason),
      'reason_provided', true,
      'role_key', v_target_role_key,
      'source', 'TASK-140'
    )
  )
  returning audit_log_id into v_audit_event_id;

  return app_private.shop_admin_action_result(
    true,
    'success',
    p_shop_id,
    v_mutated_staff_id::text,
    v_audit_event_id,
    jsonb_build_object('action', v_action)
  );
end;
$$;
revoke all on function public.shop_staff_lifecycle_as_personal_account(
  uuid, text, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.shop_staff_lifecycle_as_personal_account(
  uuid, text, uuid, text
) to authenticated;
-- Reapply the complete atomic boundary because the base TASK-140 migration
-- has already reached non-production staging.
do $task140_exact_session$
begin
  if to_regprocedure(
    'public.shop_staff_mutate_as_staff_web(uuid,uuid,text,uuid,text,text,text,text,text,text,timestamptz)'
  ) is not null then
    execute $statement$
      revoke all on function public.shop_staff_mutate_as_staff_web(
        uuid, uuid, text, uuid, text, text, text, text, text, text, timestamptz
      ) from public, anon, authenticated, service_role;
    $statement$;
    execute $statement$
      drop function public.shop_staff_mutate_as_staff_web(
        uuid, uuid, text, uuid, text, text, text, text, text, text, timestamptz
      );
    $statement$;
  end if;
end;
$task140_exact_session$;
create or replace function public.shop_staff_mutate_as_staff_web(
  p_actor_staff_id uuid,
  p_actor_staff_web_session_id uuid,
  p_shop_id uuid,
  p_action text,
  p_target_staff_id uuid,
  p_staff_code text,
  p_display_name text,
  p_role_key text,
  p_credential_kind text,
  p_credential_hash text,
  p_reason text,
  p_credential_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_staff_code text := upper(btrim(coalesce(p_staff_code, '')));
  v_display_name text := app_private.normalize_admin_label(p_display_name);
  v_role_key text := btrim(coalesce(p_role_key, ''));
  v_credential_kind text := btrim(coalesce(p_credential_kind, ''));
  v_credential_hash text := btrim(coalesce(p_credential_hash, ''));
  v_reason text := app_private.normalize_admin_label(p_reason);
  v_reason_metadata jsonb;
  v_payload jsonb;
  v_actor_role_key text;
  v_actor_credential_version integer;
  v_actor_session_invalidated_at timestamptz;
  v_existing_staff_id uuid;
  v_mutated_staff_id uuid;
  v_target_staff_code text;
  v_target_role_key text;
  v_target_role_has_owner_only boolean := false;
  v_audit_event_id uuid;
  v_now timestamptz := now();
begin
  v_reason_metadata := jsonb_build_object(
    'reason_provided', length(v_reason) > 0,
    'reason_length', length(v_reason)
  );
  v_payload := jsonb_build_object('action', v_action);

  if coalesce(auth.role(), '') <> 'service_role' then
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      p_target_staff_id::text,
      null,
      v_payload
    );
  end if;

  select actor_row.role_key,
         actor_row.credential_version,
         actor_row.session_invalidated_at
  into v_actor_role_key,
       v_actor_credential_version,
       v_actor_session_invalidated_at
  from public.staff_accounts as actor_row
  join public.shops as shop_row
    on shop_row.shop_id = actor_row.shop_id
  where actor_row.staff_id = p_actor_staff_id
    and actor_row.shop_id = p_shop_id
    and actor_row.role_key in ('manager', 'pos_admin')
    and actor_row.status = 'active'
    and actor_row.credential_kind is not null
    and actor_row.credential_hash is not null
    and (
      actor_row.credential_status = 'active'
      or (
        actor_row.credential_status = 'locked'
        and actor_row.locked_until <= v_now
      )
    )
    and actor_row.must_change_credential is not true
    and (actor_row.locked_until is null or actor_row.locked_until <= v_now)
    and (
      actor_row.credential_expires_at is null
      or actor_row.credential_expires_at > v_now
    )
    and actor_row.web_access_revoked_at is null
    and shop_row.shop_status = 'active'
    and shop_row.archived_at is null
  for share of actor_row, shop_row;

  if not found then
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      p_target_staff_id::text,
      null,
      v_payload
    );
  end if;

  perform 1
  from public.staff_web_sessions as actor_session
  where actor_session.staff_web_session_id = p_actor_staff_web_session_id
    and actor_session.shop_id = p_shop_id
    and actor_session.staff_id = p_actor_staff_id
    and actor_session.staff_credential_version = v_actor_credential_version
    and actor_session.status = 'active'
    and actor_session.revoked_at is null
    and actor_session.expires_at > v_now
    and (
      v_actor_session_invalidated_at is null
      or actor_session.issued_at >= v_actor_session_invalidated_at
    )
  for share;

  if not found then
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      p_target_staff_id::text,
      null,
      v_payload
    );
  end if;

  perform 1
  from public.staff_role_permissions as permission_row
  where permission_row.shop_id = p_shop_id
    and permission_row.role_key = v_actor_role_key
    and permission_row.permission_key in ('staff.write', 'shop_admin.full_access')
    and permission_row.enabled
  for share;

  if not found then
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      p_target_staff_id::text,
      null,
      v_payload
    );
  end if;

  if v_action not in ('create', 'reset_credential', 'clear_lockout') then
    return app_private.shop_admin_action_result(
      false,
      'validation_failed',
      p_shop_id,
      p_target_staff_id::text,
      null,
      '{}'::jsonb
    );
  end if;

  if v_action = 'create' then
    if p_target_staff_id is not null
      or v_staff_code !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
      or length(v_display_name) = 0
      or v_role_key not in ('cashier', 'manager', 'viewer', 'pos_admin')
      or v_credential_kind not in ('pin', 'password')
      or v_credential_hash !~ '^\$scrypt-v1\$' then
      v_audit_event_id := app_private.write_staff_shop_admin_audit(
        p_actor_staff_id,
        p_shop_id,
        'shop.staff.create.failure',
        'warning',
        'blocked',
        'staff',
        null,
        'validation_failed',
        v_reason_metadata
      );
      return app_private.shop_admin_action_result(
        false,
        'validation_failed',
        p_shop_id,
        null,
        v_audit_event_id,
        v_payload
      );
    end if;

    perform 1
    from public.staff_role_permissions as protected_permission
    join app_private.task140_owner_only_staff_web_permissions() as owner_only
      on owner_only.permission_key = protected_permission.permission_key
    where protected_permission.shop_id = p_shop_id
      and protected_permission.role_key = v_role_key
      and protected_permission.enabled
    for share of protected_permission;

    if v_role_key = 'pos_admin' or found then
      v_audit_event_id := app_private.write_staff_shop_admin_audit(
        p_actor_staff_id,
        p_shop_id,
        'shop.staff.create.failure',
        'warning',
        'blocked',
        'staff',
        null,
        'unauthorized',
        v_reason_metadata || jsonb_build_object('role_key', v_role_key)
      );
      return app_private.shop_admin_action_result(
        false,
        'unauthorized',
        p_shop_id,
        null,
        v_audit_event_id,
        v_payload
      );
    end if;

    select staff_id
    into v_existing_staff_id
    from public.staff_accounts
    where shop_id = p_shop_id
      and staff_code = v_staff_code
    limit 1
    for share;

    if v_existing_staff_id is not null then
      v_audit_event_id := app_private.write_staff_shop_admin_audit(
        p_actor_staff_id,
        p_shop_id,
        'shop.staff.create.failure',
        'warning',
        'blocked',
        'staff',
        v_existing_staff_id::text,
        'duplicate_staff_code',
        v_reason_metadata
      );
      return app_private.shop_admin_action_result(
        false,
        'duplicate_staff_code',
        p_shop_id,
        v_existing_staff_id::text,
        v_audit_event_id,
        v_payload
      );
    end if;

    begin
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
        locked_until,
        credential_version,
        credential_status,
        updated_at
      )
      values (
        p_shop_id,
        v_staff_code,
        v_display_name,
        v_role_key,
        'active',
        v_credential_kind,
        v_credential_hash,
        v_now,
        p_credential_expires_at,
        false,
        0,
        null,
        1,
        'active',
        v_now
      )
      returning staff_id into v_mutated_staff_id;
    exception
      when unique_violation then
        v_audit_event_id := app_private.write_staff_shop_admin_audit(
          p_actor_staff_id,
          p_shop_id,
          'shop.staff.create.failure',
          'warning',
          'blocked',
          'staff',
          null,
          'duplicate_staff_code',
          v_reason_metadata
        );
        return app_private.shop_admin_action_result(
          false,
          'duplicate_staff_code',
          p_shop_id,
          null,
          v_audit_event_id,
          v_payload
        );
    end;

    perform app_private.clear_staff_web_login_attempt_lockout(
      p_shop_id,
      v_staff_code
    );

    v_audit_event_id := app_private.write_staff_shop_admin_audit(
      p_actor_staff_id,
      p_shop_id,
      'shop.staff.create.success',
      'info',
      'success',
      'staff',
      v_mutated_staff_id::text,
      'success',
      v_reason_metadata
    );

    return app_private.shop_admin_action_result(
      true,
      'success',
      p_shop_id,
      v_mutated_staff_id::text,
      v_audit_event_id,
      v_payload
    );
  end if;

  if p_target_staff_id is null then
    v_audit_event_id := app_private.write_staff_shop_admin_audit(
      p_actor_staff_id,
      p_shop_id,
      case
        when v_action = 'reset_credential' then 'shop.staff.credential.reset.failure'
        else 'shop.staff.lockout.clear.failure'
      end,
      'warning',
      'blocked',
      'staff',
      null,
      'validation_failed',
      v_reason_metadata
    );
    return app_private.shop_admin_action_result(
      false,
      'validation_failed',
      p_shop_id,
      null,
      v_audit_event_id,
      v_payload
    );
  end if;

  if length(v_reason) = 0 then
    v_audit_event_id := app_private.write_staff_shop_admin_audit(
      p_actor_staff_id,
      p_shop_id,
      case
        when v_action = 'reset_credential' then 'shop.staff.credential.reset.failure'
        else 'shop.staff.lockout.clear.failure'
      end,
      'warning',
      'blocked',
      'staff',
      p_target_staff_id::text,
      'reason_required',
      v_reason_metadata
    );
    return app_private.shop_admin_action_result(
      false,
      'reason_required',
      p_shop_id,
      p_target_staff_id::text,
      v_audit_event_id,
      v_payload
    );
  end if;

  select role_key
  into v_target_role_key
  from public.staff_accounts
  where staff_id = p_target_staff_id
    and shop_id = p_shop_id
    and status <> 'archived'
  for update;

  if not found then
    v_audit_event_id := app_private.write_staff_shop_admin_audit(
      p_actor_staff_id,
      p_shop_id,
      case
        when v_action = 'reset_credential' then 'shop.staff.credential.reset.failure'
        else 'shop.staff.lockout.clear.failure'
      end,
      'warning',
      'blocked',
      'staff',
      p_target_staff_id::text,
      'not_found',
      v_reason_metadata
    );
    return app_private.shop_admin_action_result(
      false,
      'not_found',
      p_shop_id,
      p_target_staff_id::text,
      v_audit_event_id,
      v_payload
    );
  end if;

  perform 1
  from public.staff_role_permissions as protected_permission
  join app_private.task140_owner_only_staff_web_permissions() as owner_only
    on owner_only.permission_key = protected_permission.permission_key
  where protected_permission.shop_id = p_shop_id
    and protected_permission.role_key = v_target_role_key
    and protected_permission.enabled
  for share of protected_permission;

  v_target_role_has_owner_only := found;

  if v_target_role_key = 'pos_admin' or v_target_role_has_owner_only then
    v_audit_event_id := app_private.write_staff_shop_admin_audit(
      p_actor_staff_id,
      p_shop_id,
      case
        when v_action = 'reset_credential' then 'shop.staff.credential.reset.failure'
        else 'shop.staff.lockout.clear.failure'
      end,
      'warning',
      'blocked',
      'staff',
      p_target_staff_id::text,
      'unauthorized',
      v_reason_metadata || jsonb_build_object('role_key', v_target_role_key)
    );
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      p_target_staff_id::text,
      v_audit_event_id,
      v_payload
    );
  end if;

  if v_action = 'reset_credential' then
    if v_credential_kind not in ('pin', 'password')
      or v_credential_hash !~ '^\$scrypt-v1\$' then
      v_audit_event_id := app_private.write_staff_shop_admin_audit(
        p_actor_staff_id,
        p_shop_id,
        'shop.staff.credential.reset.failure',
        'warning',
        'blocked',
        'staff',
        p_target_staff_id::text,
        'validation_failed',
        v_reason_metadata
      );
      return app_private.shop_admin_action_result(
        false,
        'validation_failed',
        p_shop_id,
        p_target_staff_id::text,
        v_audit_event_id,
        v_payload
      );
    end if;

    update public.staff_accounts
    set credential_kind = v_credential_kind,
        credential_hash = v_credential_hash,
        credential_updated_at = v_now,
        credential_expires_at = p_credential_expires_at,
        credential_version = greatest(coalesce(credential_version, 0) + 1, 1),
        credential_status = 'active',
        must_change_credential = false,
        failed_attempts = 0,
        locked_until = null,
        session_invalidated_at = v_now,
        status = case
          when status = 'suspended' then 'suspended'
          else 'active'
        end,
        updated_at = v_now
    where staff_id = p_target_staff_id
      and shop_id = p_shop_id
      and status <> 'archived'
    returning staff_id, staff_code
    into v_mutated_staff_id, v_target_staff_code;

    if not found then
      v_audit_event_id := app_private.write_staff_shop_admin_audit(
        p_actor_staff_id,
        p_shop_id,
        'shop.staff.credential.reset.failure',
        'warning',
        'blocked',
        'staff',
        p_target_staff_id::text,
        'not_found',
        v_reason_metadata
      );
      return app_private.shop_admin_action_result(
        false,
        'not_found',
        p_shop_id,
        p_target_staff_id::text,
        v_audit_event_id,
        v_payload
      );
    end if;

    update public.staff_web_sessions
    set status = 'revoked',
        revoked_at = v_now,
        revoked_reason = 'credential_reset',
        updated_at = v_now
    where shop_id = p_shop_id
      and staff_id = p_target_staff_id
      and status = 'active';

    perform app_private.clear_staff_web_login_attempt_lockout(
      p_shop_id,
      v_target_staff_code
    );

    v_audit_event_id := app_private.write_staff_shop_admin_audit(
      p_actor_staff_id,
      p_shop_id,
      'shop.staff.credential.reset.success',
      'warning',
      'success',
      'staff',
      v_mutated_staff_id::text,
      'success',
      v_reason_metadata
    );

    return app_private.shop_admin_action_result(
      true,
      'success',
      p_shop_id,
      v_mutated_staff_id::text,
      v_audit_event_id,
      v_payload
    );
  end if;

  update public.staff_accounts
  set failed_attempts = 0,
      locked_until = null,
      credential_status = case
        when credential_hash is null then 'pending_setup'
        when must_change_credential then 'rotation_required'
        else 'active'
      end,
      updated_at = v_now
  where staff_id = p_target_staff_id
    and shop_id = p_shop_id
    and status <> 'archived'
  returning staff_id, staff_code
  into v_mutated_staff_id, v_target_staff_code;

  if not found then
    v_audit_event_id := app_private.write_staff_shop_admin_audit(
      p_actor_staff_id,
      p_shop_id,
      'shop.staff.lockout.clear.failure',
      'warning',
      'blocked',
      'staff',
      p_target_staff_id::text,
      'not_found',
      v_reason_metadata
    );
    return app_private.shop_admin_action_result(
      false,
      'not_found',
      p_shop_id,
      p_target_staff_id::text,
      v_audit_event_id,
      v_payload
    );
  end if;

  perform app_private.clear_staff_web_login_attempt_lockout(
    p_shop_id,
    v_target_staff_code
  );

  v_audit_event_id := app_private.write_staff_shop_admin_audit(
    p_actor_staff_id,
    p_shop_id,
    'shop.staff.lockout.clear.success',
    'info',
    'success',
    'staff',
    v_mutated_staff_id::text,
    'success',
    v_reason_metadata
  );

  return app_private.shop_admin_action_result(
    true,
    'success',
    p_shop_id,
    v_mutated_staff_id::text,
    v_audit_event_id,
    v_payload
  );
end;
$$;
revoke all on function public.shop_staff_mutate_as_staff_web(
  uuid, uuid, uuid, text, uuid, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.shop_staff_mutate_as_staff_web(
  uuid, uuid, uuid, text, uuid, text, text, text, text, text, text, timestamptz
) to service_role;
create or replace function public.staff_record_login_failure(
  p_channel text,
  p_shop_code text,
  p_staff_code text,
  p_shop_id uuid,
  p_staff_id uuid,
  p_expected_credential_version integer,
  p_metadata_redacted jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_channel text := lower(btrim(coalesce(p_channel, '')));
  v_shop_code text := upper(btrim(coalesce(p_shop_code, '')));
  v_staff_code text := upper(btrim(coalesce(p_staff_code, '')));
  v_now timestamptz := clock_timestamp();
  v_staff_failed_attempts integer;
  v_staff_locked_until timestamptz;
  v_staff_locked boolean := false;
  v_staff public.staff_accounts%rowtype;
  v_attempt_key_hash text;
  v_web_failed_attempts integer;
  v_web_locked_until timestamptz;
  v_metadata jsonb := case
    when jsonb_typeof(coalesce(p_metadata_redacted, '{}'::jsonb)) = 'object'
      then coalesce(p_metadata_redacted, '{}'::jsonb)
    else '{}'::jsonb
  end;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('code', 'unauthorized', 'ok', false);
  end if;

  if v_channel not in ('pos', 'shop_code') then
    return jsonb_build_object('code', 'validation_failed', 'ok', false);
  end if;

  if v_channel = 'pos'
    and (
      p_shop_id is null
      or p_staff_id is null
      or p_expected_credential_version is null
    ) then
    return jsonb_build_object('code', 'validation_failed', 'ok', false);
  end if;

  if v_channel = 'shop_code'
    and (
      v_shop_code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'
      or v_staff_code !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
      or (
        (p_staff_id is null or p_shop_id is null or p_expected_credential_version is null)
        and not (
          p_staff_id is null
          and p_shop_id is null
          and p_expected_credential_version is null
        )
      )
    ) then
    return jsonb_build_object('code', 'validation_failed', 'ok', false);
  end if;

  if p_staff_id is not null then
    select staff.*
    into v_staff
    from public.staff_accounts as staff
    where staff.staff_id = p_staff_id
      and staff.shop_id = p_shop_id
    for update;

    if not found
      or v_staff.credential_version <> p_expected_credential_version then
      return jsonb_build_object('code', 'stale_or_ineligible', 'ok', false);
    end if;

    if v_staff.status = 'active'
      and (
        v_staff.credential_status = 'active'
        or (
          v_staff.credential_status = 'locked'
          and v_staff.locked_until <= v_now
        )
      )
      and v_staff.must_change_credential is not true
      and v_staff.credential_hash is not null
      and (
        v_staff.credential_expires_at is null
        or v_staff.credential_expires_at > v_now
      )
      and (v_staff.locked_until is null or v_staff.locked_until <= v_now) then
      v_staff_failed_attempts := case
        when v_staff.locked_until is not null and v_staff.locked_until <= v_now
          then 1
        else least(coalesce(v_staff.failed_attempts, 0) + 1, 5)
      end;
      v_staff_locked := v_staff_failed_attempts >= 5;
      v_staff_locked_until := case
        when v_staff_locked then v_now + interval '15 minutes'
        else null
      end;

      update public.staff_accounts
      set credential_status = case when v_staff_locked then 'locked' else 'active' end,
          failed_attempts = v_staff_failed_attempts,
          locked_until = v_staff_locked_until,
          updated_at = v_now
      where staff_id = p_staff_id
        and shop_id = p_shop_id
        and credential_version = p_expected_credential_version;
    elsif v_channel = 'pos' then
      return jsonb_build_object('code', 'stale_or_ineligible', 'ok', false);
    end if;
  end if;

  if v_channel = 'shop_code' then
    v_attempt_key_hash := app_private.staff_web_login_attempt_key_hash(
      v_shop_code,
      v_staff_code
    );
    v_metadata := v_metadata || jsonb_build_object(
      'source', 'staff_login_failure_atomic'
    );

    insert into public.staff_web_login_attempts as web_attempt (
      attempt_key_hash,
      failed_attempts,
      last_failed_at,
      locked_until,
      metadata_redacted,
      updated_at
    )
    values (
      v_attempt_key_hash,
      1,
      v_now,
      null,
      v_metadata,
      v_now
    )
    on conflict (attempt_key_hash) do update
    set failed_attempts = case
          when web_attempt.locked_until > v_now then web_attempt.failed_attempts
          when web_attempt.locked_until is not null
            then 1
          else least(web_attempt.failed_attempts + 1, 5)
        end,
        last_failed_at = case
          when web_attempt.locked_until > v_now then web_attempt.last_failed_at
          else v_now
        end,
        locked_until = case
          when web_attempt.locked_until > v_now then web_attempt.locked_until
          when web_attempt.locked_until is not null then null
          when web_attempt.failed_attempts + 1 >= 5
            then v_now + interval '15 minutes'
          else null
        end,
        metadata_redacted = case
          when web_attempt.locked_until > v_now
            then web_attempt.metadata_redacted
          else excluded.metadata_redacted
        end,
        updated_at = v_now
    returning failed_attempts, locked_until
    into v_web_failed_attempts, v_web_locked_until;
  end if;

  return jsonb_build_object(
    'code', 'recorded',
    'ok', true,
    'staff_failed_attempts', v_staff_failed_attempts,
    'staff_locked', v_staff_locked,
    'web_failed_attempts', v_web_failed_attempts,
    'web_locked', coalesce(v_web_locked_until > v_now, false)
  );
end;
$$;
revoke all on function public.staff_record_login_failure(
  text, text, text, uuid, uuid, integer, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.staff_record_login_failure(
  text, text, text, uuid, uuid, integer, jsonb
) to service_role;
-- TASK-137 deliberately required an active credential at the final financial
-- sink. Preserve that implementation byte-for-byte behind a non-executable
-- internal entry point, then normalize an elapsed timed lock while holding the
-- same authorization rows that the financial implementation locks. The
-- normalization and delegated apply therefore share one database transaction.
do $task140_sales_impl$
begin
  if to_regprocedure(
    'public.task140_pos_sales_sync_apply_v1_task137(uuid,text,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb)'
  ) is null then
    if to_regprocedure(
      'public.pos_sales_sync_apply_v1(uuid,text,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb)'
    ) is null then
      raise exception using
        errcode = '42883',
        message = 'TASK-137 POS sales apply implementation is missing';
    end if;

    execute $statement$
      alter function public.pos_sales_sync_apply_v1(
        uuid, text, uuid, uuid, uuid, text, text, text, text, jsonb, jsonb
      ) rename to task140_pos_sales_sync_apply_v1_task137
    $statement$;
  end if;
end;
$task140_sales_impl$;
revoke all on function public.task140_pos_sales_sync_apply_v1_task137(
  uuid, text, uuid, uuid, uuid, text, text, text, text, jsonb, jsonb
) from public, anon, authenticated, service_role;
create or replace function public.pos_sales_sync_apply_v1(
  p_shop_id uuid,
  p_shop_code text,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_client_batch_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_schema_version text,
  p_sales jsonb,
  p_metadata_redacted jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_credential_status text;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'denied');
  end if;

  select staff.credential_status
  into v_credential_status
  from public.pos_sessions as session_row
  join public.staff_accounts as staff
    on staff.staff_id = session_row.staff_id
   and staff.shop_id = session_row.shop_id
  join public.shop_devices as device
    on device.shop_device_id = session_row.shop_device_id
   and device.shop_id = session_row.shop_id
  join public.pos_device_credentials as credential
    on credential.pos_device_credential_id = session_row.pos_device_credential_id
   and credential.shop_device_id = session_row.shop_device_id
   and credential.shop_id = session_row.shop_id
   and credential.staff_id = session_row.staff_id
  join public.shops as shop
    on shop.shop_id = session_row.shop_id
  where session_row.pos_session_id = p_pos_session_id
    and session_row.shop_id = p_shop_id
    and session_row.shop_device_id = p_shop_device_id
    and session_row.staff_id = p_staff_id
    and session_row.status = 'active'
    and session_row.revoked_at is null
    and session_row.expires_at > v_now
    and device.status = 'active'
    and device.revoked_at is null
    and credential.status = 'active'
    and credential.revoked_at is null
    and credential.expires_at > v_now
    and credential.staff_credential_version = session_row.staff_credential_version
    and staff.status = 'active'
    and (
      (
        staff.credential_status = 'active'
        and (staff.locked_until is null or staff.locked_until <= v_now)
      )
      or (
        staff.credential_status = 'locked'
        and staff.locked_until is not null
        and staff.locked_until <= v_now
      )
    )
    and staff.credential_version = session_row.staff_credential_version
    and staff.must_change_credential = false
    and (
      staff.session_invalidated_at is null
      or staff.session_invalidated_at <= session_row.issued_at
    )
    and (staff.credential_expires_at is null or staff.credential_expires_at > v_now)
    and shop.shop_code = p_shop_code
    and shop.shop_status = 'active'
  for update of session_row, staff, device, credential, shop;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'denied');
  end if;

  if v_credential_status = 'locked' then
    begin
      update public.staff_accounts
      set credential_status = 'active',
          failed_attempts = 0,
          locked_until = null,
          updated_at = v_now
      where staff_id = p_staff_id
        and shop_id = p_shop_id
        and credential_status = 'locked'
        and locked_until is not null
        and locked_until <= v_now;

      if not found then
        raise exception using
          errcode = 'P1402',
          message = 'elapsed staff credential lock changed while held';
      end if;

      v_result := public.task140_pos_sales_sync_apply_v1_task137(
        p_shop_id,
        p_shop_code,
        p_shop_device_id,
        p_staff_id,
        p_pos_session_id,
        p_client_batch_id,
        p_idempotency_key,
        p_payload_hash,
        p_schema_version,
        p_sales,
        p_metadata_redacted
      );

      if not coalesce(v_result @> '{"ok": true}'::jsonb, false) then
        raise exception using
          errcode = 'P1401',
          message = 'POS sales apply rejected after elapsed-lock normalization';
      end if;
    exception
      when sqlstate 'P1401' then
        return v_result;
      when sqlstate 'P1402' then
        return jsonb_build_object('ok', false, 'code', 'denied');
    end;

    return v_result;
  end if;

  return public.task140_pos_sales_sync_apply_v1_task137(
    p_shop_id,
    p_shop_code,
    p_shop_device_id,
    p_staff_id,
    p_pos_session_id,
    p_client_batch_id,
    p_idempotency_key,
    p_payload_hash,
    p_schema_version,
    p_sales,
    p_metadata_redacted
  );
end;
$$;
revoke all on function public.pos_sales_sync_apply_v1(
  uuid, text, uuid, uuid, uuid, text, text, text, text, jsonb, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.pos_sales_sync_apply_v1(
  uuid, text, uuid, uuid, uuid, text, text, text, text, jsonb, jsonb
) to service_role;
notify pgrst, 'reload schema';
