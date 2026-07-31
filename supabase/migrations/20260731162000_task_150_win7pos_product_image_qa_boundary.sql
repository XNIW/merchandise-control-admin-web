-- TASK-150: staging-only Win7POS product-image QA provisioning and cleanup.
-- This migration does not alter the pos-product-image-v1 runtime contract,
-- authentication, CAS, image limits, catalog semantics, Storage policy or RLS.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '15min';

create table if not exists app_private.task_150_win7pos_image_qa_runs (
  run_hmac text primary key,
  manifest_hmac text not null unique,
  environment text not null default 'staging',
  fixture_template text not null,
  -- Snapshot identifiers intentionally have no FK: the immutable terminal
  -- receipt must not pin the lifecycle of shared bootstrap rows forever.
  bootstrap_source_shop_id uuid not null,
  bootstrap_staff_id uuid not null,
  bootstrap_profile_id uuid not null,
  bootstrap_actor_hmac text not null,
  bootstrap_snapshot_digest text not null,
  begin_request_hash text not null,
  provision_request_hash text,
  cleanup_request_hash text,
  provision_capability_digest text not null,
  provision_capability_expires_at timestamptz not null,
  provision_consumed_at timestamptz,
  provision_admission_digest text,
  provision_admission_expires_at timestamptz,
  provision_admission_request_hash text,
  cleanup_capability_digest text not null,
  cleanup_capability_issued_at timestamptz not null,
  cleanup_capability_expires_at timestamptz not null,
  cleanup_capability_revoked_at timestamptz,
  pending_cleanup_capability_digest text,
  pending_cleanup_capability_expires_at timestamptz,
  pending_cleanup_target_expires_at timestamptz,
  pending_cleanup_prepared_at timestamptz,
  cleanup_rotation_request_hash text,
  cleanup_rotation_ack_request_hash text,
  result_capability_digest text not null,
  result_capability_issued_at timestamptz not null,
  result_capability_expires_at timestamptz not null,
  result_issue_request_hash text,
  run_shop_id uuid not null unique,
  run_staff_id uuid not null unique,
  run_mapping_id uuid not null unique,
  run_product_id uuid not null unique,
  run_inventory_owner_id uuid not null unique,
  run_device_id uuid,
  run_actor_hmac text,
  expected_shop_code text not null,
  expected_shop_name text not null,
  expected_staff_code text not null,
  expected_staff_name text not null,
  expected_device_identifier text not null,
  expected_barcode text not null,
  expected_item_number text not null,
  expected_product_name text not null,
  expected_inventory_owner_email text not null,
  status text not null default 'armed',
  safety_fence_until timestamptz not null,
  prearm_request_hash text,
  prearm_requested_fence_until timestamptz,
  cleanup_owner_digest text,
  cleanup_generation bigint not null default 0,
  cleanup_lease_expires_at timestamptz,
  cleanup_receipt jsonb,
  cleanup_receipt_hmac text,
  provision_attempt_window_started_at timestamptz not null default clock_timestamp(),
  provision_attempt_count integer not null default 0,
  rotation_attempt_window_started_at timestamptz not null default clock_timestamp(),
  rotation_attempt_count integer not null default 0,
  cleanup_attempt_window_started_at timestamptz not null default clock_timestamp(),
  cleanup_attempt_count integer not null default 0,
  result_issue_window_started_at timestamptz not null default clock_timestamp(),
  result_issue_count integer not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  provisioned_at timestamptz,
  cleanup_started_at timestamptz,
  cleanup_completed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  constraint task_150_qa_run_hmac_check check (run_hmac ~ '^[0-9a-f]{64}$'),
  constraint task_150_qa_manifest_hmac_check check (manifest_hmac ~ '^[0-9a-f]{64}$'),
  constraint task_150_qa_actor_hmac_check check (bootstrap_actor_hmac ~ '^[0-9a-f]{64}$'),
  constraint task_150_qa_bootstrap_snapshot_check check (
    bootstrap_snapshot_digest ~ '^[0-9a-f]{64}$'
  ),
  constraint task_150_qa_begin_hash_check check (begin_request_hash ~ '^[0-9a-f]{64}$'),
  constraint task_150_qa_capability_digest_check check (
    provision_capability_digest ~ '^[0-9a-f]{64}$'
    and cleanup_capability_digest ~ '^[0-9a-f]{64}$'
    and result_capability_digest ~ '^[0-9a-f]{64}$'
    and (
      pending_cleanup_capability_digest is null
      or pending_cleanup_capability_digest ~ '^[0-9a-f]{64}$'
    )
  ),
  constraint task_150_qa_environment_check check (environment = 'staging'),
  constraint task_150_qa_template_check check (
    fixture_template = 'asus-product-image-phase-b-fixture-v1'
  ),
  constraint task_150_qa_status_check check (
    status in (
      'armed', 'provisioned', 'cleanup_in_progress',
      'cleanup_recoverable', 'cleanup_invariant_blocked', 'cleaned', 'expired'
    )
  ),
  constraint task_150_qa_cleanup_fence_check check (
    safety_fence_until >= created_at + interval '2 hours 20 minutes'
    and safety_fence_until <= created_at + interval '3 hours'
  ),
  constraint task_150_qa_cleanup_generation_check check (cleanup_generation >= 0),
  constraint task_150_qa_rate_count_check check (
    provision_attempt_count between 0 and 3
    and rotation_attempt_count between 0 and 3
    and cleanup_attempt_count between 0 and 5
    and result_issue_count between 0 and 3
  ),
  constraint task_150_qa_pending_rotation_shape_check check (
    (
      pending_cleanup_capability_digest is null
      and pending_cleanup_capability_expires_at is null
      and pending_cleanup_target_expires_at is null
      and pending_cleanup_prepared_at is null
    )
    or (
      pending_cleanup_capability_digest is not null
      and pending_cleanup_capability_expires_at is not null
      and pending_cleanup_target_expires_at is not null
      and pending_cleanup_prepared_at is not null
      and pending_cleanup_capability_expires_at
        <= pending_cleanup_prepared_at + interval '10 minutes'
      and pending_cleanup_target_expires_at
        <= pending_cleanup_prepared_at + interval '3 hours'
    )
  ),
  constraint task_150_qa_capability_ttl_check check (
    cleanup_capability_expires_at
      <= cleanup_capability_issued_at + interval '3 hours'
    and result_capability_expires_at
      <= result_capability_issued_at + interval '60 minutes'
  ),
  constraint task_150_qa_provision_admission_shape_check check (
    (
      provision_admission_digest is null
      and provision_admission_expires_at is null
      and provision_admission_request_hash is null
    )
    or (
      provision_admission_digest ~ '^[0-9a-f]{64}$'
      and provision_admission_expires_at is not null
      and provision_admission_request_hash ~ '^[0-9a-f]{64}$'
    )
  ),
  constraint task_150_qa_receipt_shape_check check (
    (cleanup_receipt is null and cleanup_receipt_hmac is null)
    or (
      jsonb_typeof(cleanup_receipt) = 'object'
      and cleanup_receipt_hmac ~ '^[0-9a-f]{64}$'
      and cleanup_receipt->>'receiptHmac' = cleanup_receipt_hmac
      and not (cleanup_receipt ?| array[
        'shopId', 'staffId', 'productId', 'path', 'url', 'token',
        'credential', 'owner', 'generation'
      ])
    )
  )
);

create index if not exists task_150_qa_runs_actor_created_idx
  on app_private.task_150_win7pos_image_qa_runs (bootstrap_actor_hmac, created_at desc);

comment on table app_private.task_150_win7pos_image_qa_runs is
  'Private exact-ID manifest and fenced receipt state for staging-only TASK-150 QA.';

revoke all on table app_private.task_150_win7pos_image_qa_runs
  from public, anon, authenticated, service_role;
grant select on table app_private.task_150_win7pos_image_qa_runs to service_role;

create or replace function app_private.task_150_qa_preserve_terminal_receipt_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.cleanup_receipt is not null
    and (
      new.cleanup_receipt is distinct from old.cleanup_receipt
      or new.cleanup_receipt_hmac is distinct from old.cleanup_receipt_hmac
    ) then
    raise exception 'TASK-150 terminal receipt is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function app_private.task_150_qa_preserve_terminal_receipt_v1()
  from public, anon, authenticated, service_role;
drop trigger if exists task_150_qa_preserve_terminal_receipt_trigger
  on app_private.task_150_win7pos_image_qa_runs;
create trigger task_150_qa_preserve_terminal_receipt_trigger
before update on app_private.task_150_win7pos_image_qa_runs
for each row execute function app_private.task_150_qa_preserve_terminal_receipt_v1();

create table if not exists app_private.task_150_win7pos_image_qa_auth_assets (
  run_hmac text not null references app_private.task_150_win7pos_image_qa_runs(run_hmac),
  asset_kind text not null,
  asset_id uuid not null,
  enrolled_at timestamptz not null default clock_timestamp(),
  primary key (run_hmac, asset_kind, asset_id),
  unique (asset_kind, asset_id),
  constraint task_150_qa_auth_asset_kind_check check (
    asset_kind in ('device', 'device_credential', 'session')
  )
);

create table if not exists app_private.task_150_win7pos_image_qa_budget_rows (
  run_hmac text not null references app_private.task_150_win7pos_image_qa_runs(run_hmac),
  shop_id uuid not null,
  principal_kind text not null,
  principal_id uuid not null,
  window_started_at timestamptz not null,
  admitted_count integer not null,
  source_updated_at timestamptz not null,
  enrolled_at timestamptz not null default clock_timestamp(),
  primary key (run_hmac, principal_kind, principal_id),
  unique (shop_id, principal_kind, principal_id),
  constraint task_150_qa_budget_kind_check check (
    principal_kind in ('shop', 'staff', 'node_audit_shop', 'node_audit_staff')
  )
);

revoke all on table app_private.task_150_win7pos_image_qa_auth_assets
  from public, anon, authenticated, service_role;
revoke all on table app_private.task_150_win7pos_image_qa_budget_rows
  from public, anon, authenticated, service_role;
grant select on table app_private.task_150_win7pos_image_qa_auth_assets to service_role;
grant select on table app_private.task_150_win7pos_image_qa_budget_rows to service_role;

create or replace function app_private.task_150_qa_enroll_device_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run app_private.task_150_win7pos_image_qa_runs%rowtype;
begin
  select run.* into v_run
  from app_private.task_150_win7pos_image_qa_runs run
  where run.run_shop_id = new.shop_id
    and run.status in (
      'provisioned', 'cleanup_in_progress', 'cleanup_recoverable',
      'cleanup_invariant_blocked'
    )
  for update;
  if not found then return new; end if;
  if v_run.status <> 'provisioned' then
    raise exception 'TASK-150 actor creation blocked during cleanup'
      using errcode = '55000';
  end if;
  if new.device_identifier <> v_run.expected_device_identifier
    or (v_run.run_device_id is not null and v_run.run_device_id <> new.shop_device_id) then
    raise exception 'TASK-150 device scope drift' using errcode = '23514';
  end if;
  insert into app_private.task_150_win7pos_image_qa_auth_assets(
    run_hmac, asset_kind, asset_id
  ) values (v_run.run_hmac, 'device', new.shop_device_id)
  on conflict do nothing;
  update app_private.task_150_win7pos_image_qa_runs
  set run_device_id = coalesce(run_device_id, new.shop_device_id),
      updated_at = clock_timestamp()
  where run_hmac = v_run.run_hmac;
  return new;
end;
$$;

create or replace function app_private.task_150_qa_enroll_device_credential_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run app_private.task_150_win7pos_image_qa_runs%rowtype;
begin
  select run.* into v_run
  from app_private.task_150_win7pos_image_qa_runs run
  where run.run_shop_id = new.shop_id
    and run.status in (
      'provisioned', 'cleanup_in_progress', 'cleanup_recoverable',
      'cleanup_invariant_blocked'
    )
  for update;
  if not found then return new; end if;
  if v_run.status <> 'provisioned' then
    raise exception 'TASK-150 credential creation blocked during cleanup'
      using errcode = '55000';
  end if;
  if new.staff_id <> v_run.run_staff_id
    or new.shop_device_id is distinct from v_run.run_device_id then
    raise exception 'TASK-150 credential scope drift' using errcode = '23514';
  end if;
  insert into app_private.task_150_win7pos_image_qa_auth_assets(
    run_hmac, asset_kind, asset_id
  ) values (v_run.run_hmac, 'device_credential', new.pos_device_credential_id)
  on conflict do nothing;
  return new;
end;
$$;

create or replace function app_private.task_150_qa_enroll_session_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run app_private.task_150_win7pos_image_qa_runs%rowtype;
begin
  select run.* into v_run
  from app_private.task_150_win7pos_image_qa_runs run
  where run.run_shop_id = new.shop_id
    and run.status in (
      'provisioned', 'cleanup_in_progress', 'cleanup_recoverable',
      'cleanup_invariant_blocked'
    )
  for update;
  if not found then return new; end if;
  if v_run.status <> 'provisioned' then
    raise exception 'TASK-150 session creation blocked during cleanup'
      using errcode = '55000';
  end if;
  if new.staff_id <> v_run.run_staff_id
    or new.shop_device_id is distinct from v_run.run_device_id
    or not exists (
      select 1 from app_private.task_150_win7pos_image_qa_auth_assets asset
      where asset.run_hmac = v_run.run_hmac
        and asset.asset_kind = 'device_credential'
        and asset.asset_id = new.pos_device_credential_id
    ) then
    raise exception 'TASK-150 session scope drift' using errcode = '23514';
  end if;
  insert into app_private.task_150_win7pos_image_qa_auth_assets(
    run_hmac, asset_kind, asset_id
  ) values (v_run.run_hmac, 'session', new.pos_session_id)
  on conflict do nothing;
  return new;
end;
$$;

create or replace function app_private.task_150_qa_enroll_budget_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run app_private.task_150_win7pos_image_qa_runs%rowtype;
begin
  select run.* into v_run
  from app_private.task_150_win7pos_image_qa_runs run
  where run.run_shop_id = new.shop_id
    and run.status in (
      'provisioned', 'cleanup_in_progress', 'cleanup_recoverable',
      'cleanup_invariant_blocked'
    )
  for update;
  if not found then return new; end if;
  if v_run.status <> 'provisioned' then
    raise exception 'TASK-150 write budget mutation blocked during cleanup'
      using errcode = '55000';
  end if;
  if (
      new.principal_kind in ('shop', 'node_audit_shop')
      and new.principal_id <> v_run.run_shop_id
    ) or (
      new.principal_kind in ('staff', 'node_audit_staff')
      and new.principal_id <> v_run.run_staff_id
    ) then
    raise exception 'TASK-150 budget scope drift' using errcode = '23514';
  end if;
  insert into app_private.task_150_win7pos_image_qa_budget_rows(
    run_hmac, shop_id, principal_kind, principal_id,
    window_started_at, admitted_count, source_updated_at
  ) values (
    v_run.run_hmac, new.shop_id, new.principal_kind, new.principal_id,
    new.window_started_at, new.admitted_count, new.updated_at
  )
  on conflict (run_hmac, principal_kind, principal_id) do update
  set window_started_at = excluded.window_started_at,
      admitted_count = excluded.admitted_count,
      source_updated_at = excluded.source_updated_at;
  return new;
end;
$$;

revoke all on function app_private.task_150_qa_enroll_device_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.task_150_qa_enroll_device_credential_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.task_150_qa_enroll_session_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.task_150_qa_enroll_budget_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists task_150_qa_enroll_device_trigger on public.shop_devices;
create trigger task_150_qa_enroll_device_trigger
after insert on public.shop_devices
for each row execute function app_private.task_150_qa_enroll_device_v1();

drop trigger if exists task_150_qa_enroll_device_credential_trigger
  on public.pos_device_credentials;
create trigger task_150_qa_enroll_device_credential_trigger
after insert on public.pos_device_credentials
for each row execute function app_private.task_150_qa_enroll_device_credential_v1();

drop trigger if exists task_150_qa_enroll_session_trigger on public.pos_sessions;
create trigger task_150_qa_enroll_session_trigger
after insert on public.pos_sessions
for each row execute function app_private.task_150_qa_enroll_session_v1();

drop trigger if exists task_150_qa_enroll_budget_trigger
  on app_private.pos_product_image_mutation_budgets;
create trigger task_150_qa_enroll_budget_trigger
after insert or update on app_private.pos_product_image_mutation_budgets
for each row execute function app_private.task_150_qa_enroll_budget_v1();

create or replace function app_private.task_150_qa_block_image_version_after_cleanup_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from app_private.task_150_win7pos_image_qa_runs run
    where run.run_shop_id = new.shop_id
      and run.run_product_id = new.product_id
      and run.status in (
        'cleanup_in_progress', 'cleanup_recoverable',
        'cleanup_invariant_blocked', 'cleaned'
      )
    for update
  ) then
    raise exception 'TASK-150 image mutation blocked during cleanup'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function app_private.task_150_qa_block_receipt_after_cleanup_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from app_private.task_150_win7pos_image_qa_runs run
    where run.run_shop_id = new.shop_id
      and run.run_product_id = new.product_id
      and run.status in (
        'cleanup_in_progress', 'cleanup_recoverable',
        'cleanup_invariant_blocked', 'cleaned'
      )
    for update
  ) then
    raise exception 'TASK-150 receipt mutation blocked during cleanup'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function app_private.task_150_qa_block_sync_after_cleanup_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from app_private.task_150_win7pos_image_qa_runs run
    where run.run_shop_id = new.shop_id
      and new.entity_ids @> jsonb_build_object(
        'product_ids', jsonb_build_array(run.run_product_id)
      )
      and run.status in (
        'cleanup_in_progress', 'cleanup_recoverable',
        'cleanup_invariant_blocked', 'cleaned'
      )
    for update
  ) then
    raise exception 'TASK-150 sync mutation blocked during cleanup'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function app_private.task_150_qa_block_image_version_after_cleanup_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.task_150_qa_block_receipt_after_cleanup_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.task_150_qa_block_sync_after_cleanup_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists task_150_qa_block_image_version_after_cleanup_trigger
  on public.inventory_product_image_versions;
create trigger task_150_qa_block_image_version_after_cleanup_trigger
before insert or update on public.inventory_product_image_versions
for each row execute function app_private.task_150_qa_block_image_version_after_cleanup_v1();

drop trigger if exists task_150_qa_block_receipt_after_cleanup_trigger
  on public.pos_product_image_mutation_receipts;
create trigger task_150_qa_block_receipt_after_cleanup_trigger
before insert or update on public.pos_product_image_mutation_receipts
for each row execute function app_private.task_150_qa_block_receipt_after_cleanup_v1();

drop trigger if exists task_150_qa_block_sync_after_cleanup_trigger
  on public.sync_events;
create trigger task_150_qa_block_sync_after_cleanup_trigger
before insert or update on public.sync_events
for each row execute function app_private.task_150_qa_block_sync_after_cleanup_v1();

create or replace function app_private.task_150_qa_safe_counts()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'activeRunOwnedSessions', 0,
    'imageVersions', 0,
    'products', 0,
    'receipts', 0,
    'storageObjects', 0,
    'syncEvents', 0,
    'writeBudgetRows', 0
  );
$$;

revoke all on function app_private.task_150_qa_safe_counts()
  from public, anon, authenticated;

create or replace function app_private.task_150_qa_bootstrap_snapshot_v1(
  p_source_shop_id uuid,
  p_staff_id uuid,
  p_profile_id uuid,
  p_excluded_run_shop_id uuid
)
returns text
language sql
stable
set search_path = ''
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'profile', coalesce(
            (select to_jsonb(profile) from public.profiles profile
             where profile.profile_id = p_profile_id),
            'null'::jsonb
          ),
          'shop', coalesce(
            (select to_jsonb(shop) from public.shops shop
             where shop.shop_id = p_source_shop_id),
            'null'::jsonb
          ),
          'staff', coalesce(
            (select to_jsonb(staff) from public.staff_accounts staff
             where staff.staff_id = p_staff_id
               and staff.shop_id = p_source_shop_id),
            'null'::jsonb
          ),
          'memberships', coalesce(
            (select jsonb_agg(to_jsonb(member) order by member.shop_id)
             from public.shop_members member
             where member.profile_id = p_profile_id
               and member.shop_id <> p_excluded_run_shop_id),
            '[]'::jsonb
          ),
          'inventorySources', coalesce(
            (select jsonb_agg(
               to_jsonb(source) order by source.shop_inventory_source_id
             )
             from public.shop_inventory_sources source
             where source.owner_user_id = p_profile_id
               and source.shop_id <> p_excluded_run_shop_id),
            '[]'::jsonb
          )
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function app_private.task_150_qa_bootstrap_snapshot_v1(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated;

create or replace function public.task_150_win7pos_image_qa_begin_v1(
  p_run_hmac text,
  p_manifest_hmac text,
  p_bootstrap_actor_hmac text,
  p_begin_request_hash text,
  p_provision_capability_digest text,
  p_cleanup_capability_digest text,
  p_result_capability_digest text,
  p_bootstrap_source_shop_id uuid,
  p_bootstrap_staff_id uuid,
  p_fixture_template text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_existing app_private.task_150_win7pos_image_qa_runs%rowtype;
  v_profile_id uuid;
  v_suffix text;
  v_shop_code text;
  v_staff_code text;
  v_shop_id uuid := extensions.gen_random_uuid();
  v_staff_id uuid := extensions.gen_random_uuid();
  v_mapping_id uuid := extensions.gen_random_uuid();
  v_product_id uuid := extensions.gen_random_uuid();
  v_inventory_owner_id uuid := extensions.gen_random_uuid();
  v_now timestamptz := clock_timestamp();
begin
  perform set_config('lock_timeout', '3s', true);
  perform set_config('statement_timeout', '15s', true);

  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    or p_run_hmac !~ '^[0-9a-f]{64}$'
    or p_manifest_hmac !~ '^[0-9a-f]{64}$'
    or p_bootstrap_actor_hmac !~ '^[0-9a-f]{64}$'
    or p_begin_request_hash !~ '^[0-9a-f]{64}$'
    or p_provision_capability_digest !~ '^[0-9a-f]{64}$'
    or p_cleanup_capability_digest !~ '^[0-9a-f]{64}$'
    or p_result_capability_digest !~ '^[0-9a-f]{64}$'
    or p_fixture_template <> 'asus-product-image-phase-b-fixture-v1' then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_run_hmac || ':task150-win7pos-image-qa', 0
  ));

  select * into v_existing
  from app_private.task_150_win7pos_image_qa_runs
  where run_hmac = p_run_hmac
  for update;

  if found then
    if v_existing.manifest_hmac = p_manifest_hmac
      and v_existing.bootstrap_actor_hmac = p_bootstrap_actor_hmac
      and v_existing.begin_request_hash = p_begin_request_hash
      and v_existing.bootstrap_source_shop_id = p_bootstrap_source_shop_id
      and v_existing.bootstrap_staff_id = p_bootstrap_staff_id
      and v_existing.fixture_template = p_fixture_template
      and v_existing.provision_capability_digest = p_provision_capability_digest
      and v_existing.cleanup_capability_digest = p_cleanup_capability_digest
      and v_existing.result_capability_digest = p_result_capability_digest then
      if v_existing.status = 'expired'
        or (
          v_existing.status = 'armed'
          and v_existing.provision_capability_expires_at <= v_now
        ) then
        return jsonb_build_object(
          'ok', false,
          'code', 'begin_expired',
          'runHmac', v_existing.run_hmac,
          'manifestHmac', v_existing.manifest_hmac
        );
      end if;
      return jsonb_build_object(
        'ok', true,
        'code', 'begin_replayed',
        'runHmac', v_existing.run_hmac,
        'manifestHmac', v_existing.manifest_hmac,
        'status', v_existing.status,
        'credentialsReissued', false,
        'serverTime', to_char(clock_timestamp(), 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      );
    end if;
    return jsonb_build_object('ok', false, 'code', 'binding_conflict');
  end if;

  select staff.created_by_profile_id into v_profile_id
  from public.staff_accounts staff
  join public.profiles profile
    on profile.profile_id = staff.created_by_profile_id
   and profile.profile_status = 'active'
  where staff.staff_id = p_bootstrap_staff_id
    and staff.shop_id = p_bootstrap_source_shop_id
    and staff.status = 'active'
    and staff.role_key = 'pos_admin'
  for share of staff;

  if v_profile_id is null then
    return jsonb_build_object('ok', false, 'code', 'bootstrap_actor_denied');
  end if;

  -- Cross-run admission is serialized by the authenticated bootstrap actor.
  -- One unfinished run and three durable starts per six hours are sufficient
  -- for the authorized staging workflow and prevent marker-based quota bypass.
  perform pg_advisory_xact_lock(hashtextextended(
    p_bootstrap_actor_hmac || ':task150-actor-quota', 0
  ));
  -- Expired armed manifests own no fixture DML. Retire them under the actor
  -- quota lock so an abandoned/lost begin cannot block every future run.
  update app_private.task_150_win7pos_image_qa_runs run
  set status = 'expired',
      cleanup_capability_revoked_at = v_now,
      cleanup_completed_at = v_now,
      updated_at = v_now
  where run.bootstrap_actor_hmac = p_bootstrap_actor_hmac
    and run.status = 'armed'
    and run.provision_capability_expires_at <= v_now
    and not exists (select 1 from public.shops shop where shop.shop_id = run.run_shop_id)
    and not exists (select 1 from public.staff_accounts staff where staff.staff_id = run.run_staff_id)
    and not exists (select 1 from public.shop_inventory_sources source where source.shop_inventory_source_id = run.run_mapping_id)
    and not exists (select 1 from public.inventory_products product where product.id = run.run_product_id)
    and not exists (select 1 from auth.users owner_row where owner_row.id = run.run_inventory_owner_id);
  if exists (
    select 1
    from app_private.task_150_win7pos_image_qa_runs run
    where run.bootstrap_actor_hmac = p_bootstrap_actor_hmac
      and run.status not in ('cleaned', 'expired')
  ) then
    return jsonb_build_object('ok', false, 'code', 'actor_run_active');
  end if;
  if (
    select count(*)
    from app_private.task_150_win7pos_image_qa_runs run
    where run.bootstrap_actor_hmac = p_bootstrap_actor_hmac
      and run.created_at > v_now - interval '6 hours'
  ) >= 3 then
    return jsonb_build_object(
      'ok', false,
      'code', 'rate_limited',
      'retryAfterAt', (
        select to_char(
          min(run.created_at) + interval '6 hours',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )
        from app_private.task_150_win7pos_image_qa_runs run
        where run.bootstrap_actor_hmac = p_bootstrap_actor_hmac
          and run.created_at > v_now - interval '6 hours'
      )
    );
  end if;

  v_suffix := upper(substr(p_run_hmac, 1, 32));
  -- Historical schemas cap both codes at 32 characters. Keep the full
  -- 128-bit namespace in names/barcodes/device identity while deriving
  -- collision-resistant bounded codes from the same run HMAC.
  v_shop_code := 'AP' || substr(v_suffix, 1, 30);
  v_staff_code := 'P' || substr(v_suffix, 1, 31);

  if exists (
    select 1 from public.shops
    where shop_code = v_shop_code
       or shop_name = 'ASUS PRODUCT IMAGE QA ' || v_suffix
  ) or exists (
    select 1 from public.staff_accounts
    where staff_code = v_staff_code
       or display_name = 'ASUS PRODUCT IMAGE QA STAFF ' || v_suffix
  ) or exists (
    select 1 from public.inventory_products
    where barcode = 'PIB' || v_suffix
       or item_number = 'PIB-' || v_suffix
       or product_name = 'ASUS PRODUCT IMAGE QA PRODUCT ' || v_suffix
  ) then
    return jsonb_build_object('ok', false, 'code', 'fixture_scope_conflict');
  end if;

  -- The durable manifest exists before any fixture DML.
  insert into app_private.task_150_win7pos_image_qa_runs (
    run_hmac,
    manifest_hmac,
    fixture_template,
    bootstrap_source_shop_id,
    bootstrap_staff_id,
    bootstrap_profile_id,
    bootstrap_actor_hmac,
    bootstrap_snapshot_digest,
    begin_request_hash,
    provision_capability_digest,
    provision_capability_expires_at,
    cleanup_capability_digest,
    cleanup_capability_expires_at,
    result_capability_digest,
    cleanup_capability_issued_at,
    result_capability_issued_at,
    run_shop_id,
    run_staff_id,
    run_mapping_id,
    run_product_id,
    run_inventory_owner_id,
    result_capability_expires_at,
    expected_shop_code,
    expected_shop_name,
    expected_staff_code,
    expected_staff_name,
    expected_device_identifier,
    expected_barcode,
    expected_item_number,
    expected_product_name,
    expected_inventory_owner_email,
    safety_fence_until,
    created_at
  ) values (
    p_run_hmac,
    p_manifest_hmac,
    p_fixture_template,
    p_bootstrap_source_shop_id,
    p_bootstrap_staff_id,
    v_profile_id,
    p_bootstrap_actor_hmac,
    app_private.task_150_qa_bootstrap_snapshot_v1(
      p_bootstrap_source_shop_id,
      p_bootstrap_staff_id,
      v_profile_id,
      v_shop_id
    ),
    p_begin_request_hash,
    p_provision_capability_digest,
    v_now + interval '10 minutes',
    p_cleanup_capability_digest,
    v_now + interval '3 hours',
    p_result_capability_digest,
    v_now,
    v_now,
    v_shop_id,
    v_staff_id,
    v_mapping_id,
    v_product_id,
    v_inventory_owner_id,
    v_now + interval '60 minutes',
    v_shop_code,
    'ASUS PRODUCT IMAGE QA ' || v_suffix,
    v_staff_code,
    'ASUS PRODUCT IMAGE QA STAFF ' || v_suffix,
    'ASUSPIB_DEVICE_' || v_suffix,
    'PIB' || v_suffix,
    'PIB-' || v_suffix,
    'ASUS PRODUCT IMAGE QA PRODUCT ' || v_suffix,
    'task150-' || lower(v_suffix) || '@example.invalid',
    v_now + interval '2 hours 20 minutes',
    v_now
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'armed',
    'runHmac', p_run_hmac,
    'manifestHmac', p_manifest_hmac,
    'status', 'armed',
    'serverTime', to_char(clock_timestamp(), 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );
end;
$$;

revoke all on function public.task_150_win7pos_image_qa_begin_v1(
  text, text, text, text, text, text, text, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.task_150_win7pos_image_qa_begin_v1(
  text, text, text, text, text, text, text, uuid, uuid, text
) to service_role;

-- Cheap, capability-bound admission runs before the intentionally expensive
-- staff credential KDF. Invalid public requests therefore cannot spend scrypt
-- CPU/memory, while an exact response-loss retry remains zero-DML.
create or replace function public.task_150_win7pos_image_qa_provision_admit_v1(
  p_run_hmac text,
  p_manifest_hmac text,
  p_provision_capability_digest text,
  p_request_hash text,
  p_admission_digest text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run app_private.task_150_win7pos_image_qa_runs%rowtype;
  v_now timestamptz := clock_timestamp();
  v_expires timestamptz;
begin
  perform set_config('lock_timeout', '3s', true);
  perform set_config('statement_timeout', '10s', true);
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    or p_run_hmac !~ '^[0-9a-f]{64}$'
    or p_manifest_hmac !~ '^[0-9a-f]{64}$'
    or p_provision_capability_digest !~ '^[0-9a-f]{64}$'
    or p_request_hash !~ '^[0-9a-f]{64}$'
    or p_admission_digest !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_run_hmac || ':task150-win7pos-image-qa', 0
  ));
  select * into v_run
  from app_private.task_150_win7pos_image_qa_runs
  where run_hmac = p_run_hmac
  for update;

  if v_run.run_hmac is null
    or v_run.manifest_hmac <> p_manifest_hmac
    or v_run.provision_capability_digest <> p_provision_capability_digest then
    return jsonb_build_object('ok', false, 'code', 'capability_denied');
  end if;
  if v_run.status = 'provisioned' then
    if v_run.provision_request_hash = p_request_hash then
      return jsonb_build_object(
        'ok', true, 'code', 'provision_replayed',
        'credentialsReissued', false
      );
    end if;
    return jsonb_build_object('ok', false, 'code', 'request_conflict');
  end if;
  if v_run.status <> 'armed'
    or v_run.provision_consumed_at is not null
    or v_run.provision_capability_expires_at <= v_now then
    return jsonb_build_object('ok', false, 'code', 'capability_expired');
  end if;

  if v_run.provision_admission_request_hash = p_request_hash
    and v_run.provision_admission_digest = p_admission_digest
    and v_run.provision_admission_expires_at > v_now then
    return jsonb_build_object(
      'ok', false, 'code', 'provision_in_progress',
      'retryAfterAt', to_char(
        v_run.provision_admission_expires_at,
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    );
  end if;
  if v_run.provision_admission_expires_at > v_now then
    return jsonb_build_object('ok', false, 'code', 'request_conflict');
  end if;
  if v_run.provision_attempt_window_started_at <= v_now - interval '15 minutes' then
    v_run.provision_attempt_count := 1;
    v_run.provision_attempt_window_started_at := v_now;
  elsif v_run.provision_attempt_count >= 3 then
    return jsonb_build_object(
      'ok', false, 'code', 'rate_limited',
      'retryAfterAt', to_char(
        v_run.provision_attempt_window_started_at + interval '15 minutes',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    );
  else
    v_run.provision_attempt_count := v_run.provision_attempt_count + 1;
  end if;
  v_expires := least(v_now + interval '2 minutes', v_run.provision_capability_expires_at);
  update app_private.task_150_win7pos_image_qa_runs
  set provision_admission_digest = p_admission_digest,
      provision_admission_expires_at = v_expires,
      provision_admission_request_hash = p_request_hash,
      provision_attempt_window_started_at = v_run.provision_attempt_window_started_at,
      provision_attempt_count = v_run.provision_attempt_count,
      updated_at = v_now
  where run_hmac = p_run_hmac;
  return jsonb_build_object(
    'ok', true, 'code', 'provision_admitted',
    'expiresAt', to_char(v_expires, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );
end;
$$;

revoke all on function public.task_150_win7pos_image_qa_provision_admit_v1(
  text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.task_150_win7pos_image_qa_provision_admit_v1(
  text, text, text, text, text
) to service_role;

create or replace function public.task_150_win7pos_image_qa_provision_v1(
  p_run_hmac text,
  p_manifest_hmac text,
  p_provision_capability_digest text,
  p_request_hash text,
  p_admission_digest text,
  p_credential_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run app_private.task_150_win7pos_image_qa_runs%rowtype;
  v_shop_id uuid;
  v_staff_id uuid;
  v_mapping_id uuid;
  v_product_id uuid;
begin
  perform set_config('lock_timeout', '3s', true);
  perform set_config('statement_timeout', '30s', true);

  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    or p_run_hmac !~ '^[0-9a-f]{64}$'
    or p_manifest_hmac !~ '^[0-9a-f]{64}$'
    or p_provision_capability_digest !~ '^[0-9a-f]{64}$'
    or p_request_hash !~ '^[0-9a-f]{64}$'
    or p_admission_digest !~ '^[0-9a-f]{64}$'
    or length(btrim(coalesce(p_credential_hash, ''))) < 32 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_run_hmac || ':task150-win7pos-image-qa', 0
  ));
  select * into v_run
  from app_private.task_150_win7pos_image_qa_runs
  where run_hmac = p_run_hmac
  for update;

  if v_run.run_hmac is null
    or v_run.manifest_hmac <> p_manifest_hmac
    or v_run.provision_capability_digest <> p_provision_capability_digest then
    return jsonb_build_object('ok', false, 'code', 'capability_denied');
  end if;

  -- Exact response-loss replay is receipt-only: no counters, timestamps or
  -- fixture rows are touched before returning the durable outcome.
  if v_run.status = 'provisioned' then
    if v_run.provision_request_hash = p_request_hash then
      return jsonb_build_object(
        'ok', true,
        'code', 'provision_replayed',
        'status', 'provisioned',
        'credentialsReissued', false,
        'runHmac', v_run.run_hmac,
        'manifestHmac', v_run.manifest_hmac
      );
    end if;
    return jsonb_build_object('ok', false, 'code', 'request_conflict');
  end if;

  if v_run.status <> 'armed'
    or v_run.provision_consumed_at is not null
    or v_run.provision_capability_expires_at <= clock_timestamp()
    or v_run.provision_admission_digest <> p_admission_digest
    or v_run.provision_admission_request_hash <> p_request_hash
    or v_run.provision_admission_expires_at <= clock_timestamp() then
    return jsonb_build_object('ok', false, 'code', 'capability_expired');
  end if;

  v_shop_id := v_run.run_shop_id;
  v_staff_id := v_run.run_staff_id;
  v_mapping_id := v_run.run_mapping_id;
  v_product_id := v_run.run_product_id;

  insert into auth.users (
    instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_run.run_inventory_owner_id,
    'authenticated',
    'authenticated',
    v_run.expected_inventory_owner_email,
    jsonb_build_object(
      'provider', 'email',
      'providers', jsonb_build_array('email'),
      'task150QaRunHmac', v_run.run_hmac
    ),
    '{}'::jsonb,
    clock_timestamp(),
    clock_timestamp()
  );

  insert into public.shops (
    shop_id, shop_code, shop_name, shop_status, created_by_profile_id, updated_at
  ) values (
    v_shop_id,
    v_run.expected_shop_code,
    v_run.expected_shop_name,
    'active',
    v_run.bootstrap_profile_id,
    clock_timestamp()
  ) returning shop_id into v_shop_id;

  insert into public.shop_members (
    profile_id, shop_id, role_key, membership_status, invited_by_profile_id
  ) values (
    v_run.bootstrap_profile_id,
    v_shop_id,
    'shop_owner',
    'active',
    v_run.bootstrap_profile_id
  );

  insert into public.staff_role_permissions (
    shop_id, role_key, permission_key, enabled, updated_by_profile_id, updated_at
  ) values
    (v_shop_id, 'pos_admin', 'catalog.read', true, v_run.bootstrap_profile_id, clock_timestamp()),
    (v_shop_id, 'pos_admin', 'catalog.write', true, v_run.bootstrap_profile_id, clock_timestamp())
  on conflict (shop_id, role_key, permission_key)
  do update set enabled = true, updated_at = excluded.updated_at;

  insert into public.staff_accounts (
    staff_id, shop_id, staff_code, display_name, role_key, status,
    credential_kind, credential_hash, credential_updated_at,
    credential_expires_at, must_change_credential, credential_version,
    credential_status, created_by_profile_id, updated_by_profile_id, updated_at
  ) values (
    v_staff_id,
    v_shop_id,
    v_run.expected_staff_code,
    v_run.expected_staff_name,
    'pos_admin',
    'active',
    'password',
    btrim(p_credential_hash),
    clock_timestamp(),
    clock_timestamp() + interval '3 hours',
    false,
    1,
    'active',
    v_run.bootstrap_profile_id,
    v_run.bootstrap_profile_id,
    clock_timestamp()
  ) returning staff_id into v_staff_id;

  insert into public.shop_inventory_sources (
    shop_inventory_source_id, shop_id, source_kind, owner_user_id, mapping_state,
    verified_at, verified_by_profile_id, created_by_profile_id
  ) values (
    v_mapping_id,
    v_shop_id,
    'mobile_owner',
    v_run.run_inventory_owner_id,
    'mapped',
    clock_timestamp(),
    v_run.bootstrap_profile_id,
    v_run.bootstrap_profile_id
  ) returning shop_inventory_source_id into v_mapping_id;

  insert into public.inventory_products (
    id, barcode, item_number, product_name, purchase_price, retail_price,
    stock_quantity, owner_user_id, shop_id
  ) values (
    v_product_id,
    v_run.expected_barcode,
    v_run.expected_item_number,
    v_run.expected_product_name,
    149,
    249,
    3,
    v_run.run_inventory_owner_id,
    v_shop_id
  );

  update app_private.task_150_win7pos_image_qa_runs
  set provision_request_hash = p_request_hash,
      provision_consumed_at = clock_timestamp(),
      provision_admission_digest = null,
      provision_admission_expires_at = null,
      provision_admission_request_hash = null,
      provisioned_at = clock_timestamp(),
      status = 'provisioned',
      updated_at = clock_timestamp()
  where run_hmac = p_run_hmac
    and status = 'armed'
    and provision_consumed_at is null;

  if not found then
    raise exception 'TASK-150 provision fence lost' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'provisioned',
    'status', 'provisioned',
    'credentialsReissued', true,
    'runHmac', v_run.run_hmac,
    'manifestHmac', v_run.manifest_hmac,
    'shopId', v_shop_id,
    'staffId', v_staff_id,
    'productId', v_product_id,
    'shopCode', v_run.expected_shop_code,
    'staffCode', v_run.expected_staff_code,
    'deviceIdentifier', v_run.expected_device_identifier,
    'serverTime', to_char(clock_timestamp(), 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'fixture_scope_conflict');
end;
$$;

revoke all on function public.task_150_win7pos_image_qa_provision_v1(
  text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.task_150_win7pos_image_qa_provision_v1(
  text, text, text, text, text, text
) to service_role;

create or replace function public.task_150_win7pos_image_qa_prearm_v1(
  p_run_hmac text,
  p_manifest_hmac text,
  p_cleanup_capability_digest text,
  p_request_hash text,
  p_requested_fence_until timestamptz,
  p_actor_hmac text,
  p_actor_shop_id uuid,
  p_actor_staff_id uuid,
  p_pos_session_id uuid,
  p_shop_device_id uuid,
  p_staff_credential_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run app_private.task_150_win7pos_image_qa_runs%rowtype;
  v_fence timestamptz;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    or p_requested_fence_until is null
    or p_request_hash !~ '^[0-9a-f]{64}$'
    or p_actor_hmac !~ '^[0-9a-f]{64}$'
    or p_staff_credential_version < 1 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_run_hmac || ':task150-win7pos-image-qa', 0
  ));
  select * into v_run
  from app_private.task_150_win7pos_image_qa_runs
  where run_hmac = p_run_hmac
  for update;

  if v_run.run_hmac is null
    or v_run.manifest_hmac <> p_manifest_hmac
    or v_run.cleanup_capability_digest <> p_cleanup_capability_digest
    or v_run.cleanup_capability_revoked_at is not null
    or v_run.cleanup_capability_expires_at <= clock_timestamp()
    or v_run.status <> 'provisioned'
    or v_run.bootstrap_source_shop_id <> p_actor_shop_id
    or v_run.bootstrap_staff_id <> p_actor_staff_id
    or v_run.bootstrap_actor_hmac <> p_actor_hmac
    or not exists (
      select 1
      from public.pos_sessions session_row
      join public.shop_devices device
        on device.shop_device_id = session_row.shop_device_id
      join public.staff_accounts staff
        on staff.staff_id = session_row.staff_id
      where session_row.pos_session_id = p_pos_session_id
        and session_row.shop_id = p_actor_shop_id
        and session_row.staff_id = p_actor_staff_id
        and session_row.shop_device_id = p_shop_device_id
        and session_row.staff_credential_version = p_staff_credential_version
        and session_row.status = 'active'
        and session_row.expires_at > clock_timestamp()
        and device.status = 'active'
        and staff.credential_version = p_staff_credential_version
        and staff.status = 'active'
    ) then
    return jsonb_build_object('ok', false, 'code', 'capability_denied');
  end if;

  v_fence := greatest(
    v_run.safety_fence_until,
    p_requested_fence_until,
    clock_timestamp() + interval '2 hours 20 minutes'
  );
  if p_requested_fence_until > v_run.created_at + interval '3 hours'
    or v_fence > v_run.created_at + interval '3 hours' then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  if v_run.cleanup_capability_expires_at < v_fence + interval '15 minutes' then
    return jsonb_build_object(
      'ok', false,
      'code', 'cleanup_capability_coverage_insufficient'
    );
  end if;

  -- Exact retries return the already-persisted result without sliding either
  -- the authoritative fence or its request timestamp.
  if v_run.prearm_request_hash = p_request_hash
    and v_run.prearm_requested_fence_until = p_requested_fence_until then
    return jsonb_build_object(
      'ok', true,
      'code', 'prearm_replayed',
      'fenceUntil', to_char(
        v_run.safety_fence_until, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
      'activeExpiresAt', to_char(
        v_run.cleanup_capability_expires_at,
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
      'nextRotationBy', null,
      'requiredCoverageUntil', to_char(
        v_run.safety_fence_until + interval '15 minutes',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    );
  end if;

  update app_private.task_150_win7pos_image_qa_runs
  set run_actor_hmac = bootstrap_actor_hmac,
      safety_fence_until = v_fence,
      prearm_request_hash = p_request_hash,
      prearm_requested_fence_until = p_requested_fence_until,
      updated_at = clock_timestamp()
  where run_hmac = p_run_hmac
    and status = 'provisioned';
  if not found then
    raise exception 'TASK-150 prearm fence lost' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'prearmed',
    'fenceUntil', to_char(v_fence, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'activeExpiresAt', to_char(
      v_run.cleanup_capability_expires_at,
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'nextRotationBy', null,
    'requiredCoverageUntil', to_char(
      v_fence + interval '15 minutes',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'serverTime', to_char(clock_timestamp(), 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );
end;
$$;

revoke all on function public.task_150_win7pos_image_qa_prearm_v1(
  text, text, text, text, timestamptz, text, uuid, uuid, uuid, uuid, integer
) from public, anon, authenticated;
grant execute on function public.task_150_win7pos_image_qa_prearm_v1(
  text, text, text, text, timestamptz, text, uuid, uuid, uuid, uuid, integer
) to service_role;

create or replace function public.task_150_win7pos_image_qa_rotation_prepare_v1(
  p_run_hmac text,
  p_manifest_hmac text,
  p_cleanup_capability_digest text,
  p_pending_capability_digest text,
  p_request_hash text,
  p_actor_hmac text,
  p_actor_shop_id uuid,
  p_actor_staff_id uuid,
  p_pos_session_id uuid,
  p_shop_device_id uuid,
  p_staff_credential_version integer,
  p_requested_target_expires_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run app_private.task_150_win7pos_image_qa_runs%rowtype;
  v_now timestamptz := clock_timestamp();
  v_target timestamptz;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    or p_cleanup_capability_digest !~ '^[0-9a-f]{64}$'
    or p_pending_capability_digest !~ '^[0-9a-f]{64}$'
    or p_pending_capability_digest = p_cleanup_capability_digest
    or p_request_hash !~ '^[0-9a-f]{64}$'
    or p_actor_hmac !~ '^[0-9a-f]{64}$'
    or p_staff_credential_version < 1
    or p_requested_target_expires_at is null then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_run_hmac || ':task150-win7pos-image-qa', 0
  ));
  select * into v_run
  from app_private.task_150_win7pos_image_qa_runs
  where run_hmac = p_run_hmac
  for update;

  if v_run.run_hmac is null
    or v_run.manifest_hmac <> p_manifest_hmac
    or v_run.cleanup_capability_digest <> p_cleanup_capability_digest
    or v_run.cleanup_capability_revoked_at is not null
    or v_run.cleanup_capability_expires_at <= v_now
    or v_run.status not in ('provisioned', 'cleanup_recoverable')
    or v_run.bootstrap_actor_hmac <> p_actor_hmac
    or v_run.bootstrap_source_shop_id <> p_actor_shop_id
    or v_run.bootstrap_staff_id <> p_actor_staff_id
    or not exists (
      select 1 from public.pos_sessions session_row
      where session_row.pos_session_id = p_pos_session_id
        and session_row.shop_id = p_actor_shop_id
        and session_row.staff_id = p_actor_staff_id
        and session_row.shop_device_id = p_shop_device_id
        and session_row.staff_credential_version = p_staff_credential_version
        and session_row.status = 'active'
        and session_row.expires_at > v_now
    ) then
    return jsonb_build_object('ok', false, 'code', 'capability_denied');
  end if;

  if v_run.pending_cleanup_capability_digest is not null
    and v_run.pending_cleanup_capability_expires_at > v_now then
    if v_run.pending_cleanup_capability_digest = p_pending_capability_digest
      and v_run.cleanup_rotation_request_hash = p_request_hash then
      return jsonb_build_object(
        'ok', true,
        'code', 'rotation_prepared',
        'pendingExpiresAt', to_char(
          v_run.pending_cleanup_capability_expires_at,
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        ),
        'targetExpiresAt', to_char(
          v_run.pending_cleanup_target_expires_at,
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        ),
        'coverageComplete', v_run.pending_cleanup_target_expires_at >= greatest(
          p_requested_target_expires_at,
          v_run.safety_fence_until + interval '15 minutes'
        ),
        'requiredCoverageUntil', to_char(
          greatest(
            p_requested_target_expires_at,
            v_run.safety_fence_until + interval '15 minutes'
          ),
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )
      );
    end if;
    return jsonb_build_object('ok', false, 'code', 'rotation_pending');
  end if;

  if v_run.rotation_attempt_window_started_at <= v_now - interval '15 minutes' then
    update app_private.task_150_win7pos_image_qa_runs
    set rotation_attempt_window_started_at = v_now,
        rotation_attempt_count = 1,
        updated_at = v_now
    where run_hmac = p_run_hmac;
  elsif v_run.rotation_attempt_count >= 3 then
    return jsonb_build_object(
      'ok', false, 'code', 'rate_limited',
      'retryAfterAt', to_char(
        v_run.rotation_attempt_window_started_at + interval '15 minutes',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    );
  else
    update app_private.task_150_win7pos_image_qa_runs
    set rotation_attempt_window_started_at = v_now,
        rotation_attempt_count = rotation_attempt_count + 1,
        updated_at = v_now
    where run_hmac = p_run_hmac;
  end if;

  v_target := least(
    v_now + interval '3 hours',
    greatest(
      v_now + interval '2 hours 20 minutes',
      p_requested_target_expires_at,
      v_run.safety_fence_until + interval '15 minutes'
    )
  );

  update app_private.task_150_win7pos_image_qa_runs
  set pending_cleanup_capability_digest = p_pending_capability_digest,
      pending_cleanup_capability_expires_at = v_now + interval '10 minutes',
      pending_cleanup_target_expires_at = v_target,
      pending_cleanup_prepared_at = v_now,
      cleanup_rotation_request_hash = p_request_hash,
      cleanup_rotation_ack_request_hash = null,
      updated_at = v_now
  where run_hmac = p_run_hmac
    and cleanup_capability_digest = p_cleanup_capability_digest;
  if not found then
    raise exception 'TASK-150 rotation prepare fence lost' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'rotation_prepared',
    'pendingExpiresAt', to_char(
      v_now + interval '10 minutes', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'targetExpiresAt', to_char(v_target, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'coverageComplete', v_target >= greatest(
      p_requested_target_expires_at,
      v_run.safety_fence_until + interval '15 minutes'
    ),
    'requiredCoverageUntil', to_char(
      greatest(
        p_requested_target_expires_at,
        v_run.safety_fence_until + interval '15 minutes'
      ),
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  );
end;
$$;

create or replace function public.task_150_win7pos_image_qa_rotation_ack_v1(
  p_run_hmac text,
  p_manifest_hmac text,
  p_current_capability_digest text,
  p_pending_capability_digest text,
  p_request_hash text,
  p_actor_hmac text,
  p_actor_shop_id uuid,
  p_actor_staff_id uuid,
  p_pos_session_id uuid,
  p_shop_device_id uuid,
  p_staff_credential_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run app_private.task_150_win7pos_image_qa_runs%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    or p_current_capability_digest !~ '^[0-9a-f]{64}$'
    or p_pending_capability_digest !~ '^[0-9a-f]{64}$'
    or p_request_hash !~ '^[0-9a-f]{64}$'
    or p_actor_hmac !~ '^[0-9a-f]{64}$'
    or p_staff_credential_version < 1 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_run_hmac || ':task150-win7pos-image-qa', 0
  ));
  select * into v_run
  from app_private.task_150_win7pos_image_qa_runs
  where run_hmac = p_run_hmac
  for update;

  if v_run.run_hmac is not null
    and v_run.manifest_hmac = p_manifest_hmac
    and v_run.cleanup_capability_digest = p_pending_capability_digest
    and v_run.cleanup_rotation_ack_request_hash = p_request_hash
    and v_run.cleanup_capability_revoked_at is null
    and v_run.cleanup_capability_expires_at > v_now then
    return jsonb_build_object(
      'ok', true,
      'code', 'rotation_ack_replayed',
      'activeExpiresAt', to_char(
        v_run.cleanup_capability_expires_at,
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    );
  end if;

  if v_run.run_hmac is null
    or v_run.manifest_hmac <> p_manifest_hmac
    or v_run.cleanup_capability_digest <> p_current_capability_digest
    or v_run.cleanup_capability_revoked_at is not null
    or v_run.cleanup_capability_expires_at <= v_now
    or v_run.pending_cleanup_capability_digest <> p_pending_capability_digest
    or v_run.pending_cleanup_capability_expires_at <= v_now
    or v_run.cleanup_rotation_request_hash is null
    or v_run.status not in ('provisioned', 'cleanup_recoverable')
    or v_run.bootstrap_actor_hmac <> p_actor_hmac
    or v_run.bootstrap_source_shop_id <> p_actor_shop_id
    or v_run.bootstrap_staff_id <> p_actor_staff_id
    or not exists (
      select 1 from public.pos_sessions session_row
      where session_row.pos_session_id = p_pos_session_id
        and session_row.shop_id = p_actor_shop_id
        and session_row.staff_id = p_actor_staff_id
        and session_row.shop_device_id = p_shop_device_id
        and session_row.staff_credential_version = p_staff_credential_version
        and session_row.status = 'active'
        and session_row.expires_at > v_now
    ) then
    return jsonb_build_object('ok', false, 'code', 'capability_denied');
  end if;

  update app_private.task_150_win7pos_image_qa_runs
  set cleanup_capability_digest = p_pending_capability_digest,
      cleanup_capability_issued_at = v_run.pending_cleanup_prepared_at,
      cleanup_capability_expires_at = v_run.pending_cleanup_target_expires_at,
      pending_cleanup_capability_digest = null,
      pending_cleanup_capability_expires_at = null,
      pending_cleanup_target_expires_at = null,
      pending_cleanup_prepared_at = null,
      cleanup_rotation_ack_request_hash = p_request_hash,
      updated_at = v_now
  where run_hmac = p_run_hmac
    and cleanup_capability_digest = p_current_capability_digest
    and pending_cleanup_capability_digest = p_pending_capability_digest;
  if not found then
    raise exception 'TASK-150 rotation ack fence lost' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'rotation_acked',
    'activeExpiresAt', to_char(
      v_run.pending_cleanup_target_expires_at,
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  );
end;
$$;

create or replace function public.task_150_win7pos_image_qa_result_issue_v1(
  p_run_hmac text,
  p_manifest_hmac text,
  p_result_capability_digest text,
  p_request_hash text,
  p_actor_hmac text,
  p_actor_shop_id uuid,
  p_actor_staff_id uuid,
  p_pos_session_id uuid,
  p_shop_device_id uuid,
  p_staff_credential_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run app_private.task_150_win7pos_image_qa_runs%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    or p_result_capability_digest !~ '^[0-9a-f]{64}$'
    or p_request_hash !~ '^[0-9a-f]{64}$'
    or p_actor_hmac !~ '^[0-9a-f]{64}$'
    or p_staff_credential_version < 1 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    p_run_hmac || ':task150-win7pos-image-qa', 0
  ));
  select * into v_run
  from app_private.task_150_win7pos_image_qa_runs
  where run_hmac = p_run_hmac
  for update;
  if v_run.run_hmac is null
    or v_run.manifest_hmac <> p_manifest_hmac
    or v_run.status not in (
      'provisioned', 'cleanup_in_progress', 'cleanup_recoverable',
      'cleanup_invariant_blocked', 'cleaned'
    )
    or v_run.bootstrap_actor_hmac <> p_actor_hmac
    or v_run.bootstrap_source_shop_id <> p_actor_shop_id
    or v_run.bootstrap_staff_id <> p_actor_staff_id
    or not exists (
      select 1 from public.pos_sessions session_row
      where session_row.pos_session_id = p_pos_session_id
        and session_row.shop_id = p_actor_shop_id
        and session_row.staff_id = p_actor_staff_id
        and session_row.shop_device_id = p_shop_device_id
        and session_row.staff_credential_version = p_staff_credential_version
        and session_row.status = 'active'
        and session_row.expires_at > v_now
    ) then
    return jsonb_build_object('ok', false, 'code', 'capability_denied');
  end if;
  if v_run.result_issue_request_hash = p_request_hash
    and v_run.result_capability_digest = p_result_capability_digest
    and v_run.result_capability_expires_at > v_now then
    return jsonb_build_object(
      'ok', true,
      'code', 'result_issued',
      'expiresAt', to_char(
        v_run.result_capability_expires_at,
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    );
  end if;
  if v_run.result_issue_request_hash is not null
    and v_run.result_capability_expires_at > v_now then
    return jsonb_build_object('ok', false, 'code', 'request_conflict');
  end if;
  if v_run.result_issue_window_started_at <= v_now - interval '15 minutes' then
    update app_private.task_150_win7pos_image_qa_runs
    set result_issue_window_started_at = v_now,
        result_issue_count = 1
    where run_hmac = p_run_hmac;
  elsif v_run.result_issue_count >= 3 then
    return jsonb_build_object(
      'ok', false, 'code', 'rate_limited',
      'retryAfterAt', to_char(
        v_run.result_issue_window_started_at + interval '15 minutes',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    );
  else
    update app_private.task_150_win7pos_image_qa_runs
    set result_issue_window_started_at = v_now,
        result_issue_count = result_issue_count + 1
    where run_hmac = p_run_hmac;
  end if;
  update app_private.task_150_win7pos_image_qa_runs
  set result_capability_digest = p_result_capability_digest,
      result_capability_issued_at = v_now,
      result_capability_expires_at = v_now + interval '60 minutes',
      result_issue_request_hash = p_request_hash,
      updated_at = v_now
  where run_hmac = p_run_hmac;
  return jsonb_build_object(
    'ok', true,
    'code', 'result_issued',
    'expiresAt', to_char(
      v_now + interval '60 minutes', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  );
end;
$$;

revoke all on function public.task_150_win7pos_image_qa_rotation_prepare_v1(
  text, text, text, text, text, text, uuid, uuid, uuid, uuid, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.task_150_win7pos_image_qa_rotation_prepare_v1(
  text, text, text, text, text, text, uuid, uuid, uuid, uuid, integer, timestamptz
) to service_role;
revoke all on function public.task_150_win7pos_image_qa_rotation_ack_v1(
  text, text, text, text, text, text, uuid, uuid, uuid, uuid, integer
) from public, anon, authenticated;
grant execute on function public.task_150_win7pos_image_qa_rotation_ack_v1(
  text, text, text, text, text, text, uuid, uuid, uuid, uuid, integer
) to service_role;
revoke all on function public.task_150_win7pos_image_qa_result_issue_v1(
  text, text, text, text, text, uuid, uuid, uuid, uuid, integer
) from public, anon, authenticated;
grant execute on function public.task_150_win7pos_image_qa_result_issue_v1(
  text, text, text, text, text, uuid, uuid, uuid, uuid, integer
) to service_role;

create or replace function public.task_150_win7pos_image_qa_cleanup_acquire_v1(
  p_run_hmac text,
  p_manifest_hmac text,
  p_cleanup_capability_digest text,
  p_cleanup_request_hash text,
  p_owner_digest text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run app_private.task_150_win7pos_image_qa_runs%rowtype;
  v_generation bigint;
  v_paths jsonb;
  v_upload_expiry timestamptz;
  v_budget_expiry timestamptz;
  v_now timestamptz := clock_timestamp();
  v_lease_expires_at timestamptz;
  v_required_coverage_until timestamptz;
begin
  perform set_config('lock_timeout', '3s', true);
  perform set_config('statement_timeout', '20s', true);
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    or p_cleanup_request_hash !~ '^[0-9a-f]{64}$'
    or p_owner_digest !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_run_hmac || ':task150-win7pos-image-qa', 0
  ));
  select * into v_run
  from app_private.task_150_win7pos_image_qa_runs
  where run_hmac = p_run_hmac
  for update;

  if v_run.run_hmac is null
    or v_run.manifest_hmac <> p_manifest_hmac
    or v_run.cleanup_capability_digest <> p_cleanup_capability_digest
    or v_run.cleanup_capability_revoked_at is not null
    or v_run.cleanup_capability_expires_at <= v_now then
    return jsonb_build_object('ok', false, 'code', 'capability_denied');
  end if;

  if v_run.status = 'cleaned' then
    return jsonb_build_object('ok', false, 'code', 'capability_consumed');
  end if;
  if v_run.status = 'cleanup_in_progress' then
    if v_run.cleanup_lease_expires_at > v_now then
      return jsonb_build_object('ok', false, 'code', 'cleanup_in_progress');
    end if;

    -- The boundary performs no external mutation. A stale generation can be
    -- superseded safely: its eventual commit is rejected by owner+generation.
    update app_private.task_150_win7pos_image_qa_runs
    set status = 'cleanup_recoverable',
        cleanup_owner_digest = null,
        cleanup_lease_expires_at = null,
        updated_at = v_now
    where run_hmac = p_run_hmac
      and status = 'cleanup_in_progress'
      and cleanup_generation = v_run.cleanup_generation
      and cleanup_lease_expires_at <= v_now;
    if not found then
      raise exception 'TASK-150 stale cleanup lease recovery lost'
        using errcode = '40001';
    end if;
    v_run.status := 'cleanup_recoverable';
  end if;
  if v_run.status not in (
    'provisioned', 'cleanup_recoverable'
  ) then
    return jsonb_build_object('ok', false, 'code', 'capability_denied');
  end if;
  if v_run.cleanup_request_hash is not null
    and v_run.cleanup_request_hash <> p_cleanup_request_hash then
    return jsonb_build_object('ok', false, 'code', 'request_conflict');
  end if;

  -- A lost boundary response must leave enough active-capability time to let
  -- the ten-minute lease expire and then rotate from cleanup_recoverable.
  -- Reject before counters, actor revocation or cleanup-state acquisition.
  v_lease_expires_at := v_now + interval '10 minutes';
  v_required_coverage_until := v_lease_expires_at + interval '15 minutes';
  if v_run.cleanup_capability_expires_at < v_required_coverage_until then
    return jsonb_build_object(
      'ok', false,
      'code', 'cleanup_capability_coverage_insufficient',
      'requiredCoverageUntil', to_char(
        v_required_coverage_until,
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    );
  end if;

  select max(version.pos_upload_capability_expires_at)
    into v_upload_expiry
  from public.inventory_product_image_versions version
  where version.shop_id = v_run.run_shop_id
    and version.product_id = v_run.run_product_id;

  select max(
    budget.window_started_at + case
      when budget.principal_kind in ('shop', 'node_audit_shop')
        then interval '1 hour'
      else interval '15 minutes'
    end
  ) into v_budget_expiry
  from app_private.pos_product_image_mutation_budgets budget
  where budget.shop_id = v_run.run_shop_id;

  if greatest(
      v_run.safety_fence_until,
      coalesce(v_upload_expiry, '-infinity'::timestamptz),
      coalesce(v_budget_expiry, '-infinity'::timestamptz)
    ) > v_now then
    return jsonb_build_object(
      'ok', false,
      'code', 'cleanup_fence_active',
      'retryAfterAt', to_char(
        greatest(v_run.safety_fence_until, v_upload_expiry, v_budget_expiry),
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    );
  end if;

  -- Storage is cleaned only by the ordinary authenticated image runtime. The
  -- QA boundary will never issue an unfenced external delete. Actual residual
  -- objects fail before counters, actor shutdown or cleanup-state DML.
  select coalesce(jsonb_agg(object.name order by object.name), '[]'::jsonb)
    into v_paths
  from public.inventory_product_image_versions version
  join storage.objects object
    on object.bucket_id = 'product-images'
   and object.name in (version.main_path, version.thumb_path)
  where version.shop_id = v_run.run_shop_id
    and version.product_id = v_run.run_product_id;
  if jsonb_array_length(v_paths) <> 0 then
    return jsonb_build_object('ok', false, 'code', 'storage_cleanup_incomplete');
  end if;

  if v_run.cleanup_attempt_window_started_at <= v_now - interval '1 hour' then
    update app_private.task_150_win7pos_image_qa_runs
    set cleanup_attempt_window_started_at = v_now,
        cleanup_attempt_count = 1,
        updated_at = v_now
    where run_hmac = p_run_hmac;
  elsif v_run.cleanup_attempt_count >= 5 then
    return jsonb_build_object(
      'ok', false, 'code', 'rate_limited',
      'retryAfterAt', to_char(
        v_run.cleanup_attempt_window_started_at + interval '1 hour',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    );
  else
    update app_private.task_150_win7pos_image_qa_runs
    set cleanup_attempt_window_started_at = v_now,
        cleanup_attempt_count = cleanup_attempt_count + 1,
        updated_at = v_now
    where run_hmac = p_run_hmac;
  end if;

  v_generation := v_run.cleanup_generation + 1;
  update app_private.task_150_win7pos_image_qa_runs
  set cleanup_request_hash = p_cleanup_request_hash,
      cleanup_owner_digest = p_owner_digest,
      cleanup_generation = v_generation,
      cleanup_lease_expires_at = v_lease_expires_at,
      cleanup_started_at = coalesce(cleanup_started_at, v_now),
      pending_cleanup_capability_digest = null,
      pending_cleanup_capability_expires_at = null,
      pending_cleanup_target_expires_at = null,
      pending_cleanup_prepared_at = null,
      status = 'cleanup_in_progress',
      updated_at = v_now
  where run_hmac = p_run_hmac
    and cleanup_generation = v_run.cleanup_generation;
  if not found then
    raise exception 'TASK-150 cleanup acquire CAS lost' using errcode = '40001';
  end if;

  -- Disable every synthetic authentication path in the same transaction that
  -- enters cleanup. Trigger guards then reject late concurrent enrollments and
  -- image mutations after waiting on the locked run row.
  update public.pos_sessions session
  set status = 'revoked',
      revoked_at = v_now,
      revoked_reason = 'TASK150 exact QA cleanup acquire',
      updated_at = v_now
  where session.pos_session_id in (
      select asset.asset_id
      from app_private.task_150_win7pos_image_qa_auth_assets asset
      where asset.run_hmac = v_run.run_hmac and asset.asset_kind = 'session'
    )
    and session.shop_id = v_run.run_shop_id
    and session.staff_id = v_run.run_staff_id
    and session.status = 'active';

  update public.pos_device_credentials credential
  set status = 'revoked',
      revoked_at = v_now,
      revoked_reason = 'TASK150 exact QA cleanup acquire',
      updated_at = v_now
  where credential.pos_device_credential_id in (
      select asset.asset_id
      from app_private.task_150_win7pos_image_qa_auth_assets asset
      where asset.run_hmac = v_run.run_hmac
        and asset.asset_kind = 'device_credential'
    )
    and credential.shop_id = v_run.run_shop_id
    and credential.staff_id = v_run.run_staff_id
    and credential.status = 'active';

  update public.shop_devices device
  set status = 'revoked', revoked_at = v_now, updated_at = v_now
  where device.shop_device_id in (
      select asset.asset_id
      from app_private.task_150_win7pos_image_qa_auth_assets asset
      where asset.run_hmac = v_run.run_hmac and asset.asset_kind = 'device'
    )
    and device.shop_id = v_run.run_shop_id
    and device.device_identifier = v_run.expected_device_identifier
    and device.status = 'active';

  update public.staff_accounts staff
  set status = 'archived',
      credential_hash = null,
      credential_kind = null,
      credential_status = 'rotation_required',
      credential_updated_at = null,
      must_change_credential = true,
      updated_at = v_now
  where staff.staff_id = v_run.run_staff_id
    and staff.shop_id = v_run.run_shop_id
    and staff.staff_code = v_run.expected_staff_code
    and staff.status = 'active';

  return jsonb_build_object(
    'ok', true,
    'code', 'cleanup_acquired',
    'generation', v_generation,
    'leaseExpiresAt', to_char(
      v_now + interval '10 minutes',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'paths', v_paths
  );
end;
$$;

revoke all on function public.task_150_win7pos_image_qa_cleanup_acquire_v1(
  text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.task_150_win7pos_image_qa_cleanup_acquire_v1(
  text, text, text, text, text
) to service_role;

create or replace function public.task_150_win7pos_image_qa_cleanup_commit_v1(
  p_run_hmac text,
  p_manifest_hmac text,
  p_cleanup_capability_digest text,
  p_cleanup_request_hash text,
  p_owner_digest text,
  p_generation bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run app_private.task_150_win7pos_image_qa_runs%rowtype;
  v_receipts integer := 0;
  v_versions integer := 0;
  v_products integer := 0;
  v_events integer := 0;
  v_budgets integer := 0;
  v_budget_manifest integer := 0;
  v_sessions integer := 0;
  v_receipt jsonb;
  v_receipt_hmac text;
  v_completed_at timestamptz;
  v_bootstrap_snapshot_digest text;
  v_shared_snapshot_unchanged boolean;
begin
  perform set_config('lock_timeout', '3s', true);
  perform set_config('statement_timeout', '30s', true);
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    or p_generation < 1 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_run_hmac || ':task150-win7pos-image-qa', 0
  ));
  select * into v_run
  from app_private.task_150_win7pos_image_qa_runs
  where run_hmac = p_run_hmac
  for update;

  if v_run.run_hmac is null
    or v_run.manifest_hmac <> p_manifest_hmac
    or v_run.cleanup_capability_digest <> p_cleanup_capability_digest
    or v_run.cleanup_request_hash <> p_cleanup_request_hash
    or v_run.cleanup_owner_digest <> p_owner_digest
    or v_run.cleanup_generation <> p_generation
    or v_run.cleanup_lease_expires_at <= clock_timestamp()
    or v_run.status <> 'cleanup_in_progress' then
    return jsonb_build_object('ok', false, 'code', 'cleanup_fence_lost');
  end if;

  if v_run.safety_fence_until > clock_timestamp()
    or exists (
      select 1
      from public.inventory_product_image_versions version
      where version.shop_id = v_run.run_shop_id
        and version.product_id = v_run.run_product_id
        and (
          version.pos_upload_capability_expires_at is null
          or version.pos_upload_capability_expires_at > clock_timestamp()
        )
    ) then
    return jsonb_build_object('ok', false, 'code', 'cleanup_fence_active');
  end if;

  -- Hold the exact bootstrap rows stable while comparing the pre-run snapshot
  -- and committing cleanup. The QA boundary never mutates these source rows.
  perform 1 from public.profiles profile
  where profile.profile_id = v_run.bootstrap_profile_id
  for share;
  perform 1 from public.shops shop
  where shop.shop_id = v_run.bootstrap_source_shop_id
  for share;
  perform 1 from public.staff_accounts staff
  where staff.staff_id = v_run.bootstrap_staff_id
    and staff.shop_id = v_run.bootstrap_source_shop_id
  for share;
  if exists (
    select 1 from public.pos_sale_stock_movements movement
    where movement.product_id = v_run.run_product_id
  ) or exists (
    select 1 from public.pos_sale_lines sale_line
    where sale_line.product_id = v_run.run_product_id
  ) or exists (
    select 1 from public.pos_revenue_ledger_entries ledger_entry
    where ledger_entry.product_id = v_run.run_product_id
  ) or exists (
    select 1 from public.inventory_products product
    where product.id = v_run.run_product_id
      and (
        product.shop_id <> v_run.run_shop_id
        or product.barcode <> v_run.expected_barcode
        or product.item_number <> v_run.expected_item_number
        or product.product_name <> v_run.expected_product_name
      )
  ) or exists (
    select 1 from public.inventory_product_image_versions version
    where version.shop_id = v_run.run_shop_id
      and version.product_id = v_run.run_product_id
      and (
        version.main_path <> 'shops/' || v_run.run_shop_id::text
          || '/products/' || v_run.run_product_id::text
          || '/primary/' || version.id::text || '/main.jpg'
        or version.thumb_path <> 'shops/' || v_run.run_shop_id::text
          || '/products/' || v_run.run_product_id::text
          || '/primary/' || version.id::text || '/thumb.jpg'
        or version.actor_kind <> 'pos_staff'
        or version.requested_by_staff_id <> v_run.run_staff_id
        or not exists (
          select 1 from app_private.task_150_win7pos_image_qa_auth_assets asset
          where asset.run_hmac = v_run.run_hmac
            and asset.asset_kind = 'device'
            and asset.asset_id = version.requested_by_shop_device_id
        )
        or not exists (
          select 1 from app_private.task_150_win7pos_image_qa_auth_assets asset
          where asset.run_hmac = v_run.run_hmac
            and asset.asset_kind = 'session'
            and asset.asset_id = version.requested_by_pos_session_id
        )
      )
  ) or exists (
    select 1 from public.pos_product_image_mutation_receipts receipt
    where receipt.product_id = v_run.run_product_id
      and (
        receipt.shop_id <> v_run.run_shop_id
        or receipt.staff_id <> v_run.run_staff_id
        or not exists (
          select 1 from app_private.task_150_win7pos_image_qa_auth_assets asset
          where asset.run_hmac = v_run.run_hmac
            and asset.asset_kind = 'device'
            and asset.asset_id = receipt.shop_device_id
        )
        or not exists (
          select 1 from app_private.task_150_win7pos_image_qa_auth_assets asset
          where asset.run_hmac = v_run.run_hmac
            and asset.asset_kind = 'session'
            and asset.asset_id = receipt.pos_session_id
        )
      )
  ) or exists (
    select 1 from public.sync_events event
    where event.entity_ids @> jsonb_build_object(
      'product_ids', jsonb_build_array(v_run.run_product_id)
    )
      and (
        event.shop_id is distinct from v_run.run_shop_id
        or event.domain <> 'catalog'
        or event.entity_ids <> jsonb_build_object(
          'product_ids', jsonb_build_array(v_run.run_product_id)
        )
      )
  ) or exists (
    select 1 from public.shop_devices device
    where device.shop_id = v_run.run_shop_id
      and (
        device.device_identifier <> v_run.expected_device_identifier
        or not exists (
          select 1 from app_private.task_150_win7pos_image_qa_auth_assets asset
          where asset.run_hmac = v_run.run_hmac
            and asset.asset_kind = 'device'
            and asset.asset_id = device.shop_device_id
        )
      )
  ) or exists (
    select 1 from public.pos_device_credentials credential
    where credential.shop_id = v_run.run_shop_id
      and (
        credential.staff_id <> v_run.run_staff_id
        or not exists (
          select 1 from app_private.task_150_win7pos_image_qa_auth_assets asset
          where asset.run_hmac = v_run.run_hmac
            and asset.asset_kind = 'device_credential'
            and asset.asset_id = credential.pos_device_credential_id
        )
      )
  ) or exists (
    select 1 from public.pos_sessions session_row
    where session_row.shop_id = v_run.run_shop_id
      and (
        session_row.staff_id <> v_run.run_staff_id
        or not exists (
          select 1 from app_private.task_150_win7pos_image_qa_auth_assets asset
          where asset.run_hmac = v_run.run_hmac
            and asset.asset_kind = 'session'
            and asset.asset_id = session_row.pos_session_id
        )
      )
  ) or exists (
    select 1
    from app_private.pos_product_image_mutation_budgets budget
    left join app_private.task_150_win7pos_image_qa_budget_rows manifest
      on manifest.run_hmac = v_run.run_hmac
     and manifest.shop_id = budget.shop_id
     and manifest.principal_kind = budget.principal_kind
     and manifest.principal_id = budget.principal_id
    where budget.shop_id = v_run.run_shop_id
      and (
        manifest.run_hmac is null
        or manifest.window_started_at <> budget.window_started_at
        or manifest.admitted_count <> budget.admitted_count
        or manifest.source_updated_at <> budget.updated_at
        or budget.window_started_at + case
          when budget.principal_kind in ('shop', 'node_audit_shop')
            then interval '1 hour'
          else interval '15 minutes'
        end > clock_timestamp()
      )
  ) or exists (
    select 1
    from app_private.task_150_win7pos_image_qa_budget_rows manifest
    left join app_private.pos_product_image_mutation_budgets budget
      on budget.shop_id = manifest.shop_id
     and budget.principal_kind = manifest.principal_kind
     and budget.principal_id = manifest.principal_id
    where manifest.run_hmac = v_run.run_hmac
      and budget.shop_id is null
  ) then
    update app_private.task_150_win7pos_image_qa_runs
    set status = 'cleanup_invariant_blocked', updated_at = clock_timestamp()
    where run_hmac = p_run_hmac
      and cleanup_generation = p_generation
      and cleanup_owner_digest = p_owner_digest;
    return jsonb_build_object('ok', false, 'code', 'fixture_scope_conflict');
  end if;

  select count(*)::integer into v_versions
  from public.inventory_product_image_versions version
  where version.shop_id = v_run.run_shop_id
    and version.product_id = v_run.run_product_id;

  if exists (
    select 1
    from public.inventory_product_image_versions version
    join storage.objects object
      on object.bucket_id = 'product-images'
     and object.name in (version.main_path, version.thumb_path)
    where version.shop_id = v_run.run_shop_id
      and version.product_id = v_run.run_product_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'storage_cleanup_incomplete');
  end if;
  select count(*)::integer into v_budget_manifest
  from app_private.task_150_win7pos_image_qa_budget_rows manifest
  where manifest.run_hmac = v_run.run_hmac;

  delete from app_private.pos_product_image_mutation_budgets budget
  using app_private.task_150_win7pos_image_qa_budget_rows manifest
  where manifest.run_hmac = v_run.run_hmac
    and budget.shop_id = manifest.shop_id
    and budget.principal_kind = manifest.principal_kind
    and budget.principal_id = manifest.principal_id
    and budget.window_started_at = manifest.window_started_at
    and budget.admitted_count = manifest.admitted_count
    and budget.updated_at = manifest.source_updated_at;
  get diagnostics v_budgets = row_count;
  if v_budgets <> v_budget_manifest or v_budgets not between 0 and 4 then
    raise exception 'TASK-150 budget scope drift' using errcode = '23514';
  end if;

  perform set_config('app.pos_product_image_fixture_cleanup_allowed', 'true', true);
  delete from public.pos_product_image_mutation_receipts receipt
  where receipt.shop_id = v_run.run_shop_id
    and receipt.product_id = v_run.run_product_id;
  get diagnostics v_receipts = row_count;

  delete from public.inventory_products product
  where product.id = v_run.run_product_id
    and product.shop_id = v_run.run_shop_id
    and product.barcode = v_run.expected_barcode
    and product.item_number = v_run.expected_item_number
    and product.product_name = v_run.expected_product_name;
  get diagnostics v_products = row_count;

  delete from public.sync_events event
  where event.shop_id = v_run.run_shop_id
    and event.domain = 'catalog'
    and event.entity_ids = jsonb_build_object(
      'product_ids', jsonb_build_array(v_run.run_product_id)
    );
  get diagnostics v_events = row_count;
  perform set_config('app.pos_product_image_fixture_cleanup_allowed', 'false', true);

  update public.pos_sessions session
  set status = 'revoked',
      revoked_at = clock_timestamp(),
      revoked_reason = 'TASK150 exact QA cleanup',
      updated_at = clock_timestamp()
  where session.pos_session_id in (
      select asset.asset_id
      from app_private.task_150_win7pos_image_qa_auth_assets asset
      where asset.run_hmac = v_run.run_hmac
        and asset.asset_kind = 'session'
    )
    and session.shop_id = v_run.run_shop_id
    and session.staff_id = v_run.run_staff_id
    and session.status = 'active';
  get diagnostics v_sessions = row_count;

  update public.pos_device_credentials credential
  set status = 'revoked',
      revoked_at = clock_timestamp(),
      revoked_reason = 'TASK150 exact QA cleanup',
      updated_at = clock_timestamp()
  where credential.pos_device_credential_id in (
      select asset.asset_id
      from app_private.task_150_win7pos_image_qa_auth_assets asset
      where asset.run_hmac = v_run.run_hmac
        and asset.asset_kind = 'device_credential'
    )
    and credential.shop_id = v_run.run_shop_id
    and credential.staff_id = v_run.run_staff_id
    and credential.status = 'active';

  update public.shop_devices device
  set status = 'revoked', revoked_at = clock_timestamp(), updated_at = clock_timestamp()
  where device.shop_device_id in (
      select asset.asset_id
      from app_private.task_150_win7pos_image_qa_auth_assets asset
      where asset.run_hmac = v_run.run_hmac
        and asset.asset_kind = 'device'
    )
    and device.shop_id = v_run.run_shop_id
    and device.device_identifier = v_run.expected_device_identifier
    and device.status = 'active';

  update public.staff_accounts staff
  set status = 'archived',
      credential_hash = null,
      credential_kind = null,
      credential_status = 'rotation_required',
      credential_updated_at = null,
      must_change_credential = true,
      created_by_profile_id = null,
      updated_by_profile_id = null,
      updated_at = clock_timestamp()
  where staff.staff_id = v_run.run_staff_id
    and staff.shop_id = v_run.run_shop_id
    and staff.staff_code = v_run.expected_staff_code;

  update public.shop_inventory_sources source
  set disabled_at = clock_timestamp(),
      disabled_by_profile_id = null,
      verified_by_profile_id = null,
      created_by_profile_id = null
  where source.shop_inventory_source_id = v_run.run_mapping_id
    and source.shop_id = v_run.run_shop_id
    and source.disabled_at is null;

  -- The inventory compatibility owner is a run-owned Auth row, distinct from
  -- the shared bootstrap profile. Remove only the exact manifest identity
  -- after its product is gone and its mapping is disabled.
  delete from auth.users owner_row
  where owner_row.id = v_run.run_inventory_owner_id
    and owner_row.email = v_run.expected_inventory_owner_email
    and owner_row.raw_app_meta_data->>'task150QaRunHmac' = v_run.run_hmac;
  if not found then
    raise exception 'TASK-150 inventory owner scope drift' using errcode = '23514';
  end if;

  update public.staff_role_permissions permission
  set updated_by_profile_id = null,
      updated_at = clock_timestamp()
  where permission.shop_id = v_run.run_shop_id
    and permission.role_key = 'pos_admin'
    and permission.permission_key in ('catalog.read', 'catalog.write');

  delete from public.shop_members member
  where member.shop_id = v_run.run_shop_id
    and member.profile_id = v_run.bootstrap_profile_id;

  update public.shops shop
  set shop_status = 'archived',
      archived_at = clock_timestamp(),
      archived_by_profile_id = null,
      created_by_profile_id = null,
      status_reason_redacted = 'TASK150 exact QA cleanup',
      status_changed_at = clock_timestamp(),
      status_changed_by_profile_id = null,
      updated_at = clock_timestamp()
  where shop.shop_id = v_run.run_shop_id
    and shop.shop_code = v_run.expected_shop_code
    and shop.shop_name = v_run.expected_shop_name;

  if v_products <> 1
    or exists (select 1 from public.inventory_product_image_versions where product_id = v_run.run_product_id)
    or exists (select 1 from public.pos_product_image_mutation_receipts where shop_id = v_run.run_shop_id and product_id = v_run.run_product_id)
    or exists (
      select 1 from public.sync_events event
      where event.shop_id = v_run.run_shop_id
        and event.entity_ids @> jsonb_build_object(
          'product_ids', jsonb_build_array(v_run.run_product_id)
        )
    )
    or exists (select 1 from app_private.pos_product_image_mutation_budgets where shop_id = v_run.run_shop_id)
    or exists (
      select 1
      from public.pos_sessions session_row
      join app_private.task_150_win7pos_image_qa_auth_assets asset
        on asset.run_hmac = v_run.run_hmac
       and asset.asset_kind = 'session'
       and asset.asset_id = session_row.pos_session_id
      where session_row.status = 'active'
    )
    or exists (
      select 1
      from public.shop_devices device
      join app_private.task_150_win7pos_image_qa_auth_assets asset
        on asset.run_hmac = v_run.run_hmac
       and asset.asset_kind = 'device'
       and asset.asset_id = device.shop_device_id
      where device.status = 'active'
    )
    or exists (
      select 1
      from public.pos_device_credentials credential
      join app_private.task_150_win7pos_image_qa_auth_assets asset
        on asset.run_hmac = v_run.run_hmac
       and asset.asset_kind = 'device_credential'
       and asset.asset_id = credential.pos_device_credential_id
      where credential.status = 'active'
    )
    or exists (select 1 from public.staff_accounts where staff_id = v_run.run_staff_id and status <> 'archived')
    or exists (
      select 1 from public.shop_inventory_sources source
      where source.shop_inventory_source_id = v_run.run_mapping_id
        and source.disabled_at is null
    )
    or exists (
      select 1 from auth.users owner_row
      where owner_row.id = v_run.run_inventory_owner_id
    )
    or exists (
      select 1 from public.shop_members member
      where member.shop_id = v_run.run_shop_id
        and member.profile_id = v_run.bootstrap_profile_id
    )
    or exists (
      select 1 from public.staff_accounts staff
      where staff.staff_id = v_run.run_staff_id
        and (
          staff.created_by_profile_id = v_run.bootstrap_profile_id
          or staff.updated_by_profile_id = v_run.bootstrap_profile_id
        )
    )
    or exists (
      select 1 from public.shop_inventory_sources source
      where source.shop_inventory_source_id = v_run.run_mapping_id
        and (
          source.created_by_profile_id = v_run.bootstrap_profile_id
          or source.verified_by_profile_id = v_run.bootstrap_profile_id
          or source.disabled_by_profile_id = v_run.bootstrap_profile_id
        )
    )
    or exists (
      select 1 from public.staff_role_permissions permission
      where permission.shop_id = v_run.run_shop_id
        and permission.updated_by_profile_id = v_run.bootstrap_profile_id
    )
    or exists (
      select 1 from public.shops shop
      where shop.shop_id = v_run.run_shop_id
        and (
          shop.created_by_profile_id = v_run.bootstrap_profile_id
          or shop.archived_by_profile_id = v_run.bootstrap_profile_id
          or shop.status_changed_by_profile_id = v_run.bootstrap_profile_id
        )
    )
    or exists (select 1 from public.shops where shop_id = v_run.run_shop_id and shop_status <> 'archived') then
    raise exception 'TASK-150 terminal cleanup invariant failed' using errcode = '23514';
  end if;

  v_bootstrap_snapshot_digest := app_private.task_150_qa_bootstrap_snapshot_v1(
    v_run.bootstrap_source_shop_id,
    v_run.bootstrap_staff_id,
    v_run.bootstrap_profile_id,
    v_run.run_shop_id
  );
  v_shared_snapshot_unchanged :=
    v_bootstrap_snapshot_digest = v_run.bootstrap_snapshot_digest;

  v_completed_at := clock_timestamp();
  v_receipt := jsonb_build_object(
    'schemaVersion', 'task-150-win7pos-image-qa-cleanup-v1',
    'code', 'cleanup_complete',
    'runHmac', v_run.run_hmac,
    'manifestHmac', v_run.manifest_hmac,
    'counts', jsonb_build_object(
      'activeRunOwnedSessions', 0,
      'imageVersions', v_versions,
      'products', v_products,
      'receipts', v_receipts,
      'storageObjects', 0,
      'syncEvents', v_events,
      'writeBudgetRows', v_budgets
    ),
    'sharedSnapshotUnchanged', v_shared_snapshot_unchanged,
    'immutableAuditPreserved', true,
    'cleanupCapabilityRevoked', true,
    'receiptBindingVersion', 'cleanup-capability-digest-hmac-sha256-v1',
    'serverTime', to_char(v_completed_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );
  v_receipt_hmac := encode(
    extensions.hmac(
      convert_to(v_receipt::text, 'UTF8'),
      convert_to(v_run.cleanup_capability_digest, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_receipt := v_receipt || jsonb_build_object('receiptHmac', v_receipt_hmac);

  update app_private.task_150_win7pos_image_qa_runs
  set status = 'cleaned',
      cleanup_receipt = v_receipt,
      cleanup_receipt_hmac = v_receipt_hmac,
      cleanup_capability_revoked_at = v_completed_at,
      cleanup_owner_digest = null,
      cleanup_lease_expires_at = null,
      cleanup_completed_at = v_completed_at,
      updated_at = v_completed_at
  where run_hmac = p_run_hmac
    and cleanup_generation = p_generation
    and cleanup_owner_digest = p_owner_digest
    and status = 'cleanup_in_progress';
  if not found then
    raise exception 'TASK-150 terminal receipt fence lost' using errcode = '40001';
  end if;

  insert into public.audit_logs (
    actor_profile_id, actor_staff_id, scope, shop_id, event_key, severity,
    result, target_type, target_id, metadata_redacted
  ) values (
    null, null, 'shop', v_run.run_shop_id,
    'pos.catalog.product_image.task150_fixture_cleanup',
    'info', 'success', 'qa_run', v_run.run_hmac,
    jsonb_build_object('counts', v_receipt->'counts', 'source', 'task_150_qa_boundary')
  );

  return jsonb_build_object('ok', true, 'code', 'cleanup_complete', 'receipt', v_receipt);
end;
$$;

revoke all on function public.task_150_win7pos_image_qa_cleanup_commit_v1(
  text, text, text, text, text, bigint
) from public, anon, authenticated;
grant execute on function public.task_150_win7pos_image_qa_cleanup_commit_v1(
  text, text, text, text, text, bigint
) to service_role;

create or replace function public.task_150_win7pos_image_qa_result_v1(
  p_run_hmac text,
  p_manifest_hmac text,
  p_result_capability_digest text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_run app_private.task_150_win7pos_image_qa_runs%rowtype;
  v_state text;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'capability_denied');
  end if;
  select * into v_run
  from app_private.task_150_win7pos_image_qa_runs
  where run_hmac = p_run_hmac;
  if v_run.run_hmac is null
    or v_run.manifest_hmac <> p_manifest_hmac
    or v_run.result_capability_digest <> p_result_capability_digest
    or v_run.result_capability_expires_at <= clock_timestamp() then
    return jsonb_build_object('ok', false, 'code', 'capability_denied');
  end if;
  if v_run.status = 'cleaned' and v_run.cleanup_receipt is not null then
    return jsonb_build_object(
      'ok', true, 'code', 'terminal', 'state', 'terminal',
      'receipt', v_run.cleanup_receipt
    );
  end if;
  v_state := case
    when v_run.status = 'cleanup_in_progress'
      and v_run.cleanup_lease_expires_at > clock_timestamp() then 'in_progress'
    when v_run.status = 'cleanup_in_progress' then 'aborted_recoverable'
    when v_run.status = 'cleanup_recoverable' then 'aborted_recoverable'
    when v_run.status = 'cleanup_invariant_blocked' then 'invariant_blocked'
    else 'not_started'
  end;
  return jsonb_build_object(
    'ok', true,
    'code', 'status',
    'state', v_state,
    'retryAfterAt', case
      when v_state = 'in_progress' then to_char(
        v_run.cleanup_lease_expires_at,
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
      else null
    end,
    'capabilityActive', v_run.cleanup_capability_revoked_at is null
      and v_run.cleanup_capability_expires_at > clock_timestamp()
  );
end;
$$;

revoke all on function public.task_150_win7pos_image_qa_result_v1(
  text, text, text
) from public, anon, authenticated;
grant execute on function public.task_150_win7pos_image_qa_result_v1(
  text, text, text
) to service_role;

commit;
