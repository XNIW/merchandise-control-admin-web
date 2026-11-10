begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(25);
insert into public.shops(shop_id,shop_code,shop_name,shop_status) values
 ('10000000-0000-4000-8000-000000001019','ASUS019FIXTURE','Synthetic ASUS019','active'),
 ('10000000-0000-4000-8000-000000002019','ASUS019OTHER','Synthetic other shop','active');
insert into public.staff_accounts(staff_id,shop_id,staff_code,display_name,role_key,status,credential_kind,
 credential_hash,credential_updated_at,credential_expires_at,must_change_credential,credential_version,credential_status)
values('20000000-0000-4000-8000-000000001019','10000000-0000-4000-8000-000000001019','1001',
 'Synthetic admin','pos_admin','active','password','argon2id:synthetic-not-a-login',clock_timestamp(),clock_timestamp()+interval '1 hour',false,7,'active');
insert into public.staff_role_permissions(shop_id,role_key,permission_key,enabled) values
 ('10000000-0000-4000-8000-000000001019','pos_admin','shop_admin.full_access',true),
 ('10000000-0000-4000-8000-000000001019','manager','settings.read',true)
on conflict(shop_id,role_key,permission_key) do update set enabled=true;
insert into public.staff_web_sessions(staff_web_session_id,shop_id,staff_id,session_token_hash,staff_credential_version,status,issued_at,expires_at)
values('30000000-0000-4000-8000-000000001019','10000000-0000-4000-8000-000000001019',
 '20000000-0000-4000-8000-000000001019','sha256:'||repeat('a',64),7,'active',now()-interval '1 minute',now()+interval '1 hour');

insert into auth.users(instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000001019','authenticated','authenticated','asus019-mobile-owner@example.invalid','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000002019','authenticated','authenticated','asus019-mobile-other@example.invalid','{}','{}',now(),now());
insert into public.shop_inventory_sources(shop_inventory_source_id,shop_id,owner_user_id,mapping_state,verified_at) values
 ('40000000-0000-4000-8000-000000001019','10000000-0000-4000-8000-000000001019','00000000-0000-4000-8000-000000001019','mapped',now());
insert into public.shared_sheet_sessions(remote_id,payload_version,"timestamp",supplier,category,is_manual_entry,data,owner_user_id,shop_id,display_name) values
 ('ASUS019-OWN',2,'2026-11-09T12:00:00.000Z','Synthetic own','Fixture',false,'[]','00000000-0000-4000-8000-000000001019','10000000-0000-4000-8000-000000001019','Own history'),
 ('ASUS019-LEGACY',2,'2026-10-09T12:00:00.000Z','Synthetic legacy','Fixture',false,'[]','00000000-0000-4000-8000-000000001019',null,'Legacy history'),
 ('ASUS019-OTHER',2,'2026-11-09T12:00:00.000Z','PRIVATE_OTHER_HISTORY','Fixture',false,'[]','00000000-0000-4000-8000-000000002019','10000000-0000-4000-8000-000000002019','PRIVATE_OTHER_HISTORY');
create function pg_temp.mobile(p_op text default 'history_list',p_payload jsonb default '{"page":"1","pageSize":"10","month":"","query":"","status":"all"}',p_hash text default 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') returns jsonb language sql as $$
 select public.staff_web_mobile_operations_read_v1('10000000-0000-4000-8000-000000001019','20000000-0000-4000-8000-000000001019','30000000-0000-4000-8000-000000001019',p_hash,7,p_op,p_payload);
$$;
select has_function('public','staff_web_mobile_operations_read_v1',array['uuid','uuid','uuid','text','integer','text','jsonb'],'mobile/device named reader exists');
select ok(not has_function_privilege('anon','public.staff_web_mobile_operations_read_v1(uuid,uuid,uuid,text,integer,text,jsonb)','EXECUTE'),'anonymous cannot execute');
select ok(not has_function_privilege('authenticated','public.staff_web_mobile_operations_read_v1(uuid,uuid,uuid,text,integer,text,jsonb)','EXECUTE'),'personal token cannot impersonate staff');
select ok(has_function_privilege('service_role','public.staff_web_mobile_operations_read_v1(uuid,uuid,uuid,text,integer,text,jsonb)','EXECUTE'),'server executes named RPC');
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select is(pg_temp.mobile()->>'code','success','history list works');
select is((pg_temp.mobile()->>'total_count')::integer,2,'shop plus mapped legacy counted once');
select is(jsonb_array_length(pg_temp.mobile()->'sessions'),2,'bounded own and legacy list');
select ok(pg_temp.mobile()::text not like '%PRIVATE_OTHER_HISTORY%','another shop history is excluded');
select is(pg_temp.mobile('history_list','{"page":"1","pageSize":"10","month":"2026-11","query":"","status":"all"}')->>'total_count','1','month filter matches source commercial timestamp');
select is(pg_temp.mobile('history_list','{"page":"1","pageSize":"10","month":"","query":"Legacy history","status":"all"}')->>'total_count','1','text filter works without SQL wildcard interpolation');
select is(pg_temp.mobile('history_list','{"page":"2","pageSize":"10","month":"","query":"","status":"all"}')->>'total_count','2','later empty page preserves exact total');
select is(jsonb_array_length(pg_temp.mobile('history_list','{"page":"2","pageSize":"10","month":"","query":"","status":"all"}')->'sessions'),0,'later page is empty');
select is(pg_temp.mobile('history_detail','{"kind":"shared_sheet_session","id":"ASUS019-LEGACY"}')->'sessions'->0->>'sourceScope','legacy_owner_bridge','legacy detail retains provenance');
select is(jsonb_array_length(pg_temp.mobile('history_detail','{"kind":"shared_sheet_session","id":"ASUS019-OTHER"}')->'sessions'),0,'detail cannot access other shop');
select is(pg_temp.mobile('sync','{}')->>'code','success','sync uses existing sanitized SQL boundary');
select is(pg_temp.mobile('sync','{}')->'sync'->'scope'->>'shopId','10000000-0000-4000-8000-000000001019','sync nested envelope has exact shop');
select is(pg_temp.mobile('devices','{}')->>'code','success','device registry is supported');
select is(pg_temp.mobile('devices','{}')->'sync'->'scope'->>'mappedLegacyOwnerUserId','00000000-0000-4000-8000-000000001019','device sync links use verified mapping');
select is(pg_temp.mobile('history_list','{"page":"0","pageSize":"10","status":"all"}')->>'code','validation_failed','invalid page rejected');
select is(pg_temp.mobile('history_list','{"page":"1","pageSize":"100000","status":"all"}')->>'code','validation_failed','unbounded request rejected');
select is(pg_temp.mobile('devices','{"owner_user_id":"00000000-0000-4000-8000-000000002019"}')->>'code','validation_failed','browser cannot select owner bridge');
select is(pg_temp.mobile(p_hash=>null)->>'code','permission_denied','null token is denied');
set local role postgres;
update public.shop_inventory_sources set mapping_state='not_configured',verified_at=null where shop_inventory_source_id='40000000-0000-4000-8000-000000001019';
set local role service_role;
select is(pg_temp.mobile()->>'code','scope_unresolved','unverified source blocks publication');
set local role postgres;
update public.shop_inventory_sources set mapping_state='mapped',verified_at=now() where shop_inventory_source_id='40000000-0000-4000-8000-000000001019';
update public.staff_web_sessions set status='revoked',revoked_at=clock_timestamp() where staff_web_session_id='30000000-0000-4000-8000-000000001019';
set local role service_role;
select is(pg_temp.mobile()->>'code','permission_denied','revoked staff session cannot read source');
set local role postgres;
select ok(exists(select 1 from public.audit_logs where actor_staff_id='20000000-0000-4000-8000-000000001019' and shop_id='10000000-0000-4000-8000-000000001019' and event_key='shop.mobile_operations.staff_read'),'read audit records distinct staff actor');
select * from finish();rollback;
