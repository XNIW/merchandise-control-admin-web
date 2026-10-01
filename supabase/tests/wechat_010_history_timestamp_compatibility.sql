begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Exact shared cross-language vectors; the local runner verifies JSON equality
-- with tests/fixtures/history-timestamp-compatibility-v1.json.
create temporary table history_timestamp_vectors as
select value as vector from jsonb_array_elements($vectors$
{"schemaVersion":"history-timestamp-compatibility-v1","cases":[{"name":"legacy-normal","value":"2026-07-05 15:40:11","historyAccepted":true,"legacyAccepted":true},{"name":"legacy-leap","value":"2000-02-29 23:59:59","historyAccepted":true,"legacyAccepted":true},{"name":"legacy-min-year","value":"0001-01-01 00:00:00","historyAccepted":true,"legacyAccepted":true},{"name":"legacy-max-year","value":"9999-12-31 23:59:59","historyAccepted":true,"legacyAccepted":true},{"name":"iso-milliseconds","value":"2026-07-05T15:40:11.305Z","historyAccepted":true,"legacyAccepted":false},{"name":"iso-zero-milliseconds","value":"2026-07-05T15:40:11.000Z","historyAccepted":true,"legacyAccepted":false},{"name":"iso-max-milliseconds","value":"2026-07-05T15:40:11.999Z","historyAccepted":true,"legacyAccepted":false},{"name":"iso-leap-400","value":"2000-02-29T23:59:59.123Z","historyAccepted":true,"legacyAccepted":false},{"name":"iso-leap-4","value":"2024-02-29T12:00:00.001Z","historyAccepted":true,"legacyAccepted":false},{"name":"iso-min-year","value":"0001-01-01T00:00:00.000Z","historyAccepted":true,"legacyAccepted":false},{"name":"iso-max-year","value":"9999-12-31T23:59:59.999Z","historyAccepted":true,"legacyAccepted":false},{"name":"null","value":null,"historyAccepted":false,"legacyAccepted":false},{"name":"empty","value":"","historyAccepted":false,"legacyAccepted":false},{"name":"iso-no-fraction","value":"2026-07-05T15:40:11Z","historyAccepted":false,"legacyAccepted":false},{"name":"iso-fraction-one","value":"2026-07-05T15:40:11.3Z","historyAccepted":false,"legacyAccepted":false},{"name":"iso-fraction-two","value":"2026-07-05T15:40:11.30Z","historyAccepted":false,"legacyAccepted":false},{"name":"iso-fraction-four","value":"2026-07-05T15:40:11.3050Z","historyAccepted":false,"legacyAccepted":false},{"name":"iso-fraction-six","value":"2026-07-05T15:40:11.305000Z","historyAccepted":false,"legacyAccepted":false},{"name":"offset-zero","value":"2026-07-05T15:40:11.305+00:00","historyAccepted":false,"legacyAccepted":false},{"name":"offset-nonzero","value":"2026-07-05T15:40:11.305-03:00","historyAccepted":false,"legacyAccepted":false},{"name":"lower-t","value":"2026-07-05t15:40:11.305Z","historyAccepted":false,"legacyAccepted":false},{"name":"lower-z","value":"2026-07-05T15:40:11.305z","historyAccepted":false,"legacyAccepted":false},{"name":"leading-space","value":" 2026-07-05T15:40:11.305Z","historyAccepted":false,"legacyAccepted":false},{"name":"trailing-space","value":"2026-07-05T15:40:11.305Z ","historyAccepted":false,"legacyAccepted":false},{"name":"trailing-newline","value":"2026-07-05T15:40:11.305Z\n","historyAccepted":false,"legacyAccepted":false},{"name":"legacy-fraction","value":"2026-07-05 15:40:11.305","historyAccepted":false,"legacyAccepted":false},{"name":"legacy-offset","value":"2026-07-05 15:40:11+00:00","historyAccepted":false,"legacyAccepted":false},{"name":"iso-space","value":"2026-07-05 15:40:11.305Z","historyAccepted":false,"legacyAccepted":false},{"name":"year-zero","value":"0000-01-01T00:00:00.000Z","historyAccepted":false,"legacyAccepted":false},{"name":"year-10000","value":"10000-01-01T00:00:00.000Z","historyAccepted":false,"legacyAccepted":false},{"name":"month-zero","value":"2026-00-05T15:40:11.305Z","historyAccepted":false,"legacyAccepted":false},{"name":"month-13","value":"2026-13-05T15:40:11.305Z","historyAccepted":false,"legacyAccepted":false},{"name":"day-zero","value":"2026-07-00T15:40:11.305Z","historyAccepted":false,"legacyAccepted":false},{"name":"feb-30","value":"2024-02-30T15:40:11.305Z","historyAccepted":false,"legacyAccepted":false},{"name":"leap-century","value":"1900-02-29T15:40:11.305Z","historyAccepted":false,"legacyAccepted":false},{"name":"nonleap","value":"2026-02-29T15:40:11.305Z","historyAccepted":false,"legacyAccepted":false},{"name":"hour-24","value":"2026-07-05T24:00:00.000Z","historyAccepted":false,"legacyAccepted":false},{"name":"minute-60","value":"2026-07-05T15:60:00.000Z","historyAccepted":false,"legacyAccepted":false},{"name":"second-60","value":"2026-07-05T15:40:60.000Z","historyAccepted":false,"legacyAccepted":false},{"name":"single-month","value":"2026-7-05T15:40:11.305Z","historyAccepted":false,"legacyAccepted":false},{"name":"unicode-digit","value":"２０２６-07-05T15:40:11.305Z","historyAccepted":false,"legacyAccepted":false},{"name":"legacy-year-zero","value":"0000-01-01 00:00:00","historyAccepted":false,"legacyAccepted":false},{"name":"legacy-bad-day","value":"2026-02-30 15:40:11","historyAccepted":false,"legacyAccepted":false},{"name":"legacy-hour-24","value":"2026-07-05 24:00:00","historyAccepted":false,"legacyAccepted":false},{"name":"legacy-second-60","value":"2026-07-05 15:40:60","historyAccepted":false,"legacyAccepted":false}]}
$vectors$::jsonb->'cases');

select is(app_private.sync_history_timestamp_is_canonical_v1(vector->>'value'),
  (vector->>'historyAccepted')::boolean, 'History grammar: '||(vector->>'name'))
from history_timestamp_vectors;
select is(app_private.sync_legacy_timestamp_is_canonical_v1(vector->>'value'),
  (vector->>'legacyAccepted')::boolean, 'Price/legacy grammar unchanged: '||(vector->>'name'))
from history_timestamp_vectors;

set local timezone = 'Pacific/Chatham';
set local datestyle = 'German, DMY';
select is(app_private.sync_history_timestamp_is_canonical_v1(vector->>'value'),
  (vector->>'historyAccepted')::boolean, 'Timezone/DateStyle independence: '||(vector->>'name'))
from history_timestamp_vectors;

select ok(not has_function_privilege('anon',
  'app_private.sync_history_timestamp_is_canonical_v1(text)', 'EXECUTE')
  and not has_function_privilege('authenticated',
  'app_private.sync_history_timestamp_is_canonical_v1(text)', 'EXECUTE')
  and not has_function_privilege('service_role',
  'app_private.sync_history_timestamp_is_canonical_v1(text)', 'EXECUTE'),
  'New History predicate is private, with no client or service-role execute');

select is(app_private.sync_history_active_payload_is_valid_v1(
  vector->>'value', null, '[ ["typed"] ]'::jsonb, null),
  (vector->>'historyAccepted')::boolean,
  'Active History validates timestamps through its unchanged storage/typed envelope: '||(vector->>'name'))
from history_timestamp_vectors;

select ok(not app_private.sync_history_active_payload_is_valid_v1(
  '2026-07-05T15:40:11.305Z',null,'[[1e10000]]'::jsonb,null),
  'ISO acceptance does not permit numeric History cells or serialize a numeric exponent');
select ok(not app_private.sync_history_active_payload_is_valid_v1(
  '2026-07-05T15:40:11.305Z',null,jsonb_build_array(jsonb_build_array(repeat('x',524289))),null),
  'ISO acceptance preserves logical payload limit');
select ok(not app_private.sync_history_active_payload_is_valid_v1(
  '2026-07-05T15:40:11.305Z',null,'[["typed"]]'::jsonb,'{"overlay_schema":2}'::jsonb),
  'ISO acceptance preserves overlay schema guard');

select * from finish();
rollback;
