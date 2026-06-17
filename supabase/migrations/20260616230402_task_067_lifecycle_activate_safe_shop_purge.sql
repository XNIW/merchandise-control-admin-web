-- TASK-067 review fix: compact lifecycle support and safe test-shop purge.
-- Boundary: all state changes and physical deletes remain audited
-- security-definer RPCs callable only by authenticated Platform Admins.

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
  blocking_reasons text[] := array[]::text[];
  count_value integer;
begin
  select jsonb_build_object(
    'audit_logs', (select count(*) from public.audit_logs where shop_id = p_shop_id),
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

  count_value := (dependency_counts ->> 'audit_logs')::integer;
  if count_value > 0 then
    blocking_reasons := array_append(
      blocking_reasons,
      'Shop-scoped audit rows are append-only; use Archive unless audit retention is redesigned.'
    );
  end if;

  count_value := (dependency_counts ->> 'shop_members')::integer;
  if count_value > 0 then
    blocking_reasons := array_append(blocking_reasons, 'Membership records must be revoked before purge.');
  end if;

  count_value := (dependency_counts ->> 'shop_inventory_sources')::integer;
  if count_value > 0 then
    blocking_reasons := array_append(blocking_reasons, 'Inventory source mappings must be removed before purge.');
  end if;

  count_value := (dependency_counts ->> 'platform_owner_invites')::integer;
  if count_value > 0 then
    blocking_reasons := array_append(blocking_reasons, 'Pending owner invites must be resolved before purge.');
  end if;

  if (
    (dependency_counts ->> 'shop_devices')::integer
    + (dependency_counts ->> 'staff_accounts')::integer
    + (dependency_counts ->> 'staff_role_permissions')::integer
    + (dependency_counts ->> 'staff_web_sessions')::integer
    + (dependency_counts ->> 'pos_device_credentials')::integer
    + (dependency_counts ->> 'pos_sessions')::integer
  ) > 0 then
    blocking_reasons := array_append(blocking_reasons, 'POS staff, device, or session rows must be cleaned before purge.');
  end if;

  if (
    (dependency_counts ->> 'pos_sales_sync_batches')::integer
    + (dependency_counts ->> 'pos_sales')::integer
    + (dependency_counts ->> 'pos_sale_lines')::integer
  ) > 0 then
    blocking_reasons := array_append(blocking_reasons, 'POS sales or sync batches exist; keep the archived record.');
  end if;

  if (
    (dependency_counts ->> 'inventory_suppliers')::integer
    + (dependency_counts ->> 'inventory_categories')::integer
    + (dependency_counts ->> 'inventory_products')::integer
    + (dependency_counts ->> 'inventory_product_prices')::integer
  ) > 0 then
    blocking_reasons := array_append(blocking_reasons, 'Catalog rows exist; keep the archived record.');
  end if;

  if (
    (dependency_counts ->> 'shared_sheet_sessions')::integer
    + (dependency_counts ->> 'sync_events')::integer
  ) > 0 then
    blocking_reasons := array_append(blocking_reasons, 'Mobile history or sync rows exist; keep the archived record.');
  end if;

  return jsonb_build_object(
    'counts', dependency_counts,
    'blocking_reasons', to_jsonb(blocking_reasons),
    'safe_to_purge', cardinality(blocking_reasons) = 0
  );
end;
$$;

revoke all on function app_private.platform_shop_purge_dependency_summary(uuid) from public;
revoke all on function app_private.platform_shop_purge_dependency_summary(uuid) from anon;
revoke all on function app_private.platform_shop_purge_dependency_summary(uuid) from authenticated;

create or replace function public.platform_activate_shop(
  p_shop_id uuid,
  p_shop_code_confirmation text,
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
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  select * into target_shop from public.shops where shop_id = p_shop_id for update;

  if not found then
    return app_private.platform_action_result(false, 'shop_not_found');
  end if;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'shop', p_shop_id, 'platform.shop.activate.attempt',
    'info', 'success', 'shop', p_shop_id::text, redacted_reason, 'attempt'
  );

  if length(redacted_reason) = 0
    or upper(btrim(coalesce(p_shop_code_confirmation, ''))) <> target_shop.shop_code then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'shop', p_shop_id, 'platform.shop.activate.failure',
      'warning', 'blocked', 'shop', p_shop_id::text, redacted_reason, 'validation_failed'
    );
    return app_private.platform_action_result(false, 'validation_failed', p_shop_id, audit_event_id);
  end if;

  if target_shop.shop_status <> 'pending_setup' then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'shop', p_shop_id, 'platform.shop.activate.failure',
      'warning', 'blocked', 'shop', p_shop_id::text, redacted_reason, 'invalid_state'
    );
    return app_private.platform_action_result(false, 'invalid_state', p_shop_id, audit_event_id);
  end if;

  update public.shops
  set shop_status = 'active',
      archived_at = null,
      archived_by_profile_id = null,
      suspended_at = null,
      suspended_by_profile_id = null,
      status_reason_redacted = left(redacted_reason, 240),
      status_changed_at = now(),
      status_changed_by_profile_id = actor_id,
      updated_at = now()
  where shop_id = p_shop_id;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'shop', p_shop_id, 'platform.shop.activate.success',
    'info', 'success', 'shop', p_shop_id::text, redacted_reason, 'success'
  );

  return app_private.platform_action_result(true, 'success', p_shop_id, audit_event_id);
exception
  when others then
    if actor_id is not null then
      audit_event_id := app_private.write_platform_shop_audit(
        actor_id, 'shop', p_shop_id, 'platform.shop.activate.failure',
        'critical', 'failure', 'shop', p_shop_id::text, redacted_reason, 'db_failure'
      );
    end if;
    return app_private.platform_action_result(false, 'db_failure', p_shop_id, audit_event_id);
end;
$$;

revoke all on function public.platform_activate_shop(uuid, text, text) from public;
revoke all on function public.platform_activate_shop(uuid, text, text) from anon;
revoke all on function public.platform_activate_shop(uuid, text, text) from authenticated;
grant execute on function public.platform_activate_shop(uuid, text, text) to authenticated;

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
  blocking_reasons text[];
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
  into blocking_reasons
  from jsonb_array_elements_text(dependency_summary -> 'blocking_reasons') as reasons(value);

  if target_shop.shop_status <> 'archived' then
    blocking_reasons := array_append(blocking_reasons, 'Shop must be archived before purge.');
  end if;

  synthetic_target :=
    target_shop.shop_code ~ '^(TASK|TEST|LOCAL|STAGING|DEV)[A-Z0-9_-]*$'
    or target_shop.shop_code like '%_TEST_%';

  if not synthetic_target then
    blocking_reasons := array_append(
      blocking_reasons,
      'Purge is limited to synthetic test/local/staging shop codes.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', case when cardinality(blocking_reasons) = 0 then 'success' else 'dependencies_blocked' end,
    'shop_id', p_shop_id,
    'shop_code', target_shop.shop_code,
    'shop_status', target_shop.shop_status,
    'safe_to_purge', cardinality(blocking_reasons) = 0,
    'counts', dependency_summary -> 'counts',
    'blocking_reasons', to_jsonb(blocking_reasons)
  );
end;
$$;

revoke all on function public.platform_preview_shop_purge(uuid) from public;
revoke all on function public.platform_preview_shop_purge(uuid) from anon;
revoke all on function public.platform_preview_shop_purge(uuid) from authenticated;
grant execute on function public.platform_preview_shop_purge(uuid) to authenticated;

create or replace function public.platform_purge_shop(
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
  audit_event_id uuid;
  dependency_summary jsonb;
  blocking_reasons text[];
  expected_confirmation text;
  synthetic_target boolean;
begin
  perform set_config('lock_timeout', '3s', true);
  perform set_config('statement_timeout', '15s', true);

  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_shop_id::text));

  select * into target_shop from public.shops where shop_id = p_shop_id for update;

  if not found then
    return app_private.platform_action_result(false, 'shop_not_found');
  end if;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'global', null, 'platform.shop.purge.attempt',
    'critical', 'success', 'shop', p_shop_id::text, redacted_reason, 'attempt'
  );

  expected_confirmation := 'DELETE ' || target_shop.shop_code;
  if length(redacted_reason) = 0 or btrim(coalesce(p_confirmation, '')) <> expected_confirmation then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.shop.purge.failure',
      'critical', 'blocked', 'shop', p_shop_id::text, redacted_reason, 'validation_failed'
    );
    return app_private.platform_action_result(false, 'validation_failed', p_shop_id, audit_event_id);
  end if;

  if target_shop.shop_status <> 'archived' then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.shop.purge.failure',
      'critical', 'blocked', 'shop', p_shop_id::text, redacted_reason, 'not_archived'
    );
    return app_private.platform_action_result(false, 'not_archived', p_shop_id, audit_event_id);
  end if;

  synthetic_target :=
    target_shop.shop_code ~ '^(TASK|TEST|LOCAL|STAGING|DEV)[A-Z0-9_-]*$'
    or target_shop.shop_code like '%_TEST_%';

  if not synthetic_target then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.shop.purge.failure',
      'critical', 'blocked', 'shop', p_shop_id::text, redacted_reason, 'unsafe_purge_target'
    );
    return app_private.platform_action_result(false, 'unsafe_purge_target', p_shop_id, audit_event_id);
  end if;

  dependency_summary := app_private.platform_shop_purge_dependency_summary(p_shop_id);
  select coalesce(array_agg(value), array[]::text[])
  into blocking_reasons
  from jsonb_array_elements_text(dependency_summary -> 'blocking_reasons') as reasons(value);

  if cardinality(blocking_reasons) > 0 then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.shop.purge.failure',
      'critical', 'blocked', 'shop', p_shop_id::text, redacted_reason, 'dependencies_blocked'
    );
    return app_private.platform_action_result(false, 'dependencies_blocked', p_shop_id, audit_event_id);
  end if;

  delete from public.pos_sale_lines where shop_id = p_shop_id;
  delete from public.pos_sales where shop_id = p_shop_id;
  delete from public.pos_sales_sync_batches where shop_id = p_shop_id;
  delete from public.staff_web_sessions where shop_id = p_shop_id;
  delete from public.pos_sessions where shop_id = p_shop_id;
  delete from public.pos_device_credentials where shop_id = p_shop_id;
  delete from public.shop_devices where shop_id = p_shop_id;
  delete from public.staff_role_permissions where shop_id = p_shop_id;
  delete from public.staff_accounts where shop_id = p_shop_id;
  delete from public.inventory_product_prices where shop_id = p_shop_id;
  delete from public.inventory_products where shop_id = p_shop_id;
  delete from public.inventory_categories where shop_id = p_shop_id;
  delete from public.inventory_suppliers where shop_id = p_shop_id;
  delete from public.shared_sheet_sessions where shop_id = p_shop_id;
  delete from public.sync_events where shop_id = p_shop_id;
  delete from public.platform_owner_invites where shop_id = p_shop_id;
  delete from public.shop_members where shop_id = p_shop_id;
  delete from public.shop_inventory_sources where shop_id = p_shop_id;
  delete from public.shops where shop_id = p_shop_id;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'global', null, 'platform.shop.purge.success',
    'critical', 'success', 'shop', p_shop_id::text, redacted_reason, 'success'
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'shop_id', p_shop_id,
    'shop_code', target_shop.shop_code,
    'audit_event_id', audit_event_id,
    'deleted_counts', dependency_summary -> 'counts',
    'deleted_at', now()
  );
exception
  when others then
    if actor_id is not null then
      audit_event_id := app_private.write_platform_shop_audit(
        actor_id, 'global', null, 'platform.shop.purge.failure',
        'critical', 'failure', 'shop', p_shop_id::text, redacted_reason, 'db_failure'
      );
    end if;
    return app_private.platform_action_result(false, 'db_failure', p_shop_id, audit_event_id);
end;
$$;

revoke all on function public.platform_purge_shop(uuid, text, text) from public;
revoke all on function public.platform_purge_shop(uuid, text, text) from anon;
revoke all on function public.platform_purge_shop(uuid, text, text) from authenticated;
grant execute on function public.platform_purge_shop(uuid, text, text) to authenticated;
