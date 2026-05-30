-- TASK-006: Platform Admin controlled actions.
-- Boundary: all mutations go through audited RPCs; no direct table mutation grants.
-- Audit: append-only audit_logs is preserved; no hard delete is introduced.
-- Runtime: service-role is not required for user controlled actions.

alter table public.shops
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by_profile_id uuid references public.profiles(profile_id),
  add column if not exists status_reason_redacted text,
  add column if not exists status_changed_at timestamptz not null default now(),
  add column if not exists status_changed_by_profile_id uuid references public.profiles(profile_id);

alter table public.shops
  drop constraint if exists shops_suspended_shape_check,
  add constraint shops_suspended_shape_check check (
    (
      shop_status = 'suspended'
      and suspended_at is not null
      and suspended_by_profile_id is not null
    )
    or (
      shop_status <> 'suspended'
      and suspended_at is null
      and suspended_by_profile_id is null
    )
  );

alter table public.shops
  drop constraint if exists shops_archived_actor_required,
  add constraint shops_archived_actor_required check (
    (shop_status <> 'archived')
    or (archived_at is not null and archived_by_profile_id is not null)
  );

alter table public.audit_logs
  drop constraint if exists audit_logs_result_check,
  add constraint audit_logs_result_check check (
    result in ('success', 'blocked', 'simulated', 'failure')
  );

create or replace function app_private.platform_action_result(
  p_ok boolean,
  p_code text,
  p_shop_id uuid default null,
  p_audit_event_id uuid default null
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'ok', p_ok,
    'code', p_code,
    'shop_id', p_shop_id,
    'audit_event_id', p_audit_event_id
  );
$$;

create or replace function app_private.write_platform_shop_audit(
  p_actor_profile_id uuid,
  p_scope text,
  p_shop_id uuid,
  p_event_key text,
  p_severity text,
  p_result text,
  p_target_type text,
  p_target_id text,
  p_reason text,
  p_code text
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
        'source', 'TASK-006'
      )
    )
  )
  returning audit_log_id into inserted_id;

  return inserted_id;
end;
$$;

create or replace function public.platform_create_shop(
  p_shop_name text,
  p_shop_code text,
  p_owner_profile_id uuid,
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
  redacted_reason text := btrim(coalesce(p_reason, ''));
  created_shop_id uuid;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'global', null, 'platform.shop.create.attempt',
    'info', 'success', 'shop', null, redacted_reason, 'attempt'
  );

  if length(normalized_shop_name) = 0
    or normalized_shop_code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'
    or length(redacted_reason) = 0 then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.shop.create.failure',
      'warning', 'blocked', 'shop', null, redacted_reason, 'validation_failed'
    );
    return app_private.platform_action_result(false, 'validation_failed', null, audit_event_id);
  end if;

  if exists (select 1 from public.shops where shop_code = normalized_shop_code) then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.shop.create.failure',
      'warning', 'blocked', 'shop', null, redacted_reason, 'duplicate_shop_code'
    );
    return app_private.platform_action_result(false, 'duplicate_shop_code', null, audit_event_id);
  end if;

  if not exists (
    select 1
    from public.profiles
    where profile_id = p_owner_profile_id
      and profile_status = 'active'
  ) then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.shop.owner.assign.failure',
      'warning', 'blocked', 'profile', p_owner_profile_id::text, redacted_reason, 'owner_not_active'
    );
    return app_private.platform_action_result(false, 'owner_not_active', null, audit_event_id);
  end if;

  insert into public.shops (
    shop_code,
    shop_name,
    shop_status,
    created_by_profile_id,
    status_reason_redacted,
    status_changed_at,
    status_changed_by_profile_id
  )
  values (
    normalized_shop_code,
    normalized_shop_name,
    'active',
    actor_id,
    left(redacted_reason, 240),
    now(),
    actor_id
  )
  returning shop_id into created_shop_id;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'shop', created_shop_id, 'platform.shop.owner.assign.attempt',
    'info', 'success', 'profile', p_owner_profile_id::text, redacted_reason, 'attempt'
  );

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

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'shop', created_shop_id, 'platform.shop.owner.assign.success',
    'info', 'success', 'profile', p_owner_profile_id::text, redacted_reason, 'success'
  );

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'shop', created_shop_id, 'platform.shop.create.success',
    'info', 'success', 'shop', created_shop_id::text, redacted_reason, 'success'
  );

  return app_private.platform_action_result(true, 'success', created_shop_id, audit_event_id);
exception
  when unique_violation then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.shop.create.failure',
      'warning', 'blocked', 'shop', null, redacted_reason, 'conflict'
    );
    return app_private.platform_action_result(false, 'conflict', null, audit_event_id);
  when others then
    if actor_id is not null then
      audit_event_id := app_private.write_platform_shop_audit(
        actor_id, 'global', null, 'platform.shop.create.failure',
        'critical', 'failure', 'shop', null, redacted_reason, 'db_failure'
      );
    end if;
    return app_private.platform_action_result(false, 'db_failure', null, audit_event_id);
end;
$$;

create or replace function public.platform_suspend_shop(
  p_shop_id uuid,
  p_reason text,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  redacted_reason text := btrim(coalesce(p_reason, ''));
  target_shop public.shops%rowtype;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  select * into target_shop from public.shops where shop_id = p_shop_id for update;

  if not found then
    return app_private.platform_action_result(false, 'shop_not_found');
  end if;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'shop', p_shop_id, 'platform.shop.suspend.attempt',
    'warning', 'success', 'shop', p_shop_id::text, redacted_reason, 'attempt'
  );

  if length(redacted_reason) = 0 or coalesce(p_confirmation, '') <> target_shop.shop_code then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'shop', p_shop_id, 'platform.shop.suspend.failure',
      'warning', 'blocked', 'shop', p_shop_id::text, redacted_reason, 'validation_failed'
    );
    return app_private.platform_action_result(false, 'validation_failed', p_shop_id, audit_event_id);
  end if;

  if target_shop.shop_status = 'archived' or target_shop.shop_status = 'suspended' then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'shop', p_shop_id, 'platform.shop.suspend.failure',
      'warning', 'blocked', 'shop', p_shop_id::text, redacted_reason, 'invalid_state'
    );
    return app_private.platform_action_result(false, 'invalid_state', p_shop_id, audit_event_id);
  end if;

  update public.shops
  set shop_status = 'suspended',
      suspended_at = now(),
      suspended_by_profile_id = actor_id,
      status_reason_redacted = left(redacted_reason, 240),
      status_changed_at = now(),
      status_changed_by_profile_id = actor_id,
      updated_at = now()
  where shop_id = p_shop_id;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'shop', p_shop_id, 'platform.shop.suspend.success',
    'warning', 'success', 'shop', p_shop_id::text, redacted_reason, 'success'
  );

  return app_private.platform_action_result(true, 'success', p_shop_id, audit_event_id);
exception
  when others then
    if actor_id is not null then
      audit_event_id := app_private.write_platform_shop_audit(
        actor_id, 'shop', p_shop_id, 'platform.shop.suspend.failure',
        'critical', 'failure', 'shop', p_shop_id::text, redacted_reason, 'db_failure'
      );
    end if;
    return app_private.platform_action_result(false, 'db_failure', p_shop_id, audit_event_id);
end;
$$;

create or replace function public.platform_reactivate_shop(
  p_shop_id uuid,
  p_reason text,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  redacted_reason text := btrim(coalesce(p_reason, ''));
  target_shop public.shops%rowtype;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  select * into target_shop from public.shops where shop_id = p_shop_id for update;

  if not found then
    return app_private.platform_action_result(false, 'shop_not_found');
  end if;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'shop', p_shop_id, 'platform.shop.reactivate.attempt',
    'info', 'success', 'shop', p_shop_id::text, redacted_reason, 'attempt'
  );

  if length(redacted_reason) = 0 or coalesce(p_confirmation, '') <> target_shop.shop_code then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'shop', p_shop_id, 'platform.shop.reactivate.failure',
      'warning', 'blocked', 'shop', p_shop_id::text, redacted_reason, 'validation_failed'
    );
    return app_private.platform_action_result(false, 'validation_failed', p_shop_id, audit_event_id);
  end if;

  if target_shop.shop_status <> 'suspended' then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'shop', p_shop_id, 'platform.shop.reactivate.failure',
      'warning', 'blocked', 'shop', p_shop_id::text, redacted_reason, 'invalid_state'
    );
    return app_private.platform_action_result(false, 'invalid_state', p_shop_id, audit_event_id);
  end if;

  update public.shops
  set shop_status = 'active',
      suspended_at = null,
      suspended_by_profile_id = null,
      status_reason_redacted = left(redacted_reason, 240),
      status_changed_at = now(),
      status_changed_by_profile_id = actor_id,
      updated_at = now()
  where shop_id = p_shop_id;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'shop', p_shop_id, 'platform.shop.reactivate.success',
    'info', 'success', 'shop', p_shop_id::text, redacted_reason, 'success'
  );

  return app_private.platform_action_result(true, 'success', p_shop_id, audit_event_id);
exception
  when others then
    if actor_id is not null then
      audit_event_id := app_private.write_platform_shop_audit(
        actor_id, 'shop', p_shop_id, 'platform.shop.reactivate.failure',
        'critical', 'failure', 'shop', p_shop_id::text, redacted_reason, 'db_failure'
      );
    end if;
    return app_private.platform_action_result(false, 'db_failure', p_shop_id, audit_event_id);
end;
$$;

create or replace function public.platform_soft_delete_shop(
  p_shop_id uuid,
  p_shop_code_confirmation text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  redacted_reason text := btrim(coalesce(p_reason, ''));
  target_shop public.shops%rowtype;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  select * into target_shop from public.shops where shop_id = p_shop_id for update;

  if not found then
    return app_private.platform_action_result(false, 'shop_not_found');
  end if;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'shop', p_shop_id, 'platform.shop.soft_delete.attempt',
    'critical', 'success', 'shop', p_shop_id::text, redacted_reason, 'attempt'
  );

  if length(redacted_reason) = 0 or coalesce(p_shop_code_confirmation, '') <> target_shop.shop_code then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'shop', p_shop_id, 'platform.shop.soft_delete.failure',
      'warning', 'blocked', 'shop', p_shop_id::text, redacted_reason, 'validation_failed'
    );
    return app_private.platform_action_result(false, 'validation_failed', p_shop_id, audit_event_id);
  end if;

  if target_shop.shop_status = 'archived' then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'shop', p_shop_id, 'platform.shop.soft_delete.failure',
      'warning', 'blocked', 'shop', p_shop_id::text, redacted_reason, 'invalid_state'
    );
    return app_private.platform_action_result(false, 'invalid_state', p_shop_id, audit_event_id);
  end if;

  update public.shops
  set shop_status = 'archived',
      suspended_at = null,
      suspended_by_profile_id = null,
      archived_at = now(),
      archived_by_profile_id = actor_id,
      status_reason_redacted = left(redacted_reason, 240),
      status_changed_at = now(),
      status_changed_by_profile_id = actor_id,
      updated_at = now()
  where shop_id = p_shop_id;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'shop', p_shop_id, 'platform.shop.soft_delete.success',
    'critical', 'success', 'shop', p_shop_id::text, redacted_reason, 'success'
  );

  return app_private.platform_action_result(true, 'success', p_shop_id, audit_event_id);
exception
  when others then
    if actor_id is not null then
      audit_event_id := app_private.write_platform_shop_audit(
        actor_id, 'shop', p_shop_id, 'platform.shop.soft_delete.failure',
        'critical', 'failure', 'shop', p_shop_id::text, redacted_reason, 'db_failure'
      );
    end if;
    return app_private.platform_action_result(false, 'db_failure', p_shop_id, audit_event_id);
end;
$$;

revoke all on function app_private.platform_action_result(boolean, text, uuid, uuid) from public;
revoke all on function app_private.platform_action_result(boolean, text, uuid, uuid) from anon;
revoke all on function app_private.platform_action_result(boolean, text, uuid, uuid) from authenticated;
revoke all on function app_private.write_platform_shop_audit(uuid, text, uuid, text, text, text, text, text, text, text) from public;
revoke all on function app_private.write_platform_shop_audit(uuid, text, uuid, text, text, text, text, text, text, text) from anon;
revoke all on function app_private.write_platform_shop_audit(uuid, text, uuid, text, text, text, text, text, text, text) from authenticated;

revoke all on function public.platform_create_shop(text, text, uuid, text) from public;
revoke all on function public.platform_create_shop(text, text, uuid, text) from anon;
revoke all on function public.platform_create_shop(text, text, uuid, text) from authenticated;
grant execute on function public.platform_create_shop(text, text, uuid, text) to authenticated;

revoke all on function public.platform_suspend_shop(uuid, text, text) from public;
revoke all on function public.platform_suspend_shop(uuid, text, text) from anon;
revoke all on function public.platform_suspend_shop(uuid, text, text) from authenticated;
grant execute on function public.platform_suspend_shop(uuid, text, text) to authenticated;

revoke all on function public.platform_reactivate_shop(uuid, text, text) from public;
revoke all on function public.platform_reactivate_shop(uuid, text, text) from anon;
revoke all on function public.platform_reactivate_shop(uuid, text, text) from authenticated;
grant execute on function public.platform_reactivate_shop(uuid, text, text) to authenticated;

revoke all on function public.platform_soft_delete_shop(uuid, text, text) from public;
revoke all on function public.platform_soft_delete_shop(uuid, text, text) from anon;
revoke all on function public.platform_soft_delete_shop(uuid, text, text) from authenticated;
grant execute on function public.platform_soft_delete_shop(uuid, text, text) to authenticated;
