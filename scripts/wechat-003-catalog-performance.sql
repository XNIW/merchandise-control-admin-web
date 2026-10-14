-- Guarded WECHAT-003 realistic-volume catalog read probe. Always rolls back.
--
-- Local contract:
--   psql -X "$LOCAL_DATABASE_URL" \
--     -v wechat_performance_target=local \
--     -v wechat_performance_confirmation=WECHAT_PERFORMANCE_LOCAL \
--     -f scripts/wechat-003-catalog-performance.sql
--
-- Staging is restricted to the repository's exact staging project and also
-- requires `-v wechat_performance_target=staging`,
-- `-v wechat_performance_confirmation=WECHAT_PERFORMANCE_STAGING`, and
-- `-v wechat_performance_staging_project_ref=<approved-ref>`.
-- The synthetic fixture intentionally bypasses catalog write triggers while it
-- is loaded so this script measures bounded read projections, not fixture-
-- generation side effects. Trigger state and all rows are restored by the
-- transaction rollback, including when psql stops on an error.
\set ON_ERROR_STOP on
\timing on

\if :{?wechat_performance_target}
\else
  \set wechat_performance_target __missing__
\endif
\if :{?wechat_performance_confirmation}
\else
  \set wechat_performance_confirmation __missing__
\endif
\if :{?wechat_performance_staging_project_ref}
\else
  \set wechat_performance_staging_project_ref __missing__
\endif
\if :{?wechat_performance_preflight_only}
\else
  \set wechat_performance_preflight_only no
\endif

select
  (
    :'wechat_performance_preflight_only' in ('yes', 'no')
    and (
      (
        :'wechat_performance_target' = 'local'
        and :'wechat_performance_confirmation' = 'WECHAT_PERFORMANCE_LOCAL'
        and current_database() = 'postgres'
        and current_user = 'postgres'
        and inet_server_port() = 5432
        and :'DBNAME' = 'postgres'
        and lower(:'HOST') in ('127.0.0.1', 'localhost', '::1')
        and :'PORT' = '54322'
        and current_setting('supabase.endpoint', true) is null
        and coalesce(
          inet_server_addr() <<= '127.0.0.0/8'::inet
          or inet_server_addr() <<= '10.0.0.0/8'::inet
          or inet_server_addr() <<= '172.16.0.0/12'::inet
          or inet_server_addr() <<= '192.168.0.0/16'::inet
          or inet_server_addr() <<= '::1/128'::inet
          or inet_server_addr() <<= 'fc00::/7'::inet,
          true
        )
      )
      or (
        :'wechat_performance_target' = 'staging'
        and :'wechat_performance_confirmation' = 'WECHAT_PERFORMANCE_STAGING'
        and :'wechat_performance_staging_project_ref' = 'jpgoimipbothfgkokyvm'
        and current_database() = 'postgres'
        and current_user = 'postgres'
        and inet_server_port() = 5432
        and :'DBNAME' = 'postgres'
        and :'PORT' = '5432'
        and (
          (
            lower(:'HOST') = 'db.jpgoimipbothfgkokyvm.supabase.co'
            and :'USER' = 'postgres'
          )
          or (
            lower(:'HOST') = 'aws-1-sa-east-1.pooler.supabase.com'
            and :'USER' = 'postgres.jpgoimipbothfgkokyvm'
          )
        )
        and coalesce(
          (select ssl from pg_catalog.pg_stat_ssl where pid = pg_backend_pid()),
          false
        )
        and coalesce(host(inet_server_addr()) not in ('127.0.0.1', '::1'), false)
      )
    )
  ) as wechat_performance_preflight_ok,
  case
    when :'wechat_performance_preflight_only' not in ('yes', 'no')
      then 'preflight-only must be yes or no'
    when :'wechat_performance_target' not in ('local', 'staging')
      then 'explicit local or staging target marker required'
    when :'wechat_performance_target' = 'local'
      and :'wechat_performance_confirmation' <> 'WECHAT_PERFORMANCE_LOCAL'
      then 'local confirmation marker missing'
    when :'wechat_performance_target' = 'staging'
      and :'wechat_performance_confirmation' <> 'WECHAT_PERFORMANCE_STAGING'
      then 'staging confirmation marker missing'
    when current_database() <> 'postgres' or :'DBNAME' <> 'postgres'
      then 'database name is not the expected postgres target'
    when current_user <> 'postgres' or inet_server_port() <> 5432
      then 'server user or internal port is not the expected Supabase target'
    when :'wechat_performance_target' = 'local'
      and not (
        lower(:'HOST') in ('127.0.0.1', 'localhost', '::1')
        and :'PORT' = '54322'
      )
      then 'local connection host or port is not the Supabase CLI target'
    when :'wechat_performance_target' = 'local'
      and current_setting('supabase.endpoint', true) is not null
      then 'local target exposes a hosted Supabase endpoint marker'
    when :'wechat_performance_target' = 'staging'
      and :'wechat_performance_staging_project_ref' <> 'jpgoimipbothfgkokyvm'
      then 'staging project ref is not the approved repository target'
    when :'wechat_performance_target' = 'staging'
      and not (
        :'PORT' = '5432'
        and (
          (
            lower(:'HOST') = 'db.jpgoimipbothfgkokyvm.supabase.co'
            and :'USER' = 'postgres'
          )
          or (
            lower(:'HOST') = 'aws-1-sa-east-1.pooler.supabase.com'
            and :'USER' = 'postgres.jpgoimipbothfgkokyvm'
          )
        )
      )
      then 'staging connection does not match the approved host and user'
    when :'wechat_performance_target' = 'staging'
      and not coalesce(
        (select ssl from pg_catalog.pg_stat_ssl where pid = pg_backend_pid()),
        false
      )
      then 'staging connection is not TLS protected'
    else 'server address is inconsistent with the selected target'
  end as wechat_performance_preflight_reason,
  :'wechat_performance_preflight_only' = 'yes'
    as wechat_performance_preflight_only_requested
\gset

\if :wechat_performance_preflight_ok
  \echo 'WECHAT-003 performance target preflight PASS:' :wechat_performance_target
\else
  \echo 'WECHAT-003 performance target preflight BLOCKED:' :wechat_performance_preflight_reason
  select 1 / 0 as wechat_performance_target_preflight_failed;
\endif

\if :wechat_performance_preflight_only_requested
  \echo 'WECHAT-003 preflight-only validation PASS; fixture skipped.'
  \quit
\endif

begin;
set local lock_timeout = '5s';
set local statement_timeout = '2min';

insert into auth.users (
  instance_id, id, aud, role, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000399',
  'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb,
  statement_timestamp(), statement_timestamp()
);

update public.profiles
set display_name = 'WECHAT-003 performance', profile_status = 'active'
where profile_id = '00000000-0000-4000-8000-000000000399';

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '10000000-0000-4000-8000-000000000399',
  'PERF399', 'WECHAT-003 performance shop', 'active'
);

insert into public.storefront_settings (
  shop_id, public_slug, currency_code, catalog_time_zone
) values (
  '10000000-0000-4000-8000-000000000399',
  'wechat-003-perf-399', 'CLP', 'America/Santiago'
);

insert into public.shop_members (
  profile_id, shop_id, role_key, membership_status
) values (
  '00000000-0000-4000-8000-000000000399',
  '10000000-0000-4000-8000-000000000399',
  'viewer', 'active'
);

-- The production catalog triggers enforce writes and emit sync/revision events.
-- Loading 20k deterministic rows through them would measure the write path and
-- exhaust transaction advisory-lock slots. This local, rolled-back probe keeps
-- constraints/indexes active and disables only user triggers during fixture load.
alter table public.inventory_categories disable trigger user;
alter table public.inventory_suppliers disable trigger user;
alter table public.inventory_products disable trigger user;
alter table public.inventory_product_prices disable trigger user;

-- 200 categories, every tenth archived.
insert into public.inventory_categories (
  id, owner_user_id, shop_id, name, updated_at, deleted_at
)
select
  ('21000000-0000-4000-8001-' || lpad(item::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000399'::uuid,
  '10000000-0000-4000-8000-000000000399'::uuid,
  'Performance category ' || lpad(item::text, 3, '0'),
  statement_timestamp() - make_interval(secs => item * 20),
  case when item % 10 = 0
    then statement_timestamp() - make_interval(secs => item * 20 - 1)
  end
from generate_series(1, 200) item;

-- 100 suppliers, every tenth archived.
insert into public.inventory_suppliers (
  id, owner_user_id, shop_id, name, updated_at, deleted_at
)
select
  ('22000000-0000-4000-8001-' || lpad(item::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000399'::uuid,
  '10000000-0000-4000-8000-000000000399'::uuid,
  'Performance supplier ' || lpad(item::text, 3, '0'),
  statement_timestamp() - make_interval(secs => item * 30),
  case when item % 10 = 0
    then statement_timestamp() - make_interval(secs => item * 30 - 1)
  end
from generate_series(1, 100) item;

-- 20k products distributed over active categories/suppliers; 10% archived.
insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, item_number, product_name,
  category_id, supplier_id, retail_price, purchase_price,
  stock_quantity, updated_at, deleted_at
)
select
  ('23000000-0000-4000-8001-' || lpad(item::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000399'::uuid,
  '10000000-0000-4000-8000-000000000399'::uuid,
  'W3-PERF-' || lpad(item::text, 8, '0'),
  'W3-SKU-' || lpad(item::text, 8, '0'),
  'WECHAT-003 performance product ' || item,
  (
    '21000000-0000-4000-8001-'
    || lpad((
      (((item - 1) % 180) / 9) * 10
      + ((item - 1) % 180) % 9
      + 1
    )::text, 12, '0')
  )::uuid,
  (
    '22000000-0000-4000-8001-'
    || lpad((
      (((item - 1) % 90) / 9) * 10
      + ((item - 1) % 90) % 9
      + 1
    )::text, 12, '0')
  )::uuid,
  (item % 100000)::double precision / 10,
  (item % 50000)::double precision / 10,
  (item % 300)::double precision,
  statement_timestamp() - make_interval(secs => item),
  case when item % 10 = 0
    then statement_timestamp() - make_interval(secs => item - 1)
  end
from generate_series(1, 20000) item;

-- 20k distributed current/history prices (two per first 10k products).
insert into public.inventory_product_prices (
  id, owner_user_id, shop_id, product_id, type, price,
  effective_at, source, created_at, updated_at
)
select
  ('24000000-0000-4000-8001-' || lpad(item::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000399'::uuid,
  '10000000-0000-4000-8000-000000000399'::uuid,
  (
    '23000000-0000-4000-8001-'
    || lpad((((item - 1) % 10000) + 1)::text, 12, '0')
  )::uuid,
  case when item <= 10000 then 'PURCHASE' else 'RETAIL' end,
  (item % 100000)::double precision / 10,
  to_char(
    statement_timestamp() - make_interval(secs => item),
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ),
  'wechat_003_performance_fixture',
  to_char(
    statement_timestamp() - make_interval(secs => item),
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ),
  statement_timestamp() - make_interval(secs => item)
from generate_series(1, 20000) item;

-- A hot product with 10k historical prices exercises bounded price history.
insert into public.inventory_product_prices (
  id, owner_user_id, shop_id, product_id, type, price,
  effective_at, source, created_at, updated_at
)
select
  ('24000000-0000-4000-8002-' || lpad(item::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000399'::uuid,
  '10000000-0000-4000-8000-000000000399'::uuid,
  '23000000-0000-4000-8001-000000000001'::uuid,
  case when item % 2 = 0 then 'PURCHASE' else 'RETAIL' end,
  (item % 100000)::double precision / 10,
  to_char(
    statement_timestamp() - make_interval(secs => item + 20000),
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ),
  'wechat_003_performance_fixture',
  to_char(
    statement_timestamp() - make_interval(secs => item + 20000),
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ),
  statement_timestamp() - make_interval(secs => item + 20000)
from generate_series(1, 10000) item;

alter table public.inventory_categories enable trigger user;
alter table public.inventory_suppliers enable trigger user;
alter table public.inventory_product_prices enable trigger user;

-- 5k finalized private image versions, one current image per product.
insert into public.inventory_product_image_versions (
  id, shop_id, product_id, status, main_path, thumb_path,
  expected_main_sha256, expected_main_bytes,
  expected_main_width, expected_main_height, expected_main_mime_type,
  expected_thumb_sha256, expected_thumb_bytes,
  expected_thumb_width, expected_thumb_height, expected_thumb_mime_type,
  verified_main_sha256, verified_main_bytes,
  verified_main_width, verified_main_height, verified_main_mime_type,
  verified_thumb_sha256, verified_thumb_bytes,
  verified_thumb_width, verified_thumb_height, verified_thumb_mime_type,
  requested_by_profile_id, finalized_by_profile_id, actor_kind,
  created_at, expires_at, finalized_at, cleanup_status
)
select
  image_id,
  '10000000-0000-4000-8000-000000000399'::uuid,
  product_id,
  'ready',
  'shops/10000000-0000-4000-8000-000000000399/products/'
    || product_id::text || '/primary/' || image_id::text || '/main.jpg',
  'shops/10000000-0000-4000-8000-000000000399/products/'
    || product_id::text || '/primary/' || image_id::text || '/thumb.jpg',
  main_sha, 524288, 1200, 1200, 'image/jpeg',
  thumb_sha, 65536, 320, 320, 'image/jpeg',
  main_sha, 524288, 1200, 1200, 'image/jpeg',
  thumb_sha, 65536, 320, 320, 'image/jpeg',
  '00000000-0000-4000-8000-000000000399'::uuid,
  '00000000-0000-4000-8000-000000000399'::uuid,
  'personal_account',
  created_at,
  created_at + interval '2 hours',
  created_at + interval '10 minutes',
  'not_due'
from (
  select
    ('25000000-0000-4000-8001-' || lpad(item::text, 12, '0'))::uuid
      as image_id,
    ('23000000-0000-4000-8001-' || lpad(item::text, 12, '0'))::uuid
      as product_id,
    md5('wechat-003-main-' || item) || md5('main-' || item) as main_sha,
    md5('wechat-003-thumb-' || item) || md5('thumb-' || item) as thumb_sha,
    statement_timestamp() - make_interval(secs => item) as created_at
  from generate_series(1, 5000) item
) fixture;

update public.inventory_products product
set primary_image_version_id = image.id,
    primary_image_updated_at = image.finalized_at
from public.inventory_product_image_versions image
where product.shop_id = '10000000-0000-4000-8000-000000000399'
  and image.shop_id = product.shop_id
  and image.product_id = product.id;

alter table public.inventory_products enable trigger user;

-- 30k safe/redacted history rows: catalog events, private-image events and
-- unrelated shop audit noise interleaved so the allowlist filter is exercised.
insert into public.audit_logs (
  audit_log_id, actor_profile_id, scope, shop_id, event_key,
  severity, result, target_type, target_id, metadata_redacted, created_at
)
select
  ('26000000-0000-4000-8001-' || lpad(item::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000399'::uuid,
  'shop',
  '10000000-0000-4000-8000-000000000399'::uuid,
  event_key,
  'info',
  'success',
  target_type,
  target_id,
  case
    when event_key like 'shop.product_image.%' then jsonb_build_object(
      'correlation_id', correlation_id,
      'product_id', product_id,
      'source', 'product_image_api'
    )
    when event_key like 'shop.wechat.catalog.%' then jsonb_build_object(
      'correlation_id', correlation_id,
      'operation', operation,
      'source', 'mini_program'
    )
    else jsonb_build_object('source', 'performance_fixture_noise')
  end,
  statement_timestamp() - make_interval(secs => item)
from (
  select
    item,
    product_id,
    category_id,
    supplier_id,
    correlation_id,
    case item % 15
      when 0 then 'shop.settings.updated'
      when 1 then 'shop.wechat.catalog.product.created'
      when 2 then 'shop.wechat.catalog.product.updated'
      when 3 then 'shop.wechat.catalog.product.archived'
      when 4 then 'shop.wechat.catalog.product.restored'
      when 5 then 'shop.wechat.catalog.product.price_changed'
      when 6 then 'shop.wechat.catalog.product.category_changed'
      when 7 then 'shop.wechat.catalog.product.supplier_changed'
      when 8 then 'shop.wechat.catalog.category.updated'
      when 9 then 'shop.wechat.catalog.category.archived'
      when 10 then 'shop.wechat.catalog.supplier.updated'
      when 11 then 'shop.wechat.catalog.supplier.restored'
      when 12 then 'shop.product_image.finalized'
      when 13 then 'shop.product_image.replaced'
      else 'shop.product_image.removed'
    end as event_key,
    case item % 15
      when 0 then 'shop_setting'
      when 8 then 'inventory_category'
      when 9 then 'inventory_category'
      when 10 then 'inventory_supplier'
      when 11 then 'inventory_supplier'
      when 12 then 'inventory_product_image'
      when 13 then 'inventory_product_image'
      when 14 then 'inventory_product_image'
      else 'inventory_product'
    end as target_type,
    case item % 15
      when 0 then null
      when 8 then category_id::text
      when 9 then category_id::text
      when 10 then supplier_id::text
      when 11 then supplier_id::text
      when 12 then image_id::text
      when 13 then image_id::text
      when 14 then image_id::text
      else product_id::text
    end as target_id,
    case item % 15
      when 1 then 'product_create'
      when 2 then 'product_update'
      when 3 then 'product_archive'
      when 4 then 'product_restore'
      when 5 then 'product_price_update'
      when 6 then 'product_update'
      when 7 then 'product_update'
      when 8 then 'category_update'
      when 9 then 'category_archive'
      when 10 then 'supplier_update'
      when 11 then 'supplier_restore'
    end as operation
  from (
    select
      item,
      ('23000000-0000-4000-8001-'
        || lpad((((item - 1) % 20000) + 1)::text, 12, '0'))::uuid
        as product_id,
      ('21000000-0000-4000-8001-'
        || lpad((((item - 1) % 200) + 1)::text, 12, '0'))::uuid
        as category_id,
      ('22000000-0000-4000-8001-'
        || lpad((((item - 1) % 100) + 1)::text, 12, '0'))::uuid
        as supplier_id,
      ('25000000-0000-4000-8001-'
        || lpad((((item - 1) % 5000) + 1)::text, 12, '0'))::uuid
        as image_id,
      ('27000000-0000-4000-8001-'
        || lpad(item::text, 12, '0'))::uuid as correlation_id
    from generate_series(1, 30000) item
  ) ids
) history;

analyze public.inventory_categories;
analyze public.inventory_suppliers;
analyze public.inventory_products;
analyze public.inventory_product_prices;
analyze public.inventory_product_image_versions;
analyze public.audit_logs;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000399',
  true
);

select 'fixture_counts' as evidence,
  (select count(*) from public.inventory_products
    where shop_id = '10000000-0000-4000-8000-000000000399') as products,
  (select count(*) from public.inventory_categories
    where shop_id = '10000000-0000-4000-8000-000000000399') as categories,
  (select count(*) from public.inventory_suppliers
    where shop_id = '10000000-0000-4000-8000-000000000399') as suppliers,
  (select count(*) from public.inventory_product_prices
    where shop_id = '10000000-0000-4000-8000-000000000399') as prices,
  (select count(*) from public.inventory_product_image_versions
    where shop_id = '10000000-0000-4000-8000-000000000399') as images,
  (select count(*) from public.audit_logs
    where shop_id = '10000000-0000-4000-8000-000000000399') as audit_rows;

\echo 'WECHAT-003 lifecycle: active product first page'
explain (analyze, buffers, timing, summary)
select * from public.wechat_catalog_lifecycle_page_v2(
  '10000000-0000-4000-8000-000000000399',
  'product', 'active', 50, null, null
);

\echo 'WECHAT-003 lifecycle: active product second keyset page'
explain (analyze, buffers, timing, summary)
with cursor_row as materialized (
  select updated_at, id
  from public.inventory_products
  where shop_id = '10000000-0000-4000-8000-000000000399'
    and deleted_at is null
  order by updated_at desc, id desc
  offset 49 limit 1
)
select page.*
from cursor_row
cross join lateral public.wechat_catalog_lifecycle_page_v2(
  '10000000-0000-4000-8000-000000000399',
  'product', 'active', 50, cursor_row.updated_at, cursor_row.id
) page;

\echo 'WECHAT-003 lifecycle: category counts first page'
explain (analyze, buffers, timing, summary)
select * from public.wechat_catalog_lifecycle_page_v2(
  '10000000-0000-4000-8000-000000000399',
  'category', 'all', 50, null, null
);

\echo 'WECHAT-003 lifecycle: supplier counts first page'
explain (analyze, buffers, timing, summary)
select * from public.wechat_catalog_lifecycle_page_v2(
  '10000000-0000-4000-8000-000000000399',
  'supplier', 'all', 50, null, null
);

\echo 'WECHAT-003 history: allowlisted first page'
explain (analyze, buffers, timing, summary)
select * from public.wechat_catalog_history_page_v1(
  '10000000-0000-4000-8000-000000000399',
  50, null, null, null, null, null, null, null
);

\echo 'WECHAT-003 history: allowlisted second keyset page'
explain (analyze, buffers, timing, summary)
with cursor_row as materialized (
  select audit_log_id, created_at
  from public.audit_logs
  where scope = 'shop'
    and shop_id = '10000000-0000-4000-8000-000000000399'
    and (
      event_key like 'shop.wechat.catalog.product.%'
      or event_key like 'shop.wechat.catalog.category.%'
      or event_key like 'shop.wechat.catalog.supplier.%'
      or event_key in (
        'shop.product_image.finalized',
        'shop.product_image.replaced',
        'shop.product_image.removed'
      )
    )
  order by created_at desc, audit_log_id desc
  offset 49 limit 1
)
select page.*
from cursor_row
cross join lateral public.wechat_catalog_history_page_v1(
  '10000000-0000-4000-8000-000000000399',
  50, null, null, null, null, null,
  cursor_row.created_at, cursor_row.audit_log_id
) page;

\echo 'WECHAT-003 history: filtered product updates'
explain (analyze, buffers, timing, summary)
select * from public.wechat_catalog_history_page_v1(
  '10000000-0000-4000-8000-000000000399',
  50, 'product', 'updated', null, null, null, null, null
);

\echo 'WECHAT-003 audit index: direct projection query shape'
explain (analyze, buffers, timing, summary)
select audit_log_id, created_at, actor_profile_id, event_key,
  target_id, metadata_redacted
from public.audit_logs
where scope = 'shop'
  and shop_id = '10000000-0000-4000-8000-000000000399'
  and (
    event_key like 'shop.wechat.catalog.product.%'
    or event_key like 'shop.wechat.catalog.category.%'
    or event_key like 'shop.wechat.catalog.supplier.%'
    or event_key in (
      'shop.product_image.finalized',
      'shop.product_image.replaced',
      'shop.product_image.removed'
    )
  )
  and (
    created_at,
    audit_log_id
  ) < (
    statement_timestamp() - interval '5 minutes',
    'ffffffff-ffff-4fff-bfff-ffffffffffff'::uuid
  )
order by created_at desc, audit_log_id desc
limit 50;

\echo 'WECHAT-003 price history: 10k-row hot product first page'
explain (analyze, buffers, timing, summary)
select * from public.wechat_price_history_page_v1(
  '10000000-0000-4000-8000-000000000399',
  '23000000-0000-4000-8001-000000000001',
  50, null, null
);

rollback;
