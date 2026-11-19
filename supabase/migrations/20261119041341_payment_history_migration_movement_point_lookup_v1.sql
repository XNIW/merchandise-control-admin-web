-- Replan only the typed, run-scoped movement point lookup on each execution.
-- The observed prefix-dependent lookup work does not prove a cached-plan cause.
-- EXECUTE does not set FOUND; object is NOT NULL and the primary key admits at
-- most one row, so a missing lookup is detected by the NULL INTO result.
-- Existing worker authorization, fences, limits and all other statements stay intact.
begin;

create or replace function public.payment_history_migration_worker_v1(p_operation text,p_payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare j public.payment_history_migration_runs;u public.payment_history_uploads;item jsonb;raw jsonb;t jsonb;e jsonb;m jsonb;part jsonb;fact record;v_count integer;v_table text;v_id text;v_manifest_sha text;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception using errcode='42501',message='payment_history_worker_denied';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>8388608 then raise exception using errcode='22023',message='payment_history_payload_invalid';end if;
 if p_operation='claim' then
  update public.payment_history_migration_runs set state='failed',error_code='history_attempts_exhausted',lease_token=null,lease_expires_at=null where state='analysing' and lease_expires_at<clock_timestamp() and attempts>=3;
  select * into j from public.payment_history_migration_runs where (state='queued' or (state='analysing' and lease_expires_at<clock_timestamp())) and attempts<3 order by created_at,run_id limit 1 for update skip locked;
  if not found then return jsonb_build_object('ok',true,'run',null);end if;
  if not app_private.payment_history_migration_actor_current_v1(j) then update public.payment_history_migration_runs set state='failed',error_code='history_actor_revoked' where run_id=j.run_id;return jsonb_build_object('ok',true,'run',null);end if;
  delete from public.payment_history_migration_objects where run_id=j.run_id;delete from public.payment_history_migration_movements where run_id=j.run_id;
  update public.payment_history_migration_runs set state='analysing',attempts=attempts+1,attempt_started_at=clock_timestamp(),lease_token=gen_random_uuid(),lease_fence=lease_fence+1,
   lease_expires_at=clock_timestamp()+interval '120 seconds',processed_objects=0,processed_movements=0,manifest=null,analysis_digest=null,summary=null,updated_at=clock_timestamp() where run_id=j.run_id returning * into j;
  select * into u from public.payment_history_uploads where shop_id=j.shop_id and upload_id=j.source_upload_id and state='verified';
  if not found then raise exception using errcode='22023',message='payment_history_sources_unverified';end if;
  return jsonb_build_object('ok',true,'run',jsonb_build_object('run_id',j.run_id,'shop_id',j.shop_id,'lease_token',j.lease_token,'lease_fence',j.lease_fence::text,
   'export_version',case when j.source_mode='local_baseline_v2' then 'history-local-export-v2' else 'history-local-export-v1' end,'upload',jsonb_build_object('upload_id',u.upload_id,'object_key',u.object_key,'file_name',u.file_name,'file_sha256',u.file_sha256,'byte_length',u.byte_length::text)));
 end if;
 select * into j from public.payment_history_migration_runs where run_id=(p_payload->>'run_id')::uuid for update;
 if not found or j.state<>'analysing' or j.lease_token is distinct from (p_payload->>'lease_token')::uuid or j.lease_fence is distinct from (p_payload->>'lease_fence')::bigint
  or j.lease_expires_at<=clock_timestamp() or j.attempt_started_at<clock_timestamp()-interval '30 minutes' then raise exception using errcode='40001',message='payment_history_worker_fence_stale';end if;
 if not app_private.payment_history_migration_actor_current_v1(j) then raise exception using errcode='42501',message='payment_history_actor_revoked';end if;
 if p_operation='stage_objects' then
  if jsonb_typeof(p_payload->'rows') is distinct from 'array' or jsonb_array_length(p_payload->'rows') not between 1 and 200 then raise exception using errcode='22023',message='payment_history_chunk_limit';end if;
  v_count:=j.processed_objects;
  for item in select value from jsonb_array_elements(p_payload->'rows') loop
   v_count:=v_count+1;v_table:=item->>'table';raw:=(item->>'line')::jsonb;
   if v_count>400000 or (item->>'ordinal')::integer is distinct from v_count or v_table is null or v_table not in ('scopes','bindings','operations','batches','files','movements','observations') or jsonb_typeof(raw) is distinct from 'object'
    or exists(select 1 from jsonb_each(raw) pair where jsonb_typeof(pair.value) not in ('string','null')) then raise exception using errcode='22023',message='payment_history_local_object_invalid';end if;
   v_id:=case when v_table='operations' then raw->>'operation_id' else raw->>'id' end;
   if length(coalesce(v_id,'')) not between 1 and 256 or (raw ? 'shop_id' and raw->>'shop_id' is distinct from j.shop_id::text) then raise exception using errcode='22023',message='payment_history_local_scope_mismatch';end if;
   insert into public.payment_history_migration_objects(shop_id,run_id,table_name,local_id,source_ordinal,original_line,object,object_digest)
    values(j.shop_id,j.run_id,v_table,v_id,(item->>'sourceOrdinal')::integer,item->>'line',raw,encode(extensions.digest(convert_to(raw::text,'UTF8'),'sha256'),'hex'));
  end loop;
  update public.payment_history_migration_runs set processed_objects=v_count,lease_expires_at=clock_timestamp()+interval '120 seconds',updated_at=clock_timestamp() where run_id=j.run_id;
 elsif p_operation='stage_movements' then
  if jsonb_typeof(p_payload->'rows') is distinct from 'array' or jsonb_array_length(p_payload->'rows') not between 1 and 200 then raise exception using errcode='22023',message='payment_history_chunk_limit';end if;
  v_count:=j.processed_movements;
  for item in select value from jsonb_array_elements(p_payload->'rows') loop
   v_count:=v_count+1;v_id:=item->>'localId';t:=item->'transaction';e:=app_private.payment_history_economics_v1(t);
   execute 'select object from public.payment_history_migration_objects where run_id=$1 and table_name=''movements'' and local_id=$2' into raw using j.run_id,v_id;
   if raw is null or v_count>100000 or (item->>'ordinal')::integer is distinct from v_count or coalesce(v_id,'') !~ '^[1-9][0-9]{0,18}$'
    or t->>'parserVersion' is distinct from 'history-local-ledger-v1' or e->>'businessTicks' is distinct from raw->>'business_ticks' or e->>'grossClp' is distinct from raw->>'signed_amount_clp'
    or e->>'commissionClp' is distinct from raw->>'signed_fee_clp' or e->>'commissionVatClp' is distinct from raw->>'signed_fee_vat_clp' or e->>'netClp' is distinct from raw->>'signed_net_clp'
    or t->>'externalNamespace' is distinct from raw->>'external_namespace' or t->>'externalId' is distinct from raw->>'external_id' or t->>'movementKind' is distinct from raw->>'movement_kind'
    or t#>>'{timestamp,rawTimestamp}' is distinct from raw->>'timestamp_raw' or t#>>'{timestamp,offsetMinutes}' is distinct from raw->>'offset_minutes'
    or t->>'cardSubtype' is distinct from raw->>'card_subtype' or t->>'settlementStatus' is distinct from coalesce(raw->>'settlement_state','') or t->>'sourceTransactionStatus' is distinct from raw->>'state'
    or t#>>'{source,sheetName}' is distinct from raw->>'source_sheet' or t#>>'{source,rowNumber}' is distinct from raw->>'source_row'
    or raw->>'original_cashier_id' is not null or t->>'originalCashierId' is not null
    or item->>'localBatchId' is distinct from raw->>'batch_id' or item->>'localScopeId' is distinct from raw->>'merchant_scope_id' or item->>'localBindingId' is distinct from raw->>'binding_id' or item->>'localFileId' is distinct from raw->>'file_id'
    or coalesce((item->>'active')::boolean,false) is distinct from ((raw->>'is_active')='1') or jsonb_typeof(item->'active') is distinct from 'boolean'
    or item->>'supersedesLocalId' is distinct from raw->>'supersedes_id' then raise exception using errcode='22023',message='payment_history_local_movement_mismatch';end if;
   if not exists(select 1 from public.payment_history_migration_objects x where x.run_id=j.run_id and x.table_name='bindings' and x.local_id=raw->>'binding_id' and x.object->>'scope_id'=raw->>'merchant_scope_id' and x.object->>'alias_key'=item->>'aliasKey') then raise exception using errcode='22023',message='payment_history_local_binding_mismatch';end if;
   if not exists(select 1 from public.payment_history_migration_objects f where f.run_id=j.run_id and f.table_name='files' and f.local_id=raw->>'file_id'
     and f.object->>'batch_id'=raw->>'batch_id' and f.object->>'profile'=t->>'profile' and f.object->>'source_sha256'=t#>>'{source,fileSha256}'
     and e->>'transactionState'=case when f.object->>'profile'='GetnetLegacy' then 'ABONADO' else 'CONFIRMADA' end) then raise exception using errcode='22023',message='payment_history_local_file_mismatch';end if;
   insert into public.payment_history_migration_movements(shop_id,run_id,local_id,local_batch_id,local_scope_id,local_binding_id,local_file_id,alias_key,active,supersedes_local_id,transaction,economics,economic_digest)
    values(j.shop_id,j.run_id,v_id,item->>'localBatchId',item->>'localScopeId',item->>'localBindingId',item->>'localFileId',item->>'aliasKey',(item->>'active')::boolean,item->>'supersedesLocalId',t,e,app_private.payment_history_economic_digest_v1(e));
  end loop;
  update public.payment_history_migration_runs set processed_movements=v_count,lease_expires_at=clock_timestamp()+interval '120 seconds',updated_at=clock_timestamp() where run_id=j.run_id;
 elsif p_operation='heartbeat' then
  update public.payment_history_migration_runs set lease_expires_at=clock_timestamp()+interval '120 seconds',updated_at=clock_timestamp() where run_id=j.run_id;
 elsif p_operation='finish' then
  if coalesce(p_payload->>'analysis_digest','') !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_payload->'raw_manifest') is distinct from 'string' or octet_length(p_payload->>'raw_manifest')>65536 then raise exception using errcode='22023',message='payment_history_local_manifest_invalid';end if;
  m:=(p_payload->>'raw_manifest')::jsonb;v_manifest_sha:=encode(extensions.digest(convert_to(p_payload->>'raw_manifest','UTF8'),'sha256'),'hex');
  if jsonb_typeof(m)<>'object' or m->>'schemaVersion' is distinct from (case when j.source_mode='local_baseline_v2' then 'history-local-export-v2' else 'history-local-export-v1' end) or m->>'evidenceLevel' is distinct from 'legacy_attested' or m->>'shopId' is distinct from j.shop_id::text
   or not exists(select 1 from public.shop_devices d where d.shop_id=j.shop_id and d.shop_device_id=(m->>'deviceId')::uuid)
   or length(coalesce(m->>'localDatasetId','')) not between 1 and 256 or coalesce(m->>'dataRevision','') !~ '^(0|[1-9][0-9]{0,18})$' or coalesce(m->>'restoreEpoch','') !~ '^(0|[1-9][0-9]{0,18})$'
   or coalesce(m->>'backupSha256','') !~ '^[0-9a-f]{64}$' or jsonb_typeof(m->'entries') is distinct from 'array' or jsonb_array_length(m->'entries')<>7
   or (select count(distinct x->>'name') from jsonb_array_elements(m->'entries') x)<>7
   or (select count(*) from public.payment_history_migration_objects where run_id=j.run_id and table_name='movements') is distinct from j.processed_movements::bigint then raise exception using errcode='22023',message='payment_history_local_manifest_invalid';end if;
  if j.source_mode='local_baseline_v2' and row(m->>'deviceId',m->>'localDatasetId',m->>'dataRevision',m->>'restoreEpoch',m->>'restoreLineageId')
   is distinct from row(j.source_context->>'device_id',j.source_context->>'local_dataset_id',j.source_context->>'data_revision',j.source_context->>'restore_epoch',j.source_context->>'restore_lineage_id') then
   raise exception using errcode='22023',message='payment_history_local_baseline_scope_mismatch';end if;
  for part in select value from jsonb_array_elements(m->'entries') loop
   v_table:=replace(part->>'name','.ndjson','');
   if v_table is null or v_table not in ('scopes','bindings','operations','batches','files','movements','observations') or part->>'name' is distinct from v_table||'.ndjson'
    or coalesce(part->>'sha256','') !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='payment_history_local_manifest_invalid';end if;
   select count(*) row_count,coalesce(max(source_ordinal),0) last_ordinal,coalesce(sum(octet_length(original_line)+1),0) bytes,
    encode(extensions.digest(convert_to(coalesce(string_agg(original_line||chr(10),'' order by source_ordinal),''),'UTF8'),'sha256'),'hex') hash into fact
    from public.payment_history_migration_objects where run_id=j.run_id and table_name=v_table;
   if fact.row_count::text is distinct from part->>'rows' or fact.row_count<>fact.last_ordinal or fact.bytes::text is distinct from part->>'byteLength' or fact.hash is distinct from part->>'sha256'
    or fact.row_count>(case when v_table='movements' then 100000 when v_table='observations' then 200000 else 10000 end) then raise exception using errcode='22023',message='payment_history_local_entry_checksum_mismatch';end if;
  end loop;
  if exists(select 1 from public.payment_history_migration_objects where run_id=j.run_id and (object ? 'dataset_id') and object->>'dataset_id' is distinct from m->>'localDatasetId') then raise exception using errcode='22023',message='payment_history_local_scope_mismatch';end if;
  select jsonb_build_object('movements',count(*),'active',count(*) filter(where active),'batches',(select count(*) from public.payment_history_migration_objects where run_id=j.run_id and table_name='batches'),
   'originalOperations',(select count(*) from public.payment_history_migration_objects where run_id=j.run_id and table_name='operations'),
   'activeGrossClp',coalesce(sum((economics->>'grossClp')::numeric) filter(where active),0)::bigint::text,'knownActiveNetClp',coalesce(sum((economics->>'netClp')::numeric) filter(where active),0)::bigint::text,
   'knownActiveNetCount',count(*) filter(where active and economics->>'netClp' is not null)) into raw from public.payment_history_migration_movements where run_id=j.run_id;
  update public.payment_history_migration_runs set state='review_ready',manifest=m,manifest_sha256=v_manifest_sha,summary=raw,analysis_digest=p_payload->>'analysis_digest',lease_token=null,lease_expires_at=null,updated_at=clock_timestamp() where run_id=j.run_id;
 elsif p_operation='fail' then
  if coalesce(p_payload->>'code','') !~ '^(history|getnet)_[a-z_]{1,90}$' then raise exception using errcode='22023',message='payment_history_error_code_invalid';end if;
  update public.payment_history_migration_runs set state='failed',error_code=p_payload->>'code',lease_token=null,lease_expires_at=null,updated_at=clock_timestamp() where run_id=j.run_id;
 else raise exception using errcode='22023',message='payment_history_worker_operation_invalid';end if;
 return jsonb_build_object('ok',true);
end;$$;

commit;
