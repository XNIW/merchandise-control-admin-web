create extension if not exists pgcrypto with schema extensions;

create schema if not exists app_private;

revoke all on schema app_private from public;
revoke all on schema app_private from anon;
revoke all on schema app_private from authenticated;

create table if not exists public.profiles (
  profile_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  profile_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  disabled_by_profile_id uuid references public.profiles(profile_id),
  constraint profiles_display_name_not_blank check (length(btrim(display_name)) > 0),
  constraint profiles_profile_status_check check (
    profile_status in ('active', 'review', 'disabled')
  ),
  constraint profiles_disabled_at_required check (
    (profile_status <> 'disabled' and disabled_at is null)
    or (profile_status = 'disabled' and disabled_at is not null)
  )
);

create table if not exists public.shops (
  shop_id uuid primary key default gen_random_uuid(),
  shop_code text not null,
  shop_name text not null,
  shop_status text not null default 'pending_setup',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_profile_id uuid references public.profiles(profile_id),
  archived_at timestamptz,
  archived_by_profile_id uuid references public.profiles(profile_id),
  constraint shops_shop_code_unique unique (shop_code),
  constraint shops_shop_code_format check (
    shop_code = upper(shop_code)
    and shop_code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'
  ),
  constraint shops_shop_name_not_blank check (length(btrim(shop_name)) > 0),
  constraint shops_shop_status_check check (
    shop_status in ('active', 'pending_setup', 'suspended', 'archived')
  ),
  constraint shops_archived_at_required check (
    (shop_status <> 'archived' and archived_at is null)
    or (shop_status = 'archived' and archived_at is not null)
  )
);

create table if not exists public.shop_members (
  shop_member_id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(profile_id) on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  role_key text not null,
  membership_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invited_by_profile_id uuid references public.profiles(profile_id),
  suspended_at timestamptz,
  suspended_by_profile_id uuid references public.profiles(profile_id),
  constraint shop_members_profile_shop_unique unique (profile_id, shop_id),
  constraint shop_members_role_key_check check (
    role_key in ('shop_owner', 'shop_manager', 'viewer')
  ),
  constraint shop_members_membership_status_check check (
    membership_status in ('active', 'invited', 'suspended')
  ),
  constraint shop_members_suspended_at_required check (
    (membership_status <> 'suspended' and suspended_at is null)
    or (membership_status = 'suspended' and suspended_at is not null)
  )
);

create table if not exists public.platform_admins (
  platform_admin_id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(profile_id) on delete cascade,
  status text not null default 'active',
  granted_at timestamptz not null default now(),
  granted_by_profile_id uuid references public.profiles(profile_id),
  revoked_at timestamptz,
  revoked_by_profile_id uuid references public.profiles(profile_id),
  reason_redacted text,
  last_reviewed_at timestamptz,
  constraint platform_admins_status_check check (status in ('active', 'revoked')),
  constraint platform_admins_revoked_at_required check (
    (status <> 'revoked' and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  )
);

create unique index if not exists platform_admins_one_active_per_profile
  on public.platform_admins(profile_id)
  where status = 'active' and revoked_at is null;

create table if not exists public.shop_inventory_sources (
  shop_inventory_source_id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(shop_id) on delete cascade,
  source_kind text not null default 'mobile_owner',
  owner_user_id uuid,
  mapping_state text not null default 'not_configured',
  created_at timestamptz not null default now(),
  created_by_profile_id uuid references public.profiles(profile_id),
  verified_at timestamptz,
  verified_by_profile_id uuid references public.profiles(profile_id),
  disabled_at timestamptz,
  disabled_by_profile_id uuid references public.profiles(profile_id),
  constraint shop_inventory_sources_source_kind_check check (
    source_kind = 'mobile_owner'
  ),
  constraint shop_inventory_sources_mapping_state_check check (
    mapping_state in (
      'mapped',
      'unmapped',
      'not_configured',
      'mobile_only',
      'ambiguous'
    )
  ),
  constraint shop_inventory_sources_mapping_shape_check check (
    (
      mapping_state = 'mapped'
      and shop_id is not null
      and owner_user_id is not null
    )
    or (
      mapping_state = 'not_configured'
      and shop_id is not null
      and owner_user_id is null
    )
    or (
      mapping_state in ('unmapped', 'mobile_only', 'ambiguous')
      and owner_user_id is not null
    )
  )
);

create unique index if not exists shop_inventory_sources_one_active_source_per_shop
  on public.shop_inventory_sources(shop_id)
  where mapping_state = 'mapped' and disabled_at is null;

create unique index if not exists shop_inventory_sources_one_active_shop_per_owner
  on public.shop_inventory_sources(owner_user_id)
  where mapping_state = 'mapped' and disabled_at is null;

create table if not exists public.audit_logs (
  audit_log_id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(profile_id),
  scope text not null,
  shop_id uuid references public.shops(shop_id),
  event_key text not null,
  severity text not null default 'info',
  result text not null default 'success',
  target_type text,
  target_id text,
  metadata_redacted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_scope_check check (scope in ('global', 'shop')),
  constraint audit_logs_shop_scope_shape_check check (
    (scope = 'global' and shop_id is null)
    or (scope = 'shop' and shop_id is not null)
  ),
  constraint audit_logs_event_key_not_blank check (length(btrim(event_key)) > 0),
  constraint audit_logs_severity_check check (
    severity in ('info', 'warning', 'critical')
  ),
  constraint audit_logs_result_check check (
    result in ('success', 'blocked', 'simulated')
  )
);

create or replace function app_private.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$;

drop trigger if exists audit_logs_prevent_update on public.audit_logs;
create trigger audit_logs_prevent_update
  before update on public.audit_logs
  for each row execute function app_private.prevent_audit_log_mutation();

drop trigger if exists audit_logs_prevent_delete on public.audit_logs;
create trigger audit_logs_prevent_delete
  before delete on public.audit_logs
  for each row execute function app_private.prevent_audit_log_mutation();

create or replace function app_private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    exists (
      select 1
      from public.platform_admins
      where profile_id = auth.uid()
        and status = 'active'
        and revoked_at is null
    ),
    false
  );
$$;

create or replace function app_private.is_active_shop_member(target_shop_id uuid)
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
    ),
    false
  );
$$;

revoke all on function app_private.prevent_audit_log_mutation() from public;
revoke all on function app_private.prevent_audit_log_mutation() from anon;
revoke all on function app_private.prevent_audit_log_mutation() from authenticated;
revoke all on function app_private.is_platform_admin() from public;
revoke all on function app_private.is_platform_admin() from anon;
grant execute on function app_private.is_platform_admin() to authenticated;
revoke all on function app_private.is_active_shop_member(uuid) from public;
revoke all on function app_private.is_active_shop_member(uuid) from anon;
grant execute on function app_private.is_active_shop_member(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.platform_admins enable row level security;
alter table public.shop_inventory_sources enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists profiles_select_own_or_platform_admin on public.profiles;
create policy profiles_select_own_or_platform_admin
  on public.profiles
  for select
  to authenticated
  using (
    profile_id = (select auth.uid())
    or app_private.is_platform_admin()
  );

drop policy if exists shops_select_member_or_platform_admin on public.shops;
create policy shops_select_member_or_platform_admin
  on public.shops
  for select
  to authenticated
  using (
    app_private.is_platform_admin()
    or app_private.is_active_shop_member(shop_id)
  );

drop policy if exists shop_members_select_related_or_platform_admin on public.shop_members;
create policy shop_members_select_related_or_platform_admin
  on public.shop_members
  for select
  to authenticated
  using (
    app_private.is_platform_admin()
    or profile_id = (select auth.uid())
    or app_private.is_active_shop_member(shop_id)
  );

drop policy if exists platform_admins_select_self_or_platform_admin on public.platform_admins;
create policy platform_admins_select_self_or_platform_admin
  on public.platform_admins
  for select
  to authenticated
  using (
    profile_id = (select auth.uid())
    or app_private.is_platform_admin()
  );

drop policy if exists shop_inventory_sources_select_member_or_platform_admin on public.shop_inventory_sources;
create policy shop_inventory_sources_select_member_or_platform_admin
  on public.shop_inventory_sources
  for select
  to authenticated
  using (
    app_private.is_platform_admin()
    or (
      shop_id is not null
      and mapping_state = 'mapped'
      and app_private.is_active_shop_member(shop_id)
    )
  );

drop policy if exists audit_logs_select_member_or_platform_admin on public.audit_logs;
create policy audit_logs_select_member_or_platform_admin
  on public.audit_logs
  for select
  to authenticated
  using (
    app_private.is_platform_admin()
    or (
      scope = 'shop'
      and shop_id is not null
      and app_private.is_active_shop_member(shop_id)
    )
  );

revoke all on table public.profiles from anon;
revoke all on table public.shops from anon;
revoke all on table public.shop_members from anon;
revoke all on table public.platform_admins from anon;
revoke all on table public.shop_inventory_sources from anon;
revoke all on table public.audit_logs from anon;

revoke all on table public.profiles from authenticated;
revoke all on table public.shops from authenticated;
revoke all on table public.shop_members from authenticated;
revoke all on table public.platform_admins from authenticated;
revoke all on table public.shop_inventory_sources from authenticated;
revoke all on table public.audit_logs from authenticated;

grant usage on schema public to authenticated;
grant select on table public.profiles to authenticated;
grant select on table public.shops to authenticated;
grant select on table public.shop_members to authenticated;
grant select on table public.platform_admins to authenticated;
grant select on table public.shop_inventory_sources to authenticated;
grant select on table public.audit_logs to authenticated;
