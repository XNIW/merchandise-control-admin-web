-- MOBILE_STOREFRONT_PRODUCT_CONTROL / TASK-152
--
-- Additive Storefront authoring contract shared by Admin, Android and iOS.
-- The authoritative tables remain private behind SECURITY DEFINER RPCs.  The
-- public Client projection is intentionally unchanged.

begin;

alter table public.storefront_product_publications
  add column if not exists last_mutation_source text not null default 'admin',
  add column if not exists last_correlation_id uuid,
  add column if not exists last_changed_fields text[] not null default '{}'::text[];

alter table public.storefront_product_publications
  drop constraint if exists storefront_product_publications_mutation_source_check,
  add constraint storefront_product_publications_mutation_source_check check (
    last_mutation_source in ('admin', 'android', 'ios', 'system')
  ),
  drop constraint if exists storefront_product_publications_changed_fields_check,
  add constraint storefront_product_publications_changed_fields_check check (
    cardinality(last_changed_fields) <= 24
  );

comment on column public.storefront_product_publications.catalog_version is
  'Optimistic authoring version for one Storefront publication; independent from the global public projection version.';
comment on column public.storefront_product_publications.last_mutation_source is
  'Server-derived authoring source: admin, android, ios or system.';

create table app_private.storefront_authoring_receipts (
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  principal_key text not null,
  actor_profile_id uuid references public.profiles(profile_id),
  actor_staff_id uuid references public.staff_accounts(staff_id),
  idempotency_key uuid not null,
  operation text not null,
  request_sha256 text not null,
  response_payload jsonb,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default statement_timestamp() + interval '7 days',
  primary key (shop_id, principal_key, idempotency_key),
  constraint storefront_authoring_receipts_principal_check check (
    (actor_profile_id is not null)::integer +
    (actor_staff_id is not null)::integer = 1
  ),
  constraint storefront_authoring_receipts_operation_check check (
    operation in (
      'save_draft', 'publish', 'schedule', 'hide', 'archive',
      'bulk_publish', 'bulk_hide'
    )
  ),
  constraint storefront_authoring_receipts_hash_check check (
    request_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint storefront_authoring_receipts_expiry_check check (
    expires_at > created_at
  )
);

create index storefront_authoring_receipts_expiry_idx
  on app_private.storefront_authoring_receipts(expires_at);

revoke all on table app_private.storefront_authoring_receipts
  from public, anon, authenticated, service_role;

alter table public.staff_role_permissions
  drop constraint if exists staff_role_permissions_permission_key_check,
  add constraint staff_role_permissions_permission_key_check check (
    permission_key in (
      'shop_admin.full_access',
      'pos.sell', 'pos.pay', 'pos.refund', 'pos.void', 'pos.discount',
      'pos.discount_over_limit', 'catalog.view', 'catalog.manage',
      'catalog.price_edit', 'catalog.import', 'catalog.export', 'catalog.read',
      'catalog.write', 'register.view', 'register.manage', 'users.view',
      'users.manage', 'staff.read', 'staff.write', 'devices.read',
      'devices.write', 'db.maintenance', 'settings.view', 'settings.write',
      'settings.manage', 'settings.read', 'printer.manage', 'sync.manage',
      'sync.read', 'sync.write', 'history.write', 'pos.dashboard.read',
      'audit.view', 'audit.read',
      'storefront.view', 'storefront.edit', 'storefront.publish',
      'storefront.pricing.manage', 'storefront.bulk_publish',
      'storefront.promotions.manage', 'storefront.images.manage',
      'storefront.settings.manage', 'storefront.audit.view',
      'orders.view', 'orders.manage', 'orders.delivery.view',
      'orders.delivery.manage', 'orders.delivery.track'
    )
  );

create or replace function app_private.mac_admin_w7pos_009_pos_admin_permissions()
returns table(permission_key text)
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select permissions.permission_key
  from (
    values
      ('shop_admin.full_access'), ('pos.sell'), ('pos.pay'), ('pos.refund'),
      ('pos.void'), ('pos.discount'), ('catalog.view'), ('catalog.manage'),
      ('catalog.price_edit'), ('catalog.import'), ('catalog.export'),
      ('catalog.read'), ('catalog.write'), ('register.view'),
      ('register.manage'), ('users.view'), ('users.manage'), ('staff.read'),
      ('staff.write'), ('devices.read'), ('devices.write'),
      ('db.maintenance'), ('settings.view'), ('settings.write'),
      ('settings.manage'), ('settings.read'), ('printer.manage'),
      ('sync.manage'), ('sync.read'), ('sync.write'),
      ('pos.dashboard.read'), ('audit.view'), ('audit.read'),
      ('storefront.view'), ('storefront.edit'), ('storefront.publish'),
      ('storefront.pricing.manage'), ('storefront.bulk_publish'),
      ('storefront.promotions.manage'), ('storefront.images.manage'),
      ('storefront.settings.manage'), ('storefront.audit.view'),
      ('orders.view'), ('orders.manage'), ('orders.delivery.view'),
      ('orders.delivery.manage')
  ) as permissions(permission_key);
$$;

create or replace function app_private.task140_safe_staff_web_permissions()
returns table(permission_key text)
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  values
    ('catalog.read'), ('catalog.write'), ('catalog.import'),
    ('catalog.export'), ('staff.read'), ('staff.write'), ('devices.read'),
    ('audit.read'), ('settings.read'), ('pos.dashboard.read'), ('sync.read'),
    ('sync.write'), ('storefront.view'), ('storefront.edit'),
    ('storefront.publish'), ('storefront.pricing.manage'),
    ('storefront.bulk_publish'), ('storefront.promotions.manage'),
    ('storefront.images.manage'), ('storefront.settings.manage'),
    ('storefront.audit.view'), ('orders.view'), ('orders.manage'),
    ('orders.delivery.view'), ('orders.delivery.manage'),
    ('orders.delivery.track');
$$;

revoke all on function app_private.mac_admin_w7pos_009_pos_admin_permissions()
  from public, anon, authenticated, service_role;
revoke all on function app_private.task140_safe_staff_web_permissions()
  from public, anon, authenticated, service_role;

insert into public.staff_role_permissions (
  shop_id, role_key, permission_key, enabled, updated_by_profile_id, updated_at
)
select shop.shop_id, 'pos_admin', 'storefront.pricing.manage', true, null, now()
from public.shops shop
on conflict (shop_id, role_key, permission_key)
do update set enabled = true, updated_at = now();

create or replace function app_private.storefront_admin_personal_allowed_v1(
  p_shop_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_permission in (
      'storefront.view', 'storefront.edit', 'storefront.publish',
      'storefront.pricing.manage', 'storefront.bulk_publish',
      'storefront.promotions.manage', 'storefront.images.manage',
      'storefront.settings.manage', 'storefront.audit.view'
    )
    and exists (
      select 1
      from public.shop_members member
      join public.shops shop on shop.shop_id = member.shop_id
      where member.shop_id = p_shop_id
        and member.profile_id = auth.uid()
        and member.membership_status = 'active'
        and shop.shop_status = 'active'
        and (
          member.role_key in ('shop_owner', 'shop_manager')
          or (
            member.role_key = 'viewer'
            and p_permission in ('storefront.view', 'storefront.audit.view')
          )
        )
    );
$$;

revoke all on function app_private.storefront_admin_personal_allowed_v1(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function app_private.storefront_authoring_source_v1()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when auth.role() = 'authenticated'
      and auth.jwt()->'app_metadata'->>'storefront_mutation_source'
        in ('android', 'ios')
      then auth.jwt()->'app_metadata'->>'storefront_mutation_source'
    when auth.role() in ('authenticated', 'service_role') then 'admin'
    else 'system'
  end;
$$;

revoke all on function app_private.storefront_authoring_source_v1()
  from public, anon, authenticated, service_role;

create or replace function app_private.storefront_publication_snapshot_v1(
  p_shop_id uuid,
  p_publication_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'publicationId', publication.id,
      'sourceProductId', publication.source_product_id,
      'status', publication.publication_status,
      'publicName', publication.public_name,
      'publicDescription', publication.public_description,
      'storefrontCategoryId', publication.public_category_id,
      'publicBrand', publication.public_brand,
      'publicPrice', publication.retail_price_clp,
      'compareAtPrice', publication.compare_at_price_clp,
      'priceSourceMode', publication.price_source_mode,
      'promotionStartsAt', publication.promotion_starts_at,
      'promotionEndsAt', publication.promotion_ends_at,
      'featured', publication.featured,
      'homeOrder', publication.sort_rank,
      'pickupEnabled', publication.pickup_enabled,
      'deliveryEnabled', publication.delivery_enabled,
      'reservationEnabled', publication.reservation_enabled,
      'availability', publication.availability_mode,
      'publicImageId', publication.published_image_version_id,
      'version', publication.catalog_version,
      'updatedAt', publication.updated_at,
      'mutationSource', publication.last_mutation_source,
      'changedFields', publication.last_changed_fields
    )
    from public.storefront_product_publications publication
    where publication.shop_id = p_shop_id
      and publication.id = p_publication_id
  ), 'null'::jsonb);
$$;

revoke all on function app_private.storefront_publication_snapshot_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function app_private.storefront_guard_operational_product_delete_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id uuid := old.id;
begin
  if tg_op = 'UPDATE' and (
    old.deleted_at is not null or new.deleted_at is null
  ) then
    return new;
  end if;

  if exists (
    select 1
    from public.storefront_product_publications publication
    where publication.source_product_id = v_product_id
      and publication.publication_status <> 'ended'
  ) then
    raise exception using
      errcode = '23514',
      message = 'archive Storefront publication before deleting operational product';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists storefront_guard_operational_product_delete
  on public.inventory_products;
create trigger storefront_guard_operational_product_delete
  before update of deleted_at on public.inventory_products
  for each row execute function
    app_private.storefront_guard_operational_product_delete_v1();

drop trigger if exists storefront_guard_operational_product_hard_delete
  on public.inventory_products;
create trigger storefront_guard_operational_product_hard_delete
  before delete on public.inventory_products
  for each row execute function
    app_private.storefront_guard_operational_product_delete_v1();

revoke all on function app_private.storefront_guard_operational_product_delete_v1()
  from public, anon, authenticated, service_role;

-- An archived publication is a terminal history record. Once archive has been
-- acknowledged, an operational soft-delete must not mutate that record through
-- the inventory availability trigger.
create or replace function app_private.storefront_inventory_availability_sync_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
begin
  with changed_products as materialized (
    select current.*
    from storefront_availability_inventory_new_rows current
    join storefront_availability_inventory_old_rows previous
      on previous.id = current.id
    where current.stock_quantity is distinct from previous.stock_quantity
      or current.deleted_at is distinct from previous.deleted_at
      or current.shop_id is distinct from previous.shop_id
      or current.owner_user_id is distinct from previous.owner_user_id
  ), candidates as materialized (
    select distinct on (publication.shop_id, product.id)
      publication.shop_id,
      product.id as source_product_id,
      app_private.storefront_inventory_signal_state_v1(
        product.stock_quantity,
        setting.availability_low_stock_threshold,
        product.deleted_at
      ) as signal_state,
      coalesce(product.updated_at, v_now) as source_observed_at
    from changed_products product
    join public.storefront_product_publications publication
      on publication.source_product_id = product.id
      and publication.publication_status <> 'ended'
    join public.storefront_settings setting
      on setting.shop_id = publication.shop_id
    order by publication.shop_id, product.id
  ), canonical as (
    select
      candidate.*,
      'inventory:' || encode(extensions.digest(
        pg_catalog.convert_to(pg_catalog.jsonb_build_array(
          candidate.source_product_id,
          candidate.source_observed_at,
          candidate.signal_state,
          txid_current()
        )::text, 'UTF8'),
        'sha256'
      ), 'hex') as idempotency_key
    from candidates candidate
  )
  insert into app_private.storefront_product_availability_signals as signal (
    shop_id,
    source_product_id,
    source_version,
    signal_state,
    source_kind,
    source_observed_at,
    expires_at,
    last_idempotency_key,
    last_payload_sha256,
    updated_at
  )
  select
    canonical.shop_id,
    canonical.source_product_id,
    1,
    canonical.signal_state,
    'inventory_database',
    canonical.source_observed_at,
    'infinity'::timestamptz,
    canonical.idempotency_key,
    encode(extensions.digest(
      pg_catalog.convert_to(pg_catalog.jsonb_build_array(
        canonical.shop_id,
        canonical.source_product_id,
        1,
        canonical.signal_state,
        canonical.source_observed_at,
        'infinity'::timestamptz,
        'inventory_database'
      )::text, 'UTF8'),
      'sha256'
    ), 'hex'),
    v_now
  from canonical
  on conflict (shop_id, source_product_id) do update set
    source_version = signal.source_version + 1,
    signal_state = excluded.signal_state,
    source_kind = excluded.source_kind,
    source_observed_at = greatest(
      signal.source_observed_at,
      excluded.source_observed_at
    ),
    expires_at = excluded.expires_at,
    last_idempotency_key = excluded.last_idempotency_key,
    last_payload_sha256 = encode(extensions.digest(
      pg_catalog.convert_to(pg_catalog.jsonb_build_array(
        excluded.shop_id,
        excluded.source_product_id,
        signal.source_version + 1,
        excluded.signal_state,
        greatest(signal.source_observed_at, excluded.source_observed_at),
        excluded.expires_at,
        excluded.source_kind
      )::text, 'UTF8'),
      'sha256'
    ), 'hex'),
    updated_at = excluded.updated_at
  where excluded.source_observed_at >= signal.source_observed_at;

  update public.storefront_product_publications publication
  set availability_mode = app_private.storefront_effective_availability_v1(
    signal.signal_state,
    signal.source_observed_at,
    signal.expires_at,
    publication.pickup_enabled,
    publication.delivery_enabled,
    publication.reservation_enabled,
    v_now
  )
  from app_private.storefront_product_availability_signals signal
  where signal.shop_id = publication.shop_id
    and signal.source_product_id = publication.source_product_id
    and publication.publication_status <> 'ended'
    and exists (
      select 1
      from storefront_availability_inventory_new_rows changed
      join storefront_availability_inventory_old_rows previous
        on previous.id = changed.id
      where changed.id = publication.source_product_id
        and (
          changed.stock_quantity is distinct from previous.stock_quantity
          or changed.deleted_at is distinct from previous.deleted_at
          or changed.shop_id is distinct from previous.shop_id
          or changed.owner_user_id is distinct from previous.owner_user_id
        )
    )
    and publication.availability_mode is distinct from
      app_private.storefront_effective_availability_v1(
        signal.signal_state,
        signal.source_observed_at,
        signal.expires_at,
        publication.pickup_enabled,
        publication.delivery_enabled,
        publication.reservation_enabled,
        v_now
      );

  return null;
end;
$$;

revoke all on function app_private.storefront_inventory_availability_sync_v1()
  from public, anon, authenticated, service_role;

create or replace function app_private.storefront_reservation_inventory_refresh_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product record;
begin
  for v_product in
    select current.id
    from storefront_reservation_inventory_new_rows current
    join storefront_reservation_inventory_old_rows previous
      on previous.id = current.id
    where (
      current.stock_quantity is distinct from previous.stock_quantity
      or current.deleted_at is distinct from previous.deleted_at
      or current.shop_id is distinct from previous.shop_id
      or current.owner_user_id is distinct from previous.owner_user_id
    )
      and exists (
        select 1
        from public.storefront_product_publications publication
        where publication.source_product_id = current.id
          and publication.publication_status <> 'ended'
      )
    order by current.id
  loop
    perform app_private.storefront_reservation_refresh_availability_v1(
      v_product.id,
      statement_timestamp()
    );
  end loop;
  return null;
end;
$$;

revoke all on function app_private.storefront_reservation_inventory_refresh_v1()
  from public, anon, authenticated, service_role;

create or replace function app_private.storefront_authoring_audit_failure_v1(
  p_actor_profile_id uuid,
  p_actor_staff_id uuid,
  p_shop_id uuid,
  p_product_id uuid,
  p_publication_id uuid,
  p_operation text,
  p_source text,
  p_outcome text,
  p_correlation_id uuid,
  p_expected_version bigint,
  p_server_version bigint
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.audit_logs (
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    p_actor_profile_id, p_actor_staff_id, 'shop', p_shop_id,
    'shop.storefront.authoring.' || p_operation || '.' || p_outcome,
    'warning', 'failure', 'storefront_publication', p_publication_id::text,
    jsonb_build_object(
      'source', p_source,
      'operation', p_operation,
      'productId', p_product_id,
      'publicationId', p_publication_id,
      'outcome', p_outcome,
      'correlationId', p_correlation_id,
      'expectedVersion', p_expected_version,
      'serverVersion', p_server_version
    )
  );
$$;

revoke all on function app_private.storefront_authoring_audit_failure_v1(
  uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, bigint, bigint
) from public, anon, authenticated, service_role;

create or replace function public.storefront_publications_authoring_read_v1(
  p_shop_id uuid,
  p_source_product_ids uuid[] default null,
  p_status text default null,
  p_page integer default 1,
  p_page_size integer default 100,
  p_staff_id uuid default null,
  p_staff_web_session_id uuid default null,
  p_session_token_hash text default null,
  p_expected_credential_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_categories jsonb := '[]'::jsonb;
  v_audit jsonb := '[]'::jsonb;
  v_total integer := 0;
begin
  if p_shop_id is null
    or coalesce(p_page, 0) not between 1 and 10000
    or coalesce(p_page_size, 0) not between 1 and 100
    or (p_status is not null and p_status not in (
      'draft', 'scheduled', 'published', 'paused', 'ended'
    ))
    or coalesce(cardinality(p_source_product_ids), 0) > 100
    or (
      p_source_product_ids is not null
      and cardinality(p_source_product_ids) <> (
        select count(distinct product_id)::integer
        from unnest(p_source_product_ids) product_id
      )
    ) then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id
    );
  end if;

  with filtered as materialized (
    select publication.id, publication.updated_at
    from public.storefront_product_publications publication
    where publication.shop_id = p_shop_id
      and (p_source_product_ids is null
        or publication.source_product_id = any(p_source_product_ids))
      and (p_status is null or publication.publication_status = p_status)
  ), paged as (
    select filtered.id
    from filtered
    order by filtered.updated_at desc, filtered.id
    offset (p_page - 1) * p_page_size
    limit p_page_size
  )
  select
    (select count(*)::integer from filtered),
    coalesce(jsonb_agg(
      app_private.storefront_publication_snapshot_v1(p_shop_id, paged.id)
      order by publication.updated_at desc, publication.id
    ), '[]'::jsonb)
  into v_total, v_rows
  from paged
  join public.storefront_product_publications publication
    on publication.id = paged.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'categoryId', category.id,
    'sourceCategoryId', category.source_category_id,
    'publicName', category.public_name,
    'status', category.publication_status,
    'updatedAt', category.updated_at
  ) order by category.sort_rank, category.public_name, category.id), '[]'::jsonb)
  into v_categories
  from public.storefront_categories category
  where category.shop_id = p_shop_id
    and category.publication_status <> 'archived';

  if app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.audit.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', audit.audit_log_id,
      'eventKey', audit.event_key,
      'result', audit.result,
      'targetId', audit.target_id,
      'actorKind', case when audit.actor_staff_id is not null
        then 'pos_staff_manager' when audit.actor_profile_id is not null
        then 'personal_account' else 'system' end,
      'source', audit.metadata_redacted->>'source',
      'createdAt', audit.created_at,
      'before', audit.metadata_redacted->'before',
      'after', audit.metadata_redacted->'after',
      'updatedCount', coalesce(
        (audit.metadata_redacted->>'updatedCount')::integer, 1
      ),
      'previousVersion', audit.metadata_redacted->'previousVersion',
      'newVersion', audit.metadata_redacted->'newVersion',
      'changedFields', audit.metadata_redacted->'changedFields',
      'correlationId', audit.metadata_redacted->>'correlationId'
    ) order by audit.created_at desc, audit.audit_log_id desc), '[]'::jsonb)
    into v_audit
    from (
      select log.*
      from public.audit_logs log
      where log.shop_id = p_shop_id
        and log.event_key like 'shop.storefront.authoring.%'
      order by log.created_at desc, log.audit_log_id desc
      limit 100
    ) audit;
  end if;

  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    raise exception 'Storefront authoring authorization expired'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'shop_id', p_shop_id,
    'rows', v_rows,
    'categories', v_categories,
    'audit', v_audit,
    'pagination', jsonb_build_object(
      'page', p_page,
      'pageSize', p_page_size,
      'total', v_total,
      'totalPages', greatest(1, ceil(v_total::numeric / p_page_size)::integer)
    )
  );
exception
  when insufficient_privilege then
    return jsonb_build_object(
      'ok', false, 'code', 'session_expired', 'shop_id', p_shop_id
    );
end;
$$;

create or replace function public.storefront_publication_authoring_mutate_v1(
  p_shop_id uuid,
  p_operation text,
  p_payload jsonb,
  p_idempotency_key uuid,
  p_expected_version bigint default null,
  p_staff_id uuid default null,
  p_staff_web_session_id uuid default null,
  p_session_token_hash text default null,
  p_expected_credential_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_actor_profile_id uuid := case when auth.role() = 'authenticated' then auth.uid() end;
  v_actor_staff_id uuid := case when auth.role() = 'service_role' then p_staff_id end;
  v_principal_key text;
  v_source text := app_private.storefront_authoring_source_v1();
  v_request_sha256 text;
  v_receipt app_private.storefront_authoring_receipts%rowtype;
  v_receipt_inserted integer := 0;
  v_source_product_id uuid;
  v_publication_id uuid;
  v_existing public.storefront_product_publications%rowtype;
  v_exists boolean := false;
  v_product public.inventory_products%rowtype;
  v_status text;
  v_public_name text;
  v_public_description text;
  v_public_brand text;
  v_public_category_id uuid;
  v_image_id uuid;
  v_price_source_mode text;
  v_retail_price bigint;
  v_compare_at_price bigint;
  v_promotion_starts_at timestamptz;
  v_promotion_ends_at timestamptz;
  v_sort_rank bigint;
  v_availability text;
  v_featured boolean;
  v_pickup boolean;
  v_delivery boolean;
  v_reservation boolean;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb;
  v_changed_fields text[] := '{}'::text[];
  v_audit_id uuid;
  v_response jsonb;
  v_allowed_keys text[];
begin
  if p_shop_id is null
    or p_operation not in ('save_draft', 'publish', 'schedule', 'hide', 'archive')
    or p_idempotency_key is null
    or p_expected_version is null
    or p_expected_version < 0
    or jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
    or pg_column_size(p_payload) > 65536 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  if not app_private.storefront_admin_authorized_v1(
    p_shop_id,
    case when p_operation = 'save_draft'
      then 'storefront.edit' else 'storefront.publish' end,
    p_staff_id, p_staff_web_session_id, p_session_token_hash,
    p_expected_credential_version
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id
    );
  end if;

  v_principal_key := case
    when v_actor_profile_id is not null then 'profile:' || v_actor_profile_id::text
    when v_actor_staff_id is not null then 'staff:' || v_actor_staff_id::text
  end;
  if v_principal_key is null then
    return jsonb_build_object(
      'ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id
    );
  end if;

  v_allowed_keys := case when p_operation in ('hide', 'archive')
    then array['sourceProductId']
    else array[
      'sourceProductId', 'publicName', 'publicDescription',
      'storefrontCategoryId', 'publicBrand', 'publicPrice', 'compareAtPrice',
      'priceSourceMode', 'promotionStartsAt', 'promotionEndsAt', 'featured',
      'homeOrder', 'pickupEnabled', 'deliveryEnabled', 'reservationEnabled',
      'availability', 'publicImageId'
    ]
  end;
  if exists (
    select 1 from jsonb_object_keys(p_payload) key
    where not key = any(v_allowed_keys)
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
    );
  end if;

  begin
    v_source_product_id := (p_payload->>'sourceProductId')::uuid;
  exception when others then
    return jsonb_build_object(
      'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
    );
  end;

  select product.* into v_product
  from public.inventory_products product
  where product.id = v_source_product_id
    and product.deleted_at is null
    and app_private.storefront_product_matches_shop_v1(product.id, p_shop_id)
  for share;
  if not found then
    return jsonb_build_object(
      'ok', false, 'code', 'not_found', 'shop_id', p_shop_id
    );
  end if;

  if p_operation not in ('hide', 'archive') then
    begin
      v_status := case p_operation
        when 'save_draft' then 'draft'
        when 'schedule' then 'scheduled'
        else 'published'
      end;
      v_public_name := regexp_replace(
        btrim(coalesce(p_payload->>'publicName', '')), '\s+', ' ', 'g'
      );
      v_public_description := nullif(btrim(coalesce(p_payload->>'publicDescription', '')), '');
      v_public_brand := nullif(regexp_replace(
        btrim(coalesce(p_payload->>'publicBrand', '')), '\s+', ' ', 'g'
      ), '');
      v_public_category_id := nullif(p_payload->>'storefrontCategoryId', '')::uuid;
      v_image_id := nullif(p_payload->>'publicImageId', '')::uuid;
      v_price_source_mode := coalesce(nullif(p_payload->>'priceSourceMode', ''), 'override');
      v_retail_price := (p_payload->>'publicPrice')::bigint;
      v_compare_at_price := nullif(p_payload->>'compareAtPrice', '')::bigint;
      v_promotion_starts_at := nullif(p_payload->>'promotionStartsAt', '')::timestamptz;
      v_promotion_ends_at := nullif(p_payload->>'promotionEndsAt', '')::timestamptz;
      v_sort_rank := coalesce(nullif(p_payload->>'homeOrder', '')::bigint, 0);
      v_availability := coalesce(nullif(p_payload->>'availability', ''), 'available');
      v_featured := coalesce((p_payload->>'featured')::boolean, false);
      v_pickup := coalesce((p_payload->>'pickupEnabled')::boolean, false);
      v_delivery := coalesce((p_payload->>'deliveryEnabled')::boolean, false);
      v_reservation := coalesce((p_payload->>'reservationEnabled')::boolean, false);
    exception when others then
      return jsonb_build_object(
        'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
      );
    end;

    if length(v_public_name) not between 1 and 200
      or coalesce(length(v_public_description), 0) > 5000
      or coalesce(length(v_public_brand), 0) > 120
      or v_price_source_mode not in ('operational', 'override', 'promotion')
      or v_retail_price not between 0 and 999999999999
      or (v_compare_at_price is not null and (
        v_compare_at_price > 999999999999
        or v_compare_at_price < v_retail_price
      ))
      or (v_promotion_starts_at is null) <> (v_promotion_ends_at is null)
      or (v_promotion_starts_at is not null
        and v_promotion_starts_at >= v_promotion_ends_at)
      or v_availability not in (
        'available', 'low_stock', 'unavailable', 'reservation_only',
        'pickup_only', 'delivery_only'
      )
      or (v_status in ('scheduled', 'published')
        and not (v_pickup or v_delivery or v_reservation)) then
      return jsonb_build_object(
        'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
      );
    end if;
    if v_price_source_mode = 'operational' then
      if v_product.retail_price is null
        or v_product.retail_price < 0
        or trunc(v_product.retail_price) <> v_product.retail_price then
        return jsonb_build_object(
          'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
        );
      end if;
      v_retail_price := v_product.retail_price::bigint;
    end if;
  end if;

  v_request_sha256 := encode(extensions.digest(
    convert_to(jsonb_build_object(
      'shopId', p_shop_id,
      'operation', p_operation,
      'payload', p_payload,
      'expectedVersion', p_expected_version
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  delete from app_private.storefront_authoring_receipts receipt
  where receipt.shop_id = p_shop_id
    and receipt.principal_key = v_principal_key
    and receipt.expires_at <= statement_timestamp();

  insert into app_private.storefront_authoring_receipts (
    shop_id, principal_key, actor_profile_id, actor_staff_id,
    idempotency_key, operation, request_sha256
  ) values (
    p_shop_id, v_principal_key, v_actor_profile_id, v_actor_staff_id,
    p_idempotency_key, p_operation, v_request_sha256
  ) on conflict do nothing;
  get diagnostics v_receipt_inserted = row_count;

  if v_receipt_inserted = 0 then
    select receipt.* into v_receipt
    from app_private.storefront_authoring_receipts receipt
    where receipt.shop_id = p_shop_id
      and receipt.principal_key = v_principal_key
      and receipt.idempotency_key = p_idempotency_key
    for update;
    if v_receipt.request_sha256 <> v_request_sha256
      or v_receipt.operation <> p_operation
      or v_receipt.response_payload is null then
      perform app_private.storefront_authoring_audit_failure_v1(
        v_actor_profile_id, v_actor_staff_id, p_shop_id, v_source_product_id,
        null, p_operation, v_source, 'idempotency_conflict',
        p_idempotency_key, p_expected_version, null
      );
      return jsonb_build_object(
        'ok', false, 'code', 'idempotency_conflict', 'shop_id', p_shop_id
      );
    end if;
    return v_receipt.response_payload || jsonb_build_object('idempotent', true);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_shop_id::text || ':' || v_source_product_id::text,
      0
    )
  );

  select publication.* into v_existing
  from public.storefront_product_publications publication
  where publication.shop_id = p_shop_id
    and publication.source_product_id = v_source_product_id
  for update;
  v_exists := found;

  if (not v_exists and p_expected_version <> 0)
    or (v_exists and v_existing.catalog_version <> p_expected_version) then
    delete from app_private.storefront_authoring_receipts receipt
    where receipt.shop_id = p_shop_id
      and receipt.principal_key = v_principal_key
      and receipt.idempotency_key = p_idempotency_key;
    perform app_private.storefront_authoring_audit_failure_v1(
      v_actor_profile_id, v_actor_staff_id, p_shop_id, v_source_product_id,
      case when v_exists then v_existing.id end,
      p_operation, v_source, 'stale_revision', p_idempotency_key,
      p_expected_version,
      case when v_exists then v_existing.catalog_version end
    );
    return jsonb_build_object(
      'ok', false,
      'code', 'stale_revision',
      'shop_id', p_shop_id,
      'server', case when v_exists then
        app_private.storefront_publication_snapshot_v1(p_shop_id, v_existing.id)
        else 'null'::jsonb end
    );
  end if;

  if not v_exists and p_operation in ('hide', 'archive') then
    delete from app_private.storefront_authoring_receipts receipt
    where receipt.shop_id = p_shop_id
      and receipt.principal_key = v_principal_key
      and receipt.idempotency_key = p_idempotency_key;
    return jsonb_build_object(
      'ok', false, 'code', 'not_found', 'shop_id', p_shop_id
    );
  end if;
  if v_exists and v_existing.publication_status = 'ended' then
    delete from app_private.storefront_authoring_receipts receipt
    where receipt.shop_id = p_shop_id
      and receipt.principal_key = v_principal_key
      and receipt.idempotency_key = p_idempotency_key;
    perform app_private.storefront_authoring_audit_failure_v1(
      v_actor_profile_id, v_actor_staff_id, p_shop_id, v_source_product_id,
      v_existing.id, p_operation, v_source, 'invalid_state',
      p_idempotency_key, p_expected_version, v_existing.catalog_version
    );
    return jsonb_build_object(
      'ok', false, 'code', 'invalid_state', 'shop_id', p_shop_id,
      'server', app_private.storefront_publication_snapshot_v1(
        p_shop_id, v_existing.id
      )
    );
  end if;
  if v_exists and v_existing.publication_status = 'published'
    and p_operation = 'save_draft' then
    delete from app_private.storefront_authoring_receipts receipt
    where receipt.shop_id = p_shop_id
      and receipt.principal_key = v_principal_key
      and receipt.idempotency_key = p_idempotency_key;
    return jsonb_build_object(
      'ok', false, 'code', 'invalid_state', 'shop_id', p_shop_id
    );
  end if;

  if p_operation not in ('hide', 'archive') then
    if (
      p_operation = 'save_draft'
      or not v_exists
      or v_existing.public_name is distinct from v_public_name
      or v_existing.public_description is distinct from v_public_description
      or v_existing.public_category_id is distinct from v_public_category_id
      or v_existing.public_brand is distinct from v_public_brand
      or v_existing.featured is distinct from v_featured
      or v_existing.sort_rank is distinct from v_sort_rank
      or v_existing.pickup_enabled is distinct from v_pickup
      or v_existing.delivery_enabled is distinct from v_delivery
      or v_existing.reservation_enabled is distinct from v_reservation
      or v_existing.availability_mode is distinct from v_availability
    ) and not app_private.storefront_admin_authorized_v1(
      p_shop_id, 'storefront.edit', p_staff_id, p_staff_web_session_id,
      p_session_token_hash, p_expected_credential_version
    ) then
      delete from app_private.storefront_authoring_receipts receipt
      where receipt.shop_id = p_shop_id
        and receipt.principal_key = v_principal_key
        and receipt.idempotency_key = p_idempotency_key;
      return jsonb_build_object(
        'ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id
      );
    end if;
    if (not v_exists or v_existing.retail_price_clp is distinct from v_retail_price
        or v_existing.price_source_mode is distinct from v_price_source_mode
        or v_existing.compare_at_price_clp is distinct from v_compare_at_price)
      and not app_private.storefront_admin_authorized_v1(
        p_shop_id, 'storefront.pricing.manage', p_staff_id,
        p_staff_web_session_id, p_session_token_hash,
        p_expected_credential_version
      ) then
      delete from app_private.storefront_authoring_receipts receipt
      where receipt.shop_id = p_shop_id
        and receipt.principal_key = v_principal_key
        and receipt.idempotency_key = p_idempotency_key;
      return jsonb_build_object(
        'ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id
      );
    end if;
    if (
      (not v_exists and v_image_id is not null)
      or (v_exists
        and v_existing.published_image_version_id is distinct from v_image_id)
    )
      and not app_private.storefront_admin_authorized_v1(
        p_shop_id, 'storefront.images.manage', p_staff_id,
        p_staff_web_session_id, p_session_token_hash,
        p_expected_credential_version
      ) then
      delete from app_private.storefront_authoring_receipts receipt
      where receipt.shop_id = p_shop_id
        and receipt.principal_key = v_principal_key
        and receipt.idempotency_key = p_idempotency_key;
      return jsonb_build_object(
        'ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id
      );
    end if;
    if (
      (not v_exists and (
        v_promotion_starts_at is not null
        or v_promotion_ends_at is not null
        or v_price_source_mode = 'promotion'
      ))
      or (v_exists and (
        v_existing.promotion_starts_at is distinct from v_promotion_starts_at
        or v_existing.promotion_ends_at is distinct from v_promotion_ends_at
        or (
          v_existing.price_source_mode is distinct from v_price_source_mode
          and (
            v_existing.price_source_mode = 'promotion'
            or v_price_source_mode = 'promotion'
          )
        )
      ))
    )
      and not app_private.storefront_admin_authorized_v1(
        p_shop_id, 'storefront.promotions.manage', p_staff_id,
        p_staff_web_session_id, p_session_token_hash,
        p_expected_credential_version
      ) then
      delete from app_private.storefront_authoring_receipts receipt
      where receipt.shop_id = p_shop_id
        and receipt.principal_key = v_principal_key
        and receipt.idempotency_key = p_idempotency_key;
      return jsonb_build_object(
        'ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id
      );
    end if;
  end if;

  if v_exists then
    v_before := app_private.storefront_publication_snapshot_v1(
      p_shop_id, v_existing.id
    );
  end if;

  begin
    if p_operation in ('hide', 'archive') then
      update public.storefront_product_publications publication
      set publication_status = case when p_operation = 'hide'
            then 'paused' else 'ended' end,
          catalog_version = publication.catalog_version + 1,
          last_mutation_source = v_source,
          last_correlation_id = p_idempotency_key,
          last_changed_fields = array['status'],
          updated_by_profile_id = v_actor_profile_id
      where publication.shop_id = p_shop_id
        and publication.id = v_existing.id
      returning publication.id into v_publication_id;
    else
      insert into public.storefront_product_publications (
        shop_id, source_product_id, publication_status, public_name,
        public_description, public_category_id, public_brand, retail_price_clp,
        compare_at_price_clp, price_source_mode, promotion_starts_at,
        promotion_ends_at, featured, sort_rank, pickup_enabled,
        delivery_enabled, reservation_enabled, availability_mode,
        published_image_version_id, published_at, updated_by_profile_id,
        catalog_version, last_mutation_source, last_correlation_id
      ) values (
        p_shop_id, v_source_product_id, v_status, v_public_name,
        v_public_description, v_public_category_id, v_public_brand,
        v_retail_price, v_compare_at_price, v_price_source_mode,
        v_promotion_starts_at, v_promotion_ends_at, v_featured, v_sort_rank,
        v_pickup, v_delivery, v_reservation, v_availability, v_image_id,
        case when v_status = 'published' then statement_timestamp() end,
        v_actor_profile_id, 1, v_source, p_idempotency_key
      ) on conflict (shop_id, source_product_id) do update set
        publication_status = excluded.publication_status,
        public_name = excluded.public_name,
        public_description = excluded.public_description,
        public_category_id = excluded.public_category_id,
        public_brand = excluded.public_brand,
        retail_price_clp = excluded.retail_price_clp,
        compare_at_price_clp = excluded.compare_at_price_clp,
        price_source_mode = excluded.price_source_mode,
        promotion_starts_at = excluded.promotion_starts_at,
        promotion_ends_at = excluded.promotion_ends_at,
        featured = excluded.featured,
        sort_rank = excluded.sort_rank,
        pickup_enabled = excluded.pickup_enabled,
        delivery_enabled = excluded.delivery_enabled,
        reservation_enabled = excluded.reservation_enabled,
        availability_mode = excluded.availability_mode,
        published_image_version_id = excluded.published_image_version_id,
        published_at = case
          when excluded.publication_status = 'published'
            then coalesce(storefront_product_publications.published_at, statement_timestamp())
          else storefront_product_publications.published_at
        end,
        updated_by_profile_id = excluded.updated_by_profile_id,
        catalog_version = storefront_product_publications.catalog_version + 1,
        last_mutation_source = excluded.last_mutation_source,
        last_correlation_id = excluded.last_correlation_id
      returning id into v_publication_id;

      v_after := app_private.storefront_publication_snapshot_v1(
        p_shop_id, v_publication_id
      );
      select coalesce(array_agg(field order by field), '{}'::text[])
      into v_changed_fields
      from jsonb_object_keys(v_after) field
      where field not in (
          'publicationId', 'sourceProductId', 'version', 'updatedAt',
          'mutationSource', 'changedFields'
        )
        and v_before->field is distinct from v_after->field;
      update public.storefront_product_publications publication
      set last_changed_fields = v_changed_fields
      where publication.shop_id = p_shop_id
        and publication.id = v_publication_id;
    end if;
  exception
    when check_violation or foreign_key_violation or not_null_violation
      or unique_violation then
      delete from app_private.storefront_authoring_receipts receipt
      where receipt.shop_id = p_shop_id
        and receipt.principal_key = v_principal_key
        and receipt.idempotency_key = p_idempotency_key;
      return jsonb_build_object(
        'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
      );
  end;

  v_after := app_private.storefront_publication_snapshot_v1(
    p_shop_id, v_publication_id
  );
  if p_operation in ('hide', 'archive') then
    v_changed_fields := array['status'];
  end if;

  if not app_private.storefront_admin_authorized_v1(
    p_shop_id,
    case when p_operation = 'save_draft'
      then 'storefront.edit' else 'storefront.publish' end,
    p_staff_id, p_staff_web_session_id, p_session_token_hash,
    p_expected_credential_version
  ) then
    raise exception 'Storefront authoring authorization expired'
      using errcode = '42501';
  end if;

  insert into public.audit_logs (
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    v_actor_profile_id, v_actor_staff_id, 'shop', p_shop_id,
    'shop.storefront.authoring.' || p_operation || '.success',
    'info', 'success', 'storefront_publication', v_publication_id::text,
    jsonb_build_object(
      'code', 'success',
      'source', v_source,
      'operation', p_operation,
      'productId', v_source_product_id,
      'publicationId', v_publication_id,
      'previousVersion', case when v_exists then v_existing.catalog_version else 0 end,
      'newVersion', v_after->'version',
      'changedFields', to_jsonb(v_changed_fields),
      'outcome', 'success',
      'correlationId', p_idempotency_key,
      'before', v_before,
      'after', v_after
    )
  ) returning audit_log_id into v_audit_id;

  v_response := jsonb_build_object(
    'ok', true,
    'code', 'success',
    'shop_id', p_shop_id,
    'target_id', v_publication_id,
    'audit_event_id', v_audit_id,
    'idempotent', false,
    'payload', v_after
  );
  update app_private.storefront_authoring_receipts receipt
  set response_payload = v_response
  where receipt.shop_id = p_shop_id
    and receipt.principal_key = v_principal_key
    and receipt.idempotency_key = p_idempotency_key;
  return v_response;
exception
  when insufficient_privilege then
    return jsonb_build_object(
      'ok', false, 'code', 'session_expired', 'shop_id', p_shop_id
    );
end;
$$;

create or replace function public.admin_storefront_publication_bulk_mutate_v2(
  p_shop_id uuid,
  p_operation text,
  p_items jsonb,
  p_idempotency_key uuid,
  p_staff_id uuid default null,
  p_staff_web_session_id uuid default null,
  p_session_token_hash text default null,
  p_expected_credential_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_actor_profile_id uuid := case when auth.role() = 'authenticated' then auth.uid() end;
  v_actor_staff_id uuid := case when auth.role() = 'service_role' then p_staff_id end;
  v_principal_key text;
  v_source text := app_private.storefront_authoring_source_v1();
  v_request_sha256 text;
  v_receipt app_private.storefront_authoring_receipts%rowtype;
  v_inserted integer := 0;
  v_ids uuid[];
  v_count integer;
  v_before jsonb;
  v_after jsonb;
  v_audit_id uuid;
  v_response jsonb;
begin
  if p_shop_id is null
    or p_operation not in ('bulk_publish', 'bulk_hide')
    or p_idempotency_key is null
    or jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 100
    or pg_column_size(p_items) > 65536 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.bulk_publish', p_staff_id,
    p_staff_web_session_id, p_session_token_hash,
    p_expected_credential_version
  ) or not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.publish', p_staff_id,
    p_staff_web_session_id, p_session_token_hash,
    p_expected_credential_version
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id
    );
  end if;
  v_principal_key := case
    when v_actor_profile_id is not null then 'profile:' || v_actor_profile_id::text
    when v_actor_staff_id is not null then 'staff:' || v_actor_staff_id::text
  end;
  if v_principal_key is null then
    return jsonb_build_object(
      'ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id
    );
  end if;

  begin
    select array_agg(item.publication_id order by item.publication_id), count(*)::integer
    into v_ids, v_count
    from (
      select
        (value->>'publicationId')::uuid as publication_id,
        (value->>'expectedVersion')::bigint as expected_version,
        value
      from jsonb_array_elements(p_items)
    ) item
    where jsonb_typeof(item.value) = 'object'
      and not exists (
        select 1 from jsonb_object_keys(item.value) key
        where key not in ('publicationId', 'expectedVersion')
      )
      and item.expected_version >= 0;
  exception when others then
    return jsonb_build_object(
      'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
    );
  end;
  if v_count <> jsonb_array_length(p_items)
    or cardinality(v_ids) <> (
      select count(distinct id)::integer from unnest(v_ids) id
    ) then
    return jsonb_build_object(
      'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
    );
  end if;

  v_request_sha256 := encode(extensions.digest(
    convert_to(jsonb_build_object(
      'shopId', p_shop_id, 'operation', p_operation, 'items', p_items
    )::text, 'UTF8'), 'sha256'
  ), 'hex');
  delete from app_private.storefront_authoring_receipts receipt
  where receipt.shop_id = p_shop_id
    and receipt.principal_key = v_principal_key
    and receipt.expires_at <= statement_timestamp();
  insert into app_private.storefront_authoring_receipts (
    shop_id, principal_key, actor_profile_id, actor_staff_id,
    idempotency_key, operation, request_sha256
  ) values (
    p_shop_id, v_principal_key, v_actor_profile_id, v_actor_staff_id,
    p_idempotency_key, p_operation, v_request_sha256
  ) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select receipt.* into v_receipt
    from app_private.storefront_authoring_receipts receipt
    where receipt.shop_id = p_shop_id
      and receipt.principal_key = v_principal_key
      and receipt.idempotency_key = p_idempotency_key
    for update;
    if v_receipt.request_sha256 <> v_request_sha256
      or v_receipt.operation <> p_operation
      or v_receipt.response_payload is null then
      return jsonb_build_object(
        'ok', false, 'code', 'idempotency_conflict', 'shop_id', p_shop_id
      );
    end if;
    return v_receipt.response_payload || jsonb_build_object('idempotent', true);
  end if;

  perform 1
  from public.storefront_product_publications publication
  where publication.shop_id = p_shop_id
    and publication.id = any(v_ids)
  order by publication.id
  for update;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    left join public.storefront_product_publications publication
      on publication.shop_id = p_shop_id
      and publication.id = (item->>'publicationId')::uuid
    where publication.id is null
      or publication.catalog_version <> (item->>'expectedVersion')::bigint
      or publication.publication_status = 'ended'
  ) then
    delete from app_private.storefront_authoring_receipts receipt
    where receipt.shop_id = p_shop_id
      and receipt.principal_key = v_principal_key
      and receipt.idempotency_key = p_idempotency_key;
    return jsonb_build_object(
      'ok', false, 'code', 'stale_revision', 'shop_id', p_shop_id
    );
  end if;

  select jsonb_agg(
    app_private.storefront_publication_snapshot_v1(p_shop_id, publication.id)
    order by publication.id
  ) into v_before
  from public.storefront_product_publications publication
  where publication.shop_id = p_shop_id
    and publication.id = any(v_ids);

  begin
    update public.storefront_product_publications publication
    set publication_status = case when p_operation = 'bulk_publish'
          then 'published' else 'paused' end,
        published_at = case when p_operation = 'bulk_publish'
          then coalesce(publication.published_at, statement_timestamp())
          else publication.published_at end,
        catalog_version = publication.catalog_version + 1,
        last_mutation_source = v_source,
        last_correlation_id = p_idempotency_key,
        last_changed_fields = array['status'],
        updated_by_profile_id = v_actor_profile_id
    where publication.shop_id = p_shop_id
      and publication.id = any(v_ids);
  exception when check_violation or foreign_key_violation then
    delete from app_private.storefront_authoring_receipts receipt
    where receipt.shop_id = p_shop_id
      and receipt.principal_key = v_principal_key
      and receipt.idempotency_key = p_idempotency_key;
    return jsonb_build_object(
      'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
    );
  end;

  select jsonb_agg(
    app_private.storefront_publication_snapshot_v1(p_shop_id, publication.id)
    order by publication.id
  ) into v_after
  from public.storefront_product_publications publication
  where publication.shop_id = p_shop_id
    and publication.id = any(v_ids);

  insert into public.audit_logs (
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    v_actor_profile_id, v_actor_staff_id, 'shop', p_shop_id,
    'shop.storefront.authoring.' || p_operation || '.success',
    'info', 'success', 'storefront_publication_bulk', null,
    jsonb_build_object(
      'code', 'success', 'source', v_source, 'operation', p_operation,
      'changedFields', jsonb_build_array('status'), 'outcome', 'success',
      'correlationId', p_idempotency_key, 'before', v_before, 'after', v_after,
      'updatedCount', cardinality(v_ids)
    )
  ) returning audit_log_id into v_audit_id;

  v_response := jsonb_build_object(
    'ok', true, 'code', 'success', 'shop_id', p_shop_id,
    'audit_event_id', v_audit_id, 'idempotent', false,
    'payload', jsonb_build_object(
      'updatedCount', cardinality(v_ids), 'publications', v_after
    )
  );
  update app_private.storefront_authoring_receipts receipt
  set response_payload = v_response
  where receipt.shop_id = p_shop_id
    and receipt.principal_key = v_principal_key
    and receipt.idempotency_key = p_idempotency_key;
  return v_response;
end;
$$;

revoke all on function public.storefront_publications_authoring_read_v1(
  uuid, uuid[], text, integer, integer, uuid, uuid, text, integer
) from public, anon;
revoke all on function public.storefront_publication_authoring_mutate_v1(
  uuid, text, jsonb, uuid, bigint, uuid, uuid, text, integer
) from public, anon;
revoke all on function public.admin_storefront_publication_bulk_mutate_v2(
  uuid, text, jsonb, uuid, uuid, uuid, text, integer
) from public, anon;

grant execute on function public.storefront_publications_authoring_read_v1(
  uuid, uuid[], text, integer, integer, uuid, uuid, text, integer
) to authenticated, service_role;
grant execute on function public.storefront_publication_authoring_mutate_v1(
  uuid, text, jsonb, uuid, bigint, uuid, uuid, text, integer
) to authenticated, service_role;
grant execute on function public.admin_storefront_publication_bulk_mutate_v2(
  uuid, text, jsonb, uuid, uuid, uuid, text, integer
) to authenticated, service_role;

-- The legacy mutation lacks expectedVersion and idempotency.  Keep the symbol
-- for schema compatibility but remove callability after all in-repo callers
-- move to the versioned boundary in this release.
revoke execute on function public.admin_storefront_publication_mutate_v1(
  uuid, text, jsonb, uuid, uuid, text, integer
) from authenticated, service_role;

notify pgrst, 'reload schema';

commit;
