import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createContext, Script } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { reconcileMigrationDelta } from "../../scripts/task-150-reconcile-migration-delta.mjs";
import { verifyTask150StagingRoute } from "../../scripts/verify-task-150-staging-route.mjs";

const root = process.cwd();
const requireForTest = createRequire(import.meta.url);
const boundaryPath = "src/server/qa/task-150-win7pos-image-boundary.ts";
const routePath = "src/app/api/qa/win7pos-product-image/route.ts";
const migrationPath =
  "supabase/migrations/20260731162000_task_150_win7pos_product_image_qa_boundary.sql";
const stagingMigrationWorkflowPath =
  ".github/workflows/task-150-staging-migration.yml";
const stagingMigrationReconciliationPath =
  "scripts/task-150-reconcile-migration-delta.mjs";
const stagingRouteVerificationPath =
  "scripts/verify-task-150-staging-route.mjs";
const cloudflareWorkflowPath = ".github/workflows/cloudflare.yml";

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function transpileBoundary() {
  const transpiled = ts.transpileModule(read(boundaryPath), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: boundaryPath,
  });
  const cjsModule = { exports: {} };
  const stub = new Proxy(
    {},
    { get: () => () => ({}) },
  );
  new Script(transpiled.outputText, { filename: boundaryPath }).runInContext(
    createContext({
      AbortSignal,
      Buffer,
      Date,
      Request,
      Response,
      TextDecoder,
      TextEncoder,
      Uint8Array,
      URL,
      console,
      exports: cjsModule.exports,
      module: cjsModule,
      process: {
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "https://jpgoimipbothfgkokyvm.supabase.co",
          TASK150_QA_HMAC_KEY: "foundation-only-task150-hmac-key-0000000000000000",
        },
      },
      require(specifier) {
        if (specifier === "server-only") return {};
        if (specifier.startsWith("@/")) return stub;
        return requireForTest(specifier);
      },
    }),
  );
  return cjsModule.exports;
}

test("TASK-150 QA route is POST-only, bounded and no-store", () => {
  const route = read(routePath);
  assert.match(route, /const MAX_BODY_BYTES = 16 \* 1024/);
  assert.match(route, /mediaType !== "application\/json"/);
  assert.doesNotMatch(route, /startsWith\("application\/json"\)/);
  assert.match(route, /"Cache-Control": "no-store, max-age=0"/);
  assert.match(route, /"X-Content-Type-Options": "nosniff"/);
  assert.match(route, /request\.body\.getReader\(\)/);
  assert.match(route, /bodyBytes > MAX_BODY_BYTES[\s\S]*?reader\.cancel/);
  assert.doesNotMatch(route, /request\.text\(\)/);
  for (const verb of ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "PUT"]) {
    assert.match(route, new RegExp(`methodNotAllowed as ${verb}`));
  }
  assert.doesNotMatch(route, /console\.|request body|authorization/i);
});

test("TASK-150 boundary is callable only on the exact staging host or local test hosts", () => {
  const boundary = transpileBoundary();
  assert.equal(
    boundary.task150QaHostAllowed(
      "merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev",
    ),
    true,
  );
  assert.equal(boundary.task150QaHostAllowed("localhost:3000"), true);
  assert.equal(boundary.task150QaHostAllowed("127.0.0.1:8787"), true);
  assert.equal(boundary.task150QaHostAllowed("merchandise-control-admin-web.workers.dev"), false);
  assert.equal(boundary.task150QaHostAllowed("example.invalid"), false);
  assert.equal(
    boundary.task150QaProjectAllowed("https://jpgoimipbothfgkokyvm.supabase.co"),
    true,
  );
  assert.equal(
    boundary.task150QaProjectAllowed("https://jpgoimipbothfgkokyvm.supabase.co/extra"),
    false,
  );
  assert.equal(
    boundary.task150QaProjectAllowed("http://jpgoimipbothfgkokyvm.supabase.co"),
    false,
  );
  assert.equal(
    boundary.task150QaProjectAllowed("https://production-project.supabase.co"),
    false,
  );
  assert.equal(boundary.task150BoundaryConstants.maximumBodyBytes, 16 * 1024);
  assert.equal(
    boundary.task150BoundaryConstants.fixtureTemplate,
    "asus-product-image-phase-b-fixture-v1",
  );
  assert.equal(
    boundary.task150BoundaryConstants.stagingSupabaseOrigin,
    "https://jpgoimipbothfgkokyvm.supabase.co",
  );
});

test("TASK-150 boundary rejects unknown actions and extra client-controlled fixture fields", async () => {
  const boundary = transpileBoundary();
  const unknownAction = await boundary.handleTask150BoundaryRequest({
    baseUrl: "http://localhost:3000",
    body: { action: "unknown" },
    bodyBytes: 20,
    host: "localhost:3000",
  });
  assert.equal(unknownAction.status, 400);
  assert.equal(unknownAction.body.code, "validation_failed");

  const extraField = await boundary.handleTask150BoundaryRequest({
    baseUrl: "http://localhost:3000",
    body: { action: "provision", role: "admin" },
    bodyBytes: 37,
    host: "localhost:3000",
  });
  assert.equal(extraField.status, 400);
  assert.equal(extraField.body.code, "validation_failed");
});

test("TASK-150 migration stores capability digests only and fixes staging/template scope", () => {
  const migration = read(migrationPath);
  for (const column of [
    "provision_capability_digest",
    "cleanup_capability_digest",
    "result_capability_digest",
    "cleanup_owner_digest",
    "cleanup_generation",
    "cleanup_lease_expires_at",
    "cleanup_receipt",
    "bootstrap_snapshot_digest",
  ]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`));
  }
  assert.match(migration, /environment = 'staging'/);
  assert.match(migration, /asus-product-image-phase-b-fixture-v1/g);
  assert.match(migration, /safety_fence_until >= created_at \+ interval '2 hours 20 minutes'/);
  assert.doesNotMatch(migration, /\b(provision|cleanup|result)_capability\s+text\b/);
  assert.doesNotMatch(migration, /signed_url|session_token|device_token|service_role_key/i);
  assert.match(migration, /task_150_qa_bootstrap_snapshot_v1/);
  assert.match(migration, /extensions\.digest\(/);
});

test("TASK-150 SQL functions are service-role-only and fence every destructive commit", () => {
  const migration = read(migrationPath);
  const functions = [
    "task_150_win7pos_image_qa_begin_v1",
    "task_150_win7pos_image_qa_provision_admit_v1",
    "task_150_win7pos_image_qa_provision_v1",
    "task_150_win7pos_image_qa_prearm_v1",
    "task_150_win7pos_image_qa_rotation_prepare_v1",
    "task_150_win7pos_image_qa_rotation_ack_v1",
    "task_150_win7pos_image_qa_result_issue_v1",
    "task_150_win7pos_image_qa_cleanup_acquire_v1",
    "task_150_win7pos_image_qa_cleanup_commit_v1",
    "task_150_win7pos_image_qa_result_v1",
  ];
  for (const name of functions) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}`));
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${name}[\\s\\S]*?to service_role;`),
    );
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${name}[\\s\\S]*?from public, anon, authenticated;`),
    );
  }
  assert.match(migration, /cleanup_generation = p_generation/);
  assert.match(migration, /cleanup_owner_digest = p_owner_digest/);
  assert.match(migration, /cleanup_lease_expires_at <= clock_timestamp\(\)/);
  assert.match(migration, /status = 'cleanup_invariant_blocked'/);
  assert.match(migration, /The boundary performs no external mutation/);
  assert.match(migration, /'provisioned', 'cleanup_recoverable'/);
  assert.doesNotMatch(read(boundaryPath), /\.storage\.from|\.remove\(/);
  assert.match(read(boundaryPath), /performs no unfenced external I\/O/);
  assert.match(migration, /pos_upload_capability_expires_at > clock_timestamp\(\)/);
  assert.match(migration, /cleanup_capability_revoked_at = v_completed_at/);
});

test("TASK-150 enrolls exact auth and budget closure before cleanup", () => {
  const migration = read(migrationPath);
  for (const trigger of [
    "task_150_qa_enroll_device_trigger",
    "task_150_qa_enroll_device_credential_trigger",
    "task_150_qa_enroll_session_trigger",
    "task_150_qa_enroll_budget_trigger",
    "task_150_qa_block_image_version_after_cleanup_trigger",
    "task_150_qa_block_receipt_after_cleanup_trigger",
    "task_150_qa_block_sync_after_cleanup_trigger",
  ]) {
    assert.match(migration, new RegExp(`create trigger ${trigger}`));
  }
  assert.match(migration, /run_shop_id uuid not null unique/);
  assert.match(migration, /run_product_id uuid not null unique/);
  assert.match(migration, /run_inventory_owner_id uuid not null unique/);
  assert.match(
    migration,
    /insert into auth\.users[\s\S]*?v_run\.run_inventory_owner_id[\s\S]*?task150QaRunHmac/,
  );
  assert.match(
    migration,
    /insert into public\.shop_inventory_sources[\s\S]*?v_run\.run_inventory_owner_id[\s\S]*?'mapped'/,
  );
  assert.match(
    migration,
    /delete from app_private\.pos_product_image_mutation_budgets budget\s+using app_private\.task_150_win7pos_image_qa_budget_rows manifest/,
  );
  assert.match(migration, /manifest\.source_updated_at <> budget\.updated_at/);
  assert.doesNotMatch(
    migration,
    /delete from app_private\.pos_product_image_mutation_budgets budget\s+where budget\.shop_id/,
  );
});

test("TASK-150 management actions stay bound to the original bootstrap actor", () => {
  const boundary = read(boundaryPath);
  const migration = read(migrationPath);
  assert.doesNotMatch(boundary, /hmac\(key, "run-actor"/);
  assert.equal((boundary.match(/"bootstrap-actor"/g) ?? []).length, 5);
  assert.match(migration, /bootstrap_source_shop_id <> p_actor_shop_id/g);
  assert.match(migration, /bootstrap_staff_id <> p_actor_staff_id/g);
  assert.match(migration, /bootstrap_actor_hmac <> p_actor_hmac/g);
  assert.doesNotMatch(migration, /run_shop_id <> p_actor_shop_id/);
  assert.match(migration, /'cleanup_invariant_blocked'/);
});

test("TASK-150 fixture namespace is a full 128-bit uppercase marker", () => {
  const boundary = read(boundaryPath);
  const migration = read(migrationPath);
  assert.match(boundary, /ASUSPIB_\[A-F0-9\]\{32\}/);
  assert.match(migration, /upper\(substr\(p_run_hmac, 1, 32\)\)/);
  assert.match(migration, /v_shop_code := 'AP' \|\| substr\(v_suffix, 1, 30\)/);
  assert.match(migration, /v_staff_code := 'P' \|\| substr\(v_suffix, 1, 31\)/);
  assert.doesNotMatch(migration, /shop_code = 'ASUSPIB_' \|\| v_suffix/);
  assert.doesNotMatch(migration, /staff_code = 'PIB_' \|\| v_suffix/);
});

test("TASK-150 response-loss replay and throttles do not cross a fixed-window edge", () => {
  const boundary = read(boundaryPath);
  const migration = read(migrationPath);
  const admissionReplay = migration.indexOf(
    "v_run.provision_admission_request_hash = p_request_hash",
  );
  const firstProvisionRateCheck = migration.indexOf("v_run.provision_attempt_count >= 3");
  assert.ok(admissionReplay > 0 && admissionReplay < firstProvisionRateCheck);
  assert.ok(
    boundary.indexOf("task_150_win7pos_image_qa_provision_admit_v1") <
      boundary.indexOf("hashStaffCredential(credential)"),
  );
  assert.match(
    migration,
    /provision_attempt_window_started_at = v_run\.provision_attempt_window_started_at/,
  );
  assert.match(
    migration,
    /set rotation_attempt_window_started_at = v_now,\s+rotation_attempt_count = rotation_attempt_count \+ 1/,
  );
  assert.match(
    migration,
    /set result_issue_window_started_at = v_now,\s+result_issue_count = result_issue_count \+ 1/,
  );
  assert.match(boundary, /safeCode === "rate_limited"[\s\S]*?\? 429/);
  assert.match(migration, /'retryAfterAt'/);
  assert.match(migration, /task150-actor-quota/);
  assert.doesNotMatch(boundary, /manifestNonce/);
  assert.match(boundary, /const manifestHmac = hmac\(key, "manifest", `\$\{runHmac\}\\0\$\{beginHash\}`\)/);
  assert.match(
    migration,
    /v_existing\.provision_capability_digest = p_provision_capability_digest[\s\S]*?v_existing\.cleanup_capability_digest = p_cleanup_capability_digest[\s\S]*?v_existing\.result_capability_digest = p_result_capability_digest/,
  );
});

test("TASK-150 cleanup capability rotation is two-phase, bounded and loss-safe", () => {
  const migration = read(migrationPath);
  const boundary = read(boundaryPath);
  assert.match(migration, /pending_cleanup_capability_expires_at/);
  assert.match(migration, /pending_cleanup_prepared_at \+ interval '10 minutes'/);
  assert.match(migration, /pending_cleanup_prepared_at \+ interval '3 hours'/);
  assert.match(migration, /'code', 'rotation_prepared'/);
  assert.match(migration, /'code', 'rotation_ack_replayed'/);
  assert.match(
    migration,
    /pending_cleanup_capability_digest = p_pending_capability_digest[\s\S]*?cleanup_rotation_request_hash = p_request_hash/,
  );
  assert.match(migration, /rotation_attempt_count >= 3/);
  assert.match(migration, /cleanup_attempt_count >= 5/);
  assert.match(migration, /result_capability_expires_at[\s\S]*interval '60 minutes'/);
  const prearm = migration.slice(
    migration.indexOf("create or replace function public.task_150_win7pos_image_qa_prearm_v1"),
    migration.indexOf("create or replace function public.task_150_win7pos_image_qa_rotation_prepare_v1"),
  );
  assert.match(prearm, /p_requested_fence_until > v_run\.created_at \+ interval '3 hours'/);
  assert.ok(
    prearm.indexOf("cleanup_capability_coverage_insufficient") <
      prearm.indexOf("set run_actor_hmac = bootstrap_actor_hmac"),
  );
  assert.match(prearm, /v_run\.prearm_request_hash = p_request_hash/);
  const cleanupAcquire = migration.slice(
    migration.indexOf(
      "create or replace function public.task_150_win7pos_image_qa_cleanup_acquire_v1",
    ),
    migration.indexOf(
      "create or replace function public.task_150_win7pos_image_qa_cleanup_commit_v1",
    ),
  );
  assert.match(
    cleanupAcquire,
    /v_required_coverage_until := v_lease_expires_at \+ interval '15 minutes'/,
  );
  assert.ok(
    cleanupAcquire.indexOf("cleanup_capability_coverage_insufficient") <
      cleanupAcquire.indexOf("cleanup_attempt_window_started_at = v_now"),
  );
  assert.match(
    cleanupAcquire,
    /set status = 'cleanup_recoverable',[\s\S]*?cleanup_lease_expires_at = null/,
  );
  assert.match(
    migration,
    /task_150_win7pos_image_qa_rotation_prepare_v1[\s\S]*?v_run\.status not in \('provisioned', 'cleanup_recoverable'\)/,
  );
  assert.match(
    migration,
    /task_150_win7pos_image_qa_rotation_ack_v1[\s\S]*?v_run\.status not in \('provisioned', 'cleanup_recoverable'\)/,
  );
  assert.match(
    boundary,
    /safeCode === "cleanup_capability_coverage_insufficient"[\s\S]*?requiredCoverageUntil/,
  );
});

test("TASK-150 staging handler requires fresh trusted auth for prearm and rotations", () => {
  const boundary = read(boundaryPath);
  for (const action of ["prearm", "rotation_prepare", "rotation_ack", "result_issue"]) {
    assert.match(boundary, new RegExp(`parseTrustedRunAction\\(body, "${action}"`));
  }
  assert.match(boundary, /await authorizeBootstrap\(parsed\.envelope\)/g);
  assert.match(
    boundary,
    /pendingCleanupCapability = capability\([\s\S]*?"cleanup",[\s\S]*?rotationHash/,
  );
  assert.match(
    boundary,
    /const rotationHash = requestHash\(key, "rotation_prepare", \[[\s\S]*?parsed\.value\.cleanupCapability/,
  );
  assert.match(
    boundary,
    /const ackHash = requestHash\(key, "rotation_ack", \[[\s\S]*?parsed\.value\.cleanupCapability[\s\S]*?parsed\.value\.pendingCleanupCapability/,
  );
  assert.match(boundary, /actor\.shopId\.toLowerCase\(\)/);
  assert.match(boundary, /actor\.staffId\.toLowerCase\(\)/);
  assert.match(
    read(migrationPath),
    /p_pending_capability_digest = p_cleanup_capability_digest/,
  );
  assert.doesNotMatch(boundary, /service_role_key|SUPABASE_SERVICE_ROLE_KEY/);
});

test("TASK-150 terminal receipt is count-only and retrieval is stable/read-only", () => {
  const migration = read(migrationPath);
  assert.match(
    migration,
    /from public\.pos_sale_stock_movements movement[\s\S]*?from public\.pos_sale_lines sale_line[\s\S]*?from public\.pos_revenue_ledger_entries ledger_entry/,
  );
  assert.match(migration, /'activeRunOwnedSessions', 0/);
  assert.match(migration, /'sharedSnapshotUnchanged', v_shared_snapshot_unchanged/);
  assert.match(
    migration,
    /v_bootstrap_snapshot_digest = v_run\.bootstrap_snapshot_digest/,
  );
  assert.match(migration, /'immutableAuditPreserved', true/);
  assert.match(migration, /'cleanupCapabilityRevoked', true/);
  assert.match(migration, /receiptBindingVersion/);
  assert.match(migration, /extensions\.hmac\(/);
  assert.match(migration, /task_150_qa_preserve_terminal_receipt_trigger/);
  assert.match(migration, /'cleanup_invariant_blocked', 'cleaned'/);
  assert.match(migration, /result_issue_request_hash = p_request_hash/);
  assert.match(
    migration,
    /when v_run\.status = 'cleanup_in_progress' then 'aborted_recoverable'\s+when v_run\.status = 'cleanup_recoverable' then 'aborted_recoverable'/,
  );
  const resultIssueFunction = migration.slice(
    migration.indexOf(
      "create or replace function public.task_150_win7pos_image_qa_result_issue_v1",
    ),
    migration.indexOf(
      "create or replace function public.task_150_win7pos_image_qa_cleanup_acquire_v1",
    ),
  );
  assert.ok(
    resultIssueFunction.indexOf("result_issue_request_hash = p_request_hash") <
      resultIssueFunction.indexOf("'code', 'request_conflict'"),
  );
  assert.ok(
    resultIssueFunction.indexOf("'code', 'request_conflict'") <
      resultIssueFunction.indexOf("result_issue_window_started_at <= v_now"),
  );
  assert.doesNotMatch(
    migration,
    /bootstrap_source_shop_id uuid not null references|bootstrap_staff_id uuid not null references|bootstrap_profile_id uuid not null references/,
  );
  assert.match(migration, /owner_row\.id = v_run\.run_inventory_owner_id/);
  assert.match(
    migration,
    /archived_by_profile_id = v_run\.bootstrap_profile_id/,
  );
  assert.doesNotMatch(
    migration,
    /archived_by_profile_id = null/,
  );
  assert.match(migration, /grant select on table app_private\.task_150_win7pos_image_qa_runs to service_role/);
  assert.doesNotMatch(migration, /grant select, insert, update on table app_private\.task_150_win7pos_image_qa_runs/);
  assert.match(migration, /language plpgsql\s+stable\s+security definer[\s\S]*?task_150_win7pos_image_qa_result_v1|task_150_win7pos_image_qa_result_v1[\s\S]*?language plpgsql\s+stable/);
  const resultFunction = migration.slice(
    migration.indexOf("create or replace function public.task_150_win7pos_image_qa_result_v1"),
  );
  assert.doesNotMatch(resultFunction, /\binsert\s+into\b|\bupdate\s+|\bdelete\s+from\b/i);
});

test("TASK-150 migration remap reconciliation fails closed for every drift shape", () => {
  const task142 = {
    version: "20260727055520",
    name: "task_142_catalog_text_policy_v1",
    fileName: "20260727055520_task_142_catalog_text_policy_v1.sql",
  };
  const task150 = {
    version: "20260731162000",
    name: "task_150_win7pos_product_image_qa_boundary",
    fileName: "20260731162000_task_150_win7pos_product_image_qa_boundary.sql",
  };
  const remap = {
    localVersion: task142.version,
    remoteVersion: "20260727084040",
    name: task142.name,
  };
  const exact = {
    local: [task142, task150],
    remote: [{ version: remap.remoteVersion, name: remap.name }],
    expected: [task150],
    approvedRemoteRemaps: [remap],
  };
  assert.equal(reconcileMigrationDelta(exact).status, "PASS");

  const failures = [
    { ...exact, remote: [] },
    {
      ...exact,
      remote: [{ version: remap.remoteVersion, name: "wrong_name" }],
    },
    {
      ...exact,
      remote: [
        { version: remap.remoteVersion, name: remap.name },
        { version: remap.remoteVersion, name: remap.name },
      ],
    },
    {
      ...exact,
      remote: [
        { version: remap.remoteVersion, name: remap.name },
        { version: task142.version, name: task142.name },
      ],
    },
    {
      ...exact,
      remote: [
        { version: remap.remoteVersion, name: remap.name },
        { version: "20260730000000", name: "remote_only" },
      ],
    },
    {
      ...exact,
      local: [
        task142,
        {
          version: "20260730000000",
          name: "extra_pending",
          fileName: "20260730000000_extra_pending.sql",
        },
        task150,
      ],
    },
    { ...exact, local: [task142, { ...task142 }, task150] },
  ];
  for (const input of failures) {
    assert.equal(reconcileMigrationDelta(input).status, "FAIL");
  }
});

test("TASK-150 migration reconciliation CLI reports exact success and fails closed", (t) => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "task-150-reconcile-"));
  const migrationDirectory = join(temporaryRoot, "migrations");
  const remoteLedgerPath = join(temporaryRoot, "remote.tsv");
  const outputPath = join(temporaryRoot, "report.json");
  const scriptPath = resolve(root, stagingMigrationReconciliationPath);
  const task142File = "20260727055520_task_142_catalog_text_policy_v1.sql";
  const task150File =
    "20260731162000_task_150_win7pos_product_image_qa_boundary.sql";
  const environment = {
    ...process.env,
    EXPECTED_MIGRATION_VERSION: "20260731162000",
    EXPECTED_MIGRATION_NAME: "task_150_win7pos_product_image_qa_boundary",
    EXPECTED_MIGRATION_FILE: task150File,
    REMAPPED_LOCAL_MIGRATION_VERSION: "20260727055520",
    REMAPPED_REMOTE_MIGRATION_VERSION: "20260727084040",
    REMAPPED_MIGRATION_NAME: "task_142_catalog_text_policy_v1",
  };
  t.after(() => rmSync(temporaryRoot, { force: true, recursive: true }));
  mkdirSync(migrationDirectory);
  writeFileSync(join(migrationDirectory, task142File), "-- fixture\n");
  writeFileSync(join(migrationDirectory, task150File), "-- fixture\n");
  writeFileSync(
    remoteLedgerPath,
    "20260727084040\ttask_142_catalog_text_policy_v1\n",
  );

  function runCli() {
    return spawnSync(
      process.execPath,
      [scriptPath, migrationDirectory, remoteLedgerPath, outputPath],
      { encoding: "utf8", env: environment },
    );
  }

  const exact = runCli();
  assert.equal(exact.status, 0, exact.stderr || exact.stdout);
  assert.equal(JSON.parse(readFileSync(outputPath, "utf8")).status, "PASS");

  writeFileSync(
    join(migrationDirectory, "999999999999999_extra.sql"),
    "-- invalid 15-digit migration\n",
  );
  const invalidFilename = runCli();
  assert.equal(invalidFilename.status, 1);
  const invalidFilenameReport = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(invalidFilenameReport.status, "FAIL");
  assert.deepEqual(invalidFilenameReport.localFilenameViolations, [
    "999999999999999_extra.sql",
  ]);
  rmSync(join(migrationDirectory, "999999999999999_extra.sql"));

  writeFileSync(remoteLedgerPath, "20260730000000\tremote_only\n");
  const drift = runCli();
  assert.equal(drift.status, 1);
  assert.equal(JSON.parse(readFileSync(outputPath, "utf8")).status, "FAIL");

  const imported = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `await import(${JSON.stringify(pathToFileURL(scriptPath).href)})`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(imported.status, 0, imported.stderr || imported.stdout);
});

test("TASK-150 staging route verification tolerates bounded propagation only", async () => {
  const statuses = [];
  let calls = 0;
  const result = await verifyTask150StagingRoute({
    baseUrl:
      "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev",
    maximumAttempts: 2,
    delayMilliseconds: 0,
    delay: async () => {},
    log: (status) => statuses.push(status),
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response("not propagated", {
            status: 404,
            headers: { "content-type": "text/html" },
          })
        : Response.json(
            { ok: false, code: "validation_failed" },
            {
              status: 400,
              headers: { "cache-control": "no-store, max-age=0" },
            },
          );
    },
  });
  assert.equal(result.attempt, 2);
  assert.equal(calls, 2);
  assert.equal(statuses[0].httpStatus, 404);
  assert.equal(statuses[0].code, null);
  assert.equal(statuses[1].code, "validation_failed");

  await assert.rejects(
    verifyTask150StagingRoute({
      baseUrl:
        "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev",
      maximumAttempts: 2,
      delayMilliseconds: 0,
      delay: async () => {},
      log: () => {},
      fetchImpl: async () =>
        new Response("still old", {
          status: 404,
          headers: { "content-type": "text/html" },
        }),
    }),
    /task150_staging_route_unavailable/,
  );
});

test("TASK-150 deploy path is exact, staging-only and secret-backed", () => {
  const migrationWorkflow = read(stagingMigrationWorkflowPath);
  const reconciliation = read(stagingMigrationReconciliationPath);
  const routeVerification = read(stagingRouteVerificationPath);
  const cloudflareWorkflow = read(cloudflareWorkflowPath);
  assert.match(migrationWorkflow, /environment: cloudflare-staging/);
  assert.match(migrationWorkflow, /mainBranch: process\.env\.GITHUB_REF === "refs\/heads\/main"/);
  assert.match(migrationWorkflow, /EXPECTED_MIGRATION_VERSION: "20260731162000"/);
  assert.match(
    migrationWorkflow,
    /EXPECTED_STAGING_SUPABASE_PROJECT_REF: jpgoimipbothfgkokyvm/,
  );
  assert.match(
    migrationWorkflow,
    /ref === process\.env\.EXPECTED_STAGING_SUPABASE_PROJECT_REF/,
  );
  assert.match(
    migrationWorkflow,
    /EXPECTED_MIGRATION_NAME: task_150_win7pos_product_image_qa_boundary/,
  );
  assert.match(migrationWorkflow, /APPLY_TASK150_STAGING/);
  assert.match(migrationWorkflow, /REMAPPED_LOCAL_MIGRATION_VERSION: "20260727055520"/);
  assert.match(migrationWorkflow, /REMAPPED_REMOTE_MIGRATION_VERSION: "20260727084040"/);
  assert.match(migrationWorkflow, /REMAPPED_MIGRATION_NAME: task_142_catalog_text_policy_v1/);
  assert.match(migrationWorkflow, /REMAPPED_LOCAL_MIGRATION_FILE: 20260727055520_task_142_catalog_text_policy_v1\.sql/);
  assert.match(
    migrationWorkflow,
    /node scripts\/task-150-reconcile-migration-delta\.mjs/,
  );
  assert.match(reconciliation, /exactRemoteRows\.length !== 1/);
  assert.match(reconciliation, /remote\.some\(\(row\) => row\.version === remap\.localVersion\)/);
  assert.match(reconciliation, /remapViolations\.length/);
  assert.match(reconciliation, /normalizedRemote/);
  assert.match(migrationWorkflow, /Materialize exact remote remap for the ephemeral CLI projection/);
  assert.match(migrationWorkflow, /cp -- "\$LOCAL_PATH" "\$REMOTE_PATH"/);
  assert.match(migrationWorkflow, /Already-applied remapped migration appeared in dry-run/);
  assert.match(migrationWorkflow, /Already-applied remapped migration appeared in apply output/);
  assert.match(reconciliation, /remoteOnly\.length === 0/);
  assert.match(reconciliation, /nameMismatches\.length === 0/);
  assert.match(reconciliation, /JSON\.stringify\(pending\) === JSON\.stringify\(expected\)/);
  assert.match(migrationWorkflow, /db push \\\r?\n\s+--dry-run/);
  assert.match(migrationWorkflow, /Apply single approved migration/);
  assert.match(migrationWorkflow, /migrationLedgerExact/);
  for (const name of [
    "task_150_win7pos_image_qa_begin_v1",
    "task_150_win7pos_image_qa_provision_admit_v1",
    "task_150_win7pos_image_qa_provision_v1",
    "task_150_win7pos_image_qa_prearm_v1",
    "task_150_win7pos_image_qa_rotation_prepare_v1",
    "task_150_win7pos_image_qa_rotation_ack_v1",
    "task_150_win7pos_image_qa_result_issue_v1",
    "task_150_win7pos_image_qa_cleanup_acquire_v1",
    "task_150_win7pos_image_qa_cleanup_commit_v1",
    "task_150_win7pos_image_qa_result_v1",
    "task_150_win7pos_image_qa_runs",
    "task_150_win7pos_image_qa_auth_assets",
    "task_150_win7pos_image_qa_budget_rows",
  ]) {
    assert.match(migrationWorkflow, new RegExp(`'${name}'`));
  }
  assert.match(migrationWorkflow, /'serviceRoleSelect'/);
  assert.match(migrationWorkflow, /'truncate'/);
  assert.equal(
    (migrationWorkflow.match(/docker run --rm -i --network host/g) ?? []).length,
    2,
  );
  assert.doesNotMatch(migrationWorkflow, /cloudflare-production|deploy-production/);
  assert.equal(
    (migrationWorkflow.match(
      /SUPABASE_DB_PASSWORD: \$\{\{ secrets\.SUPABASE_DB_PASSWORD \}\}/g,
    ) ?? []).length,
    2,
  );
  const migrationJobHeader = migrationWorkflow.slice(
    migrationWorkflow.indexOf("  migrate:"),
    migrationWorkflow.indexOf("    steps:", migrationWorkflow.indexOf("  migrate:")),
  );
  assert.doesNotMatch(migrationJobHeader, /SUPABASE_DB_PASSWORD/);
  assert.match(
    cloudflareWorkflow,
    /TASK150_QA_HMAC_KEY: \$\{\{ secrets\.TASK150_QA_HMAC_KEY \}\}/,
  );
  assert.equal(
    (cloudflareWorkflow.match(
      /TASK150_QA_HMAC_KEY: \$\{\{ secrets\.TASK150_QA_HMAC_KEY \}\}/g,
    ) ?? []).length,
    2,
  );
  const stagingJobHeader = cloudflareWorkflow.slice(
    cloudflareWorkflow.indexOf("  deploy-staging:"),
    cloudflareWorkflow.indexOf("    steps:", cloudflareWorkflow.indexOf("  deploy-staging:")),
  );
  assert.doesNotMatch(stagingJobHeader, /TASK150_QA_HMAC_KEY/);
  assert.match(
    cloudflareWorkflow,
    /wrangler secret put TASK150_QA_HMAC_KEY --env staging/,
  );
  assert.match(
    cloudflareWorkflow,
    /!status\.task150HmacKeyPresent/,
  );
  assert.match(cloudflareWorkflow, /Verify TASK-150 staging route is configured/);
  assert.match(
    cloudflareWorkflow,
    /node scripts\/verify-task-150-staging-route\.mjs/,
  );
  assert.match(routeVerification, /maximumAttempts = 18/);
  assert.match(routeVerification, /requestTimeoutMilliseconds = 10_000/);
  assert.match(routeVerification, /delayMilliseconds = 5_000/);
  assert.match(routeVerification, /startsWith\("application\/json"\)/);
  assert.match(
    routeVerification,
    /response\.headers\.get\("cache-control"\)\s*===\s*"no-store, max-age=0"/,
  );
  assert.match(routeVerification, /status\.code === "validation_failed"/);
});
