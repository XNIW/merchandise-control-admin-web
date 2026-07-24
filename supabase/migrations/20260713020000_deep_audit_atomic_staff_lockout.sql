-- Deep audit: serialize public-login failure counters in the database.
-- These RPCs are callable only by the server-side service role.

begin;

create or replace function public.record_staff_web_login_failure(
  p_attempt_key_hash text,
  p_metadata_redacted jsonb default '{}'::jsonb,
  p_lockout_attempts integer default 5,
  p_lockout_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_failed_attempts integer;
  v_locked_until timestamptz;
begin
  if p_attempt_key_hash !~ '^sha256:[0-9a-f]{64}$'
    or p_lockout_attempts < 2
    or p_lockout_attempts > 20
    or p_lockout_seconds < 60
    or p_lockout_seconds > 86400
    or jsonb_typeof(coalesce(p_metadata_redacted, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid staff web login failure input';
  end if;

  insert into public.staff_web_login_attempts (
    attempt_key_hash,
    failed_attempts,
    last_failed_at,
    locked_until,
    metadata_redacted,
    updated_at
  )
  values (
    p_attempt_key_hash,
    1,
    statement_timestamp(),
    null,
    coalesce(p_metadata_redacted, '{}'::jsonb),
    statement_timestamp()
  )
  on conflict (attempt_key_hash)
  do update set
    failed_attempts = least(
      case
        when public.staff_web_login_attempts.locked_until is not null
          and public.staff_web_login_attempts.locked_until <= statement_timestamp()
          then 0
        else public.staff_web_login_attempts.failed_attempts
      end + 1,
      p_lockout_attempts
    ),
    last_failed_at = statement_timestamp(),
    locked_until = case
      when least(
        case
          when public.staff_web_login_attempts.locked_until is not null
            and public.staff_web_login_attempts.locked_until <= statement_timestamp()
            then 0
          else public.staff_web_login_attempts.failed_attempts
        end + 1,
        p_lockout_attempts
      ) >= p_lockout_attempts
        then statement_timestamp() + make_interval(secs => p_lockout_seconds)
      else null
    end,
    metadata_redacted = excluded.metadata_redacted,
    updated_at = statement_timestamp()
  returning failed_attempts, locked_until
    into v_failed_attempts, v_locked_until;

  return jsonb_build_object(
    'failed_attempts', v_failed_attempts,
    'locked_until', v_locked_until
  );
end;
$$;

create or replace function public.record_staff_credential_failure(
  p_staff_id uuid,
  p_shop_id uuid,
  p_lockout_attempts integer default 5,
  p_lockout_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current_failed_attempts integer;
  v_current_locked_until timestamptz;
  v_failed_attempts integer;
  v_locked_until timestamptz;
  v_credential_status text;
begin
  if p_lockout_attempts < 2
    or p_lockout_attempts > 20
    or p_lockout_seconds < 60
    or p_lockout_seconds > 86400 then
    raise exception 'invalid staff credential failure input';
  end if;

  select failed_attempts, locked_until
    into v_current_failed_attempts, v_current_locked_until
  from public.staff_accounts
  where staff_id = p_staff_id
    and shop_id = p_shop_id
  for update;

  if not found then
    raise exception 'staff account not found';
  end if;

  v_failed_attempts := least(
    case
      when v_current_locked_until is not null
        and v_current_locked_until <= statement_timestamp()
        then 0
      else coalesce(v_current_failed_attempts, 0)
    end + 1,
    p_lockout_attempts
  );
  v_locked_until := case
    when v_failed_attempts >= p_lockout_attempts
      then statement_timestamp() + make_interval(secs => p_lockout_seconds)
    else null
  end;
  v_credential_status := case
    when v_locked_until is not null then 'locked'
    else 'active'
  end;

  update public.staff_accounts
  set credential_status = v_credential_status,
      failed_attempts = v_failed_attempts,
      locked_until = v_locked_until,
      updated_at = statement_timestamp()
  where staff_id = p_staff_id
    and shop_id = p_shop_id;

  return jsonb_build_object(
    'credential_status', v_credential_status,
    'failed_attempts', v_failed_attempts,
    'locked_until', v_locked_until
  );
end;
$$;

revoke all on function public.record_staff_web_login_failure(text, jsonb, integer, integer)
  from public, anon, authenticated;
revoke all on function public.record_staff_credential_failure(uuid, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.record_staff_web_login_failure(text, jsonb, integer, integer)
  to service_role;
grant execute on function public.record_staff_credential_failure(uuid, uuid, integer, integer)
  to service_role;

notify pgrst, 'reload schema';

commit;;
