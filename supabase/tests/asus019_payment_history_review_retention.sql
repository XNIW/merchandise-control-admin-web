begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(39);
create temp table review_context(key text primary key,value jsonb);
grant all on review_context to service_role;
insert into public.shops(shop_id,shop_code,shop_name,shop_status) values('10000000-0000-4000-8000-000000023019','TRANSFER019','Synthetic transfer','active');
insert into public.staff_accounts(staff_id,shop_id,staff_code,display_name,role_key,status,credential_kind,credential_hash,credential_updated_at,credential_expires_at,must_change_credential,credential_version,credential_status)
 values('30000000-0000-4000-8000-000000023019','10000000-0000-4000-8000-000000023019','1001','Synthetic transfer admin','pos_admin','active','password','argon2id:synthetic-not-a-login',clock_timestamp(),clock_timestamp()+interval '1 hour',false,7,'active');
insert into public.staff_role_permissions(shop_id,role_key,permission_key,enabled) values('10000000-0000-4000-8000-000000023019','pos_admin','shop_admin.full_access',true) on conflict(shop_id,role_key,permission_key) do update set enabled=true;
insert into public.staff_web_sessions(staff_web_session_id,shop_id,staff_id,session_token_hash,staff_credential_version,status,issued_at,expires_at)
 values('40000000-0000-4000-8000-000000023019','10000000-0000-4000-8000-000000023019','30000000-0000-4000-8000-000000023019','sha256:'||repeat('a',64),7,'active',now()-interval '1 minute',now()+interval '1 hour');
insert into public.shop_devices(shop_device_id,shop_id,device_identifier,display_name,device_type,status) values('20000000-0000-4000-8000-000000023019','10000000-0000-4000-8000-000000023019','SYNTHETIC-TRANSFER-DEVICE','Synthetic device','pos','active');
insert into public.pos_device_credentials(pos_device_credential_id,shop_id,shop_device_id,staff_id,token_hash,staff_credential_version,expires_at)
 values('50000000-0000-4000-8000-000000023019','10000000-0000-4000-8000-000000023019','20000000-0000-4000-8000-000000023019','30000000-0000-4000-8000-000000023019','sha256:'||repeat('b',64),7,clock_timestamp()+interval '1 hour');
insert into public.pos_sessions(pos_session_id,shop_id,shop_device_id,staff_id,pos_device_credential_id,session_token_hash,staff_credential_version,issued_at,expires_at)
 values('60000000-0000-4000-8000-000000023019','10000000-0000-4000-8000-000000023019','20000000-0000-4000-8000-000000023019','30000000-0000-4000-8000-000000023019','50000000-0000-4000-8000-000000023019','sha256:'||repeat('c',64),7,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '30 minutes');
create function pg_temp.device(op text,payload jsonb default '{}') returns jsonb language sql as $$select public.payment_history_device_v1('10000000-0000-4000-8000-000000023019','20000000-0000-4000-8000-000000023019','30000000-0000-4000-8000-000000023019','60000000-0000-4000-8000-000000023019','sha256:'||repeat('b',64),'sha256:'||repeat('c',64),7,op,payload)->'result';$$;
insert into auth.users(instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000023019','authenticated','authenticated','review019@example.invalid','{}','{}',now(),now());
insert into public.profiles(profile_id,display_name,profile_status) values('00000000-0000-4000-8000-000000023019','Synthetic review owner','active') on conflict(profile_id) do update set profile_status='active',disabled_at=null;
insert into public.shop_members(profile_id,shop_id,role_key,membership_status) values('00000000-0000-4000-8000-000000023019','10000000-0000-4000-8000-000000023019','shop_owner','active');
insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values('00000000-0000-4000-8000-000000033019','00000000-0000-4000-8000-000000023019',now(),now(),now()+interval '1 hour');
insert into public.payment_history_jobs(job_id,shop_id,actor_kind,actor_id,actor_session_id,request_key,request_digest,parser_version,configuration,source_upload_ids)
 values('80000000-0000-4000-8000-000000023019','10000000-0000-4000-8000-000000023019','personal_account','00000000-0000-4000-8000-000000023019','00000000-0000-4000-8000-000000033019',gen_random_uuid(),repeat('a',64),'getnet-ooxml-web-v1','{}',array[gen_random_uuid()]);
create function pg_temp.current_actor() returns boolean language sql as $$select app_private.payment_history_job_actor_current_v1(j) from public.payment_history_jobs j where job_id='80000000-0000-4000-8000-000000023019';$$;
select ok(pg_temp.current_actor(),'active personal profile with live session and membership is current');
update public.profiles set profile_status='review' where profile_id='00000000-0000-4000-8000-000000023019';
select ok(not pg_temp.current_actor(),'non-active profile is rejected even without disabled_at');
set local role service_role;
set local request.jwt.claims='{"role":"service_role"}';
select is(public.payment_history_worker_v1('claim','{}')->'job','null'::jsonb,'claim refuses a non-active personal profile');
set local role postgres;
select is((select error_code from public.payment_history_jobs where job_id='80000000-0000-4000-8000-000000023019'),'history_actor_revoked','claim closes revoked work without staging');
update public.profiles set profile_status='active',disabled_at=null where profile_id='00000000-0000-4000-8000-000000023019';
update public.payment_history_jobs set state='queued',error_code=null where job_id='80000000-0000-4000-8000-000000023019';
set local role service_role;
insert into review_context values('lease',public.payment_history_worker_v1('claim','{}')->'job');
select is((select value->>'job_id' from review_context where key='lease'),'80000000-0000-4000-8000-000000023019','reactivated actor can obtain a fenced worker lease');
set local role postgres;
update public.profiles set profile_status='disabled',disabled_at=clock_timestamp() where profile_id='00000000-0000-4000-8000-000000023019';
select ok(not pg_temp.current_actor(),'disabled profile with timestamp is rejected');
insert into public.payment_history_jobs(job_id,shop_id,actor_kind,actor_id,actor_session_id,request_key,request_digest,parser_version,configuration,source_upload_ids)
 select '80000000-0000-4000-8000-000000043019',shop_id,actor_kind,actor_id,actor_session_id,gen_random_uuid(),request_digest,parser_version,configuration,source_upload_ids
 from public.payment_history_jobs where job_id='80000000-0000-4000-8000-000000023019';
set local role service_role;
select is(public.payment_history_worker_v1('claim','{}')->'job','null'::jsonb,'disabled personal profile cannot claim another queued job');
set local role postgres;
select is((select error_code from public.payment_history_jobs where job_id='80000000-0000-4000-8000-000000043019'),'history_actor_revoked','disabled queued job is explicitly closed');
select ok(exists(select 1 from auth.sessions where id='00000000-0000-4000-8000-000000033019' and not_after>clock_timestamp()) and exists(select 1 from public.shop_members where profile_id='00000000-0000-4000-8000-000000023019' and membership_status='active'),'profile revocation does not rely on deleting the session or membership');
set local role service_role;
select throws_ok($$select public.payment_history_worker_v1('stage',(select value||'{"rows":[]}' from review_context where key='lease'))$$,'42501','payment_history_actor_revoked','disabled actor cannot stage, before row validation');
select throws_ok($$select public.payment_history_worker_v1('finish',(select value from review_context where key='lease'))$$,'42501','payment_history_actor_revoked','disabled actor cannot finish analysis');
select throws_ok($$select public.payment_history_worker_v1('heartbeat',(select value from review_context where key='lease'))$$,'42501','payment_history_actor_revoked','disabled actor cannot extend a worker lease');
set local role postgres;
select is((select processed_rows from public.payment_history_jobs where job_id='80000000-0000-4000-8000-000000023019'),0,'revoked worker staged no source rows');
select is((select state from public.payment_history_jobs where job_id='80000000-0000-4000-8000-000000023019'),'analysing','rejected finish cannot publish review-ready analysis');
update public.profiles set profile_status='active',disabled_at=null where profile_id='00000000-0000-4000-8000-000000023019';
-- This is the state transition performed by platform_revoke_shop_member.
update public.shop_members set membership_status='suspended',suspended_at=clock_timestamp() where profile_id='00000000-0000-4000-8000-000000023019';
select ok(not pg_temp.current_actor(),'membership suspension independently revokes the worker actor');
update public.shop_members set membership_status='active',suspended_at=null where profile_id='00000000-0000-4000-8000-000000023019';
update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='00000000-0000-4000-8000-000000033019';
select ok(not pg_temp.current_actor(),'session expiry independently revokes the worker actor');
update auth.sessions set not_after=clock_timestamp()+interval '1 hour' where id='00000000-0000-4000-8000-000000033019';
select ok(pg_temp.current_actor(),'restoring all current actor conditions reopens only the analysis lease');
update public.payment_history_jobs set state='cancelled' where job_id='80000000-0000-4000-8000-000000023019';

select ok(not has_function_privilege('service_role','app_private.payment_history_replica_cleanup_v1(uuid,uuid,integer)','EXECUTE'),'worker key cannot directly invoke internal cleanup');
select throws_ok($$select app_private.payment_history_replica_cleanup_v1(null,null,5001)$$,'22023','payment_history_cleanup_limit','cleanup rejects an unbounded budget');
select throws_ok($$select app_private.payment_history_replica_cleanup_v1('10000000-0000-4000-8000-000000023019',null,2)$$,'22023','payment_history_cleanup_limit','cleanup requires a complete device scope');
insert into public.payment_history_runtime(shop_id) values('10000000-0000-4000-8000-000000023019');
set local role service_role;
insert into review_context values('snapshot',pg_temp.device('snapshot_start',jsonb_build_object('request_key','70000000-0000-4000-8000-000000023019','page_size',1)));
insert into review_context values('page',pg_temp.device('page',(select jsonb_build_object('cursor',value->>'cursor') from review_context where key='snapshot')));
select is(pg_temp.device('snapshot_start','{"request_key":"70000000-0000-4000-8000-000000023019","page_size":1}'),(select value from review_context where key='snapshot'),'live snapshot start replays the same cursor after response loss');

insert into review_context values('authority',pg_temp.device('authority'));
insert into review_context values('delta_payload',(select jsonb_build_object('revision',value->>'revision','dataset_id',value->>'dataset_id','writer_epoch',value->>'writer_epoch','page_size',2) from review_context where key='authority'));
insert into review_context values('delta',pg_temp.device('delta_start',(select value from review_context where key='delta_payload')));
select is(pg_temp.device('delta_start',(select value from review_context where key='delta_payload')),(select value from review_context where key='delta'),'identical zero-row delta starts reuse one live root');
set local role postgres;
insert into public.payment_history_replica_acks(shop_id,shop_device_id,dataset_id,revision,writer_epoch,checksum,protocol_version,client_build_sha)
 select shop_id,'20000000-0000-4000-8000-000000023019',dataset_id,revision,writer_epoch,repeat('a',64),1,repeat('a',40) from public.payment_history_runtime where shop_id='10000000-0000-4000-8000-000000023019';
insert into public.payment_history_replica_events(shop_id,revision,ordinal,entity_kind,entity_id,entity_digest,payload) values('10000000-0000-4000-8000-000000023019',0,1,'batch',gen_random_uuid(),repeat('a',64),'{}');
insert into public.payment_history_replica_snapshots(snapshot_id,shop_id,shop_device_id,dataset_id,revision,writer_epoch,movement_count,batch_count,request_key,checksum,expires_at)
 select '90000000-0000-4000-8000-000000023019',shop_id,'20000000-0000-4000-8000-000000023019',dataset_id,0,writer_epoch,4,0,gen_random_uuid(),repeat('a',64),clock_timestamp()-interval '1 minute' from public.payment_history_runtime where shop_id='10000000-0000-4000-8000-000000023019';
insert into public.payment_history_replica_snapshot_rows(shop_id,snapshot_id,ordinal,entity_kind,entity_id,entity_digest,payload)
 select '10000000-0000-4000-8000-000000023019','90000000-0000-4000-8000-000000023019',i,'movement',gen_random_uuid(),repeat('a',64),'{}' from generate_series(1,4) i;
insert into public.payment_history_replica_cursors(shop_id,shop_device_id,mode,snapshot_id,dataset_id,writer_epoch,target_revision,next_revision,next_ordinal,page_size,target_checksum,target_movements,target_batches,expires_at)
 select shop_id,shop_device_id,'snapshot',snapshot_id,dataset_id,writer_epoch,revision,0,0,2,checksum,4,0,clock_timestamp()-interval '1 minute' from public.payment_history_replica_snapshots where snapshot_id='90000000-0000-4000-8000-000000023019';
insert into review_context values('gc',app_private.payment_history_replica_cleanup_v1('10000000-0000-4000-8000-000000023019','20000000-0000-4000-8000-000000023019',2));
select is((select (value->>'cursors')::int+(value->>'rows')::int from review_context where key='gc'),2,'one cleanup consumes at most its explicit cursor and row budget');
select is((select count(*) from public.payment_history_replica_snapshot_rows where snapshot_id='90000000-0000-4000-8000-000000023019'),3::bigint,'partial cleanup preserves remaining rows for the next bounded call');
select is((select count(*) from public.payment_history_replica_snapshots where snapshot_id='90000000-0000-4000-8000-000000023019'),1::bigint,'metadata survives until all dependent rows are removed');
select is(app_private.payment_history_replica_cleanup_v1('10000000-0000-4000-8000-000000023019','ffffffff-ffff-4fff-8fff-ffffffffffff',2)->>'rows','0','another device cannot consume this device temporary rows');
insert into review_context values('gc2',app_private.payment_history_replica_cleanup_v1('10000000-0000-4000-8000-000000023019','20000000-0000-4000-8000-000000023019',5));
select is((select count(*) from public.payment_history_replica_snapshots where snapshot_id='90000000-0000-4000-8000-000000023019'),0::bigint,'subsequent bounded cleanup completes expired snapshot reclamation');
select is((select count(*) from public.payment_history_replica_acks where shop_id='10000000-0000-4000-8000-000000023019'),1::bigint,'permanent convergence acknowledgement is retained');
select is((select count(*) from public.payment_history_replica_events where shop_id='10000000-0000-4000-8000-000000023019'),1::bigint,'immutable financial change event is retained');
set local role service_role;
select is(pg_temp.device('page',(select jsonb_build_object('cursor',value->>'cursor') from review_context where key='snapshot')),(select value from review_context where key='page'),'cleanup preserves live page response replay');
-- Expired metadata with a still-live cursor must not lose its rows.
set local role postgres;
update public.payment_history_replica_snapshots set expires_at=clock_timestamp()-interval '1 second' where request_key='70000000-0000-4000-8000-000000023019';
insert into public.payment_history_replica_snapshot_rows(shop_id,snapshot_id,ordinal,entity_kind,entity_id,entity_digest,payload)
 select shop_id,snapshot_id,1,'movement',gen_random_uuid(),repeat('a',64),'{}' from public.payment_history_replica_snapshots where request_key='70000000-0000-4000-8000-000000023019';
insert into review_context values('gc3',app_private.payment_history_replica_cleanup_v1());
select is((select count(*) from public.payment_history_replica_snapshot_rows r join public.payment_history_replica_snapshots s using(snapshot_id) where s.request_key='70000000-0000-4000-8000-000000023019'),1::bigint,'live cursor protects snapshot rows even when metadata expiry is older');
update public.payment_history_replica_cursors set expires_at=clock_timestamp()-interval '1 second' where snapshot_id=(select snapshot_id from public.payment_history_replica_snapshots where request_key='70000000-0000-4000-8000-000000023019');
set local role service_role;
select lives_ok($$select public.payment_history_worker_gateway_v1(gen_random_uuid(),'import','claim_upload','{}')$$,'idle authenticated worker polling performs bounded maintenance');
set local role postgres;
select is((select count(*) from public.payment_history_replica_snapshots where request_key='70000000-0000-4000-8000-000000023019'),0::bigint,'idle worker eventually reclaims expired rows cursors and metadata');
select is((select count(*) from public.payment_history_replica_cursors where cursor_id=(select (value->>'cursor')::uuid from review_context where key='delta')),1::bigint,'unexpired delta resume remains available during idle maintenance');
set local role service_role;
insert into review_context values('live1',pg_temp.device('snapshot_start','{"request_key":"70000000-0000-4000-8000-000000043019","page_size":1}'));
select lives_ok($$select pg_temp.device('snapshot_start',jsonb_build_object('request_key',gen_random_uuid(),'page_size',1))$$,'second live snapshot is admitted');
select lives_ok($$select pg_temp.device('snapshot_start',jsonb_build_object('request_key',gen_random_uuid(),'page_size',1))$$,'third live snapshot is admitted');
select throws_ok($$select pg_temp.device('snapshot_start',jsonb_build_object('request_key',gen_random_uuid(),'page_size',1))$$,'54000','payment_history_replica_backpressure','snapshot capacity never evicts an unexpired transfer');
select is(pg_temp.device('snapshot_start','{"request_key":"70000000-0000-4000-8000-000000043019","page_size":1}'),(select value from review_context where key='live1'),'quota still permits replay of an existing live snapshot');
set local role postgres;
insert into public.payment_history_replica_cursors(shop_id,shop_device_id,mode,dataset_id,writer_epoch,target_revision,next_revision,next_ordinal,page_size,target_checksum,target_movements,target_batches,expires_at)
 select shop_id,'20000000-0000-4000-8000-000000023019','delta',dataset_id,writer_epoch,revision,0,0,1,repeat('a',64),0,0,clock_timestamp()+interval '1 hour'
 from public.payment_history_runtime cross join generate_series(1,28) where shop_id='10000000-0000-4000-8000-000000023019';
set local role service_role;
select throws_ok($$select pg_temp.device('delta_start',(select value||'{"page_size":3}' from review_context where key='delta_payload'))$$,'54000','payment_history_replica_backpressure','distinct live delta roots also have a finite admission bound');
set local role postgres;
select * from finish();
rollback;
