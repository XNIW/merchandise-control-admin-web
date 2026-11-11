-- Private bounded Undo review. Local deactivation and canonical ownership are
-- separate decisions; an observed canonical duplicate never acquires ownership.
alter table public.payment_history_local_reviews
 add column undo_local_batch_id text,add column undo_apply_operation_id uuid,add column undo_canonical_batch_id uuid,
 add column undo_cursor text not null default '',add column undo_complete boolean not null default false,
 add column undo_expected_count integer check(undo_expected_count between 0 and 100000),add column undo_expected_gross bigint;
alter table public.payment_history_local_reviews add foreign key(shop_id,undo_canonical_batch_id) references public.payment_history_batches(shop_id,batch_id);
create index payment_history_local_undo_baseline_cursor_idx on public.payment_history_source_objects(source_snapshot_id,(original_object->>'batch_id'),(('b:'||lpad(local_id,19,'0')) collate "C"))
 where table_name='movements' and original_object->>'is_active'='1';
create index payment_history_local_undo_publication_cursor_idx on public.payment_history_local_publication_map(operation_id,(('p:'||lpad(source_ordinal::text,6,'0')) collate "C")) where local_inserted;

create table public.payment_history_local_review_undo_rows (
 shop_id uuid not null,operation_id uuid not null,source_key text not null,
 baseline_snapshot_id uuid,baseline_local_id text,source_operation_id uuid,source_ordinal integer,
 canonical_version_id uuid not null,canonical_owned boolean not null,
 primary key(operation_id,source_key),
 foreign key(shop_id,operation_id) references public.payment_history_local_publications(shop_id,operation_id),
 foreign key(operation_id) references public.payment_history_local_reviews(operation_id) on delete cascade,
 foreign key(shop_id,baseline_snapshot_id) references public.payment_history_source_snapshots(shop_id,snapshot_id),
 foreign key(source_operation_id,source_ordinal) references public.payment_history_local_publication_map(operation_id,source_ordinal),
 foreign key(shop_id,canonical_version_id) references public.payment_history_movement_versions(shop_id,movement_version_id),
 check((source_key ~ '^b:[0-9]{19}$' and baseline_snapshot_id is not null and baseline_local_id is not null and source_operation_id is null and source_ordinal is null)
  or (source_key ~ '^p:[0-9]{6}$' and baseline_snapshot_id is null and baseline_local_id is null and source_operation_id is not null and source_ordinal is not null and source_ordinal between 1 and 100000))
);
alter table public.payment_history_local_review_undo_rows enable row level security;
revoke all on public.payment_history_local_review_undo_rows from public,anon,authenticated,service_role;
create trigger payment_history_local_review_cache_guard before insert or update or delete on public.payment_history_local_review_undo_rows
 for each row execute function app_private.payment_history_local_review_cache_guard_v2();

create function app_private.payment_history_local_review_undo_sources_v2(p_operation uuid,p_after text)
 returns table(source_key text,baseline_snapshot uuid,baseline_local_id text,source_operation uuid,source_ordinal integer,
  canonical_version uuid,canonical_owned boolean,signed_gross bigint,source_economic_digest text)
language plpgsql volatile set search_path='' as $$
declare p public.payment_history_local_publications;c public.payment_history_local_writer_contexts;review public.payment_history_local_reviews;begin
 select * into p from public.payment_history_local_publications where operation_id=p_operation;
 if not found or p.state<>'preparing' or p.operation_kind<>'Undo' or p.grant_id is not null then
  raise exception using errcode='40001',message='payment_history_local_review_stale';end if;
 perform 1 from public.payment_history_runtime where shop_id=p.shop_id for share;
 select * into c from public.payment_history_local_writer_contexts where shop_id=p.shop_id and shop_device_id=p.shop_device_id for share;
 select * into review from public.payment_history_local_reviews where operation_id=p_operation for share;
 if not found or review.undo_local_batch_id is null or p_after is null or (p_after<>'' and p_after !~ '^[bp]:[0-9]{6,19}$')
  or row(c.local_dataset_id,c.restore_lineage_id,c.restore_epoch) is distinct from row(p.local_dataset_id,p.restore_lineage_id,p.restore_epoch) then
  raise exception using errcode='40001',message='payment_history_local_context_unverified';end if;
 return query
 with rows as (
  select 'b:'||lpad(raw.local_id,19,'0') key,c.source_snapshot_id snapshot,raw.local_id local_id,null::uuid source_op,null::integer source_no,
   m.movement_version_id version_id,m.owns_version owned,(raw.original_object->>'signed_amount_clp')::bigint gross,
   app_private.payment_history_economic_digest_v1(jsonb_build_object('businessTicks',raw.original_object->>'business_ticks','grossClp',raw.original_object->>'signed_amount_clp',
    'commissionClp',raw.original_object->>'signed_fee_clp','commissionVatClp',raw.original_object->>'signed_fee_vat_clp','netClp',raw.original_object->>'signed_net_clp',
    'movementKind',raw.original_object->>'movement_kind','transactionState',upper(btrim(raw.original_object->>'state')))) digest
  from public.payment_history_source_objects raw
  left join public.payment_history_local_movement_map m on m.shop_id=p.shop_id and m.shop_device_id=p.shop_device_id and m.local_dataset_id=p.local_dataset_id and m.local_movement_id=raw.local_id
  where raw.shop_id=p.shop_id and raw.source_snapshot_id=c.source_snapshot_id and raw.table_name='movements'
   and raw.original_object->>'batch_id'=review.undo_local_batch_id and raw.original_object->>'is_active'='1'
   and exists(select 1 from public.payment_history_source_objects b where b.source_snapshot_id=c.source_snapshot_id and b.table_name='batches' and b.local_id=review.undo_local_batch_id
    and (b.original_object->>'apply_operation_id')::uuid=review.undo_apply_operation_id)
  union all
  select 'p:'||lpad(m.source_ordinal::text,6,'0'),null,null,m.operation_id,m.source_ordinal,m.movement_version_id,m.owned,
   (f.v->>'gross_clp')::bigint,app_private.payment_history_economic_digest_v1(jsonb_build_object('businessTicks',f.v->>'business_ticks','grossClp',f.v->>'gross_clp',
    'commissionClp',f.v->>'fee_clp','commissionVatClp',f.v->>'fee_vat_clp','netClp',f.v->>'net_clp','movementKind',f.v->>'movement_kind','transactionState',upper(btrim(f.v->>'transaction_state'))))
  from public.payment_history_local_publication_map m
  join public.payment_history_local_publications previous on previous.operation_id=m.operation_id and previous.state='committed' and previous.operation_kind='Apply' and previous.grant_id is not null
  join public.payment_history_local_publication_pages page on page.operation_id=m.operation_id and page.ordinal=m.source_page_ordinal
  cross join lateral(select page.page_json::jsonb->(m.source_record_ordinal-1)->'fields' v) f
  where m.shop_id=p.shop_id and m.operation_id=review.undo_apply_operation_id and m.local_inserted
   and previous.shop_id=p.shop_id and previous.shop_device_id=p.shop_device_id and previous.local_dataset_id=p.local_dataset_id
   and previous.restore_lineage_id=p.restore_lineage_id and previous.restore_epoch=p.restore_epoch and previous.local_batch_id=review.undo_local_batch_id
 ) select x.key,x.snapshot,x.local_id,x.source_op,x.source_no,x.version_id,x.owned,x.gross,x.digest
 from rows x where x.key collate "C">p_after collate "C" order by x.key collate "C" limit 201;
end;$$;
revoke all on function app_private.payment_history_local_review_undo_sources_v2(uuid,text) from public,anon,authenticated,service_role;

create function app_private.payment_history_local_review_undo_page_v2(p_shop uuid,p_device uuid,p_operation uuid,p_root text,p_page integer,p_token uuid default null) returns jsonb
language plpgsql volatile set search_path='' as $$
declare r public.payment_history_runtime;p public.payment_history_local_publications;c public.payment_history_local_writer_contexts;
 review public.payment_history_local_reviews;previous public.payment_history_local_publications;f jsonb;header jsonb;original jsonb;receipt jsonb;
 target_batch uuid;expected_count integer;expected_gross bigint;source record;v public.payment_history_movement_versions;b public.payment_history_batches;
 cursor_key text;more boolean:=false;n integer:=0;begin
 if p_page is null or p_page not between 1 and 20000 or p_operation is null or coalesce(p_root,'') !~ '^[0-9a-f]{64}$' then
  raise exception using errcode='22023',message='payment_history_local_review_page_invalid';end if;
 select * into r from public.payment_history_runtime where shop_id=p_shop for share;
 select * into p from public.payment_history_local_publications where shop_id=p_shop and shop_device_id=p_device and operation_id=p_operation for update;
 if not found or p.operation_kind<>'Undo' or p.state<>'preparing' or p.grant_id is not null or p.content_digest<>p_root or r.writer_authority<>'local'
  or row(p.server_dataset_id,p.writer_epoch) is distinct from row(r.dataset_id,r.writer_epoch) then
  raise exception using errcode='40001',message='payment_history_local_review_stale';end if;
 select * into c from public.payment_history_local_writer_contexts where shop_id=p_shop and shop_device_id=p_device for share;
 if not found or c.source_snapshot_id is null or row(c.local_dataset_id,c.restore_lineage_id,c.restore_epoch) is distinct from row(p.local_dataset_id,p.restore_lineage_id,p.restore_epoch)
  or c.local_revision>p.base_revision then raise exception using errcode='40001',message='payment_history_local_context_unverified';end if;
 perform 1 from app_private.payment_history_local_review_records_v2(p_shop,p_device,p_operation,1);
 perform app_private.payment_history_local_projection_v2(p_operation,'review-context-probe','getnet.legacy.transaction','review-context-probe');
 if (select count(*) from public.payment_history_local_preparation_records where operation_id=p_operation)<>2
  or exists(select 1 from public.payment_history_local_preparation_records where operation_id=p_operation and kind not in('operation','undo')) then
  raise exception using errcode='22023',message='payment_history_local_review_source_invalid';end if;
 select fields into f from app_private.payment_history_local_auxiliary_v2(p_operation,'undo',app_private.payment_history_field_hash_v1(array['single']));
 select fields into header from app_private.payment_history_local_auxiliary_v2(p_operation,'operation',app_private.payment_history_field_hash_v1(array['single']));
 if f is null or header is null or length(btrim(coalesce(f->>'batch_id',''))) not between 1 and 256 or f->>'batch_id' ~ '[[:cntrl:]]'
  or coalesce(f->>'batch_revision','') !~ '^[1-9][0-9]{0,18}$' or (f->>'batch_revision')::numeric>9223372036854775807
  or coalesce(f->>'apply_operation_id','') !~ '^([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'
  or (f->>'apply_operation_id')::uuid='00000000-0000-0000-0000-000000000000'::uuid
  or p.request_fingerprint is distinct from app_private.payment_history_field_hash_v1(array['historical-undo-request-v1',header->>'operation_id',p.shop_id::text,p.local_dataset_id,f->>'batch_id',f->>'batch_revision',p.restore_epoch::text]) then
  raise exception using errcode='22023',message='payment_history_local_undo_owner_invalid';end if;
 if exists(select 1 from public.payment_history_local_publications u where u.shop_id=p_shop and u.shop_device_id=p_device and u.local_dataset_id=p.local_dataset_id
  and u.restore_lineage_id=p.restore_lineage_id and u.restore_epoch=p.restore_epoch and u.operation_kind='Undo' and u.state='committed' and u.local_batch_id=f->>'batch_id') then
  raise exception using errcode='40001',message='payment_history_local_undo_stale';end if;
 select * into review from public.payment_history_local_reviews where operation_id=p_operation for update;
 if not found then
  if p_page<>1 or p_token is not null then raise exception using errcode='40001',message='payment_history_local_review_stale';end if;
  select * into previous from public.payment_history_local_publications a where a.operation_id=(f->>'apply_operation_id')::uuid and a.shop_id=p_shop and a.shop_device_id=p_device
   and a.local_dataset_id=p.local_dataset_id and a.restore_lineage_id=p.restore_lineage_id and a.restore_epoch=p.restore_epoch and a.local_batch_id=f->>'batch_id'
   and a.operation_kind='Apply' and a.state='committed' and a.grant_id is not null for share;
  if found then
   receipt:=previous.local_receipt_json::jsonb;
   if jsonb_typeof(receipt->'InsertedCount') is distinct from 'number' or coalesce(receipt->>'InsertedCount','') !~ '^(0|[1-9][0-9]{0,5})$'
    or (receipt->>'InsertedCount')::integer>100000 or receipt->>'OperationKind' is distinct from 'Apply' or receipt->>'BatchId' is distinct from f->>'batch_id'
    or (receipt->>'OperationId')::uuid is distinct from previous.operation_id or previous.local_revision is null or previous.local_revision>p.base_revision
    or coalesce(previous.server_receipt->>'batch_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or f->>'batch_revision'<>'1' then
    raise exception using errcode='40001',message='payment_history_local_undo_owner_unverified';end if;
   expected_count:=(receipt->>'InsertedCount')::integer;expected_gross:=(receipt->>'SignedAmountClp')::bigint;target_batch:=(previous.server_receipt->>'batch_id')::uuid;
  else
   select raw.original_object,m.batch_id into original,target_batch from public.payment_history_source_objects raw
    join public.payment_history_local_batch_map m on m.shop_id=p_shop and m.shop_device_id=p_device and m.local_dataset_id=p.local_dataset_id and m.local_batch_id=raw.local_id and m.source_object_digest=raw.object_digest
    where raw.shop_id=p_shop and raw.source_snapshot_id=c.source_snapshot_id and raw.table_name='batches' and raw.local_id=f->>'batch_id'
     and (raw.original_object->>'apply_operation_id')::uuid=(f->>'apply_operation_id')::uuid for share of raw,m;
   if original is null or original->>'state' is distinct from 'Active' or original->>'revision' is distinct from f->>'batch_revision' then
    raise exception using errcode='40001',message='payment_history_local_undo_owner_unverified';end if;
   select count(*)::integer,coalesce(sum((raw.original_object->>'signed_amount_clp')::bigint),0)::bigint into expected_count,expected_gross
    from public.payment_history_source_objects raw where raw.shop_id=p_shop and raw.source_snapshot_id=c.source_snapshot_id and raw.table_name='movements' and raw.original_object->>'batch_id'=f->>'batch_id' and raw.original_object->>'is_active'='1';
  end if;
  if target_batch is null or expected_count is null or expected_count>100000 or expected_gross is null
   or not exists(select 1 from public.payment_history_batches where shop_id=p_shop and batch_id=target_batch and state='active') then
   raise exception using errcode='40001',message='payment_history_local_undo_owner_unverified';end if;
  insert into public.payment_history_local_reviews(shop_id,operation_id,server_dataset_id,server_revision,writer_epoch,undo_local_batch_id,undo_apply_operation_id,undo_canonical_batch_id,undo_expected_count,undo_expected_gross)
   values(p_shop,p_operation,r.dataset_id,r.revision,r.writer_epoch,f->>'batch_id',(f->>'apply_operation_id')::uuid,target_batch,expected_count,expected_gross) returning * into review;
 end if;
 if row(review.server_dataset_id,review.server_revision,review.writer_epoch) is distinct from row(r.dataset_id,r.revision,r.writer_epoch)
  or review.undo_local_batch_id is distinct from f->>'batch_id' or (p_token is not null and p_token<>review.review_token) or (p_token is null and p_page<>1) or p_page>review.next_page then
  raise exception using errcode='40001',message='payment_history_local_review_stale';end if;
 if p_page=review.next_page and not review.undo_complete then
  cursor_key:=review.undo_cursor;
  for source in select * from app_private.payment_history_local_review_undo_sources_v2(p_operation,review.undo_cursor) loop
   n:=n+1;if n>200 then more:=true;exit;end if;
   if source.canonical_version is null or source.canonical_owned is null or source.signed_gross is null then
    raise exception using errcode='40001',message='payment_history_local_undo_owner_unverified';end if;
   select * into v from public.payment_history_movement_versions where shop_id=p_shop and movement_version_id=source.canonical_version for share;
   select * into b from public.payment_history_batches where shop_id=p_shop and batch_id=v.owner_batch_id for share;
   if v.movement_version_id is null or b.batch_id is null or (source.canonical_owned and (not v.active or b.state<>'active' or v.owner_batch_id<>review.undo_canonical_batch_id
    or v.gross_clp<>source.signed_gross or v.economic_digest is distinct from source.source_economic_digest)) then
    raise exception using errcode='40001',message='payment_history_local_undo_owner_unverified';end if;
   insert into public.payment_history_local_review_undo_rows values(p_shop,p_operation,source.source_key,source.baseline_snapshot,source.baseline_local_id,source.source_operation,source.source_ordinal,source.canonical_version,source.canonical_owned);
   review.local_deactivated:=review.local_deactivated+1;review.local_gross:=review.local_gross+source.signed_gross;
   if source.canonical_owned then review.canonical_deactivated:=review.canonical_deactivated+1;review.canonical_gross:=review.canonical_gross+v.gross_clp;end if;
   cursor_key:=source.source_key;
  end loop;
  if not more and (review.local_deactivated<>review.undo_expected_count or review.local_gross<>review.undo_expected_gross) then
   raise exception using errcode='40001',message='payment_history_local_review_incomplete';end if;
  update public.payment_history_local_reviews set next_page=next_page+1,undo_cursor=cursor_key,undo_complete=not more,
   local_deactivated=review.local_deactivated,local_gross=review.local_gross,canonical_deactivated=review.canonical_deactivated,canonical_gross=review.canonical_gross
   where operation_id=p_operation returning * into review;
 end if;
 return jsonb_build_object('state',case when review.undo_complete then 'reviewed' else 'reviewing' end,'operation_id',p.operation_id,'content_digest',p.content_digest,'review_token',review.review_token,'next_ordinal',review.next_page);
end;$$;
revoke all on function app_private.payment_history_local_review_undo_page_v2(uuid,uuid,uuid,text,integer,uuid) from public,anon,authenticated,service_role;
