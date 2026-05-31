-- TASK-015: Shop Admin completion.
-- Scope: additive RPC/helper layer for catalog CRUD, staff mutations, device registry,
-- and import/export audit events. No hard deletes, no direct mutative table grants.

create or replace function app_private.shop_admin_action_result(
  p_ok boolean,
  p_code text,
  p_shop_id uuid default null,
  p_target_id text default null,
  p_audit_event_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'ok', p_ok,
      'code', p_code,
      'shop_id', p_shop_id,
      'target_id', p_target_id,
      'audit_event_id', p_audit_event_id,
      'payload', coalesce(p_payload, '{}'::jsonb)
    )
  );
$$;

create or replace function app_private.normalize_admin_label(p_value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(btrim(coalesce(p_value, '')), '\s+', ' ', 'g');
$$;

create or replace function app_private.resolve_shop_inventory_owner(
  target_shop_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select sis.owner_user_id
  from public.shop_inventory_sources sis
  where sis.shop_id = target_shop_id
    and sis.mapping_state = 'mapped'
    and sis.disabled_at is null
    and sis.owner_user_id is not null
    and app_private.is_active_shop_staff_admin_member(target_shop_id)
  limit 1;
$$;

create or replace function app_private.write_shop_admin_audit(
  p_shop_id uuid,
  p_event_key text,
  p_severity text,
  p_result text,
  p_target_type text,
  p_target_id text,
  p_code text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_id uuid;
  safe_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if jsonb_typeof(safe_metadata) <> 'object' then
    safe_metadata := '{}'::jsonb;
  end if;

  insert into public.audit_logs (
    actor_profile_id,
    scope,
    shop_id,
    event_key,
    severity,
    result,
    target_type,
    target_id,
    metadata_redacted
  )
  values (
    auth.uid(),
    'shop',
    p_shop_id,
    p_event_key,
    p_severity,
    p_result,
    p_target_type,
    p_target_id,
    jsonb_strip_nulls(
      safe_metadata
      || jsonb_build_object(
        'code', p_code,
        'source', 'TASK-015'
      )
    )
  )
  returning audit_log_id into inserted_id;

  return inserted_id;
end;
$$;

create or replace function public.shop_admin_audit_event(
  p_shop_id uuid,
  p_event_key text,
  p_result text,
  p_code text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  audit_event_id uuid;
  safe_result text := coalesce(p_result, 'success');
begin
  if actor_id is null
    or not app_private.is_active_shop_staff_admin_member(p_shop_id) then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id);
  end if;

  if safe_result not in ('success', 'blocked', 'failure', 'simulated') then
    safe_result := 'failure';
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id,
    p_event_key,
    case when safe_result = 'failure' then 'critical' else 'info' end,
    safe_result,
    'shop',
    p_shop_id::text,
    p_code,
    p_metadata
  );

  return app_private.shop_admin_action_result(
    true,
    'success',
    p_shop_id,
    p_shop_id::text,
    audit_event_id
  );
end;
$$;

create or replace function public.shop_catalog_create_supplier(
  p_shop_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_owner uuid := app_private.resolve_shop_inventory_owner(p_shop_id);
  v_name text := app_private.normalize_admin_label(p_name);
  v_supplier_id uuid;
  audit_event_id uuid;
begin
  if v_owner is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id);
  end if;

  if length(v_name) = 0 then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.supplier.create.failure', 'warning', 'blocked',
      'supplier', null, 'validation_failed', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id, null, audit_event_id);
  end if;

  insert into public.inventory_suppliers (owner_user_id, name, updated_at)
  values (v_owner, v_name, now())
  returning id into v_supplier_id;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.catalog.supplier.create.success', 'info', 'success',
    'supplier', v_supplier_id::text, 'success', jsonb_build_object('name_length', length(v_name))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, v_supplier_id::text, audit_event_id);
exception
  when unique_violation then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.supplier.create.failure', 'warning', 'blocked',
      'supplier', null, 'conflict', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'conflict', p_shop_id, null, audit_event_id);
  when others then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.supplier.create.failure', 'critical', 'failure',
      'supplier', null, 'db_failure', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'db_failure', p_shop_id, null, audit_event_id);
end;
$$;

create or replace function public.shop_catalog_update_supplier(
  p_shop_id uuid,
  p_supplier_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_owner uuid := app_private.resolve_shop_inventory_owner(p_shop_id);
  v_name text := app_private.normalize_admin_label(p_name);
  audit_event_id uuid;
begin
  if v_owner is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id, p_supplier_id::text);
  end if;

  if length(v_name) = 0 then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.supplier.update.failure', 'warning', 'blocked',
      'supplier', p_supplier_id::text, 'validation_failed', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id, p_supplier_id::text, audit_event_id);
  end if;

  update public.inventory_suppliers
  set name = v_name,
      updated_at = now()
  where id = p_supplier_id
    and owner_user_id = v_owner
    and deleted_at is null;

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_supplier_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.catalog.supplier.update.success', 'info', 'success',
    'supplier', p_supplier_id::text, 'success', jsonb_build_object('name_length', length(v_name))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_supplier_id::text, audit_event_id);
exception
  when unique_violation then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.supplier.update.failure', 'warning', 'blocked',
      'supplier', p_supplier_id::text, 'conflict', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'conflict', p_shop_id, p_supplier_id::text, audit_event_id);
  when others then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.supplier.update.failure', 'critical', 'failure',
      'supplier', p_supplier_id::text, 'db_failure', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'db_failure', p_shop_id, p_supplier_id::text, audit_event_id);
end;
$$;

create or replace function public.shop_catalog_archive_supplier(
  p_shop_id uuid,
  p_supplier_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_owner uuid := app_private.resolve_shop_inventory_owner(p_shop_id);
  audit_event_id uuid;
begin
  if v_owner is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id, p_supplier_id::text);
  end if;

  update public.inventory_suppliers
  set deleted_at = now(),
      updated_at = now()
  where id = p_supplier_id
    and owner_user_id = v_owner
    and deleted_at is null;

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_supplier_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.catalog.supplier.archive.success', 'warning', 'success',
    'supplier', p_supplier_id::text, 'success',
    jsonb_build_object('reason_redacted', nullif(left(app_private.normalize_admin_label(p_reason), 160), ''))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_supplier_id::text, audit_event_id);
end;
$$;

create or replace function public.shop_catalog_create_category(
  p_shop_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_owner uuid := app_private.resolve_shop_inventory_owner(p_shop_id);
  v_name text := app_private.normalize_admin_label(p_name);
  v_category_id uuid;
  audit_event_id uuid;
begin
  if v_owner is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id);
  end if;

  if length(v_name) = 0 then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.category.create.failure', 'warning', 'blocked',
      'category', null, 'validation_failed', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id, null, audit_event_id);
  end if;

  insert into public.inventory_categories (owner_user_id, name, updated_at)
  values (v_owner, v_name, now())
  returning id into v_category_id;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.catalog.category.create.success', 'info', 'success',
    'category', v_category_id::text, 'success', jsonb_build_object('name_length', length(v_name))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, v_category_id::text, audit_event_id);
exception
  when unique_violation then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.category.create.failure', 'warning', 'blocked',
      'category', null, 'conflict', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'conflict', p_shop_id, null, audit_event_id);
  when others then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.category.create.failure', 'critical', 'failure',
      'category', null, 'db_failure', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'db_failure', p_shop_id, null, audit_event_id);
end;
$$;

create or replace function public.shop_catalog_update_category(
  p_shop_id uuid,
  p_category_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_owner uuid := app_private.resolve_shop_inventory_owner(p_shop_id);
  v_name text := app_private.normalize_admin_label(p_name);
  audit_event_id uuid;
begin
  if v_owner is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id, p_category_id::text);
  end if;

  if length(v_name) = 0 then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.category.update.failure', 'warning', 'blocked',
      'category', p_category_id::text, 'validation_failed', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id, p_category_id::text, audit_event_id);
  end if;

  update public.inventory_categories
  set name = v_name,
      updated_at = now()
  where id = p_category_id
    and owner_user_id = v_owner
    and deleted_at is null;

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_category_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.catalog.category.update.success', 'info', 'success',
    'category', p_category_id::text, 'success', jsonb_build_object('name_length', length(v_name))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_category_id::text, audit_event_id);
exception
  when unique_violation then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.category.update.failure', 'warning', 'blocked',
      'category', p_category_id::text, 'conflict', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'conflict', p_shop_id, p_category_id::text, audit_event_id);
  when others then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.category.update.failure', 'critical', 'failure',
      'category', p_category_id::text, 'db_failure', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'db_failure', p_shop_id, p_category_id::text, audit_event_id);
end;
$$;

create or replace function public.shop_catalog_archive_category(
  p_shop_id uuid,
  p_category_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_owner uuid := app_private.resolve_shop_inventory_owner(p_shop_id);
  audit_event_id uuid;
begin
  if v_owner is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id, p_category_id::text);
  end if;

  update public.inventory_categories
  set deleted_at = now(),
      updated_at = now()
  where id = p_category_id
    and owner_user_id = v_owner
    and deleted_at is null;

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_category_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.catalog.category.archive.success', 'warning', 'success',
    'category', p_category_id::text, 'success',
    jsonb_build_object('reason_redacted', nullif(left(app_private.normalize_admin_label(p_reason), 160), ''))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_category_id::text, audit_event_id);
end;
$$;

create or replace function public.shop_catalog_create_product(
  p_shop_id uuid,
  p_barcode text,
  p_item_number text default null,
  p_product_name text default null,
  p_second_product_name text default null,
  p_purchase_price double precision default null,
  p_retail_price double precision default null,
  p_stock_quantity double precision default null,
  p_supplier_id uuid default null,
  p_category_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_owner uuid := app_private.resolve_shop_inventory_owner(p_shop_id);
  v_barcode text := upper(btrim(coalesce(p_barcode, '')));
  v_item_number text := nullif(upper(btrim(coalesce(p_item_number, ''))), '');
  v_product_name text := nullif(app_private.normalize_admin_label(p_product_name), '');
  v_second_product_name text := nullif(app_private.normalize_admin_label(p_second_product_name), '');
  v_product_id uuid;
  audit_event_id uuid;
begin
  if v_owner is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id);
  end if;

  if length(v_barcode) = 0
    or v_product_name is null
    or coalesce(p_purchase_price, 0) < 0
    or coalesce(p_retail_price, 0) < 0
    or coalesce(p_stock_quantity, 0) < 0 then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.product.create.failure', 'warning', 'blocked',
      'product', null, 'validation_failed', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id, null, audit_event_id);
  end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.inventory_suppliers
    where id = p_supplier_id and owner_user_id = v_owner and deleted_at is null
  ) then
    return app_private.shop_admin_action_result(false, 'invalid_supplier', p_shop_id);
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.inventory_categories
    where id = p_category_id and owner_user_id = v_owner and deleted_at is null
  ) then
    return app_private.shop_admin_action_result(false, 'invalid_category', p_shop_id);
  end if;

  insert into public.inventory_products (
    owner_user_id,
    barcode,
    item_number,
    product_name,
    second_product_name,
    purchase_price,
    retail_price,
    supplier_id,
    category_id,
    stock_quantity,
    updated_at
  )
  values (
    v_owner,
    v_barcode,
    v_item_number,
    v_product_name,
    v_second_product_name,
    p_purchase_price,
    p_retail_price,
    p_supplier_id,
    p_category_id,
    p_stock_quantity,
    now()
  )
  returning id into v_product_id;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.catalog.product.create.success', 'info', 'success',
    'product', v_product_id::text, 'success', jsonb_build_object('barcode_length', length(v_barcode))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, v_product_id::text, audit_event_id);
exception
  when unique_violation then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.product.create.failure', 'warning', 'blocked',
      'product', null, 'conflict', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'conflict', p_shop_id, null, audit_event_id);
  when others then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.product.create.failure', 'critical', 'failure',
      'product', null, 'db_failure', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'db_failure', p_shop_id, null, audit_event_id);
end;
$$;

create or replace function public.shop_catalog_update_product(
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
  p_category_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_owner uuid := app_private.resolve_shop_inventory_owner(p_shop_id);
  v_barcode text := upper(btrim(coalesce(p_barcode, '')));
  v_item_number text := nullif(upper(btrim(coalesce(p_item_number, ''))), '');
  v_product_name text := nullif(app_private.normalize_admin_label(p_product_name), '');
  v_second_product_name text := nullif(app_private.normalize_admin_label(p_second_product_name), '');
  audit_event_id uuid;
begin
  if v_owner is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id, p_product_id::text);
  end if;

  if length(v_barcode) = 0
    or v_product_name is null
    or coalesce(p_purchase_price, 0) < 0
    or coalesce(p_retail_price, 0) < 0
    or coalesce(p_stock_quantity, 0) < 0 then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.product.update.failure', 'warning', 'blocked',
      'product', p_product_id::text, 'validation_failed', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id, p_product_id::text, audit_event_id);
  end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.inventory_suppliers
    where id = p_supplier_id and owner_user_id = v_owner and deleted_at is null
  ) then
    return app_private.shop_admin_action_result(false, 'invalid_supplier', p_shop_id, p_product_id::text);
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.inventory_categories
    where id = p_category_id and owner_user_id = v_owner and deleted_at is null
  ) then
    return app_private.shop_admin_action_result(false, 'invalid_category', p_shop_id, p_product_id::text);
  end if;

  update public.inventory_products
  set barcode = v_barcode,
      item_number = v_item_number,
      product_name = v_product_name,
      second_product_name = v_second_product_name,
      purchase_price = p_purchase_price,
      retail_price = p_retail_price,
      supplier_id = p_supplier_id,
      category_id = p_category_id,
      stock_quantity = p_stock_quantity,
      updated_at = now()
  where id = p_product_id
    and owner_user_id = v_owner
    and deleted_at is null;

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_product_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.catalog.product.update.success', 'info', 'success',
    'product', p_product_id::text, 'success', jsonb_build_object('barcode_length', length(v_barcode))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_product_id::text, audit_event_id);
exception
  when unique_violation then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.product.update.failure', 'warning', 'blocked',
      'product', p_product_id::text, 'conflict', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'conflict', p_shop_id, p_product_id::text, audit_event_id);
  when others then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.product.update.failure', 'critical', 'failure',
      'product', p_product_id::text, 'db_failure', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'db_failure', p_shop_id, p_product_id::text, audit_event_id);
end;
$$;

create or replace function public.shop_catalog_archive_product(
  p_shop_id uuid,
  p_product_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_owner uuid := app_private.resolve_shop_inventory_owner(p_shop_id);
  audit_event_id uuid;
begin
  if v_owner is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id, p_product_id::text);
  end if;

  update public.inventory_products
  set deleted_at = now(),
      updated_at = now()
  where id = p_product_id
    and owner_user_id = v_owner
    and deleted_at is null;

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_product_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.catalog.product.archive.success', 'warning', 'success',
    'product', p_product_id::text, 'success',
    jsonb_build_object('reason_redacted', nullif(left(app_private.normalize_admin_label(p_reason), 160), ''))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_product_id::text, audit_event_id);
end;
$$;

create or replace function public.shop_staff_create(
  p_shop_id uuid,
  p_staff_code text,
  p_display_name text,
  p_role_key text,
  p_credential_kind text,
  p_credential_hash text,
  p_credential_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  v_staff_code text := upper(btrim(coalesce(p_staff_code, '')));
  v_display_name text := app_private.normalize_admin_label(p_display_name);
  v_role_key text := btrim(coalesce(p_role_key, ''));
  v_credential_kind text := btrim(coalesce(p_credential_kind, ''));
  v_credential_hash text := btrim(coalesce(p_credential_hash, ''));
  v_staff_id uuid;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_active_shop_staff_admin_member(p_shop_id) then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id);
  end if;

  if v_staff_code !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
    or length(v_display_name) = 0
    or v_role_key not in ('cashier', 'manager', 'viewer')
    or v_credential_kind not in ('pin', 'password')
    or length(v_credential_hash) = 0 then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.staff.create.failure', 'warning', 'blocked',
      'staff', null, 'validation_failed', jsonb_build_object('staff_code_length', length(v_staff_code))
    );
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id, null, audit_event_id);
  end if;

  insert into public.staff_accounts (
    shop_id,
    staff_code,
    display_name,
    role_key,
    status,
    credential_kind,
    credential_hash,
    credential_updated_at,
    credential_expires_at,
    must_change_credential,
    created_by_profile_id,
    updated_by_profile_id,
    updated_at
  )
  values (
    p_shop_id,
    v_staff_code,
    v_display_name,
    v_role_key,
    'active',
    v_credential_kind,
    v_credential_hash,
    now(),
    p_credential_expires_at,
    true,
    actor_id,
    actor_id,
    now()
  )
  returning staff_id into v_staff_id;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.staff.create.success', 'info', 'success',
    'staff', v_staff_id::text, 'success',
    jsonb_build_object('role_key', v_role_key, 'credential_kind', v_credential_kind)
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, v_staff_id::text, audit_event_id);
exception
  when unique_violation then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.staff.create.failure', 'warning', 'blocked',
      'staff', null, 'duplicate_staff_code', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'duplicate_staff_code', p_shop_id, null, audit_event_id);
  when others then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.staff.create.failure', 'critical', 'failure',
      'staff', null, 'db_failure', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'db_failure', p_shop_id, null, audit_event_id);
end;
$$;

create or replace function public.shop_staff_reset_credential(
  p_shop_id uuid,
  p_staff_id uuid,
  p_credential_kind text,
  p_credential_hash text,
  p_credential_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  v_credential_kind text := btrim(coalesce(p_credential_kind, ''));
  v_credential_hash text := btrim(coalesce(p_credential_hash, ''));
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_active_shop_staff_admin_member(p_shop_id) then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id, p_staff_id::text);
  end if;

  if v_credential_kind not in ('pin', 'password') or length(v_credential_hash) = 0 then
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id, p_staff_id::text);
  end if;

  update public.staff_accounts
  set credential_kind = v_credential_kind,
      credential_hash = v_credential_hash,
      credential_updated_at = now(),
      credential_expires_at = p_credential_expires_at,
      must_change_credential = true,
      failed_attempts = 0,
      locked_until = null,
      status = case when status = 'archived' then status else 'active' end,
      updated_by_profile_id = actor_id,
      updated_at = now()
  where staff_id = p_staff_id
    and shop_id = p_shop_id
    and status <> 'archived';

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_staff_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.staff.credential.reset.success', 'warning', 'success',
    'staff', p_staff_id::text, 'success', jsonb_build_object('credential_kind', v_credential_kind)
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_staff_id::text, audit_event_id);
end;
$$;

create or replace function public.shop_staff_suspend(
  p_shop_id uuid,
  p_staff_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_active_shop_staff_admin_member(p_shop_id) then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id, p_staff_id::text);
  end if;

  update public.staff_accounts
  set status = 'suspended',
      updated_by_profile_id = actor_id,
      updated_at = now()
  where staff_id = p_staff_id
    and shop_id = p_shop_id
    and status in ('pending_credential', 'active');

  if not found then
    return app_private.shop_admin_action_result(false, 'invalid_state_or_not_found', p_shop_id, p_staff_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.staff.suspend.success', 'warning', 'success',
    'staff', p_staff_id::text, 'success',
    jsonb_build_object('reason_redacted', nullif(left(app_private.normalize_admin_label(p_reason), 160), ''))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_staff_id::text, audit_event_id);
end;
$$;

create or replace function public.shop_staff_reactivate(
  p_shop_id uuid,
  p_staff_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_active_shop_staff_admin_member(p_shop_id) then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id, p_staff_id::text);
  end if;

  update public.staff_accounts
  set status = case
        when credential_hash is null then 'pending_credential'
        else 'active'
      end,
      updated_by_profile_id = actor_id,
      updated_at = now()
  where staff_id = p_staff_id
    and shop_id = p_shop_id
    and status = 'suspended';

  if not found then
    return app_private.shop_admin_action_result(false, 'invalid_state_or_not_found', p_shop_id, p_staff_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.staff.reactivate.success', 'info', 'success',
    'staff', p_staff_id::text, 'success',
    jsonb_build_object('reason_redacted', nullif(left(app_private.normalize_admin_label(p_reason), 160), ''))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_staff_id::text, audit_event_id);
end;
$$;

create or replace function public.shop_staff_archive(
  p_shop_id uuid,
  p_staff_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_active_shop_staff_admin_member(p_shop_id) then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id, p_staff_id::text);
  end if;

  update public.staff_accounts
  set status = 'archived',
      updated_by_profile_id = actor_id,
      updated_at = now()
  where staff_id = p_staff_id
    and shop_id = p_shop_id
    and status <> 'archived';

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_staff_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.staff.archive.success', 'warning', 'success',
    'staff', p_staff_id::text, 'success',
    jsonb_build_object('reason_redacted', nullif(left(app_private.normalize_admin_label(p_reason), 160), ''))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_staff_id::text, audit_event_id);
end;
$$;

create table if not exists public.shop_devices (
  shop_device_id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  device_identifier text not null,
  device_type text not null default 'unknown',
  display_name text not null,
  app_version text,
  status text not null default 'pending',
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by_profile_id uuid references public.profiles(profile_id),
  reactivated_at timestamptz,
  reactivated_by_profile_id uuid references public.profiles(profile_id),
  metadata_redacted jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid references public.profiles(profile_id),
  updated_by_profile_id uuid references public.profiles(profile_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_devices_identifier_not_blank check (length(btrim(device_identifier)) > 0),
  constraint shop_devices_identifier_length check (length(device_identifier) <= 160),
  constraint shop_devices_display_name_not_blank check (length(btrim(display_name)) > 0),
  constraint shop_devices_type_check check (device_type in ('mobile', 'pos', 'web', 'unknown')),
  constraint shop_devices_status_check check (
    status in ('pending', 'active', 'revoked', 'suspicious')
  ),
  constraint shop_devices_metadata_object_check check (
    jsonb_typeof(metadata_redacted) = 'object'
  ),
  constraint shop_devices_shop_identifier_unique unique (shop_id, device_identifier)
);

create index if not exists shop_devices_shop_status_idx
  on public.shop_devices(shop_id, status, updated_at);

create index if not exists shop_devices_shop_identifier_idx
  on public.shop_devices(shop_id, device_identifier);

alter table public.shop_devices enable row level security;

drop policy if exists shop_devices_select_shop_owner_manager
  on public.shop_devices;
create policy shop_devices_select_shop_owner_manager
  on public.shop_devices
  for select
  to authenticated
  using (
    app_private.is_active_shop_staff_admin_member(shop_id)
  );

revoke all on table public.shop_devices from anon;
revoke all on table public.shop_devices from authenticated;
grant select on table public.shop_devices to authenticated;

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
    or v_metadata ?| array['token', 'secret', 'password', 'pin', 'hash', 'credential'] then
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
    metadata_redacted = excluded.metadata_redacted,
    status = case
      when public.shop_devices.status = 'revoked' then public.shop_devices.status
      else 'active'
    end,
    updated_by_profile_id = actor_id,
    updated_at = now()
  returning shop_device_id into v_device_id;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.device.register.success', 'info', 'success',
    'device', v_device_id::text, 'success', jsonb_build_object('device_type', v_device_type)
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, v_device_id::text, audit_event_id);
end;
$$;

create or replace function public.shop_device_rename(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  v_display_name text := app_private.normalize_admin_label(p_display_name);
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_active_shop_staff_admin_member(p_shop_id) then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id, p_shop_device_id::text);
  end if;

  if length(v_display_name) = 0 then
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id, p_shop_device_id::text);
  end if;

  update public.shop_devices
  set display_name = v_display_name,
      updated_by_profile_id = actor_id,
      updated_at = now()
  where shop_device_id = p_shop_device_id
    and shop_id = p_shop_id;

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_shop_device_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.device.rename.success', 'info', 'success',
    'device', p_shop_device_id::text, 'success', jsonb_build_object('name_length', length(v_display_name))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_shop_device_id::text, audit_event_id);
end;
$$;

create or replace function public.shop_device_revoke(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_active_shop_staff_admin_member(p_shop_id) then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id, p_shop_device_id::text);
  end if;

  update public.shop_devices
  set status = 'revoked',
      revoked_at = now(),
      revoked_by_profile_id = actor_id,
      updated_by_profile_id = actor_id,
      updated_at = now()
  where shop_device_id = p_shop_device_id
    and shop_id = p_shop_id
    and status <> 'revoked';

  if not found then
    return app_private.shop_admin_action_result(false, 'invalid_state_or_not_found', p_shop_id, p_shop_device_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.device.revoke.success', 'warning', 'success',
    'device', p_shop_device_id::text, 'success',
    jsonb_build_object('reason_redacted', nullif(left(app_private.normalize_admin_label(p_reason), 160), ''))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_shop_device_id::text, audit_event_id);
end;
$$;

create or replace function public.shop_device_reactivate(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_active_shop_staff_admin_member(p_shop_id) then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id, p_shop_device_id::text);
  end if;

  update public.shop_devices
  set status = 'active',
      revoked_at = null,
      revoked_by_profile_id = null,
      reactivated_at = now(),
      reactivated_by_profile_id = actor_id,
      updated_by_profile_id = actor_id,
      updated_at = now()
  where shop_device_id = p_shop_device_id
    and shop_id = p_shop_id
    and status = 'revoked';

  if not found then
    return app_private.shop_admin_action_result(false, 'invalid_state_or_not_found', p_shop_id, p_shop_device_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.device.reactivate.success', 'info', 'success',
    'device', p_shop_device_id::text, 'success',
    jsonb_build_object('reason_redacted', nullif(left(app_private.normalize_admin_label(p_reason), 160), ''))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_shop_device_id::text, audit_event_id);
end;
$$;

revoke all on function app_private.shop_admin_action_result(boolean, text, uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function app_private.normalize_admin_label(text) from public, anon, authenticated;
revoke all on function app_private.resolve_shop_inventory_owner(uuid) from public, anon, authenticated;
grant execute on function app_private.resolve_shop_inventory_owner(uuid) to authenticated;
revoke all on function app_private.write_shop_admin_audit(uuid, text, text, text, text, text, text, jsonb) from public, anon, authenticated;

revoke all on function public.shop_admin_audit_event(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.shop_admin_audit_event(uuid, text, text, text, jsonb) to authenticated;

revoke all on function public.shop_catalog_create_supplier(uuid, text) from public, anon, authenticated;
revoke all on function public.shop_catalog_update_supplier(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.shop_catalog_archive_supplier(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.shop_catalog_create_category(uuid, text) from public, anon, authenticated;
revoke all on function public.shop_catalog_update_category(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.shop_catalog_archive_category(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.shop_catalog_create_product(uuid, text, text, text, text, double precision, double precision, double precision, uuid, uuid) from public, anon, authenticated;
revoke all on function public.shop_catalog_update_product(uuid, uuid, text, text, text, text, double precision, double precision, double precision, uuid, uuid) from public, anon, authenticated;
revoke all on function public.shop_catalog_archive_product(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.shop_catalog_create_supplier(uuid, text) to authenticated;
grant execute on function public.shop_catalog_update_supplier(uuid, uuid, text) to authenticated;
grant execute on function public.shop_catalog_archive_supplier(uuid, uuid, text) to authenticated;
grant execute on function public.shop_catalog_create_category(uuid, text) to authenticated;
grant execute on function public.shop_catalog_update_category(uuid, uuid, text) to authenticated;
grant execute on function public.shop_catalog_archive_category(uuid, uuid, text) to authenticated;
grant execute on function public.shop_catalog_create_product(uuid, text, text, text, text, double precision, double precision, double precision, uuid, uuid) to authenticated;
grant execute on function public.shop_catalog_update_product(uuid, uuid, text, text, text, text, double precision, double precision, double precision, uuid, uuid) to authenticated;
grant execute on function public.shop_catalog_archive_product(uuid, uuid, text) to authenticated;

revoke all on function public.shop_staff_create(uuid, text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.shop_staff_reset_credential(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.shop_staff_suspend(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.shop_staff_reactivate(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.shop_staff_archive(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.shop_staff_create(uuid, text, text, text, text, text, timestamptz) to authenticated;
grant execute on function public.shop_staff_reset_credential(uuid, uuid, text, text, timestamptz) to authenticated;
grant execute on function public.shop_staff_suspend(uuid, uuid, text) to authenticated;
grant execute on function public.shop_staff_reactivate(uuid, uuid, text) to authenticated;
grant execute on function public.shop_staff_archive(uuid, uuid, text) to authenticated;

revoke all on function public.shop_device_register(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.shop_device_rename(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.shop_device_revoke(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.shop_device_reactivate(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.shop_device_register(uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.shop_device_rename(uuid, uuid, text) to authenticated;
grant execute on function public.shop_device_revoke(uuid, uuid, text) to authenticated;
grant execute on function public.shop_device_reactivate(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
