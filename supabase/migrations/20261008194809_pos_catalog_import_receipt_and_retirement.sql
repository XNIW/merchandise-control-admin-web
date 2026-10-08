-- TASK-094 continuation: read-only receipt lookup and explicit identity retirement.
-- Source-only until a separately approved apply. No business rows are repaired.
begin;

create table app_private.pos_catalog_import_retirements (
  shop_id uuid not null,
  shop_device_id uuid not null,
  client_import_id text not null,
  idempotency_key text not null,
  payload_hash text not null,
  staff_id uuid not null,
  pos_session_id uuid not null,
  retired_at timestamptz not null default clock_timestamp(),
  primary key (shop_id, shop_device_id, client_import_id),
  unique (shop_id, shop_device_id, idempotency_key),
  check (length(client_import_id) between 1 and 200),
  check (length(idempotency_key) between 1 and 200),
  check (payload_hash ~ '^sha256:[0-9a-f]{64}$')
);
alter table app_private.pos_catalog_import_retirements enable row level security;
alter table app_private.pos_catalog_import_retirements force row level security;
revoke all on table app_private.pos_catalog_import_retirements from public, anon, authenticated, service_role;

create function app_private.pos_catalog_import_receipt_authorize_v1(
  p_shop_id uuid, p_shop_device_id uuid, p_staff_id uuid,
  p_pos_session_id uuid, p_owner_user_id uuid
) returns text language plpgsql volatile security definer
set search_path = public, app_private, pg_temp as $$
declare v_owner uuid;
begin
  if not app_private.pos_runtime_lease_is_valid_v1(p_shop_id, p_shop_device_id, p_staff_id, p_pos_session_id) then
    return 'auth_denied';
  end if;
  perform 1 from public.staff_accounts staff
  join public.staff_role_permissions permission on permission.shop_id = staff.shop_id
    and permission.role_key = staff.role_key and permission.enabled
  where staff.staff_id = p_staff_id and staff.shop_id = p_shop_id
    and permission.permission_key in ('catalog.import', 'shop_admin.full_access')
  limit 1 for share of permission;
  if not found then return 'auth_denied'; end if;
  v_owner := app_private.resolve_pos_catalog_import_owner_v1(p_shop_id, true);
  if v_owner is null then return 'not_configured'; end if;
  if p_owner_user_id is distinct from v_owner then return 'scope_changed'; end if;
  -- Unlike now(), the clock advances while an identity lock is awaited.
  if not exists (select 1 from public.pos_sessions session_row
    join public.pos_device_credentials credential on credential.pos_device_credential_id = session_row.pos_device_credential_id
    join public.staff_accounts staff on staff.staff_id = session_row.staff_id
    where session_row.pos_session_id = p_pos_session_id
      and session_row.expires_at > clock_timestamp() and credential.expires_at > clock_timestamp()
      and (staff.credential_expires_at is null or staff.credential_expires_at > clock_timestamp())) then
    return 'auth_denied';
  end if;
  return 'ok';
end;
$$;

-- Caller holds the same two transaction advisory locks as unchecked apply_v2.
-- No DML, row mutation, audit INSERT or apply call occurs in this lookup.
create function app_private.pos_catalog_import_receipt_locked_v1(
  p_shop_id uuid, p_shop_device_id uuid, p_client_import_id text,
  p_idempotency_key text, p_payload_hash text, p_owner_user_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path = public, app_private, pg_temp as $$
declare v_batch public.pos_catalog_import_batches%rowtype; v_retired app_private.pos_catalog_import_retirements%rowtype;
  v_binding jsonb := jsonb_build_object('ok', true, 'shopId', p_shop_id, 'shopDeviceId', p_shop_device_id,
    'clientImportId', p_client_import_id, 'idempotencyKey', p_idempotency_key, 'payloadHash', p_payload_hash);
begin
  if exists (select 1 from public.pos_catalog_import_batches b where b.shop_id = p_shop_id
    and b.shop_device_id = p_shop_device_id and (b.client_import_id = p_client_import_id or b.idempotency_key = p_idempotency_key)
    and (b.client_import_id <> p_client_import_id or b.idempotency_key <> p_idempotency_key or b.payload_hash <> p_payload_hash)) then
    return v_binding || jsonb_build_object('status', 'conflict', 'reason', 'identity_conflict');
  end if;
  select * into v_batch from public.pos_catalog_import_batches b where b.shop_id = p_shop_id
    and b.shop_device_id = p_shop_device_id and b.client_import_id = p_client_import_id and b.idempotency_key = p_idempotency_key;
  if found then
    if v_batch.status not in ('accepted', 'duplicate', 'idempotent') or v_batch.ack_response = '{}'::jsonb
      or v_batch.ack_response->>'ok' is distinct from 'true'
      or v_batch.ack_response->>'batchId' is distinct from v_batch.pos_catalog_import_batch_id::text
      or coalesce(v_batch.ack_response->>'status', '') not in ('accepted', 'duplicate', 'idempotent')
      or jsonb_typeof(v_batch.ack_response->'items') is distinct from 'array'
      or jsonb_typeof(v_batch.ack_response->'remoteProductIds') is distinct from 'array'
      or jsonb_typeof(v_batch.ack_response->'remotePriceIds') is distinct from 'array'
      or jsonb_typeof(v_batch.ack_response->'summary') is distinct from 'object' then
      return v_binding || jsonb_build_object('status', 'conflict', 'reason', 'receipt_unavailable');
    end if;
    return v_binding || jsonb_build_object('status', 'accepted', 'receipt', v_batch.ack_response,
      'currentProductSnapshots', (select coalesce(jsonb_agg(jsonb_build_object(
        'clientItemId', item->>'clientItemId', 'remoteProductId', item->>'remoteProductId',
        'snapshotStatus', case when product.id is null then 'unavailable' else 'available' end,
        'baseRevision', case when product.id is null then null else to_char(product.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,
        'retailPrice', product.retail_price, 'purchasePrice', product.purchase_price, 'stockQuantity', product.stock_quantity
      ) order by item->>'clientItemId'), '[]'::jsonb)
      from jsonb_array_elements(v_batch.ack_response->'remoteProductIds') item
      left join public.inventory_products product on product.id::text = item->>'remoteProductId'
        and product.deleted_at is null and (product.shop_id = p_shop_id
          or (product.shop_id is null and product.owner_user_id = p_owner_user_id))));
  end if;
  select * into v_retired from app_private.pos_catalog_import_retirements r where r.shop_id = p_shop_id
    and r.shop_device_id = p_shop_device_id and (r.client_import_id = p_client_import_id or r.idempotency_key = p_idempotency_key);
  if found then
    return v_binding || jsonb_build_object('status', 'conflict', 'reason',
      case when v_retired.client_import_id = p_client_import_id and v_retired.idempotency_key = p_idempotency_key
        and v_retired.payload_hash = p_payload_hash then 'identity_retired' else 'identity_conflict' end);
  end if;
  return v_binding || jsonb_build_object('status', 'not_found', 'snapshotOnly', true, 'replacementAllowed', false);
end;
$$;

create function public.pos_catalog_import_receipt_v1(
  p_shop_id uuid, p_shop_device_id uuid, p_staff_id uuid, p_pos_session_id uuid,
  p_owner_user_id uuid, p_client_import_id text, p_idempotency_key text, p_payload_hash text
) returns jsonb language plpgsql volatile security definer
set search_path = public, app_private, pg_temp as $$
declare v_auth text;
begin
  if p_client_import_id is null or length(p_client_import_id) not between 1 and 200
    or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 200
    or p_payload_hash is null or p_payload_hash !~ '^sha256:[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  v_auth := app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
  if v_auth <> 'ok' then return jsonb_build_object('ok', false, 'code', v_auth); end if;
  perform pg_advisory_xact_lock(hashtext(p_shop_id::text || ':' || p_shop_device_id::text), hashtext(p_client_import_id));
  perform pg_advisory_xact_lock(hashtext(p_shop_id::text || ':' || p_shop_device_id::text), hashtext(p_idempotency_key));
  v_auth := app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
  if v_auth <> 'ok' then return jsonb_build_object('ok', false, 'code', v_auth); end if;
  return app_private.pos_catalog_import_receipt_locked_v1(p_shop_id,p_shop_device_id,p_client_import_id,p_idempotency_key,p_payload_hash,p_owner_user_id);
end;
$$;

-- Retirement is a separate, explicit mutation of the private identity fence.
-- Existing incomplete/failed imports cannot be retired or interpreted as absent.
create function public.pos_catalog_import_retire_v1(
  p_shop_id uuid, p_shop_device_id uuid, p_staff_id uuid, p_pos_session_id uuid,
  p_owner_user_id uuid, p_client_import_id text, p_idempotency_key text, p_payload_hash text
) returns jsonb language plpgsql volatile security definer
set search_path = public, app_private, pg_temp as $$
declare v_result jsonb; v_retired_at timestamptz;
begin
  v_result := public.pos_catalog_import_receipt_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,
    p_owner_user_id,p_client_import_id,p_idempotency_key,p_payload_hash);
  if v_result->>'ok' is distinct from 'true' or v_result->>'status' = 'accepted' then return v_result; end if;
  if v_result->>'status' = 'not_found' then
    insert into app_private.pos_catalog_import_retirements(shop_id,shop_device_id,client_import_id,idempotency_key,payload_hash,staff_id,pos_session_id)
    values(p_shop_id,p_shop_device_id,p_client_import_id,p_idempotency_key,p_payload_hash,p_staff_id,p_pos_session_id)
    returning retired_at into v_retired_at;
  elsif v_result->>'reason' = 'identity_retired' then
    select retired_at into v_retired_at from app_private.pos_catalog_import_retirements where shop_id = p_shop_id
      and shop_device_id = p_shop_device_id and client_import_id = p_client_import_id and idempotency_key = p_idempotency_key and payload_hash = p_payload_hash;
  else return v_result; end if;
  return (v_result - 'reason' - 'snapshotOnly' - 'replacementAllowed') ||
    jsonb_build_object('status','retired','retiredAt',v_retired_at,'oldIdentityBlocked',true);
end;
$$;

-- Preserve the exact previous transactional implementation behind the fence.
alter function public.pos_catalog_import_apply_v2(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz,jsonb,jsonb,jsonb)
  set schema app_private;
alter function app_private.pos_catalog_import_apply_v2(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz,jsonb,jsonb,jsonb)
  rename to pos_catalog_import_apply_pre_retirement_v2;
revoke all on function app_private.pos_catalog_import_apply_pre_retirement_v2(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz,jsonb,jsonb,jsonb)
  from public, anon, authenticated, service_role;

create function public.pos_catalog_import_apply_v2(
  p_shop_id uuid,p_shop_device_id uuid,p_staff_id uuid,p_pos_session_id uuid,p_owner_user_id uuid,
  p_client_import_id text,p_idempotency_key text,p_payload_hash text,p_schema_version text,p_source text,
  p_batch_created_at timestamptz,p_items jsonb,p_summary jsonb default '{}'::jsonb,p_metadata_redacted jsonb default '{}'::jsonb
) returns jsonb language plpgsql volatile security definer
set search_path = public, app_private, pg_temp as $$
declare v_auth text;
begin
  v_auth := app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
  if v_auth <> 'ok' then return jsonb_build_object('ok',false,'code',v_auth); end if;
  perform pg_advisory_xact_lock(hashtext(p_shop_id::text || ':' || p_shop_device_id::text),hashtext(p_client_import_id));
  perform pg_advisory_xact_lock(hashtext(p_shop_id::text || ':' || p_shop_device_id::text),hashtext(p_idempotency_key));
  v_auth := app_private.pos_catalog_import_receipt_authorize_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id);
  if v_auth <> 'ok' then return jsonb_build_object('ok',false,'code',v_auth); end if;
  if exists(select 1 from app_private.pos_catalog_import_retirements r where r.shop_id = p_shop_id and r.shop_device_id = p_shop_device_id
    and (r.client_import_id = p_client_import_id or r.idempotency_key = p_idempotency_key)) then
    return jsonb_build_object('ok',false,'code','conflict','reason','identity_retired');
  end if;
  return app_private.pos_catalog_import_apply_pre_retirement_v2(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_owner_user_id,
    p_client_import_id,p_idempotency_key,p_payload_hash,p_schema_version,p_source,p_batch_created_at,p_items,p_summary,p_metadata_redacted);
end;
$$;

revoke all on function app_private.pos_catalog_import_receipt_authorize_v1(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function app_private.pos_catalog_import_receipt_locked_v1(uuid,uuid,text,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.pos_catalog_import_receipt_v1(uuid,uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.pos_catalog_import_retire_v1(uuid,uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.pos_catalog_import_apply_v2(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.pos_catalog_import_receipt_v1(uuid,uuid,uuid,uuid,uuid,text,text,text) to service_role;
grant execute on function public.pos_catalog_import_retire_v1(uuid,uuid,uuid,uuid,uuid,text,text,text) to service_role;
grant execute on function public.pos_catalog_import_apply_v2(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz,jsonb,jsonb,jsonb) to service_role;
-- Legacy direct apply is internal only: callers must pass the retirement fence.
revoke all on function public.pos_catalog_import_apply_v1(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz,jsonb,jsonb,jsonb)
  from public, anon, authenticated, service_role;
commit;
