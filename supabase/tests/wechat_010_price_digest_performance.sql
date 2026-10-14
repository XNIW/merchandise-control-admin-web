begin;
select plan(14);

select is(app_private.sync_price_canonical_amount_v1(null), null::text, 'NULL amount remains NULL');
select is(app_private.sync_price_canonical_amount_v1(0), '0', 'zero is canonical');
select is(app_private.sync_price_canonical_amount_v1('-0'::float8), '0', 'negative zero is canonical');
select is(app_private.sync_price_canonical_amount_v1(123.4), '123.4', 'no padded fractional zeros');
select is(app_private.sync_price_canonical_amount_v1(1.2345), '1.235', 'same numeric three-place rounding');
select is(app_private.sync_price_canonical_amount_v1(-1.2345), '-1.235', 'same standalone negative rounding');
select is(app_private.sync_price_canonical_amount_v1(999999999.999), '999999999.999', 'large finite amount');
select is(app_private.sync_price_canonical_amount_v1('1e-200'::float8), '0', 'small exponent');
select is(app_private.sync_price_canonical_amount_v1('NaN'::float8), 'NaN', 'standalone NaN expression unchanged');
select is(app_private.sync_price_canonical_amount_v1('Infinity'::float8), 'Infinity', 'standalone positive infinity unchanged');
select is(app_private.sync_price_canonical_amount_v1('-Infinity'::float8), '-Infinity', 'standalone negative infinity unchanged');
select ok(not app_private.sync_price_value_is_canonical_v1('NaN'::float8), 'runtime price validator still rejects NaN');
select ok(not app_private.sync_price_value_is_canonical_v1(1.2345), 'runtime price validator still rejects excess precision');
select is((select provolatile::text from pg_proc where oid='public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)'::regprocedure), 'v', 'checkpoint remains VOLATILE for lease checks');

select * from finish();
rollback;
