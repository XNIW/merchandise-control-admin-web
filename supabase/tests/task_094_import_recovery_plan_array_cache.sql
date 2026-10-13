-- TASK-094: immutable plan-array cache, real compiled chain and independent oracle.
-- SOURCE ONLY / NOT_RUN. The verbatim actual forward8 DO is embedded from
-- supabase/migrations/20261013005324_pos_import_recovery_plan_array_cache.sql.
-- Canonical DO UTF8 SHA256: 6fe223266981e151528b5c68ca20cf9985d1a06afb1a8203caf67922ed9f3079
-- This suite compiles
-- the pinned candidate only inside caught/rollback transactions, on the existing
-- Small function/OID/ACL and real auth/receipt/plan tables. No auth or ACK stub.
-- Manually staged verified uploads qualify plan semantics, not raw parser/TS
-- normalization admission. Real accepted proof ACKs come from apply_v2 below.
begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select set_config('request.jwt.claim.role','service_role',true);
select no_plan();

create temporary table cache_sources(name text primary key,body text not null);
create temporary table cache_installed as
select to_jsonb(p) value from pg_catalog.pg_proc p
where oid='app_private.pos_catalog_import_recovery_small_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure;

do $source$
declare
 v_current text;v_old text;v_new text;v_prefix text;v_tail text;v_start integer;v_guard integer;
 v_declaration constant text:=E' v_plan_parts jsonb;v_plan_coverage jsonb;\n';
 v_assignment constant text:=E'   v_plan_parts:=v_expected->''parts'';v_plan_coverage:=v_expected->''coverage'';\n';
 v_guard_end constant text:=E'     or jsonb_array_length(v_expected->''parts'')>1024 then return jsonb_build_object(''ok'',false,''code'',''validation_failed'');end if;\n';
begin
 select replace(prosrc,E'\r\n',E'\n') into strict v_current from pg_catalog.pg_proc
 where oid='app_private.pos_catalog_import_recovery_small_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure;
 if encode(extensions.digest(convert_to(v_current,'UTF8'),'sha256'),'hex')=
 'e3d5f3c0878830e2b1afc732b6e65f3cb5c95de5b7760368b1531d10313dddce' then
  if length(v_current)-length(replace(v_current,v_declaration,''))<>length(v_declaration)
   or length(v_current)-length(replace(v_current,v_assignment,''))<>length(v_assignment) then
   raise exception 'cache inverse anchor mismatch';end if;
  v_old:=replace(replace(v_current,v_declaration,''),v_assignment,'');
  v_old:=replace(replace(v_old,'v_plan_parts','v_expected->''parts'''),'v_plan_coverage','v_expected->''coverage''');
 else v_old:=v_current;end if;
 if encode(extensions.digest(convert_to(v_old,'UTF8'),'sha256'),'hex')<>
 'f6d28e812a36ffba4b7c279f5bf3c48cf66ae85da637b2ee7676a435c3e56374' then
  raise exception 'unsupported installed Small body' using errcode='55000';end if;
 v_guard:=strpos(v_old,v_guard_end);
 if v_guard=0 or length(v_old)-length(replace(v_old,v_guard_end,''))<>length(v_guard_end) then
  raise exception 'cache original shape guard mismatch';end if;
 v_start:=v_guard+length(v_guard_end);
 v_prefix:=substr(v_old,1,v_start-1);v_tail:=substr(v_old,v_start);
 -- All 16 aliases are strictly after the byte-identical UUID/FOUND/shape guard.
 if (length(v_tail)-length(replace(v_tail,'v_expected->''parts''','')))/length('v_expected->''parts''')<>4
 or (length(v_tail)-length(replace(v_tail,'v_expected->''coverage''','')))/length('v_expected->''coverage''')<>12 then
  raise exception 'cache selector count mismatch';end if;
 v_new:=v_prefix||v_assignment||replace(replace(v_tail,'v_expected->''parts''','v_plan_parts'),'v_expected->''coverage''','v_plan_coverage');
 v_new:=replace(v_new,E' v_hash text;v_count integer;',v_declaration||E' v_hash text;v_count integer;');
 if md5(v_new)<>'fe01bc8ac31a746951b7b2fff8dfb3b1' or
 encode(extensions.digest(convert_to(v_new,'UTF8'),'sha256'),'hex')<>
 'e3d5f3c0878830e2b1afc732b6e65f3cb5c95de5b7760368b1531d10313dddce' then
  raise exception 'cache proposed whole-body mismatch';end if;
 insert into cache_sources values('current',v_current),('prior',v_old),('candidate',v_new);
end;
$source$;
select is((select encode(extensions.digest(convert_to(body,'UTF8'),'sha256'),'hex') from cache_sources where name='prior'),
'f6d28e812a36ffba4b7c279f5bf3c48cf66ae85da637b2ee7676a435c3e56374','independent prior whole Small pin');
select is((select md5(body) from cache_sources where name='candidate'),'fe01bc8ac31a746951b7b2fff8dfb3b1','candidate whole Small MD5');
select is((select encode(extensions.digest(convert_to(body,'UTF8'),'sha256'),'hex') from cache_sources where name='candidate'),
'e3d5f3c0878830e2b1afc732b6e65f3cb5c95de5b7760368b1531d10313dddce','candidate whole Small SHA256');

create function pg_temp.cache_install(p_variant text) returns void language plpgsql as $install$
declare v_target regprocedure:='app_private.pos_catalog_import_recovery_small_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure;
 v_before jsonb;v_after jsonb;v_definition text;v_source text;v_body text;
begin
 select to_jsonb(p) into strict v_before from pg_catalog.pg_proc p where oid=v_target;
 if (v_before-'prosrc') is distinct from (select value-'prosrc' from cache_installed) then
  raise exception 'test compiler catalog drift' using errcode='55000';end if;
 v_source:=v_before->>'prosrc';
 if encode(extensions.digest(convert_to(replace(v_source,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')
 not in('f6d28e812a36ffba4b7c279f5bf3c48cf66ae85da637b2ee7676a435c3e56374','e3d5f3c0878830e2b1afc732b6e65f3cb5c95de5b7760368b1531d10313dddce') then
  raise exception 'test compiler body drift' using errcode='55000';end if;
 select body into strict v_body from cache_sources where name=p_variant;
 v_definition:=pg_catalog.pg_get_functiondef(v_target);
 if length(v_definition)-length(replace(v_definition,v_source,''))<>length(v_source) then
  raise exception 'test compiler definition mismatch';end if;
 execute replace(v_definition,v_source,v_body);
 select to_jsonb(p) into strict v_after from pg_catalog.pg_proc p where oid=v_target;
 if v_after->>'prosrc' is distinct from v_body or (v_after-'prosrc') is distinct from (v_before-'prosrc') then
  raise exception 'test compiler full catalog changed';end if;
end;
$install$;

-- Real lease fixture follows dsc_093_094_134_pos_sales_security; the owner
-- mapping follows wechat_010_admin_identity_case. Values are synthetic only.
insert into auth.users(instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000094801','authenticated','authenticated','cache094@example.invalid','{}','{}',now(),now());
insert into public.profiles(profile_id,display_name,profile_status)
values('00000000-0000-4000-8000-000000094801','TASK094 cache synthetic owner','active') on conflict(profile_id) do update set profile_status='active';
insert into public.shops(shop_id,shop_code,shop_name,shop_status,created_by_profile_id)
values('10000000-0000-4000-8000-000000094801','CACHE094QA','TASK094 cache QA','active','00000000-0000-4000-8000-000000094801');
insert into public.shop_members(profile_id,shop_id,role_key,membership_status)
values('00000000-0000-4000-8000-000000094801','10000000-0000-4000-8000-000000094801','shop_owner','active');
insert into public.shop_inventory_sources(shop_id,owner_user_id,mapping_state,verified_at)
values('10000000-0000-4000-8000-000000094801','00000000-0000-4000-8000-000000094801','mapped',now());
insert into public.staff_accounts(staff_id,shop_id,staff_code,display_name,role_key,status,credential_kind,credential_hash,credential_updated_at,credential_status,credential_version,must_change_credential)
values('30000000-0000-4000-8000-000000094801','10000000-0000-4000-8000-000000094801','CACHE094STAFF','TASK094 cache staff','manager','active','pin','$scrypt-v1$pgTAP-fixture-not-a-real-credential',now(),'active',1,false);
insert into public.shop_devices(shop_device_id,shop_id,device_identifier,device_type,display_name,status)
values('40000000-0000-4000-8000-000000094801','10000000-0000-4000-8000-000000094801','CACHE094DEVICE','pos','TASK094 cache device','active'),
('40000000-0000-4000-8000-000000094802','10000000-0000-4000-8000-000000094801','CACHE094FOREIGN','pos','TASK094 foreign device','active');
insert into public.pos_device_credentials(pos_device_credential_id,shop_id,shop_device_id,staff_id,token_hash,staff_credential_version,status,issued_at,expires_at)
values('50000000-0000-4000-8000-000000094801','10000000-0000-4000-8000-000000094801','40000000-0000-4000-8000-000000094801','30000000-0000-4000-8000-000000094801','sha256:'||repeat('a',64),1,'active',now()-interval'1 hour',now()+interval'1 day');
insert into public.pos_sessions(pos_session_id,shop_id,shop_device_id,staff_id,pos_device_credential_id,session_token_hash,staff_credential_version,status,issued_at,expires_at)
values('60000000-0000-4000-8000-000000094801','10000000-0000-4000-8000-000000094801','40000000-0000-4000-8000-000000094801','30000000-0000-4000-8000-000000094801','50000000-0000-4000-8000-000000094801','sha256:'||repeat('b',64),1,'active',now()-interval'30 minutes',now()+interval'8 hours');
insert into public.staff_role_permissions(shop_id,role_key,permission_key,enabled)
values('10000000-0000-4000-8000-000000094801','manager','catalog.import',true) on conflict(shop_id,role_key,permission_key) do update set enabled=true;
select is(app_private.pos_catalog_import_receipt_authorize_v1('10000000-0000-4000-8000-000000094801','40000000-0000-4000-8000-000000094801','30000000-0000-4000-8000-000000094801','60000000-0000-4000-8000-000000094801','00000000-0000-4000-8000-000000094801'),'ok','real persisted lease/permission/owner chain authorizes');
select ok(not has_function_privilege('service_role','app_private.pos_catalog_import_recovery_small_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)','execute'),'private helper remains non-RPC');
select ok(has_function_privilege('service_role','public.pos_catalog_import_recovery_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)','execute'),'real public RPC role unchanged');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in('app_private.pos_catalog_import_recovery_uploads'::regclass,'app_private.pos_catalog_import_recovery_upload_parts'::regclass,'app_private.pos_catalog_import_recovery_plans'::regclass,'app_private.pos_catalog_import_recovery_plan_parts'::regclass)),'real plan authority tables retain forced RLS');

create temporary table cache_cases as
select ordinality::integer case_no,entry->>'name' case_name,entry spec,
 ('94810000-0000-4000-8000-'||lpad(ordinality::text,12,'0'))::uuid original_id,
 ('94820000-0000-4000-8000-'||lpad(ordinality::text,12,'0'))::uuid upload_id,
 ('94830000-0000-4000-8000-'||lpad(ordinality::text,12,'0'))::uuid plan_id,
 ('94840000-0000-4000-8000-'||lpad(ordinality::text,12,'0'))::uuid predecessor_id,
 null::jsonb payload,null::jsonb expected
from jsonb_array_elements($cases$[
{"name":"ordinary_unknown_header_full_public_projection","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"expectedKind":"planned","expectedParts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","unknown":{"标题":[2,null,1]},"itemCount":1}],"expectedPartCount":1,"expectedItemCount":1,"expectedParentStatus":"partial"},
{"name":"correction_child_same_root_id","parts":[{"kind":"correction","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"r","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"r"}],"expectedKind":"planned","expectedParts":[{"kind":"correction","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","unknown":{"标题":[2,null,1]},"itemCount":1}],"expectedPartCount":1,"expectedItemCount":1,"expectedParentStatus":"partial","mode":"correction"},
{"name":"parts_missing","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"expected":{"ok":false,"code":"validation_failed"},"omit":["parts"]},
{"name":"parts_json_null","parts":null,"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"expected":{"ok":false,"code":"validation_failed"}},
{"name":"parts_object","parts":{},"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"expected":{"ok":false,"code":"validation_failed"}},
{"name":"parts_1025_rejected_before_alias","parts":[],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"generateParts":1025,"expected":{"ok":false,"code":"validation_failed"}},
{"name":"coverage_missing","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"expected":{"ok":false,"code":"validation_failed"},"omit":["coverage"]},
{"name":"coverage_json_null","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":null,"expected":{"ok":false,"code":"validation_failed"}},
{"name":"coverage_scalar","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":"x","expected":{"ok":false,"code":"validation_failed"}},
{"name":"invalid_original_uuid_before_shape","parts":"x","coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"expected":{"ok":false,"code":"validation_failed"},"originalId":"invalid"},
{"name":"missing_scoped_original","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"expected":{"ok":false,"code":"validation_failed"},"foreignOriginal":true},
{"name":"coverage_cardinality_empty","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[],"expected":{"ok":false,"code":"validation_failed"}},
{"name":"coverage_null_root_id","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"kind":"child","clientItemId":null,"partIndex":0,"childClientItemId":"c"}],"expected":{"ok":false,"code":"validation_failed"}},
{"name":"coverage_duplicate_ids","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"},{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"expected":{"ok":false,"code":"validation_failed"},"roots":[{"clientItemId":"r"},{"clientItemId":"r2"}]},
{"name":"coverage_orphan_root","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"orphan","kind":"child","partIndex":0,"childClientItemId":"c"}],"expected":{"ok":false,"code":"validation_failed"}},
{"name":"coverage_missing_child","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"missing"}],"expected":{"ok":false,"code":"validation_failed"}},
{"name":"duplicate_child_tuple","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null},{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"expected":{"ok":false,"code":"validation_failed"}},
{"name":"correction_child_must_equal_root","parts":[{"kind":"correction","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"expected":{"ok":false,"code":"validation_failed"}},
{"name":"invalid_part_integer","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":"bad","childClientItemId":"c"}],"expected":{"ok":false,"code":"validation_failed"}},
{"name":"overflow_part_integer","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":"2147483648","childClientItemId":"c"}],"expected":{"ok":false,"code":"validation_failed"}},
{"name":"legacy_plus_zero","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":"+0","childClientItemId":"c"}],"expectedKind":"planned","expectedParts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","unknown":{"标题":[2,null,1]},"itemCount":1}],"expectedPartCount":1,"expectedItemCount":1,"expectedParentStatus":"partial"},
{"name":"legacy_double_zero","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":"00","childClientItemId":"c"}],"expectedKind":"planned","expectedParts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","unknown":{"标题":[2,null,1]},"itemCount":1}],"expectedPartCount":1,"expectedItemCount":1,"expectedParentStatus":"partial"},
{"name":"legacy_spaced_zero","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":" 0 ","childClientItemId":"c"}],"expectedKind":"planned","expectedParts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","unknown":{"标题":[2,null,1]},"itemCount":1}],"expectedPartCount":1,"expectedItemCount":1,"expectedParentStatus":"partial"},
{"name":"unknown_coverage_kind","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"other","partIndex":0,"childClientItemId":"c"}],"expected":{"ok":false,"code":"validation_failed"}},
{"name":"child_index_gap","parts":[{"kind":"ordinary","index":1,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":1,"childClientItemId":"c"}],"expected":{"ok":false,"code":"validation_failed"}},
{"name":"empty_child_items","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"original_accepted"}],"expected":{"ok":false,"code":"validation_failed"},"mode":"correction"},
{"name":"bound_1000_real_items","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"expectedKind":"planned","expectedParts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","unknown":{"标题":[2,null,1]},"itemCount":1000}],"expectedPartCount":1,"expectedItemCount":1000,"expectedParentStatus":"partial","generateItems":1000},
{"name":"bound_1001_real_items","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"expected":{"ok":false,"code":"validation_failed"},"generateItems":1001},
{"name":"bound_jsonb_size","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"expected":{"ok":false,"code":"validation_failed"},"largeItem":true},
{"name":"original_accepted_zero_child_correction","mode":"correction","parts":[],"coverage":[{"clientItemId":"r","kind":"original_accepted"}],"expectedKind":"planned","expectedParts":[],"expectedPartCount":0,"expectedItemCount":0,"expectedParentStatus":"complete"},
{"name":"real_accepted_contributor_zero_child","parts":[],"coverage":[{"clientItemId":"r","kind":"accepted_contributor"}],"proof":"contributor","expectedKind":"planned","expectedParts":[],"expectedPartCount":0,"expectedItemCount":0,"expectedParentStatus":"complete"},
{"name":"missing_contributor_cannot_be_accepted","parts":[],"coverage":[{"clientItemId":"r","kind":"accepted_contributor"}],"proof":"missing_contributor","expected":{"ok":true,"status":"conflict","reason":"contributor_unavailable"}},
{"name":"real_accepted_plan_part_carried","parts":[],"coverage":[{"clientItemId":"r","kind":"accepted_plan_part"}],"proof":"plan_part","expectedKind":"planned","expectedParts":[],"expectedPartCount":0,"expectedItemCount":0,"expectedParentStatus":"complete"},
{"name":"accepted_plan_part_wrong_hash","parts":[],"coverage":[{"clientItemId":"r","kind":"accepted_plan_part"}],"proof":"wrong_plan_part_hash","expected":{"ok":true,"status":"conflict","reason":"predecessor_ack_not_carried"}},
{"name":"existing_full_coverage_conflict","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"expected":{"ok":true,"status":"conflict","reason":"plan_conflict"},"existingPlan":true},
{"name":"other_device_real_auth_rejects","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"expected":{"ok":false,"code":"auth_denied"},"callerDevice":"40000000-0000-4000-8000-000000094802"}
]$cases$::jsonb) with ordinality source(entry,ordinality);
select is((select count(*) from cache_cases),36::bigint,'all compiled public-chain vectors present');

create temporary table cache_authority(name text primary key,normalized jsonb,receipt jsonb);
insert into cache_authority(name,normalized) values('contributor',jsonb_build_object('items',jsonb_build_array(jsonb_build_object(
 'clientItemId','contrib','barcode','CACHE094CONTRIB','changeKind','new','productName','商品 cache','purchasePrice',2,'retailPrice',3,'quantity',1))));
update cache_authority set receipt=public.pos_catalog_import_apply_v2(
'10000000-0000-4000-8000-000000094801','40000000-0000-4000-8000-000000094801','30000000-0000-4000-8000-000000094801','60000000-0000-4000-8000-000000094801','00000000-0000-4000-8000-000000094801',
'cache-proof-contributor','cache-proof-key','sha256:'||repeat('3',64),'pos-catalog-import-v1','supplier_excel',now(),normalized->'items','{}','{}')
where name='contributor';
select is((select receipt->>'status' from cache_authority where name='contributor'),'accepted','contributor ACK comes from actual apply_v2, never forged');
select ok((select app_private.pos_catalog_import_recovery_ack_valid_v1('pos-catalog-import-v1',normalized,receipt) from cache_authority where name='contributor'),'actual full contributor ACK validates');
insert into app_private.pos_catalog_import_recovery_uploads(shop_id,shop_device_id,upload_id,mode,manifest,manifest_hash,raw_hash,total_bytes,normalized_request,canonical_hash,client_import_id,idempotency_key,original_schema,item_count,verified_at)
select '10000000-0000-4000-8000-000000094801','40000000-0000-4000-8000-000000094801','94850000-0000-4000-8000-000000000001','original','{}','sha256:'||repeat('4',64),'sha256:'||repeat('5',64),2,normalized,'sha256:'||repeat('3',64),'cache-proof-contributor','cache-proof-key','pos-catalog-import-v1',1,now()
from cache_authority where name='contributor';

do $fixtures$
declare c record;v_roots jsonb;v_parts jsonb;v_coverage jsonb;v_plan jsonb;v_items jsonb;v_raw bytea:=convert_to('{}','UTF8');
 v_raw_hash text:='sha256:'||encode(extensions.digest(convert_to('{}','UTF8'),'sha256'),'hex');
 v_device uuid;v_proof jsonb;v_ack jsonb;v_receipt_hash text;v_parent_parts jsonb;v_payload jsonb;v_expected jsonb;v_large text;
begin
 select normalized->'items',receipt,'sha256:'||encode(extensions.digest(receipt::text,'sha256'),'hex') into v_items,v_ack,v_receipt_hash from cache_authority where name='contributor';
 for c in select * from cache_cases order by case_no loop
  v_roots:=coalesce(c.spec->'roots','[{"clientItemId":"r"}]'::jsonb);v_parts:=c.spec->'parts';v_coverage:=c.spec->'coverage';
  if c.spec?'generateItems' then
   select jsonb_agg(jsonb_build_object('clientItemId','i'||i) order by i) into v_roots from generate_series(1,(c.spec->>'generateItems')::integer) i;
   v_parts:=jsonb_set(v_parts,'{0,items}',v_roots);
   select jsonb_agg(jsonb_build_object('clientItemId','i'||i,'kind','child','partIndex',0,'childClientItemId','i'||i) order by i) into v_coverage from generate_series(1,(c.spec->>'generateItems')::integer) i;
  end if;
  if c.spec?'generateParts' then
   select jsonb_agg(jsonb_build_object('kind','ordinary','index',i,'items','[]'::jsonb) order by i) into v_parts from generate_series(0,(c.spec->>'generateParts')::integer-1) i;
  end if;
  if c.spec?'largeItem' then
   select string_agg(md5(i::text),'') into v_large from generate_series(1,70000) i;
   v_parts:=jsonb_set(v_parts,'{0,items,0,unknownLarge}',to_jsonb(v_large));
   if pg_column_size(v_parts->0->'items')<=2097152 then raise exception 'large bound fixture did not cross actual JSONB guard';end if;
  end if;
  -- Root normalization is declared staging here; any accepted root uses a real
  -- durable no-change ACK from the production apply chain, not a fake receipt.
  v_roots:=(select jsonb_agg(item||jsonb_build_object('barcode','cache-root-'||ordinality,'changeKind','no_change','purchasePrice',null,'retailPrice',null) order by ordinality)
   from jsonb_array_elements(v_roots) with ordinality r(item,ordinality));
  v_device:=case when c.spec?'foreignOriginal' then '40000000-0000-4000-8000-000000094802'::uuid else '40000000-0000-4000-8000-000000094801'::uuid end;
  if c.spec->>'mode'='correction' then
   v_proof:=public.pos_catalog_import_apply_v2('10000000-0000-4000-8000-000000094801','40000000-0000-4000-8000-000000094801','30000000-0000-4000-8000-000000094801','60000000-0000-4000-8000-000000094801','00000000-0000-4000-8000-000000094801',
    'cache-root-'||c.case_no,'cache-key-'||c.case_no,'sha256:'||repeat('6',64),'pos-catalog-import-v1','supplier_excel',now(),v_roots,'{}','{}');
   if v_proof->>'status' is distinct from 'accepted' or not app_private.pos_catalog_import_recovery_ack_valid_v1('pos-catalog-import-v1',jsonb_build_object('items',v_roots),v_proof) then
    raise exception 'real correction-root ACK fixture failed';end if;
  elsif not(c.spec?'foreignOriginal') then
   v_proof:=public.pos_catalog_import_retire_v1('10000000-0000-4000-8000-000000094801','40000000-0000-4000-8000-000000094801','30000000-0000-4000-8000-000000094801','60000000-0000-4000-8000-000000094801','00000000-0000-4000-8000-000000094801',
    'cache-root-'||c.case_no,'cache-key-'||c.case_no,'sha256:'||repeat('6',64));
   if v_proof->>'status' is distinct from 'retired' then
    raise exception 'real retirement fixture failed case=% name=% result=%',c.case_no,c.case_name,v_proof;end if;
  end if;
  -- Real A-only retirement/ACK precedes the declared manually staged original.
  -- This plan-semantics fixture does not accumulate upload-capacity reservations.
  insert into app_private.pos_catalog_import_recovery_uploads(shop_id,shop_device_id,upload_id,mode,manifest,manifest_hash,raw_hash,total_bytes,normalized_request,canonical_hash,client_import_id,idempotency_key,original_schema,item_count,verified_at)
  values('10000000-0000-4000-8000-000000094801',v_device,c.original_id,'original','{}','sha256:'||repeat('4',64),v_raw_hash,2,jsonb_build_object('items',v_roots),'sha256:'||repeat('6',64),'cache-root-'||c.case_no,'cache-key-'||c.case_no,'pos-catalog-import-v1',jsonb_array_length(v_roots),now());
  insert into app_private.pos_catalog_import_recovery_uploads(shop_id,shop_device_id,upload_id,mode,manifest,manifest_hash,raw_hash,total_bytes)
  values('10000000-0000-4000-8000-000000094801','40000000-0000-4000-8000-000000094801',c.upload_id,'plan','{"parts":[{}]}'::jsonb,'sha256:'||repeat('7',64),v_raw_hash,2);
  insert into app_private.pos_catalog_import_recovery_upload_parts values('10000000-0000-4000-8000-000000094801','40000000-0000-4000-8000-000000094801',c.upload_id,0,v_raw);
  if c.spec->>'proof' in('contributor','missing_contributor') then
   v_coverage:=jsonb_set(v_coverage,'{0}',(v_coverage->0)||jsonb_build_object('verifiedContributorId',
    case when c.spec->>'proof'='contributor' then '94850000-0000-4000-8000-000000000001' else '94850000-0000-4000-8000-000000000099' end,
    'contributorClientItemId','contrib','contributorReceiptSha256',v_receipt_hash));
  elsif c.spec->>'proof' in('plan_part','wrong_plan_part_hash') then
   v_parent_parts:=jsonb_build_object('kind','ordinary','index',0,'items',v_items,'clientImportId','cache-proof-contributor','idempotencyKey','cache-proof-key','payloadHash','sha256:'||repeat('3',64));
   insert into app_private.pos_catalog_import_recovery_plans(shop_id,shop_device_id,plan_id,original_id,original_client_import_id,original_idempotency_key,original_canonical_hash,plan_hash,mode,coverage,item_count,part_count)
   values('10000000-0000-4000-8000-000000094801','40000000-0000-4000-8000-000000094801',c.predecessor_id,c.original_id,'cache-root-'||c.case_no,'cache-key-'||c.case_no,'sha256:'||repeat('6',64),'sha256:'||repeat('8',64),'replacement','[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"contrib"}]',1,1);
   insert into app_private.pos_catalog_import_recovery_plan_parts values('10000000-0000-4000-8000-000000094801','40000000-0000-4000-8000-000000094801',c.predecessor_id,0,v_parent_parts,v_ack,v_receipt_hash);
   v_coverage:=jsonb_set(v_coverage,'{0}',(v_coverage->0)||jsonb_build_object('contributorPlanId',c.predecessor_id,'contributorPartIndex',0,'contributorClientItemId','contrib',
    'contributorCanonicalPayloadHash','sha256:'||repeat(case when c.spec->>'proof'='plan_part' then '3' else '9' end,64),'contributorReceiptSha256',v_receipt_hash,
    'contributorItemStatus','accepted','contributorRemoteProductId',v_ack->'remoteProductIds'->0->>'remoteProductId'));
  end if;
  v_plan:=jsonb_build_object('planId',c.plan_id,'verifiedOriginalId',coalesce(c.spec->>'originalId',c.original_id::text),'mode',coalesce(c.spec->>'mode','replacement'),
    'planCanonicalHash','sha256:'||repeat('1',64),'itemCount',coalesce((c.spec->>'expectedItemCount')::integer,jsonb_array_length(v_roots)),'parts',v_parts,'coverage',v_coverage,'unknownHeader',jsonb_build_object('商品',jsonb_build_array(1)));
  if c.spec?'omit' then
   for v_proof in select value from jsonb_array_elements(c.spec->'omit') loop v_plan:=v_plan-(v_proof#>>'{}');end loop;
  end if;
  if c.spec->>'proof' in('plan_part','wrong_plan_part_hash') then
   v_plan:=v_plan||jsonb_build_object('supersedes',jsonb_build_object('planId',c.predecessor_id,'retiredChildren','[]'::jsonb));end if;
  if c.spec?'existingPlan' then
   insert into app_private.pos_catalog_import_recovery_plans(shop_id,shop_device_id,plan_id,original_id,original_client_import_id,original_idempotency_key,original_canonical_hash,plan_hash,mode,coverage,item_count,part_count)
   values('10000000-0000-4000-8000-000000094801','40000000-0000-4000-8000-000000094801',c.plan_id,c.original_id,'cache-root-'||c.case_no,'cache-key-'||c.case_no,'sha256:'||repeat('6',64),'sha256:'||repeat('1',64),'replacement',
    jsonb_set(v_coverage,'{0,priorUnknown}',to_jsonb(true)),1,1);
  end if;
  v_payload:=jsonb_build_object('uploadId',c.upload_id,'manifestSha256','sha256:'||repeat('7',64),'rawSha256',v_raw_hash,'plan',v_plan);
  if c.spec->>'expectedKind'='planned' then
   v_expected:=jsonb_build_object('ok',true,'shopId','10000000-0000-4000-8000-000000094801','shopDeviceId','40000000-0000-4000-8000-000000094801',
    'status','planned','planId',c.plan_id,'verifiedOriginalId',c.original_id,'planCanonicalHash','sha256:'||repeat('1',64),'parentStatus',c.spec->>'expectedParentStatus',
    'partCount',(c.spec->>'expectedPartCount')::integer,'itemCount',(c.spec->>'expectedItemCount')::integer,'parts',c.spec->'expectedParts');
  else
   v_expected:=c.spec->'expected';
   if v_expected->>'ok'='true' then v_expected:=v_expected||jsonb_build_object('shopId','10000000-0000-4000-8000-000000094801','shopDeviceId','40000000-0000-4000-8000-000000094801');end if;
  end if;
  update cache_cases set payload=v_payload,expected=v_expected where case_no=c.case_no;
 end loop;
end;
$fixtures$;

-- Whole owned data, including economic/audit/sync tables, is captured using the
-- real catalog's shop/owner columns. No relation/schema or auth function is stubbed.
create function pg_temp.cache_snapshot() returns jsonb language plpgsql volatile as $snapshot$
declare r record;v_rows jsonb;v_value jsonb:='{}';v_predicate text;
begin
 for r in select n.nspname,c.relname,bool_or(a.attname='shop_id') has_shop,bool_or(a.attname='owner_user_id') has_owner
 from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
 where n.nspname in('public','app_private') and c.relkind='r' and a.attnum>0 and not a.attisdropped and a.attname in('shop_id','owner_user_id')
 group by n.nspname,c.relname order by n.nspname,c.relname loop
  v_predicate:=case when r.has_shop then 'to_jsonb(t)->>''shop_id''=''10000000-0000-4000-8000-000000094801''' else '' end;
  if r.has_owner then v_predicate:=v_predicate||case when r.has_shop then ' or ' else '' end||'to_jsonb(t)->>''owner_user_id''=''00000000-0000-4000-8000-000000094801''';end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from %I.%I t where %s',r.nspname,r.relname,v_predicate) into v_rows;
  v_value:=v_value||jsonb_build_object(r.nspname||'.'||r.relname,v_rows);
 end loop;
 return v_value;
end;
$snapshot$;
create function pg_temp.cache_without_target_plan(p_value jsonb,p_plan uuid) returns jsonb language plpgsql immutable as $without$
declare v_key text;v_rows jsonb;v_result jsonb:=p_value;
begin
 foreach v_key in array array['app_private.pos_catalog_import_recovery_plans','app_private.pos_catalog_import_recovery_plan_parts'] loop
  select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb) into v_rows
   from jsonb_array_elements(p_value->v_key) with ordinality source(item,ordinal)
   where item->>'plan_id' is distinct from p_plan::text;
  v_result:=jsonb_set(v_result,array[v_key],v_rows);
 end loop;
 return v_result;
end;
$without$;
create function pg_temp.cache_trial(p_variant text,p_case integer) returns jsonb language plpgsql as $trial$
declare c cache_cases%rowtype;v_before jsonb;v_ns jsonb;v_data jsonb;v_after jsonb;v_result jsonb;v_plan jsonb;v_parts jsonb;v_unchanged boolean;v_created boolean;
 v_state text;v_message text;v_metadata boolean:=false;v_device uuid;
begin
 select * into strict c from cache_cases where case_no=p_case;
 select to_jsonb(p) into strict v_before from pg_catalog.pg_proc p where oid='app_private.pos_catalog_import_recovery_small_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure;
 select to_jsonb(n) into strict v_ns from pg_catalog.pg_namespace n where nspname='app_private';
 v_data:=pg_temp.cache_snapshot();
 begin
  perform pg_temp.cache_install(p_variant);
  select (to_jsonb(p)-'prosrc') is not distinct from (v_before-'prosrc') into v_metadata from pg_catalog.pg_proc p where oid='app_private.pos_catalog_import_recovery_small_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure;
  v_device:=coalesce(c.spec->>'callerDevice','40000000-0000-4000-8000-000000094801')::uuid;
  v_result:=public.pos_catalog_import_recovery_v1('10000000-0000-4000-8000-000000094801',v_device,'30000000-0000-4000-8000-000000094801','60000000-0000-4000-8000-000000094801','00000000-0000-4000-8000-000000094801','plan',c.payload);
  -- New plan.created_at is the sole volatile storage field excluded from paired
  -- payload equality. Presence is captured; full current data must rollback.
  select to_jsonb(p)-'created_at',p.created_at is not null into v_plan,v_created from app_private.pos_catalog_import_recovery_plans p
   where p.shop_id='10000000-0000-4000-8000-000000094801' and p.shop_device_id='40000000-0000-4000-8000-000000094801' and p.plan_id=c.plan_id;
  select coalesce(jsonb_agg(to_jsonb(p) order by part_index),'[]'::jsonb) into v_parts from app_private.pos_catalog_import_recovery_plan_parts p
   where p.shop_id='10000000-0000-4000-8000-000000094801' and p.shop_device_id='40000000-0000-4000-8000-000000094801' and p.plan_id=c.plan_id;
  v_after:=pg_temp.cache_snapshot();
  v_unchanged:=pg_temp.cache_without_target_plan(v_after,c.plan_id) is not distinct from pg_temp.cache_without_target_plan(v_data,c.plan_id);
  raise exception 'cache_trial_rollback' using errcode='Z0942';
 exception when others then
  get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;
  if v_state='Z0942' and v_message='cache_trial_rollback' then v_state:='00000';v_message:=null;end if;
 end;
 return jsonb_build_object('state',v_state,'message',v_message,'value',v_result,'plan',v_plan,'parts',v_parts,'createdAtPresent',v_created,
  'metadataEqual',v_metadata,'otherOwnedDataUnchanged',v_unchanged,
  'rollbackCatalogEqual',(select to_jsonb(p) from pg_catalog.pg_proc p where oid='app_private.pos_catalog_import_recovery_small_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure) is not distinct from v_before
   and (select to_jsonb(n) from pg_catalog.pg_namespace n where nspname='app_private') is not distinct from v_ns,
  'rollbackDataEqual',pg_temp.cache_snapshot() is not distinct from v_data);
end;
$trial$;
create temporary table cache_results as select c.*,pg_temp.cache_trial('prior',case_no) prior,pg_temp.cache_trial('candidate',case_no) candidate from cache_cases c order by case_no;
select is(prior->>'state','00000',case_name||': old real RPC returns without unhandled SQLSTATE') from cache_results order by case_no;
select is(candidate->>'state','00000',case_name||': cached real RPC returns without unhandled SQLSTATE') from cache_results order by case_no;
select is(prior->'value',expected,case_name||': old whole public JSON equals independent expectation') from cache_results order by case_no;
select is(candidate->'value',expected,case_name||': cached whole public JSON equals independent expectation') from cache_results order by case_no;
select is(candidate-'metadataEqual'-'otherOwnedDataUnchanged'-'rollbackCatalogEqual'-'rollbackDataEqual',
 prior-'metadataEqual'-'otherOwnedDataUnchanged'-'rollbackCatalogEqual'-'rollbackDataEqual',
 case_name||': exact result/SQLSTATE/full plan and child storage agree') from cache_results order by case_no;
select is(prior->>'metadataEqual','true',case_name||': old compilation preserves every nonbody pg_proc field') from cache_results order by case_no;
select is(candidate->>'metadataEqual','true',case_name||': cached compilation preserves every nonbody pg_proc field') from cache_results order by case_no;
select is(prior->>'otherOwnedDataUnchanged','true',case_name||': old plan causes no other owned economic/authority write') from cache_results order by case_no;
select is(candidate->>'otherOwnedDataUnchanged','true',case_name||': cached plan causes no other owned economic/authority write') from cache_results order by case_no;
select ok(prior->>'rollbackCatalogEqual'='true' and prior->>'rollbackDataEqual'='true',case_name||': old caught rollback restores full catalog/namespace/data') from cache_results order by case_no;
select ok(candidate->>'rollbackCatalogEqual'='true' and candidate->>'rollbackDataEqual'='true',case_name||': cached caught rollback restores full catalog/namespace/data') from cache_results order by case_no;

-- Independent literal S09 query, not generated from the cache rewrite. The
-- installed compiled candidate predicate is captured under full metadata rollback.
insert into cache_sources values('membership_prior',$prior$
with roots as materialized (
 select item->>'clientItemId' root_id from jsonb_array_elements(v_original.normalized_request->'items') item
), coverage as materialized (
 select entry->>'clientItemId' root_id,entry->>'kind' kind,(entry->>'partIndex')::integer part_index,entry->>'childClientItemId' child_id
 from jsonb_array_elements(v_expected->'coverage') entry
), children as materialized (
 select child->>'kind' kind,(child->>'index')::integer part_index,item->>'clientItemId' child_id
 from jsonb_array_elements(v_expected->'parts') child cross join lateral jsonb_array_elements(child->'items') item
) select exists(select 1 from coverage left join roots using(root_id) where roots.root_id is null)
or exists(select 1 from children left join coverage on coverage.kind='child' and coverage.part_index=children.part_index and coverage.child_id=children.child_id
 group by children.part_index,children.child_id having count(coverage.root_id)<>1)
or exists(select 1 from coverage left join children on children.part_index=coverage.part_index and children.child_id=coverage.child_id
 where coverage.kind='child' and (children.child_id is null or (children.kind is distinct from 'ordinary' and children.child_id<>coverage.root_id)))
$prior$);
do $extract$
declare v_before jsonb;v_ns jsonb;v_body text;v_query text;v_begin integer;v_end integer;v_state text;v_message text;
 v_start_anchor constant text:='   if (with roots as materialized (';
 v_end_anchor constant text:=E' then\n     return jsonb_build_object(''ok'',false,''code'',''validation_failed'');end if;';
 v_def text;
begin
 select to_jsonb(p) into strict v_before from pg_catalog.pg_proc p where oid='app_private.pos_catalog_import_recovery_small_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure;
 select to_jsonb(n) into strict v_ns from pg_catalog.pg_namespace n where nspname='app_private';
 begin
  perform pg_temp.cache_install('candidate');
  select replace(prosrc,E'\r\n',E'\n') into strict v_body from pg_catalog.pg_proc where oid='app_private.pos_catalog_import_recovery_small_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure;
  if md5(v_body)<>'fe01bc8ac31a746951b7b2fff8dfb3b1' then raise exception 'compiled candidate extraction pin mismatch';end if;
  v_begin:=strpos(v_body,v_start_anchor);
  if v_begin=0 or length(v_body)-length(replace(v_body,v_start_anchor,''))<>length(v_start_anchor) then raise exception 'membership start mismatch';end if;
  v_end:=v_begin+strpos(substr(v_body,v_begin),v_end_anchor)-1;
  if v_end<=v_begin then raise exception 'membership end mismatch';end if;
  -- Remove only the PLpgSQL IF wrapper parentheses, retaining the actual SELECT.
  v_query:=substr(v_body,v_begin+length('   if ('),v_end-v_begin-length('   if ('));
  if right(v_query,1)<>')' then raise exception 'membership closing IF mismatch';end if;
  v_query:=left(v_query,length(v_query)-1);
  raise exception 'cache_extract_rollback' using errcode='Z0942';
 exception when others then
  get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;
  if v_state<>'Z0942' or v_message<>'cache_extract_rollback' then raise;end if;
 end;
 if (select to_jsonb(p) from pg_catalog.pg_proc p where oid='app_private.pos_catalog_import_recovery_small_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure) is distinct from v_before
 or (select to_jsonb(n) from pg_catalog.pg_namespace n where nspname='app_private') is distinct from v_ns then raise exception 'extract rollback metadata mismatch';end if;
 insert into cache_sources values('membership_candidate',v_query);
 for v_def in select name from cache_sources where name in('membership_prior','membership_candidate') loop
  execute format('create function pg_temp.%I(p_original_id uuid,p_plan jsonb) returns boolean language plpgsql as %L',v_def,
   'declare v_original app_private.pos_catalog_import_recovery_uploads%rowtype;v_expected jsonb:=p_plan;v_plan_parts jsonb:=p_plan->''parts'';v_plan_coverage jsonb:=p_plan->''coverage'';v_invalid boolean;begin
select * into strict v_original from app_private.pos_catalog_import_recovery_uploads where shop_id=''10000000-0000-4000-8000-000000094801''::uuid and shop_device_id=''40000000-0000-4000-8000-000000094801''::uuid and upload_id=p_original_id;
v_invalid:=('||(select body from cache_sources where name=v_def)||');return v_invalid;end;');
 end loop;
end;
$extract$;
create temporary table cache_membership_cases as
select ordinality::integer case_no,entry->>'name' case_name,entry spec,
 ('94860000-0000-4000-8000-'||lpad(ordinality::text,12,'0'))::uuid original_id,
 jsonb_build_object('parts',entry->'parts','coverage',entry->'coverage') payload,
 coalesce(entry->>'state','00000') expected_state,entry->'invalid' expected
from jsonb_array_elements($membership$[
{"roots":[{"clientItemId":"r"}],"state":"00000","name":"ordinary_remaps_root","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"invalid":false},
{"roots":[{"clientItemId":"r"}],"state":"00000","name":"correction_same_id","parts":[{"kind":"correction","index":0,"items":[{"clientItemId":"r"}]}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"r"}],"invalid":false},
{"roots":[{"clientItemId":"r"}],"state":"00000","name":"correction_wrong_id","parts":[{"kind":"correction","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"invalid":true},
{"roots":[{"clientItemId":"r"}],"state":"00000","name":"orphan_root","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"x","kind":"child","partIndex":0,"childClientItemId":"c"}],"invalid":true},
{"roots":[{"clientItemId":"r"}],"state":"00000","name":"orphan_child","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"x"}],"invalid":true},
{"roots":[{"clientItemId":"r"}],"state":"00000","name":"duplicate_child_multiset","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null},{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"invalid":true},
{"roots":[{"clientItemId":"r"}],"state":"00000","name":"duplicate_coverage_join","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"},{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"invalid":true},
{"roots":[{"clientItemId":"r"}],"state":"00000","name":"null_child_id","parts":[{"kind":"ordinary","index":0,"items":[{"clientItemId":null}]}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":null}],"invalid":true},
{"roots":[{"clientItemId":"r"}],"state":"00000","name":"missing_part_index","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","childClientItemId":"c"}],"invalid":true},
{"roots":[{"clientItemId":"r"},{"clientItemId":"r2"}],"state":"00000","name":"same_id_two_parts","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999},{"kind":"ordinary","index":1,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"},{"clientItemId":"r2","kind":"child","partIndex":1,"childClientItemId":"c"}],"invalid":false},
{"roots":[{"clientItemId":"r"}],"state":"00000","name":"null_kind_no_child","parts":[],"coverage":[{"clientItemId":"r","kind":null}],"invalid":false},
{"roots":[{"clientItemId":"r"}],"state":"00000","name":"missing_kind_with_child","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","partIndex":0,"childClientItemId":"c"}],"invalid":true},
{"roots":[{"clientItemId":"r"}],"state":"00000","name":"sql_null_arrays","omit":["parts","coverage"],"invalid":false},
{"roots":[{"clientItemId":"r"}],"state":"22023","name":"json_null_parts","parts":null,"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}]},
{"roots":[{"clientItemId":"r"}],"state":"22023","name":"json_null_coverage","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":null},
{"roots":[{"clientItemId":"r"}],"state":"22P02","name":"invalid_integer","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":"bad","childClientItemId":"c"}]},
{"roots":[{"clientItemId":"r"}],"state":"22003","name":"overflow_integer","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":"2147483648","childClientItemId":"c"}]},
{"roots":[{"clientItemId":"r"}],"state":"00000","name":"plus_zero","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":"+0","childClientItemId":"c"}],"invalid":false},
{"roots":[{"clientItemId":"r"}],"state":"00000","name":"double_zero","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":"00","childClientItemId":"c"}],"invalid":false},
{"roots":[{"clientItemId":"r"}],"state":"00000","name":"spaced_zero","parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":" 0 ","childClientItemId":"c"}],"invalid":false},
{"name":"null_root_id_is_not_equal","roots":[{"clientItemId":null}],"parts":[{"kind":"ordinary","index":0,"clientImportId":"cache-child","idempotencyKey":"cache-child-key","payloadHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","declaredPayloadHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}],"summary":{"productCount":999},"normalized":{"items":[{"clientItemId":"c","barcode":"cache-child","changeKind":"no_change","retailPrice":null,"purchasePrice":null}]},"unknown":{"标题":[2,null,1]},"itemCount":999}],"coverage":[{"clientItemId":"r","kind":"child","partIndex":0,"childClientItemId":"c"}],"state":"00000","invalid":true}
]$membership$::jsonb) with ordinality source(entry,ordinality);
update cache_membership_cases set payload=payload-'parts'-'coverage' where spec?'omit';
insert into app_private.pos_catalog_import_recovery_uploads(shop_id,shop_device_id,upload_id,mode,manifest,manifest_hash,raw_hash,total_bytes,normalized_request,canonical_hash,client_import_id,idempotency_key,original_schema,item_count,verified_at)
select '10000000-0000-4000-8000-000000094801','40000000-0000-4000-8000-000000094801',original_id,'original','{}','sha256:'||repeat('4',64),'sha256:'||repeat('5',64),2,
jsonb_build_object('items',spec->'roots'),'sha256:'||repeat('6',64),'cache-membership-'||case_no,'cache-membership-key-'||case_no,'pos-catalog-import-v1',greatest(1,jsonb_array_length(spec->'roots')),now()
from cache_membership_cases;
create function pg_temp.cache_membership_eval(p_variant text,p_original uuid,p_plan jsonb) returns jsonb language plpgsql as $eval$
declare v_value boolean;v_state text:='00000';v_message text;
begin
 begin
  if p_variant='prior' then v_value:=pg_temp.membership_prior(p_original,p_plan);
  elsif p_variant='candidate' then v_value:=pg_temp.membership_candidate(p_original,p_plan);
  else raise exception 'unknown membership variant';end if;
 exception when others then get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;end;
 return jsonb_build_object('state',v_state,'message',v_message,'value',v_value);
end;
$eval$;
create temporary table cache_membership_results as select c.*,
pg_temp.cache_membership_eval('prior',original_id,payload) prior,
pg_temp.cache_membership_eval('candidate',original_id,payload) candidate from cache_membership_cases c order by case_no;
select is((select count(*) from cache_membership_cases),21::bigint,'all independent membership/cast/NULL vectors present');
select is(prior->>'state',expected_state,case_name||': literal prior independent SQLSTATE') from cache_membership_results order by case_no;
select is(candidate->>'state',expected_state,case_name||': installed candidate independent SQLSTATE') from cache_membership_results order by case_no;
select is(prior->'value',coalesce(expected,'null'::jsonb),case_name||': literal prior independent membership expectation') from cache_membership_results order by case_no;
select is(candidate->'value',coalesce(expected,'null'::jsonb),case_name||': candidate independent membership expectation') from cache_membership_results order by case_no;
select is(candidate,prior,case_name||': full value/SQLSTATE/error identity equal') from cache_membership_results order by case_no;

-- Exact real DO from canonical migration20261013005324, not a test compiler
-- substitute. The prospective and canonical executable DO bytes coincide.
insert into cache_sources values('forward8',$actual_forward8$do $migration$
declare
  v_target regprocedure:=pg_catalog.to_regprocedure(
    'app_private.pos_catalog_import_recovery_small_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'
  );
  v_before pg_catalog.pg_proc%rowtype;
  v_after pg_catalog.pg_proc%rowtype;
  v_definition text;
  v_proposed text;
  v_sha text;
  v_is_crlf boolean;
  v_start integer;
  v_end integer;
  v_tail text;
  v_others_before_count bigint;
  v_others_after_count bigint;
  v_others_before_sha text;
  v_others_after_sha text;
  v_declaration text:=$declaration$ v_manifest jsonb;v_expected jsonb;v_result jsonb;v_receipt jsonb;v_child jsonb;v_entry jsonb;
$declaration$;
  v_new_declarations text:=$new_declarations$ v_plan_parts jsonb;v_plan_coverage jsonb;
$new_declarations$;
  v_plan_guard text:=$plan_guard$     or jsonb_array_length(v_expected->'parts')>1024 then return jsonb_build_object('ok',false,'code','validation_failed');end if;
$plan_guard$;
  v_new_assignments text:=$new_assignments$   v_plan_parts:=v_expected->'parts';v_plan_coverage:=v_expected->'coverage';
$new_assignments$;
  v_next_branch text:=$next_branch$
 if p_action='apply' or (p_action='receipt-page' and p_payload?'planId') then$next_branch$;
begin
  select * into v_before from pg_catalog.pg_proc where oid=v_target;
  if not found or current_user<>'postgres'
    or pg_catalog.pg_get_userbyid(v_before.proowner)<>'postgres'
    or v_before.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
    or v_before.prorettype<>'jsonb'::regtype or v_before.proretset
    or v_before.prokind<>'f' or not v_before.prosecdef
    or v_before.provolatile<>'v'::"char" or v_before.proparallel<>'u'::"char"
    or v_before.proisstrict or v_before.proleakproof
    or v_before.proconfig is distinct from array['search_path=public, app_private, extensions, pg_temp']
    or v_before.proargnames is distinct from array[
      'p_shop_id','p_shop_device_id','p_staff_id','p_pos_session_id',
      'p_owner_user_id','p_action','p_payload'
    ] then
    raise exception 'pos_import_recovery_plan_array_cache_baseline_mismatch' using errcode='55000';
  end if;

  -- Accept exact raw LF OR exact raw CRLF; mixed/drifted bytes are not normalized.
  v_sha:=encode(extensions.digest(convert_to(v_before.prosrc,'UTF8'),'sha256'),'hex');
  if v_sha='f6d28e812a36ffba4b7c279f5bf3c48cf66ae85da637b2ee7676a435c3e56374'
    and pg_catalog.md5(v_before.prosrc)='9e4d083bd0d08cefb9102a35a6f7f101'
    and pg_catalog.octet_length(convert_to(v_before.prosrc,'UTF8'))=48131 then
    v_is_crlf:=false;
  elsif v_sha='a01b0a72a49f31fa5de9674002f8b652dd2f55164a414bd37b3855327989bf5e'
    and pg_catalog.md5(v_before.prosrc)='18c480db0d9b45c7c87bf57d6539f5cd'
    and pg_catalog.octet_length(convert_to(v_before.prosrc,'UTF8'))=48599 then
    v_is_crlf:=true;
  else
    raise exception 'pos_import_recovery_plan_array_cache_baseline_mismatch' using errcode='55000';
  end if;
  -- Canonicalize only the five pattern constants: a Windows checkout may make
  -- this migration itself CRLF. The verified raw function body is never normalized.
  v_declaration:=pg_catalog.replace(v_declaration,E'\r\n',E'\n');
  v_new_declarations:=pg_catalog.replace(v_new_declarations,E'\r\n',E'\n');
  v_plan_guard:=pg_catalog.replace(v_plan_guard,E'\r\n',E'\n');
  v_new_assignments:=pg_catalog.replace(v_new_assignments,E'\r\n',E'\n');
  v_next_branch:=pg_catalog.replace(v_next_branch,E'\r\n',E'\n');
  if v_is_crlf then
    v_declaration:=pg_catalog.replace(v_declaration,E'\n',E'\r\n');
    v_new_declarations:=pg_catalog.replace(v_new_declarations,E'\n',E'\r\n');
    v_plan_guard:=pg_catalog.replace(v_plan_guard,E'\n',E'\r\n');
    v_new_assignments:=pg_catalog.replace(v_new_assignments,E'\n',E'\r\n');
    v_next_branch:=pg_catalog.replace(v_next_branch,E'\n',E'\r\n');
  end if;
  if (pg_catalog.length(v_before.prosrc)-pg_catalog.length(pg_catalog.replace(v_before.prosrc,v_declaration,'')))<>pg_catalog.length(v_declaration)
    or (pg_catalog.length(v_before.prosrc)-pg_catalog.length(pg_catalog.replace(v_before.prosrc,v_plan_guard,'')))<>pg_catalog.length(v_plan_guard)
    or (pg_catalog.length(v_before.prosrc)-pg_catalog.length(pg_catalog.replace(v_before.prosrc,v_next_branch,'')))<>pg_catalog.length(v_next_branch)
    or pg_catalog.strpos(v_before.prosrc,'v_plan_parts')<>0
    or pg_catalog.strpos(v_before.prosrc,'v_plan_coverage')<>0 then
    raise exception 'pos_import_recovery_plan_array_cache_baseline_mismatch' using errcode='55000';
  end if;
  v_start:=pg_catalog.strpos(v_before.prosrc,v_plan_guard)+pg_catalog.length(v_plan_guard);
  v_end:=pg_catalog.strpos(v_before.prosrc,v_next_branch);
  if v_end<=v_start then
    raise exception 'pos_import_recovery_plan_array_cache_baseline_mismatch' using errcode='55000';
  end if;
  v_tail:=pg_catalog.substr(v_before.prosrc,v_start,v_end-v_start);
  if (pg_catalog.length(v_tail)-pg_catalog.length(pg_catalog.replace(v_tail,'v_expected->''parts''','')))<>4*pg_catalog.length('v_expected->''parts''')
    or (pg_catalog.length(v_tail)-pg_catalog.length(pg_catalog.replace(v_tail,'v_expected->''coverage''','')))<>12*pg_catalog.length('v_expected->''coverage''') then
    raise exception 'pos_import_recovery_plan_array_cache_baseline_mismatch' using errcode='55000';
  end if;
  -- Only the bounded postguard plan tail is rewritten; the initial three
  -- selectors, casts, FOUND and early validation return retain their bytes.
  v_tail:=pg_catalog.replace(pg_catalog.replace(v_tail,'v_expected->''parts''','v_plan_parts'),'v_expected->''coverage''','v_plan_coverage');
  v_proposed:=pg_catalog.substr(v_before.prosrc,1,v_start-1)||v_new_assignments||v_tail||pg_catalog.substr(v_before.prosrc,v_end);
  v_proposed:=pg_catalog.replace(v_proposed,v_declaration,v_declaration||v_new_declarations);
  if (not v_is_crlf and (pg_catalog.md5(v_proposed)<>'fe01bc8ac31a746951b7b2fff8dfb3b1'
      or encode(extensions.digest(convert_to(v_proposed,'UTF8'),'sha256'),'hex')<>'e3d5f3c0878830e2b1afc732b6e65f3cb5c95de5b7760368b1531d10313dddce'
      or pg_catalog.octet_length(convert_to(v_proposed,'UTF8'))<>48140))
    or (v_is_crlf and (pg_catalog.md5(v_proposed)<>'a95065fae5f84912cbeff6e2b5fafa29'
      or encode(extensions.digest(convert_to(v_proposed,'UTF8'),'sha256'),'hex')<>'cb5e922315c8cb2e18d000254264e029090cc2b9df639b2c031013b7d595c5bc'
      or pg_catalog.octet_length(convert_to(v_proposed,'UTF8'))<>48610)) then
    raise exception 'pos_import_recovery_plan_array_cache_postcondition_mismatch' using errcode='55000';
  end if;

  -- Relative preservation of every other pg_proc row, not a claim that their
  -- initial metadata was fully fixed by the enumerated target baseline guard.
  select count(*),encode(extensions.digest(convert_to(coalesce(
    string_agg(pg_catalog.to_jsonb(p)::text,E'\n' order by p.oid),''),'UTF8'),'sha256'),'hex')
    into v_others_before_count,v_others_before_sha from pg_catalog.pg_proc p where p.oid<>v_target;
  v_definition:=pg_catalog.pg_get_functiondef(v_target);
  if (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_before.prosrc,'')))<>pg_catalog.length(v_before.prosrc) then
    raise exception 'pos_import_recovery_plan_array_cache_baseline_mismatch' using errcode='55000';
  end if;
  execute pg_catalog.replace(v_definition,v_before.prosrc,v_proposed);
  select * into v_after from pg_catalog.pg_proc where oid=v_target;
  if not found or v_after.prosrc is distinct from v_proposed
    or (pg_catalog.to_jsonb(v_after)-'prosrc') is distinct from (pg_catalog.to_jsonb(v_before)-'prosrc') then
    raise exception 'pos_import_recovery_plan_array_cache_postcondition_mismatch' using errcode='55000';
  end if;
  select count(*),encode(extensions.digest(convert_to(coalesce(
    string_agg(pg_catalog.to_jsonb(p)::text,E'\n' order by p.oid),''),'UTF8'),'sha256'),'hex')
    into v_others_after_count,v_others_after_sha from pg_catalog.pg_proc p where p.oid<>v_target;
  if v_others_after_count is distinct from v_others_before_count
    or v_others_after_sha is distinct from v_others_before_sha then
    raise exception 'pos_import_recovery_plan_array_cache_other_function_drift' using errcode='55000';
  end if;
end;
$migration$;$actual_forward8$);
select ok(
 (octet_length(convert_to(body,'UTF8'))=8211 and encode(extensions.digest(convert_to(body,'UTF8'),'sha256'),'hex')='6fe223266981e151528b5c68ca20cf9985d1a06afb1a8203caf67922ed9f3079')
 or (octet_length(convert_to(body,'UTF8'))=8337 and encode(extensions.digest(convert_to(body,'UTF8'),'sha256'),'hex')='259b07cb54950feb57fc5efbe128904071ecef4772f30bc005359973920539db'),
 'actual canonical forward8 DO exact raw LF/CRLF source pins') from cache_sources where name='forward8';
create function pg_temp.cache_other_proc_snapshot() returns jsonb language sql volatile as $others$
 select jsonb_build_object('count',count(*),'sha256',encode(extensions.digest(convert_to(coalesce(
 string_agg(to_jsonb(p)::text,E'\n' order by p.oid),''),'UTF8'),'sha256'),'hex'))
 from pg_catalog.pg_proc p where p.oid<>'app_private.pos_catalog_import_recovery_small_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure;
$others$;
create temporary table cache_forward_data_before as select pg_temp.cache_snapshot() value;
create function pg_temp.cache_forward_probe(p_case text) returns jsonb language plpgsql as $forward$
declare
 v_target regprocedure:='app_private.pos_catalog_import_recovery_small_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure;
 v_before jsonb;v_ns jsonb;v_data jsonb;v_others jsonb;v_baseline jsonb;v_after jsonb;
 v_definition text;v_body text;v_prior text;v_statement text;v_state text;v_message text;
 v_baseline_pin boolean:=false;v_after_pin boolean:=false;v_metadata boolean:=false;v_others_equal boolean:=false;v_applied boolean:=false;
begin
 select to_jsonb(p) into strict v_before from pg_catalog.pg_proc p where oid=v_target;
 select to_jsonb(n) into strict v_ns from pg_catalog.pg_namespace n where nspname='app_private';
 v_data:=pg_temp.cache_snapshot();v_others:=pg_temp.cache_other_proc_snapshot();
 begin
  perform pg_temp.cache_install('prior');
  if p_case in('accepted_crlf','accepted_source_crlf_body_crlf') then
   select prosrc into strict v_body from pg_catalog.pg_proc where oid=v_target;
   v_definition:=pg_catalog.pg_get_functiondef(v_target);
   execute replace(v_definition,v_body,replace(v_body,E'\n',E'\r\n'));
  end if;
  select to_jsonb(p) into strict v_baseline from pg_catalog.pg_proc p where oid=v_target;
  v_baseline_pin:=case when p_case in('accepted_crlf','accepted_source_crlf_body_crlf') then
   md5(v_baseline->>'prosrc')='18c480db0d9b45c7c87bf57d6539f5cd'
   and encode(extensions.digest(convert_to(v_baseline->>'prosrc','UTF8'),'sha256'),'hex')='a01b0a72a49f31fa5de9674002f8b652dd2f55164a414bd37b3855327989bf5e'
  else md5(v_baseline->>'prosrc')='9e4d083bd0d08cefb9102a35a6f7f101'
   and encode(extensions.digest(convert_to(v_baseline->>'prosrc','UTF8'),'sha256'),'hex')='f6d28e812a36ffba4b7c279f5bf3c48cf66ae85da637b2ee7676a435c3e56374' end;
  if not v_baseline_pin then raise exception 'guard fixture exact prior raw body mismatch';end if;
  case p_case
   when 'accepted_lf' then null;
   when 'accepted_crlf' then null;
   when 'accepted_source_crlf_body_lf' then null;
   when 'accepted_source_crlf_body_crlf' then null;
   when 'accepted_cost_acl' then
    execute format('alter function %s cost 31',v_target);
    execute format('grant execute on function %s to service_role with grant option',v_target);
   when 'body_drift' then
    select prosrc into strict v_body from pg_catalog.pg_proc where oid=v_target;
    execute replace(pg_catalog.pg_get_functiondef(v_target),v_body,v_body||E'\n -- intentional guarded test body drift');
   when 'mixed_newlines' then
    select prosrc into strict v_body from pg_catalog.pg_proc where oid=v_target;
    v_prior:=overlay(v_body placing E'\r\n' from strpos(v_body,E'\n') for 1);
    execute replace(pg_catalog.pg_get_functiondef(v_target),v_body,v_prior);
   when 'already_candidate' then perform pg_temp.cache_install('candidate');
   when 'security_drift' then execute format('alter function %s security invoker',v_target);
   when 'search_path_drift' then execute format('alter function %s set search_path to public',v_target);
   when 'owner_drift' then
    -- This exact grant is caught here and full namespace ACL rollback is checked.
    execute 'grant create on schema app_private to service_role';
    execute format('alter function %s owner to service_role',v_target);
   when 'strict_drift' then execute format('alter function %s strict',v_target);
   when 'volatile_drift' then execute format('alter function %s stable',v_target);
   when 'parallel_drift' then execute format('alter function %s parallel safe',v_target);
   else raise exception 'unknown forward8 guard case';
  end case;
  select to_jsonb(p) into strict v_baseline from pg_catalog.pg_proc p where oid=v_target;
  -- Baseline twelve use LF SQL source even when this pgTAP file is CRLF.
  -- Only the two explicit source cases render whole SQL text as CRLF.
  v_statement:=replace((select body from cache_sources where name='forward8'),E'\r\n',E'\n');
  if p_case in('accepted_source_crlf_body_lf','accepted_source_crlf_body_crlf') then
   v_statement:=replace(v_statement,E'\n',E'\r\n');
  end if;
  execute v_statement;
  v_applied:=true;
  select to_jsonb(p) into strict v_after from pg_catalog.pg_proc p where oid=v_target;
  v_after_pin:=case when p_case in('accepted_crlf','accepted_source_crlf_body_crlf') then
   md5(v_after->>'prosrc')='a95065fae5f84912cbeff6e2b5fafa29'
   and encode(extensions.digest(convert_to(v_after->>'prosrc','UTF8'),'sha256'),'hex')='cb5e922315c8cb2e18d000254264e029090cc2b9df639b2c031013b7d595c5bc'
  else md5(v_after->>'prosrc')='fe01bc8ac31a746951b7b2fff8dfb3b1'
   and encode(extensions.digest(convert_to(v_after->>'prosrc','UTF8'),'sha256'),'hex')='e3d5f3c0878830e2b1afc732b6e65f3cb5c95de5b7760368b1531d10313dddce' end;
  v_metadata:=(v_after-'prosrc') is not distinct from (v_baseline-'prosrc');
  v_others_equal:=pg_temp.cache_other_proc_snapshot() is not distinct from v_others;
  raise exception 'forward8_probe_rollback' using errcode='Z0943';
 exception when others then
  get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;
 end;
 return jsonb_build_object('baselinePin',v_baseline_pin,'afterPin',v_after_pin,'metadataEqual',v_metadata,'applied',v_applied,
  'state',v_state,'message',v_message,'otherProcEqual',
  case when v_applied then v_others_equal else pg_temp.cache_other_proc_snapshot() is not distinct from v_others end,
  'rollbackCatalogEqual',(select to_jsonb(p) from pg_catalog.pg_proc p where oid=v_target) is not distinct from v_before
   and (select to_jsonb(n) from pg_catalog.pg_namespace n where nspname='app_private') is not distinct from v_ns,
  'rollbackDataEqual',pg_temp.cache_snapshot() is not distinct from v_data);
end;
$forward$;
create temporary table cache_forward_cases(case_no integer primary key,case_name text not null,expected_state text not null,expected_message text not null,expected_applied boolean not null);
insert into cache_forward_cases values
 (1,'accepted_lf','Z0943','forward8_probe_rollback',true),
 (2,'accepted_crlf','Z0943','forward8_probe_rollback',true),
 (3,'accepted_cost_acl','Z0943','forward8_probe_rollback',true),
 (4,'body_drift','55000','pos_import_recovery_plan_array_cache_baseline_mismatch',false),
 (5,'mixed_newlines','55000','pos_import_recovery_plan_array_cache_baseline_mismatch',false),
 (6,'already_candidate','55000','pos_import_recovery_plan_array_cache_baseline_mismatch',false),
 (7,'security_drift','55000','pos_import_recovery_plan_array_cache_baseline_mismatch',false),
 (8,'search_path_drift','55000','pos_import_recovery_plan_array_cache_baseline_mismatch',false),
 (9,'owner_drift','55000','pos_import_recovery_plan_array_cache_baseline_mismatch',false),
 (10,'strict_drift','55000','pos_import_recovery_plan_array_cache_baseline_mismatch',false),
 (11,'volatile_drift','55000','pos_import_recovery_plan_array_cache_baseline_mismatch',false),
 (12,'parallel_drift','55000','pos_import_recovery_plan_array_cache_baseline_mismatch',false),
 (13,'accepted_source_crlf_body_lf','Z0943','forward8_probe_rollback',true),
 (14,'accepted_source_crlf_body_crlf','Z0943','forward8_probe_rollback',true);
create temporary table cache_forward_results as select c.*,pg_temp.cache_forward_probe(case_name) result from cache_forward_cases c order by case_no;
select is(result->>'baselinePin','true',case_name||': controlled exact raw prior LF/CRLF') from cache_forward_results order by case_no;
select is(result->>'state',expected_state,case_name||': actual forward8 SQLSTATE/controlled rollback') from cache_forward_results order by case_no;
select is(result->>'message',expected_message,case_name||': actual forward8 precise error identity') from cache_forward_results order by case_no;
select is((result->>'applied')::boolean,expected_applied,case_name||': actual migration accepts exact source and refuses drift') from cache_forward_results order by case_no;
select is(result->>'rollbackCatalogEqual','true',case_name||': caught migration rollback restores whole pg_proc and pg_namespace ACL') from cache_forward_results order by case_no;
select is(result->>'rollbackDataEqual','true',case_name||': caught migration rollback restores every owned data field') from cache_forward_results order by case_no;
select is(result->>'otherProcEqual','true',case_name||': all nontarget pg_proc count/full rows preserved') from cache_forward_results order by case_no;
select is(result->>'afterPin','true',case_name||': accepted actual DO exact raw candidate LF/CRLF') from cache_forward_results where expected_applied order by case_no;
select is(result->>'metadataEqual','true',case_name||': accepted actual DO preserves full OID/owner/ACL/defaults/config/cost/flags') from cache_forward_results where expected_applied order by case_no;
select is(pg_temp.cache_snapshot(),(select value from cache_forward_data_before),'all actual forward8 probes preserve full owned data');

select is((select to_jsonb(p) from pg_catalog.pg_proc p where oid='app_private.pos_catalog_import_recovery_small_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure),
(select value from cache_installed),'all trials/extraction restore whole original pg_proc row');
select diag('Source-only until coordinator runtime: verbatim canonical DO; no_plan will report actual assertion counts after execution.');
select * from finish();
rollback;
