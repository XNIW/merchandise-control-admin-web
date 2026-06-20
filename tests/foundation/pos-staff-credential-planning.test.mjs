import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readAllMigrations() {
  const migrationsDir = join(root, "supabase/migrations");

  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
    .join("\n");
}

test("TASK-012 planning and evidence artifacts exist", () => {
  const taskPath = "docs/TASKS/TASK-012-pos-staff-credential-planning.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-012/README.md";
  const masterPlanPath = "docs/MASTER-PLAN.md";

  for (const relativePath of [taskPath, evidencePath, masterPlanPath]) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const task = readProjectFile(taskPath);
  const evidence = readProjectFile(evidencePath);
  const masterPlan = readProjectFile(masterPlanPath);

  assert.match(task, /Stato: `DONE`/);
  assert.match(task, /Fase attuale: `DONE_RECONCILED`/);
  assert.match(task, /Nessun login POS reale/);
  assert.match(task, /Nessun PIN\/password reale/);
  assert.match(task, /Nessuna migration esecutiva/);
  assert.match(evidence, /DONE_RECONCILED/);
  assert.match(masterPlan, /### TASK-012 - POS Staff Credential Planning \/ Schema Discovery/);
  assert.match(masterPlan, /TASK-012 - POS Staff Credential Planning \/ Schema Discovery[\s\S]*Stato: `DONE`/);
});

test("TASK-012 documents the staff credential security decisions", () => {
  const task = readProjectFile("docs/TASKS/TASK-012-pos-staff-credential-planning.md");

  for (const snippet of [
    "staff_accounts",
    "staff_code",
    "credential_hash",
    "Argon2id",
    "scrypt",
    "pgcrypto",
    "unique (shop_id, staff_code)",
    "credential_hash non deve essere selezionabile",
    "show temporary credential once",
    "<TEMP_CREDENTIAL_SHOWN_ONCE>",
    "<NOT_STORED>",
    "<REDACTED>",
    "shop_code + staff_code",
    "must_change_credential",
    "locked_until",
    "failed_attempts",
    "Account personale web e staff POS restano identita separate",
    "modulo interno della Shop Admin Console",
  ]) {
    assert.match(task, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(task, /SHA256 come hash credential/i);
});

test("TASK-012 avoids dangerous credential examples and keeps placeholders redacted", () => {
  const task = readProjectFile("docs/TASKS/TASK-012-pos-staff-credential-planning.md");
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-012/README.md");
  const taskAndEvidence = `${task}\n${evidence}`;
  const weakCredentialAlternation = [
    "12" + "34",
    "00" + "00",
    "pass" + "word",
    "ad" + "min",
  ].join("|");
  const dangerousCredentialExamples = [
    new RegExp(`(?:pin|password|credential|credenziale)\\s*(?:=|:|is|e|è)\\s*["'\`]?(?:${weakCredentialAlternation})["'\`]?`, "i"),
    new RegExp(`["'\`](?:${weakCredentialAlternation})["'\`]\\s*(?:as|come)\\s*(?:pin|password|credential|credenziale)`, "i"),
    new RegExp(`(?:pin|password|credential|credenziale)\\s+di\\s+esempio\\s+["'\`]?(?:${weakCredentialAlternation})["'\`]?`, "i"),
  ];

  assert.match(taskAndEvidence, /<TEMP_CREDENTIAL_SHOWN_ONCE>/);
  assert.match(taskAndEvidence, /<NOT_STORED>/);
  assert.match(taskAndEvidence, /<REDACTED>/);

  for (const pattern of dangerousCredentialExamples) {
    assert.doesNotMatch(taskAndEvidence, pattern);
  }
});

test("TASK-012 planning stays redacted as later staff runtime tasks land", () => {
  const task014Path = "docs/TASKS/TASK-014-integrated-auth-qa-design-pos-staff-foundation.md";
  const task015Path = "docs/TASKS/TASK-015-complete-shop-admin-console.md";
  const task014Present = existsSync(join(root, task014Path));
  const task015Present = existsSync(join(root, task015Path));
  const generatedTypes = readProjectFile("src/lib/supabase/database.types.ts");
  const migrations = readAllMigrations();
  const staffPage = readProjectFile("src/app/shop/staff/page.tsx");
  const serverShopFiles = readdirSync(join(root, "src/server/shop-admin"))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => readFileSync(join(root, "src/server/shop-admin", file), "utf8"))
    .join("\n");
  const staffMutations = existsSync(
    join(root, "src/server/shop-admin/staff-mutations.ts"),
  )
    ? readProjectFile("src/server/shop-admin/staff-mutations.ts")
    : "";
  const clientStaffUi = `${staffPage}\n${readProjectFile("src/components/shop/shopSections.ts")}`;

  if (task014Present) {
    assert.match(generatedTypes, /staff_accounts:\s*\{/);
    assert.match(migrations, /task_014_pos_staff_foundation/);
    assert.doesNotMatch(serverShopFiles, /pin_hash|password_hash|pos.*login|login.*pos/i);

    if (task015Present) {
      assert.match(migrations, /TASK-015: Shop Admin completion/);
      assert.match(serverShopFiles, /shop_staff_create/);
      assert.match(serverShopFiles, /staff\.manage/);
      assert.doesNotMatch(staffMutations, /\.(insert|update|delete|upsert)\s*\(/);
    } else {
      assert.doesNotMatch(
        serverShopFiles.replaceAll("SHOP_STAFF_PERMISSION_MATRIX", ""),
        /shop_staff_/i,
      );
    }
  } else {
    assert.doesNotMatch(generatedTypes, /staff_accounts:\s*\{/);
    assert.doesNotMatch(migrations, /create\s+table\s+(if\s+not\s+exists\s+)?public\.staff_accounts/i);
    assert.doesNotMatch(migrations, /credential_hash/i);
    assert.doesNotMatch(serverShopFiles, /staff_accounts|staff_code|credential_hash|pin_hash|password_hash|shop_staff_/i);
  }

  assert.match(staffPage, /ShopSectionPage/);
  assert.match(
    staffPage,
    /shopSections\.staff|getShopSectionForRequest\(\s*"staff"|resolveStaffPageBundle/,
  );
  if (task015Present) {
    assert.match(staffPage, /StaffActionPanel/);
  } else {
    assert.doesNotMatch(staffPage, /action=|formAction|createStaff|resetCredential/i);
  }
  assert.doesNotMatch(clientStaffUi, /credential_hash|pin_hash|password_hash/i);
});

test("TASK-012 security scan gate is wired", () => {
  const securityChecks = readProjectFile("scripts/security-checks.mjs");

  assert.match(securityChecks, /function checkTask012PosStaffCredentialPlanning/);
  assert.match(securityChecks, /checkTask012PosStaffCredentialPlanning\(\)/);
});
