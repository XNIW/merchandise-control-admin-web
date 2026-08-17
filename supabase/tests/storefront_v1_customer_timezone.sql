begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

select ok(
  to_regprocedure('public.storefront_fulfillment_options_v1(text)') is not null
  and to_regprocedure(
    'public.customer_order_list_v1(text,integer,timestamptz,uuid)'
  ) is not null
  and to_regprocedure('public.customer_order_detail_v1(text,uuid)') is not null
  and to_regprocedure(
    'public.customer_order_cancel_v1(text,uuid,bigint,uuid)'
  ) is not null,
  'TASK-036 keeps all canonical public commerce RPC signatures'
);

select ok(
  to_regprocedure(
    'app_private.storefront_fulfillment_options_v1(text)'
  ) is not null
  and to_regprocedure(
    'app_private.customer_order_list_v1(text,integer,timestamptz,uuid)'
  ) is not null
  and to_regprocedure(
    'app_private.customer_order_detail_v1(text,uuid)'
  ) is not null
  and to_regprocedure(
    'app_private.customer_order_cancel_v1(text,uuid,bigint,uuid)'
  ) is not null,
  'original implementations are delegated behind app_private'
);

select ok(
  not exists (
    select 1
    from (
      values ('anon'), ('authenticated'), ('service_role')
    ) as api_role(role_name)
    cross join (
      values
        ('app_private.storefront_fulfillment_options_v1(text)'),
        ('app_private.customer_order_list_v1(text,integer,timestamptz,uuid)'),
        ('app_private.customer_order_detail_v1(text,uuid)'),
        ('app_private.customer_order_cancel_v1(text,uuid,bigint,uuid)')
    ) as delegated(function_signature)
    where has_function_privilege(
      api_role.role_name,
      delegated.function_signature,
      'EXECUTE'
    )
  ),
  'delegated implementations are not directly executable by API roles'
);

select ok(
  (
    select pg_catalog.bool_and(
      procedure.prosecdef
      and 'search_path=""' = any(procedure.proconfig)
      and procedure.provolatile = case
        when procedure.proname = 'customer_order_cancel_v1' then 'v'::"char"
        else 's'::"char"
      end
    )
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'storefront_fulfillment_options_v1',
        'customer_order_list_v1',
        'customer_order_detail_v1',
        'customer_order_cancel_v1'
      )
  ),
  'public wrappers preserve hardened volatility and closed search_path'
);

select ok(
  has_function_privilege(
    'anon', 'public.storefront_fulfillment_options_v1(text)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.customer_order_list_v1(text,integer,timestamptz,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.customer_order_list_v1(text,integer,timestamptz,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.customer_order_detail_v1(text,uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.customer_order_cancel_v1(text,uuid,bigint,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.customer_order_detail_v1(text,uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.customer_order_cancel_v1(text,uuid,bigint,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.storefront_fulfillment_options_v1(text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.customer_order_list_v1(text,integer,timestamptz,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.customer_order_detail_v1(text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.customer_order_cancel_v1(text,uuid,bigint,uuid)',
    'EXECUTE'
  ),
  'public wrappers preserve least-authority grants'
);

select is(
  public.storefront_fulfillment_options_v1('INVALID') ->> 'status',
  'invalid',
  'invalid requests remain minimal and fail closed'
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
  public.storefront_fulfillment_options_v1('task036-timezone')
    ->> 'timeZone',
  'America/Santiago',
  'fulfillment success includes the canonical IANA timezone'
);

select ok(
  (
    select pg_catalog.array_agg(key order by key)
    from pg_catalog.jsonb_object_keys(
      public.storefront_fulfillment_options_v1('task036-timezone')
    ) key
  ) @> array['apiVersion', 'serverTime', 'shopSlug', 'status', 'timeZone'],
  'fulfillment timezone is part of the same public payload'
);

update public.storefront_settings
set catalog_time_zone = 'Mars/Olympus'
where public_slug = 'task036-timezone';

select throws_ok(
  $$select public.storefront_fulfillment_options_v1('task036-timezone')$$,
  '22023',
  'invalid storefront time zone configuration',
  'invalid server timezone configuration fails closed'
);

update public.storefront_settings
set catalog_time_zone = 'UTC'
where public_slug = 'task036-timezone';

select is(
  public.storefront_fulfillment_options_v1('task036-timezone')
    ->> 'timeZone',
  'UTC',
  'a later commerce snapshot observes a timezone configuration change'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '16000000-0000-4000-8000-000000036002',
  'authenticated',
  'authenticated',
  'task036-customer@example.invalid',
  '{"provider":"google","providers":["google"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"16000000-0000-4000-8000-000000036002","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '16000000-0000-4000-8000-000000036002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.customer_order_list_v1(
    'task036-timezone', 20, null, null
  ) ->> 'timeZone',
  'UTC',
  'order list includes timezone in the same owner-scoped snapshot'
);

select ok(
  public.customer_order_list_v1(
    'task036-timezone', 20, null, null
  ) ?& array[
    'apiVersion', 'serverTime', 'shopSlug', 'status', 'orders',
    'hasMore', 'timeZone'
  ],
  'order list returns its complete atomic contract'
);

set local role postgres;
update public.storefront_settings
set catalog_time_zone = 'America/Santiago'
where public_slug = 'task036-timezone';
set local role authenticated;

select is(
  public.customer_order_list_v1(
    'task036-timezone', 20, null, null
  ) ->> 'timeZone',
  'America/Santiago',
  'order snapshots do not retain a process-lifetime timezone cache'
);

select * from finish();

rollback;
