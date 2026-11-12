begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select has_function('public','pos_runtime_first_login_commit_v4',
 array['uuid','uuid','integer','text','text','text','text','integer','text','integer','integer','text','jsonb'],
 'Persistent POS has a separate negotiated first-login boundary');
select ok(has_function_privilege('service_role','public.pos_runtime_first_login_commit_v4(uuid,uuid,integer,text,text,text,text,integer,text,integer,integer,text,jsonb)','execute'),
 'The existing service principal can issue the negotiated grant');
select ok(not has_function_privilege('anon','public.pos_runtime_first_login_commit_v4(uuid,uuid,integer,text,text,text,text,integer,text,integer,integer,text,jsonb)','execute'),
 'Anonymous clients cannot issue grants');
select ok(not has_function_privilege('authenticated','public.pos_runtime_first_login_commit_v4(uuid,uuid,integer,text,text,text,text,integer,text,integer,integer,text,jsonb)','execute'),
 'An unrelated authenticated user cannot issue grants');

insert into public.shops(shop_id,shop_code,shop_name,shop_status)
values('10000000-0000-4000-8000-000000990019','ASUS019PERM','Synthetic persistent POS','active');
insert into public.staff_accounts(staff_id,shop_id,staff_code,display_name,role_key,status,
 credential_kind,credential_hash,credential_updated_at,credential_expires_at,must_change_credential,credential_version,credential_status)
values('20000000-0000-4000-8000-000000990019','10000000-0000-4000-8000-000000990019',
 'POS019','Synthetic operator','pos_admin','active','password','argon2id:synthetic-only',clock_timestamp(),null,false,7,'active');
create temporary table asus019_grants(label text primary key,result jsonb not null);
grant select,insert,update on asus019_grants to service_role;

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into asus019_grants values('wrong-version',public.pos_runtime_first_login_commit_v4(
 '10000000-0000-4000-8000-000000990019','20000000-0000-4000-8000-000000990019',8,
 'persistent-device','Synthetic device','qa','sha256:'||repeat('1',64),15552000,
 'sha256:'||repeat('2',64),43200,43200,'persistent-pos-v1','{}'));
select ok((select result->>'ok' is distinct from 'true' from asus019_grants where label='wrong-version'),
 'Credential-version mismatch cannot obtain persistent authority');
insert into asus019_grants values('persistent',public.pos_runtime_first_login_commit_v4(
 '10000000-0000-4000-8000-000000990019','20000000-0000-4000-8000-000000990019',7,
 'persistent-device','Synthetic device','qa','sha256:'||repeat('1',64),15552000,
 'sha256:'||repeat('2',64),43200,43200,'persistent-pos-v1','{}'));
select is((select result->>'code' from asus019_grants where label='persistent'),'success',
 'Valid first login issues the persistent grant atomically');
select is((select result->>'localAuthorizationPolicy' from asus019_grants where label='persistent'),'persistent-pos-v1',
 'The server explicitly acknowledges the negotiated policy');
select is((select result->>'sessionExpiresAt' from asus019_grants where label='persistent'),
 '9999-12-31T23:59:59.999999Z','No ordinary POS deadline is encoded as a portable finite UTC value');
select is((select result->>'effectiveOfflineAuthorizationExpiresAt' from asus019_grants where label='persistent'),
 '9999-12-31T23:59:59.999999Z','Offline authority has the same persistent contract');

set local role postgres;
select is((select count(*)::integer from public.pos_sessions where shop_id='10000000-0000-4000-8000-000000990019'),1,
 'The rejected version did not create an extra session');
select ok(app_private.pos_runtime_lease_is_valid_v1(
 '10000000-0000-4000-8000-000000990019',(select (result->>'shopDeviceId')::uuid from asus019_grants where label='persistent'),
 '20000000-0000-4000-8000-000000990019',(select (result->>'posSessionId')::uuid from asus019_grants where label='persistent')),
 'The canonical runtime and publication fences accept the issued grant');
select ok(exists(select 1 from public.pos_device_credentials where
 pos_device_credential_id=(select (result->>'posDeviceCredentialId')::uuid from asus019_grants where label='persistent')
 and offline_authorization_invalidated_at is null and expires_at='9999-12-31 23:59:59.999999+00'::timestamptz),
 'Expiry-change invalidation is followed by explicit reissuance in the same transaction');

set local role service_role;
insert into asus019_grants select 'heartbeat',public.pos_runtime_heartbeat_touch_v1(
 '10000000-0000-4000-8000-000000990019',(result->>'shopDeviceId')::uuid,
 '20000000-0000-4000-8000-000000990019',(result->>'posSessionId')::uuid,
 clock_timestamp()+interval '1 hour','qa') from asus019_grants where label='persistent';
select ok((select (result->>'ok')::boolean from asus019_grants where label='heartbeat'),
 'The ordinary heartbeat remains usable');
select is((select (result->>'expiresAt')::timestamptz from asus019_grants where label='heartbeat'),
 '9999-12-31 23:59:59.999999+00'::timestamptz,'Heartbeat does not turn persistent authority back into an hourly lease');

insert into asus019_grants values('legacy',public.pos_runtime_first_login_commit_v3(
 '10000000-0000-4000-8000-000000990019','20000000-0000-4000-8000-000000990019',7,
 'legacy-device','Synthetic legacy device','qa','sha256:'||repeat('3',64),15552000,
 'sha256:'||repeat('4',64),43200,43200,'pos-policy-v1','{}'));
select ok((select (result->>'sessionExpiresAt')::timestamptz<=clock_timestamp()+interval '12 hours'
 from asus019_grants where label='legacy'),'Legacy issuance still obeys its original limit');
set local role postgres;
update public.pos_sessions set expires_at=clock_timestamp()-interval '1 second'
 where pos_session_id=(select (result->>'posSessionId')::uuid from asus019_grants where label='legacy');
select ok(not app_private.pos_runtime_lease_is_valid_v1(
 '10000000-0000-4000-8000-000000990019',(select (result->>'shopDeviceId')::uuid from asus019_grants where label='legacy'),
 '20000000-0000-4000-8000-000000990019',(select (result->>'posSessionId')::uuid from asus019_grants where label='legacy')),
 'Expired legacy authority remains denied');

-- Fault only the promotion after V3, to prove the outer boundary rolls back
-- base credential/session issuance rather than leaving a partially issued grant.
create function pg_temp.asus019_fail_promotion() returns trigger language plpgsql as $$
begin
 if new.offline_authorization_policy_version='persistent-pos-v1'
   and new.expires_at>'9000-01-01'::timestamptz then raise exception 'synthetic promotion fault';end if;
 return new;
end;$$;
create trigger asus019_synthetic_promotion_fault before update on public.pos_sessions
 for each row execute function pg_temp.asus019_fail_promotion();
set local role service_role;
insert into asus019_grants values('fault',public.pos_runtime_first_login_commit_v4(
 '10000000-0000-4000-8000-000000990019','20000000-0000-4000-8000-000000990019',7,
 'fault-device','Synthetic fault device','qa','sha256:'||repeat('5',64),15552000,
 'sha256:'||repeat('6',64),43200,43200,'persistent-pos-v1','{}'));
select ok((select result->>'ok' is distinct from 'true' from asus019_grants where label='fault'),
 'A failed promotion returns no authority');
set local role postgres;
drop trigger asus019_synthetic_promotion_fault on public.pos_sessions;
select is((select count(*)::integer from public.pos_sessions where shop_id='10000000-0000-4000-8000-000000990019'),2,
 'Failed promotion rolls back the base session issuance');
select is((select count(*)::integer from public.pos_device_credentials where shop_id='10000000-0000-4000-8000-000000990019'),2,
 'Failed promotion rolls back the base credential issuance');

update public.pos_sessions set offline_authorization_invalidated_at=clock_timestamp()
 where pos_session_id=(select (result->>'posSessionId')::uuid from asus019_grants where label='persistent');
select ok(not app_private.pos_runtime_lease_is_valid_v1(
 '10000000-0000-4000-8000-000000990019',(select (result->>'shopDeviceId')::uuid from asus019_grants where label='persistent'),
 '20000000-0000-4000-8000-000000990019',(select (result->>'posSessionId')::uuid from asus019_grants where label='persistent')),
 'Explicit session authority invalidation still stops a persistent principal');
update public.pos_sessions set offline_authorization_invalidated_at=null
 where pos_session_id=(select (result->>'posSessionId')::uuid from asus019_grants where label='persistent');
update public.pos_device_credentials set offline_authorization_invalidated_at=clock_timestamp()
 where pos_device_credential_id=(select (result->>'posDeviceCredentialId')::uuid from asus019_grants where label='persistent');
select ok(not app_private.pos_runtime_lease_is_valid_v1(
 '10000000-0000-4000-8000-000000990019',(select (result->>'shopDeviceId')::uuid from asus019_grants where label='persistent'),
 '20000000-0000-4000-8000-000000990019',(select (result->>'posSessionId')::uuid from asus019_grants where label='persistent')),
 'Explicit credential authority invalidation still stops a persistent principal');
update public.pos_device_credentials set offline_authorization_invalidated_at=null
 where pos_device_credential_id=(select (result->>'posDeviceCredentialId')::uuid from asus019_grants where label='persistent');
update public.staff_accounts set credential_version=8 where staff_id='20000000-0000-4000-8000-000000990019';
select ok(not app_private.pos_runtime_lease_is_valid_v1(
 '10000000-0000-4000-8000-000000990019',(select (result->>'shopDeviceId')::uuid from asus019_grants where label='persistent'),
 '20000000-0000-4000-8000-000000990019',(select (result->>'posSessionId')::uuid from asus019_grants where label='persistent')),
 'A changed staff credential version cannot reuse the persistent grant');

-- A deliberate staff deadline is still an authority cap, never silently
-- converted to the ordinary no-deadline sentinel.
set local role postgres;
update public.staff_accounts set credential_expires_at=clock_timestamp()+interval '3 hours'
 where staff_id='20000000-0000-4000-8000-000000990019';
set local role service_role;
insert into asus019_grants values('staff-cap',public.pos_runtime_first_login_commit_v4(
 '10000000-0000-4000-8000-000000990019','20000000-0000-4000-8000-000000990019',8,
 'staff-cap-device','Synthetic capped device','qa','sha256:'||repeat('7',64),15552000,
 'sha256:'||repeat('8',64),43200,43200,'persistent-pos-v1','{}'));
select ok((select (result->>'ok')::boolean from asus019_grants where label='staff-cap'),
 'An operator with an explicit credential deadline can still sign in');
set local role postgres;
select is((select (result->>'sessionExpiresAt')::timestamptz from asus019_grants where label='staff-cap'),
 (select credential_expires_at from public.staff_accounts where staff_id='20000000-0000-4000-8000-000000990019'),
 'An explicit staff credential deadline caps the negotiated session');
select is((select (result->>'effectiveOfflineAuthorizationExpiresAt')::timestamptz from asus019_grants where label='staff-cap'),
 (select credential_expires_at from public.staff_accounts where staff_id='20000000-0000-4000-8000-000000990019'),
 'The capped receipt cannot declare permanent local authority');

select * from finish();
rollback;
