-- Private semantic decision engine, not exposed until complete review/grant/delivery.
create function app_private.payment_history_local_inactive_owner_v2(p_operation uuid,p_previous_id text,p_previous_batch text,p_previous_apply uuid,p_identity text,p_previous_digest text) returns uuid
language plpgsql volatile set search_path='' as $$
declare p public.payment_history_local_publications;c public.payment_history_local_writer_contexts;
 previous public.payment_history_local_publications;target uuid;begin
 if p_previous_batch is null or length(btrim(p_previous_batch)) not between 1 and 256 or p_previous_batch ~ '[[:cntrl:]]'
  or p_previous_apply is null or p_previous_apply='00000000-0000-0000-0000-000000000000'::uuid then
  raise exception using errcode='22023',message='payment_history_local_correction_owner_invalid';end if;
 if p_previous_id is not null then
  if p_previous_id !~ '^[1-9][0-9]{0,18}$' then raise exception using errcode='22023',message='payment_history_local_correction_owner_invalid';end if;
  if p_previous_id::numeric>9223372036854775807 then raise exception using errcode='22023',message='payment_history_local_correction_owner_invalid';end if;
 end if;
 if coalesce(p_identity,'') !~ '^[0-9a-f]{64}$' or coalesce(p_previous_digest,'') !~ '^[0-9a-f]{64}$' then
  raise exception using errcode='22023',message='payment_history_local_correction_owner_invalid';end if;
 select * into p from public.payment_history_local_publications where operation_id=p_operation;
 if not found or p.operation_kind<>'Apply' or p.state<>'preparing' then raise exception using errcode='40001',message='payment_history_local_preparation_stale';end if;
 perform 1 from public.payment_history_runtime where shop_id=p.shop_id and dataset_id=p.server_dataset_id for share;
 if not found then raise exception using errcode='40001',message='payment_history_local_preparation_stale';end if;
 select * into p from public.payment_history_local_publications where operation_id=p_operation for share;
 if p.operation_kind<>'Apply' or p.state<>'preparing' then raise exception using errcode='40001',message='payment_history_local_preparation_stale';end if;
 select * into c from public.payment_history_local_writer_contexts where shop_id=p.shop_id and shop_device_id=p.shop_device_id for share;
 if not found or row(c.local_dataset_id,c.restore_lineage_id,c.restore_epoch) is distinct from row(p.local_dataset_id,p.restore_lineage_id,p.restore_epoch)
  or c.source_snapshot_id is null then raise exception using errcode='40001',message='payment_history_local_context_unverified';end if;
 select * into previous from public.payment_history_local_publications
  where operation_id=p_previous_apply and shop_id=p.shop_id and shop_device_id=p.shop_device_id
   and local_dataset_id=p.local_dataset_id and restore_lineage_id=p.restore_lineage_id and restore_epoch=p.restore_epoch
   and local_batch_id=p_previous_batch and operation_kind='Apply' and state='committed' and grant_id is not null for share;
 if found then
  -- An incremental receipt owns only versions inserted by this Apply. A
  -- duplicate observation cannot acquire another batch's correction rights.
  select v.movement_version_id into target from public.payment_history_local_publication_map m
   join public.payment_history_movement_versions v on v.shop_id=m.shop_id and v.movement_version_id=m.movement_version_id
   join public.payment_history_batches b on b.shop_id=v.shop_id and b.batch_id=v.owner_batch_id
   where m.shop_id=p.shop_id and m.operation_id=previous.operation_id and m.owned and not v.active and b.state='cancelled'
    and b.batch_id=(previous.server_receipt->>'batch_id')::uuid and v.identity_key=p_identity and v.economic_digest=p_previous_digest
   for share of v,b;
 else
  -- A baseline mapping is accepted only through this context's verified,
  -- applied archive, the immutable source batch/Apply and its exact row map.
  select v.movement_version_id into target from public.payment_history_source_snapshots s
   join public.payment_history_migration_runs run on run.shop_id=s.shop_id and run.run_id=s.run_id and run.state='applied'
   join public.payment_history_uploads u on u.shop_id=run.shop_id and u.upload_id=run.source_upload_id and u.state='verified' and u.file_sha256=s.archive_sha256
   join public.payment_history_source_objects o on o.shop_id=s.shop_id and o.source_snapshot_id=s.snapshot_id and o.table_name='batches' and o.local_id=p_previous_batch
   join public.payment_history_local_batch_map bm on bm.shop_id=p.shop_id and bm.shop_device_id=p.shop_device_id and bm.local_dataset_id=p.local_dataset_id
    and bm.local_batch_id=o.local_id and bm.source_object_digest=o.object_digest
   join public.payment_history_local_movement_map mm on mm.shop_id=bm.shop_id and mm.shop_device_id=bm.shop_device_id and mm.local_dataset_id=bm.local_dataset_id
    and mm.local_movement_id=p_previous_id and mm.owns_version
   join public.payment_history_movement_versions v on v.shop_id=mm.shop_id and v.movement_version_id=mm.movement_version_id and v.owner_batch_id=bm.batch_id
   join public.payment_history_batches b on b.shop_id=v.shop_id and b.batch_id=v.owner_batch_id
   where s.shop_id=p.shop_id and s.snapshot_id=c.source_snapshot_id and s.shop_device_id=p.shop_device_id and s.local_dataset_id=p.local_dataset_id and s.restore_epoch=p.restore_epoch
    and (o.original_object->>'apply_operation_id')::uuid=p_previous_apply
    and not v.active and b.state='cancelled' and v.identity_key=p_identity and v.economic_digest=p_previous_digest
    and mm.source_economic_digest=v.economic_digest for share of s,run,u,o,bm,mm,v,b;
 end if;
 -- Windows corrections apply to an owned inactive version after Undo. An
 -- active conflict is always blocked. Older or ambiguous inactive branches
 -- cannot be silently reactivated through a historical ownership reference.
 if target is null or exists(select 1 from public.payment_history_movement_versions v where v.shop_id=p.shop_id and v.identity_key=p_identity and v.active)
  or exists(select 1 from public.payment_history_movement_versions newer join public.payment_history_movement_versions old on old.movement_version_id=target and old.shop_id=p.shop_id
    where newer.shop_id=p.shop_id and newer.identity_key=p_identity and newer.movement_version_id<>target
     and (newer.supersedes_version_id=target or newer.created_revision>old.created_revision or newer.created_revision=old.created_revision
      and not exists(select 1 from public.payment_history_movement_versions child where child.shop_id=p.shop_id and child.supersedes_version_id=newer.movement_version_id))) then
  raise exception using errcode='40001',message='payment_history_local_correction_owner_unverified';end if;
 return target;
end;$$;
revoke all on function app_private.payment_history_local_inactive_owner_v2(uuid,text,text,uuid,text,text) from public,anon,authenticated,service_role;

-- Preserve the qualified correction shape and delegate only ownership. The
-- unchanged-economic reimport path can use the same owner resolver without
-- inventing an approval or an incremental numeric local transaction ID.
create or replace function app_private.payment_history_local_correction_target_v2(p_operation uuid,p_fields jsonb,p_identity text) returns uuid
language plpgsql volatile set search_path='' as $$begin
 perform app_private.payment_history_local_page_v2(jsonb_build_array(jsonb_build_object('kind','correction','fields',p_fields))::text);
 return app_private.payment_history_local_inactive_owner_v2(p_operation,p_fields->>'previous_transaction_id',p_fields->>'previous_local_batch_id',
  (p_fields->>'previous_apply_operation_id')::uuid,p_identity,p_fields->>'previous_economic_digest');
end;$$;
revoke all on function app_private.payment_history_local_correction_target_v2(uuid,jsonb,text) from public,anon,authenticated,service_role;

-- Review cache only. These rows have no financial effect and are mutable only
-- before authorization. Canonical facts remain in the existing ledger tables.
create table public.payment_history_local_reviews (
 shop_id uuid not null,operation_id uuid primary key,
 review_token uuid not null default gen_random_uuid(),server_dataset_id uuid not null,server_revision bigint not null check(server_revision>=0),
 writer_epoch bigint not null check(writer_epoch>0),next_page integer not null default 1 check(next_page between 1 and 20001),
 planned_batch_id uuid not null default gen_random_uuid(),dependency_hashes jsonb not null default '{}',
 local_inserted integer not null default 0 check(local_inserted between 0 and 100000),
 local_duplicates integer not null default 0 check(local_duplicates between 0 and 100000),
 local_rejected integer not null default 0 check(local_rejected>=0),
 local_corrections integer not null default 0 check(local_corrections between 0 and 100000),
 local_deactivated integer not null default 0 check(local_deactivated between 0 and 100000),local_gross bigint not null default 0,
 canonical_inserted integer not null default 0 check(canonical_inserted between 0 and 100000),
 canonical_duplicates integer not null default 0 check(canonical_duplicates between 0 and 100000),
 canonical_deactivated integer not null default 0 check(canonical_deactivated between 0 and 100000),canonical_gross bigint not null default 0,
 foreign key(shop_id,operation_id) references public.payment_history_local_publications(shop_id,operation_id),
 check(jsonb_typeof(dependency_hashes)='object' and octet_length(dependency_hashes::text)<=262144),
 check(local_inserted+local_duplicates<=100000 and canonical_inserted+canonical_duplicates<=100000 and local_corrections<=local_inserted)
);
create table public.payment_history_local_review_movements (
 shop_id uuid not null,operation_id uuid not null,source_ordinal integer not null check(source_ordinal between 1 and 100000),
 source_page integer not null,source_record integer not null,binding_page integer not null,binding_record integer not null,
 local_scope_id text not null,local_identity text not null check(local_identity ~ '^[0-9a-f]{64}$'),
 canonical_identity text not null check(canonical_identity ~ '^[0-9a-f]{64}$'),merchant_id uuid not null,
 transaction jsonb not null,economics jsonb not null,economic_digest text not null check(economic_digest ~ '^[0-9a-f]{64}$'),
 local_inserted boolean not null,local_correction boolean not null,canonical_owned boolean not null,
 canonical_version uuid not null,supersedes_version uuid,
 primary key(operation_id,source_ordinal),
 foreign key(shop_id,operation_id) references public.payment_history_local_publications(shop_id,operation_id),
 foreign key(operation_id) references public.payment_history_local_reviews(operation_id) on delete cascade,
 foreign key(operation_id,source_page,source_record) references public.payment_history_local_preparation_records(operation_id,page_ordinal,record_ordinal),
 foreign key(operation_id,binding_page,binding_record) references public.payment_history_local_preparation_records(operation_id,page_ordinal,record_ordinal),
 check(jsonb_typeof(transaction)='object' and octet_length(transaction::text)<=32768 and jsonb_typeof(economics)='object' and octet_length(economics::text)<=4096),
 check(not local_correction or local_inserted)
);
alter table public.payment_history_local_reviews enable row level security;
alter table public.payment_history_local_review_movements enable row level security;
revoke all on public.payment_history_local_reviews,public.payment_history_local_review_movements from public,anon,authenticated,service_role;
create index payment_history_local_review_local_identity_idx on public.payment_history_local_review_movements(operation_id,local_identity,source_ordinal) where local_inserted;
create index payment_history_local_review_canonical_identity_idx on public.payment_history_local_review_movements(operation_id,canonical_identity,source_ordinal);

create function app_private.payment_history_local_review_cache_guard_v2() returns trigger
language plpgsql set search_path='' as $$
declare op uuid;begin
 if tg_op='INSERT' then op:=new.operation_id;else op:=old.operation_id;end if;
 if not exists(select 1 from public.payment_history_local_publications p where p.operation_id=op and p.state='preparing' and p.grant_id is null) then
  raise exception using errcode='55000',message='payment_history_local_review_immutable';end if;
 if tg_op='UPDATE' and row(new.operation_id,new.shop_id) is distinct from row(old.operation_id,old.shop_id) then
  raise exception using errcode='55000',message='payment_history_local_review_immutable';end if;
 if tg_op='DELETE' then return old;else return new;end if;
end;$$;
revoke all on function app_private.payment_history_local_review_cache_guard_v2() from public,anon,authenticated,service_role;
create trigger payment_history_local_review_cache_guard before insert or update or delete on public.payment_history_local_reviews
 for each row execute function app_private.payment_history_local_review_cache_guard_v2();
create trigger payment_history_local_review_cache_guard before insert or update or delete on public.payment_history_local_review_movements
 for each row execute function app_private.payment_history_local_review_cache_guard_v2();

create function app_private.payment_history_local_auxiliary_v2(p_operation uuid,p_kind text,p_key text)
 returns table(source_page integer,source_record integer,fields jsonb)
language sql stable set search_path='' as $$
 select i.page_ordinal,i.record_ordinal,page.page_json::jsonb->(i.record_ordinal-1)->'fields'
 from public.payment_history_local_preparation_records i
 join public.payment_history_local_publication_pages page on page.operation_id=i.operation_id and page.ordinal=i.page_ordinal
 where i.operation_id=p_operation and i.kind=p_kind and i.auxiliary_key=p_key
  and p_kind in('operation','overlap','file','binding','correction','undo');
$$;
revoke all on function app_private.payment_history_local_auxiliary_v2(uuid,text,text) from public,anon,authenticated,service_role;

-- Bind only policy-relevant values, avoiding session-time-zone-dependent
-- timestamp rendering and cosmetic labels. All dependency rows stay locked
-- until this page/final decision transaction ends.
create function app_private.payment_history_local_review_dependency_v2(p_shop uuid,p_dependencies jsonb,p_kind text,p_id uuid) returns jsonb
language plpgsql volatile set search_path='' as $$
declare value jsonb;key text;hash text;begin
 if p_id is null or jsonb_typeof(p_dependencies) is distinct from 'object' or p_kind is null or p_kind not in('e','a','m') then
  raise exception using errcode='22023',message='payment_history_local_review_dependency_invalid';end if;
 if p_kind='e' then
  select jsonb_build_object('id',e.evidence_id,'kind',e.kind,'level',e.verification_level,'status',e.status,'version',e.policy_version,
   'document_sha256',e.document_sha256,'document_upload_id',e.document_upload_id,'scope',e.scope) into value
   from public.payment_history_evidence e where e.shop_id=p_shop and e.evidence_id=p_id for share;
 elsif p_kind='a' then
  select jsonb_build_object('id',a.alias_id,'version',a.alias_version,'key',a.alias_key,'merchant_id',a.merchant_id,'evidence_id',a.evidence_id,'active',a.active) into value
   from public.payment_history_merchant_aliases a where a.shop_id=p_shop and a.alias_id=p_id for share;
 else
  select jsonb_build_object('id',m.merchant_id,'provider',m.provider,'evidence_id',m.evidence_id) into value
   from public.payment_history_merchants m where m.shop_id=p_shop and m.merchant_id=p_id for share;
 end if;
 if value is null then raise exception using errcode='40001',message='payment_history_local_review_stale';end if;
 key:=p_kind||':'||p_id::text;hash:=encode(extensions.digest(convert_to(value::text,'UTF8'),'sha256'),'hex');
 if p_dependencies ? key then
  if p_dependencies->>key is distinct from hash then raise exception using errcode='40001',message='payment_history_local_review_stale';end if;
  return p_dependencies;
 end if;
 if (select count(*) from jsonb_object_keys(p_dependencies))>=1024 then raise exception using errcode='54000',message='payment_history_local_preparation_capacity';end if;
 return p_dependencies||jsonb_build_object(key,hash);
end;$$;
revoke all on function app_private.payment_history_local_review_dependency_v2(uuid,jsonb,text,uuid) from public,anon,authenticated,service_role;

create function app_private.payment_history_local_review_dependencies_current_v2(p_shop uuid,p_dependencies jsonb) returns void
language plpgsql volatile set search_path='' as $$
declare item record;current jsonb;begin
 if jsonb_typeof(p_dependencies) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_dependencies))>1024 then
  raise exception using errcode='22023',message='payment_history_local_review_dependency_invalid';end if;
 for item in select key,value from jsonb_each_text(p_dependencies) order by key loop
  if item.key !~ '^[eam]:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or item.value !~ '^[0-9a-f]{64}$' then
   raise exception using errcode='22023',message='payment_history_local_review_dependency_invalid';end if;
  current:=app_private.payment_history_local_review_dependency_v2(p_shop,'{}',left(item.key,1),substring(item.key from 3)::uuid);
  if current->>item.key is distinct from item.value then raise exception using errcode='40001',message='payment_history_local_review_stale';end if;
 end loop;
end;$$;
revoke all on function app_private.payment_history_local_review_dependencies_current_v2(uuid,jsonb) from public,anon,authenticated,service_role;

-- One already-staged movement, evaluated against immutable local provenance
-- and the canonical ledger independently. Called only by the private bounded
-- page reviewer below; neither path issues a grant or writes financial facts.
create function app_private.payment_history_local_review_movement_v2(p_operation uuid,p_page integer,p_record integer) returns void
language plpgsql volatile set search_path='' as $$
declare p public.payment_history_local_publications;r public.payment_history_runtime;review public.payment_history_local_reviews;
 item record;file_row record;binding record;overlap_row record;correction_row record;mapping record;
 f jsonb;t jsonb;semantic jsonb;economics jsonb;local_previous jsonb;pending jsonb;approval jsonb;
 local_key text;source_key text;native_policy uuid;other_policy uuid;policy_kind text;dependency jsonb;proof_id uuid;
 local_new boolean;is_correction boolean:=false;canonical_new boolean;version_id uuid;supersedes uuid;existing_digest text;
 begin
 select * into p from public.payment_history_local_publications where operation_id=p_operation;
 if not found then raise exception using errcode='40001',message='payment_history_local_preparation_stale';end if;
 select * into r from public.payment_history_runtime where shop_id=p.shop_id for share;
 select * into p from public.payment_history_local_publications where operation_id=p_operation for update;
 select * into review from public.payment_history_local_reviews where operation_id=p_operation for update;
 if not found or p.state<>'preparing' or p.operation_kind<>'Apply' or p.grant_id is not null or r.writer_authority<>'local'
  or row(review.server_dataset_id,review.server_revision,review.writer_epoch) is distinct from row(r.dataset_id,r.revision,r.writer_epoch)
  or row(p.server_dataset_id,p.writer_epoch) is distinct from row(r.dataset_id,r.writer_epoch) then
  raise exception using errcode='40001',message='payment_history_local_review_stale';end if;
 select * into item from app_private.payment_history_local_review_records_v2(p.shop_id,p.shop_device_id,p_operation,p_page) where record_ordinal=p_record and kind='movement';
 if not found then raise exception using errcode='22023',message='payment_history_local_review_movement_invalid';end if;
 if exists(select 1 from public.payment_history_local_review_movements where operation_id=p_operation and source_ordinal=item.movement_ordinal) then return;end if;
 f:=item.fields;dependency:=review.dependency_hashes;
 select * into file_row from app_private.payment_history_local_auxiliary_v2(p_operation,'file',app_private.payment_history_field_hash_v1(array[f->>'source_file_id']));
 select * into binding from app_private.payment_history_local_auxiliary_v2(p_operation,'binding',app_private.payment_history_field_hash_v1(array[f->>'alias_key']));
 select * into overlap_row from app_private.payment_history_local_auxiliary_v2(p_operation,'overlap',app_private.payment_history_field_hash_v1(array['single']));
 if file_row.fields is null or file_row.fields->>'profile' is distinct from f->>'profile' or binding.fields is null or overlap_row.fields is null
  or length(coalesce(binding.fields->>'local_scope_id','')) not between 1 and 256 then
  raise exception using errcode='22023',message='payment_history_local_review_source_invalid';end if;
 t:=app_private.payment_history_local_transaction_v2(f,file_row.fields->>'sha256');
 select a.alias_id,a.merchant_id,a.evidence_id into mapping from public.payment_history_merchant_aliases a
  join public.payment_history_evidence e on e.shop_id=a.shop_id and e.evidence_id=a.evidence_id
  join public.payment_history_merchants m on m.shop_id=a.shop_id and m.merchant_id=a.merchant_id
  where a.shop_id=p.shop_id and a.alias_key=f->>'alias_key' and a.active and a.alias_version='getnet-merchant-alias-v1'
   and m.provider='getnet' and e.kind='merchant_mapping' and e.status='verified' and e.verification_level<>'unverified'
   and e.scope->>'merchant_id'=a.merchant_id::text and e.scope->>'alias_key'=a.alias_key for share of a,e,m;
 if not found then raise exception using errcode='22023',message='payment_history_local_merchant_unverified';end if;
 dependency:=app_private.payment_history_local_review_dependency_v2(p.shop_id,dependency,'a',mapping.alias_id);
 dependency:=app_private.payment_history_local_review_dependency_v2(p.shop_id,dependency,'m',mapping.merchant_id);
 dependency:=app_private.payment_history_local_review_dependency_v2(p.shop_id,dependency,'e',mapping.evidence_id);
 select e.evidence_id into native_policy from public.payment_history_evidence e where e.shop_id=p.shop_id and e.kind='native_start'
  and e.scope->>'native_start_ticks'=overlap_row.fields->>'native_start_ticks'
  and app_private.payment_history_proof_covers_v1(p.shop_id,array[e.evidence_id],'native_start',mapping.merchant_id,file_row.fields->>'sha256',t)
  order by e.evidence_id limit 1 for share;
 policy_kind:=case when f->>'profile'='GetnetModern' then 'modern_time' else 'legacy_currency' end;
 select e.evidence_id into other_policy from public.payment_history_evidence e where e.shop_id=p.shop_id and e.kind=policy_kind
  and app_private.payment_history_proof_covers_v1(p.shop_id,array[e.evidence_id],policy_kind,mapping.merchant_id,file_row.fields->>'sha256',t)
  order by e.evidence_id limit 1 for share;
 if native_policy is null or other_policy is null then raise exception using errcode='22023',message='payment_history_local_policy_unverified';end if;
 semantic:=app_private.payment_history_local_review_transaction_v2(p.shop_id,f,file_row.fields->>'sha256',overlap_row.fields->>'native_start_ticks',array[native_policy,other_policy]);
 economics:=semantic->'economics';
 for proof_id in select value::uuid from jsonb_array_elements_text(semantic->'evidence_ids') loop
  dependency:=app_private.payment_history_local_review_dependency_v2(p.shop_id,dependency,'e',proof_id);
 end loop;
 local_key:=app_private.payment_history_field_hash_v1(array[p.shop_id::text,binding.fields->>'local_scope_id',f->>'external_namespace',f->>'external_id']);
 select m.economics into pending from public.payment_history_local_review_movements m where m.operation_id=p_operation and m.local_identity=local_key and m.local_inserted order by m.source_ordinal limit 1;
 if found then local_previous:=jsonb_build_object('active',true,'economics',pending);
 else local_previous:=app_private.payment_history_local_projection_v2(p_operation,binding.fields->>'local_scope_id',f->>'external_namespace',f->>'external_id');end if;
 local_new:=not coalesce((local_previous->>'active')::boolean,false);
 source_key:=app_private.payment_history_field_hash_v1(array[f->>'source_file_id',f->>'source_sheet',f->>'source_row']);
 select * into correction_row from app_private.payment_history_local_auxiliary_v2(p_operation,'correction',source_key);
 approval:=correction_row.fields;
 if not local_new and app_private.payment_history_local_economic_conflict_v2(local_previous->'economics',economics) then
  raise exception using errcode='40001',message='payment_history_local_economic_conflict';end if;
 if local_new and local_previous is not null and app_private.payment_history_local_economic_conflict_v2(local_previous->'economics',economics) then
  if approval is null or approval->>'previous_transaction_id' is distinct from local_previous->>'local_transaction_id'
   or approval->>'previous_local_batch_id' is distinct from local_previous->>'local_batch_id'
   or (approval->>'previous_apply_operation_id')::uuid is distinct from (local_previous->>'apply_operation_id')::uuid
   or approval->>'previous_economic_digest' is distinct from local_previous->>'economic_digest'
   or approval->>'proposed_economic_digest' is distinct from semantic->>'economic_digest'
   or approval->>'context_fingerprint' is distinct from app_private.payment_history_field_hash_v1(array['correction-review-context-v1',p.shop_id::text,p.local_dataset_id,p.base_revision::text,p.restore_epoch::text])
   or length(btrim(coalesce(approval->>'evidence_reference',''))) not between 1 and 2048
   or approval->>'approval_fingerprint' is distinct from app_private.payment_history_field_hash_v1(array[approval->>'previous_transaction_id',approval->>'previous_economic_digest',approval->>'proposed_economic_digest',approval->>'source_file_id',approval->>'source_sheet',approval->>'source_row',approval->>'context_fingerprint',approval->>'evidence_reference']) then
   raise exception using errcode='40001',message='payment_history_local_correction_unverified';end if;
  is_correction:=true;
 elsif approval is not null then raise exception using errcode='40001',message='payment_history_local_correction_stale';end if;
 select movement_version_id,economic_digest into version_id,existing_digest from public.payment_history_movement_versions
  where shop_id=p.shop_id and identity_key=semantic->>'identity_key' and active for share;
 if found then
  if existing_digest is distinct from semantic->>'economic_digest' then raise exception using errcode='40001',message='payment_history_canonical_economic_conflict';end if;
  canonical_new:=false;
 else
  select canonical_version,economic_digest into version_id,existing_digest from public.payment_history_local_review_movements
   where operation_id=p_operation and canonical_identity=semantic->>'identity_key' order by source_ordinal limit 1;
  if found then
   if existing_digest is distinct from semantic->>'economic_digest' then raise exception using errcode='40001',message='payment_history_canonical_economic_conflict';end if;
   canonical_new:=false;
  else
   if exists(select 1 from public.payment_history_movement_versions where shop_id=p.shop_id and identity_key=semantic->>'identity_key') then
    if local_previous is null or not local_new then raise exception using errcode='40001',message='payment_history_local_correction_owner_unverified';end if;
    supersedes:=app_private.payment_history_local_inactive_owner_v2(p_operation,local_previous->>'local_transaction_id',local_previous->>'local_batch_id',
     (local_previous->>'apply_operation_id')::uuid,semantic->>'identity_key',local_previous->>'economic_digest');
   elsif local_previous is not null then raise exception using errcode='40001',message='payment_history_local_projection_unverified';end if;
   version_id:=gen_random_uuid();canonical_new:=true;
  end if;
 end if;
 insert into public.payment_history_local_review_movements values(p.shop_id,p_operation,item.movement_ordinal,p_page,p_record,binding.source_page,binding.source_record,
  binding.fields->>'local_scope_id',local_key,semantic->>'identity_key',mapping.merchant_id,semantic->'transaction',economics,semantic->>'economic_digest',
  local_new,is_correction,canonical_new,version_id,supersedes);
 update public.payment_history_local_reviews set dependency_hashes=dependency,
  local_inserted=local_inserted+local_new::integer,local_duplicates=local_duplicates+(not local_new)::integer,
  local_corrections=local_corrections+is_correction::integer,local_gross=local_gross+case when local_new then (economics->>'grossClp')::bigint else 0 end,
  canonical_inserted=canonical_inserted+canonical_new::integer,canonical_duplicates=canonical_duplicates+(not canonical_new)::integer,
  canonical_gross=canonical_gross+case when canonical_new then (economics->>'grossClp')::bigint else 0 end where operation_id=p_operation;
end;$$;
revoke all on function app_private.payment_history_local_review_movement_v2(uuid,integer,integer) from public,anon,authenticated,service_role;

create function app_private.payment_history_local_review_apply_page_v2(p_shop uuid,p_device uuid,p_operation uuid,p_root text,p_page integer,p_token uuid default null) returns jsonb
language plpgsql volatile set search_path='' as $$
declare r public.payment_history_runtime;p public.payment_history_local_publications;c public.payment_history_local_writer_contexts;
 review public.payment_history_local_reviews;item record;counts record;begin
 if p_operation is null or p_page is null or p_page not between 1 and 20000 or coalesce(p_root,'') !~ '^[0-9a-f]{64}$' then
  raise exception using errcode='22023',message='payment_history_local_review_page_invalid';end if;
 select * into r from public.payment_history_runtime where shop_id=p_shop for share;
 select * into p from public.payment_history_local_publications where shop_id=p_shop and shop_device_id=p_device and operation_id=p_operation for update;
 if not found or p.state<>'preparing' or p.operation_kind<>'Apply' or p.grant_id is not null or p.content_digest<>p_root or r.writer_authority<>'local'
  or row(p.server_dataset_id,p.writer_epoch) is distinct from row(r.dataset_id,r.writer_epoch) then
  raise exception using errcode='40001',message='payment_history_local_review_stale';end if;
 select * into c from public.payment_history_local_writer_contexts where shop_id=p_shop and shop_device_id=p_device for share;
 if not found or c.source_snapshot_id is null or row(c.local_dataset_id,c.restore_lineage_id,c.restore_epoch) is distinct from row(p.local_dataset_id,p.restore_lineage_id,p.restore_epoch)
  or c.local_revision>p.base_revision then raise exception using errcode='40001',message='payment_history_local_context_unverified';end if;
 -- Even an empty Apply must have a complete immutable index and real baseline.
 perform 1 from app_private.payment_history_local_review_records_v2(p_shop,p_device,p_operation,p_page);
 perform app_private.payment_history_local_projection_v2(p_operation,'review-context-probe','getnet.legacy.transaction','review-context-probe');
 if exists(select 1 from public.payment_history_local_preparation_records where operation_id=p_operation and kind='undo') then
  raise exception using errcode='22023',message='payment_history_local_review_source_invalid';end if;
 select * into review from public.payment_history_local_reviews where operation_id=p_operation for update;
 if not found then
  if p_page<>1 or p_token is not null then raise exception using errcode='40001',message='payment_history_local_review_stale';end if;
  insert into public.payment_history_local_reviews(shop_id,operation_id,server_dataset_id,server_revision,writer_epoch)
   values(p_shop,p_operation,r.dataset_id,r.revision,r.writer_epoch) returning * into review;
 end if;
 if row(review.server_dataset_id,review.server_revision,review.writer_epoch) is distinct from row(r.dataset_id,r.revision,r.writer_epoch)
  or (p_token is not null and p_token<>review.review_token) or (p_token is null and p_page<>1) or p_page>review.next_page then
  raise exception using errcode='40001',message='payment_history_local_review_stale';end if;
 perform app_private.payment_history_local_review_dependencies_current_v2(p_shop,review.dependency_hashes);
 if p_page=review.next_page then
  for item in select * from app_private.payment_history_local_review_records_v2(p_shop,p_device,p_operation,p_page) loop
   if item.kind='movement' then perform app_private.payment_history_local_review_movement_v2(p_operation,p_page,item.record_ordinal);
   elsif item.kind='rejected' then update public.payment_history_local_reviews set local_rejected=local_rejected+1 where operation_id=p_operation;end if;
  end loop;
  update public.payment_history_local_reviews set next_page=next_page+1 where operation_id=p_operation returning * into review;
 end if;
 if review.next_page>p.page_count then
  select count(*) filter(where kind='movement') movements,count(*) filter(where kind='correction') corrections into counts
   from public.payment_history_local_preparation_records where operation_id=p_operation;
  if counts.movements<>review.local_inserted+review.local_duplicates or counts.corrections<>review.local_corrections then
   raise exception using errcode='40001',message='payment_history_local_review_incomplete';end if;
 end if;
 return jsonb_build_object('state',case when review.next_page>p.page_count then 'reviewed' else 'reviewing' end,'operation_id',p.operation_id,
  'content_digest',p.content_digest,'review_token',review.review_token,'next_ordinal',review.next_page);
end;$$;
revoke all on function app_private.payment_history_local_review_apply_page_v2(uuid,uuid,uuid,text,integer,uuid) from public,anon,authenticated,service_role;
