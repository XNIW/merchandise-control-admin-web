begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(27);
select has_table('app_private','pos_catalog_import_recovery_uploads','private upload ledger exists');
select has_table('app_private','pos_catalog_import_recovery_upload_parts','private exact-byte parts exist');
select has_table('app_private','pos_catalog_import_recovery_plans','private complete-plan ledger exists');
select has_table('app_private','pos_catalog_import_recovery_plan_parts','private child durable ACK ledger exists');
select has_function('public','pos_catalog_import_recovery_v1',array['uuid','uuid','uuid','uuid','uuid','text','jsonb'],'service RPC exists');
select ok(not has_function_privilege('anon','public.pos_catalog_import_recovery_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)','execute'),'anon cannot call multipart RPC');
select ok(not has_function_privilege('authenticated','public.pos_catalog_import_recovery_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)','execute'),'authenticated cannot bypass current trust');
select ok(has_function_privilege('service_role','public.pos_catalog_import_recovery_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)','execute'),'server service role can call scoped RPC');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='app_private.pos_catalog_import_recovery_uploads'::regclass),'upload forced RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='app_private.pos_catalog_import_recovery_upload_parts'::regclass),'exact-byte parts forced RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='app_private.pos_catalog_import_recovery_plans'::regclass),'plan forced RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='app_private.pos_catalog_import_recovery_plan_parts'::regclass),'child ACK forced RLS');
select ok(not has_table_privilege('anon','app_private.pos_catalog_import_recovery_uploads','select'),'anon cannot read originals');
select ok(not has_table_privilege('authenticated','app_private.pos_catalog_import_recovery_uploads','select'),'authenticated cannot enumerate originals');
select ok(not has_table_privilege('service_role','app_private.pos_catalog_import_recovery_uploads','select'),'service has no direct upload grant');
select ok(not has_table_privilege('service_role','app_private.pos_catalog_import_recovery_upload_parts','select'),'service has no direct raw part grant');
select ok(not has_table_privilege('service_role','app_private.pos_catalog_import_recovery_plans','insert'),'service cannot forge plans through table API');
select ok(not has_table_privilege('service_role','app_private.pos_catalog_import_recovery_plan_parts','update'),'service cannot forge accepted child ACKs through table API');
select ok((select prosecdef and proconfig @> array['search_path=public, app_private, extensions, pg_temp'] from pg_proc
  where oid='public.pos_catalog_import_recovery_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure),'RPC uses fixed search path');
select ok(not has_function_privilege('service_role','app_private.pos_catalog_import_apply_pre_correction_v2(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz,jsonb,jsonb,jsonb)','execute'),'multipart does not expose unfenced legacy apply');
select ok(not has_function_privilege('service_role','app_private.pos_catalog_import_recovery_ack_valid_v1(text,jsonb,jsonb)','execute'),'full ACK validator is private');
select ok(not has_function_privilege('service_role','app_private.pos_catalog_import_recovery_ancestor_v1(uuid,uuid,uuid,uuid)','execute'),'lineage traversal is private');
select ok((select indisunique from pg_index where indexrelid='app_private.pos_import_recovery_one_initial_plan'::regclass),'logical root initial plan is unique');
select ok((select indisunique from pg_index where indexrelid='app_private.pos_import_recovery_one_successor'::regclass),'predecessor cannot fork successors');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) and count(*)=9 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='app_private' and c.relname in('pos_import_recovery_admissions','pos_import_recovery_capacity','pos_import_recovery_registration','pos_import_recovery_descriptors','pos_import_recovery_documents','pos_import_recovery_raw_rows','pos_import_recovery_normal_rows','pos_import_recovery_child_headers','pos_import_recovery_page_acks')),'all bounded staging tables use forced RLS');
select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join(values('anon'),('authenticated'),('service_role')) caller(role)
 where n.nspname='app_private' and c.relname in('pos_import_recovery_admissions','pos_import_recovery_capacity','pos_import_recovery_registration','pos_import_recovery_descriptors','pos_import_recovery_documents','pos_import_recovery_raw_rows','pos_import_recovery_normal_rows','pos_import_recovery_child_headers','pos_import_recovery_page_acks')
 and(has_table_privilege(caller.role,c.oid,'select') or has_table_privilege(caller.role,c.oid,'insert') or has_table_privilege(caller.role,c.oid,'update') or has_table_privilege(caller.role,c.oid,'delete'))),'no public/server role can bypass bounded staging through table APIs');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join(values('anon'),('authenticated'),('service_role')) caller(role)
 where n.nspname='app_private' and p.proname in('pos_catalog_import_recovery_small_v1','pos_import_recovery_phased_v1','pos_import_recovery_quota_ok_v1','pos_import_recovery_json_precision_v1','pos_import_recovery_template_v1','pos_import_recovery_reserve_v1','pos_catalog_import_retire_pre_multipart_v1') and has_function_privilege(caller.role,p.oid,'execute')),'all bounded internal helpers reject direct RPC role execute');
select * from finish();
rollback;
