-- TASK-094: allow the final original-identity query to use its scoped table
-- indexes. The multiply referenced normalized CTE needs explicit NOT
-- MATERIALIZED; removing MATERIALIZED alone would keep the default fence.
-- Forward-only delta from Admin15ee1886: two planner hints, no new predicates,
-- privileges, data changes, deadline changes or normalization/hash changes.
begin;

do $migration$
declare
  v_target regprocedure := pg_catalog.to_regprocedure(
    'app_private.pos_import_recovery_phased_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'
  );
  v_before pg_catalog.pg_proc%rowtype;
  v_after pg_catalog.pg_proc%rowtype;
  v_definition text;
  v_changed text;
begin
  select * into v_before from pg_catalog.pg_proc where oid = v_target;
  if not found or current_user <> 'postgres'
    or pg_catalog.pg_get_userbyid(v_before.proowner) <> 'postgres'
    or v_before.prolang <> (select oid from pg_catalog.pg_language where lanname = 'plpgsql')
    or v_before.prorettype <> 'jsonb'::regtype or v_before.proretset
    or v_before.prokind <> 'f' or not v_before.prosecdef
    or v_before.provolatile <> 'v'::"char" or v_before.proparallel <> 'u'::"char"
    or v_before.proisstrict or v_before.proleakproof
    or v_before.proconfig is distinct from array['search_path=public, app_private, extensions, pg_temp']
    or v_before.proargnames is distinct from array[
      'p_shop_id','p_shop_device_id','p_staff_id','p_pos_session_id',
      'p_owner_user_id','p_action','p_payload'
    ]
    or pg_catalog.md5(pg_catalog.replace(v_before.prosrc, E'\r\n', E'\n'))
      is distinct from 'f0079a99c0d44fd791fd6e2298cdc4c4' then
    raise exception 'pos_import_recovery_identity_cte_baseline_mismatch' using errcode = '55000';
  end if;

  -- Exact body pin above and exact resulting body pin below restrict this
  -- replacement to the two CTE hints in the final original-identity IF.
  v_definition := pg_catalog.pg_get_functiondef(v_target);
  v_changed := pg_catalog.replace(
    pg_catalog.replace(v_definition,
      'with normalized as materialized (',
      'with normalized as not materialized ('),
    '), raw as materialized (',
    '), raw as not materialized ('
  );
  execute v_changed;

  select * into v_after from pg_catalog.pg_proc where oid = v_target;
  if not found
    or pg_catalog.md5(pg_catalog.replace(v_after.prosrc, E'\r\n', E'\n'))
      is distinct from 'e0189819fb64f62c7cd4e1b0019610bb'
    -- Compare the complete pg_proc row other than the body: includes OID,
    -- owner, full ACL/grantors/options, signature, config and function flags.
    or (pg_catalog.to_jsonb(v_after) - 'prosrc')
      is distinct from (pg_catalog.to_jsonb(v_before) - 'prosrc') then
    raise exception 'pos_import_recovery_identity_cte_postcondition_mismatch' using errcode = '55000';
  end if;
end;
$migration$;

commit;
