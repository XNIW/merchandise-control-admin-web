begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(33);
-- Component provenance fixture. Authentication and real CLR/Node baseline
-- ingest are covered separately by device_baseline_pipeline, not simulated here.
insert into public.shops(shop_id,shop_code,shop_name,shop_status) values('10000000-0000-4000-8000-000000203019','PROJECTION019','Synthetic projection','active');
insert into public.shop_devices(shop_device_id,shop_id,device_identifier,display_name,device_type,status) values
 ('20000000-0000-4000-8000-000000203019','10000000-0000-4000-8000-000000203019','SYNTHETIC-PROJECTION-A','Synthetic A','pos','active'),
 ('20000000-0000-4000-8000-000000203020','10000000-0000-4000-8000-000000203019','SYNTHETIC-PROJECTION-B','Synthetic B','pos','active');
insert into public.staff_accounts(staff_id,shop_id,staff_code,display_name,role_key,status,credential_kind,credential_hash,credential_updated_at)
 values('30000000-0000-4000-8000-000000203019','10000000-0000-4000-8000-000000203019','TEST-PROJECTION','Synthetic manager','manager','active','password','argon2id:synthetic-not-a-login',clock_timestamp());
insert into public.payment_history_runtime(shop_id,revision) values('10000000-0000-4000-8000-000000203019',1);
insert into public.payment_history_uploads(upload_id,shop_id,actor_kind,actor_id,object_key,file_name,file_sha256,byte_length,state,verified_at)
 values('60000000-0000-4000-8000-000000203019','10000000-0000-4000-8000-000000203019','pos_staff_manager','30000000-0000-4000-8000-000000203019','history/10000000-0000-4000-8000-000000203019/60000000-0000-4000-8000-000000203019','synthetic.zip',repeat('a',64),1,'verified',clock_timestamp());
create temp table projection_fixture(manifest jsonb,context jsonb);
insert into projection_fixture values
 ('{"schemaVersion":"history-local-export-v2","shopId":"10000000-0000-4000-8000-000000203019","deviceId":"20000000-0000-4000-8000-000000203019","localDatasetId":"synthetic-projection-dataset","dataRevision":"1","restoreEpoch":"0","restoreLineageId":"50000000-0000-4000-8000-000000203019","backupSha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","evidenceLevel":"legacy_attested"}',
  '{"device_id":"20000000-0000-4000-8000-000000203019","local_dataset_id":"synthetic-projection-dataset","data_revision":"1","restore_epoch":"0","restore_lineage_id":"50000000-0000-4000-8000-000000203019","writer_epoch":"1"}');
insert into public.payment_history_migration_runs(run_id,shop_id,source_upload_id,actor_kind,actor_id,actor_session_id,request_key,request_digest,state,manifest,summary,receipt,source_mode,source_context)
 select '70000000-0000-4000-8000-000000203019','10000000-0000-4000-8000-000000203019','60000000-0000-4000-8000-000000203019','pos_staff_manager','30000000-0000-4000-8000-000000203019','80000000-0000-4000-8000-000000203019','90000000-0000-4000-8000-000000203019',repeat('b',64),'applied',manifest,'{}','{"source_snapshot_id":"a0000000-0000-4000-8000-000000203019"}','local_baseline_v2',context from projection_fixture;
insert into public.payment_history_source_snapshots(snapshot_id,shop_id,shop_device_id,local_dataset_id,data_revision,restore_epoch,archive_sha256,backup_sha256,source_manifest,source_summary,run_id,created_revision)
 select 'a0000000-0000-4000-8000-000000203019','10000000-0000-4000-8000-000000203019','20000000-0000-4000-8000-000000203019','synthetic-projection-dataset',1,0,repeat('a',64),repeat('c',64),manifest,'{}','70000000-0000-4000-8000-000000203019',1 from projection_fixture;
select is(app_private.payment_history_bind_local_baseline_v2('10000000-0000-4000-8000-000000203019','20000000-0000-4000-8000-000000203019','a0000000-0000-4000-8000-000000203019','synthetic-projection-dataset',1,0,'50000000-0000-4000-8000-000000203019',1)->>'state','baseline_verified','projection starts from a verified local baseline context');
insert into public.payment_history_source_objects(shop_id,source_snapshot_id,table_name,local_id,object_digest,original_object) values
 ('10000000-0000-4000-8000-000000203019','a0000000-0000-4000-8000-000000203019','batches','baseline',repeat('a',64),'{"id":"baseline","apply_operation_id":"d1000000-0000-4000-8000-000000203019"}'),
 ('10000000-0000-4000-8000-000000203019','a0000000-0000-4000-8000-000000203019','movements','9007199254740993',repeat('b',64),'{"id":"9007199254740993","batch_id":"baseline","merchant_scope_id":"scope-a","external_namespace":"getnet.legacy.transaction","external_id":"exact-019","business_ticks":"638423827330000001","signed_amount_clp":"1200","signed_fee_clp":"20","signed_fee_vat_clp":null,"signed_net_clp":"1180","movement_kind":"Sale","state":"Abonado","is_active":"1"}');
create function pg_temp.publication(n integer,kind text,batch text,seq bigint,device uuid default '20000000-0000-4000-8000-000000203019',status text default 'committed') returns uuid language plpgsql as $$
declare op uuid:=('41000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;begin
 insert into public.payment_history_local_publications(operation_id,shop_id,shop_device_id,server_dataset_id,local_dataset_id,restore_lineage_id,restore_epoch,writer_epoch,operation_kind,request_fingerprint,content_digest,protocol_version,base_revision,page_count,state,grant_id,authorization_staff_id,authorization_credential_version,issued_at,expires_at,local_sequence,local_revision,local_batch_id,local_receipt_json,server_receipt)
 select op,r.shop_id,device,r.dataset_id,'synthetic-projection-dataset','50000000-0000-4000-8000-000000203019',0,1,kind,repeat('d',64),repeat('e',64),2,1,1,status,
  case when status='preparing' then null else op end,case when status='preparing' then null else '30000000-0000-4000-8000-000000203019'::uuid end,
  case when status='preparing' then null else 1 end,case when status='preparing' then null else clock_timestamp() end,case when status='preparing' then null else clock_timestamp()+interval '30 seconds' end,
  seq,seq,batch,case when status='committed' then '{}' else null end,case when status='committed' then '{}'::jsonb else null end
 from public.payment_history_runtime r where shop_id='10000000-0000-4000-8000-000000203019';return op;
end;$$;
do $$begin perform pg_temp.publication(1,'Apply',null,null,status=>'preparing');end;$$;
create function pg_temp.projection(scope text default 'scope-a',ns text default 'getnet.legacy.transaction',id text default 'exact-019') returns jsonb language sql as $$
 select app_private.payment_history_local_projection_v2('41000000-0000-4000-8000-000000000001',scope,ns,id);
$$;
select ok(not has_function_privilege('service_role','app_private.payment_history_local_projection_v2(uuid,text,text,text)','EXECUTE'),'device boundary cannot call an incomplete projection');
select ok(not has_function_privilege('authenticated','app_private.payment_history_local_economic_conflict_v2(jsonb,jsonb)','EXECUTE'),'local comparison remains private');
select is(pg_temp.projection()->>'local_transaction_id','9007199254740993','baseline local ID remains exact beyond JS safe integer');
select is(pg_temp.projection()#>>'{economics,businessTicks}','638423827330000001','baseline commercial time retains its final 100ns digit');
select is(pg_temp.projection()#>>'{economics,grossClp}','1200','economics come from immutable original source');
select is(pg_temp.projection()->>'active','true','baseline starts locally active');
select is(pg_temp.projection('foreign'),null::jsonb,'another local scope is not a local duplicate');
select is(pg_temp.projection(ns=>'getnet.financial.movement'),null::jsonb,'namespace is part of local identity');
select is(pg_temp.projection(id=>'EXACT-019'),null::jsonb,'external identity is case sensitive');
select throws_ok($$select pg_temp.projection(null)$$,'22023','payment_history_local_projection_invalid','missing scope cannot authorize a projection');
select ok(not app_private.payment_history_local_economic_conflict_v2(pg_temp.projection()->'economics',(pg_temp.projection()->'economics')||'{"netClp":null}'),'missing optional net is unknown in local comparison');
select ok(app_private.payment_history_local_economic_conflict_v2(pg_temp.projection()->'economics',(pg_temp.projection()->'economics')||'{"netClp":"1179"}'),'different known net is a local economic conflict');
select ok(app_private.payment_history_local_economic_conflict_v2(pg_temp.projection()->'economics',(pg_temp.projection()->'economics')||'{"businessTicks":"638423827330000002"}'),'100ns commercial time difference is not hidden');
select ok(app_private.payment_history_local_economic_conflict_v2(pg_temp.projection()->'economics',null),'missing economics fails closed');
do $$begin perform pg_temp.publication(2,'Undo','baseline',1);end;$$;
select is(pg_temp.projection()->>'active','false','committed own Undo changes derived local activity');
-- A canonical version may already belong to another device/batch. The map
-- records local insertion separately from canonical ownership.
insert into public.payment_history_evidence(evidence_id,shop_id,kind,verification_level,status,policy_version,reference,scope,actor_kind,actor_id,verified_at)
 values('b0000000-0000-4000-8000-000000203019','10000000-0000-4000-8000-000000203019','merchant_mapping','operator_attested','verified','synthetic','synthetic','{}','pos_staff_manager','30000000-0000-4000-8000-000000203019',clock_timestamp());
insert into public.payment_history_merchants(merchant_id,shop_id,label,evidence_id)
 values('c0000000-0000-4000-8000-000000203019','10000000-0000-4000-8000-000000203019','Synthetic canonical merchant','b0000000-0000-4000-8000-000000203019');
insert into public.payment_history_batches(batch_id,shop_id,origin,apply_operation_id,created_revision)
 values('d0000000-0000-4000-8000-000000203019','10000000-0000-4000-8000-000000203019','local_migration','d2000000-0000-4000-8000-000000203019',1);
insert into public.payment_history_movement_versions(movement_version_id,shop_id,merchant_id,external_namespace,external_id,identity_key,economic_digest,business_ticks,business_date,gross_clp,movement_kind,transaction_state,transaction,owner_batch_id,created_revision,active)
 values('e0000000-0000-4000-8000-000000203019','10000000-0000-4000-8000-000000203019','c0000000-0000-4000-8000-000000203019','getnet.legacy.transaction','exact-019',repeat('f',64),repeat('b',64),638423827330000001,'2024-02-01',2600,'Sale','ABONADO','{}','d0000000-0000-4000-8000-000000203019',1,false);
do $$declare op uuid;raw text;begin
 op:=pg_temp.publication(3,'Apply','incremental',2);
 raw:='[{"kind":"binding","fields":{"alias_key":"alias-a","local_scope_id":"scope-a"}},{"kind":"movement","fields":{"alias_key":"alias-a","external_namespace":"getnet.legacy.transaction","external_id":"exact-019","business_ticks":"638423827330000001","gross_clp":"2600","fee_clp":null,"fee_vat_clp":null,"net_clp":null,"movement_kind":"Sale","transaction_state":"Abonado"}}]';
 insert into public.payment_history_local_publication_pages values('10000000-0000-4000-8000-000000203019',op,1,raw,encode(extensions.digest(convert_to(raw,'UTF8'),'sha256'),'hex'));
 insert into public.payment_history_local_publication_map values('10000000-0000-4000-8000-000000203019',op,1,'e0000000-0000-4000-8000-000000203019',false,true,'scope-a','getnet.legacy.transaction','exact-019',1,2,1,1);
end;$$;
select is(pg_temp.projection()->>'source_kind','publication','incremental local insert advances its local projection');
select is(pg_temp.projection()#>>'{economics,grossClp}','2600','incremental economics are read from its immutable page');
select is(pg_temp.projection()->>'active','true','canonical inactive flag is not a local Undo');
select is(pg_temp.projection()->>'local_transaction_id',null::text,'incremental local row is not converted to a canonical numeric ID');
select is(pg_temp.projection()->>'apply_operation_id','41000000-0000-4000-8000-000000000003','original incremental Apply owns its local provenance');
select throws_ok($$insert into public.payment_history_local_publication_map values('10000000-0000-4000-8000-000000203019','41000000-0000-4000-8000-000000000003',2,'e0000000-0000-4000-8000-000000203019',false,true,'scope-a','getnet.legacy.transaction','exact-019',1,1,1,1)$$,'40001','payment_history_local_projection_unverified','a binding record cannot be presented as an inserted movement');
select throws_ok($$insert into public.payment_history_local_publication_map values('10000000-0000-4000-8000-000000203019','41000000-0000-4000-8000-000000000003',2,'e0000000-0000-4000-8000-000000203019',false,true,'scope-b','getnet.legacy.transaction','exact-019',1,2,1,1)$$,'40001','payment_history_local_projection_unverified','map scope must match the immutable binding');
select throws_ok($$insert into public.payment_history_local_publication_map values('10000000-0000-4000-8000-000000203019','41000000-0000-4000-8000-000000000003',2,'e0000000-0000-4000-8000-000000203019',false,true,'scope-a','getnet.legacy.transaction','foreign',1,2,1,1)$$,'40001','payment_history_local_projection_unverified','map identity must match the immutable movement');
do $$begin perform pg_temp.publication(4,'Undo','incremental',1,'20000000-0000-4000-8000-000000203020');end;$$;
select is(pg_temp.projection()->>'active','true','another device Undo cannot deactivate this local row');
do $$begin perform pg_temp.publication(5,'Undo','incremental',3);end;$$;
select is(pg_temp.projection()->>'active','false','own later Undo deactivates the incremental local row');
do $$declare op uuid;begin
 op:=pg_temp.publication(6,'Apply','duplicate-only',4);
 insert into public.payment_history_local_publication_pages select shop_id,op,ordinal,page_json,page_sha256 from public.payment_history_local_publication_pages where operation_id='41000000-0000-4000-8000-000000000003';
 insert into public.payment_history_local_publication_map values('10000000-0000-4000-8000-000000203019',op,1,'e0000000-0000-4000-8000-000000203019',false,false,'scope-a','getnet.legacy.transaction','exact-019',1,2,1,1);
end;$$;
select is(pg_temp.projection()->>'local_batch_id','incremental','local duplicate-only observation does not acquire the row');
select is(pg_temp.projection()->>'active','false','duplicate-only map does not reactivate an inactive local row');
select throws_ok($$update public.payment_history_local_publication_map set local_inserted=false where local_inserted$$,'55000','payment_history_local_publication_immutable','local decision provenance cannot be rewritten');
select throws_ok($$update public.payment_history_source_objects set original_object='{}' where table_name='movements'$$,'55000','payment_history_immutable_record','baseline source remains immutable');
do $$declare op uuid;begin
 op:=pg_temp.publication(7,'Apply','legacy-incomplete',5);
 insert into public.payment_history_local_publication_map(shop_id,operation_id,source_ordinal,movement_version_id,owned)
  values('10000000-0000-4000-8000-000000203019',op,1,'e0000000-0000-4000-8000-000000203019',false);
end;$$;
select throws_ok($$select pg_temp.projection()$$,'40001','payment_history_local_projection_unverified','older incomplete maps require reconciliation, not an assumed duplicate');
select is((select count(*) from public.pos_sales where shop_id='10000000-0000-4000-8000-000000203019'),0::bigint,'projection creates no native sale');
select is((select count(*) from public.payment_history_movement_versions where shop_id='10000000-0000-4000-8000-000000203019'),1::bigint,'projection creates no economic movement beyond its source fixture');
select * from finish();
rollback;
