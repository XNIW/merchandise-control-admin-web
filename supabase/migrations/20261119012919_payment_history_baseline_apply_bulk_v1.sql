-- ASUS019: bulk insertion only for independent new baseline facts.
-- Preserve the ordered loop for duplicates and supersedes; all admission,
-- review, provenance, transaction, revision sealing and deadlines are unchanged.
create or replace function app_private.payment_history_migration_request_engine_v2(p_shop_id uuid,p_operation text,p_payload jsonb,
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
      -- Only independent new facts take the set-based path. Complex mappings
      -- keep their ordered C30 semantics, including incoming duplicates and supersedes.
      if not exists(
       select 1 from public.payment_history_migration_decisions d
       join public.payment_history_migration_movements m on m.run_id=d.run_id and m.local_id=d.local_id
       where d.run_id=j.run_id and (d.decision not in ('new_active','new_inactive') or m.supersedes_local_id is not null)
      ) then
       with new_rows as materialized (
        select d.local_id,d.merchant_id,d.identity_key,m.transaction,m.economics,m.economic_digest,m.active,
         b.batch_id,gen_random_uuid() movement_version_id,
         encode(extensions.digest(convert_to((o.object-'is_active')::text,'UTF8'),'sha256'),'hex') source_fact_digest
        from public.payment_history_migration_decisions d
        join public.payment_history_migration_movements m on m.run_id=d.run_id and m.local_id=d.local_id
        join public.payment_history_migration_objects o on o.run_id=d.run_id and o.table_name='movements' and o.local_id=d.local_id
        left join public.payment_history_local_batch_map b on b.shop_id=p_shop_id and b.shop_device_id=(j.manifest->>'deviceId')::uuid
         and b.local_dataset_id=j.manifest->>'localDatasetId' and b.local_batch_id=m.local_batch_id
        where d.run_id=j.run_id
       ),inserted_versions as (
        insert into public.payment_history_movement_versions(movement_version_id,shop_id,merchant_id,external_namespace,external_id,identity_key,economic_digest,business_ticks,business_date,gross_clp,commission_clp,commission_vat_clp,net_clp,movement_kind,transaction_state,transaction,owner_batch_id,source_upload_id,source_row,source_sheet,active,supersedes_version_id,created_revision)
         select n.movement_version_id,p_shop_id,n.merchant_id,n.transaction->>'externalNamespace',n.transaction->>'externalId',n.identity_key,n.economic_digest,
          (n.economics->>'businessTicks')::bigint,(n.transaction#>>'{timestamp,businessDateTime}')::date,(n.economics->>'grossClp')::bigint,
          (n.economics->>'commissionClp')::bigint,(n.economics->>'commissionVatClp')::bigint,(n.economics->>'netClp')::bigint,
          n.economics->>'movementKind',n.economics->>'transactionState',n.transaction,n.batch_id,j.source_upload_id,
          (n.transaction#>>'{source,rowNumber}')::integer,n.transaction#>>'{source,sheetName}',n.active,null,v_revision
         from new_rows n
         returning movement_version_id,active
       ),inserted_maps as (
        insert into public.payment_history_local_movement_map(shop_id,shop_device_id,local_dataset_id,local_movement_id,movement_version_id,source_economic_digest,source_fact_digest,owns_version)
         select p_shop_id,(j.manifest->>'deviceId')::uuid,j.manifest->>'localDatasetId',n.local_id,v.movement_version_id,
          n.economic_digest,n.source_fact_digest,true
         from new_rows n join inserted_versions v on v.movement_version_id=n.movement_version_id
         on conflict do nothing
         returning local_movement_id
       )
       -- Data-modifying CTEs finish even if their RETURNING rows are not selected.
       select count(*) filter(where active)::integer,count(*) filter(where not active)::integer
        into new_active,new_inactive from inserted_versions;
      else
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
      end if;
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

revoke all on function app_private.payment_history_migration_request_engine_v2(uuid,text,jsonb,uuid,uuid,text,integer,jsonb,text,jsonb) from public,anon,authenticated,service_role;
