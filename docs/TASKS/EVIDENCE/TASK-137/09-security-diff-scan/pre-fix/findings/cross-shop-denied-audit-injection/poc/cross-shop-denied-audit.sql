begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

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
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000009137',
    'authenticated',
    'authenticated',
    'security-validation-attacker@example.invalid',
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000009237',
    'authenticated',
    'authenticated',
    'security-validation-victim@example.invalid',
    '{}',
    '{}',
    now(),
    now()
  );

insert into public.profiles (profile_id, display_name, profile_status)
values
  (
    '00000000-0000-4000-8000-000000009137',
    'Security validation attacker',
    'active'
  ),
  (
    '00000000-0000-4000-8000-000000009237',
    'Security validation victim',
    'active'
  )
on conflict (profile_id) do update
set display_name = excluded.display_name,
    profile_status = excluded.profile_status;

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values
  (
    '10000000-0000-4000-8000-000000009137',
    'VAL137A',
    'Validation Shop A',
    'active'
  ),
  (
    '10000000-0000-4000-8000-000000009237',
    'VAL137B',
    'Validation Shop B',
    'active'
  );

insert into public.shop_members (
  profile_id,
  shop_id,
  role_key,
  membership_status,
  suspended_at
)
values
  (
    '00000000-0000-4000-8000-000000009137',
    '10000000-0000-4000-8000-000000009137',
    'shop_owner',
    'active',
    null
  ),
  (
    '00000000-0000-4000-8000-000000009237',
    '10000000-0000-4000-8000-000000009237',
    'shop_owner',
    'active',
    null
  );

insert into public.inventory_products (
  id,
  owner_user_id,
  shop_id,
  barcode,
  product_name
)
values (
  '20000000-0000-4000-8000-000000009237',
  '00000000-0000-4000-8000-000000009237',
  '10000000-0000-4000-8000-000000009237',
  'SEC-VAL-137',
  'Victim shop validation product'
);

select ok(
  not app_private.product_image_actor_can_write(
    '00000000-0000-4000-8000-000000009137',
    '10000000-0000-4000-8000-000000009237',
    'personal_account'
  ),
  'attacker cannot write product images in victim shop'
);

select ok(
  not app_private.product_image_actor_can_read(
    '00000000-0000-4000-8000-000000009137',
    '10000000-0000-4000-8000-000000009237',
    'personal_account'
  ),
  'attacker cannot read product images in victim shop'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  public.product_image_record_denied(
    '00000000-0000-4000-8000-000000009137',
    'personal_account',
    '10000000-0000-4000-8000-000000009237',
    '20000000-0000-4000-8000-000000009237',
    'intent',
    'permission_denied'
  )->>'code',
  'denied_recorded',
  'service-role denied-audit RPC accepts victim shop for intent'
);

select is(
  public.product_image_record_denied(
    '00000000-0000-4000-8000-000000009137',
    'personal_account',
    '10000000-0000-4000-8000-000000009237',
    '20000000-0000-4000-8000-000000009237',
    'finalize',
    'permission_denied'
  )->>'code',
  'denied_recorded',
  'service-role denied-audit RPC accepts victim shop for finalize'
);

select is(
  public.product_image_record_denied(
    '00000000-0000-4000-8000-000000009137',
    'personal_account',
    '10000000-0000-4000-8000-000000009237',
    '20000000-0000-4000-8000-000000009237',
    'read',
    'permission_denied'
  )->>'code',
  'denied_recorded',
  'service-role denied-audit RPC accepts victim shop for read'
);

select is(
  public.product_image_record_denied(
    '00000000-0000-4000-8000-000000009137',
    'personal_account',
    '10000000-0000-4000-8000-000000009237',
    '20000000-0000-4000-8000-000000009237',
    'remove',
    'permission_denied'
  )->>'code',
  'denied_recorded',
  'service-role denied-audit RPC accepts victim shop for remove'
);

set local role postgres;

select is(
  (
    select count(*)::integer
    from public.audit_logs
    where actor_profile_id = '00000000-0000-4000-8000-000000009137'
      and shop_id = '10000000-0000-4000-8000-000000009237'
      and target_id = '20000000-0000-4000-8000-000000009237'
      and event_key in (
        'shop.product_image.intent_denied',
        'shop.product_image.finalize_denied',
        'shop.product_image.read_denied',
        'shop.product_image.remove_denied'
      )
  ),
  4,
  'four durable audit rows are inserted into the victim shop'
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
  'the denied audit is not scoped back to the attacker shop'
);

select is(
  (
    select count(*)::integer
    from public.audit_logs
    where actor_profile_id = '00000000-0000-4000-8000-000000009137'
      and shop_id = '10000000-0000-4000-8000-000000009237'
      and metadata_redacted->>'product_id' =
        '20000000-0000-4000-8000-000000009237'
  ),
  4,
  'victim product identifier is persisted in each injected audit row'
);

select * from finish();
rollback;
