-- Derived local projection for private v2 review. No public boundary or grant.
-- Keep only provenance coordinates in the existing canonical map; economics
-- are read from the immutable baseline objects or immutable staged pages.
alter table public.payment_history_local_publication_map
 add column local_inserted boolean,
 add column local_scope_id text,
 add column local_external_namespace text,
 add column local_external_id text,
 add column source_page_ordinal integer,
 add column source_record_ordinal integer,
 add column binding_page_ordinal integer,
 add column binding_record_ordinal integer,
 add constraint payment_history_local_map_projection_shape check (
  num_nonnulls(local_inserted,local_scope_id,local_external_namespace,local_external_id,source_page_ordinal,source_record_ordinal,binding_page_ordinal,binding_record_ordinal)=0
  or (num_nonnulls(local_inserted,local_scope_id,local_external_namespace,local_external_id,source_page_ordinal,source_record_ordinal,binding_page_ordinal,binding_record_ordinal)=8
   and length(local_scope_id) between 1 and 256 and length(local_external_namespace) between 1 and 256 and length(local_external_id) between 1 and 256
   and source_page_ordinal between 1 and 20000 and binding_page_ordinal between 1 and 20000
   and source_record_ordinal between 1 and 200 and binding_record_ordinal between 1 and 200));
create index payment_history_local_projection_identity_idx on public.payment_history_local_publication_map
 (shop_id,local_scope_id,local_external_namespace,local_external_id,operation_id) where local_inserted;
create index payment_history_baseline_projection_identity_idx on public.payment_history_source_objects
 (shop_id,source_snapshot_id,((original_object->>'merchant_scope_id') collate "C"),((original_object->>'external_namespace') collate "C"),((original_object->>'external_id') collate "C"))
 where table_name='movements';
create index payment_history_local_projection_undo_idx on public.payment_history_local_publications
 (shop_id,shop_device_id,local_dataset_id,restore_lineage_id,restore_epoch,local_batch_id,local_sequence)
 where operation_kind='Undo' and state='committed';

create function app_private.payment_history_local_map_source_v2() returns trigger
language plpgsql set search_path='' as $$
declare p public.payment_history_local_publications;m jsonb;b jsonb;begin
 if new.local_inserted is null then return new;end if;
 select * into p from public.payment_history_local_publications where shop_id=new.shop_id and operation_id=new.operation_id;
 if not found or p.operation_kind<>'Apply' or p.state not in('authorized','committed') or p.grant_id is null then
  raise exception using errcode='40001',message='payment_history_local_projection_unverified';end if;
 select page_json::jsonb->(new.source_record_ordinal-1) into m from public.payment_history_local_publication_pages
  where operation_id=p.operation_id and ordinal=new.source_page_ordinal;
 select page_json::jsonb->(new.binding_record_ordinal-1) into b from public.payment_history_local_publication_pages
  where operation_id=p.operation_id and ordinal=new.binding_page_ordinal;
 if m->>'kind' is distinct from 'movement' or b->>'kind' is distinct from 'binding'
  or m#>>'{fields,external_namespace}' is distinct from new.local_external_namespace
  or m#>>'{fields,external_id}' is distinct from new.local_external_id
  or b#>>'{fields,local_scope_id}' is distinct from new.local_scope_id
  or b#>>'{fields,alias_key}' is distinct from m#>>'{fields,alias_key}' then
  raise exception using errcode='40001',message='payment_history_local_projection_unverified';end if;
 return new;
end;$$;
revoke all on function app_private.payment_history_local_map_source_v2() from public,anon,authenticated,service_role;
create trigger payment_history_local_map_source before insert on public.payment_history_local_publication_map
 for each row execute function app_private.payment_history_local_map_source_v2();

-- Same local conflict rule as SQLite: a missing optional amount is unknown,
-- while a known value cannot contradict another known value. Canonical digest
-- equality remains a separate decision and is deliberately not used here.
create function app_private.payment_history_local_economic_conflict_v2(a jsonb,b jsonb) returns boolean
language sql immutable set search_path='' as $$
 select a is null or b is null
  or exists(select 1 from unnest(array['businessTicks','grossClp','movementKind','transactionState']) k
   where a->>k is null or b->>k is null or a->>k is distinct from b->>k)
  or exists(select 1 from unnest(array['commissionClp','commissionVatClp','netClp']) k
   where a->>k is not null and b->>k is not null and a->>k is distinct from b->>k);
$$;
revoke all on function app_private.payment_history_local_economic_conflict_v2(jsonb,jsonb) from public,anon,authenticated,service_role;

create function app_private.payment_history_local_projection_v2(p_operation uuid,p_scope text,p_namespace text,p_external_id text) returns jsonb
language plpgsql volatile set search_path='' as $$
declare p public.payment_history_local_publications;c public.payment_history_local_writer_contexts;
 s public.payment_history_source_snapshots;j public.payment_history_migration_runs;u public.payment_history_uploads;
 candidate record;result jsonb;begin
 if p_operation is null or p_scope is null or length(p_scope) not between 1 and 256
  or p_namespace is null or length(p_namespace) not between 1 and 256 or p_external_id is null or length(p_external_id) not between 1 and 256 then
  raise exception using errcode='22023',message='payment_history_local_projection_invalid';end if;
 select * into p from public.payment_history_local_publications where operation_id=p_operation;
 if not found then raise exception using errcode='40001',message='payment_history_local_preparation_stale';end if;
 -- Runtime first, matching prepare, baseline and cutover lock order.
 perform 1 from public.payment_history_runtime where shop_id=p.shop_id and dataset_id=p.server_dataset_id for share;
 if not found then raise exception using errcode='40001',message='payment_history_local_preparation_stale';end if;
 select * into p from public.payment_history_local_publications where operation_id=p_operation for share;
 if p.state<>'preparing' then raise exception using errcode='40001',message='payment_history_local_preparation_stale';end if;
 select * into c from public.payment_history_local_writer_contexts where shop_id=p.shop_id and shop_device_id=p.shop_device_id for share;
 if not found or c.source_snapshot_id is null or row(c.local_dataset_id,c.restore_lineage_id,c.restore_epoch)
  is distinct from row(p.local_dataset_id,p.restore_lineage_id,p.restore_epoch) or c.local_revision>p.base_revision then
  raise exception using errcode='40001',message='payment_history_local_context_unverified';end if;
 select * into s from public.payment_history_source_snapshots where shop_id=p.shop_id and snapshot_id=c.source_snapshot_id;
 select * into j from public.payment_history_migration_runs where shop_id=p.shop_id and run_id=s.run_id;
 select * into u from public.payment_history_uploads where shop_id=p.shop_id and upload_id=j.source_upload_id;
 if s.snapshot_id is null or j.run_id is null or u.upload_id is null or j.state<>'applied' or j.source_mode<>'local_baseline_v2' or u.state<>'verified'
  or u.file_sha256<>s.archive_sha256 or s.shop_device_id<>p.shop_device_id or s.local_dataset_id<>p.local_dataset_id
  or s.restore_epoch<>p.restore_epoch or s.data_revision>c.local_revision or j.manifest is distinct from s.source_manifest
  or j.receipt->>'source_snapshot_id' is distinct from s.snapshot_id::text
  or s.source_manifest->>'schemaVersion' is distinct from 'history-local-export-v2'
  or s.source_manifest->>'restoreLineageId' is distinct from p.restore_lineage_id::text then
  raise exception using errcode='40001',message='payment_history_local_context_unverified';end if;
 -- Older/private incomplete maps cannot be guessed to be local duplicates or
 -- inserts. Reconciliation is required before the projection is authoritative.
 if exists(select 1 from public.payment_history_local_publications previous
  join public.payment_history_local_publication_map m on m.operation_id=previous.operation_id
  where previous.shop_id=p.shop_id and previous.shop_device_id=p.shop_device_id and previous.local_dataset_id=p.local_dataset_id
   and previous.restore_lineage_id=p.restore_lineage_id and previous.restore_epoch=p.restore_epoch and previous.state='committed'
   and m.local_inserted is null) then
  raise exception using errcode='40001',message='payment_history_local_projection_unverified';end if;
 for candidate in
  with candidates as (
   select 'baseline'::text source_kind,raw.local_id local_transaction_id,raw.original_object->>'batch_id' local_batch_id,(batch.original_object->>'apply_operation_id')::uuid apply_operation_id,
    jsonb_build_object('businessTicks',raw.original_object->>'business_ticks','grossClp',raw.original_object->>'signed_amount_clp',
     'commissionClp',raw.original_object->>'signed_fee_clp','commissionVatClp',raw.original_object->>'signed_fee_vat_clp',
     'netClp',raw.original_object->>'signed_net_clp','movementKind',raw.original_object->>'movement_kind','transactionState',upper(btrim(raw.original_object->>'state'))) economics,
    0::bigint local_sequence,length(raw.local_id)::bigint row_order,raw.local_id collate "C" row_key,
    (raw.original_object->>'is_active'='1') and not exists(select 1 from public.payment_history_local_publications undone where undone.shop_id=p.shop_id
     and undone.shop_device_id=p.shop_device_id and undone.local_dataset_id=p.local_dataset_id and undone.restore_lineage_id=p.restore_lineage_id
     and undone.restore_epoch=p.restore_epoch and undone.operation_kind='Undo' and undone.state='committed' and undone.local_batch_id=raw.original_object->>'batch_id') active
   from public.payment_history_source_objects raw
   join public.payment_history_source_objects batch on batch.shop_id=p.shop_id and batch.source_snapshot_id=c.source_snapshot_id and batch.table_name='batches' and batch.local_id=raw.original_object->>'batch_id'
   where raw.shop_id=p.shop_id and raw.source_snapshot_id=c.source_snapshot_id and raw.table_name='movements'
    and (raw.original_object->>'merchant_scope_id') collate "C"=p_scope collate "C"
    and (raw.original_object->>'external_namespace') collate "C"=p_namespace collate "C" and (raw.original_object->>'external_id') collate "C"=p_external_id collate "C"
   union all
   select 'publication',null,previous.local_batch_id,previous.operation_id,
    jsonb_build_object('businessTicks',f.fields->>'business_ticks','grossClp',f.fields->>'gross_clp','commissionClp',f.fields->>'fee_clp',
     'commissionVatClp',f.fields->>'fee_vat_clp','netClp',f.fields->>'net_clp','movementKind',f.fields->>'movement_kind','transactionState',upper(btrim(f.fields->>'transaction_state'))),
    previous.local_sequence,m.source_ordinal::bigint,'' collate "C",
    not exists(select 1 from public.payment_history_local_publications undone where undone.shop_id=p.shop_id
     and undone.shop_device_id=p.shop_device_id and undone.local_dataset_id=p.local_dataset_id and undone.restore_lineage_id=p.restore_lineage_id
     and undone.restore_epoch=p.restore_epoch and undone.operation_kind='Undo' and undone.state='committed'
     and undone.local_batch_id=previous.local_batch_id and undone.local_sequence>previous.local_sequence)
   from public.payment_history_local_publication_map m
   join public.payment_history_local_publications previous on previous.operation_id=m.operation_id
   join public.payment_history_local_publication_pages page on page.operation_id=m.operation_id and page.ordinal=m.source_page_ordinal
   cross join lateral(select page.page_json::jsonb->(m.source_record_ordinal-1)->'fields' fields) f
   where m.shop_id=p.shop_id and m.local_inserted and m.local_scope_id=p_scope and m.local_external_namespace=p_namespace and m.local_external_id=p_external_id
    and previous.shop_id=p.shop_id and previous.shop_device_id=p.shop_device_id and previous.local_dataset_id=p.local_dataset_id
    and previous.restore_lineage_id=p.restore_lineage_id and previous.restore_epoch=p.restore_epoch and previous.operation_kind='Apply'
    and previous.state='committed' and previous.grant_id is not null
  ) select * from candidates order by active desc,local_sequence desc,row_order desc,row_key desc limit 1
 loop
  if candidate.source_kind='baseline' and (candidate.local_transaction_id !~ '^[1-9][0-9]{0,18}$'
   or candidate.local_transaction_id::numeric>9223372036854775807) then
   raise exception using errcode='40001',message='payment_history_local_projection_unverified';end if;
  result:=jsonb_build_object('source_kind',candidate.source_kind,'local_transaction_id',candidate.local_transaction_id,
   'local_batch_id',candidate.local_batch_id,'apply_operation_id',candidate.apply_operation_id,'active',candidate.active,
   'economics',candidate.economics,'economic_digest',app_private.payment_history_economic_digest_v1(candidate.economics));
 end loop;
 return result;
end;$$;
revoke all on function app_private.payment_history_local_projection_v2(uuid,text,text,text) from public,anon,authenticated,service_role;
