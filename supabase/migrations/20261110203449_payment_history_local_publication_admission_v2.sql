-- Private preparation primitives for the incremental protocol. No device RPC
-- or grant is exposed by this migration: semantic admission and economic
-- delivery must be installed together before the v2 boundary becomes usable.

create function app_private.payment_history_local_keys_v2(v jsonb,keys text[]) returns boolean
language sql immutable set search_path='' as $$
 select case when jsonb_typeof(v)='object' then
  (select count(*) from jsonb_object_keys(v))=cardinality(keys) and v ?& keys else false end;
$$;
revoke all on function app_private.payment_history_local_keys_v2(jsonb,text[]) from public,anon,authenticated,service_role;

create function app_private.payment_history_local_page_v2(p_raw text) returns integer
language plpgsql immutable set search_path='' as $$
declare records jsonb;item json;v jsonb;f jsonb;keys text[];n integer:=0;begin
 if p_raw is null or octet_length(p_raw) not between 2 and 262144 then raise exception using errcode='22023',message='payment_history_local_page_invalid';end if;
 records:=p_raw::jsonb;
 if jsonb_typeof(records) is distinct from 'array' or jsonb_array_length(records) not between 1 and 200 then raise exception using errcode='22023',message='payment_history_local_page_invalid';end if;
 for item in select value from json_array_elements(p_raw::json) loop
  v:=item::jsonb;f:=v->'fields';
  if octet_length(item::text)>16384 or not app_private.payment_history_local_keys_v2(v,array['kind','fields']) then raise exception using errcode='22023',message='payment_history_local_record_invalid';end if;
  keys:=case v->>'kind'
   when 'operation' then array['protocol_version','operation_id','operation_kind','shop_id','device_id','local_dataset_id','restore_epoch','restore_lineage_id','base_revision','request_fingerprint']
   when 'overlap' then array['native_start_ticks','evidence_reference']
   when 'file' then array['id','sha256','profile','source_rows']
   when 'binding' then array['alias_key','local_scope_id','local_binding_id','evidence_reference']
   when 'movement' then array['source_file_id','source_sheet','source_row','external_namespace','external_id','business_ticks','profile','alias_key','merchant_local','merchant_seller','merchant_seller_id','merchant_local_number','merchant_rut','movement_kind','transaction_state','settlement_state','gross_clp','fee_clp','fee_vat_clp','net_clp','timestamp_raw','offset_raw','offset_minutes','occurred_at_utc_ms','time_interpretation','time_policy_version','time_evidence_reference','card_subtype','payment_id','authorization_code','original_card_type','original_prepaid','terminal','settlement_date_raw']
   when 'rejected' then array['source_file_id','source_sheet','source_row','transaction_state','requested_clp']
   when 'correction' then array['source_file_id','source_sheet','source_row','previous_transaction_id','previous_economic_digest','proposed_economic_digest','context_fingerprint','evidence_reference','approval_fingerprint']
   when 'undo' then array['batch_id','batch_revision','apply_operation_id']
   else null end;
  if keys is null or not app_private.payment_history_local_keys_v2(f,keys) or exists(
   select 1 from jsonb_each(f) e where jsonb_typeof(e.value) not in('string','null') or length(e.value#>>'{}')>2048) then raise exception using errcode='22023',message='payment_history_local_record_invalid';end if;
  n:=n+1;
 end loop;
 return n;
end;$$;
revoke all on function app_private.payment_history_local_page_v2(text) from public,anon,authenticated,service_role;

create function app_private.payment_history_local_prepare_v2(p_shop uuid,p_device uuid,p jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare r public.payment_history_runtime;c public.payment_history_local_writer_contexts;
 prior public.payment_history_local_publications;op uuid;begin
 if not app_private.payment_history_local_keys_v2(p,array['operation_id','kind','local_dataset_id','restore_epoch','restore_lineage_id','base_revision','writer_epoch','request_fingerprint','content_digest','page_count','protocol_version'])
  or p->>'protocol_version' is distinct from '2' or jsonb_typeof(p->'protocol_version') is distinct from 'number'
  or coalesce(p->>'kind','') not in('Apply','Undo') or jsonb_typeof(p->'local_dataset_id') is distinct from 'string' or length(coalesce(p->>'local_dataset_id','')) not between 1 and 256
  or coalesce(p->>'request_fingerprint','') !~ '^[0-9a-f]{64}$' or coalesce(p->>'content_digest','') !~ '^[0-9a-f]{64}$'
  or jsonb_typeof(p->'page_count') is distinct from 'number' or coalesce(p->>'page_count','') !~ '^[1-9][0-9]{0,4}$' or (p->>'page_count')::integer>20000
  or exists(select 1 from unnest(array['base_revision','restore_epoch','writer_epoch']) k where jsonb_typeof(p->k) is distinct from 'string' or coalesce(p->>k,'') !~ '^(0|[1-9][0-9]{0,18})$') then
  raise exception using errcode='22023',message='payment_history_local_request_invalid';end if;
 op:=(p->>'operation_id')::uuid;
 if op is null or (p->>'restore_lineage_id')::uuid is null then raise exception using errcode='22023',message='payment_history_local_request_invalid';end if;
 select * into r from public.payment_history_runtime where shop_id=p_shop for share;
 if not found or r.writer_authority<>'local' or r.writer_epoch is distinct from (p->>'writer_epoch')::bigint then raise exception using errcode='40001',message='payment_history_local_writer_closed';end if;
 select * into c from public.payment_history_local_writer_contexts where shop_id=p_shop and shop_device_id=p_device for share;
 if not found or c.source_snapshot_id is null or c.local_dataset_id is distinct from p->>'local_dataset_id'
  or c.restore_lineage_id is distinct from (p->>'restore_lineage_id')::uuid or c.restore_epoch>(p->>'restore_epoch')::bigint or c.local_revision>(p->>'base_revision')::bigint
  or not exists(select 1 from public.payment_history_source_snapshots s join public.payment_history_migration_runs m on m.shop_id=s.shop_id and m.run_id=s.run_id
   join public.payment_history_uploads u on u.shop_id=m.shop_id and u.upload_id=m.source_upload_id
   where s.shop_id=p_shop and s.snapshot_id=c.source_snapshot_id and s.shop_device_id=p_device and s.local_dataset_id=c.local_dataset_id
    and m.state='applied' and u.state='verified' and u.file_sha256=s.archive_sha256 and s.data_revision<=c.local_revision and s.restore_epoch<=c.restore_epoch) then
  raise exception using errcode='40001',message='payment_history_local_context_unverified';end if;
 perform pg_advisory_xact_lock(hashtextextended('history-local-prepare:'||p_shop::text||':'||p_device::text,0));
 select * into prior from public.payment_history_local_publications where operation_id=op for update;
 if found then
  if row(prior.shop_id,prior.shop_device_id,prior.server_dataset_id,prior.local_dataset_id,prior.restore_lineage_id,prior.restore_epoch,prior.writer_epoch,prior.operation_kind,prior.request_fingerprint,prior.content_digest,prior.protocol_version,prior.base_revision,prior.page_count)
   is distinct from row(p_shop,p_device,r.dataset_id,p->>'local_dataset_id',(p->>'restore_lineage_id')::uuid,(p->>'restore_epoch')::bigint,r.writer_epoch,p->>'kind',p->>'request_fingerprint',p->>'content_digest',2,(p->>'base_revision')::bigint,(p->>'page_count')::integer) then
   raise exception using errcode='23505',message='payment_history_local_identity_conflict';end if;
  if prior.state<>'preparing' then raise exception using errcode='40001',message='payment_history_local_decision_exists';end if;
 else
  if (select count(*) from public.payment_history_local_publications where shop_id=p_shop and shop_device_id=p_device and state='preparing')>=4 then raise exception using errcode='54000',message='payment_history_local_preparation_capacity';end if;
  insert into public.payment_history_local_publications(operation_id,shop_id,shop_device_id,server_dataset_id,local_dataset_id,restore_lineage_id,restore_epoch,writer_epoch,operation_kind,request_fingerprint,content_digest,protocol_version,base_revision,page_count)
   values(op,p_shop,p_device,r.dataset_id,p->>'local_dataset_id',(p->>'restore_lineage_id')::uuid,(p->>'restore_epoch')::bigint,r.writer_epoch,p->>'kind',p->>'request_fingerprint',p->>'content_digest',2,(p->>'base_revision')::bigint,(p->>'page_count')::integer) returning * into prior;
 end if;
 return jsonb_build_object('state','preparing','operation_id',op,'content_digest',prior.content_digest,'next_ordinal',prior.staged_pages+1,'page_count',prior.page_count);
end;$$;
revoke all on function app_private.payment_history_local_prepare_v2(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function app_private.payment_history_local_stage_v2(p_shop uuid,p_device uuid,p jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare r public.payment_history_runtime;prior public.payment_history_local_publications;
 page public.payment_history_local_publication_pages;raw text;sha text;v_ordinal integer;header jsonb;begin
 if not app_private.payment_history_local_keys_v2(p,array['operation_id','content_digest','ordinal','page_json','page_sha256'])
  or jsonb_typeof(p->'ordinal') is distinct from 'number' or coalesce(p->>'ordinal','') !~ '^[1-9][0-9]{0,4}$' or (p->>'ordinal')::integer>20000
  or jsonb_typeof(p->'page_json') is distinct from 'string' or coalesce(p->>'content_digest','') !~ '^[0-9a-f]{64}$' or coalesce(p->>'page_sha256','') !~ '^[0-9a-f]{64}$' then
  raise exception using errcode='22023',message='payment_history_local_request_invalid';end if;
 select * into r from public.payment_history_runtime where shop_id=p_shop for share;
 if not found or r.writer_authority<>'local' then raise exception using errcode='40001',message='payment_history_local_writer_closed';end if;
 select * into prior from public.payment_history_local_publications where shop_id=p_shop and shop_device_id=p_device and operation_id=(p->>'operation_id')::uuid for update;
 if not found or prior.server_dataset_id<>r.dataset_id or prior.writer_epoch<>r.writer_epoch or prior.content_digest is distinct from p->>'content_digest'
  or prior.state<>'preparing' then raise exception using errcode='40001',message='payment_history_local_preparation_stale';end if;
 raw:=p->>'page_json';v_ordinal:=(p->>'ordinal')::integer;sha:=encode(extensions.digest(convert_to(raw,'UTF8'),'sha256'),'hex');
 if sha is distinct from p->>'page_sha256' then raise exception using errcode='22023',message='payment_history_local_page_digest_invalid';end if;
 perform app_private.payment_history_local_page_v2(raw);
 if v_ordinal=1 then
  header:=raw::jsonb->0;
  if header->>'kind' is distinct from 'operation' or row(header#>>'{fields,protocol_version}',(header#>>'{fields,operation_id}')::uuid,header#>>'{fields,operation_kind}',(header#>>'{fields,shop_id}')::uuid,(header#>>'{fields,device_id}')::uuid,header#>>'{fields,local_dataset_id}',header#>>'{fields,restore_epoch}',(header#>>'{fields,restore_lineage_id}')::uuid,header#>>'{fields,base_revision}',header#>>'{fields,request_fingerprint}')
   is distinct from row('2',prior.operation_id,prior.operation_kind,p_shop,p_device,prior.local_dataset_id,prior.restore_epoch::text,prior.restore_lineage_id,prior.base_revision::text,prior.request_fingerprint) then raise exception using errcode='22023',message='payment_history_local_header_mismatch';end if;
 end if;
 if exists(select 1 from jsonb_array_elements(raw::jsonb) with ordinality x(v,n) where v->>'kind'='operation' and (v_ordinal<>1 or n<>1)) then raise exception using errcode='22023',message='payment_history_local_header_mismatch';end if;
 select * into page from public.payment_history_local_publication_pages where operation_id=prior.operation_id and ordinal=v_ordinal;
 if found then
  if page.page_json is distinct from raw or page.page_sha256 is distinct from sha then raise exception using errcode='23505',message='payment_history_local_page_conflict';end if;
 else
  if v_ordinal<>prior.staged_pages+1 or v_ordinal>prior.page_count then raise exception using errcode='40001',message='payment_history_local_page_out_of_order';end if;
  if prior.staged_bytes+octet_length(raw)>268435456 then raise exception using errcode='54000',message='payment_history_local_preparation_capacity';end if;
  insert into public.payment_history_local_publication_pages values(p_shop,prior.operation_id,v_ordinal,raw,sha);
  update public.payment_history_local_publications set staged_pages=staged_pages+1,staged_bytes=staged_bytes+octet_length(raw) where operation_id=prior.operation_id returning * into prior;
 end if;
 if prior.staged_pages=prior.page_count and prior.content_digest is distinct from (
  select encode(extensions.digest(convert_to(string_agg(page_sha256||chr(10),'' order by ordinal),'UTF8'),'sha256'),'hex') from public.payment_history_local_publication_pages where operation_id=prior.operation_id) then
  raise exception using errcode='22023',message='payment_history_local_content_digest_invalid';end if;
 return jsonb_build_object('state','preparing','operation_id',prior.operation_id,'content_digest',prior.content_digest,'next_ordinal',prior.staged_pages+1);
end;$$;
revoke all on function app_private.payment_history_local_stage_v2(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
