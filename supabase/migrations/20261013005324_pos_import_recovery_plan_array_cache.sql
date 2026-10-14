-- TASK-094: cache the two validated immutable plan arrays in Small.
-- MAX205e FIRST complete-plan exceeded the unchanged 10000-ms deadline.
-- Owned COPY pair5f03 returned full identical PUBLIC/HTTP JSON with two
-- rollbacks: original7798.1464ms, clocked candidate7211.4464ms. One sequential
-- diagnostic pair does not establish causal gain or final HTTP/MAX qualification.
-- Fresh5000/59999, regression and publication are separate qualification gates.
begin;

do $migration$
declare
  v_target regprocedure:=pg_catalog.to_regprocedure(
    'app_private.pos_catalog_import_recovery_small_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'
  );
  v_before pg_catalog.pg_proc%rowtype;
  v_after pg_catalog.pg_proc%rowtype;
  v_definition text;
  v_proposed text;
  v_sha text;
  v_is_crlf boolean;
  v_start integer;
  v_end integer;
  v_tail text;
  v_others_before_count bigint;
  v_others_after_count bigint;
  v_others_before_sha text;
  v_others_after_sha text;
  v_declaration text:=$declaration$ v_manifest jsonb;v_expected jsonb;v_result jsonb;v_receipt jsonb;v_child jsonb;v_entry jsonb;
$declaration$;
  v_new_declarations text:=$new_declarations$ v_plan_parts jsonb;v_plan_coverage jsonb;
$new_declarations$;
  v_plan_guard text:=$plan_guard$     or jsonb_array_length(v_expected->'parts')>1024 then return jsonb_build_object('ok',false,'code','validation_failed');end if;
$plan_guard$;
  v_new_assignments text:=$new_assignments$   v_plan_parts:=v_expected->'parts';v_plan_coverage:=v_expected->'coverage';
$new_assignments$;
  v_next_branch text:=$next_branch$
 if p_action='apply' or (p_action='receipt-page' and p_payload?'planId') then$next_branch$;
begin
  select * into v_before from pg_catalog.pg_proc where oid=v_target;
  if not found or current_user<>'postgres'
    or pg_catalog.pg_get_userbyid(v_before.proowner)<>'postgres'
    or v_before.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
    or v_before.prorettype<>'jsonb'::regtype or v_before.proretset
    or v_before.prokind<>'f' or not v_before.prosecdef
    or v_before.provolatile<>'v'::"char" or v_before.proparallel<>'u'::"char"
    or v_before.proisstrict or v_before.proleakproof
    or v_before.proconfig is distinct from array['search_path=public, app_private, extensions, pg_temp']
    or v_before.proargnames is distinct from array[
      'p_shop_id','p_shop_device_id','p_staff_id','p_pos_session_id',
      'p_owner_user_id','p_action','p_payload'
    ] then
    raise exception 'pos_import_recovery_plan_array_cache_baseline_mismatch' using errcode='55000';
  end if;

  -- Accept exact raw LF OR exact raw CRLF; mixed/drifted bytes are not normalized.
  v_sha:=encode(extensions.digest(convert_to(v_before.prosrc,'UTF8'),'sha256'),'hex');
  if v_sha='f6d28e812a36ffba4b7c279f5bf3c48cf66ae85da637b2ee7676a435c3e56374'
    and pg_catalog.md5(v_before.prosrc)='9e4d083bd0d08cefb9102a35a6f7f101'
    and pg_catalog.octet_length(convert_to(v_before.prosrc,'UTF8'))=48131 then
    v_is_crlf:=false;
  elsif v_sha='a01b0a72a49f31fa5de9674002f8b652dd2f55164a414bd37b3855327989bf5e'
    and pg_catalog.md5(v_before.prosrc)='18c480db0d9b45c7c87bf57d6539f5cd'
    and pg_catalog.octet_length(convert_to(v_before.prosrc,'UTF8'))=48599 then
    v_is_crlf:=true;
  else
    raise exception 'pos_import_recovery_plan_array_cache_baseline_mismatch' using errcode='55000';
  end if;
  -- Canonicalize only the five pattern constants: a Windows checkout may make
  -- this migration itself CRLF. The verified raw function body is never normalized.
  v_declaration:=pg_catalog.replace(v_declaration,E'\r\n',E'\n');
  v_new_declarations:=pg_catalog.replace(v_new_declarations,E'\r\n',E'\n');
  v_plan_guard:=pg_catalog.replace(v_plan_guard,E'\r\n',E'\n');
  v_new_assignments:=pg_catalog.replace(v_new_assignments,E'\r\n',E'\n');
  v_next_branch:=pg_catalog.replace(v_next_branch,E'\r\n',E'\n');
  if v_is_crlf then
    v_declaration:=pg_catalog.replace(v_declaration,E'\n',E'\r\n');
    v_new_declarations:=pg_catalog.replace(v_new_declarations,E'\n',E'\r\n');
    v_plan_guard:=pg_catalog.replace(v_plan_guard,E'\n',E'\r\n');
    v_new_assignments:=pg_catalog.replace(v_new_assignments,E'\n',E'\r\n');
    v_next_branch:=pg_catalog.replace(v_next_branch,E'\n',E'\r\n');
  end if;
  if (pg_catalog.length(v_before.prosrc)-pg_catalog.length(pg_catalog.replace(v_before.prosrc,v_declaration,'')))<>pg_catalog.length(v_declaration)
    or (pg_catalog.length(v_before.prosrc)-pg_catalog.length(pg_catalog.replace(v_before.prosrc,v_plan_guard,'')))<>pg_catalog.length(v_plan_guard)
    or (pg_catalog.length(v_before.prosrc)-pg_catalog.length(pg_catalog.replace(v_before.prosrc,v_next_branch,'')))<>pg_catalog.length(v_next_branch)
    or pg_catalog.strpos(v_before.prosrc,'v_plan_parts')<>0
    or pg_catalog.strpos(v_before.prosrc,'v_plan_coverage')<>0 then
    raise exception 'pos_import_recovery_plan_array_cache_baseline_mismatch' using errcode='55000';
  end if;
  v_start:=pg_catalog.strpos(v_before.prosrc,v_plan_guard)+pg_catalog.length(v_plan_guard);
  v_end:=pg_catalog.strpos(v_before.prosrc,v_next_branch);
  if v_end<=v_start then
    raise exception 'pos_import_recovery_plan_array_cache_baseline_mismatch' using errcode='55000';
  end if;
  v_tail:=pg_catalog.substr(v_before.prosrc,v_start,v_end-v_start);
  if (pg_catalog.length(v_tail)-pg_catalog.length(pg_catalog.replace(v_tail,'v_expected->''parts''','')))<>4*pg_catalog.length('v_expected->''parts''')
    or (pg_catalog.length(v_tail)-pg_catalog.length(pg_catalog.replace(v_tail,'v_expected->''coverage''','')))<>12*pg_catalog.length('v_expected->''coverage''') then
    raise exception 'pos_import_recovery_plan_array_cache_baseline_mismatch' using errcode='55000';
  end if;
  -- Only the bounded postguard plan tail is rewritten; the initial three
  -- selectors, casts, FOUND and early validation return retain their bytes.
  v_tail:=pg_catalog.replace(pg_catalog.replace(v_tail,'v_expected->''parts''','v_plan_parts'),'v_expected->''coverage''','v_plan_coverage');
  v_proposed:=pg_catalog.substr(v_before.prosrc,1,v_start-1)||v_new_assignments||v_tail||pg_catalog.substr(v_before.prosrc,v_end);
  v_proposed:=pg_catalog.replace(v_proposed,v_declaration,v_declaration||v_new_declarations);
  if (not v_is_crlf and (pg_catalog.md5(v_proposed)<>'fe01bc8ac31a746951b7b2fff8dfb3b1'
      or encode(extensions.digest(convert_to(v_proposed,'UTF8'),'sha256'),'hex')<>'e3d5f3c0878830e2b1afc732b6e65f3cb5c95de5b7760368b1531d10313dddce'
      or pg_catalog.octet_length(convert_to(v_proposed,'UTF8'))<>48140))
    or (v_is_crlf and (pg_catalog.md5(v_proposed)<>'a95065fae5f84912cbeff6e2b5fafa29'
      or encode(extensions.digest(convert_to(v_proposed,'UTF8'),'sha256'),'hex')<>'cb5e922315c8cb2e18d000254264e029090cc2b9df639b2c031013b7d595c5bc'
      or pg_catalog.octet_length(convert_to(v_proposed,'UTF8'))<>48610)) then
    raise exception 'pos_import_recovery_plan_array_cache_postcondition_mismatch' using errcode='55000';
  end if;

  -- Relative preservation of every other pg_proc row, not a claim that their
  -- initial metadata was fully fixed by the enumerated target baseline guard.
  select count(*),encode(extensions.digest(convert_to(coalesce(
    string_agg(pg_catalog.to_jsonb(p)::text,E'\n' order by p.oid),''),'UTF8'),'sha256'),'hex')
    into v_others_before_count,v_others_before_sha from pg_catalog.pg_proc p where p.oid<>v_target;
  v_definition:=pg_catalog.pg_get_functiondef(v_target);
  if (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_before.prosrc,'')))<>pg_catalog.length(v_before.prosrc) then
    raise exception 'pos_import_recovery_plan_array_cache_baseline_mismatch' using errcode='55000';
  end if;
  execute pg_catalog.replace(v_definition,v_before.prosrc,v_proposed);
  select * into v_after from pg_catalog.pg_proc where oid=v_target;
  if not found or v_after.prosrc is distinct from v_proposed
    or (pg_catalog.to_jsonb(v_after)-'prosrc') is distinct from (pg_catalog.to_jsonb(v_before)-'prosrc') then
    raise exception 'pos_import_recovery_plan_array_cache_postcondition_mismatch' using errcode='55000';
  end if;
  select count(*),encode(extensions.digest(convert_to(coalesce(
    string_agg(pg_catalog.to_jsonb(p)::text,E'\n' order by p.oid),''),'UTF8'),'sha256'),'hex')
    into v_others_after_count,v_others_after_sha from pg_catalog.pg_proc p where p.oid<>v_target;
  if v_others_after_count is distinct from v_others_before_count
    or v_others_after_sha is distinct from v_others_before_sha then
    raise exception 'pos_import_recovery_plan_array_cache_other_function_drift' using errcode='55000';
  end if;
end;
$migration$;

commit;
