-- TASK-139: resolve the session-local capture table as a runtime regclass so
-- schema lint does not parse a fixed pg_temp relation outside its session.

begin;

create or replace function app_private.read_admin_bulk_changed_ids_v1(
  p_domain text
)
returns text[]
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_ids text[];
  v_query text;
  v_relation regclass;
begin
  v_relation := to_regclass('pg_temp.admin_bulk_changed_ids_v1');
  if v_relation is null then
    raise exception 'Admin bulk changed-ID capture is not initialized'
      using errcode = '55000';
  end if;

  v_query := format(
    'select coalesce(array_agg(entity_id order by entity_id), array[]::text[]) '
    || 'from %s where domain = $1',
    v_relation
  );
  execute v_query into v_ids using p_domain;

  return v_ids;
end;
$$;

revoke all on function app_private.read_admin_bulk_changed_ids_v1(text)
  from public, anon, authenticated, service_role;

commit;
