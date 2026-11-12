-- Same archive parser/ingest, with a server-selected local baseline admission.
-- Device v2 RPC remains private until authorization and delivery are complete.
alter table public.payment_history_migration_runs
 add column source_mode text not null default 'frozen_archive_v1'
  check(source_mode in('frozen_archive_v1','local_baseline_v2')),
 add column source_context jsonb,
 add constraint payment_history_migration_source_context check(
  (source_mode='frozen_archive_v1' and source_context is null)
  or (source_mode='local_baseline_v2' and actor_kind='pos_staff_manager' and source_context is not null
   and app_private.payment_history_local_keys_v2(source_context,array['device_id','local_dataset_id','data_revision','restore_epoch','restore_lineage_id','writer_epoch'])));

create function app_private.payment_history_migration_source_immutable_v2() returns trigger
language plpgsql set search_path='' as $$begin
 if row(new.source_mode,new.source_context) is distinct from row(old.source_mode,old.source_context) then
  raise exception using errcode='55000',message='payment_history_migration_source_immutable';end if;
 return new;
end;$$;
revoke all on function app_private.payment_history_migration_source_immutable_v2() from public,anon,authenticated,service_role;
create trigger payment_history_migration_source_immutable before update on public.payment_history_migration_runs
 for each row execute function app_private.payment_history_migration_source_immutable_v2();

create function app_private.payment_history_local_device_actor_v2(p_shop uuid,p_device uuid,p_staff uuid,p_session uuid,
 p_device_hash text,p_session_hash text,p_version integer,p_capability text) returns jsonb
language plpgsql volatile set search_path='' as $$
declare v_role text;deadline timestamptz;begin
 if coalesce(auth.role(),'')<>'service_role' or p_capability is null or p_capability not in('migrate','import','cancel','read')
  or p_version is null or p_version<1 or not app_private.pos_runtime_lease_is_valid_v1(p_shop,p_device,p_staff,p_session)
  or not exists(select 1 from public.pos_sessions se join public.pos_device_credentials cr on cr.pos_device_credential_id=se.pos_device_credential_id
   where se.shop_id=p_shop and se.shop_device_id=p_device and se.staff_id=p_staff and se.pos_session_id=p_session
    and se.staff_credential_version=p_version and se.session_token_hash=p_session_hash and cr.token_hash=p_device_hash) then
  raise exception using errcode='42501',message='payment_history_device_denied';end if;
 select role_key into v_role from public.staff_accounts where shop_id=p_shop and staff_id=p_staff;
 perform pg_advisory_xact_lock_shared(hashtextextended('payment-history-role:'||p_shop::text||':'||v_role,0));
 perform 1 from public.payment_history_role_permissions where shop_id=p_shop and role_key=v_role for share;
 perform 1 from public.staff_role_permissions where shop_id=p_shop and role_key=v_role and permission_key='shop_admin.full_access' for share;
 if not app_private.payment_history_staff_can_v1(p_shop,p_staff,p_capability) then
  raise exception using errcode='42501',message='payment_history_device_denied';end if;
 select least(se.expires_at,cr.expires_at,a.credential_expires_at,clock_timestamp()+interval '60 seconds') into deadline
  from public.pos_sessions se join public.pos_device_credentials cr on cr.pos_device_credential_id=se.pos_device_credential_id
  join public.staff_accounts a on a.shop_id=se.shop_id and a.staff_id=se.staff_id where se.pos_session_id=p_session;
 if deadline is null or deadline<=clock_timestamp() then raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 perform set_config('app.payment_history_publish_deadline',deadline::text,true);
 return jsonb_build_object('kind','pos_staff_manager','id',p_staff,'session_id',p_session,'credential_version',p_version);
end;$$;
revoke all on function app_private.payment_history_local_device_actor_v2(uuid,uuid,uuid,uuid,text,text,integer,text)
 from public,anon,authenticated,service_role;

-- GENERATED COMMON ENGINE START: exact v1 bodies, narrow mode/actor changes.
create or replace function app_private.payment_history_migration_actor_current_v1(j public.payment_history_migration_runs) returns boolean
language sql volatile security definer set search_path='' as $$
 select case when j.source_mode='local_baseline_v2' then
  app_private.pos_runtime_lease_is_valid_v1(j.shop_id,(j.source_context->>'device_id')::uuid,j.actor_id,j.actor_session_id)
  and exists(select 1 from public.pos_sessions s where s.pos_session_id=j.actor_session_id and s.staff_credential_version=j.actor_credential_version)
  and app_private.payment_history_staff_can_v1(j.shop_id,j.actor_id,'migrate')
 when j.actor_kind='pos_staff_manager'  then exists(select 1 from public.staff_web_sessions s where s.shop_id=j.shop_id and s.staff_id=j.actor_id and s.staff_web_session_id=j.actor_session_id
  and app_private.staff_web_runtime_lease_is_valid_v1(j.shop_id,j.actor_id,j.actor_session_id,s.session_token_hash,j.actor_credential_version,null)
  and app_private.payment_history_staff_can_v1(j.shop_id,j.actor_id,'migrate')) else exists(
 select 1 from auth.sessions s join public.shop_members m on m.profile_id=s.user_id and m.shop_id=j.shop_id join public.profiles p on p.profile_id=m.profile_id
 join public.shops sh on sh.shop_id=m.shop_id where s.id=j.actor_session_id and s.user_id=j.actor_id and (s.not_after is null or s.not_after>clock_timestamp())
 and m.membership_status='active' and p.profile_status='active' and p.disabled_at is null and sh.shop_status='active'
 and (m.role_key='shop_owner' or (m.role_key='shop_manager' and exists(select 1 from public.payment_history_role_permissions g where g.shop_id=j.shop_id and g.role_key=m.role_key and g.capability='migrate' and g.enabled)))) end;
$$;

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
   select object into raw from public.payment_history_migration_objects where run_id=j.run_id and table_name='movements' and local_id=v_id;
   if not found or v_count>100000 or (item->>'ordinal')::integer is distinct from v_count or coalesce(v_id,'') !~ '^[1-9][0-9]{0,18}$'
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

create or replace function app_private.payment_history_migration_review_rows_v1(p_run uuid)
returns table(local_id text,merchant_id uuid,identity_key text,existing_version_id uuid,decision text,code text)
language sql volatile security definer set search_path='' as $$
 with run as materialized(select j.*,u.file_sha256 archive_sha256 from public.payment_history_migration_runs j join public.payment_history_uploads u on u.shop_id=j.shop_id and u.upload_id=j.source_upload_id where j.run_id=p_run),
 assignments as materialized(select x.* from run j,jsonb_to_recordset(coalesce(j.configuration->'bindings','[]')) x(local_scope_id text,merchant_id uuid,evidence_id uuid)),
 base as materialized(select s.*,coalesce(a.merchant_id,la.merchant_id) canonical_merchant,e.status proof_status,e.verification_level proof_level,e.scope proof_scope,j.manifest,j.archive_sha256,j.source_mode,
  encode(extensions.digest(convert_to(s.shop_id::text||chr(31)||'getnet'||chr(31)||coalesce(a.merchant_id,la.merchant_id)::text||chr(31)||(s.transaction->>'externalNamespace')||chr(31)||(s.transaction->>'externalId'),'UTF8'),'sha256'),'hex') global_key,
  encode(extensions.digest(convert_to((o.object-'is_active')::text,'UTF8'),'sha256'),'hex') source_fact_digest,
  count(*) filter(where s.active) over(partition by coalesce(a.merchant_id,la.merchant_id),s.transaction->>'externalNamespace',s.transaction->>'externalId' order by s.local_id::bigint rows unbounded preceding) active_ordinal
  from public.payment_history_migration_movements s join run j on j.run_id=s.run_id
  join public.payment_history_migration_objects o on o.run_id=s.run_id and o.table_name='movements' and o.local_id=s.local_id
  left join assignments a on a.local_scope_id=s.local_scope_id and j.source_mode='frozen_archive_v1'
  left join public.payment_history_merchant_aliases la on j.source_mode='local_baseline_v2' and la.shop_id=s.shop_id and la.alias_key=s.alias_key and la.active
  left join public.payment_history_evidence e on e.shop_id=s.shop_id and e.evidence_id=coalesce(a.evidence_id,la.evidence_id) and e.kind=case when j.source_mode='local_baseline_v2' then 'merchant_mapping' else 'migration_reconcile' end
 ),collisions as materialized(select b.global_key from base b where b.active and b.global_key is not null group by b.global_key having
  count(distinct b.economics->>'businessTicks')>1 or count(distinct b.economics->>'grossClp')>1 or count(distinct b.economics->>'movementKind')>1 or count(distinct b.economics->>'transactionState')>1
  or count(distinct b.economics->>'commissionClp')>1 or count(distinct b.economics->>'commissionVatClp')>1 or count(distinct b.economics->>'netClp')>1),
 classified as(select b.local_id,b.canonical_merchant,b.global_key,coalesce(mapped.movement_version_id,active.movement_version_id) existing_id,
  case
   when b.canonical_merchant is null or b.proof_status is distinct from 'verified' or (b.source_mode='frozen_archive_v1' and b.proof_level is distinct from 'operator_attested')
    or (b.source_mode='local_baseline_v2' and (b.proof_level is null or b.proof_level='unverified'))
    or b.source_mode='local_baseline_v2' and (b.proof_scope->>'merchant_id' is distinct from b.canonical_merchant::text or b.proof_scope->>'alias_key' is distinct from b.alias_key)
    or b.source_mode='frozen_archive_v1' and (b.proof_scope->>'run_id' is distinct from p_run::text or b.proof_scope->>'local_scope_id' is distinct from b.local_scope_id
    or b.proof_scope->>'merchant_id' is distinct from b.canonical_merchant::text or b.proof_scope->>'archive_sha256' is distinct from b.archive_sha256) then 'history_migration_mapping_unverified'
   when not exists(select 1 from public.payment_history_merchants m where m.shop_id=b.shop_id and m.merchant_id=b.canonical_merchant) then 'history_migration_mapping_unverified'
   when batch_map.batch_id is not null and batch_map.source_object_digest is distinct from batch_object.object_digest then 'history_migration_source_state_changed'
   when mapped.movement_version_id is not null and (mapped.source_economic_digest<>b.economic_digest or mapped.source_fact_digest<>b.source_fact_digest or mapped_version.identity_key is distinct from b.global_key) then 'history_migration_source_identity_changed'
   when mapped.movement_version_id is not null then 'history_migration_duplicate'
   when not b.active then 'history_migration_new_inactive'
   when exists(select 1 from public.pos_sales n where n.shop_id=b.shop_id and n.status='accepted' and n.business_date<=(b.transaction#>>'{timestamp,businessDateTime}')::date) then 'history_native_overlap'
   when collision.global_key is not null or (active.movement_version_id is not null and app_private.payment_history_conflict_v1(b.economics,app_private.payment_history_economics_v1(active.transaction))) then 'history_active_economics_conflict'
   when active.movement_version_id is not null then 'history_migration_duplicate'
   when b.active_ordinal>1 then 'history_migration_duplicate_incoming'
   when exists(select 1 from public.payment_history_movement_versions old where old.shop_id=b.shop_id and old.identity_key=b.global_key) then 'history_migration_inactive_identity_review_required'
   else 'history_migration_new_active' end reason
  from base b
  left join collisions collision on collision.global_key=b.global_key
  left join public.payment_history_local_movement_map mapped on mapped.shop_id=b.shop_id and mapped.shop_device_id=(b.manifest->>'deviceId')::uuid and mapped.local_dataset_id=b.manifest->>'localDatasetId' and mapped.local_movement_id=b.local_id
  left join public.payment_history_movement_versions mapped_version on mapped_version.shop_id=mapped.shop_id and mapped_version.movement_version_id=mapped.movement_version_id
  left join public.payment_history_movement_versions active on active.shop_id=b.shop_id and active.identity_key=b.global_key and active.active
  join public.payment_history_migration_objects batch_object on batch_object.run_id=b.run_id and batch_object.table_name='batches' and batch_object.local_id=b.local_batch_id
  left join public.payment_history_local_batch_map batch_map on batch_map.shop_id=b.shop_id and batch_map.shop_device_id=(b.manifest->>'deviceId')::uuid and batch_map.local_dataset_id=b.manifest->>'localDatasetId' and batch_map.local_batch_id=b.local_batch_id
 ) select c.local_id,c.canonical_merchant,c.global_key,c.existing_id,
  case c.reason when 'history_migration_new_active' then 'new_active' when 'history_migration_new_inactive' then 'new_inactive' when 'history_migration_duplicate' then 'duplicate' when 'history_migration_duplicate_incoming' then 'duplicate_incoming'
   when 'history_active_economics_conflict' then 'conflict' when 'history_migration_source_identity_changed' then 'conflict' else 'blocked' end,c.reason from classified c;
$$;

create or replace function app_private.payment_history_migration_review_v1(p_run uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
 with decisions as materialized(select * from app_private.payment_history_migration_review_rows_v1(p_run)),
 facts as(select count(*) total,count(*) filter(where decision='new_active') new_active,count(*) filter(where decision='new_inactive') new_inactive,
  count(*) filter(where decision in ('duplicate','duplicate_incoming')) duplicates,count(*) filter(where decision='conflict') conflicts,count(*) filter(where d.decision='blocked') blocked,
  coalesce(sum((m.economics->>'grossClp')::numeric) filter(where d.decision='new_active'),0)::bigint::text new_active_gross_clp,
  coalesce(sum((m.economics->>'netClp')::numeric) filter(where d.decision='new_active'),0)::bigint::text known_new_active_net_clp,
  count(*) filter(where d.decision='new_active' and m.economics->>'netClp' is not null) known_new_active_net_count
  from decisions d join public.payment_history_migration_movements m on m.run_id=p_run and m.local_id=d.local_id),
 context as(select j.*,r.dataset_id,r.revision,r.writer_epoch,r.writer_authority,u.file_sha256 archive_sha256,
  (j.source_mode='frozen_archive_v1' and r.writer_authority='frozen' and exists(select 1 from public.payment_history_freeze_acks a where a.shop_id=j.shop_id and a.shop_device_id=(j.manifest->>'deviceId')::uuid and a.writer_epoch=r.writer_epoch
    and a.local_dataset_id=j.manifest->>'localDatasetId' and a.data_revision=(j.manifest->>'dataRevision')::bigint and a.restore_epoch=(j.manifest->>'restoreEpoch')::bigint
    and a.archive_sha256=u.file_sha256 and a.manifest_sha256=j.manifest_sha256 and a.backup_sha256=j.manifest->>'backupSha256'
    and a.local_writes_drained and a.native_outbox_drained
    and not exists(select 1 from public.payment_history_local_write_grants g where g.shop_id=j.shop_id and g.shop_device_id=a.shop_device_id and g.expires_at>a.acknowledged_at))) freeze_verified,
  (j.source_mode='local_baseline_v2' and r.writer_authority='local' and r.writer_epoch::text=j.source_context->>'writer_epoch'
   and app_private.payment_history_migration_actor_current_v1(j)
   and row(j.manifest->>'deviceId',j.manifest->>'localDatasetId',j.manifest->>'dataRevision',j.manifest->>'restoreEpoch',j.manifest->>'restoreLineageId')
    is not distinct from row(j.source_context->>'device_id',j.source_context->>'local_dataset_id',j.source_context->>'data_revision',j.source_context->>'restore_epoch',j.source_context->>'restore_lineage_id')
   and not exists(select 1 from public.payment_history_local_write_grants g where g.shop_id=j.shop_id and g.shop_device_id=(j.source_context->>'device_id')::uuid)
   and not exists(select 1 from public.payment_history_local_writer_contexts c where c.shop_id=j.shop_id and c.shop_device_id=(j.source_context->>'device_id')::uuid)
   and not exists(select 1 from public.payment_history_local_publications p where p.shop_id=j.shop_id and p.shop_device_id=(j.source_context->>'device_id')::uuid and p.state in('preparing','authorized','reconcile_required'))) baseline_verified
  from public.payment_history_migration_runs j join public.payment_history_runtime r using(shop_id) join public.payment_history_uploads u on u.shop_id=j.shop_id and u.upload_id=j.source_upload_id and u.state='verified' where j.run_id=p_run)
 select jsonb_build_object('run_id',j.run_id,'dataset_id',j.dataset_id,'revision',j.revision::text,'writer_epoch',j.writer_epoch::text,'source',j.summary,'summary',to_jsonb(f),'freeze_verified',j.freeze_verified,
  'can_apply',(j.freeze_verified or j.baseline_verified) and f.conflicts=0 and f.blocked=0 and f.total=j.processed_movements,
  'reasons',coalesce((select jsonb_agg(x.code) from(select distinct code from decisions where decision in ('blocked','conflict') order by code limit 20)x),'[]'),
  'review_digest',encode(extensions.digest(convert_to(jsonb_build_object('run',j.run_id,'analysis',j.analysis_digest,'source_archive',j.archive_sha256,'manifest_sha256',j.manifest_sha256,'configuration',j.configuration,
    'actor',jsonb_build_object('kind',j.actor_kind,'id',j.actor_id,'session',j.actor_session_id,'version',j.actor_credential_version),
    'dataset',j.dataset_id,'revision',j.revision::text,'epoch',j.writer_epoch::text,'authority',j.writer_authority,'freeze_verified',j.freeze_verified,'baseline_verified',j.baseline_verified,'source_mode',j.source_mode,'source_context',j.source_context,'facts',to_jsonb(f),
    'decisions',(select encode(extensions.digest(convert_to(coalesce(string_agg(local_id||':'||coalesce(merchant_id::text,'')||':'||coalesce(identity_key,'')||':'||coalesce(existing_version_id::text,'')||':'||code,'|' order by local_id::bigint),''),'UTF8'),'sha256'),'hex') from decisions))::text,'UTF8'),'sha256'),'hex'))
 ||case when j.source_mode='local_baseline_v2' then jsonb_build_object('baseline_verified',j.baseline_verified) else '{}'::jsonb end
 from context j cross join facts f;
$$;

create function app_private.payment_history_migration_request_engine_v2(p_shop_id uuid,p_operation text,p_payload jsonb,
 p_staff_id uuid,p_staff_web_session_id uuid,p_session_token_hash text,p_credential_version integer,
 p_actor jsonb,p_mode text,p_context jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare a jsonb;result jsonb;digest text;req uuid;j public.payment_history_migration_runs;r public.payment_history_runtime;u public.payment_history_uploads;
 e public.payment_history_evidence;scope_row public.payment_history_migration_objects;binding record;source_batch record;row record;
 canonical uuid;proof uuid;alias_proof uuid;global_batch uuid;global_operation uuid;global_version uuid;previous_version uuid;snapshot uuid;main_operation uuid;
 v_revision bigint;new_active integer:=0;new_inactive integer:=0;duplicates integer:=0;new_batches integer:=0;review jsonb;batch_receipt jsonb;v_id uuid;
begin
 if p_operation not in ('upload_create','upload_ready','upload_status','start','status','resume','cancel','mapping','review','apply','receipt')
  or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>65536 then raise exception using errcode='22023',message='payment_history_operation_invalid';end if;
 if p_mode is null or p_mode not in('frozen_archive_v1','local_baseline_v2')
  or p_mode='frozen_archive_v1' and (p_actor is not null or p_context is not null)
  or p_mode='local_baseline_v2' and (p_actor is null or p_actor->>'kind' is distinct from 'pos_staff_manager' or p_context is null or p_operation='mapping') then
  raise exception using errcode='22023',message='payment_history_source_mode_invalid';end if;
 if p_mode='frozen_archive_v1' then
  a:=app_private.payment_history_demand_actor_v1(p_shop_id,'migrate',p_staff_id,p_staff_web_session_id,p_session_token_hash,p_credential_version);
 else a:=p_actor;end if;
 digest:=encode(extensions.digest(convert_to(jsonb_build_object('operation',p_operation,'payload',p_payload)::text,'UTF8'),'sha256'),'hex');
 if p_mode='local_baseline_v2' then digest:=encode(extensions.digest(convert_to(jsonb_build_object('operation',p_operation,'payload',p_payload,'source_mode',p_mode,'source_context',p_context)::text,'UTF8'),'sha256'),'hex');end if;
 if p_operation='upload_create' then
  if coalesce(p_payload->>'sha256','') !~ '^[0-9a-f]{64}$' or coalesce(p_payload->>'file_name','') !~* '\.w7history\.zip$' or length(p_payload->>'file_name')>256
   or (p_payload->>'byte_length')::bigint not between 1 and 20971520 then raise exception using errcode='22023',message='payment_history_upload_invalid';end if;
  if (select count(*) from public.payment_history_uploads where shop_id=p_shop_id and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid and state='pending' and created_at>clock_timestamp()-interval '1 hour')>=20 then raise exception using errcode='54000',message='payment_history_upload_backpressure';end if;
  v_id:=gen_random_uuid();insert into public.payment_history_uploads(upload_id,shop_id,actor_kind,actor_id,object_key,file_name,file_sha256,byte_length)
   values(v_id,p_shop_id,a->>'kind',(a->>'id')::uuid,'history/'||p_shop_id::text||'/'||v_id::text,p_payload->>'file_name',p_payload->>'sha256',(p_payload->>'byte_length')::bigint) returning * into u;
  result:=jsonb_build_object('upload_id',u.upload_id,'object_key',u.object_key);
 elsif p_operation in ('upload_ready','upload_status') then
  select * into u from public.payment_history_uploads where shop_id=p_shop_id and upload_id=(p_payload->>'upload_id')::uuid and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid for update;
  if not found then raise exception using errcode='42501',message='payment_history_upload_actor_mismatch';end if;
  if p_operation='upload_ready' and u.state='pending' then update public.payment_history_uploads set state='uploaded' where upload_id=u.upload_id;u.state:='uploaded';end if;
  result:=jsonb_build_object('upload_id',u.upload_id,'state',u.state,'file_name',u.file_name,'sha256',u.file_sha256,'byte_length',u.byte_length::text);
 elsif p_operation='start' then
  req:=(p_payload->>'request_key')::uuid;if req is null then raise exception using errcode='22023',message='payment_history_request_key_required';end if;
  select * into j from public.payment_history_migration_runs where shop_id=p_shop_id and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid and request_key=req;
  if found then
   if j.request_digest<>digest or j.source_mode<>p_mode or j.source_context is distinct from p_context then raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
  else
   select * into u from public.payment_history_uploads where shop_id=p_shop_id and upload_id=(p_payload->>'upload_id')::uuid and state='verified' and file_name ~* '\.w7history\.zip$'
    and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid for share;
   if not found then raise exception using errcode='22023',message='payment_history_sources_unverified';end if;
   perform pg_advisory_xact_lock(hashtextextended('payment-history-queue:'||p_shop_id::text,0));
   if (select count(*) from public.payment_history_migration_runs where shop_id=p_shop_id and state in ('queued','analysing','review_ready'))>=5 then raise exception using errcode='54000',message='payment_history_job_backpressure';end if;
   insert into public.payment_history_runtime(shop_id) values(p_shop_id) on conflict do nothing;
   insert into public.payment_history_migration_runs(shop_id,source_upload_id,actor_kind,actor_id,actor_session_id,actor_credential_version,request_key,request_digest,source_mode,source_context)
    values(p_shop_id,u.upload_id,a->>'kind',(a->>'id')::uuid,(a->>'session_id')::uuid,(a->>'credential_version')::integer,req,digest,p_mode,p_context) returning * into j;
  end if;
  result:=jsonb_build_object('run_id',j.run_id,'state',j.state);
 elsif p_operation='receipt' then
  select * into j from public.payment_history_migration_runs where shop_id=p_shop_id and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid and apply_request_key=(p_payload->>'request_key')::uuid and source_mode=p_mode
   and (p_mode='frozen_archive_v1' or source_context->>'device_id'=p_context->>'device_id');
  result:=jsonb_build_object('receipt',case when found then j.receipt else null end);
 else
  select * into j from public.payment_history_migration_runs where shop_id=p_shop_id and run_id=(p_payload->>'run_id')::uuid for update;
  if not found or j.actor_kind<>a->>'kind' or j.actor_id<>(a->>'id')::uuid or j.source_mode<>p_mode or j.source_context is distinct from p_context then raise exception using errcode='42501',message='payment_history_job_actor_mismatch';end if;
  -- An uncertain response is recovered by the same request key, never by a
  -- second import. The principal still needs a fresh live capability.
  if p_operation='apply' and j.receipt is not null then
   if j.apply_request_key is distinct from (p_payload->>'request_key')::uuid or j.apply_request_digest is distinct from digest then raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
   result:=j.receipt;
  else
   if p_operation<>'resume' and (j.actor_session_id<>(a->>'session_id')::uuid or j.actor_credential_version is distinct from (a->>'credential_version')::integer) then raise exception using errcode='42501',message='payment_history_job_actor_mismatch';end if;
   if p_operation='resume' then
    if j.state not in ('queued','analysing','review_ready') then raise exception using errcode='55000',message='payment_history_job_not_resumable';end if;
    update public.payment_history_migration_runs set actor_session_id=(a->>'session_id')::uuid,actor_credential_version=(a->>'credential_version')::integer,
     state=case when state='analysing' then 'queued' else state end,lease_token=null,lease_expires_at=null,lease_fence=lease_fence+1,review_digest=null where run_id=j.run_id returning * into j;
    result:=jsonb_build_object('run_id',j.run_id,'state',j.state);
   elsif p_operation='cancel' then
    if j.state='applied' then raise exception using errcode='55000',message='payment_history_commit_already_started';end if;
    update public.payment_history_migration_runs set state='cancelled',lease_token=null,lease_expires_at=null,review_digest=null where run_id=j.run_id;
    result:=jsonb_build_object('run_id',j.run_id,'state','cancelled');
   elsif p_operation='status' then
    result:=jsonb_build_object('run_id',j.run_id,'state',j.state,'processed_objects',j.processed_objects,'processed_movements',j.processed_movements,'summary',j.summary,'error_code',j.error_code,
     'manifest',j.manifest,'bindings',j.configuration->'bindings','scopes',(select coalesce(jsonb_agg(jsonb_build_object('id',o.local_id,'reference',o.object->>'evidence_reference') order by o.local_id),'[]') from public.payment_history_migration_objects o where o.run_id=j.run_id and o.table_name='scopes'));
   else
    if j.state<>'review_ready' then raise exception using errcode='55000',message='payment_history_review_not_ready';end if;
    select * into r from public.payment_history_runtime where shop_id=p_shop_id for update;
    if p_operation='mapping' then
     select * into scope_row from public.payment_history_migration_objects where run_id=j.run_id and table_name='scopes' and local_id=p_payload->>'local_scope_id';
     if not found or length(coalesce(p_payload->>'reference','')) not between 1 and 2048 then raise exception using errcode='22023',message='payment_history_merchant_evidence_required';end if;
     canonical:=coalesce((p_payload->>'merchant_id')::uuid,gen_random_uuid());
     if not exists(select 1 from public.payment_history_merchants where shop_id=p_shop_id and merchant_id=canonical) and length(coalesce(p_payload->>'label','')) not between 1 and 256 then raise exception using errcode='22023',message='payment_history_merchant_evidence_required';end if;
     select * into u from public.payment_history_uploads where upload_id=j.source_upload_id;
     insert into public.payment_history_evidence(shop_id,kind,verification_level,status,policy_version,reference,scope,actor_kind,actor_id,verified_at)
      values(p_shop_id,'migration_reconcile','operator_attested','verified','history-local-migration-v1',p_payload->>'reference',
       jsonb_build_object('run_id',j.run_id,'local_scope_id',scope_row.local_id,'merchant_id',canonical,'archive_sha256',u.file_sha256,'source_level','legacy_attested'),a->>'kind',(a->>'id')::uuid,clock_timestamp()) returning evidence_id into proof;
     if not exists(select 1 from public.payment_history_merchants where shop_id=p_shop_id and merchant_id=canonical) then
      insert into public.payment_history_merchants(merchant_id,shop_id,label,evidence_id) values(canonical,p_shop_id,p_payload->>'label',proof);
     end if;
     for binding in select distinct object->>'alias_key' alias_key from public.payment_history_migration_objects where run_id=j.run_id and table_name='bindings' and object->>'scope_id'=scope_row.local_id loop
      if exists(select 1 from public.payment_history_merchant_aliases where shop_id=p_shop_id and alias_key=binding.alias_key and active and merchant_id<>canonical) then raise exception using errcode='23505',message='payment_history_alias_collision';end if;
      insert into public.payment_history_evidence(shop_id,kind,verification_level,status,policy_version,reference,scope,actor_kind,actor_id,verified_at)
       values(p_shop_id,'merchant_mapping','operator_attested','verified','history-local-migration-v1',p_payload->>'reference',jsonb_build_object('merchant_id',canonical,'alias_key',binding.alias_key,'file_sha256',jsonb_build_array(u.file_sha256),'from_ticks','0','to_ticks','3155378975999999999'),a->>'kind',(a->>'id')::uuid,clock_timestamp()) returning evidence_id into alias_proof;
      update public.payment_history_merchant_aliases set active=false where shop_id=p_shop_id and alias_key=binding.alias_key and active;
      insert into public.payment_history_merchant_aliases(shop_id,merchant_id,alias_key,source_identity,evidence_id)
       values(p_shop_id,canonical,binding.alias_key,jsonb_build_object('legacyAliasHash',binding.alias_key,'sourceArchiveSha256',u.file_sha256),alias_proof);
     end loop;
     update public.payment_history_migration_runs set configuration=jsonb_build_object('bindings',
      coalesce((select jsonb_agg(x) from jsonb_array_elements(j.configuration->'bindings') x where x->>'local_scope_id'<>scope_row.local_id),'[]')||jsonb_build_array(jsonb_build_object('local_scope_id',scope_row.local_id,'merchant_id',canonical,'evidence_id',proof))),review_digest=null where run_id=j.run_id;
     result:=jsonb_build_object('merchant_id',canonical,'evidence_id',proof);
    else
     perform 1 from public.payment_history_evidence where shop_id=p_shop_id order by evidence_id for share;
     review:=app_private.payment_history_migration_review_v1(j.run_id);
     if p_operation='review' then
      update public.payment_history_migration_runs set review_digest=review->>'review_digest',reviewed_revision=r.revision,reviewed_writer_epoch=r.writer_epoch where run_id=j.run_id;result:=review;
     elsif p_operation='apply' then
      req:=(p_payload->>'request_key')::uuid;
      if req is null or coalesce(review->>'can_apply','false')<>'true' or j.review_digest is null or j.review_digest is distinct from p_payload->>'review_digest' or j.review_digest is distinct from review->>'review_digest'
       or j.reviewed_revision is distinct from r.revision or j.reviewed_writer_epoch is distinct from r.writer_epoch then raise exception using errcode='40001',message='payment_history_review_stale_or_blocked';end if;
      if exists(select 1 from public.payment_history_migration_runs where shop_id=p_shop_id and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid and apply_request_key=req) then raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
      insert into public.payment_history_migration_decisions select j.run_id,d.* from app_private.payment_history_migration_review_rows_v1(j.run_id) d;
      v_revision:=r.revision+1;main_operation:=gen_random_uuid();snapshot:=gen_random_uuid();
      select * into u from public.payment_history_uploads where upload_id=j.source_upload_id;
      for source_batch in select * from public.payment_history_migration_objects where run_id=j.run_id and table_name='batches' order by source_ordinal loop
       select batch_id into global_batch from public.payment_history_local_batch_map where shop_id=p_shop_id and shop_device_id=(j.manifest->>'deviceId')::uuid and local_dataset_id=j.manifest->>'localDatasetId' and local_batch_id=source_batch.local_id;
       if not found then
        global_batch:=gen_random_uuid();global_operation:=gen_random_uuid();new_batches:=new_batches+1;
        insert into public.payment_history_batches(batch_id,shop_id,origin,state,apply_operation_id,created_revision,cancelled_revision,cancelled_at)
         values(global_batch,p_shop_id,'local_migration',case when source_batch.object->>'state'='Undone' then 'cancelled' else 'active' end,global_operation,v_revision,
          case when source_batch.object->>'state'='Undone' then v_revision end,case when source_batch.object->>'state'='Undone' then clock_timestamp() end);
        insert into public.payment_history_local_batch_map values(p_shop_id,(j.manifest->>'deviceId')::uuid,j.manifest->>'localDatasetId',source_batch.local_id,global_batch,source_batch.object_digest);
        batch_receipt:=jsonb_build_object('operation_id',global_operation,'batch_id',global_batch,'kind','migrate','source_run_id',j.run_id,'source_local_batch_id',source_batch.local_id,'dataset_id',r.dataset_id,'revision',v_revision::text,'writer_epoch',r.writer_epoch::text);
        insert into public.payment_history_receipts(operation_id,shop_id,batch_id,operation_kind,actor_kind,actor_id,request_key,request_digest,receipt)
         values(global_operation,p_shop_id,global_batch,'migrate',a->>'kind',(a->>'id')::uuid,gen_random_uuid(),digest,batch_receipt);
       end if;
      end loop;
      for row in select d.*,m.local_batch_id,m.supersedes_local_id,m.transaction,m.economics,m.economic_digest,m.active,o.object raw
        from public.payment_history_migration_decisions d join public.payment_history_migration_movements m on m.run_id=d.run_id and m.local_id=d.local_id
        join public.payment_history_migration_objects o on o.run_id=d.run_id and o.table_name='movements' and o.local_id=d.local_id where d.run_id=j.run_id order by d.local_id::bigint loop
       select batch_id into global_batch from public.payment_history_local_batch_map where shop_id=p_shop_id and shop_device_id=(j.manifest->>'deviceId')::uuid and local_dataset_id=j.manifest->>'localDatasetId' and local_batch_id=row.local_batch_id;
       if row.decision in ('new_active','new_inactive') then
        global_version:=gen_random_uuid();previous_version:=null;
        if row.supersedes_local_id is not null then select movement_version_id into previous_version from public.payment_history_local_movement_map where shop_id=p_shop_id and shop_device_id=(j.manifest->>'deviceId')::uuid and local_dataset_id=j.manifest->>'localDatasetId' and local_movement_id=row.supersedes_local_id;end if;
        insert into public.payment_history_movement_versions(movement_version_id,shop_id,merchant_id,external_namespace,external_id,identity_key,economic_digest,business_ticks,business_date,gross_clp,commission_clp,commission_vat_clp,net_clp,movement_kind,transaction_state,transaction,owner_batch_id,source_upload_id,source_row,source_sheet,active,supersedes_version_id,created_revision)
         values(global_version,p_shop_id,row.merchant_id,row.transaction->>'externalNamespace',row.transaction->>'externalId',row.identity_key,row.economic_digest,(row.economics->>'businessTicks')::bigint,(row.transaction#>>'{timestamp,businessDateTime}')::date,(row.economics->>'grossClp')::bigint,(row.economics->>'commissionClp')::bigint,(row.economics->>'commissionVatClp')::bigint,(row.economics->>'netClp')::bigint,row.economics->>'movementKind',row.economics->>'transactionState',row.transaction,global_batch,j.source_upload_id,(row.transaction#>>'{source,rowNumber}')::integer,row.transaction#>>'{source,sheetName}',row.active,previous_version,v_revision);
        if row.active then new_active:=new_active+1;else new_inactive:=new_inactive+1;end if;
       else
        duplicates:=duplicates+1;global_version:=row.existing_version_id;
        if global_version is null then select movement_version_id into global_version from public.payment_history_movement_versions where shop_id=p_shop_id and identity_key=row.identity_key and active;end if;
        if global_version is null then raise exception using errcode='40001',message='payment_history_review_stale_or_blocked';end if;
        insert into public.payment_history_duplicate_observations(shop_id,batch_id,movement_version_id,source_upload_id,source_sheet,source_row)
         values(p_shop_id,global_batch,global_version,j.source_upload_id,row.transaction#>>'{source,sheetName}',(row.transaction#>>'{source,rowNumber}')::integer);
       end if;
       insert into public.payment_history_local_movement_map values(p_shop_id,(j.manifest->>'deviceId')::uuid,j.manifest->>'localDatasetId',row.local_id,global_version,row.economic_digest,encode(extensions.digest(convert_to((row.raw-'is_active')::text,'UTF8'),'sha256'),'hex'),row.decision in ('new_active','new_inactive')) on conflict do nothing;
      end loop;
      insert into public.payment_history_source_snapshots(snapshot_id,shop_id,shop_device_id,local_dataset_id,data_revision,restore_epoch,archive_sha256,backup_sha256,source_manifest,source_summary,run_id,created_revision)
       values(snapshot,p_shop_id,(j.manifest->>'deviceId')::uuid,j.manifest->>'localDatasetId',(j.manifest->>'dataRevision')::bigint,(j.manifest->>'restoreEpoch')::bigint,u.file_sha256,j.manifest->>'backupSha256',j.manifest,j.summary,j.run_id,v_revision);
      insert into public.payment_history_source_objects(shop_id,source_snapshot_id,table_name,local_id,object_digest,original_object)
       select p_shop_id,snapshot,table_name,local_id,object_digest,object from public.payment_history_migration_objects where run_id=j.run_id;
      insert into public.payment_history_revisions(shop_id,revision,ordinal,movement_version_id,operation_id,change_kind)
       select p_shop_id,v_revision,row_number() over(order by v.movement_version_id)::integer,v.movement_version_id,b.apply_operation_id,'upsert' from public.payment_history_movement_versions v join public.payment_history_batches b on b.shop_id=v.shop_id and b.batch_id=v.owner_batch_id where v.shop_id=p_shop_id and v.created_revision=v_revision;
      update public.payment_history_runtime set revision=v_revision,updated_at=clock_timestamp() where shop_id=p_shop_id;
      perform app_private.payment_history_seal_revision_v1(p_shop_id,v_revision);
      result:=jsonb_build_object('operation_id',main_operation,'kind','migrate','source_run_id',j.run_id,'source_snapshot_id',snapshot,'dataset_id',r.dataset_id,'revision',v_revision::text,'writer_epoch',r.writer_epoch::text,
       'new_active',new_active,'new_inactive',new_inactive,'duplicates',duplicates,'new_batches',new_batches,'original_evidence_level','legacy_attested');
      update public.payment_history_migration_runs set state='applied',apply_request_key=req,apply_request_digest=digest,receipt=result,updated_at=clock_timestamp() where run_id=j.run_id;
      if p_mode='local_baseline_v2' then
       result:=result||jsonb_build_object('baseline_context',app_private.payment_history_bind_local_baseline_v2(p_shop_id,(p_context->>'device_id')::uuid,snapshot,
        p_context->>'local_dataset_id',(p_context->>'data_revision')::bigint,(p_context->>'restore_epoch')::bigint,(p_context->>'restore_lineage_id')::uuid,r.writer_epoch));
       update public.payment_history_migration_runs set receipt=result where run_id=j.run_id;
      end if;
     else raise exception using errcode='22023',message='payment_history_operation_invalid';end if;
    end if;
   end if;
  end if;
 end if;
 if p_operation not in ('status','upload_status','receipt') then insert into public.payment_history_events(shop_id,actor_kind,actor_id,operation,subject_id) values(p_shop_id,a->>'kind',(a->>'id')::uuid,'migration_'||p_operation,coalesce(j.run_id,u.upload_id));end if;
 if not app_private.payment_history_publishable_v1() then raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 if octet_length(result::text)>4194304 then raise exception using errcode='54000',message='payment_history_response_limit';end if;
 return jsonb_build_object('ok',true,'shop_id',p_shop_id,'actor',a,'result',result);
end;$$;

create or replace function public.payment_history_migration_request_v1(p_shop_id uuid,p_operation text,p_payload jsonb default '{}',p_staff_id uuid default null,
 p_staff_web_session_id uuid default null,p_session_token_hash text default null,p_credential_version integer default null) returns jsonb
language sql volatile security definer set search_path='' as $$
 select app_private.payment_history_migration_request_engine_v2(p_shop_id,p_operation,p_payload,p_staff_id,p_staff_web_session_id,p_session_token_hash,p_credential_version,null,'frozen_archive_v1',null);
$$;

revoke all on function app_private.payment_history_migration_request_engine_v2(uuid,text,jsonb,uuid,uuid,text,integer,jsonb,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.payment_history_migration_request_v1(uuid,text,jsonb,uuid,uuid,text,integer) from public,anon;
grant execute on function public.payment_history_migration_request_v1(uuid,text,jsonb,uuid,uuid,text,integer) to authenticated,service_role;

-- The baseline caller is deliberately not a public RPC. Its actor is a real
-- POS session, distinct from the existing staff-web archive migration actor.
create function app_private.payment_history_local_baseline_request_v2(p_shop uuid,p_device uuid,p_staff uuid,p_session uuid,
 p_device_hash text,p_session_hash text,p_version integer,p_operation text,p_payload jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare a jsonb;context jsonb;payload jsonb;result jsonb;r public.payment_history_runtime;k text;keys text[];begin
 a:=app_private.payment_history_local_device_actor_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,'migrate');
 keys:=case p_operation
  when 'upload_create' then array['file_name','sha256','byte_length']
  when 'upload_ready' then array['upload_id'] when 'upload_status' then array['upload_id']
  when 'start' then array['request_key','upload_id','local_dataset_id','data_revision','restore_epoch','restore_lineage_id','writer_epoch']
  when 'status' then array['run_id'] when 'resume' then array['run_id'] when 'cancel' then array['run_id']
  when 'review' then array['run_id'] when 'apply' then array['run_id','request_key','review_digest']
  when 'receipt' then array['request_key'] else null end;
 if keys is null or not app_private.payment_history_local_keys_v2(p_payload,keys) or octet_length(p_payload::text)>65536 then
  raise exception using errcode='22023',message='payment_history_operation_invalid';end if;
 context:=jsonb_build_object('device_id',p_device);payload:=p_payload;
 if p_operation='start' then
  if jsonb_typeof(p_payload->'local_dataset_id') is distinct from 'string' or length(coalesce(p_payload->>'local_dataset_id','')) not between 1 and 256
   or jsonb_typeof(p_payload->'restore_lineage_id') is distinct from 'string'
   or coalesce(p_payload->>'restore_lineage_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   raise exception using errcode='22023',message='payment_history_local_baseline_invalid';end if;
  foreach k in array array['data_revision','restore_epoch','writer_epoch'] loop
   if jsonb_typeof(p_payload->k) is distinct from 'string' or coalesce(p_payload->>k,'') !~ '^(0|[1-9][0-9]{0,18})$'
    or (p_payload->>k)::numeric>9223372036854775807 or (k='writer_epoch' and (p_payload->>k)::bigint<1) then
    raise exception using errcode='22023',message='payment_history_local_baseline_invalid';end if;
  end loop;
  context:=context||(p_payload-'request_key'-'upload_id');payload:=p_payload-array['local_dataset_id','data_revision','restore_epoch','restore_lineage_id','writer_epoch'];
  insert into public.payment_history_runtime(shop_id) values(p_shop) on conflict do nothing;
  select * into r from public.payment_history_runtime where shop_id=p_shop for share;
  if r.writer_authority<>'local' or r.writer_epoch::text is distinct from context->>'writer_epoch' then
   raise exception using errcode='40001',message='payment_history_local_writer_closed';end if;
  if exists(select 1 from public.payment_history_local_write_grants where shop_id=p_shop and shop_device_id=p_device)
   or exists(select 1 from public.payment_history_local_publications where shop_id=p_shop and shop_device_id=p_device and state in('preparing','authorized','reconcile_required')) then
   raise exception using errcode='40001',message='payment_history_local_baseline_outcome_unknown';end if;
 elsif p_operation in('status','resume','cancel','review','apply') then
  select j.source_context into context from public.payment_history_migration_runs j where j.shop_id=p_shop and j.run_id=(p_payload->>'run_id')::uuid
   and j.source_mode='local_baseline_v2' and j.source_context->>'device_id'=p_device::text;
  if not found then raise exception using errcode='42501',message='payment_history_job_actor_mismatch';end if;
 end if;
 result:=app_private.payment_history_migration_request_engine_v2(p_shop,p_operation,payload,null,null,null,null,a,'local_baseline_v2',context);
 if not app_private.payment_history_publishable_v1() or not app_private.pos_runtime_lease_is_valid_v1(p_shop,p_device,p_staff,p_session) then
  raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 return result;
end;$$;
revoke all on function app_private.payment_history_local_baseline_request_v2(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb)
 from public,anon,authenticated,service_role;
