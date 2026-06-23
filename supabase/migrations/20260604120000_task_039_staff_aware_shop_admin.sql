-- TASK-039: staff-aware Shop Admin mutation foundation.
-- Additive only. Staff web browser actors stay separate from Supabase Auth
-- personal accounts; service-role usage remains server-side only.
-- No Sales Sync, no synthetic revenue data, no Win7POS runtime changes.

alter table public.audit_logs
  add column if not exists actor_staff_id uuid references public.staff_accounts(staff_id);

create index if not exists audit_logs_actor_staff_id_idx
  on public.audit_logs(actor_staff_id)
  where actor_staff_id is not null;

alter table public.staff_accounts
  add column if not exists web_access_revoked_at timestamptz,
  add column if not exists web_access_revoked_by_staff_id uuid references public.staff_accounts(staff_id),
  add column if not exists web_access_revoked_reason text;

create index if not exists staff_accounts_web_access_revoked_idx
  on public.staff_accounts(shop_id, web_access_revoked_at)
  where web_access_revoked_at is not null;

create or replace view public.staff_accounts_safe
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
  updated_at,
  credential_version,
  credential_status,
  session_invalidated_at,
  web_access_revoked_at
from public.staff_accounts;

revoke all on table public.staff_accounts_safe from anon;
revoke all on table public.staff_accounts_safe from authenticated;
grant select on table public.staff_accounts_safe to authenticated;

create or replace function app_private.write_staff_shop_admin_audit(
  p_actor_staff_id uuid,
  p_shop_id uuid,
  p_event_key text,
  p_severity text,
  p_result text,
  p_target_type text,
  p_target_id text,
  p_code text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_id uuid;
  safe_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if jsonb_typeof(safe_metadata) <> 'object' then
    safe_metadata := '{}'::jsonb;
  end if;

  insert into public.audit_logs (
    actor_profile_id,
    actor_staff_id,
    scope,
    shop_id,
    event_key,
    severity,
    result,
    target_type,
    target_id,
    metadata_redacted
  )
  values (
    null,
    p_actor_staff_id,
    'shop',
    p_shop_id,
    p_event_key,
    p_severity,
    p_result,
    p_target_type,
    p_target_id,
    jsonb_strip_nulls(
      safe_metadata
      || jsonb_build_object(
        'code', p_code,
        'source', 'TASK-039',
        'actor_kind', 'pos_staff_manager'
      )
    )
  )
  returning audit_log_id into inserted_id;

  return inserted_id;
end;
$$;

revoke all on function app_private.write_staff_shop_admin_audit(uuid, uuid, text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
