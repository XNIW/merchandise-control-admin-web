import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Script, createContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const requireForTranspiledModule = createRequire(import.meta.url);

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
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
  });

  new Script(transpiled.outputText, { filename: relativePath }).runInContext(
    context,
  );

  return cjsModule.exports;
}

test("TASK-032 permissions matrix keeps owner, manager, viewer and POS staff boundaries explicit", () => {
  const permissions = loadTypeScriptModule(
    "src/server/shop-admin/permissions.ts",
  );

  for (const permission of [
    "catalog.import",
    "catalog.export",
    "products.write",
    "categories.write",
    "suppliers.write",
    "members.manage",
    "staff.manage",
    "devices.manage",
    "settings.write",
  ]) {
    assert.equal(permissions.canShopAdmin("shop_owner", permission), true);
  }

  for (const permission of [
    "catalog.import",
    "catalog.export",
    "products.write",
    "categories.write",
    "suppliers.write",
    "staff.manage",
  ]) {
    assert.equal(permissions.canShopAdmin("shop_manager", permission), true);
  }

  for (const denied of ["members.manage", "devices.manage", "settings.write"]) {
    assert.equal(permissions.canShopAdmin("shop_manager", denied), false);
  }

  for (const denied of [
    "catalog.import",
    "catalog.export",
    "products.write",
    "categories.write",
    "suppliers.write",
    "members.manage",
    "staff.manage",
    "devices.manage",
    "settings.write",
  ]) {
    assert.equal(permissions.canShopAdmin("viewer", denied), false);
  }

  assert.equal(permissions.canShopAdmin("viewer", "products.read"), true);
  assert.equal(permissions.canShopStaff("cashier", "pos.sell"), true);
  assert.equal(permissions.canShopStaff("cashier", "catalog.price_edit"), false);
  assert.equal(permissions.assertShopStaffHasNoWebAccess("cashier"), true);
});

test("TASK-032 action context denies unknown requested shop ids instead of falling back", () => {
  const actionContext = readProjectFile("src/server/shop-admin/action-context.ts");
  const dataAccess = readProjectFile("src/server/shop-admin/data-access.ts");

  assert.match(actionContext, /requestedShopId/);
  assert.match(actionContext, /strictRequestedShop: true/);
  assert.match(actionContext, /canStaffWebPerformShopAdminAction/);
  assert.match(dataAccess, /availableShops\.find/);
  assert.match(dataAccess, /strictRequestedShop/);
  assert.doesNotMatch(
    dataAccess,
    /availableShops\.find\([\s\S]*\?\?\s*access\.selectedShop/,
  );
});

test("TASK-032 sensitive Shop Admin actions stay server-side, permissioned and audited", () => {
  const catalogMutations = readProjectFile(
    "src/server/shop-admin/catalog-mutations.ts",
  );
  const memberMutations = readProjectFile(
    "src/server/shop-admin/member-mutations.ts",
  );
  const staffMutations = readProjectFile(
    "src/server/shop-admin/staff-mutations.ts",
  );
  const deviceMutations = readProjectFile(
    "src/server/shop-admin/device-mutations.ts",
  );
  const importExport = readProjectFile(
    "src/server/shop-admin/import-export-workbook.ts",
  );
  const combined = [
    catalogMutations,
    memberMutations,
    staffMutations,
    deviceMutations,
    importExport,
  ].join("\n");

  assert.match(combined, /import "server-only"/);
  assert.match(catalogMutations, /"products\.write"/);
  assert.match(catalogMutations, /"categories\.write"/);
  assert.match(catalogMutations, /"suppliers\.write"/);
  assert.match(memberMutations, /"members\.manage"/);
  assert.match(staffMutations, /"staff\.manage"/);
  assert.match(deviceMutations, /"devices\.manage"/);
  assert.match(importExport, /"catalog\.import"/);
  assert.match(importExport, /"catalog\.export"/);
  assert.match(importExport, /shop_admin_audit_event/);
  assert.match(staffMutations, /reason_required/);
  assert.doesNotMatch(combined, /service_role|SUPABASE_SERVICE_ROLE_KEY/i);
});

test("TASK-032 permissions evidence remains tied to the active mega-task", () => {
  assert.equal(
    existsSync(join(root, "docs/TASKS/EVIDENCE/TASK-032/README.md")),
    true,
  );

  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");
  const task = readProjectFile(
    "docs/TASKS/TASK-032-full-project-progression-mega-task.md",
  );

  assert.match(
    masterPlan,
    /Task attivo: `(NONE|NESSUNO)`|Task attivo: `TASK-032 - Full project progression mega-task`|Task attivo: `TASK-033 - Controlled TASK-032 review \+ HTTPS non-production \+ Win7POS live E2E \+ POS reconciliation \+ sales sync foundation`|Task attivo: `TASK-034 - Unified project progression: VM pause, Admin Web polish, Shop hardening, Win7POS non-VM hardening, sales sync planning`|Task attivo: `TASK-035 - Authenticated Admin Web QA \+ Shop Admin smoke harness`|Task attivo: `TASK-036 - Admin Web web readiness, local dev, Cloudflared staging, Shop UX, Sync Center and production hardening`|Task attivo: `TASK-038 - POS manager web login, Platform provisioning, role permission tree, and real revenue dashboard gate`|Task attivo: `TASK-039 - Staff-aware Shop Admin completion, permission tree, lifecycle, staging, Win7POS gate and sales foundation`|Task attivo: `TASK-040 - Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation`|Task attivo: `TASK-041 - Runtime Completion: Supabase, Cloudflare\/OpenNext Staging, Sales Sync and Win7POS E2E`|Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`/,
  );
  assert.match(task, /4 - Permissions hardening/);
});
