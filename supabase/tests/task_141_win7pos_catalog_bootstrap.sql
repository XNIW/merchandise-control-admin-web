begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

select is(
  (
    select proc.provolatile::text
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'app_private'
      and proc.proname = 'pos_catalog_integrity_violation_count_v2'
  ),
  's',
  'TASK-141 integrity preflight remains STABLE'
);

select ok(
  has_function_privilege(
    'service_role',
    'app_private.pos_catalog_integrity_violation_count_v2(uuid,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'app_private.pos_catalog_integrity_violation_count_v2(uuid,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.pos_catalog_integrity_violation_count_v2(uuid,text,uuid)',
    'EXECUTE'
  ),
  'TASK-141 preserves the private service-role-only preflight boundary'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000001411',
  'authenticated',
  'authenticated',
  'task141-volume@example.invalid',
  '{}',
  '{}',
  now(),
  now()
);

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '10000000-0000-4000-8000-000000001411',
  'T141A',
  'TASK-141 Win7POS volume shop',
  'active'
);

-- Build the incident-equivalent scope in four statements without exercising
-- unrelated publication triggers.  Every row is explicit and this transaction
-- rolls back after the assertions.
set local session_replication_role = replica;

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name, updated_at, deleted_at
)
select
  (
    '14110000-0000-4000-8000-'
    || lpad(series.row_number::text, 12, '0')
  )::uuid,
  '00000000-0000-4000-8000-000000001411'::uuid,
  '10000000-0000-4000-8000-000000001411'::uuid,
  'TASK-141 category ' || lpad(series.row_number::text, 3, '0'),
  '2026-07-26T17:00:00.123456+00:00'::timestamptz,
  case when series.row_number <= 29
    then '2026-07-26T17:00:00.123456+00:00'::timestamptz
    else null
  end
from generate_series(1, 100) series(row_number);

insert into public.inventory_suppliers (
  id, owner_user_id, shop_id, name, updated_at, deleted_at
)
select
  (
    '14120000-0000-4000-8000-'
    || lpad(series.row_number::text, 12, '0')
  )::uuid,
  '00000000-0000-4000-8000-000000001411'::uuid,
  '10000000-0000-4000-8000-000000001411'::uuid,
  'TASK-141 supplier ' || lpad(series.row_number::text, 3, '0'),
  '2026-07-26T17:00:00.123456+00:00'::timestamptz,
  case when series.row_number <= 29
    then '2026-07-26T17:00:00.123456+00:00'::timestamptz
    else null
  end
from generate_series(1, 131) series(row_number);

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, item_number, product_name,
  second_product_name, purchase_price, retail_price, supplier_id,
  category_id, stock_quantity, updated_at, deleted_at
)
select
  (
    '14130000-0000-4000-8000-'
    || lpad(series.row_number::text, 12, '0')
  )::uuid,
  '00000000-0000-4000-8000-000000001411'::uuid,
  '10000000-0000-4000-8000-000000001411'::uuid,
  'TASK141-' || lpad(series.row_number::text, 8, '0'),
  'ITEM-' || lpad(series.row_number::text, 8, '0'),
  'TASK-141 product ' || series.row_number,
  null,
  10.125,
  15.875,
  case when series.row_number <= 60 then null else (
    '14120000-0000-4000-8000-'
    || lpad((30 + mod(series.row_number - 61, 102))::text, 12, '0')
  )::uuid end,
  case when series.row_number <= 60 then null else (
    '14110000-0000-4000-8000-'
    || lpad((30 + mod(series.row_number - 61, 71))::text, 12, '0')
  )::uuid end,
  20,
  '2026-07-26T17:00:00.123456+00:00'::timestamptz,
  case when series.row_number <= 60
    then '2026-07-26T17:00:00.123456+00:00'::timestamptz
    else null
  end
from generate_series(1, 19823) series(row_number);

insert into public.inventory_product_prices (
  id, owner_user_id, shop_id, product_id, type, price, effective_at,
  source, note, created_at, updated_at
)
select
  (
    '14140000-0000-4000-8000-'
    || lpad(series.row_number::text, 12, '0')
  )::uuid,
  '00000000-0000-4000-8000-000000001411'::uuid,
  '10000000-0000-4000-8000-000000001411'::uuid,
  (
    '14130000-0000-4000-8000-'
    || lpad((
      case when series.row_number <= 95
        then 1 + mod(series.row_number - 1, 41)
        else 61 + mod(series.row_number - 96, 19763)
      end
    )::text, 12, '0')
  )::uuid,
  'RETAIL',
  15.875,
  to_char(
    timestamp '2026-07-25 00:00:00'
      + series.row_number * interval '1 second',
    'YYYY-MM-DD HH24:MI:SS'
  ),
  'TASK-141 volume fixture',
  null,
  to_char(
    timestamp '2026-07-25 00:00:00'
      + series.row_number * interval '1 second',
    'YYYY-MM-DD HH24:MI:SS'
  ),
  '2026-07-26T17:00:00.123456+00:00'::timestamptz
from generate_series(1, 41323) series(row_number);

set local session_replication_role = origin;

select is(
  app_private.pos_catalog_integrity_violation_count_v2(
    '10000000-0000-4000-8000-000000001411',
    'shop_scoped',
    '10000000-0000-4000-8000-000000001411'
  ),
  0::bigint,
  'same-scope historical prices for soft-deleted products are not corruption'
);

create temporary table task141_bootstrap_result (
  payload jsonb not null,
  elapsed_ms numeric not null
) on commit drop;

do $$
declare
  v_started_at timestamptz := clock_timestamp();
  v_payload jsonb;
begin
  v_payload := public.pos_catalog_pull_page_v2(
    p_shop_id => '10000000-0000-4000-8000-000000001411',
    p_mode => 'full_refresh',
    p_lower_bound => null,
    p_snapshot_at => null,
    p_entity => null,
    p_after_updated_at => null,
    p_after_id => null,
    p_limit => 500,
    p_expected_revision => null,
    p_expected_scope_kind => null,
    p_expected_scope_key => null,
    p_include_manifest => true
  );

  insert into task141_bootstrap_result (payload, elapsed_ms)
  values (
    v_payload,
    extract(epoch from clock_timestamp() - v_started_at) * 1000
  );
end;
$$;

select is(
  (select payload->>'status' from task141_bootstrap_result),
  'ok',
  'incident-equivalent first catalog page succeeds'
);

select ok(
  (
    select payload->'manifest'->'catalogSummary' = jsonb_build_object(
      'activeProducts', 19763,
      'categories', 71,
      'prices', 41228,
      'products', 19763,
      'suppliers', 102
    )
    from task141_bootstrap_result
  ),
  'manifest excludes deleted entities and their 95 retained historical prices'
);

select ok(
  (select elapsed_ms < 7500 from task141_bootstrap_result),
  'incident-equivalent manifest preflight completes below the 8 second API budget'
);

select is(
  (
    select count(*)::integer
    from jsonb_array_elements(
      (select payload->'rows' from task141_bootstrap_result)
    ) row_payload
    where (row_payload->>'id')::uuid in (
      select id
      from public.inventory_categories
      where shop_id = '10000000-0000-4000-8000-000000001411'
        and deleted_at is not null
    )
  ),
  0,
  'first active catalog page exposes no soft-deleted category'
);

-- Missing/cross-scope product relations remain fail-closed.
set local session_replication_role = replica;
insert into public.inventory_product_prices (
  id, owner_user_id, shop_id, product_id, type, price, effective_at,
  source, note, created_at, updated_at
)
values (
  '14140000-0000-4000-8000-000000099999',
  '00000000-0000-4000-8000-000000001411',
  '10000000-0000-4000-8000-000000001411',
  '14130000-0000-4000-8000-000000099999',
  'RETAIL',
  15.875,
  '2026-07-26 16:59:59',
  'TASK-141 missing-product fixture',
  null,
  '2026-07-26 16:59:59',
  '2026-07-26T17:00:00.123456+00:00'
);
set local session_replication_role = origin;

select is(
  app_private.pos_catalog_integrity_violation_count_v2(
    '10000000-0000-4000-8000-000000001411',
    'shop_scoped',
    '10000000-0000-4000-8000-000000001411'
  ),
  1::bigint,
  'a truly missing product relation remains integrity-blocked'
);

select is(
  (
    public.pos_catalog_pull_page_v2(
      p_shop_id => '10000000-0000-4000-8000-000000001411',
      p_mode => 'full_refresh',
      p_lower_bound => null,
      p_snapshot_at => null,
      p_entity => null,
      p_after_updated_at => null,
      p_after_id => null,
      p_limit => 500,
      p_expected_revision => null,
      p_expected_scope_kind => null,
      p_expected_scope_key => null,
      p_include_manifest => true
    )->>'status'
  ),
  'integrity_blocked',
  'catalog page blocks instead of returning an empty or partial catalog'
);

select ok(
  not (
    public.pos_catalog_pull_page_v2(
      p_shop_id => '10000000-0000-4000-8000-000000001411',
      p_mode => 'full_refresh',
      p_lower_bound => null,
      p_snapshot_at => null,
      p_entity => null,
      p_after_updated_at => null,
      p_after_id => null,
      p_limit => 500,
      p_expected_revision => null,
      p_expected_scope_kind => null,
      p_expected_scope_key => null,
      p_include_manifest => true
    ) ?| array['rows', 'manifest']
  ),
  'integrity-blocked response leaks neither rows nor a partial manifest'
);

select * from finish();
rollback;
