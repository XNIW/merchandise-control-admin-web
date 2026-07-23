-- MAC-ADMIN-W7POS-009 follow-up: complete POS Admin staff role permissions.
-- Idempotent repair for staging environments that attempted the first migration
-- before all staff_role_permissions constraints were widened.

alter table public.staff_role_permissions
  drop constraint if exists staff_role_permissions_permission_key_check,
  add constraint staff_role_permissions_permission_key_check
  check (
    permission_key in (
      'shop_admin.full_access',
      'pos.sell',
      'pos.pay',
      'pos.refund',
      'pos.void',
      'pos.discount',
      'catalog.view',
      'catalog.manage',
      'catalog.price_edit',
      'catalog.import',
      'catalog.export',
      'catalog.read',
      'catalog.write',
      'register.view',
      'register.manage',
      'users.view',
      'users.manage',
      'staff.read',
      'staff.write',
      'devices.read',
      'devices.write',
      'db.maintenance',
      'settings.view',
      'settings.write',
      'settings.manage',
      'settings.read',
      'printer.manage',
      'sync.manage',
      'sync.read',
      'sync.write',
      'pos.dashboard.read',
      'audit.view',
      'audit.read'
    )
  );
create or replace function app_private.mac_admin_w7pos_009_pos_admin_permissions()
returns table(permission_key text)
language sql
stable
set search_path = public, pg_temp
as $$
  select permissions.permission_key
  from (
    values
      ('shop_admin.full_access'),
      ('pos.sell'),
      ('pos.pay'),
      ('pos.refund'),
      ('pos.void'),
      ('pos.discount'),
      ('catalog.view'),
      ('catalog.manage'),
      ('catalog.price_edit'),
      ('catalog.import'),
      ('catalog.export'),
      ('catalog.read'),
      ('catalog.write'),
      ('register.view'),
      ('register.manage'),
      ('users.view'),
      ('users.manage'),
      ('staff.read'),
      ('staff.write'),
      ('devices.read'),
      ('devices.write'),
      ('db.maintenance'),
      ('settings.view'),
      ('settings.write'),
      ('settings.manage'),
      ('settings.read'),
      ('printer.manage'),
      ('sync.manage'),
      ('sync.read'),
      ('sync.write'),
      ('pos.dashboard.read'),
      ('audit.view'),
      ('audit.read')
  ) as permissions(permission_key);
$$;
revoke all on function app_private.mac_admin_w7pos_009_pos_admin_permissions()
  from public;
revoke all on function app_private.mac_admin_w7pos_009_pos_admin_permissions()
  from anon;
revoke all on function app_private.mac_admin_w7pos_009_pos_admin_permissions()
  from authenticated;
insert into public.staff_role_permissions (
  shop_id,
  role_key,
  permission_key,
  enabled,
  updated_by_profile_id,
  updated_at
)
select
  shops.shop_id,
  'pos_admin',
  permissions.permission_key,
  true,
  null,
  now()
from public.shops
cross join app_private.mac_admin_w7pos_009_pos_admin_permissions() permissions
on conflict (shop_id, role_key, permission_key)
do update set
  enabled = true,
  updated_at = now();
notify pgrst, 'reload schema';
