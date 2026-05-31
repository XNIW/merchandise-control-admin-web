begin;

create or replace function public.shop_member_invite_profile(
  p_shop_id uuid,
  p_profile_id uuid,
  p_role_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  v_role_key text := btrim(coalesce(p_role_key, ''));
  v_existing public.shop_members%rowtype;
  v_member_id uuid;
  audit_event_id uuid;
begin
  if actor_id is null
    or not app_private.is_active_shop_owner_member(p_shop_id) then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id);
  end if;

  if v_role_key not in ('shop_owner', 'shop_manager', 'viewer')
    or p_profile_id is null then
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id);
  end if;

  perform 1
  from public.profiles
  where profile_id = p_profile_id
    and profile_status = 'active';

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id);
  end if;

  select *
  into v_existing
  from public.shop_members
  where shop_id = p_shop_id
    and profile_id = p_profile_id
  for update;

  if found and v_existing.membership_status = 'active' then
    return app_private.shop_admin_action_result(
      false,
      'conflict',
      p_shop_id,
      v_existing.shop_member_id::text
    );
  end if;

  if found then
    update public.shop_members
    set role_key = v_role_key,
        membership_status = 'invited',
        invited_by_profile_id = actor_id,
        suspended_at = null,
        suspended_by_profile_id = null,
        updated_at = now()
    where shop_member_id = v_existing.shop_member_id
    returning shop_member_id into v_member_id;
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
      v_role_key,
      'invited',
      actor_id
    )
    returning shop_member_id into v_member_id;
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id,
    'shop.member.invite.success',
    'info',
    'success',
    'shop_member',
    v_member_id::text,
    'success',
    jsonb_build_object('role_key', v_role_key)
  );

  return app_private.shop_admin_action_result(
    true,
    'success',
    p_shop_id,
    v_member_id::text,
    audit_event_id
  );
end;
$$;

revoke all on function public.shop_member_invite_profile(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.shop_member_invite_profile(uuid, uuid, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
