-- Opaque Supabase server secrets are mapped by the gateway with SET ROLE
-- service_role, but do not depend on the legacy request.jwt.claim.role GUC.
-- Keep the existing claim check for legacy keys and also accept that trusted,
-- database-enforced role setting. EXECUTE remains restricted to service_role.

begin;

do $migration$
declare
  v_signatures constant text[] := array[
    'public.task_150_win7pos_image_qa_begin_v1(text,text,text,text,text,text,text,uuid,uuid,text)',
    'public.task_150_win7pos_image_qa_provision_admit_v1(text,text,text,text,text)',
    'public.task_150_win7pos_image_qa_provision_v1(text,text,text,text,text,text)',
    'public.task_150_win7pos_image_qa_prearm_v1(text,text,text,text,timestamptz,text,uuid,uuid,uuid,uuid,integer)',
    'public.task_150_win7pos_image_qa_rotation_prepare_v1(text,text,text,text,text,text,uuid,uuid,uuid,uuid,integer,timestamptz)',
    'public.task_150_win7pos_image_qa_rotation_ack_v1(text,text,text,text,text,text,uuid,uuid,uuid,uuid,integer)',
    'public.task_150_win7pos_image_qa_result_issue_v1(text,text,text,text,text,uuid,uuid,uuid,uuid,integer)',
    'public.task_150_win7pos_image_qa_cleanup_acquire_v1(text,text,text,text,text)',
    'public.task_150_win7pos_image_qa_cleanup_commit_v1(text,text,text,text,text,bigint)',
    'public.task_150_win7pos_image_qa_result_v1(text,text,text)'
  ];
  v_legacy_guard constant text :=
    'coalesce(current_setting(''request.jwt.claim.role'', true), '''') <> ''service_role''';
  v_compatible_guard constant text :=
    '(coalesce(current_setting(''request.jwt.claim.role'', true), '''') <> ''service_role''' ||
    E'\n    and coalesce(nullif(current_setting(''role'', true), ''none''), '''') <> ''service_role'')';
  v_signature text;
  v_function_oid oid;
  v_definition text;
  v_updated_definition text;
  v_guard_count integer;
begin
  foreach v_signature in array v_signatures loop
    v_function_oid := pg_catalog.to_regprocedure(v_signature)::oid;
    if v_function_oid is null then
      raise exception 'TASK-150 compatibility target is missing: %', v_signature;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_proc function_row
      where function_row.oid = v_function_oid
        and function_row.prosecdef
        and 'search_path=""' = any(coalesce(function_row.proconfig, array[]::text[]))
    ) then
      raise exception 'TASK-150 compatibility target lost SECURITY DEFINER/search_path: %',
        v_signature;
    end if;

    if not pg_catalog.has_function_privilege('service_role', v_function_oid, 'execute')
      or pg_catalog.has_function_privilege('anon', v_function_oid, 'execute')
      or pg_catalog.has_function_privilege('authenticated', v_function_oid, 'execute') then
      raise exception 'TASK-150 compatibility target has unexpected EXECUTE grants: %',
        v_signature;
    end if;

    v_definition := pg_catalog.pg_get_functiondef(v_function_oid);
    v_guard_count := (
      length(v_definition) - length(replace(v_definition, v_legacy_guard, ''))
    ) / length(v_legacy_guard);

    if v_guard_count <> 1 then
      raise exception 'TASK-150 compatibility target has unexpected role guard count: %',
        v_signature;
    end if;

    v_updated_definition := replace(
      v_definition,
      v_legacy_guard,
      v_compatible_guard
    );
    execute v_updated_definition;
  end loop;
end
$migration$;

commit;
