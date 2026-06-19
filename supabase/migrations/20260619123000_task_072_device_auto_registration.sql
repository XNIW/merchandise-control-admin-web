-- TASK-072 follow-up: device auto-registration from mobile/POS login and sync.
-- Additive only: enriches shop_devices observability and adds a mobile-owner
-- RPC that resolves shop scope server-side through shop_inventory_sources.

begin;

alter table public.shop_devices
  add column if not exists last_seen_profile_id uuid references public.profiles(profile_id),
  add column if not exists last_seen_staff_id uuid references public.staff_accounts(staff_id),
  add column if not exists last_seen_principal_kind text not null default 'unknown';

alter table public.shop_devices
  drop constraint if exists shop_devices_last_seen_principal_kind_check;

alter table public.shop_devices
  add constraint shop_devices_last_seen_principal_kind_check check (
    last_seen_principal_kind in ('personal_account', 'pos_staff', 'system', 'unknown')
  );

create index if not exists shop_devices_last_seen_profile_idx
  on public.shop_devices(shop_id, last_seen_profile_id, last_seen_at desc)
  where last_seen_profile_id is not null;

create index if not exists shop_devices_last_seen_staff_idx
  on public.shop_devices(shop_id, last_seen_staff_id, last_seen_at desc)
  where last_seen_staff_id is not null;

create or replace function app_private.jsonb_has_sensitive_device_metadata_key(
  p_metadata jsonb
)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  entry record;
  item jsonb;
  value_type text := jsonb_typeof(coalesce(p_metadata, 'null'::jsonb));
begin
  if value_type = 'object' then
    for entry in select key, value from jsonb_each(p_metadata) loop
      if entry.key ~* '(token|secret|password|pin|hash|credential)' then
        return true;
      end if;

      if app_private.jsonb_has_sensitive_device_metadata_key(entry.value) then
        return true;
      end if;
    end loop;
  elsif value_type = 'array' then
    for item in select value from jsonb_array_elements(p_metadata) loop
      if app_private.jsonb_has_sensitive_device_metadata_key(item) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end;
$$;

revoke all on function app_private.jsonb_has_sensitive_device_metadata_key(jsonb)
  from public, anon, authenticated;

create or replace function public.shop_device_register(
  p_shop_id uuid,
  p_device_identifier text,
  p_device_type text default 'unknown',
  p_display_name text default null,
  p_app_version text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  v_identifier text := btrim(coalesce(p_device_identifier, ''));
  v_device_type text := btrim(coalesce(p_device_type, 'unknown'));
  v_display_name text := app_private.normalize_admin_label(coalesce(p_display_name, p_device_identifier));
  v_app_version text := nullif(left(app_private.normalize_admin_label(p_app_version), 80), '');
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_device_id uuid;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_active_shop_staff_admin_member(p_shop_id) then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id);
  end if;

  if length(v_identifier) = 0
    or length(v_identifier) > 160
    or length(v_display_name) = 0
    or v_device_type not in ('mobile', 'pos', 'web', 'unknown')
    or jsonb_typeof(v_metadata) <> 'object'
    or app_private.jsonb_has_sensitive_device_metadata_key(v_metadata) then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.device.register.failure', 'warning', 'blocked',
      'device', null, 'validation_failed', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id, null, audit_event_id);
  end if;

  insert into public.shop_devices (
    shop_id,
    device_identifier,
    device_type,
    display_name,
    app_version,
    status,
    last_seen_at,
    last_seen_profile_id,
    last_seen_staff_id,
    last_seen_principal_kind,
    metadata_redacted,
    created_by_profile_id,
    updated_by_profile_id,
    updated_at
  )
  values (
    p_shop_id,
    v_identifier,
    v_device_type,
    v_display_name,
    v_app_version,
    'active',
    now(),
    actor_id,
    null,
    'personal_account',
    v_metadata,
    actor_id,
    actor_id,
    now()
  )
  on conflict (shop_id, device_identifier)
  do update set
    device_type = excluded.device_type,
    display_name = excluded.display_name,
    app_version = excluded.app_version,
    last_seen_at = now(),
    last_seen_profile_id = actor_id,
    last_seen_staff_id = null,
    last_seen_principal_kind = 'personal_account',
    metadata_redacted = excluded.metadata_redacted,
    status = case
      when public.shop_devices.status in ('revoked', 'suspicious') then public.shop_devices.status
      else 'active'
    end,
    updated_by_profile_id = actor_id,
    updated_at = now()
  returning shop_device_id into v_device_id;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.device.register.success', 'info', 'success',
    'device', v_device_id::text, 'success',
    jsonb_build_object('device_type', v_device_type)
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, v_device_id::text, audit_event_id);
end;
$$;

create or replace function public.shop_device_register_current_owner(
  p_device_identifier text,
  p_device_type text default 'mobile',
  p_display_name text default null,
  p_app_version text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_shop_id uuid;
begin
  if actor_id is null then
    return app_private.shop_admin_action_result(false, 'unauthorized');
  end if;

  select sis.shop_id into target_shop_id
  from public.shop_inventory_sources sis
  join public.shops s on s.shop_id = sis.shop_id
  where sis.owner_user_id = actor_id
    and sis.mapping_state = 'mapped'
    and sis.disabled_at is null
    and sis.shop_id is not null
    and s.shop_status = 'active'
  order by sis.verified_at desc nulls last, sis.created_at desc
  limit 1;

  if target_shop_id is null then
    return app_private.shop_admin_action_result(false, 'shop_mapping_not_found');
  end if;

  return public.shop_device_register(
    target_shop_id,
    p_device_identifier,
    p_device_type,
    p_display_name,
    p_app_version,
    p_metadata
  );
end;
$$;

revoke all on function public.shop_device_register_current_owner(text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.shop_device_register_current_owner(text, text, text, text, jsonb)
  to authenticated;

notify pgrst, 'reload schema';

commit;
