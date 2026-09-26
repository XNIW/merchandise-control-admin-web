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

-- A genuine Mini login creates no POS/mobile device registration.
-- Do not mask that contract with a shop_devices fixture here.

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

-- Always dispatch through the canonical opaque-session business gate.
create function pg_temp.sync_call(p_delta boolean default false, p_override jsonb default '{}', p_device_hash text default repeat('d',64))
returns jsonb language sql as $$
  select public.wechat_mini_business_v1(repeat('e',64),p_device_hash,
    array['00000000-0000-4000-8000-000000001001']::uuid[],
    array['20000000-0000-4000-8000-000000001001']::uuid[],
    case when p_delta then 'wechat_mini_sync_delta_v1' else 'wechat_mini_sync_checkpoint_v1' end,
    jsonb_build_object('p_shop_id','20000000-0000-4000-8000-000000001001',
      'p_device_identifier','10000000-0000-4000-8000-000000001001','p_after_id','0') || p_override);
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
select is((select count(*)::integer from public.shop_devices where shop_id='20000000-0000-4000-8000-000000001001'),0,'Mini checkpoint and delta create no native device registration');
select ok(not has_function_privilege('service_role','app_private.wechat_mini_sync_scope_v1(uuid,uuid,text)','EXECUTE'),'no direct grant on Mini private scope');
select ok(not has_function_privilege('authenticated','app_private.wechat_mini_sync_event_page_v1(uuid,uuid,text,text,integer,text,text)','EXECUTE'),'no direct client event-page grant');
select pg_temp.admin_context();
select throws_ok($q$select public.shop_sync_event_page_v1('20000000-0000-4000-8000-000000001001','10000000-0000-4000-8000-000000001001')$q$,'42501','shop sync recovery requires an active device lease','native event reader still requires native registration');
select pg_temp.service_context();
select throws_ok($q$select pg_temp.sync_call(false,'{}',repeat('f',64))$q$,'28000','wechat_mini_session_expired','Mini sync wrong device hash denied');
select throws_ok($q$select pg_temp.sync_call(false,'{"p_shop_id":"20000000-0000-4000-8000-000000001002"}')$q$,'42501','wechat_shop_denied','Mini sync cross-shop denied');
select throws_ok($q$select pg_temp.sync_call(false,'{"p_after_id":"9223372036854775808"}')$q$,'22023','wechat_mini_sync_invalid','checkpoint bigint overflow denied');
select throws_ok($q$select pg_temp.sync_call(true,'{"p_limit":5,"p_expected_scope_key":"0000000000000000000000000000000000000000000000000000000000000000"}')$q$,'55000','shop_sync_recovery_scope_changed','delta rejects mismatched scope');
select is(pg_temp.sync_call(false,'{"p_after_id":"9223372036854775807"}')->>'status','cursor_ahead','checkpoint preserves bigint string and reconcile status');
select is(pg_temp.sync_call(false,'{"p_expected_scope_key":"0000000000000000000000000000000000000000000000000000000000000000"}')->>'status','scope_changed','checkpoint reconciles foreign scope');
update public.shop_members set membership_status='suspended',suspended_at=now() where profile_id='00000000-0000-4000-8000-000000001001';
select throws_ok($q$select pg_temp.sync_call()$q$,'42501','wechat_mini_membership_missing','Mini sync inactive membership denied');
update public.shop_members set membership_status='active',suspended_at=null,role_key='viewer' where profile_id='00000000-0000-4000-8000-000000001001';
set local role service_role;
select is(pg_temp.sync_call()->>'schemaVersion','wechat-mini-sync-checkpoint-v1','actual viewer reads checkpoint with no surrogate owner or native device');
select is(pg_temp.sync_call(true,jsonb_build_object('p_limit',5,'p_expected_scope_key',(select value->>'scopeKey' from results where name='checkpoint'),'p_expected_event_max_id',(select value->>'eventMaxId' from results where name='checkpoint')))->>'schemaVersion','wechat-mini-sync-delta-v1','actual viewer reads delta through bound session');
set local role postgres;
update public.shop_members set role_key='shop_owner' where profile_id='00000000-0000-4000-8000-000000001001';
update public.shops set shop_status='suspended',suspended_at=now(),suspended_by_profile_id='00000000-0000-4000-8000-000000001001' where shop_id='20000000-0000-4000-8000-000000001001';
select throws_ok($q$select pg_temp.sync_call()$q$,'42501','wechat_mini_membership_missing','Mini sync suspended shop denied');
update public.shops set shop_status='active',suspended_at=null,suspended_by_profile_id=null where shop_id='20000000-0000-4000-8000-000000001001';

-- The read scope is tied to the actual account, including viewer readers.
select pg_temp.service_context();
insert into results values ('viewer_scope',public.wechat_mini_sync_checkpoint_v1(
  '00000000-0000-4000-8000-000000001002','20000000-0000-4000-8000-000000001001',
  '10000000-0000-4000-8000-000000001001'));
select isnt((select value->>'scopeKey' from results where name='viewer_scope'),
  (select value->>'scopeKey' from results where name='checkpoint'),'scope key is bound to actual viewer, not an owner surrogate');
select pg_temp.service_context();
select throws_ok($q$select pg_temp.sync_call(true,jsonb_build_object('p_limit',5,'p_expected_scope_key',
  (select value->>'scopeKey' from results where name='viewer_scope')))$q$,'55000','shop_sync_recovery_scope_changed','another account scope cannot page events');

-- Bounded event pagination uses the canonical safe projection and snapshot.
do $events$ begin
  for i in 1..3 loop
    insert into public.inventory_categories(id,shop_id,owner_user_id,name)
    values (('90000000-0000-4000-8000-00000000100'||i)::uuid,
      '20000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001001','WECHAT010 sync category '||i);
  end loop;
end; $events$;
insert into results values ('event_fence',pg_temp.sync_call());
insert into public.inventory_categories(id,shop_id,owner_user_id,name)
values ('90000000-0000-4000-8000-000000001004',
  '20000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001001','WECHAT010 after fence');
set local role service_role;
insert into results select 'page1',pg_temp.sync_call(true,jsonb_build_object('p_limit',2,'p_expected_scope_key',value->>'scopeKey','p_expected_event_max_id',value->>'eventMaxId')) from results where name='event_fence';
select is(jsonb_array_length((select value->'rows' from results where name='page1')),2,'Mini first page is bounded');
select is((select value->>'hasMore' from results where name='page1'),'true','Mini first page exposes continuation');
insert into results select 'page2',pg_temp.sync_call(true,jsonb_build_object('p_limit',2,'p_after_id',(select value->>'nextAfterId' from results where name='page1'),'p_expected_scope_key',value->>'scopeKey','p_expected_event_max_id',value->>'eventMaxId')) from results where name='event_fence';
select is(jsonb_array_length((select value->'rows' from results where name='page2')),1,'Mini final page excludes event added after snapshot');
select is((select value->>'hasMore' from results where name='page2'),'false','Mini final page terminates');
select is((select value->'rows'->0->>'id' from results where name='page2'),(select value->>'eventMaxId' from results where name='event_fence'),'Mini final event matches frozen checkpoint');
select ok(not exists(select 1 from results,jsonb_array_elements(value->'rows') r where name in ('page1','page2') and (r ? 'owner_user_id' or r ? 'metadata' or r ? 'source_device_id')),'Mini projection omits owner, raw metadata and device');
select throws_ok($q$select pg_temp.sync_call(true,jsonb_build_object('p_limit',5,'p_expected_scope_key',(select value->>'scopeKey' from results where name='event_fence'),'p_expected_event_max_id','9223372036854775807'))$q$,'55000','shop_sync_incremental_snapshot_changed','Mini rejects a future snapshot');
set local role postgres;

insert into public.sync_events(owner_user_id,shop_id,domain,event_type,source,client_event_id,changed_count,entity_ids,metadata)
values ('00000000-0000-4000-8000-000000001002',null,'history','history_changed','ios','wechat010-legacy-history',0,null,'{}');
insert into results values ('no_legacy_mapping',pg_temp.sync_call());
select isnt((select value->>'eventMaxId' from results where name='no_legacy_mapping'),
  (select id::text from public.sync_events where client_event_id='wechat010-legacy-history'),'unmapped legacy history is invisible');
insert into public.shop_inventory_sources(shop_inventory_source_id,shop_id,owner_user_id,mapping_state,verified_at)
values ('40000000-0000-4000-8000-000000001001','20000000-0000-4000-8000-000000001001',null,'not_configured',null);
select throws_ok($q$select pg_temp.sync_call()$q$,'55000','shop_sync_recovery_scope_unresolved','unresolved mapping fails closed');
update public.shop_inventory_sources set owner_user_id='00000000-0000-4000-8000-000000001002',mapping_state='mapped',verified_at=now()
where shop_inventory_source_id='40000000-0000-4000-8000-000000001001';
select is(pg_temp.sync_call(false,jsonb_build_object('p_expected_scope_key',(select value->>'scopeKey' from results where name='no_legacy_mapping')))->>'status','scope_changed','verified mapping transition invalidates old scope');
insert into results values ('legacy_mapped',pg_temp.sync_call());
insert into results select 'legacy_page',pg_temp.sync_call(true,jsonb_build_object('p_limit',50,'p_expected_scope_key',value->>'scopeKey','p_expected_event_max_id',value->>'eventMaxId')) from results where name='legacy_mapped';
select ok(exists(select 1 from results,jsonb_array_elements(value->'rows') r where name='legacy_page' and r->>'domain'='history'
  and r->>'id'=(select id::text from public.sync_events where client_event_id='wechat010-legacy-history')),'verified legacy history remains visible beside shop-only catalog');


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
select is(public.wechat_mini_session_resolve_v1(repeat('e',64),repeat('d',64))->>'code','account_suspended','own valid session receives typed account suspension');
select is(public.wechat_mini_session_resolve_v1(repeat('e',64),repeat('f',64))->>'code','session_expired','invalid device does not disclose suspension');
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
select throws_ok($q$select pg_temp.sync_call()$q$,'28000','wechat_mini_session_expired','revoked session cannot checkpoint');
select throws_ok($q$select pg_temp.sync_call(true,'{"p_limit":5}')$q$,'28000','wechat_mini_session_expired','revoked session cannot read delta');
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
