begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(37);
-- Scoped parser/index component. No actor or economic authorization is faked.
insert into public.shops(shop_id,shop_code,shop_name,shop_status) values('10000000-0000-4000-8000-000000303019','INDEX019','Synthetic review index','active');
insert into public.shop_devices(shop_device_id,shop_id,device_identifier,display_name,device_type,status)
 values('20000000-0000-4000-8000-000000303019','10000000-0000-4000-8000-000000303019','SYNTHETIC-INDEX','Synthetic index','pos','active');
insert into public.payment_history_runtime(shop_id) values('10000000-0000-4000-8000-000000303019');
create temp table index_pages(ordinal integer primary key,raw text,sha text);
create function pg_temp.movement(n integer) returns jsonb language sql as $$
 select jsonb_build_object('kind','movement','fields',jsonb_build_object(
 'source_file_id','f1','source_sheet','Synthetic','source_row',(n+1)::text,'external_namespace','getnet.legacy.transaction','external_id','SYN-'||n::text,
 'business_ticks','638423827330000001','profile','GetnetLegacy','alias_key',repeat('a',64),'merchant_local','Synthetic','merchant_seller','',
 'merchant_seller_id','','merchant_local_number','','merchant_rut','','movement_kind','Sale','transaction_state','Abonado','settlement_state','Abonado',
 'gross_clp',case when n=201 then '9007199254740993' else '1000' end,'fee_clp','0','fee_vat_clp',null,'net_clp',case when n=201 then '9007199254740993' else '1000' end,
 'timestamp_raw','01/02/2024 11:12:13','offset_raw','','offset_minutes',null,'occurred_at_utc_ms',null,'time_interpretation','Unresolved',
 'time_policy_version','synthetic-v1','time_evidence_reference','synthetic','card_subtype','Debit','payment_id','','authorization_code','',
 'original_card_type','Debito','original_prepaid','','terminal','','settlement_date_raw',''));
$$;
insert into index_pages(ordinal,raw) values(1,jsonb_build_array(
 jsonb_build_object('kind','operation','fields',jsonb_build_object('protocol_version','2','operation_id','40000000-0000-4000-8000-000000303019','operation_kind','Apply',
 'shop_id','10000000-0000-4000-8000-000000303019','device_id','20000000-0000-4000-8000-000000303019','local_dataset_id','index-test','restore_epoch','0','restore_lineage_id','50000000-0000-4000-8000-000000303019','base_revision','0','request_fingerprint',repeat('a',64))),
 jsonb_build_object('kind','file','fields',jsonb_build_object('id','f1','sha256',repeat('b',64),'profile','GetnetLegacy','source_rows','203')),
 jsonb_build_object('kind','binding','fields',jsonb_build_object('alias_key',repeat('a',64),'local_scope_id','scope-a','local_binding_id','binding-a','evidence_reference','synthetic')))::text);
insert into index_pages(ordinal,raw) select 2,jsonb_agg(pg_temp.movement(n) order by n)::text from generate_series(1,200)n;
insert into index_pages(ordinal,raw) values(3,jsonb_build_array(pg_temp.movement(201),
 jsonb_build_object('kind','rejected','fields',jsonb_build_object('source_file_id','f1','source_sheet','Synthetic','source_row','203','transaction_state','Rechazada','requested_clp','1000')),
 jsonb_build_object('kind','correction','fields',jsonb_build_object('source_file_id','f1','source_sheet','Synthetic','source_row','202','previous_transaction_id','9007199254740993',
 'previous_local_batch_id','original-local-batch','previous_apply_operation_id','60000000-0000-4000-8000-000000303019','previous_economic_digest',repeat('a',64),
 'proposed_economic_digest',repeat('b',64),'context_fingerprint',repeat('c',64),'evidence_reference','synthetic-only','approval_fingerprint',repeat('d',64))))::text);
update index_pages set sha=encode(extensions.digest(convert_to(raw,'UTF8'),'sha256'),'hex');
insert into public.payment_history_local_publications(operation_id,shop_id,shop_device_id,server_dataset_id,local_dataset_id,restore_lineage_id,restore_epoch,writer_epoch,operation_kind,request_fingerprint,content_digest,protocol_version,base_revision,page_count)
 select '40000000-0000-4000-8000-000000303019',r.shop_id,'20000000-0000-4000-8000-000000303019',r.dataset_id,'index-test','50000000-0000-4000-8000-000000303019',0,1,'Apply',repeat('a',64),
 (select encode(extensions.digest(convert_to(string_agg(sha||chr(10),'' order by ordinal),'UTF8'),'sha256'),'hex') from index_pages),2,0,3 from public.payment_history_runtime r where shop_id='10000000-0000-4000-8000-000000303019';
create function pg_temp.stage(n integer,device uuid default '20000000-0000-4000-8000-000000303019') returns jsonb language sql as $$
 select app_private.payment_history_local_stage_v2('10000000-0000-4000-8000-000000303019',device,
 jsonb_build_object('operation_id',p.operation_id,'content_digest',p.content_digest,'ordinal',n,'page_json',v.raw,'page_sha256',v.sha))
 from public.payment_history_local_publications p cross join index_pages v where p.operation_id='40000000-0000-4000-8000-000000303019' and v.ordinal=n;
$$;
create function pg_temp.records(n integer,device uuid default '20000000-0000-4000-8000-000000303019') returns table(record_ordinal integer,movement_ordinal integer,kind text,fields jsonb) language sql as $$
 select * from app_private.payment_history_local_review_records_v2('10000000-0000-4000-8000-000000303019',device,'40000000-0000-4000-8000-000000303019',n);
$$;
select ok(not has_function_privilege('service_role','app_private.payment_history_local_stage_v2(uuid,uuid,jsonb)','EXECUTE'),'indexed stage remains private');
select ok(not has_function_privilege('service_role','app_private.payment_history_local_stage_pages_v2(uuid,uuid,jsonb)','EXECUTE'),'raw stage cannot bypass indexing through the device API');
select ok(not has_function_privilege('authenticated','app_private.payment_history_local_review_records_v2(uuid,uuid,uuid,integer)','EXECUTE'),'review source reader is not a browser API');
select ok(not has_table_privilege('service_role','public.payment_history_local_preparation_records','INSERT'),'service role cannot manufacture source coordinates');
select ok((select relrowsecurity from pg_class where oid='public.payment_history_local_preparation_records'::regclass),'preparation index has RLS');
select throws_ok($$select * from pg_temp.records(1)$$,'40001','payment_history_local_preparation_index_incomplete','review cannot run before all pages are staged');
select is(pg_temp.stage(1)->>'next_ordinal','2','header/file/binding page stages atomically');
select is((select count(*) from public.payment_history_local_preparation_records),3::bigint,'only coordinate rows are indexed');
select is(pg_temp.stage(1)->>'next_ordinal','2','lost stage reply recovers the same cursor');
select is((select count(*) from public.payment_history_local_preparation_records),3::bigint,'replay does not duplicate auxiliary rows');
select throws_ok($$select pg_temp.stage(2,'20000000-0000-4000-8000-000000303020')$$,'40001','payment_history_local_preparation_stale','another device cannot add review inputs');
select throws_ok($$select pg_temp.stage(3)$$,'40001','payment_history_local_page_out_of_order','future metadata cannot skip source pages');
select is(pg_temp.stage(2)->>'next_ordinal','3','maximum-size record-count page is accepted');
select is((select count(*) from public.payment_history_local_preparation_records where movement_ordinal between 1 and 200),200::bigint,'movement ordering is consecutive inside a page');
select throws_ok($$select * from pg_temp.records(2)$$,'40001','payment_history_local_preparation_index_incomplete','future correction/metadata pages must be available first');
select is(pg_temp.stage(3)->>'next_ordinal','4','complete root is verified before source review');
select is((select count(*) from pg_temp.records(2)),200::bigint,'one review request is bounded to200 records');
select is((select count(*) from pg_temp.records(3)),3::bigint,'mixed final page keeps its exact record boundary');
select is((select movement_ordinal from pg_temp.records(3) where kind='movement'),201,'movement sequence spans page boundaries without counting metadata');
select is((select page_ordinal::text||':'||record_ordinal::text from public.payment_history_local_preparation_records where kind='file' and auxiliary_key=app_private.payment_history_field_hash_v1(array['f1'])),'1:2','file lookup retains exact source coordinates');
select is((select fields->>'business_ticks' from pg_temp.records(3) where kind='movement'),'638423827330000001','source reader retains exact100ns commercial time');
select is((select fields->>'gross_clp' from pg_temp.records(3) where kind='movement'),'9007199254740993','source reader never coerces CLP through Number');
select throws_ok($$select * from pg_temp.records(0)$$,'22023','payment_history_local_review_page_invalid','zero page cannot reset the review cursor');
select throws_ok($$select * from pg_temp.records(2,'20000000-0000-4000-8000-000000303020')$$,'40001','payment_history_local_preparation_stale','another device cannot read the prepared content');
select is(pg_temp.stage(3)->>'next_ordinal','4','complete stage reply can be recovered without rebuilding a grant');
select throws_ok($$update public.payment_history_local_preparation_records set page_ordinal=2 where kind='file'$$,'55000','payment_history_local_preparation_index_immutable','indexed provenance cannot be edited');
select is((select count(*) from public.payment_history_batches where shop_id='10000000-0000-4000-8000-000000303019'),0::bigint,'indexing creates no economic batch');
select is((select count(*) from public.payment_history_movement_versions where shop_id='10000000-0000-4000-8000-000000303019'),0::bigint,'indexing creates no canonical movement');
select is((select count(*) from public.payment_history_local_publications where grant_id is not null and shop_id='10000000-0000-4000-8000-000000303019'),0::bigint,'source review does not mint a grant');
select lives_ok($$delete from public.payment_history_local_preparation_records where page_ordinal=3$$,'never-authorized derived index can be retired');
select throws_ok($$select * from pg_temp.records(3)$$,'40001','payment_history_local_preparation_index_incomplete','missing derived coordinates do not become empty economic input');
select is(pg_temp.stage(3)->>'next_ordinal','4','same immutable bytes rebuild a never-authorized index');
select is((select count(*) from pg_temp.records(3)),3::bigint,'rebuilt source remains complete and exact');
insert into public.staff_accounts(staff_id,shop_id,staff_code,display_name,role_key,status,credential_kind,credential_hash,credential_updated_at)
 values('30000000-0000-4000-8000-000000303019','10000000-0000-4000-8000-000000303019','TEST-INDEX','Synthetic manager','manager','active','password','argon2id:synthetic-not-a-login',clock_timestamp());
update public.payment_history_local_publications set state='authorized',grant_id='80000000-0000-4000-8000-000000303019',authorization_staff_id='30000000-0000-4000-8000-000000303019',authorization_credential_version=1,issued_at=clock_timestamp(),expires_at=clock_timestamp()+interval '30 seconds' where operation_id='40000000-0000-4000-8000-000000303019';
select throws_ok($$delete from public.payment_history_local_preparation_records where page_ordinal=3$$,'55000','payment_history_local_preparation_index_immutable','an issued decision retains all review source coordinates');
select throws_ok($$delete from public.payment_history_local_publication_pages where ordinal=3$$,'55000','payment_history_local_publication_immutable','an issued decision retains its immutable bytes');
select throws_ok($$select * from pg_temp.records(3)$$,'40001','payment_history_local_preparation_stale','a grant cannot be semantically reviewed again');
select is((select count(*) from public.pos_sales where shop_id='10000000-0000-4000-8000-000000303019'),0::bigint,'no native sale is created by indexing or review');
select * from finish();
rollback;
