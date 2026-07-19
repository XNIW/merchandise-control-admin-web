import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Script, createContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const defaultWin7PosRoot = "/Users/minxiang/Projects/Win7POS";
const win7PosRoot =
  process.env.WIN7POS_REPO_PATH?.trim() || defaultWin7PosRoot;
const requireWin7PosRepo = process.env.REQUIRE_WIN7POS_REPO === "1";
const requireForTranspiledModule = createRequire(import.meta.url);

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readWin7PosFile(relativePath) {
  return readFileSync(join(win7PosRoot, relativePath), "utf8");
}

function shouldSkipMissingWin7PosRepo() {
  return !existsSync(win7PosRoot) && !requireWin7PosRepo;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertContains(source, required, label = required) {
  assert.match(source, new RegExp(escapeRegExp(required)), label);
}

function loadTypeScriptModule(relativePath) {
  const absolutePath = join(root, relativePath);
  const source = readFileSync(absolutePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });
  const cjsModule = { exports: {} };
  const context = createContext({
    Buffer,
    exports: cjsModule.exports,
    module: cjsModule,
    require: (specifier) =>
      specifier === "server-only" ? {} : requireForTranspiledModule(specifier),
    Request,
    Response,
    TextDecoder,
    Uint8Array,
  });

  new Script(transpiled.outputText, { filename: relativePath }).runInContext(
    context,
  );

  return cjsModule.exports;
}

test("TASK-029 patches TASK-110 fresh reset drift without assuming product_prices exists", () => {
  const migrationPath =
    "supabase/migrations/20260515161500_task110_history_tombstone_grants.sql";
  const migration = readProjectFile(migrationPath);

  assertContains(migration, "to_regclass('public.product_prices')");
  assertContains(migration, "revoke all on table public.product_prices from anon");
  assert.doesNotMatch(
    migration,
    /\nrevoke all on table public\.product_prices from anon;\n(?![\s\S]*to_regclass\('public\.product_prices'\))/i,
  );
});

test("TASK-029 POS API route handlers enforce JSON content type, body limit and no-store", () => {
  const helperPath = "src/app/api/pos/_shared/pos-route-security.ts";
  const routePaths = [
    "src/app/api/pos/auth/first-login/route.ts",
    "src/app/api/pos/session/heartbeat/route.ts",
    "src/app/api/pos/catalog/pull/route.ts",
    "src/app/api/pos/sales/sync/route.ts",
  ];

  assert.equal(existsSync(join(root, helperPath)), true, `${helperPath} is missing`);

  const helper = readProjectFile(helperPath);
  for (const required of [
    "MAX_POS_JSON_BODY_BYTES",
    "application/json",
    "content-length",
    "getReader",
    "JSON.parse",
    "Cache-Control",
    "no-store",
    "posMethodNotAllowedResponse",
    "method_not_allowed",
    "Allow",
  ]) {
    assertContains(helper, required);
  }

  for (const routePath of routePaths) {
    const route = readProjectFile(routePath);

    assertContains(route, "readPosJsonBody");
    assertContains(route, "posJsonResponse");
    assertContains(route, "posMethodNotAllowedResponse");
    assertContains(route, "createPosRouteRequestContext");
    assertContains(route, "clientRequestId");
    assertContains(route, "requestId");
    assertContains(route, "route:");
    assertContains(route, "function methodNotAllowed(request: Request)");
    for (const method of ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "PUT"]) {
      assertContains(route, `methodNotAllowed as ${method}`);
    }
    assertContains(route, 'export const runtime = "nodejs"');
    assertContains(route, 'export const dynamic = "force-dynamic"');
    assert.doesNotMatch(route, /request\.json\(\)/);
    assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|credential_hash|service_role/i);
  }
});

test("TASK-029 POS JSON helper rejects unsafe bodies and parses valid JSON", async () => {
  const helper = loadTypeScriptModule(
    "src/app/api/pos/_shared/pos-route-security.ts",
  );
  const validBody = { shopCode: "SHOP001", staffCode: "POS01" };

  const parsed = await helper.readPosJsonBody(
    new Request("http://localhost/api/pos/auth/first-login", {
      body: JSON.stringify(validBody),
      headers: { "content-type": "application/json; charset=utf-8" },
      method: "POST",
    }),
  );
  const wrongContentType = await helper.readPosJsonBody(
    new Request("http://localhost/api/pos/auth/first-login", {
      body: JSON.stringify(validBody),
      headers: { "content-type": "text/plain" },
      method: "POST",
    }),
  );
  const invalidJson = await helper.readPosJsonBody(
    new Request("http://localhost/api/pos/auth/first-login", {
      body: "{",
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );
  const oversizedBody = await helper.readPosJsonBody(
    new Request("http://localhost/api/pos/auth/first-login", {
      body: `"${"x".repeat(helper.MAX_POS_JSON_BODY_BYTES + 1)}"`,
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );

  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), validBody);
  assert.equal(wrongContentType, null);
  assert.equal(invalidJson, null);
  assert.equal(oversizedBody, null);

  const context = helper.createPosRouteRequestContext(
    new Request("http://localhost/api/pos/auth/first-login", {
      headers: { "x-client-request-id": "TASK032-CLIENT-REQUEST" },
    }),
    "pos.auth.first-login",
  );
  const response = helper.posJsonResponse({ ok: false }, 400, context);
  const responseBody = await response.json();
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-client-request-id"), "TASK032-CLIENT-REQUEST");
  assert.match(response.headers.get("x-request-id") ?? "", /^posreq_[0-9a-f-]{36}$/i);
  assert.deepEqual(responseBody, {
    clientRequestId: "TASK032-CLIENT-REQUEST",
    ok: false,
    requestId: context.serverRequestId,
  });

  const methodResponse = helper.posMethodNotAllowedResponse("POST", context);
  const methodBody = await methodResponse.json();
  assert.equal(methodResponse.status, 405);
  assert.equal(methodResponse.headers.get("cache-control"), "no-store");
  assert.equal(methodResponse.headers.get("x-request-id"), context.serverRequestId);
  assert.equal(methodResponse.headers.get("allow"), "POST");
  assert.deepEqual(methodBody, {
    clientRequestId: "TASK032-CLIENT-REQUEST",
    code: "method_not_allowed",
    message: "Method not allowed.",
    ok: false,
    requestId: context.serverRequestId,
  });

  const sensitiveContext = helper.createPosRouteRequestContext(
    new Request("http://localhost/api/pos/auth/first-login", {
      headers: { "x-client-request-id": "mcpos_session_SHOULD_NOT_ECHO" },
    }),
    "pos.auth.first-login",
  );
  const sensitiveResponse = helper.posJsonResponse({ ok: false }, 401, sensitiveContext);
  const sensitiveBody = await sensitiveResponse.json();
  assert.equal(sensitiveContext.clientRequestId, undefined);
  assert.equal(sensitiveResponse.headers.get("x-client-request-id"), null);
  assert.equal("clientRequestId" in sensitiveBody, false);
  assert.match(sensitiveBody.requestId, /^posreq_[0-9a-f-]{36}$/i);
});

test("TASK-029 documents staging, blockers and handoff without production-ready claim", () => {
  const taskPath =
    "docs/TASKS/TASK-029-production-path-staging-win7pos-bootstrap.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-029/README.md";
  const stagingPath = "docs/DEPLOYMENT/STAGING.md";

  for (const requiredPath of [taskPath, evidencePath, stagingPath]) {
    assert.equal(existsSync(join(root, requiredPath)), true, `${requiredPath} is missing`);
  }

  const taskDocs = [
    readProjectFile(taskPath),
    readProjectFile(evidencePath),
    readProjectFile(stagingPath),
  ].join("\n");
  const combined = [
    taskDocs,
    readProjectFile("docs/MASTER-PLAN.md"),
  ].join("\n");

  for (const required of [
    "TASK-028",
    "DONE_RECONCILED_WITH_NOTES",
    "TASK-110",
    "BLOCKED_STAGING_CREDENTIALS",
    "Win7POS online bootstrap",
    "Admin Web POS API HTTPS",
    "SUPABASE_SERVICE_ROLE_KEY",
    "server-side",
    "No production",
  ]) {
    assertContains(combined, required);
  }

  assert.doesNotMatch(taskDocs, /production-ready/i);
});

test("TASK-029 Win7POS fresh install bootstrap keeps Admin Web as backend boundary", (t) => {
  if (shouldSkipMissingWin7PosRepo()) {
    t.skip("SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE: Win7POS repo is not available");
    return;
  }

  assert.equal(existsSync(win7PosRoot), true, "Win7POS repo is missing");

  const mainWindow = readWin7PosFile("src/Win7POS.Wpf/MainWindow.xaml.cs");
  const firstRunXaml = readWin7PosFile(
    "src/Win7POS.Wpf/Pos/Dialogs/FirstRunSetupDialog.xaml",
  );
  const firstRunCode = readWin7PosFile(
    "src/Win7POS.Wpf/Pos/Dialogs/FirstRunSetupDialog.xaml.cs",
  );
  const dialogXaml = readWin7PosFile(
    "src/Win7POS.Wpf/Pos/Dialogs/PosOnlineFirstLoginDialog.xaml",
  );
  const dialog = readWin7PosFile(
    "src/Win7POS.Wpf/Pos/Dialogs/PosOnlineFirstLoginDialog.xaml.cs",
  );
  const posLegacyTranslations = readWin7PosFile(
    "src/Win7POS.Wpf/Localization/PosTranslations.LegacyReachable.cs",
  );
  const client = [
    readWin7PosFile("src/Win7POS.Data/Online/PosAdminWebClient.cs"),
    readWin7PosFile("src/Win7POS.Core/Online/PosOnlineTransportContracts.cs"),
  ].join("\n");
  const options = readWin7PosFile(
    "src/Win7POS.Core/Online/PosAdminWebOptions.cs",
  );
  const bootstrap = readWin7PosFile(
    "src/Win7POS.Wpf/Pos/Online/PosOnlineBootstrapService.cs",
  );
  const userRepo = readWin7PosFile(
    "src/Win7POS.Data/Repositories/UserRepository.cs",
  );
  const initializer = readWin7PosFile("src/Win7POS.Data/DbInitializer.cs");
  const scanner = readWin7PosFile("scripts/check-pos-online-bootstrap.ps1");
  const runtimeCombined = [
    mainWindow,
    firstRunXaml,
    firstRunCode,
    dialogXaml,
    dialog,
    posLegacyTranslations,
    options,
    bootstrap,
    userRepo,
    initializer,
  ].join("\n");
  const combined = [
    runtimeCombined,
    scanner,
  ].join("\n");

  for (const required of [
    "TryOnlineBootstrapFirstRunAsync",
    "PosOnlineBootstrapService",
    "SaveBaseUrl",
    "UpsertRemoteStaffMirrorAsync",
    "remote_staff_id",
    "remote_shop_id",
    "remote_credential_version",
    "PosCatalogPullService",
    "Recovery/dev",
    "Impostazioni avanzate / Server",
    "AdminWebBaseUrl",
    "onlineFirstLogin.shopCode",
    "onlineFirstLogin.staffCode",
    "Codice negozio",
    "Codice staff",
    "PosDeviceIdentity.GetStableDisplayName",
    "CredentialBox.Clear",
    "MaxResponseBodyBytes",
    "ReadResponseBodyAsync",
    "new FirstRunSetupDialog(_factory)",
    "OnRecoveryClick",
    "codice negozio, codice staff",
  ]) {
    assertContains(`${combined}\n${client}`, required);
  }

  assert.doesNotMatch(runtimeCombined, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
  assert.doesNotMatch(runtimeCombined, /NEXT_PUBLIC_SUPABASE|supabase\.co/i);
  assert.doesNotMatch(runtimeCombined, /mcpos_(device|session)_[A-Za-z0-9_-]+/);
  assert.doesNotMatch(dialogXaml, /Shop code|Staff code|Nome device|Indirizzo pannello|token trusted/i);
  assert.doesNotMatch(bootstrap, /shop code|staff code/);
  assert.doesNotMatch(mainWindow, /ModernMessageDialog\.Show[\s\S]{0,180}ex\.Message/);
  assert.match(dialog, /finally[\s\S]*CredentialBox\.Clear\(\)/);
  assert.doesNotMatch(firstRunCode, /ShowError\(msg\)/);
  assert.match(firstRunCode, /finally[\s\S]*PinBox\.Clear\(\)[\s\S]*ConfirmPinBox\.Clear\(\)/);
});
