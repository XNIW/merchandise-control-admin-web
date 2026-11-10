-- Keep catalog-only and sync-only roles live without granting financial access.
-- Same global poll, source scope, nominal staff lease and audit policy.

create or replace function public.staff_web_mobile_operations_read_v1(
 p_shop_id uuid,p_staff_id uuid,p_staff_web_session_id uuid,p_session_token_hash text,
 p_expected_credential_version integer,p_operation text,p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 v_permission text;v_owner uuid;v_mapping jsonb;v_sync jsonb;v_sessions jsonb:='[]';v_devices jsonb:='[]';v_staff jsonb:='[]';v_profiles jsonb:='[]';
 v_page integer:=1;v_size integer:=10;v_total bigint:=0;v_month date;v_query text;v_status text;v_id text;v_kind text;v_record record;v_row jsonb;v_bytes bigint:=0;v_marker_catalog boolean:=false;v_marker_history boolean:=false;v_domains text[];v_key text;
begin
 if p_shop_id is null or p_staff_id is null or p_staff_web_session_id is null or p_session_token_hash is null
 or p_session_token_hash !~ '^sha256:[0-9a-f]{64}$' or coalesce(p_expected_credential_version,0)<1 then return jsonb_build_object('ok',false,'code','permission_denied');end if;
 if p_operation is null or p_operation not in ('devices','history_list','history_detail','sync','marker') or p_payload is null
 or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>2048 then return jsonb_build_object('ok',false,'code','validation_failed');end if;
 if p_operation='marker' then
  if not app_private.staff_web_runtime_lease_is_valid_v1(p_shop_id,p_staff_id,p_staff_web_session_id,p_session_token_hash,p_expected_credential_version,null) then return jsonb_build_object('ok',false,'code','permission_denied');end if;
  -- Resolve actual permission rows under the same lease; browser choices do
  -- not select domains. Keep the granted rows locked through publication.
  for v_key in select p.permission_key from public.staff_role_permissions p join public.staff_accounts a on a.shop_id=p.shop_id and a.role_key=p.role_key
   where a.shop_id=p_shop_id and a.staff_id=p_staff_id and p.enabled and p.permission_key in('shop_admin.full_access','catalog.read','sync.read') order by p.permission_key for share of p loop
   v_marker_catalog:=v_marker_catalog or v_key in('shop_admin.full_access','catalog.read');
   v_marker_history:=v_marker_history or v_key in('shop_admin.full_access','sync.read');
  end loop;
  if not v_marker_catalog and not v_marker_history then return jsonb_build_object('ok',false,'code','permission_denied');end if;
  v_domains:=(case when v_marker_catalog then array['catalog','prices'] else array[]::text[] end)||(case when v_marker_history then array['history'] else array[]::text[] end);
  v_permission:=case when v_marker_catalog then 'catalog.read' else 'sync.read' end;
 else
  -- history.read is the UI action alias; its persisted staff grant is sync.read.
  v_permission:=case when p_operation='devices' then 'devices.read' else 'sync.read' end;
  if not app_private.staff_web_runtime_lease_is_valid_v1(p_shop_id,p_staff_id,p_staff_web_session_id,p_session_token_hash,p_expected_credential_version,v_permission) then return jsonb_build_object('ok',false,'code','permission_denied');end if;
 end if;
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
 v_sync:=public.admin_sync_event_read_v1(p_shop_id,null,case when p_operation='marker' then v_domains when p_operation='history_list' then array['history'] else null end,
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
 'mapping',v_mapping,'sync',v_sync,'sessions',v_sessions,'total_count',v_total,'page',v_page,'page_size',v_size,'devices',v_devices,'staff',v_staff,'profiles',v_profiles)||case when p_operation='marker' then jsonb_build_object('marker_domains',v_domains) else '{}'::jsonb end;
exception when datetime_field_overflow or invalid_datetime_format or invalid_text_representation then return jsonb_build_object('ok',false,'code','validation_failed');
end;$$;
