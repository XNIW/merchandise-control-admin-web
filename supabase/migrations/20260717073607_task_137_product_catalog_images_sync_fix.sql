-- TASK-137 append-only lint fix.
-- PostgreSQL cannot infer the historical partial unique index through the
-- ON CONFLICT target used in the first migration on every supported local
-- version. Preserve idempotency with the repository's reviewed
-- unique_violation pattern instead.

begin;

create or replace function app_private.emit_product_image_sync_event(
  p_shop_id uuid,
  p_product_id uuid,
  p_version_id uuid,
  p_operation text,
  p_actor_kind text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_user_id uuid;
  v_event_id bigint;
  v_client_event_id text;
  v_catalog_scope text;
begin
  select product.owner_user_id,
    case when product.shop_id is null then 'legacy_owner_bridge' else 'shop_scoped' end
  into v_owner_user_id, v_catalog_scope
  from public.inventory_products product
  where product.id = p_product_id;

  if v_owner_user_id is null then
    raise exception 'product_image_sync_product_missing' using errcode = 'P0002';
  end if;

  v_client_event_id := left(
    'product_image:' || p_operation || ':' || p_product_id::text || ':' || p_version_id::text,
    160
  );

  begin
    insert into public.sync_events (
      changed_count,
      client_event_id,
      domain,
      entity_ids,
      event_type,
      metadata,
      owner_user_id,
      shop_id,
      source,
      source_device_id
    )
    values (
      1,
      v_client_event_id,
      'catalog',
      jsonb_build_object('product_ids', jsonb_build_array(p_product_id)),
      'catalog_changed',
      jsonb_build_object(
        'actor_kind', p_actor_kind,
        'atomic_rpc', true,
        'catalog_scope', v_catalog_scope,
        'entity_type', 'product',
        'operation', p_operation,
        'payload_version', 1,
        'source', 'product_image_api',
        'status', 'success'
      ),
      v_owner_user_id,
      p_shop_id,
      'product_image_api',
      null
    )
    returning id into v_event_id;
  exception
    when unique_violation then
      select event.id into v_event_id
      from public.sync_events event
      where event.owner_user_id = v_owner_user_id
        and event.client_event_id = v_client_event_id;
  end;

  return v_event_id;
end;
$$;

revoke all on function app_private.emit_product_image_sync_event(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
