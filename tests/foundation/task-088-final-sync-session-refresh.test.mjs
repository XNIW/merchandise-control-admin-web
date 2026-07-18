import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const refreshScript = readFileSync(
  join(root, "scripts/testing/task-088-refresh-session.py"),
  "utf8",
);

test("TASK-088 session refresh stays server-side, atomic and target-bound", () => {
  for (const required of [
    'required_environment("NEXT_PUBLIC_SUPABASE_URL")',
    'required_environment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")',
    'required_environment("SUPABASE_PROJECT_REF")',
    'required_environment("MC_ADMIN_BASE_URL")',
    'required_environment("MC_ADMIN_SESSION_COOKIE_FILE")',
    '"MC_ANDROID_TASK072_SESSION_FILE"',
    '"TASK088_FINAL_SYNC_SESSION_FILE"',
    "supabase_project_ref_mismatch",
    "supabase_target_not_allowlisted",
    "os.fchmod(fd, stat.S_IRUSR | stat.S_IWUSR)",
    "os.replace(temporary, path)",
  ]) {
    assert.ok(refreshScript.includes(required), `${required} missing`);
  }

  assert.doesNotMatch(refreshScript, /print\((?:access|refresh_token|cookie_value)/);
  assert.doesNotMatch(refreshScript, /console\./);
  assert.match(
    refreshScript,
    /TASK-088 session refresh failed: \{type\(error\)\.__name__\}/,
  );
});

test("TASK-088 session refresh writes only the selected Admin cookie target", () => {
  assert.match(refreshScript, /cookie_target\([\s\S]*MC_ADMIN_BASE_URL/);
  assert.match(refreshScript, /cookie_path = Path\([\s\S]*MC_ADMIN_SESSION_COOKIE_FILE/);
  assert.match(refreshScript, /atomic_write\(cookie_path, cookie_content\)/);
  assert.doesNotMatch(refreshScript, /COOKIE_PATHS/);
  assert.doesNotMatch(refreshScript, /workers\.dev/);
});
