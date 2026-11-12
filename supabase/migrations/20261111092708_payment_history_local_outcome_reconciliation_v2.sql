-- Authenticated conforming-POS outcome evidence, not cryptographic attestation
-- of a physical SQLite file. Public v2 stays closed until composition/E2E pass.
-- A nonce tombstone may precede a delayed prepare request; it must therefore
-- survive independently of the publication row it permanently retires.
create table public.payment_history_local_intents (
 operation_id uuid primary key,shop_id uuid not null references public.shops(shop_id),
 shop_device_id uuid not null references public.shop_devices(shop_device_id),
 local_nonce uuid not null unique,content_digest text not null check(content_digest ~ '^[0-9a-f]{64}$'),
 request_fingerprint text not null check(request_fingerprint ~ '^[0-9a-f]{64}$'),
 aborted boolean not null default false
);
alter table public.payment_history_local_intents enable row level security;
revoke all on public.payment_history_local_intents from public,anon,authenticated,service_role;
create table public.payment_history_local_outcome_witnesses (
 operation_id uuid primary key references public.payment_history_local_intents(operation_id),
 outcome text not null check(outcome in('committed','aborted')),
 witness_json text not null check(octet_length(convert_to(witness_json,'UTF8')) between 1 and 16384),
 witness_sha256 text not null check(witness_sha256 ~ '^[0-9a-f]{64}$'),
 publisher_staff_id uuid not null references public.staff_accounts(staff_id),
 publisher_session_id uuid not null references public.pos_sessions(pos_session_id),
 publisher_credential_version integer not null check(publisher_credential_version>0)
);
alter table public.payment_history_local_outcome_witnesses enable row level security;
revoke all on public.payment_history_local_outcome_witnesses from public,anon,authenticated,service_role;

create function app_private.payment_history_local_intent_immutable_v2() returns trigger
language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' or old.aborted or not new.aborted
  or row(new.operation_id,new.shop_id,new.shop_device_id,new.local_nonce,new.content_digest,new.request_fingerprint)
   is distinct from row(old.operation_id,old.shop_id,old.shop_device_id,old.local_nonce,old.content_digest,old.request_fingerprint) then
  raise exception using errcode='55000',message='payment_history_local_intent_immutable';end if;
 return new;
end;$$;
revoke all on function app_private.payment_history_local_intent_immutable_v2() from public,anon,authenticated,service_role;
create trigger payment_history_local_intent_immutable before update or delete on public.payment_history_local_intents
 for each row execute function app_private.payment_history_local_intent_immutable_v2();
create trigger payment_history_local_outcome_immutable before update or delete on public.payment_history_local_outcome_witnesses
 for each row execute function app_private.payment_history_local_publication_immutable_v2();

create function app_private.payment_history_local_validate_outcome_witness_v2(raw text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare j json;w jsonb;k text;remaining bigint;request_elapsed bigint;elapsed bigint;reserve bigint;begin
 if raw is null or octet_length(convert_to(raw,'UTF8')) not between 1 and 16384 then
  raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
 j:=raw::json;perform app_private.payment_history_local_receipt_nodes_v2(j);w:=j::jsonb;
 if not app_private.payment_history_local_keys_v2(w,array['schema_version','outcome','operation_kind','local_nonce','grant_id','operation_id','shop_id','device_id',
  'local_dataset_id','server_dataset_id','restore_epoch','restore_lineage_id','writer_epoch','content_digest','request_fingerprint','base_revision',
  'local_revision','local_sequence','local_receipt_sha256','proof_sha256','admission_id','remaining_milliseconds','request_elapsed_milliseconds','elapsed_milliseconds','minimum_remaining_milliseconds'])
  or app_private.payment_history_local_receipt_integer_v2(j->'schema_version',1,1)<>1
  or coalesce(w->>'outcome','') not in('committed','aborted') or coalesce(w->>'operation_kind','') not in('Apply','Undo')
  or json_typeof(j->'local_dataset_id') is distinct from 'string' or length(coalesce(w->>'local_dataset_id','')) not between 1 and 256 then
  raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
 foreach k in array array['local_nonce','operation_id','shop_id','device_id','server_dataset_id','restore_lineage_id'] loop
  if json_typeof(j->k) is distinct from 'string' or coalesce(w->>k,'') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or w->>k='00000000-0000-0000-0000-000000000000' then
   raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
 end loop;
 foreach k in array array['content_digest','request_fingerprint'] loop
  if json_typeof(j->k) is distinct from 'string' or coalesce(w->>k,'') !~ '^[0-9a-f]{64}$' then
   raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
 end loop;
 foreach k in array array['restore_epoch','writer_epoch','base_revision','local_revision','local_sequence'] loop
  if json_typeof(j->k) is distinct from 'string' or coalesce(w->>k,'') !~ '^(0|[1-9][0-9]{0,18})$' or (w->>k)::numeric>9223372036854775807 then
   raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
 end loop;
 if (w->>'writer_epoch')::bigint<1 then raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
 if w->>'outcome'='aborted' then
  foreach k in array array['local_receipt_sha256','admission_id','remaining_milliseconds','request_elapsed_milliseconds','elapsed_milliseconds','minimum_remaining_milliseconds'] loop
   if json_typeof(j->k) is distinct from 'null' then raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
  end loop;
  if (w->'grant_id'='null'::jsonb) is distinct from (w->'proof_sha256'='null'::jsonb)
   or w->>'local_revision' is distinct from w->>'base_revision' then
   raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
 else
  foreach k in array array['grant_id','admission_id'] loop
   if json_typeof(j->k) is distinct from 'string' or coalesce(w->>k,'') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or w->>k='00000000-0000-0000-0000-000000000000' then
    raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
  end loop;
  foreach k in array array['local_receipt_sha256','proof_sha256'] loop
   if json_typeof(j->k) is distinct from 'string' or coalesce(w->>k,'') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
  end loop;
  remaining:=app_private.payment_history_local_receipt_integer_v2(j->'remaining_milliseconds',1,60000);
  request_elapsed:=app_private.payment_history_local_receipt_integer_v2(j->'request_elapsed_milliseconds',0,60000);
  elapsed:=app_private.payment_history_local_receipt_integer_v2(j->'elapsed_milliseconds',0,60000);
  reserve:=app_private.payment_history_local_receipt_integer_v2(j->'minimum_remaining_milliseconds',10000,60000);
  if remaining-request_elapsed-elapsed-10000<reserve or (w->>'local_sequence')::bigint<1 then
   raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
 end if;
 if w->'grant_id'<>'null'::jsonb and (json_typeof(j->'grant_id') is distinct from 'string'
  or coalesce(w->>'grant_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or w->>'grant_id'='00000000-0000-0000-0000-000000000000' or json_typeof(j->'proof_sha256') is distinct from 'string' or coalesce(w->>'proof_sha256','') !~ '^[0-9a-f]{64}$') then
  raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
 return w;
end;$$;
revoke all on function app_private.payment_history_local_validate_outcome_witness_v2(text) from public,anon,authenticated,service_role;

create function app_private.payment_history_local_prepare_intent_v2(p_shop uuid,p_device uuid,payload jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare r public.payment_history_runtime;n public.payment_history_local_intents;result jsonb;operation uuid;nonce uuid;begin
 if jsonb_typeof(payload->'local_nonce') is distinct from 'string'
  or coalesce(payload->>'local_nonce','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
 operation:=(payload->>'operation_id')::uuid;nonce:=(payload->>'local_nonce')::uuid;
 if operation is null or nonce='00000000-0000-0000-0000-000000000000' then
  raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
 select * into r from public.payment_history_runtime where shop_id=p_shop for update;
 if not found then raise exception using errcode='40001',message='payment_history_local_writer_closed';end if;
 select * into n from public.payment_history_local_intents where operation_id=operation for update;
 if found and (n.aborted or row(n.shop_id,n.shop_device_id,n.local_nonce,n.content_digest,n.request_fingerprint)
  is distinct from row(p_shop,p_device,nonce,payload->>'content_digest',payload->>'request_fingerprint')) then
  raise exception using errcode='40001',message='payment_history_local_intent_conflict';end if;
 result:=app_private.payment_history_local_prepare_v2(p_shop,p_device,payload-'local_nonce');
 if n.operation_id is null then
  insert into public.payment_history_local_intents(operation_id,shop_id,shop_device_id,local_nonce,content_digest,request_fingerprint)
   values(operation,p_shop,p_device,nonce,payload->>'content_digest',payload->>'request_fingerprint');
 end if;
 return result;
end;$$;
revoke all on function app_private.payment_history_local_prepare_intent_v2(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function app_private.payment_history_local_abort_witness_v2(p_shop uuid,p_device uuid,p_staff uuid,p_session uuid,
 p_device_hash text,p_session_hash text,p_version integer,p_raw text,p_raw_proof text default null) returns jsonb
language plpgsql volatile set search_path='' as $$
declare w jsonb;raw_proof json;digest text;r public.payment_history_runtime;n public.payment_history_local_intents;
 p public.payment_history_local_publications;c public.payment_history_local_writer_contexts;saved public.payment_history_local_outcome_witnesses;begin
 w:=app_private.payment_history_local_validate_outcome_witness_v2(p_raw);
 perform app_private.payment_history_local_device_actor_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,
  case w->>'operation_kind' when 'Undo' then 'cancel' else 'import' end);
 if w->>'outcome'<>'aborted' or row(w->>'shop_id',w->>'device_id') is distinct from row(p_shop::text,p_device::text) then
  raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
 digest:=encode(extensions.digest(convert_to(p_raw,'UTF8'),'sha256'),'hex');
 select * into r from public.payment_history_runtime where shop_id=p_shop for update;
 if not found then raise exception using errcode='40001',message='payment_history_local_writer_closed';end if;
 select * into n from public.payment_history_local_intents where operation_id=(w->>'operation_id')::uuid for update;
 if found and row(n.shop_id,n.shop_device_id,n.local_nonce,n.content_digest,n.request_fingerprint)
  is distinct from row(p_shop,p_device,(w->>'local_nonce')::uuid,w->>'content_digest',w->>'request_fingerprint') then
  raise exception using errcode='40001',message='payment_history_local_intent_conflict';end if;
 select * into saved from public.payment_history_local_outcome_witnesses where operation_id=(w->>'operation_id')::uuid;
 if found then
  if saved.outcome<>'aborted' or saved.witness_json is distinct from p_raw or saved.witness_sha256<>digest then
   raise exception using errcode='23505',message='payment_history_local_witness_conflict';end if;
  return jsonb_build_object('state','aborted','operation_id',w->>'operation_id','content_digest',w->>'content_digest','witness_sha256',saved.witness_sha256);
 end if;
 select * into p from public.payment_history_local_publications where operation_id=(w->>'operation_id')::uuid for update;
 if p.operation_id is not null then
  if n.operation_id is null then raise exception using errcode='40001',message='payment_history_local_intent_unregistered';end if;
  if row(p.shop_id,p.shop_device_id,p.server_dataset_id,p.local_dataset_id,p.restore_lineage_id,p.restore_epoch,p.writer_epoch,p.base_revision,p.operation_kind,p.request_fingerprint,p.content_digest)
   is distinct from row(p_shop,p_device,(w->>'server_dataset_id')::uuid,w->>'local_dataset_id',(w->>'restore_lineage_id')::uuid,
    (w->>'restore_epoch')::bigint,(w->>'writer_epoch')::bigint,(w->>'base_revision')::bigint,w->>'operation_kind',w->>'request_fingerprint',w->>'content_digest') then
   raise exception using errcode='40001',message='payment_history_local_witness_context_changed';end if;
  if p.state='committed' or p.server_receipt is not null or p.local_receipt_json is not null then
   raise exception using errcode='40001',message='payment_history_local_commit_exists';end if;
 end if;
 select * into c from public.payment_history_local_writer_contexts where shop_id=p_shop and shop_device_id=p_device for update;
 if not found or c.source_snapshot_id is null or r.dataset_id is distinct from (w->>'server_dataset_id')::uuid
  or row(c.local_dataset_id,c.restore_lineage_id,c.restore_epoch,c.local_revision,c.last_local_sequence)
   is distinct from row(w->>'local_dataset_id',(w->>'restore_lineage_id')::uuid,(w->>'restore_epoch')::bigint,(w->>'base_revision')::bigint,(w->>'local_sequence')::bigint)
  or not ((r.writer_authority='local' and r.writer_epoch=(w->>'writer_epoch')::bigint)
   or (r.writer_authority='frozen' and r.writer_epoch>(w->>'writer_epoch')::bigint and (p.grant_id is null or exists(
    select 1 from public.payment_history_local_drain_set d where d.shop_id=p_shop and d.frozen_writer_epoch=r.writer_epoch
     and d.operation_id=p.operation_id and d.grant_id=p.grant_id and d.content_digest=p.content_digest)))) then
  raise exception using errcode='40001',message='payment_history_local_witness_context_changed';end if;
 if not exists(select 1 from public.payment_history_source_snapshots s join public.payment_history_migration_runs m on m.shop_id=s.shop_id and m.run_id=s.run_id
  join public.payment_history_uploads u on u.shop_id=m.shop_id and u.upload_id=m.source_upload_id
  where s.shop_id=p_shop and s.snapshot_id=c.source_snapshot_id and s.shop_device_id=p_device and s.local_dataset_id=c.local_dataset_id
   and s.data_revision<=c.local_revision and s.restore_epoch<=c.restore_epoch and s.source_manifest->>'restoreLineageId'=c.restore_lineage_id::text
   and m.state='applied' and m.source_mode='local_baseline_v2' and u.state='verified' and u.file_sha256=s.archive_sha256) then
  raise exception using errcode='40001',message='payment_history_local_context_unverified';end if;
 if w->'grant_id'<>'null'::jsonb then
  if p.grant_id is null or p.grant_id::text is distinct from w->>'grant_id' or p_raw_proof is null or octet_length(convert_to(p_raw_proof,'UTF8'))>16384 then
   raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
  raw_proof:=p_raw_proof::json;perform app_private.payment_history_local_receipt_nodes_v2(raw_proof);
  if raw_proof::jsonb is distinct from p.authorized_proof or encode(extensions.digest(convert_to(p_raw_proof,'UTF8'),'sha256'),'hex') is distinct from w->>'proof_sha256' then
   raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
 elsif p_raw_proof is not null then raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
 -- The negative witness retires a durable local intent; no canonical revision,
 -- context high-water, original deadline or financial row is advanced/erased.
 -- A current authorized courier may differ from the original authorizer. Both
 -- provenance records are retained; the revoked old session is never accepted.
 if n.operation_id is null then
  insert into public.payment_history_local_intents(operation_id,shop_id,shop_device_id,local_nonce,content_digest,request_fingerprint,aborted)
   values((w->>'operation_id')::uuid,p_shop,p_device,(w->>'local_nonce')::uuid,w->>'content_digest',w->>'request_fingerprint',true);
 elsif not n.aborted then update public.payment_history_local_intents set aborted=true where operation_id=n.operation_id;end if;
 if p.operation_id is not null and p.state<>'aborted' then update public.payment_history_local_publications set state='aborted' where operation_id=p.operation_id;end if;
 insert into public.payment_history_local_outcome_witnesses(operation_id,outcome,witness_json,witness_sha256,publisher_staff_id,publisher_session_id,publisher_credential_version)
  values((w->>'operation_id')::uuid,'aborted',p_raw,digest,p_staff,p_session,p_version);
 return jsonb_build_object('state','aborted','operation_id',w->>'operation_id','content_digest',w->>'content_digest','witness_sha256',digest);
end;$$;
revoke all on function app_private.payment_history_local_abort_witness_v2(uuid,uuid,uuid,uuid,text,text,integer,text,text) from public,anon,authenticated,service_role;

-- One economic implementation for strict fresh delivery and registered outcome
-- recovery. The old helper delegates with attestation disabled. Original
-- authorization provenance remains distinct from the current courier.
create function app_private.payment_history_local_deliver_core_v2(p_shop uuid,p_device uuid,p_staff uuid,p_session uuid,
 p_device_hash text,p_session_hash text,p_version integer,p_payload jsonb,p_attested boolean) returns jsonb
language plpgsql volatile set search_path='' as $$
declare r public.payment_history_runtime;p public.payment_history_local_publications;c public.payment_history_local_writer_contexts;review public.payment_history_local_reviews;
 cap text;v_local_revision bigint;sequence_no bigint;raw text;local_receipt jsonb;result jsonb;receipt_hash text;batch uuid;revision_no bigint;changed integer;attested boolean:=false;begin
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
 if p_attested then
  select exists(select 1 from public.payment_history_local_outcome_witnesses o join public.payment_history_local_intents i on i.operation_id=o.operation_id
   where o.operation_id=p.operation_id and o.outcome='committed' and not i.aborted and i.shop_id=p_shop and i.shop_device_id=p_device
    and o.witness_sha256=encode(extensions.digest(convert_to(o.witness_json,'UTF8'),'sha256'),'hex')
    and o.witness_json::jsonb->>'operation_id'=p.operation_id::text and o.witness_json::jsonb->>'grant_id'=p.grant_id::text
    and o.witness_json::jsonb->>'local_nonce'=i.local_nonce::text and o.witness_json::jsonb->>'content_digest'=p.content_digest
    and o.witness_json::jsonb->>'local_revision'=v_local_revision::text and o.witness_json::jsonb->>'local_sequence'=sequence_no::text
    and o.witness_json::jsonb->>'local_receipt_sha256'=receipt_hash) into attested;
  if not attested then raise exception using errcode='42501',message='payment_history_local_witness_required';end if;
 end if;
 if p.state='committed' then
  if p.local_receipt_json is distinct from raw or p.local_revision is distinct from v_local_revision or p.local_sequence is distinct from sequence_no then
   raise exception using errcode='23505',message='payment_history_local_receipt_conflict';end if;
  return jsonb_build_object('state','committed','operation_id',p.operation_id,'content_digest',p.content_digest,'receipt',p.server_receipt);
 end if;
 select * into c from public.payment_history_local_writer_contexts where shop_id=p_shop and shop_device_id=p_device for update;
 select * into review from public.payment_history_local_reviews where operation_id=p.operation_id for share;
 if p.state<>'authorized' or p.authorized_proof is null
  or (not attested and (p.authorization_staff_id is distinct from p_staff or p.authorization_credential_version is distinct from p_version
   or p.authorization_session_id is distinct from p_session or p.expires_at<=clock_timestamp()))
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
  values(p.operation_id,p_shop,batch,case when p.operation_kind='Undo' then 'cancel' else 'apply' end,'pos_staff_manager',p.authorization_staff_id,p.operation_id,p.content_digest,result);
 -- Marking committed and all economics are in this same transaction. The
 -- revision fence can now advance past this resolved operation, never another.
 update public.payment_history_local_publications set state='committed',local_sequence=sequence_no,local_revision=v_local_revision,
  local_batch_id=local_receipt->>'BatchId',local_receipt_json=raw,server_receipt=result where operation_id=p.operation_id;
 update public.payment_history_local_writer_contexts set local_revision=v_local_revision,last_local_sequence=sequence_no where shop_id=p_shop and shop_device_id=p_device;
 if (not attested and p.expires_at<=clock_timestamp()) or current_setting('app.payment_history_publish_deadline',true)::timestamptz<=clock_timestamp() then
  raise exception using errcode='40001',message='payment_history_local_delivery_reconciliation_required';end if;
 update public.payment_history_runtime set revision=revision_no,updated_at=clock_timestamp() where shop_id=p_shop;
 perform app_private.payment_history_seal_revision_v1(p_shop,revision_no);
 return jsonb_build_object('state','committed','operation_id',p.operation_id,'content_digest',p.content_digest,'receipt',result);
end;$$;
revoke all on function app_private.payment_history_local_deliver_core_v2(uuid,uuid,uuid,uuid,text,text,integer,jsonb,boolean) from public,anon,authenticated,service_role;

create or replace function app_private.payment_history_local_deliver_fresh_v2(p_shop uuid,p_device uuid,p_staff uuid,p_session uuid,
 p_device_hash text,p_session_hash text,p_version integer,p_payload jsonb) returns jsonb
language sql volatile set search_path='' as $$
 select app_private.payment_history_local_deliver_core_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,p_payload,false);
$$;
revoke all on function app_private.payment_history_local_deliver_fresh_v2(uuid,uuid,uuid,uuid,text,text,integer,jsonb) from public,anon,authenticated,service_role;

create function app_private.payment_history_local_deliver_witness_v2(p_shop uuid,p_device uuid,p_staff uuid,p_session uuid,
 p_device_hash text,p_session_hash text,p_version integer,payload jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare w jsonb;raw_proof json;raw_witness text;raw_proof_text text;digest text;r public.payment_history_runtime;
 n public.payment_history_local_intents;p public.payment_history_local_publications;saved public.payment_history_local_outcome_witnesses;begin
 if not app_private.payment_history_local_keys_v2(payload,array['operation_id','grant_id','content_digest','local_revision','local_sequence','local_receipt_json','witness_json','local_proof_json'])
  or jsonb_typeof(payload->'witness_json') is distinct from 'string' or jsonb_typeof(payload->'local_proof_json') is distinct from 'string'
  or jsonb_typeof(payload->'local_receipt_json') is distinct from 'string' then
  raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
 raw_witness:=payload->>'witness_json';w:=app_private.payment_history_local_validate_outcome_witness_v2(raw_witness);
 perform app_private.payment_history_local_device_actor_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,
  case w->>'operation_kind' when 'Undo' then 'cancel' else 'import' end);
 if w->>'outcome'<>'committed' or row(w->>'shop_id',w->>'device_id',w->>'operation_id',w->>'grant_id',w->>'content_digest',w->>'local_revision',w->>'local_sequence')
  is distinct from row(p_shop::text,p_device::text,payload->>'operation_id',payload->>'grant_id',payload->>'content_digest',payload->>'local_revision',payload->>'local_sequence')
  or encode(extensions.digest(convert_to(payload->>'local_receipt_json','UTF8'),'sha256'),'hex') is distinct from w->>'local_receipt_sha256' then
  raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
 raw_proof_text:=payload->>'local_proof_json';
 if octet_length(convert_to(raw_proof_text,'UTF8')) not between 1 and 16384 then
  raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
 raw_proof:=raw_proof_text::json;perform app_private.payment_history_local_receipt_nodes_v2(raw_proof);
 digest:=encode(extensions.digest(convert_to(raw_witness,'UTF8'),'sha256'),'hex');
 select * into r from public.payment_history_runtime where shop_id=p_shop for update;
 if not found then raise exception using errcode='40001',message='payment_history_local_writer_closed';end if;
 select * into n from public.payment_history_local_intents where operation_id=(w->>'operation_id')::uuid for update;
 if not found or n.aborted or row(n.shop_id,n.shop_device_id,n.local_nonce,n.content_digest,n.request_fingerprint)
  is distinct from row(p_shop,p_device,(w->>'local_nonce')::uuid,w->>'content_digest',w->>'request_fingerprint') then
  raise exception using errcode='40001',message='payment_history_local_intent_conflict';end if;
 select * into p from public.payment_history_local_publications where operation_id=n.operation_id for update;
 if not found or p.grant_id::text is distinct from w->>'grant_id' or p.authorized_proof is null or p.issued_at is null or p.expires_at is null
  or row(p.shop_id,p.shop_device_id,p.server_dataset_id,p.local_dataset_id,p.restore_lineage_id,p.restore_epoch,p.writer_epoch,p.base_revision,p.operation_kind,p.request_fingerprint,p.content_digest)
   is distinct from row(p_shop,p_device,(w->>'server_dataset_id')::uuid,w->>'local_dataset_id',(w->>'restore_lineage_id')::uuid,
    (w->>'restore_epoch')::bigint,(w->>'writer_epoch')::bigint,(w->>'base_revision')::bigint,w->>'operation_kind',w->>'request_fingerprint',w->>'content_digest')
  or raw_proof::jsonb is distinct from p.authorized_proof
  or encode(extensions.digest(convert_to(raw_proof_text,'UTF8'),'sha256'),'hex') is distinct from w->>'proof_sha256'
  or (w->>'remaining_milliseconds')::bigint>floor(extract(epoch from (p.expires_at-p.issued_at))*1000) then
  raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
 select * into saved from public.payment_history_local_outcome_witnesses where operation_id=p.operation_id;
 if found then
  if saved.outcome<>'committed' or saved.witness_json is distinct from raw_witness or saved.witness_sha256<>digest then
   raise exception using errcode='23505',message='payment_history_local_witness_conflict';end if;
 else
  if p.state<>'authorized' then raise exception using errcode='40001',message='payment_history_local_commit_exists';end if;
  insert into public.payment_history_local_outcome_witnesses(operation_id,outcome,witness_json,witness_sha256,publisher_staff_id,publisher_session_id,publisher_credential_version)
   values(p.operation_id,'committed',raw_witness,digest,p_staff,p_session,p_version);
 end if;
 -- Witness registration and the existing economic engine commit or roll back
 -- together. Current authentication/dependencies/revision/restore/drain fences
 -- remain in that engine; this never issues or renews a local mutation grant.
 return app_private.payment_history_local_deliver_core_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,
  payload-array['witness_json','local_proof_json'],true);
end;$$;
revoke all on function app_private.payment_history_local_deliver_witness_v2(uuid,uuid,uuid,uuid,text,text,integer,jsonb) from public,anon,authenticated,service_role;
