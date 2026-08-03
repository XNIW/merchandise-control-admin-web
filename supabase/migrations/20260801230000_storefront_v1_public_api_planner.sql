-- TASK-010: allow predicate pushdown through the fully-qualified read-only
-- projection resolver. Public RPCs remain SECURITY DEFINER, timeout-bounded,
-- and the private helper remains non-executable by mobile roles.

alter function app_private.storefront_public_catalog_rows_v1(uuid, timestamptz)
  security invoker;

alter function app_private.storefront_public_catalog_rows_v1(uuid, timestamptz)
  reset search_path;

revoke all on function app_private.storefront_public_catalog_rows_v1(uuid, timestamptz)
  from public, anon, authenticated, service_role;

comment on function app_private.storefront_public_catalog_rows_v1(uuid, timestamptz)
  is 'Private fully-qualified read resolver; SECURITY INVOKER permits RPC predicate pushdown while direct mobile execution remains revoked.';
