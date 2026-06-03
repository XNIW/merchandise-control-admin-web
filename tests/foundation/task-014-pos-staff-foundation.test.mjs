import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readTask014Migration() {
  const migrationsDir = join(root, "supabase/migrations");
  const migrationName = readdirSync(migrationsDir).find((file) =>
    file.endsWith("_task_014_pos_staff_foundation.sql"),
  );

  assert.ok(migrationName, "TASK-014 staff foundation migration is missing");

  return readFileSync(join(migrationsDir, migrationName), "utf8");
}

test("TASK-014 governance artifacts are active", () => {
  const taskPath = "docs/TASKS/TASK-014-integrated-auth-qa-design-pos-staff-foundation.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-014/README.md";
  const masterPlanPath = "docs/MASTER-PLAN.md";

  for (const relativePath of [taskPath, evidencePath, masterPlanPath]) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const task = readProjectFile(taskPath);
  const evidence = readProjectFile(evidencePath);
  const masterPlan = readProjectFile(masterPlanPath);

  assert.match(task, /Stato: `(IN_PROGRESS|REVIEW|DONE)`/);
  assert.match(task, /Fase attuale: `(EXECUTION|REVIEW|DONE_RECONCILED)`/);
  assert.match(task, /Nessun login POS reale/);
  assert.match(task, /Nessuno staff account reale creato/);
  assert.match(evidence, /TASK-014/);
  assert.match(
    masterPlan,
    /Task attivo: `TASK-014 - Integrated Authenticated QA, Design System, POS Staff Foundation`|Task attivo: `TASK-015 - Complete Shop Admin Console: Inventory, Excel, Mobile History, Staff and Devices`|Task attivo: `TASK-016 - Complete Platform Admin Console`|Task attivo: `TASK-017 - Shop Business Completion`|Task attivo: `TASK-018 - Infrastructure, Security Hardening and POS Foundation`|Task attivo: `TASK-019 - POS Auth Foundation Implementation`|Task attivo: `TASK-020 - Win7POS Integration Planning`|Task attivo: `TASK-021 - POS backend session\/device endpoints`|Task attivo: `TASK-022_023 - POS live dashboard \+ Win7POS first login trusted device`|Task attivo: `TASK-026 - Shop Admin product catalog foundation`|Task attivo: `TASK-027 - Catalog pull delta sync and POS catalog hardening`|Task attivo: `TASK-028 - Catalog CRUD, Excel import\/export, and Win7POS catalog pull E2E`|Task attivo: `TASK-029 - Production path: staging, Win7POS bootstrap, POS API hardening`|Task attivo: `TASK-030 - Vercel deployment configuration diagnosis and safe main reconciliation`|Task attivo: `TASK-032 - Full project progression mega-task`|Task attivo: `TASK-033 - Controlled TASK-032 review \+ HTTPS non-production \+ Win7POS live E2E \+ POS reconciliation \+ sales sync foundation`|Task attivo: `TASK-034 - Unified project progression: VM pause, Admin Web polish, Shop hardening, Win7POS non-VM hardening, sales sync planning`|Task attivo: `TASK-035 - Authenticated Admin Web QA \+ Shop Admin smoke harness`|Task attivo: `TASK-036 - Admin Web web readiness, local dev, Cloudflared staging, Shop UX, Sync Center and production hardening`|Task attivo: `(NONE|NESSUNO)`/,
  );
  assert.match(
    masterPlan,
    /Fase: `(PLANNING|EXECUTION|REVIEW|REVIEW_WITH_BLOCKERS|IDLE|REVIEW_READY_FOR_DONE_CONFIRMATION|READY_FOR_DONE_CONFIRMATION|DONE_RECONCILED|DONE)`/,
  );
});

test("TASK-014 migration defines safe staff_accounts foundation", () => {
  const migrations = readTask014Migration();

  assert.match(migrations, /create table if not exists public\.staff_accounts/i);
  assert.match(migrations, /staff_id uuid primary key default gen_random_uuid\(\)/i);
  assert.match(migrations, /shop_id uuid not null references public\.shops\(shop_id\) on delete cascade/i);
  assert.match(migrations, /staff_accounts_staff_code_unique unique \(shop_id, staff_code\)/i);
  assert.match(migrations, /role_key in \('cashier', 'manager', 'viewer'\)/i);
  assert.match(migrations, /status in \('pending_credential', 'active', 'suspended', 'archived'\)/i);
  assert.match(migrations, /credential_kind is null or credential_kind in \('pin', 'password'\)/i);
  assert.match(migrations, /credential_hash text/i);
  assert.match(migrations, /alter table public\.staff_accounts enable row level security/i);
  assert.match(migrations, /create view public\.staff_accounts_safe\s+with \(security_invoker = true\)/i);
  assert.doesNotMatch(migrations, /staff_accounts_safe[\s\S]*credential_hash/i);
  assert.doesNotMatch(migrations, /grant\s+(insert|update|delete|all)[\s\S]*on table public\.staff_accounts[\s\S]*to authenticated/i);
  assert.doesNotMatch(migrations, /grant\s+.*on (table )?public\.staff_accounts[\s\S]*to anon/i);
});

test("TASK-014 staff credential runtime stays server-only and redacted", () => {
  const modulePath = "src/server/shop-admin/staff-credentials.ts";

  assert.equal(existsSync(join(root, modulePath)), true, `${modulePath} is missing`);

  const credentialModule = readProjectFile(modulePath);
  const clientUi = [
    "src/app/shop/staff/page.tsx",
    "src/components/shop/ShopSectionPage.tsx",
    "src/components/shop/shopSections.ts",
  ]
    .map(readProjectFile)
    .join("\n");

  assert.match(credentialModule, /import "server-only"/);
  assert.match(credentialModule, /scrypt/);
  assert.match(credentialModule, /timingSafeEqual/);
  assert.match(credentialModule, /hashStaffCredential/);
  assert.match(credentialModule, /verifyStaffCredential/);
  assert.match(credentialModule, /needsStaffCredentialRehash/);
  assert.match(credentialModule, /STAFF_CREDENTIAL_SCHEME/);
  assert.doesNotMatch(credentialModule, /console\.(log|debug|info|warn|error)/);
  assert.doesNotMatch(credentialModule, /["'`](?:1234|0000|password|test123|admin)["'`]/i);
  assert.doesNotMatch(clientUi, /credential_hash|pin_hash|password_hash|hashStaffCredential|verifyStaffCredential/);
});

test("TASK-014 staff read model and UI use safe fields only", () => {
  const readModelPath = "src/server/shop-admin/staff-read-model.ts";
  const sectionDataPath = "src/server/shop-admin/shop-section-data.ts";
  const staffPagePath = "src/app/shop/staff/page.tsx";
  const typesPath = "src/lib/supabase/database.types.ts";

  for (const relativePath of [readModelPath, sectionDataPath, staffPagePath, typesPath]) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const readModel = readProjectFile(readModelPath);
  const sectionData = readProjectFile(sectionDataPath);
  const staffPage = readProjectFile(staffPagePath);
  const types = readProjectFile(typesPath);

  assert.match(readModel, /import "server-only"/);
  assert.match(readModel, /\.from\("staff_accounts_safe"\)/);
  assert.match(readModel, /\.eq\("shop_id", selectedShop\.shopId\)/);
  assert.doesNotMatch(readModel, /credential_hash|select\("\*"\)|\.(insert|update|delete|upsert|rpc)\s*\(/);
  assert.match(sectionData, /buildStaffSection/);
  assert.match(sectionData, /getShopStaffReadModel/);
  assert.match(staffPage, /getShopSectionForRequest\(\s*"staff"/);
  assert.match(types, /staff_accounts:\s*\{/);
  assert.match(types, /staff_accounts_safe:\s*\{/);
});
