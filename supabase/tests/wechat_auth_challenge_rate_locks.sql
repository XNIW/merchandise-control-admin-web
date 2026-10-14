begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_function('public', 'wechat_auth_challenge_issue_v1', array[
  'text', 'text', 'text', 'text', 'text', 'text', 'uuid', 'integer'
]);
select function_privs_are(
  'public', 'wechat_auth_challenge_issue_v1',
  array['text', 'text', 'text', 'text', 'text', 'text', 'uuid', 'integer'],
  'service_role', array['EXECUTE']
);
select function_privs_are(
  'public', 'wechat_auth_challenge_issue_v1',
  array['text', 'text', 'text', 'text', 'text', 'text', 'uuid', 'integer'],
  'authenticated', array[]::text[]
);
select ok(
  (
    select position(
        'wechat-auth-challenge:device:' in pg_get_functiondef(proc.oid)
      ) > 0
      and position(
        'wechat-auth-challenge:device:' in pg_get_functiondef(proc.oid)
      ) < position(
        'wechat-auth-challenge:ip:' in pg_get_functiondef(proc.oid)
      )
      and length(pg_get_functiondef(proc.oid))
        - length(replace(pg_get_functiondef(proc.oid),
            'pg_advisory_xact_lock', ''))
          = 2 * length('pg_advisory_xact_lock')
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname = 'wechat_auth_challenge_issue_v1'
  ),
  'challenge issue locks device then ingress hash before admission'
);

select set_config('request.jwt.claim.role', 'service_role', true);

do $$
begin
  for i in 1..5 loop
    perform public.wechat_auth_challenge_issue_v1(
      encode(digest('device-state-' || i, 'sha256'), 'hex'),
      encode(digest('device-nonce-' || i, 'sha256'), 'hex'),
      'mini_program', 'login',
      repeat('a', 64),
      encode(digest('device-ip-' || i, 'sha256'), 'hex'),
      gen_random_uuid(), 300
    );
  end loop;
end;
$$;
select is(
  (select count(*)::integer from app_private.wechat_auth_challenges
    where device_hash = repeat('a', 64)),
  5, 'device bucket admits exactly five challenges per minute'
);
select throws_ok(
  $$select public.wechat_auth_challenge_issue_v1(
    encode(digest('device-state-6', 'sha256'), 'hex'),
    encode(digest('device-nonce-6', 'sha256'), 'hex'),
    'mini_program', 'login', repeat('a', 64), repeat('b', 64),
    gen_random_uuid(), 300
  )$$,
  'P0001', 'wechat_rate_limited',
  'sixth device challenge is rejected without an insert'
);

do $$
begin
  for i in 1..10 loop
    perform public.wechat_auth_challenge_issue_v1(
      encode(digest('ip-state-' || i, 'sha256'), 'hex'),
      encode(digest('ip-nonce-' || i, 'sha256'), 'hex'),
      'mini_program', 'login',
      encode(digest('ip-device-' || i, 'sha256'), 'hex'),
      repeat('c', 64), gen_random_uuid(), 300
    );
  end loop;
end;
$$;
select is(
  (select count(*)::integer from app_private.wechat_auth_challenges
    where ip_hash = repeat('c', 64)),
  10, 'ingress bucket admits exactly ten challenges per minute'
);
select throws_ok(
  $$select public.wechat_auth_challenge_issue_v1(
    encode(digest('ip-state-11', 'sha256'), 'hex'),
    encode(digest('ip-nonce-11', 'sha256'), 'hex'),
    'mini_program', 'login', repeat('d', 64), repeat('c', 64),
    gen_random_uuid(), 300
  )$$,
  'P0001', 'wechat_rate_limited',
  'eleventh ingress-bucket challenge is rejected without an insert'
);

select * from finish();
rollback;
