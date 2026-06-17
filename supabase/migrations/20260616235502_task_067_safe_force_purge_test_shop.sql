-- TASK-067 follow-up: safe force purge for synthetic test shops.
-- Production/real shops remain archive-only. This RPC is limited to archived
-- test/local/staging/synthetic shop codes and writes a global audit snapshot
-- before removing shop-scoped rows that would otherwise block test cleanup.

create or replace function app_private.platform_shop_purge_dependency_summary(
  p_shop_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  dependency_counts jsonb;
  normal_blocking_reasons text[] := array[]::text[];
  force_blocking_reasons text[] := array[]::text[];
  count_value integer;
begin
  select jsonb_build_object(
    'audit_logs', (select count(*) from public.audit_logs where shop_id = p_shop_id),
    'staff_actor_audit_logs', (
      select count(*)
      from public.audit_logs audit
      where audit.actor_staff_id in (
        select staff_id from public.staff_accounts where shop_id = p_shop_id
      )
    ),
    'audit_rows_to_snapshot', (
      select count(*)
      from public.audit_logs audit
      where audit.shop_id = p_shop_id
        or audit.actor_staff_id in (
          select staff_id from public.staff_accounts where shop_id = p_shop_id
        )
    ),
    'shop_members', (select count(*) from public.shop_members where shop_id = p_shop_id),
    'shop_inventory_sources', (select count(*) from public.shop_inventory_sources where shop_id = p_shop_id),
    'platform_owner_invites', (select count(*) from public.platform_owner_invites where shop_id = p_shop_id),
    'shop_devices', (select count(*) from public.shop_devices where shop_id = p_shop_id),
    'staff_accounts', (select count(*) from public.staff_accounts where shop_id = p_shop_id),
    'staff_role_permissions', (select count(*) from public.staff_role_permissions where shop_id = p_shop_id),
    'staff_web_sessions', (select count(*) from public.staff_web_sessions where shop_id = p_shop_id),
    'pos_device_credentials', (select count(*) from public.pos_device_credentials where shop_id = p_shop_id),
    'pos_sessions', (select count(*) from public.pos_sessions where shop_id = p_shop_id),
    'pos_sales_sync_batches', (select count(*) from public.pos_sales_sync_batches where shop_id = p_shop_id),
    'pos_sales', (select count(*) from public.pos_sales where shop_id = p_shop_id),
    'pos_sale_lines', (select count(*) from public.pos_sale_lines where shop_id = p_shop_id),
    'inventory_suppliers', (select count(*) from public.inventory_suppliers where shop_id = p_shop_id),
    'inventory_categories', (select count(*) from public.inventory_categories where shop_id = p_shop_id),
    'inventory_products', (select count(*) from public.inventory_products where shop_id = p_shop_id),
    'inventory_product_prices', (select count(*) from public.inventory_product_prices where shop_id = p_shop_id),
    'shared_sheet_sessions', (select count(*) from public.shared_sheet_sessions where shop_id = p_shop_id),
    'sync_events', (select count(*) from public.sync_events where shop_id = p_shop_id)
  )
  into dependency_counts;

  count_value := (dependency_counts ->> 'audit_rows_to_snapshot')::integer;
  if count_value > 0 then
    normal_blocking_reasons := array_append(
      normal_blocking_reasons,
      'Shop-scoped or staff actor audit rows require a global snapshot before force purge.'
    );
  end if;

  count_value := (dependency_counts ->> 'shop_members')::integer;
  if count_value > 0 then
    normal_blocking_reasons := array_append(
      normal_blocking_reasons,
      'Membership records require revocation/snapshot handling before force purge.'
    );
  end if;

  if (
    (dependency_counts ->> 'shop_inventory_sources')::integer
    + (dependency_counts ->> 'platform_owner_invites')::integer
    + (dependency_counts ->> 'shop_devices')::integer
    + (dependency_counts ->> 'staff_accounts')::integer
    + (dependency_counts ->> 'staff_role_permissions')::integer
    + (dependency_counts ->> 'staff_web_sessions')::integer
    + (dependency_counts ->> 'pos_device_credentials')::integer
    + (dependency_counts ->> 'pos_sessions')::integer
    + (dependency_counts ->> 'pos_sales_sync_batches')::integer
    + (dependency_counts ->> 'pos_sales')::integer
    + (dependency_counts ->> 'pos_sale_lines')::integer
    + (dependency_counts ->> 'inventory_suppliers')::integer
    + (dependency_counts ->> 'inventory_categories')::integer
    + (dependency_counts ->> 'inventory_products')::integer
    + (dependency_counts ->> 'inventory_product_prices')::integer
    + (dependency_counts ->> 'shared_sheet_sessions')::integer
    + (dependency_counts ->> 'sync_events')::integer
  ) > 0 then
    normal_blocking_reasons := array_append(
      normal_blocking_reasons,
      'Related shop data exists; use safe force purge only for synthetic test cleanup.'
    );
  end if;

  return jsonb_build_object(
    'counts', dependency_counts,
    'blocking_reasons', to_jsonb(normal_blocking_reasons),
    'normal_blocking_reasons', to_jsonb(normal_blocking_reasons),
    'force_blocking_reasons', to_jsonb(force_blocking_reasons),
    'safe_to_purge', cardinality(normal_blocking_reasons) = 0,
    'normal_safe_to_purge', cardinality(normal_blocking_reasons) = 0,
    'force_safe_to_purge', cardinality(force_blocking_reasons) = 0,
    'force_managed_tables', jsonb_build_array(
      'audit_logs',
      'shop_members',
      'shop_inventory_sources',
      'platform_owner_invites',
      'shop_devices',
      'staff_accounts',
      'staff_role_permissions',
      'staff_web_sessions',
      'pos_device_credentials',
      'pos_sessions',
      'pos_sales_sync_batches',
      'pos_sales',
      'pos_sale_lines',
      'inventory_suppliers',
      'inventory_categories',
      'inventory_products',
      'inventory_product_prices',
      'shared_sheet_sessions',
      'sync_events'
    )
  );
end;
$$;

revoke all on function app_private.platform_shop_purge_dependency_summary(uuid) from public;
revoke all on function app_private.platform_shop_purge_dependency_summary(uuid) from anon;
revoke all on function app_private.platform_shop_purge_dependency_summary(uuid) from authenticated;

create or replace function app_private.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE'
    and current_setting('app.platform_allow_test_audit_delete', true) = 'on' then
    return old;
  end if;

  raise exception 'audit_logs is append-only';
end;
$$;

revoke all on function app_private.prevent_audit_log_mutation() from public;
revoke all on function app_private.prevent_audit_log_mutation() from anon;
revoke all on function app_private.prevent_audit_log_mutation() from authenticated;

create or replace function public.platform_preview_shop_purge(
  p_shop_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  target_shop public.shops%rowtype;
  dependency_summary jsonb;
  normal_blocking_reasons text[];
  force_blocking_reasons text[];
  synthetic_target boolean;
begin
  if auth.uid() is null or not app_private.is_platform_admin() then
    return jsonb_build_object('ok', false, 'code', 'unauthorized');
  end if;

  select * into target_shop from public.shops where shop_id = p_shop_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'shop_not_found');
  end if;

  dependency_summary := app_private.platform_shop_purge_dependency_summary(p_shop_id);

  select coalesce(array_agg(value), array[]::text[])
  into normal_blocking_reasons
  from jsonb_array_elements_text(dependency_summary -> 'normal_blocking_reasons') as reasons(value);

  select coalesce(array_agg(value), array[]::text[])
  into force_blocking_reasons
  from jsonb_array_elements_text(dependency_summary -> 'force_blocking_reasons') as reasons(value);

  if target_shop.shop_status <> 'archived' then
    normal_blocking_reasons := array_append(normal_blocking_reasons, 'Shop must be archived before purge.');
    force_blocking_reasons := array_append(force_blocking_reasons, 'Shop must be archived before purge.');
  end if;

  synthetic_target :=
    target_shop.shop_code ~ '^(TASK|TEST|LOCAL|STAGING|DEV)[A-Z0-9_-]*$'
    or target_shop.shop_code like '%_TEST_%';

  if not synthetic_target then
    normal_blocking_reasons := array_append(
      normal_blocking_reasons,
      'Purge is limited to synthetic test/local/staging shop codes.'
    );
    force_blocking_reasons := array_append(
      force_blocking_reasons,
      'Purge is limited to synthetic test/local/staging shop codes.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', case
      when cardinality(normal_blocking_reasons) = 0 then 'success'
      when cardinality(force_blocking_reasons) = 0 then 'force_purge_available'
      else 'dependencies_blocked'
    end,
    'shop_id', p_shop_id,
    'shop_code', target_shop.shop_code,
    'shop_name', target_shop.shop_name,
    'shop_status', target_shop.shop_status,
    'synthetic_target', synthetic_target,
    'safe_to_purge', cardinality(normal_blocking_reasons) = 0,
    'normal_safe_to_purge', cardinality(normal_blocking_reasons) = 0,
    'force_safe_to_purge', cardinality(force_blocking_reasons) = 0,
    'counts', dependency_summary -> 'counts',
    'blocking_reasons', to_jsonb(normal_blocking_reasons),
    'normal_blocking_reasons', to_jsonb(normal_blocking_reasons),
    'force_blocking_reasons', to_jsonb(force_blocking_reasons),
    'force_managed_tables', dependency_summary -> 'force_managed_tables'
  );
end;
$$;

revoke all on function public.platform_preview_shop_purge(uuid) from public;
revoke all on function public.platform_preview_shop_purge(uuid) from anon;
revoke all on function public.platform_preview_shop_purge(uuid) from authenticated;
grant execute on function public.platform_preview_shop_purge(uuid) to authenticated;

create or replace function public.platform_force_purge_test_shop(
  p_shop_id uuid,
  p_confirmation text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  redacted_reason text := btrim(coalesce(p_reason, ''));
  target_shop public.shops%rowtype;
  dependency_summary jsonb;
  dependency_counts jsonb;
  force_blocking_reasons text[];
  expected_confirmation text;
  synthetic_target boolean;
  snapshot_event_id uuid;
  success_event_id uuid;
  rows_deleted integer;
  deleted_counts jsonb := '{}'::jsonb;
  memberships_snapshot jsonb;
  inventory_sources_snapshot jsonb;
  owner_invites_snapshot jsonb;
  devices_snapshot jsonb;
  staff_snapshot jsonb;
  staff_permissions_snapshot jsonb;
  staff_sessions_snapshot jsonb;
  pos_credentials_snapshot jsonb;
  pos_sessions_snapshot jsonb;
  pos_batches_snapshot jsonb;
  pos_sales_snapshot jsonb;
  pos_sale_lines_snapshot jsonb;
  suppliers_snapshot jsonb;
  categories_snapshot jsonb;
  products_snapshot jsonb;
  price_history_snapshot jsonb;
  shared_sessions_snapshot jsonb;
  sync_events_snapshot jsonb;
  audit_snapshot jsonb;
  snapshot_payload jsonb;
begin
  perform set_config('lock_timeout', '3s', true);
  perform set_config('statement_timeout', '20s', true);

  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_shop_id::text));

  select * into target_shop from public.shops where shop_id = p_shop_id for update;

  if not found then
    return app_private.platform_action_result(false, 'shop_not_found');
  end if;

  expected_confirmation := 'DELETE ' || target_shop.shop_code;
  if length(redacted_reason) = 0 or btrim(coalesce(p_confirmation, '')) <> expected_confirmation then
    success_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.shop.force_purge.failure',
      'critical', 'blocked', 'shop', p_shop_id::text, redacted_reason, 'validation_failed'
    );
    return app_private.platform_action_result(false, 'validation_failed', p_shop_id, success_event_id);
  end if;

  if target_shop.shop_status <> 'archived' then
    success_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.shop.force_purge.failure',
      'critical', 'blocked', 'shop', p_shop_id::text, redacted_reason, 'not_archived'
    );
    return app_private.platform_action_result(false, 'not_archived', p_shop_id, success_event_id);
  end if;

  synthetic_target :=
    target_shop.shop_code ~ '^(TASK|TEST|LOCAL|STAGING|DEV)[A-Z0-9_-]*$'
    or target_shop.shop_code like '%_TEST_%';

  if not synthetic_target then
    success_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.shop.force_purge.failure',
      'critical', 'blocked', 'shop', p_shop_id::text, redacted_reason, 'unsafe_purge_target'
    );
    return app_private.platform_action_result(false, 'unsafe_purge_target', p_shop_id, success_event_id);
  end if;

  dependency_summary := app_private.platform_shop_purge_dependency_summary(p_shop_id);
  dependency_counts := dependency_summary -> 'counts';

  select coalesce(array_agg(value), array[]::text[])
  into force_blocking_reasons
  from jsonb_array_elements_text(dependency_summary -> 'force_blocking_reasons') as reasons(value);

  if cardinality(force_blocking_reasons) > 0 then
    success_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.shop.force_purge.failure',
      'critical', 'blocked', 'shop', p_shop_id::text, redacted_reason, 'dependencies_blocked'
    );
    return app_private.platform_action_result(false, 'dependencies_blocked', p_shop_id, success_event_id);
  end if;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at), '[]'::jsonb)
    into memberships_snapshot
    from public.shop_members row_data
    where row_data.shop_id = p_shop_id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at), '[]'::jsonb)
    into inventory_sources_snapshot
    from public.shop_inventory_sources row_data
    where row_data.shop_id = p_shop_id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at), '[]'::jsonb)
    into owner_invites_snapshot
    from public.platform_owner_invites row_data
    where row_data.shop_id = p_shop_id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.updated_at), '[]'::jsonb)
    into devices_snapshot
    from public.shop_devices row_data
    where row_data.shop_id = p_shop_id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at), '[]'::jsonb)
    into staff_snapshot
    from public.staff_accounts row_data
    where row_data.shop_id = p_shop_id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.role_key, row_data.permission_key), '[]'::jsonb)
    into staff_permissions_snapshot
    from public.staff_role_permissions row_data
    where row_data.shop_id = p_shop_id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at), '[]'::jsonb)
    into staff_sessions_snapshot
    from public.staff_web_sessions row_data
    where row_data.shop_id = p_shop_id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at), '[]'::jsonb)
    into pos_credentials_snapshot
    from public.pos_device_credentials row_data
    where row_data.shop_id = p_shop_id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.issued_at), '[]'::jsonb)
    into pos_sessions_snapshot
    from public.pos_sessions row_data
    where row_data.shop_id = p_shop_id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at), '[]'::jsonb)
    into pos_batches_snapshot
    from public.pos_sales_sync_batches row_data
    where row_data.shop_id = p_shop_id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at), '[]'::jsonb)
    into pos_sales_snapshot
    from public.pos_sales row_data
    where row_data.shop_id = p_shop_id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at), '[]'::jsonb)
    into pos_sale_lines_snapshot
    from public.pos_sale_lines row_data
    where row_data.shop_id = p_shop_id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.updated_at), '[]'::jsonb)
    into suppliers_snapshot
    from public.inventory_suppliers row_data
    where row_data.shop_id = p_shop_id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.updated_at), '[]'::jsonb)
    into categories_snapshot
    from public.inventory_categories row_data
    where row_data.shop_id = p_shop_id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.updated_at), '[]'::jsonb)
    into products_snapshot
    from public.inventory_products row_data
    where row_data.shop_id = p_shop_id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.effective_at), '[]'::jsonb)
    into price_history_snapshot
    from public.inventory_product_prices row_data
    where row_data.shop_id = p_shop_id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.updated_at), '[]'::jsonb)
    into shared_sessions_snapshot
    from public.shared_sheet_sessions row_data
    where row_data.shop_id = p_shop_id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at), '[]'::jsonb)
    into sync_events_snapshot
    from public.sync_events row_data
    where row_data.shop_id = p_shop_id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at), '[]'::jsonb)
    into audit_snapshot
    from public.audit_logs row_data
    where row_data.shop_id = p_shop_id
      or row_data.actor_staff_id in (
        select staff_id from public.staff_accounts where shop_id = p_shop_id
      );

  snapshot_payload := jsonb_strip_nulls(
    jsonb_build_object(
      'shop', to_jsonb(target_shop),
      'membership_snapshot', memberships_snapshot,
      'inventory_source_snapshot', inventory_sources_snapshot,
      'owner_invite_snapshot', owner_invites_snapshot,
      'device_snapshot', devices_snapshot,
      'staff_snapshot', staff_snapshot,
      'staff_permission_snapshot', staff_permissions_snapshot,
      'staff_session_snapshot', staff_sessions_snapshot,
      'pos_credential_snapshot', pos_credentials_snapshot,
      'pos_session_snapshot', pos_sessions_snapshot,
      'pos_batch_snapshot', pos_batches_snapshot,
      'pos_sale_snapshot', pos_sales_snapshot,
      'pos_sale_line_snapshot', pos_sale_lines_snapshot,
      'supplier_snapshot', suppliers_snapshot,
      'category_snapshot', categories_snapshot,
      'product_snapshot', products_snapshot,
      'price_history_snapshot', price_history_snapshot,
      'shared_sheet_session_snapshot', shared_sessions_snapshot,
      'sync_event_snapshot', sync_events_snapshot,
      'audit_snapshot', audit_snapshot,
      'dependency_counts', dependency_counts,
      'actor_profile_id', actor_id,
      'reason_redacted', nullif(left(redacted_reason, 240), ''),
      'confirmation_mode', expected_confirmation,
      'membership_revocation_mode', 'delete_after_global_snapshot',
      'audit_retention_mode', 'global_snapshot_before_synthetic_purge',
      'snapshot_at', now(),
      'source', 'TASK-067'
    )
  );

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
    actor_id,
    'global',
    null,
    'platform.shop.purge.snapshot',
    'critical',
    'success',
    'shop',
    p_shop_id::text,
    snapshot_payload
  )
  returning audit_log_id into snapshot_event_id;

  delete from public.pos_sale_lines where shop_id = p_shop_id;
  get diagnostics rows_deleted = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('pos_sale_lines', rows_deleted);

  delete from public.pos_sales where shop_id = p_shop_id;
  get diagnostics rows_deleted = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('pos_sales', rows_deleted);

  delete from public.pos_sales_sync_batches where shop_id = p_shop_id;
  get diagnostics rows_deleted = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('pos_sales_sync_batches', rows_deleted);

  delete from public.staff_web_sessions where shop_id = p_shop_id;
  get diagnostics rows_deleted = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('staff_web_sessions', rows_deleted);

  delete from public.pos_sessions where shop_id = p_shop_id;
  get diagnostics rows_deleted = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('pos_sessions', rows_deleted);

  delete from public.pos_device_credentials where shop_id = p_shop_id;
  get diagnostics rows_deleted = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('pos_device_credentials', rows_deleted);

  delete from public.platform_owner_invites where shop_id = p_shop_id;
  get diagnostics rows_deleted = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('platform_owner_invites', rows_deleted);

  delete from public.shop_devices where shop_id = p_shop_id;
  get diagnostics rows_deleted = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('shop_devices', rows_deleted);

  delete from public.staff_role_permissions where shop_id = p_shop_id;
  get diagnostics rows_deleted = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('staff_role_permissions', rows_deleted);

  perform set_config('app.platform_allow_test_audit_delete', 'on', true);
  delete from public.audit_logs
  where shop_id = p_shop_id
    or actor_staff_id in (
      select staff_id from public.staff_accounts where shop_id = p_shop_id
    );
  get diagnostics rows_deleted = row_count;
  perform set_config('app.platform_allow_test_audit_delete', 'off', true);
  deleted_counts := deleted_counts || jsonb_build_object('audit_logs', rows_deleted);

  delete from public.staff_accounts where shop_id = p_shop_id;
  get diagnostics rows_deleted = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('staff_accounts', rows_deleted);

  delete from public.inventory_product_prices where shop_id = p_shop_id;
  get diagnostics rows_deleted = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('inventory_product_prices', rows_deleted);

  delete from public.inventory_products where shop_id = p_shop_id;
  get diagnostics rows_deleted = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('inventory_products', rows_deleted);

  delete from public.inventory_categories where shop_id = p_shop_id;
  get diagnostics rows_deleted = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('inventory_categories', rows_deleted);

  delete from public.inventory_suppliers where shop_id = p_shop_id;
  get diagnostics rows_deleted = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('inventory_suppliers', rows_deleted);

  delete from public.shared_sheet_sessions where shop_id = p_shop_id;
  get diagnostics rows_deleted = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('shared_sheet_sessions', rows_deleted);

  delete from public.sync_events where shop_id = p_shop_id;
  get diagnostics rows_deleted = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('sync_events', rows_deleted);

  delete from public.shop_members where shop_id = p_shop_id;
  get diagnostics rows_deleted = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('shop_members', rows_deleted);

  delete from public.shop_inventory_sources where shop_id = p_shop_id;
  get diagnostics rows_deleted = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('shop_inventory_sources', rows_deleted);

  delete from public.shops where shop_id = p_shop_id;
  get diagnostics rows_deleted = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('shops', rows_deleted);

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
    actor_id,
    'global',
    null,
    'platform.shop.purge.success',
    'critical',
    'success',
    'shop',
    p_shop_id::text,
    jsonb_strip_nulls(
      jsonb_build_object(
        'original_shop_id', p_shop_id,
        'shop_code', target_shop.shop_code,
        'shop_name', target_shop.shop_name,
        'deleted_counts', deleted_counts,
        'snapshot_audit_event_id', snapshot_event_id,
        'reason_redacted', nullif(left(redacted_reason, 240), ''),
        'actor_profile_id', actor_id,
        'completed_at', now(),
        'source', 'TASK-067'
      )
    )
  )
  returning audit_log_id into success_event_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'shop_id', p_shop_id,
    'shop_code', target_shop.shop_code,
    'audit_event_id', success_event_id,
    'snapshot_audit_event_id', snapshot_event_id,
    'deleted_counts', deleted_counts,
    'deleted_at', now()
  );
exception
  when others then
    if actor_id is not null then
      begin
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
          actor_id,
          'global',
          null,
          'platform.shop.purge.failure',
          'critical',
          'failure',
          'shop',
          p_shop_id::text,
          jsonb_strip_nulls(
            jsonb_build_object(
              'original_shop_id', p_shop_id,
              'shop_code', target_shop.shop_code,
              'reason_redacted', nullif(left(redacted_reason, 240), ''),
              'actor_profile_id', actor_id,
              'code', 'db_failure',
              'source', 'TASK-067'
            )
          )
        )
        returning audit_log_id into success_event_id;
      exception
        when others then
          success_event_id := null;
      end;
    end if;

    return app_private.platform_action_result(false, 'db_failure', p_shop_id, success_event_id);
end;
$$;

revoke all on function public.platform_force_purge_test_shop(uuid, text, text) from public;
revoke all on function public.platform_force_purge_test_shop(uuid, text, text) from anon;
revoke all on function public.platform_force_purge_test_shop(uuid, text, text) from authenticated;
grant execute on function public.platform_force_purge_test_shop(uuid, text, text) to authenticated;
