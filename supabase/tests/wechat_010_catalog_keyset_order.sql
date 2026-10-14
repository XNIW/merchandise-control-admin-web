begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Synthetic fixtures only; every trigger and scope check remains active.
insert into auth.users (instance_id,id,aud,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000008301',
  'authenticated','authenticated','{}','{}',now(),now());
update public.profiles set profile_status='active' where profile_id='00000000-0000-4000-8000-000000008301';
insert into public.shops(shop_id,shop_code,shop_name,shop_status) values
  ('10000000-0000-4000-8000-000000008301','KEYSET8301','Catalog keyset fixture','active'),
  ('10000000-0000-4000-8000-000000008302','KEYSET8302','Other keyset shop','active');
insert into public.shop_members(profile_id,shop_id,role_key,membership_status)
values ('00000000-0000-4000-8000-000000008301','10000000-0000-4000-8000-000000008301','viewer','active');

-- Exactly three full updated_desc pages share the same microsecond timestamp.
-- Repeated names and case-fold-equivalent unique barcodes also cross page boundaries.
insert into public.inventory_products(id,owner_user_id,shop_id,barcode,product_name,updated_at)
select ('23000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,
  '00000000-0000-4000-8000-000000008301','10000000-0000-4000-8000-000000008301',
  (case when g%2=0 then 'TIE-' else 'tie-' end)||lpad(((g+1)/2)::text,4,'0'),
  'Tie name '||((g-1)%5)::text,'2026-07-27T08:42:28.893668Z'::timestamptz
from generate_series(1,150) g;
insert into public.inventory_products(id,owner_user_id,shop_id,barcode,product_name,updated_at)
select ('23000000-0000-4000-8000-'||lpad((200+g)::text,12,'0'))::uuid,
  '00000000-0000-4000-8000-000000008301','10000000-0000-4000-8000-000000008301',
  'MIXED-'||g::text,'Mixed timestamp '||g::text,
  case when g<=2 then '2026-07-27T08:42:28.893669Z'::timestamptz
    when g=3 then '2026-07-27T08:42:28.893668Z'::timestamptz
    else '2026-07-27T08:42:28.893667Z'::timestamptz end
from generate_series(1,5) g;
insert into public.inventory_products(id,owner_user_id,shop_id,barcode,product_name,updated_at,deleted_at)
values
  ('23000000-0000-4000-8000-000000008398','00000000-0000-4000-8000-000000008301',
    '10000000-0000-4000-8000-000000008302','TIE-OTHER','Tie other shop','2026-07-27T08:42:28.893668Z',null),
  ('23000000-0000-4000-8000-000000008399','00000000-0000-4000-8000-000000008301',
    '10000000-0000-4000-8000-000000008301','TIE-DELETED','Tie deleted','2026-07-27T08:42:28.893668Z',now());

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000008301',true);
create temporary table keyset_pages(sort text,page integer,position bigint,product_id uuid,updated_at timestamptz,cursor_text text);
do $$
declare
  v_sort text; v_page integer; v_limit integer; v_count integer;
  v_at timestamptz; v_text text; v_id uuid;
begin
  foreach v_sort in array array['updated_desc','name_asc','barcode_asc'] loop
    v_at:=null; v_text:=null; v_id:=null;
    v_limit:=case when v_sort='barcode_asc' then 49 else 50 end;
    for v_page in 1..5 loop
      insert into keyset_pages
      select v_sort,v_page,r.ordinality,r.product_id,r.updated_at,r.cursor_text
      from public.wechat_catalog_page_v1('10000000-0000-4000-8000-000000008301',v_limit,
        'tie',null,null,null,v_sort,v_at,v_text,v_id) with ordinality r;
      get diagnostics v_count=row_count;
      exit when v_count=0;
      select case when v_sort='updated_desc' then updated_at else null end,
        case when v_sort<>'updated_desc' then cursor_text else null end,product_id
      into v_at,v_text,v_id from keyset_pages where sort=v_sort and page=v_page order by position desc limit 1;
    end loop;
  end loop;
end $$;

select is((select count(*)::integer from keyset_pages where sort='updated_desc' and page=1),50,'updated page one has 50 tied rows');
select is((select count(*)::integer from keyset_pages where sort='updated_desc' and page=2),50,'updated page two advances across the same timestamp');
select is((select count(*)::integer from keyset_pages where sort='updated_desc' and page=3),50,'updated page three advances across the same timestamp');
select is((select count(*)::integer from keyset_pages where sort='updated_desc' and page>3),0,'updated EOF stays empty after three full pages');
select is((select count(distinct updated_at)::integer from keyset_pages where sort='updated_desc'),1,'all three updated pages share one timestamp');
select is((select count(distinct product_id)::integer from keyset_pages where sort='updated_desc'),150,'updated pages have no overlap or missing products');
select is((select array_agg(product_id order by page,position) from keyset_pages where sort='updated_desc'),
  (select array_agg(id order by updated_at desc,id asc) from public.inventory_products
   where shop_id='10000000-0000-4000-8000-000000008301' and deleted_at is null and lower(barcode) like 'tie-%'),
  'updated full traversal matches independent mixed-direction ordering');

select is((select count(*)::integer from keyset_pages where sort='name_asc'),150,'name pagination reaches every tied-name row');
select is((select count(distinct product_id)::integer from keyset_pages where sort='name_asc'),150,'name pagination has no repeated IDs');
select is((select array_agg(product_id order by page,position) from keyset_pages where sort='name_asc'),
  (select array_agg(id order by lower(coalesce(product_name,second_product_name,barcode)),id) from public.inventory_products
   where shop_id='10000000-0000-4000-8000-000000008301' and deleted_at is null and lower(barcode) like 'tie-%'),
  'name cursor and ascending tie order remain unchanged');
select is((select count(*)::integer from keyset_pages where sort='barcode_asc'),150,'barcode pagination crosses case-folded ties');
select is((select count(distinct product_id)::integer from keyset_pages where sort='barcode_asc'),150,'barcode pagination has no repeated IDs');
select is((select array_agg(product_id order by page,position) from keyset_pages where sort='barcode_asc'),
  (select array_agg(id order by lower(barcode),id) from public.inventory_products
   where shop_id='10000000-0000-4000-8000-000000008301' and deleted_at is null and lower(barcode) like 'tie-%'),
  'barcode cursor and ascending tie order remain unchanged');
select ok(not exists(select 1 from keyset_pages where product_id in (
  '23000000-0000-4000-8000-000000008398','23000000-0000-4000-8000-000000008399')),
  'every sort excludes deleted and cross-shop rows');

-- Newer -> equal -> older timestamps, including a final tie across the page edge.
do $$
declare v_page integer; v_at timestamptz; v_id uuid; v_count integer;
begin
  for v_page in 1..5 loop
    insert into keyset_pages select 'mixed',v_page,r.ordinality,r.product_id,r.updated_at,r.cursor_text
    from public.wechat_catalog_page_v1('10000000-0000-4000-8000-000000008301',2,'mixed',
      null,null,null,'updated_desc',v_at,null,v_id) with ordinality r;
    get diagnostics v_count=row_count;
    exit when v_count=0;
    select updated_at,product_id into v_at,v_id from keyset_pages
      where sort='mixed' and page=v_page order by position desc limit 1;
  end loop;
end $$;
select is((select count(*)::integer from keyset_pages where sort='mixed'),5,'mixed timestamp pages reach five rows exactly once');
select is((select array_agg(product_id order by page,position) from keyset_pages where sort='mixed'),
  (select array_agg(id order by updated_at desc,id asc) from public.inventory_products
   where shop_id='10000000-0000-4000-8000-000000008301' and barcode like 'MIXED-%'),
  'mixed timestamp and ID directions match the canonical order');
select is((select product_id from public.wechat_catalog_page_v1('10000000-0000-4000-8000-000000008301',1,
  'tie',null,null,null,'updated_desc','2026-07-27T08:42:28.893668+00:00',null,
  '23000000-0000-4000-8000-000000000050')),'23000000-0000-4000-8000-000000000051'::uuid,
  'equivalent UTC offset timestamp preserves microseconds and advances the ID');
select is((select count(*)::integer from public.wechat_catalog_page_v1('10000000-0000-4000-8000-000000008302')),
  0,'viewer cannot read the other shop');
select * from finish();
rollback;
