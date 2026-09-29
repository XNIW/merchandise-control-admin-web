-- TASK-159 / WECHAT-010: private, bounded physical History normalization.
-- Does not modify the runtime compressed-JSONB guard or publish sync events.
-- The companion runbook pins the PostgreSQL PGLZ/TOAST/JSONB proof.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '2min';

do $owner_guard$
begin
  if current_user <> 'postgres'
    or current_setting('server_version_num')::integer not between 170000 and 179999
    or (select pg_get_userbyid(proowner) from pg_proc
        where oid = 'public.set_shared_sheet_sessions_updated_at()'::regprocedure) <> 'postgres' then
    raise exception 'history_normalization_migration_owner_or_version_mismatch';
  end if;
end;
$owner_guard$;

create table app_private.wechat_history_normalization_marks (
  transaction_id xid8 not null,
  backend_pid integer not null,
  remote_id text not null,
  shop_id uuid not null,
  expected_updated_at timestamptz not null,
  expected_row_sha256 text not null check (expected_row_sha256 ~ '^[0-9a-f]{64}$'),
  primary key (transaction_id, backend_pid, remote_id)
);
alter table app_private.wechat_history_normalization_marks enable row level security;
revoke all on table app_private.wechat_history_normalization_marks
  from public, anon, authenticated, service_role;

create function app_private.wechat_history_normalization_clone_v1(p_value jsonb, p_kind text)
returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_method text;
  v_size bigint;
  v_result jsonb;
begin
  if current_user <> 'postgres' then
    raise exception 'history_normalization_postgres_only' using errcode = '42501';
  end if;
  if p_kind not in ('array', 'object') or p_kind is null then
    raise exception 'history_normalization_kind_invalid' using errcode = '22023';
  end if;
  if p_value is null then
    if p_kind = 'object' then return null; end if;
    raise exception 'history_normalization_data_required' using errcode = '23514';
  end if;
  v_method := pg_column_compression(p_value);
  v_size := pg_column_size(p_value)::bigint;
  -- PGLZ emits at most 273 bytes per token; every token consumes >=1 byte.
  -- Include the ordinary varlena header. Reject, never clamp, the bound.
  if v_method = 'pglz' then
    if v_size < 1 or 4 + 273::bigint * v_size > 2097152 then
      raise exception 'history_normalization_expansion_budget' using errcode = '23514';
    end if;
  elsif v_method is null then
    if v_size < 1 or 4 + v_size > 2097152 then
      raise exception 'history_normalization_expansion_budget' using errcode = '23514';
    end if;
  else
    raise exception 'history_normalization_compression_unsupported' using errcode = '23514';
  end if;
  -- First detoast only after the preceding procedural metadata gate.
  if jsonb_typeof(p_value) is distinct from p_kind then
    raise exception 'history_normalization_root_type' using errcode = '23514';
  end if;
  -- Same-kind empty concat detoasts without jsonb_out/numeric_out.
  v_result := p_value || case p_kind when 'array' then '[]'::jsonb else '{}'::jsonb end;
  if pg_column_compression(v_result) is not null
    or pg_column_size(v_result) > 1048576 then
    raise exception 'history_normalization_binary_budget' using errcode = '23514';
  end if;
  return v_result;
end;
$$;
revoke all on function app_private.wechat_history_normalization_clone_v1(jsonb,text)
  from public, anon, authenticated, service_role;

-- Call only with bounded, uncompressed data/overlay. Composite construction
-- must not precede the scalar clone gates above.
create function app_private.wechat_history_normalization_hash_v1(p_row public.shared_sheet_sessions)
returns text
language plpgsql stable security invoker
set search_path = pg_catalog, app_private, pg_temp
set timezone = 'UTC'
as $$
begin
  if current_user <> 'postgres' then
    raise exception 'history_normalization_postgres_only' using errcode = '42501';
  end if;
  if p_row.deleted_at is not null or p_row.shop_id is null then
    raise exception 'history_normalization_scope_invalid' using errcode = '23514';
  end if;
  if app_private.sync_history_recovery_row_fits_v1(
    p_row.remote_id, p_row.payload_version, p_row."timestamp", p_row.supplier,
    p_row.category, p_row.is_manual_entry, p_row.updated_at, p_row.owner_user_id,
    p_row.display_name, p_row.deleted_at, p_row.shop_id, p_row.data, p_row.session_overlay
  ) is not true then
    raise exception 'history_normalization_canonical_payload_invalid' using errcode = '23514';
  end if;
  -- The canonical validator has rejected numeric data cells, malformed overlays
  -- and logical/DTO oversize before this first whole-row serialization.
  return app_private.sync_checkpoint_sha256(to_jsonb(p_row)::text);
end;
$$;
revoke all on function app_private.wechat_history_normalization_hash_v1(public.shared_sheet_sessions)
  from public, anon, authenticated, service_role;

create function app_private.wechat_history_normalization_plan_v1(p_shop_id uuid, p_ids text[])
returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog, app_private, pg_temp
set timezone = 'UTC'
as $$
declare
  v_id text;
  v_row public.shared_sheet_sessions%rowtype;
  v_data jsonb;
  v_overlay jsonb;
  v_data_method text;
  v_overlay_method text;
  v_data_bytes integer;
  v_overlay_bytes integer;
  v_rows jsonb := '[]'::jsonb;
  v_hash text;
begin
  if current_user <> 'postgres' then
    raise exception 'history_normalization_postgres_only' using errcode = '42501';
  end if;
  if p_shop_id is null or p_ids is null or array_ndims(p_ids) is distinct from 1
    or cardinality(p_ids) not between 1 and 32 then
    raise exception 'history_normalization_batch_invalid' using errcode = '22023';
  end if;
  if not exists (select 1 from public.shops where shop_id=p_shop_id and shop_status='active') then
    raise exception 'history_normalization_shop_invalid' using errcode = '22023';
  end if;
  foreach v_id in array p_ids loop
    if v_id is null or octet_length(v_id) <> 36 then
      raise exception 'history_normalization_id_invalid' using errcode = '22023';
    end if;
    if v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'history_normalization_id_invalid' using errcode = '22023';
    end if;
  end loop;
  if p_ids is distinct from (select array_agg(distinct id order by id) from unnest(p_ids) id) then
    raise exception 'history_normalization_ids_not_sorted_unique' using errcode = '22023';
  end if;
  foreach v_id in array p_ids loop
    -- Scalar expressions preserve each independent TOAST pointer until bounded.
    select app_private.wechat_history_normalization_clone_v1(data,'array'),
      app_private.wechat_history_normalization_clone_v1(session_overlay,'object'),
      pg_column_compression(data), pg_column_compression(session_overlay),
      pg_column_size(data), pg_column_size(session_overlay)
    into v_data,v_overlay,v_data_method,v_overlay_method,v_data_bytes,v_overlay_bytes
    from public.shared_sheet_sessions
    where remote_id=v_id and shop_id=p_shop_id and deleted_at is null;
    if not found then
      raise exception 'history_normalization_row_scope_mismatch' using errcode = '22023';
    end if;
    if v_data_method is null and v_overlay_method is null then
      raise exception 'history_normalization_row_already_uncompressed' using errcode = '22023';
    end if;
    select * into strict v_row from public.shared_sheet_sessions where remote_id=v_id and shop_id=p_shop_id;
    v_row.data := v_data;
    v_row.session_overlay := v_overlay;
    v_hash := app_private.wechat_history_normalization_hash_v1(v_row);
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'id',v_id,'updated_at',v_row.updated_at,'row_sha256',v_hash,
      'data_compression',v_data_method,'overlay_compression',v_overlay_method,
      'data_physical_bytes',v_data_bytes,'overlay_physical_bytes',v_overlay_bytes
    ));
  end loop;
  return jsonb_build_object('contract','wechat-history-physical-v1','shop_id',p_shop_id,'rows',v_rows);
end;
$$;
revoke all on function app_private.wechat_history_normalization_plan_v1(uuid,text[])
  from public, anon, authenticated, service_role;

create or replace function public.set_shared_sheet_sessions_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_changed boolean := false;
  v_mark app_private.wechat_history_normalization_marks%rowtype;
  v_old public.shared_sheet_sessions%rowtype;
  v_data jsonb;
  v_overlay jsonb;
begin
  -- Only the postgres-only invoker can create this transaction/row marker.
  -- No caller GUC, JWT claim or SECURITY DEFINER current_user check authorizes it.
  select * into v_mark
  from app_private.wechat_history_normalization_marks
  where transaction_id = pg_current_xact_id()
    and backend_pid = pg_backend_pid()
    and remote_id = old.remote_id
    and shop_id = old.shop_id
  for update;
  if found then
    if old.deleted_at is not null or old.updated_at is distinct from v_mark.expected_updated_at then
      raise exception 'history_normalization_marker_mismatch' using errcode = '23514';
    end if;
    -- Sequential gates precede full-record equality or any serialization.
    v_data := app_private.wechat_history_normalization_clone_v1(old.data, 'array');
    v_overlay := app_private.wechat_history_normalization_clone_v1(old.session_overlay, 'object');
    if pg_column_compression(new.data) is not null
      or pg_column_compression(new.session_overlay) is not null then
      raise exception 'history_normalization_new_compressed' using errcode = '23514';
    end if;
    if app_private.sync_jsonb_storage_is_bounded_v1(new.data, 1048576, 0) is not true
      or coalesce(app_private.sync_jsonb_storage_is_bounded_v1(new.session_overlay, 1048576, 0), true) is not true then
      raise exception 'history_normalization_new_oversize' using errcode = '23514';
    end if;
    v_old := old;
    v_old.data := v_data;
    v_old.session_overlay := v_overlay;
    if app_private.wechat_history_normalization_hash_v1(v_old) is distinct from v_mark.expected_row_sha256
      or app_private.wechat_history_normalization_hash_v1(new) is distinct from v_mark.expected_row_sha256 then
      raise exception 'history_normalization_content_mismatch' using errcode = '23514';
    end if;
    if new is distinct from old then
      raise exception 'history_normalization_not_physical_only' using errcode = '23514';
    end if;
    delete from app_private.wechat_history_normalization_marks
    where transaction_id = v_mark.transaction_id
      and backend_pid = v_mark.backend_pid and remote_id = v_mark.remote_id;
    return new;
  end if;

  if old.deleted_at is not null then
    return old;
  end if;

  if octet_length(new.remote_id)
    + octet_length(new."timestamp")
    + octet_length(new.supplier)
    + octet_length(new.category)
    + octet_length(new.display_name) > 132096 then
    raise exception 'history row exceeds recovery storage envelope'
      using errcode = '23514';
  end if;

  if new.deleted_at is not null then
    v_changed := true;
  else
    if not app_private.sync_jsonb_storage_is_bounded_v1(
        new.data, 1048576, 0
      ) or not coalesce(app_private.sync_jsonb_storage_is_bounded_v1(
        new.session_overlay, 1048576, 0
      ), true) or not app_private.sync_jsonb_storage_is_bounded_v1(
        old.data, 1048576, 0
      ) or not coalesce(app_private.sync_jsonb_storage_is_bounded_v1(
        old.session_overlay, 1048576, 0
      ), true) then
      raise exception 'history row JSONB requires bounded external storage'
        using errcode = '23514';
    end if;
    v_changed := new.remote_id is distinct from old.remote_id
      or new.payload_version is distinct from old.payload_version
      or new."timestamp" is distinct from old."timestamp"
      or new.supplier is distinct from old.supplier
      or new.category is distinct from old.category
      or new.is_manual_entry is distinct from old.is_manual_entry
      or new.data is distinct from old.data
      or new.owner_user_id is distinct from old.owner_user_id
      or new.display_name is distinct from old.display_name
      or new.session_overlay is distinct from old.session_overlay
      or new.shop_id is distinct from old.shop_id;
  end if;

  if v_changed then
    new.updated_at := statement_timestamp();
  else
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

revoke all on function public.set_shared_sheet_sessions_updated_at()
  from public, anon, authenticated, service_role;

create function app_private.wechat_history_normalization_apply_v1(p_shop_id uuid, p_manifest jsonb)
returns jsonb
language plpgsql volatile security invoker
set search_path = pg_catalog, app_private, pg_temp
set timezone = 'UTC'
as $$
declare
  v_item jsonb;
  v_id text;
  v_ids text[] := array[]::text[];
  v_actual jsonb;
  v_row public.shared_sheet_sessions%rowtype;
  v_data jsonb;
  v_overlay jsonb;
  v_hash text;
  v_count integer := 0;
  v_events bigint;
  v_after_events bigint;
begin
  if current_user <> 'postgres' then
    raise exception 'history_normalization_postgres_only' using errcode = '42501';
  end if;
  if app_private.sync_jsonb_storage_is_bounded_v1(p_manifest,32768,0) is not true then
    raise exception 'history_normalization_manifest_invalid' using errcode = '22023';
  end if;
  if jsonb_typeof(p_manifest) is distinct from 'object'
    or p_manifest->'contract' is distinct from '"wechat-history-physical-v1"'::jsonb
    or p_manifest->'shop_id' is distinct from to_jsonb(p_shop_id)
    or jsonb_typeof(p_manifest->'rows') is distinct from 'array' then
    raise exception 'history_normalization_manifest_invalid' using errcode = '22023';
  end if;
  if jsonb_array_length(p_manifest->'rows') not between 1 and 32 then
    raise exception 'history_normalization_batch_invalid' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_manifest->'rows') loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or jsonb_typeof(v_item->'id') is distinct from 'string' then
      raise exception 'history_normalization_manifest_invalid' using errcode = '22023';
    end if;
    v_id := v_item->>'id';
    if octet_length(v_id) <> 36 then
      raise exception 'history_normalization_id_invalid' using errcode = '22023';
    end if;
    v_ids := array_append(v_ids,v_id);
  end loop;
  perform 1 from public.shops where shop_id=p_shop_id and shop_status='active'
  for share nowait;
  if not found then
    raise exception 'history_normalization_shop_invalid' using errcode = '22023';
  end if;
  -- Lock every intended row before comparing the snapshot, in deterministic order.
  perform 1 from public.shared_sheet_sessions
  where shop_id=p_shop_id and remote_id=any(v_ids)
  order by remote_id for update nowait;
  v_actual := app_private.wechat_history_normalization_plan_v1(p_shop_id,v_ids);
  if p_manifest is distinct from v_actual then
    raise exception 'history_normalization_manifest_mismatch' using errcode = '40001';
  end if;
  select count(*) into v_events from public.sync_events where shop_id=p_shop_id;
  for v_item in select value from jsonb_array_elements(v_actual->'rows') loop
    v_id := v_item->>'id';
    select app_private.wechat_history_normalization_clone_v1(data,'array'),
      app_private.wechat_history_normalization_clone_v1(session_overlay,'object')
    into v_data,v_overlay from public.shared_sheet_sessions
    where remote_id=v_id and shop_id=p_shop_id;
    select * into strict v_row from public.shared_sheet_sessions where remote_id=v_id and shop_id=p_shop_id;
    insert into app_private.wechat_history_normalization_marks
      (transaction_id,backend_pid,remote_id,shop_id,expected_updated_at,expected_row_sha256)
    values (pg_current_xact_id(),pg_backend_pid(),v_id,p_shop_id,v_row.updated_at,v_item->>'row_sha256');
    update public.shared_sheet_sessions set data=v_data,session_overlay=v_overlay
    where remote_id=v_id and shop_id=p_shop_id;
    if not found then raise exception 'history_normalization_update_missing'; end if;
    -- The trigger consumed the marker. Read persisted scalar storage first.
    if exists (select 1 from public.shared_sheet_sessions where remote_id=v_id and shop_id=p_shop_id
      and (pg_column_compression(data) is not null or pg_column_compression(session_overlay) is not null)) then
      raise exception 'history_normalization_storage_postcheck';
    end if;
    select * into strict v_row from public.shared_sheet_sessions where remote_id=v_id and shop_id=p_shop_id;
    v_hash := app_private.wechat_history_normalization_hash_v1(v_row);
    if v_hash is distinct from v_item->>'row_sha256' then
      raise exception 'history_normalization_hash_postcheck';
    end if;
    if exists (select 1 from app_private.wechat_history_normalization_marks
      where transaction_id=pg_current_xact_id() and backend_pid=pg_backend_pid()) then
      raise exception 'history_normalization_marker_not_consumed';
    end if;
    v_count := v_count + 1;
  end loop;
  select count(*) into v_after_events from public.sync_events where shop_id=p_shop_id;
  if v_count <> cardinality(v_ids) or v_events <> v_after_events then
    raise exception 'history_normalization_count_or_event_postcheck';
  end if;
  return jsonb_build_object('status','normalized','rows',v_count,'sync_events_added',0);
  -- Any error propagates; PostgreSQL rolls back all rows and marker writes.
end;
$$;
revoke all on function app_private.wechat_history_normalization_apply_v1(uuid,jsonb)
  from public, anon, authenticated, service_role;

commit;
