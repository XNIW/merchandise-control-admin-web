begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

select has_function(
  'public',
  'shop_pos_recovery_action_v1',
  array['uuid','uuid','text','text','text','text'],
  'POS recovery action uses a database-atomic publication fence'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.shop_pos_recovery_action_v1(uuid,uuid,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.shop_pos_recovery_action_v1(uuid,uuid,text,text,text,text)',
    'EXECUTE'
  ),
  'only the server boundary can execute the recovery publication fence'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000139',
  'authenticated',
  'authenticated',
  'task139-publication@example.invalid',
  '{}',
  '{}',
  clock_timestamp(),
  clock_timestamp()
);
insert into public.profiles (profile_id, display_name, profile_status)
values (
  '00000000-0000-4000-8000-000000000139',
  'TASK-139 publication owner',
  'active'
)
on conflict (profile_id) do update
set display_name = excluded.display_name,
    profile_status = excluded.profile_status;
insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '10000000-0000-4000-8000-000000000139',
  'TASK139FENCE',
  'TASK-139 publication shop',
  'active'
);
insert into public.shop_members (
  profile_id, shop_id, role_key, membership_status
) values (
  '00000000-0000-4000-8000-000000000139',
  '10000000-0000-4000-8000-000000000139',
  'shop_owner',
  'active'
);

set local role service_role;
select is(
  public.shop_pos_recovery_action_v1(
    '00000000-0000-4000-8000-000000000139',
    '10000000-0000-4000-8000-000000000139',
    'mark_reviewed',
    'pos_shop',
    '10000000-0000-4000-8000-000000000139',
    null
  )->>'code',
  'success',
  'active owner can publish a shop-scoped recovery action'
);

set local role postgres;
select is(
  (
    select count(*)::integer
    from public.audit_logs audit
    where audit.actor_profile_id =
        '00000000-0000-4000-8000-000000000139'
      and audit.shop_id = '10000000-0000-4000-8000-000000000139'
      and audit.event_key = 'pos.sync.recovery.mark_reviewed.success'
      and audit.target_type = 'pos_shop'
      and audit.target_id = '10000000-0000-4000-8000-000000000139'
  ),
  1,
  'successful recovery publication persists one append-only audit'
);

update public.shop_members
set membership_status = 'suspended',
    suspended_at = clock_timestamp()
where profile_id = '00000000-0000-4000-8000-000000000139'
  and shop_id = '10000000-0000-4000-8000-000000000139';
set local role service_role;
select is(
  public.shop_pos_recovery_action_v1(
    '00000000-0000-4000-8000-000000000139',
    '10000000-0000-4000-8000-000000000139',
    'mark_reviewed',
    'pos_shop',
    '10000000-0000-4000-8000-000000000139',
    null
  )->>'code',
  'permission_denied',
  'membership revocation before publication fails closed'
);

set local role postgres;
select is(
  (
    select count(*)::integer
    from public.audit_logs audit
    where audit.actor_profile_id =
        '00000000-0000-4000-8000-000000000139'
      and audit.event_key = 'pos.sync.recovery.mark_reviewed.success'
  ),
  1,
  'revoked action emits no success audit'
);
select ok(
  not exists (
    select 1
    from public.audit_logs audit
    where audit.actor_profile_id =
        '00000000-0000-4000-8000-000000000139'
      and audit.metadata_redacted::text ~*
        '(bearer|access[_-]?token|refresh[_-]?token|signed[_-]?url)'
  ),
  'recovery publication audit contains no secret-bearing metadata'
);

set local role service_role;
select is(
  public.shop_pos_recovery_action_v1(
    '00000000-0000-4000-8000-000000000139',
    '10000000-0000-4000-8000-000000000139',
    'add_note',
    'pos_shop',
    '10000000-0000-4000-8000-000000000139',
    ''
  )->>'code',
  'validation_failed',
  'empty recovery note is rejected before target lookup'
);
select is(
  public.shop_pos_recovery_action_v1(
    '00000000-0000-4000-8000-000000000139',
    '10000000-0000-4000-8000-000000000139',
    'mark_reviewed',
    'pos_shop',
    '10000000-0000-4000-8000-000000000138',
    null
  )->>'code',
  'permission_denied',
  'revoked caller cannot probe a foreign target identity'
);

select * from finish();
rollback;
