-- TASK-139: authoritative, snapshot-safe POS catalog pagination.
--
-- The Data API keeps api.max_rows = 1000. The page RPC returns one JSON row
-- and performs LIMIT page_size + 1 inside PostgreSQL, so PostgREST cannot hide
-- the continuation row. Catalog mutations advance a shop-scoped revision that
-- is checked by every continuation.

begin;

alter table public.inventory_product_prices
  add column if not exists updated_at timestamptz;

do $$
begin
  if exists (
    select 1
    from public.inventory_product_prices
    where created_at !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$'
      and created_at !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
  ) then
    raise exception
      'TASK-139 cannot backfill inventory_product_prices.updated_at: created_at is not a supported Room or ISO-8601 timestamp';
  end if;

  begin
    perform case
      when created_at like '%T%'
        then created_at::timestamptz
      else created_at::timestamp without time zone at time zone 'UTC'
    end
    from public.inventory_product_prices;
  exception when others then
    raise exception
      'TASK-139 cannot backfill inventory_product_prices.updated_at: created_at contains an invalid calendar timestamp';
  end;
end;
$$;

-- The existing append-only guard correctly rejects business rewrites, and the
-- sync-event trigger would treat this metadata-only backfill as a catalog
-- mutation. Pause only those two known triggers inside this transaction so the
-- migration neither fails nor emits artificial mobile sync events.
alter table public.inventory_product_prices
  disable trigger task088_mobile_price_append_only;
alter table public.inventory_product_prices
  disable trigger task088_mobile_sync_event;

update public.inventory_product_prices
set updated_at = case
  when created_at like '%T%'
    then created_at::timestamptz
  else created_at::timestamp without time zone at time zone 'UTC'
end
where updated_at is null;

alter table public.inventory_product_prices
  enable trigger task088_mobile_sync_event;
alter table public.inventory_product_prices
  enable trigger task088_mobile_price_append_only;

alter table public.inventory_product_prices
  alter column updated_at set default statement_timestamp(),
  alter column updated_at set not null;

create or replace function app_private.set_inventory_product_price_updated_at_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'updated_at') is distinct from
      (to_jsonb(old) - 'updated_at') then
    new.updated_at := statement_timestamp();
  else
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

revoke all on function app_private.set_inventory_product_price_updated_at_v2()
  from public, anon, authenticated;

drop trigger if exists task139_inventory_product_price_updated_at
  on public.inventory_product_prices;
create trigger task139_inventory_product_price_updated_at
  before update on public.inventory_product_prices
  for each row
  execute function app_private.set_inventory_product_price_updated_at_v2();

create index if not exists inventory_product_prices_shop_updated_id_v2_idx
  on public.inventory_product_prices (shop_id, updated_at, id)
  where shop_id is not null;
create index if not exists inventory_product_prices_owner_updated_id_v2_idx
  on public.inventory_product_prices (owner_user_id, updated_at, id)
  where shop_id is null;

create table if not exists app_private.pos_catalog_revisions (
  -- Intentionally no FK to shops: deleting a shop cascades through the catalog
  -- tables and their statement triggers may advance this tombstoned revision.
  -- Keeping it also prevents revision reuse if the same UUID is restored.
  shop_id uuid primary key,
  revision bigint not null default 1 check (revision >= 0),
  changed_at timestamptz not null default statement_timestamp()
);

revoke all on table app_private.pos_catalog_revisions
  from public, anon, authenticated;
grant select on table app_private.pos_catalog_revisions to service_role;
grant usage on schema app_private to service_role;

insert into app_private.pos_catalog_revisions (shop_id, revision, changed_at)
select shop.shop_id, 1, statement_timestamp()
from public.shops shop
on conflict (shop_id) do nothing;

create or replace function app_private.bump_pos_catalog_revisions_statement_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into app_private.pos_catalog_revisions (shop_id, revision, changed_at)
    select affected.shop_id, 1, statement_timestamp()
    from (
      select distinct rows.shop_id
      from new_rows rows
      where rows.shop_id is not null
      union
      select distinct source.shop_id
      from new_rows rows
      join public.shop_inventory_sources source
        on rows.shop_id is null
       and source.owner_user_id = rows.owner_user_id
       and source.mapping_state = 'mapped'
       and source.disabled_at is null
      where source.shop_id is not null
    ) affected
    on conflict (shop_id) do update
      set revision = app_private.pos_catalog_revisions.revision + 1,
          changed_at = excluded.changed_at;
  elsif tg_op = 'UPDATE' then
    insert into app_private.pos_catalog_revisions (shop_id, revision, changed_at)
    select affected.shop_id, 1, statement_timestamp()
    from (
      select distinct rows.shop_id
      from new_rows rows
      where rows.shop_id is not null
      union
      select distinct rows.shop_id
      from old_rows rows
      where rows.shop_id is not null
      union
      select distinct source.shop_id
      from new_rows rows
      join public.shop_inventory_sources source
        on rows.shop_id is null
       and source.owner_user_id = rows.owner_user_id
       and source.mapping_state = 'mapped'
       and source.disabled_at is null
      where source.shop_id is not null
      union
      select distinct source.shop_id
      from old_rows rows
      join public.shop_inventory_sources source
        on rows.shop_id is null
       and source.owner_user_id = rows.owner_user_id
       and source.mapping_state = 'mapped'
       and source.disabled_at is null
      where source.shop_id is not null
    ) affected
    on conflict (shop_id) do update
      set revision = app_private.pos_catalog_revisions.revision + 1,
          changed_at = excluded.changed_at;
  elsif tg_op = 'DELETE' then
    insert into app_private.pos_catalog_revisions (shop_id, revision, changed_at)
    select affected.shop_id, 1, statement_timestamp()
    from (
      select distinct rows.shop_id
      from old_rows rows
      where rows.shop_id is not null
      union
      select distinct source.shop_id
      from old_rows rows
      join public.shop_inventory_sources source
        on rows.shop_id is null
       and source.owner_user_id = rows.owner_user_id
       and source.mapping_state = 'mapped'
       and source.disabled_at is null
      where source.shop_id is not null
    ) affected
    on conflict (shop_id) do update
      set revision = app_private.pos_catalog_revisions.revision + 1,
          changed_at = excluded.changed_at;
  end if;

  return null;
end;
$$;

revoke all on function app_private.bump_pos_catalog_revisions_statement_v2()
  from public, anon, authenticated;

create or replace function app_private.bump_pos_catalog_mapping_revisions_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into app_private.pos_catalog_revisions (shop_id, revision, changed_at)
    select distinct rows.shop_id, 1, statement_timestamp()
    from new_rows rows
    where rows.shop_id is not null
    on conflict (shop_id) do update
      set revision = app_private.pos_catalog_revisions.revision + 1,
          changed_at = excluded.changed_at;
  elsif tg_op = 'UPDATE' then
    insert into app_private.pos_catalog_revisions (shop_id, revision, changed_at)
    select affected.shop_id, 1, statement_timestamp()
    from (
      select distinct rows.shop_id from new_rows rows where rows.shop_id is not null
      union
      select distinct rows.shop_id from old_rows rows where rows.shop_id is not null
    ) affected
    on conflict (shop_id) do update
      set revision = app_private.pos_catalog_revisions.revision + 1,
          changed_at = excluded.changed_at;
  elsif tg_op = 'DELETE' then
    insert into app_private.pos_catalog_revisions (shop_id, revision, changed_at)
    select distinct rows.shop_id, 1, statement_timestamp()
    from old_rows rows
    where rows.shop_id is not null
    on conflict (shop_id) do update
      set revision = app_private.pos_catalog_revisions.revision + 1,
          changed_at = excluded.changed_at;
  end if;

  return null;
end;
$$;

revoke all on function app_private.bump_pos_catalog_mapping_revisions_v2()
  from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'inventory_categories',
    'inventory_suppliers',
    'inventory_products',
    'inventory_product_prices'
  ]
  loop
    execute format('drop trigger if exists task139_catalog_revision_insert on public.%I', table_name);
    execute format('drop trigger if exists task139_catalog_revision_update on public.%I', table_name);
    execute format('drop trigger if exists task139_catalog_revision_delete on public.%I', table_name);
    execute format(
      'create trigger task139_catalog_revision_insert after insert on public.%I referencing new table as new_rows for each statement execute function app_private.bump_pos_catalog_revisions_statement_v2()',
      table_name
    );
    execute format(
      'create trigger task139_catalog_revision_update after update on public.%I referencing old table as old_rows new table as new_rows for each statement execute function app_private.bump_pos_catalog_revisions_statement_v2()',
      table_name
    );
    execute format(
      'create trigger task139_catalog_revision_delete after delete on public.%I referencing old table as old_rows for each statement execute function app_private.bump_pos_catalog_revisions_statement_v2()',
      table_name
    );
  end loop;
end;
$$;

drop trigger if exists task139_catalog_mapping_revision_insert
  on public.shop_inventory_sources;
drop trigger if exists task139_catalog_mapping_revision_update
  on public.shop_inventory_sources;
drop trigger if exists task139_catalog_mapping_revision_delete
  on public.shop_inventory_sources;
create trigger task139_catalog_mapping_revision_insert
  after insert on public.shop_inventory_sources
  referencing new table as new_rows
  for each statement
  execute function app_private.bump_pos_catalog_mapping_revisions_v2();
create trigger task139_catalog_mapping_revision_update
  after update on public.shop_inventory_sources
  referencing old table as old_rows new table as new_rows
  for each statement
  execute function app_private.bump_pos_catalog_mapping_revisions_v2();
create trigger task139_catalog_mapping_revision_delete
  after delete on public.shop_inventory_sources
  referencing old table as old_rows
  for each statement
  execute function app_private.bump_pos_catalog_mapping_revisions_v2();

create or replace function app_private.resolve_pos_catalog_scope_v2(
  p_shop_id uuid
)
returns table (
  scope_kind text,
  scope_id uuid,
  blocked boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  mapped_owner_id uuid;
  has_blocking_mapping boolean;
  has_shop_rows boolean;
begin
  select source.owner_user_id
    into mapped_owner_id
  from public.shop_inventory_sources source
  where source.shop_id = p_shop_id
    and source.mapping_state = 'mapped'
    and source.owner_user_id is not null
    and source.disabled_at is null
  order by source.created_at desc
  limit 1;

  select exists (
    select 1
    from public.shop_inventory_sources source
    where source.shop_id = p_shop_id
      and source.mapping_state <> 'mapped'
      and source.disabled_at is null
  ) into has_blocking_mapping;

  select
    exists (select 1 from public.inventory_products row where row.shop_id = p_shop_id)
    or exists (select 1 from public.inventory_categories row where row.shop_id = p_shop_id)
    or exists (select 1 from public.inventory_suppliers row where row.shop_id = p_shop_id)
  into has_shop_rows;

  if has_shop_rows or mapped_owner_id is null then
    scope_kind := 'shop_scoped';
    scope_id := p_shop_id;
    blocked := mapped_owner_id is null and has_blocking_mapping and not has_shop_rows;
  else
    scope_kind := 'legacy_owner_bridge';
    scope_id := mapped_owner_id;
    blocked := false;
  end if;

  return next;
end;
$$;

revoke all on function app_private.resolve_pos_catalog_scope_v2(uuid)
  from public, anon, authenticated;
grant execute on function app_private.resolve_pos_catalog_scope_v2(uuid)
  to service_role;

create or replace function public.pos_catalog_revision_v2(
  p_shop_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  resolved record;
  current_revision bigint;
  current_scope_key text;
begin
  if p_shop_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into resolved
  from app_private.resolve_pos_catalog_scope_v2(p_shop_id);

  if resolved.blocked then
    return jsonb_build_object('status', 'unmapped');
  end if;

  select revision into current_revision
  from app_private.pos_catalog_revisions
  where shop_id = p_shop_id;

  current_scope_key := substring(
    encode(extensions.digest(resolved.scope_id::text, 'sha256'), 'hex')
    from 1 for 32
  );

  return jsonb_build_object(
    'status', 'ok',
    'scopeKind', resolved.scope_kind,
    'scopeKey', current_scope_key,
    'revision', coalesce(current_revision, 0)::text
  );
end;
$$;

revoke all on function public.pos_catalog_revision_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.pos_catalog_revision_v2(uuid)
  to service_role;

create or replace function public.pos_catalog_pull_page_v2(
  p_shop_id uuid,
  p_mode text,
  p_lower_bound timestamptz,
  p_snapshot_at timestamptz,
  p_entity text,
  p_after_updated_at timestamptz,
  p_after_id uuid,
  p_limit integer,
  p_expected_revision text,
  p_expected_scope_kind text,
  p_expected_scope_key text,
  p_include_manifest boolean
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  resolved record;
  current_revision bigint;
  current_scope_key text;
  snapshot_at timestamptz := coalesce(p_snapshot_at, statement_timestamp());
  effective_entity text := p_entity;
  candidates jsonb := '[]'::jsonb;
  page_rows jsonb := '[]'::jsonb;
  entity_has_more boolean := false;
  manifest jsonb := null;
  summary_products bigint := 0;
  summary_categories bigint := 0;
  summary_suppliers bigint := 0;
  summary_prices bigint := 0;
  window_products bigint := 0;
  window_categories bigint := 0;
  window_suppliers bigint := 0;
  window_prices bigint := 0;
begin
  if p_shop_id is null
    or p_mode not in ('full_refresh', 'delta')
    or p_include_manifest is null
    or p_limit is null
    or p_limit < 1
    or p_limit > 1000
    or snapshot_at > statement_timestamp() + interval '1 minute'
    or (p_mode = 'delta' and p_lower_bound is null)
    or (p_mode = 'full_refresh' and p_lower_bound is not null)
    or (p_lower_bound is not null and p_lower_bound > snapshot_at)
    or ((p_after_updated_at is null) <> (p_after_id is null))
    or (p_entity is not null and p_entity not in ('categories', 'suppliers', 'products', 'prices'))
    or (
      p_include_manifest
      and (
        p_snapshot_at is not null
        or p_entity is not null
        or p_after_updated_at is not null
        or p_expected_revision is not null
        or p_expected_scope_kind is not null
        or p_expected_scope_key is not null
      )
    )
    or (
      p_include_manifest = false
      and (
        p_snapshot_at is null
        or p_entity is null
        or p_expected_revision is null
        or p_expected_scope_kind is null
        or p_expected_scope_key is null
      )
    )
  then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into resolved
  from app_private.resolve_pos_catalog_scope_v2(p_shop_id);

  if resolved.blocked then
    return jsonb_build_object('status', 'unmapped');
  end if;

  select revision into current_revision
  from app_private.pos_catalog_revisions
  where shop_id = p_shop_id;
  current_revision := coalesce(current_revision, 0);
  current_scope_key := substring(
    encode(extensions.digest(resolved.scope_id::text, 'sha256'), 'hex')
    from 1 for 32
  );

  if p_expected_revision is not null and
     (p_expected_revision !~ '^[0-9]{1,19}$'
      or p_expected_revision <> current_revision::text)
  then
    return jsonb_build_object('status', 'snapshot_changed');
  end if;

  if p_expected_scope_kind is not null and
     (p_expected_scope_kind <> resolved.scope_kind
      or p_expected_scope_key !~ '^[0-9a-f]{32}$'
      or p_expected_scope_key <> current_scope_key)
  then
    return jsonb_build_object('status', 'snapshot_changed');
  end if;

  if p_include_manifest then
    select count(*) into summary_products
    from public.inventory_products row
    where (
      (resolved.scope_kind = 'shop_scoped' and row.shop_id = p_shop_id)
      or
      (resolved.scope_kind = 'legacy_owner_bridge'
       and row.shop_id is null
       and row.owner_user_id = resolved.scope_id)
    )
      and row.deleted_at is null
      and row.updated_at <= snapshot_at;

    select count(*) into summary_categories
    from public.inventory_categories row
    where (
      (resolved.scope_kind = 'shop_scoped' and row.shop_id = p_shop_id)
      or
      (resolved.scope_kind = 'legacy_owner_bridge'
       and row.shop_id is null
       and row.owner_user_id = resolved.scope_id)
    )
      and row.deleted_at is null
      and row.updated_at <= snapshot_at;

    select count(*) into summary_suppliers
    from public.inventory_suppliers row
    where (
      (resolved.scope_kind = 'shop_scoped' and row.shop_id = p_shop_id)
      or
      (resolved.scope_kind = 'legacy_owner_bridge'
       and row.shop_id is null
       and row.owner_user_id = resolved.scope_id)
    )
      and row.deleted_at is null
      and row.updated_at <= snapshot_at;

    select count(*) into summary_prices
    from public.inventory_product_prices row
    where (
      (resolved.scope_kind = 'shop_scoped' and row.shop_id = p_shop_id)
      or
      (resolved.scope_kind = 'legacy_owner_bridge'
       and row.shop_id is null
       and row.owner_user_id = resolved.scope_id)
    )
      and row.updated_at <= snapshot_at
      and exists (
        select 1
        from public.inventory_products product
        where product.id = row.product_id
          and product.deleted_at is null
          and (
            (resolved.scope_kind = 'shop_scoped' and product.shop_id = p_shop_id)
            or
            (resolved.scope_kind = 'legacy_owner_bridge'
             and product.shop_id is null
             and product.owner_user_id = resolved.scope_id)
          )
      );

    select count(*) into window_categories
    from public.inventory_categories row
    where (
      (resolved.scope_kind = 'shop_scoped' and row.shop_id = p_shop_id)
      or
      (resolved.scope_kind = 'legacy_owner_bridge'
       and row.shop_id is null
       and row.owner_user_id = resolved.scope_id)
    )
      and row.updated_at <= snapshot_at
      and (p_mode = 'delta' or row.deleted_at is null)
      and (p_lower_bound is null or row.updated_at >= p_lower_bound);

    select count(*) into window_suppliers
    from public.inventory_suppliers row
    where (
      (resolved.scope_kind = 'shop_scoped' and row.shop_id = p_shop_id)
      or
      (resolved.scope_kind = 'legacy_owner_bridge'
       and row.shop_id is null
       and row.owner_user_id = resolved.scope_id)
    )
      and row.updated_at <= snapshot_at
      and (p_mode = 'delta' or row.deleted_at is null)
      and (p_lower_bound is null or row.updated_at >= p_lower_bound);

    select count(*) into window_products
    from public.inventory_products row
    where (
      (resolved.scope_kind = 'shop_scoped' and row.shop_id = p_shop_id)
      or
      (resolved.scope_kind = 'legacy_owner_bridge'
       and row.shop_id is null
       and row.owner_user_id = resolved.scope_id)
    )
      and row.updated_at <= snapshot_at
      and (p_mode = 'delta' or row.deleted_at is null)
      and (p_lower_bound is null or row.updated_at >= p_lower_bound);

    select count(*) into window_prices
    from public.inventory_product_prices row
    where (
      (resolved.scope_kind = 'shop_scoped' and row.shop_id = p_shop_id)
      or
      (resolved.scope_kind = 'legacy_owner_bridge'
       and row.shop_id is null
       and row.owner_user_id = resolved.scope_id)
    )
      and row.updated_at <= snapshot_at
      and (p_lower_bound is null or row.updated_at >= p_lower_bound)
      and exists (
        select 1
        from public.inventory_products product
        where product.id = row.product_id
          and product.deleted_at is null
          and (
            (resolved.scope_kind = 'shop_scoped' and product.shop_id = p_shop_id)
            or
            (resolved.scope_kind = 'legacy_owner_bridge'
             and product.shop_id is null
             and product.owner_user_id = resolved.scope_id)
          )
      );

    manifest := jsonb_build_object(
      'catalogSummary', jsonb_build_object(
        'products', summary_products,
        'activeProducts', summary_products,
        'categories', summary_categories,
        'suppliers', summary_suppliers,
        'prices', summary_prices
      ),
      'windowCounts', jsonb_build_object(
        'categories', window_categories,
        'suppliers', window_suppliers,
        'products', window_products,
        'prices', window_prices
      )
    );

    if effective_entity is null then
      effective_entity := case
        when window_categories > 0 then 'categories'
        when window_suppliers > 0 then 'suppliers'
        when window_products > 0 then 'products'
        when window_prices > 0 then 'prices'
        else 'done'
      end;
    end if;
  end if;

  if effective_entity is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  if effective_entity = 'categories' then
    select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.updated_at, candidate.id), '[]'::jsonb)
      into candidates
    from (
      select row.id, row.shop_id, row.owner_user_id, row.name, row.updated_at, row.deleted_at
      from public.inventory_categories row
      where (
        (resolved.scope_kind = 'shop_scoped' and row.shop_id = p_shop_id)
        or
        (resolved.scope_kind = 'legacy_owner_bridge'
         and row.shop_id is null
         and row.owner_user_id = resolved.scope_id)
      )
        and row.updated_at <= snapshot_at
        and (p_mode = 'delta' or row.deleted_at is null)
        and (p_lower_bound is null or row.updated_at >= p_lower_bound)
        and (p_after_updated_at is null or (row.updated_at, row.id) > (p_after_updated_at, p_after_id))
      order by row.updated_at, row.id
      limit p_limit + 1
    ) candidate;
  elsif effective_entity = 'suppliers' then
    select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.updated_at, candidate.id), '[]'::jsonb)
      into candidates
    from (
      select row.id, row.shop_id, row.owner_user_id, row.name, row.updated_at, row.deleted_at
      from public.inventory_suppliers row
      where (
        (resolved.scope_kind = 'shop_scoped' and row.shop_id = p_shop_id)
        or
        (resolved.scope_kind = 'legacy_owner_bridge'
         and row.shop_id is null
         and row.owner_user_id = resolved.scope_id)
      )
        and row.updated_at <= snapshot_at
        and (p_mode = 'delta' or row.deleted_at is null)
        and (p_lower_bound is null or row.updated_at >= p_lower_bound)
        and (p_after_updated_at is null or (row.updated_at, row.id) > (p_after_updated_at, p_after_id))
      order by row.updated_at, row.id
      limit p_limit + 1
    ) candidate;
  elsif effective_entity = 'products' then
    select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.updated_at, candidate.id), '[]'::jsonb)
      into candidates
    from (
      select
        row.id, row.shop_id, row.owner_user_id, row.barcode, row.item_number,
        row.product_name, row.second_product_name, row.purchase_price,
        row.retail_price, row.stock_quantity, row.supplier_id, row.category_id,
        row.updated_at, row.deleted_at
      from public.inventory_products row
      where (
        (resolved.scope_kind = 'shop_scoped' and row.shop_id = p_shop_id)
        or
        (resolved.scope_kind = 'legacy_owner_bridge'
         and row.shop_id is null
         and row.owner_user_id = resolved.scope_id)
      )
        and row.updated_at <= snapshot_at
        and (p_mode = 'delta' or row.deleted_at is null)
        and (p_lower_bound is null or row.updated_at >= p_lower_bound)
        and (p_after_updated_at is null or (row.updated_at, row.id) > (p_after_updated_at, p_after_id))
      order by row.updated_at, row.id
      limit p_limit + 1
    ) candidate;
  elsif effective_entity = 'prices' then
    select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.updated_at, candidate.id), '[]'::jsonb)
      into candidates
    from (
      select
        row.id, row.shop_id, row.owner_user_id, row.product_id, row.type,
        row.price, row.effective_at, row.source, row.created_at, row.updated_at
      from public.inventory_product_prices row
      where (
        (resolved.scope_kind = 'shop_scoped' and row.shop_id = p_shop_id)
        or
        (resolved.scope_kind = 'legacy_owner_bridge'
         and row.shop_id is null
         and row.owner_user_id = resolved.scope_id)
      )
        and row.updated_at <= snapshot_at
        and (p_lower_bound is null or row.updated_at >= p_lower_bound)
        and (p_after_updated_at is null or (row.updated_at, row.id) > (p_after_updated_at, p_after_id))
        and exists (
          select 1
          from public.inventory_products product
          where product.id = row.product_id
            and product.deleted_at is null
            and (
              (resolved.scope_kind = 'shop_scoped' and product.shop_id = p_shop_id)
              or
              (resolved.scope_kind = 'legacy_owner_bridge'
               and product.shop_id is null
               and product.owner_user_id = resolved.scope_id)
            )
        )
      order by row.updated_at, row.id
      limit p_limit + 1
    ) candidate;
  end if;

  entity_has_more := jsonb_array_length(candidates) > p_limit;
  page_rows := case
    when entity_has_more then candidates - p_limit
    else candidates
  end;

  return jsonb_build_object(
    'status', 'ok',
    'scopeKind', resolved.scope_kind,
    'scopeKey', current_scope_key,
    'revision', current_revision::text,
    'snapshotAt', snapshot_at,
    'entity', effective_entity,
    'entityHasMore', entity_has_more,
    'rows', page_rows,
    'manifest', manifest
  );
end;
$$;

revoke all on function public.pos_catalog_pull_page_v2(
  uuid, text, timestamptz, timestamptz, text, timestamptz, uuid, integer,
  text, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.pos_catalog_pull_page_v2(
  uuid, text, timestamptz, timestamptz, text, timestamptz, uuid, integer,
  text, text, text, boolean
) to service_role;

notify pgrst, 'reload schema';

commit;
