-- Follow-up to immutable C3-C5 migration a943f661433e4b67db8924ee35277c4d75ecb2edd54442add0ad24b6ec49ffe9.
-- Financial preview totals and named, lease-scoped physical-device labels.

create or replace function app_private.payment_history_migration_review_v1(p_run uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
 with decisions as materialized(select * from app_private.payment_history_migration_review_rows_v1(p_run)),
 facts as(select count(*) total,count(*) filter(where decision='new_active') new_active,count(*) filter(where decision='new_inactive') new_inactive,
  count(*) filter(where decision in ('duplicate','duplicate_incoming')) duplicates,count(*) filter(where decision='conflict') conflicts,count(*) filter(where d.decision='blocked') blocked,
  coalesce(sum((m.economics->>'grossClp')::numeric) filter(where d.decision='new_active'),0)::bigint::text new_active_gross_clp,
  coalesce(sum((m.economics->>'netClp')::numeric) filter(where d.decision='new_active'),0)::bigint::text known_new_active_net_clp,
  count(*) filter(where d.decision='new_active' and m.economics->>'netClp' is not null) known_new_active_net_count
  from decisions d join public.payment_history_migration_movements m on m.run_id=p_run and m.local_id=d.local_id),
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

create function public.payment_history_transfer_details_v1(p_shop_id uuid,p_operation text,p_payload jsonb default '{}',p_staff_id uuid default null,p_staff_web_session_id uuid default null,p_session_token_hash text default null,p_credential_version integer default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare a jsonb;result jsonb;begin
 if p_operation is distinct from 'devices' or p_payload is distinct from '{}'::jsonb then raise exception using errcode='22023',message='payment_history_operation_invalid';end if;
 a:=app_private.payment_history_demand_actor_v1(p_shop_id,'migrate',p_staff_id,p_staff_web_session_id,p_session_token_hash,p_credential_version);
 result:=jsonb_build_object('devices',(select coalesce(jsonb_agg(jsonb_build_object('device_id',d.shop_device_id,'name',d.display_name,'status',d.status,'revoked',d.revoked_at is not null) order by d.display_name,d.shop_device_id),'[]')
  from public.shop_devices d where d.shop_id=p_shop_id and (d.device_type='pos' or exists(select 1 from public.pos_device_credentials c where c.shop_device_id=d.shop_device_id))));
 if octet_length(result::text)>1048576 then raise exception using errcode='54000',message='payment_history_response_limit';end if;
 if not app_private.payment_history_publishable_v1() then raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 return jsonb_build_object('ok',true,'shop_id',p_shop_id,'actor',a,'result',result);
end;$$;
revoke all on function public.payment_history_transfer_details_v1(uuid,text,jsonb,uuid,uuid,text,integer) from public,anon;
grant execute on function public.payment_history_transfer_details_v1(uuid,text,jsonb,uuid,uuid,text,integer) to authenticated,service_role;
