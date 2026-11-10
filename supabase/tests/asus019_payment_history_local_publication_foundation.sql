begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(26);
select has_table('public','payment_history_local_writer_contexts','verified local writer context exists');
select has_table('public','payment_history_local_publications','incremental decisions have a separate journal');
select has_table('public','payment_history_local_publication_pages','content pages are retained');
select has_table('public','payment_history_local_publication_map','source mapping is separate from the economic ledger');
select has_table('public','payment_history_local_drain_set','freeze captures a bounded admitted set');
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in('payment_history_local_writer_contexts','payment_history_local_publications','payment_history_local_publication_pages','payment_history_local_publication_map','payment_history_local_drain_set') and c.relrowsecurity),5::bigint,'all new exposed-schema tables enable RLS');
select ok((select bool_and(not has_table_privilege('anon','public.'||name,'SELECT,INSERT,UPDATE,DELETE')) from unnest(array['payment_history_local_writer_contexts','payment_history_local_publications','payment_history_local_publication_pages','payment_history_local_publication_map','payment_history_local_drain_set']) name),'anonymous direct table access is closed');
select ok((select bool_and(not has_table_privilege('authenticated','public.'||name,'SELECT,INSERT,UPDATE,DELETE')) from unnest(array['payment_history_local_writer_contexts','payment_history_local_publications','payment_history_local_publication_pages','payment_history_local_publication_map','payment_history_local_drain_set']) name),'authenticated direct table access is closed');
select ok((select bool_and(not has_table_privilege('service_role','public.'||name,'SELECT,INSERT,UPDATE,DELETE')) from unnest(array['payment_history_local_writer_contexts','payment_history_local_publications','payment_history_local_publication_pages','payment_history_local_publication_map','payment_history_local_drain_set']) name),'service role must use the future authenticated boundary');
select ok((select bool_and(not has_function_privilege(role_name,'app_private.payment_history_clock_from_ticks_v2(text)','EXECUTE') and not has_function_privilege(role_name,'app_private.payment_history_local_transaction_v2(jsonb,text)','EXECUTE')) from unnest(array['anon','authenticated','service_role']) role_name),'conversion primitives are not public mutation endpoints');
select is(app_private.payment_history_clock_from_ticks_v2('0'),'0001-01-01T00:00:00.0000000','minimum .NET business clock is exact');
select is(app_private.payment_history_clock_from_ticks_v2('3155378975999999999'),'9999-12-31T23:59:59.9999999','maximum .NET business clock keeps 100ns precision');
select is(app_private.payment_history_clock_from_ticks_v2((app_private.payment_history_ticks_v1('2020-01-02T11:12:13')+1)::text),'2020-01-02T11:12:13.0000001','conversion does not round through PostgreSQL microseconds');
select throws_ok($$select app_private.payment_history_clock_from_ticks_v2('-1')$$,'22023','payment_history_ticks_invalid','negative business ticks are denied');
select throws_ok($$select app_private.payment_history_clock_from_ticks_v2('01')$$,'22023','payment_history_ticks_invalid','noncanonical business ticks are denied');
select throws_ok($$select app_private.payment_history_clock_from_ticks_v2('3155378976000000000')$$,'22023','payment_history_ticks_invalid','out-of-range business ticks are denied');
create temp table local_fields(value jsonb);
insert into local_fields values(jsonb_build_object('source_file_id','f1','source_sheet','synthetic','source_row','2','external_namespace','getnet.legacy.transaction','external_id','000000019','profile','GetnetLegacy',
 'alias_key',app_private.payment_history_field_hash_v1(array['getnet-merchant-alias-v1','SYNTHETIC','QA','42','1','test']),
 'merchant_local','SYNTHETIC','merchant_seller','QA','merchant_seller_id','42','merchant_local_number','1','merchant_rut','test',
 'business_ticks',app_private.payment_history_ticks_v1('2020-01-02T11:12:13')::text,'movement_kind','Sale','transaction_state','Abonado','settlement_state','Abonado',
 'gross_clp','1000','fee_clp','100','fee_vat_clp',null,'net_clp','900','timestamp_raw','02/01/2020 11:12:13','offset_raw','', 'offset_minutes',null,'occurred_at_utc_ms',null,
 'time_interpretation','Unresolved','time_policy_version','synthetic-v1','time_evidence_reference','synthetic-attested','card_subtype','Debit','payment_id','','authorization_code','','original_card_type','Debito','original_prepaid','','terminal','','settlement_date_raw',''));
select is((select app_private.payment_history_local_transaction_v2(value,repeat('a',64))#>>'{timestamp,businessDateTime}' from local_fields),'2020-01-02T11:12:13.0000000','legacy normalized business clock remains attested and literal');
select is((select app_private.payment_history_local_transaction_v2(value,repeat('a',64))->'commissionVatClp' from local_fields),'null'::jsonb,'unknown VAT is preserved rather than invented as zero');
select throws_ok($$select app_private.payment_history_local_transaction_v2(value||jsonb_build_object('alias_key',repeat('f',64)),repeat('a',64)) from local_fields$$,'22023','payment_history_merchant_alias_invalid','merchant alias must hash the retained raw identity');
select throws_ok($$select app_private.payment_history_local_transaction_v2(value||jsonb_build_object('gross_clp','1e3'),repeat('a',64)) from local_fields$$,'22023','payment_history_amount_invalid','financial values cannot use rounded or exponential forms');
insert into public.shops(shop_id,shop_code,shop_name,shop_status) values('10000000-0000-4000-8000-000000053019','LOCAL019','Synthetic local publication','active');
insert into public.shop_devices(shop_device_id,shop_id,device_identifier,display_name,device_type,status) values('20000000-0000-4000-8000-000000053019','10000000-0000-4000-8000-000000053019','SYNTHETIC-LOCAL-DEVICE','Synthetic local device','pos','active');
insert into public.staff_accounts(staff_id,shop_id,staff_code,display_name,role_key,status,credential_kind,credential_hash,credential_updated_at,credential_expires_at,must_change_credential,credential_version,credential_status)
 values('30000000-0000-4000-8000-000000053019','10000000-0000-4000-8000-000000053019','1001','Synthetic local operator','pos_admin','active','password','argon2id:synthetic-not-a-login',clock_timestamp(),clock_timestamp()+interval '1 hour',false,7,'active');
insert into public.payment_history_runtime(shop_id) values('10000000-0000-4000-8000-000000053019');
insert into public.payment_history_local_publications(operation_id,shop_id,shop_device_id,server_dataset_id,local_dataset_id,restore_lineage_id,restore_epoch,writer_epoch,operation_kind,request_fingerprint,content_digest,protocol_version,base_revision,page_count)
 select '40000000-0000-4000-8000-000000053019',shop_id,'20000000-0000-4000-8000-000000053019',dataset_id,'synthetic-local-dataset','50000000-0000-4000-8000-000000053019',0,writer_epoch,'Apply',repeat('a',64),repeat('b',64),2,0,1 from public.payment_history_runtime where shop_id='10000000-0000-4000-8000-000000053019';
insert into public.payment_history_local_publication_pages values('10000000-0000-4000-8000-000000053019','40000000-0000-4000-8000-000000053019',1,'[]',repeat('a',64));
select throws_ok($$update public.payment_history_local_publications set content_digest=repeat('c',64) where operation_id='40000000-0000-4000-8000-000000053019'$$,'55000','payment_history_local_publication_immutable','an operation cannot change its admitted identity or root');
select throws_ok($$update public.payment_history_local_publication_pages set page_json='[1]' where operation_id='40000000-0000-4000-8000-000000053019'$$,'55000','payment_history_local_publication_immutable','page replacement is denied');
select lives_ok($$delete from public.payment_history_local_publication_pages where operation_id='40000000-0000-4000-8000-000000053019'$$,'never-admitted staging may be reclaimed');
insert into public.payment_history_local_publication_pages values('10000000-0000-4000-8000-000000053019','40000000-0000-4000-8000-000000053019',1,'[]',repeat('a',64));
update public.payment_history_local_publications set state='authorized',grant_id='60000000-0000-4000-8000-000000053019',authorization_staff_id='30000000-0000-4000-8000-000000053019',authorization_credential_version=7,issued_at=clock_timestamp()-interval '61 seconds',expires_at=clock_timestamp()-interval '2 seconds' where operation_id='40000000-0000-4000-8000-000000053019';
update public.payment_history_runtime set writer_authority='frozen',writer_epoch=writer_epoch+1 where shop_id='10000000-0000-4000-8000-000000053019';
select is((select count(*) from public.payment_history_local_drain_set where shop_id='10000000-0000-4000-8000-000000053019'),1::bigint,'freeze retains unresolved admitted content after grant TTL');
select throws_ok($$update public.payment_history_runtime set writer_authority='web',writer_epoch=writer_epoch+1 where shop_id='10000000-0000-4000-8000-000000053019'$$,'40001','payment_history_local_publications_not_drained','TTL alone cannot open cutover while an admitted outcome is unknown');
select throws_ok($$delete from public.payment_history_local_publication_pages where operation_id='40000000-0000-4000-8000-000000053019'$$,'55000','payment_history_local_publication_immutable','admitted source content remains immutable after expiry');
select * from finish();
rollback;
