-- Mobile Shop Context / Shop Switcher contract.
-- Single Admin/Supabase contract for Android and iOS:
-- - fetch linked shops for the signed-in personal account;
-- - register/check a mobile device against an explicitly selected shop;
-- - record sync_events with shop_id when mobile sync runs in business context.

begin;

drop index if exists public.sync_events_owner_client_event_id_unique;

create unique index if not exists sync_events_owner_client_event_id_no_shop_unique
  on public.sync_events (owner_user_id, client_event_id)
  where client_event_id is not null
    and shop_id is null;

create unique index if not exists sync_events_owner_shop_client_event_id_unique
  on public.sync_events (owner_user_id, shop_id, client_event_id)
  where client_event_id is not null
    and shop_id is not null;

create index if not exists sync_events_owner_shop_id_idx
  on public.sync_events (owner_user_id, shop_id, id)
  where shop_id is not null;

create or replace function public.mobile_linked_shops()
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  v_server_time timestamptz := now();
  v_shops jsonb := '[]'::jsonb;
begin
  if actor_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'unauthorized',
      'shops', '[]'::jsonb,
      'server_time', v_server_time
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'shop_id', linked.shop_id,
        'shop_code', linked.shop_code,
        'shop_name', linked.shop_name,
        'role_key', linked.role_key,
        'membership_status', linked.membership_status,
        'shop_status', linked.shop_status,
        'can_select', linked.can_select,
        'can_write', linked.can_write
      )
      order by linked.can_select desc, linked.shop_name asc, linked.shop_code asc
    ),
    '[]'::jsonb
  )
    into v_shops
  from (
    select
      s.shop_id,
      s.shop_code,
      s.shop_name,
      sm.role_key,
      sm.membership_status,
      s.shop_status,
      sm.membership_status = 'active' and s.shop_status = 'active' as can_select,
      sm.membership_status = 'active'
        and s.shop_status = 'active'
        and sm.role_key in ('shop_owner', 'shop_manager') as can_write
    from public.shop_members sm
    join public.shops s on s.shop_id = sm.shop_id
    where sm.profile_id = actor_id
      and sm.membership_status = 'active'
      and s.shop_status = 'active'
    order by
      (sm.membership_status = 'active' and s.shop_status = 'active') desc,
      s.shop_name asc,
      s.shop_code asc
  ) linked;

  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'shops', v_shops,
    'server_time', v_server_time
  );
end;
$$;

revoke all on function public.mobile_linked_shops()
  from public, anon, authenticated;
grant execute on function public.mobile_linked_shops()
  to authenticated;

create or replace function public.shop_device_register_for_shop(
  p_shop_id uuid,
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
  v_shop_status text;
  v_role_key text;
  v_membership_status text;
begin
  if actor_id is null then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id);
  end if;

  select s.shop_status, sm.role_key, sm.membership_status
    into v_shop_status, v_role_key, v_membership_status
  from public.shops s
  left join public.shop_members sm
    on sm.shop_id = s.shop_id
   and sm.profile_id = actor_id
  where s.shop_id = p_shop_id;

  if v_shop_status is null then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id);
  end if;

  if v_membership_status is null then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id);
  end if;

  if v_membership_status is distinct from 'active' then
    return app_private.shop_admin_action_result(false, 'membership_not_active', p_shop_id);
  end if;

  if v_role_key not in ('shop_owner', 'shop_manager') then
    return app_private.shop_admin_action_result(false, 'write_not_allowed', p_shop_id);
  end if;

  if v_shop_status <> 'active' then
    return app_private.shop_admin_action_result(false, 'shop_not_active', p_shop_id);
  end if;

  return public.shop_device_register(
    p_shop_id,
    p_device_identifier,
    p_device_type,
    p_display_name,
    p_app_version,
    p_metadata
  );
end;
$$;

revoke all on function public.shop_device_register_for_shop(uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.shop_device_register_for_shop(uuid, text, text, text, text, jsonb)
  to authenticated;

create or replace function public.shop_device_status_for_shop(
  p_shop_id uuid,
  p_device_identifier text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  v_identifier text := btrim(coalesce(p_device_identifier, ''));
  v_server_time timestamptz := now();
  v_shop_code text;
  v_shop_name text;
  v_shop_status text;
  v_role_key text;
  v_membership_status text;
  v_device_status text;
  v_last_seen_at timestamptz;
  v_member_can_write boolean := false;
  v_recommended_action text;
begin
  if actor_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'unauthorized',
      'status', 'unauthorized',
      'can_write', false,
      'server_time', v_server_time,
      'last_seen_at', null,
      'reason_code', 'unauthorized',
      'recommended_action', 'sign_in'
    );
  end if;

  if length(v_identifier) = 0 or length(v_identifier) > 160 then
    return jsonb_build_object(
      'ok', false,
      'code', 'validation_failed',
      'status', 'unauthorized',
      'can_write', false,
      'server_time', v_server_time,
      'last_seen_at', null,
      'shop_id', p_shop_id,
      'reason_code', 'invalid_device_identifier',
      'recommended_action', 'retry_with_valid_device'
    );
  end if;

  select
    s.shop_code,
    s.shop_name,
    s.shop_status,
    sm.role_key,
    sm.membership_status
    into
      v_shop_code,
      v_shop_name,
      v_shop_status,
      v_role_key,
      v_membership_status
  from public.shops s
  left join public.shop_members sm
    on sm.shop_id = s.shop_id
   and sm.profile_id = actor_id
  where s.shop_id = p_shop_id;

  if v_shop_status is null or v_membership_status is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'unauthorized',
      'status', 'unauthorized',
      'can_write', false,
      'server_time', v_server_time,
      'last_seen_at', null,
      'shop_id', p_shop_id,
      'reason_code', 'not_linked_to_shop',
      'recommended_action', 'refresh_linked_shops'
    );
  end if;

  if v_membership_status is distinct from 'active' then
    return jsonb_build_object(
      'ok', false,
      'code', 'membership_not_active',
      'status', 'unauthorized',
      'can_write', false,
      'server_time', v_server_time,
      'last_seen_at', null,
      'shop_id', p_shop_id,
      'membership_status', v_membership_status,
      'reason_code', 'membership_not_active',
      'recommended_action', 'refresh_linked_shops'
    );
  end if;

  if v_shop_status <> 'active' then
    return jsonb_build_object(
      'ok', false,
      'code', 'shop_not_active',
      'status', 'unauthorized',
      'can_write', false,
      'server_time', v_server_time,
      'last_seen_at', null,
      'shop_id', p_shop_id,
      'reason_code', 'shop_not_active',
      'recommended_action', 'refresh_linked_shops'
    );
  end if;

  v_member_can_write :=
    v_shop_status = 'active' and v_role_key in ('shop_owner', 'shop_manager');

  select sd.status, sd.last_seen_at
    into v_device_status, v_last_seen_at
  from public.shop_devices sd
  where sd.shop_id = p_shop_id
    and sd.device_identifier = v_identifier
  limit 1;

  if v_device_status is null then
    return jsonb_build_object(
      'ok', true,
      'code', 'not_found',
      'status', 'not_found',
      'can_write', false,
      'server_time', v_server_time,
      'last_seen_at', null,
      'shop_id', p_shop_id,
      'shop_code', v_shop_code,
      'shop_name', v_shop_name,
      'shop_status', v_shop_status,
      'role_key', v_role_key,
      'membership_status', v_membership_status,
      'reason_code', 'device_not_registered',
      'recommended_action', case
        when v_member_can_write then 'register_device'
        else 'contact_shop_admin'
      end
    );
  end if;

  v_recommended_action := case
    when v_device_status = 'active' and v_member_can_write then 'allow'
    when v_device_status = 'active' then 'contact_shop_admin'
    when v_device_status = 'pending' then 'wait_for_authorization'
    when v_device_status in ('revoked', 'suspicious') then 'contact_shop_admin'
    else 'contact_shop_admin'
  end;

  return jsonb_build_object(
    'ok', v_device_status = 'active' and v_member_can_write,
    'code', case
      when v_device_status = 'active' and v_member_can_write then 'success'
      when not v_member_can_write then 'write_not_allowed'
      else v_device_status
    end,
    'status', v_device_status,
    'can_write', v_device_status = 'active' and v_member_can_write,
    'server_time', v_server_time,
    'last_seen_at', v_last_seen_at,
    'shop_id', p_shop_id,
    'shop_code', v_shop_code,
    'shop_name', v_shop_name,
    'shop_status', v_shop_status,
    'role_key', v_role_key,
    'membership_status', v_membership_status,
    'reason_code', case
      when v_device_status = 'active' and v_member_can_write then 'active'
      when not v_member_can_write then 'write_not_allowed'
      else v_device_status
    end,
    'recommended_action', v_recommended_action
  );
end;
$$;

revoke all on function public.shop_device_status_for_shop(uuid, text)
  from public, anon, authenticated;
grant execute on function public.shop_device_status_for_shop(uuid, text)
  to authenticated;

drop function if exists public.record_sync_event(
  text,
  text,
  integer,
  jsonb,
  uuid,
  text,
  text,
  uuid,
  text,
  jsonb
);

create or replace function public.record_sync_event(
  p_domain text,
  p_event_type text,
  p_changed_count integer default 0,
  p_entity_ids jsonb default null,
  p_store_id uuid default null,
  p_source text default null,
  p_source_device_id text default null,
  p_batch_id uuid default null,
  p_client_event_id text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_shop_id uuid default null
)
returns public.sync_events
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_row public.sync_events;
  v_key text;
  v_allowed_keys text[] := array[
    'supplier_ids',
    'category_ids',
    'product_ids',
    'price_ids',
    'session_ids'
  ];
  v_array_count integer;
  v_invalid_uuid_count integer;
  v_can_write_shop boolean := false;
begin
  if v_owner is null then
    raise exception 'record_sync_event requires an authenticated user'
      using errcode = '28000';
  end if;

  if p_shop_id is not null then
    select exists (
      select 1
      from public.shop_members sm
      join public.shops s on s.shop_id = sm.shop_id
      where sm.shop_id = p_shop_id
        and sm.profile_id = v_owner
        and sm.membership_status = 'active'
        and sm.role_key in ('shop_owner', 'shop_manager')
        and s.shop_status = 'active'
    )
      into v_can_write_shop;

    if not v_can_write_shop then
      raise exception 'record_sync_event shop scope requires active owner/manager membership'
        using errcode = '42501';
    end if;
  end if;

  if p_domain not in ('catalog', 'prices', 'history') then
    raise exception 'unsupported sync event domain: %', p_domain
      using errcode = '22023';
  end if;

  if p_event_type not in (
    'catalog_changed',
    'prices_changed',
    'catalog_tombstone',
    'prices_tombstone',
    'history_changed',
    'history_tombstone'
  ) then
    raise exception 'unsupported sync event type: %', p_event_type
      using errcode = '22023';
  end if;

  if p_domain = 'catalog'
    and p_event_type not in ('catalog_changed', 'catalog_tombstone') then
    raise exception 'event type % is not valid for catalog', p_event_type
      using errcode = '22023';
  end if;

  if p_domain = 'prices'
    and p_event_type not in ('prices_changed', 'prices_tombstone') then
    raise exception 'event type % is not valid for prices', p_event_type
      using errcode = '22023';
  end if;

  if p_domain = 'history'
    and p_event_type not in ('history_changed', 'history_tombstone') then
    raise exception 'event type % is not valid for history', p_event_type
      using errcode = '22023';
  end if;

  if p_changed_count < 0 or p_changed_count > 100000 then
    raise exception 'changed_count out of allowed range'
      using errcode = '22023';
  end if;

  if p_client_event_id is not null and length(p_client_event_id) > 160 then
    raise exception 'client_event_id too large'
      using errcode = '22023';
  end if;

  if p_source_device_id is not null and length(p_source_device_id) > 160 then
    raise exception 'source_device_id too large'
      using errcode = '22023';
  end if;

  if jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'metadata must be a JSON object'
      using errcode = '22023';
  end if;

  if pg_column_size(v_metadata) > 4096 then
    raise exception 'metadata payload too large'
      using errcode = '22023';
  end if;

  if v_metadata ?| array[
    'barcode',
    'email',
    'excel',
    'path',
    'price',
    'product_name',
    'supplier_name',
    'category_name',
    'token'
  ] then
    raise exception 'metadata contains fields outside the sync-event metadata budget'
      using errcode = '22023';
  end if;

  if p_entity_ids is not null then
    if jsonb_typeof(p_entity_ids) <> 'object' then
      raise exception 'entity_ids must be a JSON object'
        using errcode = '22023';
    end if;

    if pg_column_size(p_entity_ids) > 16384 then
      raise exception 'entity_ids payload too large'
        using errcode = '54000';
    end if;

    for v_key in select jsonb_object_keys(p_entity_ids) loop
      if not v_key = any(v_allowed_keys) then
        raise exception 'unsupported entity_ids key: %', v_key
          using errcode = '22023';
      end if;

      if jsonb_typeof(p_entity_ids -> v_key) <> 'array' then
        raise exception 'entity_ids.% must be an array', v_key
          using errcode = '22023';
      end if;

      select count(*)
        into v_array_count
        from jsonb_array_elements_text(p_entity_ids -> v_key);

      if v_array_count > 250 then
        raise exception 'entity_ids.% has too many ids', v_key
          using errcode = '54000';
      end if;

      select count(*)
        into v_invalid_uuid_count
        from jsonb_array_elements_text(p_entity_ids -> v_key) as ids(value)
        where ids.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

      if v_invalid_uuid_count > 0 then
        raise exception 'entity_ids.% contains non-uuid values', v_key
          using errcode = '22023';
      end if;
    end loop;
  end if;

  if p_client_event_id is not null then
    select *
      into v_row
      from public.sync_events
      where owner_user_id = v_owner
        and client_event_id = p_client_event_id
        and (
          (p_shop_id is null and shop_id is null)
          or shop_id = p_shop_id
        );

    if found then
      return v_row;
    end if;
  end if;

  insert into public.sync_events (
    owner_user_id,
    shop_id,
    store_id,
    domain,
    event_type,
    source,
    source_device_id,
    batch_id,
    client_event_id,
    changed_count,
    entity_ids,
    metadata
  )
  values (
    v_owner,
    p_shop_id,
    p_store_id,
    p_domain,
    p_event_type,
    p_source,
    p_source_device_id,
    p_batch_id,
    p_client_event_id,
    p_changed_count,
    p_entity_ids,
    v_metadata
  )
  returning * into v_row;

  return v_row;
exception
  when unique_violation then
    if p_client_event_id is not null then
      select *
        into v_row
        from public.sync_events
        where owner_user_id = v_owner
          and client_event_id = p_client_event_id
          and (
            (p_shop_id is null and shop_id is null)
            or shop_id = p_shop_id
          );

      if found then
        return v_row;
      end if;
    end if;

    raise;
end;
$$;

revoke all on function public.record_sync_event(
  text,
  text,
  integer,
  jsonb,
  uuid,
  text,
  text,
  uuid,
  text,
  jsonb,
  uuid
) from public, anon, authenticated;

grant execute on function public.record_sync_event(
  text,
  text,
  integer,
  jsonb,
  uuid,
  text,
  text,
  uuid,
  text,
  jsonb,
  uuid
) to authenticated;

notify pgrst, 'reload schema';

commit;
