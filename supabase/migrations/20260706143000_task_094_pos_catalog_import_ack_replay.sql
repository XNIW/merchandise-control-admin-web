-- TASK-094 hardening - durable POS catalog import ACK replay.
-- Additive because TASK-094 v1 migrations may already be applied on staging.

begin;

alter table public.pos_catalog_import_batches
  add column if not exists ack_response jsonb not null default '{}'::jsonb;

do $$
begin
  alter table public.pos_catalog_import_batches
    add constraint pos_catalog_import_batches_ack_response_object_check
    check (jsonb_typeof(ack_response) = 'object');
exception
  when duplicate_object then
    null;
end;
$$;

create or replace function public.pos_catalog_import_apply_v2(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_owner_user_id uuid,
  p_client_import_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_schema_version text,
  p_source text,
  p_batch_created_at timestamptz,
  p_items jsonb,
  p_summary jsonb default '{}'::jsonb,
  p_metadata_redacted jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.pos_catalog_import_batches%rowtype;
  v_result jsonb;
  v_batch_id uuid;
  v_duplicate_count integer;
begin
  if p_schema_version <> 'pos-catalog-import-v1'
    or p_source <> 'supplier_excel'
    or p_client_import_id is null
    or btrim(p_client_import_id) = ''
    or p_idempotency_key is null
    or btrim(p_idempotency_key) = ''
    or p_payload_hash is null
    or btrim(p_payload_hash) = ''
    or jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_shop_id::text || ':' || p_shop_device_id::text),
    hashtext(p_client_import_id)
  );
  perform pg_advisory_xact_lock(
    hashtext(p_shop_id::text || ':' || p_shop_device_id::text),
    hashtext(p_idempotency_key)
  );

  select *
  into v_existing
  from public.pos_catalog_import_batches
  where shop_id = p_shop_id
    and shop_device_id = p_shop_device_id
    and (
      client_import_id = p_client_import_id
      or idempotency_key = p_idempotency_key
    )
  order by received_at asc
  limit 1
  for update;

  if found then
    if v_existing.client_import_id <> p_client_import_id
      or v_existing.idempotency_key <> p_idempotency_key
      or v_existing.payload_hash <> p_payload_hash then
      insert into public.audit_logs (
        actor_profile_id,
        actor_staff_id,
        event_key,
        metadata_redacted,
        result,
        scope,
        severity,
        shop_id,
        target_id,
        target_type
      )
      values (
        null,
        p_staff_id,
        'pos.catalog.import_sync.failure',
        coalesce(p_metadata_redacted, '{}'::jsonb) || jsonb_build_object('code', 'conflict', 'item_count', jsonb_array_length(p_items)),
        'blocked',
        'shop',
        'warning',
        p_shop_id,
        v_existing.pos_catalog_import_batch_id::text,
        'pos_catalog_import_batch'
      );

      return jsonb_build_object('ok', false, 'code', 'conflict');
    end if;

    if v_existing.status in ('accepted', 'duplicate', 'idempotent')
      and coalesce(v_existing.ack_response, '{}'::jsonb) <> '{}'::jsonb then
      v_duplicate_count := greatest(v_existing.accepted_item_count, v_existing.product_count, 0);
      return jsonb_set(
        jsonb_set(
          v_existing.ack_response,
          '{status}',
          to_jsonb('duplicate'::text),
          true
        ),
        '{summary}',
        jsonb_build_object(
          'acceptedItemCount', 0,
          'duplicateItemCount', v_duplicate_count,
          'productCount', v_duplicate_count
        ),
        true
      );
    end if;
  end if;

  v_result := public.pos_catalog_import_apply_v1(
    p_shop_id,
    p_shop_device_id,
    p_staff_id,
    p_pos_session_id,
    p_owner_user_id,
    p_client_import_id,
    p_idempotency_key,
    p_payload_hash,
    p_schema_version,
    p_source,
    p_batch_created_at,
    p_items,
    p_summary,
    p_metadata_redacted
  );

  if coalesce(v_result->>'ok', 'false') = 'true' then
    v_batch_id := nullif(v_result->>'batchId', '')::uuid;
    if v_batch_id is not null then
      update public.pos_catalog_import_batches
      set ack_response = v_result,
          updated_at = now()
      where pos_catalog_import_batch_id = v_batch_id
        and client_import_id = p_client_import_id
        and idempotency_key = p_idempotency_key;
    end if;
  end if;

  return v_result;
end;
$$;

revoke all on function public.pos_catalog_import_apply_v2(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  jsonb,
  jsonb,
  jsonb
) from public, anon, authenticated;

grant execute on function public.pos_catalog_import_apply_v2(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  jsonb,
  jsonb,
  jsonb
) to service_role;

commit;
