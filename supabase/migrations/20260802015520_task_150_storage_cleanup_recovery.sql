-- TASK-150: recover a failed staging acceptance run after canonical image
-- uploads have already reached Storage. This remains cleanup-only: the caller
-- must present the exact cleanup capability digest, every publication/upload
-- fence must be closed, and only the synthetic run's canonical object paths
-- may cross the service-role boundary.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '15min';

create or replace function app_private.task_150_win7pos_image_qa_cleanup_revoke_actors_v1(
  p_run_hmac text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run app_private.task_150_win7pos_image_qa_runs%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if (
      coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
      and coalesce(nullif(current_setting('role', true), 'none'), '') <> 'service_role'
    )
    or p_run_hmac !~ '^[0-9a-f]{64}$' then
    raise exception 'TASK-150 cleanup actor revocation denied'
      using errcode = '42501';
  end if;

  select * into v_run
  from app_private.task_150_win7pos_image_qa_runs
  where run_hmac = p_run_hmac;
  if not found then
    raise exception 'TASK-150 cleanup actor manifest missing'
      using errcode = '23514';
  end if;

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
end;
$$;

revoke all on function app_private.task_150_win7pos_image_qa_cleanup_revoke_actors_v1(
  text
) from public, anon, authenticated, service_role;

comment on function app_private.task_150_win7pos_image_qa_cleanup_revoke_actors_v1(
  text
) is
  'Private TASK-150 exact-run actor revocation shared by normal and invariant-blocked cleanup acquisition.';

create or replace function app_private.task_150_win7pos_image_qa_cleanup_acquire_impl(
  p_run_hmac text,
  p_manifest_hmac text,
  p_cleanup_capability_digest text,
  p_cleanup_request_hash text,
  p_owner_digest text,
  p_allow_storage_paths boolean
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
  v_version_count integer;
  v_upload_expiry timestamptz;
  v_budget_expiry timestamptz;
  v_now timestamptz := clock_timestamp();
  v_lease_expires_at timestamptz;
  v_required_coverage_until timestamptz;
  v_cleanup_authorized_until timestamptz;
begin
  perform set_config('lock_timeout', '3s', true);
  perform set_config('statement_timeout', '20s', true);
  if (
      coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
      and coalesce(nullif(current_setting('role', true), 'none'), '') <> 'service_role'
    )
    or p_run_hmac !~ '^[0-9a-f]{64}$'
    or p_manifest_hmac !~ '^[0-9a-f]{64}$'
    or p_cleanup_capability_digest !~ '^[0-9a-f]{64}$'
    or p_cleanup_request_hash !~ '^[0-9a-f]{64}$'
    or p_owner_digest !~ '^[0-9a-f]{64}$'
    or p_allow_storage_paths is null then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_run_hmac || ':task150-win7pos-image-qa', 0
  ));
  select * into v_run
  from app_private.task_150_win7pos_image_qa_runs
  where run_hmac = p_run_hmac
  for update;

  -- The grace never authorizes provisioning, image mutation or capability
  -- rotation. It only keeps the already-bound cleanup token usable for six
  -- bounded hours after nominal expiry so a failed final staging run can still
  -- reach its mandatory terminal cleanup after a reviewed server deployment.
  v_cleanup_authorized_until :=
    v_run.cleanup_capability_expires_at + interval '6 hours';

  if v_run.run_hmac is null
    or v_run.manifest_hmac <> p_manifest_hmac
    or v_run.cleanup_capability_digest <> p_cleanup_capability_digest
    or v_run.cleanup_capability_revoked_at is not null
    or v_cleanup_authorized_until <= v_now then
    return jsonb_build_object('ok', false, 'code', 'capability_denied');
  end if;

  if v_run.status = 'cleaned' then
    return jsonb_build_object('ok', false, 'code', 'capability_consumed');
  end if;
  if v_run.status = 'cleanup_in_progress' then
    if v_run.cleanup_lease_expires_at > v_now then
      return jsonb_build_object('ok', false, 'code', 'cleanup_in_progress');
    end if;

    -- External Storage deletion is idempotent. Once the bounded lease expires,
    -- a new owner/generation may retry only the same canonical path set; any
    -- suspended commit remains fenced by owner plus generation.
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

  v_lease_expires_at := v_now + interval '10 minutes';
  v_required_coverage_until := v_lease_expires_at + interval '15 minutes';
  if v_cleanup_authorized_until < v_required_coverage_until then
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

  if p_allow_storage_paths then
    -- V2 can return external-I/O targets, so prove that the acceptance run owns
    -- at most two canonical versions and that each was created by its exact
    -- synthetic actor. V1 deliberately keeps its deployed zero-object gate.
    select count(*)::integer into v_version_count
    from public.inventory_product_image_versions version
    where version.shop_id = v_run.run_shop_id
      and version.product_id = v_run.run_product_id;

    if v_version_count > 2
      or exists (
        select 1
        from public.inventory_product_image_versions version
        where version.product_id = v_run.run_product_id
          and version.shop_id is distinct from v_run.run_shop_id
      )
      or exists (
        select 1
        from public.inventory_product_image_versions version
        where version.shop_id = v_run.run_shop_id
          and version.product_id = v_run.run_product_id
          and (
            version.main_path is distinct from
              'shops/' || v_run.run_shop_id::text
              || '/products/' || v_run.run_product_id::text
              || '/primary/' || version.id::text || '/main.jpg'
            or version.thumb_path is distinct from
              'shops/' || v_run.run_shop_id::text
              || '/products/' || v_run.run_product_id::text
              || '/primary/' || version.id::text || '/thumb.jpg'
            or version.actor_kind is distinct from 'pos_staff'
            or version.requested_by_profile_id is not null
            or version.requested_by_staff_id is distinct from v_run.run_staff_id
            or not exists (
              select 1
              from app_private.task_150_win7pos_image_qa_auth_assets asset
              where asset.run_hmac = v_run.run_hmac
                and asset.asset_kind = 'device'
                and asset.asset_id = version.requested_by_shop_device_id
            )
            or not exists (
              select 1
              from app_private.task_150_win7pos_image_qa_auth_assets asset
              where asset.run_hmac = v_run.run_hmac
                and asset.asset_kind = 'session'
                and asset.asset_id = version.requested_by_pos_session_id
            )
          )
      ) then
      perform app_private.task_150_win7pos_image_qa_cleanup_revoke_actors_v1(
        v_run.run_hmac
      );
      update app_private.task_150_win7pos_image_qa_runs
      set status = 'cleanup_invariant_blocked', updated_at = v_now
      where run_hmac = p_run_hmac;
      return jsonb_build_object(
        'ok', false,
        'code', 'cleanup_invariant_blocked'
      );
    end if;

    -- Treat storage.objects as read-only. Enumerate only metadata rows below
    -- the exact synthetic prefix and reject any non-canonical object. Deletion
    -- remains exclusively in the trusted Storage API boundary.
    if exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'product-images'
        and object.name like (
          'shops/' || v_run.run_shop_id::text
          || '/products/' || v_run.run_product_id::text
          || '/%'
        )
        and not exists (
          select 1
          from public.inventory_product_image_versions version
          where version.shop_id = v_run.run_shop_id
            and version.product_id = v_run.run_product_id
            and object.name in (version.main_path, version.thumb_path)
        )
    ) then
      perform app_private.task_150_win7pos_image_qa_cleanup_revoke_actors_v1(
        v_run.run_hmac
      );
      update app_private.task_150_win7pos_image_qa_runs
      set status = 'cleanup_invariant_blocked', updated_at = v_now
      where run_hmac = p_run_hmac;
      return jsonb_build_object(
        'ok', false,
        'code', 'cleanup_invariant_blocked'
      );
    end if;
  end if;

  select coalesce(jsonb_agg(object.name order by object.name), '[]'::jsonb)
    into v_paths
  from public.inventory_product_image_versions version
  join storage.objects object
    on object.bucket_id = 'product-images'
   and object.name in (version.main_path, version.thumb_path)
  where version.shop_id = v_run.run_shop_id
    and version.product_id = v_run.run_product_id;

  -- Compatibility gate: the already-deployed Worker calls V1. It must keep
  -- rejecting residual Storage objects before counters, actor revocation or
  -- lease acquisition. After the one-off V2 deletion, V1 can stale-recover
  -- and commit using the bounded cleanup-only capability grace above.
  if not p_allow_storage_paths and exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'product-images'
      and object.name like (
        'shops/' || v_run.run_shop_id::text
        || '/products/' || v_run.run_product_id::text
        || '/%'
      )
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'storage_cleanup_incomplete'
    );
  end if;

  if p_allow_storage_paths and jsonb_array_length(v_paths) > 4 then
    perform app_private.task_150_win7pos_image_qa_cleanup_revoke_actors_v1(
      v_run.run_hmac
    );
    update app_private.task_150_win7pos_image_qa_runs
    set status = 'cleanup_invariant_blocked', updated_at = v_now
    where run_hmac = p_run_hmac;
    return jsonb_build_object(
      'ok', false,
      'code', 'cleanup_invariant_blocked'
    );
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
  -- enters cleanup. The same helper is called before every invariant-blocked
  -- exit, so unexpected fixture drift can never strand live run credentials.
  perform app_private.task_150_win7pos_image_qa_cleanup_revoke_actors_v1(
    v_run.run_hmac
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'cleanup_acquired',
    'generation', v_generation,
    'leaseExpiresAt', to_char(
      v_lease_expires_at,
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'paths', v_paths
  );
end;
$$;

revoke all on function app_private.task_150_win7pos_image_qa_cleanup_acquire_impl(
  text, text, text, text, text, boolean
) from public, anon, authenticated, service_role;

comment on function app_private.task_150_win7pos_image_qa_cleanup_acquire_impl(
  text, text, text, text, text, boolean
) is
  'Private TASK-150 cleanup acquisition implementation. The non-public boolean selects legacy zero-object V1 or canonical-path V2 behavior.';

create or replace function app_private.task_150_qa_require_storage_absent_on_clean_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cleaned'
    and old.status is distinct from 'cleaned'
    and exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'product-images'
        and object.name like (
          'shops/' || new.run_shop_id::text
          || '/products/' || new.run_product_id::text
          || '/%'
        )
    ) then
    raise exception 'TASK-150 Storage objects remain under the run product prefix'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function app_private.task_150_qa_require_storage_absent_on_clean_v2()
  from public, anon, authenticated, service_role;

drop trigger if exists task_150_qa_require_storage_absent_on_clean_trigger
  on app_private.task_150_win7pos_image_qa_runs;
create trigger task_150_qa_require_storage_absent_on_clean_trigger
before update of status on app_private.task_150_win7pos_image_qa_runs
for each row execute function
  app_private.task_150_qa_require_storage_absent_on_clean_v2();

comment on function app_private.task_150_qa_require_storage_absent_on_clean_v2()
is
  'Prevents a TASK-150 terminal cleanup receipt while any Storage metadata remains anywhere under the exact synthetic product prefix.';

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
begin
  if (
      coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
      and coalesce(nullif(current_setting('role', true), 'none'), '') <> 'service_role'
    )
    or p_run_hmac !~ '^[0-9a-f]{64}$'
    or p_manifest_hmac !~ '^[0-9a-f]{64}$'
    or p_cleanup_capability_digest !~ '^[0-9a-f]{64}$'
    or p_cleanup_request_hash !~ '^[0-9a-f]{64}$'
    or p_owner_digest !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  return app_private.task_150_win7pos_image_qa_cleanup_acquire_impl(
    p_run_hmac,
    p_manifest_hmac,
    p_cleanup_capability_digest,
    p_cleanup_request_hash,
    p_owner_digest,
    false
  );
end;
$$;

create or replace function public.task_150_win7pos_image_qa_cleanup_acquire_v2(
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
begin
  if (
      coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
      and coalesce(nullif(current_setting('role', true), 'none'), '') <> 'service_role'
    )
    or p_run_hmac !~ '^[0-9a-f]{64}$'
    or p_manifest_hmac !~ '^[0-9a-f]{64}$'
    or p_cleanup_capability_digest !~ '^[0-9a-f]{64}$'
    or p_cleanup_request_hash !~ '^[0-9a-f]{64}$'
    or p_owner_digest !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  return app_private.task_150_win7pos_image_qa_cleanup_acquire_impl(
    p_run_hmac,
    p_manifest_hmac,
    p_cleanup_capability_digest,
    p_cleanup_request_hash,
    p_owner_digest,
    true
  );
end;
$$;

revoke all on function public.task_150_win7pos_image_qa_cleanup_acquire_v1(
  text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.task_150_win7pos_image_qa_cleanup_acquire_v1(
  text, text, text, text, text
) to service_role;
revoke all on function public.task_150_win7pos_image_qa_cleanup_acquire_v2(
  text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.task_150_win7pos_image_qa_cleanup_acquire_v2(
  text, text, text, text, text
) to service_role;

comment on function public.task_150_win7pos_image_qa_cleanup_acquire_v1(
  text, text, text, text, text
) is
  'Staging-only TASK-150 legacy zero-Storage-object cleanup acquire with bounded cleanup-token recovery grace.';
comment on function public.task_150_win7pos_image_qa_cleanup_acquire_v2(
  text, text, text, text, text
) is
  'Staging-only TASK-150 fenced cleanup acquire returning at most four exact canonical Storage targets.';

commit;
