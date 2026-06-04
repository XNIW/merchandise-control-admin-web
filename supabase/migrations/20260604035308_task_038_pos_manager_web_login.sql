-- TASK-038: POS manager web login foundation.
-- Additive only. Staff web browser sessions are separate from Supabase Auth
-- personal sessions and from POS device-bound pos_sessions.
-- No Sales Sync, no fake revenue data, no raw browser tokens.

create table if not exists public.staff_web_sessions (
  staff_web_session_id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  staff_id uuid not null references public.staff_accounts(staff_id) on delete cascade,
  session_token_hash text not null,
  staff_credential_version integer not null,
  status text not null default 'active',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours'),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  metadata_redacted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_web_sessions_token_hash_unique unique (session_token_hash),
  constraint staff_web_sessions_token_hash_format check (
    session_token_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  constraint staff_web_sessions_credential_version_positive check (
    staff_credential_version >= 1
  ),
  constraint staff_web_sessions_status_check check (
    status in ('active', 'revoked', 'expired')
  ),
  constraint staff_web_sessions_revoked_shape_check check (
    (status = 'revoked' and revoked_at is not null)
    or (status <> 'revoked')
  ),
  constraint staff_web_sessions_metadata_object_check check (
    jsonb_typeof(metadata_redacted) = 'object'
  )
);

create index if not exists staff_web_sessions_staff_status_idx
  on public.staff_web_sessions(staff_id, status, expires_at);

create index if not exists staff_web_sessions_shop_status_idx
  on public.staff_web_sessions(shop_id, status, expires_at);

alter table public.staff_web_sessions enable row level security;
alter table public.staff_web_sessions force row level security;
revoke all on table public.staff_web_sessions from public;
revoke all on table public.staff_web_sessions from anon;
revoke all on table public.staff_web_sessions from authenticated;

create table if not exists public.staff_web_login_attempts (
  attempt_key_hash text primary key,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  last_failed_at timestamptz,
  last_success_at timestamptz,
  metadata_redacted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_web_login_attempts_key_hash_format check (
    attempt_key_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  constraint staff_web_login_attempts_failed_non_negative check (
    failed_attempts >= 0
  ),
  constraint staff_web_login_attempts_metadata_object_check check (
    jsonb_typeof(metadata_redacted) = 'object'
  )
);

create index if not exists staff_web_login_attempts_locked_until_idx
  on public.staff_web_login_attempts(locked_until)
  where locked_until is not null;

alter table public.staff_web_login_attempts enable row level security;
alter table public.staff_web_login_attempts force row level security;
revoke all on table public.staff_web_login_attempts from public;
revoke all on table public.staff_web_login_attempts from anon;
revoke all on table public.staff_web_login_attempts from authenticated;

create table if not exists public.staff_role_permissions (
  staff_role_permission_id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  role_key text not null,
  permission_key text not null,
  enabled boolean not null default true,
  updated_by_profile_id uuid references public.profiles(profile_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_role_permissions_role_key_check check (
    role_key in ('cashier', 'manager', 'viewer')
  ),
  constraint staff_role_permissions_permission_key_check check (
    permission_key in (
      'shop_admin.full_access',
      'catalog.read',
      'catalog.write',
      'catalog.import',
      'catalog.export',
      'staff.read',
      'staff.write',
      'devices.read',
      'devices.write',
      'audit.read',
      'settings.read',
      'settings.write',
      'pos.dashboard.read',
      'sync.read'
    )
  ),
  constraint staff_role_permissions_unique unique (shop_id, role_key, permission_key)
);

create index if not exists staff_role_permissions_shop_role_idx
  on public.staff_role_permissions(shop_id, role_key)
  where enabled = true;

alter table public.staff_role_permissions enable row level security;
alter table public.staff_role_permissions force row level security;
revoke all on table public.staff_role_permissions from public;
revoke all on table public.staff_role_permissions from anon;
revoke all on table public.staff_role_permissions from authenticated;

notify pgrst, 'reload schema';
