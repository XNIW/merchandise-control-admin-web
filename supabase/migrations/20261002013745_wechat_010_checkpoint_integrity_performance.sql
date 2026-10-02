-- WECHAT-010: reduce measured repeated validation in checkpoint integrity.
-- Exact predicates, row counts, scopes, locks, DTOs/digests and 8s runtime stay
-- unchanged. Deployment limits below are transaction-local, not runtime limits.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $guard$
begin
  if current_user <> 'postgres' or (
    select count(*) from pg_catalog.pg_proc function_row
    join (values
      ('public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)', '5edb3e348d0276793bea9d03b3df91a7', 'jsonb')
    ) expected(signature, source_md5, result_type)
      on pg_catalog.to_regprocedure(expected.signature) = function_row.oid
    cross join lateral (
      select pg_catalog.array_agg(acl_item::text order by acl_item::text collate "C") as entries
      from pg_catalog.unnest(function_row.proacl) acl(acl_item)
    ) actual_acl
    where pg_catalog.pg_get_userbyid(function_row.proowner) = 'postgres'
      and function_row.prorettype = pg_catalog.to_regtype(expected.result_type)
      and function_row.proretset = false
      and function_row.probin is null
      and function_row.prosqlbody is null
      and function_row.prosupport = 0
      and function_row.prokind = 'f'
      and function_row.prolang = (select oid from pg_catalog.pg_language where lanname='plpgsql')
      and function_row.proisstrict = false
      and function_row.proleakproof = false
      and function_row.procost = 100
      and function_row.prosecdef = true
      and function_row.provolatile = 'v'::"char"
      and function_row.proparallel = 'u'::"char"
      and function_row.proconfig = array['search_path=public, app_private, pg_temp']
      -- Accept only the verified local or TEST privilege sets. Array order is
      -- irrelevant; complete ACL items retain grantor and grant-option checks.
      -- CREATE OR REPLACE below preserves whichever exact ACL already exists.
      and actual_acl.entries in (
            array['authenticated=X/postgres','postgres=X/postgres'],
            array['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']
          )
      and function_row.proargnames = array['p_shop_id','p_device_identifier','p_verified_baseline_id','p_expected_baseline_scope_key']
      and function_row.proargmodes is null
      and function_row.proallargtypes is null
      and function_row.provariadic = 0
      and function_row.pronargdefaults = 2
      and coalesce(pg_catalog.pg_get_expr(function_row.proargdefaults,0), '') =
        '''0''::text, NULL::text'
      and pg_catalog.md5(function_row.prosrc) = expected.source_md5
  ) <> 1 then
    raise exception 'checkpoint_integrity_performance_baseline_mismatch'
      using errcode = '55000';
  end if;
  -- Memoization is statement-local and only applies to these exact immutable
  -- predicates. No helper definition or privilege is replaced by this migration.
  if (
    select count(*) from pg_catalog.pg_proc helper
    join (values
      ('app_private.sync_legacy_timestamp_is_canonical_v1(text)', '90d09a640033bff8d7dce8ea23fe42ce'),
      ('app_private.sync_price_value_is_canonical_v1(double precision)', '1c3cefae1916d272440b19b6d94283bd'),
      ('app_private.sync_product_number_is_materializable_v1(double precision)', '3cfa0ab9a25faed8d845891386dcbd70')
    ) expected(signature, source_md5)
      on helper.oid = pg_catalog.to_regprocedure(expected.signature)
    where helper.provolatile = 'i' and helper.prorettype = 'boolean'::regtype
      and not helper.proretset and helper.prokind = 'f'
      and not helper.proisstrict and not helper.prosecdef
      and helper.proconfig = array['search_path=pg_catalog, pg_temp']
      and pg_catalog.md5(helper.prosrc) = expected.source_md5
  ) <> 3 then
    raise exception 'checkpoint_integrity_performance_predicate_mismatch'
      using errcode = '55000';
  end if;
end;
$guard$;

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

  with scoped as (
    select product.*,
      app_private.sync_product_recovery_row_v1(
        product.id, product.owner_user_id, product.barcode,
        product.item_number, product.product_name,
        product.second_product_name, product.purchase_price,
        product.retail_price, product.supplier_id, product.category_id,
        product.stock_quantity, product.updated_at, product.deleted_at,
        product.shop_id, product.primary_image_version_id,
        product.primary_image_updated_at
      ) as recovery_row
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
    'payloadBytes', coalesce(sum(octet_length(recovery_row::text)), 0),
    'oversizeRowCount', count(*) filter (
      where octet_length(recovery_row::text) >
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
  into v_products
  from scoped;

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
  into v_prices
  from scoped
  left join timestamp_validity effective_time on effective_at collate "C" = effective_time.value
  left join timestamp_validity created_time on created_at collate "C" = created_time.value;

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
