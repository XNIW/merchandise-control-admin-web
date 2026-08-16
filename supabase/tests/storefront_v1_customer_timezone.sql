begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

select has_function(
  'public',
  'storefront_time_zone_v1',
  array['text'],
  'TASK-036 installs the bounded public shop timezone RPC'
);

select ok(
  (
    select procedure.prosecdef
      and procedure.provolatile = 's'
      and 'search_path=""' = any(procedure.proconfig)
      and 'statement_timeout=2s' = any(procedure.proconfig)
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'storefront_time_zone_v1'
  ),
  'timezone RPC is a bounded stable definer with closed search_path'
);

select ok(
  has_function_privilege(
    'anon', 'public.storefront_time_zone_v1(text)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.storefront_time_zone_v1(text)', 'EXECUTE'
  ),
  'only customer-facing roles receive the public timezone capability'
);

select is(
  (
    select pg_catalog.array_agg(argument.name order by argument.ordinality)
    from pg_catalog.pg_proc procedure
    cross join lateral pg_catalog.unnest(procedure.proargnames)
      with ordinality as argument(name, ordinality)
    where procedure.oid = 'public.storefront_time_zone_v1(text)'::regprocedure
  ),
  array['p_shop_slug'],
  'timezone RPC accepts only the public shop slug'
);

select is(
  public.storefront_time_zone_v1('INVALID') ->> 'status',
  'invalid',
  'invalid slugs fail closed'
);

select is(
  public.storefront_time_zone_v1('task036-missing') ->> 'status',
  'unavailable',
  'unknown shops fail closed without exposing lookup details'
);

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '16000000-0000-4000-8000-000000036001',
  'T036TZ',
  'TASK-036 timezone fixture',
  'active'
);

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, catalog_time_zone
)
values (
  '16000000-0000-4000-8000-000000036001',
  'task036-timezone',
  true,
  'America/Santiago'
);

select is(
  public.storefront_time_zone_v1('task036-timezone') ->> 'timeZone',
  'America/Santiago',
  'enabled Storefront returns its validated IANA timezone'
);

select is(
  (
    select pg_catalog.array_agg(key order by key)
    from pg_catalog.jsonb_object_keys(
      public.storefront_time_zone_v1('task036-timezone')
    ) key
  ),
  array['apiVersion', 'serverTime', 'shopSlug', 'status', 'timeZone'],
  'success payload exposes only the bounded public contract'
);

update public.storefront_settings
set catalog_time_zone = 'UTC'
where public_slug = 'task036-timezone';

select is(
  public.storefront_time_zone_v1('task036-timezone') ->> 'timeZone',
  'UTC',
  'UTC Storefront configuration remains explicit and supported'
);

update public.storefront_settings
set storefront_enabled = false
where public_slug = 'task036-timezone';

select is(
  public.storefront_time_zone_v1('task036-timezone') ->> 'status',
  'unavailable',
  'disabled Storefront does not expose configuration'
);

select * from finish();

rollback;
