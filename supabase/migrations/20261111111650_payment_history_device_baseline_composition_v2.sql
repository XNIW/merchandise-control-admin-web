-- Private composition only. Device/public v2 remains unconnected until its
-- complete client, worker and authenticated E2E qualification is available.
create function app_private.payment_history_local_baseline_context_v2(p_shop uuid,p_device uuid,p_staff uuid,p_session uuid,
 p_device_hash text,p_session_hash text,p_version integer,p_payload jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare r public.payment_history_runtime;c public.payment_history_local_writer_contexts;s public.payment_history_source_snapshots;
 k text;verified boolean:=false;begin
 perform app_private.payment_history_local_device_actor_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,'read');
 if not app_private.payment_history_local_keys_v2(p_payload,array['local_dataset_id','data_revision','restore_epoch','restore_lineage_id'])
  or jsonb_typeof(p_payload->'local_dataset_id') is distinct from 'string' or length(coalesce(p_payload->>'local_dataset_id','')) not between 1 and 256
  or jsonb_typeof(p_payload->'restore_lineage_id') is distinct from 'string'
  or coalesce(p_payload->>'restore_lineage_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or p_payload->>'restore_lineage_id'='00000000-0000-0000-0000-000000000000' then
  raise exception using errcode='22023',message='payment_history_local_baseline_invalid';end if;
 foreach k in array array['data_revision','restore_epoch'] loop
  if jsonb_typeof(p_payload->k) is distinct from 'string' or coalesce(p_payload->>k,'') !~ '^(0|[1-9][0-9]{0,18})$'
   or (p_payload->>k)::numeric>9223372036854775807 then
   raise exception using errcode='22023',message='payment_history_local_baseline_invalid';end if;
 end loop;
 select * into r from public.payment_history_runtime where shop_id=p_shop for share;
 if not found then raise exception using errcode='40001',message='payment_history_local_writer_closed';end if;
 select * into c from public.payment_history_local_writer_contexts where shop_id=p_shop and shop_device_id=p_device for share;
 if found then
  if c.restore_epoch>(p_payload->>'restore_epoch')::bigint
   or (c.restore_epoch=(p_payload->>'restore_epoch')::bigint and row(c.local_dataset_id,c.restore_lineage_id)
    is distinct from row(p_payload->>'local_dataset_id',(p_payload->>'restore_lineage_id')::uuid))
   or (row(c.local_dataset_id,c.restore_lineage_id,c.restore_epoch) is not distinct from
    row(p_payload->>'local_dataset_id',(p_payload->>'restore_lineage_id')::uuid,(p_payload->>'restore_epoch')::bigint)
    and c.local_revision>(p_payload->>'data_revision')::bigint) then
   raise exception using errcode='40001',message='payment_history_local_witness_context_changed';end if;
  if row(c.local_dataset_id,c.restore_lineage_id,c.restore_epoch) is not distinct from
   row(p_payload->>'local_dataset_id',(p_payload->>'restore_lineage_id')::uuid,(p_payload->>'restore_epoch')::bigint) then
   select snapshot.* into s from public.payment_history_source_snapshots snapshot
    join public.payment_history_migration_runs j on j.shop_id=snapshot.shop_id and j.run_id=snapshot.run_id
    join public.payment_history_uploads u on u.shop_id=j.shop_id and u.upload_id=j.source_upload_id
   where snapshot.shop_id=p_shop and snapshot.snapshot_id=c.source_snapshot_id and snapshot.shop_device_id=p_device
    and snapshot.local_dataset_id=c.local_dataset_id and snapshot.restore_epoch=c.restore_epoch
    and snapshot.source_manifest->>'restoreLineageId'=c.restore_lineage_id::text and snapshot.data_revision<=c.local_revision
    and snapshot.created_revision<=r.revision and j.state='applied' and j.source_mode='local_baseline_v2'
    and u.state='verified' and u.file_sha256=snapshot.archive_sha256;
   verified:=found;
   if not verified then raise exception using errcode='40001',message='payment_history_local_context_unverified';end if;
  end if;
 end if;
 if not app_private.payment_history_publishable_v1() or not app_private.pos_runtime_lease_is_valid_v1(p_shop,p_device,p_staff,p_session) then
  raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 return jsonb_build_object('state',case when verified then 'verified' else 'missing' end,'dataset_id',r.dataset_id,
  'writer_epoch',r.writer_epoch::text,'writer_authority',r.writer_authority,'source_snapshot_id',case when verified then s.snapshot_id end,
  'baseline_revision',case when verified then s.data_revision::text end,'canonical_revision',case when verified then s.created_revision::text end,
  'can_prepare',r.writer_authority='local' and app_private.payment_history_staff_can_v1(p_shop,p_staff,'migrate'));
end;$$;
revoke all on function app_private.payment_history_local_baseline_context_v2(uuid,uuid,uuid,uuid,text,text,integer,jsonb) from public,anon,authenticated,service_role;

-- Carry forward the operator's already applied local scope/binding evidence.
-- This never upgrades it to provider_verified and never remaps an existing alias.
-- Ambiguous old groups require explicit reconciliation rather than guessing.
create function app_private.payment_history_local_baseline_aliases_v2(p_run uuid,p_actor jsonb) returns void
language plpgsql volatile set search_path='' as $$
declare j public.payment_history_migration_runs;r public.payment_history_runtime;u public.payment_history_uploads;
 scope_row record;binding record;canonical uuid;proof uuid;existing_count integer;merchant_label text;begin
 select * into j from public.payment_history_migration_runs where run_id=p_run for update;
 if not found or j.source_mode<>'local_baseline_v2' or j.state<>'review_ready' or j.actor_kind<>'pos_staff_manager'
  or j.actor_id::text is distinct from p_actor->>'id' or j.actor_session_id::text is distinct from p_actor->>'session_id'
  or j.actor_credential_version::text is distinct from p_actor->>'credential_version' then
  raise exception using errcode='42501',message='payment_history_job_actor_mismatch';end if;
 select * into r from public.payment_history_runtime where shop_id=j.shop_id for update;
 select * into u from public.payment_history_uploads where shop_id=j.shop_id and upload_id=j.source_upload_id for share;
 if r.writer_authority<>'local' or r.writer_epoch::text is distinct from j.source_context->>'writer_epoch'
  or u.state is distinct from 'verified' or j.manifest->>'schemaVersion' is distinct from 'history-local-export-v2'
  or j.manifest->>'evidenceLevel' is distinct from 'legacy_attested' or j.manifest is null
  or exists(select 1 from public.payment_history_local_publications p where p.shop_id=j.shop_id
    and p.shop_device_id=(j.source_context->>'device_id')::uuid and p.state in('preparing','authorized','reconcile_required')) then
  raise exception using errcode='40001',message='payment_history_local_baseline_outcome_unknown';end if;
 if exists(select 1 from public.payment_history_migration_movements m where m.run_id=j.run_id
   group by m.alias_key having count(distinct m.local_scope_id)>1) then
  raise exception using errcode='40001',message='payment_history_local_baseline_alias_conflict';end if;
 for scope_row in select o.local_id,o.object from public.payment_history_migration_objects o
  where o.run_id=j.run_id and o.table_name='scopes' and exists(select 1 from public.payment_history_migration_movements m
   where m.run_id=j.run_id and m.local_scope_id=o.local_id) order by o.local_id loop
  if length(coalesce(scope_row.object->>'evidence_reference','')) not between 1 and 2048 then
   raise exception using errcode='22023',message='payment_history_merchant_evidence_required';end if;
  select count(distinct a.merchant_id),min(a.merchant_id::text)::uuid into existing_count,canonical
   from public.payment_history_migration_movements m join public.payment_history_merchant_aliases a
    on a.shop_id=m.shop_id and a.alias_key=m.alias_key and a.active
   where m.run_id=j.run_id and m.local_scope_id=scope_row.local_id;
  if existing_count>1 then raise exception using errcode='40001',message='payment_history_local_baseline_alias_conflict';end if;
  if canonical is null then
   canonical:=gen_random_uuid();
   insert into public.payment_history_evidence(shop_id,kind,verification_level,status,policy_version,reference,scope,actor_kind,actor_id,verified_at)
    values(j.shop_id,'migration_reconcile','operator_attested','verified','history-local-baseline-v2',scope_row.object->>'evidence_reference',
     jsonb_build_object('run_id',j.run_id,'local_scope_id',scope_row.local_id,'merchant_id',canonical,'archive_sha256',u.file_sha256,'source_level','legacy_attested'),
     'pos_staff_manager',j.actor_id,clock_timestamp()) returning evidence_id into proof;
   select left(coalesce(nullif(btrim(m.transaction#>>'{merchant,seller}'),''),nullif(btrim(m.transaction#>>'{merchant,local}'),''),'Getnet'),256)
    into merchant_label from public.payment_history_migration_movements m where m.run_id=j.run_id and m.local_scope_id=scope_row.local_id order by m.local_id::bigint limit 1;
   insert into public.payment_history_merchants(merchant_id,shop_id,label,evidence_id) values(canonical,j.shop_id,merchant_label,proof);
  end if;
  for binding in select distinct o.object->>'alias_key' alias_key,o.object->>'evidence_reference' reference
   from public.payment_history_migration_objects o where o.run_id=j.run_id and o.table_name='bindings'
    and o.object->>'scope_id'=scope_row.local_id and exists(select 1 from public.payment_history_migration_movements m
     where m.run_id=j.run_id and m.local_scope_id=scope_row.local_id and m.alias_key=o.object->>'alias_key') order by 1 loop
   if length(coalesce(binding.reference,'')) not between 1 and 2048 then
    raise exception using errcode='22023',message='payment_history_merchant_evidence_required';end if;
   if not exists(select 1 from public.payment_history_merchant_aliases a where a.shop_id=j.shop_id and a.alias_key=binding.alias_key and a.active) then
    insert into public.payment_history_evidence(shop_id,kind,verification_level,status,policy_version,reference,scope,actor_kind,actor_id,verified_at)
     values(j.shop_id,'merchant_mapping','operator_attested','verified','history-local-baseline-v2',binding.reference,
      jsonb_build_object('run_id',j.run_id,'local_scope_id',scope_row.local_id,'merchant_id',canonical,'alias_key',binding.alias_key,
       'archive_sha256',u.file_sha256,'source_level','legacy_attested'), 'pos_staff_manager',j.actor_id,clock_timestamp()) returning evidence_id into proof;
    insert into public.payment_history_merchant_aliases(shop_id,merchant_id,alias_key,source_identity,evidence_id)
     values(j.shop_id,canonical,binding.alias_key,jsonb_build_object('legacyAliasHash',binding.alias_key,'sourceArchiveSha256',u.file_sha256),proof);
   end if;
  end loop;
 end loop;
end;$$;
revoke all on function app_private.payment_history_local_baseline_aliases_v2(uuid,jsonb) from public,anon,authenticated,service_role;

create function app_private.payment_history_local_baseline_flow_v2(p_shop uuid,p_device uuid,p_staff uuid,p_session uuid,
 p_device_hash text,p_session_hash text,p_version integer,p_operation text,p_payload jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare actor jsonb;begin
 if p_operation='context' then
  return app_private.payment_history_local_baseline_context_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,p_payload);
 end if;
 if p_operation='review' then
  actor:=app_private.payment_history_local_device_actor_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,'migrate');
  if not app_private.payment_history_local_keys_v2(p_payload,array['run_id']) then
   raise exception using errcode='22023',message='payment_history_operation_invalid';end if;
  perform 1 from public.payment_history_migration_runs j where j.shop_id=p_shop and j.run_id=(p_payload->>'run_id')::uuid
   and j.source_mode='local_baseline_v2' and j.source_context->>'device_id'=p_device::text;
  if not found then raise exception using errcode='42501',message='payment_history_job_actor_mismatch';end if;
  perform app_private.payment_history_local_baseline_aliases_v2((p_payload->>'run_id')::uuid,actor);
 end if;
 return app_private.payment_history_local_baseline_request_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,p_operation,p_payload);
end;$$;
revoke all on function app_private.payment_history_local_baseline_flow_v2(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb) from public,anon,authenticated,service_role;
