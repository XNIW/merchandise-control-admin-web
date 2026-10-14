begin;
set local role postgres;
set local search_path=public,extensions;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- FIXTURE_BEGIN: synthetic empty-clone data only; no live row is inspected.
insert into auth.users(instance_id,id,aud,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000008101','authenticated','authenticated','{}','{}',now(),now());
update public.profiles set profile_status='active',disabled_at=null where profile_id='00000000-0000-4000-8000-000000008101';
insert into public.shops(shop_id,shop_code,shop_name,shop_status) values
('10000000-0000-4000-8000-000000008101','HNORMLOCAL','Synthetic normalization shop','active'),
('10000000-0000-4000-8000-000000008102','HNORMOTHER','Synthetic outside scope','active');
insert into public.shop_members(profile_id,shop_id,role_key,membership_status) values
('00000000-0000-4000-8000-000000008101','10000000-0000-4000-8000-000000008101','shop_owner','active');
-- Manufacture the historical physical representation on INSERT, with all
-- triggers active. Restore EXTERNAL before invoking plan or apply.
alter table public.shared_sheet_sessions alter column data set storage extended,alter column data set compression pglz,
  alter column session_overlay set storage extended,alter column session_overlay set compression pglz;
insert into public.shared_sheet_sessions(remote_id,payload_version,"timestamp",supplier,category,is_manual_entry,data,owner_user_id,shop_id,display_name,updated_at,session_overlay)
select '25000000-0000-4000-8000-'||lpad(i::text,12,'0'),2,'2026-09-28 10:00:00','Synthetic supplier','Synthetic category',false,
  jsonb_build_array(jsonb_build_array(repeat('fixture',2200))),
  '00000000-0000-4000-8000-000000008101',case when i=8103 then '10000000-0000-4000-8000-000000008102'::uuid else '10000000-0000-4000-8000-000000008101'::uuid end,
  'Synthetic physical fixture','2026-09-28T10:00:00.123456Z',
  case when i=8101 then jsonb_build_object('overlay_schema',1,'editable',jsonb_build_array(jsonb_build_array(repeat('overlay',1000))),'complete',jsonb_build_array(true)) else null end
from unnest(array[8101,8102,8103,8111,8112])i;
insert into public.shared_sheet_sessions(remote_id,payload_version,"timestamp",supplier,category,is_manual_entry,data,owner_user_id,shop_id,display_name)
select '25000000-0000-4000-8000-'||lpad(i::text,12,'0'),2,'2026-09-28 10:00:00','Synthetic','Synthetic',false,value,
  '00000000-0000-4000-8000-000000008101','10000000-0000-4000-8000-000000008101','Synthetic invalid payload'
from (values
 (8104,jsonb_build_array(jsonb_build_array((select string_agg(repeat(md5(n::text),20),'') from generate_series(1,1200)n)))),
 (8106,jsonb_build_array((select jsonb_agg('1e100000'::jsonb) from generate_series(1,1000)))),
 (8107,jsonb_build_array(jsonb_build_array(jsonb_build_object('nested','1e100000'::jsonb),repeat('nested',2000)))),
 (8108,jsonb_build_array(jsonb_build_array(repeat('logical',80000))))
) fixture(i,value);
alter table public.shared_sheet_sessions alter column data set compression lz4;
insert into public.shared_sheet_sessions(remote_id,payload_version,"timestamp",supplier,category,is_manual_entry,data,owner_user_id,shop_id,display_name)
values ('25000000-0000-4000-8000-000000008105',2,'2026-09-28 10:00:00','Synthetic','Synthetic',false,jsonb_build_array(jsonb_build_array(repeat('lz4',5000))),
 '00000000-0000-4000-8000-000000008101','10000000-0000-4000-8000-000000008101','Synthetic lz4 fixture');
alter table public.shared_sheet_sessions alter column data set storage external,alter column data set compression default,
  alter column session_overlay set storage external,alter column session_overlay set compression default;
-- FIXTURE_END

create function pg_temp.plan_ids(ids text[]) returns jsonb language sql stable as $$
 select app_private.wechat_history_normalization_plan_v1('10000000-0000-4000-8000-000000008101',ids)
$$;
create function pg_temp.plan_one(n int) returns jsonb language sql stable as $$
 select pg_temp.plan_ids(array['25000000-0000-4000-8000-'||lpad(n::text,12,'0')])
$$;
create temporary table norm_manifest(m jsonb);
alter table norm_manifest alter column m set storage external;
insert into norm_manifest select pg_temp.plan_ids(array['25000000-0000-4000-8000-000000008101','25000000-0000-4000-8000-000000008102']);
create temporary table norm_events as select count(*) n from public.sync_events;
create temporary table outside_scope as select md5(to_jsonb(row)::text) hash from public.shared_sheet_sessions row where remote_id='25000000-0000-4000-8000-000000008103';

select is((select pg_column_compression(data) from public.shared_sheet_sessions where remote_id='25000000-0000-4000-8000-000000008101'),'pglz','positive fixture physically PGLZ compressed');
select is((select pg_column_compression(session_overlay) from public.shared_sheet_sessions where remote_id='25000000-0000-4000-8000-000000008101'),'pglz','overlay independently PGLZ compressed');
select is((select pg_column_compression(data) from public.shared_sheet_sessions where remote_id='25000000-0000-4000-8000-000000008105'),'lz4','negative fixture really LZ4');
select ok((select pg_column_size(data)>7681 and pg_column_compression(data)='pglz' from public.shared_sheet_sessions where remote_id='25000000-0000-4000-8000-000000008104'),'negative PGLZ fixture exceeds conservative expansion bound');
select is((select jsonb_array_length(m->'rows') from norm_manifest),2,'plan exact two rows');
select ok((select m#>>'{rows,0,row_sha256}' ~ '^[0-9a-f]{64}$' from norm_manifest),'plan emits hash only after canonical typed validation');
select ok((select not app_private.sync_jsonb_storage_is_bounded_v1(data,1048576,0) from public.shared_sheet_sessions where remote_id='25000000-0000-4000-8000-000000008101'),'ordinary runtime storage guard still fails closed');
select throws_ok($$update public.shared_sheet_sessions set data=data||'[]'::jsonb where remote_id='25000000-0000-4000-8000-000000008101'$$,'23514','history row JSONB requires bounded external storage','ordinary unmarked preserving UPDATE still rejected');
select throws_ok($$select pg_temp.plan_one(8104)$$,'23514','history_normalization_expansion_budget','overbudget PGLZ rejected before detoast');
select throws_ok($$select pg_temp.plan_one(8105)$$,'23514','history_normalization_compression_unsupported','LZ4 rejected');
select throws_ok($$select pg_temp.plan_one(8106)$$,'23514','history_normalization_canonical_payload_invalid','numeric exponent rejected before any JSON text');
select throws_ok($$select pg_temp.plan_one(8107)$$,'23514','history_normalization_canonical_payload_invalid','nested numeric object rejected before any JSON text');
select throws_ok($$select pg_temp.plan_one(8108)$$,'23514','history_normalization_canonical_payload_invalid','typed data beyond canonical logical budget rejected');
select throws_ok($$select app_private.wechat_history_normalization_clone_v1(jsonb_build_object('wrong',repeat('root',4000)),'array')$$,'23514','history_normalization_root_type','wrong root rejected before serializer');
select throws_ok($$select app_private.wechat_history_normalization_clone_v1(jsonb_build_array(jsonb_build_array(repeat('x',1100000))),'array')$$,'23514','history_normalization_binary_budget','uncompressed binary exceeds canonical storage envelope');
select throws_ok($$select app_private.wechat_history_normalization_clone_v1(jsonb_build_array(jsonb_build_array(repeat('x',2200000))),'array')$$,'23514','history_normalization_expansion_budget','uncompressed input also bounded');
select throws_ok($$select pg_temp.plan_one(8103)$$,'22023','history_normalization_row_scope_mismatch','cross-shop row rejected');
select throws_ok($$select pg_temp.plan_ids(array[]::text[])$$,'22023','history_normalization_batch_invalid','empty batch rejected');
select throws_ok($$select pg_temp.plan_ids(array_fill('25000000-0000-4000-8000-000000008101'::text,array[33]))$$,'22023','history_normalization_batch_invalid','batch above32 rejected');
select throws_ok($$select pg_temp.plan_ids(array['25000000-0000-4000-8000-000000008101','25000000-0000-4000-8000-000000008101'])$$,'22023','history_normalization_ids_not_sorted_unique','duplicate identifiers rejected');
select throws_ok($$select pg_temp.plan_ids(array['25000000-0000-4000-8000-000000008102','25000000-0000-4000-8000-000000008101'])$$,'22023','history_normalization_ids_not_sorted_unique','unsorted identifiers rejected');
select throws_ok($$select app_private.wechat_history_normalization_apply_v1('10000000-0000-4000-8000-000000008102',(select m from norm_manifest))$$,'22023','history_normalization_manifest_invalid','manifest bound to shop');
select throws_ok($$select app_private.wechat_history_normalization_apply_v1('10000000-0000-4000-8000-000000008101',(select jsonb_set(m,'{rows,1,row_sha256}',to_jsonb(repeat('0',64))) from norm_manifest))$$,'40001','history_normalization_manifest_mismatch','hash mismatch aborts before writes');
select throws_ok($$select app_private.wechat_history_normalization_apply_v1('10000000-0000-4000-8000-000000008101',(select m||'{"extra":true}'::jsonb from norm_manifest))$$,'40001','history_normalization_manifest_mismatch','manifest extra fields rejected');

select ok(not has_function_privilege(role,fn,'EXECUTE'),'no maintenance EXECUTE for '||role||' / '||fn)
from unnest(array['anon','authenticated','service_role'])role cross join unnest(array[
'app_private.wechat_history_normalization_plan_v1(uuid,text[])',
'app_private.wechat_history_normalization_apply_v1(uuid,jsonb)',
'app_private.wechat_history_normalization_clone_v1(jsonb,text)',
'app_private.wechat_history_normalization_hash_v1(public.shared_sheet_sessions)'])fn;
select ok(not has_table_privilege(role,'app_private.wechat_history_normalization_marks','INSERT'),'marker cannot be forged by '||role)
from unnest(array['anon','authenticated','service_role'])role;
select ok((select bool_and(not prosecdef) from pg_proc where proname like 'wechat_history_normalization_%'),'all maintenance entry/helper functions are invoker');
select ok((select relrowsecurity from pg_class where oid='app_private.wechat_history_normalization_marks'::regclass),'marker table RLS enabled with no client policy');
set local role service_role;
select throws_ok($$select app_private.wechat_history_normalization_plan_v1('10000000-0000-4000-8000-000000008101',array['25000000-0000-4000-8000-000000008101'])$$,'42501',null,'actual service caller rejected');
select throws_ok($$insert into app_private.wechat_history_normalization_marks values(pg_current_xact_id(),pg_backend_pid(),'25000000-0000-4000-8000-000000008101','10000000-0000-4000-8000-000000008101',now(),repeat('0',64))$$,'42501',null,'actual service marker forge rejected');
set local role postgres;

-- Even a privileged synthetic marker with the wrong transaction is unusable.
insert into app_private.wechat_history_normalization_marks
select '1'::xid8,pg_backend_pid(),m#>>'{rows,0,id}','10000000-0000-4000-8000-000000008101',(m#>>'{rows,0,updated_at}')::timestamptz,m#>>'{rows,0,row_sha256}' from norm_manifest;
select throws_ok($$update public.shared_sheet_sessions set data=data||'[]'::jsonb where remote_id='25000000-0000-4000-8000-000000008101'$$,'23514','history row JSONB requires bounded external storage','old transaction marker cannot authorize rewrite');
delete from app_private.wechat_history_normalization_marks;
insert into app_private.wechat_history_normalization_marks
select pg_current_xact_id(),pg_backend_pid()+1,m#>>'{rows,0,id}','10000000-0000-4000-8000-000000008101',(m#>>'{rows,0,updated_at}')::timestamptz,m#>>'{rows,0,row_sha256}' from norm_manifest;
select throws_ok($$update public.shared_sheet_sessions set data=data||'[]'::jsonb where remote_id='25000000-0000-4000-8000-000000008101'$$,'23514','history row JSONB requires bounded external storage','other backend marker cannot authorize rewrite');
delete from app_private.wechat_history_normalization_marks;
insert into app_private.wechat_history_normalization_marks
select pg_current_xact_id(),pg_backend_pid(),m#>>'{rows,0,id}','10000000-0000-4000-8000-000000008101',(m#>>'{rows,0,updated_at}')::timestamptz,m#>>'{rows,0,row_sha256}' from norm_manifest;
select throws_ok($$update public.shared_sheet_sessions set data=data||'[]'::jsonb,session_overlay=session_overlay||'{}'::jsonb,display_name='not physical' where remote_id='25000000-0000-4000-8000-000000008101'$$,'23514','history_normalization_content_mismatch','valid marker never authorizes metadata edits');
select throws_ok($$update public.shared_sheet_sessions set data=data||'[]'::jsonb,session_overlay=session_overlay||'{}'::jsonb,updated_at=now() where remote_id='25000000-0000-4000-8000-000000008101'$$,'23514','history_normalization_content_mismatch','valid marker never authorizes revision edits');
select throws_ok($$update public.shared_sheet_sessions set data='[["different content"]]'::jsonb,session_overlay=session_overlay||'{}'::jsonb where remote_id='25000000-0000-4000-8000-000000008101'$$,'23514','history_normalization_content_mismatch','valid marker never authorizes content edits');
delete from app_private.wechat_history_normalization_marks;

-- A test-only fault AFTER the first row demonstrates statement atomicity.
create temporary sequence normalization_attempts;
create function pg_temp.fail_second_normalization() returns trigger language plpgsql as $$
begin
 perform nextval('pg_temp.normalization_attempts');
 if new.remote_id='25000000-0000-4000-8000-000000008102' then raise exception 'synthetic_second_row_failure'; end if;
 return new;
end;$$;
create trigger zzz_synthetic_normalization_fault before update on public.shared_sheet_sessions for each row execute function pg_temp.fail_second_normalization();
select throws_ok($$select app_private.wechat_history_normalization_apply_v1('10000000-0000-4000-8000-000000008101',(select m from norm_manifest))$$,'P0001','synthetic_second_row_failure','later failure aborts the entire batch');
select is(currval('pg_temp.normalization_attempts'),2::bigint,'fault occurred only after processing first row');
select is((select count(*) from public.shared_sheet_sessions where remote_id in('25000000-0000-4000-8000-000000008101','25000000-0000-4000-8000-000000008102') and pg_column_compression(data)='pglz'),2::bigint,'rollback restores both original physical representations');
select is((select count(*) from app_private.wechat_history_normalization_marks),0::bigint,'failed batch leaves no markers');
select is((select count(*) from public.sync_events),(select n from norm_events),'failed batch emits no events');
drop trigger zzz_synthetic_normalization_fault on public.shared_sheet_sessions;

select is(app_private.wechat_history_normalization_apply_v1('10000000-0000-4000-8000-000000008101',(select m from norm_manifest))->>'status','normalized','exact preserving apply succeeds');
select is((select count(*) from public.shared_sheet_sessions where remote_id in('25000000-0000-4000-8000-000000008101','25000000-0000-4000-8000-000000008102') and pg_column_compression(data) is null and pg_column_compression(session_overlay) is null),2::bigint,'both persisted payloads uncompressed');
select is((select count(*) from public.sync_events),(select n from norm_events),'successful physical apply adds zero events');
select is((select count(*) from app_private.wechat_history_normalization_marks),0::bigint,'markers consumed');
select ok(not exists(select 1 from norm_manifest,jsonb_array_elements(m->'rows')r join public.shared_sheet_sessions s on s.remote_id=r->>'id' where app_private.wechat_history_normalization_hash_v1(s) is distinct from r->>'row_sha256'),'all content and metadata hashes unchanged');
select is((select md5(to_jsonb(row)::text) from public.shared_sheet_sessions row where remote_id='25000000-0000-4000-8000-000000008103'),(select hash from outside_scope),'outside shop unchanged');
select throws_ok($$select app_private.wechat_history_normalization_apply_v1('10000000-0000-4000-8000-000000008101',(select m from norm_manifest))$$,'22023','history_normalization_row_already_uncompressed','manifest replay is rejected');
select ok((select app_private.sync_jsonb_storage_is_bounded_v1(data,1048576,0) from public.shared_sheet_sessions where remote_id='25000000-0000-4000-8000-000000008101'),'unchanged runtime guard now accepts normalized row');
select lives_ok($$update public.shared_sheet_sessions set data=data where remote_id='25000000-0000-4000-8000-000000008101'$$,'ordinary canonical no-op remains available');
select is((select count(*) from public.sync_events),(select n from norm_events),'ordinary no-op also stays event silent');
select * from finish();
rollback;
