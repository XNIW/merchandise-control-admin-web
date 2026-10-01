-- WECHAT-010: preserve the recovery contract while removing demonstrated
-- repeated scans and SQL-function startup overhead on the complete checkpoint.
-- No RPC body, scope/event guard, payload limit, ACL or timeout is changed.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Replacing existing helpers must preserve their reviewed owner and source.
-- This guard also makes an unexpected or partially applied baseline fail closed.
do $guard$
begin
  if current_user <> 'postgres' or (
    select count(*)
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_language language_row on language_row.oid = function_row.prolang
    join (values
      ('sync_checkpoint_json_timestamp', 'app_private.sync_checkpoint_json_timestamp(timestamp with time zone)', 'a8d0af78848caeda36b17ec4e75e897c', 'text', array['p_value']),
      ('sync_price_recovery_row_v1', 'app_private.sync_price_recovery_row_v1(uuid,uuid,uuid,text,double precision,text,text,text,text,uuid,timestamp with time zone)', '7554b1d1bf9ef16112631daa296d72b2', 'jsonb', array['p_id','p_owner_user_id','p_product_id','p_type','p_price','p_effective_at','p_source','p_note','p_created_at','p_shop_id','p_updated_at']),
      ('sync_checkpoint_timestamp', 'app_private.sync_checkpoint_timestamp(timestamp with time zone)', 'fc5a7b59e2944ab7cb5f85ea73da8a3a', 'text', array['p_value']),
      ('sync_checkpoint_chain_step_v1', 'app_private.sync_checkpoint_chain_step_v1(text,text)', '566f0b0f02c7e230a3c4719436c1722c', 'text', array['p_state','p_value']),
      ('sync_checkpoint_sha256', 'app_private.sync_checkpoint_sha256(text)', 'f6f7808034f5b1a954a5202cf283f2f5', 'text', array['p_value']),
      ('sync_product_recovery_row_v1', 'app_private.sync_product_recovery_row_v1(uuid,uuid,text,text,text,text,double precision,double precision,uuid,uuid,double precision,timestamp with time zone,timestamp with time zone,uuid,uuid,timestamp with time zone)', '77fb3aa48042e8095516a0977d745734', 'jsonb', array['p_id','p_owner_user_id','p_barcode','p_item_number','p_product_name','p_second_product_name','p_purchase_price','p_retail_price','p_supplier_id','p_category_id','p_stock_quantity','p_updated_at','p_deleted_at','p_shop_id','p_primary_image_version_id','p_primary_image_updated_at'])
    ) expected(name, signature, source_md5, return_type, argument_names)
      on pg_catalog.to_regprocedure(expected.signature) = function_row.oid
    where function_row.pronamespace = 'app_private'::regnamespace
      and pg_catalog.pg_get_userbyid(function_row.proowner) = 'postgres'
      and language_row.lanname = 'sql'
      and function_row.prorettype = pg_catalog.to_regtype(expected.return_type)
      and function_row.proretset = false
      and function_row.prokind = 'f'
      and function_row.proargnames = expected.argument_names
      and function_row.pronargdefaults = 0
      and function_row.proargdefaults is null
      and function_row.proallargtypes is null
      and function_row.proargmodes is null
      and function_row.provariadic = 0
      and function_row.prosecdef = false
      and function_row.proleakproof = false
      and function_row.proparallel = 's'
      and function_row.procost = 100
      and function_row.proisstrict = (expected.name = 'sync_checkpoint_json_timestamp')
      and function_row.provolatile = case when expected.name in (
        'sync_price_recovery_row_v1', 'sync_product_recovery_row_v1'
      ) then 's'::"char" else 'i'::"char" end
      and function_row.proacl = array['postgres=X/postgres']::aclitem[]
      and function_row.proconfig = case
        when expected.name = 'sync_checkpoint_sha256' then array['search_path=""']
        when expected.name in ('sync_checkpoint_timestamp', 'sync_checkpoint_json_timestamp')
          then array['search_path=pg_catalog']
        else array['search_path=app_private, pg_catalog, pg_temp']
      end
      and pg_catalog.md5(function_row.prosrc) = expected.source_md5
  ) <> 6 then
    raise exception 'recovery_checkpoint_performance_baseline_mismatch'
      using errcode = '55000';
  end if;
end;
$guard$;

-- The event validator deliberately compares canonical, case-folded UUID text.
-- Index that exact existing expression instead of changing its accepted input
-- or its shop/parent/tombstone checks. Each key is a fixed-size UUID string.
create index inventory_products_sync_event_id_text_idx
  on public.inventory_products ((lower(id::text)));
create index inventory_product_prices_sync_event_id_text_idx
  on public.inventory_product_prices ((lower(id::text)));

-- Identical scalar expressions, evaluated by cached PL/pgSQL expressions.
-- CREATE OR REPLACE preserves OID/owner/ACL; all other attributes remain exact.

CREATE OR REPLACE FUNCTION app_private.sync_checkpoint_json_timestamp(p_value timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
begin
  return case
    when not pg_catalog.isfinite(p_value) then '!nonfinite'
    else to_char(
      p_value at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  end;
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.sync_price_recovery_row_v1(p_id uuid, p_owner_user_id uuid, p_product_id uuid, p_type text, p_price double precision, p_effective_at text, p_source text, p_note text, p_created_at text, p_shop_id uuid, p_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE PARALLEL SAFE
 SET search_path TO 'app_private', 'pg_catalog', 'pg_temp'
AS $function$
begin
  return jsonb_build_object(
    'id', p_id,
    'owner_user_id', p_owner_user_id,
    'product_id', p_product_id,
    'type', p_type,
    'price', p_price,
    -- Clients must never derive the digest amount through a binary floating
    -- point round-trip.  Keep the legacy numeric field for compatibility, but
    -- publish the exact server-canonical decimal used by versionDigest too.
    'price_canonical', case
      when app_private.sync_price_value_is_canonical_v1(p_price)
        then app_private.sync_price_canonical_amount_v1(p_price)
      else null
    end,
    'effective_at', p_effective_at,
    'source', p_source,
    'note', p_note,
    'created_at', p_created_at,
    'shop_id', p_shop_id,
    'updated_at', app_private.sync_checkpoint_json_timestamp(p_updated_at)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.sync_checkpoint_timestamp(p_value timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  return case
    when p_value is null then '-'
    when not pg_catalog.isfinite(p_value) then '!nonfinite'
    else to_char(
      p_value at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  end;
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.sync_checkpoint_chain_step_v1(p_state text, p_value text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'app_private', 'pg_catalog', 'pg_temp'
AS $function$
begin
  return app_private.sync_checkpoint_sha256(
    coalesce(
      p_state,
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    ) || E'\x1f' || octet_length(convert_to(coalesce(p_value, ''), 'UTF8'))::text ||
    ':' || coalesce(p_value, '')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.sync_checkpoint_sha256(p_value text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
begin
  return encode(extensions.digest(coalesce(p_value, ''), 'sha256'), 'hex');
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.sync_product_recovery_row_v1(p_id uuid, p_owner_user_id uuid, p_barcode text, p_item_number text, p_product_name text, p_second_product_name text, p_purchase_price double precision, p_retail_price double precision, p_supplier_id uuid, p_category_id uuid, p_stock_quantity double precision, p_updated_at timestamp with time zone, p_deleted_at timestamp with time zone, p_shop_id uuid, p_primary_image_version_id uuid, p_primary_image_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE PARALLEL SAFE
 SET search_path TO 'app_private', 'pg_catalog', 'pg_temp'
AS $function$
begin
  return jsonb_build_object(
    'id', p_id,
    'owner_user_id', p_owner_user_id,
    'barcode', p_barcode,
    'item_number', p_item_number,
    'product_name', p_product_name,
    'second_product_name', p_second_product_name,
    'purchase_price', p_purchase_price,
    'retail_price', p_retail_price,
    'stock_quantity', p_stock_quantity,
    'shop_id', p_shop_id,
    -- A tombstone is an identity/version marker, not a live relation graph.
    -- Stripping its catalog parents prevents a later mapping disable from
    -- leaking stale cross-scope UUIDs through recovery.
    'category_id', case
      when p_deleted_at is null then p_category_id
      else null::uuid
    end,
    'supplier_id', case
      when p_deleted_at is null then p_supplier_id
      else null::uuid
    end,
    'primary_image_version_id', case
      when p_deleted_at is null then p_primary_image_version_id
      else null::uuid
    end,
    'updated_at',
      app_private.sync_checkpoint_json_timestamp(p_updated_at),
    'deleted_at',
      app_private.sync_checkpoint_json_timestamp(p_deleted_at),
    'primary_image_updated_at',
      case when p_deleted_at is null then
        app_private.sync_checkpoint_json_timestamp(
          p_primary_image_updated_at
        )
      else null end
  );
end;
$function$;

commit;
