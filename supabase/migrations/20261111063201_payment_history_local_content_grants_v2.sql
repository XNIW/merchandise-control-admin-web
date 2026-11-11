-- Private content decisions. No device RPC exposes this authorizer until
-- economic delivery, durable client intent and reconciliation are qualified.
alter table public.payment_history_local_publications
 add column authorized_proof jsonb,
 add column authorization_session_id uuid references public.pos_sessions(pos_session_id),
 add column authorization_device_credential_id uuid references public.pos_device_credentials(pos_device_credential_id),
 add column authorized_history_end_date date,
 add constraint payment_history_local_proof_shape check(authorized_proof is null or
  (grant_id is not null and authorization_session_id is not null and authorization_device_credential_id is not null
   and app_private.payment_history_local_keys_v2(authorized_proof,array['grant_id','operation_id','shop_id','device_id','local_dataset_id','restore_epoch','writer_epoch','content_digest','request_fingerprint','decision','server_dataset_id','restore_lineage_id','local_decision','canonical_decision'])));

create function app_private.payment_history_local_grant_immutable_v2() returns trigger
language plpgsql set search_path='' as $$begin
 if old.authorized_proof is not null and row(new.authorized_proof,new.authorization_session_id,new.authorization_device_credential_id,new.authorized_history_end_date)
  is distinct from row(old.authorized_proof,old.authorization_session_id,old.authorization_device_credential_id,old.authorized_history_end_date) then
  raise exception using errcode='55000',message='payment_history_local_publication_immutable';end if;
 return new;
end;$$;
revoke all on function app_private.payment_history_local_grant_immutable_v2() from public,anon,authenticated,service_role;
create trigger payment_history_local_grant_immutable before update on public.payment_history_local_publications
 for each row execute function app_private.payment_history_local_grant_immutable_v2();

-- A real row write, rather than an advisory lock alone, fences stale snapshots
-- at REPEATABLE READ/SERIALIZABLE too. Native acceptance never locks history
-- runtime: the lock order is runtime -> this row, with no reverse dependency.
-- This contains no sales, amounts or mirrored transaction data.
create table public.payment_history_local_mutation_fences (
 shop_id uuid primary key references public.shops(shop_id),nonce uuid not null
);
alter table public.payment_history_local_mutation_fences enable row level security;
revoke all on public.payment_history_local_mutation_fences from public,anon,authenticated,service_role;
create function app_private.payment_history_local_mutation_fence_v2(p_shop uuid) returns void
language sql volatile set search_path='' as $$
 insert into public.payment_history_local_mutation_fences(shop_id,nonce) values(p_shop,gen_random_uuid())
 on conflict(shop_id) do update set nonce=excluded.nonce;
$$;
revoke all on function app_private.payment_history_local_mutation_fence_v2(uuid) from public,anon,authenticated,service_role;

create function app_private.payment_history_local_native_fence_v2() returns trigger
language plpgsql security definer set search_path='' as $$
declare history_end date;pending_end date;begin
 if new.status<>'accepted' then return new;end if;
 if tg_op='UPDATE' and row(new.shop_id,new.status,new.business_date) is not distinct from row(old.shop_id,old.status,old.business_date) then return new;end if;
 perform app_private.payment_history_local_mutation_fence_v2(new.shop_id);
 -- Legacy shops keep their existing native acceptance policy. The fence still
 -- serializes a concurrent first v2 baseline before its context is installed.
 if exists(select 1 from public.payment_history_local_writer_contexts where shop_id=new.shop_id and source_snapshot_id is not null) then
  select max(v.business_date) into history_end from public.payment_history_movement_versions v where v.shop_id=new.shop_id and v.active;
  select max(p.authorized_history_end_date) into pending_end from public.payment_history_local_publications p
   where p.shop_id=new.shop_id and p.grant_id is not null and p.state not in('committed','aborted');
  if new.business_date is null or new.business_date<=greatest(history_end,pending_end) then
   raise exception using errcode='40001',message='payment_history_local_native_overlap';end if;
 end if;
 return new;
end;$$;
revoke all on function app_private.payment_history_local_native_fence_v2() from public,anon,authenticated,service_role;
create trigger payment_history_local_native_fence before insert or update of shop_id,status,business_date on public.pos_sales
 for each row execute function app_private.payment_history_local_native_fence_v2();

create function app_private.payment_history_local_revision_fence_v2() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if row(new.dataset_id,new.revision) is not distinct from row(old.dataset_id,old.revision) then return new;end if;
 -- TTL does not prove that a local SQLite commit did not happen. All financial
 -- writers stay behind an unresolved issued decision, including expired ones.
 if exists(select 1 from public.payment_history_local_publications p where p.shop_id=new.shop_id
  and p.grant_id is not null and p.state not in('committed','aborted')) then
  raise exception using errcode='40001',message='payment_history_local_publications_not_drained';end if;
 perform app_private.payment_history_local_mutation_fence_v2(new.shop_id);
 if exists(select 1 from public.payment_history_movement_versions h where h.shop_id=new.shop_id and h.active
  and h.created_revision=new.revision and exists(select 1 from public.pos_sales s where s.shop_id=new.shop_id and s.status='accepted' and (s.business_date is null or s.business_date<=h.business_date))) then
  raise exception using errcode='40001',message='payment_history_local_native_overlap';end if;
 return new;
end;$$;
revoke all on function app_private.payment_history_local_revision_fence_v2() from public,anon,authenticated,service_role;
create trigger payment_history_local_revision_fence before update on public.payment_history_runtime
 for each row execute function app_private.payment_history_local_revision_fence_v2();

create function app_private.payment_history_local_authorize_v2(p_shop uuid,p_device uuid,p_staff uuid,p_session uuid,
 p_device_hash text,p_session_hash text,p_version integer,p_operation uuid,p_root text,p_review_token uuid) returns jsonb
language plpgsql volatile set search_path='' as $$
declare r public.payment_history_runtime;p public.payment_history_local_publications;c public.payment_history_local_writer_contexts;
 review public.payment_history_local_reviews;cap text;grant_key uuid;issued timestamptz;deadline timestamptz;proof jsonb;history_end date;credential uuid;begin
 select case operation_kind when 'Undo' then 'cancel' else 'import' end into cap
  from public.payment_history_local_publications where shop_id=p_shop and shop_device_id=p_device and operation_id=p_operation;
 -- Unknown operations are authenticated before returning any scope information.
 perform app_private.payment_history_local_device_actor_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,coalesce(cap,'import'));
 if p_operation is null or coalesce(p_root,'') !~ '^[0-9a-f]{64}$' or p_review_token is null then
  raise exception using errcode='22023',message='payment_history_local_request_invalid';end if;
 select * into r from public.payment_history_runtime where shop_id=p_shop for update;
 select * into p from public.payment_history_local_publications where shop_id=p_shop and shop_device_id=p_device and operation_id=p_operation for update;
 if not found or p.content_digest<>p_root or p.server_dataset_id is distinct from r.dataset_id then
  raise exception using errcode='40001',message='payment_history_local_preparation_stale';end if;
 select * into c from public.payment_history_local_writer_contexts where shop_id=p_shop and shop_device_id=p_device for share;
 if not found or c.source_snapshot_id is null or row(c.local_dataset_id,c.restore_lineage_id,c.restore_epoch) is distinct from row(p.local_dataset_id,p.restore_lineage_id,p.restore_epoch)
  or c.local_revision>p.base_revision then raise exception using errcode='40001',message='payment_history_local_context_unverified';end if;
 select * into review from public.payment_history_local_reviews where operation_id=p_operation for share;
 if not found or review.review_token<>p_review_token then raise exception using errcode='40001',message='payment_history_local_review_stale';end if;
 if p.grant_id is not null then
  if p.state not in('authorized','reconcile_required') or p.authorized_proof is null or p.authorization_staff_id<>p_staff or p.authorization_credential_version<>p_version then
   raise exception using errcode='40001',message='payment_history_local_decision_exists';end if;
  -- Lost-ACK replay returns the original decision and deadline, never a renewal.
  return jsonb_build_object('state','authorized','operation_id',p.operation_id,'content_digest',p.content_digest,'grant_id',p.grant_id,'writer_epoch',p.writer_epoch::text,
   'remaining_milliseconds',case when r.writer_authority='local' and r.writer_epoch=p.writer_epoch then greatest(0,least(60000,floor(extract(epoch from p.expires_at-clock_timestamp())*1000)))::integer else 0 end,'proof',p.authorized_proof);
 end if;
 if p.state<>'preparing' or r.writer_authority<>'local' or p.writer_epoch<>r.writer_epoch
  or row(review.server_dataset_id,review.server_revision,review.writer_epoch) is distinct from row(r.dataset_id,r.revision,r.writer_epoch)
  or p.staged_pages<>p.page_count or (p.operation_kind='Apply' and review.next_page<=p.page_count) or (p.operation_kind='Undo' and not review.undo_complete) then
  raise exception using errcode='40001',message='payment_history_local_review_incomplete';end if;
 perform app_private.payment_history_local_projection_v2(p_operation,'review-context-probe','getnet.legacy.transaction','review-context-probe');
 perform app_private.payment_history_local_review_dependencies_current_v2(p_shop,review.dependency_hashes);
 if exists(select 1 from public.payment_history_local_publications other where other.shop_id=p_shop and other.operation_id<>p_operation
   and other.grant_id is not null and other.state not in('committed','aborted'))
  or exists(select 1 from public.payment_history_local_write_grants where shop_id=p_shop)
  or exists(select 1 from public.payment_history_source_objects b where b.source_snapshot_id=c.source_snapshot_id and b.table_name='operations' and (b.original_object->>'operation_id')::uuid=p_operation) then
  raise exception using errcode='40001',message='payment_history_local_publications_not_drained';end if;
 perform app_private.payment_history_local_mutation_fence_v2(p_shop);
 select max((m.transaction#>>'{timestamp,businessDateTime}')::date) into history_end
  from public.payment_history_local_review_movements m where m.operation_id=p_operation;
 if history_end is not null and exists(select 1 from public.pos_sales s where s.shop_id=p_shop and s.status='accepted' and (s.business_date is null or s.business_date<=history_end)) then
  raise exception using errcode='40001',message='payment_history_local_native_overlap';end if;
 issued:=clock_timestamp();deadline:=least(issued+interval '60 seconds',current_setting('app.payment_history_publish_deadline',true)::timestamptz);
 if deadline is null or deadline<=issued+interval '10 seconds' then raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 select pos_device_credential_id into credential from public.pos_sessions where pos_session_id=p_session;
 grant_key:=gen_random_uuid();
 proof:=jsonb_build_object('grant_id',grant_key,'operation_id',p.operation_id,'shop_id',p.shop_id,'device_id',p.shop_device_id,'local_dataset_id',p.local_dataset_id,
  'restore_epoch',p.restore_epoch::text,'writer_epoch',p.writer_epoch::text,'content_digest',p.content_digest,'request_fingerprint',p.request_fingerprint,
  'decision','content_authorized_v2','server_dataset_id',p.server_dataset_id,'restore_lineage_id',p.restore_lineage_id,
  'local_decision',jsonb_build_object('inserted',review.local_inserted,'duplicates',review.local_duplicates,'rejected',review.local_rejected,'corrections',review.local_corrections,
   'deactivated',review.local_deactivated,'signed_gross_clp',review.local_gross::text,'revision_delta',(review.local_inserted+review.local_deactivated)::text),
  'canonical_decision',jsonb_build_object('batch_id',case when p.operation_kind='Undo' then review.undo_canonical_batch_id else review.planned_batch_id end,
   'revision',(r.revision+1)::text,'inserted',review.canonical_inserted,'duplicates',review.canonical_duplicates,'deactivated',review.canonical_deactivated,'signed_gross_clp',review.canonical_gross::text));
 update public.payment_history_local_publications set state='authorized',grant_id=grant_key,authorization_staff_id=p_staff,authorization_credential_version=p_version,
  authorization_session_id=p_session,authorization_device_credential_id=credential,issued_at=issued,expires_at=deadline,authorized_proof=proof,authorized_history_end_date=history_end
  where operation_id=p_operation returning * into p;
 return jsonb_build_object('state','authorized','operation_id',p.operation_id,'content_digest',p.content_digest,'grant_id',p.grant_id,'writer_epoch',p.writer_epoch::text,
  'remaining_milliseconds',greatest(0,least(60000,floor(extract(epoch from p.expires_at-clock_timestamp())*1000)::integer)),'proof',p.authorized_proof);
end;$$;
revoke all on function app_private.payment_history_local_authorize_v2(uuid,uuid,uuid,uuid,text,text,integer,uuid,text,uuid) from public,anon,authenticated,service_role;

-- Enrolling any v2 baseline closes legacy unbound grants for the whole shop,
-- including another device. Keep the qualified v1 body intact behind a wrapper
-- that acquires runtime exclusively before its old SHARE read (no lock upgrade).
alter function public.payment_history_device_v1(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb) set schema app_private;
alter function app_private.payment_history_device_v1(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb) rename to payment_history_device_legacy_v1;
revoke all on function app_private.payment_history_device_legacy_v1(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb) from public,anon,authenticated,service_role;
create function public.payment_history_device_v1(p_shop_id uuid,p_shop_device_id uuid,p_staff_id uuid,p_pos_session_id uuid,p_device_token_hash text,p_session_token_hash text,p_credential_version integer,p_operation text,p_payload jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path='' as $$begin
 if p_operation='local_write_grant' then
  perform app_private.payment_history_local_device_actor_v2(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_device_token_hash,p_session_token_hash,p_credential_version,
   case when p_payload->>'kind'='Undo' then 'cancel' else 'import' end);
  insert into public.payment_history_runtime(shop_id) values(p_shop_id) on conflict do nothing;
  perform 1 from public.payment_history_runtime where shop_id=p_shop_id for update;
  if exists(select 1 from public.payment_history_local_writer_contexts where shop_id=p_shop_id and source_snapshot_id is not null) then
   raise exception using errcode='40001',message='payment_history_local_protocol_required';end if;
 end if;
 return app_private.payment_history_device_legacy_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_device_token_hash,p_session_token_hash,p_credential_version,p_operation,p_payload);
end;$$;
revoke all on function public.payment_history_device_v1(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.payment_history_device_v1(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb) to service_role;
