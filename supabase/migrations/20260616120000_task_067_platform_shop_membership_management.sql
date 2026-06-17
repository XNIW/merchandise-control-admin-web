-- TASK-067: Master Console shop membership management.
-- Boundary: platform admins can assign/revoke personal web account membership
-- through audited RPCs. No direct table grants and no hard delete are introduced.

create or replace function public.platform_assign_shop_member(
  p_shop_id uuid,
  p_profile_id uuid,
  p_role_key text,
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
  target_profile public.profiles%rowtype;
  existing_member public.shop_members%rowtype;
  normalized_role text := btrim(coalesce(p_role_key, ''));
  member_id uuid;
  active_owner_count integer;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  select *
  into target_shop
  from public.shops
  where shop_id = p_shop_id
  for update;

  if not found then
    return app_private.platform_action_result(false, 'shop_not_found');
  end if;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id,
    'shop',
    p_shop_id,
    'platform.shop.member.assign.attempt',
    'info',
    'success',
    'profile',
    p_profile_id::text,
    redacted_reason,
    'attempt'
  );

  if normalized_role not in ('shop_owner', 'shop_manager')
    or p_profile_id is null
    or length(redacted_reason) = 0
    or upper(btrim(coalesce(p_shop_code_confirmation, ''))) <> target_shop.shop_code then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id,
      'shop',
      p_shop_id,
      'platform.shop.member.assign.failure',
      'warning',
      'blocked',
      'profile',
      p_profile_id::text,
      redacted_reason,
      'validation_failed'
    );
    return app_private.platform_action_result(false, 'validation_failed', p_shop_id, audit_event_id);
  end if;

  select *
  into target_profile
  from public.profiles
  where profile_id = p_profile_id;

  if not found then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id,
      'shop',
      p_shop_id,
      'platform.shop.member.assign.failure',
      'warning',
      'blocked',
      'profile',
      p_profile_id::text,
      redacted_reason,
      'profile_not_found'
    );
    return app_private.platform_action_result(false, 'profile_not_found', p_shop_id, audit_event_id);
  end if;

  if target_profile.profile_status <> 'active' then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id,
      'shop',
      p_shop_id,
      'platform.shop.member.assign.failure',
      'warning',
      'blocked',
      'profile',
      p_profile_id::text,
      redacted_reason,
      'profile_not_active'
    );
    return app_private.platform_action_result(false, 'profile_not_active', p_shop_id, audit_event_id);
  end if;

  select *
  into existing_member
  from public.shop_members
  where shop_id = p_shop_id
    and profile_id = p_profile_id
  for update;

  if found
    and existing_member.role_key = 'shop_owner'
    and normalized_role <> 'shop_owner'
    and existing_member.membership_status = 'active' then
    select count(*)
    into active_owner_count
    from public.shop_members
    where shop_id = p_shop_id
      and role_key = 'shop_owner'
      and membership_status = 'active';

    if active_owner_count <= 1 then
      audit_event_id := app_private.write_platform_shop_audit(
        actor_id,
        'shop',
        p_shop_id,
        'platform.shop.member.assign.failure',
        'warning',
        'blocked',
        'shop_member',
        existing_member.shop_member_id::text,
        redacted_reason,
        'last_owner_blocked'
      );
      return app_private.platform_action_result(false, 'invalid_state', p_shop_id, audit_event_id);
    end if;
  end if;

  if found then
    update public.shop_members
    set role_key = normalized_role,
        membership_status = 'active',
        invited_by_profile_id = actor_id,
        suspended_at = null,
        suspended_by_profile_id = null,
        updated_at = now()
    where shop_member_id = existing_member.shop_member_id
    returning shop_member_id into member_id;
  else
    insert into public.shop_members (
      profile_id,
      shop_id,
      role_key,
      membership_status,
      invited_by_profile_id
    )
    values (
      p_profile_id,
      p_shop_id,
      normalized_role,
      'active',
      actor_id
    )
    returning shop_member_id into member_id;
  end if;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id,
    'shop',
    p_shop_id,
    'platform.shop.member.assign.success',
    'info',
    'success',
    'shop_member',
    member_id::text,
    redacted_reason,
    normalized_role
  );

  return app_private.platform_action_result(true, 'success', p_shop_id, audit_event_id);
exception
  when unique_violation then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id,
      'shop',
      p_shop_id,
      'platform.shop.member.assign.failure',
      'warning',
      'blocked',
      'profile',
      p_profile_id::text,
      redacted_reason,
      'conflict'
    );
    return app_private.platform_action_result(false, 'conflict', p_shop_id, audit_event_id);
  when others then
    if actor_id is not null then
      audit_event_id := app_private.write_platform_shop_audit(
        actor_id,
        'shop',
        p_shop_id,
        'platform.shop.member.assign.failure',
        'critical',
        'failure',
        'profile',
        p_profile_id::text,
        redacted_reason,
        'db_failure'
      );
    end if;
    return app_private.platform_action_result(false, 'db_failure', p_shop_id, audit_event_id);
end;
$$;

create or replace function public.platform_revoke_shop_member(
  p_shop_id uuid,
  p_shop_member_id uuid,
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
  existing_member public.shop_members%rowtype;
  active_owner_count integer;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  select *
  into target_shop
  from public.shops
  where shop_id = p_shop_id
  for update;

  if not found then
    return app_private.platform_action_result(false, 'shop_not_found');
  end if;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id,
    'shop',
    p_shop_id,
    'platform.shop.member.revoke.attempt',
    'warning',
    'success',
    'shop_member',
    p_shop_member_id::text,
    redacted_reason,
    'attempt'
  );

  if p_shop_member_id is null
    or length(redacted_reason) = 0
    or upper(btrim(coalesce(p_shop_code_confirmation, ''))) <> target_shop.shop_code then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id,
      'shop',
      p_shop_id,
      'platform.shop.member.revoke.failure',
      'warning',
      'blocked',
      'shop_member',
      p_shop_member_id::text,
      redacted_reason,
      'validation_failed'
    );
    return app_private.platform_action_result(false, 'validation_failed', p_shop_id, audit_event_id);
  end if;

  select *
  into existing_member
  from public.shop_members
  where shop_member_id = p_shop_member_id
    and shop_id = p_shop_id
  for update;

  if not found then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id,
      'shop',
      p_shop_id,
      'platform.shop.member.revoke.failure',
      'warning',
      'blocked',
      'shop_member',
      p_shop_member_id::text,
      redacted_reason,
      'member_not_found'
    );
    return app_private.platform_action_result(false, 'member_not_found', p_shop_id, audit_event_id);
  end if;

  if existing_member.profile_id = actor_id then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id,
      'shop',
      p_shop_id,
      'platform.shop.member.revoke.failure',
      'warning',
      'blocked',
      'shop_member',
      p_shop_member_id::text,
      redacted_reason,
      'self_membership_revoke_blocked'
    );
    return app_private.platform_action_result(false, 'invalid_state', p_shop_id, audit_event_id);
  end if;

  if existing_member.role_key = 'shop_owner'
    and existing_member.membership_status = 'active' then
    select count(*)
    into active_owner_count
    from public.shop_members
    where shop_id = p_shop_id
      and role_key = 'shop_owner'
      and membership_status = 'active';

    if active_owner_count <= 1 then
      audit_event_id := app_private.write_platform_shop_audit(
        actor_id,
        'shop',
        p_shop_id,
        'platform.shop.member.revoke.failure',
        'warning',
        'blocked',
        'shop_member',
        p_shop_member_id::text,
        redacted_reason,
        'last_owner_blocked'
      );
      return app_private.platform_action_result(false, 'invalid_state', p_shop_id, audit_event_id);
    end if;
  end if;

  if existing_member.membership_status = 'suspended' then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id,
      'shop',
      p_shop_id,
      'platform.shop.member.revoke.failure',
      'warning',
      'blocked',
      'shop_member',
      p_shop_member_id::text,
      redacted_reason,
      'invalid_state'
    );
    return app_private.platform_action_result(false, 'invalid_state', p_shop_id, audit_event_id);
  end if;

  update public.shop_members
  set membership_status = 'suspended',
      suspended_at = now(),
      suspended_by_profile_id = actor_id,
      updated_at = now()
  where shop_member_id = p_shop_member_id;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id,
    'shop',
    p_shop_id,
    'platform.shop.member.revoke.success',
    'warning',
    'success',
    'shop_member',
    p_shop_member_id::text,
    redacted_reason,
    'success'
  );

  return app_private.platform_action_result(true, 'success', p_shop_id, audit_event_id);
exception
  when others then
    if actor_id is not null then
      audit_event_id := app_private.write_platform_shop_audit(
        actor_id,
        'shop',
        p_shop_id,
        'platform.shop.member.revoke.failure',
        'critical',
        'failure',
        'shop_member',
        p_shop_member_id::text,
        redacted_reason,
        'db_failure'
      );
    end if;
    return app_private.platform_action_result(false, 'db_failure', p_shop_id, audit_event_id);
end;
$$;

revoke all on function public.platform_assign_shop_member(uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.platform_revoke_shop_member(uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.platform_assign_shop_member(uuid, uuid, text, text, text)
  to authenticated;
grant execute on function public.platform_revoke_shop_member(uuid, uuid, text, text)
  to authenticated;
