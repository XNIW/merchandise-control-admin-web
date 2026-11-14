begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
set local statement_timeout='30s';
select plan(13);
create temp table frozen_fact as select $fixture${"transaction":{"source":{"fileId":"f922e97c16554bf0b65a20ac3b6ea685","fileSha256":"1abb796cb03f9aafd5dbeb4608cffe3e2bf63ca572925089cd251629330364df","sheetName":"Synthetic","rowNumber":2},"profile":"GetnetLegacy","profileVersion":"getnet-legacy-v1","parserVersion":"history-local-ledger-v1","provider":"getnet","currency":"CLP","paymentMethod":"card","externalNamespace":"getnet.legacy.transaction","externalId":"SYN-L-001","paymentId":"","authorizationCode":"","merchant":{"local":"","seller":"","sellerId":"","localNumber":"","rut":"","hasEvidence":false},"timestamp":{"rawTimestamp":"01/02/2024 11:12:13","rawOffset":"","offsetMinutes":null,"businessDateTime":"2024-02-01T11:12:13.0000000","isoBusinessDateTime":null,"exportedLocalDateTime":null,"occurredAtUtc":null,"interpretation":"Unresolved","policyVersion":"synthetic-fixed-offset-v1","evidenceReference":"","needsEvidence":false},"movementKind":"Sale","transactionStatus":"ABONADO","settlementStatus":"Abonado","grossClp":"1200","commissionClp":"20","commissionVatClp":null,"netClp":"1180","cardSubtype":"Credit","originalCardType":"","originalPrepaid":"","terminal":"","rawSettlementDate":"","originalCashierId":null,"sourceTransactionStatus":"Abonado"},"economics":{"businessTicks":"638423827330000000","grossClp":"1200","commissionClp":"20","commissionVatClp":null,"netClp":"1180","movementKind":"Sale","transactionState":"ABONADO"},"digest":"24208343d107ee0d94b1dfb3bf6794ebc07ddb3bfb29af8124eb3602de31989a"}$fixture$::jsonb value;
insert into public.shops(shop_id,shop_code,shop_name,shop_status) values
 ('10000000-0000-4000-8000-000000803019','FROZEN-INACTIVE-019','Synthetic frozen source','active'),
 ('10000000-0000-4000-8000-000000803020','FROZEN-INACTIVE-020','Synthetic other shop','active');
insert into public.shop_devices(shop_device_id,shop_id,device_identifier,display_name,device_type,status)
 values('20000000-0000-4000-8000-000000803019','10000000-0000-4000-8000-000000803019','FROZEN-019','Synthetic POS','pos','active');
insert into public.payment_history_evidence(evidence_id,shop_id,kind,verification_level,status,policy_version,reference,scope,actor_kind,actor_id,verified_at)
 select ('90000000-0000-4000-8000-'||suffix)::uuid,('10000000-0000-4000-8000-'||suffix)::uuid,
 'migration_reconcile','operator_attested','verified','synthetic-frozen-v1','Synthetic exact source mapping',
 jsonb_build_object('run_id','80000000-0000-4000-8000-000000803019','local_scope_id','scope1','merchant_id','40000000-0000-4000-8000-000000803019','archive_sha256',repeat('a',64)),
 'pos_staff_manager','30000000-0000-4000-8000-000000803019',clock_timestamp()
 from (values('000000803019'),('000000803020')) t(suffix);
insert into public.payment_history_merchants(merchant_id,shop_id,label,evidence_id)
 select ('40000000-0000-4000-8000-'||suffix)::uuid,('10000000-0000-4000-8000-'||suffix)::uuid,'Synthetic merchant',('90000000-0000-4000-8000-'||suffix)::uuid
 from (values('000000803019'),('000000803020')) t(suffix);
insert into public.payment_history_uploads(upload_id,shop_id,actor_kind,actor_id,object_key,file_name,file_sha256,byte_length,state,verified_at)
 values('70000000-0000-4000-8000-000000803019','10000000-0000-4000-8000-000000803019','pos_staff_manager','30000000-0000-4000-8000-000000803019',
 'history/10000000-0000-4000-8000-000000803019/70000000-0000-4000-8000-000000803019','synthetic.w7history.zip',repeat('a',64),100,'verified',clock_timestamp());
insert into public.payment_history_migration_runs(run_id,shop_id,source_upload_id,actor_kind,actor_id,actor_session_id,request_key,request_digest,state,manifest,configuration)
 values('80000000-0000-4000-8000-000000803019','10000000-0000-4000-8000-000000803019','70000000-0000-4000-8000-000000803019','pos_staff_manager',
 '30000000-0000-4000-8000-000000803019','30000000-0000-4000-8000-000000803019',gen_random_uuid(),repeat('a',64),'review_ready',
 '{"deviceId":"20000000-0000-4000-8000-000000803019","localDatasetId":"synthetic-frozen-019"}',
 '{"bindings":[{"local_scope_id":"scope1","merchant_id":"40000000-0000-4000-8000-000000803019","evidence_id":"90000000-0000-4000-8000-000000803019"}]}');
insert into public.payment_history_migration_objects(shop_id,run_id,table_name,local_id,source_ordinal,original_line,object,object_digest)
 select '10000000-0000-4000-8000-000000803019','80000000-0000-4000-8000-000000803019',name,'1',1,'{}','{}',repeat('a',64) from (values('batches'),('movements')) t(name);
insert into public.payment_history_migration_movements(shop_id,run_id,local_id,local_batch_id,local_scope_id,local_binding_id,local_file_id,alias_key,active,transaction,economics,economic_digest)
 select '10000000-0000-4000-8000-000000803019','80000000-0000-4000-8000-000000803019','1','1','scope1','1','1',repeat('a',64),false,
 value->'transaction',value->'economics',value->>'digest' from frozen_fact;
insert into public.payment_history_batches(batch_id,shop_id,origin,apply_operation_id,created_revision)
 select ('60000000-0000-4000-8000-'||suffix)::uuid,('10000000-0000-4000-8000-'||suffix)::uuid,'local_migration',gen_random_uuid(),1 from (values('000000803019'),('000000803020')) t(suffix);
insert into public.payment_history_movement_versions(movement_version_id,shop_id,merchant_id,external_namespace,external_id,identity_key,economic_digest,business_ticks,business_date,
 gross_clp,commission_clp,commission_vat_clp,net_clp,movement_kind,transaction_state,transaction,owner_batch_id,active,created_revision)
 select '50000000-0000-4000-8000-000000803019','10000000-0000-4000-8000-000000803019','40000000-0000-4000-8000-000000803019',
 value#>>'{transaction,externalNamespace}',value#>>'{transaction,externalId}',
 encode(extensions.digest(convert_to('10000000-0000-4000-8000-000000803019'||chr(31)||'getnet'||chr(31)||'40000000-0000-4000-8000-000000803019'||chr(31)||(value#>>'{transaction,externalNamespace}')||chr(31)||(value#>>'{transaction,externalId}'),'UTF8'),'sha256'),'hex'),
 value->>'digest',(value#>>'{economics,businessTicks}')::bigint,(value#>>'{transaction,timestamp,businessDateTime}')::date,
 (value#>>'{economics,grossClp}')::bigint,(value#>>'{economics,commissionClp}')::bigint,(value#>>'{economics,commissionVatClp}')::bigint,(value#>>'{economics,netClp}')::bigint,
 value#>>'{economics,movementKind}',value#>>'{economics,transactionState}',value->'transaction','60000000-0000-4000-8000-000000803019',false,1 from frozen_fact;
create temp table frozen_canonical as select * from public.payment_history_movement_versions where movement_version_id='50000000-0000-4000-8000-000000803019';
create function pg_temp.frozen_decision() returns text language sql as $$select decision from app_private.payment_history_migration_review_rows_v1('80000000-0000-4000-8000-000000803019')$$;
select is(pg_temp.frozen_decision(),'duplicate','one exact inactive canonical version is reused');
select is((select existing_version_id from app_private.payment_history_migration_review_rows_v1('80000000-0000-4000-8000-000000803019')),'50000000-0000-4000-8000-000000803019'::uuid,'the existing immutable version is retained');
select is((select count(*) from public.payment_history_movement_versions where shop_id='10000000-0000-4000-8000-000000803019'),1::bigint,'review does not write canonical economics');
-- Vary only the incoming source. Canonical facts retain their immutable guards.
update public.payment_history_migration_movements set economic_digest=repeat('b',64);
select is(pg_temp.frozen_decision(),'new_inactive','different digest is not treated as the same source fact');
update public.payment_history_migration_movements set economic_digest=(select economic_digest from frozen_canonical),economics=jsonb_set(economics,'{grossClp}',to_jsonb(((economics->>'grossClp')::bigint+1)::text));
select is(pg_temp.frozen_decision(),'new_inactive','matching digest alone does not bypass economic comparison');
update public.payment_history_migration_movements set economics=(select value->'economics' from frozen_fact);
create function pg_temp.frozen_key(p_external text) returns text language sql as $$select encode(extensions.digest(convert_to('10000000-0000-4000-8000-000000803019'||chr(31)||'getnet'||chr(31)||'40000000-0000-4000-8000-000000803019'||chr(31)||(value#>>'{transaction,externalNamespace}')||chr(31)||p_external,'UTF8'),'sha256'),'hex') from frozen_fact$$;
insert into public.payment_history_movement_versions select (jsonb_populate_record(null::public.payment_history_movement_versions,to_jsonb(f)||jsonb_build_object(
 'movement_version_id','50000000-0000-4000-8000-000000803022','external_id','frozen-active-source','identity_key',pg_temp.frozen_key('frozen-active-source'),
 'transaction',jsonb_set(f.transaction,'{externalId}',to_jsonb('frozen-active-source'::text)),'active',true))).* from frozen_canonical f;
update public.payment_history_migration_movements set transaction=jsonb_set(transaction,'{externalId}',to_jsonb('frozen-active-source'::text));
select is(pg_temp.frozen_decision(),'new_inactive','an active version is not consumed as an inactive version');
update public.payment_history_migration_movements set transaction=(select value->'transaction' from frozen_fact);
update public.payment_history_evidence set status='revoked',revoked_at=clock_timestamp() where evidence_id='90000000-0000-4000-8000-000000803019';
select is(pg_temp.frozen_decision(),'blocked','revoked source mapping still blocks the exact match');
update public.payment_history_evidence set status='verified',revoked_at=null where evidence_id='90000000-0000-4000-8000-000000803019';
update public.payment_history_migration_movements set active=true;
select is(pg_temp.frozen_decision(),'blocked','active incoming identity does not reactivate an inactive canonical version');
update public.payment_history_migration_movements set active=false;
insert into public.payment_history_movement_versions select (jsonb_populate_record(null::public.payment_history_movement_versions,to_jsonb(f)||jsonb_build_object(
 'movement_version_id','50000000-0000-4000-8000-000000803021','shop_id','10000000-0000-4000-8000-000000803020','merchant_id','40000000-0000-4000-8000-000000803020',
 'owner_batch_id','60000000-0000-4000-8000-000000803020','external_id','frozen-other-shop-source','identity_key',pg_temp.frozen_key('frozen-other-shop-source'),
 'transaction',jsonb_set(f.transaction,'{externalId}',to_jsonb('frozen-other-shop-source'::text))))).* from frozen_canonical f;
update public.payment_history_migration_movements set transaction=jsonb_set(transaction,'{externalId}',to_jsonb('frozen-other-shop-source'::text));
select is(pg_temp.frozen_decision(),'new_inactive','a same-digest version in another shop is not reused');
update public.payment_history_migration_movements set transaction=(select value->'transaction' from frozen_fact);
insert into public.payment_history_movement_versions select (jsonb_populate_record(null::public.payment_history_movement_versions,to_jsonb(f)||'{"movement_version_id":"50000000-0000-4000-8000-000000803020"}'::jsonb)).* from frozen_canonical f;
select is(pg_temp.frozen_decision(),'blocked','ambiguous inactive versions require explicit review');
select ok(not has_function_privilege('anon','app_private.payment_history_migration_review_rows_v1(uuid)','EXECUTE'),'anon remains denied');
select ok(not has_function_privilege('authenticated','app_private.payment_history_migration_review_rows_v1(uuid)','EXECUTE'),'authenticated remains denied');
select ok(not has_function_privilege('service_role','app_private.payment_history_migration_review_rows_v1(uuid)','EXECUTE'),'the private engine remains unavailable directly to service_role');
select * from finish();
rollback;
