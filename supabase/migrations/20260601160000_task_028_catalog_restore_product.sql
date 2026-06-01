begin;

create or replace function public.inventory_catalog_block_update_when_tombstoned()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    if old.deleted_at is not null
        and current_setting('app.catalog_restore_allowed', true) <> 'true' then
        return old;
    end if;

    return new;
end;
$$;

create or replace function public.set_inventory_catalog_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    if old.deleted_at is not null
        and current_setting('app.catalog_restore_allowed', true) <> 'true' then
        return old;
    end if;

    new.updated_at = statement_timestamp();
    return new;
end;
$$;

create or replace function public.shop_catalog_restore_product(
  p_shop_id uuid,
  p_product_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_owner uuid := app_private.resolve_shop_inventory_owner(p_shop_id);
  audit_event_id uuid;
begin
  if v_owner is null then
    return app_private.shop_admin_action_result(false, 'unauthorized_or_unmapped', p_shop_id, p_product_id::text);
  end if;

  perform set_config('app.catalog_restore_allowed', 'true', true);

  update public.inventory_products
  set deleted_at = null,
      updated_at = now()
  where id = p_product_id
    and owner_user_id = v_owner
    and deleted_at is not null;

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_product_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.catalog.product.restore.success', 'info', 'success',
    'product', p_product_id::text, 'success',
    jsonb_build_object('reason_redacted', nullif(left(app_private.normalize_admin_label(p_reason), 160), ''))
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_product_id::text, audit_event_id);
exception
  when unique_violation then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.product.restore.failure', 'warning', 'blocked',
      'product', p_product_id::text, 'conflict', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'conflict', p_shop_id, p_product_id::text, audit_event_id);
  when others then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.catalog.product.restore.failure', 'critical', 'failure',
      'product', p_product_id::text, 'db_failure', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'db_failure', p_shop_id, p_product_id::text, audit_event_id);
end;
$$;

revoke all on function public.shop_catalog_restore_product(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.shop_catalog_restore_product(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
