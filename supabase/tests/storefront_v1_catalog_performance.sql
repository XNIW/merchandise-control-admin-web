begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select ok(
  (
    select not procedure.prosecdef
      and procedure.provolatile = 's'
      and coalesce(
        not ('search_path=' = any(procedure.proconfig)),
        true
      )
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'app_private'
      and procedure.proname = 'storefront_public_catalog_rows_scoped_v1'
      and pg_catalog.pg_get_function_identity_arguments(procedure.oid)
        = 'p_shop_id uuid, p_at timestamp with time zone, p_publication_ids uuid[]'
  ),
  'TASK-019 keeps the catalog resolver stable, invoker-safe and planner-visible'
);

select ok(
  not has_function_privilege(
    'anon',
    'app_private.storefront_public_catalog_rows_v1(uuid,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.storefront_public_catalog_rows_v1(uuid,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'app_private.storefront_public_catalog_rows_v1(uuid,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'app_private.storefront_public_catalog_rows_scoped_v1(uuid,timestamptz,uuid[])',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.storefront_public_catalog_rows_scoped_v1(uuid,timestamptz,uuid[])',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'app_private.storefront_public_catalog_rows_scoped_v1(uuid,timestamptz,uuid[])',
    'EXECUTE'
  ),
  'mobile and service roles cannot bypass the public Storefront RPC boundary'
);

select ok(
  (
    select
      pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid)),
        'left join lateral'
      ) = 0
      and pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid)),
        'current_promotions as'
      ) > 0
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'app_private'
      and procedure.proname = 'storefront_public_catalog_rows_scoped_v1'
      and pg_catalog.pg_get_function_identity_arguments(procedure.oid)
        = 'p_shop_id uuid, p_at timestamp with time zone, p_publication_ids uuid[]'
  ),
  'active promotions are resolved set-wise instead of by a per-row lateral probe'
);

select * from finish();

rollback;
