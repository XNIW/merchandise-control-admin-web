-- TASK-139: keep the runtime-only pg_temp capture table invisible to static
-- schema lint while preserving the fixed relation name and bound domain value.

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
begin
  if to_regclass('pg_temp.admin_bulk_changed_ids_v1') is null then
    raise exception 'Admin bulk changed-ID capture is not initialized'
      using errcode = '55000';
  end if;

  execute $query$
    select coalesce(
      array_agg(entity_id order by entity_id),
      array[]::text[]
    )
    from pg_temp.admin_bulk_changed_ids_v1
    where domain = $1
  $query$
  into v_ids
  using p_domain;

  return v_ids;
end;
$$;

revoke all on function app_private.read_admin_bulk_changed_ids_v1(text)
  from public, anon, authenticated, service_role;

commit;
