begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_function('public', 'customer_address_create_v3', array['uuid', 'jsonb']);
select has_function('public', 'customer_address_create_reconcile_v3', array['uuid']);

insert into auth.users(instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000'::uuid, id, 'authenticated', 'authenticated',
  email, '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
from (values
  ('00000000-0000-4000-8000-000000054301'::uuid, 'address-v3-a@example.invalid'),
  ('00000000-0000-4000-8000-000000054302'::uuid, 'address-v3-b@example.invalid')
) fixture(id,email);
insert into auth.sessions(id,user_id,created_at,updated_at)
values
  ('00000000-0000-4000-8000-000000054311','00000000-0000-4000-8000-000000054301',now(),now()),
  ('00000000-0000-4000-8000-000000054312','00000000-0000-4000-8000-000000054302',now(),now());

create temporary table results(key text primary key, value jsonb);
grant all on results to authenticated;
create function pg_temp.payload(label text default 'Casa') returns jsonb language sql as $$
  select jsonb_build_object('label',label,'recipientName','Cliente sintetico',
    'addressLine1','Calle de prueba 123','commune','Santiago','region','Metropolitana','isDefault',true);
$$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000054301","role":"authenticated","session_id":"00000000-0000-4000-8000-000000054311"}',true);
select is(public.customer_address_create_reconcile_v3('00000000-0000-4000-8000-000000054321')->>'status','not_found','reconcile before commit is not_found');
-- Discarding the first response models a commit whose response never reaches the client.
do $$ begin perform public.customer_address_create_v3('00000000-0000-4000-8000-000000054321',pg_temp.payload()); end $$;
insert into results values('first',public.customer_address_create_reconcile_v3('00000000-0000-4000-8000-000000054321'));
insert into results values('replay',public.customer_address_create_v3('00000000-0000-4000-8000-000000054321',pg_temp.payload()));
select is((select value->>'apiVersion' from results where key='replay'),'customer-address.v3','v3 envelope');
select is((select value->>'status' from results where key='replay'),'ok','retry after lost response succeeds');
select is((select value->'address' from results where key='replay'),(select value->'address' from results where key='first'),'retry returns same canonical address without version or default writes');
select is((select count(*)::integer from public.customer_addresses),1,'one canonical address for one intent');
select is(public.customer_address_create_v3('00000000-0000-4000-8000-000000054321',pg_temp.payload('Ufficio'))->>'status','intent_conflict','modified payload on same intent is rejected');
select is((select count(*)::integer from public.customer_addresses),1,'conflict creates no row');
select is(public.customer_address_create_v3('00000000-0000-4000-8000-000000054322',pg_temp.payload())->>'status','ok','two equal payloads with different intents are legitimate');
select is((select count(*)::integer from public.customer_addresses),2,'different intents create two addresses');
select is((select count(*)::integer from public.customer_addresses where is_default),1,'existing default uniqueness preserved');

insert into results values('edited',public.customer_address_upsert_v2(
  (select (value->'address'->>'id')::uuid from results where key='first'),
  (select version from public.customer_addresses where id=(select (value->'address'->>'id')::uuid from results where key='first')),
  pg_temp.payload('Indirizzo aggiornato')));
select is(public.customer_address_create_reconcile_v3('00000000-0000-4000-8000-000000054321')->'address',
  (select value->'address' from results where key='edited'),'restart reconciliation returns current canonical address');
select is(public.customer_address_create_v3('00000000-0000-4000-8000-000000054321',pg_temp.payload())->'address',
  (select value->'address' from results where key='edited'),'replay returns current address without overwriting a later edit');

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000054302","role":"authenticated","session_id":"00000000-0000-4000-8000-000000054312"}',true);
select is(public.customer_address_create_reconcile_v3('00000000-0000-4000-8000-000000054321')->>'status','not_found','other account cannot read intent');
select is(public.customer_address_create_v3('00000000-0000-4000-8000-000000054321',pg_temp.payload())->>'status','ok','same UUID in another account has independent ownership');
select is((select count(*)::integer from public.customer_addresses),1,'RLS shows only current owner');

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000054301","role":"authenticated","session_id":"00000000-0000-4000-8000-000000054311"}',true);
select is(public.customer_address_delete_v2((select (value->'address'->>'id')::uuid from results where key='edited'),
  (select (value->'address'->>'version')::bigint from results where key='edited'))->>'status','ok','canonical address can be deleted');
select is(public.customer_address_create_reconcile_v3('00000000-0000-4000-8000-000000054321')->>'status','deleted','deleted canonical address leaves non-PII tombstone');
select is(public.customer_address_create_v3('00000000-0000-4000-8000-000000054321',pg_temp.payload())->>'status','deleted','replay never resurrects deleted address');
select is((select count(*)::integer from public.customer_addresses),1,'deleted replay cannot create replacement');
select is(public.customer_address_create_v3('00000000-0000-4000-8000-000000054323','{}')->>'status','invalid','invalid payload rejected');
select is(public.customer_address_create_reconcile_v3('00000000-0000-4000-8000-000000054323')->>'status','not_found','rejected validation leaves no committed intent');
select is(public.customer_address_create_v3(null,pg_temp.payload())->>'status','invalid','null intent rejected');
insert into results values('beforeInvalid',public.customer_addresses_read_v2()->'items');
create function pg_temp.create_status(payload jsonb) returns text language plpgsql as $$
begin
  return public.customer_address_create_v3('00000000-0000-4000-8000-000000054325',payload)->>'status';
exception when others then return sqlstate;
end;
$$;
select is(pg_temp.create_status(pg_temp.payload() || '{"isDefault":"not-a-boolean"}'::jsonb),'invalid','invalid boolean is a definitive validation rejection');
select is(pg_temp.create_status(pg_temp.payload() || '{"latitude":10000000000000000,"longitude":0}'::jsonb),'invalid','numeric precision overflow is a definitive rejection');
select is(public.customer_address_create_reconcile_v3('00000000-0000-4000-8000-000000054325')->>'status','not_found','invalid casts persist neither address nor intent');
select is(public.customer_addresses_read_v2()->'items',(select value from results where key='beforeInvalid'),'invalid casts preserve all address fields, defaults, versions and timestamps');

set local role postgres;
update auth.sessions set not_after=now()-interval '1 second' where id='00000000-0000-4000-8000-000000054311';
set local role authenticated;
select throws_ok($$select public.customer_address_create_reconcile_v3('00000000-0000-4000-8000-000000054321')$$,'28000','active customer session required','expired session denied');
set local role postgres;
update auth.sessions set not_after=null where id='00000000-0000-4000-8000-000000054311';
update auth.users set banned_until=now()+interval '1 hour' where id='00000000-0000-4000-8000-000000054301';
set local role authenticated;
select throws_ok($$select public.customer_address_create_reconcile_v3('00000000-0000-4000-8000-000000054321')$$,'28000','active customer session required','suspended account denied');
set local role postgres;
update auth.users set banned_until=null,deleted_at=now() where id='00000000-0000-4000-8000-000000054301';
set local role authenticated;
select throws_ok($$select public.customer_address_create_reconcile_v3('00000000-0000-4000-8000-000000054321')$$,'28000','active customer session required','soft-deleted account denied');
set local role postgres;
update auth.users set deleted_at=null where id='00000000-0000-4000-8000-000000054301';
set local role authenticated;

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000054301","role":"authenticated"}',true);
select throws_ok($$select public.customer_address_create_v3('00000000-0000-4000-8000-000000054324',pg_temp.payload())$$,'28000','active customer session required','missing session denied');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000054301","role":"authenticated","session_id":"00000000-0000-4000-8000-000000054312"}',true);
select throws_ok($$select public.customer_address_create_reconcile_v3('00000000-0000-4000-8000-000000054321')$$,'28000','active customer session required','other owner session denied');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000054301","role":"authenticated","session_id":"00000000-0000-4000-8000-000000054311","is_anonymous":true}',true);
select throws_ok($$select public.customer_address_create_reconcile_v3('00000000-0000-4000-8000-000000054321')$$,'28000','active customer session required','anonymous customer denied');
set local role postgres;
delete from auth.sessions where id='00000000-0000-4000-8000-000000054311';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000054301","role":"authenticated","session_id":"00000000-0000-4000-8000-000000054311"}',true);
select throws_ok($$select public.customer_address_create_reconcile_v3('00000000-0000-4000-8000-000000054321')$$,'28000','active customer session required','revoked session cannot replay PII');
set local role postgres;

select ok(not has_function_privilege('anon','public.customer_address_create_v3(uuid,jsonb)','execute'),'anon cannot create');
select ok(not has_function_privilege('anon','public.customer_address_create_reconcile_v3(uuid)','execute'),'anon cannot reconcile');
select ok(has_function_privilege('authenticated','public.customer_address_create_v3(uuid,jsonb)','execute'),'authenticated can create');
select ok(not has_function_privilege('authenticated','app_private.customer_address_session_user_v3()','execute'),'private session helper not exposed');
select ok(not has_table_privilege('authenticated','app_private.customer_address_create_intents_v3','SELECT,INSERT,UPDATE,DELETE'),'intent ledger inaccessible to clients');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='app_private.customer_address_create_intents_v3'::regclass),'private ledger enforces RLS');
select ok(not exists(select 1 from information_schema.columns where table_schema='app_private' and table_name='customer_address_create_intents_v3' and column_name in ('payload','address','recipient_name','recipient_phone_e164')),'ledger duplicates no address PII');
delete from auth.users where id='00000000-0000-4000-8000-000000054301';
select is((select count(*)::integer from app_private.customer_address_create_intents_v3 where owner_user_id='00000000-0000-4000-8000-000000054301'),0,'account deletion cascades all intent records');
select * from finish();
rollback;
