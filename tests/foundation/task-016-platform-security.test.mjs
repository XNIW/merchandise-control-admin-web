import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-016 security scanner has dedicated Platform Admin gates", () => {
  const securityChecks = readProjectFile("scripts/security-checks.mjs");

  assert.match(securityChecks, /checkTask016PlatformAdminConsole/);
  for (const pattern of [
    "no service-role client/browser",
    "no secret evidence",
    "no token/magic link",
    "no credential hash",
    "no platform client-only auth",
    "no unsafe platform operations",
    "no raw .env",
    "no unredacted audit metadata",
    "no emergency operation senza audit",
    "no platform admin grant/revoke senza self-lockout guard",
    "no auth provisioning che stampa magic link/token/password",
  ]) {
    assert.match(securityChecks, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});

test("TASK-016 Platform read models and UI do not expose privileged data", () => {
  const files = [
    "src/server/platform-admin/read-model.ts",
    "src/server/platform-admin/platform-section-data.ts",
    "src/server/platform-admin/shop-actions.ts",
    "src/server/platform-admin/admin-actions.ts",
    "src/app/platform/operations/actions.ts",
    "src/app/platform/admins/actions.ts",
    "src/components/platform/PlatformPage.tsx",
  ];

  for (const relativePath of files) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const source = files.map(readProjectFile).join("\n");
  const readAndUiSource = files
    .filter((relativePath) => relativePath !== "src/server/platform-admin/shop-actions.ts")
    .map(readProjectFile)
    .join("\n");
  const shopActions = readProjectFile("src/server/platform-admin/shop-actions.ts");

  assert.doesNotMatch(source, /select\("\*"\)|select\('\*'\)/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|service_role/i);
  assert.doesNotMatch(readAndUiSource, /pin_hash|password_hash|magic_link|access_token|refresh_token/i);
  assert.doesNotMatch(readAndUiSource, /credential_hash/i);
  assert.match(shopActions, /credential_hash: input\.credentialHash/);
  assert.match(shopActions, /hashStaffCredential/);
  assert.match(shopActions, /temporaryCredential/);
  assert.doesNotMatch(source, /console\.(log|debug|info|warn|error)/);
});

test("TASK-016 documentation reaches DONE reconciliation after explicit confirmation", () => {
  const task = readProjectFile("docs/TASKS/TASK-016-complete-platform-admin-console.md");
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-016/README.md");
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");

  assert.match(task, /Stato: `DONE`/);
  assert.match(task, /Fase attuale: `DONE_RECONCILED`/);
  assert.match(task, /Stato massimo consentito a Codex: `DONE_RECONCILED`/);
  assert.match(evidence, /Execution: `(STARTED|COMPLETED)`/);
  assert.match(evidence, /Fase: `DONE_RECONCILED`/);
  assert.match(
    masterPlan,
    /Stato TASK-016: `DONE`/,
  );
  assert.match(masterPlan, /Fase TASK-016: `DONE_RECONCILED`/);
  assert.match(masterPlan, /Stato TASK-015: `DONE`/);
  assert.match(masterPlan, /Stato TASK-017: `DONE`/);
});
