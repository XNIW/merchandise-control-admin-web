begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_table(
  'public', 'storefront_image_publication_variants',
  'TASK-009 installs the immutable public image variant ledger'
);
select has_function(
  'public', 'admin_storefront_image_intent_v1',
  array['uuid','uuid','uuid','jsonb','uuid','uuid','text','integer'],
  'TASK-009 installs the image intent boundary'
);
select has_function(
  'public', 'admin_storefront_image_finalize_v1',
  array['uuid','uuid','jsonb','uuid','uuid','text','integer'],
  'TASK-009 installs the transactional verified finalize boundary'
);
select has_function(
  'public', 'admin_storefront_image_rollback_v1',
  array['uuid','uuid','uuid','uuid','text','integer'],
  'TASK-009 installs the rollback boundary'
);
select ok(
  (
    select bucket.public and bucket.file_size_limit = 921600
      and bucket.allowed_mime_types = array['image/webp']::text[]
    from storage.buckets bucket
    where bucket.id = 'storefront-product-images'
  ),
  'public derivatives use a separate public WebP-only bounded bucket'
);
select ok(
  has_table_privilege('service_role', 'public.storefront_image_publication_variants', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.storefront_image_publication_variants', 'SELECT')
  and not has_table_privilege('anon', 'public.storefront_image_publication_variants', 'SELECT'),
  'variant ledger remains service-only and default-deny to mobile roles'
);
select ok(
  has_function_privilege('authenticated',
    'public.admin_storefront_image_finalize_v1(uuid,uuid,jsonb,uuid,uuid,text,integer)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.admin_storefront_image_finalize_v1(uuid,uuid,jsonb,uuid,uuid,text,integer)', 'EXECUTE')
  and has_function_privilege('service_role',
    'public.storefront_image_cleanup_claim_v1(integer)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.storefront_image_cleanup_claim_v1(integer)', 'EXECUTE'),
  'Admin RPCs and service-only cleanup expose only their intended roles'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-4000-8000-000000020090', 'authenticated', 'authenticated',
   'storefront-image-owner@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-4000-8000-000000020091', 'authenticated', 'authenticated',
   'storefront-image-outsider@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles(profile_id, display_name, profile_status) values
  ('00000000-0000-4000-8000-000000020090', 'Image owner', 'active'),
  ('00000000-0000-4000-8000-000000020091', 'Image outsider', 'active')
on conflict (profile_id) do update
set display_name=excluded.display_name, profile_status=excluded.profile_status;
insert into public.shops(shop_id, shop_code, shop_name, shop_status) values
  ('10000000-0000-4000-8000-000000020090', 'SFIMAGE90', 'Image Shop', 'active');
insert into public.shop_members(profile_id, shop_id, role_key, membership_status) values
  ('00000000-0000-4000-8000-000000020090',
   '10000000-0000-4000-8000-000000020090', 'shop_owner', 'active');
insert into public.inventory_categories(id, owner_user_id, shop_id, name, updated_at) values
  ('30000000-0000-4000-8000-000000020090',
   '00000000-0000-4000-8000-000000020090',
   '10000000-0000-4000-8000-000000020090', 'Image category', now());
insert into public.inventory_products(
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  purchase_price, retail_price, stock_quantity, updated_at
) values (
  '20000000-0000-4000-8000-000000020090',
  '00000000-0000-4000-8000-000000020090',
  '10000000-0000-4000-8000-000000020090', 'SFIMAGE-90',
  'Private source name', '30000000-0000-4000-8000-000000020090',
  500, 1200, 5, now()
);
insert into public.inventory_product_image_versions(
  id, shop_id, product_id, status, main_path, thumb_path,
  expected_main_sha256, expected_main_bytes, expected_main_width, expected_main_height,
  expected_thumb_sha256, expected_thumb_bytes, expected_thumb_width, expected_thumb_height,
  verified_main_sha256, verified_main_bytes, verified_main_width, verified_main_height,
  verified_main_mime_type, verified_thumb_sha256, verified_thumb_bytes,
  verified_thumb_width, verified_thumb_height, verified_thumb_mime_type,
  requested_by_profile_id, finalized_by_profile_id, actor_kind, finalized_at
) values (
  '60000000-0000-4000-8000-000000020090',
  '10000000-0000-4000-8000-000000020090',
  '20000000-0000-4000-8000-000000020090', 'ready',
  'shops/10000000-0000-4000-8000-000000020090/products/20000000-0000-4000-8000-000000020090/primary/60000000-0000-4000-8000-000000020090/main.jpg',
  'shops/10000000-0000-4000-8000-000000020090/products/20000000-0000-4000-8000-000000020090/primary/60000000-0000-4000-8000-000000020090/thumb.jpg',
  repeat('d',64), 5000, 800, 800, repeat('e',64), 1000, 200, 200,
  repeat('d',64), 5000, 800, 800, 'image/jpeg', repeat('e',64), 1000, 200, 200,
  'image/jpeg', '00000000-0000-4000-8000-000000020090',
  '00000000-0000-4000-8000-000000020090', 'personal_account', now()
);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.inventory_products
set primary_image_version_id = '60000000-0000-4000-8000-000000020090',
    primary_image_updated_at = now()
where id = '20000000-0000-4000-8000-000000020090';

insert into public.storefront_settings(
  shop_id, public_slug, storefront_enabled, pickup_enabled, require_product_image
) values ('10000000-0000-4000-8000-000000020090', 'storefront-image-fixture', true, true, false);
insert into public.storefront_categories(
  id, shop_id, source_category_id, slug, public_name, publication_status, sort_rank
) values (
  '40000000-0000-4000-8000-000000020090',
  '10000000-0000-4000-8000-000000020090',
  '30000000-0000-4000-8000-000000020090', 'image-category', 'Image category', 'published', 1
);
insert into public.storefront_product_publications(
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, price_source_mode, pickup_enabled,
  availability_mode
) values (
  '50000000-0000-4000-8000-000000020090',
  '10000000-0000-4000-8000-000000020090',
  '20000000-0000-4000-8000-000000020090', 'draft', 'Public image product',
  '40000000-0000-4000-8000-000000020090', 1200, 'override', true, 'available'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.storefront_image_configure_origin_v1('https://local.supabase.invalid')->>'code',
  'success', 'only the service boundary configures the canonical public asset origin'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000020091","role":"authenticated"}', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.admin_storefront_images_read_v1('10000000-0000-4000-8000-000000020090')->>'code',
  'permission_denied', 'cross-tenant account cannot enumerate image candidates'
);
select is(
  public.admin_storefront_image_intent_v1(
    '10000000-0000-4000-8000-000000020090',
    '50000000-0000-4000-8000-000000020090',
    '60000000-0000-4000-8000-000000020090', '[]'::jsonb
  )->>'code',
  'validation_failed', 'malformed image intent fails closed before mutation'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000020090","role":"authenticated"}', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  jsonb_array_length(public.admin_storefront_images_read_v1(
    '10000000-0000-4000-8000-000000020090')->'candidates'),
  1, 'authorized owner sees one ready primary source without a private path'
);
select ok(
  not (public.admin_storefront_images_read_v1(
    '10000000-0000-4000-8000-000000020090')->'candidates'->0) ?| array['path','mainPath','thumbPath'],
  'Admin read model never exposes the private operational bucket path'
);
select is(
  public.admin_storefront_image_source_read_v1(
    '10000000-0000-4000-8000-000000020090',
    '50000000-0000-4000-8000-000000020090',
    '60000000-0000-4000-8000-000000020090'
  )->>'code', 'success', 'authorized server route can resolve the ready private source'
);

create temporary table task009_state(key text primary key, value uuid) on commit drop;
grant select on task009_state to service_role;
with response as (
  select public.admin_storefront_image_intent_v1(
    '10000000-0000-4000-8000-000000020090',
    '50000000-0000-4000-8000-000000020090',
    '60000000-0000-4000-8000-000000020090',
    jsonb_build_array(
      jsonb_build_object('variant','thumb','bytes',1000,'width',200,'height',200,'sha256',repeat('a',64),'mimeType','image/webp'),
      jsonb_build_object('variant','card','bytes',2000,'width',600,'height',600,'sha256',repeat('b',64),'mimeType','image/webp'),
      jsonb_build_object('variant','detail','bytes',3000,'width',1200,'height',1200,'sha256',repeat('c',64),'mimeType','image/webp')
    )
  ) result
) insert into task009_state values ('first', (select (result->>'targetId')::uuid from response));

set local role postgres;
select is((select count(*)::integer from public.storefront_image_publication_variants
  where image_publication_id = (select value from task009_state where key='first')),
  3, 'intent creates exactly thumb/card/detail ledger rows');
select ok((select bool_and(object_path !~ '\.\.' and object_path ~ '^shops/.+/public/.+\.webp$')
  from public.storefront_image_publication_variants
  where image_publication_id = (select value from task009_state where key='first')),
  'all variant paths are canonical and traversal-safe');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000020090","role":"authenticated"}', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.admin_storefront_image_intent_v1(
    '10000000-0000-4000-8000-000000020090',
    '50000000-0000-4000-8000-000000020090',
    '60000000-0000-4000-8000-000000020090',
    jsonb_build_array(
      jsonb_build_object('variant','thumb','bytes',1000,'width',200,'height',200,'sha256',repeat('a',64),'mimeType','image/webp'),
      jsonb_build_object('variant','card','bytes',2000,'width',600,'height',600,'sha256',repeat('b',64),'mimeType','image/webp'),
      jsonb_build_object('variant','detail','bytes',3000,'width',1200,'height',1200,'sha256',repeat('c',64),'mimeType','image/webp')
    )
  )->>'status', 'upload_required', 'identical intent is idempotent and reuses the same immutable paths'
);
select is(
  public.admin_storefront_image_intent_v1(
    '10000000-0000-4000-8000-000000020090',
    '50000000-0000-4000-8000-000000020090',
    '60000000-0000-4000-8000-000000020090',
    jsonb_build_array(
      jsonb_build_object('variant','thumb','bytes',1001,'width',200,'height',200,'sha256',repeat('f',64),'mimeType','image/webp'),
      jsonb_build_object('variant','card','bytes',2000,'width',600,'height',600,'sha256',repeat('b',64),'mimeType','image/webp'),
      jsonb_build_object('variant','detail','bytes',3000,'width',1200,'height',1200,'sha256',repeat('c',64),'mimeType','image/webp')
    )
  )->>'code', 'stale_conflict', 'same source version cannot be mutated into different public bytes'
);
select is(
  public.admin_storefront_image_finalize_v1(
    '10000000-0000-4000-8000-000000020090',
    (select value from task009_state where key='first'),
    jsonb_build_array(
      jsonb_build_object('variant','thumb','bytes',999,'width',200,'height',200,'sha256',repeat('a',64)),
      jsonb_build_object('variant','card','bytes',2000,'width',600,'height',600,'sha256',repeat('b',64)),
      jsonb_build_object('variant','detail','bytes',3000,'width',1200,'height',1200,'sha256',repeat('c',64))
    )
  )->>'code', 'verified_metadata_mismatch', 'finalize rejects any unverified byte mismatch'
);
select is(
  public.admin_storefront_image_finalize_v1(
    '10000000-0000-4000-8000-000000020090',
    (select value from task009_state where key='first'),
    jsonb_build_array(
      jsonb_build_object('variant','thumb','bytes',1000,'width',200,'height',200,'sha256',repeat('a',64),'publicUrl','https://attacker.invalid/x'),
      jsonb_build_object('variant','card','bytes',2000,'width',600,'height',600,'sha256',repeat('b',64),'publicUrl','https://attacker.invalid/x'),
      jsonb_build_object('variant','detail','bytes',3000,'width',1200,'height',1200,'sha256',repeat('c',64),'publicUrl','https://attacker.invalid/x')
    )
  )->>'code', 'success', 'verified variants finalize atomically'
);
set local role postgres;
select ok((select bool_and(public_url like 'https://local.supabase.invalid/storage/v1/object/public/storefront-product-images/%')
  from public.storefront_image_publication_variants
  where image_publication_id = (select value from task009_state where key='first')),
  'database ignores caller URLs and builds every public URL from service-only origin plus canonical path');
select is((select published_image_version_id from public.storefront_product_publications
  where id='50000000-0000-4000-8000-000000020090'),
  (select value from task009_state where key='first'),
  'finalize atomically links the verified image to the publication');
select is((select publication_status from public.storefront_image_publications
  where id=(select value from task009_state where key='first')),
  'published', 'new image becomes the current published version');
select is((select count(*)::integer from public.audit_logs
  where event_key='shop.storefront.image.publish.success'
    and target_id=(select value::text from task009_state where key='first')),
  1, 'publish writes one sanitized audit event');

set local role postgres;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
update public.inventory_product_image_versions
set status='superseded', superseded_at=now()
where id='60000000-0000-4000-8000-000000020090';
insert into public.inventory_product_image_versions(
  id, shop_id, product_id, previous_version_id, status, main_path, thumb_path,
  expected_main_sha256, expected_main_bytes, expected_main_width, expected_main_height,
  expected_thumb_sha256, expected_thumb_bytes, expected_thumb_width, expected_thumb_height,
  verified_main_sha256, verified_main_bytes, verified_main_width, verified_main_height,
  verified_main_mime_type, verified_thumb_sha256, verified_thumb_bytes,
  verified_thumb_width, verified_thumb_height, verified_thumb_mime_type,
  requested_by_profile_id, finalized_by_profile_id, actor_kind, finalized_at
) values (
  '60000000-0000-4000-8000-000000020091',
  '10000000-0000-4000-8000-000000020090',
  '20000000-0000-4000-8000-000000020090',
  '60000000-0000-4000-8000-000000020090', 'ready',
  'shops/10000000-0000-4000-8000-000000020090/products/20000000-0000-4000-8000-000000020090/primary/60000000-0000-4000-8000-000000020091/main.jpg',
  'shops/10000000-0000-4000-8000-000000020090/products/20000000-0000-4000-8000-000000020090/primary/60000000-0000-4000-8000-000000020091/thumb.jpg',
  repeat('1',64), 5000, 800, 800, repeat('2',64), 1000, 200, 200,
  repeat('1',64), 5000, 800, 800, 'image/jpeg', repeat('2',64), 1000, 200, 200,
  'image/jpeg', '00000000-0000-4000-8000-000000020090',
  '00000000-0000-4000-8000-000000020090', 'personal_account', now()
);
update public.inventory_products
set primary_image_version_id='60000000-0000-4000-8000-000000020091', primary_image_updated_at=now()
where id='20000000-0000-4000-8000-000000020090';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000020090","role":"authenticated"}', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
with response as (
  select public.admin_storefront_image_intent_v1(
    '10000000-0000-4000-8000-000000020090',
    '50000000-0000-4000-8000-000000020090',
    '60000000-0000-4000-8000-000000020091',
    jsonb_build_array(
      jsonb_build_object('variant','thumb','bytes',1100,'width',200,'height',200,'sha256',repeat('3',64),'mimeType','image/webp'),
      jsonb_build_object('variant','card','bytes',2100,'width',600,'height',600,'sha256',repeat('4',64),'mimeType','image/webp'),
      jsonb_build_object('variant','detail','bytes',3100,'width',1200,'height',1200,'sha256',repeat('5',64),'mimeType','image/webp')
    )
  ) result
) insert into task009_state values ('second', (select (result->>'targetId')::uuid from response));
select is(
  public.admin_storefront_image_finalize_v1(
    '10000000-0000-4000-8000-000000020090',
    (select value from task009_state where key='second'),
    jsonb_build_array(
      jsonb_build_object('variant','thumb','bytes',1100,'width',200,'height',200,'sha256',repeat('3',64)),
      jsonb_build_object('variant','card','bytes',2100,'width',600,'height',600,'sha256',repeat('4',64)),
      jsonb_build_object('variant','detail','bytes',3100,'width',1200,'height',1200,'sha256',repeat('5',64))
    )
  )->>'code', 'success', 'replacement source finalizes successfully'
);
set local role postgres;
select is((select publication_status from public.storefront_image_publications
  where id=(select value from task009_state where key='first')),
  'superseded', 'replacement supersedes but retains the prior public version');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000020090","role":"authenticated"}', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.admin_storefront_image_rollback_v1(
    '10000000-0000-4000-8000-000000020090',
    (select value from task009_state where key='first')
  )->>'status', 'rolled_back', 'rollback republishes the retained, previously approved artifact'
);
set local role postgres;
select is((select published_image_version_id from public.storefront_product_publications
  where id='50000000-0000-4000-8000-000000020090'),
  (select value from task009_state where key='first'),
  'rollback atomically restores the publication reference');
select is((select count(*)::integer from public.audit_logs
  where event_key='shop.storefront.image.rollback.success'),
  1, 'rollback records a distinct sanitized audit event');

set local role anon;
select throws_ok(
  $$ select count(*) from public.storefront_image_publication_variants $$,
  '42501', null, 'anonymous customers cannot enumerate variant metadata'
);

set local role postgres;
update public.storefront_image_publication_variants
set cleanup_after=now()-interval '1 second'
where image_publication_id=(select value from task009_state where key='second');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  jsonb_array_length(public.storefront_image_cleanup_claim_v1(10)->'items'),
  3, 'service cleanup claims all expired superseded variants as one bounded batch'
);
select is(
  jsonb_array_length(public.storefront_image_cleanup_claim_v1(10)->'items'),
  0, 'active cleanup leases prevent duplicate concurrent claims'
);
select is((select count(*)::integer from public.storefront_image_publication_variants
  where image_publication_id=(select value from task009_state where key='first')
    and publication_status='ready'),
  3, 'cleanup never claims the image currently referenced by the catalog');

set local role postgres;
select * from finish();
rollback;
