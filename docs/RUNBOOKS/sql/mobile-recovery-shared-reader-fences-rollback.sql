-- TASK146 rollback: execute in one authorized transaction, statement_timeout8s.
-- Restores original604 checkpoint and original internal writer bodies; preserves actual metadata/ACL.
SET LOCAL statement_timeout='8s';
SET LOCAL search_path=pg_catalog;
DO $rollback_preflight$
DECLARE expected jsonb; actual jsonb; allowed_acl jsonb;
BEGIN
 IF current_user IS DISTINCT FROM 'postgres' OR current_database() IS DISTINCT FROM 'postgres'
 OR current_setting('statement_timeout') IS DISTINCT FROM '8s'
 OR (SELECT rolconfig FROM pg_roles WHERE rolname='authenticated') IS DISTINCT FROM ARRAY['statement_timeout=8s']::text[]
 THEN RAISE EXCEPTION 'ROLLBACK_ROLE_OR_BUDGET_MISMATCH'; END IF;
 FOR expected IN SELECT value FROM jsonb_array_elements($expected$[{"signature":"app_private.acquire_sync_event_scope_read_fence_v1(uuid,uuid)","sourceMD5":"21a2f0eeef545f6aebb05f6c2757edc2","metadata":{"proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","proname":"acquire_sync_event_scope_read_fence_v1","prorows":0,"pronargs":2,"proconfig":["search_path=public, app_private, pg_temp"],"proretset":false,"prosecdef":true,"prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":["p_owner_user_id","p_shop_id"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"v","proleakproof":false,"proallargtypes":null,"proargdefaults":null,"pronargdefaults":0,"schema":"app_private","owner":"postgres","language":"plpgsql","returnType":"void","argumentTypes":"uuid, uuid"}},{"signature":"app_private.guard_sync_scope_read_upgrade_v1(integer,integer[])","sourceMD5":"fe6045658c520510c231bc697b3c5cd0","metadata":{"proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","proname":"guard_sync_scope_read_upgrade_v1","prorows":0,"pronargs":2,"proconfig":["search_path=pg_catalog"],"proretset":false,"prosecdef":true,"prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":["p_namespace","p_ordered_keys"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"v","proleakproof":false,"proallargtypes":null,"proargdefaults":null,"pronargdefaults":0,"schema":"app_private","owner":"postgres","language":"plpgsql","returnType":"void","argumentTypes":"integer, integer[]"}},{"signature":"app_private.lock_catalog_scope_pair_read_v1(uuid,uuid)","sourceMD5":"84cce948d3718e54ab946c81b6a400aa","metadata":{"proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","proname":"lock_catalog_scope_pair_read_v1","prorows":0,"pronargs":2,"proconfig":["search_path=pg_catalog"],"proretset":false,"prosecdef":true,"prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":["p_shop_id","p_owner_user_id"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"v","proleakproof":false,"proallargtypes":null,"proargdefaults":null,"pronargdefaults":0,"schema":"app_private","owner":"postgres","language":"plpgsql","returnType":"void","argumentTypes":"uuid, uuid"}},{"signature":"app_private.resolve_shop_sync_recovery_read_scope_v1(uuid,text)","sourceMD5":"334ed6616a382e7c9362a3e4efad70fc","metadata":{"proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","proname":"resolve_shop_sync_recovery_read_scope_v1","prorows":1000,"pronargs":2,"proconfig":["search_path=public, app_private, pg_temp"],"proretset":true,"prosecdef":true,"prosqlbody":null,"prosupport":"-","proargmodes":["i","i","t","t","t","t","t","t","t","t"],"proargnames":["p_shop_id","p_device_identifier","mapped_owner_id","authorized_legacy_owner_id","scope_kind","history_scope_kind","scope_key","legacy_owner_key","account_key","device_key"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"v","proleakproof":false,"proallargtypes":["2950","25","2950","2950","25","25","25","25","25","25"],"proargdefaults":null,"pronargdefaults":0,"schema":"app_private","owner":"postgres","language":"plpgsql","returnType":"record","argumentTypes":"uuid, text"}},{"signature":"public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)","sourceMD5":"7a1e3ec3050743656759432ad448a37b","metadata":{"proacl":["authenticated=X/postgres","postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","proname":"shop_sync_recovery_checkpoint_v1","prorows":0,"pronargs":4,"proconfig":["search_path=public, app_private, pg_temp"],"proretset":false,"prosecdef":true,"prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":["p_shop_id","p_device_identifier","p_verified_baseline_id","p_expected_baseline_scope_key"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"v","proleakproof":false,"proallargtypes":null,"proargdefaults":"({CONST :consttype 25 :consttypmod -1 :constcollid 100 :constlen -1 :constbyval false :constisnull false :location -1 :constvalue 5 [ 20 0 0 0 48 ]} {CONST :consttype 25 :consttypmod -1 :constcollid 100 :constlen -1 :constbyval false :constisnull true :location -1 :constvalue <>})","pronargdefaults":2,"schema":"public","owner":"postgres","language":"plpgsql","returnType":"jsonb","argumentTypes":"uuid, text, text, text"}},{"signature":"app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)","sourceMD5":"8bc0089c0f2d0fbccd3286a4022d90ea","metadata":{"proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","proname":"acquire_sync_event_scope_fence_v1","prorows":0,"pronargs":2,"proconfig":["search_path=public, app_private, pg_temp"],"proretset":false,"prosecdef":true,"prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":["p_owner_user_id","p_shop_id"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"v","proleakproof":false,"proallargtypes":null,"proargdefaults":null,"pronargdefaults":0,"schema":"app_private","owner":"postgres","language":"plpgsql","returnType":"void","argumentTypes":"uuid, uuid"}},{"signature":"app_private.lock_catalog_scope_pair_v1(uuid,uuid)","sourceMD5":"394bef66b0f19c3e64ae82e48d7187a3","metadata":{"proacl":["postgres=X/postgres"],"probin":null,"procost":100,"prokind":"f","proname":"lock_catalog_scope_pair_v1","prorows":0,"pronargs":2,"proconfig":["search_path=pg_catalog"],"proretset":false,"prosecdef":true,"prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":["p_shop_id","p_owner_user_id"],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"v","proleakproof":false,"proallargtypes":null,"proargdefaults":null,"pronargdefaults":0,"schema":"app_private","owner":"postgres","language":"plpgsql","returnType":"void","argumentTypes":"uuid, uuid"}}]$expected$::jsonb) LOOP
  SELECT jsonb_build_object('signature',expected->>'signature','sourceMD5',md5(p.prosrc),'metadata',
    (to_jsonb(p)-'prosrc'-'oid'-'pronamespace'-'proowner'-'prolang'-'prorettype'-'proargtypes') ||
    jsonb_build_object('schema',n.nspname,'owner',pg_get_userbyid(p.proowner),'language',l.lanname,
      'returnType',p.prorettype::regtype::text,'argumentTypes',oidvectortypes(p.proargtypes),'proacl',(SELECT jsonb_agg(a::text ORDER BY a::text COLLATE "C") FROM unnest(p.proacl) a)))
  INTO actual FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
  WHERE p.oid=to_regprocedure(expected->>'signature');
  IF expected->>'signature' LIKE 'public.%' THEN
   allowed_acl:=expected->'metadata'->'proacl';
   IF actual->'metadata'->'proacl' IS DISTINCT FROM allowed_acl
   AND actual->'metadata'->'proacl' IS DISTINCT FROM '["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb
   THEN RAISE EXCEPTION 'ROLLBACK_PUBLIC_ACL_PREIMAGE_MISMATCH'; END IF;
   expected:=jsonb_set(expected,'{metadata,proacl}',actual->'metadata'->'proacl');
  END IF;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'ROLLBACK_LOGICAL_FUNCTION_PREIMAGE_DRIFT'; END IF;
 END LOOP;
END; $rollback_preflight$;
DO $restore_checkpoint$
DECLARE definition text; before_metadata jsonb;
BEGIN
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO STRICT definition,before_metadata FROM pg_proc p
 WHERE oid='public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure)<>'7a1e3ec3050743656759432ad448a37b' THEN RAISE EXCEPTION 'ROLLBACK_CP_PREIMAGE_DRIFT'; END IF;
 definition:=replace(replace(definition,'app_private.resolve_shop_sync_recovery_read_scope_v1(','app_private.resolve_shop_sync_recovery_scope('),'app_private.acquire_sync_event_scope_read_fence_v1(','app_private.acquire_sync_event_scope_fence_v1(');
 EXECUTE definition;
 IF (SELECT md5(prosrc)<>'60473835c0aa6a53ae16d1c303f3c7bf' OR (to_jsonb(p)-'prosrc') IS DISTINCT FROM before_metadata FROM pg_proc p WHERE oid='public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure) THEN RAISE EXCEPTION 'ROLLBACK_CP_BODY_OR_METADATA_DRIFT'; END IF;
END; $restore_checkpoint$;
DO $writer_restore_0$
DECLARE definition text; old_body text; before_metadata jsonb;
BEGIN
 SELECT prosrc,to_jsonb(p)-'prosrc',pg_get_functiondef(p.oid) INTO STRICT old_body,before_metadata,definition
 FROM pg_proc p WHERE oid='app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)'::regprocedure;
 IF md5(old_body)<>'8bc0089c0f2d0fbccd3286a4022d90ea' THEN RAISE EXCEPTION 'WRITER_UPGRADE_PREIMAGE_DRIFT'; END IF;
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

  perform pg_advisory_xact_lock(
    hashtext('sync_event_scope_fence_v1'),
    hashtext(v_scope_key)
  );
  perform set_config('app_private.sync_event_scope_fence', v_scope_key, true);
end;
$newbody$);
 IF (SELECT md5(prosrc)<>'0199f8030d3bd207ac27527ed9a52862' OR (to_jsonb(p)-'prosrc') IS DISTINCT FROM before_metadata
     FROM pg_proc p WHERE oid='app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)'::regprocedure) THEN RAISE EXCEPTION 'WRITER_UPGRADE_BODY_OR_METADATA_DRIFT'; END IF;
END; $writer_restore_0$;
DO $writer_restore_1$
DECLARE definition text; old_body text; before_metadata jsonb;
BEGIN
 SELECT prosrc,to_jsonb(p)-'prosrc',pg_get_functiondef(p.oid) INTO STRICT old_body,before_metadata,definition
 FROM pg_proc p WHERE oid='app_private.lock_catalog_scope_pair_v1(uuid,uuid)'::regprocedure;
 IF md5(old_body)<>'394bef66b0f19c3e64ae82e48d7187a3' THEN RAISE EXCEPTION 'WRITER_UPGRADE_PREIMAGE_DRIFT'; END IF;
 EXECUTE replace(definition,old_body,$newbody$
declare
  v_shop_key text := case when p_shop_id is null then null else lower(p_shop_id::text) end;
  v_owner_key text := case when p_owner_user_id is null then null else lower(p_owner_user_id::text) end;
begin
  if v_shop_key is null and v_owner_key is null then
    raise exception 'catalog scope lock requires an identity'
      using errcode = '22023';
  end if;

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
 IF (SELECT md5(prosrc)<>'e7e8c0b08519a53345e9ca583e484481' OR (to_jsonb(p)-'prosrc') IS DISTINCT FROM before_metadata
     FROM pg_proc p WHERE oid='app_private.lock_catalog_scope_pair_v1(uuid,uuid)'::regprocedure) THEN RAISE EXCEPTION 'WRITER_UPGRADE_BODY_OR_METADATA_DRIFT'; END IF;
END; $writer_restore_1$;
DROP FUNCTION app_private.resolve_shop_sync_recovery_read_scope_v1(uuid,text) RESTRICT;
DROP FUNCTION app_private.lock_catalog_scope_pair_read_v1(uuid,uuid) RESTRICT;
DROP FUNCTION app_private.acquire_sync_event_scope_read_fence_v1(uuid,uuid) RESTRICT;
DROP FUNCTION app_private.guard_sync_scope_read_upgrade_v1(integer,integer[]) RESTRICT;
DO $rollback_postflight$ BEGIN
 IF to_regprocedure('app_private.guard_sync_scope_read_upgrade_v1(integer,integer[])') IS NOT NULL
 OR to_regprocedure('app_private.acquire_sync_event_scope_read_fence_v1(uuid,uuid)') IS NOT NULL
 OR to_regprocedure('app_private.lock_catalog_scope_pair_read_v1(uuid,uuid)') IS NOT NULL
 OR to_regprocedure('app_private.resolve_shop_sync_recovery_read_scope_v1(uuid,text)') IS NOT NULL
 THEN RAISE EXCEPTION 'ROLLBACK_HELPER_ABSENCE_UNCONFIRMED'; END IF;
END; $rollback_postflight$;
