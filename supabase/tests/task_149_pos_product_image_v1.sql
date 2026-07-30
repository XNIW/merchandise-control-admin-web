begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(162);

select has_table(
  'app_private',
  'pos_product_image_mutation_budgets',
  'TASK-149 keeps POS image mutation budgets in app_private'
);

select ok(
  (
    select array_agg(attribute.attname::text order by attribute.attnum)
    from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_class class
      on class.oid = attribute.attrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'app_private'
      and class.relname = 'pos_product_image_mutation_budgets'
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) = array[
    'shop_id',
    'principal_kind',
    'principal_id',
    'window_started_at',
    'admitted_count',
    'updated_at'
  ]::text[],
  'private mutation budgets expose only the fixed-window accounting shape'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class class
      on class.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'app_private'
      and class.relname = 'pos_product_image_mutation_budgets'
      and constraint_row.contype = 'p'
      and lower(
        regexp_replace(
          pg_catalog.pg_get_constraintdef(constraint_row.oid),
          '[[:space:]"]',
          '',
          'g'
        )
      ) = 'primarykey(shop_id,principal_kind,principal_id)'
  ),
  'mutation budgets have one fixed row per shop and principal'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class class
      on class.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'app_private'
      and class.relname = 'pos_product_image_mutation_budgets'
      and constraint_row.contype = 'c'
      and position(
        'principal_kind'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
      and position(
        '''shop'''
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
      and position(
        '''staff'''
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
      and position(
        '''node_audit_shop'''
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
      and position(
        '''node_audit_staff'''
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
      and position(
        '300'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
      and position(
        '60'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
      and position(
        'isfinite'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
  ),
  'budget rows constrain isolated mutation/audit shop/staff classes and limits'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        class.relacl,
        pg_catalog.acldefault('r', class.relowner)
      )
    ) acl_entry
    left join pg_catalog.pg_roles role
      on role.oid = acl_entry.grantee
    where namespace.nspname = 'app_private'
      and class.relname = 'pos_product_image_mutation_budgets'
      and (
        acl_entry.grantee = 0
        or role.rolname in ('anon', 'authenticated', 'service_role')
      )
  ),
  'PUBLIC and runtime roles have zero direct mutation-budget grants'
);

select has_table(
  'public',
  'pos_product_image_mutation_receipts',
  'TASK-149 stores durable POS product-image mutation receipts'
);

select ok(
  (
    select class.relrowsecurity and class.relforcerowsecurity
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'pos_product_image_mutation_receipts'
  ),
  'POS product-image receipts have enabled and forced RLS'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'pos_product_image_mutation_receipts'
  ),
  0::bigint,
  'POS product-image receipts expose no row policy'
);

with client_roles(role_name) as (
  values ('anon'), ('authenticated')
),
table_privileges(privilege_name) as (
  values
    ('SELECT'),
    ('INSERT'),
    ('UPDATE'),
    ('DELETE'),
    ('TRUNCATE'),
    ('REFERENCES'),
    ('TRIGGER')
)
select ok(
  not exists (
    select 1
    from client_roles role
    cross join table_privileges privilege
    where has_table_privilege(
      role.role_name,
      'public.pos_product_image_mutation_receipts',
      privilege.privilege_name
    )
  ),
  'anon and authenticated have no direct receipt-table privilege'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.pos_product_image_mutation_receipts',
    'SELECT'
  )
  and has_table_privilege(
    'service_role',
    'public.pos_product_image_mutation_receipts',
    'INSERT'
  ),
  'TASK149_CASE_43 service-role-only grants protect durable mutation receipts'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger trigger
    join pg_catalog.pg_class class
      on class.oid = trigger.tgrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'pos_product_image_mutation_receipts'
      and not trigger.tgisinternal
      and (trigger.tgtype & 2) = 2
      and (trigger.tgtype & 8) = 8
      and (trigger.tgtype & 16) = 16
  ),
  'receipt rows have a before-update-and-delete append-only trigger'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_class class
      on class.oid = attribute.attrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'pos_product_image_mutation_receipts'
      and attribute.attnum > 0
      and not attribute.attisdropped
      and lower(attribute.attname) = any(array[
        'device_token',
        'session_token',
        'credential_hash',
        'credential_secret',
        'main_upload_url',
        'thumb_upload_url',
        'signed_url',
        'upload_url',
        'storage_path',
        'main_path',
        'thumb_path',
        'request_body',
        'raw_request_body'
      ])
  ),
  'receipt schema contains no credential, URL, Storage path or raw-body column'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_class class
      on class.oid = attribute.attrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    join pg_catalog.pg_type type
      on type.oid = attribute.atttypid
    where namespace.nspname = 'public'
      and class.relname = 'pos_product_image_mutation_receipts'
      and attribute.attnum > 0
      and not attribute.attisdropped
      and type.typname in ('bytea', 'json', 'jsonb')
  ),
  'receipt storage is scalar and cannot persist a raw request or URL-bearing ACK'
);

select has_column(
  'public',
  'pos_product_image_mutation_receipts',
  'shop_id',
  'receipt persists exact shop scope'
);
select has_column(
  'public',
  'pos_product_image_mutation_receipts',
  'shop_device_id',
  'receipt persists trusted device identity'
);
select has_column(
  'public',
  'pos_product_image_mutation_receipts',
  'staff_id',
  'receipt persists authoritative staff identity'
);
select has_column(
  'public',
  'pos_product_image_mutation_receipts',
  'pos_session_id',
  'receipt persists trusted POS session identity'
);
select has_column(
  'public',
  'pos_product_image_mutation_receipts',
  'staff_credential_version',
  'receipt persists the bounded credential version, not credential material'
);
select has_column(
  'public',
  'pos_product_image_mutation_receipts',
  'schema_version',
  'receipt persists the exact POS image schema'
);
select has_column(
  'public',
  'pos_product_image_mutation_receipts',
  'operation',
  'receipt persists the image operation kind'
);
select has_column(
  'public',
  'pos_product_image_mutation_receipts',
  'operation_id',
  'receipt persists operation identity'
);
select has_column(
  'public',
  'pos_product_image_mutation_receipts',
  'idempotency_key',
  'receipt persists the idempotency key'
);
select has_column(
  'public',
  'pos_product_image_mutation_receipts',
  'payload_hash',
  'receipt persists the canonical payload hash'
);
select has_column(
  'public',
  'pos_product_image_mutation_receipts',
  'product_id',
  'receipt persists the exact product identity'
);
select has_column(
  'public',
  'pos_product_image_mutation_receipts',
  'expected_current_version_id',
  'receipt persists the compare-and-swap fence'
);
select has_column(
  'public',
  'pos_product_image_mutation_receipts',
  'image_version_id',
  'receipt persists the exact immutable image version'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class class
      on class.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'pos_product_image_mutation_receipts'
      and constraint_row.contype = 'u'
      and lower(
        regexp_replace(
          pg_catalog.pg_get_constraintdef(constraint_row.oid),
          '[[:space:]"]',
          '',
          'g'
        )
      ) like 'unique(shop_id,operation_id)%'
  ),
  'operation ID is unique inside its shop scope'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class class
      on class.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'pos_product_image_mutation_receipts'
      and constraint_row.contype = 'u'
      and lower(
        regexp_replace(
          pg_catalog.pg_get_constraintdef(constraint_row.oid),
          '[[:space:]"]',
          '',
          'g'
        )
      ) like 'unique(shop_id,idempotency_key)%'
  ),
  'idempotency key is unique inside its shop scope'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class class
      on class.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'pos_product_image_mutation_receipts'
      and constraint_row.contype = 'c'
      and position(
        'pos-product-image-v1'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
  ),
  'receipt schema version is fixed to pos-product-image-v1'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class class
      on class.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'pos_product_image_mutation_receipts'
      and constraint_row.contype = 'c'
      and position(
        'payload_hash'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
      and position(
        'sha256:'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
  ),
  'receipt payload hash is constrained to the canonical sha256 form'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class class
      on class.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'pos_product_image_mutation_receipts'
      and constraint_row.contype = 'c'
      and position(
        'operation'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
      and position(
        'intent'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
      and position(
        'finalize'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
      and position(
        'remove'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
  ),
  'receipt operation is limited to intent, finalize and remove'
);

select has_column(
  'public',
  'inventory_product_image_versions',
  'requested_by_staff_id',
  'image lifecycle attributes a POS intent to staff'
);
select has_column(
  'public',
  'inventory_product_image_versions',
  'requested_by_shop_device_id',
  'image lifecycle attributes a POS intent to its device'
);
select has_column(
  'public',
  'inventory_product_image_versions',
  'requested_by_pos_session_id',
  'image lifecycle attributes a POS intent to its session'
);
select has_column(
  'public',
  'inventory_product_image_versions',
  'finalized_by_staff_id',
  'image lifecycle attributes POS finalization to staff'
);
select has_column(
  'public',
  'inventory_product_image_versions',
  'finalized_by_shop_device_id',
  'image lifecycle attributes POS finalization to its device'
);
select has_column(
  'public',
  'inventory_product_image_versions',
  'finalized_by_pos_session_id',
  'image lifecycle attributes POS finalization to its session'
);
select has_column(
  'public',
  'inventory_product_image_versions',
  'pos_upload_capability_expires_at',
  'POS image lifecycle persists the signed-upload capability deadline'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class class
      on class.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'inventory_product_image_versions'
      and constraint_row.contype = 'c'
      and position(
        'pos_upload_capability_expires_at'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
      and position(
        'isfinite'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
      and position(
        'created_at'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
      and position(
        'pos_staff'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
      and position(
        'personal_account'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
      and position(
        'platform_admin'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
  ),
  'upload capability is finite and POS-only after version creation'
);

select ok(
  (
    select coalesce(cardinality(attribute.attacl), 0) = 0
    from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_class class
      on class.oid = attribute.attrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'inventory_product_image_versions'
      and attribute.attname = 'pos_upload_capability_expires_at'
  ),
  'upload capability deadline has zero direct column grants'
);

select has_column(
  'public',
  'pos_product_image_mutation_receipts',
  'app_version_class',
  'receipt stores only the bounded app-version presence class'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_class class
      on class.oid = attribute.attrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'pos_product_image_mutation_receipts'
      and attribute.attnum > 0
      and not attribute.attisdropped
      and attribute.attname = 'app_version'
  ),
  'receipt never persists the client appVersion value'
);

select ok(
  (
    select not attribute.attnotnull
    from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_class class
      on class.oid = attribute.attrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'inventory_product_image_versions'
      and attribute.attname = 'requested_by_profile_id'
      and attribute.attnum > 0
      and not attribute.attisdropped
  ),
  'profile identity is nullable for a real POS staff actor'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class class
      on class.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'inventory_product_image_versions'
      and constraint_row.contype = 'c'
      and position(
        'actor_kind'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
      and position(
        'pos_staff'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
  ),
  'image lifecycle actor-kind constraint includes POS staff'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class class
      on class.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'inventory_product_image_versions'
      and constraint_row.contype = 'c'
      and position(
        'requested_by_staff_id'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
      and position(
        'requested_by_profile_id'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
  ),
  'lifecycle constraint separates staff identity from profile identity'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class class
      on class.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'inventory_product_image_versions'
      and constraint_row.contype = 'c'
      and position(
        'finalized_by_staff_id'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
      and position(
        'finalized_by_profile_id'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
  ),
  'finalized lifecycle shape accepts exactly attributed staff finalization'
);

select has_function(
  'app_private',
  'pos_product_image_admit_write_v1',
  array['uuid','uuid','timestamptz'],
  'TASK-149 exposes the private fixed-window write-admission helper'
);

select ok(
  not has_function_privilege(
    'anon',
    'app_private.pos_product_image_admit_write_v1(uuid,uuid,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.pos_product_image_admit_write_v1(uuid,uuid,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'app_private.pos_product_image_admit_write_v1(uuid,uuid,timestamptz)',
    'EXECUTE'
  )
  and not exists (
    select 1
    from pg_catalog.pg_proc procedure
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        procedure.proacl,
        pg_catalog.acldefault('f', procedure.proowner)
      )
    ) acl_entry
    where procedure.oid =
      'app_private.pos_product_image_admit_write_v1(uuid,uuid,timestamptz)'::regprocedure
      and acl_entry.grantee = 0
      and acl_entry.privilege_type = 'EXECUTE'
  ),
  'write-admission helper is revoked from PUBLIC and every runtime role'
);

select ok(
  (
    select
      procedure.prosecdef
      and procedure.prorettype = 'boolean'::regtype
      and exists (
        select 1
        from unnest(
          coalesce(procedure.proconfig, array[]::text[])
        ) setting
        where setting like 'search_path=%'
      )
    from pg_catalog.pg_proc procedure
    where procedure.oid =
      'app_private.pos_product_image_admit_write_v1(uuid,uuid,timestamptz)'::regprocedure
  ),
  'write-admission helper is a pinned boolean security-definer boundary'
);

select has_function(
  'app_private',
  'pos_product_image_admit_node_audit_v1',
  array['uuid','uuid','timestamptz'],
  'TASK-149 exposes a separate private Node-audit admission helper'
);

select ok(
  not has_function_privilege(
    'anon',
    'app_private.pos_product_image_admit_node_audit_v1(uuid,uuid,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.pos_product_image_admit_node_audit_v1(uuid,uuid,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'app_private.pos_product_image_admit_node_audit_v1(uuid,uuid,timestamptz)',
    'EXECUTE'
  )
  and (
    select
      procedure.prosecdef
      and procedure.prorettype = 'boolean'::regtype
      and exists (
        select 1
        from unnest(
          coalesce(procedure.proconfig, array[]::text[])
        ) setting
        where setting like 'search_path=%'
      )
      and not exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(
            procedure.proacl,
            pg_catalog.acldefault('f', procedure.proowner)
          )
        ) acl_entry
        where acl_entry.grantee = 0
          and acl_entry.privilege_type = 'EXECUTE'
      )
    from pg_catalog.pg_proc procedure
    where procedure.oid =
      'app_private.pos_product_image_admit_node_audit_v1(uuid,uuid,timestamptz)'::regprocedure
  ),
  'Node-audit helper is pinned and revoked from PUBLIC and runtime roles'
);

select has_function(
  'public',
  'pos_product_image_authorize_v1',
  array['uuid','uuid','uuid','uuid','integer','text'],
  'TASK-149 exposes the exact POS image authorization RPC'
);
select has_function(
  'public',
  'pos_product_image_intent_v1',
  array[
    'uuid','uuid','uuid','uuid','integer','text','text',
    'text','text','text','uuid','uuid','jsonb','jsonb'
  ],
  'TASK-149 exposes the exact replay-safe image intent RPC'
);
select has_function(
  'public',
  'pos_product_image_finalize_prepare_v1',
  array[
    'uuid','uuid','uuid','uuid','integer','text','text',
    'text','text','text','uuid','uuid','uuid'
  ],
  'TASK-149 exposes the exact finalize preparation RPC'
);
select has_function(
  'public',
  'pos_product_image_finalize_commit_v1',
  array[
    'uuid','uuid','uuid','uuid','integer','text','text',
    'text','text','text','uuid','uuid','uuid','boolean','text','jsonb','jsonb'
  ],
  'TASK-149 exposes the exact atomic finalize commit RPC'
);
select has_function(
  'public',
  'pos_product_image_read_resolve_v1',
  array['uuid','uuid','uuid','uuid','integer','text','text','jsonb'],
  'TASK-149 exposes the exact bounded read resolution RPC'
);
select has_function(
  'public',
  'pos_product_image_read_authorize_v1',
  array['uuid','uuid','uuid','uuid','integer','text','text'],
  'TASK-149 exposes the exact post-sign read authorization RPC'
);
select has_function(
  'public',
  'pos_product_image_remove_v1',
  array[
    'uuid','uuid','uuid','uuid','integer','text','text',
    'text','text','text','uuid','uuid'
  ],
  'TASK-149 exposes the exact replay-safe remove RPC'
);
select has_function(
  'public',
  'pos_product_image_cleanup_result_v1',
  array[
    'uuid','uuid','uuid','uuid','integer','text','text',
    'text','text','text','text','uuid','uuid','boolean','text'
  ],
  'TASK-149 exposes the exact cleanup result RPC'
);
select has_function(
  'public',
  'pos_product_image_node_audit_admit_v1',
  array['uuid','uuid','uuid','uuid','integer','text'],
  'TASK-149 exposes the exact Node audit-admission RPC'
);

with rpc_signatures(signature) as (
  values
    ('public.pos_product_image_authorize_v1(uuid,uuid,uuid,uuid,integer,text)'),
    ('public.pos_product_image_node_audit_admit_v1(uuid,uuid,uuid,uuid,integer,text)'),
    ('public.pos_product_image_intent_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,uuid,jsonb,jsonb)'),
    ('public.pos_product_image_finalize_prepare_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,uuid,uuid)'),
    ('public.pos_product_image_finalize_commit_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,uuid,uuid,boolean,text,jsonb,jsonb)'),
    ('public.pos_product_image_read_resolve_v1(uuid,uuid,uuid,uuid,integer,text,text,jsonb)'),
    ('public.pos_product_image_read_authorize_v1(uuid,uuid,uuid,uuid,integer,text,text)'),
    ('public.pos_product_image_remove_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,uuid)'),
    ('public.pos_product_image_cleanup_result_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,text,uuid,uuid,boolean,text)')
),
client_roles(role_name) as (
  values ('anon'), ('authenticated')
)
select ok(
  not exists (
    select 1
    from rpc_signatures rpc
    cross join client_roles role
    where has_function_privilege(role.role_name, rpc.signature, 'EXECUTE')
  ),
  'anon and authenticated cannot execute any POS product-image RPC'
);

with rpc_signatures(signature) as (
  values
    ('public.pos_product_image_authorize_v1(uuid,uuid,uuid,uuid,integer,text)'),
    ('public.pos_product_image_node_audit_admit_v1(uuid,uuid,uuid,uuid,integer,text)'),
    ('public.pos_product_image_intent_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,uuid,jsonb,jsonb)'),
    ('public.pos_product_image_finalize_prepare_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,uuid,uuid)'),
    ('public.pos_product_image_finalize_commit_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,uuid,uuid,boolean,text,jsonb,jsonb)'),
    ('public.pos_product_image_read_resolve_v1(uuid,uuid,uuid,uuid,integer,text,text,jsonb)'),
    ('public.pos_product_image_read_authorize_v1(uuid,uuid,uuid,uuid,integer,text,text)'),
    ('public.pos_product_image_remove_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,uuid)'),
    ('public.pos_product_image_cleanup_result_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,text,uuid,uuid,boolean,text)')
)
select ok(
  not exists (
    select 1
    from rpc_signatures rpc
    where not has_function_privilege('service_role', rpc.signature, 'EXECUTE')
  ),
  'service_role can execute every POS product-image RPC'
);

with rpc_signatures(signature) as (
  values
    ('public.pos_product_image_authorize_v1(uuid,uuid,uuid,uuid,integer,text)'),
    ('public.pos_product_image_node_audit_admit_v1(uuid,uuid,uuid,uuid,integer,text)'),
    ('public.pos_product_image_intent_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,uuid,jsonb,jsonb)'),
    ('public.pos_product_image_finalize_prepare_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,uuid,uuid)'),
    ('public.pos_product_image_finalize_commit_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,uuid,uuid,boolean,text,jsonb,jsonb)'),
    ('public.pos_product_image_read_resolve_v1(uuid,uuid,uuid,uuid,integer,text,text,jsonb)'),
    ('public.pos_product_image_read_authorize_v1(uuid,uuid,uuid,uuid,integer,text,text)'),
    ('public.pos_product_image_remove_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,uuid)'),
    ('public.pos_product_image_cleanup_result_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,text,uuid,uuid,boolean,text)')
)
select ok(
  not exists (
    select 1
    from rpc_signatures rpc
    left join pg_catalog.pg_proc procedure
      on procedure.oid = pg_catalog.to_regprocedure(rpc.signature)
    where procedure.oid is null
      or not procedure.prosecdef
      or procedure.prorettype <> 'jsonb'::regtype
      or not exists (
        select 1
        from unnest(coalesce(procedure.proconfig, array[]::text[])) setting
        where setting like 'search_path=%'
      )
  ),
  'all POS product-image RPCs are JSONB security-definer boundaries with pinned search paths'
);

with mutation_admission_rpcs(signature) as (
  values
    ('public.pos_product_image_intent_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,uuid,jsonb,jsonb)'),
    ('public.pos_product_image_finalize_prepare_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,uuid,uuid)'),
    ('public.pos_product_image_finalize_commit_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,uuid,uuid,boolean,text,jsonb,jsonb)'),
    ('public.pos_product_image_remove_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,uuid)'),
    ('public.pos_product_image_cleanup_result_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,text,uuid,uuid,boolean,text)')
)
select ok(
  not exists (
    select 1
    from mutation_admission_rpcs rpc
    join pg_catalog.pg_proc procedure
      on procedure.oid = pg_catalog.to_regprocedure(rpc.signature)
    where position(
      'app_private.pos_product_image_admit_write_v1'
      in lower(pg_catalog.pg_get_functiondef(procedure.oid))
    ) = 0
      or position(
        ':pos-product-image:lifecycle'
        in lower(pg_catalog.pg_get_functiondef(procedure.oid))
      ) = 0
  )
  and (
    select
      position(
        'app_private.pos_product_image_admit_node_audit_v1'
        in lower(pg_catalog.pg_get_functiondef(procedure.oid))
      ) > 0
      and position(
        'app_private.pos_product_image_admit_write_v1'
        in lower(pg_catalog.pg_get_functiondef(procedure.oid))
      ) = 0
    from pg_catalog.pg_proc procedure
    where procedure.oid =
      'public.pos_product_image_node_audit_admit_v1(uuid,uuid,uuid,uuid,integer,text)'::regprocedure
  ),
  'mutation RPCs and Node audits use isolated fixed-row admission classes'
);

select ok(
  (
    select
      position('pos_product_image_mutation_receipts' in lower(definition)) > 0
      and position('previous_version_id' in lower(definition)) > 0
      and position('primary_image_version_id' in lower(definition)) > 0
      and position('stale' in lower(definition)) > 0
    from (
      select pg_catalog.pg_get_functiondef(
        'public.pos_product_image_finalize_commit_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,uuid,uuid,boolean,text,jsonb,jsonb)'::regprocedure
      ) as definition
    ) source
  ),
  'finalize commit checks durable replay and the pending-version CAS fence'
);

select ok(
  (
    select
      position('pos_product_image_mutation_receipts' in lower(definition)) > 0
      and position('primary_image_version_id' in lower(definition)) > 0
      and position('stale' in lower(definition)) > 0
    from (
      select pg_catalog.pg_get_functiondef(
        'public.pos_product_image_remove_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,uuid)'::regprocedure
      ) as definition
    ) source
  ),
  'remove checks durable replay before enforcing current-version CAS'
);

select ok(
  (
    select
      position('pos_product_image_mutation_receipts' in lower(definition)) > 0
      and position('primary_image_version_id' in lower(definition)) > 0
      and position('expected_current_version_id' in lower(definition)) > 0
    from (
      select pg_catalog.pg_get_functiondef(
        'public.pos_product_image_intent_v1(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,uuid,jsonb,jsonb)'::regprocedure
      ) as definition
    ) source
  ),
  'intent checks replay and expected-current-version CAS in one boundary'
);

select ok(
  (
    select
      position('primary_image_version_id' in lower(definition)) > 0
      and position('primary_image_updated_at' in lower(definition)) > 0
    from (
      select pg_catalog.pg_get_functiondef(
        'public.pos_catalog_pull_page_v2(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean)'::regprocedure
      ) as definition
    ) source
  ),
  'POS catalog product rows publish both additive image fields'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger trigger
    join pg_catalog.pg_class class
      on class.oid = trigger.tgrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'inventory_products'
      and trigger.tgname = 'task139_catalog_revision_update'
      and trigger.tgenabled <> 'D'
  ),
  'image publication reuses the existing inventory-products catalog revision trigger'
);

select ok(
  exists (
    select 1
    from storage.buckets bucket
    where bucket.id = 'product-images'
      and bucket.public = false
      and bucket.file_size_limit = 1048576
      and bucket.allowed_mime_types = array['image/jpeg']::text[]
  ),
  'product-images Storage bucket remains private, JPEG-only and one MiB bounded'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname like '%product_image%'
      and policy.cmd <> 'SELECT'
  ),
  0::bigint,
  'POS image support adds no authenticated Storage write policy'
);

select ok(
  app_private.pos_product_image_envelope_is_valid_v1(
    'pos-product-image-v1',
    'task149-fixture',
    '10000000-0000-4000-8000-000000000149',
    'task149.synthetic-idempotency-149',
    'sha256:' || repeat('a', 64)
  )
  and app_private.pos_product_image_envelope_is_valid_v1(
    'pos-product-image-v1',
    'task149-fixture',
    'task149.synthetic-operation-149',
    '20000000-0000-4000-8000-000000000149',
    'sha256:' || repeat('a', 64)
  )
  and app_private.pos_product_image_envelope_is_valid_v1(
    'pos-product-image-v1',
    'task149-fixture',
    'shipping-manifest-149',
    'tokenized-batch-149',
    'sha256:' || repeat('a', 64)
  )
  and not app_private.pos_product_image_envelope_is_valid_v1(
    'pos-product-image-v1',
    'task149-fixture',
    'mcpos_device_TASK149SyntheticCredential',
    'task149.synthetic-idempotency-149',
    'sha256:' || repeat('a', 64)
  )
  and not app_private.pos_product_image_envelope_is_valid_v1(
    'pos-product-image-v1',
    'task149-fixture',
    'task149.synthetic-operation-149',
    'prefix.mcpos_session_TASK149SyntheticCredential',
    'sha256:' || repeat('a', 64)
  )
  and not app_private.pos_product_image_envelope_is_valid_v1(
    'pos-product-image-v1',
    'task149-fixture',
    'Bearer.synthetic-credential',
    'task149.synthetic-idempotency-149',
    'sha256:' || repeat('a', 64)
  )
  and (
    select
      position(
        'mcpos_'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
      and position(
        'credential'
        in lower(pg_catalog.pg_get_constraintdef(constraint_row.oid))
      ) > 0
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class class
      on class.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'pos_product_image_mutation_receipts'
      and constraint_row.conname =
        'pos_product_image_receipts_identity_check'
  ),
  'token-like operation and idempotency identifiers fail closed while UUID and synthetic IDs remain valid'
);

-- Functional fixture. All rows are synthetic, transaction-local and rolled
-- back at the end of this file.
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
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000149',
  'authenticated',
  'authenticated',
  'task149-owner@example.invalid',
  '{}',
  '{}',
  clock_timestamp(),
  clock_timestamp()
);

insert into public.profiles (
  profile_id,
  display_name,
  profile_status
)
values (
  '00000000-0000-4000-8000-000000000149',
  'TASK-149 synthetic owner',
  'active'
)
on conflict (profile_id) do update
set display_name = excluded.display_name,
    profile_status = excluded.profile_status;

insert into public.shops (
  shop_id,
  shop_code,
  shop_name,
  shop_status,
  created_by_profile_id
)
values
  (
    '10000000-0000-4000-8000-000000000149',
    'TASK149QA_TESTRUN149',
    'TASK-149 synthetic shop A',
    'active',
    '00000000-0000-4000-8000-000000000149'
  ),
  (
    '10000000-0000-4000-8000-000000000249',
    'TASK149QB_TESTRUN149',
    'TASK-149 synthetic shop B',
    'active',
    '00000000-0000-4000-8000-000000000149'
  );

insert into public.shop_members (
  profile_id,
  shop_id,
  role_key,
  membership_status
)
values
  (
    '00000000-0000-4000-8000-000000000149',
    '10000000-0000-4000-8000-000000000149',
    'shop_owner',
    'active'
  ),
  (
    '00000000-0000-4000-8000-000000000149',
    '10000000-0000-4000-8000-000000000249',
    'shop_owner',
    'active'
  );

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
  credential_expires_at,
  must_change_credential,
  credential_version,
  credential_status
)
values
  (
    '20000000-0000-4000-8000-000000000149',
    '10000000-0000-4000-8000-000000000149',
    'T149WRITE',
    'TASK-149 synthetic writer',
    'manager',
    'active',
    'password',
    'argon2id:task149qa:writer:redacted-fixture',
    clock_timestamp(),
    clock_timestamp() + interval '4 hours',
    false,
    7,
    'active'
  ),
  (
    '20000000-0000-4000-8000-000000000249',
    '10000000-0000-4000-8000-000000000149',
    'T149READ',
    'TASK-149 synthetic reader',
    'viewer',
    'active',
    'password',
    'argon2id:task149qa:reader:redacted-fixture',
    clock_timestamp(),
    clock_timestamp() + interval '4 hours',
    false,
    3,
    'active'
  );

insert into public.staff_role_permissions (
  shop_id,
  role_key,
  permission_key,
  enabled
)
values
  (
    '10000000-0000-4000-8000-000000000149',
    'manager',
    'catalog.write',
    true
  ),
  (
    '10000000-0000-4000-8000-000000000149',
    'viewer',
    'catalog.read',
    true
  )
on conflict (shop_id, role_key, permission_key)
do update set enabled = excluded.enabled;

insert into public.inventory_products (
  id,
  owner_user_id,
  shop_id,
  barcode,
  product_name
)
values (
  '60000000-0000-4000-8000-000000000149',
  '00000000-0000-4000-8000-000000000149',
  '10000000-0000-4000-8000-000000000149',
  'TASK149QA_TESTRUN149_PRODUCT',
  'TASK-149 synthetic image product'
);

delete from app_private.pos_product_image_mutation_budgets
where shop_id = '10000000-0000-4000-8000-000000000149';

select is(
  app_private.pos_product_image_admit_write_v1(
    '10000000-0000-4000-8000-000000000149',
    '20000000-0000-4000-8000-000000000149',
    timestamptz '2026-07-30 12:00:00+00'
  ),
  true,
  'first write admission creates the fixed shop and staff budget rows'
);

select ok(
  (
    select count(*) = 2
      and bool_and(budget.admitted_count = 1)
      and bool_and(
        budget.window_started_at =
          timestamptz '2026-07-30 12:00:00+00'
      )
      and bool_and(
        budget.updated_at =
          timestamptz '2026-07-30 12:00:00+00'
      )
      and bool_or(
        budget.principal_kind = 'shop'
        and budget.principal_id = budget.shop_id
      )
      and bool_or(
        budget.principal_kind = 'staff'
        and budget.principal_id =
          '20000000-0000-4000-8000-000000000149'
      )
    from app_private.pos_product_image_mutation_budgets budget
    where budget.shop_id =
      '10000000-0000-4000-8000-000000000149'
  ),
  'one admission persists exactly one shop row and one staff row'
);

update app_private.pos_product_image_mutation_budgets
set admitted_count = case
      when principal_kind = 'shop' then 1
      else 60
    end,
    window_started_at = timestamptz '2026-07-30 12:00:00+00',
    updated_at = timestamptz '2026-07-30 12:00:00+00'
where shop_id = '10000000-0000-4000-8000-000000000149';

select is(
  app_private.pos_product_image_admit_write_v1(
    '10000000-0000-4000-8000-000000000149',
    '20000000-0000-4000-8000-000000000149',
    timestamptz '2026-07-30 12:14:00+00'
  ),
  false,
  'staff admission stops at sixty writes inside fifteen minutes'
);

select ok(
  (
    select
      max(budget.admitted_count)
        filter (where budget.principal_kind = 'shop') = 1
      and max(budget.admitted_count)
        filter (where budget.principal_kind = 'staff') = 60
      and max(budget.updated_at) =
        timestamptz '2026-07-30 12:00:00+00'
    from app_private.pos_product_image_mutation_budgets budget
    where budget.shop_id =
      '10000000-0000-4000-8000-000000000149'
  ),
  'denied staff admission increments neither fixed budget row'
);

select is(
  app_private.pos_product_image_admit_write_v1(
    '10000000-0000-4000-8000-000000000149',
    '20000000-0000-4000-8000-000000000149',
    timestamptz '2026-07-30 12:16:00+00'
  ),
  true,
  'staff admission reopens after its fifteen-minute window'
);

select ok(
  (
    select
      max(budget.admitted_count)
        filter (where budget.principal_kind = 'shop') = 2
      and max(budget.window_started_at)
        filter (where budget.principal_kind = 'shop') =
          timestamptz '2026-07-30 12:00:00+00'
      and max(budget.admitted_count)
        filter (where budget.principal_kind = 'staff') = 1
      and max(budget.window_started_at)
        filter (where budget.principal_kind = 'staff') =
          timestamptz '2026-07-30 12:16:00+00'
    from app_private.pos_product_image_mutation_budgets budget
    where budget.shop_id =
      '10000000-0000-4000-8000-000000000149'
  ),
  'staff rollover resets only its expired window and advances the shop row'
);

update app_private.pos_product_image_mutation_budgets
set admitted_count = 300
where shop_id = '10000000-0000-4000-8000-000000000149'
  and principal_kind = 'shop';

select is(
  app_private.pos_product_image_admit_write_v1(
    '10000000-0000-4000-8000-000000000149',
    '20000000-0000-4000-8000-000000000149',
    timestamptz '2026-07-30 12:30:00+00'
  ),
  false,
  'shop admission stops at three hundred writes inside one hour'
);

select ok(
  (
    select
      max(budget.admitted_count)
        filter (where budget.principal_kind = 'shop') = 300
      and max(budget.admitted_count)
        filter (where budget.principal_kind = 'staff') = 1
      and max(budget.updated_at)
        filter (where budget.principal_kind = 'staff') =
          timestamptz '2026-07-30 12:16:00+00'
    from app_private.pos_product_image_mutation_budgets budget
    where budget.shop_id =
      '10000000-0000-4000-8000-000000000149'
  ),
  'denied shop admission increments neither fixed budget row'
);

select is(
  app_private.pos_product_image_admit_write_v1(
    '10000000-0000-4000-8000-000000000149',
    '20000000-0000-4000-8000-000000000149',
    timestamptz '2026-07-30 13:01:00+00'
  ),
  true,
  'shop admission reopens after its one-hour window'
);

select ok(
  (
    select count(*) = 2
      and bool_and(budget.admitted_count = 1)
      and bool_and(
        budget.window_started_at =
          timestamptz '2026-07-30 13:01:00+00'
      )
      and bool_and(
        budget.updated_at =
          timestamptz '2026-07-30 13:01:00+00'
      )
    from app_private.pos_product_image_mutation_budgets budget
    where budget.shop_id =
      '10000000-0000-4000-8000-000000000149'
  ),
  'expired shop and staff windows roll over without adding budget rows'
);

delete from app_private.pos_product_image_mutation_budgets
where shop_id = '10000000-0000-4000-8000-000000000149';

create temporary table task149_runtime (
  runtime_label text primary key,
  shop_device_id uuid not null,
  pos_session_id uuid not null
) on commit drop;

create temporary table task149_results (
  result_label text primary key,
  result jsonb not null
) on commit drop;

create temporary table task149_numbers (
  number_label text primary key,
  value bigint not null
) on commit drop;

grant select, insert, update on
  task149_runtime,
  task149_results,
  task149_numbers
to service_role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

with login as (
  select public.pos_runtime_first_login_commit_v2(
    '10000000-0000-4000-8000-000000000149',
    '20000000-0000-4000-8000-000000000149',
    7,
    'task149qa:writer-valid',
    'TASK-149 writer valid',
    'task149-fixture',
    'sha256:' || repeat('1', 64),
    15552000,
    'sha256:' || repeat('2', 64),
    43200,
    jsonb_build_object(
      'app_version_present', true,
      'source', 'TASK-149'
    )
  ) result
)
insert into task149_runtime (
  runtime_label,
  shop_device_id,
  pos_session_id
)
select
  'writer_valid',
  (result->>'shopDeviceId')::uuid,
  (result->>'posSessionId')::uuid
from login
where result->>'code' = 'success';

with login as (
  select public.pos_runtime_first_login_commit_v2(
    '10000000-0000-4000-8000-000000000149',
    '20000000-0000-4000-8000-000000000149',
    7,
    'task149qa:writer-expired',
    'TASK-149 writer expired',
    'task149-fixture',
    'sha256:' || repeat('3', 64),
    15552000,
    'sha256:' || repeat('4', 64),
    43200,
    jsonb_build_object(
      'app_version_present', true,
      'source', 'TASK-149'
    )
  ) result
)
insert into task149_runtime (
  runtime_label,
  shop_device_id,
  pos_session_id
)
select
  'writer_expired',
  (result->>'shopDeviceId')::uuid,
  (result->>'posSessionId')::uuid
from login
where result->>'code' = 'success';

with login as (
  select public.pos_runtime_first_login_commit_v2(
    '10000000-0000-4000-8000-000000000149',
    '20000000-0000-4000-8000-000000000149',
    7,
    'task149qa:writer-revoked',
    'TASK-149 writer revoked',
    'task149-fixture',
    'sha256:' || repeat('5', 64),
    15552000,
    'sha256:' || repeat('6', 64),
    43200,
    jsonb_build_object(
      'app_version_present', true,
      'source', 'TASK-149'
    )
  ) result
)
insert into task149_runtime (
  runtime_label,
  shop_device_id,
  pos_session_id
)
select
  'writer_revoked',
  (result->>'shopDeviceId')::uuid,
  (result->>'posSessionId')::uuid
from login
where result->>'code' = 'success';

with login as (
  select public.pos_runtime_first_login_commit_v2(
    '10000000-0000-4000-8000-000000000149',
    '20000000-0000-4000-8000-000000000249',
    3,
    'task149qa:reader-valid',
    'TASK-149 reader valid',
    'task149-fixture',
    'sha256:' || repeat('7', 64),
    15552000,
    'sha256:' || repeat('8', 64),
    43200,
    jsonb_build_object(
      'app_version_present', true,
      'source', 'TASK-149'
    )
  ) result
)
insert into task149_runtime (
  runtime_label,
  shop_device_id,
  pos_session_id
)
select
  'reader_valid',
  (result->>'shopDeviceId')::uuid,
  (result->>'posSessionId')::uuid
from login
where result->>'code' = 'success';

set local role postgres;

select is(
  (select count(*)::integer from task149_runtime),
  4,
  'four isolated trusted POS runtime fixtures are active'
);

update public.pos_sessions
set status = 'expired',
    expires_at = clock_timestamp() - interval '1 second',
    updated_at = clock_timestamp()
where pos_session_id = (
  select pos_session_id
  from task149_runtime
  where runtime_label = 'writer_expired'
);

update public.shop_devices
set status = 'revoked',
    revoked_at = clock_timestamp(),
    updated_at = clock_timestamp()
where shop_device_id = (
  select shop_device_id
  from task149_runtime
  where runtime_label = 'writer_revoked'
);

create function pg_temp.task149_main_metadata(p_hash_character text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'bytes', 1200,
    'height', 800,
    'mimeType', 'image/jpeg',
    'sha256', repeat(p_hash_character, 64),
    'width', 1200
  )
$$;

create function pg_temp.task149_thumb_metadata(p_hash_character text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'bytes', 600,
    'height', 200,
    'mimeType', 'image/jpeg',
    'sha256', repeat(p_hash_character, 64),
    'width', 300
  )
$$;

create function pg_temp.task149_intent(
  p_app_version text,
  p_operation_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_product_id uuid,
  p_expected_current_version_id uuid,
  p_main_metadata jsonb,
  p_thumb_metadata jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select public.pos_product_image_intent_v1(
    '10000000-0000-4000-8000-000000000149',
    runtime.shop_device_id,
    '20000000-0000-4000-8000-000000000149',
    runtime.pos_session_id,
    7,
    'pos-product-image-v1',
    p_app_version,
    p_operation_id,
    p_idempotency_key,
    p_payload_hash,
    p_product_id,
    p_expected_current_version_id,
    p_main_metadata,
    p_thumb_metadata
  )
  from pg_temp.task149_runtime runtime
  where runtime.runtime_label = 'writer_valid'
$$;

create function pg_temp.task149_finalize_prepare(
  p_operation_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_product_id uuid,
  p_expected_current_version_id uuid,
  p_version_id uuid
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select public.pos_product_image_finalize_prepare_v1(
    '10000000-0000-4000-8000-000000000149',
    runtime.shop_device_id,
    '20000000-0000-4000-8000-000000000149',
    runtime.pos_session_id,
    7,
    'pos-product-image-v1',
    'task149-fixture',
    p_operation_id,
    p_idempotency_key,
    p_payload_hash,
    p_product_id,
    p_expected_current_version_id,
    p_version_id
  )
  from pg_temp.task149_runtime runtime
  where runtime.runtime_label = 'writer_valid'
$$;

create function pg_temp.task149_finalize_commit(
  p_operation_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_product_id uuid,
  p_expected_current_version_id uuid,
  p_version_id uuid,
  p_validation_ok boolean,
  p_validation_code text,
  p_verified_main jsonb,
  p_verified_thumb jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select public.pos_product_image_finalize_commit_v1(
    '10000000-0000-4000-8000-000000000149',
    runtime.shop_device_id,
    '20000000-0000-4000-8000-000000000149',
    runtime.pos_session_id,
    7,
    'pos-product-image-v1',
    'task149-fixture',
    p_operation_id,
    p_idempotency_key,
    p_payload_hash,
    p_product_id,
    p_expected_current_version_id,
    p_version_id,
    p_validation_ok,
    p_validation_code,
    p_verified_main,
    p_verified_thumb
  )
  from pg_temp.task149_runtime runtime
  where runtime.runtime_label = 'writer_valid'
$$;

create function pg_temp.task149_read(
  p_app_version text,
  p_refs jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select public.pos_product_image_read_resolve_v1(
    '10000000-0000-4000-8000-000000000149',
    runtime.shop_device_id,
    '20000000-0000-4000-8000-000000000149',
    runtime.pos_session_id,
    7,
    'pos-product-image-v1',
    p_app_version,
    p_refs
  )
  from pg_temp.task149_runtime runtime
  where runtime.runtime_label = 'writer_valid'
$$;

create function pg_temp.task149_remove(
  p_operation_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_product_id uuid,
  p_expected_current_version_id uuid
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select public.pos_product_image_remove_v1(
    '10000000-0000-4000-8000-000000000149',
    runtime.shop_device_id,
    '20000000-0000-4000-8000-000000000149',
    runtime.pos_session_id,
    7,
    'pos-product-image-v1',
    'task149-fixture',
    p_operation_id,
    p_idempotency_key,
    p_payload_hash,
    p_product_id,
    p_expected_current_version_id
  )
  from pg_temp.task149_runtime runtime
  where runtime.runtime_label = 'writer_valid'
$$;

create function pg_temp.task149_cleanup_result(
  p_operation text,
  p_operation_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_product_id uuid,
  p_version_id uuid,
  p_success boolean,
  p_error_code text
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select public.pos_product_image_cleanup_result_v1(
    '10000000-0000-4000-8000-000000000149',
    runtime.shop_device_id,
    '20000000-0000-4000-8000-000000000149',
    runtime.pos_session_id,
    7,
    'pos-product-image-v1',
    'task149-fixture',
    p_operation,
    p_operation_id,
    p_idempotency_key,
    p_payload_hash,
    p_product_id,
    p_version_id,
    p_success,
    p_error_code
  )
  from pg_temp.task149_runtime runtime
  where runtime.runtime_label = 'writer_valid'
$$;

grant execute on function
  pg_temp.task149_main_metadata(text),
  pg_temp.task149_thumb_metadata(text),
  pg_temp.task149_intent(text,text,text,text,uuid,uuid,jsonb,jsonb),
  pg_temp.task149_finalize_prepare(text,text,text,uuid,uuid,uuid),
  pg_temp.task149_finalize_commit(
    text,text,text,uuid,uuid,uuid,boolean,text,jsonb,jsonb
  ),
  pg_temp.task149_read(text,jsonb),
  pg_temp.task149_remove(text,text,text,uuid,uuid),
  pg_temp.task149_cleanup_result(
    text,text,text,text,uuid,uuid,boolean,text
  )
to service_role;

set local role service_role;

insert into task149_results (result_label, result)
select
  'auth_valid',
  public.pos_product_image_authorize_v1(
    '10000000-0000-4000-8000-000000000149',
    runtime.shop_device_id,
    '20000000-0000-4000-8000-000000000149',
    runtime.pos_session_id,
    7,
    'catalog.write'
  )
from task149_runtime runtime
where runtime.runtime_label = 'writer_valid';

insert into task149_results (result_label, result)
select
  'auth_expired',
  public.pos_product_image_authorize_v1(
    '10000000-0000-4000-8000-000000000149',
    runtime.shop_device_id,
    '20000000-0000-4000-8000-000000000149',
    runtime.pos_session_id,
    7,
    'catalog.write'
  )
from task149_runtime runtime
where runtime.runtime_label = 'writer_expired';

insert into task149_results (result_label, result)
select
  'auth_revoked',
  public.pos_product_image_authorize_v1(
    '10000000-0000-4000-8000-000000000149',
    runtime.shop_device_id,
    '20000000-0000-4000-8000-000000000149',
    runtime.pos_session_id,
    7,
    'catalog.write'
  )
from task149_runtime runtime
where runtime.runtime_label = 'writer_revoked';

insert into task149_results (result_label, result)
select
  'auth_wrong_shop',
  public.pos_product_image_authorize_v1(
    '10000000-0000-4000-8000-000000000249',
    runtime.shop_device_id,
    '20000000-0000-4000-8000-000000000149',
    runtime.pos_session_id,
    7,
    'catalog.write'
  )
from task149_runtime runtime
where runtime.runtime_label = 'writer_valid';

insert into task149_results (result_label, result)
select
  'auth_read_only_write',
  public.pos_product_image_authorize_v1(
    '10000000-0000-4000-8000-000000000149',
    runtime.shop_device_id,
    '20000000-0000-4000-8000-000000000249',
    runtime.pos_session_id,
    3,
    'catalog.write'
  )
from task149_runtime runtime
where runtime.runtime_label = 'reader_valid';

insert into task149_results (result_label, result)
select
  'auth_read_only_read',
  public.pos_product_image_authorize_v1(
    '10000000-0000-4000-8000-000000000149',
    runtime.shop_device_id,
    '20000000-0000-4000-8000-000000000249',
    runtime.pos_session_id,
    3,
    'catalog.read'
  )
from task149_runtime runtime
where runtime.runtime_label = 'reader_valid';

set local role postgres;

select is(
  (select result->>'code' from task149_results where result_label = 'auth_valid'),
  'authorized',
  'TASK149_CASE_01 valid trusted POS lease is authorized'
);
select is(
  (select result->>'code' from task149_results where result_label = 'auth_expired'),
  'auth_denied',
  'TASK149_CASE_02 expired POS session is denied'
);
select is(
  (select result->>'code' from task149_results where result_label = 'auth_revoked'),
  'auth_denied',
  'TASK149_CASE_03 revoked POS device is denied'
);
select is(
  (select result->>'code' from task149_results where result_label = 'auth_wrong_shop'),
  'auth_denied',
  'TASK149_CASE_04 cross-shop runtime identity is denied'
);
select is(
  (
    select result->>'code'
    from task149_results
    where result_label = 'auth_read_only_write'
  ),
  'permission_denied',
  'TASK149_CASE_05 read-only staff cannot request catalog.write'
);
select is(
  (
    select result->>'code'
    from task149_results
    where result_label = 'auth_read_only_read'
  ),
  'authorized',
  'read-only staff retains catalog.read'
);

insert into task149_numbers (number_label, value)
values
  (
    'sensitive_receipts_before',
    (
      select count(*)
      from public.pos_product_image_mutation_receipts receipt
      where receipt.shop_id =
        '10000000-0000-4000-8000-000000000149'
    )
  ),
  (
    'sensitive_versions_before',
    (
      select count(*)
      from public.inventory_product_image_versions version
      where version.product_id =
        '60000000-0000-4000-8000-000000000149'
    )
  ),
  (
    'sensitive_audits_before',
    (
      select count(*)
      from public.audit_logs audit
      where audit.shop_id =
        '10000000-0000-4000-8000-000000000149'
        and audit.event_key like 'pos.catalog.product_image.%'
    )
  ),
  (
    'sensitive_sync_events_before',
    (
      select count(*)
      from public.sync_events event
      where event.owner_user_id =
        '00000000-0000-4000-8000-000000000149'
    )
  ),
  (
    'sensitive_revision_before',
    coalesce(
      (
        select revision
        from app_private.pos_catalog_revisions revision
        where revision.shop_id =
          '10000000-0000-4000-8000-000000000149'
      ),
      0
    )
  ),
  (
    'sensitive_budgets_before',
    (
      select count(*)
      from app_private.pos_product_image_mutation_budgets budget
      where budget.shop_id =
        '10000000-0000-4000-8000-000000000149'
    )
  );

set local role service_role;

with sensitive_identifier(value, ordinal) as (
  select identifier.value, identifier.ordinal
  from unnest(array[
    'mcpos_device_TASK149SyntheticCredential',
    'prefix.mcpos_session_TASK149SyntheticCredential',
    'Bearer.synthetic-credential',
    'access_token.synthetic-credential',
    'refresh-token.synthetic-credential',
    'secret.synthetic-credential',
    'password.synthetic-credential',
    'credential.synthetic-value',
    'pin.synthetic-value',
    'eyJsyntheticHeader.payload.signature'
  ]::text[]) with ordinality as identifier(value, ordinal)
),
identifier_target(field_name) as (
  values ('operation_id'), ('idempotency_key')
)
insert into task149_results (result_label, result)
select
  'sensitive_identifier_' || identifier.ordinal::text || '_' ||
    target.field_name,
  pg_temp.task149_intent(
    'task149-fixture',
    case
      when target.field_name = 'operation_id' then identifier.value
      else 'task149.sensitive.operation.' || identifier.ordinal::text
    end,
    case
      when target.field_name = 'idempotency_key' then identifier.value
      else 'task149.sensitive.idempotency.' || identifier.ordinal::text
    end,
    'sha256:' || repeat('9', 64),
    '60000000-0000-4000-8000-000000000149',
    null,
    pg_temp.task149_main_metadata('9'),
    pg_temp.task149_thumb_metadata('9')
  )
from sensitive_identifier identifier
cross join identifier_target target;

set local role postgres;

select ok(
  (
    select
      count(*) = 20
      and bool_and(result->>'ok' = 'false')
      and bool_and(result->>'code' = 'validation_failed')
    from task149_results
    where result_label like 'sensitive_identifier_%'
  ),
  'all token-like operation IDs and idempotency keys are rejected by the authoritative RPC'
);

select ok(
  (
    (
      select count(*)
      from public.pos_product_image_mutation_receipts receipt
      where receipt.shop_id =
        '10000000-0000-4000-8000-000000000149'
    ) = (
      select value
      from task149_numbers
      where number_label = 'sensitive_receipts_before'
    )
  )
  and
  (
    (
      select count(*)
      from public.inventory_product_image_versions version
      where version.product_id =
        '60000000-0000-4000-8000-000000000149'
    ) = (
      select value
      from task149_numbers
      where number_label = 'sensitive_versions_before'
    )
  )
  and
  (
    (
      select count(*)
      from public.audit_logs audit
      where audit.shop_id =
        '10000000-0000-4000-8000-000000000149'
        and audit.event_key like 'pos.catalog.product_image.%'
    ) = (
      select value
      from task149_numbers
      where number_label = 'sensitive_audits_before'
    )
  )
  and
  (
    (
      select count(*)
      from public.sync_events event
      where event.owner_user_id =
        '00000000-0000-4000-8000-000000000149'
    ) = (
      select value
      from task149_numbers
      where number_label = 'sensitive_sync_events_before'
    )
  )
  and
  coalesce(
    (
      select revision
      from app_private.pos_catalog_revisions revision
      where revision.shop_id =
        '10000000-0000-4000-8000-000000000149'
    ),
    0
  ) = (
    select value
    from task149_numbers
    where number_label = 'sensitive_revision_before'
  )
  and
  (
    (
      select count(*)
      from app_private.pos_product_image_mutation_budgets budget
      where budget.shop_id =
        '10000000-0000-4000-8000-000000000149'
    ) = (
      select value
      from task149_numbers
      where number_label = 'sensitive_budgets_before'
    )
  )
  and (
    select product.primary_image_version_id is null
    from public.inventory_products product
    where product.id =
      '60000000-0000-4000-8000-000000000149'
  )
  and not exists (
    select 1
    from public.pos_product_image_mutation_receipts receipt
    where receipt.operation_id ~*
        '(^|[._:-])(mcpos_(device|session)_|eyJ|bearer($|[._:-])|token($|[._:-])|secret($|[._:-])|password($|[._:-])|credential($|[._:-])|pin($|[._:-])|access[_-]?token($|[._:-])|refresh[_-]?token($|[._:-]))'
      or receipt.idempotency_key ~*
        '(^|[._:-])(mcpos_(device|session)_|eyJ|bearer($|[._:-])|token($|[._:-])|secret($|[._:-])|password($|[._:-])|credential($|[._:-])|pin($|[._:-])|access[_-]?token($|[._:-])|refresh[_-]?token($|[._:-]))'
  ),
  'token-like identifiers cause zero receipt, version, audit, sync, catalog or budget DML'
);

set local role service_role;

insert into task149_results (result_label, result)
values (
  'write_app_newline',
  pg_temp.task149_intent(
    E'task149\ninvalid',
    'task149.intent.invalid-newline',
    'task149.idem.invalid-newline',
    'sha256:' || repeat('9', 64),
    '60000000-0000-4000-8000-000000000149',
    null,
    pg_temp.task149_main_metadata('9'),
    pg_temp.task149_thumb_metadata('9')
  )
);

insert into task149_results (result_label, result)
values (
  'write_app_del',
  pg_temp.task149_intent(
    'task149' || chr(127) || 'invalid',
    'task149.intent.invalid-del',
    'task149.idem.invalid-del',
    'sha256:' || repeat('9', 64),
    '60000000-0000-4000-8000-000000000149',
    null,
    pg_temp.task149_main_metadata('9'),
    pg_temp.task149_thumb_metadata('9')
  )
);

insert into task149_results (result_label, result)
values (
  'initial_intent',
  pg_temp.task149_intent(
    'future-client-opaque-999',
    'task149.intent.initial',
    'task149.idem.intent.initial',
    'sha256:' || repeat('a', 64),
    '60000000-0000-4000-8000-000000000149',
    null,
    pg_temp.task149_main_metadata('a'),
    pg_temp.task149_thumb_metadata('b')
  )
);

insert into task149_results (result_label, result)
values (
  'initial_intent_replay',
  pg_temp.task149_intent(
    'future-client-opaque-999',
    'task149.intent.initial',
    'task149.idem.intent.initial',
    'sha256:' || repeat('a', 64),
    '60000000-0000-4000-8000-000000000149',
    null,
    pg_temp.task149_main_metadata('a'),
    pg_temp.task149_thumb_metadata('b')
  )
);

insert into task149_results (result_label, result)
values (
  'initial_intent_mismatch',
  pg_temp.task149_intent(
    'future-client-opaque-999',
    'task149.intent.initial',
    'task149.idem.intent.initial',
    'sha256:' || repeat('b', 64),
    '60000000-0000-4000-8000-000000000149',
    null,
    pg_temp.task149_main_metadata('b'),
    pg_temp.task149_thumb_metadata('c')
  )
);

insert into task149_results (result_label, result)
values (
  'intent_not_found',
  pg_temp.task149_intent(
    'task149-fixture',
    'task149.intent.not-found',
    'task149.idem.intent.not-found',
    'sha256:' || repeat('c', 64),
    '60000000-0000-4000-8000-000000000249',
    null,
    pg_temp.task149_main_metadata('c'),
    pg_temp.task149_thumb_metadata('d')
  )
);

insert into task149_results (result_label, result)
values (
  'intent_stale',
  pg_temp.task149_intent(
    'task149-fixture',
    'task149.intent.stale',
    'task149.idem.intent.stale',
    'sha256:' || repeat('d', 64),
    '60000000-0000-4000-8000-000000000149',
    '50000000-0000-4000-8000-000000000149',
    pg_temp.task149_main_metadata('d'),
    pg_temp.task149_thumb_metadata('e')
  )
);

insert into task149_results (result_label, result)
values (
  'intent_invalid_jpeg_metadata',
  pg_temp.task149_intent(
    'task149-fixture',
    'task149.intent.invalid-metadata',
    'task149.idem.intent.invalid-metadata',
    'sha256:' || repeat('e', 64),
    '60000000-0000-4000-8000-000000000149',
    null,
    jsonb_build_object(
      'bytes', 1200,
      'height', 800,
      'mimeType', 'image/png',
      'sha256', repeat('e', 64),
      'width', 1200
    ),
    pg_temp.task149_thumb_metadata('f')
  )
);

set local role postgres;

select is(
  (
    select result->>'code'
    from task149_results
    where result_label = 'write_app_newline'
  ),
  'validation_failed',
  'write envelope rejects an appVersion newline'
);
select is(
  (
    select result->>'code'
    from task149_results
    where result_label = 'write_app_del'
  ),
  'validation_failed',
  'write envelope rejects an appVersion DEL control character'
);
select is(
  (
    select result->>'status'
    from task149_results
    where result_label = 'initial_intent'
  ),
  'upload_required',
  'TASK149_CASE_07 unknown bounded appVersion is accepted by schema policy'
);
select ok(
  (
    select
      result->>'main_path' =
        'shops/10000000-0000-4000-8000-000000000149/products/'
        || '60000000-0000-4000-8000-000000000149/primary/'
        || (result->>'version_id')
        || '/main.jpg'
      and result->>'thumb_path' =
        'shops/10000000-0000-4000-8000-000000000149/products/'
        || '60000000-0000-4000-8000-000000000149/primary/'
        || (result->>'version_id')
        || '/thumb.jpg'
    from task149_results
    where result_label = 'initial_intent'
  ),
  'TASK149_CASE_44 intent paths are canonical and database-derived'
);
select ok(
  (
    select
      version.pos_upload_capability_expires_at >=
        version.expires_at + interval '5 minutes'
      and version.pos_upload_capability_expires_at >
        version.created_at + interval '2 hours 4 minutes'
      and version.pos_upload_capability_expires_at <=
        clock_timestamp() + interval '2 hours 5 minutes'
      and receipt.intent_expires_at = version.expires_at
    from task149_results intent
    join public.inventory_product_image_versions version
      on version.id = (intent.result->>'version_id')::uuid
    join public.pos_product_image_mutation_receipts receipt
      on receipt.shop_id = version.shop_id
     and receipt.operation_id = 'task149.intent.initial'
    where intent.result_label = 'initial_intent'
  ),
  'new POS intent fences cleanup until five minutes after intent expiry'
);
select is(
  (
    select result->>'status'
    from task149_results
    where result_label = 'intent_not_found'
  ),
  'not_found',
  'TASK149_CASE_09 intent for an absent product is terminal not_found'
);
select is(
  (
    select result->>'status'
    from task149_results
    where result_label = 'intent_stale'
  ),
  'stale_conflict',
  'TASK149_CASE_10 intent enforces expected-current-version CAS'
);
select is(
  (
    select result->>'code'
    from task149_results
    where result_label = 'intent_invalid_jpeg_metadata'
  ),
  'validation_failed',
  'TASK149_CASE_11 intent rejects invalid JPEG metadata'
);
select ok(
  (
    select
      replay.result->>'status' = original.result->>'status'
      and replay.result->>'version_id' = original.result->>'version_id'
      and replay.result->>'server_time' = original.result->>'server_time'
      and replay.result->>'replayed' = 'true'
    from task149_results replay
    cross join task149_results original
    where replay.result_label = 'initial_intent_replay'
      and original.result_label = 'initial_intent'
  ),
  'TASK149_CASE_12 same intent identity and hash replays its durable outcome'
);
select is(
  (
    select result->>'code'
    from task149_results
    where result_label = 'initial_intent_mismatch'
  ),
  'idempotency_payload_mismatch',
  'TASK149_CASE_13 same intent identity with a different hash fails closed'
);
select ok(
  (
    select count(*) = 1
    from public.pos_product_image_mutation_receipts receipt
    where receipt.shop_id =
      '10000000-0000-4000-8000-000000000149'
      and receipt.operation_id = 'task149.intent.initial'
  )
  and
  (
    select count(*) = 1
    from public.inventory_product_image_versions version
    where version.product_id =
      '60000000-0000-4000-8000-000000000149'
  )
  and
  (
    select primary_image_version_id is null
    from public.inventory_products product
    where product.id =
      '60000000-0000-4000-8000-000000000149'
  ),
  'different-hash intent replay performs zero receipt, version or catalog DML'
);

insert into task149_numbers (number_label, value)
select
  'revision_before_initial_finalize',
  coalesce(revision, 0)
from app_private.pos_catalog_revisions
where shop_id = '10000000-0000-4000-8000-000000000149';

set local role service_role;

insert into task149_results (result_label, result)
select
  'initial_finalize_prepare',
  pg_temp.task149_finalize_prepare(
    'task149.finalize.initial',
    'task149.idem.finalize.initial',
    'sha256:' || repeat('f', 64),
    '60000000-0000-4000-8000-000000000149',
    null,
    (intent.result->>'version_id')::uuid
  )
from task149_results intent
where intent.result_label = 'initial_intent';

insert into task149_results (result_label, result)
select
  'initial_finalize',
  pg_temp.task149_finalize_commit(
    'task149.finalize.initial',
    'task149.idem.finalize.initial',
    'sha256:' || repeat('f', 64),
    '60000000-0000-4000-8000-000000000149',
    null,
    (intent.result->>'version_id')::uuid,
    true,
    null,
    pg_temp.task149_main_metadata('a'),
    pg_temp.task149_thumb_metadata('b')
  )
from task149_results intent
where intent.result_label = 'initial_intent';

insert into task149_results (result_label, result)
select
  'initial_finalize_replay',
  pg_temp.task149_finalize_commit(
    'task149.finalize.initial',
    'task149.idem.finalize.initial',
    'sha256:' || repeat('f', 64),
    '60000000-0000-4000-8000-000000000149',
    null,
    (intent.result->>'version_id')::uuid,
    true,
    null,
    pg_temp.task149_main_metadata('a'),
    pg_temp.task149_thumb_metadata('b')
  )
from task149_results intent
where intent.result_label = 'initial_intent';

set local role postgres;

insert into task149_numbers (number_label, value)
select
  'revision_after_initial_finalize',
  coalesce(revision, 0)
from app_private.pos_catalog_revisions
where shop_id = '10000000-0000-4000-8000-000000000149';

select is(
  (
    select result->>'status'
    from task149_results
    where result_label = 'initial_finalize_prepare'
  ),
  'validation_required',
  'finalize prepare returns only database-owned validation inputs'
);
select is(
  (
    select result->>'status'
    from task149_results
    where result_label = 'initial_finalize'
  ),
  'finalized',
  'TASK149_CASE_14 valid verified JPEG metadata finalizes atomically'
);
select ok(
  exists (
    select 1
    from public.inventory_products product
    join task149_results result
      on product.primary_image_version_id =
        (result.result->>'version_id')::uuid
    join public.inventory_product_image_versions version
      on version.id = product.primary_image_version_id
    where result.result_label = 'initial_finalize'
      and product.id =
        '60000000-0000-4000-8000-000000000149'
      and product.primary_image_updated_at is not null
      and version.status = 'ready'
      and version.actor_kind = 'pos_staff'
      and version.requested_by_profile_id is null
      and version.requested_by_staff_id =
        '20000000-0000-4000-8000-000000000149'
      and version.finalized_by_staff_id =
        '20000000-0000-4000-8000-000000000149'
      and version.finalized_by_shop_device_id is not null
      and version.finalized_by_pos_session_id is not null
  ),
  'successful finalize publishes one ready version with exact POS attribution'
);
select ok(
  (
    select after.value > before.value
    from task149_numbers before
    cross join task149_numbers after
    where before.number_label = 'revision_before_initial_finalize'
      and after.number_label = 'revision_after_initial_finalize'
  )
  and
  (
    select result->>'catalog_revision' = number.value::text
    from task149_results result
    cross join task149_numbers number
    where result.result_label = 'initial_finalize'
      and number.number_label = 'revision_after_initial_finalize'
  ),
  'TASK149_CASE_23 finalize publishes the authoritative catalog revision'
);
select ok(
  (
    select
      replay.result->>'status' = 'finalized'
      and replay.result->>'replayed' = 'true'
      and replay.result->>'server_time' = original.result->>'server_time'
      and replay.result->>'version_id' = original.result->>'version_id'
    from task149_results replay
    cross join task149_results original
    where replay.result_label = 'initial_finalize_replay'
      and original.result_label = 'initial_finalize'
  )
  and
  (
    select count(*) = 1
    from public.pos_product_image_mutation_receipts receipt
    where receipt.shop_id =
      '10000000-0000-4000-8000-000000000149'
      and receipt.operation_id = 'task149.finalize.initial'
  ),
  'TASK149_CASE_21 finalize retry replays once without duplicate publication'
);
select is(
  (
    select coalesce(revision, 0)
    from app_private.pos_catalog_revisions
    where shop_id = '10000000-0000-4000-8000-000000000149'
  ),
  (
    select value
    from task149_numbers
    where number_label = 'revision_after_initial_finalize'
  ),
  'finalize replay does not advance the catalog revision twice'
);

create function pg_temp.task149_failed_finalize(
  p_label text,
  p_validation_code text,
  p_hash_character text
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_current_version_id uuid;
  v_intent jsonb;
begin
  select (result->>'version_id')::uuid
  into v_current_version_id
  from pg_temp.task149_results
  where result_label = 'initial_finalize';

  v_intent := pg_temp.task149_intent(
    'task149-fixture',
    'task149.intent.failure.' || p_label,
    'task149.idem.intent.failure.' || p_label,
    'sha256:' || repeat(p_hash_character, 64),
    '60000000-0000-4000-8000-000000000149',
    v_current_version_id,
    pg_temp.task149_main_metadata(p_hash_character),
    pg_temp.task149_thumb_metadata(p_hash_character)
  );

  if v_intent->>'status' <> 'upload_required' then
    return jsonb_build_object(
      'ok', false,
      'code', 'fixture_intent_failed',
      'intent', v_intent
    );
  end if;

  return pg_temp.task149_finalize_commit(
    'task149.finalize.failure.' || p_label,
    'task149.idem.finalize.failure.' || p_label,
    'sha256:' || repeat(p_hash_character, 64),
    '60000000-0000-4000-8000-000000000149',
    v_current_version_id,
    (v_intent->>'version_id')::uuid,
    false,
    p_validation_code,
    null,
    null
  );
end;
$$;

grant execute on function pg_temp.task149_failed_finalize(text,text,text)
to service_role;

insert into task149_numbers (number_label, value)
select
  'revision_before_failed_finalizes',
  coalesce(revision, 0)
from app_private.pos_catalog_revisions
where shop_id = '10000000-0000-4000-8000-000000000149';

set local role service_role;

insert into task149_results (result_label, result)
values
  (
    'finalize_missing',
    pg_temp.task149_failed_finalize(
      'missing',
      'storage_object_missing',
      '0'
    )
  ),
  (
    'finalize_mime',
    pg_temp.task149_failed_finalize(
      'mime',
      'jpeg_mime_invalid',
      '1'
    )
  ),
  (
    'finalize_hash',
    pg_temp.task149_failed_finalize(
      'hash',
      'jpeg_checksum_mismatch',
      '2'
    )
  ),
  (
    'finalize_bytes',
    pg_temp.task149_failed_finalize(
      'bytes',
      'jpeg_byte_count_mismatch',
      '3'
    )
  ),
  (
    'finalize_dimensions',
    pg_temp.task149_failed_finalize(
      'dimensions',
      'jpeg_dimensions_invalid',
      '4'
    )
  ),
  (
    'finalize_corrupt',
    pg_temp.task149_failed_finalize(
      'corrupt',
      'jpeg_structure_invalid',
      '5'
    )
  );

insert into task149_results (result_label, result)
select
  'failed_cleanup_retry',
  pg_temp.task149_cleanup_result(
    'finalize',
    'task149.finalize.failure.missing',
    'task149.idem.finalize.failure.missing',
    'sha256:' || repeat('0', 64),
    '60000000-0000-4000-8000-000000000149',
    (failure.result->>'version_id')::uuid,
    false,
    'storage_delete_failed'
  )
from task149_results failure
where failure.result_label = 'finalize_missing';

set local role postgres;

select is(
  (
    select result->>'validation_code'
    from task149_results
    where result_label = 'finalize_missing'
  ),
  'storage_object_missing',
  'TASK149_CASE_15 missing Storage object records a terminal validation failure'
);
select is(
  (
    select result->>'validation_code'
    from task149_results
    where result_label = 'finalize_mime'
  ),
  'jpeg_mime_invalid',
  'TASK149_CASE_16 server-reported MIME mismatch fails finalization'
);
select is(
  (
    select result->>'validation_code'
    from task149_results
    where result_label = 'finalize_hash'
  ),
  'jpeg_checksum_mismatch',
  'TASK149_CASE_17 server-reported hash mismatch fails finalization'
);
select is(
  (
    select result->>'validation_code'
    from task149_results
    where result_label = 'finalize_bytes'
  ),
  'jpeg_byte_count_mismatch',
  'TASK149_CASE_18 server-reported byte mismatch fails finalization'
);
select is(
  (
    select result->>'validation_code'
    from task149_results
    where result_label = 'finalize_dimensions'
  ),
  'jpeg_dimensions_invalid',
  'TASK149_CASE_19 server-reported dimension mismatch fails finalization'
);
select is(
  (
    select result->>'validation_code'
    from task149_results
    where result_label = 'finalize_corrupt'
  ),
  'jpeg_structure_invalid',
  'TASK149_CASE_20 corrupt JPEG structure fails finalization'
);
select ok(
  (
    select product.primary_image_version_id =
      (initial.result->>'version_id')::uuid
    from public.inventory_products product
    cross join task149_results initial
    where product.id =
      '60000000-0000-4000-8000-000000000149'
      and initial.result_label = 'initial_finalize'
  )
  and
  (
    select version.status = 'ready'
    from public.inventory_product_image_versions version
    cross join task149_results initial
    where initial.result_label = 'initial_finalize'
      and version.id = (initial.result->>'version_id')::uuid
  )
  and
  (
    select coalesce(revision, 0) = number.value
    from app_private.pos_catalog_revisions revision
    cross join task149_numbers number
    where revision.shop_id =
      '10000000-0000-4000-8000-000000000149'
      and number.number_label = 'revision_before_failed_finalizes'
  ),
  'TASK149_CASE_22 failed finalize preserves the current ready image and revision'
);
select ok(
  (
    select
      result->>'code' = 'cleanup_recorded'
      and result->>'cleanup_status' = 'pending'
    from task149_results
    where result_label = 'failed_cleanup_retry'
  )
  and
  (
    select
      version.cleanup_status = 'pending'
      and version.cleanup_attempts = 1
      and version.cleanup_last_error_code = 'storage_delete_failed'
    from public.inventory_product_image_versions version
    cross join task149_results failure
    where failure.result_label = 'finalize_missing'
      and version.id = (failure.result->>'version_id')::uuid
  ),
  'failed object deletion remains retryable without changing the valid image'
);

set local role service_role;

insert into task149_results (result_label, result)
select
  'failed_cleanup_capability_pending',
  pg_temp.task149_cleanup_result(
    'finalize',
    'task149.finalize.failure.missing',
    'task149.idem.finalize.failure.missing',
    'sha256:' || repeat('0', 64),
    '60000000-0000-4000-8000-000000000149',
    (failure.result->>'version_id')::uuid,
    true,
    null
  )
from task149_results failure
where failure.result_label = 'finalize_missing';

set local role postgres;

select ok(
  (
    select
      result.result->>'code' = 'cleanup_recorded'
      and result.result->>'cleanup_status' = 'pending'
      and version.cleanup_status = 'pending'
      and version.cleanup_attempts = 2
      and version.cleanup_last_error_code =
        'signed_upload_capability_active'
    from public.inventory_product_image_versions version
    cross join task149_results failure
    cross join task149_results result
    where failure.result_label = 'finalize_missing'
      and result.result_label = 'failed_cleanup_capability_pending'
      and version.id = (failure.result->>'version_id')::uuid
  ),
  'successful cleanup remains pending before the signed capability deadline'
);

update public.inventory_product_image_versions version
set created_at = clock_timestamp() - interval '3 hours',
    expires_at = clock_timestamp() - interval '1 hour',
    pos_upload_capability_expires_at =
      clock_timestamp() - interval '1 second'
from task149_results failure
where failure.result_label = 'finalize_missing'
  and version.id = (failure.result->>'version_id')::uuid;

set local role service_role;

insert into task149_results (result_label, result)
select
  'failed_cleanup_complete',
  pg_temp.task149_cleanup_result(
    'finalize',
    'task149.finalize.failure.missing',
    'task149.idem.finalize.failure.missing',
    'sha256:' || repeat('0', 64),
    '60000000-0000-4000-8000-000000000149',
    (failure.result->>'version_id')::uuid,
    true,
    null
  )
from task149_results failure
where failure.result_label = 'finalize_missing';

set local role postgres;

select ok(
  (
    select
      result.result->>'code' = 'cleanup_recorded'
      and result.result->>'cleanup_status' = 'complete'
      and version.cleanup_status = 'complete'
      and version.cleanup_attempts = 3
      and version.cleanup_last_error_code is null
      and version.pos_upload_capability_expires_at <= clock_timestamp()
    from public.inventory_product_image_versions version
    cross join task149_results failure
    cross join task149_results result
    where failure.result_label = 'finalize_missing'
      and result.result_label = 'failed_cleanup_complete'
      and version.id = (failure.result->>'version_id')::uuid
  ),
  'successful cleanup completes only after the capability deadline'
);

insert into task149_numbers (number_label, value)
select
  'revision_before_replacement',
  coalesce(revision, 0)
from app_private.pos_catalog_revisions
where shop_id = '10000000-0000-4000-8000-000000000149';

set local role service_role;

insert into task149_results (result_label, result)
select
  'replacement_intent',
  pg_temp.task149_intent(
    'task149-fixture',
    'task149.intent.replacement',
    'task149.idem.intent.replacement',
    'sha256:' || repeat('6', 64),
    '60000000-0000-4000-8000-000000000149',
    (initial.result->>'version_id')::uuid,
    pg_temp.task149_main_metadata('6'),
    pg_temp.task149_thumb_metadata('7')
  )
from task149_results initial
where initial.result_label = 'initial_finalize';

insert into task149_results (result_label, result)
select
  'replacement_prepare',
  pg_temp.task149_finalize_prepare(
    'task149.finalize.replacement',
    'task149.idem.finalize.replacement',
    'sha256:' || repeat('7', 64),
    '60000000-0000-4000-8000-000000000149',
    (initial.result->>'version_id')::uuid,
    (replacement.result->>'version_id')::uuid
  )
from task149_results replacement
cross join task149_results initial
where replacement.result_label = 'replacement_intent'
  and initial.result_label = 'initial_finalize';

insert into task149_results (result_label, result)
select
  'replacement_finalize',
  pg_temp.task149_finalize_commit(
    'task149.finalize.replacement',
    'task149.idem.finalize.replacement',
    'sha256:' || repeat('7', 64),
    '60000000-0000-4000-8000-000000000149',
    (initial.result->>'version_id')::uuid,
    (replacement.result->>'version_id')::uuid,
    true,
    null,
    pg_temp.task149_main_metadata('6'),
    pg_temp.task149_thumb_metadata('7')
  )
from task149_results replacement
cross join task149_results initial
where replacement.result_label = 'replacement_intent'
  and initial.result_label = 'initial_finalize';

insert into task149_results (result_label, result)
select
  'replacement_finalize_replay',
  pg_temp.task149_finalize_commit(
    'task149.finalize.replacement',
    'task149.idem.finalize.replacement',
    'sha256:' || repeat('7', 64),
    '60000000-0000-4000-8000-000000000149',
    (initial.result->>'version_id')::uuid,
    (replacement.result->>'version_id')::uuid,
    true,
    null,
    pg_temp.task149_main_metadata('6'),
    pg_temp.task149_thumb_metadata('7')
  )
from task149_results replacement
cross join task149_results initial
where replacement.result_label = 'replacement_intent'
  and initial.result_label = 'initial_finalize';

set local role postgres;

insert into task149_numbers (number_label, value)
select
  'revision_after_replacement',
  coalesce(revision, 0)
from app_private.pos_catalog_revisions
where shop_id = '10000000-0000-4000-8000-000000000149';

select is(
  (
    select result->>'status'
    from task149_results
    where result_label = 'replacement_intent'
  ),
  'upload_required',
  'TASK149_CASE_08 valid replacement intent preserves its expected-version fence'
);
select ok(
  (
    select replacement.result->>'status' = 'finalized'
    from task149_results replacement
    where replacement.result_label = 'replacement_finalize'
  )
  and
  exists (
    select 1
    from public.inventory_product_image_versions prior
    cross join task149_results initial
    where initial.result_label = 'initial_finalize'
      and prior.id = (initial.result->>'version_id')::uuid
      and prior.status = 'superseded'
      and prior.cleanup_status = 'pending'
  )
  and
  exists (
    select 1
    from public.inventory_products product
    cross join task149_results replacement
    where replacement.result_label = 'replacement_finalize'
      and product.id =
        '60000000-0000-4000-8000-000000000149'
      and product.primary_image_version_id =
        (replacement.result->>'version_id')::uuid
  ),
  'replacement atomically supersedes the prior ready image'
);
select ok(
  (
    select after.value > before.value
    from task149_numbers before
    cross join task149_numbers after
    where before.number_label = 'revision_before_replacement'
      and after.number_label = 'revision_after_replacement'
  )
  and
  (
    select replay.result->>'replayed' = 'true'
    from task149_results replay
    where replay.result_label = 'replacement_finalize_replay'
  )
  and
  (
    select coalesce(revision, 0) = number.value
    from app_private.pos_catalog_revisions revision
    cross join task149_numbers number
    where revision.shop_id =
      '10000000-0000-4000-8000-000000000149'
      and number.number_label = 'revision_after_replacement'
  ),
  'TASK149_CASE_37 replacement publishes one catalog revision and replays one-shot'
);

set local role service_role;

insert into task149_results (result_label, result)
values (
  'read_zero',
  pg_temp.task149_read('task149-fixture', '[]'::jsonb)
);

insert into task149_results (result_label, result)
values (
  'read_missing',
  pg_temp.task149_read(
    'task149-fixture',
    jsonb_build_array(jsonb_build_object(
      'productId', '60000000-0000-4000-8000-000000000149',
      'versionId', '50000000-0000-4000-8000-000000000249',
      'variant', 'main'
    ))
  )
);

insert into task149_results (result_label, result)
select
  'read_ready',
  pg_temp.task149_read(
    'task149-fixture',
    jsonb_build_array(jsonb_build_object(
      'productId', '60000000-0000-4000-8000-000000000149',
      'versionId', replacement.result->>'version_id',
      'variant', 'main'
    ))
  )
from task149_results replacement
where replacement.result_label = 'replacement_finalize';

insert into task149_results (result_label, result)
select
  'read_superseded',
  pg_temp.task149_read(
    'task149-fixture',
    jsonb_build_array(jsonb_build_object(
      'productId', '60000000-0000-4000-8000-000000000149',
      'versionId', initial.result->>'version_id',
      'variant', 'thumb'
    ))
  )
from task149_results initial
where initial.result_label = 'initial_finalize';

insert into task149_results (result_label, result)
select
  'read_sixteen',
  pg_temp.task149_read(
    'task149-fixture',
    jsonb_agg(
      jsonb_build_object(
        'productId', '60000000-0000-4000-8000-000000000149',
        'versionId',
          '90000000-0000-4000-8000-' ||
            lpad(number::text, 12, '0'),
        'variant', 'main'
      )
      order by number
    )
  )
from generate_series(1, 16) number;

insert into task149_results (result_label, result)
select
  'read_seventeen',
  pg_temp.task149_read(
    'task149-fixture',
    jsonb_agg(
      jsonb_build_object(
        'productId', '60000000-0000-4000-8000-000000000149',
        'versionId',
          '91000000-0000-4000-8000-' ||
            lpad(number::text, 12, '0'),
        'variant', 'thumb'
      )
      order by number
    )
  )
from generate_series(1, 17) number;

insert into task149_results (result_label, result)
select
  'read_duplicate',
  pg_temp.task149_read(
    'task149-fixture',
    jsonb_build_array(
      jsonb_build_object(
        'productId', '60000000-0000-4000-8000-000000000149',
        'versionId', replacement.result->>'version_id',
        'variant', 'main'
      ),
      jsonb_build_object(
        'productId', '60000000-0000-4000-8000-000000000149',
        'versionId', replacement.result->>'version_id',
        'variant', 'main'
      )
    )
  )
from task149_results replacement
where replacement.result_label = 'replacement_finalize';

insert into task149_results (result_label, result)
values (
  'read_uppercase',
  pg_temp.task149_read(
    'task149-fixture',
    jsonb_build_array(jsonb_build_object(
      'productId', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
      'versionId', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'variant', 'main'
    ))
  )
);

insert into task149_results (result_label, result)
values (
  'read_case_duplicate',
  pg_temp.task149_read(
    'task149-fixture',
    jsonb_build_array(
      jsonb_build_object(
        'productId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'versionId', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'variant', 'thumb'
      ),
      jsonb_build_object(
        'productId', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
        'versionId', 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB',
        'variant', 'thumb'
      )
    )
  )
);

insert into task149_results (result_label, result)
values
  (
    'read_app_newline',
    pg_temp.task149_read(
      E'task149\ninvalid',
      jsonb_build_array(jsonb_build_object(
        'productId', '60000000-0000-4000-8000-000000000149',
        'versionId', '50000000-0000-4000-8000-000000000249',
        'variant', 'main'
      ))
    )
  ),
  (
    'read_app_del',
    pg_temp.task149_read(
      'task149' || chr(127) || 'invalid',
      jsonb_build_array(jsonb_build_object(
        'productId', '60000000-0000-4000-8000-000000000149',
        'versionId', '50000000-0000-4000-8000-000000000249',
        'variant', 'main'
      ))
    )
  );

insert into task149_results (result_label, result)
select
  'read_authorize_app_newline',
  public.pos_product_image_read_authorize_v1(
    '10000000-0000-4000-8000-000000000149',
    runtime.shop_device_id,
    '20000000-0000-4000-8000-000000000149',
    runtime.pos_session_id,
    7,
    'pos-product-image-v1',
    E'task149\ninvalid'
  )
from task149_runtime runtime
where runtime.runtime_label = 'writer_valid';

insert into task149_results (result_label, result)
select
  'read_authorize_app_del',
  public.pos_product_image_read_authorize_v1(
    '10000000-0000-4000-8000-000000000149',
    runtime.shop_device_id,
    '20000000-0000-4000-8000-000000000149',
    runtime.pos_session_id,
    7,
    'pos-product-image-v1',
    'task149' || chr(127) || 'invalid'
  )
from task149_runtime runtime
where runtime.runtime_label = 'writer_valid';

set local role postgres;

select is(
  (select result->>'code' from task149_results where result_label = 'read_zero'),
  'validation_failed',
  'empty read batch is rejected before capability resolution'
);
select is(
  (
    select result#>>'{items,0,code}'
    from task149_results
    where result_label = 'read_missing'
  ),
  'not_found',
  'TASK149_CASE_24 missing image resolves without a signable object path'
);
select is(
  (
    select result#>>'{items,0,code}'
    from task149_results
    where result_label = 'read_ready'
  ),
  'success',
  'TASK149_CASE_25 current ready image resolves for private signing'
);
select is(
  (
    select result#>>'{items,0,code}'
    from task149_results
    where result_label = 'read_superseded'
  ),
  'not_found',
  'TASK149_CASE_26 superseded image cannot be resolved for signing'
);
select is(
  (
    select jsonb_array_length(result->'items')
    from task149_results
    where result_label = 'read_sixteen'
  ),
  16,
  'TASK149_CASE_27 read resolution accepts exactly sixteen bounded refs'
);
select is(
  (
    select result->>'code'
    from task149_results
    where result_label = 'read_seventeen'
  ),
  'validation_failed',
  'TASK149_CASE_28 read resolution rejects a seventeenth ref'
);
select is(
  (
    select result->>'code'
    from task149_results
    where result_label = 'read_duplicate'
  ),
  'validation_failed',
  'duplicate read tuple is rejected'
);
select is(
  (
    select result->>'code'
    from task149_results
    where result_label = 'read_uppercase'
  ),
  'validation_failed',
  'read refs reject non-canonical uppercase UUID text'
);
select is(
  (
    select result->>'code'
    from task149_results
    where result_label = 'read_case_duplicate'
  ),
  'validation_failed',
  'case-insensitive duplicate read tuple is rejected'
);
select ok(
  (
    select bool_and(result->>'code' = 'validation_failed')
    from task149_results
    where result_label in (
      'read_app_newline',
      'read_app_del',
      'read_authorize_app_newline',
      'read_authorize_app_del'
    )
  ),
  'read resolve and post-sign authorize reject newline and DEL appVersion'
);
select ok(
  (
    select
      result#>>'{items,0,object_path}' like
        'shops/%/products/%/primary/%/main.jpg'
      and result::text !~* '(signed.?url|https?://)'
    from task149_results
    where result_label = 'read_ready'
  )
  and not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_class class
      on class.oid = attribute.attrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'pos_product_image_mutation_receipts'
      and attribute.attnum > 0
      and not attribute.attisdropped
      and attribute.attname ~* '(url|path)'
  ),
  'TASK149_CASE_29 DB returns only ephemeral signing input and persists no URL/path'
);
select ok(
  not exists (
    select 1
    from public.audit_logs audit
    where audit.shop_id =
      '10000000-0000-4000-8000-000000000149'
      and audit.event_key like 'pos.catalog.product_image.%'
      and (
        audit.metadata_redacted::text ~*
          '(https?://|main\\.jpg|thumb\\.jpg|sha256:)'
        or audit.metadata_redacted ?| array[
          'signedUrl',
          'signed_url',
          'main_path',
          'thumb_path',
          'device_token',
          'session_token'
        ]
      )
  ),
  'TASK149_CASE_30 signed URLs, paths and hashes are absent from audit logs'
);
select ok(
  not exists (
    select 1
    from public.pos_product_image_mutation_receipts receipt
    where receipt.app_version_class <> 'present'
  ),
  'every durable receipt stores app_version_class=present only'
);

set local role service_role;

insert into task149_results (result_label, result)
select
  'finalize_stale_intent',
  pg_temp.task149_intent(
    'task149-fixture',
    'task149.intent.finalize-stale',
    'task149.idem.intent.finalize-stale',
    'sha256:' || repeat('8', 64),
    '60000000-0000-4000-8000-000000000149',
    (current_image.result->>'version_id')::uuid,
    pg_temp.task149_main_metadata('8'),
    pg_temp.task149_thumb_metadata('9')
  )
from task149_results current_image
where current_image.result_label = 'replacement_finalize';

set local role postgres;

update public.inventory_products
set primary_image_version_id = null,
    primary_image_updated_at = clock_timestamp(),
    updated_at = clock_timestamp()
where id = '60000000-0000-4000-8000-000000000149';

set local role service_role;

insert into task149_results (result_label, result)
select
  'finalize_stale',
  pg_temp.task149_finalize_commit(
    'task149.finalize.stale',
    'task149.idem.finalize.stale',
    'sha256:' || repeat('9', 64),
    '60000000-0000-4000-8000-000000000149',
    (current_image.result->>'version_id')::uuid,
    (pending.result->>'version_id')::uuid,
    true,
    null,
    pg_temp.task149_main_metadata('8'),
    pg_temp.task149_thumb_metadata('9')
  )
from task149_results current_image
cross join task149_results pending
where current_image.result_label = 'replacement_finalize'
  and pending.result_label = 'finalize_stale_intent';

set local role postgres;

update public.inventory_products product
set primary_image_version_id =
      (current_image.result->>'version_id')::uuid,
    primary_image_updated_at = clock_timestamp(),
    updated_at = clock_timestamp()
from task149_results current_image
where product.id = '60000000-0000-4000-8000-000000000149'
  and current_image.result_label = 'replacement_finalize';

select ok(
  (
    select result->>'status' = 'stale_conflict'
    from task149_results
    where result_label = 'finalize_stale'
  )
  and
  (
    select
      version.status = 'failed'
      and version.cleanup_status = 'pending'
      and version.cleanup_last_error_code = 'stale_conflict'
    from public.inventory_product_image_versions version
    cross join task149_results stale
    where stale.result_label = 'finalize_stale'
      and version.id = (stale.result->>'version_id')::uuid
  )
  and
  (
    select
      product.primary_image_version_id =
        (current_image.result->>'version_id')::uuid
      and version.status = 'ready'
    from public.inventory_products product
    cross join task149_results current_image
    join public.inventory_product_image_versions version
      on version.id = (current_image.result->>'version_id')::uuid
    where product.id =
      '60000000-0000-4000-8000-000000000149'
      and current_image.result_label = 'replacement_finalize'
  ),
  'stale finalize fails closed while the prior ready version is preserved'
);

insert into task149_numbers (number_label, value)
select
  'revision_before_remove',
  coalesce(revision, 0)
from app_private.pos_catalog_revisions
where shop_id = '10000000-0000-4000-8000-000000000149';

set local role service_role;

insert into task149_results (result_label, result)
values (
  'remove_stale',
  pg_temp.task149_remove(
    'task149.remove.stale',
    'task149.idem.remove.stale',
    'sha256:' || repeat('a', 64),
    '60000000-0000-4000-8000-000000000149',
    '50000000-0000-4000-8000-000000000349'
  )
);

insert into task149_results (result_label, result)
select
  'remove_success',
  pg_temp.task149_remove(
    'task149.remove.success',
    'task149.idem.remove.success',
    'sha256:' || repeat('b', 64),
    '60000000-0000-4000-8000-000000000149',
    (current_image.result->>'version_id')::uuid
  )
from task149_results current_image
where current_image.result_label = 'replacement_finalize';

insert into task149_results (result_label, result)
select
  'remove_cleanup_pending',
  pg_temp.task149_cleanup_result(
    'remove',
    'task149.remove.success',
    'task149.idem.remove.success',
    'sha256:' || repeat('b', 64),
    '60000000-0000-4000-8000-000000000149',
    (removed.result->>'version_id')::uuid,
    false,
    'storage_delete_failed'
  )
from task149_results removed
where removed.result_label = 'remove_success';

set local role postgres;

insert into task149_numbers (number_label, value)
select
  'revision_after_remove',
  coalesce(revision, 0)
from app_private.pos_catalog_revisions
where shop_id = '10000000-0000-4000-8000-000000000149';

select is(
  (
    select result->>'status'
    from task149_results
    where result_label = 'remove_stale'
  ),
  'stale_conflict',
  'TASK149_CASE_32 remove enforces expected-current-version CAS'
);
select ok(
  (
    select stale.result->>'current_version_id' =
      current_image.result->>'version_id'
    from task149_results stale
    cross join task149_results current_image
    where stale.result_label = 'remove_stale'
      and current_image.result_label = 'replacement_finalize'
  ),
  'stale remove reports the current version without mutating it'
);
select ok(
  (
    select
      result->>'status' = 'removed'
      and result->>'cleanup_required' = 'true'
      and result->>'main_path' like
        'shops/%/products/%/primary/%/main.jpg'
      and result->>'thumb_path' like
        'shops/%/products/%/primary/%/thumb.jpg'
    from task149_results
    where result_label = 'remove_success'
  )
  and
  (
    select
      product.primary_image_version_id is null
      and product.primary_image_updated_at is not null
    from public.inventory_products product
    where product.id =
      '60000000-0000-4000-8000-000000000149'
  ),
  'TASK149_CASE_31 TASK149_CASE_38 valid remove atomically publishes the null catalog image pointer'
);
select ok(
  (
    select
      version.status = 'removed'
      and version.cleanup_status = 'pending'
      and version.cleanup_attempts = 1
      and version.cleanup_last_error_code = 'storage_delete_failed'
    from public.inventory_product_image_versions version
    cross join task149_results removed
    where removed.result_label = 'remove_success'
      and version.id = (removed.result->>'version_id')::uuid
  )
  and
  (
    select
      result->>'code' = 'cleanup_recorded'
      and result->>'cleanup_status' = 'pending'
    from task149_results
    where result_label = 'remove_cleanup_pending'
  ),
  'TASK149_CASE_34 failed remove cleanup remains pending and retryable'
);
select ok(
  (
    select after.value > before.value
    from task149_numbers before
    cross join task149_numbers after
    where before.number_label = 'revision_before_remove'
      and after.number_label = 'revision_after_remove'
  )
  and
  (
    select result->>'catalog_revision' = number.value::text
    from task149_results result
    cross join task149_numbers number
    where result.result_label = 'remove_success'
      and number.number_label = 'revision_after_remove'
  ),
  'remove publishes the authoritative catalog revision'
);

set local role service_role;

insert into task149_results (result_label, result)
values (
  'newer_intent',
  pg_temp.task149_intent(
    'task149-fixture',
    'task149.intent.newer',
    'task149.idem.intent.newer',
    'sha256:' || repeat('c', 64),
    '60000000-0000-4000-8000-000000000149',
    null,
    pg_temp.task149_main_metadata('c'),
    pg_temp.task149_thumb_metadata('d')
  )
);

insert into task149_results (result_label, result)
select
  'newer_finalize',
  pg_temp.task149_finalize_commit(
    'task149.finalize.newer',
    'task149.idem.finalize.newer',
    'sha256:' || repeat('d', 64),
    '60000000-0000-4000-8000-000000000149',
    null,
    (intent.result->>'version_id')::uuid,
    true,
    null,
    pg_temp.task149_main_metadata('c'),
    pg_temp.task149_thumb_metadata('d')
  )
from task149_results intent
where intent.result_label = 'newer_intent';

insert into task149_results (result_label, result)
select
  'remove_success_replay',
  pg_temp.task149_remove(
    'task149.remove.success',
    'task149.idem.remove.success',
    'sha256:' || repeat('b', 64),
    '60000000-0000-4000-8000-000000000149',
    (removed.result->>'version_id')::uuid
  )
from task149_results removed
where removed.result_label = 'remove_success';

insert into task149_results (result_label, result)
select
  'remove_stale_newer',
  pg_temp.task149_remove(
    'task149.remove.stale-newer',
    'task149.idem.remove.stale-newer',
    'sha256:' || repeat('e', 64),
    '60000000-0000-4000-8000-000000000149',
    (removed.result->>'version_id')::uuid
  )
from task149_results removed
where removed.result_label = 'remove_success';

set local role postgres;

select ok(
  (
    select
      replay.result->>'status' = original.result->>'status'
      and replay.result->>'version_id' = original.result->>'version_id'
      and replay.result->>'server_time' = original.result->>'server_time'
      and replay.result->>'replayed' = 'true'
    from task149_results replay
    cross join task149_results original
    where replay.result_label = 'remove_success_replay'
      and original.result_label = 'remove_success'
  )
  and
  (
    select count(*) = 1
    from public.pos_product_image_mutation_receipts receipt
    where receipt.shop_id =
      '10000000-0000-4000-8000-000000000149'
      and receipt.operation_id = 'task149.remove.success'
  ),
  'TASK149_CASE_33 remove replay returns the original one-shot outcome'
);
select ok(
  (
    select result->>'status' = 'stale_conflict'
    from task149_results
    where result_label = 'remove_stale_newer'
  )
  and
  (
    select
      product.primary_image_version_id =
        (newer.result->>'version_id')::uuid
      and version.status = 'ready'
      and version.main_path like
        'shops/%/products/%/primary/%/main.jpg'
      and version.thumb_path like
        'shops/%/products/%/primary/%/thumb.jpg'
    from public.inventory_products product
    cross join task149_results newer
    join public.inventory_product_image_versions version
      on version.id = (newer.result->>'version_id')::uuid
    where product.id =
      '60000000-0000-4000-8000-000000000149'
      and newer.result_label = 'newer_finalize'
  ),
  'TASK149_CASE_35 stale remove and old replay preserve the newer image paths'
);

update public.inventory_product_image_versions version
set pos_upload_capability_expires_at =
      version.created_at + interval '1 microsecond'
from task149_results removed
where removed.result_label = 'remove_success'
  and version.id = (removed.result->>'version_id')::uuid;

set local role service_role;

insert into task149_results (result_label, result)
select
  'remove_cleanup_complete',
  pg_temp.task149_cleanup_result(
    'remove',
    'task149.remove.success',
    'task149.idem.remove.success',
    'sha256:' || repeat('b', 64),
    '60000000-0000-4000-8000-000000000149',
    (removed.result->>'version_id')::uuid,
    true,
    null
  )
from task149_results removed
where removed.result_label = 'remove_success';

set local role postgres;

select ok(
  (
    select
      version.cleanup_status = 'complete'
      and version.cleanup_attempts = 2
      and version.cleanup_last_error_code is null
      and version.pos_upload_capability_expires_at <= clock_timestamp()
    from public.inventory_product_image_versions version
    cross join task149_results removed
    where removed.result_label = 'remove_success'
      and version.id = (removed.result->>'version_id')::uuid
  )
  and
  (
    select product.primary_image_version_id =
      (newer.result->>'version_id')::uuid
    from public.inventory_products product
    cross join task149_results newer
    where product.id =
      '60000000-0000-4000-8000-000000000149'
      and newer.result_label = 'newer_finalize'
  ),
  'cleanup completion remains scoped to the removed version'
);
select ok(
  not exists (
    select 1
    from public.audit_logs audit
    where audit.shop_id =
      '10000000-0000-4000-8000-000000000149'
      and audit.event_key like 'pos.catalog.product_image.%'
      and (
        audit.metadata_redacted::text ~*
          '(https?://|main\\.jpg|thumb\\.jpg|sha256:)'
        or audit.metadata_redacted ?| array[
          'signedUrl',
          'signed_url',
          'main_path',
          'thumb_path',
          'device_token',
          'session_token',
          'request_body'
        ]
      )
  )
  and not exists (
    select 1
    from public.pos_product_image_mutation_receipts receipt
    where receipt.shop_id =
      '10000000-0000-4000-8000-000000000149'
      and (
        receipt.app_version_class <> 'present'
        or receipt.payload_hash !~ '^sha256:[0-9a-f]{64}$'
      )
  ),
  'TASK149_CASE_48 audit and scalar receipts contain no URL, path or secret material'
);

select ok(
  to_regprocedure(
    'app_private.pos_catalog_pull_page_v2_task149_base(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean)'
  ) is not null
  and not has_function_privilege(
    'anon',
    'app_private.pos_catalog_pull_page_v2_task149_base(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.pos_catalog_pull_page_v2_task149_base(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'app_private.pos_catalog_pull_page_v2_task149_base(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean)',
    'EXECUTE'
  )
  and not exists (
    select 1
    from pg_catalog.pg_proc procedure
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        procedure.proacl,
        pg_catalog.acldefault('f', procedure.proowner)
      )
    ) acl_entry
    where procedure.oid =
      'app_private.pos_catalog_pull_page_v2_task149_base(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean)'::regprocedure
      and acl_entry.grantee = 0
      and acl_entry.privilege_type = 'EXECUTE'
  ),
  'TASK-149 catalog V2 owner-only base is revoked from PUBLIC and runtime roles'
);

select ok(
  to_regprocedure(
    'public.pos_catalog_pull_page_v2(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean)'
  ) is not null
  and not has_function_privilege(
    'anon',
    'public.pos_catalog_pull_page_v2(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.pos_catalog_pull_page_v2(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.pos_catalog_pull_page_v2(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean)',
    'EXECUTE'
  )
  and not exists (
    select 1
    from pg_catalog.pg_proc procedure
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        procedure.proacl,
        pg_catalog.acldefault('f', procedure.proowner)
      )
    ) acl_entry
    where procedure.oid =
      'public.pos_catalog_pull_page_v2(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean)'::regprocedure
      and acl_entry.grantee = 0
      and acl_entry.privilege_type = 'EXECUTE'
  ),
  'TASK-149 public catalog V2 wrapper is owner-only and revoked from runtime roles'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.pos_catalog_pull_page_for_lease_v3(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean,uuid,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.pos_catalog_pull_page_for_lease_v3(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean,uuid,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.pos_catalog_pull_page_for_lease_v3(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean,uuid,uuid,uuid)',
    'EXECUTE'
  )
  and not exists (
    select 1
    from pg_catalog.pg_proc procedure
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        procedure.proacl,
        pg_catalog.acldefault('f', procedure.proowner)
      )
    ) acl_entry
    where procedure.oid =
      'public.pos_catalog_pull_page_for_lease_v3(uuid,text,timestamptz,timestamptz,text,timestamptz,uuid,integer,text,text,text,boolean,uuid,uuid,uuid)'::regprocedure
      and acl_entry.grantee = 0
      and acl_entry.privilege_type = 'EXECUTE'
  ),
  'TASK-149 lease-bound catalog V3 remains executable only by service_role'
);

insert into public.inventory_products (
  id,
  owner_user_id,
  shop_id,
  barcode,
  product_name
)
values (
  '60000000-0000-4000-8000-000000000249',
  '00000000-0000-4000-8000-000000000149',
  '10000000-0000-4000-8000-000000000149',
  'TASK149QA_TESTRUN149_NEVER_IMAGE',
  'TASK-149 never-imaged catalog product'
);

insert into public.inventory_products (
  id,
  owner_user_id,
  shop_id,
  barcode,
  product_name,
  primary_image_version_id,
  primary_image_updated_at
)
values (
  '60000000-0000-4000-8000-000000000349',
  '00000000-0000-4000-8000-000000000149',
  '10000000-0000-4000-8000-000000000149',
  'TASK149QA_TESTRUN149_REMOVED_IMAGE',
  'TASK-149 removed-image catalog product',
  null,
  clock_timestamp()
);

create temporary table task149_catalog_results (
  result_label text primary key,
  result jsonb not null
) on commit drop;

grant select, insert on task149_catalog_results to service_role;

insert into task149_catalog_results (result_label, result)
values (
  'direct_products',
  public.pos_catalog_pull_page_v2(
    '10000000-0000-4000-8000-000000000149',
    'full_refresh',
    null,
    null,
    null,
    null,
    null,
    60,
    null,
    null,
    null,
    true
  )
);

set local role service_role;

insert into task149_catalog_results (result_label, result)
select
  'leased_products',
  public.pos_catalog_pull_page_for_lease_v3(
    '10000000-0000-4000-8000-000000000149',
    'full_refresh',
    null,
    null,
    null,
    null,
    null,
    60,
    null,
    null,
    null,
    true,
    runtime.shop_device_id,
    '20000000-0000-4000-8000-000000000149',
    runtime.pos_session_id
  )
from task149_runtime runtime
where runtime.runtime_label = 'writer_valid';

set local role postgres;

select is(
  (
    select count(*)::bigint
    from task149_catalog_results page
    where page.result_label in ('direct_products', 'leased_products')
      and page.result->>'status' = 'ok'
      and page.result->>'entity' = 'products'
      and jsonb_array_length(page.result->'rows') = 3
      and (
        select array_agg(
          row_value->>'id'
          order by row_value->>'id'
        )
        from jsonb_array_elements(page.result->'rows') row_value
      ) = array[
        '60000000-0000-4000-8000-000000000149',
        '60000000-0000-4000-8000-000000000249',
        '60000000-0000-4000-8000-000000000349'
      ]::text[]
  ),
  2::bigint,
  'TASK149_CASE_41 direct V2 and lease-bound V3 return the exact complete products fixture'
);

select is(
  (
    select count(*)::bigint
    from task149_catalog_results page
    where page.result_label in ('direct_products', 'leased_products')
      and exists (
        select 1
        from jsonb_array_elements(page.result->'rows') row_value
        cross join task149_results newer
        where newer.result_label = 'newer_finalize'
          and row_value->>'id' =
            '60000000-0000-4000-8000-000000000149'
          and row_value->>'primary_image_version_id' =
            newer.result->>'version_id'
          and jsonb_typeof(
            row_value->'primary_image_updated_at'
          ) = 'string'
      )
      and exists (
        select 1
        from jsonb_array_elements(page.result->'rows') row_value
        where row_value->>'id' =
            '60000000-0000-4000-8000-000000000249'
          and row_value ? 'primary_image_version_id'
          and row_value->'primary_image_version_id' = 'null'::jsonb
          and row_value ? 'primary_image_updated_at'
          and row_value->'primary_image_updated_at' = 'null'::jsonb
      )
      and exists (
        select 1
        from jsonb_array_elements(page.result->'rows') row_value
        where row_value->>'id' =
            '60000000-0000-4000-8000-000000000349'
          and row_value ? 'primary_image_version_id'
          and row_value->'primary_image_version_id' = 'null'::jsonb
          and jsonb_typeof(
            row_value->'primary_image_updated_at'
          ) = 'string'
      )
  ),
  2::bigint,
  'TASK149_CASE_36 V2 and V3 preserve ready, never-imaged and removed image tri-state'
);

insert into public.inventory_categories (
  id,
  owner_user_id,
  shop_id,
  name,
  updated_at
)
values (
  '61000000-0000-4000-8000-000000000149',
  '00000000-0000-4000-8000-000000000149',
  '10000000-0000-4000-8000-000000000149',
  'TASK-149 non-product wrapper control',
  clock_timestamp()
);

insert into task149_catalog_results (result_label, result)
values (
  'non_product_comparison',
  jsonb_build_object(
    'base',
    app_private.pos_catalog_pull_page_v2_task149_base(
      '10000000-0000-4000-8000-000000000149',
      'full_refresh',
      null,
      null,
      null,
      null,
      null,
      60,
      null,
      null,
      null,
      true
    ),
    'wrapper',
    public.pos_catalog_pull_page_v2(
      '10000000-0000-4000-8000-000000000149',
      'full_refresh',
      null,
      null,
      null,
      null,
      null,
      60,
      null,
      null,
      null,
      true
    )
  )
);

select ok(
  (
    select
      result#>>'{base,status}' = 'ok'
      and result#>>'{base,entity}' = 'categories'
      and result->'base' = result->'wrapper'
    from task149_catalog_results
    where result_label = 'non_product_comparison'
  ),
  'TASK-149 catalog wrapper leaves non-product pages byte-equivalent to its base'
);

delete from app_private.pos_product_image_mutation_budgets
where shop_id = '10000000-0000-4000-8000-000000000149';

set local role service_role;

insert into task149_results (result_label, result)
select
  'rate_pending_intent',
  pg_temp.task149_intent(
    'task149-fixture',
    'task149.intent.rate-pending',
    'task149.idem.intent.rate-pending',
    'sha256:' || repeat('f', 64),
    '60000000-0000-4000-8000-000000000149',
    (current_image.result->>'version_id')::uuid,
    pg_temp.task149_main_metadata('f'),
    pg_temp.task149_thumb_metadata('e')
  )
from task149_results current_image
where current_image.result_label = 'newer_finalize';

set local role postgres;

update public.inventory_product_image_versions version
set pos_upload_capability_expires_at =
      version.created_at + interval '1 microsecond'
from task149_results intent
where intent.result_label = 'rate_pending_intent'
  and version.id = (intent.result->>'version_id')::uuid;

with budget_clock as (
  select clock_timestamp() as checked_at
)
update app_private.pos_product_image_mutation_budgets budget
set admitted_count = case
      when budget.principal_kind = 'shop' then 300
      else 60
    end,
    window_started_at = budget_clock.checked_at,
    updated_at = budget_clock.checked_at
from budget_clock
where budget.shop_id = '10000000-0000-4000-8000-000000000149';

set local role service_role;

insert into task149_results (result_label, result)
select
  'rate_pending_intent_replay',
  pg_temp.task149_intent(
    'task149-fixture',
    'task149.intent.rate-pending',
    'task149.idem.intent.rate-pending',
    'sha256:' || repeat('f', 64),
    '60000000-0000-4000-8000-000000000149',
    (current_image.result->>'version_id')::uuid,
    pg_temp.task149_main_metadata('f'),
    pg_temp.task149_thumb_metadata('e')
  )
from task149_results current_image
where current_image.result_label = 'newer_finalize';

insert into task149_results (result_label, result)
select
  'rate_finalize_replay',
  pg_temp.task149_finalize_commit(
    'task149.finalize.initial',
    'task149.idem.finalize.initial',
    'sha256:' || repeat('f', 64),
    '60000000-0000-4000-8000-000000000149',
    null,
    (intent.result->>'version_id')::uuid,
    true,
    null,
    pg_temp.task149_main_metadata('a'),
    pg_temp.task149_thumb_metadata('b')
  )
from task149_results intent
where intent.result_label = 'initial_intent';

insert into task149_results (result_label, result)
select
  'rate_remove_replay',
  pg_temp.task149_remove(
    'task149.remove.success',
    'task149.idem.remove.success',
    'sha256:' || repeat('b', 64),
    '60000000-0000-4000-8000-000000000149',
    (removed.result->>'version_id')::uuid
  )
from task149_results removed
where removed.result_label = 'remove_success';

set local role postgres;

select ok(
  (
    select
      replay.result->>'status' = 'upload_required'
      and replay.result->>'replayed' = 'true'
      and replay.result ? 'main_path'
      and replay.result ? 'thumb_path'
      and version.pos_upload_capability_expires_at >
        clock_timestamp() + interval '2 hours 4 minutes'
    from task149_results replay
    join public.inventory_product_image_versions version
      on version.id = (replay.result->>'version_id')::uuid
    where replay.result_label = 'rate_pending_intent_replay'
  )
  and
  (
    select
      max(budget.admitted_count)
        filter (where budget.principal_kind = 'shop') = 300
      and max(budget.admitted_count)
        filter (where budget.principal_kind = 'staff') = 60
    from app_private.pos_product_image_mutation_budgets budget
    where budget.shop_id =
      '10000000-0000-4000-8000-000000000149'
  ),
  'exact pending-intent replay extends its capability at full budget without increment'
);

select ok(
  (
    select
      finalize.result->>'status' = 'finalized'
      and finalize.result->>'replayed' = 'true'
      and remove_result.result->>'status' = 'removed'
      and remove_result.result->>'replayed' = 'true'
    from task149_results finalize
    cross join task149_results remove_result
    where finalize.result_label = 'rate_finalize_replay'
      and remove_result.result_label = 'rate_remove_replay'
  )
  and
  (
    select
      max(budget.admitted_count)
        filter (where budget.principal_kind = 'shop') = 300
      and max(budget.admitted_count)
        filter (where budget.principal_kind = 'staff') = 60
    from app_private.pos_product_image_mutation_budgets budget
    where budget.shop_id =
      '10000000-0000-4000-8000-000000000149'
  ),
  'exact stored finalize/remove replay remains available at full budget'
);

update public.inventory_product_image_versions version
set created_at = clock_timestamp() - interval '3 hours',
    expires_at = clock_timestamp() - interval '1 hour'
from task149_results intent
where intent.result_label = 'rate_pending_intent'
  and version.id = (intent.result->>'version_id')::uuid;

set local role service_role;

insert into task149_results (result_label, result)
select
  'rate_pending_intent_expired_replay',
  pg_temp.task149_intent(
    'task149-fixture',
    'task149.intent.rate-pending',
    'task149.idem.intent.rate-pending',
    'sha256:' || repeat('f', 64),
    '60000000-0000-4000-8000-000000000149',
    (current_image.result->>'version_id')::uuid,
    pg_temp.task149_main_metadata('f'),
    pg_temp.task149_thumb_metadata('e')
  )
from task149_results current_image
where current_image.result_label = 'newer_finalize';

set local role postgres;

select ok(
  (
    select
      result->>'ok' = 'false'
      and result->>'code' = 'intent_expired'
      and result->>'status' = 'intent_expired'
      and result->>'replayed' = 'true'
      and result->>'version_id' =
        (
          select original.result->>'version_id'
          from task149_results original
          where original.result_label = 'rate_pending_intent'
        )
      and not result ? 'main_path'
      and not result ? 'thumb_path'
    from task149_results
    where result_label = 'rate_pending_intent_expired_replay'
  )
  and
  (
    select
      max(budget.admitted_count)
        filter (where budget.principal_kind = 'shop') = 300
      and max(budget.admitted_count)
        filter (where budget.principal_kind = 'staff') = 60
    from app_private.pos_product_image_mutation_budgets budget
    where budget.shop_id =
      '10000000-0000-4000-8000-000000000149'
  ),
  'expired exact intent replay is fenced without paths or budget increment'
);

insert into task149_numbers (number_label, value)
values
  (
    'rate_receipts_before',
    (
      select count(*)
      from public.pos_product_image_mutation_receipts receipt
      where receipt.shop_id =
        '10000000-0000-4000-8000-000000000149'
    )
  ),
  (
    'rate_audits_before',
    (
      select count(*)
      from public.audit_logs audit
      where audit.shop_id =
        '10000000-0000-4000-8000-000000000149'
        and audit.event_key like 'pos.catalog.product_image.%'
    )
  ),
  (
    'rate_versions_before',
    (
      select count(*)
      from public.inventory_product_image_versions version
      where version.product_id =
        '60000000-0000-4000-8000-000000000149'
    )
  ),
  (
    'rate_revision_before',
    coalesce(
      (
        select revision
        from app_private.pos_catalog_revisions
        where shop_id =
          '10000000-0000-4000-8000-000000000149'
      ),
      0
    )
  ),
  (
    'rate_cleanup_attempts_before',
    (
      select version.cleanup_attempts
      from public.inventory_product_image_versions version
      cross join task149_results failure
      where failure.result_label = 'finalize_mime'
        and version.id = (failure.result->>'version_id')::uuid
    )
  );

set local role service_role;

insert into task149_results (result_label, result)
select
  'rate_intent_denied',
  pg_temp.task149_intent(
    'task149-fixture',
    'task149.intent.rate-denied',
    'task149.idem.intent.rate-denied',
    'sha256:' || repeat('d', 64),
    '60000000-0000-4000-8000-000000000149',
    (current_image.result->>'version_id')::uuid,
    pg_temp.task149_main_metadata('d'),
    pg_temp.task149_thumb_metadata('c')
  )
from task149_results current_image
where current_image.result_label = 'newer_finalize';

insert into task149_results (result_label, result)
select
  'rate_finalize_prepare_denied',
  pg_temp.task149_finalize_prepare(
    'task149.finalize.rate-denied',
    'task149.idem.finalize.rate-denied',
    'sha256:' || repeat('c', 64),
    '60000000-0000-4000-8000-000000000149',
    (current_image.result->>'version_id')::uuid,
    (pending.result->>'version_id')::uuid
  )
from task149_results current_image
cross join task149_results pending
where current_image.result_label = 'newer_finalize'
  and pending.result_label = 'rate_pending_intent';

insert into task149_results (result_label, result)
select
  'rate_finalize_commit_denied',
  pg_temp.task149_finalize_commit(
    'task149.finalize.rate-denied',
    'task149.idem.finalize.rate-denied',
    'sha256:' || repeat('c', 64),
    '60000000-0000-4000-8000-000000000149',
    (current_image.result->>'version_id')::uuid,
    (pending.result->>'version_id')::uuid,
    true,
    null,
    pg_temp.task149_main_metadata('f'),
    pg_temp.task149_thumb_metadata('e')
  )
from task149_results current_image
cross join task149_results pending
where current_image.result_label = 'newer_finalize'
  and pending.result_label = 'rate_pending_intent';

insert into task149_results (result_label, result)
select
  'rate_remove_denied',
  pg_temp.task149_remove(
    'task149.remove.rate-denied',
    'task149.idem.remove.rate-denied',
    'sha256:' || repeat('b', 64),
    '60000000-0000-4000-8000-000000000149',
    (current_image.result->>'version_id')::uuid
  )
from task149_results current_image
where current_image.result_label = 'newer_finalize';

insert into task149_results (result_label, result)
select
  'rate_cleanup_denied',
  pg_temp.task149_cleanup_result(
    'finalize',
    'task149.finalize.failure.mime',
    'task149.idem.finalize.failure.mime',
    'sha256:' || repeat('1', 64),
    '60000000-0000-4000-8000-000000000149',
    (failure.result->>'version_id')::uuid,
    true,
    null
  )
from task149_results failure
where failure.result_label = 'finalize_mime';

insert into task149_results (result_label, result)
select
  'rate_node_audit_denied',
  public.pos_product_image_node_audit_admit_v1(
    '10000000-0000-4000-8000-000000000149',
    runtime.shop_device_id,
    '20000000-0000-4000-8000-000000000149',
    runtime.pos_session_id,
    7,
    'catalog.write'
  )
from task149_runtime runtime
where runtime.runtime_label = 'writer_valid';

set local role postgres;

select ok(
  (
    select count(*) = 5
      and bool_and(result->>'ok' = 'false')
      and bool_and(result->>'code' = 'rate_limited')
    from task149_results
    where result_label in (
      'rate_intent_denied',
      'rate_finalize_prepare_denied',
      'rate_finalize_commit_denied',
      'rate_remove_denied',
      'rate_cleanup_denied'
    )
  )
  and
  (
    select
      result->>'ok' = 'true'
      and result->>'admitted' = 'true'
      and result ? 'server_time'
    from task149_results
    where result_label = 'rate_node_audit_denied'
  ),
  'full mutation budget denies mutation writes without starving Node audit admission'
);

select ok(
  (
    (
      select count(*)
      from public.pos_product_image_mutation_receipts receipt
      where receipt.shop_id =
        '10000000-0000-4000-8000-000000000149'
    ) = (
      select number.value
      from task149_numbers number
      where number.number_label = 'rate_receipts_before'
    )
  )
  and
  (
    (
      select count(*)
      from public.audit_logs audit
      where audit.shop_id =
        '10000000-0000-4000-8000-000000000149'
        and audit.event_key like 'pos.catalog.product_image.%'
    ) = (
      select number.value
      from task149_numbers number
      where number.number_label = 'rate_audits_before'
    )
  )
  and
  (
    (
      select count(*)
      from public.inventory_product_image_versions version
      where version.product_id =
        '60000000-0000-4000-8000-000000000149'
    ) = (
      select number.value
      from task149_numbers number
      where number.number_label = 'rate_versions_before'
    )
  )
  and
  (
    select coalesce(revision, 0) = number.value
    from app_private.pos_catalog_revisions revision
    cross join task149_numbers number
    where revision.shop_id =
      '10000000-0000-4000-8000-000000000149'
      and number.number_label = 'rate_revision_before'
  )
  and
  (
    select
      version.cleanup_attempts = number.value
      and version.cleanup_status = 'pending'
    from public.inventory_product_image_versions version
    cross join task149_results failure
    cross join task149_numbers number
    where failure.result_label = 'finalize_mime'
      and number.number_label = 'rate_cleanup_attempts_before'
      and version.id = (failure.result->>'version_id')::uuid
  )
  and
  (
    select
      product.primary_image_version_id =
        (current_image.result->>'version_id')::uuid
      and pending.status = 'pending'
    from public.inventory_products product
    cross join task149_results current_image
    cross join task149_results pending_result
    join public.inventory_product_image_versions pending
      on pending.id = (pending_result.result->>'version_id')::uuid
    where product.id =
      '60000000-0000-4000-8000-000000000149'
      and current_image.result_label = 'newer_finalize'
      and pending_result.result_label = 'rate_pending_intent'
  )
  and
  (
    select
      max(budget.admitted_count)
        filter (where budget.principal_kind = 'shop') = 300
      and max(budget.admitted_count)
        filter (where budget.principal_kind = 'staff') = 60
    from app_private.pos_product_image_mutation_budgets budget
    where budget.shop_id =
      '10000000-0000-4000-8000-000000000149'
  ),
  'rate-limited boundaries perform zero receipt, audit, version, cleanup, catalog or budget DML'
);

update app_private.pos_product_image_mutation_budgets
set admitted_count = case
      when principal_kind = 'node_audit_shop' then 300
      else 60
    end,
    window_started_at = clock_timestamp(),
    updated_at = clock_timestamp()
where shop_id = '10000000-0000-4000-8000-000000000149'
  and principal_kind in ('node_audit_shop', 'node_audit_staff');

delete from app_private.pos_product_image_mutation_budgets
where shop_id = '10000000-0000-4000-8000-000000000149'
  and principal_kind in ('shop', 'staff');

insert into task149_results (result_label, result)
values (
  'isolated_node_budget_result',
  jsonb_build_object(
    'admitted',
    app_private.pos_product_image_admit_node_audit_v1(
      '10000000-0000-4000-8000-000000000149',
      '20000000-0000-4000-8000-000000000149',
      clock_timestamp()
    )
  )
);

insert into task149_results (result_label, result)
values (
  'isolated_mutation_budget_result',
  jsonb_build_object(
    'admitted',
    app_private.pos_product_image_admit_write_v1(
      '10000000-0000-4000-8000-000000000149',
      '20000000-0000-4000-8000-000000000149',
      clock_timestamp()
    )
  )
);

select ok(
  (
    select result->>'admitted' = 'false'
    from task149_results
    where result_label = 'isolated_node_budget_result'
  )
  and
  (
    select result->>'admitted' = 'true'
    from task149_results
    where result_label = 'isolated_mutation_budget_result'
  ),
  'exhausted Node-audit budget does not starve fresh mutation admission'
);

select ok(
  (
    select
      count(*) = 4
      and max(admitted_count)
        filter (where principal_kind = 'node_audit_shop') = 300
      and max(admitted_count)
        filter (where principal_kind = 'node_audit_staff') = 60
      and max(admitted_count)
        filter (where principal_kind = 'shop') = 1
      and max(admitted_count)
        filter (where principal_kind = 'staff') = 1
    from app_private.pos_product_image_mutation_budgets
    where shop_id = '10000000-0000-4000-8000-000000000149'
  ),
  'one shop/staff fixture has at most four isolated fixed budget rows'
);

insert into task149_numbers (number_label, value)
select
  'legacy_cleanup_attempts_before',
  version.cleanup_attempts
from public.inventory_product_image_versions version
cross join task149_results removed
where removed.result_label = 'remove_success'
  and version.id = (removed.result->>'version_id')::uuid;

update public.inventory_product_image_versions version
set cleanup_status = 'pending',
    cleanup_last_error_code = null,
    pos_upload_capability_expires_at =
      clock_timestamp() + interval '5 minutes'
from task149_results removed
where removed.result_label = 'remove_success'
  and version.id = (removed.result->>'version_id')::uuid;

set local role service_role;

insert into task149_results (result_label, result)
select
  'legacy_cleanup_null_success_pending',
  public.product_image_record_cleanup(
    null,
    'platform_admin',
    '10000000-0000-4000-8000-000000000149',
    '60000000-0000-4000-8000-000000000149',
    (removed.result->>'version_id')::uuid,
    null,
    null,
    'api_remove'
  )
from task149_results removed
where removed.result_label = 'remove_success';

set local role postgres;

select ok(
  (
    select
      result.result->>'ok' = 'true'
      and result.result->>'code' = 'cleanup_failed'
      and result.result->>'cleanup_status' = 'pending'
      and version.cleanup_status = 'pending'
      and version.cleanup_last_error_code = 'storage_delete_failed'
      and version.cleanup_attempts = number.value + 1
    from task149_results result
    cross join task149_results removed
    cross join task149_numbers number
    join public.inventory_product_image_versions version
      on version.id = (removed.result->>'version_id')::uuid
    where result.result_label = 'legacy_cleanup_null_success_pending'
      and removed.result_label = 'remove_success'
      and number.number_label = 'legacy_cleanup_attempts_before'
  ),
  'legacy Shop Admin cleanup treats NULL success as a failed delete'
);

set local role service_role;

insert into task149_results (result_label, result)
select
  'legacy_cleanup_capability_pending',
  public.product_image_record_cleanup(
    null,
    'platform_admin',
    '10000000-0000-4000-8000-000000000149',
    '60000000-0000-4000-8000-000000000149',
    (removed.result->>'version_id')::uuid,
    true,
    null,
    'api_remove'
  )
from task149_results removed
where removed.result_label = 'remove_success';

set local role postgres;

select ok(
  (
    select
      result.result->>'ok' = 'true'
      and result.result->>'code' = 'cleanup_pending'
      and result.result->>'cleanup_status' = 'pending'
      and version.cleanup_status = 'pending'
      and version.cleanup_last_error_code =
        'signed_upload_capability_active'
      and version.cleanup_attempts = number.value + 2
    from task149_results result
    cross join task149_results removed
    cross join task149_numbers number
    join public.inventory_product_image_versions version
      on version.id = (removed.result->>'version_id')::uuid
    where result.result_label = 'legacy_cleanup_capability_pending'
      and removed.result_label = 'remove_success'
      and number.number_label = 'legacy_cleanup_attempts_before'
  )
  and exists (
    select 1
    from public.audit_logs audit
    where audit.shop_id =
      '10000000-0000-4000-8000-000000000149'
      and audit.event_key = 'shop.product_image.cleanup_deferred'
      and audit.result = 'blocked'
  ),
  'legacy Shop Admin cleanup remains pending while a POS capability is active'
);

update public.inventory_product_image_versions version
set pos_upload_capability_expires_at =
      version.created_at + interval '1 microsecond'
from task149_results removed
where removed.result_label = 'remove_success'
  and version.id = (removed.result->>'version_id')::uuid;

set local role service_role;

insert into task149_results (result_label, result)
select
  'legacy_cleanup_capability_expired',
  public.product_image_record_cleanup(
    null,
    'platform_admin',
    '10000000-0000-4000-8000-000000000149',
    '60000000-0000-4000-8000-000000000149',
    (removed.result->>'version_id')::uuid,
    true,
    null,
    'admin_script'
  )
from task149_results removed
where removed.result_label = 'remove_success';

set local role postgres;

select ok(
  (
    select
      result.result->>'ok' = 'true'
      and result.result->>'code' = 'cleanup_complete'
      and result.result->>'cleanup_status' = 'complete'
      and version.cleanup_status = 'complete'
      and version.cleanup_last_error_code is null
      and version.cleanup_attempts = number.value + 3
    from task149_results result
    cross join task149_results removed
    cross join task149_numbers number
    join public.inventory_product_image_versions version
      on version.id = (removed.result->>'version_id')::uuid
    where result.result_label = 'legacy_cleanup_capability_expired'
      and removed.result_label = 'remove_success'
      and number.number_label = 'legacy_cleanup_attempts_before'
  )
  and exists (
    select 1
    from public.audit_logs audit
    where audit.shop_id =
      '10000000-0000-4000-8000-000000000149'
      and audit.event_key = 'shop.product_image.cleanup_completed'
      and audit.result = 'success'
  ),
  'legacy Shop Admin cleanup becomes terminal only after capability expiry'
);

delete from app_private.pos_product_image_mutation_budgets
where shop_id = '10000000-0000-4000-8000-000000000149';

update public.shops
set shop_code = 'TASK149_SHOP_TESTRUN149',
    shop_name = 'TASK149_SYNTHETIC_SHOP_TESTRUN149'
where shop_id = '10000000-0000-4000-8000-000000000149';

update public.staff_accounts
set staff_code = 'TASK149_POS_TESTRUN149',
    display_name = 'TASK149_SYNTHETIC_STAFF_TESTRUN149'
where shop_id = '10000000-0000-4000-8000-000000000149'
  and staff_id = '20000000-0000-4000-8000-000000000149';

update public.shop_devices
set device_identifier = 'TASK149_DEVICE_TESTRUN149'
where shop_id = '10000000-0000-4000-8000-000000000149'
  and shop_device_id = (
    select runtime.shop_device_id
    from task149_runtime runtime
    where runtime.runtime_label = 'writer_valid'
  );

insert into public.inventory_products (
  id,
  owner_user_id,
  shop_id,
  barcode,
  item_number,
  product_name
)
values (
  '60000000-0000-4000-8000-000000000949',
  '00000000-0000-4000-8000-000000000149',
  '10000000-0000-4000-8000-000000000149',
  'TASK149_BARCODE_TESTRUN149',
  'TASK149_ITEM_TESTRUN149',
  'TASK149_SYNTHETIC_PRODUCT_TESTRUN149'
);

set local role service_role;

insert into task149_results (result_label, result)
values (
  'fixture_cleanup_intent',
  pg_temp.task149_intent(
    'task149-fixture',
    'task149.task149_testrun149.intent.1',
    'task149.fixture.cleanup.intent.1',
    'sha256:' || repeat('9', 64),
    '60000000-0000-4000-8000-000000000949',
    null,
    pg_temp.task149_main_metadata('9'),
    pg_temp.task149_thumb_metadata('8')
  )
);

insert into task149_results (result_label, result)
values (
  'fixture_cleanup_pre_deadline',
  public.task_149_pos_product_image_fixture_cleanup_v1(
    'apply',
    'TASK149_TESTRUN149',
    '10000000-0000-4000-8000-000000000149',
    '60000000-0000-4000-8000-000000000949',
    array[
      'task149.task149_testrun149.intent.1',
      'task149.task149_testrun149.finalize.1',
      'task149.task149_testrun149.intent.2',
      'task149.task149_testrun149.finalize.2',
      'task149.task149_testrun149.intent.3',
      'task149.task149_testrun149.stale-finalize.3',
      'task149.task149_testrun149.stale-remove.1',
      'task149.task149_testrun149.remove.2'
    ]
  )
);

set local role postgres;

select ok(
  (
    select
      result->>'ok' = 'false'
      and result->>'code' = 'signed_upload_capability_active'
      and result ? 'retry_after_at'
      and (result#>>'{counts,products}')::integer = 1
      and (result#>>'{counts,image_versions}')::integer = 1
      and (result#>>'{counts,receipts}')::integer = 1
    from task149_results
    where result_label = 'fixture_cleanup_pre_deadline'
  )
  and exists (
    select 1
    from public.inventory_products product
    where product.id = '60000000-0000-4000-8000-000000000949'
  )
  and exists (
    select 1
    from public.inventory_product_image_versions version
    cross join task149_results intent
    where intent.result_label = 'fixture_cleanup_intent'
      and version.id = (intent.result->>'version_id')::uuid
  )
  and exists (
    select 1
    from public.pos_product_image_mutation_receipts receipt
    where receipt.operation_id =
      'task149.task149_testrun149.intent.1'
  ),
  'fixture cleanup performs zero DML before every upload capability expires'
);

update public.inventory_product_image_versions version
set pos_upload_capability_expires_at =
      version.created_at + interval '1 microsecond'
where version.shop_id = '10000000-0000-4000-8000-000000000149'
  and version.product_id = '60000000-0000-4000-8000-000000000949';

set local role service_role;

insert into task149_results (result_label, result)
values (
  'fixture_cleanup_after_deadline',
  public.task_149_pos_product_image_fixture_cleanup_v1(
    'apply',
    'TASK149_TESTRUN149',
    '10000000-0000-4000-8000-000000000149',
    '60000000-0000-4000-8000-000000000949',
    array[
      'task149.task149_testrun149.intent.1',
      'task149.task149_testrun149.finalize.1',
      'task149.task149_testrun149.intent.2',
      'task149.task149_testrun149.finalize.2',
      'task149.task149_testrun149.intent.3',
      'task149.task149_testrun149.stale-finalize.3',
      'task149.task149_testrun149.stale-remove.1',
      'task149.task149_testrun149.remove.2'
    ]
  )
);

insert into task149_results (result_label, result)
values (
  'fixture_cleanup_verify',
  public.task_149_pos_product_image_fixture_cleanup_v1(
    'verify',
    'TASK149_TESTRUN149',
    '10000000-0000-4000-8000-000000000149',
    '60000000-0000-4000-8000-000000000949',
    array[
      'task149.task149_testrun149.intent.1',
      'task149.task149_testrun149.finalize.1',
      'task149.task149_testrun149.intent.2',
      'task149.task149_testrun149.finalize.2',
      'task149.task149_testrun149.intent.3',
      'task149.task149_testrun149.stale-finalize.3',
      'task149.task149_testrun149.stale-remove.1',
      'task149.task149_testrun149.remove.2'
    ]
  )
);

set local role postgres;

select ok(
  (
    select
      applied.result->>'ok' = 'true'
      and applied.result->>'code' = 'cleanup_applied'
      and (applied.result#>>'{counts,products}')::integer = 1
      and (applied.result#>>'{counts,image_versions}')::integer = 1
      and (applied.result#>>'{counts,receipts}')::integer = 1
      and (applied.result#>>'{counts,write_budget_rows}')::integer
        between 0 and 4
      and verified.result->>'ok' = 'true'
      and verified.result->>'code' = 'cleanup_verified'
      and (
        select sum(value::integer)
        from jsonb_each_text(verified.result->'counts')
      ) = 0
    from task149_results applied
    cross join task149_results verified
    where applied.result_label = 'fixture_cleanup_after_deadline'
      and verified.result_label = 'fixture_cleanup_verify'
  ),
  'fixture cleanup deletes exact database scope after capability expiry'
);

select * from finish();
rollback;
