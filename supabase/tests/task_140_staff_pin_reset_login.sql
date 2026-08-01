begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(230);

select has_function(
  'app_private',
  'staff_web_login_attempt_key_hash',
  array['text', 'text'],
  'TASK-140 private web lockout key helper exists'
);
select has_function(
  'app_private',
  'clear_staff_web_login_attempt_lockout',
  array['uuid', 'text'],
  'TASK-140 private web lockout clear helper exists'
);
select has_function(
  'app_private',
  'task051_insert_initial_manager',
  array['uuid', 'uuid', 'text', 'text'],
  'TASK-140 preserves the initial manager helper signature'
);
select has_function(
  'app_private',
  'mac_admin_w7pos_009_pos_admin_permissions',
  array[]::text[],
  'TASK-140 installs the self-contained POS Admin permission helper'
);
select has_function(
  'public',
  'shop_staff_create',
  array['uuid', 'text', 'text', 'text', 'text', 'text', 'timestamp with time zone'],
  'TASK-140 preserves the shop staff create RPC signature'
);
select has_function(
  'public',
  'shop_staff_reset_credential',
  array['uuid', 'uuid', 'text', 'text', 'text', 'timestamp with time zone'],
  'TASK-140 preserves the shop staff reset RPC signature'
);
select has_function(
  'public',
  'shop_staff_clear_lockout',
  array['uuid', 'uuid', 'text'],
  'TASK-140 preserves the shop staff clear-lockout RPC signature'
);
select has_function(
  'public',
  'shop_staff_mutate_as_staff_web',
  array[
    'uuid', 'uuid', 'uuid', 'text', 'uuid', 'text', 'text', 'text', 'text',
    'text', 'text', 'timestamp with time zone'
  ],
  'TASK-140 exposes the exact-session atomic staff-web mutation RPC'
);
select hasnt_function(
  'public',
  'shop_staff_mutate_as_staff_web',
  array[
    'uuid', 'uuid', 'text', 'uuid', 'text', 'text', 'text', 'text', 'text',
    'text', 'timestamp with time zone'
  ],
  'TASK-140 drops the historical session-any staff-web mutation overload'
);
select has_function(
  'public',
  'shop_staff_lifecycle_as_staff_web',
  array['uuid', 'uuid', 'uuid', 'text', 'uuid', 'text'],
  'TASK-140 exposes the exact-session staff-web lifecycle RPC'
);
select has_function(
  'public',
  'shop_staff_lifecycle_as_personal_account',
  array['uuid', 'text', 'uuid', 'text'],
  'TASK-140 exposes the JWT-only personal lifecycle RPC'
);
select has_function(
  'public',
  'shop_staff_replace_role_permissions_as_web',
  array['uuid', 'uuid', 'uuid', 'text', 'text[]'],
  'TASK-140 exposes the unified atomic permission replacement RPC'
);
select has_function(
  'public',
  'platform_recover_initial_manager_1001',
  array['uuid', 'text', 'text', 'text', 'text'],
  'TASK-140 preserves the advanced recovery RPC signature'
);
select has_function(
  'public',
  'staff_record_login_failure',
  array['text', 'text', 'text', 'uuid', 'uuid', 'integer', 'jsonb'],
  'TASK-140 exposes one version-aware atomic login-failure RPC'
);
select has_function(
  'public',
  'pos_sales_sync_apply_v1',
  array[
    'uuid', 'text', 'uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'text',
    'jsonb', 'jsonb'
  ],
  'TASK-140 preserves the public POS sales apply signature'
);
select has_function(
  'public',
  'task140_pos_sales_sync_apply_v1_task137',
  array[
    'uuid', 'text', 'uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'text',
    'jsonb', 'jsonb'
  ],
  'TASK-140 preserves the TASK-137 financial implementation internally'
);
select has_trigger(
  'public',
  'staff_accounts',
  'task140_enforce_pos_admin_owner_platform',
  'TASK-140 installs the POS Admin owner/platform delegation guard'
);
select has_trigger(
  'public',
  'staff_role_permissions',
  'task140_enforce_staff_role_permission_boundary',
  'TASK-140 installs the structural staff role permission boundary'
);
select has_trigger(
  'public',
  'shops',
  'task140_seed_pos_admin_permissions_for_shop',
  'TASK-140 seeds canonical POS Admin permissions for every new shop'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.staff_record_login_failure(text,text,text,uuid,uuid,integer,jsonb)',
    'EXECUTE'
  ),
  'service_role can execute the internal login-failure RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.staff_record_login_failure(text,text,text,uuid,uuid,integer,jsonb)',
    'EXECUTE'
  ),
  'authenticated cannot execute the internal login-failure RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.staff_record_login_failure(text,text,text,uuid,uuid,integer,jsonb)',
    'EXECUTE'
  ),
  'anon cannot execute the internal login-failure RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.staff_web_login_attempt_key_hash(text,text)',
    'EXECUTE'
  ),
  'authenticated cannot execute the private web lockout key helper'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.clear_staff_web_login_attempt_lockout(uuid,text)',
    'EXECUTE'
  ),
  'authenticated cannot execute the private web lockout clear helper'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.task051_insert_initial_manager(uuid,uuid,text,text)',
    'EXECUTE'
  ),
  'authenticated cannot execute the private initial manager helper'
);
select ok(
  not exists (
    select 1
    from pg_proc function_row
    join pg_namespace function_schema
      on function_schema.oid = function_row.pronamespace
    cross join lateral aclexplode(
      coalesce(function_row.proacl, acldefault('f', function_row.proowner))
    ) as privilege
    left join pg_roles as grantee
      on grantee.oid = privilege.grantee
    where function_schema.nspname = 'app_private'
      and function_row.proname = 'mac_admin_w7pos_009_pos_admin_permissions'
      and privilege.privilege_type = 'EXECUTE'
      and (
        privilege.grantee = 0
        or grantee.rolname in ('anon', 'authenticated', 'service_role')
      )
  ),
  'POS Admin permission helper is internal-only for PUBLIC and API roles'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.shop_staff_create(uuid,text,text,text,text,text,timestamptz)',
    'EXECUTE'
  ),
  'authenticated keeps execute on shop staff create'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.shop_staff_reset_credential(uuid,uuid,text,text,text,timestamptz)',
    'EXECUTE'
  ),
  'authenticated keeps execute on shop staff reset'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.shop_staff_clear_lockout(uuid,uuid,text)',
    'EXECUTE'
  ),
  'authenticated keeps execute on shop staff clear-lockout'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.platform_recover_initial_manager_1001(uuid,text,text,text,text)',
    'EXECUTE'
  ),
  'authenticated keeps execute on advanced recovery'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.shop_staff_reset_credential(uuid,uuid,text,text,text,timestamptz)',
    'EXECUTE'
  ),
  'anon cannot execute shop staff reset'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.shop_staff_mutate_as_staff_web(uuid,uuid,uuid,text,uuid,text,text,text,text,text,text,timestamptz)',
    'EXECUTE'
  ),
  'service role can execute the atomic staff-web mutation boundary'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.shop_staff_mutate_as_staff_web(uuid,uuid,uuid,text,uuid,text,text,text,text,text,text,timestamptz)',
    'EXECUTE'
  ),
  'authenticated cannot execute the service-only staff-web mutation boundary'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.shop_staff_mutate_as_staff_web(uuid,uuid,uuid,text,uuid,text,text,text,text,text,text,timestamptz)',
    'EXECUTE'
  ),
  'anon cannot execute the service-only staff-web mutation boundary'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.shop_staff_lifecycle_as_staff_web(uuid,uuid,uuid,text,uuid,text)',
    'EXECUTE'
  ),
  'service role can execute the exact-session staff lifecycle boundary'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.shop_staff_lifecycle_as_staff_web(uuid,uuid,uuid,text,uuid,text)',
    'EXECUTE'
  ),
  'authenticated cannot execute the service-only staff lifecycle boundary'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.shop_staff_lifecycle_as_staff_web(uuid,uuid,uuid,text,uuid,text)',
    'EXECUTE'
  ),
  'anon cannot execute the service-only staff lifecycle boundary'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.shop_staff_lifecycle_as_personal_account(uuid,text,uuid,text)',
    'EXECUTE'
  ),
  'authenticated can execute the JWT-only personal lifecycle boundary'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.shop_staff_lifecycle_as_personal_account(uuid,text,uuid,text)',
    'EXECUTE'
  ),
  'service role cannot impersonate a personal lifecycle actor'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.shop_staff_lifecycle_as_personal_account(uuid,text,uuid,text)',
    'EXECUTE'
  ),
  'anon cannot execute the personal lifecycle boundary'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.shop_staff_replace_role_permissions_as_web(uuid,uuid,uuid,text,text[])',
    'EXECUTE'
  ),
  'service role can execute permission replacement with an exact staff session'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.shop_staff_replace_role_permissions_as_web(uuid,uuid,uuid,text,text[])',
    'EXECUTE'
  ),
  'authenticated can execute permission replacement from its JWT identity'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.shop_staff_replace_role_permissions_as_web(uuid,uuid,uuid,text,text[])',
    'EXECUTE'
  ),
  'anon cannot execute permission replacement'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.pos_sales_sync_apply_v1(uuid,text,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb)',
    'EXECUTE'
  ),
  'service role can execute the hardened POS sales wrapper'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.pos_sales_sync_apply_v1(uuid,text,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb)',
    'EXECUTE'
  ),
  'authenticated cannot execute the POS sales wrapper'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.pos_sales_sync_apply_v1(uuid,text,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb)',
    'EXECUTE'
  ),
  'anon cannot execute the POS sales wrapper'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.task140_pos_sales_sync_apply_v1_task137(uuid,text,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb)',
    'EXECUTE'
  )
    and not has_function_privilege(
      'authenticated',
      'public.task140_pos_sales_sync_apply_v1_task137(uuid,text,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.task140_pos_sales_sync_apply_v1_task137(uuid,text,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb)',
      'EXECUTE'
    ),
  'the renamed TASK-137 financial implementation is not executable by API roles'
);
select ok(
  not has_function_privilege(
    'service_role',
    'app_private.task068i_platform_recovery_audit(uuid,text,uuid,text,text,text,text,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'service role cannot bypass the private platform recovery audit boundary'
);
select is(
  app_private.staff_web_login_attempt_key_hash(
    ' t140shop ',
    ' create6 '
  ),
  'sha256:084ed5a2c32b7484d53f1b953eaef47079a7e86a63581b1b31706fb60955e7e1',
  'private helper matches the runtime SHA-256 key for normalized SHOP:STAFF'
);
select is(
  (
    select count(*)::integer
    from pg_proc function_row
    join pg_namespace function_schema
      on function_schema.oid = function_row.pronamespace
    where function_schema.nspname = 'public'
      and function_row.proname in (
        'shop_staff_create',
        'shop_staff_reset_credential',
        'shop_staff_clear_lockout',
        'shop_staff_mutate_as_staff_web',
        'shop_staff_lifecycle_as_staff_web',
        'shop_staff_lifecycle_as_personal_account',
        'shop_staff_replace_role_permissions_as_web',
        'staff_record_login_failure',
        'platform_recover_initial_manager_1001'
      )
      and function_row.prosecdef
      and exists (
        select 1
        from unnest(coalesce(function_row.proconfig, '{}'::text[])) as config(value)
        where config.value = 'search_path=public, app_private, pg_temp'
      )
  ),
  9,
  'all public TASK-140 boundaries remain SECURITY DEFINER with a controlled search_path'
);
select is(
  (
    select count(*)::integer
    from pg_proc function_row
    join pg_namespace function_schema
      on function_schema.oid = function_row.pronamespace
    where function_schema.nspname = 'app_private'
      and function_row.proname in (
        'clear_staff_web_login_attempt_lockout',
        'task068i_platform_recovery_audit',
        'task051_insert_initial_manager'
      )
      and function_row.prosecdef
      and exists (
        select 1
        from unnest(coalesce(function_row.proconfig, '{}'::text[])) as config(value)
        where config.value = 'search_path=public, app_private, pg_temp'
      )
  ),
  3,
  'private mutating helpers remain SECURITY DEFINER with a controlled search_path'
);
select ok(
  exists (
    select 1
    from pg_proc function_row
    join pg_namespace function_schema
      on function_schema.oid = function_row.pronamespace
    where function_schema.nspname = 'app_private'
      and function_row.proname = 'staff_web_login_attempt_key_hash'
      and not function_row.prosecdef
      and exists (
        select 1
        from unnest(coalesce(function_row.proconfig, '{}'::text[])) as config(value)
        where config.value = 'search_path=pg_catalog, extensions'
      )
  ),
  'private deterministic key helper is SECURITY INVOKER with a controlled search_path'
);
select ok(
  exists (
    select 1
    from pg_proc function_row
    join pg_namespace function_schema
      on function_schema.oid = function_row.pronamespace
    where function_schema.nspname = 'app_private'
      and function_row.proname = 'mac_admin_w7pos_009_pos_admin_permissions'
      and not function_row.prosecdef
      and exists (
        select 1
        from unnest(coalesce(function_row.proconfig, '{}'::text[])) as config(value)
        where config.value = 'search_path=pg_catalog'
      )
  ),
  'POS Admin permission helper is SECURITY INVOKER with a controlled search_path'
);
select is(
  (
    select array_agg(permission_key order by permission_key)
    from app_private.mac_admin_w7pos_009_pos_admin_permissions()
  ),
  array[
    'audit.read',
    'audit.view',
    'catalog.export',
    'catalog.import',
    'catalog.manage',
    'catalog.price_edit',
    'catalog.read',
    'catalog.view',
    'catalog.write',
    'db.maintenance',
    'devices.read',
    'devices.write',
    'pos.dashboard.read',
    'pos.discount',
    'pos.pay',
    'pos.refund',
    'pos.sell',
    'pos.void',
    'printer.manage',
    'register.manage',
    'register.view',
    'settings.manage',
    'settings.read',
    'settings.view',
    'settings.write',
    'shop_admin.full_access',
    'staff.read',
    'staff.write',
    'storefront.audit.view',
    'storefront.bulk_publish',
    'storefront.edit',
    'storefront.images.manage',
    'storefront.promotions.manage',
    'storefront.publish',
    'storefront.settings.manage',
    'storefront.view',
    'sync.manage',
    'sync.read',
    'sync.write',
    'users.manage',
    'users.view'
  ]::text[],
  'POS Admin helper returns the exact canonical set of 41 permissions'
);
select ok(
  position(
    'when others' in lower(
      pg_get_functiondef(
        'app_private.task068i_platform_recovery_audit(uuid,text,uuid,text,text,text,text,text,text,text,jsonb)'::regprocedure
      )
    )
  ) = 0,
  'platform recovery audit no longer swallows persistence failures'
);
select ok(
  position(
    'for update' in lower(
      pg_get_functiondef(
        'public.platform_recover_initial_manager_1001(uuid,text,text,text,text)'::regprocedure
      )
    )
  ) > 0,
  'platform recovery locks existing staff 1001 before incrementing credential version'
);

select is(
  (
    select array_agg(privilege.privilege_type order by privilege.privilege_type)
    from pg_class as relation
    join pg_namespace as relation_schema
      on relation_schema.oid = relation.relnamespace
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) as privilege
    join pg_roles as grantee on grantee.oid = privilege.grantee
    where relation_schema.nspname = 'public'
      and relation.relname = 'audit_logs'
      and grantee.rolname = 'service_role'
  ),
  array['INSERT', 'SELECT']::text[],
  'service role has exactly SELECT and INSERT on audit logs'
);
select is(
  (
    select array_agg(privilege.privilege_type order by privilege.privilege_type)
    from pg_class as relation
    join pg_namespace as relation_schema
      on relation_schema.oid = relation.relnamespace
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) as privilege
    join pg_roles as grantee on grantee.oid = privilege.grantee
    where relation_schema.nspname = 'public'
      and relation.relname = 'staff_accounts'
      and grantee.rolname = 'service_role'
  ),
  array['SELECT', 'UPDATE']::text[],
  'service role has exactly SELECT and UPDATE on staff accounts'
);
select is(
  (
    select array_agg(privilege.privilege_type order by privilege.privilege_type)
    from pg_class as relation
    join pg_namespace as relation_schema
      on relation_schema.oid = relation.relnamespace
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) as privilege
    join pg_roles as grantee on grantee.oid = privilege.grantee
    where relation_schema.nspname = 'public'
      and relation.relname = 'staff_accounts_safe'
      and grantee.rolname = 'service_role'
  ),
  array['SELECT']::text[],
  'service role has exactly SELECT on the safe staff view'
);
select is(
  (
    select array_agg(privilege.privilege_type order by privilege.privilege_type)
    from pg_class as relation
    join pg_namespace as relation_schema
      on relation_schema.oid = relation.relnamespace
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) as privilege
    join pg_roles as grantee on grantee.oid = privilege.grantee
    where relation_schema.nspname = 'public'
      and relation.relname = 'staff_role_permissions'
      and grantee.rolname = 'service_role'
  ),
  array['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[],
  'service role has exactly SELECT, INSERT, UPDATE and DELETE on staff role permissions'
);
select is(
  (
    select array_agg(privilege.privilege_type order by privilege.privilege_type)
    from pg_class as relation
    join pg_namespace as relation_schema
      on relation_schema.oid = relation.relnamespace
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) as privilege
    join pg_roles as grantee on grantee.oid = privilege.grantee
    where relation_schema.nspname = 'public'
      and relation.relname = 'staff_web_login_attempts'
      and grantee.rolname = 'service_role'
  ),
  array['INSERT', 'SELECT', 'UPDATE']::text[],
  'service role has exactly SELECT, INSERT and UPDATE on staff web attempts'
);
select is(
  (
    select array_agg(privilege.privilege_type order by privilege.privilege_type)
    from pg_class as relation
    join pg_namespace as relation_schema
      on relation_schema.oid = relation.relnamespace
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) as privilege
    join pg_roles as grantee on grantee.oid = privilege.grantee
    where relation_schema.nspname = 'public'
      and relation.relname = 'staff_web_sessions'
      and grantee.rolname = 'service_role'
  ),
  array['INSERT', 'SELECT', 'UPDATE']::text[],
  'service role has exactly SELECT, INSERT and UPDATE on staff web sessions'
);
select is(
  (
    select array_agg(privilege.privilege_type order by privilege.privilege_type)
    from pg_class as relation
    join pg_namespace as relation_schema
      on relation_schema.oid = relation.relnamespace
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) as privilege
    join pg_roles as grantee on grantee.oid = privilege.grantee
    where relation_schema.nspname = 'public'
      and relation.relname = 'shops'
      and grantee.rolname = 'service_role'
  ),
  array['SELECT']::text[],
  'service role has exactly SELECT on shops'
);
select is(
  (
    select array_agg(privilege.privilege_type order by privilege.privilege_type)
    from pg_class as relation
    join pg_namespace as relation_schema
      on relation_schema.oid = relation.relnamespace
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) as privilege
    join pg_roles as grantee on grantee.oid = privilege.grantee
    where relation_schema.nspname = 'public'
      and relation.relname = 'shop_devices'
      and grantee.rolname = 'service_role'
  ),
  array['INSERT', 'SELECT', 'UPDATE']::text[],
  'service role has exactly SELECT, INSERT and UPDATE on shop devices'
);
select is(
  (
    select array_agg(privilege.privilege_type order by privilege.privilege_type)
    from pg_class as relation
    join pg_namespace as relation_schema
      on relation_schema.oid = relation.relnamespace
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) as privilege
    join pg_roles as grantee on grantee.oid = privilege.grantee
    where relation_schema.nspname = 'public'
      and relation.relname = 'pos_device_credentials'
      and grantee.rolname = 'service_role'
  ),
  array['INSERT', 'SELECT', 'UPDATE']::text[],
  'service role has exactly SELECT, INSERT and UPDATE on POS device credentials'
);
select is(
  (
    select array_agg(privilege.privilege_type order by privilege.privilege_type)
    from pg_class as relation
    join pg_namespace as relation_schema
      on relation_schema.oid = relation.relnamespace
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) as privilege
    join pg_roles as grantee on grantee.oid = privilege.grantee
    where relation_schema.nspname = 'public'
      and relation.relname = 'pos_sessions'
      and grantee.rolname = 'service_role'
  ),
  array['INSERT', 'SELECT', 'UPDATE']::text[],
  'service role has exactly SELECT, INSERT and UPDATE on POS sessions'
);
select ok(
  not exists (
    select 1
    from (
      values
        ('audit_logs'),
        ('staff_accounts'),
        ('staff_accounts_safe'),
        ('staff_web_login_attempts'),
        ('staff_web_sessions'),
        ('shops'),
        ('shop_devices'),
        ('pos_device_credentials'),
        ('pos_sessions')
    ) as protected_table(table_name)
    where has_table_privilege(
      'service_role',
      format('public.%I', protected_table.table_name),
      'DELETE'
    )
  )
    and not exists (
      select 1
      from (
        values
          ('audit_logs'),
          ('staff_accounts'),
          ('staff_accounts_safe'),
          ('staff_role_permissions'),
          ('staff_web_login_attempts'),
          ('staff_web_sessions'),
          ('shops'),
          ('shop_devices'),
          ('pos_device_credentials'),
          ('pos_sessions')
      ) as protected_table(table_name)
      where has_table_privilege(
        'service_role',
        format('public.%I', protected_table.table_name),
        'TRUNCATE'
      )
    ),
  'service role has DELETE only on role permissions and no TRUNCATE on reconciled tables'
);
select ok(
  not exists (
    select 1
    from (
      values
        ('audit_logs'),
        ('staff_accounts'),
        ('staff_accounts_safe'),
        ('staff_role_permissions'),
        ('staff_web_login_attempts'),
        ('staff_web_sessions'),
        ('shops'),
        ('shop_devices'),
        ('pos_device_credentials'),
        ('pos_sessions')
    ) as protected_table(table_name)
    cross join (values ('anon'), ('authenticated')) as client_role(role_name)
    cross join (
      values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')
    ) as mutating_privilege(privilege_name)
    where has_table_privilege(
      client_role.role_name,
      format('public.%I', protected_table.table_name),
      mutating_privilege.privilege_name
    )
  ),
  'client roles receive no mutation privilege from the service ACL reconciliation'
);
select ok(
  has_table_privilege('authenticated', 'public.audit_logs', 'SELECT')
    and has_table_privilege('authenticated', 'public.shops', 'SELECT')
    and has_table_privilege('authenticated', 'public.shop_devices', 'SELECT'),
  'existing authenticated read grants remain unchanged'
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
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000140',
    'authenticated',
    'authenticated',
    'task140-owner@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000240',
    'authenticated',
    'authenticated',
    'task140-platform@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000340',
    'authenticated',
    'authenticated',
    'task140-manager@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.profiles (profile_id, display_name, profile_status)
values
  (
    '00000000-0000-4000-8000-000000000140',
    'TASK-140 Owner',
    'active'
  ),
  (
    '00000000-0000-4000-8000-000000000240',
    'TASK-140 Platform',
    'active'
  ),
  (
    '00000000-0000-4000-8000-000000000340',
    'TASK-140 Shop Manager',
    'active'
  )
on conflict (profile_id) do update
set display_name = excluded.display_name,
    profile_status = excluded.profile_status;

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values
  (
    '10000000-0000-4000-8000-000000000140',
    'T140SHOP',
    'TASK-140 Shop',
    'active'
  ),
  (
    '10000000-0000-4000-8000-000000000240',
    'T140SHOP2',
    'TASK-140 Initial Manager Shop',
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
    '00000000-0000-4000-8000-000000000140',
    '10000000-0000-4000-8000-000000000140',
    'shop_owner',
    'active',
    null
  ),
  (
    '00000000-0000-4000-8000-000000000340',
    '10000000-0000-4000-8000-000000000140',
    'shop_manager',
    'active',
    null
  );

insert into public.platform_admins (profile_id, status)
values ('00000000-0000-4000-8000-000000000240', 'active');

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000140","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000140',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

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
  failed_attempts,
  locked_until,
  credential_version,
  credential_status,
  session_invalidated_at,
  web_access_revoked_at,
  created_by_profile_id,
  updated_by_profile_id,
  updated_at
)
values
  (
    '20000000-0000-4000-8000-000000000140',
    '10000000-0000-4000-8000-000000000140',
    'SUSP6',
    'TASK-140 Suspended Staff',
    'manager',
    'suspended',
    'pin',
    '$scrypt-v1$task140-old-reset-fixture',
    now(),
    null,
    true,
    5,
    now() + interval '15 minutes',
    4,
    'locked',
    null,
    null,
    '00000000-0000-4000-8000-000000000140',
    '00000000-0000-4000-8000-000000000140',
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000141',
    '10000000-0000-4000-8000-000000000140',
    'CLEAR6',
    'TASK-140 Locked Staff',
    'manager',
    'active',
    'pin',
    '$scrypt-v1$task140-clear-fixture',
    now(),
    null,
    true,
    5,
    now() + interval '15 minutes',
    2,
    'locked',
    null,
    null,
    '00000000-0000-4000-8000-000000000140',
    '00000000-0000-4000-8000-000000000140',
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000142',
    '10000000-0000-4000-8000-000000000140',
    '1001',
    'TASK-140 Initial Manager',
    'manager',
    'suspended',
    'password',
    '$scrypt-v1$task140-old-recovery-fixture',
    now(),
    null,
    true,
    5,
    now() + interval '15 minutes',
    7,
    'locked',
    null,
    now(),
    '00000000-0000-4000-8000-000000000140',
    '00000000-0000-4000-8000-000000000140',
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000143',
    '10000000-0000-4000-8000-000000000140',
    'PEND6',
    'TASK-140 Pending Staff',
    'manager',
    'pending_credential',
    'pin',
    '$scrypt-v1$task140-pending-fixture',
    now(),
    null,
    true,
    0,
    null,
    1,
    'rotation_required',
    null,
    null,
    '00000000-0000-4000-8000-000000000140',
    '00000000-0000-4000-8000-000000000140',
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000150',
    '10000000-0000-4000-8000-000000000140',
    'ACTOR6',
    'TASK-140 Staff Web Actor',
    'manager',
    'active',
    'pin',
    '$scrypt-v1$task140-p1-actor-fixture',
    now(),
    null,
    false,
    0,
    null,
    1,
    'active',
    null,
    null,
    '00000000-0000-4000-8000-000000000140',
    '00000000-0000-4000-8000-000000000140',
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000151',
    '10000000-0000-4000-8000-000000000140',
    'DENY6',
    'TASK-140 Ineligible Staff Web Actor',
    'manager',
    'active',
    'pin',
    '$scrypt-v1$task140-p1-ineligible-actor-fixture',
    now(),
    null,
    true,
    5,
    now() + interval '15 minutes',
    1,
    'rotation_required',
    null,
    now(),
    '00000000-0000-4000-8000-000000000140',
    '00000000-0000-4000-8000-000000000140',
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000152',
    '10000000-0000-4000-8000-000000000140',
    'P1SUSP',
    'TASK-140 P1 Suspended Target',
    'manager',
    'suspended',
    'pin',
    '$scrypt-v1$task140-p1-old-reset-fixture',
    now(),
    null,
    true,
    5,
    now() + interval '15 minutes',
    3,
    'locked',
    null,
    null,
    '00000000-0000-4000-8000-000000000140',
    '00000000-0000-4000-8000-000000000140',
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000153',
    '10000000-0000-4000-8000-000000000140',
    'P1CLEAR',
    'TASK-140 P1 Clear Target',
    'manager',
    'active',
    'pin',
    '$scrypt-v1$task140-p1-clear-fixture',
    now(),
    null,
    true,
    5,
    now() + interval '15 minutes',
    2,
    'locked',
    null,
    null,
    '00000000-0000-4000-8000-000000000140',
    '00000000-0000-4000-8000-000000000140',
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000154',
    '10000000-0000-4000-8000-000000000140',
    'P1ROLL',
    'TASK-140 P1 Rollback Target',
    'manager',
    'active',
    'pin',
    '$scrypt-v1$task140-p1-rollback-fixture',
    now(),
    null,
    true,
    5,
    now() + interval '15 minutes',
    2,
    'locked',
    null,
    null,
    '00000000-0000-4000-8000-000000000140',
    '00000000-0000-4000-8000-000000000140',
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000155',
    '10000000-0000-4000-8000-000000000140',
    'POSACT6',
    'TASK-140 POS Admin Staff Web Actor',
    'pos_admin',
    'active',
    'pin',
    '$scrypt-v1$task140-pos-admin-actor-fixture',
    now(),
    null,
    false,
    0,
    null,
    1,
    'active',
    null,
    null,
    '00000000-0000-4000-8000-000000000140',
    '00000000-0000-4000-8000-000000000140',
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000156',
    '10000000-0000-4000-8000-000000000140',
    'POSTGT6',
    'TASK-140 POS Admin Guard Target',
    'pos_admin',
    'active',
    'pin',
    '$scrypt-v1$task140-pos-admin-target-fixture',
    now(),
    null,
    false,
    0,
    null,
    1,
    'active',
    null,
    null,
    '00000000-0000-4000-8000-000000000140',
    '00000000-0000-4000-8000-000000000140',
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000240',
    '10000000-0000-4000-8000-000000000240',
    'CROSS6',
    'TASK-140 Cross-shop Staff',
    'manager',
    'active',
    'pin',
    '$scrypt-v1$task140-cross-shop-fixture',
    now(),
    null,
    false,
    0,
    null,
    1,
    'active',
    null,
    null,
    '00000000-0000-4000-8000-000000000240',
    '00000000-0000-4000-8000-000000000240',
    now()
  );

select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

insert into public.staff_role_permissions (
  shop_id,
  role_key,
  permission_key,
  enabled,
  updated_by_profile_id,
  updated_at
)
values (
  '10000000-0000-4000-8000-000000000140',
  'manager',
  'staff.write',
  true,
  '00000000-0000-4000-8000-000000000140',
  now()
);

insert into public.staff_role_permissions (
  shop_id,
  role_key,
  permission_key,
  enabled,
  updated_by_profile_id,
  updated_at
)
select
  '10000000-0000-4000-8000-000000000140',
  'pos_admin',
  permissions.permission_key,
  true,
  '00000000-0000-4000-8000-000000000140',
  now()
from app_private.mac_admin_w7pos_009_pos_admin_permissions() as permissions
on conflict (shop_id, role_key, permission_key) do nothing;

select throws_ok(
  $$
    insert into public.staff_role_permissions (
      shop_id, role_key, permission_key, enabled
    ) values (
      '10000000-0000-4000-8000-000000000140',
      'manager',
      'settings.write',
      true
    )
  $$,
  '23514',
  'owner-only permissions can only be assigned to POS Admin',
  'structural trigger rejects an enabled owner-only permission on a shared role'
);
select throws_ok(
  $$
    insert into public.staff_role_permissions (
      shop_id, role_key, permission_key, enabled
    ) values (
      '10000000-0000-4000-8000-000000000140',
      'viewer',
      'devices.write',
      false
    )
  $$,
  '23514',
  'owner-only permissions can only be assigned to POS Admin',
  'structural trigger rejects even disabled owner-only rows on shared roles'
);
select throws_ok(
  $$
    update public.staff_role_permissions
    set enabled = false
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and role_key = 'pos_admin'
      and permission_key = 'shop_admin.full_access'
  $$,
  '23514',
  'canonical POS Admin permissions cannot be reassigned or disabled',
  'structural trigger rejects disabling a canonical POS Admin permission'
);
select ok(
  strpos(
    pg_get_functiondef(
      'app_private.task140_enforce_staff_role_permission_boundary()'::regprocedure
    ),
    'session_user not in (''postgres'', ''supabase_admin'')'
  ) > 0,
  'canonical permission trigger keeps the exact trusted DB-owner maintenance pair'
);
insert into public.staff_role_permissions (
  shop_id,
  role_key,
  permission_key,
  enabled,
  updated_by_profile_id,
  updated_at
)
values (
  '10000000-0000-4000-8000-000000000140',
  'pos_admin',
  'shop_admin.full_access',
  true,
  null,
  now()
)
on conflict (shop_id, role_key, permission_key)
do update set enabled = true, updated_at = excluded.updated_at;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select case
  when session_user in ('postgres', 'supabase_admin') then lives_ok(
    $$
      delete from public.staff_role_permissions
      where shop_id = '10000000-0000-4000-8000-000000000140'
        and role_key = 'pos_admin'
        and permission_key = 'shop_admin.full_access'
    $$,
    'trusted DB-owner maintenance session can delete a canonical permission'
  )
  else throws_ok(
    $$
      delete from public.staff_role_permissions
      where shop_id = '10000000-0000-4000-8000-000000000140'
        and role_key = 'pos_admin'
        and permission_key = 'shop_admin.full_access'
    $$,
    '23514',
    'canonical POS Admin permissions cannot be removed',
    'service-role API session cannot directly delete a canonical POS Admin permission'
  )
end;
reset role;
set local role postgres;
insert into public.staff_role_permissions (
  shop_id,
  role_key,
  permission_key,
  enabled,
  updated_by_profile_id,
  updated_at
)
values (
  '10000000-0000-4000-8000-000000000140',
  'pos_admin',
  'shop_admin.full_access',
  true,
  null,
  now()
)
on conflict (shop_id, role_key, permission_key)
do update set enabled = true, updated_at = excluded.updated_at;
select ok(
  exists (
    select 1
    from public.staff_role_permissions
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and role_key = 'pos_admin'
      and permission_key = 'shop_admin.full_access'
      and enabled
  ),
  'canonical permission remains present after API denial or trusted maintenance restore'
);

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '10000000-0000-4000-8000-000000000199',
  'TASK140CASCADE',
  'TASK-140 seed and cascade probe',
  'active'
);
select is(
  (
    select count(*)::integer
    from public.staff_role_permissions
    where shop_id = '10000000-0000-4000-8000-000000000199'
      and role_key = 'pos_admin'
      and enabled
  ),
  41,
  'new-shop trigger seeds the complete 41-permission POS Admin matrix'
);
select lives_ok(
  $$
    delete from public.shops
    where shop_id = '10000000-0000-4000-8000-000000000199'
  $$,
  'trusted shop cleanup can cascade through the protected permission matrix'
);
select ok(
  not exists (
    select 1
    from public.staff_role_permissions
    where shop_id = '10000000-0000-4000-8000-000000000199'
  ),
  'shop cleanup cascade leaves no orphan POS Admin permission rows'
);
select ok(
  not exists (
    select 1
    from public.staff_role_permissions as shared_permission
    join app_private.task140_owner_only_staff_web_permissions() as owner_only
      on owner_only.permission_key = shared_permission.permission_key
    where shared_permission.role_key <> 'pos_admin'
  ),
  'the repaired final state contains no owner-only permission on a shared role'
);

-- Recreate a pre-hardening, non-canonical POS Admin row so the historical
-- recovery assertions below can still prove that trusted repair removes it.
alter table public.staff_role_permissions
  disable trigger task140_enforce_staff_role_permission_boundary;

insert into public.staff_role_permissions (
  shop_id,
  role_key,
  permission_key,
  enabled,
  updated_by_profile_id,
  updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000140',
    'pos_admin',
    'pos.discount_over_limit',
    true,
    '00000000-0000-4000-8000-000000000140',
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000240',
    'pos_admin',
    'pos.discount_over_limit',
    true,
    '00000000-0000-4000-8000-000000000240',
    now()
	  );

alter table public.staff_role_permissions
  enable trigger task140_enforce_staff_role_permission_boundary;

insert into public.staff_web_sessions (
  staff_web_session_id,
  shop_id,
  staff_id,
  session_token_hash,
  staff_credential_version,
  status,
  issued_at,
  expires_at,
  metadata_redacted,
  updated_at
)
values
  (
    '30000000-0000-4000-8000-000000000150',
    '10000000-0000-4000-8000-000000000140',
    '20000000-0000-4000-8000-000000000150',
    'sha256:' || encode(extensions.digest('TASK140:P1:ACTOR:SESSION', 'sha256'), 'hex'),
    1,
    'active',
    now() - interval '5 minutes',
    now() + interval '1 hour',
    '{"source":"TASK-140"}'::jsonb,
    now()
  ),
  (
    '30000000-0000-4000-8000-000000000152',
    '10000000-0000-4000-8000-000000000140',
    '20000000-0000-4000-8000-000000000152',
    'sha256:' || encode(extensions.digest('TASK140:P1:TARGET:SESSION', 'sha256'), 'hex'),
    3,
    'active',
    now() - interval '5 minutes',
    now() + interval '1 hour',
    '{"source":"TASK-140"}'::jsonb,
    now()
  ),
  (
    '30000000-0000-4000-8000-000000000155',
    '10000000-0000-4000-8000-000000000140',
    '20000000-0000-4000-8000-000000000155',
    'sha256:' || encode(extensions.digest('TASK140:POSADMIN:ACTOR:SESSION', 'sha256'), 'hex'),
    1,
    'active',
    now() - interval '5 minutes',
    now() + interval '1 hour',
    '{"source":"TASK-140-POS-ADMIN"}'::jsonb,
    now()
	  );

insert into public.staff_web_sessions (
  staff_web_session_id,
  shop_id,
  staff_id,
  session_token_hash,
  staff_credential_version,
  status,
  issued_at,
  expires_at,
  revoked_at,
  revoked_reason,
  metadata_redacted,
  updated_at
)
values (
  '30000000-0000-4000-8000-000000000151',
  '10000000-0000-4000-8000-000000000140',
  '20000000-0000-4000-8000-000000000150',
  'sha256:' || encode(extensions.digest('TASK140:P1:ACTOR:REVOKED', 'sha256'), 'hex'),
  1,
  'revoked',
  now() - interval '10 minutes',
  now() + interval '1 hour',
  now() - interval '1 minute',
  'TASK-140 exact-session negative fixture',
  '{"source":"TASK-140-REVOKED"}'::jsonb,
  now()
);

insert into public.staff_web_login_attempts (
  attempt_key_hash,
  failed_attempts,
  locked_until,
  last_failed_at,
  metadata_redacted
)
values
  (
    'sha256:' || encode(extensions.digest('T140SHOP:CREATE6', 'sha256'), 'hex'),
    5,
    now() + interval '15 minutes',
    now(),
    '{"source":"TASK-140"}'::jsonb
  ),
  (
    'sha256:' || encode(extensions.digest('T140SHOP:SUSP6', 'sha256'), 'hex'),
    5,
    now() + interval '15 minutes',
    now(),
    '{"source":"TASK-140"}'::jsonb
  ),
  (
    'sha256:' || encode(extensions.digest('T140SHOP:CLEAR6', 'sha256'), 'hex'),
    5,
    now() + interval '15 minutes',
    now(),
    '{"source":"TASK-140"}'::jsonb
  ),
  (
    'sha256:' || encode(extensions.digest('T140SHOP:1001', 'sha256'), 'hex'),
    5,
    now() + interval '15 minutes',
    now(),
    '{"source":"TASK-140"}'::jsonb
  ),
  (
    'sha256:' || encode(extensions.digest('T140SHOP2:1001', 'sha256'), 'hex'),
    5,
    now() + interval '15 minutes',
    now(),
    '{"source":"TASK-140"}'::jsonb
  ),
  (
    'sha256:' || encode(extensions.digest('T140SHOP:WEBNEW', 'sha256'), 'hex'),
    5,
    now() + interval '15 minutes',
    now(),
    '{"source":"TASK-140-P1"}'::jsonb
  ),
  (
    'sha256:' || encode(extensions.digest('T140SHOP:P1SUSP', 'sha256'), 'hex'),
    5,
    now() + interval '15 minutes',
    now(),
    '{"source":"TASK-140-P1"}'::jsonb
  ),
  (
    'sha256:' || encode(extensions.digest('T140SHOP:P1CLEAR', 'sha256'), 'hex'),
    5,
    now() + interval '15 minutes',
    now(),
    '{"source":"TASK-140-P1"}'::jsonb
  ),
  (
    'sha256:' || encode(extensions.digest('T140SHOP:P1ROLL', 'sha256'), 'hex'),
    5,
    now() + interval '15 minutes',
    now(),
    '{"source":"TASK-140-P1"}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000140","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000140',
  true
);

select is(
  public.shop_staff_create(
    '10000000-0000-4000-8000-000000000140',
    'CREATE6',
    'TASK-140 Created Staff',
    'manager',
    'pin',
    '$scrypt-v1$task140-create-fixture',
    null
  )->>'code',
  'success',
  'shop owner can create a staff credential through the authorized RPC'
);
select is(
  public.shop_staff_create(
    '10000000-0000-4000-8000-000000000140',
    'POSOWN6',
    'TASK-140 Owner POS Admin',
    'pos_admin',
    'pin',
    '$scrypt-v1$task140-owner-pos-admin-create',
    null
  )->>'code',
  'success',
  'shop owner can create a POS Admin through the authorized RPC'
);
select is(
  public.shop_staff_reset_credential(
    '10000000-0000-4000-8000-000000000140',
    (
      select staff_id
      from public.staff_accounts
      where shop_id = '10000000-0000-4000-8000-000000000140'
        and staff_code = 'POSOWN6'
    ),
    'pin',
    '$scrypt-v1$task140-owner-pos-admin-reset',
    'TASK-140 owner POS Admin reset verification',
    null
  )->>'code',
  'success',
  'shop owner can reset a POS Admin credential'
);
select is(
  public.shop_staff_reset_credential(
    '10000000-0000-4000-8000-000000000140',
    '20000000-0000-4000-8000-000000000140',
    'pin',
    '$scrypt-v1$task140-new-reset-fixture',
    'TASK-140 synthetic reset verification',
    null
  )->>'code',
  'success',
  'shop owner can reset a staff credential through the authorized RPC'
);
select is(
  public.shop_staff_clear_lockout(
    '10000000-0000-4000-8000-000000000140',
    '20000000-0000-4000-8000-000000000141',
    'TASK-140 synthetic lockout clear verification'
  )->>'code',
  'success',
  'shop owner can clear staff lockout through the authorized RPC'
);
select is(
  public.shop_staff_reset_credential(
    '10000000-0000-4000-8000-000000000140',
    '20000000-0000-4000-8000-000000000143',
    'pin',
    '$scrypt-v1$task140-pending-reset-fixture',
    'TASK-140 synthetic pending staff reset verification',
    null
  )->>'code',
  'success',
  'shop owner can reset a pending staff credential through the authorized RPC'
);

reset role;
set local role postgres;

select is(
  (
    select status || ':' || credential_kind || ':' || credential_status || ':'
      || must_change_credential::text || ':' || credential_version::text
    from public.staff_accounts
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and staff_code = 'CREATE6'
  ),
  'active:pin:active:false:1',
  'created numeric credential is active, typed as PIN and immediately usable'
);
select is(
  (
    select failed_attempts
    from public.staff_accounts
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and staff_code = 'CREATE6'
  ),
  0,
  'created staff starts with zero staff lockout attempts'
);
select ok(
  (
    select locked_until
    from public.staff_accounts
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and staff_code = 'CREATE6'
  ) is null,
  'created staff starts without a staff lockout deadline'
);
select is(
  (
    select failed_attempts
    from public.staff_web_login_attempts
    where attempt_key_hash = 'sha256:084ed5a2c32b7484d53f1b953eaef47079a7e86a63581b1b31706fb60955e7e1'
  ),
  0,
  'staff create clears a pre-existing web login attempt counter for the code'
);
select ok(
  (
    select locked_until
    from public.staff_web_login_attempts
    where attempt_key_hash = 'sha256:084ed5a2c32b7484d53f1b953eaef47079a7e86a63581b1b31706fb60955e7e1'
  ) is null,
  'staff create clears a pre-existing web login lockout deadline for the code'
);
select ok(
  exists (
    select 1
    from public.audit_logs
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and event_key = 'shop.staff.create.success'
      and result = 'success'
  ),
  'staff create preserves redacted success audit'
);
select is(
  (
    select role_key || ':' || status || ':' || credential_kind || ':'
      || credential_status || ':' || must_change_credential::text || ':'
      || credential_version::text
    from public.staff_accounts
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and staff_code = 'POSOWN6'
  ),
  'pos_admin:active:pin:active:false:2',
  'owner-created POS Admin remains immediately usable after credential reset'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000340","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000340',
  true
);

select is(
  public.shop_staff_create(
    '10000000-0000-4000-8000-000000000140',
    'POSDENY6',
    'TASK-140 Denied POS Admin',
    'pos_admin',
    'pin',
    '$scrypt-v1$task140-shop-manager-pos-admin-create-denied',
    null
  )->>'code',
  'unauthorized',
  'shop manager cannot create a POS Admin'
);
select is(
  public.shop_staff_reset_credential(
    '10000000-0000-4000-8000-000000000140',
    '20000000-0000-4000-8000-000000000156',
    'pin',
    '$scrypt-v1$task140-shop-manager-pos-admin-reset-denied',
    'TASK-140 shop manager POS Admin reset denial',
    null
  )->>'code',
  'unauthorized',
  'shop manager cannot reset a POS Admin credential'
);

reset role;
set local role postgres;

select ok(
  not exists (
    select 1
    from public.staff_accounts
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and staff_code = 'POSDENY6'
  ) and (
    select credential_hash = '$scrypt-v1$task140-pos-admin-target-fixture'
      and credential_version = 1
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000156'
  ),
  'shop-manager POS Admin denials leave create and reset targets unchanged'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000240","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000240',
  true
);

select is(
  public.shop_staff_create(
    '10000000-0000-4000-8000-000000000140',
    'POSPLAT6',
    'TASK-140 Platform POS Admin',
    'pos_admin',
    'pin',
    '$scrypt-v1$task140-platform-pos-admin-create',
    null
  )->>'code',
  'success',
  'active platform admin can create a POS Admin without shop membership'
);
select is(
  public.shop_staff_reset_credential(
    '10000000-0000-4000-8000-000000000140',
    '20000000-0000-4000-8000-000000000156',
    'pin',
    '$scrypt-v1$task140-platform-pos-admin-reset',
    'TASK-140 platform POS Admin reset verification',
    null
  )->>'code',
  'success',
  'active platform admin can reset a POS Admin without shop membership'
);

reset role;
set local role postgres;

select is(
  (
    select role_key || ':' || credential_hash || ':' || credential_version::text
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000156'
  ),
  'pos_admin:$scrypt-v1$task140-platform-pos-admin-reset:2',
  'platform POS Admin reset persists the guarded replacement credential'
);
select is(
  (
    select role_key || ':' || credential_version::text
    from public.staff_accounts
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and staff_code = 'POSPLAT6'
  ),
  'pos_admin:1',
  'platform-created POS Admin persists the guarded role'
);

update public.staff_web_login_attempts
set failed_attempts = 5,
    locked_until = now() + interval '15 minutes'
where attempt_key_hash = 'sha256:084ed5a2c32b7484d53f1b953eaef47079a7e86a63581b1b31706fb60955e7e1';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000140","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000140',
  true
);

select is(
  public.shop_staff_create(
    '10000000-0000-4000-8000-000000000140',
    'CREATE6',
    'TASK-140 Duplicate Staff',
    'manager',
    'pin',
    '$scrypt-v1$task140-duplicate-fixture',
    null
  )->>'code',
  'duplicate_staff_code',
  'duplicate staff create remains fail-closed'
);

reset role;
set local role postgres;

select ok(
  (
    select failed_attempts = 5 and locked_until > now()
    from public.staff_web_login_attempts
    where attempt_key_hash = 'sha256:084ed5a2c32b7484d53f1b953eaef47079a7e86a63581b1b31706fb60955e7e1'
  ),
  'duplicate staff create does not clear a pre-existing web lockout'
);

select is(
  (
    select status || ':' || credential_kind || ':' || credential_status || ':'
      || must_change_credential::text || ':' || credential_version::text
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000140'
  ),
  'suspended:pin:active:false:5',
  'ordinary reset activates the credential without reactivating suspended staff'
);
select is(
  (
    select credential_hash
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000140'
  ),
  '$scrypt-v1$task140-new-reset-fixture',
  'ordinary reset stores only the replacement synthetic hash'
);
select is(
  (
    select failed_attempts
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000140'
  ),
  0,
  'ordinary reset clears staff failed attempts'
);
select ok(
  (
    select locked_until
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000140'
  ) is null,
  'ordinary reset clears staff lockout deadline'
);
select ok(
  (
    select session_invalidated_at is not null
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000140'
  ),
  'ordinary reset invalidates existing sessions'
);
select is(
  (
    select failed_attempts
    from public.staff_web_login_attempts
    where attempt_key_hash = 'sha256:c0408b20d31ee51ca449e507a792422f89615934bb8b8fe9379d5c1dcc2fe79b'
  ),
  0,
  'ordinary reset clears web failed attempts'
);
select ok(
  (
    select locked_until
    from public.staff_web_login_attempts
    where attempt_key_hash = 'sha256:c0408b20d31ee51ca449e507a792422f89615934bb8b8fe9379d5c1dcc2fe79b'
  ) is null,
  'ordinary reset clears web lockout deadline'
);
select ok(
  exists (
    select 1
    from public.audit_logs
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and event_key = 'shop.staff.credential.reset.success'
      and target_id = '20000000-0000-4000-8000-000000000140'
      and result = 'success'
  ),
  'ordinary reset preserves redacted success audit'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000240","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000240',
  true
);

select is(
  public.shop_staff_reset_credential(
    '10000000-0000-4000-8000-000000000140',
    '20000000-0000-4000-8000-000000000140',
    'pin',
    '$scrypt-v1$task140-platform-suspended-reset',
    'TASK-140 platform suspended reset verification',
    null
  )->>'code',
  'success',
  'active platform admin can reset a suspended staff credential'
);

reset role;
set local role postgres;

select is(
  (
    select status || ':' || credential_kind || ':' || credential_status || ':'
      || must_change_credential::text || ':' || credential_version::text || ':'
      || credential_hash
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000140'
  ),
  'suspended:pin:active:false:6:$scrypt-v1$task140-platform-suspended-reset',
  'platform reset rotates the credential and preserves suspended status'
);

select is(
  (
    select status || ':' || credential_kind || ':' || credential_status || ':'
      || must_change_credential::text || ':' || credential_version::text
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000143'
  ),
  'active:pin:active:false:2',
  'ordinary reset activates a pending staff account while preserving suspended accounts'
);
select ok(
  (
    select session_invalidated_at is not null
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000143'
  ),
  'pending staff reset invalidates any prior session state'
);

select is(
  (
    select status || ':' || credential_status || ':' || must_change_credential::text
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000141'
  ),
  'active:rotation_required:true',
  'clear-lockout preserves an independent forced-rotation requirement'
);
select is(
  (
    select failed_attempts
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000141'
  ),
  0,
  'clear-lockout clears staff failed attempts'
);
select ok(
  (
    select locked_until
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000141'
  ) is null,
  'clear-lockout clears staff lockout deadline'
);
select is(
  (
    select failed_attempts
    from public.staff_web_login_attempts
    where attempt_key_hash = 'sha256:c75c1a33eb12a2b3146d23a5c2f2b3615f4c63aa56f115eb3c89457a7d9b43f2'
  ),
  0,
  'clear-lockout clears web failed attempts'
);
select ok(
  (
    select locked_until
    from public.staff_web_login_attempts
    where attempt_key_hash = 'sha256:c75c1a33eb12a2b3146d23a5c2f2b3615f4c63aa56f115eb3c89457a7d9b43f2'
  ) is null,
  'clear-lockout clears web lockout deadline'
);
select ok(
  exists (
    select 1
    from public.audit_logs
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and event_key = 'shop.staff.lockout.clear.success'
      and target_id = '20000000-0000-4000-8000-000000000141'
      and result = 'success'
  ),
  'clear-lockout preserves redacted success audit'
);

update public.staff_accounts
set credential_status = 'locked',
    must_change_credential = true,
    failed_attempts = 5,
    locked_until = now() + interval '15 minutes'
where staff_id = '20000000-0000-4000-8000-000000000156';

insert into public.staff_web_login_attempts (
  attempt_key_hash,
  failed_attempts,
  locked_until,
  last_failed_at,
  metadata_redacted
)
values (
  app_private.staff_web_login_attempt_key_hash('T140SHOP', 'POSTGT6'),
  5,
  now() + interval '15 minutes',
  now(),
  '{"source":"TASK-140-POS-ADMIN-GUARD"}'::jsonb
)
on conflict (attempt_key_hash) do update
set failed_attempts = excluded.failed_attempts,
    locked_until = excluded.locked_until,
    last_failed_at = excluded.last_failed_at,
    metadata_redacted = excluded.metadata_redacted;

set local role service_role;
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  public.shop_staff_mutate_as_staff_web(
    '20000000-0000-4000-8000-000000000150',
    '30000000-0000-4000-8000-000000000150',
    '10000000-0000-4000-8000-000000000140',
    'create',
    null,
    'PAPDENY6',
    'TASK-140 Denied Staff Web POS Admin',
    'pos_admin',
    'pin',
    '$scrypt-v1$task140-staff-web-pos-admin-create-denied',
    null,
    null
  )->>'code',
  'unauthorized',
  'manager with staff.write but without full access cannot create a POS Admin'
);
select is(
  public.shop_staff_mutate_as_staff_web(
    '20000000-0000-4000-8000-000000000150',
    '30000000-0000-4000-8000-000000000150',
    '10000000-0000-4000-8000-000000000140',
    'reset_credential',
    '20000000-0000-4000-8000-000000000156',
    null,
    null,
    null,
    'pin',
    '$scrypt-v1$task140-staff-web-pos-admin-reset-denied',
    'TASK-140 manager POS Admin target reset denial',
    null
  )->>'code',
  'unauthorized',
  'manager without full access cannot reset a POS Admin target'
);
select is(
  public.shop_staff_mutate_as_staff_web(
    '20000000-0000-4000-8000-000000000150',
    '30000000-0000-4000-8000-000000000150',
    '10000000-0000-4000-8000-000000000140',
    'clear_lockout',
    '20000000-0000-4000-8000-000000000156',
    null,
    null,
    null,
    null,
    null,
    'TASK-140 manager POS Admin target clear denial',
    null
  )->>'code',
  'unauthorized',
  'manager without full access cannot clear a POS Admin target lockout'
);

reset role;
set local role postgres;

select ok(
  not exists (
    select 1
    from public.staff_accounts
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and staff_code = 'PAPDENY6'
  ) and (
    select credential_hash = '$scrypt-v1$task140-platform-pos-admin-reset'
      and credential_version = 2
      and credential_status = 'locked'
      and failed_attempts = 5
      and locked_until > now()
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000156'
  ) and (
    select failed_attempts = 5 and locked_until > now()
    from public.staff_web_login_attempts
    where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
      'T140SHOP',
      'POSTGT6'
    )
  ),
  'manager full-access guard leaves POS Admin create, credential and lockouts unchanged'
);

set local role service_role;

select is(
  public.shop_staff_mutate_as_staff_web(
    '20000000-0000-4000-8000-000000000155',
    '30000000-0000-4000-8000-000000000155',
    '10000000-0000-4000-8000-000000000140',
    'create',
    null,
    'PAPOK6',
    'TASK-140 Staff Web POS Admin',
    'pos_admin',
    'pin',
    '$scrypt-v1$task140-staff-web-pos-admin-create',
    null,
    null
  )->>'code',
  'unauthorized',
  'even a full-access POS Admin staff-web actor cannot delegate the owner/platform-only POS Admin role'
);
select is(
  public.shop_staff_mutate_as_staff_web(
    '20000000-0000-4000-8000-000000000155',
    '30000000-0000-4000-8000-000000000155',
    '10000000-0000-4000-8000-000000000140',
    'reset_credential',
    '20000000-0000-4000-8000-000000000156',
    null,
    null,
    null,
    'pin',
    '$scrypt-v1$task140-staff-web-pos-admin-reset',
    'TASK-140 POS Admin actor target reset',
    null
  )->>'code',
  'unauthorized',
  'even a full-access POS Admin staff-web actor cannot reset a protected POS Admin target'
);

reset role;
set local role postgres;

select ok(
  not exists (
    select 1
    from public.staff_accounts
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and staff_code = 'PAPOK6'
  ) and (
    select role_key = 'pos_admin'
      and credential_kind = 'pin'
      and credential_hash = '$scrypt-v1$task140-platform-pos-admin-reset'
      and credential_version = 2
      and credential_status = 'locked'
      and must_change_credential
      and failed_attempts = 5
      and locked_until > now()
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000156'
  ) and (
    select failed_attempts = 5 and locked_until > now()
    from public.staff_web_login_attempts
    where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
      'T140SHOP',
      'POSTGT6'
    )
  ),
  'POS Admin staff-web create and protected-target reset denials leave all state unchanged'
);

update public.staff_accounts
set credential_status = 'locked',
    must_change_credential = true,
    failed_attempts = 5,
    locked_until = now() + interval '15 minutes'
where staff_id = '20000000-0000-4000-8000-000000000156';

update public.staff_web_login_attempts
set failed_attempts = 5,
    locked_until = now() + interval '15 minutes'
where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
  'T140SHOP',
  'POSTGT6'
);

set local role service_role;
select is(
  public.shop_staff_mutate_as_staff_web(
    '20000000-0000-4000-8000-000000000155',
    '30000000-0000-4000-8000-000000000155',
    '10000000-0000-4000-8000-000000000140',
    'clear_lockout',
    '20000000-0000-4000-8000-000000000156',
    null,
    null,
    null,
    null,
    null,
    'TASK-140 POS Admin actor target clear',
    null
  )->>'code',
  'unauthorized',
  'even a full-access POS Admin staff-web actor cannot clear a protected target lockout'
);

reset role;
set local role postgres;

select ok(
  (
    select credential_status = 'locked'
      and must_change_credential
      and failed_attempts = 5
      and locked_until > now()
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000156'
  ) and (
    select failed_attempts = 5 and locked_until > now()
    from public.staff_web_login_attempts
    where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
      'T140SHOP',
      'POSTGT6'
    )
  ),
  'protected-target clear denial leaves both lockout domains unchanged'
);

set local role service_role;

select is(
  (
    select (mutation_result ->> 'code') || ':'
      || (mutation_result #>> '{payload,action}')
    from (
      select public.shop_staff_mutate_as_staff_web(
        '20000000-0000-4000-8000-000000000150',
        '30000000-0000-4000-8000-000000000150',
        '10000000-0000-4000-8000-000000000140',
        'create',
        null,
        'WEBNEW',
        'TASK-140 P1 Created Staff',
        'cashier',
        'pin',
        '$scrypt-v1$task140-p1-create-fixture',
        null,
        null
      ) as mutation_result
    ) as mutation
  ),
  'success:create',
  'service role creates staff through the atomic boundary with an explicit action payload'
);
select is(
  public.shop_staff_mutate_as_staff_web(
    '20000000-0000-4000-8000-000000000150',
    '30000000-0000-4000-8000-000000000150',
    '10000000-0000-4000-8000-000000000140',
    'reset_credential',
    '20000000-0000-4000-8000-000000000152',
    null,
    null,
    null,
    'pin',
    '$scrypt-v1$task140-p1-new-reset-fixture',
    'TASK-140 P1 staff web reset',
    null
  )->>'code',
  'success',
  'service role resets a credential through the atomic staff-web boundary'
);
select is(
  public.shop_staff_mutate_as_staff_web(
    '20000000-0000-4000-8000-000000000150',
    '30000000-0000-4000-8000-000000000150',
    '10000000-0000-4000-8000-000000000140',
    'clear_lockout',
    '20000000-0000-4000-8000-000000000153',
    null,
    null,
    null,
    null,
    null,
    'TASK-140 P1 staff web clear',
    null
  )->>'code',
  'success',
  'service role clears a lockout through the atomic staff-web boundary'
);

reset role;
set local role postgres;

select is(
  (
    select status || ':' || credential_kind || ':' || credential_status || ':'
      || must_change_credential::text || ':' || credential_version::text
    from public.staff_accounts
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and staff_code = 'WEBNEW'
  ),
  'active:pin:active:false:1',
  'atomic staff-web create persists an immediately usable PIN credential'
);
select ok(
  (
    select failed_attempts = 0 and locked_until is null
    from public.staff_web_login_attempts
    where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
      'T140SHOP',
      'WEBNEW'
    )
  ),
  'atomic staff-web create clears the pre-existing web lockout only after insert success'
);
select ok(
  exists (
    select 1
    from public.audit_logs
    where actor_staff_id = '20000000-0000-4000-8000-000000000150'
      and event_key = 'shop.staff.create.success'
      and target_id = (
        select staff_id::text
        from public.staff_accounts
        where shop_id = '10000000-0000-4000-8000-000000000140'
          and staff_code = 'WEBNEW'
      )
      and metadata_redacted @> '{"reason_provided":false,"reason_length":0}'::jsonb
      and not (metadata_redacted ?| array['reason', 'reason_redacted', 'credential_hash'])
      and position('$scrypt-v1$task140-p1-create-fixture' in metadata_redacted::text) = 0
  ),
  'atomic staff-web create audit attributes the staff actor without raw credential or reason'
);

select is(
  (
    select status || ':' || credential_kind || ':' || credential_status || ':'
      || must_change_credential::text || ':' || credential_version::text
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000152'
  ),
  'suspended:pin:active:false:4',
  'atomic staff-web reset preserves suspended while activating the replacement credential'
);
select ok(
  (
    select failed_attempts = 0 and locked_until is null
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000152'
  ) and (
    select failed_attempts = 0 and locked_until is null
    from public.staff_web_login_attempts
    where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
      'T140SHOP',
      'P1SUSP'
    )
  ),
  'atomic staff-web reset clears both lockout domains'
);
select ok(
  (
    select session_invalidated_at is not null
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000152'
  ) and (
    select status = 'revoked'
      and revoked_at is not null
      and revoked_reason = 'credential_reset'
    from public.staff_web_sessions
    where staff_web_session_id = '30000000-0000-4000-8000-000000000152'
  ),
  'atomic staff-web reset invalidates credential state and revokes active web sessions'
);
select ok(
  exists (
    select 1
    from public.audit_logs
    where actor_staff_id = '20000000-0000-4000-8000-000000000150'
      and event_key = 'shop.staff.credential.reset.success'
      and target_id = '20000000-0000-4000-8000-000000000152'
      and (metadata_redacted ->> 'reason_provided')::boolean
      and (metadata_redacted ->> 'reason_length')::integer
        = length('TASK-140 P1 staff web reset')
      and not (metadata_redacted ?| array['reason', 'reason_redacted', 'credential_hash'])
      and position('TASK-140 P1 staff web reset' in metadata_redacted::text) = 0
      and position('$scrypt-v1$task140-p1-new-reset-fixture' in metadata_redacted::text) = 0
  ),
  'atomic staff-web reset audit stores only reason presence and length'
);

select ok(
  (
    select credential_status = 'rotation_required'
      and must_change_credential
      and failed_attempts = 0
      and locked_until is null
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000153'
  ),
  'atomic staff-web clear preserves forced rotation while clearing staff lockout'
);
select ok(
  (
    select failed_attempts = 0 and locked_until is null
    from public.staff_web_login_attempts
    where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
      'T140SHOP',
      'P1CLEAR'
    )
  ),
  'atomic staff-web clear removes the matching web login lockout'
);
select ok(
  exists (
    select 1
    from public.audit_logs
    where actor_staff_id = '20000000-0000-4000-8000-000000000150'
      and event_key = 'shop.staff.lockout.clear.success'
      and target_id = '20000000-0000-4000-8000-000000000153'
      and (metadata_redacted ->> 'reason_length')::integer
        = length('TASK-140 P1 staff web clear')
      and not (metadata_redacted ?| array['reason', 'reason_redacted', 'credential_hash'])
      and position('TASK-140 P1 staff web clear' in metadata_redacted::text) = 0
  ),
  'atomic staff-web clear audit is staff-attributed and reason-redacted'
);

update public.staff_web_login_attempts
set failed_attempts = 5,
    locked_until = now() + interval '15 minutes'
where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
  'T140SHOP',
  'WEBNEW'
);

set local role service_role;
select is(
  public.shop_staff_mutate_as_staff_web(
    '20000000-0000-4000-8000-000000000150',
    '30000000-0000-4000-8000-000000000150',
    '10000000-0000-4000-8000-000000000140',
    'create',
    null,
    'WEBNEW',
    'TASK-140 P1 Duplicate Staff',
    'cashier',
    'pin',
    '$scrypt-v1$task140-p1-duplicate-fixture',
    null,
    null
  )->>'code',
  'duplicate_staff_code',
  'atomic staff-web create rejects a duplicate code'
);
reset role;
set local role postgres;

select ok(
  (
    select count(*) = 1
    from public.staff_accounts
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and staff_code = 'WEBNEW'
  ) and (
    select failed_attempts = 5 and locked_until > now()
    from public.staff_web_login_attempts
    where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
      'T140SHOP',
      'WEBNEW'
    )
  ),
  'duplicate atomic create rolls back without clearing the web lockout'
);
select ok(
  exists (
    select 1
    from public.audit_logs
    where actor_staff_id = '20000000-0000-4000-8000-000000000150'
      and event_key = 'shop.staff.create.failure'
      and result = 'blocked'
      and metadata_redacted ->> 'code' = 'duplicate_staff_code'
      and not (metadata_redacted ?| array['reason', 'reason_redacted', 'credential_hash'])
  ),
  'duplicate atomic create emits only a redacted staff-attributed audit'
);

update public.staff_accounts
set failed_attempts = 5,
    locked_until = now() + interval '15 minutes',
    credential_status = 'locked'
where staff_id = '20000000-0000-4000-8000-000000000153';
update public.staff_web_login_attempts
set failed_attempts = 5,
    locked_until = now() + interval '15 minutes'
where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
  'T140SHOP',
  'P1CLEAR'
);

set local role service_role;
select is(
  public.shop_staff_mutate_as_staff_web(
    '20000000-0000-4000-8000-000000000150',
    '30000000-0000-4000-8000-000000000150',
    '10000000-0000-4000-8000-000000000240',
    'clear_lockout',
    '20000000-0000-4000-8000-000000000240',
    null, null, null, null, null,
    'TASK-140 P1 cross-shop denial',
    null
  )->>'code',
  'unauthorized',
  'atomic staff-web mutation rejects an actor bound to another shop'
);
select is(
  public.shop_staff_mutate_as_staff_web(
    '20000000-0000-4000-8000-000000000151',
    '30000000-0000-4000-8000-000000000150',
    '10000000-0000-4000-8000-000000000140',
    'clear_lockout',
    '20000000-0000-4000-8000-000000000153',
    null, null, null, null, null,
    'TASK-140 P1 ineligible actor denial',
    null
  )->>'code',
  'unauthorized',
  'atomic staff-web mutation rejects a locked, rotating and web-revoked actor'
);
reset role;
set local role postgres;

update public.staff_role_permissions
set enabled = false,
    updated_at = now()
where shop_id = '10000000-0000-4000-8000-000000000140'
  and role_key = 'manager'
  and permission_key = 'staff.write';

set local role service_role;
select is(
  public.shop_staff_mutate_as_staff_web(
    '20000000-0000-4000-8000-000000000150',
    '30000000-0000-4000-8000-000000000150',
    '10000000-0000-4000-8000-000000000140',
    'clear_lockout',
    '20000000-0000-4000-8000-000000000153',
    null, null, null, null, null,
    'TASK-140 P1 permission denial',
    null
  )->>'code',
  'unauthorized',
  'atomic staff-web mutation rechecks enabled staff.write permission'
);
reset role;
set local role postgres;

update public.staff_role_permissions
set enabled = true,
    updated_at = now()
where shop_id = '10000000-0000-4000-8000-000000000140'
  and role_key = 'manager'
  and permission_key = 'staff.write';

select ok(
  (
    select credential_hash = '$scrypt-v1$task140-cross-shop-fixture'
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000240'
  ) and (
    select failed_attempts = 5 and locked_until > now()
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000153'
  ) and (
    select failed_attempts = 5 and locked_until > now()
    from public.staff_web_login_attempts
    where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
      'T140SHOP',
      'P1CLEAR'
    )
  ),
  'cross-shop, ineligible-actor and permission denials leave targets and lockouts unchanged'
);

create function app_private.task140_test_reject_staff_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.event_key = 'shop.staff.lockout.clear.success'
    and new.target_id = '20000000-0000-4000-8000-000000000154' then
    raise exception using
      errcode = 'P0001',
      message = 'task140_forced_audit_failure';
  end if;
  return new;
end;
$$;

create trigger task140_test_reject_staff_audit
before insert on public.audit_logs
for each row execute function app_private.task140_test_reject_staff_audit();

set local role service_role;
select throws_ok(
  $$
    select public.shop_staff_mutate_as_staff_web(
      '20000000-0000-4000-8000-000000000150',
      '30000000-0000-4000-8000-000000000150',
      '10000000-0000-4000-8000-000000000140',
      'clear_lockout',
      '20000000-0000-4000-8000-000000000154',
      null, null, null, null, null,
      'TASK-140 P1 forced audit rollback',
      null
    )
  $$,
  'P0001',
  'task140_forced_audit_failure',
  'audit persistence failure aborts the complete staff-web mutation'
);
reset role;
set local role postgres;

drop trigger task140_test_reject_staff_audit on public.audit_logs;
drop function app_private.task140_test_reject_staff_audit();

select ok(
  (
    select credential_status = 'locked'
      and failed_attempts = 5
      and locked_until > now()
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000154'
  ) and (
    select failed_attempts = 5 and locked_until > now()
    from public.staff_web_login_attempts
    where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
      'T140SHOP',
      'P1ROLL'
    )
  ),
  'audit failure rolls back staff and web lockout writes atomically'
);
select ok(
  not exists (
    select 1
    from public.audit_logs
    where event_key = 'shop.staff.lockout.clear.success'
      and target_id = '20000000-0000-4000-8000-000000000154'
  ),
  'audit failure leaves no misleading success audit'
);

update public.staff_accounts
set credential_status = 'locked',
    failed_attempts = 5,
    locked_until = now() - interval '1 minute'
where staff_id = '20000000-0000-4000-8000-000000000150';

set local role service_role;
select is(
  public.shop_staff_mutate_as_staff_web(
    '20000000-0000-4000-8000-000000000150',
    '30000000-0000-4000-8000-000000000150',
    '10000000-0000-4000-8000-000000000140',
    'clear_lockout',
    '20000000-0000-4000-8000-000000000154',
    null, null, null, null, null,
    'TASK-140 expired actor lock recovery',
    null
  )->>'code',
  'success',
  'atomic staff-web mutation reuses an active session after the actor lock expires'
);
reset role;
set local role postgres;

update public.staff_accounts
set locked_until = now() + interval '15 minutes'
where staff_id = '20000000-0000-4000-8000-000000000150';

set local role service_role;
select is(
  public.shop_staff_mutate_as_staff_web(
    '20000000-0000-4000-8000-000000000150',
    '30000000-0000-4000-8000-000000000150',
    '10000000-0000-4000-8000-000000000140',
    'clear_lockout',
    '20000000-0000-4000-8000-000000000154',
    null, null, null, null, null,
    'TASK-140 future actor lock denial',
    null
  )->>'code',
  'unauthorized',
  'atomic staff-web mutation denies an actor while the lock deadline is future'
);
reset role;
set local role postgres;

update public.staff_accounts
set locked_until = null
where staff_id = '20000000-0000-4000-8000-000000000150';

set local role service_role;
select is(
  public.shop_staff_mutate_as_staff_web(
    '20000000-0000-4000-8000-000000000150',
    '30000000-0000-4000-8000-000000000150',
    '10000000-0000-4000-8000-000000000140',
    'clear_lockout',
    '20000000-0000-4000-8000-000000000154',
    null, null, null, null, null,
    'TASK-140 indefinite actor lock denial',
    null
  )->>'code',
  'unauthorized',
  'atomic staff-web mutation denies a locked actor without a deadline'
);
reset role;
set local role postgres;

update public.staff_accounts
set credential_status = 'active',
    failed_attempts = 0,
    locked_until = null
where staff_id = '20000000-0000-4000-8000-000000000150';

set local role service_role;
select is(
  public.shop_staff_mutate_as_staff_web(
    '20000000-0000-4000-8000-000000000150',
    '30000000-0000-4000-8000-000000000151',
    '10000000-0000-4000-8000-000000000140',
    'clear_lockout',
    '20000000-0000-4000-8000-000000000154',
    null, null, null, null, null,
    'TASK-140 P1 revoked session denial',
    null
  )->>'code',
  'unauthorized',
  'selected revoked session is denied even while another actor session remains active'
);
select is(
  public.shop_staff_mutate_as_staff_web(
    '20000000-0000-4000-8000-000000000150',
    '30000000-0000-4000-8000-000000000152',
    '10000000-0000-4000-8000-000000000140',
    'clear_lockout',
    '20000000-0000-4000-8000-000000000154',
    null, null, null, null, null,
    'TASK-140 wrong selected session denial',
    null
  )->>'code',
  'unauthorized',
  'another staff account session cannot authorize the selected actor'
);
reset role;
set local role postgres;

select throws_ok(
  $$
    select app_private.task068i_platform_recovery_audit(
      '00000000-0000-4000-8000-000000000240',
      'shop',
      '10000000-0000-4000-8000-000000000140',
      'task140.platform.audit.failure.probe',
      'info',
      'invalid_result',
      'staff_account',
      '20000000-0000-4000-8000-000000000142',
      'TASK-140 audit failure probe reason',
      'probe',
      '{"credential_hash":"must-not-persist"}'::jsonb
    )
  $$,
  '23514',
  null,
  'platform recovery audit propagates persistence failures instead of swallowing them'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000240","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000240',
  true
);

select is(
  (
    select (recovery_result ->> 'operation_result') || ':'
      || (recovery_result ->> 'role_key')
    from (
      select public.platform_recover_initial_manager_1001(
        '10000000-0000-4000-8000-000000000140',
        'T140SHOP',
        'TASK-140 POS Admin',
        '$scrypt-v1$task140-new-recovery-fixture',
        'TASK-140 synthetic advanced recovery verification'
      ) as recovery_result
    ) as recovery
  ),
  'reactivated_reset:pos_admin',
  'advanced recovery reactivates staff 1001 as the canonical POS Admin role'
);

reset role;
set local role postgres;

select is(
  (
    select role_key || ':' || status || ':' || credential_kind || ':' || credential_status || ':'
      || must_change_credential::text || ':' || credential_version::text
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000142'
  ),
  'pos_admin:active:pin:active:false:8',
  'advanced recovery stores an immediately usable PIN and intentionally reactivates staff'
);
select is(
  (
    select credential_hash
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000142'
  ),
  '$scrypt-v1$task140-new-recovery-fixture',
  'advanced recovery stores only the replacement synthetic hash'
);
select is(
  (
    select failed_attempts
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000142'
  ),
  0,
  'advanced recovery clears staff failed attempts'
);
select ok(
  (
    select locked_until
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000142'
  ) is null,
  'advanced recovery clears staff lockout deadline'
);
select ok(
  (
    select session_invalidated_at is not null
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000142'
  ),
  'advanced recovery invalidates existing sessions'
);
select ok(
  (
    select web_access_revoked_at
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000142'
  ) is null,
  'advanced recovery restores explicitly revoked web access'
);
select ok(
  (
    select credential_expires_at between now() + interval '13 days'
      and now() + interval '15 days'
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000142'
  ),
  'advanced recovery preserves the fourteen-day temporary credential expiry'
);
select is(
  (
    select failed_attempts
    from public.staff_web_login_attempts
    where attempt_key_hash = 'sha256:b8de62d997861ffc4de7d5139f1d759abeb92e3a61d630e3cbc2ab7076b6ff3d'
  ),
  0,
  'advanced recovery clears web failed attempts'
);
select ok(
  (
    select locked_until
    from public.staff_web_login_attempts
    where attempt_key_hash = 'sha256:b8de62d997861ffc4de7d5139f1d759abeb92e3a61d630e3cbc2ab7076b6ff3d'
  ) is null,
  'advanced recovery clears web lockout deadline'
);
select ok(
  (
    select count(*) = 41
      and bool_and(enabled)
      and array_agg(permission_key order by permission_key) = (
        select array_agg(permission_key order by permission_key)
        from app_private.mac_admin_w7pos_009_pos_admin_permissions()
      )
    from public.staff_role_permissions
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and role_key = 'pos_admin'
  ),
  'advanced recovery enforces exactly 41 enabled POS Admin permissions'
);
select ok(
  exists (
    select 1
    from public.audit_logs
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and event_key = 'platform.staff_manager.initial_recovery.success'
      and target_id = '20000000-0000-4000-8000-000000000142'
      and result = 'success'
  ),
  'advanced recovery preserves redacted success audit'
);
select ok(
  exists (
    select 1
    from public.audit_logs
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and event_key = 'platform.staff_manager.initial_recovery.success'
      and target_id = '20000000-0000-4000-8000-000000000142'
      and (metadata_redacted ->> 'reason_provided')::boolean
      and (metadata_redacted ->> 'reason_length')::integer
        = length('TASK-140 synthetic advanced recovery verification')
      and metadata_redacted ->> 'role_key' = 'pos_admin'
      and not (metadata_redacted ?| array['reason', 'reason_redacted', 'credential_hash'])
      and position(
        'TASK-140 synthetic advanced recovery verification'
        in metadata_redacted::text
      ) = 0
      and position('$scrypt-v1$task140-new-recovery-fixture' in metadata_redacted::text) = 0
  ),
  'advanced recovery audit persists reason metadata only and no credential hash'
);

select lives_ok(
  $$
    select app_private.task051_insert_initial_manager(
      '10000000-0000-4000-8000-000000000240',
      '00000000-0000-4000-8000-000000000240',
      'TASK-140 POS Admin',
      '$scrypt-v1$task140-initial-manager-fixture'
    )
  $$,
  'initial manager helper remains callable only inside the trusted database boundary'
);
select is(
  (
    select role_key || ':' || status || ':' || credential_kind || ':' || credential_status || ':'
      || must_change_credential::text || ':' || credential_version::text
    from public.staff_accounts
    where shop_id = '10000000-0000-4000-8000-000000000240'
      and staff_code = '1001'
  ),
  'pos_admin:active:pin:active:false:1',
  'initial manager helper stores an immediately usable POS Admin numeric PIN'
);
select is(
  (
    select failed_attempts
    from public.staff_accounts
    where shop_id = '10000000-0000-4000-8000-000000000240'
      and staff_code = '1001'
  ),
  0,
  'initial manager starts with zero staff failed attempts'
);
select ok(
  (
    select locked_until
    from public.staff_accounts
    where shop_id = '10000000-0000-4000-8000-000000000240'
      and staff_code = '1001'
  ) is null,
  'initial manager starts without a staff lockout deadline'
);
select is(
  (
    select failed_attempts
    from public.staff_web_login_attempts
    where attempt_key_hash = 'sha256:252dcb06138d641b55e052dea732faff66d4fd319896ba985ed23eea2fcd9f1d'
  ),
  0,
  'initial manager helper clears pre-existing web failed attempts for code 1001'
);
select ok(
  (
    select locked_until
    from public.staff_web_login_attempts
    where attempt_key_hash = 'sha256:252dcb06138d641b55e052dea732faff66d4fd319896ba985ed23eea2fcd9f1d'
  ) is null,
  'initial manager helper clears pre-existing web lockout deadline for code 1001'
);
select ok(
  (
    select count(*) = 41
      and bool_and(enabled)
      and array_agg(permission_key order by permission_key) = (
        select array_agg(permission_key order by permission_key)
        from app_private.mac_admin_w7pos_009_pos_admin_permissions()
      )
    from public.staff_role_permissions
    where shop_id = '10000000-0000-4000-8000-000000000240'
      and role_key = 'pos_admin'
  ),
  'initial manager helper grants exactly 41 enabled POS Admin permissions'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000140","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000140',
  true
);

select is(
  public.shop_staff_reset_credential(
    '10000000-0000-4000-8000-000000000240',
    '20000000-0000-4000-8000-000000000240',
    'pin',
    '$scrypt-v1$task140-unauthorized-fixture',
    'TASK-140 synthetic cross-shop denial',
    null
  )->>'code',
  'unauthorized',
  'shop staff reset remains fail-closed for a cross-shop non-member'
);

reset role;
set local role postgres;

select is(
  (
    select credential_hash
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000240'
  ),
  '$scrypt-v1$task140-cross-shop-fixture',
  'cross-shop denial leaves the target credential unchanged'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.staff_record_login_failure(
    'shop_code',
    'T140SHOP2',
    'CROSS6',
    null,
    null,
    null,
    '{"source":"TASK-140 pgTAP unauthorized probe"}'::jsonb
  )->>'code',
  'unauthorized',
  'login-failure RPC also rejects a forged non-service JWT role internally'
);

set local role service_role;
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
select set_config('request.jwt.claim.role', 'service_role', true);

select public.staff_record_login_failure(
  'shop_code',
  'T140SHOP2',
  'CROSS6',
  '10000000-0000-4000-8000-000000000240',
  '20000000-0000-4000-8000-000000000240',
  1,
  '{"source":"TASK-140 pgTAP concurrent-equivalent"}'::jsonb
)
from generate_series(1, 5);

reset role;
set local role postgres;
select is(
  (
    select failed_attempts::text || ':' || credential_status
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000240'
  ),
  '5:locked',
  'five serialized Shop Code failures lock the staff counter exactly at five'
);
select ok(
  (
    select failed_attempts = 5 and locked_until > now()
    from public.staff_web_login_attempts
    where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
      'T140SHOP2',
      'CROSS6'
    )
  ),
  'five serialized Shop Code failures lock the web counter exactly at five'
);
select is(
  (
    select metadata_redacted ->> 'source'
    from public.staff_web_login_attempts
    where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
      'T140SHOP2',
      'CROSS6'
    )
  ),
  'staff_login_failure_atomic',
  'atomic Shop Code lockout persists only the normalized internal source marker'
);

update public.staff_accounts
set credential_version = 2,
    credential_status = 'active',
    failed_attempts = 0,
    locked_until = null,
    updated_at = now()
where staff_id = '20000000-0000-4000-8000-000000000240';
delete from public.staff_web_login_attempts
where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
  'T140SHOP2',
  'CROSS6'
);

set local role service_role;
select is(
  public.staff_record_login_failure(
    'shop_code',
    'T140SHOP2',
    'CROSS6',
    '10000000-0000-4000-8000-000000000240',
    '20000000-0000-4000-8000-000000000240',
    1,
    '{"source":"TASK-140 pgTAP stale request"}'::jsonb
  )->>'code',
  'stale_or_ineligible',
  'a failure verified against the pre-reset credential version is rejected as stale'
);

reset role;
set local role postgres;
select ok(
  (
    select credential_version = 2
      and credential_status = 'active'
      and failed_attempts = 0
      and locked_until is null
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000240'
  ),
  'stale Shop Code failure cannot re-lock the reset credential'
);
select ok(
  not exists (
    select 1
    from public.staff_web_login_attempts
    where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
      'T140SHOP2',
      'CROSS6'
    )
  ),
  'stale Shop Code failure cannot recreate the cleared web lockout'
);

set local role service_role;
select public.staff_record_login_failure(
  'pos',
  null,
  null,
  '10000000-0000-4000-8000-000000000240',
  '20000000-0000-4000-8000-000000000240',
  2,
  '{"source":"TASK-140 pgTAP POS concurrent-equivalent"}'::jsonb
)
from generate_series(1, 5);

reset role;
set local role postgres;
select ok(
  (
    select credential_version = 2
      and credential_status = 'locked'
      and failed_attempts = 5
      and locked_until > now()
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000240'
  ),
  'five serialized POS failures lock the shared staff counter exactly at five'
);
select ok(
  not exists (
    select 1
    from public.staff_web_login_attempts
    where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
      'T140SHOP2',
      'CROSS6'
    )
  ),
  'POS failures do not create a Shop Code lockout row'
);

update public.staff_accounts
set credential_status = 'locked',
    failed_attempts = 5,
    locked_until = now() - interval '1 minute',
    updated_at = now()
where staff_id = '20000000-0000-4000-8000-000000000240';
insert into public.staff_web_login_attempts (
  attempt_key_hash,
  failed_attempts,
  last_failed_at,
  locked_until,
  metadata_redacted,
  updated_at
)
values (
  app_private.staff_web_login_attempt_key_hash('T140SHOP2', 'CROSS6'),
  5,
  now() - interval '16 minutes',
  now() - interval '1 minute',
  '{"source":"TASK-140 pgTAP elapsed Shop Code lock"}'::jsonb,
  now()
)
on conflict (attempt_key_hash) do update
set failed_attempts = excluded.failed_attempts,
    last_failed_at = excluded.last_failed_at,
    locked_until = excluded.locked_until,
    metadata_redacted = excluded.metadata_redacted,
    updated_at = excluded.updated_at;

set local role service_role;
select is(
  public.staff_record_login_failure(
    'shop_code',
    'T140SHOP2',
    'CROSS6',
    '10000000-0000-4000-8000-000000000240',
    '20000000-0000-4000-8000-000000000240',
    2,
    '{"source":"TASK-140 pgTAP elapsed Shop Code failure"}'::jsonb
  )->>'code',
  'recorded',
  'Shop Code records the first failure after both lockout deadlines elapsed'
);

reset role;
set local role postgres;
select is(
  (
    select credential_status || ':' || failed_attempts::text || ':'
      || (locked_until is null)::text
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000240'
  ),
  'active:1:true',
  'elapsed shared staff lockout normalizes to one active Shop Code failure'
);
select is(
  (
    select failed_attempts::text || ':' || (locked_until is null)::text
    from public.staff_web_login_attempts
    where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
      'T140SHOP2',
      'CROSS6'
    )
  ),
  '1:true',
  'elapsed web lockout normalizes to one Shop Code failure'
);

update public.staff_accounts
set credential_status = 'locked',
    failed_attempts = 5,
    locked_until = null,
    updated_at = now()
where staff_id = '20000000-0000-4000-8000-000000000240';
update public.staff_web_login_attempts
set failed_attempts = 0,
    locked_until = null,
    updated_at = now()
where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
  'T140SHOP2',
  'CROSS6'
);

set local role service_role;
select is(
  public.staff_record_login_failure(
    'shop_code',
    'T140SHOP2',
    'CROSS6',
    '10000000-0000-4000-8000-000000000240',
    '20000000-0000-4000-8000-000000000240',
    2,
    '{"source":"TASK-140 pgTAP no-deadline Shop Code failure"}'::jsonb
  )->>'code',
  'recorded',
  'Shop Code still records its web attempt for a locked credential without a deadline'
);

reset role;
set local role postgres;
select is(
  (
    select credential_status || ':' || failed_attempts::text || ':'
      || (locked_until is null)::text
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000240'
  ),
  'locked:5:true',
  'locked shared credential without a deadline is never normalized as elapsed'
);
select is(
  (
    select failed_attempts::text || ':' || (locked_until is null)::text
    from public.staff_web_login_attempts
    where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
      'T140SHOP2',
      'CROSS6'
    )
  ),
  '1:true',
  'no-deadline staff denial advances only the independent Shop Code counter'
);

-- Unified permission replacement: exact staff session, JWT identity, protected
-- roles and atomic audit rollback all converge on one SQL boundary.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  public.shop_staff_replace_role_permissions_as_web(
    '20000000-0000-4000-8000-000000000155',
    '30000000-0000-4000-8000-000000000150',
    '10000000-0000-4000-8000-000000000140',
    'manager',
    array['staff.read', 'staff.write']
  )->>'code',
  'unauthorized',
  'permission replacement rejects a different actor session while the exact session remains active'
);
select is(
  public.shop_staff_replace_role_permissions_as_web(
    '20000000-0000-4000-8000-000000000150',
    '30000000-0000-4000-8000-000000000151',
    '10000000-0000-4000-8000-000000000140',
    'manager',
    array['staff.read', 'staff.write']
  )->>'code',
  'unauthorized',
  'permission replacement rejects the selected revoked session while another actor session remains active'
);
select is(
  public.shop_staff_replace_role_permissions_as_web(
    '20000000-0000-4000-8000-000000000155',
    '30000000-0000-4000-8000-000000000155',
    '10000000-0000-4000-8000-000000000140',
    'manager',
    array['staff.read', 'staff.write']
  )->>'code',
  'success',
  'full-access staff replaces a shared role through the exact-session RPC'
);

reset role;
set local role postgres;
select is(
  (
    select array_agg(permission_key order by permission_key)
    from public.staff_role_permissions
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and role_key = 'manager'
      and enabled
  ),
  array['staff.read', 'staff.write']::text[],
  'permission replacement persists the exact requested safe set'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000140","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000140',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.shop_staff_replace_role_permissions_as_web(
    '20000000-0000-4000-8000-000000000155',
    '30000000-0000-4000-8000-000000000155',
    '10000000-0000-4000-8000-000000000140',
    'cashier',
    array['staff.read']
  )->>'code',
  'unauthorized',
  'authenticated permission replacement rejects forged staff actor parameters'
);
select is(
  public.shop_staff_replace_role_permissions_as_web(
    null,
    null,
    '10000000-0000-4000-8000-000000000140',
    'pos_admin',
    array['staff.read']
  )->>'code',
  'unauthorized',
  'authenticated owner cannot replace the canonical POS Admin matrix'
);
select is(
  public.shop_staff_replace_role_permissions_as_web(
    null,
    null,
    '10000000-0000-4000-8000-000000000140',
    'cashier',
    array['settings.write']
  )->>'code',
  'unauthorized',
  'authenticated owner cannot grant an owner-only permission to a shared role'
);
select is(
  public.shop_staff_replace_role_permissions_as_web(
    null,
    null,
    '10000000-0000-4000-8000-000000000140',
    'cashier',
    array['staff.read']
  )->>'code',
  'success',
  'authenticated owner can replace a shared role with a safe permission set'
);

reset role;
set local role postgres;
select ok(
  not exists (
    select 1
    from public.staff_role_permissions
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and role_key <> 'pos_admin'
      and permission_key in ('shop_admin.full_access', 'devices.write', 'settings.write')
  ),
  'permission RPC denials leave no owner-only capability on shared roles'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.shop_staff_replace_role_permissions_as_web(
    '20000000-0000-4000-8000-000000000155',
    '30000000-0000-4000-8000-000000000155',
    '10000000-0000-4000-8000-000000000140',
    'viewer',
    array['staff.read']
  )->>'code',
  'success',
  'exact-session service actor establishes the permission rollback baseline'
);

reset role;
set local role postgres;
create function app_private.task140_test_reject_permission_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.event_key = 'shop.staff.permissions.update.success'
    and new.target_id = 'viewer' then
    raise exception using
      errcode = 'P0001',
      message = 'task140_forced_permission_audit_failure';
  end if;
  return new;
end;
$$;

create trigger task140_test_reject_permission_audit
before insert on public.audit_logs
for each row execute function app_private.task140_test_reject_permission_audit();

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$
    select public.shop_staff_replace_role_permissions_as_web(
      '20000000-0000-4000-8000-000000000155',
      '30000000-0000-4000-8000-000000000155',
      '10000000-0000-4000-8000-000000000140',
      'viewer',
      array['audit.read']
    )
  $$,
  'P0001',
  'task140_forced_permission_audit_failure',
  'permission success-audit failure aborts the complete replacement statement'
);

reset role;
set local role postgres;
drop trigger task140_test_reject_permission_audit on public.audit_logs;
drop function app_private.task140_test_reject_permission_audit();
select is(
  (
    select array_agg(permission_key order by permission_key)
    from public.staff_role_permissions
    where shop_id = '10000000-0000-4000-8000-000000000140'
      and role_key = 'viewer'
      and enabled
  ),
  array['staff.read']::text[],
  'permission audit failure rolls the role set back to its exact prior value'
);
select ok(
  exists (
    select 1
    from public.audit_logs
    where actor_staff_id = '20000000-0000-4000-8000-000000000155'
      and event_key = 'shop.staff.permissions.update.success'
      and target_id = 'viewer'
      and metadata_redacted ->> 'code' = 'success'
      and not (metadata_redacted ?| array['reason', 'reason_redacted'])
  ),
  'permission success audit is staff-attributed and contains no raw reason'
);

-- Exact-session lifecycle and protected-target denial.
insert into public.staff_web_sessions (
  staff_web_session_id, shop_id, staff_id, session_token_hash,
  staff_credential_version, status, issued_at, expires_at,
  metadata_redacted, updated_at
)
values (
  '30000000-0000-4000-8000-000000000154',
  '10000000-0000-4000-8000-000000000140',
  '20000000-0000-4000-8000-000000000154',
  'sha256:' || encode(extensions.digest('TASK140:LIFECYCLE:TARGET154', 'sha256'), 'hex'),
  2,
  'active',
  now() - interval '1 minute',
  now() + interval '1 hour',
  '{"source":"TASK-140-LIFECYCLE"}'::jsonb,
  now()
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.shop_staff_lifecycle_as_staff_web(
    '20000000-0000-4000-8000-000000000155',
    '30000000-0000-4000-8000-000000000150',
    '10000000-0000-4000-8000-000000000140',
    'revoke_web_sessions',
    '20000000-0000-4000-8000-000000000154',
    'TASK-140 wrong lifecycle session'
  )->>'code',
  'unauthorized',
  'staff lifecycle rejects a different actor session while the exact one remains active'
);
select is(
  public.shop_staff_lifecycle_as_staff_web(
    '20000000-0000-4000-8000-000000000150',
    '30000000-0000-4000-8000-000000000151',
    '10000000-0000-4000-8000-000000000140',
    'revoke_web_sessions',
    '20000000-0000-4000-8000-000000000154',
    'TASK-140 revoked lifecycle session'
  )->>'code',
  'unauthorized',
  'staff lifecycle rejects the selected revoked session while another actor session remains active'
);
select is(
  public.shop_staff_lifecycle_as_staff_web(
    '20000000-0000-4000-8000-000000000155',
    '30000000-0000-4000-8000-000000000155',
    '10000000-0000-4000-8000-000000000140',
    'suspend',
    '20000000-0000-4000-8000-000000000156',
    'TASK-140 protected lifecycle denial'
  )->>'code',
  'unauthorized',
  'staff lifecycle denies a protected POS Admin target even to full-access staff'
);
select is(
  public.shop_staff_lifecycle_as_staff_web(
    '20000000-0000-4000-8000-000000000155',
    '30000000-0000-4000-8000-000000000155',
    '10000000-0000-4000-8000-000000000140',
    'revoke_web_sessions',
    '20000000-0000-4000-8000-000000000154',
    'TASK-140 exact lifecycle success'
  )->>'code',
  'success',
  'staff lifecycle succeeds for an unprotected target with the exact actor session'
);

reset role;
set local role postgres;
select ok(
  (
    select status = 'active'
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000156'
  ) and (
    select status = 'revoked' and revoked_at is not null
    from public.staff_web_sessions
    where staff_web_session_id = '30000000-0000-4000-8000-000000000154'
  ) and exists (
    select 1
    from public.audit_logs
    where actor_staff_id = '20000000-0000-4000-8000-000000000155'
      and event_key = 'shop.staff.web_sessions.revoke.success'
      and target_id = '20000000-0000-4000-8000-000000000154'
      and (metadata_redacted ->> 'reason_length')::integer
        = length('TASK-140 exact lifecycle success')
      and not (metadata_redacted ?| array['reason', 'reason_redacted'])
  ),
  'protected target stays active while exact-session lifecycle revokes target sessions with redacted audit'
);

-- JWT-only personal lifecycle: manager denial for protected targets, owner
-- success for allowed actions, and redacted atomic audit.
insert into public.staff_web_sessions (
  staff_web_session_id, shop_id, staff_id, session_token_hash,
  staff_credential_version, status, issued_at, expires_at,
  metadata_redacted, updated_at
)
values (
  '30000000-0000-4000-8000-000000000153',
  '10000000-0000-4000-8000-000000000140',
  '20000000-0000-4000-8000-000000000153',
  'sha256:' || encode(extensions.digest('TASK140:PERSONAL:TARGET153', 'sha256'), 'hex'),
  2,
  'active',
  now() - interval '1 minute',
  now() + interval '1 hour',
  '{"source":"TASK-140-PERSONAL"}'::jsonb,
  now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000340","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000340',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.shop_staff_lifecycle_as_personal_account(
    '10000000-0000-4000-8000-000000000140',
    'revoke_web_sessions',
    '20000000-0000-4000-8000-000000000156',
    'TASK-140 manager protected personal denial'
  )->>'code',
  'unauthorized',
  'shop manager personal account cannot mutate a protected POS Admin target'
);

reset role;
set local role postgres;
select ok(
  exists (
    select 1
    from public.audit_logs
    where actor_profile_id = '00000000-0000-4000-8000-000000000340'
      and actor_staff_id is null
      and event_key = 'shop.staff.web_sessions.revoke.failure'
      and target_id = '20000000-0000-4000-8000-000000000156'
      and metadata_redacted ->> 'code' = 'unauthorized'
      and not (metadata_redacted ?| array['reason', 'reason_redacted'])
  ),
  'personal protected-target denial is JWT-attributed and reason-redacted'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000140","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000140',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.shop_staff_lifecycle_as_personal_account(
    '10000000-0000-4000-8000-000000000140',
    'archive',
    '20000000-0000-4000-8000-000000000153',
    'TASK-140 invalid personal action'
  )->>'code',
  'validation_failed',
  'personal lifecycle rejects actions outside its two-action allowlist'
);
select is(
  public.shop_staff_lifecycle_as_personal_account(
    '10000000-0000-4000-8000-000000000140',
    'revoke_web_sessions',
    '20000000-0000-4000-8000-000000000153',
    ''
  )->>'code',
  'reason_required',
  'personal lifecycle requires a non-empty reason'
);
select is(
  public.shop_staff_lifecycle_as_personal_account(
    '10000000-0000-4000-8000-000000000140',
    'revoke_web_sessions',
    '20000000-0000-4000-8000-000000000153',
    'TASK-140 owner personal revoke'
  )->>'code',
  'success',
  'shop owner personal account can revoke an ordinary target session atomically'
);
select is(
  public.shop_staff_lifecycle_as_personal_account(
    '10000000-0000-4000-8000-000000000140',
    'revoke_web_sessions',
    '20000000-0000-4000-8000-000000000156',
    'TASK-140 owner protected personal revoke'
  )->>'code',
  'success',
  'shop owner personal account can revoke sessions for a protected POS Admin target'
);

reset role;
set local role postgres;
select ok(
  (
    select status = 'revoked' and revoked_at is not null
    from public.staff_web_sessions
    where staff_web_session_id = '30000000-0000-4000-8000-000000000153'
  ) and exists (
    select 1
    from public.audit_logs
    where actor_profile_id = '00000000-0000-4000-8000-000000000140'
      and actor_staff_id is null
      and event_key = 'shop.staff.web_sessions.revoke.success'
      and target_id = '20000000-0000-4000-8000-000000000153'
      and (metadata_redacted ->> 'reason_length')::integer
        = length('TASK-140 owner personal revoke')
      and (metadata_redacted ->> 'reason_provided')::boolean
      and not (metadata_redacted ?| array['reason', 'reason_redacted'])
      and position('TASK-140 owner personal revoke' in metadata_redacted::text) = 0
  ),
  'personal lifecycle revokes the session and persists only reason presence and length'
);

-- Isolate the TASK-140 wrapper eligibility transaction from TASK-137 financial
-- payload validation with a rolled-back internal test double.
insert into public.shop_devices (
  shop_device_id, shop_id, device_identifier, device_type, display_name, status
)
values (
  '40000000-0000-4000-8000-000000000140',
  '10000000-0000-4000-8000-000000000140',
  'TASK140-SALES-DEVICE',
  'pos',
  'TASK-140 sales wrapper device',
  'active'
);
insert into public.pos_device_credentials (
  pos_device_credential_id, shop_id, shop_device_id, staff_id, token_hash,
  staff_credential_version, status, issued_at, expires_at
)
values (
  '50000000-0000-4000-8000-000000000140',
  '10000000-0000-4000-8000-000000000140',
  '40000000-0000-4000-8000-000000000140',
  '20000000-0000-4000-8000-000000000150',
  'sha256:1400000000000000000000000000000000000000000000000000000000000140',
  1,
  'active',
  now() - interval '1 hour',
  now() + interval '1 day'
);
insert into public.pos_sessions (
  pos_session_id, shop_id, shop_device_id, staff_id,
  pos_device_credential_id, session_token_hash, staff_credential_version,
  status, issued_at, expires_at
)
values (
  '60000000-0000-4000-8000-000000000140',
  '10000000-0000-4000-8000-000000000140',
  '40000000-0000-4000-8000-000000000140',
  '20000000-0000-4000-8000-000000000150',
  '50000000-0000-4000-8000-000000000140',
  'sha256:2400000000000000000000000000000000000000000000000000000000000240',
  1,
  'active',
  now() - interval '30 minutes',
  now() + interval '8 hours'
);

create or replace function public.task140_pos_sales_sync_apply_v1_task137(
  p_shop_id uuid,
  p_shop_code text,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_client_batch_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_schema_version text,
  p_sales jsonb,
  p_metadata_redacted jsonb default '{}'::jsonb
)
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object('ok', true, 'code', 'stub_applied')
$$;

create or replace function pg_temp.task140_valid_sale(
  p_client_sale_id text
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'clientSaleId', p_client_sale_id,
    'clientOriginalSaleId', null,
    'idempotencyKey', p_client_sale_id,
    'payloadHash', 'sha256:' || repeat('9', 64),
    'businessKind', 'sale',
    'occurredAt', now(),
    'businessDate', current_date,
    'currency', 'CLP',
    'grossAmountClp', 1000,
    'discountAmountClp', 0,
    'taxAmountClp', 0,
    'netAmountClp', 1000,
    'paidAmountClp', 1000,
    'changeAmountClp', 0,
    'subtotal', 1000,
    'discountTotal', 0,
    'taxTotal', 0,
    'total', 1000,
    'fiscalStatus', 'not_required',
    'lines', jsonb_build_array(jsonb_build_object(
      'clientLineId', p_client_sale_id || '-line',
      'lineType', 'item',
      'quantity', 1,
      'stockQuantityDelta', -1,
      'unitAmountClp', 1000,
      'amountClp', 1000,
      'unitPrice', 1000,
      'lineTotal', 1000
    )),
    'payments', jsonb_build_array(jsonb_build_object(
      'clientPaymentId', p_client_sale_id || '-payment',
      'method', 'cash',
      'amountClp', 1000,
      'changeClp', 0
    ))
  );
$$;

update public.staff_accounts
set credential_status = 'active',
    failed_attempts = 0,
    locked_until = null,
    must_change_credential = false,
    session_invalidated_at = null,
    web_access_revoked_at = null,
    credential_expires_at = null,
    updated_at = now()
where staff_id = '20000000-0000-4000-8000-000000000150';

create temporary table task140_empty_sales_before as
select
  (select count(*) from public.pos_sales_sync_batches) as batches,
  (select count(*) from public.pos_sales) as sales,
  (select count(*) from public.pos_sale_lines) as lines,
  (select count(*) from public.pos_revenue_ledger_entries) as ledger,
  (select count(*) from public.pos_sale_stock_movements) as movements,
  (select credential_status from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000150') as credential_status,
  (select failed_attempts from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000150') as failed_attempts,
  (select locked_until from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000150') as locked_until;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.pos_sales_sync_apply_v1(
    '10000000-0000-4000-8000-000000000140',
    'T140SHOP',
    '40000000-0000-4000-8000-000000000140',
    '20000000-0000-4000-8000-000000000150',
    '60000000-0000-4000-8000-000000000140',
    'task140-empty',
    'task140-empty',
    'sha256:' || repeat('0', 64),
    'pos-sales-ledger-v2',
    '[]'::jsonb,
    '{"source":"TASK-140-empty"}'::jsonb
  )->>'code',
  'validation_failed',
  'POS sales wrapper rejects an empty sales array under the current 1-100 contract'
);

reset role;
set local role postgres;
select ok(
  (
    select before.batches = (select count(*) from public.pos_sales_sync_batches)
      and before.sales = (select count(*) from public.pos_sales)
      and before.lines = (select count(*) from public.pos_sale_lines)
      and before.ledger = (select count(*) from public.pos_revenue_ledger_entries)
      and before.movements = (
        select count(*) from public.pos_sale_stock_movements
      )
      and before.credential_status = (
        select credential_status from public.staff_accounts
        where staff_id = '20000000-0000-4000-8000-000000000150'
      )
      and before.failed_attempts = (
        select failed_attempts from public.staff_accounts
        where staff_id = '20000000-0000-4000-8000-000000000150'
      )
      and before.locked_until is not distinct from (
        select locked_until from public.staff_accounts
        where staff_id = '20000000-0000-4000-8000-000000000150'
      )
    from task140_empty_sales_before before
  ),
  'empty sales validation leaves sales sinks and shared credential state unchanged'
);

set local role service_role;
select is(
  public.pos_sales_sync_apply_v1(
    '10000000-0000-4000-8000-000000000140',
    'T140SHOP',
    '40000000-0000-4000-8000-000000000140',
    '20000000-0000-4000-8000-000000000150',
    '60000000-0000-4000-8000-000000000140',
    'task140-active',
    'task140-active',
    'sha256:' || repeat('a', 64),
    'pos-sales-ledger-v2',
    jsonb_build_array(pg_temp.task140_valid_sale('task140-active-sale')),
    '{"source":"TASK-140-active"}'::jsonb
  )->>'code',
  'stub_applied',
  'POS sales wrapper delegates an active credential to the financial implementation'
);

reset role;
set local role postgres;
update public.staff_accounts
set credential_status = 'locked',
    failed_attempts = 5,
    locked_until = now() - interval '1 minute',
    updated_at = now()
where staff_id = '20000000-0000-4000-8000-000000000150';

set local role service_role;
select is(
  public.pos_sales_sync_apply_v1(
    '10000000-0000-4000-8000-000000000140', 'T140SHOP',
    '40000000-0000-4000-8000-000000000140',
    '20000000-0000-4000-8000-000000000150',
    '60000000-0000-4000-8000-000000000140',
    'task140-elapsed', 'task140-elapsed', 'sha256:' || repeat('b', 64),
    'pos-sales-ledger-v2',
    jsonb_build_array(pg_temp.task140_valid_sale('task140-elapsed-sale')),
    '{"source":"TASK-140-elapsed"}'::jsonb
  )->>'code',
  'denied',
  'POS sales wrapper requires reauthentication after a finite elapsed credential lock'
);

reset role;
set local role postgres;
select is(
  (
    select credential_status || ':' || failed_attempts::text || ':'
      || (locked_until is null)::text
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000150'
  ),
  'locked:5:false',
  'elapsed-lock sales denial leaves normalization to the canonical login flow'
);

update public.staff_accounts
set credential_status = 'locked',
    failed_attempts = 5,
    locked_until = now() + interval '15 minutes',
    updated_at = now()
where staff_id = '20000000-0000-4000-8000-000000000150';
set local role service_role;
select is(
  public.pos_sales_sync_apply_v1(
    '10000000-0000-4000-8000-000000000140', 'T140SHOP',
    '40000000-0000-4000-8000-000000000140',
    '20000000-0000-4000-8000-000000000150',
    '60000000-0000-4000-8000-000000000140',
    'task140-future', 'task140-future', 'sha256:' || repeat('c', 64),
    'pos-sales-ledger-v2',
    jsonb_build_array(pg_temp.task140_valid_sale('task140-future-sale')),
    '{"source":"TASK-140-future"}'::jsonb
  )->>'code',
  'denied',
  'POS sales wrapper denies a future credential lock deadline'
);
reset role;
set local role postgres;
select ok(
  (
    select credential_status = 'locked'
      and failed_attempts = 5
      and locked_until > now()
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000150'
  ),
  'future-lock sales denial leaves the shared credential state unchanged'
);

update public.staff_accounts
set locked_until = null,
    updated_at = now()
where staff_id = '20000000-0000-4000-8000-000000000150';
set local role service_role;
select is(
  public.pos_sales_sync_apply_v1(
    '10000000-0000-4000-8000-000000000140', 'T140SHOP',
    '40000000-0000-4000-8000-000000000140',
    '20000000-0000-4000-8000-000000000150',
    '60000000-0000-4000-8000-000000000140',
    'task140-null', 'task140-null', 'sha256:' || repeat('d', 64),
    'pos-sales-ledger-v2',
    jsonb_build_array(pg_temp.task140_valid_sale('task140-null-sale')),
    '{"source":"TASK-140-null"}'::jsonb
  )->>'code',
  'denied',
  'POS sales wrapper denies a locked credential without a deadline'
);
reset role;
set local role postgres;
select is(
  (
    select credential_status || ':' || failed_attempts::text || ':'
      || (locked_until is null)::text
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000150'
  ),
  'locked:5:true',
  'no-deadline sales denial never normalizes the shared credential'
);

create or replace function public.task140_pos_sales_sync_apply_v1_task137(
  p_shop_id uuid,
  p_shop_code text,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_client_batch_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_schema_version text,
  p_sales jsonb,
  p_metadata_redacted jsonb default '{}'::jsonb
)
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object('ok', false, 'code', 'stub_rejected')
$$;
update public.staff_accounts
set credential_status = 'active',
    failed_attempts = 0,
    locked_until = now() - interval '1 minute',
    updated_at = now()
where staff_id = '20000000-0000-4000-8000-000000000150';

set local role service_role;
select is(
  public.pos_sales_sync_apply_v1(
    '10000000-0000-4000-8000-000000000140', 'T140SHOP',
    '40000000-0000-4000-8000-000000000140',
    '20000000-0000-4000-8000-000000000150',
    '60000000-0000-4000-8000-000000000140',
    'task140-rejected', 'task140-rejected', 'sha256:' || repeat('e', 64),
    'pos-sales-ledger-v2',
    jsonb_build_array(pg_temp.task140_valid_sale('task140-rejected-sale')),
    '{"source":"TASK-140-rejected"}'::jsonb
  )->>'code',
  'stub_rejected',
  'POS sales wrapper preserves the delegated financial rejection result'
);
reset role;
set local role postgres;
select ok(
  (
    select credential_status = 'active'
      and failed_attempts = 0
      and locked_until is not null
      and locked_until <= now()
    from public.staff_accounts
    where staff_id = '20000000-0000-4000-8000-000000000150'
  ),
  'delegated sales rejection leaves the active shared credential state unchanged'
);

select * from finish();
rollback;
