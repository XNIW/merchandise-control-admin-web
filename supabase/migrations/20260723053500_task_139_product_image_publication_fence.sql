-- TASK-139: revalidate image capability publication after Storage signing.

begin;

create or replace function public.product_image_revalidate_access_v1(
  p_actor_profile_id uuid,
  p_actor_kind text,
  p_shop_id uuid,
  p_permission text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if p_actor_profile_id is null
    or p_shop_id is null
    or p_actor_kind not in ('personal_account', 'platform_admin')
    or p_permission not in ('read', 'write') then
    return false;
  end if;

  perform 1
  from public.profiles profile
  where profile.profile_id = p_actor_profile_id
  for share;
  if not found then return false; end if;

  perform 1
  from public.shops shop
  where shop.shop_id = p_shop_id
  for share;
  if not found then return false; end if;

  if p_actor_kind = 'personal_account' then
    perform 1
    from public.shop_members member
    where member.profile_id = p_actor_profile_id
      and member.shop_id = p_shop_id
    for share;
    if not found then return false; end if;
  else
    perform 1
    from public.platform_admins platform_admin
    where platform_admin.profile_id = p_actor_profile_id
    for share;
    if not found then return false; end if;
  end if;

  return case
    when p_permission = 'write' then
      app_private.product_image_actor_can_write(
        p_actor_profile_id, p_shop_id, p_actor_kind
      )
    else
      app_private.product_image_actor_can_read(
        p_actor_profile_id, p_shop_id, p_actor_kind
      )
  end;
end;
$$;

revoke all on function public.product_image_revalidate_access_v1(
  uuid, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.product_image_revalidate_access_v1(
  uuid, text, uuid, text
) to service_role;

commit;
