-- ASUS019 C3-C5 continuation. C1-C2 immutable preimage SHA256: 0fb57fc06dda53c404647373322291ac85a1ab55aec1046b802ce4eb63973f83
-- Additive follow-up; no retroactive edit to the qualified C1-C2 migration.

create table public.payment_history_inventory (
 inventory_id uuid primary key default gen_random_uuid(),shop_id uuid not null references public.shops(shop_id),shop_device_id uuid references public.shop_devices(shop_device_id),
 hardware_reference_sha256 text not null check(hardware_reference_sha256 ~ '^[0-9a-f]{64}$'),
 disposition text not null check(disposition in ('active','retired_verified','unresolved')),
 protocol_version integer not null default 0 check(protocol_version between 0 and 100),
 client_build_sha text check(client_build_sha ~ '^[0-9a-f]{40}$'),evidence_reference text not null check(length(evidence_reference) between 1 and 2048),
 actor_kind text not null check(actor_kind in ('personal_account','pos_staff_manager')),actor_id uuid not null,verified_at timestamptz not null default clock_timestamp(),
 unique(shop_id,inventory_id),unique(shop_id,hardware_reference_sha256),unique(shop_id,shop_device_id),
 check(disposition<>'active' or (shop_device_id is not null and protocol_version>=1 and client_build_sha is not null))
);
create table public.payment_history_cutover_plans (
 cutover_id uuid primary key default gen_random_uuid(),shop_id uuid not null references public.shops(shop_id),
 writer_epoch bigint not null,inventory_digest text not null check(inventory_digest ~ '^[0-9a-f]{64}$'),
 completeness_reference text not null check(length(completeness_reference) between 1 and 2048),
 actor_kind text not null check(actor_kind in ('personal_account','pos_staff_manager')),actor_id uuid not null,state text not null check(state in ('frozen','web_active','reconcile_required')),
 grant_drain_after timestamptz not null,frozen_at timestamptz not null default clock_timestamp(),activated_at timestamptz,
 unique(shop_id,cutover_id),unique(shop_id,writer_epoch)
);
create table public.payment_history_local_write_grants (
 grant_id uuid primary key default gen_random_uuid(),shop_id uuid not null references public.shops(shop_id),shop_device_id uuid not null references public.shop_devices(shop_device_id),
 writer_epoch bigint not null,operation_id uuid not null,issued_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,
 unique(shop_id,shop_device_id,operation_id),check(expires_at>issued_at and expires_at<=issued_at+interval '60 seconds')
);
create table public.payment_history_freeze_acks (
 shop_id uuid not null references public.shops(shop_id),shop_device_id uuid not null references public.shop_devices(shop_device_id),writer_epoch bigint not null,
 local_dataset_id text not null check(length(local_dataset_id) between 1 and 256),data_revision bigint not null check(data_revision>=0),restore_epoch bigint not null check(restore_epoch>=0),
 archive_sha256 text not null check(archive_sha256 ~ '^[0-9a-f]{64}$'),manifest_sha256 text not null check(manifest_sha256 ~ '^[0-9a-f]{64}$'),backup_sha256 text not null check(backup_sha256 ~ '^[0-9a-f]{64}$'),
 local_writes_drained boolean not null check(local_writes_drained),native_outbox_drained boolean not null check(native_outbox_drained),
 actor_staff_id uuid not null references public.staff_accounts(staff_id),acknowledged_at timestamptz not null default clock_timestamp(),
 primary key(shop_id,shop_device_id,writer_epoch)
);
create table public.payment_history_migration_runs (
 run_id uuid primary key default gen_random_uuid(),shop_id uuid not null references public.shops(shop_id),source_upload_id uuid not null,
 actor_kind text not null check(actor_kind in ('personal_account','pos_staff_manager')),actor_id uuid not null,actor_session_id uuid not null,actor_credential_version integer,
 request_key uuid not null,request_digest text not null check(request_digest ~ '^[0-9a-f]{64}$'),
 state text not null default 'queued' check(state in ('queued','analysing','review_ready','applied','cancelled','failed')),
 lease_token uuid,lease_fence bigint not null default 0,lease_expires_at timestamptz,attempt_started_at timestamptz,attempts integer not null default 0 check(attempts between 0 and 3),
 processed_objects integer not null default 0 check(processed_objects between 0 and 400000),processed_movements integer not null default 0 check(processed_movements between 0 and 100000),
 manifest jsonb,manifest_sha256 text,analysis_digest text,summary jsonb,configuration jsonb not null default '{"bindings":[]}',
 review_digest text,reviewed_revision bigint,reviewed_writer_epoch bigint,apply_request_key uuid,apply_request_digest text,receipt jsonb,error_code text,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(shop_id,run_id),unique(shop_id,actor_kind,actor_id,request_key),foreign key(shop_id,source_upload_id) references public.payment_history_uploads(shop_id,upload_id)
);
create index payment_history_migration_queue_idx on public.payment_history_migration_runs(state,lease_expires_at,created_at) where state in ('queued','analysing');
create table public.payment_history_migration_objects (
 shop_id uuid not null,run_id uuid not null,table_name text not null check(table_name in ('scopes','bindings','operations','batches','files','movements','observations')),
 local_id text not null check(length(local_id) between 1 and 256),source_ordinal integer not null check(source_ordinal>0),original_line text not null check(octet_length(original_line)<=2097152),object jsonb not null check(jsonb_typeof(object)='object' and octet_length(object::text)<=4194304),
 object_digest text not null check(object_digest ~ '^[0-9a-f]{64}$'),
 primary key(run_id,table_name,local_id),unique(run_id,table_name,source_ordinal),foreign key(shop_id,run_id) references public.payment_history_migration_runs(shop_id,run_id)
);
create table public.payment_history_migration_movements (
 shop_id uuid not null,run_id uuid not null,local_id text not null,local_batch_id text not null,local_scope_id text not null,local_binding_id text not null,local_file_id text not null,
 alias_key text not null check(alias_key ~ '^[0-9a-f]{64}$'),active boolean not null,supersedes_local_id text,
 transaction jsonb not null check(jsonb_typeof(transaction)='object' and octet_length(transaction::text)<=32768),economics jsonb not null,
 economic_digest text not null check(economic_digest ~ '^[0-9a-f]{64}$'),primary key(run_id,local_id),
 foreign key(shop_id,run_id) references public.payment_history_migration_runs(shop_id,run_id)
);
create table public.payment_history_source_snapshots (
 snapshot_id uuid primary key default gen_random_uuid(),shop_id uuid not null references public.shops(shop_id),shop_device_id uuid not null references public.shop_devices(shop_device_id),
 local_dataset_id text not null,data_revision bigint not null,restore_epoch bigint not null,archive_sha256 text not null,backup_sha256 text not null,source_manifest jsonb not null,
 source_summary jsonb not null,run_id uuid not null,created_revision bigint not null,created_at timestamptz not null default clock_timestamp(),
 unique(shop_id,snapshot_id),foreign key(shop_id,run_id) references public.payment_history_migration_runs(shop_id,run_id)
);
create table public.payment_history_source_objects (
 source_object_id uuid primary key default gen_random_uuid(),shop_id uuid not null,source_snapshot_id uuid not null,table_name text not null,
 local_id text not null,object_digest text not null,original_object jsonb not null,created_at timestamptz not null default clock_timestamp(),
 unique(source_snapshot_id,table_name,local_id),foreign key(shop_id,source_snapshot_id) references public.payment_history_source_snapshots(shop_id,snapshot_id)
);
create table public.payment_history_local_batch_map (
 shop_id uuid not null references public.shops(shop_id),shop_device_id uuid not null references public.shop_devices(shop_device_id),local_dataset_id text not null,local_batch_id text not null,
 batch_id uuid not null,source_object_digest text not null,
 primary key(shop_id,shop_device_id,local_dataset_id,local_batch_id),foreign key(shop_id,batch_id) references public.payment_history_batches(shop_id,batch_id)
);
create table public.payment_history_local_movement_map (
 shop_id uuid not null references public.shops(shop_id),shop_device_id uuid not null references public.shop_devices(shop_device_id),local_dataset_id text not null,local_movement_id text not null,
 movement_version_id uuid not null,source_economic_digest text not null,source_fact_digest text not null,owns_version boolean not null,
 primary key(shop_id,shop_device_id,local_dataset_id,local_movement_id),foreign key(shop_id,movement_version_id) references public.payment_history_movement_versions(shop_id,movement_version_id)
);
-- Every logical revision has a marker, including duplicate-only imports and undo=0.
create table public.payment_history_change_sets (
 shop_id uuid not null references public.shops(shop_id),revision bigint not null,change_count integer not null check(change_count between 0 and 110000),
 changes_digest text not null check(changes_digest ~ '^[0-9a-f]{64}$'),created_at timestamptz not null default clock_timestamp(),primary key(shop_id,revision)
);
create table public.payment_history_replica_snapshots (
 snapshot_id uuid primary key default gen_random_uuid(),shop_id uuid not null references public.shops(shop_id),shop_device_id uuid not null references public.shop_devices(shop_device_id),
 dataset_id uuid not null,revision bigint not null,writer_epoch bigint not null,movement_count integer not null check(movement_count between 0 and 1000000),batch_count integer not null check(batch_count between 0 and 100000),request_key uuid not null,
 checksum text not null check(checksum ~ '^[0-9a-f]{64}$'),expires_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),unique(shop_id,snapshot_id),unique(shop_id,shop_device_id,request_key)
);
create table public.payment_history_replica_snapshot_rows (
 shop_id uuid not null,snapshot_id uuid not null,ordinal integer not null check(ordinal>0),entity_kind text not null check(entity_kind in ('batch','movement')),entity_id uuid not null,entity_digest text not null,payload jsonb not null,
 primary key(snapshot_id,ordinal),foreign key(shop_id,snapshot_id) references public.payment_history_replica_snapshots(shop_id,snapshot_id)
);
create table public.payment_history_replica_events (
 shop_id uuid not null references public.shops(shop_id),revision bigint not null,ordinal integer not null,entity_kind text not null check(entity_kind in ('batch','movement')),entity_id uuid not null,entity_digest text not null,payload jsonb not null,
 primary key(shop_id,revision,ordinal)
);
create table public.payment_history_replica_cursors (
 cursor_id uuid primary key default gen_random_uuid(),shop_id uuid not null references public.shops(shop_id),shop_device_id uuid not null references public.shop_devices(shop_device_id),
 mode text not null check(mode in ('snapshot','delta')),snapshot_id uuid, dataset_id uuid not null,writer_epoch bigint not null,target_revision bigint not null,
 next_revision bigint not null,next_ordinal integer not null,page_size integer not null check(page_size between 1 and 1000),
 target_checksum text not null,target_movements integer not null,target_batches integer not null,next_cursor_id uuid,completed boolean not null default false,expires_at timestamptz not null,
 foreign key(shop_id,snapshot_id) references public.payment_history_replica_snapshots(shop_id,snapshot_id)
);
alter table public.payment_history_runtime add column replica_floor_revision bigint not null default 0;
update public.payment_history_runtime set replica_floor_revision=revision;
create table public.payment_history_replica_acks (
 shop_id uuid not null references public.shops(shop_id),shop_device_id uuid not null references public.shop_devices(shop_device_id),dataset_id uuid not null,
 revision bigint not null,writer_epoch bigint not null,checksum text not null check(checksum ~ '^[0-9a-f]{64}$'),
 protocol_version integer not null check(protocol_version>=1),client_build_sha text not null check(client_build_sha ~ '^[0-9a-f]{40}$'),
 acknowledged_at timestamptz not null default clock_timestamp(),primary key(shop_id,shop_device_id)
);
do $$declare name text;begin
 foreach name in array array['inventory','cutover_plans','local_write_grants','freeze_acks','migration_runs','migration_objects','migration_movements','source_snapshots','source_objects','local_batch_map','local_movement_map','change_sets','replica_snapshots','replica_snapshot_rows','replica_acks','replica_events','replica_cursors'] loop
  execute format('alter table public.payment_history_%I enable row level security',name);
  execute format('revoke all on public.payment_history_%I from public,anon,authenticated,service_role',name);
 end loop;
 foreach name in array array['source_snapshots','source_objects','local_batch_map','local_movement_map','change_sets','freeze_acks','replica_events'] loop
  execute format('create trigger payment_history_provenance_immutable before update or delete on public.payment_history_%I for each row execute function app_private.payment_history_immutable_v1()',name);
 end loop;
end;$$;
update storage.buckets set allowed_mime_types=allowed_mime_types||array['application/zip'] where id='payment-history-sources';

create function app_private.payment_history_migration_actor_current_v1(j public.payment_history_migration_runs) returns boolean
language sql volatile security definer set search_path='' as $$
 select case when j.actor_kind='pos_staff_manager' then exists(select 1 from public.staff_web_sessions s where s.shop_id=j.shop_id and s.staff_id=j.actor_id and s.staff_web_session_id=j.actor_session_id
  and app_private.staff_web_runtime_lease_is_valid_v1(j.shop_id,j.actor_id,j.actor_session_id,s.session_token_hash,j.actor_credential_version,null)
  and app_private.payment_history_staff_can_v1(j.shop_id,j.actor_id,'migrate')) else exists(
 select 1 from auth.sessions s join public.shop_members m on m.profile_id=s.user_id and m.shop_id=j.shop_id join public.profiles p on p.profile_id=m.profile_id
 join public.shops sh on sh.shop_id=m.shop_id where s.id=j.actor_session_id and s.user_id=j.actor_id and (s.not_after is null or s.not_after>clock_timestamp())
 and m.membership_status='active' and p.profile_status='active' and p.disabled_at is null and sh.shop_status='active'
 and (m.role_key='shop_owner' or (m.role_key='shop_manager' and exists(select 1 from public.payment_history_role_permissions g where g.shop_id=j.shop_id and g.role_key=m.role_key and g.capability='migrate' and g.enabled)))) end;
$$;
revoke all on function app_private.payment_history_migration_actor_current_v1(public.payment_history_migration_runs) from public,anon,authenticated,service_role;

create function public.payment_history_migration_worker_v1(p_operation text,p_payload jsonb) returns jsonb
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
   'upload',jsonb_build_object('upload_id',u.upload_id,'object_key',u.object_key,'file_name',u.file_name,'file_sha256',u.file_sha256,'byte_length',u.byte_length::text)));
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
  if jsonb_typeof(m)<>'object' or m->>'schemaVersion' is distinct from 'history-local-export-v1' or m->>'evidenceLevel' is distinct from 'legacy_attested' or m->>'shopId' is distinct from j.shop_id::text
   or not exists(select 1 from public.shop_devices d where d.shop_id=j.shop_id and d.shop_device_id=(m->>'deviceId')::uuid)
   or length(coalesce(m->>'localDatasetId','')) not between 1 and 256 or coalesce(m->>'dataRevision','') !~ '^(0|[1-9][0-9]{0,18})$' or coalesce(m->>'restoreEpoch','') !~ '^(0|[1-9][0-9]{0,18})$'
   or coalesce(m->>'backupSha256','') !~ '^[0-9a-f]{64}$' or jsonb_typeof(m->'entries') is distinct from 'array' or jsonb_array_length(m->'entries')<>7
   or (select count(distinct x->>'name') from jsonb_array_elements(m->'entries') x)<>7
   or (select count(*) from public.payment_history_migration_objects where run_id=j.run_id and table_name='movements') is distinct from j.processed_movements::bigint then raise exception using errcode='22023',message='payment_history_local_manifest_invalid';end if;
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
revoke all on function public.payment_history_migration_worker_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.payment_history_migration_worker_v1(text,jsonb) to service_role;

-- Decisions are materialized before inserting any inactive source versions.
-- A newly inserted historical tombstone must not change another decision in
-- the same transfer. No browser or worker can write this table.
create table public.payment_history_migration_decisions (
 run_id uuid not null references public.payment_history_migration_runs(run_id),local_id text not null,
 merchant_id uuid not null,identity_key text not null,existing_version_id uuid,decision text not null,code text not null,
 primary key(run_id,local_id)
);
alter table public.payment_history_migration_decisions enable row level security;
revoke all on public.payment_history_migration_decisions from public,anon,authenticated,service_role;

create function app_private.payment_history_migration_review_rows_v1(p_run uuid)
returns table(local_id text,merchant_id uuid,identity_key text,existing_version_id uuid,decision text,code text)
language sql volatile security definer set search_path='' as $$
 with run as materialized(select j.*,u.file_sha256 archive_sha256 from public.payment_history_migration_runs j join public.payment_history_uploads u on u.shop_id=j.shop_id and u.upload_id=j.source_upload_id where j.run_id=p_run),
 assignments as materialized(select x.* from run j,jsonb_to_recordset(coalesce(j.configuration->'bindings','[]')) x(local_scope_id text,merchant_id uuid,evidence_id uuid)),
 base as materialized(select s.*,a.merchant_id canonical_merchant,e.status proof_status,e.verification_level proof_level,e.scope proof_scope,j.manifest,j.archive_sha256,
  encode(extensions.digest(convert_to(s.shop_id::text||chr(31)||'getnet'||chr(31)||a.merchant_id::text||chr(31)||(s.transaction->>'externalNamespace')||chr(31)||(s.transaction->>'externalId'),'UTF8'),'sha256'),'hex') global_key,
  encode(extensions.digest(convert_to((o.object-'is_active')::text,'UTF8'),'sha256'),'hex') source_fact_digest,
  count(*) filter(where s.active) over(partition by a.merchant_id,s.transaction->>'externalNamespace',s.transaction->>'externalId' order by s.local_id::bigint rows unbounded preceding) active_ordinal
  from public.payment_history_migration_movements s join run j on j.run_id=s.run_id
  join public.payment_history_migration_objects o on o.run_id=s.run_id and o.table_name='movements' and o.local_id=s.local_id
  left join assignments a on a.local_scope_id=s.local_scope_id
  left join public.payment_history_evidence e on e.shop_id=s.shop_id and e.evidence_id=a.evidence_id and e.kind='migration_reconcile'
 ),collisions as materialized(select b.global_key from base b where b.active and b.global_key is not null group by b.global_key having
  count(distinct b.economics->>'businessTicks')>1 or count(distinct b.economics->>'grossClp')>1 or count(distinct b.economics->>'movementKind')>1 or count(distinct b.economics->>'transactionState')>1
  or count(distinct b.economics->>'commissionClp')>1 or count(distinct b.economics->>'commissionVatClp')>1 or count(distinct b.economics->>'netClp')>1),
 classified as(select b.local_id,b.canonical_merchant,b.global_key,coalesce(mapped.movement_version_id,active.movement_version_id) existing_id,
  case
   when b.canonical_merchant is null or b.proof_status is distinct from 'verified' or b.proof_level is distinct from 'operator_attested'
    or b.proof_scope->>'run_id' is distinct from p_run::text or b.proof_scope->>'local_scope_id' is distinct from b.local_scope_id
    or b.proof_scope->>'merchant_id' is distinct from b.canonical_merchant::text or b.proof_scope->>'archive_sha256' is distinct from b.archive_sha256 then 'history_migration_mapping_unverified'
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
revoke all on function app_private.payment_history_migration_review_rows_v1(uuid) from public,anon,authenticated,service_role;

create function app_private.payment_history_migration_review_v1(p_run uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
 with decisions as materialized(select * from app_private.payment_history_migration_review_rows_v1(p_run)),
 facts as(select count(*) total,count(*) filter(where decision='new_active') new_active,count(*) filter(where decision='new_inactive') new_inactive,
  count(*) filter(where decision in ('duplicate','duplicate_incoming')) duplicates,count(*) filter(where decision='conflict') conflicts,count(*) filter(where decision='blocked') blocked from decisions),
 context as(select j.*,r.dataset_id,r.revision,r.writer_epoch,r.writer_authority,u.file_sha256 archive_sha256,
  (r.writer_authority='frozen' and exists(select 1 from public.payment_history_freeze_acks a where a.shop_id=j.shop_id and a.shop_device_id=(j.manifest->>'deviceId')::uuid and a.writer_epoch=r.writer_epoch
    and a.local_dataset_id=j.manifest->>'localDatasetId' and a.data_revision=(j.manifest->>'dataRevision')::bigint and a.restore_epoch=(j.manifest->>'restoreEpoch')::bigint
    and a.archive_sha256=u.file_sha256 and a.manifest_sha256=j.manifest_sha256 and a.backup_sha256=j.manifest->>'backupSha256'
    and a.local_writes_drained and a.native_outbox_drained
    and not exists(select 1 from public.payment_history_local_write_grants g where g.shop_id=j.shop_id and g.shop_device_id=a.shop_device_id and g.expires_at>a.acknowledged_at))) freeze_verified
  from public.payment_history_migration_runs j join public.payment_history_runtime r using(shop_id) join public.payment_history_uploads u on u.shop_id=j.shop_id and u.upload_id=j.source_upload_id and u.state='verified' where j.run_id=p_run)
 select jsonb_build_object('run_id',j.run_id,'dataset_id',j.dataset_id,'revision',j.revision::text,'writer_epoch',j.writer_epoch::text,'source',j.summary,'summary',to_jsonb(f),'freeze_verified',j.freeze_verified,
  'can_apply',j.freeze_verified and f.conflicts=0 and f.blocked=0 and f.total=j.processed_movements,
  'reasons',coalesce((select jsonb_agg(x.code) from(select distinct code from decisions where decision in ('blocked','conflict') order by code limit 20)x),'[]'),
  'review_digest',encode(extensions.digest(convert_to(jsonb_build_object('run',j.run_id,'analysis',j.analysis_digest,'source_archive',j.archive_sha256,'manifest_sha256',j.manifest_sha256,'configuration',j.configuration,
    'actor',jsonb_build_object('kind',j.actor_kind,'id',j.actor_id,'session',j.actor_session_id,'version',j.actor_credential_version),
    'dataset',j.dataset_id,'revision',j.revision::text,'epoch',j.writer_epoch::text,'authority',j.writer_authority,'freeze_verified',j.freeze_verified,'facts',to_jsonb(f),
    'decisions',(select encode(extensions.digest(convert_to(coalesce(string_agg(local_id||':'||coalesce(merchant_id::text,'')||':'||coalesce(identity_key,'')||':'||coalesce(existing_version_id::text,'')||':'||code,'|' order by local_id::bigint),''),'UTF8'),'sha256'),'hex') from decisions))::text,'UTF8'),'sha256'),'hex'))
 from context j cross join facts f;
$$;
revoke all on function app_private.payment_history_migration_review_v1(uuid) from public,anon,authenticated,service_role;

create function app_private.payment_history_replica_payload_v1(p_shop uuid,p_kind text,p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when p_kind='batch' then (select jsonb_build_object('id',b.batch_id,'origin',b.origin,'state',b.state,'apply_operation_id',b.apply_operation_id,
   'created_revision',b.created_revision::text,'cancelled_revision',b.cancelled_revision::text,'created_utc_ms',floor(extract(epoch from b.created_at)*1000)::bigint::text)
   from public.payment_history_batches b where b.shop_id=p_shop and b.batch_id=p_id)
 when p_kind='movement' then (select jsonb_build_object('id',v.movement_version_id,'merchant_id',v.merchant_id,'batch_id',v.owner_batch_id,'identity_key',v.identity_key,'economic_digest',v.economic_digest,'active',v.active,
   'business_ticks',v.business_ticks::text,'gross_clp',v.gross_clp::text,'fee_clp',v.commission_clp::text,'fee_vat_clp',v.commission_vat_clp::text,'net_clp',v.net_clp::text,
   'movement_kind',v.movement_kind,'transaction_state',v.transaction_state,'external_namespace',v.external_namespace,'external_id',v.external_id,'source_sheet',v.source_sheet,'source_row',v.source_row::text,
   'timestamp_raw',v.transaction#>>'{timestamp,rawTimestamp}','offset_minutes',v.transaction#>>'{timestamp,offsetMinutes}','occurred_at_utc',v.transaction#>>'{timestamp,occurredAtUtc}',
   'time_interpretation',v.transaction#>>'{timestamp,interpretation}','time_policy_version',v.transaction#>>'{timestamp,policyVersion}','time_evidence_reference',v.transaction#>>'{timestamp,evidenceReference}',
   'card_subtype',v.transaction->>'cardSubtype','created_revision',v.created_revision::text)
   from public.payment_history_movement_versions v where v.shop_id=p_shop and v.movement_version_id=p_id) end;
$$;
revoke all on function app_private.payment_history_replica_payload_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
create function app_private.payment_history_replica_entity_digest_v1(p_kind text,p jsonb) returns text
language plpgsql immutable set search_path='' as $$
declare fields text[];k text;v_fields text[]:=array['history-replica-entity-v1',p_kind];begin
 if p_kind='batch' then fields:=array['id','origin','state','apply_operation_id','created_revision','cancelled_revision','created_utc_ms'];
 elsif p_kind='movement' then fields:=array['id','merchant_id','batch_id','identity_key','economic_digest','active','business_ticks','gross_clp','fee_clp','fee_vat_clp','net_clp','movement_kind','transaction_state','external_namespace','external_id','source_sheet','source_row','timestamp_raw','offset_minutes','occurred_at_utc','time_interpretation','time_policy_version','time_evidence_reference','card_subtype','created_revision'];
 else raise exception using errcode='22023',message='payment_history_replica_kind_invalid';end if;
 foreach k in array fields loop v_fields:=array_append(v_fields,coalesce(p->>k,'null'));end loop;
 return app_private.payment_history_field_hash_v1(v_fields);
end;$$;

-- Upload/analysis can precede the freeze; applying cannot. Local attestations
-- remain operator_attested, and the original receipts remain unchanged in the
-- immutable source objects. They never become provider verification.
create function public.payment_history_migration_request_v1(p_shop_id uuid,p_operation text,p_payload jsonb default '{}',p_staff_id uuid default null,
 p_staff_web_session_id uuid default null,p_session_token_hash text default null,p_credential_version integer default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare a jsonb;result jsonb;digest text;req uuid;j public.payment_history_migration_runs;r public.payment_history_runtime;u public.payment_history_uploads;
 e public.payment_history_evidence;scope_row public.payment_history_migration_objects;binding record;source_batch record;row record;
 canonical uuid;proof uuid;alias_proof uuid;global_batch uuid;global_operation uuid;global_version uuid;previous_version uuid;snapshot uuid;main_operation uuid;
 v_revision bigint;new_active integer:=0;new_inactive integer:=0;duplicates integer:=0;new_batches integer:=0;review jsonb;batch_receipt jsonb;v_id uuid;
begin
 if p_operation not in ('upload_create','upload_ready','upload_status','start','status','resume','cancel','mapping','review','apply','receipt')
  or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>65536 then raise exception using errcode='22023',message='payment_history_operation_invalid';end if;
 a:=app_private.payment_history_demand_actor_v1(p_shop_id,'migrate',p_staff_id,p_staff_web_session_id,p_session_token_hash,p_credential_version);
 digest:=encode(extensions.digest(convert_to(jsonb_build_object('operation',p_operation,'payload',p_payload)::text,'UTF8'),'sha256'),'hex');
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
   if j.request_digest<>digest then raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
  else
   select * into u from public.payment_history_uploads where shop_id=p_shop_id and upload_id=(p_payload->>'upload_id')::uuid and state='verified' and file_name ~* '\.w7history\.zip$'
    and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid for share;
   if not found then raise exception using errcode='22023',message='payment_history_sources_unverified';end if;
   perform pg_advisory_xact_lock(hashtextextended('payment-history-queue:'||p_shop_id::text,0));
   if (select count(*) from public.payment_history_migration_runs where shop_id=p_shop_id and state in ('queued','analysing','review_ready'))>=5 then raise exception using errcode='54000',message='payment_history_job_backpressure';end if;
   insert into public.payment_history_runtime(shop_id) values(p_shop_id) on conflict do nothing;
   insert into public.payment_history_migration_runs(shop_id,source_upload_id,actor_kind,actor_id,actor_session_id,actor_credential_version,request_key,request_digest)
    values(p_shop_id,u.upload_id,a->>'kind',(a->>'id')::uuid,(a->>'session_id')::uuid,(a->>'credential_version')::integer,req,digest) returning * into j;
  end if;
  result:=jsonb_build_object('run_id',j.run_id,'state',j.state);
 elsif p_operation='receipt' then
  select * into j from public.payment_history_migration_runs where shop_id=p_shop_id and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid and apply_request_key=(p_payload->>'request_key')::uuid;
  result:=jsonb_build_object('receipt',case when found then j.receipt else null end);
 else
  select * into j from public.payment_history_migration_runs where shop_id=p_shop_id and run_id=(p_payload->>'run_id')::uuid for update;
  if not found or j.actor_kind<>a->>'kind' or j.actor_id<>(a->>'id')::uuid then raise exception using errcode='42501',message='payment_history_job_actor_mismatch';end if;
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
revoke all on function public.payment_history_migration_request_v1(uuid,text,jsonb,uuid,uuid,text,integer) from public,anon;
grant execute on function public.payment_history_migration_request_v1(uuid,text,jsonb,uuid,uuid,text,integer) to authenticated,service_role;

create unique index payment_history_migration_apply_key_idx on public.payment_history_migration_runs(shop_id,actor_kind,actor_id,apply_request_key) where apply_request_key is not null;
create table public.payment_history_worker_requests (
 request_id uuid primary key,request_digest text not null,response jsonb not null,created_at timestamptz not null default clock_timestamp()
);
alter table public.payment_history_worker_requests enable row level security;
revoke all on public.payment_history_worker_requests from public,anon,authenticated,service_role;
create function public.payment_history_worker_gateway_v1(p_request_id uuid,p_lane text,p_operation text,p_payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_digest text;v_response jsonb;prior public.payment_history_worker_requests;begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception using errcode='42501',message='payment_history_worker_denied';end if;
 if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>8388608
  or p_lane is null or p_lane not in ('import','migration') or p_operation is null
  or (p_lane='import' and p_operation not in ('claim_upload','verify_upload','reject_upload','claim','heartbeat','stage','finish','fail'))
  or (p_lane='migration' and p_operation not in ('claim','heartbeat','stage_objects','stage_movements','finish','fail')) then raise exception using errcode='22023',message='payment_history_worker_operation_invalid';end if;
 v_digest:=encode(extensions.digest(convert_to(jsonb_build_object('lane',p_lane,'operation',p_operation,'payload',p_payload)::text,'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('history-worker-request:'||p_request_id::text,0));
 select * into prior from public.payment_history_worker_requests where request_id=p_request_id;
 if found then
  if prior.request_digest<>v_digest then raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
  if prior.created_at<clock_timestamp()-interval '1 hour' then raise exception using errcode='40001',message='payment_history_worker_request_expired';end if;
  return prior.response;
 end if;
 if p_lane='import' then v_response:=public.payment_history_worker_v1(p_operation,p_payload);
 else v_response:=public.payment_history_migration_worker_v1(p_operation,p_payload);end if;
 insert into public.payment_history_worker_requests(request_id,request_digest,response) values(p_request_id,v_digest,v_response);
 -- This is an ephemeral replay cache, never a financial or provenance table.
 delete from public.payment_history_worker_requests where request_id in(select request_id from public.payment_history_worker_requests where created_at<clock_timestamp()-interval '2 hours' order by created_at limit 100);
 return v_response;
end;$$;
revoke all on function public.payment_history_worker_gateway_v1(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.payment_history_worker_gateway_v1(uuid,text,text,jsonb) to service_role;
revoke all on function app_private.payment_history_replica_entity_digest_v1(text,jsonb) from public,anon,authenticated,service_role;
create function app_private.payment_history_replica_entities_v1(p_shop uuid)
returns table(entity_kind text,entity_id uuid,entity_digest text,payload jsonb)
language sql stable security definer set search_path='' as $$
 select x.kind,x.id,app_private.payment_history_replica_entity_digest_v1(x.kind,x.payload),x.payload from (
  select 'batch'::text kind,b.batch_id id,app_private.payment_history_replica_payload_v1(p_shop,'batch',b.batch_id) payload from public.payment_history_batches b where b.shop_id=p_shop
  union all select 'movement',v.movement_version_id,app_private.payment_history_replica_payload_v1(p_shop,'movement',v.movement_version_id) from public.payment_history_movement_versions v where v.shop_id=p_shop
 )x;
$$;
revoke all on function app_private.payment_history_replica_entities_v1(uuid) from public,anon,authenticated,service_role;
create function app_private.payment_history_replica_checksum_v1(p_shop uuid) returns text
language sql stable security definer set search_path='' as $$
 select encode(extensions.digest(convert_to('history-replica-snapshot-v1'||chr(10)||r.shop_id::text||chr(10)||r.dataset_id::text||chr(10)||r.revision::text||chr(10)||r.writer_epoch::text||chr(10)||
  coalesce((select string_agg(e.entity_kind||'|'||e.entity_id::text||'|'||e.entity_digest||chr(10),'' order by e.entity_kind collate "C",e.entity_id) from app_private.payment_history_replica_entities_v1(p_shop) e),''),'UTF8'),'sha256'),'hex')
 from public.payment_history_runtime r where r.shop_id=p_shop;
$$;
revoke all on function app_private.payment_history_replica_checksum_v1(uuid) from public,anon,authenticated,service_role;

create function app_private.payment_history_seal_revision_v1(p_shop uuid,p_revision bigint) returns void
language plpgsql volatile security definer set search_path='' as $$
declare n integer;digest text;old public.payment_history_change_sets;begin
 if exists(select 1 from public.payment_history_change_sets where shop_id=p_shop and revision=p_revision) then return;end if;
 insert into public.payment_history_replica_events(shop_id,revision,ordinal,entity_kind,entity_id,entity_digest,payload)
 select p_shop,p_revision,row_number() over(order by x.kind collate "C",x.id)::integer,x.kind,x.id,app_private.payment_history_replica_entity_digest_v1(x.kind,x.payload),x.payload from(
  select 'batch'::text kind,b.batch_id id,app_private.payment_history_replica_payload_v1(p_shop,'batch',b.batch_id) payload from public.payment_history_batches b where b.shop_id=p_shop and (b.created_revision=p_revision or b.cancelled_revision=p_revision)
  union all select 'movement',v.movement_version_id,app_private.payment_history_replica_payload_v1(p_shop,'movement',v.movement_version_id) from public.payment_history_revisions c join public.payment_history_movement_versions v on v.shop_id=c.shop_id and v.movement_version_id=c.movement_version_id where c.shop_id=p_shop and c.revision=p_revision
 )x;
 select count(*)::integer,encode(extensions.digest(convert_to(coalesce(string_agg(entity_kind||'|'||entity_id::text||'|'||entity_digest||chr(10),'' order by ordinal),''),'UTF8'),'sha256'),'hex') into n,digest from public.payment_history_replica_events where shop_id=p_shop and revision=p_revision;
 insert into public.payment_history_change_sets(shop_id,revision,change_count,changes_digest) values(p_shop,p_revision,n,digest);
end;$$;
revoke all on function app_private.payment_history_seal_revision_v1(uuid,bigint) from public,anon,authenticated,service_role;

create function app_private.payment_history_inventory_digest_v1(p_shop uuid) returns text
language sql stable security definer set search_path='' as $$
 select encode(extensions.digest(convert_to(jsonb_build_object(
  'inventory',(select coalesce(jsonb_agg(to_jsonb(i) order by i.inventory_id),'[]') from public.payment_history_inventory i where i.shop_id=p_shop),
  'known_pos',(select coalesce(jsonb_agg(jsonb_build_object('id',d.shop_device_id,'status',d.status,'revoked_at',d.revoked_at,
   'credentials',(select coalesce(jsonb_agg(jsonb_build_object('id',c.pos_device_credential_id,'status',c.status,'revoked',c.revoked_at) order by c.pos_device_credential_id),'[]') from public.pos_device_credentials c where c.shop_id=d.shop_id and c.shop_device_id=d.shop_device_id)) order by d.shop_device_id),'[]')
   from public.shop_devices d where d.shop_id=p_shop and (d.device_type='pos' or exists(select 1 from public.pos_device_credentials c where c.shop_device_id=d.shop_device_id))))::text,'UTF8'),'sha256'),'hex');
$$;
revoke all on function app_private.payment_history_inventory_digest_v1(uuid) from public,anon,authenticated,service_role;
create function app_private.payment_history_cutover_gates_v1(p_shop uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
 with context as materialized(select r.*,p.inventory_digest,p.grant_drain_after,p.state plan_state,app_private.payment_history_replica_checksum_v1(p_shop) checksum
  from public.payment_history_runtime r left join public.payment_history_cutover_plans p on p.shop_id=r.shop_id and p.writer_epoch=r.writer_epoch where r.shop_id=p_shop),
 gates as(select
  (not exists(select 1 from public.payment_history_inventory where shop_id=p_shop and disposition='unresolved')
   and not exists(select 1 from public.shop_devices d where d.shop_id=p_shop and (d.device_type='pos' or exists(select 1 from public.pos_device_credentials c where c.shop_device_id=d.shop_device_id))
    and not exists(select 1 from public.payment_history_inventory i where i.shop_id=d.shop_id and i.shop_device_id=d.shop_device_id))
   and not exists(select 1 from public.payment_history_inventory i left join public.shop_devices d on d.shop_id=i.shop_id and d.shop_device_id=i.shop_device_id where i.shop_id=p_shop and
    ((i.disposition='active' and (d.shop_device_id is null or d.status<>'active' or d.revoked_at is not null or i.protocol_version<>1 or i.client_build_sha is null)) or
     (i.disposition='retired_verified' and i.shop_device_id is not null and (d.revoked_at is null or d.status='active' or exists(select 1 from public.pos_device_credentials c where c.shop_device_id=d.shop_device_id and c.status='active' and c.revoked_at is null) or exists(select 1 from public.pos_sessions s where s.shop_device_id=d.shop_device_id and s.status='active' and s.revoked_at is null)))))) inventory_resolved,
  c.inventory_digest is not distinct from app_private.payment_history_inventory_digest_v1(p_shop) inventory_unchanged,
  c.writer_authority='frozen' and c.plan_state='frozen' and c.grant_drain_after<=clock_timestamp() and not exists(select 1 from public.payment_history_local_write_grants where shop_id=p_shop and expires_at>clock_timestamp()) grants_drained,
  not exists(select 1 from public.payment_history_inventory i where i.shop_id=p_shop and i.disposition='active' and not exists(
   select 1 from public.payment_history_freeze_acks a join public.payment_history_source_snapshots s on s.shop_id=a.shop_id and s.shop_device_id=a.shop_device_id and s.local_dataset_id=a.local_dataset_id
    and s.data_revision=a.data_revision and s.restore_epoch=a.restore_epoch and s.archive_sha256=a.archive_sha256 and s.backup_sha256=a.backup_sha256
    where a.shop_id=p_shop and a.shop_device_id=i.shop_device_id and a.writer_epoch=c.writer_epoch and a.local_writes_drained and a.native_outbox_drained)) sources_reconciled,
  not exists(select 1 from public.payment_history_inventory i where i.shop_id=p_shop and i.disposition='active' and not exists(
   select 1 from public.payment_history_replica_acks a where a.shop_id=p_shop and a.shop_device_id=i.shop_device_id and a.dataset_id=c.dataset_id and a.revision=c.revision and a.writer_epoch=c.writer_epoch
    and a.checksum=c.checksum and a.protocol_version=i.protocol_version and a.client_build_sha=i.client_build_sha and a.acknowledged_at>clock_timestamp()-interval '15 minutes')) replicas_current,
  not exists(select 1 from public.payment_history_movement_versions h where h.shop_id=p_shop and h.active and exists(select 1 from public.pos_sales n where n.shop_id=h.shop_id and n.status='accepted' and n.business_date<=h.business_date)) native_overlap_clear
 from context c)
 select to_jsonb(g)||jsonb_build_object('can_activate',g.inventory_resolved and g.inventory_unchanged and g.grants_drained and g.sources_reconciled and g.replicas_current and g.native_overlap_clear) from gates g;
$$;
revoke all on function app_private.payment_history_cutover_gates_v1(uuid) from public,anon,authenticated,service_role;
create function public.payment_history_cutover_v1(p_shop_id uuid,p_operation text,p_payload jsonb default '{}',p_staff_id uuid default null,p_staff_web_session_id uuid default null,p_session_token_hash text default null,p_credential_version integer default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare a jsonb;r public.payment_history_runtime;result jsonb;gates jsonb;i public.payment_history_inventory;v_device uuid;v_epoch bigint;v_digest text;v_drain timestamptz;begin
 if p_operation is null or p_operation not in ('status','inventory','freeze','activate_web','freeze_web') or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>65536 then raise exception using errcode='22023',message='payment_history_operation_invalid';end if;
 a:=app_private.payment_history_demand_actor_v1(p_shop_id,'migrate',p_staff_id,p_staff_web_session_id,p_session_token_hash,p_credential_version);
 insert into public.payment_history_runtime(shop_id) values(p_shop_id) on conflict do nothing;
 select * into r from public.payment_history_runtime where shop_id=p_shop_id for update;
 if p_operation='inventory' then
  if r.writer_authority='web' or coalesce(p_payload->>'hardware_reference_sha256','') !~ '^[0-9a-f]{64}$' or length(coalesce(p_payload->>'reference','')) not between 1 and 2048
   or coalesce(p_payload->>'disposition','') not in ('active','retired_verified','unresolved') then raise exception using errcode='22023',message='payment_history_inventory_invalid';end if;
  v_device:=(p_payload->>'device_id')::uuid;
  if v_device is not null and not exists(select 1 from public.shop_devices where shop_id=p_shop_id and shop_device_id=v_device) then raise exception using errcode='42501',message='payment_history_device_scope';end if;
  select * into i from public.payment_history_inventory where shop_id=p_shop_id and hardware_reference_sha256=p_payload->>'hardware_reference_sha256';
  if found and i.shop_device_id is distinct from v_device then raise exception using errcode='23505',message='payment_history_inventory_identity_changed';end if;
  insert into public.payment_history_inventory(shop_id,shop_device_id,hardware_reference_sha256,disposition,protocol_version,client_build_sha,evidence_reference,actor_kind,actor_id)
   values(p_shop_id,v_device,p_payload->>'hardware_reference_sha256',p_payload->>'disposition',coalesce((p_payload->>'protocol_version')::integer,0),p_payload->>'client_build_sha',p_payload->>'reference',a->>'kind',(a->>'id')::uuid)
   on conflict(shop_id,hardware_reference_sha256) do update set disposition=excluded.disposition,protocol_version=excluded.protocol_version,client_build_sha=excluded.client_build_sha,evidence_reference=excluded.evidence_reference,actor_kind=excluded.actor_kind,actor_id=excluded.actor_id,verified_at=clock_timestamp() returning * into i;
  result:=jsonb_build_object('inventory_id',i.inventory_id);
 elsif p_operation in ('freeze','freeze_web') then
  if (p_payload->>'writer_epoch')::bigint is distinct from r.writer_epoch or p_payload->'complete_inventory' is distinct from 'true'::jsonb or length(coalesce(p_payload->>'reference','')) not between 1 and 2048
   or p_operation='freeze_web' and r.writer_authority<>'web' or p_operation='freeze' and r.writer_authority='web' then raise exception using errcode='40001',message='payment_history_freeze_not_ready';end if;
  v_epoch:=r.writer_epoch+1;v_digest:=app_private.payment_history_inventory_digest_v1(p_shop_id);
  select greatest(clock_timestamp(),coalesce(max(expires_at),clock_timestamp())) into v_drain from public.payment_history_local_write_grants where shop_id=p_shop_id;
  insert into public.payment_history_cutover_plans(shop_id,writer_epoch,inventory_digest,completeness_reference,actor_kind,actor_id,state,grant_drain_after)
   values(p_shop_id,v_epoch,v_digest,p_payload->>'reference',a->>'kind',(a->>'id')::uuid,case when p_operation='freeze_web' then 'reconcile_required' else 'frozen' end,v_drain);
  update public.payment_history_runtime set writer_authority='frozen',writer_epoch=v_epoch,inventory_verified=false,frozen_at=clock_timestamp(),updated_at=clock_timestamp() where shop_id=p_shop_id;
  result:=jsonb_build_object('writer_epoch',v_epoch::text,'writer_authority','frozen','reconciliation_required',p_operation='freeze_web');
 elsif p_operation='activate_web' then
  gates:=app_private.payment_history_cutover_gates_v1(p_shop_id);
  if (p_payload->>'writer_epoch')::bigint is distinct from r.writer_epoch or p_payload->>'inventory_digest' is distinct from app_private.payment_history_inventory_digest_v1(p_shop_id) or coalesce(gates->>'can_activate','false')<>'true' then raise exception using errcode='40001',message='payment_history_cutover_blocked';end if;
  update public.payment_history_runtime set writer_authority='web',inventory_verified=true,updated_at=clock_timestamp() where shop_id=p_shop_id;
  update public.payment_history_cutover_plans set state='web_active',activated_at=clock_timestamp() where shop_id=p_shop_id and writer_epoch=r.writer_epoch;
  result:=jsonb_build_object('writer_epoch',r.writer_epoch::text,'writer_authority','web');
 else
  result:=jsonb_build_object('dataset_id',r.dataset_id,'revision',r.revision::text,'writer_epoch',r.writer_epoch::text,'writer_authority',r.writer_authority,'inventory_verified',r.inventory_verified,
   'inventory_digest',app_private.payment_history_inventory_digest_v1(p_shop_id),'gates',app_private.payment_history_cutover_gates_v1(p_shop_id),
   'inventory',(select coalesce(jsonb_agg(jsonb_build_object('id',inventory_id,'device_id',shop_device_id,'hardware_reference_sha256',hardware_reference_sha256,'disposition',disposition,'protocol_version',protocol_version,'client_build_sha',client_build_sha,'reference',evidence_reference) order by inventory_id),'[]') from public.payment_history_inventory where shop_id=p_shop_id),
   'known_devices',(select coalesce(jsonb_agg(jsonb_build_object('device_id',d.shop_device_id,'status',d.status,'revoked',d.revoked_at is not null) order by d.shop_device_id),'[]') from public.shop_devices d where d.shop_id=p_shop_id and (d.device_type='pos' or exists(select 1 from public.pos_device_credentials c where c.shop_device_id=d.shop_device_id))));
 end if;
 if p_operation<>'status' then insert into public.payment_history_events(shop_id,actor_kind,actor_id,operation,subject_id) values(p_shop_id,a->>'kind',(a->>'id')::uuid,'cutover_'||p_operation,i.inventory_id);end if;
 if not app_private.payment_history_publishable_v1() then raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 if octet_length(result::text)>4194304 then raise exception using errcode='54000',message='payment_history_response_limit';end if;
 return jsonb_build_object('ok',true,'shop_id',p_shop_id,'actor',a,'result',result);
end;$$;
revoke all on function public.payment_history_cutover_v1(uuid,text,jsonb,uuid,uuid,text,integer) from public,anon;
grant execute on function public.payment_history_cutover_v1(uuid,text,jsonb,uuid,uuid,text,integer) to authenticated,service_role;

create function public.payment_history_device_v1(p_shop_id uuid,p_shop_device_id uuid,p_staff_id uuid,p_pos_session_id uuid,p_device_token_hash text,p_session_token_hash text,p_credential_version integer,p_operation text,p_payload jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r public.payment_history_runtime;g public.payment_history_local_write_grants;s public.payment_history_replica_snapshots;c public.payment_history_replica_cursors;
 n public.payment_history_replica_cursors;ack public.payment_history_freeze_acks;result jsonb;entities jsonb;v_cap text;v_role text;v_id uuid;v_count integer;v_limit integer;
 v_now timestamptz;v_expires timestamptz;v_checksum text;v_movements integer;v_batches integer;v_last_revision bigint;v_last_ordinal integer;v_more boolean;v_done boolean;
begin
 if coalesce(auth.role(),'')<>'service_role' or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>65536
  or p_operation is null or p_operation not in ('authority','local_write_grant','freeze_ack','snapshot_start','delta_start','page','replica_ack') then raise exception using errcode='42501',message='payment_history_device_denied';end if;
 if not app_private.pos_runtime_lease_is_valid_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id)
  or not exists(select 1 from public.pos_sessions se join public.pos_device_credentials cr on cr.pos_device_credential_id=se.pos_device_credential_id where se.pos_session_id=p_pos_session_id
   and se.session_token_hash=p_session_token_hash and cr.token_hash=p_device_token_hash and se.staff_credential_version=p_credential_version) then raise exception using errcode='42501',message='payment_history_device_denied';end if;
 select role_key into v_role from public.staff_accounts where staff_id=p_staff_id;
 perform pg_advisory_xact_lock_shared(hashtextextended('payment-history-role:'||p_shop_id::text||':'||v_role,0));
 perform 1 from public.payment_history_role_permissions where shop_id=p_shop_id and role_key=v_role for share;
 perform 1 from public.staff_role_permissions where shop_id=p_shop_id and role_key=v_role and permission_key='shop_admin.full_access' for share;
 v_cap:=case when p_operation='freeze_ack' then 'migrate' when p_operation='local_write_grant' then case when p_payload->>'kind'='Undo' then 'cancel' else 'import' end else 'read' end;
 if not app_private.payment_history_staff_can_v1(p_shop_id,p_staff_id,v_cap) then raise exception using errcode='42501',message='payment_history_device_denied';end if;
 insert into public.payment_history_runtime(shop_id) values(p_shop_id) on conflict do nothing;
 -- SHARE permits concurrent readers, but serializes every snapshot/authority
 -- publication against financial writes and writer-epoch transitions.
 select * into r from public.payment_history_runtime where shop_id=p_shop_id for share;
 if p_operation='authority' then
  result:=jsonb_build_object('dataset_id',r.dataset_id,'revision',r.revision::text,'writer_epoch',r.writer_epoch::text,'writer_authority',r.writer_authority,'inventory_verified',r.inventory_verified,'protocol_version',1);
 elsif p_operation='local_write_grant' then
  if r.writer_authority<>'local' or coalesce(p_payload->>'kind','') not in ('Apply','Undo') or (p_payload->>'operation_id')::uuid is null or (p_payload->>'writer_epoch')::bigint is distinct from r.writer_epoch then raise exception using errcode='40001',message='payment_history_local_writer_closed';end if;
  v_now:=clock_timestamp();
  select least(v_now+interval '60 seconds',se.expires_at,cr.expires_at,coalesce(st.credential_expires_at,'infinity')) into v_expires
   from public.pos_sessions se join public.pos_device_credentials cr on cr.pos_device_credential_id=se.pos_device_credential_id join public.staff_accounts st on st.staff_id=se.staff_id where se.pos_session_id=p_pos_session_id;
  select * into g from public.payment_history_local_write_grants where shop_id=p_shop_id and shop_device_id=p_shop_device_id and operation_id=(p_payload->>'operation_id')::uuid;
  if not found then
   insert into public.payment_history_local_write_grants(shop_id,shop_device_id,writer_epoch,operation_id,issued_at,expires_at) values(p_shop_id,p_shop_device_id,r.writer_epoch,(p_payload->>'operation_id')::uuid,v_now,v_expires) returning * into g;
  end if;
  if g.writer_epoch<>r.writer_epoch or g.expires_at<=clock_timestamp()+interval '10 seconds' then raise exception using errcode='40001',message='payment_history_local_write_grant_expired';end if;
  result:=jsonb_build_object('grant_id',g.grant_id,'operation_id',g.operation_id,'writer_epoch',g.writer_epoch::text,'remaining_milliseconds',floor(extract(epoch from g.expires_at-clock_timestamp())*1000)::integer);
 elsif p_operation='freeze_ack' then
  if r.writer_authority<>'frozen' or (p_payload->>'writer_epoch')::bigint is distinct from r.writer_epoch
   or coalesce((p_payload->>'local_writes_drained')::boolean,false)<>true or coalesce((p_payload->>'native_outbox_drained')::boolean,false)<>true
   or coalesce(p_payload->>'archive_sha256','') !~ '^[0-9a-f]{64}$' or coalesce(p_payload->>'manifest_sha256','') !~ '^[0-9a-f]{64}$' or coalesce(p_payload->>'backup_sha256','') !~ '^[0-9a-f]{64}$'
   or length(coalesce(p_payload->>'local_dataset_id','')) not between 1 and 256 or (p_payload->>'data_revision')::bigint<0 or (p_payload->>'restore_epoch')::bigint<0
   or not exists(select 1 from public.payment_history_cutover_plans where shop_id=p_shop_id and writer_epoch=r.writer_epoch and state='frozen' and grant_drain_after<=clock_timestamp())
   or exists(select 1 from public.payment_history_local_write_grants where shop_id=p_shop_id and expires_at>clock_timestamp())
   or not exists(select 1 from public.payment_history_inventory i where i.shop_id=p_shop_id and i.shop_device_id=p_shop_device_id and i.disposition='active' and i.protocol_version=(p_payload->>'protocol_version')::integer and i.client_build_sha=p_payload->>'client_build_sha') then raise exception using errcode='40001',message='payment_history_freeze_not_ready';end if;
  insert into public.payment_history_freeze_acks values(p_shop_id,p_shop_device_id,r.writer_epoch,p_payload->>'local_dataset_id',(p_payload->>'data_revision')::bigint,(p_payload->>'restore_epoch')::bigint,p_payload->>'archive_sha256',p_payload->>'manifest_sha256',p_payload->>'backup_sha256',true,true,p_staff_id,clock_timestamp()) on conflict do nothing;
  select * into ack from public.payment_history_freeze_acks where shop_id=p_shop_id and shop_device_id=p_shop_device_id and writer_epoch=r.writer_epoch;
  if ack.local_dataset_id is distinct from p_payload->>'local_dataset_id' or ack.data_revision is distinct from (p_payload->>'data_revision')::bigint or ack.restore_epoch is distinct from (p_payload->>'restore_epoch')::bigint or ack.archive_sha256 is distinct from p_payload->>'archive_sha256' or ack.manifest_sha256 is distinct from p_payload->>'manifest_sha256' or ack.backup_sha256 is distinct from p_payload->>'backup_sha256' then raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
  result:=jsonb_build_object('acknowledged',true,'writer_epoch',r.writer_epoch::text);
 elsif p_operation='snapshot_start' then
  v_id:=(p_payload->>'request_key')::uuid;v_limit:=coalesce((p_payload->>'page_size')::integer,200);
  if v_id is null or v_limit not between 1 and 1000 then raise exception using errcode='22023',message='payment_history_page_limit';end if;
  select * into s from public.payment_history_replica_snapshots where shop_id=p_shop_id and shop_device_id=p_shop_device_id and request_key=v_id;
  if found then
   if s.expires_at<=clock_timestamp() or s.dataset_id<>r.dataset_id or s.writer_epoch<>r.writer_epoch then raise exception using errcode='40001',message='payment_history_resnapshot_required';end if;
   select * into c from public.payment_history_replica_cursors where snapshot_id=s.snapshot_id order by next_ordinal limit 1;
   if c.page_size<>v_limit then raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
  else
   select count(*) filter(where entity_kind='movement'),count(*) filter(where entity_kind='batch') into v_movements,v_batches from app_private.payment_history_replica_entities_v1(p_shop_id);
   if v_movements>1000000 or v_batches>100000 then raise exception using errcode='54000',message='payment_history_replica_capacity';end if;
   if (select count(*) from public.payment_history_replica_snapshots where shop_id=p_shop_id and shop_device_id=p_shop_device_id and expires_at>clock_timestamp())>=3 then raise exception using errcode='54000',message='payment_history_replica_backpressure';end if;
   v_checksum:=app_private.payment_history_replica_checksum_v1(p_shop_id);
   insert into public.payment_history_replica_snapshots(shop_id,shop_device_id,dataset_id,revision,writer_epoch,movement_count,batch_count,request_key,checksum,expires_at)
    values(p_shop_id,p_shop_device_id,r.dataset_id,r.revision,r.writer_epoch,v_movements,v_batches,v_id,v_checksum,clock_timestamp()+interval '1 hour') returning * into s;
   insert into public.payment_history_replica_snapshot_rows select p_shop_id,s.snapshot_id,row_number() over(order by e.entity_kind collate "C",e.entity_id)::integer,e.* from app_private.payment_history_replica_entities_v1(p_shop_id) e;
   insert into public.payment_history_replica_cursors(shop_id,shop_device_id,mode,snapshot_id,dataset_id,writer_epoch,target_revision,next_revision,next_ordinal,page_size,target_checksum,target_movements,target_batches,expires_at)
    values(p_shop_id,p_shop_device_id,'snapshot',s.snapshot_id,s.dataset_id,s.writer_epoch,s.revision,0,0,v_limit,s.checksum,s.movement_count,s.batch_count,s.expires_at) returning * into c;
  end if;
  result:=jsonb_build_object('cursor',c.cursor_id,'dataset_id',c.dataset_id,'revision',c.target_revision::text,'writer_epoch',c.writer_epoch::text,'checksum',c.target_checksum,'movements',c.target_movements,'batches',c.target_batches,'mode','snapshot');
 elsif p_operation='delta_start' then
  v_last_revision:=(p_payload->>'revision')::bigint;v_limit:=coalesce((p_payload->>'page_size')::integer,200);
  if v_last_revision is null or v_last_revision<r.replica_floor_revision or v_last_revision>r.revision or (p_payload->>'dataset_id')::uuid is distinct from r.dataset_id or (p_payload->>'writer_epoch')::bigint is distinct from r.writer_epoch
   or v_limit not between 1 and 1000 or (select count(*) from public.payment_history_change_sets where shop_id=p_shop_id and revision>v_last_revision and revision<=r.revision)<>r.revision-v_last_revision then raise exception using errcode='40001',message='payment_history_resnapshot_required';end if;
  select count(*) filter(where entity_kind='movement'),count(*) filter(where entity_kind='batch') into v_movements,v_batches from app_private.payment_history_replica_entities_v1(p_shop_id);
  insert into public.payment_history_replica_cursors(shop_id,shop_device_id,mode,dataset_id,writer_epoch,target_revision,next_revision,next_ordinal,page_size,target_checksum,target_movements,target_batches,expires_at)
   values(p_shop_id,p_shop_device_id,'delta',r.dataset_id,r.writer_epoch,r.revision,v_last_revision,2147483647,v_limit,app_private.payment_history_replica_checksum_v1(p_shop_id),v_movements,v_batches,clock_timestamp()+interval '1 hour') returning * into c;
  result:=jsonb_build_object('cursor',c.cursor_id,'dataset_id',c.dataset_id,'revision',c.target_revision::text,'writer_epoch',c.writer_epoch::text,'checksum',c.target_checksum,'movements',c.target_movements,'batches',c.target_batches,'mode','delta');
 elsif p_operation in ('page','replica_ack') then
  select * into c from public.payment_history_replica_cursors where shop_id=p_shop_id and shop_device_id=p_shop_device_id and cursor_id=(p_payload->>'cursor')::uuid for update;
  if not found or c.expires_at<=clock_timestamp() or c.dataset_id<>r.dataset_id or c.writer_epoch<>r.writer_epoch then raise exception using errcode='40001',message='payment_history_resnapshot_required';end if;
  if p_operation='replica_ack' then
   if not c.completed or c.next_cursor_id is not null or c.target_revision<>r.revision or c.target_checksum is distinct from p_payload->>'checksum' or c.target_checksum is distinct from app_private.payment_history_replica_checksum_v1(p_shop_id)
    or (p_payload->>'protocol_version')::integer is distinct from 1 or coalesce(p_payload->>'client_build_sha','') !~ '^[0-9a-f]{40}$' then raise exception using errcode='40001',message='payment_history_replica_ack_invalid';end if;
   insert into public.payment_history_replica_acks(shop_id,shop_device_id,dataset_id,revision,writer_epoch,checksum,protocol_version,client_build_sha)
    values(p_shop_id,p_shop_device_id,r.dataset_id,r.revision,r.writer_epoch,c.target_checksum,1,p_payload->>'client_build_sha')
    on conflict(shop_id,shop_device_id) do update set dataset_id=excluded.dataset_id,revision=excluded.revision,writer_epoch=excluded.writer_epoch,checksum=excluded.checksum,protocol_version=excluded.protocol_version,client_build_sha=excluded.client_build_sha,acknowledged_at=clock_timestamp();
   result:=jsonb_build_object('acknowledged',true,'revision',r.revision::text,'writer_epoch',r.writer_epoch::text);
  else
   if c.mode='snapshot' then
    select coalesce(jsonb_agg(jsonb_build_object('kind',x.entity_kind,'id',x.entity_id,'digest',x.entity_digest,'payload',x.payload) order by x.ordinal),'[]'),coalesce(max(x.ordinal),c.next_ordinal) into entities,v_last_ordinal
     from(select * from public.payment_history_replica_snapshot_rows where snapshot_id=c.snapshot_id and ordinal>c.next_ordinal order by ordinal limit c.page_size)x;
    v_last_revision:=0;v_more:=exists(select 1 from public.payment_history_replica_snapshot_rows where snapshot_id=c.snapshot_id and ordinal>v_last_ordinal);
   else
    select coalesce(jsonb_agg(jsonb_build_object('kind',x.entity_kind,'id',x.entity_id,'digest',x.entity_digest,'payload',x.payload) order by x.revision,x.ordinal),'[]') into entities
     from(select * from public.payment_history_replica_events where shop_id=p_shop_id and revision<=c.target_revision and (revision,ordinal)>(c.next_revision,c.next_ordinal) order by revision,ordinal limit c.page_size)x;
    select revision,ordinal into v_last_revision,v_last_ordinal from public.payment_history_replica_events where shop_id=p_shop_id and revision<=c.target_revision and (revision,ordinal)>(c.next_revision,c.next_ordinal) order by revision,ordinal limit 1 offset greatest(jsonb_array_length(entities)-1,0);
    if not found then v_last_revision:=c.target_revision;v_last_ordinal:=2147483647;end if;
    v_more:=exists(select 1 from public.payment_history_replica_events where shop_id=p_shop_id and revision<=c.target_revision and (revision,ordinal)>(v_last_revision,v_last_ordinal));
   end if;
   if v_more and c.next_cursor_id is null then
    insert into public.payment_history_replica_cursors(shop_id,shop_device_id,mode,snapshot_id,dataset_id,writer_epoch,target_revision,next_revision,next_ordinal,page_size,target_checksum,target_movements,target_batches,expires_at)
     values(c.shop_id,c.shop_device_id,c.mode,c.snapshot_id,c.dataset_id,c.writer_epoch,c.target_revision,v_last_revision,v_last_ordinal,c.page_size,c.target_checksum,c.target_movements,c.target_batches,c.expires_at) returning * into n;
    update public.payment_history_replica_cursors set next_cursor_id=n.cursor_id where cursor_id=c.cursor_id;c.next_cursor_id:=n.cursor_id;
   end if;
   update public.payment_history_replica_cursors set completed=not v_more where cursor_id=c.cursor_id;
   result:=jsonb_build_object('cursor',c.cursor_id,'next_cursor',c.next_cursor_id,'done',not v_more,'dataset_id',c.dataset_id,'revision',c.target_revision::text,'writer_epoch',c.writer_epoch::text,'checksum',c.target_checksum,'movements',c.target_movements,'batches',c.target_batches,'entities',entities);
  end if;
 end if;
 if not app_private.pos_runtime_lease_is_valid_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id) or not app_private.payment_history_staff_can_v1(p_shop_id,p_staff_id,v_cap) then raise exception using errcode='42501',message='payment_history_device_denied';end if;
 if octet_length(result::text)>4194304 then raise exception using errcode='54000',message='payment_history_response_limit';end if;
 return jsonb_build_object('ok',true,'shop_id',p_shop_id,'device_id',p_shop_device_id,'session_id',p_pos_session_id,'result',result);
end;$$;
revoke all on function public.payment_history_device_v1(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.payment_history_device_v1(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb) to service_role;

create or replace function app_private.payment_history_demand_actor_v1(p_shop_id uuid,p_capability text,p_staff_id uuid,
 p_staff_web_session_id uuid,p_session_token_hash text,p_credential_version integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_session uuid;v_deadline timestamptz;v_role text;v_enabled boolean;
begin
 if p_capability is null or p_capability not in ('read','import','cancel','export','migrate') then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
 perform 1 from public.shops where shop_id=p_shop_id and shop_status='active' for share;
 if not found then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
 if p_staff_id is not null then
  if coalesce(auth.role(),'')<>'service_role' or p_session_token_hash is null or p_session_token_hash !~ '^sha256:[0-9a-f]{64}$'
   or p_staff_web_session_id is null or coalesce(p_credential_version,0)<1
   or not app_private.staff_web_runtime_lease_is_valid_v1(p_shop_id,p_staff_id,p_staff_web_session_id,p_session_token_hash,p_credential_version,null)
   or not app_private.payment_history_staff_can_v1(p_shop_id,p_staff_id,p_capability) then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
  select role_key into v_role from public.staff_accounts where staff_id=p_staff_id and shop_id=p_shop_id;
  perform pg_advisory_xact_lock_shared(hashtextextended('payment-history-role:'||p_shop_id::text||':'||v_role,0));
  select enabled into v_enabled from public.payment_history_role_permissions
   where shop_id=p_shop_id and role_key=v_role and capability=p_capability for share;
  if found then
   if not v_enabled then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
  else
   perform 1 from public.staff_role_permissions where shop_id=p_shop_id and role_key=v_role and permission_key='shop_admin.full_access' and enabled for share;
   if not found then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
  end if;
  perform set_config('app.payment_history_publish_deadline',current_setting('app.staff_web_publish_deadline'),true);
  return jsonb_build_object('kind','pos_staff_manager','id',p_staff_id,'session_id',p_staff_web_session_id,'credential_version',p_credential_version);
 end if;
 if p_staff_web_session_id is not null or p_session_token_hash is not null or p_credential_version is not null
  or coalesce(auth.role(),'')<>'authenticated' or not app_private.payment_history_profile_can_v1(p_shop_id,p_capability)
  or coalesce(auth.jwt()->>'exp','') !~ '^[0-9]{1,12}$' then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
 select m.role_key into v_role from public.shop_members m where m.shop_id=p_shop_id and m.profile_id=auth.uid() and m.membership_status='active' for share;
 if not found then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
 perform 1 from public.profiles where profile_id=auth.uid() and profile_status='active' and disabled_at is null for share;
 if not found then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
 if v_role='shop_manager' then perform 1 from public.payment_history_role_permissions where shop_id=p_shop_id and role_key='shop_manager' and capability=p_capability and enabled for share;
  if not found then raise exception using errcode='42501',message='payment_history_permission_denied';end if;end if;
 select ses.id,least(coalesce(ses.not_after,'infinity'),to_timestamp((auth.jwt()->>'exp')::bigint)) into v_session,v_deadline
  from auth.sessions ses where ses.id::text=auth.jwt()->>'session_id' and ses.user_id=auth.uid() for share;
 if not found or v_deadline<=clock_timestamp() then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
 perform set_config('app.payment_history_publish_deadline',v_deadline::text,true);
 return jsonb_build_object('kind','personal_account','id',auth.uid(),'session_id',v_session,'credential_version',null);
end;$$;

create or replace function app_private.payment_history_economics_v1(p_transaction jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare v jsonb;g bigint;c bigint;t bigint;n bigint;k text;s text;begin
 if jsonb_typeof(p_transaction) is distinct from 'object' or p_transaction->>'provider' is distinct from 'getnet' or p_transaction->>'currency' is distinct from 'CLP'
  or coalesce(p_transaction->>'parserVersion','') not in ('getnet-ooxml-web-v1','history-local-ledger-v1') or coalesce(p_transaction->>'externalNamespace','') not in ('getnet.legacy.transaction','getnet.financial.movement')
  or length(coalesce(p_transaction->>'externalId','')) not between 1 and 256 or (p_transaction->>'externalId') ~ '[[:cntrl:]]'
  or coalesce(p_transaction->>'profile','') not in ('GetnetLegacy','GetnetModern') then raise exception using errcode='22023',message='payment_history_transaction_invalid';end if;
 foreach k in array array['grossClp','commissionClp','commissionVatClp','netClp'] loop
  if p_transaction->>k is not null and (jsonb_typeof(p_transaction->k)<>'string' or (p_transaction->>k) !~ '^(0|-?[1-9][0-9]*)$') then raise exception using errcode='22023',message='payment_history_amount_invalid';end if;
 end loop;
 g:=(p_transaction->>'grossClp')::bigint;c:=(p_transaction->>'commissionClp')::bigint;t:=(p_transaction->>'commissionVatClp')::bigint;n:=(p_transaction->>'netClp')::bigint;
 k:=p_transaction->>'movementKind';s:=upper(trim(p_transaction->>'transactionStatus'));
 if g is null or k is null or not ((k='Sale' and g>0) or (k='Cancellation' and g<0)) or s is null or s not in ('ABONADO','CONFIRMADA')
  or (p_transaction->>'profile'='GetnetLegacy' and (k<>'Sale' or c is null or c<0 or n is null or t is not null or n::numeric<>g::numeric-c::numeric))
  or (p_transaction->>'profile'='GetnetModern' and ((g>0 and (c>0 or t>0)) or (g<0 and (c<0 or t<0))
   or (n is not null and c is not null and t is not null and n::numeric<>g::numeric+c::numeric+t::numeric)))
  then raise exception using errcode='22023',message='payment_history_economics_invalid';end if;
 v:=jsonb_build_object('businessTicks',app_private.payment_history_ticks_v1(p_transaction#>>'{timestamp,businessDateTime}')::text,
  'grossClp',g::text,'commissionClp',c::text,'commissionVatClp',t::text,'netClp',n::text,'movementKind',k,'transactionState',s);
 return v;
end;$$;

create or replace function app_private.payment_history_review_rows_v1(p_job uuid)
returns table(ordinal integer,merchant_id uuid,identity_key text,previous_version_id uuid,decision text,code text)
language sql volatile security definer set search_path='' as $$
 with job as materialized (select j.*,r.revision,r.writer_epoch from public.payment_history_jobs j join public.payment_history_runtime r using(shop_id) where j.job_id=p_job),
 proofs as materialized(select array(select jsonb_array_elements_text(coalesce(configuration->'evidence_ids','[]'))::uuid) ids from job),
 base as materialized (
 select s.*,a.merchant_id canonical_merchant_id,e.status alias_evidence_status,e.verification_level alias_evidence_level,
  encode(extensions.digest(convert_to(s.shop_id::text||chr(31)||'getnet'||chr(31)||a.merchant_id::text||chr(31)||(s.transaction->>'externalNamespace')||chr(31)||(s.transaction->>'externalId'),'UTF8'),'sha256'),'hex') global_key,
  row_number() over(partition by a.merchant_id,s.transaction->>'externalNamespace',s.transaction->>'externalId' order by s.ordinal) identity_ordinal,
  min((s.transaction#>>'{timestamp,businessDateTime}')::date) over() first_date
 from public.payment_history_staged_movements s join job j on j.job_id=s.job_id
 left join public.payment_history_merchant_aliases a on a.shop_id=s.shop_id and a.alias_key=s.alias_key and a.active
 left join public.payment_history_evidence e on e.shop_id=a.shop_id and e.evidence_id=a.evidence_id and e.kind='merchant_mapping'
 ), collisions as materialized (
 select b.global_key from base b where b.global_key is not null group by b.global_key having
 count(distinct b.economics->>'businessTicks')>1 or count(distinct b.economics->>'grossClp')>1 or count(distinct b.economics->>'movementKind')>1 or count(distinct b.economics->>'transactionState')>1
 or count(distinct b.economics->>'commissionClp')>1 or count(distinct b.economics->>'commissionVatClp')>1 or count(distinct b.economics->>'netClp')>1
 ), classified as (
 select b.ordinal,b.canonical_merchant_id,b.global_key,coalesce(active.movement_version_id,previous.movement_version_id) previous_id,
 case
 when b.canonical_merchant_id is null or b.alias_evidence_status is distinct from 'verified' or b.alias_evidence_level is null or b.alias_evidence_level='unverified' or not app_private.payment_history_proof_covers_v1(b.shop_id,array[(select a.evidence_id from public.payment_history_merchant_aliases a where a.shop_id=b.shop_id and a.alias_key=b.alias_key and a.active)],'merchant_mapping',b.canonical_merchant_id,b.transaction#>>'{source,fileSha256}',b.transaction) then 'history_merchant_unverified'
 when not exists(select 1 from public.payment_history_uploads u,job j where u.shop_id=b.shop_id and u.upload_id=b.source_upload_id and u.upload_id=any(j.source_upload_ids) and u.state='verified' and u.file_sha256=b.transaction#>>'{source,fileSha256}') then 'history_upload_unverified'
 when not app_private.payment_history_proof_covers_v1(b.shop_id,p.ids,'native_start',b.canonical_merchant_id,b.transaction#>>'{source,fileSha256}',b.transaction) then 'history_native_start_unverified'
 when exists(select 1 from public.pos_sales n where n.shop_id=b.shop_id and n.status='accepted' and n.business_date<= (b.transaction#>>'{timestamp,businessDateTime}')::date) then 'history_native_overlap'
 when b.transaction->>'profile'='GetnetModern' and not app_private.payment_history_proof_covers_v1(b.shop_id,p.ids,'modern_time',b.canonical_merchant_id,b.transaction#>>'{source,fileSha256}',b.transaction) then 'history_provider_time_unverified'
 when b.transaction->>'profile'='GetnetLegacy' and not app_private.payment_history_proof_covers_v1(b.shop_id,p.ids,'legacy_currency',b.canonical_merchant_id,b.transaction#>>'{source,fileSha256}',b.transaction) then 'history_currency_unverified'
 when collision.global_key is not null or (active.movement_version_id is not null and app_private.payment_history_conflict_v1(b.economics,app_private.payment_history_economics_v1(active.transaction))) then 'history_active_economics_conflict'
 when active.movement_version_id is not null or b.identity_ordinal>1 then 'history_duplicate'
 when previous.movement_version_id is not null and app_private.payment_history_conflict_v1(b.economics,app_private.payment_history_economics_v1(previous.transaction))
 and not exists(select 1 from job j,jsonb_array_elements(coalesce(j.configuration->'corrections','[]')) approval
  join public.payment_history_evidence e on e.evidence_id=(approval->>'evidence_id')::uuid
  where e.shop_id=b.shop_id and e.kind='economic_correction' and e.status='verified' and e.verification_level<>'unverified'
  and approval @> jsonb_build_object('identity_key',b.global_key,'previous_version_id',previous.movement_version_id,'previous_digest',previous.economic_digest,
    'proposed_digest',b.economic_digest,'analysis_digest',j.analysis_digest,'revision',j.revision::text,'writer_epoch',j.writer_epoch::text,
    'source_upload_id',b.source_upload_id,'source_row',b.source_row,'source_sheet',b.source_sheet)) then 'history_inactive_correction_unapproved'
 else 'history_new' end reason
 from base b cross join proofs p
 left join collisions collision on collision.global_key=b.global_key
 left join public.payment_history_movement_versions active on active.shop_id=b.shop_id and active.identity_key=b.global_key and active.active
 left join lateral(select v.* from public.payment_history_movement_versions v where v.shop_id=b.shop_id and v.identity_key=b.global_key and not v.active order by v.created_revision desc,v.movement_version_id desc limit 1) previous on true
 ) select c.ordinal,c.canonical_merchant_id,c.global_key,c.previous_id,
 case c.reason when 'history_new' then 'new' when 'history_duplicate' then 'duplicate' when 'history_active_economics_conflict' then 'conflict' else 'blocked' end,c.reason from classified c;
$$;

create or replace function public.payment_history_request_v1(p_shop_id uuid,p_operation text,p_payload jsonb default '{}',p_staff_id uuid default null,
 p_staff_web_session_id uuid default null,p_session_token_hash text default null,p_credential_version integer default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a jsonb;cap text;result jsonb;r public.payment_history_runtime;j public.payment_history_jobs;b public.payment_history_batches;
 receipt public.payment_history_receipts;u public.payment_history_uploads;e public.payment_history_evidence;
 v_request uuid;v_digest text;v_id uuid;v_batch uuid;v_operation uuid;v_review jsonb;v_ids uuid[];v_revision bigint;v_count integer;
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>65536 then raise exception using errcode='22023',message='payment_history_payload_invalid';end if;
 cap:=case when p_operation in ('capabilities','read','status','receipt','upload_status','metadata') then 'read' when p_operation in ('upload_create','upload_ready','start','configure','review','commit','evidence','merchant') then 'import'
  when p_operation in ('cancel_job','resume_job') then 'import' when p_operation='cancel_batch' then 'cancel' when p_operation='export' then 'export' when p_operation='permissions' then 'migrate' end;
 a:=app_private.payment_history_demand_actor_v1(p_shop_id,cap,p_staff_id,p_staff_web_session_id,p_session_token_hash,p_credential_version);
 -- Same actor/request-key is serialized across both jobs and receipts.
 if p_operation in ('start','commit','cancel_batch') then
  v_request:=(p_payload->>'request_key')::uuid;
  if v_request is null then raise exception using errcode='22023',message='payment_history_request_key_required';end if;
  perform pg_advisory_xact_lock(hashtextextended('payment-history-request:'||p_shop_id::text||':'||(a->>'kind')||':'||(a->>'id')||':'||v_request::text,0));
  v_digest:=encode(extensions.digest(convert_to(p_operation||':'||p_payload::text,'UTF8'),'sha256'),'hex');
  select * into receipt from public.payment_history_receipts where shop_id=p_shop_id and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid and request_key=v_request;
  if found then
   if receipt.request_digest<>v_digest then raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
   if not app_private.payment_history_publishable_v1() then raise exception using errcode='42501',message='payment_history_lease_expired';end if;
   return jsonb_build_object('ok',true,'shop_id',p_shop_id,'actor',a,'result',receipt.receipt);
  end if;
 end if;
 if p_operation='capabilities' then
  result:=jsonb_build_object('capabilities',(select jsonb_object_agg(c,case when a->>'kind'='pos_staff_manager' then app_private.payment_history_staff_can_v1(p_shop_id,(a->>'id')::uuid,c) else app_private.payment_history_profile_can_v1(p_shop_id,c) end) from unnest(array['read','import','cancel','export','migrate']) c),
   'runtime',(select jsonb_build_object('dataset_id',dataset_id,'revision',revision::text,'writer_epoch',writer_epoch::text,'writer_authority',writer_authority,'inventory_verified',inventory_verified) from public.payment_history_runtime where shop_id=p_shop_id));
 elsif p_operation='metadata' then
  result:=jsonb_build_object('merchants',(select coalesce(jsonb_agg(x),'[]') from(select merchant_id,label,evidence_id from public.payment_history_merchants where shop_id=p_shop_id order by merchant_id limit 201)x),
   'aliases',(select coalesce(jsonb_agg(x),'[]') from(select alias_key,merchant_id,evidence_id from public.payment_history_merchant_aliases where shop_id=p_shop_id and active order by alias_key limit 201)x),
   'evidence',(select coalesce(jsonb_agg(x),'[]') from(select evidence_id,kind,verification_level,policy_version,reference,scope from public.payment_history_evidence where shop_id=p_shop_id and status='verified' and kind in ('merchant_mapping','legacy_currency','native_start','modern_time','economic_correction') order by evidence_id limit 201)x));
 elsif p_operation='upload_create' then
  if coalesce(p_payload->>'sha256','') !~ '^[0-9a-f]{64}$' or length(coalesce(p_payload->>'file_name','')) not between 1 and 256 or (p_payload->>'byte_length')::bigint not between 1 and 20971520
   or coalesce(p_payload->>'file_name','') !~* '\.(xlsx|pdf|png|jpg|jpeg)$' then raise exception using errcode='22023',message='payment_history_upload_invalid';end if;
  if (select count(*) from public.payment_history_uploads where shop_id=p_shop_id and actor_id=(a->>'id')::uuid and state='pending' and created_at>clock_timestamp()-interval '1 hour')>=20 then raise exception using errcode='54000',message='payment_history_upload_backpressure';end if;
  v_id:=gen_random_uuid();
  insert into public.payment_history_uploads(upload_id,shop_id,actor_kind,actor_id,object_key,file_name,file_sha256,byte_length)
   values(v_id,p_shop_id,a->>'kind',(a->>'id')::uuid,'history/'||p_shop_id::text||'/'||v_id::text,p_payload->>'file_name',p_payload->>'sha256',(p_payload->>'byte_length')::bigint) returning * into u;
  result:=jsonb_build_object('upload_id',u.upload_id,'object_key',u.object_key);
 elsif p_operation in ('upload_ready','upload_status') then
  select * into u from public.payment_history_uploads where shop_id=p_shop_id and upload_id=(p_payload->>'upload_id')::uuid and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid for update;
  if not found then raise exception using errcode='42501',message='payment_history_upload_actor_mismatch';end if;
  if p_operation='upload_ready' and u.state='pending' then update public.payment_history_uploads set state='uploaded' where upload_id=u.upload_id;u.state:='uploaded';end if;
  result:=jsonb_build_object('upload_id',u.upload_id,'state',u.state,'file_name',u.file_name,'sha256',u.file_sha256,'byte_length',u.byte_length::text);
 elsif p_operation='start' then
  select * into j from public.payment_history_jobs where shop_id=p_shop_id and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid and request_key=v_request;
  if found then
   if j.request_digest<>v_digest then raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
   result:=jsonb_build_object('job_id',j.job_id,'state',j.state);
  else
   if jsonb_typeof(p_payload->'upload_ids') is distinct from 'array' or jsonb_array_length(p_payload->'upload_ids') not between 1 and 10 or jsonb_typeof(p_payload->'configuration') is distinct from 'object'
    or octet_length((p_payload->'configuration')::text)>32768 then raise exception using errcode='22023',message='payment_history_job_invalid';end if;
   v_ids:=array(select jsonb_array_elements_text(p_payload->'upload_ids')::uuid);
   if cardinality(v_ids)<>(select count(distinct x) from unnest(v_ids) x) or cardinality(v_ids)<>(select count(*) from public.payment_history_uploads where shop_id=p_shop_id and upload_id=any(v_ids) and state='verified' and file_name ~* '\.xlsx$' and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid)
    or (select sum(byte_length) from public.payment_history_uploads where upload_id=any(v_ids))>104857600 then raise exception using errcode='22023',message='payment_history_sources_unverified';end if;
   perform pg_advisory_xact_lock(hashtextextended('payment-history-queue:'||p_shop_id::text,0));
   if (select count(*) from public.payment_history_jobs where shop_id=p_shop_id and state in ('queued','analysing','review_ready'))>=5 then raise exception using errcode='54000',message='payment_history_job_backpressure';end if;
   insert into public.payment_history_runtime(shop_id) values(p_shop_id) on conflict do nothing;
   insert into public.payment_history_jobs(shop_id,actor_kind,actor_id,actor_session_id,actor_credential_version,request_key,request_digest,parser_version,configuration,source_upload_ids)
    values(p_shop_id,a->>'kind',(a->>'id')::uuid,(a->>'session_id')::uuid,(a->>'credential_version')::integer,v_request,v_digest,'getnet-ooxml-web-v1',p_payload->'configuration',v_ids) returning * into j;
   result:=jsonb_build_object('job_id',j.job_id,'state',j.state);
  end if;
 elsif p_operation in ('status','configure','review','commit','cancel_job','resume_job') then
  select * into j from public.payment_history_jobs where shop_id=p_shop_id and job_id=(p_payload->>'job_id')::uuid for update;
  if not found or j.actor_kind<>a->>'kind' or j.actor_id<>(a->>'id')::uuid or (p_operation<>'resume_job' and (j.actor_session_id<>(a->>'session_id')::uuid
   or j.actor_credential_version is distinct from (a->>'credential_version')::integer)) then raise exception using errcode='42501',message='payment_history_job_actor_mismatch';end if;
  if p_operation='status' then
   result:=jsonb_build_object('job_id',j.job_id,'state',j.state,'processed_rows',j.processed_rows,'summary',j.analysis_summary,'diagnostics',j.diagnostics,'error_code',j.error_code,
    'merchants',j.analysis_merchants);
  elsif p_operation='resume_job' then
   if j.state not in ('queued','analysing','review_ready') then raise exception using errcode='55000',message='payment_history_job_not_resumable';end if;
   update public.payment_history_jobs set actor_session_id=(a->>'session_id')::uuid,actor_credential_version=(a->>'credential_version')::integer,
    state=case when state='analysing' then 'queued' else state end,lease_token=null,lease_expires_at=null,lease_fence=lease_fence+1,review_digest=null,reviewed_at=null where job_id=j.job_id;
   result:=jsonb_build_object('job_id',j.job_id,'state',case when j.state='analysing' then 'queued' else j.state end);
  elsif p_operation='cancel_job' then
   if j.state in ('committing','committed') then raise exception using errcode='55000',message='payment_history_commit_already_started';end if;
   update public.payment_history_jobs set state='cancelled',lease_token=null,lease_expires_at=null,review_digest=null,updated_at=clock_timestamp() where job_id=j.job_id;
   result:=jsonb_build_object('job_id',j.job_id,'state','cancelled');
  elsif p_operation='configure' then
   if j.state<>'review_ready' or jsonb_typeof(p_payload->'evidence_ids') is distinct from 'array' or jsonb_array_length(p_payload->'evidence_ids')>200
    or jsonb_typeof(coalesce(p_payload->'corrections','[]'))<>'array' or jsonb_array_length(coalesce(p_payload->'corrections','[]'))>200 then raise exception using errcode='22023',message='payment_history_review_configuration_invalid';end if;
   v_ids:=array(select jsonb_array_elements_text(p_payload->'evidence_ids')::uuid);
   if cardinality(v_ids)<>(select count(*) from public.payment_history_evidence where shop_id=p_shop_id and evidence_id=any(v_ids) and status='verified') then raise exception using errcode='22023',message='payment_history_evidence_invalid';end if;
   update public.payment_history_jobs set configuration=configuration||jsonb_build_object('evidence_ids',p_payload->'evidence_ids','corrections',coalesce(p_payload->'corrections','[]')),review_digest=null,reviewed_at=null where job_id=j.job_id;
   result:=jsonb_build_object('job_id',j.job_id,'state',j.state);
  else
   if j.state<>'review_ready' then raise exception using errcode='55000',message='payment_history_review_not_ready';end if;
   select * into r from public.payment_history_runtime where shop_id=p_shop_id for update;
   -- Freeze evidence and aliases while the content-bound decision is published.
   perform 1 from public.payment_history_evidence where shop_id=p_shop_id order by evidence_id for share;
   perform 1 from public.payment_history_merchant_aliases where shop_id=p_shop_id and active order by alias_id for share;
   -- demand_actor holds this shop FOR SHARE. Native pos_sales_sync_apply_v1
   -- takes the same shop FOR UPDATE before inserting sales: overlap checking
   -- is serialized per shop, without a global lock on the POS sales table.
   v_review:=app_private.payment_history_review_v1(j.job_id);
   if p_operation='review' then
    update public.payment_history_jobs set reviewed_revision=r.revision,reviewed_writer_epoch=r.writer_epoch,review_digest=v_review->>'review_digest',reviewed_at=clock_timestamp() where job_id=j.job_id;
    result:=v_review;
   else
    if coalesce(v_review->>'can_commit','false')<>'true' or j.review_digest is null or j.review_digest is distinct from p_payload->>'review_digest'
     or j.review_digest is distinct from v_review->>'review_digest' or j.reviewed_revision is distinct from r.revision or j.reviewed_writer_epoch is distinct from r.writer_epoch then raise exception using errcode='40001',message='payment_history_review_stale_or_blocked';end if;
    v_batch:=gen_random_uuid();v_operation:=gen_random_uuid();v_revision:=r.revision+1;
    insert into public.payment_history_batches(batch_id,shop_id,job_id,origin,apply_operation_id,created_revision) values(v_batch,p_shop_id,j.job_id,'web_import',v_operation,v_revision);
    -- One canonical version per identity. Duplicates retain their existing owner.
    insert into public.payment_history_movement_versions(shop_id,merchant_id,external_namespace,external_id,identity_key,economic_digest,business_ticks,business_date,
      gross_clp,commission_clp,commission_vat_clp,net_clp,movement_kind,transaction_state,transaction,owner_batch_id,source_upload_id,source_row,source_sheet,supersedes_version_id,created_revision)
     select p_shop_id,d.merchant_id,s.transaction->>'externalNamespace',s.transaction->>'externalId',d.identity_key,s.economic_digest,(s.economics->>'businessTicks')::bigint,(s.transaction#>>'{timestamp,businessDateTime}')::date,
      (s.economics->>'grossClp')::bigint,(s.economics->>'commissionClp')::bigint,(s.economics->>'commissionVatClp')::bigint,(s.economics->>'netClp')::bigint,s.economics->>'movementKind',s.economics->>'transactionState',s.transaction,v_batch,s.source_upload_id,s.source_row,s.source_sheet,d.previous_version_id,v_revision
     from app_private.payment_history_review_rows_v1(j.job_id) d join public.payment_history_staged_movements s on s.job_id=j.job_id and s.ordinal=d.ordinal where d.decision='new';
    insert into public.payment_history_duplicate_observations(shop_id,batch_id,movement_version_id,source_upload_id,source_sheet,source_row)
     select p_shop_id,v_batch,v.movement_version_id,s.source_upload_id,s.source_sheet,s.source_row
      from app_private.payment_history_review_rows_v1(j.job_id) d join public.payment_history_staged_movements s on s.job_id=j.job_id and s.ordinal=d.ordinal
      join public.payment_history_movement_versions v on v.shop_id=p_shop_id and v.identity_key=d.identity_key and v.active
      where d.decision='duplicate' and not (v.owner_batch_id=v_batch and v.source_upload_id=s.source_upload_id and v.source_sheet=s.source_sheet and v.source_row=s.source_row);
    result:=jsonb_build_object('operation_id',v_operation,'batch_id',v_batch,'kind','apply','dataset_id',r.dataset_id,'revision',v_revision::text,'writer_epoch',r.writer_epoch::text,'summary',v_review->'summary');
    insert into public.payment_history_receipts(operation_id,shop_id,batch_id,operation_kind,actor_kind,actor_id,request_key,request_digest,receipt) values(v_operation,p_shop_id,v_batch,'apply',a->>'kind',(a->>'id')::uuid,v_request,v_digest,result);
    insert into public.payment_history_revisions(shop_id,revision,ordinal,movement_version_id,operation_id,change_kind)
     select p_shop_id,v_revision,row_number() over(order by movement_version_id)::integer,movement_version_id,v_operation,'upsert' from public.payment_history_movement_versions where shop_id=p_shop_id and owner_batch_id=v_batch;
    update public.payment_history_runtime set revision=v_revision,updated_at=clock_timestamp() where shop_id=p_shop_id;
    update public.payment_history_jobs set state='committed',lease_token=null,lease_expires_at=null,updated_at=clock_timestamp() where job_id=j.job_id;
   end if;
  end if;
 elsif p_operation='cancel_batch' then
  select * into r from public.payment_history_runtime where shop_id=p_shop_id for update;
  if not found or r.writer_authority<>'web' or not r.inventory_verified or (p_payload->>'revision')::bigint is distinct from r.revision or (p_payload->>'writer_epoch')::bigint is distinct from r.writer_epoch then raise exception using errcode='40001',message='payment_history_writer_not_ready';end if;
  select * into b from public.payment_history_batches where shop_id=p_shop_id and batch_id=(p_payload->>'batch_id')::uuid for update;
  if not found or b.state<>'active' then raise exception using errcode='55000',message='payment_history_batch_not_active';end if;
  v_operation:=gen_random_uuid();v_revision:=r.revision+1;
  select count(*) into v_count from public.payment_history_movement_versions where shop_id=p_shop_id and owner_batch_id=b.batch_id and active;
  result:=jsonb_build_object('operation_id',v_operation,'batch_id',b.batch_id,'kind','cancel','dataset_id',r.dataset_id,'revision',v_revision::text,'writer_epoch',r.writer_epoch::text,'deactivated',v_count);
  insert into public.payment_history_receipts(operation_id,shop_id,batch_id,operation_kind,actor_kind,actor_id,request_key,request_digest,receipt) values(v_operation,p_shop_id,b.batch_id,'cancel',a->>'kind',(a->>'id')::uuid,v_request,v_digest,result);
  insert into public.payment_history_revisions(shop_id,revision,ordinal,movement_version_id,operation_id,change_kind)
   select p_shop_id,v_revision,row_number() over(order by movement_version_id)::integer,movement_version_id,v_operation,'tombstone' from public.payment_history_movement_versions where shop_id=p_shop_id and owner_batch_id=b.batch_id and active;
  update public.payment_history_movement_versions set active=false where shop_id=p_shop_id and owner_batch_id=b.batch_id and active;
  update public.payment_history_batches set state='cancelled',cancelled_revision=v_revision,cancelled_at=clock_timestamp() where batch_id=b.batch_id;
  update public.payment_history_runtime set revision=v_revision,updated_at=clock_timestamp() where shop_id=p_shop_id;
 elsif p_operation in ('read','export') then
  v_count:=coalesce((p_payload->>'limit')::integer,50);
  if v_count not between 1 and 200 then raise exception using errcode='22023',message='payment_history_page_limit';end if;
  select * into r from public.payment_history_runtime where shop_id=p_shop_id;
  if p_payload ? 'revision' and (p_payload->>'revision')::bigint is distinct from r.revision then raise exception using errcode='40001',message='payment_history_revision_changed';end if;
  result:=jsonb_build_object('configured',found,'coverage','observed_records_only','dataset_id',r.dataset_id,'revision',r.revision::text,'writer_epoch',r.writer_epoch::text,'writer_authority',r.writer_authority,
   'rows',(select coalesce(jsonb_agg(x order by x.movement_version_id),'[]') from(select movement_version_id,merchant_id,owner_batch_id,active,business_ticks::text,gross_clp::text,commission_clp::text,commission_vat_clp::text,net_clp::text,movement_kind,transaction_state,created_revision::text from public.payment_history_movement_versions
    where shop_id=p_shop_id and movement_version_id>coalesce((p_payload->>'after')::uuid,'00000000-0000-0000-0000-000000000000') order by movement_version_id limit v_count)x),
   'batches',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]') from(select batch_id,origin,state,created_revision::text,cancelled_revision::text,created_at from public.payment_history_batches where shop_id=p_shop_id order by created_at desc limit 50)x));
 elsif p_operation='receipt' then
  select * into receipt from public.payment_history_receipts where shop_id=p_shop_id and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid and request_key=(p_payload->>'request_key')::uuid;
  result:=jsonb_build_object('receipt',case when found then receipt.receipt else null end);
 else
  -- Legal role-grant management remains owner-only. Provider qualification and
  -- transfer/cutover are operational actions guarded by the separate migrate
  -- capability, never by a displayed badge or staff code.
  if p_operation='permissions' and (a->>'kind'<>'personal_account' or not exists(select 1 from public.shop_members where shop_id=p_shop_id and profile_id=(a->>'id')::uuid and role_key='shop_owner' and membership_status='active')) then raise exception using errcode='42501',message='payment_history_owner_required';end if;
  if p_operation='evidence' and (p_payload->>'kind'='modern_time' or p_payload->>'level'='provider_verified' or p_payload->>'action'='revoke') then
   perform app_private.payment_history_demand_actor_v1(p_shop_id,'migrate',p_staff_id,p_staff_web_session_id,p_session_token_hash,p_credential_version);
   if p_payload->>'action' is distinct from 'revoke' and (p_payload->>'document_upload_id' is null or p_payload->>'document_sha256' is null) then raise exception using errcode='22023',message='payment_history_provider_document_required';end if;
  end if;
  if p_operation in ('evidence','merchant') then
   insert into public.payment_history_runtime(shop_id) values(p_shop_id) on conflict do nothing;
   select * into r from public.payment_history_runtime where shop_id=p_shop_id for update;
  end if;
  if p_operation='permissions' then
   if coalesce(p_payload->>'role','') not in ('shop_manager','manager','pos_admin') or coalesce(p_payload->>'capability','') not in ('read','import','cancel','export','migrate') or jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then raise exception using errcode='22023',message='payment_history_permission_invalid';end if;
   perform pg_advisory_xact_lock(hashtextextended('payment-history-role:'||p_shop_id::text||':'||(p_payload->>'role'),0));
   insert into public.payment_history_role_permissions(shop_id,role_key,capability,enabled) values(p_shop_id,p_payload->>'role',p_payload->>'capability',(p_payload->>'enabled')::boolean)
    on conflict(shop_id,role_key,capability) do update set enabled=excluded.enabled,updated_at=clock_timestamp();result:=jsonb_build_object('saved',true);
  elsif p_operation='evidence' then
   if p_payload->>'action'='revoke' then
    update public.payment_history_evidence set status='revoked',revoked_at=clock_timestamp() where shop_id=p_shop_id and evidence_id=(p_payload->>'evidence_id')::uuid and status<>'revoked' returning * into e;
    if not found then raise exception using errcode='22023',message='payment_history_evidence_not_found';end if;
   else
    if coalesce(p_payload->>'kind','') not in ('merchant_mapping','legacy_currency','native_start','modern_time','economic_correction')
     or jsonb_typeof(p_payload->'scope') is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_payload->'scope') k where k not in ('merchant_id','alias_key','file_sha256','from_ticks','to_ticks','native_start_ticks','interpretation'))
     or jsonb_typeof(p_payload#>'{scope,file_sha256}') is distinct from 'array' or jsonb_array_length(p_payload#>'{scope,file_sha256}') not between 1 and 10
     or exists(select 1 from jsonb_array_elements_text(p_payload#>'{scope,file_sha256}') h where h !~ '^[0-9a-f]{64}$')
     or coalesce(p_payload#>>'{scope,from_ticks}','') !~ '^[0-9]{1,19}$' or coalesce(p_payload#>>'{scope,to_ticks}','') !~ '^[0-9]{1,19}$'
     or (p_payload#>>'{scope,from_ticks}')::bigint>=(p_payload#>>'{scope,to_ticks}')::bigint then raise exception using errcode='22023',message='payment_history_evidence_scope_invalid';end if;
    if p_payload->>'level'='provider_verified' then
     select * into u from public.payment_history_uploads where shop_id=p_shop_id and upload_id=(p_payload->>'document_upload_id')::uuid and state='verified' and file_name ~* '\.(pdf|png|jpg|jpeg)$' for share;
     if not found or u.file_sha256 is distinct from p_payload->>'document_sha256' then raise exception using errcode='22023',message='payment_history_provider_document_required';end if;
    end if;
    if p_payload->>'kind'='modern_time' and p_payload->>'level' is distinct from 'provider_verified' then raise exception using errcode='22023',message='payment_history_provider_document_required';end if;
    insert into public.payment_history_evidence(shop_id,kind,verification_level,status,policy_version,reference,document_sha256,document_upload_id,scope,actor_kind,actor_id,verified_at)
     values(p_shop_id,p_payload->>'kind',p_payload->>'level','verified',p_payload->>'version',p_payload->>'reference',p_payload->>'document_sha256',(p_payload->>'document_upload_id')::uuid,p_payload->'scope',a->>'kind',(a->>'id')::uuid,clock_timestamp()) returning * into e;
   end if;
   v_id:=e.evidence_id;result:=jsonb_build_object('evidence_id',e.evidence_id,'status',e.status);
  elsif p_operation='merchant' then
   select * into e from public.payment_history_evidence where shop_id=p_shop_id and evidence_id=(p_payload->>'evidence_id')::uuid and kind='merchant_mapping' and status='verified' and verification_level<>'unverified' for share;
   if not found then raise exception using errcode='22023',message='payment_history_merchant_evidence_required';end if;
   v_id:=coalesce((p_payload->>'merchant_id')::uuid,gen_random_uuid());
   if not exists(select 1 from public.payment_history_merchants where shop_id=p_shop_id and merchant_id=v_id) then
    insert into public.payment_history_merchants(merchant_id,shop_id,label,evidence_id) values(v_id,p_shop_id,p_payload->>'label',e.evidence_id);
   end if;
   if e.scope->>'merchant_id' is distinct from v_id::text then raise exception using errcode='22023',message='payment_history_merchant_evidence_scope';end if;
   v_digest:=app_private.payment_history_field_hash_v1(array['getnet-merchant-alias-v1',p_payload#>>'{source_identity,local}',p_payload#>>'{source_identity,seller}',p_payload#>>'{source_identity,sellerId}',p_payload#>>'{source_identity,localNumber}',p_payload#>>'{source_identity,rut}']);
   if e.scope->>'alias_key' is distinct from v_digest then raise exception using errcode='22023',message='payment_history_merchant_evidence_scope';end if;
   if exists(select 1 from public.payment_history_merchant_aliases where shop_id=p_shop_id and alias_key=v_digest and active and merchant_id<>v_id) then raise exception using errcode='23505',message='payment_history_alias_collision';end if;
   update public.payment_history_merchant_aliases set active=false where shop_id=p_shop_id and alias_key=v_digest and active and merchant_id=v_id and evidence_id<>e.evidence_id;
   insert into public.payment_history_merchant_aliases(shop_id,merchant_id,alias_key,source_identity,evidence_id) values(p_shop_id,v_id,v_digest,p_payload->'source_identity',e.evidence_id)
    on conflict(shop_id,alias_version,alias_key) where active do nothing;
   result:=jsonb_build_object('merchant_id',v_id,'alias_key',v_digest);
  else raise exception using errcode='22023',message='payment_history_operation_invalid';end if;
 end if;
 if v_revision is not null then perform app_private.payment_history_seal_revision_v1(p_shop_id,v_revision);end if;
 if p_operation not in ('read','export','capabilities','status','receipt','metadata','upload_status') then
  insert into public.payment_history_events(shop_id,actor_kind,actor_id,operation,subject_id) values(p_shop_id,a->>'kind',(a->>'id')::uuid,p_operation,coalesce(v_id,j.job_id,b.batch_id));
 end if;
 if not app_private.payment_history_publishable_v1() then raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 if octet_length(result::text)>4194304 then raise exception using errcode='54000',message='payment_history_response_limit';end if;
 return jsonb_build_object('ok',true,'shop_id',p_shop_id,'actor',a,'result',result);
end;$$;
