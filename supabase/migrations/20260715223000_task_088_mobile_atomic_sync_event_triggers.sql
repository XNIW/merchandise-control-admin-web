-- TASK-088 - Atomic sync_events for mobile PostgREST mutations.
--
-- Android and iOS historically committed the business row and then called
-- record_sync_event in a second request.  This trigger closes that crash
-- window and removes one network round trip while preserving the legacy
-- event writer as a negotiated fallback for older backends.
--
-- The trigger is deliberately inactive for supabase-js/Admin requests: Admin
-- mutations already use their reviewed atomic RPC/event writers.
--
-- Additive rollback:
--   drop trigger if exists task088_mobile_sync_event on public.inventory_suppliers;
--   drop trigger if exists task088_mobile_catalog_tombstone_retry on public.inventory_suppliers;
--   drop trigger if exists task088_mobile_sync_event on public.inventory_categories;
--   drop trigger if exists task088_mobile_catalog_tombstone_retry on public.inventory_categories;
--   drop trigger if exists task088_mobile_sync_event on public.inventory_products;
--   drop trigger if exists task088_mobile_catalog_tombstone_retry on public.inventory_products;
--   drop trigger if exists task088_mobile_sync_event on public.inventory_product_prices;
--   drop trigger if exists task088_mobile_sync_event on public.shared_sheet_sessions;
--   drop function if exists public.mobile_sync_auto_event_capabilities();
--   drop function if exists app_private.guard_mobile_product_price_append_only();
--   drop function if exists app_private.guard_mobile_catalog_tombstone_retry();
--   drop function if exists app_private.emit_mobile_row_sync_event();
--   drop function if exists app_private.mobile_sync_request_source();
--   drop function if exists app_private.mobile_sync_platform_source();

begin;

create or replace function app_private.mobile_sync_platform_source()
returns text
language plpgsql
stable
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  v_headers jsonb := '{}'::jsonb;
  v_client_info text;
begin
  begin
    v_headers := coalesce(
      nullif(current_setting('request.headers', true), ''),
      '{}'
    )::jsonb;
  exception
    when others then
      v_headers := '{}'::jsonb;
  end;

  v_client_info := lower(coalesce(v_headers->>'x-client-info', ''));

  if position('supabase-kt/' in v_client_info) > 0 then
    return 'android';
  end if;

  if position('supabase-swift/' in v_client_info) > 0 then
    return 'ios';
  end if;

  return null;
end;
$$;

revoke all on function app_private.mobile_sync_platform_source()
  from public, anon, authenticated;

create or replace function app_private.mobile_sync_request_source()
returns text
language plpgsql
stable
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  v_headers jsonb := '{}'::jsonb;
begin
  begin
    v_headers := coalesce(
      nullif(current_setting('request.headers', true), ''),
      '{}'
    )::jsonb;
  exception
    when others then
      v_headers := '{}'::jsonb;
  end;

  if lower(coalesce(v_headers->>'x-merchandise-control-sync', '')) <> 'atomic-v1' then
    return null;
  end if;

  return app_private.mobile_sync_platform_source();
end;
$$;

revoke all on function app_private.mobile_sync_request_source()
  from public, anon, authenticated;

create or replace function public.mobile_sync_auto_event_capabilities()
returns jsonb
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'databaseMutationEmitsSyncEvent',
      app_private.mobile_sync_platform_source() is not null,
    'maxEntityIdsPerEvent', 1
  );
$$;

revoke all on function public.mobile_sync_auto_event_capabilities()
  from public, anon, authenticated;
grant execute on function public.mobile_sync_auto_event_capabilities()
  to authenticated;

create or replace function app_private.emit_mobile_row_sync_event()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_source text := app_private.mobile_sync_request_source();
  v_row jsonb := to_jsonb(new);
  v_old_row jsonb;
  v_owner_user_id uuid;
  v_shop_id uuid;
  v_entity_id text;
  v_entity_key text;
  v_entity_type text;
  v_domain text;
  v_event_type text;
  v_operation text;
  v_client_event_id text;
begin
  if v_source is null then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'mobile atomic sync event requires an authenticated user'
      using errcode = '28000';
  end if;

  if tg_op = 'UPDATE' then
    v_old_row := to_jsonb(old);
    if (v_old_row - 'updated_at') = (v_row - 'updated_at') then
      return new;
    end if;
    if nullif(v_old_row->>'deleted_at', '') is not null
      and nullif(v_row->>'deleted_at', '') is not null
      and (v_old_row - 'updated_at' - 'deleted_at') =
          (v_row - 'updated_at' - 'deleted_at') then
      return new;
    end if;
  end if;

  v_owner_user_id := nullif(v_row->>'owner_user_id', '')::uuid;
  v_shop_id := nullif(v_row->>'shop_id', '')::uuid;

  if v_owner_user_id is null then
    raise exception 'mobile atomic sync event row has no owner'
      using errcode = '23502';
  end if;

  case tg_table_name
    when 'inventory_suppliers' then
      v_entity_id := v_row->>'id';
      v_entity_key := 'supplier_ids';
      v_entity_type := 'supplier';
      v_domain := 'catalog';
    when 'inventory_categories' then
      v_entity_id := v_row->>'id';
      v_entity_key := 'category_ids';
      v_entity_type := 'category';
      v_domain := 'catalog';
    when 'inventory_products' then
      v_entity_id := v_row->>'id';
      v_entity_key := 'product_ids';
      v_entity_type := 'product';
      v_domain := 'catalog';
    when 'inventory_product_prices' then
      v_entity_id := v_row->>'id';
      v_entity_key := 'price_ids';
      v_entity_type := 'product_price';
      v_domain := 'prices';
    when 'shared_sheet_sessions' then
      v_entity_id := v_row->>'remote_id';
      v_entity_key := 'session_ids';
      v_entity_type := 'history_session';
      v_domain := 'history';
    else
      raise exception 'unsupported mobile atomic sync table: %', tg_table_name
        using errcode = '22023';
  end case;

  if v_entity_id is null
    or v_entity_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'mobile atomic sync entity id must be a uuid'
      using errcode = '22023';
  end if;

  if v_domain <> 'prices'
    and nullif(v_row->>'deleted_at', '') is not null then
    v_event_type := case
      when v_domain = 'history' then 'history_tombstone'
      else 'catalog_tombstone'
    end;
    v_operation := 'tombstone';
  else
    v_event_type := case v_domain
      when 'prices' then 'prices_changed'
      when 'history' then 'history_changed'
      else 'catalog_changed'
    end;
    v_operation := case when tg_op = 'INSERT' then 'create' else 'update' end;
  end if;

  v_client_event_id := left(
    'mobile_auto:' || v_source || ':' || tg_table_name || ':' ||
      v_entity_id || ':' || md5(v_row::text),
    160
  );

  begin
    insert into public.sync_events (
      changed_count,
      client_event_id,
      domain,
      entity_ids,
      event_type,
      metadata,
      owner_user_id,
      shop_id,
      source,
      source_device_id
    )
    values (
      1,
      v_client_event_id,
      v_domain,
      jsonb_build_object(v_entity_key, jsonb_build_array(v_entity_id)),
      v_event_type,
      jsonb_build_object(
        'atomic_trigger', true,
        'entity_type', v_entity_type,
        'operation', v_operation,
        'payload_version', 1,
        'source', v_source,
        'status', 'success'
      ),
      v_owner_user_id,
      v_shop_id,
      v_source,
      null
    );
  exception
    when unique_violation then
      null;
  end;

  return new;
end;
$$;

revoke all on function app_private.emit_mobile_row_sync_event()
  from public, anon, authenticated;

create or replace function app_private.guard_mobile_catalog_tombstone_retry()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if app_private.mobile_sync_request_source() is null then
    return new;
  end if;

  if old.deleted_at is not null
    and new.deleted_at is not null
    and (to_jsonb(old) - 'updated_at' - 'deleted_at') =
        (to_jsonb(new) - 'updated_at' - 'deleted_at') then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_mobile_catalog_tombstone_retry()
  from public, anon, authenticated;

create or replace function app_private.guard_mobile_product_price_append_only()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if app_private.mobile_sync_request_source() is null then
    return new;
  end if;

  if to_jsonb(old) = to_jsonb(new) then
    return old;
  end if;

  raise exception 'price_idempotency_conflict'
    using errcode = '23505';
end;
$$;

revoke all on function app_private.guard_mobile_product_price_append_only()
  from public, anon, authenticated;

drop trigger if exists task088_mobile_sync_event on public.inventory_suppliers;
drop trigger if exists task088_mobile_catalog_tombstone_retry on public.inventory_suppliers;
create trigger task088_mobile_catalog_tombstone_retry
  before update on public.inventory_suppliers
  for each row execute function app_private.guard_mobile_catalog_tombstone_retry();
create trigger task088_mobile_sync_event
  after insert or update on public.inventory_suppliers
  for each row execute function app_private.emit_mobile_row_sync_event();

drop trigger if exists task088_mobile_sync_event on public.inventory_categories;
drop trigger if exists task088_mobile_catalog_tombstone_retry on public.inventory_categories;
create trigger task088_mobile_catalog_tombstone_retry
  before update on public.inventory_categories
  for each row execute function app_private.guard_mobile_catalog_tombstone_retry();
create trigger task088_mobile_sync_event
  after insert or update on public.inventory_categories
  for each row execute function app_private.emit_mobile_row_sync_event();

drop trigger if exists task088_mobile_sync_event on public.inventory_products;
drop trigger if exists task088_mobile_catalog_tombstone_retry on public.inventory_products;
create trigger task088_mobile_catalog_tombstone_retry
  before update on public.inventory_products
  for each row execute function app_private.guard_mobile_catalog_tombstone_retry();
create trigger task088_mobile_sync_event
  after insert or update on public.inventory_products
  for each row execute function app_private.emit_mobile_row_sync_event();

drop trigger if exists task088_mobile_sync_event on public.inventory_product_prices;
drop trigger if exists task088_mobile_price_append_only on public.inventory_product_prices;
create trigger task088_mobile_price_append_only
  before update on public.inventory_product_prices
  for each row execute function app_private.guard_mobile_product_price_append_only();
create trigger task088_mobile_sync_event
  after insert or update on public.inventory_product_prices
  for each row execute function app_private.emit_mobile_row_sync_event();

drop trigger if exists task088_mobile_sync_event on public.shared_sheet_sessions;
create trigger task088_mobile_sync_event
  after insert or update on public.shared_sheet_sessions
  for each row execute function app_private.emit_mobile_row_sync_event();

notify pgrst, 'reload schema';

commit;
