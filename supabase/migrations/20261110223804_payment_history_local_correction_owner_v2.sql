-- A local numeric row ID is provenance, never a global owner lookup.
-- The immutable root also binds the previous local batch and Apply operation.
-- This remains a private shape validator, not economic admission.

create or replace function app_private.payment_history_local_page_v2(p_raw text) returns integer
language plpgsql immutable set search_path='' as $$
declare records jsonb;item json;v jsonb;f jsonb;keys text[];n integer:=0;begin
 if p_raw is null or octet_length(p_raw) not between 2 and 262144 then raise exception using errcode='22023',message='payment_history_local_page_invalid';end if;
 records:=p_raw::jsonb;
 if jsonb_typeof(records) is distinct from 'array' or jsonb_array_length(records) not between 1 and 200 then raise exception using errcode='22023',message='payment_history_local_page_invalid';end if;
 for item in select value from json_array_elements(p_raw::json) loop
  v:=item::jsonb;f:=v->'fields';
  if octet_length(item::text)>16384 or not app_private.payment_history_local_keys_v2(v,array['kind','fields']) then raise exception using errcode='22023',message='payment_history_local_record_invalid';end if;
  keys:=case v->>'kind'
   when 'operation' then array['protocol_version','operation_id','operation_kind','shop_id','device_id','local_dataset_id','restore_epoch','restore_lineage_id','base_revision','request_fingerprint']
   when 'overlap' then array['native_start_ticks','evidence_reference']
   when 'file' then array['id','sha256','profile','source_rows']
   when 'binding' then array['alias_key','local_scope_id','local_binding_id','evidence_reference']
   when 'movement' then array['source_file_id','source_sheet','source_row','external_namespace','external_id','business_ticks','profile','alias_key','merchant_local','merchant_seller','merchant_seller_id','merchant_local_number','merchant_rut','movement_kind','transaction_state','settlement_state','gross_clp','fee_clp','fee_vat_clp','net_clp','timestamp_raw','offset_raw','offset_minutes','occurred_at_utc_ms','time_interpretation','time_policy_version','time_evidence_reference','card_subtype','payment_id','authorization_code','original_card_type','original_prepaid','terminal','settlement_date_raw']
   when 'rejected' then array['source_file_id','source_sheet','source_row','transaction_state','requested_clp']
   when 'correction' then array['source_file_id','source_sheet','source_row','previous_transaction_id','previous_local_batch_id','previous_apply_operation_id','previous_economic_digest','proposed_economic_digest','context_fingerprint','evidence_reference','approval_fingerprint']
   when 'undo' then array['batch_id','batch_revision','apply_operation_id']
   else null end;
  if keys is null or not app_private.payment_history_local_keys_v2(f,keys) or exists(
   select 1 from jsonb_each(f) e where jsonb_typeof(e.value) not in('string','null') or length(e.value#>>'{}')>2048) then raise exception using errcode='22023',message='payment_history_local_record_invalid';end if;
  if v->>'kind'='correction' and (
   exists(select 1 from unnest(array['previous_transaction_id','previous_local_batch_id','previous_apply_operation_id']) k where jsonb_typeof(f->k) is distinct from 'string')
   or coalesce(f->>'previous_transaction_id','') !~ '^[1-9][0-9]{0,18}$'
   or (f->>'previous_transaction_id')::numeric>9223372036854775807
   or length(btrim(coalesce(f->>'previous_local_batch_id',''))) not between 1 and 256
   or f->>'previous_local_batch_id' ~ '[[:cntrl:]]'
   or coalesce(f->>'previous_apply_operation_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or f->>'previous_apply_operation_id'='00000000-0000-0000-0000-000000000000') then
   raise exception using errcode='22023',message='payment_history_local_correction_owner_invalid';end if;
  n:=n+1;
 end loop;
 return n;
end;$$;
revoke all on function app_private.payment_history_local_page_v2(text) from public,anon,authenticated,service_role;
