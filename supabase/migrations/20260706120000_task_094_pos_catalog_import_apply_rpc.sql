-- TASK-094 follow-up - Transactional POS catalog import apply RPC.
-- Keeps POS-origin ledger, catalog rows, price rows, audit and sync_events in
-- one PostgreSQL transaction. The POS still calls Admin Web only.

begin;

create or replace function public.pos_catalog_import_apply_v1(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_owner_user_id uuid,
  p_client_import_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_schema_version text,
  p_source text,
  p_batch_created_at timestamptz,
  p_items jsonb,
  p_summary jsonb default '{}'::jsonb,
  p_metadata_redacted jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch_id uuid;
  v_existing public.pos_catalog_import_batches%rowtype;
  v_item jsonb;
  v_client_item_id text;
  v_barcode text;
  v_category_name text;
  v_supplier_name text;
  v_change_kind text;
  v_product_name text;
  v_second_product_name text;
  v_item_number text;
  v_purchase_price double precision;
  v_retail_price double precision;
  v_stock_quantity double precision;
  v_category_id uuid;
  v_supplier_id uuid;
  v_product_id uuid;
  v_purchase_price_id uuid;
  v_retail_price_id uuid;
  v_effective_at text := to_char(p_batch_created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS');
  v_created_at text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS');
  v_items jsonb := '[]'::jsonb;
  v_remote_products jsonb := '[]'::jsonb;
  v_remote_prices jsonb := '[]'::jsonb;
  v_product_ids uuid[] := array[]::uuid[];
  v_price_ids uuid[] := array[]::uuid[];
  v_write_count integer := 0;
  v_duplicate_count integer := 0;
  v_product_event_id text;
  v_price_event_id text;
begin
  if p_schema_version <> 'pos-catalog-import-v1'
    or p_source <> 'supplier_excel'
    or p_client_import_id is null
    or btrim(p_client_import_id) = ''
    or p_idempotency_key is null
    or btrim(p_idempotency_key) = ''
    or p_payload_hash is null
    or btrim(p_payload_hash) = ''
    or jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_shop_id::text || ':' || p_shop_device_id::text),
    hashtext(p_idempotency_key)
  );

  select *
  into v_existing
  from public.pos_catalog_import_batches
  where shop_id = p_shop_id
    and shop_device_id = p_shop_device_id
    and (
      client_import_id = p_client_import_id
      or idempotency_key = p_idempotency_key
    )
  order by received_at asc
  limit 1
  for update;

  if found then
    if v_existing.client_import_id <> p_client_import_id
      or v_existing.idempotency_key <> p_idempotency_key
      or v_existing.payload_hash <> p_payload_hash then
      insert into public.audit_logs (
        actor_profile_id,
        actor_staff_id,
        event_key,
        metadata_redacted,
        result,
        scope,
        severity,
        shop_id,
        target_id,
        target_type
      )
      values (
        null,
        p_staff_id,
        'pos.catalog.import_sync.failure',
        coalesce(p_metadata_redacted, '{}'::jsonb) || jsonb_build_object('code', 'conflict', 'item_count', jsonb_array_length(p_items)),
        'blocked',
        'shop',
        'warning',
        p_shop_id,
        v_existing.pos_catalog_import_batch_id::text,
        'pos_catalog_import_batch'
      );

      return jsonb_build_object('ok', false, 'code', 'conflict');
    end if;

    v_batch_id := v_existing.pos_catalog_import_batch_id;

    if v_existing.status in ('accepted', 'duplicate', 'idempotent') then
      for v_item in select value from jsonb_array_elements(p_items)
      loop
        v_client_item_id := nullif(left(btrim(coalesce(v_item->>'clientItemId', '')), 200), '');
        v_barcode := nullif(left(btrim(coalesce(v_item->>'barcode', '')), 96), '');
        v_change_kind := lower(coalesce(v_item->>'changeKind', ''));

        if v_barcode is null or v_client_item_id is null then
          continue;
        end if;

        select product.id
        into v_product_id
        from public.inventory_products product
        where product.deleted_at is null
          and product.barcode = v_barcode
          and (
            product.shop_id = p_shop_id
            or (product.shop_id is null and product.owner_user_id = p_owner_user_id)
          )
        order by (product.shop_id = p_shop_id) desc, product.updated_at desc
        limit 1;

        v_purchase_price_id := null;
        v_retail_price_id := null;

        if v_product_id is not null then
          if nullif(v_item->>'purchasePrice', '') is not null then
            select price.id
            into v_purchase_price_id
            from public.inventory_product_prices price
            where price.owner_user_id = p_owner_user_id
              and price.product_id = v_product_id
              and price.type = 'PURCHASE'
              and price.effective_at = v_effective_at
              and price.source = 'pos_supplier_excel'
            order by price.created_at desc
            limit 1;
          end if;

          if nullif(v_item->>'retailPrice', '') is not null then
            select price.id
            into v_retail_price_id
            from public.inventory_product_prices price
            where price.owner_user_id = p_owner_user_id
              and price.product_id = v_product_id
              and price.type = 'RETAIL'
              and price.effective_at = v_effective_at
              and price.source = 'pos_supplier_excel'
            order by price.created_at desc
            limit 1;
          end if;
        end if;

        v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'barcode', v_barcode,
          'clientItemId', v_client_item_id,
          'remoteProductId', v_product_id,
          'remotePriceId', coalesce(v_retail_price_id, v_purchase_price_id),
          'priceType', case
            when v_retail_price_id is not null then 'retail'
            when v_purchase_price_id is not null then 'purchase'
            else null
          end,
          'status', 'duplicate'
        )));

        if v_product_id is not null then
          v_remote_products := v_remote_products || jsonb_build_array(jsonb_build_object(
            'barcode', v_barcode,
            'clientItemId', v_client_item_id,
            'remoteProductId', v_product_id
          ));
        end if;

        if v_purchase_price_id is not null then
          v_remote_prices := v_remote_prices || jsonb_build_array(jsonb_build_object(
            'barcode', v_barcode,
            'clientItemId', v_client_item_id,
            'priceType', 'purchase',
            'remoteProductId', v_product_id,
            'remotePriceId', v_purchase_price_id
          ));
        end if;

        if v_retail_price_id is not null then
          v_remote_prices := v_remote_prices || jsonb_build_array(jsonb_build_object(
            'barcode', v_barcode,
            'clientItemId', v_client_item_id,
            'priceType', 'retail',
            'remoteProductId', v_product_id,
            'remotePriceId', v_retail_price_id
          ));
        end if;

        if v_change_kind in ('new', 'updated') then
          v_duplicate_count := v_duplicate_count + 1;
        end if;
      end loop;

      insert into public.audit_logs (
        actor_profile_id,
        actor_staff_id,
        event_key,
        metadata_redacted,
        result,
        scope,
        severity,
        shop_id,
        target_id,
        target_type
      )
      values (
        null,
        p_staff_id,
        'pos.catalog.import_sync.success',
        coalesce(p_metadata_redacted, '{}'::jsonb) || jsonb_build_object('code', 'duplicate_batch', 'item_count', jsonb_array_length(p_items)),
        'success',
        'shop',
        'info',
        p_shop_id,
        v_batch_id::text,
        'pos_catalog_import_batch'
      );

      return jsonb_build_object(
        'ok', true,
        'batchId', v_batch_id,
        'status', 'duplicate',
        'items', v_items,
        'remoteProductIds', v_remote_products,
        'remotePriceIds', v_remote_prices,
        'summary', jsonb_build_object(
          'acceptedItemCount', 0,
          'duplicateItemCount', v_duplicate_count,
          'productCount', v_duplicate_count
        )
      );
    end if;

    update public.pos_catalog_import_batches
    set status = 'processing',
        updated_at = now()
    where pos_catalog_import_batch_id = v_batch_id;
  else
    insert into public.pos_catalog_import_batches (
      shop_id,
      shop_device_id,
      staff_id,
      pos_session_id,
      client_import_id,
      idempotency_key,
      payload_hash,
      schema_version,
      source,
      status,
      metadata_redacted
    )
    values (
      p_shop_id,
      p_shop_device_id,
      p_staff_id,
      p_pos_session_id,
      p_client_import_id,
      p_idempotency_key,
      p_payload_hash,
      p_schema_version,
      p_source,
      'processing',
      coalesce(p_metadata_redacted, '{}'::jsonb) || jsonb_build_object(
        'item_count', jsonb_array_length(p_items),
        'summary', coalesce(p_summary, '{}'::jsonb)
      )
    )
    returning pos_catalog_import_batch_id into v_batch_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_client_item_id := nullif(left(btrim(coalesce(v_item->>'clientItemId', '')), 200), '');
    v_barcode := nullif(left(btrim(coalesce(v_item->>'barcode', '')), 96), '');
    v_change_kind := lower(coalesce(v_item->>'changeKind', ''));

    if v_change_kind not in ('new', 'updated') then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'clientItemId', coalesce(v_client_item_id, 'skipped'),
        'barcode', v_barcode,
        'status', 'skipped'
      ));
      continue;
    end if;

    v_category_name := nullif(left(btrim(coalesce(v_item->>'category', '')), 120), '');
    v_supplier_name := nullif(left(btrim(coalesce(v_item->>'supplier', '')), 120), '');
    v_product_name := nullif(left(btrim(coalesce(v_item->>'productName', '')), 240), '');
    v_second_product_name := nullif(left(btrim(coalesce(v_item->>'secondProductName', '')), 240), '');
    v_item_number := nullif(left(btrim(coalesce(v_item->>'itemNumber', '')), 120), '');
    v_purchase_price := nullif(v_item->>'purchasePrice', '')::double precision;
    v_retail_price := nullif(v_item->>'retailPrice', '')::double precision;
    v_stock_quantity := nullif(v_item->>'quantity', '')::double precision;

    if v_barcode is null or v_client_item_id is null or v_product_name is null then
      raise exception 'invalid catalog import item';
    end if;

    v_category_id := null;
    if v_category_name is not null then
      select category.id
      into v_category_id
      from public.inventory_categories category
      where category.deleted_at is null
        and lower(category.name) = lower(v_category_name)
        and (
          category.shop_id = p_shop_id
          or (category.shop_id is null and category.owner_user_id = p_owner_user_id)
        )
      order by (category.shop_id = p_shop_id) desc, category.updated_at desc
      limit 1;

      if v_category_id is null then
        begin
          insert into public.inventory_categories (shop_id, owner_user_id, name, updated_at)
          values (p_shop_id, p_owner_user_id, v_category_name, now())
          returning id into v_category_id;
        exception
          when unique_violation then
            select category.id
            into v_category_id
            from public.inventory_categories category
            where category.deleted_at is null
              and lower(category.name) = lower(v_category_name)
              and (
                category.shop_id = p_shop_id
                or (category.shop_id is null and category.owner_user_id = p_owner_user_id)
              )
            order by (category.shop_id = p_shop_id) desc, category.updated_at desc
            limit 1;
        end;
      end if;
    end if;

    v_supplier_id := null;
    if v_supplier_name is not null then
      select supplier.id
      into v_supplier_id
      from public.inventory_suppliers supplier
      where supplier.deleted_at is null
        and lower(supplier.name) = lower(v_supplier_name)
        and (
          supplier.shop_id = p_shop_id
          or (supplier.shop_id is null and supplier.owner_user_id = p_owner_user_id)
        )
      order by (supplier.shop_id = p_shop_id) desc, supplier.updated_at desc
      limit 1;

      if v_supplier_id is null then
        begin
          insert into public.inventory_suppliers (shop_id, owner_user_id, name, updated_at)
          values (p_shop_id, p_owner_user_id, v_supplier_name, now())
          returning id into v_supplier_id;
        exception
          when unique_violation then
            select supplier.id
            into v_supplier_id
            from public.inventory_suppliers supplier
            where supplier.deleted_at is null
              and lower(supplier.name) = lower(v_supplier_name)
              and (
                supplier.shop_id = p_shop_id
                or (supplier.shop_id is null and supplier.owner_user_id = p_owner_user_id)
              )
            order by (supplier.shop_id = p_shop_id) desc, supplier.updated_at desc
            limit 1;
        end;
      end if;
    end if;

    select product.id
    into v_product_id
    from public.inventory_products product
    where product.deleted_at is null
      and product.barcode = v_barcode
      and (
        product.shop_id = p_shop_id
        or (product.shop_id is null and product.owner_user_id = p_owner_user_id)
      )
    order by (product.shop_id = p_shop_id) desc, product.updated_at desc
    limit 1;

    if v_product_id is not null then
      update public.inventory_products
      set item_number = v_item_number,
          product_name = v_product_name,
          second_product_name = v_second_product_name,
          purchase_price = coalesce(v_purchase_price, purchase_price),
          retail_price = coalesce(v_retail_price, retail_price),
          stock_quantity = coalesce(v_stock_quantity, stock_quantity),
          supplier_id = coalesce(v_supplier_id, supplier_id),
          category_id = coalesce(v_category_id, category_id),
          shop_id = p_shop_id,
          owner_user_id = p_owner_user_id,
          deleted_at = null,
          updated_at = now()
      where id = v_product_id;
    else
      begin
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
          p_owner_user_id,
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
      exception
        when unique_violation then
          select product.id
          into v_product_id
          from public.inventory_products product
          where product.deleted_at is null
            and product.barcode = v_barcode
            and (
              product.shop_id = p_shop_id
              or (product.shop_id is null and product.owner_user_id = p_owner_user_id)
            )
          order by (product.shop_id = p_shop_id) desc, product.updated_at desc
          limit 1;

          update public.inventory_products
          set item_number = v_item_number,
              product_name = v_product_name,
              second_product_name = v_second_product_name,
              purchase_price = coalesce(v_purchase_price, purchase_price),
              retail_price = coalesce(v_retail_price, retail_price),
              stock_quantity = coalesce(v_stock_quantity, stock_quantity),
              supplier_id = coalesce(v_supplier_id, supplier_id),
              category_id = coalesce(v_category_id, category_id),
              shop_id = p_shop_id,
              owner_user_id = p_owner_user_id,
              deleted_at = null,
              updated_at = now()
          where id = v_product_id;
      end;
    end if;

    v_purchase_price_id := null;
    if v_purchase_price is not null then
      insert into public.inventory_product_prices (
        id,
        owner_user_id,
        shop_id,
        product_id,
        type,
        price,
        effective_at,
        source,
        created_at
      )
      values (
        gen_random_uuid(),
        p_owner_user_id,
        p_shop_id,
        v_product_id,
        'PURCHASE',
        v_purchase_price,
        v_effective_at,
        'pos_supplier_excel',
        v_created_at
      )
      on conflict on constraint inventory_product_prices_owner_product_type_effective_uniq
      do update
      set shop_id = excluded.shop_id,
          price = excluded.price,
          source = excluded.source,
          created_at = excluded.created_at
      returning id into v_purchase_price_id;

      v_price_ids := array_append(v_price_ids, v_purchase_price_id);
      v_remote_prices := v_remote_prices || jsonb_build_array(jsonb_build_object(
        'barcode', v_barcode,
        'clientItemId', v_client_item_id,
        'priceType', 'purchase',
        'remoteProductId', v_product_id,
        'remotePriceId', v_purchase_price_id
      ));
    end if;

    v_retail_price_id := null;
    if v_retail_price is not null then
      insert into public.inventory_product_prices (
        id,
        owner_user_id,
        shop_id,
        product_id,
        type,
        price,
        effective_at,
        source,
        created_at
      )
      values (
        gen_random_uuid(),
        p_owner_user_id,
        p_shop_id,
        v_product_id,
        'RETAIL',
        v_retail_price,
        v_effective_at,
        'pos_supplier_excel',
        v_created_at
      )
      on conflict on constraint inventory_product_prices_owner_product_type_effective_uniq
      do update
      set shop_id = excluded.shop_id,
          price = excluded.price,
          source = excluded.source,
          created_at = excluded.created_at
      returning id into v_retail_price_id;

      v_price_ids := array_append(v_price_ids, v_retail_price_id);
      v_remote_prices := v_remote_prices || jsonb_build_array(jsonb_build_object(
        'barcode', v_barcode,
        'clientItemId', v_client_item_id,
        'priceType', 'retail',
        'remoteProductId', v_product_id,
        'remotePriceId', v_retail_price_id
      ));
    end if;

    if not (v_product_id = any(v_product_ids)) then
      v_product_ids := array_append(v_product_ids, v_product_id);
    end if;

    v_remote_products := v_remote_products || jsonb_build_array(jsonb_build_object(
      'barcode', v_barcode,
      'clientItemId', v_client_item_id,
      'remoteProductId', v_product_id
    ));

    v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'barcode', v_barcode,
      'clientItemId', v_client_item_id,
      'remoteProductId', v_product_id,
      'remotePriceId', coalesce(v_retail_price_id, v_purchase_price_id),
      'priceType', case
        when v_retail_price_id is not null then 'retail'
        when v_purchase_price_id is not null then 'purchase'
        else null
      end,
      'status', 'accepted'
    )));
    v_write_count := v_write_count + 1;
  end loop;

  update public.pos_catalog_import_batches
  set status = 'accepted',
      product_count = v_write_count,
      accepted_item_count = v_write_count,
      duplicate_item_count = 0,
      updated_at = now()
  where pos_catalog_import_batch_id = v_batch_id;

  if array_length(v_product_ids, 1) is not null then
    v_product_event_id := 'pos_catalog_import:products:' || v_batch_id::text || ':' || md5(array_to_string(v_product_ids, ','));
    begin
      insert into public.sync_events (
        batch_id,
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
        v_batch_id,
        array_length(v_product_ids, 1),
        v_product_event_id,
        'catalog',
        jsonb_build_object('product_ids', to_jsonb(v_product_ids)),
        'catalog_changed',
        jsonb_build_object(
          'source', 'pos_catalog_import_sync',
          'status', 'success',
          'operation', 'bulk_import',
          'payload_version', 1
        ),
        p_owner_user_id,
        p_shop_id,
        'pos_catalog_import_sync',
        p_shop_device_id::text
      );
    exception
      when unique_violation then
        null;
    end;
  end if;

  if array_length(v_price_ids, 1) is not null then
    v_price_event_id := 'pos_catalog_import:prices:' || v_batch_id::text || ':' || md5(array_to_string(v_price_ids, ','));
    begin
      insert into public.sync_events (
        batch_id,
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
        v_batch_id,
        array_length(v_price_ids, 1),
        v_price_event_id,
        'prices',
        jsonb_build_object('price_ids', to_jsonb(v_price_ids), 'product_ids', to_jsonb(v_product_ids)),
        'prices_changed',
        jsonb_build_object(
          'source', 'pos_catalog_import_sync',
          'status', 'success',
          'operation', 'bulk_import',
          'payload_version', 1
        ),
        p_owner_user_id,
        p_shop_id,
        'pos_catalog_import_sync',
        p_shop_device_id::text
      );
    exception
      when unique_violation then
        null;
    end;
  end if;

  insert into public.audit_logs (
    actor_profile_id,
    actor_staff_id,
    event_key,
    metadata_redacted,
    result,
    scope,
    severity,
    shop_id,
    target_id,
    target_type
  )
  values (
    null,
    p_staff_id,
    'pos.catalog.import_sync.success',
    coalesce(p_metadata_redacted, '{}'::jsonb) || jsonb_build_object(
      'code', 'accepted',
      'accepted_item_count', v_write_count,
      'item_count', jsonb_array_length(p_items),
      'product_count', v_write_count,
      'sync_event_product_written', array_length(v_product_ids, 1) is not null,
      'sync_event_price_written', array_length(v_price_ids, 1) is not null
    ),
    'success',
    'shop',
    'info',
    p_shop_id,
    v_batch_id::text,
    'pos_catalog_import_batch'
  );

  return jsonb_build_object(
    'ok', true,
    'batchId', v_batch_id,
    'status', 'accepted',
    'items', v_items,
    'remoteProductIds', v_remote_products,
    'remotePriceIds', v_remote_prices,
    'summary', jsonb_build_object(
      'acceptedItemCount', v_write_count,
      'duplicateItemCount', 0,
      'productCount', v_write_count
    )
  );
exception
  when others then
    raise;
end;
$$;

revoke all on function public.pos_catalog_import_apply_v1(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  jsonb,
  jsonb,
  jsonb
) from public, anon, authenticated;

grant execute on function public.pos_catalog_import_apply_v1(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  jsonb,
  jsonb,
  jsonb
) to service_role;

commit;
