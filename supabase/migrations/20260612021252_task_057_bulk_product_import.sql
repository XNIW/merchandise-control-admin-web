-- TASK-057: bulk product import path for full database workbooks.
-- Keeps full workbook apply server-side and audited without one HTTP/RPC
-- roundtrip per product row.

begin;

create or replace function public.shop_catalog_import_products(
  p_shop_id uuid,
  p_products jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_scope record;
  v_product jsonb;
  v_product_id uuid;
  v_requested_product_id uuid;
  v_barcode text;
  v_item_number text;
  v_product_name text;
  v_second_product_name text;
  v_purchase_price double precision;
  v_retail_price double precision;
  v_stock_quantity double precision;
  v_supplier_id uuid;
  v_category_id uuid;
  v_applied integer := 0;
  v_failed integer := 0;
  v_total integer := 0;
  v_product_ids jsonb := '[]'::jsonb;
  audit_event_id uuid;
begin
  select * into v_scope from app_private.resolve_shop_catalog_scope(p_shop_id);

  if v_scope.owner_user_id is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id);
  end if;

  if p_products is null or jsonb_typeof(p_products) <> 'array' then
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id);
  end if;

  if jsonb_array_length(p_products) > 80000 then
    return app_private.shop_admin_action_result(false, 'row_limit_exceeded', p_shop_id);
  end if;

  for v_product in select value from jsonb_array_elements(p_products)
  loop
    v_total := v_total + 1;

    begin
      if jsonb_typeof(v_product) <> 'object' then
        v_failed := v_failed + 1;
        continue;
      end if;

      v_requested_product_id := nullif(v_product->>'product_id', '')::uuid;
      v_barcode := nullif(left(app_private.normalize_admin_label(v_product->>'barcode'), 96), '');
      v_item_number := nullif(left(app_private.normalize_admin_label(v_product->>'item_number'), 120), '');
      v_product_name := nullif(left(app_private.normalize_admin_label(v_product->>'product_name'), 240), '');
      v_second_product_name := nullif(left(app_private.normalize_admin_label(v_product->>'second_product_name'), 240), '');
      v_purchase_price := nullif(v_product->>'purchase_price', '')::double precision;
      v_retail_price := nullif(v_product->>'retail_price', '')::double precision;
      v_stock_quantity := nullif(v_product->>'stock_quantity', '')::double precision;
      v_supplier_id := nullif(v_product->>'supplier_id', '')::uuid;
      v_category_id := nullif(v_product->>'category_id', '')::uuid;
      v_product_id := null;

      if v_barcode is null
        or v_product_name is null
        or coalesce(v_purchase_price, 0) < 0
        or coalesce(v_retail_price, 0) < 0
        or coalesce(v_stock_quantity, 0) < 0 then
        v_failed := v_failed + 1;
        continue;
      end if;

      if v_supplier_id is not null and not exists (
        select 1
        from public.inventory_suppliers supplier
        where supplier.id = v_supplier_id
          and supplier.deleted_at is null
          and (
            supplier.shop_id = p_shop_id
            or (supplier.shop_id is null and supplier.owner_user_id = v_scope.owner_user_id)
          )
      ) then
        v_failed := v_failed + 1;
        continue;
      end if;

      if v_category_id is not null and not exists (
        select 1
        from public.inventory_categories category
        where category.id = v_category_id
          and category.deleted_at is null
          and (
            category.shop_id = p_shop_id
            or (category.shop_id is null and category.owner_user_id = v_scope.owner_user_id)
          )
      ) then
        v_failed := v_failed + 1;
        continue;
      end if;

      if v_requested_product_id is not null then
        update public.inventory_products
        set barcode = v_barcode,
            item_number = v_item_number,
            product_name = v_product_name,
            second_product_name = v_second_product_name,
            purchase_price = v_purchase_price,
            retail_price = v_retail_price,
            stock_quantity = v_stock_quantity,
            supplier_id = v_supplier_id,
            category_id = v_category_id,
            shop_id = p_shop_id,
            owner_user_id = v_scope.owner_user_id,
            updated_at = now()
        where id = v_requested_product_id
          and deleted_at is null
          and (
            shop_id = p_shop_id
            or (shop_id is null and owner_user_id = v_scope.owner_user_id)
          )
        returning id into v_product_id;
      end if;

      if v_product_id is null then
        select product.id
        into v_product_id
        from public.inventory_products product
        where product.deleted_at is null
          and product.barcode = v_barcode
          and (
            product.shop_id = p_shop_id
            or (product.shop_id is null and product.owner_user_id = v_scope.owner_user_id)
          )
        order by (product.shop_id = p_shop_id) desc, product.updated_at desc
        limit 1;
      end if;

      if v_product_id is not null then
        update public.inventory_products
        set item_number = v_item_number,
            product_name = v_product_name,
            second_product_name = v_second_product_name,
            purchase_price = v_purchase_price,
            retail_price = v_retail_price,
            stock_quantity = v_stock_quantity,
            supplier_id = v_supplier_id,
            category_id = v_category_id,
            shop_id = p_shop_id,
            owner_user_id = v_scope.owner_user_id,
            updated_at = now()
        where id = v_product_id;
      else
        insert into public.inventory_products (
          owner_user_id,
          shop_id,
          barcode,
          item_number,
          product_name,
          second_product_name,
          purchase_price,
          retail_price,
          stock_quantity,
          supplier_id,
          category_id,
          updated_at
        )
        values (
          v_scope.owner_user_id,
          p_shop_id,
          v_barcode,
          v_item_number,
          v_product_name,
          v_second_product_name,
          v_purchase_price,
          v_retail_price,
          v_stock_quantity,
          v_supplier_id,
          v_category_id,
          now()
        )
        returning id into v_product_id;
      end if;

      v_product_ids := v_product_ids || jsonb_build_array(
        jsonb_build_object(
          'barcode', v_barcode,
          'itemNumber', v_item_number,
          'productId', v_product_id
        )
      );
      v_applied := v_applied + 1;
    exception
      when invalid_text_representation or numeric_value_out_of_range or check_violation or unique_violation then
        v_failed := v_failed + 1;
    end;
  end loop;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id,
    case when v_failed = 0 then 'shop.catalog.product.import.bulk.success' else 'shop.catalog.product.import.bulk.partial' end,
    case when v_failed = 0 then 'info' else 'warning' end,
    case when v_failed = 0 then 'success' else 'failure' end,
    'product',
    null,
    case when v_failed = 0 then 'success' else 'partial_failure' end,
    jsonb_build_object(
      'catalog_scope', v_scope.catalog_scope,
      'source', 'admin_web',
      'productsApplied', v_applied,
      'failedRows', v_failed,
      'totalRows', v_total
    )
  );

  return app_private.shop_admin_action_result(
    v_failed = 0,
    case when v_failed = 0 then 'success' else 'partial_failure' end,
    p_shop_id,
    null,
    audit_event_id,
    jsonb_build_object(
      'productsApplied', v_applied,
      'failedRows', v_failed,
      'totalRows', v_total,
      'productIds', v_product_ids
    )
  );
exception
  when others then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id,
      'shop.catalog.product.import.bulk.failure',
      'critical',
      'failure',
      'product',
      null,
      'db_failure',
      jsonb_build_object('catalog_scope', v_scope.catalog_scope, 'source', 'admin_web')
    );
    return app_private.shop_admin_action_result(false, 'db_failure', p_shop_id, null, audit_event_id);
end;
$$;

revoke all on function public.shop_catalog_import_products(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.shop_catalog_import_products(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
