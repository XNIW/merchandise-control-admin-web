-- Guarded WECHAT-002 realistic-volume probe. Always rolls back.
--
-- Local contract:
--   psql -X "$LOCAL_DATABASE_URL" \
--     -v wechat_performance_target=local \
--     -v wechat_performance_confirmation=WECHAT_PERFORMANCE_LOCAL \
--     -f scripts/wechat-002-read-performance.sql
--
-- Staging is restricted to the repository's exact staging project and also
-- requires `-v wechat_performance_target=staging`,
-- `-v wechat_performance_confirmation=WECHAT_PERFORMANCE_STAGING`, and
-- `-v wechat_performance_staging_project_ref=<approved-ref>`.
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
  \echo 'WECHAT-002 performance target preflight PASS:' :wechat_performance_target
\else
  \echo 'WECHAT-002 performance target preflight BLOCKED:' :wechat_performance_preflight_reason
  select 1 / 0 as wechat_performance_target_preflight_failed;
\endif

\if :wechat_performance_preflight_only_requested
  \echo 'WECHAT-002 preflight-only validation PASS; fixture skipped.'
  \quit
\endif

begin;

insert into auth.users (
  instance_id, id, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000299',
  'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()
);
update public.profiles set display_name = 'WECHAT performance', profile_status = 'active'
where profile_id = '00000000-0000-4000-8000-000000000299';
insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values ('10000000-0000-4000-8000-000000000299', 'PERF299', 'Performance shop', 'active');
insert into public.storefront_settings (shop_id, public_slug, currency_code, catalog_time_zone)
values ('10000000-0000-4000-8000-000000000299', 'perf-299', 'CLP', 'America/Santiago');
insert into public.shop_members (profile_id, shop_id, role_key, membership_status)
values ('00000000-0000-4000-8000-000000000299', '10000000-0000-4000-8000-000000000299', 'viewer', 'active');
insert into public.inventory_categories (id, owner_user_id, shop_id, name)
values ('21000000-0000-4000-8000-000000000299', '00000000-0000-4000-8000-000000000299',
  '10000000-0000-4000-8000-000000000299', 'Performance category');
insert into public.inventory_suppliers (id, owner_user_id, shop_id, name)
values ('22000000-0000-4000-8000-000000000299', '00000000-0000-4000-8000-000000000299',
  '10000000-0000-4000-8000-000000000299', 'Performance supplier');

-- The production trigger takes one transaction-scoped advisory lock per
-- barcode. Disable only for this rolled-back bulk fixture so the query plan can
-- be measured without raising the local max_locks_per_transaction setting.
alter table public.inventory_products
  disable trigger cross_platform_product_union_barcode_guard;

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, item_number, product_name,
  category_id, supplier_id, retail_price, purchase_price, stock_quantity, updated_at
)
select
  gen_random_uuid(),
  '00000000-0000-4000-8000-000000000299'::uuid,
  '10000000-0000-4000-8000-000000000299'::uuid,
  'PERF-' || lpad(item::text, 8, '0'),
  'SKU-' || lpad(item::text, 8, '0'),
  'Performance product ' || item,
  '21000000-0000-4000-8000-000000000299'::uuid,
  '22000000-0000-4000-8000-000000000299'::uuid,
  item % 10000,
  item % 5000,
  item % 300,
  statement_timestamp() - make_interval(secs => item)
from generate_series(1, 20000) item;

with target as (
  select id from public.inventory_products
  where shop_id = '10000000-0000-4000-8000-000000000299'
  order by updated_at desc limit 1
)
insert into public.inventory_product_prices (
  id, owner_user_id, shop_id, product_id, type, price, effective_at, source, created_at
)
select
  gen_random_uuid(),
  '00000000-0000-4000-8000-000000000299'::uuid,
  '10000000-0000-4000-8000-000000000299'::uuid,
  target.id,
  'RETAIL',
  item % 10000,
  to_char(statement_timestamp() - make_interval(secs => item), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'performance_fixture',
  to_char(statement_timestamp() - make_interval(secs => item), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
from target cross join generate_series(1, 10000) item;

insert into public.staff_accounts (
  staff_id, shop_id, staff_code, display_name, role_key, status,
  credential_kind, credential_hash, credential_updated_at,
  credential_status, credential_version, must_change_credential
) values (
  '30000000-0000-4000-8000-000000000299',
  '10000000-0000-4000-8000-000000000299',
  'PERF299STAFF', 'Performance cashier', 'cashier', 'active',
  'pin', '$scrypt-v1$performance-fixture', statement_timestamp(),
  'active', 1, false
);
insert into public.shop_devices (
  shop_device_id, shop_id, device_identifier, device_type, display_name, status
) values (
  '40000000-0000-4000-8000-000000000299',
  '10000000-0000-4000-8000-000000000299',
  'PERF299-DEVICE', 'pos', 'Performance device', 'active'
);
insert into public.pos_device_credentials (
  pos_device_credential_id, shop_id, shop_device_id, staff_id,
  token_hash, staff_credential_version, status, issued_at, expires_at
) values (
  '50000000-0000-4000-8000-000000000299',
  '10000000-0000-4000-8000-000000000299',
  '40000000-0000-4000-8000-000000000299',
  '30000000-0000-4000-8000-000000000299',
  'sha256:' || repeat('a', 62) || '99',
  1, 'active', statement_timestamp() - interval '1 hour', statement_timestamp() + interval '1 day'
);
insert into public.pos_sessions (
  pos_session_id, shop_id, shop_device_id, staff_id, pos_device_credential_id,
  session_token_hash, staff_credential_version, status, issued_at, expires_at
) values (
  '60000000-0000-4000-8000-000000000299',
  '10000000-0000-4000-8000-000000000299',
  '40000000-0000-4000-8000-000000000299',
  '30000000-0000-4000-8000-000000000299',
  '50000000-0000-4000-8000-000000000299',
  'sha256:' || repeat('b', 62) || '99',
  1, 'active', statement_timestamp() - interval '1 hour', statement_timestamp() + interval '8 hours'
);
insert into public.pos_sales_sync_batches (
  pos_sales_sync_batch_id, shop_id, shop_code, shop_device_id, staff_id,
  pos_session_id, client_batch_id, idempotency_key, payload_hash,
  sale_count, line_count, status
)
select
  ('70000000-0000-4000-8000-' || lpad(batch::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000299'::uuid,
  'PERF299',
  '40000000-0000-4000-8000-000000000299'::uuid,
  '30000000-0000-4000-8000-000000000299'::uuid,
  '60000000-0000-4000-8000-000000000299'::uuid,
  'performance-batch-' || batch,
  'performance-batch-' || batch,
  'sha256:' || repeat(to_hex((batch % 15) + 1), 64),
  500, 0, 'accepted'
from generate_series(1, 20) batch;

insert into public.pos_sales (
  pos_sale_id, pos_sales_sync_batch_id, shop_id, shop_code, shop_device_id,
  staff_id, pos_session_id, client_sale_id, idempotency_key, payload_hash,
  sale_number, occurred_at, business_date, subtotal, total, status,
  source_schema_version, business_kind, gross_amount_clp,
  discount_amount_clp, net_amount_clp, paid_amount_clp, fiscal_status
)
select
  ('80000000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  ('70000000-0000-4000-8000-' || lpad((((item - 1) / 500) + 1)::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000299'::uuid,
  'PERF299',
  '40000000-0000-4000-8000-000000000299'::uuid,
  '30000000-0000-4000-8000-000000000299'::uuid,
  '60000000-0000-4000-8000-000000000299'::uuid,
  'performance-sale-' || item,
  'performance-sale-' || item,
  'sha256:' || md5(item::text) || md5('sale-' || item),
  'PERF-' || lpad(item::text, 8, '0'),
  statement_timestamp() - make_interval(secs => item),
  current_date - (item % 30),
  100, 100, 'accepted', 'pos-sales-ledger-v2',
  case when item % 20 = 0 then 'refund' else 'sale' end,
  100, 0, case when item % 20 = 0 then -100 else 100 end,
  case when item % 20 = 0 then 0 else 100 end, 'not_required'
from generate_series(1, 10000) item;

insert into public.pos_revenue_ledger_entries (
  pos_revenue_ledger_entry_id, pos_sale_id, pos_sales_sync_batch_id, shop_id,
  shop_device_id, staff_id, pos_session_id, business_date, occurred_at,
  entry_type, payment_method, amount_clp, client_entry_id
)
select
  gen_random_uuid(),
  ('80000000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  ('70000000-0000-4000-8000-' || lpad((((item - 1) / 500) + 1)::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000299'::uuid,
  '40000000-0000-4000-8000-000000000299'::uuid,
  '30000000-0000-4000-8000-000000000299'::uuid,
  '60000000-0000-4000-8000-000000000299'::uuid,
  current_date - (item % 30),
  statement_timestamp() - make_interval(secs => item),
  case when item % 20 = 0 then 'refund_item' else 'item' end,
  null,
  case when item % 20 = 0 then -100 else 100 end,
  'performance-item-' || item
from generate_series(1, 10000) item;

insert into public.pos_revenue_ledger_entries (
  pos_revenue_ledger_entry_id, pos_sale_id, pos_sales_sync_batch_id, shop_id,
  shop_device_id, staff_id, pos_session_id, business_date, occurred_at,
  entry_type, payment_method, amount_clp, client_entry_id
)
select
  gen_random_uuid(),
  ('80000000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  ('70000000-0000-4000-8000-' || lpad((((item - 1) / 500) + 1)::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000299'::uuid,
  '40000000-0000-4000-8000-000000000299'::uuid,
  '30000000-0000-4000-8000-000000000299'::uuid,
  '60000000-0000-4000-8000-000000000299'::uuid,
  current_date - (item % 30),
  statement_timestamp() - make_interval(secs => item),
  case when item % 20 = 0 then 'refund_payment' else 'payment' end,
  case when item % 3 = 0 then 'card' when item % 3 = 1 then 'cash' else 'transfer' end,
  case when item % 20 = 0 then -100 else 100 end,
  'performance-payment-' || item
from generate_series(1, 10000) item;

analyze public.inventory_products;
analyze public.inventory_product_prices;
analyze public.pos_sales;
analyze public.pos_revenue_ledger_entries;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000299', true);

explain (analyze, buffers, timing, summary)
select * from public.wechat_catalog_page_v1(
  '10000000-0000-4000-8000-000000000299', 50, null, null, null,
  null, 'updated_desc', null, null, null
);

explain (analyze, buffers, timing, summary)
select * from public.wechat_catalog_page_v1(
  '10000000-0000-4000-8000-000000000299', 50, 'product 19999', null, null,
  null, 'updated_desc', null, null, null
);

explain (analyze, buffers, timing, summary)
select * from public.wechat_price_history_page_v1(
  '10000000-0000-4000-8000-000000000299',
  (select id from public.inventory_products
    where shop_id = '10000000-0000-4000-8000-000000000299'
    order by updated_at desc limit 1),
  50, null, null
);

explain (analyze, buffers, timing, summary)
select * from public.wechat_sales_page_v2(
  '10000000-0000-4000-8000-000000000299', current_date - 29, current_date,
  50, null, null, 'accepted', null, null, null, null, null
);

explain (analyze, buffers, timing, summary)
select * from public.wechat_sales_period_summary_v1(
  '10000000-0000-4000-8000-000000000299', current_date - 29, current_date
);

rollback;
