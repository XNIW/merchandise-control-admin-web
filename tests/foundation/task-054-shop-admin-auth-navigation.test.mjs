import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertContains(source, required, label = required) {
  assert.match(
    source,
    new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    label,
  );
}

test("TASK-054 Supabase proxy validates server sessions without getSession", () => {
  const proxy = read("src/lib/supabase/proxy.ts");

  assertContains(proxy, "createServerClient");
  assertContains(proxy, "auth.getClaims()");
  assert.doesNotMatch(proxy, /auth\.getSession\(\)/);
  assertContains(proxy, "request.cookies.set");
  assertContains(proxy, "response.cookies.set");
  assert.doesNotMatch(proxy, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});

test("TASK-054 Shop Admin data access does not mask personal-account failures as missing staff cookie", () => {
  const dataAccess = read("src/server/shop-admin/data-access.ts");
  const staffWebAuth = read("src/server/shop-admin/staff-web-auth.ts");

  assertContains(staffWebAuth, "STAFF_WEB_SESSION_MISSING_REASON");
  assertContains(dataAccess, "personalAccountBlockedAccess");
  assertContains(dataAccess, "STAFF_WEB_SESSION_MISSING_REASON");
  assertContains(dataAccess, "staffResolution.reason === STAFF_WEB_SESSION_MISSING_REASON");
  assertContains(dataAccess, "return personalAccountBlockedAccess");
  assert.doesNotMatch(
    dataAccess,
    /reason:\s*staffResolution\.reason\s*\?\?\s*"No personal account or staff web session is authorized for Admin Console\."/,
  );
});

test("TASK-062 corrective: staff web session takes precedence over stale personal auth", () => {
  const dataAccess = read("src/server/shop-admin/data-access.ts");

  const staffResolutionIndex = dataAccess.indexOf(
    "const staffResolution = await resolveStaffWebSessionPrincipal();",
  );
  const personalResolutionIndex = dataAccess.indexOf(
    "const personalResolution = await resolveCurrentShopAdminPrincipal(serverClient);",
  );

  assert.notEqual(staffResolutionIndex, -1);
  assert.notEqual(personalResolutionIndex, -1);
  assert.ok(
    staffResolutionIndex < personalResolutionIndex,
    "staff web session must be resolved before Supabase personal account auth",
  );
  assertContains(dataAccess, 'staffResolution.status === "ready"');
  assertContains(dataAccess, 'principalKind: "pos_staff_manager"');
  assertContains(dataAccess, "staffResolution.reason !== STAFF_WEB_SESSION_MISSING_REASON");
  assertContains(dataAccess, "statusForAccessState(staffResolution.status)");
  assertContains(dataAccess, "return personalAccountBlockedAccess");
});

test("TASK-054 Shop shell keeps only shop_id during cross-section navigation", () => {
  const shell = read("src/components/shop/ShopShell.tsx");

  assertContains(shell, "useState");
  assertContains(shell, "optimisticActive");
  assertContains(shell, "new URLSearchParams()");
  assertContains(shell, "nextSearchParams.set(\"shop_id\", selectedShop.shopId)");
  assert.doesNotMatch(shell, /new URLSearchParams\(searchParams\.toString\(\)\)/);
  assertContains(shell, "onClick={() =>");
  assertContains(shell, "setOptimisticActive");
});

test("TASK-054 shared diagnostics move from each page into the Shop sidebar", () => {
  const sectionPage = read("src/components/shop/ShopSectionPage.tsx");
  const shell = read("src/components/shop/ShopShell.tsx");
  const sections = read("src/components/shop/shopSections.ts");
  const dictionary = read("src/i18n/dictionaries.ts");

  assert.doesNotMatch(sectionPage, />\s*Diagnostics\s*</);
  assert.doesNotMatch(sectionPage, /GuardrailNotice/);
  assert.doesNotMatch(shell, /GuardrailNotice/);
  assertContains(shell, "sharedGuardrails");
  assertContains(shell, "<details");
  assertContains(shell, "{labels.shopSafety}");
  assertContains(sections, "sharedShopGuardrails");
  assertContains(sections, "export const sharedShopGuardrails");
  assertContains(dictionary, "Shop safety");
  assertContains(
    sections,
    "Credential hashes, PINs, passwords and raw tokens must never be rendered.",
  );
  assertContains(sections, "guardrails: sharedShopGuardrails");
  assert.doesNotMatch(sections, /Token hashes and raw tokens must never be rendered/);
});

test("TASK-054 Shop Admin copy separates live Excel, roles baseline, POS staff, mapping, and settings semantics", () => {
  const sections = read("src/components/shop/shopSections.ts");
  const sectionData = read("src/server/shop-admin/shop-section-data.ts");
  const settingsPage = read("src/app/shop/settings/page.tsx");
  const dictionary = read("src/i18n/dictionaries.ts");

  assertContains(sections, "Excel workbook import/export");
  assertContains(sections, "baseline permission matrix");
  assertContains(sections, "POS Staff inside Admin Console");
  assertContains(sectionData, "Mapping required");
  assertContains(sectionData, "Shop access verified");
  assertContains(`${settingsPage}\n${dictionary}`, "Master Console only");
  assertContains(
    `${settingsPage}\n${dictionary}`,
    "Shop profile and fiscal identity are managed by Master Console. Admin Console can view these fields but cannot edit them.",
  );
  assert.doesNotMatch(settingsPage, /Update settings|Type SETTINGS as confirmation/);
  assert.doesNotMatch(sections, /CSV fallback is preferred/i);
  assert.doesNotMatch(sections, /console separata|separate console/i);
});

test("TASK-054 task and Master Plan tracking are aligned for DONE reconciliation", () => {
  const taskPath = "docs/TASKS/TASK-054-shop-admin-auth-navigation-sidebar-diagnostics.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-054/README.md";
  const safariEvidencePath =
    "docs/TASKS/EVIDENCE/TASK-054/safari-localhost-127-webdriver.json";
  const masterPlanPath = "docs/MASTER-PLAN.md";

  assert.equal(existsSync(join(root, taskPath)), true, `${taskPath} is missing`);
  assert.equal(
    existsSync(join(root, evidencePath)),
    true,
    `${evidencePath} is missing`,
  );
  assert.equal(
    existsSync(join(root, safariEvidencePath)),
    true,
    `${safariEvidencePath} is missing`,
  );

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const masterPlan = read(masterPlanPath);

  assertContains(task, "Stato: `DONE`");
  assertContains(task, "Fase attuale: `DONE`");
  assertContains(task, "Verdict operativo: `DONE_WITH_NOTES`");
  assertContains(task, "CA-13");
  assertContains(task, "TASK-054C");
  assertContains(evidence, "Verdict corrente: `DONE_WITH_NOTES`");
  assertContains(evidence, "Safari reale via `safaridriver` su `3054`");
  assertContains(evidence, "localhost:3054");
  assertContains(evidence, "127.0.0.1:3054");
  assertContains(evidence, "Safari reale via `safaridriver` su `3058`");
  assertContains(evidence, "TASK054R_*");
  assertContains(evidence, "Safari reale via `safaridriver` su `3059`");
  assertContains(evidence, "TASK054D_*");
  assertContains(evidence, "DONE_WITH_NOTES");
  assertContains(evidence, "npm run test:foundation");
  assertContains(
    evidence,
    "PLAYWRIGHT_DISABLE_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:shop:local",
  );
  assertContains(masterPlan, "Stato TASK-053: `DONE`");
  assertContains(masterPlan, "Verdict TASK-053: `DONE`");
  assertContains(masterPlan, "Stato TASK-054: `DONE`");
  assertContains(masterPlan, "Fase TASK-054: `DONE`");
  assert.match(masterPlan, /Stato globale attuale: `(IDLE|REVIEW|EXECUTION|REVIEW_WITH_EXTERNAL_BLOCKERS|TASK_ACTIVE)`/);
  assertContains(masterPlan, "TASK-054C");
  assertContains(masterPlan, "Safari reale verificato");
  assertContains(masterPlan, "Final DONE confirmation");
  assertContains(masterPlan, "Verdict TASK-054: `DONE_WITH_NOTES`");
  assertContains(masterPlan, "Safari reale via `safaridriver` PASS su server dedicato");
  assert.match(
    masterPlan,
    /Task attivo: `(NESSUNO|Nessuno)`|Task attivo: `TASK-057 - Shop Catalog Workspace: prodotti, categorie, fornitori e import Excel intelligente`|Task attivo: `TASK-058 - Cloudflare\/OpenNext Staging Hardening and Deployment Governance`|Task attivo: `TASK-065 - Fix Master Console Google OAuth redirect`/,
  );
  assertContains(masterPlan, "Stato TASK-055: `DONE_RECONCILED`");
  assertContains(masterPlan, "Stato TASK-056: `DONE_RECONCILED`");
  assert.match(
    masterPlan,
    /Ultimo task chiuso: `TASK-056 - Master Console shop detail editing and row navigation shortcut`|Ultimo task chiuso: `TASK-057 - Shop Catalog Workspace: prodotti, categorie, fornitori e import Excel intelligente`|Ultimo task chiuso: `TASK-059 - Post-merge Supabase Staging Readiness`|Ultimo task chiuso: `TASK-060 - Supplier Excel Android-style preview\/import`|Ultimo task chiuso: `TASK-061 - Android database export compatibility for Admin Web database transfer`|Ultimo task chiuso: `TASK-064 - Master Console Auth\/Profile Parity e ricerca utenti Android\/iOS`|Ultimo task chiuso: `TASK-067 - Master Console lifecycle management, admin assignment, and safe cleanup`|Ultimo task chiuso: `TASK-071 - Final closure and fix-all for TASK-068 \/ TASK-069 \/ TASK-070`|Ultimo task chiuso: `TASK-072 - Cross-platform catalog sync and History Entry write path for Admin Web, Android and iOS`|Ultimo task chiuso: `TASK-073 - Account identity display globale`/,
  );
  assert.doesNotMatch(
    masterPlan,
    /Task attivo: `TASK-053 - Authorization architecture and staff safe read boundary fix`/,
  );
  assert.doesNotMatch(
    masterPlan,
    /Task attivo: `TASK-054 - Stabilizzare Shop Admin auth navigation e ripulire sidebar\/diagnostics`/,
  );
});
