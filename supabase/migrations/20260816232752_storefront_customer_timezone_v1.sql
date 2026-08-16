-- TASK-036: bounded public shop timezone contract for deterministic customer
-- date/time rendering. The value was already public in storefront_home_v1;
-- this narrow RPC avoids coupling checkout and order history to Home payloads.

begin;

create or replace function public.storefront_time_zone_v1(
  p_shop_slug text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_time_zone text;
begin
  if p_shop_slug is null
    or p_shop_slug <> pg_catalog.lower(pg_catalog.btrim(p_shop_slug))
    or p_shop_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$' then
    return pg_catalog.jsonb_build_object(
      'apiVersion', 'storefront-time-zone.v1',
      'status', 'invalid',
      'serverTime', v_now
    );
  end if;

  select setting.catalog_time_zone
  into v_time_zone
  from public.storefront_settings setting
  where setting.public_slug = p_shop_slug
    and setting.storefront_enabled;

  if not found then
    return pg_catalog.jsonb_build_object(
      'apiVersion', 'storefront-time-zone.v1',
      'status', 'unavailable',
      'serverTime', v_now
    );
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names zone
    where zone.name = v_time_zone
  ) then
    return pg_catalog.jsonb_build_object(
      'apiVersion', 'storefront-time-zone.v1',
      'status', 'invalid',
      'serverTime', v_now
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'apiVersion', 'storefront-time-zone.v1',
    'status', 'ok',
    'shopSlug', p_shop_slug,
    'timeZone', v_time_zone,
    'serverTime', v_now
  );
end;
$$;

revoke all on function public.storefront_time_zone_v1(text)
  from public, anon, authenticated, service_role;
grant execute on function public.storefront_time_zone_v1(text)
  to anon, authenticated;

comment on function public.storefront_time_zone_v1(text) is
  'Returns only the validated public IANA timezone for an enabled Storefront.';

notify pgrst, 'reload schema';

commit;
