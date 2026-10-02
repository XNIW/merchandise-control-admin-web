-- WECHAT-010: preserve canonical case-sensitive catalog identity text.
-- Four upper() wrappers removed only; existing trim/nullif, validators, sync,
-- optimistic revisions, authorization, privileges and stored rows are unchanged.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

do $guard$
begin
  if current_user <> 'postgres' or (
    select count(*)
    from (values
      ('public.shop_catalog_create_product(uuid,text,text,text,text,double precision,double precision,double precision,uuid,uuid)','3db4463ff1500440cf1277a0aa969fab',array['p_shop_id','p_barcode','p_item_number','p_product_name','p_second_product_name','p_purchase_price','p_retail_price','p_stock_quantity','p_supplier_id','p_category_id']),
      ('public.shop_catalog_update_product(uuid,uuid,text,text,text,text,double precision,double precision,double precision,uuid,uuid)','c8f87dd239c72163af218499f144fb2f',array['p_shop_id','p_product_id','p_barcode','p_item_number','p_product_name','p_second_product_name','p_purchase_price','p_retail_price','p_stock_quantity','p_supplier_id','p_category_id'])
    ) expected(signature,source_md5,argnames)
    join pg_catalog.pg_proc f on f.oid=pg_catalog.to_regprocedure(expected.signature)
    cross join lateral (
      select pg_catalog.array_agg(item::text order by item::text collate "C") as entries
      from pg_catalog.unnest(f.proacl) acl(item)
    ) actual_acl
    where pg_catalog.pg_get_userbyid(f.proowner)='postgres'
      and pg_catalog.md5(f.prosrc)=expected.source_md5
      and f.prolang=(select oid from pg_catalog.pg_language where lanname='plpgsql')
      and f.prorettype='jsonb'::regtype and not f.proretset and f.prokind='f'
      and f.prosecdef and f.provolatile='v'::"char" and f.proparallel='u'::"char"
      and not f.proisstrict and not f.proleakproof and f.procost=100 and f.prorows=0
      and f.proconfig=array['search_path=public, app_private, pg_temp']
      and f.probin is null and f.prosqlbody is null and f.prosupport=0
      and f.proargnames=expected.argnames and f.proargmodes is null
      and f.proallargtypes is null and f.provariadic=0 and f.protrftypes is null
      and f.pronargdefaults=8
      and pg_catalog.pg_get_expr(f.proargdefaults,0)=
        'NULL::text, NULL::text, NULL::text, NULL::double precision, NULL::double precision, NULL::double precision, NULL::uuid, NULL::uuid'
      -- Complete ACL equality preserves grantors and grant options; CREATE OR
      -- REPLACE retains the accepted existing set, OID and owner without grants.
      and actual_acl.entries in (
        array['authenticated=X/postgres','postgres=X/postgres'],
        array['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']
      )
  ) <> 2 then
    raise exception 'admin_identity_case_baseline_mismatch' using errcode='55000';
  end if;
end;
$guard$;

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
  v_barcode text := btrim(coalesce(p_barcode, ''));
  v_item_number text := nullif(btrim(coalesce(p_item_number, '')), '');
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
  v_barcode text := btrim(coalesce(p_barcode, ''));
  v_item_number text := nullif(btrim(coalesce(p_item_number, '')), '');
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

commit;
