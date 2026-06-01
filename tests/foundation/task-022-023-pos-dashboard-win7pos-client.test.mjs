import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const win7PosRoot = "/Users/minxiang/Projects/Win7POS";

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readWin7PosFile(relativePath) {
  return readFileSync(join(win7PosRoot, relativePath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function listWin7PosFiles(start, extensions) {
  const absoluteStart = join(win7PosRoot, start);

  if (!existsSync(absoluteStart)) {
    return [];
  }

  const entries = readdirSync(absoluteStart);
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(absoluteStart, entry);
    const stats = statSync(absolutePath);
    const relativePath = join(start, entry);

    if (stats.isDirectory()) {
      if (![".git", "bin", "obj"].includes(entry)) {
        files.push(...listWin7PosFiles(relativePath, extensions));
      }
      continue;
    }

    if (stats.isFile() && extensions.some((extension) => entry.endsWith(extension))) {
      files.push(relativePath);
    }
  }

  return files;
}

function combinedWin7PosSource() {
  return listWin7PosFiles("src", [".cs", ".xaml", ".csproj"])
    .map(readWin7PosFile)
    .join("\n");
}

test("TASK-022_023 governance artifacts track execution without marking DONE", () => {
  const taskPath = "docs/TASKS/TASK-022-023-pos-dashboard-win7pos-client.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-022-023/README.md";

  assert.equal(existsSync(join(root, taskPath)), true, `${taskPath} is missing`);
  assert.equal(existsSync(join(root, evidencePath)), true, `${evidencePath} is missing`);

  const task = readProjectFile(taskPath);
  const evidence = readProjectFile(evidencePath);
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");

  for (const required of [
    "TASK-022",
    "TASK-023",
    "Win7POS",
    "POS live dashboard",
    "first login",
    "trusted device",
    "heartbeat",
    "No sales sync",
    "no dati finti",
  ]) {
    assert.match(`${task}\n${evidence}`, new RegExp(escapeRegExp(required), "i"));
  }

  assert.match(task, /Stato: `(IN_PROGRESS|REVIEW)`/);
  assert.match(task, /Fase: `(EXECUTION|REVIEW)`/);
  assert.doesNotMatch(task, /DONE_RECONCILED/);
  assert.match(masterPlan, /TASK-022_023 - POS live dashboard \+ Win7POS first login trusted device/);
  assert.match(masterPlan, /Task attivo: `TASK-022_023 - POS live dashboard \+ Win7POS first login trusted device`/);
});

test("Admin Web POS live dashboard is Shop Admin read-only and uses real POS tables only", () => {
  const routePath = "src/app/shop/pos/page.tsx";
  const readModelPath = "src/server/shop-admin/pos-live-read-model.ts";
  const sectionDataPath = "src/server/shop-admin/shop-section-data.ts";
  const sectionsPath = "src/components/shop/shopSections.ts";

  for (const relativePath of [routePath, readModelPath, sectionDataPath, sectionsPath]) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const route = readProjectFile(routePath);
  const readModel = readProjectFile(readModelPath);
  const sectionData = readProjectFile(sectionDataPath);
  const sections = readProjectFile(sectionsPath);
  const dashboardSource = `${route}\n${readModel}\n${sectionData}\n${sections}`;

  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /getShopSectionForRequest\(\s*"pos"/);
  assert.doesNotMatch(route, /^["']use client["'];?/m);

  assert.match(readModel, /import "server-only"/);
  assert.match(readModel, /createSupabaseAdminClient/);
  assert.match(readModel, /resolveCurrentShopAdminShellAccess/);
  for (const required of [
    '.from("shop_devices")',
    '.from("pos_device_credentials")',
    '.from("pos_sessions")',
    '.from("staff_accounts_safe")',
    '.from("audit_logs")',
    '.eq("shop_id", selectedShop.shopId)',
  ]) {
    assert.match(readModel, new RegExp(escapeRegExp(required)));
  }
  assert.doesNotMatch(readModel, /select\("\*"\)/);
  assert.doesNotMatch(readModel, /\.(insert|update|delete|upsert|rpc)\s*\(/);
  assert.doesNotMatch(readModel, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
  assert.doesNotMatch(readModel, /token_hash|session_token_hash|trustedDeviceToken|deviceToken|sessionToken/);

  assert.match(sections, /key: "pos"/);
  assert.match(sections, /href: "\/shop\/pos"/);
  assert.match(sectionData, /buildPosLiveSection/);
  assert.match(sectionData, /getShopPosLiveReadModel/);
  assert.doesNotMatch(dashboardSource, /sales today|revenue|orders|pos_sales|sales_sync|sync_batch/i);
  assert.doesNotMatch(dashboardSource, /mock|fake|demo/i);
});

test("Win7POS client implements first login, trusted token storage and heartbeat safely", () => {
  assert.equal(existsSync(win7PosRoot), true, "Win7POS repo is missing");

  const requiredPaths = [
    "src/Win7POS.Wpf/Pos/Online/PosAdminWebClient.cs",
    "src/Win7POS.Wpf/Pos/Online/PosTrustedDeviceStore.cs",
    "src/Win7POS.Wpf/Pos/Online/PosAdminWebOptions.cs",
    "src/Win7POS.Wpf/Pos/Online/PosDeviceIdentity.cs",
    "src/Win7POS.Wpf/Pos/Dialogs/PosOnlineFirstLoginDialog.xaml",
    "src/Win7POS.Wpf/Pos/Dialogs/PosOnlineFirstLoginDialog.xaml.cs",
  ];

  for (const relativePath of requiredPaths) {
    assert.equal(
      existsSync(join(win7PosRoot, relativePath)),
      true,
      `${relativePath} is missing`,
    );
  }

  const client = readWin7PosFile("src/Win7POS.Wpf/Pos/Online/PosAdminWebClient.cs");
  const store = readWin7PosFile("src/Win7POS.Wpf/Pos/Online/PosTrustedDeviceStore.cs");
  const options = readWin7PosFile("src/Win7POS.Wpf/Pos/Online/PosAdminWebOptions.cs");
  const identity = readWin7PosFile("src/Win7POS.Wpf/Pos/Online/PosDeviceIdentity.cs");
  const loginDialog = readWin7PosFile("src/Win7POS.Wpf/Pos/Dialogs/PosOnlineFirstLoginDialog.xaml.cs");
  const operatorDialog = readWin7PosFile("src/Win7POS.Wpf/Pos/Dialogs/OperatorLoginDialog.xaml.cs");
  const mainWindow = readWin7PosFile("src/Win7POS.Wpf/MainWindow.xaml.cs");
  const combined = combinedWin7PosSource();

  assert.match(client, /HttpClient/);
  assert.match(client, /ServicePointManager\.SecurityProtocol[\s\S]*SecurityProtocolType\.Tls12/);
  assert.match(client, /Timeout\s*=/);
  assert.match(client, /\/api\/pos\/auth\/first-login/);
  assert.match(client, /\/api\/pos\/session\/heartbeat/);
  assert.match(client, /shopCode/);
  assert.match(client, /staffCode/);
  assert.match(client, /credential/);
  assert.doesNotMatch(client, /console\./i);

  assert.match(store, /ProtectedData\.Protect/);
  assert.match(store, /ProtectedData\.Unprotect/);
  assert.doesNotMatch(store, /File\.WriteAllText[\s\S]{0,160}(trustedDeviceToken|sessionToken|deviceToken)/);

  assert.match(options, /WIN7POS_ADMIN_WEB_BASE_URL/);
  assert.match(options, /pos-admin-web\.config/);
  assert.doesNotMatch(options, /https:\/\/(?!localhost|127\.0\.0\.1)/i);

  assert.match(identity, /Guid\.NewGuid/);
  assert.match(loginDialog, /FirstLoginAsync/);
  assert.match(operatorDialog, /PosOnlineFirstLoginDialog/);
  assert.match(mainWindow, /TryRefreshTrustedPosSessionAsync/);

  assert.doesNotMatch(combined, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
  assert.doesNotMatch(combined, /mcpos_(device|session)_[A-Za-z0-9_-]+/);
  assert.doesNotMatch(combined, /pin\s*=\s*["'][0-9]{4,6}["']|password\s*=\s*["'][^"']+["']/i);
  assert.doesNotMatch(combined, /pos_sales|sales_sync|sync_batch|api\/pos\/sales/i);
});

test("TASK-022_023 security scanner covers Admin Web and Win7POS constraints", () => {
  const scanner = readProjectFile("scripts/security-checks.mjs");
  const win7Scanner = readWin7PosFile("scripts/check-pos-online-client.ps1");

  assert.match(scanner, /checkTask022023PosDashboardWin7PosClient/);
  assert.match(scanner, /checkTask022023PosDashboardWin7PosClient\(\)/);
  assert.match(scanner, /Win7POS/);
  assert.match(scanner, /ProtectedData/);
  assert.match(scanner, /SecurityProtocolType\.Tls12/);
  assert.match(scanner, /pos-admin-web\.config/);
  assert.match(win7Scanner, /sensitiveLogPattern/);
  assert.match(win7Scanner, /Log\(\?:Info\|Warning\|Error\)/);
  assert.match(win7Scanner, /trustedDeviceToken\|sessionToken\|deviceToken/);
});
