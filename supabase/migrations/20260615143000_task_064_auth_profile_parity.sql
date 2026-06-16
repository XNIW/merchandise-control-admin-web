-- TASK-064: keep personal Supabase Auth users visible as safe profiles.
-- Additive only: no account merge, no staff/POS identity changes.

create or replace function app_private.task064_safe_auth_display_name(
  p_email text,
  p_user_metadata jsonb
)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  candidate text;
begin
  candidate := nullif(btrim(coalesce(p_user_metadata ->> 'display_name', '')), '');
  candidate := coalesce(
    candidate,
    nullif(btrim(coalesce(p_user_metadata ->> 'full_name', '')), ''),
    nullif(btrim(coalesce(p_user_metadata ->> 'name', '')), ''),
    nullif(btrim(split_part(coalesce(p_email, ''), '@', 1)), ''),
    'Personal account'
  );
  candidate := regexp_replace(candidate, '[\r\n\t]+', ' ', 'g');
  candidate := regexp_replace(candidate, '\s+', ' ', 'g');

  return left(candidate, 80);
end;
$$;

create or replace function app_private.task064_ensure_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  insert into public.profiles (
    profile_id,
    display_name,
    profile_status,
    created_at,
    updated_at
  )
  values (
    new.id,
    app_private.task064_safe_auth_display_name(
      new.email,
      coalesce(new.raw_user_meta_data, '{}'::jsonb)
    ),
    'active',
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (profile_id) do nothing;

  return new;
end;
$$;

drop trigger if exists task064_auth_users_ensure_profile on auth.users;
create trigger task064_auth_users_ensure_profile
  after insert on auth.users
  for each row
  execute function app_private.task064_ensure_profile_for_auth_user();

insert into public.profiles (
  profile_id,
  display_name,
  profile_status,
  created_at,
  updated_at
)
select
  auth_user.id,
  app_private.task064_safe_auth_display_name(
    auth_user.email,
    coalesce(auth_user.raw_user_meta_data, '{}'::jsonb)
  ),
  'active',
  coalesce(auth_user.created_at, now()),
  now()
from auth.users as auth_user
left join public.profiles as profile
  on profile.profile_id = auth_user.id
where profile.profile_id is null
on conflict (profile_id) do nothing;

revoke all on function app_private.task064_safe_auth_display_name(text, jsonb) from public;
revoke all on function app_private.task064_safe_auth_display_name(text, jsonb) from anon;
revoke all on function app_private.task064_safe_auth_display_name(text, jsonb) from authenticated;
revoke all on function app_private.task064_ensure_profile_for_auth_user() from public;
revoke all on function app_private.task064_ensure_profile_for_auth_user() from anon;
revoke all on function app_private.task064_ensure_profile_for_auth_user() from authenticated;
