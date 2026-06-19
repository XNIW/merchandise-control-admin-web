-- TASK-068E: audited platform mapping from a personal mobile owner source to a shop.
-- Boundary: no direct browser/client mutation grants; Platform Admins use this RPC.
-- Data: inventory rows remain owner-scoped. This only creates/verifies the bridge row.

create or replace function public.platform_map_shop_inventory_source(
  p_shop_id uuid,
  p_owner_user_id uuid,
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
  active_conflict public.shop_inventory_sources%rowtype;
  candidate_source public.shop_inventory_sources%rowtype;
  mapped_source_id uuid;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  if p_shop_id is null or p_owner_user_id is null or length(redacted_reason) = 0 then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id,
      'global',
      null,
      'platform.shop.inventory_source.map.failure',
      'warning',
      'blocked',
      'shop_inventory_source',
      coalesce(p_shop_id::text, p_owner_user_id::text),
      redacted_reason,
      'validation_failed'
    );

    return app_private.platform_action_result(false, 'validation_failed', p_shop_id, audit_event_id);
  end if;

  select * into target_shop
  from public.shops
  where shop_id = p_shop_id
  for update;

  if not found then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id,
      'global',
      null,
      'platform.shop.inventory_source.map.failure',
      'warning',
      'blocked',
      'shop_inventory_source',
      p_shop_id::text,
      redacted_reason,
      'shop_not_found'
    );

    return app_private.platform_action_result(false, 'shop_not_found', p_shop_id, audit_event_id);
  end if;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id,
    'shop',
    p_shop_id,
    'platform.shop.inventory_source.map.attempt',
    'info',
    'success',
    'profile',
    p_owner_user_id::text,
    redacted_reason,
    'attempt'
  );

  if target_shop.shop_status <> 'active' then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id,
      'shop',
      p_shop_id,
      'platform.shop.inventory_source.map.failure',
      'warning',
      'blocked',
      'shop_inventory_source',
      p_shop_id::text,
      redacted_reason,
      'invalid_state'
    );

    return app_private.platform_action_result(false, 'invalid_state', p_shop_id, audit_event_id);
  end if;

  if not exists (
    select 1
    from public.profiles
    where profile_id = p_owner_user_id
      and profile_status = 'active'
  ) then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id,
      'shop',
      p_shop_id,
      'platform.shop.inventory_source.map.failure',
      'warning',
      'blocked',
      'profile',
      p_owner_user_id::text,
      redacted_reason,
      'owner_not_active'
    );

    return app_private.platform_action_result(false, 'owner_not_active', p_shop_id, audit_event_id);
  end if;

  if not exists (
    select 1
    from public.shop_members
    where shop_id = p_shop_id
      and profile_id = p_owner_user_id
      and role_key = 'shop_owner'
      and membership_status = 'active'
  ) then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id,
      'shop',
      p_shop_id,
      'platform.shop.inventory_source.map.failure',
      'warning',
      'blocked',
      'profile',
      p_owner_user_id::text,
      redacted_reason,
      'member_not_found'
    );

    return app_private.platform_action_result(false, 'member_not_found', p_shop_id, audit_event_id);
  end if;

  select * into active_conflict
  from public.shop_inventory_sources
  where mapping_state = 'mapped'
    and disabled_at is null
    and (
      (shop_id = p_shop_id and owner_user_id <> p_owner_user_id)
      or (owner_user_id = p_owner_user_id and shop_id <> p_shop_id)
    )
  limit 1;

  if found then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id,
      'shop',
      p_shop_id,
      'platform.shop.inventory_source.map.failure',
      'warning',
      'blocked',
      'shop_inventory_source',
      active_conflict.shop_inventory_source_id::text,
      redacted_reason,
      'conflict'
    );

    return app_private.platform_action_result(false, 'conflict', p_shop_id, audit_event_id);
  end if;

  select * into candidate_source
  from public.shop_inventory_sources
  where disabled_at is null
    and (
      (shop_id = p_shop_id and (owner_user_id is null or owner_user_id = p_owner_user_id))
      or (shop_id is null and owner_user_id = p_owner_user_id)
    )
  order by
    case
      when shop_id = p_shop_id and owner_user_id = p_owner_user_id then 0
      when shop_id = p_shop_id and owner_user_id is null then 1
      else 2
    end,
    created_at desc
  limit 1;

  if found then
    update public.shop_inventory_sources
    set shop_id = p_shop_id,
        owner_user_id = p_owner_user_id,
        source_kind = 'mobile_owner',
        mapping_state = 'mapped',
        verified_at = now(),
        verified_by_profile_id = actor_id
    where shop_inventory_source_id = candidate_source.shop_inventory_source_id
    returning shop_inventory_source_id into mapped_source_id;
  else
    insert into public.shop_inventory_sources (
      shop_id,
      source_kind,
      owner_user_id,
      mapping_state,
      created_by_profile_id,
      verified_at,
      verified_by_profile_id
    )
    values (
      p_shop_id,
      'mobile_owner',
      p_owner_user_id,
      'mapped',
      actor_id,
      now(),
      actor_id
    )
    returning shop_inventory_source_id into mapped_source_id;
  end if;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id,
    'shop',
    p_shop_id,
    'platform.shop.inventory_source.map.success',
    'info',
    'success',
    'shop_inventory_source',
    mapped_source_id::text,
    redacted_reason,
    'success'
  );

  return app_private.platform_action_result(true, 'success', p_shop_id, audit_event_id)
    || jsonb_build_object(
      'shop_inventory_source_id', mapped_source_id,
      'mapping_state', 'mapped'
    );
exception
  when unique_violation then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id,
      'shop',
      p_shop_id,
      'platform.shop.inventory_source.map.failure',
      'warning',
      'blocked',
      'shop_inventory_source',
      null,
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
        'platform.shop.inventory_source.map.failure',
        'critical',
        'failure',
        'shop_inventory_source',
        null,
        redacted_reason,
        'db_failure'
      );
    end if;

    return app_private.platform_action_result(false, 'db_failure', p_shop_id, audit_event_id);
end;
$$;

revoke all on function public.platform_map_shop_inventory_source(uuid, uuid, text) from public;
revoke all on function public.platform_map_shop_inventory_source(uuid, uuid, text) from anon;
revoke all on function public.platform_map_shop_inventory_source(uuid, uuid, text) from authenticated;
grant execute on function public.platform_map_shop_inventory_source(uuid, uuid, text) to authenticated;
