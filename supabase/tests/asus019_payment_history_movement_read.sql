begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(37);
select has_function('public','payment_history_movements_v1',array['uuid','text','jsonb','uuid','uuid','text','integer'],'movement reader is a named RPC');
select ok(not has_function_privilege('anon','public.payment_history_movements_v1(uuid,text,jsonb,uuid,uuid,text,integer)','EXECUTE'),'anonymous cannot read financial movements');
select ok(has_function_privilege('authenticated','public.payment_history_movements_v1(uuid,text,jsonb,uuid,uuid,text,integer)','EXECUTE'),'personal accounts use their authenticated SQL actor');
select ok(has_function_privilege('service_role','public.payment_history_movements_v1(uuid,text,jsonb,uuid,uuid,text,integer)','EXECUTE'),'staff boundary can execute only the named reader');
insert into public.shops(shop_id,shop_code,shop_name,shop_status) values('10000000-0000-4000-8000-000000083019','MOVEMENT019','Synthetic movement reader','active');
insert into public.staff_accounts(staff_id,shop_id,staff_code,display_name,role_key,status,credential_kind,credential_hash,credential_updated_at,credential_expires_at,must_change_credential,credential_version,credential_status)
 values('20000000-0000-4000-8000-000000083019','10000000-0000-4000-8000-000000083019','1001','Synthetic reader','pos_admin','active','password','argon2id:synthetic-not-a-login',clock_timestamp(),clock_timestamp()+interval '1 hour',false,7,'active');
insert into public.staff_role_permissions(shop_id,role_key,permission_key,enabled) values('10000000-0000-4000-8000-000000083019','pos_admin','shop_admin.full_access',true) on conflict(shop_id,role_key,permission_key) do update set enabled=true;
insert into public.staff_web_sessions(staff_web_session_id,shop_id,staff_id,session_token_hash,staff_credential_version,status,issued_at,expires_at)
 values('30000000-0000-4000-8000-000000083019','10000000-0000-4000-8000-000000083019','20000000-0000-4000-8000-000000083019','sha256:'||repeat('a',64),7,'active',now()-interval '1 minute',now()+interval '1 hour');
create function pg_temp.movement(p jsonb default '{"from_date":"2026-03-01","to_date":"2026-03-31","include_inactive":false,"page_size":1,"after":null}',op text default 'read') returns jsonb language sql as $$
 select public.payment_history_movements_v1('10000000-0000-4000-8000-000000083019',op,p,'20000000-0000-4000-8000-000000083019','30000000-0000-4000-8000-000000083019','sha256:'||repeat('a',64),7)->'result';$$;
create function pg_temp.marker(p jsonb default '{}',token text default 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') returns jsonb language sql as $$
 select public.staff_web_mobile_operations_read_v1('10000000-0000-4000-8000-000000083019','20000000-0000-4000-8000-000000083019','30000000-0000-4000-8000-000000083019',token,7,'marker',p);$$;
create temp table movement_context(key text primary key,value jsonb);
grant all on movement_context to service_role;
set local role service_role;
set local request.jwt.claims='{"role":"service_role"}';
select is(pg_temp.movement()->>'configured','false','unconfigured history is not an authoritative empty ledger');
select throws_ok($$select pg_temp.movement(op=>'apply')$$,'42501','payment_history_operation_denied','reader cannot select a financial write');
select throws_ok($$select pg_temp.movement('{"from_date":null,"to_date":null,"include_inactive":false,"page_size":201,"after":null}')$$,'22023','payment_history_view_input_invalid','page size is bounded');
select throws_ok($$select pg_temp.movement('{"from_date":null,"to_date":null,"include_inactive":false,"page_size":1,"after":null,"shop_id":"other"}')$$,'22023','payment_history_view_input_invalid','browser scope overrides are rejected');
select throws_ok($$select public.payment_history_movements_v1('10000000-0000-4000-8000-000000083019','read','{}')$$,'42501','payment_history_permission_denied','service role without an actual actor is not a financial permission');
insert into movement_context values('marker',pg_temp.marker());
select is((select value->>'code' from movement_context where key='marker'),'success','staff revision marker uses the existing lease-bound reader');
select ok((select jsonb_array_length(value#>'{sync,rows}')<=1 from movement_context where key='marker'),'marker projection is at most one event');
select is(pg_temp.marker('{"owner_user_id":"00000000-0000-4000-8000-000000083020"}')->>'code','validation_failed','marker cannot select a legacy owner');
select is(pg_temp.marker(token=>'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')->>'code','permission_denied','marker cannot borrow another token');
set local role postgres;
select is((select count(*) from public.audit_logs where shop_id='10000000-0000-4000-8000-000000083019'),0::bigint,'bounded marker polling creates no repeating audit event');
insert into public.payment_history_runtime(shop_id,revision,writer_epoch,writer_authority) values('10000000-0000-4000-8000-000000083019',4,2,'web');
insert into public.payment_history_evidence(evidence_id,shop_id,kind,verification_level,status,policy_version,reference,scope,actor_kind,actor_id,verified_at)
 values('40000000-0000-4000-8000-000000083019','10000000-0000-4000-8000-000000083019','merchant_mapping','operator_attested','verified','synthetic-v1','Synthetic source','{}','pos_staff_manager','20000000-0000-4000-8000-000000083019',clock_timestamp());
insert into public.payment_history_merchants(merchant_id,shop_id,label,evidence_id) values('50000000-0000-4000-8000-000000083019','10000000-0000-4000-8000-000000083019','Synthetic merchant','40000000-0000-4000-8000-000000083019');
insert into public.payment_history_batches(batch_id,shop_id,origin,state,apply_operation_id,created_revision,cancelled_revision,cancelled_at) values
 ('60000000-0000-4000-8000-000000083019','10000000-0000-4000-8000-000000083019','local_migration','active','70000000-0000-4000-8000-000000083019',1,null,null),
 ('60000000-0000-4000-8000-000000083020','10000000-0000-4000-8000-000000083019','web_import','cancelled','70000000-0000-4000-8000-000000083020',1,4,clock_timestamp());
insert into public.payment_history_movement_versions(movement_version_id,shop_id,merchant_id,external_namespace,external_id,identity_key,economic_digest,business_ticks,business_date,gross_clp,commission_clp,commission_vat_clp,net_clp,movement_kind,transaction_state,transaction,owner_batch_id,source_row,source_sheet,active,created_revision)
 select ('80000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000083019','50000000-0000-4000-8000-000000083019',
  case when n=2 or n=3 then 'getnet.legacy.transaction' else 'getnet.financial.movement' end,'synthetic-'||n,
  encode(extensions.digest(convert_to('synthetic-identity-'||n,'UTF8'),'sha256'),'hex'),repeat('a',64),app_private.payment_history_ticks_v1(clock),clock::date,gross,fee,vat,net,
  case when gross<0 then 'Cancellation' else 'Sale' end,'CONFIRMADA',
  jsonb_build_object('source',jsonb_build_object('fileSha256',repeat('b',64)),'timestamp',jsonb_build_object('rawTimestamp',clock||'Z','offsetMinutes',case when n in(2,3) then null else 0 end,
   'occurredAtUtc',case when n in(2,3) then null else clock||'Z' end,'interpretation',case when n in(2,3) then 'Unresolved' else 'IsoUtc' end,'policyVersion','synthetic-v1','evidenceReference','Synthetic fixture')),
  case when n=3 then '60000000-0000-4000-8000-000000083020' else '60000000-0000-4000-8000-000000083019' end::uuid,2,'synthetic',n<>3,1
 from(values(1,'2026-03-01T12:00:00.0000001',1000::bigint,null::bigint,null::bigint,null::bigint),
  (2,'2026-03-02T12:00:00.0000001',1000,100,null,900),(3,'2026-03-02T12:00:00.0000001',500,50,null,450),
  (4,'2026-03-03T12:00:00.0000001',-300,0,0,-300),
  (5,'2026-04-01T12:00:00.0000001',9223372036854775807,null,null,null),(6,'2026-04-01T12:00:00.0000001',9223372036854775807,null,null,null)) x(n,clock,gross,fee,vat,net);
set local role service_role;
insert into movement_context values('page1',pg_temp.movement());
select is((select value#>>'{totals,matched_count}' from movement_context where key='page1'),'3','global filtered count is independent of page size');
select is((select value#>>'{totals,signed_active_gross_clp}' from movement_context where key='page1'),'1700','global gross preserves cancellation sign');
select is((select value#>>'{totals,known_active_net_clp}'||'/'||(value#>>'{totals,known_active_net_count}') from movement_context where key='page1'),'600/2','known net subtotal carries its count independently');
select is((select value#>>'{rows,0,gross_clp}' from movement_context where key='page1'),'-300','visible cancellation remains negative');
select is((select value#>>'{rows,0,business_datetime}' from movement_context where key='page1'),'2026-03-03T12:00:00.0000001','commercial clock keeps 100ns without timezone conversion');
insert into movement_context values('page2',pg_temp.movement(jsonb_build_object('from_date','2026-03-01','to_date','2026-03-31','include_inactive',false,'page_size',1,'after',(select value->'next' from movement_context where key='page1'))));
select is((select value#>>'{rows,0,external_id}' from movement_context where key='page2'),'synthetic-2','keyset cursor advances by commercial clock and immutable ID');
select is((select value#>>'{totals,matched_count}' from movement_context where key='page2'),'3','later page retains global filtered totals');
insert into movement_context values('page3',pg_temp.movement(jsonb_build_object('from_date','2026-03-01','to_date','2026-03-31','include_inactive',false,'page_size',1,'after',(select value->'next' from movement_context where key='page2'))));
select is((select value->'next' from movement_context where key='page3'),'null'::jsonb,'final page has no invented next cursor');
select is((select value#>'{rows,0,net_clp}' from movement_context where key='page3'),'null'::jsonb,'unknown row net remains null');
select is(pg_temp.movement('{"from_date":"2026-03-02","to_date":"2026-03-02","include_inactive":false,"page_size":50,"after":null}')#>>'{totals,matched_count}','1','date filters use commercial date inclusively');
select is(pg_temp.movement('{"from_date":"2026-03-04","to_date":"2026-03-04","include_inactive":false,"page_size":50,"after":null}')#>'{totals,signed_active_gross_clp}','null'::jsonb,'no observed rows does not manufacture a known financial amount');
select is(pg_temp.movement('{"from_date":"2026-03-01","to_date":"2026-03-31","include_inactive":true,"page_size":50,"after":null}')#>>'{totals,matched_count}','4','audit filter includes inactive version');
select is(pg_temp.movement('{"from_date":"2026-03-01","to_date":"2026-03-31","include_inactive":true,"page_size":50,"after":null}')#>>'{totals,signed_active_gross_clp}','1700','inactive audit gross is not added to active gross');
select is(pg_temp.movement('{"from_date":"2026-04-01","to_date":"2026-04-01","include_inactive":false,"page_size":1,"after":null}')#>>'{totals,signed_active_gross_clp}','18446744073709551614','global aggregate beyond Int64 is an exact decimal string');
select throws_ok($$select pg_temp.movement(jsonb_build_object('from_date','2026-03-01','to_date','2026-03-31','include_inactive',true,'page_size',1,'after',(select value->'next' from movement_context where key='page1')))$$,'22023','payment_history_view_cursor_invalid','a cursor cannot cross its filter');
set local role postgres;
update public.payment_history_runtime set revision=5 where shop_id='10000000-0000-4000-8000-000000083019';
set local role service_role;
select throws_ok($$select pg_temp.movement(jsonb_build_object('from_date','2026-03-01','to_date','2026-03-31','include_inactive',false,'page_size',1,'after',(select value->'next' from movement_context where key='page1')))$$,'40001','payment_history_view_changed','financial revision changes cannot mix pages');
select throws_ok($$select public.payment_history_movements_v1('10000000-0000-4000-8000-000000083020','read','{}','20000000-0000-4000-8000-000000083019','30000000-0000-4000-8000-000000083019','sha256:'||repeat('a',64),7)$$,'42501','payment_history_permission_denied','staff session cannot cross shops');
set local role postgres;
insert into public.payment_history_role_permissions(shop_id,role_key,capability,enabled) values('10000000-0000-4000-8000-000000083019','pos_admin','export',false);
set local role service_role;
select throws_ok($$select pg_temp.movement(op=>'export')$$,'42501','payment_history_permission_denied','read permission does not replace export permission');
select is(pg_temp.movement()->>'configured','true','denied export does not disable an allowed read');
set local role postgres;
select is((select count(*) from public.pos_sales where shop_id='10000000-0000-4000-8000-000000083019'),0::bigint,'all reader operations leave native sales untouched');
select is((select count(*) from public.payment_history_receipts where shop_id='10000000-0000-4000-8000-000000083019'),0::bigint,'all reader operations create no financial receipt');
update public.staff_web_sessions set status='revoked' where staff_web_session_id='30000000-0000-4000-8000-000000083019';
set local role service_role;
select throws_ok($$select pg_temp.movement()$$,'42501','payment_history_permission_denied','revoked web lease prevents movement read');
select is(pg_temp.marker()->>'code','permission_denied','revoked web lease also stops marker discovery');
select * from finish();
rollback;
