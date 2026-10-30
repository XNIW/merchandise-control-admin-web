-- PRIVATE forward proposal only. No migration filename/history is assigned.
-- Root review, parity qualification and a separate TEST apply admission are required.
DO $product_timestamp_memo_01$
DECLARE
  signature constant regprocedure := 'public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure;
  before_source text;
  before_metadata jsonb;
  after_source text;
  after_metadata jsonb;
  definition text;
  old_statement constant text := $product_timestamp_old_01$  with scalar_contract as materialized (
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
  ) end into v_products;$product_timestamp_old_01$;
  new_statement constant text := $product_timestamp_new_01$  with scalar_contract as materialized (
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
    select value, coalesce(octet_length(to_jsonb(app_private.sync_checkpoint_json_timestamp(value))::text), 4) as scalar_bytes,
      app_private.sync_checkpoint_timestamp(value) as version_digest
    from timestamp_values
  ), scoped as materialized (
    select product_scalars.id, product_scalars.barcode, product_scalars.item_number,
      product_scalars.updated_at, product_scalars.deleted_at, product_scalars.supplier_id,
      product_scalars.category_id, product_scalars.primary_image_version_id,
      product_scalars.primary_image_updated_at,
      -- Reuse only pure helper results guarded by scalar_contract. Unsafe
      -- rows retain their original calls; NULL is the pinned helper's '-'.
      case when can_flat then coalesce(updated.version_digest, '-')
        else app_private.sync_checkpoint_timestamp(product_scalars.updated_at) end as updated_version_digest,
      case when can_flat then coalesce(deleted.version_digest, '-')
        else app_private.sync_checkpoint_timestamp(product_scalars.deleted_at) end as deleted_version_digest,
      case when product_scalars.deleted_at is null then
        case when can_flat then coalesce(image_updated.version_digest, '-')
          else app_private.sync_checkpoint_timestamp(product_scalars.primary_image_updated_at) end
        else '-' end as image_updated_version_digest,
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
        updated_version_digest || E'\x1f' ||
        deleted_version_digest || E'\x1f' ||
        case when deleted_at is null
          then coalesce(lower(category_id::text), '-') else '-' end || E'\x1f' ||
        case when deleted_at is null
          then coalesce(lower(supplier_id::text), '-') else '-' end || E'\x1f' ||
        case when deleted_at is null
          then coalesce(lower(primary_image_version_id::text), '-') else '-' end || E'\x1f' ||
        case when deleted_at is null
          then image_updated_version_digest else '-' end
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
  ) end into v_products;$product_timestamp_new_01$;
BEGIN
  SELECT function.prosrc,
    (to_jsonb(function) - 'prosrc' - 'proargdefaults') ||
      jsonb_build_object('proargdefaults', pg_get_expr(function.proargdefaults, 0))
    INTO STRICT before_source, before_metadata
    FROM pg_catalog.pg_proc function WHERE function.oid = signature;
  IF md5(before_source) <> '9fee0c276080e3f45b8d567883b13e04'
    OR pg_get_userbyid((before_metadata->>'proowner')::oid) <> 'postgres'
    OR current_user <> 'postgres'
    OR before_metadata->'proconfig' <> '["search_path=public, app_private, pg_temp"]'::jsonb
    OR before_metadata->'prosecdef' <> 'true'::jsonb
    OR (SELECT jsonb_agg(a::text ORDER BY a::text COLLATE "C")
        FROM unnest((SELECT proacl FROM pg_catalog.pg_proc WHERE oid = signature)) a)
      IS DISTINCT FROM '["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb
    OR app_private.sync_recovery_scalar_bytes_contract_v1() IS NOT TRUE THEN
    RAISE EXCEPTION 'PRODUCT_TIMESTAMP_MEMO_SOURCE_METADATA_OR_CONTRACT_MISMATCH' USING ERRCODE = '55000';
  END IF;
  IF (length(before_source) - length(replace(before_source, old_statement, ''))) / length(old_statement) <> 1
    OR md5(replace(before_source, old_statement, new_statement)) <> '60473835c0aa6a53ae16d1c303f3c7bf' THEN
    RAISE EXCEPTION 'PRODUCT_TIMESTAMP_MEMO_EXACT_REPLACEMENT_MISMATCH' USING ERRCODE = '55000';
  END IF;
  definition := pg_catalog.pg_get_functiondef(signature);
  IF (length(definition) - length(replace(definition, old_statement, ''))) / length(old_statement) <> 1 THEN
    RAISE EXCEPTION 'PRODUCT_TIMESTAMP_MEMO_DEFINITION_REPLACEMENT_MISMATCH' USING ERRCODE = '55000';
  END IF;
  EXECUTE replace(definition, old_statement, new_statement);
  SELECT function.prosrc,
    (to_jsonb(function) - 'prosrc' - 'proargdefaults') ||
      jsonb_build_object('proargdefaults', pg_get_expr(function.proargdefaults, 0))
    INTO STRICT after_source, after_metadata
    FROM pg_catalog.pg_proc function WHERE function.oid = signature;
  IF md5(after_source) <> '60473835c0aa6a53ae16d1c303f3c7bf' OR after_metadata IS DISTINCT FROM before_metadata THEN
    RAISE EXCEPTION 'PRODUCT_TIMESTAMP_MEMO_POSTCHECK_MISMATCH' USING ERRCODE = '55000';
  END IF;
END;
$product_timestamp_memo_01$;
