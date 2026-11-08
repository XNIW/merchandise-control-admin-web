-- One catalog-only SELECT. Invoked solely with pinned CLI --local in the owned project.
WITH target(kind,oid) AS (VALUES
 ('helper','app_private.sync_recovery_preflight_counts_v1(uuid,text,uuid,uuid)'::regprocedure),
 ('public','public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure),
 ('app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)',to_regprocedure('app_private.acquire_sync_event_scope_fence_v1(uuid,uuid)')),
 ('app_private.lock_catalog_scope_pair_v1(uuid,uuid)',to_regprocedure('app_private.lock_catalog_scope_pair_v1(uuid,uuid)')),
 ('app_private.lock_sync_event_visibility_transition_v1(uuid,uuid,uuid,uuid)',to_regprocedure('app_private.lock_sync_event_visibility_transition_v1(uuid,uuid,uuid,uuid)')),
 ('app_private.require_sync_event_scope_fence_v1()',to_regprocedure('app_private.require_sync_event_scope_fence_v1()')),
 ('app_private.resolve_shop_sync_recovery_scope(uuid,text)',to_regprocedure('app_private.resolve_shop_sync_recovery_scope(uuid,text)')),
 ('app_private.sync_checkpoint_sha256(text)',to_regprocedure('app_private.sync_checkpoint_sha256(text)')),
 ('app_private.sync_event_scope_fence_key_v1(uuid,uuid)',to_regprocedure('app_private.sync_event_scope_fence_key_v1(uuid,uuid)')),
 ('app_private.sync_recovery_preflight_counts_v1(uuid,text,uuid,uuid)',to_regprocedure('app_private.sync_recovery_preflight_counts_v1(uuid,text,uuid,uuid)')),
 ('auth.uid()',to_regprocedure('auth.uid()')),
 ('public.shop_sync_convergence_marker_v1(uuid,text,text,text)',to_regprocedure('public.shop_sync_convergence_marker_v1(uuid,text,text,text)')),
 ('public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)',to_regprocedure('public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)')),
 ('app_private.acquire_sync_event_scope_read_fence_v1(uuid,uuid)',to_regprocedure('app_private.acquire_sync_event_scope_read_fence_v1(uuid,uuid)')),
 ('app_private.lock_catalog_scope_pair_read_v1(uuid,uuid)',to_regprocedure('app_private.lock_catalog_scope_pair_read_v1(uuid,uuid)')),
 ('app_private.resolve_shop_sync_recovery_read_scope_v1(uuid,text)',to_regprocedure('app_private.resolve_shop_sync_recovery_read_scope_v1(uuid,text)')),
 ('app_private.guard_sync_scope_read_upgrade_v1(integer,integer[])',to_regprocedure('app_private.guard_sync_scope_read_upgrade_v1(integer,integer[])'))
), detail AS (
 SELECT target.kind,p.oid,p.prosrc,pg_get_functiondef(p.oid) AS definition,
 (to_jsonb(p)-'prosrc')::text AS metadata_text,
 jsonb_build_object('schema',n.nspname,'owner',pg_get_userbyid(p.proowner),
   'language',l.lanname,'returnType',p.prorettype::regtype::text,
   'argumentTypes',oidvectortypes(p.proargtypes)) AS names
 FROM target JOIN pg_proc p ON p.oid=target.oid JOIN pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_language l ON l.oid=p.prolang
)
SELECT jsonb_build_object(
 'database',current_database(),'effectiveRole',current_user,'serverMajor',split_part(current_setting('server_version'),'.',1),
 'functions',(SELECT jsonb_object_agg(kind,jsonb_build_object('oid',oid,'body',prosrc,
   'definition',definition,'metadataText',metadata_text,'metadataMD5',md5(metadata_text),'names',names)) FROM detail WHERE kind IN ('helper','public')),
 'ssl',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),
 'sharedFunctions',(SELECT jsonb_object_agg(kind,jsonb_build_object('oid',oid,'body',prosrc,'definition',definition,'metadataText',metadata_text,'metadataMD5',md5(metadata_text),'names',names)) FROM detail WHERE kind NOT IN ('helper','public','app_private.acquire_sync_event_scope_read_fence_v1(uuid,uuid)','app_private.lock_catalog_scope_pair_read_v1(uuid,uuid)','app_private.resolve_shop_sync_recovery_read_scope_v1(uuid,text)','app_private.guard_sync_scope_read_upgrade_v1(integer,integer[])')),
 'sharedHelpers',COALESCE((SELECT jsonb_object_agg(kind,jsonb_build_object('oid',oid,'body',prosrc,'definition',definition,'metadataText',metadata_text,'metadataMD5',md5(metadata_text),'names',names)) FROM detail WHERE kind IN ('app_private.acquire_sync_event_scope_read_fence_v1(uuid,uuid)','app_private.lock_catalog_scope_pair_read_v1(uuid,uuid)','app_private.resolve_shop_sync_recovery_read_scope_v1(uuid,text)','app_private.guard_sync_scope_read_upgrade_v1(integer,integer[])')),'{}'::jsonb),
 'versions',(SELECT coalesce(jsonb_agg(version ORDER BY version),'[]'::jsonb) FROM supabase_migrations.schema_migrations),
 'localStatement',(SELECT CASE WHEN cardinality(statements)=1 THEN statements[1] END
   FROM supabase_migrations.schema_migrations WHERE version='20261027143737'),
 'productLocalStatement',(SELECT CASE WHEN cardinality(statements)=1 THEN statements[1] END
   FROM supabase_migrations.schema_migrations WHERE version='20261028132836'),
 'sharedLocalStatements',(SELECT to_jsonb(statements) FROM supabase_migrations.schema_migrations WHERE version='20261104224833'),
 'mobileSalesLocalStatements',(SELECT to_jsonb(statements) FROM supabase_migrations.schema_migrations
   WHERE version='20261105220929'),
 'mobileSalesFunction',(
   SELECT jsonb_build_object(
     'owner',pg_get_userbyid(p.proowner),'bodyMD5',md5(p.prosrc),'language',l.lanname,
     'returnType',p.prorettype::regtype::text,'argumentCount',p.pronargs,
     'defaultArgumentCount',p.pronargdefaults,'securityDefiner',p.prosecdef,
     'volatility',p.provolatile,'strict',p.proisstrict,'parallel',p.proparallel,'config',p.proconfig,
     'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
     'anonymousExecute',has_function_privilege('anon',p.oid,'EXECUTE'),
     'serviceRoleExecute',has_function_privilege('service_role',p.oid,'EXECUTE'),
     'publicExecute',EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
       WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'))
   FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
   WHERE p.oid=to_regprocedure('public.mobile_sales_read_v1(uuid,text,text,date,date,integer,timestamptz,uuid,text,text,text,uuid,uuid,text,uuid)')
 ),
 'mobileSalesStableDelegates',(
   SELECT count(*) FROM pg_proc p WHERE p.provolatile='s' AND p.oid IN (
     to_regprocedure('app_private.wechat_can_read_shop(uuid)'),
     to_regprocedure('app_private.wechat_can_read_sales_metadata(uuid)'),
     to_regprocedure('public.wechat_daily_sales_summary_v1(uuid,date)'),
     to_regprocedure('public.wechat_sales_period_summary_v1(uuid,date,date)'),
     to_regprocedure('public.wechat_sales_page_v2(uuid,date,date,integer,timestamptz,uuid,text,text,text,uuid,uuid,text)'),
     to_regprocedure('public.wechat_sale_detail_v2(uuid,uuid)'),
     to_regprocedure('public.wechat_sales_filter_options_v1(uuid,date,date)')
   )
 ),
 'nativeEmptyScopeFunction',(
   SELECT jsonb_build_object('body',p.prosrc,'metadataText',(to_jsonb(p)-'prosrc')::text)
   FROM pg_proc p WHERE p.oid=to_regprocedure('app_private.resolve_pos_catalog_scope_v2(uuid)')
 ),
 'nativeEmptyScopeLocalStatements',(
   SELECT statements FROM supabase_migrations.schema_migrations WHERE version='20261108051044'
 ),
 'authenticatedConfig',(SELECT rolconfig FROM pg_roles WHERE rolname='authenticated')
) AS snapshot;
