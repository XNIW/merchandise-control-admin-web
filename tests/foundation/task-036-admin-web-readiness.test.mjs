import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertContains(source, required, label = required) {
  assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), label);
}

test("TASK-036 governance and operational docs record explicit DONE without production-ready claims", () => {
  const requiredPaths = [
    "docs/TASKS/TASK-036-admin-web-web-readiness-local-dev-cloudflared-shop-sync-production-hardening.md",
    "docs/TASKS/EVIDENCE/TASK-036/README.md",
    "docs/DEPLOYMENT/CLOUDFLARED-NON-PRODUCTION.md",
    "docs/DEVELOPMENT/SUPABASE-LOCAL-DEV.md",
    "docs/DEPLOYMENT/PRODUCTION-READINESS-CHECKLIST.md",
  ];

  for (const relativePath of requiredPaths) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const combined = [
    ...requiredPaths.map(readProjectFile),
    readProjectFile("docs/MASTER-PLAN.md"),
  ].join("\n");
  const taskAndEvidence = [
    readProjectFile(requiredPaths[0]),
    readProjectFile(requiredPaths[1]),
  ].join("\n");

  for (const required of [
    "TASK-036",
    "Stato task: `DONE`",
    "Fase: `DONE`",
    "Verdict corrente: `DONE`",
    "conferma esplicita",
    "READY_FOR_DONE_CONFIRMATION",
    "PASS_WITH_NOTES_READY_FOR_DONE_CONFIRMATION",
    "Cloudflared Quick Tunnel",
    "HTTPS temporaneo/non-production",
    "git.deploymentEnabled=false",
    "SUPABASE_SERVICE_ROLE_KEY",
    "MerchandiseControlSupabase",
    "supabase_db_merchandise-control-admin-web",
    "Win7POS live E2E resta parcheggiato",
    "TASK-024 Sales Sync resta DEFERRED",
    "non dichiara production-ready globale",
  ]) {
    assertContains(combined, required);
  }

  assert.match(taskAndEvidence, /Stato: `DONE`|Stato task: `DONE`/);
  assert.doesNotMatch(combined, /production-ready globale:\s*(true|ready)|go-live approved/i);
});

test("TASK-036 npm scripts are safe local helpers and Vercel remains parked", () => {
  const packageJson = JSON.parse(readProjectFile("package.json"));
  const script = readProjectFile("scripts/dev-supabase-check.mjs");
  const vercel = JSON.parse(readProjectFile("vercel.json"));

  assert.equal(
    packageJson.scripts["dev:tunnel"],
    "cloudflared tunnel --url http://127.0.0.1:3000 --no-autoupdate",
  );
  assert.equal(packageJson.scripts["dev:db:check"], "node scripts/dev-supabase-check.mjs");
  assert.equal(
    packageJson.scripts["dev:db:status"],
    "node scripts/dev-supabase-check.mjs --status",
  );
  assert.equal(vercel.git?.deploymentEnabled, false);

  for (const required of [
    "redactSupabaseStatus",
    "sensitiveStatusEnvKeys",
    "ANON_KEY",
    "SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL_TARGET",
    "local/dev checks fail closed",
    "service[_ -]?role key",
    "supabase_db_",
  ]) {
    assertContains(script, required);
  }

  assert.doesNotMatch(script, /process\.env\.SUPABASE_SERVICE_ROLE_KEY|console\.log\(.*value/i);
  assert.doesNotMatch(script, /run\("which",\s*\["supabase"\]\)/);
});

test("TASK-036 Sync Center has server-side filters and redacted diagnostics without sales sync", () => {
  const page = readProjectFile("src/app/shop/sync/page.tsx");
  const sectionData = readProjectFile("src/server/shop-admin/shop-section-data.ts");
  const dictionary = readProjectFile("src/i18n/dictionaries.ts");
  const localizedSources = `${page}\n${sectionData}\n${dictionary}`;
  const syncSlice = sectionData.slice(
    sectionData.indexOf("export function buildSyncSection"),
    sectionData.indexOf("function historyDetailRow"),
  );

  for (const required of [
    "Apply filters",
    "Clear filters",
    "Source or device",
    "SYNC_FILTER_MAX_LENGTH = 160",
    "getBoundedFilterParam",
    "getStatusFilterParam",
    "maxLength={SYNC_FILTER_MAX_LENGTH}",
    "name=\"status\"",
    "syncFilters",
    "applySyncFilters",
    "normalizeSyncFilter",
    "slice(0, SYNC_FILTER_MAX_LENGTH)",
    "metadataSummary",
    "Latest error",
    "Filtered result set",
    "no sync rows match the current filters.",
  ]) {
    assertContains(localizedSources, required);
  }

  assert.doesNotMatch(`${page}\n${syncSlice}`, /sales|retry|offline queue|export async function POST/i);
});

test("TASK-036 destructive catalog actions require operator reasons", () => {
  const panel = readProjectFile("src/app/shop/_components/CatalogActionPanel.tsx");
  const mutations = readProjectFile("src/server/shop-admin/catalog-mutations.ts");

  for (const required of [
    "catalogReasonRequired",
    "A reason is required for catalog archive or restore actions.",
    "Required for the audit trail.",
    "maxLength={240}",
    "reason.slice(0, 240)",
    "p_reason: reason",
    "shop_catalog_archive_product",
    "shop_catalog_restore_product",
    "shop_catalog_archive_category",
    "shop_catalog_archive_supplier",
  ]) {
    assertContains(`${panel}\n${mutations}`, required);
  }
});
