-- task_014_pos_staff_foundation
-- TASK-014: POS Staff credentials schema foundation.
-- Scope: schema/read-only safety only. No POS login, no staff credential mutation RPC,
-- no seed data, and no browser access to credential_hash.

create table if not exists public.staff_accounts (
  staff_id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  staff_code text not null,
  display_name text not null,
  role_key text not null,
  status text not null default 'pending_credential',
  credential_kind text,
  credential_hash text,
  credential_updated_at timestamptz,
  credential_expires_at timestamptz,
  must_change_credential boolean not null default true,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_by_profile_id uuid references public.profiles(profile_id),
  updated_by_profile_id uuid references public.profiles(profile_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_accounts_staff_code_format check (
    staff_code = upper(staff_code)
    and staff_code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
  ),
  constraint staff_accounts_staff_code_unique unique (shop_id, staff_code),
  constraint staff_accounts_display_name_not_blank check (
    length(btrim(display_name)) > 0
  ),
  constraint staff_accounts_role_key_check check (
    role_key in ('cashier', 'manager', 'viewer')
  ),
  constraint staff_accounts_status_check check (
    status in ('pending_credential', 'active', 'suspended', 'archived')
  ),
  constraint staff_accounts_credential_kind_check check (
    credential_kind is null or credential_kind in ('pin', 'password')
  ),
  constraint staff_accounts_failed_attempts_non_negative check (
    failed_attempts >= 0
  ),
  constraint staff_accounts_active_credential_required check (
    status <> 'active'
    or (
      credential_kind is not null
      and credential_hash is not null
      and credential_updated_at is not null
    )
  )
);

create index if not exists staff_accounts_shop_status_idx
  on public.staff_accounts(shop_id, status, staff_code);

create index if not exists staff_accounts_shop_role_idx
  on public.staff_accounts(shop_id, role_key)
  where status <> 'archived';

create or replace function app_private.is_active_shop_staff_admin_member(
  target_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    exists (
      select 1
      from public.shop_members
      where shop_id = target_shop_id
        and profile_id = auth.uid()
        and membership_status = 'active'
        and role_key in ('shop_owner', 'shop_manager')
    ),
    false
  );
$$;

revoke all on function app_private.is_active_shop_staff_admin_member(uuid)
  from public;
revoke all on function app_private.is_active_shop_staff_admin_member(uuid)
  from anon;
grant execute on function app_private.is_active_shop_staff_admin_member(uuid)
  to authenticated;

alter table public.staff_accounts enable row level security;

drop policy if exists staff_accounts_select_shop_owner_manager
  on public.staff_accounts;
create policy staff_accounts_select_shop_owner_manager
  on public.staff_accounts
  for select
  to authenticated
  using (
    app_private.is_active_shop_staff_admin_member(shop_id)
  );

revoke all on table public.staff_accounts from anon;
revoke all on table public.staff_accounts from authenticated;

grant select (
  staff_id,
  shop_id,
  staff_code,
  display_name,
  role_key,
  status,
  credential_kind,
  credential_updated_at,
  credential_expires_at,
  must_change_credential,
  failed_attempts,
  locked_until,
  last_login_at,
  created_by_profile_id,
  updated_by_profile_id,
  created_at,
  updated_at
) on table public.staff_accounts to authenticated;

drop view if exists public.staff_accounts_safe;
create view public.staff_accounts_safe
with (security_invoker = true)
as
select
  staff_id,
  shop_id,
  staff_code,
  display_name,
  role_key,
  status,
  credential_kind,
  credential_updated_at,
  credential_expires_at,
  must_change_credential,
  failed_attempts,
  locked_until,
  last_login_at,
  created_at,
  updated_at
from public.staff_accounts;

revoke all on table public.staff_accounts_safe from anon;
revoke all on table public.staff_accounts_safe from authenticated;
grant select on table public.staff_accounts_safe to authenticated;
