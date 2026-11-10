begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(31);

select has_function('public','staff_web_shop_profile_read_v1',array['uuid','uuid','uuid','text','integer','text'],'ASUS019 dedicated profile reader exists');
select ok(not has_function_privilege('anon','public.staff_web_shop_profile_read_v1(uuid,uuid,uuid,text,integer,text)','EXECUTE'),'anonymous cannot execute');
select ok(not has_function_privilege('authenticated','public.staff_web_shop_profile_read_v1(uuid,uuid,uuid,text,integer,text)','EXECUTE'),'personal API token cannot impersonate staff');
select ok(has_function_privilege('service_role','public.staff_web_shop_profile_read_v1(uuid,uuid,uuid,text,integer,text)','EXECUTE'),'server has named RPC access');

insert into public.shops(shop_id,shop_code,shop_name,shop_status) values
 ('10000000-0000-4000-8000-000000001019','ASUS019FIXTURE','Synthetic ASUS019','active'),
 ('10000000-0000-4000-8000-000000002019','ASUS019OTHER','Synthetic other shop','active');
insert into public.staff_accounts(staff_id,shop_id,staff_code,display_name,role_key,status,credential_kind,
 credential_hash,credential_updated_at,credential_expires_at,must_change_credential,credential_version,credential_status)
values('20000000-0000-4000-8000-000000001019','10000000-0000-4000-8000-000000001019','1001',
 'Synthetic admin','pos_admin','active','password','argon2id:synthetic-not-a-login',clock_timestamp(),clock_timestamp()+interval '1 hour',false,7,'active');
insert into public.staff_role_permissions(shop_id,role_key,permission_key,enabled) values
 ('10000000-0000-4000-8000-000000001019','pos_admin','shop_admin.full_access',true),
 ('10000000-0000-4000-8000-000000001019','manager','settings.read',true)
on conflict(shop_id,role_key,permission_key) do update set enabled=true;
insert into public.staff_web_sessions(staff_web_session_id,shop_id,staff_id,session_token_hash,staff_credential_version,status,issued_at,expires_at)
values('30000000-0000-4000-8000-000000001019','10000000-0000-4000-8000-000000001019',
 '20000000-0000-4000-8000-000000001019','sha256:'||repeat('a',64),7,'active',now()-interval '1 minute',now()+interval '1 hour');
create function pg_temp.profile(p_op text default 'overview',
 p_shop uuid default '10000000-0000-4000-8000-000000001019',
 p_staff uuid default '20000000-0000-4000-8000-000000001019',
 p_session uuid default '30000000-0000-4000-8000-000000001019',
 p_hash text default 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
 p_version integer default 7)
returns jsonb language sql security invoker as $$
 select public.staff_web_shop_profile_read_v1(p_shop,p_staff,p_session,p_hash,p_version,p_op);
$$;
set local role service_role;
select is(pg_temp.profile()->>'code','success','active provisioned role reads overview');
select is(pg_temp.profile('settings')->>'code','success','settings read works');
select is(pg_temp.profile('members')->>'code','success','full scoped role reads memberships');
select is(pg_temp.profile()->>'shop_id','10000000-0000-4000-8000-000000001019','response is shop bound');
select is(pg_temp.profile()->>'actor_staff_id','20000000-0000-4000-8000-000000001019','response is actor bound');
select is(pg_temp.profile()->>'staff_web_session_id','30000000-0000-4000-8000-000000001019','response is exact-session bound');
select ok(not ((pg_temp.profile()->'shop') ? 'credential_hash'),'profile never exposes credential material');
select is(jsonb_array_length(pg_temp.profile('members')->'members'),0,'authorized empty memberships remains an empty list');
select is(pg_temp.profile('unrecognized')->>'code','validation_failed','unknown read operation rejected');
select is(pg_temp.profile(p_shop=>'10000000-0000-4000-8000-000000002019')->>'code','permission_denied','another shop rejected');
select is(pg_temp.profile(p_staff=>'20000000-0000-4000-8000-000000002019')->>'code','permission_denied','another actor rejected');
select is(pg_temp.profile(p_session=>'30000000-0000-4000-8000-000000002019')->>'code','permission_denied','another session rejected');
select is(pg_temp.profile(p_hash=>'sha256:'||repeat('b',64))->>'code','permission_denied','wrong hash rejected');
select is(pg_temp.profile(p_version=>8)->>'code','permission_denied','stale credential version rejected');
select is(pg_temp.profile(p_hash=>null)->>'code','permission_denied','missing hash is not SQL-null authorization');
set local role postgres;
update public.staff_accounts set status='suspended' where staff_id='20000000-0000-4000-8000-000000001019';
set local role service_role;
select is(pg_temp.profile()->>'code','permission_denied','revoked initial1001 is not automatically promoted');
set local role postgres;
update public.staff_accounts set status='active',must_change_credential=true where staff_id='20000000-0000-4000-8000-000000001019';
set local role service_role;
select is(pg_temp.profile()->>'code','permission_denied','mandatory credential change blocks read');
set local role postgres;
update public.staff_accounts set must_change_credential=false,credential_status='locked',locked_until=now()+interval '1 hour' where staff_id='20000000-0000-4000-8000-000000001019';
set local role service_role;
select is(pg_temp.profile()->>'code','permission_denied','locked credential blocks read');
set local role postgres;
update public.staff_accounts set credential_status='active',locked_until=null,web_access_revoked_at=clock_timestamp() where staff_id='20000000-0000-4000-8000-000000001019';
set local role service_role;
select is(pg_temp.profile()->>'code','permission_denied','web revocation blocks same session');
set local role postgres;
update public.staff_accounts set web_access_revoked_at=null where staff_id='20000000-0000-4000-8000-000000001019';
update public.staff_web_sessions set status='revoked',revoked_at=clock_timestamp() where staff_web_session_id='30000000-0000-4000-8000-000000001019';
set local role service_role;
select is(pg_temp.profile()->>'code','permission_denied','revoked session rejected');
set local role postgres;
update public.staff_web_sessions set status='active',revoked_at=null,expires_at=clock_timestamp()-interval '1 second' where staff_web_session_id='30000000-0000-4000-8000-000000001019';
set local role service_role;
select is(pg_temp.profile()->>'code','permission_denied','expired session rejected');
set local role postgres;
update public.staff_web_sessions set expires_at=clock_timestamp()+interval '1 hour' where staff_web_session_id='30000000-0000-4000-8000-000000001019';
update public.shops set shop_status='pending_setup' where shop_id='10000000-0000-4000-8000-000000001019';
set local role service_role;
select is(pg_temp.profile()->>'code','permission_denied','inactive shop rejected');
set local role postgres;
update public.shops set shop_status='active' where shop_id='10000000-0000-4000-8000-000000001019';
update public.staff_accounts set staff_code='1002' where staff_id='20000000-0000-4000-8000-000000001019';
set local role service_role;
select is(pg_temp.profile()->>'code','success','same actual role works with code1002');
set local role postgres;
update public.staff_accounts set role_key='manager' where staff_id='20000000-0000-4000-8000-000000001019';
set local role service_role;
select is(pg_temp.profile()->>'code','success','granular manager read is supported');
select is(pg_temp.profile('members')->>'code','permission_denied','granular reader cannot acquire full membership access');
set local role postgres;
update public.staff_role_permissions set enabled=false where shop_id='10000000-0000-4000-8000-000000001019' and role_key='manager' and permission_key='settings.read';
set local role service_role;
select is(pg_temp.profile()->>'code','permission_denied','permission removal affects current session immediately');
set local role postgres;
select ok(exists(select 1 from public.audit_logs where actor_staff_id='20000000-0000-4000-8000-000000001019' and shop_id='10000000-0000-4000-8000-000000001019' and event_key='shop.profile.staff_read'),'successful reads record the distinct staff actor');
select * from finish();
rollback;
