-- TASK-094 candidate: pair root scalar identities by tagged UNION ALL and
-- grouping, rather than the third EXISTS relation JOIN. The fixed-scope PKs
-- allow at most one value per side/key; presence flags preserve inner-join
-- orphan exclusion. No new group filter, privileges, data, budget or deadline.
-- Estimated plan supports the target; fresh 59999 qualification is pending.
begin;

do $migration$
declare
  v_target regprocedure := pg_catalog.to_regprocedure(
    'app_private.pos_import_recovery_phased_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'
  );
  v_before pg_catalog.pg_proc%rowtype;
  v_after pg_catalog.pg_proc%rowtype;
  v_definition text;
  v_before_pairing text := $before_pairing$or exists(select 1 from normalized join raw using(group_index,ordinal)
           cross join lateral(values('barcode',normalized.barcode,raw.barcode),('itemNumber',normalized.item_number,raw.item_number)) fields(field,normalized_value,raw_value)
           where coalesce(fields.normalized_value,'')<>''
           group by fields.field,fields.normalized_value having count(distinct fields.raw_value)>1)$before_pairing$;
  v_after_pairing text := $after_pairing$or exists(
           select 1 from (
             select group_index,ordinal,
               max(barcode) filter(where is_normalized) normalized_barcode,
               max(item_number) filter(where is_normalized) normalized_item_number,
               max(barcode) filter(where not is_normalized) raw_barcode,
               max(item_number) filter(where not is_normalized) raw_item_number
             from (
               select group_index,ordinal,barcode,item_number,true is_normalized from normalized
               union all
               select group_index,ordinal,barcode,item_number,false is_normalized from raw
             ) scoped_rows
             group by group_index,ordinal
             having bool_or(is_normalized) and bool_or(not is_normalized)
           ) identities
           cross join lateral(values('barcode',identities.normalized_barcode,identities.raw_barcode),('itemNumber',identities.normalized_item_number,identities.raw_item_number)) fields(field,normalized_value,raw_value)
           where coalesce(fields.normalized_value,'')<>''
           group by fields.field,fields.normalized_value having count(distinct fields.raw_value)>1)$after_pairing$;
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
      is distinct from 'e0189819fb64f62c7cd4e1b0019610bb' then
    raise exception 'pos_import_recovery_identity_pairing_baseline_mismatch' using errcode = '55000';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(v_target);
  -- Match either LF or CRLF without changing any surrounding definition bytes.
  if pg_catalog.strpos(v_definition, v_before_pairing) = 0 then
    v_before_pairing := pg_catalog.replace(v_before_pairing, E'\n', E'\r\n');
    v_after_pairing := pg_catalog.replace(v_after_pairing, E'\n', E'\r\n');
  end if;
  if (pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_before_pairing, '')))
      <> pg_catalog.length(v_before_pairing) then
    raise exception 'pos_import_recovery_identity_pairing_baseline_mismatch' using errcode = '55000';
  end if;
  execute pg_catalog.replace(v_definition, v_before_pairing, v_after_pairing);

  select * into v_after from pg_catalog.pg_proc where oid = v_target;
  if not found
    or pg_catalog.md5(pg_catalog.replace(v_after.prosrc, E'\r\n', E'\n'))
      is distinct from 'e638c34aaa588e2b64f63fa3dc3102b0'
    -- Complete metadata includes OID, owner, ACL/grantors/options, signature,
    -- search_path, volatility, strict/leakproof flags and parallel behavior.
    or (pg_catalog.to_jsonb(v_after) - 'prosrc')
      is distinct from (pg_catalog.to_jsonb(v_before) - 'prosrc') then
    raise exception 'pos_import_recovery_identity_pairing_postcondition_mismatch' using errcode = '55000';
  end if;
end;
$migration$;

commit;
