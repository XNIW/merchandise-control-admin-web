-- PRIVATE REVIEW PACKET, NOT ADMITTED: fresh catalog metadata qualified05:51:57; new local combined-candidate tests remain NOT_RUN.
-- Project jpgoimipbothfgkokyvm only; counterfactual, no public API/config/ACL/writer changes.
BEGIN;
SET LOCAL statement_timeout='8s';
SET LOCAL search_path=pg_catalog;
DO $test_identity_guard$
DECLARE expected jsonb; actual jsonb;
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' OR current_database()<>'postgres'
 OR current_setting('statement_timeout')<>'8s'
 OR (SELECT rolconfig FROM pg_roles WHERE rolname='authenticated') IS DISTINCT FROM ARRAY['statement_timeout=8s']::text[]
 OR (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'SHARED_READER_TEST_IDENTITY_ROLE_TLS_OR_BUDGET_MISMATCH'; END IF;
 FOR expected IN SELECT value FROM jsonb_array_elements($expected$[{"acl":["postgres=X/postgres"],"md5":"0199f8030d3bd207ac27527ed9a52862","oid":"58092","owner":"postgres","config":["search_path=public, app_private, pg_temp"],"signature":"app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)","volatility":"v","securityDefiner":true},{"acl":["postgres=X/postgres"],"md5":"cff4df227722873f6a3c48c90529c683","oid":"58094","owner":"postgres","config":["search_path=pg_catalog, pg_temp"],"signature":"app_private.lock_sync_event_visibility_transition_v1(uuid,uuid,uuid,uuid)","volatility":"v","securityDefiner":true},{"acl":["postgres=X/postgres"],"md5":"1c06b9566a315b3d68f908902e284d99","oid":"58093","owner":"postgres","config":["search_path=public, app_private, pg_temp"],"signature":"app_private.require_sync_event_scope_fence_v1()","volatility":"v","securityDefiner":true},{"acl":["postgres=X/postgres"],"md5":"0f47ec89de6f5ea847548e55721d7f54","oid":"58204","owner":"postgres","config":["search_path=public, app_private, pg_temp"],"signature":"app_private.resolve_shop_sync_recovery_scope(uuid,text)","volatility":"v","securityDefiner":true},{"acl":["postgres=X/postgres"],"md5":"5c56ddfa4e479e85a9158114722b14f8","oid":"58091","owner":"postgres","config":["search_path=public, pg_temp"],"signature":"app_private.sync_event_scope_fence_key_v1(uuid,uuid)","volatility":"s","securityDefiner":true},{"acl":["postgres=X/postgres"],"md5":"6fb3118d630941b56b6772db94868567","oid":"58221","owner":"postgres","config":["search_path=public, app_private, pg_temp"],"signature":"app_private.sync_recovery_preflight_counts_v1(uuid,text,uuid,uuid)","volatility":"s","securityDefiner":true},{"acl":["postgres=X/postgres","service_role=X/postgres","authenticated=X/postgres"],"md5":"e96776835a655ebaf6dd56d9000e63b5","oid":"58247","owner":"postgres","config":["search_path=public, app_private, pg_temp"],"signature":"public.shop_sync_convergence_marker_v1(uuid,text,text,text)","volatility":"v","securityDefiner":true},{"acl":["postgres=X/postgres","service_role=X/postgres","authenticated=X/postgres"],"md5":"60473835c0aa6a53ae16d1c303f3c7bf","oid":"58243","owner":"postgres","config":["search_path=public, app_private, pg_temp"],"signature":"public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)","volatility":"v","securityDefiner":true}]$expected$::jsonb) LOOP
  SELECT jsonb_build_object('signature',expected->>'signature','oid',f.oid::text,'md5',md5(f.prosrc),'owner',pg_get_userbyid(f.proowner),
    'config',f.proconfig,'acl',to_jsonb(f.proacl),'volatility',f.provolatile::text,'securityDefiner',f.prosecdef)
  INTO actual FROM pg_proc f WHERE f.oid=to_regprocedure(expected->>'signature');
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'SHARED_READER_PINNED_FUNCTION_MISMATCH'; END IF;
 END LOOP;
END; $test_identity_guard$;
DO $closure15_guard$ DECLARE expected jsonb; actual jsonb; BEGIN
 FOR expected IN SELECT value FROM jsonb_array_elements($closure15expected$[{"signature":"auth.uid()","sourceMD5":"cdef18c69c4f4cbbced2eaf81e628b49","metadata":{"oid":"16542","proacl":["=X/supabase_auth_admin","supabase_auth_admin=X/supabase_auth_admin","dashboard_user=X/supabase_auth_admin"],"probin":null,"procost":100,"prokind":"f","prolang":"14","proname":"uid","prorows":0,"pronargs":0,"proowner":"16545","proconfig":null,"proretset":false,"prosecdef":false,"prorettype":"2950","prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":null,"proargtypes":[],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"s","proleakproof":false,"pronamespace":"16498","proallargtypes":null,"proargdefaults":null,"pronargdefaults":0}},{"signature":"app_private.sync_event_scope_fence_key_v1(uuid,uuid)","sourceMD5":"5c56ddfa4e479e85a9158114722b14f8","metadata":{"oid":"58091","proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","prolang":"14","proname":"sync_event_scope_fence_key_v1","prorows":0,"pronargs":2,"proowner":"16388","proconfig":["search_path=public, pg_temp"],"proretset":false,"prosecdef":true,"prorettype":"25","prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":["p_owner_user_id","p_shop_id"],"proargtypes":["2950","2950"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"s","proleakproof":false,"pronamespace":"33782","proallargtypes":null,"proargdefaults":null,"pronargdefaults":0}},{"signature":"app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)","sourceMD5":"0199f8030d3bd207ac27527ed9a52862","metadata":{"oid":"58092","proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","prolang":"13619","proname":"acquire_sync_event_scope_fence_v1","prorows":0,"pronargs":2,"proowner":"16388","proconfig":["search_path=public, app_private, pg_temp"],"proretset":false,"prosecdef":true,"prorettype":"2278","prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":["p_owner_user_id","p_shop_id"],"proargtypes":["2950","2950"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"v","proleakproof":false,"pronamespace":"33782","proallargtypes":null,"proargdefaults":null,"pronargdefaults":0}},{"signature":"app_private.lock_catalog_scope_pair_v1(uuid,uuid)","sourceMD5":"e7e8c0b08519a53345e9ca583e484481","metadata":{"oid":"58136","proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","prolang":"13619","proname":"lock_catalog_scope_pair_v1","prorows":0,"pronargs":2,"proowner":"16388","proconfig":["search_path=pg_catalog"],"proretset":false,"prosecdef":true,"prorettype":"2278","prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":["p_shop_id","p_owner_user_id"],"proargtypes":["2950","2950"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"v","proleakproof":false,"pronamespace":"33782","proallargtypes":null,"proargdefaults":null,"pronargdefaults":0}},{"signature":"app_private.sync_checkpoint_sha256(text)","sourceMD5":"6a5cfc971b844f8b51928f3c2dc6fc0e","metadata":{"oid":"58198","proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","prolang":"13619","proname":"sync_checkpoint_sha256","prorows":0,"pronargs":1,"proowner":"16388","proconfig":["search_path=\"\""],"proretset":false,"prosecdef":false,"prorettype":"25","prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":["p_value"],"proargtypes":["25"],"proisstrict":false,"proparallel":"s","protrftypes":null,"provariadic":"0","provolatile":"i","proleakproof":false,"pronamespace":"33782","proallargtypes":null,"proargdefaults":null,"pronargdefaults":0}},{"signature":"app_private.resolve_shop_sync_recovery_scope(uuid,text)","sourceMD5":"0f47ec89de6f5ea847548e55721d7f54","metadata":{"oid":"58204","proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","prolang":"13619","proname":"resolve_shop_sync_recovery_scope","prorows":1000,"pronargs":2,"proowner":"16388","proconfig":["search_path=public, app_private, pg_temp"],"proretset":true,"prosecdef":true,"prorettype":"2249","prosqlbody":null,"prosupport":"-","proargmodes":["i","i","t","t","t","t","t","t","t","t"],"proargnames":["p_shop_id","p_device_identifier","mapped_owner_id","authorized_legacy_owner_id","scope_kind","history_scope_kind","scope_key","legacy_owner_key","account_key","device_key"],"proargtypes":["2950","25"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"v","proleakproof":false,"pronamespace":"33782","proallargtypes":["2950","25","2950","2950","25","25","25","25","25","25"],"proargdefaults":null,"pronargdefaults":0}}]$closure15expected$::jsonb) LOOP
 SELECT jsonb_build_object('signature',expected->>'signature','sourceMD5',md5(p.prosrc),'metadata',to_jsonb(p)-'prosrc') INTO actual FROM pg_proc p WHERE p.oid=to_regprocedure(expected->>'signature');
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'FRESH_CLOSURE_FUNCTION_FULL_METADATA_DRIFT';END IF;
 END LOOP; END; $closure15_guard$;

DO $catalog_guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('app_private.lock_catalog_scope_pair_v1(uuid,uuid)')
 AND md5(p.prosrc)='e7e8c0b08519a53345e9ca583e484481' AND pg_get_userbyid(p.proowner)='postgres'
 AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=pg_catalog']::text[])
 THEN RAISE EXCEPTION 'ORIGINAL_CATALOG_WRITER_SOURCE_OR_METADATA_DRIFT'; END IF;
END; $catalog_guard$;
DO $absence$ BEGIN
 IF to_regprocedure('app_private.acquire_sync_event_scope_read_fence_v1(uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'PRIVATE_READ_HELPER_ALREADY_EXISTS'; END IF;
 IF to_regprocedure('app_private.lock_catalog_scope_pair_read_v1(uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'PRIVATE_READ_HELPER_ALREADY_EXISTS'; END IF;
 IF to_regprocedure('app_private.resolve_shop_sync_recovery_read_scope_v1(uuid,text)') IS NOT NULL THEN RAISE EXCEPTION 'PRIVATE_READ_HELPER_ALREADY_EXISTS'; END IF;
END; $absence$;
DO $original_metadata$ DECLARE snapshot jsonb; BEGIN SELECT jsonb_object_agg(p.oid::text,CASE WHEN p.oid='public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END) INTO snapshot FROM pg_proc p WHERE p.oid IN ('app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)'::regprocedure,'app_private.lock_sync_event_visibility_transition_v1(uuid,uuid,uuid,uuid)'::regprocedure,'app_private.require_sync_event_scope_fence_v1()'::regprocedure,'app_private.resolve_shop_sync_recovery_scope(uuid,text)'::regprocedure,'app_private.sync_event_scope_fence_key_v1(uuid,uuid)'::regprocedure,'app_private.sync_recovery_preflight_counts_v1(uuid,text,uuid,uuid)'::regprocedure,'public.shop_sync_convergence_marker_v1(uuid,text,text,text)'::regprocedure,'public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure,'app_private.lock_catalog_scope_pair_v1(uuid,uuid)'::regprocedure); PERFORM set_config('task145.sr15.original_metadata',snapshot::text,true); END; $original_metadata$;
CREATE FUNCTION app_private.acquire_sync_event_scope_read_fence_v1(
  p_owner_user_id uuid,
  p_shop_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $reader$
DECLARE
  v_scope_key text;
BEGIN
  v_scope_key := app_private.sync_event_scope_fence_key_v1(
    p_owner_user_id,
    p_shop_id
  );
  IF v_scope_key IS NULL THEN
    RAISE EXCEPTION 'sync event scope fence requires an owner identity'
      USING ERRCODE = '23502';
  END IF;
  PERFORM pg_advisory_xact_lock_shared(
    hashtext('sync_event_scope_fence_v1'),
    hashtext(v_scope_key)
  );
END;
$reader$;
REVOKE ALL ON FUNCTION app_private.acquire_sync_event_scope_read_fence_v1(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app_private.lock_catalog_scope_pair_read_v1(
  p_shop_id uuid,
  p_owner_user_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_shop_key text := case when p_shop_id is null then null else lower(p_shop_id::text) end;
  v_owner_key text := case when p_owner_user_id is null then null else lower(p_owner_user_id::text) end;
begin
  if v_shop_key is null and v_owner_key is null then
    raise exception 'catalog scope lock requires an identity'
      using errcode = '22023';
  end if;

  if v_shop_key is null or v_owner_key is null or v_shop_key = v_owner_key then
    perform pg_advisory_xact_lock_shared(
      hashtext('catalog_union_scope'),
      hashtext(coalesce(v_shop_key, v_owner_key))
    );
  elsif v_shop_key < v_owner_key then
    perform pg_advisory_xact_lock_shared(hashtext('catalog_union_scope'), hashtext(v_shop_key));
    perform pg_advisory_xact_lock_shared(hashtext('catalog_union_scope'), hashtext(v_owner_key));
  else
    perform pg_advisory_xact_lock_shared(hashtext('catalog_union_scope'), hashtext(v_owner_key));
    perform pg_advisory_xact_lock_shared(hashtext('catalog_union_scope'), hashtext(v_shop_key));
  end if;
end;
$$;
REVOKE ALL ON FUNCTION app_private.lock_catalog_scope_pair_read_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.resolve_shop_sync_recovery_read_scope_v1(
  p_shop_id uuid,
  p_device_identifier text
)
returns table (
  mapped_owner_id uuid,
  authorized_legacy_owner_id uuid,
  scope_kind text,
  history_scope_kind text,
  scope_key text,
  legacy_owner_key text,
  account_key text,
  device_key text
)
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_actor_profile_id uuid := auth.uid();
  v_mapped_owner_id uuid;
  v_initial_mapped_owner_id uuid;
  v_has_blocking_mapping boolean := false;
  v_has_shop_catalog_rows boolean := false;
  v_has_legacy_catalog_rows boolean := false;
  v_device_identifier text;
  v_account_key text;
  v_device_key text;
begin
  if v_actor_profile_id is null then
    raise exception 'shop sync recovery requires authentication'
      using errcode = '28000';
  end if;

  if p_shop_id is null then
    raise exception 'shop sync recovery requires a shop id'
      using errcode = '22023';
  end if;

  -- Bound the raw value before trimming it so whitespace cannot cause an
  -- unbounded intermediate allocation before the device lease check.
  if p_device_identifier is null
    or octet_length(p_device_identifier) > 160 then
    raise exception 'shop sync recovery requires a valid device identity'
      using errcode = '22023';
  end if;
  v_device_identifier := btrim(p_device_identifier);
  if octet_length(v_device_identifier) = 0 then
    raise exception 'shop sync recovery requires a valid device identity'
      using errcode = '22023';
  end if;

  -- Fixed lock order: shop -> profile -> membership -> device -> catalog
  -- scope.  Any concurrent deactivate/revoke/mapping transition must wait
  -- until the enclosing recovery RPC either returns a self-consistent payload
  -- or fails closed.
  perform 1
  from public.shops shop
  where shop.shop_id = p_shop_id
    and shop.shop_status = 'active'
  for share;
  if not found then
    raise exception 'shop sync recovery requires an active owner/manager shop binding'
      using errcode = '42501';
  end if;

  perform 1
  from public.profiles profile
  where profile.profile_id = v_actor_profile_id
    and profile.profile_status = 'active'
  for share;
  if not found then
    raise exception 'shop sync recovery requires an active owner/manager shop binding'
      using errcode = '42501';
  end if;

  perform 1
  from public.shop_members member
  where member.shop_id = p_shop_id
    and member.profile_id = v_actor_profile_id
    and member.membership_status = 'active'
    and member.role_key in ('shop_owner', 'shop_manager')
  for share;
  if not found then
    raise exception 'shop sync recovery requires an active owner/manager shop binding'
      using errcode = '42501';
  end if;

  perform 1
  from public.shop_devices device
  where device.shop_id = p_shop_id
    and device.device_identifier = v_device_identifier
    and device.status = 'active'
    and device.revoked_at is null
  for share;
  if not found then
    raise exception 'shop sync recovery requires an active device lease'
      using errcode = '42501';
  end if;

  -- Mapping transitions take the same advisory pair lock before changing a
  -- source row.  Select an initial owner only to derive the lock key, then
  -- lock and re-read all source rows before computing the visible union.
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

  perform app_private.lock_catalog_scope_pair_read_v1(
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

  if v_has_blocking_mapping then
    raise exception 'shop_sync_recovery_scope_unresolved'
      using errcode = '55000';
  end if;

  select
    exists (select 1 from public.inventory_suppliers row where row.shop_id = p_shop_id)
    or exists (select 1 from public.inventory_categories row where row.shop_id = p_shop_id)
    or exists (select 1 from public.inventory_products row where row.shop_id = p_shop_id)
    or exists (select 1 from public.inventory_product_prices row where row.shop_id = p_shop_id)
  into v_has_shop_catalog_rows;

  if v_mapped_owner_id is not null then
    select
      exists (select 1 from public.inventory_suppliers row where row.shop_id is null and row.owner_user_id = v_mapped_owner_id)
      or exists (select 1 from public.inventory_categories row where row.shop_id is null and row.owner_user_id = v_mapped_owner_id)
      or exists (select 1 from public.inventory_products row where row.shop_id is null and row.owner_user_id = v_mapped_owner_id)
      or exists (select 1 from public.inventory_product_prices row where row.shop_id is null and row.owner_user_id = v_mapped_owner_id)
    into v_has_legacy_catalog_rows;
  end if;

  scope_kind := case
    when v_has_shop_catalog_rows and v_has_legacy_catalog_rows
      then 'authorized_shop_plus_legacy'
    when v_has_shop_catalog_rows or v_mapped_owner_id is null
      then 'shop_scoped'
    else 'legacy_owner_bridge'
  end;
  mapped_owner_id := case
    when scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
      then v_mapped_owner_id
    else null
  end;
  authorized_legacy_owner_id := v_mapped_owner_id;
  history_scope_kind := case
    when v_mapped_owner_id is null then 'shop_scoped'
    else 'authorized_shop_plus_legacy'
  end;
  legacy_owner_key := case
    when v_mapped_owner_id is null then null
    else app_private.sync_checkpoint_sha256(lower(v_mapped_owner_id::text))
  end;
  v_account_key := app_private.sync_checkpoint_sha256(
    lower(v_actor_profile_id::text)
  );
  account_key := v_account_key;
  v_device_key := app_private.sync_checkpoint_sha256(v_device_identifier);
  device_key := v_device_key;

  scope_key := app_private.sync_checkpoint_sha256(
    v_account_key || ':' || lower(p_shop_id::text) || ':' || scope_kind || ':' ||
    coalesce(lower(mapped_owner_id::text), '-') || ':' || history_scope_kind || ':' ||
    coalesce(lower(v_mapped_owner_id::text), '-') || ':' || v_device_key
  );
  return next;
end;
$$;
REVOKE ALL ON FUNCTION app_private.resolve_shop_sync_recovery_read_scope_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
DO $cp_swap$ DECLARE definition text; BEGIN SELECT pg_get_functiondef('public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure) INTO STRICT definition;
 IF (length(definition)-length(replace(definition,'app_private.resolve_shop_sync_recovery_scope(','')))/length('app_private.resolve_shop_sync_recovery_scope(')<>1 THEN RAISE EXCEPTION 'EXACT_CALLSITE_COUNT_DRIFT';END IF;
 definition:=replace(definition,'app_private.resolve_shop_sync_recovery_scope(','app_private.resolve_shop_sync_recovery_read_scope_v1(');
 IF (length(definition)-length(replace(definition,'app_private.acquire_sync_event_scope_fence_v1(','')))/length('app_private.acquire_sync_event_scope_fence_v1(')<>1 THEN RAISE EXCEPTION 'EXACT_CALLSITE_COUNT_DRIFT';END IF;
 definition:=replace(definition,'app_private.acquire_sync_event_scope_fence_v1(','app_private.acquire_sync_event_scope_read_fence_v1(');
 EXECUTE definition; IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure)<>'7a1e3ec3050743656759432ad448a37b' THEN RAISE EXCEPTION 'CP_BODY_POST_MISMATCH';END IF; END; $cp_swap$;
DO $helper_guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('app_private.acquire_sync_event_scope_read_fence_v1(uuid,uuid)') AND md5(p.prosrc)='21a2f0eeef545f6aebb05f6c2757edc2' AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=public, app_private, pg_temp']::text[] AND (SELECT jsonb_agg(a::text ORDER BY a::text COLLATE "C") FROM unnest(p.proacl) a)='["postgres=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PRIVATE_READ_HELPER_BODY_METADATA_ACL_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('app_private.lock_catalog_scope_pair_read_v1(uuid,uuid)') AND md5(p.prosrc)='84cce948d3718e54ab946c81b6a400aa' AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND (SELECT jsonb_agg(a::text ORDER BY a::text COLLATE "C") FROM unnest(p.proacl) a)='["postgres=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PRIVATE_READ_HELPER_BODY_METADATA_ACL_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('app_private.resolve_shop_sync_recovery_read_scope_v1(uuid,text)') AND md5(p.prosrc)='334ed6616a382e7c9362a3e4efad70fc' AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=public, app_private, pg_temp']::text[] AND (SELECT jsonb_agg(a::text ORDER BY a::text COLLATE "C") FROM unnest(p.proacl) a)='["postgres=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PRIVATE_READ_HELPER_BODY_METADATA_ACL_DRIFT'; END IF;
END; $helper_guard$;
DO $original_metadata_post$ DECLARE snapshot jsonb; BEGIN SELECT jsonb_object_agg(p.oid::text,CASE WHEN p.oid='public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END) INTO snapshot FROM pg_proc p WHERE p.oid IN ('app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)'::regprocedure,'app_private.lock_sync_event_visibility_transition_v1(uuid,uuid,uuid,uuid)'::regprocedure,'app_private.require_sync_event_scope_fence_v1()'::regprocedure,'app_private.resolve_shop_sync_recovery_scope(uuid,text)'::regprocedure,'app_private.sync_event_scope_fence_key_v1(uuid,uuid)'::regprocedure,'app_private.sync_recovery_preflight_counts_v1(uuid,text,uuid,uuid)'::regprocedure,'public.shop_sync_convergence_marker_v1(uuid,text,text,text)'::regprocedure,'public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure,'app_private.lock_catalog_scope_pair_v1(uuid,uuid)'::regprocedure); IF snapshot IS DISTINCT FROM current_setting('task145.sr15.original_metadata')::jsonb THEN RAISE EXCEPTION 'ORIGINAL_FUNCTION_FULL_METADATA_CHANGED';END IF; END; $original_metadata_post$;
DO $test_identity_guard$
DECLARE expected jsonb; actual jsonb;
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' OR current_database()<>'postgres'
 OR current_setting('statement_timeout')<>'8s'
 OR (SELECT rolconfig FROM pg_roles WHERE rolname='authenticated') IS DISTINCT FROM ARRAY['statement_timeout=8s']::text[]
 OR (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'SHARED_READER_TEST_IDENTITY_ROLE_TLS_OR_BUDGET_MISMATCH'; END IF;
 FOR expected IN SELECT value FROM jsonb_array_elements($expected$[{"acl":["postgres=X/postgres"],"md5":"0199f8030d3bd207ac27527ed9a52862","oid":"58092","owner":"postgres","config":["search_path=public, app_private, pg_temp"],"signature":"app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)","volatility":"v","securityDefiner":true},{"acl":["postgres=X/postgres"],"md5":"cff4df227722873f6a3c48c90529c683","oid":"58094","owner":"postgres","config":["search_path=pg_catalog, pg_temp"],"signature":"app_private.lock_sync_event_visibility_transition_v1(uuid,uuid,uuid,uuid)","volatility":"v","securityDefiner":true},{"acl":["postgres=X/postgres"],"md5":"1c06b9566a315b3d68f908902e284d99","oid":"58093","owner":"postgres","config":["search_path=public, app_private, pg_temp"],"signature":"app_private.require_sync_event_scope_fence_v1()","volatility":"v","securityDefiner":true},{"acl":["postgres=X/postgres"],"md5":"0f47ec89de6f5ea847548e55721d7f54","oid":"58204","owner":"postgres","config":["search_path=public, app_private, pg_temp"],"signature":"app_private.resolve_shop_sync_recovery_scope(uuid,text)","volatility":"v","securityDefiner":true},{"acl":["postgres=X/postgres"],"md5":"5c56ddfa4e479e85a9158114722b14f8","oid":"58091","owner":"postgres","config":["search_path=public, pg_temp"],"signature":"app_private.sync_event_scope_fence_key_v1(uuid,uuid)","volatility":"s","securityDefiner":true},{"acl":["postgres=X/postgres"],"md5":"6fb3118d630941b56b6772db94868567","oid":"58221","owner":"postgres","config":["search_path=public, app_private, pg_temp"],"signature":"app_private.sync_recovery_preflight_counts_v1(uuid,text,uuid,uuid)","volatility":"s","securityDefiner":true},{"acl":["postgres=X/postgres","service_role=X/postgres","authenticated=X/postgres"],"md5":"e96776835a655ebaf6dd56d9000e63b5","oid":"58247","owner":"postgres","config":["search_path=public, app_private, pg_temp"],"signature":"public.shop_sync_convergence_marker_v1(uuid,text,text,text)","volatility":"v","securityDefiner":true},{"acl":["postgres=X/postgres","service_role=X/postgres","authenticated=X/postgres"],"md5":"7a1e3ec3050743656759432ad448a37b","oid":"58243","owner":"postgres","config":["search_path=public, app_private, pg_temp"],"signature":"public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)","volatility":"v","securityDefiner":true}]$expected$::jsonb) LOOP
  SELECT jsonb_build_object('signature',expected->>'signature','oid',f.oid::text,'md5',md5(f.prosrc),'owner',pg_get_userbyid(f.proowner),
    'config',f.proconfig,'acl',to_jsonb(f.proacl),'volatility',f.provolatile::text,'securityDefiner',f.prosecdef)
  INTO actual FROM pg_proc f WHERE f.oid=to_regprocedure(expected->>'signature');
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'SHARED_READER_PINNED_FUNCTION_MISMATCH'; END IF;
 END LOOP;
END; $test_identity_guard$;
DO $closure15_guard$ DECLARE expected jsonb; actual jsonb; BEGIN
 FOR expected IN SELECT value FROM jsonb_array_elements($closure15expected$[{"signature":"auth.uid()","sourceMD5":"cdef18c69c4f4cbbced2eaf81e628b49","metadata":{"oid":"16542","proacl":["=X/supabase_auth_admin","supabase_auth_admin=X/supabase_auth_admin","dashboard_user=X/supabase_auth_admin"],"probin":null,"procost":100,"prokind":"f","prolang":"14","proname":"uid","prorows":0,"pronargs":0,"proowner":"16545","proconfig":null,"proretset":false,"prosecdef":false,"prorettype":"2950","prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":null,"proargtypes":[],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"s","proleakproof":false,"pronamespace":"16498","proallargtypes":null,"proargdefaults":null,"pronargdefaults":0}},{"signature":"app_private.sync_event_scope_fence_key_v1(uuid,uuid)","sourceMD5":"5c56ddfa4e479e85a9158114722b14f8","metadata":{"oid":"58091","proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","prolang":"14","proname":"sync_event_scope_fence_key_v1","prorows":0,"pronargs":2,"proowner":"16388","proconfig":["search_path=public, pg_temp"],"proretset":false,"prosecdef":true,"prorettype":"25","prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":["p_owner_user_id","p_shop_id"],"proargtypes":["2950","2950"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"s","proleakproof":false,"pronamespace":"33782","proallargtypes":null,"proargdefaults":null,"pronargdefaults":0}},{"signature":"app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)","sourceMD5":"0199f8030d3bd207ac27527ed9a52862","metadata":{"oid":"58092","proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","prolang":"13619","proname":"acquire_sync_event_scope_fence_v1","prorows":0,"pronargs":2,"proowner":"16388","proconfig":["search_path=public, app_private, pg_temp"],"proretset":false,"prosecdef":true,"prorettype":"2278","prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":["p_owner_user_id","p_shop_id"],"proargtypes":["2950","2950"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"v","proleakproof":false,"pronamespace":"33782","proallargtypes":null,"proargdefaults":null,"pronargdefaults":0}},{"signature":"app_private.lock_catalog_scope_pair_v1(uuid,uuid)","sourceMD5":"e7e8c0b08519a53345e9ca583e484481","metadata":{"oid":"58136","proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","prolang":"13619","proname":"lock_catalog_scope_pair_v1","prorows":0,"pronargs":2,"proowner":"16388","proconfig":["search_path=pg_catalog"],"proretset":false,"prosecdef":true,"prorettype":"2278","prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":["p_shop_id","p_owner_user_id"],"proargtypes":["2950","2950"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"v","proleakproof":false,"pronamespace":"33782","proallargtypes":null,"proargdefaults":null,"pronargdefaults":0}},{"signature":"app_private.sync_checkpoint_sha256(text)","sourceMD5":"6a5cfc971b844f8b51928f3c2dc6fc0e","metadata":{"oid":"58198","proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","prolang":"13619","proname":"sync_checkpoint_sha256","prorows":0,"pronargs":1,"proowner":"16388","proconfig":["search_path=\"\""],"proretset":false,"prosecdef":false,"prorettype":"25","prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":["p_value"],"proargtypes":["25"],"proisstrict":false,"proparallel":"s","protrftypes":null,"provariadic":"0","provolatile":"i","proleakproof":false,"pronamespace":"33782","proallargtypes":null,"proargdefaults":null,"pronargdefaults":0}},{"signature":"app_private.resolve_shop_sync_recovery_scope(uuid,text)","sourceMD5":"0f47ec89de6f5ea847548e55721d7f54","metadata":{"oid":"58204","proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","prolang":"13619","proname":"resolve_shop_sync_recovery_scope","prorows":1000,"pronargs":2,"proowner":"16388","proconfig":["search_path=public, app_private, pg_temp"],"proretset":true,"prosecdef":true,"prorettype":"2249","prosqlbody":null,"prosupport":"-","proargmodes":["i","i","t","t","t","t","t","t","t","t"],"proargnames":["p_shop_id","p_device_identifier","mapped_owner_id","authorized_legacy_owner_id","scope_kind","history_scope_kind","scope_key","legacy_owner_key","account_key","device_key"],"proargtypes":["2950","25"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"v","proleakproof":false,"pronamespace":"33782","proallargtypes":["2950","25","2950","2950","25","25","25","25","25","25"],"proargdefaults":null,"pronargdefaults":0}}]$closure15expected$::jsonb) LOOP
 SELECT jsonb_build_object('signature',expected->>'signature','sourceMD5',md5(p.prosrc),'metadata',to_jsonb(p)-'prosrc') INTO actual FROM pg_proc p WHERE p.oid=to_regprocedure(expected->>'signature');
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'FRESH_CLOSURE_FUNCTION_FULL_METADATA_DRIFT';END IF;
 END LOOP; END; $closure15_guard$;

DO $catalog_guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('app_private.lock_catalog_scope_pair_v1(uuid,uuid)')
 AND md5(p.prosrc)='e7e8c0b08519a53345e9ca583e484481' AND pg_get_userbyid(p.proowner)='postgres'
 AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=pg_catalog']::text[])
 THEN RAISE EXCEPTION 'ORIGINAL_CATALOG_WRITER_SOURCE_OR_METADATA_DRIFT'; END IF;
END; $catalog_guard$;
COMMIT;
