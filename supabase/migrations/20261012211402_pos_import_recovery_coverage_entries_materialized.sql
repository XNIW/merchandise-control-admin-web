-- TASK-094 bounded source fix: materialize coverage text entries once.
-- Actual A2 coverage exceeded the unchanged client deadline; diagnostic original
-- child selection reproduced 14.343/14.468 seconds. Candidate efficacy and fresh
-- 5000/59999 qualification remain NOT_RUN. Keep the original lateral EXISTS,
-- integer cast placement, scoped selection, order and header projection unchanged.
begin;

do $migration$
declare
  v_target regprocedure:=pg_catalog.to_regprocedure(
    'app_private.pos_import_recovery_phased_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'
  );
  v_before pg_catalog.pg_proc%rowtype;
  v_after pg_catalog.pg_proc%rowtype;
  v_definition text;
  v_before_selection text:=$before_selection$       select coalesce(jsonb_agg(((child.child-'items')#-'{normalized,items}')||jsonb_build_object('items',chosen.items) order by child.part_index),'[]'::jsonb) into v_children
         from app_private.pos_import_recovery_child_headers child cross join lateral (
           select jsonb_agg(n.row_json order by n.ordinal) items from app_private.pos_import_recovery_normal_rows n
           where n.shop_id=p_shop_id and n.shop_device_id=p_shop_device_id and n.upload_id=v_id and n.domain='child' and n.group_index=child.part_index
             and exists(select 1 from jsonb_array_elements(v_items) entry where entry->>'kind'='child' and (entry->>'partIndex')::integer=child.part_index and entry->>'childClientItemId'=n.client_item_id)) chosen
         where child.shop_id=p_shop_id and child.shop_device_id=p_shop_device_id and child.upload_id=v_id and chosen.items is not null;$before_selection$;
  v_after_selection text:=$after_selection$       with selected_entries as materialized (
         select entry->>'kind' kind,entry->>'partIndex' part_index_text,entry->>'childClientItemId' client_item_id
           from jsonb_array_elements(v_items) entry
       )
       select coalesce(jsonb_agg(((child.child-'items')#-'{normalized,items}')||jsonb_build_object('items',chosen.items) order by child.part_index),'[]'::jsonb) into v_children
         from app_private.pos_import_recovery_child_headers child cross join lateral (
           select jsonb_agg(n.row_json order by n.ordinal) items from app_private.pos_import_recovery_normal_rows n
           where n.shop_id=p_shop_id and n.shop_device_id=p_shop_device_id and n.upload_id=v_id and n.domain='child' and n.group_index=child.part_index
             and exists(select 1 from selected_entries entry where entry.kind='child' and entry.part_index_text::integer=child.part_index and entry.client_item_id=n.client_item_id)) chosen
         where child.shop_id=p_shop_id and child.shop_device_id=p_shop_device_id and child.upload_id=v_id and chosen.items is not null;$after_selection$;
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
      is distinct from '0eec947d66bbac2930385977b448a836'
    or encode(extensions.digest(convert_to(pg_catalog.replace(v_before.prosrc,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')
      is distinct from 'b3062b925c3968caf9bba6129a288e49006cdeb9140165c24a3245628192a3d2' then
    raise exception 'pos_import_recovery_coverage_entries_materialized_baseline_mismatch' using errcode='55000';
  end if;

  v_definition:=pg_catalog.pg_get_functiondef(v_target);
  if pg_catalog.strpos(v_definition,v_before_selection)=0 then
    v_before_selection:=pg_catalog.replace(v_before_selection,E'\n',E'\r\n');
    v_after_selection:=pg_catalog.replace(v_after_selection,E'\n',E'\r\n');
  end if;
  if (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_before_selection,'')))
    <>pg_catalog.length(v_before_selection) then
    raise exception 'pos_import_recovery_coverage_entries_materialized_baseline_mismatch' using errcode='55000';
  end if;
  execute pg_catalog.replace(v_definition,v_before_selection,v_after_selection);

  select * into v_after from pg_catalog.pg_proc where oid=v_target;
  if not found
    or pg_catalog.md5(pg_catalog.replace(v_after.prosrc,E'\r\n',E'\n'))
      is distinct from '564beca67b00d3e9867be23210a0a8ec'
    or encode(extensions.digest(convert_to(pg_catalog.replace(v_after.prosrc,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')
      is distinct from '1290b84c7a62ac8677c6da22f2521f5a93d5d123dc263e5c00ea2673f61e4faa'
    or (pg_catalog.to_jsonb(v_after)-'prosrc')
      is distinct from (pg_catalog.to_jsonb(v_before)-'prosrc') then
    raise exception 'pos_import_recovery_coverage_entries_materialized_postcondition_mismatch' using errcode='55000';
  end if;
end;
$migration$;

commit;

