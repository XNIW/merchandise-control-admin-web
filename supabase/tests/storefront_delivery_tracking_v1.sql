begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select ok(
  to_regclass('public.delivery_tracking_sessions') is not null
  and to_regclass('public.delivery_courier_assignments') is not null
  and to_regclass('public.delivery_courier_latest_locations') is not null
  and to_regclass('public.delivery_tracking_lifecycle_events') is not null
  and to_regclass('public.delivery_tracking_mutations') is not null
  and to_regclass('public.storefront_delivery_tracking_feed') is not null,
  'delivery tracking authority, latest-only position, lifecycle, idempotency and safe feed exist'
);

select ok(
  (
    select bool_and(class.relrowsecurity and class.relforcerowsecurity)
    from pg_catalog.pg_class class
    where class.oid in (
      'public.delivery_tracking_sessions'::regclass,
      'public.delivery_courier_assignments'::regclass,
      'public.delivery_courier_latest_locations'::regclass,
      'public.delivery_tracking_lifecycle_events'::regclass,
      'public.delivery_tracking_mutations'::regclass,
      'public.storefront_delivery_tracking_feed'::regclass
    )
  ),
  'all delivery tracking tables force RLS'
);

select ok(
  not has_table_privilege(
    'anon', 'public.storefront_delivery_tracking_feed', 'SELECT'
  )
  and has_table_privilege(
    'authenticated', 'public.storefront_delivery_tracking_feed', 'SELECT'
  )
  and not has_table_privilege(
    'authenticated', 'public.delivery_courier_latest_locations',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated', 'public.delivery_tracking_sessions',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'mobile roles can read only the owner-scoped safe feed and never internal tracking tables'
);

select ok(
  to_regprocedure('public.storefront_order_tracking_v1(text,uuid)') is not null
  and to_regprocedure(
    'public.admin_delivery_tracking_read_v1(uuid,text,jsonb,uuid,uuid,text,integer)'
  ) is not null
  and to_regprocedure(
    'public.admin_delivery_tracking_manage_v1(uuid,uuid,text,jsonb,uuid,uuid,uuid,text,integer)'
  ) is not null
  and to_regprocedure(
    'public.storefront_courier_tracking_control_v1(uuid,uuid,text,uuid,uuid,uuid,text,integer)'
  ) is not null
  and to_regprocedure(
    'public.storefront_courier_location_upsert_v1(uuid,uuid,uuid,double precision,double precision,double precision,timestamp with time zone,double precision,double precision,uuid,uuid,text,integer)'
  ) is not null,
  'customer, admin and courier delivery boundaries are installed'
);

select ok(
  has_function_privilege(
    'authenticated', 'public.storefront_order_tracking_v1(text,uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.storefront_order_tracking_v1(text,uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.storefront_courier_location_upsert_v1(uuid,uuid,uuid,double precision,double precision,double precision,timestamp with time zone,double precision,double precision,uuid,uuid,text,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.storefront_courier_location_upsert_v1(uuid,uuid,uuid,double precision,double precision,double precision,timestamp with time zone,double precision,double precision,uuid,uuid,text,integer)',
    'EXECUTE'
  ),
  'customer and courier execute grants are separated fail-closed'
);

select ok(
  exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'storefront_delivery_tracking_feed'
  ),
  'only the customer-safe owner-scoped feed is explicitly published to Realtime'
);

select ok(
  exists (
    select 1 from app_private.mac_admin_w7pos_009_pos_admin_permissions()
    where permission_key = 'orders.delivery.manage'
  )
  and exists (
    select 1 from app_private.task140_safe_staff_web_permissions()
    where permission_key = 'orders.delivery.track'
  ),
  'delivery view/manage/track permissions are part of the canonical permission contract'
);

select has_trigger(
  'public', 'delivery_tracking_mutations',
  'delivery_tracking_mutations_guard_immutable',
  'delivery idempotency receipts are immutable until bounded cleanup deletes them'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000044000',
    'authenticated', 'authenticated', 'task044-owner-a@example.invalid',
    '{"provider":"google","providers":["google"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000044001',
    'authenticated', 'authenticated', 'task044-owner-b@example.invalid',
    '{"provider":"google","providers":["google"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000044010',
    'authenticated', 'authenticated', 'task044-customer-a@example.invalid',
    '{"provider":"google","providers":["google"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000044011',
    'authenticated', 'authenticated', 'task044-customer-b@example.invalid',
    '{"provider":"google","providers":["google"]}', '{}', now(), now()
  );

update public.profiles
set display_name = case profile_id
  when '00000000-0000-4000-8000-000000044000'
    then 'TASK-044 Owner A'
  else 'TASK-044 Owner B' end
where profile_id in (
  '00000000-0000-4000-8000-000000044000',
  '00000000-0000-4000-8000-000000044001'
);

insert into public.shops(shop_id, shop_code, shop_name, shop_status)
values
  (
    '14000000-0000-4000-8000-000000044001',
    'TASK044A', 'TASK-044 synthetic shop A', 'active'
  ),
  (
    '14000000-0000-4000-8000-000000044002',
    'TASK044B', 'TASK-044 synthetic shop B', 'active'
  );

insert into public.shop_members(shop_id, profile_id, role_key, membership_status)
values
  (
    '14000000-0000-4000-8000-000000044001',
    '00000000-0000-4000-8000-000000044000', 'shop_owner', 'active'
  ),
  (
    '14000000-0000-4000-8000-000000044002',
    '00000000-0000-4000-8000-000000044001', 'shop_owner', 'active'
  );

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  delivery_enabled, reservation_enabled, require_product_image,
  delivery_tracking_enabled, delivery_tracking_min_interval_seconds,
  delivery_tracking_min_distance_meters, delivery_tracking_freshness_seconds
)
values
  (
    '14000000-0000-4000-8000-000000044001', 'task044-shop-a',
    true, false, true, false, false, true, 10, 25, 120
  ),
  (
    '14000000-0000-4000-8000-000000044002', 'task044-shop-b',
    true, false, true, false, false, true, 10, 25, 120
  );

insert into public.storefront_delivery_zones(
  id, shop_id, public_name, region, fee_clp, enabled
)
values
  (
    '24000000-0000-4000-8000-000000044001',
    '14000000-0000-4000-8000-000000044001',
    'Zona sintética A', 'Metropolitana', 1200, true
  ),
  (
    '24000000-0000-4000-8000-000000044002',
    '14000000-0000-4000-8000-000000044002',
    'Zona sintética B', 'Metropolitana', 1400, true
  );

insert into public.storefront_fulfillment_slots(
  id, shop_id, fulfillment_mode, delivery_zone_id, public_label,
  starts_at, ends_at, capacity, enabled
)
values
  (
    '34000000-0000-4000-8000-000000044001',
    '14000000-0000-4000-8000-000000044001', 'delivery',
    '24000000-0000-4000-8000-000000044001', 'Entrega A',
    now() + interval '1 hour', now() + interval '3 hours', 20, true
  ),
  (
    '34000000-0000-4000-8000-000000044002',
    '14000000-0000-4000-8000-000000044002', 'delivery',
    '24000000-0000-4000-8000-000000044002', 'Entrega B',
    now() + interval '1 hour', now() + interval '3 hours', 20, true
  );

insert into public.customer_orders (
  id, public_order_code, user_id, shop_id, quote_version, status,
  status_version, fulfillment_mode, slot_id, currency_code,
  subtotal_clp, delivery_fee_clp, total_clp, fulfillment_snapshot,
  placed_at, updated_at
)
values
  (
    '44000000-0000-4000-8000-000000044001',
    'MC-00000000000000004401',
    '00000000-0000-4000-8000-000000044010',
    '14000000-0000-4000-8000-000000044001', 1, 'ready', 4,
    'delivery', '34000000-0000-4000-8000-000000044001', 'CLP',
    5000, 1200, 6200,
    '{"mode":"delivery","address":{"addressLine1":"Calle sintética A 44","commune":"Ñuñoa","region":"Metropolitana","countryCode":"CL"},"slot":{"label":"Entrega A"}}',
    now() - interval '5 minutes', now() - interval '1 minute'
  ),
  (
    '44000000-0000-4000-8000-000000044002',
    'MC-00000000000000004402',
    '00000000-0000-4000-8000-000000044010',
    '14000000-0000-4000-8000-000000044001', 1, 'preparing', 3,
    'delivery', '34000000-0000-4000-8000-000000044001', 'CLP',
    7000, 1200, 8200,
    '{"mode":"delivery","address":{"addressLine1":"Calle sintética A 45","commune":"Ñuñoa","region":"Metropolitana","countryCode":"CL"},"slot":{"label":"Entrega A"}}',
    now() - interval '4 minutes', now() - interval '1 minute'
  ),
  (
    '44000000-0000-4000-8000-000000044003',
    'MC-00000000000000004403',
    '00000000-0000-4000-8000-000000044011',
    '14000000-0000-4000-8000-000000044002', 1, 'accepted', 2,
    'delivery', '34000000-0000-4000-8000-000000044002', 'CLP',
    6000, 1400, 7400,
    '{"mode":"delivery","address":{"addressLine1":"Calle sintética B 44","commune":"Providencia","region":"Metropolitana","countryCode":"CL"},"slot":{"label":"Entrega B"}}',
    now() - interval '3 minutes', now() - interval '1 minute'
  ),
  (
    '44000000-0000-4000-8000-000000044004',
    'MC-00000000000000004404',
    '00000000-0000-4000-8000-000000044010',
    '14000000-0000-4000-8000-000000044001', 1, 'ready', 4,
    'delivery', '34000000-0000-4000-8000-000000044001', 'CLP',
    9000, 1200, 10200,
    '{"mode":"delivery","address":{"addressLine1":"Calle sintética A 46","commune":"Ñuñoa","region":"Metropolitana","countryCode":"CL"},"slot":{"label":"Entrega A"}}',
    now() - interval '2 minutes', now() - interval '1 minute'
  );

insert into public.staff_accounts (
  staff_id, shop_id, staff_code, display_name, role_key, status,
  credential_kind, credential_hash, credential_updated_at,
  credential_expires_at, must_change_credential, credential_version,
  credential_status
)
values
  (
    '54000000-0000-4000-8000-000000044001',
    '14000000-0000-4000-8000-000000044001', 'COURIER44A1',
    'Courier synthetic A1', 'courier', 'active', 'password',
    'argon2id:task044:redacted-a1', now(), now() + interval '4 hours',
    false, 1, 'active'
  ),
  (
    '54000000-0000-4000-8000-000000044002',
    '14000000-0000-4000-8000-000000044001', 'COURIER44A2',
    'Courier synthetic A2', 'courier', 'active', 'password',
    'argon2id:task044:redacted-a2', now(), now() + interval '4 hours',
    false, 1, 'active'
  ),
  (
    '54000000-0000-4000-8000-000000044003',
    '14000000-0000-4000-8000-000000044002', 'COURIER44B1',
    'Courier synthetic B1', 'courier', 'active', 'password',
    'argon2id:task044:redacted-b1', now(), now() + interval '4 hours',
    false, 1, 'active'
  ),
  (
    '54000000-0000-4000-8000-000000044004',
    '14000000-0000-4000-8000-000000044001', 'VIEWER44',
    'Unprivileged synthetic staff', 'viewer', 'active', 'password',
    'argon2id:task044:redacted-viewer', now(), now() + interval '4 hours',
    false, 1, 'active'
  );

insert into public.staff_role_permissions(
  shop_id, role_key, permission_key, enabled
)
values
  (
    '14000000-0000-4000-8000-000000044001',
    'courier', 'orders.delivery.track', true
  ),
  (
    '14000000-0000-4000-8000-000000044002',
    'courier', 'orders.delivery.track', true
  );

insert into public.staff_web_sessions (
  staff_web_session_id, shop_id, staff_id, session_token_hash,
  staff_credential_version, status, issued_at, expires_at
)
values
  (
    '64000000-0000-4000-8000-000000044001',
    '14000000-0000-4000-8000-000000044001',
    '54000000-0000-4000-8000-000000044001',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    1, 'active', now() - interval '1 minute', now() + interval '2 hours'
  ),
  (
    '64000000-0000-4000-8000-000000044002',
    '14000000-0000-4000-8000-000000044001',
    '54000000-0000-4000-8000-000000044002',
    'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    1, 'active', now() - interval '1 minute', now() + interval '2 hours'
  ),
  (
    '64000000-0000-4000-8000-000000044003',
    '14000000-0000-4000-8000-000000044002',
    '54000000-0000-4000-8000-000000044003',
    'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    1, 'active', now() - interval '1 minute', now() + interval '2 hours'
  ),
  (
    '64000000-0000-4000-8000-000000044004',
    '14000000-0000-4000-8000-000000044001',
    '54000000-0000-4000-8000-000000044004',
    'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    1, 'active', now() - interval '1 minute', now() + interval '2 hours'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000044000","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-000000044000', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.shop_staff_create(
    '14000000-0000-4000-8000-000000044001',
    'COURIER44OPS',
    'Courier operativo sintetico',
    'courier',
    'password',
    'argon2id:task044:synthetic-operational-writer',
    now() + interval '4 hours'
  )->>'code',
  'success',
  'shop owner can create the bounded courier-only operational identity'
);

set local role postgres;
select ok(
  exists (
    select 1
    from public.staff_accounts staff
    join public.staff_role_permissions permission
      on permission.shop_id = staff.shop_id
      and permission.role_key = staff.role_key
    where staff.shop_id = '14000000-0000-4000-8000-000000044001'
      and staff.staff_code = 'COURIER44OPS'
      and staff.role_key = 'courier'
      and permission.permission_key = 'orders.delivery.track'
      and permission.enabled
  ),
  'courier creation installs only the dedicated publish permission required by Courier Mode'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  public.staff_web_login_commit_v1(
    '14000000-0000-4000-8000-000000044001',
    (
      select staff.staff_id
      from public.staff_accounts staff
      where staff.shop_id = '14000000-0000-4000-8000-000000044001'
        and staff.staff_code = 'COURIER44OPS'
    ),
    1,
    'sha256:' || repeat('f', 64),
    'sha256:' || repeat('9', 64),
    now() + interval '2 hours',
    '{"source":"task044-synthetic-test"}'::jsonb
  )->>'code',
  'success',
  'courier-only identity can establish the existing bounded staff web session'
);

select is(
  public.staff_web_session_resolve_v1(
    'sha256:' || repeat('9', 64)
  )->>'status',
  'ok',
  'courier-only web session resolves for the foreground Courier Mode route'
);

select is(
  public.staff_web_session_resolve_v1(
    'sha256:' || repeat('9', 64)
  )#>>'{staff,role_key}',
  'courier',
  'resolved foreground writer session remains explicitly courier-only'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000044000","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-000000044000', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.admin_delivery_tracking_manage_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044001',
    'configure_live',
    jsonb_build_object(
      'courierPublicLabel', 'Repartidor MC 44',
      'vehicleKind', 'bicycle',
      'etaStartsAt', now() + interval '35 minutes',
      'etaEndsAt', now() + interval '55 minutes',
      'storeLatitude', -33.4450,
      'storeLongitude', -70.6600,
      'destinationLatitude', -33.4470,
      'destinationLongitude', -70.6500,
      'contactCapability', 'store_phone'
    ),
    '74000000-0000-4000-8000-000000044001'
  )->>'code',
  'success',
  'authorized shop owner configures a liveCourier session with server ETA and safe coordinates'
);

select is(
  public.admin_delivery_tracking_manage_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044001',
    'assign',
    '{"courierStaffId":"54000000-0000-4000-8000-000000044001"}',
    '74000000-0000-4000-8000-000000044002'
  )->>'code',
  'success',
  'authorized owner assigns a same-shop courier with the dedicated tracking permission'
);

select is(
  public.admin_delivery_tracking_manage_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044001',
    'assign',
    '{"courierStaffId":"54000000-0000-4000-8000-000000044003"}',
    '74000000-0000-4000-8000-000000044003'
  )->>'code',
  'validation_failed',
  'shop A cannot assign a shop B courier'
);

select is(
  public.admin_delivery_tracking_manage_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044002',
    'configure_external',
    '{"externalCarrier":"Synthetic Carrier","externalTrackingCodeMasked":"****4402","externalTrackingUrl":"http://carrier.example.invalid/track/4402"}',
    '74000000-0000-4000-8000-000000044004'
  )->>'code',
  'validation_failed',
  'non-HTTPS external tracking URL is rejected'
);

select is(
  public.admin_delivery_tracking_manage_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044002',
    'configure_external',
    '{"externalCarrier":"Synthetic Carrier","externalTrackingCodeMasked":"****4402","externalTrackingUrl":"https://127.0.0.1/track/4402"}',
    '74000000-0000-4000-8000-000000044009'
  )->>'code',
  'validation_failed',
  'private or loopback external tracking URL is rejected'
);

select is(
  public.admin_delivery_tracking_manage_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044002',
    'configure_external',
    '{"externalCarrier":"Synthetic Carrier","externalTrackingCodeMasked":"****4402","externalTrackingUrl":"https://2130706433/track/4402"}',
    '74000000-0000-4000-8000-000000044025'
  )->>'code',
  'validation_failed',
  'numeric loopback external tracking URL is rejected at the SQL boundary'
);

select is(
  public.admin_delivery_tracking_manage_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044002',
    'configure_external',
    '{"externalCarrier":"Synthetic Carrier","externalTrackingCodeMasked":"****4402","externalTrackingUrl":"https://0x7f000001/track/4402"}',
    '74000000-0000-4000-8000-000000044026'
  )->>'code',
  'validation_failed',
  'hexadecimal loopback external tracking URL is rejected at the SQL boundary'
);

select is(
  public.admin_delivery_tracking_manage_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044002',
    'configure_external',
    jsonb_build_object(
      'externalCarrier', 'Synthetic Carrier',
      'externalTrackingCodeMasked', '****4402',
      'externalTrackingUrl', 'https://carrier.example.invalid/track/4402',
      'etaStartsAt', now() + interval '40 minutes',
      'etaEndsAt', now() + interval '1 hour'
    ),
    '74000000-0000-4000-8000-000000044005'
  )->>'code',
  'success',
  'validated HTTPS externalCarrier mode is persisted without a courier marker'
);

select is(
  public.admin_delivery_tracking_manage_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044004',
    'configure_status',
    jsonb_build_object(
      'etaStartsAt', now() + interval '25 minutes',
      'etaEndsAt', now() + interval '50 minutes'
    ),
    '74000000-0000-4000-8000-000000044007'
  )->>'code',
  'success',
  'authorized admin configures a separate statusOnly session'
);

select is(
  public.admin_delivery_tracking_manage_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044004',
    'terminate', '{}',
    '74000000-0000-4000-8000-000000044008'
  )->>'code',
  'success',
  'authorized admin terminates a tracking session without changing fiscal order state'
);

set local role postgres;
select ok(
  (
    select session.ended_at is not null
      and session.tracking_state = 'cancelled'
    from public.delivery_tracking_sessions session
    where session.order_id = '44000000-0000-4000-8000-000000044004'
  ) and (
    select customer_order.status = 'ready'
    from public.customer_orders customer_order
    where customer_order.id = '44000000-0000-4000-8000-000000044004'
  ),
  'tracking termination is operationally separated from the customer order state'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000044000","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-000000044000', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.admin_delivery_tracking_read_v1(
    '14000000-0000-4000-8000-000000044002', 'queue', '{}'
  )->>'code',
  'permission_denied',
  'shop A owner cannot enumerate shop B tracking queue'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000044001","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-000000044001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.admin_delivery_tracking_manage_v1(
    '14000000-0000-4000-8000-000000044002',
    '44000000-0000-4000-8000-000000044003',
    'configure_status',
    jsonb_build_object(
      'etaStartsAt', now() + interval '45 minutes',
      'etaEndsAt', now() + interval '75 minutes'
    ),
    '74000000-0000-4000-8000-000000044006'
  )->>'code',
  'success',
  'shop B owner configures statusOnly with a server-authoritative window'
);

set local role postgres;
update public.customer_orders
set status = 'out_for_delivery', status_version = 5, updated_at = now()
where id = '44000000-0000-4000-8000-000000044001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000044000","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-000000044000', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.admin_delivery_tracking_manage_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044001',
    'start', '{}',
    '74000000-0000-4000-8000-000000044019'
  )->>'code',
  'success',
  'authorized admin can explicitly start an assigned live session'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.storefront_courier_tracking_control_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044001', 'start',
    '74000000-0000-4000-8000-000000044010',
    '54000000-0000-4000-8000-000000044001',
    '64000000-0000-4000-8000-000000044001',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    1
  )->>'code',
  'success',
  'assigned courier starts foreground tracking only after out_for_delivery'
);

select is(
  public.storefront_courier_tracking_control_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044001', 'start',
    '74000000-0000-4000-8000-000000044010',
    '54000000-0000-4000-8000-000000044001',
    '64000000-0000-4000-8000-000000044001',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    1
  )->>'idempotent',
  'true',
  'courier control replay returns the stored idempotent receipt'
);

select is(
  public.storefront_courier_location_upsert_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044001',
    '74000000-0000-4000-8000-000000044011',
    -33.4460, -70.6550, 12, now() - interval '1 second', 90, 4,
    '54000000-0000-4000-8000-000000044001',
    '64000000-0000-4000-8000-000000044001',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    1
  )->>'code',
  'success',
  'assigned courier publishes one fresh latest position'
);

select is(
  public.storefront_courier_location_upsert_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044001',
    '74000000-0000-4000-8000-000000044011',
    -33.4460, -70.6550, 12, now() - interval '1 second', 90, 4,
    '54000000-0000-4000-8000-000000044001',
    '64000000-0000-4000-8000-000000044001',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    1
  )->>'idempotent',
  'true',
  'location replay returns the original receipt without duplicating a position'
);

select is(
  public.storefront_courier_location_upsert_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044001',
    '74000000-0000-4000-8000-000000044012',
    -33.44601, -70.65501, 12, now() + interval '1 second', 90, 4,
    '54000000-0000-4000-8000-000000044001',
    '64000000-0000-4000-8000-000000044001',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    1
  )->>'code',
  'rate_limited',
  'server time-and-distance throttling fails closed for redundant updates'
);

select is(
  public.storefront_courier_location_upsert_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044001',
    '74000000-0000-4000-8000-000000044027',
    -33.4000, -70.6000, 12, now(), 90, 4,
    '54000000-0000-4000-8000-000000044001',
    '64000000-0000-4000-8000-000000044001',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    1
  )->>'code',
  'rate_limited',
  'configured minimum interval is absolute even for a caller-declared large jump'
);

select is(
  public.storefront_courier_location_upsert_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044001',
    '74000000-0000-4000-8000-000000044013',
    -33.4470, -70.6540, 12, now() - interval '2 seconds', 90, 4,
    '54000000-0000-4000-8000-000000044001',
    '64000000-0000-4000-8000-000000044001',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    1
  )->>'code',
  'out_of_order',
  'out-of-order observed timestamp is rejected'
);

select is(
  public.storefront_courier_location_upsert_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044001',
    '74000000-0000-4000-8000-000000044014',
    'NaN'::double precision, -70.6540, 12, now(), null, null,
    '54000000-0000-4000-8000-000000044001',
    '64000000-0000-4000-8000-000000044001',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    1
  )->>'code',
  'validation_failed',
  'NaN coordinate injection is rejected'
);

select is(
  public.storefront_courier_location_upsert_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044001',
    '74000000-0000-4000-8000-000000044011',
    -33.4460, -70.6549, 12, now() - interval '1 second', 90, 4,
    '54000000-0000-4000-8000-000000044001',
    '64000000-0000-4000-8000-000000044001',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    1
  )->>'code',
  'idempotency_conflict',
  'same idempotency key with a different coordinate request is rejected'
);

select is(
  public.storefront_courier_tracking_control_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044001', 'pause',
    '74000000-0000-4000-8000-000000044015',
    '54000000-0000-4000-8000-000000044004',
    '64000000-0000-4000-8000-000000044004',
    'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    1
  )->>'code',
  'permission_denied',
  'staff without courier role and permission cannot control tracking'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000044010","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-000000044010', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.storefront_order_tracking_v1(
    'task044-shop-a', '44000000-0000-4000-8000-000000044001'
  )#>>'{snapshot,trackingMode}',
  'liveCourier',
  'customer A reads the liveCourier snapshot for the owned order'
);

select is(
  public.storefront_order_tracking_v1(
    'task044-shop-a', '44000000-0000-4000-8000-000000044001'
  )#>>'{snapshot,freshness}',
  'fresh',
  'customer snapshot reports server-derived freshness'
);

select is(
  (select count(*)::integer
   from public.storefront_delivery_tracking_feed),
  3,
  'customer A RLS sees only the three owned shop A tracking rows'
);

select ok(
  not exists (
    select 1
    from public.storefront_delivery_tracking_feed feed
    where feed.order_id = '44000000-0000-4000-8000-000000044003'
  ),
  'customer A cannot enumerate shop B feed rows'
);

select ok(
  (
    select row_to_json(feed)::text
    from public.storefront_delivery_tracking_feed feed
    where feed.order_id = '44000000-0000-4000-8000-000000044001'
  ) not like '%54000000-0000-4000-8000-000000044001%'
  and (
    select row_to_json(feed)::text
    from public.storefront_delivery_tracking_feed feed
    where feed.order_id = '44000000-0000-4000-8000-000000044001'
  ) not like '%@example.invalid%'
  and (
    select row_to_json(feed)::text
    from public.storefront_delivery_tracking_feed feed
    where feed.order_id = '44000000-0000-4000-8000-000000044001'
  ) not like '%Calle sintética%',
  'safe Realtime payload excludes courier subject IDs, email and address text'
);

select ok(
  not exists (
    select 1
    from information_schema.columns column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'storefront_delivery_tracking_feed'
      and column_info.column_name = 'shop_id'
  ),
  'customer Realtime feed omits the unnecessary internal shop UUID'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000044011","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-000000044011', true
);

select is(
  public.storefront_order_tracking_v1(
    'task044-shop-a', '44000000-0000-4000-8000-000000044001'
  )->>'code',
  'not_found',
  'customer B cannot read customer A tracking by guessed order UUID'
);

select is(
  (select count(*)::integer
   from public.storefront_delivery_tracking_feed),
  1,
  'customer B RLS sees only the owned shop B statusOnly feed'
);

set local role postgres;
update public.delivery_courier_latest_locations
set observed_at = now() - interval '25 hours 1 second',
    received_at = now() - interval '25 hours',
    expires_at = now() - interval '1 hour'
where order_id = '44000000-0000-4000-8000-000000044001';

select is(
  app_private.delivery_tracking_cleanup_v1(now(), 1000)->>'locationsDeleted',
  '1',
  'retention cleanup deletes the expired latest-only courier position'
);

select ok(
  (
    select feed.latitude is null and feed.longitude is null
      and feed.observed_at is null and feed.received_at is null
      and feed.freshness = 'unavailable'
    from public.storefront_delivery_tracking_feed feed
    where feed.order_id = '44000000-0000-4000-8000-000000044001'
  ),
  'retention cleanup atomically redacts the owner-scoped Realtime feed'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000044000","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-000000044000', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.admin_delivery_tracking_manage_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044001',
    'assign',
    '{"courierStaffId":"54000000-0000-4000-8000-000000044002"}',
    '74000000-0000-4000-8000-000000044020'
  )->>'code',
  'success',
  'authorized reassignment replaces the active courier assignment'
);

set local role postgres;
select is(
  (select count(*)::integer
   from public.delivery_courier_latest_locations
   where order_id = '44000000-0000-4000-8000-000000044001'),
  0,
  'reassignment deletes the previous precise latest position'
);

select is(
  (select count(*)::integer
   from public.delivery_courier_assignments
   where order_id = '44000000-0000-4000-8000-000000044001'
     and revoked_at is null),
  1,
  'unique active assignment is preserved after reassignment'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.storefront_courier_tracking_control_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044001', 'start',
    '74000000-0000-4000-8000-000000044021',
    '54000000-0000-4000-8000-000000044001',
    '64000000-0000-4000-8000-000000044001',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    1
  )->>'code',
  'assignment_denied',
  'reassigned courier can no longer start or publish'
);

select is(
  public.storefront_courier_tracking_control_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044001', 'start',
    '74000000-0000-4000-8000-000000044022',
    '54000000-0000-4000-8000-000000044002',
    '64000000-0000-4000-8000-000000044002',
    'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    1
  )->>'code',
  'success',
  'replacement courier starts the same session with a valid dedicated lease'
);

select is(
  public.storefront_courier_location_upsert_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044001',
    '74000000-0000-4000-8000-000000044023',
    -33.4455, -70.6530, 14, now(), 105, 3,
    '54000000-0000-4000-8000-000000044002',
    '64000000-0000-4000-8000-000000044002',
    'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    1
  )->>'code',
  'success',
  'replacement courier can publish a new latest position'
);

set local role postgres;
update public.customer_orders
set status = 'completed', status_version = 6, updated_at = now()
where id = '44000000-0000-4000-8000-000000044001';

select is(
  (select count(*)::integer
   from public.delivery_courier_latest_locations
   where order_id = '44000000-0000-4000-8000-000000044001'),
  0,
  'completion automatically deletes the precise courier position'
);

select ok(
  (
    select feed.latitude is null and feed.longitude is null
      and feed.tracking_state = 'completed' and feed.freshness = 'ended'
    from public.storefront_delivery_tracking_feed feed
    where feed.order_id = '44000000-0000-4000-8000-000000044001'
  ),
  'completed safe feed retains status/timeline context but no precise coordinates'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.storefront_courier_location_upsert_v1(
    '14000000-0000-4000-8000-000000044001',
    '44000000-0000-4000-8000-000000044001',
    '74000000-0000-4000-8000-000000044024',
    -33.4450, -70.6520, 14, now(), null, null,
    '54000000-0000-4000-8000-000000044002',
    '64000000-0000-4000-8000-000000044002',
    'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    1
  )->>'code',
  'invalid_state',
  'closed session rejects every later location update'
);

set local role postgres;
insert into public.delivery_tracking_mutations (
  shop_id, order_id, idempotency_key, operation, request_sha256,
  actor_profile_id, response_payload, created_at, retained_until
) values (
  '14000000-0000-4000-8000-000000044001',
  '44000000-0000-4000-8000-000000044002',
  '74000000-0000-4000-8000-000000044099', 'configure_status',
  repeat('e', 64), '00000000-0000-4000-8000-000000044000',
  '{"ok":true,"code":"expired_fixture"}',
  now() - interval '2 days', now() - interval '1 day'
);

select is(
  app_private.delivery_tracking_cleanup_v1(now(), 1000)->>'code',
  'success',
  'bounded retention cleanup executes successfully'
);

select is(
  (select count(*)::integer
   from public.delivery_tracking_mutations
   where retained_until <= now()),
  0,
  'expired idempotency/rate-limit state is removed by retention cleanup'
);

select ok(
  not exists (
    select 1
    from public.delivery_tracking_lifecycle_events event
    where event.metadata_redacted ?| array[
      'latitude', 'longitude', 'coordinates', 'email', 'phone', 'subjectId'
    ]
  ),
  'lifecycle events contain no precise coordinates or personal contact identifiers'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    cross join lateral unnest(
      coalesce(procedure.proargnames, '{}'::text[])
    ) argument(name)
    where namespace.nspname = 'public'
      and procedure.proname = 'storefront_order_tracking_v1'
      and argument.name ~* '(user_id|courier_staff_id|subject|service_role)'
  ),
  'customer read boundary accepts no owner, courier subject or privileged role input'
);

select * from finish();
rollback;
