begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_function(
  'public',
  'product_image_create_intent_wechat_v1',
  array[
    'uuid', 'uuid', 'uuid', 'text', 'integer', 'integer', 'integer',
    'text', 'integer', 'integer', 'integer', 'uuid', 'uuid'
  ],
  'idempotent Mini image-intent RPC exists'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.product_image_create_intent_wechat_v1(uuid,uuid,uuid,text,integer,integer,integer,text,integer,integer,integer,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.product_image_create_intent_wechat_v1(uuid,uuid,uuid,text,integer,integer,integer,text,integer,integer,integer,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.product_image_create_intent_wechat_v1(uuid,uuid,uuid,text,integer,integer,integer,text,integer,integer,integer,uuid,uuid)',
    'EXECUTE'
  ),
  'Mini image-intent RPC is service-role-only'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.product_image_create_intent(uuid,text,uuid,uuid,text,integer,integer,integer,text,integer,integer,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.product_image_create_intent(uuid,text,uuid,uuid,text,integer,integer,integer,text,integer,integer,integer)',
    'EXECUTE'
  ),
  'legacy Admin image-intent signature and grants remain compatible'
);
select ok(
  not has_function_privilege(
    'service_role',
    'app_private.product_image_create_intent_unlocked_legacy_v1(uuid,text,uuid,uuid,text,integer,integer,integer,text,integer,integer,integer)',
    'EXECUTE'
  ),
  'unlocked implementation is not an alternate service-role bypass'
);
select ok(
  not has_table_privilege(
    'service_role',
    'app_private.wechat_product_image_intent_receipts',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'app_private.wechat_product_image_intent_receipts',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'app_private.wechat_product_image_intent_actor_rate_limits',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'app_private.wechat_product_image_intent_shop_rate_limits',
    'SELECT'
  ),
  'durable intent receipts and rate state are private'
);
select ok(
  (
    select proc.prosecdef
      and proc.proconfig @> array[
        'search_path=""',
        'statement_timeout=5s'
      ]
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname = 'product_image_create_intent_wechat_v1'
  ),
  'Mini intent RPC has bounded execution and an empty search path'
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.product_image_create_intent_wechat_v1(
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    repeat('a', 64), 1, 1, 1, repeat('b', 64), 1, 1, 1,
    gen_random_uuid(), gen_random_uuid()
  )$$,
  '42501', 'wechat_service_role_required',
  'Mini image intent also rejects a non-service caller internally'
);
select set_config('request.jwt.claim.role', 'service_role', true);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000401',
    'authenticated', 'authenticated', 'image-intent-owner@example.invalid',
    '{}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000402',
    'authenticated', 'authenticated', 'image-intent-manager@example.invalid',
    '{}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000403',
    'authenticated', 'authenticated', 'image-intent-viewer@example.invalid',
    '{}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000404',
    'authenticated', 'authenticated', 'image-intent-platform@example.invalid',
    '{}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000405',
    'authenticated', 'authenticated', 'image-intent-exhaustion@example.invalid',
    '{}', '{}', clock_timestamp(), clock_timestamp());

update public.profiles
set display_name = case profile_id
    when '00000000-0000-4000-8000-000000000401'
      then 'Image intent owner'
    when '00000000-0000-4000-8000-000000000402'
      then 'Image intent manager'
    when '00000000-0000-4000-8000-000000000403'
      then 'Image intent viewer'
    when '00000000-0000-4000-8000-000000000405'
      then 'Image intent exhaustion manager'
    else 'Image intent platform'
  end,
  profile_status = 'active'
where profile_id in (
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000402',
  '00000000-0000-4000-8000-000000000403',
  '00000000-0000-4000-8000-000000000404',
  '00000000-0000-4000-8000-000000000405'
);

insert into public.shops (
  shop_id, shop_code, shop_name, shop_status, created_by_profile_id
) values
  ('10000000-0000-4000-8000-000000000401', 'IMGINTENT401',
    'Image intent shop', 'active',
    '00000000-0000-4000-8000-000000000401'),
  ('10000000-0000-4000-8000-000000000402', 'IMGINTENT402',
    'Image intent other shop', 'active',
    '00000000-0000-4000-8000-000000000404');

insert into public.shop_members (
  profile_id, shop_id, role_key, membership_status
) values
  ('00000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000401', 'shop_owner', 'active'),
  ('00000000-0000-4000-8000-000000000402',
    '10000000-0000-4000-8000-000000000401', 'shop_manager', 'active'),
  ('00000000-0000-4000-8000-000000000403',
    '10000000-0000-4000-8000-000000000401', 'viewer', 'active'),
  ('00000000-0000-4000-8000-000000000405',
    '10000000-0000-4000-8000-000000000401', 'shop_manager', 'active'),
  ('00000000-0000-4000-8000-000000000405',
    '10000000-0000-4000-8000-000000000402', 'shop_manager', 'active');

insert into public.platform_admins (
  profile_id, status, granted_at, reason_redacted
) values (
  '00000000-0000-4000-8000-000000000404',
  'active', clock_timestamp(), 'image-intent fixture'
);

insert into public.shop_inventory_sources (
  shop_inventory_source_id, shop_id, owner_user_id, source_kind,
  mapping_state, verified_at
) values (
  '40000000-0000-4000-8000-000000000401',
  '10000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000401',
  'mobile_owner', 'mapped', clock_timestamp()
);

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, updated_at
) values
  ('20000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000401',
    'IMG-INTENT-401', 'Image intent product A', clock_timestamp()),
  ('20000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000401',
    'IMG-INTENT-402', 'Image intent product B', clock_timestamp()),
  ('20000000-0000-4000-8000-000000000403',
    '00000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000401',
    'IMG-INTENT-403', 'Image intent product C', clock_timestamp());

create temporary table image_intent_results (
  result_key text primary key,
  result jsonb not null
) on commit drop;

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);

insert into image_intent_results values (
  'first', public.product_image_create_intent_wechat_v1(
    '00000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000401',
    '20000000-0000-4000-8000-000000000401',
    repeat('a', 64), 700000, 1600, 1200,
    repeat('b', 64), 90000, 384, 288,
    '50000000-0000-4000-8000-000000000401',
    '51000000-0000-4000-8000-000000000401'
  )
);
select ok(
  (select result->>'code' = 'upload_required'
      and result->>'status' = 'upload_required'
      and result->>'correlation_id'
        = '51000000-0000-4000-8000-000000000401'
      and not (result->>'replayed')::boolean
    from image_intent_results where result_key = 'first'),
  'first Mini intent preserves the legacy upload-required result plus correlation'
);
select is(
  (select count(*)::integer from public.inventory_product_image_versions
    where product_id = '20000000-0000-4000-8000-000000000401'),
  1, 'first intent creates one pending version'
);

insert into image_intent_results values (
  'pending_replay', public.product_image_create_intent_wechat_v1(
    '00000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000401',
    '20000000-0000-4000-8000-000000000401',
    repeat('a', 64), 700000, 1600, 1200,
    repeat('b', 64), 90000, 384, 288,
    '50000000-0000-4000-8000-000000000401',
    '51000000-0000-4000-8000-000000000401'
  )
);
select ok(
  (select (result->>'replayed')::boolean
      and result->>'version_id' = (
        select result->>'version_id' from image_intent_results
        where result_key = 'first'
      )
      and result->>'main_path' = (
        select result->>'main_path' from image_intent_results
        where result_key = 'first'
      )
      and result->>'audit_event_id' = (
        select result->>'audit_event_id' from image_intent_results
        where result_key = 'first'
      )
    from image_intent_results where result_key = 'pending_replay'),
  'same pending key and request replay the exact durable intent result'
);

insert into image_intent_results
select 'denial_audit_' || series.n,
  public.product_image_record_denied(
    '00000000-0000-4000-8000-000000000403', 'personal_account',
    '10000000-0000-4000-8000-000000000401',
    '20000000-0000-4000-8000-000000000401',
    case series.n % 3 when 0 then 'intent'
      when 1 then 'finalize' else 'remove' end,
    'permission_denied'
  )
from generate_series(1, 65) series(n);
select is(
  (select count(*)::integer from image_intent_results
    where result_key like 'denial_audit_%'
      and result->>'code' = 'denied_recorded'),
  65, 'denial recorder keeps one generic response when audit is suppressed'
);
select is(
  (select count(*)::integer from public.audit_logs audit
    where audit.actor_profile_id = '00000000-0000-4000-8000-000000000403'
      and audit.shop_id = '10000000-0000-4000-8000-000000000401'
      and audit.event_key in (
        'shop.product_image.intent_denied',
        'shop.product_image.finalize_denied',
        'shop.product_image.remove_denied'
      )),
  60, 'cross-operation product-image denial audit growth is capped'
);
select is(
  (select admitted_count
    from app_private.product_image_denial_audit_rate_limits
    where actor_profile_id = '00000000-0000-4000-8000-000000000403'
      and shop_id = '10000000-0000-4000-8000-000000000401'),
  60, 'product-image denial audit quota saturates transactionally'
);

update public.inventory_product_image_versions
set status = 'ready',
    verified_main_sha256 = expected_main_sha256,
    verified_main_bytes = expected_main_bytes,
    verified_main_width = expected_main_width,
    verified_main_height = expected_main_height,
    verified_main_mime_type = 'image/jpeg',
    verified_thumb_sha256 = expected_thumb_sha256,
    verified_thumb_bytes = expected_thumb_bytes,
    verified_thumb_width = expected_thumb_width,
    verified_thumb_height = expected_thumb_height,
    verified_thumb_mime_type = 'image/jpeg',
    finalized_by_profile_id = '00000000-0000-4000-8000-000000000401',
    finalized_at = clock_timestamp()
where id = (select (result->>'version_id')::uuid
  from image_intent_results where result_key = 'first');
update public.inventory_products
set primary_image_version_id = (select (result->>'version_id')::uuid
      from image_intent_results where result_key = 'first'),
    primary_image_updated_at = clock_timestamp(),
    updated_at = clock_timestamp()
where id = '20000000-0000-4000-8000-000000000401';
insert into image_intent_results
select 'stale_remove_' || series.n,
  public.product_image_remove(
    '00000000-0000-4000-8000-000000000401', 'personal_account',
    '10000000-0000-4000-8000-000000000401',
    '20000000-0000-4000-8000-000000000401',
    md5('wechat-stale-remove-' || series.n)::uuid
  )
from generate_series(1, 65) series(n);
select is(
  (select count(*)::integer from image_intent_results
    where result_key like 'stale_remove_%'
      and result->>'code' = 'stale_conflict'),
  65, 'stale remove response remains stable after denial-audit saturation'
);
select is(
  (select count(*)::integer from public.audit_logs audit
    where audit.actor_profile_id = '00000000-0000-4000-8000-000000000401'
      and audit.shop_id = '10000000-0000-4000-8000-000000000401'
      and audit.event_key = 'shop.product_image.remove_denied'
      and audit.metadata_redacted->>'code' = 'stale_conflict'),
  60, 'internal stale-remove denial audit is capped at the shared quota'
);
select is(
  (select actor_kind from public.inventory_product_image_versions
    where product_id = '20000000-0000-4000-8000-000000000401'),
  'personal_account', 'Mini wrapper forces personal-account actor kind'
);

insert into image_intent_results values (
  'terminal_replay', public.product_image_create_intent_wechat_v1(
    '00000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000401',
    '20000000-0000-4000-8000-000000000401',
    repeat('a', 64), 700000, 1600, 1200,
    repeat('b', 64), 90000, 384, 288,
    '50000000-0000-4000-8000-000000000401',
    '51000000-0000-4000-8000-000000000401'
  )
);
select ok(
  (select result->>'code' = 'invalid_state'
      and not (result->>'replayed')::boolean
    from image_intent_results where result_key = 'terminal_replay'),
  'terminal image intent cannot mint a fresh upload capability on replay'
);
select is(
  (select count(*)::integer from public.inventory_product_image_versions
    where product_id = '20000000-0000-4000-8000-000000000401'),
  1, 'sequential replay creates no extra version and consumes no rate count'
);
select is(
  (select admitted_count
    from app_private.wechat_product_image_intent_actor_rate_limits
    where actor_profile_id = '00000000-0000-4000-8000-000000000401'),
  1, 'successful replay does not consume image-intent admission twice'
);

select is(
  public.product_image_create_intent_wechat_v1(
    '00000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000401',
    '20000000-0000-4000-8000-000000000401',
    repeat('c', 64), 700000, 1600, 1200,
    repeat('b', 64), 90000, 384, 288,
    '50000000-0000-4000-8000-000000000401',
    '51000000-0000-4000-8000-000000000401'
  )->>'code',
  'idempotency_conflict', 'same key with changed image payload is rejected'
);
select is(
  public.product_image_create_intent_wechat_v1(
    '00000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000401',
    '20000000-0000-4000-8000-000000000401',
    repeat('a', 64), 700000, 1600, 1200,
    repeat('b', 64), 90000, 384, 288,
    '50000000-0000-4000-8000-000000000401',
    '51000000-0000-4000-8000-000000000499'
  )->>'code',
  'idempotency_conflict', 'correlation identifier is bound into the request hash'
);

select is(
  public.product_image_create_intent_wechat_v1(
    '00000000-0000-4000-8000-000000000403',
    '10000000-0000-4000-8000-000000000401',
    '20000000-0000-4000-8000-000000000402',
    repeat('a', 64), 700000, 1600, 1200,
    repeat('b', 64), 90000, 384, 288,
    gen_random_uuid(), gen_random_uuid()
  )->>'code',
  'permission_denied', 'viewer cannot create a Mini image intent'
);
select is(
  public.product_image_create_intent_wechat_v1(
    '00000000-0000-4000-8000-000000000404',
    '10000000-0000-4000-8000-000000000401',
    '20000000-0000-4000-8000-000000000402',
    repeat('a', 64), 700000, 1600, 1200,
    repeat('b', 64), 90000, 384, 288,
    gen_random_uuid(), gen_random_uuid()
  )->>'code',
  'permission_denied', 'platform administrator has no Mini image-intent bypass'
);

update public.shop_members
set membership_status = 'suspended', suspended_at = clock_timestamp()
where profile_id = '00000000-0000-4000-8000-000000000401'
  and shop_id = '10000000-0000-4000-8000-000000000401';
select is(
  public.product_image_create_intent_wechat_v1(
    '00000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000401',
    '20000000-0000-4000-8000-000000000401',
    repeat('a', 64), 700000, 1600, 1200,
    repeat('b', 64), 90000, 384, 288,
    '50000000-0000-4000-8000-000000000401',
    '51000000-0000-4000-8000-000000000401'
  )->>'code',
  'permission_denied', 'replay is fenced by current membership state'
);
update public.shop_members
set membership_status = 'active', suspended_at = null
where profile_id = '00000000-0000-4000-8000-000000000401'
  and shop_id = '10000000-0000-4000-8000-000000000401';

select throws_ok(
  $$
    update app_private.wechat_product_image_intent_receipts
    set result = result || '{"tampered":true}'::jsonb
    where idempotency_key = '50000000-0000-4000-8000-000000000401'
  $$,
  '55000', 'wechat_product_image_intent_receipts is append-only',
  'durable image-intent receipts cannot be mutated'
);

-- Fresh keys and random unknown products used to bypass the legacy version-row
-- counts and grow both receipts and denial audits without bound. Admission now
-- happens before lookup; transient/deterministic denials are not receipted.
insert into image_intent_results
select 'not_found_flood_' || series.n,
  public.product_image_create_intent_wechat_v1(
    '00000000-0000-4000-8000-000000000405',
    '10000000-0000-4000-8000-000000000401',
    gen_random_uuid(),
    repeat('6', 64), 700000, 1600, 1200,
    repeat('7', 64), 90000, 384, 288,
    gen_random_uuid(), gen_random_uuid()
  )
from generate_series(1, 25) series(n);
select results_eq(
  $$
    select result->>'code', count(*)::bigint
    from image_intent_results
    where result_key like 'not_found_flood_%'
    group by result->>'code'
    order by result->>'code'
  $$,
  $$ values ('not_found'::text, 20::bigint),
            ('rate_limited'::text, 5::bigint) $$,
  'unknown-product requests are bounded before lookup at twenty per actor'
);
select is(
  (select count(*)::integer
    from app_private.wechat_product_image_intent_receipts
    where actor_profile_id = '00000000-0000-4000-8000-000000000405'),
  0, 'unknown-product and rate denials do not consume durable receipts'
);
select is(
  (select count(*)::integer from public.audit_logs audit
    where audit.actor_profile_id = '00000000-0000-4000-8000-000000000405'
      and audit.shop_id = '10000000-0000-4000-8000-000000000401'
      and audit.event_key = 'shop.product_image.intent_denied'),
  20, 'unknown-product denial audit growth is bounded by admission'
);
select is(
  (select admitted_count
    from app_private.wechat_product_image_intent_actor_rate_limits
    where actor_profile_id = '00000000-0000-4000-8000-000000000405'),
  20, 'image-intent actor admission saturates without overflow'
);
select is(
  public.product_image_create_intent_wechat_v1(
    '00000000-0000-4000-8000-000000000405',
    '10000000-0000-4000-8000-000000000402', gen_random_uuid(),
    repeat('6', 64), 700000, 1600, 1200,
    repeat('7', 64), 90000, 384, 288,
    gen_random_uuid(), gen_random_uuid()
  )->>'code',
  'rate_limited', 'actor twenty-intent limit remains global across shops'
);

-- Nineteen pre-existing actor rows plus one accepted legacy intent reaches
-- the canonical 20/15-minute ceiling. A different product then fails closed.
insert into public.inventory_product_image_versions (
  id, shop_id, product_id, main_path, thumb_path,
  expected_main_sha256, expected_main_bytes,
  expected_main_width, expected_main_height,
  expected_thumb_sha256, expected_thumb_bytes,
  expected_thumb_width, expected_thumb_height,
  requested_by_profile_id, actor_kind, status, created_at
)
select version_id,
  '10000000-0000-4000-8000-000000000401',
  '20000000-0000-4000-8000-000000000402',
  'shops/10000000-0000-4000-8000-000000000401/products/'
    || '20000000-0000-4000-8000-000000000402/primary/'
    || version_id::text || '/main.jpg',
  'shops/10000000-0000-4000-8000-000000000401/products/'
    || '20000000-0000-4000-8000-000000000402/primary/'
    || version_id::text || '/thumb.jpg',
  repeat('d', 64), 700000, 1600, 1200,
  repeat('e', 64), 90000, 384, 288,
  '00000000-0000-4000-8000-000000000402',
  'personal_account', 'failed', clock_timestamp()
from (
  select gen_random_uuid() as version_id
  from generate_series(1, 19)
) fixture;

select is(
  public.product_image_create_intent(
    '00000000-0000-4000-8000-000000000402', 'personal_account',
    '10000000-0000-4000-8000-000000000401',
    '20000000-0000-4000-8000-000000000402',
    repeat('f', 64), 700000, 1600, 1200,
    repeat('0', 64), 90000, 384, 288
  )->>'code',
  'upload_required', 'twentieth actor intent is admitted through legacy RPC'
);
select is(
  public.product_image_create_intent_wechat_v1(
    '00000000-0000-4000-8000-000000000402',
    '10000000-0000-4000-8000-000000000401',
    '20000000-0000-4000-8000-000000000403',
    repeat('1', 64), 700000, 1600, 1200,
    repeat('2', 64), 90000, 384, 288,
    '50000000-0000-4000-8000-000000000402',
    '51000000-0000-4000-8000-000000000402'
  )->>'code',
  'rate_limited', 'twenty-first actor intent is rejected across products'
);
select is(
  (select count(*)::integer
    from app_private.wechat_product_image_intent_receipts
    where idempotency_key = '50000000-0000-4000-8000-000000000402'),
  0, 'rate-limited intent is not durably receipted'
);

update app_private.wechat_product_image_intent_shop_rate_limits
set admitted_count = 100,
    window_started_at = clock_timestamp(),
    updated_at = clock_timestamp()
where shop_id = '10000000-0000-4000-8000-000000000401';
select is(
  public.product_image_create_intent_wechat_v1(
    '00000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000401', gen_random_uuid(),
    repeat('8', 64), 700000, 1600, 1200,
    repeat('9', 64), 90000, 384, 288,
    gen_random_uuid(), gen_random_uuid()
  )->>'code',
  'rate_limited', 'shop admission caps fresh intents at one hundred per hour'
);
select is(
  (select admitted_count
    from app_private.wechat_product_image_intent_shop_rate_limits
    where shop_id = '10000000-0000-4000-8000-000000000401'),
  100, 'shop image-intent admission saturates without overflow'
);

select ok(
  not has_table_privilege(
    'authenticated', 'public.inventory_product_image_versions', 'DELETE'
  ),
  'image-intent fix does not expose hard delete'
);

insert into app_private.wechat_product_image_intent_receipts (
  shop_id, actor_profile_id, idempotency_key, correlation_id, product_id,
  request_hash, result, created_at
) values (
  '10000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000401',
  '50000000-0000-4000-8000-000000000499',
  '51000000-0000-4000-8000-000000000498',
  '20000000-0000-4000-8000-000000000401',
  repeat('a', 64),
  '{"ok":true,"code":"checksum_noop"}'::jsonb,
  statement_timestamp() - interval '31 days'
);
select is(
  app_private.cleanup_wechat_image_intent_receipts_v1(100),
  1, 'private image cleanup removes only receipts beyond thirty days'
);
select ok(
  not exists (
    select 1 from app_private.wechat_product_image_intent_receipts
    where idempotency_key = '50000000-0000-4000-8000-000000000499'
  )
  and exists (
    select 1 from app_private.wechat_product_image_intent_receipts
    where idempotency_key = '50000000-0000-4000-8000-000000000401'
  ),
  'image receipt cleanup preserves the active retry horizon'
);

select * from finish();
rollback;
