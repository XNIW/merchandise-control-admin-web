import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("TASK-020 planning artifacts exist and are reconciled to DONE", () => {
  const taskPath = "docs/TASKS/TASK-020-win7pos-integration-planning.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-020/README.md";

  assert.equal(existsSync(join(root, taskPath)), true, `${taskPath} is missing`);
  assert.equal(existsSync(join(root, evidencePath)), true, `${evidencePath} is missing`);

  const task = readProjectFile(taskPath);
  const evidence = readProjectFile(evidencePath);
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");

  assert.match(task, /Stato: `DONE`/);
  assert.match(task, /Fase: `DONE_RECONCILED`/);
  assert.match(task, /Verdict finale: `DONE`/);
  assert.match(evidence, /Stato task: `DONE`/);
  assert.match(evidence, /Fase: `DONE_RECONCILED`/);
  assert.match(evidence, /Verdict finale: `DONE`/);
  assert.match(masterPlan, /TASK-020 - Win7POS Integration Planning/);
  assert.match(
    masterPlan,
    /Stato globale attuale: `(IDLE|PLANNING|EXECUTION|REVIEW|REVIEW_WITH_BLOCKERS)`/,
  );
  assert.match(
    masterPlan,
    /Task attivo: `(NONE|NESSUNO)`|Task attivo: `TASK-021 - POS backend session\/device endpoints`|Task attivo: `TASK-022_023 - POS live dashboard \+ Win7POS first login trusted device`|Task attivo: `TASK-026 - Shop Admin product catalog foundation`|Task attivo: `TASK-027 - Catalog pull delta sync and POS catalog hardening`|Task attivo: `TASK-028 - Catalog CRUD, Excel import\/export, and Win7POS catalog pull E2E`|Task attivo: `TASK-029 - Production path: staging, Win7POS bootstrap, POS API hardening`|Task attivo: `TASK-030 - Vercel deployment configuration diagnosis and safe main reconciliation`|Task attivo: `TASK-032 - Full project progression mega-task`|Task attivo: `TASK-033 - Controlled TASK-032 review \+ HTTPS non-production \+ Win7POS live E2E \+ POS reconciliation \+ sales sync foundation`|Task attivo: `TASK-034 - Unified project progression: VM pause, Admin Web polish, Shop hardening, Win7POS non-VM hardening, sales sync planning`|Task attivo: `TASK-035 - Authenticated Admin Web QA \+ Shop Admin smoke harness`|Task attivo: `TASK-036 - Admin Web web readiness, local dev, Cloudflared staging, Shop UX, Sync Center and production hardening`|Task attivo: `TASK-038 - POS manager web login, Platform provisioning, role permission tree, and real revenue dashboard gate`/,
  );
});

test("TASK-020 is repo-grounded on Admin Web and Win7POS findings", () => {
  const task = readProjectFile("docs/TASKS/TASK-020-win7pos-integration-planning.md");
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-020/README.md");
  const combined = `${task}\n${evidence}`;

  for (const required of [
    "Win7POS",
    "/Users/minxiang/Projects/Win7POS",
    "aa545fc",
    "net48",
    "x86",
    "SQLite",
    "OperatorLoginDialog",
    "FirstRunSetupDialog",
    "SaleRepository",
    "PaymentViewModel",
    "shop_devices",
    "staff_accounts_safe",
    "sync_events",
    "NOT_FOUND",
  ]) {
    assert.match(combined, new RegExp(escapeRegExp(required)));
  }
});

test("TASK-020 defines the required POS integration plan areas", () => {
  const task = readProjectFile("docs/TASKS/TASK-020-win7pos-integration-planning.md");

  for (const required of [
    "Prima configurazione online",
    "Uso quotidiano trusted device",
    "Revoca e sospensione",
    "Online/offline",
    "Modello backend necessario",
    "Sync vendite proposto",
    "Dashboard Admin Web futura",
    "Sicurezza",
    "TASK-021 - POS backend session/device endpoints",
    "TASK-022 - Admin Web POS live dashboard",
    "TASK-023 - Win7POS first login/trusted device client",
    "TASK-024 - Win7POS sales sync",
    "TASK-025 - Mobile/POS enforcement polish",
  ]) {
    assert.match(task, new RegExp(escapeRegExp(required)));
  }
});

test("TASK-020 stays planning-only with no POS endpoint, runtime code, or migration", () => {
  const migrationFiles = readdirSync(join(root, "supabase/migrations"));
  const task = readProjectFile("docs/TASKS/TASK-020-win7pos-integration-planning.md");
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-020/README.md");
  const securityChecks = readProjectFile("scripts/security-checks.mjs");
  const task021Exists = existsSync(
    join(root, "docs/TASKS/TASK-021-pos-backend-session-device-endpoints.md"),
  );
  const allowedTask021Routes = [
    "src/app/api/pos/auth/first-login/route.ts",
    "src/app/api/pos/session/heartbeat/route.ts",
  ];

  assert.equal(
    migrationFiles.some((file) => /task_020|task-020/i.test(file)),
    false,
    "TASK-020 must not create a migration",
  );
  assert.equal(existsSync(join(root, "src/app/api/pos/login")), false);
  assert.equal(
    existsSync(join(root, "src/app/api/pos")),
    task021Exists,
    "Only TASK-021 may introduce the scoped POS backend route directory",
  );
  for (const route of allowedTask021Routes) {
    assert.equal(
      existsSync(join(root, route)),
      task021Exists,
      `${route} must exist only after TASK-021 opens`,
    );
  }
  assert.equal(existsSync(join(root, "src/app/pos")), false);
  assert.equal(existsSync(join(root, "Win7POS")), false);
  assert.equal(existsSync(join(root, "src/Win7POS")), false);

  assert.match(task, /Non implementare login POS reale/);
  assert.match(task, /Nessuna migration TASK-020 creata o applicata/);
  assert.match(evidence, /Nessun endpoint pubblico POS: `CONFIRMED`/);
  assert.match(evidence, /Nessuna modifica Win7POS: `CONFIRMED`/);
  assert.match(evidence, /Nessuna migration TASK-020 applicata: `CONFIRMED`/);
  assert.match(securityChecks, /checkTask020Win7PosIntegrationPlanning/);
});
