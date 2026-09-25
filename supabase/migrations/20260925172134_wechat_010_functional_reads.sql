-- WECHAT-010 F02/F06: bounded relation lookup, shop-calendar History, explicit read denial.
-- Additive API parameters; no table/data migration or commerce changes.
create or replace function public.wechat_mini_read_v1(
  p_actor_profile_id uuid,
  p_rpc text,
  p_params jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, pg_temp
set statement_timeout = '5s'
as $$
declare
  v_result jsonb;
  v_shop uuid; v_zone text; v_status text; v_role text;
begin
  if p_rpc is null or p_rpc not in ('wechat_account_profile_v1','wechat_authorized_shops_v2','wechat_catalog_history_page_v1','wechat_catalog_lifecycle_page_v2','wechat_catalog_page_v1','wechat_categories_page_v1','wechat_daily_sales_page_v1','wechat_daily_sales_summary_v1','wechat_price_history_page_v1','wechat_product_detail_v1','wechat_sale_detail_v1','wechat_sale_detail_v2','wechat_sales_filter_options_v1','wechat_sales_page_v2','wechat_sales_period_summary_v1','wechat_suppliers_page_v1','wechat_sync_history_page_v1') then
    raise exception 'wechat_mini_read_not_allowed' using errcode='42501';
  end if;
  perform app_private.wechat_mini_assume_actor_v1(p_actor_profile_id);
  if p_params is null or jsonb_typeof(p_params) <> 'object'
    or octet_length(p_params::text) > 16384 then
    raise exception 'wechat_mini_read_invalid' using errcode = '22023';
  end if;

  -- Explicit read denials must never be indistinguishable from an empty shop.
  if p_rpc not in ('wechat_account_profile_v1','wechat_authorized_shops_v2') then
    v_shop := (p_params->>'p_shop_id')::uuid;
    select member.membership_status,member.role_key into v_status,v_role
      from public.shop_members member where member.shop_id=v_shop and member.profile_id=p_actor_profile_id for share;
    if not found or v_status<>'active' then return jsonb_build_object('ok',false,'code','membership_missing'); end if;
    if v_role not in ('shop_owner','shop_manager','viewer') then return jsonb_build_object('ok',false,'code','permission_denied'); end if;
    select shop.shop_status into v_status from public.shops shop where shop.shop_id=v_shop for share;
    if not found or v_status<>'active' then return jsonb_build_object('ok',false,'code','shop_suspended'); end if;
  end if;
  if p_rpc='wechat_catalog_history_page_v1' and (p_params->>'p_from_date' is not null or p_params->>'p_to_date' is not null) then
    if p_params->>'p_from_at' is not null or p_params->>'p_to_at' is not null then raise exception 'mixed_history_dates' using errcode='22023'; end if;
    select coalesce(setting.catalog_time_zone,'America/Santiago') into v_zone from public.storefront_settings setting where setting.shop_id=v_shop;
    v_zone:=coalesce(v_zone,'America/Santiago');
    if p_params->>'p_from_date' is not null then
      p_params:=p_params || jsonb_build_object('p_from_at',((p_params->>'p_from_date')::date::timestamp at time zone v_zone));
    end if;
    if p_params->>'p_to_date' is not null then
      -- PostgreSQL timestamp precision is microseconds. Equivalent to exclusive next local midnight,
      -- including the 23/25-hour day and midnight DST transition in America/Santiago.
      p_params:=p_params || jsonb_build_object('p_to_at',(((p_params->>'p_to_date')::date+1)::timestamp at time zone v_zone)-interval '1 microsecond');
    end if;
  end if;

  case p_rpc
    when 'wechat_account_profile_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_account_profile_v1() row_data;
    when 'wechat_authorized_shops_v2' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_authorized_shops_v2() row_data;
    when 'wechat_catalog_history_page_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_catalog_history_page_v1(
        (p_params->>'p_shop_id')::uuid,
        coalesce((p_params->>'p_limit')::integer, 50),
        p_params->>'p_entity_type', p_params->>'p_operation',
        (p_params->>'p_from_at')::timestamptz,
        (p_params->>'p_to_at')::timestamptz,
        (p_params->>'p_entity_id')::uuid,
        (p_params->>'p_before_created_at')::timestamptz,
        (p_params->>'p_before_audit_log_id')::uuid
      ) row_data;
    when 'wechat_catalog_lifecycle_page_v2' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_catalog_lifecycle_page_v2(
        (p_params->>'p_shop_id')::uuid,
        coalesce(p_params->>'p_entity_type', 'product'),
        coalesce(p_params->>'p_state', 'all'),
        coalesce((p_params->>'p_limit')::integer, 50),
        (p_params->>'p_before_updated_at')::timestamptz,
        (p_params->>'p_before_id')::uuid
      ) row_data;
    when 'wechat_catalog_page_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_catalog_page_v1(
        (p_params->>'p_shop_id')::uuid,
        coalesce((p_params->>'p_limit')::integer, 50),
        p_params->>'p_search', (p_params->>'p_category_id')::uuid,
        (p_params->>'p_supplier_id')::uuid,
        (p_params->>'p_has_image')::boolean,
        coalesce(p_params->>'p_sort', 'updated_desc'),
        (p_params->>'p_cursor_at')::timestamptz,
        p_params->>'p_cursor_text', (p_params->>'p_cursor_id')::uuid
      ) row_data;
    when 'wechat_categories_page_v1' then
      if p_params->>'p_entity_id' is not null then
        select coalesce(jsonb_agg(row_data),'[]'::jsonb) into v_result from (
          select relation.id as category_id,relation.name as category_name,
            (select count(*) from public.inventory_products p where p.shop_id=v_shop and p.category_id=relation.id and p.deleted_at is null) as product_count, relation.updated_at
          from public.inventory_categories relation
          where relation.shop_id=v_shop and relation.id=(p_params->>'p_entity_id')::uuid and relation.deleted_at is null
        ) row_data;
      else
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_categories_page_v1(
        (p_params->>'p_shop_id')::uuid,
        coalesce((p_params->>'p_limit')::integer, 50),
        p_params->>'p_search', p_params->>'p_after_name',
        (p_params->>'p_after_id')::uuid
      ) row_data;
      end if;
    when 'wechat_daily_sales_page_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_daily_sales_page_v1(
        (p_params->>'p_shop_id')::uuid,
        (p_params->>'p_business_date')::date,
        coalesce((p_params->>'p_limit')::integer, 50),
        (p_params->>'p_before_occurred_at')::timestamptz,
        (p_params->>'p_before_sale_id')::uuid
      ) row_data;
    when 'wechat_daily_sales_summary_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_daily_sales_summary_v1(
        (p_params->>'p_shop_id')::uuid,
        (p_params->>'p_business_date')::date
      ) row_data;
    when 'wechat_price_history_page_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_price_history_page_v1(
        (p_params->>'p_shop_id')::uuid,
        (p_params->>'p_product_id')::uuid,
        coalesce((p_params->>'p_limit')::integer, 50),
        p_params->>'p_before_effective_at',
        (p_params->>'p_before_id')::uuid
      ) row_data;
    when 'wechat_product_detail_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_product_detail_v1(
        (p_params->>'p_shop_id')::uuid,
        (p_params->>'p_product_id')::uuid
      ) row_data;
    when 'wechat_sale_detail_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_sale_detail_v1(
        (p_params->>'p_shop_id')::uuid,
        (p_params->>'p_pos_sale_id')::uuid
      ) row_data;
    when 'wechat_sale_detail_v2' then
      v_result := public.wechat_sale_detail_v2(
        (p_params->>'p_shop_id')::uuid,
        (p_params->>'p_pos_sale_id')::uuid
      );
    when 'wechat_sales_filter_options_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_sales_filter_options_v1(
        (p_params->>'p_shop_id')::uuid,
        (p_params->>'p_from_date')::date,
        (p_params->>'p_to_date')::date
      ) row_data;
    when 'wechat_sales_page_v2' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_sales_page_v2(
        (p_params->>'p_shop_id')::uuid,
        (p_params->>'p_from_date')::date,
        (p_params->>'p_to_date')::date,
        coalesce((p_params->>'p_limit')::integer, 50),
        (p_params->>'p_before_occurred_at')::timestamptz,
        (p_params->>'p_before_sale_id')::uuid,
        p_params->>'p_status', p_params->>'p_business_kind',
        p_params->>'p_payment_method', (p_params->>'p_staff_id')::uuid,
        (p_params->>'p_device_id')::uuid, p_params->>'p_sale_number'
      ) row_data;
    when 'wechat_sales_period_summary_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_sales_period_summary_v1(
        (p_params->>'p_shop_id')::uuid,
        (p_params->>'p_from_date')::date,
        (p_params->>'p_to_date')::date
      ) row_data;
    when 'wechat_suppliers_page_v1' then
      if p_params->>'p_entity_id' is not null then
        select coalesce(jsonb_agg(row_data),'[]'::jsonb) into v_result from (
          select relation.id as supplier_id,relation.name as supplier_name,
            (select count(*) from public.inventory_products p where p.shop_id=v_shop and p.supplier_id=relation.id and p.deleted_at is null) as product_count, relation.updated_at
          from public.inventory_suppliers relation
          where relation.shop_id=v_shop and relation.id=(p_params->>'p_entity_id')::uuid and relation.deleted_at is null
        ) row_data;
      else
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_suppliers_page_v1(
        (p_params->>'p_shop_id')::uuid,
        coalesce((p_params->>'p_limit')::integer, 50),
        p_params->>'p_search', p_params->>'p_after_name',
        (p_params->>'p_after_id')::uuid
      ) row_data;
      end if;
    when 'wechat_sync_history_page_v1' then
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      into v_result from public.wechat_sync_history_page_v1(
        (p_params->>'p_shop_id')::uuid,
        coalesce((p_params->>'p_limit')::integer, 50),
        (p_params->>'p_before_id')::bigint
      ) row_data;
    else
      raise exception 'wechat_mini_read_not_allowed' using errcode = '42501';
  end case;

  if octet_length(coalesce(v_result, 'null'::jsonb)::text) > 131072 then
    raise exception 'wechat_mini_read_response_too_large' using errcode = '54000';
  end if;
  return coalesce(v_result, 'null'::jsonb);
end;
$$;


-- Only a matching, unexpired and non-revoked session can reveal its own account suspension.
create or replace function public.wechat_mini_session_resolve_v1(p_token_hash text,p_device_hash text)
returns jsonb language plpgsql security definer set search_path = pg_catalog,pg_temp set statement_timeout='3s' as $$
declare v app_private.wechat_mini_sessions%rowtype;
begin
  perform app_private.wechat_require_service_role_v1(); perform app_private.wechat_mini_lock_v1();
  select * into v from app_private.wechat_mini_sessions where token_hash=p_token_hash and device_hash=p_device_hash for update;
  if not found or v.revoked_at is not null or v.expires_at<=clock_timestamp()
    or not exists(select 1 from app_private.wechat_mini_session_generations where actor_profile_id=v.actor_profile_id and generation=v.generation)
    or (v.protocol='wechat-mini-code2session-v1' and not exists(select 1 from app_private.wechat_mini_mappings m
      where m.mapping_id=v.mapping_id and m.profile_id=v.actor_profile_id and m.generation=v.mapping_generation and m.revoked_at is null)) then
    return jsonb_build_object('ok',false,'code','session_expired'); end if;
  if not app_private.wechat_mini_profile_live_v1(v.actor_profile_id) then
    return jsonb_build_object('ok',false,'code','account_suspended','protocol',v.protocol); end if;
  return jsonb_build_object('ok',true,'actor_profile_id',v.actor_profile_id,'session_id',v.session_id,'generation',v.generation,
    'expires_at',v.expires_at,'account_fingerprint',v.account_fingerprint,'protocol',v.protocol);
end;
$$;
