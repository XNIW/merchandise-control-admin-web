-- TASK-149: trusted POS product-image lifecycle, replay receipts and
-- service-role-only capability resolution.
--
-- Signed URLs and Storage object paths are deliberately absent from durable
-- receipts and audit metadata. Object paths only cross the server-side RPC
-- response when the caller must sign or delete that exact database-owned path.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '15min';

alter table public.inventory_product_image_versions
  add column if not exists requested_by_staff_id uuid,
  add column if not exists requested_by_shop_device_id uuid,
  add column if not exists requested_by_pos_session_id uuid,
  add column if not exists finalized_by_staff_id uuid,
  add column if not exists finalized_by_shop_device_id uuid,
  add column if not exists finalized_by_pos_session_id uuid,
  add column if not exists pos_upload_capability_expires_at timestamptz;

alter table public.inventory_product_image_versions
  alter column requested_by_profile_id drop not null,
  drop constraint if exists image_versions_requested_staff_fk,
  add constraint image_versions_requested_staff_fk
    foreign key (requested_by_staff_id)
    references public.staff_accounts(staff_id) on delete restrict,
  drop constraint if exists image_versions_requested_device_fk,
  add constraint image_versions_requested_device_fk
    foreign key (requested_by_shop_device_id)
    references public.shop_devices(shop_device_id) on delete restrict,
  drop constraint if exists image_versions_requested_session_fk,
  add constraint image_versions_requested_session_fk
    foreign key (requested_by_pos_session_id)
    references public.pos_sessions(pos_session_id) on delete restrict,
  drop constraint if exists image_versions_finalized_staff_fk,
  add constraint image_versions_finalized_staff_fk
    foreign key (finalized_by_staff_id)
    references public.staff_accounts(staff_id) on delete restrict,
  drop constraint if exists image_versions_finalized_device_fk,
  add constraint image_versions_finalized_device_fk
    foreign key (finalized_by_shop_device_id)
    references public.shop_devices(shop_device_id) on delete restrict,
  drop constraint if exists image_versions_finalized_session_fk,
  add constraint image_versions_finalized_session_fk
    foreign key (finalized_by_pos_session_id)
    references public.pos_sessions(pos_session_id) on delete restrict,
  drop constraint if exists inventory_product_image_versions_actor_kind_check,
  add constraint inventory_product_image_versions_actor_kind_check check (
    actor_kind in ('personal_account', 'platform_admin', 'pos_staff')
  ),
  add constraint inventory_product_image_versions_requester_shape_v1_check
    check (
      (
        actor_kind in ('personal_account', 'platform_admin')
        and requested_by_profile_id is not null
        and requested_by_staff_id is null
        and requested_by_shop_device_id is null
        and requested_by_pos_session_id is null
      )
      or
      (
        actor_kind = 'pos_staff'
        and requested_by_profile_id is null
        and requested_by_staff_id is not null
        and requested_by_shop_device_id is not null
        and requested_by_pos_session_id is not null
      )
    ),
  drop constraint if exists
    inventory_product_image_versions_pos_upload_capability_v1_check,
  add constraint
    inventory_product_image_versions_pos_upload_capability_v1_check
    check (
      (
        actor_kind = 'pos_staff'
        and pos_upload_capability_expires_at is not null
        and isfinite(pos_upload_capability_expires_at)
        and pos_upload_capability_expires_at > created_at
      )
      or
      (
        actor_kind in ('personal_account', 'platform_admin')
        and pos_upload_capability_expires_at is null
      )
    ),
  drop constraint if exists inventory_product_image_versions_finalized_shape_check,
  add constraint inventory_product_image_versions_finalized_shape_check check (
    (
      status in ('pending', 'failed')
      and finalized_at is null
      and finalized_by_profile_id is null
      and finalized_by_staff_id is null
      and finalized_by_shop_device_id is null
      and finalized_by_pos_session_id is null
    )
    or
    (
      status in ('ready', 'superseded', 'removed')
      and finalized_at is not null
      and (
        (
          finalized_by_profile_id is not null
          and finalized_by_staff_id is null
          and finalized_by_shop_device_id is null
          and finalized_by_pos_session_id is null
        )
        or
        (
          finalized_by_profile_id is null
          and finalized_by_staff_id is not null
          and finalized_by_shop_device_id is not null
          and finalized_by_pos_session_id is not null
        )
      )
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
  );

create index if not exists
  inventory_product_image_versions_staff_created_idx
  on public.inventory_product_image_versions(
    requested_by_staff_id,
    created_at desc
  )
  where requested_by_staff_id is not null;

create table if not exists
  app_private.pos_product_image_mutation_budgets (
    shop_id uuid not null,
    principal_kind text not null,
    principal_id uuid not null,
    window_started_at timestamptz not null,
    admitted_count integer not null,
    updated_at timestamptz not null,
    primary key (shop_id, principal_kind, principal_id),
    constraint pos_product_image_mutation_budgets_shop_fk
      foreign key (shop_id)
      references public.shops(shop_id) on delete cascade,
    constraint pos_product_image_mutation_budgets_shape_check check (
      isfinite(window_started_at)
      and isfinite(updated_at)
      and updated_at >= window_started_at
      and (
        (
          principal_kind in ('shop', 'node_audit_shop')
          and principal_id = shop_id
          and admitted_count between 1 and 300
        )
        or
        (
          principal_kind in ('staff', 'node_audit_staff')
          and admitted_count between 1 and 60
        )
      )
    )
  );

revoke all on table app_private.pos_product_image_mutation_budgets
  from public, anon, authenticated, service_role;

create table if not exists public.pos_product_image_mutation_receipts (
  pos_product_image_mutation_receipt_id uuid primary key
    default gen_random_uuid(),
  shop_id uuid not null,
  shop_device_id uuid not null,
  pos_session_id uuid not null,
  staff_id uuid not null,
  staff_credential_version integer not null
    check (staff_credential_version > 0),
  schema_version text not null default 'pos-product-image-v1'
    check (schema_version = 'pos-product-image-v1'),
  app_version_class text not null default 'present'
    check (app_version_class = 'present'),
  operation text not null,
  operation_id text not null,
  idempotency_key text not null,
  payload_hash text not null,
  product_id uuid not null,
  expected_current_version_id uuid,
  image_version_id uuid,
  authoritative_primary_image_version_id uuid,
  outcome_status text not null,
  outcome_code text not null,
  validation_code text,
  intent_expires_at timestamptz,
  primary_image_updated_at timestamptz,
  catalog_revision bigint not null check (catalog_revision >= 0),
  server_timestamp timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint pos_product_image_receipts_operation_check check (
    operation in ('intent', 'finalize', 'remove')
  ),
  constraint pos_product_image_receipts_identity_check check (
    operation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
    and operation_id !~*
      '(^|[._:-])(mcpos_(device|session)_|eyJ|bearer($|[._:-])|token($|[._:-])|secret($|[._:-])|password($|[._:-])|credential($|[._:-])|pin($|[._:-])|access[_-]?token($|[._:-])|refresh[_-]?token($|[._:-]))'
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
    and idempotency_key !~*
      '(^|[._:-])(mcpos_(device|session)_|eyJ|bearer($|[._:-])|token($|[._:-])|secret($|[._:-])|password($|[._:-])|credential($|[._:-])|pin($|[._:-])|access[_-]?token($|[._:-])|refresh[_-]?token($|[._:-]))'
    and payload_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  constraint pos_product_image_receipts_outcome_check check (
    outcome_status in (
      'upload_required',
      'noop',
      'finalized',
      'validation_failed',
      'removed',
      'already_removed',
      'not_found',
      'stale_conflict',
      'invalid_state',
      'intent_expired',
      'rate_limited'
    )
    and outcome_code ~ '^[a-z][a-z0-9_]{1,63}$'
    and (
      validation_code is null
      or validation_code ~ '^[a-z][a-z0-9_]{1,63}$'
    )
    and (
      (outcome_status = 'validation_failed' and validation_code is not null)
      or
      (outcome_status <> 'validation_failed' and validation_code is null)
    )
  ),
  constraint pos_product_image_receipts_version_shape_check check (
    (
      outcome_status in (
        'upload_required', 'noop', 'finalized',
        'validation_failed', 'removed', 'already_removed', 'intent_expired'
      )
      and image_version_id is not null
    )
    or
    (
      outcome_status in (
        'not_found', 'stale_conflict', 'invalid_state', 'rate_limited'
      )
    )
  ),
  constraint pos_product_image_receipts_expiry_shape_check check (
    (outcome_status = 'upload_required' and intent_expires_at is not null)
    or
    (outcome_status <> 'upload_required' and intent_expires_at is null)
  ),
  constraint pos_product_image_receipts_shop_fk
    foreign key (shop_id)
    references public.shops(shop_id) on delete cascade,
  constraint pos_product_image_receipts_device_fk
    foreign key (shop_device_id)
    references public.shop_devices(shop_device_id) on delete restrict,
  constraint pos_product_image_receipts_session_fk
    foreign key (pos_session_id)
    references public.pos_sessions(pos_session_id) on delete restrict,
  constraint pos_product_image_receipts_staff_fk
    foreign key (staff_id)
    references public.staff_accounts(staff_id) on delete restrict,
  constraint pos_product_image_receipts_version_fk
    foreign key (image_version_id)
    references public.inventory_product_image_versions(id)
    on delete restrict,
  constraint pos_product_image_receipts_current_version_fk
    foreign key (authoritative_primary_image_version_id)
    references public.inventory_product_image_versions(id)
    on delete restrict,
  constraint pos_product_image_receipts_shop_operation_unique
    unique (shop_id, operation_id),
  constraint pos_product_image_receipts_shop_idempotency_unique
    unique (shop_id, idempotency_key)
);

create index if not exists pos_product_image_receipts_shop_product_idx
  on public.pos_product_image_mutation_receipts(
    shop_id,
    product_id,
    created_at desc
  );

alter table public.pos_product_image_mutation_receipts
  enable row level security;
alter table public.pos_product_image_mutation_receipts
  force row level security;
revoke all on table public.pos_product_image_mutation_receipts
  from public, anon, authenticated;
grant select, insert on table public.pos_product_image_mutation_receipts
  to service_role;

create or replace function
  app_private.prevent_pos_product_image_receipt_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and current_setting(
      'app.pos_product_image_fixture_cleanup_allowed',
      true
    ) = 'true' then
    return old;
  end if;

  raise exception 'pos_product_image_mutation_receipts is append-only'
    using errcode = '55000';
end;
$$;

revoke all on function
  app_private.prevent_pos_product_image_receipt_mutation_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists pos_product_image_receipts_no_update_delete
  on public.pos_product_image_mutation_receipts;
create trigger pos_product_image_receipts_no_update_delete
before update or delete on public.pos_product_image_mutation_receipts
for each row execute function
  app_private.prevent_pos_product_image_receipt_mutation_v1();

create or replace function app_private.pos_product_image_timestamp_v1(
  p_value timestamptz
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_value is null then null
    else to_char(
      p_value at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  end;
$$;

create or replace function app_private.pos_product_image_metadata_is_valid_v1(
  p_metadata jsonb,
  p_variant text
)
returns boolean
language plpgsql
stable
parallel safe
set search_path = ''
as $$
declare
  v_bytes bigint;
  v_height bigint;
  v_width bigint;
begin
  if p_variant not in ('main', 'thumb')
    or p_metadata is null
    or jsonb_typeof(p_metadata) <> 'object'
    or pg_column_size(p_metadata) > 1024
    or (select count(*) from jsonb_object_keys(p_metadata)) <> 5
    or not p_metadata ?& array[
      'bytes', 'height', 'mimeType', 'sha256', 'width'
    ]
    or jsonb_typeof(p_metadata->'bytes') <> 'number'
    or jsonb_typeof(p_metadata->'height') <> 'number'
    or jsonb_typeof(p_metadata->'mimeType') <> 'string'
    or jsonb_typeof(p_metadata->'sha256') <> 'string'
    or jsonb_typeof(p_metadata->'width') <> 'number'
    or p_metadata->>'bytes' !~ '^[0-9]{1,10}$'
    or p_metadata->>'height' !~ '^[0-9]{1,10}$'
    or p_metadata->>'width' !~ '^[0-9]{1,10}$'
    or p_metadata->>'sha256' !~ '^[0-9a-f]{64}$'
    or p_metadata->>'mimeType' <> 'image/jpeg' then
    return false;
  end if;

  v_bytes := (p_metadata->>'bytes')::bigint;
  v_height := (p_metadata->>'height')::bigint;
  v_width := (p_metadata->>'width')::bigint;

  if p_variant = 'main' then
    return v_bytes between 1 and 1048576
      and v_height between 1 and 1600
      and v_width between 1 and 1600;
  end if;

  return v_bytes between 1 and 92160
    and v_height between 1 and 384
    and v_width between 1 and 384;
exception when others then
  return false;
end;
$$;

create or replace function app_private.pos_product_image_envelope_is_valid_v1(
  p_schema_version text,
  p_app_version text,
  p_operation_id text,
  p_idempotency_key text,
  p_payload_hash text
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    p_schema_version = 'pos-product-image-v1'
    and length(p_app_version) between 1 and 80
    and p_app_version !~ '[[:cntrl:]]'
    and p_operation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
    and p_operation_id !~*
      '(^|[._:-])(mcpos_(device|session)_|eyJ|bearer($|[._:-])|token($|[._:-])|secret($|[._:-])|password($|[._:-])|credential($|[._:-])|pin($|[._:-])|access[_-]?token($|[._:-])|refresh[_-]?token($|[._:-]))'
    and p_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
    and p_idempotency_key !~*
      '(^|[._:-])(mcpos_(device|session)_|eyJ|bearer($|[._:-])|token($|[._:-])|secret($|[._:-])|password($|[._:-])|credential($|[._:-])|pin($|[._:-])|access[_-]?token($|[._:-])|refresh[_-]?token($|[._:-]))'
    and p_payload_hash ~ '^sha256:[0-9a-f]{64}$',
    false
  );
$$;

create or replace function app_private.pos_product_image_access_is_valid_v1(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_expected_staff_credential_version integer,
  p_permission text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_permission not in ('catalog.read', 'catalog.write')
    or coalesce(p_expected_staff_credential_version, 0) < 1
    or app_private.pos_runtime_lease_is_valid_v1(
      p_shop_id,
      p_shop_device_id,
      p_staff_id,
      p_pos_session_id
    ) is not true then
    return false;
  end if;

  perform 1
  from public.staff_accounts staff
  join public.staff_role_permissions permission
    on permission.shop_id = staff.shop_id
   and permission.role_key = staff.role_key
   and permission.enabled
  where staff.staff_id = p_staff_id
    and staff.shop_id = p_shop_id
    and staff.credential_version =
      p_expected_staff_credential_version
    and (
      (
        p_permission = 'catalog.write'
        and permission.permission_key in (
          'shop_admin.full_access',
          'catalog.write',
          'catalog.manage'
        )
      )
      or
      (
        p_permission = 'catalog.read'
        and permission.permission_key in (
          'shop_admin.full_access',
          'catalog.read',
          'catalog.view',
          'catalog.write',
          'catalog.manage'
        )
      )
    )
  limit 1
  for share of staff, permission;

  return found;
end;
$$;

create or replace function app_private.pos_product_image_admit_write_v1(
  p_shop_id uuid,
  p_staff_id uuid,
  p_checked_at timestamptz
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_shop_budget app_private.pos_product_image_mutation_budgets%rowtype;
  v_shop_count integer := 0;
  v_shop_window_started_at timestamptz := p_checked_at;
  v_staff_budget app_private.pos_product_image_mutation_budgets%rowtype;
  v_staff_count integer := 0;
  v_staff_window_started_at timestamptz := p_checked_at;
begin
  if p_shop_id is null
    or p_staff_id is null
    or p_checked_at is null
    or isfinite(p_checked_at) is not true then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:budget:shop',
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:budget:staff:' ||
      p_staff_id::text,
    0
  ));

  if not exists (
    select 1
    from public.staff_accounts staff
    where staff.staff_id = p_staff_id
      and staff.shop_id = p_shop_id
  ) then
    return false;
  end if;

  select budget.* into v_shop_budget
  from app_private.pos_product_image_mutation_budgets budget
  where budget.shop_id = p_shop_id
    and budget.principal_kind = 'shop'
    and budget.principal_id = p_shop_id;

  if v_shop_budget.shop_id is not null
    and v_shop_budget.window_started_at >
      p_checked_at - interval '1 hour' then
    v_shop_count := v_shop_budget.admitted_count;
    v_shop_window_started_at := v_shop_budget.window_started_at;
  end if;

  select budget.* into v_staff_budget
  from app_private.pos_product_image_mutation_budgets budget
  where budget.shop_id = p_shop_id
    and budget.principal_kind = 'staff'
    and budget.principal_id = p_staff_id;

  if v_staff_budget.shop_id is not null
    and v_staff_budget.window_started_at >
      p_checked_at - interval '15 minutes' then
    v_staff_count := v_staff_budget.admitted_count;
    v_staff_window_started_at := v_staff_budget.window_started_at;
  end if;

  if v_shop_count >= 300 or v_staff_count >= 60 then
    return false;
  end if;

  insert into app_private.pos_product_image_mutation_budgets (
    shop_id,
    principal_kind,
    principal_id,
    window_started_at,
    admitted_count,
    updated_at
  )
  values (
    p_shop_id,
    'shop',
    p_shop_id,
    v_shop_window_started_at,
    v_shop_count + 1,
    greatest(p_checked_at, v_shop_window_started_at)
  )
  on conflict (shop_id, principal_kind, principal_id) do update
  set window_started_at = excluded.window_started_at,
      admitted_count = excluded.admitted_count,
      updated_at = excluded.updated_at;

  insert into app_private.pos_product_image_mutation_budgets (
    shop_id,
    principal_kind,
    principal_id,
    window_started_at,
    admitted_count,
    updated_at
  )
  values (
    p_shop_id,
    'staff',
    p_staff_id,
    v_staff_window_started_at,
    v_staff_count + 1,
    greatest(p_checked_at, v_staff_window_started_at)
  )
  on conflict (shop_id, principal_kind, principal_id) do update
  set window_started_at = excluded.window_started_at,
      admitted_count = excluded.admitted_count,
      updated_at = excluded.updated_at;

  return true;
end;
$$;

revoke all on function app_private.pos_product_image_admit_write_v1(
  uuid, uuid, timestamptz
) from public, anon, authenticated, service_role;

create or replace function
  app_private.pos_product_image_admit_node_audit_v1(
    p_shop_id uuid,
    p_staff_id uuid,
    p_checked_at timestamptz
  )
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_shop_budget app_private.pos_product_image_mutation_budgets%rowtype;
  v_shop_count integer := 0;
  v_shop_window_started_at timestamptz := p_checked_at;
  v_staff_budget app_private.pos_product_image_mutation_budgets%rowtype;
  v_staff_count integer := 0;
  v_staff_window_started_at timestamptz := p_checked_at;
begin
  if p_shop_id is null
    or p_staff_id is null
    or p_checked_at is null
    or isfinite(p_checked_at) is not true then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:node-audit-budget:shop',
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:node-audit-budget:staff:' ||
      p_staff_id::text,
    0
  ));

  if not exists (
    select 1
    from public.staff_accounts staff
    where staff.staff_id = p_staff_id
      and staff.shop_id = p_shop_id
  ) then
    return false;
  end if;

  select budget.* into v_shop_budget
  from app_private.pos_product_image_mutation_budgets budget
  where budget.shop_id = p_shop_id
    and budget.principal_kind = 'node_audit_shop'
    and budget.principal_id = p_shop_id;

  if v_shop_budget.shop_id is not null
    and v_shop_budget.window_started_at >
      p_checked_at - interval '1 hour' then
    v_shop_count := v_shop_budget.admitted_count;
    v_shop_window_started_at := v_shop_budget.window_started_at;
  end if;

  select budget.* into v_staff_budget
  from app_private.pos_product_image_mutation_budgets budget
  where budget.shop_id = p_shop_id
    and budget.principal_kind = 'node_audit_staff'
    and budget.principal_id = p_staff_id;

  if v_staff_budget.shop_id is not null
    and v_staff_budget.window_started_at >
      p_checked_at - interval '15 minutes' then
    v_staff_count := v_staff_budget.admitted_count;
    v_staff_window_started_at := v_staff_budget.window_started_at;
  end if;

  if v_shop_count >= 300 or v_staff_count >= 60 then
    return false;
  end if;

  insert into app_private.pos_product_image_mutation_budgets (
    shop_id,
    principal_kind,
    principal_id,
    window_started_at,
    admitted_count,
    updated_at
  )
  values (
    p_shop_id,
    'node_audit_shop',
    p_shop_id,
    v_shop_window_started_at,
    v_shop_count + 1,
    greatest(p_checked_at, v_shop_window_started_at)
  )
  on conflict (shop_id, principal_kind, principal_id) do update
  set window_started_at = excluded.window_started_at,
      admitted_count = excluded.admitted_count,
      updated_at = excluded.updated_at;

  insert into app_private.pos_product_image_mutation_budgets (
    shop_id,
    principal_kind,
    principal_id,
    window_started_at,
    admitted_count,
    updated_at
  )
  values (
    p_shop_id,
    'node_audit_staff',
    p_staff_id,
    v_staff_window_started_at,
    v_staff_count + 1,
    greatest(p_checked_at, v_staff_window_started_at)
  )
  on conflict (shop_id, principal_kind, principal_id) do update
  set window_started_at = excluded.window_started_at,
      admitted_count = excluded.admitted_count,
      updated_at = excluded.updated_at;

  return true;
end;
$$;

revoke all on function
  app_private.pos_product_image_admit_node_audit_v1(
    uuid, uuid, timestamptz
  )
  from public, anon, authenticated, service_role;

create or replace function app_private.write_pos_product_image_audit_v1(
  p_shop_id uuid,
  p_staff_id uuid,
  p_operation_id text,
  p_operation text,
  p_code text,
  p_result text,
  p_product_count integer,
  p_image_count integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_audit_id uuid;
  v_target_hash text;
begin
  if p_shop_id is null
    or p_staff_id is null
    or p_operation_id !~
      '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
    or p_operation_id ~*
      '(^|[._:-])(mcpos_(device|session)_|eyJ|bearer($|[._:-])|token($|[._:-])|secret($|[._:-])|password($|[._:-])|credential($|[._:-])|pin($|[._:-])|access[_-]?token($|[._:-])|refresh[_-]?token($|[._:-]))'
    or p_operation not in ('intent', 'finalize', 'remove', 'cleanup')
    or p_code !~ '^[a-z][a-z0-9_]{1,63}$'
    or p_result not in ('success', 'blocked')
    or p_product_count not between 0 and 1
    or p_image_count not between 0 and 2 then
    raise exception 'invalid POS product-image audit envelope'
      using errcode = '22023';
  end if;

  v_target_hash := encode(
    extensions.digest(
      p_shop_id::text || ':' || p_operation_id,
      'sha256'
    ),
    'hex'
  );

  insert into public.audit_logs (
    actor_profile_id,
    actor_staff_id,
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
    null,
    p_staff_id,
    'shop',
    p_shop_id,
    'pos.catalog.product_image.' || p_operation,
    case when p_result = 'success' then 'info' else 'warning' end,
    p_result,
    'pos_product_image_operation',
    v_target_hash,
    jsonb_build_object(
      'code', p_code,
      'image_count', p_image_count,
      'operation', p_operation,
      'product_count', p_product_count,
      'source', 'pos_product_image_v1'
    )
  )
  returning audit_log_id into v_audit_id;

  return v_audit_id;
end;
$$;

create or replace function app_private.pos_product_image_receipt_result_v1(
  p_receipt_id uuid,
  p_replayed boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_receipt public.pos_product_image_mutation_receipts%rowtype;
  v_version public.inventory_product_image_versions%rowtype;
  v_positive boolean;
  v_cleanup_required boolean := false;
begin
  select receipt.* into v_receipt
  from public.pos_product_image_mutation_receipts receipt
  where receipt.pos_product_image_mutation_receipt_id = p_receipt_id;
  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'receipt_not_found',
      'server_time',
        app_private.pos_product_image_timestamp_v1(clock_timestamp())
    );
  end if;

  if v_receipt.image_version_id is not null then
    select version.* into v_version
    from public.inventory_product_image_versions version
    where version.id = v_receipt.image_version_id;
  end if;

  v_positive := v_receipt.outcome_status in (
    'upload_required', 'noop', 'finalized', 'removed', 'already_removed'
  );
  v_cleanup_required :=
    v_receipt.outcome_status in ('validation_failed', 'removed')
    and v_version.id is not null
    and v_version.cleanup_status <> 'complete';

  return jsonb_strip_nulls(jsonb_build_object(
    'ok', v_positive,
    'code', case
      when v_positive then 'success'
      else v_receipt.outcome_code
    end,
    'status', v_receipt.outcome_status,
    'replayed', coalesce(p_replayed, false),
    'version_id', v_receipt.image_version_id,
    'current_version_id',
      v_receipt.authoritative_primary_image_version_id,
    'image_updated_at',
      app_private.pos_product_image_timestamp_v1(
        v_receipt.primary_image_updated_at
      ),
    'catalog_revision', v_receipt.catalog_revision::text,
    'expires_at',
      app_private.pos_product_image_timestamp_v1(
        v_receipt.intent_expires_at
      ),
    'validation_code', v_receipt.validation_code,
    'cleanup_status', case
      when v_version.id is null then null
      else v_version.cleanup_status
    end,
    'cleanup_required', v_cleanup_required,
    'main_path', case
      when v_version.id is not null
        and (
          (
            v_receipt.outcome_status = 'upload_required'
            and v_version.status = 'pending'
          )
          or v_cleanup_required
        )
      then v_version.main_path
      else null
    end,
    'thumb_path', case
      when v_version.id is not null
        and (
          (
            v_receipt.outcome_status = 'upload_required'
            and v_version.status = 'pending'
          )
          or v_cleanup_required
        )
      then v_version.thumb_path
      else null
    end,
    'server_time',
      app_private.pos_product_image_timestamp_v1(
        v_receipt.server_timestamp
      )
  ));
end;
$$;

revoke all on function app_private.pos_product_image_timestamp_v1(timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function
  app_private.pos_product_image_metadata_is_valid_v1(jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function
  app_private.pos_product_image_envelope_is_valid_v1(
    text, text, text, text, text
  )
  from public, anon, authenticated, service_role;
revoke all on function
  app_private.pos_product_image_access_is_valid_v1(
    uuid, uuid, uuid, uuid, integer, text
  )
  from public, anon, authenticated, service_role;
revoke all on function
  app_private.pos_product_image_admit_write_v1(
    uuid, uuid, timestamptz
  )
  from public, anon, authenticated, service_role;
revoke all on function
  app_private.write_pos_product_image_audit_v1(
    uuid, uuid, text, text, text, text, integer, integer
  )
  from public, anon, authenticated, service_role;
revoke all on function
  app_private.pos_product_image_receipt_result_v1(uuid, boolean)
  from public, anon, authenticated, service_role;

create or replace function app_private.pos_product_image_store_receipt_v1(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_pos_session_id uuid,
  p_staff_id uuid,
  p_staff_credential_version integer,
  p_schema_version text,
  p_app_version text,
  p_operation text,
  p_operation_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_product_id uuid,
  p_expected_current_version_id uuid,
  p_image_version_id uuid,
  p_authoritative_primary_image_version_id uuid,
  p_outcome_status text,
  p_outcome_code text,
  p_validation_code text,
  p_intent_expires_at timestamptz,
  p_primary_image_updated_at timestamptz,
  p_catalog_revision bigint,
  p_server_timestamp timestamptz
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_receipt_id uuid;
begin
  if p_app_version is null
    or length(p_app_version) not between 1 and 80
    or p_app_version ~ '[[:cntrl:]]' then
    raise exception 'invalid POS product-image app version class'
      using errcode = '22023';
  end if;

  insert into public.pos_product_image_mutation_receipts (
    shop_id,
    shop_device_id,
    pos_session_id,
    staff_id,
    staff_credential_version,
    schema_version,
    app_version_class,
    operation,
    operation_id,
    idempotency_key,
    payload_hash,
    product_id,
    expected_current_version_id,
    image_version_id,
    authoritative_primary_image_version_id,
    outcome_status,
    outcome_code,
    validation_code,
    intent_expires_at,
    primary_image_updated_at,
    catalog_revision,
    server_timestamp
  )
  values (
    p_shop_id,
    p_shop_device_id,
    p_pos_session_id,
    p_staff_id,
    p_staff_credential_version,
    p_schema_version,
    'present',
    p_operation,
    p_operation_id,
    p_idempotency_key,
    p_payload_hash,
    p_product_id,
    p_expected_current_version_id,
    p_image_version_id,
    p_authoritative_primary_image_version_id,
    p_outcome_status,
    p_outcome_code,
    p_validation_code,
    p_intent_expires_at,
    p_primary_image_updated_at,
    p_catalog_revision,
    p_server_timestamp
  )
  returning pos_product_image_mutation_receipt_id into v_receipt_id;

  return v_receipt_id;
end;
$$;

revoke all on function app_private.pos_product_image_store_receipt_v1(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text, text,
  uuid, uuid, uuid, uuid, text, text, text, timestamptz, timestamptz,
  bigint, timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.pos_product_image_authorize_v1(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_expected_staff_credential_version integer,
  p_permission text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_permission not in ('catalog.read', 'catalog.write') then
    return jsonb_build_object(
      'ok', false,
      'code', 'permission_denied',
      'server_time',
        app_private.pos_product_image_timestamp_v1(clock_timestamp())
    );
  end if;

  if app_private.pos_runtime_lease_is_valid_v1(
      p_shop_id,
      p_shop_device_id,
      p_staff_id,
      p_pos_session_id
    ) is not true
    or not exists (
      select 1
      from public.staff_accounts staff
      where staff.staff_id = p_staff_id
        and staff.shop_id = p_shop_id
        and staff.credential_version =
          p_expected_staff_credential_version
    ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'auth_denied',
      'server_time',
        app_private.pos_product_image_timestamp_v1(clock_timestamp())
    );
  end if;

  if app_private.pos_product_image_access_is_valid_v1(
      p_shop_id,
      p_shop_device_id,
      p_staff_id,
      p_pos_session_id,
      p_expected_staff_credential_version,
      p_permission
    ) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'permission_denied',
      'server_time',
        app_private.pos_product_image_timestamp_v1(clock_timestamp())
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'authorized',
    'server_time',
      app_private.pos_product_image_timestamp_v1(clock_timestamp())
  );
end;
$$;

revoke all on function public.pos_product_image_authorize_v1(
  uuid, uuid, uuid, uuid, integer, text
) from public, anon, authenticated;
grant execute on function public.pos_product_image_authorize_v1(
  uuid, uuid, uuid, uuid, integer, text
) to service_role;

create or replace function public.pos_product_image_node_audit_admit_v1(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_expected_staff_credential_version integer,
  p_permission text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admitted boolean := false;
  v_checked_at timestamptz := clock_timestamp();
begin
  if p_permission not in ('catalog.read', 'catalog.write')
    or app_private.pos_product_image_access_is_valid_v1(
      p_shop_id,
      p_shop_device_id,
      p_staff_id,
      p_pos_session_id,
      p_expected_staff_credential_version,
      p_permission
    ) is not true then
    return jsonb_build_object(
      'ok', false,
      'admitted', false,
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_checked_at)
    );
  end if;

  v_admitted := app_private.pos_product_image_admit_node_audit_v1(
    p_shop_id,
    p_staff_id,
    v_checked_at
  );

  return jsonb_build_object(
    'ok', true,
    'admitted', v_admitted,
    'server_time',
      app_private.pos_product_image_timestamp_v1(v_checked_at)
  );
end;
$$;

revoke all on function public.pos_product_image_node_audit_admit_v1(
  uuid, uuid, uuid, uuid, integer, text
) from public, anon, authenticated;
grant execute on function public.pos_product_image_node_audit_admit_v1(
  uuid, uuid, uuid, uuid, integer, text
) to service_role;

create or replace function public.pos_product_image_intent_v1(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_expected_staff_credential_version integer,
  p_schema_version text,
  p_app_version text,
  p_operation_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_product_id uuid,
  p_expected_current_version_id uuid,
  p_main_metadata jsonb,
  p_thumb_metadata jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_catalog_revision bigint := 0;
  v_current public.inventory_product_image_versions%rowtype;
  v_existing public.pos_product_image_mutation_receipts%rowtype;
  v_main_path text;
  v_product public.inventory_products%rowtype;
  v_receipt_id uuid;
  v_replay_version public.inventory_product_image_versions%rowtype;
  v_server_timestamp timestamptz;
  v_thumb_path text;
  v_version_id uuid;
  v_expires_at timestamptz;
begin
  if p_shop_id is null
    or p_shop_device_id is null
    or p_staff_id is null
    or p_pos_session_id is null
    or p_product_id is null
    or app_private.pos_product_image_envelope_is_valid_v1(
      p_schema_version,
      p_app_version,
      p_operation_id,
      p_idempotency_key,
      p_payload_hash
    ) is not true
    or app_private.pos_product_image_metadata_is_valid_v1(
      p_main_metadata,
      'main'
    ) is not true
    or app_private.pos_product_image_metadata_is_valid_v1(
      p_thumb_metadata,
      'thumb'
    ) is not true
    or abs(
      (
        (p_main_metadata->>'width')::numeric
        / (p_main_metadata->>'height')::numeric
      )
      -
      (
        (p_thumb_metadata->>'width')::numeric
        / (p_thumb_metadata->>'height')::numeric
      )
    ) > 0.02 then
    return jsonb_build_object(
      'ok', false,
      'code', 'validation_failed',
      'server_time',
        app_private.pos_product_image_timestamp_v1(clock_timestamp())
    );
  end if;

  if app_private.pos_product_image_access_is_valid_v1(
      p_shop_id,
      p_shop_device_id,
      p_staff_id,
      p_pos_session_id,
      p_expected_staff_credential_version,
      'catalog.write'
    ) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'auth_denied',
      'server_time',
        app_private.pos_product_image_timestamp_v1(clock_timestamp())
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:lifecycle',
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:operation:' || p_operation_id,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:idempotency:' ||
      p_idempotency_key,
    0
  ));

  select receipt.* into v_existing
  from public.pos_product_image_mutation_receipts receipt
  where receipt.shop_id = p_shop_id
    and (
      receipt.operation_id = p_operation_id
      or receipt.idempotency_key = p_idempotency_key
    )
  order by
    (receipt.operation_id = p_operation_id) desc,
    (receipt.idempotency_key = p_idempotency_key) desc
  limit 1
  for share;

  if found then
    if v_existing.operation = 'intent'
      and v_existing.operation_id = p_operation_id
      and v_existing.idempotency_key = p_idempotency_key
      and v_existing.payload_hash = p_payload_hash
      and v_existing.schema_version = p_schema_version
      and v_existing.shop_device_id = p_shop_device_id
      and v_existing.pos_session_id = p_pos_session_id
      and v_existing.staff_id = p_staff_id
      and v_existing.staff_credential_version =
        p_expected_staff_credential_version
      and v_existing.product_id = p_product_id
      and v_existing.expected_current_version_id
        is not distinct from p_expected_current_version_id then
      if app_private.pos_product_image_access_is_valid_v1(
          p_shop_id,
          p_shop_device_id,
          p_staff_id,
          p_pos_session_id,
          p_expected_staff_credential_version,
          'catalog.write'
        ) is not true then
        raise exception 'POS image lease expired before intent replay'
          using errcode = '42501';
      end if;

      if v_existing.outcome_status = 'upload_required' then
        v_server_timestamp := clock_timestamp();

        select version.* into v_replay_version
        from public.inventory_product_image_versions version
        where version.id = v_existing.image_version_id
          and version.shop_id = p_shop_id
          and version.product_id = p_product_id
        for update;

        if v_replay_version.id is null
          or v_replay_version.status <> 'pending'
          or v_existing.intent_expires_at is null
          or v_existing.intent_expires_at <= v_server_timestamp
          or v_replay_version.expires_at <= v_server_timestamp then
          return jsonb_build_object(
            'ok', false,
            'code', 'intent_expired',
            'status', 'intent_expired',
            'replayed', true,
            'version_id', v_existing.image_version_id,
            'server_time',
              app_private.pos_product_image_timestamp_v1(
                v_server_timestamp
              )
          );
        end if;

        update public.inventory_product_image_versions
        set pos_upload_capability_expires_at = greatest(
          coalesce(
            pos_upload_capability_expires_at,
            v_server_timestamp
          ),
          v_server_timestamp + interval '2 hours 5 minutes'
        )
        where id = v_replay_version.id
          and status = 'pending';
      end if;

      return app_private.pos_product_image_receipt_result_v1(
        v_existing.pos_product_image_mutation_receipt_id,
        true
      );
    end if;

    v_server_timestamp := clock_timestamp();
    if app_private.pos_product_image_admit_write_v1(
        p_shop_id,
        p_staff_id,
        v_server_timestamp
      ) is not true then
      return jsonb_build_object(
        'ok', false,
        'code', 'rate_limited',
        'server_time',
          app_private.pos_product_image_timestamp_v1(
            v_server_timestamp
          )
      );
    end if;

    perform app_private.write_pos_product_image_audit_v1(
      p_shop_id,
      p_staff_id,
      p_operation_id,
      'intent',
      'idempotency_payload_mismatch',
      'blocked',
      1,
      0
    );
    return jsonb_build_object(
      'ok', false,
      'code', 'idempotency_payload_mismatch',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_server_timestamp)
    );
  end if;

  v_server_timestamp := clock_timestamp();
  if app_private.pos_product_image_admit_write_v1(
      p_shop_id,
      p_staff_id,
      v_server_timestamp
    ) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'rate_limited',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_server_timestamp)
    );
  end if;

  select product.* into v_product
  from public.inventory_products product
  where product.id = p_product_id
  for update;

  select coalesce(revision, 0)
    into v_catalog_revision
  from app_private.pos_catalog_revisions
  where shop_id = p_shop_id;
  v_catalog_revision := coalesce(v_catalog_revision, 0);
  v_server_timestamp := clock_timestamp();

  if v_product.id is null
    or app_private.product_image_product_is_in_shop(
      p_product_id,
      p_shop_id
    ) is not true then
    v_receipt_id := app_private.pos_product_image_store_receipt_v1(
      p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
      p_expected_staff_credential_version, p_schema_version, p_app_version,
      'intent', p_operation_id, p_idempotency_key, p_payload_hash,
      p_product_id, p_expected_current_version_id, null, null,
      'not_found', 'not_found', null, null, null,
      v_catalog_revision, v_server_timestamp
    );
  elsif v_product.primary_image_version_id
      is distinct from p_expected_current_version_id then
    v_receipt_id := app_private.pos_product_image_store_receipt_v1(
      p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
      p_expected_staff_credential_version, p_schema_version, p_app_version,
      'intent', p_operation_id, p_idempotency_key, p_payload_hash,
      p_product_id, p_expected_current_version_id, null,
      v_product.primary_image_version_id,
      'stale_conflict', 'stale_conflict', null, null,
      v_product.primary_image_updated_at,
      v_catalog_revision, v_server_timestamp
    );
  else
    if v_product.primary_image_version_id is not null then
      select version.* into v_current
      from public.inventory_product_image_versions version
      where version.id = v_product.primary_image_version_id
        and version.product_id = p_product_id
        and version.status = 'ready'
      for share;
    end if;

    if v_current.id is not null
      and v_current.verified_main_sha256 =
        p_main_metadata->>'sha256'
      and v_current.verified_main_bytes =
        (p_main_metadata->>'bytes')::integer
      and v_current.verified_main_width =
        (p_main_metadata->>'width')::integer
      and v_current.verified_main_height =
        (p_main_metadata->>'height')::integer
      and v_current.verified_thumb_sha256 =
        p_thumb_metadata->>'sha256'
      and v_current.verified_thumb_bytes =
        (p_thumb_metadata->>'bytes')::integer
      and v_current.verified_thumb_width =
        (p_thumb_metadata->>'width')::integer
      and v_current.verified_thumb_height =
        (p_thumb_metadata->>'height')::integer then
      v_receipt_id := app_private.pos_product_image_store_receipt_v1(
        p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
        p_expected_staff_credential_version, p_schema_version,
        p_app_version, 'intent', p_operation_id, p_idempotency_key,
        p_payload_hash, p_product_id, p_expected_current_version_id,
        v_current.id, v_current.id, 'noop', 'success', null, null,
        v_product.primary_image_updated_at,
        v_catalog_revision, v_server_timestamp
      );
    else
      update public.inventory_product_image_versions
        set status = 'failed',
            cleanup_status = 'pending',
            cleanup_last_error_code = 'replaced_by_new_intent',
            cleanup_updated_at = v_server_timestamp
        where product_id = p_product_id
          and shop_id = p_shop_id
          and status = 'pending';

        v_version_id := gen_random_uuid();
        v_expires_at := v_server_timestamp + interval '2 hours';
        v_main_path := format(
          'shops/%s/products/%s/primary/%s/main.jpg',
          p_shop_id,
          p_product_id,
          v_version_id
        );
        v_thumb_path := format(
          'shops/%s/products/%s/primary/%s/thumb.jpg',
          p_shop_id,
          p_product_id,
          v_version_id
        );

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
          requested_by_staff_id,
          requested_by_shop_device_id,
          requested_by_pos_session_id,
          actor_kind,
          created_at,
          expires_at,
          pos_upload_capability_expires_at
        )
        values (
          v_version_id,
          p_shop_id,
          p_product_id,
          p_expected_current_version_id,
          v_main_path,
          v_thumb_path,
          p_main_metadata->>'sha256',
          (p_main_metadata->>'bytes')::integer,
          (p_main_metadata->>'width')::integer,
          (p_main_metadata->>'height')::integer,
          p_thumb_metadata->>'sha256',
          (p_thumb_metadata->>'bytes')::integer,
          (p_thumb_metadata->>'width')::integer,
          (p_thumb_metadata->>'height')::integer,
          null,
          p_staff_id,
          p_shop_device_id,
          p_pos_session_id,
          'pos_staff',
          v_server_timestamp,
          v_expires_at,
          v_server_timestamp + interval '2 hours 5 minutes'
        );

        v_receipt_id := app_private.pos_product_image_store_receipt_v1(
          p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
          p_expected_staff_credential_version, p_schema_version,
          p_app_version, 'intent', p_operation_id, p_idempotency_key,
          p_payload_hash, p_product_id, p_expected_current_version_id,
          v_version_id, p_expected_current_version_id,
          'upload_required', 'success', null, v_expires_at,
          v_product.primary_image_updated_at,
          v_catalog_revision, v_server_timestamp
        );
    end if;
  end if;

  perform app_private.write_pos_product_image_audit_v1(
    p_shop_id,
    p_staff_id,
    p_operation_id,
    'intent',
    (
      select receipt.outcome_code
      from public.pos_product_image_mutation_receipts receipt
      where receipt.pos_product_image_mutation_receipt_id = v_receipt_id
    ),
    case when (
      select receipt.outcome_status
      from public.pos_product_image_mutation_receipts receipt
      where receipt.pos_product_image_mutation_receipt_id = v_receipt_id
    ) in ('upload_required', 'noop') then 'success' else 'blocked' end,
    1,
    case when v_version_id is null then 0 else 2 end
  );

  if app_private.pos_product_image_access_is_valid_v1(
      p_shop_id,
      p_shop_device_id,
      p_staff_id,
      p_pos_session_id,
      p_expected_staff_credential_version,
      'catalog.write'
    ) is not true then
    raise exception 'POS image lease expired before intent publication'
      using errcode = '42501';
  end if;

  return app_private.pos_product_image_receipt_result_v1(
    v_receipt_id,
    false
  );
end;
$$;

revoke all on function public.pos_product_image_intent_v1(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text,
  uuid, uuid, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.pos_product_image_intent_v1(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text,
  uuid, uuid, jsonb, jsonb
) to service_role;

create or replace function public.pos_product_image_finalize_prepare_v1(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_expected_staff_credential_version integer,
  p_schema_version text,
  p_app_version text,
  p_operation_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_product_id uuid,
  p_expected_current_version_id uuid,
  p_version_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_catalog_revision bigint := 0;
  v_existing public.pos_product_image_mutation_receipts%rowtype;
  v_product public.inventory_products%rowtype;
  v_receipt_id uuid;
  v_server_timestamp timestamptz := clock_timestamp();
  v_version public.inventory_product_image_versions%rowtype;
begin
  if p_shop_id is null
    or p_shop_device_id is null
    or p_staff_id is null
    or p_pos_session_id is null
    or p_product_id is null
    or p_version_id is null
    or app_private.pos_product_image_envelope_is_valid_v1(
      p_schema_version,
      p_app_version,
      p_operation_id,
      p_idempotency_key,
      p_payload_hash
    ) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'validation_failed',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_server_timestamp)
    );
  end if;

  if app_private.pos_product_image_access_is_valid_v1(
      p_shop_id,
      p_shop_device_id,
      p_staff_id,
      p_pos_session_id,
      p_expected_staff_credential_version,
      'catalog.write'
    ) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'auth_denied',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_server_timestamp)
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:lifecycle',
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:operation:' || p_operation_id,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:idempotency:' ||
      p_idempotency_key,
    0
  ));

  select receipt.* into v_existing
  from public.pos_product_image_mutation_receipts receipt
  where receipt.shop_id = p_shop_id
    and (
      receipt.operation_id = p_operation_id
      or receipt.idempotency_key = p_idempotency_key
    )
  order by
    (receipt.operation_id = p_operation_id) desc,
    (receipt.idempotency_key = p_idempotency_key) desc
  limit 1
  for share;

  if found then
    if v_existing.operation = 'finalize'
      and v_existing.operation_id = p_operation_id
      and v_existing.idempotency_key = p_idempotency_key
      and v_existing.payload_hash = p_payload_hash
      and v_existing.schema_version = p_schema_version
      and v_existing.shop_device_id = p_shop_device_id
      and v_existing.pos_session_id = p_pos_session_id
      and v_existing.staff_id = p_staff_id
      and v_existing.staff_credential_version =
        p_expected_staff_credential_version
      and v_existing.product_id = p_product_id
      and v_existing.expected_current_version_id
        is not distinct from p_expected_current_version_id
      and (
        v_existing.image_version_id = p_version_id
        or (
          v_existing.image_version_id is null
          and v_existing.outcome_status = 'not_found'
        )
      ) then
      if app_private.pos_product_image_access_is_valid_v1(
          p_shop_id,
          p_shop_device_id,
          p_staff_id,
          p_pos_session_id,
          p_expected_staff_credential_version,
          'catalog.write'
        ) is not true then
        raise exception 'POS image lease expired before finalize replay'
          using errcode = '42501';
      end if;
      return app_private.pos_product_image_receipt_result_v1(
        v_existing.pos_product_image_mutation_receipt_id,
        true
      );
    end if;

    v_server_timestamp := clock_timestamp();
    if app_private.pos_product_image_admit_write_v1(
        p_shop_id,
        p_staff_id,
        v_server_timestamp
      ) is not true then
      return jsonb_build_object(
        'ok', false,
        'code', 'rate_limited',
        'server_time',
          app_private.pos_product_image_timestamp_v1(
            v_server_timestamp
          )
      );
    end if;

    perform app_private.write_pos_product_image_audit_v1(
      p_shop_id,
      p_staff_id,
      p_operation_id,
      'finalize',
      'idempotency_payload_mismatch',
      'blocked',
      1,
      0
    );
    return jsonb_build_object(
      'ok', false,
      'code', 'idempotency_payload_mismatch',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_server_timestamp)
    );
  end if;

  v_server_timestamp := clock_timestamp();
  if app_private.pos_product_image_admit_write_v1(
      p_shop_id,
      p_staff_id,
      v_server_timestamp
    ) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'rate_limited',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_server_timestamp)
    );
  end if;

  select product.* into v_product
  from public.inventory_products product
  where product.id = p_product_id
  for update;

  select coalesce(revision, 0)
    into v_catalog_revision
  from app_private.pos_catalog_revisions
  where shop_id = p_shop_id;
  v_catalog_revision := coalesce(v_catalog_revision, 0);

  if v_product.id is null
    or app_private.product_image_product_is_in_shop(
      p_product_id,
      p_shop_id
    ) is not true then
    v_receipt_id := app_private.pos_product_image_store_receipt_v1(
      p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
      p_expected_staff_credential_version, p_schema_version, p_app_version,
      'finalize', p_operation_id, p_idempotency_key, p_payload_hash,
      p_product_id, p_expected_current_version_id, null, null,
      'not_found', 'product_not_found', null, null, null,
      v_catalog_revision, v_server_timestamp
    );
  else
    select version.* into v_version
    from public.inventory_product_image_versions version
    where version.id = p_version_id
      and version.product_id = p_product_id
      and version.shop_id = p_shop_id
    for update;

    if v_version.id is null
      or v_version.actor_kind <> 'pos_staff'
      or v_version.requested_by_staff_id <> p_staff_id
      or v_version.requested_by_shop_device_id <> p_shop_device_id
      or v_version.requested_by_pos_session_id <> p_pos_session_id then
      v_receipt_id := app_private.pos_product_image_store_receipt_v1(
        p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
        p_expected_staff_credential_version, p_schema_version,
        p_app_version, 'finalize', p_operation_id, p_idempotency_key,
        p_payload_hash, p_product_id, p_expected_current_version_id,
        null, v_product.primary_image_version_id,
        'not_found', 'version_not_found', null, null,
        v_product.primary_image_updated_at,
        v_catalog_revision, v_server_timestamp
      );
    elsif v_version.status = 'ready'
      and v_product.primary_image_version_id = p_version_id
      and v_version.previous_version_id
        is not distinct from p_expected_current_version_id then
      v_receipt_id := app_private.pos_product_image_store_receipt_v1(
        p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
        p_expected_staff_credential_version, p_schema_version,
        p_app_version, 'finalize', p_operation_id, p_idempotency_key,
        p_payload_hash, p_product_id, p_expected_current_version_id,
        p_version_id, p_version_id, 'finalized', 'success', null, null,
        v_product.primary_image_updated_at,
        v_catalog_revision, v_server_timestamp
      );
    elsif v_version.status <> 'pending' then
      v_receipt_id := app_private.pos_product_image_store_receipt_v1(
        p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
        p_expected_staff_credential_version, p_schema_version,
        p_app_version, 'finalize', p_operation_id, p_idempotency_key,
        p_payload_hash, p_product_id, p_expected_current_version_id,
        p_version_id, v_product.primary_image_version_id,
        'invalid_state', 'invalid_state', null, null,
        v_product.primary_image_updated_at,
        v_catalog_revision, v_server_timestamp
      );
    elsif v_version.expires_at <= v_server_timestamp then
      update public.inventory_product_image_versions
      set status = 'failed',
          cleanup_status = 'pending',
          cleanup_last_error_code = 'intent_expired',
          cleanup_updated_at = v_server_timestamp
      where id = p_version_id
        and status = 'pending';

      v_receipt_id := app_private.pos_product_image_store_receipt_v1(
        p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
        p_expected_staff_credential_version, p_schema_version,
        p_app_version, 'finalize', p_operation_id, p_idempotency_key,
        p_payload_hash, p_product_id, p_expected_current_version_id,
        p_version_id, v_product.primary_image_version_id,
        'intent_expired', 'intent_expired', null, null,
        v_product.primary_image_updated_at,
        v_catalog_revision, v_server_timestamp
      );
    elsif v_version.previous_version_id
        is distinct from p_expected_current_version_id
      or v_product.primary_image_version_id
        is distinct from p_expected_current_version_id then
      update public.inventory_product_image_versions
      set status = 'failed',
          cleanup_status = 'pending',
          cleanup_last_error_code = 'stale_conflict',
          cleanup_updated_at = v_server_timestamp
      where id = p_version_id
        and status = 'pending';

      v_receipt_id := app_private.pos_product_image_store_receipt_v1(
        p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
        p_expected_staff_credential_version, p_schema_version,
        p_app_version, 'finalize', p_operation_id, p_idempotency_key,
        p_payload_hash, p_product_id, p_expected_current_version_id,
        p_version_id, v_product.primary_image_version_id,
        'stale_conflict', 'expected_version_conflict', null, null,
        v_product.primary_image_updated_at,
        v_catalog_revision, v_server_timestamp
      );
    else
      if app_private.pos_product_image_access_is_valid_v1(
          p_shop_id,
          p_shop_device_id,
          p_staff_id,
          p_pos_session_id,
          p_expected_staff_credential_version,
          'catalog.write'
        ) is not true then
        raise exception 'POS image lease expired before finalize validation'
          using errcode = '42501';
      end if;

      return jsonb_build_object(
        'ok', true,
        'code', 'success',
        'status', 'validation_required',
        'replayed', false,
        'version_id', p_version_id,
        'main_path', v_version.main_path,
        'thumb_path', v_version.thumb_path,
        'expires_at',
          app_private.pos_product_image_timestamp_v1(v_version.expires_at),
        'expected_main', jsonb_build_object(
          'sha256', v_version.expected_main_sha256,
          'bytes', v_version.expected_main_bytes,
          'width', v_version.expected_main_width,
          'height', v_version.expected_main_height,
          'mimeType', v_version.expected_main_mime_type
        ),
        'expected_thumb', jsonb_build_object(
          'sha256', v_version.expected_thumb_sha256,
          'bytes', v_version.expected_thumb_bytes,
          'width', v_version.expected_thumb_width,
          'height', v_version.expected_thumb_height,
          'mimeType', v_version.expected_thumb_mime_type
        ),
        'server_time',
          app_private.pos_product_image_timestamp_v1(v_server_timestamp)
      );
    end if;
  end if;

  perform app_private.write_pos_product_image_audit_v1(
    p_shop_id,
    p_staff_id,
    p_operation_id,
    'finalize',
    (
      select receipt.outcome_code
      from public.pos_product_image_mutation_receipts receipt
      where receipt.pos_product_image_mutation_receipt_id = v_receipt_id
    ),
    case when (
      select receipt.outcome_status
      from public.pos_product_image_mutation_receipts receipt
      where receipt.pos_product_image_mutation_receipt_id = v_receipt_id
    ) = 'finalized' then 'success' else 'blocked' end,
    1,
    0
  );

  if app_private.pos_product_image_access_is_valid_v1(
      p_shop_id,
      p_shop_device_id,
      p_staff_id,
      p_pos_session_id,
      p_expected_staff_credential_version,
      'catalog.write'
    ) is not true then
    raise exception 'POS image lease expired before finalize prepare result'
      using errcode = '42501';
  end if;

  return app_private.pos_product_image_receipt_result_v1(
    v_receipt_id,
    false
  );
end;
$$;

revoke all on function public.pos_product_image_finalize_prepare_v1(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text,
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.pos_product_image_finalize_prepare_v1(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text,
  uuid, uuid, uuid
) to service_role;

create or replace function
  app_private.pos_product_image_validation_code_is_valid_v1(
    p_code text
  )
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(p_code in (
    'storage_object_missing',
    'jpeg_mime_invalid',
    'jpeg_byte_count_mismatch',
    'jpeg_dimensions_invalid',
    'jpeg_checksum_mismatch',
    'jpeg_magic_invalid',
    'jpeg_metadata_forbidden',
    'jpeg_structure_invalid',
    'jpeg_truncated',
    'jpeg_aspect_ratio_mismatch'
  ), false);
$$;

revoke all on function
  app_private.pos_product_image_validation_code_is_valid_v1(text)
  from public, anon, authenticated, service_role;

create or replace function public.pos_product_image_finalize_commit_v1(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_expected_staff_credential_version integer,
  p_schema_version text,
  p_app_version text,
  p_operation_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_product_id uuid,
  p_expected_current_version_id uuid,
  p_version_id uuid,
  p_validation_ok boolean,
  p_validation_code text,
  p_verified_main jsonb,
  p_verified_thumb jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_catalog_revision bigint := 0;
  v_changed_at timestamptz := clock_timestamp();
  v_existing public.pos_product_image_mutation_receipts%rowtype;
  v_previous_version_id uuid;
  v_product public.inventory_products%rowtype;
  v_receipt_id uuid;
  v_row_count integer;
  v_sync_event_id bigint;
  v_version public.inventory_product_image_versions%rowtype;
begin
  if p_shop_id is null
    or p_shop_device_id is null
    or p_staff_id is null
    or p_pos_session_id is null
    or p_product_id is null
    or p_version_id is null
    or p_validation_ok is null
    or app_private.pos_product_image_envelope_is_valid_v1(
      p_schema_version,
      p_app_version,
      p_operation_id,
      p_idempotency_key,
      p_payload_hash
    ) is not true
    or (
      p_validation_ok
      and (
        p_validation_code is not null
        or app_private.pos_product_image_metadata_is_valid_v1(
          p_verified_main,
          'main'
        ) is not true
        or app_private.pos_product_image_metadata_is_valid_v1(
          p_verified_thumb,
          'thumb'
        ) is not true
      )
    )
    or (
      not p_validation_ok
      and (
        app_private.pos_product_image_validation_code_is_valid_v1(
          p_validation_code
        ) is not true
        or p_verified_main is not null
        or p_verified_thumb is not null
      )
    ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'validation_failed',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_changed_at)
    );
  end if;

  if app_private.pos_product_image_access_is_valid_v1(
      p_shop_id,
      p_shop_device_id,
      p_staff_id,
      p_pos_session_id,
      p_expected_staff_credential_version,
      'catalog.write'
    ) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'auth_denied',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_changed_at)
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:lifecycle',
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:operation:' || p_operation_id,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:idempotency:' ||
      p_idempotency_key,
    0
  ));

  select receipt.* into v_existing
  from public.pos_product_image_mutation_receipts receipt
  where receipt.shop_id = p_shop_id
    and (
      receipt.operation_id = p_operation_id
      or receipt.idempotency_key = p_idempotency_key
    )
  order by
    (receipt.operation_id = p_operation_id) desc,
    (receipt.idempotency_key = p_idempotency_key) desc
  limit 1
  for share;

  if found then
    if v_existing.operation = 'finalize'
      and v_existing.operation_id = p_operation_id
      and v_existing.idempotency_key = p_idempotency_key
      and v_existing.payload_hash = p_payload_hash
      and v_existing.schema_version = p_schema_version
      and v_existing.shop_device_id = p_shop_device_id
      and v_existing.pos_session_id = p_pos_session_id
      and v_existing.staff_id = p_staff_id
      and v_existing.staff_credential_version =
        p_expected_staff_credential_version
      and v_existing.product_id = p_product_id
      and v_existing.expected_current_version_id
        is not distinct from p_expected_current_version_id
      and (
        v_existing.image_version_id = p_version_id
        or (
          v_existing.image_version_id is null
          and v_existing.outcome_status = 'not_found'
        )
      ) then
      if app_private.pos_product_image_access_is_valid_v1(
          p_shop_id,
          p_shop_device_id,
          p_staff_id,
          p_pos_session_id,
          p_expected_staff_credential_version,
          'catalog.write'
        ) is not true then
        raise exception 'POS image lease expired before finalize commit replay'
          using errcode = '42501';
      end if;
      return app_private.pos_product_image_receipt_result_v1(
        v_existing.pos_product_image_mutation_receipt_id,
        true
      );
    end if;

    v_changed_at := clock_timestamp();
    if app_private.pos_product_image_admit_write_v1(
        p_shop_id,
        p_staff_id,
        v_changed_at
      ) is not true then
      return jsonb_build_object(
        'ok', false,
        'code', 'rate_limited',
        'server_time',
          app_private.pos_product_image_timestamp_v1(v_changed_at)
      );
    end if;

    perform app_private.write_pos_product_image_audit_v1(
      p_shop_id,
      p_staff_id,
      p_operation_id,
      'finalize',
      'idempotency_payload_mismatch',
      'blocked',
      1,
      0
    );
    return jsonb_build_object(
      'ok', false,
      'code', 'idempotency_payload_mismatch',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_changed_at)
    );
  end if;

  v_changed_at := clock_timestamp();
  if app_private.pos_product_image_admit_write_v1(
      p_shop_id,
      p_staff_id,
      v_changed_at
    ) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'rate_limited',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_changed_at)
    );
  end if;

  select product.* into v_product
  from public.inventory_products product
  where product.id = p_product_id
  for update;

  select coalesce(revision, 0)
    into v_catalog_revision
  from app_private.pos_catalog_revisions
  where shop_id = p_shop_id;
  v_catalog_revision := coalesce(v_catalog_revision, 0);

  if v_product.id is null
    or app_private.product_image_product_is_in_shop(
      p_product_id,
      p_shop_id
    ) is not true then
    v_receipt_id := app_private.pos_product_image_store_receipt_v1(
      p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
      p_expected_staff_credential_version, p_schema_version, p_app_version,
      'finalize', p_operation_id, p_idempotency_key, p_payload_hash,
      p_product_id, p_expected_current_version_id, null, null,
      'not_found', 'product_not_found', null, null, null,
      v_catalog_revision, v_changed_at
    );
  else
    select version.* into v_version
    from public.inventory_product_image_versions version
    where version.id = p_version_id
      and version.product_id = p_product_id
      and version.shop_id = p_shop_id
    for update;

    if v_version.id is null
      or v_version.actor_kind <> 'pos_staff'
      or v_version.requested_by_staff_id <> p_staff_id
      or v_version.requested_by_shop_device_id <> p_shop_device_id
      or v_version.requested_by_pos_session_id <> p_pos_session_id then
      v_receipt_id := app_private.pos_product_image_store_receipt_v1(
        p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
        p_expected_staff_credential_version, p_schema_version,
        p_app_version, 'finalize', p_operation_id, p_idempotency_key,
        p_payload_hash, p_product_id, p_expected_current_version_id,
        null, v_product.primary_image_version_id,
        'not_found', 'version_not_found', null, null,
        v_product.primary_image_updated_at,
        v_catalog_revision, v_changed_at
      );
    elsif v_version.status = 'ready'
      and v_product.primary_image_version_id = p_version_id
      and v_version.previous_version_id
        is not distinct from p_expected_current_version_id then
      v_receipt_id := app_private.pos_product_image_store_receipt_v1(
        p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
        p_expected_staff_credential_version, p_schema_version,
        p_app_version, 'finalize', p_operation_id, p_idempotency_key,
        p_payload_hash, p_product_id, p_expected_current_version_id,
        p_version_id, p_version_id, 'finalized', 'success', null, null,
        v_product.primary_image_updated_at,
        v_catalog_revision, v_changed_at
      );
    elsif v_version.status <> 'pending' then
      v_receipt_id := app_private.pos_product_image_store_receipt_v1(
        p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
        p_expected_staff_credential_version, p_schema_version,
        p_app_version, 'finalize', p_operation_id, p_idempotency_key,
        p_payload_hash, p_product_id, p_expected_current_version_id,
        p_version_id, v_product.primary_image_version_id,
        'invalid_state', 'invalid_state', null, null,
        v_product.primary_image_updated_at,
        v_catalog_revision, v_changed_at
      );
    elsif v_version.expires_at <= v_changed_at then
      update public.inventory_product_image_versions
      set status = 'failed',
          cleanup_status = 'pending',
          cleanup_last_error_code = 'intent_expired',
          cleanup_updated_at = v_changed_at
      where id = p_version_id
        and status = 'pending';

      v_receipt_id := app_private.pos_product_image_store_receipt_v1(
        p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
        p_expected_staff_credential_version, p_schema_version,
        p_app_version, 'finalize', p_operation_id, p_idempotency_key,
        p_payload_hash, p_product_id, p_expected_current_version_id,
        p_version_id, v_product.primary_image_version_id,
        'intent_expired', 'intent_expired', null, null,
        v_product.primary_image_updated_at,
        v_catalog_revision, v_changed_at
      );
    elsif v_version.previous_version_id
        is distinct from p_expected_current_version_id
      or v_product.primary_image_version_id
        is distinct from p_expected_current_version_id then
      update public.inventory_product_image_versions
      set status = 'failed',
          cleanup_status = 'pending',
          cleanup_last_error_code = 'stale_conflict',
          cleanup_updated_at = v_changed_at
      where id = p_version_id
        and status = 'pending';

      v_receipt_id := app_private.pos_product_image_store_receipt_v1(
        p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
        p_expected_staff_credential_version, p_schema_version,
        p_app_version, 'finalize', p_operation_id, p_idempotency_key,
        p_payload_hash, p_product_id, p_expected_current_version_id,
        p_version_id, v_product.primary_image_version_id,
        'stale_conflict', 'expected_version_conflict', null, null,
        v_product.primary_image_updated_at,
        v_catalog_revision, v_changed_at
      );
    elsif not p_validation_ok then
      update public.inventory_product_image_versions
      set status = 'failed',
          cleanup_status = 'pending',
          cleanup_last_error_code = p_validation_code,
          cleanup_updated_at = v_changed_at
      where id = p_version_id
        and status = 'pending';

      v_receipt_id := app_private.pos_product_image_store_receipt_v1(
        p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
        p_expected_staff_credential_version, p_schema_version,
        p_app_version, 'finalize', p_operation_id, p_idempotency_key,
        p_payload_hash, p_product_id, p_expected_current_version_id,
        p_version_id, v_product.primary_image_version_id,
        'validation_failed', p_validation_code, p_validation_code,
        null, v_product.primary_image_updated_at,
        v_catalog_revision, v_changed_at
      );
    elsif p_verified_main->>'sha256' <>
        v_version.expected_main_sha256
      or (p_verified_main->>'bytes')::integer <>
        v_version.expected_main_bytes
      or (p_verified_main->>'width')::integer <>
        v_version.expected_main_width
      or (p_verified_main->>'height')::integer <>
        v_version.expected_main_height
      or p_verified_main->>'mimeType' <>
        v_version.expected_main_mime_type
      or p_verified_thumb->>'sha256' <>
        v_version.expected_thumb_sha256
      or (p_verified_thumb->>'bytes')::integer <>
        v_version.expected_thumb_bytes
      or (p_verified_thumb->>'width')::integer <>
        v_version.expected_thumb_width
      or (p_verified_thumb->>'height')::integer <>
        v_version.expected_thumb_height
      or p_verified_thumb->>'mimeType' <>
        v_version.expected_thumb_mime_type then
      update public.inventory_product_image_versions
      set status = 'failed',
          cleanup_status = 'pending',
          cleanup_last_error_code = 'validation_failed',
          cleanup_updated_at = v_changed_at
      where id = p_version_id
        and status = 'pending';

      v_receipt_id := app_private.pos_product_image_store_receipt_v1(
        p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
        p_expected_staff_credential_version, p_schema_version,
        p_app_version, 'finalize', p_operation_id, p_idempotency_key,
        p_payload_hash, p_product_id, p_expected_current_version_id,
        p_version_id, v_product.primary_image_version_id,
        'validation_failed', 'validation_failed', 'validation_failed',
        null, v_product.primary_image_updated_at,
        v_catalog_revision, v_changed_at
      );
    else
      v_previous_version_id := v_version.previous_version_id;

      if v_previous_version_id is not null then
        update public.inventory_product_image_versions
        set status = 'superseded',
            superseded_at = v_changed_at,
            cleanup_status = 'pending',
            cleanup_updated_at = v_changed_at
        where id = v_previous_version_id
          and product_id = p_product_id
          and shop_id = p_shop_id
          and status = 'ready';
        get diagnostics v_row_count = row_count;
        if v_row_count <> 1 then
          raise exception 'POS image prior version publication fence failed'
            using errcode = '55000';
        end if;
      end if;

      update public.inventory_product_image_versions
      set status = 'ready',
          verified_main_sha256 = p_verified_main->>'sha256',
          verified_main_bytes =
            (p_verified_main->>'bytes')::integer,
          verified_main_width =
            (p_verified_main->>'width')::integer,
          verified_main_height =
            (p_verified_main->>'height')::integer,
          verified_main_mime_type = p_verified_main->>'mimeType',
          verified_thumb_sha256 = p_verified_thumb->>'sha256',
          verified_thumb_bytes =
            (p_verified_thumb->>'bytes')::integer,
          verified_thumb_width =
            (p_verified_thumb->>'width')::integer,
          verified_thumb_height =
            (p_verified_thumb->>'height')::integer,
          verified_thumb_mime_type = p_verified_thumb->>'mimeType',
          finalized_by_profile_id = null,
          finalized_by_staff_id = p_staff_id,
          finalized_by_shop_device_id = p_shop_device_id,
          finalized_by_pos_session_id = p_pos_session_id,
          finalized_at = v_changed_at,
          cleanup_status = 'not_due',
          cleanup_last_error_code = null,
          cleanup_updated_at = null
      where id = p_version_id
        and status = 'pending';
      get diagnostics v_row_count = row_count;
      if v_row_count <> 1 then
        raise exception 'POS image version publication fence failed'
          using errcode = '55000';
      end if;

      update public.inventory_products
      set primary_image_version_id = p_version_id,
          primary_image_updated_at = v_changed_at,
          updated_at = v_changed_at
      where id = p_product_id
        and primary_image_version_id
          is not distinct from p_expected_current_version_id;
      get diagnostics v_row_count = row_count;
      if v_row_count <> 1 then
        raise exception 'POS image product CAS publication failed'
          using errcode = '40001';
      end if;

      v_sync_event_id := app_private.emit_product_image_sync_event(
        p_shop_id,
        p_product_id,
        p_version_id,
        'image_finalize',
        'pos_staff'
      );
      if v_sync_event_id is null then
        raise exception 'POS image catalog event publication failed'
          using errcode = '55000';
      end if;

      select coalesce(revision, 0)
        into v_catalog_revision
      from app_private.pos_catalog_revisions
      where shop_id = p_shop_id;
      v_catalog_revision := coalesce(v_catalog_revision, 0);

      v_receipt_id := app_private.pos_product_image_store_receipt_v1(
        p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
        p_expected_staff_credential_version, p_schema_version,
        p_app_version, 'finalize', p_operation_id, p_idempotency_key,
        p_payload_hash, p_product_id, p_expected_current_version_id,
        p_version_id, p_version_id, 'finalized', 'success', null, null,
        v_changed_at, v_catalog_revision, v_changed_at
      );
    end if;
  end if;

  perform app_private.write_pos_product_image_audit_v1(
    p_shop_id,
    p_staff_id,
    p_operation_id,
    'finalize',
    (
      select receipt.outcome_code
      from public.pos_product_image_mutation_receipts receipt
      where receipt.pos_product_image_mutation_receipt_id = v_receipt_id
    ),
    case when (
      select receipt.outcome_status
      from public.pos_product_image_mutation_receipts receipt
      where receipt.pos_product_image_mutation_receipt_id = v_receipt_id
    ) = 'finalized' then 'success' else 'blocked' end,
    1,
    case when (
      select receipt.outcome_status
      from public.pos_product_image_mutation_receipts receipt
      where receipt.pos_product_image_mutation_receipt_id = v_receipt_id
    ) in ('finalized', 'validation_failed') then 2 else 0 end
  );

  if app_private.pos_product_image_access_is_valid_v1(
      p_shop_id,
      p_shop_device_id,
      p_staff_id,
      p_pos_session_id,
      p_expected_staff_credential_version,
      'catalog.write'
    ) is not true then
    raise exception 'POS image lease expired before finalize publication'
      using errcode = '42501';
  end if;

  return app_private.pos_product_image_receipt_result_v1(
    v_receipt_id,
    false
  );
end;
$$;

revoke all on function public.pos_product_image_finalize_commit_v1(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text,
  uuid, uuid, uuid, boolean, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.pos_product_image_finalize_commit_v1(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text,
  uuid, uuid, uuid, boolean, text, jsonb, jsonb
) to service_role;

create or replace function public.pos_product_image_read_resolve_v1(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_expected_staff_credential_version integer,
  p_schema_version text,
  p_app_version text,
  p_refs jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
  v_server_timestamp timestamptz := clock_timestamp();
begin
  if p_shop_id is null
    or p_shop_device_id is null
    or p_staff_id is null
    or p_pos_session_id is null
    or p_schema_version is null
    or p_app_version is null
    or p_schema_version <> 'pos-product-image-v1'
    or length(p_app_version) not between 1 and 80
    or p_app_version ~ '[[:cntrl:]]' then
    return jsonb_build_object(
      'ok', false,
      'code', 'validation_failed',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_server_timestamp)
    );
  end if;

  if app_private.pos_product_image_access_is_valid_v1(
      p_shop_id,
      p_shop_device_id,
      p_staff_id,
      p_pos_session_id,
      p_expected_staff_credential_version,
      'catalog.read'
    ) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'auth_denied',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_server_timestamp)
    );
  end if;

  if p_refs is null
    or jsonb_typeof(p_refs) <> 'array'
    or pg_column_size(p_refs) > 16384
    or jsonb_array_length(p_refs) not between 1 and 16
    or exists (
      select 1
      from jsonb_array_elements(p_refs) ref
      where jsonb_typeof(ref) <> 'object'
        or (select count(*) from jsonb_object_keys(ref)) <> 3
        or not ref ?& array['productId', 'versionId', 'variant']
        or coalesce(ref->>'productId', '') !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(ref->>'versionId', '') !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(ref->>'variant', '') not in ('main', 'thumb')
    )
    or exists (
      select 1
      from jsonb_array_elements(p_refs) ref
      group by
        lower(ref->>'productId'),
        lower(ref->>'versionId'),
        ref->>'variant'
      having count(*) > 1
    ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'validation_failed',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_server_timestamp)
    );
  end if;

  with requested as (
    select
      ref.ordinality,
      ref.value->>'productId' as product_id_text,
      (ref.value->>'productId')::uuid as product_id,
      ref.value->>'versionId' as version_id_text,
      (ref.value->>'versionId')::uuid as version_id,
      ref.value->>'variant' as variant
    from jsonb_array_elements(p_refs)
      with ordinality as ref(value, ordinality)
  ),
  resolved as (
    select
      requested.ordinality,
      requested.product_id_text,
      requested.version_id_text,
      requested.variant,
      case when product.id is not null then version.id end
        as resolved_version_id,
      version.main_path,
      version.thumb_path,
      version.verified_main_sha256,
      version.verified_main_bytes,
      version.verified_main_width,
      version.verified_main_height,
      version.verified_main_mime_type,
      version.verified_thumb_sha256,
      version.verified_thumb_bytes,
      version.verified_thumb_width,
      version.verified_thumb_height,
      version.verified_thumb_mime_type
    from requested
    left join public.inventory_product_image_versions version
      on version.id = requested.version_id
     and version.product_id = requested.product_id
     and version.shop_id = p_shop_id
     and version.status = 'ready'
    left join public.inventory_products product
      on product.id = requested.product_id
     and product.primary_image_version_id = version.id
     and product.deleted_at is null
     and app_private.product_image_product_is_in_shop(
       requested.product_id,
       p_shop_id
     )
  )
  select jsonb_agg(
    jsonb_build_object(
      'code', case
        when resolved.resolved_version_id is null
          then 'not_found'
        else 'success'
      end,
      'product_id', resolved.product_id_text,
      'version_id', resolved.version_id_text,
      'variant', resolved.variant,
      'object_path', case
        when resolved.resolved_version_id is null then null
        when resolved.variant = 'main' then resolved.main_path
        else resolved.thumb_path
      end,
      'verified_sha256', case
        when resolved.resolved_version_id is null then null
        when resolved.variant = 'main'
          then resolved.verified_main_sha256
        else resolved.verified_thumb_sha256
      end,
      'verified_bytes', case
        when resolved.resolved_version_id is null then null
        when resolved.variant = 'main'
          then resolved.verified_main_bytes
        else resolved.verified_thumb_bytes
      end,
      'verified_width', case
        when resolved.resolved_version_id is null then null
        when resolved.variant = 'main'
          then resolved.verified_main_width
        else resolved.verified_thumb_width
      end,
      'verified_height', case
        when resolved.resolved_version_id is null then null
        when resolved.variant = 'main'
          then resolved.verified_main_height
        else resolved.verified_thumb_height
      end,
      'verified_mime_type', case
        when resolved.resolved_version_id is null then null
        when resolved.variant = 'main'
          then resolved.verified_main_mime_type
        else resolved.verified_thumb_mime_type
      end
    )
    order by resolved.ordinality
  )
  into v_items
  from resolved;

  if app_private.pos_product_image_access_is_valid_v1(
      p_shop_id,
      p_shop_device_id,
      p_staff_id,
      p_pos_session_id,
      p_expected_staff_credential_version,
      'catalog.read'
    ) is not true then
    raise exception 'POS image lease expired before read path publication'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'items', coalesce(v_items, '[]'::jsonb),
    'server_time',
      app_private.pos_product_image_timestamp_v1(v_server_timestamp)
  );
end;
$$;

revoke all on function public.pos_product_image_read_resolve_v1(
  uuid, uuid, uuid, uuid, integer, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.pos_product_image_read_resolve_v1(
  uuid, uuid, uuid, uuid, integer, text, text, jsonb
) to service_role;

create or replace function public.pos_product_image_read_authorize_v1(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_expected_staff_credential_version integer,
  p_schema_version text,
  p_app_version text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_server_timestamp timestamptz := clock_timestamp();
begin
  if p_shop_id is null
    or p_shop_device_id is null
    or p_staff_id is null
    or p_pos_session_id is null
    or p_schema_version is null
    or p_app_version is null
    or p_schema_version <> 'pos-product-image-v1'
    or length(p_app_version) not between 1 and 80
    or p_app_version ~ '[[:cntrl:]]' then
    return jsonb_build_object(
      'ok', false,
      'code', 'validation_failed',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_server_timestamp)
    );
  end if;

  if app_private.pos_runtime_lease_is_valid_v1(
      p_shop_id,
      p_shop_device_id,
      p_staff_id,
      p_pos_session_id
    ) is not true
    or not exists (
      select 1
      from public.staff_accounts staff
      where staff.staff_id = p_staff_id
        and staff.shop_id = p_shop_id
        and staff.credential_version =
          p_expected_staff_credential_version
    ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'auth_denied',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_server_timestamp)
    );
  end if;

  if app_private.pos_product_image_access_is_valid_v1(
      p_shop_id,
      p_shop_device_id,
      p_staff_id,
      p_pos_session_id,
      p_expected_staff_credential_version,
      'catalog.read'
    ) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'permission_denied',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_server_timestamp)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'authorized',
    'server_time',
      app_private.pos_product_image_timestamp_v1(v_server_timestamp)
  );
end;
$$;

revoke all on function public.pos_product_image_read_authorize_v1(
  uuid, uuid, uuid, uuid, integer, text, text
) from public, anon, authenticated;
grant execute on function public.pos_product_image_read_authorize_v1(
  uuid, uuid, uuid, uuid, integer, text, text
) to service_role;

create or replace function public.pos_product_image_remove_v1(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_expected_staff_credential_version integer,
  p_schema_version text,
  p_app_version text,
  p_operation_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_product_id uuid,
  p_expected_current_version_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_catalog_revision bigint := 0;
  v_changed_at timestamptz := clock_timestamp();
  v_existing public.pos_product_image_mutation_receipts%rowtype;
  v_product public.inventory_products%rowtype;
  v_receipt_id uuid;
  v_row_count integer;
  v_sync_event_id bigint;
  v_version public.inventory_product_image_versions%rowtype;
begin
  if p_shop_id is null
    or p_shop_device_id is null
    or p_staff_id is null
    or p_pos_session_id is null
    or p_product_id is null
    or p_expected_current_version_id is null
    or app_private.pos_product_image_envelope_is_valid_v1(
      p_schema_version,
      p_app_version,
      p_operation_id,
      p_idempotency_key,
      p_payload_hash
    ) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'validation_failed',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_changed_at)
    );
  end if;

  if app_private.pos_product_image_access_is_valid_v1(
      p_shop_id,
      p_shop_device_id,
      p_staff_id,
      p_pos_session_id,
      p_expected_staff_credential_version,
      'catalog.write'
    ) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'auth_denied',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_changed_at)
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:lifecycle',
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:operation:' || p_operation_id,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:idempotency:' ||
      p_idempotency_key,
    0
  ));

  select receipt.* into v_existing
  from public.pos_product_image_mutation_receipts receipt
  where receipt.shop_id = p_shop_id
    and (
      receipt.operation_id = p_operation_id
      or receipt.idempotency_key = p_idempotency_key
    )
  order by
    (receipt.operation_id = p_operation_id) desc,
    (receipt.idempotency_key = p_idempotency_key) desc
  limit 1
  for share;

  if found then
    if v_existing.operation = 'remove'
      and v_existing.operation_id = p_operation_id
      and v_existing.idempotency_key = p_idempotency_key
      and v_existing.payload_hash = p_payload_hash
      and v_existing.schema_version = p_schema_version
      and v_existing.shop_device_id = p_shop_device_id
      and v_existing.pos_session_id = p_pos_session_id
      and v_existing.staff_id = p_staff_id
      and v_existing.staff_credential_version =
        p_expected_staff_credential_version
      and v_existing.product_id = p_product_id
      and v_existing.expected_current_version_id =
        p_expected_current_version_id
      then
      if app_private.pos_product_image_access_is_valid_v1(
          p_shop_id,
          p_shop_device_id,
          p_staff_id,
          p_pos_session_id,
          p_expected_staff_credential_version,
          'catalog.write'
        ) is not true then
        raise exception 'POS image lease expired before remove replay'
          using errcode = '42501';
      end if;
      return app_private.pos_product_image_receipt_result_v1(
        v_existing.pos_product_image_mutation_receipt_id,
        true
      );
    end if;

    v_changed_at := clock_timestamp();
    if app_private.pos_product_image_admit_write_v1(
        p_shop_id,
        p_staff_id,
        v_changed_at
      ) is not true then
      return jsonb_build_object(
        'ok', false,
        'code', 'rate_limited',
        'server_time',
          app_private.pos_product_image_timestamp_v1(v_changed_at)
      );
    end if;

    perform app_private.write_pos_product_image_audit_v1(
      p_shop_id,
      p_staff_id,
      p_operation_id,
      'remove',
      'idempotency_payload_mismatch',
      'blocked',
      1,
      0
    );
    return jsonb_build_object(
      'ok', false,
      'code', 'idempotency_payload_mismatch',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_changed_at)
    );
  end if;

  v_changed_at := clock_timestamp();
  if app_private.pos_product_image_admit_write_v1(
      p_shop_id,
      p_staff_id,
      v_changed_at
    ) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'rate_limited',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_changed_at)
    );
  end if;

  select product.* into v_product
  from public.inventory_products product
  where product.id = p_product_id
  for update;

  select coalesce(revision, 0)
    into v_catalog_revision
  from app_private.pos_catalog_revisions
  where shop_id = p_shop_id;
  v_catalog_revision := coalesce(v_catalog_revision, 0);

  if v_product.id is null
    or app_private.product_image_product_is_in_shop(
      p_product_id,
      p_shop_id
    ) is not true then
    v_receipt_id := app_private.pos_product_image_store_receipt_v1(
      p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
      p_expected_staff_credential_version, p_schema_version, p_app_version,
      'remove', p_operation_id, p_idempotency_key, p_payload_hash,
      p_product_id, p_expected_current_version_id, null, null,
      'not_found', 'product_not_found', null, null, null,
      v_catalog_revision, v_changed_at
    );
  elsif v_product.primary_image_version_id is null then
    select version.* into v_version
    from public.inventory_product_image_versions version
    where version.id = p_expected_current_version_id
      and version.product_id = p_product_id
      and version.shop_id = p_shop_id
      and version.status = 'removed'
    for share;

    if v_version.id is null then
      v_receipt_id := app_private.pos_product_image_store_receipt_v1(
        p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
        p_expected_staff_credential_version, p_schema_version,
        p_app_version, 'remove', p_operation_id, p_idempotency_key,
        p_payload_hash, p_product_id, p_expected_current_version_id,
        null, null, 'not_found', 'version_not_found', null, null,
        v_product.primary_image_updated_at,
        v_catalog_revision, v_changed_at
      );
    else
      v_receipt_id := app_private.pos_product_image_store_receipt_v1(
        p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
        p_expected_staff_credential_version, p_schema_version,
        p_app_version, 'remove', p_operation_id, p_idempotency_key,
        p_payload_hash, p_product_id, p_expected_current_version_id,
        p_expected_current_version_id, null,
        'already_removed', 'success', null, null,
        v_product.primary_image_updated_at,
        v_catalog_revision, v_changed_at
      );
    end if;
  elsif v_product.primary_image_version_id <>
      p_expected_current_version_id then
    v_receipt_id := app_private.pos_product_image_store_receipt_v1(
      p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
      p_expected_staff_credential_version, p_schema_version, p_app_version,
      'remove', p_operation_id, p_idempotency_key, p_payload_hash,
      p_product_id, p_expected_current_version_id, null,
      v_product.primary_image_version_id,
      'stale_conflict', 'stale_conflict', null, null,
      v_product.primary_image_updated_at,
      v_catalog_revision, v_changed_at
    );
  else
    select version.* into v_version
    from public.inventory_product_image_versions version
    where version.id = p_expected_current_version_id
      and version.product_id = p_product_id
      and version.shop_id = p_shop_id
      and version.status = 'ready'
    for update;

    if v_version.id is null then
      v_receipt_id := app_private.pos_product_image_store_receipt_v1(
        p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
        p_expected_staff_credential_version, p_schema_version,
        p_app_version, 'remove', p_operation_id, p_idempotency_key,
        p_payload_hash, p_product_id, p_expected_current_version_id,
        null, v_product.primary_image_version_id,
        'invalid_state', 'invalid_state', null, null,
        v_product.primary_image_updated_at,
        v_catalog_revision, v_changed_at
      );
    else
      update public.inventory_product_image_versions
      set status = 'removed',
          removed_at = v_changed_at,
          cleanup_status = 'pending',
          cleanup_last_error_code = null,
          cleanup_updated_at = v_changed_at
      where id = p_expected_current_version_id
        and status = 'ready';
      get diagnostics v_row_count = row_count;
      if v_row_count <> 1 then
        raise exception 'POS image remove version fence failed'
          using errcode = '40001';
      end if;

      update public.inventory_products
      set primary_image_version_id = null,
          primary_image_updated_at = v_changed_at,
          updated_at = v_changed_at
      where id = p_product_id
        and primary_image_version_id = p_expected_current_version_id;
      get diagnostics v_row_count = row_count;
      if v_row_count <> 1 then
        raise exception 'POS image remove product CAS failed'
          using errcode = '40001';
      end if;

      v_sync_event_id := app_private.emit_product_image_sync_event(
        p_shop_id,
        p_product_id,
        p_expected_current_version_id,
        'image_remove',
        'pos_staff'
      );
      if v_sync_event_id is null then
        raise exception 'POS image remove catalog event publication failed'
          using errcode = '55000';
      end if;

      select coalesce(revision, 0)
        into v_catalog_revision
      from app_private.pos_catalog_revisions
      where shop_id = p_shop_id;
      v_catalog_revision := coalesce(v_catalog_revision, 0);

      v_receipt_id := app_private.pos_product_image_store_receipt_v1(
        p_shop_id, p_shop_device_id, p_pos_session_id, p_staff_id,
        p_expected_staff_credential_version, p_schema_version,
        p_app_version, 'remove', p_operation_id, p_idempotency_key,
        p_payload_hash, p_product_id, p_expected_current_version_id,
        p_expected_current_version_id, null, 'removed', 'success',
        null, null, v_changed_at, v_catalog_revision, v_changed_at
      );
    end if;
  end if;

  perform app_private.write_pos_product_image_audit_v1(
    p_shop_id,
    p_staff_id,
    p_operation_id,
    'remove',
    (
      select receipt.outcome_code
      from public.pos_product_image_mutation_receipts receipt
      where receipt.pos_product_image_mutation_receipt_id = v_receipt_id
    ),
    case when (
      select receipt.outcome_status
      from public.pos_product_image_mutation_receipts receipt
      where receipt.pos_product_image_mutation_receipt_id = v_receipt_id
    ) in ('removed', 'already_removed')
      then 'success'
      else 'blocked'
    end,
    1,
    case when (
      select receipt.outcome_status
      from public.pos_product_image_mutation_receipts receipt
      where receipt.pos_product_image_mutation_receipt_id = v_receipt_id
    ) = 'removed' then 2 else 0 end
  );

  if app_private.pos_product_image_access_is_valid_v1(
      p_shop_id,
      p_shop_device_id,
      p_staff_id,
      p_pos_session_id,
      p_expected_staff_credential_version,
      'catalog.write'
    ) is not true then
    raise exception 'POS image lease expired before remove publication'
      using errcode = '42501';
  end if;

  return app_private.pos_product_image_receipt_result_v1(
    v_receipt_id,
    false
  );
end;
$$;

revoke all on function public.pos_product_image_remove_v1(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text,
  uuid, uuid
) from public, anon, authenticated;
grant execute on function public.pos_product_image_remove_v1(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text,
  uuid, uuid
) to service_role;

create or replace function public.pos_product_image_cleanup_result_v1(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_expected_staff_credential_version integer,
  p_schema_version text,
  p_app_version text,
  p_operation text,
  p_operation_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_product_id uuid,
  p_version_id uuid,
  p_success boolean,
  p_error_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cleanup_code text;
  v_cleanup_result text;
  v_cleanup_status text;
  v_receipt_id uuid;
  v_server_timestamp timestamptz := clock_timestamp();
  v_version public.inventory_product_image_versions%rowtype;
begin
  if p_shop_id is null
    or p_shop_device_id is null
    or p_staff_id is null
    or p_pos_session_id is null
    or p_product_id is null
    or p_version_id is null
    or p_operation not in ('finalize', 'remove')
    or p_success is null
    or (
      p_success
      and p_error_code is not null
    )
    or (
      not p_success
      and (
        p_error_code is null
        or p_error_code <> 'storage_delete_failed'
      )
    )
    or app_private.pos_product_image_envelope_is_valid_v1(
      p_schema_version,
      p_app_version,
      p_operation_id,
      p_idempotency_key,
      p_payload_hash
    ) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'validation_failed',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_server_timestamp)
    );
  end if;

  if app_private.pos_product_image_access_is_valid_v1(
      p_shop_id,
      p_shop_device_id,
      p_staff_id,
      p_pos_session_id,
      p_expected_staff_credential_version,
      'catalog.write'
    ) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'auth_denied',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_server_timestamp)
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:lifecycle',
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:operation:' || p_operation_id,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:idempotency:' ||
      p_idempotency_key,
    0
  ));

  v_server_timestamp := clock_timestamp();
  if app_private.pos_product_image_admit_write_v1(
      p_shop_id,
      p_staff_id,
      v_server_timestamp
    ) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'rate_limited',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_server_timestamp)
    );
  end if;

  select receipt.pos_product_image_mutation_receipt_id
    into v_receipt_id
  from public.pos_product_image_mutation_receipts receipt
  where receipt.shop_id = p_shop_id
    and receipt.operation = p_operation
    and receipt.operation_id = p_operation_id
    and receipt.idempotency_key = p_idempotency_key
    and receipt.payload_hash = p_payload_hash
    and receipt.schema_version = p_schema_version
    and receipt.shop_device_id = p_shop_device_id
    and receipt.pos_session_id = p_pos_session_id
    and receipt.staff_id = p_staff_id
    and receipt.staff_credential_version =
      p_expected_staff_credential_version
    and receipt.product_id = p_product_id
    and receipt.image_version_id = p_version_id
    and (
      (p_operation = 'finalize'
        and receipt.outcome_status = 'validation_failed')
      or
      (p_operation = 'remove'
        and receipt.outcome_status = 'removed')
    )
  for share;

  if v_receipt_id is null then
    perform app_private.write_pos_product_image_audit_v1(
      p_shop_id,
      p_staff_id,
      p_operation_id,
      'cleanup',
      'receipt_conflict',
      'blocked',
      1,
      0
    );
    return jsonb_build_object(
      'ok', false,
      'code', 'receipt_conflict',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_server_timestamp)
    );
  end if;

  select version.* into v_version
  from public.inventory_product_image_versions version
  where version.id = p_version_id
    and version.shop_id = p_shop_id
    and version.product_id = p_product_id
    and (
      (p_operation = 'finalize' and version.status = 'failed')
      or
      (p_operation = 'remove' and version.status = 'removed')
    )
  for update;

  if v_version.id is null
    or exists (
      select 1
      from public.inventory_products product
      where product.id = p_product_id
        and product.primary_image_version_id = p_version_id
    ) then
    perform app_private.write_pos_product_image_audit_v1(
      p_shop_id,
      p_staff_id,
      p_operation_id,
      'cleanup',
      'invalid_state',
      'blocked',
      1,
      0
    );
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_state',
      'server_time',
        app_private.pos_product_image_timestamp_v1(v_server_timestamp)
    );
  end if;

  v_server_timestamp := clock_timestamp();
  if p_success is not true then
    v_cleanup_status := 'pending';
    v_cleanup_code := 'storage_delete_failed';
    v_cleanup_result := 'blocked';
  elsif v_version.pos_upload_capability_expires_at is null
    or v_version.pos_upload_capability_expires_at >
      v_server_timestamp then
    v_cleanup_status := 'pending';
    v_cleanup_code := 'signed_upload_capability_active';
    v_cleanup_result := 'blocked';
  else
    v_cleanup_status := 'complete';
    v_cleanup_code := 'cleanup_complete';
    v_cleanup_result := 'success';
  end if;

  update public.inventory_product_image_versions
  set cleanup_status = v_cleanup_status,
      cleanup_attempts = cleanup_attempts + 1,
      cleanup_last_error_code = case
        when v_cleanup_status = 'complete' then null
        else v_cleanup_code
      end,
      cleanup_updated_at = v_server_timestamp
  where id = p_version_id
    and shop_id = p_shop_id
    and product_id = p_product_id;

  perform app_private.write_pos_product_image_audit_v1(
    p_shop_id,
    p_staff_id,
    p_operation_id,
    'cleanup',
    v_cleanup_code,
    v_cleanup_result,
    1,
    2
  );

  if app_private.pos_product_image_access_is_valid_v1(
      p_shop_id,
      p_shop_device_id,
      p_staff_id,
      p_pos_session_id,
      p_expected_staff_credential_version,
      'catalog.write'
    ) is not true then
    raise exception 'POS image lease expired before cleanup publication'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'cleanup_recorded',
    'cleanup_status', v_cleanup_status,
    'server_time',
      app_private.pos_product_image_timestamp_v1(v_server_timestamp)
  );
end;
$$;

revoke all on function public.pos_product_image_cleanup_result_v1(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text, text,
  uuid, uuid, boolean, text
) from public, anon, authenticated;
grant execute on function public.pos_product_image_cleanup_result_v1(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text, text,
  uuid, uuid, boolean, text
) to service_role;

-- The legacy Shop Admin cleanup boundary can operate on versions originally
-- created by POS. A successful object delete is therefore only terminal after
-- the provider-issued upload capability can no longer recreate the paths.
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
set search_path = ''
as $$
declare
  v_audit_code text;
  v_audit_event_key text;
  v_audit_id uuid;
  v_audit_result text;
  v_audit_severity text;
  v_cleanup_status text;
  v_error_code text := lower(coalesce(
    p_error_code,
    'storage_delete_failed'
  ));
  v_product public.inventory_products%rowtype;
  v_server_timestamp timestamptz := clock_timestamp();
  v_version public.inventory_product_image_versions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  if v_error_code !~ '^[a-z0-9_]{1,64}$' then
    v_error_code := 'storage_delete_failed';
  end if;

  select product.* into v_product
  from public.inventory_products product
  where product.id = p_product_id
    and product.shop_id = p_shop_id
  for update;

  if v_product.id is null
    or v_product.primary_image_version_id = p_version_id then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_state_or_not_found'
    );
  end if;

  select version.* into v_version
  from public.inventory_product_image_versions version
  where version.id = p_version_id
    and version.shop_id = p_shop_id
    and version.product_id = p_product_id
    and version.status in ('failed', 'superseded', 'removed')
  for update;

  if v_version.id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_state_or_not_found'
    );
  end if;

  if p_success is not true then
    v_cleanup_status := case
      when v_version.actor_kind = 'pos_staff' then 'pending'
      else 'failed'
    end;
    v_audit_code := v_error_code;
    v_audit_event_key := 'shop.product_image.cleanup_failed';
    v_audit_result := 'blocked';
    v_audit_severity := 'warning';
  elsif v_version.actor_kind = 'pos_staff'
    and (
      v_version.pos_upload_capability_expires_at is null
      or v_version.pos_upload_capability_expires_at >
        v_server_timestamp
    ) then
    v_cleanup_status := 'pending';
    v_audit_code := 'signed_upload_capability_active';
    v_audit_event_key := 'shop.product_image.cleanup_deferred';
    v_audit_result := 'blocked';
    v_audit_severity := 'warning';
  else
    v_cleanup_status := 'complete';
    v_audit_code := 'cleanup_complete';
    v_audit_event_key := 'shop.product_image.cleanup_completed';
    v_audit_result := 'success';
    v_audit_severity := 'info';
  end if;

  update public.inventory_product_image_versions
  set cleanup_status = v_cleanup_status,
      cleanup_attempts = cleanup_attempts + 1,
      cleanup_last_error_code = case
        when v_cleanup_status = 'complete' then null
        else v_audit_code
      end,
      cleanup_updated_at = v_server_timestamp
  where id = p_version_id
    and shop_id = p_shop_id
    and product_id = p_product_id;

  v_audit_id := app_private.write_product_image_audit(
    p_actor_profile_id,
    p_shop_id,
    v_audit_event_key,
    v_audit_severity,
    v_audit_result,
    p_product_id,
    p_version_id,
    v_audit_code,
    case
      when p_actor_kind in ('personal_account', 'platform_admin')
        then p_actor_kind
      else 'platform_admin'
    end,
    jsonb_build_object(
      'cleanup_source',
      case
        when p_source in ('api_remove', 'admin_script') then p_source
        else 'admin_script'
      end
    )
  );

  return jsonb_build_object(
    'ok', true,
    'code', case
      when v_cleanup_status = 'complete' then 'cleanup_complete'
      when p_success then 'cleanup_pending'
      else 'cleanup_failed'
    end,
    'cleanup_status', v_cleanup_status,
    'audit_event_id', v_audit_id
  );
end;
$$;

revoke all on function public.product_image_record_cleanup(
  uuid, text, uuid, uuid, uuid, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.product_image_record_cleanup(
  uuid, text, uuid, uuid, uuid, boolean, text, text
) to service_role;

create or replace function
  public.task_149_pos_product_image_fixture_cleanup_v1(
    p_action text,
    p_run_id text,
    p_shop_id uuid,
    p_product_id uuid,
    p_operation_ids text[]
  )
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_active_capability_expires_at timestamptz;
  v_action text := btrim(coalesce(p_action, ''));
  v_counts jsonb;
  v_deleted_image_versions integer := 0;
  v_deleted_products integer := 0;
  v_deleted_receipts integer := 0;
  v_deleted_sync_events integer := 0;
  v_deleted_write_budget_rows integer := 0;
  v_expected_operation_ids text[];
  v_product public.inventory_products%rowtype;
  v_raw_run_id text;
  v_run_id text := btrim(coalesce(p_run_id, ''));
  v_shop public.shops%rowtype;
  v_staff public.staff_accounts%rowtype;
begin
  perform set_config('lock_timeout', '3s', true);
  perform set_config('statement_timeout', '30s', true);

  if v_action not in ('preflight', 'apply', 'verify')
    or v_run_id !~ '^TASK149_[A-Z0-9]{6,12}$' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_cleanup_envelope',
      'counts', jsonb_build_object(
        'sync_events', 0,
        'receipts', 0,
        'image_versions', 0,
        'products', 0,
        'write_budget_rows', 0
      )
    );
  end if;

  v_raw_run_id := substring(v_run_id from 9);
  v_expected_operation_ids := array[
    'task149.' || lower(v_run_id) || '.intent.1',
    'task149.' || lower(v_run_id) || '.finalize.1',
    'task149.' || lower(v_run_id) || '.intent.2',
    'task149.' || lower(v_run_id) || '.finalize.2',
    'task149.' || lower(v_run_id) || '.intent.3',
    'task149.' || lower(v_run_id) || '.stale-finalize.3',
    'task149.' || lower(v_run_id) || '.stale-remove.1',
    'task149.' || lower(v_run_id) || '.remove.2'
  ];

  if p_operation_ids is distinct from v_expected_operation_ids then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_operation_scope',
      'counts', jsonb_build_object(
        'sync_events', 0,
        'receipts', 0,
        'image_versions', 0,
        'products', 0,
        'write_budget_rows', 0
      )
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    v_run_id || ':task149-pos-image-fixture-cleanup',
    0
  ));

  if v_action = 'preflight' then
    if p_shop_id is not null or p_product_id is not null then
      return jsonb_build_object(
        'ok', false,
        'code', 'unsafe_fixture_target',
        'counts', jsonb_build_object(
          'sync_events', 0,
          'receipts', 0,
          'image_versions', 0,
          'products', 0,
          'write_budget_rows', 0
        )
      );
    end if;

    select jsonb_build_object(
      'sync_events', (
        select count(*)::integer
        from public.sync_events event
        join public.inventory_products product
          on event.entity_ids @> jsonb_build_object(
            'product_ids',
            jsonb_build_array(product.id)
          )
        where product.barcode =
            'TASK149_BARCODE_' || v_raw_run_id
          and product.product_name =
            'TASK149_SYNTHETIC_PRODUCT_' || v_raw_run_id
      ),
      'receipts', (
        select count(*)::integer
        from public.pos_product_image_mutation_receipts receipt
        where receipt.operation_id = any(v_expected_operation_ids)
      ),
      'image_versions', (
        select count(*)::integer
        from public.inventory_product_image_versions version
        join public.inventory_products product
          on product.id = version.product_id
        where product.barcode =
            'TASK149_BARCODE_' || v_raw_run_id
          and product.product_name =
            'TASK149_SYNTHETIC_PRODUCT_' || v_raw_run_id
      ),
      'products', (
        select count(*)::integer
        from public.inventory_products product
        where product.barcode =
            'TASK149_BARCODE_' || v_raw_run_id
          or product.product_name =
            'TASK149_SYNTHETIC_PRODUCT_' || v_raw_run_id
      ),
      'write_budget_rows', (
        select count(*)::integer
        from app_private.pos_product_image_mutation_budgets budget
        join public.shops shop
          on shop.shop_id = budget.shop_id
        where shop.shop_code = 'TASK149_SHOP_' || v_raw_run_id
          or shop.shop_name =
            'TASK149_SYNTHETIC_SHOP_' || v_raw_run_id
      )
    )
    into v_counts;

    if exists (
      select 1
      from public.shops shop
      where shop.shop_code = 'TASK149_SHOP_' || v_raw_run_id
        or shop.shop_name =
          'TASK149_SYNTHETIC_SHOP_' || v_raw_run_id
    )
      or exists (
        select 1
        from public.staff_accounts staff
        where staff.staff_code = 'TASK149_POS_' || v_raw_run_id
          or staff.display_name =
            'TASK149_SYNTHETIC_STAFF_' || v_raw_run_id
      )
      or exists (
        select 1
        from public.shop_devices device
        where device.device_identifier =
          'TASK149_DEVICE_' || v_raw_run_id
      ) then
      return jsonb_build_object(
        'ok', false,
        'code', 'fixture_scope_conflict',
        'counts', v_counts
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'code', 'preflight_ready',
      'counts', v_counts
    );
  end if;

  if p_shop_id is null or p_product_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'unsafe_fixture_target',
      'counts', jsonb_build_object(
        'sync_events', 0,
        'receipts', 0,
        'image_versions', 0,
        'products', 0,
        'write_budget_rows', 0
      )
    );
  end if;

  select shop.* into v_shop
  from public.shops shop
  where shop.shop_id = p_shop_id
  for share;

  if v_shop.shop_id is null
    or v_shop.shop_code <> 'TASK149_SHOP_' || v_raw_run_id
    or v_shop.shop_name <>
      'TASK149_SYNTHETIC_SHOP_' || v_raw_run_id then
    return jsonb_build_object(
      'ok', false,
      'code', 'unsafe_fixture_target',
      'counts', jsonb_build_object(
        'sync_events', 0,
        'receipts', 0,
        'image_versions', 0,
        'products', 0,
        'write_budget_rows', 0
      )
    );
  end if;

  select staff.* into v_staff
  from public.staff_accounts staff
  where staff.shop_id = p_shop_id
    and staff.staff_code = 'TASK149_POS_' || v_raw_run_id
    and staff.display_name =
      'TASK149_SYNTHETIC_STAFF_' || v_raw_run_id
  order by staff.staff_id
  limit 1
  for share;

  if v_staff.staff_id is null
    or exists (
      select 1
      from public.staff_accounts staff
      where (
          staff.staff_code = 'TASK149_POS_' || v_raw_run_id
          or staff.display_name =
            'TASK149_SYNTHETIC_STAFF_' || v_raw_run_id
        )
        and (
          staff.staff_id <> v_staff.staff_id
          or staff.shop_id <> p_shop_id
          or staff.staff_code <> 'TASK149_POS_' || v_raw_run_id
          or staff.display_name <>
            'TASK149_SYNTHETIC_STAFF_' || v_raw_run_id
        )
    ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'fixture_scope_conflict',
      'counts', jsonb_build_object(
        'sync_events', 0,
        'receipts', 0,
        'image_versions', 0,
        'products', 0,
        'write_budget_rows', 0
      )
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:lifecycle',
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:budget:shop',
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':pos-product-image:node-audit-budget:shop',
    0
  ));

  if v_action = 'verify' then
    select jsonb_build_object(
      'sync_events', (
        select count(*)::integer
        from public.sync_events event
        where event.entity_ids @> jsonb_build_object(
          'product_ids',
          jsonb_build_array(p_product_id)
        )
      ),
      'receipts', (
        select count(*)::integer
        from public.pos_product_image_mutation_receipts receipt
        where receipt.operation_id = any(v_expected_operation_ids)
          or (
            receipt.shop_id = p_shop_id
            and receipt.product_id = p_product_id
          )
      ),
      'image_versions', (
        select count(*)::integer
        from public.inventory_product_image_versions version
        where version.product_id = p_product_id
          or (
            version.shop_id = p_shop_id
            and version.main_path like
              '%/' || p_product_id::text || '/%'
          )
      ),
      'products', (
        select count(*)::integer
        from public.inventory_products product
        where product.id = p_product_id
          or product.barcode =
            'TASK149_BARCODE_' || v_raw_run_id
          or product.product_name =
            'TASK149_SYNTHETIC_PRODUCT_' || v_raw_run_id
      ),
      'write_budget_rows', (
        select count(*)::integer
        from app_private.pos_product_image_mutation_budgets budget
        where budget.shop_id = p_shop_id
      )
    )
    into v_counts;

    if (v_counts->>'sync_events')::integer <> 0
      or (v_counts->>'receipts')::integer <> 0
      or (v_counts->>'image_versions')::integer <> 0
      or (v_counts->>'products')::integer <> 0
      or (v_counts->>'write_budget_rows')::integer <> 0 then
      return jsonb_build_object(
        'ok', false,
        'code', 'cleanup_incomplete',
        'counts', v_counts
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'code', 'cleanup_verified',
      'counts', v_counts
    );
  end if;

  select product.* into v_product
  from public.inventory_products product
  where product.id = p_product_id
    and product.shop_id = p_shop_id
  for update;

  if v_product.id is null
    or v_product.barcode <>
      'TASK149_BARCODE_' || v_raw_run_id
    or v_product.item_number <>
      'TASK149_ITEM_' || v_raw_run_id
    or v_product.product_name <>
      'TASK149_SYNTHETIC_PRODUCT_' || v_raw_run_id
    or exists (
      select 1
      from public.pos_product_image_mutation_receipts receipt
      where (
          receipt.operation_id = any(v_expected_operation_ids)
          and (
            receipt.shop_id <> p_shop_id
            or receipt.product_id <> p_product_id
          )
        )
        or (
          receipt.shop_id = p_shop_id
          and receipt.product_id = p_product_id
          and receipt.operation_id <>
            all(v_expected_operation_ids)
        )
    )
    or exists (
      select 1
      from public.pos_product_image_mutation_receipts receipt
      left join public.staff_accounts staff
        on staff.staff_id = receipt.staff_id
       and staff.shop_id = receipt.shop_id
      left join public.shop_devices device
        on device.shop_device_id = receipt.shop_device_id
       and device.shop_id = receipt.shop_id
      where receipt.shop_id = p_shop_id
        and receipt.product_id = p_product_id
        and (
          staff.staff_id is null
          or receipt.staff_id <> v_staff.staff_id
          or staff.staff_code <>
            'TASK149_POS_' || v_raw_run_id
          or staff.display_name <>
            'TASK149_SYNTHETIC_STAFF_' || v_raw_run_id
          or device.shop_device_id is null
          or device.device_identifier <>
            'TASK149_DEVICE_' || v_raw_run_id
        )
    )
    or exists (
      select 1
      from public.inventory_product_image_versions version
      left join public.staff_accounts staff
        on staff.staff_id = version.requested_by_staff_id
       and staff.shop_id = version.shop_id
      left join public.shop_devices device
        on device.shop_device_id =
          version.requested_by_shop_device_id
       and device.shop_id = version.shop_id
      where version.product_id = p_product_id
        and (
          version.shop_id <> p_shop_id
          or version.actor_kind <> 'pos_staff'
          or staff.staff_id is null
          or version.requested_by_staff_id <> v_staff.staff_id
          or staff.staff_code <>
            'TASK149_POS_' || v_raw_run_id
          or staff.display_name <>
            'TASK149_SYNTHETIC_STAFF_' || v_raw_run_id
          or device.shop_device_id is null
          or device.device_identifier <>
            'TASK149_DEVICE_' || v_raw_run_id
        )
    )
    or exists (
      select 1
      from app_private.pos_product_image_mutation_budgets budget
      where budget.shop_id = p_shop_id
        and not (
          (
            budget.principal_kind = 'shop'
            and budget.principal_id = p_shop_id
          )
          or
          (
            budget.principal_kind = 'staff'
            and budget.principal_id = v_staff.staff_id
          )
          or
          (
            budget.principal_kind = 'node_audit_shop'
            and budget.principal_id = p_shop_id
          )
          or
          (
            budget.principal_kind = 'node_audit_staff'
            and budget.principal_id = v_staff.staff_id
          )
        )
    )
    or exists (
      select 1
      from public.sync_events event
      where event.entity_ids @> jsonb_build_object(
        'product_ids',
        jsonb_build_array(p_product_id)
      )
        and (
          event.shop_id is distinct from p_shop_id
          or event.domain <> 'catalog'
          or event.entity_ids <> jsonb_build_object(
            'product_ids',
            jsonb_build_array(p_product_id)
          )
        )
    )
    or exists (
      select 1
      from public.pos_sale_stock_movements movement
      where movement.product_id = p_product_id
    ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'fixture_scope_conflict',
      'counts', jsonb_build_object(
        'sync_events', 0,
        'receipts', 0,
        'image_versions', 0,
        'products', 0,
        'write_budget_rows', 0
      )
    );
  end if;

  perform 1
  from public.inventory_product_image_versions version
  where version.shop_id = p_shop_id
    and version.product_id = p_product_id
  order by version.id
  for update;

  select max(version.pos_upload_capability_expires_at)
    into v_active_capability_expires_at
  from public.inventory_product_image_versions version
  where version.shop_id = p_shop_id
    and version.product_id = p_product_id
    and version.actor_kind = 'pos_staff';

  if exists (
    select 1
    from public.inventory_product_image_versions version
    where version.shop_id = p_shop_id
      and version.product_id = p_product_id
      and version.actor_kind = 'pos_staff'
      and (
        version.pos_upload_capability_expires_at is null
        or version.pos_upload_capability_expires_at > clock_timestamp()
      )
  ) then
    select jsonb_build_object(
      'sync_events', (
        select count(*)::integer
        from public.sync_events event
        where event.entity_ids @> jsonb_build_object(
          'product_ids',
          jsonb_build_array(p_product_id)
        )
      ),
      'receipts', (
        select count(*)::integer
        from public.pos_product_image_mutation_receipts receipt
        where receipt.operation_id = any(v_expected_operation_ids)
          or (
            receipt.shop_id = p_shop_id
            and receipt.product_id = p_product_id
          )
      ),
      'image_versions', (
        select count(*)::integer
        from public.inventory_product_image_versions version
        where version.shop_id = p_shop_id
          and version.product_id = p_product_id
      ),
      'products', (
        select count(*)::integer
        from public.inventory_products product
        where product.id = p_product_id
          and product.shop_id = p_shop_id
      ),
      'write_budget_rows', (
        select count(*)::integer
        from app_private.pos_product_image_mutation_budgets budget
        where budget.shop_id = p_shop_id
      )
    )
    into v_counts;

    return jsonb_build_object(
      'ok', false,
      'code', 'signed_upload_capability_active',
      'counts', v_counts,
      'retry_after_at', v_active_capability_expires_at
    );
  end if;

  select count(*)::integer
    into v_deleted_image_versions
  from public.inventory_product_image_versions version
  where version.shop_id = p_shop_id
    and version.product_id = p_product_id;

  delete from app_private.pos_product_image_mutation_budgets budget
  where budget.shop_id = p_shop_id;
  get diagnostics v_deleted_write_budget_rows = row_count;

  if v_deleted_write_budget_rows not between 0 and 4 then
    raise exception 'TASK-149 write-budget cleanup invariant failed'
      using errcode = '23514';
  end if;

  perform set_config(
    'app.pos_product_image_fixture_cleanup_allowed',
    'true',
    true
  );

  delete from public.pos_product_image_mutation_receipts receipt
  where receipt.shop_id = p_shop_id
    and receipt.product_id = p_product_id
    and receipt.operation_id = any(v_expected_operation_ids);
  get diagnostics v_deleted_receipts = row_count;

  delete from public.inventory_products product
  where product.id = p_product_id
    and product.shop_id = p_shop_id
    and product.barcode =
      'TASK149_BARCODE_' || v_raw_run_id
    and product.item_number =
      'TASK149_ITEM_' || v_raw_run_id
    and product.product_name =
      'TASK149_SYNTHETIC_PRODUCT_' || v_raw_run_id;
  get diagnostics v_deleted_products = row_count;

  if v_deleted_products <> 1
    or exists (
      select 1
      from public.inventory_product_image_versions version
      where version.product_id = p_product_id
    ) then
    raise exception 'TASK-149 exact product cleanup invariant failed'
      using errcode = '23514';
  end if;

  delete from public.sync_events event
  where event.shop_id = p_shop_id
    and event.domain = 'catalog'
    and event.entity_ids = jsonb_build_object(
      'product_ids',
      jsonb_build_array(p_product_id)
    );
  get diagnostics v_deleted_sync_events = row_count;

  perform set_config(
    'app.pos_product_image_fixture_cleanup_allowed',
    'false',
    true
  );

  if exists (
      select 1
      from public.pos_product_image_mutation_receipts receipt
      where receipt.operation_id = any(v_expected_operation_ids)
        or (
          receipt.shop_id = p_shop_id
          and receipt.product_id = p_product_id
        )
    )
    or exists (
      select 1
      from public.sync_events event
      where event.entity_ids @> jsonb_build_object(
        'product_ids',
        jsonb_build_array(p_product_id)
      )
    )
    or exists (
      select 1
      from app_private.pos_product_image_mutation_budgets budget
      where budget.shop_id = p_shop_id
    ) then
    raise exception 'TASK-149 exact fixture cleanup invariant failed'
      using errcode = '23514';
  end if;

  insert into public.audit_logs (
    actor_profile_id,
    actor_staff_id,
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
    null,
    null,
    'shop',
    p_shop_id,
    'pos.catalog.product_image.fixture_cleanup',
    'info',
    'success',
    'qa_run',
    encode(extensions.digest(v_run_id, 'sha256'), 'hex'),
    jsonb_build_object(
      'deleted', jsonb_build_object(
        'sync_events', v_deleted_sync_events,
        'receipts', v_deleted_receipts,
        'image_versions', v_deleted_image_versions,
        'products', v_deleted_products,
        'write_budget_rows', v_deleted_write_budget_rows
      ),
      'source', 'pos_product_image_v1'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'cleanup_applied',
    'counts', jsonb_build_object(
      'sync_events', v_deleted_sync_events,
      'receipts', v_deleted_receipts,
      'image_versions', v_deleted_image_versions,
      'products', v_deleted_products,
      'write_budget_rows', v_deleted_write_budget_rows
    )
  );
end;
$$;

revoke all on function
  public.task_149_pos_product_image_fixture_cleanup_v1(
    text, text, uuid, uuid, text[]
  )
  from public, anon, authenticated;
grant execute on function
  public.task_149_pos_product_image_fixture_cleanup_v1(
    text, text, uuid, uuid, text[]
  )
  to service_role;

-- Preserve the legacy Admin Web contract while closing the promotion race:
-- the immutable previous_version_id captured by create-intent must still be
-- the product's current version immediately before a pending row is promoted.
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
  v_row_count integer;
  v_sync_event_id bigint;
begin
  if not app_private.product_image_actor_can_write(
    p_actor_profile_id,
    p_shop_id,
    p_actor_kind
  ) then
    if exists (
      select 1
      from public.shops
      where shop_id = p_shop_id
    ) then
      perform app_private.write_product_image_audit(
        p_actor_profile_id,
        p_shop_id,
        'shop.product_image.finalize_denied',
        'warning',
        'blocked',
        p_product_id,
        p_version_id,
        'permission_denied',
        p_actor_kind
      );
    end if;
    return jsonb_build_object(
      'ok', false,
      'code', 'permission_denied'
    );
  end if;

  select product.* into v_product
  from public.inventory_products product
  where product.id = p_product_id
  for update;

  if v_product.id is null
    or not app_private.product_image_product_is_in_shop(
      p_product_id,
      p_shop_id
    ) then
    perform app_private.write_product_image_audit(
      p_actor_profile_id,
      p_shop_id,
      'shop.product_image.finalize_denied',
      'warning',
      'blocked',
      p_product_id,
      p_version_id,
      'not_found',
      p_actor_kind
    );
    return jsonb_build_object(
      'ok', false,
      'code', 'not_found'
    );
  end if;

  select version.* into v_version
  from public.inventory_product_image_versions version
  where version.id = p_version_id
    and version.product_id = p_product_id
    and version.shop_id = p_shop_id
  for update;

  if v_version.id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_found'
    );
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
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_state'
    );
  end if;

  if v_version.expires_at < now() then
    update public.inventory_product_image_versions
    set status = 'failed',
        cleanup_status = 'pending',
        cleanup_last_error_code = 'intent_expired',
        cleanup_updated_at = now()
    where id = p_version_id;

    perform app_private.write_product_image_audit(
      p_actor_profile_id,
      p_shop_id,
      'shop.product_image.finalize_failed',
      'warning',
      'blocked',
      p_product_id,
      p_version_id,
      'intent_expired',
      p_actor_kind
    );
    return jsonb_build_object(
      'ok', false,
      'code', 'intent_expired'
    );
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
      p_actor_profile_id,
      p_shop_id,
      'shop.product_image.finalize_failed',
      'critical',
      'blocked',
      p_product_id,
      p_version_id,
      'verified_metadata_mismatch',
      p_actor_kind
    );
    return jsonb_build_object(
      'ok', false,
      'code', 'verified_metadata_mismatch'
    );
  end if;

  if v_version.previous_version_id
      is distinct from v_product.primary_image_version_id then
    update public.inventory_product_image_versions
    set status = 'failed',
        cleanup_status = 'pending',
        cleanup_last_error_code = 'stale_conflict',
        cleanup_updated_at = v_changed_at
    where id = p_version_id
      and status = 'pending';

    perform app_private.write_product_image_audit(
      p_actor_profile_id,
      p_shop_id,
      'shop.product_image.finalize_failed',
      'warning',
      'blocked',
      p_product_id,
      p_version_id,
      'stale_conflict',
      p_actor_kind
    );
    return jsonb_build_object(
      'ok', false,
      'code', 'stale_conflict'
    );
  end if;

  v_previous_version_id := v_version.previous_version_id;

  if v_previous_version_id is not null then
    update public.inventory_product_image_versions
    set status = 'superseded',
        superseded_at = v_changed_at,
        cleanup_status = 'pending',
        cleanup_updated_at = v_changed_at
    where id = v_previous_version_id
      and product_id = p_product_id
      and status = 'ready';
    get diagnostics v_row_count = row_count;
    if v_row_count <> 1 then
      raise exception 'product_image_finalize_prior_version_fence_failed'
        using errcode = '55000';
    end if;
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
      finalized_by_staff_id = null,
      finalized_by_shop_device_id = null,
      finalized_by_pos_session_id = null,
      finalized_at = v_changed_at,
      cleanup_status = 'not_due',
      cleanup_last_error_code = null,
      cleanup_updated_at = null
  where id = p_version_id
    and status = 'pending';
  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'product_image_finalize_version_fence_failed'
      using errcode = '55000';
  end if;

  update public.inventory_products
  set primary_image_version_id = p_version_id,
      primary_image_updated_at = v_changed_at,
      updated_at = v_changed_at
  where id = p_product_id
    and primary_image_version_id
      is not distinct from v_previous_version_id;
  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'product_image_finalize_product_cas_failed'
      using errcode = '40001';
  end if;

  v_sync_event_id := app_private.emit_product_image_sync_event(
    p_shop_id,
    p_product_id,
    p_version_id,
    'image_finalize',
    p_actor_kind
  );

  v_audit_id := app_private.write_product_image_audit(
    p_actor_profile_id,
    p_shop_id,
    case
      when v_previous_version_id is null
        then 'shop.product_image.finalized'
      else 'shop.product_image.replaced'
    end,
    'info',
    'success',
    p_product_id,
    p_version_id,
    case
      when v_previous_version_id is null
        then 'finalized'
      else 'replaced'
    end,
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

revoke all on function public.product_image_finalize(
  uuid, text, uuid, uuid, uuid, text, integer, integer, integer,
  text, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.product_image_finalize(
  uuid, text, uuid, uuid, uuid, text, integer, integer, integer,
  text, integer, integer, integer
) to service_role;

-- Preserve the bounded TASK-139 page implementation as an owner-only base.
-- The public signature remains unchanged, but product rows are enriched from
-- the authoritative image publication columns under the same revision fence.
alter function public.pos_catalog_pull_page_v2(
  uuid, text, timestamptz, timestamptz, text, timestamptz, uuid,
  integer, text, text, text, boolean
) rename to pos_catalog_pull_page_v2_task149_base;

alter function public.pos_catalog_pull_page_v2_task149_base(
  uuid, text, timestamptz, timestamptz, text, timestamptz, uuid,
  integer, text, text, text, boolean
) set schema app_private;

revoke all on function
  app_private.pos_catalog_pull_page_v2_task149_base(
    uuid, text, timestamptz, timestamptz, text, timestamptz, uuid,
    integer, text, text, text, boolean
  )
  from public, anon, authenticated, service_role;

create function public.pos_catalog_pull_page_v2(
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
volatile
security definer
set search_path = ''
as $$
declare
  v_current_revision bigint;
  v_enriched_rows jsonb;
  v_mapped_count integer;
  v_result jsonb;
  v_row_count integer;
  v_rows jsonb;
  v_shape_ok boolean;
begin
  v_result := app_private.pos_catalog_pull_page_v2_task149_base(
    p_shop_id,
    p_mode,
    p_lower_bound,
    p_snapshot_at,
    p_entity,
    p_after_updated_at,
    p_after_id,
    p_limit,
    p_expected_revision,
    p_expected_scope_kind,
    p_expected_scope_key,
    p_include_manifest
  );

  if jsonb_typeof(v_result) is distinct from 'object'
    or jsonb_typeof(v_result->'status') is distinct from 'string' then
    return jsonb_build_object('status', 'integrity_blocked');
  end if;

  if v_result->>'status' <> 'ok' then
    return v_result;
  end if;

  if jsonb_typeof(v_result->'entity') is distinct from 'string' then
    return jsonb_build_object('status', 'integrity_blocked');
  end if;

  if v_result->>'entity' <> 'products' then
    return v_result;
  end if;

  if jsonb_typeof(v_result->'revision') is distinct from 'string'
    or v_result->>'revision' !~ '^(0|[1-9][0-9]{0,18})$' then
    return jsonb_build_object(
      'status', 'integrity_blocked',
      'entity', 'products'
    );
  end if;

  -- Ensure the row exists before taking the shared lock. This also closes
  -- the revision-zero race for a shop whose first catalog mutation is
  -- concurrent with this page.
  insert into app_private.pos_catalog_revisions(
    shop_id,
    revision,
    changed_at
  )
  values (
    p_shop_id,
    0,
    statement_timestamp()
  )
  on conflict (shop_id) do nothing;

  select revision
    into v_current_revision
  from app_private.pos_catalog_revisions
  where shop_id = p_shop_id
  for share;
  v_current_revision := coalesce(v_current_revision, 0);

  if v_result->>'revision' <> v_current_revision::text then
    return jsonb_build_object('status', 'snapshot_changed');
  end if;

  v_rows := v_result->'rows';
  if jsonb_typeof(v_rows) is distinct from 'array' then
    return jsonb_build_object(
      'status', 'integrity_blocked',
      'entity', 'products'
    );
  end if;

  if jsonb_array_length(v_rows) > 60 then
    return jsonb_build_object(
      'status', 'integrity_blocked',
      'entity', 'products'
    );
  end if;
  v_row_count := jsonb_array_length(v_rows);

  select
    coalesce(
      jsonb_agg(
        entry.row_value || jsonb_build_object(
          'primary_image_version_id', product.primary_image_version_id,
          'primary_image_updated_at', product.primary_image_updated_at
        )
        order by entry.ordinality
      ),
      '[]'::jsonb
    ),
    count(product.id)::integer,
    coalesce(
      bool_and(
        jsonb_typeof(entry.row_value) = 'object'
        and jsonb_typeof(entry.row_value->'id') = 'string'
        and entry.row_value->>'id'
          ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and product.id is not null
        and (
          product.primary_image_version_id is null
          or product.primary_image_updated_at is not null
        )
      ),
      true
    )
    into v_enriched_rows, v_mapped_count, v_shape_ok
  from jsonb_array_elements(v_rows) with ordinality
    as entry(row_value, ordinality)
  left join public.inventory_products product
    on product.id = case
      when jsonb_typeof(entry.row_value) = 'object'
        and entry.row_value->>'id'
          ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (entry.row_value->>'id')::uuid
      else null::uuid
    end;

  if v_mapped_count <> v_row_count or v_shape_ok is not true then
    return jsonb_build_object(
      'status', 'integrity_blocked',
      'entity', 'products'
    );
  end if;

  if octet_length(v_enriched_rows::text) > 4000000 then
    return jsonb_build_object(
      'status', 'resource_exceeded',
      'entity', 'products'
    );
  end if;

  v_result := jsonb_set(v_result, '{rows}', v_enriched_rows, false);
  if octet_length(v_result::text) > 4194304 then
    return jsonb_build_object(
      'status', 'resource_exceeded',
      'entity', 'products'
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.pos_catalog_pull_page_v2(
  uuid, text, timestamptz, timestamptz, text, timestamptz, uuid,
  integer, text, text, text, boolean
) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
