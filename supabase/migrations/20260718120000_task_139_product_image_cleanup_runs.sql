-- TASK-139: scheduled product-image cleanup coordination and redacted run metrics.

create table if not exists app_private.product_image_cleanup_runs (
  run_id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  target text not null check (target in ('local', 'staging')),
  mode text not null check (mode in ('dry-run', 'execute')),
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed', 'abandoned')),
  started_at timestamptz not null default now(),
  lease_expires_at timestamptz not null,
  finished_at timestamptz,
  candidate_count integer not null default 0 check (candidate_count between 0 and 100),
  candidate_bytes bigint not null default 0 check (candidate_bytes between 0 and 209715200),
  completed_object_count integer not null default 0 check (completed_object_count between 0 and 200),
  completed_bytes bigint not null default 0 check (completed_bytes between 0 and 209715200),
  skipped_after_recheck integer not null default 0 check (skipped_after_recheck between 0 and 100),
  failed_count integer not null default 0 check (failed_count between 0 and 100),
  alert_status text not null default 'ok' check (alert_status in ('ok', 'warning', 'critical')),
  error_code text,
  constraint product_image_cleanup_runs_error_code_check check (
    error_code is null or error_code ~ '^[a-z0-9_]{1,64}$'
  ),
  constraint product_image_cleanup_runs_terminal_shape_check check (
    (status = 'running' and finished_at is null)
    or (status <> 'running' and finished_at is not null)
  )
);
create unique index if not exists product_image_cleanup_runs_one_active_per_shop
  on app_private.product_image_cleanup_runs (shop_id)
  where status = 'running';
create index if not exists product_image_cleanup_runs_recent_idx
  on app_private.product_image_cleanup_runs (shop_id, started_at desc);
revoke all on table app_private.product_image_cleanup_runs
  from public, anon, authenticated;
create or replace function public.product_image_begin_cleanup_run(
  p_shop_id uuid,
  p_target text,
  p_mode text,
  p_lease_seconds integer default 1800
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_run_id uuid;
  v_lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 1800), 300), 3600);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;
  if p_target not in ('local', 'staging') or p_mode not in ('dry-run', 'execute') then
    return jsonb_build_object('ok', false, 'code', 'target_or_mode_invalid');
  end if;
  if not exists (select 1 from public.shops where shop_id = p_shop_id) then
    return jsonb_build_object('ok', false, 'code', 'shop_not_found');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('product-image-cleanup:' || p_shop_id::text, 0));

  update app_private.product_image_cleanup_runs
  set status = 'abandoned',
      finished_at = now(),
      alert_status = 'critical',
      error_code = 'cleanup_lease_expired'
  where shop_id = p_shop_id
    and status = 'running'
    and lease_expires_at <= now();

  if exists (
    select 1 from app_private.product_image_cleanup_runs
    where shop_id = p_shop_id and status = 'running'
  ) then
    return jsonb_build_object('ok', false, 'code', 'cleanup_run_already_active');
  end if;

  insert into app_private.product_image_cleanup_runs (
    shop_id, target, mode, lease_expires_at
  ) values (
    p_shop_id, p_target, p_mode, now() + make_interval(secs => v_lease_seconds)
  ) returning run_id into v_run_id;

  perform app_private.write_product_image_audit(
    null,
    p_shop_id,
    'shop.product_image.cleanup_run_started',
    'info',
    case when p_mode = 'dry-run' then 'simulated' else 'success' end,
    null,
    null,
    'cleanup_run_started',
    'platform_admin',
    jsonb_build_object(
      'cleanup_source', 'admin_script',
      'lease_seconds', v_lease_seconds,
      'mode', p_mode,
      'run_id', v_run_id,
      'target', p_target
    )
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'cleanup_run_acquired',
    'run_id', v_run_id,
    'lease_seconds', v_lease_seconds
  );
end;
$$;
create or replace function public.product_image_finish_cleanup_run(
  p_run_id uuid,
  p_status text,
  p_candidate_count integer,
  p_candidate_bytes bigint,
  p_completed_object_count integer,
  p_completed_bytes bigint,
  p_skipped_after_recheck integer,
  p_failed_count integer,
  p_alert_status text,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_run app_private.product_image_cleanup_runs%rowtype;
  v_error_code text := lower(coalesce(p_error_code, ''));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;
  if p_status not in ('succeeded', 'failed')
    or p_alert_status not in ('ok', 'warning', 'critical')
    or p_candidate_count not between 0 and 100
    or p_candidate_bytes not between 0 and 209715200
    or p_completed_object_count not between 0 and 200
    or p_completed_bytes not between 0 and 209715200
    or p_skipped_after_recheck not between 0 and 100
    or p_failed_count not between 0 and 100
    or (v_error_code <> '' and v_error_code !~ '^[a-z0-9_]{1,64}$') then
    return jsonb_build_object('ok', false, 'code', 'cleanup_run_metrics_invalid');
  end if;

  select * into v_run
  from app_private.product_image_cleanup_runs
  where run_id = p_run_id
  for update;

  if v_run.run_id is null or v_run.status <> 'running' then
    return jsonb_build_object('ok', false, 'code', 'cleanup_run_not_active');
  end if;

  update app_private.product_image_cleanup_runs
  set status = p_status,
      finished_at = now(),
      candidate_count = p_candidate_count,
      candidate_bytes = p_candidate_bytes,
      completed_object_count = p_completed_object_count,
      completed_bytes = p_completed_bytes,
      skipped_after_recheck = p_skipped_after_recheck,
      failed_count = p_failed_count,
      alert_status = p_alert_status,
      error_code = nullif(v_error_code, '')
  where run_id = p_run_id;

  perform app_private.write_product_image_audit(
    null,
    v_run.shop_id,
    case when p_status = 'succeeded'
      then 'shop.product_image.cleanup_run_completed'
      else 'shop.product_image.cleanup_run_failed'
    end,
    case when p_alert_status = 'critical' then 'critical'
      when p_alert_status = 'warning' then 'warning'
      else 'info'
    end,
    case when v_run.mode = 'dry-run' and p_status = 'succeeded' then 'simulated'
      when p_status = 'succeeded' then 'success'
      else 'blocked'
    end,
    null,
    null,
    case when p_status = 'succeeded' then 'cleanup_run_complete'
      else coalesce(nullif(v_error_code, ''), 'cleanup_run_failed')
    end,
    'platform_admin',
    jsonb_build_object(
      'alert_status', p_alert_status,
      'candidate_bytes', p_candidate_bytes,
      'candidate_count', p_candidate_count,
      'cleanup_source', 'admin_script',
      'completed_bytes', p_completed_bytes,
      'completed_object_count', p_completed_object_count,
      'failed_count', p_failed_count,
      'mode', v_run.mode,
      'run_id', p_run_id,
      'skipped_after_recheck', p_skipped_after_recheck,
      'target', v_run.target
    )
  );

  return jsonb_build_object('ok', true, 'code', 'cleanup_run_recorded');
end;
$$;
create or replace function public.product_image_renew_cleanup_run(
  p_run_id uuid,
  p_lease_seconds integer default 1800
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_run app_private.product_image_cleanup_runs%rowtype;
  v_lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 1800), 300), 3600);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  select * into v_run
  from app_private.product_image_cleanup_runs
  where run_id = p_run_id
  for update;

  if v_run.run_id is null
    or v_run.status <> 'running'
    or v_run.lease_expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'cleanup_run_not_active');
  end if;

  update app_private.product_image_cleanup_runs
  set lease_expires_at = now() + make_interval(secs => v_lease_seconds)
  where run_id = p_run_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'cleanup_run_renewed',
    'lease_seconds', v_lease_seconds
  );
end;
$$;
revoke all on function public.product_image_begin_cleanup_run(uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.product_image_finish_cleanup_run(uuid, text, integer, bigint, integer, bigint, integer, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.product_image_renew_cleanup_run(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.product_image_begin_cleanup_run(uuid, text, text, integer)
  to service_role;
grant execute on function public.product_image_finish_cleanup_run(uuid, text, integer, bigint, integer, bigint, integer, integer, text, text)
  to service_role;
grant execute on function public.product_image_renew_cleanup_run(uuid, integer)
  to service_role;
