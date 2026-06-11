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

function readTask021Migration() {
  const migrationsDir = join(root, "supabase/migrations");
  const migrationName = readdirSync(migrationsDir).find((file) =>
    file.endsWith("_task_021_pos_sessions_devices.sql"),
  );

  assert.ok(migrationName, "TASK-021 POS session/device migration is missing");

  return readProjectFile(`supabase/migrations/${migrationName}`);
}

test("TASK-021 governance artifacts track execution or explicit reconciliation", () => {
  const taskPath = "docs/TASKS/TASK-021-pos-backend-session-device-endpoints.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-021/README.md";

  assert.equal(existsSync(join(root, taskPath)), true, `${taskPath} is missing`);
  assert.equal(existsSync(join(root, evidencePath)), true, `${evidencePath} is missing`);

  const task = readProjectFile(taskPath);
  const evidence = readProjectFile(evidencePath);
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");

  for (const required of [
    "Route Handler Next.js",
    "server-only",
    "service-role solo server-side",
    "No sales sync",
    "trusted device token hash",
    "heartbeat",
    "revoca device",
  ]) {
    assert.match(`${task}\n${evidence}`, new RegExp(escapeRegExp(required)));
  }

  assert.match(task, /Stato: `(IN_PROGRESS|REVIEW|DONE)`/);
  assert.match(masterPlan, /TASK-021 - POS backend session\/device endpoints/);

  if (/Stato: `DONE`/.test(task)) {
    assert.match(task, /Fase: `DONE_RECONCILED`/);
    assert.match(evidence, /Fase: `DONE_RECONCILED`/);
    assert.match(masterPlan, /Stato TASK-021: `DONE`/);
    assert.match(masterPlan, /Fase TASK-021: `DONE_RECONCILED`/);
  }
});

test("TASK-021 migration stores only token hashes and revokes sessions on device revoke", () => {
  const migration = readTask021Migration();

  for (const required of [
    "create table if not exists public.pos_device_credentials",
    "create table if not exists public.pos_sessions",
    "token_hash text not null",
    "session_token_hash text not null",
    "staff_credential_version",
    "alter table public.pos_device_credentials enable row level security",
    "alter table public.pos_sessions enable row level security",
    "revoke all on table public.pos_device_credentials from anon",
    "revoke all on table public.pos_sessions from anon",
    "app_private.revoke_pos_auth_on_shop_device_revoked",
    "pos_device_credentials_token_hash_format",
    "pos_sessions_token_hash_format",
  ]) {
    assert.match(migration, new RegExp(escapeRegExp(required)));
  }

  assert.doesNotMatch(
    migration,
    /grant\s+(select|insert|update|delete|all)[\s\S]*on table public\.pos_(device_credentials|sessions)[\s\S]*to\s+(anon|authenticated)/i,
  );
  assert.doesNotMatch(
    migration,
    /\b(device_token|trusted_token|session_token|refresh_token)\s+text\b/i,
  );
  assert.doesNotMatch(migration, /pos_sales|sale_payments|sync_batch|sales_sync/i);
});

test("TASK-021 POS endpoint modules stay server-side and redact credentials", () => {
  const requiredPaths = [
    "src/lib/supabase/admin.ts",
    "src/server/pos-auth/tokens.ts",
    "src/server/pos-auth/service.ts",
    "src/app/api/pos/auth/first-login/route.ts",
    "src/app/api/pos/session/heartbeat/route.ts",
  ];

  for (const relativePath of requiredPaths) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const adminClient = readProjectFile("src/lib/supabase/admin.ts");
  const tokens = readProjectFile("src/server/pos-auth/tokens.ts");
  const service = readProjectFile("src/server/pos-auth/service.ts");
  const firstLoginRoute = readProjectFile("src/app/api/pos/auth/first-login/route.ts");
  const heartbeatRoute = readProjectFile("src/app/api/pos/session/heartbeat/route.ts");
  const clientSurface = [
    ...readdirSync(join(root, "src/components"), { recursive: true })
      .filter((entry) => typeof entry === "string" && /\.(tsx?|jsx?)$/.test(entry))
      .map((entry) => `src/components/${entry}`),
    "src/lib/supabase/client.ts",
  ]
    .map(readProjectFile)
    .join("\n");

  for (const serverOnlyModule of [adminClient, tokens, service]) {
    assert.match(serverOnlyModule, /import "server-only"/);
    assert.doesNotMatch(serverOnlyModule, /console\.(log|debug|info|warn|error)/);
  }

  assert.match(adminClient, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(service, /verifyStaffCredential/);
  assert.match(service, /hashPosSecret/);
  assert.match(service, /pos\.auth\.first_login\.success/);
  assert.match(service, /pos\.auth\.first_login\.failure/);
  assert.match(service, /pos\.device\.trusted/);
  assert.match(service, /pos\.session\.heartbeat\.success/);
  assert.match(service, /pos\.session\.heartbeat\.failure/);
  assert.match(service, /pos\.device\.revoked_enforced/);
  assert.doesNotMatch(service, /select\("\*"\)/);
  assert.doesNotMatch(service, /pin_plain|password_plain|plain_pin|plain_password/i);
  assert.doesNotMatch(service, /pos_sales|sales_sync|sync_batch/i);

  for (const route of [firstLoginRoute, heartbeatRoute]) {
    assert.match(route, /export const dynamic = "force-dynamic"/);
    assert.match(route, /export const runtime = "nodejs"/);
    assert.match(route, /export async function POST/);
    assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|credential_hash|service_role/i);
    assert.doesNotMatch(route, /export async function GET/);
  }

  assert.doesNotMatch(clientSurface, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});

test("TASK-021 updates security scanner and keeps sales sync out of scope", () => {
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");
  const scanner = readProjectFile("scripts/security-checks.mjs");
  const runtimeSource = [
    ...["src", "supabase"].flatMap((topLevel) =>
      readdirSync(join(root, topLevel), { recursive: true })
        .filter((entry) => typeof entry === "string" && /\.(tsx?|jsx?|mjs|md|sql)$/.test(entry))
        .map((entry) => `${topLevel}/${entry}`),
    ),
  ]
    .filter((relativePath) => existsSync(join(root, relativePath)))
    .map(readProjectFile)
    .join("\n");

  assert.match(scanner, /checkTask021PosBackendSessionDeviceEndpoints/);
  assert.match(scanner, /checkTask021PosBackendSessionDeviceEndpoints\(\)/);
  assert.match(scanner, /credentialMatchesSession/);

  if (
    /Task attivo: `(NONE|NESSUNO)`|Task attivo: `TASK-041 - Runtime Completion: Supabase, Cloudflare\/OpenNext Staging, Sales Sync and Win7POS E2E`|Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`|Task attivo: `TASK-053 - Authorization architecture and staff safe read boundary fix`/.test(
      masterPlan,
    )
  ) {
    assert.match(scanner, /checkTask041RuntimeCompletion/);
    assert.match(
      readProjectFile(
        "docs/TASKS/TASK-041-runtime-completion-supabase-cloudflare-sales-sync-win7pos-e2e.md",
      ),
      /PASS_SALES_SYNC_FOUNDATION/,
    );
  } else {
    assert.doesNotMatch(runtimeSource, /src\/app\/api\/pos\/sales|pos_sales_sync|pos_sync_batches/i);
  }
});

test("TASK-021 hardens lockout expiry, audit requirements and token failure handling", () => {
  const service = readProjectFile("src/server/pos-auth/service.ts");

  assert.match(service, /const MAX_CREDENTIAL_LENGTH = \d+/);
  assert.match(service, /const MAX_POS_SECRET_LENGTH = \d+/);
  assert.match(service, /credential\.length > MAX_CREDENTIAL_LENGTH/);
  assert.match(service, /deviceToken\.length > MAX_POS_SECRET_LENGTH/);
  assert.match(service, /sessionToken\.length > MAX_POS_SECRET_LENGTH/);
  assert.match(service, /function isStaffLockoutActive/);
  assert.match(service, /credential_status: "active"/);
  assert.match(service, /const auditOk = await writePosAudit/);
  assert.match(service, /if \(!auditOk\) \{/);
  assert.match(service, /async function cleanupFailedFirstLogin/);
  assert.match(service, /const trustedAuditOk = await writePosAudit/);
  assert.match(service, /const firstLoginAuditOk = await writePosAudit/);
  assert.match(service, /const sessionTokenValid = verifyPosSecret/);
  assert.match(service, /const deviceTokenValid =/);
  assert.match(service, /const credentialMatchesSession =/);
  assert.match(service, /credential\.shop_id === session\.shop_id/);
  assert.match(service, /credential\.shop_device_id === session\.shop_device_id/);
  assert.match(service, /credential\.staff_id === session\.staff_id/);
  assert.match(service, /!credentialMatchesSession/);
  assert.doesNotMatch(
    service,
    /!verifyPosSecret\(parsed\.sessionToken[\s\S]{0,260}markSessionDenied/,
  );
});
