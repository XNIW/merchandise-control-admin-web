-- TASK-094 source-only regression; NOT_RUN until the coordinator's serial gate.
-- The candidate builder is extracted from installed prosrc, never copied here.
-- Scalar SQL vectors prove builder equivalence, not parser/auth admission or speed.
-- Real staging rows, no auth stub, no new role, no economic apply.
-- The embedded migration DO below is VERBATIM from:
-- supabase/migrations/20261012055628_pos_import_recovery_plan_single_builder.sql
-- Migration file SHA256: 4b1a5dceed9b2bdf50c92aafa13f73400db0e0455c57804cda842fe1284d967c
-- Exact DO UTF8 SHA256: 470a883f5da8c4fc5cdc6a0cdd02f761c24abc7a5dec47e69750beb3a96e2e83
begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select is(
  (select md5(replace(prosrc,E'\r\n',E'\n')) from pg_catalog.pg_proc
   where oid='app_private.pos_import_recovery_phased_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure),
  '0eec947d66bbac2930385977b448a836','installed candidate full prosrc MD5');
select is(
  (select encode(extensions.digest(convert_to(replace(prosrc,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')
   from pg_catalog.pg_proc
   where oid='app_private.pos_import_recovery_phased_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure),
  'b3062b925c3968caf9bba6129a288e49006cdeb9140165c24a3245628192a3d2','installed candidate full prosrc SHA256');

create temporary table single_builder_artifacts(name text primary key,body text not null);
insert into single_builder_artifacts values('migration',$migration_artifact$do $migration$
declare
  v_target regprocedure:=pg_catalog.to_regprocedure(
    'app_private.pos_import_recovery_phased_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'
  );
  v_before pg_catalog.pg_proc%rowtype;
  v_after pg_catalog.pg_proc%rowtype;
  v_definition text;
  v_before_builder text:=$before_builder$     v_normal:=v_header||jsonb_build_object('parts',v_children,'coverage',coalesce(v_items,'[]'::jsonb),'planCanonicalHash',v_hash,
       'itemCount',(select count(*) from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='child'));$before_builder$;
  v_after_builder text:=$after_builder$     if jsonb_typeof(v_header)='object' then
       -- Build the whole object once. Exclude replaced header keys so the four
       -- RHS fields win without sorting the large JSONB values in the aggregate.
       select jsonb_object_agg(fields.field_key,fields.field_value) into v_normal
       from (
         select header_entry.key field_key,header_entry.value field_value
           from jsonb_each(v_header) header_entry
           where header_entry.key not in('parts','coverage','planCanonicalHash','itemCount')
         union all
         select replacement.field_key,replacement.field_value from (values
           ('parts',v_children),
           ('coverage',coalesce(v_items,'[]'::jsonb)),
           ('planCanonicalHash',to_jsonb(v_hash)),
           ('itemCount',to_jsonb((select count(*) from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='child')))
         ) replacement(field_key,field_value)
       ) fields;
     else
     v_normal:=v_header||jsonb_build_object('parts',v_children,'coverage',coalesce(v_items,'[]'::jsonb),'planCanonicalHash',v_hash,
       'itemCount',(select count(*) from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='child'));
     end if;$after_builder$;
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
    ]
    or pg_catalog.md5(pg_catalog.replace(v_before.prosrc,E'\r\n',E'\n'))
      is distinct from 'e638c34aaa588e2b64f63fa3dc3102b0'
    or encode(extensions.digest(convert_to(pg_catalog.replace(v_before.prosrc,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')
      is distinct from '821d34d4ca0234b42ae48b87715bad224c901ef9e0a35fbeb4204a63a45d1b1d' then
    raise exception 'pos_import_recovery_plan_single_builder_baseline_mismatch' using errcode='55000';
  end if;

  v_definition:=pg_catalog.pg_get_functiondef(v_target);
  if pg_catalog.strpos(v_definition,v_before_builder)=0 then
    v_before_builder:=pg_catalog.replace(v_before_builder,E'\n',E'\r\n');
    v_after_builder:=pg_catalog.replace(v_after_builder,E'\n',E'\r\n');
  end if;
  if (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_before_builder,'')))
    <>pg_catalog.length(v_before_builder) then
    raise exception 'pos_import_recovery_plan_single_builder_baseline_mismatch' using errcode='55000';
  end if;
  execute pg_catalog.replace(v_definition,v_before_builder,v_after_builder);

  select * into v_after from pg_catalog.pg_proc where oid=v_target;
  if not found
    or pg_catalog.md5(pg_catalog.replace(v_after.prosrc,E'\r\n',E'\n'))
      is distinct from '0eec947d66bbac2930385977b448a836'
    or encode(extensions.digest(convert_to(pg_catalog.replace(v_after.prosrc,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')
      is distinct from 'b3062b925c3968caf9bba6129a288e49006cdeb9140165c24a3245628192a3d2'
    or (pg_catalog.to_jsonb(v_after)-'prosrc')
      is distinct from (pg_catalog.to_jsonb(v_before)-'prosrc') then
    raise exception 'pos_import_recovery_plan_single_builder_postcondition_mismatch' using errcode='55000';
  end if;
end;
$migration$;$migration_artifact$);
select is(
  (select encode(extensions.digest(convert_to(body,'UTF8'),'sha256'),'hex')
   from single_builder_artifacts where name='migration'),
  '470a883f5da8c4fc5cdc6a0cdd02f761c24abc7a5dec47e69750beb3a96e2e83','embedded actual migration DO has its independent source pin');

do $extract$
declare
  v_source text; v_builder text; v_start integer; v_end integer; v_call integer;
  v_begin text:='     if jsonb_typeof(v_header)=''object'' then';
  v_finish text:='     end if;';
  v_next text:='     v_result:=app_private.pos_catalog_import_recovery_small_v1(';
begin
  select replace(prosrc,E'\r\n',E'\n') into strict v_source from pg_catalog.pg_proc
    where oid='app_private.pos_import_recovery_phased_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure;
  if md5(v_source) is distinct from '0eec947d66bbac2930385977b448a836'
    or encode(extensions.digest(convert_to(v_source,'UTF8'),'sha256'),'hex')
       is distinct from 'b3062b925c3968caf9bba6129a288e49006cdeb9140165c24a3245628192a3d2'
    or length(v_source)-length(replace(v_source,v_begin,''))<>length(v_begin)
    or length(v_source)-length(replace(v_source,v_next,''))<>length(v_next) then
    raise exception 'installed builder extraction baseline/anchor mismatch';
  end if;
  v_start:=strpos(v_source,v_begin);
  v_end:=v_start+strpos(substr(v_source,v_start),v_finish)-1+length(v_finish);
  v_call:=strpos(v_source,v_next);
  if v_end<=v_start or v_call<v_end
    or btrim(substr(v_source,v_end,v_call-v_end),E' \t\r\n')<>'' then
    raise exception 'installed builder extraction range mismatch';
  end if;
  v_builder:=substr(v_source,v_start,v_end-v_start);
  insert into single_builder_artifacts values('installed',v_source),('candidate',v_builder);
  execute format(
    'create function pg_temp.single_builder_candidate(p_header jsonb,p_children jsonb,p_items jsonb,p_hash text,p_shop_id uuid,p_shop_device_id uuid,p_upload_id uuid) returns jsonb language plpgsql as %L',
    'declare v_header jsonb:=p_header;v_children jsonb:=p_children;v_items jsonb:=p_items;v_hash text:=p_hash;v_id uuid:=p_upload_id;v_normal jsonb;begin'
    ||E'\n'||v_builder||E'\nreturn v_normal;end;');
end;
$extract$;

-- Independent prior expression, with its own scoped COUNT. Do not derive it
-- from the candidate aggregate or generate expected JSON from either function.
create function pg_temp.single_builder_prior(v_header jsonb,v_children jsonb,v_items jsonb,v_hash text,p_shop_id uuid,p_shop_device_id uuid,v_id uuid)
returns jsonb language sql stable as $prior$
  select v_header || jsonb_build_object(
    'parts',v_children,'coverage',coalesce(v_items,'[]'::jsonb),
    'planCanonicalHash',v_hash,'itemCount',(
      select count(*) from app_private.pos_import_recovery_normal_rows
      where shop_id=p_shop_id and shop_device_id=p_shop_device_id
        and upload_id=v_id and domain='child'));
$prior$;

create temporary table single_builder_cases as
select ordinal::integer case_no,entry->>'name' case_name,
  entry->'header' header,entry->'children' children,entry->'coverage' coverage,
  entry->>'hash' hash,(entry->>'childCount')::integer child_count,entry->'expected' expected,
  ('94600000-0000-4000-8000-'||lpad(ordinal::text,12,'0'))::uuid upload_id
from jsonb_array_elements($vectors$[
 {"name":"empty_object_empty_arrays","header":{},"children":[],"coverage":[],"hash":"hash-empty","childCount":0,
  "expected":{"parts":[],"coverage":[],"planCanonicalHash":"hash-empty","itemCount":0}},
 {"name":"ordinary_replacement","header":{"schemaVersion":"pos-catalog-import-recovery-plan-v1","mode":"replacement","planId":"plan-a","verifiedOriginalId":"root-a"},
  "children":[{"index":0,"kind":"ordinary","items":[{"clientItemId":"r1","barcode":"B1"}]}],
  "coverage":[{"kind":"child","clientItemId":"r1","partIndex":0,"childClientItemId":"r1"}],"hash":"hash-ordinary","childCount":3,
  "expected":{"schemaVersion":"pos-catalog-import-recovery-plan-v1","mode":"replacement","planId":"plan-a","verifiedOriginalId":"root-a",
    "parts":[{"index":0,"kind":"ordinary","items":[{"clientItemId":"r1","barcode":"B1"}]}],
    "coverage":[{"kind":"child","clientItemId":"r1","partIndex":0,"childClientItemId":"r1"}],"planCanonicalHash":"hash-ordinary","itemCount":3}},
 {"name":"correction_and_original_accepted","header":{"mode":"correction","supersedes":{"planId":"older","retiredChildren":[{"partIndex":2,"canonicalPayloadHash":"older-hash"}]}},
  "children":[{"index":1,"kind":"correction","items":[{"clientItemId":"c1","changes":{"quantityDelta":-1}}]}],
  "coverage":[{"kind":"original_accepted","clientItemId":"c0"},{"kind":"child","clientItemId":"c1","partIndex":1,"childClientItemId":"c1"}],
  "hash":"hash-correction","childCount":2,
  "expected":{"mode":"correction","supersedes":{"planId":"older","retiredChildren":[{"partIndex":2,"canonicalPayloadHash":"older-hash"}]},
    "parts":[{"index":1,"kind":"correction","items":[{"clientItemId":"c1","changes":{"quantityDelta":-1}}]}],
    "coverage":[{"kind":"original_accepted","clientItemId":"c0"},{"kind":"child","clientItemId":"c1","partIndex":1,"childClientItemId":"c1"}],
    "planCanonicalHash":"hash-correction","itemCount":2}},
 {"name":"all_rhs_keys_override_header","header":{"parts":"stale","coverage":{"wrong":true},"planCanonicalHash":"old","itemCount":999,"unknown":{"x":[1,null,"a"]}},
  "children":[],"hash":"new-hash","childCount":1,
  "expected":{"parts":[],"coverage":[],"planCanonicalHash":"new-hash","itemCount":1,"unknown":{"x":[1,null,"a"]}}},
 {"name":"unicode_unknown_fields_array_order","header":{"标题":"商品😀","nested":{"items":[2,1]},"unknown":null},
  "children":[{"label":"乙"},{"label":"甲"}],"coverage":[{"label":"后"},{"label":"前"}],"hash":"汉","childCount":3,
  "expected":{"标题":"商品😀","nested":{"items":[2,1]},"unknown":null,
    "parts":[{"label":"乙"},{"label":"甲"}],"coverage":[{"label":"后"},{"label":"前"}],"planCanonicalHash":"汉","itemCount":3}},
 {"name":"sql_null_rhs_values","header":{"keep":"yes"},"childCount":0,
  "expected":{"keep":"yes","parts":null,"coverage":[],"planCanonicalHash":null,"itemCount":0}},
 {"name":"json_null_coverage_is_not_sql_null","header":{},"children":null,"coverage":null,"hash":"h","childCount":1,
  "expected":{"parts":null,"coverage":null,"planCanonicalHash":"h","itemCount":1}},
 {"name":"sql_null_header_fallback","children":[],"coverage":[],"hash":"h","childCount":2},
 {"name":"json_null_header_fallback","header":null,"children":[],"hash":"h","childCount":0,
  "expected":[null,{"parts":[],"coverage":[],"planCanonicalHash":"h","itemCount":0}]},
 {"name":"string_header_fallback","header":"scalar","children":[],"coverage":[],"hash":"h","childCount":1,
  "expected":["scalar",{"parts":[],"coverage":[],"planCanonicalHash":"h","itemCount":1}]},
 {"name":"number_header_fallback","header":17,"children":[],"hash":"h","childCount":2,
  "expected":[17,{"parts":[],"coverage":[],"planCanonicalHash":"h","itemCount":2}]},
 {"name":"boolean_header_fallback","header":false,"children":[],"hash":"h","childCount":0,
  "expected":[false,{"parts":[],"coverage":[],"planCanonicalHash":"h","itemCount":0}]},
 {"name":"array_header_fallback_preserves_elements","header":["first",null,{"parts":"nested"}],"children":[2,1],"coverage":[3,2,1],"hash":"h","childCount":3,
  "expected":["first",null,{"parts":"nested"},{"parts":[2,1],"coverage":[3,2,1],"planCanonicalHash":"h","itemCount":3}]},
 {"name":"empty_array_header_fallback","header":[],"children":[],"hash":"h","childCount":0,
  "expected":[{"parts":[],"coverage":[],"planCanonicalHash":"h","itemCount":0}]},
 {"name":"large_unknown_header_value","header":{"largeText":"商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品","unknownNested":[{"k":2},{"k":1}]},
  "children":[],"coverage":[],"hash":"h-large","childCount":1,
  "expected":{"largeText":"商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品商品","unknownNested":[{"k":2},{"k":1}],"parts":[],"coverage":[],"planCanonicalHash":"h-large","itemCount":1}}
]$vectors$::jsonb) with ordinality source(entry,ordinal);
select is((select count(*) from single_builder_cases),15::bigint,'fifteen independent builder vectors');

-- COUNT must include every child group, and exclude root plus foreign
-- shop/device/upload. These real rows are SQL scalar fixtures, not API admission.
create temporary table single_builder_fixture as
select c.case_no,'10000000-0000-4000-8000-000000094301'::uuid shop_id,
  '40000000-0000-4000-8000-000000094301'::uuid shop_device_id,c.upload_id,
  'child'::text domain,(ordinal%2)::integer group_index,(ordinal/2)::integer ordinal,
  jsonb_build_object('clientItemId','target-'||ordinal::text) row_json
from single_builder_cases c cross join lateral generate_series(0,c.child_count-1) ordinal
union all
select c.case_no,
  case when scope='shop' then '10000000-0000-4000-8000-000000094302'::uuid
    else '10000000-0000-4000-8000-000000094301'::uuid end,
  case when scope='device' then '40000000-0000-4000-8000-000000094302'::uuid
    else '40000000-0000-4000-8000-000000094301'::uuid end,
  case when scope='upload' then ('94700000-0000-4000-8000-'||lpad(c.case_no::text,12,'0'))::uuid
    else c.upload_id end,
  case when scope='domain' then 'root' else 'child' end,7,0,
  jsonb_build_object('clientItemId','foreign-'||scope)
from single_builder_cases c cross join (values('shop'),('device'),('upload'),('domain')) f(scope);

insert into app_private.pos_import_recovery_documents(shop_id,shop_device_id,upload_id,mode,raw_hash,phase,header)
select distinct shop_id,shop_device_id,upload_id,'plan','sha256:'||repeat('0',64),'children','{}'::jsonb
from single_builder_fixture;
insert into app_private.pos_import_recovery_normal_rows(shop_id,shop_device_id,upload_id,domain,group_index,ordinal,row_json,canonical_json)
select shop_id,shop_device_id,upload_id,domain,group_index,ordinal,row_json,row_json::text
from single_builder_fixture;

-- A fresh snapshot is needed for probes evaluated within the same outer CTAS.
create function pg_temp.single_builder_snapshot() returns jsonb language sql volatile as $snapshot$
select jsonb_build_object(
  'documents',(select jsonb_agg(to_jsonb(d) order by d.shop_id,d.shop_device_id,d.upload_id)
    from app_private.pos_import_recovery_documents d where exists(select 1 from single_builder_fixture f
      where (f.shop_id,f.shop_device_id,f.upload_id)=(d.shop_id,d.shop_device_id,d.upload_id))),
  'raw',(select jsonb_agg(to_jsonb(r) order by r.shop_id,r.shop_device_id,r.upload_id,r.domain,r.group_index,r.ordinal)
    from app_private.pos_import_recovery_raw_rows r where exists(select 1 from single_builder_fixture f
      where (f.shop_id,f.shop_device_id,f.upload_id)=(r.shop_id,r.shop_device_id,r.upload_id))),
  'normal',(select jsonb_agg(to_jsonb(n) order by n.shop_id,n.shop_device_id,n.upload_id,n.domain,n.group_index,n.ordinal)
    from app_private.pos_import_recovery_normal_rows n where exists(select 1 from single_builder_fixture f
      where (f.shop_id,f.shop_device_id,f.upload_id)=(n.shop_id,n.shop_device_id,n.upload_id))));
$snapshot$;
create temporary table single_builder_before as select pg_temp.single_builder_snapshot() value;

select is(
  (select count(*) from app_private.pos_import_recovery_normal_rows n
   where n.shop_id='10000000-0000-4000-8000-000000094301'::uuid
     and n.shop_device_id='40000000-0000-4000-8000-000000094301'::uuid
     and n.upload_id=c.upload_id and n.domain='child'),
  c.child_count::bigint,c.case_name||': explicit real scoped count includes both groups')
from single_builder_cases c order by c.case_no;

create temporary table single_builder_results as
select c.case_no,c.case_name,c.expected,
  pg_temp.single_builder_candidate(c.header,c.children,c.coverage,c.hash,
    '10000000-0000-4000-8000-000000094301'::uuid,'40000000-0000-4000-8000-000000094301'::uuid,c.upload_id) candidate,
  pg_temp.single_builder_prior(c.header,c.children,c.coverage,c.hash,
    '10000000-0000-4000-8000-000000094301'::uuid,'40000000-0000-4000-8000-000000094301'::uuid,c.upload_id) prior
from single_builder_cases c order by c.case_no;
select is(candidate,expected,case_name||': installed builder equals explicit expected JSONB')
from single_builder_results order by case_no;
select is(prior,expected,case_name||': independent old expression equals explicit expected JSONB')
from single_builder_results order by case_no;
select is(candidate,prior,case_name||': candidate and prior agree on the same real staging')
from single_builder_results order by case_no;
select is(pg_temp.single_builder_snapshot(),(select value from single_builder_before),
  'both builders leave all owned staging fields unchanged');

-- Execute the VERBATIM guarded DO only inside the following caught
-- subtransaction. The helper does not replace or imitate its guard logic.
create function pg_temp.single_builder_apply_actual_migration() returns void language plpgsql as $apply$
begin
  execute (select body from single_builder_artifacts where name='migration');
end;
$apply$;

create function pg_temp.single_builder_guard_probe(p_case text) returns jsonb language plpgsql as $probe$
declare
  v_target regprocedure:='app_private.pos_import_recovery_phased_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure;
  v_before jsonb; v_baseline jsonb; v_after jsonb; v_data jsonb;
  v_definition text; v_candidate text; v_state text; v_message text;
  v_baseline_pin boolean:=false; v_after_pin boolean:=false; v_metadata_equal boolean:=false;
  v_applied boolean:=false;
  v_prior_builder constant text:=$prior_builder$     v_normal:=v_header||jsonb_build_object('parts',v_children,'coverage',coalesce(v_items,'[]'::jsonb),'planCanonicalHash',v_hash,
       'itemCount',(select count(*) from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='child'));$prior_builder$;
begin
  select to_jsonb(p) into strict v_before from pg_catalog.pg_proc p where oid=v_target;
  v_data:=pg_temp.single_builder_snapshot();
  begin
    select body into strict v_candidate from single_builder_artifacts where name='candidate';
    v_definition:=replace(pg_catalog.pg_get_functiondef(v_target),E'\r\n',E'\n');
    if length(v_definition)-length(replace(v_definition,v_candidate,''))<>length(v_candidate) then
      raise exception 'test reverse-candidate range mismatch';
    end if;
    v_definition:=replace(v_definition,v_candidate,v_prior_builder);
    if p_case='accepted_crlf' then v_definition:=replace(v_definition,E'\n',E'\r\n');end if;
    execute v_definition;
    select to_jsonb(p) into strict v_baseline from pg_catalog.pg_proc p where oid=v_target;
    v_baseline_pin:=md5(replace(v_baseline->>'prosrc',E'\r\n',E'\n'))='e638c34aaa588e2b64f63fa3dc3102b0'
      and encode(extensions.digest(convert_to(replace(v_baseline->>'prosrc',E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')
        ='821d34d4ca0234b42ae48b87715bad224c901ef9e0a35fbeb4204a63a45d1b1d';
    if not v_baseline_pin then raise exception 'test reversed whole-body pin mismatch';end if;

    case p_case
      when 'accepted_lf' then null;
      when 'accepted_crlf' then null;
      when 'accepted_cost_acl' then
        execute format('alter function %s cost 31',v_target);
        execute format('grant execute on function %s to service_role with grant option',v_target);
      when 'body_drift' then
        v_definition:=replace(pg_catalog.pg_get_functiondef(v_target),E'\r\n',E'\n');
        execute replace(v_definition,v_prior_builder,v_prior_builder||E'\n     -- intentional test body drift');
      when 'security_drift' then execute format('alter function %s security invoker',v_target);
      when 'search_path_drift' then execute format('alter function %s set search_path to public',v_target);
      when 'owner_drift' then execute format('alter function %s owner to service_role',v_target);
      when 'strict_drift' then execute format('alter function %s strict',v_target);
      when 'volatile_drift' then execute format('alter function %s stable',v_target);
      when 'parallel_drift' then execute format('alter function %s parallel safe',v_target);
      else raise exception 'unknown guard probe case';
    end case;
    select to_jsonb(p) into strict v_baseline from pg_catalog.pg_proc p where oid=v_target;
    perform pg_temp.single_builder_apply_actual_migration();
    v_applied:=true;
    select to_jsonb(p) into strict v_after from pg_catalog.pg_proc p where oid=v_target;
    v_after_pin:=md5(replace(v_after->>'prosrc',E'\r\n',E'\n'))='0eec947d66bbac2930385977b448a836'
      and encode(extensions.digest(convert_to(replace(v_after->>'prosrc',E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')
        ='b3062b925c3968caf9bba6129a288e49006cdeb9140165c24a3245628192a3d2';
    v_metadata_equal:=(v_after-'prosrc') is not distinct from (v_baseline-'prosrc');
    -- Force rollback even after success. PL/pgSQL variables survive the caught
    -- exception; catalog/DML changes in this block do not.
    raise exception 'single_builder_probe_rollback' using errcode='Z0940';
  exception when others then
    get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;
  end;
  return jsonb_build_object(
    'baselinePin',v_baseline_pin,'applied',v_applied,'state',v_state,'message',v_message,
    'afterPin',v_after_pin,'metadataEqual',v_metadata_equal,
    'rollbackCatalogEqual',(select to_jsonb(p) from pg_catalog.pg_proc p where oid=v_target) is not distinct from v_before,
    'rollbackDataEqual',pg_temp.single_builder_snapshot() is not distinct from v_data);
end;
$probe$;

create temporary table single_builder_guard_cases(case_no integer primary key,case_name text not null,expected_state text not null,expected_message text not null,expected_applied boolean not null);
insert into single_builder_guard_cases values
 (1,'accepted_lf','Z0940','single_builder_probe_rollback',true),
 (2,'accepted_crlf','Z0940','single_builder_probe_rollback',true),
 (3,'accepted_cost_acl','Z0940','single_builder_probe_rollback',true),
 (4,'body_drift','55000','pos_import_recovery_plan_single_builder_baseline_mismatch',false),
 (5,'security_drift','55000','pos_import_recovery_plan_single_builder_baseline_mismatch',false),
 (6,'search_path_drift','55000','pos_import_recovery_plan_single_builder_baseline_mismatch',false),
 (7,'owner_drift','55000','pos_import_recovery_plan_single_builder_baseline_mismatch',false),
 (8,'strict_drift','55000','pos_import_recovery_plan_single_builder_baseline_mismatch',false),
 (9,'volatile_drift','55000','pos_import_recovery_plan_single_builder_baseline_mismatch',false),
 (10,'parallel_drift','55000','pos_import_recovery_plan_single_builder_baseline_mismatch',false);
create temporary table single_builder_guard_results as
select c.*,pg_temp.single_builder_guard_probe(c.case_name) result from single_builder_guard_cases c order by case_no;
select is(result->>'baselinePin','true',case_name||': reverse reconstructs the whole pinned e638 body')
from single_builder_guard_results order by case_no;
select is(result->>'state',expected_state,case_name||': actual migration SQLSTATE or controlled rollback')
from single_builder_guard_results order by case_no;
select is(result->>'message',expected_message,case_name||': actual migration error identity')
from single_builder_guard_results order by case_no;
select is((result->>'applied')::boolean,expected_applied,case_name||': drift refuses before body replacement')
from single_builder_guard_results order by case_no;
select is(result->>'rollbackCatalogEqual','true',case_name||': caught transaction restores complete original pg_proc')
from single_builder_guard_results order by case_no;
select is(result->>'rollbackDataEqual','true',case_name||': caught transaction preserves every owned staging field')
from single_builder_guard_results order by case_no;
select is(result->>'afterPin','true',case_name||': successful actual migration produces the pinned candidate')
from single_builder_guard_results where expected_applied order by case_no;
select is(result->>'metadataEqual','true',case_name||': success preserves full OID/owner/ACL/config/cost/flags except prosrc')
from single_builder_guard_results where expected_applied order by case_no;
select is(pg_temp.single_builder_snapshot(),(select value from single_builder_before),
  'all migration probes preserve the full owned staging snapshot');
select is(
  (select replace(prosrc,E'\r\n',E'\n') from pg_catalog.pg_proc
    where oid='app_private.pos_import_recovery_phased_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure),
  (select body from single_builder_artifacts where name='installed'),
  'all success/drift probes roll back to the exact installed candidate body');
select * from finish();
rollback;

