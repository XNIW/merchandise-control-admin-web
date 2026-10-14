begin;
select plan(12);
select ok(app_private.sync_recovery_scalar_bytes_contract_v1(), 'pinned scalar contract accepts canonical PG17 UTF8 dependencies');
select is((select prosecdef from pg_proc where oid='app_private.sync_recovery_scalar_bytes_contract_v1()'::regprocedure),false,'private predicate is SECURITY INVOKER');
select is((select pg_get_userbyid(proowner) from pg_proc where oid='app_private.sync_recovery_scalar_bytes_contract_v1()'::regprocedure),'postgres','private predicate owner postgres');
select ok(not has_function_privilege('anon','app_private.sync_recovery_scalar_bytes_contract_v1()','EXECUTE'),'anon cannot call predicate');
select ok(not has_function_privilege('authenticated','app_private.sync_recovery_scalar_bytes_contract_v1()','EXECUTE'),'authenticated cannot call predicate');
select ok(not has_function_privilege('service_role','app_private.sync_recovery_scalar_bytes_contract_v1()','EXECUTE'),'service_role cannot call predicate');
select ok((select bool_and(app_private.sync_product_storage_is_bounded_v1(t,null,null,null))
 from (values(''),(repeat(chr(1),10637)),(repeat('界',3545)))v(t)), 'product stronger metadata cap implies pinned storage bounds');
select ok((select bool_and(app_private.sync_price_storage_is_bounded_v1('R','D',null,t,'C'))
 from (values(''),(repeat(chr(1),5333)),(repeat('界',1777)))v(t)), 'price stronger metadata cap implies pinned storage bounds');
select is(app_private.sync_product_storage_is_bounded_v1(null,null,null,null),null::boolean,'NULL barcode stays unproven');
select is(app_private.sync_price_storage_is_bounded_v1(null,'D',null,null,'C'),null::boolean,'NULL type stays unproven');
with vals(n)as(values(null::float8),('NaN'::float8),('Infinity'::float8),('-Infinity'::float8),('-0'::float8),(0::float8),(4.9406564584124654e-324::float8),(1.7976931348623157e308::float8),(999999999999.999::float8)),
 dates(t)as(values(null::timestamptz),('infinity'::timestamptz),('-infinity'::timestamptz),('4713-01-01 BC'::timestamptz),('294276-12-31 23:59:59.999999Z'::timestamptz)),
 strings(t)as(values(null::text),(''),('中文😀'),(repeat(chr(1),100))),
 prepared as(select n,d.t as dt,s.t,case when app_private.sync_price_value_is_canonical_v1(n)then app_private.sync_price_canonical_amount_v1(n)end as canonical from vals cross join dates d cross join strings s)
select ok(bool_and(octet_length(app_private.sync_price_recovery_row_v1(null,null,null,t,n,t,t,t,t,null,dt)::text)=
 170+4*4+5*coalesce(octet_length(to_jsonb(t)::text),4)+coalesce(octet_length(to_jsonb(n)::text),4)
 +coalesce(octet_length(to_jsonb(canonical)::text),4)+coalesce(octet_length(to_jsonb(app_private.sync_checkpoint_json_timestamp(dt))::text),4)),
 'flat twelve-key price bytes equal exact typed DTO including NULL/nonfinite/Unicode')from prepared;
select ok((select provolatile='s' from pg_proc where oid='app_private.sync_recovery_preflight_counts_v1(uuid,text,uuid,uuid)'::regprocedure)
 and(select provolatile='v' from pg_proc where oid='public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure), 'preflight STABLE and checkpoint VOLATILE remain unchanged');
select * from finish();
rollback;
