begin;
select plan(12);
select ok(app_private.sync_recovery_scalar_bytes_contract_v1(), 'existing private scalar contract still accepts current dependencies');
select is((select provolatile::text from pg_proc where oid='app_private.sync_recovery_preflight_counts_v1(uuid,text,uuid,uuid)'::regprocedure),'s','preflight retains its single STABLE snapshot');
select is((select provolatile::text from pg_proc where oid='public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure),'v','checkpoint remains VOLATILE across its statements');
select is(app_private.sync_recovery_row_count_limit_v1('products'),125000::bigint,'product outer cap stays125000');
select is(app_private.sync_recovery_row_count_limit_v1('prices'),175000::bigint,'price outer cap stays175000');
select is(octet_length(app_private.sync_product_recovery_row_v1(null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null)::text),361,'sixteen-key product skeleton297 plus sixteen NULL scalars64');
select is((select count(*)from jsonb_object_keys(app_private.sync_product_recovery_row_v1(null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null))),16::bigint,'original product DTO retains exactly sixteen keys');
with dto as(select app_private.sync_product_recovery_row_v1(null,null,'B','I','N','S',1,2,'21000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001',3,null,'infinity',null,'25000000-0000-4000-8000-000000000001','2026-10-02 01:02:03+00')j)
select ok(j->'category_id'='null'::jsonb and j->'supplier_id'='null'::jsonb and j->'primary_image_version_id'='null'::jsonb and j->'primary_image_updated_at'='null'::jsonb and j->>'barcode'='B' and j->>'purchase_price'='1'and j->>'deleted_at'='!nonfinite','nonfinite tombstone nulls only the original four relation/image fields')from dto;
with vals(n)as(values(null::float8),('NaN'::float8),('Infinity'::float8),('-Infinity'::float8),('-0'::float8),(0::float8),(4.9406564584124654e-324::float8),(1.7976931348623157e308::float8),(-1.7976931348623157e308::float8)),
 dates(t)as(values(null::timestamptz),('infinity'::timestamptz),('-infinity'::timestamptz),('4713-01-01 BC'::timestamptz),('294276-12-31 23:59:59.999999Z'::timestamptz)),
 texts(t)as(values(null::text),(''),('中文😀'),(repeat(chr(1),100))),
 vectors as(select n,d.t as dt,x.t from vals cross join dates d cross join texts x)
select ok(bool_and(octet_length(app_private.sync_product_recovery_row_v1(null,null,t,t,t,t,n,n,null,null,n,dt,dt,null,null,dt)::text)=
 297+6*4+4*coalesce(octet_length(to_jsonb(t)::text),4)+3*coalesce(octet_length(to_jsonb(n)::text),4)
 +2*coalesce(octet_length(to_jsonb(app_private.sync_checkpoint_json_timestamp(dt))::text),4)
 +case when dt is null then coalesce(octet_length(to_jsonb(app_private.sync_checkpoint_json_timestamp(dt))::text),4)else 4 end),
 'product flat scalar lengths equal original DTO for NULL/nonfinite/Unicode/tombstone vectors')from vectors;
select is(app_private.sync_recovery_preflight_counts_v1(null,'unknown',null,null)->>'totalRowCount','0','unknown scope with NULL shop/owners has no rows');
select ok(not has_function_privilege('authenticated','app_private.sync_recovery_scalar_bytes_contract_v1()','EXECUTE'),'client gains no private predicate privilege');
select ok((select proconfig=array['search_path=public, app_private, pg_temp']from pg_proc where oid='app_private.sync_recovery_preflight_counts_v1(uuid,text,uuid,uuid)'::regprocedure),'no parallel/timeout override added to runtime function');
select *from finish();
rollback;
