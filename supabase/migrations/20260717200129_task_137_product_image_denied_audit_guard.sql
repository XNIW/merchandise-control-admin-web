-- TASK-137: prevent denied product-image requests from writing cross-shop audit rows.

begin;

-- The server actor resolver reads these relations through the service-role
-- client. Fresh local resets do not provide those SELECT grants implicitly.
-- Keep the grant read-only; all product-image writes remain RPC-only.
grant select on table
  public.profiles,
  public.shops,
  public.shop_members,
  public.platform_admins
to service_role;

create or replace function public.product_image_record_denied(
  p_actor_profile_id uuid,
  p_actor_kind text,
  p_shop_id uuid,
  p_product_id uuid,
  p_operation text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_operation text := lower(coalesce(p_operation, 'request'));
  v_code text := lower(coalesce(p_code, 'permission_denied'));
  v_audit_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  if not exists (
    select 1
    from public.shops shop
    where shop.shop_id = p_shop_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- A caller-supplied shop becomes an audit scope only after the database has
  -- rebound it to an active actor relationship. Read-level membership is the
  -- narrowest existing guard that preserves useful same-shop viewer denials.
  if not app_private.product_image_actor_can_read(
    p_actor_profile_id => p_actor_profile_id,
    p_shop_id => p_shop_id,
    p_actor_kind => p_actor_kind
  ) then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  if not app_private.product_image_product_is_in_shop(
    p_product_id => p_product_id,
    p_shop_id => p_shop_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_operation not in ('intent', 'finalize', 'read', 'remove', 'request') then
    v_operation := 'request';
  end if;
  if v_code !~ '^[a-z0-9_]{1,64}$' then
    v_code := 'permission_denied';
  end if;

  v_audit_id := app_private.write_product_image_audit(
    p_actor_profile_id,
    p_shop_id,
    'shop.product_image.' || v_operation || '_denied',
    'warning',
    'blocked',
    p_product_id,
    null,
    v_code,
    case when p_actor_kind in ('personal_account', 'platform_admin')
      then p_actor_kind else 'personal_account' end
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'denied_recorded',
    'audit_event_id', v_audit_id
  );
end;
$$;

revoke all on function public.product_image_record_denied(
  uuid, text, uuid, uuid, text, text
) from public, anon, authenticated;

grant execute on function public.product_image_record_denied(
  uuid, text, uuid, uuid, text, text
) to service_role;

notify pgrst, 'reload schema';

commit;
