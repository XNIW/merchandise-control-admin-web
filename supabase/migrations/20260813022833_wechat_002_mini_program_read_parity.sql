-- WECHAT-002
-- Authenticated, bounded and shop-scoped read models for Mini Program parity.
-- No client write path, role assignment or Storage publication is introduced.

begin;

create or replace function public.wechat_account_profile_v1()
returns table (
  profile_id uuid,
  display_name text,
  profile_status text,
  providers text[],
  wechat_linked boolean,
  server_time timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.profile_id,
    profile.display_name,
    profile.profile_status,
    coalesce(identity_list.providers, array[]::text[]),
    coalesce(identity_list.wechat_linked, false),
    statement_timestamp()
  from public.profiles profile
  left join lateral (
    select
      array_agg(distinct identity.provider order by identity.provider)::text[] as providers,
      bool_or(identity.provider in ('wechat', 'custom:wechat')) as wechat_linked
    from auth.identities identity
    where identity.user_id = profile.profile_id
  ) identity_list on true
  where profile.profile_id = auth.uid();
$$;

revoke all on function public.wechat_account_profile_v1() from public, anon;
grant execute on function public.wechat_account_profile_v1() to authenticated;

create or replace function public.wechat_sales_period_summary_v1(
  p_shop_id uuid,
  p_from_date date,
  p_to_date date
)
returns table (
  shop_id uuid,
  business_date date,
  currency_code text,
  time_zone text,
  gross_sales_clp bigint,
  discounts_clp bigint,
  refunds_clp bigint,
  net_revenue_clp bigint,
  sale_count integer,
  refund_count integer,
  void_count integer,
  transaction_count integer,
  latest_ledger_at timestamptz,
  server_time timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_time_zone text;
  v_currency_code text;
begin
  if not app_private.wechat_can_read_shop(p_shop_id) then
    return;
  end if;

  if p_from_date is null
    or p_to_date is null
    or p_to_date < p_from_date
    or p_to_date - p_from_date > 365 then
    raise exception using errcode = '22023', message = 'sales_range_invalid';
  end if;

  select
    coalesce(setting.catalog_time_zone, 'America/Santiago'),
    coalesce(setting.currency_code, 'CLP')
  into v_time_zone, v_currency_code
  from public.shops shop
  left join public.storefront_settings setting on setting.shop_id = shop.shop_id
  where shop.shop_id = p_shop_id;

  if not exists (
    select 1 from pg_catalog.pg_timezone_names zone where zone.name = v_time_zone
  ) then
    raise exception using errcode = '22023', message = 'shop_time_zone_invalid';
  end if;

  return query
  select
    p_shop_id,
    day.business_date,
    v_currency_code,
    v_time_zone,
    coalesce(summary.gross_sales_clp, 0)::bigint,
    coalesce(summary.discounts_clp, 0)::bigint,
    coalesce(summary.refunds_clp, 0)::bigint,
    coalesce(summary.net_revenue_clp, 0)::bigint,
    coalesce(summary.sale_count, 0)::integer,
    coalesce(summary.refund_count, 0)::integer,
    coalesce(summary.void_count, 0)::integer,
    coalesce(summary.transaction_count, 0)::integer,
    summary.latest_ledger_at,
    statement_timestamp()
  from generate_series(p_from_date, p_to_date, interval '1 day') generated_day
  cross join lateral (select generated_day::date as business_date) day
  left join public.pos_revenue_daily_summary_v summary
    on summary.shop_id = p_shop_id
   and summary.business_date = day.business_date
  order by day.business_date desc;
end;
$$;

revoke all on function public.wechat_sales_period_summary_v1(uuid, date, date)
  from public, anon;
grant execute on function public.wechat_sales_period_summary_v1(uuid, date, date)
  to authenticated;

create or replace function app_private.wechat_can_read_sales_metadata(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.shop_members member on member.profile_id = profile.profile_id
    join public.shops shop on shop.shop_id = member.shop_id
    where profile.profile_id = auth.uid()
      and profile.profile_status = 'active'
      and member.shop_id = p_shop_id
      and member.membership_status = 'active'
      and member.role_key in ('shop_owner', 'shop_manager')
      and shop.shop_status = 'active'
  );
$$;

revoke all on function app_private.wechat_can_read_sales_metadata(uuid)
  from public, anon, authenticated;

create or replace function public.wechat_sales_page_v2(
  p_shop_id uuid,
  p_from_date date,
  p_to_date date,
  p_limit integer default 50,
  p_before_occurred_at timestamptz default null,
  p_before_sale_id uuid default null,
  p_status text default null,
  p_business_kind text default null,
  p_payment_method text default null,
  p_staff_id uuid default null,
  p_device_id uuid default null,
  p_sale_number text default null
)
returns table (
  pos_sale_id uuid,
  sale_number text,
  occurred_at timestamptz,
  business_date date,
  business_kind text,
  sale_status text,
  fiscal_status text,
  gross_amount_clp bigint,
  discount_amount_clp bigint,
  net_amount_clp bigint,
  payment_methods text[],
  staff_name text,
  device_name text,
  currency_code text,
  time_zone text,
  latest_update_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_time_zone text;
  v_currency_code text;
  v_can_read_sales_metadata boolean;
begin
  if not app_private.wechat_can_read_shop(p_shop_id) then
    return;
  end if;

  if p_from_date is null
    or p_to_date is null
    or p_to_date < p_from_date
    or p_to_date - p_from_date > 365
    or p_limit is null
    or p_limit not between 1 and 100
    or ((p_before_occurred_at is null) <> (p_before_sale_id is null))
    or (p_status is not null and p_status not in ('accepted', 'duplicate', 'conflict', 'rejected'))
    or (p_business_kind is not null and p_business_kind not in ('sale', 'refund', 'void'))
    or (p_payment_method is not null and length(p_payment_method) not between 1 and 40)
    or (p_sale_number is not null and length(p_sale_number) not between 1 and 80) then
    raise exception using errcode = '22023', message = 'sales_page_invalid';
  end if;

  select
    coalesce(setting.catalog_time_zone, 'America/Santiago'),
    coalesce(setting.currency_code, 'CLP'),
    app_private.wechat_can_read_sales_metadata(p_shop_id)
  into v_time_zone, v_currency_code, v_can_read_sales_metadata
  from public.shops shop
  left join public.storefront_settings setting on setting.shop_id = shop.shop_id
  where shop.shop_id = p_shop_id;

  return query
  select
    sale.pos_sale_id,
    coalesce(sale.sale_number, sale.client_sale_id),
    sale.occurred_at,
    sale.business_date,
    sale.business_kind,
    sale.status,
    sale.fiscal_status,
    coalesce(sale.gross_amount_clp, round(sale.subtotal)::bigint),
    coalesce(sale.discount_amount_clp, round(sale.discount_total)::bigint),
    coalesce(
      sale.net_amount_clp,
      case when sale.business_kind = 'refund'
        then -round(sale.total)::bigint
        else round(sale.total)::bigint
      end
    )::bigint,
    coalesce(payment.methods, array[]::text[]),
    case when v_can_read_sales_metadata then staff.display_name end,
    case when v_can_read_sales_metadata then device.display_name end,
    v_currency_code,
    v_time_zone,
    greatest(sale.updated_at, sale.created_at)
  from public.pos_sales sale
  left join public.staff_accounts_safe staff
    on staff.staff_id = sale.staff_id and staff.shop_id = sale.shop_id
  left join public.shop_devices device
    on device.shop_device_id = sale.shop_device_id and device.shop_id = sale.shop_id
  left join lateral (
    select array_agg(distinct ledger.payment_method order by ledger.payment_method)
      filter (where ledger.payment_method is not null) as methods
    from public.pos_revenue_ledger_entries ledger
    where ledger.shop_id = sale.shop_id
      and ledger.pos_sale_id = sale.pos_sale_id
      and ledger.entry_type in ('payment', 'refund_payment')
  ) payment on true
  where sale.shop_id = p_shop_id
    and sale.business_date between p_from_date and p_to_date
    and (p_status is null or sale.status = p_status)
    and (p_business_kind is null or sale.business_kind = p_business_kind)
    and (p_staff_id is null or (v_can_read_sales_metadata and sale.staff_id = p_staff_id))
    and (p_device_id is null or (v_can_read_sales_metadata and sale.shop_device_id = p_device_id))
    and (
      p_sale_number is null
      or coalesce(sale.sale_number, sale.client_sale_id) ilike '%' || p_sale_number || '%'
    )
    and (
      p_payment_method is null
      or exists (
        select 1
        from public.pos_revenue_ledger_entries filter_ledger
        where filter_ledger.shop_id = p_shop_id
          and filter_ledger.pos_sale_id = sale.pos_sale_id
          and filter_ledger.payment_method = p_payment_method
          and filter_ledger.entry_type in ('payment', 'refund_payment')
      )
    )
    and (
      p_before_occurred_at is null
      or (sale.occurred_at, sale.pos_sale_id) < (p_before_occurred_at, p_before_sale_id)
    )
  order by sale.occurred_at desc, sale.pos_sale_id desc
  limit p_limit;
end;
$$;

revoke all on function public.wechat_sales_page_v2(
  uuid, date, date, integer, timestamptz, uuid, text, text, text, uuid, uuid, text
) from public, anon;
grant execute on function public.wechat_sales_page_v2(
  uuid, date, date, integer, timestamptz, uuid, text, text, text, uuid, uuid, text
) to authenticated;

create or replace function public.wechat_sale_detail_v2(
  p_shop_id uuid,
  p_pos_sale_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not app_private.wechat_can_read_shop(p_shop_id) then null
    else (
      select jsonb_build_object(
        'sale', jsonb_build_object(
          'pos_sale_id', sale.pos_sale_id,
          'sale_number', coalesce(sale.sale_number, sale.client_sale_id),
          'occurred_at', sale.occurred_at,
          'business_date', sale.business_date,
          'business_kind', sale.business_kind,
          'sale_status', sale.status,
          'fiscal_status', sale.fiscal_status,
          'currency_code', sale.currency,
          'gross_amount_clp', coalesce(sale.gross_amount_clp, round(sale.subtotal)::bigint),
          'discount_amount_clp', coalesce(sale.discount_amount_clp, round(sale.discount_total)::bigint),
          'net_amount_clp', coalesce(
            sale.net_amount_clp,
            case when sale.business_kind = 'refund'
              then -round(sale.total)::bigint
              else round(sale.total)::bigint
            end
          ),
          'staff_name', case
            when app_private.wechat_can_read_sales_metadata(p_shop_id)
              then staff.display_name
          end,
          'device_name', case
            when app_private.wechat_can_read_sales_metadata(p_shop_id)
              then device.display_name
          end,
          'payment_methods', coalesce(payment.methods, '[]'::jsonb),
          'updated_at', greatest(sale.updated_at, sale.created_at)
        ),
        'lines', coalesce(lines.items, '[]'::jsonb)
      )
      from public.pos_sales sale
      left join public.staff_accounts_safe staff
        on staff.staff_id = sale.staff_id and staff.shop_id = sale.shop_id
      left join public.shop_devices device
        on device.shop_device_id = sale.shop_device_id and device.shop_id = sale.shop_id
      left join lateral (
        select jsonb_agg(distinct ledger.payment_method)
          filter (where ledger.payment_method is not null) as methods
        from public.pos_revenue_ledger_entries ledger
        where ledger.shop_id = sale.shop_id
          and ledger.pos_sale_id = sale.pos_sale_id
          and ledger.entry_type in ('payment', 'refund_payment')
      ) payment on true
      left join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'line_position', line.line_position,
            'line_type', line.line_type,
            'product_id', line.product_id,
            'item_number', line.item_number,
            'barcode', line.barcode,
            'product_name', line.product_name,
            'quantity', line.quantity,
            'unit_amount_clp', coalesce(line.unit_amount_clp, round(line.unit_price)::bigint),
            'line_amount_clp', coalesce(line.amount_clp, round(line.line_total)::bigint)
          ) order by line.line_position
        ) as items
        from public.pos_sale_lines line
        where line.shop_id = sale.shop_id
          and line.pos_sale_id = sale.pos_sale_id
      ) lines on true
      where sale.shop_id = p_shop_id
        and sale.pos_sale_id = p_pos_sale_id
      limit 1
    )
  end;
$$;

revoke all on function public.wechat_sale_detail_v2(uuid, uuid) from public, anon;
grant execute on function public.wechat_sale_detail_v2(uuid, uuid) to authenticated;

create or replace function public.wechat_sales_filter_options_v1(
  p_shop_id uuid,
  p_from_date date,
  p_to_date date
)
returns table (
  can_filter_operational_metadata boolean,
  payment_methods text[],
  staff jsonb,
  devices jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_can_filter_operational_metadata boolean;
begin
  if not app_private.wechat_can_read_shop(p_shop_id) then return; end if;
  if p_from_date is null
    or p_to_date is null
    or p_to_date < p_from_date
    or p_to_date - p_from_date > 365 then
    raise exception using errcode = '22023', message = 'sales_filter_range_invalid';
  end if;

  v_can_filter_operational_metadata :=
    app_private.wechat_can_read_sales_metadata(p_shop_id);

  return query
  select
    v_can_filter_operational_metadata,
    coalesce((
      select array_agg(method.payment_method order by method.payment_method)
      from (
        select distinct ledger.payment_method
        from public.pos_revenue_ledger_entries ledger
        join public.pos_sales sale
          on sale.shop_id = ledger.shop_id and sale.pos_sale_id = ledger.pos_sale_id
        where ledger.shop_id = p_shop_id
          and sale.business_date between p_from_date and p_to_date
          and ledger.payment_method is not null
          and ledger.entry_type in ('payment', 'refund_payment')
        order by ledger.payment_method
        limit 40
      ) method
    ), array[]::text[]),
    case when v_can_filter_operational_metadata then coalesce((
      select jsonb_agg(jsonb_build_object('id', item.staff_id, 'name', item.display_name)
        order by item.display_name, item.staff_id)
      from (
        select account.staff_id, account.display_name
        from public.staff_accounts account
        where account.shop_id = p_shop_id and account.status = 'active'
        order by account.display_name, account.staff_id
        limit 100
      ) item
    ), '[]'::jsonb) else '[]'::jsonb end,
    case when v_can_filter_operational_metadata then coalesce((
      select jsonb_agg(jsonb_build_object('id', item.shop_device_id, 'name', item.display_name)
        order by item.display_name, item.shop_device_id)
      from (
        select device.shop_device_id, device.display_name
        from public.shop_devices device
        where device.shop_id = p_shop_id and device.status = 'active'
        order by device.display_name, device.shop_device_id
        limit 100
      ) item
    ), '[]'::jsonb) else '[]'::jsonb end;
end;
$$;

revoke all on function public.wechat_sales_filter_options_v1(uuid, date, date)
  from public, anon;
grant execute on function public.wechat_sales_filter_options_v1(uuid, date, date)
  to authenticated;

create or replace function public.wechat_catalog_page_v1(
  p_shop_id uuid,
  p_limit integer default 50,
  p_search text default null,
  p_category_id uuid default null,
  p_supplier_id uuid default null,
  p_has_image boolean default null,
  p_sort text default 'updated_desc',
  p_cursor_at timestamptz default null,
  p_cursor_text text default null,
  p_cursor_id uuid default null
)
returns table (
  product_id uuid,
  barcode text,
  item_number text,
  product_name text,
  second_product_name text,
  category_id uuid,
  category_name text,
  supplier_id uuid,
  supplier_name text,
  purchase_price double precision,
  retail_price double precision,
  previous_retail_price double precision,
  stock_quantity double precision,
  primary_image_version_id uuid,
  updated_at timestamptz,
  cursor_text text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.wechat_can_read_shop(p_shop_id) then
    return;
  end if;

  if p_limit is null
    or p_limit not between 1 and 100
    or (p_search is not null and length(p_search) not between 1 and 80)
    or p_sort not in ('updated_desc', 'name_asc', 'barcode_asc')
    or ((p_cursor_at is not null or p_cursor_text is not null) <> (p_cursor_id is not null))
    or (p_sort = 'updated_desc' and p_cursor_text is not null)
    or (p_sort <> 'updated_desc' and p_cursor_at is not null) then
    raise exception using errcode = '22023', message = 'catalog_page_invalid';
  end if;

  return query
  select
    product.id,
    product.barcode,
    product.item_number,
    product.product_name,
    product.second_product_name,
    product.category_id,
    category.name,
    product.supplier_id,
    supplier.name,
    product.purchase_price,
    product.retail_price,
    previous_price.price,
    product.stock_quantity,
    product.primary_image_version_id,
    product.updated_at,
    case
      when p_sort = 'name_asc' then lower(coalesce(product.product_name, product.second_product_name, product.barcode))
      when p_sort = 'barcode_asc' then lower(product.barcode)
      else null
    end
  from public.inventory_products product
  left join public.inventory_categories category
    on category.id = product.category_id
   and category.shop_id = p_shop_id
   and category.deleted_at is null
  left join public.inventory_suppliers supplier
    on supplier.id = product.supplier_id
   and supplier.shop_id = p_shop_id
   and supplier.deleted_at is null
  left join lateral (
    select price.price
    from public.inventory_product_prices price
    where price.shop_id = p_shop_id
      and price.product_id = product.id
      and price.type = 'RETAIL'
      and (product.retail_price is null or price.price is distinct from product.retail_price)
    order by price.effective_at desc, price.id desc
    limit 1
  ) previous_price on true
  where product.shop_id = p_shop_id
    and product.deleted_at is null
    and (p_category_id is null or product.category_id = p_category_id)
    and (p_supplier_id is null or product.supplier_id = p_supplier_id)
    and (p_has_image is null or (product.primary_image_version_id is not null) = p_has_image)
    and (
      p_search is null
      or lower(coalesce(product.product_name, '')) like '%' || lower(p_search) || '%'
      or lower(coalesce(product.second_product_name, '')) like '%' || lower(p_search) || '%'
      or lower(product.barcode) like '%' || lower(p_search) || '%'
      or lower(coalesce(product.item_number, '')) like '%' || lower(p_search) || '%'
    )
    and (
      p_cursor_id is null
      or (p_sort = 'updated_desc' and (product.updated_at, product.id) < (p_cursor_at, p_cursor_id))
      or (
        p_sort = 'name_asc'
        and (lower(coalesce(product.product_name, product.second_product_name, product.barcode)), product.id)
          > (p_cursor_text, p_cursor_id)
      )
      or (p_sort = 'barcode_asc' and (lower(product.barcode), product.id) > (p_cursor_text, p_cursor_id))
    )
  order by
    case when p_sort = 'updated_desc' then product.updated_at end desc,
    case when p_sort = 'name_asc' then lower(coalesce(product.product_name, product.second_product_name, product.barcode)) end asc,
    case when p_sort = 'barcode_asc' then lower(product.barcode) end asc,
    product.id asc
  limit p_limit;
end;
$$;

revoke all on function public.wechat_catalog_page_v1(
  uuid, integer, text, uuid, uuid, boolean, text, timestamptz, text, uuid
) from public, anon;
grant execute on function public.wechat_catalog_page_v1(
  uuid, integer, text, uuid, uuid, boolean, text, timestamptz, text, uuid
) to authenticated;

create or replace function public.wechat_product_detail_v1(
  p_shop_id uuid,
  p_product_id uuid
)
returns table (
  product_id uuid,
  barcode text,
  item_number text,
  product_name text,
  second_product_name text,
  category_id uuid,
  category_name text,
  supplier_id uuid,
  supplier_name text,
  purchase_price double precision,
  retail_price double precision,
  stock_quantity double precision,
  primary_image_version_id uuid,
  primary_image_updated_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    product.id,
    product.barcode,
    product.item_number,
    product.product_name,
    product.second_product_name,
    product.category_id,
    category.name,
    product.supplier_id,
    supplier.name,
    product.purchase_price,
    product.retail_price,
    product.stock_quantity,
    product.primary_image_version_id,
    product.primary_image_updated_at,
    product.updated_at
  from public.inventory_products product
  left join public.inventory_categories category
    on category.id = product.category_id and category.shop_id = p_shop_id
  left join public.inventory_suppliers supplier
    on supplier.id = product.supplier_id and supplier.shop_id = p_shop_id
  where app_private.wechat_can_read_shop(p_shop_id)
    and product.shop_id = p_shop_id
    and product.id = p_product_id
    and product.deleted_at is null
  limit 1;
$$;

revoke all on function public.wechat_product_detail_v1(uuid, uuid) from public, anon;
grant execute on function public.wechat_product_detail_v1(uuid, uuid) to authenticated;

create or replace function public.wechat_price_history_page_v1(
  p_shop_id uuid,
  p_product_id uuid,
  p_limit integer default 50,
  p_before_effective_at text default null,
  p_before_id uuid default null
)
returns table (
  price_id uuid,
  price_type text,
  price double precision,
  effective_at text,
  source text,
  created_at text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.wechat_can_read_shop(p_shop_id) then
    return;
  end if;
  if p_limit is null
    or p_limit not between 1 and 100
    or ((p_before_effective_at is null) <> (p_before_id is null))
    or (p_before_effective_at is not null and length(p_before_effective_at) > 80) then
    raise exception using errcode = '22023', message = 'price_history_page_invalid';
  end if;

  return query
  select item.id, item.type, item.price, item.effective_at, item.source, item.created_at
  from public.inventory_product_prices item
  join public.inventory_products product
    on product.id = item.product_id
   and product.shop_id = p_shop_id
   and product.deleted_at is null
  where item.shop_id = p_shop_id
    and item.product_id = p_product_id
    and (
      p_before_effective_at is null
      or (item.effective_at, item.id) < (p_before_effective_at, p_before_id)
    )
  order by item.effective_at desc, item.id desc
  limit p_limit;
end;
$$;

revoke all on function public.wechat_price_history_page_v1(uuid, uuid, integer, text, uuid)
  from public, anon;
grant execute on function public.wechat_price_history_page_v1(uuid, uuid, integer, text, uuid)
  to authenticated;

create or replace function public.wechat_categories_page_v1(
  p_shop_id uuid,
  p_limit integer default 50,
  p_search text default null,
  p_after_name text default null,
  p_after_id uuid default null
)
returns table (
  category_id uuid,
  category_name text,
  product_count bigint,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.wechat_can_read_shop(p_shop_id) then return; end if;
  if p_limit is null
    or p_limit not between 1 and 100
    or (p_search is not null and length(p_search) not between 1 and 80)
    or ((p_after_name is null) <> (p_after_id is null)) then
    raise exception using errcode = '22023', message = 'category_page_invalid';
  end if;
  return query
  select category.id, category.name, count(product.id), category.updated_at
  from public.inventory_categories category
  left join public.inventory_products product
    on product.category_id = category.id
   and product.shop_id = p_shop_id
   and product.deleted_at is null
  where category.shop_id = p_shop_id
    and category.deleted_at is null
    and (p_search is null or lower(category.name) like '%' || lower(p_search) || '%')
    and (p_after_name is null or (lower(category.name), category.id) > (lower(p_after_name), p_after_id))
  group by category.id, category.name, category.updated_at
  order by lower(category.name), category.id
  limit p_limit;
end;
$$;

revoke all on function public.wechat_categories_page_v1(uuid, integer, text, text, uuid)
  from public, anon;
grant execute on function public.wechat_categories_page_v1(uuid, integer, text, text, uuid)
  to authenticated;

create or replace function public.wechat_suppliers_page_v1(
  p_shop_id uuid,
  p_limit integer default 50,
  p_search text default null,
  p_after_name text default null,
  p_after_id uuid default null
)
returns table (
  supplier_id uuid,
  supplier_name text,
  product_count bigint,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.wechat_can_read_shop(p_shop_id) then return; end if;
  if p_limit is null
    or p_limit not between 1 and 100
    or (p_search is not null and length(p_search) not between 1 and 80)
    or ((p_after_name is null) <> (p_after_id is null)) then
    raise exception using errcode = '22023', message = 'supplier_page_invalid';
  end if;
  return query
  select supplier.id, supplier.name, count(product.id), supplier.updated_at
  from public.inventory_suppliers supplier
  left join public.inventory_products product
    on product.supplier_id = supplier.id
   and product.shop_id = p_shop_id
   and product.deleted_at is null
  where supplier.shop_id = p_shop_id
    and supplier.deleted_at is null
    and (p_search is null or lower(supplier.name) like '%' || lower(p_search) || '%')
    and (p_after_name is null or (lower(supplier.name), supplier.id) > (lower(p_after_name), p_after_id))
  group by supplier.id, supplier.name, supplier.updated_at
  order by lower(supplier.name), supplier.id
  limit p_limit;
end;
$$;

revoke all on function public.wechat_suppliers_page_v1(uuid, integer, text, text, uuid)
  from public, anon;
grant execute on function public.wechat_suppliers_page_v1(uuid, integer, text, text, uuid)
  to authenticated;

create or replace function public.wechat_sync_history_page_v1(
  p_shop_id uuid,
  p_limit integer default 50,
  p_before_id bigint default null
)
returns table (
  event_id bigint,
  domain text,
  event_type text,
  source text,
  changed_count integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.wechat_can_read_shop(p_shop_id) then return; end if;
  if p_limit is null
    or p_limit not between 1 and 100
    or (p_before_id is not null and p_before_id < 1) then
    raise exception using errcode = '22023', message = 'sync_history_page_invalid';
  end if;
  return query
  select event.id, event.domain, event.event_type, event.source, event.changed_count, event.created_at
  from public.sync_events event
  where event.shop_id = p_shop_id
    and (p_before_id is null or event.id < p_before_id)
  order by event.id desc
  limit p_limit;
end;
$$;

revoke all on function public.wechat_sync_history_page_v1(uuid, integer, bigint)
  from public, anon;
grant execute on function public.wechat_sync_history_page_v1(uuid, integer, bigint)
  to authenticated;

comment on function public.wechat_account_profile_v1() is
  'Current personal account and linked provider state; never assigns roles.';
comment on function public.wechat_sales_period_summary_v1(uuid, date, date) is
  'Bounded daily sales summaries in the authorized shop currency/timezone.';
comment on function public.wechat_sales_page_v2(
  uuid, date, date, integer, timestamptz, uuid, text, text, text, uuid, uuid, text
) is 'Bounded keyset sales page with schema-backed filters for WECHAT-002.';
comment on function public.wechat_sales_filter_options_v1(uuid, date, date) is
  'Bounded sales facets; staff and device identifiers require owner or manager membership.';
comment on function public.wechat_catalog_page_v1(
  uuid, integer, text, uuid, uuid, boolean, text, timestamptz, text, uuid
) is 'Bounded shop-scoped catalog projection; image bytes remain in private Storage.';
comment on function public.wechat_sync_history_page_v1(uuid, integer, bigint) is
  'Sanitized shop-scoped sync history without metadata, entity IDs or device identifiers.';

commit;
