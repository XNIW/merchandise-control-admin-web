begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(24);
select ok(not has_function_privilege('anon','app_private.payment_history_local_review_transaction_v2(uuid,jsonb,text,text,uuid[])','EXECUTE'),'anonymous cannot call semantic review');
select ok(not has_function_privilege('authenticated','app_private.payment_history_local_review_transaction_v2(uuid,jsonb,text,text,uuid[])','EXECUTE'),'browser cannot call semantic review');
select ok(not has_function_privilege('service_role','app_private.payment_history_local_review_transaction_v2(uuid,jsonb,text,text,uuid[])','EXECUTE'),'semantic helper requires the future authenticated boundary');
insert into public.shops(shop_id,shop_code,shop_name,shop_status) values('10000000-0000-4000-8000-000000073019','REVIEW019','Synthetic semantic review','active');
insert into public.payment_history_evidence(evidence_id,shop_id,kind,verification_level,status,policy_version,reference,scope,actor_kind,actor_id,verified_at)
 select id::uuid,'10000000-0000-4000-8000-000000073019',kind,'operator_attested','verified','synthetic-v1','Synthetic proof',
  jsonb_build_object('merchant_id','c0000000-0000-4000-8000-000000073019','file_sha256',jsonb_build_array(repeat('a',64)),'from_ticks','0','to_ticks','3155378975999999999',
   'native_start_ticks',app_private.payment_history_ticks_v1('2021-01-01T00:00:00')::text,'interpretation','IsoUtc'),
  'pos_staff_manager','30000000-0000-4000-8000-000000073019',clock_timestamp()
 from(values('d0000000-0000-4000-8000-000000073019','merchant_mapping'),('e0000000-0000-4000-8000-000000073019','native_start'),('f0000000-0000-4000-8000-000000073019','legacy_currency'),('a0000000-0000-4000-8000-000000073019','modern_time'))x(id,kind);
insert into public.payment_history_merchants(merchant_id,shop_id,label,evidence_id) values('c0000000-0000-4000-8000-000000073019','10000000-0000-4000-8000-000000073019','Synthetic merchant','d0000000-0000-4000-8000-000000073019');
create temp table fields(legacy jsonb,modern jsonb);
insert into fields(legacy) values(jsonb_build_object('source_file_id','f1','source_sheet','synthetic','source_row','2','external_namespace','getnet.legacy.transaction','external_id','000000019','profile','GetnetLegacy',
 'alias_key',app_private.payment_history_field_hash_v1(array['getnet-merchant-alias-v1','SYNTHETIC','QA','42','1','test']),
 'merchant_local','SYNTHETIC','merchant_seller','QA','merchant_seller_id','42','merchant_local_number','1','merchant_rut','test',
 'business_ticks',app_private.payment_history_ticks_v1('2020-01-02T11:12:13')::text,'movement_kind','Sale','transaction_state','Abonado','settlement_state','Abonado',
 'gross_clp','1000','fee_clp','100','fee_vat_clp',null,'net_clp','900','timestamp_raw','02/01/2020 11:12:13','offset_raw','', 'offset_minutes',null,'occurred_at_utc_ms',null,
 'time_interpretation','Unresolved','time_policy_version','synthetic-v1','time_evidence_reference','synthetic-attested','card_subtype','Debit','payment_id','','authorization_code','','original_card_type','Debito','original_prepaid','','terminal','','settlement_date_raw',''));
update fields set modern=legacy||jsonb_build_object('profile','GetnetModern','external_namespace','getnet.financial.movement','transaction_state','Confirmada',
 'fee_clp','-100','net_clp',null,'timestamp_raw','2020-01-02T11:12:13.000Z','offset_raw','0','offset_minutes','0',
 'occurred_at_utc_ms',(extract(epoch from timestamptz '2020-01-02T11:12:13Z')*1000)::bigint::text,'time_interpretation','IsoUtc');
insert into public.payment_history_merchant_aliases(shop_id,merchant_id,alias_key,source_identity,evidence_id)
 select '10000000-0000-4000-8000-000000073019','c0000000-0000-4000-8000-000000073019',legacy->>'alias_key','{}','d0000000-0000-4000-8000-000000073019' from fields;
create function pg_temp.review(f jsonb default null,source_hash text default null,start_ticks text default null,policies uuid[] default null) returns jsonb language sql as $$
 select app_private.payment_history_local_review_transaction_v2('10000000-0000-4000-8000-000000073019',coalesce(f,(select legacy from fields)),coalesce(source_hash,repeat('a',64)),
  coalesce(start_ticks,app_private.payment_history_ticks_v1('2021-01-01T00:00:00')::text),coalesce(policies,array['e0000000-0000-4000-8000-000000073019','f0000000-0000-4000-8000-000000073019','a0000000-0000-4000-8000-000000073019']::uuid[]))
$$;
select is(pg_temp.review()->>'merchant_id','c0000000-0000-4000-8000-000000073019','review derives the canonical merchant from verified mapping');
select is(pg_temp.review()#>>'{transaction,parserVersion}','history-pos-normalized-v2','real normalized provenance is retained');
select is(pg_temp.review()#>'{transaction,commissionVatClp}','null'::jsonb,'unknown legacy VAT is not invented');
select is(pg_temp.review()#>>'{economics,netClp}','900','exact validated CLP economics reach the review');
select is((select count(*) from public.payment_history_batches where shop_id='10000000-0000-4000-8000-000000073019'),0::bigint,'review does not apply an economic batch');
select is((select count(*) from public.pos_sales where shop_id='10000000-0000-4000-8000-000000073019'),0::bigint,'review does not create a native sale');
select throws_ok($$select app_private.payment_history_economics_v1((pg_temp.review()->'transaction')||jsonb_build_object('parserVersion','untrusted-parser'))$$,'22023','payment_history_transaction_invalid','parser marker remains a closed allowlist');
select throws_ok($$select pg_temp.review(start_ticks=>app_private.payment_history_ticks_v1('2022-01-01T00:00:00')::text)$$,'22023','payment_history_local_native_start_unverified','client cannot move the verified start date');
select throws_ok($$select pg_temp.review(policies=>array[]::uuid[])$$,'22023','payment_history_local_native_start_unverified','operator reference text does not replace server policies');
select throws_ok($$select pg_temp.review(source_hash=>repeat('b',64))$$,'22023','payment_history_local_native_start_unverified','evidence remains scoped to source bytes');
select throws_ok($$select pg_temp.review(policies=>array['e0000000-0000-4000-8000-000000073019']::uuid[])$$,'22023','payment_history_local_currency_unverified','CLP evidence is required independently of start date');
select throws_ok($$select pg_temp.review(legacy||jsonb_build_object('merchant_seller','OTHER','alias_key',app_private.payment_history_field_hash_v1(array['getnet-merchant-alias-v1','SYNTHETIC','OTHER','42','1','test']))) from fields$$,'22023','payment_history_local_merchant_unverified','new alias cannot borrow a verified merchant');
select throws_ok($$select pg_temp.review(modern,policies=>array['e0000000-0000-4000-8000-000000073019']::uuid[]) from fields$$,'22023','payment_history_local_provider_time_unverified','a Z column does not establish the provider time policy');
select throws_ok($$select pg_temp.review(modern) from fields$$,'22023','payment_history_local_provider_time_unverified','operator attestation cannot promote modern time to provider proof');
insert into public.payment_history_uploads(upload_id,shop_id,actor_kind,actor_id,object_key,file_name,file_sha256,byte_length,state)
 values('b0000000-0000-4000-8000-000000073019','10000000-0000-4000-8000-000000073019','pos_staff_manager','30000000-0000-4000-8000-000000073019','history/10000000-0000-4000-8000-000000073019/b0000000-0000-4000-8000-000000073019','synthetic-provider.pdf',repeat('c',64),1,'uploaded');
insert into public.payment_history_evidence(evidence_id,shop_id,kind,verification_level,status,policy_version,reference,scope,actor_kind,actor_id,verified_at,document_sha256,document_upload_id)
 select 'a0000000-0000-4000-8000-000000073020',shop_id,kind,'provider_verified','verified',policy_version,reference,scope,actor_kind,actor_id,clock_timestamp(),repeat('c',64),'b0000000-0000-4000-8000-000000073019'
 from public.payment_history_evidence where evidence_id='a0000000-0000-4000-8000-000000073019';
select throws_ok($$select pg_temp.review(modern,policies=>array['e0000000-0000-4000-8000-000000073019','a0000000-0000-4000-8000-000000073020']::uuid[]) from fields$$,'22023','payment_history_local_provider_time_unverified','a document hash without verified storage evidence is insufficient');
update public.payment_history_uploads set state='verified',verified_at=clock_timestamp() where upload_id='b0000000-0000-4000-8000-000000073019';
select is((select pg_temp.review(modern,policies=>array['e0000000-0000-4000-8000-000000073019','a0000000-0000-4000-8000-000000073020']::uuid[])#>'{economics,netClp}' from fields),'null'::jsonb,'synthetic provider-verified policy permits review while preserving unknown net');
update public.payment_history_uploads set state='rejected' where upload_id='b0000000-0000-4000-8000-000000073019';
select throws_ok($$select pg_temp.review(modern,policies=>array['e0000000-0000-4000-8000-000000073019','a0000000-0000-4000-8000-000000073020']::uuid[]) from fields$$,'22023','payment_history_local_provider_time_unverified','revoked storage verification closes the modern policy');
update public.payment_history_evidence set status='revoked' where evidence_id='f0000000-0000-4000-8000-000000073019';
select throws_ok($$select pg_temp.review()$$,'22023','payment_history_local_currency_unverified','revocation is observed before another decision');
select throws_ok($$select app_private.payment_history_local_review_transaction_v2('10000000-0000-4000-8000-000000073020',legacy,repeat('a',64),app_private.payment_history_ticks_v1('2021-01-01T00:00:00')::text,array['e0000000-0000-4000-8000-000000073019']::uuid[]) from fields$$,'22023','payment_history_local_merchant_unverified','proofs do not cross tenants');
select is((select count(*) from public.payment_history_local_publications where shop_id='10000000-0000-4000-8000-000000073019'),0::bigint,'review does not mint or renew a publication grant');
select is((select count(*) from public.payment_history_receipts where shop_id='10000000-0000-4000-8000-000000073019'),0::bigint,'review cannot manufacture an acquired receipt');
select * from finish();
rollback;
