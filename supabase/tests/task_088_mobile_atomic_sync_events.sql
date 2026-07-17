begin;

-- Supabase CLI linked tests connect as cli_login_postgres. The temporary
-- login is a member of postgres but does not inherit USAGE on extensions.
-- SET LOCAL keeps the test portable and is reverted by the final ROLLBACK.
set local role postgres;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(30);

select has_function(
  'public',
  'mobile_sync_auto_event_capabilities',
  array[]::text[],
  'TASK-088 capability RPC exists'
);

select has_function(
  'app_private',
  'emit_mobile_row_sync_event',
  array[]::text[],
  'TASK-088 atomic trigger function exists'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000088',
  'authenticated',
  'authenticated',
  'task088-atomic@example.invalid',
  '{}'::jsonb,
  '{"display_name":"TASK-088 atomic"}'::jsonb,
  now(),
  now()
);

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '10000000-0000-4000-8000-000000000088',
  'TASK088A',
  'TASK-088 atomic shop',
  'active'
);

insert into public.shop_members (
  profile_id,
  shop_id,
  role_key,
  membership_status
)
values (
  '00000000-0000-4000-8000-000000000088',
  '10000000-0000-4000-8000-000000000088',
  'shop_owner',
  'active'
);

insert into public.shop_inventory_sources (
  shop_inventory_source_id,
  shop_id,
  owner_user_id,
  mapping_state,
  verified_at
)
values (
  '40000000-0000-4000-8000-000000000088',
  '10000000-0000-4000-8000-000000000088',
  '00000000-0000-4000-8000-000000000088',
  'mapped',
  now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000088","role":"authenticated"}',
  true
);

select set_config('request.headers', '{"x-client-info":"supabase-js/2.0"}', true);
select is(
  (public.mobile_sync_auto_event_capabilities()->>'databaseMutationEmitsSyncEvent')::boolean,
  false,
  'Admin/supabase-js does not activate mobile atomic events'
);

select set_config(
  'request.headers',
  '{"x-client-info":"supabase-kt/3.6.0","x-merchandise-control-sync":"atomic-v1"}',
  true
);
select is(
  (public.mobile_sync_auto_event_capabilities()->>'databaseMutationEmitsSyncEvent')::boolean,
  true,
  'supabase-kt negotiates mobile atomic events'
);

select lives_ok(
  $$
    insert into public.inventory_suppliers (
      id, owner_user_id, shop_id, name
    ) values (
      '21000000-0000-4000-8000-000000000088',
      '00000000-0000-4000-8000-000000000088',
      '10000000-0000-4000-8000-000000000088',
      'TASK-088 supplier'
    )
  $$,
  'mobile supplier mutation commits with its event'
);

select is(
  (
    select count(*)::integer
    from public.sync_events
    where shop_id = '10000000-0000-4000-8000-000000000088'
      and source = 'android'
      and entity_ids @> '{"supplier_ids":["21000000-0000-4000-8000-000000000088"]}'::jsonb
  ),
  1,
  'supplier mutation emits exactly one Android catalog event'
);

select lives_ok(
  $$
    insert into public.inventory_suppliers (
      id, owner_user_id, shop_id, name
    ) values (
      '21000000-0000-4000-8000-000000000088',
      '00000000-0000-4000-8000-000000000088',
      '10000000-0000-4000-8000-000000000088',
      'TASK-088 supplier'
    )
    on conflict (id) do update
      set name = excluded.name,
          updated_at = now()
  $$,
  'identical replay remains successful'
);

select is(
  (
    select count(*)::integer
    from public.sync_events
    where shop_id = '10000000-0000-4000-8000-000000000088'
      and entity_ids @> '{"supplier_ids":["21000000-0000-4000-8000-000000000088"]}'::jsonb
  ),
  1,
  'identical replay does not duplicate the event'
);

select lives_ok(
  $$
    update public.inventory_suppliers
       set name = 'TASK-088 supplier updated'
     where id = '21000000-0000-4000-8000-000000000088'
  $$,
  'changed replay remains successful'
);

select is(
  (
    select count(*)::integer
    from public.sync_events
    where shop_id = '10000000-0000-4000-8000-000000000088'
      and entity_ids @> '{"supplier_ids":["21000000-0000-4000-8000-000000000088"]}'::jsonb
  ),
  2,
  'changed replay emits a new versioned event'
);

select set_config('request.headers', '{"x-client-info":"supabase-js/2.0"}', true);
select lives_ok(
  $$
    insert into public.inventory_categories (
      id, owner_user_id, shop_id, name
    ) values (
      '22000000-0000-4000-8000-000000000088',
      '00000000-0000-4000-8000-000000000088',
      '10000000-0000-4000-8000-000000000088',
      'TASK-088 JS category'
    )
  $$,
  'Admin/supabase-js mutation remains available'
);

select is(
  (
    select count(*)::integer
    from public.sync_events
    where entity_ids @> '{"category_ids":["22000000-0000-4000-8000-000000000088"]}'::jsonb
  ),
  0,
  'Admin/supabase-js mutation does not duplicate its explicit writer'
);

select set_config('request.headers', '{"x-client-info":"supabase-kt/3.6.0"}', true);
select lives_ok(
  $$
    insert into public.inventory_categories (
      id, owner_user_id, shop_id, name
    ) values (
      '22000000-0000-4000-8000-000000000089',
      '00000000-0000-4000-8000-000000000088',
      '10000000-0000-4000-8000-000000000088',
      'TASK-088 legacy Android category'
    )
  $$,
  'legacy mobile client without opt-in remains available'
);

select is(
  (
    select count(*)::integer
    from public.sync_events
    where entity_ids @> '{"category_ids":["22000000-0000-4000-8000-000000000089"]}'::jsonb
  ),
  0,
  'legacy mobile client without opt-in keeps the client outbox contract'
);

select set_config(
  'request.headers',
  '{"x-client-info":"supabase-swift/2.46.0","x-merchandise-control-sync":"atomic-v1"}',
  true
);
select is(
  (public.mobile_sync_auto_event_capabilities()->>'databaseMutationEmitsSyncEvent')::boolean,
  true,
  'supabase-swift negotiates mobile atomic events'
);

select lives_ok(
  $$
    insert into public.inventory_products (
      id, owner_user_id, shop_id, barcode, product_name
    ) values (
      '23000000-0000-4000-8000-000000000088',
      '00000000-0000-4000-8000-000000000088',
      '10000000-0000-4000-8000-000000000088',
      'TASK088-ATOMIC',
      'TASK-088 atomic product'
    )
  $$,
  'Swift product mutation commits with its event'
);

select is(
  (
    select count(*)::integer
    from public.sync_events
    where source = 'ios'
      and domain = 'catalog'
      and event_type = 'catalog_changed'
      and entity_ids @> '{"product_ids":["23000000-0000-4000-8000-000000000088"]}'::jsonb
  ),
  1,
  'Swift product mutation emits one iOS catalog event'
);

select lives_ok(
  $$
    insert into public.inventory_product_prices (
      id,
      owner_user_id,
      shop_id,
      product_id,
      type,
      price,
      effective_at,
      source,
      note,
      created_at
    ) values (
      '24000000-0000-4000-8000-000000000088',
      '00000000-0000-4000-8000-000000000088',
      '10000000-0000-4000-8000-000000000088',
      '23000000-0000-4000-8000-000000000088',
      'RETAIL',
      100,
      '2026-07-15 22:00:00',
      'TASK-088 atomic',
      'initial immutable price',
      '2026-07-15 22:00:00'
    )
  $$,
  'Swift price mutation commits with its event'
);

select is(
  (
    select count(*)::integer
    from public.sync_events
    where source = 'ios'
      and domain = 'prices'
      and entity_ids @> '{"price_ids":["24000000-0000-4000-8000-000000000088"]}'::jsonb
  ),
  1,
  'Swift price mutation emits one iOS prices event'
);

select lives_ok(
  $$
    insert into public.inventory_product_prices (
      id,
      owner_user_id,
      shop_id,
      product_id,
      type,
      price,
      effective_at,
      source,
      note,
      created_at
    ) values (
      '24000000-0000-4000-8000-000000000088',
      '00000000-0000-4000-8000-000000000088',
      '10000000-0000-4000-8000-000000000088',
      '23000000-0000-4000-8000-000000000088',
      'RETAIL',
      100,
      '2026-07-15 22:00:00',
      'TASK-088 atomic',
      'initial immutable price',
      '2026-07-15 22:00:00'
    )
    on conflict (id) do update set
      owner_user_id = excluded.owner_user_id,
      shop_id = excluded.shop_id,
      product_id = excluded.product_id,
      type = excluded.type,
      price = excluded.price,
      effective_at = excluded.effective_at,
      source = excluded.source,
      note = excluded.note,
      created_at = excluded.created_at
  $$,
  'identical price retry remains successful'
);

select is(
  (
    select count(*)::integer
    from public.sync_events
    where entity_ids @> '{"price_ids":["24000000-0000-4000-8000-000000000088"]}'::jsonb
  ),
  1,
  'identical price retry does not duplicate its event'
);

select throws_ok(
  $$
    update public.inventory_product_prices
       set price = 101
     where id = '24000000-0000-4000-8000-000000000088'
  $$,
  '23505',
  'price_idempotency_conflict',
  'divergent price retry is rejected as an idempotency conflict'
);

select is(
  (
    select price
    from public.inventory_product_prices
    where id = '24000000-0000-4000-8000-000000000088'
  ),
  100::double precision,
  'divergent price retry cannot overwrite immutable price history'
);

select lives_ok(
  $$
    update public.inventory_suppliers
       set deleted_at = '2026-07-15T22:10:00Z'
     where id = '21000000-0000-4000-8000-000000000088'
  $$,
  'first supplier tombstone remains successful'
);

select lives_ok(
  $$
    update public.inventory_suppliers
       set deleted_at = '2026-07-15T22:11:00Z'
     where id = '21000000-0000-4000-8000-000000000088'
  $$,
  'supplier tombstone retry remains successful'
);

select is(
  (
    select deleted_at
    from public.inventory_suppliers
    where id = '21000000-0000-4000-8000-000000000088'
  ),
  '2026-07-15T22:10:00Z'::timestamptz,
  'supplier tombstone retry preserves the original timestamp'
);

select is(
  (
    select count(*)::integer
    from public.sync_events
    where event_type = 'catalog_tombstone'
      and entity_ids @> '{"supplier_ids":["21000000-0000-4000-8000-000000000088"]}'::jsonb
  ),
  1,
  'supplier tombstone retry emits exactly one tombstone event'
);

select throws_ok(
  $$
    insert into public.shared_sheet_sessions (
      remote_id,
      owner_user_id,
      shop_id,
      payload_version,
      "timestamp",
      display_name,
      data
    ) values (
      'not-a-uuid',
      '00000000-0000-4000-8000-000000000088',
      '10000000-0000-4000-8000-000000000088',
      2,
      '2026-07-15T22:00:00Z',
      'TASK-088 invalid atomic session',
      '[]'::jsonb
    )
  $$,
  '22023',
  'mobile atomic sync entity id must be a uuid',
  'event validation failure rolls back the business mutation'
);

select is(
  (
    select count(*)::integer
    from public.shared_sheet_sessions
    where remote_id = 'not-a-uuid'
  ),
  0,
  'failed event leaves no committed history row'
);

select is(
  (
    select count(*)::integer
    from public.sync_events
    where shop_id = '10000000-0000-4000-8000-000000000088'
      and metadata ?| array['barcode', 'email', 'price', 'product_name', 'token']
  ),
  0,
  'atomic event metadata contains no sensitive business fields'
);

select * from finish();
rollback;
