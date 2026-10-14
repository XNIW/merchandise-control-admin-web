begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

-- Isolated synthetic shops; actual personal RPC wrappers and production triggers.
insert into auth.users(instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'authenticated','authenticated','identity-'||n||'@example.invalid','{}','{}',now(),now()
from generate_series(9151,9152)n;
update public.profiles set profile_status='active',disabled_at=null
where profile_id in('00000000-0000-4000-8000-000000009151','00000000-0000-4000-8000-000000009152');
insert into public.shops(shop_id,shop_code,shop_name,shop_status)
select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'IDENTITY-'||n,'Synthetic identity shop','active' from generate_series(9151,9152)n;
insert into public.shop_members(profile_id,shop_id,role_key,membership_status)
select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'shop_owner','active' from generate_series(9151,9152)n;
insert into public.shop_inventory_sources(shop_id,owner_user_id,mapping_state,verified_at)
select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'mapped',now() from generate_series(9151,9152)n;
insert into public.inventory_products(id,owner_user_id,shop_id,barcode,item_number,product_name,stock_quantity,purchase_price,retail_price,updated_at)
values('23000000-0000-4000-8000-000000009151','00000000-0000-4000-8000-000000009151','10000000-0000-4000-8000-000000009151','MiXeD-Existing','ItEm-Existing','Original',1.25,10000,47100,'2026-01-01T00:00:00Z'),
('23000000-0000-4000-8000-000000009152','00000000-0000-4000-8000-000000009152','10000000-0000-4000-8000-000000009152','Foreign-Case','Foreign-Item','Foreign',1.25,10000,47100,'2026-01-01T00:00:00Z');
create temporary table identity_results(label text primary key,value jsonb);
grant insert,select on identity_results to authenticated;
create temporary table identity_before as
select to_jsonb(p)-'product_name'-'updated_at' as invariant,updated_at as revision
from inventory_products p where id='23000000-0000-4000-8000-000000009151';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000009151","role":"authenticated"}',true);
insert into identity_results values('mixed-create',public.shop_catalog_create_product_with_sync(
 p_shop_id=>'10000000-0000-4000-8000-000000009151',p_barcode=>'  MiXeD-Create  ',p_item_number=>'  ArTiClE-Create  ',p_product_name=>'Created mixed',p_stock_quantity=>1.25));
insert into identity_results values('uppercase-peer',public.shop_catalog_create_product_with_sync(
 p_shop_id=>'10000000-0000-4000-8000-000000009151',p_barcode=>'MIXED-CREATE',p_item_number=>'ARTICLE-CREATE',p_product_name=>'Uppercase peer',p_stock_quantity=>1.25));
insert into identity_results values('name-only',public.shop_catalog_update_product_if_revision_with_sync(
 p_shop_id=>'10000000-0000-4000-8000-000000009151',p_product_id=>'23000000-0000-4000-8000-000000009151',
 p_expected_updated_at=>'2026-01-01T00:00:00Z',p_barcode=>'MiXeD-Existing',p_item_number=>'ItEm-Existing',
 p_product_name=>'Name only',p_stock_quantity=>1.25,p_purchase_price=>10000,p_retail_price=>47100));
set local role postgres;
select is((select value->>'code' from identity_results where label='mixed-create'),'success','actual create wrapper accepts mixed-case identity');
select is((select value->>'code' from identity_results where label='uppercase-peer'),'success','distinct uppercase peer is not falsely merged');
select is((select barcode from inventory_products where id=(select(value->>'target_id')::uuid from identity_results where label='mixed-create')),'MiXeD-Create','create trims without case folding');
select is((select item_number from inventory_products where id=(select(value->>'target_id')::uuid from identity_results where label='mixed-create')),'ArTiClE-Create','create preserves item-number case');
select is((select count(*) from inventory_products where shop_id='10000000-0000-4000-8000-000000009151' and barcode in('MiXeD-Create','MIXED-CREATE')),2::bigint,'case-distinct product IDs remain distinct');
select is((select value->>'code' from identity_results where label='name-only'),'success','name-only save accepts unchanged fractional quantity');
select is((select to_jsonb(p)-'product_name'-'updated_at' from inventory_products p where id='23000000-0000-4000-8000-000000009151'),(select invariant from identity_before),'name-only save preserves IDs, codes, quantity and all other fields');
select is((select stock_quantity from inventory_products where id='23000000-0000-4000-8000-000000009151'),1.25::float8,'quantity remains exactly1.25');
select is((select count(*)from inventory_product_prices),0::bigint,'name-only edit does not create price history');
select ok((select updated_at>revision from inventory_products cross join identity_before where id='23000000-0000-4000-8000-000000009151'),'successful update advances the supplied old revision');
select is((select count(*)from audit_logs where shop_id='10000000-0000-4000-8000-000000009151' and event_key='shop.catalog.product.create.success'),2::bigint,'each accepted create retains its audit');
select is((select count(*)from audit_logs where target_id='23000000-0000-4000-8000-000000009151' and event_key='shop.catalog.product.update.success'),1::bigint,'name-only update publishes one success audit');
create temporary table identity_after_name as select
 (select md5(string_agg(to_jsonb(p)::text,','order by id))from inventory_products p) products,
 (select md5(string_agg(to_jsonb(p)::text,','order by id))from inventory_product_prices p) prices,
 (select count(*)from sync_events) events;

set local role authenticated;
insert into identity_results values('trim-collision',public.shop_catalog_create_product_with_sync(
 p_shop_id=>'10000000-0000-4000-8000-000000009151',p_barcode=>'  MiXeD-Create  ',p_product_name=>'Collision'));
insert into identity_results values('stale',public.shop_catalog_update_product_if_revision_with_sync(
 p_shop_id=>'10000000-0000-4000-8000-000000009151',p_product_id=>'23000000-0000-4000-8000-000000009151',
 p_expected_updated_at=>'2026-01-01T00:00:00Z',p_barcode=>'SHOULD-NOT-WRITE',p_product_name=>'Stale',p_stock_quantity=>1.25));
insert into identity_results values('cross-scope',public.shop_catalog_update_product_if_revision_with_sync(
 p_shop_id=>'10000000-0000-4000-8000-000000009151',p_product_id=>'23000000-0000-4000-8000-000000009152',
 p_expected_updated_at=>'2026-01-01T00:00:00Z',p_barcode=>'SHOULD-NOT-WRITE',p_product_name=>'Foreign overwrite',p_stock_quantity=>1.25));
insert into identity_results values('unauthorized-shop',public.shop_catalog_create_product_with_sync(
 p_shop_id=>'10000000-0000-4000-8000-000000009152',p_barcode=>'SHOULD-NOT-WRITE',p_product_name=>'Foreign create'));
set local role postgres;
select is((select value->>'code' from identity_results where label='trim-collision'),'conflict','allowed trim still detects an exact identity collision');
select is((select value->>'code' from identity_results where label='stale'),'stale_revision','old revision is rejected before legacy mutation');
select is((select value->>'code' from identity_results where label='cross-scope'),'not_found','foreign product is inaccessible within authorized shop');
select is((select value->>'code' from identity_results where label='unauthorized-shop'),'unauthorized_or_unmapped','foreign shop create remains unauthorized');
select is((select md5(string_agg(to_jsonb(p)::text,','order by id))from inventory_products p),(select products from identity_after_name),'blocked writes preserve every product byte');
select is((select md5(string_agg(to_jsonb(p)::text,','order by id))from inventory_product_prices p),(select prices from identity_after_name),'blocked writes preserve price history');
select is((select count(*)from sync_events),(select events from identity_after_name),'blocked writes emit no sync event');
select is((select count(*)from audit_logs where target_id='23000000-0000-4000-8000-000000009151' and event_key='shop.catalog.product.update.stale_revision' and result='blocked'),1::bigint,'stale rejection retains its blocked audit');

set local role authenticated;
insert into identity_results values('explicit-edit',public.shop_catalog_update_product_if_revision_with_sync(
 p_shop_id=>'10000000-0000-4000-8000-000000009151',p_product_id=>'23000000-0000-4000-8000-000000009151',
 p_expected_updated_at=>(select updated_at from inventory_products where id='23000000-0000-4000-8000-000000009151'),
 p_barcode=>'  cAsE-Edited  ',p_item_number=>'  nEw-ArTiClE  ',p_product_name=>'Explicit identity edit',p_stock_quantity=>1.25,p_purchase_price=>10000,p_retail_price=>47100));
set local role postgres;
select is((select value->>'code'from identity_results where label='explicit-edit'),'success','explicit identity edit remains available');
select is((select barcode from inventory_products where id='23000000-0000-4000-8000-000000009151'),'cAsE-Edited','explicit barcode preserves entered case and trims');
select is((select item_number from inventory_products where id='23000000-0000-4000-8000-000000009151'),'nEw-ArTiClE','explicit item code preserves entered case and trims');
create temporary table identity_after_edit as select
 (select md5(string_agg(to_jsonb(p)::text,','order by id))from inventory_products p) products,
 (select count(*)from sync_events) events;
set local role authenticated;
insert into identity_results values('invalid-identity',public.shop_catalog_update_product_if_revision_with_sync(
 p_shop_id=>'10000000-0000-4000-8000-000000009151',p_product_id=>'23000000-0000-4000-8000-000000009151',
 p_expected_updated_at=>(select updated_at from inventory_products where id='23000000-0000-4000-8000-000000009151'),
 p_barcode=>'bad'||chr(10)||'identity',p_product_name=>'Invalid control',p_stock_quantity=>1.25));
set local role postgres;
select is((select value->>'ok' from identity_results where label='invalid-identity'),'false','strict trigger still rejects prohibited identity controls');
select is((select md5(string_agg(to_jsonb(p)::text,','order by id))from inventory_products p),(select products from identity_after_edit),'invalid input preserves every product byte');
select is((select count(*)from sync_events),(select events from identity_after_edit),'invalid identity emits no sync event');
select is(app_private.catalog_identity_text_v1('  Case-A  ',96,true),'Case-A','canonical identity helper remains trim-only');
select * from finish();
rollback;
