-- iOS TASK-146 / B3. PRIVATE IMPLEMENTATION CANDIDATE: NOT APPLIED OR SQL-TESTED.
-- Generate the actual migration filename with the pinned CLI in the admitted
-- B3 batch. Do not copy this filename into the migration ledger.
-- Additive personal-account reader; existing RPC definitions/ACLs are untouched.
begin;

create function public.mobile_sales_read_v1(
  p_shop_id uuid,
  p_device_identifier text,
  p_action text,
  p_from_date date default null,
  p_to_date date default null,
  p_limit integer default 50,
  p_before_occurred_at timestamptz default null,
  p_before_sale_id uuid default null,
  p_status text default null,
  p_business_kind text default null,
  p_payment_method text default null,
  p_staff_id uuid default null,
  p_device_id uuid default null,
  p_sale_number text default null,
  p_pos_sale_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
-- Fix only this new wrapper's execution timezone. Explicit shop AT TIME ZONE
-- still defines today; delegated DATE series must not depend on the caller's
-- TimeZone or drift at a midnight DST transition. Restored on function exit.
set timezone = 'UTC'
as $$
declare
  v_actor uuid := auth.uid();
  v_device_identifier text;
  v_checked_shop uuid;
  v_checked_profile uuid;
  v_role text;
  v_authorized_device_id uuid;
  v_can_read_metadata boolean;
  v_currency_code text;
  v_time_zone text;
  v_from_date date;
  v_to_date date;
  v_time_zone_invalid boolean;
  v_currency_unsupported boolean;
  v_quantity_invalid boolean := false;
  v_data jsonb;
begin
  if v_actor is null then
    return jsonb_build_object(
      'contract_version', 1, 'ok', false, 'code', 'unauthenticated',
      'server_time', statement_timestamp(), 'data', null);
  end if;

  -- Validate bounded scalar input before any date arithmetic or financial read.
  -- The raw identifier limit is in bytes, before trimming, like recovery auth.
  if p_shop_id is null
    or p_device_identifier is null
    or octet_length(p_device_identifier) > 160
    or p_action is null
    or p_action not in ('summary', 'page', 'detail', 'filter')
    or p_limit is null
    or p_limit not between 1 and 100
    or ((p_from_date is null) <> (p_to_date is null))
    or ((p_before_occurred_at is null) <> (p_before_sale_id is null))
    or (p_status is not null and p_status not in ('accepted', 'duplicate', 'conflict', 'rejected'))
    or (p_business_kind is not null and p_business_kind not in ('sale', 'refund', 'void'))
    or (p_payment_method is not null and length(p_payment_method) not between 1 and 40)
    or (p_sale_number is not null and length(p_sale_number) not between 1 and 80) then
    return jsonb_build_object(
      'contract_version', 1, 'ok', false, 'code', 'invalid_request',
      'server_time', statement_timestamp(), 'data', null);
  end if;

  v_device_identifier := btrim(p_device_identifier);
  if octet_length(v_device_identifier) = 0
    or (p_from_date is not null and not isfinite(p_from_date))
    or (p_to_date is not null and not isfinite(p_to_date))
    or (p_before_occurred_at is not null and not isfinite(p_before_occurred_at)) then
    return jsonb_build_object(
      'contract_version', 1, 'ok', false, 'code', 'invalid_request',
      'server_time', statement_timestamp(), 'data', null);
  end if;

  if p_from_date is not null and (
    p_to_date < p_from_date or p_to_date - p_from_date > 365
  ) then
    return jsonb_build_object(
      'contract_version', 1, 'ok', false, 'code', 'invalid_request',
      'server_time', statement_timestamp(), 'data', null);
  end if;

  -- Reject incompatible action fields instead of silently ignoring them.
  if (p_action = 'summary' and (
        p_before_occurred_at is not null or p_before_sale_id is not null
        or p_pos_sale_id is not null))
    or (p_action = 'page' and (p_from_date is null or p_pos_sale_id is not null))
    or (p_action = 'detail' and (
        p_pos_sale_id is null or p_from_date is not null or p_to_date is not null
        or p_before_occurred_at is not null or p_before_sale_id is not null
        or p_status is not null or p_business_kind is not null
        or p_payment_method is not null or p_staff_id is not null
        or p_device_id is not null or p_sale_number is not null or p_limit <> 50))
    or (p_action = 'filter' and (
        p_from_date is null or p_pos_sale_id is not null
        or p_before_occurred_at is not null or p_before_sale_id is not null
        or p_status is not null or p_business_kind is not null
        or p_payment_method is not null or p_staff_id is not null
        or p_device_id is not null or p_sale_number is not null or p_limit <> 50)) then
    return jsonb_build_object(
      'contract_version', 1, 'ok', false, 'code', 'invalid_request',
      'server_time', statement_timestamp(), 'data', null);
  end if;

  -- Same authority row predicates/order as the existing shared-reader resolver,
  -- with its existing sales-reader viewer role. No catalog resolver/scan/fence.
  -- FOR SHARE prevents status/role/revoked_at updates until transaction end.
  select shop.shop_id into v_checked_shop
  from public.shops shop
  where shop.shop_id = p_shop_id and shop.shop_status = 'active'
  for share;
  if not found then
    return jsonb_build_object(
      'contract_version', 1, 'ok', false, 'code', 'permission_denied',
      'server_time', statement_timestamp(), 'data', null);
  end if;

  select profile.profile_id into v_checked_profile
  from public.profiles profile
  where profile.profile_id = v_actor and profile.profile_status = 'active'
  for share;
  if not found then
    return jsonb_build_object(
      'contract_version', 1, 'ok', false, 'code', 'permission_denied',
      'server_time', statement_timestamp(), 'data', null);
  end if;

  select member.role_key into v_role
  from public.shop_members member
  where member.shop_id = p_shop_id and member.profile_id = v_actor
    and member.membership_status = 'active'
    and member.role_key in ('shop_owner', 'shop_manager', 'viewer')
  for share;
  if not found then
    return jsonb_build_object(
      'contract_version', 1, 'ok', false, 'code', 'permission_denied',
      'server_time', statement_timestamp(), 'data', null);
  end if;

  select device.shop_device_id into v_authorized_device_id
  from public.shop_devices device
  where device.shop_id = p_shop_id
    and device.device_identifier = v_device_identifier
    and device.status = 'active' and device.revoked_at is null
  for share;
  if not found then
    return jsonb_build_object(
      'contract_version', 1, 'ok', false, 'code', 'device_not_authorized',
      'server_time', statement_timestamp(), 'data', null);
  end if;

  v_can_read_metadata := v_role in ('shop_owner', 'shop_manager');
  if not v_can_read_metadata and (p_staff_id is not null or p_device_id is not null) then
    return jsonb_build_object(
      'contract_version', 1, 'ok', false, 'code', 'metadata_filter_not_allowed',
      'server_time', statement_timestamp(), 'data', null);
  end if;

  if p_action in ('summary', 'page') then
    -- All settings, today, summary and page reads belong to this ONE statement.
    -- STABLE legacy delegates therefore use one caller snapshot even though this
    -- authority wrapper must be VOLATILE for its four row locks.
    with settings as materialized (
      select coalesce(setting.currency_code, 'CLP') as currency_code,
        coalesce(setting.catalog_time_zone, 'America/Santiago') as time_zone,
        exists (select 1 from pg_catalog.pg_timezone_names zone
          where zone.name = coalesce(setting.catalog_time_zone, 'America/Santiago')) as time_zone_valid
      from public.shops shop
      left join public.storefront_settings setting on setting.shop_id = shop.shop_id
      where shop.shop_id = p_shop_id
    ), resolved as materialized (
      select setting.currency_code, setting.time_zone,
        -- CASE also guards AT TIME ZONE independently of planner push-down.
        case when setting.time_zone_valid then coalesce(
          p_from_date, (statement_timestamp() at time zone setting.time_zone)::date) end as from_date,
        case when setting.time_zone_valid then coalesce(
          p_to_date, (statement_timestamp() at time zone setting.time_zone)::date) end as to_date
      from settings setting
      where setting.time_zone_valid and setting.currency_code = 'CLP'
    ), days as materialized (
      select day.* from resolved period
      cross join lateral public.wechat_daily_sales_summary_v1(p_shop_id, period.from_date) day
      where p_action = 'summary' and p_from_date is null
      union all
      select day.* from resolved period
      cross join lateral public.wechat_sales_period_summary_v1(
        p_shop_id, period.from_date, period.to_date) day
      where p_action = 'summary' and p_from_date is not null
    ), page as materialized (
      select sale.* from resolved period
      cross join lateral public.wechat_sales_page_v2(
        p_shop_id, period.from_date, period.to_date, p_limit,
        p_before_occurred_at, p_before_sale_id, p_status, p_business_kind,
        p_payment_method, p_staff_id, p_device_id, p_sale_number) sale
    ), encoded as (
      select coalesce((select jsonb_agg(to_jsonb(sale) || jsonb_build_object(
          'gross_amount_clp', sale.gross_amount_clp::text,
          'discount_amount_clp', sale.discount_amount_clp::text,
          'net_amount_clp', sale.net_amount_clp::text,
          'staff_name', case when v_can_read_metadata then sale.staff_name end,
          'device_name', case when v_can_read_metadata then sale.device_name end)
          order by sale.occurred_at desc, sale.pos_sale_id desc)
        from page sale), '[]'::jsonb) as sales,
        (select jsonb_build_object(
          'before_occurred_at', sale.occurred_at, 'before_sale_id', sale.pos_sale_id)
        from page sale order by sale.occurred_at asc, sale.pos_sale_id asc limit 1) as next_cursor
    )
    select setting.currency_code, setting.time_zone, period.from_date, period.to_date,
      not setting.time_zone_valid,
      setting.currency_code <> 'CLP' or exists (
        select 1 from page item
        join public.pos_sales sale on sale.shop_id = p_shop_id and sale.pos_sale_id = item.pos_sale_id
        where sale.currency is distinct from 'CLP'
          or sale.currency is distinct from setting.currency_code),
      case when p_action = 'summary' then jsonb_build_object(
        'summary_days', coalesce((select jsonb_agg(to_jsonb(day) || jsonb_build_object(
          'gross_sales_clp', day.gross_sales_clp::text,
          'discounts_clp', day.discounts_clp::text,
          'refunds_clp', day.refunds_clp::text,
          'net_revenue_clp', day.net_revenue_clp::text) order by day.business_date desc)
          from days day), '[]'::jsonb),
        'sales', encoded.sales, 'next_cursor', encoded.next_cursor)
      else jsonb_build_object('sales', encoded.sales, 'next_cursor', encoded.next_cursor) end
    into v_currency_code, v_time_zone, v_from_date, v_to_date,
      v_time_zone_invalid, v_currency_unsupported, v_data
    from settings setting
    left join resolved period on true
    cross join encoded;

  elsif p_action = 'detail' then
    with settings as materialized (
      select coalesce(setting.currency_code, 'CLP') as currency_code,
        coalesce(setting.catalog_time_zone, 'America/Santiago') as time_zone,
        exists (select 1 from pg_catalog.pg_timezone_names zone
          where zone.name = coalesce(setting.catalog_time_zone, 'America/Santiago')) as time_zone_valid
      from public.shops shop
      left join public.storefront_settings setting on setting.shop_id = shop.shop_id
      where shop.shop_id = p_shop_id
    ), detail as materialized (
      select public.wechat_sale_detail_v2(p_shop_id, p_pos_sale_id) as value
      from settings setting
      where setting.time_zone_valid and setting.currency_code = 'CLP'
    )
    select setting.currency_code, setting.time_zone, not setting.time_zone_valid,
      setting.currency_code <> 'CLP' or (detail.value is not null and (
        detail.value #>> '{sale,currency_code}' is distinct from 'CLP'
        or detail.value #>> '{sale,currency_code}' is distinct from setting.currency_code)),
      exists (select 1
        from jsonb_array_elements(coalesce(detail.value -> 'lines', '[]'::jsonb)) line(value)
        where line.value ->> 'quantity' is not null
          and line.value ->> 'quantity' !~ '^-?(0|[1-9][0-9]*)([.][0-9]+)?$'),
      case when detail.value is null then null else detail.value || jsonb_build_object(
        'sale', (detail.value -> 'sale') || jsonb_build_object(
          'gross_amount_clp', detail.value #>> '{sale,gross_amount_clp}',
          'discount_amount_clp', detail.value #>> '{sale,discount_amount_clp}',
          'net_amount_clp', detail.value #>> '{sale,net_amount_clp}',
          'staff_name', case when v_can_read_metadata then detail.value #>> '{sale,staff_name}' end,
          'device_name', case when v_can_read_metadata then detail.value #>> '{sale,device_name}' end),
        'lines', coalesce((select jsonb_agg(line.value || jsonb_build_object(
            'quantity', line.value ->> 'quantity',
            'unit_amount_clp', line.value ->> 'unit_amount_clp',
            'line_amount_clp', line.value ->> 'line_amount_clp') order by line.ordinality)
          from jsonb_array_elements(coalesce(detail.value -> 'lines', '[]'::jsonb))
            with ordinality line(value, ordinality)), '[]'::jsonb)) end
    into v_currency_code, v_time_zone, v_time_zone_invalid,
      v_currency_unsupported, v_quantity_invalid, v_data
    from settings setting
    left join detail on true;

  else -- 'filter' has already passed the exact action/input matrix above.
    with settings as materialized (
      select coalesce(setting.currency_code, 'CLP') as currency_code,
        coalesce(setting.catalog_time_zone, 'America/Santiago') as time_zone,
        exists (select 1 from pg_catalog.pg_timezone_names zone
          where zone.name = coalesce(setting.catalog_time_zone, 'America/Santiago')) as time_zone_valid
      from public.shops shop
      left join public.storefront_settings setting on setting.shop_id = shop.shop_id
      where shop.shop_id = p_shop_id
    ), options as materialized (
      select item.* from settings setting
      cross join lateral public.wechat_sales_filter_options_v1(p_shop_id, p_from_date, p_to_date) item
      where setting.time_zone_valid and setting.currency_code = 'CLP'
    )
    select setting.currency_code, setting.time_zone, p_from_date, p_to_date,
      not setting.time_zone_valid, setting.currency_code <> 'CLP',
      jsonb_build_object('can_filter_operational_metadata', v_can_read_metadata,
        'payment_methods', coalesce(options.payment_methods, array[]::text[]),
        'staff', case when v_can_read_metadata then coalesce(options.staff, '[]'::jsonb) else '[]'::jsonb end,
        'devices', case when v_can_read_metadata then coalesce(options.devices, '[]'::jsonb) else '[]'::jsonb end)
    into v_currency_code, v_time_zone, v_from_date, v_to_date,
      v_time_zone_invalid, v_currency_unsupported, v_data
    from settings setting
    left join options on true;
  end if;

  -- Configuration/data failures remain SQL/transport failures, never a partial
  -- success, invented financial zero, or relabelled foreign currency.
  if v_time_zone_invalid then
    raise exception using errcode = '22023', message = 'shop_time_zone_invalid';
  end if;
  if v_currency_unsupported then
    return jsonb_build_object(
      'contract_version', 1, 'ok', false, 'code', 'currency_unsupported',
      'server_time', statement_timestamp(), 'data', null);
  end if;
  if v_quantity_invalid then
    raise exception using errcode = '22023', message = 'mobile_sales_quantity_invalid';
  end if;
  if v_data is null then
    return jsonb_build_object(
      'contract_version', 1, 'ok', false, 'code', 'not_found',
      'server_time', statement_timestamp(), 'data', null);
  end if;

  return jsonb_build_object(
    'contract_version', 1, 'ok', true, 'code', 'ok',
    'server_time', statement_timestamp(),
    'scope', jsonb_build_object('principal_kind', 'personal_account',
      'principal_id', v_actor, 'shop_id', p_shop_id, 'shop_device_id', v_authorized_device_id),
    'capability', jsonb_build_object('sales_read', true,
      'operational_metadata_read', v_can_read_metadata, 'access_policy', 'online_only'),
    -- Detail deliberately has no requested period; both values remain JSON null.
    'period', jsonb_build_object('from_date', v_from_date, 'to_date', v_to_date),
    'currency_code', v_currency_code, 'time_zone', v_time_zone, 'data', v_data);
end;
$$;

revoke all on function public.mobile_sales_read_v1(
  uuid, text, text, date, date, integer, timestamptz, uuid,
  text, text, text, uuid, uuid, text, uuid
) from public, anon, service_role;
grant execute on function public.mobile_sales_read_v1(
  uuid, text, text, date, date, integer, timestamptz, uuid,
  text, text, text, uuid, uuid, text, uuid
) to authenticated;

comment on function public.mobile_sales_read_v1(
  uuid, text, text, date, date, integer, timestamptz, uuid,
  text, text, text, uuid, uuid, text, uuid
) is 'TASK-146 versioned online-only POS reader for active personal-account shop members and active shop devices; exact CLP string amounts, coherent summary/page, no mobile financial write or offline lease.';

commit;
