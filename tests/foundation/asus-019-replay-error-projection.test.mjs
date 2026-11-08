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
