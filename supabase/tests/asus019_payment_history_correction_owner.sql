begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(12);
create function pg_temp.correction(p jsonb default '{}',omit text default '') returns text language sql as $$
 select jsonb_build_array(jsonb_build_object('kind','correction','fields',(jsonb_build_object(
  'source_file_id','synthetic','source_sheet','synthetic','source_row','2','previous_transaction_id','9007199254740993',
  'previous_local_batch_id','synthetic-local-batch','previous_apply_operation_id','10000000-0000-4000-8000-000000083019',
  'previous_economic_digest',repeat('a',64),'proposed_economic_digest',repeat('b',64),'context_fingerprint',repeat('c',64),
  'evidence_reference','synthetic-attestation','approval_fingerprint',repeat('d',64))||p)-omit))::text;$$;
select ok(not has_function_privilege('service_role','app_private.payment_history_local_page_v2(text)','EXECUTE'),'shape validation cannot be called as an economic authorization');
select is(app_private.payment_history_local_page_v2(pg_temp.correction()),1,'a bounded correction binds a stable local batch and Apply operation');
select throws_ok($$select app_private.payment_history_local_page_v2(pg_temp.correction(omit=>'previous_local_batch_id'))$$,'22023','payment_history_local_record_invalid','a local numeric row ID alone cannot identify its global owner');
select throws_ok($$select app_private.payment_history_local_page_v2(pg_temp.correction('{"previous_apply_operation_id":null}'))$$,'22023','payment_history_local_correction_owner_invalid','missing previous Apply is denied');
select throws_ok($$select app_private.payment_history_local_page_v2(pg_temp.correction('{"previous_apply_operation_id":"not-a-uuid"}'))$$,'22023','payment_history_local_correction_owner_invalid','malformed previous Apply is denied');
select throws_ok($$select app_private.payment_history_local_page_v2(pg_temp.correction('{"previous_apply_operation_id":"00000000-0000-0000-0000-000000000000"}'))$$,'22023','payment_history_local_correction_owner_invalid','empty UUID is not a previous operation');
select throws_ok($$select app_private.payment_history_local_page_v2(pg_temp.correction('{"previous_local_batch_id":""}'))$$,'22023','payment_history_local_correction_owner_invalid','empty batch is denied');
select throws_ok($$select app_private.payment_history_local_page_v2(pg_temp.correction(jsonb_build_object('previous_local_batch_id',repeat('a',257))))$$,'22023','payment_history_local_correction_owner_invalid','local batch identity is bounded');
select throws_ok($$select app_private.payment_history_local_page_v2(pg_temp.correction(jsonb_build_object('previous_local_batch_id','synthetic'||chr(10))))$$,'22023','payment_history_local_correction_owner_invalid','control characters cannot enter owner identity');
select throws_ok($$select app_private.payment_history_local_page_v2(pg_temp.correction('{"previous_transaction_id":"0"}'))$$,'22023','payment_history_local_correction_owner_invalid','local source row identity is positive');
select throws_ok($$select app_private.payment_history_local_page_v2(pg_temp.correction('{"previous_transaction_id":"9223372036854775808"}'))$$,'22023','payment_history_local_correction_owner_invalid','exact local row identity cannot overflow Int64');
select throws_ok($$select app_private.payment_history_local_page_v2(pg_temp.correction('{"credential":"synthetic"}'))$$,'22023','payment_history_local_record_invalid','unknown financial or credential fields remain closed');
select * from finish();
rollback;
