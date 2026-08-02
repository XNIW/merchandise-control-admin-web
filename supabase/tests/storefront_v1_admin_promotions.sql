begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_function(
  'public',
  'admin_storefront_promotions_read_v1',
  array['uuid', 'text', 'text', 'integer', 'integer', 'uuid', 'uuid', 'text', 'integer'],
  'TASK-008 installs the Storefront promotion read boundary'
);
select has_function(
  'public',
  'admin_storefront_promotion_mutate_v1',
  array['uuid', 'text', 'jsonb', 'uuid', 'uuid', 'text', 'integer'],
  'TASK-008 installs the transactional promotion mutation boundary'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_storefront_promotion_mutate_v1(uuid,text,jsonb,uuid,uuid,text,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.admin_storefront_promotions_read_v1(uuid,text,text,integer,integer,uuid,uuid,text,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.admin_storefront_promotion_mutate_v1(uuid,text,jsonb,uuid,uuid,text,integer)',
    'EXECUTE'
  ),
  'authenticated and lease-bound server roles can execute while anon cannot'
);
select is(
  (
    select count(*)::integer
    from cron.job
    where jobname = 'storefront-promotion-reconcile-v1'
      and schedule = '* * * * *'
  ),
  1,
  'promotion activation and expiry reconciliation is scheduled exactly once'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000020080',
    'authenticated', 'authenticated', 'storefront-promo-owner@example.invalid',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000020081',
    'authenticated', 'authenticated', 'storefront-promo-outsider@example.invalid',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.profiles (profile_id, display_name, profile_status)
values
  ('00000000-0000-4000-8000-000000020080', 'Promotion owner', 'active'),
  ('00000000-0000-4000-8000-000000020081', 'Promotion outsider', 'active')
on conflict (profile_id) do update
set display_name = excluded.display_name,
    profile_status = excluded.profile_status;

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values
  ('10000000-0000-4000-8000-000000020080', 'SFPROMO80', 'Promotion Shop', 'active'),
  ('10000000-0000-4000-8000-000000020081', 'SFPROMO81', 'Other Promotion Shop', 'active');

insert into public.shop_members (profile_id, shop_id, role_key, membership_status)
values (
  '00000000-0000-4000-8000-000000020080',
  '10000000-0000-4000-8000-000000020080',
  'shop_owner',
  'active'
);

insert into public.inventory_categories (id, owner_user_id, shop_id, name, updated_at)
values (
  '30000000-0000-4000-8000-000000020080',
  '00000000-0000-4000-8000-000000020080',
  '10000000-0000-4000-8000-000000020080',
  'Promotion category',
  now()
);

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  purchase_price, retail_price, stock_quantity, updated_at
) values
  (
    '20000000-0000-4000-8000-000000020080',
    '00000000-0000-4000-8000-000000020080',
    '10000000-0000-4000-8000-000000020080',
    'SFPROMO-80', 'Promotion product one',
    '30000000-0000-4000-8000-000000020080', 400, 1000, 10, now()
  ),
  (
    '20000000-0000-4000-8000-000000020082',
    '00000000-0000-4000-8000-000000020080',
    '10000000-0000-4000-8000-000000020080',
    'SFPROMO-82', 'Promotion product two',
    '30000000-0000-4000-8000-000000020080', 700, 2000, 10, now()
  );

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  require_product_image
) values (
  '10000000-0000-4000-8000-000000020080',
  'storefront-promotion-fixture', true, true, false
);

insert into public.storefront_categories (
  id, shop_id, source_category_id, slug, public_name,
  publication_status, sort_rank
) values (
  '40000000-0000-4000-8000-000000020080',
  '10000000-0000-4000-8000-000000020080',
  '30000000-0000-4000-8000-000000020080',
  'promotion-category', 'Promotion category', 'published', 1
);

insert into public.storefront_product_publications (
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, price_source_mode, pickup_enabled,
  availability_mode, published_at
) values
  (
    '50000000-0000-4000-8000-000000020080',
    '10000000-0000-4000-8000-000000020080',
    '20000000-0000-4000-8000-000000020080',
    'published', 'Customer product one',
    '40000000-0000-4000-8000-000000020080', 1000, 'override', true,
    'available', now()
  ),
  (
    '50000000-0000-4000-8000-000000020082',
    '10000000-0000-4000-8000-000000020080',
    '20000000-0000-4000-8000-000000020082',
    'published', 'Customer product two',
    '40000000-0000-4000-8000-000000020080', 2000, 'override', true,
    'available', now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000020080',
    'role', 'authenticated'
  )::text,
  true
);

select is(
  public.admin_storefront_promotion_mutate_v1(
    '10000000-0000-4000-8000-000000020080',
    'upsert',
    jsonb_build_object(
      'publicName', 'Invalid percentage',
      'publicationStatus', 'active',
      'discountType', 'percentage_bps',
      'discountValue', 0,
      'priority', 1,
      'startsAt', now() - interval '1 hour',
      'endsAt', now() + interval '1 hour',
      'publicationIds', jsonb_build_array('50000000-0000-4000-8000-000000020080'),
      'excludedPublicationIds', '[]'::jsonb
    )
  )->>'code',
  'validation_failed',
  'zero or false percentage is rejected server-side'
);

select is(
  public.admin_storefront_promotion_mutate_v1(
    '10000000-0000-4000-8000-000000020080',
    'upsert',
    jsonb_build_object(
      'publicName', 'Invalid window',
      'publicationStatus', 'scheduled',
      'discountType', 'percentage_bps',
      'discountValue', 1000,
      'priority', 1,
      'startsAt', now() + interval '1 hour',
      'endsAt', now(),
      'publicationIds', jsonb_build_array('50000000-0000-4000-8000-000000020080'),
      'excludedPublicationIds', '[]'::jsonb
    )
  )->>'code',
  'validation_failed',
  'promotion start must precede end'
);

select is(
  public.admin_storefront_promotion_mutate_v1(
    '10000000-0000-4000-8000-000000020080',
    'upsert',
    jsonb_build_object(
      'publicName', 'Ten percent',
      'publicDescription', 'Scheduled customer-safe discount',
      'publicationStatus', 'active',
      'discountType', 'percentage_bps',
      'discountValue', 1000,
      'priority', 10,
      'startsAt', now() - interval '1 hour',
      'endsAt', now() + interval '2 hours',
      'publicationIds', jsonb_build_array(
        '50000000-0000-4000-8000-000000020080',
        '50000000-0000-4000-8000-000000020082'
      ),
      'excludedPublicationIds', jsonb_build_array(
        '50000000-0000-4000-8000-000000020082'
      )
    )
  )->>'code',
  'success',
  'owner creates an active multi-product promotion with an exclusion'
);

set local role postgres;
select is(
  (
    select publication_status
    from public.storefront_promotions
    where shop_id = '10000000-0000-4000-8000-000000020080'
      and public_name = 'Ten percent'
  ),
  'active',
  'server canonicalizes a currently valid promotion to active'
);
select results_eq(
  $$
    select count(*)::integer, count(*) filter (where excluded)::integer
    from public.storefront_promotion_products link
    join public.storefront_promotions promotion
      on promotion.shop_id = link.shop_id and promotion.id = link.promotion_id
    where promotion.public_name = 'Ten percent'
  $$,
  $$ values (2, 1) $$,
  'promotion links and exclusion are persisted atomically'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000020080',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  (public.storefront_product_detail_v1(
    'storefront-promotion-fixture',
    '50000000-0000-4000-8000-000000020080'
  )->'item'->>'priceClp')::bigint,
  900::bigint,
  'public contract applies the valid percentage discount'
);
select is(
  (public.storefront_product_detail_v1(
    'storefront-promotion-fixture',
    '50000000-0000-4000-8000-000000020082'
  )->'item'->>'priceClp')::bigint,
  2000::bigint,
  'excluded product retains its customer price'
);

select is(
  public.admin_storefront_promotion_mutate_v1(
    '10000000-0000-4000-8000-000000020080',
    'upsert',
    jsonb_build_object(
      'publicName', 'Fixed eight hundred',
      'publicationStatus', 'active',
      'discountType', 'fixed_price_clp',
      'discountValue', 800,
      'priority', 1,
      'startsAt', now() - interval '30 minutes',
      'endsAt', now() + interval '1 hour',
      'publicationIds', jsonb_build_array('50000000-0000-4000-8000-000000020080'),
      'excludedPublicationIds', '[]'::jsonb
    )
  )->>'code',
  'success',
  'overlapping promotion is accepted under the deterministic conflict rule'
);
select is(
  (public.storefront_product_detail_v1(
    'storefront-promotion-fixture',
    '50000000-0000-4000-8000-000000020080'
  )->'item'->>'priceClp')::bigint,
  800::bigint,
  'lowest effective customer price wins before priority'
);
select ok(
  exists (
    select 1
    from jsonb_array_elements(
      public.admin_storefront_promotions_read_v1(
        '10000000-0000-4000-8000-000000020080'
      )->'rows'
    ) row
    where (row->>'conflictProductCount')::integer = 1
  ),
  'Admin preview reports overlapping products resolved deterministically'
);

select is(
  public.admin_storefront_promotion_mutate_v1(
    '10000000-0000-4000-8000-000000020080',
    'upsert',
    jsonb_build_object(
      'publicName', 'Future promotion',
      'publicationStatus', 'active',
      'discountType', 'percentage_bps',
      'discountValue', 2000,
      'priority', 50,
      'startsAt', now() + interval '1 hour',
      'endsAt', now() + interval '2 hours',
      'publicationIds', jsonb_build_array('50000000-0000-4000-8000-000000020080'),
      'excludedPublicationIds', '[]'::jsonb
    )
  )->'payload'->>'status',
  'scheduled',
  'future active request is canonicalized to scheduled'
);

set local role postgres;
select is(
  app_private.storefront_promotion_reconcile_v1(
    '10000000-0000-4000-8000-000000020080',
    now() + interval '90 minutes'
  ) > 0,
  true,
  'reconciler activates scheduled promotions at the server timestamp'
);
select is(
  (
    select publication_status
    from public.storefront_promotions
    where public_name = 'Future promotion'
  ),
  'active',
  'future promotion is physically activated'
);
select is(
  app_private.storefront_promotion_reconcile_v1(
    '10000000-0000-4000-8000-000000020080',
    now() + interval '3 hours'
  ) > 0,
  true,
  'reconciler expires ended promotion windows'
);
select is(
  (
    select publication_status
    from public.storefront_promotions
    where public_name = 'Future promotion'
  ),
  'ended',
  'future promotion is physically ended after expiry'
);
select ok(
  exists (
    select 1
    from public.audit_logs audit
    where audit.shop_id = '10000000-0000-4000-8000-000000020080'
      and audit.event_key = 'shop.storefront.promotion.upsert.success'
      and audit.metadata_redacted ? 'before'
      and audit.metadata_redacted ? 'after'
      and audit.metadata_redacted->>'conflictRule'
        = 'lowest_effective_price_then_priority_then_uuid'
  ),
  'promotion changes record before/after and the conflict contract in audit'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000020081',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  public.admin_storefront_promotions_read_v1(
    '10000000-0000-4000-8000-000000020080'
  )->>'code',
  'permission_denied',
  'cross-shop authenticated account cannot read promotions'
);
select is(
  public.admin_storefront_promotion_mutate_v1(
    '10000000-0000-4000-8000-000000020080',
    'upsert',
    '{}'::jsonb
  )->>'code',
  'permission_denied',
  'cross-shop authenticated account cannot mutate promotions'
);

set local role service_role;
select is(
  public.admin_storefront_promotion_mutate_v1(
    '10000000-0000-4000-8000-000000020080',
    'upsert',
    '{}'::jsonb
  )->>'code',
  'permission_denied',
  'service role without a valid staff lease cannot use promotion authoring'
);

set local role postgres;
select * from finish();
rollback;
