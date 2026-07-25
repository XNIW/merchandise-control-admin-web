-- TASK-139: POS catalog pages are an authorized shop + legacy-owner union.
-- Hold the same scope-pair lock used by mapping and catalog writers while the
-- scope is resolved, and fence the final HTTP publication to the page's exact
-- revision/scope pair.

begin;

create or replace function app_private.resolve_pos_catalog_scope_v2(
  p_shop_id uuid
)
returns table (
  scope_kind text,
  scope_id uuid,
  blocked boolean
)
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_initial_mapped_owner_id uuid;
  v_mapped_owner_id uuid;
  v_has_blocking_mapping boolean := false;
  v_has_shop_rows boolean := false;
  v_has_legacy_rows boolean := false;
begin
  if p_shop_id is null then
    scope_kind := 'shop_scoped';
    scope_id := null;
    blocked := true;
    return next;
    return;
  end if;

  -- Read only enough identity to derive the canonical scope lock, then
  -- re-read every source after the lock.  Mapping writers take this same pair
  -- lock before changing the authorized union.
  select source.owner_user_id
    into v_initial_mapped_owner_id
  from public.shop_inventory_sources source
  where source.shop_id = p_shop_id
    and source.mapping_state = 'mapped'
    and source.owner_user_id is not null
    and source.verified_at is not null
    and pg_catalog.isfinite(source.created_at)
    and pg_catalog.isfinite(source.verified_at)
    and source.disabled_at is null
  order by source.created_at desc
  limit 1;

  perform app_private.lock_catalog_scope_pair_v1(
    p_shop_id,
    v_initial_mapped_owner_id
  );

  perform 1
  from public.shop_inventory_sources source
  where source.shop_id = p_shop_id
  for share;

  select source.owner_user_id
    into v_mapped_owner_id
  from public.shop_inventory_sources source
  where source.shop_id = p_shop_id
    and source.mapping_state = 'mapped'
    and source.owner_user_id is not null
    and source.verified_at is not null
    and pg_catalog.isfinite(source.created_at)
    and pg_catalog.isfinite(source.verified_at)
    and source.disabled_at is null
  order by source.created_at desc
  limit 1;

  select exists (
    select 1
    from public.shop_inventory_sources source
    where source.shop_id = p_shop_id
      and source.disabled_at is null
      and (
        source.mapping_state <> 'mapped'
        or source.owner_user_id is null
        or source.verified_at is null
        or not pg_catalog.isfinite(source.created_at)
        or (
          source.verified_at is not null
          and not pg_catalog.isfinite(source.verified_at)
        )
      )
  ) into v_has_blocking_mapping;

  select
    exists (select 1 from public.inventory_products row where row.shop_id = p_shop_id)
    or exists (select 1 from public.inventory_categories row where row.shop_id = p_shop_id)
    or exists (select 1 from public.inventory_suppliers row where row.shop_id = p_shop_id)
    or exists (select 1 from public.inventory_product_prices row where row.shop_id = p_shop_id)
  into v_has_shop_rows;

  if v_mapped_owner_id is not null then
    select
      exists (select 1 from public.inventory_products row where row.shop_id is null and row.owner_user_id = v_mapped_owner_id)
      or exists (select 1 from public.inventory_categories row where row.shop_id is null and row.owner_user_id = v_mapped_owner_id)
      or exists (select 1 from public.inventory_suppliers row where row.shop_id is null and row.owner_user_id = v_mapped_owner_id)
      or exists (select 1 from public.inventory_product_prices row where row.shop_id is null and row.owner_user_id = v_mapped_owner_id)
    into v_has_legacy_rows;
  end if;

  blocked := v_has_blocking_mapping
    or (v_mapped_owner_id is null and not v_has_shop_rows);
  scope_kind := case
    when v_has_shop_rows and v_has_legacy_rows then 'authorized_shop_plus_legacy'
    when v_has_shop_rows then 'shop_scoped'
    else 'legacy_owner_bridge'
  end;
  scope_id := case
    when scope_kind = 'shop_scoped' then p_shop_id
    else v_mapped_owner_id
  end;

  return next;
end;
$$;

alter function public.pos_catalog_revision_v2(uuid) volatile;
alter function public.pos_catalog_pull_page_v2(
  uuid, text, timestamptz, timestamptz, text, timestamptz, uuid,
  integer, text, text, text, boolean
) volatile;

create or replace function public.pos_runtime_lease_publish_success_v2(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_publication_kind text,
  p_expected_catalog_scope_key text default null,
  p_expected_catalog_revision text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_audit_id uuid;
  v_event_key text;
  v_target_id text;
  v_target_type text;
  v_scope record;
  v_scope_key text;
  v_revision bigint;
begin
  if p_shop_id is null
    or p_shop_device_id is null
    or p_staff_id is null
    or p_pos_session_id is null
    or p_publication_kind is null
    or p_publication_kind not in (
      'catalog_pull', 'first_login', 'heartbeat'
    ) then
    return jsonb_build_object('status', 'invalid');
  end if;

  if not app_private.pos_runtime_lease_is_valid_v1(
    p_shop_id, p_shop_device_id, p_staff_id, p_pos_session_id
  ) then
    return jsonb_build_object('status', 'denied');
  end if;

  if p_publication_kind = 'catalog_pull' then
    if p_expected_catalog_scope_key !~ '^[0-9a-f]{32}$'
      or p_expected_catalog_revision !~ '^(0|[1-9][0-9]{0,18})$' then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_scope
    from app_private.resolve_pos_catalog_scope_v2(p_shop_id);
    if v_scope.blocked then
      return jsonb_build_object('status', 'stale_catalog');
    end if;

    insert into app_private.pos_catalog_revisions(shop_id, revision, changed_at)
    values (p_shop_id, 0, statement_timestamp())
    on conflict (shop_id) do nothing;
    select revision
      into v_revision
    from app_private.pos_catalog_revisions
    where shop_id = p_shop_id
    for share;
    v_revision := coalesce(v_revision, 0);
    v_scope_key := app_private.pos_catalog_scope_key_v2(
      p_shop_id, v_scope.scope_kind, v_scope.scope_id
    );

    if p_expected_catalog_scope_key <> v_scope_key
      or p_expected_catalog_revision <> v_revision::text then
      return jsonb_build_object('status', 'stale_catalog');
    end if;
  elsif p_expected_catalog_scope_key is not null
    or p_expected_catalog_revision is not null then
    return jsonb_build_object('status', 'invalid');
  end if;

  if p_publication_kind = 'first_login' then
    insert into public.audit_logs (
      actor_profile_id, actor_staff_id, scope, shop_id, event_key,
      severity, result, target_type, target_id, metadata_redacted
    ) values (
      null, p_staff_id, 'shop', p_shop_id, 'pos.device.trusted',
      'info', 'success', 'device', p_shop_device_id::text,
      jsonb_build_object(
        'publication_kind', p_publication_kind,
        'source', 'TASK-139'
      )
    );

    insert into public.audit_logs (
      actor_profile_id, actor_staff_id, scope, shop_id, event_key,
      severity, result, target_type, target_id, metadata_redacted
    ) values (
      null, p_staff_id, 'shop', p_shop_id, 'pos.auth.first_login.success',
      'info', 'success', 'staff', p_staff_id::text,
      jsonb_build_object(
        'publication_kind', p_publication_kind,
        'source', 'TASK-139'
      )
    ) returning audit_log_id into v_audit_id;

    return jsonb_build_object('status', 'ok', 'auditId', v_audit_id);
  end if;

  v_event_key := case p_publication_kind
    when 'catalog_pull' then 'pos.catalog.pull.success'
    when 'heartbeat' then 'pos.session.heartbeat.success'
  end;
  v_target_id := case p_publication_kind
    when 'catalog_pull' then p_shop_device_id::text
    when 'heartbeat' then p_pos_session_id::text
  end;
  v_target_type := case p_publication_kind
    when 'catalog_pull' then 'device'
    when 'heartbeat' then 'pos_session'
  end;

  insert into public.audit_logs (
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    null, p_staff_id, 'shop', p_shop_id, v_event_key,
    'info', 'success', v_target_type, v_target_id,
    jsonb_build_object(
      'publication_kind', p_publication_kind,
      'source', 'TASK-139'
    )
  ) returning audit_log_id into v_audit_id;

  return jsonb_build_object('status', 'ok', 'auditId', v_audit_id);
end;
$$;

revoke all on function app_private.resolve_pos_catalog_scope_v2(uuid)
  from public, anon, authenticated, service_role;
grant execute on function app_private.resolve_pos_catalog_scope_v2(uuid)
  to service_role;
revoke all on function public.pos_runtime_lease_publish_success_v2(
  uuid, uuid, uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.pos_runtime_lease_publish_success_v2(
  uuid, uuid, uuid, uuid, text, text, text
) to service_role;

commit;
