begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_table(
  'public',
  'pos_article_mutation_receipts',
  'TASK-145 stores immutable article mutation receipts'
);
select has_table(
  'public',
  'pos_article_mutation_conflict_receipts',
  'TASK-145 stores immutable terminal conflict receipts'
);
select has_column(
  'public',
  'pos_sale_stock_movements',
  'pos_article_mutation_id',
  'manual stock adjustments reuse the existing stock movement domain'
);
select has_function(
  'public',
  'pos_article_mutation_apply_v1',
  array[
    'uuid', 'uuid', 'uuid', 'uuid', 'integer',
    'text', 'text', 'jsonb', 'text'
  ],
  'TASK-145 exposes one lease-bound transaction RPC'
);
select has_function(
  'public',
  'pos_article_mutation_cleanup_synthetic_v1',
  array['uuid', 'text'],
  'TASK-145 exposes a bounded synthetic cleanup transaction'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.pos_article_mutation_apply_v1(uuid,uuid,uuid,uuid,integer,text,text,jsonb,text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.pos_article_mutation_apply_v1(uuid,uuid,uuid,uuid,integer,text,text,jsonb,text)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.pos_article_mutation_apply_v1(uuid,uuid,uuid,uuid,integer,text,text,jsonb,text)',
    'execute'
  ),
  'only service_role can execute the POS article mutation RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.pos_article_mutation_cleanup_synthetic_v1(uuid,text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.pos_article_mutation_cleanup_synthetic_v1(uuid,text)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.pos_article_mutation_cleanup_synthetic_v1(uuid,text)',
    'execute'
  ),
  'only service_role can execute the synthetic cleanup RPC'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.pos_article_mutation_receipts',
    'select'
  )
  and not has_table_privilege(
    'anon',
    'public.pos_article_mutation_receipts',
    'select'
  ),
  'client roles cannot read mutation receipts'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.pos_article_mutation_conflict_receipts',
    'select'
  )
  and not has_table_privilege(
    'anon',
    'public.pos_article_mutation_conflict_receipts',
    'select'
  ),
  'client roles cannot read conflict receipts'
);
select has_trigger(
  'public',
  'pos_article_mutation_receipts',
  'pos_article_mutation_receipts_no_update_delete',
  'receipt rows are append-only'
);
select has_trigger(
  'public',
  'pos_article_mutation_conflict_receipts',
  'pos_article_mutation_conflict_receipts_no_update_delete',
  'conflict receipt rows are append-only'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000145',
  'authenticated',
  'authenticated',
  'task145-owner@example.invalid',
  '{}',
  '{}',
  clock_timestamp(),
  clock_timestamp()
);

insert into public.profiles(profile_id, display_name, profile_status)
values (
  '00000000-0000-4000-8000-000000000145',
  'TASK-145 synthetic owner',
  'active'
) on conflict (profile_id) do update
set display_name = excluded.display_name,
    profile_status = excluded.profile_status;

insert into public.shops(
  shop_id, shop_code, shop_name, shop_status, created_by_profile_id
) values (
  '10000000-0000-4000-8000-000000000145',
  'TASK145QA_TESTRUN145',
  'TASK145QA_TESTRUN145',
  'active',
  '00000000-0000-4000-8000-000000000145'
);

insert into public.shop_members(
  profile_id, shop_id, role_key, membership_status
) values (
  '00000000-0000-4000-8000-000000000145',
  '10000000-0000-4000-8000-000000000145',
  'shop_owner',
  'active'
);

insert into public.staff_accounts(
  staff_id, shop_id, staff_code, display_name, role_key, status,
  credential_kind, credential_hash, credential_updated_at,
  credential_expires_at, must_change_credential, credential_version,
  credential_status
) values (
  '20000000-0000-4000-8000-000000000145',
  '10000000-0000-4000-8000-000000000145',
  'POS145',
  'TASK-145 synthetic POS admin',
  'pos_admin',
  'active',
  'password',
  'argon2id:task145qa:testrun145:redacted-fixture',
  clock_timestamp(),
  clock_timestamp() + interval '4 hours',
  false,
  7,
  'active'
);

insert into public.staff_role_permissions(
  shop_id, role_key, permission_key, enabled
) values (
  '10000000-0000-4000-8000-000000000145',
  'pos_admin',
  'catalog.write',
  true
) on conflict (shop_id, role_key, permission_key)
do update set enabled = true;

insert into public.inventory_categories(
  id, owner_user_id, shop_id, name, updated_at
) values (
  '31000000-0000-4000-8000-000000000145',
  '00000000-0000-4000-8000-000000000145',
  '10000000-0000-4000-8000-000000000145',
  'TASK145QA_TESTRUN145_CATEGORY',
  statement_timestamp()
);
insert into public.inventory_suppliers(
  id, owner_user_id, shop_id, name, updated_at
) values (
  '32000000-0000-4000-8000-000000000145',
  '00000000-0000-4000-8000-000000000145',
  '10000000-0000-4000-8000-000000000145',
  'TASK145QA_TESTRUN145_SUPPLIER',
  statement_timestamp()
);

create temporary table task145_runtime(
  shop_device_id uuid,
  pos_session_id uuid
) on commit drop;
create temporary table task145_results(
  label text primary key,
  result jsonb not null
) on commit drop;
grant select, insert, update on task145_runtime, task145_results
  to service_role;

set local role service_role;
with login as (
  select public.pos_runtime_first_login_commit_v2(
    '10000000-0000-4000-8000-000000000145',
    '20000000-0000-4000-8000-000000000145',
    7,
    'task145qa:testrun145:device',
    'TASK-145 synthetic device',
    '1.0-fixture',
    'sha256:' || repeat('1', 64),
    15552000,
    'sha256:' || repeat('2', 64),
    43200,
    jsonb_build_object(
      'app_version_present', true,
      'source', 'TASK-145'
    )
  ) result
)
insert into task145_runtime(shop_device_id, pos_session_id)
select
  (result->>'shopDeviceId')::uuid,
  (result->>'posSessionId')::uuid
from login;

set local role postgres;
select is(
  (select count(*)::integer from task145_runtime),
  1,
  'synthetic trusted POS runtime lease is active'
);

create function pg_temp.task145_apply(p_mutation jsonb)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select public.pos_article_mutation_apply_v1(
    '10000000-0000-4000-8000-000000000145',
    runtime.shop_device_id,
    '20000000-0000-4000-8000-000000000145',
    runtime.pos_session_id,
    7,
    'pos-article-mutation-v1',
    '1.0-fixture',
    p_mutation,
    p_mutation->>'payloadHash'
  )
  from pg_temp.task145_runtime runtime
$$;
grant execute on function pg_temp.task145_apply(jsonb) to service_role;

set local role service_role;
insert into task145_results(label, result)
values (
  'create',
  pg_temp.task145_apply(jsonb_build_object(
    'mutationId', 'task145qa:testrun145:create',
    'idempotencyKey', 'task145qa:testrun145:idem-create',
    'payloadHash', 'sha256:' || repeat('a', 64),
    'attemptToken', 'task145qa:testrun145:attempt-create-1',
    'mutationKind', 'product_create',
    'clientProductId', 'task145qa:testrun145:client-primary',
    'remoteProductId', null,
    'baseRevision', null,
    'localSequence', 1,
    'fieldMask', '[]'::jsonb,
    'changes', jsonb_build_object(
      'barcode', 'TASK145QA_TESTRUN145_P001',
      'itemNumber', 'ART-145-001',
      'primaryName', 'TASK-145 primary product',
      'secondaryName', 'TASK-145 secondary',
      'categoryId', '31000000-0000-4000-8000-000000000145',
      'supplierId', '32000000-0000-4000-8000-000000000145',
      'retailPrice', 1450,
      'purchasePrice', 900,
      'stockQuantity', 10
    ),
    'createdAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'occurredAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  ))
);

set local role postgres;
select is(
  (select result#>>'{ack,code}' from task145_results where label = 'create'),
  'applied',
  'product_create is applied'
);
select ok(
  exists (
    select 1
    from public.inventory_products product
    join task145_results response
      on product.id = (response.result#>>'{ack,remoteProductId}')::uuid
    where response.label = 'create'
      and product.shop_id = '10000000-0000-4000-8000-000000000145'
      and product.barcode = 'TASK145QA_TESTRUN145_P001'
      and product.item_number = 'ART-145-001'
      and product.product_name = 'TASK-145 primary product'
      and product.second_product_name = 'TASK-145 secondary'
      and product.category_id = '31000000-0000-4000-8000-000000000145'
      and product.supplier_id = '32000000-0000-4000-8000-000000000145'
      and product.retail_price = 1450
      and product.purchase_price = 900
      and product.stock_quantity = 10
  ),
  'create persists the full canonical product field set'
);
select ok(
  (
    select result#>>'{ack,authoritativeRevision}'
      ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'
      and result#>>'{ack,serverTimestamp}'
        ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'
      and result#>>'{ack,catalogRevision}' ~ '^[1-9]\d*$'
    from task145_results
    where label = 'create'
  ),
  'ACK publishes authoritative product/catalog revisions and database time'
);

set local role service_role;
insert into task145_results(label, result)
select
  'create_replay',
  pg_temp.task145_apply(
    jsonb_set(
      receipt.ack_seed,
      '{attemptToken}',
      to_jsonb('task145qa:testrun145:attempt-create-2'::text)
    )
  )
from (
  select jsonb_build_object(
    'mutationId', 'task145qa:testrun145:create',
    'idempotencyKey', 'task145qa:testrun145:idem-create',
    'payloadHash', 'sha256:' || repeat('a', 64),
    'attemptToken', 'task145qa:testrun145:attempt-create-1',
    'mutationKind', 'product_create',
    'clientProductId', 'task145qa:testrun145:client-primary',
    'remoteProductId', null,
    'baseRevision', null,
    'localSequence', 1,
    'fieldMask', '[]'::jsonb,
    'changes', jsonb_build_object(
      'barcode', 'TASK145QA_TESTRUN145_P001',
      'itemNumber', 'ART-145-001',
      'primaryName', 'TASK-145 primary product',
      'secondaryName', 'TASK-145 secondary',
      'categoryId', '31000000-0000-4000-8000-000000000145',
      'supplierId', '32000000-0000-4000-8000-000000000145',
      'retailPrice', 1450,
      'purchasePrice', 900,
      'stockQuantity', 10
    ),
    'createdAt', receipt.client_created_at,
    'occurredAt', receipt.occurred_at
  ) ack_seed
  from public.pos_article_mutation_receipts receipt
  where receipt.mutation_id = 'task145qa:testrun145:create'
) receipt;

set local role postgres;
select is(
  (select result->>'code' from task145_results where label = 'create_replay'),
  'duplicate_replay',
  'same mutation identity and hash is a duplicate replay'
);
select is(
  (
    select replay.result->'ack'
    from task145_results replay
    where replay.label = 'create_replay'
  ),
  (
    select original.result->'ack'
    from task145_results original
    where original.label = 'create'
  ),
  'replay returns the byte-equivalent stored original ACK'
);
select is(
  (
    select count(*)::integer
    from public.pos_article_mutation_receipts
    where mutation_id = 'task145qa:testrun145:create'
  ),
  1,
  'replay does not duplicate the immutable receipt'
);

set local role service_role;
insert into task145_results(label, result)
select
  'payload_mismatch',
  pg_temp.task145_apply(
    jsonb_build_object(
      'mutationId', 'task145qa:testrun145:create',
      'idempotencyKey', 'task145qa:testrun145:idem-create',
      'payloadHash', 'sha256:' || repeat('b', 64),
      'attemptToken', 'task145qa:testrun145:attempt-mismatch',
      'mutationKind', 'product_create',
      'clientProductId', 'task145qa:testrun145:client-primary',
      'remoteProductId', null,
      'baseRevision', null,
      'localSequence', 1,
      'fieldMask', '[]'::jsonb,
      'changes', jsonb_build_object(
        'barcode', 'TASK145QA_TESTRUN145_CHANGED',
        'primaryName', 'Changed payload'
      ),
      'createdAt', receipt.client_created_at,
      'occurredAt', receipt.occurred_at
    )
  )
from public.pos_article_mutation_receipts receipt
where receipt.mutation_id = 'task145qa:testrun145:create';

set local role postgres;
select is(
  (
    select result->>'code'
    from task145_results
    where label = 'payload_mismatch'
  ),
  'idempotency_payload_mismatch',
  'same mutation/idempotency identity with a different hash fails closed'
);
select is(
  (
    select count(*)::integer
    from public.inventory_products
    where shop_id = '10000000-0000-4000-8000-000000000145'
      and barcode = 'TASK145QA_TESTRUN145_CHANGED'
  ),
  0,
  'payload mismatch performs no catalog DML'
);
select is(
  (
    select count(*)::integer
    from public.pos_article_mutation_conflict_receipts
    where mutation_id = 'task145qa:testrun145:create'
      and payload_hash = 'sha256:' || repeat('b', 64)
      and mutation_status = 'idempotency_payload_mismatch'
  ),
  1,
  'payload mismatch stores one separate terminal conflict receipt'
);
select is(
  (
    select count(*)::integer
    from public.audit_logs audit
    where audit.shop_id = '10000000-0000-4000-8000-000000000145'
      and audit.event_key = 'pos.catalog.article_mutation.failure'
      and audit.metadata_redacted->>'code' =
        'idempotency_payload_mismatch'
  ),
  1,
  'payload mismatch appends one redacted audit row'
);

set local role service_role;
insert into task145_results(label, result)
select
  'payload_mismatch_replay',
  pg_temp.task145_apply(
    jsonb_build_object(
      'mutationId', 'task145qa:testrun145:create',
      'idempotencyKey', 'task145qa:testrun145:idem-create',
      'payloadHash', 'sha256:' || repeat('b', 64),
      'attemptToken', 'task145qa:testrun145:attempt-mismatch-retry',
      'mutationKind', 'product_create',
      'clientProductId', 'task145qa:testrun145:client-primary',
      'remoteProductId', null,
      'baseRevision', null,
      'localSequence', 1,
      'fieldMask', '[]'::jsonb,
      'changes', jsonb_build_object(
        'barcode', 'TASK145QA_TESTRUN145_CHANGED',
        'primaryName', 'Changed payload'
      ),
      'createdAt', receipt.client_created_at,
      'occurredAt', receipt.occurred_at
    )
  )
from public.pos_article_mutation_receipts receipt
where receipt.mutation_id = 'task145qa:testrun145:create';

set local role postgres;
select is(
  (
    select replay.result->'ack'
    from task145_results replay
    where replay.label = 'payload_mismatch_replay'
  ),
  (
    select original.result->'ack'
    from task145_results original
    where original.label = 'payload_mismatch'
  ),
  'payload mismatch replay with a new attempt returns the original ACK'
);
select is(
  (
    select count(*)::integer
    from public.pos_article_mutation_conflict_receipts
    where mutation_id = 'task145qa:testrun145:create'
      and payload_hash = 'sha256:' || repeat('b', 64)
  ),
  1,
  'new attempt cannot duplicate the immutable payload mismatch receipt'
);

set local role service_role;
insert into task145_results(label, result)
values (
  'invalid_non_update_mask',
  pg_temp.task145_apply(jsonb_build_object(
    'mutationId', 'task145qa:testrun145:invalid-mask',
    'idempotencyKey', 'task145qa:testrun145:idem-invalid-mask',
    'payloadHash', 'sha256:' || repeat('0', 64),
    'attemptToken', 'task145qa:testrun145:attempt-invalid-mask',
    'mutationKind', 'product_create',
    'clientProductId', 'task145qa:testrun145:client-invalid-mask',
    'remoteProductId', null,
    'baseRevision', null,
    'localSequence', 1,
    'fieldMask', jsonb_build_array('barcode'),
    'changes', jsonb_build_object(
      'barcode', 'TASK145QA_TESTRUN145_INVALID_MASK',
      'primaryName', 'Invalid field mask'
    ),
    'createdAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'occurredAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  ))
);

set local role postgres;
select is(
  (
    select result->>'code'
    from task145_results
    where label = 'invalid_non_update_mask'
  ),
  'failed_validation',
  'non-update mutations reject a non-empty field mask'
);
select is(
  (
    select count(*)::integer
    from public.inventory_products
    where barcode = 'TASK145QA_TESTRUN145_INVALID_MASK'
  ),
  0,
  'invalid non-update field intent performs no catalog DML'
);

set local role service_role;
insert into task145_results(label, result)
select
  'update',
  pg_temp.task145_apply(jsonb_build_object(
    'mutationId', 'task145qa:testrun145:update',
    'idempotencyKey', 'task145qa:testrun145:idem-update',
    'payloadHash', 'sha256:' || repeat('c', 64),
    'attemptToken', 'task145qa:testrun145:attempt-update',
    'mutationKind', 'product_update',
    'clientProductId', 'task145qa:testrun145:client-primary',
    'remoteProductId', create_result.result#>>'{ack,remoteProductId}',
    'baseRevision', create_result.result#>>'{ack,authoritativeRevision}',
    'localSequence', 2,
    'fieldMask', jsonb_build_array(
      'barcode', 'itemNumber', 'primaryName', 'secondaryName',
      'categoryId', 'supplierId'
    ),
    'changes', jsonb_build_object(
      'barcode', 'TASK145QA_TESTRUN145_P002',
      'itemNumber', 'ART-145-002',
      'primaryName', 'TASK-145 updated primary',
      'secondaryName', 'TASK-145 updated secondary',
      'categoryId', null,
      'supplierId', null
    ),
    'createdAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'occurredAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  ))
from task145_results create_result
where create_result.label = 'create';

set local role postgres;
select is(
  (select result#>>'{ack,code}' from task145_results where label = 'update'),
  'applied',
  'product_update is applied with optimistic concurrency'
);
select ok(
  exists (
    select 1
    from public.inventory_products product
    join task145_results response
      on product.id = (response.result#>>'{ack,remoteProductId}')::uuid
    where response.label = 'update'
      and product.barcode = 'TASK145QA_TESTRUN145_P002'
      and product.item_number = 'ART-145-002'
      and product.product_name = 'TASK-145 updated primary'
      and product.second_product_name = 'TASK-145 updated secondary'
      and product.category_id is null
      and product.supplier_id is null
      and product.retail_price = 1450
      and product.purchase_price = 900
      and product.stock_quantity = 10
  ),
  'field mask changes only explicit fields and preserves omitted values'
);

set local role service_role;
insert into task145_results(label, result)
select
  'stale_update',
  pg_temp.task145_apply(jsonb_build_object(
    'mutationId', 'task145qa:testrun145:stale-update',
    'idempotencyKey', 'task145qa:testrun145:idem-stale-update',
    'payloadHash', 'sha256:' || repeat('d', 64),
    'attemptToken', 'task145qa:testrun145:attempt-stale-update',
    'mutationKind', 'product_update',
    'clientProductId', 'task145qa:testrun145:client-primary',
    'remoteProductId', create_result.result#>>'{ack,remoteProductId}',
    'baseRevision', create_result.result#>>'{ack,authoritativeRevision}',
    'localSequence', 3,
    'fieldMask', jsonb_build_array('primaryName'),
    'changes', jsonb_build_object('primaryName', 'Stale overwrite forbidden'),
    'createdAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'occurredAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  ))
from task145_results create_result
where create_result.label = 'create';

set local role postgres;
select is(
  (
    select result#>>'{ack,code}'
    from task145_results
    where label = 'stale_update'
  ),
  'failed_conflict',
  'stale base revision is a deterministic conflict'
);
select is(
  (
    select product_name
    from public.inventory_products
    where barcode = 'TASK145QA_TESTRUN145_P002'
  ),
  'TASK-145 updated primary',
  'stale conflict never performs last-write-wins'
);

set local role service_role;
insert into task145_results(label, result)
select
  'retail_price',
  pg_temp.task145_apply(jsonb_build_object(
    'mutationId', 'task145qa:testrun145:retail-price',
    'idempotencyKey', 'task145qa:testrun145:idem-retail-price',
    'payloadHash', 'sha256:' || repeat('e', 64),
    'attemptToken', 'task145qa:testrun145:attempt-retail-price',
    'mutationKind', 'product_retail_price_change',
    'clientProductId', 'task145qa:testrun145:client-primary',
    'remoteProductId', update_result.result#>>'{ack,remoteProductId}',
    'baseRevision', update_result.result#>>'{ack,authoritativeRevision}',
    'localSequence', 4,
    'fieldMask', '[]'::jsonb,
    'changes', jsonb_build_object('price', 1550),
    'createdAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'occurredAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  ))
from task145_results update_result
where update_result.label = 'update';

set local role postgres;
select is(
  (
    select result#>>'{ack,code}'
    from task145_results
    where label = 'retail_price'
  ),
  'applied',
  'retail price change is applied'
);
select ok(
  exists (
    select 1
    from public.inventory_product_prices price
    join task145_results response
      on price.id = (response.result#>>'{ack,priceHistoryId}')::uuid
    join public.inventory_products product on product.id = price.product_id
    where response.label = 'retail_price'
      and price.type = 'RETAIL'
      and price.price = 1550
      and product.retail_price = 1550
  ),
  'retail price and exactly identified history row publish atomically'
);

set local role service_role;
insert into task145_results(label, result)
select
  'retail_price_replay',
  pg_temp.task145_apply(jsonb_set(
    jsonb_build_object(
      'mutationId', receipt.mutation_id,
      'idempotencyKey', receipt.idempotency_key,
      'payloadHash', receipt.payload_hash,
      'attemptToken', receipt.attempt_token,
      'mutationKind', receipt.mutation_kind,
      'clientProductId', receipt.client_product_id,
      'remoteProductId', receipt.target_remote_product_id,
      'baseRevision', receipt.base_revision,
      'localSequence', receipt.local_sequence,
      'fieldMask', receipt.field_mask,
      'changes', jsonb_build_object('price', 1550),
      'createdAt', receipt.client_created_at,
      'occurredAt', receipt.occurred_at
    ),
    '{attemptToken}',
    to_jsonb('task145qa:testrun145:attempt-retail-price-2'::text)
  ))
from public.pos_article_mutation_receipts receipt
where receipt.mutation_id = 'task145qa:testrun145:retail-price';

set local role postgres;
select is(
  (
    select result->>'code'
    from task145_results
    where label = 'retail_price_replay'
  ),
  'duplicate_replay',
  'price retry replays the stored ACK'
);
select is(
  (
    select count(*)::integer
    from public.inventory_product_prices price
    join task145_results response
      on price.product_id =
        (response.result#>>'{ack,remoteProductId}')::uuid
    where response.label = 'retail_price'
      and price.type = 'RETAIL'
      and price.source = 'pos_article_mutation_v1'
  ),
  1,
  'price replay never duplicates history'
);

set local role service_role;
insert into task145_results(label, result)
select
  'purchase_price',
  pg_temp.task145_apply(jsonb_build_object(
    'mutationId', 'task145qa:testrun145:purchase-price',
    'idempotencyKey', 'task145qa:testrun145:idem-purchase-price',
    'payloadHash', 'sha256:' || repeat('f', 64),
    'attemptToken', 'task145qa:testrun145:attempt-purchase-price',
    'mutationKind', 'product_purchase_price_change',
    'clientProductId', 'task145qa:testrun145:client-primary',
    'remoteProductId', retail.result#>>'{ack,remoteProductId}',
    'baseRevision', retail.result#>>'{ack,authoritativeRevision}',
    'localSequence', 5,
    'fieldMask', '[]'::jsonb,
    'changes', jsonb_build_object('price', 950),
    'createdAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'occurredAt', to_char(
      (clock_timestamp() + interval '1 microsecond') at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  ))
from task145_results retail
where retail.label = 'retail_price';

set local role postgres;
select is(
  (
    select result#>>'{ack,code}'
    from task145_results
    where label = 'purchase_price'
  ),
  'applied',
  'purchase price change is applied'
);
select ok(
  exists (
    select 1
    from public.inventory_product_prices price
    join task145_results response
      on price.id = (response.result#>>'{ack,priceHistoryId}')::uuid
    join public.inventory_products product on product.id = price.product_id
    where response.label = 'purchase_price'
      and price.type = 'PURCHASE'
      and price.price = 950
      and product.purchase_price = 950
  ),
  'purchase price and its history row publish atomically'
);

set local role service_role;
insert into task145_results(label, result)
select
  'stock',
  pg_temp.task145_apply(jsonb_build_object(
    'mutationId', 'task145qa:testrun145:stock',
    'idempotencyKey', 'task145qa:testrun145:idem-stock',
    'payloadHash', 'sha256:' || repeat('1', 64),
    'attemptToken', 'task145qa:testrun145:attempt-stock',
    'mutationKind', 'product_manual_stock_adjustment',
    'clientProductId', 'task145qa:testrun145:client-primary',
    'remoteProductId', price.result#>>'{ack,remoteProductId}',
    'baseRevision', price.result#>>'{ack,authoritativeRevision}',
    'localSequence', 6,
    'fieldMask', '[]'::jsonb,
    'changes', jsonb_build_object(
      'quantityDelta', -2,
      'reason', 'count_correction'
    ),
    'createdAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'occurredAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  ))
from task145_results price
where price.label = 'purchase_price';

set local role postgres;
select is(
  (select result#>>'{ack,code}' from task145_results where label = 'stock'),
  'applied',
  'manual signed stock delta is applied'
);
select ok(
  exists (
    select 1
    from public.pos_sale_stock_movements movement
    join task145_results response
      on movement.pos_sale_stock_movement_id =
        (response.result#>>'{ack,stockMovementId}')::uuid
    join public.inventory_products product on product.id = movement.product_id
    where response.label = 'stock'
      and movement.movement_kind = 'manual_adjustment'
      and movement.pos_article_mutation_id = 'task145qa:testrun145:stock'
      and movement.pos_sale_id is null
      and movement.pos_sale_line_id is null
      and movement.quantity_delta = -2
      and movement.stock_before = 10
      and movement.stock_after = 8
      and product.stock_quantity = 8
  ),
  'manual adjustment reuses stock movements without manufacturing a sale'
);
select is(
  (
    select count(*)::integer
    from public.pos_revenue_ledger_entries
    where shop_id = '10000000-0000-4000-8000-000000000145'
  ),
  0,
  'manual stock adjustment never duplicates the sales revenue ledger'
);

set local role service_role;
insert into task145_results(label, result)
select
  'negative_stock',
  pg_temp.task145_apply(jsonb_build_object(
    'mutationId', 'task145qa:testrun145:negative-stock',
    'idempotencyKey', 'task145qa:testrun145:idem-negative-stock',
    'payloadHash', 'sha256:' || repeat('2', 64),
    'attemptToken', 'task145qa:testrun145:attempt-negative-stock',
    'mutationKind', 'product_manual_stock_adjustment',
    'clientProductId', 'task145qa:testrun145:client-primary',
    'remoteProductId', stock.result#>>'{ack,remoteProductId}',
    'baseRevision', stock.result#>>'{ack,authoritativeRevision}',
    'localSequence', 7,
    'fieldMask', '[]'::jsonb,
    'changes', jsonb_build_object('quantityDelta', -100, 'reason', 'loss'),
    'createdAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'occurredAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  ))
from task145_results stock
where stock.label = 'stock';

set local role postgres;
select is(
  (
    select result#>>'{ack,code}'
    from task145_results
    where label = 'negative_stock'
  ),
  'failed_conflict',
  'negative stock is rejected as a deterministic conflict'
);
select is(
  (
    select stock_quantity
    from public.inventory_products
    where barcode = 'TASK145QA_TESTRUN145_P002'
  ),
  8::double precision,
  'failed stock conflict rolls back the product update'
);
select is(
  (
    select count(*)::integer
    from public.pos_sale_stock_movements
    where pos_article_mutation_id = 'task145qa:testrun145:negative-stock'
  ),
  0,
  'failed stock conflict creates no movement'
);

set local role service_role;
insert into task145_results(label, result)
select
  'deactivate',
  pg_temp.task145_apply(jsonb_build_object(
    'mutationId', 'task145qa:testrun145:deactivate',
    'idempotencyKey', 'task145qa:testrun145:idem-deactivate',
    'payloadHash', 'sha256:' || repeat('3', 64),
    'attemptToken', 'task145qa:testrun145:attempt-deactivate',
    'mutationKind', 'product_deactivate',
    'clientProductId', 'task145qa:testrun145:client-primary',
    'remoteProductId', stock.result#>>'{ack,remoteProductId}',
    'baseRevision', stock.result#>>'{ack,authoritativeRevision}',
    'localSequence', 8,
    'fieldMask', '[]'::jsonb,
    'changes', '{}'::jsonb,
    'createdAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'occurredAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  ))
from task145_results stock
where stock.label = 'stock';

set local role postgres;
select is(
  (
    select result#>>'{ack,code}'
    from task145_results
    where label = 'deactivate'
  ),
  'applied',
  'product_deactivate is applied'
);
select ok(
  (
    select deleted_at is not null
    from public.inventory_products
    where id = (
      select (result#>>'{ack,remoteProductId}')::uuid
      from task145_results
      where label = 'deactivate'
    )
  ),
  'deactivate publishes the catalog tombstone'
);

set local role service_role;
insert into task145_results(label, result)
select
  'activate',
  pg_temp.task145_apply(jsonb_build_object(
    'mutationId', 'task145qa:testrun145:activate',
    'idempotencyKey', 'task145qa:testrun145:idem-activate',
    'payloadHash', 'sha256:' || repeat('4', 64),
    'attemptToken', 'task145qa:testrun145:attempt-activate',
    'mutationKind', 'product_activate',
    'clientProductId', 'task145qa:testrun145:client-primary',
    'remoteProductId', deactivated.result#>>'{ack,remoteProductId}',
    'baseRevision', deactivated.result#>>'{ack,authoritativeRevision}',
    'localSequence', 9,
    'fieldMask', '[]'::jsonb,
    'changes', '{}'::jsonb,
    'createdAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'occurredAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  ))
from task145_results deactivated
where deactivated.label = 'deactivate';

set local role postgres;
select is(
  (select result#>>'{ack,code}' from task145_results where label = 'activate'),
  'applied',
  'product_activate is applied'
);
select ok(
  (
    select deleted_at is null
    from public.inventory_products
    where id = (
      select (result#>>'{ack,remoteProductId}')::uuid
      from task145_results
      where label = 'activate'
    )
  ),
  'activate restores the same authoritative product identity'
);

set local role service_role;
insert into task145_results(label, result)
select
  'duplicate',
  pg_temp.task145_apply(jsonb_build_object(
    'mutationId', 'task145qa:testrun145:duplicate',
    'idempotencyKey', 'task145qa:testrun145:idem-duplicate',
    'payloadHash', 'sha256:' || repeat('5', 64),
    'attemptToken', 'task145qa:testrun145:attempt-duplicate',
    'mutationKind', 'product_duplicate',
    'clientProductId', 'task145qa:testrun145:client-duplicate',
    'remoteProductId', activated.result#>>'{ack,remoteProductId}',
    'baseRevision', activated.result#>>'{ack,authoritativeRevision}',
    'localSequence', 1,
    'fieldMask', '[]'::jsonb,
    'changes', jsonb_build_object(
      'barcode', 'TASK145QA_TESTRUN145_DUP',
      'primaryName', 'TASK-145 duplicate'
    ),
    'createdAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'occurredAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  ))
from task145_results activated
where activated.label = 'activate';

set local role postgres;
select is(
  (
    select result#>>'{ack,code}'
    from task145_results
    where label = 'duplicate'
  ),
  'applied',
  'product_duplicate is applied'
);
select isnt(
  (
    select result#>>'{ack,remoteProductId}'
    from task145_results
    where label = 'duplicate'
  ),
  (
    select result#>>'{ack,remoteProductId}'
    from task145_results
    where label = 'activate'
  ),
  'duplicate creates a new remote identity'
);

set local role service_role;
insert into task145_results(label, result)
select
  'retail_price_same_second',
  pg_temp.task145_apply(jsonb_build_object(
    'mutationId', 'task145qa:testrun145:retail-price-same-second',
    'idempotencyKey', 'task145qa:testrun145:idem-retail-price-same-second',
    'payloadHash', 'sha256:' || repeat('a', 64),
    'attemptToken', 'task145qa:testrun145:attempt-retail-price-same-second',
    'mutationKind', 'product_retail_price_change',
    'clientProductId', 'task145qa:testrun145:client-primary',
    'remoteProductId', activated.result#>>'{ack,remoteProductId}',
    'baseRevision', activated.result#>>'{ack,authoritativeRevision}',
    'localSequence', 10,
    'fieldMask', '[]'::jsonb,
    'changes', jsonb_build_object('price', 1600),
    'createdAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'occurredAt', to_char(
      first_price.occurred_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  ))
from task145_results activated
join public.pos_article_mutation_receipts first_price
  on first_price.mutation_id = 'task145qa:testrun145:retail-price'
where activated.label = 'activate';

set local role postgres;
select is(
  (
    select result#>>'{ack,code}'
    from task145_results
    where label = 'retail_price_same_second'
  ),
  'applied',
  'distinct price mutations in the same client second both apply'
);
select is(
  (
    select count(*)::integer
    from public.inventory_product_prices price
    join task145_results response
      on price.product_id =
        (response.result#>>'{ack,remoteProductId}')::uuid
    where response.label = 'retail_price_same_second'
      and price.type = 'RETAIL'
      and price.source = 'pos_article_mutation_v1'
      and app_private.sync_legacy_timestamp_is_canonical_v1(
        price.effective_at
      )
      and app_private.sync_legacy_timestamp_is_canonical_v1(
        price.created_at
      )
  ),
  2,
  'price history remains distinct and legacy timestamp canonical'
);
select is(
  (
    select revision.result->>'status'
    from task145_runtime runtime
    cross join lateral (
      select public.pos_catalog_revision_for_lease_v3(
        '10000000-0000-4000-8000-000000000145',
        runtime.shop_device_id,
        '20000000-0000-4000-8000-000000000145',
        runtime.pos_session_id
      ) result
    ) revision
  ),
  'ok',
  'price mutation leaves the immediate catalog revision pull readable'
);

set local role service_role;
insert into task145_results(label, result)
select
  'old_timestamp',
  pg_temp.task145_apply(jsonb_build_object(
    'mutationId', 'task145qa:testrun145:old-timestamp',
    'idempotencyKey', 'task145qa:testrun145:idem-old-timestamp',
    'payloadHash', 'sha256:' || repeat('b', 64),
    'attemptToken', 'task145qa:testrun145:attempt-old-timestamp',
    'mutationKind', 'product_update',
    'clientProductId', 'task145qa:testrun145:client-duplicate',
    'remoteProductId', duplicated.result#>>'{ack,remoteProductId}',
    'baseRevision', duplicated.result#>>'{ack,authoritativeRevision}',
    'localSequence', 2,
    'fieldMask', jsonb_build_array('primaryName'),
    'changes', jsonb_build_object('primaryName', 'Too old to apply'),
    'createdAt', to_char(
      (clock_timestamp() - interval '181 days') at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'occurredAt', to_char(
      (clock_timestamp() - interval '181 days') at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  ))
from task145_results duplicated
where duplicated.label = 'duplicate';

set local role postgres;
select is(
  (
    select result#>>'{ack,code}'
    from task145_results
    where label = 'old_timestamp'
  ),
  'failed_validation',
  'out-of-window client time is terminal failed_validation'
);
select is(
  (
    select count(*)::integer
    from public.pos_article_mutation_receipts
    where mutation_id = 'task145qa:testrun145:old-timestamp'
      and mutation_status = 'failed_validation'
  ),
  1,
  'terminal server-time validation stores exactly one replay receipt'
);
select is(
  (
    select product_name
    from public.inventory_products product
    join task145_results duplicated
      on product.id =
        (duplicated.result#>>'{ack,remoteProductId}')::uuid
    where duplicated.label = 'duplicate'
  ),
  'TASK-145 duplicate',
  'server-time validation performs no catalog DML'
);

set local role service_role;
insert into task145_results(label, result)
select
  'barcode_collision',
  pg_temp.task145_apply(jsonb_build_object(
    'mutationId', 'task145qa:testrun145:barcode-collision',
    'idempotencyKey', 'task145qa:testrun145:idem-barcode-collision',
    'payloadHash', 'sha256:' || repeat('6', 64),
    'attemptToken', 'task145qa:testrun145:attempt-barcode-collision',
    'mutationKind', 'product_create',
    'clientProductId', 'task145qa:testrun145:client-collision',
    'remoteProductId', null,
    'baseRevision', null,
    'localSequence', 1,
    'fieldMask', '[]'::jsonb,
    'changes', jsonb_build_object(
      'barcode', 'TASK145QA_TESTRUN145_P002',
      'primaryName', 'Collision must roll back'
    ),
    'createdAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'occurredAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  ));

set local role postgres;
select is(
  (
    select result#>>'{ack,code}'
    from task145_results
    where label = 'barcode_collision'
  ),
  'identity_conflict',
  'ambiguous barcode identity collision is typed'
);
select is(
  (
    select count(*)::integer
    from public.inventory_products
    where product_name = 'Collision must roll back'
  ),
  0,
  'identity collision rolls back product creation before storing failure ACK'
);

set local role service_role;
insert into task145_results(label, result)
values (
  'target_missing',
  pg_temp.task145_apply(jsonb_build_object(
    'mutationId', 'task145qa:testrun145:target-missing',
    'idempotencyKey', 'task145qa:testrun145:idem-target-missing',
    'payloadHash', 'sha256:' || repeat('7', 64),
    'attemptToken', 'task145qa:testrun145:attempt-target-missing',
    'mutationKind', 'product_update',
    'clientProductId', 'task145qa:testrun145:client-missing',
    'remoteProductId', '99000000-0000-4000-8000-000000000145',
    'baseRevision', '2026-07-28T06:45:00.000000Z',
    'localSequence', 1,
    'fieldMask', jsonb_build_array('primaryName'),
    'changes', jsonb_build_object('primaryName', 'Never created'),
    'createdAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'occurredAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  ))
);

set local role postgres;
select is(
  (
    select result#>>'{ack,code}'
    from task145_results
    where label = 'target_missing'
  ),
  'target_not_found',
  'missing remote product is typed without barcode fallback'
);

set local role service_role;
insert into task145_results(label, result)
select
  'attempt_collision',
  pg_temp.task145_apply(jsonb_build_object(
    'mutationId', 'task145qa:testrun145:attempt-collision',
    'idempotencyKey', 'task145qa:testrun145:idem-attempt-collision',
    'payloadHash', 'sha256:' || repeat('8', 64),
    'attemptToken', 'task145qa:testrun145:attempt-collision-retry',
    'mutationKind', 'product_update',
    'clientProductId', 'task145qa:testrun145:client-duplicate',
    'remoteProductId', duplicated.result#>>'{ack,remoteProductId}',
    'baseRevision', duplicated.result#>>'{ack,authoritativeRevision}',
    'localSequence', 2,
    'fieldMask', jsonb_build_array('primaryName'),
    'changes', jsonb_build_object('primaryName', 'Attempt collision'),
    'createdAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'occurredAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  ))
from task145_results duplicated
where duplicated.label = 'duplicate';

set local role postgres;
select is(
  (
    select result->>'code'
    from task145_results
    where label = 'attempt_collision'
  ),
  'identity_conflict',
  'attempt token cannot identify a different mutation'
);
select is(
  (
    select count(*)::integer
    from public.pos_article_mutation_receipts
    where mutation_id = 'task145qa:testrun145:attempt-collision'
  ),
  0,
  'mismatched attempt cannot alter the original durable identity state'
);
select is(
  (
    select count(*)::integer
    from public.pos_article_mutation_conflict_receipts
    where mutation_id = 'task145qa:testrun145:attempt-collision'
      and mutation_status = 'identity_conflict'
  ),
  1,
  'attempt collision stores one separate terminal conflict receipt'
);
select is(
  (
    select ack_response->>'code'
    from public.pos_article_mutation_conflict_receipts
    where mutation_id = 'task145qa:testrun145:attempt-collision'
  ),
  'identity_conflict',
  'conflict receipt stores the terminal ACK'
);
select is(
  (
    select count(*)::integer
    from public.audit_logs audit
    where audit.shop_id = '10000000-0000-4000-8000-000000000145'
      and audit.event_key = 'pos.catalog.article_mutation.failure'
      and audit.metadata_redacted->>'code' = 'identity_conflict'
      and audit.target_id = (
        select receipt.conflict_fingerprint
        from public.pos_article_mutation_conflict_receipts receipt
        where receipt.mutation_id =
          'task145qa:testrun145:attempt-collision'
      )
      and audit.target_id !~
        'task145qa:testrun145:attempt-collision'
  ),
  1,
  'attempt collision appends one redacted audit row'
);

set local role service_role;
insert into task145_results(label, result)
select
  'attempt_collision_replay',
  pg_temp.task145_apply(jsonb_build_object(
    'mutationId', 'task145qa:testrun145:attempt-collision',
    'idempotencyKey', 'task145qa:testrun145:idem-attempt-collision',
    'payloadHash', 'sha256:' || repeat('8', 64),
    'attemptToken', 'task145qa:testrun145:attempt-create-1',
    'mutationKind', 'product_update',
    'clientProductId', 'task145qa:testrun145:client-duplicate',
    'remoteProductId', duplicated.result#>>'{ack,remoteProductId}',
    'baseRevision', duplicated.result#>>'{ack,authoritativeRevision}',
    'localSequence', 2,
    'fieldMask', jsonb_build_array('primaryName'),
    'changes', jsonb_build_object('primaryName', 'Attempt collision'),
    'createdAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'occurredAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  ))
from task145_results duplicated
where duplicated.label = 'duplicate';

set local role postgres;
select is(
  (
    select replay.result->'ack'
    from task145_results replay
    where replay.label = 'attempt_collision_replay'
  ),
  (
    select original.result->'ack'
    from task145_results original
    where original.label = 'attempt_collision'
  ),
  'terminal conflict replay with a new attempt returns the original stored ACK'
);
select is(
  (
    select count(*)::integer
    from public.pos_article_mutation_conflict_receipts
    where mutation_id = 'task145qa:testrun145:attempt-collision'
  ),
  1,
  'terminal conflict replay does not duplicate its receipt'
);
select is(
  (
    select count(*)::integer
    from public.audit_logs audit
    where audit.shop_id = '10000000-0000-4000-8000-000000000145'
      and audit.event_key = 'pos.catalog.article_mutation.failure'
      and audit.metadata_redacted->>'code' = 'identity_conflict'
      and audit.target_id = (
        select receipt.conflict_fingerprint
        from public.pos_article_mutation_conflict_receipts receipt
        where receipt.mutation_id =
          'task145qa:testrun145:attempt-collision'
      )
  ),
  1,
  'terminal conflict replay does not duplicate its audit row'
);

select ok(
  exists (
    select 1
    from public.sync_events event
    where event.shop_id = '10000000-0000-4000-8000-000000000145'
      and event.domain = 'catalog'
      and event.event_type in ('catalog_changed', 'catalog_tombstone')
  )
  and exists (
    select 1
    from public.sync_events event
    where event.shop_id = '10000000-0000-4000-8000-000000000145'
      and event.domain = 'prices'
      and event.event_type = 'prices_changed'
  ),
  'catalog and price mutations publish through existing atomic sync events'
);
select ok(
  not exists (
    select 1
    from public.audit_logs audit
    where audit.shop_id = '10000000-0000-4000-8000-000000000145'
      and audit.event_key like 'pos.catalog.article_mutation.%'
      and audit.metadata_redacted::text ~*
        '(device[_-]?token|session[_-]?token|credential|password|pin|bearer)'
  ),
  'mutation audit metadata contains no credential or token material'
);

update public.pos_sessions
set status = 'revoked',
    revoked_at = clock_timestamp(),
    revoked_reason = 'TASK-145 synthetic revoke'
where pos_session_id = (select pos_session_id from task145_runtime);

set local role service_role;
insert into task145_results(label, result)
select
  'revoked',
  pg_temp.task145_apply(jsonb_build_object(
    'mutationId', 'task145qa:testrun145:after-revoke',
    'idempotencyKey', 'task145qa:testrun145:idem-after-revoke',
    'payloadHash', 'sha256:' || repeat('9', 64),
    'attemptToken', 'task145qa:testrun145:attempt-after-revoke',
    'mutationKind', 'product_update',
    'clientProductId', 'task145qa:testrun145:client-duplicate',
    'remoteProductId', duplicated.result#>>'{ack,remoteProductId}',
    'baseRevision', duplicated.result#>>'{ack,authoritativeRevision}',
    'localSequence', 2,
    'fieldMask', jsonb_build_array('primaryName'),
    'changes', jsonb_build_object('primaryName', 'Revoked write'),
    'createdAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'occurredAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  ))
from task145_results duplicated
where duplicated.label = 'duplicate';

set local role postgres;
select is(
  (select result->>'code' from task145_results where label = 'revoked'),
  'failed_auth',
  'revoked POS runtime lease fails closed'
);
select is(
  (
    select count(*)::integer
    from public.pos_article_mutation_receipts
    where mutation_id = 'task145qa:testrun145:after-revoke'
  ),
  0,
  'failed auth cannot publish a receipt or catalog mutation'
);

set local role service_role;
insert into task145_results(label, result)
values (
  'cleanup',
  public.pos_article_mutation_cleanup_synthetic_v1(
    '10000000-0000-4000-8000-000000000145',
    'TESTRUN145'
  )
);

set local role postgres;
select is(
  (select result->>'code' from task145_results where label = 'cleanup'),
  'cleaned',
  'bounded synthetic cleanup commits successfully'
);
select is(
  (
    select
      (select count(*) from public.inventory_products
        where shop_id = '10000000-0000-4000-8000-000000000145')
      + (select count(*) from public.inventory_product_prices
        where shop_id = '10000000-0000-4000-8000-000000000145')
      + (select count(*) from public.pos_sale_stock_movements
        where shop_id = '10000000-0000-4000-8000-000000000145')
      + (select count(*) from public.pos_article_mutation_receipts
        where shop_id = '10000000-0000-4000-8000-000000000145')
      + (select count(*) from public.pos_article_mutation_conflict_receipts
        where shop_id = '10000000-0000-4000-8000-000000000145')
      + (select count(*) from public.inventory_categories
        where shop_id = '10000000-0000-4000-8000-000000000145')
      + (select count(*) from public.inventory_suppliers
        where shop_id = '10000000-0000-4000-8000-000000000145')
  )::integer,
  0,
  'cleanup removes exactly all synthetic catalog/history/movement/receipt rows'
);
select is(
  (
    select (result#>>'{deleted,conflict_receipts}')::integer
    from task145_results
    where label = 'cleanup'
  ),
  2,
  'cleanup reports the exact deleted conflict receipt count'
);
select is(
  (
    select count(*)::integer
    from public.audit_logs
    where shop_id = '10000000-0000-4000-8000-000000000145'
      and event_key =
        'pos.catalog.article_mutation.fixture_cleanup'
      and result = 'success'
  ),
  1,
  'cleanup preserves immutable audit and appends one bounded proof row'
);

select * from finish();
rollback;
