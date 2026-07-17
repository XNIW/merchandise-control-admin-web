-- TASK-137 - Product Catalog Images cross-platform.
--
-- Private immutable Storage objects, server-only lifecycle RPCs and a minimal
-- version reference on inventory_products. Image bytes, object paths and
-- signed URLs never enter sync_events or client-owned product writes.

begin;

create table public.inventory_product_image_versions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  product_id uuid not null references public.inventory_products(id) on delete cascade,
  previous_version_id uuid references public.inventory_product_image_versions(id),
  status text not null default 'pending',
  main_path text not null unique,
  thumb_path text not null unique,
  expected_main_sha256 text not null,
  expected_main_bytes integer not null,
  expected_main_width integer not null,
  expected_main_height integer not null,
  expected_main_mime_type text not null default 'image/jpeg',
  expected_thumb_sha256 text not null,
  expected_thumb_bytes integer not null,
  expected_thumb_width integer not null,
  expected_thumb_height integer not null,
  expected_thumb_mime_type text not null default 'image/jpeg',
  verified_main_sha256 text,
  verified_main_bytes integer,
  verified_main_width integer,
  verified_main_height integer,
  verified_main_mime_type text,
  verified_thumb_sha256 text,
  verified_thumb_bytes integer,
  verified_thumb_width integer,
  verified_thumb_height integer,
  verified_thumb_mime_type text,
  requested_by_profile_id uuid not null references public.profiles(profile_id),
  finalized_by_profile_id uuid references public.profiles(profile_id),
  actor_kind text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  finalized_at timestamptz,
  superseded_at timestamptz,
  removed_at timestamptz,
  cleanup_status text not null default 'not_due',
  cleanup_attempts integer not null default 0,
  cleanup_last_error_code text,
  cleanup_updated_at timestamptz,
  constraint inventory_product_image_versions_status_check check (
    status in ('pending', 'ready', 'superseded', 'removed', 'failed')
  ),
  constraint inventory_product_image_versions_actor_kind_check check (
    actor_kind in ('personal_account', 'platform_admin')
  ),
  constraint inventory_product_image_versions_cleanup_status_check check (
    cleanup_status in ('not_due', 'pending', 'complete', 'failed')
  ),
  constraint inventory_product_image_versions_cleanup_attempts_check check (
    cleanup_attempts >= 0
  ),
  constraint inventory_product_image_versions_expected_main_sha_check check (
    expected_main_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint inventory_product_image_versions_expected_thumb_sha_check check (
    expected_thumb_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint inventory_product_image_versions_verified_main_sha_check check (
    verified_main_sha256 is null or verified_main_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint inventory_product_image_versions_verified_thumb_sha_check check (
    verified_thumb_sha256 is null or verified_thumb_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint inventory_product_image_versions_expected_main_shape_check check (
    expected_main_bytes between 1 and 1048576
    and expected_main_width between 1 and 1600
    and expected_main_height between 1 and 1600
    and expected_main_mime_type = 'image/jpeg'
  ),
  constraint inventory_product_image_versions_expected_thumb_shape_check check (
    expected_thumb_bytes between 1 and 92160
    and expected_thumb_width between 1 and 384
    and expected_thumb_height between 1 and 384
    and expected_thumb_mime_type = 'image/jpeg'
  ),
  constraint inventory_product_image_versions_verified_main_shape_check check (
    verified_main_bytes is null
    or (
      verified_main_bytes between 1 and 1048576
      and verified_main_width between 1 and 1600
      and verified_main_height between 1 and 1600
      and verified_main_mime_type = 'image/jpeg'
    )
  ),
  constraint inventory_product_image_versions_verified_thumb_shape_check check (
    verified_thumb_bytes is null
    or (
      verified_thumb_bytes between 1 and 92160
      and verified_thumb_width between 1 and 384
      and verified_thumb_height between 1 and 384
      and verified_thumb_mime_type = 'image/jpeg'
    )
  ),
  constraint inventory_product_image_versions_main_path_check check (
    main_path = 'shops/' || shop_id::text || '/products/' || product_id::text
      || '/primary/' || id::text || '/main.jpg'
  ),
  constraint inventory_product_image_versions_thumb_path_check check (
    thumb_path = 'shops/' || shop_id::text || '/products/' || product_id::text
      || '/primary/' || id::text || '/thumb.jpg'
  ),
  constraint inventory_product_image_versions_expiry_check check (
    expires_at > created_at and expires_at <= created_at + interval '2 hours 5 minutes'
  ),
  constraint inventory_product_image_versions_finalized_shape_check check (
    (
      status in ('pending', 'failed')
      and finalized_at is null
    )
    or (
      status in ('ready', 'superseded', 'removed')
      and finalized_at is not null
      and finalized_by_profile_id is not null
      and verified_main_sha256 is not null
      and verified_main_bytes is not null
      and verified_main_width is not null
      and verified_main_height is not null
      and verified_main_mime_type = 'image/jpeg'
      and verified_thumb_sha256 is not null
      and verified_thumb_bytes is not null
      and verified_thumb_width is not null
      and verified_thumb_height is not null
      and verified_thumb_mime_type = 'image/jpeg'
    )
  ),
  constraint inventory_product_image_versions_terminal_timestamp_check check (
    (status <> 'superseded' or superseded_at is not null)
    and (status <> 'removed' or removed_at is not null)
  )
);

alter table public.inventory_products
  add column primary_image_version_id uuid
    references public.inventory_product_image_versions(id),
  add column primary_image_updated_at timestamptz;

create index inventory_product_image_versions_shop_product_created_idx
  on public.inventory_product_image_versions(shop_id, product_id, created_at desc);
create index inventory_product_image_versions_actor_created_idx
  on public.inventory_product_image_versions(requested_by_profile_id, created_at desc);
create index inventory_product_image_versions_cleanup_idx
  on public.inventory_product_image_versions(cleanup_status, created_at)
  where cleanup_status in ('pending', 'failed');
create unique index inventory_product_image_versions_one_ready_per_product
  on public.inventory_product_image_versions(product_id)
  where status = 'ready';
create index inventory_products_primary_image_version_idx
  on public.inventory_products(primary_image_version_id)
  where primary_image_version_id is not null;

alter table public.inventory_product_image_versions enable row level security;
alter table public.inventory_product_image_versions force row level security;
revoke all on table public.inventory_product_image_versions
  from public, anon, authenticated;
grant select, insert, update, delete on table public.inventory_product_image_versions
  to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'product-images',
  'product-images',
  false,
  1048576,
  array['image/jpeg']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function app_private.product_image_actor_can_write(
  p_actor_profile_id uuid,
  p_shop_id uuid,
  p_actor_kind text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    p_actor_profile_id is not null
    and p_shop_id is not null
    and exists (
      select 1
      from public.profiles profile
      join public.shops shop on shop.shop_id = p_shop_id
      where profile.profile_id = p_actor_profile_id
        and profile.profile_status = 'active'
        and shop.shop_status = 'active'
    )
    and (
      (
        p_actor_kind = 'personal_account'
        and exists (
          select 1
          from public.shop_members member
          where member.profile_id = p_actor_profile_id
            and member.shop_id = p_shop_id
            and member.membership_status = 'active'
            and member.role_key in ('shop_owner', 'shop_manager')
        )
      )
      or (
        p_actor_kind = 'platform_admin'
        and exists (
          select 1
          from public.platform_admins platform_admin
          where platform_admin.profile_id = p_actor_profile_id
            and platform_admin.status = 'active'
            and platform_admin.revoked_at is null
        )
      )
    ),
    false
  );
$$;

create or replace function app_private.product_image_actor_can_read(
  p_actor_profile_id uuid,
  p_shop_id uuid,
  p_actor_kind text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    p_actor_profile_id is not null
    and p_shop_id is not null
    and exists (
      select 1
      from public.profiles profile
      join public.shops shop on shop.shop_id = p_shop_id
      where profile.profile_id = p_actor_profile_id
        and profile.profile_status = 'active'
        and shop.shop_status = 'active'
    )
    and (
      (
        p_actor_kind = 'personal_account'
        and exists (
          select 1
          from public.shop_members member
          where member.profile_id = p_actor_profile_id
            and member.shop_id = p_shop_id
            and member.membership_status = 'active'
            and member.role_key in ('shop_owner', 'shop_manager', 'viewer')
        )
      )
      or (
        p_actor_kind = 'platform_admin'
        and exists (
          select 1
          from public.platform_admins platform_admin
          where platform_admin.profile_id = p_actor_profile_id
            and platform_admin.status = 'active'
            and platform_admin.revoked_at is null
        )
      )
    ),
    false
  );
$$;

create or replace function app_private.product_image_product_is_in_shop(
  p_product_id uuid,
  p_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    exists (
      select 1
      from public.inventory_products product
      where product.id = p_product_id
        and product.deleted_at is null
        and (
          product.shop_id = p_shop_id
          or (
            product.shop_id is null
            and exists (
              select 1
              from public.shop_inventory_sources source
              where source.shop_id = p_shop_id
                and source.owner_user_id = product.owner_user_id
                and source.mapping_state = 'mapped'
                and source.disabled_at is null
            )
          )
        )
    ),
    false
  );
$$;

create or replace function app_private.write_product_image_audit(
  p_actor_profile_id uuid,
  p_shop_id uuid,
  p_event_key text,
  p_severity text,
  p_result text,
  p_product_id uuid,
  p_version_id uuid,
  p_code text,
  p_actor_kind text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_audit_id uuid;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if jsonb_typeof(v_metadata) <> 'object' then
    v_metadata := '{}'::jsonb;
  end if;

  v_metadata := v_metadata - array[
    'path', 'main_path', 'thumb_path', 'token', 'signed_url', 'upload_url',
    'image_bytes', 'exif', 'gps', 'local_path'
  ];

  insert into public.audit_logs (
    actor_profile_id,
    scope,
    shop_id,
    event_key,
    severity,
    result,
    target_type,
    target_id,
    metadata_redacted
  )
  values (
    p_actor_profile_id,
    'shop',
    p_shop_id,
    p_event_key,
    case when p_severity in ('info', 'warning', 'critical') then p_severity else 'warning' end,
    case when p_result in ('success', 'blocked', 'simulated') then p_result else 'blocked' end,
    'inventory_product_image',
    coalesce(p_version_id::text, p_product_id::text),
    jsonb_strip_nulls(
      jsonb_build_object(
        'actor_kind', p_actor_kind,
        'code', p_code,
        'product_id', p_product_id,
        'source', 'product_image_api',
        'version_id', p_version_id
      ) || v_metadata
    )
  )
  returning audit_log_id into v_audit_id;

  return v_audit_id;
end;
$$;

create or replace function app_private.emit_product_image_sync_event(
  p_shop_id uuid,
  p_product_id uuid,
  p_version_id uuid,
  p_operation text,
  p_actor_kind text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_user_id uuid;
  v_event_id bigint;
  v_client_event_id text;
  v_catalog_scope text;
begin
  select product.owner_user_id,
    case when product.shop_id is null then 'legacy_owner_bridge' else 'shop_scoped' end
  into v_owner_user_id, v_catalog_scope
  from public.inventory_products product
  where product.id = p_product_id;

  if v_owner_user_id is null then
    raise exception 'product_image_sync_product_missing' using errcode = 'P0002';
  end if;

  v_client_event_id := left(
    'product_image:' || p_operation || ':' || p_product_id::text || ':' || p_version_id::text,
    160
  );

  insert into public.sync_events (
    changed_count,
    client_event_id,
    domain,
    entity_ids,
    event_type,
    metadata,
    owner_user_id,
    shop_id,
    source,
    source_device_id
  )
  values (
    1,
    v_client_event_id,
    'catalog',
    jsonb_build_object('product_ids', jsonb_build_array(p_product_id)),
    'catalog_changed',
    jsonb_build_object(
      'actor_kind', p_actor_kind,
      'atomic_rpc', true,
      'catalog_scope', v_catalog_scope,
      'entity_type', 'product',
      'operation', p_operation,
      'payload_version', 1,
      'source', 'product_image_api',
      'status', 'success'
    ),
    v_owner_user_id,
    p_shop_id,
    'product_image_api',
    null
  )
  on conflict (owner_user_id, client_event_id)
    where client_event_id is not null
    do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select event.id into v_event_id
    from public.sync_events event
    where event.owner_user_id = v_owner_user_id
      and event.client_event_id = v_client_event_id;
  end if;

  return v_event_id;
end;
$$;

create or replace function app_private.can_read_product_image_object(
  p_object_name text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    auth.uid() is not null
    and exists (
      select 1
      from public.inventory_product_image_versions version
      join public.inventory_products product
        on product.id = version.product_id
       and product.primary_image_version_id = version.id
       and product.deleted_at is null
      join public.shops shop
        on shop.shop_id = version.shop_id
       and shop.shop_status = 'active'
      join public.shop_members member
        on member.shop_id = version.shop_id
       and member.profile_id = auth.uid()
       and member.membership_status = 'active'
       and member.role_key in ('shop_owner', 'shop_manager', 'viewer')
      where version.status = 'ready'
        and (version.main_path = p_object_name or version.thumb_path = p_object_name)
    ),
    false
  );
$$;

create or replace function app_private.guard_product_image_reference()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_image_changed boolean;
begin
  v_image_changed := case
    when tg_op = 'INSERT' then
      new.primary_image_version_id is not null
      or new.primary_image_updated_at is not null
    else
      old.primary_image_version_id is distinct from new.primary_image_version_id
      or old.primary_image_updated_at is distinct from new.primary_image_updated_at
  end;

  if v_image_changed and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'product_image_reference_is_server_managed'
      using errcode = '42501';
  end if;

  if new.primary_image_version_id is not null then
    if new.primary_image_updated_at is null or not exists (
      select 1
      from public.inventory_product_image_versions version
      where version.id = new.primary_image_version_id
        and version.product_id = new.id
        and version.status = 'ready'
    ) then
      raise exception 'product_image_reference_invalid'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists task137_guard_product_image_reference
  on public.inventory_products;
create trigger task137_guard_product_image_reference
  before insert or update on public.inventory_products
  for each row execute function app_private.guard_product_image_reference();

drop policy if exists task137_product_images_private_read
  on storage.objects;
create policy task137_product_images_private_read
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'product-images'
    and app_private.can_read_product_image_object(name)
  );

create or replace function public.product_image_create_intent(
  p_actor_profile_id uuid,
  p_actor_kind text,
  p_shop_id uuid,
  p_product_id uuid,
  p_main_sha256 text,
  p_main_bytes integer,
  p_main_width integer,
  p_main_height integer,
  p_thumb_sha256 text,
  p_thumb_bytes integer,
  p_thumb_width integer,
  p_thumb_height integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_product public.inventory_products%rowtype;
  v_current public.inventory_product_image_versions%rowtype;
  v_version_id uuid := gen_random_uuid();
  v_main_path text;
  v_thumb_path text;
  v_actor_count integer;
  v_shop_count integer;
  v_audit_id uuid;
begin
  if not app_private.product_image_actor_can_write(
    p_actor_profile_id, p_shop_id, p_actor_kind
  ) then
    if exists (select 1 from public.shops where shop_id = p_shop_id) then
      perform app_private.write_product_image_audit(
        p_actor_profile_id, p_shop_id, 'shop.product_image.intent_denied',
        'warning', 'blocked', p_product_id, null, 'permission_denied',
        p_actor_kind
      );
    end if;
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  if p_main_sha256 !~ '^[0-9a-f]{64}$'
    or p_thumb_sha256 !~ '^[0-9a-f]{64}$'
    or p_main_bytes not between 1 and 1048576
    or p_thumb_bytes not between 1 and 92160
    or p_main_width not between 1 and 1600
    or p_main_height not between 1 and 1600
    or p_thumb_width not between 1 and 384
    or p_thumb_height not between 1 and 384
    or abs(
      (p_main_width::numeric / p_main_height::numeric)
      - (p_thumb_width::numeric / p_thumb_height::numeric)
    ) > 0.02 then
    perform app_private.write_product_image_audit(
      p_actor_profile_id, p_shop_id, 'shop.product_image.intent_denied',
      'warning', 'blocked', p_product_id, null, 'validation_failed',
      p_actor_kind
    );
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  select product.* into v_product
  from public.inventory_products product
  where product.id = p_product_id
  for update;

  if v_product.id is null
    or not app_private.product_image_product_is_in_shop(p_product_id, p_shop_id) then
    perform app_private.write_product_image_audit(
      p_actor_profile_id, p_shop_id, 'shop.product_image.intent_denied',
      'warning', 'blocked', p_product_id, null, 'not_found', p_actor_kind
    );
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_product.primary_image_version_id is not null then
    select version.* into v_current
    from public.inventory_product_image_versions version
    where version.id = v_product.primary_image_version_id
      and version.product_id = p_product_id
      and version.shop_id = p_shop_id
      and version.status = 'ready';

    if v_current.id is not null
      and v_current.verified_main_sha256 = p_main_sha256
      and v_current.verified_thumb_sha256 = p_thumb_sha256 then
      v_audit_id := app_private.write_product_image_audit(
        p_actor_profile_id, p_shop_id, 'shop.product_image.intent_noop',
        'info', 'success', p_product_id, v_current.id, 'checksum_noop',
        p_actor_kind
      );
      return jsonb_build_object(
        'ok', true,
        'code', 'checksum_noop',
        'status', 'noop',
        'version_id', v_current.id,
        'audit_event_id', v_audit_id
      );
    end if;
  end if;

  select count(*)::integer into v_actor_count
  from public.inventory_product_image_versions version
  where version.requested_by_profile_id = p_actor_profile_id
    and version.created_at >= now() - interval '15 minutes';

  select count(*)::integer into v_shop_count
  from public.inventory_product_image_versions version
  where version.shop_id = p_shop_id
    and version.created_at >= now() - interval '1 hour';

  if v_actor_count >= 20 or v_shop_count >= 100 then
    perform app_private.write_product_image_audit(
      p_actor_profile_id, p_shop_id, 'shop.product_image.intent_denied',
      'warning', 'blocked', p_product_id, null, 'rate_limited', p_actor_kind
    );
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  update public.inventory_product_image_versions
  set status = 'failed',
      cleanup_status = 'pending',
      cleanup_last_error_code = 'replaced_by_new_intent',
      cleanup_updated_at = now()
  where product_id = p_product_id
    and shop_id = p_shop_id
    and status = 'pending';

  v_main_path := 'shops/' || p_shop_id::text || '/products/' || p_product_id::text
    || '/primary/' || v_version_id::text || '/main.jpg';
  v_thumb_path := 'shops/' || p_shop_id::text || '/products/' || p_product_id::text
    || '/primary/' || v_version_id::text || '/thumb.jpg';

  insert into public.inventory_product_image_versions (
    id,
    shop_id,
    product_id,
    previous_version_id,
    main_path,
    thumb_path,
    expected_main_sha256,
    expected_main_bytes,
    expected_main_width,
    expected_main_height,
    expected_thumb_sha256,
    expected_thumb_bytes,
    expected_thumb_width,
    expected_thumb_height,
    requested_by_profile_id,
    actor_kind
  )
  values (
    v_version_id,
    p_shop_id,
    p_product_id,
    v_product.primary_image_version_id,
    v_main_path,
    v_thumb_path,
    p_main_sha256,
    p_main_bytes,
    p_main_width,
    p_main_height,
    p_thumb_sha256,
    p_thumb_bytes,
    p_thumb_width,
    p_thumb_height,
    p_actor_profile_id,
    p_actor_kind
  );

  v_audit_id := app_private.write_product_image_audit(
    p_actor_profile_id, p_shop_id, 'shop.product_image.intent_created',
    'info', 'success', p_product_id, v_version_id, 'upload_required',
    p_actor_kind,
    jsonb_build_object(
      'main_byte_count', p_main_bytes,
      'main_height', p_main_height,
      'main_width', p_main_width,
      'thumb_byte_count', p_thumb_bytes,
      'thumb_height', p_thumb_height,
      'thumb_width', p_thumb_width
    )
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'upload_required',
    'status', 'upload_required',
    'version_id', v_version_id,
    'expires_at', now() + interval '2 hours',
    'main_path', v_main_path,
    'thumb_path', v_thumb_path,
    'audit_event_id', v_audit_id
  );
end;
$$;

create or replace function public.product_image_fail_version(
  p_actor_profile_id uuid,
  p_actor_kind text,
  p_shop_id uuid,
  p_product_id uuid,
  p_version_id uuid,
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_error_code text := lower(coalesce(p_error_code, 'validation_failed'));
  v_audit_id uuid;
begin
  if v_error_code !~ '^[a-z0-9_]{1,64}$' then
    v_error_code := 'validation_failed';
  end if;

  update public.inventory_product_image_versions version
  set status = 'failed',
      cleanup_status = 'pending',
      cleanup_last_error_code = v_error_code,
      cleanup_updated_at = now()
  where version.id = p_version_id
    and version.shop_id = p_shop_id
    and version.product_id = p_product_id
    and version.requested_by_profile_id = p_actor_profile_id
    and version.status = 'pending';

  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid_state_or_not_found');
  end if;

  v_audit_id := app_private.write_product_image_audit(
    p_actor_profile_id, p_shop_id, 'shop.product_image.validation_failed',
    'warning', 'blocked', p_product_id, p_version_id, v_error_code,
    p_actor_kind
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'failed_recorded',
    'audit_event_id', v_audit_id
  );
end;
$$;

create or replace function public.product_image_finalize(
  p_actor_profile_id uuid,
  p_actor_kind text,
  p_shop_id uuid,
  p_product_id uuid,
  p_version_id uuid,
  p_main_sha256 text,
  p_main_bytes integer,
  p_main_width integer,
  p_main_height integer,
  p_thumb_sha256 text,
  p_thumb_bytes integer,
  p_thumb_width integer,
  p_thumb_height integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_product public.inventory_products%rowtype;
  v_version public.inventory_product_image_versions%rowtype;
  v_previous_version_id uuid;
  v_changed_at timestamptz := now();
  v_audit_id uuid;
  v_sync_event_id bigint;
begin
  if not app_private.product_image_actor_can_write(
    p_actor_profile_id, p_shop_id, p_actor_kind
  ) then
    if exists (select 1 from public.shops where shop_id = p_shop_id) then
      perform app_private.write_product_image_audit(
        p_actor_profile_id, p_shop_id, 'shop.product_image.finalize_denied',
        'warning', 'blocked', p_product_id, p_version_id, 'permission_denied',
        p_actor_kind
      );
    end if;
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  select product.* into v_product
  from public.inventory_products product
  where product.id = p_product_id
  for update;

  if v_product.id is null
    or not app_private.product_image_product_is_in_shop(p_product_id, p_shop_id) then
    perform app_private.write_product_image_audit(
      p_actor_profile_id, p_shop_id, 'shop.product_image.finalize_denied',
      'warning', 'blocked', p_product_id, p_version_id, 'not_found',
      p_actor_kind
    );
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select version.* into v_version
  from public.inventory_product_image_versions version
  where version.id = p_version_id
    and version.product_id = p_product_id
    and version.shop_id = p_shop_id
  for update;

  if v_version.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_version.status = 'ready'
    and v_product.primary_image_version_id = p_version_id then
    return jsonb_build_object(
      'ok', true,
      'code', 'already_finalized',
      'status', 'already_finalized',
      'version_id', p_version_id,
      'image_updated_at', v_product.primary_image_updated_at
    );
  end if;

  if v_version.status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'invalid_state');
  end if;

  if v_version.expires_at < now() then
    update public.inventory_product_image_versions
    set status = 'failed',
        cleanup_status = 'pending',
        cleanup_last_error_code = 'intent_expired',
        cleanup_updated_at = now()
    where id = p_version_id;
    perform app_private.write_product_image_audit(
      p_actor_profile_id, p_shop_id, 'shop.product_image.finalize_failed',
      'warning', 'blocked', p_product_id, p_version_id, 'intent_expired',
      p_actor_kind
    );
    return jsonb_build_object('ok', false, 'code', 'intent_expired');
  end if;

  if v_version.expected_main_sha256 <> p_main_sha256
    or v_version.expected_main_bytes <> p_main_bytes
    or v_version.expected_main_width <> p_main_width
    or v_version.expected_main_height <> p_main_height
    or v_version.expected_thumb_sha256 <> p_thumb_sha256
    or v_version.expected_thumb_bytes <> p_thumb_bytes
    or v_version.expected_thumb_width <> p_thumb_width
    or v_version.expected_thumb_height <> p_thumb_height then
    update public.inventory_product_image_versions
    set status = 'failed',
        cleanup_status = 'pending',
        cleanup_last_error_code = 'verified_metadata_mismatch',
        cleanup_updated_at = now()
    where id = p_version_id;
    perform app_private.write_product_image_audit(
      p_actor_profile_id, p_shop_id, 'shop.product_image.finalize_failed',
      'critical', 'blocked', p_product_id, p_version_id,
      'verified_metadata_mismatch', p_actor_kind
    );
    return jsonb_build_object('ok', false, 'code', 'verified_metadata_mismatch');
  end if;

  v_previous_version_id := v_product.primary_image_version_id;

  if v_previous_version_id is not null and v_previous_version_id <> p_version_id then
    update public.inventory_product_image_versions
    set status = 'superseded',
        superseded_at = v_changed_at,
        cleanup_status = 'pending',
        cleanup_updated_at = v_changed_at
    where id = v_previous_version_id
      and product_id = p_product_id
      and status = 'ready';
  end if;

  update public.inventory_product_image_versions
  set status = 'ready',
      verified_main_sha256 = p_main_sha256,
      verified_main_bytes = p_main_bytes,
      verified_main_width = p_main_width,
      verified_main_height = p_main_height,
      verified_main_mime_type = 'image/jpeg',
      verified_thumb_sha256 = p_thumb_sha256,
      verified_thumb_bytes = p_thumb_bytes,
      verified_thumb_width = p_thumb_width,
      verified_thumb_height = p_thumb_height,
      verified_thumb_mime_type = 'image/jpeg',
      finalized_by_profile_id = p_actor_profile_id,
      finalized_at = v_changed_at,
      cleanup_status = 'not_due',
      cleanup_last_error_code = null,
      cleanup_updated_at = null
  where id = p_version_id;

  update public.inventory_products
  set primary_image_version_id = p_version_id,
      primary_image_updated_at = v_changed_at,
      updated_at = v_changed_at
  where id = p_product_id;

  v_sync_event_id := app_private.emit_product_image_sync_event(
    p_shop_id, p_product_id, p_version_id, 'image_finalize', p_actor_kind
  );

  v_audit_id := app_private.write_product_image_audit(
    p_actor_profile_id, p_shop_id,
    case when v_previous_version_id is null
      then 'shop.product_image.finalized'
      else 'shop.product_image.replaced'
    end,
    'info', 'success', p_product_id, p_version_id,
    case when v_previous_version_id is null then 'finalized' else 'replaced' end,
    p_actor_kind,
    jsonb_build_object(
      'main_byte_count', p_main_bytes,
      'main_height', p_main_height,
      'main_width', p_main_width,
      'previous_version_id', v_previous_version_id,
      'sync_event_id', v_sync_event_id,
      'thumb_byte_count', p_thumb_bytes,
      'thumb_height', p_thumb_height,
      'thumb_width', p_thumb_width
    )
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'finalized',
    'status', 'finalized',
    'version_id', p_version_id,
    'image_updated_at', v_changed_at,
    'audit_event_id', v_audit_id
  );
end;
$$;

create or replace function public.product_image_remove(
  p_actor_profile_id uuid,
  p_actor_kind text,
  p_shop_id uuid,
  p_product_id uuid,
  p_expected_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_product public.inventory_products%rowtype;
  v_version public.inventory_product_image_versions%rowtype;
  v_changed_at timestamptz := now();
  v_audit_id uuid;
  v_sync_event_id bigint;
begin
  if not app_private.product_image_actor_can_write(
    p_actor_profile_id, p_shop_id, p_actor_kind
  ) then
    if exists (select 1 from public.shops where shop_id = p_shop_id) then
      perform app_private.write_product_image_audit(
        p_actor_profile_id, p_shop_id, 'shop.product_image.remove_denied',
        'warning', 'blocked', p_product_id, p_expected_version_id,
        'permission_denied', p_actor_kind
      );
    end if;
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  select product.* into v_product
  from public.inventory_products product
  where product.id = p_product_id
  for update;

  if v_product.id is null
    or not app_private.product_image_product_is_in_shop(p_product_id, p_shop_id) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_product.primary_image_version_id is null then
    return jsonb_build_object(
      'ok', true,
      'code', 'already_removed',
      'status', 'already_removed'
    );
  end if;

  if p_expected_version_id is null
    or v_product.primary_image_version_id <> p_expected_version_id then
    perform app_private.write_product_image_audit(
      p_actor_profile_id, p_shop_id, 'shop.product_image.remove_denied',
      'warning', 'blocked', p_product_id, p_expected_version_id,
      'stale_conflict', p_actor_kind
    );
    return jsonb_build_object('ok', false, 'code', 'stale_conflict');
  end if;

  select version.* into v_version
  from public.inventory_product_image_versions version
  where version.id = p_expected_version_id
    and version.product_id = p_product_id
    and version.shop_id = p_shop_id
    and version.status = 'ready'
  for update;

  if v_version.id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_state_or_not_found');
  end if;

  update public.inventory_product_image_versions
  set status = 'removed',
      removed_at = v_changed_at,
      cleanup_status = 'pending',
      cleanup_updated_at = v_changed_at
  where id = p_expected_version_id;

  update public.inventory_products
  set primary_image_version_id = null,
      primary_image_updated_at = v_changed_at,
      updated_at = v_changed_at
  where id = p_product_id;

  v_sync_event_id := app_private.emit_product_image_sync_event(
    p_shop_id, p_product_id, p_expected_version_id, 'image_remove', p_actor_kind
  );

  v_audit_id := app_private.write_product_image_audit(
    p_actor_profile_id, p_shop_id, 'shop.product_image.removed',
    'info', 'success', p_product_id, p_expected_version_id, 'removed',
    p_actor_kind,
    jsonb_build_object('sync_event_id', v_sync_event_id)
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'removed',
    'status', 'removed',
    'version_id', p_expected_version_id,
    'main_path', v_version.main_path,
    'thumb_path', v_version.thumb_path,
    'image_updated_at', v_changed_at,
    'audit_event_id', v_audit_id
  );
end;
$$;

create or replace function public.product_image_resolve_read_paths(
  p_actor_profile_id uuid,
  p_actor_kind text,
  p_shop_id uuid,
  p_refs jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_items jsonb;
begin
  if not app_private.product_image_actor_can_read(
    p_actor_profile_id, p_shop_id, p_actor_kind
  ) then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  if jsonb_typeof(p_refs) <> 'array'
    or jsonb_array_length(p_refs) < 1
    or jsonb_array_length(p_refs) > 100
    or exists (
      select 1
      from jsonb_array_elements(p_refs) ref
      where coalesce(ref->>'productId', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(ref->>'versionId', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(ref->>'variant', '') not in ('main', 'thumb')
    ) then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  select coalesce(jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'product_id', ref->>'productId',
      'version_id', ref->>'versionId',
      'variant', ref->>'variant',
      'code', case when version.id is null then 'not_found' else 'success' end,
      'object_path', case
        when version.id is null then null
        when ref->>'variant' = 'main' then version.main_path
        else version.thumb_path
      end
    ))
  ), '[]'::jsonb)
  into v_items
  from jsonb_array_elements(p_refs) ref
  left join public.inventory_product_image_versions version
    on version.id = (ref->>'versionId')::uuid
   and version.product_id = (ref->>'productId')::uuid
   and version.shop_id = p_shop_id
   and version.status = 'ready'
  left join public.inventory_products product
    on product.id = version.product_id
   and product.primary_image_version_id = version.id
   and product.deleted_at is null
  where version.id is null or product.id is not null;

  return jsonb_build_object('ok', true, 'code', 'success', 'items', v_items);
end;
$$;

create or replace function public.product_image_record_cleanup(
  p_actor_profile_id uuid,
  p_actor_kind text,
  p_shop_id uuid,
  p_product_id uuid,
  p_version_id uuid,
  p_success boolean,
  p_error_code text default null,
  p_source text default 'admin_script'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_error_code text := lower(coalesce(p_error_code, 'storage_delete_failed'));
  v_audit_id uuid;
begin
  if v_error_code !~ '^[a-z0-9_]{1,64}$' then
    v_error_code := 'storage_delete_failed';
  end if;

  update public.inventory_product_image_versions version
  set cleanup_status = case when p_success then 'complete' else 'failed' end,
      cleanup_attempts = cleanup_attempts + 1,
      cleanup_last_error_code = case when p_success then null else v_error_code end,
      cleanup_updated_at = now()
  where version.id = p_version_id
    and version.shop_id = p_shop_id
    and version.product_id = p_product_id
    and version.status in ('failed', 'superseded', 'removed');

  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid_state_or_not_found');
  end if;

  v_audit_id := app_private.write_product_image_audit(
    p_actor_profile_id, p_shop_id,
    case when p_success
      then 'shop.product_image.cleanup_completed'
      else 'shop.product_image.cleanup_failed'
    end,
    case when p_success then 'info' else 'warning' end,
    case when p_success then 'success' else 'blocked' end,
    p_product_id,
    p_version_id,
    case when p_success then 'cleanup_complete' else v_error_code end,
    case when p_actor_kind in ('personal_account', 'platform_admin')
      then p_actor_kind else 'platform_admin' end,
    jsonb_build_object(
      'cleanup_source', case when p_source in ('api_remove', 'admin_script')
        then p_source else 'admin_script' end
    )
  );

  return jsonb_build_object(
    'ok', true,
    'code', case when p_success then 'cleanup_complete' else 'cleanup_failed' end,
    'audit_event_id', v_audit_id
  );
end;
$$;

create or replace function public.product_image_record_denied(
  p_actor_profile_id uuid,
  p_actor_kind text,
  p_shop_id uuid,
  p_product_id uuid,
  p_operation text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_operation text := lower(coalesce(p_operation, 'request'));
  v_code text := lower(coalesce(p_code, 'permission_denied'));
  v_audit_id uuid;
begin
  if not exists (select 1 from public.shops where shop_id = p_shop_id) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_operation not in ('intent', 'finalize', 'read', 'remove', 'request') then
    v_operation := 'request';
  end if;
  if v_code !~ '^[a-z0-9_]{1,64}$' then
    v_code := 'permission_denied';
  end if;

  v_audit_id := app_private.write_product_image_audit(
    p_actor_profile_id,
    p_shop_id,
    'shop.product_image.' || v_operation || '_denied',
    'warning',
    'blocked',
    p_product_id,
    null,
    v_code,
    case when p_actor_kind in ('personal_account', 'platform_admin')
      then p_actor_kind else 'personal_account' end
  );

  return jsonb_build_object('ok', true, 'code', 'denied_recorded', 'audit_event_id', v_audit_id);
end;
$$;

revoke all on function app_private.product_image_actor_can_write(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function app_private.product_image_actor_can_read(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function app_private.product_image_product_is_in_shop(uuid, uuid)
  from public, anon, authenticated;
revoke all on function app_private.write_product_image_audit(uuid, uuid, text, text, text, uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function app_private.emit_product_image_sync_event(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function app_private.guard_product_image_reference()
  from public, anon, authenticated;
revoke all on function app_private.can_read_product_image_object(text)
  from public, anon, authenticated;
grant execute on function app_private.can_read_product_image_object(text)
  to authenticated;

revoke all on function public.product_image_create_intent(uuid, text, uuid, uuid, text, integer, integer, integer, text, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.product_image_fail_version(uuid, text, uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.product_image_finalize(uuid, text, uuid, uuid, uuid, text, integer, integer, integer, text, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.product_image_remove(uuid, text, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.product_image_resolve_read_paths(uuid, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.product_image_record_cleanup(uuid, text, uuid, uuid, uuid, boolean, text, text)
  from public, anon, authenticated;
revoke all on function public.product_image_record_denied(uuid, text, uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.product_image_create_intent(uuid, text, uuid, uuid, text, integer, integer, integer, text, integer, integer, integer)
  to service_role;
grant execute on function public.product_image_fail_version(uuid, text, uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.product_image_finalize(uuid, text, uuid, uuid, uuid, text, integer, integer, integer, text, integer, integer, integer)
  to service_role;
grant execute on function public.product_image_remove(uuid, text, uuid, uuid, uuid)
  to service_role;
grant execute on function public.product_image_resolve_read_paths(uuid, text, uuid, jsonb)
  to service_role;
grant execute on function public.product_image_record_cleanup(uuid, text, uuid, uuid, uuid, boolean, text, text)
  to service_role;
grant execute on function public.product_image_record_denied(uuid, text, uuid, uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
