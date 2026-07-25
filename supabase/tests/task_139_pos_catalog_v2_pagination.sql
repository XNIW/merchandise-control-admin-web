begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(45);

select has_table(
  'app_private',
  'pos_catalog_revisions',
  'TASK-139 revision table exists in the private schema'
);
select has_column(
  'public',
  'inventory_product_prices',
  'updated_at',
  'price history has an updated_at keyset column'
);
select col_not_null(
  'public',
  'inventory_product_prices',
  'updated_at',
  'price updated_at is mandatory after the legacy backfill'
);
select col_type_is(
  'public',
  'inventory_product_prices',
  'updated_at',
  'timestamp with time zone',
  'price updated_at preserves PostgreSQL timestamp precision'
);
select has_function(
  'public',
  'pos_catalog_revision_v2',
  array['uuid'],
  'catalog revision RPC exists'
);
select has_function(
  'public',
  'pos_catalog_pull_page_v2',
  array[
    'uuid', 'text', 'timestamp with time zone', 'timestamp with time zone',
    'text', 'timestamp with time zone', 'uuid', 'integer', 'text', 'text',
    'text', 'boolean'
  ],
  'atomic catalog page RPC exists'
);
select is(
  (
    select proc.provolatile::text
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname = 'pos_catalog_pull_page_v2'
  ),
  'v',
  'page RPC is VOLATILE because the scope lease acquires locks before reading'
);
select is(
  (
    select proc.provolatile::text
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname = 'pos_catalog_revision_v2'
  ),
  'v',
  'revision RPC is VOLATILE because the scope lease acquires locks before reading'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.pos_catalog_pull_page_v2(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean)',
    'EXECUTE'
  ),
  'service_role cannot execute the unleased page RPC directly'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.pos_catalog_pull_page_v2(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean)',
    'EXECUTE'
  ),
  'anon cannot execute the page RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.pos_catalog_pull_page_v2(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean)',
    'EXECUTE'
  ),
  'authenticated cannot execute the page RPC'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.pos_catalog_revision_v2(uuid)',
    'EXECUTE'
  ),
  'service_role cannot execute the unleased revision RPC directly'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.pos_catalog_revision_v2(uuid)',
    'EXECUTE'
  ),
  'anon cannot execute the revision RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.pos_catalog_revision_v2(uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute the revision RPC'
);
select ok(
  not has_table_privilege('anon', 'app_private.pos_catalog_revisions', 'SELECT')
    and not has_table_privilege(
      'authenticated',
      'app_private.pos_catalog_revisions',
      'SELECT'
    ),
  'client roles cannot read raw revisions'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.pos_catalog_pull_page_for_lease_v3(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean,uuid,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.pos_catalog_pull_page_for_lease_v3(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean,uuid,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.pos_catalog_pull_page_for_lease_v3(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean,uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'only service_role can execute the lease-bound page wrapper'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.pos_catalog_revision_for_lease_v3(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.pos_catalog_revision_for_lease_v3(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.pos_catalog_revision_for_lease_v3(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'only service_role can execute the lease-bound revision wrapper'
);
select is(
  (
    select count(*)::integer
    from pg_constraint constraint_row
    join pg_class table_row on table_row.oid = constraint_row.conrelid
    join pg_namespace namespace on namespace.oid = table_row.relnamespace
    where namespace.nspname = 'app_private'
      and table_row.relname = 'pos_catalog_revisions'
      and constraint_row.contype = 'f'
  ),
  0,
  'revision tombstones have no shop FK that could break cascade purge'
);
select is(
  (
    select count(*)::integer
    from pg_trigger trigger_row
    where trigger_row.tgname like 'task139_catalog_revision_%'
      and not trigger_row.tgisinternal
  ),
  12,
  'all four catalog tables have insert/update/delete statement triggers'
);
select is(
  (
    select count(*)::integer
    from pg_trigger trigger_row
    where trigger_row.tgname like 'task139_catalog_mapping_revision_%'
      and not trigger_row.tgisinternal
  ),
  3,
  'mapping changes have insert/update/delete statement triggers'
);
select is(
  (
    select trigger_row.tgenabled::text
    from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace namespace on namespace.oid = table_row.relnamespace
    where namespace.nspname = 'public'
      and table_row.relname = 'inventory_product_prices'
      and trigger_row.tgname = 'task088_mobile_price_append_only'
  ),
  'O',
  'the append-only price trigger is re-enabled after the metadata backfill'
);
select is(
  (
    select count(*)::integer
    from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace namespace on namespace.oid = table_row.relnamespace
    where namespace.nspname = 'public'
      and table_row.relname = 'inventory_product_prices'
      and trigger_row.tgname in (
        'cross_platform_atomic_sync_insert',
        'cross_platform_atomic_sync_update'
      )
      and trigger_row.tgenabled = 'O'
  ),
  2,
  'both complete-ID atomic sync triggers are enabled after the metadata backfill'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000001391','authenticated','authenticated','task139-main@example.invalid','{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000001392','authenticated','authenticated','task139-product@example.invalid','{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000001393','authenticated','authenticated','task139-legacy@example.invalid','{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000001394','authenticated','authenticated','task139-purge@example.invalid','{}','{}',now(),now());

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values
  ('10000000-0000-4000-8000-000000001391','T139A','TASK-139 page shop','active'),
  ('10000000-0000-4000-8000-000000001392','T139B','TASK-139 product shop','active'),
  ('10000000-0000-4000-8000-000000001393','T139C','TASK-139 legacy shop','active'),
  ('10000000-0000-4000-8000-000000001394','T139D','TASK-139 purge shop','active');

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name, updated_at
)
select
  ('13900000-0000-4000-8000-' || lpad(series.row_number::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000001391'::uuid,
  '10000000-0000-4000-8000-000000001391'::uuid,
  'TASK-139 category ' || lpad(series.row_number::text, 4, '0'),
  '2026-07-19T17:06:00.123456+00:00'::timestamptz
from generate_series(1, 1001) series(row_number);

select is(
  (
    select revision
    from app_private.pos_catalog_revisions
    where shop_id = '10000000-0000-4000-8000-000000001391'
  ),
  1::bigint,
  'one 1001-row statement advances the shop revision exactly once'
);

create temporary table task139_page_one (payload jsonb) on commit drop;
insert into task139_page_one (payload)
select public.pos_catalog_pull_page_v2(
  p_shop_id => '10000000-0000-4000-8000-000000001391',
  p_mode => 'full_refresh',
  p_lower_bound => null,
  p_snapshot_at => null,
  p_entity => null,
  p_after_updated_at => null,
  p_after_id => null,
  p_limit => 1000,
  p_expected_revision => null,
  p_expected_scope_kind => null,
  p_expected_scope_key => null,
  p_include_manifest => true
);

select ok(
  (
    select jsonb_array_length(payload->'rows') = 240
      and (payload->>'pageLimit')::integer = 240
    from task139_page_one
  ),
  'first page is clamped to the authoritative categories cap of 240 rows'
);
select is(
  (select (payload->>'entityHasMore')::boolean from task139_page_one),
  true,
  'the bounded page exposes a continuation after its 240-row limit'
);
select ok(
  (
    select payload->>'scopeKey' ~ '^[0-9a-f]{32}$'
      and payload->>'scopeKey' <> '10000000-0000-4000-8000-000000001391'
    from task139_page_one
  ),
  'the page exposes only an opaque scope key, never the raw scope UUID'
);
select is(
  (
    select (payload->'manifest'->'catalogSummary'->>'categories')::integer
    from task139_page_one
  ),
  1001,
  'manifest reports the authoritative full category count'
);

create temporary table task139_page_two (payload jsonb) on commit drop;
insert into task139_page_two (payload)
select public.pos_catalog_pull_page_v2(
  p_shop_id => '10000000-0000-4000-8000-000000001391',
  p_mode => 'full_refresh',
  p_lower_bound => null,
  p_snapshot_at => (first.payload->>'snapshotAt')::timestamptz,
  p_entity => 'categories',
  p_after_updated_at => (first.payload->'rows'->239->>'updated_at')::timestamptz,
  p_after_id => (first.payload->'rows'->239->>'id')::uuid,
  p_limit => 1000,
  p_expected_revision => first.payload->>'revision',
  p_expected_scope_kind => first.payload->>'scopeKind',
  p_expected_scope_key => first.payload->>'scopeKey',
  p_include_manifest => false
)
from task139_page_one first;

select is(
  (select jsonb_array_length(payload->'rows') from task139_page_two),
  240,
  'second page remains bounded to the authoritative categories cap'
);
select is(
  (select (payload->>'entityHasMore')::boolean from task139_page_two),
  true,
  'second category page exposes the next continuation'
);
select isnt(
  (select payload->'rows'->239->>'id' from task139_page_one),
  (select payload->'rows'->0->>'id' from task139_page_two),
  'microsecond keyset continuation does not duplicate the boundary row'
);
select is(
  (
    select public.pos_catalog_pull_page_v2(
      p_shop_id => '10000000-0000-4000-8000-000000001391',
      p_mode => 'full_refresh',
      p_lower_bound => null,
      p_snapshot_at => (first.payload->>'snapshotAt')::timestamptz,
      p_entity => 'categories',
      p_after_updated_at => (first.payload->'rows'->239->>'updated_at')::timestamptz,
      p_after_id => (first.payload->'rows'->239->>'id')::uuid,
      p_limit => 1000,
      p_expected_revision => first.payload->>'revision',
      p_expected_scope_kind => first.payload->>'scopeKind',
      p_expected_scope_key => first.payload->>'scopeKey',
      p_include_manifest => false
    )
    from task139_page_one first
  ),
  (select payload from task139_page_two),
  'replaying the same continuation yields the identical page'
);

create temporary table task139_page_three (payload jsonb) on commit drop;
insert into task139_page_three (payload)
select public.pos_catalog_pull_page_v2(
  p_shop_id => '10000000-0000-4000-8000-000000001391',
  p_mode => 'full_refresh',
  p_lower_bound => null,
  p_snapshot_at => (second.payload->>'snapshotAt')::timestamptz,
  p_entity => 'categories',
  p_after_updated_at => (second.payload->'rows'->239->>'updated_at')::timestamptz,
  p_after_id => (second.payload->'rows'->239->>'id')::uuid,
  p_limit => 1000,
  p_expected_revision => second.payload->>'revision',
  p_expected_scope_kind => second.payload->>'scopeKind',
  p_expected_scope_key => second.payload->>'scopeKey',
  p_include_manifest => false
)
from task139_page_two second;

create temporary table task139_page_four (payload jsonb) on commit drop;
insert into task139_page_four (payload)
select public.pos_catalog_pull_page_v2(
  p_shop_id => '10000000-0000-4000-8000-000000001391',
  p_mode => 'full_refresh',
  p_lower_bound => null,
  p_snapshot_at => (third.payload->>'snapshotAt')::timestamptz,
  p_entity => 'categories',
  p_after_updated_at => (third.payload->'rows'->239->>'updated_at')::timestamptz,
  p_after_id => (third.payload->'rows'->239->>'id')::uuid,
  p_limit => 1000,
  p_expected_revision => third.payload->>'revision',
  p_expected_scope_kind => third.payload->>'scopeKind',
  p_expected_scope_key => third.payload->>'scopeKey',
  p_include_manifest => false
)
from task139_page_three third;

create temporary table task139_page_five (payload jsonb) on commit drop;
insert into task139_page_five (payload)
select public.pos_catalog_pull_page_v2(
  p_shop_id => '10000000-0000-4000-8000-000000001391',
  p_mode => 'full_refresh',
  p_lower_bound => null,
  p_snapshot_at => (fourth.payload->>'snapshotAt')::timestamptz,
  p_entity => 'categories',
  p_after_updated_at => (fourth.payload->'rows'->239->>'updated_at')::timestamptz,
  p_after_id => (fourth.payload->'rows'->239->>'id')::uuid,
  p_limit => 1000,
  p_expected_revision => fourth.payload->>'revision',
  p_expected_scope_kind => fourth.payload->>'scopeKind',
  p_expected_scope_key => fourth.payload->>'scopeKey',
  p_include_manifest => false
)
from task139_page_four fourth;

select ok(
  (
    select jsonb_array_length(payload->'rows') = 41
      and (payload->>'entityHasMore')::boolean = false
    from task139_page_five
  ),
  'the 1001-category fixture drains in five bounded pages with a 41-row terminal page'
);

update public.inventory_categories
set name = name || ' changed'
where shop_id = '10000000-0000-4000-8000-000000001391';

select is(
  (
    select revision
    from app_private.pos_catalog_revisions
    where shop_id = '10000000-0000-4000-8000-000000001391'
  ),
  2::bigint,
  'one 1001-row update statement advances the revision exactly once'
);
select is(
  (
    select public.pos_catalog_pull_page_v2(
      p_shop_id => '10000000-0000-4000-8000-000000001391',
      p_mode => 'full_refresh',
      p_lower_bound => null,
      p_snapshot_at => (first.payload->>'snapshotAt')::timestamptz,
      p_entity => 'categories',
      p_after_updated_at => (first.payload->'rows'->239->>'updated_at')::timestamptz,
      p_after_id => (first.payload->'rows'->239->>'id')::uuid,
      p_limit => 1000,
      p_expected_revision => first.payload->>'revision',
      p_expected_scope_kind => first.payload->>'scopeKind',
      p_expected_scope_key => first.payload->>'scopeKey',
      p_include_manifest => false
    )->>'status'
    from task139_page_one first
  ),
  'snapshot_changed',
  'mutation between pages rejects the pinned continuation'
);
select ok(
  (
    select not (
      public.pos_catalog_pull_page_v2(
        p_shop_id => '10000000-0000-4000-8000-000000001391',
        p_mode => 'full_refresh',
        p_lower_bound => null,
        p_snapshot_at => (first.payload->>'snapshotAt')::timestamptz,
        p_entity => 'categories',
        p_after_updated_at => (first.payload->'rows'->239->>'updated_at')::timestamptz,
        p_after_id => (first.payload->'rows'->239->>'id')::uuid,
        p_limit => 1000,
        p_expected_revision => first.payload->>'revision',
        p_expected_scope_kind => first.payload->>'scopeKind',
        p_expected_scope_key => first.payload->>'scopeKey',
        p_include_manifest => false
      ) ? 'rows'
    )
    from task139_page_one first
  ),
  'snapshot rejection leaks no partial rows'
);

insert into public.shop_inventory_sources (
  shop_inventory_source_id, shop_id, owner_user_id, mapping_state, verified_at
)
values (
  '40000000-0000-4000-8000-000000001393',
  '10000000-0000-4000-8000-000000001393',
  '00000000-0000-4000-8000-000000001393',
  'mapped',
  now()
);
insert into public.inventory_categories (
  id, owner_user_id, shop_id, name, updated_at
)
values (
  '13900000-0000-4000-8000-000000009393',
  '00000000-0000-4000-8000-000000001393',
  null,
  'TASK-139 legacy category',
  now() - interval '1 minute'
);
insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, updated_at
)
values (
  '23900000-0000-4000-8000-000000001392',
  '00000000-0000-4000-8000-000000001392',
  '10000000-0000-4000-8000-000000001392',
  'TASK139-OTHER-SHOP',
  'TASK-139 other-shop product',
  now() - interval '1 minute'
);
select throws_ok(
  $$
    insert into public.inventory_product_prices (
      id, owner_user_id, shop_id, product_id, type, price, effective_at,
      source, created_at
    ) values (
      '24900000-0000-4000-8000-000000001393',
      '00000000-0000-4000-8000-000000001393',
      '10000000-0000-4000-8000-000000001393',
      '23900000-0000-4000-8000-000000001392',
      'RETAIL',
      139,
      '2026-07-19 17:06:00',
      'TASK-139 cross-scope probe',
      '2026-07-19 17:06:00'
    )
  $$,
  '23503',
  'price product is outside the authorized catalog scope',
  'new cross-scope price rows are rejected before they can enter the catalog'
);
-- Simulate one historical malformed row without weakening the production guard.
set local session_replication_role = replica;
insert into public.inventory_product_prices (
  id, owner_user_id, shop_id, product_id, type, price, effective_at,
  source, created_at
)
values (
  '24900000-0000-4000-8000-000000001393',
  '00000000-0000-4000-8000-000000001393',
  '10000000-0000-4000-8000-000000001393',
  '23900000-0000-4000-8000-000000001392',
  'RETAIL',
  139,
  '2026-07-19 17:06:00',
  'TASK-139 cross-scope probe',
  '2026-07-19 17:06:00'
);
set local session_replication_role = origin;

select is(
  (
    public.pos_catalog_pull_page_v2(
      p_shop_id => '10000000-0000-4000-8000-000000001393',
      p_mode => 'full_refresh',
      p_lower_bound => null,
      p_snapshot_at => null,
      p_entity => null,
      p_after_updated_at => null,
      p_after_id => null,
      p_limit => 1000,
      p_expected_revision => null,
      p_expected_scope_kind => null,
      p_expected_scope_key => null,
      p_include_manifest => true
    )->>'status'
  ),
  'integrity_blocked',
  'a historical cross-scope price blocks the full snapshot fail-closed'
);
select ok(
  (
    select not (
      public.pos_catalog_pull_page_v2(
      p_shop_id => '10000000-0000-4000-8000-000000001393',
      p_mode => 'full_refresh',
      p_lower_bound => null,
      p_snapshot_at => null,
      p_entity => null,
      p_after_updated_at => null,
      p_after_id => null,
      p_limit => 1000,
      p_expected_revision => null,
      p_expected_scope_kind => null,
      p_expected_scope_key => null,
      p_include_manifest => true
      ) ?| array['rows', 'manifest']
    )
  ),
  'integrity-blocked snapshots expose neither rows nor a partial manifest'
);
select ok(
  (
    select updated_at is not null
    from public.inventory_product_prices
    where id = '24900000-0000-4000-8000-000000001393'
  ),
  'new legacy-text price rows receive a non-null timestamp key'
);

select is(
  (
    select revision
    from app_private.pos_catalog_revisions
    where shop_id = '10000000-0000-4000-8000-000000001393'
  ),
  2::bigint,
  'mapping and legacy catalog statements advance revision while historical corruption is inert'
);
select throws_ok(
  $$
    update public.shop_inventory_sources
    set verified_at = verified_at + interval '1 second'
    where shop_id = '10000000-0000-4000-8000-000000001393'
  $$,
  '23503',
  'catalog mapping exposes invalid cross-scope relations',
  'mapping mutation refuses to publish historical cross-scope corruption'
);
select is(
  (
    select revision
    from app_private.pos_catalog_revisions
    where shop_id = '10000000-0000-4000-8000-000000001393'
  ),
  2::bigint,
  'blocked mapping mutation leaves the revision unchanged'
);

insert into public.shop_inventory_sources (
  shop_inventory_source_id, shop_id, owner_user_id, mapping_state, verified_at
)
values (
  '40000000-0000-4000-8000-000000001394',
  '10000000-0000-4000-8000-000000001394',
  '00000000-0000-4000-8000-000000001394',
  'mapped',
  now()
);
insert into public.inventory_categories (
  id, owner_user_id, shop_id, name, updated_at
)
values (
  '13900000-0000-4000-8000-000000009394',
  '00000000-0000-4000-8000-000000001394',
  '10000000-0000-4000-8000-000000001394',
  'TASK-139 purge category',
  now()
);

select lives_ok(
  $$delete from public.shops where shop_id = '10000000-0000-4000-8000-000000001394'$$,
  'shop purge survives cascading catalog and mapping revision triggers'
);
select is(
  (
    select count(*)::integer
    from public.shops
    where shop_id = '10000000-0000-4000-8000-000000001394'
  ),
  0,
  'purge fixture shop is deleted'
);
select is(
  (
    select count(*)::integer
    from app_private.pos_catalog_revisions
    where shop_id = '10000000-0000-4000-8000-000000001394'
  ),
  1,
  'purged shop keeps one monotonic revision tombstone'
);

select * from finish();
rollback;
