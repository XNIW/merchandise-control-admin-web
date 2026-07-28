-- TASK-145: versioned, replay-safe POS article mutations.
--
-- The public RPC is the only route-facing write boundary. It reacquires the
-- POS runtime lease and catalog permission in the same transaction as catalog
-- DML, price history, stock movement, sync-event triggers, revision bump,
-- receipt persistence, audit, and ACK publication.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '15min';

create table if not exists public.pos_article_mutation_receipts (
  pos_article_mutation_receipt_id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  shop_device_id uuid not null references public.shop_devices(shop_device_id) on delete restrict,
  pos_session_id uuid not null references public.pos_sessions(pos_session_id) on delete restrict,
  staff_id uuid not null references public.staff_accounts(staff_id) on delete restrict,
  staff_credential_version integer not null check (staff_credential_version > 0),
  schema_version text not null default 'pos-article-mutation-v1'
    check (schema_version = 'pos-article-mutation-v1'),
  app_version text,
  mutation_id text not null,
  idempotency_key text not null,
  payload_hash text not null,
  attempt_token text not null,
  mutation_kind text not null,
  client_product_id text not null,
  target_remote_product_id uuid,
  remote_product_id uuid,
  base_revision text,
  authoritative_revision text,
  catalog_revision bigint not null check (catalog_revision >= 0),
  local_sequence bigint not null check (local_sequence > 0),
  field_mask jsonb not null default '[]'::jsonb,
  mutation_status text not null,
  terminal boolean not null,
  retryable boolean not null,
  price_history_id uuid references public.inventory_product_prices(id) on delete restrict,
  stock_movement_id uuid references public.pos_sale_stock_movements(
    pos_sale_stock_movement_id
  ) on delete restrict,
  ack_response jsonb not null,
  client_created_at timestamptz not null,
  occurred_at timestamptz not null,
  server_timestamp timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint pos_article_mutation_receipts_mutation_kind_check check (
    mutation_kind in (
      'product_create',
      'product_duplicate',
      'product_update',
      'product_activate',
      'product_deactivate',
      'product_retail_price_change',
      'product_purchase_price_change',
      'product_manual_stock_adjustment'
    )
  ),
  constraint pos_article_mutation_receipts_status_check check (
    mutation_status in (
      'applied',
      'failed_validation',
      'failed_conflict',
      'failed_auth',
      'retryable_upstream',
      'target_not_found',
      'identity_conflict',
      'idempotency_payload_mismatch'
    )
  ),
  constraint pos_article_mutation_receipts_identity_text_check check (
    mutation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
    and attempt_token ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
    and client_product_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
    and payload_hash ~ '^sha256:[0-9a-f]{64}$'
    and (app_version is null or length(app_version) between 1 and 80)
  ),
  constraint pos_article_mutation_receipts_target_shape_check check (
    (
      mutation_kind = 'product_create'
      and target_remote_product_id is null
      and base_revision is null
    )
    or (
      mutation_kind <> 'product_create'
      and target_remote_product_id is not null
      and base_revision is not null
    )
  ),
  constraint pos_article_mutation_receipts_field_mask_check check (
    jsonb_typeof(field_mask) = 'array'
  ),
  constraint pos_article_mutation_receipts_ack_check check (
    jsonb_typeof(ack_response) = 'object'
    and pg_column_size(ack_response) <= 16384
  ),
  constraint pos_article_mutation_receipts_result_shape_check check (
    (mutation_status = 'retryable_upstream' and not terminal and retryable)
    or (mutation_status <> 'retryable_upstream' and terminal and not retryable)
  ),
  constraint pos_article_mutation_receipts_shop_mutation_unique
    unique (shop_id, mutation_id),
  constraint pos_article_mutation_receipts_shop_idempotency_unique
    unique (shop_id, idempotency_key),
  constraint pos_article_mutation_receipts_shop_attempt_unique
    unique (shop_id, attempt_token),
  constraint pos_article_mutation_receipts_shop_sequence_unique
    unique (shop_id, client_product_id, local_sequence)
);

create index if not exists pos_article_mutation_receipts_shop_product_idx
  on public.pos_article_mutation_receipts(
    shop_id, client_product_id, local_sequence desc
  );
create index if not exists pos_article_mutation_receipts_remote_product_idx
  on public.pos_article_mutation_receipts(
    shop_id, remote_product_id, created_at desc
  ) where remote_product_id is not null;

alter table public.pos_article_mutation_receipts enable row level security;
alter table public.pos_article_mutation_receipts force row level security;
revoke all on table public.pos_article_mutation_receipts
  from public, anon, authenticated;
grant all on table public.pos_article_mutation_receipts to service_role;

create table if not exists public.pos_article_mutation_conflict_receipts (
  pos_article_mutation_conflict_receipt_id uuid primary key
    default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  shop_device_id uuid not null references public.shop_devices(shop_device_id)
    on delete restrict,
  pos_session_id uuid not null references public.pos_sessions(pos_session_id)
    on delete restrict,
  staff_id uuid not null references public.staff_accounts(staff_id)
    on delete restrict,
  staff_credential_version integer not null
    check (staff_credential_version > 0),
  schema_version text not null default 'pos-article-mutation-v1'
    check (schema_version = 'pos-article-mutation-v1'),
  app_version text,
  conflict_fingerprint text not null,
  mutation_id text not null,
  idempotency_key text not null,
  payload_hash text not null,
  attempt_token text not null,
  mutation_kind text not null,
  client_product_id text not null,
  target_remote_product_id uuid,
  base_revision text,
  catalog_revision bigint not null check (catalog_revision >= 0),
  local_sequence bigint not null check (local_sequence > 0),
  field_mask jsonb not null default '[]'::jsonb,
  mutation_status text not null,
  ack_response jsonb not null,
  client_created_at timestamptz not null,
  occurred_at timestamptz not null,
  server_timestamp timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint pos_article_mutation_conflict_receipts_kind_check check (
    mutation_kind in (
      'product_create',
      'product_duplicate',
      'product_update',
      'product_activate',
      'product_deactivate',
      'product_retail_price_change',
      'product_purchase_price_change',
      'product_manual_stock_adjustment'
    )
  ),
  constraint pos_article_mutation_conflict_receipts_status_check check (
    mutation_status in (
      'identity_conflict',
      'idempotency_payload_mismatch'
    )
  ),
  constraint pos_article_mutation_conflict_receipts_identity_check check (
    conflict_fingerprint ~ '^sha256:[0-9a-f]{64}$'
    and mutation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
    and attempt_token ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
    and client_product_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
    and payload_hash ~ '^sha256:[0-9a-f]{64}$'
    and (app_version is null or length(app_version) between 1 and 80)
  ),
  constraint pos_article_mutation_conflict_receipts_field_mask_check check (
    jsonb_typeof(field_mask) = 'array'
  ),
  constraint pos_article_mutation_conflict_receipts_ack_check check (
    jsonb_typeof(ack_response) = 'object'
    and pg_column_size(ack_response) <= 16384
    and ack_response->>'schemaVersion' = schema_version
    and ack_response->>'mutationId' = mutation_id
    and ack_response->>'idempotencyKey' = idempotency_key
    and ack_response->>'payloadHash' = payload_hash
    and ack_response->>'attemptToken' = attempt_token
    and ack_response->>'status' = mutation_status
    and ack_response->>'code' = mutation_status
    and ack_response->>'terminal' = 'true'
    and ack_response->>'retryable' = 'false'
  ),
  constraint pos_article_mutation_conflict_receipts_fingerprint_unique
    unique (shop_id, conflict_fingerprint)
);

create index if not exists
  pos_article_mutation_conflict_receipts_shop_created_idx
  on public.pos_article_mutation_conflict_receipts(
    shop_id, created_at desc
  );

alter table public.pos_article_mutation_conflict_receipts
  enable row level security;
alter table public.pos_article_mutation_conflict_receipts
  force row level security;
revoke all on table public.pos_article_mutation_conflict_receipts
  from public, anon, authenticated;
grant all on table public.pos_article_mutation_conflict_receipts
  to service_role;

create or replace function app_private.prevent_pos_article_mutation_receipt_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and current_setting(
      'app.pos_article_mutation_fixture_cleanup_allowed', true
    ) = 'true' then
    return old;
  end if;

  raise exception 'pos_article_mutation_receipts is append-only'
    using errcode = '55000';
end;
$$;

revoke all on function
  app_private.prevent_pos_article_mutation_receipt_mutation_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists pos_article_mutation_receipts_no_update_delete
  on public.pos_article_mutation_receipts;
create trigger pos_article_mutation_receipts_no_update_delete
before update or delete on public.pos_article_mutation_receipts
for each row execute function
  app_private.prevent_pos_article_mutation_receipt_mutation_v1();

drop trigger if exists
  pos_article_mutation_conflict_receipts_no_update_delete
  on public.pos_article_mutation_conflict_receipts;
create trigger pos_article_mutation_conflict_receipts_no_update_delete
before update or delete on public.pos_article_mutation_conflict_receipts
for each row execute function
  app_private.prevent_pos_article_mutation_receipt_mutation_v1();

-- Reuse the existing authoritative stock movement domain. Manual corrections
-- have a mutation origin and never manufacture a sale or revenue-ledger row.
alter table public.pos_sale_stock_movements
  add column if not exists pos_article_mutation_id text;
alter table public.pos_sale_stock_movements
  alter column pos_sale_id drop not null;
alter table public.pos_sale_stock_movements
  drop constraint if exists pos_sale_stock_movements_kind_check;
alter table public.pos_sale_stock_movements
  add constraint pos_sale_stock_movements_kind_check check (
    movement_kind in (
      'sale_decrement',
      'refund_increment',
      'void_reverse',
      'no_stock',
      'unresolved_product',
      'stock_conflict',
      'manual_adjustment'
    )
  );
alter table public.pos_sale_stock_movements
  add constraint pos_sale_stock_movements_origin_shape_v1_check check (
    (
      pos_article_mutation_id is null
      and pos_sale_id is not null
    )
    or (
      pos_article_mutation_id is not null
      and pos_sale_id is null
      and pos_sale_line_id is null
      and movement_kind = 'manual_adjustment'
    )
  );
alter table public.pos_sale_stock_movements
  add constraint pos_sale_stock_movements_article_mutation_id_v1_check check (
    pos_article_mutation_id is null
    or pos_article_mutation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
  );

create unique index if not exists
  pos_sale_stock_movements_shop_article_mutation_v1
  on public.pos_sale_stock_movements(shop_id, pos_article_mutation_id)
  where pos_article_mutation_id is not null;

create or replace function public.prevent_pos_sale_stock_movements_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and old.pos_article_mutation_id is not null
    and current_setting(
      'app.pos_article_mutation_fixture_cleanup_allowed', true
    ) = 'true' then
    return old;
  end if;

  raise exception 'pos_sale_stock_movements is append-only'
    using errcode = '55000';
end;
$$;

revoke all on function public.prevent_pos_sale_stock_movements_mutation()
  from public, anon, authenticated, service_role;

create or replace function
  app_private.pos_article_mutation_conflict_fingerprint_v1(
    p_mutation jsonb,
    p_payload_hash text
  )
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select 'sha256:' || encode(
    extensions.digest(
      jsonb_build_object(
        'baseRevision', p_mutation->>'baseRevision',
        'clientProductId', p_mutation->>'clientProductId',
        'fieldMask', coalesce(p_mutation->'fieldMask', '[]'::jsonb),
        'idempotencyKey', p_mutation->>'idempotencyKey',
        'localSequence', p_mutation->>'localSequence',
        'mutationId', p_mutation->>'mutationId',
        'mutationKind', p_mutation->>'mutationKind',
        'payloadHash', p_payload_hash,
        'remoteProductId', p_mutation->>'remoteProductId'
      )::text,
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function
  app_private.pos_article_mutation_conflict_fingerprint_v1(jsonb, text)
  from public, anon, authenticated, service_role;

create or replace function
  app_private.pos_article_mutation_store_conflict_v1(
    p_shop_id uuid,
    p_shop_device_id uuid,
    p_staff_id uuid,
    p_pos_session_id uuid,
    p_expected_credential_version integer,
    p_schema_version text,
    p_app_version text,
    p_mutation jsonb,
    p_payload_hash text,
    p_code text,
    p_catalog_revision bigint,
    p_server_timestamp timestamptz
  )
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ack jsonb;
  v_conflict_fingerprint text;
  v_inserted boolean := false;
begin
  if p_code not in (
      'identity_conflict',
      'idempotency_payload_mismatch'
    ) then
    raise exception 'Unsupported POS article mutation conflict code'
      using errcode = '22023';
  end if;

  v_conflict_fingerprint :=
    app_private.pos_article_mutation_conflict_fingerprint_v1(
      p_mutation,
      p_payload_hash
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_shop_id::text || ':mutation-conflict:' || v_conflict_fingerprint,
      0
    )
  );

  v_ack := jsonb_build_object(
    'schemaVersion', 'pos-article-mutation-v1',
    'mutationId', p_mutation->>'mutationId',
    'idempotencyKey', p_mutation->>'idempotencyKey',
    'payloadHash', p_payload_hash,
    'attemptToken', p_mutation->>'attemptToken',
    'status', p_code,
    'code', p_code,
    'terminal', true,
    'retryable', false,
    'remoteProductId', nullif(p_mutation->>'remoteProductId', '')::uuid,
    'priceHistoryId', null,
    'stockMovementId', null,
    'authoritativeRevision', null,
    'catalogRevision', greatest(coalesce(p_catalog_revision, 0), 0)::text,
    'serverTimestamp', to_char(
      p_server_timestamp at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  );

  insert into public.pos_article_mutation_conflict_receipts(
    shop_id, shop_device_id, pos_session_id, staff_id,
    staff_credential_version, schema_version, app_version,
    conflict_fingerprint, mutation_id, idempotency_key, payload_hash,
    attempt_token, mutation_kind, client_product_id,
    target_remote_product_id, base_revision, catalog_revision,
    local_sequence, field_mask, mutation_status, ack_response,
    client_created_at, occurred_at, server_timestamp
  ) values (
    p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
    p_expected_credential_version, p_schema_version, p_app_version,
    v_conflict_fingerprint, p_mutation->>'mutationId',
    p_mutation->>'idempotencyKey', p_payload_hash,
    p_mutation->>'attemptToken', p_mutation->>'mutationKind',
    p_mutation->>'clientProductId',
    nullif(p_mutation->>'remoteProductId', '')::uuid,
    nullif(p_mutation->>'baseRevision', ''),
    greatest(coalesce(p_catalog_revision, 0), 0),
    (p_mutation->>'localSequence')::bigint,
    coalesce(p_mutation->'fieldMask', '[]'::jsonb),
    p_code, v_ack,
    (p_mutation->>'createdAt')::timestamptz,
    (p_mutation->>'occurredAt')::timestamptz,
    p_server_timestamp
  )
  on conflict (shop_id, conflict_fingerprint) do nothing
  returning ack_response into v_ack;

  if v_ack is null then
    select receipt.ack_response into strict v_ack
    from public.pos_article_mutation_conflict_receipts receipt
    where receipt.shop_id = p_shop_id
      and receipt.conflict_fingerprint = v_conflict_fingerprint;
  else
    v_inserted := true;
  end if;

  if v_inserted then
    insert into public.audit_logs(
      actor_profile_id, actor_staff_id, scope, shop_id, event_key,
      severity, result, target_type, target_id, metadata_redacted
    ) values (
      null, p_staff_id, 'shop', p_shop_id,
      'pos.catalog.article_mutation.failure',
      'warning', 'blocked', 'pos_article_mutation',
      v_conflict_fingerprint,
      jsonb_build_object(
        'code', p_code,
        'mutation_kind', p_mutation->>'mutationKind',
        'source', 'pos_article_mutation_v1'
      )
    );
  end if;

  if not app_private.pos_runtime_lease_is_valid_v1(
      p_shop_id, p_shop_device_id, p_staff_id, p_pos_session_id
    ) then
    raise exception 'POS lease expired before conflict receipt publication'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', false,
    'code', v_ack->>'code',
    'deliveryStatus', v_ack->>'code',
    'ack', v_ack
  );
end;
$$;

revoke all on function
  app_private.pos_article_mutation_store_conflict_v1(
    uuid, uuid, uuid, uuid, integer, text, text, jsonb, text, text,
    bigint, timestamptz
  )
  from public, anon, authenticated, service_role;

create or replace function public.pos_article_mutation_apply_v1(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_expected_credential_version integer,
  p_schema_version text,
  p_app_version text,
  p_mutation jsonb,
  p_payload_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ack jsonb;
  v_app_version text := nullif(left(btrim(coalesce(p_app_version, '')), 80), '');
  v_attempt_token text := p_mutation->>'attemptToken';
  v_base_revision text := nullif(p_mutation->>'baseRevision', '');
  v_catalog_revision bigint := 0;
  v_changes jsonb := p_mutation->'changes';
  v_client_created_at timestamptz;
  v_client_product_id text := p_mutation->>'clientProductId';
  v_code text := 'applied';
  v_conflict_fingerprint text;
  v_existing public.pos_article_mutation_receipts%rowtype;
  v_existing_conflict public.pos_article_mutation_conflict_receipts%rowtype;
  v_field text;
  v_field_mask jsonb := coalesce(p_mutation->'fieldMask', '[]'::jsonb);
  v_idempotency_key text := p_mutation->>'idempotencyKey';
  v_last_remote_product_id uuid;
  v_local_sequence bigint;
  v_mutation_id text := p_mutation->>'mutationId';
  v_mutation_kind text := p_mutation->>'mutationKind';
  v_occurred_at timestamptz;
  v_owner_user_id uuid;
  v_payload_key text;
  v_prevalidation_failed boolean := false;
  v_price_effective_at text;
  v_price_history_id uuid;
  v_previous_restore_allowed text;
  v_product public.inventory_products%rowtype;
  v_product_revision text;
  v_reason text;
  v_remote_product_id uuid;
  v_response_metadata jsonb := '{}'::jsonb;
  v_scope record;
  v_server_timestamp timestamptz;
  v_stock_after numeric(12,3);
  v_stock_before numeric(12,3);
  v_stock_delta numeric(12,3);
  v_stock_movement_id uuid;
  v_target_remote_product_id uuid;
  v_value numeric;
begin
  if p_schema_version <> 'pos-article-mutation-v1'
    or p_shop_id is null
    or p_shop_device_id is null
    or p_staff_id is null
    or p_pos_session_id is null
    or coalesce(p_expected_credential_version, 0) < 1
    or p_payload_hash !~ '^sha256:[0-9a-f]{64}$'
    or p_mutation is null
    or jsonb_typeof(p_mutation) <> 'object'
    or pg_column_size(p_mutation) > 32768 then
    return jsonb_build_object(
      'ok', false, 'code', 'failed_validation',
      'reason', 'invalid_envelope'
    );
  end if;

  if not app_private.pos_runtime_lease_is_valid_v1(
      p_shop_id, p_shop_device_id, p_staff_id, p_pos_session_id
    ) then
    return jsonb_build_object('ok', false, 'code', 'failed_auth');
  end if;

  perform 1
  from public.staff_accounts staff
  join public.staff_role_permissions permission
    on permission.shop_id = staff.shop_id
   and permission.role_key = staff.role_key
   and permission.enabled
  where staff.staff_id = p_staff_id
    and staff.shop_id = p_shop_id
    and staff.credential_version = p_expected_credential_version
    and permission.permission_key in (
      'shop_admin.full_access',
      'catalog.write',
      'catalog.manage'
    )
  limit 1
  for share of permission;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'failed_auth');
  end if;

  select * into v_scope
  from app_private.resolve_shop_catalog_scope_service_v1(p_shop_id);
  if v_scope.owner_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'failed_auth');
  end if;
  v_owner_user_id := v_scope.owner_user_id;

  begin
    v_local_sequence := (p_mutation->>'localSequence')::bigint;
    v_client_created_at := (p_mutation->>'createdAt')::timestamptz;
    v_occurred_at := (p_mutation->>'occurredAt')::timestamptz;
    v_target_remote_product_id :=
      nullif(p_mutation->>'remoteProductId', '')::uuid;
  exception when others then
    return jsonb_build_object(
      'ok', false, 'code', 'failed_validation',
      'reason', 'invalid_cast'
    );
  end;

  if v_mutation_kind not in (
      'product_create',
      'product_duplicate',
      'product_update',
      'product_activate',
      'product_deactivate',
      'product_retail_price_change',
      'product_purchase_price_change',
      'product_manual_stock_adjustment'
    )
    or coalesce(v_mutation_id, '') !~
      '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
    or coalesce(v_idempotency_key, '') !~
      '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
    or coalesce(v_attempt_token, '') !~
      '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
    or coalesce(v_client_product_id, '') !~
      '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
    or v_local_sequence < 1
    or not pg_catalog.isfinite(v_client_created_at)
    or not pg_catalog.isfinite(v_occurred_at)
    or jsonb_typeof(v_changes) <> 'object'
    or pg_column_size(v_changes) > 16384
    or jsonb_typeof(v_field_mask) <> 'array'
    or jsonb_array_length(v_field_mask) > 8
    or (
      v_mutation_kind <> 'product_update'
      and jsonb_array_length(v_field_mask) <> 0
    )
    or (select count(*) from jsonb_object_keys(p_mutation)) <> (
      select count(*)
      from jsonb_object_keys(p_mutation) as item(key)
      where item.key = any(array[
        'mutationId', 'idempotencyKey', 'payloadHash', 'attemptToken',
        'mutationKind', 'clientProductId', 'remoteProductId',
        'baseRevision', 'localSequence', 'fieldMask', 'changes',
        'createdAt', 'occurredAt'
      ])
    ) then
    return jsonb_build_object(
      'ok', false, 'code', 'failed_validation',
      'reason', 'invalid_shape'
    );
  end if;

  v_prevalidation_failed :=
    v_client_created_at > clock_timestamp() + interval '5 minutes'
    or v_occurred_at > clock_timestamp() + interval '5 minutes'
    or v_client_created_at < clock_timestamp() - interval '180 days'
    or v_occurred_at < clock_timestamp() - interval '180 days';

  v_server_timestamp := clock_timestamp();
  select coalesce(revision, 0) into v_catalog_revision
  from app_private.pos_catalog_revisions
  where shop_id = p_shop_id;
  v_catalog_revision := coalesce(v_catalog_revision, 0);
  v_response_metadata := jsonb_build_object(
    'catalogRevision', v_catalog_revision::text,
    'serverTimestamp', to_char(
      v_server_timestamp at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  );

  if p_mutation->>'payloadHash' is distinct from p_payload_hash then
    return app_private.pos_article_mutation_store_conflict_v1(
      p_shop_id, p_shop_device_id, p_staff_id, p_pos_session_id,
      p_expected_credential_version, p_schema_version, v_app_version,
      p_mutation, p_payload_hash, 'idempotency_payload_mismatch',
      v_catalog_revision, v_server_timestamp
    );
  end if;

  if (
      v_mutation_kind = 'product_create'
      and (v_target_remote_product_id is not null or v_base_revision is not null)
    )
    or (
      v_mutation_kind <> 'product_create'
      and (
        v_target_remote_product_id is null
        or v_base_revision is null
        or v_base_revision !~
          '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'
      )
    ) then
    return jsonb_build_object(
      'ok', false, 'code', 'failed_validation',
      'reason', 'invalid_target_shape'
    ) || v_response_metadata;
  end if;

  v_conflict_fingerprint :=
    app_private.pos_article_mutation_conflict_fingerprint_v1(
      p_mutation,
      p_payload_hash
    );
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_shop_id::text || ':mutation-conflict:' || v_conflict_fingerprint,
      0
    )
  );
  select receipt.* into v_existing_conflict
  from public.pos_article_mutation_conflict_receipts receipt
  where receipt.shop_id = p_shop_id
    and receipt.conflict_fingerprint = v_conflict_fingerprint
  for share;

  if found then
    if not app_private.pos_runtime_lease_is_valid_v1(
        p_shop_id, p_shop_device_id, p_staff_id, p_pos_session_id
      ) then
      raise exception 'POS lease expired before conflict receipt replay'
        using errcode = '42501';
    end if;

    return jsonb_build_object(
      'ok', false,
      'code', v_existing_conflict.mutation_status,
      'deliveryStatus', v_existing_conflict.mutation_status,
      'ack', v_existing_conflict.ack_response
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_shop_id::text || ':mutation:' || v_mutation_id, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(p_shop_id::text || ':idempotency:' || v_idempotency_key, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(p_shop_id::text || ':attempt:' || v_attempt_token, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_shop_id::text || ':client-product:' || v_client_product_id, 0
    )
  );

  if exists (
      select 1
      from public.pos_article_mutation_receipts receipt
    where receipt.shop_id = p_shop_id
      and receipt.attempt_token = v_attempt_token
      and receipt.mutation_id <> v_mutation_id
    ) then
    return app_private.pos_article_mutation_store_conflict_v1(
      p_shop_id, p_shop_device_id, p_staff_id, p_pos_session_id,
      p_expected_credential_version, p_schema_version, v_app_version,
      p_mutation, p_payload_hash, 'identity_conflict',
      v_catalog_revision, v_server_timestamp
    );
  end if;

  select receipt.* into v_existing
  from public.pos_article_mutation_receipts receipt
  where receipt.shop_id = p_shop_id
    and (
      receipt.mutation_id = v_mutation_id
      or receipt.idempotency_key = v_idempotency_key
      or receipt.attempt_token = v_attempt_token
    )
  order by
    (receipt.mutation_id = v_mutation_id) desc,
    (receipt.idempotency_key = v_idempotency_key) desc
  limit 1
  for share;

  if found then
    if v_existing.mutation_id = v_mutation_id
      and v_existing.idempotency_key = v_idempotency_key
      and v_existing.payload_hash = p_payload_hash
      and v_existing.mutation_kind = v_mutation_kind
      and v_existing.client_product_id = v_client_product_id
      and v_existing.target_remote_product_id
        is not distinct from v_target_remote_product_id
      and v_existing.base_revision is not distinct from v_base_revision
      and v_existing.local_sequence = v_local_sequence
      and v_existing.field_mask = v_field_mask then
      if not app_private.pos_runtime_lease_is_valid_v1(
          p_shop_id, p_shop_device_id, p_staff_id, p_pos_session_id
        ) then
        raise exception 'POS lease expired before mutation receipt replay'
          using errcode = '42501';
      end if;

      return jsonb_build_object(
        'ok', true,
        'code', 'duplicate_replay',
        'deliveryStatus', 'duplicate_replay',
        'ack', v_existing.ack_response
      );
    end if;

    return app_private.pos_article_mutation_store_conflict_v1(
      p_shop_id, p_shop_device_id, p_staff_id, p_pos_session_id,
      p_expected_credential_version, p_schema_version, v_app_version,
      p_mutation, p_payload_hash,
      case
        when v_existing.mutation_id = v_mutation_id
          or v_existing.idempotency_key = v_idempotency_key
          then 'idempotency_payload_mismatch'
        else 'identity_conflict'
      end,
      v_catalog_revision, v_server_timestamp
    );
  end if;

  if exists (
    select 1
    from public.pos_article_mutation_receipts receipt
    where receipt.shop_id = p_shop_id
      and receipt.client_product_id = v_client_product_id
      and receipt.local_sequence >= v_local_sequence
    ) then
    return app_private.pos_article_mutation_store_conflict_v1(
      p_shop_id, p_shop_device_id, p_staff_id, p_pos_session_id,
      p_expected_credential_version, p_schema_version, v_app_version,
      p_mutation, p_payload_hash, 'identity_conflict',
      v_catalog_revision, v_server_timestamp
    );
  end if;

  select receipt.remote_product_id into v_last_remote_product_id
  from public.pos_article_mutation_receipts receipt
  where receipt.shop_id = p_shop_id
    and receipt.client_product_id = v_client_product_id
    and receipt.mutation_status = 'applied'
    and receipt.remote_product_id is not null
  order by receipt.local_sequence desc
  limit 1;

  if (
      v_mutation_kind in ('product_create', 'product_duplicate')
      and (
        v_last_remote_product_id is not null
        or v_local_sequence <> 1
      )
    )
    or (
      v_mutation_kind not in ('product_create', 'product_duplicate')
      and v_last_remote_product_id is not null
      and v_last_remote_product_id <> v_target_remote_product_id
    ) then
    return app_private.pos_article_mutation_store_conflict_v1(
      p_shop_id, p_shop_device_id, p_staff_id, p_pos_session_id,
      p_expected_credential_version, p_schema_version, v_app_version,
      p_mutation, p_payload_hash, 'identity_conflict',
      v_catalog_revision, v_server_timestamp
    );
  end if;

  insert into app_private.pos_catalog_revisions(
    shop_id, revision, changed_at
  ) values (
    p_shop_id, 0, statement_timestamp()
  ) on conflict (shop_id) do nothing;

  if v_prevalidation_failed then
    v_code := 'failed_validation';
  else
    <<apply_mutation>>
    begin
    if v_changes ? 'categoryId'
      and nullif(v_changes->>'categoryId', '') is not null
      and not exists (
        select 1
        from public.inventory_categories category
        where category.id = (v_changes->>'categoryId')::uuid
          and category.deleted_at is null
          and (
            category.shop_id = p_shop_id
            or (
              category.shop_id is null
              and category.owner_user_id = v_owner_user_id
            )
          )
      ) then
      v_code := 'failed_validation';
      exit apply_mutation;
    end if;

    if v_changes ? 'supplierId'
      and nullif(v_changes->>'supplierId', '') is not null
      and not exists (
        select 1
        from public.inventory_suppliers supplier
        where supplier.id = (v_changes->>'supplierId')::uuid
          and supplier.deleted_at is null
          and (
            supplier.shop_id = p_shop_id
            or (
              supplier.shop_id is null
              and supplier.owner_user_id = v_owner_user_id
            )
          )
      ) then
      v_code := 'failed_validation';
      exit apply_mutation;
    end if;

    if v_mutation_kind <> 'product_create' then
      select product.* into v_product
      from public.inventory_products product
      where product.id = v_target_remote_product_id
        and (
          product.shop_id = p_shop_id
          or (
            product.shop_id is null
            and product.owner_user_id = v_owner_user_id
          )
        )
      for update;

      if not found then
        v_code := 'target_not_found';
        exit apply_mutation;
      end if;

      v_product_revision := to_char(
        v_product.updated_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      );
      if v_product_revision <> v_base_revision then
        v_code := 'failed_conflict';
        exit apply_mutation;
      end if;
    end if;

    if v_mutation_kind = 'product_create' then
      if (select count(*) from jsonb_object_keys(v_changes)) < 2
        or not v_changes ? 'barcode'
        or not v_changes ? 'primaryName'
        or jsonb_typeof(v_changes->'barcode') <> 'string'
        or jsonb_typeof(v_changes->'primaryName') <> 'string'
        or coalesce(jsonb_typeof(v_changes->'itemNumber'), 'null')
          not in ('string', 'null')
        or coalesce(jsonb_typeof(v_changes->'secondaryName'), 'null')
          not in ('string', 'null')
        or coalesce(jsonb_typeof(v_changes->'categoryId'), 'null')
          not in ('string', 'null')
        or coalesce(jsonb_typeof(v_changes->'supplierId'), 'null')
          not in ('string', 'null')
        or exists (
          select 1 from jsonb_object_keys(v_changes) as item(key)
          where item.key <> all(array[
            'barcode', 'itemNumber', 'primaryName', 'secondaryName',
            'categoryId', 'supplierId', 'retailPrice', 'purchasePrice',
            'stockQuantity'
          ])
        )
        or exists (
          select 1
          from jsonb_each(v_changes) item(key, value)
          where item.key in ('retailPrice', 'purchasePrice', 'stockQuantity')
            and (
              jsonb_typeof(item.value) <> 'number'
              or (item.value #>> '{}')::numeric < 0
              or (item.value #>> '{}')::numeric > 1000000000000
            )
        ) then
        v_code := 'failed_validation';
        exit apply_mutation;
      end if;

      insert into public.inventory_products(
        owner_user_id, shop_id, barcode, item_number, product_name,
        second_product_name, category_id, supplier_id, retail_price,
        purchase_price, stock_quantity, updated_at
      ) values (
        v_owner_user_id, p_shop_id, v_changes->>'barcode',
        nullif(v_changes->>'itemNumber', ''),
        v_changes->>'primaryName',
        nullif(v_changes->>'secondaryName', ''),
        nullif(v_changes->>'categoryId', '')::uuid,
        nullif(v_changes->>'supplierId', '')::uuid,
        nullif(v_changes->>'retailPrice', '')::double precision,
        nullif(v_changes->>'purchasePrice', '')::double precision,
        coalesce(nullif(v_changes->>'stockQuantity', '')::double precision, 0),
        statement_timestamp()
      ) returning * into v_product;
      v_remote_product_id := v_product.id;

    elsif v_mutation_kind = 'product_duplicate' then
      if v_product.deleted_at is not null
        or not v_changes ? 'barcode'
        or jsonb_typeof(v_changes->'barcode') <> 'string'
        or (
          v_changes ? 'primaryName'
          and jsonb_typeof(v_changes->'primaryName') <> 'string'
        )
        or (
          v_changes ? 'itemNumber'
          and jsonb_typeof(v_changes->'itemNumber') not in ('string', 'null')
        )
        or (
          v_changes ? 'secondaryName'
          and jsonb_typeof(v_changes->'secondaryName') not in ('string', 'null')
        )
        or (
          v_changes ? 'categoryId'
          and jsonb_typeof(v_changes->'categoryId') not in ('string', 'null')
        )
        or (
          v_changes ? 'supplierId'
          and jsonb_typeof(v_changes->'supplierId') not in ('string', 'null')
        )
        or exists (
          select 1 from jsonb_object_keys(v_changes) as item(key)
          where item.key <> all(array[
            'barcode', 'itemNumber', 'primaryName', 'secondaryName',
            'categoryId', 'supplierId'
          ])
        ) then
        v_code := case when v_product.deleted_at is null
          then 'failed_validation' else 'failed_conflict' end;
        exit apply_mutation;
      end if;

      insert into public.inventory_products(
        owner_user_id, shop_id, barcode, item_number, product_name,
        second_product_name, category_id, supplier_id, retail_price,
        purchase_price, stock_quantity, updated_at
      ) values (
        v_owner_user_id, p_shop_id, v_changes->>'barcode',
        case when v_changes ? 'itemNumber'
          then nullif(v_changes->>'itemNumber', '') else v_product.item_number end,
        case when v_changes ? 'primaryName'
          then v_changes->>'primaryName' else v_product.product_name end,
        case when v_changes ? 'secondaryName'
          then nullif(v_changes->>'secondaryName', '')
          else v_product.second_product_name end,
        case when v_changes ? 'categoryId'
          then nullif(v_changes->>'categoryId', '')::uuid
          else v_product.category_id end,
        case when v_changes ? 'supplierId'
          then nullif(v_changes->>'supplierId', '')::uuid
          else v_product.supplier_id end,
        v_product.retail_price, v_product.purchase_price,
        v_product.stock_quantity, statement_timestamp()
      ) returning * into v_product;
      v_remote_product_id := v_product.id;

    elsif v_mutation_kind = 'product_update' then
      if v_product.deleted_at is not null
        or jsonb_array_length(v_field_mask) < 1
        or (select count(*) from jsonb_object_keys(v_changes))
          <> jsonb_array_length(v_field_mask)
        or exists (
          select 1
          from jsonb_array_elements_text(v_field_mask) mask(value)
          where mask.value not in (
            'barcode', 'itemNumber', 'primaryName', 'secondaryName',
            'categoryId', 'supplierId'
          )
            or not v_changes ? mask.value
        )
        or (
          select count(distinct mask.value)
          from jsonb_array_elements_text(v_field_mask) mask(value)
        ) <> jsonb_array_length(v_field_mask)
        or exists (
          select 1 from jsonb_object_keys(v_changes) as item(key)
          where not (v_field_mask ? item.key)
        )
        or exists (
          select 1
          from jsonb_each(v_changes) item(key, value)
          where (
            item.key in ('barcode', 'primaryName')
            and jsonb_typeof(item.value) <> 'string'
          )
          or (
            item.key in (
              'itemNumber', 'secondaryName', 'categoryId', 'supplierId'
            )
            and jsonb_typeof(item.value) not in ('string', 'null')
          )
        ) then
        v_code := case when v_product.deleted_at is null
          then 'failed_validation' else 'failed_conflict' end;
        exit apply_mutation;
      end if;

      update public.inventory_products product
      set barcode = case when v_field_mask ? 'barcode'
            then v_changes->>'barcode' else product.barcode end,
          item_number = case when v_field_mask ? 'itemNumber'
            then nullif(v_changes->>'itemNumber', '') else product.item_number end,
          product_name = case when v_field_mask ? 'primaryName'
            then v_changes->>'primaryName' else product.product_name end,
          second_product_name = case when v_field_mask ? 'secondaryName'
            then nullif(v_changes->>'secondaryName', '')
            else product.second_product_name end,
          category_id = case when v_field_mask ? 'categoryId'
            then nullif(v_changes->>'categoryId', '')::uuid
            else product.category_id end,
          supplier_id = case when v_field_mask ? 'supplierId'
            then nullif(v_changes->>'supplierId', '')::uuid
            else product.supplier_id end
      where product.id = v_product.id
      returning * into v_product;
      v_remote_product_id := v_product.id;

    elsif v_mutation_kind in ('product_activate', 'product_deactivate') then
      if (select count(*) from jsonb_object_keys(v_changes)) <> 0
        or jsonb_array_length(v_field_mask) <> 0
        or (
          v_mutation_kind = 'product_activate'
          and v_product.deleted_at is null
        )
        or (
          v_mutation_kind = 'product_deactivate'
          and v_product.deleted_at is not null
        ) then
        v_code := 'failed_conflict';
        exit apply_mutation;
      end if;

      if v_mutation_kind = 'product_activate' then
        v_previous_restore_allowed := current_setting(
          'app.catalog_restore_allowed', true
        );
        perform set_config('app.catalog_restore_allowed', 'true', true);
        update public.inventory_products product
        set deleted_at = null
        where product.id = v_product.id
        returning * into v_product;
        perform set_config(
          'app.catalog_restore_allowed',
          coalesce(v_previous_restore_allowed, ''),
          true
        );
      else
        update public.inventory_products product
        set deleted_at = statement_timestamp()
        where product.id = v_product.id
        returning * into v_product;
      end if;
      v_remote_product_id := v_product.id;

    elsif v_mutation_kind in (
      'product_retail_price_change',
      'product_purchase_price_change'
    ) then
      if v_product.deleted_at is not null
        or (select count(*) from jsonb_object_keys(v_changes)) <> 1
        or not v_changes ? 'price'
        or jsonb_typeof(v_changes->'price') <> 'number' then
        v_code := case when v_product.deleted_at is null
          then 'failed_validation' else 'failed_conflict' end;
        exit apply_mutation;
      end if;

      v_value := (v_changes->>'price')::numeric;
      if v_value < 0 or v_value > 1000000000000 then
        v_code := 'failed_validation';
        exit apply_mutation;
      end if;

      select candidate.effective_at
      into v_price_effective_at
      from (
        select to_char(
          date_trunc('second', v_occurred_at at time zone 'UTC')
            + make_interval(secs => offset_seconds),
          'YYYY-MM-DD HH24:MI:SS'
        ) effective_at
        from generate_series(0, 1023) offsets(offset_seconds)
      ) candidate
      where not exists (
        select 1
        from public.inventory_product_prices price
        where price.owner_user_id = v_owner_user_id
          and price.product_id = v_product.id
          and price.type = case
            when v_mutation_kind = 'product_retail_price_change'
            then 'RETAIL' else 'PURCHASE' end
          and price.effective_at = candidate.effective_at
      )
      order by candidate.effective_at
      limit 1;

      if v_price_effective_at is null
        or not app_private.sync_legacy_timestamp_is_canonical_v1(
          v_price_effective_at
        ) then
        v_code := 'failed_conflict';
        exit apply_mutation;
      end if;

      update public.inventory_products product
      set retail_price = case
            when v_mutation_kind = 'product_retail_price_change'
            then v_value::double precision else product.retail_price end,
          purchase_price = case
            when v_mutation_kind = 'product_purchase_price_change'
            then v_value::double precision else product.purchase_price end
      where product.id = v_product.id
      returning * into v_product;

      v_price_history_id := gen_random_uuid();
      insert into public.inventory_product_prices(
        id, owner_user_id, shop_id, product_id, type, price,
        effective_at, source, note, created_at
      ) values (
        v_price_history_id, v_owner_user_id, p_shop_id, v_product.id,
        case when v_mutation_kind = 'product_retail_price_change'
          then 'RETAIL' else 'PURCHASE' end,
        v_value::double precision,
        v_price_effective_at,
        'pos_article_mutation_v1',
        null,
        v_price_effective_at
      );
      v_remote_product_id := v_product.id;

    else
      if v_product.deleted_at is not null
        or (select count(*) from jsonb_object_keys(v_changes)) <> 2
        or not v_changes ? 'quantityDelta'
        or not v_changes ? 'reason'
        or jsonb_typeof(v_changes->'quantityDelta') <> 'number'
        or jsonb_typeof(v_changes->'reason') <> 'string' then
        v_code := case when v_product.deleted_at is null
          then 'failed_validation' else 'failed_conflict' end;
        exit apply_mutation;
      end if;

      v_stock_delta := (v_changes->>'quantityDelta')::numeric(12,3);
      v_reason := btrim(v_changes->>'reason');
      if v_stock_delta = 0
        or abs(v_stock_delta) > 1000000000
        or v_reason not in (
          'count_correction', 'damage', 'loss', 'found',
          'return_to_stock', 'transfer', 'other'
        ) then
        v_code := 'failed_validation';
        exit apply_mutation;
      end if;

      v_stock_before := coalesce(v_product.stock_quantity, 0)::numeric(12,3);
      v_stock_after := (v_stock_before + v_stock_delta)::numeric(12,3);
      if v_stock_after < 0 then
        v_code := 'failed_conflict';
        exit apply_mutation;
      end if;

      update public.inventory_products product
      set stock_quantity = v_stock_after
      where product.id = v_product.id
      returning * into v_product;

      insert into public.pos_sale_stock_movements(
        movement_key, pos_sale_id, pos_sale_line_id, shop_id, product_id,
        movement_kind, quantity_delta, status, issue_code,
        stock_before, stock_after, metadata_redacted,
        pos_article_mutation_id
      ) values (
        'pos-article:' || p_shop_id::text || ':' || v_mutation_id,
        null, null, p_shop_id, v_product.id,
        'manual_adjustment', v_stock_delta, 'applied', null,
        v_stock_before, v_stock_after,
        jsonb_build_object(
          'reason', v_reason,
          'source', 'pos_article_mutation_v1'
        ),
        v_mutation_id
      ) returning pos_sale_stock_movement_id into v_stock_movement_id;
      v_remote_product_id := v_product.id;
    end if;

    if v_code = 'applied' then
      v_product_revision := to_char(
        v_product.updated_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      );
    end if;
  exception
    when unique_violation or foreign_key_violation then
      v_code := 'identity_conflict';
      v_remote_product_id := null;
      v_price_history_id := null;
      v_stock_movement_id := null;
    when invalid_text_representation
      or numeric_value_out_of_range
      or check_violation
      or not_null_violation then
      v_code := 'failed_validation';
      v_remote_product_id := null;
      v_price_history_id := null;
      v_stock_movement_id := null;
    end apply_mutation;
  end if;

  select revision into v_catalog_revision
  from app_private.pos_catalog_revisions
  where shop_id = p_shop_id
  for share;
  v_catalog_revision := coalesce(v_catalog_revision, 0);
  v_server_timestamp := clock_timestamp();

  if v_remote_product_id is null and v_code <> 'applied' then
    v_remote_product_id := v_target_remote_product_id;
  end if;

  v_ack := jsonb_build_object(
    'schemaVersion', 'pos-article-mutation-v1',
    'mutationId', v_mutation_id,
    'idempotencyKey', v_idempotency_key,
    'payloadHash', p_payload_hash,
    'attemptToken', v_attempt_token,
    'status', v_code,
    'code', v_code,
    'terminal', true,
    'retryable', false,
    'remoteProductId', v_remote_product_id,
    'priceHistoryId', v_price_history_id,
    'stockMovementId', v_stock_movement_id,
    'authoritativeRevision', v_product_revision,
    'catalogRevision', v_catalog_revision::text,
    'serverTimestamp', to_char(
      v_server_timestamp at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  );

  insert into public.pos_article_mutation_receipts(
    shop_id, shop_device_id, pos_session_id, staff_id,
    staff_credential_version, schema_version, app_version,
    mutation_id, idempotency_key, payload_hash, attempt_token,
    mutation_kind, client_product_id, target_remote_product_id,
    remote_product_id, base_revision, authoritative_revision,
    catalog_revision, local_sequence, field_mask, mutation_status,
    terminal, retryable, price_history_id, stock_movement_id,
    ack_response, client_created_at, occurred_at, server_timestamp
  ) values (
    p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
    p_expected_credential_version, p_schema_version, v_app_version,
    v_mutation_id, v_idempotency_key, p_payload_hash, v_attempt_token,
    v_mutation_kind, v_client_product_id, v_target_remote_product_id,
    v_remote_product_id, v_base_revision, v_product_revision,
    v_catalog_revision, v_local_sequence, v_field_mask, v_code,
    true, false, v_price_history_id, v_stock_movement_id,
    v_ack, v_client_created_at, v_occurred_at, v_server_timestamp
  );

  insert into public.audit_logs(
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    null, p_staff_id, 'shop', p_shop_id,
    'pos.catalog.article_mutation.' ||
      case when v_code = 'applied' then 'success' else 'failure' end,
    case when v_code = 'applied' then 'info' else 'warning' end,
    case when v_code = 'applied' then 'success' else 'blocked' end,
    'product', coalesce(v_remote_product_id::text, v_client_product_id),
    jsonb_build_object(
      'code', v_code,
      'mutation_kind', v_mutation_kind,
      'source', 'pos_article_mutation_v1'
    )
  );

  -- A revoke/version/expiry race after DML must roll back domain writes,
  -- movement/history, receipt, audit, revision and sync-event publication.
  if not app_private.pos_runtime_lease_is_valid_v1(
      p_shop_id, p_shop_device_id, p_staff_id, p_pos_session_id
    ) then
    raise exception 'POS lease expired before article mutation publication'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', v_code = 'applied',
    'code', v_code,
    'deliveryStatus', v_code,
    'ack', v_ack
  );
end;
$$;

revoke all on function public.pos_article_mutation_apply_v1(
  uuid, uuid, uuid, uuid, integer, text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.pos_article_mutation_apply_v1(
  uuid, uuid, uuid, uuid, integer, text, text, jsonb, text
) to service_role;

-- Operational staging cleanup for the dedicated TASK-145 synthetic shop.
-- This never accepts arbitrary product IDs: the shop code and every catalog
-- identity must carry the same bounded run marker, and any sales-origin
-- movement makes the transaction fail closed. Immutable audit rows remain.
create or replace function public.pos_article_mutation_cleanup_synthetic_v1(
  p_shop_id uuid,
  p_run_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_audit_id uuid;
  v_before jsonb;
  v_deleted_categories integer := 0;
  v_deleted_conflict_receipts integer := 0;
  v_deleted_movements integer := 0;
  v_deleted_prices integer := 0;
  v_deleted_products integer := 0;
  v_deleted_receipts integer := 0;
  v_deleted_revisions integer := 0;
  v_deleted_suppliers integer := 0;
  v_deleted_sync_events integer := 0;
  v_mutation_prefix text;
  v_name_prefix text;
  v_run_id text := btrim(coalesce(p_run_id, ''));
  v_shop public.shops%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_shop_id::text || ':task145-fixture-cleanup', 0)
  );
  perform set_config('lock_timeout', '3s', true);
  perform set_config('statement_timeout', '20s', true);

  if v_run_id !~ '^[A-Z0-9]{8,18}$' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_run_id'
    );
  end if;

  select * into v_shop
  from public.shops shop
  where shop.shop_id = p_shop_id
  for update;

  v_name_prefix := 'TASK145QA_' || v_run_id;
  v_mutation_prefix := 'task145qa:' || lower(v_run_id) || ':';

  if not found
    or v_shop.shop_code <> v_name_prefix
    or v_shop.shop_name <> v_name_prefix then
    return jsonb_build_object(
      'ok', false,
      'code', 'unsafe_fixture_target'
    );
  end if;

  if exists (
      select 1
      from public.inventory_products product
      where product.shop_id = p_shop_id
        and left(product.barcode, length(v_name_prefix) + 1)
          <> v_name_prefix || '_'
    )
    or exists (
      select 1
      from public.inventory_categories category
      where category.shop_id = p_shop_id
        and left(category.name, length(v_name_prefix) + 1)
          <> v_name_prefix || '_'
    )
    or exists (
      select 1
      from public.inventory_suppliers supplier
      where supplier.shop_id = p_shop_id
        and left(supplier.name, length(v_name_prefix) + 1)
          <> v_name_prefix || '_'
    )
    or exists (
      select 1
      from public.pos_article_mutation_receipts receipt
      where receipt.shop_id = p_shop_id
        and left(receipt.mutation_id, length(v_mutation_prefix))
          <> v_mutation_prefix
    )
    or exists (
      select 1
      from public.pos_article_mutation_conflict_receipts receipt
      where receipt.shop_id = p_shop_id
        and left(receipt.mutation_id, length(v_mutation_prefix))
          <> v_mutation_prefix
    )
    or exists (
      select 1
      from public.pos_sale_stock_movements movement
      where movement.shop_id = p_shop_id
        and (
          movement.pos_article_mutation_id is null
          or left(
            movement.pos_article_mutation_id,
            length(v_mutation_prefix)
          ) <> v_mutation_prefix
        )
    )
    or exists (
      select 1 from public.pos_sales sale where sale.shop_id = p_shop_id
    )
    or exists (
      select 1
      from public.pos_revenue_ledger_entries ledger
      where ledger.shop_id = p_shop_id
    ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'fixture_scope_conflict'
    );
  end if;

  select jsonb_build_object(
    'categories', (
      select count(*) from public.inventory_categories
      where shop_id = p_shop_id
    ),
    'conflict_receipts', (
      select count(*) from public.pos_article_mutation_conflict_receipts
      where shop_id = p_shop_id
    ),
    'movements', (
      select count(*) from public.pos_sale_stock_movements
      where shop_id = p_shop_id
    ),
    'prices', (
      select count(*) from public.inventory_product_prices
      where shop_id = p_shop_id
    ),
    'products', (
      select count(*) from public.inventory_products
      where shop_id = p_shop_id
    ),
    'receipts', (
      select count(*) from public.pos_article_mutation_receipts
      where shop_id = p_shop_id
    ),
    'suppliers', (
      select count(*) from public.inventory_suppliers
      where shop_id = p_shop_id
    ),
    'sync_events', (
      select count(*) from public.sync_events
      where shop_id = p_shop_id
    )
  ) into v_before;

  perform set_config(
    'app.pos_article_mutation_fixture_cleanup_allowed',
    'true',
    true
  );

  delete from public.pos_article_mutation_conflict_receipts
  where shop_id = p_shop_id;
  get diagnostics v_deleted_conflict_receipts = row_count;

  delete from public.pos_article_mutation_receipts
  where shop_id = p_shop_id;
  get diagnostics v_deleted_receipts = row_count;

  delete from public.pos_sale_stock_movements
  where shop_id = p_shop_id
    and pos_article_mutation_id is not null;
  get diagnostics v_deleted_movements = row_count;

  delete from public.inventory_product_prices
  where shop_id = p_shop_id;
  get diagnostics v_deleted_prices = row_count;

  delete from public.inventory_products
  where shop_id = p_shop_id;
  get diagnostics v_deleted_products = row_count;

  delete from public.inventory_categories
  where shop_id = p_shop_id;
  get diagnostics v_deleted_categories = row_count;

  delete from public.inventory_suppliers
  where shop_id = p_shop_id;
  get diagnostics v_deleted_suppliers = row_count;

  delete from public.sync_events
  where shop_id = p_shop_id;
  get diagnostics v_deleted_sync_events = row_count;

  delete from app_private.pos_catalog_revisions
  where shop_id = p_shop_id;
  get diagnostics v_deleted_revisions = row_count;

  perform set_config(
    'app.pos_article_mutation_fixture_cleanup_allowed',
    'false',
    true
  );

  if exists (
      select 1 from public.inventory_products where shop_id = p_shop_id
    )
    or exists (
      select 1
      from public.inventory_product_prices
      where shop_id = p_shop_id
    )
    or exists (
      select 1
      from public.pos_sale_stock_movements
      where shop_id = p_shop_id
    )
    or exists (
      select 1
      from public.pos_article_mutation_receipts
      where shop_id = p_shop_id
    )
    or exists (
      select 1
      from public.pos_article_mutation_conflict_receipts
      where shop_id = p_shop_id
    ) then
    raise exception 'TASK-145 synthetic cleanup invariant failed'
      using errcode = '23514';
  end if;

  insert into public.audit_logs(
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    null, null, 'shop', p_shop_id,
    'pos.catalog.article_mutation.fixture_cleanup',
    'info', 'success', 'qa_run',
    encode(extensions.digest(v_run_id, 'sha256'), 'hex'),
    jsonb_build_object(
      'before', v_before,
      'deleted', jsonb_build_object(
        'categories', v_deleted_categories,
        'conflict_receipts', v_deleted_conflict_receipts,
        'movements', v_deleted_movements,
        'prices', v_deleted_prices,
        'products', v_deleted_products,
        'receipts', v_deleted_receipts,
        'revisions', v_deleted_revisions,
        'suppliers', v_deleted_suppliers,
        'sync_events', v_deleted_sync_events
      ),
      'source', 'pos_article_mutation_v1'
    )
  ) returning audit_log_id into v_audit_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'cleaned',
    'auditId', v_audit_id,
    'before', v_before,
    'deleted', jsonb_build_object(
      'categories', v_deleted_categories,
      'conflict_receipts', v_deleted_conflict_receipts,
      'movements', v_deleted_movements,
      'prices', v_deleted_prices,
      'products', v_deleted_products,
      'receipts', v_deleted_receipts,
      'revisions', v_deleted_revisions,
      'suppliers', v_deleted_suppliers,
      'sync_events', v_deleted_sync_events
    )
  );
end;
$$;

revoke all on function
  public.pos_article_mutation_cleanup_synthetic_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.pos_article_mutation_cleanup_synthetic_v1(uuid, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
