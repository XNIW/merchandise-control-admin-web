-- TASK-159 / WECHAT-010: align the mixed-direction catalog cursor with
-- ORDER BY updated_at DESC, id ASC. Authorization, projections, filters,
-- page bounds and both text-sort contracts remain unchanged.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '2min';

do $owner_guard$
begin
  if current_user <> 'postgres'
    or (select pg_get_userbyid(proowner) from pg_proc where oid =
      'public.wechat_catalog_page_v1(uuid,integer,text,uuid,uuid,boolean,text,timestamptz,text,uuid)'::regprocedure) <> 'postgres' then
    raise exception 'wechat_catalog_keyset_owner_mismatch';
  end if;
end;
$owner_guard$;

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
      or (p_sort = 'updated_desc' and (
        product.updated_at < p_cursor_at
        or (product.updated_at = p_cursor_at and product.id > p_cursor_id)
      ))
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

commit;
