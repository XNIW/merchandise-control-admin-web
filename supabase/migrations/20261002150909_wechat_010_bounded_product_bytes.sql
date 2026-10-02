-- TASK-159 / WECHAT-010: bounded metadata scans and exact product bytes.
-- Existing DTOs, data, authorization, fences, ACL and runtime8s remain unchanged.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $guard$
begin
  if current_user <> 'postgres'
    or current_setting('server_version_num')::integer / 10000 <> 17
    or current_setting('server_encoding') <> 'UTF8'
    or not (
  with expected as (
    select * from jsonb_to_recordset('[{"signature":"app_private.sync_recovery_preflight_counts_v1(uuid,text,uuid,uuid)","source_md5":"de913a4c8b1bb0beb241627287146543","owner":"postgres","language":"plpgsql","acl":["postgres=X/postgres"],"metadata":{"probin":null,"procost":100,"prokind":"f","proname":"sync_recovery_preflight_counts_v1","prorows":0,"pronargs":4,"proconfig":["search_path=public, app_private, pg_temp"],"proretset":false,"prosecdef":true,"prorettype":"3802","prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":["p_shop_id","p_scope_kind","p_mapped_owner_id","p_authorized_legacy_owner_id"],"proargtypes":["2950","25","2950","2950"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"s","proleakproof":false,"proallargtypes":null,"proargdefaults":null,"pronargdefaults":0}},{"signature":"public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)","source_md5":"5d65fddf42c5750257fa85b981d3e389","owner":"postgres","language":"plpgsql","acl":["authenticated=X/postgres","postgres=X/postgres"],"metadata":{"probin":null,"procost":100,"prokind":"f","proname":"shop_sync_recovery_checkpoint_v1","prorows":0,"pronargs":4,"proconfig":["search_path=public, app_private, pg_temp"],"proretset":false,"prosecdef":true,"prorettype":"3802","prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":["p_shop_id","p_device_identifier","p_verified_baseline_id","p_expected_baseline_scope_key"],"proargtypes":["2950","25","25","25"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"v","proleakproof":false,"proallargtypes":null,"proargdefaults":"''0''::text, NULL::text","pronargdefaults":2}},{"signature":"app_private.sync_recovery_scalar_bytes_contract_v1()","source_md5":"43da0ada1f005843049c6b60c6f60b01","owner":"postgres","language":"sql","acl":["postgres=X/postgres"],"metadata":{"probin":null,"procost":100,"prokind":"f","proname":"sync_recovery_scalar_bytes_contract_v1","prorows":0,"pronargs":0,"proconfig":["search_path=pg_catalog, pg_temp"],"proretset":false,"prosecdef":false,"prorettype":"16","prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":null,"proargtypes":[],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"s","proleakproof":false,"proallargtypes":null,"proargdefaults":null,"pronargdefaults":0}}]'::jsonb)
      as x(signature text, source_md5 text, owner text, language text, acl jsonb, metadata jsonb)
  )
  select count(*) = 3 and coalesce(bool_and(coalesce(
      f.oid is not null and md5(f.prosrc) = e.source_md5
      and pg_get_userbyid(f.proowner) = e.owner and l.lanname = e.language
      and ((to_jsonb(f)-'oid'-'pronamespace'-'proowner'-'prolang'-'prosrc'-'proacl'-'proargdefaults') || jsonb_build_object('proargdefaults',pg_get_expr(f.proargdefaults,0))) = e.metadata
      and ((select jsonb_agg(a::text order by a::text collate "C") from unnest(f.proacl)a) = e.acl or (e.signature like 'public.shop_sync_recovery_checkpoint_v1(%' and (select jsonb_agg(a::text order by a::text collate "C") from unnest(f.proacl)a) = '["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb))
    , false)), false)
  from expected e
  left join pg_proc f on f.oid = to_regprocedure(e.signature)
  left join pg_language l on l.oid = f.prolang
    ) then
    raise exception 'bounded_product_bytes_baseline_mismatch' using errcode='55000';
  end if;
  if app_private.sync_recovery_scalar_bytes_contract_v1() is not true then
    raise exception 'bounded_product_bytes_dependency_mismatch' using errcode='55000';
  end if;
end;
$guard$;

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
    select count(*), coalesce(bool_and(mandatory_present), true)
        and coalesce(max(upper_bytes), 0) <= app_private.sync_recovery_row_payload_limit_v1('products'),
      coalesce(sum(upper_bytes), 0)
    into v_products, v_product_bound_possible, v_product_bound_upper_bytes
    from (
    select (row.barcode is not null) as mandatory_present,
      1714::bigint + 6 * (coalesce(octet_length(row.barcode), 0)::bigint + coalesce(octet_length(row.item_number), 0)::bigint + coalesce(octet_length(row.product_name), 0)::bigint + coalesce(octet_length(row.second_product_name), 0)::bigint) as upper_bytes
    from public.inventory_products row
    where p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
      and row.shop_id = p_shop_id
    union all
    select (row.barcode is not null) as mandatory_present,
      1714::bigint + 6 * (coalesce(octet_length(row.barcode), 0)::bigint + coalesce(octet_length(row.item_number), 0)::bigint + coalesce(octet_length(row.product_name), 0)::bigint + coalesce(octet_length(row.second_product_name), 0)::bigint) as upper_bytes
    from public.inventory_products row
    where p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
      and row.shop_id is null and row.owner_user_id = p_mapped_owner_id
    limit app_private.sync_recovery_row_count_limit_v1('products') + 1
    ) bounded;
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
    select count(*), coalesce(bool_and(mandatory_present), true)
        and coalesce(max(upper_bytes), 0) <= app_private.sync_recovery_row_payload_limit_v1('prices'),
      coalesce(sum(upper_bytes), 0)
    into v_prices, v_price_bound_possible, v_price_bound_upper_bytes
    from (
    select (row.type is not null and row.effective_at is not null and row.created_at is not null) as mandatory_present,
      752::bigint + 6 * (coalesce(octet_length(row.type), 0)::bigint + coalesce(octet_length(row.effective_at), 0)::bigint + coalesce(octet_length(row.source), 0)::bigint + coalesce(octet_length(row.note), 0)::bigint + coalesce(octet_length(row.created_at), 0)::bigint) as upper_bytes
    from public.inventory_product_prices row
    where p_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
      and row.shop_id = p_shop_id
    union all
    select (row.type is not null and row.effective_at is not null and row.created_at is not null) as mandatory_present,
      752::bigint + 6 * (coalesce(octet_length(row.type), 0)::bigint + coalesce(octet_length(row.effective_at), 0)::bigint + coalesce(octet_length(row.source), 0)::bigint + coalesce(octet_length(row.note), 0)::bigint + coalesce(octet_length(row.created_at), 0)::bigint) as upper_bytes
    from public.inventory_product_prices row
    where p_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
      and row.shop_id is null and row.owner_user_id = p_mapped_owner_id
    limit app_private.sync_recovery_row_count_limit_v1('prices') + 1
    ) bounded;
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
$$;

CREATE OR REPLACE FUNCTION public.shop_sync_recovery_checkpoint_v1(p_shop_id uuid, p_device_identifier text, p_verified_baseline_id text DEFAULT '0'::text, p_expected_baseline_scope_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
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

  -- Product bytes are computed only in this SELECT/snapshot. The unchanged
  -- private predicate gates the entire original SELECT on contract drift.
  with scalar_contract as materialized (
    select app_private.sync_recovery_scalar_bytes_contract_v1() as valid
  )
  select case when (select valid from scalar_contract) then (
with raw_products as (
    select product.id, product.owner_user_id, product.barcode, product.item_number, product.product_name, product.second_product_name, product.purchase_price, product.retail_price, product.supplier_id, product.category_id, product.stock_quantity, product.updated_at, product.deleted_at, product.shop_id, product.primary_image_version_id, product.primary_image_updated_at,
      (product.barcode is not null and 1714::bigint + 6 * (coalesce(octet_length(product.barcode), 0)::bigint + coalesce(octet_length(product.item_number), 0)::bigint + coalesce(octet_length(product.product_name), 0)::bigint + coalesce(octet_length(product.second_product_name), 0)::bigint) <= 65536) as can_flat
    from public.inventory_products product
    where (
      v_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
      and product.shop_id = p_shop_id
    ) or (
        v_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and product.shop_id is null
        and product.owner_user_id = v_mapped_owner_id
      )
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
  select jsonb_build_object(
    'activeCount', count(*) filter (where deleted_at is null),
    'tombstoneCount', count(*) filter (where deleted_at is not null),
    'payloadBytes', coalesce(sum(recovery_bytes), 0),
    'oversizeRowCount', count(*) filter (
      where recovery_bytes >
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
  from scoped
  ) else (
with scoped as materialized (
    select product.id, product.barcode, product.item_number,
      product.updated_at, product.deleted_at, product.supplier_id,
      product.category_id, product.primary_image_version_id,
      product.primary_image_updated_at,
      octet_length(app_private.sync_product_recovery_row_v1(
        product.id, product.owner_user_id, product.barcode,
        product.item_number, product.product_name,
        product.second_product_name, product.purchase_price,
        product.retail_price, product.supplier_id, product.category_id,
        product.stock_quantity, product.updated_at, product.deleted_at,
        product.shop_id, product.primary_image_version_id,
        product.primary_image_updated_at
      )::text) as recovery_bytes
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
    'payloadBytes', coalesce(sum(recovery_bytes), 0),
    'oversizeRowCount', count(*) filter (
      where recovery_bytes >
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
  from scoped
  ) end into v_products;

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

  -- One bounded price DTO serialization per row. Keep only fields required by
  -- the original digest; raw parent/scope predicates below remain unchanged.
  -- Guard and both alternatives share this SELECT/snapshot. A drift chooses
  -- the entire original SELECT, retaining even scalar-call behavior. CASE keeps
  -- the unselected branch unexecuted; no preflight bytes cross statements.
  with scalar_contract as materialized (
    select app_private.sync_recovery_scalar_bytes_contract_v1() as valid
  )
  select case when (select valid from scalar_contract) then (
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
    select value, app_private.sync_checkpoint_json_timestamp(value) as json_value, app_private.sync_checkpoint_timestamp(value) as digest
    from update_values
  ), update_memo as materialized (
    select *, coalesce(octet_length(to_jsonb(json_value)::text),4) as scalar_bytes
    from update_text
  ), prepared as materialized (
    select scoped.id, scoped.product_id, scoped.type, scoped.effective_at, scoped.created_at, case when scoped.can_flat then
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
      , case when scoped.can_flat then number_value.is_canonical
          else app_private.sync_price_value_is_canonical_v1(scoped.price) end as price_valid,
      case when scoped.can_flat then number_value.amount
          else case when app_private.sync_price_value_is_canonical_v1(scoped.price)
            then app_private.sync_price_canonical_amount_v1(scoped.price) end end as price_amount,
      case when scoped.can_flat then coalesce(update_value.digest,'-')
          else app_private.sync_checkpoint_timestamp(scoped.updated_at) end as updated_digest,
      app_private.sync_checkpoint_sha256(coalesce(scoped.source,'')) as source_digest,
      app_private.sync_checkpoint_sha256(coalesce(scoped.note,'')) as note_digest

    from scoped
    left join number_memo number_value on scoped.price = number_value.value
    left join update_memo update_value on scoped.updated_at = update_value.value
  ), timestamp_values as materialized (
    select effective_at collate "C" as value from prepared where effective_at is not null
    union
    select created_at collate "C" as value from prepared where created_at is not null
  ), timestamp_validity as materialized (
    select value, app_private.sync_legacy_timestamp_is_canonical_v1(value) as is_canonical
    from timestamp_values
  )
  select jsonb_build_object(
    'activeCount', count(*),
    'tombstoneCount', 0,
    'payloadBytes', coalesce(sum(recovery_bytes), 0),
    'oversizeRowCount', count(*) filter (where
      recovery_bytes >
        app_private.sync_recovery_row_payload_limit_v1('prices')),
    'idSetDigest', app_private.sync_checkpoint_chain_digest_v1(
      lower(id::text) order by id
    ),
    'versionDigest', app_private.sync_checkpoint_chain_digest_v1(
        lower(id::text) || E'\x1f' ||
        updated_digest || E'\x1f' ||
        lower(product_id::text) || E'\x1f' ||
        case
          when price_valid
            then price_amount
          else 'invalid'
        end || E'\x1f' ||
        type || E'\x1f' ||
        case
          when effective_time.is_canonical
            then effective_at
          else 'invalid'
        end || E'\x1f' ||
        case
          when created_time.is_canonical
            then created_at
          else 'invalid'
        end || E'\x1f' ||
        source_digest || E'\x1f' ||
        note_digest
        order by id
    )
  )

  from prepared
  left join timestamp_validity effective_time on effective_at collate "C" = effective_time.value
  left join timestamp_validity created_time on created_at collate "C" = created_time.value
  ) else (
with scoped as materialized (
    select price_row.id, price_row.product_id, price_row.updated_at,
      price_row.type, price_row.price, price_row.effective_at, price_row.created_at,
      price_row.source, price_row.note,
      octet_length(app_private.sync_price_recovery_row_v1(
        price_row.id, price_row.owner_user_id, price_row.product_id,
        price_row.type, price_row.price, price_row.effective_at,
        price_row.source, price_row.note, price_row.created_at,
        price_row.shop_id, price_row.updated_at
      )::text) as recovery_bytes
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
  -- Bytewise de-duplication is local to this SELECT/snapshot. NULL stays absent
  -- from the LEFT JOIN and therefore follows the original CASE's invalid arm.
  -- Each non-NULL spelling still calls the exact existing validator once.
  ), timestamp_values as materialized (
    select effective_at collate "C" as value from scoped where effective_at is not null
    union
    select created_at collate "C" as value from scoped where created_at is not null
  ), timestamp_validity as materialized (
    select value, app_private.sync_legacy_timestamp_is_canonical_v1(value) as is_canonical
    from timestamp_values
  )
  select jsonb_build_object(
    'activeCount', count(*),
    'tombstoneCount', 0,
    'payloadBytes', coalesce(sum(recovery_bytes), 0),
    'oversizeRowCount', count(*) filter (where
      recovery_bytes >
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
          when effective_time.is_canonical
            then effective_at
          else 'invalid'
        end || E'\x1f' ||
        case
          when created_time.is_canonical
            then created_at
          else 'invalid'
        end || E'\x1f' ||
        app_private.sync_checkpoint_sha256(coalesce(source, '')) || E'\x1f' ||
        app_private.sync_checkpoint_sha256(coalesce(note, ''))
        order by id
    )
  )

  from scoped
  left join timestamp_validity effective_time on effective_at collate "C" = effective_time.value
  left join timestamp_validity created_time on created_at collate "C" = created_time.value
  ) end into v_prices;

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
            when app_private.sync_history_timestamp_is_canonical_v1("timestamp")
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
    select product.id, product.updated_at, product.deleted_at,
      product.primary_image_updated_at, product.category_id, product.supplier_id,
      product.purchase_price, product.retail_price, product.stock_quantity,
      product.barcode, product.primary_image_version_id
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
    select supplier.updated_at, supplier.deleted_at, supplier.name
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
    select category.updated_at, category.deleted_at, category.name
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
    select price.updated_at, price.product_id, price.price,
      price.effective_at, price.created_at, price.source, price.note
    from public.inventory_product_prices price
    where (
      v_scope_kind in ('shop_scoped', 'authorized_shop_plus_legacy')
      and price.shop_id = p_shop_id
    ) or (
        v_scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
        and price.shop_id is null
        and price.owner_user_id = v_mapped_owner_id
      )
  -- Materialize one result per exact value in this SELECT only. Every scoped
  -- row remains in the counts; NULL dates/prices are invalid, NULL product
  -- numbers are materializable, exactly as the unchanged predicates specify.
  ), integrity_timestamp_values as materialized (
    select effective_at collate "C" as value from scoped_prices where effective_at is not null
    union
    select created_at collate "C" as value from scoped_prices where created_at is not null
  ), integrity_timestamp_validity as materialized (
    select value, app_private.sync_legacy_timestamp_is_canonical_v1(value) as is_canonical
    from integrity_timestamp_values
  ), integrity_price_values as materialized (
    select distinct price as value from scoped_prices where price is not null
  ), integrity_price_validity as materialized (
    select value, app_private.sync_price_value_is_canonical_v1(value) as is_canonical
    from integrity_price_values
  ), integrity_product_values as materialized (
    select purchase_price as value from scoped_products where purchase_price is not null
    union select retail_price as value from scoped_products where retail_price is not null
    union select stock_quantity as value from scoped_products where stock_quantity is not null
  ), integrity_product_validity as materialized (
    select value, app_private.sync_product_number_is_materializable_v1(value) as is_materializable
    from integrity_product_values
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
      left join integrity_product_validity purchase on product.purchase_price = purchase.value
      left join integrity_product_validity retail on product.retail_price = retail.value
      left join integrity_product_validity stock on product.stock_quantity = stock.value
      where not coalesce(purchase.is_materializable, true)
        or not coalesce(retail.is_materializable, true)
        or not coalesce(stock.is_materializable, true)
    ),
    'priceValueViolationCount', (
      select count(*)
      from scoped_prices price
      left join integrity_price_validity amount on price.price = amount.value
      where not coalesce(amount.is_canonical, false)
    ),
    'priceTimestampViolationCount', (
      select count(*)
      from scoped_prices price
      left join integrity_timestamp_validity effective_time
        on price.effective_at collate "C" = effective_time.value
      left join integrity_timestamp_validity created_time
        on price.created_at collate "C" = created_time.value
      where not coalesce(effective_time.is_canonical, false)
        or not coalesce(created_time.is_canonical, false)
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
        and not app_private.sync_history_timestamp_is_canonical_v1(
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
$function$;

commit;
