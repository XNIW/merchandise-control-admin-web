-- TASK-141: keep the POS catalog preflight fail-closed while avoiding full
-- recovery-DTO serialization for every row on the request path.
--
-- A JSON string can expand to at most six bytes per input byte when escaped.
-- The fixed allowances below cover keys, UUIDs, timestamps, numeric values and
-- JSON punctuation.  If a row or domain approaches an envelope, the existing
-- exact serializers remain the authority.  Normal bounded rows therefore use
-- a conservative set-based scan, while exceptional rows retain exact checks.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '15min';

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
  v_has_violation boolean;
  v_supplier_bytes bigint := 0;
  v_category_bytes bigint := 0;
  v_product_bytes bigint := 0;
  v_price_bytes bigint := 0;
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

  select
    coalesce(bool_or(
      pg_catalog.isfinite(row.updated_at) is not true
      or (row.deleted_at is not null
        and pg_catalog.isfinite(row.deleted_at) is not true)
      or case
        when app_private.sync_supplier_storage_is_bounded_v1(
          row.name
        ) is not true then true
        when 512::bigint
          + 6::bigint * coalesce(pg_catalog.octet_length(row.name), 0)
          <= app_private.sync_recovery_row_payload_limit_v1('suppliers')
          then false
        else app_private.sync_supplier_recovery_row_fits_v1(
          row.id,row.owner_user_id,row.name,row.updated_at,
          row.deleted_at,row.shop_id
        ) is not true
      end
    ), false),
    coalesce(sum(
      512::bigint
      + 6::bigint * coalesce(pg_catalog.octet_length(row.name), 0)
    ), 0)
  into v_has_violation, v_supplier_bytes
  from public.inventory_suppliers row
  where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
      and row.shop_id=p_shop_id)
    or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
      and row.shop_id is null and row.owner_user_id=p_scope_id);

  if v_has_violation then return 1; end if;
  if v_supplier_bytes > 33554432 then
    select coalesce(sum(octet_length(
      app_private.sync_supplier_recovery_row_v1(
        row.id,row.owner_user_id,row.name,row.updated_at,
        row.deleted_at,row.shop_id
      )::text
    )), 0)
    into v_supplier_bytes
    from public.inventory_suppliers row
    where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_scope_id);
    if v_supplier_bytes > 33554432 then return 1; end if;
  end if;

  select
    coalesce(bool_or(
      pg_catalog.isfinite(row.updated_at) is not true
      or (row.deleted_at is not null
        and pg_catalog.isfinite(row.deleted_at) is not true)
      or case
        when app_private.sync_category_storage_is_bounded_v1(
          row.name
        ) is not true then true
        when 512::bigint
          + 6::bigint * coalesce(pg_catalog.octet_length(row.name), 0)
          <= app_private.sync_recovery_row_payload_limit_v1('categories')
          then false
        else app_private.sync_category_recovery_row_fits_v1(
          row.id,row.owner_user_id,row.name,row.updated_at,
          row.deleted_at,row.shop_id
        ) is not true
      end
    ), false),
    coalesce(sum(
      512::bigint
      + 6::bigint * coalesce(pg_catalog.octet_length(row.name), 0)
    ), 0)
  into v_has_violation, v_category_bytes
  from public.inventory_categories row
  where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
      and row.shop_id=p_shop_id)
    or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
      and row.shop_id is null and row.owner_user_id=p_scope_id);

  if v_has_violation then return 1; end if;
  if v_category_bytes > 33554432 then
    select coalesce(sum(octet_length(
      app_private.sync_category_recovery_row_v1(
        row.id,row.owner_user_id,row.name,row.updated_at,
        row.deleted_at,row.shop_id
      )::text
    )), 0)
    into v_category_bytes
    from public.inventory_categories row
    where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_scope_id);
    if v_category_bytes > 33554432 then return 1; end if;
  end if;

  select
    coalesce(bool_or(
      pg_catalog.isfinite(row.updated_at) is not true
      or (row.deleted_at is not null
        and pg_catalog.isfinite(row.deleted_at) is not true)
      or (row.primary_image_updated_at is not null
        and pg_catalog.isfinite(row.primary_image_updated_at) is not true)
      or app_private.sync_product_number_is_materializable_v1(
        row.purchase_price
      ) is not true
      or app_private.sync_product_number_is_materializable_v1(
        row.retail_price
      ) is not true
      or app_private.sync_product_number_is_materializable_v1(
        row.stock_quantity
      ) is not true
      or case
        when app_private.sync_product_storage_is_bounded_v1(
          row.barcode,row.item_number,row.product_name,row.second_product_name
        ) is not true then true
        when 2048::bigint + 6::bigint * (
          coalesce(pg_catalog.octet_length(row.barcode), 0)
          + coalesce(pg_catalog.octet_length(row.item_number), 0)
          + coalesce(pg_catalog.octet_length(row.product_name), 0)
          + coalesce(pg_catalog.octet_length(row.second_product_name), 0)
        ) <= app_private.sync_recovery_row_payload_limit_v1('products')
          then false
        else app_private.sync_product_recovery_row_fits_v1(
          row.id,row.owner_user_id,row.barcode,row.item_number,
          row.product_name,row.second_product_name,row.purchase_price,
          row.retail_price,row.supplier_id,row.category_id,
          row.stock_quantity,row.updated_at,row.deleted_at,row.shop_id,
          row.primary_image_version_id,row.primary_image_updated_at
        ) is not true
      end
    ), false),
    coalesce(sum(
      2048::bigint + 6::bigint * (
        coalesce(pg_catalog.octet_length(row.barcode), 0)
        + coalesce(pg_catalog.octet_length(row.item_number), 0)
        + coalesce(pg_catalog.octet_length(row.product_name), 0)
        + coalesce(pg_catalog.octet_length(row.second_product_name), 0)
      )
    ), 0)
  into v_has_violation, v_product_bytes
  from public.inventory_products row
  where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
      and row.shop_id=p_shop_id)
    or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
      and row.shop_id is null and row.owner_user_id=p_scope_id);

  if v_has_violation then return 1; end if;
  if v_product_bytes > 268435456 then
    select coalesce(sum(octet_length(
      app_private.sync_product_recovery_row_v1(
        row.id,row.owner_user_id,row.barcode,row.item_number,
        row.product_name,row.second_product_name,row.purchase_price,
        row.retail_price,row.supplier_id,row.category_id,
        row.stock_quantity,row.updated_at,row.deleted_at,row.shop_id,
        row.primary_image_version_id,row.primary_image_updated_at
      )::text
    )), 0)
    into v_product_bytes
    from public.inventory_products row
    where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_scope_id);
    if v_product_bytes > 268435456 then return 1; end if;
  end if;

  select
    coalesce(bool_or(
      pg_catalog.isfinite(row.updated_at) is not true
      or app_private.sync_price_value_is_canonical_v1(
        row.price
      ) is not true
      or app_private.sync_legacy_timestamp_is_canonical_v1(
        row.effective_at
      ) is not true
      or app_private.sync_legacy_timestamp_is_canonical_v1(
        row.created_at
      ) is not true
      or case
        when app_private.sync_price_storage_is_bounded_v1(
          row.type,row.effective_at,row.source,row.note,row.created_at
        ) is not true then true
        when 1024::bigint + 6::bigint * (
          coalesce(pg_catalog.octet_length(row.type), 0)
          + coalesce(pg_catalog.octet_length(row.effective_at), 0)
          + coalesce(pg_catalog.octet_length(row.source), 0)
          + coalesce(pg_catalog.octet_length(row.note), 0)
          + coalesce(pg_catalog.octet_length(row.created_at), 0)
        ) <= app_private.sync_recovery_row_payload_limit_v1('prices')
          then false
        else app_private.sync_price_recovery_row_fits_v1(
          row.id,row.owner_user_id,row.product_id,row.type,row.price,
          row.effective_at,row.source,row.note,row.created_at,
          row.shop_id,row.updated_at
        ) is not true
      end
    ), false),
    coalesce(sum(
      1024::bigint + 6::bigint * (
        coalesce(pg_catalog.octet_length(row.type), 0)
        + coalesce(pg_catalog.octet_length(row.effective_at), 0)
        + coalesce(pg_catalog.octet_length(row.source), 0)
        + coalesce(pg_catalog.octet_length(row.note), 0)
        + coalesce(pg_catalog.octet_length(row.created_at), 0)
      )
    ), 0)
  into v_has_violation, v_price_bytes
  from public.inventory_product_prices row
  where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
      and row.shop_id=p_shop_id)
    or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
      and row.shop_id is null and row.owner_user_id=p_scope_id);

  if v_has_violation then return 1; end if;
  if v_price_bytes > 268435456 then
    select coalesce(sum(octet_length(
      app_private.sync_price_recovery_row_v1(
        row.id,row.owner_user_id,row.product_id,row.type,row.price,
        row.effective_at,row.source,row.note,row.created_at,
        row.shop_id,row.updated_at
      )::text
    )), 0)
    into v_price_bytes
    from public.inventory_product_prices row
    where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_scope_id);
    if v_price_bytes > 268435456 then return 1; end if;
  end if;

  v_total_bytes :=
    v_supplier_bytes + v_category_bytes + v_product_bytes + v_price_bytes;
  if v_total_bytes > 536870912 then
    -- The conservative envelope may overestimate escaping.  Pay exact
    -- serialization only for catalogs near the aggregate safety ceiling.
    select
      coalesce(sum(octet_length(
        app_private.sync_supplier_recovery_row_v1(
          row.id,row.owner_user_id,row.name,row.updated_at,
          row.deleted_at,row.shop_id
        )::text
      )), 0)
    into v_supplier_bytes
    from public.inventory_suppliers row
    where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_scope_id);

    select
      coalesce(sum(octet_length(
        app_private.sync_category_recovery_row_v1(
          row.id,row.owner_user_id,row.name,row.updated_at,
          row.deleted_at,row.shop_id
        )::text
      )), 0)
    into v_category_bytes
    from public.inventory_categories row
    where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_scope_id);

    select
      coalesce(sum(octet_length(
        app_private.sync_product_recovery_row_v1(
          row.id,row.owner_user_id,row.barcode,row.item_number,
          row.product_name,row.second_product_name,row.purchase_price,
          row.retail_price,row.supplier_id,row.category_id,
          row.stock_quantity,row.updated_at,row.deleted_at,row.shop_id,
          row.primary_image_version_id,row.primary_image_updated_at
        )::text
      )), 0)
    into v_product_bytes
    from public.inventory_products row
    where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_scope_id);

    select
      coalesce(sum(octet_length(
        app_private.sync_price_recovery_row_v1(
          row.id,row.owner_user_id,row.product_id,row.type,row.price,
          row.effective_at,row.source,row.note,row.created_at,
          row.shop_id,row.updated_at
        )::text
      )), 0)
    into v_price_bytes
    from public.inventory_product_prices row
    where (p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and row.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and row.shop_id is null and row.owner_user_id=p_scope_id);

    if v_supplier_bytes + v_category_bytes + v_product_bytes + v_price_bytes
      > 536870912 then
      return 1;
    end if;
  end if;

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

  -- Historical prices for a product soft-deleted in the same authorized
  -- scope are valid retained history.  The page/manifest path still excludes
  -- those prices from the active POS catalog.
  if exists (
    select 1 from public.inventory_product_prices price
    where ((p_scope_kind in ('shop_scoped','authorized_shop_plus_legacy')
        and price.shop_id=p_shop_id)
      or (p_scope_kind in ('legacy_owner_bridge','authorized_shop_plus_legacy')
        and price.shop_id is null and price.owner_user_id=p_scope_id))
      and not exists (
        select 1 from public.inventory_products product
        where product.id=price.product_id
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

commit;
