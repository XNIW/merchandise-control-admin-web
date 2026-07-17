import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const bootstrapScript = readFileSync(
  join(root, "scripts/testing/task-088-bootstrap-session.mjs"),
  "utf8",
);

test("TASK-088 bootstrap reuses one target-bound synthetic fixture", () => {
  for (const required of [
    'requiredEnvironment("SUPABASE_PROJECT_REF")',
    'requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL")',
    'requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY")',
    'readFile("supabase/.temp/project-ref", "utf8")',
    "SYNTHETIC_SHOP_NOT_UNIQUE",
    "SYNTHETIC_OWNER_NOT_UNIQUE",
    "SYNTHETIC_OWNER_MAPPING_MISMATCH",
    'role_key: "eq.shop_owner"',
    'membership_status: "eq.active"',
    'mapping_state: "eq.mapped"',
  ]) {
    assert.ok(bootstrapScript.includes(required), `${required} missing`);
  }
  assert.match(
    bootstrapScript,
    /requiredEnvironment\(\s*"NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",?\s*\)/u,
  );
  assert.match(
    bootstrapScript,
    /requiredEnvironment\(\s*"TASK088_FINAL_SYNC_SHOP_HASH",?\s*\)/u,
  );

  assert.doesNotMatch(bootstrapScript, /insert|createUser|signUp/iu);
  assert.doesNotMatch(
    bootstrapScript,
    /TASK088_FINAL_SYNC_SHOP_HASH\s*=\s*["'][a-f0-9]{12}/u,
  );
});

test("TASK-088 bootstrap keeps temporary credentials redacted and mode 0600", () => {
  for (const required of [
    'dirname(normalized) !== "/private/tmp"',
    '!basename(normalized).startsWith("task088-")',
    "mode: 0o600",
    "await chmod(pathValue, 0o600)",
    "access: session.access_token",
    "refresh: session.refresh_token",
    "OUTPUT_PATH_NOT_ALLOWLISTED",
  ]) {
    assert.ok(bootstrapScript.includes(required), `${required} missing`);
  }

  assert.doesNotMatch(
    bootstrapScript,
    /console\.(?:log|error)\([^)]*(?:access_token|refresh_token|cookieValue|serviceKey|publishableKey)/u,
  );
  assert.match(
    bootstrapScript,
    /JSON\.stringify\(\{\s*status: "PASS",[\s\S]*shopIdHash: expectedHash/u,
  );
});
