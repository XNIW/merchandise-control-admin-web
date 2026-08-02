-- Storefront v1 / TASK-013 compatibility correction
--
-- Incremental projection updates legitimately leave each row with the version at
-- which that row was last materialized. Public responses, however, must expose the
-- single current catalog version used by cursors and Home response validation.

begin;

alter function app_private.storefront_public_catalog_rows_v1(uuid, timestamptz)
  rename to storefront_public_catalog_rows_raw_v1;

revoke all on function app_private.storefront_public_catalog_rows_raw_v1(uuid, timestamptz)
  from public, anon, authenticated, service_role;

create function app_private.storefront_public_catalog_rows_v1(
  p_shop_id uuid,
  p_at timestamptz default statement_timestamp()
)
returns table (
  payload jsonb,
  publication_id uuid,
  category_id uuid,
  category_slug text,
  category_name text,
  category_sort_rank bigint,
  price_clp bigint,
  discount_bps integer,
  featured boolean,
  availability_mode text,
  sort_rank bigint,
  name_key text,
  search_text text,
  search_document tsvector
)
language sql
stable
security invoker
as $$
  select
    pg_catalog.jsonb_set(
      source.payload,
      '{catalogVersion}',
      pg_catalog.to_jsonb(version.catalog_version),
      false
    ),
    source.publication_id,
    source.category_id,
    source.category_slug,
    source.category_name,
    source.category_sort_rank,
    source.price_clp,
    source.discount_bps,
    source.featured,
    source.availability_mode,
    source.sort_rank,
    source.name_key,
    source.search_text,
    source.search_document
  from app_private.storefront_public_catalog_rows_raw_v1(p_shop_id, p_at) source
  join public.storefront_catalog_versions version
    on version.shop_id = p_shop_id;
$$;

revoke all on function app_private.storefront_public_catalog_rows_v1(uuid, timestamptz)
  from public, anon, authenticated, service_role;

comment on function app_private.storefront_public_catalog_rows_v1(uuid, timestamptz)
  is 'Customer-safe Storefront rows normalized to the current catalog version at the public read boundary.';

commit;
