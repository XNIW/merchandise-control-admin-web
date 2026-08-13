begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_function('public', 'wechat_catalog_mutate_v1', array[
  'uuid', 'uuid', 'text', 'uuid', 'uuid', 'timestamp with time zone',
  'uuid', 'jsonb'
]);
select hasnt_function('public', 'wechat_catalog_mutate_v1', array[
  'uuid', 'text', 'uuid', 'uuid', 'timestamp with time zone', 'uuid', 'jsonb'
]);
select has_function('public', 'wechat_authorized_shops_v2', array[]::text[]);
select has_function('public', 'wechat_catalog_lifecycle_page_v2', array[
  'uuid', 'text', 'text', 'integer', 'timestamp with time zone', 'uuid'
]);
select has_function('public', 'wechat_catalog_history_page_v1', array[
  'uuid', 'integer', 'text', 'text', 'timestamp with time zone',
  'timestamp with time zone', 'uuid', 'timestamp with time zone', 'uuid'
]);

select function_privs_are(
  'public', 'wechat_catalog_mutate_v1',
  array[
    'uuid', 'uuid', 'text', 'uuid', 'uuid', 'timestamp with time zone',
    'uuid', 'jsonb'
  ],
  'service_role', array['EXECUTE']
);
select function_privs_are(
  'public', 'wechat_catalog_mutate_v1',
  array[
    'uuid', 'uuid', 'text', 'uuid', 'uuid', 'timestamp with time zone',
    'uuid', 'jsonb'
  ],
  'authenticated', array[]::text[]
);
select function_privs_are(
  'public', 'wechat_catalog_mutate_v1',
  array[
    'uuid', 'uuid', 'text', 'uuid', 'uuid', 'timestamp with time zone',
    'uuid', 'jsonb'
  ],
  'anon', array[]::text[]
);
select ok(
  not has_table_privilege(
    'authenticated',
    'app_private.wechat_catalog_mutation_receipts',
    'SELECT'
  )
  and not has_table_privilege(
    'service_role',
    'app_private.wechat_catalog_mutation_receipts',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'app_private.wechat_catalog_actor_rate_limits',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'app_private.wechat_catalog_shop_rate_limits',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'app_private.wechat_catalog_denial_audit_rate_limits',
    'SELECT'
  ),
  'receipt and limiter state are private'
);
select ok(
  (
    select proc.prosecdef
      and proc.proconfig @> array[
        'search_path=""',
        'statement_timeout=5s'
      ]
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname = 'wechat_catalog_mutate_v1'
  ),
  'mutation RPC is security-definer with empty search path and five-second timeout'
);
select ok(
  exists (
    select 1 from pg_trigger trigger_row
    join pg_class relation on relation.oid = trigger_row.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'app_private'
      and relation.relname = 'wechat_catalog_mutation_receipts'
      and trigger_row.tgname = 'wechat_catalog_receipts_no_update_delete'
      and (trigger_row.tgtype & 4) = 0
      and (trigger_row.tgtype & 16) = 16
      and (trigger_row.tgtype & 8) = 8
  ),
  'receipt append-only trigger covers UPDATE and DELETE but not INSERT'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.wechat_catalog_mutate_v1(
    '00000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000301', 'category_create',
    gen_random_uuid(), gen_random_uuid(), null, null,
    '{"name":"Direct bearer bypass"}'::jsonb
  )$$,
  '42501', 'wechat_service_role_required',
  'mutation RPC rejects a non-service caller inside the function'
);
select set_config('request.jwt.claim.role', 'service_role', true);

create temporary table wechat003_results (
  result_key text primary key,
  result jsonb not null
) on commit drop;

create temporary table wechat003_state (
  state_key text primary key,
  state_value text
) on commit drop;

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000301',
    'authenticated', 'authenticated', 'wechat003-owner@example.invalid',
    '{}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000302',
    'authenticated', 'authenticated', 'wechat003-manager@example.invalid',
    '{}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000303',
    'authenticated', 'authenticated', 'wechat003-viewer@example.invalid',
    '{}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000304',
    'authenticated', 'authenticated', 'wechat003-platform@example.invalid',
    '{}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000305',
    'authenticated', 'authenticated', 'wechat003-other@example.invalid',
    '{}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000306',
    'authenticated', 'authenticated', 'wechat003-rate@example.invalid',
    '{}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000307',
    'authenticated', 'authenticated', 'wechat003-disabled@example.invalid',
    '{}', '{}', clock_timestamp(), clock_timestamp());

update public.profiles
set display_name = case profile_id
    when '00000000-0000-4000-8000-000000000301' then 'WECHAT-003 owner'
    when '00000000-0000-4000-8000-000000000302' then 'WECHAT-003 manager'
    when '00000000-0000-4000-8000-000000000303' then 'WECHAT-003 viewer'
    when '00000000-0000-4000-8000-000000000304' then 'WECHAT-003 platform'
    when '00000000-0000-4000-8000-000000000305' then 'WECHAT-003 other'
    when '00000000-0000-4000-8000-000000000306' then 'WECHAT-003 rate'
    else 'WECHAT-003 disabled'
  end,
  profile_status = case
    when profile_id = '00000000-0000-4000-8000-000000000307'
      then 'disabled' else 'active' end,
  disabled_at = case
    when profile_id = '00000000-0000-4000-8000-000000000307'
      then clock_timestamp() else null end
where profile_id in (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-000000000303',
  '00000000-0000-4000-8000-000000000304',
  '00000000-0000-4000-8000-000000000305',
  '00000000-0000-4000-8000-000000000306',
  '00000000-0000-4000-8000-000000000307'
);

insert into public.shops (
  shop_id, shop_code, shop_name, shop_status, created_by_profile_id
) values
  ('10000000-0000-4000-8000-000000000301', 'WECHAT003A',
    'WECHAT-003 Shop A', 'active',
    '00000000-0000-4000-8000-000000000301'),
  ('10000000-0000-4000-8000-000000000302', 'WECHAT003B',
    'WECHAT-003 Shop B', 'active',
    '00000000-0000-4000-8000-000000000305'),
  ('10000000-0000-4000-8000-000000000303', 'WECHAT003RATE',
    'WECHAT-003 rate shop', 'active',
    '00000000-0000-4000-8000-000000000306'),
  ('10000000-0000-4000-8000-000000000304', 'WECHAT003OFF',
    'WECHAT-003 suspended shop', 'active',
    '00000000-0000-4000-8000-000000000305');

update public.shops
set shop_status = 'suspended',
    suspended_at = clock_timestamp(),
    suspended_by_profile_id = '00000000-0000-4000-8000-000000000305'
where shop_id = '10000000-0000-4000-8000-000000000304';

insert into public.shop_members (
  profile_id, shop_id, role_key, membership_status
) values
  ('00000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000301', 'shop_owner', 'active'),
  ('00000000-0000-4000-8000-000000000302',
    '10000000-0000-4000-8000-000000000301', 'shop_manager', 'active'),
  ('00000000-0000-4000-8000-000000000303',
    '10000000-0000-4000-8000-000000000301', 'viewer', 'active'),
  ('00000000-0000-4000-8000-000000000305',
    '10000000-0000-4000-8000-000000000302', 'shop_owner', 'active'),
  ('00000000-0000-4000-8000-000000000305',
    '10000000-0000-4000-8000-000000000304', 'shop_owner', 'active'),
  ('00000000-0000-4000-8000-000000000306',
    '10000000-0000-4000-8000-000000000303', 'shop_owner', 'active'),
  ('00000000-0000-4000-8000-000000000307',
    '10000000-0000-4000-8000-000000000301', 'shop_manager', 'active');

insert into public.platform_admins (
  profile_id, status, granted_at, reason_redacted
) values (
  '00000000-0000-4000-8000-000000000304',
  'active', clock_timestamp(), 'WECHAT-003 fixture'
);

insert into public.shop_inventory_sources (
  shop_inventory_source_id, shop_id, owner_user_id, source_kind,
  mapping_state, verified_at
) values
  ('40000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000301',
    'mobile_owner', 'mapped', clock_timestamp()),
  ('40000000-0000-4000-8000-000000000302',
    '10000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000305',
    'mobile_owner', 'mapped', clock_timestamp()),
  ('40000000-0000-4000-8000-000000000303',
    '10000000-0000-4000-8000-000000000303',
    '00000000-0000-4000-8000-000000000306',
    'mobile_owner', 'mapped', clock_timestamp());

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name, updated_at
) values
  ('31000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000301', 'Category old',
    '2026-08-13 10:00:00+00'),
  ('31000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000301', 'Category replacement',
    '2026-08-13 10:00:00+00'),
  ('31000000-0000-4000-8000-000000000303',
    '00000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000301', 'Category atomic old',
    '2026-08-13 10:00:00+00'),
  ('31000000-0000-4000-8000-000000000305',
    '00000000-0000-4000-8000-000000000305',
    '10000000-0000-4000-8000-000000000302', 'Other-shop category',
    '2026-08-13 10:00:00+00');

insert into public.inventory_suppliers (
  id, owner_user_id, shop_id, name, updated_at
) values
  ('32000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000301', 'Supplier old',
    '2026-08-13 10:00:00+00'),
  ('32000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000301', 'Supplier replacement',
    '2026-08-13 10:00:00+00');

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  supplier_id, stock_quantity, updated_at
) values
  ('33000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000301', 'REL-OLD',
    'Relation archive fixture',
    '31000000-0000-4000-8000-000000000301',
    '32000000-0000-4000-8000-000000000301', 1,
    '2026-08-13 10:00:00+00'),
  ('33000000-0000-4000-8000-000000000303',
    '00000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000301', 'REL-ATOMIC',
    'Atomic failure fixture',
    '31000000-0000-4000-8000-000000000303', null, 1,
    '2026-08-13 10:00:00+00');

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
insert into wechat003_results values (
  'anonymous', public.wechat_catalog_mutate_v1(
    null,
    '10000000-0000-4000-8000-000000000301', 'category_create',
    '50000000-0000-4000-8000-000000000301',
    '51000000-0000-4000-8000-000000000301', null, null,
    '{"name":"Anonymous"}'::jsonb
  )
);
select is(
  (select result->>'code' from wechat003_results where result_key = 'anonymous'),
  'unauthenticated',
  'anonymous mutation fails closed with the public taxonomy'
);
select ok(
  (select result ?& array[
    'ok', 'code', 'shop_id', 'target_id', 'updated_at', 'correlation_id',
    'replayed', 'payload'
  ] from wechat003_results where result_key = 'anonymous'),
  'failure response uses the normalized result envelope'
);

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000303', true
);
insert into wechat003_results values (
  'viewer', public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'category_create',
    '50000000-0000-4000-8000-000000000302',
    '51000000-0000-4000-8000-000000000302', null, null,
    '{"name":"Viewer denied"}'::jsonb
  )
);
select is(
  (select result->>'code' from wechat003_results where result_key = 'viewer'),
  'permission_denied', 'viewer cannot mutate catalog'
);
select ok(
  (select result ? 'audit_event_id' from wechat003_results
    where result_key = 'viewer')
  and exists (
    select 1 from public.audit_logs audit
    where audit.audit_log_id = (select (result->>'audit_event_id')::uuid
      from wechat003_results where result_key = 'viewer')
      and audit.actor_profile_id = '00000000-0000-4000-8000-000000000303'
      and audit.shop_id = '10000000-0000-4000-8000-000000000301'
      and audit.event_key = 'shop.wechat.catalog.access.denied'
      and audit.result = 'blocked'
  ),
  'active viewer denial has one bounded shop audit outcome'
);
insert into wechat003_results
select 'viewer_flood_' || series.n,
  public.wechat_catalog_mutate_v1(
    '00000000-0000-4000-8000-000000000303',
    '10000000-0000-4000-8000-000000000301', 'category_create',
    gen_random_uuid(), gen_random_uuid(), null, null,
    jsonb_build_object('name', 'Viewer flood ' || series.n)
  )
from generate_series(1, 65) series(n);
select is(
  (select count(*)::integer from public.audit_logs audit
    where audit.actor_profile_id = '00000000-0000-4000-8000-000000000303'
      and audit.shop_id = '10000000-0000-4000-8000-000000000301'
      and audit.event_key = 'shop.wechat.catalog.access.denied'),
  60, 'denial audit admission caps repeated active-viewer audit growth'
);
select is(
  (select admitted_count
    from app_private.wechat_catalog_denial_audit_rate_limits
    where actor_profile_id = '00000000-0000-4000-8000-000000000303'
      and shop_id = '10000000-0000-4000-8000-000000000301'),
  60, 'denial audit cap is transactionally saturated without overflow'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000304', true
);
select is(
  public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'category_create',
    '50000000-0000-4000-8000-000000000303',
    '51000000-0000-4000-8000-000000000303', null, null,
    '{"name":"Platform denied"}'::jsonb
  )->>'code',
  'membership_missing', 'platform administrator has no Mini write bypass'
);
select is(
  (select count(*)::integer from public.audit_logs audit
    where audit.actor_profile_id = '00000000-0000-4000-8000-000000000304'
      and audit.event_key like 'shop.wechat.catalog.%'),
  0, 'non-member platform administrator cannot inject a shop audit record'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000307', true
);
select is(
  public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'category_create',
    '50000000-0000-4000-8000-000000000304',
    '51000000-0000-4000-8000-000000000304', null, null,
    '{"name":"Disabled denied"}'::jsonb
  )->>'code',
  'profile_suspended', 'disabled personal profile fails closed'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000305', true
);
select is(
  public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000304', 'category_create',
    '50000000-0000-4000-8000-000000000305',
    '51000000-0000-4000-8000-000000000305', null, null,
    '{"name":"Suspended shop denied"}'::jsonb
  )->>'code',
  'shop_suspended', 'suspended shop fails closed'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000301', true
);
select set_config('request.jwt.claim.sub', '', true);
insert into wechat003_results values (
  'service_no_sub', public.wechat_catalog_mutate_v1(
    '00000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000301', 'category_create',
    '50000000-0000-4000-8000-000000000308',
    '51000000-0000-4000-8000-000000000308', null, null,
    '{"name":"Service actor without JWT sub"}'::jsonb
  )
);
select is(
  (select result->>'code' from wechat003_results
    where result_key = 'service_no_sub'),
  'success', 'service-role RPC resolves catalog scope from explicit actor'
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000301', true
);
select is(
  public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000302', 'category_create',
    '50000000-0000-4000-8000-000000000306',
    '51000000-0000-4000-8000-000000000306', null, null,
    '{"name":"Cross shop denied"}'::jsonb
  )->>'code',
  'membership_missing', 'shop A owner cannot mutate shop B'
);

select ok(
  (select can_write_products and can_write_categories
      and can_write_suppliers and can_change_prices
    from public.wechat_authorized_shops_v2()
    where shop_id = '10000000-0000-4000-8000-000000000301'),
  'owner shop projection declares write capabilities explicitly'
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000303', true
);
select ok(
  (select can_read_catalog and not can_write_products
      and not can_write_categories and not can_write_suppliers
      and not can_change_prices
    from public.wechat_authorized_shops_v2()
    where shop_id = '10000000-0000-4000-8000-000000000301'),
  'viewer shop projection is explicitly read-only'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000301', true
);
insert into wechat003_results values (
  'invalid_request', public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'category_create',
    '50000000-0000-4000-8000-000000000309',
    '51000000-0000-4000-8000-000000000309', null, null,
    '{"unexpected":"field"}'::jsonb
  )
);
select ok(
  (select result->>'code' = 'validation_failed'
      and result ? 'audit_event_id'
    from wechat003_results where result_key = 'invalid_request')
  and exists (
    select 1 from public.audit_logs audit
    where audit.audit_log_id = (select (result->>'audit_event_id')::uuid
      from wechat003_results where result_key = 'invalid_request')
      and audit.event_key = 'shop.wechat.catalog.request.rejected'
      and audit.metadata_redacted->>'code' = 'validation_failed'
  ),
  'authorized writer validation denial has a bounded audit outcome'
);
insert into wechat003_state values (
  'category_baseline', coalesce((select max(id) from public.sync_events), 0)::text
);
insert into wechat003_results values (
  'category_create', public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'category_create',
    '50000000-0000-4000-8000-000000000310',
    '51000000-0000-4000-8000-000000000310', null, null,
    '{"name":"  Mini category  "}'::jsonb
  )
);
select is(
  (select result->>'code' from wechat003_results
    where result_key = 'category_create'),
  'success', 'owner creates a category'
);
select is(
  (select name from public.inventory_categories
    where id = (select (result->>'target_id')::uuid
      from wechat003_results where result_key = 'category_create')),
  'Mini category', 'category creation uses the canonical text policy'
);
select is(
  (select count(*)::integer from public.sync_events event
    where event.id > (select state_value::bigint from wechat003_state
      where state_key = 'category_baseline')
      and event.domain = 'catalog'
      and event.entity_ids @> jsonb_build_object(
        'category_ids', jsonb_build_array((select result->>'target_id'
          from wechat003_results where result_key = 'category_create'))
      )),
  1, 'category create publishes exactly one trigger-owned sync event'
);
select is(
  (select count(*)::integer from public.audit_logs audit
    where audit.target_id = (select result->>'target_id'
      from wechat003_results where result_key = 'category_create')
      and audit.event_key in (
        'shop.wechat.catalog.category.created',
        'shop.catalog.category.create.success'
      )),
  1, 'category create has one Mini audit outcome and no legacy duplicate'
);
insert into wechat003_results values (
  'category_client_id', public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'category_create',
    '50000000-0000-4000-8000-000000000390',
    '51000000-0000-4000-8000-000000000390', null,
    '39000000-0000-4000-8000-000000000390',
    '{"name":"Offline stable category"}'::jsonb
  )
);
select is(
  (select result->>'target_id' from wechat003_results
    where result_key = 'category_client_id'),
  '39000000-0000-4000-8000-000000000390',
  'create accepts a stable client-generated entity UUID for durable dependencies'
);
select ok(
  exists (
    select 1 from public.inventory_categories
    where id = '39000000-0000-4000-8000-000000000390'
      and shop_id = '10000000-0000-4000-8000-000000000301'
  ),
  'client-generated create target is bound to the authorized shop row'
);
insert into wechat003_results values (
  'category_replay', public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'category_create',
    '50000000-0000-4000-8000-000000000310',
    '51000000-0000-4000-8000-000000000310', null, null,
    '{"name":"  Mini category  "}'::jsonb
  )
);
select ok(
  (select (result->>'replayed')::boolean
      and result->>'target_id' = (
        select result->>'target_id' from wechat003_results
        where result_key = 'category_create'
      )
    from wechat003_results where result_key = 'category_replay'),
  'same actor/shop/key/hash replays the durable result'
);
select is(
  public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'category_create',
    '50000000-0000-4000-8000-000000000310',
    '51000000-0000-4000-8000-000000000311', null, null,
    '{"name":"  Mini category  "}'::jsonb
  )->>'code',
  'idempotency_conflict',
  'correlation ID participates in the durable request hash'
);
select is(
  public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'category_create',
    '50000000-0000-4000-8000-000000000311',
    '51000000-0000-4000-8000-000000000311', null, null,
    '{"name":"MINI CATEGORY"}'::jsonb
  )->>'code',
  'conflict', 'duplicate category name maps to conflict without SQL details'
);

update public.shop_members
set membership_status = 'suspended', suspended_at = clock_timestamp()
where profile_id = '00000000-0000-4000-8000-000000000301'
  and shop_id = '10000000-0000-4000-8000-000000000301';
select is(
  public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'category_create',
    '50000000-0000-4000-8000-000000000310',
    '51000000-0000-4000-8000-000000000310', null, null,
    '{"name":"  Mini category  "}'::jsonb
  )->>'code',
  'membership_missing', 'replay path is fenced by current membership state'
);
update public.shop_members
set membership_status = 'active', suspended_at = null
where profile_id = '00000000-0000-4000-8000-000000000301'
  and shop_id = '10000000-0000-4000-8000-000000000301';

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000302', true
);
select is(
  public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'supplier_create',
    '50000000-0000-4000-8000-000000000312',
    '51000000-0000-4000-8000-000000000312', null, null,
    '{"name":"Manager supplier"}'::jsonb
  )->>'code',
  'success', 'shop manager has the same bounded mutation contract'
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000301', true
);
select is(
  public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'supplier_create',
    '50000000-0000-4000-8000-000000000313',
    '51000000-0000-4000-8000-000000000313', null, null,
    '{"name":"MANAGER SUPPLIER"}'::jsonb
  )->>'code',
  'conflict', 'duplicate supplier name maps to conflict without SQL details'
);

insert into wechat003_state values (
  'product_create_baseline',
  coalesce((select max(id) from public.sync_events), 0)::text
);
insert into wechat003_results values (
  'product_create', public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'product_create',
    '50000000-0000-4000-8000-000000000320',
    '51000000-0000-4000-8000-000000000320', null, null,
    jsonb_build_object(
      'barcode', '  AbC-Case  ', 'itemNumber', 'MiNi-01',
      'productName', 'Case-sensitive product',
      'purchasePrice', 10.125, 'retailPrice', 19.995,
      'stockQuantity', 4,
      'categoryId', '31000000-0000-4000-8000-000000000301',
      'supplierId', '32000000-0000-4000-8000-000000000301'
    )
  )
);
select is(
  (select result->>'code' from wechat003_results
    where result_key = 'product_create'),
  'success', 'product create succeeds with bounded canonical fields'
);
select is(
  (select barcode from public.inventory_products
    where id = (select (result->>'target_id')::uuid
      from wechat003_results where result_key = 'product_create')),
  'AbC-Case', 'Mini product create trims but preserves barcode case'
);
select is(
  (select count(*)::integer from public.inventory_product_prices
    where product_id = (select (result->>'target_id')::uuid
      from wechat003_results where result_key = 'product_create')
      and source = 'mini_program'),
  2, 'product create appends both non-null initial prices to history'
);
select results_eq(
  $$
    select type, price
    from public.inventory_product_prices
    where product_id = (
      select (result->>'target_id')::uuid from wechat003_results
      where result_key = 'product_create'
    )
    order by type
  $$,
  $$ values
    ('PURCHASE'::text, 10.125::double precision),
    ('RETAIL'::text, 19.995::double precision)
  $$,
  'initial price history exactly matches current canonical prices'
);
select is(
  (select count(*)::integer from public.sync_events event
    where event.id > (select state_value::bigint from wechat003_state
      where state_key = 'product_create_baseline')
      and (
        event.entity_ids @> jsonb_build_object(
          'product_ids', jsonb_build_array((select result->>'target_id'
            from wechat003_results where result_key = 'product_create'))
        )
      )),
  2,
  'product plus initial price history publish one catalog and one prices event'
);
select results_eq(
  $$
    select domain, count(*)::integer
    from public.sync_events event
    where event.id > (
      select state_value::bigint from wechat003_state
      where state_key = 'product_create_baseline'
    )
      and event.entity_ids @> jsonb_build_object(
        'product_ids', jsonb_build_array((
          select result->>'target_id' from wechat003_results
          where result_key = 'product_create'
        ))
      )
    group by domain order by domain
  $$,
  $$ values ('catalog'::text, 1), ('prices'::text, 1) $$,
  'statement triggers remain the sole non-duplicated sync lane'
);

insert into wechat003_results values (
  'product_case_peer', public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'product_create',
    '50000000-0000-4000-8000-000000000321',
    '51000000-0000-4000-8000-000000000321', null, null,
    '{"barcode":"ABC-CASE","productName":"Case peer"}'::jsonb
  )
);
select is(
  (select result->>'code' from wechat003_results
    where result_key = 'product_case_peer'),
  'success', 'case-distinct barcode identity is not collapsed'
);
select is(
  public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'product_create',
    '50000000-0000-4000-8000-000000000322',
    '51000000-0000-4000-8000-000000000322', null, null,
    '{"barcode":"AbC-Case","productName":"Exact duplicate"}'::jsonb
  )->>'code',
  'duplicate_barcode', 'exact active barcode collision has a stable public code'
);

insert into wechat003_state values (
  'product_update_baseline',
  coalesce((select max(id) from public.sync_events), 0)::text
);
insert into wechat003_results values (
  'product_update', public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'product_update',
    '50000000-0000-4000-8000-000000000323',
    '51000000-0000-4000-8000-000000000323',
    (select updated_at from public.inventory_products
      where id = (select (result->>'target_id')::uuid
        from wechat003_results where result_key = 'product_create')),
    (select (result->>'target_id')::uuid from wechat003_results
      where result_key = 'product_create'),
    jsonb_build_object(
      'barcode', '  MiXeD-42  ',
      'categoryId', '31000000-0000-4000-8000-000000000302',
      'supplierId', '32000000-0000-4000-8000-000000000302'
    )
  )
);
select results_eq(
  $$
    select barcode, category_id, supplier_id
    from public.inventory_products
    where id = (
      select (result->>'target_id')::uuid from wechat003_results
      where result_key = 'product_create'
    )
  $$,
  $$ values (
    'MiXeD-42'::text,
    '31000000-0000-4000-8000-000000000302'::uuid,
    '32000000-0000-4000-8000-000000000302'::uuid
  ) $$,
  'product update preserves mixed barcode case and replaces both relations atomically'
);
select is(
  (select count(*)::integer from public.sync_events event
    where event.id > (select state_value::bigint from wechat003_state
      where state_key = 'product_update_baseline')
      and event.domain = 'catalog'
      and event.entity_ids @> jsonb_build_object(
        'product_ids', jsonb_build_array((select result->>'target_id'
          from wechat003_results where result_key = 'product_create'))
      )),
  1, 'product update emits exactly one catalog event'
);
select is(
  (select count(*)::integer from public.audit_logs audit
    where audit.shop_id = '10000000-0000-4000-8000-000000000301'
      and audit.target_id = (select result->>'target_id'
        from wechat003_results where result_key = 'product_create')
      and audit.event_key in (
        'shop.wechat.catalog.product.category_changed',
        'shop.wechat.catalog.product.supplier_changed'
      )),
  2, 'relation changes emit separate safe semantic audit facts'
);
select is(
  public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'product_update',
    '50000000-0000-4000-8000-000000000324',
    '51000000-0000-4000-8000-000000000324',
    (select updated_at - interval '1 second'
      from public.inventory_products where id = (select (result->>'target_id')::uuid
        from wechat003_results where result_key = 'product_create')),
    (select (result->>'target_id')::uuid from wechat003_results
      where result_key = 'product_create'),
    '{"productName":"Stale overwrite"}'::jsonb
  )->>'code',
  'stale_version', 'stale product update is rejected under a row lock'
);
select is(
  public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'product_price_update',
    '50000000-0000-4000-8000-000000000325',
    '51000000-0000-4000-8000-000000000325',
    (select updated_at from public.inventory_products
      where id = (select (result->>'target_id')::uuid
        from wechat003_results where result_key = 'product_create')),
    (select (result->>'target_id')::uuid from wechat003_results
      where result_key = 'product_create'),
    '{"priceType":"RETAIL","price":20.1234}'::jsonb
  )->>'code',
  'invalid_price', 'price scale above three decimals is rejected'
);
select is(
  public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'product_price_update',
    '50000000-0000-4000-8000-000000000395',
    '51000000-0000-4000-8000-000000000395',
    (select updated_at from public.inventory_products
      where id = (select (result->>'target_id')::uuid
        from wechat003_results where result_key = 'product_create')),
    (select (result->>'target_id')::uuid from wechat003_results
      where result_key = 'product_create'),
    '{"priceType":"RETAIL","price":1000000000000}'::jsonb
  )->>'code',
  'invalid_price', 'price mutation rejects the non-canonical one-trillion bound'
);

insert into wechat003_state values (
  'price_update_baseline',
  coalesce((select max(id) from public.sync_events), 0)::text
);
insert into wechat003_results values (
  'price_update', public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'product_price_update',
    '50000000-0000-4000-8000-000000000326',
    '51000000-0000-4000-8000-000000000326',
    (select updated_at from public.inventory_products
      where id = (select (result->>'target_id')::uuid
        from wechat003_results where result_key = 'product_create')),
    (select (result->>'target_id')::uuid from wechat003_results
      where result_key = 'product_create'),
    '{"priceType":"RETAIL","price":20.125}'::jsonb
  )
);
select is(
  (select retail_price from public.inventory_products
    where id = (select (result->>'target_id')::uuid
      from wechat003_results where result_key = 'product_create')),
  20.125::double precision, 'price mutation updates current product price'
);
select is(
  (select count(*)::integer from public.inventory_product_prices
    where product_id = (select (result->>'target_id')::uuid
      from wechat003_results where result_key = 'product_create')
      and type = 'RETAIL' and source = 'mini_program'),
  2, 'price mutation appends exactly one price-history row'
);
select ok(
  (select app_private.sync_legacy_timestamp_is_canonical_v1(effective_at)
      and app_private.sync_legacy_timestamp_is_canonical_v1(created_at)
    from public.inventory_product_prices
    where id = (select (result#>>'{payload,price_history_id}')::uuid
      from wechat003_results where result_key = 'price_update')),
  'Mini price history uses the canonical recovery timestamp format'
);
select is(
  (select count(*)::integer from public.inventory_product_prices price
    where price.product_id = (select (result->>'target_id')::uuid
      from wechat003_results where result_key = 'product_create')
      and (
        not app_private.sync_legacy_timestamp_is_canonical_v1(
          price.effective_at
        )
        or not app_private.sync_legacy_timestamp_is_canonical_v1(
          price.created_at
        )
        or not app_private.sync_price_value_is_canonical_v1(price.price)
      )),
  0, 'Mini price rows pass canonical recovery integrity predicates'
);
select results_eq(
  $$
    select domain, count(*)::integer
    from public.sync_events event
    where event.id > (
      select state_value::bigint from wechat003_state
      where state_key = 'price_update_baseline'
    )
      and event.entity_ids @> jsonb_build_object(
        'product_ids', jsonb_build_array((
          select result->>'target_id' from wechat003_results
          where result_key = 'product_create'
        ))
      )
    group by domain order by domain
  $$,
  $$ values ('catalog'::text, 1), ('prices'::text, 1) $$,
  'price mutation emits one current-product event and one history event'
);

insert into wechat003_state values (
  'price_noop_baseline', coalesce((select max(id) from public.sync_events), 0)::text
);
insert into wechat003_results values (
  'price_noop', public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'product_price_update',
    '50000000-0000-4000-8000-000000000327',
    '51000000-0000-4000-8000-000000000327',
    (select updated_at from public.inventory_products
      where id = (select (result->>'target_id')::uuid
        from wechat003_results where result_key = 'product_create')),
    (select (result->>'target_id')::uuid from wechat003_results
      where result_key = 'product_create'),
    '{"priceType":"RETAIL","price":20.125}'::jsonb
  )
);
select ok(
  not (select (result->'payload'->>'changed')::boolean
    from wechat003_results where result_key = 'price_noop')
  and (select count(*) from public.sync_events event
    where event.id > (select state_value::bigint from wechat003_state
      where state_key = 'price_noop_baseline')) = 0,
  'same-price retry is a semantic no-op with no history or sync event'
);

insert into wechat003_state values (
  'category_archive_baseline',
  coalesce((select max(id) from public.sync_events), 0)::text
);
insert into wechat003_results values (
  'category_archive', public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'category_archive',
    '50000000-0000-4000-8000-000000000330',
    '51000000-0000-4000-8000-000000000330',
    (select updated_at from public.inventory_categories
      where id = '31000000-0000-4000-8000-000000000301'),
    '31000000-0000-4000-8000-000000000301',
    '{"reason":"merge","replacementId":"31000000-0000-4000-8000-000000000302"}'::jsonb
  )
);
select ok(
  (select deleted_at is not null from public.inventory_categories
    where id = '31000000-0000-4000-8000-000000000301')
  and (select category_id = '31000000-0000-4000-8000-000000000302'
    from public.inventory_products
    where id = '33000000-0000-4000-8000-000000000301'),
  'category archive reassigns active products and tombstones atomically'
);
select is(
  (select count(*)::integer from public.sync_events event
    where event.id > (select state_value::bigint from wechat003_state
      where state_key = 'category_archive_baseline')
      and event.domain = 'catalog'),
  2, 'category replacement emits one product event and one tombstone event'
);
select is(
  (select count(*)::integer from public.wechat_catalog_lifecycle_page_v2(
    '10000000-0000-4000-8000-000000000301', 'category', 'archived',
    50, null, null
  ) where entity_id = '31000000-0000-4000-8000-000000000301'),
  1, 'lifecycle projection includes archived categories'
);
select is(
  public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'category_archive',
    '50000000-0000-4000-8000-000000000331',
    '51000000-0000-4000-8000-000000000331',
    (select updated_at from public.inventory_categories
      where id = '31000000-0000-4000-8000-000000000303'),
    '31000000-0000-4000-8000-000000000303',
    '{"replacementId":"31000000-0000-4000-8000-000000000305"}'::jsonb
  )->>'code',
  'invalid_category', 'cross-shop category replacement fails before DML'
);
select ok(
  (select deleted_at is null from public.inventory_categories
    where id = '31000000-0000-4000-8000-000000000303')
  and (select category_id = '31000000-0000-4000-8000-000000000303'
    from public.inventory_products
    where id = '33000000-0000-4000-8000-000000000303'),
  'failed replacement leaves parent and references unchanged'
);
select is(
  public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'category_restore',
    '50000000-0000-4000-8000-000000000332',
    '51000000-0000-4000-8000-000000000332',
    (select updated_at from public.inventory_categories
      where id = '31000000-0000-4000-8000-000000000301'),
    '31000000-0000-4000-8000-000000000301', '{}'
  )->>'code',
  'success', 'category restore uses the archived row revision'
);

select is(
  public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'supplier_archive',
    '50000000-0000-4000-8000-000000000333',
    '51000000-0000-4000-8000-000000000333',
    (select updated_at from public.inventory_suppliers
      where id = '32000000-0000-4000-8000-000000000301'),
    '32000000-0000-4000-8000-000000000301',
    '{"replacementId":"32000000-0000-4000-8000-000000000302"}'::jsonb
  )->>'code',
  'success', 'supplier archive supports atomic replacement'
);
select ok(
  (select deleted_at is not null from public.inventory_suppliers
    where id = '32000000-0000-4000-8000-000000000301')
  and (select supplier_id = '32000000-0000-4000-8000-000000000302'
    from public.inventory_products
    where id = '33000000-0000-4000-8000-000000000301'),
  'supplier replacement updates active products before tombstone'
);
select is(
  public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'supplier_restore',
    '50000000-0000-4000-8000-000000000334',
    '51000000-0000-4000-8000-000000000334',
    (select updated_at from public.inventory_suppliers
      where id = '32000000-0000-4000-8000-000000000301'),
    '32000000-0000-4000-8000-000000000301', '{}'
  )->>'code',
  'success', 'supplier restore uses optimistic concurrency'
);

insert into wechat003_results values (
  'product_archive', public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'product_archive',
    '50000000-0000-4000-8000-000000000335',
    '51000000-0000-4000-8000-000000000335',
    (select updated_at from public.inventory_products
      where id = (select (result->>'target_id')::uuid
        from wechat003_results where result_key = 'product_case_peer')),
    (select (result->>'target_id')::uuid from wechat003_results
      where result_key = 'product_case_peer'),
    '{"reason":"test lifecycle"}'
  )
);
select is(
  (select count(*)::integer from public.wechat_catalog_lifecycle_page_v2(
    '10000000-0000-4000-8000-000000000301', 'product', 'archived',
    50, null, null
  ) where entity_id = (select (result->>'target_id')::uuid
    from wechat003_results where result_key = 'product_case_peer')),
  1, 'archived products remain visible through the lifecycle projection'
);
select is(
  public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000301', 'product_restore',
    '50000000-0000-4000-8000-000000000336',
    '51000000-0000-4000-8000-000000000336',
    (select updated_at from public.inventory_products
      where id = (select (result->>'target_id')::uuid
        from wechat003_results where result_key = 'product_case_peer')),
    (select (result->>'target_id')::uuid from wechat003_results
      where result_key = 'product_case_peer'), '{}'
  )->>'code',
  'success', 'product restore follows the canonical tombstone lane'
);

select ok(
  exists (
    select 1 from public.wechat_catalog_history_page_v1(
      '10000000-0000-4000-8000-000000000301', 100, 'product',
      'price_changed', null, null,
      (select (result->>'target_id')::uuid from wechat003_results
        where result_key = 'product_create'), null, null
    ) history
    where history.surface = 'mini_program'
      and history.correlation_id_redacted = '51000000…'
  ),
  'safe history exposes semantic price change with redacted correlation'
);
select ok(
  not exists (
    select 1 from public.wechat_catalog_history_page_v1(
      '10000000-0000-4000-8000-000000000301', 100, null, null,
      null, null, null, null, null
    ) history
    where to_jsonb(history)::text like '%51000000-0000-4000-8000-000000000326%'
  ),
  'safe history never returns a complete correlation identifier'
);
select throws_ok(
  $$select * from public.wechat_catalog_lifecycle_page_v2(
    '10000000-0000-4000-8000-000000000301', 'product', 'all',
    null, null, null
  )$$,
  '22023', 'catalog_lifecycle_page_invalid',
  'lifecycle projection rejects a NULL page limit'
);
select throws_ok(
  $$select * from public.wechat_catalog_history_page_v1(
    '10000000-0000-4000-8000-000000000301', null, null, null,
    null, null, null, null, null
  )$$,
  '22023', 'catalog_history_page_invalid',
  'history projection rejects a NULL page limit'
);
select ok(
  not exists (
    select 1 from public.audit_logs audit
    where audit.event_key like 'shop.wechat.catalog.%'
      and audit.metadata_redacted ?| array[
        'payload', 'barcode', 'productName', 'name', 'note'
      ]
  )
  and exists (
    select 1 from public.audit_logs audit
    where audit.event_key = 'shop.wechat.catalog.product.price_changed'
      and audit.actor_profile_id = '00000000-0000-4000-8000-000000000301'
      and audit.metadata_redacted->>'source' = 'mini_program'
  ),
  'Mini audit metadata is allowlisted, actor-attributed and free of payload PII'
);

select throws_ok(
  $$
    update app_private.wechat_catalog_mutation_receipts
    set result = result || '{"tampered":true}'::jsonb
    where idempotency_key = '50000000-0000-4000-8000-000000000310'
  $$,
  '55000', 'wechat_catalog_mutation_receipts is append-only',
  'durable mutation receipts cannot be updated'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000306', true
);
insert into wechat003_results
select 'rate_' || series.n,
  public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000303', 'category_create',
    gen_random_uuid(), gen_random_uuid(), null, null,
    jsonb_build_object('name', 'Rate category ' || series.n)
  )
from generate_series(1, 60) series(n);
select is(
  (select count(*)::integer from wechat003_results
    where result_key like 'rate_%' and result->>'code' = 'success'),
  60, 'actor-shop limiter admits the first sixty mutations in five minutes'
);
insert into wechat003_results values (
  'rate_limited', public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000303', 'category_create',
    '50000000-0000-4000-8000-000000000399',
    '51000000-0000-4000-8000-000000000399', null, null,
    '{"name":"Rate category retry"}'
  )
);
select is(
  (select result->>'code' from wechat003_results
    where result_key = 'rate_limited'),
  'rate_limited', 'sixty-first actor-shop mutation is rate limited'
);
select is(
  (select count(*)::integer
    from app_private.wechat_catalog_mutation_receipts
    where actor_profile_id = '00000000-0000-4000-8000-000000000306'
      and idempotency_key = '50000000-0000-4000-8000-000000000399'),
  0, 'rate-limit denial is not durably receipted'
);
update app_private.wechat_catalog_actor_rate_limits
set window_started_at = clock_timestamp() - interval '6 minutes',
    updated_at = clock_timestamp() - interval '6 minutes'
where actor_profile_id = '00000000-0000-4000-8000-000000000306'
  and shop_id = '10000000-0000-4000-8000-000000000303';
select is(
  public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000303', 'category_create',
    '50000000-0000-4000-8000-000000000399',
    '51000000-0000-4000-8000-000000000399', null, null,
    '{"name":"Rate category retry"}'
  )->>'code',
  'success', 'same key can progress after a transient rate-limit denial'
);

update app_private.wechat_catalog_shop_rate_limits
set admitted_count = 600,
    window_started_at = clock_timestamp(),
    updated_at = clock_timestamp()
where shop_id = '10000000-0000-4000-8000-000000000303';
insert into wechat003_results values (
  'shop_rate_limited', public.wechat_catalog_mutate_v1(
    auth.uid(),
    '10000000-0000-4000-8000-000000000303', 'category_create',
    '50000000-0000-4000-8000-000000000398',
    '51000000-0000-4000-8000-000000000398', null, null,
    '{"name":"Shop aggregate denied"}'
  )
);
select is(
  (select result->>'code' from wechat003_results
    where result_key = 'shop_rate_limited'),
  'rate_limited', 'shop aggregate limiter caps writes at six hundred per hour'
);
select is(
  (select count(*)::integer
    from app_private.wechat_catalog_mutation_receipts
    where idempotency_key = '50000000-0000-4000-8000-000000000398'),
  0, 'shop aggregate denial is not durably receipted'
);

select ok(
  not has_table_privilege(
    'authenticated', 'public.inventory_products', 'DELETE'
  )
  and not has_table_privilege(
    'authenticated', 'public.inventory_categories', 'DELETE'
  )
  and not has_table_privilege(
    'authenticated', 'public.inventory_suppliers', 'DELETE'
  ),
  'catalog mutation contract does not reopen hard delete'
);

insert into app_private.wechat_catalog_mutation_receipts (
  shop_id, actor_profile_id, idempotency_key, operation, request_hash,
  correlation_id, target_id, result, created_at
) values (
  '10000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000301',
  '50000000-0000-4000-8000-000000000399',
  'product_update', repeat('a', 64),
  '51000000-0000-4000-8000-000000000399',
  '33000000-0000-4000-8000-000000000301',
  '{"ok":false,"code":"entity_not_found"}'::jsonb,
  statement_timestamp() - interval '31 days'
), (
  '10000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000301',
  '50000000-0000-4000-8000-000000000400',
  'product_update', repeat('b', 64),
  '51000000-0000-4000-8000-000000000400',
  '33000000-0000-4000-8000-000000000301',
  '{"ok":false,"code":"entity_not_found"}'::jsonb,
  statement_timestamp()
);
select is(
  app_private.cleanup_wechat_catalog_receipts_v1(100),
  1, 'private catalog cleanup removes only receipts beyond thirty days'
);
select is(
  (select count(*)::integer
   from app_private.wechat_catalog_mutation_receipts
   where idempotency_key = '50000000-0000-4000-8000-000000000399'
     and actor_profile_id = '00000000-0000-4000-8000-000000000301'
     and shop_id = '10000000-0000-4000-8000-000000000301'),
  0, 'catalog retention cleanup removes the expired receipt'
);
select is(
  (select count(*)::integer
   from app_private.wechat_catalog_mutation_receipts
   where idempotency_key = '50000000-0000-4000-8000-000000000400'
     and actor_profile_id = '00000000-0000-4000-8000-000000000301'
     and shop_id = '10000000-0000-4000-8000-000000000301'),
  1, 'catalog retention cleanup preserves the active retry horizon'
);

select * from finish();
rollback;
