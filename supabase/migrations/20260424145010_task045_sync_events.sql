create table if not exists public.sync_events (
  id bigint generated always as identity primary key,
  owner_user_id uuid not null,
  store_id uuid null,
  domain text not null,
  event_type text not null,
  source text null,
  source_device_id text null,
  batch_id uuid null,
  client_event_id text null,
  changed_count integer not null default 0,
  entity_ids jsonb null,
  created_at timestamptz not null default now(),
  expires_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  constraint sync_events_changed_count_non_negative check (changed_count >= 0),
  constraint sync_events_domain_mvp_check check (domain in ('catalog', 'prices')),
  constraint sync_events_event_type_mvp_check check (
    event_type in (
      'catalog_changed',
      'prices_changed',
      'catalog_tombstone',
      'prices_tombstone'
    )
  ),
  constraint sync_events_entity_ids_object_check check (
    entity_ids is null or jsonb_typeof(entity_ids) = 'object'
  ),
  constraint sync_events_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

alter table public.sync_events enable row level security;

create index if not exists sync_events_owner_id_idx
  on public.sync_events (owner_user_id, id);

create index if not exists sync_events_owner_created_at_idx
  on public.sync_events (owner_user_id, created_at);

create index if not exists sync_events_owner_domain_id_idx
  on public.sync_events (owner_user_id, domain, id);

create index if not exists sync_events_owner_store_id_idx
  on public.sync_events (owner_user_id, store_id, id)
  where store_id is not null;

create unique index if not exists sync_events_owner_client_event_id_unique
  on public.sync_events (owner_user_id, client_event_id)
  where client_event_id is not null;

drop policy if exists "sync_events_select_owner" on public.sync_events;

create policy "sync_events_select_owner"
  on public.sync_events
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and owner_user_id = (select auth.uid())
  );

revoke all on table public.sync_events from anon, authenticated;
grant select on table public.sync_events to authenticated;

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
  p_metadata jsonb default '{}'::jsonb
)
returns public.sync_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_row public.sync_events;
  v_key text;
  v_allowed_keys text[] := array['supplier_ids', 'category_ids', 'product_ids', 'price_ids'];
  v_array_count integer;
  v_invalid_uuid_count integer;
begin
  if v_owner is null then
    raise exception 'record_sync_event requires an authenticated user'
      using errcode = '28000';
  end if;

  if p_domain not in ('catalog', 'prices') then
    raise exception 'unsupported sync event domain: %', p_domain
      using errcode = '22023';
  end if;

  if p_event_type not in (
    'catalog_changed',
    'prices_changed',
    'catalog_tombstone',
    'prices_tombstone'
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

  if p_changed_count < 0 or p_changed_count > 1000 then
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
        and client_event_id = p_client_event_id;

    if found then
      return v_row;
    end if;
  end if;

  insert into public.sync_events (
    owner_user_id,
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
          and client_event_id = p_client_event_id;

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
  jsonb
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
  jsonb
) to authenticated;

do $$
begin
  if exists (
    select 1
      from pg_publication
      where pubname = 'supabase_realtime'
  )
  and not exists (
    select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'sync_events'
  ) then
    execute 'alter publication supabase_realtime add table public.sync_events';
  end if;
end;
$$;;
