begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(20);
select ok(not has_function_privilege('anon','app_private.payment_history_bind_local_baseline_v2(uuid,uuid,uuid,text,bigint,bigint,uuid,bigint)','EXECUTE'),'baseline binding is not anonymous');
select ok(not has_function_privilege('authenticated','app_private.payment_history_bind_local_baseline_v2(uuid,uuid,uuid,text,bigint,bigint,uuid,bigint)','EXECUTE'),'baseline binding is not a browser API');
select ok(not has_function_privilege('service_role','app_private.payment_history_bind_local_baseline_v2(uuid,uuid,uuid,text,bigint,bigint,uuid,bigint)','EXECUTE'),'partial protocol is not exposed to service_role');
insert into public.shops(shop_id,shop_code,shop_name,shop_status) values('10000000-0000-4000-8000-000000113019','BASELINE019','Synthetic baseline','active');
insert into public.shop_devices(shop_device_id,shop_id,device_identifier,display_name,device_type,status)
 values('20000000-0000-4000-8000-000000113019','10000000-0000-4000-8000-000000113019','SYNTHETIC-BASELINE','Synthetic baseline','pos','active');
insert into public.payment_history_runtime(shop_id) values('10000000-0000-4000-8000-000000113019');
insert into public.payment_history_uploads(upload_id,shop_id,actor_kind,actor_id,object_key,file_name,file_sha256,byte_length,state,verified_at)
 values('60000000-0000-4000-8000-000000113019','10000000-0000-4000-8000-000000113019','pos_staff_manager','30000000-0000-4000-8000-000000113019','history/10000000-0000-4000-8000-000000113019/60000000-0000-4000-8000-000000113019','synthetic.w7history.zip',repeat('a',64),1,'verified',clock_timestamp());
insert into public.payment_history_migration_runs(run_id,shop_id,source_upload_id,actor_kind,actor_id,actor_session_id,request_key,request_digest,state,manifest,summary,receipt)
 values('70000000-0000-4000-8000-000000113019','10000000-0000-4000-8000-000000113019','60000000-0000-4000-8000-000000113019','pos_staff_manager','30000000-0000-4000-8000-000000113019','80000000-0000-4000-8000-000000113019','90000000-0000-4000-8000-000000113019',repeat('b',64),'applied',
 jsonb_build_object('schemaVersion','history-local-export-v2','shopId','10000000-0000-4000-8000-000000113019','deviceId','20000000-0000-4000-8000-000000113019','localDatasetId','synthetic-baseline','dataRevision','0','restoreEpoch','0','restoreLineageId','50000000-0000-4000-8000-000000113019','backupSha256',repeat('c',64),'evidenceLevel','legacy_attested'),
 '{"movements":0}',jsonb_build_object('source_snapshot_id','a0000000-0000-4000-8000-000000113019'));
insert into public.payment_history_source_snapshots(snapshot_id,shop_id,shop_device_id,local_dataset_id,data_revision,restore_epoch,archive_sha256,backup_sha256,source_manifest,source_summary,run_id,created_revision)
 select 'a0000000-0000-4000-8000-000000113019',shop_id,'20000000-0000-4000-8000-000000113019','synthetic-baseline',0,0,repeat('a',64),repeat('c',64),manifest,summary,run_id,0
 from public.payment_history_migration_runs where run_id='70000000-0000-4000-8000-000000113019';
create function pg_temp.bind_baseline(p_dataset text default 'synthetic-baseline',p_revision bigint default 0,p_restore bigint default 0,p_lineage uuid default '50000000-0000-4000-8000-000000113019',p_epoch bigint default 1) returns jsonb language sql as $$
 select app_private.payment_history_bind_local_baseline_v2('10000000-0000-4000-8000-000000113019','20000000-0000-4000-8000-000000113019','a0000000-0000-4000-8000-000000113019',p_dataset,p_revision,p_restore,p_lineage,p_epoch);
$$;
select throws_ok($$select pg_temp.bind_baseline(null)$$,'22023','payment_history_local_baseline_invalid','missing expected dataset is rejected');
select throws_ok($$select pg_temp.bind_baseline(p_epoch=>2)$$,'40001','payment_history_local_writer_closed','writer epoch is current and exact');
select throws_ok($$select app_private.payment_history_bind_local_baseline_v2('10000000-0000-4000-8000-000000113019','20000000-0000-4000-8000-000000993019','a0000000-0000-4000-8000-000000113019','synthetic-baseline',0,0,'50000000-0000-4000-8000-000000113019',1)$$,'42501','payment_history_local_baseline_device_denied','another device cannot enroll a copied archive');
select throws_ok($$select pg_temp.bind_baseline(p_lineage=>'50000000-0000-4000-8000-000000993019')$$,'40001','payment_history_local_baseline_unverified','lineage is preserved, not invented');
select throws_ok($$select pg_temp.bind_baseline('another-dataset')$$,'40001','payment_history_local_baseline_unverified','dataset is exact');
select throws_ok($$select pg_temp.bind_baseline(p_revision=>1)$$,'40001','payment_history_local_baseline_unverified','local revision is exact');
select throws_ok($$select pg_temp.bind_baseline(p_restore=>1)$$,'40001','payment_history_local_baseline_unverified','restore epoch is exact');
update public.payment_history_migration_runs set state='review_ready' where run_id='70000000-0000-4000-8000-000000113019';
select throws_ok($$select pg_temp.bind_baseline()$$,'40001','payment_history_local_baseline_unverified','analysis without applied canonical receipt cannot enroll');
update public.payment_history_migration_runs set state='applied' where run_id='70000000-0000-4000-8000-000000113019';
update public.payment_history_uploads set file_sha256=repeat('d',64) where upload_id='60000000-0000-4000-8000-000000113019';
select throws_ok($$select pg_temp.bind_baseline()$$,'40001','payment_history_local_baseline_unverified','verified upload still matches exact archive');
update public.payment_history_uploads set file_sha256=repeat('a',64) where upload_id='60000000-0000-4000-8000-000000113019';
insert into public.payment_history_local_write_grants(shop_id,shop_device_id,writer_epoch,operation_id,issued_at,expires_at)
 values('10000000-0000-4000-8000-000000113019','20000000-0000-4000-8000-000000113019',1,'b0000000-0000-4000-8000-000000113019',clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute');
select throws_ok($$select pg_temp.bind_baseline()$$,'40001','payment_history_local_baseline_outcome_unknown','expired legacy grant is not proof of absent local commit');
delete from public.payment_history_local_write_grants where shop_id='10000000-0000-4000-8000-000000113019';
insert into public.payment_history_local_publications(operation_id,shop_id,shop_device_id,server_dataset_id,local_dataset_id,restore_lineage_id,restore_epoch,writer_epoch,operation_kind,request_fingerprint,content_digest,protocol_version,base_revision,page_count)
 select 'c0000000-0000-4000-8000-000000113019',shop_id,'20000000-0000-4000-8000-000000113019',dataset_id,'synthetic-baseline','50000000-0000-4000-8000-000000113019',0,1,'Apply',repeat('e',64),repeat('f',64),2,0,1 from public.payment_history_runtime where shop_id='10000000-0000-4000-8000-000000113019';
select throws_ok($$select pg_temp.bind_baseline()$$,'40001','payment_history_local_baseline_outcome_unknown','incomplete preparation cannot be replaced by a baseline');
update public.payment_history_local_publications set state='aborted' where operation_id='c0000000-0000-4000-8000-000000113019';
select is(pg_temp.bind_baseline()->>'state','baseline_verified','verified applied v2 source establishes context');
select is(pg_temp.bind_baseline()->>'restore_lineage_id','50000000-0000-4000-8000-000000113019','exact replay preserves lineage');
select is((select count(*)::integer from public.payment_history_local_writer_contexts where shop_id='10000000-0000-4000-8000-000000113019'),1,'replay does not create another context');
select is((select count(*)::integer from public.payment_history_movement_versions where shop_id='10000000-0000-4000-8000-000000113019'),0,'binding cannot create financial movements');
update public.payment_history_local_writer_contexts set local_revision=1 where shop_id='10000000-0000-4000-8000-000000113019';
select throws_ok($$select pg_temp.bind_baseline()$$,'40001','payment_history_local_context_reconciliation_required','later local facts cannot be silently rolled back');
select is((select revision::text from public.payment_history_runtime where shop_id='10000000-0000-4000-8000-000000113019'),'0','binding does not publish a global financial revision');
select * from finish();
rollback;
