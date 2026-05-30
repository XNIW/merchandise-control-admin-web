import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migrationPath =
  "supabase/migrations/20260530041048_task_005g_admin_web_schema_rls.sql";
const generatedTypesPath = "src/lib/supabase/database.types.ts";

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const adminTables = [
  "profiles",
  "shops",
  "shop_members",
  "platform_admins",
  "shop_inventory_sources",
  "audit_logs",
];

test("TASK-005G migration creates the Platform Admin schema with RLS", () => {
  assert.equal(existsSync(join(root, migrationPath)), true);

  const migration = readProjectFile(migrationPath);

  for (const tableName of adminTables) {
    assert.match(
      migration,
      new RegExp(`create table if not exists public\\.${tableName}`),
      `${tableName} table must be created`,
    );
    assert.match(
      migration,
      new RegExp(`alter table public\\.${tableName} enable row level security`),
      `${tableName} must enable RLS`,
    );
  }

  assert.doesNotMatch(migration, /grant\s+\w+.*\s+to\s+anon/i);
  assert.match(migration, /create schema if not exists app_private/);
  assert.match(migration, /security definer/);
  assert.doesNotMatch(migration, /user_metadata|raw_user_meta_data/);
});

test("TASK-005G generated Database types include admin tables", () => {
  assert.equal(existsSync(join(root, generatedTypesPath)), true);

  const generatedTypes = readProjectFile(generatedTypesPath);

  for (const tableName of adminTables) {
    assert.match(
      generatedTypes,
      new RegExp(`${tableName}: \\{`),
      `${tableName} must be present in generated Database types`,
    );
  }
});

test("TASK-005G server boundary uses SSR cookies and stays read-only", () => {
  const serverBoundary = readProjectFile("src/lib/supabase/server.ts");
  const readModel = readProjectFile("src/server/platform-admin/read-model.ts");

  assert.match(serverBoundary, /@supabase\/ssr/);
  assert.match(serverBoundary, /cookies/);
  assert.match(serverBoundary, /Database/);
  assert.doesNotMatch(serverBoundary, /SERVICE_ROLE|service_role/i);
  assert.doesNotMatch(readModel, /\.(insert|update|delete|upsert|rpc)\s*\(/);
});

test("TASK-005G platform routes force request-time rendering", () => {
  const routePaths = [
    "src/app/page.tsx",
    "src/app/platform/page.tsx",
    "src/app/platform/users/page.tsx",
    "src/app/platform/shops/page.tsx",
    "src/app/platform/audit/page.tsx",
    "src/app/platform/system/page.tsx",
    "src/app/platform/operations/page.tsx",
  ];

  for (const routePath of routePaths) {
    const route = readProjectFile(routePath);

    assert.match(
      route,
      /export const dynamic = ["']force-dynamic["']/,
      `${routePath} must not prerender auth-scoped Platform Admin data`,
    );
  }
});
