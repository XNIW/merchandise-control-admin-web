-- Resolve correction ownership from admitted provenance. Never interpret a
-- device-local numeric movement ID as a shop-global version identifier.
-- Private until the complete v2 authorization/delivery boundary is installed.
create function app_private.payment_history_local_correction_target_v2(p_operation uuid,p_fields jsonb,p_identity text) returns uuid
language plpgsql volatile set search_path='' as $$
declare p public.payment_history_local_publications;c public.payment_history_local_writer_contexts;
 previous public.payment_history_local_publications;target uuid;begin
 perform app_private.payment_history_local_page_v2(jsonb_build_array(jsonb_build_object('kind','correction','fields',p_fields))::text);
 if coalesce(p_identity,'') !~ '^[0-9a-f]{64}$' or coalesce(p_fields->>'previous_economic_digest','') !~ '^[0-9a-f]{64}$' then
  raise exception using errcode='22023',message='payment_history_local_correction_owner_invalid';end if;
 select * into p from public.payment_history_local_publications where operation_id=p_operation for share;
 if not found or p.operation_kind<>'Apply' or p.state<>'preparing' then raise exception using errcode='40001',message='payment_history_local_preparation_stale';end if;
 select * into c from public.payment_history_local_writer_contexts where shop_id=p.shop_id and shop_device_id=p.shop_device_id for share;
 if not found or row(c.local_dataset_id,c.restore_lineage_id,c.restore_epoch) is distinct from row(p.local_dataset_id,p.restore_lineage_id,p.restore_epoch)
  or c.source_snapshot_id is null then raise exception using errcode='40001',message='payment_history_local_context_unverified';end if;
 select * into previous from public.payment_history_local_publications
  where operation_id=(p_fields->>'previous_apply_operation_id')::uuid and shop_id=p.shop_id and shop_device_id=p.shop_device_id
   and local_dataset_id=p.local_dataset_id and restore_lineage_id=p.restore_lineage_id and restore_epoch=p.restore_epoch
   and local_batch_id=p_fields->>'previous_local_batch_id' and operation_kind='Apply' and state='committed' and grant_id is not null for share;
 if found then
  -- An incremental receipt owns only versions inserted by this Apply. A
  -- duplicate observation cannot acquire another batch's correction rights.
  select v.movement_version_id into target from public.payment_history_local_publication_map m
   join public.payment_history_movement_versions v on v.shop_id=m.shop_id and v.movement_version_id=m.movement_version_id
   join public.payment_history_batches b on b.shop_id=v.shop_id and b.batch_id=v.owner_batch_id
   where m.shop_id=p.shop_id and m.operation_id=previous.operation_id and m.owned and v.active and b.state='active'
    and b.batch_id=(previous.server_receipt->>'batch_id')::uuid and v.identity_key=p_identity and v.economic_digest=p_fields->>'previous_economic_digest'
   for share of v,b;
 else
  -- A baseline mapping is accepted only through this context's verified,
  -- applied archive, the immutable source batch/Apply and its exact row map.
  select v.movement_version_id into target from public.payment_history_source_snapshots s
   join public.payment_history_migration_runs run on run.shop_id=s.shop_id and run.run_id=s.run_id and run.state='applied'
   join public.payment_history_uploads u on u.shop_id=run.shop_id and u.upload_id=run.source_upload_id and u.state='verified' and u.file_sha256=s.archive_sha256
   join public.payment_history_source_objects o on o.shop_id=s.shop_id and o.source_snapshot_id=s.snapshot_id and o.table_name='batches' and o.local_id=p_fields->>'previous_local_batch_id'
   join public.payment_history_local_batch_map bm on bm.shop_id=p.shop_id and bm.shop_device_id=p.shop_device_id and bm.local_dataset_id=p.local_dataset_id
    and bm.local_batch_id=o.local_id and bm.source_object_digest=o.object_digest
   join public.payment_history_local_movement_map mm on mm.shop_id=bm.shop_id and mm.shop_device_id=bm.shop_device_id and mm.local_dataset_id=bm.local_dataset_id
    and mm.local_movement_id=p_fields->>'previous_transaction_id' and mm.owns_version
   join public.payment_history_movement_versions v on v.shop_id=mm.shop_id and v.movement_version_id=mm.movement_version_id and v.owner_batch_id=bm.batch_id
   join public.payment_history_batches b on b.shop_id=v.shop_id and b.batch_id=v.owner_batch_id
   where s.shop_id=p.shop_id and s.snapshot_id=c.source_snapshot_id and s.shop_device_id=p.shop_device_id and s.local_dataset_id=p.local_dataset_id and s.restore_epoch=p.restore_epoch
    and (o.original_object->>'apply_operation_id')::uuid=(p_fields->>'previous_apply_operation_id')::uuid
    and v.active and b.state='active' and v.identity_key=p_identity and v.economic_digest=p_fields->>'previous_economic_digest'
    and mm.source_economic_digest=v.economic_digest for share of s,run,u,o,bm,mm,v,b;
 end if;
 if target is null then raise exception using errcode='40001',message='payment_history_local_correction_owner_unverified';end if;
 return target;
end;$$;
revoke all on function app_private.payment_history_local_correction_target_v2(uuid,jsonb,text) from public,anon,authenticated,service_role;
