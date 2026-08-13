-- WECHAT-003: bounded, versioned and idempotent personal-account catalog writes.
--
-- Catalog tables remain the canonical cross-platform state.  This migration
-- deliberately does not emit sync_events directly: the reviewed statement
-- triggers installed by CROSS-PLATFORM SYNC EVENT COMPLETENESS remain the only
-- catalog/prices sync lane.

begin;

create table app_private.wechat_catalog_mutation_receipts (
  receipt_id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  actor_profile_id uuid not null,
  idempotency_key uuid not null,
  operation text not null,
  request_hash text not null,
  correlation_id uuid not null,
  target_id uuid,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint wechat_catalog_receipts_operation_check check (
    operation in (
      'product_create', 'product_update', 'product_archive',
      'product_restore', 'product_price_update',
      'category_create', 'category_update', 'category_archive',
      'category_restore', 'supplier_create', 'supplier_update',
      'supplier_archive', 'supplier_restore'
    )
  ),
  constraint wechat_catalog_receipts_hash_check check (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint wechat_catalog_receipts_result_check check (
    jsonb_typeof(result) = 'object' and pg_column_size(result) <= 32768
  ),
  constraint wechat_catalog_receipts_actor_key_unique unique (
    shop_id, actor_profile_id, idempotency_key
  )
);

alter table app_private.wechat_catalog_mutation_receipts
  enable row level security;
alter table app_private.wechat_catalog_mutation_receipts
  force row level security;
revoke all on table app_private.wechat_catalog_mutation_receipts
  from public, anon, authenticated, service_role;

create index wechat_catalog_receipts_actor_created_idx
  on app_private.wechat_catalog_mutation_receipts (
    shop_id, actor_profile_id, created_at desc
  );

create index wechat_catalog_receipts_retention_idx
  on app_private.wechat_catalog_mutation_receipts (created_at, receipt_id);

create table app_private.wechat_catalog_actor_rate_limits (
  shop_id uuid not null,
  actor_profile_id uuid not null,
  window_started_at timestamptz not null,
  admitted_count integer not null,
  updated_at timestamptz not null,
  primary key (shop_id, actor_profile_id),
  constraint wechat_catalog_actor_rate_shape_check check (
    pg_catalog.isfinite(window_started_at)
    and pg_catalog.isfinite(updated_at)
    and admitted_count between 1 and 60
  )
);

alter table app_private.wechat_catalog_actor_rate_limits
  enable row level security;
alter table app_private.wechat_catalog_actor_rate_limits
  force row level security;
revoke all on table app_private.wechat_catalog_actor_rate_limits
  from public, anon, authenticated, service_role;

create table app_private.wechat_catalog_shop_rate_limits (
  shop_id uuid primary key,
  window_started_at timestamptz not null,
  admitted_count integer not null,
  updated_at timestamptz not null,
  constraint wechat_catalog_shop_rate_shape_check check (
    pg_catalog.isfinite(window_started_at)
    and pg_catalog.isfinite(updated_at)
    and admitted_count between 1 and 600
  )
);

alter table app_private.wechat_catalog_shop_rate_limits
  enable row level security;
alter table app_private.wechat_catalog_shop_rate_limits
  force row level security;
revoke all on table app_private.wechat_catalog_shop_rate_limits
  from public, anon, authenticated, service_role;

create table app_private.wechat_catalog_denial_audit_rate_limits (
  shop_id uuid not null,
  actor_profile_id uuid not null,
  window_started_at timestamptz not null,
  admitted_count integer not null,
  updated_at timestamptz not null,
  primary key (shop_id, actor_profile_id),
  constraint wechat_catalog_denial_audit_rate_shape_check check (
    pg_catalog.isfinite(window_started_at)
    and pg_catalog.isfinite(updated_at)
    and admitted_count between 1 and 60
  )
);

alter table app_private.wechat_catalog_denial_audit_rate_limits
  enable row level security;
alter table app_private.wechat_catalog_denial_audit_rate_limits
  force row level security;
revoke all on table app_private.wechat_catalog_denial_audit_rate_limits
  from public, anon, authenticated, service_role;

create or replace function app_private.prevent_wechat_catalog_receipt_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and current_setting(
      'app.wechat_catalog_receipt_retention_cleanup', true
    ) = 'true'
    and old.created_at <= statement_timestamp() - interval '30 days' then
    return old;
  end if;
  raise exception 'wechat_catalog_mutation_receipts is append-only'
    using errcode = '55000';
end;
$$;

revoke all on function
  app_private.prevent_wechat_catalog_receipt_mutation_v1()
  from public, anon, authenticated, service_role;

create trigger wechat_catalog_receipts_no_update_delete
before update or delete on app_private.wechat_catalog_mutation_receipts
for each row execute function
  app_private.prevent_wechat_catalog_receipt_mutation_v1();

create or replace function app_private.cleanup_wechat_catalog_receipts_v1(
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
    raise exception 'wechat_catalog_receipt_cleanup_invalid'
      using errcode = '22023';
  end if;
  if not pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
    'wechat-catalog-receipt-retention-v1', 0
  )) then
    return 0;
  end if;
  v_previous := current_setting(
    'app.wechat_catalog_receipt_retention_cleanup', true
  );
  perform set_config(
    'app.wechat_catalog_receipt_retention_cleanup', 'true', true
  );
  delete from app_private.wechat_catalog_mutation_receipts receipt
  where receipt.receipt_id in (
    select candidate.receipt_id
    from app_private.wechat_catalog_mutation_receipts candidate
    where candidate.created_at <= statement_timestamp() - interval '30 days'
    order by candidate.created_at, candidate.receipt_id
    limit p_limit
    for update skip locked
  );
  get diagnostics v_deleted = row_count;
  perform set_config(
    'app.wechat_catalog_receipt_retention_cleanup',
    coalesce(v_previous, ''), true
  );
  return v_deleted;
end;
$$;

revoke all on function app_private.cleanup_wechat_catalog_receipts_v1(integer)
  from public, anon, authenticated, service_role;

create or replace function app_private.wechat_catalog_payload_is_valid_v1(
  p_operation text,
  p_payload jsonb
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_allowed_keys text[];
  v_key text;
  v_value jsonb;
  v_number numeric;
  v_key_count integer;
  v_uuid_pattern constant text :=
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
begin
  if p_payload is not null and jsonb_typeof(p_payload) = 'object' then
    select count(*)::integer into v_key_count
    from jsonb_object_keys(p_payload);
  end if;

  if p_operation is null
    or p_operation not in (
      'product_create', 'product_update', 'product_archive',
      'product_restore', 'product_price_update',
      'category_create', 'category_update', 'category_archive',
      'category_restore', 'supplier_create', 'supplier_update',
      'supplier_archive', 'supplier_restore'
    )
    or p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
    or pg_column_size(p_payload) > 16384
    or coalesce(v_key_count, 0) > 12 then
    return false;
  end if;

  v_allowed_keys := case
    when p_operation = 'product_create' then array[
      'barcode', 'itemNumber', 'productName', 'secondProductName',
      'purchasePrice', 'retailPrice', 'stockQuantity',
      'supplierId', 'categoryId'
    ]
    when p_operation = 'product_update' then array[
      'barcode', 'itemNumber', 'productName', 'secondProductName',
      'stockQuantity', 'supplierId', 'categoryId'
    ]
    when p_operation = 'product_price_update' then
      array['priceType', 'price']
    when p_operation in ('category_create', 'category_update',
                         'supplier_create', 'supplier_update') then
      array['name']
    when p_operation in ('category_archive', 'supplier_archive') then
      array['reason', 'replacementId']
    else array['reason']
  end;

  for v_key, v_value in select entry.key, entry.value
    from jsonb_each(p_payload) entry
  loop
    if not v_key = any(v_allowed_keys) then
      return false;
    end if;

    if v_key in (
      'barcode', 'itemNumber', 'productName', 'secondProductName',
      'name', 'reason', 'priceType', 'supplierId',
      'categoryId', 'replacementId'
    ) and jsonb_typeof(v_value) not in ('string', 'null') then
      return false;
    end if;

    if v_key in ('purchasePrice', 'retailPrice', 'stockQuantity', 'price')
      and jsonb_typeof(v_value) not in ('number', 'null') then
      return false;
    end if;

    if jsonb_typeof(v_value) = 'string' then
      if octet_length(v_value #>> '{}') > (case
          when v_key = 'barcode' then 384
          when v_key in ('itemNumber', 'name', 'reason') then 640
          when v_key in ('productName', 'secondProductName') then 1024
          else 80
        end)
        or (v_value #>> '{}') ~ '[[:cntrl:]]' then
        return false;
      end if;

      if v_key = 'name' then
        perform app_private.catalog_display_text_v1(
          v_value #>> '{}', 160, true
        );
      elsif v_key = 'barcode' then
        perform app_private.catalog_identity_text_v1(
          v_value #>> '{}', 96, true
        );
      elsif v_key = 'itemNumber' then
        perform app_private.catalog_identity_text_v1(
          v_value #>> '{}', 120, false
        );
      elsif v_key in ('productName', 'secondProductName') then
        perform app_private.catalog_display_text_v1(
          v_value #>> '{}', 240,
          p_operation = 'product_create' and v_key = 'productName'
        );
      end if;
    end if;

    if v_key in ('supplierId', 'categoryId', 'replacementId')
      and jsonb_typeof(v_value) = 'string'
      and (v_value #>> '{}') !~* v_uuid_pattern then
      return false;
    end if;

    if v_key in ('purchasePrice', 'retailPrice', 'stockQuantity')
      and jsonb_typeof(v_value) = 'number' then
      v_number := (v_value #>> '{}')::numeric;
      if v_number::text in ('NaN', 'Infinity', '-Infinity')
        or v_number < 0
        or (v_key in ('purchasePrice', 'retailPrice')
          and v_number > 999999999999.999)
        or (v_key = 'stockQuantity' and v_number > 1000000000000)
        or (v_key in ('purchasePrice', 'retailPrice')
          and scale(v_number) > 3) then
        return false;
      end if;
    end if;
  end loop;

  if p_operation = 'product_create' then
    if jsonb_typeof(p_payload->'barcode') is distinct from 'string'
      or jsonb_typeof(p_payload->'productName') is distinct from 'string'
      or length(p_payload->>'barcode') = 0
      or length(p_payload->>'productName') = 0 then
      return false;
    end if;
  elsif p_operation = 'product_update' then
    if v_key_count = 0 then return false; end if;
  elsif p_operation = 'product_price_update' then
    if jsonb_typeof(p_payload->'priceType') is distinct from 'string'
      or upper(p_payload->>'priceType') not in ('PURCHASE', 'RETAIL')
      or jsonb_typeof(p_payload->'price') is distinct from 'number' then
      return false;
    end if;
    v_number := (p_payload->>'price')::numeric;
    if v_number::text in ('NaN', 'Infinity', '-Infinity')
      or v_number < 0
      or v_number > 999999999999.999
      or scale(v_number) > 3 then
      return false;
    end if;
  elsif p_operation in (
      'category_create', 'category_update',
      'supplier_create', 'supplier_update'
    ) then
    if jsonb_typeof(p_payload->'name') is distinct from 'string'
      or length(p_payload->>'name') = 0 then
      return false;
    end if;
  end if;

  return true;
exception when others then
  return false;
end;
$$;

revoke all on function
  app_private.wechat_catalog_payload_is_valid_v1(text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function app_private.wechat_catalog_denial_audit_admit_v1(
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
  -- Only a current member of this exact active shop may consume denial-audit
  -- capacity. Outsiders and platform-only accounts cannot inject shop audit.
  if not exists (
    select 1
    from public.profiles profile
    join public.shop_members member
      on member.profile_id = profile.profile_id
     and member.shop_id = p_shop_id
    join public.shops shop on shop.shop_id = member.shop_id
    where profile.profile_id = p_actor_profile_id
      and profile.profile_status = 'active'
      and member.membership_status = 'active'
      and member.role_key in ('shop_owner', 'shop_manager', 'viewer')
      and shop.shop_status = 'active'
  ) then
    return false;
  end if;

  insert into app_private.wechat_catalog_denial_audit_rate_limits as rate (
    shop_id, actor_profile_id, window_started_at, admitted_count, updated_at
  ) values (
    p_shop_id, p_actor_profile_id, clock_timestamp(), 1, clock_timestamp()
  )
  on conflict (shop_id, actor_profile_id) do update set
    window_started_at = case
      when rate.window_started_at <= clock_timestamp() - interval '5 minutes'
        then clock_timestamp()
      else rate.window_started_at
    end,
    admitted_count = case
      when rate.window_started_at <= clock_timestamp() - interval '5 minutes'
        then 1
      else rate.admitted_count + 1
    end,
    updated_at = clock_timestamp()
  where rate.window_started_at <= clock_timestamp() - interval '5 minutes'
     or rate.admitted_count < 60;

  return found;
end;
$$;

revoke all on function
  app_private.wechat_catalog_denial_audit_admit_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function app_private.write_wechat_catalog_audit_v1(
  p_actor_profile_id uuid,
  p_shop_id uuid,
  p_event_key text,
  p_result text,
  p_target_type text,
  p_target_id uuid,
  p_code text,
  p_correlation_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_audit_id uuid;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if jsonb_typeof(v_metadata) <> 'object' then
    v_metadata := '{}'::jsonb;
  end if;

  if p_result <> 'success'
    and not app_private.wechat_catalog_denial_audit_admit_v1(
      p_actor_profile_id, p_shop_id
    ) then
    return null;
  end if;

  -- Only explicitly safe scalar metadata is accepted. Request payloads, names,
  -- free-form notes, identifiers and credentials never enter this projection.
  v_metadata := jsonb_strip_nulls(jsonb_build_object(
    'code', left(coalesce(p_code, 'unknown'), 64),
    'correlation_id', p_correlation_id,
    'operation', left(coalesce(v_metadata->>'operation', 'unknown'), 64),
    'source', 'mini_program',
    'changed_field', nullif(left(v_metadata->>'changed_field', 40), ''),
    'price_type', case when v_metadata->>'price_type' in ('PURCHASE', 'RETAIL')
      then v_metadata->>'price_type' end,
    'reassigned_count', case
      when coalesce(v_metadata->>'reassigned_count', '') ~ '^[0-9]{1,10}$'
        then (v_metadata->>'reassigned_count')::integer end
  ));

  insert into public.audit_logs (
    actor_profile_id, scope, shop_id, event_key, severity, result,
    target_type, target_id, metadata_redacted
  ) values (
    p_actor_profile_id, 'shop', p_shop_id, left(p_event_key, 160),
    case when p_result = 'success' then 'info'
      when p_result = 'blocked' then 'warning' else 'critical' end,
    case when p_result in ('success', 'blocked', 'failure')
      then p_result else 'failure' end,
    nullif(left(p_target_type, 80), ''), p_target_id::text, v_metadata
  ) returning audit_log_id into v_audit_id;

  return v_audit_id;
end;
$$;

revoke all on function app_private.write_wechat_catalog_audit_v1(
  uuid, uuid, text, text, text, uuid, text, uuid, jsonb
) from public, anon, authenticated, service_role;

create or replace function app_private.wechat_catalog_result_v1(
  p_ok boolean,
  p_code text,
  p_shop_id uuid,
  p_target_id uuid,
  p_updated_at timestamptz,
  p_correlation_id uuid,
  p_replayed boolean default false,
  p_payload jsonb default '{}'::jsonb,
  p_audit_event_id uuid default null,
  p_retry_after_seconds integer default null
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', coalesce(p_ok, false),
    'code', left(coalesce(nullif(p_code, ''), 'retryable_error'), 64),
    'shop_id', p_shop_id,
    'target_id', p_target_id,
    'updated_at', p_updated_at,
    'correlation_id', p_correlation_id,
    'replayed', coalesce(p_replayed, false),
    'payload', case when jsonb_typeof(p_payload) = 'object'
      then p_payload else '{}'::jsonb end
  ) || case when p_audit_event_id is null then '{}'::jsonb
    else jsonb_build_object('audit_event_id', p_audit_event_id) end
    || case when p_retry_after_seconds is null then '{}'::jsonb
    else jsonb_build_object(
      'retry_after_seconds', greatest(1, p_retry_after_seconds)
    ) end;
$$;

revoke all on function app_private.wechat_catalog_result_v1(
  boolean, text, uuid, uuid, timestamptz, uuid, boolean, jsonb, uuid, integer
) from public, anon, authenticated, service_role;

create or replace function app_private.wechat_catalog_authorization_code_v1(
  p_actor_profile_id uuid,
  p_shop_id uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile_status text;
  v_shop_status text;
  v_membership_status text;
  v_role_key text;
begin
  if p_actor_profile_id is null then return 'unauthenticated'; end if;
  if p_shop_id is null then return 'validation_failed'; end if;

  select profile.profile_status into v_profile_status
  from public.profiles profile
  where profile.profile_id = p_actor_profile_id
  for update;
  if not found or v_profile_status <> 'active' then
    return 'profile_suspended';
  end if;

  select shop.shop_status into v_shop_status
  from public.shops shop
  where shop.shop_id = p_shop_id
  for update;
  if not found then return 'membership_missing'; end if;
  if v_shop_status <> 'active' then return 'shop_suspended'; end if;

  select member.membership_status, member.role_key
    into v_membership_status, v_role_key
  from public.shop_members member
  where member.profile_id = p_actor_profile_id
    and member.shop_id = p_shop_id
  for update;
  if not found or v_membership_status <> 'active' then
    return 'membership_missing';
  end if;
  if v_role_key not in ('shop_owner', 'shop_manager') then
    return 'permission_denied';
  end if;

  return 'success';
end;
$$;

revoke all on function app_private.wechat_catalog_authorization_code_v1(
  uuid, uuid
) from public, anon, authenticated, service_role;

drop function if exists public.wechat_catalog_mutate_v1(
  uuid, text, uuid, uuid, timestamptz, uuid, jsonb
);

create or replace function public.wechat_catalog_mutate_v1(
  p_actor_profile_id uuid,
  p_shop_id uuid,
  p_operation text,
  p_idempotency_key uuid,
  p_correlation_id uuid,
  p_expected_updated_at timestamptz,
  p_target_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_actor_id uuid := p_actor_profile_id;
  v_scope record;
  v_existing app_private.wechat_catalog_mutation_receipts%rowtype;
  v_product public.inventory_products%rowtype;
  v_category public.inventory_categories%rowtype;
  v_supplier public.inventory_suppliers%rowtype;
  v_request_hash text;
  v_result jsonb;
  v_payload_out jsonb := '{}'::jsonb;
  v_result_target_id uuid := p_target_id;
  v_updated_at timestamptz;
  v_audit_id uuid;
  v_code text := 'retryable_error';
  v_ok boolean := false;
  v_audit_result text := 'failure';
  v_entity_type text;
  v_history_operation text;
  v_event_key text;
  v_replacement_id uuid;
  v_reassigned_count integer := 0;
  v_price numeric;
  v_price_type text;
  v_price_id uuid;
  v_old_price double precision;
  v_effective_at text;
  v_previous_restore_allowed text;
  v_old_category_id uuid;
  v_old_supplier_id uuid;
  v_new_category_id uuid;
  v_new_supplier_id uuid;
  v_replacement_valid boolean;
  v_authorization_code text;
  v_constraint_name text;
  v_barcode text;
  v_item_number text;
  v_product_name text;
  v_second_product_name text;
  v_initial_price_count integer := 0;
  v_effective_base timestamp without time zone;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'wechat_service_role_required';
  end if;

  if v_actor_id is null then
    return app_private.wechat_catalog_result_v1(
      false, 'unauthenticated', p_shop_id, p_target_id, null,
      p_correlation_id
    );
  end if;

  if p_shop_id is null or p_idempotency_key is null
    or p_correlation_id is null
    or p_operation is null then
    return app_private.wechat_catalog_result_v1(
      false, 'validation_failed', p_shop_id, p_target_id, null,
      p_correlation_id
    );
  end if;

  -- UPDATE row locks make profile/shop/membership status and role a transaction
  -- lease. Platform-administrator state is deliberately never consulted.
  v_authorization_code :=
    app_private.wechat_catalog_authorization_code_v1(v_actor_id, p_shop_id);
  if v_authorization_code <> 'success' then
    -- Only an active member of this exact active shop may create a denial
    -- record. Outsiders, suspended principals and platform administrators
    -- without membership cannot use this boundary to inject cross-shop audit.
    if v_authorization_code = 'permission_denied' then
      v_audit_id := app_private.write_wechat_catalog_audit_v1(
        v_actor_id, p_shop_id,
        'shop.wechat.catalog.access.denied', 'blocked',
        null, null, 'permission_denied', p_correlation_id,
        jsonb_build_object('operation', 'permission_denied')
      );
    end if;
    return app_private.wechat_catalog_result_v1(
      false, v_authorization_code, p_shop_id, p_target_id, null,
      p_correlation_id, false, '{}'::jsonb, v_audit_id
    );
  end if;

  if app_private.wechat_catalog_payload_is_valid_v1(
      p_operation, p_payload
    ) is not true
    or (
      p_operation in ('product_create', 'category_create', 'supplier_create')
      and p_expected_updated_at is not null
    )
    or (
      p_operation not in ('product_create', 'category_create', 'supplier_create')
      and (
        p_target_id is null
        or p_expected_updated_at is null
        or not pg_catalog.isfinite(p_expected_updated_at)
      )
    ) then
    v_code := case when p_operation = 'product_price_update'
      then 'invalid_price' else 'validation_failed' end;
    v_audit_id := app_private.write_wechat_catalog_audit_v1(
      v_actor_id, p_shop_id,
      'shop.wechat.catalog.request.rejected', 'blocked',
      null, null, v_code, p_correlation_id,
      jsonb_build_object('operation', 'request_rejected')
    );
    return app_private.wechat_catalog_result_v1(
      false, v_code, p_shop_id, p_target_id, null, p_correlation_id,
      false, '{}'::jsonb, v_audit_id
    );
  end if;

  v_entity_type := case
    when p_operation like 'product_%' then 'product'
    when p_operation like 'category_%' then 'category'
    else 'supplier'
  end;
  v_history_operation := case p_operation
    when 'product_create' then 'created'
    when 'product_update' then 'updated'
    when 'product_archive' then 'archived'
    when 'product_restore' then 'restored'
    when 'product_price_update' then 'price_changed'
    when 'category_create' then 'created'
    when 'category_update' then 'updated'
    when 'category_archive' then 'archived'
    when 'category_restore' then 'restored'
    when 'supplier_create' then 'created'
    when 'supplier_update' then 'updated'
    when 'supplier_archive' then 'archived'
    when 'supplier_restore' then 'restored'
  end;
  v_event_key := 'shop.wechat.catalog.' || v_entity_type || '.' ||
    v_history_operation;

  v_request_hash := encode(extensions.digest(
    convert_to(jsonb_build_object(
      'operation', p_operation,
      'expected_updated_at', case when p_expected_updated_at is null then null
        else to_char(
          p_expected_updated_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        ) end,
      'correlation_id', p_correlation_id,
      'target_id', p_target_id,
      'payload', p_payload
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_shop_id::text || ':wechat-catalog:' || v_actor_id::text || ':' ||
      p_idempotency_key::text,
    0
  ));

  -- Keep the idempotency horizon durable for at least thirty days while
  -- opportunistically bounding shared receipt/index growth. The private
  -- cleanup function alone can open the trigger's narrow expired-row path.
  perform app_private.cleanup_wechat_catalog_receipts_v1(100);

  select receipt.* into v_existing
  from app_private.wechat_catalog_mutation_receipts receipt
  where receipt.shop_id = p_shop_id
    and receipt.actor_profile_id = v_actor_id
    and receipt.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.operation = p_operation
      and v_existing.request_hash = v_request_hash then
      v_authorization_code :=
        app_private.wechat_catalog_authorization_code_v1(
          v_actor_id, p_shop_id
        );
      if v_authorization_code <> 'success' then
        return app_private.wechat_catalog_result_v1(
          false, v_authorization_code, p_shop_id, p_target_id, null,
          p_correlation_id
        );
      end if;
      return v_existing.result || jsonb_build_object('replayed', true);
    end if;

    v_audit_id := app_private.write_wechat_catalog_audit_v1(
      v_actor_id, p_shop_id, v_event_key, 'blocked',
      v_entity_type, p_target_id,
      'idempotency_conflict', p_correlation_id,
      jsonb_build_object('operation', v_history_operation)
    );
    v_authorization_code :=
      app_private.wechat_catalog_authorization_code_v1(
        v_actor_id, p_shop_id
      );
    return app_private.wechat_catalog_result_v1(
      false,
      case when v_authorization_code = 'success'
        then 'idempotency_conflict' else v_authorization_code end,
      p_shop_id, p_target_id, null, p_correlation_id, false,
      '{}'::jsonb, v_audit_id
    );
  end if;

  insert into app_private.wechat_catalog_actor_rate_limits as rate (
    shop_id, actor_profile_id, window_started_at, admitted_count, updated_at
  ) values (
    p_shop_id, v_actor_id, clock_timestamp(), 1, clock_timestamp()
  )
  on conflict (shop_id, actor_profile_id) do update set
    window_started_at = case
      when rate.window_started_at <= clock_timestamp() - interval '5 minutes'
        then clock_timestamp()
      else rate.window_started_at
    end,
    admitted_count = case
      when rate.window_started_at <= clock_timestamp() - interval '5 minutes'
        then 1
      else rate.admitted_count + 1
    end,
    updated_at = clock_timestamp()
  where rate.window_started_at <= clock_timestamp() - interval '5 minutes'
     or rate.admitted_count < 60;

  if not found then
    v_audit_id := app_private.write_wechat_catalog_audit_v1(
      v_actor_id, p_shop_id, v_event_key, 'blocked',
      v_entity_type, p_target_id,
      'rate_limited', p_correlation_id,
      jsonb_build_object('operation', v_history_operation)
    );
    v_result := app_private.wechat_catalog_result_v1(
      false, 'rate_limited', p_shop_id, p_target_id, null,
      p_correlation_id, false, '{}'::jsonb, v_audit_id, 300
    );
    v_authorization_code :=
      app_private.wechat_catalog_authorization_code_v1(
        v_actor_id, p_shop_id
      );
    if v_authorization_code <> 'success' then
      return app_private.wechat_catalog_result_v1(
        false, v_authorization_code, p_shop_id, p_target_id, null,
        p_correlation_id
      );
    end if;
    return v_result;
  end if;

  insert into app_private.wechat_catalog_shop_rate_limits as rate (
    shop_id, window_started_at, admitted_count, updated_at
  ) values (
    p_shop_id, clock_timestamp(), 1, clock_timestamp()
  )
  on conflict (shop_id) do update set
    window_started_at = case
      when rate.window_started_at <= clock_timestamp() - interval '1 hour'
        then clock_timestamp()
      else rate.window_started_at
    end,
    admitted_count = case
      when rate.window_started_at <= clock_timestamp() - interval '1 hour'
        then 1
      else rate.admitted_count + 1
    end,
    updated_at = clock_timestamp()
  where rate.window_started_at <= clock_timestamp() - interval '1 hour'
     or rate.admitted_count < 600;

  if not found then
    v_audit_id := app_private.write_wechat_catalog_audit_v1(
      v_actor_id, p_shop_id, v_event_key, 'blocked',
      v_entity_type, p_target_id,
      'rate_limited', p_correlation_id,
      jsonb_build_object('operation', v_history_operation)
    );
    v_result := app_private.wechat_catalog_result_v1(
      false, 'rate_limited', p_shop_id, p_target_id, null,
      p_correlation_id, false, '{}'::jsonb, v_audit_id, 3600
    );
    v_authorization_code :=
      app_private.wechat_catalog_authorization_code_v1(
        v_actor_id, p_shop_id
      );
    if v_authorization_code <> 'success' then
      return app_private.wechat_catalog_result_v1(
        false, v_authorization_code, p_shop_id, p_target_id, null,
        p_correlation_id
      );
    end if;
    return v_result;
  end if;

  select * into v_scope
  from app_private.resolve_shop_catalog_scope_service_v1(p_shop_id);
  if v_scope.owner_user_id is null then
    v_code := 'conflict';
    v_audit_result := 'blocked';
  else
    begin
      if p_operation = 'product_create' then
        v_category.id := case
          when jsonb_typeof(p_payload->'categoryId') = 'string'
            then (p_payload->>'categoryId')::uuid end;
        v_supplier.id := case
          when jsonb_typeof(p_payload->'supplierId') = 'string'
            then (p_payload->>'supplierId')::uuid end;

        if v_category.id is not null then
          perform 1 from public.inventory_categories category
          where category.id = v_category.id
            and category.deleted_at is null
            and category.shop_id = p_shop_id
          for key share;
          v_replacement_valid := found;
        else
          v_replacement_valid := true;
        end if;
        if not v_replacement_valid then
          v_result := jsonb_build_object(
            'ok', false, 'code', 'invalid_category'
          );
        else
          if v_supplier.id is not null then
            perform 1 from public.inventory_suppliers supplier
            where supplier.id = v_supplier.id
              and supplier.deleted_at is null
              and supplier.shop_id = p_shop_id
            for key share;
            v_replacement_valid := found;
          else
            v_replacement_valid := true;
          end if;
          if not v_replacement_valid then
            v_result := jsonb_build_object(
              'ok', false, 'code', 'invalid_supplier'
            );
          else
            v_barcode := app_private.catalog_identity_text_v1(
              p_payload->>'barcode', 96, true
            );
            v_item_number := nullif(app_private.catalog_identity_text_v1(
              p_payload->>'itemNumber', 120, false
            ), '');
            v_product_name := nullif(app_private.catalog_display_text_v1(
              p_payload->>'productName', 240, true
            ), '');
            v_second_product_name := nullif(
              app_private.catalog_display_text_v1(
                p_payload->>'secondProductName', 240, false
              ), ''
            );

            insert into public.inventory_products (
              id, shop_id, owner_user_id, barcode, item_number, product_name,
              second_product_name, purchase_price, retail_price,
              stock_quantity, supplier_id, category_id, updated_at
            ) values (
              coalesce(p_target_id, gen_random_uuid()),
              p_shop_id, v_scope.owner_user_id, v_barcode, v_item_number,
              v_product_name, v_second_product_name,
              case when jsonb_typeof(p_payload->'purchasePrice') = 'number'
                then (p_payload->>'purchasePrice')::double precision end,
              case when jsonb_typeof(p_payload->'retailPrice') = 'number'
                then (p_payload->>'retailPrice')::double precision end,
              case when jsonb_typeof(p_payload->'stockQuantity') = 'number'
                then (p_payload->>'stockQuantity')::double precision end,
              v_supplier.id, v_category.id, statement_timestamp()
            ) returning id, updated_at
              into v_result_target_id, v_updated_at;

            v_effective_base := date_trunc(
              'second', clock_timestamp() at time zone 'UTC'
            );
            loop
              v_effective_at := to_char(
                v_effective_base, 'YYYY-MM-DD HH24:MI:SS'
              );
              exit when not exists (
                select 1 from public.inventory_product_prices price
                where price.owner_user_id = v_scope.owner_user_id
                  and price.product_id = v_result_target_id
                  and price.effective_at = v_effective_at
                  and price.type in ('PURCHASE', 'RETAIL')
              );
              v_effective_base := v_effective_base + interval '1 second';
            end loop;
            insert into public.inventory_product_prices (
              id, owner_user_id, shop_id, product_id, type, price,
              effective_at, source, note, created_at
            )
            select gen_random_uuid(), v_scope.owner_user_id, p_shop_id,
              v_result_target_id, initial_price.price_type,
              initial_price.price_value::double precision,
              v_effective_at, 'mini_program', null, v_effective_at
            from (values
              ('PURCHASE'::text, case
                when jsonb_typeof(p_payload->'purchasePrice') = 'number'
                  then (p_payload->>'purchasePrice')::numeric end),
              ('RETAIL'::text, case
                when jsonb_typeof(p_payload->'retailPrice') = 'number'
                  then (p_payload->>'retailPrice')::numeric end)
            ) initial_price(price_type, price_value)
            where initial_price.price_value is not null;
            get diagnostics v_initial_price_count = row_count;

            v_result := jsonb_build_object(
              'ok', true, 'code', 'success',
              'target_id', v_result_target_id,
              'payload', jsonb_build_object(
                'initial_price_history_count', v_initial_price_count
              )
            );
          end if;
        end if;

      elsif p_operation = 'product_update' then
        select product.* into v_product
        from public.inventory_products product
        where product.id = p_target_id
          and product.deleted_at is null
          and product.shop_id = p_shop_id
        for update;

        if not found then
          v_result := jsonb_build_object(
            'ok', false, 'code', 'entity_not_found'
          );
        elsif v_product.updated_at is distinct from p_expected_updated_at then
          v_result := jsonb_build_object(
            'ok', false, 'code', 'stale_version'
          );
        else
          v_old_category_id := v_product.category_id;
          v_old_supplier_id := v_product.supplier_id;
          v_new_category_id := case when p_payload ? 'categoryId'
            then (p_payload->>'categoryId')::uuid
            else v_product.category_id end;
          v_new_supplier_id := case when p_payload ? 'supplierId'
            then (p_payload->>'supplierId')::uuid
            else v_product.supplier_id end;

          if v_new_category_id is not null then
            perform 1 from public.inventory_categories category
            where category.id = v_new_category_id
              and category.deleted_at is null
              and category.shop_id = p_shop_id
            for key share;
            v_replacement_valid := found;
          else
            v_replacement_valid := true;
          end if;
          if not v_replacement_valid then
            v_result := jsonb_build_object(
              'ok', false, 'code', 'invalid_category'
            );
          else
            if v_new_supplier_id is not null then
              perform 1 from public.inventory_suppliers supplier
              where supplier.id = v_new_supplier_id
                and supplier.deleted_at is null
                and supplier.shop_id = p_shop_id
              for key share;
              v_replacement_valid := found;
            else
              v_replacement_valid := true;
            end if;
            if not v_replacement_valid then
              v_result := jsonb_build_object(
                'ok', false, 'code', 'invalid_supplier'
              );
            else
              v_barcode := case when p_payload ? 'barcode'
                then app_private.catalog_identity_text_v1(
                  p_payload->>'barcode', 96, true
                ) else v_product.barcode end;
              v_item_number := case when p_payload ? 'itemNumber'
                then nullif(app_private.catalog_identity_text_v1(
                  p_payload->>'itemNumber', 120, false
                ), '') else v_product.item_number end;
              v_product_name := case when p_payload ? 'productName'
                then nullif(app_private.catalog_display_text_v1(
                  p_payload->>'productName', 240, false
                ), '') else v_product.product_name end;
              v_second_product_name := case
                when p_payload ? 'secondProductName'
                then nullif(app_private.catalog_display_text_v1(
                  p_payload->>'secondProductName', 240, false
                ), '') else v_product.second_product_name end;

              update public.inventory_products
              set barcode = v_barcode,
                  item_number = v_item_number,
                  product_name = v_product_name,
                  second_product_name = v_second_product_name,
                  stock_quantity = case
                    when jsonb_typeof(p_payload->'stockQuantity') = 'number'
                      then (p_payload->>'stockQuantity')::double precision
                    when p_payload ? 'stockQuantity' then null
                    else v_product.stock_quantity end,
                  supplier_id = v_new_supplier_id,
                  category_id = v_new_category_id,
                  shop_id = p_shop_id,
                  updated_at = statement_timestamp()
              where id = p_target_id
              returning updated_at into v_updated_at;
              v_result := jsonb_build_object(
                'ok', true, 'code', 'success',
                'target_id', p_target_id
              );
            end if;
          end if;
        end if;

      elsif p_operation in ('product_archive', 'product_restore') then
        select product.* into v_product
        from public.inventory_products product
        where product.id = p_target_id
          and product.shop_id = p_shop_id
        for update;
        if not found then
          v_result := jsonb_build_object(
            'ok', false, 'code', 'entity_not_found'
          );
        elsif v_product.updated_at is distinct from p_expected_updated_at then
          v_result := jsonb_build_object(
            'ok', false, 'code', 'stale_version'
          );
        elsif (p_operation = 'product_archive'
            and v_product.deleted_at is not null)
          or (p_operation = 'product_restore'
            and v_product.deleted_at is null) then
          v_result := jsonb_build_object(
            'ok', false, 'code', 'conflict'
          );
        else
          if p_operation = 'product_restore' then
            v_previous_restore_allowed := current_setting(
              'app.catalog_restore_allowed', true
            );
            perform set_config('app.catalog_restore_allowed', 'true', true);
          end if;
          update public.inventory_products
          set deleted_at = case when p_operation = 'product_archive'
                then clock_timestamp() else null end,
              shop_id = p_shop_id,
              updated_at = statement_timestamp()
          where id = p_target_id
          returning updated_at into v_updated_at;
          if p_operation = 'product_restore' then
            perform set_config(
              'app.catalog_restore_allowed',
              coalesce(v_previous_restore_allowed, ''), true
            );
          end if;
          v_result := jsonb_build_object(
            'ok', true, 'code', 'success', 'target_id', p_target_id
          );
        end if;

      elsif p_operation = 'product_price_update' then
        select product.* into v_product
        from public.inventory_products product
        where product.id = p_target_id
          and product.deleted_at is null
          and product.shop_id = p_shop_id
        for update;

        if not found then
          v_result := jsonb_build_object(
            'ok', false, 'code', 'entity_not_found'
          );
        elsif v_product.updated_at is distinct from p_expected_updated_at then
          v_result := jsonb_build_object(
            'ok', false, 'code', 'stale_version'
          );
        else
          v_price := (p_payload->>'price')::numeric;
          v_price_type := upper(p_payload->>'priceType');
          v_old_price := case v_price_type
            when 'PURCHASE' then v_product.purchase_price
            else v_product.retail_price
          end;

          if v_old_price is not distinct from v_price::double precision then
            v_result := jsonb_build_object(
              'ok', true, 'code', 'success', 'target_id', p_target_id,
              'payload', jsonb_build_object('changed', false)
            );
            v_history_operation := 'price_unchanged';
            v_event_key := 'shop.wechat.catalog.product.price_unchanged';
          else
            update public.inventory_products
            set purchase_price = case when v_price_type = 'PURCHASE'
                  then v_price::double precision else purchase_price end,
                retail_price = case when v_price_type = 'RETAIL'
                  then v_price::double precision else retail_price end,
                shop_id = p_shop_id,
                updated_at = statement_timestamp()
            where id = p_target_id
            returning updated_at into v_updated_at;

            v_price_id := gen_random_uuid();
            v_effective_base := date_trunc(
              'second', clock_timestamp() at time zone 'UTC'
            );
            loop
              v_effective_at := to_char(
                v_effective_base, 'YYYY-MM-DD HH24:MI:SS'
              );
              exit when not exists (
                select 1 from public.inventory_product_prices price
                where price.owner_user_id = v_scope.owner_user_id
                  and price.product_id = p_target_id
                  and price.type = v_price_type
                  and price.effective_at = v_effective_at
              );
              v_effective_base := v_effective_base + interval '1 second';
            end loop;
            insert into public.inventory_product_prices (
              id, owner_user_id, shop_id, product_id, type, price,
              effective_at, source, note, created_at
            ) values (
              v_price_id, v_scope.owner_user_id, p_shop_id, p_target_id,
              v_price_type, v_price::double precision, v_effective_at,
              'mini_program', null,
              v_effective_at
            );
            v_result := jsonb_build_object(
              'ok', true, 'code', 'success', 'target_id', p_target_id,
              'payload', jsonb_build_object(
                'changed', true, 'price_history_id', v_price_id,
                'price_type', v_price_type, 'price', v_price
              )
            );
          end if;
        end if;

      elsif p_operation in ('category_create', 'supplier_create') then
        if p_operation = 'category_create' then
          insert into public.inventory_categories (
            id, owner_user_id, shop_id, name, updated_at
          ) values (
            coalesce(p_target_id, gen_random_uuid()),
            v_scope.owner_user_id, p_shop_id,
            app_private.catalog_display_text_v1(
              p_payload->>'name', 160, true
            ), statement_timestamp()
          ) returning id, updated_at
            into v_result_target_id, v_updated_at;
        else
          insert into public.inventory_suppliers (
            id, owner_user_id, shop_id, name, updated_at
          ) values (
            coalesce(p_target_id, gen_random_uuid()),
            v_scope.owner_user_id, p_shop_id,
            app_private.catalog_display_text_v1(
              p_payload->>'name', 160, true
            ), statement_timestamp()
          ) returning id, updated_at
            into v_result_target_id, v_updated_at;
        end if;
        v_result := jsonb_build_object(
          'ok', true, 'code', 'success',
          'target_id', v_result_target_id
        );

      elsif p_operation in ('category_update', 'category_archive',
                             'category_restore') then
        select category.* into v_category
        from public.inventory_categories category
        where category.id = p_target_id
          and category.shop_id = p_shop_id
        for update;

        if not found then
          v_result := jsonb_build_object('ok', false, 'code', 'not_found');
        elsif v_category.updated_at is distinct from p_expected_updated_at then
          v_result := jsonb_build_object(
            'ok', false, 'code', 'stale_revision'
          );
        elsif p_operation <> 'category_restore'
          and v_category.deleted_at is not null then
          v_result := jsonb_build_object(
            'ok', false, 'code', 'invalid_state_or_not_found'
          );
        elsif p_operation = 'category_restore'
          and v_category.deleted_at is null then
          v_result := jsonb_build_object(
            'ok', false, 'code', 'invalid_state_or_not_found'
          );
        elsif p_operation = 'category_update' then
          update public.inventory_categories
          set name = app_private.catalog_display_text_v1(
                p_payload->>'name', 160, true
              ),
              shop_id = p_shop_id,
              updated_at = statement_timestamp()
          where id = p_target_id
          returning updated_at into v_updated_at;
          v_result := jsonb_build_object(
            'ok', true, 'code', 'success', 'target_id', p_target_id
          );
        elsif p_operation = 'category_archive' then
          v_replacement_id := case
            when jsonb_typeof(p_payload->'replacementId') = 'string'
              then (p_payload->>'replacementId')::uuid end;
          v_replacement_valid := true;
          if v_replacement_id is not null then
            perform 1
            from public.inventory_categories replacement
            where replacement.id = v_replacement_id
              and replacement.deleted_at is null
              and replacement.shop_id = p_shop_id
            for key share;
            v_replacement_valid := found;
          end if;
          if v_replacement_id = p_target_id then
            v_result := jsonb_build_object(
              'ok', false, 'code', 'invalid_category'
            );
          elsif not v_replacement_valid then
            v_result := jsonb_build_object(
              'ok', false, 'code', 'invalid_category'
            );
          else
            select count(*)::integer into v_reassigned_count
            from public.inventory_products product
            where product.category_id = p_target_id
              and product.deleted_at is null
              and product.shop_id = p_shop_id;
            if v_reassigned_count > 0 and v_replacement_id is null then
              v_result := jsonb_build_object(
                'ok', false, 'code', 'replacement_required'
              );
            else
              if v_reassigned_count > 0 then
                update public.inventory_products
                set category_id = v_replacement_id,
                    shop_id = p_shop_id,
                    updated_at = statement_timestamp()
                where category_id = p_target_id
                  and deleted_at is null
                  and shop_id = p_shop_id;
              end if;
              update public.inventory_categories
              set deleted_at = clock_timestamp(), shop_id = p_shop_id,
                  updated_at = statement_timestamp()
              where id = p_target_id and deleted_at is null
              returning updated_at into v_updated_at;
              v_result := jsonb_build_object(
                'ok', true, 'code', 'success', 'target_id', p_target_id
              );
            end if;
          end if;
        else
          v_previous_restore_allowed := current_setting(
            'app.catalog_restore_allowed', true
          );
          perform set_config('app.catalog_restore_allowed', 'true', true);
          update public.inventory_categories
          set deleted_at = null, shop_id = p_shop_id,
              updated_at = statement_timestamp()
          where id = p_target_id and deleted_at is not null
          returning updated_at into v_updated_at;
          perform set_config(
            'app.catalog_restore_allowed',
            coalesce(v_previous_restore_allowed, ''), true
          );
          v_result := case when v_updated_at is null
            then jsonb_build_object(
              'ok', false, 'code', 'invalid_state_or_not_found'
            )
            else jsonb_build_object(
              'ok', true, 'code', 'success', 'target_id', p_target_id
            ) end;
        end if;

      elsif p_operation in ('supplier_update', 'supplier_archive',
                             'supplier_restore') then
        select supplier.* into v_supplier
        from public.inventory_suppliers supplier
        where supplier.id = p_target_id
          and supplier.shop_id = p_shop_id
        for update;

        if not found then
          v_result := jsonb_build_object('ok', false, 'code', 'not_found');
        elsif v_supplier.updated_at is distinct from p_expected_updated_at then
          v_result := jsonb_build_object(
            'ok', false, 'code', 'stale_revision'
          );
        elsif p_operation <> 'supplier_restore'
          and v_supplier.deleted_at is not null then
          v_result := jsonb_build_object(
            'ok', false, 'code', 'invalid_state_or_not_found'
          );
        elsif p_operation = 'supplier_restore'
          and v_supplier.deleted_at is null then
          v_result := jsonb_build_object(
            'ok', false, 'code', 'invalid_state_or_not_found'
          );
        elsif p_operation = 'supplier_update' then
          update public.inventory_suppliers
          set name = app_private.catalog_display_text_v1(
                p_payload->>'name', 160, true
              ),
              shop_id = p_shop_id,
              updated_at = statement_timestamp()
          where id = p_target_id
          returning updated_at into v_updated_at;
          v_result := jsonb_build_object(
            'ok', true, 'code', 'success', 'target_id', p_target_id
          );
        elsif p_operation = 'supplier_archive' then
          v_replacement_id := case
            when jsonb_typeof(p_payload->'replacementId') = 'string'
              then (p_payload->>'replacementId')::uuid end;
          v_replacement_valid := true;
          if v_replacement_id is not null then
            perform 1
            from public.inventory_suppliers replacement
            where replacement.id = v_replacement_id
              and replacement.deleted_at is null
              and replacement.shop_id = p_shop_id
            for key share;
            v_replacement_valid := found;
          end if;
          if v_replacement_id = p_target_id then
            v_result := jsonb_build_object(
              'ok', false, 'code', 'invalid_supplier'
            );
          elsif not v_replacement_valid then
            v_result := jsonb_build_object(
              'ok', false, 'code', 'invalid_supplier'
            );
          else
            select count(*)::integer into v_reassigned_count
            from public.inventory_products product
            where product.supplier_id = p_target_id
              and product.deleted_at is null
              and product.shop_id = p_shop_id;
            if v_reassigned_count > 0 and v_replacement_id is null then
              v_result := jsonb_build_object(
                'ok', false, 'code', 'replacement_required'
              );
            else
              if v_reassigned_count > 0 then
                update public.inventory_products
                set supplier_id = v_replacement_id,
                    shop_id = p_shop_id,
                    updated_at = statement_timestamp()
                where supplier_id = p_target_id
                  and deleted_at is null
                  and shop_id = p_shop_id;
              end if;
              update public.inventory_suppliers
              set deleted_at = clock_timestamp(), shop_id = p_shop_id,
                  updated_at = statement_timestamp()
              where id = p_target_id and deleted_at is null
              returning updated_at into v_updated_at;
              v_result := jsonb_build_object(
                'ok', true, 'code', 'success', 'target_id', p_target_id
              );
            end if;
          end if;
        else
          v_previous_restore_allowed := current_setting(
            'app.catalog_restore_allowed', true
          );
          perform set_config('app.catalog_restore_allowed', 'true', true);
          update public.inventory_suppliers
          set deleted_at = null, shop_id = p_shop_id,
              updated_at = statement_timestamp()
          where id = p_target_id and deleted_at is not null
          returning updated_at into v_updated_at;
          perform set_config(
            'app.catalog_restore_allowed',
            coalesce(v_previous_restore_allowed, ''), true
          );
          v_result := case when v_updated_at is null
            then jsonb_build_object(
              'ok', false, 'code', 'invalid_state_or_not_found'
            )
            else jsonb_build_object(
              'ok', true, 'code', 'success', 'target_id', p_target_id
            ) end;
        end if;
      end if;
    exception
      when unique_violation then
        get stacked diagnostics v_constraint_name = constraint_name;
        v_result := jsonb_build_object(
          'ok', false,
          'code', case when lower(coalesce(v_constraint_name, ''))
              like '%barcode%'
            then 'duplicate_barcode' else 'conflict' end
        );
      when foreign_key_violation or check_violation or invalid_text_representation
        or numeric_value_out_of_range then
        v_result := jsonb_build_object(
          'ok', false, 'code', 'validation_failed'
        );
      when others then
        v_result := jsonb_build_object(
          'ok', false, 'code', 'retryable_error'
        );
    end;

    v_ok := coalesce((v_result->>'ok')::boolean, false);
    v_code := case coalesce(nullif(v_result->>'code', ''), 'retryable_error')
      when 'not_found' then 'entity_not_found'
      when 'stale_revision' then 'stale_version'
      when 'invalid_state_or_not_found' then 'conflict'
      when 'unauthorized_or_unmapped' then 'conflict'
      else coalesce(nullif(v_result->>'code', ''), 'retryable_error')
    end;
    if coalesce(v_result->>'target_id', '') ~* '^[0-9a-f-]{36}$' then
      v_result_target_id := (v_result->>'target_id')::uuid;
    end if;
    v_payload_out := coalesce(v_result->'payload', '{}'::jsonb);
    v_audit_result := case
      when v_ok and v_code = 'success' then 'success'
      when v_code = 'retryable_error' then 'failure'
      else 'blocked'
    end;
  end if;

  if v_ok and v_code = 'success' and v_result_target_id is not null
    and v_updated_at is null then
    if v_entity_type = 'product' then
      select product.updated_at into v_updated_at
      from public.inventory_products product
      where product.id = v_result_target_id;
    elsif v_entity_type = 'category' then
      select category.updated_at into v_updated_at
      from public.inventory_categories category
      where category.id = v_result_target_id;
    else
      select supplier.updated_at into v_updated_at
      from public.inventory_suppliers supplier
      where supplier.id = v_result_target_id;
    end if;
  end if;

  v_audit_id := app_private.write_wechat_catalog_audit_v1(
    v_actor_id, p_shop_id, v_event_key, v_audit_result, v_entity_type,
    v_result_target_id, v_code, p_correlation_id,
    jsonb_build_object(
      'operation', v_history_operation,
      'price_type', v_price_type,
      'reassigned_count', v_reassigned_count
    )
  );

  -- A product edit can carry two additional semantic changes.  They remain
  -- separate safe audit facts while the product UPDATE and its sync event stay
  -- one database statement.
  if p_operation = 'product_update' and v_ok and v_code = 'success' then
    select product.category_id, product.supplier_id
      into v_new_category_id, v_new_supplier_id
    from public.inventory_products product
    where product.id = v_result_target_id;
    if v_old_category_id is distinct from v_new_category_id then
      perform app_private.write_wechat_catalog_audit_v1(
        v_actor_id, p_shop_id,
        'shop.wechat.catalog.product.category_changed',
        'success', 'product', v_result_target_id, 'success',
        p_correlation_id,
        jsonb_build_object(
          'operation', 'category_changed', 'changed_field', 'category_id'
        )
      );
    end if;
    if v_old_supplier_id is distinct from v_new_supplier_id then
      perform app_private.write_wechat_catalog_audit_v1(
        v_actor_id, p_shop_id,
        'shop.wechat.catalog.product.supplier_changed',
        'success', 'product', v_result_target_id, 'success',
        p_correlation_id,
        jsonb_build_object(
          'operation', 'supplier_changed', 'changed_field', 'supplier_id'
        )
      );
    end if;
  end if;

  v_result := app_private.wechat_catalog_result_v1(
    v_ok, v_code, p_shop_id, v_result_target_id, v_updated_at,
    p_correlation_id, false, v_payload_out, v_audit_id
  );

  -- Re-check under the same UPDATE locks immediately before making any result
  -- durable. A theoretically lost lease must abort, not commit business DML.
  v_authorization_code :=
    app_private.wechat_catalog_authorization_code_v1(
      v_actor_id, p_shop_id
    );
  if v_authorization_code <> 'success' then
    raise exception 'catalog authorization lease lost'
      using errcode = '40001';
  end if;

  -- Retryable failures and rate-limit denials are intentionally not receipted:
  -- retrying the same idempotency key must be able to make progress later.
  if v_code <> 'retryable_error' then
    insert into app_private.wechat_catalog_mutation_receipts (
      shop_id, actor_profile_id, idempotency_key, operation, request_hash,
      correlation_id, target_id, result
    ) values (
      p_shop_id, v_actor_id, p_idempotency_key, p_operation, v_request_hash,
      p_correlation_id, v_result_target_id, v_result
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.wechat_catalog_mutate_v1(
  uuid, uuid, text, uuid, uuid, timestamptz, uuid, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.wechat_catalog_mutate_v1(
  uuid, uuid, text, uuid, uuid, timestamptz, uuid, jsonb
) to service_role;

create or replace function public.wechat_authorized_shops_v2()
returns table (
  shop_id uuid,
  shop_code text,
  shop_name text,
  role_key text,
  currency_code text,
  time_zone text,
  can_read_catalog boolean,
  can_write_products boolean,
  can_write_categories boolean,
  can_write_suppliers boolean,
  can_change_prices boolean,
  can_manage_images boolean,
  can_read_catalog_history boolean,
  server_time timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    shop.shop_id,
    shop.shop_code,
    shop.shop_name,
    member.role_key,
    coalesce(setting.currency_code, 'CLP'),
    coalesce(setting.catalog_time_zone, 'America/Santiago'),
    true,
    member.role_key in ('shop_owner', 'shop_manager'),
    member.role_key in ('shop_owner', 'shop_manager'),
    member.role_key in ('shop_owner', 'shop_manager'),
    member.role_key in ('shop_owner', 'shop_manager'),
    member.role_key in ('shop_owner', 'shop_manager'),
    true,
    statement_timestamp()
  from public.profiles profile
  join public.shop_members member on member.profile_id = profile.profile_id
  join public.shops shop on shop.shop_id = member.shop_id
  left join public.storefront_settings setting on setting.shop_id = shop.shop_id
  where profile.profile_id = auth.uid()
    and profile.profile_status = 'active'
    and member.membership_status = 'active'
    and member.role_key in ('shop_owner', 'shop_manager', 'viewer')
    and shop.shop_status = 'active'
  order by shop.shop_name, shop.shop_code;
$$;

revoke all on function public.wechat_authorized_shops_v2()
  from public, anon, authenticated, service_role;
grant execute on function public.wechat_authorized_shops_v2()
  to authenticated;

create or replace function public.wechat_catalog_lifecycle_page_v2(
  p_shop_id uuid,
  p_entity_type text default 'product',
  p_state text default 'all',
  p_limit integer default 50,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  entity_type text,
  entity_id uuid,
  display_name text,
  barcode text,
  state text,
  deleted_at timestamptz,
  updated_at timestamptz,
  active_product_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.wechat_can_read_shop(p_shop_id) then return; end if;
  if p_entity_type not in ('product', 'category', 'supplier')
    or p_state not in ('active', 'archived', 'all')
    or p_limit is null
    or p_limit not between 1 and 100
    or ((p_before_updated_at is null) <> (p_before_id is null)) then
    raise exception using errcode = '22023',
      message = 'catalog_lifecycle_page_invalid';
  end if;

  return query
  with active_product_counts as materialized (
    select product.category_id, product.supplier_id, count(*)::bigint as count
    from public.inventory_products product
    where product.shop_id = p_shop_id
      and product.deleted_at is null
      and (product.category_id is not null or product.supplier_id is not null)
    group by grouping sets ((product.category_id), (product.supplier_id))
  ), lifecycle as (
    select 'product'::text as entity_type, product.id as entity_id,
      coalesce(product.product_name, product.second_product_name,
        product.item_number, product.barcode) as display_name,
      product.barcode, product.deleted_at, product.updated_at,
      0::bigint as active_product_count
    from public.inventory_products product
    where product.shop_id = p_shop_id
    union all
    select 'category', category.id, category.name, null::text,
      category.deleted_at, category.updated_at,
      coalesce(category_count.count, 0)::bigint
    from public.inventory_categories category
    left join active_product_counts category_count
      on category_count.category_id = category.id
     and category_count.supplier_id is null
    where category.shop_id = p_shop_id
    union all
    select 'supplier', supplier.id, supplier.name, null::text,
      supplier.deleted_at, supplier.updated_at,
      coalesce(supplier_count.count, 0)::bigint
    from public.inventory_suppliers supplier
    left join active_product_counts supplier_count
      on supplier_count.supplier_id = supplier.id
     and supplier_count.category_id is null
    where supplier.shop_id = p_shop_id
  )
  select lifecycle.entity_type, lifecycle.entity_id,
    lifecycle.display_name, lifecycle.barcode,
    case when lifecycle.deleted_at is null then 'active' else 'archived' end,
    lifecycle.deleted_at, lifecycle.updated_at,
    lifecycle.active_product_count
  from lifecycle
  where lifecycle.entity_type = p_entity_type
    and (p_state = 'all'
      or (p_state = 'active' and lifecycle.deleted_at is null)
      or (p_state = 'archived' and lifecycle.deleted_at is not null))
    and (p_before_id is null
      or (lifecycle.updated_at, lifecycle.entity_id)
        < (p_before_updated_at, p_before_id))
  order by lifecycle.updated_at desc, lifecycle.entity_id desc
  limit p_limit;
end;
$$;

revoke all on function public.wechat_catalog_lifecycle_page_v2(
  uuid, text, text, integer, timestamptz, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.wechat_catalog_lifecycle_page_v2(
  uuid, text, text, integer, timestamptz, uuid
) to authenticated;

create index audit_logs_wechat_catalog_history_idx
  on public.audit_logs (shop_id, created_at desc, audit_log_id desc)
  where scope = 'shop';

create or replace function public.wechat_catalog_history_page_v1(
  p_shop_id uuid,
  p_limit integer default 50,
  p_entity_type text default null,
  p_operation text default null,
  p_from_at timestamptz default null,
  p_to_at timestamptz default null,
  p_entity_id uuid default null,
  p_before_created_at timestamptz default null,
  p_before_audit_log_id uuid default null
)
returns table (
  history_id uuid,
  occurred_at timestamptz,
  actor_display_name text,
  actor_kind text,
  surface text,
  shop_id uuid,
  entity_type text,
  entity_id_redacted text,
  operation text,
  summary text,
  result text,
  correlation_id_redacted text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.wechat_can_read_shop(p_shop_id) then return; end if;
  if p_limit is null
    or p_limit not between 1 and 100
    or (p_entity_type is not null
      and p_entity_type not in ('product', 'category', 'supplier'))
    or (p_operation is not null and p_operation not in (
      'created', 'updated', 'archived', 'restored', 'price_changed',
      'category_changed', 'supplier_changed', 'image_added',
      'image_replaced', 'image_removed'
    ))
    or (p_from_at is not null and p_to_at is not null
      and p_to_at < p_from_at)
    or ((p_before_created_at is null) <> (p_before_audit_log_id is null)) then
    raise exception using errcode = '22023',
      message = 'catalog_history_page_invalid';
  end if;

  return query
  with semantic as (
    select audit.audit_log_id, audit.created_at, audit.actor_profile_id,
      audit.shop_id,
      case
        when audit.event_key like 'shop.wechat.catalog.product.%'
          or audit.event_key in (
            'shop.product_image.finalized', 'shop.product_image.replaced',
            'shop.product_image.removed'
          ) then 'product'
        when audit.event_key like 'shop.wechat.catalog.category.%'
          then 'category'
        when audit.event_key like 'shop.wechat.catalog.supplier.%'
          then 'supplier'
      end as entity_type,
      case when audit.event_key in (
          'shop.product_image.finalized', 'shop.product_image.replaced',
          'shop.product_image.removed'
        ) then audit.metadata_redacted->>'product_id'
        else audit.target_id end as entity_id,
      case audit.event_key
        when 'shop.wechat.catalog.product.created' then 'created'
        when 'shop.wechat.catalog.product.updated' then 'updated'
        when 'shop.wechat.catalog.product.archived' then 'archived'
        when 'shop.wechat.catalog.product.restored' then 'restored'
        when 'shop.wechat.catalog.product.price_changed' then 'price_changed'
        when 'shop.wechat.catalog.product.category_changed' then 'category_changed'
        when 'shop.wechat.catalog.product.supplier_changed' then 'supplier_changed'
        when 'shop.wechat.catalog.category.created' then 'created'
        when 'shop.wechat.catalog.category.updated' then 'updated'
        when 'shop.wechat.catalog.category.archived' then 'archived'
        when 'shop.wechat.catalog.category.restored' then 'restored'
        when 'shop.wechat.catalog.supplier.created' then 'created'
        when 'shop.wechat.catalog.supplier.updated' then 'updated'
        when 'shop.wechat.catalog.supplier.archived' then 'archived'
        when 'shop.wechat.catalog.supplier.restored' then 'restored'
        when 'shop.product_image.finalized' then 'image_added'
        when 'shop.product_image.replaced' then 'image_replaced'
        when 'shop.product_image.removed' then 'image_removed'
      end as operation,
      audit.result,
      case when audit.event_key like 'shop.wechat.catalog.%'
        then 'mini_program' else 'product_image_api' end as surface,
      audit.metadata_redacted->>'correlation_id' as correlation_id
    from public.audit_logs audit
    where audit.scope = 'shop'
      and audit.shop_id = p_shop_id
      and (
        audit.event_key like 'shop.wechat.catalog.product.%'
        or audit.event_key like 'shop.wechat.catalog.category.%'
        or audit.event_key like 'shop.wechat.catalog.supplier.%'
        or audit.event_key in (
          'shop.product_image.finalized', 'shop.product_image.replaced',
          'shop.product_image.removed'
        )
      )
  )
  select semantic.audit_log_id, semantic.created_at,
    coalesce(profile.display_name, 'Personal account'),
    case when semantic.actor_profile_id is null then 'system'
      else 'personal_account' end,
    semantic.surface, semantic.shop_id, semantic.entity_type,
    case when semantic.entity_id is null then null
      else left(semantic.entity_id, 8) || '…' end,
    semantic.operation,
    case semantic.operation
      when 'created' then semantic.entity_type || ' created'
      when 'updated' then semantic.entity_type || ' updated'
      when 'archived' then semantic.entity_type || ' archived'
      when 'restored' then semantic.entity_type || ' restored'
      when 'price_changed' then 'product price changed'
      when 'category_changed' then 'product category changed'
      when 'supplier_changed' then 'product supplier changed'
      when 'image_added' then 'product image added'
      when 'image_replaced' then 'product image replaced'
      when 'image_removed' then 'product image removed'
    end,
    semantic.result,
    case when semantic.correlation_id
        ~* '^[0-9a-f-]{36}$'
      then left(semantic.correlation_id, 8) || '…' end
  from semantic
  left join public.profiles profile
    on profile.profile_id = semantic.actor_profile_id
  where semantic.entity_type is not null
    and semantic.operation is not null
    and (p_entity_type is null or semantic.entity_type = p_entity_type)
    and (p_operation is null or semantic.operation = p_operation)
    and (p_from_at is null or semantic.created_at >= p_from_at)
    and (p_to_at is null or semantic.created_at <= p_to_at)
    and (p_entity_id is null or semantic.entity_id = p_entity_id::text)
    and (p_before_audit_log_id is null
      or (semantic.created_at, semantic.audit_log_id)
        < (p_before_created_at, p_before_audit_log_id))
  order by semantic.created_at desc, semantic.audit_log_id desc
  limit p_limit;
end;
$$;

revoke all on function public.wechat_catalog_history_page_v1(
  uuid, integer, text, text, timestamptz, timestamptz, uuid,
  timestamptz, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.wechat_catalog_history_page_v1(
  uuid, integer, text, text, timestamptz, timestamptz, uuid,
  timestamptz, uuid
) to authenticated;

comment on function public.wechat_catalog_mutate_v1(
  uuid, uuid, text, uuid, uuid, timestamptz, uuid, jsonb
) is 'WECHAT-003 service-role-only personal-account catalog mutation boundary; actor-bound, versioned, bounded and idempotent.';
comment on function public.wechat_authorized_shops_v2() is
  'Active personal-account shops with explicit read/write capabilities; platform-admin status grants nothing.';
comment on function public.wechat_catalog_lifecycle_page_v2(
  uuid, text, text, integer, timestamptz, uuid
) is 'Bounded active/archived catalog lifecycle projection for an authorized shop.';
comment on function public.wechat_catalog_history_page_v1(
  uuid, integer, text, text, timestamptz, timestamptz, uuid,
  timestamptz, uuid
) is 'Allowlisted, redacted catalog history with keyset pagination.';

notify pgrst, 'reload schema';

commit;
