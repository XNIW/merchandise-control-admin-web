-- WECHAT-010: authentic Mini login has no shop_devices POS/mobile lease.
-- Keep the opaque session gateway and exact personal reader authorization;
-- isolate the Mini resolver so native/POS recovery requirements do not change.
-- Mapping locks, event fences and safe event projection retain their contracts.
begin;

-- Existing private/public WeChat functions are postgres-owned. Fail atomically
-- under another deployment role rather than broadening EXECUTE privileges.
do $owner_guard$
begin
  if current_user <> 'postgres' then
    raise exception 'wechat_mini_sync_migration_owner_mismatch';
  end if;
  if exists (
    select 1 from pg_proc
    where oid in (
      'public.wechat_mini_sync_checkpoint_v1(uuid,uuid,text,text,text,timestamptz)'::regprocedure,
      'public.wechat_mini_sync_delta_v1(uuid,uuid,text,text,integer,text,text)'::regprocedure
    ) and pg_get_userbyid(proowner) <> 'postgres'
  ) then
    raise exception 'wechat_mini_sync_migration_owner_mismatch';
  end if;
end;
$owner_guard$;

create or replace function app_private.wechat_mini_sync_scope_v1(
  p_actor_profile_id uuid,
  p_shop_id uuid,
  p_device_identifier text
)
returns table (
  mapped_owner_id uuid,
  authorized_legacy_owner_id uuid,
  scope_kind text,
  history_scope_kind text,
  scope_key text,
  legacy_owner_key text,
  account_key text,
  device_key text
)
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_actor_profile_id uuid := p_actor_profile_id;
  v_mapped_owner_id uuid;
  v_initial_mapped_owner_id uuid;
  v_has_blocking_mapping boolean := false;
  v_has_shop_catalog_rows boolean := false;
  v_has_legacy_catalog_rows boolean := false;
  v_device_identifier text;
  v_account_key text;
  v_device_key text;
begin
  perform app_private.wechat_mini_require_shop_reader_v1(p_actor_profile_id, p_shop_id);
  if not app_private.wechat_mini_profile_live_v1(p_actor_profile_id) then
    raise exception 'wechat_mini_session_expired' using errcode = '28000';
  end if;
  if v_actor_profile_id is null then
    raise exception 'shop sync recovery requires authentication'
      using errcode = '28000';
  end if;

  if p_shop_id is null then
    raise exception 'shop sync recovery requires a shop id'
      using errcode = '22023';
  end if;

  -- Bound the raw value before trimming it so whitespace cannot cause an
  -- unbounded intermediate allocation before the device lease check.
  if p_device_identifier is null
    or p_device_identifier !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'shop sync recovery requires a valid device identity'
      using errcode = '22023';
  end if;
  v_device_identifier := btrim(p_device_identifier);
  if octet_length(v_device_identifier) = 0 then
    raise exception 'shop sync recovery requires a valid device identity'
      using errcode = '22023';
  end if;

  -- The business gateway holds the opaque session/mapping lease and verifies
  -- the salted device hash before dispatch. Mini devices are not POS devices.
  -- Keep the actual personal reader and lock shop/profile/membership plus the
  -- same canonical mapping lease used by native recovery readers.
  perform 1
  from public.shops shop
  where shop.shop_id = p_shop_id
    and shop.shop_status = 'active'
  for share;
  if not found then
    raise exception 'shop sync recovery requires an active owner/manager shop binding'
      using errcode = '42501';
  end if;

  perform 1
  from public.profiles profile
  where profile.profile_id = v_actor_profile_id
    and profile.profile_status = 'active'
    and profile.disabled_at is null
  for share;
  if not found then
    raise exception 'shop sync recovery requires an active owner/manager shop binding'
      using errcode = '42501';
  end if;

  perform 1
  from public.shop_members member
  where member.shop_id = p_shop_id
    and member.profile_id = v_actor_profile_id
    and member.membership_status = 'active'
    and member.role_key in ('shop_owner', 'shop_manager', 'viewer')
  for share;
  if not found then
    raise exception 'shop sync recovery requires an active owner/manager shop binding'
      using errcode = '42501';
  end if;

  -- Mapping transitions take the same advisory pair lock before changing a
  -- source row.  Select an initial owner only to derive the lock key, then
  -- lock and re-read all source rows before computing the visible union.
  select source.owner_user_id
  into v_initial_mapped_owner_id
  from public.shop_inventory_sources source
  where source.shop_id = p_shop_id
    and source.mapping_state = 'mapped'
    and source.owner_user_id is not null
    and source.verified_at is not null
    and pg_catalog.isfinite(source.created_at)
    and pg_catalog.isfinite(source.verified_at)
    and source.disabled_at is null
  order by source.created_at desc
  limit 1;

  perform app_private.lock_catalog_scope_pair_v1(
    p_shop_id,
    v_initial_mapped_owner_id
  );

  perform 1
  from public.shop_inventory_sources source
  where source.shop_id = p_shop_id
  for share;

  select source.owner_user_id
  into v_mapped_owner_id
  from public.shop_inventory_sources source
  where source.shop_id = p_shop_id
    and source.mapping_state = 'mapped'
    and source.owner_user_id is not null
    and source.verified_at is not null
    and pg_catalog.isfinite(source.created_at)
    and pg_catalog.isfinite(source.verified_at)
    and source.disabled_at is null
  order by source.created_at desc
  limit 1;

  select exists (
    select 1
    from public.shop_inventory_sources source
    where source.shop_id = p_shop_id
      and source.disabled_at is null
      and (
        source.mapping_state <> 'mapped'
        or source.owner_user_id is null
        or source.verified_at is null
        or not pg_catalog.isfinite(source.created_at)
        or (
          source.verified_at is not null
          and not pg_catalog.isfinite(source.verified_at)
        )
      )
  ) into v_has_blocking_mapping;

  if v_has_blocking_mapping then
    raise exception 'shop_sync_recovery_scope_unresolved'
      using errcode = '55000';
  end if;

  select
    exists (select 1 from public.inventory_suppliers row where row.shop_id = p_shop_id)
    or exists (select 1 from public.inventory_categories row where row.shop_id = p_shop_id)
    or exists (select 1 from public.inventory_products row where row.shop_id = p_shop_id)
    or exists (select 1 from public.inventory_product_prices row where row.shop_id = p_shop_id)
  into v_has_shop_catalog_rows;

  if v_mapped_owner_id is not null then
    select
      exists (select 1 from public.inventory_suppliers row where row.shop_id is null and row.owner_user_id = v_mapped_owner_id)
      or exists (select 1 from public.inventory_categories row where row.shop_id is null and row.owner_user_id = v_mapped_owner_id)
      or exists (select 1 from public.inventory_products row where row.shop_id is null and row.owner_user_id = v_mapped_owner_id)
      or exists (select 1 from public.inventory_product_prices row where row.shop_id is null and row.owner_user_id = v_mapped_owner_id)
    into v_has_legacy_catalog_rows;
  end if;

  scope_kind := case
    when v_has_shop_catalog_rows and v_has_legacy_catalog_rows
      then 'authorized_shop_plus_legacy'
    when v_has_shop_catalog_rows or v_mapped_owner_id is null
      then 'shop_scoped'
    else 'legacy_owner_bridge'
  end;
  mapped_owner_id := case
    when scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
      then v_mapped_owner_id
    else null
  end;
  authorized_legacy_owner_id := v_mapped_owner_id;
  history_scope_kind := case
    when v_mapped_owner_id is null then 'shop_scoped'
    else 'authorized_shop_plus_legacy'
  end;
  legacy_owner_key := case
    when v_mapped_owner_id is null then null
    else app_private.sync_checkpoint_sha256(lower(v_mapped_owner_id::text))
  end;
  v_account_key := app_private.sync_checkpoint_sha256(
    lower(v_actor_profile_id::text)
  );
  account_key := v_account_key;
  v_device_key := app_private.sync_checkpoint_sha256(v_device_identifier);
  device_key := v_device_key;

  scope_key := app_private.sync_checkpoint_sha256(
    v_account_key || ':' || lower(p_shop_id::text) || ':' || scope_kind || ':' ||
    coalesce(lower(mapped_owner_id::text), '-') || ':' || history_scope_kind || ':' ||
    coalesce(lower(v_mapped_owner_id::text), '-') || ':' || v_device_key
  );
  return next;
end;
$$;

create function app_private.wechat_mini_sync_event_page_v1(
  p_actor_profile_id uuid,
  p_shop_id uuid,
  p_device_identifier text,
  p_after_id text default '0',
  p_limit integer default 50,
  p_expected_scope_key text default null,
  p_expected_event_max_id text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_mapped_owner_id uuid;
  v_authorized_legacy_owner_id uuid;
  v_scope_kind text;
  v_history_scope_kind text;
  v_scope_key text;
  v_legacy_owner_key text;
  v_account_key text;
  v_device_key text;
  v_rows jsonb;
  v_next_after_id bigint;
  v_has_more boolean;
  v_payload_bytes bigint;
  v_result jsonb;
  v_after_id bigint;
  v_scope_event_max_id bigint;
  v_as_of_event_max_id bigint;
begin
  if coalesce(p_after_id, '') !~ '^(0|[1-9][0-9]{0,18})$' then
    raise exception 'shop sync event cursor must be a canonical decimal string'
      using errcode = '22023';
  end if;
  begin
    v_after_id := p_after_id::bigint;
  exception when numeric_value_out_of_range then
    raise exception 'shop sync event cursor is outside bigint range'
      using errcode = '22003';
  end;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'shop sync event page limit must be between 1 and 50'
      using errcode = '22023';
  end if;

  select
    scope.mapped_owner_id,
    scope.authorized_legacy_owner_id,
    scope.scope_kind,
    scope.history_scope_kind,
    scope.scope_key,
    scope.legacy_owner_key,
    scope.account_key,
    scope.device_key
  into
    v_mapped_owner_id,
    v_authorized_legacy_owner_id,
    v_scope_kind,
    v_history_scope_kind,
    v_scope_key,
    v_legacy_owner_key,
    v_account_key,
    v_device_key
  from app_private.wechat_mini_sync_scope_v1(
    p_actor_profile_id, p_shop_id,
    p_device_identifier
  ) scope;

  if coalesce(p_expected_scope_key, '') !~ '^[a-f0-9]{64}$'
    or p_expected_scope_key <> v_scope_key then
    raise exception 'shop_sync_recovery_scope_changed'
      using errcode = '55000';
  end if;

  v_scope_event_max_id := app_private.shop_sync_scope_event_max_id_v1(
    p_shop_id,
    v_scope_kind,
    v_mapped_owner_id,
    v_authorized_legacy_owner_id
  );
  if p_expected_event_max_id is null then
    v_as_of_event_max_id := v_scope_event_max_id;
  else
    if p_expected_event_max_id !~ '^(0|[1-9][0-9]{0,18})$' then
      raise exception 'expected event max must be a canonical decimal string'
        using errcode = '22023';
    end if;
    begin
      v_as_of_event_max_id := p_expected_event_max_id::bigint;
    exception when numeric_value_out_of_range then
      raise exception 'expected event max is outside bigint range'
        using errcode = '22003';
    end;
    if v_as_of_event_max_id > v_scope_event_max_id then
      raise exception 'shop_sync_incremental_snapshot_changed'
        using errcode = '55000';
    end if;
  end if;
  if v_after_id > v_as_of_event_max_id then
    raise exception 'shop_sync_event_cursor_ahead'
      using errcode = '55000';
  end if;

  with candidates as materialized (
    select event.id,
      app_private.sync_event_safe_row_v1(
        event.id, event.owner_user_id, event.store_id, event.domain,
        event.event_type, event.source, event.source_device_id,
        event.batch_id, event.client_event_id, event.changed_count,
        event.entity_ids, event.created_at, event.expires_at, event.metadata,
        event.shop_id, p_shop_id
      ) as row_data
    from public.sync_events event
    where event.id > v_after_id
      and event.id <= v_as_of_event_max_id
      and ((
        event.domain = 'history'
        and (
          event.shop_id = p_shop_id
          or (
            v_authorized_legacy_owner_id is not null
            and event.shop_id is null
            and event.owner_user_id = v_authorized_legacy_owner_id
          )
        )
      ) or (
        event.domain in ('catalog', 'prices')
        and (
          (
            v_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
            and event.shop_id = p_shop_id
          ) or (
            v_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
            and event.shop_id is null
            and event.owner_user_id = v_mapped_owner_id
          )
        )
      ))
    order by event.id
    limit p_limit + 1
  ), page_rows as (
    select candidate.id, candidate.row_data
    from candidates candidate
    order by candidate.id
    limit p_limit
  )
  select
    coalesce(
      (select jsonb_agg(page.row_data order by page.id) from page_rows page),
      '[]'::jsonb
    ),
    (select count(*) > p_limit from candidates),
    case
      when (select count(*) > p_limit from candidates) then
        (select page.id from page_rows page order by page.id desc limit 1)
      else null
    end,
    coalesce((select sum(octet_length(page.row_data::text)) from page_rows page), 0)
  into v_rows, v_has_more, v_next_after_id, v_payload_bytes;

  if v_payload_bytes > 4190000 then
    raise exception 'shop_sync_event_page_payload_too_large'
      using errcode = '54000';
  end if;

  v_result := jsonb_build_object(
    'schemaVersion', 'shop-sync-event-page-v1',
    'shopId', p_shop_id,
    'scope', jsonb_build_object(
      'kind', v_scope_kind,
      'historyKind', v_history_scope_kind,
      'key', v_scope_key,
      'legacyOwnerKey', v_legacy_owner_key,
      'accountKey', v_account_key,
      'deviceKey', v_device_key
    ),
    'scopeEventMaxId', v_scope_event_max_id::text,
    'asOfEventMaxId', v_as_of_event_max_id::text,
    'asOfDomainEventMaxIds', jsonb_build_object(
      'catalog', app_private.shop_sync_scope_domain_event_max_id_v1(
        p_shop_id, v_scope_kind, v_mapped_owner_id,
        v_authorized_legacy_owner_id, 'catalog', v_as_of_event_max_id
      )::text,
      'prices', app_private.shop_sync_scope_domain_event_max_id_v1(
        p_shop_id, v_scope_kind, v_mapped_owner_id,
        v_authorized_legacy_owner_id, 'prices', v_as_of_event_max_id
      )::text,
      'history', app_private.shop_sync_scope_domain_event_max_id_v1(
        p_shop_id, v_scope_kind, v_mapped_owner_id,
        v_authorized_legacy_owner_id, 'history', v_as_of_event_max_id
      )::text
    ),
    'pageLimit', p_limit,
    'payloadBytes', v_payload_bytes,
    'maxPageRowPayloadBytes', 4190000,
    'maxResponseBytes', 4194304,
    'rows', v_rows,
    'nextAfterId', case
      when v_next_after_id is null then null
      else v_next_after_id::text
    end,
    'hasMore', v_has_more
  );

  if octet_length(v_result::text) > 4194304 then
    raise exception 'shop_sync_event_response_too_large'
      using errcode = '54000';
  end if;

  return v_result;
end;
$$;

revoke all on function app_private.wechat_mini_sync_scope_v1(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.wechat_mini_sync_event_page_v1(uuid, uuid, text, text, integer, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.wechat_mini_sync_checkpoint_v1(
  p_actor_profile_id uuid,
  p_shop_id uuid,
  p_device_identifier text,
  p_after_id text default '0',
  p_expected_scope_key text default null,
  p_last_reconciled_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, pg_temp
set statement_timeout = '5s'
as $$
declare
  v_scope record;
  v_event_max bigint;
  v_after bigint;
  v_status text := 'ready';
  v_reconcile boolean := false;
begin
  if coalesce(p_device_identifier, '') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(p_after_id, '') !~ '^(0|[1-9][0-9]{0,18})$'
    or (p_expected_scope_key is not null
      and p_expected_scope_key !~ '^[0-9a-f]{64}$')
    or (p_last_reconciled_at is not null
      and not pg_catalog.isfinite(p_last_reconciled_at)) then
    raise exception 'wechat_mini_sync_invalid' using errcode = '22023';
  end if;
  begin
    v_after := p_after_id::bigint;
  exception when numeric_value_out_of_range then
    raise exception 'wechat_mini_sync_invalid' using errcode = '22023';
  end;

  select * into strict v_scope
  from app_private.wechat_mini_sync_scope_v1(
    p_actor_profile_id, p_shop_id, p_device_identifier
  );
  v_event_max := app_private.shop_sync_scope_event_max_id_v1(
    p_shop_id, v_scope.scope_kind, v_scope.mapped_owner_id,
    v_scope.authorized_legacy_owner_id
  );

  if p_expected_scope_key is not null
    and p_expected_scope_key <> v_scope.scope_key then
    v_status := 'scope_changed';
    v_reconcile := true;
  elsif v_after > v_event_max then
    v_status := 'cursor_ahead';
    v_reconcile := true;
  elsif v_after = 0
    or p_last_reconciled_at is null
    or p_last_reconciled_at < statement_timestamp() - interval '7 days' then
    v_status := 'reconcile_required';
    v_reconcile := true;
  end if;

  return jsonb_build_object(
    'schemaVersion', 'wechat-mini-sync-checkpoint-v1',
    'status', v_status,
    'shopId', p_shop_id,
    'scopeKey', v_scope.scope_key,
    'eventMaxId', v_event_max::text,
    'domainMaxIds', jsonb_build_object(
      'catalog', app_private.shop_sync_scope_domain_event_max_id_v1(
        p_shop_id, v_scope.scope_kind, v_scope.mapped_owner_id,
        v_scope.authorized_legacy_owner_id, 'catalog', v_event_max
      )::text,
      'prices', app_private.shop_sync_scope_domain_event_max_id_v1(
        p_shop_id, v_scope.scope_kind, v_scope.mapped_owner_id,
        v_scope.authorized_legacy_owner_id, 'prices', v_event_max
      )::text,
      'history', app_private.shop_sync_scope_domain_event_max_id_v1(
        p_shop_id, v_scope.scope_kind, v_scope.mapped_owner_id,
        v_scope.authorized_legacy_owner_id, 'history', v_event_max
      )::text
    ),
    'requiresReconcile', v_reconcile,
    'serverTime', statement_timestamp()
  );
end;
$$;

create or replace function public.wechat_mini_sync_delta_v1(
  p_actor_profile_id uuid,
  p_shop_id uuid,
  p_device_identifier text,
  p_after_id text,
  p_limit integer,
  p_expected_scope_key text,
  p_expected_event_max_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, pg_temp
set statement_timeout = '6s'
as $$
declare
  v_result jsonb;
  v_safe_rows jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'wechat_mini_sync_invalid' using errcode = '22023';
  end if;
  v_result := app_private.wechat_mini_sync_event_page_v1(
    p_actor_profile_id, p_shop_id,
    p_device_identifier,
    p_after_id,
    p_limit,
    p_expected_scope_key,
    p_expected_event_max_id
  );
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', row_data->>'id',
        'domain', row_data->>'domain',
        'event_type', row_data->>'event_type',
        'source', row_data->>'source',
        'changed_count', row_data->'changed_count',
        'entity_ids', coalesce(row_data->'entity_ids', '{}'::jsonb),
        'requires_full_recovery',
          coalesce((row_data->>'requires_full_recovery')::boolean, true),
        'created_at', row_data->>'created_at'
      )
      order by (row_data->>'id')::bigint
    ),
    '[]'::jsonb
  ) into v_safe_rows
  from jsonb_array_elements(coalesce(v_result->'rows', '[]'::jsonb)) row_data;

  v_result := jsonb_build_object(
    'schemaVersion', 'wechat-mini-sync-delta-v1',
    'shopId', v_result->'shopId',
    'scopeEventMaxId', v_result->'scopeEventMaxId',
    'asOfEventMaxId', v_result->'asOfEventMaxId',
    'asOfDomainEventMaxIds', v_result->'asOfDomainEventMaxIds',
    'rows', v_safe_rows,
    'nextAfterId', v_result->'nextAfterId',
    'hasMore', v_result->'hasMore'
  );
  if octet_length(v_result::text) > 262144 then
    raise exception 'wechat_mini_sync_response_too_large' using errcode = '54000';
  end if;
  return v_result;
end;
$$;

commit;
