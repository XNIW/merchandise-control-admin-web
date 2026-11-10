begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(18);
insert into public.shops(shop_id,shop_code,shop_name,shop_status) values('10000000-0000-4000-8000-000000103019','OWNER019','Synthetic ownership','active');
insert into public.shop_devices(shop_device_id,shop_id,device_identifier,display_name,device_type,status)
 values('20000000-0000-4000-8000-000000103019','10000000-0000-4000-8000-000000103019','SYNTHETIC-OWNER','Synthetic ownership','pos','active');
insert into public.staff_accounts(staff_id,shop_id,staff_code,display_name,role_key,status,credential_kind,credential_hash,credential_updated_at)
 values('30000000-0000-4000-8000-000000103019','10000000-0000-4000-8000-000000103019','TEST-OWNER','Synthetic manager','manager','active','password','argon2id:synthetic-not-a-login',clock_timestamp());
insert into public.payment_history_runtime(shop_id) values('10000000-0000-4000-8000-000000103019');
insert into public.payment_history_uploads(upload_id,shop_id,actor_kind,actor_id,object_key,file_name,file_sha256,byte_length,state,verified_at)
 values('60000000-0000-4000-8000-000000103019','10000000-0000-4000-8000-000000103019','pos_staff_manager','30000000-0000-4000-8000-000000103019','history/10000000-0000-4000-8000-000000103019/60000000-0000-4000-8000-000000103019','synthetic.zip',repeat('a',64),1,'verified',clock_timestamp());
insert into public.payment_history_migration_runs(run_id,shop_id,source_upload_id,actor_kind,actor_id,actor_session_id,request_key,request_digest,state)
 values('70000000-0000-4000-8000-000000103019','10000000-0000-4000-8000-000000103019','60000000-0000-4000-8000-000000103019','pos_staff_manager','30000000-0000-4000-8000-000000103019','80000000-0000-4000-8000-000000103019','90000000-0000-4000-8000-000000103019',repeat('b',64),'applied');
insert into public.payment_history_source_snapshots(snapshot_id,shop_id,shop_device_id,local_dataset_id,data_revision,restore_epoch,archive_sha256,backup_sha256,source_manifest,source_summary,run_id,created_revision)
 values('a0000000-0000-4000-8000-000000103019','10000000-0000-4000-8000-000000103019','20000000-0000-4000-8000-000000103019','synthetic-dataset',1,0,repeat('a',64),repeat('c',64),'{}','{}','70000000-0000-4000-8000-000000103019',1);
insert into public.payment_history_local_writer_contexts values('10000000-0000-4000-8000-000000103019','20000000-0000-4000-8000-000000103019','synthetic-dataset','50000000-0000-4000-8000-000000103019',0,1,'a0000000-0000-4000-8000-000000103019','synthetic verified archive',clock_timestamp());
insert into public.payment_history_evidence(evidence_id,shop_id,kind,verification_level,status,policy_version,reference,scope,actor_kind,actor_id,verified_at)
 values('b0000000-0000-4000-8000-000000103019','10000000-0000-4000-8000-000000103019','merchant_mapping','operator_attested','verified','synthetic','synthetic','{}','pos_staff_manager','30000000-0000-4000-8000-000000103019',clock_timestamp());
insert into public.payment_history_merchants(merchant_id,shop_id,label,evidence_id)
 values('c0000000-0000-4000-8000-000000103019','10000000-0000-4000-8000-000000103019','Synthetic merchant','b0000000-0000-4000-8000-000000103019');
insert into public.payment_history_batches(batch_id,shop_id,origin,apply_operation_id,created_revision) values
 ('d0000000-0000-4000-8000-000000103019','10000000-0000-4000-8000-000000103019','local_migration','d1000000-0000-4000-8000-000000103019',1),
 ('d2000000-0000-4000-8000-000000103019','10000000-0000-4000-8000-000000103019','local_migration','d3000000-0000-4000-8000-000000103019',1);
insert into public.payment_history_movement_versions(movement_version_id,shop_id,merchant_id,external_namespace,external_id,identity_key,economic_digest,business_ticks,business_date,gross_clp,movement_kind,transaction_state,transaction,owner_batch_id,created_revision) values
 ('e0000000-0000-4000-8000-000000103019','10000000-0000-4000-8000-000000103019','c0000000-0000-4000-8000-000000103019','getnet.legacy.transaction','synthetic-base',repeat('d',64),repeat('e',64),637135200000000000,'2020-01-01',1000,'Sale','ABONADO','{}','d0000000-0000-4000-8000-000000103019',1),
 ('e1000000-0000-4000-8000-000000103019','10000000-0000-4000-8000-000000103019','c0000000-0000-4000-8000-000000103019','getnet.legacy.transaction','synthetic-incremental',repeat('f',64),repeat('e',64),637135200000000000,'2020-01-01',1000,'Sale','ABONADO','{}','d2000000-0000-4000-8000-000000103019',1);
insert into public.payment_history_source_objects(shop_id,source_snapshot_id,table_name,local_id,object_digest,original_object)
 values('10000000-0000-4000-8000-000000103019','a0000000-0000-4000-8000-000000103019','batches','baseline',repeat('a',64),'{"apply_operation_id":"d1000000000040008000000000103019"}');
insert into public.payment_history_local_batch_map values('10000000-0000-4000-8000-000000103019','20000000-0000-4000-8000-000000103019','synthetic-dataset','baseline','d0000000-0000-4000-8000-000000103019',repeat('a',64));
insert into public.payment_history_local_movement_map values
 ('10000000-0000-4000-8000-000000103019','20000000-0000-4000-8000-000000103019','synthetic-dataset','9007199254740993','e0000000-0000-4000-8000-000000103019',repeat('e',64),repeat('a',64),true),
 ('10000000-0000-4000-8000-000000103019','20000000-0000-4000-8000-000000103019','synthetic-dataset','2','e0000000-0000-4000-8000-000000103019',repeat('e',64),repeat('a',64),false);
insert into public.payment_history_local_publications(operation_id,shop_id,shop_device_id,server_dataset_id,local_dataset_id,restore_lineage_id,restore_epoch,writer_epoch,operation_kind,request_fingerprint,content_digest,protocol_version,base_revision,page_count)
 select '40000000-0000-4000-8000-000000103019',shop_id,'20000000-0000-4000-8000-000000103019',dataset_id,'synthetic-dataset','50000000-0000-4000-8000-000000103019',0,1,'Apply',repeat('a',64),repeat('b',64),2,1,1 from public.payment_history_runtime where shop_id='10000000-0000-4000-8000-000000103019';
insert into public.payment_history_local_publications(operation_id,shop_id,shop_device_id,server_dataset_id,local_dataset_id,restore_lineage_id,restore_epoch,writer_epoch,operation_kind,request_fingerprint,content_digest,protocol_version,base_revision,page_count,state,grant_id,authorization_staff_id,authorization_credential_version,issued_at,expires_at,local_sequence,local_revision,local_batch_id,local_receipt_json,server_receipt)
 select '41000000-0000-4000-8000-000000103019',shop_id,'20000000-0000-4000-8000-000000103019',dataset_id,'synthetic-dataset','50000000-0000-4000-8000-000000103019',0,1,'Apply',repeat('a',64),repeat('b',64),2,1,1,'committed','42000000-0000-4000-8000-000000103019','30000000-0000-4000-8000-000000103019',1,now(),now()+interval '30 seconds',1,2,'incremental','{}','{"batch_id":"d2000000-0000-4000-8000-000000103019"}' from public.payment_history_runtime where shop_id='10000000-0000-4000-8000-000000103019';
insert into public.payment_history_local_publication_map values
 ('10000000-0000-4000-8000-000000103019','41000000-0000-4000-8000-000000103019',1,'e1000000-0000-4000-8000-000000103019',true),
 ('10000000-0000-4000-8000-000000103019','41000000-0000-4000-8000-000000103019',2,'e0000000-0000-4000-8000-000000103019',false);
create function pg_temp.target(p jsonb default '{}',identity text default repeat('d',64),op uuid default '40000000-0000-4000-8000-000000103019') returns uuid language sql as $$
 select app_private.payment_history_local_correction_target_v2(op,jsonb_build_object('source_file_id','synthetic','source_sheet','synthetic','source_row','2','previous_transaction_id','9007199254740993','previous_local_batch_id','baseline','previous_apply_operation_id','d1000000-0000-4000-8000-000000103019','previous_economic_digest',repeat('e',64),'proposed_economic_digest',repeat('f',64),'context_fingerprint',repeat('c',64),'evidence_reference','synthetic','approval_fingerprint',repeat('d',64))||p,identity);$$;
select ok(not has_function_privilege('service_role','app_private.payment_history_local_correction_target_v2(uuid,jsonb,text)','EXECUTE'),'owner resolution is not a public authorization bypass');
select is(pg_temp.target(),'e0000000-0000-4000-8000-000000103019'::uuid,'verified baseline resolves exact owner beyond JS integer range');
select throws_ok($$select pg_temp.target('{"previous_local_batch_id":"foreign"}')$$,'40001','payment_history_local_correction_owner_unverified','local row alone cannot borrow a batch');
select throws_ok($$select pg_temp.target('{"previous_apply_operation_id":"d3000000-0000-4000-8000-000000103019"}')$$,'40001','payment_history_local_correction_owner_unverified','baseline Apply must match its original attestation');
select throws_ok($$select pg_temp.target('{"previous_transaction_id":"2"}')$$,'40001','payment_history_local_correction_owner_unverified','a baseline duplicate owns no version');
select throws_ok($$select pg_temp.target('{"previous_transaction_id":"1"}')$$,'40001','payment_history_local_correction_owner_unverified','an unrecognized local row cannot borrow the identity');
select throws_ok($$select pg_temp.target(identity=>repeat('f',64))$$,'40001','payment_history_local_correction_owner_unverified','canonical identity must match the incoming correction');
select throws_ok($$select pg_temp.target('{"previous_economic_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}')$$,'40001','payment_history_local_correction_owner_unverified','stale economics cannot be superseded');
select throws_ok($$select pg_temp.target(op=>'40000000-0000-4000-8000-000000103020')$$,'40001','payment_history_local_preparation_stale','an unknown preparation has no correction authority');
select throws_ok($$select pg_temp.target('{"previous_transaction_id":"0"}')$$,'22023','payment_history_local_correction_owner_invalid','the local provenance row remains positive and canonical');
select is(pg_temp.target('{"previous_local_batch_id":"incremental","previous_apply_operation_id":"41000000-0000-4000-8000-000000103019"}',repeat('f',64)),'e1000000-0000-4000-8000-000000103019'::uuid,'incremental ownership resolves from its committed Apply and canonical identity');
select throws_ok($$select pg_temp.target('{"previous_local_batch_id":"incremental","previous_apply_operation_id":"41000000-0000-4000-8000-000000103019"}')$$,'40001','payment_history_local_correction_owner_unverified','incremental duplicate-only observation cannot acquire another batch');
select throws_ok($$select pg_temp.target('{"previous_local_batch_id":"baseline","previous_apply_operation_id":"41000000-0000-4000-8000-000000103019"}',repeat('f',64))$$,'40001','payment_history_local_correction_owner_unverified','incremental receipt cannot be renamed to a different local batch');
update public.payment_history_local_writer_contexts set restore_lineage_id='50000000-0000-4000-8000-000000103020' where shop_id='10000000-0000-4000-8000-000000103019';
select throws_ok($$select pg_temp.target()$$,'40001','payment_history_local_context_unverified','an old preparation cannot borrow a restored context');
update public.payment_history_local_writer_contexts set restore_lineage_id='50000000-0000-4000-8000-000000103019' where shop_id='10000000-0000-4000-8000-000000103019';
update public.payment_history_movement_versions set active=false where movement_version_id='e0000000-0000-4000-8000-000000103019';
select throws_ok($$select pg_temp.target()$$,'40001','payment_history_local_correction_owner_unverified','a superseded canonical version cannot be corrected again');
select is((select count(*) from public.payment_history_receipts where shop_id='10000000-0000-4000-8000-000000103019'),0::bigint,'ownership lookup creates no economic receipt');
select is((select count(*) from public.pos_sales where shop_id='10000000-0000-4000-8000-000000103019'),0::bigint,'ownership lookup creates no native sale');
select is((select count(*) from public.payment_history_movement_versions where shop_id='10000000-0000-4000-8000-000000103019'),2::bigint,'lookup creates no canonical movements');
select * from finish();
rollback;
