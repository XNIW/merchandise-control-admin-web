-- Preserve canonical inactive facts during frozen archive reconciliation.
-- Scope/proof guards and active/baseline classification remain unchanged.
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
 classified as(select b.local_id,b.canonical_merchant,b.global_key,coalesce(mapped.movement_version_id,case when inactive.matches=1 then inactive.version_id end,active.movement_version_id) existing_id,
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
   when inactive.matches=1 then 'history_migration_duplicate'
   when inactive.matches>1 then 'history_migration_inactive_identity_review_required'
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
  -- Frozen v2 exports can contain an already published and undone version
  -- without a legacy local_movement_map entry. Reuse only one exact inactive
  -- canonical fact in the same shop. Two matches require operator review.
  left join lateral (
   select count(*) matches,(array_agg(candidate.movement_version_id))[1] version_id
   from (select v.movement_version_id from public.payment_history_movement_versions v
    where b.source_mode='frozen_archive_v1' and not b.active
     and v.shop_id=b.shop_id and v.identity_key=b.global_key and not v.active
     and v.economic_digest=b.economic_digest
     and not app_private.payment_history_conflict_v1(b.economics,app_private.payment_history_economics_v1(v.transaction))
    limit 2) candidate
  ) inactive on true
  join public.payment_history_migration_objects batch_object on batch_object.run_id=b.run_id and batch_object.table_name='batches' and batch_object.local_id=b.local_batch_id
  left join public.payment_history_local_batch_map batch_map on batch_map.shop_id=b.shop_id and batch_map.shop_device_id=(b.manifest->>'deviceId')::uuid and batch_map.local_dataset_id=b.manifest->>'localDatasetId' and batch_map.local_batch_id=b.local_batch_id
 ) select c.local_id,c.canonical_merchant,c.global_key,c.existing_id,
  case c.reason when 'history_migration_new_active' then 'new_active' when 'history_migration_new_inactive' then 'new_inactive' when 'history_migration_duplicate' then 'duplicate' when 'history_migration_duplicate_incoming' then 'duplicate_incoming'
   when 'history_active_economics_conflict' then 'conflict' when 'history_migration_source_identity_changed' then 'conflict' else 'blocked' end,c.reason from classified c;
$$;
revoke all on function app_private.payment_history_migration_review_rows_v1(uuid) from public,anon,authenticated,service_role;
