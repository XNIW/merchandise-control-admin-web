-- TASK-094 bounded source fix: assemble the complete-plan object once.
-- Copy-profile REV6 measured P08 at 1490.084 ms in a 7587.597 ms warm rollback call.
-- This removes the second large JSONB construction; performance improvement and
-- fresh 5000/59999 acceptance remain unproven. Canonical hash bytes and every
-- guard, raw proof, SmallV1, bound, deadline and privilege stay unchanged.
begin;

do $migration$
declare
  v_target regprocedure:=pg_catalog.to_regprocedure(
    'app_private.pos_import_recovery_phased_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'
  );
  v_before pg_catalog.pg_proc%rowtype;
  v_after pg_catalog.pg_proc%rowtype;
  v_definition text;
  v_before_builder text:=$before_builder$     v_normal:=v_header||jsonb_build_object('parts',v_children,'coverage',coalesce(v_items,'[]'::jsonb),'planCanonicalHash',v_hash,
       'itemCount',(select count(*) from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='child'));$before_builder$;
  v_after_builder text:=$after_builder$     if jsonb_typeof(v_header)='object' then
       -- Build the whole object once. Exclude replaced header keys so the four
       -- RHS fields win without sorting the large JSONB values in the aggregate.
       select jsonb_object_agg(fields.field_key,fields.field_value) into v_normal
       from (
         select header_entry.key field_key,header_entry.value field_value
           from jsonb_each(v_header) header_entry
           where header_entry.key not in('parts','coverage','planCanonicalHash','itemCount')
         union all
         select replacement.field_key,replacement.field_value from (values
           ('parts',v_children),
           ('coverage',coalesce(v_items,'[]'::jsonb)),
           ('planCanonicalHash',to_jsonb(v_hash)),
           ('itemCount',to_jsonb((select count(*) from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='child')))
         ) replacement(field_key,field_value)
       ) fields;
     else
     v_normal:=v_header||jsonb_build_object('parts',v_children,'coverage',coalesce(v_items,'[]'::jsonb),'planCanonicalHash',v_hash,
       'itemCount',(select count(*) from app_private.pos_import_recovery_normal_rows where shop_id=p_shop_id and shop_device_id=p_shop_device_id and upload_id=v_id and domain='child'));
     end if;$after_builder$;
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
    ]
    or pg_catalog.md5(pg_catalog.replace(v_before.prosrc,E'\r\n',E'\n'))
      is distinct from 'e638c34aaa588e2b64f63fa3dc3102b0'
    or encode(extensions.digest(convert_to(pg_catalog.replace(v_before.prosrc,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')
      is distinct from '821d34d4ca0234b42ae48b87715bad224c901ef9e0a35fbeb4204a63a45d1b1d' then
    raise exception 'pos_import_recovery_plan_single_builder_baseline_mismatch' using errcode='55000';
  end if;

  v_definition:=pg_catalog.pg_get_functiondef(v_target);
  if pg_catalog.strpos(v_definition,v_before_builder)=0 then
    v_before_builder:=pg_catalog.replace(v_before_builder,E'\n',E'\r\n');
    v_after_builder:=pg_catalog.replace(v_after_builder,E'\n',E'\r\n');
  end if;
  if (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_before_builder,'')))
    <>pg_catalog.length(v_before_builder) then
    raise exception 'pos_import_recovery_plan_single_builder_baseline_mismatch' using errcode='55000';
  end if;
  execute pg_catalog.replace(v_definition,v_before_builder,v_after_builder);

  select * into v_after from pg_catalog.pg_proc where oid=v_target;
  if not found
    or pg_catalog.md5(pg_catalog.replace(v_after.prosrc,E'\r\n',E'\n'))
      is distinct from '0eec947d66bbac2930385977b448a836'
    or encode(extensions.digest(convert_to(pg_catalog.replace(v_after.prosrc,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')
      is distinct from 'b3062b925c3968caf9bba6129a288e49006cdeb9140165c24a3245628192a3d2'
    or (pg_catalog.to_jsonb(v_after)-'prosrc')
      is distinct from (pg_catalog.to_jsonb(v_before)-'prosrc') then
    raise exception 'pos_import_recovery_plan_single_builder_postcondition_mismatch' using errcode='55000';
  end if;
end;
$migration$;

commit;

