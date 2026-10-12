-- TASK-094 query regression on actual installed coverage SELECT and real staging.
-- SOURCE ONLY: runtime/pgTAP/performance acceptance NOT_RUN until coordinator gate.
-- These adversarial vectors are query semantics; they do not assert parser/auth admission.
-- The literal prior SELECT is independent from candidate extraction and expected JSON.
-- No auth/TAP fallback, schema/index/planner change, economic apply or new role.
-- Embedded guarded DO is VERBATIM from migration20261012211402.
-- Exact DO UTF8 SHA256: dc4f17db2a1d44e9cd32f858843e31a155dec03b0619a37ad75c22861e9507c8
begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select is(
 (select md5(replace(prosrc,E'\r\n',E'\n')) from pg_catalog.pg_proc
  where oid='app_private.pos_import_recovery_phased_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure),
 '564beca67b00d3e9867be23210a0a8ec','installed coverage candidate full prosrc MD5');
select is(
 (select encode(extensions.digest(convert_to(replace(prosrc,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')
  from pg_catalog.pg_proc
  where oid='app_private.pos_import_recovery_phased_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure),
 '1290b84c7a62ac8677c6da22f2521f5a93d5d123dc263e5c00ea2673f61e4faa',
 'installed coverage candidate full prosrc SHA256');

create temporary table coverage_artifacts(name text primary key,body text not null);
insert into coverage_artifacts values
 ('migration',$migration_artifact$do $migration$
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
$migration$;$migration_artifact$),
 ('prior',$prior_query$       select coalesce(jsonb_agg(((child.child-'items')#-'{normalized,items}')||jsonb_build_object('items',chosen.items) order by child.part_index),'[]'::jsonb) into v_children
         from app_private.pos_import_recovery_child_headers child cross join lateral (
           select jsonb_agg(n.row_json order by n.ordinal) items from app_private.pos_import_recovery_normal_rows n
           where n.shop_id=p_shop_id and n.shop_device_id=p_shop_device_id and n.upload_id=v_id and n.domain='child' and n.group_index=child.part_index
             and exists(select 1 from jsonb_array_elements(v_items) entry where entry->>'kind'='child' and (entry->>'partIndex')::integer=child.part_index and entry->>'childClientItemId'=n.client_item_id)) chosen
         where child.shop_id=p_shop_id and child.shop_device_id=p_shop_device_id and child.upload_id=v_id and chosen.items is not null;$prior_query$);

do $extract$
declare
 v_source text;v_query text;v_start integer;v_finish integer;
 v_begin constant text:='       with selected_entries as materialized (';
 v_end constant text:='         where child.shop_id=p_shop_id and child.shop_device_id=p_shop_device_id and child.upload_id=v_id and chosen.items is not null;';
begin
 select replace(prosrc,E'\r\n',E'\n') into strict v_source from pg_catalog.pg_proc
  where oid='app_private.pos_import_recovery_phased_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure;
 if md5(v_source)<>'564beca67b00d3e9867be23210a0a8ec'
  or length(v_source)-length(replace(v_source,v_begin,''))<>length(v_begin)
  or length(v_source)-length(replace(v_source,v_end,''))<>length(v_end) then
  raise exception 'coverage installed body/anchor mismatch';
 end if;
 v_start:=strpos(v_source,v_begin);v_finish:=strpos(v_source,v_end)+length(v_end);
 if v_finish<=v_start then raise exception 'coverage installed range mismatch';end if;
 v_query:=substr(v_source,v_start,v_finish-v_start);
 insert into coverage_artifacts values('installed',v_source),('candidate',v_query);
 execute format(
  'create function pg_temp.coverage_candidate(p_shop_id uuid,p_shop_device_id uuid,p_upload_id uuid,p_entries jsonb) returns jsonb language plpgsql as %L',
  'declare v_id uuid:=p_upload_id;v_items jsonb:=p_entries;v_children jsonb;begin'||E'\n'||v_query||E'\nreturn v_children;end;');
 execute format(
  'create function pg_temp.coverage_prior(p_shop_id uuid,p_shop_device_id uuid,p_upload_id uuid,p_entries jsonb) returns jsonb language plpgsql as %L',
  'declare v_id uuid:=p_upload_id;v_items jsonb:=p_entries;v_children jsonb;begin'||E'\n'||
  (select body from coverage_artifacts where name='prior')||E'\nreturn v_children;end;');
end;
$extract$;

create temporary table coverage_cases as
select ordinal::integer case_no,entry->>'name' case_name,entry->'entries' entries,
 entry->>'state' expected_state,entry->'expected' expected,
 coalesce(entry->'headers',$base_headers$[{"partIndex":1,"child":{"kind":"correction","tag":"second","items":[{"discard":"top"}],"base":{"keep":"yes"},"unknownHeader":{"items":[3,2]}}},{"partIndex":0,"child":{"kind":"ordinary","tag":"汉","items":[{"discard":"top"}],"normalized":{"items":[{"discard":"nested"}],"payloadHash":"h0","unknown":[2,1]},"nullable":null}}]$base_headers$::jsonb) headers,
 coalesce(entry->'rows',$base_rows$[{"group":1,"ordinal":0,"row":{"clientItemId":"c","remoteProductId":"remote-c","quantityDelta":-1}},{"group":0,"ordinal":1,"row":{"clientItemId":"b","barcode":"Bb"}},{"group":0,"ordinal":0,"row":{"clientItemId":"a","barcode":"Aa","quantity":1.25}},{"domain":"root","group":0,"ordinal":0,"row":{"clientItemId":"a","marker":"other-domain"}},{"group":2,"ordinal":0,"row":{"clientItemId":"orphan"}}]$base_rows$::jsonb) normal_rows,
 ('94980000-0000-4000-8000-'||lpad(ordinal::text,12,'0'))::uuid upload_id,
 ('94980001-0000-4000-8000-'||lpad(ordinal::text,12,'0'))::uuid other_upload_id
from jsonb_array_elements($vectors$[
  {
    "name": "ordinary_unknown_header_and_nested_items_removed",
    "entries": [
      {
        "kind": "child",
        "partIndex": 0,
        "childClientItemId": "a"
      }
    ],
    "expected": [
      {
        "kind": "ordinary",
        "tag": "汉",
        "normalized": {
          "payloadHash": "h0",
          "unknown": [
            2,
            1
          ]
        },
        "nullable": null,
        "items": [
          {
            "clientItemId": "a",
            "barcode": "Aa",
            "quantity": 1.25
          }
        ]
      }
    ],
    "state": "00000"
  },
  {
    "name": "correction_header_and_full_item_retained",
    "entries": [
      {
        "kind": "child",
        "partIndex": 1,
        "childClientItemId": "c"
      }
    ],
    "expected": [
      {
        "kind": "correction",
        "tag": "second",
        "base": {
          "keep": "yes"
        },
        "unknownHeader": {
          "items": [
            3,
            2
          ]
        },
        "items": [
          {
            "clientItemId": "c",
            "remoteProductId": "remote-c",
            "quantityDelta": -1
          }
        ]
      }
    ],
    "state": "00000"
  },
  {
    "name": "header_part_and_normal_ordinal_order_independent_of_entry_order",
    "entries": [
      {
        "kind": "child",
        "partIndex": 1,
        "childClientItemId": "c"
      },
      {
        "kind": "child",
        "partIndex": 0,
        "childClientItemId": "b"
      },
      {
        "kind": "child",
        "partIndex": 0,
        "childClientItemId": "a"
      }
    ],
    "expected": [
      {
        "kind": "ordinary",
        "tag": "汉",
        "normalized": {
          "payloadHash": "h0",
          "unknown": [
            2,
            1
          ]
        },
        "nullable": null,
        "items": [
          {
            "clientItemId": "a",
            "barcode": "Aa",
            "quantity": 1.25
          },
          {
            "clientItemId": "b",
            "barcode": "Bb"
          }
        ]
      },
      {
        "kind": "correction",
        "tag": "second",
        "base": {
          "keep": "yes"
        },
        "unknownHeader": {
          "items": [
            3,
            2
          ]
        },
        "items": [
          {
            "clientItemId": "c",
            "remoteProductId": "remote-c",
            "quantityDelta": -1
          }
        ]
      }
    ],
    "state": "00000"
  },
  {
    "name": "duplicate_coverage_entries_do_not_multiply_rows",
    "entries": [
      {
        "kind": "child",
        "partIndex": 0,
        "childClientItemId": "a"
      },
      {
        "kind": "child",
        "partIndex": 0,
        "childClientItemId": "a"
      }
    ],
    "expected": [
      {
        "kind": "ordinary",
        "tag": "汉",
        "normalized": {
          "payloadHash": "h0",
          "unknown": [
            2,
            1
          ]
        },
        "nullable": null,
        "items": [
          {
            "clientItemId": "a",
            "barcode": "Aa",
            "quantity": 1.25
          }
        ]
      }
    ],
    "state": "00000"
  },
  {
    "name": "empty_coverage_array",
    "entries": [],
    "expected": [],
    "state": "00000"
  },
  {
    "name": "sql_null_coverage_missing_vector_key",
    "expected": [],
    "state": "00000"
  },
  {
    "name": "json_null_coverage_is_scalar_error",
    "entries": null,
    "expected": null,
    "state": "22023"
  },
  {
    "name": "object_coverage_is_scalar_error",
    "entries": {
      "kind": "child"
    },
    "expected": null,
    "state": "22023"
  },
  {
    "name": "string_coverage_is_scalar_error",
    "entries": "scalar",
    "expected": null,
    "state": "22023"
  },
  {
    "name": "scalar_and_null_entries_do_not_select_rows",
    "entries": [
      null,
      7,
      "x",
      true,
      [],
      {}
    ],
    "expected": [],
    "state": "00000"
  },
  {
    "name": "scalar_entries_plus_valid_child_preserve_full_projection",
    "entries": [
      null,
      7,
      {},
      {
        "kind": "child",
        "partIndex": 0,
        "childClientItemId": "a"
      }
    ],
    "expected": [
      {
        "kind": "ordinary",
        "tag": "汉",
        "normalized": {
          "payloadHash": "h0",
          "unknown": [
            2,
            1
          ]
        },
        "nullable": null,
        "items": [
          {
            "clientItemId": "a",
            "barcode": "Aa",
            "quantity": 1.25
          }
        ]
      }
    ],
    "state": "00000"
  },
  {
    "name": "missing_client_item_key_does_not_match",
    "entries": [
      {
        "kind": "child",
        "partIndex": 0
      }
    ],
    "expected": [],
    "state": "00000"
  },
  {
    "name": "null_client_item_key_does_not_match",
    "entries": [
      {
        "kind": "child",
        "partIndex": 0,
        "childClientItemId": null
      }
    ],
    "expected": [],
    "state": "00000"
  },
  {
    "name": "missing_part_index_does_not_match",
    "entries": [
      {
        "kind": "child",
        "childClientItemId": "a"
      }
    ],
    "expected": [],
    "state": "00000"
  },
  {
    "name": "null_part_index_does_not_match",
    "entries": [
      {
        "kind": "child",
        "partIndex": null,
        "childClientItemId": "a"
      }
    ],
    "expected": [],
    "state": "00000"
  },
  {
    "name": "wrong_group_and_client_pair_excluded",
    "entries": [
      {
        "kind": "child",
        "partIndex": 1,
        "childClientItemId": "a"
      }
    ],
    "expected": [],
    "state": "00000"
  },
  {
    "name": "unknown_header_part_excluded",
    "entries": [
      {
        "kind": "child",
        "partIndex": 2,
        "childClientItemId": "orphan"
      }
    ],
    "expected": [],
    "state": "00000"
  },
  {
    "name": "nonchild_kind_without_index_excluded",
    "entries": [
      {
        "kind": "original_accepted",
        "childClientItemId": "a"
      }
    ],
    "expected": [],
    "state": "00000"
  },
  {
    "name": "nonchild_invalid_integer_is_not_eagerly_cast",
    "entries": [
      {
        "kind": "accepted_contributor",
        "partIndex": "not-an-int",
        "childClientItemId": "a"
      }
    ],
    "expected": [],
    "state": "00000"
  },
  {
    "name": "nonchild_overflow_integer_is_not_eagerly_cast",
    "entries": [
      {
        "kind": "retired",
        "partIndex": "2147483648",
        "childClientItemId": "a"
      }
    ],
    "expected": [],
    "state": "00000"
  },
  {
    "name": "child_invalid_integer_preserves_sqlstate",
    "entries": [
      {
        "kind": "child",
        "partIndex": "not-an-int",
        "childClientItemId": "a"
      }
    ],
    "expected": null,
    "state": "22P02"
  },
  {
    "name": "child_overflow_integer_preserves_sqlstate",
    "entries": [
      {
        "kind": "child",
        "partIndex": "2147483648",
        "childClientItemId": "a"
      }
    ],
    "expected": null,
    "state": "22003"
  },
  {
    "name": "child_boolean_integer_preserves_sqlstate",
    "entries": [
      {
        "kind": "child",
        "partIndex": true,
        "childClientItemId": "a"
      }
    ],
    "expected": null,
    "state": "22P02"
  },
  {
    "name": "plus_zero_legacy_integer_cast",
    "entries": [
      {
        "kind": "child",
        "partIndex": "+0",
        "childClientItemId": "a"
      }
    ],
    "expected": [
      {
        "kind": "ordinary",
        "tag": "汉",
        "normalized": {
          "payloadHash": "h0",
          "unknown": [
            2,
            1
          ]
        },
        "nullable": null,
        "items": [
          {
            "clientItemId": "a",
            "barcode": "Aa",
            "quantity": 1.25
          }
        ]
      }
    ],
    "state": "00000"
  },
  {
    "name": "double_zero_legacy_integer_cast",
    "entries": [
      {
        "kind": "child",
        "partIndex": "00",
        "childClientItemId": "a"
      }
    ],
    "expected": [
      {
        "kind": "ordinary",
        "tag": "汉",
        "normalized": {
          "payloadHash": "h0",
          "unknown": [
            2,
            1
          ]
        },
        "nullable": null,
        "items": [
          {
            "clientItemId": "a",
            "barcode": "Aa",
            "quantity": 1.25
          }
        ]
      }
    ],
    "state": "00000"
  },
  {
    "name": "surrounding_spaces_legacy_integer_cast",
    "entries": [
      {
        "kind": "child",
        "partIndex": " 0 ",
        "childClientItemId": "a"
      }
    ],
    "expected": [
      {
        "kind": "ordinary",
        "tag": "汉",
        "normalized": {
          "payloadHash": "h0",
          "unknown": [
            2,
            1
          ]
        },
        "nullable": null,
        "items": [
          {
            "clientItemId": "a",
            "barcode": "Aa",
            "quantity": 1.25
          }
        ]
      }
    ],
    "state": "00000"
  },
  {
    "name": "int32_max_without_header",
    "entries": [
      {
        "kind": "child",
        "partIndex": "2147483647",
        "childClientItemId": "a"
      }
    ],
    "expected": [],
    "state": "00000"
  },
  {
    "name": "no_headers_avoids_unused_bad_entry_cast",
    "headers": [],
    "entries": [
      {
        "kind": "child",
        "partIndex": "not-an-int",
        "childClientItemId": "a"
      }
    ],
    "expected": [],
    "state": "00000"
  },
  {
    "name": "no_normal_rows_avoids_unused_bad_entry_cast",
    "rows": [],
    "entries": [
      {
        "kind": "child",
        "partIndex": "2147483648",
        "childClientItemId": "a"
      }
    ],
    "expected": [],
    "state": "00000"
  },
  {
    "name": "only_other_domain_rows_excluded",
    "rows": [
      {
        "domain": "root",
        "group": 0,
        "ordinal": 0,
        "row": {
          "clientItemId": "a",
          "barcode": "Aa",
          "quantity": 1.25
        }
      }
    ],
    "entries": [
      {
        "kind": "child",
        "partIndex": 0,
        "childClientItemId": "a"
      }
    ],
    "expected": [],
    "state": "00000"
  },
  {
    "name": "sql_null_child_header_preserved_as_array_null",
    "headers": [
      {
        "partIndex": 0
      }
    ],
    "entries": [
      {
        "kind": "child",
        "partIndex": 0,
        "childClientItemId": "a"
      }
    ],
    "expected": [
      null
    ],
    "state": "00000"
  },
  {
    "name": "scalar_child_header_preserves_delete_error",
    "headers": [
      {
        "partIndex": 0,
        "child": "scalar"
      }
    ],
    "entries": [
      {
        "kind": "child",
        "partIndex": 0,
        "childClientItemId": "a"
      }
    ],
    "expected": null,
    "state": "22023"
  },
  {
    "name": "normal_duplicate_ids_preserve_multiset",
    "rows": [
      {
        "group": 0,
        "ordinal": 1,
        "row": {
          "clientItemId": "a",
          "version": 2
        }
      },
      {
        "group": 0,
        "ordinal": 0,
        "row": {
          "clientItemId": "a",
          "version": 1
        }
      }
    ],
    "entries": [
      {
        "kind": "child",
        "partIndex": 0,
        "childClientItemId": "a"
      }
    ],
    "expected": [
      {
        "kind": "ordinary",
        "tag": "汉",
        "normalized": {
          "payloadHash": "h0",
          "unknown": [
            2,
            1
          ]
        },
        "nullable": null,
        "items": [
          {
            "clientItemId": "a",
            "version": 1
          },
          {
            "clientItemId": "a",
            "version": 2
          }
        ]
      }
    ],
    "state": "00000"
  },
  {
    "name": "same_id_in_two_groups_stays_part_scoped",
    "rows": [
      {
        "group": 0,
        "ordinal": 0,
        "row": {
          "clientItemId": "a",
          "barcode": "Aa",
          "quantity": 1.25
        }
      },
      {
        "group": 1,
        "ordinal": 0,
        "row": {
          "clientItemId": "a",
          "version": "part-one"
        }
      }
    ],
    "entries": [
      {
        "kind": "child",
        "partIndex": 1,
        "childClientItemId": "a"
      }
    ],
    "expected": [
      {
        "kind": "correction",
        "tag": "second",
        "base": {
          "keep": "yes"
        },
        "unknownHeader": {
          "items": [
            3,
            2
          ]
        },
        "items": [
          {
            "clientItemId": "a",
            "version": "part-one"
          }
        ]
      }
    ],
    "state": "00000"
  },
  {
    "name": "empty_text_id_matches_exactly_without_new_trim",
    "rows": [
      {
        "group": 0,
        "ordinal": 0,
        "row": {
          "clientItemId": "",
          "marker": "empty"
        }
      }
    ],
    "entries": [
      {
        "kind": "child",
        "partIndex": 0,
        "childClientItemId": ""
      }
    ],
    "expected": [
      {
        "kind": "ordinary",
        "tag": "汉",
        "normalized": {
          "payloadHash": "h0",
          "unknown": [
            2,
            1
          ]
        },
        "nullable": null,
        "items": [
          {
            "clientItemId": "",
            "marker": "empty"
          }
        ]
      }
    ],
    "state": "00000"
  },
  {
    "name": "null_normal_id_does_not_equal_null_entry",
    "rows": [
      {
        "group": 0,
        "ordinal": 0,
        "row": {
          "clientItemId": null,
          "marker": "null"
        }
      }
    ],
    "entries": [
      {
        "kind": "child",
        "partIndex": 0,
        "childClientItemId": null
      }
    ],
    "expected": [],
    "state": "00000"
  },
  {
    "name": "foreign_shop_device_upload_and_domain_cannot_supply_items",
    "entries": [
      {
        "kind": "child",
        "partIndex": 0,
        "childClientItemId": "foreign-only"
      }
    ],
    "expected": [],
    "state": "00000"
  },
  {
    "name": "foreign_headers_cannot_project_matching_owned_group",
    "rows": [
      {
        "group": 99,
        "ordinal": 0,
        "row": {
          "clientItemId": "header-only",
          "sentinel": "owned-row-with-no-owned-header"
        }
      }
    ],
    "entries": [
      {
        "kind": "child",
        "partIndex": 99,
        "childClientItemId": "header-only"
      }
    ],
    "expected": [],
    "state": "00000"
  }
]$vectors$::jsonb) with ordinality source(entry,ordinal);

-- All records are owned staged test data, not protocol admission witnesses.
-- The unmodified chain's actual FK/generated-ID/PK constraints stay enabled.
insert into app_private.pos_import_recovery_documents(shop_id,shop_device_id,upload_id,mode,raw_hash,phase,header)
select scope.shop_id,scope.device_id,scope.upload_id,'plan','sha256:'||repeat('0',64),'coverage','{}'::jsonb
from coverage_cases c cross join lateral(values
 ('94900000-0000-4000-8000-000000000001'::uuid,'94900000-0000-4000-8000-000000000011'::uuid,c.upload_id),
 ('94900000-0000-4000-8000-000000000002'::uuid,'94900000-0000-4000-8000-000000000011'::uuid,c.upload_id),
 ('94900000-0000-4000-8000-000000000001'::uuid,'94900000-0000-4000-8000-000000000012'::uuid,c.upload_id),
 ('94900000-0000-4000-8000-000000000001'::uuid,'94900000-0000-4000-8000-000000000011'::uuid,c.other_upload_id)
) scope(shop_id,device_id,upload_id);

insert into app_private.pos_import_recovery_child_headers(shop_id,shop_device_id,upload_id,part_index,raw_header,item_count,child)
select '94900000-0000-4000-8000-000000000001'::uuid,'94900000-0000-4000-8000-000000000011'::uuid,
 c.upload_id,(h->>'partIndex')::integer,jsonb_build_object('fixture',c.case_name),1,h->'child'
from coverage_cases c cross join lateral jsonb_array_elements(c.headers) h;

insert into app_private.pos_import_recovery_normal_rows(shop_id,shop_device_id,upload_id,domain,group_index,ordinal,row_json,canonical_json)
select '94900000-0000-4000-8000-000000000001'::uuid,'94900000-0000-4000-8000-000000000011'::uuid,
 c.upload_id,coalesce(n->>'domain','child'),(n->>'group')::integer,(n->>'ordinal')::integer,n->'row',(n->'row')::text
from coverage_cases c cross join lateral jsonb_array_elements(c.normal_rows) n;

-- Foreign scopes and another domain carry a matching text ID, never eligible.
insert into app_private.pos_import_recovery_normal_rows(shop_id,shop_device_id,upload_id,domain,group_index,ordinal,row_json,canonical_json)
select scope.shop_id,scope.device_id,scope.upload_id,scope.domain,0,9000,
 '{"clientItemId":"foreign-only","sentinel":"must-not-select"}'::jsonb,
 '{"clientItemId": "foreign-only", "sentinel": "must-not-select"}'
from coverage_cases c cross join lateral(values
 ('94900000-0000-4000-8000-000000000002'::uuid,'94900000-0000-4000-8000-000000000011'::uuid,c.upload_id,'child'::text),
 ('94900000-0000-4000-8000-000000000001'::uuid,'94900000-0000-4000-8000-000000000012'::uuid,c.upload_id,'child'::text),
 ('94900000-0000-4000-8000-000000000001'::uuid,'94900000-0000-4000-8000-000000000011'::uuid,c.other_upload_id,'child'::text),
 ('94900000-0000-4000-8000-000000000001'::uuid,'94900000-0000-4000-8000-000000000011'::uuid,c.upload_id,'root'::text)
) scope(shop_id,device_id,upload_id,domain);
insert into app_private.pos_import_recovery_child_headers(shop_id,shop_device_id,upload_id,part_index,raw_header,item_count,child)
select scope.shop_id,scope.device_id,scope.upload_id,99,'{}'::jsonb,1,'{"marker":"foreign-header"}'::jsonb
from coverage_cases c cross join lateral(values
 ('94900000-0000-4000-8000-000000000002'::uuid,'94900000-0000-4000-8000-000000000011'::uuid,c.upload_id),
 ('94900000-0000-4000-8000-000000000001'::uuid,'94900000-0000-4000-8000-000000000012'::uuid,c.upload_id),
 ('94900000-0000-4000-8000-000000000001'::uuid,'94900000-0000-4000-8000-000000000011'::uuid,c.other_upload_id)
) scope(shop_id,device_id,upload_id);

create function pg_temp.coverage_snapshot() returns jsonb language sql stable as $snapshot$
 select jsonb_build_object(
 'documents',(select coalesce(jsonb_agg(to_jsonb(d) order by shop_id,shop_device_id,upload_id),'[]'::jsonb)
  from app_private.pos_import_recovery_documents d where shop_id in('94900000-0000-4000-8000-000000000001'::uuid,'94900000-0000-4000-8000-000000000002'::uuid)),
 'normal',(select coalesce(jsonb_agg(to_jsonb(n) order by shop_id,shop_device_id,upload_id,domain,group_index,ordinal),'[]'::jsonb)
  from app_private.pos_import_recovery_normal_rows n where shop_id in('94900000-0000-4000-8000-000000000001'::uuid,'94900000-0000-4000-8000-000000000002'::uuid)),
 'raw',(select coalesce(jsonb_agg(to_jsonb(r) order by shop_id,shop_device_id,upload_id,domain,group_index,ordinal),'[]'::jsonb)
  from app_private.pos_import_recovery_raw_rows r where shop_id in('94900000-0000-4000-8000-000000000001'::uuid,'94900000-0000-4000-8000-000000000002'::uuid)),
 'headers',(select coalesce(jsonb_agg(to_jsonb(h) order by shop_id,shop_device_id,upload_id,part_index),'[]'::jsonb)
  from app_private.pos_import_recovery_child_headers h where shop_id in('94900000-0000-4000-8000-000000000001'::uuid,'94900000-0000-4000-8000-000000000002'::uuid))
 );
$snapshot$;
create temporary table coverage_before as select pg_temp.coverage_snapshot() value;

create function pg_temp.coverage_evaluate(p_origin text,p_upload uuid,p_entries jsonb) returns jsonb language plpgsql as $evaluate$
declare v_value jsonb;v_state text:='00000';v_message text;
begin
 begin
  if p_origin='candidate' then
   v_value:=pg_temp.coverage_candidate('94900000-0000-4000-8000-000000000001'::uuid,'94900000-0000-4000-8000-000000000011'::uuid,p_upload,p_entries);
  elsif p_origin='prior' then
   v_value:=pg_temp.coverage_prior('94900000-0000-4000-8000-000000000001'::uuid,'94900000-0000-4000-8000-000000000011'::uuid,p_upload,p_entries);
  else raise exception 'unknown coverage query origin';end if;
 exception when others then
  get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;
 end;
 return jsonb_build_object('state',v_state,'message',v_message,'value',v_value);
end;
$evaluate$;
create temporary table coverage_results as
select c.*,pg_temp.coverage_evaluate('prior',upload_id,entries) prior,
 pg_temp.coverage_evaluate('candidate',upload_id,entries) candidate from coverage_cases c order by case_no;

select is(prior->>'state',expected_state,case_name||': prior independent expected SQLSTATE') from coverage_results order by case_no;
select is(candidate->>'state',expected_state,case_name||': installed independent expected SQLSTATE') from coverage_results order by case_no;
select is(prior->'value',expected,case_name||': prior equals explicit full JSON expected') from coverage_results order by case_no;
select is(candidate->'value',expected,case_name||': installed equals explicit full JSON expected') from coverage_results order by case_no;
select is(candidate,prior,case_name||': full JSON, NULL, SQLSTATE and error identity match') from coverage_results order by case_no;
select is(pg_temp.coverage_snapshot(),(select value from coverage_before),'all query/error vectors preserve full owned staging data');

-- Execute the actual guarded migration in caught subtransactions; never emulate it.
create function pg_temp.coverage_apply_actual_migration() returns void language plpgsql as $apply$
begin
 execute (select body from coverage_artifacts where name='migration');
end;
$apply$;
create function pg_temp.coverage_guard_probe(p_case text) returns jsonb language plpgsql as $probe$
declare
 v_target regprocedure:='app_private.pos_import_recovery_phased_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure;
 v_before jsonb;v_namespace_before jsonb;v_baseline jsonb;v_after jsonb;v_data jsonb;
 v_definition text;v_candidate text;v_prior text;v_state text;v_message text;
 v_baseline_pin boolean:=false;v_after_pin boolean:=false;v_metadata_equal boolean:=false;v_applied boolean:=false;
begin
 select to_jsonb(p) into strict v_before from pg_catalog.pg_proc p where oid=v_target;
 select to_jsonb(n) into strict v_namespace_before from pg_catalog.pg_namespace n where nspname='app_private';
 v_data:=pg_temp.coverage_snapshot();
 begin
  select body into strict v_candidate from coverage_artifacts where name='candidate';
  select body into strict v_prior from coverage_artifacts where name='prior';
  v_definition:=replace(pg_catalog.pg_get_functiondef(v_target),E'\r\n',E'\n');
  if length(v_definition)-length(replace(v_definition,v_candidate,''))<>length(v_candidate) then
   raise exception 'coverage reverse query range mismatch';end if;
  v_definition:=replace(v_definition,v_candidate,v_prior);
  if p_case='accepted_crlf' then v_definition:=replace(v_definition,E'\n',E'\r\n');end if;
  execute v_definition;
  select to_jsonb(p) into strict v_baseline from pg_catalog.pg_proc p where oid=v_target;
  v_baseline_pin:=md5(replace(v_baseline->>'prosrc',E'\r\n',E'\n'))='0eec947d66bbac2930385977b448a836'
   and encode(extensions.digest(convert_to(replace(v_baseline->>'prosrc',E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')=
    'b3062b925c3968caf9bba6129a288e49006cdeb9140165c24a3245628192a3d2';
  if not v_baseline_pin then raise exception 'coverage reversed whole-body pin mismatch';end if;
  case p_case
   when 'accepted_lf' then null;
   when 'accepted_crlf' then null;
   when 'accepted_cost_acl' then
    execute format('alter function %s cost 31',v_target);
    execute format('grant execute on function %s to service_role with grant option',v_target);
   when 'body_drift' then
    v_definition:=replace(pg_catalog.pg_get_functiondef(v_target),E'\r\n',E'\n');
    execute replace(v_definition,v_prior,v_prior||E'\n       -- intentional coverage test body drift');
   when 'security_drift' then execute format('alter function %s security invoker',v_target);
   when 'search_path_drift' then execute format('alter function %s set search_path to public',v_target);
   when 'owner_drift' then
    execute 'grant create on schema app_private to service_role';
    execute format('alter function %s owner to service_role',v_target);
   when 'strict_drift' then execute format('alter function %s strict',v_target);
   when 'volatile_drift' then execute format('alter function %s stable',v_target);
   when 'parallel_drift' then execute format('alter function %s parallel safe',v_target);
   else raise exception 'unknown coverage guard probe';end case;
  select to_jsonb(p) into strict v_baseline from pg_catalog.pg_proc p where oid=v_target;
  perform pg_temp.coverage_apply_actual_migration();
  v_applied:=true;
  select to_jsonb(p) into strict v_after from pg_catalog.pg_proc p where oid=v_target;
  v_after_pin:=md5(replace(v_after->>'prosrc',E'\r\n',E'\n'))='564beca67b00d3e9867be23210a0a8ec'
   and encode(extensions.digest(convert_to(replace(v_after->>'prosrc',E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')=
    '1290b84c7a62ac8677c6da22f2521f5a93d5d123dc263e5c00ea2673f61e4faa';
  v_metadata_equal:=(v_after-'prosrc') is not distinct from (v_baseline-'prosrc');
  raise exception 'coverage_probe_rollback' using errcode='Z0941';
 exception when others then
  get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;
 end;
 return jsonb_build_object('baselinePin',v_baseline_pin,'afterPin',v_after_pin,'metadataEqual',v_metadata_equal,'applied',v_applied,'state',v_state,'message',v_message,
 'rollbackCatalogEqual',(select to_jsonb(p) from pg_catalog.pg_proc p where oid=v_target) is not distinct from v_before
  and (select to_jsonb(n) from pg_catalog.pg_namespace n where nspname='app_private') is not distinct from v_namespace_before,
 'rollbackDataEqual',pg_temp.coverage_snapshot() is not distinct from v_data);
end;
$probe$;
create temporary table coverage_guard_cases(case_no integer primary key,case_name text not null,expected_state text not null,expected_message text not null,expected_applied boolean not null);
insert into coverage_guard_cases values
 (1,'accepted_lf','Z0941','coverage_probe_rollback',true),
 (2,'accepted_crlf','Z0941','coverage_probe_rollback',true),
 (3,'accepted_cost_acl','Z0941','coverage_probe_rollback',true),
 (4,'body_drift','55000','pos_import_recovery_coverage_entries_materialized_baseline_mismatch',false),
 (5,'security_drift','55000','pos_import_recovery_coverage_entries_materialized_baseline_mismatch',false),
 (6,'search_path_drift','55000','pos_import_recovery_coverage_entries_materialized_baseline_mismatch',false),
 (7,'owner_drift','55000','pos_import_recovery_coverage_entries_materialized_baseline_mismatch',false),
 (8,'strict_drift','55000','pos_import_recovery_coverage_entries_materialized_baseline_mismatch',false),
 (9,'volatile_drift','55000','pos_import_recovery_coverage_entries_materialized_baseline_mismatch',false),
 (10,'parallel_drift','55000','pos_import_recovery_coverage_entries_materialized_baseline_mismatch',false);
create temporary table coverage_guard_results as select c.*,pg_temp.coverage_guard_probe(case_name) result from coverage_guard_cases c order by case_no;
select is(result->>'baselinePin','true',case_name||': exact prior0eec full-body inverse') from coverage_guard_results order by case_no;
select is(result->>'state',expected_state,case_name||': actual forward SQLSTATE or forced rollback') from coverage_guard_results order by case_no;
select is(result->>'message',expected_message,case_name||': actual forward failure identity') from coverage_guard_results order by case_no;
select is((result->>'applied')::boolean,expected_applied,case_name||': actual drift refuses before replacement') from coverage_guard_results order by case_no;
select is(result->>'rollbackCatalogEqual','true',case_name||': rollback restores full pg_proc and pg_namespace including ACL') from coverage_guard_results order by case_no;
select is(result->>'rollbackDataEqual','true',case_name||': rollback preserves every owned staging field') from coverage_guard_results order by case_no;
select is(result->>'afterPin','true',case_name||': successful actual forward yields exact candidate') from coverage_guard_results where expected_applied order by case_no;
select is(result->>'metadataEqual','true',case_name||': complete OID/owner/ACL/cost/config/flags unchanged except prosrc') from coverage_guard_results where expected_applied order by case_no;
select is(pg_temp.coverage_snapshot(),(select value from coverage_before),'all migration guards preserve full owned staging snapshot');
select is(
 (select replace(prosrc,E'\r\n',E'\n') from pg_catalog.pg_proc where oid='app_private.pos_import_recovery_phased_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure),
 (select body from coverage_artifacts where name='installed'),'all probes restore the exact current candidate body');
select * from finish();
rollback;

