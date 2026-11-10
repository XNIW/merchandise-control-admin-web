-- ASUS019 B3: bounded read operations, never a browser table-query facade.
create function public.staff_web_operations_read_v1(
 p_shop_id uuid,p_staff_id uuid,p_staff_web_session_id uuid,p_session_token_hash text,
 p_expected_credential_version integer,p_operation text,p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 v_permission text; v_rows jsonb:='{}'::jsonb; v_events jsonb; v_month date; v_year integer; v_today date;
begin
 if p_shop_id is null or p_staff_id is null or p_staff_web_session_id is null
 or p_session_token_hash is null or p_session_token_hash !~ '^sha256:[0-9a-f]{64}$'
 or coalesce(p_expected_credential_version,0)<1 then
  return jsonb_build_object('ok',false,'code','permission_denied');
 end if;
 if p_operation is null or p_operation not in ('audit_list','audit_detail','pos_live','pos_revenue')
 or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>2048 then
  return jsonb_build_object('ok',false,'code','validation_failed');
 end if;
 if exists(select 1 from jsonb_each(p_payload) e where jsonb_typeof(e.value)<>'string') then
  return jsonb_build_object('ok',false,'code','validation_failed');
 end if;
 v_permission:=case when p_operation in ('audit_list','audit_detail') then 'audit.read' else 'pos.dashboard.read' end;
 if not app_private.staff_web_runtime_lease_is_valid_v1(p_shop_id,p_staff_id,p_staff_web_session_id,p_session_token_hash,p_expected_credential_version,v_permission) then
  return jsonb_build_object('ok',false,'code','permission_denied');
 end if;
 if p_operation in ('audit_list','audit_detail') then
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('eventQuery','result','severity','targetId','eventId'))
   or (p_payload ? 'eventId' and coalesce(p_payload->>'eventId','') !~ '^[0-9a-fA-F-]{36}$') then
   return jsonb_build_object('ok',false,'code','validation_failed');
  end if;
  if p_operation='audit_detail' and not (p_payload ? 'eventId') then
   return jsonb_build_object('ok',false,'code','validation_failed');
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.audit_log_id),'[]'::jsonb) into v_events from (
   select audit_log_id,actor_profile_id,actor_staff_id,scope,shop_id,event_key,severity,result,target_type,target_id,metadata_redacted,created_at
   from public.audit_logs where shop_id=p_shop_id and scope='shop'
    and (not (p_payload ? 'eventId') or audit_log_id=(p_payload->>'eventId')::uuid)
    and (coalesce(p_payload->>'eventQuery','')='' or position(p_payload->>'eventQuery' in event_key)>0)
    and (coalesce(p_payload->>'result','')='' or result=p_payload->>'result')
    and (coalesce(p_payload->>'severity','')='' or severity=p_payload->>'severity')
    and (coalesce(p_payload->>'targetId','')='' or target_id=p_payload->>'targetId')
   order by created_at desc,audit_log_id limit 100
  ) r;
  v_rows:=jsonb_build_object('events',v_events);
 elsif p_operation='pos_live' then
  if p_payload<>'{}'::jsonb then return jsonb_build_object('ok',false,'code','validation_failed'); end if;
  v_rows:=v_rows||jsonb_build_object('devices',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select shop_device_id,shop_id,device_identifier,device_type,display_name,app_version,status,last_seen_at,revoked_at,created_at,updated_at from public.shop_devices where shop_id=p_shop_id and device_type='pos' order by updated_at desc limit 100) r));
  v_rows:=v_rows||jsonb_build_object('credentials',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select pos_device_credential_id,shop_id,shop_device_id,staff_id,status,staff_credential_version,issued_at,last_used_at,expires_at,revoked_at,updated_at from public.pos_device_credentials where shop_id=p_shop_id  order by updated_at desc limit 200) r));
  v_rows:=v_rows||jsonb_build_object('sessions',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select pos_session_id,shop_id,shop_device_id,staff_id,pos_device_credential_id,status,staff_credential_version,issued_at,expires_at,last_seen_at,heartbeat_count,revoked_at,updated_at from public.pos_sessions where shop_id=p_shop_id  order by updated_at desc limit 200) r));
  v_rows:=v_rows||jsonb_build_object('staff',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select staff_id,staff_code,display_name,role_key,status,credential_status,locked_until from public.staff_accounts_safe where shop_id=p_shop_id  order by staff_id limit 200) r));
  v_rows:=v_rows||jsonb_build_object('events',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select audit_log_id,event_key,severity,result,target_type,target_id,created_at,metadata_redacted from public.audit_logs where shop_id=p_shop_id and scope='shop' and event_key like 'pos.%' order by created_at desc limit 100) r));
 elsif p_operation='pos_revenue' then
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('month','year','today'))
    or coalesce(p_payload->>'month','') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    or coalesce(p_payload->>'year','') !~ '^[0-9]{4}$'
    or coalesce(p_payload->>'today','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
   return jsonb_build_object('ok',false,'code','validation_failed');
  end if;
  v_month:=(p_payload->>'month'||'-01')::date;v_year:=(p_payload->>'year')::integer;v_today:=(p_payload->>'today')::date;
  if v_year<1900 or v_year>9998 or v_month<date '1900-01-01' or v_month>=date '9999-01-01' then
   return jsonb_build_object('ok',false,'code','validation_failed');
  end if;
  v_rows:=v_rows||jsonb_build_object('today',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select shop_id,business_date,card_received_clp,cash_received_clp,change_given_clp,documented_revenue_clp,latest_ledger_at,net_revenue_clp,other_received_clp,refund_count,sale_count,stock_warning_count,transaction_count,transfer_received_clp,verification_revenue_clp,void_count from public.pos_revenue_daily_summary_v where shop_id=p_shop_id and business_date=v_today order by business_date limit 1) r));
  v_rows:=v_rows||jsonb_build_object('month',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select shop_id,business_date,card_received_clp,cash_received_clp,change_given_clp,documented_revenue_clp,latest_ledger_at,net_revenue_clp,other_received_clp,refund_count,sale_count,stock_warning_count,transaction_count,transfer_received_clp,verification_revenue_clp,void_count from public.pos_revenue_daily_summary_v where shop_id=p_shop_id and business_date>=v_month and business_date<(v_month+interval '1 month')::date order by business_date limit 62) r));
  v_rows:=v_rows||jsonb_build_object('year',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select shop_id,business_date,card_received_clp,cash_received_clp,change_given_clp,documented_revenue_clp,latest_ledger_at,net_revenue_clp,other_received_clp,refund_count,sale_count,stock_warning_count,transaction_count,transfer_received_clp,verification_revenue_clp,void_count from public.pos_revenue_daily_summary_v where shop_id=p_shop_id and business_date>=make_date(v_year,1,1) and business_date<make_date(v_year+1,1,1) order by business_date limit 370) r));
  v_rows:=v_rows||jsonb_build_object('sales',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select pos_sale_id,client_sale_id,sale_number,occurred_at,business_date,total,status,shop_device_id,staff_id,business_kind,client_original_sale_id,fiscal_status,net_amount_clp,stock_sync_status,stock_warning_count from public.pos_sales where shop_id=p_shop_id and status='accepted' order by occurred_at desc limit 50) r));
  v_rows:=v_rows||jsonb_build_object('batches',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select pos_sales_sync_batch_id,client_batch_id,status,sale_count,line_count,shop_device_id,staff_id,received_at,created_at from public.pos_sales_sync_batches where shop_id=p_shop_id  order by created_at desc limit 25) r));
  v_rows:=v_rows||jsonb_build_object('devices',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select shop_device_id,display_name,status,last_seen_at from public.shop_devices where shop_id=p_shop_id and device_type='pos' order by updated_at desc limit 100) r));
  v_rows:=v_rows||jsonb_build_object('staff',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select staff_id,staff_code,display_name,status from public.staff_accounts_safe where shop_id=p_shop_id  order by staff_id limit 200) r));
  v_rows:=v_rows||jsonb_build_object('warnings',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select created_at,issue_code,movement_kind,pos_sale_id,product_id,quantity_delta,status,stock_after,stock_before from public.pos_sale_stock_movements where shop_id=p_shop_id and status in ('unresolved_product','stock_conflict','failed') order by created_at desc limit 50) r));
 end if;
 if not app_private.staff_web_runtime_lease_is_valid_v1(p_shop_id,p_staff_id,p_staff_web_session_id,p_session_token_hash,p_expected_credential_version,v_permission)
 or not app_private.staff_web_runtime_lease_publishable_v1() then return jsonb_build_object('ok',false,'code','permission_denied'); end if;
 perform app_private.write_staff_shop_admin_audit(p_staff_id,p_shop_id,'shop.operations.staff_read','info','success','shop',p_shop_id::text,'success',jsonb_build_object('operation',p_operation));
 if not app_private.staff_web_runtime_lease_publishable_v1() then raise exception using errcode='42501',message='staff_read_expired_before_publication'; end if;
 return jsonb_build_object('ok',true,'code','success','shop_id',p_shop_id,'actor_staff_id',p_staff_id,'staff_web_session_id',p_staff_web_session_id,
 'credential_version',p_expected_credential_version,'operation',p_operation,'rows',v_rows);
exception when datetime_field_overflow or invalid_datetime_format or invalid_text_representation then
 return jsonb_build_object('ok',false,'code','validation_failed');
end;$$;
revoke all on function public.staff_web_operations_read_v1(uuid,uuid,uuid,text,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.staff_web_operations_read_v1(uuid,uuid,uuid,text,integer,text,jsonb) to service_role;
notify pgrst,'reload schema';
