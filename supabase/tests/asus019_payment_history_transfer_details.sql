begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(7);
select has_function('public','payment_history_transfer_details_v1',array['uuid','text','jsonb','uuid','uuid','text','integer'],'named physical device reader');
select ok(not has_function_privilege('anon','public.payment_history_transfer_details_v1(uuid,text,jsonb,uuid,uuid,text,integer)','EXECUTE'),'anonymous cannot enumerate physical devices');
insert into public.shops(shop_id,shop_code,shop_name,shop_status) values('10000000-0000-4000-8000-000000009019','DETAIL019','Synthetic device details','active');
insert into public.staff_accounts(staff_id,shop_id,staff_code,display_name,role_key,status,credential_kind,credential_hash,credential_updated_at,credential_expires_at,must_change_credential,credential_version,credential_status)
 values('20000000-0000-4000-8000-000000009019','10000000-0000-4000-8000-000000009019','1001','Synthetic device checker','pos_admin','active','password','argon2id:synthetic-not-a-login',clock_timestamp(),clock_timestamp()+interval '1 hour',false,7,'active');
insert into public.staff_role_permissions(shop_id,role_key,permission_key,enabled) values('10000000-0000-4000-8000-000000009019','pos_admin','shop_admin.full_access',true) on conflict(shop_id,role_key,permission_key) do update set enabled=true;
insert into public.staff_web_sessions(staff_web_session_id,shop_id,staff_id,session_token_hash,staff_credential_version,status,issued_at,expires_at)
 values('30000000-0000-4000-8000-000000009019','10000000-0000-4000-8000-000000009019','20000000-0000-4000-8000-000000009019','sha256:'||repeat('a',64),7,'active',now()-interval '1 minute',now()+interval '1 hour');
insert into public.shop_devices(shop_device_id,shop_id,device_identifier,display_name,device_type,status)
 values('40000000-0000-4000-8000-000000009019','10000000-0000-4000-8000-000000009019','SYNTHETIC-DETAIL-POS','Synthetic labelled POS','pos','active');
create function pg_temp.details(op text default 'devices',payload jsonb default '{}',shop uuid default '10000000-0000-4000-8000-000000009019') returns jsonb language sql as $$
select public.payment_history_transfer_details_v1(shop,op,payload,'20000000-0000-4000-8000-000000009019','30000000-0000-4000-8000-000000009019','sha256:'||repeat('a',64),7)->'result';$$;
set local role service_role;
set local request.jwt.claims='{"role":"service_role"}';
select is(pg_temp.details()#>>'{devices,0,name}','Synthetic labelled POS','operator sees an actual scoped physical label');
select is((select count(*) from jsonb_object_keys(pg_temp.details()#>'{devices,0}')),4::bigint,'projection contains no credential or token fields');
select throws_ok($$select pg_temp.details('invented')$$,'22023','payment_history_operation_invalid','reader cannot select an arbitrary table or action');
select throws_ok($$select pg_temp.details('devices','{}','10000000-0000-4000-8000-000000099019')$$,'42501','payment_history_permission_denied','shop derived from the staff lease cannot be changed');
set local role postgres;
update public.staff_web_sessions set status='revoked',revoked_at=clock_timestamp() where staff_web_session_id='30000000-0000-4000-8000-000000009019';
set local role service_role;
select throws_ok($$select pg_temp.details()$$,'42501','payment_history_permission_denied','revoked session cannot read device labels');
select * from finish();
rollback;
