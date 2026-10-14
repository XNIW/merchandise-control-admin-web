begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

select has_table('app_private'::name, 'wechat_auth_challenges'::name);
select has_function('public', 'wechat_auth_challenge_issue_v1', array[
  'text', 'text', 'text', 'text', 'text', 'text', 'uuid', 'integer'
]);
select has_function('public', 'wechat_auth_challenge_consume_v1', array[
  'text', 'text', 'text', 'text', 'text', 'text', 'uuid'
]);
select has_function('public', 'wechat_authorized_shops_v1', array[]::text[]);
select has_function('public', 'wechat_daily_sales_summary_v1', array['uuid', 'date']);
select has_function('public', 'wechat_daily_sales_page_v1', array[
  'uuid', 'date', 'integer', 'timestamp with time zone', 'uuid'
]);
select has_function('public', 'wechat_sale_detail_v1', array['uuid', 'uuid']);

select function_privs_are(
  'public',
  'wechat_authorized_shops_v1',
  array[]::text[],
  'authenticated',
  array['EXECUTE']
);
select function_privs_are(
  'public',
  'wechat_daily_sales_summary_v1',
  array['uuid', 'date'],
  'authenticated',
  array['EXECUTE']
);
select function_privs_are(
  'public',
  'wechat_auth_challenge_issue_v1',
  array['text', 'text', 'text', 'text', 'text', 'text', 'uuid', 'integer'],
  'authenticated',
  array[]::text[]
);

insert into auth.users (
  instance_id, id, aud, role, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000201',
    'authenticated', 'authenticated',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000202',
    'authenticated', 'authenticated',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

update public.profiles
set display_name = case profile_id
    when '00000000-0000-4000-8000-000000000201' then 'WeChat test member'
    else 'WeChat other member'
  end,
  profile_status = 'active'
where profile_id in (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000202'
);

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values
  ('10000000-0000-4000-8000-000000000201', 'WECHAT201', 'WeChat Shop A', 'active'),
  ('10000000-0000-4000-8000-000000000202', 'WECHAT202', 'WeChat Shop B', 'active');

insert into public.storefront_settings (
  shop_id, public_slug, currency_code, catalog_time_zone
) values
  ('10000000-0000-4000-8000-000000000201', 'wechat-shop-a', 'CLP', 'America/Santiago'),
  ('10000000-0000-4000-8000-000000000202', 'wechat-shop-b', 'CLP', 'UTC');

insert into public.shop_members (
  profile_id, shop_id, role_key, membership_status
) values
  (
    '00000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000201',
    'viewer', 'active'
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '10000000-0000-4000-8000-000000000202',
    'shop_owner', 'active'
  );

select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$select public.wechat_auth_challenge_issue_v1(
    repeat('a', 64), repeat('b', 64), 'mini_program', 'login',
    repeat('c', 64), repeat('d', 64),
    '90000000-0000-4000-8000-000000000201', 300
  )$$,
  'service role can issue a bounded challenge'
);

select ok(
  public.wechat_auth_challenge_consume_v1(
    repeat('a', 64), repeat('b', 64), 'mini_program', 'login',
    repeat('c', 64), repeat('d', 64),
    '90000000-0000-4000-8000-000000000201'
  ),
  'matching challenge is consumed once'
);

select is(
  public.wechat_auth_challenge_consume_v1(
    repeat('a', 64), repeat('b', 64), 'mini_program', 'login',
    repeat('c', 64), repeat('d', 64),
    '90000000-0000-4000-8000-000000000201'
  ),
  false,
  'challenge replay is rejected'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000201',
  true
);

select is(
  (select count(*)::integer from public.wechat_authorized_shops_v1()),
  1,
  'active viewer sees exactly the linked active shop'
);
select is(
  (select shop_id from public.wechat_authorized_shops_v1()),
  '10000000-0000-4000-8000-000000000201'::uuid,
  'authorized shop list cannot include another shop'
);
select is(
  (select time_zone from public.wechat_authorized_shops_v1()),
  'America/Santiago',
  'authorized shop returns configured timezone'
);
select is(
  (
    select count(*)::integer
    from public.wechat_daily_sales_summary_v1(
      '10000000-0000-4000-8000-000000000201', current_date
    )
  ),
  1,
  'viewer can read an empty summary for the linked shop'
);
select is(
  (
    select net_revenue_clp
    from public.wechat_daily_sales_summary_v1(
      '10000000-0000-4000-8000-000000000201', current_date
    )
  ),
  0::bigint,
  'empty daily summary reports zero net revenue'
);
select is(
  (
    select count(*)::integer
    from public.wechat_daily_sales_summary_v1(
      '10000000-0000-4000-8000-000000000202', current_date
    )
  ),
  0,
  'shop A user cannot read shop B summary'
);
select is(
  (
    select count(*)::integer
    from public.wechat_daily_sales_page_v1(
      '10000000-0000-4000-8000-000000000202', current_date, 50, null, null
    )
  ),
  0,
  'shop A user cannot page shop B sales'
);
select throws_ok(
  $$select * from public.wechat_daily_sales_page_v1(
    '10000000-0000-4000-8000-000000000201', current_date, 101, null, null
  )$$,
  '22023',
  'sales_page_invalid',
  'unbounded page size fails closed'
);
select throws_ok(
  $$select * from public.wechat_daily_sales_page_v1(
    '10000000-0000-4000-8000-000000000201', current_date,
    null, null, null
  )$$,
  '22023', 'sales_page_invalid',
  'explicit NULL page size fails closed'
);

update public.profiles
set profile_status = 'disabled', disabled_at = now()
where profile_id = '00000000-0000-4000-8000-000000000201';

select is(
  (select count(*)::integer from public.wechat_authorized_shops_v1()),
  0,
  'disabled personal account sees no shops immediately'
);

update public.profiles
set profile_status = 'active', disabled_at = null
where profile_id = '00000000-0000-4000-8000-000000000201';
update public.shop_members
set membership_status = 'suspended', suspended_at = now()
where profile_id = '00000000-0000-4000-8000-000000000201';

select is(
  (select count(*)::integer from public.wechat_authorized_shops_v1()),
  0,
  'removed or suspended membership denies reads without a new login'
);

update public.shop_members
set membership_status = 'active', suspended_at = null
where profile_id = '00000000-0000-4000-8000-000000000201';
update public.shops
set shop_status = 'suspended',
  suspended_at = now(),
  suspended_by_profile_id = '00000000-0000-4000-8000-000000000202'
where shop_id = '10000000-0000-4000-8000-000000000201';

select is(
  (select count(*)::integer from public.wechat_authorized_shops_v1()),
  0,
  'suspended shop is denied immediately'
);

select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);

select is(
  (select count(*)::integer from public.wechat_authorized_shops_v1()),
  0,
  'anonymous caller sees no shops'
);
select is(
  (
    select count(*)::integer
    from public.wechat_daily_sales_summary_v1(
      '10000000-0000-4000-8000-000000000202', current_date
    )
  ),
  0,
  'anonymous caller sees no sales summary'
);

select * from finish();
rollback;
