-- Private fresh-lease economic delivery. Public device v2 remains closed until
-- journal witnesses, reconciliation and automatic baseline composition exist.
-- An expired first delivery is never accepted by this helper.
alter table public.payment_history_local_writer_contexts
 add column last_local_sequence bigint not null default 0 check(last_local_sequence>=0);
alter table public.payment_history_local_reviews
 add constraint payment_history_local_correction_bound check(local_corrections<=200);

create function app_private.payment_history_local_sequence_context_v2() returns trigger
language plpgsql set search_path='' as $$begin
 if row(new.local_dataset_id,new.restore_lineage_id,new.restore_epoch) is distinct from row(old.local_dataset_id,old.restore_lineage_id,old.restore_epoch) then
  new.last_local_sequence:=0;
 elsif new.last_local_sequence<old.last_local_sequence then
  raise exception using errcode='55000',message='payment_history_local_sequence_immutable';end if;
 return new;
end;$$;
revoke all on function app_private.payment_history_local_sequence_context_v2() from public,anon,authenticated,service_role;
create trigger payment_history_local_sequence_context before update on public.payment_history_local_writer_contexts
 for each row execute function app_private.payment_history_local_sequence_context_v2();

create function app_private.payment_history_local_receipt_nodes_v2(v json,depth integer default 0) returns integer
language plpgsql immutable set search_path='' as $$
declare n integer:=1;item json;begin
 if depth>32 then raise exception using errcode='22023',message='payment_history_local_receipt_invalid';end if;
 if json_typeof(v)='object' then
  if (select count(*)<>count(distinct key) from json_each(v)) then
   raise exception using errcode='22023',message='payment_history_local_receipt_invalid';end if;
  for item in select value from json_each(v) loop
   n:=n+app_private.payment_history_local_receipt_nodes_v2(item,depth+1);
   if n>20000 then raise exception using errcode='54000',message='payment_history_local_receipt_capacity';end if;
  end loop;
 elsif json_typeof(v)='array' then
  for item in select value from json_array_elements(v) loop
   n:=n+app_private.payment_history_local_receipt_nodes_v2(item,depth+1);
   if n>20000 then raise exception using errcode='54000',message='payment_history_local_receipt_capacity';end if;
  end loop;
 end if;
 return n;
end;$$;
revoke all on function app_private.payment_history_local_receipt_nodes_v2(json,integer) from public,anon,authenticated,service_role;

-- Validate literal integer types before converting. json preserves lexical
-- number spelling and duplicate keys; jsonb alone would hide both properties.
create function app_private.payment_history_local_receipt_integer_v2(v json,minimum numeric,maximum numeric) returns bigint
language plpgsql immutable set search_path='' as $$
declare raw text;begin
 raw:=v::text;
 if json_typeof(v) is distinct from 'number' or coalesce(raw,'') !~ '^(0|-?[1-9][0-9]{0,18})$' then
  raise exception using errcode='22023',message='payment_history_local_receipt_invalid';end if;
 if raw::numeric<minimum or raw::numeric>maximum then
  raise exception using errcode='22023',message='payment_history_local_receipt_invalid';end if;
 return raw::bigint;
end;$$;
revoke all on function app_private.payment_history_local_receipt_integer_v2(json,numeric,numeric) from public,anon,authenticated,service_role;

create function app_private.payment_history_local_receipt_economics_v2(v json) returns text
language plpgsql immutable set search_path='' as $$
declare k text;begin
 if not app_private.payment_history_local_keys_v2(v::jsonb,array['BusinessTicks','GrossClp','FeeClp','FeeVatClp','NetClp','MovementKind','TransactionState']) then
  raise exception using errcode='22023',message='payment_history_local_receipt_invalid';end if;
 perform app_private.payment_history_local_receipt_integer_v2(v->'BusinessTicks',0,3155378975999999999);
 perform app_private.payment_history_local_receipt_integer_v2(v->'GrossClp',-9223372036854775808,9223372036854775807);
 foreach k in array array['FeeClp','FeeVatClp','NetClp'] loop
  if json_typeof(v->k) is distinct from 'null' then perform app_private.payment_history_local_receipt_integer_v2(v->k,-9223372036854775808,9223372036854775807);end if;
 end loop;
 if json_typeof(v->'MovementKind') is distinct from 'string' or v->>'MovementKind' not in('Sale','Cancellation')
  or json_typeof(v->'TransactionState') is distinct from 'string' or v->>'TransactionState' not in('ABONADO','CONFIRMADA') then
  raise exception using errcode='22023',message='payment_history_local_receipt_invalid';end if;
 return app_private.payment_history_economic_digest_v1(jsonb_build_object('businessTicks',v->>'BusinessTicks','grossClp',v->>'GrossClp',
  'commissionClp',v->>'FeeClp','commissionVatClp',v->>'FeeVatClp','netClp',v->>'NetClp','movementKind',v->>'MovementKind','transactionState',v->>'TransactionState'));
end;$$;
revoke all on function app_private.payment_history_local_receipt_economics_v2(json) from public,anon,authenticated,service_role;

create function app_private.payment_history_local_validate_receipt_v2(p_operation uuid,p_raw text,p_revision bigint) returns jsonb
language plpgsql volatile set search_path='' as $$
declare p public.payment_history_local_publications;review public.payment_history_local_reviews;raw json;v jsonb;header jsonb;approval json;f jsonb;
 source_key text;seen text[]:=array[]::text[];previous_digest text;proposed_digest text;n integer:=0;begin
 if p_raw is null or octet_length(p_raw) not between 2 and 1048576 then raise exception using errcode='54000',message='payment_history_local_receipt_capacity';end if;
 begin raw:=p_raw::json;v:=raw::jsonb;
 exception when data_exception then raise exception using errcode='22023',message='payment_history_local_receipt_invalid';end;
 perform app_private.payment_history_local_receipt_nodes_v2(raw);
 if not app_private.payment_history_local_keys_v2(v,array['OperationId','OperationKind','BatchId','InsertedCount','DuplicateCount','RejectedCount','SignedAmountClp','CorrectionCount','CorrectionApprovals']) then
  raise exception using errcode='22023',message='payment_history_local_receipt_invalid';end if;
 select * into p from public.payment_history_local_publications where operation_id=p_operation;
 select * into review from public.payment_history_local_reviews where operation_id=p_operation;
 select page_json::jsonb->0->'fields' into header from public.payment_history_local_publication_pages where operation_id=p_operation and ordinal=1;
 if p.operation_id is null or review.operation_id is null or header is null or p.grant_id is null or p.authorized_proof is null then
  raise exception using errcode='40001',message='payment_history_local_decision_exists';end if;
 if json_typeof(raw->'OperationId') is distinct from 'string' or raw->>'OperationId' is distinct from header->>'operation_id'
  or json_typeof(raw->'OperationKind') is distinct from 'string' or raw->>'OperationKind' is distinct from p.operation_kind
  or json_typeof(raw->'BatchId') is distinct from 'string' or length(btrim(coalesce(raw->>'BatchId',''))) not between 1 and 256 or raw->>'BatchId' ~ '[[:cntrl:]]'
  or app_private.payment_history_local_receipt_integer_v2(raw->'InsertedCount',0,100000)<>(case when p.operation_kind='Apply' then review.local_inserted else review.local_deactivated end)
  or app_private.payment_history_local_receipt_integer_v2(raw->'DuplicateCount',0,100000)<>review.local_duplicates
  or app_private.payment_history_local_receipt_integer_v2(raw->'RejectedCount',0,2147483647)<>review.local_rejected
  or app_private.payment_history_local_receipt_integer_v2(raw->'CorrectionCount',0,200)<>review.local_corrections
  or app_private.payment_history_local_receipt_integer_v2(raw->'SignedAmountClp',-9223372036854775808,9223372036854775807)<>review.local_gross
  or p_revision is null or p_revision::numeric<>p.base_revision::numeric+review.local_inserted+review.local_deactivated
  or json_typeof(raw->'CorrectionApprovals') is distinct from 'array' or json_array_length(raw->'CorrectionApprovals')<>review.local_corrections then
  raise exception using errcode='22023',message='payment_history_local_receipt_mismatch';end if;
 if p.operation_kind='Undo' and raw->>'BatchId' is distinct from review.undo_local_batch_id then
  raise exception using errcode='22023',message='payment_history_local_receipt_mismatch';end if;
 for approval in select value from json_array_elements(raw->'CorrectionApprovals') loop
  n:=n+1;
  if not app_private.payment_history_local_keys_v2(approval::jsonb,array['PreviousTransactionId','Previous','Proposed','SourceFileId','SourceSheet','SourceRow','ContextFingerprint','EvidenceReference'])
   or json_typeof(approval->'SourceFileId') is distinct from 'string' or json_typeof(approval->'SourceSheet') is distinct from 'string'
   or json_typeof(approval->'ContextFingerprint') is distinct from 'string' or json_typeof(approval->'EvidenceReference') is distinct from 'string' then
   raise exception using errcode='22023',message='payment_history_local_receipt_invalid';end if;
  perform app_private.payment_history_local_receipt_integer_v2(approval->'PreviousTransactionId',1,9223372036854775807);
  perform app_private.payment_history_local_receipt_integer_v2(approval->'SourceRow',1,1048576);
  source_key:=app_private.payment_history_field_hash_v1(array[approval->>'SourceFileId',approval->>'SourceSheet',approval->>'SourceRow']);
  if source_key=any(seen) then raise exception using errcode='22023',message='payment_history_local_receipt_mismatch';end if;seen:=array_append(seen,source_key);
  select fields into f from app_private.payment_history_local_auxiliary_v2(p_operation,'correction',source_key);
  previous_digest:=app_private.payment_history_local_receipt_economics_v2(approval->'Previous');
  proposed_digest:=app_private.payment_history_local_receipt_economics_v2(approval->'Proposed');
  if f is null or approval->>'PreviousTransactionId' is distinct from f->>'previous_transaction_id'
   or previous_digest is distinct from f->>'previous_economic_digest' or proposed_digest is distinct from f->>'proposed_economic_digest'
   or approval->>'ContextFingerprint' is distinct from f->>'context_fingerprint' or approval->>'EvidenceReference' is distinct from f->>'evidence_reference'
   or f->>'approval_fingerprint' is distinct from app_private.payment_history_field_hash_v1(array[approval->>'PreviousTransactionId',previous_digest,proposed_digest,
    approval->>'SourceFileId',approval->>'SourceSheet',approval->>'SourceRow',approval->>'ContextFingerprint',approval->>'EvidenceReference']) then
   raise exception using errcode='22023',message='payment_history_local_receipt_mismatch';end if;
 end loop;
 return v;
end;$$;
revoke all on function app_private.payment_history_local_validate_receipt_v2(uuid,text,bigint) from public,anon,authenticated,service_role;

create function app_private.payment_history_local_deliver_fresh_v2(p_shop uuid,p_device uuid,p_staff uuid,p_session uuid,
 p_device_hash text,p_session_hash text,p_version integer,p_payload jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare r public.payment_history_runtime;p public.payment_history_local_publications;c public.payment_history_local_writer_contexts;review public.payment_history_local_reviews;
 cap text;v_local_revision bigint;sequence_no bigint;raw text;local_receipt jsonb;result jsonb;receipt_hash text;batch uuid;revision_no bigint;changed integer;begin
 if not app_private.payment_history_local_keys_v2(p_payload,array['operation_id','grant_id','content_digest','local_revision','local_sequence','local_receipt_json'])
  or jsonb_typeof(p_payload->'local_receipt_json') is distinct from 'string' or octet_length(p_payload->>'local_receipt_json')>1048576
  or coalesce(p_payload->>'content_digest','') !~ '^[0-9a-f]{64}$'
  or exists(select 1 from unnest(array['local_revision','local_sequence']) k where jsonb_typeof(p_payload->k) is distinct from 'string' or coalesce(p_payload->>k,'') !~ '^(0|[1-9][0-9]{0,18})$' or (p_payload->>k)::numeric>9223372036854775807)
  or (p_payload->>'local_sequence')::numeric<1 then raise exception using errcode='22023',message='payment_history_local_request_invalid';end if;
 select case operation_kind when 'Undo' then 'cancel' else 'import' end into cap from public.payment_history_local_publications
  where shop_id=p_shop and shop_device_id=p_device and operation_id=(p_payload->>'operation_id')::uuid;
 perform app_private.payment_history_local_device_actor_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,coalesce(cap,'import'));
 select * into r from public.payment_history_runtime where shop_id=p_shop for update;
 select * into p from public.payment_history_local_publications where shop_id=p_shop and shop_device_id=p_device and operation_id=(p_payload->>'operation_id')::uuid for update;
 if not found or p.grant_id is distinct from (p_payload->>'grant_id')::uuid or p.content_digest is distinct from p_payload->>'content_digest' then
  raise exception using errcode='40001',message='payment_history_local_preparation_stale';end if;
 raw:=p_payload->>'local_receipt_json';receipt_hash:=encode(extensions.digest(convert_to(raw,'UTF8'),'sha256'),'hex');
 v_local_revision:=(p_payload->>'local_revision')::bigint;sequence_no:=(p_payload->>'local_sequence')::bigint;
 if p.state='committed' then
  if p.local_receipt_json is distinct from raw or p.local_revision is distinct from v_local_revision or p.local_sequence is distinct from sequence_no then
   raise exception using errcode='23505',message='payment_history_local_receipt_conflict';end if;
  return jsonb_build_object('state','committed','operation_id',p.operation_id,'content_digest',p.content_digest,'receipt',p.server_receipt);
 end if;
 select * into c from public.payment_history_local_writer_contexts where shop_id=p_shop and shop_device_id=p_device for update;
 select * into review from public.payment_history_local_reviews where operation_id=p.operation_id for share;
 if p.state<>'authorized' or p.authorized_proof is null or p.authorization_staff_id is distinct from p_staff or p.authorization_credential_version is distinct from p_version
  or p.authorization_session_id is distinct from p_session or p.expires_at<=clock_timestamp()
  or r.dataset_id is distinct from p.server_dataset_id or row(review.server_dataset_id,review.server_revision) is distinct from row(r.dataset_id,r.revision)
  or (r.writer_authority<>'local' or r.writer_epoch<>p.writer_epoch) and not(r.writer_authority='frozen' and exists(select 1 from public.payment_history_local_drain_set d
   where d.shop_id=p_shop and d.frozen_writer_epoch=r.writer_epoch and d.operation_id=p.operation_id and d.grant_id=p.grant_id and d.content_digest=p.content_digest)) then
  raise exception using errcode='40001',message='payment_history_local_delivery_reconciliation_required';end if;
 if c.source_snapshot_id is null or row(c.local_dataset_id,c.restore_lineage_id,c.restore_epoch) is distinct from row(p.local_dataset_id,p.restore_lineage_id,p.restore_epoch)
  or c.local_revision>p.base_revision or sequence_no<=c.last_local_sequence
  or not exists(select 1 from public.payment_history_source_snapshots s join public.payment_history_migration_runs m on m.shop_id=s.shop_id and m.run_id=s.run_id
   join public.payment_history_uploads u on u.shop_id=m.shop_id and u.upload_id=m.source_upload_id where s.shop_id=p_shop and s.snapshot_id=c.source_snapshot_id
    and s.shop_device_id=p_device and s.local_dataset_id=c.local_dataset_id and s.data_revision<=c.local_revision and s.restore_epoch<=c.restore_epoch
    and s.source_manifest->>'restoreLineageId'=p.restore_lineage_id::text and m.state='applied' and m.source_mode='local_baseline_v2' and u.state='verified' and u.file_sha256=s.archive_sha256) then
  raise exception using errcode='40001',message='payment_history_local_context_unverified';end if;
 perform app_private.payment_history_local_review_dependencies_current_v2(p_shop,review.dependency_hashes);
 perform app_private.payment_history_local_mutation_fence_v2(p_shop);
 local_receipt:=app_private.payment_history_local_validate_receipt_v2(p.operation_id,raw,v_local_revision);
 batch:=(p.authorized_proof#>>'{canonical_decision,batch_id}')::uuid;revision_no:=r.revision+1;
 if p.authorized_proof#>>'{canonical_decision,revision}' is distinct from revision_no::text then
  raise exception using errcode='40001',message='payment_history_local_review_stale';end if;
 if p.operation_kind='Apply' then
  if batch is distinct from review.planned_batch_id or exists(select 1 from public.payment_history_local_publications old
   where old.shop_id=p_shop and old.shop_device_id=p_device and old.local_dataset_id=p.local_dataset_id and old.local_batch_id=local_receipt->>'BatchId' and old.state='committed' and old.operation_kind='Apply')
   or exists(select 1 from public.payment_history_local_batch_map b where b.shop_id=p_shop and b.shop_device_id=p_device and b.local_dataset_id=p.local_dataset_id and b.local_batch_id=local_receipt->>'BatchId') then
   raise exception using errcode='23505',message='payment_history_local_batch_conflict';end if;
  insert into public.payment_history_batches(batch_id,shop_id,origin,apply_operation_id,created_revision) values(batch,p_shop,'local_migration',p.operation_id,revision_no);
  insert into public.payment_history_movement_versions(movement_version_id,shop_id,merchant_id,external_namespace,external_id,identity_key,economic_digest,business_ticks,business_date,
   gross_clp,commission_clp,commission_vat_clp,net_clp,movement_kind,transaction_state,transaction,owner_batch_id,source_row,source_sheet,supersedes_version_id,created_revision)
   select m.canonical_version,p_shop,m.merchant_id,m.transaction->>'externalNamespace',m.transaction->>'externalId',m.canonical_identity,m.economic_digest,
    (m.economics->>'businessTicks')::bigint,(m.transaction#>>'{timestamp,businessDateTime}')::date,(m.economics->>'grossClp')::bigint,(m.economics->>'commissionClp')::bigint,
    (m.economics->>'commissionVatClp')::bigint,(m.economics->>'netClp')::bigint,m.economics->>'movementKind',m.economics->>'transactionState',m.transaction,batch,
    (m.transaction#>>'{source,rowNumber}')::integer,m.transaction#>>'{source,sheetName}',m.supersedes_version,revision_no
   from public.payment_history_local_review_movements m where m.operation_id=p.operation_id and m.canonical_owned;
  get diagnostics changed=row_count;
  if changed<>review.canonical_inserted then raise exception using errcode='40001',message='payment_history_local_review_stale';end if;
  insert into public.payment_history_local_publication_map(shop_id,operation_id,source_ordinal,movement_version_id,owned,local_inserted,local_scope_id,local_external_namespace,local_external_id,
   source_page_ordinal,source_record_ordinal,binding_page_ordinal,binding_record_ordinal)
   select p_shop,p.operation_id,m.source_ordinal,m.canonical_version,m.canonical_owned,m.local_inserted,m.local_scope_id,m.transaction->>'externalNamespace',m.transaction->>'externalId',
    m.source_page,m.source_record,m.binding_page,m.binding_record from public.payment_history_local_review_movements m where m.operation_id=p.operation_id;
  insert into public.payment_history_revisions(shop_id,revision,ordinal,movement_version_id,operation_id,change_kind)
   select p_shop,revision_no,row_number() over(order by m.canonical_version)::integer,m.canonical_version,p.operation_id,'upsert'
   from public.payment_history_local_review_movements m where m.operation_id=p.operation_id and m.canonical_owned;
 else
  if batch is distinct from review.undo_canonical_batch_id or not exists(select 1 from public.payment_history_batches where shop_id=p_shop and batch_id=batch and state='active') then
   raise exception using errcode='40001',message='payment_history_local_undo_stale';end if;
  insert into public.payment_history_revisions(shop_id,revision,ordinal,movement_version_id,operation_id,change_kind)
   select p_shop,revision_no,row_number() over(order by u.canonical_version_id)::integer,u.canonical_version_id,p.operation_id,'tombstone'
   from public.payment_history_local_review_undo_rows u where u.operation_id=p.operation_id and u.canonical_owned;
  update public.payment_history_movement_versions v set active=false from public.payment_history_local_review_undo_rows u
   where u.operation_id=p.operation_id and u.canonical_owned and v.shop_id=p_shop and v.movement_version_id=u.canonical_version_id and v.owner_batch_id=batch and v.active;
  get diagnostics changed=row_count;
  if changed<>review.canonical_deactivated then raise exception using errcode='40001',message='payment_history_local_undo_stale';end if;
  update public.payment_history_batches set state='cancelled',cancelled_revision=revision_no,cancelled_at=clock_timestamp() where shop_id=p_shop and batch_id=batch;
 end if;
 result:=jsonb_build_object('operation_id',p.operation_id,'grant_id',p.grant_id,'shop_id',p.shop_id,'device_id',p.shop_device_id,'dataset_id',p.server_dataset_id,
  'local_dataset_id',p.local_dataset_id,'restore_epoch',p.restore_epoch::text,'restore_lineage_id',p.restore_lineage_id,'writer_epoch',p.writer_epoch::text,'revision',revision_no::text,
  'content_digest',p.content_digest,'local_receipt_sha256',receipt_hash,'batch_id',batch,'kind',p.operation_kind,
  'inserted',review.canonical_inserted,'duplicates',review.canonical_duplicates,'deactivated',review.canonical_deactivated,'signed_gross_clp',review.canonical_gross::text);
 insert into public.payment_history_receipts(operation_id,shop_id,batch_id,operation_kind,actor_kind,actor_id,request_key,request_digest,receipt)
  values(p.operation_id,p_shop,batch,case when p.operation_kind='Undo' then 'cancel' else 'apply' end,'pos_staff_manager',p_staff,p.operation_id,p.content_digest,result);
 -- Marking committed and all economics are in this same transaction. The
 -- revision fence can now advance past this resolved operation, never another.
 update public.payment_history_local_publications set state='committed',local_sequence=sequence_no,local_revision=v_local_revision,
  local_batch_id=local_receipt->>'BatchId',local_receipt_json=raw,server_receipt=result where operation_id=p.operation_id;
 update public.payment_history_local_writer_contexts set local_revision=v_local_revision,last_local_sequence=sequence_no where shop_id=p_shop and shop_device_id=p_device;
 if p.expires_at<=clock_timestamp() or current_setting('app.payment_history_publish_deadline',true)::timestamptz<=clock_timestamp() then
  raise exception using errcode='40001',message='payment_history_local_delivery_reconciliation_required';end if;
 update public.payment_history_runtime set revision=revision_no,updated_at=clock_timestamp() where shop_id=p_shop;
 perform app_private.payment_history_seal_revision_v1(p_shop,revision_no);
 return jsonb_build_object('state','committed','operation_id',p.operation_id,'content_digest',p.content_digest,'receipt',result);
end;$$;
revoke all on function app_private.payment_history_local_deliver_fresh_v2(uuid,uuid,uuid,uuid,text,text,integer,jsonb) from public,anon,authenticated,service_role;

create function app_private.payment_history_local_receipt_v2(p_shop uuid,p_device uuid,p_staff uuid,p_session uuid,
 p_device_hash text,p_session_hash text,p_version integer,p_operation uuid,p_root text) returns jsonb
language plpgsql volatile set search_path='' as $$
declare p public.payment_history_local_publications;begin
 perform app_private.payment_history_local_device_actor_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,'read');
 select * into p from public.payment_history_local_publications where shop_id=p_shop and shop_device_id=p_device and operation_id=p_operation for share;
 if not found or p.content_digest is distinct from p_root then raise exception using errcode='40001',message='payment_history_local_preparation_stale';end if;
 return jsonb_build_object('state',case when p.state='committed' then 'committed' when p.state='authorized' and p.expires_at>clock_timestamp() then 'authorized' else 'reconcile_required' end,
  'operation_id',p.operation_id,'content_digest',p.content_digest,'receipt',p.server_receipt);
end;$$;
revoke all on function app_private.payment_history_local_receipt_v2(uuid,uuid,uuid,uuid,text,text,integer,uuid,text) from public,anon,authenticated,service_role;
