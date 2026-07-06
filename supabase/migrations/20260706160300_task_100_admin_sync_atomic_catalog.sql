-- TASK-100 - Admin catalog mutations emit sync_events atomically.
--
-- Additive rollback:
--   drop function if exists public.shop_catalog_create_supplier_with_sync(uuid, text, text);
--   drop function if exists public.shop_catalog_update_supplier_with_sync(uuid, uuid, text, text);
--   drop function if exists public.shop_catalog_archive_supplier_with_sync(uuid, uuid, text, text);
--   drop function if exists public.shop_catalog_create_category_with_sync(uuid, text, text);
--   drop function if exists public.shop_catalog_update_category_with_sync(uuid, uuid, text, text);
--   drop function if exists public.shop_catalog_archive_category_with_sync(uuid, uuid, text, text);
--   drop function if exists public.shop_catalog_create_product_with_sync(uuid, text, text, text, text, double precision, double precision, double precision, uuid, uuid, text);
--   drop function if exists public.shop_catalog_update_product_with_sync(uuid, uuid, text, text, text, text, double precision, double precision, double precision, uuid, uuid, text);
--   drop function if exists public.shop_catalog_archive_product_with_sync(uuid, uuid, text, text);
--   drop function if exists public.shop_catalog_restore_product_with_sync(uuid, uuid, text, text);
--   drop function if exists app_private.shop_catalog_emit_sync_for_result(jsonb, uuid, text, text, text);
--
-- No data is dropped or deleted by this migration.

begin;

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
declare
  v_target_id uuid;
  v_owner_user_id uuid;
  v_row_shop_id uuid;
  v_updated_at timestamptz;
  v_deleted_at timestamptz;
  v_entity_ids_key text;
  v_event_type text;
  v_catalog_scope text;
  v_client_event_id text;
begin
  if coalesce(p_result->>'ok', 'false') <> 'true'
    or coalesce(p_result->>'code', '') <> 'success'
    or nullif(p_result->>'target_id', '') is null then
    return p_result;
  end if;

  v_target_id := nullif(p_result->>'target_id', '')::uuid;

  if p_entity = 'product' then
    select id, owner_user_id, shop_id, updated_at, deleted_at
      into v_target_id, v_owner_user_id, v_row_shop_id, v_updated_at, v_deleted_at
      from public.inventory_products
      where id = v_target_id;
    v_entity_ids_key := 'product_ids';
  elsif p_entity = 'category' then
    select id, owner_user_id, shop_id, updated_at, deleted_at
      into v_target_id, v_owner_user_id, v_row_shop_id, v_updated_at, v_deleted_at
      from public.inventory_categories
      where id = v_target_id;
    v_entity_ids_key := 'category_ids';
  elsif p_entity = 'supplier' then
    select id, owner_user_id, shop_id, updated_at, deleted_at
      into v_target_id, v_owner_user_id, v_row_shop_id, v_updated_at, v_deleted_at
      from public.inventory_suppliers
      where id = v_target_id;
    v_entity_ids_key := 'supplier_ids';
  else
    raise exception 'unsupported catalog sync entity: %', p_entity
      using errcode = '22023';
  end if;

  if v_owner_user_id is null then
    raise exception 'catalog sync target was not found after mutation'
      using errcode = 'P0002';
  end if;

  v_event_type := case
    when p_operation = 'archive' then 'catalog_tombstone'
    else 'catalog_changed'
  end;
  v_catalog_scope := case
    when v_row_shop_id is null then 'legacy_owner_bridge'
    else 'shop_scoped'
  end;
  v_client_event_id := 'admin_web:' || md5(concat_ws(
    ':',
    'catalog',
    p_entity,
    p_operation,
    v_target_id::text,
    coalesce(v_updated_at::text, ''),
    coalesce(v_deleted_at::text, 'active')
  ));

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
      'catalog',
      jsonb_build_object(v_entity_ids_key, jsonb_build_array(v_target_id)),
      v_event_type,
      jsonb_build_object(
        'actor_kind', left(coalesce(nullif(p_actor_kind, ''), 'personal_account'), 64),
        'atomic_rpc', true,
        'catalog_scope', v_catalog_scope,
        'entity_type', p_entity,
        'operation', case when p_operation = 'archive' then 'tombstone' else p_operation end,
        'payload_version', 1,
        'source', 'admin_web',
        'status', 'success'
      ),
      v_owner_user_id,
      coalesce(v_row_shop_id, p_shop_id),
      'admin_web',
      null
    );
  exception
    when unique_violation then
      null;
  end;

  return p_result;
end;
$$;

create or replace function public.shop_catalog_create_supplier_with_sync(
  p_shop_id uuid,
  p_name text,
  p_actor_kind text default 'personal_account'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_result jsonb;
begin
  v_result := public.shop_catalog_create_supplier(p_shop_id, p_name);
  return app_private.shop_catalog_emit_sync_for_result(
    v_result, p_shop_id, 'supplier', 'create', p_actor_kind
  );
end;
$$;

create or replace function public.shop_catalog_update_supplier_with_sync(
  p_shop_id uuid,
  p_supplier_id uuid,
  p_name text,
  p_actor_kind text default 'personal_account'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_result jsonb;
begin
  v_result := public.shop_catalog_update_supplier(p_shop_id, p_supplier_id, p_name);
  return app_private.shop_catalog_emit_sync_for_result(
    v_result, p_shop_id, 'supplier', 'update', p_actor_kind
  );
end;
$$;

create or replace function public.shop_catalog_archive_supplier_with_sync(
  p_shop_id uuid,
  p_supplier_id uuid,
  p_reason text default null,
  p_actor_kind text default 'personal_account'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_result jsonb;
begin
  v_result := public.shop_catalog_archive_supplier(p_shop_id, p_supplier_id, p_reason);
  return app_private.shop_catalog_emit_sync_for_result(
    v_result, p_shop_id, 'supplier', 'archive', p_actor_kind
  );
end;
$$;

create or replace function public.shop_catalog_create_category_with_sync(
  p_shop_id uuid,
  p_name text,
  p_actor_kind text default 'personal_account'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_result jsonb;
begin
  v_result := public.shop_catalog_create_category(p_shop_id, p_name);
  return app_private.shop_catalog_emit_sync_for_result(
    v_result, p_shop_id, 'category', 'create', p_actor_kind
  );
end;
$$;

create or replace function public.shop_catalog_update_category_with_sync(
  p_shop_id uuid,
  p_category_id uuid,
  p_name text,
  p_actor_kind text default 'personal_account'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_result jsonb;
begin
  v_result := public.shop_catalog_update_category(p_shop_id, p_category_id, p_name);
  return app_private.shop_catalog_emit_sync_for_result(
    v_result, p_shop_id, 'category', 'update', p_actor_kind
  );
end;
$$;

create or replace function public.shop_catalog_archive_category_with_sync(
  p_shop_id uuid,
  p_category_id uuid,
  p_reason text default null,
  p_actor_kind text default 'personal_account'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_result jsonb;
begin
  v_result := public.shop_catalog_archive_category(p_shop_id, p_category_id, p_reason);
  return app_private.shop_catalog_emit_sync_for_result(
    v_result, p_shop_id, 'category', 'archive', p_actor_kind
  );
end;
$$;

create or replace function public.shop_catalog_create_product_with_sync(
  p_shop_id uuid,
  p_barcode text,
  p_item_number text default null,
  p_product_name text default null,
  p_second_product_name text default null,
  p_purchase_price double precision default null,
  p_retail_price double precision default null,
  p_stock_quantity double precision default null,
  p_supplier_id uuid default null,
  p_category_id uuid default null,
  p_actor_kind text default 'personal_account'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_result jsonb;
begin
  v_result := public.shop_catalog_create_product(
    p_shop_id,
    p_barcode,
    p_item_number,
    p_product_name,
    p_second_product_name,
    p_purchase_price,
    p_retail_price,
    p_stock_quantity,
    p_supplier_id,
    p_category_id
  );
  return app_private.shop_catalog_emit_sync_for_result(
    v_result, p_shop_id, 'product', 'create', p_actor_kind
  );
end;
$$;

create or replace function public.shop_catalog_update_product_with_sync(
  p_shop_id uuid,
  p_product_id uuid,
  p_barcode text,
  p_item_number text default null,
  p_product_name text default null,
  p_second_product_name text default null,
  p_purchase_price double precision default null,
  p_retail_price double precision default null,
  p_stock_quantity double precision default null,
  p_supplier_id uuid default null,
  p_category_id uuid default null,
  p_actor_kind text default 'personal_account'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_result jsonb;
begin
  v_result := public.shop_catalog_update_product(
    p_shop_id,
    p_product_id,
    p_barcode,
    p_item_number,
    p_product_name,
    p_second_product_name,
    p_purchase_price,
    p_retail_price,
    p_stock_quantity,
    p_supplier_id,
    p_category_id
  );
  return app_private.shop_catalog_emit_sync_for_result(
    v_result, p_shop_id, 'product', 'update', p_actor_kind
  );
end;
$$;

create or replace function public.shop_catalog_archive_product_with_sync(
  p_shop_id uuid,
  p_product_id uuid,
  p_reason text default null,
  p_actor_kind text default 'personal_account'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_result jsonb;
begin
  v_result := public.shop_catalog_archive_product(p_shop_id, p_product_id, p_reason);
  return app_private.shop_catalog_emit_sync_for_result(
    v_result, p_shop_id, 'product', 'archive', p_actor_kind
  );
end;
$$;

create or replace function public.shop_catalog_restore_product_with_sync(
  p_shop_id uuid,
  p_product_id uuid,
  p_reason text default null,
  p_actor_kind text default 'personal_account'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_result jsonb;
begin
  v_result := public.shop_catalog_restore_product(p_shop_id, p_product_id, p_reason);
  return app_private.shop_catalog_emit_sync_for_result(
    v_result, p_shop_id, 'product', 'restore', p_actor_kind
  );
end;
$$;

revoke all on function app_private.shop_catalog_emit_sync_for_result(jsonb, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.shop_catalog_create_supplier_with_sync(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.shop_catalog_update_supplier_with_sync(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.shop_catalog_archive_supplier_with_sync(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.shop_catalog_create_category_with_sync(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.shop_catalog_update_category_with_sync(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.shop_catalog_archive_category_with_sync(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.shop_catalog_create_product_with_sync(uuid, text, text, text, text, double precision, double precision, double precision, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.shop_catalog_update_product_with_sync(uuid, uuid, text, text, text, text, double precision, double precision, double precision, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.shop_catalog_archive_product_with_sync(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.shop_catalog_restore_product_with_sync(uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.shop_catalog_create_supplier_with_sync(uuid, text, text)
  to authenticated, service_role;
grant execute on function public.shop_catalog_update_supplier_with_sync(uuid, uuid, text, text)
  to authenticated, service_role;
grant execute on function public.shop_catalog_archive_supplier_with_sync(uuid, uuid, text, text)
  to authenticated, service_role;
grant execute on function public.shop_catalog_create_category_with_sync(uuid, text, text)
  to authenticated, service_role;
grant execute on function public.shop_catalog_update_category_with_sync(uuid, uuid, text, text)
  to authenticated, service_role;
grant execute on function public.shop_catalog_archive_category_with_sync(uuid, uuid, text, text)
  to authenticated, service_role;
grant execute on function public.shop_catalog_create_product_with_sync(uuid, text, text, text, text, double precision, double precision, double precision, uuid, uuid, text)
  to authenticated, service_role;
grant execute on function public.shop_catalog_update_product_with_sync(uuid, uuid, text, text, text, text, double precision, double precision, double precision, uuid, uuid, text)
  to authenticated, service_role;
grant execute on function public.shop_catalog_archive_product_with_sync(uuid, uuid, text, text)
  to authenticated, service_role;
grant execute on function public.shop_catalog_restore_product_with_sync(uuid, uuid, text, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
