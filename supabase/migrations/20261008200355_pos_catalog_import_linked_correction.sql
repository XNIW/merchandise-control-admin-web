-- TASK-094: linked, masked correction of an accepted import. Source-only.
begin;
create table app_private.pos_catalog_import_corrections (
  correction_id uuid primary key default gen_random_uuid(),
  shop_id uuid not null, shop_device_id uuid not null,
  client_import_id text not null check(length(client_import_id) between 1 and 200), idempotency_key text not null check(length(idempotency_key) between 1 and 200),
  payload_hash text not null check(payload_hash ~ '^sha256:[0-9a-f]{64}$'),
  original_batch_id uuid not null, ack_response jsonb not null check(jsonb_typeof(ack_response)='object'),
  created_at timestamptz not null default clock_timestamp(),
  unique(shop_id,shop_device_id,client_import_id),unique(shop_id,shop_device_id,idempotency_key)
);
alter table app_private.pos_catalog_import_corrections enable row level security;
alter table app_private.pos_catalog_import_corrections force row level security;
revoke all on table app_private.pos_catalog_import_corrections from public,anon,authenticated,service_role;

create function public.pos_catalog_import_correct_v1(
 p_shop_id uuid,p_shop_device_id uuid,p_staff_id uuid,p_pos_session_id uuid,p_owner_user_id uuid,
 p_original_client_import_id text,p_original_idempotency_key text,p_original_payload_hash text,
 p_client_import_id text,p_idempotency_key text,p_payload_hash text,p_created_at timestamptz,p_items jsonb
) returns jsonb language plpgsql volatile security definer
set search_path=public,app_private,pg_temp as $$
declare v_original jsonb; v_ack jsonb; v_auth text; v_previous app_private.pos_catalog_import_corrections%rowtype;
 v_product public.inventory_products%rowtype; v_item jsonb; v_mask jsonb; v_changes jsonb; v_snapshot jsonb; v_unchanged jsonb;
 v_correction_id uuid := gen_random_uuid(); v_price_id uuid; v_effective text; v_price_type text; v_value numeric;
 v_stock_before numeric(12,3); v_stock_after numeric(12,3); v_origin text;
 v_items jsonb := '[]'; v_products jsonb := '[]'; v_prices jsonb := '[]';
 v_binding jsonb := jsonb_build_object('ok',true,'shopId',p_shop_id,'shopDeviceId',p_shop_device_id,
   'clientImportId',p_client_import_id,'idempotencyKey',p_idempotency_key,'payloadHash',p_payload_hash);
begin
 if p_client_import_id is null or length(p_client_import_id) not between 1 and 200
   or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 200
   or p_payload_hash is null or p_payload_hash !~ '^sha256:[0-9a-f]{64}$'
   or p_client_import_id is not distinct from p_original_client_import_id
   or p_idempotency_key is not distinct from p_original_idempotency_key
   or p_created_at is null or not isfinite(p_created_at)
   or jsonb_typeof(p_items) is distinct from 'array' then
   return jsonb_build_object('ok',false,'code','validation_failed');
 end if;
 if jsonb_array_length(p_items) not between 1 and 1000 or pg_column_size(p_items)>524288
   or (select count(distinct item->>'clientItemId') from jsonb_array_elements(p_items) item)<>jsonb_array_length(p_items)
   or (select count(distinct item->>'remoteProductId') from jsonb_array_elements(p_items) item)<>jsonb_array_length(p_items) then
   return jsonb_build_object('ok',false,'code','validation_failed');
 end if;
 -- Original identity fence, then new identity keys. Scope/permission and clock
 -- are checked again after every possible blocking product lock below.
 v_original := public.pos_catalog_import_receipt_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id,
   p_original_client_import_id,p_original_idempotency_key,p_original_payload_hash);
 if v_original->>'ok' is distinct from 'true' then return v_original; end if;
 perform pg_advisory_xact_lock(hashtext(p_shop_id::text||':'||p_shop_device_id::text),hashtext(p_client_import_id));
 perform pg_advisory_xact_lock(hashtext(p_shop_id::text||':'||p_shop_device_id::text),hashtext(p_idempotency_key));
 v_auth := app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
 if v_auth<>'ok' then return jsonb_build_object('ok',false,'code',v_auth); end if;
 select * into v_previous from app_private.pos_catalog_import_corrections c where c.shop_id=p_shop_id and c.shop_device_id=p_shop_device_id
   and (c.client_import_id=p_client_import_id or c.idempotency_key=p_idempotency_key);
 if found then
   if v_previous.client_import_id<>p_client_import_id or v_previous.idempotency_key<>p_idempotency_key or v_previous.payload_hash<>p_payload_hash then
     return v_binding||jsonb_build_object('status','conflict','reason','identity_conflict');
   end if;
   return v_binding||jsonb_build_object('status','duplicate','receipt',v_previous.ack_response);
 end if;
 if v_original->>'status'<>'accepted' then
   return v_binding||jsonb_build_object('status','conflict','reason','original_receipt_unavailable');
 end if;
 if exists(select 1 from public.pos_catalog_import_batches b where b.shop_id=p_shop_id and b.shop_device_id=p_shop_device_id
   and (b.client_import_id=p_client_import_id or b.idempotency_key=p_idempotency_key))
   or exists(select 1 from app_private.pos_catalog_import_retirements r where r.shop_id=p_shop_id and r.shop_device_id=p_shop_device_id
   and (r.client_import_id=p_client_import_id or r.idempotency_key=p_idempotency_key)) then
   return v_binding||jsonb_build_object('status','conflict','reason','identity_conflict');
 end if;
 -- New corrections use the article clock policy; forensic lookup and replay do
 -- not retroactively reject an original timestamp.
 if p_created_at < clock_timestamp()-interval '180 days' or p_created_at > clock_timestamp()+interval '5 minutes' then
   return jsonb_build_object('ok',false,'code','validation_failed');
 end if;
 -- Parse and validate every row before taking product locks or writing anything.
 for v_item in select value from jsonb_array_elements(p_items) loop
   v_mask:=v_item->'fieldMask';v_changes:=v_item->'changes';v_snapshot:=v_item->'baseSnapshot';
   if jsonb_typeof(v_item) is distinct from 'object'
     or jsonb_typeof(v_mask) is distinct from 'array' or jsonb_typeof(v_changes) is distinct from 'object' or jsonb_typeof(v_snapshot) is distinct from 'object'
     or coalesce(v_item->>'baseRevision','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'
     or coalesce(v_item->>'remoteProductId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or exists(select 1 from jsonb_object_keys(v_item) key where key not in('clientItemId','remoteProductId','baseRevision','baseSnapshot','fieldMask','changes')) then
     return jsonb_build_object('ok',false,'code','validation_failed');
   end if;
   if (select count(*) from jsonb_object_keys(v_snapshot))<>jsonb_array_length(v_mask)
     or exists(select 1 from jsonb_array_elements_text(v_mask) key where not v_snapshot?(case when key='quantityDelta' then 'stockQuantity' else key end))
     or exists(select 1 from jsonb_each(v_snapshot) pair where jsonb_typeof(pair.value) not in('number','null')) then
     return jsonb_build_object('ok',false,'code','validation_failed');
   end if;
   if jsonb_array_length(v_mask) not between 1 and 3
     or (select count(distinct value) from jsonb_array_elements_text(v_mask))<>jsonb_array_length(v_mask)
     or (select count(*) from jsonb_object_keys(v_changes))<>jsonb_array_length(v_mask)
     or exists(select 1 from jsonb_array_elements_text(v_mask) key where key not in('retailPrice','purchasePrice','quantityDelta') or not v_changes?key)
     or exists(select 1 from jsonb_each(v_changes) pair where jsonb_typeof(pair.value)<>'number'
       or trunc((pair.value::text)::numeric,3)<>(pair.value::text)::numeric
       or (pair.key in('retailPrice','purchasePrice') and ((pair.value::text)::numeric<0 or (pair.value::text)::numeric>999999999))
       or (pair.key='quantityDelta' and ((pair.value::text)::numeric=0 or abs((pair.value::text)::numeric)>1000000000
         or trunc((pair.value::text)::numeric,3)<>(pair.value::text)::numeric))) then
     return jsonb_build_object('ok',false,'code','validation_failed');
   end if;
   if not exists(select 1 from jsonb_array_elements(v_original->'receipt'->'remoteProductIds') mapping
     where mapping->>'clientItemId'=v_item->>'clientItemId' and mapping->>'remoteProductId'=v_item->>'remoteProductId') then
     return v_binding||jsonb_build_object('status','conflict','reason','original_mapping_mismatch');
   end if;
 end loop;
 perform 1 from public.inventory_products product where product.id::text in(select item->>'remoteProductId' from jsonb_array_elements(p_items) item)
   and (product.shop_id=p_shop_id or(product.shop_id is null and product.owner_user_id=p_owner_user_id)) order by product.id for update;
 v_auth := app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
 if v_auth<>'ok' then return jsonb_build_object('ok',false,'code',v_auth); end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
   select * into v_product from public.inventory_products where id::text=v_item->>'remoteProductId'
     and (shop_id=p_shop_id or(shop_id is null and owner_user_id=p_owner_user_id)) and deleted_at is null;
   if not found or to_char(v_product.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') is distinct from v_item->>'baseRevision' then
     return v_binding||jsonb_build_object('status','conflict','reason','revision_conflict');
   end if;
   v_snapshot:=v_item->'baseSnapshot';
   if (v_snapshot?'retailPrice' and (v_snapshot->>'retailPrice')::double precision is distinct from v_product.retail_price)
     or(v_snapshot?'purchasePrice' and (v_snapshot->>'purchasePrice')::double precision is distinct from v_product.purchase_price)
     or(v_snapshot?'stockQuantity' and (v_snapshot->>'stockQuantity')::double precision is distinct from v_product.stock_quantity) then
     return v_binding||jsonb_build_object('status','conflict','reason','revision_conflict');
   end if;
   if v_item->'changes'?'quantityDelta' and (coalesce(v_product.stock_quantity,0)::numeric+(v_item->'changes'->>'quantityDelta')::numeric<0
     or coalesce(v_product.stock_quantity,0)::numeric+(v_item->'changes'->>'quantityDelta')::numeric>999999999) then
     return v_binding||jsonb_build_object('status','conflict','reason','stock_conflict');
   end if;
 end loop;
 -- Subtransaction: any late trigger/constraint failure rolls back all products,
 -- new price histories, stock movements and the correction receipt together.
 begin
   for v_item in select value from jsonb_array_elements(p_items) order by value->>'remoteProductId' loop
     v_changes:=v_item->'changes';v_unchanged:='[]'::jsonb;
     select * into v_product from public.inventory_products where id=(v_item->>'remoteProductId')::uuid;
     if v_changes?'quantityDelta' then
       v_stock_before:=coalesce(v_product.stock_quantity,0)::numeric(12,3);
       v_stock_after:=v_stock_before+(v_changes->>'quantityDelta')::numeric;
     end if;
     for v_price_type in select value from jsonb_array_elements_text('["purchasePrice","retailPrice"]'::jsonb) loop
       if v_changes?v_price_type then
         v_value:=(v_changes->>v_price_type)::numeric;
         if v_value is distinct from (case when v_price_type='retailPrice' then v_product.retail_price else v_product.purchase_price end) then
           select candidate.effective_at into v_effective from (
             select to_char(date_trunc('second',p_created_at at time zone 'UTC')+make_interval(secs=>offset_seconds),'YYYY-MM-DD HH24:MI:SS') effective_at
             from generate_series(0,1023) offsets(offset_seconds)) candidate
           where not exists(select 1 from public.inventory_product_prices price where price.owner_user_id=p_owner_user_id and price.product_id=v_product.id
             and price.type=case when v_price_type='retailPrice' then 'RETAIL' else 'PURCHASE' end and price.effective_at=candidate.effective_at)
           order by candidate.effective_at limit 1;
           if v_effective is null then raise exception 'No price timestamp available' using errcode='23514'; end if;
           v_price_id:=gen_random_uuid();
           insert into public.inventory_product_prices(id,owner_user_id,shop_id,product_id,type,price,effective_at,source,note,created_at)
           values(v_price_id,p_owner_user_id,p_shop_id,v_product.id,case when v_price_type='retailPrice' then 'RETAIL' else 'PURCHASE' end,
             v_value::double precision,v_effective,'pos_catalog_import_correction_v1',null,v_effective);
           v_prices:=v_prices||jsonb_build_array(jsonb_build_object('clientItemId',v_item->>'clientItemId','barcode',v_product.barcode,
             'remoteProductId',v_product.id,'remotePriceId',v_price_id,'priceType',case when v_price_type='retailPrice' then 'retail' else 'purchase' end));
         else
           v_unchanged:=v_unchanged||jsonb_build_array(v_price_type);
         end if;
       end if;
     end loop;
     if (v_changes?'retailPrice' and (v_changes->>'retailPrice')::numeric is distinct from v_product.retail_price)
       or(v_changes?'purchasePrice' and (v_changes->>'purchasePrice')::numeric is distinct from v_product.purchase_price)
       or v_changes?'quantityDelta' then
       update public.inventory_products set retail_price=case when v_changes?'retailPrice' then (v_changes->>'retailPrice')::double precision else retail_price end,
         purchase_price=case when v_changes?'purchasePrice' then (v_changes->>'purchasePrice')::double precision else purchase_price end,
         stock_quantity=case when v_changes?'quantityDelta' then v_stock_after::double precision else stock_quantity end where id=v_product.id returning * into v_product;
     end if;
     if v_changes?'quantityDelta' then
       v_origin:='import-correction:'||v_correction_id::text||':'||v_product.id::text;
       insert into public.pos_sale_stock_movements(movement_key,pos_sale_id,pos_sale_line_id,shop_id,product_id,movement_kind,quantity_delta,status,issue_code,
         stock_before,stock_after,metadata_redacted,pos_article_mutation_id)
       values(v_origin,null,null,p_shop_id,v_product.id,'manual_adjustment',(v_changes->>'quantityDelta')::numeric,'applied',null,
         v_stock_before,v_stock_after,jsonb_build_object('source','pos_catalog_import_correction_v1','reason','count_correction'),v_origin);
     end if;
     v_items:=v_items||jsonb_build_array(jsonb_build_object('clientItemId',v_item->>'clientItemId','remoteProductId',v_product.id,'status','accepted','unchangedFields',v_unchanged,
       'authoritativeRevision',to_char(v_product.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
     v_products:=v_products||jsonb_build_array(jsonb_build_object('clientItemId',v_item->>'clientItemId','remoteProductId',v_product.id,'barcode',v_product.barcode,
       'authoritativeRevision',to_char(v_product.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
   end loop;
   v_auth := app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
   if v_auth<>'ok' then raise exception 'Lease expired before correction receipt' using errcode='42501'; end if;
   v_ack:=jsonb_build_object('ok',true,'batchId',v_correction_id,'status','accepted','items',v_items,'remoteProductIds',v_products,'remotePriceIds',v_prices,
     'summary',jsonb_build_object('acceptedItemCount',jsonb_array_length(p_items),'duplicateItemCount',0,'productCount',jsonb_array_length(p_items)));
   insert into app_private.pos_catalog_import_corrections(correction_id,shop_id,shop_device_id,client_import_id,idempotency_key,payload_hash,original_batch_id,ack_response)
   values(v_correction_id,p_shop_id,p_shop_device_id,p_client_import_id,p_idempotency_key,p_payload_hash,(v_original->'receipt'->>'batchId')::uuid,v_ack);
 exception
   when unique_violation or foreign_key_violation or check_violation or numeric_value_out_of_range or invalid_text_representation then
     return v_binding||jsonb_build_object('status','conflict','reason','mutation_conflict');
   when insufficient_privilege then return jsonb_build_object('ok',false,'code','auth_denied');
 end;
 return v_binding||jsonb_build_object('status','accepted','receipt',v_ack);
end;
$$;
revoke all on function public.pos_catalog_import_correct_v1(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.pos_catalog_import_correct_v1(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,timestamptz,jsonb) to service_role;

-- Cross-ledger identity fence: normal import cannot reuse a correction key.
-- Keep the previous implementation private, including its retirement check.
alter function public.pos_catalog_import_apply_v2(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz,jsonb,jsonb,jsonb) set schema app_private;
alter function app_private.pos_catalog_import_apply_v2(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz,jsonb,jsonb,jsonb) rename to pos_catalog_import_apply_pre_correction_v2;
revoke all on function app_private.pos_catalog_import_apply_pre_correction_v2(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.pos_catalog_import_apply_v2(
  p_shop_id uuid,p_shop_device_id uuid,p_staff_id uuid,p_pos_session_id uuid,p_owner_user_id uuid,
  p_client_import_id text,p_idempotency_key text,p_payload_hash text,p_schema_version text,p_source text,
  p_batch_created_at timestamptz,p_items jsonb,p_summary jsonb default '{}'::jsonb,p_metadata_redacted jsonb default '{}'::jsonb
) returns jsonb language plpgsql volatile security definer set search_path=public,app_private,pg_temp as $$
declare v_auth text;
begin
  v_auth:=app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
  if v_auth<>'ok' then return jsonb_build_object('ok',false,'code',v_auth);end if;
  perform pg_advisory_xact_lock(hashtext(p_shop_id::text||':'||p_shop_device_id::text),hashtext(p_client_import_id));
  perform pg_advisory_xact_lock(hashtext(p_shop_id::text||':'||p_shop_device_id::text),hashtext(p_idempotency_key));
  v_auth:=app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
  if v_auth<>'ok' then return jsonb_build_object('ok',false,'code',v_auth);end if;
  if exists(select 1 from app_private.pos_catalog_import_corrections c where c.shop_id=p_shop_id and c.shop_device_id=p_shop_device_id
    and(c.client_import_id=p_client_import_id or c.idempotency_key=p_idempotency_key)) then return jsonb_build_object('ok',false,'code','conflict','reason','identity_conflict');end if;
  return app_private.pos_catalog_import_apply_pre_correction_v2(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id,
    p_client_import_id,p_idempotency_key,p_payload_hash,p_schema_version,p_source,p_batch_created_at,p_items,p_summary,p_metadata_redacted);
end;
$$;
revoke all on function public.pos_catalog_import_apply_v2(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.pos_catalog_import_apply_v2(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz,jsonb,jsonb,jsonb) to service_role;
-- Receipt and retirement must not interpret a correction key as absent.
alter function app_private.pos_catalog_import_receipt_locked_v1(uuid,uuid,text,text,text,uuid)
  rename to pos_catalog_import_receipt_locked_pre_correction_v1;
create function app_private.pos_catalog_import_receipt_locked_v1(
 p_shop_id uuid,p_shop_device_id uuid,p_client_import_id text,p_idempotency_key text,p_payload_hash text,p_owner_user_id uuid
) returns jsonb language plpgsql volatile security definer set search_path=public,app_private,pg_temp as $$
declare v_correction app_private.pos_catalog_import_corrections%rowtype;
 v_binding jsonb := jsonb_build_object('ok',true,'shopId',p_shop_id,'shopDeviceId',p_shop_device_id,
   'clientImportId',p_client_import_id,'idempotencyKey',p_idempotency_key,'payloadHash',p_payload_hash);
begin
 select * into v_correction from app_private.pos_catalog_import_corrections c where c.shop_id=p_shop_id and c.shop_device_id=p_shop_device_id
   and(c.client_import_id=p_client_import_id or c.idempotency_key=p_idempotency_key);
 if found then
   if v_correction.client_import_id<>p_client_import_id or v_correction.idempotency_key<>p_idempotency_key or v_correction.payload_hash<>p_payload_hash then
     return v_binding||jsonb_build_object('status','conflict','reason','identity_conflict');
   end if;
   if v_correction.ack_response->>'ok' is distinct from 'true' or v_correction.ack_response->>'status' is distinct from 'accepted'
     or v_correction.ack_response->>'batchId' is distinct from v_correction.correction_id::text
     or jsonb_typeof(v_correction.ack_response->'items') is distinct from 'array'
     or jsonb_typeof(v_correction.ack_response->'remoteProductIds') is distinct from 'array'
     or jsonb_typeof(v_correction.ack_response->'remotePriceIds') is distinct from 'array'
     or jsonb_typeof(v_correction.ack_response->'summary') is distinct from 'object' then
     return v_binding||jsonb_build_object('status','conflict','reason','receipt_unavailable');
   end if;
   return v_binding||jsonb_build_object('status','accepted','receipt',v_correction.ack_response,
     'currentProductSnapshots',(select coalesce(jsonb_agg(jsonb_build_object(
       'clientItemId',item->>'clientItemId','remoteProductId',item->>'remoteProductId',
       'snapshotStatus',case when product.id is null then 'unavailable' else 'available' end,
       'baseRevision',case when product.id is null then null else to_char(product.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,
       'retailPrice',product.retail_price,'purchasePrice',product.purchase_price,'stockQuantity',product.stock_quantity
     ) order by item->>'clientItemId'),'[]'::jsonb)
     from jsonb_array_elements(v_correction.ack_response->'remoteProductIds') item
     left join public.inventory_products product on product.id::text=item->>'remoteProductId' and product.deleted_at is null
       and(product.shop_id=p_shop_id or(product.shop_id is null and product.owner_user_id=p_owner_user_id))));
 end if;
 return app_private.pos_catalog_import_receipt_locked_pre_correction_v1(p_shop_id,p_shop_device_id,p_client_import_id,p_idempotency_key,p_payload_hash,p_owner_user_id);
end;
$$;
revoke all on function app_private.pos_catalog_import_receipt_locked_pre_correction_v1(uuid,uuid,text,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function app_private.pos_catalog_import_receipt_locked_v1(uuid,uuid,text,text,text,uuid) from public,anon,authenticated,service_role;
commit;
