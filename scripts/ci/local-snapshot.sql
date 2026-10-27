-- One catalog-only SELECT. Invoked solely with pinned CLI --local in the owned project.
WITH target(kind,oid) AS (VALUES
 ('helper','app_private.sync_recovery_preflight_counts_v1(uuid,text,uuid,uuid)'::regprocedure),
 ('public','public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure)
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
   'definition',definition,'metadataText',metadata_text,'metadataMD5',md5(metadata_text),'names',names)) FROM detail),
 'versions',(SELECT coalesce(jsonb_agg(version ORDER BY version),'[]'::jsonb) FROM supabase_migrations.schema_migrations),
 'localStatement',(SELECT CASE WHEN cardinality(statements)=1 THEN statements[1] END
   FROM supabase_migrations.schema_migrations WHERE version='20261027143737'),
 'authenticatedConfig',(SELECT rolconfig FROM pg_roles WHERE rolname='authenticated')
) AS snapshot;
