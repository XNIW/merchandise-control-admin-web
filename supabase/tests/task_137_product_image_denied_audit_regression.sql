begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(32);

select ok(
  has_table_privilege('service_role', 'public.profiles', 'SELECT'),
  'service-role resolver can read profiles after a fresh reset'
);
select ok(
  has_table_privilege('service_role', 'public.shops', 'SELECT'),
  'service-role resolver can read shops after a fresh reset'
);
select ok(
  has_table_privilege('service_role', 'public.shop_members', 'SELECT'),
  'service-role resolver can read shop memberships after a fresh reset'
);
select ok(
  has_table_privilege('service_role', 'public.platform_admins', 'SELECT'),
  'service-role resolver can read platform-admin status after a fresh reset'
);
select ok(
  not has_table_privilege('service_role', 'public.profiles', 'INSERT')
    and not has_table_privilege('service_role', 'public.profiles', 'UPDATE')
    and not has_table_privilege('service_role', 'public.profiles', 'DELETE'),
  'service-role resolver grant does not add profile DML'
);
select ok(
  not has_table_privilege('service_role', 'public.shops', 'INSERT')
    and not has_table_privilege('service_role', 'public.shops', 'UPDATE')
    and not has_table_privilege('service_role', 'public.shops', 'DELETE'),
  'service-role resolver grant does not add shop DML'
);
select ok(
  not has_table_privilege('service_role', 'public.shop_members', 'INSERT')
    and not has_table_privilege('service_role', 'public.shop_members', 'UPDATE')
    and not has_table_privilege('service_role', 'public.shop_members', 'DELETE'),
  'service-role resolver grant does not add membership DML'
);
select ok(
  not has_table_privilege('service_role', 'public.platform_admins', 'INSERT')
    and not has_table_privilege('service_role', 'public.platform_admins', 'UPDATE')
    and not has_table_privilege('service_role', 'public.platform_admins', 'DELETE'),
  'service-role resolver grant does not add platform-admin DML'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.product_image_record_denied(uuid,text,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  'service_role retains execute on the central denied-audit RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.product_image_record_denied(uuid,text,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  'authenticated cannot execute the denied-audit RPC directly'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.product_image_record_denied(uuid,text,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  'anon cannot execute the denied-audit RPC directly'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009137','authenticated','authenticated','task137-regression-attacker@example.invalid','{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009237','authenticated','authenticated','task137-regression-victim@example.invalid','{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009337','authenticated','authenticated','task137-regression-viewer@example.invalid','{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009437','authenticated','authenticated','task137-regression-cashier@example.invalid','{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009537','authenticated','authenticated','task137-regression-suspended@example.invalid','{}','{}',now(),now());

insert into public.profiles (profile_id, display_name, profile_status)
values
  ('00000000-0000-4000-8000-000000009137','TASK-137 regression attacker','active'),
  ('00000000-0000-4000-8000-000000009237','TASK-137 regression victim','active'),
  ('00000000-0000-4000-8000-000000009337','TASK-137 regression viewer','active'),
  ('00000000-0000-4000-8000-000000009437','TASK-137 regression cashier','active'),
  ('00000000-0000-4000-8000-000000009537','TASK-137 regression suspended','active')
on conflict (profile_id) do update
set display_name = excluded.display_name,
    profile_status = excluded.profile_status;

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values
  ('10000000-0000-4000-8000-000000009137','T137RGA','TASK-137 regression shop A','active'),
  ('10000000-0000-4000-8000-000000009237','T137RGB','TASK-137 regression shop B','active');

insert into public.shop_members (
  profile_id,
  shop_id,
  role_key,
  membership_status,
  suspended_at
)
values
  ('00000000-0000-4000-8000-000000009137','10000000-0000-4000-8000-000000009137','shop_owner','active',null),
  ('00000000-0000-4000-8000-000000009237','10000000-0000-4000-8000-000000009237','shop_owner','active',null),
  ('00000000-0000-4000-8000-000000009337','10000000-0000-4000-8000-000000009237','viewer','active',null),
  ('00000000-0000-4000-8000-000000009537','10000000-0000-4000-8000-000000009237','shop_manager','suspended',now());

insert into public.staff_accounts (
  staff_id,
  shop_id,
  staff_code,
  display_name,
  role_key,
  status,
  credential_kind,
  credential_hash,
  credential_updated_at,
  must_change_credential,
  credential_status,
  created_by_profile_id,
  updated_by_profile_id
)
values (
  '00000000-0000-4000-8000-000000009437',
  '10000000-0000-4000-8000-000000009237',
  'T137CASH',
  'TASK-137 regression cashier',
  'cashier',
  'active',
  'pin',
  repeat('0', 64),
  now(),
  false,
  'active',
  '00000000-0000-4000-8000-000000009237',
  '00000000-0000-4000-8000-000000009237'
);

insert into public.inventory_products (
  id,
  owner_user_id,
  shop_id,
  barcode,
  product_name
)
values
  ('20000000-0000-4000-8000-000000009137','00000000-0000-4000-8000-000000009137','10000000-0000-4000-8000-000000009137','T137-RG-A','TASK-137 regression product A'),
  ('20000000-0000-4000-8000-000000009237','00000000-0000-4000-8000-000000009237','10000000-0000-4000-8000-000000009237','T137-RG-B','TASK-137 regression product B');

select ok(
  not app_private.product_image_actor_can_read(
    '00000000-0000-4000-8000-000000009137',
    '10000000-0000-4000-8000-000000009237',
    'personal_account'
  ),
  'shop A attacker has no read-level relationship with shop B'
);
select ok(
  app_private.product_image_product_is_in_shop(
    '20000000-0000-4000-8000-000000009237',
    '10000000-0000-4000-8000-000000009237'
  ),
  'victim product is bound to shop B'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  public.product_image_record_denied(
    '00000000-0000-4000-8000-000000009137','personal_account',
    '10000000-0000-4000-8000-000000009237','20000000-0000-4000-8000-000000009237',
    'intent','permission_denied'
  )->>'code',
  'permission_denied',
  'cross-shop intent denial is rejected by the central audit boundary'
);
select is(
  public.product_image_record_denied(
    '00000000-0000-4000-8000-000000009137','personal_account',
    '10000000-0000-4000-8000-000000009237','20000000-0000-4000-8000-000000009237',
    'finalize','permission_denied'
  )->>'code',
  'permission_denied',
  'cross-shop finalize denial is rejected by the central audit boundary'
);
select is(
  public.product_image_record_denied(
    '00000000-0000-4000-8000-000000009137','personal_account',
    '10000000-0000-4000-8000-000000009237','20000000-0000-4000-8000-000000009237',
    'read','permission_denied'
  )->>'code',
  'permission_denied',
  'cross-shop read denial is rejected by the central audit boundary'
);
select is(
  public.product_image_record_denied(
    '00000000-0000-4000-8000-000000009137','personal_account',
    '10000000-0000-4000-8000-000000009237','20000000-0000-4000-8000-000000009237',
    'remove','permission_denied'
  )->>'code',
  'permission_denied',
  'cross-shop remove denial is rejected by the central audit boundary'
);

set local role postgres;

select is(
  (
    select count(*)::integer
    from public.audit_logs
    where actor_profile_id = '00000000-0000-4000-8000-000000009137'
      and shop_id = '10000000-0000-4000-8000-000000009237'
      and event_key like 'shop.product_image.%_denied'
  ),
  0,
  'cross-shop denials create zero victim-shop audit rows'
);
select is(
  (
    select count(*)::integer
    from public.audit_logs
    where actor_profile_id = '00000000-0000-4000-8000-000000009137'
      and shop_id = '10000000-0000-4000-8000-000000009137'
      and event_key like 'shop.product_image.%_denied'
  ),
  0,
  'cross-shop denials are not silently reassigned to the attacker shop'
);
select is(
  (
    select count(*)::integer
    from public.inventory_product_image_versions
    where product_id = '20000000-0000-4000-8000-000000009237'
  ),
  0,
  'cross-shop denial audit calls create no image lifecycle rows'
);
select is(
  (
    select count(*)::integer
    from public.sync_events
    where shop_id = '10000000-0000-4000-8000-000000009237'
      and source = 'product_image_api'
  ),
  0,
  'cross-shop denial audit calls emit no catalog events'
);
select is(
  (
    select primary_image_version_id
    from public.inventory_products
    where id = '20000000-0000-4000-8000-000000009237'
  ),
  null::uuid,
  'cross-shop denial audit calls preserve the victim current image'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  public.product_image_record_denied(
    '00000000-0000-4000-8000-000000009337','personal_account',
    '10000000-0000-4000-8000-000000009237','20000000-0000-4000-8000-000000009237',
    'intent','permission_denied'
  )->>'code',
  'denied_recorded',
  'same-shop viewer write denial remains auditable'
);

set local role postgres;
select is(
  (
    select count(*)::integer
    from public.audit_logs
    where actor_profile_id = '00000000-0000-4000-8000-000000009337'
      and shop_id = '10000000-0000-4000-8000-000000009237'
      and event_key = 'shop.product_image.intent_denied'
  ),
  1,
  'one same-shop denial call writes exactly one authorized audit row'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.product_image_record_denied(
    '00000000-0000-4000-8000-000000009337','personal_account',
    '10000000-0000-4000-8000-000000009237','20000000-0000-4000-8000-000000009137',
    'intent','permission_denied'
  )->>'code',
  'not_found',
  'same-shop actor cannot audit a product from another shop'
);

set local role postgres;
select is(
  (
    select count(*)::integer
    from public.audit_logs
    where actor_profile_id = '00000000-0000-4000-8000-000000009337'
      and shop_id = '10000000-0000-4000-8000-000000009237'
      and metadata_redacted->>'product_id' = '20000000-0000-4000-8000-000000009137'
  ),
  0,
  'cross-shop product identifiers are not persisted in same-shop audit metadata'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.product_image_record_denied(
    '00000000-0000-4000-8000-000000009437','cashier',
    '10000000-0000-4000-8000-000000009237','20000000-0000-4000-8000-000000009237',
    'intent','permission_denied'
  )->>'code',
  'permission_denied',
  'active cashier staff principal stays denied at the audit boundary'
);

set local role postgres;
select is(
  (
    select count(*)::integer
    from public.audit_logs
    where actor_profile_id = '00000000-0000-4000-8000-000000009437'
      and shop_id = '10000000-0000-4000-8000-000000009237'
  ),
  0,
  'cashier denial writes no shop-scoped audit row'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.product_image_record_denied(
    '00000000-0000-4000-8000-000000009537','personal_account',
    '10000000-0000-4000-8000-000000009237','20000000-0000-4000-8000-000000009237',
    'intent','permission_denied'
  )->>'code',
  'permission_denied',
  'suspended member stays denied at the audit boundary'
);

set local role postgres;
select is(
  (
    select count(*)::integer
    from public.audit_logs
    where actor_profile_id = '00000000-0000-4000-8000-000000009537'
      and shop_id = '10000000-0000-4000-8000-000000009237'
  ),
  0,
  'suspended member denial writes no shop-scoped audit row'
);

update public.shops
set shop_status = 'suspended',
    suspended_at = now(),
    suspended_by_profile_id = '00000000-0000-4000-8000-000000009237',
    status_changed_by_profile_id = '00000000-0000-4000-8000-000000009237',
    status_reason_redacted = 'TASK-137 local regression fixture'
where shop_id = '10000000-0000-4000-8000-000000009237';

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.product_image_record_denied(
    '00000000-0000-4000-8000-000000009337','personal_account',
    '10000000-0000-4000-8000-000000009237','20000000-0000-4000-8000-000000009237',
    'intent','permission_denied'
  )->>'code',
  'permission_denied',
  'suspended shop remains fail-closed'
);

set local role postgres;
select is(
  (
    select count(*)::integer
    from public.audit_logs
    where shop_id = '10000000-0000-4000-8000-000000009237'
      and event_key like 'shop.product_image.%_denied'
  ),
  1,
  'only the authorized same-shop viewer denial is recorded'
);

select * from finish();
rollback;
