-- Synthetic, transaction-owned fixtures only. Never run this on a hosted shop.
begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(28);

select ok(
  has_function_privilege('service_role', 'app_private.resolve_pos_catalog_scope_v2(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'app_private.resolve_pos_catalog_scope_v2(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'app_private.resolve_pos_catalog_scope_v2(uuid)', 'EXECUTE'),
  'empty-scope fix preserves the private resolver execution boundary'
);
select ok(
  (select prosecdef and provolatile = 'v' from pg_proc
   where oid = 'app_private.resolve_pos_catalog_scope_v2(uuid)'::regprocedure),
  'resolver keeps its existing security and scope-lock volatility'
);

insert into auth.users(instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000'::uuid,
  ('00000000-0000-4000-8000-00000000' || (1900+n)::text)::uuid,
  'authenticated','authenticated','asus019-' || n || '@example.invalid','{}','{}',now(),now()
from generate_series(1,6) n;
insert into public.shops(shop_id,shop_code,shop_name,shop_status,suspended_at,suspended_by_profile_id)
select ('10000000-0000-4000-8000-00000000' || (1900+n)::text)::uuid,
  'ASUS019' || n, 'ASUS-019 synthetic scope ' || n,
  case when n=6 then 'suspended' else 'active' end,
  case when n=6 then now() else null end,
  case when n=6 then '00000000-0000-4000-8000-000000001906'::uuid else null end
from generate_series(1,6) n;
insert into public.staff_accounts(
 staff_id,shop_id,staff_code,display_name,role_key,status,credential_kind,
 credential_hash,credential_updated_at,credential_expires_at,must_change_credential,
 credential_version,credential_status
) values (
 '20000000-0000-4000-8000-000000001901','10000000-0000-4000-8000-000000001901',
 'ASUS019','ASUS-019 synthetic operator','pos_admin','active','password',
 'argon2id:asus019-redacted-fixture',clock_timestamp(),clock_timestamp()+interval '1 hour',
 false,1,'active'
);
create temporary table asus019_login as
select public.pos_runtime_first_login_commit_v2(
 '10000000-0000-4000-8000-000000001901','20000000-0000-4000-8000-000000001901',1,
 'asus019-synthetic-device','ASUS-019 synthetic device','1.0-test',
 'sha256:'||repeat('7',64),3600,'sha256:'||repeat('8',64),1800,'{}'
) as payload;
select is((select payload->>'code' from asus019_login),'success',
  'real first-login commit establishes the synthetic native-shop lease');
create temporary table asus019_lease as
select shop_id,shop_device_id,staff_id,pos_session_id,expires_at
from public.pos_sessions where shop_id='10000000-0000-4000-8000-000000001901';
select ok((select app_private.pos_runtime_lease_is_valid_v1(
 shop_id,shop_device_id,staff_id,pos_session_id) from asus019_lease),
 'empty native shop has a current lease without catalog rows');
select results_eq(
 $$select scope_kind,scope_id,blocked from app_private.resolve_pos_catalog_scope_v2('10000000-0000-4000-8000-000000001901')$$,
 $$values ('shop_scoped'::text,'10000000-0000-4000-8000-000000001901'::uuid,false)$$,
 'pristine active shop resolves its canonical identity before its first row'
);

-- A real foreign row must not enter the native empty scope.
insert into public.inventory_products(id,owner_user_id,shop_id,barcode,product_name)
values ('23000000-0000-4000-8000-000000001902','00000000-0000-4000-8000-000000001902',
 '10000000-0000-4000-8000-000000001902','ASUS019-FOREIGN','ASUS-019 foreign synthetic row');
create function pg_temp.asus019_page(target_shop uuid, target_device uuid, target_staff uuid, target_session uuid)
returns jsonb language sql volatile as $body$
 select public.pos_catalog_pull_page_for_lease_v3(
 target_shop,'full_refresh',null,null,null,null,null,1000,null,null,null,true,
 target_device,target_staff,target_session);
$body$;
create temporary table asus019_manifest as
select pg_temp.asus019_page(shop_id,shop_device_id,staff_id,pos_session_id) as payload
from asus019_lease;
select is((select payload->>'status' from asus019_manifest),'ok',
 'lease-bound RPC returns an authoritative empty manifest instead of unmapped');
select is((select payload->>'scopeKind' from asus019_manifest),'shop_scoped',
 'manifest uses canonical shop scope');
select is((select payload->'scopeOwnerId' from asus019_manifest),'null'::jsonb,
 'native scope does not infer or expose a legacy owner');
select is((select payload->>'scopeKey' from asus019_manifest),
 '2332de8f5f0d417b5e2299d2d17042dd','scope fingerprint binds the exact native shop');
select is((select payload->>'revision' from asus019_manifest),'0',
 'empty native catalog starts at revision zero');
select is((select payload->>'entity' from asus019_manifest),'done',
 'empty full snapshot is terminal without an invented row');
select is((select payload->'rows' from asus019_manifest),'[]'::jsonb,
 'empty snapshot exposes no foreign catalog rows');
select is((select payload#>'{manifest,catalogSummary}' from asus019_manifest),
 '{"products":0,"activeProducts":0,"categories":0,"suppliers":0,"prices":0}'::jsonb,
 'all authoritative summary totals are zero');
select is((select payload#>'{manifest,windowCounts}' from asus019_manifest),
 '{"categories":0,"suppliers":0,"products":0,"prices":0}'::jsonb,
 'all snapshot window counts are zero');
select is((select count(*)::integer from public.inventory_products
 where shop_id='10000000-0000-4000-8000-000000001902'),1,
 'foreign fixture really exists while the native summary remains zero');

select ok((select blocked from app_private.resolve_pos_catalog_scope_v2(
 '10000000-0000-4000-8000-000000009999')),
 'nonexistent shop does not receive an empty scope');
select ok((select blocked from app_private.resolve_pos_catalog_scope_v2(null)),
 'null shop remains blocked');
select ok((select blocked from app_private.resolve_pos_catalog_scope_v2(
 '10000000-0000-4000-8000-000000001906')),
 'suspended empty shop remains blocked');
insert into public.shop_inventory_sources(shop_id,owner_user_id,mapping_state,verified_at,disabled_at)
values
 ('10000000-0000-4000-8000-000000001903',null,'not_configured',null,null),
 ('10000000-0000-4000-8000-000000001904','00000000-0000-4000-8000-000000001904','mapped',now(),now()),
 ('10000000-0000-4000-8000-000000001905','00000000-0000-4000-8000-000000001905','mapped',now(),null);
select ok((select blocked from app_private.resolve_pos_catalog_scope_v2(
 '10000000-0000-4000-8000-000000001903')),
 'explicit incomplete mapping is not reinterpreted as pristine native');
select is(public.pos_catalog_pull_page_v2(
 '10000000-0000-4000-8000-000000001903','full_refresh',null,null,null,null,null,1000,null,null,null,true),
 '{"status":"unmapped"}'::jsonb,'incomplete mapping still returns no rows or manifest');
select ok((select blocked from app_private.resolve_pos_catalog_scope_v2(
 '10000000-0000-4000-8000-000000001904')),
 'disabled bridge history cannot silently become native-empty');
select results_eq(
 $$select scope_kind,scope_id,blocked from app_private.resolve_pos_catalog_scope_v2('10000000-0000-4000-8000-000000001905')$$,
 $$values ('legacy_owner_bridge'::text,'00000000-0000-4000-8000-000000001905'::uuid,false)$$,
 'verified legacy empty scope remains unchanged');
select is((select pg_temp.asus019_page('10000000-0000-4000-8000-000000001902',
 shop_device_id,staff_id,pos_session_id) from asus019_lease),'{"status":"denied"}'::jsonb,
 'valid native lease cannot read a foreign shop');
select is((select pg_temp.asus019_page(shop_id,'30000000-0000-4000-8000-000000009999',
 staff_id,pos_session_id) from asus019_lease),'{"status":"denied"}'::jsonb,
 'wrong device remains denied before empty scope resolution');

-- A newly configured bridge invalidates publication of the earlier snapshot.
insert into public.shop_inventory_sources(shop_id,owner_user_id,mapping_state)
values ('10000000-0000-4000-8000-000000001901',null,'not_configured');
select is((select public.pos_runtime_lease_publish_success_v2(
 lease.shop_id,lease.shop_device_id,lease.staff_id,lease.pos_session_id,'catalog_pull',
 manifest.payload->>'scopeKey',manifest.payload->>'revision')->>'status'
 from asus019_lease lease cross join asus019_manifest manifest),'stale_catalog',
 'mapping change fences publication of a previously valid empty snapshot');
update public.pos_sessions set expires_at=clock_timestamp()-interval '1 second'
where shop_id='10000000-0000-4000-8000-000000001901';
select is((select pg_temp.asus019_page(shop_id,shop_device_id,staff_id,pos_session_id)
 from asus019_lease),'{"status":"denied"}'::jsonb,
 'expired session cannot obtain even an empty catalog');
update public.pos_sessions session_row set expires_at=lease.expires_at,status='revoked',revoked_at=clock_timestamp()
from asus019_lease lease where session_row.pos_session_id=lease.pos_session_id;
select is((select pg_temp.asus019_page(shop_id,shop_device_id,staff_id,pos_session_id)
 from asus019_lease),'{"status":"denied"}'::jsonb,
 'revoked session cannot obtain even an empty catalog');
update public.pos_sessions set status='active',revoked_at=null
where shop_id='10000000-0000-4000-8000-000000001901';
update public.staff_accounts set credential_version=2
where shop_id='10000000-0000-4000-8000-000000001901';
select is((select pg_temp.asus019_page(shop_id,shop_device_id,staff_id,pos_session_id)
 from asus019_lease),'{"status":"denied"}'::jsonb,
 'changed staff credential version keeps the lease denied');
select * from finish();
rollback;
