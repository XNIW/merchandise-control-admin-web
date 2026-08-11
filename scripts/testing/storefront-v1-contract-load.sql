\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

begin;
set local role postgres;

create temp table task010_timings (
  endpoint text not null,
  duration_ms double precision not null
);

create temp table task010_phase_start (
  phase text primary key,
  started_at timestamptz not null
);

create temp table task010_plan_signals (
  signal text primary key,
  value jsonb not null
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000010900',
  'authenticated', 'authenticated', 'storefront-load@example.invalid',
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.profiles (profile_id, display_name, profile_status)
values (
  '00000000-0000-4000-8000-000000010900',
  'Storefront load actor',
  'active'
)
on conflict (profile_id) do update
set display_name = excluded.display_name,
    profile_status = excluded.profile_status;

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '10000000-0000-4000-8000-000000010900',
  'SF10L',
  'Storefront TASK-010 load',
  'active'
);

insert into public.inventory_categories (id, owner_user_id, shop_id, name, updated_at)
select
  ('30000000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.id), 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000010900'::uuid,
  '10000000-0000-4000-8000-000000010900'::uuid,
  'Categoría ' || series.id,
  now()
from pg_catalog.generate_series(1, 100) series(id);

commit;

select pg_catalog.format(
  $batch$
    insert into public.inventory_products (
      id, owner_user_id, shop_id, barcode, product_name, category_id,
      retail_price, stock_quantity, updated_at
    )
    select
      ('20000000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.id), 12, '0'))::uuid,
      '00000000-0000-4000-8000-000000010900'::uuid,
      '10000000-0000-4000-8000-000000010900'::uuid,
      'SF10L-' || pg_catalog.lpad(series.id::text, 8, '0'),
      'Internal load ' || series.id,
      (
        '30000000-0000-4000-8000-'
        || pg_catalog.lpad(pg_catalog.to_hex(((series.id - 1) %% 100) + 1), 12, '0')
      )::uuid,
      1000 + (series.id %% 50000),
      25,
      now()
    from pg_catalog.generate_series(%s, %s) series(id)
  $batch$,
  batch_start,
  least(batch_start + 999, 22000)
)
from pg_catalog.generate_series(1, 22000, 1000) batch(batch_start)
\gexec

begin;
set local role postgres;

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, pickup_enabled, delivery_enabled,
  reservation_enabled, require_product_image, default_page_size, maximum_page_size
) values (
  '10000000-0000-4000-8000-000000010900',
  'task010-load',
  true, true, true, false, false, 24, 100
);

insert into public.storefront_categories (
  id, shop_id, source_category_id, slug, public_name,
  publication_status, sort_rank
)
select
  ('40000000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.id), 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000010900'::uuid,
  ('30000000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.id), 12, '0'))::uuid,
  'categoria-' || series.id,
  'Categoría ' || series.id,
  'published',
  series.id
from pg_catalog.generate_series(1, 100) series(id);

insert into task010_phase_start values ('bulk_publish', pg_catalog.clock_timestamp());

insert into public.storefront_product_publications (
  id, shop_id, source_product_id, publication_status, public_name,
  public_description, public_category_id, public_brand, public_barcode,
  public_search_aliases, retail_price_clp, compare_at_price_clp, featured,
  sort_rank, pickup_enabled, delivery_enabled, availability_mode, published_at
)
select
  ('50000000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.id), 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000010900'::uuid,
  ('20000000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.id), 12, '0'))::uuid,
  case
    when series.id <= 20000 then 'published'
    when series.id <= 21000 then 'draft'
    else 'paused'
  end,
  case when series.id % 7 = 0
    then 'Café 龙茶 producto ' || series.id
    else 'Café producto ' || series.id
  end,
  'Descripción pública sintética ' || series.id,
  (
    '40000000-0000-4000-8000-'
    || pg_catalog.lpad(pg_catalog.to_hex(((series.id - 1) % 100) + 1), 12, '0')
  )::uuid,
  'Marca ' || (series.id % 20),
  case when series.id % 10 = 0
    then '780' || pg_catalog.lpad(series.id::text, 10, '0')
    else null
  end,
  case when series.id % 5 = 0
    then array['alias ' || series.id, 'producto especial']
    else '{}'::text[]
  end,
  1000 + (series.id % 50000),
  case when series.id % 4 = 0 then 2000 + (series.id % 50000) else null end,
  series.id % 25 = 0,
  series.id,
  true,
  series.id % 3 = 0,
  case when series.id % 50 = 0 then 'low_stock' else 'available' end,
  case when series.id <= 20000 then now() else null end
from pg_catalog.generate_series(1, 22000) series(id);

create temp table task019_image_templates as
select
  pg_catalog.row_number() over (order by image_publication.id)::integer as template_number,
  image_publication.thumb_url,
  image_publication.card_url,
  image_publication.detail_url,
  image_publication.width,
  image_publication.height,
  image_publication.content_type,
  image_publication.content_sha256,
  true as real_staging_asset
from public.storefront_image_publications image_publication
where image_publication.shop_id <> '10000000-0000-4000-8000-000000010900'
  and image_publication.publication_status = 'published'
  and image_publication.thumb_url is not null
  and image_publication.card_url is not null
  and image_publication.detail_url is not null
  and image_publication.content_sha256 is not null
order by image_publication.id
limit 10;

insert into task019_image_templates (
  template_number, thumb_url, card_url, detail_url, width, height,
  content_type, content_sha256, real_staging_asset
)
select
  1,
  'https://local.supabase.invalid/storage/v1/object/public/storefront-product-images/task019/thumb.webp',
  'https://local.supabase.invalid/storage/v1/object/public/storefront-product-images/task019/card.webp',
  'https://local.supabase.invalid/storage/v1/object/public/storefront-product-images/task019/detail.webp',
  2,
  3,
  'image/webp',
  pg_catalog.repeat('a', 64),
  false
where not exists (select 1 from task019_image_templates);

insert into public.inventory_product_image_versions (
  id, shop_id, product_id, status, main_path, thumb_path,
  expected_main_sha256, expected_main_bytes, expected_main_width,
  expected_main_height, expected_thumb_sha256, expected_thumb_bytes,
  expected_thumb_width, expected_thumb_height, verified_main_sha256,
  verified_main_bytes, verified_main_width, verified_main_height,
  verified_main_mime_type, verified_thumb_sha256, verified_thumb_bytes,
  verified_thumb_width, verified_thumb_height, verified_thumb_mime_type,
  requested_by_profile_id, finalized_by_profile_id, actor_kind, finalized_at
)
select
  ('70000000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.id), 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000010900'::uuid,
  ('20000000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.id), 12, '0'))::uuid,
  'ready',
  'shops/10000000-0000-4000-8000-000000010900/products/'
    || ('20000000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.id), 12, '0'))
    || '/primary/'
    || ('70000000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.id), 12, '0'))
    || '/main.jpg',
  'shops/10000000-0000-4000-8000-000000010900/products/'
    || ('20000000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.id), 12, '0'))
    || '/primary/'
    || ('70000000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.id), 12, '0'))
    || '/thumb.jpg',
  pg_catalog.repeat('b', 64), 100, 2, 3,
  pg_catalog.repeat('b', 64), 100, 2, 3,
  pg_catalog.repeat('b', 64), 100, 2, 3, 'image/jpeg',
  pg_catalog.repeat('b', 64), 100, 2, 3, 'image/jpeg',
  '00000000-0000-4000-8000-000000010900'::uuid,
  '00000000-0000-4000-8000-000000010900'::uuid,
  'personal_account',
  now()
from pg_catalog.generate_series(1, 100) series(id);

insert into public.storefront_image_publications (
  id, shop_id, source_product_id, source_image_version_id,
  publication_status, version_key, thumb_url, card_url, detail_url,
  width, height, content_type, content_sha256, published_at
)
select
  ('71000000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.id), 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000010900'::uuid,
  ('20000000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.id), 12, '0'))::uuid,
  ('70000000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.id), 12, '0'))::uuid,
  'published',
  ('70000000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.id), 12, '0')),
  template.thumb_url,
  template.card_url,
  template.detail_url,
  template.width,
  template.height,
  template.content_type,
  template.content_sha256,
  now()
from pg_catalog.generate_series(1, 100) series(id)
join task019_image_templates template
  on template.template_number = (
    ((series.id - 1) % (select count(*) from task019_image_templates)) + 1
  );

update public.storefront_product_publications publication
set published_image_version_id = mapping.image_publication_id
from (
  select
    ('50000000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.id), 12, '0'))::uuid
      as publication_id,
    ('71000000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.id), 12, '0'))::uuid
      as image_publication_id
  from pg_catalog.generate_series(1, 100) series(id)
) mapping
where publication.shop_id = '10000000-0000-4000-8000-000000010900'
  and publication.id = mapping.publication_id;

insert into task010_timings
select
  'bulk_publish_projection',
  extract(epoch from (pg_catalog.clock_timestamp() - started_at)) * 1000
from task010_phase_start
where phase = 'bulk_publish';

insert into public.storefront_promotions (
  id, shop_id, public_name, publication_status, discount_type,
  discount_value, priority, starts_at, ends_at
) values (
  '60000000-0000-4000-8000-000000010900',
  '10000000-0000-4000-8000-000000010900',
  'Diez por ciento load',
  'active',
  'percentage_bps',
  1000,
  10,
  now() - interval '1 hour',
  now() + interval '1 day'
);

insert into task010_phase_start values ('promotion_rebuild', pg_catalog.clock_timestamp());

insert into public.storefront_promotion_products (shop_id, promotion_id, publication_id)
select
  '10000000-0000-4000-8000-000000010900'::uuid,
  '60000000-0000-4000-8000-000000010900'::uuid,
  ('50000000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.id), 12, '0'))::uuid
from pg_catalog.generate_series(4, 20000, 4) series(id);

insert into task010_timings
select
  'promotion_projection_rebuild',
  extract(epoch from (pg_catalog.clock_timestamp() - started_at)) * 1000
from task010_phase_start
where phase = 'promotion_rebuild';

analyze public.storefront_catalog_items;
analyze public.storefront_product_publications;
analyze public.storefront_promotion_products;

do $plans$
declare
  plan_document jsonb;
begin
  execute $catalog_plan$
    explain (format json)
    select item.publication_id
    from public.storefront_catalog_items item
    where item.shop_id = '10000000-0000-4000-8000-000000010900'::uuid
    order by item.sort_rank, pg_catalog.lower(item.public_name), item.publication_id
    limit 25
  $catalog_plan$ into plan_document;
  insert into task010_plan_signals values (
    'catalogKeysetIndexUsed',
    pg_catalog.to_jsonb(
      plan_document::text like '%storefront_catalog_items_shop_catalog_keyset_v1_idx%'
    )
  );

  execute $search_plan$
    explain (format json)
    select item.publication_id
    from public.storefront_catalog_items item
    where item.shop_id = '10000000-0000-4000-8000-000000010900'::uuid
      and item.search_document @@ pg_catalog.plainto_tsquery('simple', 'producto 19999')
    limit 25
  $search_plan$ into plan_document;
  insert into task010_plan_signals values (
    'searchFtsIndexUsed',
    pg_catalog.to_jsonb(
      plan_document::text like '%storefront_catalog_items_search_document_idx%'
    )
  );

  execute $api_plan$
    explain (analyze, buffers, format json)
    select public.storefront_catalog_v1(
      'task010-load', null, 24, null, null, null, null, 'catalog'
    )
  $api_plan$ into plan_document;
  insert into task010_plan_signals values (
    'catalogExplainExecutionMs',
    pg_catalog.to_jsonb((plan_document #>> '{0,Execution Time}')::numeric)
  );
end;
$plans$;

do $measure$
declare
  sample integer;
  started_at timestamptz;
begin
  for sample in 1..30 loop
    started_at := pg_catalog.clock_timestamp();
    perform public.storefront_catalog_v1(
      'task010-load', null, 24, null, null, null, null, 'catalog'
    );
    insert into task010_timings values (
      'catalog_page',
      extract(epoch from (pg_catalog.clock_timestamp() - started_at)) * 1000
    );

    started_at := pg_catalog.clock_timestamp();
    perform public.storefront_search_v1(
      'task010-load', 'cafe producto', null, 24, null
    );
    insert into task010_timings values (
      'search',
      extract(epoch from (pg_catalog.clock_timestamp() - started_at)) * 1000
    );

    started_at := pg_catalog.clock_timestamp();
    perform public.storefront_product_detail_v1(
      'task010-load',
      (
        '50000000-0000-4000-8000-'
        || pg_catalog.lpad(pg_catalog.to_hex(((sample * 613) % 20000) + 1), 12, '0')
      )::uuid
    );
    insert into task010_timings values (
      'product_detail',
      extract(epoch from (pg_catalog.clock_timestamp() - started_at)) * 1000
    );
  end loop;

  started_at := pg_catalog.clock_timestamp();
  perform app_private.storefront_catalog_rebuild_shop_v1(
    '10000000-0000-4000-8000-000000010900',
    statement_timestamp()
  );
  insert into task010_timings values (
    'idempotent_projection_rebuild',
    extract(epoch from (pg_catalog.clock_timestamp() - started_at)) * 1000
  );
end;
$measure$;

select pg_catalog.jsonb_build_object(
  'dataset', pg_catalog.jsonb_build_object(
    'products', (select count(*) from public.inventory_products
      where shop_id = '10000000-0000-4000-8000-000000010900'),
    'publications', (select count(*) from public.storefront_product_publications
      where shop_id = '10000000-0000-4000-8000-000000010900'),
    'publishedProducts', (select count(*) from public.storefront_product_publications
      where shop_id = '10000000-0000-4000-8000-000000010900'
        and publication_status = 'published'),
    'draftProducts', (select count(*) from public.storefront_product_publications
      where shop_id = '10000000-0000-4000-8000-000000010900'
        and publication_status = 'draft'),
    'pausedProducts', (select count(*) from public.storefront_product_publications
      where shop_id = '10000000-0000-4000-8000-000000010900'
        and publication_status = 'paused'),
    'categories', (select count(*) from public.storefront_categories
      where shop_id = '10000000-0000-4000-8000-000000010900'),
    'projectionRows', (select count(*) from public.storefront_catalog_items
      where shop_id = '10000000-0000-4000-8000-000000010900'),
    'availabilitySignals', (select count(*)
      from app_private.storefront_product_availability_signals
      where shop_id = '10000000-0000-4000-8000-000000010900'),
    'availabilityStateCounts', (
      select pg_catalog.jsonb_object_agg(signal_state, state_count)
      from (
        select signal.signal_state, count(*) as state_count
        from app_private.storefront_product_availability_signals signal
        where signal.shop_id = '10000000-0000-4000-8000-000000010900'
        group by signal.signal_state
      ) availability_states
    ),
    'projectionIndexBytes', (
      select sum(pg_catalog.pg_relation_size(index_row.indexrelid))
      from pg_catalog.pg_index index_row
      where index_row.indrelid = 'public.storefront_catalog_items'::regclass
    ),
    'promotionLinks', (select count(*) from public.storefront_promotion_products
      where shop_id = '10000000-0000-4000-8000-000000010900'),
    'imagePublications', (select count(*) from public.storefront_image_publications
      where shop_id = '10000000-0000-4000-8000-000000010900'
        and publication_status = 'published'),
    'imageBackedProjectionRows', (select count(*) from public.storefront_catalog_items
      where shop_id = '10000000-0000-4000-8000-000000010900'
        and image_version_key is not null),
    'distinctImageUrls', (select count(distinct card_url)
      from public.storefront_image_publications
      where shop_id = '10000000-0000-4000-8000-000000010900'
        and publication_status = 'published'),
    'realImageTemplate', (select pg_catalog.bool_or(real_staging_asset)
      from task019_image_templates),
    'equivalentRows',
      (select count(*) from public.inventory_products
        where shop_id = '10000000-0000-4000-8000-000000010900')
      + (select count(*) from public.storefront_product_publications
        where shop_id = '10000000-0000-4000-8000-000000010900')
      + (select count(*) from public.storefront_catalog_items
        where shop_id = '10000000-0000-4000-8000-000000010900')
      + (select count(*)
        from app_private.storefront_product_availability_signals
        where shop_id = '10000000-0000-4000-8000-000000010900')
      + (select count(*) from public.storefront_promotion_products
        where shop_id = '10000000-0000-4000-8000-000000010900')
      + (select count(*) from public.storefront_image_publications
        where shop_id = '10000000-0000-4000-8000-000000010900')
      + (select count(*) from public.inventory_product_image_versions
        where shop_id = '10000000-0000-4000-8000-000000010900')
  ),
  'planSignals', (
    select pg_catalog.jsonb_object_agg(signal, value)
    from task010_plan_signals
  ),
  'metrics', (
    select pg_catalog.jsonb_object_agg(
      endpoint,
      pg_catalog.jsonb_build_object(
        'samples', samples,
        'p50Ms', pg_catalog.round(p50_ms::numeric, 3),
        'p95Ms', pg_catalog.round(p95_ms::numeric, 3),
        'p99Ms', pg_catalog.round(p99_ms::numeric, 3),
        'maxMs', pg_catalog.round(max_ms::numeric, 3)
      )
    )
    from (
      select
        endpoint,
        count(*) as samples,
        percentile_cont(0.50) within group (order by duration_ms) as p50_ms,
        percentile_cont(0.95) within group (order by duration_ms) as p95_ms,
        percentile_cont(0.99) within group (order by duration_ms) as p99_ms,
        max(duration_ms) as max_ms
      from task010_timings
      group by endpoint
    ) metric
  ),
  'catalogVersion', (
    select catalog_version
    from public.storefront_catalog_versions
    where shop_id = '10000000-0000-4000-8000-000000010900'
  )
)::text;

commit;

\if :storefront_hold_enabled
\warn TASK019_FIXTURE_READY hold_seconds=:storefront_hold_seconds
select pg_catalog.jsonb_build_object(
  'fixtureReady', true,
  'holdSeconds', :'storefront_hold_seconds'::integer
)::text;
\quit
\endif

begin;
set local role postgres;
delete from public.storefront_promotion_products
where shop_id = '10000000-0000-4000-8000-000000010900';
delete from public.storefront_promotions
where shop_id = '10000000-0000-4000-8000-000000010900';
delete from public.storefront_product_publications
where shop_id = '10000000-0000-4000-8000-000000010900';
delete from public.storefront_image_publications
where shop_id = '10000000-0000-4000-8000-000000010900';
delete from public.inventory_product_image_versions
where shop_id = '10000000-0000-4000-8000-000000010900';
delete from public.storefront_categories
where shop_id = '10000000-0000-4000-8000-000000010900';
delete from public.storefront_settings
where shop_id = '10000000-0000-4000-8000-000000010900';
delete from public.inventory_products
where shop_id = '10000000-0000-4000-8000-000000010900';
delete from public.inventory_categories
where shop_id = '10000000-0000-4000-8000-000000010900';
delete from public.shops
where shop_id = '10000000-0000-4000-8000-000000010900';
delete from auth.users
where id = '00000000-0000-4000-8000-000000010900';
commit;
