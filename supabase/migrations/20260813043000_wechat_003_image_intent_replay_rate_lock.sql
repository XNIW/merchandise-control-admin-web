-- WECHAT-003: durable Mini Program image-intent replay and atomic admission.
--
-- The public legacy Admin RPC keeps its exact name, signature and result. Its
-- original implementation is made private and is reached only through a
-- transaction-locking compatibility wrapper. Every legacy and Mini intent
-- therefore performs the existing sliding-window counts while holding the
-- same shop and actor advisory locks.

begin;

create table app_private.wechat_product_image_intent_receipts (
  receipt_id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  actor_profile_id uuid not null,
  idempotency_key uuid not null,
  correlation_id uuid not null,
  product_id uuid not null,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint wechat_product_image_intent_receipts_hash_check check (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint wechat_product_image_intent_receipts_result_check check (
    jsonb_typeof(result) = 'object'
    and pg_column_size(result) <= 32768
  ),
  constraint wechat_product_image_intent_receipts_actor_key_unique unique (
    shop_id, actor_profile_id, idempotency_key
  )
);

alter table app_private.wechat_product_image_intent_receipts
  enable row level security;
alter table app_private.wechat_product_image_intent_receipts
  force row level security;
revoke all on table app_private.wechat_product_image_intent_receipts
  from public, anon, authenticated, service_role;

create index wechat_product_image_intent_receipts_actor_created_idx
  on app_private.wechat_product_image_intent_receipts (
    shop_id, actor_profile_id, created_at desc
  );

create index wechat_product_image_intent_receipts_retention_idx
  on app_private.wechat_product_image_intent_receipts (
    created_at, receipt_id
  );

create table app_private.wechat_product_image_intent_actor_rate_limits (
  actor_profile_id uuid primary key,
  window_started_at timestamptz not null,
  admitted_count integer not null,
  updated_at timestamptz not null,
  constraint wechat_image_intent_actor_rate_shape_check check (
    pg_catalog.isfinite(window_started_at)
    and pg_catalog.isfinite(updated_at)
    and admitted_count between 1 and 20
  )
);

create table app_private.wechat_product_image_intent_shop_rate_limits (
  shop_id uuid primary key,
  window_started_at timestamptz not null,
  admitted_count integer not null,
  updated_at timestamptz not null,
  constraint wechat_image_intent_shop_rate_shape_check check (
    pg_catalog.isfinite(window_started_at)
    and pg_catalog.isfinite(updated_at)
    and admitted_count between 1 and 100
  )
);

create table app_private.product_image_denial_audit_rate_limits (
  shop_id uuid not null,
  actor_profile_id uuid not null,
  window_started_at timestamptz not null,
  admitted_count integer not null,
  updated_at timestamptz not null,
  primary key (shop_id, actor_profile_id),
  constraint product_image_denial_audit_rate_shape_check check (
    pg_catalog.isfinite(window_started_at)
    and pg_catalog.isfinite(updated_at)
    and admitted_count between 1 and 60
  )
);

alter table app_private.wechat_product_image_intent_actor_rate_limits
  enable row level security;
alter table app_private.wechat_product_image_intent_actor_rate_limits
  force row level security;
alter table app_private.wechat_product_image_intent_shop_rate_limits
  enable row level security;
alter table app_private.wechat_product_image_intent_shop_rate_limits
  force row level security;
alter table app_private.product_image_denial_audit_rate_limits
  enable row level security;
alter table app_private.product_image_denial_audit_rate_limits
  force row level security;
revoke all on table app_private.wechat_product_image_intent_actor_rate_limits
  from public, anon, authenticated, service_role;
revoke all on table app_private.wechat_product_image_intent_shop_rate_limits
  from public, anon, authenticated, service_role;
revoke all on table app_private.product_image_denial_audit_rate_limits
  from public, anon, authenticated, service_role;

create or replace function app_private.prevent_wechat_image_intent_receipt_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and current_setting(
      'app.wechat_image_receipt_retention_cleanup', true
    ) = 'true'
    and old.created_at <= statement_timestamp() - interval '30 days' then
    return old;
  end if;
  raise exception 'wechat_product_image_intent_receipts is append-only'
    using errcode = '55000';
end;
$$;

revoke all on function
  app_private.prevent_wechat_image_intent_receipt_mutation_v1()
  from public, anon, authenticated, service_role;

create trigger wechat_product_image_intent_receipts_no_update_delete
before update or delete
on app_private.wechat_product_image_intent_receipts
for each row execute function
  app_private.prevent_wechat_image_intent_receipt_mutation_v1();

create or replace function app_private.cleanup_wechat_image_intent_receipts_v1(
  p_limit integer default 100
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
  v_previous text;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'wechat_image_receipt_cleanup_invalid'
      using errcode = '22023';
  end if;
  if not pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
    'wechat-image-receipt-retention-v1', 0
  )) then
    return 0;
  end if;
  v_previous := current_setting(
    'app.wechat_image_receipt_retention_cleanup', true
  );
  perform set_config(
    'app.wechat_image_receipt_retention_cleanup', 'true', true
  );
  delete from app_private.wechat_product_image_intent_receipts receipt
  where receipt.receipt_id in (
    select candidate.receipt_id
    from app_private.wechat_product_image_intent_receipts candidate
    where candidate.created_at <= statement_timestamp() - interval '30 days'
    order by candidate.created_at, candidate.receipt_id
    limit p_limit
    for update skip locked
  );
  get diagnostics v_deleted = row_count;
  perform set_config(
    'app.wechat_image_receipt_retention_cleanup',
    coalesce(v_previous, ''), true
  );
  return v_deleted;
end;
$$;

revoke all on function
  app_private.cleanup_wechat_image_intent_receipts_v1(integer)
  from public, anon, authenticated, service_role;

create or replace function app_private.wechat_image_intent_actor_is_authorized_v1(
  p_actor_profile_id uuid,
  p_shop_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_actor_profile_id is null
    or p_shop_id is null then
    return false;
  end if;

  perform 1
  from public.profiles profile
  join public.shop_members member
    on member.profile_id = profile.profile_id
  join public.shops shop
    on shop.shop_id = member.shop_id
  where profile.profile_id = p_actor_profile_id
    and profile.profile_status = 'active'
    and member.shop_id = p_shop_id
    and member.membership_status = 'active'
    and member.role_key in ('shop_owner', 'shop_manager')
    and shop.shop_status = 'active'
  for update of profile, member, shop;

  return found;
end;
$$;

revoke all on function
  app_private.wechat_image_intent_actor_is_authorized_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function app_private.wechat_image_intent_attempt_admit_v1(
  p_actor_profile_id uuid,
  p_shop_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_count integer := 0;
  v_actor_started_at timestamptz;
  v_shop_count integer := 0;
  v_shop_started_at timestamptz;
begin
  if p_actor_profile_id is null or p_shop_id is null then return false; end if;

  -- This is also the lock order used by the legacy compatibility wrapper.
  -- It serializes admissions across distinct products before product lookup.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'product-image-intent:shop:' || p_shop_id::text, 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'product-image-intent:actor:' || p_actor_profile_id::text, 0
  ));

  select rate.window_started_at, rate.admitted_count
    into v_actor_started_at, v_actor_count
  from app_private.wechat_product_image_intent_actor_rate_limits rate
  where rate.actor_profile_id = p_actor_profile_id;
  if not found or v_actor_started_at <= v_now - interval '15 minutes' then
    v_actor_count := 0;
  end if;

  select rate.window_started_at, rate.admitted_count
    into v_shop_started_at, v_shop_count
  from app_private.wechat_product_image_intent_shop_rate_limits rate
  where rate.shop_id = p_shop_id;
  if not found or v_shop_started_at <= v_now - interval '1 hour' then
    v_shop_count := 0;
  end if;

  if v_actor_count >= 20 or v_shop_count >= 100 then return false; end if;

  insert into app_private.wechat_product_image_intent_actor_rate_limits as rate (
    actor_profile_id, window_started_at, admitted_count, updated_at
  ) values (
    p_actor_profile_id, v_now, 1, v_now
  )
  on conflict (actor_profile_id) do update set
    window_started_at = case
      when rate.window_started_at <= v_now - interval '15 minutes'
        then v_now else rate.window_started_at end,
    admitted_count = case
      when rate.window_started_at <= v_now - interval '15 minutes'
        then 1 else rate.admitted_count + 1 end,
    updated_at = v_now;

  insert into app_private.wechat_product_image_intent_shop_rate_limits as rate (
    shop_id, window_started_at, admitted_count, updated_at
  ) values (
    p_shop_id, v_now, 1, v_now
  )
  on conflict (shop_id) do update set
    window_started_at = case
      when rate.window_started_at <= v_now - interval '1 hour'
        then v_now else rate.window_started_at end,
    admitted_count = case
      when rate.window_started_at <= v_now - interval '1 hour'
        then 1 else rate.admitted_count + 1 end,
    updated_at = v_now;

  return true;
end;
$$;

revoke all on function
  app_private.wechat_image_intent_attempt_admit_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function app_private.product_image_denial_audit_admit_v1(
  p_actor_profile_id uuid,
  p_shop_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'product-image-denial-audit:' || p_shop_id::text || ':'
      || p_actor_profile_id::text,
    0
  ));

  insert into app_private.product_image_denial_audit_rate_limits as rate (
    shop_id, actor_profile_id, window_started_at, admitted_count, updated_at
  ) values (
    p_shop_id, p_actor_profile_id, clock_timestamp(), 1, clock_timestamp()
  )
  on conflict (shop_id, actor_profile_id) do update set
    window_started_at = case
      when rate.window_started_at <= clock_timestamp() - interval '5 minutes'
        then clock_timestamp() else rate.window_started_at end,
    admitted_count = case
      when rate.window_started_at <= clock_timestamp() - interval '5 minutes'
        then 1 else rate.admitted_count + 1 end,
    updated_at = clock_timestamp()
  where rate.window_started_at <= clock_timestamp() - interval '5 minutes'
     or rate.admitted_count < 60;

  return found;
end;
$$;

revoke all on function
  app_private.product_image_denial_audit_admit_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

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
set search_path = ''
as $$
declare
  v_operation text := lower(coalesce(p_operation, 'request'));
  v_code text := lower(coalesce(p_code, 'permission_denied'));
  v_audit_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;
  if not exists (
    select 1 from public.shops shop where shop.shop_id = p_shop_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if not app_private.product_image_actor_can_read(
    p_actor_profile_id, p_shop_id, p_actor_kind
  ) then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;
  if not app_private.product_image_product_is_in_shop(
    p_product_id, p_shop_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_operation not in ('intent', 'finalize', 'read', 'remove', 'request') then
    v_operation := 'request';
  end if;
  if v_code !~ '^[a-z0-9_]{1,64}$' then v_code := 'permission_denied'; end if;

  if app_private.product_image_denial_audit_admit_v1(
    p_actor_profile_id, p_shop_id
  ) then
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
  end if;

  -- Audit suppression is deliberately indistinguishable from recording at
  -- the HTTP boundary; authorization remains denied by the caller either way.
  return jsonb_build_object('ok', true, 'code', 'denied_recorded')
    || case when v_audit_id is null then '{}'::jsonb
      else jsonb_build_object('audit_event_id', v_audit_id) end;
end;
$$;

revoke all on function public.product_image_record_denied(
  uuid, text, uuid, uuid, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.product_image_record_denied(
  uuid, text, uuid, uuid, text, text
) to service_role;

-- Preserve the legacy remove contract while routing every denied audit through
-- the same bounded admission used by the server-side denial recorder.
alter function public.product_image_remove(
  uuid, text, uuid, uuid, uuid
) rename to product_image_remove_unbounded_audit_legacy_v1;
alter function public.product_image_remove_unbounded_audit_legacy_v1(
  uuid, text, uuid, uuid, uuid
) set schema app_private;
revoke all on function
  app_private.product_image_remove_unbounded_audit_legacy_v1(
    uuid, text, uuid, uuid, uuid
  ) from public, anon, authenticated, service_role;

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
set search_path = ''
as $$
declare
  v_product public.inventory_products%rowtype;
  v_version public.inventory_product_image_versions%rowtype;
  v_changed_at timestamptz := now();
  v_audit_id uuid;
  v_sync_event_id bigint;
  v_previous_restore_allowed text;
  v_published_version_id uuid;
  v_row_count integer;
begin
  if not app_private.product_image_actor_can_write(
    p_actor_profile_id, p_shop_id, p_actor_kind
  ) then
    if exists (select 1 from public.shops where shop_id = p_shop_id)
      and app_private.product_image_denial_audit_admit_v1(
        p_actor_profile_id, p_shop_id
      ) then
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
    and app_private.product_image_product_is_in_shop_for_cleanup_v1(
      product.id, p_shop_id
    )
  for update;
  if v_product.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_product.primary_image_version_id is null then
    return jsonb_build_object(
      'ok', true, 'code', 'already_removed', 'status', 'already_removed'
    );
  end if;
  if p_expected_version_id is null
    or v_product.primary_image_version_id <> p_expected_version_id then
    if app_private.product_image_denial_audit_admit_v1(
      p_actor_profile_id, p_shop_id
    ) then
      perform app_private.write_product_image_audit(
        p_actor_profile_id, p_shop_id, 'shop.product_image.remove_denied',
        'warning', 'blocked', p_product_id, p_expected_version_id,
        'stale_conflict', p_actor_kind
      );
    end if;
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
    return jsonb_build_object(
      'ok', false, 'code', 'invalid_state_or_not_found'
    );
  end if;

  update public.inventory_product_image_versions
  set status = 'removed', removed_at = v_changed_at,
      cleanup_status = 'pending', cleanup_updated_at = v_changed_at
  where id = p_expected_version_id;

  v_previous_restore_allowed := current_setting(
    'app.catalog_restore_allowed', true
  );
  perform set_config('app.catalog_restore_allowed', 'true', true);
  update public.inventory_products
  set primary_image_version_id = null,
      primary_image_updated_at = v_changed_at,
      updated_at = v_changed_at
  where id = p_product_id
    and primary_image_version_id = p_expected_version_id
  returning primary_image_version_id into v_published_version_id;
  get diagnostics v_row_count = row_count;
  perform set_config(
    'app.catalog_restore_allowed',
    coalesce(v_previous_restore_allowed, ''),
    true
  );
  if v_row_count <> 1 or v_published_version_id is not null then
    raise exception 'product_image_remove_publish_failed'
      using errcode = '55000';
  end if;

  v_sync_event_id := app_private.emit_product_image_sync_event(
    p_shop_id, p_product_id, p_expected_version_id,
    'image_remove', p_actor_kind
  );
  v_audit_id := app_private.write_product_image_audit(
    p_actor_profile_id, p_shop_id, 'shop.product_image.removed',
    'info', 'success', p_product_id, p_expected_version_id, 'removed',
    p_actor_kind, jsonb_build_object('sync_event_id', v_sync_event_id)
  );
  return jsonb_build_object(
    'ok', true, 'code', 'removed', 'status', 'removed',
    'version_id', p_expected_version_id,
    'main_path', v_version.main_path, 'thumb_path', v_version.thumb_path,
    'image_updated_at', v_changed_at, 'audit_event_id', v_audit_id
  );
end;
$$;

revoke all on function public.product_image_remove(
  uuid, text, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.product_image_remove(
  uuid, text, uuid, uuid, uuid
) to service_role;

-- Preserve the reviewed legacy implementation without leaving an alternate
-- executable path that could bypass the shared admission locks.
alter function public.product_image_create_intent(
  uuid, text, uuid, uuid, text, integer, integer, integer,
  text, integer, integer, integer
) rename to product_image_create_intent_unlocked_legacy_v1;

alter function public.product_image_create_intent_unlocked_legacy_v1(
  uuid, text, uuid, uuid, text, integer, integer, integer,
  text, integer, integer, integer
) set schema app_private;

revoke all on function app_private.product_image_create_intent_unlocked_legacy_v1(
  uuid, text, uuid, uuid, text, integer, integer, integer,
  text, integer, integer, integer
) from public, anon, authenticated, service_role;

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
volatile
security definer
set search_path = ''
as $$
begin
  -- One lock order for all callers prevents distinct-product requests from
  -- racing either the 100/shop/hour or 20/actor/15-minute sliding count.
  if p_shop_id is not null then
    perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'product-image-intent:shop:' || p_shop_id::text,
      0
    ));
  end if;
  if p_actor_profile_id is not null then
    perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'product-image-intent:actor:' || p_actor_profile_id::text,
      0
    ));
  end if;

  return app_private.product_image_create_intent_unlocked_legacy_v1(
    p_actor_profile_id,
    p_actor_kind,
    p_shop_id,
    p_product_id,
    p_main_sha256,
    p_main_bytes,
    p_main_width,
    p_main_height,
    p_thumb_sha256,
    p_thumb_bytes,
    p_thumb_width,
    p_thumb_height
  );
end;
$$;

revoke all on function public.product_image_create_intent(
  uuid, text, uuid, uuid, text, integer, integer, integer,
  text, integer, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.product_image_create_intent(
  uuid, text, uuid, uuid, text, integer, integer, integer,
  text, integer, integer, integer
) to service_role;

create or replace function public.product_image_create_intent_wechat_v1(
  p_actor_profile_id uuid,
  p_shop_id uuid,
  p_product_id uuid,
  p_main_sha256 text,
  p_main_bytes integer,
  p_main_width integer,
  p_main_height integer,
  p_thumb_sha256 text,
  p_thumb_bytes integer,
  p_thumb_width integer,
  p_thumb_height integer,
  p_idempotency_key uuid,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_existing app_private.wechat_product_image_intent_receipts%rowtype;
  v_request_hash text;
  v_result jsonb;
  v_code text;
  v_admitted boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'wechat_service_role_required';
  end if;

  if p_actor_profile_id is null
    or p_shop_id is null
    or p_product_id is null
    or p_idempotency_key is null
    or p_correlation_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'permission_denied',
      'correlation_id', p_correlation_id,
      'replayed', false
    );
  end if;

  if not app_private.wechat_image_intent_actor_is_authorized_v1(
    p_actor_profile_id, p_shop_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'permission_denied',
      'correlation_id', p_correlation_id,
      'replayed', false
    );
  end if;

  v_request_hash := encode(extensions.digest(
    convert_to(jsonb_build_object(
      'actor_profile_id', p_actor_profile_id,
      'shop_id', p_shop_id,
      'product_id', p_product_id,
      'main_sha256', p_main_sha256,
      'main_bytes', p_main_bytes,
      'main_width', p_main_width,
      'main_height', p_main_height,
      'thumb_sha256', p_thumb_sha256,
      'thumb_bytes', p_thumb_bytes,
      'thumb_width', p_thumb_width,
      'thumb_height', p_thumb_height,
      'correlation_id', p_correlation_id
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'wechat-product-image-intent:' || p_shop_id::text || ':'
      || p_actor_profile_id::text || ':' || p_idempotency_key::text,
    0
  ));

  -- Preserve a thirty-day retry horizon while bounding long-lived receipt
  -- storage. The cleanup path is private, serialized and can delete only rows
  -- that the append-only trigger independently recognizes as expired.
  perform app_private.cleanup_wechat_image_intent_receipts_v1(100);

  select receipt.* into v_existing
  from app_private.wechat_product_image_intent_receipts receipt
  where receipt.shop_id = p_shop_id
    and receipt.actor_profile_id = p_actor_profile_id
    and receipt.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.request_hash = v_request_hash then
      if not app_private.wechat_image_intent_actor_is_authorized_v1(
        p_actor_profile_id, p_shop_id
      ) then
        return jsonb_build_object(
          'ok', false,
          'code', 'permission_denied',
          'correlation_id', p_correlation_id,
          'replayed', false
        );
      end if;
      if v_existing.result->>'code' = 'upload_required'
        and (
          coalesce(v_existing.result->>'version_id', '') !~*
            '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or not exists (
            select 1
            from public.inventory_product_image_versions version
            where version.id = (v_existing.result->>'version_id')::uuid
              and version.shop_id = p_shop_id
              and version.product_id = p_product_id
              and version.status = 'pending'
              and version.expires_at > statement_timestamp()
          )
        ) then
        return jsonb_build_object(
          'ok', false,
          'code', 'invalid_state',
          'correlation_id', p_correlation_id,
          'replayed', false
        );
      end if;
      return v_existing.result || jsonb_build_object('replayed', true);
    end if;

    v_admitted := app_private.wechat_image_intent_attempt_admit_v1(
      p_actor_profile_id, p_shop_id
    );
    if v_admitted then
      perform app_private.write_product_image_audit(
        p_actor_profile_id,
        p_shop_id,
        'shop.product_image.intent_idempotency_conflict',
        'warning',
        'blocked',
        p_product_id,
        null,
        'idempotency_conflict',
        'personal_account',
        jsonb_build_object('correlation_id', p_correlation_id)
      );
    end if;
    return jsonb_build_object(
      'ok', false,
      'code', 'idempotency_conflict',
      'correlation_id', p_correlation_id,
      'replayed', false
    );
  end if;

  -- Every fresh request, including invalid and unknown-product requests, must
  -- win bounded actor and shop admission before the legacy product lookup can
  -- audit or allocate durable state. Exact successful replay skips this step.
  v_admitted := app_private.wechat_image_intent_attempt_admit_v1(
    p_actor_profile_id, p_shop_id
  );
  if not v_admitted then
    if not app_private.wechat_image_intent_actor_is_authorized_v1(
      p_actor_profile_id, p_shop_id
    ) then
      return jsonb_build_object(
        'ok', false,
        'code', 'permission_denied',
        'correlation_id', p_correlation_id,
        'replayed', false
      );
    end if;
    return jsonb_build_object(
      'ok', false,
      'code', 'rate_limited',
      'correlation_id', p_correlation_id,
      'replayed', false
    );
  end if;

  v_result := app_private.product_image_create_intent_unlocked_legacy_v1(
    p_actor_profile_id,
    'personal_account',
    p_shop_id,
    p_product_id,
    p_main_sha256,
    p_main_bytes,
    p_main_width,
    p_main_height,
    p_thumb_sha256,
    p_thumb_bytes,
    p_thumb_width,
    p_thumb_height
  );
  v_code := coalesce(nullif(v_result->>'code', ''), 'backend_unavailable');
  v_result := v_result || jsonb_build_object(
    'correlation_id', p_correlation_id,
    'replayed', false
  );

  -- Permission and rate denials can change after revocation/window expiry, and
  -- infrastructure failures must remain retryable with the same key.
  if coalesce((v_result->>'ok')::boolean, false)
    and v_code in ('checksum_noop', 'upload_required') then
    if not app_private.wechat_image_intent_actor_is_authorized_v1(
      p_actor_profile_id, p_shop_id
    ) then
      raise exception 'image intent authorization lease lost'
        using errcode = '40001';
    end if;

    insert into app_private.wechat_product_image_intent_receipts (
      shop_id,
      actor_profile_id,
      idempotency_key,
      correlation_id,
      product_id,
      request_hash,
      result
    ) values (
      p_shop_id,
      p_actor_profile_id,
      p_idempotency_key,
      p_correlation_id,
      p_product_id,
      v_request_hash,
      v_result
    );
  else
    if not app_private.wechat_image_intent_actor_is_authorized_v1(
      p_actor_profile_id, p_shop_id
    ) then
      return jsonb_build_object(
        'ok', false,
        'code', 'permission_denied',
        'correlation_id', p_correlation_id,
        'replayed', false
      );
    end if;
  end if;

  return v_result;
end;
$$;

revoke all on function public.product_image_create_intent_wechat_v1(
  uuid, uuid, uuid, text, integer, integer, integer,
  text, integer, integer, integer, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.product_image_create_intent_wechat_v1(
  uuid, uuid, uuid, text, integer, integer, integer,
  text, integer, integer, integer, uuid, uuid
) to service_role;

comment on function public.product_image_create_intent_wechat_v1(
  uuid, uuid, uuid, text, integer, integer, integer,
  text, integer, integer, integer, uuid, uuid
) is 'WECHAT-003 service-only personal image-intent RPC with durable replay and correlation binding.';

notify pgrst, 'reload schema';

commit;
