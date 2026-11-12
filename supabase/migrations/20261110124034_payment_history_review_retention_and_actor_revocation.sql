-- ASUS019 review fixes: current personal actor and bounded temporary replica retention.
create or replace function app_private.payment_history_job_actor_current_v1(j public.payment_history_jobs) returns boolean
language sql volatile security definer set search_path='' as $$
 select case when j.actor_kind='pos_staff_manager' then exists(
 select 1 from public.staff_web_sessions s join public.staff_accounts a on a.shop_id=s.shop_id and a.staff_id=s.staff_id
 join public.shops sh on sh.shop_id=s.shop_id where sh.shop_status='active' and s.shop_id=j.shop_id and s.staff_id=j.actor_id
 and s.staff_web_session_id=j.actor_session_id and s.status='active' and s.revoked_at is null and s.expires_at>clock_timestamp()
 and app_private.staff_web_runtime_lease_is_valid_v1(j.shop_id,j.actor_id,j.actor_session_id,s.session_token_hash,j.actor_credential_version,null)
 and s.staff_credential_version=j.actor_credential_version and a.credential_version=j.actor_credential_version
 and a.status='active' and a.credential_status='active' and not a.must_change_credential and a.credential_expires_at>clock_timestamp()
 and app_private.payment_history_staff_can_v1(j.shop_id,j.actor_id,'import')) else exists(
 select 1 from auth.sessions s join public.profiles pr on pr.profile_id=s.user_id join public.shop_members m on m.profile_id=s.user_id and m.shop_id=j.shop_id
 join public.shops sh on sh.shop_id=m.shop_id where sh.shop_status='active' and s.id=j.actor_session_id and s.user_id=j.actor_id
 and (s.not_after is null or s.not_after>clock_timestamp()) and m.membership_status='active' and pr.profile_status='active' and pr.disabled_at is null
 and (m.role_key='shop_owner' or (m.role_key='shop_manager' and exists(select 1 from public.payment_history_role_permissions g
 where g.shop_id=j.shop_id and g.role_key=m.role_key and g.capability='import' and g.enabled))) for share of s,m,sh,pr) end;
$$;
-- Temporary replica storage only: no financial receipt, source, event or ledger deletion.
create index payment_history_replica_cursor_expiry_idx on public.payment_history_replica_cursors(expires_at,shop_id,shop_device_id);
create index payment_history_replica_cursor_parent_idx on public.payment_history_replica_cursors(next_cursor_id) where next_cursor_id is not null;
create index payment_history_replica_cursor_device_idx on public.payment_history_replica_cursors(shop_id,shop_device_id);
create index payment_history_replica_snapshot_expiry_idx on public.payment_history_replica_snapshots(expires_at,shop_id,shop_device_id);
create function app_private.payment_history_replica_cleanup_v1(p_shop uuid default null,p_device uuid default null,p_budget integer default 5000)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare d record;cutoff timestamptz:=clock_timestamp();remaining integer:=p_budget;n integer;cursors_deleted integer:=0;rows_deleted integer:=0;snapshots_deleted integer:=0;
begin
 if p_budget is null or p_budget not between 1 and 5000 or (p_shop is null)<>(p_device is null) then raise exception using errcode='22023',message='payment_history_cleanup_limit';end if;
 -- Bound discovery too; an idle poll must not enumerate the entire expired backlog.
 for d in select x.shop_id,x.shop_device_id from (
  (select shop_id,shop_device_id,expires_at from public.payment_history_replica_snapshots where expires_at<=cutoff
   and (p_shop is null or (shop_id=p_shop and shop_device_id=p_device)) order by expires_at,shop_id,shop_device_id limit 32)
  union all
  (select shop_id,shop_device_id,expires_at from public.payment_history_replica_cursors where expires_at<=cutoff
   and (p_shop is null or (shop_id=p_shop and shop_device_id=p_device)) order by expires_at,shop_id,shop_device_id limit 32)
 )x group by x.shop_id,x.shop_device_id order by min(x.expires_at),x.shop_id,x.shop_device_id limit 8 loop
  if not pg_try_advisory_xact_lock(hashtextextended('history-replica-device:'||d.shop_id::text||':'||d.shop_device_id::text,0)) then continue;end if;
  with victims as(select cursor_id from public.payment_history_replica_cursors where shop_id=d.shop_id and shop_device_id=d.shop_device_id and expires_at<=cutoff order by expires_at,cursor_id limit least(1000,remaining) for update skip locked)
   delete from public.payment_history_replica_cursors c using victims v where c.cursor_id=v.cursor_id;
  get diagnostics n=row_count;cursors_deleted:=cursors_deleted+n;remaining:=remaining-n;
  if remaining>0 then
   with victims as(select sr.snapshot_id,sr.ordinal from public.payment_history_replica_snapshot_rows sr join public.payment_history_replica_snapshots s using(shop_id,snapshot_id)
    where s.shop_id=d.shop_id and s.shop_device_id=d.shop_device_id and s.expires_at<=cutoff
    and not exists(select 1 from public.payment_history_replica_cursors c where c.snapshot_id=s.snapshot_id and c.expires_at>cutoff)
    order by s.expires_at,s.snapshot_id,sr.ordinal limit remaining for update of sr skip locked)
    delete from public.payment_history_replica_snapshot_rows r using victims v where r.snapshot_id=v.snapshot_id and r.ordinal=v.ordinal;
   get diagnostics n=row_count;rows_deleted:=rows_deleted+n;remaining:=remaining-n;
  end if;
  with victims as(select s.snapshot_id from public.payment_history_replica_snapshots s
   where s.shop_id=d.shop_id and s.shop_device_id=d.shop_device_id and s.expires_at<=cutoff
   and not exists(select 1 from public.payment_history_replica_snapshot_rows r where r.snapshot_id=s.snapshot_id)
   and not exists(select 1 from public.payment_history_replica_cursors c where c.snapshot_id=s.snapshot_id)
   order by s.expires_at,s.snapshot_id limit 8 for update of s skip locked)
   delete from public.payment_history_replica_snapshots s using victims v where s.snapshot_id=v.snapshot_id;
  get diagnostics n=row_count;snapshots_deleted:=snapshots_deleted+n;
  exit when remaining=0;
 end loop;
 return jsonb_build_object('cursors',cursors_deleted,'rows',rows_deleted,'snapshots',snapshots_deleted);
end;$$;
revoke all on function app_private.payment_history_replica_cleanup_v1(uuid,uuid,integer) from public,anon,authenticated,service_role;

create or replace function public.payment_history_device_v1(p_shop_id uuid,p_shop_device_id uuid,p_staff_id uuid,p_pos_session_id uuid,p_device_token_hash text,p_session_token_hash text,p_credential_version integer,p_operation text,p_payload jsonb default '{}') returns jsonb
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
 perform pg_advisory_xact_lock(hashtextextended('history-replica-device:'||p_shop_id::text||':'||p_shop_device_id::text,0));
 perform app_private.payment_history_replica_cleanup_v1(p_shop_id,p_shop_device_id);
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
   if (select count(*) from public.payment_history_replica_cursors root where root.shop_id=p_shop_id and root.shop_device_id=p_shop_device_id and not exists(select 1 from public.payment_history_replica_cursors parent where parent.next_cursor_id=root.cursor_id))>=32 then raise exception using errcode='54000',message='payment_history_replica_backpressure';end if;
   select count(*) filter(where entity_kind='movement'),count(*) filter(where entity_kind='batch') into v_movements,v_batches from app_private.payment_history_replica_entities_v1(p_shop_id);
   if v_movements>1000000 or v_batches>100000 then raise exception using errcode='54000',message='payment_history_replica_capacity';end if;
   if (select count(*) from public.payment_history_replica_snapshots where shop_id=p_shop_id and shop_device_id=p_shop_device_id)>=3 then raise exception using errcode='54000',message='payment_history_replica_backpressure';end if;
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
  -- Identical delta starts replay the same live root, including unchanged revisions.
  select * into c from public.payment_history_replica_cursors root where root.shop_id=p_shop_id and root.shop_device_id=p_shop_device_id
   and root.mode='delta' and root.dataset_id=r.dataset_id and root.writer_epoch=r.writer_epoch and root.target_revision=r.revision
   and root.next_revision=v_last_revision and root.next_ordinal=2147483647 and root.page_size=v_limit and root.expires_at>clock_timestamp()
   and not exists(select 1 from public.payment_history_replica_cursors parent where parent.next_cursor_id=root.cursor_id)
   order by root.expires_at desc,root.cursor_id limit 1;
  if not found then
   if (select count(*) from public.payment_history_replica_cursors root where root.shop_id=p_shop_id and root.shop_device_id=p_shop_device_id and not exists(select 1 from public.payment_history_replica_cursors parent where parent.next_cursor_id=root.cursor_id))>=32 then raise exception using errcode='54000',message='payment_history_replica_backpressure';end if;
  insert into public.payment_history_replica_cursors(shop_id,shop_device_id,mode,dataset_id,writer_epoch,target_revision,next_revision,next_ordinal,page_size,target_checksum,target_movements,target_batches,expires_at)
   values(p_shop_id,p_shop_device_id,'delta',r.dataset_id,r.writer_epoch,r.revision,v_last_revision,2147483647,v_limit,app_private.payment_history_replica_checksum_v1(p_shop_id),v_movements,v_batches,clock_timestamp()+interval '1 hour') returning * into c;
  end if;
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
create or replace function public.payment_history_worker_gateway_v1(p_request_id uuid,p_lane text,p_operation text,p_payload jsonb) returns jsonb
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
 if p_operation in ('claim','claim_upload') then perform app_private.payment_history_replica_cleanup_v1();end if;
 if p_lane='import' then v_response:=public.payment_history_worker_v1(p_operation,p_payload);
 else v_response:=public.payment_history_migration_worker_v1(p_operation,p_payload);end if;
 insert into public.payment_history_worker_requests(request_id,request_digest,response) values(p_request_id,v_digest,v_response);
 -- This is an ephemeral replay cache, never a financial or provenance table.
 delete from public.payment_history_worker_requests where request_id in(select request_id from public.payment_history_worker_requests where created_at<clock_timestamp()-interval '2 hours' order by created_at limit 100);
 return v_response;
end;$$;
