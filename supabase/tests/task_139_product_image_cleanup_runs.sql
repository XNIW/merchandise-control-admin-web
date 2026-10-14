begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(30);

select has_table(
  'app_private',
  'product_image_cleanup_runs',
  'TASK-139 cleanup run ledger exists in the private schema'
);
select has_function(
  'public',
  'product_image_begin_cleanup_run',
  array['uuid', 'text', 'text', 'integer'],
  'TASK-139 cleanup lock acquisition RPC exists'
);
select has_function(
  'public',
  'product_image_finish_cleanup_run',
  array['uuid', 'text', 'integer', 'bigint', 'integer', 'bigint', 'integer', 'integer', 'text', 'text'],
  'TASK-139 cleanup completion RPC exists'
);
select has_function(
  'public',
  'product_image_renew_cleanup_run',
  array['uuid', 'integer'],
  'TASK-139 cleanup lease renewal RPC exists'
);
select ok(
  not has_table_privilege('authenticated', 'app_private.product_image_cleanup_runs', 'SELECT'),
  'authenticated cannot read the private run ledger'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.product_image_begin_cleanup_run(uuid,text,text,integer)',
    'EXECUTE'
  ),
  'authenticated cannot acquire cleanup locks'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.product_image_renew_cleanup_run(uuid,integer)',
    'EXECUTE'
  ),
  'authenticated cannot renew cleanup leases'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.product_image_begin_cleanup_run(uuid,text,text,integer)',
    'EXECUTE'
  ),
  'service role can acquire cleanup locks'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.product_image_renew_cleanup_run(uuid,integer)',
    'EXECUTE'
  ),
  'service role can renew cleanup leases'
);

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '10000000-0000-4000-8000-000000000139',
  'TASK139A',
  'TASK-139 Cleanup Shop',
  'active'
)
on conflict (shop_id) do nothing;

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is(
  public.product_image_begin_cleanup_run(
    '10000000-0000-4000-8000-000000000139', 'local', 'dry-run', 1800
  )->>'code',
  'permission_denied',
  'JWT role check fails closed even through privileged SQL execution'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.product_image_begin_cleanup_run(
    '10000000-0000-4000-8000-000000000139', 'production', 'execute', 1800
  )->>'code',
  'target_or_mode_invalid',
  'production target is structurally unsupported'
);

create temporary table task139_cleanup_state (
  key text primary key,
  value jsonb not null
);
insert into task139_cleanup_state (key, value)
select 'first', public.product_image_begin_cleanup_run(
  '10000000-0000-4000-8000-000000000139', 'local', 'dry-run', 1800
);

select is(
  (select value->>'code' from task139_cleanup_state where key = 'first'),
  'cleanup_run_acquired',
  'first scoped cleanup run acquires the lock'
);
select is(
  public.product_image_begin_cleanup_run(
    '10000000-0000-4000-8000-000000000139', 'local', 'dry-run', 1800
  )->>'code',
  'cleanup_run_already_active',
  'concurrent run for the same shop is rejected'
);
select is(
  public.product_image_renew_cleanup_run(
    (select (value->>'run_id')::uuid from task139_cleanup_state where key = 'first'),
    1800
  )->>'code',
  'cleanup_run_renewed',
  'the active executor renews its bounded lease'
);
select is(
  public.product_image_finish_cleanup_run(
    (select (value->>'run_id')::uuid from task139_cleanup_state where key = 'first'),
    'succeeded', 2, 4096, 0, 0, 0, 0, 'warning', null
  )->>'code',
  'cleanup_run_recorded',
  'dry-run metrics are recorded through the bounded completion RPC'
);
select is(
  (
    select status from app_private.product_image_cleanup_runs
    where run_id = (select (value->>'run_id')::uuid from task139_cleanup_state where key = 'first')
  ),
  'succeeded',
  'run ledger reaches a terminal succeeded state'
);
select is(
  (
    select alert_status from app_private.product_image_cleanup_runs
    where run_id = (select (value->>'run_id')::uuid from task139_cleanup_state where key = 'first')
  ),
  'warning',
  'non-zero dry-run residue is visible as a warning alert'
);
select is(
  (
    select candidate_bytes from app_private.product_image_cleanup_runs
    where run_id = (select (value->>'run_id')::uuid from task139_cleanup_state where key = 'first')
  ),
  4096::bigint,
  'bounded byte metrics are persisted without object paths'
);
select ok(
  exists (
    select 1 from public.audit_logs
    where shop_id = '10000000-0000-4000-8000-000000000139'
      and event_key = 'shop.product_image.cleanup_run_started'
  ),
  'run start writes append-only audit evidence'
);
select ok(
  exists (
    select 1 from public.audit_logs
    where shop_id = '10000000-0000-4000-8000-000000000139'
      and event_key = 'shop.product_image.cleanup_run_completed'
  ),
  'run completion writes append-only audit evidence'
);

insert into task139_cleanup_state (key, value)
select 'second', public.product_image_begin_cleanup_run(
  '10000000-0000-4000-8000-000000000139', 'staging', 'execute', 300
);
select is(
  (select value->>'code' from task139_cleanup_state where key = 'second'),
  'cleanup_run_acquired',
  'a terminal run releases the per-shop lock'
);
select is(
  public.product_image_finish_cleanup_run(
    (select (value->>'run_id')::uuid from task139_cleanup_state where key = 'second'),
    'succeeded', 101, 0, 0, 0, 0, 0, 'ok', null
  )->>'code',
  'cleanup_run_metrics_invalid',
  'candidate metrics over the batch bound fail closed'
);
select is(
  public.product_image_finish_cleanup_run(
    (select (value->>'run_id')::uuid from task139_cleanup_state where key = 'second'),
    'failed', 0, 0, 0, 0, 0, 1, 'critical', 'fixture_failure'
  )->>'code',
  'cleanup_run_recorded',
  'failed scheduled runs record critical alert state'
);
select is(
  (
    select alert_status from app_private.product_image_cleanup_runs
    where run_id = (select (value->>'run_id')::uuid from task139_cleanup_state where key = 'second')
  ),
  'critical',
  'critical alert is durable in the private ledger'
);

insert into task139_cleanup_state (key, value)
select 'third', public.product_image_begin_cleanup_run(
  '10000000-0000-4000-8000-000000000139', 'local', 'execute', 300
);
select is(
  (select value->>'code' from task139_cleanup_state where key = 'third'),
  'cleanup_run_acquired',
  'a fresh executor acquires a lease for expiry fencing'
);
update app_private.product_image_cleanup_runs
set lease_expires_at = now() - interval '1 second'
where run_id = (
  select (value->>'run_id')::uuid from task139_cleanup_state where key = 'third'
);
insert into task139_cleanup_state (key, value)
select 'fourth', public.product_image_begin_cleanup_run(
  '10000000-0000-4000-8000-000000000139', 'local', 'execute', 300
);
select is(
  (select value->>'code' from task139_cleanup_state where key = 'fourth'),
  'cleanup_run_acquired',
  'a second executor acquires only after the prior lease expires'
);
select is(
  (
    select status from app_private.product_image_cleanup_runs
    where run_id = (
      select (value->>'run_id')::uuid from task139_cleanup_state where key = 'third'
    )
  ),
  'abandoned',
  'the expired executor is fenced as abandoned'
);
select is(
  public.product_image_renew_cleanup_run(
    (select (value->>'run_id')::uuid from task139_cleanup_state where key = 'third'),
    300
  )->>'code',
  'cleanup_run_not_active',
  'the fenced executor cannot renew or continue mutations'
);
select is(
  public.product_image_finish_cleanup_run(
    (select (value->>'run_id')::uuid from task139_cleanup_state where key = 'fourth'),
    'succeeded', 0, 0, 0, 0, 0, 0, 'ok', null
  )->>'code',
  'cleanup_run_recorded',
  'the successor executor reaches a terminal state'
);
select ok(
  not exists (
    select 1
    from public.audit_logs,
      lateral jsonb_object_keys(metadata_redacted) as key
    where shop_id = '10000000-0000-4000-8000-000000000139'
      and event_key like 'shop.product_image.cleanup_run_%'
      and key in ('path', 'main_path', 'thumb_path', 'signed_url', 'upload_url', 'token')
  ),
  'run audit metadata contains no path, signed URL or token fields'
);

select * from finish();
rollback;
