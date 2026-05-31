-- TASK-016: Platform Admin final completion.
-- Additive only: pending owner invites, admin grant/revoke, and shop restore all
-- stay behind audited security-definer RPCs.

create table if not exists public.platform_owner_invites (
  platform_owner_invite_id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  owner_contact_redacted text not null,
  owner_contact_digest text not null,
  status text not null default 'pending',
  requested_by_profile_id uuid references public.profiles(profile_id),
  accepted_profile_id uuid references public.profiles(profile_id),
  audit_log_id uuid references public.audit_logs(audit_log_id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint platform_owner_invites_contact_redacted_not_blank
    check (length(btrim(owner_contact_redacted)) > 0),
  constraint platform_owner_invites_contact_digest_shape
    check (owner_contact_digest ~ '^[a-f0-9]{64}$'),
  constraint platform_owner_invites_status_check
    check (status in ('pending', 'accepted', 'cancelled', 'expired')),
  constraint platform_owner_invites_resolved_shape check (
    (status = 'pending' and resolved_at is null)
    or (status <> 'pending' and resolved_at is not null)
  )
);

create unique index if not exists platform_owner_invites_one_pending_per_shop
  on public.platform_owner_invites(shop_id)
  where status = 'pending';

create unique index if not exists platform_owner_invites_pending_contact_per_shop
  on public.platform_owner_invites(shop_id, owner_contact_digest)
  where status = 'pending';

alter table public.platform_owner_invites enable row level security;

drop policy if exists platform_owner_invites_select_platform_admin
  on public.platform_owner_invites;
create policy platform_owner_invites_select_platform_admin
  on public.platform_owner_invites
  for select
  to authenticated
  using (
    app_private.is_platform_admin()
  );

revoke all on table public.platform_owner_invites from anon;
revoke all on table public.platform_owner_invites from authenticated;
grant select on table public.platform_owner_invites to authenticated;

create or replace function public.platform_create_shop_with_pending_owner_invite(
  p_shop_name text,
  p_shop_code text,
  p_owner_email text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  normalized_shop_name text := btrim(coalesce(p_shop_name, ''));
  normalized_shop_code text := upper(btrim(coalesce(p_shop_code, '')));
  normalized_owner_email text := lower(btrim(coalesce(p_owner_email, '')));
  redacted_reason text := btrim(coalesce(p_reason, ''));
  redacted_contact text;
  contact_digest text;
  created_shop_id uuid;
  invite_id uuid;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'global', null, 'platform.shop.pending_owner_invite.attempt',
    'info', 'success', 'owner_invite', null, redacted_reason, 'attempt'
  );

  if length(normalized_shop_name) = 0
    or normalized_shop_code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'
    or normalized_owner_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(redacted_reason) = 0 then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.shop.pending_owner_invite.failure',
      'warning', 'blocked', 'owner_invite', null, redacted_reason, 'validation_failed'
    );
    return app_private.platform_action_result(false, 'validation_failed', null, audit_event_id);
  end if;

  if exists (select 1 from public.shops where shop_code = normalized_shop_code) then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.shop.pending_owner_invite.failure',
      'warning', 'blocked', 'shop', null, redacted_reason, 'duplicate_shop_code'
    );
    return app_private.platform_action_result(false, 'duplicate_shop_code', null, audit_event_id);
  end if;

  redacted_contact := left(normalized_owner_email, 1) || '***@' || split_part(normalized_owner_email, '@', 2);
  contact_digest := encode(extensions.digest(normalized_owner_email, 'sha256'), 'hex');

  insert into public.shops (
    shop_code,
    shop_name,
    shop_status,
    created_by_profile_id,
    status_reason_redacted,
    status_changed_at,
    status_changed_by_profile_id
  )
  values (
    normalized_shop_code,
    normalized_shop_name,
    'pending_setup',
    actor_id,
    left(redacted_reason, 240),
    now(),
    actor_id
  )
  returning shop_id into created_shop_id;

  insert into public.platform_owner_invites (
    shop_id,
    owner_contact_redacted,
    owner_contact_digest,
    requested_by_profile_id
  )
  values (
    created_shop_id,
    redacted_contact,
    contact_digest,
    actor_id
  )
  returning platform_owner_invite_id into invite_id;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'shop', created_shop_id, 'platform.shop.pending_owner_invite.success',
    'info', 'success', 'owner_invite', invite_id::text, redacted_reason, 'success'
  );

  update public.platform_owner_invites
  set audit_log_id = audit_event_id,
      updated_at = now()
  where platform_owner_invite_id = invite_id;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'shop', created_shop_id, 'platform.shop.create.pending_owner.success',
    'info', 'success', 'shop', created_shop_id::text, redacted_reason, 'success'
  );

  return app_private.platform_action_result(true, 'success', created_shop_id, audit_event_id)
    || jsonb_build_object(
      'invite_id', invite_id,
      'delivery_status', 'pending_external_delivery'
    );
exception
  when unique_violation then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.shop.pending_owner_invite.failure',
      'warning', 'blocked', 'owner_invite', null, redacted_reason, 'conflict'
    );
    return app_private.platform_action_result(false, 'conflict', null, audit_event_id);
  when others then
    if actor_id is not null then
      audit_event_id := app_private.write_platform_shop_audit(
        actor_id, 'global', null, 'platform.shop.pending_owner_invite.failure',
        'critical', 'failure', 'owner_invite', null, redacted_reason, 'db_failure'
      );
    end if;
    return app_private.platform_action_result(false, 'db_failure', null, audit_event_id);
end;
$$;

create or replace function public.platform_grant_platform_admin(
  p_profile_id uuid,
  p_reason text,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  redacted_reason text := btrim(coalesce(p_reason, ''));
  target_profile public.profiles%rowtype;
  existing_admin public.platform_admins%rowtype;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'global', null, 'platform.admin.grant.attempt',
    'warning', 'success', 'profile', p_profile_id::text, redacted_reason, 'attempt'
  );

  if length(redacted_reason) = 0 or upper(btrim(coalesce(p_confirmation, ''))) <> 'GRANT' then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.admin.grant.failure',
      'warning', 'blocked', 'profile', p_profile_id::text, redacted_reason, 'validation_failed'
    );
    return app_private.platform_action_result(false, 'validation_failed', null, audit_event_id);
  end if;

  select *
  into target_profile
  from public.profiles
  where profile_id = p_profile_id;

  if not found then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.admin.grant.failure',
      'warning', 'blocked', 'profile', p_profile_id::text, redacted_reason, 'profile_not_found'
    );
    return app_private.platform_action_result(false, 'profile_not_found', null, audit_event_id);
  end if;

  if target_profile.profile_status <> 'active' or target_profile.disabled_at is not null then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.admin.grant.failure',
      'warning', 'blocked', 'profile', p_profile_id::text, redacted_reason, 'profile_not_active'
    );
    return app_private.platform_action_result(false, 'profile_not_active', null, audit_event_id);
  end if;

  select *
  into existing_admin
  from public.platform_admins
  where profile_id = p_profile_id
    and status = 'active'
    and revoked_at is null
  for update;

  if found then
    update public.platform_admins
    set last_reviewed_at = now(),
        reason_redacted = left(redacted_reason, 240)
    where platform_admin_id = existing_admin.platform_admin_id;
  else
    insert into public.platform_admins (
      profile_id,
      status,
      granted_by_profile_id,
      reason_redacted,
      last_reviewed_at
    )
    values (
      p_profile_id,
      'active',
      actor_id,
      left(redacted_reason, 240),
      now()
    );
  end if;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'global', null, 'platform.admin.grant.success',
    'warning', 'success', 'profile', p_profile_id::text, redacted_reason, 'success'
  );

  return app_private.platform_action_result(true, 'success', null, audit_event_id);
exception
  when unique_violation then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.admin.grant.failure',
      'warning', 'blocked', 'profile', p_profile_id::text, redacted_reason, 'conflict'
    );
    return app_private.platform_action_result(false, 'conflict', null, audit_event_id);
  when others then
    if actor_id is not null then
      audit_event_id := app_private.write_platform_shop_audit(
        actor_id, 'global', null, 'platform.admin.grant.failure',
        'critical', 'failure', 'profile', p_profile_id::text, redacted_reason, 'db_failure'
      );
    end if;
    return app_private.platform_action_result(false, 'db_failure', null, audit_event_id);
end;
$$;

create or replace function public.platform_revoke_platform_admin(
  p_profile_id uuid,
  p_reason text,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  redacted_reason text := btrim(coalesce(p_reason, ''));
  target_admin public.platform_admins%rowtype;
  active_admin_count integer;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'global', null, 'platform.admin.revoke.attempt',
    'critical', 'success', 'profile', p_profile_id::text, redacted_reason, 'attempt'
  );

  if length(redacted_reason) = 0 or upper(btrim(coalesce(p_confirmation, ''))) <> 'REVOKE' then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.admin.revoke.failure',
      'warning', 'blocked', 'profile', p_profile_id::text, redacted_reason, 'validation_failed'
    );
    return app_private.platform_action_result(false, 'validation_failed', null, audit_event_id);
  end if;

  select *
  into target_admin
  from public.platform_admins
  where profile_id = p_profile_id
    and status = 'active'
    and revoked_at is null
  for update;

  if not found then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.admin.revoke.failure',
      'warning', 'blocked', 'profile', p_profile_id::text, redacted_reason, 'admin_not_found'
    );
    return app_private.platform_action_result(false, 'admin_not_found', null, audit_event_id);
  end if;

  if p_profile_id = actor_id then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.admin.revoke.failure',
      'critical', 'blocked', 'profile', p_profile_id::text, redacted_reason, 'self_lockout_blocked'
    );
    return app_private.platform_action_result(false, 'self_lockout_blocked', null, audit_event_id);
  end if;

  select count(*)
  into active_admin_count
  from public.platform_admins
  where status = 'active'
    and revoked_at is null;

  if active_admin_count <= 1 then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.admin.revoke.failure',
      'critical', 'blocked', 'profile', p_profile_id::text, redacted_reason, 'last_admin_blocked'
    );
    return app_private.platform_action_result(false, 'last_admin_blocked', null, audit_event_id);
  end if;

  update public.platform_admins
  set status = 'revoked',
      revoked_at = now(),
      revoked_by_profile_id = actor_id,
      reason_redacted = left(redacted_reason, 240),
      last_reviewed_at = now()
  where platform_admin_id = target_admin.platform_admin_id;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'global', null, 'platform.admin.revoke.success',
    'critical', 'success', 'profile', p_profile_id::text, redacted_reason, 'success'
  );

  return app_private.platform_action_result(true, 'success', null, audit_event_id);
exception
  when others then
    if actor_id is not null then
      audit_event_id := app_private.write_platform_shop_audit(
        actor_id, 'global', null, 'platform.admin.revoke.failure',
        'critical', 'failure', 'profile', p_profile_id::text, redacted_reason, 'db_failure'
      );
    end if;
    return app_private.platform_action_result(false, 'db_failure', null, audit_event_id);
end;
$$;

create or replace function public.platform_restore_shop(
  p_shop_id uuid,
  p_shop_code_confirmation text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  redacted_reason text := btrim(coalesce(p_reason, ''));
  target_shop public.shops%rowtype;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  select * into target_shop from public.shops where shop_id = p_shop_id for update;

  if not found then
    return app_private.platform_action_result(false, 'shop_not_found');
  end if;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'shop', p_shop_id, 'platform.shop.restore.attempt',
    'warning', 'success', 'shop', p_shop_id::text, redacted_reason, 'attempt'
  );

  if length(redacted_reason) = 0
    or upper(btrim(coalesce(p_shop_code_confirmation, ''))) <> target_shop.shop_code then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'shop', p_shop_id, 'platform.shop.restore.failure',
      'warning', 'blocked', 'shop', p_shop_id::text, redacted_reason, 'validation_failed'
    );
    return app_private.platform_action_result(false, 'validation_failed', p_shop_id, audit_event_id);
  end if;

  if not (target_shop.shop_status = 'archived') then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'shop', p_shop_id, 'platform.shop.restore.failure',
      'warning', 'blocked', 'shop', p_shop_id::text, redacted_reason, 'invalid_state'
    );
    return app_private.platform_action_result(false, 'invalid_state', p_shop_id, audit_event_id);
  end if;

  update public.shops
  set shop_status = 'active',
      archived_at = null,
      archived_by_profile_id = null,
      suspended_at = null,
      suspended_by_profile_id = null,
      status_reason_redacted = left(redacted_reason, 240),
      status_changed_at = now(),
      status_changed_by_profile_id = actor_id,
      updated_at = now()
  where shop_id = p_shop_id;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'shop', p_shop_id, 'platform.shop.restore.success',
    'warning', 'success', 'shop', p_shop_id::text, redacted_reason, 'success'
  );

  return app_private.platform_action_result(true, 'success', p_shop_id, audit_event_id);
exception
  when others then
    if actor_id is not null then
      audit_event_id := app_private.write_platform_shop_audit(
        actor_id, 'shop', p_shop_id, 'platform.shop.restore.failure',
        'critical', 'failure', 'shop', p_shop_id::text, redacted_reason, 'db_failure'
      );
    end if;
    return app_private.platform_action_result(false, 'db_failure', p_shop_id, audit_event_id);
end;
$$;

revoke all on function public.platform_create_shop_with_pending_owner_invite(text, text, text, text) from public;
revoke all on function public.platform_create_shop_with_pending_owner_invite(text, text, text, text) from anon;
revoke all on function public.platform_create_shop_with_pending_owner_invite(text, text, text, text) from authenticated;
grant execute on function public.platform_create_shop_with_pending_owner_invite(text, text, text, text) to authenticated;

revoke all on function public.platform_grant_platform_admin(uuid, text, text) from public;
revoke all on function public.platform_grant_platform_admin(uuid, text, text) from anon;
revoke all on function public.platform_grant_platform_admin(uuid, text, text) from authenticated;
grant execute on function public.platform_grant_platform_admin(uuid, text, text) to authenticated;

revoke all on function public.platform_revoke_platform_admin(uuid, text, text) from public;
revoke all on function public.platform_revoke_platform_admin(uuid, text, text) from anon;
revoke all on function public.platform_revoke_platform_admin(uuid, text, text) from authenticated;
grant execute on function public.platform_revoke_platform_admin(uuid, text, text) to authenticated;

revoke all on function public.platform_restore_shop(uuid, text, text) from public;
revoke all on function public.platform_restore_shop(uuid, text, text) from anon;
revoke all on function public.platform_restore_shop(uuid, text, text) from authenticated;
grant execute on function public.platform_restore_shop(uuid, text, text) to authenticated;
