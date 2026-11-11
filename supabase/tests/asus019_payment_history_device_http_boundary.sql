begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local statement_timeout='30s';
set local search_path=public,extensions;
select plan(11);

insert into public.shops(shop_id,shop_code,shop_name,shop_status) values('10000000-0000-4000-8000-000000603019','HTTP-HISTORY-019','Synthetic HTTP history','active');
insert into public.staff_accounts(staff_id,shop_id,staff_code,display_name,role_key,status,credential_kind,credential_hash,credential_updated_at,credential_expires_at,must_change_credential,credential_version,credential_status)
 values('30000000-0000-4000-8000-000000603019','10000000-0000-4000-8000-000000603019','1001','Synthetic HTTP operator','pos_admin','active','password','argon2id:synthetic-not-a-login',clock_timestamp(),clock_timestamp()+interval '1 hour',false,7,'active');
insert into public.staff_role_permissions(shop_id,role_key,permission_key,enabled) values('10000000-0000-4000-8000-000000603019','pos_admin','shop_admin.full_access',true);
insert into public.payment_history_runtime(shop_id) values('10000000-0000-4000-8000-000000603019');
insert into public.shop_devices(shop_device_id,shop_id,device_identifier,display_name,device_type,status) values('20000000-0000-4000-8000-000000603019','10000000-0000-4000-8000-000000603019','SYNTHETIC-HTTP-019','Synthetic HTTP POS','pos','active');
insert into public.pos_device_credentials(pos_device_credential_id,shop_id,shop_device_id,staff_id,token_hash,staff_credential_version,expires_at)
 values('50000000-0000-4000-8000-000000603019','10000000-0000-4000-8000-000000603019','20000000-0000-4000-8000-000000603019','30000000-0000-4000-8000-000000603019','sha256:'||repeat('1',64),7,clock_timestamp()+interval '1 hour');
insert into public.pos_sessions(pos_session_id,shop_id,shop_device_id,staff_id,pos_device_credential_id,session_token_hash,staff_credential_version,issued_at,expires_at)
 values('60000000-0000-4000-8000-000000603019','10000000-0000-4000-8000-000000603019','20000000-0000-4000-8000-000000603019','30000000-0000-4000-8000-000000603019','50000000-0000-4000-8000-000000603019','sha256:'||repeat('3',64),7,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '30 minutes');
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create function pg_temp.device_call(adapter boolean,op text,p jsonb) returns jsonb language sql as $$
 select (case when adapter then public.payment_history_device_http_v2('10000000-0000-4000-8000-000000603019','20000000-0000-4000-8000-000000603019','30000000-0000-4000-8000-000000603019','60000000-0000-4000-8000-000000603019','sha256:'||repeat('1',64),'sha256:'||repeat('3',64),7,op,p)
 else public.payment_history_device_v2('10000000-0000-4000-8000-000000603019','20000000-0000-4000-8000-000000603019','30000000-0000-4000-8000-000000603019','60000000-0000-4000-8000-000000603019','sha256:'||repeat('1',64),'sha256:'||repeat('3',64),7,op,p) end)->'result';
$$;

select has_function('public','payment_history_device_http_v2',array['uuid','uuid','uuid','uuid','text','text','integer','text','jsonb'],'HTTP bridge retains the complete actor and content payload');
select ok(not has_function_privilege('anon','public.payment_history_device_http_v2(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb)','EXECUTE'),'HTTP bridge is not anonymous');
select ok(not has_function_privilege('authenticated','public.payment_history_device_http_v2(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb)','EXECUTE'),'HTTP bridge is not exposed to browser users');
select ok(has_function_privilege('service_role','public.payment_history_device_http_v2(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb)','EXECUTE'),'server retains the authenticated boundary');
select ok(not (select prosecdef from pg_proc where oid='public.payment_history_device_http_v2(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb)'::regprocedure),'HTTP error conversion adds no definer privilege');
select is(pg_temp.device_call(true,'authority','{}'),pg_temp.device_call(false,'authority','{}'),'successful result is unchanged by the HTTP bridge');
select throws_ok($$select pg_temp.device_call(false,'local_review',jsonb_build_object('operation_id','e0000000-0000-4000-8000-000000603019','content_digest',repeat('a',64),'ordinal',1))$$,'40001','payment_history_local_review_stale','raw SQL engine retains its original domain error');
select throws_ok($$select pg_temp.device_call(true,'local_review',jsonb_build_object('operation_id','e0000000-0000-4000-8000-000000603019','content_digest',repeat('a',64),'ordinal',1))$$,'PT409','payment_history_local_review_stale','HTTP exposes the same denial without serialization retry');
select set_config('request.jwt.claim.role','authenticated',true);
select throws_ok($$select pg_temp.device_call(true,'local_review','{}')$$,'42501','payment_history_device_denied','original service role gate remains effective');
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok($$select pg_temp.device_call(true,'local_review','{}')$$,'22023','payment_history_operation_invalid','malformed payload cannot become a domain conflict');
select ok((select count(*)=0 from public.payment_history_local_publications where shop_id='10000000-0000-4000-8000-000000603019') and (select count(*)=0 from public.payment_history_receipts where shop_id='10000000-0000-4000-8000-000000603019') and (select count(*)=0 from public.payment_history_movement_versions where shop_id='10000000-0000-4000-8000-000000603019') and (select count(*)=0 from public.pos_sales where shop_id='10000000-0000-4000-8000-000000603019'),'denials create no grants, receipts, economics or native sales');
select * from finish();
rollback;
