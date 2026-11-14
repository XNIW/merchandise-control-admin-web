begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(23);
select ok(not has_function_privilege('service_role','app_private.payment_history_migration_stage_vector_v2(jsonb)','EXECUTE'),'vector is admitted only by the signed canonical gateway');
select ok(not has_function_privilege('authenticated','public.payment_history_worker_gateway_v1(uuid,text,text,jsonb)','EXECUTE'),'browser cannot claim worker authority');
insert into public.shops(shop_id,shop_code,shop_name,shop_status) values('10000000-0000-4000-8000-000000593019','VECTOR019','Synthetic staging vector','active');
insert into public.staff_accounts(staff_id,shop_id,staff_code,display_name,role_key,status,credential_kind,credential_hash,credential_updated_at,credential_expires_at,must_change_credential,credential_version,credential_status)
 values('20000000-0000-4000-8000-000000593019','10000000-0000-4000-8000-000000593019','1001','Synthetic delegate','pos_admin','active','password','argon2id:synthetic-not-a-login',clock_timestamp(),null,false,7,'active');
insert into public.staff_role_permissions(shop_id,role_key,permission_key,enabled) values('10000000-0000-4000-8000-000000593019','pos_admin','shop_admin.full_access',true);
insert into public.payment_history_role_permissions(shop_id,role_key,capability,enabled) values('10000000-0000-4000-8000-000000593019','pos_admin','migrate',true);
insert into public.staff_web_sessions(staff_web_session_id,shop_id,staff_id,session_token_hash,staff_credential_version,status,issued_at,expires_at)
 values('30000000-0000-4000-8000-000000593019','10000000-0000-4000-8000-000000593019','20000000-0000-4000-8000-000000593019','sha256:'||repeat('a',64),7,'active',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour');
insert into public.payment_history_uploads(upload_id,shop_id,actor_kind,actor_id,object_key,file_name,file_sha256,byte_length,state,verified_at) values
 ('40000000-0000-4000-8000-000000593019','10000000-0000-4000-8000-000000593019','pos_staff_manager','20000000-0000-4000-8000-000000593019','history/10000000-0000-4000-8000-000000593019/40000000-0000-4000-8000-000000593019','synthetic.w7history.zip',repeat('b',64),100,'verified',clock_timestamp());
insert into public.payment_history_migration_runs(run_id,shop_id,source_upload_id,actor_kind,actor_id,actor_session_id,actor_credential_version,request_key,request_digest,state,lease_token,lease_fence,lease_expires_at,attempt_started_at,attempts)
 values('50000000-0000-4000-8000-000000593019','10000000-0000-4000-8000-000000593019','40000000-0000-4000-8000-000000593019','pos_staff_manager','20000000-0000-4000-8000-000000593019','30000000-0000-4000-8000-000000593019',7,gen_random_uuid(),repeat('c',64),'analysing','60000000-0000-4000-8000-000000593019',1,clock_timestamp()+interval '120 seconds',clock_timestamp(),1);
create function pg_temp.vector(first_ordinal integer,row_count integer) returns jsonb language sql as $$
 select jsonb_build_object('run_id','50000000-0000-4000-8000-000000593019','lease_token','60000000-0000-4000-8000-000000593019','lease_fence','1','phase','stage_objects','chunks',
  (select jsonb_agg(jsonb_build_object('rows',rows) order by chunk) from(select (n-first_ordinal)/200 chunk,
   jsonb_agg(jsonb_build_object('table','scopes','ordinal',n,'sourceOrdinal',n,'line',jsonb_build_object('id','scope-'||n,'reference','Synthetic exact source')::text) order by n) rows
   from generate_series(first_ordinal,first_ordinal+row_count-1) n group by (n-first_ordinal)/200) x));
$$;
create function pg_temp.stage(req uuid,p jsonb) returns jsonb language sql as $$select public.payment_history_worker_gateway_v1(req,'migration','stage_vector_v2',p);$$;
create temp table vector_context(key text primary key,value jsonb);grant all on vector_context to service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
insert into vector_context values('payload',pg_temp.vector(1,400));
insert into vector_context values('ack',pg_temp.stage('70000000-0000-4000-8000-000000593019',(select value from vector_context where key='payload')));
select is((select value->>'accepted_chunks' from vector_context where key='ack'),'2','one vector admits two canonical sub-batches');
select is((select value->>'last_ordinal' from vector_context where key='ack'),'400','ACK names only the final committed ordinal');
select is((select value->>'phase' from vector_context where key='ack'),'stage_objects','phase is bound and never inferred from chunk contents');
select ok((select jsonb_typeof(value->'sql_elapsed_ms')='number' and (value->>'sql_elapsed_ms')::numeric>=0 from vector_context where key='ack'),'SQL execution and lock duration is a redacted numeric metric');
select is(pg_temp.stage('70000000-0000-4000-8000-000000593019',(select value from vector_context where key='payload')),(select value from vector_context where key='ack'),'lost-ACK replay returns the identical cached decision and original SQL timing');
select throws_ok($$select pg_temp.stage('70000000-0000-4000-8000-000000593019',pg_temp.vector(401,1))$$,'23505','payment_history_idempotency_conflict','a nonce cannot be reused for different vector content');
select throws_ok($$select pg_temp.stage(gen_random_uuid(),pg_temp.vector(401,801))$$,'22023','payment_history_stage_vector_invalid','a vector never exceeds four sub-batches');
select throws_ok($$select pg_temp.stage(gen_random_uuid(),jsonb_set(pg_temp.vector(401,201),'{chunks,1,rows,0,ordinal}','999'))$$,'22023','payment_history_local_object_invalid','a stale later ordinal rolls back the entire vector');
select throws_ok($$select pg_temp.stage(gen_random_uuid(),jsonb_set(pg_temp.vector(401,1),'{phase}','"finish"'))$$,'22023','payment_history_stage_vector_invalid','finish cannot be mixed into a staging vector');
select throws_ok($$select pg_temp.stage(gen_random_uuid(),jsonb_set(pg_temp.vector(401,1),'{chunks,0,phase}','"stage_movements"'))$$,'22023','payment_history_stage_vector_invalid','sub-batch phase overrides are closed');
select throws_ok($$select pg_temp.stage(gen_random_uuid(),jsonb_set(pg_temp.vector(401,1),'{lease_fence}','"0"'))$$,'22023','payment_history_stage_vector_invalid','invalid vector fence cannot reach the v1 engine');
select throws_ok($$select pg_temp.stage(gen_random_uuid(),jsonb_set(pg_temp.vector(401,1),'{lease_fence}','"2"'))$$,'40001','payment_history_worker_fence_stale','a syntactically valid stale fence is rejected');
set local role postgres;
select is((select count(*) from public.payment_history_migration_objects where run_id='50000000-0000-4000-8000-000000593019'),400::bigint,'no prefix from a failed vector was published');
select is((select processed_objects from public.payment_history_migration_runs where run_id='50000000-0000-4000-8000-000000593019'),400,'the durable checkpoint advances only after atomic success');
select is((select count(*) from public.payment_history_worker_requests where request_id='70000000-0000-4000-8000-000000593019'),1::bigint,'exact retry uses one canonical replay record');
select is((select count(*) from public.payment_history_batches where shop_id='10000000-0000-4000-8000-000000593019'),0::bigint,'staging does not apply a financial batch');
update public.payment_history_migration_runs set attempt_started_at=clock_timestamp()-interval '121 seconds',lease_expires_at=clock_timestamp()+interval '120 seconds' where run_id='50000000-0000-4000-8000-000000593019';
set local role service_role;
select throws_ok($$select pg_temp.stage(gen_random_uuid(),pg_temp.vector(401,1))$$,'40001','payment_history_worker_deadline_exceeded','a renewed lease does not reset the absolute120second attempt budget');
set local role postgres;
update public.payment_history_migration_runs set attempt_started_at=clock_timestamp() where run_id='50000000-0000-4000-8000-000000593019';
update public.payment_history_role_permissions set enabled=false where shop_id='10000000-0000-4000-8000-000000593019' and capability='migrate';
set local role service_role;
select throws_ok($$select pg_temp.stage(gen_random_uuid(),pg_temp.vector(401,1))$$,'42501','payment_history_actor_revoked','grant revocation is rechecked by each unchanged v1 engine');
set local role postgres;
select is((select processed_objects from public.payment_history_migration_runs where run_id='50000000-0000-4000-8000-000000593019'),400,'revocation does not advance the stored ordinal');
update public.payment_history_role_permissions set enabled=true where shop_id='10000000-0000-4000-8000-000000593019' and capability='migrate';
set local role service_role;
select lives_ok($$select public.payment_history_migration_worker_v1('stage_objects',(pg_temp.vector(401,1)-array['phase','chunks'])||jsonb_build_object('rows',pg_temp.vector(401,1)#>'{chunks,0,rows}'))$$,'old Worker retains the unchanged single-sub-batch operation');
set local role postgres;
select is((select processed_objects from public.payment_history_migration_runs where run_id='50000000-0000-4000-8000-000000593019'),401,'old and v2 transport share one canonical checkpoint');
select * from finish();
rollback;
