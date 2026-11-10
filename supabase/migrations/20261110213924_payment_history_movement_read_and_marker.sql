-- Reuse the existing global revision poll for staff without turning
-- a read-only marker check into an audit write every three seconds.
create or replace function public.staff_web_mobile_operations_read_v1(
 p_shop_id uuid,p_staff_id uuid,p_staff_web_session_id uuid,p_session_token_hash text,
 p_expected_credential_version integer,p_operation text,p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 v_permission text;v_owner uuid;v_mapping jsonb;v_sync jsonb;v_sessions jsonb:='[]';v_devices jsonb:='[]';v_staff jsonb:='[]';v_profiles jsonb:='[]';
 v_page integer:=1;v_size integer:=10;v_total bigint:=0;v_month date;v_query text;v_status text;v_id text;v_kind text;v_record record;v_row jsonb;v_bytes bigint:=0;
begin
 if p_shop_id is null or p_staff_id is null or p_staff_web_session_id is null or p_session_token_hash is null
 or p_session_token_hash !~ '^sha256:[0-9a-f]{64}$' or coalesce(p_expected_credential_version,0)<1 then return jsonb_build_object('ok',false,'code','permission_denied');end if;
 if p_operation is null or p_operation not in ('devices','history_list','history_detail','sync','marker') or p_payload is null
 or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>2048 then return jsonb_build_object('ok',false,'code','validation_failed');end if;
 v_permission:=case when p_operation='devices' then 'devices.read' else 'history.read' end;
 if not app_private.staff_web_runtime_lease_is_valid_v1(p_shop_id,p_staff_id,p_staff_web_session_id,p_session_token_hash,p_expected_credential_version,v_permission) then return jsonb_build_object('ok',false,'code','permission_denied');end if;
 if exists(select 1 from public.shop_inventory_sources where shop_id=p_shop_id and disabled_at is null and
 (source_kind<>'mobile_owner' or mapping_state<>'mapped' or owner_user_id is null or verified_at is null)) then
 return jsonb_build_object('ok',false,'code','scope_unresolved');end if;
 -- Hold existing source bindings through publication; never accept an owner from the request.
 perform 1 from public.shop_inventory_sources where shop_id=p_shop_id and disabled_at is null for share;
 select owner_user_id,jsonb_build_object('shop_inventory_source_id',shop_inventory_source_id,'owner_user_id',owner_user_id,'mapping_state',mapping_state,'source_kind',source_kind)
 into v_owner,v_mapping from public.shop_inventory_sources where shop_id=p_shop_id and source_kind='mobile_owner' and mapping_state='mapped' and verified_at is not null and disabled_at is null order by created_at desc limit 1;
 if p_operation='history_list' then
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('page','pageSize','month','query','status'))
   or coalesce(p_payload->>'page','') !~ '^[1-9][0-9]{0,4}$' or coalesce(p_payload->>'pageSize','') not in ('10','25','50','100','200')
   or coalesce(p_payload->>'status','') not in ('active_issues','active','all','deleted','issues','technical')
   or (coalesce(p_payload->>'month','')<>'' and (p_payload->>'month') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$') then return jsonb_build_object('ok',false,'code','validation_failed');end if;
  v_page:=(p_payload->>'page')::integer;v_size:=(p_payload->>'pageSize')::integer;v_query:=coalesce(p_payload->>'query','');v_status:=p_payload->>'status';
  if coalesce(p_payload->>'month','')<>'' then v_month:=(p_payload->>'month'||'-01')::date;end if;
 elsif p_operation='history_detail' then
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('kind','id')) or coalesce(p_payload->>'kind','') not in ('shared_sheet_session','sync_event')
  or length(coalesce(p_payload->>'id','')) not between 1 and 256 then return jsonb_build_object('ok',false,'code','validation_failed');end if;
  v_kind:=p_payload->>'kind';v_id:=p_payload->>'id';v_size:=1;
 elsif p_payload<>'{}'::jsonb then return jsonb_build_object('ok',false,'code','validation_failed');end if;
 v_sync:=public.admin_sync_event_read_v1(p_shop_id,null,case when p_operation='history_list' then array['history'] else null end,
 case when p_operation='history_detail' and v_kind='sync_event' then v_id else null end,case when p_operation='history_list' then 160 when p_operation='history_detail' and v_kind='sync_event' then 1 when p_operation='sync' then 25 when p_operation='marker' then 1 else 100 end);
 if p_operation='devices' then
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into v_devices from (select shop_device_id,shop_id,device_identifier,device_type,display_name,app_version,status,last_seen_at,last_seen_principal_kind,last_seen_profile_id,last_seen_staff_id,metadata_redacted,reactivated_at,revoked_at,created_at,updated_at from public.shop_devices where shop_id=p_shop_id order by updated_at desc,shop_device_id limit 100) r;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into v_staff from (select staff_id,staff_code,display_name from public.staff_accounts_safe where shop_id=p_shop_id order by staff_id limit 200) r;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into v_profiles from (select distinct p.profile_id,p.display_name from public.profiles p join public.shop_members m on m.profile_id=p.profile_id where m.shop_id=p_shop_id order by p.profile_id limit 200) r;
 elsif p_operation='history_list' or (p_operation='history_detail' and v_kind='shared_sheet_session') then
  select count(*) into v_total from public.shared_sheet_sessions s where ((s.shop_id=p_shop_id) or (s.shop_id is null and s.owner_user_id=v_owner and not exists(select 1 from public.shared_sheet_sessions own where own.shop_id=p_shop_id and own.remote_id=s.remote_id)))
 and (p_operation<>'history_detail' or s.remote_id=v_id)
 and (p_operation<>'history_list' or ((v_status='all' or (v_status='deleted' and s.deleted_at is not null) or (v_status not in ('all','deleted') and s.deleted_at is null))
 and (v_month is null or (s.timestamp>=v_month::text||'T00:00:00.000Z' and s.timestamp<(v_month+interval '1 month')::date::text||'T00:00:00.000Z'))
 and (v_query='' or position(lower(v_query) in lower(coalesce(s.remote_id,'')||' '||coalesce(s.display_name,'')||' '||coalesce(s.supplier,'')||' '||coalesce(s.category,'')))>0)
 and (v_status<>'issues' or exists(select 1 from public.shared_sheet_session_diagnostics d where d.remote_id=s.remote_id and d.shop_id is not distinct from s.shop_id and d.owner_user_id=s.owner_user_id and (d.missing_count>0 or d.overlay_status<>'ok')))));
  for v_record in select s.remote_id,s.shop_id,s.owner_user_id,s.display_name,s.supplier,s.category,s.timestamp,s.updated_at,s.deleted_at,s.payload_version,s.data,s.session_overlay,s.is_manual_entry,
  case when s.shop_id=p_shop_id then 'shop_scoped' else 'legacy_owner_bridge' end as "sourceScope"
  from public.shared_sheet_sessions s where ((s.shop_id=p_shop_id) or (s.shop_id is null and s.owner_user_id=v_owner and not exists(select 1 from public.shared_sheet_sessions own where own.shop_id=p_shop_id and own.remote_id=s.remote_id)))
 and (p_operation<>'history_detail' or s.remote_id=v_id)
 and (p_operation<>'history_list' or ((v_status='all' or (v_status='deleted' and s.deleted_at is not null) or (v_status not in ('all','deleted') and s.deleted_at is null))
 and (v_month is null or (s.timestamp>=v_month::text||'T00:00:00.000Z' and s.timestamp<(v_month+interval '1 month')::date::text||'T00:00:00.000Z'))
 and (v_query='' or position(lower(v_query) in lower(coalesce(s.remote_id,'')||' '||coalesce(s.display_name,'')||' '||coalesce(s.supplier,'')||' '||coalesce(s.category,'')))>0)
 and (v_status<>'issues' or exists(select 1 from public.shared_sheet_session_diagnostics d where d.remote_id=s.remote_id and d.shop_id is not distinct from s.shop_id and d.owner_user_id=s.owner_user_id and (d.missing_count>0 or d.overlay_status<>'ok'))))) order by s.timestamp desc,s.remote_id limit v_size offset ((v_page-1)*v_size) loop
   v_row:=to_jsonb(v_record);v_bytes:=v_bytes+octet_length(v_row::text);
   if octet_length(v_row::text)>1048576 or v_bytes>3000000 then return jsonb_build_object('ok',false,'code','data_limit_exceeded');end if;
   v_sessions:=v_sessions||jsonb_build_array(v_row);
  end loop;
 end if;
 if octet_length(v_sync::text)+v_bytes+octet_length(v_devices::text)+octet_length(v_staff::text)+octet_length(v_profiles::text)>4000000 then return jsonb_build_object('ok',false,'code','data_limit_exceeded');end if;
 if not app_private.staff_web_runtime_lease_is_valid_v1(p_shop_id,p_staff_id,p_staff_web_session_id,p_session_token_hash,p_expected_credential_version,v_permission)
 or not app_private.staff_web_runtime_lease_publishable_v1() then return jsonb_build_object('ok',false,'code','permission_denied');end if;
 if p_operation<>'marker' then
 perform app_private.write_staff_shop_admin_audit(p_staff_id,p_shop_id,'shop.mobile_operations.staff_read','info','success','shop',p_shop_id::text,'success',jsonb_build_object('operation',p_operation));
 end if;
 if not app_private.staff_web_runtime_lease_publishable_v1() then raise exception using errcode='42501',message='staff_read_expired_before_publication';end if;
 return jsonb_build_object('ok',true,'code','success','shop_id',p_shop_id,'actor_staff_id',p_staff_id,'staff_web_session_id',p_staff_web_session_id,'credential_version',p_expected_credential_version,'operation',p_operation,
 'mapping',v_mapping,'sync',v_sync,'sessions',v_sessions,'total_count',v_total,'page',v_page,'page_size',v_size,'devices',v_devices,'staff',v_staff,'profiles',v_profiles);
exception when datetime_field_overflow or invalid_datetime_format or invalid_text_representation then return jsonb_build_object('ok',false,'code','validation_failed');
end;$$;

create index payment_history_movement_clock_cursor_idx on public.payment_history_movement_versions(shop_id,business_ticks desc,movement_version_id desc);

create function public.payment_history_movements_v1(p_shop_id uuid,p_operation text,p_payload jsonb,
 p_staff_id uuid default null,p_staff_web_session_id uuid default null,p_session_token_hash text default null,p_credential_version integer default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor jsonb;r public.payment_history_runtime;from_date date;to_date date;include_inactive boolean;page_size integer;
 after_ticks bigint;after_id uuid;v_rows jsonb;v_next jsonb;v_totals jsonb;v_has_more boolean;result jsonb;
begin
 if p_operation is null or p_operation not in('read','export') then raise exception using errcode='42501',message='payment_history_operation_denied';end if;
 actor:=app_private.payment_history_demand_actor_v1(p_shop_id,case when p_operation='export' then 'export' else 'read' end,p_staff_id,p_staff_web_session_id,p_session_token_hash,p_credential_version);
 if not app_private.payment_history_local_keys_v2(p_payload,array['from_date','to_date','include_inactive','page_size','after'])
  or jsonb_typeof(p_payload->'include_inactive') is distinct from 'boolean' or jsonb_typeof(p_payload->'page_size') is distinct from 'number'
  or coalesce(p_payload->>'page_size','') !~ '^[1-9][0-9]{0,2}$' or (p_payload->>'page_size')::integer>200
  or exists(select 1 from unnest(array['from_date','to_date']) k where p_payload->k<>'null'::jsonb
    and (jsonb_typeof(p_payload->k) is distinct from 'string' or coalesce(p_payload->>k,'') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$')) then
  raise exception using errcode='22023',message='payment_history_view_input_invalid';end if;
 from_date:=(p_payload->>'from_date')::date;to_date:=(p_payload->>'to_date')::date;
 if from_date>to_date or from_date<date '0001-01-01' or to_date>date '9999-12-31'
  or from_date is not null and to_char(from_date,'YYYY-MM-DD') is distinct from p_payload->>'from_date'
  or to_date is not null and to_char(to_date,'YYYY-MM-DD') is distinct from p_payload->>'to_date' then raise exception using errcode='22023',message='payment_history_view_input_invalid';end if;
 include_inactive:=(p_payload->>'include_inactive')::boolean;page_size:=(p_payload->>'page_size')::integer;
 select * into r from public.payment_history_runtime where shop_id=p_shop_id for share;
 if p_payload->'after'<>'null'::jsonb then
  if not app_private.payment_history_local_keys_v2(p_payload->'after',array['dataset_id','revision','business_ticks','id','query_key'])
   or exists(select 1 from unnest(array['dataset_id','revision','business_ticks','id','query_key']) k where jsonb_typeof(p_payload->'after'->k) is distinct from 'string')
   or p_payload#>>'{after,query_key}' is distinct from (coalesce(p_payload->>'from_date','*')||'/'||coalesce(p_payload->>'to_date','*')||'/'||case when include_inactive then 'all' else 'active' end)
   or coalesce(p_payload#>>'{after,revision}','') !~ '^(0|[1-9][0-9]{0,18})$'
   or coalesce(p_payload#>>'{after,business_ticks}','') !~ '^(0|[1-9][0-9]{0,18})$' then raise exception using errcode='22023',message='payment_history_view_cursor_invalid';end if;
  after_ticks:=(p_payload#>>'{after,business_ticks}')::bigint;after_id:=(p_payload#>>'{after,id}')::uuid;
  if after_ticks>3155378975999999999 or after_id is null then raise exception using errcode='22023',message='payment_history_view_cursor_invalid';end if;
  if r.shop_id is null or (p_payload#>>'{after,dataset_id}')::uuid is distinct from r.dataset_id or (p_payload#>>'{after,revision}')::bigint is distinct from r.revision then
   raise exception using errcode='40001',message='payment_history_view_changed';end if;
 end if;
 select jsonb_build_object('matched_count',count(*)::text,'active_count',count(*) filter(where v.active)::text,'inactive_count',count(*) filter(where not v.active)::text,
  'signed_active_gross_clp',sum(v.gross_clp) filter(where v.active)::text,'known_active_net_clp',sum(v.net_clp) filter(where v.active and v.net_clp is not null)::text,
  'known_active_net_count',count(*) filter(where v.active and v.net_clp is not null)::text)
 into v_totals from public.payment_history_movement_versions v where v.shop_id=p_shop_id and (include_inactive or v.active)
  and (from_date is null or v.business_date>=from_date) and (to_date is null or v.business_date<=to_date);
 with candidates as materialized(
  select v.* from public.payment_history_movement_versions v where v.shop_id=p_shop_id and (include_inactive or v.active)
   and (from_date is null or v.business_date>=from_date) and (to_date is null or v.business_date<=to_date)
   and (after_id is null or (v.business_ticks,v.movement_version_id)<(after_ticks,after_id))
   order by v.business_ticks desc,v.movement_version_id desc limit page_size+1
 ), page as materialized(select * from candidates order by business_ticks desc,movement_version_id desc limit page_size)
 select coalesce(jsonb_agg(jsonb_build_object('id',v.movement_version_id,'merchant_id',v.merchant_id,'merchant_label',m.label,'batch_id',v.owner_batch_id,
  'batch_origin',b.origin,'batch_state',b.state,'active',v.active,'business_ticks',v.business_ticks::text,'business_datetime',app_private.payment_history_clock_from_ticks_v2(v.business_ticks::text),
  'gross_clp',v.gross_clp::text,'fee_clp',v.commission_clp::text,'fee_vat_clp',v.commission_vat_clp::text,'net_clp',v.net_clp::text,
  'movement_kind',v.movement_kind,'transaction_state',v.transaction_state,'external_namespace',v.external_namespace,'external_id',v.external_id,
  'source_sheet',v.source_sheet,'source_row',v.source_row::text,'source_sha256',v.transaction#>>'{source,fileSha256}',
  'timestamp_raw',v.transaction#>>'{timestamp,rawTimestamp}','offset_minutes',v.transaction#>>'{timestamp,offsetMinutes}','occurred_at_utc',v.transaction#>>'{timestamp,occurredAtUtc}',
  'time_interpretation',v.transaction#>>'{timestamp,interpretation}','time_policy_version',v.transaction#>>'{timestamp,policyVersion}','time_evidence_reference',v.transaction#>>'{timestamp,evidenceReference}',
  'created_revision',v.created_revision::text) order by v.business_ticks desc,v.movement_version_id desc),'[]'),
  (select count(*)>page_size from candidates),
  (select jsonb_build_object('dataset_id',r.dataset_id,'revision',r.revision::text,'business_ticks',last.business_ticks::text,'id',last.movement_version_id,
    'query_key',coalesce(p_payload->>'from_date','*')||'/'||coalesce(p_payload->>'to_date','*')||'/'||case when include_inactive then 'all' else 'active' end)
    from page last order by last.business_ticks,last.movement_version_id limit 1)
 into v_rows,v_has_more,v_next from page v join public.payment_history_merchants m on m.shop_id=v.shop_id and m.merchant_id=v.merchant_id
  join public.payment_history_batches b on b.shop_id=v.shop_id and b.batch_id=v.owner_batch_id;
 result:=jsonb_build_object('configured',r.shop_id is not null,'coverage','observed_records_only','dataset_id',r.dataset_id,'revision',r.revision::text,
  'writer_epoch',r.writer_epoch::text,'writer_authority',r.writer_authority,'from_date',p_payload->'from_date','to_date',p_payload->'to_date',
  'include_inactive',include_inactive,'totals',v_totals,'rows',v_rows,'next',case when v_has_more then v_next else null end);
 perform app_private.payment_history_demand_actor_v1(p_shop_id,case when p_operation='export' then 'export' else 'read' end,p_staff_id,p_staff_web_session_id,p_session_token_hash,p_credential_version);
 if not app_private.payment_history_publishable_v1() then raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 if octet_length(result::text)>4194304 then raise exception using errcode='54000',message='payment_history_view_capacity';end if;
 return jsonb_build_object('ok',true,'shop_id',p_shop_id,'actor',actor,'result',result);
end;$$;
revoke all on function public.payment_history_movements_v1(uuid,text,jsonb,uuid,uuid,text,integer) from public,anon;
grant execute on function public.payment_history_movements_v1(uuid,text,jsonb,uuid,uuid,text,integer) to authenticated,service_role;
