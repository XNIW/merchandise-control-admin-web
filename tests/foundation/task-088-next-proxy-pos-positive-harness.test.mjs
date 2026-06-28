import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const proxyMatcher =
  "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml)$).*)";

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function proxyMatches(url) {
  const pathname = url.split("?")[0];
  return new RegExp(`^${proxyMatcher}$`).test(pathname);
}

test("TASK-088 Next proxy migration keeps middleware semantics without deprecated convention", () => {
  assert.equal(existsSync(join(root, "src/proxy.ts")), true, "src/proxy.ts missing");
  assert.equal(
    existsSync(join(root, "src/middleware.ts")),
    false,
    "src/middleware.ts should not remain after proxy migration",
  );

  const proxy = readProjectFile("src/proxy.ts");

  assert.match(proxy, /export function proxy\(_request: NextRequest\)/);
  assert.doesNotMatch(proxy, /function middleware|export async function middleware/);
  assert.doesNotMatch(proxy, /runtime\s*=/);
  assert.match(proxy, /NextResponse\.next\(\)/);
  assert.doesNotMatch(proxy, /@supabase\/ssr|updateSupabaseSession|SUPABASE_SERVICE_ROLE_KEY|service_role/i);
  assert.match(proxy, /_next\/static\|_next\/image\|favicon\.ico/);
  assert.match(proxy, /svg\|png\|jpg\|jpeg\|gif\|webp\|ico\|css\|js\|map\|txt\|xml/);
});

test("TASK-088 proxy matcher keeps app, shop and POS API coverage while excluding assets", () => {
  for (const url of [
    "/",
    "/auth/login",
    "/shop",
    "/shop/products",
    "/platform",
    "/api/pos/auth/first-login",
    "/api/pos/catalog/pull",
    "/api/pos/sales/sync",
    "/api/pos/session/heartbeat",
  ]) {
    assert.equal(
      proxyMatches(url),
      true,
      `${url} should keep proxy coverage`,
    );
  }

  for (const url of [
    "/_next/static/chunks/app.js",
    "/_next/image?url=%2Flogo.png&w=128&q=75",
    "/favicon.ico",
    "/robots.txt",
    "/image.png",
    "/styles.css",
  ]) {
    assert.equal(
      proxyMatches(url),
      false,
      `${url} should stay excluded from proxy coverage`,
    );
  }
});

test("TASK-088 POS positive harness is dataset-gated, sales-aware and cleanup-safe", () => {
  const script = readProjectFile("scripts/pos-local-e2e-harness.mjs");
  const readme = readProjectFile("README.md");

  for (const required of [
    "TASK032_POS_E2E_ENABLE_POSITIVE",
    "TASK032_POS_E2E_ALLOW_DATASET_SETUP",
    "TASK032_POS_E2E_ALLOW_CLEANUP",
    "TASK032_POS_E2E_ALLOW_STAGING",
    "TASK032_POS_E2E_STAGING_DRY_RUN",
    "TASK032_POS_E2E_STAGING_HOST_ALLOWLIST",
    "TASK032_POS_E2E_STAGING_PROJECT_REF",
    "TASK032_POS_E2E_REQUIRE_TEST_MARKER",
    "TASK032_POS_E2E_TEST_RUN_ID",
    "SYNTHETIC_SHOP_CODE_PREFIX",
    "TASK032_TEST_SHOP_",
    "PASS_STAGING_PRECHECK_DRY_RUN",
    "validatePositiveTarget",
    "validateStagingDryRunConfig",
    "applySyntheticStaffScope",
    "shopCodeLike",
    "staffCodeLike",
    "cleanupSyntheticSalesRecords",
    "pos_sale_stock_movements",
    "pos_revenue_ledger_entries",
    "pos_sale_lines",
    "pos_sales",
    "pos_sales_sync_batches",
    "/api/pos/sales/sync",
    "pos-sales-ledger-v2",
    "parseSalesSyncConflict",
    "stockQuantityAfterDuplicate",
    "pos.sales.sync.success",
  ]) {
    assert.match(script, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(script, /both be local or both be explicitly allowlisted staging/);
  assert.match(script, /Staging Admin Web host is not in TASK032_POS_E2E_STAGING_HOST_ALLOWLIST/);
  assert.match(script, /Supabase URL does not match the allowlisted staging project ref/);
  assert.match(script, /Test marker must be exactly TASK032/);
  assert.match(script, /Staging synthetic identifiers must include TASK032_POS_E2E_TEST_RUN_ID/);
  assert.match(script, /baseHost\.endsWith\("vercel\.app"\)/);
  assert.doesNotMatch(script, /\.truncate\(/);
  assert.doesNotMatch(script, /console\.log\([^)]*(sessionToken|trustedDeviceToken|SUPABASE_SERVICE_ROLE_KEY)/);
  assert.match(readme, /TASK032_POS_E2E_ALLOW_DATASET_SETUP=yes/);
  assert.match(readme, /TASK032_POS_E2E_ALLOW_CLEANUP=yes/);
});
