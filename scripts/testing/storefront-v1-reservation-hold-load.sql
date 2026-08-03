begin;

set local role postgres;
set local search_path = public, pg_catalog;

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  ('02500000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
  'authenticated',
  'authenticated',
  'task025-load-' || sequence || '@example.invalid',
  '{"provider":"google","providers":["google"]}'::jsonb,
  '{}'::jsonb,
  statement_timestamp(),
  statement_timestamp()
from generate_series(1, 1200) sequence;

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '15250000-0000-4000-8000-000000000001',
  'SF25L',
  'Reservation hold bounded load fixture',
  'active'
);

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name, updated_at
) values (
  '35250000-0000-4000-8000-000000000001',
  '02500000-0000-4000-8000-000000000001',
  '15250000-0000-4000-8000-000000000001',
  'Reservation hold bounded load',
  statement_timestamp()
);

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  retail_price, stock_quantity, updated_at
) values (
  '25250000-0000-4000-8000-000000000001',
  '02500000-0000-4000-8000-000000000001',
  '15250000-0000-4000-8000-000000000001',
  'SF25-LOAD',
  'Reservation hold bounded load product',
  '35250000-0000-4000-8000-000000000001',
  1000,
  5000,
  statement_timestamp()
);

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  delivery_enabled, reservation_enabled, require_product_image,
  availability_low_stock_threshold
) values (
  '15250000-0000-4000-8000-000000000001',
  'reservation-hold-load',
  true,
  true,
  false,
  true,
  false,
  10
);

insert into public.storefront_categories (
  id, shop_id, source_category_id, slug, public_name, publication_status
) values (
  '45250000-0000-4000-8000-000000000001',
  '15250000-0000-4000-8000-000000000001',
  '35250000-0000-4000-8000-000000000001',
  'reservation-hold-load',
  'Reservation hold bounded load',
  'published'
);

insert into public.storefront_product_publications (
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, pickup_enabled, delivery_enabled,
  reservation_enabled, availability_mode, published_at
) values (
  '55250000-0000-4000-8000-000000000001',
  '15250000-0000-4000-8000-000000000001',
  '25250000-0000-4000-8000-000000000001',
  'published',
  'Reservation hold bounded load product',
  '45250000-0000-4000-8000-000000000001',
  1000,
  true,
  false,
  true,
  'available',
  statement_timestamp()
);

insert into public.customer_reservation_holds (
  id, user_id, shop_id, publication_id, source_product_id, quantity,
  status, expires_at, terminal_at, create_idempotency_key,
  create_request_sha256, created_at, updated_at
)
select
  ('72500000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
  ('02500000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
  '15250000-0000-4000-8000-000000000001'::uuid,
  '55250000-0000-4000-8000-000000000001'::uuid,
  '25250000-0000-4000-8000-000000000001'::uuid,
  1,
  'active',
  case
    when sequence <= 1000
      then statement_timestamp() - interval '5 minutes'
    else statement_timestamp() + interval '10 minutes'
  end,
  null,
  ('62500000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
  repeat('a', 64),
  statement_timestamp() - interval '20 minutes',
  statement_timestamp() - interval '20 minutes'
from generate_series(1, 1200) sequence;

create temporary table task025_cleanup_load_metrics (
  call_number integer not null,
  duration_ms numeric not null,
  payload jsonb not null
) on commit drop;

do $load$
declare
  load_call integer;
  load_started_at timestamptz;
  load_payload jsonb;
begin
  for load_call in 1..4 loop
    load_started_at := clock_timestamp();
    load_payload := app_private.storefront_reservation_holds_expire_v1(
      400,
      statement_timestamp()
    );
    insert into task025_cleanup_load_metrics (
      call_number,
      duration_ms,
      payload
    ) values (
      load_call,
      extract(epoch from (clock_timestamp() - load_started_at)) * 1000,
      load_payload
    );
    exit when (load_payload ->> 'remainingExpired')::integer = 0;
  end loop;
end
$load$;

do $verify$
declare
  load_calls integer;
  load_processed integer;
  load_expired integer;
  load_maximum_batch integer;
  load_p95_ms numeric;
  load_remaining integer;
  load_future integer;
  load_terminal integer;
  load_stock double precision;
begin
  select
    count(*)::integer,
    sum((payload ->> 'processed')::integer)::integer,
    sum((payload ->> 'expired')::integer)::integer,
    max((payload ->> 'processed')::integer),
    (percentile_cont(0.95) within group (order by duration_ms))::numeric
  into
    load_calls,
    load_processed,
    load_expired,
    load_maximum_batch,
    load_p95_ms
  from task025_cleanup_load_metrics;

  select count(*)::integer into load_remaining
  from public.customer_reservation_holds hold
  where hold.shop_id = '15250000-0000-4000-8000-000000000001'
    and hold.status = 'active'
    and hold.expires_at <= statement_timestamp();

  select count(*)::integer into load_future
  from public.customer_reservation_holds hold
  where hold.shop_id = '15250000-0000-4000-8000-000000000001'
    and hold.status = 'active'
    and hold.expires_at > statement_timestamp();

  select count(*)::integer into load_terminal
  from public.customer_reservation_holds hold
  where hold.shop_id = '15250000-0000-4000-8000-000000000001'
    and hold.status = 'expired'
    and hold.terminal_at is not null;

  select product.stock_quantity into load_stock
  from public.inventory_products product
  where product.id = '25250000-0000-4000-8000-000000000001';

  if load_calls <> 3
    or load_processed <> 1000
    or load_expired <> 1000
    or load_maximum_batch > 400
    or load_p95_ms > 5000
    or load_remaining <> 0
    or load_future <> 200
    or load_terminal <> 1000
    or load_stock <> 5000 then
    raise exception 'TASK-025 bounded cleanup load verification failed';
  end if;
end
$verify$;

select jsonb_build_object(
  'apiVersion', 'storefront-reservation-hold-load.v1',
  'dataset', jsonb_build_object(
    'holds', 1200,
    'expiredEligible', 1000,
    'futureActive', 200,
    'products', 1,
    'customers', 1200
  ),
  'metrics', jsonb_build_object(
    'cleanupCalls', (select count(*) from task025_cleanup_load_metrics),
    'processed', (
      select sum((payload ->> 'processed')::integer)
      from task025_cleanup_load_metrics
    ),
    'expired', (
      select sum((payload ->> 'expired')::integer)
      from task025_cleanup_load_metrics
    ),
    'maximumBatch', (
      select max((payload ->> 'processed')::integer)
      from task025_cleanup_load_metrics
    ),
    'p50Ms', (
      select round(
        (percentile_cont(0.50) within group (order by duration_ms))::numeric,
        3
      )
      from task025_cleanup_load_metrics
    ),
    'p95Ms', (
      select round(
        (percentile_cont(0.95) within group (order by duration_ms))::numeric,
        3
      )
      from task025_cleanup_load_metrics
    ),
    'p99Ms', (
      select round(
        (percentile_cont(0.99) within group (order by duration_ms))::numeric,
        3
      )
      from task025_cleanup_load_metrics
    ),
    'totalCleanupMs', (
      select round(sum(duration_ms), 3)
      from task025_cleanup_load_metrics
    ),
    'fixtureExpiryLagSeconds', 300
  ),
  'result', jsonb_build_object(
    'remainingExpired', (
      select count(*)
      from public.customer_reservation_holds hold
      where hold.shop_id = '15250000-0000-4000-8000-000000000001'
        and hold.status = 'active'
        and hold.expires_at <= statement_timestamp()
    ),
    'futureActive', (
      select count(*)
      from public.customer_reservation_holds hold
      where hold.shop_id = '15250000-0000-4000-8000-000000000001'
        and hold.status = 'active'
        and hold.expires_at > statement_timestamp()
    ),
    'terminalExpired', (
      select count(*)
      from public.customer_reservation_holds hold
      where hold.shop_id = '15250000-0000-4000-8000-000000000001'
        and hold.status = 'expired'
        and hold.terminal_at is not null
    ),
    'onHandStock', (
      select product.stock_quantity
      from public.inventory_products product
      where product.id = '25250000-0000-4000-8000-000000000001'
    )
  )
)::text;

rollback;
