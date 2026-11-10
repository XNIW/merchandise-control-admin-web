begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(20);
insert into public.shops(shop_id,shop_code,shop_name,shop_status) values
 ('10000000-0000-4000-8000-000000093019','MARKER019FIXTURE','Synthetic ASUS019','active'),
 ('10000000-0000-4000-8000-000000094019','MARKER019OTHER','Synthetic other shop','active');
delete from public.staff_role_permissions where shop_id='10000000-0000-4000-8000-000000093019';
insert into public.staff_accounts(staff_id,shop_id,staff_code,display_name,role_key,status,credential_kind,
 credential_hash,credential_updated_at,credential_expires_at,must_change_credential,credential_version,credential_status)
values('20000000-0000-4000-8000-000000093019','10000000-0000-4000-8000-000000093019','1001',
 'Synthetic scoped manager','manager','active','password','argon2id:synthetic-not-a-login',clock_timestamp(),clock_timestamp()+interval '1 hour',false,7,'active');
insert into public.staff_role_permissions(shop_id,role_key,permission_key,enabled) values
 ('10000000-0000-4000-8000-000000093019','manager','catalog.read',true),
 ('10000000-0000-4000-8000-000000093019','manager','settings.read',true)
on conflict(shop_id,role_key,permission_key) do update set enabled=true;
insert into public.staff_web_sessions(staff_web_session_id,shop_id,staff_id,session_token_hash,staff_credential_version,status,issued_at,expires_at)
values('30000000-0000-4000-8000-000000093019','10000000-0000-4000-8000-000000093019',
 '20000000-0000-4000-8000-000000093019','sha256:'||repeat('a',64),7,'active',now()-interval '1 minute',now()+interval '1 hour');

insert into auth.users(instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000093019','authenticated','authenticated','asus019-mobile-owner@example.invalid','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000094019','authenticated','authenticated','asus019-mobile-other@example.invalid','{}','{}',now(),now());
insert into public.shop_inventory_sources(shop_inventory_source_id,shop_id,owner_user_id,mapping_state,verified_at) values
 ('40000000-0000-4000-8000-000000093019','10000000-0000-4000-8000-000000093019','00000000-0000-4000-8000-000000093019','mapped',now());
insert into public.shared_sheet_sessions(remote_id,payload_version,"timestamp",supplier,category,is_manual_entry,data,owner_user_id,shop_id,display_name) values
 ('51000000-0000-4000-8000-000000093019',2,'2026-11-09T12:00:00.000Z','Synthetic own','Fixture',false,'[]','00000000-0000-4000-8000-000000093019','10000000-0000-4000-8000-000000093019','Own history'),
 ('51000000-0000-4000-8000-000000094019',2,'2026-10-09T12:00:00.000Z','Synthetic legacy','Fixture',false,'[]','00000000-0000-4000-8000-000000093019',null,'Legacy history'),
 ('51000000-0000-4000-8000-000000003019',2,'2026-11-09T12:00:00.000Z','PRIVATE_OTHER_HISTORY','Fixture',false,'[]','00000000-0000-4000-8000-000000094019','10000000-0000-4000-8000-000000094019','PRIVATE_OTHER_HISTORY');
create function pg_temp.marker(p_op text default 'marker',p_payload jsonb default '{}',p_hash text default 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') returns jsonb language sql as $$
 select public.staff_web_mobile_operations_read_v1('10000000-0000-4000-8000-000000093019','20000000-0000-4000-8000-000000093019','30000000-0000-4000-8000-000000093019',p_hash,7,p_op,p_payload);$$;
create temp table marker_context(key text primary key,value jsonb);
grant all on marker_context to service_role;
insert into public.payment_history_role_permissions(shop_id,role_key,capability,enabled) values('10000000-0000-4000-8000-000000093019','manager','read',false);
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
insert into marker_context values('catalog',pg_temp.marker());
select is((select value->>'code' from marker_context where key='catalog'),'success','catalog-only staff can discover shop revisions');
select is((select value->'marker_domains' from marker_context where key='catalog'),'["catalog","prices"]'::jsonb,'catalog grants do not include import history or financial history');
select ok(not exists(select 1 from marker_context c,jsonb_array_elements(c.value#>'{sync,rows}') r where r->>'domain'='history'),'catalog marker never publishes history event rows');
select throws_ok($$select public.payment_history_request_v1('10000000-0000-4000-8000-000000093019','read','{}','20000000-0000-4000-8000-000000093019','30000000-0000-4000-8000-000000093019','sha256:'||repeat('a',64),7)$$,'42501','payment_history_permission_denied','catalog marker grants no financial read');
select is(pg_temp.marker('sync')->>'code','permission_denied','catalog-only staff cannot read generic history');
select is(public.staff_web_mobile_operations_read_v1('10000000-0000-4000-8000-000000094019','20000000-0000-4000-8000-000000093019','30000000-0000-4000-8000-000000093019','sha256:'||repeat('a',64),7,'marker','{}')->>'code','permission_denied','marker cannot cross shops');
select is(pg_temp.marker(p_hash=>'sha256:'||repeat('b',64))->>'code','permission_denied','marker cannot borrow another token');
select is(pg_temp.marker(p_payload=>'{"domains":["history"]}')->>'code','validation_failed','browser cannot expand marker domains');
set local role postgres;
select is((select count(*) from public.audit_logs where shop_id='10000000-0000-4000-8000-000000093019'),0::bigint,'polling creates no repeating audit write');
update public.shared_sheet_sessions set display_name='Synthetic history revision',updated_at='2026-11-10T23:00:00Z' where remote_id='51000000-0000-4000-8000-000000093019';
set local role service_role;
select is(pg_temp.marker()#>>'{sync,eventMarker}',(select value#>>'{sync,eventMarker}' from marker_context where key='catalog'),'history-only changes do not alter a catalog-only marker');
set local role postgres;
select app_private.acquire_sync_event_scope_fence_v1('00000000-0000-4000-8000-000000093019','10000000-0000-4000-8000-000000093019');
insert into public.inventory_products(id,owner_user_id,shop_id,barcode,product_name)
 values('61000000-0000-4000-8000-000000093019','00000000-0000-4000-8000-000000093019','10000000-0000-4000-8000-000000093019','SYNTHETIC-MARKER-093019','Synthetic marker product');
set local role service_role;
select isnt(pg_temp.marker()#>>'{sync,eventMarker}',(select value#>>'{sync,eventMarker}' from marker_context where key='catalog'),'catalog change reaches the existing poll');
set local role postgres;
update public.staff_role_permissions set enabled=false where shop_id='10000000-0000-4000-8000-000000093019' and role_key='manager' and permission_key='catalog.read';
insert into public.staff_role_permissions(shop_id,role_key,permission_key,enabled) values('10000000-0000-4000-8000-000000093019','manager','sync.read',true);
set local role service_role;
insert into marker_context values('history',pg_temp.marker());
select is((select value->>'code' from marker_context where key='history'),'success','sync-only staff can discover history revisions');
select is((select value->'marker_domains' from marker_context where key='history'),'["history"]'::jsonb,'sync-only marker has no catalog scope');
select is(pg_temp.marker('history_list','{"page":"1","pageSize":"10","month":"","query":"","status":"all"}')->>'code','success','UI history.read correctly uses its persisted sync.read grant');
select ok(not exists(select 1 from marker_context c,jsonb_array_elements(c.value#>'{sync,rows}') r where c.key='history' and r->>'domain'<>'history'),'sync-only staff sees no catalog event rows');
set local role postgres;
update public.staff_role_permissions set enabled=false where shop_id='10000000-0000-4000-8000-000000093019' and role_key='manager';
set local role service_role;
select is(pg_temp.marker()->>'code','permission_denied','absence of a permitted domain is not an empty marker');
select is(pg_temp.marker('history_list','{"page":"1","pageSize":"10","month":"","query":"","status":"all"}')->>'code','permission_denied','history read is still denied without sync.read');
set local role postgres;
update public.staff_role_permissions set enabled=true where shop_id='10000000-0000-4000-8000-000000093019' and role_key='manager';
set local role service_role;
select is(pg_temp.marker()->'marker_domains','["catalog","prices","history"]'::jsonb,'both independent permissions compose the discovery domains');
set local role postgres;
update public.staff_web_sessions set status='revoked',revoked_at=clock_timestamp() where staff_web_session_id='30000000-0000-4000-8000-000000093019';
set local role service_role;
select is(pg_temp.marker()->>'code','permission_denied','revoked staff session stops discovery');
set local role postgres;
select is((select count(*) from public.payment_history_receipts where shop_id='10000000-0000-4000-8000-000000093019'),0::bigint,'marker operations create no financial effect');
select * from finish();
rollback;
