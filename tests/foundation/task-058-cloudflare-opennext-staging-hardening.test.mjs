import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertContains(source, required, label = required) {
  assert.match(
    source,
    new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    label,
  );
}

function parseJson(relativePath) {
  return JSON.parse(readProjectFile(relativePath));
}

test("TASK-058 governance reconciles TASK-057 before opening Cloudflare execution", () => {
  for (const requiredPath of [
    "docs/TASKS/TASK-057-shop-catalog-workspace-import-intelligence.md",
    "docs/TASKS/EVIDENCE/TASK-057/README.md",
    "docs/TASKS/TASK-058-cloudflare-opennext-staging-hardening.md",
    "docs/TASKS/EVIDENCE/TASK-058/README.md",
  ]) {
    assert.equal(existsSync(join(root, requiredPath)), true, `${requiredPath} is missing`);
  }

  const task057 = readProjectFile(
    "docs/TASKS/TASK-057-shop-catalog-workspace-import-intelligence.md",
  );
  const evidence057 = readProjectFile("docs/TASKS/EVIDENCE/TASK-057/README.md");
  const task058 = readProjectFile(
    "docs/TASKS/TASK-058-cloudflare-opennext-staging-hardening.md",
  );
  const evidence058 = readProjectFile("docs/TASKS/EVIDENCE/TASK-058/README.md");
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");
  const combined = `${task058}\n${evidence058}\n${masterPlan}`;

  assertContains(task057, "DONE_RECONCILED");
  assertContains(evidence057, "DONE_RECONCILED");
  assertContains(masterPlan, "Stato TASK-057: `DONE_RECONCILED`");
  assert.match(
    masterPlan,
    /Task attivo: `TASK-058 - Cloudflare\/OpenNext Staging Hardening and Deployment Governance`|Task attivo: `TASK-081 - Win7POS Sales Sync, Daily\/Monthly Revenue, Stock Sync and Shop Admin POS Revenue`/,
  );

  for (const required of [
    "TASK-058",
    "Cloudflare/OpenNext Staging Hardening and Deployment Governance",
    "REVIEW_WITH_EXTERNAL_BLOCKERS",
    "REVIEWER",
    "Non include",
    "deploy production",
    "DNS cutover production",
    "Vercel",
    "Supabase staging",
    "WAF/rate-limit",
    "rollback",
  ]) {
    assertContains(combined, required);
  }
});

test("TASK-058 package and Cloudflare workflow keep production manually gated", () => {
  const packageJson = parseJson("package.json");
  const scripts = packageJson.scripts;
  const workflow = readProjectFile(".github/workflows/cloudflare.yml");
  const vercel = parseJson("vercel.json");

  for (const scriptName of [
    "cf:build",
    "cf:preview",
    "cf:deploy:staging",
    "smoke:cloudflare:local",
    "smoke:staging",
    "test:cloudflare:local",
  ]) {
    assert.equal(typeof scripts[scriptName], "string", `${scriptName} is missing`);
  }

  assert.match(scripts["cf:deploy:staging"], /wrangler deploy --env staging --keep-vars/);
  assert.doesNotMatch(JSON.stringify(scripts), /cf:deploy:production|vercel deploy|vercel --prod|wrangler deploy --env production/);
  assert.equal(vercel.git?.deploymentEnabled, false);

  for (const required of [
    "environment: cloudflare-staging",
    "environment: cloudflare-production",
    "workflow_dispatch",
    "inputs.target == 'production'",
    "github.ref == 'refs/heads/main'",
    "inputs.confirm_staging_gates_passed",
    "inputs.confirm_user_approved_production",
    "npx wrangler deploy --env staging --keep-vars",
    "npx wrangler deploy --env production --keep-vars",
    "CF_SMOKE_SKIP_BUILD=1 npm run smoke:cloudflare:local",
    "npm run smoke:staging",
  ]) {
    assertContains(workflow, required);
  }

  assert.doesNotMatch(
    workflow,
    /push:[\s\S]{0,240}deploy-production|vercel|SUPABASE_SERVICE_ROLE_KEY/,
  );
});

test("TASK-058 wrangler and OpenNext config separate staging and production without secrets", () => {
  const wranglerSource = readProjectFile("wrangler.jsonc");
  const wrangler = JSON.parse(wranglerSource);
  const openNextConfig = readProjectFile("open-next.config.ts");

  assert.equal(wrangler.name, "merchandise-control-admin-web");
  assert.equal(wrangler.main, ".open-next/worker.js");
  assert.equal(wrangler.compatibility_date, "2026-06-10");
  assert.ok(wrangler.compatibility_flags.includes("nodejs_compat"));
  assert.ok(wrangler.compatibility_flags.includes("global_fetch_strictly_public"));
  assert.equal(wrangler.env?.staging?.name, "merchandise-control-admin-web-staging");
  assert.equal(wrangler.env?.production?.name, "merchandise-control-admin-web");
  assert.notEqual(wrangler.env?.staging?.name, wrangler.env?.production?.name);
  assert.equal(wrangler.env?.staging?.workers_dev, true);
  assert.equal(wrangler.env?.production?.workers_dev, true);
  assert.equal("routes" in wrangler, false);
  assert.equal("route" in wrangler, false);
  assert.doesNotMatch(wranglerSource, /SUPABASE_SERVICE_ROLE_KEY\s*:|CLOUDFLARE_API_TOKEN|password|secret/i);

  assertContains(openNextConfig, "defineCloudflareConfig");
  assert.doesNotMatch(openNextConfig, /\/Users\/|production|SUPABASE_SERVICE_ROLE_KEY|CLOUDFLARE_API_TOKEN/i);
});

test("TASK-058 Cloudflare local smoke covers guards, no-store and secret redaction", () => {
  const smoke = readProjectFile("scripts/testing/cloudflare-local-smoke.mjs");

  for (const required of [
    "wrangler",
    "dev",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    "stopPreview",
    "SIGTERM",
    "/auth/login",
    "/platform",
    "/shop",
    "/shop/products",
    "/api/pos/auth/first-login",
    "/api/pos/session/heartbeat",
    "/api/pos/catalog/import-sync",
    "/api/pos/catalog/pull",
    "/api/pos/sales/sync",
    "POS method guard",
    'method: "GET"',
    "expect: [405]",
    "/shop/import-export/preview",
    "/shop/import-export/apply",
    "/shop/import-export/export",
    "/shop/import-export/template",
    "requireNoStore",
    "secretPattern",
  ]) {
    assertContains(smoke, required);
  }

  assert.doesNotMatch(smoke, /CLOUDFLARE_API_TOKEN\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|console\.log\(.*process\.env/i);
});

test("TASK-058 sensitive route handlers stay node runtime and no-store", () => {
  const routePaths = [
    "src/app/shop/import-export/preview/route.ts",
    "src/app/shop/import-export/apply/route.ts",
    "src/app/shop/import-export/export/route.ts",
    "src/app/shop/import-export/template/route.ts",
  ];
  const posRoutePaths = [
    "src/app/api/pos/auth/first-login/route.ts",
    "src/app/api/pos/session/heartbeat/route.ts",
    "src/app/api/pos/catalog/import-sync/route.ts",
    "src/app/api/pos/catalog/pull/route.ts",
    "src/app/api/pos/sales/sync/route.ts",
  ];
  const posHelper = readProjectFile("src/app/api/pos/_shared/pos-route-security.ts");

  for (const routePath of routePaths) {
    const route = readProjectFile(routePath);

    assertContains(route, 'export const dynamic = "force-dynamic"');
    assertContains(route, 'export const runtime = "nodejs"');
    assertContains(route, '"Cache-Control": "no-store"');
    assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|service_role|credential_hash/i);
  }

  for (const routePath of posRoutePaths) {
    const route = readProjectFile(routePath);

    assertContains(route, 'export const dynamic = "force-dynamic"');
    assertContains(route, 'export const runtime = "nodejs"');
    assert.doesNotMatch(route, /export async function GET|SUPABASE_SERVICE_ROLE_KEY|credential_hash|service_role/i);
  }

  assertContains(posHelper, '"Cache-Control": "no-store"');
});

test("TASK-058 runbooks document staging blockers, WAF, rollback and environment setup", () => {
  const migration = readProjectFile("docs/DEPLOYMENT/CLOUDFLARE-MIGRATION.md");
  const rollback = readProjectFile("docs/DEPLOYMENT/CLOUDFLARE-ROLLBACK.md");
  const waf = readProjectFile("docs/DEPLOYMENT/CLOUDFLARE-WAF-RATE-LIMIT.md");
  const readiness = readProjectFile("docs/DEPLOYMENT/PRODUCTION-READINESS-CHECKLIST.md");

  for (const required of [
    "BLOCKED_CLOUDFLARE_API_TOKEN",
    "BLOCKED_CLOUDFLARE_ACCOUNT_ID",
    "BLOCKED_SUPABASE_STAGING",
    "cloudflare-staging",
    "cloudflare-production",
    "npm run smoke:cloudflare:local",
    "npm run cf:deploy:staging",
    "NOT_RUN_PRODUCTION_FORBIDDEN",
  ]) {
    assertContains(migration, required);
  }

  for (const required of [
    "wrangler deployments list --env staging",
    "wrangler rollback --env staging",
    "wrangler deployments status --env production",
    "Incident checklist",
    "approval",
    "secret",
  ]) {
    assertContains(rollback, required);
  }

  for (const required of [
    "/auth/login",
    "/shop/staff-login",
    "/platform/provisioning",
    "/platform/operations",
    "/shop/import-export",
    "/api/pos/auth/first-login",
    "/api/pos/session/heartbeat",
    "/api/pos/catalog/import-sync",
    "/api/pos/catalog/pull",
    "/api/pos/sales/sync",
    "log-first",
    "False-positive handling",
    "safe operations",
    "rollback",
    "do not",
  ]) {
    assertContains(waf, required);
  }

  assertContains(readiness, "Smoke Cloudflare/OpenNext locale");
});
