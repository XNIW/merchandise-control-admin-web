begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(31);
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

insert into public.shop_devices(shop_device_id,shop_id,device_identifier,device_type,display_name,status) values
 ('40000000-0000-4000-8000-000000001019','10000000-0000-4000-8000-000000001019','synthetic019','pos','Synthetic own device','active'),
 ('40000000-0000-4000-8000-000000002019','10000000-0000-4000-8000-000000002019','synthetic-other','pos','PRIVATE_OTHER_DEVICE','active');
insert into public.audit_logs(audit_log_id,scope,shop_id,event_key,severity,result,target_type,target_id,metadata_redacted) values
 ('50000000-0000-4000-8000-000000001019','shop','10000000-0000-4000-8000-000000001019','synthetic.fixture','info','success','device','synthetic-own','{}'),
 ('50000000-0000-4000-8000-000000002019','shop','10000000-0000-4000-8000-000000002019','synthetic.fixture','info','success','device','PRIVATE_OTHER_TARGET','{}');
create function pg_temp.ops(p_op text default 'audit_list',p_payload jsonb default '{}',
 p_shop uuid default '10000000-0000-4000-8000-000000001019',p_hash text default 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',p_version integer default 7)
returns jsonb language sql as $$select public.staff_web_operations_read_v1(p_shop,'20000000-0000-4000-8000-000000001019','30000000-0000-4000-8000-000000001019',p_hash,p_version,p_op,p_payload);$$;
select has_function('public','staff_web_operations_read_v1',array['uuid','uuid','uuid','text','integer','text','jsonb'],'named operations reader exists');
select ok(not has_function_privilege('anon','public.staff_web_operations_read_v1(uuid,uuid,uuid,text,integer,text,jsonb)','EXECUTE'),'anonymous has no staff read');
select ok(not has_function_privilege('authenticated','public.staff_web_operations_read_v1(uuid,uuid,uuid,text,integer,text,jsonb)','EXECUTE'),'authenticated cannot impersonate staff');
select ok(has_function_privilege('service_role','public.staff_web_operations_read_v1(uuid,uuid,uuid,text,integer,text,jsonb)','EXECUTE'),'server named RPC only');
set local role service_role;
select is(pg_temp.ops()->>'code','success','active admin reads operational audit');
select ok(pg_temp.ops()::text not like '%PRIVATE_OTHER_TARGET%','audit does not include another shop');
select is(jsonb_array_length(pg_temp.ops('audit_list','{"eventQuery":"synthetic.fixture"}')->'rows'->'events'),1,'bounded event filter works');
select is(jsonb_array_length(pg_temp.ops('audit_list','{"eventQuery":"synthetic.fixture","result":"failure"}')->'rows'->'events'),0,'result filter works');
select is(jsonb_array_length(pg_temp.ops('audit_detail','{"eventId":"50000000-0000-4000-8000-000000001019"}')->'rows'->'events'),1,'own audit detail works');
select is(jsonb_array_length(pg_temp.ops('audit_detail','{"eventId":"50000000-0000-4000-8000-000000002019"}')->'rows'->'events'),0,'cross-shop detail stays empty');
select is(pg_temp.ops('audit_detail')->>'code','validation_failed','detail requires explicit identity');
select is(pg_temp.ops('audit_detail','{"eventId":"invalid"}')->>'code','validation_failed','invalid identity is not a query');
select is(pg_temp.ops('audit_list','{"table":"staff_accounts"}')->>'code','validation_failed','arbitrary tables not supported');
select is(pg_temp.ops('pos_live')->>'code','success','POS live read supported');
select is(jsonb_array_length(pg_temp.ops('pos_live')->'rows'->'devices'),1,'POS registry is shop scoped');
select ok(pg_temp.ops('pos_live')::text not like '%PRIVATE_OTHER_DEVICE%','POS live does not include other device');
select ok(not ((pg_temp.ops('pos_live')->'rows') ? 'session_token_hash'),'closed POS response has no credential material');
select is(pg_temp.ops('pos_live','{"filter":"anything"}')->>'code','validation_failed','live operation has no open filters');
select is(pg_temp.ops('pos_revenue','{"month":"2026-11","year":"2026","today":"2026-11-09"}')->>'code','success','revenue period read works');
select is(jsonb_array_length(pg_temp.ops('pos_revenue','{"month":"2026-11","year":"2026","today":"2026-11-09"}')->'rows'->'sales'),0,'no native sales is an authorized empty list');
select is(pg_temp.ops('pos_revenue','{"month":"2026-99","year":"2026","today":"2026-11-09"}')->>'code','validation_failed','bad month rejected');
select is(pg_temp.ops('pos_revenue','{"month":"2026-11","year":"2026","today":"2026-02-31"}')->>'code','validation_failed','invalid calendar date rejected');
select is(pg_temp.ops('unknown')->>'code','validation_failed','closed operation allowlist');
select is(pg_temp.ops(p_hash=>null)->>'code','permission_denied','SQL null hash does not authorize');
select is(pg_temp.ops(p_hash=>'sha256:'||repeat('b',64))->>'code','permission_denied','wrong token hash denied');
select is(pg_temp.ops(p_version=>8)->>'code','permission_denied','stale version denied');
select is(pg_temp.ops(p_shop=>'10000000-0000-4000-8000-000000002019')->>'code','permission_denied','another shop cannot be selected');
set local role postgres;
update public.staff_accounts set role_key='manager' where staff_id='20000000-0000-4000-8000-000000001019';
insert into public.staff_role_permissions(shop_id,role_key,permission_key,enabled) values('10000000-0000-4000-8000-000000001019','manager','audit.read',true) on conflict(shop_id,role_key,permission_key) do update set enabled=true;
set local role service_role;
select is(pg_temp.ops()->>'code','success','granular audit permission supported');
select is(pg_temp.ops('pos_live')->>'code','permission_denied','audit reader cannot read POS dashboard');
set local role postgres;
update public.staff_role_permissions set enabled=false where shop_id='10000000-0000-4000-8000-000000001019' and role_key='manager' and permission_key='audit.read';
set local role service_role;
select is(pg_temp.ops()->>'code','permission_denied','permission removal affects the same session');
set local role postgres;
select ok(exists(select 1 from public.audit_logs where shop_id='10000000-0000-4000-8000-000000001019' and actor_staff_id='20000000-0000-4000-8000-000000001019' and event_key='shop.operations.staff_read'),'read audit retains distinct staff actor');
select * from finish();
rollback;
