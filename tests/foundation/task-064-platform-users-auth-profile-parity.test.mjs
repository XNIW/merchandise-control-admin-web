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

function assertPathExists(relativePath) {
  assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
}

test("TASK-064 users route submits server-side query state", () => {
  const usersPage = readProjectFile("src/app/platform/users/page.tsx");
  const platformPage = readProjectFile("src/components/platform/PlatformPage.tsx");
  const masterDetail = readProjectFile(
    "src/components/platform/PlatformMasterDetail.tsx",
  );
  const platformData = readProjectFile("src/components/platform/platformData.ts");
  const translateSections = readProjectFile("src/i18n/translate-sections.ts");

  assertContains(usersPage, "q?: string | string[]");
  assertContains(usersPage, "usersSearchQuery: firstParam(params.q)");
  assertContains(masterDetail, "serverSearch");
  assertContains(masterDetail, 'method="get"');
  assertContains(masterDetail, "name={serverSearch.paramName}");
  assertContains(masterDetail, "function listHrefFor");
  assertContains(masterDetail, "serverSearch?.value");
  assertContains(masterDetail, "rows.length === 0 && !serverSearch");
  assertContains(masterDetail, "returnTo");
  assertContains(platformPage, "localizedSection.serverSearch !== undefined");
  assertContains(platformData, "type PlatformServerSearch");
  assertContains(platformData, '{ key: "email", label: "Email" }');
  assertContains(translateSections, "serverSearch: section.serverSearch");
});

test("TASK-064 users master-detail table keeps identity columns stable", () => {
  const masterDetail = readProjectFile(
    "src/components/platform/PlatformMasterDetail.tsx",
  );

  for (const required of [
    "noWrapTableColumns",
    "tableColumnClass",
    "min-w-full",
    "min-w-60",
    "min-w-28",
    "min-w-56",
    "whitespace-nowrap",
    "rounded-md border border-slate-200 bg-slate-50 p-2 lg:grid-cols-[minmax(18rem,1fr)_auto]",
    "sm:grid-cols-[minmax(0,1fr)_auto_auto]",
    "lg:w-[22rem] xl:w-[24rem]",
    "sm:grid-cols-2",
  ]) {
    assertContains(masterDetail, required);
  }

  assert.match(
    masterDetail,
    /noWrapCellColumns\.has\(column\.key\)[\s\S]*whitespace-nowrap/,
    "compact identity/status columns must not be squeezed into mid-word wrapping",
  );
});

test("TASK-064 Auth identity summaries are server-only allowlist DTOs", () => {
  const authIdentitiesPath = "src/server/platform-admin/auth-identities.ts";

  assertPathExists(authIdentitiesPath);

  const authIdentities = readProjectFile(authIdentitiesPath);

  for (const required of [
    'import "server-only"',
    "PlatformAuthIdentitySummary",
    "auth.admin.listUsers",
    "authListDefaultMaxUsers",
    "authSearchMaxUsers",
    "authUserId",
    "displayName",
    "email",
    "provider",
    "providerType",
    "createdAt",
    "normalizePlatformUserSearchQuery",
    "escapePostgrestLikePattern",
  ]) {
    assertContains(authIdentities, required);
  }

  assert.doesNotMatch(
    authIdentities,
    /access_token|refresh_token|session_token|magic_link|credential_hash|password_hash|pin_hash|staff_code/i,
  );
  assert.doesNotMatch(
    authIdentities,
    /platform_admins|shop_members|staff_accounts|authorizeCurrentPlatformAdmin/,
  );
});

test("TASK-064 read model merges Auth, profile, and membership summaries safely", () => {
  const serverBoundary = readProjectFile("src/lib/supabase/server.ts");
  const readModel = readProjectFile("src/server/platform-admin/read-model.ts");
  const sectionData = readProjectFile(
    "src/server/platform-admin/platform-section-data.ts",
  );

  for (const required of [
    "authorizeCurrentPlatformAdmin",
    "includeAuthIdentities",
    "usersSearchQuery",
    "loadProfileRows",
    "loadProfilesByIds",
    "for (let index = 0; index < ids.length; index += 200)",
    "userAccounts",
    "authIdentities",
    "authIdentityStatus",
    "runtimeTarget",
    "getSupabaseRuntimeTargetDiagnostic",
    "profile_ok",
    "auth_only",
    "profile_only",
    "origin_unavailable",
    "member_and_platform_admin",
    ".from(\"profiles\")",
    ".from(\"shop_members\")",
    ".from(\"platform_admins\")",
  ]) {
    assertContains(readModel, required);
  }

  assert.doesNotMatch(readModel, /select\("\*"\)|select\('\*'\)/);
  assert.doesNotMatch(readModel, /\.(insert|update|delete|upsert|rpc)\s*\(/);
  assert.doesNotMatch(readModel, /raw_user_meta_data|staff_code|credential_hash|password_hash|pin_hash/i);
  assert.doesNotMatch(readModel, /filter\(isUuidLike\)\.slice\(0,\s*200\)/);

  for (const required of [
    "Profile OK",
    "Auth only",
    "Profile only",
    "Origin unavailable",
    "Email",
    "Provider",
    "Profile sync state",
    "Shop access state",
    "runtime target",
    "auth users count",
    "profiles count",
    "Runtime target diagnostics expose only class, redacted project ref, and counts.",
    "No auth secret fields are queried or rendered.",
    "Email and provider are returned only by a minimal server-side Auth identity DTO.",
  ]) {
    assertContains(sectionData, required);
  }

  for (const required of [
    "SupabaseRuntimeTargetDiagnostic",
    ".env.local cloud",
    "local supabase status",
    "redactProjectRef",
  ]) {
    assertContains(serverBoundary, required);
  }
});

test("TASK-064 migration creates idempotent auth to profile consistency without staff merge", () => {
  const migrationPath =
    "supabase/migrations/20260615143000_task_064_auth_profile_parity.sql";

  assertPathExists(migrationPath);

  const migration = readProjectFile(migrationPath);

  for (const required of [
    "task064_safe_auth_display_name",
    "task064_ensure_profile_for_auth_user",
    "after insert on auth.users",
    "insert into public.profiles",
    "on conflict (profile_id) do nothing",
    "left join public.profiles",
    "where profile.profile_id is null",
  ]) {
    assertContains(migration, required);
  }

  assert.doesNotMatch(migration, /staff_accounts|staff_code|pin|password|credential_hash/i);
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete|all).*to\s+authenticated/i);
});

test("TASK-064 security scanner includes the dedicated gate", () => {
  const securityChecks = readProjectFile("scripts/security-checks.mjs");

  assertContains(securityChecks, "checkTask064PlatformUsersFoundation");
  assertContains(securityChecks, "auth.admin.listUsers");
  assertContains(securityChecks, "TASK-064 Auth Admin boundary must not be imported into client/browser files");
});

test("TASK-064 cloud target scripts keep local and cloud runtime checks explicit", () => {
  const packageJson = readProjectFile("package.json");
  const cloudDev = readProjectFile("scripts/platform/cloud-dev-server.mjs");
  const cloudProbe = readProjectFile("scripts/platform/cloud-target-probe.mjs");

  assertContains(packageJson, "\"platform:cloud:dev\"");
  assertContains(packageJson, "\"platform:cloud:probe\"");
  assertContains(cloudDev, "platform:cloud:dev must not run against local Supabase.");
  assertContains(cloudDev, "TEST_TARGET: \"cloud\"");
  assertContains(cloudDev, "SUPABASE_PROJECT_REF must match the Supabase URL project ref.");
  assertContains(cloudProbe, "CONFIRM_PLATFORM_CLOUD_READONLY");
  assertContains(cloudProbe, "PLATFORM_CLOUD_PROBE_EMAIL");
  assertContains(cloudProbe, "redactEmail");
  assertContains(cloudProbe, "auth.admin.listUsers");
  assert.doesNotMatch(cloudDev, /supabase.+status/i);
  assert.doesNotMatch(cloudProbe, /xniw97@gmail\.com/i);
  assert.doesNotMatch(cloudProbe, /\.(insert|update|delete|upsert|rpc)\s*\(/);
});
