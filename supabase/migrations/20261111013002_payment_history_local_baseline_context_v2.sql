-- Bind an existing, fully applied v2 source snapshot to a local writer.
-- Private: authentication, baseline admission/upload and delivery must be
-- completed together before any device RPC can invoke this helper.
create function app_private.payment_history_bind_local_baseline_v2(
 p_shop uuid,p_device uuid,p_snapshot uuid,p_dataset text,p_revision bigint,
 p_restore_epoch bigint,p_restore_lineage uuid,p_writer_epoch bigint) returns jsonb
language plpgsql volatile set search_path='' as $$
declare r public.payment_history_runtime;s public.payment_history_source_snapshots;
 j public.payment_history_migration_runs;u public.payment_history_uploads;
 c public.payment_history_local_writer_contexts;begin
 if p_shop is null or p_device is null or p_snapshot is null or p_restore_lineage is null
  or p_dataset is null or length(p_dataset) not between 1 and 256 or p_revision is null or p_revision<0
  or p_restore_epoch is null or p_restore_epoch<0 or p_writer_epoch is null or p_writer_epoch<1 then
  raise exception using errcode='22023',message='payment_history_local_baseline_invalid';end if;
 -- Same lock order as admission/cutover, then a device-specific context lock.
 select * into r from public.payment_history_runtime where shop_id=p_shop for share;
 if not found or r.writer_authority<>'local' or r.writer_epoch<>p_writer_epoch then
  raise exception using errcode='40001',message='payment_history_local_writer_closed';end if;
 perform 1 from public.shop_devices where shop_id=p_shop and shop_device_id=p_device and status='active' for share;
 if not found then raise exception using errcode='42501',message='payment_history_local_baseline_device_denied';end if;
 perform pg_advisory_xact_lock(hashtextextended('history-local-prepare:'||p_shop::text||':'||p_device::text,0));
 select * into s from public.payment_history_source_snapshots where shop_id=p_shop and snapshot_id=p_snapshot for share;
 if not found or row(s.shop_device_id,s.local_dataset_id,s.data_revision,s.restore_epoch)
  is distinct from row(p_device,p_dataset,p_revision,p_restore_epoch) or s.created_revision>r.revision
  or s.source_manifest->>'schemaVersion' is distinct from 'history-local-export-v2'
  or s.source_manifest->>'shopId' is distinct from p_shop::text or s.source_manifest->>'deviceId' is distinct from p_device::text
  or s.source_manifest->>'localDatasetId' is distinct from p_dataset or s.source_manifest->>'dataRevision' is distinct from p_revision::text
  or s.source_manifest->>'restoreEpoch' is distinct from p_restore_epoch::text
  or s.source_manifest->>'restoreLineageId' is distinct from p_restore_lineage::text
  or s.source_manifest->>'backupSha256' is distinct from s.backup_sha256
  or s.source_manifest->>'evidenceLevel' is distinct from 'legacy_attested' then
  raise exception using errcode='40001',message='payment_history_local_baseline_unverified';end if;
 select * into j from public.payment_history_migration_runs where shop_id=p_shop and run_id=s.run_id for share;
 if not found or j.state<>'applied' or j.manifest is distinct from s.source_manifest or j.summary is distinct from s.source_summary
  or j.receipt->>'source_snapshot_id' is distinct from p_snapshot::text then
  raise exception using errcode='40001',message='payment_history_local_baseline_unverified';end if;
 select * into u from public.payment_history_uploads where shop_id=p_shop and upload_id=j.source_upload_id for share;
 if not found or u.state<>'verified' or u.file_sha256<>s.archive_sha256 then
  raise exception using errcode='40001',message='payment_history_local_baseline_unverified';end if;
 select * into c from public.payment_history_local_writer_contexts where shop_id=p_shop and shop_device_id=p_device for update;
 if found then
  if row(c.source_snapshot_id,c.local_dataset_id,c.local_revision,c.restore_epoch,c.restore_lineage_id)
   is distinct from row(p_snapshot,p_dataset,p_revision,p_restore_epoch,p_restore_lineage) then
   raise exception using errcode='40001',message='payment_history_local_context_reconciliation_required';end if;
 else
  -- Expiry is not proof that a local transaction did not commit. v1 grants
  -- lack a durable outcome; never adopt a baseline by discarding them on TTL.
  if exists(select 1 from public.payment_history_local_write_grants where shop_id=p_shop and shop_device_id=p_device)
   or exists(select 1 from public.payment_history_local_publications where shop_id=p_shop and shop_device_id=p_device
    and (grant_id is not null and state not in('committed','aborted') or state='preparing')) then
   raise exception using errcode='40001',message='payment_history_local_baseline_outcome_unknown';end if;
  insert into public.payment_history_local_writer_contexts(shop_id,shop_device_id,local_dataset_id,restore_lineage_id,restore_epoch,local_revision,source_snapshot_id,evidence_reference)
   values(p_shop,p_device,p_dataset,p_restore_lineage,p_restore_epoch,p_revision,p_snapshot,'verified local baseline '||p_snapshot::text);
 end if;
 return jsonb_build_object('state','baseline_verified','source_snapshot_id',p_snapshot,'local_dataset_id',p_dataset,
  'local_revision',p_revision::text,'restore_epoch',p_restore_epoch::text,'restore_lineage_id',p_restore_lineage,'writer_epoch',r.writer_epoch::text);
end;$$;
revoke all on function app_private.payment_history_bind_local_baseline_v2(uuid,uuid,uuid,text,bigint,bigint,uuid,bigint)
 from public,anon,authenticated,service_role;
