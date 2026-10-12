-- Query regression, not a live/authenticated import or a performance receipt.
-- Evaluate the actual installed global IF expression on actual staging tables.
-- No auth stub, altered grant, planner setting, deadline or economic apply.
begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select is(
  (select md5(replace(prosrc,E'\r\n',E'\n')) from pg_catalog.pg_proc
   where oid='app_private.pos_import_recovery_phased_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure),
  '564beca67b00d3e9867be23210a0a8ec',
  'installed body includes identity pairing, complete-plan builder and later coverage projection'
);

create temporary table identity_pairing_expressions(origin text primary key,expression text not null);
do $extract$
declare
  v_source text;
  v_begin text := 'if (with normalized as not materialized (';
  v_end text := E')\n         then raise exception ''global original identity collision'' using errcode=''22023'';end if;';
  v_start integer;
  v_length integer;
begin
  select replace(prosrc,E'\r\n',E'\n') into strict v_source from pg_catalog.pg_proc
    where oid='app_private.pos_import_recovery_phased_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure;
  if (length(v_source)-length(replace(v_source,v_begin,'')))<>length(v_begin)
    or (length(v_source)-length(replace(v_source,v_end,'')))<>length(v_end) then
    raise exception 'global identity IF extraction anchors are not unique';
  end if;
  v_start := strpos(v_source,v_begin)+length('if (');
  v_length := strpos(substr(v_source,v_start),v_end)-1;
  if v_length<=0 then raise exception 'global identity IF extraction range is invalid';end if;
  insert into identity_pairing_expressions values('candidate',substr(v_source,v_start,v_length));
end;
$extract$;

-- Independent copy of the prior e018 expression: never replace its JOIN with
-- the candidate or infer expectations from it. Variables are bound below.
insert into identity_pairing_expressions values('baseline',$baseline$with normalized as not materialized (
         select group_index,ordinal,client_item_id,row_json->>'changeKind' kind,
           row_json->>'barcode' barcode,row_json->>'itemNumber' item_number
         from app_private.pos_import_recovery_normal_rows
         where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='root'
       ), raw as not materialized (
         select group_index,ordinal,coalesce(row_json->>'barcode','') barcode,
           coalesce(row_json->>'itemNumber',row_json->>'item_number','') item_number
         from app_private.pos_import_recovery_raw_rows
         where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='root'
       ) select exists(select 1 from normalized group by client_item_id having count(*)<>1)
         or exists(select 1 from normalized where kind in('new','updated') group by barcode having count(*)<>1)
         or exists(select 1 from normalized join raw using(group_index,ordinal)
           cross join lateral(values('barcode',normalized.barcode,raw.barcode),('itemNumber',normalized.item_number,raw.item_number)) fields(field,normalized_value,raw_value)
           where coalesce(fields.normalized_value,'')<>''
           group by fields.field,fields.normalized_value having count(distinct fields.raw_value)>1)$baseline$);

-- These are scalar query fixtures. In particular NULL/NFC adversarial rows
-- exercise SQL semantics, not an assertion that official parsing accepts them.
-- The omitted changeKind defaults to the actual normalized no_change token.
create temporary table identity_pairing_cases as
select ordinal::integer case_no,entry->>'group' group_name,entry->>'name' case_name,
  (entry->>'expected')::boolean expected,entry->'rows' rows,
  ('94000000-0000-4000-8000-'||lpad(ordinal::text,12,'0'))::uuid upload_id
from jsonb_array_elements($vectors$[
 {"group":"unique_valid","name":"unique_valid","expected":false,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":"n1","barcode":"B1","itemNumber":"N1"},"raw":{"barcode":"B1","itemNumber":"N1"}},
  {"group":1,"ordinal":0,"normalized":{"clientItemId":"n2","barcode":"B2","itemNumber":"N2"},"raw":{"barcode":"B2","itemNumber":"N2"}}]},
 {"group":"client_id_duplicate_beyond_page","name":"duplicate_client_id_at_0_and_1000","expected":true,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":"same","barcode":"B1"},"raw":{"barcode":"B1"}},
  {"ordinal":1000,"normalized":{"clientItemId":"same","barcode":"B2"}}]},
 {"group":"client_id_duplicate_beyond_page","name":"null_and_missing_client_id_are_one_group","expected":true,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":null,"barcode":"B1"},"raw":{"barcode":"B1"}},
  {"ordinal":1000,"normalized":{"barcode":"B2"},"raw":{"barcode":"B2"}}]},
 {"group":"new_updated_barcode_duplicate","name":"new_updated_duplicate_barcode","expected":true,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":"n1","barcode":"B","changeKind":"new"},"raw":{"barcode":"B"}},
  {"ordinal":1000,"normalized":{"clientItemId":"n2","barcode":"B","changeKind":"updated"},"raw":{"barcode":"B"}}]},
 {"group":"new_updated_barcode_duplicate","name":"new_updated_empty_barcode","expected":true,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":"n1","barcode":"","changeKind":"new"},"raw":{"barcode":""}},
  {"ordinal":1,"normalized":{"clientItemId":"n2","barcode":"","changeKind":"updated"},"raw":{"barcode":""}}]},
 {"group":"new_updated_barcode_duplicate","name":"new_updated_null_and_missing_barcode","expected":true,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":"n1","barcode":null,"changeKind":"new"},"raw":{}},
  {"ordinal":1,"normalized":{"clientItemId":"n2","changeKind":"updated"},"raw":{}}]},
 {"group":"unchanged_barcode_same_raw","name":"no_change_and_null_kind_same_raw","expected":false,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":"n1","barcode":"B"},"raw":{"barcode":"B"}},
  {"ordinal":1,"normalized":{"clientItemId":"n2","barcode":"B","changeKind":null},"raw":{"barcode":"B"}}]},
 {"group":"barcode_trim_collision","name":"barcode_exact_raw_trim_collision","expected":true,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":"n1","barcode":"B"},"raw":{"barcode":"B"}},
  {"ordinal":1000,"normalized":{"clientItemId":"n2","barcode":"B"},"raw":{"barcode":" B "}}]},
 {"group":"item_number_trim_collision","name":"item_number_exact_raw_trim_collision","expected":true,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":"n1","barcode":"B1","itemNumber":"N"},"raw":{"barcode":"B1","itemNumber":"N"}},
  {"ordinal":1,"normalized":{"clientItemId":"n2","barcode":"B2","itemNumber":"N"},"raw":{"barcode":"B2","itemNumber":" N "}}]},
 {"group":"nfc_projection_collision","name":"composed_decomposed_raw_projection","expected":true,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":"n1","barcode":"B1","itemNumber":"\u00e9"},"raw":{"barcode":"B1","itemNumber":"\u00e9"}},
  {"ordinal":1,"normalized":{"clientItemId":"n2","barcode":"B2","itemNumber":"\u00e9"},"raw":{"barcode":"B2","itemNumber":"e\u0301"}}]},
 {"group":"empty_and_null_normalized","name":"empty_null_missing_normalized_are_excluded","expected":false,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":"n1","barcode":null,"itemNumber":null},"raw":{"barcode":"A","itemNumber":"X"}},
  {"ordinal":1,"normalized":{"clientItemId":"n2","barcode":"","itemNumber":""},"raw":{"barcode":"B","itemNumber":"Y"}},
  {"ordinal":2,"normalized":{"clientItemId":"n3"},"raw":{"barcode":"C","itemNumber":"Z"}}]},
 {"group":"raw_null_empty_equivalent","name":"raw_null_missing_empty_coalesce","expected":false,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":"n1","barcode":"B","itemNumber":"N"},"raw":{"barcode":null,"itemNumber":null}},
  {"ordinal":1,"normalized":{"clientItemId":"n2","barcode":"B","itemNumber":"N"},"raw":{}}]},
 {"group":"raw_null_empty_equivalent","name":"matched_raw_null_is_present_and_empty","expected":true,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":"n1","barcode":"B"},"raw":{"barcode":null}},
  {"ordinal":1,"normalized":{"clientItemId":"n2","barcode":"B"},"raw":{"barcode":"B"}}]},
 {"group":"item_number_null_camel_falls_back","name":"null_missing_camel_uses_snake","expected":true,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":"n1","barcode":"B1","itemNumber":"N"},"raw":{"barcode":"B1","itemNumber":null,"item_number":"A"}},
  {"ordinal":1,"normalized":{"clientItemId":"n2","barcode":"B2","itemNumber":"N"},"raw":{"barcode":"B2","item_number":"B"}}]},
 {"group":"item_number_empty_camel_shadows_alias","name":"empty_camel_shadows_distinct_alias","expected":false,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":"n1","barcode":"B1","itemNumber":"N"},"raw":{"barcode":"B1","itemNumber":"","item_number":"A"}},
  {"ordinal":1,"normalized":{"clientItemId":"n2","barcode":"B2","itemNumber":"N"},"raw":{"barcode":"B2","itemNumber":"","item_number":"B"}}]},
 {"group":"item_number_empty_camel_shadows_alias","name":"empty_camel_differs_from_missing_fallback","expected":true,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":"n1","barcode":"B1","itemNumber":"N"},"raw":{"barcode":"B1","itemNumber":"","item_number":"unused"}},
  {"ordinal":1,"normalized":{"clientItemId":"n2","barcode":"B2","itemNumber":"N"},"raw":{"barcode":"B2","item_number":"B"}}]},
 {"group":"item_number_camel_precedence","name":"nonempty_camel_shadows_alias","expected":false,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":"n1","barcode":"B1","itemNumber":"N"},"raw":{"barcode":"B1","itemNumber":"N","item_number":"A"}},
  {"ordinal":1,"normalized":{"clientItemId":"n2","barcode":"B2","itemNumber":"N"},"raw":{"barcode":"B2","itemNumber":"N","item_number":"B"}}]},
 {"group":"same_ordinal_different_group","name":"cross_group_orphans_must_not_pair","expected":false,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":"n1","barcode":"N"}},
  {"group":1,"ordinal":0,"raw":{"barcode":"A"}},
  {"ordinal":1,"normalized":{"clientItemId":"n2","barcode":"N"},"raw":{"barcode":"B"}},
  {"group":1,"ordinal":2,"normalized":{"clientItemId":"n3","barcode":"N2"},"raw":{"barcode":"C"}}]},
 {"group":"nonzero_group_collision","name":"group_one_collision_is_not_filtered","expected":true,"rows":[
  {"group":1,"ordinal":0,"normalized":{"clientItemId":"n1","barcode":"N"},"raw":{"barcode":"A"}},
  {"group":1,"ordinal":1,"normalized":{"clientItemId":"n2","barcode":"N"},"raw":{"barcode":"B"}}]},
 {"group":"raw_only_orphan","name":"raw_only_orphan_does_not_contribute","expected":false,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":"n1","barcode":"N"},"raw":{"barcode":"A"}},
  {"ordinal":1,"raw":{"barcode":"B"}}]},
 {"group":"normalized_only_orphan","name":"normalized_only_orphan_does_not_contribute","expected":false,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":"n1","barcode":"N"},"raw":{"barcode":"A"}},
  {"ordinal":1,"normalized":{"clientItemId":"n2","barcode":"N"}}]},
 {"group":"foreign_shop_device_upload_domain","name":"all_four_scope_dimensions_exclude_collisions","expected":false,"rows":[
  {"ordinal":0,"normalized":{"clientItemId":"n1","barcode":"B1"},"raw":{"barcode":"B1"}},
  {"ordinal":1,"normalized":{"clientItemId":"n2","barcode":"B2"},"raw":{"barcode":"B2"}},
  {"scope":"shop","ordinal":0,"normalized":{"clientItemId":"n1","barcode":"N"},"raw":{"barcode":"A"}},
  {"scope":"shop","ordinal":1,"normalized":{"clientItemId":"n2","barcode":"N"},"raw":{"barcode":"B"}},
  {"scope":"device","ordinal":0,"normalized":{"clientItemId":"n1","barcode":"N"},"raw":{"barcode":"A"}},
  {"scope":"device","ordinal":1,"normalized":{"clientItemId":"n2","barcode":"N"},"raw":{"barcode":"B"}},
  {"scope":"upload","ordinal":0,"normalized":{"clientItemId":"n1","barcode":"N"},"raw":{"barcode":"A"}},
  {"scope":"upload","ordinal":1,"normalized":{"clientItemId":"n2","barcode":"N"},"raw":{"barcode":"B"}},
  {"scope":"child","group":1,"ordinal":0,"normalized":{"clientItemId":"n1","barcode":"N"},"raw":{"barcode":"A"}},
  {"scope":"child","group":1,"ordinal":1,"normalized":{"clientItemId":"n2","barcode":"N"},"raw":{"barcode":"B"}}]}
]$vectors$::jsonb) with ordinality source(entry,ordinal);

select is((select count(distinct group_name) from identity_pairing_cases),17::bigint,
  'all seventeen independent regression groups are present');
select is((select count(*) from identity_pairing_cases),22::bigint,
  'NULL and alias variants supplement the seventeen groups');

create temporary table identity_pairing_fixture as
select c.case_no,
  case when r->>'scope'='shop' then '10000000-0000-4000-8000-000000094202'::uuid
    else '10000000-0000-4000-8000-000000094201'::uuid end shop_id,
  case when r->>'scope'='device' then '40000000-0000-4000-8000-000000094202'::uuid
    else '40000000-0000-4000-8000-000000094201'::uuid end shop_device_id,
  case when r->>'scope'='upload' then ('95000000-0000-4000-8000-'||lpad(c.case_no::text,12,'0'))::uuid
    else c.upload_id end upload_id,
  case when r->>'scope'='child' then 'child' else 'root' end domain,
  coalesce((r->>'group')::integer,0) group_index,(r->>'ordinal')::integer ordinal,
  side.is_normalized,
  case when side.is_normalized then jsonb_build_object('changeKind','no_change')||side.row_json
    else side.row_json end row_json
from identity_pairing_cases c cross join lateral jsonb_array_elements(c.rows) r
cross join lateral(values(true,r->'normalized'),(false,r->'raw')) side(is_normalized,row_json)
where jsonb_typeof(side.row_json)='object';

-- Real PKs enforce <=1 row per side/key. All documents are synthetic owned
-- fixture scopes; no existing rows are deleted or overwritten, even transiently.
insert into app_private.pos_import_recovery_documents(shop_id,shop_device_id,upload_id,mode,raw_hash,phase,header)
select distinct shop_id,shop_device_id,upload_id,'original','sha256:'||repeat('0',64),'items','{}'::jsonb
from identity_pairing_fixture;
insert into app_private.pos_import_recovery_raw_rows(shop_id,shop_device_id,upload_id,domain,group_index,ordinal,row_json)
select shop_id,shop_device_id,upload_id,domain,group_index,ordinal,row_json
from identity_pairing_fixture where not is_normalized;
insert into app_private.pos_import_recovery_normal_rows(shop_id,shop_device_id,upload_id,domain,group_index,ordinal,row_json,canonical_json)
select shop_id,shop_device_id,upload_id,domain,group_index,ordinal,row_json,row_json::text
from identity_pairing_fixture where is_normalized;

create function pg_temp.identity_pairing_snapshot() returns jsonb language sql stable as $snapshot$
  select jsonb_build_object(
    'documents',(select jsonb_agg(to_jsonb(d) order by d.shop_id,d.shop_device_id,d.upload_id)
      from app_private.pos_import_recovery_documents d where exists(select 1 from identity_pairing_fixture f
        where (f.shop_id,f.shop_device_id,f.upload_id)=(d.shop_id,d.shop_device_id,d.upload_id))),
    'raw',(select jsonb_agg(to_jsonb(r) order by r.shop_id,r.shop_device_id,r.upload_id,r.domain,r.group_index,r.ordinal)
      from app_private.pos_import_recovery_raw_rows r where exists(select 1 from identity_pairing_fixture f
        where (f.shop_id,f.shop_device_id,f.upload_id)=(r.shop_id,r.shop_device_id,r.upload_id))),
    'normal',(select jsonb_agg(to_jsonb(n) order by n.shop_id,n.shop_device_id,n.upload_id,n.domain,n.group_index,n.ordinal)
      from app_private.pos_import_recovery_normal_rows n where exists(select 1 from identity_pairing_fixture f
        where (f.shop_id,f.shop_device_id,f.upload_id)=(n.shop_id,n.shop_device_id,n.upload_id)))
  );
$snapshot$;
create temporary table identity_pairing_before as select pg_temp.identity_pairing_snapshot() value;

create function pg_temp.identity_pairing_evaluate(p_expression text,p_upload uuid) returns boolean
language plpgsql as $evaluate$
declare
  v_expression text;
  v_result boolean;
begin
  -- Only these three fixed variable tokens occur in the pinned IF expression.
  -- Values are parameter bound, never interpolated from the fixture JSON.
  v_expression := replace(replace(replace(p_expression,'p_shop_device_id','$2'),'p_shop_id','$1'),'v_id','$3');
  execute v_expression into strict v_result using
    '10000000-0000-4000-8000-000000094201'::uuid,
    '40000000-0000-4000-8000-000000094201'::uuid,p_upload;
  return v_result;
end;
$evaluate$;

create temporary table identity_pairing_results as
select c.case_no,c.case_name,c.expected,
  pg_temp.identity_pairing_evaluate((select expression from identity_pairing_expressions where origin='candidate'),c.upload_id) candidate,
  pg_temp.identity_pairing_evaluate((select expression from identity_pairing_expressions where origin='baseline'),c.upload_id) baseline
from identity_pairing_cases c order by c.case_no;
select is(candidate,expected,case_name||': installed candidate equals independent expectation')
from identity_pairing_results order by case_no;
select is(baseline,expected,case_name||': prior JOIN equals independent expectation')
from identity_pairing_results order by case_no;
select is(candidate,baseline,case_name||': installed candidate and prior JOIN agree on identical real rows')
from identity_pairing_results order by case_no;
select is(pg_temp.identity_pairing_snapshot(),(select value from identity_pairing_before),
  'both expressions leave every owned document/raw/normal field unchanged');

select * from finish();
rollback;
