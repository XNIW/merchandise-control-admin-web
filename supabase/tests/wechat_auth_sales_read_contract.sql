begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(44);

select has_table('app_private'::name, 'wechat_auth_challenges'::name);
select has_function('public', 'wechat_auth_challenge_issue_v1', array[
  'text', 'text', 'text', 'text', 'text', 'text', 'uuid', 'integer'
]);
select has_function('public', 'wechat_auth_challenge_consume_v1', array[
  'text', 'text', 'text', 'text', 'text', 'text', 'uuid'
]);
select has_function('public', 'wechat_authorized_shops_v1', array[]::text[]);
select has_function('public', 'wechat_daily_sales_summary_v1', array['uuid', 'date']);
select has_function('public', 'wechat_daily_sales_page_v1', array[
  'uuid', 'date', 'integer', 'timestamp with time zone', 'uuid'
]);
select has_function('public', 'wechat_sale_detail_v1', array['uuid', 'uuid']);

select function_privs_are(
  'public',
  'wechat_authorized_shops_v1',
  array[]::text[],
  'authenticated',
  array['EXECUTE']
);
select function_privs_are(
  'public',
  'wechat_daily_sales_summary_v1',
  array['uuid', 'date'],
  'authenticated',
  array['EXECUTE']
);
select function_privs_are(
  'public',
  'wechat_auth_challenge_issue_v1',
  array['text', 'text', 'text', 'text', 'text', 'text', 'uuid', 'integer'],
  'authenticated',
  array[]::text[]
);

insert into auth.users (
  instance_id, id, aud, role, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000201',
    'authenticated', 'authenticated',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000202',
    'authenticated', 'authenticated',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

update public.profiles
set display_name = case profile_id
    when '00000000-0000-4000-8000-000000000201' then 'WeChat test member'
    else 'WeChat other member'
  end,
  profile_status = 'active'
where profile_id in (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000202'
);

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values
  ('10000000-0000-4000-8000-000000000201', 'WECHAT201', 'WeChat Shop A', 'active'),
  ('10000000-0000-4000-8000-000000000202', 'WECHAT202', 'WeChat Shop B', 'active');

insert into public.storefront_settings (
  shop_id, public_slug, currency_code, catalog_time_zone
) values
  ('10000000-0000-4000-8000-000000000201', 'wechat-shop-a', 'CLP', 'America/Santiago'),
  ('10000000-0000-4000-8000-000000000202', 'wechat-shop-b', 'CLP', 'UTC');

insert into public.shop_members (
  profile_id, shop_id, role_key, membership_status
) values
  (
    '00000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000201',
    'viewer', 'active'
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '10000000-0000-4000-8000-000000000202',
    'shop_owner', 'active'
  );

select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$select public.wechat_auth_challenge_issue_v1(
    repeat('a', 64), repeat('b', 64), 'mini_program', 'login',
    repeat('c', 64), repeat('d', 64),
    '90000000-0000-4000-8000-000000000201', 300
  )$$,
  'service role can issue a bounded challenge'
);

select ok(
  public.wechat_auth_challenge_consume_v1(
    repeat('a', 64), repeat('b', 64), 'mini_program', 'login',
    repeat('c', 64), repeat('d', 64),
    '90000000-0000-4000-8000-000000000201'
  ),
  'matching challenge is consumed once'
);

select is(
  public.wechat_auth_challenge_consume_v1(
    repeat('a', 64), repeat('b', 64), 'mini_program', 'login',
    repeat('c', 64), repeat('d', 64),
    '90000000-0000-4000-8000-000000000201'
  ),
  false,
  'challenge replay is rejected'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000201',
  true
);

select is(
  (select count(*)::integer from public.wechat_authorized_shops_v1()),
  1,
  'active viewer sees exactly the linked active shop'
);
select is(
  (select shop_id from public.wechat_authorized_shops_v1()),
  '10000000-0000-4000-8000-000000000201'::uuid,
  'authorized shop list cannot include another shop'
);
select is(
  (select time_zone from public.wechat_authorized_shops_v1()),
  'America/Santiago',
  'authorized shop returns configured timezone'
);
select is(
  (
    select count(*)::integer
    from public.wechat_daily_sales_summary_v1(
      '10000000-0000-4000-8000-000000000201', current_date
    )
  ),
  1,
  'viewer can read an empty summary for the linked shop'
);
select is(
  (
    select net_revenue_clp
    from public.wechat_daily_sales_summary_v1(
      '10000000-0000-4000-8000-000000000201', current_date
    )
  ),
  0::bigint,
  'empty daily summary reports zero net revenue'
);
select is(
  (
    select count(*)::integer
    from public.wechat_daily_sales_summary_v1(
      '10000000-0000-4000-8000-000000000202', current_date
    )
  ),
  0,
  'shop A user cannot read shop B summary'
);
select is(
  (
    select count(*)::integer
    from public.wechat_daily_sales_page_v1(
      '10000000-0000-4000-8000-000000000202', current_date, 50, null, null
    )
  ),
  0,
  'shop A user cannot page shop B sales'
);
select throws_ok(
  $$select * from public.wechat_daily_sales_page_v1(
    '10000000-0000-4000-8000-000000000201', current_date, 101, null, null
  )$$,
  '22023',
  'sales_page_invalid',
  'unbounded page size fails closed'
);
select throws_ok(
  $$select * from public.wechat_daily_sales_page_v1(
    '10000000-0000-4000-8000-000000000201', current_date,
    null, null, null
  )$$,
  '22023', 'sales_page_invalid',
  'explicit NULL page size fails closed'
);

update public.profiles
set profile_status = 'disabled', disabled_at = now()
where profile_id = '00000000-0000-4000-8000-000000000201';

select is(
  (select count(*)::integer from public.wechat_authorized_shops_v1()),
  0,
  'disabled personal account sees no shops immediately'
);

update public.profiles
set profile_status = 'active', disabled_at = null
where profile_id = '00000000-0000-4000-8000-000000000201';
update public.shop_members
set membership_status = 'suspended', suspended_at = now()
where profile_id = '00000000-0000-4000-8000-000000000201';

select is(
  (select count(*)::integer from public.wechat_authorized_shops_v1()),
  0,
  'removed or suspended membership denies reads without a new login'
);

update public.shop_members
set membership_status = 'active', suspended_at = null
where profile_id = '00000000-0000-4000-8000-000000000201';
update public.shops
set shop_status = 'suspended',
  suspended_at = now(),
  suspended_by_profile_id = '00000000-0000-4000-8000-000000000202'
where shop_id = '10000000-0000-4000-8000-000000000201';

select is(
  (select count(*)::integer from public.wechat_authorized_shops_v1()),
  0,
  'suspended shop is denied immediately'
);

select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);

select is(
  (select count(*)::integer from public.wechat_authorized_shops_v1()),
  0,
  'anonymous caller sees no shops'
);
select is(
  (
    select count(*)::integer
    from public.wechat_daily_sales_summary_v1(
      '10000000-0000-4000-8000-000000000202', current_date
    )
  ),
  0,
  'anonymous caller sees no sales summary'
);


-- TASK146 candidate extension: private draft, SQL/pgTAP NOT_RUN.
-- Original 27 assertions above remain literal; all fixtures roll back with this file.
set local role postgres;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000201',true);
update public.shops set shop_status='active',suspended_at=null,suspended_by_profile_id=null
where shop_id='10000000-0000-4000-8000-000000000201';
-- Concrete synthetic POS read fixture; no POS write/session RPC is invoked.
insert into public.staff_accounts (staff_id,shop_id,staff_code,display_name,role_key,status,
 credential_kind,credential_hash,credential_updated_at,credential_status,credential_version,must_change_credential)
values ('30000000-0000-4000-8000-000000146201','10000000-0000-4000-8000-000000000201','T146146201','TASK146 Sales Staff 146201','manager','active',
 'pin','$scrypt-v1$TASK146-fixture-not-a-real-credential',now(),'active',1,false);
insert into public.shop_devices (shop_device_id,shop_id,device_identifier,device_type,display_name,status)
values ('40000000-0000-4000-8000-000000146201','10000000-0000-4000-8000-000000000201','TASK146-DEVICE-146201','pos','TASK146 Sales Device 146201','active');
insert into public.pos_device_credentials (pos_device_credential_id,shop_id,shop_device_id,staff_id,
 token_hash,staff_credential_version,status,issued_at,expires_at)
values ('50000000-0000-4000-8000-000000146201','10000000-0000-4000-8000-000000000201','40000000-0000-4000-8000-000000146201','30000000-0000-4000-8000-000000146201',
 'sha256:'||md5('TASK146-credential-146201')||md5('TASK146-credential-146201'),1,'active',now()-interval '1 hour',now()+interval '1 day');
insert into public.pos_sessions (pos_session_id,shop_id,shop_device_id,staff_id,pos_device_credential_id,
 session_token_hash,staff_credential_version,status,issued_at,expires_at)
values ('60000000-0000-4000-8000-000000146201','10000000-0000-4000-8000-000000000201','40000000-0000-4000-8000-000000146201','30000000-0000-4000-8000-000000146201','50000000-0000-4000-8000-000000146201',
 'sha256:'||md5('TASK146-session-146201')||md5('TASK146-session-146201'),1,'active',now()-interval '30 minutes',now()+interval '8 hours');
insert into public.pos_sales_sync_batches (pos_sales_sync_batch_id,shop_id,shop_code,shop_device_id,
 staff_id,pos_session_id,client_batch_id,idempotency_key,payload_hash,sale_count,line_count,status)
values ('70000000-0000-4000-8000-000000146201','10000000-0000-4000-8000-000000000201','TASK146','40000000-0000-4000-8000-000000146201','30000000-0000-4000-8000-000000146201','60000000-0000-4000-8000-000000146201',
 'TASK146-BATCH-146201','TASK146-BATCH-146201','sha256:'||repeat('a',64),1,1,'accepted');
-- Concrete synthetic POS read fixture; no POS write/session RPC is invoked.
insert into public.staff_accounts (staff_id,shop_id,staff_code,display_name,role_key,status,
 credential_kind,credential_hash,credential_updated_at,credential_status,credential_version,must_change_credential)
values ('30000000-0000-4000-8000-000000146202','10000000-0000-4000-8000-000000000202','T146146202','TASK146 Sales Staff 146202','manager','active',
 'pin','$scrypt-v1$TASK146-fixture-not-a-real-credential',now(),'active',1,false);
insert into public.shop_devices (shop_device_id,shop_id,device_identifier,device_type,display_name,status)
values ('40000000-0000-4000-8000-000000146202','10000000-0000-4000-8000-000000000202','TASK146-DEVICE-146202','pos','TASK146 Sales Device 146202','active');
insert into public.pos_device_credentials (pos_device_credential_id,shop_id,shop_device_id,staff_id,
 token_hash,staff_credential_version,status,issued_at,expires_at)
values ('50000000-0000-4000-8000-000000146202','10000000-0000-4000-8000-000000000202','40000000-0000-4000-8000-000000146202','30000000-0000-4000-8000-000000146202',
 'sha256:'||md5('TASK146-credential-146202')||md5('TASK146-credential-146202'),1,'active',now()-interval '1 hour',now()+interval '1 day');
insert into public.pos_sessions (pos_session_id,shop_id,shop_device_id,staff_id,pos_device_credential_id,
 session_token_hash,staff_credential_version,status,issued_at,expires_at)
values ('60000000-0000-4000-8000-000000146202','10000000-0000-4000-8000-000000000202','40000000-0000-4000-8000-000000146202','30000000-0000-4000-8000-000000146202','50000000-0000-4000-8000-000000146202',
 'sha256:'||md5('TASK146-session-146202')||md5('TASK146-session-146202'),1,'active',now()-interval '30 minutes',now()+interval '8 hours');
insert into public.pos_sales_sync_batches (pos_sales_sync_batch_id,shop_id,shop_code,shop_device_id,
 staff_id,pos_session_id,client_batch_id,idempotency_key,payload_hash,sale_count,line_count,status)
values ('70000000-0000-4000-8000-000000146202','10000000-0000-4000-8000-000000000202','TASK146','40000000-0000-4000-8000-000000146202','30000000-0000-4000-8000-000000146202','60000000-0000-4000-8000-000000146202',
 'TASK146-BATCH-146202','TASK146-BATCH-146202','sha256:'||repeat('a',64),1,1,'accepted');
insert into public.pos_sales (pos_sale_id,pos_sales_sync_batch_id,shop_id,shop_code,shop_device_id,staff_id,pos_session_id,
 client_sale_id,idempotency_key,payload_hash,sale_number,occurred_at,business_date,currency,
 subtotal,discount_total,tax_total,total,status,business_kind,gross_amount_clp,discount_amount_clp,net_amount_clp,fiscal_status,created_at,updated_at)
values ('80000000-0000-4000-8000-000000146201','70000000-0000-4000-8000-000000146201','10000000-0000-4000-8000-000000000201','TASK146','40000000-0000-4000-8000-000000146201','30000000-0000-4000-8000-000000146201','60000000-0000-4000-8000-000000146201',
 'TASK146-SALE-146201','TASK146-SALE-146201','sha256:'||repeat('b',64),'TASK146-SALE-146201',
 '2026-08-01T12:00:00.123456Z','2026-08-01','CLP',11.49,1.49,0,9.49,'accepted','sale',100,0,100,'not_required','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z');
insert into public.shop_devices (shop_device_id,shop_id,device_identifier,device_type,display_name,status,revoked_at) values
 ('40000000-0000-4000-8000-000000146203','10000000-0000-4000-8000-000000000201','TASK146-PENDING','mobile','TASK146 pending','pending',null),
 ('40000000-0000-4000-8000-000000146204','10000000-0000-4000-8000-000000000201','TASK146-REVOKED','mobile','TASK146 revoked','revoked',now()),
 ('40000000-0000-4000-8000-000000146205','10000000-0000-4000-8000-000000000201','TASK146-SUSPICIOUS','mobile','TASK146 suspicious','suspicious',null),
 ('40000000-0000-4000-8000-000000146206','10000000-0000-4000-8000-000000000201','TASK146-ACTIVE-REVOKED','mobile','TASK146 inconsistent active','active',now());

-- A01-A03 exact API and effective ACL, not merely JWT claim-role simulation.
select has_function('public','mobile_sales_read_v1',array['uuid','text','text','date','date','integer','timestamp with time zone','uuid','text','text','text','uuid','uuid','text','uuid'],
 'mobile sales wrapper has the exact fifteen-argument signature');
select function_privs_are('public','mobile_sales_read_v1',array['uuid','text','text','date','date','integer','timestamp with time zone','uuid','text','text','text','uuid','uuid','text','uuid'],
 'authenticated',array['EXECUTE'],'authenticated can execute the mobile sales wrapper');
select ok(not has_function_privilege('anon','public.mobile_sales_read_v1(uuid,text,text,date,date,integer,timestamptz,uuid,text,text,text,uuid,uuid,text,uuid)','EXECUTE')
 and not has_function_privilege('service_role','public.mobile_sales_read_v1(uuid,text,text,date,date,integer,timestamptz,uuid,text,text,text,uuid,uuid,text,uuid)','EXECUTE')
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where p.oid='public.mobile_sales_read_v1(uuid,text,text,date,date,integer,timestamptz,uuid,text,text,text,uuid,uuid,text,uuid)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'),
 'anonymous, service_role and PUBLIC cannot execute the mobile sales wrapper');

-- A04 real SQL anon execution privilege is denied before any function body.
set local role anon;
select throws_ok($sql$select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000201'::uuid, p_device_identifier=>'TASK146-DEVICE-146201', p_action=>'summary')$sql$,'42501',null,'SQL anon role cannot invoke the mobile sales wrapper');
set local role postgres;

-- A05 real authenticated SQL role, absent subject: no personal authority.
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select is((select jsonb_build_array(r->>'code',r->'data') from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000201'::uuid, p_device_identifier=>'TASK146-DEVICE-146201', p_action=>'summary') r) x),
 '["unauthenticated",null]'::jsonb,'authenticated caller without a personal subject is unauthenticated');
set local role postgres;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000201',true);

-- A06 shop_owner positive authority on all four actions.
update public.shop_members set role_key='shop_owner' where profile_id='00000000-0000-4000-8000-000000000201' and shop_id='10000000-0000-4000-8000-000000000201';
set local role authenticated;
select results_eq(
 $actual$
 select a.action, r.value->>'code', r.value->'data'<>'null'::jsonb and r.value#>>'{capability,access_policy}'='online_only' from (values ('detail'),('filter'),('page'),('summary')) a(action) cross join lateral (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000201'::uuid, p_device_identifier=>'TASK146-DEVICE-146201', p_action=>a.action, p_from_date=>case when a.action<>'detail' then date '2026-08-01' end, p_to_date=>case when a.action<>'detail' then date '2026-08-03' end, p_pos_sale_id=>case when a.action='detail' then '80000000-0000-4000-8000-000000146201'::uuid end) as value) r order by a.action
 $actual$,
 $expected$
 select * from (values ('detail','ok',true), ('filter','ok',true), ('page','ok',true), ('summary','ok',true)) expected order by 1
 $expected$,
 'active shop_owner can use all four mobile sales actions'
);
set local role postgres;

-- A06 shop_manager positive authority on all four actions.
update public.shop_members set role_key='shop_manager' where profile_id='00000000-0000-4000-8000-000000000201' and shop_id='10000000-0000-4000-8000-000000000201';
set local role authenticated;
select results_eq(
 $actual$
 select a.action, r.value->>'code', r.value->'data'<>'null'::jsonb and r.value#>>'{capability,access_policy}'='online_only' from (values ('detail'),('filter'),('page'),('summary')) a(action) cross join lateral (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000201'::uuid, p_device_identifier=>'TASK146-DEVICE-146201', p_action=>a.action, p_from_date=>case when a.action<>'detail' then date '2026-08-01' end, p_to_date=>case when a.action<>'detail' then date '2026-08-03' end, p_pos_sale_id=>case when a.action='detail' then '80000000-0000-4000-8000-000000146201'::uuid end) as value) r order by a.action
 $actual$,
 $expected$
 select * from (values ('detail','ok',true), ('filter','ok',true), ('page','ok',true), ('summary','ok',true)) expected order by 1
 $expected$,
 'active shop_manager can use all four mobile sales actions'
);
set local role postgres;

-- A06 viewer positive authority on all four actions.
update public.shop_members set role_key='viewer' where profile_id='00000000-0000-4000-8000-000000000201' and shop_id='10000000-0000-4000-8000-000000000201';
set local role authenticated;
select results_eq(
 $actual$
 select a.action, r.value->>'code', r.value->'data'<>'null'::jsonb and r.value#>>'{capability,access_policy}'='online_only' from (values ('detail'),('filter'),('page'),('summary')) a(action) cross join lateral (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000201'::uuid, p_device_identifier=>'TASK146-DEVICE-146201', p_action=>a.action, p_from_date=>case when a.action<>'detail' then date '2026-08-01' end, p_to_date=>case when a.action<>'detail' then date '2026-08-03' end, p_pos_sale_id=>case when a.action='detail' then '80000000-0000-4000-8000-000000146201'::uuid end) as value) r order by a.action
 $actual$,
 $expected$
 select * from (values ('detail','ok',true), ('filter','ok',true), ('page','ok',true), ('summary','ok',true)) expected order by 1
 $expected$,
 'active viewer can use all four mobile sales actions'
);
set local role postgres;

-- A07 foreign-shop denial.
select results_eq(
 $actual$
 select a.action, r.value->>'code', r.value->'data'='null'::jsonb and not (r.value?'scope') from (values ('detail'),('filter'),('page'),('summary')) a(action) cross join lateral (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000202'::uuid, p_device_identifier=>'TASK146-DEVICE-146202', p_action=>a.action, p_from_date=>case when a.action<>'detail' then date '2026-08-01' end, p_to_date=>case when a.action<>'detail' then date '2026-08-03' end, p_pos_sale_id=>case when a.action='detail' then '80000000-0000-4000-8000-000000146201'::uuid end) as value) r order by a.action
 $actual$,
 $expected$
 select * from (values ('detail','permission_denied',true), ('filter','permission_denied',true), ('page','permission_denied',true), ('summary','permission_denied',true)) expected order by 1
 $expected$,
 'mobile sales cannot cross the caller shop'
);

-- A08
update public.profiles set profile_status='disabled',disabled_at=now() where profile_id='00000000-0000-4000-8000-000000000201';
select results_eq(
 $actual$
 select a.action, r.value->>'code', r.value->'data'='null'::jsonb and not (r.value?'scope') from (values ('detail'),('filter'),('page'),('summary')) a(action) cross join lateral (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000201'::uuid, p_device_identifier=>'TASK146-DEVICE-146201', p_action=>a.action, p_from_date=>case when a.action<>'detail' then date '2026-08-01' end, p_to_date=>case when a.action<>'detail' then date '2026-08-03' end, p_pos_sale_id=>case when a.action='detail' then '80000000-0000-4000-8000-000000146201'::uuid end) as value) r order by a.action
 $actual$,
 $expected$
 select * from (values ('detail','permission_denied',true), ('filter','permission_denied',true), ('page','permission_denied',true), ('summary','permission_denied',true)) expected order by 1
 $expected$,
 'disabled personal profile immediately denies mobile sales'
);
update public.profiles set profile_status='active',disabled_at=null where profile_id='00000000-0000-4000-8000-000000000201';

-- A09
update public.shop_members set membership_status='suspended',suspended_at=now() where profile_id='00000000-0000-4000-8000-000000000201' and shop_id='10000000-0000-4000-8000-000000000201';
select results_eq(
 $actual$
 select a.action, r.value->>'code', r.value->'data'='null'::jsonb and not (r.value?'scope') from (values ('detail'),('filter'),('page'),('summary')) a(action) cross join lateral (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000201'::uuid, p_device_identifier=>'TASK146-DEVICE-146201', p_action=>a.action, p_from_date=>case when a.action<>'detail' then date '2026-08-01' end, p_to_date=>case when a.action<>'detail' then date '2026-08-03' end, p_pos_sale_id=>case when a.action='detail' then '80000000-0000-4000-8000-000000146201'::uuid end) as value) r order by a.action
 $actual$,
 $expected$
 select * from (values ('detail','permission_denied',true), ('filter','permission_denied',true), ('page','permission_denied',true), ('summary','permission_denied',true)) expected order by 1
 $expected$,
 'suspended membership immediately denies mobile sales'
);
update public.shop_members set membership_status='active',suspended_at=null where profile_id='00000000-0000-4000-8000-000000000201' and shop_id='10000000-0000-4000-8000-000000000201';

-- A10
update public.shops set shop_status='suspended',suspended_at=now(),suspended_by_profile_id='00000000-0000-4000-8000-000000000202' where shop_id='10000000-0000-4000-8000-000000000201';
select results_eq(
 $actual$
 select a.action, r.value->>'code', r.value->'data'='null'::jsonb and not (r.value?'scope') from (values ('detail'),('filter'),('page'),('summary')) a(action) cross join lateral (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000201'::uuid, p_device_identifier=>'TASK146-DEVICE-146201', p_action=>a.action, p_from_date=>case when a.action<>'detail' then date '2026-08-01' end, p_to_date=>case when a.action<>'detail' then date '2026-08-03' end, p_pos_sale_id=>case when a.action='detail' then '80000000-0000-4000-8000-000000146201'::uuid end) as value) r order by a.action
 $actual$,
 $expected$
 select * from (values ('detail','permission_denied',true), ('filter','permission_denied',true), ('page','permission_denied',true), ('summary','permission_denied',true)) expected order by 1
 $expected$,
 'suspended shop immediately denies mobile sales'
);
update public.shops set shop_status='active',suspended_at=null,suspended_by_profile_id=null where shop_id='10000000-0000-4000-8000-000000000201';

-- A11 a well-formed but unregistered device.
select results_eq(
 $actual$
 select a.action, r.value->>'code', r.value->'data'='null'::jsonb and not (r.value?'scope') from (values ('detail'),('filter'),('page'),('summary')) a(action) cross join lateral (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000201'::uuid, p_device_identifier=>'TASK146-DEVICE-UNKNOWN', p_action=>a.action, p_from_date=>case when a.action<>'detail' then date '2026-08-01' end, p_to_date=>case when a.action<>'detail' then date '2026-08-03' end, p_pos_sale_id=>case when a.action='detail' then '80000000-0000-4000-8000-000000146201'::uuid end) as value) r order by a.action
 $actual$,
 $expected$
 select * from (values ('detail','device_not_authorized',true), ('filter','device_not_authorized',true), ('page','device_not_authorized',true), ('summary','device_not_authorized',true)) expected order by 1
 $expected$,
 'unknown registered device immediately denies mobile sales'
);

-- A12 every inactive status, with all four valid action shapes.
select results_eq(
 $actual$
 select d.status||':'||a.action, r.value->>'code', r.value->'data'='null'::jsonb and not (r.value?'scope') from (values ('detail'),('filter'),('page'),('summary')) a(action) cross join (values ('pending','TASK146-PENDING'),('revoked','TASK146-REVOKED'),('suspicious','TASK146-SUSPICIOUS')) d(status,identifier) cross join lateral (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000201'::uuid, p_device_identifier=>d.identifier, p_action=>a.action, p_from_date=>case when a.action<>'detail' then date '2026-08-01' end, p_to_date=>case when a.action<>'detail' then date '2026-08-03' end, p_pos_sale_id=>case when a.action='detail' then '80000000-0000-4000-8000-000000146201'::uuid end) as value) r order by d.status,a.action
 $actual$,
 $expected$
 select d.status||':'||a.action,'device_not_authorized'::text,true from (values ('pending'),('revoked'),('suspicious')) d(status) cross join (values ('detail'),('filter'),('page'),('summary')) a(action) order by d.status,a.action
 $expected$,
 'pending revoked and suspicious devices deny every mobile sales action'
);

-- A13 active status cannot override non-null revoked_at.
select results_eq(
 $actual$
 select a.action, r.value->>'code', r.value->'data'='null'::jsonb and not (r.value?'scope') from (values ('detail'),('filter'),('page'),('summary')) a(action) cross join lateral (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000201'::uuid, p_device_identifier=>'TASK146-ACTIVE-REVOKED', p_action=>a.action, p_from_date=>case when a.action<>'detail' then date '2026-08-01' end, p_to_date=>case when a.action<>'detail' then date '2026-08-03' end, p_pos_sale_id=>case when a.action='detail' then '80000000-0000-4000-8000-000000146201'::uuid end) as value) r order by a.action
 $actual$,
 $expected$
 select * from (values ('detail','device_not_authorized',true), ('filter','device_not_authorized',true), ('page','device_not_authorized',true), ('summary','device_not_authorized',true)) expected order by 1
 $expected$,
 'revoked active device immediately denies mobile sales'
);

-- A14 foreign device is not shop A authority.
select results_eq(
 $actual$
 select a.action, r.value->>'code', r.value->'data'='null'::jsonb and not (r.value?'scope') from (values ('detail'),('filter'),('page'),('summary')) a(action) cross join lateral (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000201'::uuid, p_device_identifier=>'TASK146-DEVICE-146202', p_action=>a.action, p_from_date=>case when a.action<>'detail' then date '2026-08-01' end, p_to_date=>case when a.action<>'detail' then date '2026-08-03' end, p_pos_sale_id=>case when a.action='detail' then '80000000-0000-4000-8000-000000146201'::uuid end) as value) r order by a.action
 $actual$,
 $expected$
 select * from (values ('detail','device_not_authorized',true), ('filter','device_not_authorized',true), ('page','device_not_authorized',true), ('summary','device_not_authorized',true)) expected order by 1
 $expected$,
 'device registered to another shop cannot authorize mobile sales'
);

-- A15 valid device credentials cannot supply an absent personal membership.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000202',true);
select results_eq(
 $actual$
 select a.action, r.value->>'code', r.value->'data'='null'::jsonb and not (r.value?'scope') from (values ('detail'),('filter'),('page'),('summary')) a(action) cross join lateral (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000201'::uuid, p_device_identifier=>'TASK146-DEVICE-146201', p_action=>a.action, p_from_date=>case when a.action<>'detail' then date '2026-08-01' end, p_to_date=>case when a.action<>'detail' then date '2026-08-03' end, p_pos_sale_id=>case when a.action='detail' then '80000000-0000-4000-8000-000000146201'::uuid end) as value) r order by a.action
 $actual$,
 $expected$
 select * from (values ('detail','permission_denied',true), ('filter','permission_denied',true), ('page','permission_denied',true), ('summary','permission_denied',true)) expected order by 1
 $expected$,
 'device credentials cannot replace a personal shop membership'
);

select * from finish();
rollback;
