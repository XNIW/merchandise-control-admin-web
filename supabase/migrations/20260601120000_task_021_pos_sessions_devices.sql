-- TASK-021: POS backend session/device endpoints.
-- Scope: trusted device token hashes, POS sessions, heartbeat metadata, and
-- device revoke enforcement. No POS sales sync, no seed data, no raw tokens.

create table if not exists public.pos_device_credentials (
  pos_device_credential_id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  shop_device_id uuid not null references public.shop_devices(shop_device_id) on delete cascade,
  staff_id uuid not null references public.staff_accounts(staff_id) on delete cascade,
  token_hash text not null,
  token_version integer not null default 1,
  staff_credential_version integer not null,
  status text not null default 'active',
  issued_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null default (now() + interval '180 days'),
  revoked_at timestamptz,
  revoked_reason text,
  metadata_redacted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_device_credentials_token_hash_unique unique (token_hash),
  constraint pos_device_credentials_token_hash_format check (
    token_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  constraint pos_device_credentials_token_version_positive check (
    token_version >= 1
  ),
  constraint pos_device_credentials_staff_credential_version_positive check (
    staff_credential_version >= 1
  ),
  constraint pos_device_credentials_status_check check (
    status in ('active', 'revoked', 'expired')
  ),
  constraint pos_device_credentials_revoked_shape_check check (
    (status = 'revoked' and revoked_at is not null)
    or (status <> 'revoked')
  ),
  constraint pos_device_credentials_metadata_object_check check (
    jsonb_typeof(metadata_redacted) = 'object'
  )
);

create unique index if not exists pos_device_credentials_one_active_per_device
  on public.pos_device_credentials(shop_device_id)
  where status = 'active' and revoked_at is null;

create index if not exists pos_device_credentials_shop_staff_idx
  on public.pos_device_credentials(shop_id, staff_id, status, expires_at);

create index if not exists pos_device_credentials_device_idx
  on public.pos_device_credentials(shop_device_id, status, expires_at);

alter table public.pos_device_credentials enable row level security;
alter table public.pos_device_credentials force row level security;
revoke all on table public.pos_device_credentials from public;
revoke all on table public.pos_device_credentials from anon;
revoke all on table public.pos_device_credentials from authenticated;

create table if not exists public.pos_sessions (
  pos_session_id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  shop_device_id uuid not null references public.shop_devices(shop_device_id) on delete cascade,
  staff_id uuid not null references public.staff_accounts(staff_id) on delete cascade,
  pos_device_credential_id uuid not null references public.pos_device_credentials(pos_device_credential_id) on delete cascade,
  session_token_hash text not null,
  staff_credential_version integer not null,
  status text not null default 'active',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours'),
  last_seen_at timestamptz,
  heartbeat_count integer not null default 0,
  revoked_at timestamptz,
  revoked_reason text,
  metadata_redacted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_sessions_token_hash_unique unique (session_token_hash),
  constraint pos_sessions_token_hash_format check (
    session_token_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  constraint pos_sessions_staff_credential_version_positive check (
    staff_credential_version >= 1
  ),
  constraint pos_sessions_heartbeat_count_non_negative check (
    heartbeat_count >= 0
  ),
  constraint pos_sessions_status_check check (
    status in ('active', 'revoked', 'expired', 'blocked')
  ),
  constraint pos_sessions_revoked_shape_check check (
    (status = 'revoked' and revoked_at is not null)
    or (status <> 'revoked')
  ),
  constraint pos_sessions_metadata_object_check check (
    jsonb_typeof(metadata_redacted) = 'object'
  )
);

create index if not exists pos_sessions_shop_device_status_idx
  on public.pos_sessions(shop_id, shop_device_id, status, expires_at);

create index if not exists pos_sessions_staff_status_idx
  on public.pos_sessions(staff_id, status, expires_at);

alter table public.pos_sessions enable row level security;
alter table public.pos_sessions force row level security;
revoke all on table public.pos_sessions from public;
revoke all on table public.pos_sessions from anon;
revoke all on table public.pos_sessions from authenticated;

create or replace function app_private.revoke_pos_auth_on_shop_device_revoked()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  effective_revoked_at timestamptz := coalesce(new.revoked_at, now());
begin
  if new.status = 'revoked' and old.status is distinct from 'revoked' then
    update public.pos_device_credentials
    set status = 'revoked',
        revoked_at = effective_revoked_at,
        revoked_reason = 'shop_device_revoked',
        updated_at = now()
    where shop_device_id = new.shop_device_id
      and status = 'active'
      and revoked_at is null;

    update public.pos_sessions
    set status = 'revoked',
        revoked_at = effective_revoked_at,
        revoked_reason = 'shop_device_revoked',
        updated_at = now()
    where shop_device_id = new.shop_device_id
      and status = 'active'
      and revoked_at is null;
  end if;

  return new;
end;
$$;

revoke all on function app_private.revoke_pos_auth_on_shop_device_revoked()
  from public;
revoke all on function app_private.revoke_pos_auth_on_shop_device_revoked()
  from anon;
revoke all on function app_private.revoke_pos_auth_on_shop_device_revoked()
  from authenticated;

drop trigger if exists shop_devices_revoke_pos_auth
  on public.shop_devices;
create trigger shop_devices_revoke_pos_auth
  after update of status on public.shop_devices
  for each row execute function app_private.revoke_pos_auth_on_shop_device_revoked();

notify pgrst, 'reload schema';
