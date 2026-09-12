begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',('00000000-0000-4000-8000-00000000100'||i)::uuid,
  'authenticated','authenticated','wechat010-'||i||'@example.invalid','{}','{}',now(),now() from generate_series(1,3) i;
update public.profiles set profile_status='active',disabled_at=null,display_name='WECHAT010 isolated personal account'
  where profile_id in ('00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000001003');
insert into auth.sessions(id,user_id,created_at,updated_at,not_after)
values ('10000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001001',now(),now(),now()+interval '1 hour'),
 ('10000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000001002',now(),now(),now()+interval '1 hour');
insert into public.shops(shop_id,shop_code,shop_name,shop_status,created_by_profile_id)
values ('20000000-0000-4000-8000-000000001001','WECHAT010LOCAL','WECHAT010 isolated shop','active','00000000-0000-4000-8000-000000001001');
insert into public.shop_members(profile_id,shop_id,role_key,membership_status)
values ('00000000-0000-4000-8000-000000001001','20000000-0000-4000-8000-000000001001','shop_owner','active'),
 ('00000000-0000-4000-8000-000000001002','20000000-0000-4000-8000-000000001001','viewer','active');

insert into public.shop_devices(shop_device_id,shop_id,device_identifier,device_type,display_name,status)
values ('30000000-0000-4000-8000-000000001001','20000000-0000-4000-8000-000000001001','10000000-0000-4000-8000-000000001001','mobile','WECHAT010 local device','active');

create function pg_temp.admin_context(p_actor integer default 1) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000100'||p_actor,true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub','00000000-0000-4000-8000-00000000100'||p_actor,
    'session_id','10000000-0000-4000-8000-00000000100'||p_actor)::text,true);
end;
$$;
create function pg_temp.service_context() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.role','',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
end;
$$;
create function pg_temp.proof(p_purpose text,p_identity text default 'a',p_pair uuid default null,p_device text default 'd',p_transfer text default 'a') returns uuid language plpgsql as $$
declare v uuid;
begin
  perform pg_temp.service_context();
  v:=(public.wechat_mini_proof_create_v1('wx0000000000000001',repeat('b',64),repeat(p_device,64),p_purpose,p_pair,
    case when p_purpose='pair_claim' then repeat(p_transfer,64) else null end)->>'proof_id')::uuid;
  if not public.wechat_mini_proof_claim_v1(v,'wx0000000000000001',repeat('b',64),repeat(p_device,64),encode(extensions.digest(v::text,'sha256'),'hex')) then raise exception 'claim failed'; end if;
  if not public.wechat_mini_proof_verify_v1(v,'wx0000000000000001',encode(extensions.digest(v::text,'sha256'),'hex'),'v1:'||repeat(p_identity,64)) then raise exception 'verify failed'; end if;
  return v;
end;
$$;

create function pg_temp.pair_again(p_actor integer,p_cap text) returns jsonb language plpgsql as $$
declare pair_id uuid; result jsonb; allowed uuid[]:=array[('00000000-0000-4000-8000-00000000100'||p_actor)::uuid];
begin
  perform pg_temp.admin_context(p_actor);
  pair_id:=(public.wechat_mini_pair_start_v1('wx0000000000000001',repeat(p_cap,64),repeat(p_cap,64),'22223333')->>'pairing_id')::uuid;
  perform pg_temp.service_context();
  result:=public.wechat_mini_pair_claim_v1(pg_temp.proof('pair_claim','a',null,'d',p_cap),repeat(p_cap,64),repeat(p_cap,64),allowed);
  if result->>'ok'<>'true' then return result;end if;
  perform pg_temp.admin_context(p_actor);
  perform public.wechat_mini_pair_admin_v1(pair_id,repeat(p_cap,64),'approve');
  perform pg_temp.service_context();
  return public.wechat_mini_pair_confirm_v1(pg_temp.proof('pair_confirm','a',pair_id),pair_id,repeat(p_cap,64),allowed);
end; $$;

select ok(not has_table_privilege('anon','app_private.wechat_mini_mappings','SELECT'),'anon cannot read mapping');
select ok(not has_table_privilege('authenticated','app_private.wechat_mini_pairings','INSERT'),'ordinary users cannot write pairing table');
select ok(not has_table_privilege('service_role','app_private.wechat_mini_proofs','SELECT'),'service RPC only, no table grant');
select ok(not has_function_privilege('anon','public.wechat_mini_direct_issue_v1(uuid,text,uuid[],text)','EXECUTE'),'anon cannot issue');
select ok(not has_function_privilege('authenticated','public.wechat_mini_direct_issue_v1(uuid,text,uuid[],text)','EXECUTE'),'authenticated cannot issue');
select ok(not has_function_privilege('authenticated','public.wechat_mini_business_v1(text,text,uuid[],uuid[],text,jsonb)','EXECUTE'),'authenticated cannot use Mini session gateway');
select ok(not has_function_privilege('service_role','public.wechat_mini_pair_admin_v1(uuid,text,text)','EXECUTE'),'service cannot approve Admin consent');

create temporary table results(name text primary key,value jsonb);
grant select,insert on results to service_role;
select pg_temp.admin_context();
insert into results values ('pair',public.wechat_mini_pair_start_v1('wx0000000000000001',repeat('a',64),repeat('b',64),'12345678'));
select is((select value->>'ok' from results where name='pair'),'true','real personal session starts pairing');
select is(public.wechat_mini_pair_admin_v1((select (value->>'pairing_id')::uuid from results where name='pair'),repeat('c',64),'status')->>'ok','false','wrong Admin capability denied');
select pg_temp.admin_context(2);
select is(public.wechat_mini_pair_admin_v1((select (value->>'pairing_id')::uuid from results where name='pair'),repeat('b',64),'approve')->>'ok','false','other account cannot approve');
select pg_temp.service_context();
insert into results values ('claim_proof',to_jsonb(pg_temp.proof('pair_claim')));
insert into results values ('claim',public.wechat_mini_pair_claim_v1((select (value#>>'{}')::uuid from results where name='claim_proof'),repeat('a',64),repeat('c',64),array['00000000-0000-4000-8000-000000001001']::uuid[]));
select is((select value->>'ok' from results where name='claim'),'true','first verified Mini proof fixes identity and device');
select is(public.wechat_mini_pair_claim_v1((select (value#>>'{}')::uuid from results where name='claim_proof'),repeat('a',64),repeat('e',64),array['00000000-0000-4000-8000-000000001001']::uuid[])->>'ok','false','claim replay cannot replace capability');
insert into results values ('confirm_proof',to_jsonb(pg_temp.proof('pair_confirm','a',(select (value->>'pairing_id')::uuid from results where name='pair'))));
select is(public.wechat_mini_pair_confirm_v1((select (value#>>'{}')::uuid from results where name='confirm_proof'),(select (value->>'pairing_id')::uuid from results where name='pair'),repeat('c',64),array['00000000-0000-4000-8000-000000001001']::uuid[])->>'ok','false','Mini consent without Admin consent cannot link');
select pg_temp.admin_context();
select is(public.wechat_mini_pair_admin_v1((select (value->>'pairing_id')::uuid from results where name='pair'),repeat('b',64),'approve')->>'state','approved','origin Admin session approves claimed context');
select pg_temp.service_context();
select is(public.wechat_mini_pair_confirm_v1((select (value#>>'{}')::uuid from results where name='confirm_proof'),(select (value->>'pairing_id')::uuid from results where name='pair'),repeat('e',64),array['00000000-0000-4000-8000-000000001001']::uuid[])->>'ok','false','wrong Mini capability denied');
select is(public.wechat_mini_pair_confirm_v1(pg_temp.proof('pair_confirm','b',(select (value->>'pairing_id')::uuid from results where name='pair')),(select (value->>'pairing_id')::uuid from results where name='pair'),repeat('c',64),array['00000000-0000-4000-8000-000000001001']::uuid[])->>'ok','false','different WeChat identity cannot replace claimed identity before final consent');
select is(public.wechat_mini_pair_confirm_v1((select (value#>>'{}')::uuid from results where name='confirm_proof'),(select (value->>'pairing_id')::uuid from results where name='pair'),repeat('c',64),array['00000000-0000-4000-8000-000000001001']::uuid[])->>'ok','true','both live consents atomically create application mapping');
select is((select count(*)::integer from auth.identities where provider='custom:wechat'),0,'no synthetic Supabase WeChat identity');
select is((select count(*)::integer from app_private.wechat_mini_mapping_audit where event='linked'),1,'mapping audit committed once');
select is(pg_temp.pair_again(1,'7')->>'ok','true','same identity and same canonical profile is idempotent after fresh dual consent');
select is((select count(*)::integer from app_private.wechat_mini_mappings),1,'idempotent pairing creates no duplicate mapping');
select is(pg_temp.pair_again(2,'8')->>'code','identity_conflict','same WeChat identity cannot link to a second canonical profile');
select is((select profile_id::text from app_private.wechat_mini_mappings),'00000000-0000-4000-8000-000000001001','collision never transfers ownership');
insert into results values ('login_proof',to_jsonb(pg_temp.proof('login')));
insert into results values ('session',public.wechat_mini_direct_issue_v1((select (value#>>'{}')::uuid from results where name='login_proof'),repeat('e',64),array['00000000-0000-4000-8000-000000001001']::uuid[],repeat('s',32)));
select is((select value->>'ok' from results where name='session'),'true','verified mapping issues opaque Mini session');
select is(public.wechat_mini_direct_issue_v1((select (value#>>'{}')::uuid from results where name='login_proof'),repeat('f',64),array['00000000-0000-4000-8000-000000001001']::uuid[],repeat('s',32))->>'ok','false','issue proof is one-use');
select is(public.wechat_mini_session_resolve_v1(repeat('e',64),repeat('d',64))->>'ok','true','active mapping session resolves');
select is(public.wechat_mini_session_resolve_v1(repeat('e',64),repeat('f',64))->>'ok','false','wrong device fails');
set local role service_role;
select is(auth.role(),'service_role','effective service request with only modern claims');
insert into results values ('checkpoint',public.wechat_mini_business_v1(repeat('e',64),repeat('d',64),array['00000000-0000-4000-8000-000000001001']::uuid[],array['20000000-0000-4000-8000-000000001001']::uuid[],
  'wechat_mini_sync_checkpoint_v1','{"p_shop_id":"20000000-0000-4000-8000-000000001001","p_device_identifier":"10000000-0000-4000-8000-000000001001","p_after_id":"0"}'));
select is((select value->>'schemaVersion' from results where name='checkpoint'),'wechat-mini-sync-checkpoint-v1','checkpoint survives both internal actor transitions with modern claims');
select is(auth.role(),'service_role','business wrapper restores original service claims');
select is(public.wechat_mini_business_v1(repeat('e',64),repeat('d',64),array['00000000-0000-4000-8000-000000001001']::uuid[],array['20000000-0000-4000-8000-000000001001']::uuid[],
  'wechat_mini_sync_delta_v1',jsonb_build_object('p_shop_id','20000000-0000-4000-8000-000000001001','p_device_identifier','10000000-0000-4000-8000-000000001001','p_after_id','0','p_limit',5,'p_expected_scope_key',(select value->>'scopeKey' from results where name='checkpoint'),'p_expected_event_max_id',(select value->>'eventMaxId' from results where name='checkpoint')))->>'schemaVersion','wechat-mini-sync-delta-v1','delta uses real service grants and modern claims');
set local role postgres;

select is(public.wechat_mini_business_v1(repeat('e',64),repeat('d',64),array['00000000-0000-4000-8000-000000001001']::uuid[],array['20000000-0000-4000-8000-000000001001']::uuid[],
  'read','{"p_rpc":"wechat_account_profile_v1","p_params":{}}')->0->>'mini_identity_provider','wechat-mini','profile DTO distinguishes application mapping');
select throws_ok($q$select public.wechat_mini_business_v1(repeat('e',64),repeat('d',64),array['00000000-0000-4000-8000-000000001001']::uuid[],array['20000000-0000-4000-8000-000000001001']::uuid[],
  'read','{"p_actor_profile_id":"00000000-0000-4000-8000-000000001002"}')$q$,'22023','wechat_mini_business_invalid','client actor injection denied');
select throws_ok($q$select public.wechat_mini_business_v1(repeat('e',64),repeat('d',64),array['00000000-0000-4000-8000-000000001001']::uuid[],array['20000000-0000-4000-8000-000000001001']::uuid[],
  'read','{"p_rpc":"wechat_catalog_page_v1","p_params":{"p_shop_id":"20000000-0000-4000-8000-000000001002"}}')$q$,'42501','wechat_shop_denied','cross-shop denied inside SQL');

set local role service_role;
select is(public.wechat_mini_business_v1(repeat('e',64),repeat('d',64),array['00000000-0000-4000-8000-000000001001']::uuid[],array['20000000-0000-4000-8000-000000001001']::uuid[], 'product_image_revalidate_access_v1','{"p_shop_id":"20000000-0000-4000-8000-000000001001","p_permission":"write"}'),'true'::jsonb,'owner Storage write is actually authorized');
set local role postgres;
update public.shop_members set role_key='viewer' where profile_id='00000000-0000-4000-8000-000000001001';
set local role service_role;
select is(public.wechat_mini_business_v1(repeat('e',64),repeat('d',64),array['00000000-0000-4000-8000-000000001001']::uuid[],array['20000000-0000-4000-8000-000000001001']::uuid[], 'product_image_revalidate_access_v1','{"p_shop_id":"20000000-0000-4000-8000-000000001001","p_permission":"write"}'),'false'::jsonb,'changed viewer role denies Storage writes without new login');
select is(public.wechat_mini_business_v1(repeat('e',64),repeat('d',64),array['00000000-0000-4000-8000-000000001001']::uuid[],array['20000000-0000-4000-8000-000000001001']::uuid[], 'wechat_catalog_mutate_v1','{"p_shop_id":"20000000-0000-4000-8000-000000001001","p_operation":"category_create","p_idempotency_key":"70000000-0000-4000-8000-000000001001","p_correlation_id":"70000000-0000-4000-8000-000000001002","p_payload":{"name":"Viewer denied"}}')->>'code','permission_denied','viewer mutation denied inside actual service SQL wrapper');
set local role postgres;
update public.shop_members set role_key='shop_owner' where profile_id='00000000-0000-4000-8000-000000001001';
update auth.users set banned_until=now()+interval '1 hour' where id='00000000-0000-4000-8000-000000001001';
select is(public.wechat_mini_session_resolve_v1(repeat('e',64),repeat('d',64))->>'ok','false','canonical Auth ban invalidates Mini session');
update auth.users set banned_until=null where id='00000000-0000-4000-8000-000000001001';
select pg_temp.admin_context();
insert into results values ('pending_pair',public.wechat_mini_pair_start_v1('wx0000000000000001',repeat('1',64),repeat('2',64),'87654321'));
select pg_temp.service_context();
insert into results values ('pending_proof',to_jsonb(pg_temp.proof('pair_claim','a',null,'d','1')));
select is(public.wechat_mini_pair_claim_v1((select (value#>>'{}')::uuid from results where name='pending_proof'),repeat('1',64),repeat('3',64),array['00000000-0000-4000-8000-000000001001']::uuid[])->>'ok','true','new pending pairing claims already-linked identity');
select pg_temp.admin_context();
select is(public.wechat_mini_pair_admin_v1((select (value->>'pairing_id')::uuid from results where name='pending_pair'),repeat('2',64),'approve')->>'state','approved','pending pairing approved before unlink');
select pg_temp.admin_context();
select is(public.wechat_mini_mapping_unlink_v1((select mapping_id from app_private.wechat_mini_mappings where profile_id='00000000-0000-4000-8000-000000001001')),true,'personal Admin unlink');
select pg_temp.service_context();
select is(public.wechat_mini_session_resolve_v1(repeat('e',64),repeat('d',64))->>'ok','false','unlink revokes mapping sessions');
select throws_ok($q$select public.wechat_mini_business_v1(repeat('e',64),repeat('d',64),array['00000000-0000-4000-8000-000000001001']::uuid[],array['20000000-0000-4000-8000-000000001001']::uuid[],
  'product_image_revalidate_access_v1','{"p_shop_id":"20000000-0000-4000-8000-000000001001","p_permission":"read"}')$q$,'28000','wechat_mini_session_expired','revocation stops new Storage URL authorization');
select is(public.wechat_mini_direct_issue_v1(pg_temp.proof('login'),repeat('f',64),array['00000000-0000-4000-8000-000000001001']::uuid[],repeat('s',32))->>'code','enrollment_required','login cannot revive revoked mapping');
select is((select count(*)::integer from app_private.wechat_mini_mapping_audit where event='unlinked'),1,'unlink audited exactly once');
select is(public.wechat_mini_pair_confirm_v1(pg_temp.proof('pair_confirm','a',(select (value->>'pairing_id')::uuid from results where name='pending_pair')),(select (value->>'pairing_id')::uuid from results where name='pending_pair'),repeat('3',64),array['00000000-0000-4000-8000-000000001001']::uuid[])->>'ok','false','S1: pre-unlink approval cannot reactivate mapping');
select ok((select cancelled_at is not null from app_private.wechat_mini_pairings where pairing_id=(select (value->>'pairing_id')::uuid from results where name='pending_pair')),'S1: unlink cancels pending pairing atomically');
select pg_temp.admin_context();
insert into results values ('fresh_pair',public.wechat_mini_pair_start_v1('wx0000000000000001',repeat('4',64),repeat('5',64),'11112222'));
select pg_temp.service_context();
insert into results values ('fresh_proof',to_jsonb(pg_temp.proof('pair_claim','a',null,'d','4')));
select is(public.wechat_mini_pair_claim_v1((select (value#>>'{}')::uuid from results where name='fresh_proof'),repeat('4',64),repeat('6',64),array['00000000-0000-4000-8000-000000001001']::uuid[])->>'ok','true','fresh post-revocation Mini consent');
select pg_temp.admin_context();
select is(public.wechat_mini_pair_admin_v1((select (value->>'pairing_id')::uuid from results where name='fresh_pair'),repeat('5',64),'approve')->>'state','approved','fresh post-revocation Admin consent');
select pg_temp.service_context();
select is(public.wechat_mini_pair_confirm_v1(pg_temp.proof('pair_confirm','a',(select (value->>'pairing_id')::uuid from results where name='fresh_pair')),(select (value->>'pairing_id')::uuid from results where name='fresh_pair'),repeat('6',64),array['00000000-0000-4000-8000-000000001001']::uuid[])->>'ok','true','S1: only fresh dual consent can relink');
select is(public.wechat_mini_session_resolve_v1(repeat('e',64),repeat('d',64))->>'ok','false','relink does not revive old session generation');

set local role anon;
select throws_ok($q$select public.wechat_mini_direct_issue_v1(null,null,null,null)$q$,'42501','permission denied for function wechat_mini_direct_issue_v1','actual anon role cannot issue');
set local role authenticated;
select throws_ok($q$select public.wechat_mini_proof_verify_v1(null,null,null,null)$q$,'42501','permission denied for function wechat_mini_proof_verify_v1','actual authenticated role cannot forge verification');
set local role postgres;


select * from finish();
rollback;
