-- TASK146 portable shared reader migration. The migrator owns transaction/ledger.
-- Original TEST-only operator packet is retained byte-exact under docs/RUNBOOKS/sql/task146-operator-lineage/.
-- Public checkpoint swap is exactly604→7a; only internal writer upgrade handling changes additionally.
SET LOCAL statement_timeout='8s';
SET LOCAL search_path=pg_catalog;
DO $logical_preimage$
DECLARE expected jsonb; actual jsonb; allowed_acl jsonb;
BEGIN
 IF current_user<>'postgres' OR current_database()<>'postgres' OR current_setting('statement_timeout')<>'8s'
 OR (SELECT rolconfig FROM pg_roles WHERE rolname='authenticated') IS DISTINCT FROM ARRAY['statement_timeout=8s']::text[]
 THEN RAISE EXCEPTION 'SHARED_READER_ROLE_OR_BUDGET_MISMATCH'; END IF;
 FOR expected IN SELECT value FROM jsonb_array_elements($expected$[{"acl":["postgres=X/postgres"],"md5":"0199f8030d3bd207ac27527ed9a52862","owner":"postgres","config":["search_path=public, app_private, pg_temp"],"signature":"app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)","volatility":"v","securityDefiner":true},{"acl":["postgres=X/postgres"],"md5":"cff4df227722873f6a3c48c90529c683","owner":"postgres","config":["search_path=pg_catalog, pg_temp"],"signature":"app_private.lock_sync_event_visibility_transition_v1(uuid,uuid,uuid,uuid)","volatility":"v","securityDefiner":true},{"acl":["postgres=X/postgres"],"md5":"1c06b9566a315b3d68f908902e284d99","owner":"postgres","config":["search_path=public, app_private, pg_temp"],"signature":"app_private.require_sync_event_scope_fence_v1()","volatility":"v","securityDefiner":true},{"acl":["postgres=X/postgres"],"md5":"0f47ec89de6f5ea847548e55721d7f54","owner":"postgres","config":["search_path=public, app_private, pg_temp"],"signature":"app_private.resolve_shop_sync_recovery_scope(uuid,text)","volatility":"v","securityDefiner":true},{"acl":["postgres=X/postgres"],"md5":"5c56ddfa4e479e85a9158114722b14f8","owner":"postgres","config":["search_path=public, pg_temp"],"signature":"app_private.sync_event_scope_fence_key_v1(uuid,uuid)","volatility":"s","securityDefiner":true},{"acl":["postgres=X/postgres"],"md5":"6fb3118d630941b56b6772db94868567","owner":"postgres","config":["search_path=public, app_private, pg_temp"],"signature":"app_private.sync_recovery_preflight_counts_v1(uuid,text,uuid,uuid)","volatility":"s","securityDefiner":true},{"acl":["postgres=X/postgres","service_role=X/postgres","authenticated=X/postgres"],"md5":"e96776835a655ebaf6dd56d9000e63b5","owner":"postgres","config":["search_path=public, app_private, pg_temp"],"signature":"public.shop_sync_convergence_marker_v1(uuid,text,text,text)","volatility":"v","securityDefiner":true},{"acl":["postgres=X/postgres","service_role=X/postgres","authenticated=X/postgres"],"md5":"60473835c0aa6a53ae16d1c303f3c7bf","owner":"postgres","config":["search_path=public, app_private, pg_temp"],"signature":"public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)","volatility":"v","securityDefiner":true}]$expected$::jsonb) LOOP
  SELECT jsonb_build_object('signature',expected->>'signature','md5',md5(p.prosrc),'owner',pg_get_userbyid(p.proowner),
    'config',p.proconfig,'acl',to_jsonb(p.proacl),'volatility',p.provolatile::text,'securityDefiner',p.prosecdef)
  INTO actual FROM pg_proc p WHERE p.oid=to_regprocedure(expected->>'signature');
  allowed_acl:=expected->'acl';
  IF expected->>'signature' LIKE 'public.%' THEN
   IF actual->'acl' IS DISTINCT FROM allowed_acl AND actual->'acl' IS DISTINCT FROM (allowed_acl-'service_role=X/postgres')
   THEN RAISE EXCEPTION 'SHARED_READER_PUBLIC_ACL_PREIMAGE_MISMATCH'; END IF;
   expected:=jsonb_set(expected,'{acl}',actual->'acl');
  END IF;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'SHARED_READER_LOGICAL_FUNCTION_MISMATCH'; END IF;
 END LOOP;
 FOR expected IN SELECT value FROM jsonb_array_elements($closure$[{"signature":"auth.uid()","sourceMD5":"cdef18c69c4f4cbbced2eaf81e628b49","metadata":{"proacl":["=X/supabase_auth_admin","supabase_auth_admin=X/supabase_auth_admin","dashboard_user=X/supabase_auth_admin"],"probin":null,"procost":100,"prokind":"f","proname":"uid","prorows":0,"pronargs":0,"proconfig":null,"proretset":false,"prosecdef":false,"prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":null,"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"s","proleakproof":false,"proallargtypes":null,"proargdefaults":null,"pronargdefaults":0,"schema":"auth","owner":"supabase_auth_admin","language":"sql","returnType":"uuid","argumentTypes":""}},{"signature":"app_private.sync_event_scope_fence_key_v1(uuid,uuid)","sourceMD5":"5c56ddfa4e479e85a9158114722b14f8","metadata":{"proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","proname":"sync_event_scope_fence_key_v1","prorows":0,"pronargs":2,"proconfig":["search_path=public, pg_temp"],"proretset":false,"prosecdef":true,"prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":["p_owner_user_id","p_shop_id"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"s","proleakproof":false,"proallargtypes":null,"proargdefaults":null,"pronargdefaults":0,"schema":"app_private","owner":"postgres","language":"sql","returnType":"text","argumentTypes":"uuid, uuid"}},{"signature":"app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)","sourceMD5":"0199f8030d3bd207ac27527ed9a52862","metadata":{"proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","proname":"acquire_sync_event_scope_fence_v1","prorows":0,"pronargs":2,"proconfig":["search_path=public, app_private, pg_temp"],"proretset":false,"prosecdef":true,"prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":["p_owner_user_id","p_shop_id"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"v","proleakproof":false,"proallargtypes":null,"proargdefaults":null,"pronargdefaults":0,"schema":"app_private","owner":"postgres","language":"plpgsql","returnType":"void","argumentTypes":"uuid, uuid"}},{"signature":"app_private.lock_catalog_scope_pair_v1(uuid,uuid)","sourceMD5":"e7e8c0b08519a53345e9ca583e484481","metadata":{"proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","proname":"lock_catalog_scope_pair_v1","prorows":0,"pronargs":2,"proconfig":["search_path=pg_catalog"],"proretset":false,"prosecdef":true,"prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":["p_shop_id","p_owner_user_id"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"v","proleakproof":false,"proallargtypes":null,"proargdefaults":null,"pronargdefaults":0,"schema":"app_private","owner":"postgres","language":"plpgsql","returnType":"void","argumentTypes":"uuid, uuid"}},{"signature":"app_private.sync_checkpoint_sha256(text)","sourceMD5":"6a5cfc971b844f8b51928f3c2dc6fc0e","metadata":{"proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","proname":"sync_checkpoint_sha256","prorows":0,"pronargs":1,"proconfig":["search_path=\"\""],"proretset":false,"prosecdef":false,"prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":["p_value"],"proisstrict":false,"proparallel":"s","protrftypes":null,"provariadic":"0","provolatile":"i","proleakproof":false,"proallargtypes":null,"proargdefaults":null,"pronargdefaults":0,"schema":"app_private","owner":"postgres","language":"plpgsql","returnType":"text","argumentTypes":"text"}},{"signature":"app_private.resolve_shop_sync_recovery_scope(uuid,text)","sourceMD5":"0f47ec89de6f5ea847548e55721d7f54","metadata":{"proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","proname":"resolve_shop_sync_recovery_scope","prorows":1000,"pronargs":2,"proconfig":["search_path=public, app_private, pg_temp"],"proretset":true,"prosecdef":true,"prosqlbody":null,"prosupport":"-","proargmodes":["i","i","t","t","t","t","t","t","t","t"],"proargnames":["p_shop_id","p_device_identifier","mapped_owner_id","authorized_legacy_owner_id","scope_kind","history_scope_kind","scope_key","legacy_owner_key","account_key","device_key"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"v","proleakproof":false,"proallargtypes":["2950","25","2950","2950","25","25","25","25","25","25"],"proargdefaults":null,"pronargdefaults":0,"schema":"app_private","owner":"postgres","language":"plpgsql","returnType":"record","argumentTypes":"uuid, text"}}]$closure$::jsonb) LOOP
  SELECT jsonb_build_object('signature',expected->>'signature','sourceMD5',md5(p.prosrc),'metadata',
    (to_jsonb(p)-'prosrc'-'oid'-'pronamespace'-'proowner'-'prolang'-'prorettype'-'proargtypes') ||
    jsonb_build_object('schema',n.nspname,'owner',pg_get_userbyid(p.proowner),'language',l.lanname,
      'returnType',p.prorettype::regtype::text,'argumentTypes',oidvectortypes(p.proargtypes)))
    INTO actual FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE p.oid=to_regprocedure(expected->>'signature');
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'SHARED_READER_LOGICAL_CLOSURE_DRIFT'; END IF;
 END LOOP;
 IF to_regprocedure('app_private.guard_sync_scope_read_upgrade_v1(integer,integer[])') IS NOT NULL
 OR to_regprocedure('app_private.acquire_sync_event_scope_read_fence_v1(uuid,uuid)') IS NOT NULL
 OR to_regprocedure('app_private.lock_catalog_scope_pair_read_v1(uuid,uuid)') IS NOT NULL
 OR to_regprocedure('app_private.resolve_shop_sync_recovery_read_scope_v1(uuid,text)') IS NOT NULL
 THEN RAISE EXCEPTION 'SHARED_READER_HELPER_ALREADY_EXISTS'; END IF;
END; $logical_preimage$;
DO $capture_actual_metadata$
DECLARE actual jsonb;
BEGIN
 SELECT jsonb_object_agg(p.oid::text,CASE WHEN p.oid IN (
  'public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure,
  'app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)'::regprocedure,
  'app_private.lock_catalog_scope_pair_v1(uuid,uuid)'::regprocedure) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)
 INTO actual FROM pg_proc p WHERE p.oid IN (
  'app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)'::regprocedure,
  'app_private.lock_sync_event_visibility_transition_v1(uuid,uuid,uuid,uuid)'::regprocedure,
  'app_private.require_sync_event_scope_fence_v1()'::regprocedure,
  'app_private.resolve_shop_sync_recovery_scope(uuid,text)'::regprocedure,
  'app_private.sync_event_scope_fence_key_v1(uuid,uuid)'::regprocedure,
  'app_private.sync_recovery_preflight_counts_v1(uuid,text,uuid,uuid)'::regprocedure,
  'public.shop_sync_convergence_marker_v1(uuid,text,text,text)'::regprocedure,
  'public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure,
  'auth.uid()'::regprocedure,
  'app_private.lock_catalog_scope_pair_v1(uuid,uuid)'::regprocedure,
  'app_private.sync_checkpoint_sha256(text)'::regprocedure);
 PERFORM set_config('task146.shared_reader.original_metadata',actual::text,true);
END; $capture_actual_metadata$;
CREATE FUNCTION app_private.guard_sync_scope_read_upgrade_v1(p_namespace integer, p_ordered_keys integer[])
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog
AS $upgrade$
DECLARE v_key integer; v_upgrade boolean; v_database oid;
BEGIN
 IF p_namespace IS NULL OR p_ordered_keys IS NULL OR cardinality(p_ordered_keys) NOT BETWEEN 1 AND 2
 OR array_position(p_ordered_keys,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'sync scope upgrade guard requires bounded keys' USING ERRCODE='22023';
 END IF;
 SELECT oid INTO STRICT v_database FROM pg_database WHERE datname=current_database();
 -- Two-int advisory locks encode signed int arguments as unsigned32 OID tags.
 SELECT EXISTS(SELECT 1 FROM pg_locks held WHERE held.locktype='advisory'
  AND held.database=v_database AND held.pid=pg_backend_pid() AND held.granted
  AND held.objsubid=2 AND held.classid::bigint=(p_namespace::bigint & 4294967295)
  AND held.mode='ShareLock' AND EXISTS(SELECT 1 FROM unnest(p_ordered_keys) k
    WHERE held.objid::bigint=(k::bigint & 4294967295))
  AND NOT EXISTS(SELECT 1 FROM pg_locks exclusive_held WHERE exclusive_held.locktype='advisory'
    AND exclusive_held.database=held.database AND exclusive_held.pid=held.pid AND exclusive_held.granted
    AND exclusive_held.objsubid=held.objsubid AND exclusive_held.classid=held.classid
    AND exclusive_held.objid=held.objid AND exclusive_held.mode='ExclusiveLock')) INTO v_upgrade;
 IF v_upgrade THEN
  -- No blocking acquisition while holding a shared-only target. This also
  -- handles an already-held later key while another writer holds the first.
  FOREACH v_key IN ARRAY p_ordered_keys LOOP
   IF pg_try_advisory_xact_lock(p_namespace,v_key) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'sync scope read transaction must retry before writing' USING ERRCODE='40001';
   END IF;
  END LOOP;
 END IF;
END; $upgrade$;
REVOKE ALL ON FUNCTION app_private.guard_sync_scope_read_upgrade_v1(integer,integer[]) FROM PUBLIC,anon,authenticated,service_role;
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
DO $writer_upgrade_0$
DECLARE definition text; old_body text; before_metadata jsonb;
BEGIN
 SELECT prosrc,to_jsonb(p)-'prosrc',pg_get_functiondef(p.oid) INTO STRICT old_body,before_metadata,definition
 FROM pg_proc p WHERE oid='app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)'::regprocedure;
 IF md5(old_body)<>'0199f8030d3bd207ac27527ed9a52862' THEN RAISE EXCEPTION 'WRITER_UPGRADE_PREIMAGE_DRIFT'; END IF;
 EXECUTE replace(definition,old_body,$newbody$
declare
  v_scope_key text;
begin
  v_scope_key := app_private.sync_event_scope_fence_key_v1(
    p_owner_user_id,
    p_shop_id
  );

  if v_scope_key is null then
    raise exception 'sync event scope fence requires an owner identity'
      using errcode = '23502';
  end if;

  perform app_private.guard_sync_scope_read_upgrade_v1(
    hashtext('sync_event_scope_fence_v1'), array[hashtext(v_scope_key)]
  );
  perform pg_advisory_xact_lock(
    hashtext('sync_event_scope_fence_v1'),
    hashtext(v_scope_key)
  );
  perform set_config('app_private.sync_event_scope_fence', v_scope_key, true);
end;
$newbody$);
 IF (SELECT md5(prosrc)<>'8bc0089c0f2d0fbccd3286a4022d90ea' OR (to_jsonb(p)-'prosrc') IS DISTINCT FROM before_metadata
     FROM pg_proc p WHERE oid='app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)'::regprocedure) THEN RAISE EXCEPTION 'WRITER_UPGRADE_BODY_OR_METADATA_DRIFT'; END IF;
END; $writer_upgrade_0$;
DO $writer_upgrade_1$
DECLARE definition text; old_body text; before_metadata jsonb;
BEGIN
 SELECT prosrc,to_jsonb(p)-'prosrc',pg_get_functiondef(p.oid) INTO STRICT old_body,before_metadata,definition
 FROM pg_proc p WHERE oid='app_private.lock_catalog_scope_pair_v1(uuid,uuid)'::regprocedure;
 IF md5(old_body)<>'e7e8c0b08519a53345e9ca583e484481' THEN RAISE EXCEPTION 'WRITER_UPGRADE_PREIMAGE_DRIFT'; END IF;
 EXECUTE replace(definition,old_body,$newbody$
declare
  v_shop_key text := case when p_shop_id is null then null else lower(p_shop_id::text) end;
  v_owner_key text := case when p_owner_user_id is null then null else lower(p_owner_user_id::text) end;
begin
  if v_shop_key is null and v_owner_key is null then
    raise exception 'catalog scope lock requires an identity'
      using errcode = '22023';
  end if;

  -- Inspect the entire target set first. In upgrade mode acquire every key
  -- nonblocking in the original UUID-text order, never a later key early.
  perform app_private.guard_sync_scope_read_upgrade_v1(
    hashtext('catalog_union_scope'),
    case when v_shop_key is null or v_owner_key is null or v_shop_key = v_owner_key
      then array[hashtext(coalesce(v_shop_key, v_owner_key))]
      when v_shop_key < v_owner_key then array[hashtext(v_shop_key), hashtext(v_owner_key)]
      else array[hashtext(v_owner_key), hashtext(v_shop_key)] end
  );
  if v_shop_key is null or v_owner_key is null or v_shop_key = v_owner_key then
    perform pg_advisory_xact_lock(
      hashtext('catalog_union_scope'),
      hashtext(coalesce(v_shop_key, v_owner_key))
    );
  elsif v_shop_key < v_owner_key then
    perform pg_advisory_xact_lock(hashtext('catalog_union_scope'), hashtext(v_shop_key));
    perform pg_advisory_xact_lock(hashtext('catalog_union_scope'), hashtext(v_owner_key));
  else
    perform pg_advisory_xact_lock(hashtext('catalog_union_scope'), hashtext(v_owner_key));
    perform pg_advisory_xact_lock(hashtext('catalog_union_scope'), hashtext(v_shop_key));
  end if;
end;
$newbody$);
 IF (SELECT md5(prosrc)<>'394bef66b0f19c3e64ae82e48d7187a3' OR (to_jsonb(p)-'prosrc') IS DISTINCT FROM before_metadata
     FROM pg_proc p WHERE oid='app_private.lock_catalog_scope_pair_v1(uuid,uuid)'::regprocedure) THEN RAISE EXCEPTION 'WRITER_UPGRADE_BODY_OR_METADATA_DRIFT'; END IF;
END; $writer_upgrade_1$;
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
DO $actual_metadata_preserved$
DECLARE actual jsonb;
BEGIN
 SELECT jsonb_object_agg(p.oid::text,CASE WHEN p.oid IN (
  'public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure,
  'app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)'::regprocedure,
  'app_private.lock_catalog_scope_pair_v1(uuid,uuid)'::regprocedure) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)
 INTO actual FROM pg_proc p WHERE p.oid IN (
  'app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)'::regprocedure,
  'app_private.lock_sync_event_visibility_transition_v1(uuid,uuid,uuid,uuid)'::regprocedure,
  'app_private.require_sync_event_scope_fence_v1()'::regprocedure,
  'app_private.resolve_shop_sync_recovery_scope(uuid,text)'::regprocedure,
  'app_private.sync_event_scope_fence_key_v1(uuid,uuid)'::regprocedure,
  'app_private.sync_recovery_preflight_counts_v1(uuid,text,uuid,uuid)'::regprocedure,
  'public.shop_sync_convergence_marker_v1(uuid,text,text,text)'::regprocedure,
  'public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure,
  'auth.uid()'::regprocedure,
  'app_private.lock_catalog_scope_pair_v1(uuid,uuid)'::regprocedure,
  'app_private.sync_checkpoint_sha256(text)'::regprocedure);
 IF actual IS DISTINCT FROM current_setting('task146.shared_reader.original_metadata')::jsonb
 THEN RAISE EXCEPTION 'SHARED_READER_ACTUAL_METADATA_CHANGED'; END IF;
END; $actual_metadata_preserved$;
