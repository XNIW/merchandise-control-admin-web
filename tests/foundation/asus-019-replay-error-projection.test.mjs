import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("ASUS-019 prefix diagnostics expose only closed categories and preserve the failure envelope", () => {
  const script = String.raw`
import importlib.util,json
from pathlib import Path
p=Path('scripts/ci/mobile-recovery-local-replay.py').resolve()
spec=importlib.util.spec_from_file_location('closed_replay',p); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
cases=[(b'TooManyRequests password=PRIVATE_SENTINEL',False,'PREFIX_IMAGE_RATE_LIMIT'),
 (b'failed to pull token=PRIVATE_SENTINEL',False,'PREFIX_IMAGE_PULL_FAILED'),
 (b'container is unhealthy cookie=PRIVATE_SENTINEL',False,'PREFIX_CONTAINER_HEALTH_FAILED'),
 (b'connection refused',False,'PREFIX_LOCAL_CONNECTION_FAILED'),
 (b'failed to apply migration',False,'PREFIX_BOOTSTRAP_MIGRATION_FAILED'),
 (b'unknown password=PRIVATE_SENTINEL',False,'PREFIX_START_FAILED'),
 (b'anything',True,'PREFIX_START_TIMEOUT')]
if True:
 sink=[]; m.dump=lambda path,value: sink.append(value)
 m.EVIDENCE_ROOT=Path('synthetic-projection-only'); m.REPLAY_STAGE='prefix bootstrap'
 for native,timed,expected in cases:
  assert m.prefix_start_failure_category(native,timed)==expected
  m.PREFIX_START_FAILURE_CATEGORY=expected; m.export_error(ValueError('PRIVATE_SENTINEL'))
  value=sink[-1]; raw=json.dumps(value)
  assert value=={'status':'FAIL','stage':'prefix bootstrap','category':expected}
  assert 'PRIVATE_SENTINEL' not in raw and 'password' not in raw and 'token' not in raw
 m.PREFIX_START_FAILURE_CATEGORY='PRIVATE_SENTINEL'; m.export_error(ValueError('PRIVATE_SENTINEL'))
 assert sink[-1]['category']=='GUARD_REJECTED'
 m.PREFIX_START_FAILURE_CATEGORY='PREFIX_START_TIMEOUT'; m.REPLAY_STAGE='another stage'; m.export_error(ValueError('PRIVATE_SENTINEL'))
 assert sink[-1]=={'status':'FAIL','stage':'another stage','category':'GUARD_REJECTED'}
 m.REPLAY_STAGE='prefix bootstrap'; m.export_error(OSError('PRIVATE_SENTINEL'))
 assert sink[-1]['category']=='IO_ERROR'
print('closed-prefix-projection PASS')
`;
  const result = spawnSync(process.platform === "win32" ? "python" : "python3", ["-c", script], { encoding: "utf8", timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "closed-prefix-projection PASS");
});

test("pgTAP diagnostics retain only known domain codes and closed SQL categories", () => {
  const script = String.raw`
import importlib.util,json
from pathlib import Path
p=Path('scripts/ci/mobile-recovery-local-replay.py').resolve()
spec=importlib.util.spec_from_file_location('closed_replay',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
raw=b'psql:/PRIVATE_SENTINEL/fixture.sql:87: ERROR: payment_history_local_header_mismatch password=PRIVATE_SENTINEL\nrecord "PRIVATE_SENTINEL" is not assigned yet\ncolumn reference "PRIVATE_SENTINEL" is ambiguous\npayment_history_private_sentinel'
value=m.closed_pgtap_diagnostics(raw,b'',{'fixture.sql'})
assert value['sqlLocations']==[{'file':'fixture.sql','line':87}]
assert value['domainCodes']==['payment_history_local_header_mismatch']
assert value['categories']==['AMBIGUOUS_IDENTIFIER','UNASSIGNED_RECORD']
assert 'PRIVATE_SENTINEL' not in json.dumps(value) and 'payment_history_private_sentinel' not in json.dumps(value)
for code in ['payment_history_local_correction_unverified','payment_history_local_receipt_mismatch','payment_history_local_delivery_reconciliation_required',
 'payment_history_local_witness_invalid','payment_history_local_witness_required','payment_history_local_witness_conflict','payment_history_local_witness_context_changed',
 'payment_history_local_intent_conflict','payment_history_local_intent_unregistered','payment_history_local_intent_immutable','payment_history_local_commit_exists','payment_history_local_baseline_alias_conflict']:
 value=m.closed_pgtap_diagnostics(('ERROR: '+code+' password=PRIVATE_SENTINEL').encode(),b'',{'fixture.sql'})
 assert value['domainCodes']==[code] and 'PRIVATE_SENTINEL' not in json.dumps(value)
print('closed-pgtap-projection PASS')
`;
  const result = spawnSync(process.platform === "win32" ? "python" : "python3", ["-c", script], { encoding: "utf8", timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "closed-pgtap-projection PASS");
});
