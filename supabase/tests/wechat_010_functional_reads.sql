begin;
set local role postgres;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(instance_id,id,aud,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009001','authenticated','authenticated','{}','{}',now(),now());
update public.profiles set profile_status='active',disabled_at=null where profile_id='00000000-0000-4000-8000-000000009001';
insert into public.shops(shop_id,shop_code,shop_name,shop_status) values
('10000000-0000-4000-8000-000000009001','W010FUNCLOCAL','Isolated functional fixture','active'),
('10000000-0000-4000-8000-000000009002','W010FUNCOTHER','Isolated forbidden fixture','active');
insert into public.shop_members(profile_id,shop_id,role_key,membership_status) values
('00000000-0000-4000-8000-000000009001','10000000-0000-4000-8000-000000009001','shop_owner','active');
insert into public.storefront_settings(shop_id,public_slug,currency_code,catalog_time_zone)
values ('10000000-0000-4000-8000-000000009001','w010-functional-local','CLP','America/Santiago');
insert into public.inventory_categories(id,owner_user_id,shop_id,name)
select ('21000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000009001','10000000-0000-4000-8000-000000009001',case when i<=200 then 'Same prefix '||lpad(i::text,3,'0') else 'Z tail '||i end from generate_series(1,250)i;
insert into public.inventory_suppliers(id,owner_user_id,shop_id,name)
select ('22000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000009001','10000000-0000-4000-8000-000000009001',case when i<=200 then 'Same prefix '||lpad(i::text,3,'0') else 'Z tail '||i end from generate_series(1,250)i;
create function pg_temp.read_mini(rpc text,params jsonb default '{}',shop text default '10000000-0000-4000-8000-000000009001') returns jsonb language plpgsql as $$
begin
 perform set_config('request.jwt.claim.role','',true); perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 return public.wechat_mini_read_v1('00000000-0000-4000-8000-000000009001',rpc,params||jsonb_build_object('p_shop_id',shop));
end;$$;
create temporary table pages(kind text,n int,data jsonb);
insert into pages select k,1,pg_temp.read_mini('wechat_'||k||'_page_v1','{"p_limit":100}') from unnest(array['categories','suppliers']) k;
insert into pages select kind,2,pg_temp.read_mini('wechat_'||kind||'_page_v1',jsonb_build_object('p_limit',100,'p_after_name',data->99->>(case kind when 'categories' then 'category_name' else 'supplier_name' end),'p_after_id',data->99->>(case kind when 'categories' then 'category_id' else 'supplier_id' end))) from pages where n=1;
insert into pages select kind,3,pg_temp.read_mini('wechat_'||kind||'_page_v1',jsonb_build_object('p_limit',100,'p_after_name',data->99->>(case kind when 'categories' then 'category_name' else 'supplier_name' end),'p_after_id',data->99->>(case kind when 'categories' then 'category_id' else 'supplier_id' end))) from pages where n=2;
select is((select sum(jsonb_array_length(data))::int from pages where kind=k),250,k||' all 250 reachable through 3 bounded pages with similar names (active name ties forbidden)') from unnest(array['categories','suppliers']) k;
select is((select count(distinct item->>(case k when 'categories' then 'category_id' else 'supplier_id' end))::int from pages,jsonb_array_elements(data)item where kind=k),250,k||' keysets do not duplicate IDs') from unnest(array['categories','suppliers']) k;
select is(jsonb_array_length(pg_temp.read_mini('wechat_categories_page_v1','{"p_entity_id":"21000000-0000-4000-8000-000000000250"}')),1,'exact off-page category');
select is(jsonb_array_length(pg_temp.read_mini('wechat_suppliers_page_v1','{"p_entity_id":"22000000-0000-4000-8000-000000000250"}')),1,'exact off-page supplier');
select is(jsonb_array_length(pg_temp.read_mini('wechat_categories_page_v1','{"p_search":"tail 250","p_limit":100}')),1,'bounded category search');
select is(jsonb_array_length(pg_temp.read_mini('wechat_suppliers_page_v1','{"p_search":"tail 250","p_limit":100}')),1,'bounded supplier search');
update public.inventory_categories set deleted_at=now() where id='21000000-0000-4000-8000-000000000250';
update public.inventory_suppliers set deleted_at=now() where id='22000000-0000-4000-8000-000000000250';
select is(jsonb_array_length(pg_temp.read_mini('wechat_categories_page_v1','{"p_entity_id":"21000000-0000-4000-8000-000000000250"}')),0,'archived category excluded');
select is(jsonb_array_length(pg_temp.read_mini('wechat_suppliers_page_v1','{"p_entity_id":"22000000-0000-4000-8000-000000000250"}')),0,'archived supplier excluded');
select is(pg_temp.read_mini('wechat_categories_page_v1','{"p_entity_id":"21000000-0000-4000-8000-000000000001"}','10000000-0000-4000-8000-000000009002')->>'code','membership_missing','cross-shop lookup is denial, never empty success');
update public.shops set shop_status='suspended',suspended_at=now(),suspended_by_profile_id='00000000-0000-4000-8000-000000009001' where shop_id='10000000-0000-4000-8000-000000009001';
select is(pg_temp.read_mini('wechat_categories_page_v1')->>'code','shop_suspended','suspended shop has typed denial');
update public.shops set shop_status='active',suspended_at=null,suspended_by_profile_id=null where shop_id='10000000-0000-4000-8000-000000009001';
-- Local calendar boundaries: month rollover, 23-hour spring day, 25-hour autumn day.
create temporary table boundaries(day date,first_at timestamptz,last_at timestamptz,hours int);
insert into boundaries values ('2026-08-31','2026-08-31T04:00:00Z','2026-09-01T03:59:59.999999Z',24),('2026-09-06','2026-09-06T04:00:00Z','2026-09-07T02:59:59.999999Z',23),('2026-04-04','2026-04-04T03:00:00Z','2026-04-05T03:59:59.999999Z',25);
insert into public.audit_logs(actor_profile_id,scope,shop_id,event_key,target_type,target_id,created_at)
select '00000000-0000-4000-8000-000000009001','shop','10000000-0000-4000-8000-000000009001','shop.wechat.catalog.product.updated','product','23000000-0000-4000-8000-000000009001',at
from boundaries cross join lateral unnest(array[first_at-interval '1 microsecond',first_at,last_at,last_at+interval '1 microsecond'])at;
set local timezone='Asia/Shanghai';
select is(jsonb_array_length(pg_temp.read_mini('wechat_catalog_history_page_v1',jsonb_build_object('p_from_date',day,'p_to_date',day))),2,'History includes both boundaries only for shop day '||day) from boundaries;
select is(extract(epoch from ((day+1)::timestamp at time zone 'America/Santiago')-(day::timestamp at time zone 'America/Santiago'))::int/3600,hours,'fixture tests actual DST length '||day) from boundaries;
select throws_ok($$select pg_temp.read_mini('wechat_catalog_history_page_v1','{"p_from_date":"2026-09-06","p_to_at":"2026-09-06T00:00:00Z"}')$$,'22023','mixed_history_dates','mixed date and instant rejected');
select ok(not has_function_privilege('authenticated','public.wechat_mini_read_v1(uuid,text,jsonb)','EXECUTE'),'ordinary account cannot impersonate Mini actor');
select ok(not has_function_privilege('anon','public.wechat_mini_read_v1(uuid,text,jsonb)','EXECUTE'),'anon cannot call server wrapper');
select ok(has_function_privilege('service_role','public.wechat_mini_read_v1(uuid,text,jsonb)','EXECUTE'),'service RPC privilege preserved');
select * from finish();
rollback;
