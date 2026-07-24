-- Cross-platform sync recovery contract.
--
-- New supported sync events are self-contained: every changed row has a
-- primary entity UUID in the event. Catalog/prices are bounded to 250 primary
-- IDs and history to 25. Recovery capabilities publish smaller per-entity
-- response-safe chunks; clients deterministically sub-chunk a valid event
-- without changing its event-level completeness. Direct trusted POS bulk
-- events are split before publication. The
-- NOT VALID constraint deliberately preserves historical compacted events;
-- clients must recover across those rows with a verified full snapshot rather
-- than inventing IDs or advancing a watermark early.

begin;

-- Fail fast instead of waiting indefinitely behind production DDL/DML.
-- This is an expand-only migration: legacy readers and writers remain
-- available until every deployed client has moved to the V6 boundaries.
set local lock_timeout = '5s';
set local statement_timeout = '15min';

-- Cheap varlena storage gates used before any potentially-expanding text or
-- JSONB operation.  Exact logical-size validation always follows this gate.
create or replace function app_private.sync_text_storage_is_bounded_v1(
  p_value text,
  p_uncompressed_limit integer,
  p_compressed_limit integer
)
returns boolean
language plpgsql
stable
strict
parallel safe
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_uncompressed_limit < 1 or p_compressed_limit < 0 then
    return false;
  end if;
  -- textoctetlen uses the TOAST raw-size metadata and does not need to
  -- decompress an external value.  It is therefore both exact and cheap.
  return pg_catalog.octet_length(p_value) <= p_uncompressed_limit;
end;
$$;

create or replace function app_private.sync_jsonb_storage_is_bounded_v1(
  p_value jsonb,
  p_uncompressed_limit integer,
  p_compressed_limit integer
)
returns boolean
language plpgsql
stable
strict
parallel safe
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_uncompressed_limit < 1 or p_compressed_limit <> 0 then
    return false;
  end if;
  -- Core PostgreSQL exposes no extension-free raw logical-size primitive for
  -- compressed JSONB.  Never detoast such a legacy value on a request path.
  -- The affected columns are set to STORAGE EXTERNAL below so future values
  -- remain uncompressed and can be bounded from their physical varlena size.
  if pg_catalog.pg_column_compression(p_value) is not null then
    return false;
  end if;
  return pg_catalog.pg_column_size(p_value) <= p_uncompressed_limit;
end;
$$;

alter table public.sync_events
  alter column entity_ids set storage external,
  alter column metadata set storage external;
alter table public.shared_sheet_sessions
  alter column data set storage external,
  alter column session_overlay set storage external;

create or replace function app_private.sync_event_entity_ids_are_complete(
  p_domain text,
  p_changed_count integer,
  p_entity_ids jsonb
)
returns boolean
language plpgsql
stable
security definer
parallel safe
set search_path = pg_catalog
as $$
declare
  v_allowed_keys text[];
  v_key text;
  v_value_count integer;
  v_unique_count integer;
  v_invalid_count integer;
  v_primary_count integer := 0;
  v_price_count integer := 0;
  v_price_product_count integer := 0;
  v_primary_limit integer;
begin
  v_primary_limit := case p_domain when 'history' then 25 else 250 end;

  if p_domain not in ('catalog', 'prices', 'history')
    or p_changed_count is null
    or p_changed_count < 0
    or p_changed_count > v_primary_limit then
    return false;
  end if;

  if p_entity_ids is null then
    return p_changed_count = 0;
  end if;

  if not app_private.sync_jsonb_storage_is_bounded_v1(
      p_entity_ids, 32768, 0
    ) then
    return false;
  end if;
  if jsonb_typeof(p_entity_ids) <> 'object' then
    return false;
  end if;

  v_allowed_keys := case p_domain
    when 'catalog' then array['supplier_ids', 'category_ids', 'product_ids']
    when 'prices' then array['price_ids', 'product_ids']
    when 'history' then array['session_ids']
  end;

  for v_key in select jsonb_object_keys(p_entity_ids)
  loop
    if not v_key = any(v_allowed_keys)
      or jsonb_typeof(p_entity_ids -> v_key) <> 'array' then
      return false;
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_entity_ids -> v_key) item(value)
      where jsonb_typeof(item.value) <> 'string'
    ) then
      return false;
    end if;

    select
      count(*)::integer,
      count(distinct lower(ids.value))::integer,
      count(*) filter (
        where ids.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )::integer
    into v_value_count, v_unique_count, v_invalid_count
    from jsonb_array_elements_text(p_entity_ids -> v_key) as ids(value);

    if v_value_count > v_primary_limit
      or v_unique_count <> v_value_count
      or v_invalid_count > 0 then
      return false;
    end if;

    if p_domain = 'catalog'
      or (p_domain = 'prices' and v_key = 'price_ids')
      or (p_domain = 'history' and v_key = 'session_ids') then
      v_primary_count := v_primary_count + v_value_count;
    end if;

    if p_domain = 'prices' and v_key = 'price_ids' then
      v_price_count := v_value_count;
    elsif p_domain = 'prices' and v_key = 'product_ids' then
      v_price_product_count := v_value_count;
    end if;
  end loop;

  if octet_length(p_entity_ids::text) > 16384 then
    return false;
  end if;

  return v_primary_count = p_changed_count
    and (
      p_domain <> 'prices'
      or (
        v_price_count = p_changed_count
        and (
          (p_changed_count = 0 and v_price_product_count = 0)
          or (
            p_changed_count > 0
            and v_price_product_count between 1 and v_price_count
          )
        )
      )
    );
exception
  when others then
    return false;
end;
$$;

revoke all on function app_private.sync_event_entity_ids_are_complete(text, integer, jsonb)
  from public, anon, authenticated;
grant execute on function app_private.sync_event_entity_ids_are_complete(text, integer, jsonb)
  to authenticated, service_role;

create or replace function app_private.sync_event_canonical_entity_ids_v1(
  p_entity_ids jsonb
)
returns jsonb
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select case
    when p_entity_ids is null then null
    else coalesce((
      select jsonb_object_agg(
        entry.key,
        coalesce((
          select jsonb_agg(lower(item.value) order by item.ordinality)
          from jsonb_array_elements_text(entry.value)
            with ordinality as item(value, ordinality)
        ), '[]'::jsonb)
      )
      from jsonb_each(p_entity_ids) entry
    ), '{}'::jsonb)
  end;
$$;

revoke all on function app_private.sync_event_canonical_entity_ids_v1(jsonb)
  from public, anon, authenticated, service_role;

create or replace function app_private.sync_event_type_is_supported(
  p_domain text,
  p_event_type text
)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select case p_domain
    when 'catalog' then p_event_type in ('catalog_changed', 'catalog_tombstone')
    when 'prices' then p_event_type = 'prices_changed'
    when 'history' then p_event_type in ('history_changed', 'history_tombstone')
    else false
  end;
$$;

create or replace function app_private.sync_event_metadata_is_redacted(
  p_metadata jsonb
)
returns boolean
language plpgsql
stable
security definer
parallel safe
set search_path = pg_catalog
as $$
declare
  v_key text;
  v_value jsonb;
begin
  if p_metadata is null then
    return true;
  end if;

  if not app_private.sync_jsonb_storage_is_bounded_v1(
      p_metadata, 8192, 0
    ) then
    return false;
  end if;
  if jsonb_typeof(p_metadata) <> 'object' then
    return false;
  end if;

  for v_key, v_value in
    select entry.key, entry.value
    from jsonb_each(p_metadata) entry
  loop
    case v_key
      when 'actor_kind' then
        if jsonb_typeof(v_value) <> 'string' then
          return false;
        end if;
        if v_value #>> '{}' not in ('personal_account', 'platform_admin') then
          return false;
        end if;
      when 'atomic_rpc', 'atomic_trigger', 'retention_floor' then
        if jsonb_typeof(v_value) <> 'boolean' then
          return false;
        end if;
      when 'catalog_scope' then
        if jsonb_typeof(v_value) <> 'string' then
          return false;
        end if;
        if v_value #>> '{}' not in (
            'shop_scoped',
            'legacy_owner_bridge',
            'authorized_shop_plus_legacy'
          ) then
          return false;
        end if;
      when 'chunk_count', 'chunk_index', 'chunked_from_count',
           'price_count', 'product_count', 'uploaded_count' then
        if jsonb_typeof(v_value) <> 'number' then
          return false;
        end if;
        if v_value < '0'::jsonb or v_value > '100000'::jsonb then
          return false;
        end if;
        if v_value #>> '{}' !~ '^[0-9]{1,6}$'
          or (v_value #>> '{}')::integer not between 0 and 100000 then
          return false;
        end if;
      when 'entity_type' then
        if jsonb_typeof(v_value) <> 'string' then
          return false;
        end if;
        if v_value #>> '{}' not in (
            'supplier',
            'category',
            'product',
            'product_price',
            'history_session'
          ) then
          return false;
        end if;
      when 'operation' then
        if jsonb_typeof(v_value) <> 'string' then
          return false;
        end if;
        if v_value #>> '{}' not in (
            'bulk_import',
            'insert',
            'update',
            'tombstone',
            'hard_delete',
            'image_finalize',
            'image_remove'
          ) then
          return false;
        end if;
      when 'payload_version' then
        if jsonb_typeof(v_value) <> 'number' then
          return false;
        end if;
        if v_value <> '1'::jsonb then
          return false;
        end if;
      when 'retained_through_id' then
        if jsonb_typeof(v_value) <> 'string' then
          return false;
        end if;
        if v_value #>> '{}' !~ '^(0|[1-9][0-9]{0,18})$' then
          return false;
        end if;
        begin
          perform (v_value #>> '{}')::bigint;
        exception when numeric_value_out_of_range then
          return false;
        end;
      when 'producer_epoch' then
        if jsonb_typeof(v_value) <> 'string' then
          return false;
        end if;
        if v_value #>> '{}' <>
            'database-atomic-complete-entity-ids-v1' then
          return false;
        end if;
      when 'source' then
        if jsonb_typeof(v_value) <> 'string' then
          return false;
        end if;
        if v_value #>> '{}' not in (
            'admin_web',
            'android',
            'database_atomic',
            'ios',
            'pos_catalog_import_sync',
            'product_image_api',
            'supplier_excel'
          ) then
          return false;
        end if;
      when 'status' then
        if jsonb_typeof(v_value) <> 'string' then
          return false;
        end if;
        if v_value #>> '{}' not in (
            'accepted',
            'duplicate',
            'noop',
            'success'
          ) then
          return false;
        end if;
      else
        return false;
    end case;
  end loop;

  if octet_length(p_metadata::text) > 4096 then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function app_private.sync_event_redacted_metadata(
  p_metadata jsonb
)
returns jsonb
language sql
stable
parallel safe
set search_path = pg_catalog
as $$
  select case
    when app_private.sync_event_metadata_is_redacted(p_metadata)
      then coalesce(p_metadata, '{}'::jsonb)
    else '{}'::jsonb
  end;
$$;

-- Retention-floor metadata is a reserved, database-authored protocol envelope.
-- Keep the table-level invariant exact as well as the public-RPC rejection so
-- a trusted direct writer cannot accidentally manufacture a marker that a
-- recovery client could treat as baseline-safe.
create or replace function app_private.sync_event_retention_envelope_is_valid_v1(
  p_id bigint,
  p_store_id uuid,
  p_domain text,
  p_event_type text,
  p_source text,
  p_source_device_id text,
  p_batch_id uuid,
  p_client_event_id text,
  p_changed_count integer,
  p_entity_ids jsonb,
  p_metadata jsonb,
  p_created_at timestamptz,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
stable
security definer
parallel safe
set search_path = pg_catalog
as $$
declare
  v_retained_through_id bigint;
begin
  if not coalesce(app_private.sync_jsonb_storage_is_bounded_v1(
      p_metadata, 8192, 0
    ), true)
    or not coalesce(app_private.sync_jsonb_storage_is_bounded_v1(
      p_entity_ids, 32768, 0
    ), true) then
    return false;
  end if;

  if not coalesce(p_metadata, '{}'::jsonb) ? 'retention_floor'
    and not coalesce(p_metadata, '{}'::jsonb) ? 'retained_through_id' then
    return true;
  end if;

  if jsonb_typeof(p_metadata) <> 'object'
    or (select count(*) from jsonb_object_keys(p_metadata)) <> 3
    or p_metadata->'retention_floor' <> 'true'::jsonb
    or p_metadata->'status' <> '"noop"'::jsonb
    or jsonb_typeof(p_metadata->'retained_through_id') <> 'string' then
    return false;
  end if;
  if coalesce(p_metadata->>'retained_through_id', '')
      !~ '^(0|[1-9][0-9]{0,18})$' then
    return false;
  end if;
  if p_metadata <> jsonb_build_object(
      'retention_floor', true,
      'retained_through_id', p_metadata->>'retained_through_id',
      'status', 'noop'
    )
    or p_id is null
    or p_store_id is not null
    or p_source_device_id is not null
    or p_batch_id is not null
    or p_source <> 'database_atomic'
    or p_changed_count <> 0
    or p_entity_ids is not null
    or coalesce(p_client_event_id, '')
      !~ '^retention-floor:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_event_type <> (case p_domain
      when 'catalog' then 'catalog_changed'
      when 'prices' then 'prices_changed'
      when 'history' then 'history_changed'
      else null
    end)
    or p_created_at is null
    or not isfinite(p_created_at)
    or p_expires_at is null
    or not isfinite(p_expires_at) then
    return false;
  end if;

  begin
    v_retained_through_id := (p_metadata->>'retained_through_id')::bigint;
  exception when numeric_value_out_of_range then
    return false;
  end;

  return v_retained_through_id >= 0
    and v_retained_through_id < p_id;
exception
  when others then
    return false;
end;
$$;

revoke all on function app_private.sync_event_type_is_supported(text, text)
  from public, anon, authenticated;
revoke all on function app_private.sync_event_metadata_is_redacted(jsonb)
  from public, anon, authenticated;
revoke all on function app_private.sync_event_redacted_metadata(jsonb)
  from public, anon, authenticated;
revoke all on function app_private.sync_event_retention_envelope_is_valid_v1(
  bigint, uuid, text, text, text, text, uuid, text, integer, jsonb, jsonb,
  timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function app_private.sync_event_type_is_supported(text, text)
  to authenticated, service_role;
grant execute on function app_private.sync_event_metadata_is_redacted(jsonb)
  to authenticated, service_role;
grant execute on function app_private.sync_event_retention_envelope_is_valid_v1(
  bigint, uuid, text, text, text, text, uuid, text, integer, jsonb, jsonb,
  timestamptz, timestamptz
) to authenticated, service_role;

-- The historical POS import RPC is intentionally left transactionally intact.
-- Its trusted direct insert can contain up to 1,000 products (and two prices
-- per product). Split only that known source before the table constraint is
-- evaluated, so no partially published oversized event can exist.
create or replace function app_private.split_pos_catalog_import_sync_event()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_primary_key text;
  v_chunk_size integer;
  v_primary_ids jsonb;
  v_primary_count integer;
  v_unique_count integer;
  v_invalid_count integer;
  v_chunk_ids jsonb;
  v_reference_product_ids jsonb;
  v_chunk_index integer;
  v_chunk_count integer;
  v_chunk_client_event_id text;
  v_chunk_entity_ids jsonb;
  v_chunk_metadata jsonb;
  v_existing public.sync_events%rowtype;
  v_existing_id bigint;
  v_existing_contract_safe boolean := false;
begin
  -- The splitter is an additive service-role producer boundary. Authenticated
  -- calls through the deployed record_sync_event RPC retain their historical
  -- insert/return behavior even if they use the same source label.
  if auth.role() is distinct from 'service_role'
    or new.source is distinct from 'pos_catalog_import_sync' then
    return new;
  end if;

  -- The trusted legacy POS producer may publish one unsplit envelope with up
  -- to 1,000 products or 2,000 prices (+1,000 product references). Bound and
  -- validate that envelope separately; every emitted chunk below must still
  -- satisfy the normal 32 KiB storage / 16 KiB logical event contract.
  if new.entity_ids is null
    or app_private.sync_jsonb_storage_is_bounded_v1(
      new.entity_ids, 262144, 0
    ) is not true
    or jsonb_typeof(new.entity_ids)<>'object' then
    raise exception 'POS sync event entity IDs require bounded storage'
      using errcode = '54000';
  end if;
  if new.domain='catalog' then
    if new.changed_count is null or new.changed_count not between 0 and 1000
      or (select count(*) from jsonb_object_keys(new.entity_ids))<>1
      or not (new.entity_ids?'product_ids')
      or (case when jsonb_typeof(new.entity_ids->'product_ids')='array'
        then jsonb_array_length(new.entity_ids->'product_ids')>1000
        else true end) then
      raise exception 'POS product event envelope is invalid'
        using errcode='22023';
    end if;
  elsif new.domain='prices' then
    if new.changed_count is null or new.changed_count not between 0 and 2000
      or (select count(*) from jsonb_object_keys(new.entity_ids)) not between 1 and 2
      or not (new.entity_ids?'price_ids')
      or exists(select 1 from jsonb_object_keys(new.entity_ids) key_name
        where key_name not in ('price_ids','product_ids'))
      or (case when jsonb_typeof(new.entity_ids->'price_ids')='array'
        then jsonb_array_length(new.entity_ids->'price_ids')>2000
        else true end)
      or (case when new.entity_ids?'product_ids' then case
        when jsonb_typeof(new.entity_ids->'product_ids')='array'
          then jsonb_array_length(new.entity_ids->'product_ids')>1000
        else true end
      else false end) then
      raise exception 'POS price event envelope is invalid'
        using errcode='22023';
    end if;
  else
    raise exception 'unsupported POS sync event domain/type'
      using errcode='22023';
  end if;
  if exists (
    select 1 from jsonb_each(new.entity_ids) entry
    cross join lateral jsonb_array_elements(entry.value) item(value)
    where jsonb_typeof(item.value)<>'string'
      or case when octet_length(item.value#>>'{}')=36
        then (item.value#>>'{}')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        else true end
  ) then
    raise exception 'POS sync event entity IDs must be UUID strings'
      using errcode='22023';
  end if;
  if not app_private.sync_event_metadata_is_redacted(new.metadata) then
    raise exception 'POS sync event metadata is outside the bounded contract'
      using errcode = '22023';
  end if;

  v_primary_key := case new.domain
    when 'catalog' then 'product_ids'
    when 'prices' then 'price_ids'
    else null
  end;
  -- A price chunk may also carry one auxiliary product UUID per price. One
  -- hundred pairs stays below the 16 KiB logical payload budget; 250 pairs do
  -- not. Catalog chunks contain only their primary product IDs.
  v_chunk_size := case new.domain when 'prices' then 100 else 250 end;

  if not app_private.sync_event_type_is_supported(new.domain, new.event_type) then
    raise exception 'unsupported POS sync event domain/type'
      using errcode = '22023';
  end if;

  -- The legacy producer attached all batch product IDs to a price event, even
  -- when only a subset of items had a price. Derive the references from the
  -- persisted price IDs for every batch size before validating the event.
  if new.domain = 'prices'
    and jsonb_typeof(new.entity_ids) = 'object'
    and jsonb_typeof(new.entity_ids -> 'price_ids') = 'array' then
    if exists (
      select 1
      from jsonb_array_elements(new.entity_ids -> 'price_ids') item(value)
      where jsonb_typeof(item.value) <> 'string'
    ) then
      raise exception 'POS price IDs must be UUID strings'
        using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(reference.product_id order by reference.product_id), '[]'::jsonb)
    into v_reference_product_ids
    from (
      select distinct price.product_id::text as product_id
      from public.inventory_product_prices price
      where price.id = any(
        array(
          select ids.value::uuid
          from jsonb_array_elements_text(new.entity_ids -> 'price_ids') ids(value)
          where ids.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
      )
    ) reference;

    new.entity_ids := jsonb_set(
      new.entity_ids,
      '{product_ids}',
      v_reference_product_ids,
      true
    );
  end if;

  if new.changed_count <= v_chunk_size then
    if not app_private.sync_event_entity_ids_are_complete(
      new.domain,
      new.changed_count,
      new.entity_ids
    ) then
      raise exception 'POS sync event entity IDs are incomplete'
        using errcode = '22023';
    end if;
    if not app_private.sync_event_entity_ids_belong_to_scope(
      new.domain,
      new.entity_ids,
      new.owner_user_id,
      new.shop_id
    ) then
      raise exception 'POS sync event scope is invalid'
        using errcode = '22023';
    end if;
    if not app_private.sync_event_entity_ids_match_operation(
      new.domain,
      new.event_type,
      new.entity_ids,
      new.owner_user_id,
      new.shop_id
    ) then
      raise exception 'POS sync event scope/operation is invalid'
        using errcode = '22023';
    end if;
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'producer_epoch', 'database-atomic-complete-entity-ids-v1'
    );
    return new;
  end if;

  if v_primary_key is null
    or jsonb_typeof(new.entity_ids) <> 'object'
    or jsonb_typeof(new.entity_ids -> v_primary_key) <> 'array' then
    return new;
  end if;

  v_primary_ids := new.entity_ids -> v_primary_key;

  if exists (
    select 1 from jsonb_array_elements(v_primary_ids) item(value)
    where jsonb_typeof(item.value) <> 'string'
  ) then
    return new;
  end if;

  select
    count(*)::integer,
    count(distinct lower(ids.value))::integer,
    count(*) filter (
      where ids.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )::integer
  into v_primary_count, v_unique_count, v_invalid_count
  from jsonb_array_elements_text(v_primary_ids) as ids(value);

  if v_primary_count <> new.changed_count
    or v_unique_count <> v_primary_count
    or v_invalid_count > 0 then
    return new;
  end if;

  v_chunk_count := ceil(v_primary_count / v_chunk_size::numeric)::integer;

  for v_chunk_index in 0..(v_chunk_count - 1)
  loop
    select jsonb_agg(ids.value order by ids.ordinality)
    into v_chunk_ids
    from jsonb_array_elements_text(v_primary_ids) with ordinality as ids(value, ordinality)
    where ids.ordinality > (v_chunk_index * v_chunk_size)
      and ids.ordinality <= ((v_chunk_index + 1) * v_chunk_size);

    v_reference_product_ids := null;
    if new.domain = 'prices' then
      select coalesce(jsonb_agg(reference.product_id order by reference.product_id), '[]'::jsonb)
      into v_reference_product_ids
      from (
        select distinct price.product_id::text as product_id
        from public.inventory_product_prices price
        where price.id = any(
          array(
            select ids.value::uuid
            from jsonb_array_elements_text(v_chunk_ids) as ids(value)
          )
        )
          and price.owner_user_id = new.owner_user_id
          and (
            price.shop_id = new.shop_id
            or (price.shop_id is null and new.shop_id is null)
          )
      ) as reference;
    end if;

    v_chunk_client_event_id := 'pos_catalog_import_chunk:' || md5(
      coalesce(new.client_event_id, '') || ':' ||
      v_chunk_index::text || ':' || v_chunk_ids::text
    );
    v_chunk_entity_ids := case
      when new.domain = 'prices' then
        jsonb_build_object(
          'price_ids', v_chunk_ids,
          'product_ids', v_reference_product_ids
        )
      else jsonb_build_object('product_ids', v_chunk_ids)
    end;
    v_chunk_metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'chunk_count', v_chunk_count,
      'chunk_index', v_chunk_index + 1,
      'chunked_from_count', v_primary_count,
      'producer_epoch', 'database-atomic-complete-entity-ids-v1'
    );

    if not app_private.sync_event_entity_ids_are_complete(
      new.domain,
      jsonb_array_length(v_chunk_ids),
      v_chunk_entity_ids
    ) then
      raise exception 'POS sync event chunk IDs are incomplete'
        using errcode = '22023';
    end if;
    if not app_private.sync_event_entity_ids_belong_to_scope(
      new.domain,
      v_chunk_entity_ids,
      new.owner_user_id,
      new.shop_id
    ) then
      raise exception 'POS sync event chunk scope is invalid'
        using errcode = '22023';
    end if;
    if not app_private.sync_event_entity_ids_match_operation(
      new.domain,
      new.event_type,
      v_chunk_entity_ids,
      new.owner_user_id,
      new.shop_id
    ) then
      raise exception 'POS sync event chunk scope/operation is invalid'
        using errcode = '22023';
    end if;

    begin
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
        metadata,
        created_at,
        expires_at
      )
      values (
        new.owner_user_id,
        new.shop_id,
        new.store_id,
        new.domain,
        new.event_type,
        new.source,
        new.source_device_id,
        new.batch_id,
        v_chunk_client_event_id,
        jsonb_array_length(v_chunk_ids),
        v_chunk_entity_ids,
        v_chunk_metadata,
        new.created_at,
        new.expires_at
      );
    exception
      when unique_violation then
        select
          event.id,
          app_private.sync_event_storage_is_bounded_v1(
            event.domain, event.event_type, event.source,
            event.source_device_id, event.client_event_id, event.entity_ids,
            event.metadata
          ) is true
          and app_private.sync_event_metadata_is_redacted(event.metadata) is true
          and app_private.sync_event_entity_ids_are_complete(
            event.domain, event.changed_count, event.entity_ids
          ) is true
        into v_existing_id, v_existing_contract_safe
        from public.sync_events event
        where event.owner_user_id = new.owner_user_id
          and event.client_event_id = v_chunk_client_event_id
          and event.shop_id is not distinct from new.shop_id;

        if not found
          or v_existing_contract_safe is not true then
          raise exception 'sync_event_client_event_id_conflict'
            using errcode = '23505';
        end if;
        select * into strict v_existing
        from public.sync_events event
        where event.id = v_existing_id;
        if v_existing.store_id is distinct from new.store_id
          or v_existing.domain is distinct from new.domain
          or v_existing.event_type is distinct from new.event_type
          or v_existing.source is distinct from new.source
          or v_existing.source_device_id is distinct from new.source_device_id
          or v_existing.batch_id is distinct from new.batch_id
          or v_existing.changed_count is distinct from jsonb_array_length(v_chunk_ids)
          or v_existing.entity_ids is distinct from v_chunk_entity_ids
          or v_existing.metadata is distinct from v_chunk_metadata then
          raise exception 'sync_event_client_event_id_conflict'
            using errcode = '23505';
        end if;
    end;
  end loop;

  return null;
end;
$$;

revoke all on function app_private.split_pos_catalog_import_sync_event()
  from public, anon, authenticated;

create or replace trigger split_pos_catalog_import_sync_event
  before insert on public.sync_events
  for each row
  execute function app_private.split_pos_catalog_import_sync_event();

-- Expand-only compatibility: keep legacy record_sync_event inserts byte-for-
-- byte compatible. The V6 RPC and database-atomic producers validate complete
-- IDs before INSERT; a table-wide CHECK would reject legacy traffic and
-- belongs in a later contract migration.

-- bigint identity values are allocated before row triggers run.  Every
-- supported producer therefore acquires a scope lock *before* INSERT.  Direct
-- shop rows and their one verified mapped-owner bridge resolve to the same
-- key, while unrelated shops keep independent commit lanes.  The row trigger
-- below rejects any trusted insert that forgot the pre-allocation fence.
create or replace function app_private.sync_event_scope_fence_key_v1(
  p_owner_user_id uuid,
  p_shop_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_shop_id is not null then 'shop:' || lower(p_shop_id::text)
    when mapped.shop_id is not null then 'shop:' || lower(mapped.shop_id::text)
    else 'owner:' || lower(p_owner_user_id::text)
  end
  from (select 1) singleton
  left join lateral (
    select source.shop_id
    from public.shop_inventory_sources source
    where p_shop_id is null
      and source.owner_user_id = p_owner_user_id
      and source.source_kind = 'mobile_owner'
      and source.mapping_state = 'mapped'
      and source.verified_at is not null
      and source.disabled_at is null
    order by source.created_at desc
    limit 1
  ) mapped on true
  where p_shop_id is not null or p_owner_user_id is not null;
$$;

create or replace function app_private.acquire_sync_event_scope_fence_v1(
  p_owner_user_id uuid,
  p_shop_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_scope_key text;
begin
  v_scope_key := app_private.sync_event_scope_fence_key_v1(
    p_owner_user_id,
    p_shop_id
  );

  if v_scope_key is null then
    raise exception 'sync event scope fence requires an owner identity'
      using errcode = '23502';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('sync_event_scope_fence_v1'),
    hashtext(v_scope_key)
  );
  perform set_config('app_private.sync_event_scope_fence', v_scope_key, true);
end;
$$;

create or replace function app_private.require_sync_event_scope_fence_v1()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_expected_scope_key text;
  v_retention_floor boolean := false;
begin
  v_expected_scope_key := app_private.sync_event_scope_fence_key_v1(
    new.owner_user_id,
    new.shop_id
  );

  if v_expected_scope_key is null
    or current_setting('app_private.sync_event_scope_fence', true)
      is distinct from v_expected_scope_key then
    raise exception 'sync_event_scope_fence_required'
      using errcode = '55000';
  end if;

  -- Event time is commit-lane/server authoritative. A trusted caller cannot
  -- backdate, future-date or use +/-infinity to escape the finite horizon or
  -- publish a timestamp that mobile clients cannot canonicalize.
  if app_private.sync_jsonb_storage_is_bounded_v1(
      coalesce(new.metadata, '{}'::jsonb), 8192, 0
    ) then
    if jsonb_typeof(coalesce(new.metadata, '{}'::jsonb)) = 'object' then
      v_retention_floor := new.metadata->'retention_floor' = 'true'::jsonb;
    end if;
  end if;
  new.created_at := statement_timestamp();
  new.expires_at := new.created_at + case
    when v_retention_floor then interval '180 days'
    else interval '90 days'
  end;

  return new;
end;
$$;

create or replace function app_private.lock_sync_event_visibility_transition_v1(
  p_old_owner_user_id uuid,
  p_old_shop_id uuid,
  p_new_owner_user_id uuid,
  p_new_shop_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_scope_key text;
begin
  for v_scope_key in
    select distinct candidate.scope_key
    from unnest(array[
      case when p_old_owner_user_id is null then null
        else 'owner:' || lower(p_old_owner_user_id::text) end,
      case when p_old_shop_id is null then null
        else 'shop:' || lower(p_old_shop_id::text) end,
      case when p_new_owner_user_id is null then null
        else 'owner:' || lower(p_new_owner_user_id::text) end,
      case when p_new_shop_id is null then null
        else 'shop:' || lower(p_new_shop_id::text) end
    ]) candidate(scope_key)
    where candidate.scope_key is not null
    order by candidate.scope_key
  loop
    perform pg_advisory_xact_lock(
      hashtext('sync_event_scope_fence_v1'),
      hashtext(v_scope_key)
    );
  end loop;
end;
$$;

revoke all on function app_private.sync_event_scope_fence_key_v1(uuid, uuid)
  from public, anon, authenticated;
revoke all on function app_private.acquire_sync_event_scope_fence_v1(uuid, uuid)
  from public, anon, authenticated;
revoke all on function app_private.require_sync_event_scope_fence_v1()
  from public, anon, authenticated;
revoke all on function app_private.lock_sync_event_visibility_transition_v1(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated;

-- Scope the guard to the new database-atomic source during expand. Legacy
-- record_sync_event callers predate the fence and keep publishing unchanged;
-- V6/database-atomic producers acquire it explicitly, and checkpoint readers
-- take the same fence before observing maxId or digests.
create or replace trigger sync_events_database_atomic_scope_fence_v1
  before insert on public.sync_events
  for each row
  when (new.source = 'database_atomic')
  execute function app_private.require_sync_event_scope_fence_v1();

-- These validations remain inside V6/database-atomic producers during expand.
-- NOT VALID constraints still apply to new legacy rows, so installing them
-- here would not be backward compatible.

-- Expand phase compatibility: authenticated SELECT and the existing Realtime
-- publication are intentionally preserved for legacy mobile releases.  A
-- future contract migration may revoke them only after deployment telemetry
-- proves that every supported client reads through the bounded V6 RPCs.
grant select on table public.sync_events to authenticated;

-- Recovery pages use UUID keyset pagination rather than updated_at windows.
-- Keep both exclusive scope modes bounded without replacing the existing
-- delta indexes used by normal incremental sync.
create index if not exists inventory_suppliers_shop_recovery_id_idx
  on public.inventory_suppliers (shop_id, id)
  where shop_id is not null;
create index if not exists inventory_suppliers_legacy_recovery_id_idx
  on public.inventory_suppliers (owner_user_id, id)
  where shop_id is null;

create index if not exists inventory_categories_shop_recovery_id_idx
  on public.inventory_categories (shop_id, id)
  where shop_id is not null;
create index if not exists inventory_categories_legacy_recovery_id_idx
  on public.inventory_categories (owner_user_id, id)
  where shop_id is null;

create index if not exists inventory_products_shop_recovery_id_idx
  on public.inventory_products (shop_id, id)
  where shop_id is not null;
create index if not exists inventory_products_legacy_recovery_id_idx
  on public.inventory_products (owner_user_id, id)
  where shop_id is null;

create index if not exists inventory_product_prices_shop_recovery_id_idx
  on public.inventory_product_prices (shop_id, id)
  where shop_id is not null;
create index if not exists inventory_product_prices_legacy_recovery_id_idx
  on public.inventory_product_prices (owner_user_id, id)
  where shop_id is null;

create index if not exists shared_sheet_sessions_shop_recovery_uuid_v2_idx
  on public.shared_sheet_sessions (
    shop_id,
    (case
      when octet_length(remote_id)=36 then case
        when remote_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then lower(remote_id)::uuid
        else null
      end
      else null
    end)
  )
  where shop_id is not null
    and case when octet_length(remote_id)=36
      then remote_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      else false end;
create index if not exists shared_sheet_sessions_legacy_recovery_uuid_v2_idx
  on public.shared_sheet_sessions (
    owner_user_id,
    (case
      when octet_length(remote_id)=36 then case
        when remote_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then lower(remote_id)::uuid
        else null
      end
      else null
    end)
  )
  where shop_id is null
    and case when octet_length(remote_id)=36
      then remote_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      else false end;
create index if not exists shared_sheet_sessions_shop_invalid_remote_uuid_v2_idx
  on public.shared_sheet_sessions(shop_id)
  where shop_id is not null and case when octet_length(remote_id)=36
    then remote_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    else true end;
create index if not exists shared_sheet_sessions_owner_invalid_remote_uuid_v2_idx
  on public.shared_sheet_sessions(owner_user_id)
  where shop_id is null and case when octet_length(remote_id)=36
    then remote_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    else true end;

create index if not exists sync_events_shop_recovery_id_idx
  on public.sync_events (shop_id, id)
  where shop_id is not null;
create index if not exists sync_events_legacy_recovery_id_idx
  on public.sync_events (owner_user_id, id)
  where shop_id is null;

-- Keep the nullable expires_at default unchanged during expand: deployed
-- record_sync_event callers must continue receiving the same composite row.

create index if not exists sync_events_shop_retention_v2_idx
  on public.sync_events (shop_id, domain, expires_at, id)
  where shop_id is not null
    and expires_at is not null;
create index if not exists sync_events_legacy_retention_v2_idx
  on public.sync_events (owner_user_id, domain, expires_at, id)
  where shop_id is null
    and expires_at is not null;
create index if not exists sync_events_shop_legacy_expiry_v2_idx
  on public.sync_events (shop_id, domain, created_at, id)
  where shop_id is not null
    and expires_at is null;
create index if not exists sync_events_owner_legacy_expiry_v1_idx
  on public.sync_events (owner_user_id, domain, created_at, id)
  where shop_id is null
    and expires_at is null;
create index if not exists sync_events_shop_retention_floor_v1_idx
  on public.sync_events (shop_id, domain, id desc)
  where shop_id is not null;
create index if not exists sync_events_owner_retention_floor_v1_idx
  on public.sync_events (owner_user_id, domain, id desc)
  where shop_id is null;

create or replace function app_private.sync_event_is_retention_floor_v1(
  p_domain text,
  p_event_type text,
  p_source text,
  p_source_device_id text,
  p_client_event_id text,
  p_entity_ids jsonb,
  p_metadata jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if not app_private.sync_event_storage_is_bounded_v1(
      p_domain, p_event_type, p_source, p_source_device_id,
      p_client_event_id, p_entity_ids, p_metadata
    ) then
    return false;
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    return false;
  end if;
  return p_metadata->'retention_floor' = 'true'::jsonb;
exception when others then
  return false;
end;
$$;

revoke all on function app_private.sync_event_is_retention_floor_v1(
  text, text, text, text, text, jsonb, jsonb
) from public, anon, authenticated, service_role;

-- Retention is enforced per already-fenced physical event scope. Before any
-- expired rows disappear, an intentionally non-incremental zero-row marker is
-- inserted in that same scope. A stale cursor therefore requires one durable
-- full snapshot; a successfully verified snapshot baselines beyond the marker
-- and cannot loop on deleted legacy history. Cleanup is bounded and idempotent.
create or replace function app_private.maintain_sync_event_retention_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_candidate_ids bigint[];
  v_candidate_max_id bigint;
  v_latest_marker_candidate_id bigint;
  v_latest_marker_id bigint;
  v_latest_marker_store_id uuid;
  v_latest_marker_domain text;
  v_latest_marker_event_type text;
  v_latest_marker_source text;
  v_latest_marker_source_device_id text;
  v_latest_marker_batch_id uuid;
  v_latest_marker_client_event_id text;
  v_latest_marker_changed_count integer;
  v_latest_marker_entity_ids jsonb;
  v_latest_marker_metadata jsonb;
  v_latest_marker_created_at timestamptz;
  v_latest_marker_expires_at timestamptz;
  v_has_latest_marker boolean := false;
  v_existing_marker_id bigint;
  v_existing_floor_id bigint;
  v_marker_floor_id bigint;
  v_marker_id bigint;
  v_stale_marker_ids bigint[];
  v_stale_marker_max_id bigint;
  v_event_type text;
  v_retention_key text;
  v_checked_scopes text;
begin
  if app_private.sync_event_is_retention_floor_v1(
      new.domain, new.event_type, new.source, new.source_device_id,
      new.client_event_id, new.entity_ids, new.metadata
    ) then
    return null;
  end if;

  v_retention_key := md5(
    case
      when new.shop_id is null
        then 'owner:' || lower(new.owner_user_id::text)
      else 'shop:' || lower(new.shop_id::text)
    end || ':' || new.domain
  );
  v_checked_scopes := coalesce(
    current_setting('app_private.sync_event_retention_checked_v1', true),
    ''
  );
  if position('|' || v_retention_key || '|' in v_checked_scopes) > 0 then
    return null;
  end if;
  perform set_config(
    'app_private.sync_event_retention_checked_v1',
    v_checked_scopes || '|' || v_retention_key || '|',
    true
  );

  if new.shop_id is null then
    select
      array_agg(candidate.id order by candidate.expires_at, candidate.id),
      max(candidate.id)
    into v_candidate_ids, v_candidate_max_id
    from (
      select bounded.id, bounded.expires_at
      from (
        (
          select event.id, event.expires_at
          from public.sync_events event
          where event.owner_user_id = new.owner_user_id
            and event.shop_id is null
            and event.domain = new.domain
            and event.expires_at is not null
            and event.expires_at <= clock_timestamp()
          order by event.expires_at, event.id
          limit 1000
        )
        union all
        (
          select event.id, event.created_at + interval '90 days' as expires_at
          from public.sync_events event
          where event.owner_user_id = new.owner_user_id
            and event.shop_id is null
            and event.domain = new.domain
            and event.expires_at is null
            and event.created_at <= clock_timestamp() - interval '90 days'
          order by event.created_at, event.id
          limit 1000
        )
      ) bounded
      order by bounded.expires_at, bounded.id
      limit 1000
    ) candidate;
  else
    select
      array_agg(candidate.id order by candidate.expires_at, candidate.id),
      max(candidate.id)
    into v_candidate_ids, v_candidate_max_id
    from (
      select bounded.id, bounded.expires_at
      from (
        (
          select event.id, event.expires_at
          from public.sync_events event
          where event.shop_id = new.shop_id
            and event.domain = new.domain
            and event.expires_at is not null
            and event.expires_at <= clock_timestamp()
          order by event.expires_at, event.id
          limit 1000
        )
        union all
        (
          select event.id, event.created_at + interval '90 days' as expires_at
          from public.sync_events event
          where event.shop_id = new.shop_id
            and event.domain = new.domain
            and event.expires_at is null
            and event.created_at <= clock_timestamp() - interval '90 days'
          order by event.created_at, event.id
          limit 1000
        )
      ) bounded
      order by bounded.expires_at, bounded.id
      limit 1000
    ) candidate;
  end if;

  -- Inspect only the newest raw marker-shaped row. This stays index-bounded
  -- even if a pre-contract deployment left many malformed rows. If it is not
  -- canonical, a newer canonical marker is created below before any stale row
  -- is removed.
  if new.shop_id is null then
    select candidate.id
    into v_latest_marker_candidate_id
    from (
      select marker.id
      from public.sync_events marker
      where marker.owner_user_id = new.owner_user_id
        and marker.shop_id is null
        and marker.domain = new.domain
      order by marker.id desc
      limit 1000
    ) candidate
    join public.sync_events marker on marker.id = candidate.id
    where app_private.sync_event_is_retention_floor_v1(
      marker.domain, marker.event_type, marker.source,
      marker.source_device_id, marker.client_event_id, marker.entity_ids,
      marker.metadata
    )
    order by candidate.id desc
    limit 1
    ;
  else
    select candidate.id
    into v_latest_marker_candidate_id
    from (
      select marker.id
      from public.sync_events marker
      where marker.shop_id = new.shop_id
        and marker.domain = new.domain
      order by marker.id desc
      limit 1000
    ) candidate
    join public.sync_events marker on marker.id = candidate.id
    where app_private.sync_event_is_retention_floor_v1(
      marker.domain, marker.event_type, marker.source,
      marker.source_device_id, marker.client_event_id, marker.entity_ids,
      marker.metadata
    )
    order by candidate.id desc
    limit 1
    ;
  end if;
  v_has_latest_marker := v_latest_marker_candidate_id is not null;
  if v_has_latest_marker then
    select
      marker.id, marker.store_id, marker.domain, marker.event_type,
      marker.source, marker.source_device_id, marker.batch_id,
      marker.client_event_id, marker.changed_count, marker.entity_ids,
      marker.metadata, marker.created_at, marker.expires_at
    into
      v_latest_marker_id, v_latest_marker_store_id, v_latest_marker_domain,
      v_latest_marker_event_type, v_latest_marker_source,
      v_latest_marker_source_device_id, v_latest_marker_batch_id,
      v_latest_marker_client_event_id, v_latest_marker_changed_count,
      v_latest_marker_entity_ids, v_latest_marker_metadata,
      v_latest_marker_created_at, v_latest_marker_expires_at
    from public.sync_events marker
    where marker.id = v_latest_marker_candidate_id
    for update;
  end if;

  if v_has_latest_marker
    and app_private.sync_event_retention_envelope_is_valid_v1(
      v_latest_marker_id,
      v_latest_marker_store_id,
      v_latest_marker_domain,
      v_latest_marker_event_type,
      v_latest_marker_source,
      v_latest_marker_source_device_id,
      v_latest_marker_batch_id,
      v_latest_marker_client_event_id,
      v_latest_marker_changed_count,
      v_latest_marker_entity_ids,
      v_latest_marker_metadata,
      v_latest_marker_created_at,
      v_latest_marker_expires_at
    ) then
    v_existing_marker_id := v_latest_marker_id;
    v_existing_floor_id :=
      (v_latest_marker_metadata->>'retained_through_id')::bigint;
  end if;

  if (v_candidate_ids is null or cardinality(v_candidate_ids) = 0)
    and not v_has_latest_marker then
    return null;
  end if;

  v_event_type := case new.domain
    when 'catalog' then 'catalog_changed'
    when 'prices' then 'prices_changed'
    when 'history' then 'history_changed'
    else null
  end;
  if v_event_type is null then
    raise exception 'unsupported sync-event retention domain'
      using errcode = '22023';
  end if;

  if v_existing_marker_id is not null
    and (
      v_candidate_max_id is null
      or v_candidate_max_id < v_existing_marker_id
    ) then
    v_marker_id := v_existing_marker_id;
    v_marker_floor_id := v_existing_floor_id;
  else
    v_marker_floor_id := greatest(
      coalesce(v_candidate_max_id, 0),
      case when v_has_latest_marker then v_latest_marker_id else 0 end
    );
    insert into public.sync_events (
      owner_user_id, shop_id, domain, event_type, source,
      client_event_id, changed_count, entity_ids, metadata,
      expires_at
    ) values (
      new.owner_user_id, new.shop_id, new.domain, v_event_type,
      'database_atomic',
      'retention-floor:' || gen_random_uuid()::text,
      0, null,
      jsonb_build_object(
        'retention_floor', true,
        'retained_through_id', v_marker_floor_id::text,
        'status', 'noop'
      ),
      now() + interval '180 days'
    ) returning id into v_marker_id;
  end if;

  -- Historical deployments did not enforce a unique marker envelope. Fold a
  -- bounded stale batch into the survivor before deleting it. Every stale row
  -- ID is itself a conservative recovery boundary, so a malformed changed row
  -- or an older canonical floor can never disappear from durable knowledge.
  if new.shop_id is null then
    select
      array_agg(stale_marker.id order by stale_marker.id),
      max(stale_marker.id)
    into v_stale_marker_ids, v_stale_marker_max_id
    from (
      select marker.id
      from (
        select candidate.id
        from public.sync_events candidate
        where candidate.owner_user_id = new.owner_user_id
          and candidate.shop_id is null
          and candidate.domain = new.domain
          and candidate.id <> v_marker_id
        order by candidate.id desc
        limit 1000
      ) bounded
      join public.sync_events marker on marker.id = bounded.id
      where app_private.sync_event_is_retention_floor_v1(
        marker.domain, marker.event_type, marker.source,
        marker.source_device_id, marker.client_event_id, marker.entity_ids,
        marker.metadata
      )
      order by marker.id
      for update of marker skip locked
    ) stale_marker;
  else
    select
      array_agg(stale_marker.id order by stale_marker.id),
      max(stale_marker.id)
    into v_stale_marker_ids, v_stale_marker_max_id
    from (
      select marker.id
      from (
        select candidate.id
        from public.sync_events candidate
        where candidate.shop_id = new.shop_id
          and candidate.domain = new.domain
          and candidate.id <> v_marker_id
        order by candidate.id desc
        limit 1000
      ) bounded
      join public.sync_events marker on marker.id = bounded.id
      where app_private.sync_event_is_retention_floor_v1(
        marker.domain, marker.event_type, marker.source,
        marker.source_device_id, marker.client_event_id, marker.entity_ids,
        marker.metadata
      )
      order by marker.id
      for update of marker skip locked
    ) stale_marker;
  end if;

  v_marker_floor_id := greatest(
    coalesce(v_marker_floor_id, 0),
    coalesce(v_candidate_max_id, 0),
    coalesce(v_stale_marker_max_id, 0)
  );
  if v_marker_floor_id >= v_marker_id then
    raise exception 'sync_event_retention_floor_order_invalid'
      using errcode = '55000';
  end if;

  update public.sync_events marker
  set metadata = jsonb_build_object(
        'retention_floor', true,
        'retained_through_id', v_marker_floor_id::text,
        'status', 'noop'
      ),
      expires_at = now() + interval '180 days'
  where marker.id = v_marker_id;

  if v_stale_marker_ids is not null then
    delete from public.sync_events marker
    where marker.id = any(v_stale_marker_ids);
  end if;

  if v_candidate_ids is not null then
    delete from public.sync_events event
    where event.id = any(v_candidate_ids);
  end if;

  return null;
end;
$$;

revoke all on function app_private.maintain_sync_event_retention_v1()
  from public, anon, authenticated, service_role;

-- Retention helpers and additive indexes ship in expand, but the table-wide
-- deletion trigger is intentionally deferred until legacy writer retirement.

create or replace function app_private.sync_event_row_matches_scope_v1(
  p_row_owner_user_id uuid,
  p_row_shop_id uuid,
  p_event_owner_user_id uuid,
  p_event_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (
      p_event_shop_id is not null
      and p_row_shop_id = p_event_shop_id
    )
    or (
      p_row_shop_id is null
      and p_row_owner_user_id = p_event_owner_user_id
      and (
        p_event_shop_id is null
        or (
          exists (
            select 1
            from public.shop_inventory_sources source
            where source.shop_id = p_event_shop_id
              and source.owner_user_id = p_event_owner_user_id
              and source.mapping_state = 'mapped'
              and source.verified_at is not null
              and pg_catalog.isfinite(source.created_at)
              and pg_catalog.isfinite(source.verified_at)
              and source.disabled_at is null
          )
          and not exists (
            select 1
            from public.shop_inventory_sources source
            where source.shop_id = p_event_shop_id
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
          )
        )
      )
    );
$$;

revoke all on function app_private.sync_event_row_matches_scope_v1(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated;

-- Relation UUIDs embedded in a row/event must belong to the same authorized
-- shop union, not merely exist. For a shop event the actor may be a manager,
-- while mapped legacy parents remain owned by the canonical mobile owner; the
-- mapping, rather than the event actor, is therefore authoritative here.
create or replace function app_private.sync_relation_row_matches_event_scope_v1(
  p_row_owner_user_id uuid,
  p_row_shop_id uuid,
  p_event_owner_user_id uuid,
  p_event_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_event_shop_id is null then
      p_row_shop_id is null
      and p_row_owner_user_id = p_event_owner_user_id
    else
      p_row_shop_id = p_event_shop_id
      or (
        p_row_shop_id is null
        and exists (
          select 1
          from public.shop_inventory_sources source
          where source.shop_id = p_event_shop_id
            and source.owner_user_id = p_row_owner_user_id
            and source.mapping_state = 'mapped'
            and source.verified_at is not null
            and pg_catalog.isfinite(source.created_at)
            and pg_catalog.isfinite(source.verified_at)
            and source.disabled_at is null
        )
        and not exists (
          select 1
          from public.shop_inventory_sources source
          where source.shop_id = p_event_shop_id
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
        )
      )
  end;
$$;

revoke all on function app_private.sync_relation_row_matches_event_scope_v1(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated;

create or replace function app_private.sync_event_entity_ids_belong_to_scope(
  p_domain text,
  p_entity_ids jsonb,
  p_owner_user_id uuid,
  p_shop_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_expected integer;
  v_actual integer;
  v_expected_product_ids text[];
  v_actual_product_ids text[];
begin
  if p_entity_ids is null then
    return true;
  end if;

  if p_domain = 'catalog' then
    if p_entity_ids ? 'supplier_ids' then
      v_expected := jsonb_array_length(p_entity_ids->'supplier_ids');
      select count(*)::integer into v_actual
      from public.inventory_suppliers row
      where lower(row.id::text) = any(
        array(
          select lower(id.value)
          from jsonb_array_elements_text(p_entity_ids->'supplier_ids') id(value)
        )
      )
        and app_private.sync_event_row_matches_scope_v1(
          row.owner_user_id,
          row.shop_id,
          p_owner_user_id,
          p_shop_id
        )
        and pg_catalog.isfinite(row.updated_at)
        and (row.deleted_at is null or pg_catalog.isfinite(row.deleted_at));
      if v_actual <> v_expected then return false; end if;
    end if;

    if p_entity_ids ? 'category_ids' then
      v_expected := jsonb_array_length(p_entity_ids->'category_ids');
      select count(*)::integer into v_actual
      from public.inventory_categories row
      where lower(row.id::text) = any(
        array(
          select lower(id.value)
          from jsonb_array_elements_text(p_entity_ids->'category_ids') id(value)
        )
      )
        and app_private.sync_event_row_matches_scope_v1(
          row.owner_user_id,
          row.shop_id,
          p_owner_user_id,
          p_shop_id
        )
        and pg_catalog.isfinite(row.updated_at)
        and (row.deleted_at is null or pg_catalog.isfinite(row.deleted_at));
      if v_actual <> v_expected then return false; end if;
    end if;

    if p_entity_ids ? 'product_ids' then
      v_expected := jsonb_array_length(p_entity_ids->'product_ids');
      select count(*)::integer into v_actual
      from public.inventory_products row
      where lower(row.id::text) = any(
        array(
          select lower(id.value)
          from jsonb_array_elements_text(p_entity_ids->'product_ids') id(value)
        )
      )
        and app_private.sync_event_row_matches_scope_v1(
          row.owner_user_id,
          row.shop_id,
          p_owner_user_id,
          p_shop_id
        )
        and pg_catalog.isfinite(row.updated_at)
        and (row.deleted_at is null or pg_catalog.isfinite(row.deleted_at))
        and (
          row.primary_image_updated_at is null
          or pg_catalog.isfinite(row.primary_image_updated_at)
        );
      if v_actual <> v_expected then return false; end if;

      -- Active product DTOs expose parent and primary-image UUIDs. Every one
      -- must resolve inside the same authorized shop union before the event is
      -- eligible for incremental apply. Tombstones strip these relations.
      select count(*)::integer into v_actual
      from public.inventory_products row
      where lower(row.id::text) = any(
        array(
          select lower(id.value)
          from jsonb_array_elements_text(p_entity_ids->'product_ids') id(value)
        )
      )
        and app_private.sync_event_row_matches_scope_v1(
          row.owner_user_id,
          row.shop_id,
          p_owner_user_id,
          p_shop_id
        )
        and (
          row.deleted_at is not null
          or (
            (row.category_id is null or exists (
              select 1 from public.inventory_categories category
              where category.id = row.category_id
                and category.deleted_at is null
                and pg_catalog.isfinite(category.updated_at)
                and app_private.sync_relation_row_matches_event_scope_v1(
                  category.owner_user_id, category.shop_id,
                  p_owner_user_id, p_shop_id
                )
            ))
            and (row.supplier_id is null or exists (
              select 1 from public.inventory_suppliers supplier
              where supplier.id = row.supplier_id
                and supplier.deleted_at is null
                and pg_catalog.isfinite(supplier.updated_at)
                and app_private.sync_relation_row_matches_event_scope_v1(
                  supplier.owner_user_id, supplier.shop_id,
                  p_owner_user_id, p_shop_id
                )
            ))
            and (row.primary_image_version_id is null or exists (
              select 1
              from public.inventory_product_image_versions version
              where version.id = row.primary_image_version_id
                and version.product_id = row.id
                and version.status = 'ready'
                and version.removed_at is null
                and pg_catalog.isfinite(version.created_at)
                and pg_catalog.isfinite(version.expires_at)
                and (
                  version.finalized_at is null
                  or pg_catalog.isfinite(version.finalized_at)
                )
                and (
                  (row.shop_id is not null and version.shop_id = row.shop_id)
                  or (
                    row.shop_id is null
                    and exists (
                      select 1
                      from public.shop_inventory_sources source
                      where source.shop_id = version.shop_id
                        and source.owner_user_id = row.owner_user_id
                        and source.mapping_state = 'mapped'
                        and source.verified_at is not null
                        and pg_catalog.isfinite(source.created_at)
                        and pg_catalog.isfinite(source.verified_at)
                        and source.disabled_at is null
                    )
                  )
                )
            ))
          )
        );
      if v_actual <> v_expected then return false; end if;
    end if;
  elsif p_domain = 'prices' then
    v_expected := jsonb_array_length(p_entity_ids->'price_ids');
    select count(*)::integer into v_actual
    from public.inventory_product_prices row
    where lower(row.id::text) = any(
      array(
        select lower(id.value)
        from jsonb_array_elements_text(p_entity_ids->'price_ids') id(value)
      )
    )
      and app_private.sync_event_row_matches_scope_v1(
          row.owner_user_id,
          row.shop_id,
          p_owner_user_id,
          p_shop_id
        )
      and pg_catalog.isfinite(row.updated_at);
    if v_actual <> v_expected then return false; end if;

    select count(*)::integer into v_actual
    from public.inventory_product_prices price_row
    join public.inventory_products product
      on product.id = price_row.product_id
    where lower(price_row.id::text) = any(
      array(
        select lower(id.value)
        from jsonb_array_elements_text(p_entity_ids->'price_ids') id(value)
      )
    )
      and app_private.sync_event_row_matches_scope_v1(
        price_row.owner_user_id,
        price_row.shop_id,
        p_owner_user_id,
        p_shop_id
      )
      and app_private.sync_relation_row_matches_event_scope_v1(
        product.owner_user_id,
        product.shop_id,
        p_owner_user_id,
        p_shop_id
      )
      and pg_catalog.isfinite(product.updated_at)
      and (product.deleted_at is null or pg_catalog.isfinite(product.deleted_at));
    if v_actual <> v_expected then return false; end if;

    if p_entity_ids ? 'product_ids' then
      select array_agg(lower(id.value) order by lower(id.value))
      into v_expected_product_ids
      from jsonb_array_elements_text(p_entity_ids->'product_ids') id(value);

      select array_agg(distinct lower(row.product_id::text) order by lower(row.product_id::text))
      into v_actual_product_ids
      from public.inventory_product_prices row
      where lower(row.id::text) = any(
        array(
          select lower(id.value)
          from jsonb_array_elements_text(p_entity_ids->'price_ids') id(value)
        )
      )
        and app_private.sync_event_row_matches_scope_v1(
          row.owner_user_id,
          row.shop_id,
          p_owner_user_id,
          p_shop_id
        );

      if coalesce(v_expected_product_ids, array[]::text[])
        <> coalesce(v_actual_product_ids, array[]::text[]) then
        return false;
      end if;
    end if;
  elsif p_domain = 'history' then
    v_expected := jsonb_array_length(p_entity_ids->'session_ids');
    select count(*)::integer into v_actual
    from public.shared_sheet_sessions row
    where case when octet_length(row.remote_id)=36 then case
      when row.remote_id
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then lower(row.remote_id)::uuid = any(array(
          select lower(id.value)::uuid
          from jsonb_array_elements_text(p_entity_ids->'session_ids') id(value)
        ))
      else false end
    else false end
      and app_private.sync_event_row_matches_scope_v1(
          row.owner_user_id,
          row.shop_id,
          p_owner_user_id,
          p_shop_id
        )
      and pg_catalog.isfinite(row.updated_at)
      and (row.deleted_at is null or pg_catalog.isfinite(row.deleted_at));
    if v_actual <> v_expected then return false; end if;
  else
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function app_private.sync_event_entity_ids_match_operation(
  p_domain text,
  p_event_type text,
  p_entity_ids jsonb,
  p_owner_user_id uuid,
  p_shop_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_expected integer := 0;
  v_actual integer := 0;
  v_requires_tombstone boolean;
begin
  if not app_private.sync_event_type_is_supported(p_domain, p_event_type) then
    return false;
  end if;

  if p_entity_ids is null then
    return true;
  end if;

  if not app_private.sync_event_entity_ids_belong_to_scope(
    p_domain,
    p_entity_ids,
    p_owner_user_id,
    p_shop_id
  ) then
    return false;
  end if;

  if p_domain = 'prices' then
    return p_event_type = 'prices_changed';
  end if;

  v_requires_tombstone := p_event_type in ('catalog_tombstone', 'history_tombstone');

  if p_domain = 'catalog' then
    v_expected :=
      jsonb_array_length(coalesce(p_entity_ids->'supplier_ids', '[]'::jsonb)) +
      jsonb_array_length(coalesce(p_entity_ids->'category_ids', '[]'::jsonb)) +
      jsonb_array_length(coalesce(p_entity_ids->'product_ids', '[]'::jsonb));

    select count(*)::integer into v_actual
    from (
      select supplier.deleted_at
      from public.inventory_suppliers supplier
      where lower(supplier.id::text) = any(array(
        select lower(id.value)
        from jsonb_array_elements_text(coalesce(p_entity_ids->'supplier_ids', '[]'::jsonb)) id(value)
      )) and app_private.sync_event_row_matches_scope_v1(
        supplier.owner_user_id,
        supplier.shop_id,
        p_owner_user_id,
        p_shop_id
      )
      union all
      select category.deleted_at
      from public.inventory_categories category
      where lower(category.id::text) = any(array(
        select lower(id.value)
        from jsonb_array_elements_text(coalesce(p_entity_ids->'category_ids', '[]'::jsonb)) id(value)
      )) and app_private.sync_event_row_matches_scope_v1(
        category.owner_user_id,
        category.shop_id,
        p_owner_user_id,
        p_shop_id
      )
      union all
      select product.deleted_at
      from public.inventory_products product
      where lower(product.id::text) = any(array(
        select lower(id.value)
        from jsonb_array_elements_text(coalesce(p_entity_ids->'product_ids', '[]'::jsonb)) id(value)
      )) and app_private.sync_event_row_matches_scope_v1(
        product.owner_user_id,
        product.shop_id,
        p_owner_user_id,
        p_shop_id
      )
    ) scoped_rows
    where (v_requires_tombstone and scoped_rows.deleted_at is not null)
      or (not v_requires_tombstone and scoped_rows.deleted_at is null);

    return v_actual = v_expected;
  end if;

  if p_domain = 'history' then
    v_expected := jsonb_array_length(coalesce(p_entity_ids->'session_ids', '[]'::jsonb));
    select count(*)::integer into v_actual
    from public.shared_sheet_sessions session
    where case when octet_length(session.remote_id)=36 then case
      when session.remote_id
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then lower(session.remote_id)::uuid = any(array(
          select lower(id.value)::uuid
          from jsonb_array_elements_text(
            coalesce(p_entity_ids->'session_ids','[]'::jsonb)
          ) id(value)
        ))
      else false end
    else false end and app_private.sync_event_row_matches_scope_v1(
        session.owner_user_id,
        session.shop_id,
        p_owner_user_id,
        p_shop_id
      ) and (
      (v_requires_tombstone and session.deleted_at is not null)
      or (not v_requires_tombstone and session.deleted_at is null)
    );

    return v_actual = v_expected;
  end if;

  return false;
exception
  when others then
    return false;
end;
$$;

create or replace function app_private.sync_event_storage_is_bounded_v1(
  p_domain text,
  p_event_type text,
  p_source text,
  p_source_device_id text,
  p_client_event_id text,
  p_entity_ids jsonb,
  p_metadata jsonb
)
returns boolean
language plpgsql
stable
security definer
parallel safe
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_domain is null or app_private.sync_text_storage_is_bounded_v1(
      p_domain, 64, 0
    ) is not true then
    return false;
  end if;
  if p_event_type is null or app_private.sync_text_storage_is_bounded_v1(
      p_event_type, 96, 0
    ) is not true then
    return false;
  end if;
  if not coalesce(app_private.sync_text_storage_is_bounded_v1(
      p_source, 164, 0
    ), true) then
    return false;
  end if;
  if not coalesce(app_private.sync_text_storage_is_bounded_v1(
      p_source_device_id, 324, 0
    ), true) then
    return false;
  end if;
  if not coalesce(app_private.sync_text_storage_is_bounded_v1(
      p_client_event_id, 324, 0
    ), true) then
    return false;
  end if;
  if not coalesce(app_private.sync_jsonb_storage_is_bounded_v1(
      p_entity_ids, 32768, 0
    ), true) then
    return false;
  end if;
  return coalesce(app_private.sync_jsonb_storage_is_bounded_v1(
    p_metadata, 8192, 0
  ), true);
end;
$$;

revoke all on function app_private.sync_event_storage_is_bounded_v1(
  text, text, text, text, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function app_private.sync_event_storage_is_bounded_v1(
  text, text, text, text, text, jsonb, jsonb
) to authenticated, service_role;

-- V6/database-atomic producers enforce this storage envelope in-function.
-- A NOT VALID table constraint would still reject new legacy writes.

create or replace function app_private.sync_event_is_incrementally_safe_v1(
  p_owner_user_id uuid,
  p_shop_id uuid,
  p_domain text,
  p_event_type text,
  p_source text,
  p_source_device_id text,
  p_client_event_id text,
  p_changed_count integer,
  p_entity_ids jsonb,
  p_created_at timestamptz,
  p_expires_at timestamptz,
  p_metadata jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if not app_private.sync_event_storage_is_bounded_v1(
      p_domain, p_event_type, p_source, p_source_device_id,
      p_client_event_id, p_entity_ids, p_metadata
    ) then
    return false;
  end if;

  if not pg_catalog.isfinite(p_created_at)
    or (
      p_expires_at is not null
      and not pg_catalog.isfinite(p_expires_at)
    ) then
    return false;
  end if;

  if not app_private.sync_event_metadata_is_redacted(p_metadata) then
    return false;
  end if;

  if p_metadata->'retention_floor' = 'true'::jsonb then
    return false;
  end if;

  if not app_private.sync_event_type_is_supported(
      p_domain,
      p_event_type
    )
    or not app_private.sync_event_entity_ids_are_complete(
      p_domain,
      p_changed_count,
      p_entity_ids
    ) then
    return false;
  end if;

  if app_private.sync_event_entity_ids_belong_to_scope(
      p_domain,
      p_entity_ids,
      p_owner_user_id,
      p_shop_id
    )
    and (
      p_metadata->>'producer_epoch' =
        'database-atomic-complete-entity-ids-v1'
      or app_private.sync_event_entity_ids_match_operation(
        p_domain,
        p_event_type,
        p_entity_ids,
        p_owner_user_id,
        p_shop_id
      )
    ) then
    return true;
  end if;

  -- A hard-deleted history row cannot be looked up after the statement. Only
  -- the exact, database-authored envelope emitted by the AFTER DELETE trigger
  -- is accepted without a row-state lookup. All historical or forged variants
  -- stay redacted and force a full recovery.
  return p_domain = 'history'
    and p_event_type = 'history_tombstone'
    and p_source = 'database_atomic'
    and p_metadata = jsonb_build_object(
      'atomic_trigger', true,
      'entity_type', 'history_session',
      'operation', 'hard_delete',
      'payload_version', 1,
      'producer_epoch', 'database-atomic-complete-entity-ids-v1',
      'source', 'database_atomic',
      'status', 'success'
    );
exception
  when others then
    return false;
end;
$$;

revoke all on function app_private.sync_event_entity_ids_belong_to_scope(
  text,
  jsonb,
  uuid,
  uuid
) from public, anon, authenticated;
revoke all on function app_private.sync_event_entity_ids_match_operation(
  text,
  text,
  jsonb,
  uuid,
  uuid
) from public, anon, authenticated;
revoke all on function app_private.sync_event_is_incrementally_safe_v1(
  uuid, uuid, text, text, text, text, text, integer, jsonb,
  timestamptz, timestamptz, jsonb
) from public, anon, authenticated;

create or replace function app_private.sync_event_is_safe_after_v1(
  p_id bigint,
  p_owner_user_id uuid,
  p_store_id uuid,
  p_shop_id uuid,
  p_domain text,
  p_event_type text,
  p_source text,
  p_source_device_id text,
  p_batch_id uuid,
  p_client_event_id text,
  p_changed_count integer,
  p_entity_ids jsonb,
  p_created_at timestamptz,
  p_expires_at timestamptz,
  p_metadata jsonb,
  p_verified_cursor_id bigint
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_retained_through_id bigint;
begin
  if not app_private.sync_event_storage_is_bounded_v1(
      p_domain, p_event_type, p_source, p_source_device_id,
      p_client_event_id, p_entity_ids, p_metadata
    ) then
    return false;
  end if;

  if p_metadata->'retention_floor' is distinct from 'true'::jsonb then
    return app_private.sync_event_is_incrementally_safe_v1(
      p_owner_user_id, p_shop_id, p_domain, p_event_type, p_source,
      p_source_device_id, p_client_event_id, p_changed_count, p_entity_ids,
      p_created_at, p_expires_at, p_metadata
    );
  end if;

  if not app_private.sync_event_retention_envelope_is_valid_v1(
      p_id,
      p_store_id,
      p_domain,
      p_event_type,
      p_source,
      p_source_device_id,
      p_batch_id,
      p_client_event_id,
      p_changed_count,
      p_entity_ids,
      p_metadata,
      p_created_at,
      p_expires_at
    ) then
    return false;
  end if;

  begin
    v_retained_through_id := (p_metadata->>'retained_through_id')::bigint;
  exception when numeric_value_out_of_range then
    return false;
  end;

  return coalesce(p_verified_cursor_id, 0) >= v_retained_through_id;
end;
$$;

revoke all on function app_private.sync_event_is_safe_after_v1(
  bigint, uuid, uuid, uuid, text, text, text, text, uuid, text, integer,
  jsonb, timestamptz, timestamptz, jsonb, bigint
) from public, anon, authenticated, service_role;

-- A semantic no-op must not advance a digest timestamp or manufacture an
-- incremental event. Preserve the tombstone guard from the previous function.
create or replace function public.set_inventory_catalog_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_changed boolean := false;
begin
  if old.deleted_at is not null
    and current_setting('app.catalog_restore_allowed', true) <> 'true' then
    return old;
  end if;

  if tg_table_name = 'inventory_suppliers' then
    v_changed := new.id is distinct from old.id
      or new.owner_user_id is distinct from old.owner_user_id
      or new.name is distinct from old.name
      or new.deleted_at is distinct from old.deleted_at
      or new.shop_id is distinct from old.shop_id;
  elsif tg_table_name = 'inventory_categories' then
    v_changed := new.id is distinct from old.id
      or new.owner_user_id is distinct from old.owner_user_id
      or new.name is distinct from old.name
      or new.deleted_at is distinct from old.deleted_at
      or new.shop_id is distinct from old.shop_id;
  elsif tg_table_name = 'inventory_products' then
    v_changed := new.id is distinct from old.id
      or new.owner_user_id is distinct from old.owner_user_id
      or new.barcode is distinct from old.barcode
      or new.item_number is distinct from old.item_number
      or new.product_name is distinct from old.product_name
      or new.second_product_name is distinct from old.second_product_name
      or new.purchase_price is distinct from old.purchase_price
      or new.retail_price is distinct from old.retail_price
      or new.supplier_id is distinct from old.supplier_id
      or new.category_id is distinct from old.category_id
      or new.stock_quantity is distinct from old.stock_quantity
      or new.deleted_at is distinct from old.deleted_at
      or new.shop_id is distinct from old.shop_id
      or new.primary_image_version_id is distinct from old.primary_image_version_id
      or new.primary_image_updated_at is distinct from old.primary_image_updated_at;
  else
    raise exception 'unsupported catalog updated_at trigger table'
      using errcode = '55000';
  end if;

  if v_changed then
    new.updated_at := statement_timestamp();
  else
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

revoke all on function public.set_inventory_catalog_updated_at()
  from public, anon, authenticated, service_role;

create or replace function public.set_shared_sheet_sessions_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_changed boolean := false;
begin
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

-- Catalog updates are in-place. Older Admin RPCs still assign p_shop_id when
-- touching a mapped legacy row; preserve the original scope instead of
-- silently promoting that row. All other owner/shop reassignment fails.
create or replace function app_private.preserve_catalog_row_scope_v1()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'catalog owner reassignment is not allowed'
      using errcode = '22023';
  end if;

  if new.shop_id is distinct from old.shop_id then
    if old.shop_id is null
      and new.shop_id is not null
      and exists (
        select 1
        from public.shop_inventory_sources source
        where source.shop_id = new.shop_id
          and source.owner_user_id = old.owner_user_id
          and source.mapping_state = 'mapped'
          and source.verified_at is not null
          and source.disabled_at is null
      ) then
      new.shop_id := old.shop_id;
    else
      raise exception 'catalog shop reassignment is not allowed'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.preserve_catalog_row_scope_v1()
  from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'inventory_suppliers',
    'inventory_categories',
    'inventory_products',
    'inventory_product_prices'
  ]
  loop
    execute format(
      'drop trigger if exists cross_platform_preserve_catalog_scope on public.%I',
      v_table
    );
    execute format(
      'create trigger cross_platform_preserve_catalog_scope '
      || 'before update on public.%I for each row '
      || 'execute function app_private.preserve_catalog_row_scope_v1()',
      v_table
    );
  end loop;
end;
$$;

-- The active barcode identity is unique across both halves of an authorized
-- shop + mapped-legacy union. The advisory lock makes the cross-scope check
-- deterministic for concurrent direct/mobile/Admin writes.
create or replace function app_private.guard_product_union_barcode_v1()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_mapped_owner_id uuid;
  v_mapped_shop_id uuid;
  v_scope_lock text;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if new.shop_id is not null then
    select source.owner_user_id
    into v_mapped_owner_id
    from public.shop_inventory_sources source
    where source.shop_id = new.shop_id
      and source.mapping_state = 'mapped'
      and source.disabled_at is null
    order by source.created_at desc
    limit 1;

    v_scope_lock := lower(new.shop_id::text);
  else
    select source.shop_id
    into v_mapped_shop_id
    from public.shop_inventory_sources source
    where source.owner_user_id = new.owner_user_id
      and source.mapping_state = 'mapped'
      and source.disabled_at is null
    order by source.created_at desc
    limit 1;

    v_scope_lock := lower(coalesce(v_mapped_shop_id, new.owner_user_id)::text);
  end if;

  perform pg_advisory_xact_lock(
    hashtext('catalog_union_scope'),
    hashtext(v_scope_lock)
  );

  perform pg_advisory_xact_lock(
    hashtext('product_union_barcode'),
    hashtext(v_scope_lock || E'\x1f' || new.barcode)
  );

  if (
    new.shop_id is not null
    and v_mapped_owner_id is not null
    and exists (
      select 1
      from public.inventory_products product
      where product.id <> new.id
        and product.shop_id is null
        and product.owner_user_id = v_mapped_owner_id
        and product.barcode = new.barcode
        and product.deleted_at is null
    )
  ) or (
    new.shop_id is null
    and v_mapped_shop_id is not null
    and exists (
      select 1
      from public.inventory_products product
      where product.id <> new.id
        and product.shop_id = v_mapped_shop_id
        and product.barcode = new.barcode
        and product.deleted_at is null
    )
  ) then
    raise exception 'duplicate active barcode across authorized catalog scope'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_product_union_barcode_v1()
  from public, anon, authenticated;

drop trigger if exists cross_platform_product_union_barcode_guard
  on public.inventory_products;
create trigger cross_platform_product_union_barcode_guard
  before insert or update on public.inventory_products
  for each row
  execute function app_private.guard_product_union_barcode_v1();

-- Mapping activation changes the catalog boundary without touching product
-- rows. Serialize it with product writes and reject a mapping that would make
-- two active rows share one barcode inside the resulting union. Also prevent
-- an unresolved active source from being introduced beside a verified map.
create or replace function app_private.lock_catalog_scope_pair_v1(
  p_shop_id uuid,
  p_owner_user_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_shop_key text := case when p_shop_id is null then null else lower(p_shop_id::text) end;
  v_owner_key text := case when p_owner_user_id is null then null else lower(p_owner_user_id::text) end;
begin
  if v_shop_key is null and v_owner_key is null then
    raise exception 'catalog scope lock requires an identity'
      using errcode = '22023';
  end if;

  if v_shop_key is null or v_owner_key is null or v_shop_key = v_owner_key then
    perform pg_advisory_xact_lock(
      hashtext('catalog_union_scope'),
      hashtext(coalesce(v_shop_key, v_owner_key))
    );
  elsif v_shop_key < v_owner_key then
    perform pg_advisory_xact_lock(hashtext('catalog_union_scope'), hashtext(v_shop_key));
    perform pg_advisory_xact_lock(hashtext('catalog_union_scope'), hashtext(v_owner_key));
  else
    perform pg_advisory_xact_lock(hashtext('catalog_union_scope'), hashtext(v_owner_key));
    perform pg_advisory_xact_lock(hashtext('catalog_union_scope'), hashtext(v_shop_key));
  end if;
end;
$$;

revoke all on function app_private.lock_catalog_scope_pair_v1(uuid, uuid)
  from public, anon, authenticated;

create or replace function app_private.guard_catalog_source_boundary_v1()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_lock_shop_id uuid := case
    when tg_op = 'INSERT' then new.shop_id
    when tg_op = 'DELETE' then old.shop_id
    else coalesce(new.shop_id, old.shop_id)
  end;
  v_lock_owner_id uuid := case
    when tg_op = 'INSERT' then new.owner_user_id
    when tg_op = 'DELETE' then old.owner_user_id
    else coalesce(new.owner_user_id, old.owner_user_id)
  end;
begin
  perform app_private.lock_catalog_scope_pair_v1(v_lock_shop_id, v_lock_owner_id);
  perform app_private.lock_sync_event_visibility_transition_v1(
    case when tg_op = 'INSERT' then null else old.owner_user_id end,
    case when tg_op = 'INSERT' then null else old.shop_id end,
    case when tg_op = 'DELETE' then null else new.owner_user_id end,
    case when tg_op = 'DELETE' then null else new.shop_id end
  );

  if tg_op in ('UPDATE', 'DELETE')
    and old.mapping_state = 'mapped'
    and old.shop_id is not null
    and old.owner_user_id is not null
    and old.verified_at is not null
    and old.disabled_at is null
    and (
      tg_op = 'DELETE'
      or
      new.disabled_at is not null
      or new.mapping_state <> 'mapped'
      or new.shop_id is distinct from old.shop_id
      or new.owner_user_id is distinct from old.owner_user_id
      or new.verified_at is null
    )
    and (
      exists (
        select 1
        from public.inventory_products product
        where product.deleted_at is null
          and (
            (
              product.shop_id = old.shop_id
              and (
                exists (
                  select 1 from public.inventory_categories category
                  where category.id = product.category_id
                    and category.deleted_at is null
                    and category.shop_id is null
                    and category.owner_user_id = old.owner_user_id
                )
                or exists (
                  select 1 from public.inventory_suppliers supplier
                  where supplier.id = product.supplier_id
                    and supplier.deleted_at is null
                    and supplier.shop_id is null
                    and supplier.owner_user_id = old.owner_user_id
                )
              )
            )
            or (
              product.shop_id is null
              and product.owner_user_id = old.owner_user_id
              and (
                exists (
                  select 1 from public.inventory_categories category
                  where category.id = product.category_id
                    and category.deleted_at is null
                    and category.shop_id = old.shop_id
                )
                or exists (
                  select 1 from public.inventory_suppliers supplier
                  where supplier.id = product.supplier_id
                    and supplier.deleted_at is null
                    and supplier.shop_id = old.shop_id
                )
              )
            )
          )
      )
      or exists (
        select 1
        from public.inventory_product_prices price
        join public.inventory_products product on product.id = price.product_id
        where (
          price.shop_id = old.shop_id
          and product.shop_id is null
          and product.owner_user_id = old.owner_user_id
        ) or (
          price.shop_id is null
          and price.owner_user_id = old.owner_user_id
          and product.shop_id = old.shop_id
        )
      )
      or exists (
        select 1
        from public.inventory_products product
        join public.inventory_product_image_versions version
          on version.id = product.primary_image_version_id
         and version.product_id = product.id
        where product.shop_id is null
          and product.owner_user_id = old.owner_user_id
          and version.shop_id = old.shop_id
      )
    ) then
    raise exception 'catalog mapping cannot be removed while cross-scope relations exist'
      using errcode = '23503';
  end if;

  if tg_op = 'UPDATE'
    and old.mapping_state = 'mapped'
    and old.disabled_at is null
    and (
      new.shop_id is distinct from old.shop_id
      or new.owner_user_id is distinct from old.owner_user_id
    ) then
    raise exception 'active catalog mapping identity reassignment is not allowed'
      using errcode = '22023';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.disabled_at is not null or new.shop_id is null then
    return new;
  end if;

  if new.mapping_state = 'mapped' then
    if new.owner_user_id is null or new.verified_at is null then
      raise exception 'active catalog mapping must be verified'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.shop_inventory_sources source
      where source.shop_id = new.shop_id
        and source.shop_inventory_source_id <> new.shop_inventory_source_id
        and source.disabled_at is null
        and (
          source.mapping_state <> 'mapped'
          or source.owner_user_id is null
          or source.verified_at is null
        )
    ) then
      raise exception 'catalog mapping conflicts with unresolved source discovery'
        using errcode = '55000';
    end if;

    if exists (
      select 1
      from public.inventory_products direct_product
      join public.inventory_products legacy_product
        on legacy_product.shop_id is null
       and legacy_product.owner_user_id = new.owner_user_id
       and legacy_product.deleted_at is null
       and legacy_product.barcode = direct_product.barcode
      where direct_product.shop_id = new.shop_id
        and direct_product.deleted_at is null
    ) then
      raise exception 'catalog mapping creates duplicate active barcode'
        using errcode = '23505';
    end if;

    if exists (
      select 1
      from public.inventory_suppliers direct_supplier
      join public.inventory_suppliers legacy_supplier
        on legacy_supplier.shop_id is null
       and legacy_supplier.owner_user_id = new.owner_user_id
       and legacy_supplier.deleted_at is null
       and lower(legacy_supplier.name) = lower(direct_supplier.name)
      where direct_supplier.shop_id = new.shop_id
        and direct_supplier.deleted_at is null
    ) then
      raise exception 'catalog mapping creates duplicate active supplier name'
        using errcode = '23505';
    end if;

    if exists (
      select 1
      from public.inventory_categories direct_category
      join public.inventory_categories legacy_category
        on legacy_category.shop_id is null
       and legacy_category.owner_user_id = new.owner_user_id
       and legacy_category.deleted_at is null
       and lower(legacy_category.name) = lower(direct_category.name)
      where direct_category.shop_id = new.shop_id
        and direct_category.deleted_at is null
    ) then
      raise exception 'catalog mapping creates duplicate active category name'
        using errcode = '23505';
    end if;

    if exists (
      select 1
      from public.inventory_products product
      where product.deleted_at is null
        and (
          product.shop_id = new.shop_id
          or (product.shop_id is null and product.owner_user_id = new.owner_user_id)
        )
        and (
          (
            product.category_id is not null
            and not exists (
              select 1
              from public.inventory_categories category
              where category.id = product.category_id
                and category.deleted_at is null
                and (
                  category.shop_id = new.shop_id
                  or (
                    category.shop_id is null
                    and category.owner_user_id = new.owner_user_id
                  )
                )
            )
          )
          or (
            product.supplier_id is not null
            and not exists (
              select 1
              from public.inventory_suppliers supplier
              where supplier.id = product.supplier_id
                and supplier.deleted_at is null
                and (
                  supplier.shop_id = new.shop_id
                  or (
                    supplier.shop_id is null
                    and supplier.owner_user_id = new.owner_user_id
                  )
                )
            )
          )
        )
    ) or exists (
      select 1
      from public.inventory_product_prices price
      where (
        price.shop_id = new.shop_id
        or (price.shop_id is null and price.owner_user_id = new.owner_user_id)
      )
        and not exists (
          select 1
          from public.inventory_products product
          where product.id = price.product_id
            and (
              product.shop_id = new.shop_id
              or (
                product.shop_id is null
                and product.owner_user_id = new.owner_user_id
              )
            )
        )
    ) then
      raise exception 'catalog mapping exposes invalid cross-scope relations'
        using errcode = '23503';
    end if;

    if exists (
      select 1
      from public.inventory_products product
      join public.inventory_product_image_versions version
        on version.id = product.primary_image_version_id
       and version.product_id = product.id
      where product.shop_id is null
        and product.owner_user_id = new.owner_user_id
        and version.shop_id <> new.shop_id
    ) then
      raise exception 'catalog mapping exposes a cross-shop product image reference'
        using errcode = '23503';
    end if;
  elsif exists (
    select 1
    from public.shop_inventory_sources source
    where source.shop_id = new.shop_id
      and source.shop_inventory_source_id <> new.shop_inventory_source_id
      and source.mapping_state = 'mapped'
      and source.owner_user_id is not null
      and source.verified_at is not null
      and source.disabled_at is null
  ) then
    raise exception 'unresolved source cannot coexist with verified catalog mapping'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_catalog_source_boundary_v1()
  from public, anon, authenticated;

drop trigger if exists cross_platform_catalog_source_boundary_guard
  on public.shop_inventory_sources;
create trigger cross_platform_catalog_source_boundary_guard
  before insert or update or delete on public.shop_inventory_sources
  for each row
  execute function app_private.guard_catalog_source_boundary_v1();

create or replace function app_private.catalog_rows_share_authorized_union_v1(
  p_left_owner_user_id uuid,
  p_left_shop_id uuid,
  p_right_owner_user_id uuid,
  p_right_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_left_shop_id is not null and p_right_shop_id is not null
      then p_left_shop_id = p_right_shop_id
    when p_left_shop_id is null and p_right_shop_id is null
      then p_left_owner_user_id = p_right_owner_user_id
    else exists (
      select 1
      from public.shop_inventory_sources source
      where source.shop_id = coalesce(p_left_shop_id, p_right_shop_id)
        and source.owner_user_id = case
          when p_left_shop_id is null then p_left_owner_user_id
          else p_right_owner_user_id
        end
        and source.mapping_state = 'mapped'
        and source.verified_at is not null
        and source.disabled_at is null
        and not exists (
          select 1
          from public.shop_inventory_sources blocker
          where blocker.shop_id = source.shop_id
            and blocker.disabled_at is null
            and (
              blocker.mapping_state <> 'mapped'
              or blocker.owner_user_id is null
              or blocker.verified_at is null
            )
        )
    )
  end;
$$;

revoke all on function app_private.catalog_rows_share_authorized_union_v1(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated;

create or replace function app_private.lock_catalog_row_scope_v1()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_row_shop_id uuid := case when tg_op = 'UPDATE' then old.shop_id else new.shop_id end;
  v_row_owner_id uuid := case when tg_op = 'UPDATE' then old.owner_user_id else new.owner_user_id end;
  v_mapped_shop_id uuid;
  v_mapped_owner_id uuid;
begin
  if v_row_shop_id is not null then
    select source.owner_user_id
    into v_mapped_owner_id
    from public.shop_inventory_sources source
    where source.shop_id = v_row_shop_id
      and source.mapping_state = 'mapped'
      and source.disabled_at is null
    order by source.created_at desc
    limit 1;
  else
    select source.shop_id
    into v_mapped_shop_id
    from public.shop_inventory_sources source
    where source.owner_user_id = v_row_owner_id
      and source.mapping_state = 'mapped'
      and source.disabled_at is null
    order by source.created_at desc
    limit 1;
  end if;

  perform app_private.lock_catalog_scope_pair_v1(
    coalesce(v_row_shop_id, v_mapped_shop_id),
    coalesce(v_mapped_owner_id, v_row_owner_id)
  );
  return new;
end;
$$;

revoke all on function app_private.lock_catalog_row_scope_v1()
  from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'inventory_suppliers',
    'inventory_categories',
    'inventory_products',
    'inventory_product_prices'
  ]
  loop
    execute format(
      'drop trigger if exists cross_platform_00_catalog_scope_lock on public.%I',
      v_table
    );
    execute format(
      'create trigger cross_platform_00_catalog_scope_lock '
      || 'before insert or update on public.%I for each row '
      || 'execute function app_private.lock_catalog_row_scope_v1()',
      v_table
    );
  end loop;
end;
$$;

create or replace function app_private.guard_catalog_union_name_v1()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_mapped_owner_id uuid;
  v_mapped_shop_id uuid;
  v_duplicate_exists boolean := false;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if tg_table_name not in ('inventory_suppliers', 'inventory_categories') then
    raise exception 'unsupported catalog union-name table'
      using errcode = '22023';
  end if;

  if new.shop_id is not null then
    select source.owner_user_id
    into v_mapped_owner_id
    from public.shop_inventory_sources source
    where source.shop_id = new.shop_id
      and source.source_kind = 'mobile_owner'
      and source.mapping_state = 'mapped'
      and source.owner_user_id is not null
      and source.verified_at is not null
      and source.disabled_at is null
      and not exists (
        select 1
        from public.shop_inventory_sources blocker
        where blocker.shop_id = source.shop_id
          and blocker.disabled_at is null
          and (
            blocker.mapping_state <> 'mapped'
            or blocker.owner_user_id is null
            or blocker.verified_at is null
          )
      )
    order by source.created_at desc
    limit 1;

    if v_mapped_owner_id is not null then
      execute format(
        'select exists (select 1 from public.%I row '
        || 'where row.id <> $1 and row.shop_id is null '
        || 'and row.owner_user_id = $2 and row.deleted_at is null '
        || 'and lower(row.name) = lower($3))',
        tg_table_name
      ) into v_duplicate_exists using new.id, v_mapped_owner_id, new.name;
    end if;
  else
    select source.shop_id
    into v_mapped_shop_id
    from public.shop_inventory_sources source
    where source.owner_user_id = new.owner_user_id
      and source.source_kind = 'mobile_owner'
      and source.mapping_state = 'mapped'
      and source.verified_at is not null
      and source.disabled_at is null
      and not exists (
        select 1
        from public.shop_inventory_sources blocker
        where blocker.shop_id = source.shop_id
          and blocker.disabled_at is null
          and (
            blocker.mapping_state <> 'mapped'
            or blocker.owner_user_id is null
            or blocker.verified_at is null
          )
      )
    order by source.created_at desc
    limit 1;

    if v_mapped_shop_id is not null then
      execute format(
        'select exists (select 1 from public.%I row '
        || 'where row.id <> $1 and row.shop_id = $2 '
        || 'and row.deleted_at is null and lower(row.name) = lower($3))',
        tg_table_name
      ) into v_duplicate_exists using new.id, v_mapped_shop_id, new.name;
    end if;
  end if;

  if v_duplicate_exists then
    raise exception 'catalog union contains a duplicate active name'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_catalog_union_name_v1()
  from public, anon, authenticated;

drop trigger if exists cross_platform_catalog_union_name_guard
  on public.inventory_suppliers;
create trigger cross_platform_catalog_union_name_guard
  before insert or update on public.inventory_suppliers
  for each row execute function app_private.guard_catalog_union_name_v1();

drop trigger if exists cross_platform_catalog_union_name_guard
  on public.inventory_categories;
create trigger cross_platform_catalog_union_name_guard
  before insert or update on public.inventory_categories
  for each row execute function app_private.guard_catalog_union_name_v1();

create or replace function app_private.guard_product_catalog_relations_v1()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if new.category_id is not null and not exists (
    select 1
    from public.inventory_categories category
    where category.id = new.category_id
      and category.deleted_at is null
      and app_private.catalog_rows_share_authorized_union_v1(
        new.owner_user_id,
        new.shop_id,
        category.owner_user_id,
        category.shop_id
      )
  ) then
    raise exception 'product category is outside the authorized catalog scope'
      using errcode = '23503';
  end if;

  if new.supplier_id is not null and not exists (
    select 1
    from public.inventory_suppliers supplier
    where supplier.id = new.supplier_id
      and supplier.deleted_at is null
      and app_private.catalog_rows_share_authorized_union_v1(
        new.owner_user_id,
        new.shop_id,
        supplier.owner_user_id,
        supplier.shop_id
      )
  ) then
    raise exception 'product supplier is outside the authorized catalog scope'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

create or replace function app_private.guard_price_product_relation_v1()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.inventory_products product
    where product.id = new.product_id
      and product.deleted_at is null
      and app_private.catalog_rows_share_authorized_union_v1(
        new.owner_user_id,
        new.shop_id,
        product.owner_user_id,
        product.shop_id
      )
  ) then
    raise exception 'price product is outside the authorized catalog scope'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

create or replace function app_private.guard_catalog_parent_tombstone_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.deleted_at is null
    and new.deleted_at is not null
    and exists (
      select 1
      from public.inventory_products product
      where product.deleted_at is null
        and case tg_table_name
          when 'inventory_categories' then product.category_id = new.id
          when 'inventory_suppliers' then product.supplier_id = new.id
          else false
        end
    ) then
    raise exception 'active products still reference this catalog row'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_product_catalog_relations_v1()
  from public, anon, authenticated;
revoke all on function app_private.guard_price_product_relation_v1()
  from public, anon, authenticated;
revoke all on function app_private.guard_catalog_parent_tombstone_v1()
  from public, anon, authenticated;

drop trigger if exists cross_platform_catalog_relation_guard
  on public.inventory_products;
create trigger cross_platform_catalog_relation_guard
  before insert or update on public.inventory_products
  for each row
  execute function app_private.guard_product_catalog_relations_v1();

drop trigger if exists cross_platform_catalog_relation_guard
  on public.inventory_product_prices;
create trigger cross_platform_catalog_relation_guard
  before insert or update on public.inventory_product_prices
  for each row
  execute function app_private.guard_price_product_relation_v1();

drop trigger if exists cross_platform_catalog_parent_tombstone_guard
  on public.inventory_categories;
create trigger cross_platform_catalog_parent_tombstone_guard
  before update on public.inventory_categories
  for each row
  execute function app_private.guard_catalog_parent_tombstone_v1();

drop trigger if exists cross_platform_catalog_parent_tombstone_guard
  on public.inventory_suppliers;
create trigger cross_platform_catalog_parent_tombstone_guard
  before update on public.inventory_suppliers
  for each row
  execute function app_private.guard_catalog_parent_tombstone_v1();

-- Admin catalog readers and transactional RPCs use the same verified mixed
-- scope as recovery. An active unresolved source invalidates the bridge; a
-- mapped row is never sufficient unless it was explicitly verified.
create or replace function app_private.resolve_shop_catalog_scope(
  target_shop_id uuid
)
returns table (
  catalog_shop_id uuid,
  owner_user_id uuid,
  catalog_scope text
)
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  v_mapped_owner_id uuid;
  v_initial_mapped_owner_id uuid;
  v_compatibility_owner_id uuid;
  v_has_shop_rows boolean := false;
  v_has_legacy_rows boolean := false;
begin
  if target_shop_id is null
    or not app_private.is_active_shop_catalog_writer(target_shop_id) then
    return;
  end if;

  select source.owner_user_id
  into v_initial_mapped_owner_id
  from public.shop_inventory_sources source
  where source.shop_id = target_shop_id
    and source.source_kind = 'mobile_owner'
    and source.mapping_state = 'mapped'
    and source.owner_user_id is not null
    and source.verified_at is not null
    and pg_catalog.isfinite(source.created_at)
    and pg_catalog.isfinite(source.verified_at)
    and source.disabled_at is null
  order by source.created_at desc
  limit 1;

  -- Mapping writers acquire the same sorted catalog scope locks. Re-reading
  -- after the lock makes the resolver a transaction-scoped lease for every
  -- catalog RPC that calls it; a stale mapping can never authorize later DML.
  perform app_private.lock_catalog_scope_pair_v1(
    target_shop_id,
    v_initial_mapped_owner_id
  );

  if exists (
    select 1
    from public.shop_inventory_sources source
    where source.shop_id = target_shop_id
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
  ) then
    return;
  end if;

  select source.owner_user_id
  into v_mapped_owner_id
  from public.shop_inventory_sources source
  where source.shop_id = target_shop_id
    and source.mapping_state = 'mapped'
    and source.owner_user_id is not null
    and source.verified_at is not null
    and pg_catalog.isfinite(source.created_at)
    and pg_catalog.isfinite(source.verified_at)
    and source.disabled_at is null
  order by source.created_at desc
  limit 1;

  v_compatibility_owner_id := coalesce(v_mapped_owner_id, actor_id);

  if v_compatibility_owner_id is null then
    select shop.created_by_profile_id
    into v_compatibility_owner_id
    from public.shops shop
    where shop.shop_id = target_shop_id;
  end if;

  if v_compatibility_owner_id is null then
    select member.profile_id
    into v_compatibility_owner_id
    from public.shop_members member
    where member.shop_id = target_shop_id
      and member.membership_status = 'active'
      and member.role_key in ('shop_owner', 'shop_manager')
    order by case member.role_key when 'shop_owner' then 0 else 1 end,
      member.created_at
    limit 1;
  end if;

  if v_compatibility_owner_id is null then
    return;
  end if;

  select
    exists (select 1 from public.inventory_suppliers row where row.shop_id = target_shop_id)
    or exists (select 1 from public.inventory_categories row where row.shop_id = target_shop_id)
    or exists (select 1 from public.inventory_products row where row.shop_id = target_shop_id)
    or exists (select 1 from public.inventory_product_prices row where row.shop_id = target_shop_id)
  into v_has_shop_rows;

  if v_mapped_owner_id is not null then
    select
      exists (select 1 from public.inventory_suppliers row where row.shop_id is null and row.owner_user_id = v_mapped_owner_id)
      or exists (select 1 from public.inventory_categories row where row.shop_id is null and row.owner_user_id = v_mapped_owner_id)
      or exists (select 1 from public.inventory_products row where row.shop_id is null and row.owner_user_id = v_mapped_owner_id)
      or exists (select 1 from public.inventory_product_prices row where row.shop_id is null and row.owner_user_id = v_mapped_owner_id)
    into v_has_legacy_rows;
  end if;

  catalog_shop_id := target_shop_id;
  owner_user_id := v_compatibility_owner_id;
  catalog_scope := case
    when v_has_shop_rows and v_has_legacy_rows then 'authorized_shop_plus_legacy'
    when v_has_legacy_rows then 'legacy_owner_bridge'
    else 'shop_scoped'
  end;
  return next;
end;
$$;

revoke all on function app_private.resolve_shop_catalog_scope(uuid)
  from public, anon, authenticated;

create or replace function app_private.is_active_mapped_catalog_member_v1(
  p_legacy_owner_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  select exists (
    select 1
    from public.shop_inventory_sources source
    where source.owner_user_id = p_legacy_owner_user_id
      and source.mapping_state = 'mapped'
      and source.verified_at is not null
      and source.disabled_at is null
      and app_private.is_active_shop_member(source.shop_id)
      and not exists (
        select 1
        from public.shop_inventory_sources blocker
        where blocker.shop_id = source.shop_id
          and blocker.disabled_at is null
          and (
            blocker.mapping_state <> 'mapped'
            or blocker.owner_user_id is null
            or blocker.verified_at is null
          )
      )
  );
$$;

revoke all on function app_private.is_active_mapped_catalog_member_v1(uuid)
  from public, anon, authenticated;
grant execute on function app_private.is_active_mapped_catalog_member_v1(uuid)
  to authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'inventory_suppliers',
    'inventory_categories',
    'inventory_products',
    'inventory_product_prices'
  ]
  loop
    execute format(
      'drop policy if exists cross_platform_catalog_select_mapped_member on public.%I',
      v_table
    );
    execute format(
      'create policy cross_platform_catalog_select_mapped_member '
      || 'on public.%I for select to authenticated using ('
      || 'shop_id is null and '
      || 'app_private.is_active_mapped_catalog_member_v1(owner_user_id))',
      v_table
    );
  end loop;
end;
$$;

-- Bulk Admin imports execute one DML statement per workbook row so that an
-- invalid row can fail independently.  Their public wrappers temporarily
-- suppress the per-statement product/price event and publish the exact set of
-- successfully applied IDs in bounded chunks before the transaction returns.
-- This helper re-reads the authoritative rows: response payloads can identify
-- candidates, but they can never supply owner/shop/product scope metadata.
create or replace function app_private.emit_aggregated_catalog_events_v1(
  p_domain text,
  p_entity_ids text[],
  p_source text default 'database_atomic'
)
returns integer
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_group record;
  v_chunk_ids text[];
  v_product_ids text[];
  v_chunk_start integer;
  v_chunk_end integer;
  v_distinct_count integer;
  v_found_count integer := 0;
  v_event_count integer := 0;
begin
  if p_domain not in ('catalog', 'prices') then
    raise exception 'unsupported aggregated sync-event domain'
      using errcode = '22023';
  end if;

  if p_entity_ids is null or cardinality(p_entity_ids) = 0 then
    return 0;
  end if;

  if cardinality(p_entity_ids) > 80000
    or exists (
      select 1
      from unnest(p_entity_ids) item(value)
      where value is null
        or value !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or value <> lower(value)
    ) then
    raise exception 'invalid aggregated sync-event entity IDs'
      using errcode = '22023';
  end if;

  select count(distinct value)::integer
  into v_distinct_count
  from unnest(p_entity_ids) item(value);

  if p_domain = 'catalog' then
    for v_group in
      select
        row.owner_user_id,
        row.shop_id,
        array_agg(distinct lower(row.id::text) order by lower(row.id::text)) as entity_ids
      from public.inventory_products row
      where lower(row.id::text) = any(p_entity_ids)
      group by row.owner_user_id, row.shop_id
      order by row.shop_id nulls first, row.owner_user_id
    loop
      if v_group.owner_user_id is null then
        raise exception 'aggregated catalog row has no owner'
          using errcode = '23502';
      end if;
      v_found_count := v_found_count + cardinality(v_group.entity_ids);
      v_chunk_start := 1;
      while v_chunk_start <= cardinality(v_group.entity_ids) loop
        v_chunk_end := least(v_chunk_start + 249, cardinality(v_group.entity_ids));
        v_chunk_ids := v_group.entity_ids[v_chunk_start:v_chunk_end];
        perform app_private.acquire_sync_event_scope_fence_v1(
          v_group.owner_user_id,
          v_group.shop_id
        );
        insert into public.sync_events (
          owner_user_id, shop_id, domain, event_type, source,
          changed_count, entity_ids, metadata
        ) values (
          v_group.owner_user_id, v_group.shop_id, 'catalog',
          'catalog_changed', coalesce(nullif(p_source, ''), 'database_atomic'),
          cardinality(v_chunk_ids),
          jsonb_build_object('product_ids', to_jsonb(v_chunk_ids)),
          jsonb_build_object(
            'atomic_trigger', true,
            'entity_type', 'product',
            'operation', 'bulk_import',
            'payload_version', 1,
            'producer_epoch', 'database-atomic-complete-entity-ids-v1',
            'status', 'success'
          )
        );
        v_event_count := v_event_count + 1;
        v_chunk_start := v_chunk_end + 1;
      end loop;
    end loop;
  else
    for v_group in
      select
        row.owner_user_id,
        row.shop_id,
        array_agg(distinct lower(row.id::text) order by lower(row.id::text)) as entity_ids
      from public.inventory_product_prices row
      where lower(row.id::text) = any(p_entity_ids)
      group by row.owner_user_id, row.shop_id
      order by row.shop_id nulls first, row.owner_user_id
    loop
      if v_group.owner_user_id is null then
        raise exception 'aggregated price row has no owner'
          using errcode = '23502';
      end if;
      v_found_count := v_found_count + cardinality(v_group.entity_ids);
      v_chunk_start := 1;
      while v_chunk_start <= cardinality(v_group.entity_ids) loop
        v_chunk_end := least(v_chunk_start + 99, cardinality(v_group.entity_ids));
        v_chunk_ids := v_group.entity_ids[v_chunk_start:v_chunk_end];
        select array_agg(distinct lower(row.product_id::text)
          order by lower(row.product_id::text))
        into v_product_ids
        from public.inventory_product_prices row
        where lower(row.id::text) = any(v_chunk_ids)
          and row.owner_user_id = v_group.owner_user_id
          and row.shop_id is not distinct from v_group.shop_id;
        if v_product_ids is null
          or cardinality(v_product_ids) = 0
          or cardinality(v_product_ids) > cardinality(v_chunk_ids) then
          raise exception 'aggregated price event has invalid product references'
            using errcode = '23503';
        end if;
        perform app_private.acquire_sync_event_scope_fence_v1(
          v_group.owner_user_id,
          v_group.shop_id
        );
        insert into public.sync_events (
          owner_user_id, shop_id, domain, event_type, source,
          changed_count, entity_ids, metadata
        ) values (
          v_group.owner_user_id, v_group.shop_id, 'prices',
          'prices_changed', coalesce(nullif(p_source, ''), 'database_atomic'),
          cardinality(v_chunk_ids),
          jsonb_build_object(
            'price_ids', to_jsonb(v_chunk_ids),
            'product_ids', to_jsonb(v_product_ids)
          ),
          jsonb_build_object(
            'atomic_trigger', true,
            'entity_type', 'product_price',
            'operation', 'bulk_import',
            'payload_version', 1,
            'producer_epoch', 'database-atomic-complete-entity-ids-v1',
            'status', 'success'
          )
        );
        v_event_count := v_event_count + 1;
        v_chunk_start := v_chunk_end + 1;
      end loop;
    end loop;
  end if;

  if v_found_count <> v_distinct_count then
    raise exception 'aggregated sync-event IDs do not match persisted rows'
      using errcode = '23503';
  end if;

  return v_event_count;
end;
$$;

revoke all on function app_private.emit_aggregated_catalog_events_v1(
  text, text[], text
) from public, anon, authenticated, service_role;

-- Every semantic catalog/history table write gets its complete sync event in
-- the same database transaction. UPDATE transition tables are compared so
-- retry/no-op statements stay silent and cannot create reconnect loops.
create or replace function app_private.emit_atomic_sync_events_statement_v1()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_entity_key text;
  v_entity_type text;
  v_domain text;
  v_group record;
  v_chunk_ids text[];
  v_auxiliary_product_ids text[];
  v_chunk_start integer;
  v_chunk_end integer;
  v_event_type text;
  v_source text := coalesce(
    app_private.mobile_sync_request_source(),
    'database_atomic'
  );
  v_id_expression text;
  v_id_column text;
  v_relation_sql text;
  v_tombstone_expression text;
  v_invalid_scope_change boolean := false;
  v_invalid_entity_id boolean := false;
  v_chunk_size integer;
begin
  -- The POS import RPC publishes its own complete product and price events.
  -- Suppliers and categories have no explicit POS event, so their statement
  -- triggers must remain active inside the same import transaction.
  if current_setting('app_private.pos_catalog_import_in_progress', true) = 'on'
    and tg_table_name in ('inventory_products', 'inventory_product_prices') then
    return null;
  end if;

  case tg_table_name
    when 'inventory_suppliers' then
      v_entity_key := 'supplier_ids';
      v_entity_type := 'supplier';
      v_domain := 'catalog';
      v_id_expression := 'id::text';
      v_id_column := 'id';
      v_tombstone_expression := 'row_data.deleted_at is not null';
    when 'inventory_categories' then
      v_entity_key := 'category_ids';
      v_entity_type := 'category';
      v_domain := 'catalog';
      v_id_expression := 'id::text';
      v_id_column := 'id';
      v_tombstone_expression := 'row_data.deleted_at is not null';
    when 'inventory_products' then
      v_entity_key := 'product_ids';
      v_entity_type := 'product';
      v_domain := 'catalog';
      v_id_expression := 'id::text';
      v_id_column := 'id';
      v_tombstone_expression := 'row_data.deleted_at is not null';
    when 'inventory_product_prices' then
      v_entity_key := 'price_ids';
      v_entity_type := 'product_price';
      v_domain := 'prices';
      v_id_expression := 'id::text';
      v_id_column := 'id';
      v_tombstone_expression := 'false::boolean';
    when 'shared_sheet_sessions' then
      v_entity_key := 'session_ids';
      v_entity_type := 'history_session';
      v_domain := 'history';
      v_id_expression := 'remote_id';
      v_id_column := 'remote_id';
      v_tombstone_expression := 'row_data.deleted_at is not null';
    else
      raise exception 'unsupported atomic sync table: %', tg_table_name
        using errcode = '22023';
  end case;

  if tg_op = 'UPDATE' then
    execute format(
      'select exists ('
        || 'select 1 from %I new_row full join %I old_row '
        || 'on new_row.%I = old_row.%I '
        || 'where new_row.%I is null or old_row.%I is null '
        || 'or new_row.owner_user_id is distinct from old_row.owner_user_id '
        || 'or new_row.shop_id is distinct from old_row.shop_id '
      || ')',
      tg_argv[0],
      tg_argv[1],
      v_id_column,
      v_id_column,
      v_id_column,
      v_id_column
    ) into v_invalid_scope_change;

    if v_invalid_scope_change then
      raise exception 'atomic sync identity/scope reassignment is not allowed'
        using errcode = '22023';
    end if;

    v_relation_sql := format(
      '(select new_row.* from %I new_row join %I old_row '
        || 'on new_row.%I = old_row.%I '
        || 'where new_row.updated_at is distinct from old_row.updated_at)',
      tg_argv[0],
      tg_argv[1],
      v_id_column,
      v_id_column
    );
  else
    v_relation_sql := format('%I', tg_argv[0]);
  end if;

  v_chunk_size := case
    when v_domain='history' then 25
    when v_domain='prices' then 100
    else 250
  end;
  if v_domain='history' then
    execute format(
      'select exists(select 1 from %s row_data where case '
      || 'when octet_length(row_data.remote_id)=36 then '
      || 'row_data.remote_id !~* %L else true end)',
      v_relation_sql,
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) into v_invalid_entity_id;
    if v_invalid_entity_id then
      raise exception 'atomic history entity id is not a canonical UUID'
        using errcode='22023';
    end if;
  end if;

  if current_setting('app_private.admin_bulk_event_aggregation_v1', true) = 'on'
    and tg_table_name in ('inventory_products', 'inventory_product_prices') then
    if to_regclass('pg_temp.admin_bulk_changed_ids_v1') is null then
      raise exception 'Admin bulk changed-ID capture is not initialized'
        using errcode = '55000';
    end if;
    execute format(
      'insert into pg_temp.admin_bulk_changed_ids_v1(domain, entity_id) '
        || 'select %L, lower(%s) from %s row_data '
        || 'on conflict (domain, entity_id) do nothing',
      v_domain,
      v_id_expression,
      v_relation_sql
    );
    return null;
  end if;

  for v_group in execute format(
    'with numbered as materialized ('
      || 'select owner_user_id,shop_id,%s as tombstone,lower(%s) as entity_id,'
      || 'row_number() over(partition by owner_user_id,shop_id,(%s) '
      || 'order by lower(%s)) as ordinal from %s row_data'
    || '), chunks as ('
      || 'select owner_user_id,shop_id,tombstone,'
      || 'array_agg(entity_id order by entity_id) as entity_ids '
      || 'from numbered group by owner_user_id,shop_id,tombstone,'
      || '((ordinal-1)/%s)'
    || ') select owner_user_id,shop_id,tombstone,entity_ids from chunks '
      || 'order by shop_id nulls first,owner_user_id,tombstone',
    v_tombstone_expression,
    v_id_expression,
    v_tombstone_expression,
    v_id_expression,
    v_relation_sql,
    v_chunk_size
  )
  loop
    if v_group.owner_user_id is null
      or v_group.entity_ids is null
      or cardinality(v_group.entity_ids) = 0 then
      raise exception 'atomic sync row has no owner or entity id'
        using errcode = '23502';
    end if;

    v_event_type := case v_domain
      when 'catalog' then case
        when v_group.tombstone then 'catalog_tombstone'
        else 'catalog_changed'
      end
      when 'history' then case
        when v_group.tombstone then 'history_tombstone'
        else 'history_changed'
      end
      else 'prices_changed'
    end;

    v_chunk_start := 1;
    while v_chunk_start <= cardinality(v_group.entity_ids)
    loop
      v_chunk_end := least(
        v_chunk_start + case
          when v_domain = 'history' then 24
          when v_domain = 'prices' then 99
          else 249
        end,
        cardinality(v_group.entity_ids)
      );
      v_chunk_ids := v_group.entity_ids[v_chunk_start:v_chunk_end];

      if v_domain = 'prices' then
        execute format(
          'select array_agg(distinct lower(row_data.product_id::text) '
          || 'order by lower(row_data.product_id::text)) '
          || 'from %s row_data where lower(row_data.id::text) = any($1)',
          v_relation_sql
        ) into v_auxiliary_product_ids using v_chunk_ids;

        if v_auxiliary_product_ids is null
          or cardinality(v_auxiliary_product_ids) = 0
          or cardinality(v_auxiliary_product_ids) > cardinality(v_chunk_ids) then
          raise exception 'atomic price event has invalid product references'
            using errcode = '23503';
        end if;
      else
        v_auxiliary_product_ids := null;
      end if;

      perform app_private.acquire_sync_event_scope_fence_v1(
        v_group.owner_user_id,
        v_group.shop_id
      );

      insert into public.sync_events (
        owner_user_id,
        shop_id,
        domain,
        event_type,
        source,
        changed_count,
        entity_ids,
        metadata
      ) values (
        v_group.owner_user_id,
        v_group.shop_id,
        v_domain,
        v_event_type,
        v_source,
        cardinality(v_chunk_ids),
        case when v_domain = 'prices'
          then jsonb_build_object(
            v_entity_key, to_jsonb(v_chunk_ids),
            'product_ids', to_jsonb(v_auxiliary_product_ids)
          )
          else jsonb_build_object(v_entity_key, to_jsonb(v_chunk_ids))
        end,
        jsonb_build_object(
          'atomic_trigger', true,
          'entity_type', v_entity_type,
          'operation', case when v_group.tombstone then 'tombstone' else lower(tg_op) end,
          'payload_version', 1,
          'producer_epoch', 'database-atomic-complete-entity-ids-v1',
          'source', v_source,
          'status', 'success'
        )
      );

      v_chunk_start := v_chunk_end + 1;
    end loop;
  end loop;

  return null;
end;
$$;

create or replace function app_private.mark_pos_catalog_import_transaction_v1()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_mapped_owner_id uuid;
begin
  select source.owner_user_id
  into v_mapped_owner_id
  from public.shop_inventory_sources source
  where source.shop_id = new.shop_id
    and source.source_kind = 'mobile_owner'
    and source.mapping_state = 'mapped'
    and source.owner_user_id is not null
    and source.verified_at is not null
    and source.disabled_at is null
  order by source.created_at desc
  limit 1;

  -- Match every catalog writer's lock order: catalog union first, then the
  -- event publication fence. This prevents POS/Admin wait cycles.
  perform app_private.lock_catalog_scope_pair_v1(new.shop_id, v_mapped_owner_id);
  perform app_private.acquire_sync_event_scope_fence_v1(
    null,
    new.shop_id
  );
  perform set_config('app_private.pos_catalog_import_in_progress', 'on', true);
  return new;
end;
$$;

revoke all on function app_private.mark_pos_catalog_import_transaction_v1()
  from public, anon, authenticated;

drop trigger if exists mark_pos_catalog_import_transaction
  on public.pos_catalog_import_batches;
create trigger mark_pos_catalog_import_transaction
  before insert or update on public.pos_catalog_import_batches
  for each row
  execute function app_private.mark_pos_catalog_import_transaction_v1();

revoke all on function app_private.emit_atomic_sync_events_statement_v1()
  from public, anon, authenticated;

create or replace function app_private.prepare_admin_bulk_changed_ids_v1()
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  create temporary table if not exists admin_bulk_changed_ids_v1 (
    domain text not null,
    entity_id text not null,
    primary key (domain, entity_id)
  ) on commit drop;
  truncate table admin_bulk_changed_ids_v1;
end;
$$;

create or replace function app_private.read_admin_bulk_changed_ids_v1(
  p_domain text
)
returns text[]
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_ids text[];
begin
  if to_regclass('pg_temp.admin_bulk_changed_ids_v1') is null then
    raise exception 'Admin bulk changed-ID capture is not initialized'
      using errcode = '55000';
  end if;
  select coalesce(array_agg(entity_id order by entity_id), array[]::text[])
  into v_ids
  from admin_bulk_changed_ids_v1
  where domain = p_domain;
  return v_ids;
end;
$$;

revoke all on function app_private.prepare_admin_bulk_changed_ids_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.read_admin_bulk_changed_ids_v1(text)
  from public, anon, authenticated, service_role;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'inventory_suppliers',
    'inventory_categories',
    'inventory_products',
    'inventory_product_prices',
    'shared_sheet_sessions'
  ]
  loop
    execute format('drop trigger if exists task088_mobile_sync_event on public.%I', v_table);
    execute format('drop trigger if exists cross_platform_atomic_sync_insert on public.%I', v_table);
    execute format('drop trigger if exists cross_platform_atomic_sync_update on public.%I', v_table);
    execute format(
      'create trigger cross_platform_atomic_sync_insert after insert on public.%I '
      || 'referencing new table as new_rows for each statement '
      || 'execute function app_private.emit_atomic_sync_events_statement_v1(''new_rows'')',
      v_table
    );
    execute format(
      'create trigger cross_platform_atomic_sync_update after update on public.%I '
      || 'referencing old table as old_rows new table as new_rows for each statement '
      || 'execute function app_private.emit_atomic_sync_events_statement_v1(''new_rows'', ''old_rows'')',
      v_table
    );
  end loop;
end;
$$;

-- Catalog identity is tombstone/append-only for authenticated clients. There
-- is no lossless current-state payload after a hard DELETE, so denying that
-- privilege is safer than allowing a mutation with no reconstructable event.
-- Explicit service-role purge RPCs remain separate administrative operations.
revoke delete on table public.inventory_suppliers from anon, authenticated;
revoke delete on table public.inventory_categories from anon, authenticated;
revoke delete on table public.inventory_products from anon, authenticated;
revoke delete on table public.inventory_product_prices from anon, authenticated;

-- Hard-deleted history rows no longer exist for an operation-state lookup, so
-- publish their IDs from OLD TABLE inside the deleting transaction.
create or replace function app_private.emit_atomic_history_delete_sync_event_v1()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_group record;
  v_chunk_ids text[];
  v_chunk_start integer;
  v_chunk_end integer;
  v_source text := 'database_atomic';
  v_invalid_entity_id boolean := false;
begin
  select exists(
    select 1 from old_rows old_row
    where case when octet_length(old_row.remote_id)=36
      then old_row.remote_id
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      else true end
  ) into v_invalid_entity_id;
  if v_invalid_entity_id then
    raise exception 'history delete entity id is not a canonical UUID'
      using errcode='22023';
  end if;

  for v_group in
    with numbered as materialized (
      select old_row.owner_user_id,old_row.shop_id,
        lower(old_row.remote_id) as entity_id,
        row_number() over(
          partition by old_row.owner_user_id,old_row.shop_id
          order by lower(old_row.remote_id)
        ) as ordinal
      from old_rows old_row
    )
    select numbered.owner_user_id,numbered.shop_id,
      array_agg(numbered.entity_id order by numbered.entity_id) as entity_ids
    from numbered
    group by numbered.owner_user_id,numbered.shop_id,((numbered.ordinal-1)/25)
    order by numbered.shop_id nulls first,numbered.owner_user_id,
      ((numbered.ordinal-1)/25)
  loop
    if v_group.owner_user_id is null
      or v_group.entity_ids is null
      or cardinality(v_group.entity_ids) = 0 then
      raise exception 'history delete has no owner or entity id'
        using errcode = '23502';
    end if;

    v_chunk_start := 1;
    while v_chunk_start <= cardinality(v_group.entity_ids)
    loop
      v_chunk_end := least(v_chunk_start + 24, cardinality(v_group.entity_ids));
      v_chunk_ids := v_group.entity_ids[v_chunk_start:v_chunk_end];

      perform app_private.acquire_sync_event_scope_fence_v1(
        v_group.owner_user_id,
        v_group.shop_id
      );

      insert into public.sync_events (
        owner_user_id,
        shop_id,
        domain,
        event_type,
        source,
        changed_count,
        entity_ids,
        metadata
      ) values (
        v_group.owner_user_id,
        v_group.shop_id,
        'history',
        'history_tombstone',
        v_source,
        cardinality(v_chunk_ids),
        jsonb_build_object('session_ids', to_jsonb(v_chunk_ids)),
        jsonb_build_object(
          'atomic_trigger', true,
          'entity_type', 'history_session',
          'operation', 'hard_delete',
          'payload_version', 1,
          'producer_epoch', 'database-atomic-complete-entity-ids-v1',
          'source', v_source,
          'status', 'success'
        )
      );

      v_chunk_start := v_chunk_end + 1;
    end loop;
  end loop;

  return null;
end;
$$;

revoke all on function app_private.emit_atomic_history_delete_sync_event_v1()
  from public, anon, authenticated;

drop trigger if exists cross_platform_atomic_sync_delete
  on public.shared_sheet_sessions;
create trigger cross_platform_atomic_sync_delete
  after delete on public.shared_sheet_sessions
  referencing old table as old_rows
  for each statement
  execute function app_private.emit_atomic_history_delete_sync_event_v1();

-- Execute-only POS routes share one deterministic lease lock order.  The
-- initial session lookup is only a hint used to find the lock identity; every
-- value is re-read and validated after the advisory lock.  Explicit table
-- locks avoid planner-dependent join lock order and serialize first-login
-- rotation with heartbeat/catalog operations for the same physical device.
create or replace function app_private.pos_runtime_lease_is_valid_v1(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_session_hint public.pos_sessions%rowtype;
  v_device_identifier text;
begin
  select session_row.* into v_session_hint
  from public.pos_sessions session_row
  where session_row.pos_session_id = p_pos_session_id;

  if not found
    or v_session_hint.shop_id <> p_shop_id
    or v_session_hint.shop_device_id <> p_shop_device_id
    or v_session_hint.staff_id <> p_staff_id then
    return false;
  end if;

  select device.device_identifier into v_device_identifier
  from public.shop_devices device
  where device.shop_device_id = p_shop_device_id
    and device.shop_id = p_shop_id;

  if v_device_identifier is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_shop_id::text || ':' || v_device_identifier, 0)
  );

  -- Global POS runtime row-lock order: shop -> staff -> device -> credential
  -- -> session.  Writers use the same device advisory key before this order.
  perform 1 from public.shops shop
  where shop.shop_id = p_shop_id and shop.shop_status = 'active'
  for share;
  if not found then return false; end if;

  perform 1 from public.staff_accounts staff
  where staff.staff_id = p_staff_id
    and staff.shop_id = p_shop_id
    and staff.status = 'active'
    and staff.credential_status = 'active'
    and staff.credential_version = v_session_hint.staff_credential_version
    and staff.must_change_credential = false
    and staff.credential_hash is not null
    and (staff.credential_expires_at is null or staff.credential_expires_at > now())
    and (staff.locked_until is null or staff.locked_until <= now())
    and (
      staff.session_invalidated_at is null
      or staff.session_invalidated_at <= v_session_hint.issued_at
    )
  for share;
  if not found then return false; end if;

  perform 1 from public.shop_devices device
  where device.shop_device_id = p_shop_device_id
    and device.shop_id = p_shop_id
    and device.device_identifier = v_device_identifier
    and device.status = 'active'
    and device.revoked_at is null
  for share;
  if not found then return false; end if;

  perform 1 from public.pos_device_credentials credential
  where credential.pos_device_credential_id = v_session_hint.pos_device_credential_id
    and credential.shop_id = p_shop_id
    and credential.shop_device_id = p_shop_device_id
    and credential.staff_id = p_staff_id
    and credential.status = 'active'
    and credential.revoked_at is null
    and credential.expires_at > now()
    and credential.staff_credential_version = v_session_hint.staff_credential_version
  for share;
  if not found then return false; end if;

  perform 1 from public.pos_sessions session_row
  where session_row.pos_session_id = p_pos_session_id
    and session_row.shop_id = p_shop_id
    and session_row.shop_device_id = p_shop_device_id
    and session_row.staff_id = p_staff_id
    and session_row.pos_device_credential_id = v_session_hint.pos_device_credential_id
    and session_row.staff_credential_version = v_session_hint.staff_credential_version
    and session_row.status = 'active'
    and session_row.revoked_at is null
    and session_row.expires_at > now()
    and session_row.issued_at = v_session_hint.issued_at
  for share;

  return found;
end;
$$;

revoke all on function app_private.pos_runtime_lease_is_valid_v1(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;

-- Preserve the reviewed financial writer but require the common lease and
-- lock order before entering it.  Same-staff sales from multiple devices are
-- serialized so the unchecked writer cannot create a share-to-update cycle.
do $$
begin
  if to_regprocedure(
    'public.pos_sales_sync_apply_unchecked_v1(uuid,text,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb)'
  ) is null then
    alter function public.pos_sales_sync_apply_v1(
      uuid, text, uuid, uuid, uuid, text, text, text, text, jsonb, jsonb
    ) rename to pos_sales_sync_apply_unchecked_v1;
  end if;
end;
$$;

revoke all on function public.pos_sales_sync_apply_unchecked_v1(
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
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if jsonb_typeof(p_sales) <> 'array'
    or not (jsonb_array_length(p_sales) between 1 and 100)
    or pg_column_size(p_sales) > 262144
    or jsonb_typeof(coalesce(p_metadata_redacted, '{}'::jsonb)) <> 'object'
    or pg_column_size(coalesce(p_metadata_redacted, '{}'::jsonb)) > 4096 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'pos-sales:' || p_shop_id::text || ':' || p_staff_id::text,
      0
    )
  );

  if not app_private.pos_runtime_lease_is_valid_v1(
    p_shop_id, p_shop_device_id, p_staff_id, p_pos_session_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'denied');
  end if;

  return public.pos_sales_sync_apply_unchecked_v1(
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
) from public, anon, authenticated;
grant execute on function public.pos_sales_sync_apply_v1(
  uuid, text, uuid, uuid, uuid, text, text, text, text, jsonb, jsonb
) to service_role;

-- POS import preflight is server-only, but the owner mapping is still only a
-- hint until the apply transaction takes this lease and revalidates it. This
-- replaces direct service-role SELECT access to the protected mapping table.
create or replace function app_private.resolve_pos_catalog_import_owner_v1(
  p_shop_id uuid,
  p_acquire_lease boolean default true
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_initial_owner_id uuid;
  v_owner_id uuid;
begin
  if p_shop_id is null then
    return null;
  end if;

  select source.owner_user_id
  into v_initial_owner_id
  from public.shop_inventory_sources source
  where source.shop_id = p_shop_id
    and source.source_kind = 'mobile_owner'
    and source.mapping_state = 'mapped'
    and source.owner_user_id is not null
    and source.verified_at is not null
    and source.disabled_at is null
  order by source.created_at desc
  limit 1;

  if p_acquire_lease then
    perform app_private.lock_catalog_scope_pair_v1(
      p_shop_id,
      v_initial_owner_id
    );
  end if;

  if exists (
    select 1
    from public.shop_inventory_sources source
    where source.shop_id = p_shop_id
      and source.disabled_at is null
      and (
        source.source_kind <> 'mobile_owner'
        or source.mapping_state <> 'mapped'
        or source.owner_user_id is null
        or source.verified_at is null
      )
  ) then
    return null;
  end if;

  select source.owner_user_id
  into v_owner_id
  from public.shop_inventory_sources source
  where source.shop_id = p_shop_id
    and source.source_kind = 'mobile_owner'
    and source.mapping_state = 'mapped'
    and source.owner_user_id is not null
    and source.verified_at is not null
    and source.disabled_at is null
  order by source.created_at desc
  limit 1;

  return v_owner_id;
end;
$$;

revoke all on function app_private.resolve_pos_catalog_import_owner_v1(
  uuid,
  boolean
) from public, anon, authenticated, service_role;

drop function if exists public.pos_catalog_import_scope_v1(uuid);
drop function if exists public.pos_catalog_import_scope_v1(uuid, uuid);
create function public.pos_catalog_import_scope_v1(
  p_shop_id uuid,
  p_shop_device_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_owner_id uuid;
begin
  if not exists (
    select 1
    from public.shop_devices device
    where device.shop_device_id = p_shop_device_id
      and device.shop_id = p_shop_id
      and device.status = 'active'
      and device.revoked_at is null
  ) then
    return jsonb_build_object('status', 'device_denied');
  end if;

  v_owner_id := app_private.resolve_pos_catalog_import_owner_v1(
    p_shop_id,
    true
  );

  if v_owner_id is null then
    return jsonb_build_object('status', 'unmapped');
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'ownerUserId', lower(v_owner_id::text)
  );
end;
$$;

revoke all on function public.pos_catalog_import_scope_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.pos_catalog_import_scope_v1(uuid, uuid)
  to service_role;

-- Preserve the reviewed ACK/replay implementation behind a non-callable
-- internal name, then put owner/shop lease validation in the same transaction
-- as every POS import DML.
do $$
begin
  if to_regprocedure(
    'public.pos_catalog_import_apply_unchecked_v2(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz,jsonb,jsonb,jsonb)'
  ) is null then
    alter function public.pos_catalog_import_apply_v2(
      uuid,
      uuid,
      uuid,
      uuid,
      uuid,
      text,
      text,
      text,
      text,
      text,
      timestamptz,
      jsonb,
      jsonb,
      jsonb
    ) rename to pos_catalog_import_apply_unchecked_v2;
  end if;
end;
$$;

revoke all on function public.pos_catalog_import_apply_unchecked_v2(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  jsonb,
  jsonb,
  jsonb
) from public, anon, authenticated, service_role;

create or replace function public.pos_catalog_import_apply_v2(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_owner_user_id uuid,
  p_client_import_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_schema_version text,
  p_source text,
  p_batch_created_at timestamptz,
  p_items jsonb,
  p_summary jsonb default '{}'::jsonb,
  p_metadata_redacted jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_current_owner_id uuid;
begin
  if jsonb_typeof(p_items) <> 'array'
    or not (jsonb_array_length(p_items) between 1 and 1000)
    or jsonb_typeof(coalesce(p_summary, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_metadata_redacted, '{}'::jsonb)) <> 'object'
    or pg_column_size(p_items) > 524288 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  if not app_private.pos_runtime_lease_is_valid_v1(
    p_shop_id,
    p_shop_device_id,
    p_staff_id,
    p_pos_session_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'auth_denied');
  end if;

  v_current_owner_id := app_private.resolve_pos_catalog_import_owner_v1(
    p_shop_id,
    true
  );

  if v_current_owner_id is null then
    return jsonb_build_object('ok', false, 'code', 'not_configured');
  end if;

  if p_owner_user_id is null
    or p_owner_user_id <> v_current_owner_id then
    return jsonb_build_object('ok', false, 'code', 'scope_changed');
  end if;

  return public.pos_catalog_import_apply_unchecked_v2(
    p_shop_id,
    p_shop_device_id,
    p_staff_id,
    p_pos_session_id,
    v_current_owner_id,
    p_client_import_id,
    p_idempotency_key,
    p_payload_hash,
    p_schema_version,
    p_source,
    p_batch_created_at,
    p_items,
    p_summary,
    p_metadata_redacted
  );
end;
$$;

revoke all on function public.pos_catalog_import_apply_v2(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  jsonb,
  jsonb,
  jsonb
) from public, anon, authenticated;
grant execute on function public.pos_catalog_import_apply_v2(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  jsonb,
  jsonb,
  jsonb
) to service_role;

-- Recovery represents mapped legacy rows as an authorized transition scope.
-- This migration intentionally defines no promotion/rewriting helper: moving
-- owner-scoped rows into a shop is a separate, explicit data operation.

create or replace function public.mobile_sync_auto_event_capabilities()
returns jsonb
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  select jsonb_build_object(
    'schemaVersion', 6,
    'eventContract', 'complete-entity-ids-v1',
    'producerEpoch', 'database-atomic-complete-entity-ids-v1',
    'eventCursorOrdering', 'scope-serialized-id-v1',
    'databaseMutationEmitsSyncEvent', true,
    'maxEntityIdsPerEvent', 250,
    'maxEntityIdsByDomain', jsonb_build_object(
      'catalog', 250,
      'prices', 250,
      'history', 25
    ),
    'maxTargetedIdsByDomain', jsonb_build_object(
      'catalog', 60,
      'prices', 120,
      'history', 3,
      'images', 240
    ),
    'maxTargetedIdsByRecoveryDomain', jsonb_build_object(
      'suppliers', 240,
      'categories', 240,
      'products', 60,
      'prices', 120,
      'history', 3,
      'images', 240
    ),
    'targetedFetchRequiresDeterministicChunking', true,
    'incrementalMaterializationFence', 'domain-event-minimum-live-row-v1',
    'eventPagesSupportFrozenAsOfMax', true,
    'targetedRowsRequireExactDomainEventMax', false,
    'recoveryPagesUseIndependentDomainFences', true,
    'recoverySnapshotStrategy', 'live-keyset-plus-frozen-event-tail-v1',
    'recoveryRequiresQuiescence', false,
    'recoveryPageDomainFence', 'minimum-not-equality-v1',
    'recoveryCatchupProtocol', 'baseline-A-live-pages-tail-to-B-verify-marker-v1',
    'incrementalTailRetryPolicy', 'bounded-retry-or-full-recovery-v1',
    'convergenceMarkerRpc', 'shop_sync_convergence_marker_v1',
    'convergenceMarkerSchema', 'shop-sync-convergence-marker-v1',
    'convergenceScope', 'authorized-shop-plus-verified-legacy-owner-v1',
    'noWorkProof', 'scope-baseline-events-counts-and-strong-digests-v1',
    'noWorkRequiresClientPendingAndJournalEmpty', true,
    'maxRecoveryResponseBytes', 4194304,
    'requiresFullRecoveryForIncompleteLegacyEvent', true,
    'legacyOutboxCutoverPolicy', 'full-recovery-then-terminalize-v1'
  );
$$;

revoke all on function public.mobile_sync_auto_event_capabilities()
  from public, anon, authenticated;
grant execute on function public.mobile_sync_auto_event_capabilities()
  to authenticated;

-- TASK-100 wrappers already run in the same transaction as the statement
-- trigger. Preserve their result contract without publishing a second event.
create or replace function app_private.shop_catalog_emit_sync_for_result(
  p_result jsonb,
  p_shop_id uuid,
  p_entity text,
  p_operation text,
  p_actor_kind text default 'personal_account'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  perform p_shop_id, p_entity, p_operation, p_actor_kind;
  return p_result;
end;
$$;

-- Product-image finalize/remove updates the product reference first, so the
-- global statement trigger has already published the required product event.
create or replace function app_private.product_image_product_is_in_shop(
  p_product_id uuid,
  p_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(exists (
    select 1
    from public.inventory_products product
    where product.id = p_product_id
      and product.deleted_at is null
      and (
        product.shop_id = p_shop_id
        or (
          product.shop_id is null
          and exists (
            select 1
            from public.shop_inventory_sources source
            where source.shop_id = p_shop_id
              and source.source_kind = 'mobile_owner'
              and source.owner_user_id = product.owner_user_id
              and source.mapping_state = 'mapped'
              and source.verified_at is not null
              and source.disabled_at is null
          )
          and not exists (
            select 1
            from public.shop_inventory_sources blocker
            where blocker.shop_id = p_shop_id
              and blocker.disabled_at is null
              and (
                blocker.source_kind <> 'mobile_owner'
                or blocker.mapping_state <> 'mapped'
                or blocker.owner_user_id is null
                or blocker.verified_at is null
              )
          )
        )
      )
  ), false);
$$;

create or replace function app_private.product_image_product_is_in_shop_for_cleanup_v1(
  p_product_id uuid,
  p_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(exists (
    select 1
    from public.inventory_products product
    where product.id = p_product_id
      and (
        product.shop_id = p_shop_id
        or (
          product.shop_id is null
          and exists (
            select 1
            from public.shop_inventory_sources source
            where source.shop_id = p_shop_id
              and source.source_kind = 'mobile_owner'
              and source.owner_user_id = product.owner_user_id
              and source.mapping_state = 'mapped'
              and source.verified_at is not null
              and source.disabled_at is null
          )
          and not exists (
            select 1
            from public.shop_inventory_sources blocker
            where blocker.shop_id = p_shop_id
              and blocker.disabled_at is null
              and (
                blocker.source_kind <> 'mobile_owner'
                or blocker.mapping_state <> 'mapped'
                or blocker.owner_user_id is null
                or blocker.verified_at is null
              )
          )
        )
      )
  ), false);
$$;

create or replace function app_private.sync_event_matches_atomic_product_v1(
  p_domain text,
  p_event_type text,
  p_source text,
  p_source_device_id text,
  p_client_event_id text,
  p_changed_count integer,
  p_entity_ids jsonb,
  p_metadata jsonb,
  p_product_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = app_private, pg_catalog, pg_temp
as $$
begin
  if not app_private.sync_event_storage_is_bounded_v1(
      p_domain, p_event_type, p_source, p_source_device_id,
      p_client_event_id, p_entity_ids, p_metadata
    ) then
    return false;
  end if;
  if not app_private.sync_event_metadata_is_redacted(p_metadata) then
    return false;
  end if;
  if not app_private.sync_event_entity_ids_are_complete(
      p_domain, p_changed_count, p_entity_ids
    ) then
    return false;
  end if;
  if p_metadata->'atomic_trigger' is distinct from 'true'::jsonb then
    return false;
  end if;
  return p_entity_ids @> jsonb_build_object(
    'product_ids', jsonb_build_array(p_product_id)
  );
exception when others then
  return false;
end;
$$;

revoke all on function app_private.sync_event_matches_atomic_product_v1(
  text, text, text, text, text, integer, jsonb, jsonb, uuid
) from public, anon, authenticated, service_role;

create or replace function app_private.emit_product_image_sync_event(
  p_shop_id uuid,
  p_product_id uuid,
  p_version_id uuid,
  p_operation text,
  p_actor_kind text
)
returns bigint
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_event_id bigint;
  v_product_owner_id uuid;
  v_product_shop_id uuid;
  v_product_deleted_at timestamptz;
begin
  perform p_version_id, p_operation, p_actor_kind;

  select product.owner_user_id, product.shop_id, product.deleted_at
  into v_product_owner_id, v_product_shop_id, v_product_deleted_at
  from public.inventory_products product
  where product.id = p_product_id
  for share;
  if not found
    or not app_private.product_image_product_is_in_shop_for_cleanup_v1(
      p_product_id, p_shop_id
    ) then
    raise exception 'product_image_product_scope_invalid'
      using errcode = '42501';
  end if;

  with current_xact_candidates as materialized (
    select
      event.id, event.domain, event.event_type, event.source,
      event.source_device_id, event.client_event_id, event.changed_count,
      event.entity_ids, event.metadata
    from public.sync_events event
    where event.xmin = pg_current_xact_id()::xid
      and event.owner_user_id = v_product_owner_id
      and event.shop_id is not distinct from v_product_shop_id
      and event.domain = 'catalog'
      and event.event_type = case
        when v_product_deleted_at is null then 'catalog_changed'
        else 'catalog_tombstone'
      end
  )
  select candidate.id into v_event_id
  from current_xact_candidates candidate
  where app_private.sync_event_matches_atomic_product_v1(
    candidate.domain, candidate.event_type, candidate.source,
    candidate.source_device_id, candidate.client_event_id,
    candidate.changed_count, candidate.entity_ids, candidate.metadata,
    p_product_id
  )
  order by candidate.id desc
  limit 1;

  if v_event_id is null then
    raise exception 'product_image_atomic_sync_event_missing'
      using errcode = '55000';
  end if;

  return v_event_id;
end;
$$;

revoke all on function app_private.shop_catalog_emit_sync_for_result(
  jsonb, uuid, text, text, text
) from public, anon, authenticated;
revoke all on function app_private.emit_product_image_sync_event(
  uuid, uuid, uuid, text, text
) from public, anon, authenticated;
revoke all on function app_private.product_image_product_is_in_shop_for_cleanup_v1(
  uuid, uuid
) from public, anon, authenticated;

create or replace function public.product_image_remove(
  p_actor_profile_id uuid,
  p_actor_kind text,
  p_shop_id uuid,
  p_product_id uuid,
  p_expected_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_product public.inventory_products%rowtype;
  v_version public.inventory_product_image_versions%rowtype;
  v_changed_at timestamptz := now();
  v_audit_id uuid;
  v_sync_event_id bigint;
  v_previous_restore_allowed text;
  v_published_version_id uuid;
  v_row_count integer;
begin
  if not app_private.product_image_actor_can_write(
    p_actor_profile_id, p_shop_id, p_actor_kind
  ) then
    if exists (select 1 from public.shops where shop_id = p_shop_id) then
      perform app_private.write_product_image_audit(
        p_actor_profile_id, p_shop_id, 'shop.product_image.remove_denied',
        'warning', 'blocked', p_product_id, p_expected_version_id,
        'permission_denied', p_actor_kind
      );
    end if;
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  select product.* into v_product
  from public.inventory_products product
  where product.id = p_product_id
  for update;

  if v_product.id is null
    or not app_private.product_image_product_is_in_shop_for_cleanup_v1(
      p_product_id, p_shop_id
    ) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_product.primary_image_version_id is null then
    return jsonb_build_object(
      'ok', true, 'code', 'already_removed', 'status', 'already_removed'
    );
  end if;

  if p_expected_version_id is null
    or v_product.primary_image_version_id <> p_expected_version_id then
    perform app_private.write_product_image_audit(
      p_actor_profile_id, p_shop_id, 'shop.product_image.remove_denied',
      'warning', 'blocked', p_product_id, p_expected_version_id,
      'stale_conflict', p_actor_kind
    );
    return jsonb_build_object('ok', false, 'code', 'stale_conflict');
  end if;

  select version.* into v_version
  from public.inventory_product_image_versions version
  where version.id = p_expected_version_id
    and version.product_id = p_product_id
    and version.shop_id = p_shop_id
    and version.status = 'ready'
  for update;
  if v_version.id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_state_or_not_found');
  end if;

  update public.inventory_product_image_versions
  set status = 'removed', removed_at = v_changed_at,
      cleanup_status = 'pending', cleanup_updated_at = v_changed_at
  where id = p_expected_version_id;

  v_previous_restore_allowed := current_setting(
    'app.catalog_restore_allowed', true
  );
  perform set_config('app.catalog_restore_allowed', 'true', true);
  update public.inventory_products
  set primary_image_version_id = null,
      primary_image_updated_at = v_changed_at,
      updated_at = v_changed_at
  where id = p_product_id
    and primary_image_version_id = p_expected_version_id
  returning primary_image_version_id into v_published_version_id;
  get diagnostics v_row_count = row_count;
  perform set_config(
    'app.catalog_restore_allowed',
    coalesce(v_previous_restore_allowed, ''),
    true
  );
  if v_row_count <> 1 or v_published_version_id is not null then
    raise exception 'product_image_remove_publish_failed'
      using errcode = '55000';
  end if;

  v_sync_event_id := app_private.emit_product_image_sync_event(
    p_shop_id, p_product_id, p_expected_version_id, 'image_remove', p_actor_kind
  );
  v_audit_id := app_private.write_product_image_audit(
    p_actor_profile_id, p_shop_id, 'shop.product_image.removed',
    'info', 'success', p_product_id, p_expected_version_id, 'removed',
    p_actor_kind, jsonb_build_object('sync_event_id', v_sync_event_id)
  );

  return jsonb_build_object(
    'ok', true, 'code', 'removed', 'status', 'removed',
    'version_id', p_expected_version_id,
    'main_path', v_version.main_path, 'thumb_path', v_version.thumb_path,
    'image_updated_at', v_changed_at, 'audit_event_id', v_audit_id
  );
end;
$$;

revoke all on function public.product_image_remove(uuid, text, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.product_image_remove(uuid, text, uuid, uuid, uuid)
  to service_role;
revoke all on function app_private.product_image_product_is_in_shop(uuid, uuid)
  from public, anon, authenticated;

-- `record_sync_event` remains available to authenticated mobile clients for
-- legacy/manual events.  Treat its profile/shop membership as a lease rather
-- than a one-time predicate: acquire fixed row locks before every return and
-- after the event visibility fence so a concurrent deactivate/revoke cannot
-- publish (or replay) an event outside the caller's active scope.
create or replace function app_private.record_sync_event_writer_lease_v1(
  p_owner_user_id uuid,
  p_shop_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if p_owner_user_id is null or auth.uid() is distinct from p_owner_user_id then
    return false;
  end if;

  -- Fixed lock order: profile -> shop -> membership.  These locks are held
  -- through the outer SECURITY DEFINER RPC return boundary.
  perform 1
  from public.profiles profile
  where profile.profile_id = p_owner_user_id
    and profile.profile_status = 'active'
  for share;
  if not found then
    return false;
  end if;

  if p_shop_id is null then
    return true;
  end if;

  perform 1
  from public.shops shop
  where shop.shop_id = p_shop_id
    and shop.shop_status = 'active'
  for share;
  if not found then
    return false;
  end if;

  perform 1
  from public.shop_members member
  where member.shop_id = p_shop_id
    and member.profile_id = p_owner_user_id
    and member.membership_status = 'active'
    and member.role_key in ('shop_owner', 'shop_manager')
  for share;
  return found;
end;
$$;

revoke all on function app_private.record_sync_event_writer_lease_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

-- The V6 wire contract transports bigint cursors as canonical decimal text.
-- Keep the ten-argument record_sync_event RPC and its composite-row response
-- unchanged for deployed clients; strict complete-ID publication is additive.
create or replace function public.record_sync_event_v6(
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
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_entity_ids jsonb := p_entity_ids;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_row public.sync_events;
  v_existing_id bigint;
  v_existing_contract_safe boolean := false;
begin
  if v_owner is null then
    raise exception 'record_sync_event requires an authenticated user'
      using errcode = '28000';
  end if;

  if p_shop_id is not null and p_store_id is not null then
    raise exception 'shop-scoped sync event cannot include a legacy store id'
      using errcode = '22023';
  end if;

  if length(coalesce(p_domain, '')) > 32
    or length(coalesce(p_event_type, '')) > 48
    or not app_private.sync_event_type_is_supported(p_domain, p_event_type) then
    raise exception 'unsupported sync event domain/type'
      using errcode = '22023';
  end if;

  if p_changed_count is null
    or p_changed_count < 0
    or p_changed_count > 250 then
    raise exception 'changed_count out of allowed range'
      using errcode = '22023';
  end if;

  if p_client_event_id is not null and length(p_client_event_id) > 160 then
    raise exception 'client_event_id too large'
      using errcode = '22023';
  end if;

  if p_source is not null and length(p_source) > 80
    or p_source_device_id is not null and length(p_source_device_id) > 160 then
    raise exception 'sync event source identifier is too large'
      using errcode = '22023';
  end if;

  if not app_private.sync_jsonb_storage_is_bounded_v1(
      v_metadata, 8192, 0
    ) then
    raise exception 'metadata storage payload too large or compressed'
      using errcode = '54000';
  end if;

  if jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'metadata must be a JSON object'
      using errcode = '22023';
  end if;

  if v_metadata ? 'retention_floor'
    or v_metadata ? 'retained_through_id' then
    raise exception 'retention metadata is reserved for the database boundary'
      using errcode = '22023';
  end if;

  if not app_private.sync_event_metadata_is_redacted(v_metadata) then
    raise exception 'metadata contains fields outside the sync-event metadata budget'
      using errcode = '22023';
  end if;

  if p_entity_ids is not null then
    if not app_private.sync_jsonb_storage_is_bounded_v1(
        p_entity_ids, 32768, 0
      ) then
      raise exception 'entity_ids storage payload too large or compressed'
        using errcode = '54000';
    end if;

    if jsonb_typeof(p_entity_ids) <> 'object' then
      raise exception 'entity_ids must be a JSON object'
        using errcode = '22023';
    end if;
  end if;

  if not app_private.sync_event_entity_ids_are_complete(
    p_domain,
    p_changed_count,
    p_entity_ids
  ) then
    raise exception 'sync_event_entity_ids_incomplete'
      using errcode = '22023';
  end if;
  v_entity_ids := app_private.sync_event_canonical_entity_ids_v1(
    p_entity_ids
  );

  -- Fence and validate the active caller lease before any scope lookup or
  -- idempotency replay.  The held locks make profile/shop/member revocation
  -- wait until this visibility decision is complete.
  perform app_private.acquire_sync_event_scope_fence_v1(v_owner, p_shop_id);
  if not app_private.record_sync_event_writer_lease_v1(v_owner, p_shop_id) then
    raise exception 'record_sync_event requires an active profile and, for shop scope, active owner/manager membership'
      using errcode = '42501';
  end if;

  if not app_private.sync_event_entity_ids_belong_to_scope(
    p_domain,
    v_entity_ids,
    v_owner,
    p_shop_id
  ) then
    raise exception 'sync_event_entity_ids_out_of_scope'
      using errcode = '22023';
  end if;

  if not app_private.sync_event_entity_ids_match_operation(
    p_domain,
    p_event_type,
    v_entity_ids,
    v_owner,
    p_shop_id
  ) then
    raise exception 'sync_event_operation_state_mismatch'
      using errcode = '22023';
  end if;

  v_metadata := v_metadata || jsonb_build_object(
    'producer_epoch', 'database-atomic-complete-entity-ids-v1'
  );
  if app_private.sync_event_storage_is_bounded_v1(
      p_domain,p_event_type,p_source,p_source_device_id,p_client_event_id,
      v_entity_ids,v_metadata
    ) is not true then
    raise exception 'sync event storage envelope is invalid'
      using errcode='54000';
  end if;

  if p_client_event_id is not null then
    select
      event.id,
      app_private.sync_event_storage_is_bounded_v1(
        event.domain, event.event_type, event.source,
        event.source_device_id, event.client_event_id, event.entity_ids,
        event.metadata
      ) is true
      and app_private.sync_event_metadata_is_redacted(event.metadata) is true
      and app_private.sync_event_entity_ids_are_complete(
        event.domain, event.changed_count, event.entity_ids
      ) is true
      into v_existing_id, v_existing_contract_safe
      from public.sync_events event
      where owner_user_id = v_owner
        and client_event_id = p_client_event_id
        and (
          (p_shop_id is null and shop_id is null)
          or shop_id = p_shop_id
        );

    if found then
      if v_existing_contract_safe is not true then
        raise exception 'sync_event_existing_row_requires_recovery'
          using errcode = '55000';
      end if;
      select * into strict v_row
      from public.sync_events event
      where event.id = v_existing_id;
      if v_row.domain is distinct from p_domain
        or v_row.event_type is distinct from p_event_type
        or v_row.changed_count is distinct from p_changed_count
        or v_row.entity_ids is distinct from v_entity_ids
        or v_row.store_id is distinct from p_store_id
        or v_row.source is distinct from p_source
        or v_row.source_device_id is distinct from p_source_device_id
        or v_row.batch_id is distinct from p_batch_id
        or v_row.metadata is distinct from v_metadata then
        raise exception 'sync_event_client_event_id_conflict'
          using errcode = '23505';
      end if;
      return to_jsonb(v_row) || jsonb_build_object('id', v_row.id::text);
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
    v_entity_ids,
    v_metadata
  )
  returning * into v_row;

  return to_jsonb(v_row) || jsonb_build_object('id', v_row.id::text);
exception
  when unique_violation then
    if p_client_event_id is not null then
      -- EXCEPTION uses a subtransaction, so reacquire both the visibility
      -- fence and caller lease before reading/replaying the concurrent row.
      perform app_private.acquire_sync_event_scope_fence_v1(v_owner, p_shop_id);
      if not app_private.record_sync_event_writer_lease_v1(v_owner, p_shop_id) then
        raise exception 'record_sync_event caller lease expired before idempotency replay'
          using errcode = '42501';
      end if;
      v_existing_id := null;
      v_existing_contract_safe := false;
      select
        event.id,
        app_private.sync_event_storage_is_bounded_v1(
          event.domain, event.event_type, event.source,
          event.source_device_id, event.client_event_id, event.entity_ids,
          event.metadata
        ) is true
        and app_private.sync_event_metadata_is_redacted(event.metadata) is true
        and app_private.sync_event_entity_ids_are_complete(
          event.domain, event.changed_count, event.entity_ids
        ) is true
        into v_existing_id, v_existing_contract_safe
        from public.sync_events event
        where owner_user_id = v_owner
          and client_event_id = p_client_event_id
          and (
            (p_shop_id is null and shop_id is null)
            or shop_id = p_shop_id
          );

      if found then
        if v_existing_contract_safe is not true then
          raise exception 'sync_event_existing_row_requires_recovery'
            using errcode = '55000';
        end if;
        select * into strict v_row
        from public.sync_events event
        where event.id = v_existing_id;
        if v_row.domain is distinct from p_domain
          or v_row.event_type is distinct from p_event_type
          or v_row.changed_count is distinct from p_changed_count
          or v_row.entity_ids is distinct from v_entity_ids
          or v_row.store_id is distinct from p_store_id
          or v_row.source is distinct from p_source
          or v_row.source_device_id is distinct from p_source_device_id
          or v_row.batch_id is distinct from p_batch_id
          or v_row.metadata is distinct from v_metadata then
          raise exception 'sync_event_client_event_id_conflict'
            using errcode = '23505';
        end if;
        return to_jsonb(v_row) || jsonb_build_object('id', v_row.id::text);
      end if;
    end if;

    raise;
end;
$$;

revoke all on function public.record_sync_event_v6(
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

grant execute on function public.record_sync_event_v6(
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

-- Admin mutations publish only through statement-level database triggers.
-- Any pre-existing compatibility RPC remains callable during expand; current
-- Admin code no longer invokes it, avoiding duplicate non-atomic publication.
create or replace function app_private.sync_checkpoint_sha256(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select encode(extensions.digest(coalesce(p_value, ''), 'sha256'), 'hex');
$$;

-- Constant-memory ordered digest.  The aggregate state is always a 64-byte
-- lowercase SHA-256 string, so checkpoint construction never materializes a
-- whole-domain string_agg in backend memory.  The byte length delimiter keeps
-- the chain unambiguous for arbitrary UTF-8 text values.
create or replace function app_private.sync_checkpoint_chain_step_v1(
  p_state text,
  p_value text
)
returns text
language sql
immutable
parallel safe
set search_path = app_private, pg_catalog, pg_temp
as $$
  select app_private.sync_checkpoint_sha256(
    coalesce(
      p_state,
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    ) || E'\x1f' || octet_length(convert_to(coalesce(p_value, ''), 'UTF8'))::text ||
    ':' || coalesce(p_value, '')
  );
$$;

drop aggregate if exists app_private.sync_checkpoint_chain_digest_v1(text);
create aggregate app_private.sync_checkpoint_chain_digest_v1(text) (
  sfunc = app_private.sync_checkpoint_chain_step_v1,
  stype = text,
  initcond = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
);
revoke all on function app_private.sync_checkpoint_chain_digest_v1(text)
  from public, anon, authenticated;

create or replace function app_private.sync_recovery_digest_contract_v1()
returns jsonb
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'rowSetAlgorithm', 'sha256-chain-v1',
    'seedHex',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'valueEncoding', 'utf8',
    'stepEncoding', 'previous-lowercase-hex + U+001F + decimal-byte-length + colon + value',
    'emptyDigest',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'checkpointAlgorithm', 'postgres-jsonb-text-sha256-v1'
  );
$$;

create or replace function app_private.sync_checkpoint_timestamp(
  p_value timestamptz
)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select case
    when p_value is null then '-'
    when not pg_catalog.isfinite(p_value) then '!nonfinite'
    else to_char(
      p_value at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  end;
$$;

-- Snapshot rows must use the exact same timestamp representation as the
-- checkpoint digest input. Unlike sync_checkpoint_timestamp(), JSON nulls
-- stay null instead of using the digest-only "-" sentinel.
create or replace function app_private.sync_checkpoint_json_timestamp(
  p_value timestamptz
)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
  select case
    when not pg_catalog.isfinite(p_value) then '!nonfinite'
    else to_char(
      p_value at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  end;
$$;

revoke all on function app_private.sync_checkpoint_sha256(text)
  from public, anon, authenticated;
revoke all on function app_private.sync_checkpoint_chain_step_v1(text, text)
  from public, anon, authenticated;
revoke all on function app_private.sync_recovery_digest_contract_v1()
  from public, anon, authenticated;
revoke all on function app_private.sync_checkpoint_timestamp(timestamptz)
  from public, anon, authenticated;
revoke all on function app_private.sync_checkpoint_json_timestamp(timestamptz)
  from public, anon, authenticated;

-- Checkpoint, snapshot pages and the incremental event tail must resolve the
-- exact same scope. Keep that policy in one private boundary so a mapped
-- legacy owner can never be included by one reader and omitted by another.
create or replace function app_private.resolve_shop_sync_recovery_scope(
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
stable
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_mapped_owner_id uuid;
  v_has_blocking_mapping boolean := false;
  v_has_shop_catalog_rows boolean := false;
  v_has_legacy_catalog_rows boolean := false;
  v_device_identifier text;
  v_account_key text;
  v_device_key text;
begin
  if auth.uid() is null then
    raise exception 'shop sync recovery requires authentication'
      using errcode = '28000';
  end if;

  if p_shop_id is null then
    raise exception 'shop sync recovery requires a shop id'
      using errcode = '22023';
  end if;

  if not app_private.is_active_shop_catalog_writer(p_shop_id) then
    raise exception 'shop sync recovery requires an active owner/manager shop binding'
      using errcode = '42501';
  end if;

  -- Bound the raw value before trimming it so whitespace cannot cause an
  -- unbounded intermediate allocation before the device lease check.
  if p_device_identifier is null
    or octet_length(p_device_identifier) > 160 then
    raise exception 'shop sync recovery requires a valid device identity'
      using errcode = '22023';
  end if;
  v_device_identifier := btrim(p_device_identifier);
  if octet_length(v_device_identifier) = 0 then
    raise exception 'shop sync recovery requires a valid device identity'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.shop_devices device
    where device.shop_id = p_shop_id
      and device.device_identifier = v_device_identifier
      and device.status = 'active'
      and device.revoked_at is null
  ) then
    raise exception 'shop sync recovery requires an active device lease'
      using errcode = '42501';
  end if;

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
  v_account_key := app_private.sync_checkpoint_sha256(lower(auth.uid()::text));
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

revoke all on function app_private.resolve_shop_sync_recovery_scope(uuid, text)
  from public, anon, authenticated;

create or replace function app_private.shop_sync_scope_event_max_id_v1(
  p_shop_id uuid,
  p_scope_kind text,
  p_mapped_owner_id uuid,
  p_authorized_legacy_owner_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  select coalesce(max(candidate.id), 0)
  from (
    select max(event.id) as id
    from public.sync_events event
    where event.shop_id = p_shop_id and event.domain = 'history'
    union all
    select max(event.id)
    from public.sync_events event
    where p_authorized_legacy_owner_id is not null
      and event.shop_id is null
      and event.owner_user_id = p_authorized_legacy_owner_id
      and event.domain = 'history'
    union all
    select max(event.id)
    from public.sync_events event
    where p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
      and event.shop_id = p_shop_id
      and event.domain in ('catalog', 'prices')
    union all
    select max(event.id)
    from public.sync_events event
    where p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
      and event.shop_id is null
      and event.owner_user_id = p_mapped_owner_id
      and event.domain in ('catalog', 'prices')
  ) candidate;
$$;

revoke all on function app_private.shop_sync_scope_event_max_id_v1(
  uuid, text, uuid, uuid
) from public, anon, authenticated;

create or replace function app_private.shop_sync_scope_domain_event_max_id_v1(
  p_shop_id uuid,
  p_scope_kind text,
  p_mapped_owner_id uuid,
  p_authorized_legacy_owner_id uuid,
  p_domain text,
  p_upper_event_id bigint default null
)
returns bigint
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  select case
    when p_domain not in ('catalog', 'prices', 'history') then null
    else coalesce(max(event.id), 0)
  end
  from public.sync_events event
  where event.domain = p_domain
    and (p_upper_event_id is null or event.id <= p_upper_event_id)
    and (
      (
        p_domain = 'history'
        and (
          event.shop_id = p_shop_id
          or (
            p_authorized_legacy_owner_id is not null
            and event.shop_id is null
            and event.owner_user_id = p_authorized_legacy_owner_id
          )
        )
      )
      or (
        p_domain in ('catalog', 'prices')
        and (
          (
            p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
            and event.shop_id = p_shop_id
          )
          or (
            p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
            and event.shop_id is null
            and event.owner_user_id = p_mapped_owner_id
          )
        )
      )
    );
$$;

create or replace function app_private.sync_recovery_domain_event_domain_v1(
  p_recovery_domain text
)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select case
    when p_recovery_domain in ('suppliers', 'categories', 'products', 'images')
      then 'catalog'
    when p_recovery_domain = 'prices' then 'prices'
    when p_recovery_domain = 'history' then 'history'
    else null
  end;
$$;

revoke all on function app_private.shop_sync_scope_domain_event_max_id_v1(
  uuid, text, uuid, uuid, text, bigint
) from public, anon, authenticated;
revoke all on function app_private.sync_recovery_domain_event_domain_v1(text)
  from public, anon, authenticated;

create or replace function app_private.sync_recovery_row_payload_limit_v1(
  p_domain text
)
returns integer
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select case p_domain
    when 'suppliers' then 16384
    when 'categories' then 16384
    when 'products' then 65536
    when 'prices' then 32768
    -- data and session_overlay are each historically accepted up to 512 KiB.
    -- The recovery DTO contains both plus bounded metadata.
    when 'history' then 1100000
    when 'images' then 16384
    else null
  end;
$$;

create or replace function app_private.sync_recovery_page_row_count_limit_v1(
  p_domain text
)
returns integer
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  -- These caps fit below the 4,000,000-byte row-payload budget even when
  -- every returned row reaches its maximum accepted serialized size.
  select case p_domain
    when 'suppliers' then 240
    when 'categories' then 240
    when 'products' then 60
    when 'prices' then 120
    when 'history' then 3
    when 'images' then 240
    else null
  end;
$$;

create or replace function app_private.sync_recovery_snapshot_payload_limit_v1(
  p_domain text
)
returns bigint
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select case p_domain
    when 'suppliers' then 33554432::bigint
    when 'categories' then 33554432::bigint
    when 'products' then 268435456::bigint
    when 'prices' then 268435456::bigint
    when 'history' then 268435456::bigint
    when 'images' then 67108864::bigint
    else null
  end;
$$;

create or replace function app_private.sync_recovery_row_count_limit_v1(
  p_domain text
)
returns bigint
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select case p_domain
    when 'suppliers' then 25000::bigint
    when 'categories' then 25000::bigint
    when 'products' then 125000::bigint
    when 'prices' then 175000::bigint
    when 'history' then 25000::bigint
    when 'images' then 125000::bigint
    else null
  end;
$$;

create or replace function app_private.sync_supplier_storage_is_bounded_v1(
  p_name text
)
returns boolean
language sql
stable
parallel safe
set search_path = app_private, pg_catalog, pg_temp
as $$
  select app_private.sync_text_storage_is_bounded_v1(
    p_name, 16388, 16384
  );
$$;

create or replace function app_private.sync_category_storage_is_bounded_v1(
  p_name text
)
returns boolean
language sql
stable
parallel safe
set search_path = app_private, pg_catalog, pg_temp
as $$
  select app_private.sync_text_storage_is_bounded_v1(
    p_name, 16388, 16384
  );
$$;

create or replace function app_private.sync_product_storage_is_bounded_v1(
  p_barcode text,
  p_item_number text,
  p_product_name text,
  p_second_product_name text
)
returns boolean
language plpgsql
stable
parallel safe
set search_path = app_private, pg_catalog, pg_temp
as $$
begin
  if not app_private.sync_text_storage_is_bounded_v1(
      p_barcode, 65540, 16384
    ) then
    return false;
  end if;
  if not coalesce(app_private.sync_text_storage_is_bounded_v1(
      p_item_number, 65540, 16384
    ), true) then
    return false;
  end if;
  if not coalesce(app_private.sync_text_storage_is_bounded_v1(
      p_product_name, 65540, 16384
    ), true) then
    return false;
  end if;
  if not coalesce(app_private.sync_text_storage_is_bounded_v1(
      p_second_product_name, 65540, 16384
    ), true) then
    return false;
  end if;
  return (
    pg_catalog.octet_length(p_barcode)
    + coalesce(pg_catalog.octet_length(p_item_number), 0)
    + coalesce(pg_catalog.octet_length(p_product_name), 0)
    + coalesce(pg_catalog.octet_length(p_second_product_name), 0)
  ) <= 66560;
end;
$$;

create or replace function app_private.sync_price_storage_is_bounded_v1(
  p_type text,
  p_effective_at text,
  p_source text,
  p_note text,
  p_created_at text
)
returns boolean
language plpgsql
stable
parallel safe
set search_path = app_private, pg_catalog, pg_temp
as $$
begin
  if not app_private.sync_text_storage_is_bounded_v1(
      p_type, 32772, 8192
    ) then
    return false;
  end if;
  if not app_private.sync_text_storage_is_bounded_v1(
      p_effective_at, 32772, 8192
    ) then
    return false;
  end if;
  if not coalesce(app_private.sync_text_storage_is_bounded_v1(
      p_source, 32772, 8192
    ), true) then
    return false;
  end if;
  if not coalesce(app_private.sync_text_storage_is_bounded_v1(
      p_note, 32772, 8192
    ), true) then
    return false;
  end if;
  if not app_private.sync_text_storage_is_bounded_v1(
      p_created_at, 32772, 8192
    ) then
    return false;
  end if;
  return (
    pg_catalog.octet_length(p_type)
    + pg_catalog.octet_length(p_effective_at)
    + coalesce(pg_catalog.octet_length(p_source), 0)
    + coalesce(pg_catalog.octet_length(p_note), 0)
    + pg_catalog.octet_length(p_created_at)
  ) <= 33792;
end;
$$;

create or replace function app_private.sync_history_storage_is_bounded_v1(
  p_remote_id text,
  p_timestamp text,
  p_supplier text,
  p_category text,
  p_display_name text,
  p_deleted_at timestamptz,
  p_data jsonb,
  p_session_overlay jsonb
)
returns boolean
language plpgsql
stable
parallel safe
set search_path = app_private, pg_catalog, pg_temp
as $$
begin
  if not app_private.sync_text_storage_is_bounded_v1(
      p_remote_id, 260, 256
    ) then
    return false;
  end if;
  if not app_private.sync_text_storage_is_bounded_v1(
      p_timestamp, 260, 256
    ) then
    return false;
  end if;
  if not app_private.sync_text_storage_is_bounded_v1(
      p_supplier, 65540, 16384
    ) then
    return false;
  end if;
  if not app_private.sync_text_storage_is_bounded_v1(
      p_category, 65540, 16384
    ) then
    return false;
  end if;
  if not app_private.sync_text_storage_is_bounded_v1(
      p_display_name, 65540, 16384
    ) then
    return false;
  end if;
  if (
      pg_catalog.octet_length(p_remote_id)
      + pg_catalog.octet_length(p_timestamp)
      + pg_catalog.octet_length(p_supplier)
      + pg_catalog.octet_length(p_category)
      + pg_catalog.octet_length(p_display_name)
    ) > 132096 then
    return false;
  end if;
  if p_deleted_at is not null then
    return true;
  end if;
  if not app_private.sync_jsonb_storage_is_bounded_v1(
      p_data, 1048576, 0
    ) then
    return false;
  end if;
  return coalesce(app_private.sync_jsonb_storage_is_bounded_v1(
    p_session_overlay, 1048576, 0
  ), true);
end;
$$;

create or replace function app_private.sync_image_storage_is_bounded_v1(
  p_status text,
  p_verified_main_sha256 text,
  p_verified_main_mime_type text,
  p_verified_thumb_sha256 text,
  p_verified_thumb_mime_type text
)
returns boolean
language plpgsql
stable
parallel safe
set search_path = app_private, pg_catalog, pg_temp
as $$
begin
  if not app_private.sync_text_storage_is_bounded_v1(
      p_status, 16388, 4096
    ) then
    return false;
  end if;
  if not app_private.sync_text_storage_is_bounded_v1(
      p_verified_main_sha256, 16388, 4096
    ) then
    return false;
  end if;
  if not app_private.sync_text_storage_is_bounded_v1(
      p_verified_main_mime_type, 16388, 4096
    ) then
    return false;
  end if;
  if not app_private.sync_text_storage_is_bounded_v1(
      p_verified_thumb_sha256, 16388, 4096
    ) then
    return false;
  end if;
  if not app_private.sync_text_storage_is_bounded_v1(
      p_verified_thumb_mime_type, 16388, 4096
    ) then
    return false;
  end if;
  return (
    pg_catalog.octet_length(p_status)
    + pg_catalog.octet_length(p_verified_main_sha256)
    + pg_catalog.octet_length(p_verified_main_mime_type)
    + pg_catalog.octet_length(p_verified_thumb_sha256)
    + pg_catalog.octet_length(p_verified_thumb_mime_type)
  ) <= 16384;
end;
$$;

create or replace function app_private.sync_recovery_payload_budgets_v1()
returns jsonb
language sql
immutable
parallel safe
set search_path = pg_catalog, app_private, pg_temp
as $$
  select jsonb_build_object(
    'maxResponseBytes', 4194304,
    'maxPageRowPayloadBytes', 4000000,
    'maxUncompressedJsonbStorageBytesBeforeLogicalValidation', 1048576,
    'compressedLegacyJsonbPolicy', 'fail-closed-before-detoast-v1',
    'maxSnapshotBytes', 536870912,
    'maxTotalRows', 350000,
    'maxPageRowsByDomain', jsonb_build_object(
      'suppliers', app_private.sync_recovery_page_row_count_limit_v1('suppliers'),
      'categories', app_private.sync_recovery_page_row_count_limit_v1('categories'),
      'products', app_private.sync_recovery_page_row_count_limit_v1('products'),
      'prices', app_private.sync_recovery_page_row_count_limit_v1('prices'),
      'history', app_private.sync_recovery_page_row_count_limit_v1('history'),
      'images', app_private.sync_recovery_page_row_count_limit_v1('images')
    ),
    'maxRowsByDomain', jsonb_build_object(
      'suppliers', app_private.sync_recovery_row_count_limit_v1('suppliers'),
      'categories', app_private.sync_recovery_row_count_limit_v1('categories'),
      'products', app_private.sync_recovery_row_count_limit_v1('products'),
      'prices', app_private.sync_recovery_row_count_limit_v1('prices'),
      'history', app_private.sync_recovery_row_count_limit_v1('history'),
      'images', app_private.sync_recovery_row_count_limit_v1('images')
    ),
    'maxRowBytesByDomain', jsonb_build_object(
      'suppliers', app_private.sync_recovery_row_payload_limit_v1('suppliers'),
      'categories', app_private.sync_recovery_row_payload_limit_v1('categories'),
      'products', app_private.sync_recovery_row_payload_limit_v1('products'),
      'prices', app_private.sync_recovery_row_payload_limit_v1('prices'),
      'history', app_private.sync_recovery_row_payload_limit_v1('history'),
      'images', app_private.sync_recovery_row_payload_limit_v1('images')
    ),
    'maxSnapshotBytesByDomain', jsonb_build_object(
      'suppliers', app_private.sync_recovery_snapshot_payload_limit_v1('suppliers'),
      'categories', app_private.sync_recovery_snapshot_payload_limit_v1('categories'),
      'products', app_private.sync_recovery_snapshot_payload_limit_v1('products'),
      'prices', app_private.sync_recovery_snapshot_payload_limit_v1('prices'),
      'history', app_private.sync_recovery_snapshot_payload_limit_v1('history'),
      'images', app_private.sync_recovery_snapshot_payload_limit_v1('images')
    )
  );
$$;

create or replace function app_private.sync_recovery_preflight_counts_v1(
  p_shop_id uuid,
  p_scope_kind text,
  p_mapped_owner_id uuid,
  p_authorized_legacy_owner_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_suppliers bigint;
  v_categories bigint;
  v_products bigint;
  v_prices bigint;
  v_history bigint;
  v_images bigint;
  v_total bigint;
  v_violation_count integer;
  v_row_violation_count integer := 0;
  v_storage_violation_count integer := 0;
  v_supplier_storage_violation boolean := false;
  v_category_storage_violation boolean := false;
  v_product_storage_violation boolean := false;
  v_price_storage_violation boolean := false;
  v_history_storage_violation boolean := false;
  v_image_storage_violation boolean := false;
  v_active_compressed_history_count bigint := 0;
  v_supplier_row public.inventory_suppliers%rowtype;
  v_category_row public.inventory_categories%rowtype;
  v_product_row public.inventory_products%rowtype;
  v_price_row public.inventory_product_prices%rowtype;
  v_history_row public.shared_sheet_sessions%rowtype;
  v_image_record record;
  v_recovery_row jsonb;
  v_row_bytes bigint := 0;
  v_total_payload_bytes bigint := 0;
  v_supplier_payload_bytes bigint := 0;
  v_category_payload_bytes bigint := 0;
  v_product_payload_bytes bigint := 0;
  v_price_payload_bytes bigint := 0;
  v_history_payload_bytes bigint := 0;
  v_image_payload_bytes bigint := 0;
  v_payload_violation_domain text;
  v_payload_violation_reason text;
begin
  -- Each count saturates at domain_limit + 1.  This is enough to decide the
  -- resource contract and prevents a maliciously large scope from forcing six
  -- unbounded full-table counts before the checkpoint can fail closed.
  select count(*) into v_suppliers from (
    select 1 from public.inventory_suppliers row
    where (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy') and row.shop_id = p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id = p_mapped_owner_id)
    limit app_private.sync_recovery_row_count_limit_v1('suppliers') + 1
  ) bounded;
  select count(*) into v_categories from (
    select 1 from public.inventory_categories row
    where (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy') and row.shop_id = p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id = p_mapped_owner_id)
    limit app_private.sync_recovery_row_count_limit_v1('categories') + 1
  ) bounded;
  select count(*) into v_products from (
    select 1 from public.inventory_products row
    where (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy') and row.shop_id = p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id = p_mapped_owner_id)
    limit app_private.sync_recovery_row_count_limit_v1('products') + 1
  ) bounded;
  select count(*) into v_prices from (
    select 1 from public.inventory_product_prices row
    where (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy') and row.shop_id = p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id = p_mapped_owner_id)
    limit app_private.sync_recovery_row_count_limit_v1('prices') + 1
  ) bounded;
  select count(*) into v_history from (
    select 1 from public.shared_sheet_sessions row
    where row.shop_id = p_shop_id or (
      row.shop_id is null and p_authorized_legacy_owner_id is not null
      and row.owner_user_id = p_authorized_legacy_owner_id
    )
    limit app_private.sync_recovery_row_count_limit_v1('history') + 1
  ) bounded;
  select count(*) into v_images from (
    select 1
    from public.inventory_products product
    join public.inventory_product_image_versions version
      on version.id = product.primary_image_version_id
      and version.product_id = product.id
      and version.shop_id = p_shop_id
      and version.status = 'ready'
      and version.removed_at is null
    where (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy') and product.shop_id = p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and product.shop_id is null and product.owner_user_id = p_mapped_owner_id)
    limit app_private.sync_recovery_row_count_limit_v1('images') + 1
  ) bounded;

  v_total := v_suppliers + v_categories + v_products + v_prices + v_history + v_images;
  v_row_violation_count :=
    case when v_suppliers > app_private.sync_recovery_row_count_limit_v1('suppliers') then 1 else 0 end +
    case when v_categories > app_private.sync_recovery_row_count_limit_v1('categories') then 1 else 0 end +
    case when v_products > app_private.sync_recovery_row_count_limit_v1('products') then 1 else 0 end +
    case when v_prices > app_private.sync_recovery_row_count_limit_v1('prices') then 1 else 0 end +
    case when v_history > app_private.sync_recovery_row_count_limit_v1('history') then 1 else 0 end +
    case when v_images > app_private.sync_recovery_row_count_limit_v1('images') then 1 else 0 end +
    case when v_total > 350000 then 1 else 0 end;

  if v_row_violation_count > 0 then
    return jsonb_build_object(
      'resourceExceeded', true,
      'violationCount', v_row_violation_count,
      'storageViolationCount', null,
      'storageScanStatus', 'skipped_row_limit_exceeded',
      'storageViolations', null,
      'totalRowCount', v_total,
      'rowCounts', jsonb_build_object(
        'suppliers', v_suppliers, 'categories', v_categories,
        'products', v_products, 'prices', v_prices,
        'history', v_history, 'images', v_images
      )
    );
  end if;

  select count(*)
  into v_active_compressed_history_count
  from public.shared_sheet_sessions row
  where (row.shop_id = p_shop_id or (
      row.shop_id is null and p_authorized_legacy_owner_id is not null
      and row.owner_user_id = p_authorized_legacy_owner_id))
    and row.deleted_at is null
    and (
      pg_catalog.pg_column_compression(row.data) is not null
      or (
        row.session_overlay is not null
        and pg_catalog.pg_column_compression(row.session_overlay) is not null
      )
    );
  if v_active_compressed_history_count > 0 then
    return jsonb_build_object(
      'resourceExceeded', true,
      'violationCount', 1,
      'storageViolationCount', 1,
      'storageScanStatus', 'compressed_legacy_history_requires_remediation',
      'activeCompressedHistoryCount', v_active_compressed_history_count,
      'storageViolations', jsonb_build_object(
        'suppliers', false, 'categories', false, 'products', false,
        'prices', false, 'history', true, 'images', false
      ),
      'totalRowCount', v_total,
      'rowCounts', jsonb_build_object(
        'suppliers', v_suppliers, 'categories', v_categories,
        'products', v_products, 'prices', v_prices,
        'history', v_history, 'images', v_images
      )
    );
  end if;

  -- Exact cumulative payload preflight.  Each row is storage/shape guarded
  -- before serialization and the scan exits as soon as a row, domain or total
  -- snapshot budget is crossed.  This bounds work to the published budget plus
  -- at most one already-bounded row instead of aggregating an entire huge scope.
  <<payload_scan>>
  begin
    for v_supplier_row in
      select row.* from public.inventory_suppliers row
      where (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
          and row.shop_id = p_shop_id)
        or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
          and row.shop_id is null and row.owner_user_id = p_mapped_owner_id)
      order by row.id
    loop
      if app_private.sync_supplier_storage_is_bounded_v1(v_supplier_row.name)
          is not true then
        v_payload_violation_domain := 'suppliers';
        v_payload_violation_reason := 'row_storage_invalid';
        exit payload_scan;
      end if;
      v_recovery_row := app_private.sync_supplier_recovery_row_v1(
        v_supplier_row.id, v_supplier_row.owner_user_id, v_supplier_row.name,
        v_supplier_row.updated_at, v_supplier_row.deleted_at,
        v_supplier_row.shop_id
      );
      v_row_bytes := octet_length(v_recovery_row::text);
      v_supplier_payload_bytes := v_supplier_payload_bytes + v_row_bytes;
      v_total_payload_bytes := v_total_payload_bytes + v_row_bytes;
      if v_row_bytes > app_private.sync_recovery_row_payload_limit_v1('suppliers')
        or v_supplier_payload_bytes >
          app_private.sync_recovery_snapshot_payload_limit_v1('suppliers')
        or v_total_payload_bytes > 536870912 then
        v_payload_violation_domain := 'suppliers';
        v_payload_violation_reason := 'payload_budget_exceeded';
        exit payload_scan;
      end if;
    end loop;

    for v_category_row in
      select row.* from public.inventory_categories row
      where (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
          and row.shop_id = p_shop_id)
        or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
          and row.shop_id is null and row.owner_user_id = p_mapped_owner_id)
      order by row.id
    loop
      if app_private.sync_category_storage_is_bounded_v1(v_category_row.name)
          is not true then
        v_payload_violation_domain := 'categories';
        v_payload_violation_reason := 'row_storage_invalid';
        exit payload_scan;
      end if;
      v_recovery_row := app_private.sync_category_recovery_row_v1(
        v_category_row.id, v_category_row.owner_user_id, v_category_row.name,
        v_category_row.updated_at, v_category_row.deleted_at,
        v_category_row.shop_id
      );
      v_row_bytes := octet_length(v_recovery_row::text);
      v_category_payload_bytes := v_category_payload_bytes + v_row_bytes;
      v_total_payload_bytes := v_total_payload_bytes + v_row_bytes;
      if v_row_bytes > app_private.sync_recovery_row_payload_limit_v1('categories')
        or v_category_payload_bytes >
          app_private.sync_recovery_snapshot_payload_limit_v1('categories')
        or v_total_payload_bytes > 536870912 then
        v_payload_violation_domain := 'categories';
        v_payload_violation_reason := 'payload_budget_exceeded';
        exit payload_scan;
      end if;
    end loop;

    for v_product_row in
      select row.* from public.inventory_products row
      where (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
          and row.shop_id = p_shop_id)
        or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
          and row.shop_id is null and row.owner_user_id = p_mapped_owner_id)
      order by row.id
    loop
      if app_private.sync_product_storage_is_bounded_v1(
          v_product_row.barcode, v_product_row.item_number,
          v_product_row.product_name, v_product_row.second_product_name
        ) is not true then
        v_payload_violation_domain := 'products';
        v_payload_violation_reason := 'row_storage_invalid';
        exit payload_scan;
      end if;
      v_recovery_row := app_private.sync_product_recovery_row_v1(
        v_product_row.id, v_product_row.owner_user_id, v_product_row.barcode,
        v_product_row.item_number, v_product_row.product_name,
        v_product_row.second_product_name, v_product_row.purchase_price,
        v_product_row.retail_price, v_product_row.supplier_id,
        v_product_row.category_id, v_product_row.stock_quantity,
        v_product_row.updated_at, v_product_row.deleted_at,
        v_product_row.shop_id, v_product_row.primary_image_version_id,
        v_product_row.primary_image_updated_at
      );
      v_row_bytes := octet_length(v_recovery_row::text);
      v_product_payload_bytes := v_product_payload_bytes + v_row_bytes;
      v_total_payload_bytes := v_total_payload_bytes + v_row_bytes;
      if v_row_bytes > app_private.sync_recovery_row_payload_limit_v1('products')
        or v_product_payload_bytes >
          app_private.sync_recovery_snapshot_payload_limit_v1('products')
        or v_total_payload_bytes > 536870912 then
        v_payload_violation_domain := 'products';
        v_payload_violation_reason := 'payload_budget_exceeded';
        exit payload_scan;
      end if;
    end loop;

    for v_price_row in
      select row.* from public.inventory_product_prices row
      where (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
          and row.shop_id = p_shop_id)
        or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
          and row.shop_id is null and row.owner_user_id = p_mapped_owner_id)
      order by row.id
    loop
      if app_private.sync_price_storage_is_bounded_v1(
          v_price_row.type, v_price_row.effective_at, v_price_row.source,
          v_price_row.note, v_price_row.created_at
        ) is not true then
        v_payload_violation_domain := 'prices';
        v_payload_violation_reason := 'row_storage_invalid';
        exit payload_scan;
      end if;
      v_recovery_row := app_private.sync_price_recovery_row_v1(
        v_price_row.id, v_price_row.owner_user_id, v_price_row.product_id,
        v_price_row.type, v_price_row.price, v_price_row.effective_at,
        v_price_row.source, v_price_row.note, v_price_row.created_at,
        v_price_row.shop_id, v_price_row.updated_at
      );
      v_row_bytes := octet_length(v_recovery_row::text);
      v_price_payload_bytes := v_price_payload_bytes + v_row_bytes;
      v_total_payload_bytes := v_total_payload_bytes + v_row_bytes;
      if v_row_bytes > app_private.sync_recovery_row_payload_limit_v1('prices')
        or v_price_payload_bytes >
          app_private.sync_recovery_snapshot_payload_limit_v1('prices')
        or v_total_payload_bytes > 536870912 then
        v_payload_violation_domain := 'prices';
        v_payload_violation_reason := 'payload_budget_exceeded';
        exit payload_scan;
      end if;
    end loop;

    for v_history_row in
      select row.* from public.shared_sheet_sessions row
      where row.shop_id = p_shop_id or (
        row.shop_id is null and p_authorized_legacy_owner_id is not null
        and row.owner_user_id = p_authorized_legacy_owner_id
      )
    loop
      if app_private.sync_history_storage_is_bounded_v1(
          v_history_row.remote_id, v_history_row."timestamp",
          v_history_row.supplier, v_history_row.category,
          v_history_row.display_name, v_history_row.deleted_at,
          case when v_history_row.deleted_at is null
            then v_history_row.data else null end,
          case when v_history_row.deleted_at is null
            then v_history_row.session_overlay else null end
        ) is not true then
        v_payload_violation_domain := 'history';
        v_payload_violation_reason := 'row_storage_or_shape_invalid';
        exit payload_scan;
      end if;
      if app_private.sync_history_active_payload_is_valid_v1(
          v_history_row."timestamp", v_history_row.deleted_at,
          case when v_history_row.deleted_at is null
            then v_history_row.data else null end,
          case when v_history_row.deleted_at is null
            then v_history_row.session_overlay else null end
        ) is not true then
        v_payload_violation_domain := 'history';
        v_payload_violation_reason := 'row_storage_or_shape_invalid';
        exit payload_scan;
      end if;
      v_recovery_row := app_private.sync_history_recovery_row_v1(
        v_history_row.remote_id, v_history_row.payload_version,
        v_history_row."timestamp", v_history_row.supplier,
        v_history_row.category, v_history_row.is_manual_entry,
        v_history_row.updated_at, v_history_row.owner_user_id,
        v_history_row.display_name, v_history_row.deleted_at,
        v_history_row.shop_id,
        case when v_history_row.deleted_at is null
          then v_history_row.data else null end,
        case when v_history_row.deleted_at is null
          then v_history_row.session_overlay else null end
      );
      v_row_bytes := octet_length(v_recovery_row::text);
      v_history_payload_bytes := v_history_payload_bytes + v_row_bytes;
      v_total_payload_bytes := v_total_payload_bytes + v_row_bytes;
      if v_row_bytes > app_private.sync_recovery_row_payload_limit_v1('history')
        or v_history_payload_bytes >
          app_private.sync_recovery_snapshot_payload_limit_v1('history')
        or v_total_payload_bytes > 536870912 then
        v_payload_violation_domain := 'history';
        v_payload_violation_reason := 'payload_budget_exceeded';
        exit payload_scan;
      end if;
    end loop;

    for v_image_record in
      select
        product.id as product_id,
        product.owner_user_id,
        product.shop_id as product_shop_id,
        product.deleted_at as product_deleted_at,
        version.id as version_id,
        version.status,
        version.finalized_at,
        version.verified_main_sha256,
        version.verified_main_bytes,
        version.verified_main_width,
        version.verified_main_height,
        version.verified_main_mime_type,
        version.verified_thumb_sha256,
        version.verified_thumb_bytes,
        version.verified_thumb_width,
        version.verified_thumb_height,
        version.verified_thumb_mime_type
      from public.inventory_products product
      join public.inventory_product_image_versions version
        on version.id = product.primary_image_version_id
        and version.product_id = product.id
        and version.shop_id = p_shop_id
        and version.status = 'ready'
        and version.removed_at is null
      where (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
          and product.shop_id = p_shop_id)
        or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
          and product.shop_id is null and product.owner_user_id = p_mapped_owner_id)
      order by product.id
    loop
      if app_private.sync_image_storage_is_bounded_v1(
          v_image_record.status, v_image_record.verified_main_sha256,
          v_image_record.verified_main_mime_type,
          v_image_record.verified_thumb_sha256,
          v_image_record.verified_thumb_mime_type
        ) is not true then
        v_payload_violation_domain := 'images';
        v_payload_violation_reason := 'row_storage_invalid';
        exit payload_scan;
      end if;
      v_recovery_row := app_private.sync_image_recovery_row_v1(
        v_image_record.product_id, v_image_record.owner_user_id,
        v_image_record.product_shop_id, v_image_record.product_deleted_at,
        v_image_record.version_id, v_image_record.status,
        v_image_record.finalized_at, v_image_record.verified_main_sha256,
        v_image_record.verified_main_bytes,
        v_image_record.verified_main_width,
        v_image_record.verified_main_height,
        v_image_record.verified_main_mime_type,
        v_image_record.verified_thumb_sha256,
        v_image_record.verified_thumb_bytes,
        v_image_record.verified_thumb_width,
        v_image_record.verified_thumb_height,
        v_image_record.verified_thumb_mime_type
      );
      v_row_bytes := octet_length(v_recovery_row::text);
      v_image_payload_bytes := v_image_payload_bytes + v_row_bytes;
      v_total_payload_bytes := v_total_payload_bytes + v_row_bytes;
      if v_row_bytes > app_private.sync_recovery_row_payload_limit_v1('images')
        or v_image_payload_bytes >
          app_private.sync_recovery_snapshot_payload_limit_v1('images')
        or v_total_payload_bytes > 536870912 then
        v_payload_violation_domain := 'images';
        v_payload_violation_reason := 'payload_budget_exceeded';
        exit payload_scan;
      end if;
    end loop;
  end payload_scan;

  if v_payload_violation_domain is not null then
    return jsonb_build_object(
      'resourceExceeded', true,
      'violationCount', 1,
      'storageViolationCount', 1,
      'storageScanStatus', v_payload_violation_reason,
      'activeCompressedHistoryCount', v_active_compressed_history_count,
      'violationDomain', v_payload_violation_domain,
      'preflightPayloadBytes', v_total_payload_bytes,
      'storageViolations', jsonb_build_object(
        'suppliers', v_payload_violation_domain = 'suppliers',
        'categories', v_payload_violation_domain = 'categories',
        'products', v_payload_violation_domain = 'products',
        'prices', v_payload_violation_domain = 'prices',
        'history', v_payload_violation_domain = 'history',
        'images', v_payload_violation_domain = 'images'
      ),
      'totalRowCount', v_total,
      'rowCounts', jsonb_build_object(
        'suppliers', v_suppliers, 'categories', v_categories,
        'products', v_products, 'prices', v_prices,
        'history', v_history, 'images', v_images
      )
    );
  end if;

  -- The bounded cumulative scan above already validated and serialized every
  -- scoped row. A second set of full-scope EXISTS scans would duplicate the
  -- expensive DTO work without adding evidence.
  v_storage_violation_count := 0;
  v_violation_count := 0;

  return jsonb_build_object(
    'resourceExceeded', v_violation_count > 0,
    'violationCount', v_violation_count,
    'storageViolationCount', v_storage_violation_count,
    'storageScanStatus', 'complete',
    'activeCompressedHistoryCount', v_active_compressed_history_count,
    'preflightPayloadBytes', v_total_payload_bytes,
    'storageViolations', jsonb_build_object(
      'suppliers', false,
      'categories', false,
      'products', false,
      'prices', false,
      'history', false,
      'images', false
    ),
    'totalRowCount', v_total,
    'rowCounts', jsonb_build_object(
      'suppliers', v_suppliers, 'categories', v_categories,
      'products', v_products, 'prices', v_prices,
      'history', v_history, 'images', v_images
    )
  );
end;
$$;

revoke all on function app_private.sync_recovery_payload_budgets_v1()
  from public, anon, authenticated;
revoke all on function app_private.sync_text_storage_is_bounded_v1(
  text, integer, integer
) from public, anon, authenticated;
revoke all on function app_private.sync_jsonb_storage_is_bounded_v1(
  jsonb, integer, integer
) from public, anon, authenticated;
revoke all on function app_private.sync_supplier_storage_is_bounded_v1(
  text
) from public, anon, authenticated;
revoke all on function app_private.sync_category_storage_is_bounded_v1(
  text
) from public, anon, authenticated;
revoke all on function app_private.sync_product_storage_is_bounded_v1(
  text, text, text, text
) from public, anon, authenticated;
revoke all on function app_private.sync_price_storage_is_bounded_v1(
  text, text, text, text, text
) from public, anon, authenticated;
revoke all on function app_private.sync_history_storage_is_bounded_v1(
  text, text, text, text, text, timestamptz, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function app_private.sync_image_storage_is_bounded_v1(
  text, text, text, text, text
) from public, anon, authenticated;
revoke all on function app_private.sync_recovery_preflight_counts_v1(
  uuid, text, uuid, uuid
) from public, anon, authenticated;

create or replace function app_private.sync_legacy_timestamp_is_canonical_v1(
  p_value text
)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
declare
  v_timestamp timestamp without time zone;
begin
  if p_value is null
    or p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$' then
    return false;
  end if;

  v_timestamp := p_value::timestamp without time zone;
  return to_char(v_timestamp, 'YYYY-MM-DD HH24:MI:SS') = p_value;
exception
  when others then
    return false;
end;
$$;

create or replace function app_private.sync_history_data_is_typed_v1(
  p_data jsonb
)
returns boolean
language plpgsql
stable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
declare
  v_row jsonb;
begin
  if p_data is null then
    return false;
  end if;
  if not app_private.sync_jsonb_storage_is_bounded_v1(
      p_data, 1048576, 0
    ) then
    return false;
  end if;
  if jsonb_typeof(p_data) <> 'array' then
    return false;
  end if;

  for v_row in select value from jsonb_array_elements(p_data)
  loop
    if jsonb_typeof(v_row) <> 'array'
      or exists (
        select 1
        from jsonb_array_elements(v_row) cell(value)
        where jsonb_typeof(cell.value) <> 'string'
      ) then
      return false;
    end if;
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function app_private.sync_history_overlay_is_typed_v1(
  p_overlay jsonb
)
returns boolean
language plpgsql
stable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
declare
  v_row jsonb;
begin
  if p_overlay is null then
    return true;
  end if;

  if not app_private.sync_jsonb_storage_is_bounded_v1(
      p_overlay, 1048576, 0
    ) then
    return false;
  end if;
  if jsonb_typeof(p_overlay) <> 'object' then
    return false;
  end if;
  if (select count(*) from jsonb_object_keys(p_overlay)) <> 3
    or not p_overlay ? 'overlay_schema'
    or not p_overlay ? 'editable'
    or not p_overlay ? 'complete' then
    return false;
  end if;
  if p_overlay->'overlay_schema' <> '1'::jsonb
    or jsonb_typeof(p_overlay->'editable') <> 'array'
    or jsonb_typeof(p_overlay->'complete') <> 'array' then
    return false;
  end if;

  for v_row in select value from jsonb_array_elements(p_overlay->'editable')
  loop
    if jsonb_typeof(v_row) <> 'array'
      or exists (
        select 1
        from jsonb_array_elements(v_row) cell(value)
        where jsonb_typeof(cell.value) <> 'string'
      ) then
      return false;
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_overlay->'complete') flag(value)
    where jsonb_typeof(flag.value) <> 'boolean'
  ) then
    return false;
  end if;

  if octet_length(p_overlay::text) > 524288 then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function app_private.sync_history_active_payload_is_valid_v1(
  p_timestamp text,
  p_deleted_at timestamptz,
  p_data jsonb,
  p_session_overlay jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = app_private, pg_catalog, pg_temp
as $$
begin
  if p_deleted_at is not null then
    return true;
  end if;
  if p_timestamp is null or app_private.sync_text_storage_is_bounded_v1(
      p_timestamp, 260, 256
    ) is not true then
    return false;
  end if;
  if p_data is null or app_private.sync_jsonb_storage_is_bounded_v1(
      p_data, 1048576, 0
    ) is not true then
    return false;
  end if;
  if not coalesce(app_private.sync_jsonb_storage_is_bounded_v1(
      p_session_overlay, 1048576, 0
    ), true) then
    return false;
  end if;
  if not app_private.sync_legacy_timestamp_is_canonical_v1(
      p_timestamp
    ) then
    return false;
  end if;
  if app_private.sync_history_data_is_typed_v1(p_data) is not true then
    return false;
  end if;
  if app_private.sync_history_overlay_is_typed_v1(
      p_session_overlay
    ) is not true then
    return false;
  end if;
  return octet_length(p_data::text) <= 524288;
exception when others then
  return false;
end;
$$;

create or replace function app_private.sync_price_value_is_canonical_v1(
  p_price double precision
)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_price is null
    or p_price::text in ('NaN', 'Infinity', '-Infinity')
    or p_price < 0
    or p_price > 999999999999.999 then
    return false;
  end if;

  return p_price::numeric = round(p_price::numeric, 3);
exception
  when others then
    return false;
end;
$$;

create or replace function app_private.sync_price_canonical_amount_v1(
  p_price double precision
)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select trim_scale(round(p_price::numeric, 3))::text;
$$;

create or replace function app_private.sync_product_number_is_materializable_v1(
  p_value double precision
)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select p_value is null
    or (
      p_value::text not in ('NaN', 'Infinity', '-Infinity')
      and p_value >= 0
    );
$$;

create or replace function app_private.sync_supplier_recovery_row_v1(
  p_id uuid,
  p_owner_user_id uuid,
  p_name text,
  p_updated_at timestamptz,
  p_deleted_at timestamptz,
  p_shop_id uuid
)
returns jsonb
language sql
stable
parallel safe
set search_path = app_private, pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'id', p_id,
    'owner_user_id', p_owner_user_id,
    'name', p_name,
    'updated_at', app_private.sync_checkpoint_json_timestamp(p_updated_at),
    'deleted_at', app_private.sync_checkpoint_json_timestamp(p_deleted_at),
    'shop_id', p_shop_id
  );
$$;

create or replace function app_private.sync_category_recovery_row_v1(
  p_id uuid,
  p_owner_user_id uuid,
  p_name text,
  p_updated_at timestamptz,
  p_deleted_at timestamptz,
  p_shop_id uuid
)
returns jsonb
language sql
stable
parallel safe
set search_path = app_private, pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'id', p_id,
    'owner_user_id', p_owner_user_id,
    'name', p_name,
    'updated_at', app_private.sync_checkpoint_json_timestamp(p_updated_at),
    'deleted_at', app_private.sync_checkpoint_json_timestamp(p_deleted_at),
    'shop_id', p_shop_id
  );
$$;

create or replace function app_private.sync_product_recovery_row_v1(
  p_id uuid,
  p_owner_user_id uuid,
  p_barcode text,
  p_item_number text,
  p_product_name text,
  p_second_product_name text,
  p_purchase_price double precision,
  p_retail_price double precision,
  p_supplier_id uuid,
  p_category_id uuid,
  p_stock_quantity double precision,
  p_updated_at timestamptz,
  p_deleted_at timestamptz,
  p_shop_id uuid,
  p_primary_image_version_id uuid,
  p_primary_image_updated_at timestamptz
)
returns jsonb
language sql
stable
parallel safe
set search_path = app_private, pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'id', p_id,
    'owner_user_id', p_owner_user_id,
    'barcode', p_barcode,
    'item_number', p_item_number,
    'product_name', p_product_name,
    'second_product_name', p_second_product_name,
    'purchase_price', p_purchase_price,
    'retail_price', p_retail_price,
    'stock_quantity', p_stock_quantity,
    'shop_id', p_shop_id,
    -- A tombstone is an identity/version marker, not a live relation graph.
    -- Stripping its catalog parents prevents a later mapping disable from
    -- leaking stale cross-scope UUIDs through recovery.
    'category_id', case
      when p_deleted_at is null then p_category_id
      else null::uuid
    end,
    'supplier_id', case
      when p_deleted_at is null then p_supplier_id
      else null::uuid
    end,
    'primary_image_version_id', case
      when p_deleted_at is null then p_primary_image_version_id
      else null::uuid
    end,
    'updated_at',
      app_private.sync_checkpoint_json_timestamp(p_updated_at),
    'deleted_at',
      app_private.sync_checkpoint_json_timestamp(p_deleted_at),
    'primary_image_updated_at',
      case when p_deleted_at is null then
        app_private.sync_checkpoint_json_timestamp(
          p_primary_image_updated_at
        )
      else null end
  );
$$;

create or replace function app_private.sync_price_recovery_row_v1(
  p_id uuid,
  p_owner_user_id uuid,
  p_product_id uuid,
  p_type text,
  p_price double precision,
  p_effective_at text,
  p_source text,
  p_note text,
  p_created_at text,
  p_shop_id uuid,
  p_updated_at timestamptz
)
returns jsonb
language sql
stable
parallel safe
set search_path = app_private, pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'id', p_id,
    'owner_user_id', p_owner_user_id,
    'product_id', p_product_id,
    'type', p_type,
    'price', p_price,
    -- Clients must never derive the digest amount through a binary floating
    -- point round-trip.  Keep the legacy numeric field for compatibility, but
    -- publish the exact server-canonical decimal used by versionDigest too.
    'price_canonical', case
      when app_private.sync_price_value_is_canonical_v1(p_price)
        then app_private.sync_price_canonical_amount_v1(p_price)
      else null
    end,
    'effective_at', p_effective_at,
    'source', p_source,
    'note', p_note,
    'created_at', p_created_at,
    'shop_id', p_shop_id,
    'updated_at', app_private.sync_checkpoint_json_timestamp(p_updated_at)
  );
$$;

create or replace function app_private.sync_image_recovery_row_v1(
  p_product_id uuid,
  p_owner_user_id uuid,
  p_product_shop_id uuid,
  p_product_deleted_at timestamptz,
  p_version_id uuid,
  p_status text,
  p_finalized_at timestamptz,
  p_verified_main_sha256 text,
  p_verified_main_bytes integer,
  p_verified_main_width integer,
  p_verified_main_height integer,
  p_verified_main_mime_type text,
  p_verified_thumb_sha256 text,
  p_verified_thumb_bytes integer,
  p_verified_thumb_width integer,
  p_verified_thumb_height integer,
  p_verified_thumb_mime_type text
)
returns jsonb
language sql
stable
parallel safe
set search_path = app_private, pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'product_id', p_product_id,
    'owner_user_id', p_owner_user_id,
    'shop_id', p_product_shop_id,
    'product_deleted_at',
      app_private.sync_checkpoint_json_timestamp(p_product_deleted_at),
    'version_id', p_version_id,
    'status', p_status,
    'finalized_at',
      app_private.sync_checkpoint_json_timestamp(p_finalized_at),
    'main', jsonb_build_object(
      'sha256', p_verified_main_sha256,
      'bytes', p_verified_main_bytes,
      'width', p_verified_main_width,
      'height', p_verified_main_height,
      'mime', p_verified_main_mime_type
    ),
    'thumb', jsonb_build_object(
      'sha256', p_verified_thumb_sha256,
      'bytes', p_verified_thumb_bytes,
      'width', p_verified_thumb_width,
      'height', p_verified_thumb_height,
      'mime', p_verified_thumb_mime_type
    )
  );
$$;

create or replace function app_private.sync_supplier_recovery_row_fits_v1(
  p_id uuid,
  p_owner_user_id uuid,
  p_name text,
  p_updated_at timestamptz,
  p_deleted_at timestamptz,
  p_shop_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = app_private, pg_catalog, pg_temp
as $$
begin
  if app_private.sync_supplier_storage_is_bounded_v1(p_name) is not true then
    return false;
  end if;
  return octet_length(
    app_private.sync_supplier_recovery_row_v1(
      p_id, p_owner_user_id, p_name, p_updated_at, p_deleted_at, p_shop_id
    )::text
  ) <= app_private.sync_recovery_row_payload_limit_v1('suppliers');
exception when others then return false;
end;
$$;

create or replace function app_private.sync_category_recovery_row_fits_v1(
  p_id uuid,
  p_owner_user_id uuid,
  p_name text,
  p_updated_at timestamptz,
  p_deleted_at timestamptz,
  p_shop_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = app_private, pg_catalog, pg_temp
as $$
begin
  if app_private.sync_category_storage_is_bounded_v1(p_name) is not true then
    return false;
  end if;
  return octet_length(
    app_private.sync_category_recovery_row_v1(
      p_id, p_owner_user_id, p_name, p_updated_at, p_deleted_at, p_shop_id
    )::text
  ) <= app_private.sync_recovery_row_payload_limit_v1('categories');
exception when others then return false;
end;
$$;

create or replace function app_private.sync_product_recovery_row_fits_v1(
  p_id uuid,
  p_owner_user_id uuid,
  p_barcode text,
  p_item_number text,
  p_product_name text,
  p_second_product_name text,
  p_purchase_price double precision,
  p_retail_price double precision,
  p_supplier_id uuid,
  p_category_id uuid,
  p_stock_quantity double precision,
  p_updated_at timestamptz,
  p_deleted_at timestamptz,
  p_shop_id uuid,
  p_primary_image_version_id uuid,
  p_primary_image_updated_at timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = app_private, pg_catalog, pg_temp
as $$
begin
  if app_private.sync_product_storage_is_bounded_v1(
      p_barcode, p_item_number, p_product_name, p_second_product_name
    ) is not true then
    return false;
  end if;
  return octet_length(
    app_private.sync_product_recovery_row_v1(
      p_id, p_owner_user_id, p_barcode, p_item_number, p_product_name,
      p_second_product_name, p_purchase_price, p_retail_price, p_supplier_id,
      p_category_id, p_stock_quantity, p_updated_at, p_deleted_at, p_shop_id,
      p_primary_image_version_id, p_primary_image_updated_at
    )::text
  ) <= app_private.sync_recovery_row_payload_limit_v1('products');
exception when others then return false;
end;
$$;

create or replace function app_private.sync_price_recovery_row_fits_v1(
  p_id uuid,
  p_owner_user_id uuid,
  p_product_id uuid,
  p_type text,
  p_price double precision,
  p_effective_at text,
  p_source text,
  p_note text,
  p_created_at text,
  p_shop_id uuid,
  p_updated_at timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = app_private, pg_catalog, pg_temp
as $$
begin
  if app_private.sync_price_storage_is_bounded_v1(
      p_type, p_effective_at, p_source, p_note, p_created_at
    ) is not true then
    return false;
  end if;
  return octet_length(
    app_private.sync_price_recovery_row_v1(
      p_id, p_owner_user_id, p_product_id, p_type, p_price, p_effective_at,
      p_source, p_note, p_created_at, p_shop_id, p_updated_at
    )::text
  ) <= app_private.sync_recovery_row_payload_limit_v1('prices');
exception when others then return false;
end;
$$;

create or replace function app_private.sync_image_recovery_row_fits_v1(
  p_product_id uuid,
  p_owner_user_id uuid,
  p_product_shop_id uuid,
  p_product_deleted_at timestamptz,
  p_version_id uuid,
  p_status text,
  p_finalized_at timestamptz,
  p_verified_main_sha256 text,
  p_verified_main_bytes integer,
  p_verified_main_width integer,
  p_verified_main_height integer,
  p_verified_main_mime_type text,
  p_verified_thumb_sha256 text,
  p_verified_thumb_bytes integer,
  p_verified_thumb_width integer,
  p_verified_thumb_height integer,
  p_verified_thumb_mime_type text
)
returns boolean
language plpgsql
stable
security definer
set search_path = app_private, pg_catalog, pg_temp
as $$
begin
  if app_private.sync_image_storage_is_bounded_v1(
      p_status, p_verified_main_sha256, p_verified_main_mime_type,
      p_verified_thumb_sha256, p_verified_thumb_mime_type
    ) is not true then
    return false;
  end if;
  return octet_length(
    app_private.sync_image_recovery_row_v1(
      p_product_id, p_owner_user_id, p_product_shop_id, p_product_deleted_at,
      p_version_id, p_status, p_finalized_at, p_verified_main_sha256,
      p_verified_main_bytes, p_verified_main_width, p_verified_main_height,
      p_verified_main_mime_type, p_verified_thumb_sha256,
      p_verified_thumb_bytes, p_verified_thumb_width,
      p_verified_thumb_height, p_verified_thumb_mime_type
    )::text
  ) <= app_private.sync_recovery_row_payload_limit_v1('images');
exception when others then return false;
end;
$$;

create or replace function app_private.sync_history_recovery_row_v1(
  p_remote_id text,
  p_payload_version integer,
  p_timestamp text,
  p_supplier text,
  p_category text,
  p_is_manual_entry boolean,
  p_updated_at timestamptz,
  p_owner_user_id uuid,
  p_display_name text,
  p_deleted_at timestamptz,
  p_shop_id uuid,
  p_data jsonb,
  p_session_overlay jsonb
)
returns jsonb
language sql
stable
parallel safe
set search_path = app_private, pg_catalog, pg_temp
as $$
  -- Scalar arguments preserve each TOAST pointer independently. Callers pass
  -- NULL data/overlay for tombstones, so an excluded legacy payload can never
  -- be flattened merely to construct a whole-row argument.
  select jsonb_build_object(
      'remote_id', p_remote_id,
      'payload_version', p_payload_version,
      'timestamp', case
        when p_deleted_at is not null
          and not app_private.sync_legacy_timestamp_is_canonical_v1(
            p_timestamp
          ) then '1970-01-01 00:00:00'
        else p_timestamp
      end,
      'data', case
        when p_deleted_at is not null then '[]'::jsonb
        else p_data
      end,
      'session_overlay', case
        when p_deleted_at is not null then null::jsonb
        else p_session_overlay
      end,
      'supplier', p_supplier,
      'category', p_category,
      'is_manual_entry', p_is_manual_entry,
      'owner_user_id', p_owner_user_id,
      'display_name', p_display_name,
      'shop_id', p_shop_id,
      -- PostgreSQL jsonb::text is the canonical input to the checkpoint.
      -- Clients consume these redacted digests instead of attempting to
      -- reproduce PostgreSQL key ordering/whitespace in Swift/Kotlin.
      'data_checkpoint_digest', case
        when p_deleted_at is not null then '-'
        else app_private.sync_checkpoint_sha256(p_data::text)
      end,
      'overlay_checkpoint_digest', case
        when p_deleted_at is not null then '-'
        else app_private.sync_checkpoint_sha256(
          coalesce(p_session_overlay::text, '-')
        )
      end,
      'updated_at',
        app_private.sync_checkpoint_json_timestamp(p_updated_at),
      'deleted_at',
        app_private.sync_checkpoint_json_timestamp(p_deleted_at)
    );
$$;

create or replace function app_private.sync_history_recovery_row_fits_v1(
  p_remote_id text,
  p_payload_version integer,
  p_timestamp text,
  p_supplier text,
  p_category text,
  p_is_manual_entry boolean,
  p_updated_at timestamptz,
  p_owner_user_id uuid,
  p_display_name text,
  p_deleted_at timestamptz,
  p_shop_id uuid,
  p_data jsonb,
  p_session_overlay jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = app_private, pg_catalog, pg_temp
as $$
begin
  if app_private.sync_history_storage_is_bounded_v1(
      p_remote_id, p_timestamp, p_supplier, p_category, p_display_name,
      p_deleted_at, p_data, p_session_overlay
    ) is not true then
    return false;
  end if;
  if app_private.sync_history_active_payload_is_valid_v1(
      p_timestamp, p_deleted_at, p_data, p_session_overlay
    ) is not true then
    return false;
  end if;
  return octet_length(
    app_private.sync_history_recovery_row_v1(
      p_remote_id, p_payload_version, p_timestamp, p_supplier, p_category,
      p_is_manual_entry, p_updated_at, p_owner_user_id, p_display_name,
      p_deleted_at, p_shop_id, p_data, p_session_overlay
    )::text
  ) <= app_private.sync_recovery_row_payload_limit_v1('history');
exception when others then return false;
end;
$$;

revoke all on function app_private.sync_recovery_row_payload_limit_v1(text)
  from public, anon, authenticated;
revoke all on function app_private.sync_recovery_page_row_count_limit_v1(text)
  from public, anon, authenticated;
revoke all on function app_private.sync_recovery_snapshot_payload_limit_v1(text)
  from public, anon, authenticated;
revoke all on function app_private.sync_recovery_row_count_limit_v1(text)
  from public, anon, authenticated;
revoke all on function app_private.sync_legacy_timestamp_is_canonical_v1(text)
  from public, anon, authenticated;
revoke all on function app_private.sync_history_data_is_typed_v1(jsonb)
  from public, anon, authenticated;
revoke all on function app_private.sync_history_overlay_is_typed_v1(jsonb)
  from public, anon, authenticated;
revoke all on function app_private.sync_history_active_payload_is_valid_v1(
  text, timestamptz, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function app_private.sync_price_value_is_canonical_v1(double precision)
  from public, anon, authenticated;
revoke all on function app_private.sync_price_canonical_amount_v1(double precision)
  from public, anon, authenticated;
revoke all on function app_private.sync_product_number_is_materializable_v1(double precision)
  from public, anon, authenticated;
revoke all on function app_private.sync_supplier_recovery_row_v1(
  uuid, uuid, text, timestamptz, timestamptz, uuid
)
  from public, anon, authenticated;
revoke all on function app_private.sync_category_recovery_row_v1(
  uuid, uuid, text, timestamptz, timestamptz, uuid
)
  from public, anon, authenticated;
revoke all on function app_private.sync_product_recovery_row_v1(
  uuid, uuid, text, text, text, text, double precision, double precision,
  uuid, uuid, double precision, timestamptz, timestamptz, uuid, uuid,
  timestamptz
)
  from public, anon, authenticated;
revoke all on function app_private.sync_price_recovery_row_v1(
  uuid, uuid, uuid, text, double precision, text, text, text, text, uuid,
  timestamptz
) from public, anon, authenticated;
revoke all on function app_private.sync_image_recovery_row_v1(
  uuid, uuid, uuid, timestamptz, uuid, text, timestamptz, text, integer,
  integer, integer, text, text, integer, integer, integer, text
) from public, anon, authenticated;
revoke all on function app_private.sync_supplier_recovery_row_fits_v1(
  uuid, uuid, text, timestamptz, timestamptz, uuid
)
  from public, anon, authenticated;
revoke all on function app_private.sync_category_recovery_row_fits_v1(
  uuid, uuid, text, timestamptz, timestamptz, uuid
)
  from public, anon, authenticated;
revoke all on function app_private.sync_product_recovery_row_fits_v1(
  uuid, uuid, text, text, text, text, double precision, double precision,
  uuid, uuid, double precision, timestamptz, timestamptz, uuid, uuid,
  timestamptz
)
  from public, anon, authenticated;
revoke all on function app_private.sync_price_recovery_row_fits_v1(
  uuid, uuid, uuid, text, double precision, text, text, text, text, uuid,
  timestamptz
) from public, anon, authenticated;
revoke all on function app_private.sync_image_recovery_row_fits_v1(
  uuid, uuid, uuid, timestamptz, uuid, text, timestamptz, text, integer,
  integer, integer, text, text, integer, integer, integer, text
) from public, anon, authenticated;
revoke all on function app_private.sync_history_recovery_row_v1(
  text, integer, text, text, text, boolean, timestamptz, uuid, text,
  timestamptz, uuid, jsonb, jsonb
)
  from public, anon, authenticated;
revoke all on function app_private.sync_history_recovery_row_fits_v1(
  text, integer, text, text, text, boolean, timestamptz, uuid, text,
  timestamptz, uuid, jsonb, jsonb
)
  from public, anon, authenticated;
grant execute on function app_private.sync_legacy_timestamp_is_canonical_v1(text)
  to authenticated, service_role;
grant execute on function app_private.sync_history_data_is_typed_v1(jsonb)
  to authenticated, service_role;
grant execute on function app_private.sync_history_overlay_is_typed_v1(jsonb)
  to authenticated, service_role;
grant execute on function app_private.sync_history_active_payload_is_valid_v1(
  text, timestamptz, jsonb, jsonb
) to authenticated, service_role;
grant execute on function app_private.sync_price_value_is_canonical_v1(double precision)
  to authenticated, service_role;
grant execute on function app_private.sync_product_number_is_materializable_v1(double precision)
  to authenticated, service_role;
grant execute on function app_private.sync_supplier_recovery_row_fits_v1(
  uuid, uuid, text, timestamptz, timestamptz, uuid
)
  to authenticated, service_role;
grant execute on function app_private.sync_category_recovery_row_fits_v1(
  uuid, uuid, text, timestamptz, timestamptz, uuid
)
  to authenticated, service_role;
grant execute on function app_private.sync_product_recovery_row_fits_v1(
  uuid, uuid, text, text, text, text, double precision, double precision,
  uuid, uuid, double precision, timestamptz, timestamptz, uuid, uuid,
  timestamptz
)
  to authenticated, service_role;
grant execute on function app_private.sync_history_recovery_row_fits_v1(
  text, integer, text, text, text, boolean, timestamptz, uuid, text,
  timestamptz, uuid, jsonb, jsonb
)
  to authenticated, service_role;

-- Expand-only compatibility: do not add CHECK constraints to legacy tables.
-- NOT VALID still constrains every new row and would therefore break deployed
-- clients whose historical write shape is intentionally accepted during the
-- mixed-version window. V6 RPCs and recovery readers enforce the strict
-- materialization envelope; table constraints belong to the later retirement
-- migration after old writers have been removed.

drop function if exists public.shop_sync_recovery_checkpoint_v1(uuid, text);
drop function if exists public.shop_sync_recovery_checkpoint_v1(uuid, text, bigint);
drop function if exists public.shop_sync_recovery_checkpoint_v1(uuid, text, text);
drop function if exists public.shop_sync_recovery_checkpoint_v1(uuid, text, text, text);
create or replace function public.shop_sync_recovery_checkpoint_v1(
  p_shop_id uuid,
  p_device_identifier text,
  p_verified_baseline_id text default '0',
  p_expected_baseline_scope_key text default null
)
returns jsonb
language plpgsql
stable
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
  v_sync_events jsonb;
  v_suppliers jsonb;
  v_categories jsonb;
  v_products jsonb;
  v_catalog jsonb;
  v_prices jsonb;
  v_history jsonb;
  v_images jsonb;
  v_integrity jsonb;
  v_preflight jsonb;
  v_payload_budgets jsonb;
  v_domain_max_ids jsonb;
  v_checkpoint jsonb;
  v_verified_baseline_id bigint;
  v_event_max_id bigint := 0;
begin
  if coalesce(p_verified_baseline_id, '') !~ '^(0|[1-9][0-9]{0,18})$' then
    raise exception 'verified baseline must be a canonical decimal string'
      using errcode = '22023';
  end if;
  begin
    v_verified_baseline_id := p_verified_baseline_id::bigint;
  exception when numeric_value_out_of_range then
    raise exception 'verified baseline is outside bigint range'
      using errcode = '22003';
  end;
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
  from app_private.resolve_shop_sync_recovery_scope(
    p_shop_id,
    p_device_identifier
  ) scope;

  if p_expected_baseline_scope_key is not null
    and p_expected_baseline_scope_key !~ '^[0-9a-f]{64}$' then
    raise exception 'expected baseline scope key must be lowercase SHA-256'
      using errcode = '22023';
  end if;
  if v_verified_baseline_id > 0
    and p_expected_baseline_scope_key is null then
    raise exception 'shop_sync_recovery_scope_changed'
      using errcode = '55000';
  end if;
  if p_expected_baseline_scope_key is not null
    and p_expected_baseline_scope_key <> v_scope_key then
    raise exception 'shop_sync_recovery_scope_changed'
      using errcode = '55000';
  end if;

  -- Use the same scope/ordering fence as every V6 writer before reading the
  -- event high-water mark or any domain digest. The convergence marker calls
  -- this checkpoint in the same transaction, so its noWork proof is fenced by
  -- the identical lock and observation order.
  perform app_private.acquire_sync_event_scope_fence_v1(
    auth.uid(),
    p_shop_id
  );

  v_event_max_id := app_private.shop_sync_scope_event_max_id_v1(
    p_shop_id,
    v_scope_kind,
    v_mapped_owner_id,
    v_authorized_legacy_owner_id
  );

  -- Run the cheap row-count/storage envelope before event inspection and
  -- before any recovery DTO is materialized.  A legacy TOAST bomb therefore
  -- reaches the deterministic resource_exceeded response without to_jsonb or
  -- jsonb::text expansion.
  v_payload_budgets := app_private.sync_recovery_payload_budgets_v1();
  v_preflight := app_private.sync_recovery_preflight_counts_v1(
    p_shop_id, v_scope_kind, v_mapped_owner_id,
    v_authorized_legacy_owner_id
  );
  v_domain_max_ids := jsonb_build_object(
    'catalog', app_private.shop_sync_scope_domain_event_max_id_v1(
      p_shop_id, v_scope_kind, v_mapped_owner_id,
      v_authorized_legacy_owner_id, 'catalog'
    )::text,
    'prices', app_private.shop_sync_scope_domain_event_max_id_v1(
      p_shop_id, v_scope_kind, v_mapped_owner_id,
      v_authorized_legacy_owner_id, 'prices'
    )::text,
    'history', app_private.shop_sync_scope_domain_event_max_id_v1(
      p_shop_id, v_scope_kind, v_mapped_owner_id,
      v_authorized_legacy_owner_id, 'history'
    )::text
  );
  v_sync_events := jsonb_build_object(
    'maxId', v_event_max_id::text,
    'verifiedBaselineId', v_verified_baseline_id::text,
    'historicalBlockingCountStatus', 'not_scanned',
    'inspectionLimit', 10000,
    'inspectedCount', 0,
    'scanComplete', false,
    'requiresFullRecovery', true,
    'blockingCount', null,
    'oldestBlockingId', null,
    'newestBlockingId', null,
    'domainMaxIds', v_domain_max_ids
  );

  if v_event_max_id < v_verified_baseline_id then
    v_checkpoint := jsonb_build_object(
      'schemaVersion', 'shop-sync-recovery-checkpoint-v1',
      'digestContract', app_private.sync_recovery_digest_contract_v1(),
      'status', 'invalid_baseline',
      'shopId', p_shop_id,
      'scope', jsonb_build_object(
        'kind', v_scope_kind, 'historyKind', v_history_scope_kind,
        'key', v_scope_key, 'legacyOwnerKey', v_legacy_owner_key,
        'accountKey', v_account_key, 'deviceKey', v_device_key
      ),
      'syncEvents', v_sync_events,
      'payloadBudgets', v_payload_budgets,
      'resourcePreflight', v_preflight
    );
    return v_checkpoint || jsonb_build_object(
      'checkpointDigest', app_private.sync_checkpoint_sha256(v_checkpoint::text)
    );
  end if;
  if coalesce((v_preflight->>'resourceExceeded')::boolean, true) then
    v_checkpoint := jsonb_build_object(
      'schemaVersion', 'shop-sync-recovery-checkpoint-v1',
      'digestContract', app_private.sync_recovery_digest_contract_v1(),
      'status', 'resource_exceeded',
      'shopId', p_shop_id,
      'scope', jsonb_build_object(
        'kind', v_scope_kind, 'historyKind', v_history_scope_kind,
        'key', v_scope_key, 'legacyOwnerKey', v_legacy_owner_key,
        'accountKey', v_account_key, 'deviceKey', v_device_key
      ),
      'syncEvents', v_sync_events,
      'payloadBudgets', v_payload_budgets,
      'resourcePreflight', v_preflight
    );
    return v_checkpoint || jsonb_build_object(
      'checkpointDigest', app_private.sync_checkpoint_sha256(v_checkpoint::text)
    );
  end if;

  with inspected_candidates as materialized (
    select event.id,
      app_private.sync_event_is_safe_after_v1(
        event.id, event.owner_user_id, event.store_id, event.shop_id,
        event.domain, event.event_type, event.source,
        event.source_device_id, event.batch_id, event.client_event_id,
        event.changed_count, event.entity_ids, event.created_at,
        event.expires_at, event.metadata,
        v_verified_baseline_id
      ) as is_safe
    from public.sync_events event
    where event.id > v_verified_baseline_id
      and ((
        event.domain = 'history'
        and (
          event.shop_id = p_shop_id
          or (
            event.shop_id is null
            and v_authorized_legacy_owner_id is not null
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
    limit 10001
  ), safety as materialized (
    select candidate.id, candidate.is_safe
    from inspected_candidates candidate
    order by candidate.id
    limit 10000
  )
  select jsonb_build_object(
    'maxId', v_event_max_id::text,
    'verifiedBaselineId', v_verified_baseline_id::text,
    'historicalBlockingCountStatus', 'not_scanned',
    'inspectionLimit', 10000,
    'inspectedCount', (select count(*) from safety),
    'scanComplete', (select count(*) <= 10000 from inspected_candidates),
    'requiresFullRecovery',
      (select count(*) > 10000 from inspected_candidates)
      or count(*) filter (where not safety.is_safe) > 0,
    'blockingCount', count(*) filter (where not safety.is_safe),
    'oldestBlockingId', min(safety.id) filter (where not safety.is_safe)::text,
    'newestBlockingId', max(safety.id) filter (where not safety.is_safe)::text
  )
  into v_sync_events
  from safety;

  v_sync_events := v_sync_events || jsonb_build_object(
    'domainMaxIds', v_domain_max_ids
  );

  if (v_sync_events->>'maxId')::bigint < v_verified_baseline_id then
    v_checkpoint := jsonb_build_object(
      'schemaVersion', 'shop-sync-recovery-checkpoint-v1',
      'digestContract', app_private.sync_recovery_digest_contract_v1(),
      'status', 'invalid_baseline',
      'shopId', p_shop_id,
      'scope', jsonb_build_object(
        'kind', v_scope_kind, 'historyKind', v_history_scope_kind,
        'key', v_scope_key, 'legacyOwnerKey', v_legacy_owner_key,
        'accountKey', v_account_key, 'deviceKey', v_device_key
      ),
      'syncEvents', v_sync_events,
      'payloadBudgets', v_payload_budgets,
      'resourcePreflight', v_preflight
    );
    return v_checkpoint || jsonb_build_object(
      'checkpointDigest', app_private.sync_checkpoint_sha256(v_checkpoint::text)
    );
  end if;
  if coalesce((v_preflight->>'resourceExceeded')::boolean, true) then
    v_checkpoint := jsonb_build_object(
      'schemaVersion', 'shop-sync-recovery-checkpoint-v1',
      'digestContract', app_private.sync_recovery_digest_contract_v1(),
      'status', 'resource_exceeded',
      'shopId', p_shop_id,
      'scope', jsonb_build_object(
        'kind', v_scope_kind, 'historyKind', v_history_scope_kind,
        'key', v_scope_key, 'legacyOwnerKey', v_legacy_owner_key,
        'accountKey', v_account_key, 'deviceKey', v_device_key
      ),
      'syncEvents', v_sync_events,
      'payloadBudgets', v_payload_budgets,
      'resourcePreflight', v_preflight
    );
    return v_checkpoint || jsonb_build_object(
      'checkpointDigest', app_private.sync_checkpoint_sha256(v_checkpoint::text)
    );
  end if;

  with scoped as (
    select supplier.*,
      app_private.sync_supplier_recovery_row_v1(
        supplier.id, supplier.owner_user_id, supplier.name,
        supplier.updated_at, supplier.deleted_at, supplier.shop_id
      ) as recovery_row
    from public.inventory_suppliers supplier
    where (
      v_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
      and supplier.shop_id = p_shop_id
    ) or (
        v_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and supplier.shop_id is null
        and supplier.owner_user_id = v_mapped_owner_id
      )
  )
  select jsonb_build_object(
    'activeCount', count(*) filter (where deleted_at is null),
    'tombstoneCount', count(*) filter (where deleted_at is not null),
    'payloadBytes', coalesce(sum(octet_length(recovery_row::text)), 0),
    'oversizeRowCount', count(*) filter (
      where octet_length(recovery_row::text) >
        app_private.sync_recovery_row_payload_limit_v1('suppliers')
    ),
    'idSetDigest', app_private.sync_checkpoint_chain_digest_v1(
      lower(id::text) order by id
    ),
    'versionDigest', app_private.sync_checkpoint_chain_digest_v1(
        lower(id::text) || E'\x1f' ||
        app_private.sync_checkpoint_timestamp(updated_at) || E'\x1f' ||
        app_private.sync_checkpoint_timestamp(deleted_at)
        order by id
    )
  )
  into v_suppliers
  from scoped;

  with scoped as (
    select category.*,
      app_private.sync_category_recovery_row_v1(
        category.id, category.owner_user_id, category.name,
        category.updated_at, category.deleted_at, category.shop_id
      ) as recovery_row
    from public.inventory_categories category
    where (
      v_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
      and category.shop_id = p_shop_id
    ) or (
        v_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and category.shop_id is null
        and category.owner_user_id = v_mapped_owner_id
      )
  )
  select jsonb_build_object(
    'activeCount', count(*) filter (where deleted_at is null),
    'tombstoneCount', count(*) filter (where deleted_at is not null),
    'payloadBytes', coalesce(sum(octet_length(recovery_row::text)), 0),
    'oversizeRowCount', count(*) filter (
      where octet_length(recovery_row::text) >
        app_private.sync_recovery_row_payload_limit_v1('categories')
    ),
    'idSetDigest', app_private.sync_checkpoint_chain_digest_v1(
      lower(id::text) order by id
    ),
    'versionDigest', app_private.sync_checkpoint_chain_digest_v1(
        lower(id::text) || E'\x1f' ||
        app_private.sync_checkpoint_timestamp(updated_at) || E'\x1f' ||
        app_private.sync_checkpoint_timestamp(deleted_at)
        order by id
    )
  )
  into v_categories
  from scoped;

  with scoped as (
    select product.*,
      app_private.sync_product_recovery_row_v1(
        product.id, product.owner_user_id, product.barcode,
        product.item_number, product.product_name,
        product.second_product_name, product.purchase_price,
        product.retail_price, product.supplier_id, product.category_id,
        product.stock_quantity, product.updated_at, product.deleted_at,
        product.shop_id, product.primary_image_version_id,
        product.primary_image_updated_at
      ) as recovery_row
    from public.inventory_products product
    where (
      v_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
      and product.shop_id = p_shop_id
    ) or (
        v_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and product.shop_id is null
        and product.owner_user_id = v_mapped_owner_id
      )
  )
  select jsonb_build_object(
    'activeCount', count(*) filter (where deleted_at is null),
    'tombstoneCount', count(*) filter (where deleted_at is not null),
    'payloadBytes', coalesce(sum(octet_length(recovery_row::text)), 0),
    'oversizeRowCount', count(*) filter (
      where octet_length(recovery_row::text) >
        app_private.sync_recovery_row_payload_limit_v1('products')
    ),
    'idSetDigest', app_private.sync_checkpoint_chain_digest_v1(
      lower(id::text) order by id
    ),
    'identityDigest', app_private.sync_checkpoint_chain_digest_v1(
        lower(id::text) || E'\x1f' ||
        app_private.sync_checkpoint_sha256(coalesce(barcode, '')) || E'\x1f' ||
        app_private.sync_checkpoint_sha256(coalesce(item_number, ''))
        order by id
    ),
    'versionDigest', app_private.sync_checkpoint_chain_digest_v1(
        lower(id::text) || E'\x1f' ||
        app_private.sync_checkpoint_timestamp(updated_at) || E'\x1f' ||
        app_private.sync_checkpoint_timestamp(deleted_at) || E'\x1f' ||
        case when deleted_at is null
          then coalesce(lower(category_id::text), '-') else '-' end || E'\x1f' ||
        case when deleted_at is null
          then coalesce(lower(supplier_id::text), '-') else '-' end || E'\x1f' ||
        case when deleted_at is null
          then coalesce(lower(primary_image_version_id::text), '-') else '-' end || E'\x1f' ||
        case when deleted_at is null
          then app_private.sync_checkpoint_timestamp(primary_image_updated_at) else '-' end
        order by id
    )
  )
  into v_products
  from scoped;

  v_catalog := jsonb_build_object(
    'suppliers', v_suppliers,
    'categories', v_categories,
    'products', v_products,
    'digest', app_private.sync_checkpoint_sha256(
      (v_suppliers->>'versionDigest') || E'\n' ||
      (v_categories->>'versionDigest') || E'\n' ||
      (v_products->>'versionDigest')
    )
  );

  with scoped as (
    select price_row.*,
      app_private.sync_price_recovery_row_v1(
        price_row.id, price_row.owner_user_id, price_row.product_id,
        price_row.type, price_row.price, price_row.effective_at,
        price_row.source, price_row.note, price_row.created_at,
        price_row.shop_id, price_row.updated_at
      ) as recovery_row
    from public.inventory_product_prices price_row
    where (
      (
        v_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
        and price_row.shop_id = p_shop_id
      ) or (
        v_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and price_row.shop_id is null
        and price_row.owner_user_id = v_mapped_owner_id
      )
    )
      and exists (
        select 1
        from public.inventory_products product
        where product.id = price_row.product_id
          and (
            (
              v_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
              and product.shop_id = p_shop_id
            ) or (
              v_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
              and product.shop_id is null
              and product.owner_user_id = v_mapped_owner_id
            )
          )
      )
  )
  select jsonb_build_object(
    'activeCount', count(*),
    'tombstoneCount', 0,
    'payloadBytes', coalesce(sum(octet_length(recovery_row::text)), 0),
    'oversizeRowCount', count(*) filter (where
      octet_length(recovery_row::text) >
        app_private.sync_recovery_row_payload_limit_v1('prices')),
    'idSetDigest', app_private.sync_checkpoint_chain_digest_v1(
      lower(id::text) order by id
    ),
    'versionDigest', app_private.sync_checkpoint_chain_digest_v1(
        lower(id::text) || E'\x1f' ||
        app_private.sync_checkpoint_timestamp(updated_at) || E'\x1f' ||
        lower(product_id::text) || E'\x1f' ||
        case
          when app_private.sync_price_value_is_canonical_v1(price)
            then app_private.sync_price_canonical_amount_v1(price)
          else 'invalid'
        end || E'\x1f' ||
        type || E'\x1f' ||
        case
          when app_private.sync_legacy_timestamp_is_canonical_v1(effective_at)
            then effective_at
          else 'invalid'
        end || E'\x1f' ||
        case
          when app_private.sync_legacy_timestamp_is_canonical_v1(created_at)
            then created_at
          else 'invalid'
        end || E'\x1f' ||
        app_private.sync_checkpoint_sha256(coalesce(source, '')) || E'\x1f' ||
        app_private.sync_checkpoint_sha256(coalesce(note, ''))
        order by id
    )
  )
  into v_prices
  from scoped;

  with scoped as (
    select
      session.*,
      app_private.sync_history_recovery_row_v1(
        session.remote_id, session.payload_version, session."timestamp",
        session.supplier, session.category, session.is_manual_entry,
        session.updated_at, session.owner_user_id, session.display_name,
        session.deleted_at, session.shop_id,
        case when session.deleted_at is null then session.data else null end,
        case when session.deleted_at is null
          then session.session_overlay else null end
      )
        as recovery_row
    from public.shared_sheet_sessions session
    where session.shop_id = p_shop_id
      or (
        session.shop_id is null
        and v_authorized_legacy_owner_id is not null
        and session.owner_user_id = v_authorized_legacy_owner_id
      )
  )
  select jsonb_build_object(
    'activeCount', count(*) filter (where deleted_at is null),
    'tombstoneCount', count(*) filter (where deleted_at is not null),
    'payloadBytes', coalesce(sum(octet_length(recovery_row::text)), 0),
    'oversizeRowCount', count(*) filter (
      where octet_length(recovery_row::text) >
        app_private.sync_recovery_row_payload_limit_v1('history')
    ),
    'idSetDigest', app_private.sync_checkpoint_chain_digest_v1(
      lower(remote_id) order by lower(remote_id)
    ),
    'versionDigest', app_private.sync_checkpoint_chain_digest_v1(
        lower(remote_id) || E'\x1f' ||
        app_private.sync_checkpoint_timestamp(updated_at) || E'\x1f' ||
        app_private.sync_checkpoint_timestamp(deleted_at) || E'\x1f' ||
        payload_version::text || E'\x1f' ||
        case
          when deleted_at is not null then '-'
          else case
            when app_private.sync_legacy_timestamp_is_canonical_v1("timestamp")
              then "timestamp"
            else 'invalid'
          end || E'\x1f' ||
          app_private.sync_checkpoint_sha256(supplier) || E'\x1f' ||
          app_private.sync_checkpoint_sha256(category) || E'\x1f' ||
          is_manual_entry::text || E'\x1f' ||
          app_private.sync_checkpoint_sha256(display_name) || E'\x1f' ||
          (recovery_row ->> 'data_checkpoint_digest') || E'\x1f' ||
          (recovery_row ->> 'overlay_checkpoint_digest')
        end
        order by lower(remote_id)
    )
  )
  into v_history
  from scoped;

  with scoped_products as (
    select product.*
    from public.inventory_products product
    where (
      (
        v_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
        and product.shop_id = p_shop_id
      )
      or (
        v_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and product.shop_id is null
        and product.owner_user_id = v_mapped_owner_id
      )
    )
      and product.primary_image_version_id is not null
  ), scoped as (
    select
      product.id as scoped_product_id,
      product.owner_user_id as product_owner_user_id,
      product.shop_id as product_shop_id,
      product.deleted_at as product_deleted_at,
      version.id,
      version.status,
      version.finalized_at,
      version.verified_main_sha256,
      version.verified_main_bytes,
      version.verified_main_width,
      version.verified_main_height,
      version.verified_main_mime_type,
      version.verified_thumb_sha256,
      version.verified_thumb_bytes,
      version.verified_thumb_width,
      version.verified_thumb_height,
      version.verified_thumb_mime_type,
      app_private.sync_image_recovery_row_v1(
        product.id, product.owner_user_id, product.shop_id,
        product.deleted_at, version.id, version.status, version.finalized_at,
        version.verified_main_sha256, version.verified_main_bytes,
        version.verified_main_width, version.verified_main_height,
        version.verified_main_mime_type, version.verified_thumb_sha256,
        version.verified_thumb_bytes, version.verified_thumb_width,
        version.verified_thumb_height, version.verified_thumb_mime_type
      ) as recovery_row
    from scoped_products product
    join public.inventory_product_image_versions version
      on version.id = product.primary_image_version_id
      and version.product_id = product.id
      and version.shop_id = p_shop_id
      and version.status = 'ready'
      and version.removed_at is null
  )
  select jsonb_build_object(
    'activeCount', count(*) filter (where product_deleted_at is null),
    'tombstoneCount', count(*) filter (where product_deleted_at is not null),
    'payloadBytes', coalesce(sum(octet_length(recovery_row::text)), 0),
    'oversizeRowCount', count(*) filter (where
      octet_length(recovery_row::text) >
        app_private.sync_recovery_row_payload_limit_v1('images')
    ),
    'idSetDigest', app_private.sync_checkpoint_chain_digest_v1(
      lower(scoped_product_id::text) order by scoped_product_id
    ),
    'versionDigest', app_private.sync_checkpoint_chain_digest_v1(
        lower(scoped_product_id::text) || E'\x1f' ||
        lower(id::text) || E'\x1f' ||
        status || E'\x1f' ||
        app_private.sync_checkpoint_timestamp(product_deleted_at) || E'\x1f' ||
        app_private.sync_checkpoint_timestamp(finalized_at) || E'\x1f' ||
        coalesce(verified_main_sha256, '-') || E'\x1f' ||
        coalesce(verified_main_bytes::text, '-') || E'\x1f' ||
        coalesce(verified_main_width::text, '-') || E'\x1f' ||
        coalesce(verified_main_height::text, '-') || E'\x1f' ||
        coalesce(verified_main_mime_type, '-') || E'\x1f' ||
        coalesce(verified_thumb_sha256, '-') || E'\x1f' ||
        coalesce(verified_thumb_bytes::text, '-') || E'\x1f' ||
        coalesce(verified_thumb_width::text, '-') || E'\x1f' ||
        coalesce(verified_thumb_height::text, '-') || E'\x1f' ||
        coalesce(verified_thumb_mime_type, '-')
        order by scoped_product_id
    )
  )
  into v_images
  from scoped;

  with scoped_products as (
    select product.*
    from public.inventory_products product
    where (
      v_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
      and product.shop_id = p_shop_id
    ) or (
        v_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and product.shop_id is null
        and product.owner_user_id = v_mapped_owner_id
      )
  ), scoped_suppliers as (
    select supplier.*
    from public.inventory_suppliers supplier
    where (
      v_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
      and supplier.shop_id = p_shop_id
    ) or (
        v_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and supplier.shop_id is null
        and supplier.owner_user_id = v_mapped_owner_id
      )
  ), scoped_categories as (
    select category.*
    from public.inventory_categories category
    where (
      v_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
      and category.shop_id = p_shop_id
    ) or (
        v_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and category.shop_id is null
        and category.owner_user_id = v_mapped_owner_id
      )
  ), scoped_prices as (
    select price.*
    from public.inventory_product_prices price
    where (
      v_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
      and price.shop_id = p_shop_id
    ) or (
        v_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and price.shop_id is null
        and price.owner_user_id = v_mapped_owner_id
      )
  )
  select jsonb_build_object(
    'catalogTimestampViolationCount',
      (select count(*) from scoped_suppliers supplier
        where not pg_catalog.isfinite(supplier.updated_at)
          or (supplier.deleted_at is not null
            and not pg_catalog.isfinite(supplier.deleted_at))) +
      (select count(*) from scoped_categories category
        where not pg_catalog.isfinite(category.updated_at)
          or (category.deleted_at is not null
            and not pg_catalog.isfinite(category.deleted_at))) +
      (select count(*) from scoped_products product
        where not pg_catalog.isfinite(product.updated_at)
          or (product.deleted_at is not null
            and not pg_catalog.isfinite(product.deleted_at))
          or (product.primary_image_updated_at is not null
            and not pg_catalog.isfinite(product.primary_image_updated_at))),
    'priceRowTimestampViolationCount', (
      select count(*)
      from scoped_prices price
      where not pg_catalog.isfinite(price.updated_at)
    ),
    'productCategoryViolationCount', (
      select count(*)
      from scoped_products product
      where product.deleted_at is null
        and product.category_id is not null
        and not exists (
          select 1
          from public.inventory_categories category
          where category.id = product.category_id
            and category.deleted_at is null
            and (
              (
                v_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
                and category.shop_id = p_shop_id
              )
              or (
                v_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
                and category.shop_id is null
                and category.owner_user_id = v_mapped_owner_id
              )
            )
        )
    ),
    'productSupplierViolationCount', (
      select count(*)
      from scoped_products product
      where product.deleted_at is null
        and product.supplier_id is not null
        and not exists (
          select 1
          from public.inventory_suppliers supplier
          where supplier.id = product.supplier_id
            and supplier.deleted_at is null
            and (
              (
                v_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
                and supplier.shop_id = p_shop_id
              )
              or (
                v_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
                and supplier.shop_id is null
                and supplier.owner_user_id = v_mapped_owner_id
              )
            )
        )
    ),
    'priceProductViolationCount', (
      select count(*)
      from scoped_prices price
      where not exists (
        select 1
        from scoped_products product
        where product.id = price.product_id
      )
    ),
    'productNumericViolationCount', (
      select count(*)
      from scoped_products product
      where not app_private.sync_product_number_is_materializable_v1(
          product.purchase_price
        )
        or not app_private.sync_product_number_is_materializable_v1(
          product.retail_price
        )
        or not app_private.sync_product_number_is_materializable_v1(
          product.stock_quantity
        )
    ),
    'priceValueViolationCount', (
      select count(*)
      from scoped_prices price
      where not app_private.sync_price_value_is_canonical_v1(price.price)
    ),
    'priceTimestampViolationCount', (
      select count(*)
      from scoped_prices price
      where not app_private.sync_legacy_timestamp_is_canonical_v1(
          price.effective_at
        )
        or not app_private.sync_legacy_timestamp_is_canonical_v1(
          price.created_at
        )
    ),
    'priceTextPayloadViolationCount', (
      select count(*)
      from scoped_prices price
      where octet_length(coalesce(price.source, '')) > 256
        or octet_length(coalesce(price.note, '')) > 8192
    ),
    'duplicateActiveBarcodeViolationCount', (
      select coalesce(sum(collisions.row_count), 0)
      from (
        select count(*)::bigint as row_count
        from scoped_products product
        where product.deleted_at is null
        group by product.barcode
        having count(*) > 1
      ) collisions
    ),
    'duplicateActiveSupplierNameViolationCount', (
      select coalesce(sum(collisions.row_count), 0)
      from (
        select count(*)::bigint as row_count
        from scoped_suppliers supplier
        where supplier.deleted_at is null
        group by lower(supplier.name)
        having count(*) > 1
      ) collisions
    ),
    'duplicateActiveCategoryNameViolationCount', (
      select coalesce(sum(collisions.row_count), 0)
      from (
        select count(*)::bigint as row_count
        from scoped_categories category
        where category.deleted_at is null
        group by lower(category.name)
        having count(*) > 1
      ) collisions
    ),
    'primaryImageViolationCount', (
      select count(*)
      from scoped_products product
      where product.primary_image_version_id is not null
        and not exists (
          select 1
          from public.inventory_product_image_versions version
          where version.id = product.primary_image_version_id
            and version.product_id = product.id
            and version.shop_id = p_shop_id
            and version.status = 'ready'
            and version.removed_at is null
        )
    ),
    'imageTimestampViolationCount', (
      select count(*)
      from scoped_products product
      join public.inventory_product_image_versions version
        on version.id = product.primary_image_version_id
       and version.product_id = product.id
       and version.shop_id = p_shop_id
      where not pg_catalog.isfinite(version.created_at)
        or not pg_catalog.isfinite(version.expires_at)
        or (version.finalized_at is not null
          and not pg_catalog.isfinite(version.finalized_at))
        or (version.superseded_at is not null
          and not pg_catalog.isfinite(version.superseded_at))
        or (version.removed_at is not null
          and not pg_catalog.isfinite(version.removed_at))
        or (version.cleanup_updated_at is not null
          and not pg_catalog.isfinite(version.cleanup_updated_at))
    ),
    'historyIdViolationCount', (
      select count(*)
      from public.shared_sheet_sessions session
      where (
        session.shop_id = p_shop_id
        or (
          v_authorized_legacy_owner_id is not null
          and session.shop_id is null
          and session.owner_user_id = v_authorized_legacy_owner_id
        )
      )
        and session.remote_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ),
    'historyTimestampViolationCount', (
      select count(*)
      from public.shared_sheet_sessions session
      where (
        session.shop_id = p_shop_id
        or (
          v_authorized_legacy_owner_id is not null
          and session.shop_id is null
          and session.owner_user_id = v_authorized_legacy_owner_id
        )
      )
        and session.deleted_at is null
        and not app_private.sync_legacy_timestamp_is_canonical_v1(
          session."timestamp"
        )
    ),
    'historyDataShapeViolationCount', (
      select count(*)
      from public.shared_sheet_sessions session
      where (
        session.shop_id = p_shop_id
        or (
          v_authorized_legacy_owner_id is not null
          and session.shop_id is null
          and session.owner_user_id = v_authorized_legacy_owner_id
        )
      )
        and case when session.deleted_at is null
          then not app_private.sync_history_data_is_typed_v1(session.data)
          else false
        end
    ),
    'historyOverlayShapeViolationCount', (
      select count(*)
      from public.shared_sheet_sessions session
      where (
        session.shop_id = p_shop_id
        or (
          v_authorized_legacy_owner_id is not null
          and session.shop_id is null
          and session.owner_user_id = v_authorized_legacy_owner_id
        )
      )
        and case when session.deleted_at is null
          then not app_private.sync_history_overlay_is_typed_v1(
            session.session_overlay
          )
          else false
        end
    ),
    'historyPayloadViolationCount', (
      select count(*)
      from public.shared_sheet_sessions session
      where (
        session.shop_id = p_shop_id
        or (
          v_authorized_legacy_owner_id is not null
          and session.shop_id is null
          and session.owner_user_id = v_authorized_legacy_owner_id
        )
      )
        and case when session.deleted_at is null
          then octet_length(session.data::text) > 524288
          else false
        end
    ),
    'historyRowTimestampViolationCount', (
      select count(*)
      from public.shared_sheet_sessions session
      where (
        session.shop_id = p_shop_id
        or (
          v_authorized_legacy_owner_id is not null
          and session.shop_id is null
          and session.owner_user_id = v_authorized_legacy_owner_id
        )
      )
        and (
          not pg_catalog.isfinite(session.updated_at)
          or (session.deleted_at is not null
            and not pg_catalog.isfinite(session.deleted_at))
        )
    )
  )
  into v_integrity;

  v_integrity := v_integrity || jsonb_build_object(
    'recoveryPayloadRowViolationCount',
      coalesce((v_suppliers->>'oversizeRowCount')::bigint, 0) +
      coalesce((v_categories->>'oversizeRowCount')::bigint, 0) +
      coalesce((v_products->>'oversizeRowCount')::bigint, 0) +
      coalesce((v_prices->>'oversizeRowCount')::bigint, 0) +
      coalesce((v_history->>'oversizeRowCount')::bigint, 0) +
      coalesce((v_images->>'oversizeRowCount')::bigint, 0),
    'recoverySnapshotPayloadBytes',
      coalesce((v_suppliers->>'payloadBytes')::bigint, 0) +
      coalesce((v_categories->>'payloadBytes')::bigint, 0) +
      coalesce((v_products->>'payloadBytes')::bigint, 0) +
      coalesce((v_prices->>'payloadBytes')::bigint, 0) +
      coalesce((v_history->>'payloadBytes')::bigint, 0) +
      coalesce((v_images->>'payloadBytes')::bigint, 0),
    'recoverySnapshotRowCount',
      coalesce((v_suppliers->>'activeCount')::bigint, 0) +
      coalesce((v_suppliers->>'tombstoneCount')::bigint, 0) +
      coalesce((v_categories->>'activeCount')::bigint, 0) +
      coalesce((v_categories->>'tombstoneCount')::bigint, 0) +
      coalesce((v_products->>'activeCount')::bigint, 0) +
      coalesce((v_products->>'tombstoneCount')::bigint, 0) +
      coalesce((v_prices->>'activeCount')::bigint, 0) +
      coalesce((v_prices->>'tombstoneCount')::bigint, 0) +
      coalesce((v_history->>'activeCount')::bigint, 0) +
      coalesce((v_history->>'tombstoneCount')::bigint, 0) +
      coalesce((v_images->>'activeCount')::bigint, 0) +
      coalesce((v_images->>'tombstoneCount')::bigint, 0),
    'recoverySnapshotRowViolationCount',
      case when coalesce((v_suppliers->>'activeCount')::bigint, 0) +
          coalesce((v_suppliers->>'tombstoneCount')::bigint, 0) >
          app_private.sync_recovery_row_count_limit_v1('suppliers') then 1 else 0 end +
      case when coalesce((v_categories->>'activeCount')::bigint, 0) +
          coalesce((v_categories->>'tombstoneCount')::bigint, 0) >
          app_private.sync_recovery_row_count_limit_v1('categories') then 1 else 0 end +
      case when coalesce((v_products->>'activeCount')::bigint, 0) +
          coalesce((v_products->>'tombstoneCount')::bigint, 0) >
          app_private.sync_recovery_row_count_limit_v1('products') then 1 else 0 end +
      case when coalesce((v_prices->>'activeCount')::bigint, 0) +
          coalesce((v_prices->>'tombstoneCount')::bigint, 0) >
          app_private.sync_recovery_row_count_limit_v1('prices') then 1 else 0 end +
      case when coalesce((v_history->>'activeCount')::bigint, 0) +
          coalesce((v_history->>'tombstoneCount')::bigint, 0) >
          app_private.sync_recovery_row_count_limit_v1('history') then 1 else 0 end +
      case when coalesce((v_images->>'activeCount')::bigint, 0) +
          coalesce((v_images->>'tombstoneCount')::bigint, 0) >
          app_private.sync_recovery_row_count_limit_v1('images') then 1 else 0 end +
      case when (
        coalesce((v_suppliers->>'activeCount')::bigint, 0) +
        coalesce((v_suppliers->>'tombstoneCount')::bigint, 0) +
        coalesce((v_categories->>'activeCount')::bigint, 0) +
        coalesce((v_categories->>'tombstoneCount')::bigint, 0) +
        coalesce((v_products->>'activeCount')::bigint, 0) +
        coalesce((v_products->>'tombstoneCount')::bigint, 0) +
        coalesce((v_prices->>'activeCount')::bigint, 0) +
        coalesce((v_prices->>'tombstoneCount')::bigint, 0) +
        coalesce((v_history->>'activeCount')::bigint, 0) +
        coalesce((v_history->>'tombstoneCount')::bigint, 0) +
        coalesce((v_images->>'activeCount')::bigint, 0) +
        coalesce((v_images->>'tombstoneCount')::bigint, 0)
      ) > 350000::bigint then 1 else 0 end,
    'recoverySnapshotPayloadViolationCount',
      case when coalesce((v_suppliers->>'payloadBytes')::bigint, 0) >
        app_private.sync_recovery_snapshot_payload_limit_v1('suppliers') then 1 else 0 end +
      case when coalesce((v_categories->>'payloadBytes')::bigint, 0) >
        app_private.sync_recovery_snapshot_payload_limit_v1('categories') then 1 else 0 end +
      case when coalesce((v_products->>'payloadBytes')::bigint, 0) >
        app_private.sync_recovery_snapshot_payload_limit_v1('products') then 1 else 0 end +
      case when coalesce((v_prices->>'payloadBytes')::bigint, 0) >
        app_private.sync_recovery_snapshot_payload_limit_v1('prices') then 1 else 0 end +
      case when coalesce((v_history->>'payloadBytes')::bigint, 0) >
        app_private.sync_recovery_snapshot_payload_limit_v1('history') then 1 else 0 end +
      case when coalesce((v_images->>'payloadBytes')::bigint, 0) >
        app_private.sync_recovery_snapshot_payload_limit_v1('images') then 1 else 0 end +
      case when (
        coalesce((v_suppliers->>'payloadBytes')::bigint, 0) +
        coalesce((v_categories->>'payloadBytes')::bigint, 0) +
        coalesce((v_products->>'payloadBytes')::bigint, 0) +
        coalesce((v_prices->>'payloadBytes')::bigint, 0) +
        coalesce((v_history->>'payloadBytes')::bigint, 0) +
        coalesce((v_images->>'payloadBytes')::bigint, 0)
      ) > 536870912::bigint then 1 else 0 end,
    'totalViolationCount',
      coalesce((v_integrity->>'catalogTimestampViolationCount')::bigint, 0) +
      coalesce((v_integrity->>'priceRowTimestampViolationCount')::bigint, 0) +
      coalesce((v_integrity->>'productCategoryViolationCount')::bigint, 0) +
      coalesce((v_integrity->>'productSupplierViolationCount')::bigint, 0) +
      coalesce((v_integrity->>'priceProductViolationCount')::bigint, 0) +
      coalesce((v_integrity->>'productNumericViolationCount')::bigint, 0) +
      coalesce((v_integrity->>'priceValueViolationCount')::bigint, 0) +
      coalesce((v_integrity->>'priceTimestampViolationCount')::bigint, 0) +
      coalesce((v_integrity->>'priceTextPayloadViolationCount')::bigint, 0) +
      coalesce((v_integrity->>'duplicateActiveBarcodeViolationCount')::bigint, 0) +
      coalesce((v_integrity->>'duplicateActiveSupplierNameViolationCount')::bigint, 0) +
      coalesce((v_integrity->>'duplicateActiveCategoryNameViolationCount')::bigint, 0) +
      coalesce((v_integrity->>'primaryImageViolationCount')::bigint, 0) +
      coalesce((v_integrity->>'imageTimestampViolationCount')::bigint, 0) +
      coalesce((v_integrity->>'historyIdViolationCount')::bigint, 0) +
      coalesce((v_integrity->>'historyTimestampViolationCount')::bigint, 0) +
      coalesce((v_integrity->>'historyDataShapeViolationCount')::bigint, 0) +
      coalesce((v_integrity->>'historyOverlayShapeViolationCount')::bigint, 0) +
      coalesce((v_integrity->>'historyPayloadViolationCount')::bigint, 0) +
      coalesce((v_integrity->>'historyRowTimestampViolationCount')::bigint, 0) +
      coalesce((v_suppliers->>'oversizeRowCount')::bigint, 0) +
      coalesce((v_categories->>'oversizeRowCount')::bigint, 0) +
      coalesce((v_products->>'oversizeRowCount')::bigint, 0) +
      coalesce((v_prices->>'oversizeRowCount')::bigint, 0) +
      coalesce((v_history->>'oversizeRowCount')::bigint, 0) +
      coalesce((v_images->>'oversizeRowCount')::bigint, 0) +
      case when coalesce((v_suppliers->>'activeCount')::bigint, 0) +
          coalesce((v_suppliers->>'tombstoneCount')::bigint, 0) >
          app_private.sync_recovery_row_count_limit_v1('suppliers') then 1 else 0 end +
      case when coalesce((v_categories->>'activeCount')::bigint, 0) +
          coalesce((v_categories->>'tombstoneCount')::bigint, 0) >
          app_private.sync_recovery_row_count_limit_v1('categories') then 1 else 0 end +
      case when coalesce((v_products->>'activeCount')::bigint, 0) +
          coalesce((v_products->>'tombstoneCount')::bigint, 0) >
          app_private.sync_recovery_row_count_limit_v1('products') then 1 else 0 end +
      case when coalesce((v_prices->>'activeCount')::bigint, 0) +
          coalesce((v_prices->>'tombstoneCount')::bigint, 0) >
          app_private.sync_recovery_row_count_limit_v1('prices') then 1 else 0 end +
      case when coalesce((v_history->>'activeCount')::bigint, 0) +
          coalesce((v_history->>'tombstoneCount')::bigint, 0) >
          app_private.sync_recovery_row_count_limit_v1('history') then 1 else 0 end +
      case when coalesce((v_images->>'activeCount')::bigint, 0) +
          coalesce((v_images->>'tombstoneCount')::bigint, 0) >
          app_private.sync_recovery_row_count_limit_v1('images') then 1 else 0 end +
      case when (
        coalesce((v_suppliers->>'activeCount')::bigint, 0) +
        coalesce((v_suppliers->>'tombstoneCount')::bigint, 0) +
        coalesce((v_categories->>'activeCount')::bigint, 0) +
        coalesce((v_categories->>'tombstoneCount')::bigint, 0) +
        coalesce((v_products->>'activeCount')::bigint, 0) +
        coalesce((v_products->>'tombstoneCount')::bigint, 0) +
        coalesce((v_prices->>'activeCount')::bigint, 0) +
        coalesce((v_prices->>'tombstoneCount')::bigint, 0) +
        coalesce((v_history->>'activeCount')::bigint, 0) +
        coalesce((v_history->>'tombstoneCount')::bigint, 0) +
        coalesce((v_images->>'activeCount')::bigint, 0) +
        coalesce((v_images->>'tombstoneCount')::bigint, 0)
      ) > 350000::bigint then 1 else 0 end +
      case when coalesce((v_suppliers->>'payloadBytes')::bigint, 0) >
        app_private.sync_recovery_snapshot_payload_limit_v1('suppliers') then 1 else 0 end +
      case when coalesce((v_categories->>'payloadBytes')::bigint, 0) >
        app_private.sync_recovery_snapshot_payload_limit_v1('categories') then 1 else 0 end +
      case when coalesce((v_products->>'payloadBytes')::bigint, 0) >
        app_private.sync_recovery_snapshot_payload_limit_v1('products') then 1 else 0 end +
      case when coalesce((v_prices->>'payloadBytes')::bigint, 0) >
        app_private.sync_recovery_snapshot_payload_limit_v1('prices') then 1 else 0 end +
      case when coalesce((v_history->>'payloadBytes')::bigint, 0) >
        app_private.sync_recovery_snapshot_payload_limit_v1('history') then 1 else 0 end +
      case when coalesce((v_images->>'payloadBytes')::bigint, 0) >
        app_private.sync_recovery_snapshot_payload_limit_v1('images') then 1 else 0 end +
      case when (
        coalesce((v_suppliers->>'payloadBytes')::bigint, 0) +
        coalesce((v_categories->>'payloadBytes')::bigint, 0) +
        coalesce((v_products->>'payloadBytes')::bigint, 0) +
        coalesce((v_prices->>'payloadBytes')::bigint, 0) +
        coalesce((v_history->>'payloadBytes')::bigint, 0) +
        coalesce((v_images->>'payloadBytes')::bigint, 0)
      ) > 536870912::bigint then 1 else 0 end
  );

  v_checkpoint := jsonb_build_object(
    'schemaVersion', 'shop-sync-recovery-checkpoint-v1',
    'digestContract', app_private.sync_recovery_digest_contract_v1(),
    'status', case
      when coalesce((v_integrity->>'recoveryPayloadRowViolationCount')::bigint, 0) > 0
        or coalesce((v_integrity->>'recoverySnapshotRowViolationCount')::bigint, 0) > 0
        or coalesce((v_integrity->>'recoverySnapshotPayloadViolationCount')::bigint, 0) > 0
        then 'resource_exceeded'
      when coalesce((v_integrity->>'totalViolationCount')::bigint, 0) > 0
        then 'integrity_blocked'
      else 'ready'
    end,
    'shopId', p_shop_id,
    'scope', jsonb_build_object(
      'kind', v_scope_kind,
      'historyKind', v_history_scope_kind,
      'key', v_scope_key,
      'legacyOwnerKey', v_legacy_owner_key,
      'accountKey', v_account_key,
      'deviceKey', v_device_key
    ),
    'syncEvents', v_sync_events,
    'catalog', v_catalog,
    'prices', v_prices,
    'history', v_history,
    'images', v_images,
    'payloadBudgets', v_payload_budgets,
    'resourcePreflight', v_preflight,
    'integrity', v_integrity
  );

  return v_checkpoint || jsonb_build_object(
    'checkpointDigest', app_private.sync_checkpoint_sha256(v_checkpoint::text)
  );
end;
$$;

revoke all on function public.shop_sync_recovery_checkpoint_v1(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.shop_sync_recovery_checkpoint_v1(uuid, text, text, text)
  to authenticated;

-- Compact, authoritative server half of the mobile noWork proof.  It reuses
-- the exact checkpoint scope and digest construction, but omits recovery
-- budgets and row-materialization diagnostics that clients do not need on an
-- ordinary foreground reconcile.  Row ownership is deliberately not part of
-- authorization after the caller has an active owner/manager membership: all
-- actors see the same authorized shop row set while account/device identity
-- remains bound into scope.key.
drop function if exists public.shop_sync_convergence_marker_v1(
  uuid, text, text, text
);
create or replace function public.shop_sync_convergence_marker_v1(
  p_shop_id uuid,
  p_device_identifier text,
  p_verified_baseline_id text default '0',
  p_expected_baseline_scope_key text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_checkpoint jsonb;
  v_marker jsonb;
  v_server_no_work_eligible boolean;
begin
  v_checkpoint := public.shop_sync_recovery_checkpoint_v1(
    p_shop_id,
    p_device_identifier,
    p_verified_baseline_id,
    p_expected_baseline_scope_key
  );

  v_server_no_work_eligible :=
    v_checkpoint->>'status' = 'ready'
    and coalesce(
      (v_checkpoint#>>'{syncEvents,requiresFullRecovery}')::boolean,
      true
    ) = false
    and v_checkpoint#>>'{syncEvents,maxId}' = p_verified_baseline_id
    and coalesce(
      (v_checkpoint#>>'{integrity,totalViolationCount}')::bigint,
      1
    ) = 0;

  v_marker := jsonb_build_object(
    'schemaVersion', 'shop-sync-convergence-marker-v1',
    'status', v_checkpoint->'status',
    'shopId', v_checkpoint->'shopId',
    'scope', v_checkpoint->'scope',
    'syncEvents', v_checkpoint->'syncEvents',
    'catalog', v_checkpoint->'catalog',
    'prices', v_checkpoint->'prices',
    'history', v_checkpoint->'history',
    'images', v_checkpoint->'images',
    'integrity', jsonb_build_object(
      'totalViolationCount',
        v_checkpoint#>'{integrity,totalViolationCount}'
    ),
    'digestContract', v_checkpoint->'digestContract',
    'checkpointDigest', v_checkpoint->'checkpointDigest',
    'serverNoWorkEligible', v_server_no_work_eligible,
    'clientNoWorkRequirements', jsonb_build_array(
      'scope_key_matches',
      'account_shop_device_lease_valid',
      'baseline_equals_event_max',
      'all_domain_counts_match',
      'all_domain_id_set_digests_match',
      'all_domain_version_digests_match',
      'checkpoint_digest_matches',
      'local_pending_empty',
      'outbox_empty',
      'recovery_journal_empty'
    )
  );

  return v_marker || jsonb_build_object(
    'markerDigest', app_private.sync_checkpoint_sha256(v_marker::text)
  );
end;
$$;

revoke all on function public.shop_sync_convergence_marker_v1(
  uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.shop_sync_convergence_marker_v1(
  uuid, text, text, text
) to authenticated;

create or replace function app_private.shop_sync_scoped_rows_v1(
  p_shop_id uuid,
  p_mapped_owner_id uuid,
  p_authorized_legacy_owner_id uuid,
  p_scope_kind text,
  p_domain text,
  p_after_id text,
  p_entity_ids text[],
  p_limit integer
)
returns table (
  cursor_id text,
  row_data jsonb
)
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 251 then
    raise exception 'shop sync internal page limit is invalid'
      using errcode = '22023';
  end if;

  if p_domain = 'suppliers' then
    if exists (
      select 1
      from (
        select candidate.*
        from public.inventory_suppliers candidate
        where (
          (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
            and candidate.shop_id = p_shop_id)
          or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
            and candidate.shop_id is null
            and candidate.owner_user_id = p_mapped_owner_id)
        )
          and (p_after_id is null or candidate.id > p_after_id::uuid)
          and (p_entity_ids is null
            or lower(candidate.id::text) = any(p_entity_ids))
        order by candidate.id
        limit p_limit
      ) supplier
      where (
          not pg_catalog.isfinite(supplier.updated_at)
          or (supplier.deleted_at is not null
            and not pg_catalog.isfinite(supplier.deleted_at))
          or app_private.sync_supplier_recovery_row_fits_v1(
            supplier.id, supplier.owner_user_id, supplier.name,
            supplier.updated_at, supplier.deleted_at, supplier.shop_id
          ) is not true
        )
    ) then
      raise exception 'shop_sync_recovery_row_invalid'
        using errcode = '55000';
    end if;
    return query
    select lower(supplier.id::text),
      app_private.sync_supplier_recovery_row_v1(
        supplier.id, supplier.owner_user_id, supplier.name,
        supplier.updated_at, supplier.deleted_at, supplier.shop_id
      )
    from public.inventory_suppliers supplier
    where (
      (
        p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
        and supplier.shop_id = p_shop_id
      )
      or (
        p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and supplier.shop_id is null
        and supplier.owner_user_id = p_mapped_owner_id
      )
    )
      and pg_catalog.isfinite(supplier.updated_at)
      and (
        supplier.deleted_at is null
        or pg_catalog.isfinite(supplier.deleted_at)
      )
      and app_private.sync_supplier_recovery_row_fits_v1(
        supplier.id, supplier.owner_user_id, supplier.name,
        supplier.updated_at, supplier.deleted_at, supplier.shop_id
      ) is true
      and (p_after_id is null or supplier.id > p_after_id::uuid)
      and (
        p_entity_ids is null
        or lower(supplier.id::text) = any(p_entity_ids)
      )
    order by supplier.id
    limit p_limit;
  elsif p_domain = 'categories' then
    if exists (
      select 1
      from (
        select candidate.*
        from public.inventory_categories candidate
        where (
          (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
            and candidate.shop_id = p_shop_id)
          or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
            and candidate.shop_id is null
            and candidate.owner_user_id = p_mapped_owner_id)
        )
          and (p_after_id is null or candidate.id > p_after_id::uuid)
          and (p_entity_ids is null
            or lower(candidate.id::text) = any(p_entity_ids))
        order by candidate.id
        limit p_limit
      ) category
      where (
          not pg_catalog.isfinite(category.updated_at)
          or (category.deleted_at is not null
            and not pg_catalog.isfinite(category.deleted_at))
          or app_private.sync_category_recovery_row_fits_v1(
            category.id, category.owner_user_id, category.name,
            category.updated_at, category.deleted_at, category.shop_id
          ) is not true
        )
    ) then
      raise exception 'shop_sync_recovery_row_invalid'
        using errcode = '55000';
    end if;
    return query
    select lower(category.id::text),
      app_private.sync_category_recovery_row_v1(
        category.id, category.owner_user_id, category.name,
        category.updated_at, category.deleted_at, category.shop_id
      )
    from public.inventory_categories category
    where (
      (
        p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
        and category.shop_id = p_shop_id
      )
      or (
        p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and category.shop_id is null
        and category.owner_user_id = p_mapped_owner_id
      )
    )
      and pg_catalog.isfinite(category.updated_at)
      and (
        category.deleted_at is null
        or pg_catalog.isfinite(category.deleted_at)
      )
      and app_private.sync_category_recovery_row_fits_v1(
        category.id, category.owner_user_id, category.name,
        category.updated_at, category.deleted_at, category.shop_id
      ) is true
      and (p_after_id is null or category.id > p_after_id::uuid)
      and (
        p_entity_ids is null
        or lower(category.id::text) = any(p_entity_ids)
      )
    order by category.id
    limit p_limit;
  elsif p_domain = 'products' then
    if exists (
      select 1
      from (
        select candidate.*
        from public.inventory_products candidate
        where (
          (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
            and candidate.shop_id = p_shop_id)
          or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
            and candidate.shop_id is null
            and candidate.owner_user_id = p_mapped_owner_id)
        )
          and (p_after_id is null or candidate.id > p_after_id::uuid)
          and (p_entity_ids is null
            or lower(candidate.id::text) = any(p_entity_ids))
        order by candidate.id
        limit p_limit
      ) product
      where (
          not pg_catalog.isfinite(product.updated_at)
          or (product.deleted_at is not null
            and not pg_catalog.isfinite(product.deleted_at))
          or (product.primary_image_updated_at is not null
            and not pg_catalog.isfinite(product.primary_image_updated_at))
          or app_private.sync_product_recovery_row_fits_v1(
            product.id, product.owner_user_id, product.barcode,
            product.item_number, product.product_name,
            product.second_product_name, product.purchase_price,
            product.retail_price, product.supplier_id, product.category_id,
            product.stock_quantity, product.updated_at, product.deleted_at,
            product.shop_id, product.primary_image_version_id,
            product.primary_image_updated_at
          ) is not true
          or (product.deleted_at is null and (
            (product.category_id is not null and not exists (
              select 1 from public.inventory_categories category
              where category.id = product.category_id
                and category.deleted_at is null
                and (
                  (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
                    and category.shop_id = p_shop_id)
                  or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
                    and category.shop_id is null
                    and category.owner_user_id = p_mapped_owner_id)
                )
            ))
            or (product.supplier_id is not null and not exists (
              select 1 from public.inventory_suppliers supplier
              where supplier.id = product.supplier_id
                and supplier.deleted_at is null
                and (
                  (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
                    and supplier.shop_id = p_shop_id)
                  or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
                    and supplier.shop_id is null
                    and supplier.owner_user_id = p_mapped_owner_id)
                )
            ))
            or (product.primary_image_version_id is not null and not exists (
              select 1 from public.inventory_product_image_versions version
              where version.id = product.primary_image_version_id
                and version.product_id = product.id
                and version.shop_id = p_shop_id
                and version.status = 'ready'
                and version.removed_at is null
            ))
          ))
        )
    ) then
      raise exception 'shop_sync_recovery_row_invalid'
        using errcode = '55000';
    end if;
    return query
    select lower(product.id::text),
      app_private.sync_product_recovery_row_v1(
        product.id, product.owner_user_id, product.barcode,
        product.item_number, product.product_name,
        product.second_product_name, product.purchase_price,
        product.retail_price, product.supplier_id, product.category_id,
        product.stock_quantity, product.updated_at, product.deleted_at,
        product.shop_id, product.primary_image_version_id,
        product.primary_image_updated_at
      )
    from public.inventory_products product
    where (
      (
        p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
        and product.shop_id = p_shop_id
      )
      or (
        p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and product.shop_id is null
        and product.owner_user_id = p_mapped_owner_id
      )
    )
      and pg_catalog.isfinite(product.updated_at)
      and (
        product.deleted_at is null
        or pg_catalog.isfinite(product.deleted_at)
      )
      and (
        product.primary_image_updated_at is null
        or pg_catalog.isfinite(product.primary_image_updated_at)
      )
      and app_private.sync_product_recovery_row_fits_v1(
        product.id, product.owner_user_id, product.barcode,
        product.item_number, product.product_name,
        product.second_product_name, product.purchase_price,
        product.retail_price, product.supplier_id, product.category_id,
        product.stock_quantity, product.updated_at, product.deleted_at,
        product.shop_id, product.primary_image_version_id,
        product.primary_image_updated_at
      ) is true
      and (p_after_id is null or product.id > p_after_id::uuid)
      and (
        p_entity_ids is null
        or lower(product.id::text) = any(p_entity_ids)
      )
      and (
        product.deleted_at is not null
        or (
          (product.category_id is null or exists (
            select 1
            from public.inventory_categories category
            where category.id = product.category_id
              and category.deleted_at is null
              and (
                (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
                  and category.shop_id = p_shop_id)
                or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
                  and category.shop_id is null
                  and category.owner_user_id = p_mapped_owner_id)
              )
          ))
          and (product.supplier_id is null or exists (
            select 1
            from public.inventory_suppliers supplier
            where supplier.id = product.supplier_id
              and supplier.deleted_at is null
              and (
                (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
                  and supplier.shop_id = p_shop_id)
                or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
                  and supplier.shop_id is null
                  and supplier.owner_user_id = p_mapped_owner_id)
              )
          ))
          and (product.primary_image_version_id is null or exists (
            select 1
            from public.inventory_product_image_versions version
            where version.id = product.primary_image_version_id
              and version.product_id = product.id
              and version.shop_id = p_shop_id
              and version.status = 'ready'
              and version.removed_at is null
          ))
        )
      )
    order by product.id
    limit p_limit;
  elsif p_domain = 'prices' then
    if exists (
      select 1
      from (
        select candidate.*
        from public.inventory_product_prices candidate
        where (
          (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
            and candidate.shop_id = p_shop_id)
          or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
            and candidate.shop_id is null
            and candidate.owner_user_id = p_mapped_owner_id)
        )
          and (p_after_id is null or candidate.id > p_after_id::uuid)
          and (p_entity_ids is null
            or lower(candidate.id::text) = any(p_entity_ids))
        order by candidate.id
        limit p_limit
      ) price_row
      where (
          not pg_catalog.isfinite(price_row.updated_at)
          or app_private.sync_price_recovery_row_fits_v1(
            price_row.id, price_row.owner_user_id, price_row.product_id,
            price_row.type, price_row.price, price_row.effective_at,
            price_row.source, price_row.note, price_row.created_at,
            price_row.shop_id, price_row.updated_at
          ) is not true
          or not exists (
            select 1
            from public.inventory_products product
            where product.id = price_row.product_id
              and (
                (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
                  and product.shop_id = p_shop_id)
                or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
                  and product.shop_id is null
                  and product.owner_user_id = p_mapped_owner_id)
              )
          )
        )
    ) then
      raise exception 'shop_sync_recovery_row_invalid'
        using errcode = '55000';
    end if;
    return query
    select lower(price_row.id::text),
      app_private.sync_price_recovery_row_v1(
        price_row.id, price_row.owner_user_id, price_row.product_id,
        price_row.type, price_row.price, price_row.effective_at,
        price_row.source, price_row.note, price_row.created_at,
        price_row.shop_id, price_row.updated_at
      )
    from public.inventory_product_prices price_row
    where (
      (
        p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
        and price_row.shop_id = p_shop_id
      )
      or (
        p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and price_row.shop_id is null
        and price_row.owner_user_id = p_mapped_owner_id
      )
    )
      and pg_catalog.isfinite(price_row.updated_at)
      and app_private.sync_price_recovery_row_fits_v1(
        price_row.id, price_row.owner_user_id, price_row.product_id,
        price_row.type, price_row.price, price_row.effective_at,
        price_row.source, price_row.note, price_row.created_at,
        price_row.shop_id, price_row.updated_at
      ) is true
      and exists (
        select 1
        from public.inventory_products product
        where product.id = price_row.product_id
          and (
            (
              p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
              and product.shop_id = p_shop_id
            ) or (
              p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
              and product.shop_id is null
              and product.owner_user_id = p_mapped_owner_id
            )
          )
      )
      and (p_after_id is null or price_row.id > p_after_id::uuid)
      and (
        p_entity_ids is null
        or lower(price_row.id::text) = any(p_entity_ids)
      )
    order by price_row.id
    limit p_limit;
  elsif p_domain = 'history' then
    if exists (
      select 1 from public.shared_sheet_sessions session
      where (session.shop_id=p_shop_id or (
        p_authorized_legacy_owner_id is not null
        and session.shop_id is null
        and session.owner_user_id=p_authorized_legacy_owner_id
      )) and case when octet_length(session.remote_id)=36
        then session.remote_id
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        else true end
    ) then
      raise exception 'shop_sync_recovery_row_invalid'
        using errcode='55000';
    end if;
    if exists (
      select 1
      from (
        select candidate.*
        from public.shared_sheet_sessions candidate
        where (
          candidate.shop_id = p_shop_id
          or (p_authorized_legacy_owner_id is not null
            and candidate.shop_id is null
            and candidate.owner_user_id = p_authorized_legacy_owner_id)
        )
          and case when octet_length(candidate.remote_id)=36
            then candidate.remote_id
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            else false end
          and (p_entity_ids is null or case
            when octet_length(candidate.remote_id)=36
              then lower(candidate.remote_id) = any(p_entity_ids)
            else false end)
          and (
            p_after_id is null
            or lower(candidate.remote_id)::uuid > p_after_id::uuid
          )
        order by lower(candidate.remote_id)::uuid
        limit p_limit
      ) session
      where (
          not pg_catalog.isfinite(session.updated_at)
          or (session.deleted_at is not null
            and not pg_catalog.isfinite(session.deleted_at))
          or app_private.sync_history_recovery_row_fits_v1(
            session.remote_id, session.payload_version, session."timestamp",
            session.supplier, session.category, session.is_manual_entry,
            session.updated_at, session.owner_user_id, session.display_name,
            session.deleted_at, session.shop_id,
            case when session.deleted_at is null then session.data else null end,
            case when session.deleted_at is null
              then session.session_overlay else null end
          ) is not true
        )
    ) then
      raise exception 'shop_sync_recovery_row_invalid'
        using errcode = '55000';
    end if;
    return query
    select lower(session.remote_id),
      app_private.sync_history_recovery_row_v1(
        session.remote_id, session.payload_version, session."timestamp",
        session.supplier, session.category, session.is_manual_entry,
        session.updated_at, session.owner_user_id, session.display_name,
        session.deleted_at, session.shop_id,
        case when session.deleted_at is null then session.data else null end,
        case when session.deleted_at is null
          then session.session_overlay else null end
      )
    from public.shared_sheet_sessions session
    where (
      session.shop_id = p_shop_id
      or (
        p_authorized_legacy_owner_id is not null
        and session.shop_id is null
        and session.owner_user_id = p_authorized_legacy_owner_id
      )
      )
      and pg_catalog.isfinite(session.updated_at)
      and (
        session.deleted_at is null
        or pg_catalog.isfinite(session.deleted_at)
      )
      and app_private.sync_history_recovery_row_fits_v1(
        session.remote_id, session.payload_version, session."timestamp",
        session.supplier, session.category, session.is_manual_entry,
        session.updated_at, session.owner_user_id, session.display_name,
        session.deleted_at, session.shop_id,
        case when session.deleted_at is null then session.data else null end,
        case when session.deleted_at is null
          then session.session_overlay else null end
      ) is true
      and case when octet_length(session.remote_id)=36
        then session.remote_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        else false end
      and (
        p_after_id is null
        or case
          when octet_length(session.remote_id)=36 then case
            when session.remote_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then lower(session.remote_id)::uuid
            else null end
          else null
        end > p_after_id::uuid
      )
      and (
        p_entity_ids is null
        or case when octet_length(session.remote_id)=36
          then lower(session.remote_id) = any(p_entity_ids)
          else false end
      )
    order by case
      when octet_length(session.remote_id)=36 then case
        when session.remote_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then lower(session.remote_id)::uuid
        else null end
      else null
    end
    limit p_limit;
  elsif p_domain = 'images' then
    if exists (
      select 1
      from (
        select
          product.id as product_id,
          product.owner_user_id,
          product.shop_id as product_shop_id,
          product.updated_at as product_updated_at,
          product.deleted_at as product_deleted_at,
          product.primary_image_updated_at,
          version.id as version_id,
          version.status,
          version.created_at as version_created_at,
          version.expires_at as version_expires_at,
          version.finalized_at,
          version.removed_at,
          version.verified_main_sha256,
          version.verified_main_bytes,
          version.verified_main_width,
          version.verified_main_height,
          version.verified_main_mime_type,
          version.verified_thumb_sha256,
          version.verified_thumb_bytes,
          version.verified_thumb_width,
          version.verified_thumb_height,
          version.verified_thumb_mime_type
        from public.inventory_products product
        join public.inventory_product_image_versions version
          on version.id = product.primary_image_version_id
         and version.product_id = product.id
         and version.shop_id = p_shop_id
        where (
          (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
            and product.shop_id = p_shop_id)
          or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
            and product.shop_id is null
            and product.owner_user_id = p_mapped_owner_id)
        )
          and (p_after_id is null or product.id > p_after_id::uuid)
          and (p_entity_ids is null
            or lower(product.id::text) = any(p_entity_ids))
        order by product.id
        limit p_limit
      ) image_row
      where (
          not pg_catalog.isfinite(image_row.product_updated_at)
          or (image_row.product_deleted_at is not null
            and not pg_catalog.isfinite(image_row.product_deleted_at))
          or (image_row.primary_image_updated_at is not null
            and not pg_catalog.isfinite(image_row.primary_image_updated_at))
          or not pg_catalog.isfinite(image_row.version_created_at)
          or not pg_catalog.isfinite(image_row.version_expires_at)
          or (image_row.finalized_at is not null
            and not pg_catalog.isfinite(image_row.finalized_at))
          or image_row.status <> 'ready'
          or image_row.removed_at is not null
          or app_private.sync_image_recovery_row_fits_v1(
            image_row.product_id, image_row.owner_user_id,
            image_row.product_shop_id, image_row.product_deleted_at,
            image_row.version_id, image_row.status, image_row.finalized_at,
            image_row.verified_main_sha256, image_row.verified_main_bytes,
            image_row.verified_main_width, image_row.verified_main_height,
            image_row.verified_main_mime_type,
            image_row.verified_thumb_sha256, image_row.verified_thumb_bytes,
            image_row.verified_thumb_width, image_row.verified_thumb_height,
            image_row.verified_thumb_mime_type
          ) is not true
        )
    ) then
      raise exception 'shop_sync_recovery_row_invalid'
        using errcode = '55000';
    end if;
    return query
    select lower(product.id::text),
      app_private.sync_image_recovery_row_v1(
        product.id, product.owner_user_id, product.shop_id,
        product.deleted_at, version.id, version.status,
        version.finalized_at, version.verified_main_sha256,
        version.verified_main_bytes, version.verified_main_width,
        version.verified_main_height, version.verified_main_mime_type,
        version.verified_thumb_sha256, version.verified_thumb_bytes,
        version.verified_thumb_width, version.verified_thumb_height,
        version.verified_thumb_mime_type
      )
    from public.inventory_products product
    join public.inventory_product_image_versions version
      on version.id = product.primary_image_version_id
      and version.product_id = product.id
      and version.shop_id = p_shop_id
      and version.status = 'ready'
      and version.removed_at is null
    where (
      (
        p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
        and product.shop_id = p_shop_id
      )
      or (
        p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and product.shop_id is null
        and product.owner_user_id = p_mapped_owner_id
      )
    )
      and pg_catalog.isfinite(product.updated_at)
      and (
        product.deleted_at is null
        or pg_catalog.isfinite(product.deleted_at)
      )
      and (
        product.primary_image_updated_at is null
        or pg_catalog.isfinite(product.primary_image_updated_at)
      )
      and pg_catalog.isfinite(version.created_at)
      and pg_catalog.isfinite(version.expires_at)
      and (
        version.finalized_at is null
        or pg_catalog.isfinite(version.finalized_at)
      )
      and app_private.sync_image_recovery_row_fits_v1(
        product.id, product.owner_user_id, product.shop_id,
        product.deleted_at, version.id, version.status,
        version.finalized_at, version.verified_main_sha256,
        version.verified_main_bytes, version.verified_main_width,
        version.verified_main_height, version.verified_main_mime_type,
        version.verified_thumb_sha256, version.verified_thumb_bytes,
        version.verified_thumb_width, version.verified_thumb_height,
        version.verified_thumb_mime_type
      ) is true
      and (p_after_id is null or product.id > p_after_id::uuid)
      and (
        p_entity_ids is null
        or lower(product.id::text) = any(p_entity_ids)
      )
    order by product.id
    limit p_limit;
  else
    raise exception 'unsupported shop sync row domain'
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function app_private.shop_sync_scoped_rows_v1(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text[],
  integer
) from public, anon, authenticated;

drop function if exists public.shop_sync_recovery_page_v1(
  uuid, text, text, text, integer
);
drop function if exists public.shop_sync_recovery_page_v1(
  uuid, text, text, text, integer, text
);
drop function if exists public.shop_sync_recovery_page_v1(
  uuid, text, text, text, integer, text, text
);
drop function if exists public.shop_sync_recovery_page_v1(
  uuid, text, text, text, integer, text, text, text
);
create function public.shop_sync_recovery_page_v1(
  p_shop_id uuid,
  p_device_identifier text,
  p_domain text,
  p_after_id text default null,
  p_limit integer default 250,
  p_expected_scope_key text default null,
  p_expected_event_max_id text default null,
  p_expected_domain_event_max_id text default null
)
returns jsonb
language plpgsql
stable
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
  v_effective_limit integer;
  v_rows jsonb;
  v_next_after_id text;
  v_has_more boolean;
  v_max_row_bytes integer := 0;
  v_page_payload_bytes bigint := 0;
  v_result jsonb;
  v_expected_event_max_id bigint;
  v_current_event_max_id bigint;
  v_event_domain text;
  v_expected_domain_event_max_id bigint;
  v_current_domain_event_max_id bigint;
  v_legacy_global_event_fence boolean := false;
begin
  if p_domain not in (
    'suppliers',
    'categories',
    'products',
    'prices',
    'history',
    'images'
  ) then
    raise exception 'unsupported shop sync recovery domain'
      using errcode = '22023';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 250 then
    raise exception 'shop sync recovery page limit must be between 1 and 250'
      using errcode = '22023';
  end if;

  if p_after_id is not null
    and p_after_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'shop sync recovery cursor must be a UUID'
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
  from app_private.resolve_shop_sync_recovery_scope(
    p_shop_id,
    p_device_identifier
  ) scope;

  if coalesce(p_expected_scope_key, '') !~ '^[a-f0-9]{64}$'
    or p_expected_scope_key <> v_scope_key then
    raise exception 'shop_sync_recovery_scope_changed'
      using errcode = '55000';
  end if;

  if coalesce(p_expected_event_max_id, '') !~ '^(0|[1-9][0-9]{0,18})$' then
    raise exception 'shop_sync_recovery_snapshot_changed'
      using errcode = '55000';
  end if;
  begin
    v_expected_event_max_id := p_expected_event_max_id::bigint;
  exception when numeric_value_out_of_range then
    raise exception 'shop_sync_recovery_snapshot_changed'
      using errcode = '55000';
  end;
  v_legacy_global_event_fence := p_expected_domain_event_max_id is null;
  if not v_legacy_global_event_fence then
    if p_expected_domain_event_max_id !~ '^(0|[1-9][0-9]{0,18})$' then
      raise exception 'expected domain event max must be a canonical decimal string'
        using errcode = '22023';
    end if;
    begin
      v_expected_domain_event_max_id := p_expected_domain_event_max_id::bigint;
    exception when numeric_value_out_of_range then
      raise exception 'expected domain event max is outside bigint range'
        using errcode = '22003';
    end;
  end if;
  v_current_event_max_id := app_private.shop_sync_scope_event_max_id_v1(
    p_shop_id,
    v_scope_kind,
    v_mapped_owner_id,
    v_authorized_legacy_owner_id
  );
  if (v_legacy_global_event_fence
      and v_current_event_max_id <> v_expected_event_max_id)
    or (not v_legacy_global_event_fence
      and v_current_event_max_id < v_expected_event_max_id) then
    raise exception 'shop_sync_recovery_snapshot_changed'
      using errcode = '55000';
  end if;
  v_event_domain := app_private.sync_recovery_domain_event_domain_v1(p_domain);
  v_current_domain_event_max_id :=
    app_private.shop_sync_scope_domain_event_max_id_v1(
      p_shop_id,
      v_scope_kind,
      v_mapped_owner_id,
      v_authorized_legacy_owner_id,
      v_event_domain
    );
  if v_legacy_global_event_fence then
    v_expected_domain_event_max_id := v_current_domain_event_max_id;
  end if;
  if (
      v_legacy_global_event_fence
      and v_current_domain_event_max_id <> v_expected_domain_event_max_id
    ) or (
      not v_legacy_global_event_fence
      and v_current_domain_event_max_id < v_expected_domain_event_max_id
    ) or v_expected_domain_event_max_id > v_expected_event_max_id then
    raise exception 'shop_sync_recovery_domain_snapshot_changed'
      using errcode = '55000';
  end if;

  v_effective_limit := least(
    p_limit,
    app_private.sync_recovery_page_row_count_limit_v1(p_domain)
  );

  with candidates as materialized (
    select row.cursor_id, row.row_data
    from app_private.shop_sync_scoped_rows_v1(
      p_shop_id,
      v_mapped_owner_id,
      v_authorized_legacy_owner_id,
      v_scope_kind,
      p_domain,
      p_after_id,
      null,
      v_effective_limit + 1
    ) row
  ), page_rows as (
    select candidate.cursor_id, candidate.row_data
    from candidates candidate
    order by candidate.cursor_id
    limit v_effective_limit
  )
  select
    coalesce(
      (select jsonb_agg(page.row_data order by page.cursor_id) from page_rows page),
      '[]'::jsonb
    ),
    (select count(*) > v_effective_limit from candidates),
    case
      when (select count(*) > v_effective_limit from candidates) then
        (select page.cursor_id from page_rows page order by page.cursor_id desc limit 1)
      else null
    end,
    coalesce((select max(octet_length(candidate.row_data::text)) from candidates candidate), 0),
    coalesce((select sum(octet_length(page.row_data::text)) from page_rows page), 0)
  into
    v_rows,
    v_has_more,
    v_next_after_id,
    v_max_row_bytes,
    v_page_payload_bytes;

  if v_max_row_bytes > app_private.sync_recovery_row_payload_limit_v1(p_domain) then
    raise exception 'shop_sync_recovery_row_payload_too_large'
      using errcode = '54000';
  end if;

  if v_page_payload_bytes > 4000000 then
    raise exception 'shop_sync_recovery_page_payload_too_large'
      using errcode = '54000';
  end if;

  v_result := jsonb_build_object(
    'schemaVersion', 'shop-sync-recovery-page-v1',
    'shopId', p_shop_id,
    'scope', jsonb_build_object(
      'kind', v_scope_kind,
      'historyKind', v_history_scope_kind,
      'key', v_scope_key,
      'legacyOwnerKey', v_legacy_owner_key,
      'accountKey', v_account_key,
      'deviceKey', v_device_key
    ),
    'domain', p_domain,
    'snapshotEventMaxId', v_expected_event_max_id::text,
    'currentScopeEventMaxId', v_current_event_max_id::text,
    'baselineDomainEventMaxId', v_expected_domain_event_max_id::text,
    'pageDomainEventMaxId', v_current_domain_event_max_id::text,
    'domainScope', case
      when p_domain = 'history' then v_history_scope_kind
      else v_scope_kind
    end,
    'pageLimit', v_effective_limit,
    'payloadBytes', v_page_payload_bytes,
    'maxRowBytes', v_max_row_bytes,
    'maxPageRowPayloadBytes', 4000000,
    'maxResponseBytes', 4194304,
    'maxAllowedRowBytes',
      app_private.sync_recovery_row_payload_limit_v1(p_domain),
    'rows', v_rows,
    'nextAfterId', v_next_after_id,
    'hasMore', v_has_more
  );

  if octet_length(v_result::text) > 4194304 then
    raise exception 'shop_sync_recovery_response_too_large'
      using errcode = '54000';
  end if;

  return v_result;
end;
$$;

revoke all on function public.shop_sync_recovery_page_v1(
  uuid,
  text,
  text,
  text,
  integer,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.shop_sync_recovery_page_v1(
  uuid,
  text,
  text,
  text,
  integer,
  text,
  text,
  text
) to authenticated;

drop function if exists public.shop_sync_rows_by_ids_v1(
  uuid, text, text, text[]
);
drop function if exists public.shop_sync_rows_by_ids_v1(
  uuid, text, text, text[], text
);
drop function if exists public.shop_sync_rows_by_ids_v1(
  uuid, text, text, text[], text, text
);
drop function if exists public.shop_sync_rows_by_ids_v1(
  uuid, text, text, text[], text, text, text
);
create function public.shop_sync_rows_by_ids_v1(
  p_shop_id uuid,
  p_device_identifier text,
  p_domain text,
  p_entity_ids text[],
  p_expected_scope_key text default null,
  p_expected_event_max_id text default null,
  p_expected_domain_event_max_id text default null
)
returns jsonb
language plpgsql
stable
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
  v_entity_ids text[];
  v_input_id text;
  v_rows jsonb;
  v_returned_ids text[];
  v_missing_ids text[];
  v_max_row_bytes integer := 0;
  v_payload_bytes bigint := 0;
  v_result jsonb;
  v_expected_event_max_id bigint;
  v_current_event_max_id bigint;
  v_event_domain text;
  v_expected_domain_event_max_id bigint;
  v_current_domain_event_max_id bigint;
  v_legacy_global_event_fence boolean := false;
begin
  if p_domain not in (
    'suppliers',
    'categories',
    'products',
    'prices',
    'history',
    'images'
  ) then
    raise exception 'unsupported shop sync targeted domain'
      using errcode = '22023';
  end if;

  if p_entity_ids is null
    or cardinality(p_entity_ids) < 1
    or cardinality(p_entity_ids) >
      app_private.sync_recovery_page_row_count_limit_v1(p_domain) then
    raise exception 'shop sync targeted ID count exceeds the domain limit'
      using errcode = '22023';
  end if;

  -- Validate each bounded scalar before lower()/array_agg() can allocate from
  -- attacker-controlled text. Normalization happens only after this guard.
  v_entity_ids := array[]::text[];
  foreach v_input_id in array p_entity_ids
  loop
    if v_input_id is null
      or octet_length(v_input_id) > 36
      or v_input_id
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'shop sync targeted IDs must be unique UUIDs'
        using errcode = '22023';
    end if;
    v_entity_ids := array_append(v_entity_ids, lower(v_input_id));
  end loop;
  select array_agg(input.id order by input.id)
  into v_entity_ids
  from unnest(v_entity_ids) input(id);

  if cardinality(v_entity_ids) <> (
    select count(distinct input.id)::integer from unnest(v_entity_ids) input(id)
  ) then
    raise exception 'shop sync targeted IDs must be unique UUIDs'
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
  from app_private.resolve_shop_sync_recovery_scope(
    p_shop_id,
    p_device_identifier
  ) scope;

  if coalesce(p_expected_scope_key, '') !~ '^[a-f0-9]{64}$'
    or p_expected_scope_key <> v_scope_key then
    raise exception 'shop_sync_recovery_scope_changed'
      using errcode = '55000';
  end if;

  if coalesce(p_expected_event_max_id, '')
    !~ '^(0|[1-9][0-9]{0,18})$' then
    raise exception 'expected event max must be a canonical decimal string'
      using errcode = '22023';
  end if;
  begin
    v_expected_event_max_id := p_expected_event_max_id::bigint;
  exception when numeric_value_out_of_range then
    raise exception 'expected event max is outside bigint range'
      using errcode = '22003';
  end;
  v_legacy_global_event_fence := p_expected_domain_event_max_id is null;
  if not v_legacy_global_event_fence then
    if p_expected_domain_event_max_id !~ '^(0|[1-9][0-9]{0,18})$' then
      raise exception 'expected domain event max must be a canonical decimal string'
        using errcode = '22023';
    end if;
    begin
      v_expected_domain_event_max_id := p_expected_domain_event_max_id::bigint;
    exception when numeric_value_out_of_range then
      raise exception 'expected domain event max is outside bigint range'
        using errcode = '22003';
    end;
  end if;
  v_current_event_max_id := app_private.shop_sync_scope_event_max_id_v1(
    p_shop_id,
    v_scope_kind,
    v_mapped_owner_id,
    v_authorized_legacy_owner_id
  );
  if (v_legacy_global_event_fence
      and v_current_event_max_id <> v_expected_event_max_id)
    or (not v_legacy_global_event_fence
      and v_current_event_max_id < v_expected_event_max_id) then
    raise exception 'shop_sync_incremental_snapshot_changed'
      using errcode = '55000';
  end if;
  v_event_domain := app_private.sync_recovery_domain_event_domain_v1(p_domain);
  v_current_domain_event_max_id :=
    app_private.shop_sync_scope_domain_event_max_id_v1(
      p_shop_id,
      v_scope_kind,
      v_mapped_owner_id,
      v_authorized_legacy_owner_id,
      v_event_domain
    );
  if v_legacy_global_event_fence then
    v_expected_domain_event_max_id := v_current_domain_event_max_id;
  end if;
  if (
      v_legacy_global_event_fence
      and v_current_domain_event_max_id <> v_expected_domain_event_max_id
    ) or (
      not v_legacy_global_event_fence
      and v_current_domain_event_max_id < v_expected_domain_event_max_id
    ) or v_expected_domain_event_max_id > v_expected_event_max_id then
    raise exception 'shop_sync_incremental_domain_snapshot_changed'
      using errcode = '55000';
  end if;

  with matched as materialized (
    select row.cursor_id, row.row_data
    from app_private.shop_sync_scoped_rows_v1(
      p_shop_id,
      v_mapped_owner_id,
      v_authorized_legacy_owner_id,
      v_scope_kind,
      p_domain,
      null,
      v_entity_ids,
      app_private.sync_recovery_page_row_count_limit_v1(p_domain)
    ) row
  )
  select
    coalesce(jsonb_agg(matched.row_data order by matched.cursor_id), '[]'::jsonb),
    coalesce(array_agg(matched.cursor_id order by matched.cursor_id), array[]::text[]),
    coalesce(max(octet_length(matched.row_data::text)), 0),
    coalesce(sum(octet_length(matched.row_data::text)), 0)
  into v_rows, v_returned_ids, v_max_row_bytes, v_payload_bytes
  from matched;

  if v_max_row_bytes > app_private.sync_recovery_row_payload_limit_v1(p_domain) then
    raise exception 'shop_sync_recovery_row_payload_too_large'
      using errcode = '54000';
  end if;

  if v_payload_bytes > 4000000 then
    raise exception 'shop_sync_recovery_page_payload_too_large'
      using errcode = '54000';
  end if;

  select coalesce(array_agg(requested.id order by requested.id), array[]::text[])
  into v_missing_ids
  from unnest(v_entity_ids) requested(id)
  where not requested.id = any(v_returned_ids);

  v_result := jsonb_build_object(
    'schemaVersion', 'shop-sync-rows-by-ids-v1',
    'shopId', p_shop_id,
    'scope', jsonb_build_object(
      'kind', v_scope_kind,
      'historyKind', v_history_scope_kind,
      'key', v_scope_key,
      'legacyOwnerKey', v_legacy_owner_key,
      'accountKey', v_account_key,
      'deviceKey', v_device_key
    ),
    'domain', p_domain,
    'asOfEventMaxId', v_expected_event_max_id::text,
    'currentScopeEventMaxId', v_current_event_max_id::text,
    'minimumDomainEventMaxId', v_expected_domain_event_max_id::text,
    'materializedDomainEventMaxId', v_current_domain_event_max_id::text,
    'domainScope', case
      when p_domain = 'history' then v_history_scope_kind
      else v_scope_kind
    end,
    'requestedCount', cardinality(v_entity_ids),
    'payloadBytes', v_payload_bytes,
    'maxRowBytes', v_max_row_bytes,
    'maxPageRowPayloadBytes', 4000000,
    'maxResponseBytes', 4194304,
    'maxAllowedRowBytes',
      app_private.sync_recovery_row_payload_limit_v1(p_domain),
    'rows', v_rows,
    'missingIds', to_jsonb(v_missing_ids)
  );

  if octet_length(v_result::text) > 4194304 then
    raise exception 'shop_sync_recovery_response_too_large'
      using errcode = '54000';
  end if;

  return v_result;
end;
$$;

revoke all on function public.shop_sync_rows_by_ids_v1(
  uuid,
  text,
  text,
  text[],
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.shop_sync_rows_by_ids_v1(
  uuid,
  text,
  text,
  text[],
  text,
  text,
  text
) to authenticated;

create or replace function app_private.sync_event_safe_bounded_row_v1(
  p_id bigint,
  p_owner_user_id uuid,
  p_store_id uuid,
  p_domain text,
  p_event_type text,
  p_source text,
  p_source_device_id text,
  p_batch_id uuid,
  p_client_event_id text,
  p_changed_count integer,
  p_entity_ids jsonb,
  p_created_at timestamptz,
  p_expires_at timestamptz,
  p_metadata jsonb,
  p_shop_id uuid,
  p_authorized_shop_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  with safety as materialized (
    select
      app_private.sync_event_storage_is_bounded_v1(
        p_domain, p_event_type, p_source, p_source_device_id,
        p_client_event_id, p_entity_ids, p_metadata
      )
        as storage_is_bounded,
      app_private.sync_event_is_incrementally_safe_v1(
        p_owner_user_id, p_shop_id, p_domain, p_event_type, p_source,
        p_source_device_id, p_client_event_id, p_changed_count, p_entity_ids,
        p_created_at, p_expires_at, p_metadata
      ) as is_safe
  )
  select jsonb_build_object(
    -- bigint must cross the JSON/PostgREST boundary as decimal text.  JSON
    -- numbers lose precision in JavaScript once ids exceed 2^53.
    'id', p_id::text,
    'owner_user_id', p_owner_user_id,
    'shop_id', p_shop_id,
    'authorized_shop_id', p_authorized_shop_id,
    'store_id', p_store_id,
    'domain', case
      when safety.storage_is_bounded
        and p_domain in ('catalog', 'prices', 'history')
        then p_domain
      else 'unsupported'
    end,
    'event_type', case
      when safety.storage_is_bounded
        and app_private.sync_event_type_is_supported(
        p_domain,
        p_event_type
      ) then p_event_type
      else 'unsupported'
    end,
    'source', case
      when safety.storage_is_bounded and p_source in (
        'admin_web',
        'android',
        'database_atomic',
        'ios',
        'pos_catalog_import_sync',
        'product_image_api',
        'supplier_excel'
      ) then p_source
      else 'other'
    end,
    'source_scope', case
      when p_shop_id is null then 'legacy_owner_bridge'
      else 'shop_scoped'
    end,
    'source_device_key', case
      when safety.storage_is_bounded
        and p_source_device_id is not null
        and length(p_source_device_id) between 1 and 160
        then app_private.sync_checkpoint_sha256(p_source_device_id)
      else null
    end,
    'registered_shop_device_id', case
      when safety.storage_is_bounded then (
        select device.shop_device_id
        from public.shop_devices device
        where device.shop_id = p_authorized_shop_id
          and device.device_identifier = p_source_device_id
          and device.status = 'active'
          and device.revoked_at is null
        order by device.updated_at desc
        limit 1
      )
      else null
    end,
    'batch_id', p_batch_id,
    'client_event_key', case
      when safety.storage_is_bounded
        and p_client_event_id is not null
        and length(p_client_event_id) between 1 and 160
        then app_private.sync_checkpoint_sha256(p_client_event_id)
      else null
    end,
    'changed_count', p_changed_count,
    'entity_ids', case
      when safety.is_safe
        then p_entity_ids
      else null
    end,
    'metadata', case
      when safety.storage_is_bounded
        then app_private.sync_event_redacted_metadata(p_metadata)
      else '{}'::jsonb
    end,
    'requires_full_recovery',
      not safety.is_safe,
    'timestamp_valid',
      pg_catalog.isfinite(p_created_at)
      and (
        p_expires_at is null
        or pg_catalog.isfinite(p_expires_at)
      ),
    'created_at', case
      when pg_catalog.isfinite(p_created_at)
        then app_private.sync_checkpoint_json_timestamp(p_created_at)
      else '1970-01-01T00:00:00.000000Z'
    end,
    'expires_at', case
      when p_expires_at is null
        or not pg_catalog.isfinite(p_expires_at) then null
      else app_private.sync_checkpoint_json_timestamp(p_expires_at)
    end
  )
  from safety;
$$;

create or replace function app_private.sync_event_safe_row_v1(
  p_id bigint,
  p_owner_user_id uuid,
  p_store_id uuid,
  p_domain text,
  p_event_type text,
  p_source text,
  p_source_device_id text,
  p_batch_id uuid,
  p_client_event_id text,
  p_changed_count integer,
  p_entity_ids jsonb,
  p_created_at timestamptz,
  p_expires_at timestamptz,
  p_metadata jsonb,
  p_shop_id uuid,
  p_authorized_shop_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if not app_private.sync_event_storage_is_bounded_v1(
      p_domain, p_event_type, p_source, p_source_device_id,
      p_client_event_id, p_entity_ids, p_metadata
    ) then
    return jsonb_build_object(
      'id', p_id::text,
      'owner_user_id', p_owner_user_id,
      'shop_id', p_shop_id,
      'authorized_shop_id', p_authorized_shop_id,
      'store_id', p_store_id,
      'domain', 'unsupported',
      'event_type', 'unsupported',
      'source', 'other',
      'source_scope', case
        when p_shop_id is null then 'legacy_owner_bridge'
        else 'shop_scoped'
      end,
      'source_device_key', null,
      'registered_shop_device_id', null,
      'batch_id', p_batch_id,
      'client_event_key', null,
      'changed_count', p_changed_count,
      'entity_ids', null,
      'metadata', '{}'::jsonb,
      'requires_full_recovery', true,
      'timestamp_valid',
        pg_catalog.isfinite(p_created_at)
        and (p_expires_at is null
          or pg_catalog.isfinite(p_expires_at)),
      'created_at', case
        when pg_catalog.isfinite(p_created_at)
          then app_private.sync_checkpoint_json_timestamp(p_created_at)
        else '1970-01-01T00:00:00.000000Z'
      end,
      'expires_at', case
        when p_expires_at is null
          or not pg_catalog.isfinite(p_expires_at) then null
        else app_private.sync_checkpoint_json_timestamp(p_expires_at)
      end
    );
  end if;
  return app_private.sync_event_safe_bounded_row_v1(
    p_id, p_owner_user_id, p_store_id, p_domain, p_event_type, p_source,
    p_source_device_id, p_batch_id, p_client_event_id, p_changed_count,
    p_entity_ids, p_created_at, p_expires_at, p_metadata, p_shop_id,
    p_authorized_shop_id
  );
end;
$$;

revoke all on function app_private.sync_event_safe_row_v1(
  bigint, uuid, uuid, text, text, text, text, uuid, text, integer, jsonb,
  timestamptz, timestamptz, jsonb, uuid, uuid
) from public, anon, authenticated;
revoke all on function app_private.sync_event_safe_bounded_row_v1(
  bigint, uuid, uuid, text, text, text, text, uuid, text, integer, jsonb,
  timestamptz, timestamptz, jsonb, uuid, uuid
) from public, anon, authenticated;

drop function if exists public.shop_sync_event_page_v1(
  uuid, text, bigint, integer
);
drop function if exists public.shop_sync_event_page_v1(
  uuid, text, bigint, integer, text
);
drop function if exists public.shop_sync_event_page_v1(
  uuid, text, text, integer, text
);
drop function if exists public.shop_sync_event_page_v1(
  uuid, text, text, integer, text, text
);
create function public.shop_sync_event_page_v1(
  p_shop_id uuid,
  p_device_identifier text,
  p_after_id text default '0',
  p_limit integer default 150,
  p_expected_scope_key text default null,
  p_expected_event_max_id text default null
)
returns jsonb
language plpgsql
stable
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

  if p_limit is null or p_limit < 1 or p_limit > 150 then
    raise exception 'shop sync event page limit must be between 1 and 150'
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
  from app_private.resolve_shop_sync_recovery_scope(
    p_shop_id,
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

revoke all on function public.shop_sync_event_page_v1(
  uuid,
  text,
  text,
  integer,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.shop_sync_event_page_v1(
  uuid,
  text,
  text,
  integer,
  text,
  text
) to authenticated;

create or replace function public.admin_sync_event_read_v1(
  p_shop_id uuid default null,
  p_owner_user_id uuid default null,
  p_domains text[] default null,
  p_event_id text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := coalesce(auth.role(), '');
  v_is_platform_admin boolean := auth.uid() is not null
    and app_private.is_platform_admin();
  v_mapped_owner_id uuid;
  v_has_blocking_mapping boolean := false;
  v_scope_kind text;
  v_total_count bigint := 0;
  v_max_id bigint;
  v_max_created_at timestamptz;
  v_rows jsonb := '[]'::jsonb;
  v_event_marker text;
  v_page_record record;
  v_row_bytes bigint;
  v_payload_bytes bigint := 0;
  v_result jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 300 then
    raise exception 'invalid admin sync-event read request'
      using errcode = '22023';
  end if;
  if p_event_id is not null then
    if octet_length(p_event_id) > 19 then
      raise exception 'invalid admin sync-event read request'
        using errcode = '22023';
    end if;
    if p_event_id !~ '^[1-9][0-9]{0,18}$'
      or p_event_id::numeric > 9223372036854775807 then
      raise exception 'invalid admin sync-event read request'
        using errcode = '22023';
    end if;
  end if;
  if p_domains is not null then
    if cardinality(p_domains) < 1 or cardinality(p_domains) > 3 then
      raise exception 'invalid admin sync-event read request'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(p_domains) domain_name
      where domain_name is null or octet_length(domain_name) > 16
    ) then
      raise exception 'invalid admin sync-event read request'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(p_domains) domain_name
      where domain_name not in ('catalog', 'prices', 'history')
    ) or cardinality(p_domains) <> (
      select count(distinct domain_name)::integer from unnest(p_domains) domain_name
    ) then
      raise exception 'invalid admin sync-event read request'
        using errcode = '22023';
    end if;
  end if;

  if v_role = 'service_role' then
    if p_shop_id is null or p_owner_user_id is not null then
      raise exception 'service role sync-event reads require one explicit shop'
        using errcode = '42501';
    end if;
  elsif v_is_platform_admin then
    null;
  elsif auth.uid() is not null then
    if p_shop_id is null
      or p_owner_user_id is not null
      or not app_private.is_active_shop_catalog_writer(p_shop_id) then
      raise exception 'sync-event read is outside the authorized shop scope'
        using errcode = '42501';
    end if;
  else
    raise exception 'sync-event read requires authentication'
      using errcode = '28000';
  end if;

  if p_shop_id is not null then
    select source.owner_user_id
    into v_mapped_owner_id
    from public.shop_inventory_sources source
    where source.shop_id = p_shop_id
      and source.source_kind = 'mobile_owner'
      and source.mapping_state = 'mapped'
      and source.owner_user_id is not null
      and source.verified_at is not null
      and source.disabled_at is null
    order by source.created_at desc
    limit 1;

    select exists (
      select 1
      from public.shop_inventory_sources source
      where source.shop_id = p_shop_id
        and source.disabled_at is null
        and (
          source.source_kind <> 'mobile_owner'
          or source.mapping_state <> 'mapped'
          or source.owner_user_id is null
          or source.verified_at is null
        )
    ) into v_has_blocking_mapping;

    if v_has_blocking_mapping then
      raise exception 'admin_sync_event_scope_unresolved'
        using errcode = '55000';
    end if;

    v_scope_kind := case
      when v_mapped_owner_id is null then 'shop_scoped'
      else 'authorized_shop_plus_legacy'
    end;
  else
    v_scope_kind := 'platform_global';
  end if;

  select
    count(*), max(event.id), max(event.created_at)
  into v_total_count, v_max_id, v_max_created_at
  from public.sync_events event
  where (
    p_shop_id is null
    or event.shop_id = p_shop_id
    or (
      v_mapped_owner_id is not null
      and event.shop_id is null
      and event.owner_user_id = v_mapped_owner_id
    )
  )
    and (p_owner_user_id is null or event.owner_user_id = p_owner_user_id)
    and (p_domains is null or event.domain = any(p_domains))
    and (p_event_id is null or event.id = p_event_id::bigint);

  -- Never materialize every event payload merely to count an admin scope.
  -- Serialize at most the requested page and enforce the response budget
  -- incrementally before appending each row to the JSON array.
  for v_page_record in
    select app_private.sync_event_safe_row_v1(
      event.id, event.owner_user_id, event.store_id, event.domain,
      event.event_type, event.source, event.source_device_id,
      event.batch_id, event.client_event_id, event.changed_count,
      event.entity_ids, event.created_at, event.expires_at, event.metadata,
      event.shop_id, coalesce(p_shop_id, event.shop_id)
    ) || jsonb_build_object('id', event.id::text) as row_data
    from public.sync_events event
    where (
      p_shop_id is null
      or event.shop_id = p_shop_id
      or (
        v_mapped_owner_id is not null
        and event.shop_id is null
        and event.owner_user_id = v_mapped_owner_id
      )
    )
      and (p_owner_user_id is null or event.owner_user_id = p_owner_user_id)
      and (p_domains is null or event.domain = any(p_domains))
      and (p_event_id is null or event.id = p_event_id::bigint)
    order by event.created_at desc, event.id desc
    limit p_limit
  loop
    v_row_bytes := octet_length(v_page_record.row_data::text);
    if v_row_bytes > 65536
      or v_payload_bytes + v_row_bytes > 4190000 then
      raise exception 'admin_sync_event_response_too_large'
        using errcode = '54000';
    end if;
    v_payload_bytes := v_payload_bytes + v_row_bytes;
    v_rows := v_rows || jsonb_build_array(v_page_record.row_data);
  end loop;

  v_event_marker := app_private.sync_checkpoint_sha256(
    v_total_count::text || ':' || coalesce(v_max_id, 0)::text || ':' ||
    app_private.sync_checkpoint_timestamp(v_max_created_at)
  );

  v_result := jsonb_build_object(
    'schemaVersion', 'admin-sync-event-read-v1',
    'scope', jsonb_build_object(
      'kind', v_scope_kind,
      'shopId', p_shop_id,
      'mappedLegacyOwnerUserId', v_mapped_owner_id,
      'ownerUserId', case when v_is_platform_admin then p_owner_user_id else null end
    ),
    'totalCount', v_total_count,
    'maxId', case when v_max_id is null then null else v_max_id::text end,
    'eventMarker', v_event_marker,
    'payloadBytes', v_payload_bytes,
    'maxResponseBytes', 4194304,
    'rows', v_rows
  );
  if octet_length(v_result::text) > 4194304 then
    raise exception 'admin_sync_event_response_too_large'
      using errcode = '54000';
  end if;
  return v_result;
end;
$$;

revoke all on function public.admin_sync_event_read_v1(
  uuid,
  uuid,
  text[],
  text,
  integer
) from public, anon, authenticated;
grant execute on function public.admin_sync_event_read_v1(
  uuid,
  uuid,
  text[],
  text,
  integer
) to authenticated, service_role;

-- Keep the existing Win7POS v2 contract on the same authorized transition
-- scope as mobile recovery. A mixed shop + mapped-legacy catalog is a union,
-- never an implicit cutover or an exclusive first-row-wins view.
create or replace function app_private.resolve_pos_catalog_scope_v2(
  p_shop_id uuid
)
returns table (
  scope_kind text,
  scope_id uuid,
  blocked boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mapped_owner_id uuid;
  has_blocking_mapping boolean := false;
  has_shop_rows boolean := false;
  has_legacy_rows boolean := false;
begin
  select source.owner_user_id
    into mapped_owner_id
  from public.shop_inventory_sources source
  where source.shop_id = p_shop_id
    and source.mapping_state = 'mapped'
    and source.owner_user_id is not null
    and source.verified_at is not null
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
      )
  ) into has_blocking_mapping;

  select
    exists (select 1 from public.inventory_products row where row.shop_id = p_shop_id)
    or exists (select 1 from public.inventory_categories row where row.shop_id = p_shop_id)
    or exists (select 1 from public.inventory_suppliers row where row.shop_id = p_shop_id)
    or exists (select 1 from public.inventory_product_prices row where row.shop_id = p_shop_id)
  into has_shop_rows;

  if mapped_owner_id is not null then
    select
      exists (select 1 from public.inventory_products row where row.shop_id is null and row.owner_user_id = mapped_owner_id)
      or exists (select 1 from public.inventory_categories row where row.shop_id is null and row.owner_user_id = mapped_owner_id)
      or exists (select 1 from public.inventory_suppliers row where row.shop_id is null and row.owner_user_id = mapped_owner_id)
      or exists (select 1 from public.inventory_product_prices row where row.shop_id is null and row.owner_user_id = mapped_owner_id)
    into has_legacy_rows;
  end if;

  blocked := has_blocking_mapping
    or (mapped_owner_id is null and not has_shop_rows);

  scope_kind := case
    when has_shop_rows and has_legacy_rows then 'authorized_shop_plus_legacy'
    when has_shop_rows then 'shop_scoped'
    else 'legacy_owner_bridge'
  end;
  scope_id := case
    when scope_kind = 'shop_scoped' then p_shop_id
    else mapped_owner_id
  end;

  return next;
end;
$$;

create or replace function app_private.pos_catalog_scope_key_v2(
  p_shop_id uuid,
  p_scope_kind text,
  p_scope_id uuid
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select substring(
    encode(extensions.digest(
      lower(p_shop_id::text) || ':' ||
      coalesce(p_scope_kind, '-') || ':' ||
      coalesce(lower(p_scope_id::text), '-'),
      'sha256'
    ), 'hex')
    from 1 for 32
  );
$$;

revoke all on function app_private.resolve_pos_catalog_scope_v2(uuid)
  from public, anon, authenticated;
grant execute on function app_private.resolve_pos_catalog_scope_v2(uuid)
  to service_role;
revoke all on function app_private.pos_catalog_scope_key_v2(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function app_private.pos_catalog_scope_key_v2(uuid, text, uuid)
  to service_role;

create or replace function app_private.pos_catalog_integrity_violation_count_v2(
  p_shop_id uuid,
  p_scope_kind text,
  p_scope_id uuid
)
returns bigint
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_count bigint;
  v_row record;
  v_domain_bytes bigint := 0;
  v_total_bytes bigint := 0;
begin
  if p_scope_kind not in (
      'shop_scoped', 'legacy_owner_bridge', 'authorized_shop_plus_legacy'
    ) then
    return 1;
  end if;

  select count(*) into v_count from (
    select 1 from public.inventory_products row
    where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_scope_id)
    limit 125001
  ) bounded;
  if v_count > 125000 then return 1; end if;
  select count(*) into v_count from (
    select 1 from public.inventory_categories row
    where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_scope_id)
    limit 25001
  ) bounded;
  if v_count > 25000 then return 1; end if;
  select count(*) into v_count from (
    select 1 from public.inventory_suppliers row
    where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_scope_id)
    limit 25001
  ) bounded;
  if v_count > 25000 then return 1; end if;
  select count(*) into v_count from (
    select 1 from public.inventory_product_prices row
    where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_scope_id)
    limit 175001
  ) bounded;
  if v_count > 175000 then return 1; end if;

  -- Establish the cumulative payload envelope before any duplicate GROUP BY
  -- or relation scan can retain large legacy keys. Each row is validated
  -- before serialization, and the loop stops as soon as a domain/total budget
  -- is exceeded. This preflight is intentionally paid once by the manifest;
  -- revision-fenced page calls below do not repeat it.
  v_domain_bytes := 0;
  for v_row in
    select row.id,row.owner_user_id,row.name,row.updated_at,row.deleted_at,row.shop_id
    from public.inventory_suppliers row
    where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_scope_id)
  loop
    if not pg_catalog.isfinite(v_row.updated_at)
      or (v_row.deleted_at is not null
        and not pg_catalog.isfinite(v_row.deleted_at))
      or app_private.sync_supplier_recovery_row_fits_v1(
        v_row.id,v_row.owner_user_id,v_row.name,v_row.updated_at,
        v_row.deleted_at,v_row.shop_id
      ) is not true then
      return 1;
    end if;
    v_domain_bytes := v_domain_bytes + octet_length(
      app_private.sync_supplier_recovery_row_v1(
        v_row.id,v_row.owner_user_id,v_row.name,v_row.updated_at,
        v_row.deleted_at,v_row.shop_id
      )::text
    );
    if v_domain_bytes > 33554432 then return 1; end if;
  end loop;
  v_total_bytes := v_total_bytes + v_domain_bytes;

  v_domain_bytes := 0;
  for v_row in
    select row.id,row.owner_user_id,row.name,row.updated_at,row.deleted_at,row.shop_id
    from public.inventory_categories row
    where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_scope_id)
  loop
    if not pg_catalog.isfinite(v_row.updated_at)
      or (v_row.deleted_at is not null
        and not pg_catalog.isfinite(v_row.deleted_at))
      or app_private.sync_category_recovery_row_fits_v1(
        v_row.id,v_row.owner_user_id,v_row.name,v_row.updated_at,
        v_row.deleted_at,v_row.shop_id
      ) is not true then
      return 1;
    end if;
    v_domain_bytes := v_domain_bytes + octet_length(
      app_private.sync_category_recovery_row_v1(
        v_row.id,v_row.owner_user_id,v_row.name,v_row.updated_at,
        v_row.deleted_at,v_row.shop_id
      )::text
    );
    if v_domain_bytes > 33554432 then return 1; end if;
  end loop;
  v_total_bytes := v_total_bytes + v_domain_bytes;

  v_domain_bytes := 0;
  for v_row in
    select row.id,row.owner_user_id,row.barcode,row.item_number,row.product_name,
      row.second_product_name,row.purchase_price,row.retail_price,row.supplier_id,
      row.category_id,row.stock_quantity,row.updated_at,row.deleted_at,row.shop_id,
      row.primary_image_version_id,row.primary_image_updated_at
    from public.inventory_products row
    where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_scope_id)
  loop
    if not pg_catalog.isfinite(v_row.updated_at)
      or (v_row.deleted_at is not null
        and not pg_catalog.isfinite(v_row.deleted_at))
      or (v_row.primary_image_updated_at is not null
        and not pg_catalog.isfinite(v_row.primary_image_updated_at))
      or app_private.sync_product_recovery_row_fits_v1(
        v_row.id,v_row.owner_user_id,v_row.barcode,v_row.item_number,
        v_row.product_name,v_row.second_product_name,v_row.purchase_price,
        v_row.retail_price,v_row.supplier_id,v_row.category_id,
        v_row.stock_quantity,v_row.updated_at,v_row.deleted_at,v_row.shop_id,
        v_row.primary_image_version_id,v_row.primary_image_updated_at
      ) is not true
      or app_private.sync_product_number_is_materializable_v1(
        v_row.purchase_price
      ) is not true
      or app_private.sync_product_number_is_materializable_v1(
        v_row.retail_price
      ) is not true
      or app_private.sync_product_number_is_materializable_v1(
        v_row.stock_quantity
      ) is not true then
      return 1;
    end if;
    v_domain_bytes := v_domain_bytes + octet_length(
      app_private.sync_product_recovery_row_v1(
        v_row.id,v_row.owner_user_id,v_row.barcode,v_row.item_number,
        v_row.product_name,v_row.second_product_name,v_row.purchase_price,
        v_row.retail_price,v_row.supplier_id,v_row.category_id,
        v_row.stock_quantity,v_row.updated_at,v_row.deleted_at,v_row.shop_id,
        v_row.primary_image_version_id,v_row.primary_image_updated_at
      )::text
    );
    if v_domain_bytes > 268435456 then return 1; end if;
  end loop;
  v_total_bytes := v_total_bytes + v_domain_bytes;

  v_domain_bytes := 0;
  for v_row in
    select row.id,row.owner_user_id,row.product_id,row.type,row.price,
      row.effective_at,row.source,row.note,row.created_at,row.shop_id,row.updated_at
    from public.inventory_product_prices row
    where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_scope_id)
  loop
    if not pg_catalog.isfinite(v_row.updated_at)
      or app_private.sync_price_recovery_row_fits_v1(
        v_row.id,v_row.owner_user_id,v_row.product_id,v_row.type,v_row.price,
        v_row.effective_at,v_row.source,v_row.note,v_row.created_at,
        v_row.shop_id,v_row.updated_at
      ) is not true
      or app_private.sync_price_value_is_canonical_v1(v_row.price) is not true
      or app_private.sync_legacy_timestamp_is_canonical_v1(
        v_row.effective_at
      ) is not true
      or app_private.sync_legacy_timestamp_is_canonical_v1(
        v_row.created_at
      ) is not true then
      return 1;
    end if;
    v_domain_bytes := v_domain_bytes + octet_length(
      app_private.sync_price_recovery_row_v1(
        v_row.id,v_row.owner_user_id,v_row.product_id,v_row.type,v_row.price,
        v_row.effective_at,v_row.source,v_row.note,v_row.created_at,
        v_row.shop_id,v_row.updated_at
      )::text
    );
    if v_domain_bytes > 268435456 then return 1; end if;
  end loop;
  v_total_bytes := v_total_bytes + v_domain_bytes;
  if v_total_bytes > 536870912 then return 1; end if;

  if exists (
    select 1 from public.inventory_products row
    where ((p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_scope_id))
      and row.deleted_at is null
    group by row.barcode having count(*) > 1 limit 1
  ) then return 1; end if;
  if exists (
    select 1 from public.inventory_suppliers row
    where ((p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_scope_id))
      and row.deleted_at is null
    group by lower(row.name) having count(*) > 1 limit 1
  ) then return 1; end if;
  if exists (
    select 1 from public.inventory_categories row
    where ((p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_scope_id))
      and row.deleted_at is null
    group by lower(row.name) having count(*) > 1 limit 1
  ) then return 1; end if;

  if exists (
    select 1 from public.inventory_products product
    where ((p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and product.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and product.shop_id is null and product.owner_user_id=p_scope_id))
      and product.deleted_at is null
      and ((product.category_id is not null and not exists (
        select 1 from public.inventory_categories category
        where category.id=product.category_id and category.deleted_at is null
          and ((p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
              and category.shop_id=p_shop_id)
            or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
              and category.shop_id is null and category.owner_user_id=p_scope_id))
      )) or (product.supplier_id is not null and not exists (
        select 1 from public.inventory_suppliers supplier
        where supplier.id=product.supplier_id and supplier.deleted_at is null
          and ((p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
              and supplier.shop_id=p_shop_id)
            or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
              and supplier.shop_id is null and supplier.owner_user_id=p_scope_id))
      )))
    limit 1
  ) then return 1; end if;
  if exists (
    select 1 from public.inventory_product_prices price
    where ((p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and price.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and price.shop_id is null and price.owner_user_id=p_scope_id))
      and not exists (
        select 1 from public.inventory_products product
        where product.id=price.product_id and product.deleted_at is null
          and ((p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
              and product.shop_id=p_shop_id)
            or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
              and product.shop_id is null and product.owner_user_id=p_scope_id))
      )
    limit 1
  ) then return 1; end if;
  return 0;
exception when others then
  return 1;
end;
$$;

revoke all on function app_private.pos_catalog_integrity_violation_count_v2(
  uuid,
  text,
  uuid
) from public, anon, authenticated;
grant execute on function app_private.pos_catalog_integrity_violation_count_v2(
  uuid,
  text,
  uuid
) to service_role;

create or replace function public.pos_catalog_revision_v2(
  p_shop_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved record;
  current_revision bigint;
  current_scope_key text;
begin
  if p_shop_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into resolved
  from app_private.resolve_pos_catalog_scope_v2(p_shop_id);

  if resolved.blocked then
    return jsonb_build_object('status', 'unmapped');
  end if;

  if app_private.pos_catalog_integrity_violation_count_v2(
    p_shop_id,
    resolved.scope_kind,
    resolved.scope_id
  ) > 0 then
    return jsonb_build_object('status', 'integrity_blocked');
  end if;

  select revision into current_revision
  from app_private.pos_catalog_revisions
  where shop_id = p_shop_id;

  current_scope_key := app_private.pos_catalog_scope_key_v2(
    p_shop_id,
    resolved.scope_kind,
    resolved.scope_id
  );

  return jsonb_build_object(
    'status', 'ok',
    'scopeKind', resolved.scope_kind,
    'scopeKey', current_scope_key,
    'revision', coalesce(current_revision, 0)::text
  );
end;
$$;

revoke all on function public.pos_catalog_revision_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.pos_catalog_revision_v2(uuid)
  to service_role;

create or replace function public.pos_catalog_pull_page_v2(
  p_shop_id uuid,
  p_mode text,
  p_lower_bound timestamptz,
  p_snapshot_at timestamptz,
  p_entity text,
  p_after_updated_at timestamptz,
  p_after_id uuid,
  p_limit integer,
  p_expected_revision text,
  p_expected_scope_kind text,
  p_expected_scope_key text,
  p_include_manifest boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved record;
  current_revision bigint;
  current_scope_key text;
  snapshot_at timestamptz := coalesce(p_snapshot_at, statement_timestamp());
  effective_entity text := p_entity;
  candidates jsonb := '[]'::jsonb;
  page_rows jsonb := '[]'::jsonb;
  entity_has_more boolean := false;
  manifest jsonb := null;
  summary_products bigint := 0;
  summary_categories bigint := 0;
  summary_suppliers bigint := 0;
  summary_prices bigint := 0;
  window_products bigint := 0;
  window_categories bigint := 0;
  window_suppliers bigint := 0;
  window_prices bigint := 0;
  effective_limit integer;
  v_result jsonb;
begin
  if p_shop_id is null
    or p_mode not in ('full_refresh', 'delta')
    or p_include_manifest is null
    or p_limit is null
    or p_limit < 1
    or p_limit > 1000
    or snapshot_at > statement_timestamp() + interval '1 minute'
    or (p_mode = 'delta' and p_lower_bound is null)
    or (p_mode = 'full_refresh' and p_lower_bound is not null)
    or (p_lower_bound is not null and p_lower_bound > snapshot_at)
    or ((p_after_updated_at is null) <> (p_after_id is null))
    or (p_entity is not null and p_entity not in ('categories', 'suppliers', 'products', 'prices'))
    or (
      p_include_manifest
      and (
        p_snapshot_at is not null
        or p_entity is not null
        or p_after_updated_at is not null
        or p_expected_revision is not null
        or p_expected_scope_kind is not null
        or p_expected_scope_key is not null
      )
    )
    or (
      p_include_manifest = false
      and (
        p_snapshot_at is null
        or p_entity is null
        or p_expected_revision is null
        or p_expected_scope_kind is null
        or p_expected_scope_key is null
      )
    )
  then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into resolved
  from app_private.resolve_pos_catalog_scope_v2(p_shop_id);

  if resolved.blocked then
    return jsonb_build_object('status', 'unmapped');
  end if;

  -- The manifest is the integrity preflight for this revision-fenced
  -- snapshot. Every catalog/mapping mutation bumps the revision, so page
  -- calls can rely on the exact expected revision instead of rescanning the
  -- complete scope on every page (which would be O(rows * pages)).
  if p_include_manifest and app_private.pos_catalog_integrity_violation_count_v2(
    p_shop_id,
    resolved.scope_kind,
    resolved.scope_id
  ) > 0 then
    return jsonb_build_object('status', 'integrity_blocked');
  end if;

  select revision into current_revision
  from app_private.pos_catalog_revisions
  where shop_id = p_shop_id;
  current_revision := coalesce(current_revision, 0);
  current_scope_key := app_private.pos_catalog_scope_key_v2(
    p_shop_id,
    resolved.scope_kind,
    resolved.scope_id
  );

  if p_expected_revision is not null and
     (p_expected_revision !~ '^[0-9]{1,19}$'
      or p_expected_revision <> current_revision::text)
  then
    return jsonb_build_object('status', 'snapshot_changed');
  end if;

  if p_expected_scope_kind is not null and
     (p_expected_scope_kind <> resolved.scope_kind
      or p_expected_scope_key !~ '^[0-9a-f]{32}$'
      or p_expected_scope_key <> current_scope_key)
  then
    return jsonb_build_object('status', 'snapshot_changed');
  end if;

  if p_include_manifest then
    select count(*) into summary_products
    from public.inventory_products row
    where (
      (resolved.scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy') and row.shop_id = p_shop_id)
      or
      (resolved.scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
       and row.shop_id is null
       and row.owner_user_id = resolved.scope_id)
    )
      and row.deleted_at is null
      and row.updated_at <= snapshot_at;

    select count(*) into summary_categories
    from public.inventory_categories row
    where (
      (resolved.scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy') and row.shop_id = p_shop_id)
      or
      (resolved.scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
       and row.shop_id is null
       and row.owner_user_id = resolved.scope_id)
    )
      and row.deleted_at is null
      and row.updated_at <= snapshot_at;

    select count(*) into summary_suppliers
    from public.inventory_suppliers row
    where (
      (resolved.scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy') and row.shop_id = p_shop_id)
      or
      (resolved.scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
       and row.shop_id is null
       and row.owner_user_id = resolved.scope_id)
    )
      and row.deleted_at is null
      and row.updated_at <= snapshot_at;

    select count(*) into summary_prices
    from public.inventory_product_prices row
    where (
      (resolved.scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy') and row.shop_id = p_shop_id)
      or
      (resolved.scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
       and row.shop_id is null
       and row.owner_user_id = resolved.scope_id)
    )
      and row.updated_at <= snapshot_at
      and exists (
        select 1
        from public.inventory_products product
        where product.id = row.product_id
          and product.deleted_at is null
          and (
            (resolved.scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy') and product.shop_id = p_shop_id)
            or
            (resolved.scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
             and product.shop_id is null
             and product.owner_user_id = resolved.scope_id)
          )
      );

    select count(*) into window_categories
    from public.inventory_categories row
    where (
      (resolved.scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy') and row.shop_id = p_shop_id)
      or
      (resolved.scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
       and row.shop_id is null
       and row.owner_user_id = resolved.scope_id)
    )
      and row.updated_at <= snapshot_at
      and (p_mode = 'delta' or row.deleted_at is null)
      and (p_lower_bound is null or row.updated_at >= p_lower_bound);

    select count(*) into window_suppliers
    from public.inventory_suppliers row
    where (
      (resolved.scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy') and row.shop_id = p_shop_id)
      or
      (resolved.scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
       and row.shop_id is null
       and row.owner_user_id = resolved.scope_id)
    )
      and row.updated_at <= snapshot_at
      and (p_mode = 'delta' or row.deleted_at is null)
      and (p_lower_bound is null or row.updated_at >= p_lower_bound);

    select count(*) into window_products
    from public.inventory_products row
    where (
      (resolved.scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy') and row.shop_id = p_shop_id)
      or
      (resolved.scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
       and row.shop_id is null
       and row.owner_user_id = resolved.scope_id)
    )
      and row.updated_at <= snapshot_at
      and (p_mode = 'delta' or row.deleted_at is null)
      and (p_lower_bound is null or row.updated_at >= p_lower_bound);

    select count(*) into window_prices
    from public.inventory_product_prices row
    where (
      (resolved.scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy') and row.shop_id = p_shop_id)
      or
      (resolved.scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
       and row.shop_id is null
       and row.owner_user_id = resolved.scope_id)
    )
      and row.updated_at <= snapshot_at
      and (p_lower_bound is null or row.updated_at >= p_lower_bound)
      and exists (
        select 1
        from public.inventory_products product
        where product.id = row.product_id
          and product.deleted_at is null
          and (
            (resolved.scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy') and product.shop_id = p_shop_id)
            or
            (resolved.scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
             and product.shop_id is null
             and product.owner_user_id = resolved.scope_id)
          )
      );

    manifest := jsonb_build_object(
      'catalogSummary', jsonb_build_object(
        'products', summary_products,
        'activeProducts', summary_products,
        'categories', summary_categories,
        'suppliers', summary_suppliers,
        'prices', summary_prices
      ),
      'windowCounts', jsonb_build_object(
        'categories', window_categories,
        'suppliers', window_suppliers,
        'products', window_products,
        'prices', window_prices
      )
    );

    if effective_entity is null then
      effective_entity := case
        when window_categories > 0 then 'categories'
        when window_suppliers > 0 then 'suppliers'
        when window_products > 0 then 'products'
        when window_prices > 0 then 'prices'
        else 'done'
      end;
    end if;
  end if;

  if effective_entity is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  effective_limit := least(p_limit, case effective_entity
    when 'categories' then 240
    when 'suppliers' then 240
    when 'products' then 60
    when 'prices' then 120
    else 1
  end);

  if effective_entity = 'categories' then
    select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.updated_at, candidate.id), '[]'::jsonb)
      into candidates
    from (
      select row.id, row.shop_id, row.owner_user_id, row.name, row.updated_at, row.deleted_at
      from public.inventory_categories row
      where (
        (resolved.scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy') and row.shop_id = p_shop_id)
        or
        (resolved.scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
         and row.shop_id is null
         and row.owner_user_id = resolved.scope_id)
      )
        and row.updated_at <= snapshot_at
        and (p_mode = 'delta' or row.deleted_at is null)
        and (p_lower_bound is null or row.updated_at >= p_lower_bound)
        and (p_after_updated_at is null or (row.updated_at, row.id) > (p_after_updated_at, p_after_id))
      order by row.updated_at, row.id
      limit effective_limit + 1
    ) candidate;
  elsif effective_entity = 'suppliers' then
    select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.updated_at, candidate.id), '[]'::jsonb)
      into candidates
    from (
      select row.id, row.shop_id, row.owner_user_id, row.name, row.updated_at, row.deleted_at
      from public.inventory_suppliers row
      where (
        (resolved.scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy') and row.shop_id = p_shop_id)
        or
        (resolved.scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
         and row.shop_id is null
         and row.owner_user_id = resolved.scope_id)
      )
        and row.updated_at <= snapshot_at
        and (p_mode = 'delta' or row.deleted_at is null)
        and (p_lower_bound is null or row.updated_at >= p_lower_bound)
        and (p_after_updated_at is null or (row.updated_at, row.id) > (p_after_updated_at, p_after_id))
      order by row.updated_at, row.id
      limit effective_limit + 1
    ) candidate;
  elsif effective_entity = 'products' then
    select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.updated_at, candidate.id), '[]'::jsonb)
      into candidates
    from (
      select
        row.id, row.shop_id, row.owner_user_id, row.barcode, row.item_number,
        row.product_name, row.second_product_name, row.purchase_price,
        row.retail_price, row.stock_quantity, row.supplier_id, row.category_id,
        row.updated_at, row.deleted_at
      from public.inventory_products row
      where (
        (resolved.scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy') and row.shop_id = p_shop_id)
        or
        (resolved.scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
         and row.shop_id is null
         and row.owner_user_id = resolved.scope_id)
      )
        and row.updated_at <= snapshot_at
        and (p_mode = 'delta' or row.deleted_at is null)
        and (p_lower_bound is null or row.updated_at >= p_lower_bound)
        and (p_after_updated_at is null or (row.updated_at, row.id) > (p_after_updated_at, p_after_id))
      order by row.updated_at, row.id
      limit effective_limit + 1
    ) candidate;
  elsif effective_entity = 'prices' then
    select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.updated_at, candidate.id), '[]'::jsonb)
      into candidates
    from (
      select
        row.id, row.shop_id, row.owner_user_id, row.product_id, row.type,
        row.price, row.effective_at, row.source, row.created_at, row.updated_at
      from public.inventory_product_prices row
      where (
        (resolved.scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy') and row.shop_id = p_shop_id)
        or
        (resolved.scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
         and row.shop_id is null
         and row.owner_user_id = resolved.scope_id)
      )
        and row.updated_at <= snapshot_at
        and (p_lower_bound is null or row.updated_at >= p_lower_bound)
        and (p_after_updated_at is null or (row.updated_at, row.id) > (p_after_updated_at, p_after_id))
        and exists (
          select 1
          from public.inventory_products product
          where product.id = row.product_id
            and product.deleted_at is null
            and (
              (resolved.scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy') and product.shop_id = p_shop_id)
              or
              (resolved.scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
               and product.shop_id is null
               and product.owner_user_id = resolved.scope_id)
            )
        )
      order by row.updated_at, row.id
      limit effective_limit + 1
    ) candidate;
  end if;

  entity_has_more := jsonb_array_length(candidates) > effective_limit;
  page_rows := case
    when entity_has_more then candidates - effective_limit
    else candidates
  end;
  if octet_length(page_rows::text) > 4000000 then
    return jsonb_build_object(
      'status', 'resource_exceeded', 'entity', effective_entity
    );
  end if;

  v_result := jsonb_build_object(
    'status', 'ok',
    'scopeKind', resolved.scope_kind,
    'scopeOwnerId', case
      when resolved.scope_kind = 'shop_scoped' then null
      else resolved.scope_id
    end,
    'scopeKey', current_scope_key,
    'revision', current_revision::text,
    'snapshotAt', snapshot_at,
    'entity', effective_entity,
    'pageLimit', effective_limit,
    'entityHasMore', entity_has_more,
    'rows', page_rows,
    'manifest', manifest
  );
  if octet_length(v_result::text) > 4194304 then
    return jsonb_build_object(
      'status', 'resource_exceeded', 'entity', effective_entity
    );
  end if;
  return v_result;
end;
$$;

revoke all on function public.pos_catalog_pull_page_v2(
  uuid, text, timestamptz, timestamptz, text, timestamptz, uuid,
  integer, text, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.pos_catalog_pull_page_v2(
  uuid, text, timestamptz, timestamptz, text, timestamptz, uuid,
  integer, text, text, text, boolean
) to service_role;

create or replace function public.pos_runtime_lease_v1(
  p_pos_session_id uuid,
  p_shop_device_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_result jsonb;
begin
  select session_row.* into v_session
  from public.pos_sessions session_row
  where session_row.pos_session_id = p_pos_session_id
    and session_row.shop_device_id = p_shop_device_id;

  if not found or not app_private.pos_runtime_lease_is_valid_v1(
    v_session.shop_id,
    v_session.shop_device_id,
    v_session.staff_id,
    v_session.pos_session_id
  ) then
    return jsonb_build_object('status', 'denied');
  end if;

  select jsonb_build_object(
    'status', 'ok',
    'session', jsonb_build_object(
      'pos_session_id', session_row.pos_session_id,
      'shop_id', session_row.shop_id,
      'shop_device_id', session_row.shop_device_id,
      'staff_id', session_row.staff_id,
      'pos_device_credential_id', session_row.pos_device_credential_id,
      'session_token_hash', session_row.session_token_hash,
      'staff_credential_version', session_row.staff_credential_version,
      'status', session_row.status,
      'issued_at', session_row.issued_at,
      'expires_at', session_row.expires_at,
      'revoked_at', session_row.revoked_at,
      'heartbeat_count', session_row.heartbeat_count
    ),
    'credential', jsonb_build_object(
      'pos_device_credential_id', credential.pos_device_credential_id,
      'shop_id', credential.shop_id,
      'shop_device_id', credential.shop_device_id,
      'staff_id', credential.staff_id,
      'token_hash', credential.token_hash,
      'staff_credential_version', credential.staff_credential_version,
      'status', credential.status,
      'expires_at', credential.expires_at,
      'revoked_at', credential.revoked_at
    ),
    'staff', jsonb_build_object(
      'staff_id', staff.staff_id,
      'shop_id', staff.shop_id,
      'staff_code', staff.staff_code,
      'display_name', staff.display_name,
      'role_key', staff.role_key,
      'status', staff.status,
      'credential_version', staff.credential_version,
      'credential_status', staff.credential_status,
      'credential_expires_at', staff.credential_expires_at,
      'locked_until', staff.locked_until,
      'must_change_credential', staff.must_change_credential,
      'session_invalidated_at', staff.session_invalidated_at
    ),
    'device', jsonb_build_object(
      'shop_device_id', device.shop_device_id,
      'shop_id', device.shop_id,
      'device_identifier', device.device_identifier,
      'status', device.status,
      'revoked_at', device.revoked_at
    ),
    'shop', jsonb_build_object(
      'shop_id', shop.shop_id,
      'shop_code', shop.shop_code,
      'shop_name', shop.shop_name,
      'shop_status', shop.shop_status,
      'company_rut', shop.company_rut,
      'business_giro', shop.business_giro,
      'business_address', shop.business_address,
      'business_city', shop.business_city,
      'legal_representative_rut', shop.legal_representative_rut,
      'fiscal_identity_locked_by_platform', shop.fiscal_identity_locked_by_platform,
      'updated_at', shop.updated_at
    )
  )
  into v_result
  from public.pos_sessions session_row
  join public.pos_device_credentials credential
    on credential.pos_device_credential_id = session_row.pos_device_credential_id
  join public.staff_accounts staff
    on staff.staff_id = session_row.staff_id
  join public.shop_devices device
    on device.shop_device_id = session_row.shop_device_id
  join public.shops shop
    on shop.shop_id = session_row.shop_id
  where session_row.pos_session_id = p_pos_session_id
    and session_row.shop_device_id = p_shop_device_id;

  return coalesce(v_result, jsonb_build_object('status', 'denied'));
end;
$$;

revoke all on function public.pos_runtime_lease_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.pos_runtime_lease_v1(uuid, uuid)
  to service_role;

create or replace function public.pos_runtime_first_login_lookup_v1(
  p_shop_code text,
  p_staff_code text,
  p_device_identifier text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'status', 'ok',
    'shop', jsonb_build_object(
      'shop_id', shop.shop_id,
      'shop_code', shop.shop_code,
      'shop_name', shop.shop_name,
      'shop_status', shop.shop_status,
      'company_rut', shop.company_rut,
      'business_giro', shop.business_giro,
      'business_address', shop.business_address,
      'business_city', shop.business_city,
      'legal_representative_rut', shop.legal_representative_rut,
      'fiscal_identity_locked_by_platform', shop.fiscal_identity_locked_by_platform,
      'updated_at', shop.updated_at
    ),
    'staff', case when staff.staff_id is null then null else jsonb_build_object(
      'staff_id', staff.staff_id,
      'shop_id', staff.shop_id,
      'staff_code', staff.staff_code,
      'display_name', staff.display_name,
      'role_key', staff.role_key,
      'status', staff.status,
      'credential_hash', staff.credential_hash,
      'credential_version', staff.credential_version,
      'credential_status', staff.credential_status,
      'credential_expires_at', staff.credential_expires_at,
      'failed_attempts', staff.failed_attempts,
      'locked_until', staff.locked_until,
      'must_change_credential', staff.must_change_credential,
      'session_invalidated_at', staff.session_invalidated_at
    ) end,
    'device', case when device.shop_device_id is null then null else jsonb_build_object(
      'shop_device_id', device.shop_device_id,
      'shop_id', device.shop_id,
      'device_identifier', device.device_identifier,
      'status', device.status,
      'revoked_at', device.revoked_at
    ) end
  )
  into v_result
  from public.shops shop
  left join public.staff_accounts staff
    on staff.shop_id = shop.shop_id
   and staff.staff_code = p_staff_code
  left join public.shop_devices device
    on device.shop_id = shop.shop_id
   and device.device_identifier = p_device_identifier
  where shop.shop_code = p_shop_code;

  return coalesce(v_result, jsonb_build_object('status', 'denied'));
end;
$$;

revoke all on function public.pos_runtime_first_login_lookup_v1(text, text, text)
  from public, anon, authenticated;
grant execute on function public.pos_runtime_first_login_lookup_v1(text, text, text)
  to service_role;

create or replace function public.pos_runtime_first_login_failure_v1(
  p_shop_id uuid,
  p_staff_id uuid,
  p_expected_credential_version integer,
  p_lockout_attempts integer,
  p_lockout_seconds integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_failed_attempts integer;
  v_locked_until timestamptz;
begin
  if p_lockout_attempts not between 1 and 20
    or p_lockout_seconds not between 1 and 86400 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  update public.staff_accounts staff
  set failed_attempts = least(
        case
          when staff.locked_until is not null and staff.locked_until <= now() then 0
          else staff.failed_attempts
        end + 1,
        p_lockout_attempts
      ),
      credential_status = case
        when (case
          when staff.locked_until is not null and staff.locked_until <= now() then 0
          else staff.failed_attempts
        end + 1) >= p_lockout_attempts then 'locked'
        else 'active'
      end,
      locked_until = case
        when (case
          when staff.locked_until is not null and staff.locked_until <= now() then 0
          else staff.failed_attempts
        end + 1) >= p_lockout_attempts
          then now() + make_interval(secs => p_lockout_seconds)
        else null
      end,
      updated_at = now()
  where staff.staff_id = p_staff_id
    and staff.shop_id = p_shop_id
    and staff.credential_version = p_expected_credential_version
  returning staff.failed_attempts, staff.locked_until
  into v_failed_attempts, v_locked_until;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'stale_identity');
  end if;

  return jsonb_build_object(
    'ok', true,
    'failedAttempts', v_failed_attempts,
    'lockedUntil', v_locked_until
  );
end;
$$;

revoke all on function public.pos_runtime_first_login_failure_v1(
  uuid, uuid, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.pos_runtime_first_login_failure_v1(
  uuid, uuid, integer, integer, integer
) to service_role;

create or replace function public.pos_runtime_first_login_commit_v1(
  p_shop_id uuid,
  p_staff_id uuid,
  p_expected_credential_version integer,
  p_device_identifier text,
  p_device_display_name text,
  p_app_version text,
  p_device_token_hash text,
  p_device_expires_at timestamptz,
  p_session_token_hash text,
  p_session_expires_at timestamptz,
  p_metadata_redacted jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_device public.shop_devices%rowtype;
  v_staff public.staff_accounts%rowtype;
  v_credential_id uuid;
  v_session_id uuid;
begin
  if coalesce(length(p_device_identifier), 0) not between 1 and 160
    or coalesce(length(btrim(p_device_display_name)), 0) not between 1 and 80
    or p_device_token_hash !~ '^sha256:[0-9a-f]{64}$'
    or p_session_token_hash !~ '^sha256:[0-9a-f]{64}$'
    or p_device_expires_at <= now()
    or p_session_expires_at <= now()
    or jsonb_typeof(coalesce(p_metadata_redacted, '{}'::jsonb)) <> 'object'
    or pg_column_size(coalesce(p_metadata_redacted, '{}'::jsonb)) > 4096 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_shop_id::text || ':' || p_device_identifier, 0)
  );

  perform 1
  from public.shops shop
  where shop.shop_id = p_shop_id
    and shop.shop_status = 'active'
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'stale_identity');
  end if;

  select staff.* into v_staff
  from public.staff_accounts staff
  where staff.staff_id = p_staff_id
    and staff.shop_id = p_shop_id
    and staff.credential_version = p_expected_credential_version
    and staff.status = 'active'
    and staff.credential_status in ('active', 'locked')
    and (staff.locked_until is null or staff.locked_until <= now())
    and staff.must_change_credential = false
    and staff.credential_hash is not null
    and (staff.credential_expires_at is null or staff.credential_expires_at > now())
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'stale_identity');
  end if;

  select device.* into v_device
  from public.shop_devices device
  where device.shop_id = p_shop_id
    and device.device_identifier = p_device_identifier
  for update;

  if found and v_device.status in ('revoked', 'suspicious') then
    return jsonb_build_object('ok', false, 'code', 'device_denied');
  end if;

  if v_device.shop_device_id is null then
    insert into public.shop_devices (
      shop_id, device_identifier, device_type, display_name, app_version,
      status, last_seen_at, last_seen_principal_kind,
      last_seen_profile_id, last_seen_staff_id, metadata_redacted
    ) values (
      p_shop_id, p_device_identifier, 'pos', btrim(p_device_display_name),
      nullif(left(btrim(p_app_version), 80), ''), 'active', now(), 'pos_staff',
      null, p_staff_id, coalesce(p_metadata_redacted, '{}'::jsonb)
    )
    returning * into v_device;
  else
    update public.shop_devices device
    set app_version = nullif(left(btrim(p_app_version), 80), ''),
        display_name = btrim(p_device_display_name),
        device_type = 'pos',
        status = 'active',
        last_seen_at = now(),
        last_seen_principal_kind = 'pos_staff',
        last_seen_profile_id = null,
        last_seen_staff_id = p_staff_id,
        updated_at = now()
    where device.shop_device_id = v_device.shop_device_id
    returning * into v_device;
  end if;

  update public.staff_accounts
  set credential_status = 'active', failed_attempts = 0,
      locked_until = null, last_login_at = now(), updated_at = now()
  where staff_id = p_staff_id and shop_id = p_shop_id;

  update public.pos_device_credentials
  set status = 'revoked', revoked_at = now(),
      revoked_reason = 'rotated_by_first_login', updated_at = now()
  where shop_device_id = v_device.shop_device_id
    and status = 'active' and revoked_at is null;

  insert into public.pos_device_credentials (
    shop_id, shop_device_id, staff_id, token_hash,
    staff_credential_version, status, expires_at, last_used_at,
    metadata_redacted
  ) values (
    p_shop_id, v_device.shop_device_id, p_staff_id, p_device_token_hash,
    p_expected_credential_version, 'active', p_device_expires_at, now(),
    coalesce(p_metadata_redacted, '{}'::jsonb)
  ) returning pos_device_credential_id into v_credential_id;

  insert into public.pos_sessions (
    shop_id, shop_device_id, staff_id, pos_device_credential_id,
    session_token_hash, staff_credential_version, status, expires_at,
    last_seen_at, metadata_redacted
  ) values (
    p_shop_id, v_device.shop_device_id, p_staff_id, v_credential_id,
    p_session_token_hash, p_expected_credential_version, 'active',
    p_session_expires_at, now(), coalesce(p_metadata_redacted, '{}'::jsonb)
  ) returning pos_session_id into v_session_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'shopId', p_shop_id,
    'staffId', p_staff_id,
    'deviceIdentifier', p_device_identifier,
    'credentialVersion', p_expected_credential_version,
    'shopDeviceId', v_device.shop_device_id,
    'posDeviceCredentialId', v_credential_id,
    'posSessionId', v_session_id,
    'sessionExpiresAt', p_session_expires_at
  );
end;
$$;

revoke all on function public.pos_runtime_first_login_commit_v1(
  uuid, uuid, integer, text, text, text, text, timestamptz,
  text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.pos_runtime_first_login_commit_v1(
  uuid, uuid, integer, text, text, text, text, timestamptz,
  text, timestamptz, jsonb
) to service_role;

create or replace function public.pos_runtime_mark_session_v1(
  p_pos_session_id uuid,
  p_status text,
  p_reason text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('revoked', 'expired', 'blocked')
    or coalesce(length(p_reason), 0) not between 1 and 120 then
    return false;
  end if;

  update public.pos_sessions
  set status = p_status,
      revoked_at = case when p_status = 'revoked' then now() else revoked_at end,
      revoked_reason = left(p_reason, 120),
      updated_at = now()
  where pos_session_id = p_pos_session_id
    and status = 'active';

  return found;
end;
$$;

revoke all on function public.pos_runtime_mark_session_v1(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.pos_runtime_mark_session_v1(uuid, text, text)
  to service_role;

create or replace function public.pos_runtime_heartbeat_touch_v1(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_expires_at timestamptz,
  p_app_version text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_heartbeat_count integer;
begin
  -- Heartbeats for one session are serialized before acquiring row locks;
  -- this avoids share-to-update lock upgrade deadlocks under reconnect bursts.
  perform pg_advisory_xact_lock(
    hashtextextended('pos-heartbeat:' || p_pos_session_id::text, 0)
  );

  if p_expires_at <= now()
    or not app_private.pos_runtime_lease_is_valid_v1(
      p_shop_id, p_shop_device_id, p_staff_id, p_pos_session_id
    )
    or exists (
      select 1
      from public.pos_sessions session_row
      join public.pos_device_credentials credential
        on credential.pos_device_credential_id = session_row.pos_device_credential_id
      join public.staff_accounts staff
        on staff.staff_id = session_row.staff_id
       and staff.shop_id = session_row.shop_id
      where session_row.pos_session_id = p_pos_session_id
        and (
          p_expires_at > credential.expires_at
          or (
            staff.credential_expires_at is not null
            and p_expires_at > staff.credential_expires_at
          )
        )
    ) then
    return jsonb_build_object('ok', false, 'code', 'denied');
  end if;

  update public.pos_sessions
  set expires_at = p_expires_at,
      heartbeat_count = heartbeat_count + 1,
      last_seen_at = now(),
      updated_at = now()
  where pos_session_id = p_pos_session_id
  returning heartbeat_count into v_heartbeat_count;

  update public.pos_device_credentials credential
  set last_used_at = now(), updated_at = now()
  from public.pos_sessions session_row
  where session_row.pos_session_id = p_pos_session_id
    and credential.pos_device_credential_id = session_row.pos_device_credential_id;

  update public.shop_devices
  set app_version = nullif(left(btrim(p_app_version), 80), ''),
      last_seen_at = now(),
      last_seen_principal_kind = 'pos_staff',
      last_seen_profile_id = null,
      last_seen_staff_id = p_staff_id,
      updated_at = now()
  where shop_device_id = p_shop_device_id and shop_id = p_shop_id;

  return jsonb_build_object(
    'ok', true,
    'expiresAt', p_expires_at,
    'heartbeatCount', v_heartbeat_count
  );
end;
$$;

revoke all on function public.pos_runtime_heartbeat_touch_v1(
  uuid, uuid, uuid, uuid, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.pos_runtime_heartbeat_touch_v1(
  uuid, uuid, uuid, uuid, timestamptz, text
) to service_role;

create or replace function public.pos_runtime_audit_write_v1(
  p_event_key text,
  p_code text,
  p_result text,
  p_severity text,
  p_shop_id uuid default null,
  p_staff_id uuid default null,
  p_target_type text default null,
  p_target_id text default null,
  p_metadata_redacted jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_audit_id uuid;
  v_metadata jsonb := coalesce(p_metadata_redacted, '{}'::jsonb)
    || jsonb_build_object('code', left(coalesce(p_code, ''), 80));
begin
  if coalesce(length(p_event_key), 0) not between 1 and 160
    or p_result not in ('success', 'blocked', 'failure', 'simulated')
    or p_severity not in ('info', 'warning', 'critical')
    or jsonb_typeof(v_metadata) <> 'object'
    or pg_column_size(v_metadata) > 8192 then
    raise exception 'invalid POS audit envelope' using errcode = '22023';
  end if;

  insert into public.audit_logs (
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    null, p_staff_id, case when p_shop_id is null then 'global' else 'shop' end,
    p_shop_id, p_event_key, p_severity, p_result,
    nullif(left(btrim(p_target_type), 80), ''),
    nullif(left(btrim(p_target_id), 200), ''), v_metadata
  ) returning audit_log_id into v_audit_id;

  return v_audit_id;
end;
$$;

revoke all on function public.pos_runtime_audit_write_v1(
  text, text, text, text, uuid, uuid, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.pos_runtime_audit_write_v1(
  text, text, text, text, uuid, uuid, text, text, jsonb
) to service_role;

-- Lease-bound catalog reads: the service role cannot call the unleased v2
-- entry points.  Row locks from the helper remain held until the RPC commits.
create or replace function public.pos_catalog_revision_for_lease_v3(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if not app_private.pos_runtime_lease_is_valid_v1(
    p_shop_id, p_shop_device_id, p_staff_id, p_pos_session_id
  ) then
    return jsonb_build_object('status', 'denied');
  end if;
  return public.pos_catalog_revision_v2(p_shop_id);
end;
$$;

revoke all on function public.pos_catalog_revision_v2(uuid)
  from service_role;
revoke all on function public.pos_catalog_revision_for_lease_v3(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.pos_catalog_revision_for_lease_v3(
  uuid, uuid, uuid, uuid
) to service_role;

drop function if exists public.pos_catalog_pull_page_for_lease_v3(
  uuid, text, timestamptz, timestamptz, text, timestamptz, uuid,
  integer, text, text, text, boolean, uuid, uuid, uuid
);
create function public.pos_catalog_pull_page_for_lease_v3(
  p_shop_id uuid,
  p_mode text,
  p_lower_bound timestamptz,
  p_snapshot_at timestamptz,
  p_entity text,
  p_after_updated_at timestamptz,
  p_after_id uuid,
  p_limit integer,
  p_expected_revision text,
  p_expected_scope_kind text,
  p_expected_scope_key text,
  p_include_manifest boolean,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if not app_private.pos_runtime_lease_is_valid_v1(
    p_shop_id, p_shop_device_id, p_staff_id, p_pos_session_id
  ) then
    return jsonb_build_object('status', 'denied');
  end if;
  return public.pos_catalog_pull_page_v2(
    p_shop_id, p_mode, p_lower_bound, p_snapshot_at, p_entity,
    p_after_updated_at, p_after_id, p_limit, p_expected_revision,
    p_expected_scope_kind, p_expected_scope_key, p_include_manifest
  );
end;
$$;

revoke all on function public.pos_catalog_pull_page_v2(
  uuid, text, timestamptz, timestamptz, text, timestamptz, uuid,
  integer, text, text, text, boolean
) from service_role;
revoke all on function public.pos_catalog_pull_page_for_lease_v3(
  uuid, text, timestamptz, timestamptz, text, timestamptz, uuid,
  integer, text, text, text, boolean, uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.pos_catalog_pull_page_for_lease_v3(
  uuid, text, timestamptz, timestamptz, text, timestamptz, uuid,
  integer, text, text, text, boolean, uuid, uuid, uuid
) to service_role;

-- Staff Web runs through execute-only boundaries.  The service role keeps no
-- direct SELECT/DML grant on credential, session, permission or audit tables.
-- Every privileged operation must reacquire this lease in the same database
-- transaction as the protected read/write.
create or replace function app_private.staff_web_runtime_lease_is_valid_v1(
  p_shop_id uuid,
  p_staff_id uuid,
  p_staff_web_session_id uuid,
  p_session_token_hash text,
  p_expected_credential_version integer,
  p_required_permission text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_staff public.staff_accounts%rowtype;
  v_session public.staff_web_sessions%rowtype;
  v_publish_deadline timestamptz;
begin
  if p_shop_id is null
    or p_staff_id is null
    or p_staff_web_session_id is null
    or p_session_token_hash !~ '^sha256:[0-9a-f]{64}$'
    or coalesce(p_expected_credential_version, 0) < 1
    or (p_required_permission is not null
      and p_required_permission !~ '^[a-z][a-z0-9_.]{1,63}$') then
    return false;
  end if;

  -- Fixed lock order: shop -> staff -> web session.
  perform 1
  from public.shops shop
  where shop.shop_id = p_shop_id
    and shop.shop_status = 'active'
  for share;
  if not found then return false; end if;

  select staff.* into v_staff
  from public.staff_accounts staff
  where staff.staff_id = p_staff_id
    and staff.shop_id = p_shop_id
  for share;
  if not found
    or v_staff.status <> 'active'
    or v_staff.role_key <> 'manager'
    or v_staff.credential_status <> 'active'
    or v_staff.credential_version <> p_expected_credential_version
    or v_staff.must_change_credential
    or v_staff.web_access_revoked_at is not null
    or (v_staff.locked_until is not null and v_staff.locked_until > clock_timestamp())
    or (v_staff.credential_expires_at is not null
      and v_staff.credential_expires_at <= clock_timestamp()) then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('staff-web-session:' || p_staff_web_session_id::text, 0)
  );

  select session_row.* into v_session
  from public.staff_web_sessions session_row
  where session_row.staff_web_session_id = p_staff_web_session_id
    and session_row.shop_id = p_shop_id
    and session_row.staff_id = p_staff_id
  for update;
  if not found
    or v_session.session_token_hash <> p_session_token_hash
    or v_session.staff_credential_version <> p_expected_credential_version
    or v_session.status <> 'active'
    or v_session.expires_at <= clock_timestamp()
    or (v_staff.session_invalidated_at is not null
      and v_staff.session_invalidated_at > v_session.issued_at) then
    return false;
  end if;

  v_publish_deadline := least(
    v_session.expires_at,
    coalesce(v_staff.credential_expires_at, 'infinity'::timestamptz)
  );
  perform set_config(
    'app.staff_web_publish_deadline',
    v_publish_deadline::text,
    true
  );

  if p_required_permission is null then
    perform 1
      from public.staff_role_permissions permission
      where permission.shop_id = p_shop_id
        and permission.role_key = v_staff.role_key
        and permission.enabled
        and permission.permission_key in (
          'shop_admin.full_access', 'catalog.read', 'catalog.write',
          'catalog.import', 'catalog.export', 'staff.read', 'staff.write',
          'devices.read', 'devices.write', 'audit.read', 'settings.read',
          'settings.write', 'pos.dashboard.read', 'sync.read', 'sync.write',
          'history.write'
        )
      limit 1
      for share;
    if not found then
      return false;
    end if;
  else
    perform 1
      from public.staff_role_permissions permission
    where permission.shop_id = p_shop_id
      and permission.role_key = v_staff.role_key
      and permission.enabled
      and permission.permission_key in (
        'shop_admin.full_access', p_required_permission
      )
      limit 1
      for share;
    if not found then
      return false;
    end if;
  end if;

  update public.staff_web_sessions
  set last_seen_at = now(), updated_at = now()
  where staff_web_session_id = p_staff_web_session_id;
  return true;
end;
$$;

create or replace function app_private.staff_web_runtime_lease_publishable_v1()
returns boolean
language sql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    nullif(current_setting('app.staff_web_publish_deadline', true), '')::timestamptz
      > clock_timestamp(),
    false
  );
$$;

revoke all on function app_private.staff_web_runtime_lease_is_valid_v1(
  uuid, uuid, uuid, text, integer, text
) from public, anon, authenticated, service_role;
revoke all on function app_private.staff_web_runtime_lease_publishable_v1()
  from public, anon, authenticated, service_role;

create or replace function public.staff_web_login_lookup_v1(
  p_shop_code text,
  p_staff_code text,
  p_attempt_key_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_shop public.shops%rowtype;
  v_staff public.staff_accounts%rowtype;
  v_attempt public.staff_web_login_attempts%rowtype;
  v_permissions jsonb := '[]'::jsonb;
begin
  if p_shop_code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'
    or p_staff_code !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
    or p_attempt_key_hash !~ '^sha256:[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into v_attempt
  from public.staff_web_login_attempts attempt
  where attempt.attempt_key_hash = p_attempt_key_hash;

  select * into v_shop
  from public.shops shop
  where shop.shop_code = p_shop_code;

  if v_shop.shop_id is not null then
    select * into v_staff
    from public.staff_accounts staff
    where staff.shop_id = v_shop.shop_id
      and staff.staff_code = p_staff_code;
  end if;

  if v_staff.staff_id is not null then
    select coalesce(jsonb_agg(permission.permission_key order by permission.permission_key), '[]'::jsonb)
    into v_permissions
    from public.staff_role_permissions permission
    where permission.shop_id = v_shop.shop_id
      and permission.role_key = v_staff.role_key
      and permission.enabled;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'attempt', case when v_attempt.attempt_key_hash is null then null else jsonb_build_object(
      'attempt_key_hash', v_attempt.attempt_key_hash,
      'failed_attempts', v_attempt.failed_attempts,
      'locked_until', v_attempt.locked_until
    ) end,
    'shop', case when v_shop.shop_id is null then null else jsonb_build_object(
      'shop_id', v_shop.shop_id,
      'shop_code', v_shop.shop_code,
      'shop_name', v_shop.shop_name,
      'shop_status', v_shop.shop_status,
      'company_rut', v_shop.company_rut
    ) end,
    'staff', case when v_staff.staff_id is null then null else jsonb_build_object(
      'staff_id', v_staff.staff_id,
      'shop_id', v_staff.shop_id,
      'staff_code', v_staff.staff_code,
      'display_name', v_staff.display_name,
      'role_key', v_staff.role_key,
      'status', v_staff.status,
      'credential_hash', v_staff.credential_hash,
      'credential_version', v_staff.credential_version,
      'credential_status', v_staff.credential_status,
      'credential_expires_at', v_staff.credential_expires_at,
      'failed_attempts', v_staff.failed_attempts,
      'locked_until', v_staff.locked_until,
      'must_change_credential', v_staff.must_change_credential,
      'session_invalidated_at', v_staff.session_invalidated_at,
      'web_access_revoked_at', v_staff.web_access_revoked_at
    ) end,
    'permissions', v_permissions
  );
end;
$$;

revoke all on function public.staff_web_login_lookup_v1(text, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_web_login_lookup_v1(text, text, text)
  to service_role;

create or replace function public.staff_web_login_failure_v1(
  p_attempt_key_hash text,
  p_code text,
  p_metadata_redacted jsonb,
  p_shop_id uuid default null,
  p_staff_id uuid default null,
  p_expected_credential_version integer default null,
  p_affect_staff boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.staff_web_login_attempts%rowtype;
  v_failed integer;
  v_locked_until timestamptz;
begin
  if p_attempt_key_hash !~ '^sha256:[0-9a-f]{64}$'
    or p_code !~ '^[a-z][a-z0-9_]{1,63}$'
    or jsonb_typeof(coalesce(p_metadata_redacted, '{}'::jsonb)) <> 'object'
    or pg_column_size(coalesce(p_metadata_redacted, '{}'::jsonb)) > 4096
    or (p_affect_staff and (
      p_shop_id is null or p_staff_id is null
      or coalesce(p_expected_credential_version, 0) < 1
    )) then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('staff-web-attempt:' || p_attempt_key_hash, 0));
  select * into v_attempt
  from public.staff_web_login_attempts attempt
  where attempt.attempt_key_hash = p_attempt_key_hash
  for update;
  v_failed := least(
    case when v_attempt.locked_until is not null and v_attempt.locked_until <= now()
      then 0 else coalesce(v_attempt.failed_attempts, 0) end + 1,
    5
  );
  v_locked_until := case when v_failed >= 5 then now() + interval '15 minutes' else null end;

  insert into public.staff_web_login_attempts (
    attempt_key_hash, failed_attempts, locked_until, last_failed_at,
    metadata_redacted, updated_at
  ) values (
    p_attempt_key_hash, v_failed, v_locked_until, now(),
    coalesce(p_metadata_redacted, '{}'::jsonb), now()
  )
  on conflict (attempt_key_hash) do update
  set failed_attempts = excluded.failed_attempts,
      locked_until = excluded.locked_until,
      last_failed_at = excluded.last_failed_at,
      metadata_redacted = excluded.metadata_redacted,
      updated_at = excluded.updated_at;

  if p_affect_staff then
    perform 1 from public.shops shop
    where shop.shop_id = p_shop_id for key share;
    update public.staff_accounts staff
    set failed_attempts = least(
          case when staff.locked_until is not null and staff.locked_until <= now()
            then 0 else staff.failed_attempts end + 1,
          5
        ),
        credential_status = case
          when (case when staff.locked_until is not null and staff.locked_until <= now()
            then 0 else staff.failed_attempts end + 1) >= 5 then 'locked'
          else 'active'
        end,
        locked_until = case
          when (case when staff.locked_until is not null and staff.locked_until <= now()
            then 0 else staff.failed_attempts end + 1) >= 5
            then now() + interval '15 minutes' else null
        end,
        updated_at = now()
    where staff.staff_id = p_staff_id
      and staff.shop_id = p_shop_id
      and staff.credential_version = p_expected_credential_version;
  end if;

  insert into public.audit_logs (
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    null, p_staff_id, case when p_shop_id is null then 'global' else 'shop' end,
    p_shop_id, 'staff.web.login.failure',
    case when p_code in ('database_error', 'unknown_error') then 'critical' else 'warning' end,
    case when p_code in ('database_error', 'unknown_error') then 'failure' else 'blocked' end,
    case when p_staff_id is null then null else 'staff' end,
    p_staff_id::text,
    coalesce(p_metadata_redacted, '{}'::jsonb)
      || jsonb_build_object('code', p_code, 'source', 'TASK-139')
  );
  return jsonb_build_object('ok', true, 'failedAttempts', v_failed, 'lockedUntil', v_locked_until);
end;
$$;

revoke all on function public.staff_web_login_failure_v1(
  text, text, jsonb, uuid, uuid, integer, boolean
) from public, anon, authenticated;
grant execute on function public.staff_web_login_failure_v1(
  text, text, jsonb, uuid, uuid, integer, boolean
) to service_role;

create or replace function public.staff_web_login_commit_v1(
  p_shop_id uuid,
  p_staff_id uuid,
  p_expected_credential_version integer,
  p_attempt_key_hash text,
  p_session_token_hash text,
  p_expires_at timestamptz,
  p_metadata_redacted jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_staff public.staff_accounts%rowtype;
  v_attempt public.staff_web_login_attempts%rowtype;
  v_session_id uuid;
begin
  if p_attempt_key_hash !~ '^sha256:[0-9a-f]{64}$'
    or p_session_token_hash !~ '^sha256:[0-9a-f]{64}$'
    or coalesce(p_expected_credential_version, 0) < 1
    or p_expires_at <= now()
    or p_expires_at > now() + interval '12 hours 5 minutes'
    or jsonb_typeof(coalesce(p_metadata_redacted, '{}'::jsonb)) <> 'object'
    or pg_column_size(coalesce(p_metadata_redacted, '{}'::jsonb)) > 4096 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('staff-web-attempt:' || p_attempt_key_hash, 0));
  perform 1 from public.shops shop
  where shop.shop_id = p_shop_id and shop.shop_status = 'active'
  for share;
  if not found then return jsonb_build_object('ok', false, 'code', 'stale_identity'); end if;

  select staff.* into v_staff
  from public.staff_accounts staff
  where staff.staff_id = p_staff_id and staff.shop_id = p_shop_id
  for update;
  if not found
    or v_staff.status <> 'active'
    or v_staff.role_key <> 'manager'
    or v_staff.credential_status <> 'active'
    or v_staff.credential_version <> p_expected_credential_version
    or v_staff.must_change_credential
    or v_staff.web_access_revoked_at is not null
    or (v_staff.locked_until is not null and v_staff.locked_until > now())
    or (v_staff.credential_expires_at is not null and v_staff.credential_expires_at <= now())
    or not exists (
      select 1 from public.staff_role_permissions permission
      where permission.shop_id = p_shop_id
        and permission.role_key = v_staff.role_key
        and permission.enabled
        and permission.permission_key in (
          'shop_admin.full_access', 'catalog.read', 'catalog.write',
          'catalog.import', 'catalog.export', 'staff.read', 'staff.write',
          'devices.read', 'devices.write', 'audit.read', 'settings.read',
          'settings.write', 'pos.dashboard.read', 'sync.read', 'sync.write',
          'history.write'
        )
    ) then
    return jsonb_build_object('ok', false, 'code', 'stale_identity');
  end if;

  select * into v_attempt
  from public.staff_web_login_attempts attempt
  where attempt.attempt_key_hash = p_attempt_key_hash
  for update;
  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return jsonb_build_object('ok', false, 'code', 'locked');
  end if;

  insert into public.staff_web_login_attempts (
    attempt_key_hash, failed_attempts, locked_until, last_success_at,
    metadata_redacted, updated_at
  ) values (
    p_attempt_key_hash, 0, null, now(), coalesce(p_metadata_redacted, '{}'::jsonb), now()
  )
  on conflict (attempt_key_hash) do update
  set failed_attempts = 0, locked_until = null, last_success_at = now(),
      metadata_redacted = excluded.metadata_redacted, updated_at = now();

  update public.staff_accounts
  set credential_status = 'active', failed_attempts = 0,
      locked_until = null, last_login_at = now(), updated_at = now()
  where staff_id = p_staff_id and shop_id = p_shop_id;

  insert into public.staff_web_sessions (
    shop_id, staff_id, session_token_hash, staff_credential_version,
    status, expires_at, last_seen_at, metadata_redacted
  ) values (
    p_shop_id, p_staff_id, p_session_token_hash, p_expected_credential_version,
    'active', p_expires_at, now(), coalesce(p_metadata_redacted, '{}'::jsonb)
  ) returning staff_web_session_id into v_session_id;

  insert into public.audit_logs (
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    null, p_staff_id, 'shop', p_shop_id, 'staff.web.login.success',
    'info', 'success', 'staff', p_staff_id::text,
    coalesce(p_metadata_redacted, '{}'::jsonb)
      || jsonb_build_object('code', 'success', 'source', 'TASK-139')
  );

  return jsonb_build_object(
    'ok', true, 'code', 'success',
    'attemptKeyHash', p_attempt_key_hash,
    'shopId', p_shop_id,
    'staffId', p_staff_id,
    'credentialVersion', p_expected_credential_version,
    'staffWebSessionId', v_session_id,
    'expiresAt', p_expires_at
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'stale_identity');
end;
$$;

revoke all on function public.staff_web_login_commit_v1(
  uuid, uuid, integer, text, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.staff_web_login_commit_v1(
  uuid, uuid, integer, text, text, timestamptz, jsonb
) to service_role;

create or replace function public.staff_web_session_resolve_v1(
  p_session_token_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_session public.staff_web_sessions%rowtype;
  v_permissions jsonb;
begin
  if p_session_token_hash !~ '^sha256:[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'denied');
  end if;

  select * into v_session
  from public.staff_web_sessions session_row
  where session_row.session_token_hash = p_session_token_hash;
  if not found then
    return jsonb_build_object('status', 'denied');
  end if;
  if v_session.expires_at <= clock_timestamp() then
    return jsonb_build_object('status', 'expired');
  end if;
  if not app_private.staff_web_runtime_lease_is_valid_v1(
    v_session.shop_id, v_session.staff_id, v_session.staff_web_session_id,
    p_session_token_hash, v_session.staff_credential_version, null
  ) then
    return jsonb_build_object('status', 'denied');
  end if;

  select coalesce(jsonb_agg(permission.permission_key order by permission.permission_key), '[]'::jsonb)
  into v_permissions
  from public.staff_role_permissions permission
  join public.staff_accounts staff
    on staff.shop_id = permission.shop_id and staff.role_key = permission.role_key
  where staff.staff_id = v_session.staff_id and permission.enabled;

  return (
    select jsonb_build_object(
      'status', 'ok',
      'session', jsonb_build_object(
        'staff_web_session_id', session_row.staff_web_session_id,
        'shop_id', session_row.shop_id,
        'staff_id', session_row.staff_id,
        'staff_credential_version', session_row.staff_credential_version,
        'session_token_hash', session_row.session_token_hash,
        'status', session_row.status,
        'issued_at', session_row.issued_at,
        'expires_at', session_row.expires_at
      ),
      'shop', jsonb_build_object(
        'shop_id', shop.shop_id, 'shop_code', shop.shop_code,
        'shop_name', shop.shop_name, 'shop_status', shop.shop_status,
        'company_rut', shop.company_rut
      ),
      'staff', jsonb_build_object(
        'staff_id', staff.staff_id, 'shop_id', staff.shop_id,
        'staff_code', staff.staff_code, 'display_name', staff.display_name,
        'role_key', staff.role_key, 'status', staff.status,
        'credential_version', staff.credential_version,
        'credential_status', staff.credential_status,
        'credential_expires_at', staff.credential_expires_at,
        'locked_until', staff.locked_until,
        'must_change_credential', staff.must_change_credential,
        'session_invalidated_at', staff.session_invalidated_at,
        'web_access_revoked_at', staff.web_access_revoked_at
      ),
      'permissions', v_permissions
    )
    from public.staff_web_sessions session_row
    join public.shops shop on shop.shop_id = session_row.shop_id
    join public.staff_accounts staff on staff.staff_id = session_row.staff_id
    where session_row.staff_web_session_id = v_session.staff_web_session_id
  );
end;
$$;

revoke all on function public.staff_web_session_resolve_v1(text)
  from public, anon, authenticated;
grant execute on function public.staff_web_session_resolve_v1(text)
  to service_role;

create or replace function public.staff_web_session_revoke_v1(
  p_session_token_hash text,
  p_reason text,
  p_record_logout boolean default false
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.staff_web_sessions%rowtype;
begin
  if p_session_token_hash !~ '^sha256:[0-9a-f]{64}$'
    or coalesce(length(p_reason), 0) not between 1 and 120 then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('staff-web-token:' || p_session_token_hash, 0));
  select * into v_session
  from public.staff_web_sessions session_row
  where session_row.session_token_hash = p_session_token_hash
  for update;
  if not found then return false; end if;

  update public.staff_web_sessions
  set status = 'revoked', revoked_at = now(), revoked_reason = left(p_reason, 120),
      updated_at = now()
  where staff_web_session_id = v_session.staff_web_session_id;

  if p_record_logout then
    insert into public.audit_logs (
      actor_profile_id, actor_staff_id, scope, shop_id, event_key,
      severity, result, target_type, target_id, metadata_redacted
    ) values (
      null, v_session.staff_id, 'shop', v_session.shop_id,
      'staff.web.logout', 'info', 'success', 'staff', v_session.staff_id::text,
      jsonb_build_object('code', 'success', 'source', 'TASK-139')
    );
  end if;
  return true;
end;
$$;

revoke all on function public.staff_web_session_revoke_v1(text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.staff_web_session_revoke_v1(text, text, boolean)
  to service_role;

create or replace function app_private.resolve_shop_catalog_scope_service_v1(
  p_shop_id uuid
)
returns table (
  catalog_shop_id uuid,
  owner_user_id uuid,
  catalog_scope text
)
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_initial_owner uuid;
  v_mapped_owner uuid;
  v_compatibility_owner uuid;
  v_has_shop_rows boolean;
  v_has_legacy_rows boolean := false;
begin
  perform 1 from public.shops shop
  where shop.shop_id = p_shop_id and shop.shop_status = 'active'
  for share;
  if not found then return; end if;

  select source.owner_user_id into v_initial_owner
  from public.shop_inventory_sources source
  where source.shop_id = p_shop_id
    and source.source_kind = 'mobile_owner'
    and source.mapping_state = 'mapped'
    and source.owner_user_id is not null
    and source.verified_at is not null
    and source.disabled_at is null
  order by source.created_at desc limit 1;

  perform app_private.lock_catalog_scope_pair_v1(p_shop_id, v_initial_owner);

  if exists (
    select 1 from public.shop_inventory_sources blocker
    where blocker.shop_id = p_shop_id
      and blocker.disabled_at is null
      and (
        blocker.source_kind <> 'mobile_owner'
        or blocker.mapping_state <> 'mapped'
        or blocker.owner_user_id is null
        or blocker.verified_at is null
      )
  ) then
    return;
  end if;

  select source.owner_user_id into v_mapped_owner
  from public.shop_inventory_sources source
  where source.shop_id = p_shop_id
    and source.source_kind = 'mobile_owner'
    and source.mapping_state = 'mapped'
    and source.owner_user_id is not null
    and source.verified_at is not null
    and source.disabled_at is null
  order by source.created_at desc limit 1;

  v_compatibility_owner := v_mapped_owner;
  if v_compatibility_owner is null then
    select shop.created_by_profile_id into v_compatibility_owner
    from public.shops shop where shop.shop_id = p_shop_id;
  end if;
  if v_compatibility_owner is null then
    select member.profile_id into v_compatibility_owner
    from public.shop_members member
    where member.shop_id = p_shop_id
      and member.membership_status = 'active'
      and member.role_key in ('shop_owner', 'shop_manager')
    order by case member.role_key when 'shop_owner' then 0 else 1 end,
      member.created_at
    limit 1;
  end if;
  if v_compatibility_owner is null then return; end if;

  select
    exists (select 1 from public.inventory_suppliers row where row.shop_id = p_shop_id)
    or exists (select 1 from public.inventory_categories row where row.shop_id = p_shop_id)
    or exists (select 1 from public.inventory_products row where row.shop_id = p_shop_id)
    or exists (select 1 from public.inventory_product_prices row where row.shop_id = p_shop_id)
  into v_has_shop_rows;
  if v_mapped_owner is not null then
    select
      exists (select 1 from public.inventory_suppliers row where row.shop_id is null and row.owner_user_id = v_mapped_owner)
      or exists (select 1 from public.inventory_categories row where row.shop_id is null and row.owner_user_id = v_mapped_owner)
      or exists (select 1 from public.inventory_products row where row.shop_id is null and row.owner_user_id = v_mapped_owner)
      or exists (select 1 from public.inventory_product_prices row where row.shop_id is null and row.owner_user_id = v_mapped_owner)
    into v_has_legacy_rows;
  end if;

  catalog_shop_id := p_shop_id;
  owner_user_id := v_compatibility_owner;
  catalog_scope := case
    when v_has_shop_rows and v_has_legacy_rows then 'authorized_shop_plus_legacy'
    when v_has_legacy_rows then 'legacy_owner_bridge'
    else 'shop_scoped'
  end;
  return next;
end;
$$;

create or replace function app_private.staff_web_action_result_v1(
  p_shop_id uuid,
  p_staff_id uuid,
  p_event_key text,
  p_code text,
  p_target_type text default null,
  p_target_id text default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_audit_id uuid;
  v_ok boolean := p_code = 'success';
begin
  insert into public.audit_logs (
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    case when p_staff_id is null then auth.uid() else null end,
    p_staff_id, 'shop', p_shop_id, left(p_event_key, 160),
    case when p_code = 'success' then 'info'
      when p_code in ('conflict', 'not_found', 'invalid_supplier', 'invalid_category',
        'invalid_state_or_not_found', 'unauthorized_or_unmapped', 'partial_failure')
        then 'warning' else 'critical' end,
    case when p_code = 'success' then 'success'
      when p_code = 'db_failure' then 'failure' else 'blocked' end,
    nullif(left(p_target_type, 80), ''), nullif(left(p_target_id, 200), ''),
    jsonb_build_object('code', p_code, 'source', 'TASK-139')
  ) returning audit_log_id into v_audit_id;
  if p_staff_id is not null
    and not app_private.staff_web_runtime_lease_publishable_v1() then
    raise exception 'staff web lease expired before publication'
      using errcode = '42501';
  end if;
  return app_private.shop_admin_action_result(
    v_ok, p_code, p_shop_id, p_target_id, v_audit_id,
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

revoke all on function app_private.resolve_shop_catalog_scope_service_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.staff_web_action_result_v1(
  uuid, uuid, text, text, text, text, jsonb
) from public, anon, authenticated, service_role;

create or replace function public.staff_web_catalog_mutate_v1(
  p_shop_id uuid,
  p_staff_id uuid,
  p_staff_web_session_id uuid,
  p_session_token_hash text,
  p_expected_credential_version integer,
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_scope record;
  v_required_permission text;
  v_id uuid;
  v_related_id uuid;
  v_name text;
  v_reason text;
  v_row jsonb;
  v_applied integer := 0;
  v_failed integer := 0;
  v_ids jsonb := '[]'::jsonb;
  v_product_id uuid;
  v_price_id uuid;
  v_count integer;
  v_expected_count integer;
  v_previous_restore_allowed text;
  v_restored_deleted_at timestamptz;
  v_event text := 'shop.catalog.' || coalesce(p_operation, 'unknown');
begin
  if p_payload is null
    or p_operation not in (
      'supplier_create', 'supplier_update', 'supplier_archive',
      'category_create', 'category_update', 'category_archive',
      'product_create', 'product_update', 'product_archive', 'product_restore',
      'product_assignments', 'bulk_products', 'bulk_prices'
    )
    or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
    or pg_column_size(coalesce(p_payload, '{}'::jsonb)) > 1048576 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  v_required_permission := case
    when p_operation in ('bulk_products', 'bulk_prices') then 'catalog.import'
    else 'catalog.write'
  end;
  if not app_private.staff_web_runtime_lease_is_valid_v1(
    p_shop_id, p_staff_id, p_staff_web_session_id, p_session_token_hash,
    p_expected_credential_version, v_required_permission
  ) then
    return jsonb_build_object('ok', false, 'code', 'session_expired', 'shop_id', p_shop_id);
  end if;

  select * into v_scope
  from app_private.resolve_shop_catalog_scope_service_v1(p_shop_id);
  if v_scope.owner_user_id is null then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, v_event || '.failure',
      'unauthorized_or_unmapped', null, null,
      jsonb_build_object('catalogScope', 'blocked')
    );
  end if;

  if p_operation like 'supplier_%' or p_operation like 'category_%' then
    v_name := app_private.normalize_admin_label(p_payload->>'name');
    if p_operation not in ('supplier_archive', 'category_archive')
      and length(v_name) not between 1 and 160 then
      return app_private.staff_web_action_result_v1(
        p_shop_id, p_staff_id, v_event || '.failure', 'validation_failed'
      );
    end if;
    if p_operation like '%_update' or p_operation like '%_archive' then
      begin v_id := (p_payload->>'id')::uuid;
      exception when others then
        return app_private.staff_web_action_result_v1(
          p_shop_id, p_staff_id, v_event || '.failure', 'validation_failed'
        );
      end;
    end if;

    if p_operation = 'supplier_create' then
      insert into public.inventory_suppliers(owner_user_id, shop_id, name, updated_at)
      values(v_scope.owner_user_id, p_shop_id, v_name, now()) returning id into v_id;
    elsif p_operation = 'category_create' then
      insert into public.inventory_categories(owner_user_id, shop_id, name, updated_at)
      values(v_scope.owner_user_id, p_shop_id, v_name, now()) returning id into v_id;
    elsif p_operation = 'supplier_update' then
      update public.inventory_suppliers row set name = v_name, updated_at = now()
      where row.id = v_id and row.deleted_at is null and (
        row.shop_id = p_shop_id or
        (row.shop_id is null and row.owner_user_id = v_scope.owner_user_id)
      );
      if not found then return app_private.staff_web_action_result_v1(
        p_shop_id, p_staff_id, v_event || '.failure', 'not_found', 'supplier', v_id::text
      ); end if;
    elsif p_operation = 'category_update' then
      update public.inventory_categories row set name = v_name, updated_at = now()
      where row.id = v_id and row.deleted_at is null and (
        row.shop_id = p_shop_id or
        (row.shop_id is null and row.owner_user_id = v_scope.owner_user_id)
      );
      if not found then return app_private.staff_web_action_result_v1(
        p_shop_id, p_staff_id, v_event || '.failure', 'not_found', 'category', v_id::text
      ); end if;
    elsif p_operation = 'supplier_archive' then
      update public.inventory_suppliers row set deleted_at = now(), updated_at = now()
      where row.id = v_id and row.deleted_at is null and (
        row.shop_id = p_shop_id or
        (row.shop_id is null and row.owner_user_id = v_scope.owner_user_id)
      );
      if not found then return app_private.staff_web_action_result_v1(
        p_shop_id, p_staff_id, v_event || '.failure', 'not_found', 'supplier', v_id::text
      ); end if;
    else
      update public.inventory_categories row set deleted_at = now(), updated_at = now()
      where row.id = v_id and row.deleted_at is null and (
        row.shop_id = p_shop_id or
        (row.shop_id is null and row.owner_user_id = v_scope.owner_user_id)
      );
      if not found then return app_private.staff_web_action_result_v1(
        p_shop_id, p_staff_id, v_event || '.failure', 'not_found', 'category', v_id::text
      ); end if;
    end if;
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, v_event || '.success', 'success',
      case when p_operation like 'supplier_%' then 'supplier' else 'category' end,
      v_id::text, jsonb_build_object('catalogScope', v_scope.catalog_scope)
    );
  end if;

  if p_operation in ('product_create', 'product_update') then
    if p_operation = 'product_update' then
      begin v_id := (p_payload->>'productId')::uuid;
      exception when others then
        return app_private.staff_web_action_result_v1(
          p_shop_id, p_staff_id, v_event || '.failure', 'validation_failed'
        );
      end;
    end if;
    if nullif(p_payload->>'supplierId', '') is not null then
      begin v_related_id := (p_payload->>'supplierId')::uuid;
      exception when others then v_related_id := null; end;
      if v_related_id is null or not exists (
        select 1 from public.inventory_suppliers row
        where row.id = v_related_id and row.deleted_at is null and (
          row.shop_id = p_shop_id or
          (row.shop_id is null and row.owner_user_id = v_scope.owner_user_id)
        )
      ) then return app_private.staff_web_action_result_v1(
        p_shop_id, p_staff_id, v_event || '.failure', 'invalid_supplier', 'product', v_id::text
      ); end if;
    else v_related_id := null;
    end if;
    if nullif(p_payload->>'categoryId', '') is not null and not exists (
      select 1 from public.inventory_categories row
      where row.id = (p_payload->>'categoryId')::uuid and row.deleted_at is null and (
        row.shop_id = p_shop_id or
        (row.shop_id is null and row.owner_user_id = v_scope.owner_user_id)
      )
    ) then return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, v_event || '.failure', 'invalid_category', 'product', v_id::text
    ); end if;
    v_name := app_private.normalize_admin_label(p_payload->>'productName');
    if length(app_private.normalize_admin_label(p_payload->>'barcode')) not between 1 and 96
      or length(v_name) not between 1 and 240 then
      return app_private.staff_web_action_result_v1(
        p_shop_id, p_staff_id, v_event || '.failure', 'validation_failed'
      );
    end if;

    if p_operation = 'product_create' then
      insert into public.inventory_products(
        owner_user_id, shop_id, barcode, item_number, product_name,
        second_product_name, purchase_price, retail_price, stock_quantity,
        supplier_id, category_id, updated_at
      ) values (
        v_scope.owner_user_id, p_shop_id,
        app_private.normalize_admin_label(p_payload->>'barcode'),
        nullif(app_private.normalize_admin_label(p_payload->>'itemNumber'), ''), v_name,
        nullif(app_private.normalize_admin_label(p_payload->>'secondProductName'), ''),
        nullif(p_payload->>'purchasePrice', '')::double precision,
        nullif(p_payload->>'retailPrice', '')::double precision,
        nullif(p_payload->>'stockQuantity', '')::double precision,
        v_related_id, nullif(p_payload->>'categoryId', '')::uuid, now()
      ) returning id into v_id;
    else
      update public.inventory_products row set
        barcode = app_private.normalize_admin_label(p_payload->>'barcode'),
        item_number = nullif(app_private.normalize_admin_label(p_payload->>'itemNumber'), ''),
        product_name = v_name,
        second_product_name = nullif(app_private.normalize_admin_label(p_payload->>'secondProductName'), ''),
        purchase_price = nullif(p_payload->>'purchasePrice', '')::double precision,
        retail_price = nullif(p_payload->>'retailPrice', '')::double precision,
        stock_quantity = nullif(p_payload->>'stockQuantity', '')::double precision,
        supplier_id = v_related_id,
        category_id = nullif(p_payload->>'categoryId', '')::uuid,
        updated_at = now()
      where row.id = v_id and row.deleted_at is null and (
        row.shop_id = p_shop_id or
        (row.shop_id is null and row.owner_user_id = v_scope.owner_user_id)
      );
      if not found then return app_private.staff_web_action_result_v1(
        p_shop_id, p_staff_id, v_event || '.failure', 'not_found', 'product', v_id::text
      ); end if;
    end if;
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, v_event || '.success', 'success', 'product', v_id::text,
      jsonb_build_object('catalogScope', v_scope.catalog_scope)
    );
  end if;

  if p_operation in ('product_archive', 'product_restore') then
    begin v_id := (p_payload->>'id')::uuid;
    exception when others then return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, v_event || '.failure', 'validation_failed'
    ); end;
    if p_operation = 'product_restore' then
      v_previous_restore_allowed := current_setting(
        'app.catalog_restore_allowed', true
      );
      perform set_config('app.catalog_restore_allowed', 'true', true);
      update public.inventory_products row
      set deleted_at = null,
          updated_at = now()
      where row.id = v_id
        and row.deleted_at is not null
        and (row.shop_id = p_shop_id or
          (row.shop_id is null and row.owner_user_id = v_scope.owner_user_id))
      returning row.deleted_at into v_restored_deleted_at;
      get diagnostics v_count = row_count;
      perform set_config(
        'app.catalog_restore_allowed',
        coalesce(v_previous_restore_allowed, ''),
        true
      );
    else
      update public.inventory_products row
      set deleted_at = now(),
          updated_at = now()
      where row.id = v_id
        and row.deleted_at is null
        and (row.shop_id = p_shop_id or
          (row.shop_id is null and row.owner_user_id = v_scope.owner_user_id))
      returning row.deleted_at into v_restored_deleted_at;
      get diagnostics v_count = row_count;
    end if;
    if v_count <> 1
      or (p_operation = 'product_restore' and v_restored_deleted_at is not null)
      or (p_operation = 'product_archive' and v_restored_deleted_at is null) then
      return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, v_event || '.failure', 'invalid_state_or_not_found',
      'product', v_id::text
      );
    end if;
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, v_event || '.success', 'success', 'product', v_id::text,
      jsonb_build_object('catalogScope', v_scope.catalog_scope)
    );
  end if;

  if p_operation = 'product_assignments' then
    if jsonb_typeof(p_payload->'productIds') <> 'array'
      or jsonb_array_length(p_payload->'productIds') not between 1 and 20000 then
      return app_private.staff_web_action_result_v1(
        p_shop_id, p_staff_id, v_event || '.failure', 'validation_failed'
      );
    end if;
    begin
      select count(distinct value::uuid) into v_expected_count
      from jsonb_array_elements_text(p_payload->'productIds');
      v_related_id := nullif(p_payload->>'replacementId', '')::uuid;
    exception when others then
      return app_private.staff_web_action_result_v1(
        p_shop_id, p_staff_id, v_event || '.failure', 'validation_failed'
      );
    end;
    if v_expected_count <> jsonb_array_length(p_payload->'productIds')
      or p_payload->>'entity' not in ('supplier', 'category') then
      return app_private.staff_web_action_result_v1(
        p_shop_id, p_staff_id, v_event || '.failure', 'validation_failed'
      );
    end if;
    if v_related_id is not null then
      if p_payload->>'entity' = 'supplier' then
        perform 1 from public.inventory_suppliers row
        where row.id = v_related_id and row.deleted_at is null and (
          row.shop_id = p_shop_id or
          (row.shop_id is null and row.owner_user_id = v_scope.owner_user_id)
        ) for share;
      else
        perform 1 from public.inventory_categories row
        where row.id = v_related_id and row.deleted_at is null and (
          row.shop_id = p_shop_id or
          (row.shop_id is null and row.owner_user_id = v_scope.owner_user_id)
        ) for share;
      end if;
      if not found then
        return app_private.staff_web_action_result_v1(
          p_shop_id, p_staff_id, v_event || '.failure',
          case when p_payload->>'entity' = 'supplier'
            then 'invalid_supplier' else 'invalid_category' end
        );
      end if;
    end if;
    select count(*) into v_count from public.inventory_products row
    where row.id in (select value::uuid from jsonb_array_elements_text(p_payload->'productIds'))
      and row.deleted_at is null and (
        row.shop_id = p_shop_id or
        (row.shop_id is null and row.owner_user_id = v_scope.owner_user_id)
      );
    if v_count <> v_expected_count then
      return app_private.staff_web_action_result_v1(
        p_shop_id, p_staff_id, v_event || '.failure', 'partial_failure'
      );
    end if;
    if p_payload->>'entity' = 'supplier' then
      update public.inventory_products row
      set supplier_id = v_related_id, updated_at = now()
      where row.id in (select value::uuid from jsonb_array_elements_text(p_payload->'productIds'))
        and row.deleted_at is null and (row.shop_id = p_shop_id or
          (row.shop_id is null and row.owner_user_id = v_scope.owner_user_id));
    else
      update public.inventory_products row
      set category_id = v_related_id, updated_at = now()
      where row.id in (select value::uuid from jsonb_array_elements_text(p_payload->'productIds'))
        and row.deleted_at is null and (row.shop_id = p_shop_id or
          (row.shop_id is null and row.owner_user_id = v_scope.owner_user_id));
    end if;
    get diagnostics v_count = row_count;
    if v_count <> v_expected_count then
      raise exception 'staff product assignment count changed during update'
        using errcode = '40001';
    end if;
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, v_event || '.success', 'success', 'products', null,
      jsonb_build_object('updatedCount', v_count, 'catalogScope', v_scope.catalog_scope)
    );
  end if;

  if p_operation = 'bulk_products' then
    if jsonb_typeof(p_payload->'rows') <> 'array'
      or jsonb_array_length(p_payload->'rows') not between 1 and 500 then
      return app_private.staff_web_action_result_v1(
        p_shop_id, p_staff_id, v_event || '.failure', 'validation_failed'
      );
    end if;
    for v_row in select value from jsonb_array_elements(p_payload->'rows') loop
      begin
        v_product_id := nullif(v_row->>'product_id', '')::uuid;
        if v_product_id is not null then
          update public.inventory_products row set
            barcode = app_private.normalize_admin_label(v_row->>'barcode'),
            item_number = nullif(app_private.normalize_admin_label(v_row->>'item_number'), ''),
            product_name = app_private.normalize_admin_label(v_row->>'product_name'),
            second_product_name = nullif(app_private.normalize_admin_label(v_row->>'second_product_name'), ''),
            purchase_price = nullif(v_row->>'purchase_price', '')::double precision,
            retail_price = nullif(v_row->>'retail_price', '')::double precision,
            stock_quantity = nullif(v_row->>'stock_quantity', '')::double precision,
            supplier_id = nullif(v_row->>'supplier_id', '')::uuid,
            category_id = nullif(v_row->>'category_id', '')::uuid,
            updated_at = now()
          where row.id = v_product_id and row.deleted_at is null and (
            row.shop_id = p_shop_id or
            (row.shop_id is null and row.owner_user_id = v_scope.owner_user_id)
          );
          if not found then raise exception 'row scope mismatch' using errcode = '22023'; end if;
        else
          insert into public.inventory_products(
            owner_user_id, shop_id, barcode, item_number, product_name,
            second_product_name, purchase_price, retail_price, stock_quantity,
            supplier_id, category_id, updated_at
          ) values (
            v_scope.owner_user_id, p_shop_id,
            app_private.normalize_admin_label(v_row->>'barcode'),
            nullif(app_private.normalize_admin_label(v_row->>'item_number'), ''),
            app_private.normalize_admin_label(v_row->>'product_name'),
            nullif(app_private.normalize_admin_label(v_row->>'second_product_name'), ''),
            nullif(v_row->>'purchase_price', '')::double precision,
            nullif(v_row->>'retail_price', '')::double precision,
            nullif(v_row->>'stock_quantity', '')::double precision,
            nullif(v_row->>'supplier_id', '')::uuid,
            nullif(v_row->>'category_id', '')::uuid, now()
          ) returning id into v_product_id;
        end if;
        v_ids := v_ids || jsonb_build_array(jsonb_build_object(
          'productId', v_product_id, 'barcode', v_row->>'barcode',
          'itemNumber', nullif(v_row->>'item_number', '')
        ));
        v_applied := v_applied + 1;
      exception when others then v_failed := v_failed + 1;
      end;
    end loop;
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, v_event || case when v_failed=0 then '.success' else '.partial' end,
      case when v_failed=0 then 'success' else 'partial_failure' end,
      'products', null, jsonb_build_object(
        'productsApplied', v_applied, 'failedRows', v_failed,
        'productIds', v_ids, 'catalogScope', v_scope.catalog_scope
      )
    );
  end if;

  if jsonb_typeof(p_payload->'rows') <> 'array'
    or jsonb_array_length(p_payload->'rows') not between 1 and 1000 then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, v_event || '.failure', 'validation_failed'
    );
  end if;
  for v_row in select value from jsonb_array_elements(p_payload->'rows') loop
    begin
      v_product_id := (v_row->>'product_id')::uuid;
      if not exists (
        select 1 from public.inventory_products row
        where row.id = v_product_id and row.deleted_at is null and (
          row.shop_id = p_shop_id or
          (row.shop_id is null and row.owner_user_id = v_scope.owner_user_id)
        )
      ) then raise exception 'foreign product' using errcode = '22023'; end if;
      v_price_id := coalesce(nullif(v_row->>'price_id', '')::uuid, gen_random_uuid());
      insert into public.inventory_product_prices(
        id, owner_user_id, shop_id, product_id, type, price, effective_at,
        source, note, created_at
      ) values (
        v_price_id, v_scope.owner_user_id, p_shop_id, v_product_id,
        upper(v_row->>'type'), (v_row->>'price')::double precision,
        (v_row->>'effective_at')::timestamptz,
        nullif(v_row->>'source', ''), nullif(v_row->>'note', ''),
        coalesce(nullif(v_row->>'created_at', '')::timestamptz,
          (v_row->>'effective_at')::timestamptz)
      )
      on conflict on constraint inventory_product_prices_owner_product_type_effective_uniq
      do update set price = excluded.price, source = excluded.source,
        note = excluded.note, created_at = excluded.created_at,
        shop_id = excluded.shop_id
      returning id into v_price_id;
      v_ids := v_ids || jsonb_build_array(v_price_id);
      v_applied := v_applied + 1;
    exception when others then v_failed := v_failed + 1;
    end;
  end loop;
  return app_private.staff_web_action_result_v1(
    p_shop_id, p_staff_id, v_event || case when v_failed=0 then '.success' else '.partial' end,
    case when v_failed=0 then 'success' else 'partial_failure' end,
    'price_history', null, jsonb_build_object(
      'priceHistoryApplied', v_applied, 'failedRows', v_failed,
      'priceIds', v_ids, 'catalogScope', v_scope.catalog_scope
    )
  );
exception
  when unique_violation then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, v_event || '.failure', 'conflict', null, v_id::text
    );
  when invalid_text_representation or numeric_value_out_of_range or check_violation then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, v_event || '.failure', 'validation_failed', null, v_id::text
    );
  when others then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, v_event || '.failure', 'db_failure', null, v_id::text
    );
end;
$$;

revoke all on function public.staff_web_catalog_mutate_v1(
  uuid, uuid, uuid, text, integer, text, jsonb
) from public, anon, authenticated;
grant execute on function public.staff_web_catalog_mutate_v1(
  uuid, uuid, uuid, text, integer, text, jsonb
) to service_role;

-- Preserve the reviewed row-level partial-failure implementations behind
-- private names, then expose wrappers that aggregate their successful IDs.
-- The conditional move keeps local migration iteration idempotent; a clean
-- database executes each move exactly once.
do $$
begin
  if to_regprocedure(
    'app_private.shop_catalog_import_products_pre_task139_v1(uuid,jsonb)'
  ) is null then
    alter function public.shop_catalog_import_products(uuid, jsonb)
      set schema app_private;
    alter function app_private.shop_catalog_import_products(uuid, jsonb)
      rename to shop_catalog_import_products_pre_task139_v1;
  end if;

  if to_regprocedure(
    'app_private.shop_catalog_import_price_history_pre_task139_v1(uuid,jsonb)'
  ) is null then
    alter function public.shop_catalog_import_price_history(uuid, jsonb)
      set schema app_private;
    alter function app_private.shop_catalog_import_price_history(uuid, jsonb)
      rename to shop_catalog_import_price_history_pre_task139_v1;
  end if;

  if to_regprocedure(
    'app_private.staff_web_catalog_mutate_pre_task139_v1(uuid,uuid,uuid,text,integer,text,jsonb)'
  ) is null then
    alter function public.staff_web_catalog_mutate_v1(
      uuid, uuid, uuid, text, integer, text, jsonb
    ) set schema app_private;
    alter function app_private.staff_web_catalog_mutate_v1(
      uuid, uuid, uuid, text, integer, text, jsonb
    ) rename to staff_web_catalog_mutate_pre_task139_v1;
  end if;
end;
$$;

revoke all on function app_private.shop_catalog_import_products_pre_task139_v1(
  uuid, jsonb
) from public, anon, authenticated, service_role;
revoke all on function app_private.shop_catalog_import_price_history_pre_task139_v1(
  uuid, jsonb
) from public, anon, authenticated, service_role;
revoke all on function app_private.staff_web_catalog_mutate_pre_task139_v1(
  uuid, uuid, uuid, text, integer, text, jsonb
) from public, anon, authenticated, service_role;

create or replace function app_private.sync_admin_import_rows_are_safe_v1(
  p_rows jsonb,
  p_kind text,
  p_max_rows integer
)
returns boolean
language plpgsql
stable
security definer
set search_path = app_private, pg_catalog, pg_temp
as $$
declare
  v_row jsonb;
  v_key text;
  v_value jsonb;
  v_text text;
  v_total_text_bytes bigint := 0;
  v_allowed_keys text[];
  v_numeric_keys text[];
  v_text_limit integer;
begin
  if p_rows is null
    or p_kind not in ('products', 'prices')
    or p_max_rows < 1
    or app_private.sync_jsonb_storage_is_bounded_v1(
      p_rows, 524288, 0
    ) is not true
    or jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) > p_max_rows then
    return false;
  end if;

  v_allowed_keys := case p_kind
    when 'products' then array[
      'product_id', 'barcode', 'item_number', 'product_name',
      'second_product_name', 'purchase_price', 'retail_price',
      'stock_quantity', 'supplier_id', 'category_id'
    ]
    else array[
      'price_id', 'product_id', 'type', 'price', 'effective_at',
      'source', 'note', 'created_at'
    ]
  end;
  v_numeric_keys := case p_kind
    when 'products' then array[
      'purchase_price', 'retail_price', 'stock_quantity'
    ]
    else array['price']
  end;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if app_private.sync_jsonb_storage_is_bounded_v1(
        v_row, 65536, 0
      ) is not true or jsonb_typeof(v_row) <> 'object' then
      return false;
    end if;
    for v_key, v_value in select entry.key, entry.value from jsonb_each(v_row) entry
    loop
      if not v_key = any(v_allowed_keys) then
        return false;
      end if;
      if jsonb_typeof(v_value) = 'null' then
        continue;
      end if;
      if v_key = any(v_numeric_keys) then
        if jsonb_typeof(v_value) = 'number' then
          if v_value < '0'::jsonb or v_value > '1000000000000'::jsonb then
            return false;
          end if;
          continue;
        elsif jsonb_typeof(v_value) <> 'string' then
          return false;
        end if;
        v_text_limit := 64;
      else
        if jsonb_typeof(v_value) <> 'string' then
          return false;
        end if;
        v_text_limit := case
          when v_key in ('product_id', 'price_id', 'supplier_id', 'category_id')
            then 64
          when v_key = 'note' then 8192
          when v_key in ('effective_at', 'created_at') then 256
          else 1024
        end;
      end if;
      v_text := v_value #>> '{}';
      if octet_length(v_text) > v_text_limit then
        return false;
      end if;
      v_total_text_bytes := v_total_text_bytes + octet_length(v_text);
      if v_total_text_bytes > 524288 then
        return false;
      end if;
    end loop;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function app_private.sync_staff_catalog_payload_is_safe_v1(
  p_operation text,
  p_payload jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = app_private, pg_catalog, pg_temp
as $$
declare
  v_key text;
  v_value jsonb;
  v_item jsonb;
  v_allowed_keys text[];
  v_numeric_keys text[] := array[
    'purchasePrice', 'retailPrice', 'stockQuantity'
  ];
  v_text text;
  v_limit integer;
begin
  if p_payload is null
    or app_private.sync_jsonb_storage_is_bounded_v1(
      p_payload, 1048576, 0
    ) is not true
    or jsonb_typeof(p_payload) <> 'object' then
    return false;
  end if;
  if p_operation = 'bulk_products' then
    return (select count(*) from jsonb_object_keys(p_payload)) = 1
      and p_payload ? 'rows'
      and app_private.sync_admin_import_rows_are_safe_v1(
        p_payload->'rows', 'products', 500
      ) is true;
  elsif p_operation = 'bulk_prices' then
    return (select count(*) from jsonb_object_keys(p_payload)) = 1
      and p_payload ? 'rows'
      and app_private.sync_admin_import_rows_are_safe_v1(
        p_payload->'rows', 'prices', 1000
      ) is true;
  elsif p_operation = 'product_assignments' then
    if (select count(*) from jsonb_object_keys(p_payload)) > 3
      or not p_payload ? 'productIds'
      or not p_payload ? 'entity'
      or jsonb_typeof(p_payload->'productIds') <> 'array'
      or jsonb_array_length(p_payload->'productIds') not between 1 and 20000
      or jsonb_typeof(p_payload->'entity') <> 'string'
      or coalesce(jsonb_typeof(p_payload->'replacementId'), 'null')
        not in ('string', 'null') then
      return false;
    end if;
    for v_item in select value from jsonb_array_elements(p_payload->'productIds')
    loop
      if jsonb_typeof(v_item) <> 'string'
        or octet_length(v_item #>> '{}') > 64
        or (v_item #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        return false;
      end if;
    end loop;
    return octet_length(p_payload->>'entity') <= 32
      and octet_length(coalesce(p_payload->>'replacementId', '')) <= 64;
  end if;

  v_allowed_keys := case
    when p_operation like 'supplier_%' or p_operation like 'category_%'
      then array['id', 'name']
    when p_operation in ('product_archive', 'product_restore')
      then array['id']
    when p_operation in ('product_create', 'product_update')
      then array[
        'productId', 'barcode', 'itemNumber', 'productName',
        'secondProductName', 'purchasePrice', 'retailPrice',
        'stockQuantity', 'supplierId', 'categoryId'
      ]
    else null
  end;
  if v_allowed_keys is null then
    return false;
  end if;
  for v_key, v_value in select entry.key, entry.value from jsonb_each(p_payload) entry
  loop
    if not v_key = any(v_allowed_keys) then
      return false;
    end if;
    if jsonb_typeof(v_value) = 'null' then
      continue;
    end if;
    if v_key = any(v_numeric_keys) and jsonb_typeof(v_value) = 'number' then
      if v_value < '0'::jsonb or v_value > '1000000000000'::jsonb then
        return false;
      end if;
      continue;
    end if;
    if jsonb_typeof(v_value) <> 'string' then
      return false;
    end if;
    v_text := v_value #>> '{}';
    v_limit := case
      when v_key in ('id', 'productId', 'supplierId', 'categoryId') then 64
      when v_key in ('purchasePrice', 'retailPrice', 'stockQuantity') then 64
      else 2048
    end;
    if octet_length(v_text) > v_limit then
      return false;
    end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function app_private.sync_admin_import_rows_are_safe_v1(
  jsonb, text, integer
) from public, anon, authenticated, service_role;
revoke all on function app_private.sync_staff_catalog_payload_is_safe_v1(
  text, jsonb
) from public, anon, authenticated, service_role;

create or replace function public.shop_catalog_import_products(
  p_shop_id uuid,
  p_products jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_result jsonb;
  v_applied integer;
  v_response_ids jsonb;
  v_event_ids text[];
  v_response_event_ids text[] := array[]::text[];
  v_previous_aggregation text;
begin
  if app_private.sync_admin_import_rows_are_safe_v1(
      p_products, 'products', 500
    ) is not true then
    return app_private.shop_admin_action_result(
      false, 'row_limit_exceeded', p_shop_id
    );
  end if;

  perform app_private.prepare_admin_bulk_changed_ids_v1();
  v_previous_aggregation := current_setting(
    'app_private.admin_bulk_event_aggregation_v1', true
  );
  if v_previous_aggregation = 'on' then
    raise exception 'nested Admin bulk event aggregation is not allowed'
      using errcode = '55000';
  end if;
  perform set_config('app_private.admin_bulk_event_aggregation_v1', 'on', true);
  v_result := app_private.shop_catalog_import_products_pre_task139_v1(
    p_shop_id, p_products
  );
  perform set_config(
    'app_private.admin_bulk_event_aggregation_v1',
    coalesce(v_previous_aggregation, ''),
    true
  );

  v_applied := coalesce((v_result#>>'{payload,productsApplied}')::integer, 0);
  v_response_ids := v_result#>'{payload,productIds}';
  if v_applied < 0
    or (v_applied > 0 and (
      jsonb_typeof(v_response_ids) <> 'array'
      or jsonb_array_length(v_response_ids) <> v_applied
    )) then
    raise exception 'bulk product response cannot prove applied IDs'
      using errcode = '22023';
  end if;

  if v_applied > 0 then
    select array_agg(lower((item.value->>'productId')::uuid::text)
      order by item.ordinality)
    into v_response_event_ids
    from jsonb_array_elements(v_response_ids) with ordinality item(value, ordinality);
  end if;
  if cardinality(v_response_event_ids) <> (
      select count(distinct response_id)::integer
      from unnest(v_response_event_ids) response_id
    ) then
    raise exception 'bulk product response contains duplicate applied IDs'
      using errcode = '22023';
  end if;
  v_event_ids := app_private.read_admin_bulk_changed_ids_v1('catalog');
  if not v_event_ids <@ v_response_event_ids then
    raise exception 'bulk product changed IDs are not proven by the response'
      using errcode = '22023';
  end if;
  if cardinality(v_event_ids) > 0 then
    perform app_private.emit_aggregated_catalog_events_v1(
      'catalog', v_event_ids, 'admin_web'
    );
  end if;
  return v_result;
exception when others then
  perform set_config(
    'app_private.admin_bulk_event_aggregation_v1',
    coalesce(v_previous_aggregation, ''),
    true
  );
  raise;
end;
$$;

revoke all on function public.shop_catalog_import_products(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.shop_catalog_import_products(uuid, jsonb)
  to authenticated;

create or replace function public.shop_catalog_import_price_history(
  p_shop_id uuid,
  p_prices jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_result jsonb;
  v_applied integer;
  v_response_ids jsonb;
  v_event_ids text[];
  v_response_event_ids text[] := array[]::text[];
  v_previous_aggregation text;
begin
  if app_private.sync_admin_import_rows_are_safe_v1(
      p_prices, 'prices', 1000
    ) is not true then
    return app_private.shop_admin_action_result(
      false, 'row_limit_exceeded', p_shop_id
    );
  end if;

  perform app_private.prepare_admin_bulk_changed_ids_v1();
  v_previous_aggregation := current_setting(
    'app_private.admin_bulk_event_aggregation_v1', true
  );
  if v_previous_aggregation = 'on' then
    raise exception 'nested Admin bulk event aggregation is not allowed'
      using errcode = '55000';
  end if;
  perform set_config('app_private.admin_bulk_event_aggregation_v1', 'on', true);
  v_result := app_private.shop_catalog_import_price_history_pre_task139_v1(
    p_shop_id, p_prices
  );
  perform set_config(
    'app_private.admin_bulk_event_aggregation_v1',
    coalesce(v_previous_aggregation, ''),
    true
  );

  v_applied := coalesce((v_result#>>'{payload,priceHistoryApplied}')::integer, 0);
  v_response_ids := v_result#>'{payload,priceIds}';
  if v_applied < 0
    or (v_applied > 0 and (
      jsonb_typeof(v_response_ids) <> 'array'
      or jsonb_array_length(v_response_ids) <> v_applied
    )) then
    raise exception 'bulk price response cannot prove applied IDs'
      using errcode = '22023';
  end if;

  if v_applied > 0 then
    select array_agg(lower((item.value->>'priceId')::uuid::text)
      order by item.ordinality)
    into v_response_event_ids
    from jsonb_array_elements(v_response_ids) with ordinality item(value, ordinality);
  end if;
  if cardinality(v_response_event_ids) <> (
      select count(distinct response_id)::integer
      from unnest(v_response_event_ids) response_id
    ) then
    raise exception 'bulk price response contains duplicate applied IDs'
      using errcode = '22023';
  end if;
  v_event_ids := app_private.read_admin_bulk_changed_ids_v1('prices');
  if not v_event_ids <@ v_response_event_ids then
    raise exception 'bulk price changed IDs are not proven by the response'
      using errcode = '22023';
  end if;
  if cardinality(v_event_ids) > 0 then
    perform app_private.emit_aggregated_catalog_events_v1(
      'prices', v_event_ids, 'admin_web'
    );
  end if;
  return v_result;
exception when others then
  perform set_config(
    'app_private.admin_bulk_event_aggregation_v1',
    coalesce(v_previous_aggregation, ''),
    true
  );
  raise;
end;
$$;

revoke all on function public.shop_catalog_import_price_history(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.shop_catalog_import_price_history(uuid, jsonb)
  to authenticated;

create or replace function public.staff_web_catalog_mutate_v1(
  p_shop_id uuid,
  p_staff_id uuid,
  p_staff_web_session_id uuid,
  p_session_token_hash text,
  p_expected_credential_version integer,
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_result jsonb;
  v_required_permission text;
  v_applied integer;
  v_response_ids jsonb;
  v_event_ids text[];
  v_response_event_ids text[] := array[]::text[];
  v_previous_aggregation text;
  v_is_bulk boolean := p_operation in ('bulk_products', 'bulk_prices');
begin
  if app_private.sync_staff_catalog_payload_is_safe_v1(
      p_operation, p_payload
    ) is not true then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  if p_operation not in (
      'supplier_create', 'supplier_update', 'supplier_archive',
      'category_create', 'category_update', 'category_archive',
      'product_create', 'product_update', 'product_archive', 'product_restore',
      'product_assignments', 'bulk_products', 'bulk_prices'
    ) then
    return app_private.staff_web_catalog_mutate_pre_task139_v1(
      p_shop_id, p_staff_id, p_staff_web_session_id, p_session_token_hash,
      p_expected_credential_version, p_operation, p_payload
    );
  end if;

  v_required_permission := case when v_is_bulk
    then 'catalog.import' else 'catalog.write' end;

  -- Establish the lease outside the implementation's exception-bearing block.
  -- If a row error rolls its subtransaction back, this outer publication
  -- deadline remains available for the structured result + audit boundary.
  if not app_private.staff_web_runtime_lease_is_valid_v1(
    p_shop_id, p_staff_id, p_staff_web_session_id, p_session_token_hash,
    p_expected_credential_version, v_required_permission
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'session_expired', 'shop_id', p_shop_id
    );
  end if;

  begin
    if v_is_bulk then
      perform app_private.prepare_admin_bulk_changed_ids_v1();
      v_previous_aggregation := current_setting(
        'app_private.admin_bulk_event_aggregation_v1', true
      );
      if v_previous_aggregation = 'on' then
        raise exception 'nested Admin bulk event aggregation is not allowed'
          using errcode = '55000';
      end if;
      perform set_config('app_private.admin_bulk_event_aggregation_v1', 'on', true);
    end if;

    v_result := app_private.staff_web_catalog_mutate_pre_task139_v1(
      p_shop_id, p_staff_id, p_staff_web_session_id, p_session_token_hash,
      p_expected_credential_version, p_operation, p_payload
    );

    if v_is_bulk then
      perform set_config(
        'app_private.admin_bulk_event_aggregation_v1',
        coalesce(v_previous_aggregation, ''),
        true
      );
    end if;

    -- Reacquire the exact permission/session lease immediately before event
    -- and result publication. A revoke/version/expiry race rolls back all DML.
    if not app_private.staff_web_runtime_lease_is_valid_v1(
      p_shop_id, p_staff_id, p_staff_web_session_id, p_session_token_hash,
      p_expected_credential_version, v_required_permission
    ) then
      raise exception 'staff web lease expired before catalog publication'
        using errcode = '42501';
    end if;

    if p_operation = 'bulk_products' then
      v_applied := coalesce((v_result#>>'{payload,productsApplied}')::integer, 0);
      v_response_ids := v_result#>'{payload,productIds}';
      if v_applied < 0
        or (v_applied > 0 and (
          jsonb_typeof(v_response_ids) <> 'array'
          or jsonb_array_length(v_response_ids) <> v_applied
        )) then
        raise exception 'staff bulk product response cannot prove applied IDs'
          using errcode = '22023';
      end if;
      if v_applied > 0 then
        select array_agg(lower((item.value->>'productId')::uuid::text)
          order by item.ordinality)
        into v_response_event_ids
        from jsonb_array_elements(v_response_ids) with ordinality item(value, ordinality);
      end if;
      if cardinality(v_response_event_ids) <> (
          select count(distinct response_id)::integer
          from unnest(v_response_event_ids) response_id
        ) then
        raise exception 'staff bulk product response contains duplicate applied IDs'
          using errcode = '22023';
      end if;
      v_event_ids := app_private.read_admin_bulk_changed_ids_v1('catalog');
      if not v_event_ids <@ v_response_event_ids then
        raise exception 'staff bulk product changed IDs are not proven by the response'
          using errcode = '22023';
      end if;
      if cardinality(v_event_ids) > 0 then
        perform app_private.emit_aggregated_catalog_events_v1(
          'catalog', v_event_ids, 'admin_web'
        );
      end if;
    elsif p_operation = 'bulk_prices' then
      v_applied := coalesce((v_result#>>'{payload,priceHistoryApplied}')::integer, 0);
      v_response_ids := v_result#>'{payload,priceIds}';
      if v_applied < 0
        or (v_applied > 0 and (
          jsonb_typeof(v_response_ids) <> 'array'
          or jsonb_array_length(v_response_ids) <> v_applied
        )) then
        raise exception 'staff bulk price response cannot prove applied IDs'
          using errcode = '22023';
      end if;
      if v_applied > 0 then
        select array_agg(lower(item.value#>>'{}')::uuid::text order by item.ordinality)
        into v_response_event_ids
        from jsonb_array_elements(v_response_ids) with ordinality item(value, ordinality);
      end if;
      if cardinality(v_response_event_ids) <> (
          select count(distinct response_id)::integer
          from unnest(v_response_event_ids) response_id
        ) then
        raise exception 'staff bulk price response contains duplicate applied IDs'
          using errcode = '22023';
      end if;
      v_event_ids := app_private.read_admin_bulk_changed_ids_v1('prices');
      if not v_event_ids <@ v_response_event_ids then
        raise exception 'staff bulk price changed IDs are not proven by the response'
          using errcode = '22023';
      end if;
      if cardinality(v_event_ids) > 0 then
        perform app_private.emit_aggregated_catalog_events_v1(
          'prices', v_event_ids, 'admin_web'
        );
      end if;
    end if;

    return v_result;
  exception when insufficient_privilege then
    return jsonb_build_object(
      'ok', false, 'code', 'session_expired', 'shop_id', p_shop_id
    );
  end;
end;
$$;

revoke all on function public.staff_web_catalog_mutate_v1(
  uuid, uuid, uuid, text, integer, text, jsonb
) from public, anon, authenticated;
grant execute on function public.staff_web_catalog_mutate_v1(
  uuid, uuid, uuid, text, integer, text, jsonb
) to service_role;

create or replace function app_private.shop_catalog_admin_summary_v1(
  p_shop_id uuid,
  p_scope_kind text,
  p_mapped_owner_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with products as (
    select product.id, product.deleted_at
    from public.inventory_products product
    where (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
        and product.shop_id = p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and product.shop_id is null and product.owner_user_id = p_mapped_owner_id)
  ), suppliers as (
    select supplier.id
    from public.inventory_suppliers supplier
    where supplier.deleted_at is null and (
      (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
        and supplier.shop_id = p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and supplier.shop_id is null and supplier.owner_user_id = p_mapped_owner_id)
    )
  ), categories as (
    select category.id
    from public.inventory_categories category
    where category.deleted_at is null and (
      (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
        and category.shop_id = p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and category.shop_id is null and category.owner_user_id = p_mapped_owner_id)
    )
  ), prices as (
    select price.id
    from public.inventory_product_prices price
    where (
      (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
        and price.shop_id = p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and price.shop_id is null and price.owner_user_id = p_mapped_owner_id)
    ) and exists (select 1 from products product where product.id = price.product_id)
  )
  select jsonb_build_object(
    'activeProducts', (select count(*) from products where deleted_at is null),
    'archivedProducts', (select count(*) from products where deleted_at is not null),
    'productsTotal', (select count(*) from products),
    'suppliers', (select count(*) from suppliers),
    'categories', (select count(*) from categories),
    'priceRows', (select count(*) from prices)
  );
$$;

revoke all on function app_private.shop_catalog_admin_summary_v1(uuid, text, uuid)
  from public, anon, authenticated, service_role;

-- Workbook export is intentionally much smaller than the general recovery
-- envelope. Limit each source before aggregating so an oversized catalog
-- fails closed after bounded work and before any workbook row is materialized.
create or replace function app_private.shop_catalog_workbook_preflight_v1(
  p_shop_id uuid,
  p_scope_kind text,
  p_mapped_owner_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with products as materialized (
    select product.id, product.deleted_at, product.barcode,
      product.item_number, product.product_name, product.second_product_name
    from public.inventory_products product
    where (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
        and product.shop_id = p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and product.shop_id is null and product.owner_user_id = p_mapped_owner_id)
    order by product.id
    limit 2001
  ), suppliers as materialized (
    select supplier.id, supplier.name
    from public.inventory_suppliers supplier
    where supplier.deleted_at is null and (
      (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
        and supplier.shop_id = p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and supplier.shop_id is null and supplier.owner_user_id = p_mapped_owner_id)
    )
    order by supplier.id
    limit 501
  ), categories as materialized (
    select category.id, category.name
    from public.inventory_categories category
    where category.deleted_at is null and (
      (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
        and category.shop_id = p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and category.shop_id is null and category.owner_user_id = p_mapped_owner_id)
    )
    order by category.id
    limit 501
  ), prices as materialized (
    select price.id, price.type, price.effective_at, price.source, price.note
    from public.inventory_product_prices price
    where (
      (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
        and price.shop_id = p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and price.shop_id is null and price.owner_user_id = p_mapped_owner_id)
    ) and exists (
      select 1
      from public.inventory_products product
      where product.id = price.product_id and (
        (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
          and product.shop_id = p_shop_id)
        or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
          and product.shop_id is null
          and product.owner_user_id = p_mapped_owner_id)
      )
    )
    order by price.id
    limit 2501
  ), product_stats as (
    select count(*) as row_count,
      count(*) filter (where deleted_at is null) as active_count,
      count(*) filter (where deleted_at is not null) as archived_count,
      coalesce(sum(
        octet_length(barcode)
        + coalesce(octet_length(item_number), 0)
        + coalesce(octet_length(product_name), 0)
        + coalesce(octet_length(second_product_name), 0)
      ), 0) as text_bytes
    from products
  ), supplier_stats as (
    select count(*) as row_count,
      coalesce(sum(octet_length(name)), 0) as text_bytes
    from suppliers
  ), category_stats as (
    select count(*) as row_count,
      coalesce(sum(octet_length(name)), 0) as text_bytes
    from categories
  ), price_stats as (
    select count(*) as row_count,
      coalesce(sum(
        octet_length(type)
        + octet_length(effective_at)
        + coalesce(octet_length(source), 0)
        + coalesce(octet_length(note), 0)
      ), 0) as text_bytes
    from prices
  )
  select jsonb_build_object(
    'activeProducts', product_stats.active_count,
    'archivedProducts', product_stats.archived_count,
    'productsTotal', product_stats.row_count,
    'suppliers', supplier_stats.row_count,
    'categories', category_stats.row_count,
    'priceRows', price_stats.row_count,
    'workbookTextBytes',
      product_stats.text_bytes + supplier_stats.text_bytes
      + category_stats.text_bytes + price_stats.text_bytes
  )
  from product_stats, supplier_stats, category_stats, price_stats;
$$;

revoke all on function app_private.shop_catalog_workbook_preflight_v1(
  uuid, text, uuid
) from public, anon, authenticated, service_role;

create or replace function app_private.sync_catalog_admin_read_request_is_safe_v1(
  p_operation text,
  p_request jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = app_private, pg_catalog, pg_temp
as $$
declare
  v_key text;
  v_value jsonb;
  v_item jsonb;
  v_allowed_keys text[] := array[
    'expectedRevision', 'includeSummary', 'includeExactTotal', 'limit',
    'offset', 'afterId', 'categoryId', 'supplierId', 'productId', 'state',
    'query', 'entity', 'codes', 'expectedScopeKey'
  ];
  v_text text;
begin
  if p_request is null
    or app_private.sync_jsonb_storage_is_bounded_v1(
      p_request, 65536, 0
    ) is not true
    or jsonb_typeof(p_request) <> 'object' then
    return false;
  end if;
  for v_key, v_value in select entry.key, entry.value from jsonb_each(p_request) entry
  loop
    if not v_key = any(v_allowed_keys) then return false; end if;
    if v_key in ('includeSummary', 'includeExactTotal') then
      if jsonb_typeof(v_value) <> 'boolean' then return false; end if;
      continue;
    elsif v_key in ('limit', 'offset') then
      if jsonb_typeof(v_value) = 'number' then
        if v_value < '0'::jsonb or v_value > '1000000'::jsonb then
          return false;
        end if;
      elsif jsonb_typeof(v_value) = 'string' then
        v_text := v_value #>> '{}';
        if v_text !~ '^[0-9]{1,7}$' then return false; end if;
      else
        return false;
      end if;
      continue;
    elsif v_key = 'codes' then
      if p_operation <> 'products_by_codes'
        or jsonb_typeof(v_value) <> 'array'
        or jsonb_array_length(v_value) > 40 then
        return false;
      end if;
      for v_item in select value from jsonb_array_elements(v_value)
      loop
        if jsonb_typeof(v_item) <> 'string'
          or octet_length(v_item #>> '{}') > 256 then
          return false;
        end if;
      end loop;
      continue;
    end if;
    if jsonb_typeof(v_value) <> 'string' then return false; end if;
    v_text := v_value #>> '{}';
    if octet_length(v_text) >
      (case when v_key = 'query' then 160 else 256 end) then
      return false;
    end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function app_private.sync_catalog_admin_read_request_is_safe_v1(
  text, jsonb
) from public, anon, authenticated, service_role;

-- Stateless Admin reads cannot assume that historical NOT VALID rows satisfy
-- the new response envelope.  Scan only fixed scalar columns under the shared
-- catalog-revision lock before any lower()/sort/JSON operation.  New writes
-- are protected by the CHECKs; this guard preserves fail-closed compatibility
-- until those historical constraints can be validated in a controlled lane.
create or replace function app_private.sync_catalog_admin_domain_is_safe_v1(
  p_shop_id uuid,
  p_scope_kind text,
  p_mapped_owner_id uuid,
  p_domain text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_count bigint := 0;
  v_bytes bigint := 0;
  v_invalid boolean := false;
begin
  if p_domain = 'suppliers' then
    select count(*) into v_count from (
      select 1 from public.inventory_suppliers row
      where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
          and row.shop_id=p_shop_id)
        or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
          and row.shop_id is null and row.owner_user_id=p_mapped_owner_id)
      limit 25001
    ) bounded;
    if v_count>25000 then return false; end if;
    select count(*), coalesce(sum(octet_length(row.name)),0), coalesce(bool_or(
      app_private.sync_supplier_storage_is_bounded_v1(row.name) is not true
      or not pg_catalog.isfinite(row.updated_at)
      or (row.deleted_at is not null and not pg_catalog.isfinite(row.deleted_at))
    ),false)
    into v_count,v_bytes,v_invalid
    from public.inventory_suppliers row
    where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_mapped_owner_id);
    return v_invalid is false and v_count<=25000 and v_bytes<=33554432;
  elsif p_domain = 'categories' then
    select count(*) into v_count from (
      select 1 from public.inventory_categories row
      where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
          and row.shop_id=p_shop_id)
        or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
          and row.shop_id is null and row.owner_user_id=p_mapped_owner_id)
      limit 25001
    ) bounded;
    if v_count>25000 then return false; end if;
    select count(*), coalesce(sum(octet_length(row.name)),0), coalesce(bool_or(
      app_private.sync_category_storage_is_bounded_v1(row.name) is not true
      or not pg_catalog.isfinite(row.updated_at)
      or (row.deleted_at is not null and not pg_catalog.isfinite(row.deleted_at))
    ),false)
    into v_count,v_bytes,v_invalid
    from public.inventory_categories row
    where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_mapped_owner_id);
    return v_invalid is false and v_count<=25000 and v_bytes<=33554432;
  elsif p_domain = 'products' then
    select count(*) into v_count from (
      select 1 from public.inventory_products row
      where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
          and row.shop_id=p_shop_id)
        or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
          and row.shop_id is null and row.owner_user_id=p_mapped_owner_id)
      limit 125001
    ) bounded;
    if v_count>125000 then return false; end if;
    select count(*), coalesce(sum(
      octet_length(row.barcode)+coalesce(octet_length(row.item_number),0)
      +coalesce(octet_length(row.product_name),0)
      +coalesce(octet_length(row.second_product_name),0)
    ),0), coalesce(bool_or(
      app_private.sync_product_storage_is_bounded_v1(
        row.barcode,row.item_number,row.product_name,row.second_product_name
      ) is not true
      or not pg_catalog.isfinite(row.updated_at)
      or (row.deleted_at is not null and not pg_catalog.isfinite(row.deleted_at))
      or (row.primary_image_updated_at is not null
        and not pg_catalog.isfinite(row.primary_image_updated_at))
      or app_private.sync_product_number_is_materializable_v1(
        row.purchase_price
      ) is not true
      or app_private.sync_product_number_is_materializable_v1(
        row.retail_price
      ) is not true
      or app_private.sync_product_number_is_materializable_v1(
        row.stock_quantity
      ) is not true
    ),false)
    into v_count,v_bytes,v_invalid
    from public.inventory_products row
    where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_mapped_owner_id);
    return v_invalid is false and v_count<=125000 and v_bytes<=268435456;
  elsif p_domain = 'prices' then
    select count(*) into v_count from (
      select 1 from public.inventory_product_prices row
      where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
          and row.shop_id=p_shop_id)
        or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
          and row.shop_id is null and row.owner_user_id=p_mapped_owner_id)
      limit 175001
    ) bounded;
    if v_count>175000 then return false; end if;
    select count(*), coalesce(sum(
      octet_length(row.type)+octet_length(row.effective_at)
      +coalesce(octet_length(row.source),0)+coalesce(octet_length(row.note),0)
      +octet_length(row.created_at)
    ),0), coalesce(bool_or(case
      when app_private.sync_price_storage_is_bounded_v1(
        row.type,row.effective_at,row.source,row.note,row.created_at
      ) is not true then true
      else not pg_catalog.isfinite(row.updated_at)
        or app_private.sync_price_value_is_canonical_v1(row.price) is not true
        or app_private.sync_legacy_timestamp_is_canonical_v1(
          row.effective_at
        ) is not true
        or app_private.sync_legacy_timestamp_is_canonical_v1(
          row.created_at
        ) is not true
    end),false)
    into v_count,v_bytes,v_invalid
    from public.inventory_product_prices row
    where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_mapped_owner_id);
    return v_invalid is false and v_count<=175000 and v_bytes<=268435456;
  end if;
  return false;
exception when others then
  return false;
end;
$$;

revoke all on function app_private.sync_catalog_admin_domain_is_safe_v1(
  uuid,text,uuid,text
) from public,anon,authenticated,service_role;

create or replace function public.shop_catalog_admin_read_v1(
  p_shop_id uuid,
  p_operation text,
  p_request jsonb default '{}'::jsonb,
  p_staff_id uuid default null,
  p_staff_web_session_id uuid default null,
  p_session_token_hash text default null,
  p_expected_credential_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_scope record;
  v_mapping public.shop_inventory_sources%rowtype;
  v_scope_key text;
  v_scope_json jsonb;
  v_summary jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_result jsonb;
  v_pagination jsonb := '{}'::jsonb;
  v_limit integer;
  v_offset integer;
  v_state text;
  v_query text;
  v_entity text;
  v_after_id uuid;
  v_category_id uuid;
  v_supplier_id uuid;
  v_product_id uuid;
  v_total bigint := 0;
  v_has_more boolean := false;
  v_codes text[];
  v_revision bigint := 0;
  v_expected_revision bigint;
  v_include_summary boolean := false;
  v_include_exact_total boolean := false;
  v_required_permission text;
begin
  if p_shop_id is null
    or p_operation not in (
      'products_page', 'entity_page', 'options', 'product_detail',
      'products_by_codes', 'snapshot_page'
    )
    or app_private.sync_catalog_admin_read_request_is_safe_v1(
      p_operation, p_request
    ) is not true then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  v_required_permission := case
    when p_operation = 'snapshot_page' then 'catalog.export'
    else 'catalog.read'
  end;

  if p_staff_id is null then
    if p_staff_web_session_id is not null or p_session_token_hash is not null
      or p_expected_credential_version is not null
      or not exists (
        select 1 from public.shop_members member
        join public.shops shop on shop.shop_id = member.shop_id
        where member.profile_id = auth.uid() and member.shop_id = p_shop_id
          and member.membership_status = 'active'
          and member.role_key in ('shop_owner', 'shop_manager', 'viewer')
          and shop.shop_status = 'active'
      ) then
      return jsonb_build_object('ok', false, 'code', 'permission_denied');
    end if;
  elsif not app_private.staff_web_runtime_lease_is_valid_v1(
    p_shop_id, p_staff_id, p_staff_web_session_id, p_session_token_hash,
    p_expected_credential_version, v_required_permission
  ) then
    return jsonb_build_object('ok', false, 'code', 'session_expired');
  end if;

  -- Catalog and mapping triggers update this row in the same transaction as
  -- every invariant-changing DML. Hold a shared lock before resolving scope,
  -- preflighting legacy rows and serializing the response.
  insert into app_private.pos_catalog_revisions(shop_id,revision,changed_at)
  values(p_shop_id,0,statement_timestamp())
  on conflict (shop_id) do nothing;
  select revision
  into v_revision
  from app_private.pos_catalog_revisions
  where shop_id = p_shop_id
  for share;
  v_revision := coalesce(v_revision, 0);

  select * into v_scope
  from app_private.resolve_shop_catalog_scope_service_v1(p_shop_id);
  if v_scope.owner_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'unauthorized_or_unmapped');
  end if;
  select source.* into v_mapping
  from public.shop_inventory_sources source
  where source.shop_id = p_shop_id
    and source.source_kind = 'mobile_owner'
    and source.mapping_state = 'mapped'
    and source.owner_user_id is not null
    and source.verified_at is not null
    and source.disabled_at is null
  order by source.created_at desc limit 1;
  v_scope_key := app_private.sync_checkpoint_sha256(
    lower(p_shop_id::text) || ':' || v_scope.catalog_scope || ':' ||
    coalesce(lower(v_mapping.owner_user_id::text), '-') || ':' ||
    coalesce(lower(v_mapping.shop_inventory_source_id::text), '-') || ':' ||
    app_private.sync_checkpoint_timestamp(v_mapping.verified_at)
  );
  v_scope_json := jsonb_build_object(
    'kind', v_scope.catalog_scope,
    'key', v_scope_key,
    'legacyOwnerUserId', case when v_scope.catalog_scope in (
      'legacy_owner_bridge', 'authorized_shop_plus_legacy'
    ) then v_mapping.owner_user_id else null end,
    'mapping', case when v_mapping.shop_inventory_source_id is null then null
      else jsonb_build_object(
        'id', v_mapping.shop_inventory_source_id,
        'ownerUserId', v_mapping.owner_user_id,
        'state', v_mapping.mapping_state,
        'kind', v_mapping.source_kind,
        'verifiedAt', app_private.sync_checkpoint_json_timestamp(v_mapping.verified_at)
      ) end
  );

  if p_request ? 'expectedRevision' then
    if coalesce(p_request->>'expectedRevision', '') !~ '^(0|[1-9][0-9]{0,18})$' then
      return jsonb_build_object('ok', false, 'code', 'validation_failed');
    end if;
    begin
      v_expected_revision := (p_request->>'expectedRevision')::bigint;
    exception when numeric_value_out_of_range then
      return jsonb_build_object('ok', false, 'code', 'validation_failed');
    end;
    if v_expected_revision <> v_revision then
      return jsonb_build_object(
        'ok', false, 'code', 'snapshot_changed', 'shopId', p_shop_id,
        'operation', p_operation, 'scope', v_scope_json,
        'revision', v_revision::text
      );
    end if;
  end if;

  begin
    v_include_summary := coalesce((p_request->>'includeSummary')::boolean, false);
    v_include_exact_total := coalesce((p_request->>'includeExactTotal')::boolean, false);
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end;

  begin
    v_limit := coalesce((p_request->>'limit')::integer, 100);
    v_offset := coalesce((p_request->>'offset')::integer, 0);
    v_after_id := nullif(p_request->>'afterId', '')::uuid;
    v_category_id := nullif(p_request->>'categoryId', '')::uuid;
    v_supplier_id := nullif(p_request->>'supplierId', '')::uuid;
    v_product_id := nullif(p_request->>'productId', '')::uuid;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end;
  v_entity := nullif(p_request->>'entity', '');
  v_limit := least(greatest(v_limit, 1), case
    when p_operation = 'snapshot_page' and v_entity = 'products' then 60
    when p_operation = 'snapshot_page' and v_entity = 'prices' then 120
    when p_operation = 'snapshot_page' then 240
    when p_operation = 'products_page' then 60
    else 200
  end);
  if v_offset < 0 or v_offset > 1000000 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  v_state := coalesce(nullif(p_request->>'state', ''), 'all');
  if v_state not in ('active', 'archived', 'all') then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  v_query := lower(btrim(coalesce(p_request->>'query', '')));
  if octet_length(v_query) > 160 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  -- A summary (including the snapshot manifest) scans every catalog domain.
  -- Prove all four bounded domains safe before executing any full aggregate;
  -- legacy oversized rows must fail closed without first materializing them.
  if p_operation = 'snapshot_page' and v_entity = 'manifest' then
    if app_private.sync_catalog_admin_domain_is_safe_v1(
        p_shop_id,v_scope.catalog_scope,v_mapping.owner_user_id,'suppliers'
      ) is not true
      or app_private.sync_catalog_admin_domain_is_safe_v1(
        p_shop_id,v_scope.catalog_scope,v_mapping.owner_user_id,'categories'
      ) is not true
      or app_private.sync_catalog_admin_domain_is_safe_v1(
        p_shop_id,v_scope.catalog_scope,v_mapping.owner_user_id,'products'
      ) is not true
      or app_private.sync_catalog_admin_domain_is_safe_v1(
        p_shop_id,v_scope.catalog_scope,v_mapping.owner_user_id,'prices'
      ) is not true then
      return jsonb_build_object('ok',false,'code','resource_exceeded',
        'shopId',p_shop_id,'operation',p_operation,'scope',v_scope_json,
        'revision',v_revision::text);
    end if;
    v_summary := app_private.shop_catalog_workbook_preflight_v1(
      p_shop_id, v_scope.catalog_scope, v_mapping.owner_user_id
    );
    if v_summary is null then
      return jsonb_build_object('ok',false,'code','resource_exceeded',
        'shopId',p_shop_id,'operation',p_operation,'scope',v_scope_json,
        'revision',v_revision::text);
    end if;
  elsif v_include_summary then
    if app_private.sync_catalog_admin_domain_is_safe_v1(
        p_shop_id,v_scope.catalog_scope,v_mapping.owner_user_id,'suppliers'
      ) is not true
      or app_private.sync_catalog_admin_domain_is_safe_v1(
        p_shop_id,v_scope.catalog_scope,v_mapping.owner_user_id,'categories'
      ) is not true
      or app_private.sync_catalog_admin_domain_is_safe_v1(
        p_shop_id,v_scope.catalog_scope,v_mapping.owner_user_id,'products'
      ) is not true
      or app_private.sync_catalog_admin_domain_is_safe_v1(
        p_shop_id,v_scope.catalog_scope,v_mapping.owner_user_id,'prices'
      ) is not true then
      return jsonb_build_object('ok',false,'code','resource_exceeded',
        'shopId',p_shop_id,'operation',p_operation,'scope',v_scope_json,
        'revision',v_revision::text);
    end if;
  end if;

  if v_include_summary and v_summary is null then
    v_summary := app_private.shop_catalog_admin_summary_v1(
      p_shop_id, v_scope.catalog_scope, v_mapping.owner_user_id
    );
  end if;

  if p_operation in ('products_page','products_by_codes') then
    if app_private.sync_catalog_admin_domain_is_safe_v1(
        p_shop_id,v_scope.catalog_scope,v_mapping.owner_user_id,'products'
      ) is not true then
      return jsonb_build_object('ok',false,'code','resource_exceeded',
        'shopId',p_shop_id,'operation',p_operation,'scope',v_scope_json,
        'revision',v_revision::text);
    end if;
  elsif p_operation = 'entity_page' then
    if v_entity not in ('category','supplier') then
      return jsonb_build_object('ok',false,'code','validation_failed');
    end if;
    if app_private.sync_catalog_admin_domain_is_safe_v1(
        p_shop_id,v_scope.catalog_scope,v_mapping.owner_user_id,
        case when v_entity='category' then 'categories' else 'suppliers' end
      ) is not true then
      return jsonb_build_object('ok',false,'code','resource_exceeded',
        'shopId',p_shop_id,'operation',p_operation,'scope',v_scope_json,
        'revision',v_revision::text);
    end if;
  elsif p_operation = 'options' then
    if app_private.sync_catalog_admin_domain_is_safe_v1(
        p_shop_id,v_scope.catalog_scope,v_mapping.owner_user_id,'categories'
      ) is not true
      or app_private.sync_catalog_admin_domain_is_safe_v1(
        p_shop_id,v_scope.catalog_scope,v_mapping.owner_user_id,'suppliers'
      ) is not true then
      return jsonb_build_object('ok',false,'code','resource_exceeded',
        'shopId',p_shop_id,'operation',p_operation,'scope',v_scope_json,
        'revision',v_revision::text);
    end if;
  elsif p_operation = 'product_detail' then
    if app_private.sync_catalog_admin_domain_is_safe_v1(
        p_shop_id,v_scope.catalog_scope,v_mapping.owner_user_id,'products'
      ) is not true
      or app_private.sync_catalog_admin_domain_is_safe_v1(
        p_shop_id,v_scope.catalog_scope,v_mapping.owner_user_id,'categories'
      ) is not true
      or app_private.sync_catalog_admin_domain_is_safe_v1(
        p_shop_id,v_scope.catalog_scope,v_mapping.owner_user_id,'suppliers'
      ) is not true
      or app_private.sync_catalog_admin_domain_is_safe_v1(
        p_shop_id,v_scope.catalog_scope,v_mapping.owner_user_id,'prices'
      ) is not true then
      return jsonb_build_object('ok',false,'code','resource_exceeded',
        'shopId',p_shop_id,'operation',p_operation,'scope',v_scope_json,
        'revision',v_revision::text);
    end if;
  elsif p_operation = 'snapshot_page' and v_entity <> 'manifest' then
    if v_entity not in ('products','suppliers','categories','prices') then
      return jsonb_build_object('ok',false,'code','validation_failed');
    end if;
    if app_private.sync_catalog_admin_domain_is_safe_v1(
        p_shop_id,v_scope.catalog_scope,v_mapping.owner_user_id,v_entity
      ) is not true then
      return jsonb_build_object('ok',false,'code','resource_exceeded',
        'shopId',p_shop_id,'operation',p_operation,'scope',v_scope_json,
        'revision',v_revision::text);
    end if;
  end if;
  if p_operation = 'products_page' then
    if v_include_exact_total then
      select count(*) into v_total
      from public.inventory_products product
      where ((v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and product.shop_id=p_shop_id)
        or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
          and product.shop_id is null and product.owner_user_id=v_mapping.owner_user_id))
        and (v_state='all' or (v_state='active' and product.deleted_at is null)
          or (v_state='archived' and product.deleted_at is not null))
        and (v_category_id is null or product.category_id=v_category_id)
        and (v_supplier_id is null or product.supplier_id=v_supplier_id)
        and (v_query='' or lower(coalesce(product.product_name,'')) like '%'||v_query||'%'
          or lower(coalesce(product.second_product_name,'')) like '%'||v_query||'%'
          or lower(product.barcode) like '%'||v_query||'%'
          or lower(coalesce(product.item_number,'')) like '%'||v_query||'%');
    else
      v_total := null;
    end if;
    if exists (
      select 1 from (
        select product.* from public.inventory_products product
        where ((v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and product.shop_id=p_shop_id)
          or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
            and product.shop_id is null and product.owner_user_id=v_mapping.owner_user_id))
          and (v_state='all' or (v_state='active' and product.deleted_at is null)
            or (v_state='archived' and product.deleted_at is not null))
          and (v_category_id is null or product.category_id=v_category_id)
          and (v_supplier_id is null or product.supplier_id=v_supplier_id)
          and (v_query='' or lower(coalesce(product.product_name,'')) like '%'||v_query||'%'
            or lower(coalesce(product.second_product_name,'')) like '%'||v_query||'%'
            or lower(product.barcode) like '%'||v_query||'%'
            or lower(coalesce(product.item_number,'')) like '%'||v_query||'%')
        order by case when v_state='archived' then product.deleted_at
          else product.updated_at end desc, product.id
        offset v_offset limit v_limit+1
      ) product
      where app_private.sync_product_recovery_row_fits_v1(
        product.id,product.owner_user_id,product.barcode,product.item_number,
        product.product_name,product.second_product_name,product.purchase_price,
        product.retail_price,product.supplier_id,product.category_id,
        product.stock_quantity,product.updated_at,product.deleted_at,
        product.shop_id,product.primary_image_version_id,
        product.primary_image_updated_at
      ) is not true
    ) then
      return jsonb_build_object('ok',false,'code','resource_exceeded',
        'shopId',p_shop_id,'operation',p_operation,'scope',v_scope_json,
        'revision',v_revision::text);
    end if;
    with candidates as (
      select product.* from public.inventory_products product
      where ((v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and product.shop_id=p_shop_id)
        or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
          and product.shop_id is null and product.owner_user_id=v_mapping.owner_user_id))
        and (v_state='all' or (v_state='active' and product.deleted_at is null)
          or (v_state='archived' and product.deleted_at is not null))
        and (v_category_id is null or product.category_id=v_category_id)
        and (v_supplier_id is null or product.supplier_id=v_supplier_id)
        and (v_query='' or lower(coalesce(product.product_name,'')) like '%'||v_query||'%'
          or lower(coalesce(product.second_product_name,'')) like '%'||v_query||'%'
          or lower(product.barcode) like '%'||v_query||'%'
          or lower(coalesce(product.item_number,'')) like '%'||v_query||'%')
      order by
        case when v_state = 'archived' then product.deleted_at
          else product.updated_at end desc,
        product.id
      offset v_offset limit v_limit + 1
    ), numbered as (
      select candidates.*,
        row_number() over (
          order by
            case when v_state = 'archived' then deleted_at else updated_at end desc,
            id
        ) as ordinal
      from candidates
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'barcode', barcode, 'item_number', item_number,
      'product_name', product_name, 'second_product_name', second_product_name,
      'purchase_price', purchase_price, 'retail_price', retail_price,
      'stock_quantity', stock_quantity, 'supplier_id', supplier_id,
      'category_id', category_id, 'deleted_at', deleted_at,
      'updated_at', updated_at, 'primary_image_version_id', primary_image_version_id,
      'primary_image_updated_at', primary_image_updated_at
    ) order by
      case when v_state = 'archived' then deleted_at else updated_at end desc,
      id)
      filter (where ordinal <= v_limit), '[]'::jsonb),
      v_total,
      count(*) > v_limit
    into v_rows, v_total, v_has_more
    from numbered page;
    v_pagination := jsonb_build_object(
      'offset', v_offset, 'limit', v_limit, 'totalCount', v_total,
      'hasMore', v_has_more
    );
  elsif p_operation = 'entity_page' then
    if v_entity not in ('category','supplier') then
      return jsonb_build_object('ok', false, 'code', 'validation_failed');
    end if;
    if v_entity = 'category' then
      if v_include_exact_total then
        select count(*) into v_total
        from public.inventory_categories category
        where ((v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and category.shop_id=p_shop_id)
          or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
            and category.shop_id is null and category.owner_user_id=v_mapping.owner_user_id))
          and (v_state='all' or (v_state='active' and category.deleted_at is null)
            or (v_state='archived' and category.deleted_at is not null))
          and (v_query='' or lower(category.name) like '%'||v_query||'%');
      else
        v_total := null;
      end if;
      if exists (
        select 1 from (
          select category.* from public.inventory_categories category
          where ((v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and category.shop_id=p_shop_id)
            or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
              and category.shop_id is null and category.owner_user_id=v_mapping.owner_user_id))
            and (v_state='all' or (v_state='active' and category.deleted_at is null)
              or (v_state='archived' and category.deleted_at is not null))
            and (v_query='' or lower(category.name) like '%'||v_query||'%')
          order by lower(category.name),category.id
          offset v_offset limit v_limit+1
        ) category
        where app_private.sync_category_recovery_row_fits_v1(
          category.id,category.owner_user_id,category.name,category.updated_at,
          category.deleted_at,category.shop_id
        ) is not true
      ) then
        return jsonb_build_object('ok',false,'code','resource_exceeded',
          'shopId',p_shop_id,'operation',p_operation,'scope',v_scope_json,
          'revision',v_revision::text);
      end if;
      with candidates as (
        select category.* from public.inventory_categories category
        where ((v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and category.shop_id=p_shop_id)
          or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
            and category.shop_id is null and category.owner_user_id=v_mapping.owner_user_id))
          and (v_state='all' or (v_state='active' and category.deleted_at is null)
            or (v_state='archived' and category.deleted_at is not null))
          and (v_query='' or lower(category.name) like '%'||v_query||'%')
        order by lower(name), id
        offset v_offset limit v_limit + 1
      ), numbered as (
        select candidates.*,
          row_number() over (order by lower(name), id) ordinal
        from candidates
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', row.id, 'name', row.name, 'deleted_at', row.deleted_at,
        'updated_at', row.updated_at, 'active_products_count', (
          select count(*) from public.inventory_products product
          where product.category_id=row.id and product.deleted_at is null and (
            (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and product.shop_id=p_shop_id)
            or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
              and product.shop_id is null and product.owner_user_id=v_mapping.owner_user_id)
          )
        )
      ) order by lower(row.name),row.id)
        filter(where ordinal<=v_limit),'[]'::jsonb),
        v_total,
        count(*)>v_limit
      into v_rows,v_total,v_has_more
      from numbered row;
    else
      if v_include_exact_total then
        select count(*) into v_total
        from public.inventory_suppliers supplier
        where ((v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and supplier.shop_id=p_shop_id)
          or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
            and supplier.shop_id is null and supplier.owner_user_id=v_mapping.owner_user_id))
          and (v_state='all' or (v_state='active' and supplier.deleted_at is null)
            or (v_state='archived' and supplier.deleted_at is not null))
          and (v_query='' or lower(supplier.name) like '%'||v_query||'%');
      else
        v_total := null;
      end if;
      if exists (
        select 1 from (
          select supplier.* from public.inventory_suppliers supplier
          where ((v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and supplier.shop_id=p_shop_id)
            or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
              and supplier.shop_id is null and supplier.owner_user_id=v_mapping.owner_user_id))
            and (v_state='all' or (v_state='active' and supplier.deleted_at is null)
              or (v_state='archived' and supplier.deleted_at is not null))
            and (v_query='' or lower(supplier.name) like '%'||v_query||'%')
          order by lower(supplier.name),supplier.id
          offset v_offset limit v_limit+1
        ) supplier
        where app_private.sync_supplier_recovery_row_fits_v1(
          supplier.id,supplier.owner_user_id,supplier.name,supplier.updated_at,
          supplier.deleted_at,supplier.shop_id
        ) is not true
      ) then
        return jsonb_build_object('ok',false,'code','resource_exceeded',
          'shopId',p_shop_id,'operation',p_operation,'scope',v_scope_json,
          'revision',v_revision::text);
      end if;
      with candidates as (
        select supplier.* from public.inventory_suppliers supplier
        where ((v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and supplier.shop_id=p_shop_id)
          or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
            and supplier.shop_id is null and supplier.owner_user_id=v_mapping.owner_user_id))
          and (v_state='all' or (v_state='active' and supplier.deleted_at is null)
            or (v_state='archived' and supplier.deleted_at is not null))
          and (v_query='' or lower(supplier.name) like '%'||v_query||'%')
        order by lower(name), id
        offset v_offset limit v_limit+1
      ), numbered as (
        select candidates.*,
          row_number() over (order by lower(name), id) ordinal
        from candidates
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',row.id,'name',row.name,'deleted_at',row.deleted_at,
        'updated_at',row.updated_at,'active_products_count',(
          select count(*) from public.inventory_products product
          where product.supplier_id=row.id and product.deleted_at is null and (
            (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and product.shop_id=p_shop_id)
            or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
              and product.shop_id is null and product.owner_user_id=v_mapping.owner_user_id)
          )
        )
      ) order by lower(row.name),row.id)
        filter(where ordinal<=v_limit),'[]'::jsonb),
        v_total,
        count(*)>v_limit
      into v_rows,v_total,v_has_more
      from numbered row;
    end if;
    v_pagination := jsonb_build_object('offset',v_offset,'limit',v_limit,
      'totalCount',v_total,'hasMore',v_has_more);
  elsif p_operation = 'options' then
    if exists (
      select 1 from (
        select category.* from public.inventory_categories category
        where category.deleted_at is null and (
          (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and category.shop_id=p_shop_id)
          or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
            and category.shop_id is null and category.owner_user_id=v_mapping.owner_user_id)
        ) order by lower(category.name),category.id limit 116
      ) category
      where app_private.sync_category_recovery_row_fits_v1(
        category.id,category.owner_user_id,category.name,category.updated_at,
        category.deleted_at,category.shop_id
      ) is not true
    ) or exists (
      select 1 from (
        select supplier.* from public.inventory_suppliers supplier
        where supplier.deleted_at is null and (
          (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and supplier.shop_id=p_shop_id)
          or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
            and supplier.shop_id is null and supplier.owner_user_id=v_mapping.owner_user_id)
        ) order by lower(supplier.name),supplier.id limit 116
      ) supplier
      where app_private.sync_supplier_recovery_row_fits_v1(
        supplier.id,supplier.owner_user_id,supplier.name,supplier.updated_at,
        supplier.deleted_at,supplier.shop_id
      ) is not true
    ) then
      return jsonb_build_object('ok',false,'code','resource_exceeded',
        'shopId',p_shop_id,'operation',p_operation,'scope',v_scope_json,
        'revision',v_revision::text);
    end if;
    with categories as (
      select category.* from public.inventory_categories category
      where category.deleted_at is null and (
        (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and category.shop_id=p_shop_id)
        or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
          and category.shop_id is null and category.owner_user_id=v_mapping.owner_user_id)
      ) order by lower(category.name),category.id limit 116
    ), suppliers as (
      select supplier.* from public.inventory_suppliers supplier
      where supplier.deleted_at is null and (
        (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and supplier.shop_id=p_shop_id)
        or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
          and supplier.shop_id is null and supplier.owner_user_id=v_mapping.owner_user_id)
      ) order by lower(supplier.name),supplier.id limit 116
    ) select jsonb_build_object(
      'categories',coalesce((select jsonb_agg(jsonb_build_object(
        'id',category.id,'name',category.name,'deleted_at',category.deleted_at,
        'updated_at',category.updated_at,'active_products_count',0
      ) order by lower(category.name),category.id) from categories category),'[]'::jsonb),
      'suppliers',coalesce((select jsonb_agg(jsonb_build_object(
        'id',supplier.id,'name',supplier.name,'deleted_at',supplier.deleted_at,
        'updated_at',supplier.updated_at,'active_products_count',0
      ) order by lower(supplier.name),supplier.id) from suppliers supplier),'[]'::jsonb)
    ) into v_rows;
    if jsonb_array_length(v_rows->'categories') > 115
      or jsonb_array_length(v_rows->'suppliers') > 115 then
      return jsonb_build_object(
        'ok',false,'code','resource_exceeded','shopId',p_shop_id,
        'operation',p_operation,'scope',v_scope_json,'revision',v_revision::text
      );
    end if;
  elsif p_operation = 'product_detail' then
    if v_product_id is null then return jsonb_build_object('ok',false,'code','validation_failed'); end if;
    if exists (
      select 1 from public.inventory_products product
      where product.id=v_product_id and (
        (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and product.shop_id=p_shop_id)
        or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
          and product.shop_id is null and product.owner_user_id=v_mapping.owner_user_id)
      ) and app_private.sync_product_recovery_row_fits_v1(
        product.id,product.owner_user_id,product.barcode,product.item_number,
        product.product_name,product.second_product_name,product.purchase_price,
        product.retail_price,product.supplier_id,product.category_id,
        product.stock_quantity,product.updated_at,product.deleted_at,
        product.shop_id,product.primary_image_version_id,
        product.primary_image_updated_at
      ) is not true
    ) or exists (
      select 1 from public.inventory_categories category
      join public.inventory_products product on product.category_id=category.id
      where product.id=v_product_id and (
        (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and category.shop_id=p_shop_id)
        or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
          and category.shop_id is null and category.owner_user_id=v_mapping.owner_user_id)
      ) and app_private.sync_category_recovery_row_fits_v1(
        category.id,category.owner_user_id,category.name,category.updated_at,
        category.deleted_at,category.shop_id
      ) is not true
    ) or exists (
      select 1 from public.inventory_suppliers supplier
      join public.inventory_products product on product.supplier_id=supplier.id
      where product.id=v_product_id and (
        (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and supplier.shop_id=p_shop_id)
        or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
          and supplier.shop_id is null and supplier.owner_user_id=v_mapping.owner_user_id)
      ) and app_private.sync_supplier_recovery_row_fits_v1(
        supplier.id,supplier.owner_user_id,supplier.name,supplier.updated_at,
        supplier.deleted_at,supplier.shop_id
      ) is not true
    ) or exists (
      select 1 from (
        select price.* from public.inventory_product_prices price
        where price.product_id=v_product_id and (
          (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and price.shop_id=p_shop_id)
          or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
            and price.shop_id is null and price.owner_user_id=v_mapping.owner_user_id)
        ) order by price.created_at desc,price.id limit 100
      ) price
      where app_private.sync_price_recovery_row_fits_v1(
        price.id,price.owner_user_id,price.product_id,price.type,price.price,
        price.effective_at,price.source,price.note,price.created_at,
        price.shop_id,price.updated_at
      ) is not true
    ) then
      return jsonb_build_object('ok',false,'code','resource_exceeded',
        'shopId',p_shop_id,'operation',p_operation,'scope',v_scope_json,
        'revision',v_revision::text);
    end if;
    select jsonb_build_array(jsonb_build_object(
      'id',product.id,'barcode',product.barcode,'item_number',product.item_number,
      'product_name',product.product_name,'second_product_name',product.second_product_name,
      'purchase_price',product.purchase_price,'retail_price',product.retail_price,
      'stock_quantity',product.stock_quantity,'supplier_id',product.supplier_id,
      'category_id',product.category_id,'deleted_at',product.deleted_at,
      'updated_at',product.updated_at,'primary_image_version_id',product.primary_image_version_id,
      'primary_image_updated_at',product.primary_image_updated_at,
      'category',(
        select jsonb_build_object('id',category.id,'name',category.name,
          'deleted_at',category.deleted_at,'updated_at',category.updated_at)
        from public.inventory_categories category
        where category.id=product.category_id and (
          (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and category.shop_id=p_shop_id)
          or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
            and category.shop_id is null and category.owner_user_id=v_mapping.owner_user_id)
        )
      ),
      'supplier',(
        select jsonb_build_object('id',supplier.id,'name',supplier.name,
          'deleted_at',supplier.deleted_at,'updated_at',supplier.updated_at)
        from public.inventory_suppliers supplier
        where supplier.id=product.supplier_id and (
          (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and supplier.shop_id=p_shop_id)
          or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
            and supplier.shop_id is null and supplier.owner_user_id=v_mapping.owner_user_id)
        )
      ),
      'prices',coalesce((select jsonb_agg(jsonb_build_object(
        'id',price.id,'product_id',price.product_id,'type',price.type,
        'price',price.price,'effective_at',price.effective_at,'note',price.note,
        'source',price.source,'created_at',price.created_at
      ) order by price.created_at desc,price.id) from (
        select price.* from public.inventory_product_prices price
        where price.product_id=product.id and (
          (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and price.shop_id=p_shop_id)
          or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
            and price.shop_id is null and price.owner_user_id=v_mapping.owner_user_id)
        ) order by price.created_at desc,price.id limit 100
      ) price),'[]'::jsonb),
      'pricesTruncated',(
        select count(*) > 100
        from (
          select 1 from public.inventory_product_prices price
          where price.product_id=product.id and (
            (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and price.shop_id=p_shop_id)
            or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
              and price.shop_id is null and price.owner_user_id=v_mapping.owner_user_id)
          ) limit 101
        ) bounded_prices
      )
    )) into v_rows
    from public.inventory_products product
    where product.id=v_product_id and (
      (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and product.shop_id=p_shop_id)
      or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and product.shop_id is null and product.owner_user_id=v_mapping.owner_user_id)
    );
    v_rows := coalesce(v_rows,'[]'::jsonb);
  elsif p_operation = 'products_by_codes' then
    if p_request ? 'codes' and (
        jsonb_typeof(p_request->'codes') <> 'array'
        or jsonb_array_length(p_request->'codes') > 40
        or exists (
          select 1 from jsonb_array_elements(p_request->'codes') item(value)
          where jsonb_typeof(item.value) <> 'string'
            or octet_length(item.value #>> '{}') > 256
        )
      ) then
      return jsonb_build_object('ok',false,'code','validation_failed');
    end if;
    select array_agg(distinct lower(value)) into v_codes
    from jsonb_array_elements_text(coalesce(p_request->'codes','[]'::jsonb)) code(value)
    where btrim(value)<>'';
    if coalesce(cardinality(v_codes),0)>40 then
      return jsonb_build_object('ok',false,'code','validation_failed');
    end if;
    if exists (
      select 1 from public.inventory_products product
      where product.deleted_at is null
        and (lower(product.barcode)=any(v_codes)
          or lower(coalesce(product.item_number,''))=any(v_codes))
        and ((v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and product.shop_id=p_shop_id)
          or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
            and product.shop_id is null and product.owner_user_id=v_mapping.owner_user_id))
        and app_private.sync_product_recovery_row_fits_v1(
          product.id,product.owner_user_id,product.barcode,product.item_number,
          product.product_name,product.second_product_name,product.purchase_price,
          product.retail_price,product.supplier_id,product.category_id,
          product.stock_quantity,product.updated_at,product.deleted_at,
          product.shop_id,product.primary_image_version_id,
          product.primary_image_updated_at
        ) is not true
    ) then
      return jsonb_build_object('ok',false,'code','resource_exceeded',
        'shopId',p_shop_id,'operation',p_operation,'scope',v_scope_json,
        'revision',v_revision::text);
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',product.id,'barcode',product.barcode,'item_number',product.item_number,
      'product_name',product.product_name,'second_product_name',product.second_product_name,
      'purchase_price',product.purchase_price,'retail_price',product.retail_price,
      'stock_quantity',product.stock_quantity,'supplier_id',product.supplier_id,
      'category_id',product.category_id,'deleted_at',product.deleted_at,
      'updated_at',product.updated_at,'primary_image_version_id',product.primary_image_version_id,
      'primary_image_updated_at',product.primary_image_updated_at
    ) order by product.id),'[]'::jsonb) into v_rows
    from public.inventory_products product
    where product.deleted_at is null
      and (lower(product.barcode)=any(v_codes) or lower(coalesce(product.item_number,''))=any(v_codes))
      and ((v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and product.shop_id=p_shop_id)
        or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
          and product.shop_id is null and product.owner_user_id=v_mapping.owner_user_id));
  else
    if v_entity = 'manifest' then
      if p_request ? 'expectedScopeKey'
        and coalesce(p_request->>'expectedScopeKey','') <> v_scope_key then
        return jsonb_build_object('ok',false,'code','scope_changed');
      end if;
      if v_summary is null then
        v_summary := app_private.shop_catalog_admin_summary_v1(
          p_shop_id, v_scope.catalog_scope, v_mapping.owner_user_id
        );
      end if;
      v_pagination := jsonb_build_object(
        'limit', 0, 'hasMore', false, 'nextAfterId', null
      );
    else
    if v_expected_revision is null then
      return jsonb_build_object('ok',false,'code','validation_failed');
    end if;
    if v_entity not in ('products','suppliers','categories','prices')
      or coalesce(p_request->>'expectedScopeKey','')<>v_scope_key then
      return jsonb_build_object('ok',false,'code','scope_changed');
    end if;
    if v_entity='products' then
      if exists (
        select 1 from (
          select product.* from public.inventory_products product
          where (v_after_id is null or product.id>v_after_id)
            and (v_state='all' or (v_state='active' and product.deleted_at is null)
              or (v_state='archived' and product.deleted_at is not null))
            and ((v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and product.shop_id=p_shop_id)
              or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
                and product.shop_id is null and product.owner_user_id=v_mapping.owner_user_id))
          order by product.id limit v_limit+1
        ) product
        where app_private.sync_product_recovery_row_fits_v1(
          product.id,product.owner_user_id,product.barcode,product.item_number,
          product.product_name,product.second_product_name,product.purchase_price,
          product.retail_price,product.supplier_id,product.category_id,
          product.stock_quantity,product.updated_at,product.deleted_at,
          product.shop_id,product.primary_image_version_id,
          product.primary_image_updated_at
        ) is not true
      ) then
        return jsonb_build_object('ok',false,'code','resource_exceeded',
          'shopId',p_shop_id,'operation',p_operation,'scope',v_scope_json,
          'revision',v_revision::text);
      end if;
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',product.id,'barcode',product.barcode,'item_number',product.item_number,
        'product_name',product.product_name,'second_product_name',product.second_product_name,
        'purchase_price',product.purchase_price,'retail_price',product.retail_price,
        'stock_quantity',product.stock_quantity,'supplier_id',product.supplier_id,
        'category_id',product.category_id,'deleted_at',product.deleted_at,
        'updated_at',product.updated_at,'primary_image_version_id',product.primary_image_version_id,
        'primary_image_updated_at',product.primary_image_updated_at
      ) order by product.id) filter(where product.ordinal<=v_limit),'[]'::jsonb),
      count(*)>v_limit
      into v_rows,v_has_more from (
        select candidates.*, row_number() over(order by candidates.id) ordinal
        from (
          select product.* from public.inventory_products product
          where (v_after_id is null or product.id>v_after_id)
            and (v_state='all' or (v_state='active' and product.deleted_at is null)
              or (v_state='archived' and product.deleted_at is not null))
            and (
              (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and product.shop_id=p_shop_id)
              or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
                and product.shop_id is null and product.owner_user_id=v_mapping.owner_user_id)
            ) order by product.id limit v_limit+1
        ) candidates
      ) product;
    elsif v_entity='suppliers' then
      if exists (
        select 1 from (
          select supplier.* from public.inventory_suppliers supplier
          where (v_after_id is null or supplier.id>v_after_id)
            and (v_state='all' or (v_state='active' and supplier.deleted_at is null)
              or (v_state='archived' and supplier.deleted_at is not null))
            and ((v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and supplier.shop_id=p_shop_id)
              or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
                and supplier.shop_id is null and supplier.owner_user_id=v_mapping.owner_user_id))
          order by supplier.id limit v_limit+1
        ) supplier
        where app_private.sync_supplier_recovery_row_fits_v1(
          supplier.id,supplier.owner_user_id,supplier.name,supplier.updated_at,
          supplier.deleted_at,supplier.shop_id
        ) is not true
      ) then
        return jsonb_build_object('ok',false,'code','resource_exceeded',
          'shopId',p_shop_id,'operation',p_operation,'scope',v_scope_json,
          'revision',v_revision::text);
      end if;
      select coalesce(jsonb_agg(jsonb_build_object('id',row.id,'name',row.name,
        'deleted_at',row.deleted_at,'updated_at',row.updated_at) order by row.id)
        filter(where row.ordinal<=v_limit),'[]'::jsonb),count(*)>v_limit
      into v_rows,v_has_more from (
        select candidates.*,row_number() over(order by candidates.id) ordinal from (
          select supplier.* from public.inventory_suppliers supplier
          where (v_after_id is null or supplier.id>v_after_id)
            and (v_state='all' or (v_state='active' and supplier.deleted_at is null)
              or (v_state='archived' and supplier.deleted_at is not null)) and (
              (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and supplier.shop_id=p_shop_id)
              or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
                and supplier.shop_id is null and supplier.owner_user_id=v_mapping.owner_user_id)
            ) order by supplier.id limit v_limit+1
        ) candidates
      ) row;
    elsif v_entity='categories' then
      if exists (
        select 1 from (
          select category.* from public.inventory_categories category
          where (v_after_id is null or category.id>v_after_id)
            and (v_state='all' or (v_state='active' and category.deleted_at is null)
              or (v_state='archived' and category.deleted_at is not null))
            and ((v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and category.shop_id=p_shop_id)
              or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
                and category.shop_id is null and category.owner_user_id=v_mapping.owner_user_id))
          order by category.id limit v_limit+1
        ) category
        where app_private.sync_category_recovery_row_fits_v1(
          category.id,category.owner_user_id,category.name,category.updated_at,
          category.deleted_at,category.shop_id
        ) is not true
      ) then
        return jsonb_build_object('ok',false,'code','resource_exceeded',
          'shopId',p_shop_id,'operation',p_operation,'scope',v_scope_json,
          'revision',v_revision::text);
      end if;
      select coalesce(jsonb_agg(jsonb_build_object('id',row.id,'name',row.name,
        'deleted_at',row.deleted_at,'updated_at',row.updated_at) order by row.id)
        filter(where row.ordinal<=v_limit),'[]'::jsonb),count(*)>v_limit
      into v_rows,v_has_more from (
        select candidates.*,row_number() over(order by candidates.id) ordinal from (
          select category.* from public.inventory_categories category
          where (v_after_id is null or category.id>v_after_id)
            and (v_state='all' or (v_state='active' and category.deleted_at is null)
              or (v_state='archived' and category.deleted_at is not null)) and (
              (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and category.shop_id=p_shop_id)
              or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
                and category.shop_id is null and category.owner_user_id=v_mapping.owner_user_id)
            ) order by category.id limit v_limit+1
        ) candidates
      ) row;
    else
      if exists (
        select 1 from (
          select price.* from public.inventory_product_prices price
          where (v_after_id is null or price.id>v_after_id)
            and ((v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and price.shop_id=p_shop_id)
              or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
                and price.shop_id is null and price.owner_user_id=v_mapping.owner_user_id))
            and exists(select 1 from public.inventory_products product
              where product.id=price.product_id and (
                (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and product.shop_id=p_shop_id)
                or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
                  and product.shop_id is null and product.owner_user_id=v_mapping.owner_user_id)))
          order by price.id limit v_limit+1
        ) price
        where app_private.sync_price_recovery_row_fits_v1(
          price.id,price.owner_user_id,price.product_id,price.type,price.price,
          price.effective_at,price.source,price.note,price.created_at,
          price.shop_id,price.updated_at
        ) is not true
      ) then
        return jsonb_build_object('ok',false,'code','resource_exceeded',
          'shopId',p_shop_id,'operation',p_operation,'scope',v_scope_json,
          'revision',v_revision::text);
      end if;
      select coalesce(jsonb_agg(jsonb_build_object('id',row.id,'product_id',row.product_id,
        'type',row.type,'price',row.price,'effective_at',row.effective_at,
        'note',row.note,'source',row.source,'created_at',row.created_at) order by row.id)
        filter(where row.ordinal<=v_limit),'[]'::jsonb),count(*)>v_limit
      into v_rows,v_has_more from (
        select candidates.*,row_number() over(order by candidates.id) ordinal from (
        select price.* from public.inventory_product_prices price
        where (v_after_id is null or price.id>v_after_id) and (
          (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and price.shop_id=p_shop_id)
          or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
            and price.shop_id is null and price.owner_user_id=v_mapping.owner_user_id)
        ) and exists(select 1 from public.inventory_products product where product.id=price.product_id and (
          (v_scope.catalog_scope in ('shop_scoped','authorized_shop_plus_legacy') and product.shop_id=p_shop_id)
          or (v_scope.catalog_scope in ('legacy_owner_bridge','authorized_shop_plus_legacy')
            and product.shop_id is null and product.owner_user_id=v_mapping.owner_user_id)
        )) order by price.id limit v_limit+1
        ) candidates
      ) row;
    end if;
    v_pagination:=jsonb_build_object('limit',v_limit,'hasMore',v_has_more,
      'nextAfterId',case when jsonb_array_length(v_rows)=0 then null
        else v_rows->(jsonb_array_length(v_rows)-1)->>'id' end);
    end if;
  end if;

  v_result:=jsonb_build_object(
    'ok',true,'code','success','schemaVersion','shop-catalog-admin-read-v1',
    'shopId',p_shop_id,'operation',p_operation,'scope',v_scope_json,
    'revision',v_revision::text,
    'rows',v_rows,'summary',v_summary,'pagination',v_pagination
  );
  if octet_length(v_result::text)>4194304 then
    return jsonb_build_object('ok',false,'code','resource_exceeded',
      'shopId',p_shop_id,'operation',p_operation,'scope',v_scope_json);
  end if;
  if p_staff_id is not null and not app_private.staff_web_runtime_lease_publishable_v1() then
    raise exception 'staff web lease expired before publication' using errcode='42501';
  end if;
  return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('ok',false,'code','validation_failed');
end;
$$;

revoke all on function public.shop_catalog_admin_read_v1(
  uuid,text,jsonb,uuid,uuid,text,integer
) from public,anon,authenticated,service_role;
grant execute on function public.shop_catalog_admin_read_v1(
  uuid,text,jsonb,uuid,uuid,text,integer
) to authenticated,service_role;

create or replace function app_private.sync_staff_history_payload_is_safe_v1(
  p_operation text,
  p_payload jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = app_private, pg_catalog, pg_temp
as $$
declare
  v_key text;
  v_value jsonb;
  v_allowed_keys text[] := array[
    'remoteId', 'expectedUpdatedAt', 'timestamp', 'data', 'overlay',
    'payloadVersion', 'isManualEntry', 'displayName', 'supplier', 'category'
  ];
  v_text text;
begin
  if p_payload is null
    or p_operation not in (
      'load', 'create', 'upsert_import', 'update', 'generated_update',
      'tombstone'
    )
    or app_private.sync_jsonb_storage_is_bounded_v1(
      p_payload, 524288, 0
    ) is not true
    or jsonb_typeof(p_payload) <> 'object' then
    return false;
  end if;
  for v_key, v_value in select entry.key, entry.value from jsonb_each(p_payload) entry
  loop
    if not v_key = any(v_allowed_keys) then
      return false;
    end if;
    if p_operation in ('load', 'tombstone') and v_key <> 'remoteId' then
      return false;
    end if;
    if v_key = 'data' then
      if app_private.sync_history_data_is_typed_v1(v_value) is not true
        or octet_length(v_value::text) > 524288 then
        return false;
      end if;
      continue;
    elsif v_key = 'overlay' then
      if app_private.sync_history_overlay_is_typed_v1(v_value) is not true then
        return false;
      end if;
      continue;
    elsif v_key = 'payloadVersion' then
      if jsonb_typeof(v_value) = 'number' then
        if v_value <> '2'::jsonb then return false; end if;
      elsif jsonb_typeof(v_value) = 'string' then
        if v_value #>> '{}' <> '2' then return false; end if;
      else
        return false;
      end if;
      continue;
    elsif v_key = 'isManualEntry' then
      if jsonb_typeof(v_value) <> 'boolean' then return false; end if;
      continue;
    end if;
    if jsonb_typeof(v_value) <> 'string' then
      return false;
    end if;
    v_text := v_value #>> '{}';
    if octet_length(v_text) > (case
        when v_key = 'remoteId' then 64
        when v_key in ('timestamp', 'expectedUpdatedAt') then 256
        else 2048
      end) then
      return false;
    end if;
  end loop;
  return p_payload ? 'remoteId';
exception when others then
  return false;
end;
$$;

revoke all on function app_private.sync_staff_history_payload_is_safe_v1(
  text, jsonb
) from public, anon, authenticated, service_role;

create or replace function public.staff_web_history_mutate_v1(
  p_shop_id uuid,
  p_staff_id uuid,
  p_staff_web_session_id uuid,
  p_session_token_hash text,
  p_expected_credential_version integer,
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_scope record;
  v_existing public.shared_sheet_sessions%rowtype;
  v_remote_id text;
  v_expected_updated_at timestamptz;
  v_timestamp text;
  v_updated_at timestamptz;
  v_action text;
  v_row_count integer := 0;
begin
  if p_operation not in ('load', 'create', 'upsert_import', 'update', 'generated_update', 'tombstone')
    or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
    or pg_column_size(coalesce(p_payload, '{}'::jsonb)) > 524288 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  if p_staff_id is null then
    if p_staff_web_session_id is not null or p_session_token_hash is not null
      or p_expected_credential_version is not null or auth.uid() is null then
      return jsonb_build_object('ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id);
    end if;
    perform 1 from public.shops shop
    join public.shop_members member on member.shop_id = shop.shop_id
    where shop.shop_id = p_shop_id and shop.shop_status = 'active'
      and member.profile_id = auth.uid()
      and member.membership_status = 'active'
      and member.role_key in ('shop_owner', 'shop_manager')
    for share of shop, member;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id);
    end if;
  elsif not app_private.staff_web_runtime_lease_is_valid_v1(
      p_shop_id, p_staff_id, p_staff_web_session_id, p_session_token_hash,
      p_expected_credential_version,
      case when p_operation = 'upsert_import' then 'catalog.import' else 'history.write' end
    ) then
      return jsonb_build_object('ok', false, 'code', 'session_expired', 'shop_id', p_shop_id);
  end if;
  select * into v_scope from app_private.resolve_shop_catalog_scope_service_v1(p_shop_id);
  if v_scope.owner_user_id is null then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, 'shop.history.session.' || p_operation || '.failure',
      'unauthorized_or_unmapped'
    );
  end if;
  v_remote_id := lower(coalesce(p_payload->>'remoteId', ''));
  if v_remote_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or v_remote_id <> coalesce(p_payload->>'remoteId', '') then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, 'shop.history.session.' || p_operation || '.failure',
      'validation_failed'
    );
  end if;

  select count(*) into v_row_count
  from public.shared_sheet_sessions row
  where row.remote_id = v_remote_id and (
    row.shop_id = p_shop_id or
    (row.shop_id is null and row.owner_user_id = v_scope.owner_user_id)
  );
  if v_row_count > 1 then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, 'shop.history.session.' || p_operation || '.failure',
      'invalid_state', 'history_session', v_remote_id::text,
      jsonb_build_object('integrityCode', 'duplicate_remote_id_in_authorized_union')
    );
  end if;
  select * into v_existing
  from public.shared_sheet_sessions row
  where row.remote_id = v_remote_id and (
    row.shop_id = p_shop_id or
    (row.shop_id is null and row.owner_user_id = v_scope.owner_user_id)
  )
  for update;

  if p_operation = 'load' then
    if v_existing.remote_id is null then
      return jsonb_build_object('ok', false, 'code', 'not_found', 'shop_id', p_shop_id);
    end if;
    if p_staff_id is not null
      and not app_private.staff_web_runtime_lease_publishable_v1() then
      raise exception 'staff web lease expired before publication'
        using errcode = '42501';
    end if;
    if app_private.sync_history_recovery_row_fits_v1(
        v_existing.remote_id, v_existing.payload_version,
        v_existing."timestamp", v_existing.supplier, v_existing.category,
        v_existing.is_manual_entry, v_existing.updated_at,
        v_existing.owner_user_id, v_existing.display_name,
        v_existing.deleted_at, v_existing.shop_id,
        case when v_existing.deleted_at is null then v_existing.data else null end,
        case when v_existing.deleted_at is null
          then v_existing.session_overlay else null end
      ) is not true then
      return jsonb_build_object(
        'ok', false, 'code', 'integrity_required', 'shop_id', p_shop_id,
        'target_id', v_remote_id
      );
    end if;
    return jsonb_build_object(
      'ok', true, 'code', 'success', 'shop_id', p_shop_id,
      'target_id', v_remote_id,
      'payload', jsonb_build_object(
        'row', jsonb_build_object(
          'remote_id', v_existing.remote_id,
          'shop_id', v_existing.shop_id,
          'owner_user_id', v_existing.owner_user_id,
          'display_name', v_existing.display_name,
          'supplier', v_existing.supplier,
          'category', v_existing.category,
          'timestamp', v_existing.timestamp,
          'updated_at', v_existing.updated_at,
          'deleted_at', v_existing.deleted_at,
          'payload_version', v_existing.payload_version,
          'data', case when v_existing.deleted_at is null
            then v_existing.data else '[]'::jsonb end,
          'session_overlay', case when v_existing.deleted_at is null
            then v_existing.session_overlay else null end
        ),
        'catalogScope', v_scope.catalog_scope
      )
    );
  end if;

  if p_operation = 'create' and v_existing.remote_id is not null then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, 'shop.history.session.create.failure',
      'conflict', 'history_session', v_remote_id::text
    );
  end if;
  if p_operation in ('update', 'generated_update', 'tombstone')
    and v_existing.remote_id is null then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, 'shop.history.session.' || p_operation || '.failure',
      'not_found', 'history_session', v_remote_id::text
    );
  end if;
  if p_operation in ('update', 'generated_update', 'tombstone')
    and v_existing.deleted_at is not null then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, 'shop.history.session.' || p_operation || '.failure',
      'invalid_state', 'history_session', v_remote_id::text
    );
  end if;
  if p_operation = 'upsert_import'
    and v_existing.deleted_at is not null then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, 'shop.history.session.upsert_import.failure',
      'invalid_state', 'history_session', v_remote_id::text
    );
  end if;

  if nullif(p_payload->>'expectedUpdatedAt', '') is not null then
    begin v_expected_updated_at := (p_payload->>'expectedUpdatedAt')::timestamptz;
    exception when others then
      return app_private.staff_web_action_result_v1(
        p_shop_id, p_staff_id, 'shop.history.session.' || p_operation || '.failure',
        'validation_failed', 'history_session', v_remote_id::text
      );
    end;
    if v_existing.updated_at is distinct from v_expected_updated_at then
      return app_private.staff_web_action_result_v1(
        p_shop_id, p_staff_id, 'shop.history.session.' || p_operation || '.failure',
        'conflict', 'history_session', v_remote_id::text
      );
    end if;
  end if;

  if p_operation in ('create', 'upsert_import', 'update') then
    v_timestamp := nullif(p_payload->>'timestamp', '');
    if (p_operation in ('create', 'upsert_import') and v_timestamp is null)
      or (v_timestamp is not null and not app_private.sync_legacy_timestamp_is_canonical_v1(v_timestamp))
      or (p_payload ? 'data' and jsonb_typeof(p_payload->'data') <> 'array')
      or (p_payload ? 'overlay' and jsonb_typeof(p_payload->'overlay') <> 'object') then
      return app_private.staff_web_action_result_v1(
        p_shop_id, p_staff_id, 'shop.history.session.' || p_operation || '.failure',
        'validation_failed', 'history_session', v_remote_id
      );
    end if;
  end if;
  if (p_payload ? 'payloadVersion' and (
        (p_payload->>'payloadVersion') !~ '^[0-9]+$'
        or (p_payload->>'payloadVersion')::integer <> 2
      ))
    or (p_operation in ('create', 'upsert_import') and (
      jsonb_typeof(p_payload->'data') <> 'array'
      or jsonb_typeof(p_payload->'overlay') <> 'object'
      or coalesce((p_payload->>'payloadVersion')::integer, 2) <> 2
    )) then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, 'shop.history.session.' || p_operation || '.failure',
      'validation_failed', 'history_session', v_remote_id
    );
  end if;
  if p_operation = 'generated_update'
    and (jsonb_typeof(p_payload->'data') <> 'array'
      or jsonb_typeof(p_payload->'overlay') <> 'object') then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, 'shop.history.session.generated_update.failure',
      'validation_failed', 'history_session', v_remote_id
    );
  end if;

  if p_operation = 'create' then
    insert into public.shared_sheet_sessions(
      remote_id, owner_user_id, shop_id, display_name, supplier, category,
      timestamp, data, session_overlay, payload_version, is_manual_entry,
      deleted_at, updated_at
    ) values (
      v_remote_id, v_scope.owner_user_id, p_shop_id,
      left(coalesce(nullif(btrim(p_payload->>'displayName'), ''), 'History Entry'), 120),
      left(coalesce(p_payload->>'supplier', ''), 120),
      left(coalesce(p_payload->>'category', ''), 120),
      v_timestamp,
      p_payload->'data', p_payload->'overlay',
      coalesce((p_payload->>'payloadVersion')::integer, 2),
      coalesce((p_payload->>'isManualEntry')::boolean, true), null, now()
    ) returning updated_at into v_updated_at;
    v_action := 'created';
  elsif p_operation = 'upsert_import' then
    if v_existing.remote_id is null then
      insert into public.shared_sheet_sessions(
        remote_id, owner_user_id, shop_id, display_name, supplier, category,
        timestamp, data, session_overlay, payload_version, is_manual_entry,
        deleted_at, updated_at
      ) values (
        v_remote_id, v_scope.owner_user_id, p_shop_id,
        left(coalesce(nullif(btrim(p_payload->>'displayName'), ''), 'History Entry'), 120),
        left(coalesce(p_payload->>'supplier', ''), 120),
        left(coalesce(p_payload->>'category', ''), 120),
        v_timestamp, p_payload->'data', p_payload->'overlay', 2,
        coalesce((p_payload->>'isManualEntry')::boolean, true), null, now()
      ) on conflict (remote_id) do nothing
      returning updated_at into v_updated_at;
      if found then
        v_action := 'created';
      else
        select * into v_existing
        from public.shared_sheet_sessions row
        where row.remote_id = v_remote_id and (
          row.shop_id = p_shop_id or
          (row.shop_id is null and row.owner_user_id = v_scope.owner_user_id)
        )
        for update;
        if v_existing.remote_id is null then
          return app_private.staff_web_action_result_v1(
            p_shop_id, p_staff_id, 'shop.history.session.upsert_import.failure',
            'conflict', 'history_session', v_remote_id
          );
        end if;
        if v_existing.deleted_at is not null then
          return app_private.staff_web_action_result_v1(
            p_shop_id, p_staff_id,
            'shop.history.session.upsert_import.failure',
            'invalid_state', 'history_session', v_remote_id::text
          );
        end if;
      end if;
    end if;
    if v_action is null then
      update public.shared_sheet_sessions row set
        display_name = left(coalesce(nullif(btrim(p_payload->>'displayName'), ''), row.display_name), 120),
        supplier = left(coalesce(p_payload->>'supplier', row.supplier), 120),
        category = left(coalesce(p_payload->>'category', row.category), 120),
        timestamp = v_timestamp,
        data = p_payload->'data', session_overlay = p_payload->'overlay',
        payload_version = 2,
        is_manual_entry = coalesce((p_payload->>'isManualEntry')::boolean, row.is_manual_entry),
        updated_at = now()
      where row.remote_id = v_remote_id and row.owner_user_id = v_existing.owner_user_id
        and row.shop_id is not distinct from v_existing.shop_id
      returning updated_at into v_updated_at;
      v_action := 'updated';
    end if;
  elsif p_operation = 'update' then
    update public.shared_sheet_sessions row set
      display_name = left(coalesce(nullif(btrim(p_payload->>'displayName'), ''), row.display_name), 120),
      supplier = left(coalesce(p_payload->>'supplier', row.supplier), 120),
      category = left(coalesce(p_payload->>'category', row.category), 120),
      timestamp = coalesce(v_timestamp, row.timestamp),
      data = coalesce(p_payload->'data', row.data),
      session_overlay = coalesce(p_payload->'overlay', row.session_overlay),
      payload_version = coalesce((p_payload->>'payloadVersion')::integer, row.payload_version),
      is_manual_entry = coalesce((p_payload->>'isManualEntry')::boolean, row.is_manual_entry),
      updated_at = now()
    where row.remote_id = v_remote_id and row.owner_user_id = v_existing.owner_user_id
      and row.shop_id is not distinct from v_existing.shop_id
    returning updated_at into v_updated_at;
    v_action := 'updated';
  elsif p_operation = 'generated_update' then
    if v_existing.payload_version <> 2 then
      return app_private.staff_web_action_result_v1(
        p_shop_id, p_staff_id, 'shop.history.session.generated_update.failure',
        'invalid_state', 'history_session', v_remote_id::text
      );
    end if;
    update public.shared_sheet_sessions row set
      data = p_payload->'data', session_overlay = p_payload->'overlay',
      updated_at = now()
    where row.remote_id = v_remote_id and row.owner_user_id = v_existing.owner_user_id
      and row.shop_id is not distinct from v_existing.shop_id
    returning updated_at into v_updated_at;
    v_action := 'updated';
  else
    update public.shared_sheet_sessions row set deleted_at = now(), updated_at = now()
    where row.remote_id = v_remote_id and row.owner_user_id = v_existing.owner_user_id
      and row.shop_id is not distinct from v_existing.shop_id
    returning updated_at into v_updated_at;
    v_action := 'tombstoned';
  end if;

  v_row_count := case when jsonb_typeof(p_payload->'data') = 'array'
    then jsonb_array_length(p_payload->'data') else 0 end;
  return app_private.staff_web_action_result_v1(
    p_shop_id, p_staff_id,
    'shop.history.session.' || case when v_action='created' then 'create'
      when v_action='tombstoned' then 'tombstone' else 'update' end || '.success',
    'success', 'history_session', v_remote_id::text,
    jsonb_build_object(
      'action', v_action, 'rowCount', v_row_count,
      'catalogScope', v_scope.catalog_scope,
      'updatedAt', v_updated_at
    )
  );
exception
  when invalid_text_representation or numeric_value_out_of_range or check_violation then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, 'shop.history.session.' || coalesce(p_operation,'unknown') || '.failure',
      'validation_failed', 'history_session', v_remote_id::text
    );
  when unique_violation then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, 'shop.history.session.' || coalesce(p_operation,'unknown') || '.failure',
      'conflict', 'history_session', v_remote_id::text
    );
  when others then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id, 'shop.history.session.' || coalesce(p_operation,'unknown') || '.failure',
      'db_failure', 'history_session', v_remote_id::text
    );
end;
$$;

revoke all on function public.staff_web_history_mutate_v1(
  uuid, uuid, uuid, text, integer, text, jsonb
) from public, anon, authenticated;
grant execute on function public.staff_web_history_mutate_v1(
  uuid, uuid, uuid, text, integer, text, jsonb
) to authenticated, service_role;

do $$
begin
  if to_regprocedure(
    'app_private.staff_web_history_mutate_pre_task139_v1(uuid,uuid,uuid,text,integer,text,jsonb)'
  ) is null then
    alter function public.staff_web_history_mutate_v1(
      uuid, uuid, uuid, text, integer, text, jsonb
    ) set schema app_private;
    alter function app_private.staff_web_history_mutate_v1(
      uuid, uuid, uuid, text, integer, text, jsonb
    ) rename to staff_web_history_mutate_pre_task139_v1;
  end if;
end;
$$;

revoke all on function app_private.staff_web_history_mutate_pre_task139_v1(
  uuid, uuid, uuid, text, integer, text, jsonb
) from public, anon, authenticated, service_role;

create or replace function public.staff_web_history_mutate_v1(
  p_shop_id uuid,
  p_staff_id uuid,
  p_staff_web_session_id uuid,
  p_session_token_hash text,
  p_expected_credential_version integer,
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_result jsonb;
  v_required_permission text;
begin
  if app_private.sync_staff_history_payload_is_safe_v1(
      p_operation, p_payload
    ) is not true then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  -- Personal-account calls retain the existing authenticated boundary. Staff
  -- calls establish their lease outside the implementation's exception block
  -- so duplicate/check/FK failures can still publish a structured, audited
  -- result without losing the deadline GUC during subtransaction rollback.
  if p_staff_id is null
    or p_operation not in (
      'load', 'create', 'upsert_import', 'update', 'generated_update', 'tombstone'
    ) then
    return app_private.staff_web_history_mutate_pre_task139_v1(
      p_shop_id, p_staff_id, p_staff_web_session_id, p_session_token_hash,
      p_expected_credential_version, p_operation, p_payload
    );
  end if;

  v_required_permission := case when p_operation = 'upsert_import'
    then 'catalog.import' else 'history.write' end;
  if not app_private.staff_web_runtime_lease_is_valid_v1(
    p_shop_id, p_staff_id, p_staff_web_session_id, p_session_token_hash,
    p_expected_credential_version, v_required_permission
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'session_expired', 'shop_id', p_shop_id
    );
  end if;

  begin
    v_result := app_private.staff_web_history_mutate_pre_task139_v1(
      p_shop_id, p_staff_id, p_staff_web_session_id, p_session_token_hash,
      p_expected_credential_version, p_operation, p_payload
    );
    if not app_private.staff_web_runtime_lease_is_valid_v1(
      p_shop_id, p_staff_id, p_staff_web_session_id, p_session_token_hash,
      p_expected_credential_version, v_required_permission
    ) then
      raise exception 'staff web lease expired before history publication'
        using errcode = '42501';
    end if;
    return v_result;
  exception when insufficient_privilege then
    return jsonb_build_object(
      'ok', false, 'code', 'session_expired', 'shop_id', p_shop_id
    );
  end;
end;
$$;

revoke all on function public.staff_web_history_mutate_v1(
  uuid, uuid, uuid, text, integer, text, jsonb
) from public, anon, authenticated;
grant execute on function public.staff_web_history_mutate_v1(
  uuid, uuid, uuid, text, integer, text, jsonb
) to authenticated, service_role;

-- Product-image read resolution is a cardinality-preserving, metadata-bound
-- contract.  A stale primary reference is returned explicitly as not_found;
-- it is never silently dropped.  Verified metadata crosses the boundary so
-- clients can authenticate downloaded and cached bytes before display.
create or replace function public.product_image_resolve_read_paths(
  p_actor_profile_id uuid,
  p_actor_kind text,
  p_shop_id uuid,
  p_refs jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_items jsonb;
  v_ref jsonb;
begin
  if app_private.product_image_actor_can_read(
    p_actor_profile_id, p_shop_id, p_actor_kind
  ) is not true then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  if p_refs is null
    or app_private.sync_jsonb_storage_is_bounded_v1(p_refs, 16384, 0)
      is not true
    or jsonb_typeof(p_refs) <> 'array'
    or jsonb_array_length(p_refs) < 1
    or jsonb_array_length(p_refs) > 16 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  for v_ref in select value from jsonb_array_elements(p_refs)
  loop
    if jsonb_typeof(v_ref) <> 'object' then
      return jsonb_build_object('ok', false, 'code', 'validation_failed');
    end if;
    if (select count(*) from jsonb_object_keys(v_ref)) <> 3
      or not v_ref ? 'productId'
      or not v_ref ? 'versionId'
      or not v_ref ? 'variant' then
      return jsonb_build_object('ok', false, 'code', 'validation_failed');
    end if;
    if jsonb_typeof(v_ref->'productId') <> 'string'
      or jsonb_typeof(v_ref->'versionId') <> 'string'
      or jsonb_typeof(v_ref->'variant') <> 'string' then
      return jsonb_build_object('ok', false, 'code', 'validation_failed');
    end if;
    if (v_ref->>'productId')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (v_ref->>'versionId')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (v_ref->>'variant') not in ('main', 'thumb') then
      return jsonb_build_object('ok', false, 'code', 'validation_failed');
    end if;
  end loop;

  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'product_id', ref.value->>'productId',
        'version_id', ref.value->>'versionId',
        'variant', ref.value->>'variant',
        'code', case when product.id is null then 'not_found' else 'success' end,
        'object_path', case
          when product.id is null then null
          when ref.value->>'variant' = 'main' then version.main_path
          else version.thumb_path
        end,
        'verified_sha256', case
          when product.id is null then null
          when ref.value->>'variant' = 'main' then version.verified_main_sha256
          else version.verified_thumb_sha256
        end,
        'verified_bytes', case
          when product.id is null then null
          when ref.value->>'variant' = 'main' then version.verified_main_bytes
          else version.verified_thumb_bytes
        end,
        'verified_width', case
          when product.id is null then null
          when ref.value->>'variant' = 'main' then version.verified_main_width
          else version.verified_thumb_width
        end,
        'verified_height', case
          when product.id is null then null
          when ref.value->>'variant' = 'main' then version.verified_main_height
          else version.verified_thumb_height
        end,
        'verified_mime_type', case
          when product.id is null then null
          when ref.value->>'variant' = 'main' then version.verified_main_mime_type
          else version.verified_thumb_mime_type
        end
      )) order by ref.ordinality
    ),
    '[]'::jsonb
  )
  into v_items
  from jsonb_array_elements(p_refs) with ordinality ref(value, ordinality)
  left join public.inventory_product_image_versions version
    on version.id = (ref.value->>'versionId')::uuid
   and version.product_id = (ref.value->>'productId')::uuid
   and version.shop_id = p_shop_id
   and version.status = 'ready'
   and version.verified_main_sha256 is not null
   and version.verified_main_bytes is not null
   and version.verified_main_width is not null
   and version.verified_main_height is not null
   and version.verified_main_mime_type = 'image/jpeg'
   and version.verified_thumb_sha256 is not null
   and version.verified_thumb_bytes is not null
   and version.verified_thumb_width is not null
   and version.verified_thumb_height is not null
   and version.verified_thumb_mime_type = 'image/jpeg'
  left join public.inventory_products product
    on product.id = version.product_id
   and product.primary_image_version_id = version.id
   and product.deleted_at is null
   and app_private.product_image_product_is_in_shop(product.id, p_shop_id);

  if jsonb_array_length(v_items) <> jsonb_array_length(p_refs)
    or pg_column_size(v_items) > 32768 then
    return jsonb_build_object('ok', false, 'code', 'backend_contract_invalid');
  end if;

  return jsonb_build_object('ok', true, 'code', 'success', 'items', v_items);
end;
$$;

revoke all on function public.product_image_resolve_read_paths(
  uuid, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.product_image_resolve_read_paths(
  uuid, text, uuid, jsonb
) to service_role;


notify pgrst, 'reload schema';

commit;
