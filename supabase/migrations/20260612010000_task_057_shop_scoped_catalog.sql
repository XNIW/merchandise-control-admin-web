-- TASK-057: shop-scoped catalog transition.
-- Canonical target: inventory rows belong to shops.shop_id.
-- owner_user_id remains as a nullable-future compatibility bridge for legacy
-- Android/iOS inventory and current NOT NULL constraints.

begin;

alter table public.inventory_products
  add column if not exists shop_id uuid references public.shops(shop_id) on delete cascade;
alter table public.inventory_categories
  add column if not exists shop_id uuid references public.shops(shop_id) on delete cascade;
alter table public.inventory_suppliers
  add column if not exists shop_id uuid references public.shops(shop_id) on delete cascade;
alter table public.inventory_product_prices
  add column if not exists shop_id uuid references public.shops(shop_id) on delete cascade;

with mapped_sources as (
  select owner_user_id, (array_agg(distinct shop_id))[1] as shop_id
  from public.shop_inventory_sources
  where mapping_state = 'mapped'
    and disabled_at is null
    and owner_user_id is not null
    and shop_id is not null
  group by owner_user_id
  having count(distinct shop_id) = 1
)
update public.inventory_products p
set shop_id = mapped_sources.shop_id
from mapped_sources
where p.shop_id is null
  and p.owner_user_id = mapped_sources.owner_user_id;

with mapped_sources as (
  select owner_user_id, (array_agg(distinct shop_id))[1] as shop_id
  from public.shop_inventory_sources
  where mapping_state = 'mapped'
    and disabled_at is null
    and owner_user_id is not null
    and shop_id is not null
  group by owner_user_id
  having count(distinct shop_id) = 1
)
update public.inventory_categories c
set shop_id = mapped_sources.shop_id
from mapped_sources
where c.shop_id is null
  and c.owner_user_id = mapped_sources.owner_user_id;

with mapped_sources as (
  select owner_user_id, (array_agg(distinct shop_id))[1] as shop_id
  from public.shop_inventory_sources
  where mapping_state = 'mapped'
    and disabled_at is null
    and owner_user_id is not null
    and shop_id is not null
  group by owner_user_id
  having count(distinct shop_id) = 1
)
update public.inventory_suppliers s
set shop_id = mapped_sources.shop_id
from mapped_sources
where s.shop_id is null
  and s.owner_user_id = mapped_sources.owner_user_id;

with mapped_sources as (
  select owner_user_id, (array_agg(distinct shop_id))[1] as shop_id
  from public.shop_inventory_sources
  where mapping_state = 'mapped'
    and disabled_at is null
    and owner_user_id is not null
    and shop_id is not null
  group by owner_user_id
  having count(distinct shop_id) = 1
)
update public.inventory_product_prices pp
set shop_id = mapped_sources.shop_id
from mapped_sources
where pp.shop_id is null
  and pp.owner_user_id = mapped_sources.owner_user_id;

drop index if exists inventory_suppliers_owner_name_lower_active;
drop index if exists inventory_categories_owner_name_lower_active;
drop index if exists inventory_products_owner_barcode_active;

create unique index if not exists inventory_suppliers_shop_name_lower_active
  on public.inventory_suppliers (shop_id, lower(name))
  where shop_id is not null and deleted_at is null;
create unique index if not exists inventory_suppliers_legacy_owner_name_lower_active
  on public.inventory_suppliers (owner_user_id, lower(name))
  where shop_id is null and deleted_at is null;

create unique index if not exists inventory_categories_shop_name_lower_active
  on public.inventory_categories (shop_id, lower(name))
  where shop_id is not null and deleted_at is null;
create unique index if not exists inventory_categories_legacy_owner_name_lower_active
  on public.inventory_categories (owner_user_id, lower(name))
  where shop_id is null and deleted_at is null;

create unique index if not exists inventory_products_shop_barcode_active
  on public.inventory_products (shop_id, barcode)
  where shop_id is not null and deleted_at is null;
create unique index if not exists inventory_products_legacy_owner_barcode_active
  on public.inventory_products (owner_user_id, barcode)
  where shop_id is null and deleted_at is null;
create index if not exists inventory_products_shop_item_number_active
  on public.inventory_products (shop_id, item_number)
  where shop_id is not null and item_number is not null and deleted_at is null;
create index if not exists inventory_product_prices_shop_product_created
  on public.inventory_product_prices (shop_id, product_id, created_at)
  where shop_id is not null;

create policy inventory_suppliers_select_shop_member
  on public.inventory_suppliers for select to authenticated
  using (shop_id is not null and app_private.is_active_shop_member(shop_id));
create policy inventory_categories_select_shop_member
  on public.inventory_categories for select to authenticated
  using (shop_id is not null and app_private.is_active_shop_member(shop_id));
create policy inventory_products_select_shop_member
  on public.inventory_products for select to authenticated
  using (shop_id is not null and app_private.is_active_shop_member(shop_id));
create policy inventory_product_prices_select_shop_member
  on public.inventory_product_prices for select to authenticated
  using (shop_id is not null and app_private.is_active_shop_member(shop_id));

create or replace function app_private.resolve_shop_catalog_scope(
  target_shop_id uuid
)
returns table (
  catalog_shop_id uuid,
  owner_user_id uuid,
  catalog_scope text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  mapping_row public.shop_inventory_sources%rowtype;
  compatibility_owner_id uuid;
begin
  if target_shop_id is null
    or not app_private.is_active_shop_staff_admin_member(target_shop_id) then
    return;
  end if;

  select *
  into mapping_row
  from public.shop_inventory_sources sis
  where sis.shop_id = target_shop_id
    and sis.disabled_at is null
  order by (sis.mapping_state = 'mapped') desc, sis.created_at desc
  limit 1;

  if mapping_row.shop_inventory_source_id is not null
    and mapping_row.mapping_state <> 'mapped' then
    return;
  end if;

  if mapping_row.mapping_state = 'mapped' and mapping_row.owner_user_id is not null then
    compatibility_owner_id := mapping_row.owner_user_id;
  else
    compatibility_owner_id := actor_id;
  end if;

  if compatibility_owner_id is null then
    select s.created_by_profile_id
    into compatibility_owner_id
    from public.shops s
    where s.shop_id = target_shop_id;
  end if;

  if compatibility_owner_id is null then
    select sm.profile_id
    into compatibility_owner_id
    from public.shop_members sm
    where sm.shop_id = target_shop_id
      and sm.membership_status = 'active'
      and sm.role_key in ('shop_owner', 'shop_manager')
    order by case sm.role_key when 'shop_owner' then 0 else 1 end, sm.created_at
    limit 1;
  end if;

  if compatibility_owner_id is null then
    return;
  end if;

  catalog_shop_id := target_shop_id;
  owner_user_id := compatibility_owner_id;
  catalog_scope := case
    when mapping_row.mapping_state = 'mapped' then 'legacy_owner_bridge'
    else 'shop_scoped'
  end;
  return next;
end;
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
  select scope.owner_user_id
  from app_private.resolve_shop_catalog_scope(target_shop_id) scope
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
      jsonb_build_object(
        'code', p_code,
        'source', coalesce(safe_metadata->>'source', 'admin_web')
      )
      || (safe_metadata - 'source')
    )
  )
  returning audit_log_id into inserted_id;

  return inserted_id;
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
  v_scope record;
  v_name text := app_private.normalize_admin_label(p_name);
  v_supplier_id uuid;
  audit_event_id uuid;
begin
  select * into v_scope from app_private.resolve_shop_catalog_scope(p_shop_id);

  if v_scope.owner_user_id is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id);
  end if;

  if length(v_name) = 0 then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.supplier.create.failure', 'warning', 'blocked',
      'supplier', null, 'validation_failed',
      jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
    );
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id, null, audit_event_id);
  end if;

  insert into public.inventory_suppliers (shop_id, owner_user_id, name, updated_at)
  values (p_shop_id, v_scope.owner_user_id, v_name, now())
  returning id into v_supplier_id;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.catalog.supplier.create.success', 'info', 'success',
    'supplier', v_supplier_id::text, 'success',
    jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web', 'name_length', length(v_name))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, v_supplier_id::text, audit_event_id);
exception
  when unique_violation then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.supplier.create.failure', 'warning', 'blocked',
      'supplier', null, 'conflict', jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
    );
    return app_private.shop_admin_action_result(false, 'conflict', p_shop_id, null, audit_event_id);
  when others then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.supplier.create.failure', 'critical', 'failure',
      'supplier', null, 'db_failure', jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
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
  v_scope record;
  v_name text := app_private.normalize_admin_label(p_name);
  audit_event_id uuid;
begin
  select * into v_scope from app_private.resolve_shop_catalog_scope(p_shop_id);

  if v_scope.owner_user_id is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id, p_supplier_id::text);
  end if;

  if length(v_name) = 0 then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.supplier.update.failure', 'warning', 'blocked',
      'supplier', p_supplier_id::text, 'validation_failed',
      jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
    );
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id, p_supplier_id::text, audit_event_id);
  end if;

  update public.inventory_suppliers
  set name = v_name,
      shop_id = p_shop_id,
      updated_at = now()
  where id = p_supplier_id
    and deleted_at is null
    and (shop_id = p_shop_id or (shop_id is null and owner_user_id = v_scope.owner_user_id));

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_supplier_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.catalog.supplier.update.success', 'info', 'success',
    'supplier', p_supplier_id::text, 'success',
    jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web', 'name_length', length(v_name))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_supplier_id::text, audit_event_id);
exception
  when unique_violation then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.supplier.update.failure', 'warning', 'blocked',
      'supplier', p_supplier_id::text, 'conflict', jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
    );
    return app_private.shop_admin_action_result(false, 'conflict', p_shop_id, p_supplier_id::text, audit_event_id);
  when others then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.supplier.update.failure', 'critical', 'failure',
      'supplier', p_supplier_id::text, 'db_failure', jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
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
  v_scope record;
  audit_event_id uuid;
begin
  select * into v_scope from app_private.resolve_shop_catalog_scope(p_shop_id);

  if v_scope.owner_user_id is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id, p_supplier_id::text);
  end if;

  update public.inventory_suppliers
  set deleted_at = now(),
      shop_id = p_shop_id,
      updated_at = now()
  where id = p_supplier_id
    and deleted_at is null
    and (shop_id = p_shop_id or (shop_id is null and owner_user_id = v_scope.owner_user_id));

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_supplier_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.catalog.supplier.archive.success', 'warning', 'success',
    'supplier', p_supplier_id::text, 'success',
    jsonb_build_object(
      'catalog_scope', v_scope.catalog_scope,
      'source', 'admin_web',
      'reason_redacted', nullif(left(app_private.normalize_admin_label(p_reason), 160), '')
    )
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
  v_scope record;
  v_name text := app_private.normalize_admin_label(p_name);
  v_category_id uuid;
  audit_event_id uuid;
begin
  select * into v_scope from app_private.resolve_shop_catalog_scope(p_shop_id);

  if v_scope.owner_user_id is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id);
  end if;

  if length(v_name) = 0 then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.category.create.failure', 'warning', 'blocked',
      'category', null, 'validation_failed',
      jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
    );
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id, null, audit_event_id);
  end if;

  insert into public.inventory_categories (shop_id, owner_user_id, name, updated_at)
  values (p_shop_id, v_scope.owner_user_id, v_name, now())
  returning id into v_category_id;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.catalog.category.create.success', 'info', 'success',
    'category', v_category_id::text, 'success',
    jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web', 'name_length', length(v_name))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, v_category_id::text, audit_event_id);
exception
  when unique_violation then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.category.create.failure', 'warning', 'blocked',
      'category', null, 'conflict', jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
    );
    return app_private.shop_admin_action_result(false, 'conflict', p_shop_id, null, audit_event_id);
  when others then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.category.create.failure', 'critical', 'failure',
      'category', null, 'db_failure', jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
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
  v_scope record;
  v_name text := app_private.normalize_admin_label(p_name);
  audit_event_id uuid;
begin
  select * into v_scope from app_private.resolve_shop_catalog_scope(p_shop_id);

  if v_scope.owner_user_id is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id, p_category_id::text);
  end if;

  if length(v_name) = 0 then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.category.update.failure', 'warning', 'blocked',
      'category', p_category_id::text, 'validation_failed',
      jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
    );
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id, p_category_id::text, audit_event_id);
  end if;

  update public.inventory_categories
  set name = v_name,
      shop_id = p_shop_id,
      updated_at = now()
  where id = p_category_id
    and deleted_at is null
    and (shop_id = p_shop_id or (shop_id is null and owner_user_id = v_scope.owner_user_id));

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_category_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.catalog.category.update.success', 'info', 'success',
    'category', p_category_id::text, 'success',
    jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web', 'name_length', length(v_name))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_category_id::text, audit_event_id);
exception
  when unique_violation then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.category.update.failure', 'warning', 'blocked',
      'category', p_category_id::text, 'conflict', jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
    );
    return app_private.shop_admin_action_result(false, 'conflict', p_shop_id, p_category_id::text, audit_event_id);
  when others then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.category.update.failure', 'critical', 'failure',
      'category', p_category_id::text, 'db_failure', jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
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
  v_scope record;
  audit_event_id uuid;
begin
  select * into v_scope from app_private.resolve_shop_catalog_scope(p_shop_id);

  if v_scope.owner_user_id is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id, p_category_id::text);
  end if;

  update public.inventory_categories
  set deleted_at = now(),
      shop_id = p_shop_id,
      updated_at = now()
  where id = p_category_id
    and deleted_at is null
    and (shop_id = p_shop_id or (shop_id is null and owner_user_id = v_scope.owner_user_id));

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_category_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.catalog.category.archive.success', 'warning', 'success',
    'category', p_category_id::text, 'success',
    jsonb_build_object(
      'catalog_scope', v_scope.catalog_scope,
      'source', 'admin_web',
      'reason_redacted', nullif(left(app_private.normalize_admin_label(p_reason), 160), '')
    )
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
  v_scope record;
  v_barcode text := upper(btrim(coalesce(p_barcode, '')));
  v_item_number text := nullif(upper(btrim(coalesce(p_item_number, ''))), '');
  v_product_name text := nullif(app_private.normalize_admin_label(p_product_name), '');
  v_second_product_name text := nullif(app_private.normalize_admin_label(p_second_product_name), '');
  v_product_id uuid;
  audit_event_id uuid;
begin
  select * into v_scope from app_private.resolve_shop_catalog_scope(p_shop_id);

  if v_scope.owner_user_id is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id);
  end if;

  if length(v_barcode) = 0
    or v_product_name is null
    or coalesce(p_purchase_price, 0) < 0
    or coalesce(p_retail_price, 0) < 0
    or coalesce(p_stock_quantity, 0) < 0 then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.product.create.failure', 'warning', 'blocked',
      'product', null, 'validation_failed',
      jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
    );
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id, null, audit_event_id);
  end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.inventory_suppliers
    where id = p_supplier_id
      and deleted_at is null
      and (shop_id = p_shop_id or (shop_id is null and owner_user_id = v_scope.owner_user_id))
  ) then
    return app_private.shop_admin_action_result(false, 'invalid_supplier', p_shop_id);
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.inventory_categories
    where id = p_category_id
      and deleted_at is null
      and (shop_id = p_shop_id or (shop_id is null and owner_user_id = v_scope.owner_user_id))
  ) then
    return app_private.shop_admin_action_result(false, 'invalid_category', p_shop_id);
  end if;

  insert into public.inventory_products (
    shop_id,
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
    p_shop_id,
    v_scope.owner_user_id,
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
    'product', v_product_id::text, 'success',
    jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web', 'barcode_length', length(v_barcode))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, v_product_id::text, audit_event_id);
exception
  when unique_violation then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.product.create.failure', 'warning', 'blocked',
      'product', null, 'conflict', jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
    );
    return app_private.shop_admin_action_result(false, 'conflict', p_shop_id, null, audit_event_id);
  when others then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.product.create.failure', 'critical', 'failure',
      'product', null, 'db_failure', jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
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
  v_scope record;
  v_barcode text := upper(btrim(coalesce(p_barcode, '')));
  v_item_number text := nullif(upper(btrim(coalesce(p_item_number, ''))), '');
  v_product_name text := nullif(app_private.normalize_admin_label(p_product_name), '');
  v_second_product_name text := nullif(app_private.normalize_admin_label(p_second_product_name), '');
  audit_event_id uuid;
begin
  select * into v_scope from app_private.resolve_shop_catalog_scope(p_shop_id);

  if v_scope.owner_user_id is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id, p_product_id::text);
  end if;

  if length(v_barcode) = 0
    or v_product_name is null
    or coalesce(p_purchase_price, 0) < 0
    or coalesce(p_retail_price, 0) < 0
    or coalesce(p_stock_quantity, 0) < 0 then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.product.update.failure', 'warning', 'blocked',
      'product', p_product_id::text, 'validation_failed',
      jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
    );
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id, p_product_id::text, audit_event_id);
  end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.inventory_suppliers
    where id = p_supplier_id
      and deleted_at is null
      and (shop_id = p_shop_id or (shop_id is null and owner_user_id = v_scope.owner_user_id))
  ) then
    return app_private.shop_admin_action_result(false, 'invalid_supplier', p_shop_id, p_product_id::text);
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.inventory_categories
    where id = p_category_id
      and deleted_at is null
      and (shop_id = p_shop_id or (shop_id is null and owner_user_id = v_scope.owner_user_id))
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
      shop_id = p_shop_id,
      updated_at = now()
  where id = p_product_id
    and deleted_at is null
    and (shop_id = p_shop_id or (shop_id is null and owner_user_id = v_scope.owner_user_id));

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_product_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.catalog.product.update.success', 'info', 'success',
    'product', p_product_id::text, 'success',
    jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web', 'barcode_length', length(v_barcode))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_product_id::text, audit_event_id);
exception
  when unique_violation then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.product.update.failure', 'warning', 'blocked',
      'product', p_product_id::text, 'conflict', jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
    );
    return app_private.shop_admin_action_result(false, 'conflict', p_shop_id, p_product_id::text, audit_event_id);
  when others then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.product.update.failure', 'critical', 'failure',
      'product', p_product_id::text, 'db_failure', jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
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
  v_scope record;
  audit_event_id uuid;
begin
  select * into v_scope from app_private.resolve_shop_catalog_scope(p_shop_id);

  if v_scope.owner_user_id is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id, p_product_id::text);
  end if;

  update public.inventory_products
  set deleted_at = now(),
      shop_id = p_shop_id,
      updated_at = now()
  where id = p_product_id
    and deleted_at is null
    and (shop_id = p_shop_id or (shop_id is null and owner_user_id = v_scope.owner_user_id));

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_product_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.catalog.product.archive.success', 'warning', 'success',
    'product', p_product_id::text, 'success',
    jsonb_build_object(
      'catalog_scope', v_scope.catalog_scope,
      'source', 'admin_web',
      'reason_redacted', nullif(left(app_private.normalize_admin_label(p_reason), 160), '')
    )
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_product_id::text, audit_event_id);
end;
$$;

create or replace function public.shop_catalog_restore_product(
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
  v_scope record;
  audit_event_id uuid;
begin
  select * into v_scope from app_private.resolve_shop_catalog_scope(p_shop_id);

  if v_scope.owner_user_id is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id, p_product_id::text);
  end if;

  perform set_config('app.catalog_restore_allowed', 'true', true);

  update public.inventory_products
  set deleted_at = null,
      shop_id = p_shop_id,
      updated_at = now()
  where id = p_product_id
    and deleted_at is not null
    and (shop_id = p_shop_id or (shop_id is null and owner_user_id = v_scope.owner_user_id));

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_product_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.catalog.product.restore.success', 'info', 'success',
    'product', p_product_id::text, 'success',
    jsonb_build_object(
      'catalog_scope', v_scope.catalog_scope,
      'source', 'admin_web',
      'reason_redacted', nullif(left(app_private.normalize_admin_label(p_reason), 160), '')
    )
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_product_id::text, audit_event_id);
exception
  when unique_violation then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.product.restore.failure', 'warning', 'blocked',
      'product', p_product_id::text, 'conflict', jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
    );
    return app_private.shop_admin_action_result(false, 'conflict', p_shop_id, p_product_id::text, audit_event_id);
  when others then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.product.restore.failure', 'critical', 'failure',
      'product', p_product_id::text, 'db_failure', jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
    );
    return app_private.shop_admin_action_result(false, 'db_failure', p_shop_id, p_product_id::text, audit_event_id);
end;
$$;

revoke all on function app_private.resolve_shop_catalog_scope(uuid) from public, anon, authenticated;
revoke all on function app_private.resolve_shop_inventory_owner(uuid) from public, anon, authenticated;
revoke all on function app_private.write_shop_admin_audit(uuid, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.shop_catalog_create_supplier(uuid, text) from public, anon, authenticated;
revoke all on function public.shop_catalog_update_supplier(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.shop_catalog_archive_supplier(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.shop_catalog_create_category(uuid, text) from public, anon, authenticated;
revoke all on function public.shop_catalog_update_category(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.shop_catalog_archive_category(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.shop_catalog_create_product(uuid, text, text, text, text, double precision, double precision, double precision, uuid, uuid) from public, anon, authenticated;
revoke all on function public.shop_catalog_update_product(uuid, uuid, text, text, text, text, double precision, double precision, double precision, uuid, uuid) from public, anon, authenticated;
revoke all on function public.shop_catalog_archive_product(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.shop_catalog_restore_product(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.shop_catalog_create_supplier(uuid, text) to authenticated;
grant execute on function public.shop_catalog_update_supplier(uuid, uuid, text) to authenticated;
grant execute on function public.shop_catalog_archive_supplier(uuid, uuid, text) to authenticated;
grant execute on function public.shop_catalog_create_category(uuid, text) to authenticated;
grant execute on function public.shop_catalog_update_category(uuid, uuid, text) to authenticated;
grant execute on function public.shop_catalog_archive_category(uuid, uuid, text) to authenticated;
grant execute on function public.shop_catalog_create_product(uuid, text, text, text, text, double precision, double precision, double precision, uuid, uuid) to authenticated;
grant execute on function public.shop_catalog_update_product(uuid, uuid, text, text, text, text, double precision, double precision, double precision, uuid, uuid) to authenticated;
grant execute on function public.shop_catalog_archive_product(uuid, uuid, text) to authenticated;
grant execute on function public.shop_catalog_restore_product(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
