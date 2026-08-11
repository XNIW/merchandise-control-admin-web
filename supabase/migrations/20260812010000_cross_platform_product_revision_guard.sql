-- CROSS-PLATFORM RELIABILITY - optimistic product revision guard.
--
-- The existing catalog update RPCs remain unchanged for backwards
-- compatibility. Admin Web uses the additive functions below and supplies
-- the inventory_products.updated_at value it loaded with the edit form.

create or replace function app_private.staff_web_action_result_v1(
  p_shop_id uuid,
  p_staff_id uuid,
  p_event_key text,
  p_code text,
  p_target_type text default null,
  p_target_id text default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_audit_id uuid;
  v_ok boolean := p_code = 'success';
begin
  insert into public.audit_logs (
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    case when p_staff_id is null then auth.uid() else null end,
    p_staff_id, 'shop', p_shop_id, left(p_event_key, 160),
    case when p_code = 'success' then 'info'
      when p_code in (
        'conflict', 'stale_revision', 'not_found', 'invalid_supplier',
        'invalid_category', 'invalid_state_or_not_found',
        'unauthorized_or_unmapped', 'partial_failure'
      ) then 'warning'
      else 'critical'
    end,
    case when p_code = 'success' then 'success'
      when p_code = 'db_failure' then 'failure' else 'blocked' end,
    nullif(left(p_target_type, 80), ''), nullif(left(p_target_id, 200), ''),
    jsonb_build_object('code', p_code, 'source', 'TASK-139')
  ) returning audit_log_id into v_audit_id;

  if p_staff_id is not null
    and not app_private.staff_web_runtime_lease_publishable_v1() then
    raise exception 'staff web lease expired before publication'
      using errcode = '42501';
  end if;

  return app_private.shop_admin_action_result(
    v_ok, p_code, p_shop_id, p_target_id, v_audit_id,
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

revoke all on function app_private.staff_web_action_result_v1(
  uuid, uuid, text, text, text, text, jsonb
) from public, anon, authenticated, service_role;

create or replace function public.shop_catalog_update_product_if_revision_with_sync(
  p_shop_id uuid,
  p_product_id uuid,
  p_expected_updated_at timestamptz,
  p_barcode text,
  p_item_number text default null,
  p_product_name text default null,
  p_second_product_name text default null,
  p_purchase_price double precision default null,
  p_retail_price double precision default null,
  p_stock_quantity double precision default null,
  p_supplier_id uuid default null,
  p_category_id uuid default null,
  p_actor_kind text default 'personal_account'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_scope record;
  v_current_updated_at timestamptz;
  v_audit_id uuid;
begin
  select *
  into v_scope
  from app_private.resolve_shop_catalog_scope(p_shop_id);

  if v_scope.owner_user_id is null then
    return app_private.shop_admin_action_result(
      false, 'unauthorized_or_unmapped', p_shop_id, p_product_id::text
    );
  end if;

  if p_expected_updated_at is null
    or not pg_catalog.isfinite(p_expected_updated_at) then
    return app_private.shop_admin_action_result(
      false, 'validation_failed', p_shop_id, p_product_id::text
    );
  end if;

  select product.updated_at
  into v_current_updated_at
  from public.inventory_products product
  where product.id = p_product_id
    and product.deleted_at is null
    and (
      product.shop_id = p_shop_id
      or (
        product.shop_id is null
        and product.owner_user_id = v_scope.owner_user_id
      )
    )
  for update;

  if not found then
    return app_private.shop_admin_action_result(
      false, 'not_found', p_shop_id, p_product_id::text
    );
  end if;

  if v_current_updated_at is distinct from p_expected_updated_at then
    v_audit_id := app_private.write_shop_admin_audit(
      p_shop_id,
      'shop.catalog.product.update.stale_revision',
      'warning',
      'blocked',
      'product',
      p_product_id::text,
      'stale_revision',
      jsonb_build_object(
        'catalog_scope', v_scope.catalog_scope,
        'source', 'admin_web'
      )
    );

    return app_private.shop_admin_action_result(
      false,
      'stale_revision',
      p_shop_id,
      p_product_id::text,
      v_audit_id
    );
  end if;

  -- The row lock remains held until this wrapper completes, so the legacy
  -- mutation cannot race between the expected-revision check and its UPDATE.
  return public.shop_catalog_update_product_with_sync(
    p_shop_id,
    p_product_id,
    p_barcode,
    p_item_number,
    p_product_name,
    p_second_product_name,
    p_purchase_price,
    p_retail_price,
    p_stock_quantity,
    p_supplier_id,
    p_category_id,
    p_actor_kind
  );
end;
$$;

revoke all on function public.shop_catalog_update_product_if_revision_with_sync(
  uuid, uuid, timestamptz, text, text, text, text, double precision,
  double precision, double precision, uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.shop_catalog_update_product_if_revision_with_sync(
  uuid, uuid, timestamptz, text, text, text, text, double precision,
  double precision, double precision, uuid, uuid, text
) to authenticated, service_role;

create or replace function public.staff_web_catalog_update_product_if_revision_v1(
  p_shop_id uuid,
  p_staff_id uuid,
  p_staff_web_session_id uuid,
  p_session_token_hash text,
  p_expected_credential_version integer,
  p_expected_updated_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_scope record;
  v_product_id uuid;
  v_current_updated_at timestamptz;
begin
  if p_expected_updated_at is null
    or not pg_catalog.isfinite(p_expected_updated_at)
    or app_private.sync_staff_catalog_payload_is_safe_v1(
      'product_update', p_payload
    ) is not true then
    return jsonb_build_object(
      'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
    );
  end if;

  begin
    v_product_id := (p_payload->>'productId')::uuid;
  exception when others then
    return jsonb_build_object(
      'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
    );
  end;

  if not app_private.staff_web_runtime_lease_is_valid_v1(
    p_shop_id,
    p_staff_id,
    p_staff_web_session_id,
    p_session_token_hash,
    p_expected_credential_version,
    'catalog.write'
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'session_expired', 'shop_id', p_shop_id
    );
  end if;

  select *
  into v_scope
  from app_private.resolve_shop_catalog_scope_service_v1(p_shop_id);

  if v_scope.owner_user_id is null then
    return app_private.staff_web_action_result_v1(
      p_shop_id,
      p_staff_id,
      'shop.catalog.product.update.failure',
      'unauthorized_or_unmapped',
      'product',
      v_product_id::text
    );
  end if;

  select product.updated_at
  into v_current_updated_at
  from public.inventory_products product
  where product.id = v_product_id
    and product.deleted_at is null
    and (
      product.shop_id = p_shop_id
      or (
        product.shop_id is null
        and product.owner_user_id = v_scope.owner_user_id
      )
    )
  for update;

  if not found then
    return app_private.staff_web_action_result_v1(
      p_shop_id,
      p_staff_id,
      'shop.catalog.product.update.failure',
      'not_found',
      'product',
      v_product_id::text
    );
  end if;

  if v_current_updated_at is distinct from p_expected_updated_at then
    return app_private.staff_web_action_result_v1(
      p_shop_id,
      p_staff_id,
      'shop.catalog.product.update.stale_revision',
      'stale_revision',
      'product',
      v_product_id::text,
      jsonb_build_object('catalogScope', v_scope.catalog_scope)
    );
  end if;

  -- The existing lease-bound mutation retains validation, audit, sync-event
  -- publication and the final lease recheck. The row lock closes the gap.
  return public.staff_web_catalog_mutate_v1(
    p_shop_id,
    p_staff_id,
    p_staff_web_session_id,
    p_session_token_hash,
    p_expected_credential_version,
    'product_update',
    p_payload
  );
end;
$$;

revoke all on function public.staff_web_catalog_update_product_if_revision_v1(
  uuid, uuid, uuid, text, integer, timestamptz, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.staff_web_catalog_update_product_if_revision_v1(
  uuid, uuid, uuid, text, integer, timestamptz, jsonb
) to service_role;

create or replace function public.shop_catalog_set_product_archived_if_revision_with_sync(
  p_shop_id uuid,
  p_product_id uuid,
  p_expected_updated_at timestamptz,
  p_archived boolean,
  p_reason text default null,
  p_actor_kind text default 'personal_account'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_scope record;
  v_current_updated_at timestamptz;
  v_deleted_at timestamptz;
  v_audit_id uuid;
begin
  select *
  into v_scope
  from app_private.resolve_shop_catalog_scope(p_shop_id);

  if v_scope.owner_user_id is null then
    return app_private.shop_admin_action_result(
      false, 'unauthorized_or_unmapped', p_shop_id, p_product_id::text
    );
  end if;

  if p_expected_updated_at is null
    or not pg_catalog.isfinite(p_expected_updated_at)
    or p_archived is null then
    return app_private.shop_admin_action_result(
      false, 'validation_failed', p_shop_id, p_product_id::text
    );
  end if;

  select product.updated_at, product.deleted_at
  into v_current_updated_at, v_deleted_at
  from public.inventory_products product
  where product.id = p_product_id
    and (
      product.shop_id = p_shop_id
      or (
        product.shop_id is null
        and product.owner_user_id = v_scope.owner_user_id
      )
    )
  for update;

  if not found then
    return app_private.shop_admin_action_result(
      false, 'not_found', p_shop_id, p_product_id::text
    );
  end if;

  if v_current_updated_at is distinct from p_expected_updated_at then
    v_audit_id := app_private.write_shop_admin_audit(
      p_shop_id,
      case when p_archived
        then 'shop.catalog.product.archive.stale_revision'
        else 'shop.catalog.product.restore.stale_revision'
      end,
      'warning',
      'blocked',
      'product',
      p_product_id::text,
      'stale_revision',
      jsonb_build_object(
        'catalog_scope', v_scope.catalog_scope,
        'source', 'admin_web'
      )
    );

    return app_private.shop_admin_action_result(
      false, 'stale_revision', p_shop_id, p_product_id::text, v_audit_id
    );
  end if;

  if (p_archived and v_deleted_at is not null)
    or (not p_archived and v_deleted_at is null) then
    return app_private.shop_admin_action_result(
      false, 'invalid_state_or_not_found', p_shop_id, p_product_id::text
    );
  end if;

  if p_archived then
    return public.shop_catalog_archive_product_with_sync(
      p_shop_id, p_product_id, p_reason, p_actor_kind
    );
  end if;

  return public.shop_catalog_restore_product_with_sync(
    p_shop_id, p_product_id, p_reason, p_actor_kind
  );
end;
$$;

revoke all on function public.shop_catalog_set_product_archived_if_revision_with_sync(
  uuid, uuid, timestamptz, boolean, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.shop_catalog_set_product_archived_if_revision_with_sync(
  uuid, uuid, timestamptz, boolean, text, text
) to authenticated, service_role;

create or replace function public.staff_web_catalog_set_product_archived_if_revision_v1(
  p_shop_id uuid,
  p_staff_id uuid,
  p_staff_web_session_id uuid,
  p_session_token_hash text,
  p_expected_credential_version integer,
  p_expected_updated_at timestamptz,
  p_archived boolean,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_scope record;
  v_product_id uuid;
  v_current_updated_at timestamptz;
  v_deleted_at timestamptz;
  v_operation text := case when p_archived then 'product_archive' else 'product_restore' end;
begin
  if p_expected_updated_at is null
    or not pg_catalog.isfinite(p_expected_updated_at)
    or p_archived is null
    or app_private.sync_staff_catalog_payload_is_safe_v1(
      v_operation, p_payload
    ) is not true then
    return jsonb_build_object(
      'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
    );
  end if;

  begin
    v_product_id := (p_payload->>'id')::uuid;
  exception when others then
    return jsonb_build_object(
      'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
    );
  end;

  if not app_private.staff_web_runtime_lease_is_valid_v1(
    p_shop_id,
    p_staff_id,
    p_staff_web_session_id,
    p_session_token_hash,
    p_expected_credential_version,
    'catalog.write'
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'session_expired', 'shop_id', p_shop_id
    );
  end if;

  select *
  into v_scope
  from app_private.resolve_shop_catalog_scope_service_v1(p_shop_id);

  if v_scope.owner_user_id is null then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id,
      'shop.catalog.product.revision.failure',
      'unauthorized_or_unmapped', 'product', v_product_id::text
    );
  end if;

  select product.updated_at, product.deleted_at
  into v_current_updated_at, v_deleted_at
  from public.inventory_products product
  where product.id = v_product_id
    and (
      product.shop_id = p_shop_id
      or (
        product.shop_id is null
        and product.owner_user_id = v_scope.owner_user_id
      )
    )
  for update;

  if not found then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id,
      'shop.catalog.product.revision.failure',
      'not_found', 'product', v_product_id::text
    );
  end if;

  if v_current_updated_at is distinct from p_expected_updated_at then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id,
      case when p_archived
        then 'shop.catalog.product.archive.stale_revision'
        else 'shop.catalog.product.restore.stale_revision'
      end,
      'stale_revision', 'product', v_product_id::text,
      jsonb_build_object('catalogScope', v_scope.catalog_scope)
    );
  end if;

  if (p_archived and v_deleted_at is not null)
    or (not p_archived and v_deleted_at is null) then
    return app_private.staff_web_action_result_v1(
      p_shop_id, p_staff_id,
      'shop.catalog.product.revision.failure',
      'invalid_state_or_not_found', 'product', v_product_id::text
    );
  end if;

  return public.staff_web_catalog_mutate_v1(
    p_shop_id,
    p_staff_id,
    p_staff_web_session_id,
    p_session_token_hash,
    p_expected_credential_version,
    v_operation,
    p_payload
  );
end;
$$;

revoke all on function public.staff_web_catalog_set_product_archived_if_revision_v1(
  uuid, uuid, uuid, text, integer, timestamptz, boolean, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.staff_web_catalog_set_product_archived_if_revision_v1(
  uuid, uuid, uuid, text, integer, timestamptz, boolean, jsonb
) to service_role;

create table if not exists app_private.catalog_import_receipts (
  receipt_id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  actor_kind text not null check (actor_kind in ('personal_account', 'pos_staff_manager')),
  actor_id uuid not null,
  request_key text not null check (request_key ~ '^[0-9a-f]{64}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('applying', 'completed')),
  claim_token uuid not null default gen_random_uuid(),
  claimed_at timestamptz not null default now(),
  lease_expires_at timestamptz not null default (now() + interval '30 minutes'),
  completed_at timestamptz,
  result jsonb,
  unique (shop_id, request_key),
  check (
    (status = 'applying' and completed_at is null and result is null)
    or
    (status = 'completed' and completed_at is not null and result is not null)
  )
);

alter table app_private.catalog_import_receipts enable row level security;
revoke all on table app_private.catalog_import_receipts
  from public, anon, authenticated, service_role;

create or replace function public.admin_catalog_import_receipt_claim_v1(
  p_shop_id uuid,
  p_actor_kind text,
  p_actor_id uuid,
  p_request_key text,
  p_request_fingerprint text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_receipt app_private.catalog_import_receipts%rowtype;
begin
  if p_shop_id is null
    or p_actor_id is null
    or p_actor_kind not in ('personal_account', 'pos_staff_manager')
    or p_request_key is null
    or p_request_key !~ '^[0-9a-f]{64}$'
    or p_request_fingerprint is null
    or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  insert into app_private.catalog_import_receipts (
    shop_id, actor_kind, actor_id, request_key, request_fingerprint, status
  ) values (
    p_shop_id, p_actor_kind, p_actor_id, p_request_key,
    p_request_fingerprint, 'applying'
  )
  on conflict (shop_id, request_key) do nothing
  returning * into v_receipt;

  if found then
    return jsonb_build_object(
      'ok', true,
      'code', 'success',
      'state', 'claimed',
      'receiptId', v_receipt.receipt_id,
      'claimToken', v_receipt.claim_token
    );
  end if;

  select *
  into v_receipt
  from app_private.catalog_import_receipts receipt
  where receipt.shop_id = p_shop_id
    and receipt.request_key = p_request_key
  for update;

  if v_receipt.request_fingerprint <> p_request_fingerprint
    or v_receipt.actor_kind <> p_actor_kind
    or v_receipt.actor_id <> p_actor_id then
    return jsonb_build_object(
      'ok', false, 'code', 'idempotency_conflict', 'state', 'conflict'
    );
  end if;

  if v_receipt.status = 'completed' then
    return jsonb_build_object(
      'ok', true,
      'code', 'success',
      'state', 'replay',
      'receiptId', v_receipt.receipt_id,
      'result', v_receipt.result
    );
  end if;

  if v_receipt.lease_expires_at > now() then
    return jsonb_build_object(
      'ok', false,
      'code', 'import_in_progress',
      'state', 'applying',
      'receiptId', v_receipt.receipt_id
    );
  end if;

  return jsonb_build_object(
    'ok', false,
    'code', 'import_indeterminate',
    'state', 'indeterminate',
    'receiptId', v_receipt.receipt_id
  );
end;
$$;

revoke all on function public.admin_catalog_import_receipt_claim_v1(
  uuid, text, uuid, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.admin_catalog_import_receipt_claim_v1(
  uuid, text, uuid, text, text
) to service_role;

create or replace function public.admin_catalog_import_receipt_complete_v1(
  p_receipt_id uuid,
  p_claim_token uuid,
  p_request_fingerprint text,
  p_result jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_receipt app_private.catalog_import_receipts%rowtype;
begin
  if p_receipt_id is null
    or p_claim_token is null
    or p_request_fingerprint is null
    or p_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_result is null
    or jsonb_typeof(p_result) <> 'object'
    or octet_length(p_result::text) > 1048576 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  select *
  into v_receipt
  from app_private.catalog_import_receipts receipt
  where receipt.receipt_id = p_receipt_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_receipt.request_fingerprint <> p_request_fingerprint
    or v_receipt.claim_token <> p_claim_token
    or v_receipt.status <> 'applying' then
    return jsonb_build_object('ok', false, 'code', 'idempotency_conflict');
  end if;

  update app_private.catalog_import_receipts receipt
  set status = 'completed',
      completed_at = now(),
      result = p_result
  where receipt.receipt_id = p_receipt_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'state', 'completed',
    'receiptId', p_receipt_id
  );
end;
$$;

revoke all on function public.admin_catalog_import_receipt_complete_v1(
  uuid, uuid, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.admin_catalog_import_receipt_complete_v1(
  uuid, uuid, text, jsonb
) to service_role;

notify pgrst, 'reload schema';
