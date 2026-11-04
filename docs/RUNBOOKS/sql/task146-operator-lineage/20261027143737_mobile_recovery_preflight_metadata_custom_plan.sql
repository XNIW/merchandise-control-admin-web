-- ROOT TEST-only candidate: one helper body, two metadata EXECUTEs. No apply until fresh admission.
-- Complete pg_proc metadata and public main RPC are preserved; failure aborts this DO statement.
DO $b6_metadata_apply_guarded$
DECLARE
  v_oid oid := 'app_private.sync_recovery_preflight_counts_v1(uuid,text,uuid,uuid)'::regprocedure;
  v_before jsonb; v_after jsonb; v_public_before jsonb; v_public_after jsonb;
  v_definition_md5 text;
BEGIN
  SELECT to_jsonb(p),md5(pg_get_functiondef(p.oid)) INTO STRICT v_before,v_definition_md5
  FROM pg_proc p WHERE p.oid=v_oid;
  IF v_oid <> '58221'::oid
    OR md5(v_before->>'prosrc') <> 'af803534d214de91fa12445b769d2556'
    OR md5((v_before-'prosrc')::text) <> '8e8498b3f5806524566080bd618f298d'
    OR v_definition_md5 <> 'f2a0351605304f2adff9e712bb27d002' THEN
    RAISE EXCEPTION 'B6_PREFLIGHT_METADATA_APPLY_PREIMAGE_MISMATCH' USING ERRCODE='55000';
  END IF;
  SELECT to_jsonb(p) INTO STRICT v_public_before FROM pg_proc p
  WHERE p.oid='public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure;
  IF md5(v_public_before->>'prosrc') <> '9fee0c276080e3f45b8d567883b13e04'
    OR md5((v_public_before-'prosrc')::text) <> '86c0b470d66981611c9de809545bb378' THEN
    RAISE EXCEPTION 'B6_PREFLIGHT_METADATA_APPLY_PUBLIC_RPC_MISMATCH' USING ERRCODE='55000';
  END IF;
  EXECUTE $b6_metadata_apply_definition$
CREATE OR REPLACE FUNCTION app_private.sync_recovery_preflight_counts_v1(p_shop_id uuid, p_scope_kind text, p_mapped_owner_id uuid, p_authorized_legacy_owner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
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
  v_scalar_contract boolean;
  v_fast_path_possible boolean;
  v_payload_upper_bytes bigint;
  v_product_bound_possible boolean;
  v_product_bound_upper_bytes bigint;
  v_price_bound_possible boolean;
  v_price_bound_upper_bytes bigint;
begin
  -- Pure pg_catalog/type predicate, evaluated before compiling a typed metadata
  -- count. Drift keeps the original counts and original payload loops. No DTO
  -- or business value is read by this guard; its definition is migration-pinned.
  v_scalar_contract := app_private.sync_recovery_scalar_bytes_contract_v1();
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
  if v_scalar_contract then
    execute $preflight_product_metadata_custom_01$
    select count(*), coalesce(bool_and(mandatory_present), true)
        and coalesce(max(upper_bytes), 0) <= app_private.sync_recovery_row_payload_limit_v1('products'),
      coalesce(sum(upper_bytes), 0)
    from (
    select (row.barcode is not null) as mandatory_present,
      1714::bigint + 6 * (coalesce(octet_length(row.barcode), 0)::bigint + coalesce(octet_length(row.item_number), 0)::bigint + coalesce(octet_length(row.product_name), 0)::bigint + coalesce(octet_length(row.second_product_name), 0)::bigint) as upper_bytes
    from public.inventory_products row
    where $1 in ('shop_scoped', 'authorized_shop_plus_legacy')
      and row.shop_id = $2
    union all
    select (row.barcode is not null) as mandatory_present,
      1714::bigint + 6 * (coalesce(octet_length(row.barcode), 0)::bigint + coalesce(octet_length(row.item_number), 0)::bigint + coalesce(octet_length(row.product_name), 0)::bigint + coalesce(octet_length(row.second_product_name), 0)::bigint) as upper_bytes
    from public.inventory_products row
    where $1 in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
      and row.shop_id is null and row.owner_user_id = $3
    limit app_private.sync_recovery_row_count_limit_v1('products') + 1
    ) bounded;
$preflight_product_metadata_custom_01$
    into v_products, v_product_bound_possible, v_product_bound_upper_bytes
    using p_scope_kind, p_shop_id, p_mapped_owner_id;
  else
  select count(*) into v_products from (
    select 1 from public.inventory_products row
    where p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
      and row.shop_id = p_shop_id
    union all
    select 1 from public.inventory_products row
    where p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
      and row.shop_id is null and row.owner_user_id = p_mapped_owner_id
    limit app_private.sync_recovery_row_count_limit_v1('products') + 1
  ) bounded;
  end if;
  if v_scalar_contract then
    execute $preflight_price_metadata_custom_01$
    select count(*), coalesce(bool_and(mandatory_present), true)
        and coalesce(max(upper_bytes), 0) <= app_private.sync_recovery_row_payload_limit_v1('prices'),
      coalesce(sum(upper_bytes), 0)
    from (
    select (row.type is not null and row.effective_at is not null and row.created_at is not null) as mandatory_present,
      752::bigint + 6 * (coalesce(octet_length(row.type), 0)::bigint + coalesce(octet_length(row.effective_at), 0)::bigint + coalesce(octet_length(row.source), 0)::bigint + coalesce(octet_length(row.note), 0)::bigint + coalesce(octet_length(row.created_at), 0)::bigint) as upper_bytes
    from public.inventory_product_prices row
    where $1 in ('shop_scoped', 'authorized_shop_plus_legacy')
      and row.shop_id = $2
    union all
    select (row.type is not null and row.effective_at is not null and row.created_at is not null) as mandatory_present,
      752::bigint + 6 * (coalesce(octet_length(row.type), 0)::bigint + coalesce(octet_length(row.effective_at), 0)::bigint + coalesce(octet_length(row.source), 0)::bigint + coalesce(octet_length(row.note), 0)::bigint + coalesce(octet_length(row.created_at), 0)::bigint) as upper_bytes
    from public.inventory_product_prices row
    where $1 in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
      and row.shop_id is null and row.owner_user_id = $3
    limit app_private.sync_recovery_row_count_limit_v1('prices') + 1
    ) bounded;
$preflight_price_metadata_custom_01$
    into v_prices, v_price_bound_possible, v_price_bound_upper_bytes
    using p_scope_kind, p_shop_id, p_mapped_owner_id;
  else
  select count(*) into v_prices from (
    select 1 from public.inventory_product_prices row
    where p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
      and row.shop_id = p_shop_id
    union all
    select 1 from public.inventory_product_prices row
    where p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
      and row.shop_id is null and row.owner_user_id = p_mapped_owner_id
    limit app_private.sync_recovery_row_count_limit_v1('prices') + 1
  ) bounded;
  end if;
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


    -- Guard prepass reads only scalar metadata, never serializes user text.
    -- The stronger row upper bound proves all pinned text storage limits;
    -- mandatory NULLs are rejected here. Every unproven case uses the original loop.
    if v_scalar_contract then
    -- Counts below every cap imply this is the complete same-snapshot set.
    v_fast_path_possible := v_product_bound_possible;
    v_payload_upper_bytes := v_product_bound_upper_bytes;

    else
      v_fast_path_possible := false;
    end if;

    if v_fast_path_possible
      and v_payload_upper_bytes <= app_private.sync_recovery_snapshot_payload_limit_v1('products')
      and v_total_payload_bytes + v_payload_upper_bytes <= 536870912 then
      -- Sixteen fixed keys/punctuation contribute297 bytes; scalar JSON lengths
      -- retain original float8, timestamp, NULL and tombstone representation.
      with raw_products as (
    select product.id, product.owner_user_id, product.barcode, product.item_number, product.product_name, product.second_product_name, product.purchase_price, product.retail_price, product.supplier_id, product.category_id, product.stock_quantity, product.updated_at, product.deleted_at, product.shop_id, product.primary_image_version_id, product.primary_image_updated_at,
      (product.barcode is not null and 1714::bigint + 6 * (coalesce(octet_length(product.barcode), 0)::bigint + coalesce(octet_length(product.item_number), 0)::bigint + coalesce(octet_length(product.product_name), 0)::bigint + coalesce(octet_length(product.second_product_name), 0)::bigint) <= 65536) as can_flat
    from public.inventory_products product
      where (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
          and product.shop_id = p_shop_id)
        or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
          and product.shop_id is null and product.owner_user_id = p_mapped_owner_id)
  ), product_scalars as materialized (
    -- Serialize text only behind the local metadata bound. Drop display-name
    -- text before materializing repeated scalar/digest inputs.
    select id, barcode, item_number, updated_at, deleted_at, supplier_id,
      category_id, primary_image_version_id, primary_image_updated_at,
      purchase_price, retail_price, stock_quantity, can_flat,
      case when deleted_at is null then primary_image_updated_at end as dto_image_updated_at,
      case when can_flat then
      297::bigint
      + case when id is null then 4 else 38 end
      + case when owner_user_id is null then 4 else 38 end
      + case when shop_id is null then 4 else 38 end
      + case when deleted_at is not null or category_id is null then 4 else 38 end
      + case when deleted_at is not null or supplier_id is null then 4 else 38 end
      + case when deleted_at is not null or primary_image_version_id is null then 4 else 38 end
      + coalesce(octet_length(to_jsonb(barcode)::text), 4)
      + coalesce(octet_length(to_jsonb(item_number)::text), 4)
      + coalesce(octet_length(to_jsonb(product_name)::text), 4)
      + coalesce(octet_length(to_jsonb(second_product_name)::text), 4)
      else octet_length(app_private.sync_product_recovery_row_v1(id, owner_user_id, barcode, item_number, product_name, second_product_name, purchase_price, retail_price, supplier_id, category_id, stock_quantity, updated_at, deleted_at, shop_id, primary_image_version_id, primary_image_updated_at)::text)::bigint
      end as fixed_and_text_bytes
    from raw_products
  ), number_values as materialized (
    select purchase_price as value from product_scalars where can_flat and purchase_price is not null
    union
    select retail_price from product_scalars where can_flat and retail_price is not null
    union
    select stock_quantity from product_scalars where can_flat and stock_quantity is not null
  ), number_memo as materialized (
    select value, octet_length(to_jsonb(value)::text) as scalar_bytes from number_values
  ), timestamp_values as materialized (
    select updated_at as value from product_scalars where can_flat and updated_at is not null
    union
    select deleted_at from product_scalars where can_flat and deleted_at is not null
    union
    select dto_image_updated_at from product_scalars where can_flat and dto_image_updated_at is not null
  ), timestamp_memo as materialized (
    select value, coalesce(octet_length(to_jsonb(app_private.sync_checkpoint_json_timestamp(value))::text), 4) as scalar_bytes
    from timestamp_values
  ), scoped as materialized (
    select product_scalars.id, product_scalars.barcode, product_scalars.item_number,
      product_scalars.updated_at, product_scalars.deleted_at, product_scalars.supplier_id,
      product_scalars.category_id, product_scalars.primary_image_version_id,
      product_scalars.primary_image_updated_at,
      case when can_flat then fixed_and_text_bytes
        + coalesce(purchase.scalar_bytes, 4) + coalesce(retail.scalar_bytes, 4)
        + coalesce(stock.scalar_bytes, 4) + coalesce(updated.scalar_bytes, 4)
        + coalesce(deleted.scalar_bytes, 4) + coalesce(image_updated.scalar_bytes, 4)
      else fixed_and_text_bytes end as recovery_bytes
    from product_scalars
    left join number_memo purchase on product_scalars.purchase_price = purchase.value
    left join number_memo retail on product_scalars.retail_price = retail.value
    left join number_memo stock on product_scalars.stock_quantity = stock.value
    left join timestamp_memo updated on product_scalars.updated_at = updated.value
    left join timestamp_memo deleted on product_scalars.deleted_at = deleted.value
    left join timestamp_memo image_updated on product_scalars.dto_image_updated_at = image_updated.value
  )
  select coalesce(sum(recovery_bytes), 0) into v_product_payload_bytes from scoped;
      v_total_payload_bytes := v_total_payload_bytes + v_product_payload_bytes;
    else
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
    end if;

    -- Guard prepass reads only scalar metadata, never serializes user text.
    -- The stronger row upper bound proves all pinned text storage limits;
    -- mandatory NULLs are rejected here. Every unproven case uses the original loop.
    if v_scalar_contract then
    -- Counts below every cap imply this is the complete same-snapshot set.
    v_fast_path_possible := v_price_bound_possible;
    v_payload_upper_bytes := v_price_bound_upper_bytes;

    else
      v_fast_path_possible := false;
    end if;

    if v_fast_path_possible
      and v_payload_upper_bytes <= app_private.sync_recovery_snapshot_payload_limit_v1('prices')
      and v_total_payload_bytes + v_payload_upper_bytes <= 536870912 then
      -- Twelve fixed JSON keys:170 punctuation/key bytes, then exact typed
      -- scalar JSON bytes. The proven bound prevents unbounded serialization.
      with raw_prices as materialized (
    select price_row.id, price_row.owner_user_id, price_row.product_id,
      price_row.type, price_row.price, price_row.effective_at,
      price_row.source, price_row.note, price_row.created_at,
      price_row.shop_id, price_row.updated_at,
      (price_row.type is not null and price_row.effective_at is not null
        and price_row.created_at is not null
        and 752::bigint + 6 * (
          coalesce(octet_length(price_row.type),0)::bigint
          + coalesce(octet_length(price_row.effective_at),0)::bigint
          + coalesce(octet_length(price_row.source),0)::bigint
          + coalesce(octet_length(price_row.note),0)::bigint
          + coalesce(octet_length(price_row.created_at),0)::bigint
        ) <= 32768) as can_flat
from public.inventory_product_prices price_row
      where (p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
          and price_row.shop_id = p_shop_id)
        or (p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
          and price_row.shop_id is null and price_row.owner_user_id = p_mapped_owner_id)
  ), scoped as materialized (
    -- This materialization evaluates every unsafe row with the original DTO
    -- before any downstream memo reads unbounded text. Safe rows defer bytes.
    select raw_prices.*, case when can_flat then null::bigint
      else octet_length((app_private.sync_price_recovery_row_v1(
        id, owner_user_id, product_id, type, price, effective_at,
        source, note, created_at, shop_id, updated_at
      ))::text)::bigint end as fallback_bytes
    from raw_prices
  ), number_values as materialized (
    select distinct price as value from scoped where can_flat and price is not null
  ), number_checked as materialized (
    select value, app_private.sync_price_value_is_canonical_v1(value) as is_canonical
    from number_values
  ), number_amount as materialized (
    select value, is_canonical, case when is_canonical
      then app_private.sync_price_canonical_amount_v1(value) end as amount
    from number_checked
  ), number_memo as materialized (
    select value, is_canonical, amount,
      octet_length(to_jsonb(value)::text) as scalar_bytes,
      coalesce(octet_length(to_jsonb(amount)::text),4) as canonical_bytes
    from number_amount
  ), update_values as materialized (
    select distinct updated_at as value from scoped where can_flat and updated_at is not null
  ), update_text as materialized (
    select value, app_private.sync_checkpoint_json_timestamp(value) as json_value
    from update_values
  ), update_memo as materialized (
    select *, coalesce(octet_length(to_jsonb(json_value)::text),4) as scalar_bytes
    from update_text
  ), prepared as materialized (
    select case when scoped.can_flat then
      170::bigint
      + case when scoped.id is null then 4 else 38 end
      + case when scoped.owner_user_id is null then 4 else 38 end
      + case when scoped.product_id is null then 4 else 38 end
      + case when scoped.shop_id is null then 4 else 38 end
      + coalesce(octet_length(to_jsonb(scoped.type)::text),4)
      + coalesce(octet_length(to_jsonb(scoped.effective_at)::text),4)
      + coalesce(octet_length(to_jsonb(scoped.source)::text),4)
      + coalesce(octet_length(to_jsonb(scoped.note)::text),4)
      + coalesce(octet_length(to_jsonb(scoped.created_at)::text),4)
      + coalesce(number_value.scalar_bytes,4)
      + coalesce(number_value.canonical_bytes,4)
      + coalesce(update_value.scalar_bytes,4)
      else scoped.fallback_bytes end as recovery_bytes
    from scoped
    left join number_memo number_value on scoped.price = number_value.value
    left join update_memo update_value on scoped.updated_at = update_value.value
  )
  select coalesce(sum(recovery_bytes),0) into v_price_payload_bytes from prepared;
      v_total_payload_bytes := v_total_payload_bytes + v_price_payload_bytes;
    else
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
    end if;

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
$function$
$b6_metadata_apply_definition$;
  SELECT to_jsonb(p) INTO STRICT v_after FROM pg_proc p
  WHERE p.oid='app_private.sync_recovery_preflight_counts_v1(uuid,text,uuid,uuid)'::regprocedure;
  SELECT to_jsonb(p) INTO STRICT v_public_after FROM pg_proc p
  WHERE p.oid='public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure;
  IF md5(v_after->>'prosrc') <> '6fb3118d630941b56b6772db94868567'
    OR (v_after-'prosrc') IS DISTINCT FROM (v_before-'prosrc')
    OR v_public_after IS DISTINCT FROM v_public_before THEN
    RAISE EXCEPTION 'B6_PREFLIGHT_METADATA_APPLY_POSTIMAGE_OR_METADATA_MISMATCH' USING ERRCODE='55000';
  END IF;
END;
$b6_metadata_apply_guarded$;
