begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_function(
  'public',
  'admin_storefront_publications_read_v1',
  array[
    'uuid', 'text', 'text', 'uuid', 'text', 'boolean', 'boolean', 'text',
    'integer', 'integer', 'uuid', 'uuid', 'text', 'integer'
  ],
  'TASK-007 installs the Storefront Admin publication read boundary'
);
select has_function(
  'public',
  'storefront_publication_authoring_mutate_v1',
  array[
    'uuid', 'text', 'jsonb', 'uuid', 'bigint', 'uuid', 'uuid', 'text',
    'integer'
  ],
  'TASK-152 installs the versioned Storefront authoring mutation boundary'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_storefront_publications_read_v1(uuid,text,text,uuid,text,boolean,boolean,text,integer,integer,uuid,uuid,text,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.storefront_publication_authoring_mutate_v1(uuid,text,jsonb,uuid,bigint,uuid,uuid,text,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.storefront_publication_authoring_mutate_v1(uuid,text,jsonb,uuid,bigint,uuid,uuid,text,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.admin_storefront_publication_mutate_v1(uuid,text,jsonb,uuid,uuid,text,integer)',
    'EXECUTE'
  ),
  'versioned boundary is callable while anon and the unversioned legacy mutation are denied'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000020007',
    'authenticated', 'authenticated', 'storefront-admin-owner@example.invalid',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000020008',
    'authenticated', 'authenticated', 'storefront-admin-outsider@example.invalid',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000020009',
    'authenticated', 'authenticated', 'storefront-admin-viewer@example.invalid',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.profiles (profile_id, display_name, profile_status)
values
  ('00000000-0000-4000-8000-000000020007', 'Storefront owner', 'active'),
  ('00000000-0000-4000-8000-000000020008', 'Storefront outsider', 'active'),
  ('00000000-0000-4000-8000-000000020009', 'Storefront viewer', 'active')
on conflict (profile_id) do update
set display_name = excluded.display_name,
    profile_status = excluded.profile_status;

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values
  ('10000000-0000-4000-8000-000000020007', 'SFADMIN7', 'Storefront Admin 7', 'active'),
  ('10000000-0000-4000-8000-000000020008', 'SFADMIN8', 'Storefront Admin 8', 'active');

insert into public.shop_members (profile_id, shop_id, role_key, membership_status)
values
  (
    '00000000-0000-4000-8000-000000020007',
    '10000000-0000-4000-8000-000000020007',
    'shop_owner',
    'active'
  ),
  (
    '00000000-0000-4000-8000-000000020009',
    '10000000-0000-4000-8000-000000020007',
    'viewer',
    'active'
  );

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name, updated_at
) values (
  '30000000-0000-4000-8000-000000020007',
  '00000000-0000-4000-8000-000000020007',
  '10000000-0000-4000-8000-000000020007',
  'Bebidas internas',
  now()
);

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  purchase_price, retail_price, stock_quantity, updated_at
) values
  (
    '20000000-0000-4000-8000-000000020007',
    '00000000-0000-4000-8000-000000020007',
    '10000000-0000-4000-8000-000000020007',
    'SFADMIN-0007', 'Nombre interno confidencial',
    '30000000-0000-4000-8000-000000020007', 450, 1200, 10, now()
  ),
  (
    '20000000-0000-4000-8000-000000020008',
    '00000000-0000-4000-8000-000000020008',
    '10000000-0000-4000-8000-000000020008',
    'SFADMIN-0008', 'Producto otro tenant', null, 800, 1800, 5, now()
  );

insert into public.staff_accounts (
  staff_id, shop_id, staff_code, display_name, role_key, status,
  credential_kind, credential_hash, credential_updated_at,
  credential_expires_at, must_change_credential, credential_version,
  credential_status
) values (
  '50000000-0000-4000-8000-000000020007',
  '10000000-0000-4000-8000-000000020007',
  'SFEDIT07', 'Storefront scoped editor', 'manager', 'active', 'password',
  'argon2id:task152:redacted', now(), now() + interval '4 hours', false, 1,
  'active'
);

insert into public.staff_role_permissions (
  shop_id, role_key, permission_key, enabled
) values
  (
    '10000000-0000-4000-8000-000000020007',
    'manager', 'storefront.edit', true
  ),
  (
    '10000000-0000-4000-8000-000000020007',
    'manager', 'storefront.pricing.manage', true
  );

insert into public.staff_web_sessions (
  staff_web_session_id, shop_id, staff_id, session_token_hash,
  staff_credential_version, status, issued_at, expires_at
) values (
  '60000000-0000-4000-8000-000000020007',
  '10000000-0000-4000-8000-000000020007',
  '50000000-0000-4000-8000-000000020007',
  'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  1, 'active', now() - interval '1 minute', now() + interval '2 hours'
);

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  require_product_image
) values (
  '10000000-0000-4000-8000-000000020007',
  'storefront-admin-fixture', true, true, false
);

insert into public.storefront_categories (
  id, shop_id, source_category_id, slug, public_name,
  publication_status, sort_rank
) values (
  '40000000-0000-4000-8000-000000020007',
  '10000000-0000-4000-8000-000000020007',
  '30000000-0000-4000-8000-000000020007',
  'bebidas', 'Bebidas', 'published', 1
);

insert into public.storefront_image_publications (
  id, shop_id, source_product_id, publication_status, version_key
) values (
  '60000000-0000-4000-8000-000000020008',
  '10000000-0000-4000-8000-000000020007',
  '20000000-0000-4000-8000-000000020007',
  'draft', 'task152-image-0007'
);

select ok(
  (
    select count(*) = 9
    from public.staff_role_permissions permission
    where permission.shop_id = '10000000-0000-4000-8000-000000020007'
      and permission.role_key = 'pos_admin'
      and permission.permission_key like 'storefront.%'
      and permission.enabled
  ),
  'new shops receive all nine canonical Storefront permissions for POS Admin'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000020007',
    'role', 'authenticated'
  )::text,
  true
);

select is(
  public.admin_storefront_publications_read_v1(
    '10000000-0000-4000-8000-000000020007'
  )->>'code',
  'success',
  'active personal-account shop owner can load Storefront publications'
);
select is(
  jsonb_array_length(
    public.admin_storefront_publications_read_v1(
      '10000000-0000-4000-8000-000000020007'
    )->'rows'
  ),
  1,
  'read boundary returns only inventory products from the authorized shop'
);
select ok(
  not (
    public.admin_storefront_publications_read_v1(
      '10000000-0000-4000-8000-000000020007'
    )->'rows'->0
  ) ?| array['purchase_price', 'supplier_id', 'owner_user_id'],
  'Admin publication response omits purchase cost, supplier and owner metadata'
);

select is(
  public.storefront_publication_authoring_mutate_v1(
    '10000000-0000-4000-8000-000000020007',
    'save_draft',
    jsonb_build_object(
      'sourceProductId', '20000000-0000-4000-8000-000000020007',
      'publicName', 'Café público',
      'publicDescription', 'Descripción segura',
      'storefrontCategoryId', '40000000-0000-4000-8000-000000020007',
      'publicBrand', 'Marca pública',
      'publicPrice', 999999,
      'priceSourceMode', 'operational',
      'featured', true,
      'homeOrder', 1,
      'pickupEnabled', true,
      'deliveryEnabled', false,
      'reservationEnabled', false,
      'availability', 'available'
    ),
    '70000000-0000-4000-8000-000000020001',
    0
  )->>'code',
  'success',
  'draft upsert succeeds through the transactional boundary'
);

set local role postgres;
select is(
  (
    select publication.retail_price_clp
    from public.storefront_product_publications publication
    where publication.source_product_id = '20000000-0000-4000-8000-000000020007'
  ),
  1200::bigint,
  'operational price mode ignores the client price and rereads trusted inventory'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000020007',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  public.storefront_publication_authoring_mutate_v1(
    '10000000-0000-4000-8000-000000020007',
    'publish',
    jsonb_build_object(
      'sourceProductId', '20000000-0000-4000-8000-000000020007',
      'publicName', 'Café público',
      'publicDescription', 'Descripción segura',
      'storefrontCategoryId', '40000000-0000-4000-8000-000000020007',
      'publicBrand', 'Marca pública',
      'publicPrice', 1000,
      'compareAtPrice', 1200,
      'priceSourceMode', 'override',
      'featured', true,
      'homeOrder', 1,
      'pickupEnabled', true,
      'deliveryEnabled', false,
      'reservationEnabled', false,
      'availability', 'available'
    ),
    '70000000-0000-4000-8000-000000020002',
    1
  )->>'code',
  'success',
  'server validation permits a complete published product'
);
select is(
  public.storefront_product_detail_v1(
    'storefront-admin-fixture',
    '20000000-0000-4000-8000-000000020007'
  )->>'status',
  'unavailable',
  'public detail never accepts an internal source product ID'
);

set local role postgres;
select is(
  (
    select count(*)::integer
    from public.storefront_catalog_items item
    where item.shop_id = '10000000-0000-4000-8000-000000020007'
      and item.public_name = 'Café público'
  ),
  1,
  'publishing rebuilds the customer-safe projection'
);
select ok(
  not (
    public.storefront_catalog_v1(
      'storefront-admin-fixture', null, 25
    )->'items'->0
  ) ?| array[
    'purchasePrice', 'purchase_price', 'cost', 'margin', 'supplier',
    'supplierId', 'stockQuantity', 'stock_quantity', 'warehouseLocation',
    'internalNotes', 'priceHistory', 'audit', 'remoteRef', 'staffIdentity',
    'posData', 'taxData', 'ownerUserId', 'updatedBy'
  ],
  'customer public payload explicitly omits every prohibited operational and administrative field'
);
select ok(
  exists (
    select 1
    from public.audit_logs audit
    where audit.shop_id = '10000000-0000-4000-8000-000000020007'
      and audit.event_key = 'shop.storefront.authoring.publish.success'
      and audit.metadata_redacted ? 'before'
      and audit.metadata_redacted ? 'after'
      and audit.metadata_redacted->>'source' = 'admin'
      and audit.metadata_redacted ? 'changedFields'
  ),
  'publication mutation records actor, source, fields, versions and safe snapshots in audit'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000020007',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  public.storefront_publication_authoring_mutate_v1(
    '10000000-0000-4000-8000-000000020007',
    'publish',
    jsonb_build_object(
      'sourceProductId', '20000000-0000-4000-8000-000000020007',
      'publicName', 'Precio inválido',
      'publicPrice', 1300,
      'compareAtPrice', 1200,
      'priceSourceMode', 'override',
      'homeOrder', 1,
      'pickupEnabled', true,
      'deliveryEnabled', false,
      'reservationEnabled', false,
      'availability', 'available'
    ),
    '70000000-0000-4000-8000-000000020003',
    2
  )->>'code',
  'validation_failed',
  'compare-at below customer price fails closed'
);

select is(
  public.admin_storefront_publication_bulk_mutate_v2(
    '10000000-0000-4000-8000-000000020007',
    'bulk_hide',
    jsonb_build_array(jsonb_build_object(
      'publicationId', '50000000-0000-4000-8000-000000000000',
      'expectedVersion', 0
    )),
    '70000000-0000-4000-8000-000000020004'
  )->>'code',
  'stale_revision',
  'bulk mutation does not disclose whether an unknown target is cross-shop'
);

select is(
  public.admin_storefront_publication_bulk_mutate_v2(
    '10000000-0000-4000-8000-000000020007',
    'bulk_hide',
    jsonb_build_array(jsonb_build_object(
      'publicationId', public.admin_storefront_publications_read_v1(
          '10000000-0000-4000-8000-000000020007'
        )->'rows'->0->>'publication_id',
      'expectedVersion', 2
    )),
    '70000000-0000-4000-8000-000000020005'
  )->>'code',
  'success',
  'bulk pause is atomic for the selected publication set'
);

select set_config(
  'request.headers',
  '{"x-client-info":"supabase-kt/3.2.1"}',
  true
);
select is(
  public.storefront_publication_authoring_mutate_v1(
    '10000000-0000-4000-8000-000000020007',
    'save_draft',
    jsonb_build_object(
      'sourceProductId', '20000000-0000-4000-8000-000000020007',
      'publicName', 'Café Android',
      'publicDescription', 'Descripción segura',
      'storefrontCategoryId', '40000000-0000-4000-8000-000000020007',
      'publicBrand', 'Marca pública',
      'publicPrice', 1000,
      'compareAtPrice', 1200,
      'priceSourceMode', 'override',
      'featured', true,
      'homeOrder', 1,
      'pickupEnabled', true,
      'deliveryEnabled', false,
      'reservationEnabled', false,
      'availability', 'available'
    ),
    '70000000-0000-4000-8000-000000020008',
    3
  )->>'code',
  'success',
  'a spoofed client header cannot prevent an otherwise authorized mutation'
);

set local role postgres;
select is(
  (
    select publication.last_mutation_source
    from public.storefront_product_publications publication
    where publication.source_product_id = '20000000-0000-4000-8000-000000020007'
  ),
  'admin',
  'x-client-info alone cannot forge the authoritative mutation source'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000020007',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'storefront_mutation_source', 'android'
    )
  )::text,
  true
);
select is(
  public.storefront_publication_authoring_mutate_v1(
    '10000000-0000-4000-8000-000000020007',
    'save_draft',
    jsonb_build_object(
      'sourceProductId', '20000000-0000-4000-8000-000000020007',
      'publicName', 'Café Android',
      'publicDescription', 'Descripción segura',
      'storefrontCategoryId', '40000000-0000-4000-8000-000000020007',
      'publicBrand', 'Marca pública',
      'publicPrice', 1000,
      'compareAtPrice', 1200,
      'priceSourceMode', 'override',
      'featured', true,
      'homeOrder', 1,
      'pickupEnabled', true,
      'deliveryEnabled', false,
      'reservationEnabled', false,
      'availability', 'available'
    ),
    '70000000-0000-4000-8000-000000020013',
    4
  )->>'code',
  'success',
  'a server-signed Android app_metadata claim controls audit attribution'
);
select is(
  public.storefront_publication_authoring_mutate_v1(
    '10000000-0000-4000-8000-000000020007',
    'save_draft',
    jsonb_build_object(
      'sourceProductId', '20000000-0000-4000-8000-000000020007',
      'publicName', 'Café Android',
      'publicDescription', 'Descripción segura',
      'storefrontCategoryId', '40000000-0000-4000-8000-000000020007',
      'publicBrand', 'Marca pública',
      'publicPrice', 1000,
      'compareAtPrice', 1200,
      'priceSourceMode', 'override',
      'featured', true,
      'homeOrder', 1,
      'pickupEnabled', true,
      'deliveryEnabled', false,
      'reservationEnabled', false,
      'availability', 'available'
    ),
    '70000000-0000-4000-8000-000000020013',
    4
  )->>'idempotent',
  'true',
  'duplicate idempotency key and identical request return the stored ACK safely'
);
select is(
  public.storefront_publication_authoring_mutate_v1(
    '10000000-0000-4000-8000-000000020007',
    'hide',
    '{"sourceProductId":"20000000-0000-4000-8000-000000020007"}'::jsonb,
    '70000000-0000-4000-8000-000000020008',
    4
  )->>'code',
  'idempotency_conflict',
  'reusing an idempotency key for a different operation fails closed'
);
select is(
  public.storefront_publication_authoring_mutate_v1(
    '10000000-0000-4000-8000-000000020007',
    'hide',
    '{"sourceProductId":"20000000-0000-4000-8000-000000020007"}'::jsonb,
    '70000000-0000-4000-8000-000000020009',
    4
  )->>'code',
  'stale_revision',
  'stale expectedVersion returns conflict without overwriting the acknowledged draft'
);

set local role postgres;
update public.inventory_products product
set retail_price = 1750
where product.id = '20000000-0000-4000-8000-000000020007';
select is(
  (
    select publication.retail_price_clp
    from public.storefront_product_publications publication
    where publication.source_product_id = '20000000-0000-4000-8000-000000020007'
  ),
  1000::bigint,
  'operational import/price update preserves Storefront public price and publication metadata'
);
select throws_ok(
  $$
    update public.inventory_products
    set deleted_at = statement_timestamp()
    where id = '20000000-0000-4000-8000-000000020007'
  $$,
  '23514',
  'archive Storefront publication before deleting operational product',
  'published/draft operational product cannot be soft-deleted before Storefront archive'
);
select throws_ok(
  $$
    delete from public.inventory_products
    where id = '20000000-0000-4000-8000-000000020007'
  $$,
  '23514',
  'archive Storefront publication before deleting operational product',
  'published/draft operational product cannot be hard-deleted before Storefront archive'
);
select is(
  (
    select publication.last_mutation_source
    from public.storefront_product_publications publication
    where publication.source_product_id = '20000000-0000-4000-8000-000000020007'
  ),
  'android',
  'mutation source is derived from a server-signed platform claim'
);
select is(
  (
    select publication.catalog_version
    from public.storefront_product_publications publication
    where publication.source_product_id = '20000000-0000-4000-8000-000000020007'
  ),
  5::bigint,
  'duplicate and stale requests do not advance the publication version'
);

select ok(
  position(
    'pg_advisory_xact_lock' in pg_get_functiondef(
      'public.storefront_publication_authoring_mutate_v1(uuid,text,jsonb,uuid,bigint,uuid,uuid,text,integer)'::regprocedure
    )
  ) > 0,
  'first creation serializes writers before checking expectedVersion zero'
);

update public.storefront_product_publications publication
set published_image_version_id = '60000000-0000-4000-8000-000000020008',
    price_source_mode = 'promotion',
    promotion_starts_at = statement_timestamp() + interval '1 day',
    promotion_ends_at = statement_timestamp() + interval '2 days'
where publication.source_product_id = '20000000-0000-4000-8000-000000020007';

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.storefront_publication_authoring_mutate_v1(
    '10000000-0000-4000-8000-000000020007',
    'save_draft',
    jsonb_build_object(
      'sourceProductId', '20000000-0000-4000-8000-000000020007',
      'publicName', 'Café Android',
      'publicDescription', 'Descripción segura',
      'storefrontCategoryId', '40000000-0000-4000-8000-000000020007',
      'publicBrand', 'Marca pública', 'publicPrice', 1000,
      'compareAtPrice', 1200, 'priceSourceMode', 'promotion',
      'promotionStartsAt', statement_timestamp() + interval '1 day',
      'promotionEndsAt', statement_timestamp() + interval '2 days',
      'featured', true, 'homeOrder', 1, 'pickupEnabled', true,
      'deliveryEnabled', false, 'reservationEnabled', false,
      'availability', 'available', 'publicImageId', null
    ),
    '70000000-0000-4000-8000-000000020014', 5,
    '50000000-0000-4000-8000-000000020007',
    '60000000-0000-4000-8000-000000020007',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    1
  )->>'code',
  'permission_denied',
  'removing a public image requires storefront.images.manage'
);
select is(
  public.storefront_publication_authoring_mutate_v1(
    '10000000-0000-4000-8000-000000020007',
    'save_draft',
    jsonb_build_object(
      'sourceProductId', '20000000-0000-4000-8000-000000020007',
      'publicName', 'Café Android',
      'publicDescription', 'Descripción segura',
      'storefrontCategoryId', '40000000-0000-4000-8000-000000020007',
      'publicBrand', 'Marca pública', 'publicPrice', 1000,
      'compareAtPrice', 1200, 'priceSourceMode', 'override',
      'featured', true, 'homeOrder', 1, 'pickupEnabled', true,
      'deliveryEnabled', false, 'reservationEnabled', false,
      'availability', 'available',
      'publicImageId', '60000000-0000-4000-8000-000000020008'
    ),
    '70000000-0000-4000-8000-000000020015', 5,
    '50000000-0000-4000-8000-000000020007',
    '60000000-0000-4000-8000-000000020007',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    1
  )->>'code',
  'permission_denied',
  'removing promotion metadata requires storefront.promotions.manage'
);

set local role postgres;
insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  purchase_price, retail_price, stock_quantity, updated_at
) values (
  '20000000-0000-4000-8000-000000020009',
  '00000000-0000-4000-8000-000000020007',
  '10000000-0000-4000-8000-000000020007',
  'SFADMIN-0009', 'Producto concurrente',
  '30000000-0000-4000-8000-000000020007', 500, 1500, 3, now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000020007","role":"authenticated"}',
  true
);
select is(
  public.storefront_publication_authoring_mutate_v1(
    '10000000-0000-4000-8000-000000020007', 'save_draft',
    jsonb_build_object(
      'sourceProductId', '20000000-0000-4000-8000-000000020009',
      'publicName', 'Primera creación', 'publicPrice', 1500,
      'priceSourceMode', 'override', 'pickupEnabled', true,
      'deliveryEnabled', false, 'reservationEnabled', false,
      'availability', 'available'
    ),
    '70000000-0000-4000-8000-000000020016', 0
  )->>'code',
  'success',
  'first expectedVersion zero writer creates version one'
);
select is(
  public.storefront_publication_authoring_mutate_v1(
    '10000000-0000-4000-8000-000000020007', 'save_draft',
    jsonb_build_object(
      'sourceProductId', '20000000-0000-4000-8000-000000020009',
      'publicName', 'Seconda creazione', 'publicPrice', 1500,
      'priceSourceMode', 'override', 'pickupEnabled', true,
      'deliveryEnabled', false, 'reservationEnabled', false,
      'availability', 'available'
    ),
    '70000000-0000-4000-8000-000000020017', 0
  )->>'code',
  'stale_revision',
  'a second expectedVersion zero writer cannot overwrite version one'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000020007',
    'role', 'authenticated'
  )::text,
  true
);
select set_config('request.headers', '{}'::text, true);
select ok(
  (
    public.storefront_publications_authoring_read_v1(
      '10000000-0000-4000-8000-000000020007',
      array['20000000-0000-4000-8000-000000020007'::uuid]
    )->'rows'->0->>'version'
  )::bigint = 5
  and not (
    public.storefront_publications_authoring_read_v1(
      '10000000-0000-4000-8000-000000020007',
      array['20000000-0000-4000-8000-000000020007'::uuid]
    )->'rows'->0
  ) ?| array[
    'barcode', 'purchasePrice', 'cost', 'margin', 'supplier',
    'stockQuantity', 'internalNotes', 'audit', 'staffIdentity', 'taxData'
  ],
  'bounded authoring read returns the server version without leaking operational fields'
);
select is(
  public.storefront_publication_authoring_mutate_v1(
    '10000000-0000-4000-8000-000000020007',
    'archive',
    '{"sourceProductId":"20000000-0000-4000-8000-000000020007"}'::jsonb,
    '70000000-0000-4000-8000-000000020010',
    5
  )->>'code',
  'success',
  'archive is an explicit versioned publication mutation'
);
select is(
  public.storefront_publication_authoring_mutate_v1(
    '10000000-0000-4000-8000-000000020007',
    'publish',
    jsonb_build_object(
      'sourceProductId', '20000000-0000-4000-8000-000000020007',
      'publicName', 'No revive', 'publicPrice', 1000,
      'priceSourceMode', 'override', 'homeOrder', 1,
      'pickupEnabled', true, 'deliveryEnabled', false,
      'reservationEnabled', false, 'availability', 'available'
    ),
    '70000000-0000-4000-8000-000000020011',
    6
  )->>'code',
  'invalid_state',
  'an archived publication cannot be revived by a later mutation'
);

set local role postgres;
select lives_ok(
  $$
    update public.inventory_products
    set deleted_at = statement_timestamp()
    where id = '20000000-0000-4000-8000-000000020007'
  $$,
  'operational soft-delete is allowed only after explicit Storefront archive'
);

set local role postgres;
select is(
  (
    select publication.publication_status
    from public.storefront_product_publications publication
    where publication.source_product_id = '20000000-0000-4000-8000-000000020007'
  ),
  'ended',
  'explicit archive leaves the authoritative row terminal and removes it from projection'
);
select is(
  (
    select count(*)::integer
    from public.storefront_catalog_items item
    where item.shop_id = '10000000-0000-4000-8000-000000020007'
  ),
  0,
  'paused product disappears from the public projection'
);
select lives_ok(
  $$
    delete from public.inventory_products
    where id = '20000000-0000-4000-8000-000000020007'
  $$,
  'hard delete is allowed only after explicit Storefront archive'
);
select is(
  (
    select count(*)::integer
    from public.storefront_product_publications publication
    where publication.source_product_id = '20000000-0000-4000-8000-000000020007'
  ),
  0,
  'terminal publication follows the explicit post-archive delete policy'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000020009',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  public.storefront_publications_authoring_read_v1(
    '10000000-0000-4000-8000-000000020007'
  )->>'code',
  'success',
  'authorized viewer/operator can read the bounded authoring projection'
);
select is(
  public.storefront_publication_authoring_mutate_v1(
    '10000000-0000-4000-8000-000000020007',
    'hide',
    '{"sourceProductId":"20000000-0000-4000-8000-000000020007"}'::jsonb,
    '70000000-0000-4000-8000-000000020012',
    6
  )->>'code',
  'permission_denied',
  'viewer/operator without publish permission cannot mutate publication state'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000020008',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  public.admin_storefront_publications_read_v1(
    '10000000-0000-4000-8000-000000020007'
  )->>'code',
  'permission_denied',
  'authenticated customer or cross-shop account cannot read Admin publications'
);
select is(
  public.admin_storefront_publication_bulk_mutate_v2(
    '10000000-0000-4000-8000-000000020007',
    'bulk_hide',
    '[{"publicationId":"50000000-0000-4000-8000-000000000000","expectedVersion":0}]'::jsonb,
    '70000000-0000-4000-8000-000000020006'
  )->>'code',
  'permission_denied',
  'authenticated customer or cross-shop account cannot mutate Storefront'
);

set local role service_role;
select is(
  public.admin_storefront_publication_bulk_mutate_v2(
    '10000000-0000-4000-8000-000000020007',
    'bulk_hide',
    '[{"publicationId":"50000000-0000-4000-8000-000000000000","expectedVersion":0}]'::jsonb,
    '70000000-0000-4000-8000-000000020007'
  )->>'code',
  'permission_denied',
  'service role without a valid POS staff lease cannot use the authoring RPC'
);

set local role postgres;
select * from finish();
rollback;
