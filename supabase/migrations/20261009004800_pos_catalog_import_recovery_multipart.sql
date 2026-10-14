-- TASK-094 large-original recovery. Source/local only until separately approved.
-- Existing 1000-row apply and masked correction implementations remain intact.
begin;

create table app_private.pos_catalog_import_recovery_uploads (
  shop_id uuid not null,shop_device_id uuid not null,upload_id uuid not null,
  mode text not null check(mode in ('original','plan')),
  manifest jsonb not null check(jsonb_typeof(manifest)='object'),
  manifest_hash text not null check(manifest_hash ~ '^sha256:[0-9a-f]{64}$'),
  raw_hash text not null check(raw_hash ~ '^sha256:[0-9a-f]{64}$'),
  total_bytes integer not null check(total_bytes between 1 and 536870912),
  normalized_request jsonb,canonical_hash text,client_import_id text,idempotency_key text,
  declared_hash text,original_schema text,item_count integer,
  created_at timestamptz not null default clock_timestamp(),verified_at timestamptz,
  primary key(shop_id,shop_device_id,upload_id),
  check(canonical_hash is null or canonical_hash ~ '^sha256:[0-9a-f]{64}$'),
  check(item_count is null or item_count between 1 and 60000)
);
create table app_private.pos_catalog_import_recovery_upload_parts (
  shop_id uuid not null,shop_device_id uuid not null,upload_id uuid not null,
  part_index integer not null check(part_index between 0 and 2047),
  raw_bytes bytea not null check(octet_length(raw_bytes) between 1 and 262144),
  primary key(shop_id,shop_device_id,upload_id,part_index),
  foreign key(shop_id,shop_device_id,upload_id) references app_private.pos_catalog_import_recovery_uploads
);
create table app_private.pos_catalog_import_recovery_plans (
  shop_id uuid not null,shop_device_id uuid not null,plan_id uuid not null,
  original_id uuid not null,original_client_import_id text not null,original_idempotency_key text not null,original_canonical_hash text not null,
  predecessor_plan_id uuid,plan_hash text not null check(plan_hash ~ '^sha256:[0-9a-f]{64}$'),
  mode text not null check(mode in ('replacement','correction')),
  coverage jsonb not null check(jsonb_typeof(coverage)='array'),
  item_count integer not null check(item_count between 0 and 60000),
  part_count integer not null check(part_count between 0 and 1024),
  created_at timestamptz not null default clock_timestamp(),
  primary key(shop_id,shop_device_id,plan_id),
  foreign key(shop_id,shop_device_id,original_id) references app_private.pos_catalog_import_recovery_uploads,
  foreign key(shop_id,shop_device_id,predecessor_plan_id) references app_private.pos_catalog_import_recovery_plans
);
create unique index pos_import_recovery_one_initial_plan on app_private.pos_catalog_import_recovery_plans
  (shop_id,shop_device_id,original_client_import_id,original_idempotency_key,original_canonical_hash) where predecessor_plan_id is null;
create unique index pos_import_recovery_one_successor on app_private.pos_catalog_import_recovery_plans
  (shop_id,shop_device_id,predecessor_plan_id) where predecessor_plan_id is not null;
create table app_private.pos_catalog_import_recovery_plan_parts (
  shop_id uuid not null,shop_device_id uuid not null,plan_id uuid not null,
  part_index integer not null check(part_index between 0 and 1023),
  child jsonb not null check(jsonb_typeof(child)='object'),
  ack_response jsonb,receipt_hash text,
  primary key(shop_id,shop_device_id,plan_id,part_index),
  foreign key(shop_id,shop_device_id,plan_id) references app_private.pos_catalog_import_recovery_plans,
  check(receipt_hash is null or receipt_hash ~ '^sha256:[0-9a-f]{64}$')
);
alter table app_private.pos_catalog_import_recovery_uploads enable row level security;
alter table app_private.pos_catalog_import_recovery_uploads force row level security;
alter table app_private.pos_catalog_import_recovery_upload_parts enable row level security;
alter table app_private.pos_catalog_import_recovery_upload_parts force row level security;
alter table app_private.pos_catalog_import_recovery_plans enable row level security;
alter table app_private.pos_catalog_import_recovery_plans force row level security;
alter table app_private.pos_catalog_import_recovery_plan_parts enable row level security;
alter table app_private.pos_catalog_import_recovery_plan_parts force row level security;
revoke all on app_private.pos_catalog_import_recovery_uploads,app_private.pos_catalog_import_recovery_upload_parts,
  app_private.pos_catalog_import_recovery_plans,app_private.pos_catalog_import_recovery_plan_parts from public,anon,authenticated,service_role;

-- Complete durable ACK validation stays in PostgreSQL. Public pages and internal
-- contributor projections never transfer a whole large ACK to the Worker.
create function app_private.pos_catalog_import_recovery_ack_valid_v1(
  p_schema text,p_normalized jsonb,p_receipt jsonb
) returns boolean language plpgsql immutable
set search_path=public,app_private,extensions,pg_temp as $$
declare
  v_changed integer;v_prices integer;v_uuid text:='^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
  if p_schema is null or p_schema not in ('pos-catalog-import-v1','pos-catalog-import-correction-v1')
    or jsonb_typeof(p_normalized->'items') is distinct from 'array'
    or jsonb_typeof(p_receipt) is distinct from 'object'
    or p_receipt->'ok' is distinct from 'true'::jsonb or coalesce(p_receipt->>'status','') not in('accepted','duplicate','idempotent')
    or coalesce(p_receipt->>'batchId','') !~ v_uuid
    or jsonb_typeof(p_receipt->'summary') is distinct from 'object'
    or jsonb_typeof(p_receipt->'items') is distinct from 'array'
    or jsonb_typeof(p_receipt->'remoteProductIds') is distinct from 'array'
    or jsonb_typeof(p_receipt->'remotePriceIds') is distinct from 'array' then return false;end if;
  if jsonb_array_length(p_normalized->'items')<>jsonb_array_length(p_receipt->'items')
    or (select count(distinct value->>'clientItemId') from jsonb_array_elements(p_receipt->'items'))<>jsonb_array_length(p_receipt->'items')
    or (select count(distinct value->>'clientItemId') from jsonb_array_elements(p_receipt->'remoteProductIds'))<>jsonb_array_length(p_receipt->'remoteProductIds')
    or (select count(distinct value->>'remoteProductId') from jsonb_array_elements(p_receipt->'remoteProductIds'))<>jsonb_array_length(p_receipt->'remoteProductIds')
    or (select count(distinct (value->>'clientItemId',value->>'priceType')) from jsonb_array_elements(p_receipt->'remotePriceIds'))<>jsonb_array_length(p_receipt->'remotePriceIds')
    or (select count(distinct value->>'remotePriceId') from jsonb_array_elements(p_receipt->'remotePriceIds'))<>jsonb_array_length(p_receipt->'remotePriceIds') then return false;end if;
  select count(*) into v_changed from jsonb_array_elements(p_normalized->'items') item
    where p_schema='pos-catalog-import-correction-v1' or item->>'changeKind' in('new','updated');
  if p_receipt->'summary'->'acceptedItemCount' is distinct from to_jsonb(case when p_receipt->>'status'='accepted' then v_changed else 0 end)
    or p_receipt->'summary'->'duplicateItemCount' is distinct from to_jsonb(case when p_receipt->>'status'='accepted' then 0 else v_changed end)
    or p_receipt->'summary'->'productCount' is distinct from to_jsonb(v_changed)
    or (p_receipt->>'status'='accepted' and jsonb_array_length(p_receipt->'remoteProductIds')<>v_changed)
    or jsonb_array_length(p_receipt->'remoteProductIds')>jsonb_array_length(p_normalized->'items') then return false;end if;

  if p_schema='pos-catalog-import-v1' then
    -- Historical persisted ACKs can be duplicate/idempotent after v1 -> v2
    -- replay. Preserve the existing parser's exact summary/map/status rules.
    if exists(with expected as materialized(select value item from jsonb_array_elements(p_normalized->'items')),
      products as materialized(select value mapping from jsonb_array_elements(p_receipt->'remoteProductIds')),
      prices as materialized(select value price from jsonb_array_elements(p_receipt->'remotePriceIds'))
      select 1 from jsonb_array_elements(p_receipt->'items') response
      left join expected on expected.item->>'clientItemId'=response->>'clientItemId'
      left join products on products.mapping->>'clientItemId'=response->>'clientItemId'
      left join prices chosen on chosen.price->>'clientItemId'=response->>'clientItemId' and chosen.price->>'priceType'=
        case when expected.item->'retailPrice' is distinct from 'null'::jsonb then 'retail' else 'purchase' end
      left join prices selected on selected.price->>'clientItemId'=response->>'clientItemId' and selected.price->>'priceType'=response->>'priceType'
      where expected.item is null or response->>'barcode' is distinct from expected.item->>'barcode'
        or not(coalesce(response->>'status','')=case when expected.item->>'changeKind' in('new','updated') then 'accepted' else 'skipped' end
          or (p_receipt->>'status'<>'accepted' and response->>'status'='duplicate'))
        or (coalesce(response->>'remoteProductId','')<>'' and response->>'remoteProductId' !~ v_uuid)
        or (coalesce(response->>'remotePriceId','')<>'' and response->>'remotePriceId' !~ v_uuid)
        or case when expected.item->>'changeKind' in('new','updated') then
          products.mapping is null or response->>'remoteProductId' is distinct from products.mapping->>'remoteProductId'
          or case when expected.item->'retailPrice' is distinct from 'null'::jsonb then
            response->>'priceType' is distinct from 'retail' or response->>'remotePriceId' is distinct from chosen.price->>'remotePriceId' or chosen.price is null
          when expected.item->'purchasePrice' is distinct from 'null'::jsonb then
            response->>'priceType' is distinct from 'purchase' or response->>'remotePriceId' is distinct from chosen.price->>'remotePriceId' or chosen.price is null
          else coalesce(response->>'priceType','')<>'' or coalesce(response->>'remotePriceId','')<>'' end
        when p_receipt->>'status'='accepted' then
          coalesce(response->>'remoteProductId','')<>'' or coalesce(response->>'remotePriceId','')<>'' or coalesce(response->>'priceType','')<>''
        else
          ((coalesce(response->>'remoteProductId','')<>'' or products.mapping is not null) and response->>'remoteProductId' is distinct from products.mapping->>'remoteProductId')
          or ((coalesce(response->>'remotePriceId','')<>'' or coalesce(response->>'priceType','')<>'') and
            (selected.price is null or response->>'remotePriceId' is distinct from selected.price->>'remotePriceId')) end) then return false;end if;
    if exists(select 1 from jsonb_array_elements(p_receipt->'remoteProductIds') mapping
      left join jsonb_array_elements(p_normalized->'items') item on item->>'clientItemId'=mapping->>'clientItemId'
      where item is null or (p_receipt->>'status'='accepted' and item->>'changeKind' not in('new','updated'))
        or mapping->>'barcode' is distinct from item->>'barcode' or coalesce(mapping->>'remoteProductId','') !~ v_uuid) then return false;end if;
    if exists(select 1 from jsonb_array_elements(p_normalized->'items') item
      left join jsonb_array_elements(p_receipt->'remoteProductIds') mapping on mapping->>'clientItemId'=item->>'clientItemId'
      where item->>'changeKind' in('new','updated') and mapping is null) then return false;end if;
    select coalesce(sum((item->'purchasePrice' is distinct from 'null'::jsonb)::integer+(item->'retailPrice' is distinct from 'null'::jsonb)::integer),0)
      into v_prices from jsonb_array_elements(p_normalized->'items') item where item->>'changeKind' in('new','updated');
    if (p_receipt->>'status'='accepted' and v_prices<>jsonb_array_length(p_receipt->'remotePriceIds')) or exists(
      select 1 from jsonb_array_elements(p_receipt->'remotePriceIds') price
      left join jsonb_array_elements(p_normalized->'items') item on item->>'clientItemId'=price->>'clientItemId'
      left join jsonb_array_elements(p_receipt->'remoteProductIds') mapping on mapping->>'clientItemId'=price->>'clientItemId'
      where item is null or (p_receipt->>'status'='accepted' and item->>'changeKind' not in('new','updated'))
        or price->>'barcode' is distinct from item->>'barcode' or coalesce(price->>'remotePriceId','') !~ v_uuid
        or price->>'remoteProductId' is distinct from mapping->>'remoteProductId' or mapping is null
        or case price->>'priceType' when 'purchase' then item->'purchasePrice' is not distinct from 'null'::jsonb
          when 'retail' then item->'retailPrice' is not distinct from 'null'::jsonb else true end) then return false;end if;
    if exists(with prices as materialized(select value price from jsonb_array_elements(p_receipt->'remotePriceIds'))
      select 1 from jsonb_array_elements(p_normalized->'items') item cross join (values('retail','retailPrice'),('purchase','purchasePrice')) required(kind,field)
      left join prices on prices.price->>'clientItemId'=item->>'clientItemId' and prices.price->>'priceType'=required.kind
      where item->>'changeKind' in('new','updated') and item->required.field is distinct from 'null'::jsonb and prices.price is null) then return false;end if;
  else
    if p_receipt->>'status'<>'accepted' then return false;end if;
    -- Correction barcodes can be renamed remotely. Product identity, revision,
    -- every mask price ACK/no-effect proof and exact included base value bind it.
    if exists(select 1 from jsonb_array_elements(p_receipt->'items') response
      left join jsonb_array_elements(p_normalized->'items') item on item->>'clientItemId'=response->>'clientItemId'
      where item is null or response->>'status' is distinct from 'accepted'
        or response->>'remoteProductId' is distinct from item->>'remoteProductId'
        or coalesce(response->>'authoritativeRevision','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z$'
        or jsonb_typeof(response->'unchangedFields') is distinct from 'array'
        or (select count(distinct field) from jsonb_array_elements_text(response->'unchangedFields') field)<>jsonb_array_length(response->'unchangedFields')
        or exists(select 1 from jsonb_array_elements_text(response->'unchangedFields') field
          where field not in('retailPrice','purchasePrice') or not(item->'fieldMask' ? field)
            or item->'changes'->field is distinct from item->'baseSnapshot'->field)) then return false;end if;
    if exists(select 1 from jsonb_array_elements(p_receipt->'remoteProductIds') mapping
      left join jsonb_array_elements(p_normalized->'items') item on item->>'clientItemId'=mapping->>'clientItemId'
      left join jsonb_array_elements(p_receipt->'items') response on response->>'clientItemId'=mapping->>'clientItemId'
      where item is null or mapping->>'remoteProductId' is distinct from item->>'remoteProductId'
        or mapping->>'authoritativeRevision' is distinct from response->>'authoritativeRevision') then return false;end if;
    if exists(select 1 from jsonb_array_elements(p_receipt->'remotePriceIds') price
      left join jsonb_array_elements(p_normalized->'items') item on item->>'clientItemId'=price->>'clientItemId'
      where item is null or coalesce(price->>'remotePriceId','') !~ v_uuid
        or price->>'remoteProductId' is distinct from item->>'remoteProductId'
        or not(item->'fieldMask' ? case price->>'priceType' when 'retail' then 'retailPrice' when 'purchase' then 'purchasePrice' else '__invalid__' end)) then return false;end if;
    if exists(with prices as materialized(select value price from jsonb_array_elements(p_receipt->'remotePriceIds'))
      select 1 from jsonb_array_elements(p_normalized->'items') item
      join jsonb_array_elements(p_receipt->'items') response on response->>'clientItemId'=item->>'clientItemId'
      cross join lateral jsonb_array_elements_text(item->'fieldMask') field
      left join prices on prices.price->>'clientItemId'=item->>'clientItemId' and prices.price->>'priceType'=
        case field when 'retailPrice' then 'retail' else 'purchase' end
      where field in('retailPrice','purchasePrice') and
        (response->'unchangedFields' ? field)=(prices.price is not null)) then return false;end if;
  end if;
  return true;
exception when invalid_text_representation or invalid_parameter_value or numeric_value_out_of_range then return false;
end;
$$;
revoke all on function app_private.pos_catalog_import_recovery_ack_valid_v1(text,jsonb,jsonb) from public,anon,authenticated,service_role;

-- A finite linear chain of immutable scoped plans. Handles from unrelated
-- roots/branches cannot supply economic contributions to a successor.
create function app_private.pos_catalog_import_recovery_ancestor_v1(p_shop uuid,p_device uuid,p_start uuid,p_target uuid)
returns boolean language sql stable set search_path=public,app_private,extensions,pg_temp as $$
  with recursive ancestors as (
    select plan_id,predecessor_plan_id,1 depth,array[plan_id] visited from app_private.pos_catalog_import_recovery_plans
      where shop_id=p_shop and shop_device_id=p_device and plan_id=p_start
    union all
    select parent.plan_id,parent.predecessor_plan_id,child.depth+1,child.visited||parent.plan_id
      from ancestors child join app_private.pos_catalog_import_recovery_plans parent on parent.shop_id=p_shop and parent.shop_device_id=p_device
        and parent.plan_id=child.predecessor_plan_id where child.depth<128 and not(parent.plan_id=any(child.visited))
  ) select exists(select 1 from ancestors where plan_id=p_target);
$$;
revoke all on function app_private.pos_catalog_import_recovery_ancestor_v1(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function app_private.pos_catalog_import_recovery_small_v1(
  p_shop_id uuid,p_shop_device_id uuid,p_staff_id uuid,p_pos_session_id uuid,p_owner_user_id uuid,
  p_action text,p_payload jsonb
) returns jsonb language plpgsql volatile security definer
set search_path=public,app_private,extensions,pg_temp as $$
declare
 v_auth text;v_upload app_private.pos_catalog_import_recovery_uploads%rowtype;
 v_original app_private.pos_catalog_import_recovery_uploads%rowtype;
 v_plan app_private.pos_catalog_import_recovery_plans%rowtype;
 v_predecessor app_private.pos_catalog_import_recovery_plans%rowtype;
 v_part app_private.pos_catalog_import_recovery_plan_parts%rowtype;
 v_id uuid;v_original_id uuid;v_predecessor_id uuid;v_index integer;v_bytes bytea;v_all_bytes bytea;
 v_manifest jsonb;v_expected jsonb;v_result jsonb;v_receipt jsonb;v_child jsonb;v_entry jsonb;
 v_hash text;v_count integer;v_total integer;v_offset integer;v_limit integer;v_complete boolean;v_proof record;
 v_binding jsonb:=jsonb_build_object('ok',true,'shopId',p_shop_id,'shopDeviceId',p_shop_device_id);
begin
 if p_action not in('upload','read-upload','finalize','read-original','read-receipt','read-plan-part','receipt','retire','plan','apply','receipt-page')
   or jsonb_typeof(p_payload) is distinct from 'object' then
   return jsonb_build_object('ok',false,'code','validation_failed');
 end if;
 v_auth:=app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
 if v_auth<>'ok' then return jsonb_build_object('ok',false,'code',v_auth);end if;

 if p_action in('upload','read-upload','finalize') then
   v_id:=(p_payload->>'uploadId')::uuid;
   perform pg_advisory_xact_lock(hashtext('pos-import-upload:'||p_shop_id::text||':'||p_shop_device_id::text),hashtext(v_id::text));
   v_auth:=app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
   if v_auth<>'ok' then return jsonb_build_object('ok',false,'code',v_auth);end if;
   if p_action='upload' then
     v_manifest:=p_payload->'manifest';v_index:=(p_payload->>'partIndex')::integer;
     if jsonb_typeof(v_manifest) is distinct from 'object' or v_manifest->>'mode' not in('original','plan')
       or coalesce(v_manifest->>'rawSha256','') !~ '^sha256:[0-9a-f]{64}$'
       or coalesce(p_payload->>'manifestSha256','') !~ '^sha256:[0-9a-f]{64}$'
       or jsonb_typeof(v_manifest->'parts') is distinct from 'array' then
       return jsonb_build_object('ok',false,'code','validation_failed');end if;
     v_total:=(v_manifest->>'totalByteLength')::integer;
     if v_total not between 1 and 536870912 or jsonb_array_length(v_manifest->'parts') not between 1 and 128
       or v_index not between 0 and jsonb_array_length(v_manifest->'parts')-1 then
       return jsonb_build_object('ok',false,'code','validation_failed');end if;
     v_count:=0;
     for v_entry in select value from jsonb_array_elements(v_manifest->'parts') loop
       if (v_entry->>'index')::integer<>v_count or (v_entry->>'byteLength')::integer not between 1 and 262144
         or coalesce(v_entry->>'sha256','') !~ '^sha256:[0-9a-f]{64}$' then
         return jsonb_build_object('ok',false,'code','validation_failed');end if;
       v_count:=v_count+1;
     end loop;
     if (select sum((part->>'byteLength')::integer) from jsonb_array_elements(v_manifest->'parts') part)<>v_total then
       return jsonb_build_object('ok',false,'code','validation_failed');end if;
     v_bytes:=decode(p_payload->>'contentBase64','base64');v_expected:=v_manifest->'parts'->v_index;
     if octet_length(v_bytes)<>(v_expected->>'byteLength')::integer
       or 'sha256:'||encode(extensions.digest(v_bytes,'sha256'),'hex')<>v_expected->>'sha256' then
       return jsonb_build_object('ok',false,'code','validation_failed');end if;
     insert into app_private.pos_catalog_import_recovery_uploads(shop_id,shop_device_id,upload_id,mode,manifest,manifest_hash,raw_hash,total_bytes)
     values(p_shop_id,p_shop_device_id,v_id,v_manifest->>'mode',v_manifest,p_payload->>'manifestSha256',v_manifest->>'rawSha256',v_total)
     on conflict do nothing;
   end if;
   select * into v_upload from app_private.pos_catalog_import_recovery_uploads
     where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id for update;
   v_auth:=app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
   if v_auth<>'ok' then return jsonb_build_object('ok',false,'code',v_auth);end if;
   if v_upload.upload_id is null then return jsonb_build_object('ok',false,'code','not_found');end if;
   if p_action='upload' then
     if v_upload.manifest is distinct from v_manifest or v_upload.manifest_hash is distinct from p_payload->>'manifestSha256' then
       return v_binding||jsonb_build_object('status','conflict','reason','upload_manifest_conflict');end if;
     select raw_bytes into v_all_bytes from app_private.pos_catalog_import_recovery_upload_parts
       where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and part_index=v_index;
     if found and v_all_bytes<>v_bytes then return v_binding||jsonb_build_object('status','conflict','reason','upload_part_conflict');end if;
     insert into app_private.pos_catalog_import_recovery_upload_parts values(p_shop_id,p_shop_device_id,v_id,v_index,v_bytes) on conflict do nothing;
     return v_binding||jsonb_build_object('status','uploaded','uploadId',v_id,'partIndex',v_index,'manifestSha256',v_upload.manifest_hash);
   end if;
   select count(*),string_agg(raw_bytes,''::bytea order by part_index) into v_count,v_all_bytes
     from app_private.pos_catalog_import_recovery_upload_parts where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
   if v_count<>jsonb_array_length(v_upload.manifest->'parts') or octet_length(v_all_bytes)<>v_upload.total_bytes
     or 'sha256:'||encode(extensions.digest(v_all_bytes,'sha256'),'hex')<>v_upload.raw_hash then
     return v_binding||jsonb_build_object('status','conflict','reason','upload_incomplete');end if;
   if p_action='read-upload' then
     return v_binding||jsonb_build_object('status','uploaded','uploadId',v_id,'manifest',v_upload.manifest,'manifestSha256',v_upload.manifest_hash,
       'parts',(select jsonb_agg(jsonb_build_object('index',part_index,'contentBase64',replace(encode(raw_bytes,'base64'),E'\n','')) order by part_index)
         from app_private.pos_catalog_import_recovery_upload_parts where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id));
   end if;
   if v_upload.mode<>'original' or v_upload.manifest_hash is distinct from p_payload->>'manifestSha256'
     or v_upload.raw_hash is distinct from p_payload->>'rawSha256'
     or coalesce(p_payload->>'canonicalPayloadHash','') !~ '^sha256:[0-9a-f]{64}$'
     or jsonb_typeof(p_payload->'normalizedRequest') is distinct from 'object'
     or coalesce(p_payload->>'originalSchemaVersion','') not in('pos-catalog-import-v1','pos-catalog-import-correction-v1')
     or length(p_payload->>'clientImportId') not between 1 and 200 or length(p_payload->>'idempotencyKey') not between 1 and 200
     or (p_payload->>'itemCount')::integer not between 1 and 60000 then
     return jsonb_build_object('ok',false,'code','validation_failed');end if;
   if v_upload.verified_at is not null and (v_upload.normalized_request is distinct from p_payload->'normalizedRequest'
     or v_upload.canonical_hash is distinct from p_payload->>'canonicalPayloadHash') then
     return v_binding||jsonb_build_object('status','conflict','reason','verified_original_conflict');end if;
   update app_private.pos_catalog_import_recovery_uploads set normalized_request=p_payload->'normalizedRequest',canonical_hash=p_payload->>'canonicalPayloadHash',
     client_import_id=p_payload->>'clientImportId',idempotency_key=p_payload->>'idempotencyKey',declared_hash=p_payload->>'payloadHash',
     original_schema=p_payload->>'originalSchemaVersion',item_count=(p_payload->>'itemCount')::integer,verified_at=coalesce(verified_at,clock_timestamp())
     where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
   return v_binding||jsonb_build_object('status','verified','verifiedOriginalId',v_id,'originalSchemaVersion',p_payload->>'originalSchemaVersion',
     'clientImportId',p_payload->>'clientImportId','idempotencyKey',p_payload->>'idempotencyKey','payloadHash',p_payload->>'payloadHash',
     'canonicalPayloadHash',p_payload->>'canonicalPayloadHash','rawSha256',v_upload.raw_hash,'itemCount',(p_payload->>'itemCount')::integer);
 end if;

 if p_action in('read-original','read-receipt') or (p_action in('receipt','retire','receipt-page') and p_payload?'verifiedOriginalId' and not(p_payload?'planId')) then
   v_id:=(p_payload->>'verifiedOriginalId')::uuid;
   select * into v_upload from app_private.pos_catalog_import_recovery_uploads
     where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and verified_at is not null;
   if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
   if p_action='read-original' then return v_binding||jsonb_build_object('status','verified','verifiedOriginalId',v_id,
     'normalizedRequest',v_upload.normalized_request,'originalSchemaVersion',v_upload.original_schema,
     'clientImportId',v_upload.client_import_id,'idempotencyKey',v_upload.idempotency_key,'payloadHash',v_upload.declared_hash,
     'canonicalPayloadHash',v_upload.canonical_hash,'itemCount',v_upload.item_count);end if;
   if p_action='retire' then
     v_result:=public.pos_catalog_import_retire_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id,
       v_upload.client_import_id,v_upload.idempotency_key,v_upload.canonical_hash);
   else
     v_result:=public.pos_catalog_import_receipt_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id,
       v_upload.client_import_id,v_upload.idempotency_key,v_upload.canonical_hash);
   end if;
   if v_result->>'ok' is distinct from 'true' then return v_result;end if;
   if v_result->>'status'<>'accepted' then return v_result||jsonb_build_object('verifiedOriginalId',v_id,'originalSchemaVersion',v_upload.original_schema,
     'payloadHash',v_upload.declared_hash,'canonicalPayloadHash',v_upload.canonical_hash);end if;
   v_receipt:=v_result->'receipt';
   if not app_private.pos_catalog_import_recovery_ack_valid_v1(v_upload.original_schema,v_upload.normalized_request,v_receipt) then
     return v_binding||jsonb_build_object('status','conflict','reason','receipt_unavailable');end if;
   if p_action='read-receipt' then
     if p_payload?'clientItemIds' and (jsonb_typeof(p_payload->'clientItemIds') is distinct from 'array'
       or jsonb_array_length(p_payload->'clientItemIds') not between 1 and 1000) then
       return jsonb_build_object('ok',false,'code','validation_failed');end if;
     v_result:=(v_result-'receipt'-'currentProductSnapshots')||jsonb_build_object('verifiedOriginalId',v_id,'receiptValidated',true,
       'totalItemCount',jsonb_array_length(v_receipt->'items'),'originalSchemaVersion',v_upload.original_schema,
       'rawItems',(with wanted as materialized(select value id from jsonb_array_elements_text(p_payload->'clientItemIds')),
         normalized as materialized(select item->>'clientItemId' id,ordinal from jsonb_array_elements(v_upload.normalized_request->'items') with ordinality source(item,ordinal)),
         raw as materialized(select item,ordinal from jsonb_array_elements(coalesce(v_upload.normalized_request->'rawItems','[]'::jsonb)) with ordinality source(item,ordinal))
         select coalesce(jsonb_agg(raw.item||jsonb_build_object('clientItemId',normalized.id) order by raw.ordinal),'[]'::jsonb) from wanted join normalized using(id) join raw using(ordinal)),
       'receiptSha256','sha256:'||encode(extensions.digest(v_receipt::text,'sha256'),'hex'),
       'remoteProductIds',(with wanted as materialized(select value id from jsonb_array_elements_text(p_payload->'clientItemIds'))
         select coalesce(jsonb_agg(mapping),'[]'::jsonb) from jsonb_array_elements(v_receipt->'remoteProductIds') mapping join wanted on wanted.id=mapping->>'clientItemId'));
     -- Correlation IDs in the internal projection are server-derived; the saved
     -- original raw JSON and intent fields remain untouched. Split oversized
     -- selections, never return an unbounded full contributor to the Worker.
     if octet_length(v_result::text)>262144 then return jsonb_build_object('ok',false,'code','projection_too_large');end if;
     return v_result;
   end if;
   v_result:=v_result||jsonb_build_object('verifiedOriginalId',v_id,'originalSchemaVersion',v_upload.original_schema,
     'payloadHash',v_upload.declared_hash,'canonicalPayloadHash',v_upload.canonical_hash);
 end if;

 if p_action='read-plan-part' or (p_action in('receipt','retire') and p_payload?'planId') then
   v_id:=(p_payload->>'planId')::uuid;v_index:=(p_payload->>'partIndex')::integer;
   select * into v_plan from app_private.pos_catalog_import_recovery_plans
     where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=v_id;
   if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
   select * into v_original from app_private.pos_catalog_import_recovery_uploads where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_plan.original_id;
   perform pg_advisory_xact_lock(hashtext('pos-import-recovery-root:'||p_shop_id::text||':'||p_shop_device_id::text),
     hashtext(v_original.client_import_id||':'||v_original.idempotency_key||':'||v_original.canonical_hash));
   perform pg_advisory_xact_lock(hashtext('pos-import-plan:'||p_shop_id::text||':'||p_shop_device_id::text),hashtext(v_id::text));
   v_auth:=app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
   if v_auth<>'ok' then return jsonb_build_object('ok',false,'code',v_auth);end if;
   select * into v_part from app_private.pos_catalog_import_recovery_plan_parts where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=v_id and part_index=v_index;
   if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
   v_child:=v_part.child;
   if p_action='read-plan-part' then
     select * into v_upload from app_private.pos_catalog_import_recovery_uploads where shop_id=p_shop_id and shop_device_id=p_shop_device_id
       and upload_id=(p_payload->>'verifiedOriginalId')::uuid and verified_at is not null;
     if not found or v_upload.client_import_id is distinct from v_original.client_import_id or v_upload.idempotency_key is distinct from v_original.idempotency_key
       or v_upload.canonical_hash is distinct from v_original.canonical_hash or jsonb_typeof(p_payload->'clientItemIds') is distinct from 'array'
       or jsonb_array_length(p_payload->'clientItemIds') not between 1 and 1000
       or not app_private.pos_catalog_import_recovery_ancestor_v1(p_shop_id,p_shop_device_id,(p_payload->>'predecessorPlanId')::uuid,v_id) then
       return jsonb_build_object('ok',false,'code','validation_failed');end if;
     v_receipt:=v_part.ack_response;
     if v_receipt is null or not app_private.pos_catalog_import_recovery_ack_valid_v1(
       case v_child->>'kind' when 'ordinary' then 'pos-catalog-import-v1' else 'pos-catalog-import-correction-v1' end,v_child,v_receipt) then
       return v_binding||jsonb_build_object('status','conflict','reason','contributor_unavailable');end if;
     v_result:=v_binding||jsonb_build_object('status','accepted','receiptValidated',true,'planId',v_id,'partIndex',v_index,
       'canonicalPayloadHash',v_child->>'payloadHash','receiptSha256','sha256:'||encode(extensions.digest(v_receipt::text,'sha256'),'hex'),
       'items',(with wanted as materialized(select value id from jsonb_array_elements_text(p_payload->'clientItemIds')),
         child_items as materialized(select item->>'clientItemId' id,item from jsonb_array_elements(v_child->'items') item),
         response_items as materialized(select response->>'clientItemId' id,response from jsonb_array_elements(v_receipt->'items') response),
         mappings as materialized(select mapping->>'clientItemId' id,mapping from jsonb_array_elements(v_receipt->'remoteProductIds') mapping),
         coverage as materialized(select entry->>'childClientItemId' id,entry->>'clientItemId' root_id from jsonb_array_elements(v_plan.coverage) entry where entry->>'kind'='child' and (entry->>'partIndex')::integer=v_index)
         select coalesce(jsonb_agg(jsonb_build_object('clientItemId',child_items.id,'originalClientItemId',coverage.root_id,
           'barcode',case when v_child->>'kind'='ordinary' then item->>'barcode' else response->>'barcode' end,
           'itemStatus',response->>'status','economic',v_child->>'kind'='correction' or item->>'changeKind' in('new','updated'),
           'remoteProductId',case when v_child->>'kind'='correction' or item->>'changeKind' in('new','updated') then mapping->>'remoteProductId' else null end)), '[]'::jsonb)
           from wanted join child_items using(id) join response_items using(id) left join mappings using(id) left join coverage using(id)));
     if octet_length(v_result::text)>262144 then return jsonb_build_object('ok',false,'code','projection_too_large');end if;
     return v_result;
   end if;
   if p_action='retire' then v_result:=public.pos_catalog_import_retire_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id,
     v_child->>'clientImportId',v_child->>'idempotencyKey',v_child->>'payloadHash');
   else v_result:=public.pos_catalog_import_receipt_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id,
     v_child->>'clientImportId',v_child->>'idempotencyKey',v_child->>'payloadHash');end if;
   if v_result->>'ok' is distinct from 'true' then return v_result;end if;
   v_result:=(v_result-'payloadHash')||jsonb_build_object('planId',v_id,'partIndex',v_index,'originalSchemaVersion',
     case v_child->>'kind' when 'ordinary' then 'pos-catalog-import-v1' else 'pos-catalog-import-correction-v1' end,
     'payloadHash',v_child->>'declaredPayloadHash','canonicalPayloadHash',v_child->>'payloadHash');
   if v_result->>'status' is distinct from 'accepted' then return v_result;end if;
   v_receipt:=v_result->'receipt';
   if not app_private.pos_catalog_import_recovery_ack_valid_v1(
     case v_child->>'kind' when 'ordinary' then 'pos-catalog-import-v1' else 'pos-catalog-import-correction-v1' end,v_child,v_receipt) then
     return v_binding||jsonb_build_object('status','conflict','reason','receipt_unavailable');end if;
   if p_action='retire' then
     -- Explicit retirement can discover an ordinary/correction endpoint won.
     -- Adopt only that exact validated durable ACK; never reapply economics.
     if v_part.ack_response is not null and v_part.ack_response is distinct from v_receipt then
       return v_binding||jsonb_build_object('status','conflict','reason','receipt_identity_conflict');end if;
     update app_private.pos_catalog_import_recovery_plan_parts set ack_response=v_receipt,
       receipt_hash='sha256:'||encode(extensions.digest(v_receipt::text,'sha256'),'hex')
       where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=v_id and part_index=v_index and ack_response is null;
   end if;
 end if;

 if p_action='plan' then
   v_id:=(p_payload->>'uploadId')::uuid;
   select * into v_upload from app_private.pos_catalog_import_recovery_uploads where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id for update;
   v_auth:=app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
   if v_auth<>'ok' then return jsonb_build_object('ok',false,'code',v_auth);end if;
   if v_upload.upload_id is null or v_upload.mode<>'plan' or v_upload.raw_hash is distinct from p_payload->>'rawSha256'
     or v_upload.manifest_hash is distinct from p_payload->>'manifestSha256' then return jsonb_build_object('ok',false,'code','validation_failed');end if;
   select count(*),string_agg(raw_bytes,''::bytea order by part_index) into v_count,v_all_bytes
     from app_private.pos_catalog_import_recovery_upload_parts where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
   if v_count<>jsonb_array_length(v_upload.manifest->'parts') or 'sha256:'||encode(extensions.digest(v_all_bytes,'sha256'),'hex')<>v_upload.raw_hash then
     return v_binding||jsonb_build_object('status','conflict','reason','upload_incomplete');end if;
   v_expected:=p_payload->'plan';v_original_id:=(v_expected->>'verifiedOriginalId')::uuid;v_id:=(v_expected->>'planId')::uuid;
   select * into v_original from app_private.pos_catalog_import_recovery_uploads where shop_id=p_shop_id and shop_device_id=p_shop_device_id
     and upload_id=v_original_id and verified_at is not null;
   if not found or v_expected->>'mode' not in('replacement','correction') or coalesce(v_expected->>'planCanonicalHash','') !~ '^sha256:[0-9a-f]{64}$'
     or jsonb_typeof(v_expected->'parts') is distinct from 'array' or jsonb_typeof(v_expected->'coverage') is distinct from 'array'
     or jsonb_array_length(v_expected->'parts')>1024 then return jsonb_build_object('ok',false,'code','validation_failed');end if;
   perform pg_advisory_xact_lock(hashtext('pos-import-recovery-root:'||p_shop_id::text||':'||p_shop_device_id::text),
     hashtext(v_original.client_import_id||':'||v_original.idempotency_key||':'||v_original.canonical_hash));
   -- Root -> plan -> identity -> row is also the apply/replay order. A replay cannot
   -- hold original locks while waiting for an apply's plan row.
   perform pg_advisory_xact_lock(hashtext('pos-import-plan:'||p_shop_id::text||':'||p_shop_device_id::text),hashtext(v_id::text));
   v_auth:=app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
   if v_auth<>'ok' then return jsonb_build_object('ok',false,'code',v_auth);end if;
   v_result:=public.pos_catalog_import_receipt_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id,
     v_original.client_import_id,v_original.idempotency_key,v_original.canonical_hash);
   -- Planning NEVER creates retirement. The only allowed replacement is an
   -- already retired identity, checked below without invoking a mutable RPC.
   -- The caller cannot use a not_found snapshot as permission to apply.
   if v_expected->>'mode'='replacement' and not exists(select 1 from app_private.pos_catalog_import_retirements
     where shop_id=p_shop_id and shop_device_id=p_shop_device_id and client_import_id=v_original.client_import_id
       and idempotency_key=v_original.idempotency_key and payload_hash=v_original.canonical_hash) then
     return v_binding||jsonb_build_object('status','conflict','reason','original_not_retired');end if;
   if v_result->>'ok' is distinct from 'true' then return v_result;end if;
   if v_expected->>'mode'='correction' and (v_result->>'status' is distinct from 'accepted'
     or not app_private.pos_catalog_import_recovery_ack_valid_v1(v_original.original_schema,v_original.normalized_request,v_result->'receipt')) then
     return v_binding||jsonb_build_object('status','conflict','reason','original_receipt_unavailable');end if;
   v_predecessor_id:=null;
   if v_expected?'supersedes' then
     v_predecessor_id:=(v_expected->'supersedes'->>'planId')::uuid;
     if v_predecessor_id=v_id or jsonb_typeof(v_expected->'supersedes'->'retiredChildren') is distinct from 'array' then
       return jsonb_build_object('ok',false,'code','validation_failed');end if;
     select * into v_predecessor from app_private.pos_catalog_import_recovery_plans where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=v_predecessor_id;
     if not found or v_predecessor.mode is distinct from v_expected->>'mode' or v_predecessor.original_client_import_id is distinct from v_original.client_import_id
       or v_predecessor.original_idempotency_key is distinct from v_original.idempotency_key or v_predecessor.original_canonical_hash is distinct from v_original.canonical_hash then
       return v_binding||jsonb_build_object('status','conflict','reason','predecessor_scope_conflict');end if;
     -- The common root lock precedes predecessor/target plan and identity locks.
     perform pg_advisory_xact_lock(hashtext('pos-import-plan:'||p_shop_id::text||':'||p_shop_device_id::text),hashtext(v_predecessor_id::text));
     for v_part in select * from app_private.pos_catalog_import_recovery_plan_parts where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=v_predecessor_id order by part_index loop
       v_child:=v_part.child;
       if v_part.ack_response is null then
         if not exists(select 1 from jsonb_array_elements(v_expected->'supersedes'->'retiredChildren') retired
           where (retired->>'partIndex')::integer=v_part.part_index and retired->>'canonicalPayloadHash'=v_child->>'payloadHash')
           or not exists(select 1 from app_private.pos_catalog_import_retirements where shop_id=p_shop_id and shop_device_id=p_shop_device_id
             and client_import_id=v_child->>'clientImportId' and idempotency_key=v_child->>'idempotencyKey' and payload_hash=v_child->>'payloadHash') then
           return v_binding||jsonb_build_object('status','conflict','reason','predecessor_child_not_retired');end if;
       elsif not app_private.pos_catalog_import_recovery_ack_valid_v1(
         case v_child->>'kind' when 'ordinary' then 'pos-catalog-import-v1' else 'pos-catalog-import-correction-v1' end,v_child,v_part.ack_response)
         or exists(with children as materialized(select item->>'clientItemId' child_id from jsonb_array_elements(v_child->'items') item),
           previous as materialized(select entry->>'clientItemId' root_id,entry->>'childClientItemId' child_id from jsonb_array_elements(v_predecessor.coverage) entry
             where entry->>'kind'='child' and (entry->>'partIndex')::integer=v_part.part_index),
           carried as materialized(select entry->>'clientItemId' root_id,entry->>'contributorClientItemId' child_id from jsonb_array_elements(v_expected->'coverage') entry
             where entry->>'kind'='accepted_plan_part' and (entry->>'contributorPlanId')::uuid=v_predecessor_id and (entry->>'contributorPartIndex')::integer=v_part.part_index)
           select 1 from children left join previous using(child_id) left join carried using(child_id,root_id) where carried.child_id is null) then
         return v_binding||jsonb_build_object('status','conflict','reason','predecessor_ack_not_carried');end if;
     end loop;
     if exists(select previous from jsonb_array_elements(v_predecessor.coverage) previous where previous->>'kind' in('accepted_plan_part','accepted_contributor')
       except select current from jsonb_array_elements(v_expected->'coverage') current) then
       return v_binding||jsonb_build_object('status','conflict','reason','predecessor_proof_not_carried');end if;
     -- Maximum 128 generations; no silent truncation permits an older proof.
     if exists(with recursive ancestry as (
       select plan_id,predecessor_plan_id,1 depth from app_private.pos_catalog_import_recovery_plans where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=v_predecessor_id
       union all select parent.plan_id,parent.predecessor_plan_id,child.depth+1 from ancestry child join app_private.pos_catalog_import_recovery_plans parent
         on parent.shop_id=p_shop_id and parent.shop_device_id=p_shop_device_id and parent.plan_id=child.predecessor_plan_id where child.depth<128
       ) select 1 from ancestry where depth=128) then return v_binding||jsonb_build_object('status','conflict','reason','recovery_ancestry_limit');end if;
     if jsonb_array_length(v_expected->'supersedes'->'retiredChildren')<>(select count(*) from app_private.pos_catalog_import_recovery_plan_parts
       where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=v_predecessor_id and ack_response is null) then
       return v_binding||jsonb_build_object('status','conflict','reason','predecessor_retirement_set_conflict');end if;
   end if;
   if exists(select 1 from app_private.pos_catalog_import_recovery_plans existing where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id<>v_id and
     ((v_predecessor_id is null and predecessor_plan_id is null and original_client_import_id=v_original.client_import_id
        and original_idempotency_key=v_original.idempotency_key and original_canonical_hash=v_original.canonical_hash)
      or (v_predecessor_id is not null and predecessor_plan_id=v_predecessor_id))) then
     return v_binding||jsonb_build_object('status','conflict','reason','recovery_group_fork');end if;
   if jsonb_array_length(v_expected->'coverage')<>v_original.item_count or
     (select count(distinct entry->>'clientItemId') from jsonb_array_elements(v_expected->'coverage') entry)<>v_original.item_count then
     return jsonb_build_object('ok',false,'code','validation_failed');end if;
   -- Expand each immutable row set exactly once. Correlated SRFs here made a
   -- real 5000-row plan spill for minutes without reaching an economic write.
   if (with roots as materialized (
       select item->>'clientItemId' root_id from jsonb_array_elements(v_original.normalized_request->'items') item
     ), coverage as materialized (
       select entry->>'clientItemId' root_id,entry->>'kind' kind,(entry->>'partIndex')::integer part_index,
         entry->>'childClientItemId' child_id from jsonb_array_elements(v_expected->'coverage') entry
     ), children as materialized (
       select child->>'kind' kind,(child->>'index')::integer part_index,item->>'clientItemId' child_id
         from jsonb_array_elements(v_expected->'parts') child cross join lateral jsonb_array_elements(child->'items') item
     ) select
       exists(select 1 from coverage left join roots using(root_id) where roots.root_id is null)
       or exists(select 1 from children left join coverage on coverage.kind='child' and coverage.part_index=children.part_index and coverage.child_id=children.child_id
         group by children.part_index,children.child_id having count(coverage.root_id)<>1)
       or exists(select 1 from coverage left join children on children.part_index=coverage.part_index and children.child_id=coverage.child_id
         where coverage.kind='child' and (children.child_id is null or (children.kind is distinct from 'ordinary' and children.child_id<>coverage.root_id)))) then
     return jsonb_build_object('ok',false,'code','validation_failed');end if;
   -- Verify each complete immutable proof once, then hash-join its selected
   -- membership. A per-row full-ACK call would multiply 60000-row originals.
   for v_proof in select distinct (entry->>'verifiedContributorId')::uuid id from jsonb_array_elements(v_expected->'coverage') entry where entry->>'kind'='accepted_contributor' loop
     select * into v_upload from app_private.pos_catalog_import_recovery_uploads where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_proof.id and verified_at is not null;
     if not found then return v_binding||jsonb_build_object('status','conflict','reason','contributor_unavailable');end if;
     v_result:=public.pos_catalog_import_receipt_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id,v_upload.client_import_id,v_upload.idempotency_key,v_upload.canonical_hash);
     v_receipt:=v_result->'receipt';
     if v_result->>'ok' is distinct from 'true' or v_result->>'status' is distinct from 'accepted'
       or not app_private.pos_catalog_import_recovery_ack_valid_v1(v_upload.original_schema,v_upload.normalized_request,v_receipt) then
       return v_binding||jsonb_build_object('status','conflict','reason','contributor_unavailable');end if;
     v_hash:='sha256:'||encode(extensions.digest(v_receipt::text,'sha256'),'hex');
     if exists(with mappings as materialized(select mapping->>'clientItemId' child_id from jsonb_array_elements(v_receipt->'remoteProductIds') mapping)
       select 1 from jsonb_array_elements(v_expected->'coverage') entry left join mappings on mappings.child_id=entry->>'contributorClientItemId'
       where entry->>'kind'='accepted_contributor' and (entry->>'verifiedContributorId')::uuid=v_proof.id and
         (entry->>'contributorReceiptSha256' is distinct from v_hash or mappings.child_id is null)) then
       return v_binding||jsonb_build_object('status','conflict','reason','contributor_unavailable');end if;
   end loop;
   for v_proof in select distinct (entry->>'contributorPlanId')::uuid id,(entry->>'contributorPartIndex')::integer part_index
     from jsonb_array_elements(v_expected->'coverage') entry where entry->>'kind'='accepted_plan_part' loop
     if v_predecessor_id is null then return jsonb_build_object('ok',false,'code','validation_failed');end if;
     select * into v_part from app_private.pos_catalog_import_recovery_plan_parts where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=v_proof.id and part_index=v_proof.part_index;
     if not found or not app_private.pos_catalog_import_recovery_ancestor_v1(p_shop_id,p_shop_device_id,v_predecessor_id,v_proof.id) then
       return v_binding||jsonb_build_object('status','conflict','reason','predecessor_scope_conflict');end if;
     if v_part.ack_response is null or not app_private.pos_catalog_import_recovery_ack_valid_v1(
       case v_part.child->>'kind' when 'ordinary' then 'pos-catalog-import-v1' else 'pos-catalog-import-correction-v1' end,v_part.child,v_part.ack_response) then
       return v_binding||jsonb_build_object('status','conflict','reason','predecessor_ack_not_carried');end if;
     v_hash:='sha256:'||encode(extensions.digest(v_part.ack_response::text,'sha256'),'hex');
     if exists(with children as materialized(select item->>'clientItemId' child_id,item from jsonb_array_elements(v_part.child->'items') item),
       responses as materialized(select response->>'clientItemId' child_id,response from jsonb_array_elements(v_part.ack_response->'items') response),
       mappings as materialized(select mapping->>'clientItemId' child_id,mapping from jsonb_array_elements(v_part.ack_response->'remoteProductIds') mapping),
       previous as materialized(select entry->>'clientItemId' root_id,entry->>'childClientItemId' child_id from app_private.pos_catalog_import_recovery_plans ancestor cross join lateral jsonb_array_elements(ancestor.coverage) entry
         where ancestor.shop_id=p_shop_id and ancestor.shop_device_id=p_shop_device_id and ancestor.plan_id=v_part.plan_id and entry->>'kind'='child' and (entry->>'partIndex')::integer=v_part.part_index)
       select 1 from jsonb_array_elements(v_expected->'coverage') entry
         left join children on children.child_id=entry->>'contributorClientItemId'
         left join responses on responses.child_id=children.child_id left join mappings on mappings.child_id=children.child_id
         left join previous on previous.child_id=children.child_id and previous.root_id=entry->>'clientItemId'
       where entry->>'kind'='accepted_plan_part' and (entry->>'contributorPlanId')::uuid=v_proof.id and (entry->>'contributorPartIndex')::integer=v_proof.part_index and
         (entry->>'contributorCanonicalPayloadHash' is distinct from v_part.child->>'payloadHash' or entry->>'contributorReceiptSha256' is distinct from v_hash
         or children.child_id is null or responses.child_id is null or previous.child_id is null or responses.response->>'status' is distinct from entry->>'contributorItemStatus'
         or case when v_part.child->>'kind'='correction' or children.item->>'changeKind' in('new','updated') then
           mappings.mapping is null or mappings.mapping->>'remoteProductId' is distinct from entry->>'contributorRemoteProductId'
         else entry->'contributorRemoteProductId' is distinct from 'null'::jsonb end)) then
       return v_binding||jsonb_build_object('status','conflict','reason','predecessor_ack_not_carried');end if;
   end loop;
   if exists(select 1 from jsonb_array_elements(v_expected->'coverage') entry where entry->>'kind' not in('child','original_accepted','accepted_contributor','accepted_plan_part')
     or(entry->>'kind'='original_accepted' and v_expected->>'mode'<>'correction')) then return jsonb_build_object('ok',false,'code','validation_failed');end if;
   v_count:=0;
   for v_child in select value from jsonb_array_elements(v_expected->'parts') loop
     if (v_child->>'index')::integer<>v_count or jsonb_typeof(v_child->'items') is distinct from 'array'
       or jsonb_array_length(v_child->'items') not between 1 and 1000 or pg_column_size(v_child->'items')>2097152 then
       return jsonb_build_object('ok',false,'code','validation_failed');end if;v_count:=v_count+1;
   end loop;
   perform pg_advisory_xact_lock(hashtext('pos-import-plan:'||p_shop_id::text||':'||p_shop_device_id::text),hashtext(v_id::text));
   v_auth:=app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
   if v_auth<>'ok' then return jsonb_build_object('ok',false,'code',v_auth);end if;
   insert into app_private.pos_catalog_import_recovery_plans(shop_id,shop_device_id,plan_id,original_id,original_client_import_id,original_idempotency_key,original_canonical_hash,predecessor_plan_id,plan_hash,mode,coverage,item_count,part_count)
     values(p_shop_id,p_shop_device_id,v_id,v_original_id,v_original.client_import_id,v_original.idempotency_key,v_original.canonical_hash,v_predecessor_id,v_expected->>'planCanonicalHash',v_expected->>'mode',v_expected->'coverage',
       (v_expected->>'itemCount')::integer,jsonb_array_length(v_expected->'parts')) on conflict do nothing;
   select * into v_plan from app_private.pos_catalog_import_recovery_plans where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=v_id for update;
   v_auth:=app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
   if v_auth<>'ok' then return jsonb_build_object('ok',false,'code',v_auth);end if;
   if v_plan.plan_hash is distinct from v_expected->>'planCanonicalHash' or v_plan.coverage is distinct from v_expected->'coverage' then
     return v_binding||jsonb_build_object('status','conflict','reason','plan_conflict');end if;
   v_count:=0;
   for v_child in select value from jsonb_array_elements(v_expected->'parts') loop
     insert into app_private.pos_catalog_import_recovery_plan_parts(shop_id,shop_device_id,plan_id,part_index,child)
       values(p_shop_id,p_shop_device_id,v_id,v_count,v_child) on conflict do nothing;v_count:=v_count+1;
   end loop;
   return v_binding||jsonb_build_object('status','planned','planId',v_id,'verifiedOriginalId',v_original_id,'planCanonicalHash',v_plan.plan_hash,
     'parentStatus',case when v_plan.part_count=(select count(*) from app_private.pos_catalog_import_recovery_plan_parts where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=v_id and ack_response is not null) then 'complete' else 'partial' end,
     'partCount',v_plan.part_count,'itemCount',v_plan.item_count,'parts',(select coalesce(jsonb_agg((child-'items'-'summary'-'normalized')||jsonb_build_object('itemCount',jsonb_array_length(child->'items')) order by part_index),'[]'::jsonb)
       from app_private.pos_catalog_import_recovery_plan_parts where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=v_id));
 end if;

 if p_action='apply' or (p_action='receipt-page' and p_payload?'planId') then
   v_id:=(p_payload->>'planId')::uuid;v_index:=(p_payload->>'partIndex')::integer;
   select * into v_plan from app_private.pos_catalog_import_recovery_plans where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=v_id;
   if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
   perform pg_advisory_xact_lock(hashtext('pos-import-recovery-root:'||p_shop_id::text||':'||p_shop_device_id::text),
     hashtext(v_plan.original_client_import_id||':'||v_plan.original_idempotency_key||':'||v_plan.original_canonical_hash));
   perform pg_advisory_xact_lock(hashtext('pos-import-plan:'||p_shop_id::text||':'||p_shop_device_id::text),hashtext(v_id::text));
   select * into v_plan from app_private.pos_catalog_import_recovery_plans where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=v_id for update;
   v_auth:=app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
   if v_auth<>'ok' then return jsonb_build_object('ok',false,'code',v_auth);end if;
   if not found or v_plan.plan_id is null then return jsonb_build_object('ok',false,'code','not_found');end if;
   select * into v_part from app_private.pos_catalog_import_recovery_plan_parts where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=v_id and part_index=v_index;
   if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
   v_child:=v_part.child;
   if p_action='apply' and v_part.ack_response is null then
     begin
     select * into v_original from app_private.pos_catalog_import_recovery_uploads where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_plan.original_id;
     if v_plan.mode='replacement' then
       if not exists(select 1 from app_private.pos_catalog_import_retirements where shop_id=p_shop_id and shop_device_id=p_shop_device_id
         and client_import_id=v_original.client_import_id and idempotency_key=v_original.idempotency_key and payload_hash=v_original.canonical_hash) then
         return v_binding||jsonb_build_object('status','conflict','reason','original_not_retired');end if;
       v_result:=public.pos_catalog_import_apply_v2(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id,
         v_child->>'clientImportId',v_child->>'idempotencyKey',v_child->>'payloadHash','pos-catalog-import-v1','supplier_excel',
         (v_child->>'createdAt')::timestamptz,v_child->'items',v_child->'summary','{}'::jsonb);
     else
       v_result:=public.pos_catalog_import_correct_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id,
         v_original.client_import_id,v_original.idempotency_key,v_original.canonical_hash,
         v_child->>'clientImportId',v_child->>'idempotencyKey',v_child->>'payloadHash',(v_child->>'createdAt')::timestamptz,v_child->'items');
     end if;
     if v_result->>'ok' is distinct from 'true' then raise exception 'Multipart apply rolled back' using errcode='P0941';end if;
     if v_result->>'status'='conflict' then v_result:=v_result||jsonb_build_object('planId',v_id,'partIndex',v_index,'parentStatus','partial');
       raise exception 'Multipart apply rolled back' using errcode='P0941';end if;
     -- Read the persisted ACK, not the altered duplicate summary returned by
     -- historical apply_v2. This same read verifies the complete identity tuple.
     v_result:=public.pos_catalog_import_receipt_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id,
       v_child->>'clientImportId',v_child->>'idempotencyKey',v_child->>'payloadHash');
     if v_result->>'ok' is distinct from 'true' then raise exception 'Multipart late auth rolled back' using errcode='P0941';end if;
     if v_result->>'status' is distinct from 'accepted' or not app_private.pos_catalog_import_recovery_ack_valid_v1(
       case v_child->>'kind' when 'ordinary' then 'pos-catalog-import-v1' else 'pos-catalog-import-correction-v1' end,v_child,v_result->'receipt') then
       raise exception 'Multipart ACK unavailable after apply' using errcode='23514';end if;
     v_receipt:=v_result->'receipt';
     update app_private.pos_catalog_import_recovery_plan_parts set ack_response=v_receipt,
       receipt_hash='sha256:'||encode(extensions.digest(v_receipt::text,'sha256'),'hex')
       where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=v_id and part_index=v_index;
     exception when sqlstate 'P0941' then return v_result;end;
   else v_receipt:=v_part.ack_response;end if;
   if v_receipt is null then return v_binding||jsonb_build_object('status','conflict','reason','part_not_accepted');end if;
   if not app_private.pos_catalog_import_recovery_ack_valid_v1(
     case v_child->>'kind' when 'ordinary' then 'pos-catalog-import-v1' else 'pos-catalog-import-correction-v1' end,v_child,v_receipt) then
     return v_binding||jsonb_build_object('status','conflict','reason','receipt_unavailable');end if;
   select count(*)=v_plan.part_count into v_complete from app_private.pos_catalog_import_recovery_plan_parts
     where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=v_id and ack_response is not null;
   v_result:=v_binding||jsonb_build_object('status','accepted','planId',v_id,'partIndex',v_index,
     'clientImportId',v_child->>'clientImportId','idempotencyKey',v_child->>'idempotencyKey','payloadHash',v_child->>'declaredPayloadHash',
     'canonicalPayloadHash',v_child->>'payloadHash','parentStatus',case when v_complete then 'complete' else 'partial' end,
     'partCount',v_plan.part_count,'acceptedPartCount',(select count(*) from app_private.pos_catalog_import_recovery_plan_parts
       where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=v_id and ack_response is not null));
 end if;

 if v_receipt is not null then
   v_hash:='sha256:'||encode(extensions.digest(v_receipt::text,'sha256'),'hex');v_total:=jsonb_array_length(v_receipt->'items');
   if p_action='receipt-page' then
     v_offset:=(p_payload->>'offset')::integer;v_limit:=(p_payload->>'limit')::integer;
     if p_payload->>'receiptSha256' is distinct from v_hash or v_offset<0 or v_offset>=v_total or v_limit not between 1 and 1000 then
       return v_binding||jsonb_build_object('status','conflict','reason','receipt_cursor_conflict');end if;
   else v_offset:=0;v_limit:=least(1000,v_total);end if;
   v_expected:=(select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) from jsonb_array_elements(v_receipt->'items') with ordinality
     where ordinality>v_offset and ordinality<=v_offset+v_limit);
   return (v_result-'receipt'-'currentProductSnapshots')||jsonb_build_object('receiptSha256',v_hash,'receiptEncoding','postgres-jsonb-text-v1',
     'totalItemCount',v_total,'offset',v_offset,'limit',v_limit,'complete',v_offset+v_limit>=v_total,
     'receipt',(v_receipt-'items'-'remoteProductIds'-'remotePriceIds')||jsonb_build_object('items',v_expected,
       'remoteProductIds',(select coalesce(jsonb_agg(mapping),'[]'::jsonb) from jsonb_array_elements(v_receipt->'remoteProductIds') mapping where exists(select 1 from jsonb_array_elements(v_expected) item where item->>'clientItemId'=mapping->>'clientItemId')),
       'remotePriceIds',(select coalesce(jsonb_agg(mapping),'[]'::jsonb) from jsonb_array_elements(v_receipt->'remotePriceIds') mapping where exists(select 1 from jsonb_array_elements(v_expected) item where item->>'clientItemId'=mapping->>'clientItemId'))),
     'currentProductSnapshots',(select coalesce(jsonb_agg(jsonb_build_object('clientItemId',item->>'clientItemId','remoteProductId',item->>'remoteProductId',
       'snapshotStatus',case when product.id is null then 'unavailable' else 'available' end,
       'baseRevision',case when product.id is null then null else to_char(product.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,
       'retailPrice',product.retail_price,'purchasePrice',product.purchase_price,'stockQuantity',product.stock_quantity)),'[]'::jsonb)
       from jsonb_array_elements(v_expected) item left join public.inventory_products product on product.id::text=item->>'remoteProductId'
         and product.deleted_at is null and(product.shop_id=p_shop_id or(product.shop_id is null and product.owner_user_id=p_owner_user_id))));
 end if;
 return jsonb_build_object('ok',false,'code','validation_failed');
exception when invalid_text_representation or numeric_value_out_of_range or null_value_not_allowed then
 return jsonb_build_object('ok',false,'code','validation_failed');
end;
$$;
-- Private staging is retained audit data, never exposed through table APIs.
create table app_private.pos_import_recovery_admissions (
 shop_id uuid not null,shop_device_id uuid not null,upload_id uuid not null,raw_bytes bigint not null check(raw_bytes between 1 and 536870912),
 terminal boolean not null default false,root_key text,plan_id uuid,primary key(shop_id,shop_device_id,upload_id)
);
create table app_private.pos_import_recovery_capacity (
 shop_id uuid not null,shop_device_id uuid not null,root_key text not null,credits integer not null check(credits between 0 and 2),
 staging_reserved boolean not null default false,staging_upload_id uuid,
 check(staging_upload_id is null or staging_reserved),primary key(shop_id,shop_device_id,root_key)
);
create table app_private.pos_import_recovery_registration (
 shop_id uuid not null,shop_device_id uuid not null,upload_id uuid not null,header jsonb not null,manifest_hash text not null,
 part_count integer not null check(part_count between 1 and 2048),next_offset integer not null default 0,
 canonical_prefix text not null,sealed boolean not null default false,primary key(shop_id,shop_device_id,upload_id)
);
create table app_private.pos_import_recovery_descriptors (
 shop_id uuid not null,shop_device_id uuid not null,upload_id uuid not null,part_index integer not null,
 descriptor jsonb not null,canonical_json text not null,primary key(shop_id,shop_device_id,upload_id,part_index),
 foreign key(shop_id,shop_device_id,upload_id) references app_private.pos_import_recovery_registration
);
create table app_private.pos_import_recovery_documents (
 shop_id uuid not null,shop_device_id uuid not null,upload_id uuid not null,mode text not null,raw_hash text not null,
 state text not null default 'prepared',phase text not null,cursor integer not null default 0,header jsonb not null,
 root_header jsonb,root_normalized jsonb,root_hash text,root_declared text,root_count integer not null default 0,
 child_count integer not null default 0,coverage_count integer not null default 0,
 canonical_prefix text,canonical_suffix text,normalized_header jsonb,plan_prefix text,result jsonb,
 primary key(shop_id,shop_device_id,upload_id)
);
create table app_private.pos_import_recovery_raw_rows (
 shop_id uuid not null,shop_device_id uuid not null,upload_id uuid not null,domain text not null,group_index integer not null default 0,
 ordinal integer not null,row_json jsonb not null,http_bytes integer,primary key(shop_id,shop_device_id,upload_id,domain,group_index,ordinal),
 foreign key(shop_id,shop_device_id,upload_id) references app_private.pos_import_recovery_documents
);
create table app_private.pos_import_recovery_normal_rows (
 shop_id uuid not null,shop_device_id uuid not null,upload_id uuid not null,domain text not null,group_index integer not null default 0,
 ordinal integer not null,row_json jsonb not null,canonical_json text not null,
 client_item_id text generated always as(row_json->>'clientItemId') stored,
 primary key(shop_id,shop_device_id,upload_id,domain,group_index,ordinal),
 foreign key(shop_id,shop_device_id,upload_id) references app_private.pos_import_recovery_documents
);
create index pos_import_normal_selected_ids on app_private.pos_import_recovery_normal_rows(shop_id,shop_device_id,upload_id,domain,group_index,client_item_id);
create table app_private.pos_import_recovery_child_headers (
 shop_id uuid not null,shop_device_id uuid not null,upload_id uuid not null,part_index integer not null,raw_header jsonb not null,
 item_count integer not null check(item_count between 1 and 1000),normalized_header jsonb,canonical_prefix text,canonical_suffix text,plan_template jsonb,child jsonb,canonical_json text,http_header_bytes integer,
 primary key(shop_id,shop_device_id,upload_id,part_index),foreign key(shop_id,shop_device_id,upload_id) references app_private.pos_import_recovery_documents
);
create table app_private.pos_import_recovery_page_acks (
 shop_id uuid not null,shop_device_id uuid not null,upload_id uuid not null,phase text not null,cursor integer not null,
 request_hash text not null,response jsonb not null,primary key(shop_id,shop_device_id,upload_id,phase,cursor)
);

-- Admission serialization precedes all root/plan/identity locks. Completed
-- uploads remain in the retained ledger; completion never frees audit bytes.
create function app_private.pos_import_recovery_quota_ok_v1(p_shop uuid,p_device uuid,p_bytes bigint,p_slots integer,p_open_bytes bigint,p_open_slots integer)
returns boolean language sql volatile set search_path=public,app_private,pg_temp as $$
 with usage as(select count(*) slots,coalesce(sum(raw_bytes),0) bytes,count(*) filter(where not terminal) open_slots,
   coalesce(sum(raw_bytes) filter(where not terminal),0) open_bytes from app_private.pos_import_recovery_admissions where shop_id=p_shop and shop_device_id=p_device),
 credits as(select coalesce(sum(credits+case when staging_reserved and staging_upload_id is null then 1 else 0 end),0) n
   from app_private.pos_import_recovery_capacity where shop_id=p_shop and shop_device_id=p_device)
 select usage.slots+credits.n+p_slots<=512 and usage.bytes+credits.n*536870912+p_bytes<=8589934592
   and usage.open_slots+credits.n+p_open_slots<=32 and usage.open_bytes+credits.n*536870912+p_open_bytes<=2147483648 from usage,credits;
$$;

-- Called only under quota -> current authorization -> authoritative root
-- locks. Root metadata is derived by the private wrappers, never client hints.
create function app_private.pos_import_recovery_reserve_v1(p_shop uuid,p_device uuid,p_root jsonb) returns boolean
language plpgsql volatile set search_path=public,app_private,pg_temp as $$
declare v_key text;v_credits integer;v_staging boolean;v_required integer;v_units integer;
begin
 v_key:=(p_root->>'clientImportId')||':'||(p_root->>'idempotencyKey')||':'||coalesce(p_root->>'canonicalPayloadHash',p_root->>'payloadHash');
 if v_key is null then return false;end if;
 select credits,staging_reserved into v_credits,v_staging from app_private.pos_import_recovery_capacity where shop_id=p_shop and shop_device_id=p_device and root_key=v_key;
 v_credits:=coalesce(v_credits,0);v_staging:=coalesce(v_staging,false);
 v_required:=case when exists(select 1 from app_private.pos_catalog_import_recovery_plans where shop_id=p_shop and shop_device_id=p_device
   and original_client_import_id=p_root->>'clientImportId' and original_idempotency_key=p_root->>'idempotencyKey'
   and original_canonical_hash=coalesce(p_root->>'canonicalPayloadHash',p_root->>'payloadHash')) then 1 else 2 end;
 v_units:=greatest(0,v_required-v_credits)+(not v_staging)::integer;
 if v_units>0 then
   if not app_private.pos_import_recovery_quota_ok_v1(p_shop,p_device,v_units::bigint*536870912,v_units,v_units::bigint*536870912,v_units) then return false;end if;
   insert into app_private.pos_import_recovery_capacity(shop_id,shop_device_id,root_key,credits,staging_reserved)
     values(p_shop,p_device,v_key,v_required,true) on conflict(shop_id,shop_device_id,root_key)
     do update set credits=greatest(app_private.pos_import_recovery_capacity.credits,excluded.credits),staging_reserved=true;
 end if;return true;
end;$$;

create function app_private.pos_import_recovery_json_precision_v1(p_value jsonb) returns boolean
language plpgsql immutable set search_path=public,app_private,pg_temp as $$
declare v_child jsonb;v_number numeric;
begin
 if jsonb_typeof(p_value)='number' then v_number:=(p_value#>>'{}')::numeric;
   return abs(v_number)>1.7976931348623157e308 or (v_number=trunc(v_number) and abs(v_number)>9007199254740991);
 elsif jsonb_typeof(p_value)='string' then return (p_value#>>'{}') ~ '^-?[0-9]{65,}$';
 elsif jsonb_typeof(p_value)='array' then for v_child in select value from jsonb_array_elements(p_value) loop
   if app_private.pos_import_recovery_json_precision_v1(v_child) then return true;end if;end loop;
 elsif jsonb_typeof(p_value)='object' then for v_child in select value from jsonb_each(p_value) loop
   if app_private.pos_import_recovery_json_precision_v1(v_child) then return true;end if;end loop;
 end if;return false;
end;$$;

create function app_private.pos_import_recovery_template_v1(p_template jsonb,p_items text,p_hash text) returns text
language sql immutable set search_path=public,app_private,pg_temp as $$
 select string_agg(case when jsonb_typeof(piece)='string' then piece#>>'{}' when piece->>'slot'='items' then p_items
   when piece->>'slot'='hash' then to_json(p_hash)::text else null end,'' order by ordinal)
 from jsonb_array_elements(p_template) with ordinality as element(piece,ordinal);
$$;

-- The existing server role is the only caller. All raw/canonical projections
-- below are internal and the route never reflects them to the public caller.
create function app_private.pos_import_recovery_phased_v1(
 p_shop_id uuid,p_shop_device_id uuid,p_staff_id uuid,p_pos_session_id uuid,p_owner_user_id uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path=public,app_private,extensions,pg_temp as $$
declare
 v_claim integer:=0;v_auth text;v_id uuid:=(p_payload->>'uploadId')::uuid;v_reg app_private.pos_import_recovery_registration%rowtype;
 v_upload app_private.pos_catalog_import_recovery_uploads%rowtype;v_doc app_private.pos_import_recovery_documents%rowtype;
 v_original app_private.pos_catalog_import_recovery_uploads%rowtype;v_child app_private.pos_import_recovery_child_headers%rowtype;
 v_binding jsonb:=jsonb_build_object('ok',true,'shopId',p_shop_id,'shopDeviceId',p_shop_device_id);
 v_phase text:=p_payload->>'phase';v_index integer;v_offset integer;v_count integer;v_total integer;v_limit integer;v_group integer;
 v_bytes bytea;v_all bytea;v_hash text;v_text text;v_prefix text;v_suffix text;v_json jsonb;v_request jsonb;v_root jsonb;v_header jsonb;
 v_items jsonb;v_selected jsonb;v_children jsonb;v_normal jsonb;v_ack jsonb;v_expected jsonb;v_fragment text;v_items_text text;
 v_entry jsonb;v_row record;v_cursor integer;v_next integer;v_kind text;v_root_key text;v_reserved integer;v_result jsonb;
begin
 if p_action not in('manifest','seal','bytes','prepare-original','prepare-plan','read-normalize-page','store-normalize-page','complete-original','complete-plan','read-selected-original','fail-normalization')
   or jsonb_typeof(p_payload) is distinct from 'object' then return jsonb_build_object('ok',false,'code','validation_failed');end if;
 if p_action in('manifest','complete-original','complete-plan','fail-normalization') then
   perform pg_advisory_xact_lock(hashtext('pos-import-recovery-quota'),hashtext(p_shop_id::text||':'||p_shop_device_id::text));end if;
 v_auth:=app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
 if v_auth<>'ok' then return jsonb_build_object('ok',false,'code',v_auth);end if;
 if p_action='read-selected-original' then
   select * into v_original from app_private.pos_catalog_import_recovery_uploads where shop_id=p_shop_id and shop_device_id=p_shop_device_id
     and upload_id=(p_payload->>'verifiedOriginalId')::uuid and verified_at is not null;
   if not found or jsonb_typeof(p_payload->'clientItemIds') is distinct from 'array' or jsonb_array_length(p_payload->'clientItemIds') not between 1 and 1000
     then return jsonb_build_object('ok',false,'code','validation_failed');end if;
   select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb) into v_items from jsonb_array_elements(v_original.normalized_request->'items') with ordinality source(item,ordinal)
     where p_payload->'clientItemIds' ? (item->>'clientItemId');
   v_result:=v_binding||jsonb_build_object('status','verified','verifiedOriginalId',v_original.upload_id,'originalSchemaVersion',v_original.original_schema,
     'normalizedRequest',(v_original.normalized_request-'items'-'rawItems')||jsonb_build_object('items',v_items));
   if octet_length(v_result::text)>262144 then return jsonb_build_object('ok',false,'code','projection_too_large');end if;return v_result;
 end if;
 perform pg_advisory_xact_lock(hashtext('pos-import-upload:'||p_shop_id::text||':'||p_shop_device_id::text),hashtext(v_id::text));
 v_auth:=app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
 if v_auth<>'ok' then return jsonb_build_object('ok',false,'code',v_auth);end if;
 if p_action='manifest' then
   select * into v_reg from app_private.pos_import_recovery_registration where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id for update;
   if not found then
     if (p_payload->>'offset')::integer<>0 then return v_binding||jsonb_build_object('status','conflict','reason','manifest_cursor_conflict');end if;
     v_header:=p_payload->'header';v_total:=(v_header->>'totalByteLength')::integer;
     if v_total not between 1 and 536870912 or (p_payload->>'partCount')::integer not between 1 and 2048
       or coalesce(p_payload->>'manifestSha256','')!~'^sha256:[0-9a-f]{64}$' or coalesce(v_header->>'rawSha256','')!~'^sha256:[0-9a-f]{64}$'
       or v_header->>'mode' not in('original','plan') or length(p_payload->>'canonicalPrefix')>16384 then return jsonb_build_object('ok',false,'code','validation_failed');end if;
     if v_header->>'mode'='plan' then
       select * into v_original from app_private.pos_catalog_import_recovery_uploads where shop_id=p_shop_id and shop_device_id=p_shop_device_id
         and upload_id=(v_header->>'verifiedOriginalId')::uuid and verified_at is not null and original_schema='pos-catalog-import-v1';
       if not found then return jsonb_build_object('ok',false,'code','validation_failed');end if;
       v_root_key:=v_original.client_import_id||':'||v_original.idempotency_key||':'||v_original.canonical_hash;
     end if;
     -- A manifest can claim only the separate staging allowance. The two
     -- future validated-plan credits remain protected until complete proof.
     if v_root_key is not null then select (staging_reserved and staging_upload_id is null)::integer into v_claim
       from app_private.pos_import_recovery_capacity where shop_id=p_shop_id and shop_device_id=p_shop_device_id and root_key=v_root_key;
       v_claim:=coalesce(v_claim,0);end if;
     if not app_private.pos_import_recovery_quota_ok_v1(p_shop_id,p_shop_device_id,v_total-v_claim::bigint*536870912,1-v_claim,v_total-v_claim::bigint*536870912,1-v_claim) then return jsonb_build_object('ok',false,'code','quota_exceeded');end if;
     insert into app_private.pos_import_recovery_admissions(shop_id,shop_device_id,upload_id,raw_bytes,terminal,root_key) values(p_shop_id,p_shop_device_id,v_id,v_total,false,v_root_key);
     if v_claim=1 then update app_private.pos_import_recovery_capacity set staging_upload_id=v_id
       where shop_id=p_shop_id and shop_device_id=p_shop_device_id and root_key=v_root_key;end if;
     insert into app_private.pos_import_recovery_registration(shop_id,shop_device_id,upload_id,header,manifest_hash,part_count,canonical_prefix)
       values(p_shop_id,p_shop_device_id,v_id,v_header,p_payload->>'manifestSha256',(p_payload->>'partCount')::integer,p_payload->>'canonicalPrefix');
     select * into v_reg from app_private.pos_import_recovery_registration where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
   end if;
   if v_reg.header is distinct from p_payload->'header' or v_reg.manifest_hash is distinct from p_payload->>'manifestSha256'
     or v_reg.part_count is distinct from (p_payload->>'partCount')::integer or v_reg.canonical_prefix is distinct from p_payload->>'canonicalPrefix'
     or jsonb_typeof(p_payload->'parts') is distinct from 'array' or jsonb_array_length(p_payload->'parts') not between 1 and 256
     then return v_binding||jsonb_build_object('status','conflict','reason','upload_manifest_conflict');end if;
   v_offset:=(p_payload->>'offset')::integer;v_count:=jsonb_array_length(p_payload->'parts');
   if v_offset<v_reg.next_offset then
     select jsonb_agg(descriptor order by part_index) into v_expected from app_private.pos_import_recovery_descriptors where shop_id=p_shop_id and shop_device_id=p_shop_device_id
       and upload_id=v_id and part_index>=v_offset and part_index<v_offset+v_count;
     if v_expected is distinct from p_payload->'parts' then return v_binding||jsonb_build_object('status','conflict','reason','manifest_cursor_conflict');end if;
   elsif v_offset<>v_reg.next_offset or v_offset+v_count>v_reg.part_count or v_reg.sealed then
     return v_binding||jsonb_build_object('status','conflict','reason','manifest_cursor_conflict');
   else
     for v_row in select descriptor,ordinal from jsonb_array_elements(p_payload->'parts') with ordinality source(descriptor,ordinal) loop
       v_entry:=v_row.descriptor;v_index:=v_offset+v_row.ordinal-1;
       if (v_entry->>'index')::integer<>v_index or (v_entry->>'byteLength')::integer not between 1 and 262144
         or coalesce(v_entry->>'sha256','')!~'^sha256:[0-9a-f]{64}$' then raise exception 'invalid descriptor' using errcode='22023';end if;
       -- Descriptor values are integer/ASCII hash; exact JS field order is fixed.
       v_text:='{"index":'||v_index||',"byteLength":'||(v_entry->>'byteLength')::integer||',"sha256":'||to_json(v_entry->>'sha256')::text||'}';
       insert into app_private.pos_import_recovery_descriptors values(p_shop_id,p_shop_device_id,v_id,v_index,v_entry,v_text);
     end loop;
     update app_private.pos_import_recovery_registration set next_offset=v_offset+v_count where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
   end if;
   return v_binding||jsonb_build_object('status','registering','uploadId',v_id,'manifestSha256',v_reg.manifest_hash,'nextOffset',v_offset+v_count,'partCount',v_reg.part_count,'complete',v_offset+v_count=v_reg.part_count);
 end if;
 select * into v_reg from app_private.pos_import_recovery_registration where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id for update;
 if p_action in('seal','bytes') then
   if not found or v_reg.manifest_hash is distinct from p_payload->>'manifestSha256' then return jsonb_build_object('ok',false,'code','validation_failed');end if;
   if p_action='seal' then
     select count(*),sum((descriptor->>'byteLength')::integer),string_agg(canonical_json,',' order by part_index),jsonb_agg(descriptor order by part_index)
       into v_count,v_total,v_text,v_items from app_private.pos_import_recovery_descriptors where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
     if v_count<>v_reg.part_count or v_total<>(v_reg.header->>'totalByteLength')::integer or
       'sha256:'||encode(extensions.digest(convert_to(v_reg.canonical_prefix||v_text||']}','UTF8'),'sha256'),'hex')<>v_reg.manifest_hash
       then return v_binding||jsonb_build_object('status','conflict','reason','manifest_incomplete');end if;
     insert into app_private.pos_catalog_import_recovery_uploads(shop_id,shop_device_id,upload_id,mode,manifest,manifest_hash,raw_hash,total_bytes)
       values(p_shop_id,p_shop_device_id,v_id,v_reg.header->>'mode',v_reg.header||jsonb_build_object('parts',v_items),v_reg.manifest_hash,v_reg.header->>'rawSha256',v_total) on conflict do nothing;
     update app_private.pos_import_recovery_registration set sealed=true where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
     return v_binding||jsonb_build_object('status','registered','uploadId',v_id,'manifestSha256',v_reg.manifest_hash,'partCount',v_reg.part_count,'totalByteLength',v_total,'rawSha256',v_reg.header->>'rawSha256');
   end if;
   if not v_reg.sealed then return v_binding||jsonb_build_object('status','conflict','reason','manifest_not_sealed');end if;
   v_index:=(p_payload->>'partIndex')::integer;v_bytes:=decode(p_payload->>'contentBase64','base64');
   select descriptor into v_expected from app_private.pos_import_recovery_descriptors where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and part_index=v_index;
   if not found or octet_length(v_bytes)<>(v_expected->>'byteLength')::integer or p_payload->>'sha256' is distinct from v_expected->>'sha256'
     or 'sha256:'||encode(extensions.digest(v_bytes,'sha256'),'hex')<>v_expected->>'sha256' then return jsonb_build_object('ok',false,'code','validation_failed');end if;
   select raw_bytes into v_all from app_private.pos_catalog_import_recovery_upload_parts where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and part_index=v_index;
   if found and v_all<>v_bytes then return v_binding||jsonb_build_object('status','conflict','reason','upload_part_conflict');end if;
   insert into app_private.pos_catalog_import_recovery_upload_parts values(p_shop_id,p_shop_device_id,v_id,v_index,v_bytes) on conflict do nothing;
   return v_binding||jsonb_build_object('status','uploaded','uploadId',v_id,'partIndex',v_index,'manifestSha256',v_reg.manifest_hash);
 end if;
 select * into v_upload from app_private.pos_catalog_import_recovery_uploads where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id for update;
 if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 select * into v_doc from app_private.pos_import_recovery_documents where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id for update;
 if p_action in('prepare-original','prepare-plan') then
   if not found then
     select count(*),string_agg(raw_bytes,''::bytea order by part_index) into v_count,v_all from app_private.pos_catalog_import_recovery_upload_parts
       where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
     if v_count<>jsonb_array_length(v_upload.manifest->'parts') or octet_length(v_all)<>v_upload.total_bytes or
       'sha256:'||encode(extensions.digest(v_all,'sha256'),'hex')<>v_upload.raw_hash then return v_binding||jsonb_build_object('status','conflict','reason','upload_incomplete');end if;
     -- UTF8 decoder view strips one leading BOM; forensic bytes/hash never change.
     v_text:=convert_from(v_all,'UTF8');if left(v_text,1)=chr(65279) then v_text:=substr(v_text,2);end if;
     begin v_json:=v_text::jsonb;exception when invalid_text_representation or untranslatable_character then
       return jsonb_build_object('ok',false,'code','original_bytes_or_unicode_unsupported');end;
     if jsonb_typeof(v_json) is distinct from 'object' then return jsonb_build_object('ok',false,'code','validation_failed');end if;
     if p_action='prepare-original' then
       if v_upload.mode<>'original' then return jsonb_build_object('ok',false,'code','validation_failed');end if;
       v_request:=case when v_json?'request' and jsonb_typeof(v_json->'request')='object' and (v_json-'request'-'originalReceipt')='{}'::jsonb then v_json->'request' else v_json end;
       if v_upload.manifest->>'originalKind'='ordinary' then
         if v_request is distinct from v_json or v_request->>'schemaVersion'<>'pos-catalog-import-v1' or app_private.pos_import_recovery_json_precision_v1(v_request)
           then return jsonb_build_object('ok',false,'code','original_bytes_or_numeric_precision_unsupported');end if;
         v_root:=v_request;v_header:=v_request-'items';v_kind:='items';v_count:=jsonb_array_length(v_request->'items');
       else
         if v_request->>'schemaVersion'<>'pos-catalog-import-correction-v1' or jsonb_typeof(v_request->'correction'->'items') is distinct from 'array'
           or jsonb_array_length(v_request->'correction'->'items') not between 1 and 1000 then return jsonb_build_object('ok',false,'code','validation_failed');end if;
         v_header:=jsonb_set(v_request,'{correction}',(v_request->'correction')-'items');
         if v_request->'recoveryOf'?'verifiedOriginalId' then
           select * into v_original from app_private.pos_catalog_import_recovery_uploads where shop_id=p_shop_id and shop_device_id=p_shop_device_id
             and upload_id=(v_request->'recoveryOf'->>'verifiedOriginalId')::uuid and verified_at is not null and original_schema='pos-catalog-import-v1';
           if not found then return jsonb_build_object('ok',false,'code','validation_failed');end if;
           v_root:=v_original.normalized_request;v_kind:='correction';v_count:=v_original.item_count;
         else
           v_root:=v_request->'recoveryOf'->'originalRequest';v_count:=jsonb_array_length(v_root->'items');v_kind:='items';
           if app_private.pos_import_recovery_json_precision_v1(v_root) then return jsonb_build_object('ok',false,'code','original_bytes_or_numeric_precision_unsupported');end if;
           v_header:=jsonb_set(v_header,'{recoveryOf}',(v_header->'recoveryOf')-'originalRequest');
         end if;
       end if;
       if jsonb_typeof(v_root->'items') is distinct from 'array' or v_count not between 1 and 60000 or octet_length((v_root-'items'-'rawItems')::text)>16384
         or octet_length(v_header::text)>16384 then return jsonb_build_object('ok',false,'code','validation_failed');end if;
       insert into app_private.pos_import_recovery_documents(shop_id,shop_device_id,upload_id,mode,raw_hash,phase,cursor,header,root_header,root_normalized,root_hash,root_declared,root_count)
         values(p_shop_id,p_shop_device_id,v_id,'original',v_upload.raw_hash,v_kind,case when v_kind='correction' then 1000000 else 0 end,v_header,v_root-'items'-'rawItems',
           case when v_kind='correction' then v_root-'items'-'rawItems' end,case when v_kind='correction' then v_root->>'payloadHash' end,
           case when v_upload.manifest->>'originalKind'='ordinary' then v_upload.manifest->>'declaredPayloadHash' else v_request->'recoveryOf'->>'payloadHash' end,v_count);
       if v_kind='items' then insert into app_private.pos_import_recovery_raw_rows(shop_id,shop_device_id,upload_id,domain,group_index,ordinal,row_json) select p_shop_id,p_shop_device_id,v_id,'root',0,ordinal-1,item
         from jsonb_array_elements(v_root->'items') with ordinality source(item,ordinal);
       else insert into app_private.pos_import_recovery_normal_rows select p_shop_id,p_shop_device_id,v_id,'root',0,ordinal-1,item,item::text
         from jsonb_array_elements(v_original.normalized_request->'items') with ordinality source(item,ordinal);end if;
       if v_upload.manifest->>'originalKind'='correction' then
         insert into app_private.pos_import_recovery_raw_rows(shop_id,shop_device_id,upload_id,domain,group_index,ordinal,row_json) select p_shop_id,p_shop_device_id,v_id,'correction',0,ordinal-1,item
           from jsonb_array_elements(v_request->'correction'->'items') with ordinality source(item,ordinal);end if;
     else
       if v_upload.mode<>'plan' or v_json->>'schemaVersion'<>'pos-catalog-import-recovery-plan-v1' or
         v_json->>'verifiedOriginalId' is distinct from v_upload.manifest->>'verifiedOriginalId' and v_upload.manifest?'verifiedOriginalId'
         or jsonb_typeof(v_json->'parts') is distinct from 'array' or jsonb_array_length(v_json->'parts')>1024
         or jsonb_typeof(v_json->'coverage') is distinct from 'array' or jsonb_array_length(v_json->'coverage')>60000
         or v_json->>'mode' not in('replacement','correction') then return jsonb_build_object('ok',false,'code','validation_failed');end if;
       select * into v_original from app_private.pos_catalog_import_recovery_uploads where shop_id=p_shop_id and shop_device_id=p_shop_device_id
         and upload_id=(v_json->>'verifiedOriginalId')::uuid and verified_at is not null and original_schema='pos-catalog-import-v1';
       if not found then return jsonb_build_object('ok',false,'code','validation_failed');end if;
       v_header:=v_json-'parts'-'coverage';
       if jsonb_typeof(v_header->'supersedes'->'retiredChildren')='array' then
         v_header:=jsonb_set(v_header,'{supersedes,retiredChildren}','[]'::jsonb);
       elsif v_header?'supersedes' then return jsonb_build_object('ok',false,'code','validation_failed');end if;
       if octet_length(v_header::text)>16384 or (v_header-'schemaVersion'-'planId'-'verifiedOriginalId'-'mode'-'supersedes')<>'{}'::jsonb then
         return jsonb_build_object('ok',false,'code','validation_failed');end if;
       insert into app_private.pos_import_recovery_documents(shop_id,shop_device_id,upload_id,mode,raw_hash,phase,header,root_header,root_normalized,root_hash,root_count,child_count,coverage_count)
         values(p_shop_id,p_shop_device_id,v_id,'plan',v_upload.raw_hash,case when jsonb_array_length(v_json->'parts')=0 then 'coverage' else 'children' end,v_header,
           v_original.normalized_request-'items'-'rawItems',v_original.normalized_request-'items'-'rawItems',v_original.canonical_hash,v_original.item_count,
           jsonb_array_length(v_json->'parts'),jsonb_array_length(v_json->'coverage'));
       insert into app_private.pos_import_recovery_raw_rows(shop_id,shop_device_id,upload_id,domain,group_index,ordinal,row_json) select p_shop_id,p_shop_device_id,v_id,'coverage',0,ordinal-1,item from jsonb_array_elements(v_json->'coverage') with ordinality source(item,ordinal);
       insert into app_private.pos_import_recovery_normal_rows select p_shop_id,p_shop_device_id,v_id,'root',0,ordinal-1,item,item::text from jsonb_array_elements(v_original.normalized_request->'items') with ordinality source(item,ordinal);
       if v_json?'supersedes' then insert into app_private.pos_import_recovery_raw_rows(shop_id,shop_device_id,upload_id,domain,group_index,ordinal,row_json) select p_shop_id,p_shop_device_id,v_id,'retired',0,ordinal-1,item
         from jsonb_array_elements(v_json->'supersedes'->'retiredChildren') with ordinality source(item,ordinal);end if;
       for v_row in select item,ordinal from jsonb_array_elements(v_json->'parts') with ordinality source(item,ordinal) loop
         v_entry:=v_row.item;v_index:=v_row.ordinal-1;v_request:=v_entry->'request';
         if (v_entry-'index'-'request')<>'{}'::jsonb or (v_entry->>'index')::integer<>v_index or jsonb_typeof(v_request) is distinct from 'object' or octet_length(v_request::text)>2097152
           then raise exception 'invalid child' using errcode='22023';end if;
         v_items:=case when v_json->>'mode'='replacement' then v_request->'items' else v_request->'correction'->'items' end;
         if jsonb_typeof(v_items) is distinct from 'array' or jsonb_array_length(v_items) not between 1 and 1000 then raise exception 'invalid child items' using errcode='22023';end if;
         v_request:=case when v_json->>'mode'='replacement' then v_request-'items' else jsonb_set(v_request,'{correction}',(v_request->'correction')-'items') end;
         if octet_length(v_request::text)>16384 then raise exception 'invalid child header' using errcode='22023';end if;
         insert into app_private.pos_import_recovery_child_headers(shop_id,shop_device_id,upload_id,part_index,raw_header,item_count) values(p_shop_id,p_shop_device_id,v_id,v_index,v_request,jsonb_array_length(v_items));
         insert into app_private.pos_import_recovery_raw_rows(shop_id,shop_device_id,upload_id,domain,group_index,ordinal,row_json) select p_shop_id,p_shop_device_id,v_id,'child',v_index,ordinal-1,item from jsonb_array_elements(v_items) with ordinality source(item,ordinal);
       end loop;
       -- Whole raw root match precedes capacity-credit conversion. No credit is
       -- consumed merely because an untrusted manifest claimed a root UUID.
       v_root_key:=v_original.client_import_id||':'||v_original.idempotency_key||':'||v_original.canonical_hash;
       -- Capacity claim remains provisional until every official parser page
       -- and complete global plan proof succeeds.
     end if;
     select * into v_doc from app_private.pos_import_recovery_documents where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
   end if;
   if v_doc.result is not null then return v_doc.result;end if;
   -- A pre-fix prepared known-root correction could expose cursor0 without
   -- storing any correction page. Its ordinary retry derives the phase origin
   -- under this upload lock; no caller cursor override or raw rewrite occurs.
   if p_action='prepare-original' and v_doc.mode='original' and v_doc.phase='correction' and v_doc.cursor=0 and v_doc.state='prepared'
     and v_doc.header->'recoveryOf'?'verifiedOriginalId' and not exists(select 1 from app_private.pos_import_recovery_page_acks
       where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and phase='correction') then
     update app_private.pos_import_recovery_documents set cursor=1000000 where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
     v_doc.cursor:=1000000;
   end if;
   return v_binding||jsonb_build_object('status','normalizing','uploadId',v_id,'rawSha256',v_doc.raw_hash,
     case when v_doc.mode='original' then 'phase' else 'stage' end,v_doc.phase,'nextCursor',case when v_doc.phase='complete' then null else v_doc.cursor end,
     'totalItemCount',case when v_doc.phase='correction' then (select count(*) from app_private.pos_import_recovery_raw_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='correction') else v_doc.root_count end,
     'partCount',v_doc.child_count,'totalCoverageCount',v_doc.coverage_count);
 end if;
 if v_doc.upload_id is null or p_payload->>'rawSha256' is distinct from v_doc.raw_hash then return jsonb_build_object('ok',false,'code','validation_failed');end if;
 if p_action='fail-normalization' then
   if v_doc.result is not null then return v_doc.result;end if;
   update app_private.pos_import_recovery_documents set state='failed' where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
   -- Failed audit data is retained forever in the total budget. Closing its
   -- active slot never restores a future-plan credit. A staging allowance may
   -- be restored only when its additional retained debit fits under the lock.
   select root_key into v_root_key from app_private.pos_import_recovery_admissions where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
   update app_private.pos_import_recovery_admissions set terminal=true where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
   update app_private.pos_import_recovery_capacity set staging_reserved=false,staging_upload_id=null
     where shop_id=p_shop_id and shop_device_id=p_shop_device_id and root_key=v_root_key and staging_upload_id=v_id;
   if found and app_private.pos_import_recovery_quota_ok_v1(p_shop_id,p_shop_device_id,536870912,1,536870912,1) then
     update app_private.pos_import_recovery_capacity set staging_reserved=true where shop_id=p_shop_id and shop_device_id=p_shop_device_id and root_key=v_root_key;end if;
   return jsonb_build_object('ok',false,'code','validation_failed');
 end if;
 if v_doc.state='failed' then return jsonb_build_object('ok',false,'code','validation_failed');end if;
 if p_action='read-normalize-page' then
   v_cursor:=(p_payload->>'cursor')::integer;
   v_kind:=case when v_doc.mode='original' then case when v_cursor>=1000000 then 'correction' else 'items' end else p_payload->>'stage' end;
   select response into v_ack from app_private.pos_import_recovery_page_acks where shop_id=p_shop_id and shop_device_id=p_shop_device_id
     and upload_id=v_id and phase=v_kind and cursor=v_cursor;
   if found then return v_binding||jsonb_build_object('pageComplete',true,'response',v_ack);end if;
   if v_doc.phase is distinct from v_kind or v_doc.cursor<>v_cursor then return v_binding||jsonb_build_object('status','conflict','reason','normalize_cursor_conflict');end if;
   v_group:=case when v_kind='children' then v_cursor/1001 else 0 end;
   v_offset:=case when v_kind='children' then v_cursor%1001 when v_kind='correction' then v_cursor-1000000 else v_cursor end;
   v_kind:=case v_kind when 'items' then 'root' when 'children' then 'child' else v_kind end;
   v_limit:=1000;
   loop
     select coalesce(jsonb_agg(row_json order by ordinal),'[]'::jsonb) into v_items from
       (select row_json,ordinal from app_private.pos_import_recovery_raw_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id
         and upload_id=v_id and domain=v_kind and group_index=v_group and ordinal>=v_offset order by ordinal limit v_limit) page;
     v_count:=jsonb_array_length(v_items);if v_count=0 then return jsonb_build_object('ok',false,'code','validation_failed');end if;
     if v_kind='root' then
       v_result:=v_binding||jsonb_build_object('header',v_doc.root_header,'items',v_items,'offset',v_offset,'declaredPayloadHash',v_doc.root_declared);
     elsif v_kind in('child','correction') then
       if v_kind='child' then
         select * into v_child from app_private.pos_import_recovery_child_headers where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and part_index=v_group;
         v_header:=v_child.raw_header;
       else v_header:=v_doc.header;end if;
       if (v_kind='child' and v_doc.header->>'mode'='replacement') then
         select row_json into v_selected from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='root' order by ordinal limit 1;
         v_selected:=jsonb_build_array(v_selected);
       else
         select coalesce(jsonb_agg(root.row_json order by root.ordinal),'[]'::jsonb) into v_selected from app_private.pos_import_recovery_normal_rows root
           where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='root' and group_index=0
             and exists(select 1 from jsonb_array_elements(v_items) selected where selected->>'clientItemId'=root.client_item_id);
       end if;
       v_root:=v_doc.root_normalized||jsonb_build_object('items',v_selected);
       v_result:=v_binding||jsonb_build_object('header',v_header,'items',v_items,'offset',v_offset,'root',v_root,
         'partIndex',v_group,'verifiedOriginalId',coalesce(v_doc.header->>'verifiedOriginalId',v_doc.header->'recoveryOf'->>'verifiedOriginalId',v_id::text),'forensic',v_kind='correction','declaredPayloadHash',v_upload.manifest->>'declaredPayloadHash',
         'mode',case when v_kind='correction' then 'correction' else v_doc.header->>'mode' end);
     else
       select coalesce(jsonb_agg(root.row_json order by root.ordinal),'[]'::jsonb) into v_selected from app_private.pos_import_recovery_normal_rows root
         where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='root' and group_index=0
           and exists(select 1 from jsonb_array_elements(v_items) selected where selected->>'clientItemId'=root.client_item_id);
       v_root:=v_doc.root_normalized||jsonb_build_object('items',v_selected);
       -- Coverage needs only selected immutable child rows. Its projection must
       -- not repeat the complete ordinary child through normalized.items.
       select coalesce(jsonb_agg(((child.child-'items')#-'{normalized,items}')||jsonb_build_object('items',chosen.items) order by child.part_index),'[]'::jsonb) into v_children
         from app_private.pos_import_recovery_child_headers child cross join lateral (
           select jsonb_agg(n.row_json order by n.ordinal) items from app_private.pos_import_recovery_normal_rows n
           where n.shop_id=p_shop_id and n.shop_device_id=p_shop_device_id and n.upload_id=v_id and n.domain='child' and n.group_index=child.part_index
             and exists(select 1 from jsonb_array_elements(v_items) entry where entry->>'kind'='child' and (entry->>'partIndex')::integer=child.part_index and entry->>'childClientItemId'=n.client_item_id)) chosen
         where child.shop_id=p_shop_id and child.shop_device_id=p_shop_device_id and child.upload_id=v_id and chosen.items is not null;
       v_result:=v_binding||jsonb_build_object('header',v_doc.header,'root',v_root,'items',v_items,'children',v_children,'offset',v_offset);
     end if;
     exit when octet_length(v_items::text)<=262144 and coalesce(octet_length(v_root::text),0)<=262144
       and coalesce(octet_length(v_children::text),0)<=262144 and octet_length(v_result::text)<=2097152;
     if v_limit=1 then return jsonb_build_object('ok',false,'code','projection_too_large');end if;v_limit:=greatest(1,v_limit/2);
   end loop;
   return v_result||jsonb_build_object('rawSha256',v_doc.raw_hash,'cursor',v_cursor,'stage',v_doc.phase);
 end if;
 if p_action='store-normalize-page' then
   v_cursor:=(p_payload->>'cursor')::integer;v_kind:=p_payload->>'stage';
   v_hash:='sha256:'||encode(extensions.digest(p_payload::text,'sha256'),'hex');
   select response,request_hash into v_ack,v_text from app_private.pos_import_recovery_page_acks where shop_id=p_shop_id and shop_device_id=p_shop_device_id
     and upload_id=v_id and phase=v_kind and cursor=v_cursor;
   if found then
     if v_text<>v_hash then return v_binding||jsonb_build_object('status','conflict','reason','normalize_retry_conflict');end if;return v_ack;end if;
   if v_doc.phase is distinct from v_kind or v_doc.cursor<>v_cursor or jsonb_typeof(p_payload->'items') is distinct from 'array'
     or jsonb_array_length(p_payload->'items') not between 1 and 1000 or octet_length((p_payload->'items')::text)>1048576
     or octet_length(p_payload::text)>2097152 then return jsonb_build_object('ok',false,'code','validation_failed');end if;
   v_count:=jsonb_array_length(p_payload->'items');v_group:=case when v_kind='children' then v_cursor/1001 else 0 end;
   v_offset:=case when v_kind='children' then v_cursor%1001 when v_kind='correction' then v_cursor-1000000 else v_cursor end;
   v_phase:=v_kind;v_kind:=case v_kind when 'items' then 'root' when 'children' then 'child' else v_kind end;
   if (select count(*) from app_private.pos_import_recovery_raw_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain=v_kind and group_index=v_group and ordinal>=v_offset and ordinal<v_offset+v_count)<>v_count
     or jsonb_typeof(p_payload->'canonicalRows') is distinct from 'array' or jsonb_array_length(p_payload->'canonicalRows')<>v_count then return jsonb_build_object('ok',false,'code','validation_failed');end if;
   for v_row in select row_json,ordinal from jsonb_array_elements(p_payload->'items') with ordinality source(row_json,ordinal) loop
     v_fragment:=p_payload->'canonicalRows'->>((v_row.ordinal-1)::integer);
     if v_fragment::jsonb is distinct from v_row.row_json then raise exception 'invalid canonical fragment' using errcode='22023';end if;
     insert into app_private.pos_import_recovery_normal_rows values(p_shop_id,p_shop_device_id,v_id,v_kind,v_group,v_offset+v_row.ordinal-1,v_row.row_json,v_fragment,default);
   end loop;
   if v_kind='root' then
     if v_doc.canonical_prefix is not null and (v_doc.canonical_prefix is distinct from p_payload->>'canonicalPrefix' or v_doc.canonical_suffix is distinct from p_payload->>'canonicalSuffix'
       or v_doc.normalized_header is distinct from p_payload->'normalizedHeader') then raise exception 'header changed' using errcode='22023';end if;
     update app_private.pos_import_recovery_documents set canonical_prefix=p_payload->>'canonicalPrefix',canonical_suffix=p_payload->>'canonicalSuffix',normalized_header=p_payload->'normalizedHeader'
       where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
   elsif v_kind in('child','correction') then
     if v_kind='child' then
       if jsonb_typeof(p_payload->'rawRowByteLengths') is distinct from 'array' or jsonb_array_length(p_payload->'rawRowByteLengths')<>v_count or (p_payload->>'fullHttpHeaderBytes')::integer not between 1 and 524288 then raise exception 'invalid child byte projection' using errcode='22023';end if;
       update app_private.pos_import_recovery_raw_rows set http_bytes=(p_payload->'rawRowByteLengths'->>(ordinal-v_offset))::integer where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='child' and group_index=v_group and ordinal>=v_offset and ordinal<v_offset+v_count;
       select * into v_child from app_private.pos_import_recovery_child_headers where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and part_index=v_group;
       v_normal:=p_payload->'childHeader';v_normal:=v_normal-'payloadHash';
       if v_normal->>'kind'='ordinary' then v_normal:=jsonb_set(v_normal,'{normalized}',(v_normal->'normalized')-'payloadHash');end if;
       if v_child.normalized_header is not null and (v_child.normalized_header is distinct from v_normal or v_child.canonical_prefix is distinct from p_payload->>'canonicalPrefix'
         or v_child.canonical_suffix is distinct from p_payload->>'canonicalSuffix' or v_child.plan_template is distinct from p_payload->'planTemplate') then
         raise exception 'child header changed' using errcode='22023';end if;
       update app_private.pos_import_recovery_child_headers set normalized_header=v_normal,canonical_prefix=p_payload->>'canonicalPrefix',canonical_suffix=p_payload->>'canonicalSuffix',plan_template=p_payload->'planTemplate',http_header_bytes=(p_payload->>'fullHttpHeaderBytes')::integer
         where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and part_index=v_group;
     else
       update app_private.pos_import_recovery_documents set canonical_prefix=p_payload->>'canonicalPrefix',canonical_suffix=p_payload->>'canonicalSuffix',normalized_header=p_payload->'childHeader'
         where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
     end if;
   end if;
   v_next:=v_offset+v_count;
   v_total:=(select count(*) from app_private.pos_import_recovery_raw_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain=v_kind and group_index=v_group);
   if v_next=v_total then
     if v_kind='root' then
       -- Global validation supplements page-local official parsing. No page can
       -- certify an original if an ID or trimmed identity collides elsewhere.
       -- Project scalar identities once before grouping: full row_json values
       -- must not be carried through the global identity sort/join at 60000 rows.
       if (with normalized as materialized (
         select group_index,ordinal,client_item_id,row_json->>'changeKind' kind,
           row_json->>'barcode' barcode,row_json->>'itemNumber' item_number
         from app_private.pos_import_recovery_normal_rows
         where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='root'
       ), raw as materialized (
         select group_index,ordinal,coalesce(row_json->>'barcode','') barcode,
           coalesce(row_json->>'itemNumber',row_json->>'item_number','') item_number
         from app_private.pos_import_recovery_raw_rows
         where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='root'
       ) select exists(select 1 from normalized group by client_item_id having count(*)<>1)
         or exists(select 1 from normalized where kind in('new','updated') group by barcode having count(*)<>1)
         or exists(select 1 from normalized join raw using(group_index,ordinal)
           cross join lateral(values('barcode',normalized.barcode,raw.barcode),('itemNumber',normalized.item_number,raw.item_number)) fields(field,normalized_value,raw_value)
           where coalesce(fields.normalized_value,'')<>''
           group by fields.field,fields.normalized_value having count(distinct fields.raw_value)>1))
         then raise exception 'global original identity collision' using errcode='22023';end if;
       if (select count(*) from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='root' and row_json->>'changeKind'='new')>(p_payload->'normalizedHeader'->'summary'->>'newProducts')::integer
         or (select count(*) from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='root' and row_json->>'changeKind'='updated')>(p_payload->'normalizedHeader'->'summary'->>'updatedProducts')::integer
         then raise exception 'global summary mismatch' using errcode='22023';end if;
       select string_agg(canonical_json,',' order by ordinal) into v_items_text from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='root';
       v_text:=(p_payload->>'canonicalPrefix')||v_items_text||(p_payload->>'canonicalSuffix');
       v_fragment:='sha256:'||encode(extensions.digest(convert_to(v_text,'UTF8'),'sha256'),'hex');
       update app_private.pos_import_recovery_documents set root_hash=v_fragment,root_normalized=p_payload->'normalizedHeader'||jsonb_build_object('payloadHash',v_fragment),
         phase=case when header->>'schemaVersion'='pos-catalog-import-correction-v1' then 'correction' else 'complete' end,
         cursor=case when header->>'schemaVersion'='pos-catalog-import-correction-v1' then 1000000 else v_next end where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
     elsif v_kind='child' then
       if (select coalesce(sum(http_bytes),0)+count(*)-1 from app_private.pos_import_recovery_raw_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='child' and group_index=v_group)+(p_payload->>'fullHttpHeaderBytes')::integer>524288
         or exists(select 1 from app_private.pos_import_recovery_normal_rows normalized join app_private.pos_import_recovery_raw_rows raw using(shop_id,shop_device_id,upload_id,domain,group_index,ordinal) cross join(values('barcode','barcode'),('itemNumber','item_number')) fields(field,alias)
           where normalized.shop_id=p_shop_id and normalized.shop_device_id=p_shop_device_id and normalized.upload_id=v_id and normalized.domain='child' and normalized.group_index=v_group and coalesce(normalized.row_json->>fields.field,'')<>''
           group by fields.field,normalized.row_json->>fields.field having count(distinct coalesce(raw.row_json->>fields.field,raw.row_json->>fields.alias,''))>1) then raise exception 'child transport or identity bound' using errcode='22023';end if;
       if v_doc.header->>'mode'='replacement' and ((select count(*) from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='child' and group_index=v_group and row_json->>'changeKind'='new')>(p_payload->'childHeader'->'summary'->>'newProducts')::integer or (select count(*) from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='child' and group_index=v_group and row_json->>'changeKind'='updated')>(p_payload->'childHeader'->'summary'->>'updatedProducts')::integer) then raise exception 'child summary mismatch' using errcode='22023';end if;
       select string_agg(canonical_json,',' order by case when v_doc.header->>'mode'='correction' then row_json->>'remoteProductId' end,ordinal),jsonb_agg(row_json order by case when v_doc.header->>'mode'='correction' then row_json->>'remoteProductId' end,ordinal)
         into v_items_text,v_items from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='child' and group_index=v_group;
       v_fragment:='sha256:'||encode(extensions.digest(convert_to((p_payload->>'canonicalPrefix')||v_items_text||(p_payload->>'canonicalSuffix'),'UTF8'),'sha256'),'hex');
       v_normal:=(p_payload->'childHeader')||jsonb_build_object('payloadHash',v_fragment,'items',v_items);
       if v_normal->>'kind'='ordinary' then v_normal:=jsonb_set(v_normal,'{normalized}',(v_normal->'normalized')||jsonb_build_object('payloadHash',v_fragment,'items',v_items));end if;
       update app_private.pos_import_recovery_child_headers set child=v_normal,canonical_json=app_private.pos_import_recovery_template_v1(p_payload->'planTemplate','['||v_items_text||']',v_fragment)
         where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and part_index=v_group;
       update app_private.pos_import_recovery_documents set phase=case when v_group+1=child_count then 'coverage' else 'children' end,
         cursor=case when v_group+1=child_count then 0 else (v_group+1)*1001 end where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
     else
       update app_private.pos_import_recovery_documents set phase='complete',cursor=v_next where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
     end if;
   else update app_private.pos_import_recovery_documents set cursor=case when v_kind='child' then v_group*1001+v_next when v_kind='correction' then 1000000+v_next else v_next end
     where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;end if;
   select * into v_doc from app_private.pos_import_recovery_documents where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
   v_ack:=v_binding||jsonb_build_object('status','normalizing','uploadId',v_id,'rawSha256',v_doc.raw_hash,
     case when v_doc.mode='original' then 'phase' else 'stage' end,v_doc.phase,'nextCursor',case when v_doc.phase='complete' then null else v_doc.cursor end,
     'totalItemCount',case when v_phase='correction' then v_total else v_doc.root_count end,'partCount',v_doc.child_count,'totalCoverageCount',v_doc.coverage_count);
   insert into app_private.pos_import_recovery_page_acks values(p_shop_id,p_shop_device_id,v_id,v_phase,v_cursor,v_hash,v_ack);
   return v_ack;
 end if;
 if p_action in('complete-original','complete-plan') then
   if v_doc.result is not null then return v_doc.result;end if;
   if v_doc.phase<>'complete' then return v_binding||jsonb_build_object('status','conflict','reason','normalize_incomplete');end if;
   if p_action='complete-original' then
     if v_doc.mode<>'original' then return jsonb_build_object('ok',false,'code','validation_failed');end if;
     v_kind:=case when v_doc.header->>'schemaVersion'='pos-catalog-import-correction-v1' then 'correction' else 'root' end;
     select jsonb_agg(row_json order by case when v_kind='correction' then row_json->>'remoteProductId' end,ordinal),
       string_agg(canonical_json,',' order by case when v_kind='correction' then row_json->>'remoteProductId' end,ordinal),count(*) into v_items,v_items_text,v_count
       from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain=v_kind;
     if v_count not between 1 and (case when v_kind='correction' then 1000 else 60000 end) or
       exists(select 1 from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain=v_kind
         group by client_item_id having count(*)<>1) or (v_kind='correction' and exists(select 1 from app_private.pos_import_recovery_normal_rows
           where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain=v_kind group by row_json->>'remoteProductId' having count(*)<>1))
       then return jsonb_build_object('ok',false,'code','validation_failed');end if;
     v_hash:='sha256:'||encode(extensions.digest(convert_to(v_doc.canonical_prefix||v_items_text||v_doc.canonical_suffix,'UTF8'),'sha256'),'hex');
     if v_kind='root' then
       v_normal:=v_doc.normalized_header||jsonb_build_object('items',v_items,'payloadHash',v_hash,
         'rawItems',(select jsonb_agg(row_json order by ordinal) from app_private.pos_import_recovery_raw_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='root'));
     else
       v_normal:=v_doc.normalized_header||jsonb_build_object('items',v_items,'canonicalPayloadHash',v_hash,'payloadHash',v_upload.manifest->>'declaredPayloadHash',
         'authoritativeRoot',jsonb_build_object('clientImportId',v_doc.root_normalized->>'clientImportId','idempotencyKey',v_doc.root_normalized->>'idempotencyKey','canonicalPayloadHash',v_doc.root_hash));
     end if;
     if v_upload.verified_at is not null and (v_upload.canonical_hash is distinct from v_hash or v_upload.normalized_request is distinct from v_normal) then
       return v_binding||jsonb_build_object('status','conflict','reason','verified_original_conflict');end if;
     v_auth:=app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
     if v_auth<>'ok' then return jsonb_build_object('ok',false,'code',v_auth);end if;
     update app_private.pos_catalog_import_recovery_uploads set normalized_request=v_normal,canonical_hash=v_hash,client_import_id=v_normal->>'clientImportId',
       idempotency_key=v_normal->>'idempotencyKey',declared_hash=v_upload.manifest->>'declaredPayloadHash',original_schema=v_doc.header->>'schemaVersion',item_count=v_count,verified_at=clock_timestamp()
       where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
     update app_private.pos_import_recovery_admissions set root_key=case when v_kind='root' then (v_normal->>'clientImportId')||':'||(v_normal->>'idempotencyKey')||':'||v_hash else (v_doc.root_normalized->>'clientImportId')||':'||(v_doc.root_normalized->>'idempotencyKey')||':'||v_doc.root_hash end
       where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
     v_result:=v_binding||jsonb_build_object('status','verified','verifiedOriginalId',v_id,'originalSchemaVersion',v_doc.header->>'schemaVersion',
       'clientImportId',v_normal->>'clientImportId','idempotencyKey',v_normal->>'idempotencyKey','payloadHash',v_upload.manifest->>'declaredPayloadHash',
       'canonicalPayloadHash',v_hash,'rawSha256',v_doc.raw_hash,'itemCount',v_count);
   else
     if v_doc.mode<>'plan' or (select count(*) from app_private.pos_import_recovery_child_headers where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and child is not null)<>v_doc.child_count
       or (select count(*) from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='coverage')<>v_doc.coverage_count
       then return jsonb_build_object('ok',false,'code','validation_failed');end if;
     -- Page parsing cannot replace global intent/identity/collision validation.
     if exists(select 1 from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='child' group by client_item_id having count(*)<>1)
       or (select count(*) from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='child')>60000
       or exists(select 1 from app_private.pos_import_recovery_child_headers where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id group by child->>'clientImportId' having count(*)<>1)
       or exists(select 1 from app_private.pos_import_recovery_child_headers where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id group by child->>'idempotencyKey' having count(*)<>1)
       then return jsonb_build_object('ok',false,'code','validation_failed');end if;
     if exists(with intents as materialized(
       select case when v_doc.header->>'mode'='replacement' then row_json->>'barcode' else row_json->>'remoteProductId' end identity_value
         from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='child'
           and (v_doc.header->>'mode'='correction' or row_json->>'changeKind' in('new','updated'))
       union all select case when v_doc.header->>'mode'='replacement' then
           case when proof.row_json->>'kind'='accepted_plan_part' then ancestor_item.item->>'barcode' else root.row_json->>'barcode' end
           else proof.row_json->>'contributorRemoteProductId' end
         from app_private.pos_import_recovery_normal_rows proof join app_private.pos_import_recovery_normal_rows root on root.shop_id=proof.shop_id and root.shop_device_id=proof.shop_device_id and root.upload_id=proof.upload_id
           and root.domain='root' and root.client_item_id=proof.client_item_id
         left join app_private.pos_catalog_import_recovery_plan_parts ancestor on ancestor.shop_id=proof.shop_id and ancestor.shop_device_id=proof.shop_device_id
           and ancestor.plan_id=case when proof.row_json->>'kind'='accepted_plan_part' then (proof.row_json->>'contributorPlanId')::uuid end
           and ancestor.part_index=case when proof.row_json->>'kind'='accepted_plan_part' then (proof.row_json->>'contributorPartIndex')::integer end
         left join lateral(select item from jsonb_array_elements(ancestor.child->'items') item where item->>'clientItemId'=proof.row_json->>'contributorClientItemId') ancestor_item on true
         where proof.shop_id=p_shop_id and proof.shop_device_id=p_shop_device_id and proof.upload_id=v_id and proof.domain='coverage'
             and proof.row_json->>'kind' in('accepted_contributor','accepted_plan_part') and proof.row_json->>'contributorRemoteProductId' is not null)
       select 1 from intents group by identity_value having count(*)<>1)
       then return jsonb_build_object('ok',false,'code','validation_failed');end if;
     select jsonb_agg(child order by part_index),string_agg(canonical_json,',' order by part_index) into v_children,v_fragment from app_private.pos_import_recovery_child_headers
       where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
     v_children:=coalesce(v_children,'[]'::jsonb);v_fragment:=coalesce(v_fragment,'');
     select jsonb_agg(row_json order by ordinal),string_agg(canonical_json,',' order by ordinal) into v_items,v_items_text from app_private.pos_import_recovery_normal_rows
       where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='coverage';
     v_header:=v_doc.header;
     if v_header?'supersedes' then
       select coalesce(jsonb_agg(row_json order by ordinal),'[]'::jsonb) into v_selected from app_private.pos_import_recovery_raw_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='retired';
       if jsonb_array_length(v_selected)>1024 or exists(select 1 from jsonb_array_elements(v_selected) item where (item-'partIndex'-'canonicalPayloadHash')<>'{}'::jsonb
         or (item->>'partIndex')::integer not between 0 and 1023 or coalesce(item->>'canonicalPayloadHash','')!~'^sha256:[0-9a-f]{64}$')
         or (select count(distinct item->>'partIndex') from jsonb_array_elements(v_selected) item)<>jsonb_array_length(v_selected)
         then return jsonb_build_object('ok',false,'code','validation_failed');end if;
       v_header:=jsonb_set(v_header,'{supersedes,retiredChildren}',v_selected);
       select coalesce(string_agg('{"partIndex":'||(row_json->>'partIndex')::integer||',"canonicalPayloadHash":'||to_json(row_json->>'canonicalPayloadHash')::text||'}',',' order by ordinal),'') into v_text
         from app_private.pos_import_recovery_raw_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='retired';
     end if;
     -- Scalar metadata is normalized server-side and ASCII only; array row JSON
     -- comes exclusively from official TS normalization, never jsonb::text.
     v_prefix:='{"schemaVersion":"pos-catalog-import-recovery-plan-v1","planId":'||to_json(v_header->>'planId')::text||',"verifiedOriginalId":'||to_json(v_header->>'verifiedOriginalId')::text||',"mode":'||to_json(v_header->>'mode')::text;
     if v_header?'supersedes' then v_prefix:=v_prefix||',"supersedes":{"planId":'||to_json(v_header->'supersedes'->>'planId')::text||',"retiredChildren":['||v_text||']}';end if;
     v_hash:='sha256:'||encode(extensions.digest(convert_to(v_prefix||',"parts":['||v_fragment||'],"coverage":['||coalesce(v_items_text,'')||']}','UTF8'),'sha256'),'hex');
     v_normal:=v_header||jsonb_build_object('parts',v_children,'coverage',coalesce(v_items,'[]'::jsonb),'planCanonicalHash',v_hash,
       'itemCount',(select count(*) from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='child'));
     v_result:=app_private.pos_catalog_import_recovery_small_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id,'plan',
       jsonb_build_object('uploadId',v_id,'manifestSha256',v_upload.manifest_hash,'rawSha256',v_doc.raw_hash,'plan',v_normal));
     if v_result->>'ok' is distinct from 'true' or v_result->>'status' is distinct from 'planned' then return v_result;end if;
     select root_key into v_root_key from app_private.pos_import_recovery_admissions where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
     -- Whole validated conversion consumes one future credit and restores the
     -- claimed staging allowance atomically: retained raw is counted once;
     -- bytes/slots in the admission budget do not increase at conversion.
     update app_private.pos_import_recovery_capacity set credits=credits-1,staging_reserved=true,staging_upload_id=null
       where shop_id=p_shop_id and shop_device_id=p_shop_device_id and root_key=v_root_key and credits>0
         and (staging_upload_id is null or staging_upload_id=v_id);
     update app_private.pos_import_recovery_admissions set terminal=(v_result->>'parentStatus'='complete'),plan_id=(v_result->>'planId')::uuid where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
     if v_result->>'parentStatus'='complete' and not exists(select 1 from app_private.pos_catalog_import_recovery_plans successor
       where successor.shop_id=p_shop_id and successor.shop_device_id=p_shop_device_id and successor.predecessor_plan_id=(v_result->>'planId')::uuid) then
       -- A historical complete ancestor ACK is not closure of a newer leaf.
       -- Authoritative full leaf closure (also zero new children) releases only
       -- unused promises. Audit rows/total bytes are never refunded or deleted.
       update app_private.pos_import_recovery_capacity set credits=0,
         staging_reserved=staging_upload_id is not null and staging_upload_id<>v_id,
         staging_upload_id=case when staging_upload_id<>v_id then staging_upload_id end
         where shop_id=p_shop_id and shop_device_id=p_shop_device_id and root_key=v_root_key;
       -- A shared root tuple is not proof that another prepared upload closed.
       -- Close only verified ordinary authority aliases and this valid leaf.
       update app_private.pos_import_recovery_admissions admission set terminal=true where admission.shop_id=p_shop_id and admission.shop_device_id=p_shop_device_id and
         (admission.plan_id=(v_result->>'planId')::uuid or admission.upload_id in(select root.upload_id from app_private.pos_catalog_import_recovery_uploads root
           where root.shop_id=p_shop_id and root.shop_device_id=p_shop_device_id and root.verified_at is not null and root.original_schema='pos-catalog-import-v1'
             and root.client_import_id=v_doc.root_normalized->>'clientImportId' and root.idempotency_key=v_doc.root_normalized->>'idempotencyKey' and root.canonical_hash=v_doc.root_hash));end if;
     if v_header?'supersedes' then
       -- Inactive predecessor artifact only: its immutable logical parent stays
       -- partial. Its unACKed children are fenced and every ACK is carried by
       -- the successful whole successor proof checked by the core above.
       update app_private.pos_import_recovery_admissions set terminal=true where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=(v_header->'supersedes'->>'planId')::uuid;end if;
   end if;
   update app_private.pos_import_recovery_documents set state='complete',result=v_result where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id;
   return v_result;
 end if;
 return jsonb_build_object('ok',false,'code','validation_failed');
exception when invalid_text_representation or numeric_value_out_of_range or null_value_not_allowed or invalid_parameter_value then
 return jsonb_build_object('ok',false,'code','validation_failed');
end;$$;

create function public.pos_catalog_import_recovery_v1(p_shop_id uuid,p_shop_device_id uuid,p_staff_id uuid,p_pos_session_id uuid,p_owner_user_id uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path=public,app_private,extensions,pg_temp as $$
declare v_auth text;v_result jsonb;v_upload app_private.pos_catalog_import_recovery_uploads%rowtype;v_root_key text;v_total bigint;v_root jsonb;v_precheck jsonb;v_already boolean:=false;
begin
 if p_action in('manifest','seal','bytes','prepare-original','prepare-plan','read-normalize-page','store-normalize-page','complete-original','complete-plan','read-selected-original','fail-normalization') then
   v_result:=app_private.pos_import_recovery_phased_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id,p_action,p_payload);
   -- Older cached phased results may lack this metadata. Derive it from scoped
   -- immutable children without rewriting the cache, intent, ACK or plan hash.
   if v_result->>'ok'='true' and v_result->>'status'='planned' then
     return v_result||jsonb_build_object('parts',(select coalesce(jsonb_agg((child-'items'-'summary'-'normalized')||jsonb_build_object('itemCount',jsonb_array_length(child->'items')) order by part_index),'[]'::jsonb)
       from app_private.pos_catalog_import_recovery_plan_parts where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=(v_result->>'planId')::uuid));end if;
   return v_result;end if;
 if p_action in('upload','retire','plan','apply') then
   perform pg_advisory_xact_lock(hashtext('pos-import-recovery-quota'),hashtext(p_shop_id::text||':'||p_shop_device_id::text));end if;
 v_auth:=app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
 if v_auth<>'ok' then return jsonb_build_object('ok',false,'code',v_auth);end if;
 if p_action='upload' and not exists(select 1 from app_private.pos_import_recovery_admissions where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=(p_payload->>'uploadId')::uuid) then
   v_total:=(p_payload->'manifest'->>'totalByteLength')::bigint;
   if v_total not between 1 and 4194304 then return jsonb_build_object('ok',false,'code','phased_upload_required');end if;
   if not app_private.pos_import_recovery_quota_ok_v1(p_shop_id,p_shop_device_id,v_total,1,v_total,1) then
     -- An old unbound plan manifest cannot claim a root's protected staging
     -- allowance. Re-register the SAME raw bytes through root-bound phases;
     -- refusal occurs before any admission, credit conversion or fence.
     return jsonb_build_object('ok',false,'code',case when p_payload->'manifest'->>'mode'='plan' then 'phased_upload_required' else 'quota_exceeded' end);end if;
   insert into app_private.pos_import_recovery_admissions(shop_id,shop_device_id,upload_id,raw_bytes,terminal,root_key) values(p_shop_id,p_shop_device_id,(p_payload->>'uploadId')::uuid,v_total,false,null);
 end if;
 if p_action='read-upload' then
   select * into v_upload from app_private.pos_catalog_import_recovery_uploads where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=(p_payload->>'uploadId')::uuid;
   if v_upload.total_bytes>4194304 then return jsonb_build_object('ok',false,'code','phased_upload_required');end if;
 end if;
 if p_action='read-original' then
   select * into v_upload from app_private.pos_catalog_import_recovery_uploads where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=(p_payload->>'verifiedOriginalId')::uuid;
   if v_upload.total_bytes>4194304 or octet_length(coalesce(v_upload.normalized_request::text,''))>16777216 then return jsonb_build_object('ok',false,'code','projection_too_large');end if;
 end if;
 if p_action='retire' then
   if p_payload?'verifiedOriginalId' then select * into v_upload from app_private.pos_catalog_import_recovery_uploads where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=(p_payload->>'verifiedOriginalId')::uuid and verified_at is not null;
   else select root.* into v_upload from app_private.pos_catalog_import_recovery_plans plan join app_private.pos_catalog_import_recovery_uploads root on root.shop_id=plan.shop_id and root.shop_device_id=plan.shop_device_id and root.upload_id=plan.original_id
     where plan.shop_id=p_shop_id and plan.shop_device_id=p_shop_device_id and plan.plan_id=(p_payload->>'planId')::uuid;end if;
   if v_upload.upload_id is null then return jsonb_build_object('ok',false,'code','not_found');end if;
   if v_upload.original_schema='pos-catalog-import-correction-v1' then
     -- The forensic wrapper is not a root authority. Both new paged proof and
     -- the earlier complete parser persist the server-derived ordinary tuple.
     v_root:=coalesce(v_upload.normalized_request->'authoritativeRoot',v_upload.normalized_request->'original');
     if coalesce(v_root->>'clientImportId','')='' or coalesce(v_root->>'idempotencyKey','')='' or
       coalesce(v_root->>'canonicalPayloadHash',v_root->>'payloadHash','')!~'^sha256:[0-9a-f]{64}$' then
       return jsonb_build_object('ok',false,'code','validation_failed');end if;
     v_root_key:=(v_root->>'clientImportId')||':'||(v_root->>'idempotencyKey')||':'||coalesce(v_root->>'canonicalPayloadHash',v_root->>'payloadHash');
   else v_root:=jsonb_build_object('clientImportId',v_upload.client_import_id,'idempotencyKey',v_upload.idempotency_key,'canonicalPayloadHash',v_upload.canonical_hash);v_root_key:=v_upload.client_import_id||':'||v_upload.idempotency_key||':'||v_upload.canonical_hash;end if;
   perform pg_advisory_xact_lock(hashtext('pos-import-recovery-root:'||p_shop_id::text||':'||p_shop_device_id::text),hashtext(v_root_key));
   update app_private.pos_import_recovery_admissions set root_key=v_root_key where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_upload.upload_id;
   -- Read-only authoritative ACK inspection takes the same root/plan/identity
   -- locks. An accepted identity requires adoption, not a new retirement fence
   -- or reserved replacement capacity, even when the storage quota is full.
   v_precheck:=app_private.pos_catalog_import_recovery_small_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id,'receipt',p_payload);
   if v_precheck->>'ok'='true' and (v_precheck->>'status'='accepted' or
     (v_precheck->>'status'='conflict' and v_precheck->>'reason'='identity_retired' and exists(select 1 from app_private.pos_catalog_import_retirements
       where shop_id=p_shop_id and shop_device_id=p_shop_device_id and client_import_id=v_precheck->>'clientImportId'
         and idempotency_key=v_precheck->>'idempotencyKey' and payload_hash=v_precheck->>'canonicalPayloadHash'))) then
     return app_private.pos_catalog_import_recovery_small_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id,'retire',p_payload);end if;
   -- Absence must be authoritative after all blocking authorization checks.
   -- Failed auth/hash/conflict inspection cannot debit replacement capacity.
   if v_precheck->>'ok' is distinct from 'true' or v_precheck->>'status' is distinct from 'not_found' then return v_precheck;end if;
   if not app_private.pos_import_recovery_reserve_v1(p_shop_id,p_shop_device_id,v_root) then
     return jsonb_build_object('ok',false,'code','quota_exceeded');end if;
 end if;
 if p_action='plan' then v_already:=exists(select 1 from app_private.pos_catalog_import_recovery_plans where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=(p_payload->'plan'->>'planId')::uuid);end if;
 v_result:=app_private.pos_catalog_import_recovery_small_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id,p_action,p_payload);
 if v_result->>'ok'='true' and v_result->>'status'='planned' and p_action='plan' and not v_already then
   select original_client_import_id||':'||original_idempotency_key||':'||original_canonical_hash into v_root_key from app_private.pos_catalog_import_recovery_plans
     where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=(v_result->>'planId')::uuid;
   update app_private.pos_import_recovery_admissions set root_key=v_root_key,terminal=(v_result->>'parentStatus'='complete'),plan_id=(v_result->>'planId')::uuid
     where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=(p_payload->>'uploadId')::uuid;
   update app_private.pos_import_recovery_capacity set credits=credits-1,staging_reserved=true,staging_upload_id=null
     where shop_id=p_shop_id and shop_device_id=p_shop_device_id and root_key=v_root_key and credits>0 and staging_upload_id is null;
 end if;
 if v_result->>'ok'='true' and v_result->>'parentStatus'='complete' and p_action in('apply','plan') and not exists(select 1 from app_private.pos_catalog_import_recovery_plans successor
   where successor.shop_id=p_shop_id and successor.shop_device_id=p_shop_device_id and successor.predecessor_plan_id=coalesce(v_result->>'planId',p_payload->>'planId')::uuid) then
   select original_client_import_id||':'||original_idempotency_key||':'||original_canonical_hash into v_root_key from app_private.pos_catalog_import_recovery_plans
     where shop_id=p_shop_id and shop_device_id=p_shop_device_id and plan_id=coalesce(v_result->>'planId',p_payload->>'planId')::uuid;
   update app_private.pos_import_recovery_admissions admission set terminal=true where admission.shop_id=p_shop_id and admission.shop_device_id=p_shop_device_id and
     (admission.plan_id=coalesce(v_result->>'planId',p_payload->>'planId')::uuid or admission.upload_id in(select root.upload_id from app_private.pos_catalog_import_recovery_uploads root
       join app_private.pos_catalog_import_recovery_plans leaf on leaf.shop_id=root.shop_id and leaf.shop_device_id=root.shop_device_id and root.client_import_id=leaf.original_client_import_id
         and root.idempotency_key=leaf.original_idempotency_key and root.canonical_hash=leaf.original_canonical_hash
       where leaf.shop_id=p_shop_id and leaf.shop_device_id=p_shop_device_id and leaf.plan_id=coalesce(v_result->>'planId',p_payload->>'planId')::uuid and root.verified_at is not null and root.original_schema='pos-catalog-import-v1'));
   update app_private.pos_import_recovery_capacity capacity set credits=0,
     staging_reserved=exists(select 1 from app_private.pos_import_recovery_admissions admission where admission.shop_id=p_shop_id and admission.shop_device_id=p_shop_device_id and admission.upload_id=capacity.staging_upload_id and not admission.terminal),
     staging_upload_id=case when exists(select 1 from app_private.pos_import_recovery_admissions admission where admission.shop_id=p_shop_id and admission.shop_device_id=p_shop_device_id and admission.upload_id=capacity.staging_upload_id and not admission.terminal) then staging_upload_id end
     where capacity.shop_id=p_shop_id and capacity.shop_device_id=p_shop_device_id and capacity.root_key=v_root_key;end if;
 return v_result;
exception when invalid_text_representation or numeric_value_out_of_range or null_value_not_allowed then return jsonb_build_object('ok',false,'code','validation_failed');
end;$$;

-- The original endpoint can name a verified/planned B identity as well.
-- Its unchanged signature therefore shares the same capacity fence instead of
-- silently bypassing it. Unknown A-only identities retain original semantics.
alter function public.pos_catalog_import_retire_v1(uuid,uuid,uuid,uuid,uuid,text,text,text) rename to pos_catalog_import_retire_pre_multipart_v1;
alter function public.pos_catalog_import_retire_pre_multipart_v1(uuid,uuid,uuid,uuid,uuid,text,text,text) set schema app_private;
revoke all on function app_private.pos_catalog_import_retire_pre_multipart_v1(uuid,uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
create function public.pos_catalog_import_retire_v1(p_shop_id uuid,p_shop_device_id uuid,p_staff_id uuid,p_pos_session_id uuid,p_owner_user_id uuid,p_client_import_id text,p_idempotency_key text,p_payload_hash text)
returns jsonb language plpgsql volatile security definer set search_path=public,app_private,extensions,pg_temp as $$
declare v_auth text;v_root jsonb;v_key text;v_candidate jsonb;v_row record;v_receipt jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('pos-import-recovery-quota'),hashtext(p_shop_id::text||':'||p_shop_device_id::text));
 v_auth:=app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
 if v_auth<>'ok' then return jsonb_build_object('ok',false,'code',v_auth);end if;
 for v_row in
   select root.normalized_request,root.original_schema,root.client_import_id,root.idempotency_key,root.canonical_hash,
       part.child->>'clientImportId' selected_client_import_id,part.child->>'idempotencyKey' selected_idempotency_key,part.child->>'payloadHash' selected_payload_hash
     from app_private.pos_catalog_import_recovery_plan_parts part join app_private.pos_catalog_import_recovery_plans plan using(shop_id,shop_device_id,plan_id)
     join app_private.pos_catalog_import_recovery_uploads root on root.shop_id=plan.shop_id and root.shop_device_id=plan.shop_device_id and root.upload_id=plan.original_id
     where part.shop_id=p_shop_id and part.shop_device_id=p_shop_device_id and (part.child->>'clientImportId'=p_client_import_id or part.child->>'idempotencyKey'=p_idempotency_key)
   union all
   select normalized_request,original_schema,client_import_id,idempotency_key,canonical_hash,client_import_id,idempotency_key,canonical_hash from app_private.pos_catalog_import_recovery_uploads
     where shop_id=p_shop_id and shop_device_id=p_shop_device_id and verified_at is not null and (client_import_id=p_client_import_id or idempotency_key=p_idempotency_key)
 loop
   -- All apply paths fence either identity key. A mismatching alias must not
   -- masquerade as an unknown A-only identity and retire a known B child.
   if v_row.selected_client_import_id is distinct from p_client_import_id or v_row.selected_idempotency_key is distinct from p_idempotency_key
     or v_row.selected_payload_hash is distinct from p_payload_hash then return jsonb_build_object('ok',false,'code','identity_conflict');end if;
   v_candidate:=case when v_row.original_schema='pos-catalog-import-correction-v1' then coalesce(v_row.normalized_request->'authoritativeRoot',v_row.normalized_request->'original')
     else jsonb_build_object('clientImportId',v_row.client_import_id,'idempotencyKey',v_row.idempotency_key,'canonicalPayloadHash',v_row.canonical_hash) end;
   if coalesce(v_candidate->>'clientImportId','')='' or coalesce(v_candidate->>'idempotencyKey','')='' or coalesce(v_candidate->>'canonicalPayloadHash',v_candidate->>'payloadHash','')!~'^sha256:[0-9a-f]{64}$' then
     return jsonb_build_object('ok',false,'code','validation_failed');end if;
   v_candidate:=jsonb_build_object('clientImportId',v_candidate->>'clientImportId','idempotencyKey',v_candidate->>'idempotencyKey','canonicalPayloadHash',coalesce(v_candidate->>'canonicalPayloadHash',v_candidate->>'payloadHash'));
   if v_root is not null and v_candidate is distinct from v_root then return jsonb_build_object('ok',false,'code','identity_conflict');end if;
   v_root:=v_candidate;
 end loop;
 if v_root is not null then
   v_key:=(v_root->>'clientImportId')||':'||(v_root->>'idempotencyKey')||':'||(v_root->>'canonicalPayloadHash');
   perform pg_advisory_xact_lock(hashtext('pos-import-recovery-root:'||p_shop_id::text||':'||p_shop_device_id::text),hashtext(v_key));
   v_receipt:=public.pos_catalog_import_receipt_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id,p_client_import_id,p_idempotency_key,p_payload_hash);
   if v_receipt->>'ok'='true' and v_receipt->>'status'='not_found' and not app_private.pos_import_recovery_reserve_v1(p_shop_id,p_shop_device_id,v_root) then
     return jsonb_build_object('ok',false,'code','quota_exceeded');end if;
 end if;
 -- The preserved implementation rechecks live authorization after blocking
 -- waits and is the only writer of the actual identity-retirement ledger.
 return app_private.pos_catalog_import_retire_pre_multipart_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id,p_client_import_id,p_idempotency_key,p_payload_hash);
end;$$;
revoke all on function public.pos_catalog_import_retire_v1(uuid,uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.pos_catalog_import_retire_v1(uuid,uuid,uuid,uuid,uuid,text,text,text) to service_role;

alter table app_private.pos_import_recovery_admissions enable row level security;
alter table app_private.pos_import_recovery_admissions force row level security;
revoke all on app_private.pos_import_recovery_admissions from public,anon,authenticated,service_role;
alter table app_private.pos_import_recovery_capacity enable row level security;
alter table app_private.pos_import_recovery_capacity force row level security;
revoke all on app_private.pos_import_recovery_capacity from public,anon,authenticated,service_role;
alter table app_private.pos_import_recovery_registration enable row level security;
alter table app_private.pos_import_recovery_registration force row level security;
revoke all on app_private.pos_import_recovery_registration from public,anon,authenticated,service_role;
alter table app_private.pos_import_recovery_descriptors enable row level security;
alter table app_private.pos_import_recovery_descriptors force row level security;
revoke all on app_private.pos_import_recovery_descriptors from public,anon,authenticated,service_role;
alter table app_private.pos_import_recovery_documents enable row level security;
alter table app_private.pos_import_recovery_documents force row level security;
revoke all on app_private.pos_import_recovery_documents from public,anon,authenticated,service_role;
alter table app_private.pos_import_recovery_raw_rows enable row level security;
alter table app_private.pos_import_recovery_raw_rows force row level security;
revoke all on app_private.pos_import_recovery_raw_rows from public,anon,authenticated,service_role;
alter table app_private.pos_import_recovery_normal_rows enable row level security;
alter table app_private.pos_import_recovery_normal_rows force row level security;
revoke all on app_private.pos_import_recovery_normal_rows from public,anon,authenticated,service_role;
alter table app_private.pos_import_recovery_child_headers enable row level security;
alter table app_private.pos_import_recovery_child_headers force row level security;
revoke all on app_private.pos_import_recovery_child_headers from public,anon,authenticated,service_role;
alter table app_private.pos_import_recovery_page_acks enable row level security;
alter table app_private.pos_import_recovery_page_acks force row level security;
revoke all on app_private.pos_import_recovery_page_acks from public,anon,authenticated,service_role;
revoke all on function app_private.pos_catalog_import_recovery_small_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function app_private.pos_import_recovery_phased_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function app_private.pos_import_recovery_quota_ok_v1(uuid,uuid,bigint,integer,bigint,integer) from public,anon,authenticated,service_role;
revoke all on function app_private.pos_import_recovery_reserve_v1(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function app_private.pos_import_recovery_json_precision_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function app_private.pos_import_recovery_template_v1(jsonb,text,text) from public,anon,authenticated,service_role;
revoke all on function public.pos_catalog_import_recovery_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_catalog_import_recovery_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb) to service_role;
commit;
