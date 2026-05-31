import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-015 permissions matrix separates web shop members from POS staff roles", () => {
  const permissionsPath = "src/server/shop-admin/permissions.ts";

  assert.equal(existsSync(join(root, permissionsPath)), true, `${permissionsPath} is missing`);

  const permissions = readProjectFile(permissionsPath);

  assert.match(permissions, /import "server-only"/);
  assert.match(permissions, /SHOP_ADMIN_PERMISSION_MATRIX/);
  assert.match(permissions, /SHOP_STAFF_PERMISSION_MATRIX/);
  assert.match(permissions, /shop_owner/);
  assert.match(permissions, /shop_manager/);
  assert.match(permissions, /viewer/);
  assert.match(permissions, /cashier/);
  assert.match(permissions, /products\.read/);
  assert.match(permissions, /products\.write/);
  assert.match(permissions, /categories\.read/);
  assert.match(permissions, /categories\.write/);
  assert.match(permissions, /suppliers\.read/);
  assert.match(permissions, /suppliers\.write/);
  assert.match(permissions, /catalog\.import/);
  assert.match(permissions, /catalog\.export/);
  assert.match(permissions, /staff\.manage/);
  assert.match(permissions, /devices\.read/);
  assert.match(permissions, /devices\.manage/);
  assert.match(permissions, /history\.read/);
  assert.match(permissions, /audit\.read/);
  assert.match(permissions, /settings\.read/);
  assert.match(permissions, /settings\.write/);
  assert.match(permissions, /canShopAdmin/);
  assert.match(permissions, /canShopStaff/);
  assert.match(permissions, /assertShopAdminPermission/);
  assert.match(permissions, /assertShopStaffHasNoWebAccess/);
  assert.doesNotMatch(permissions, /@supabase\/|createSupabase|process\.env/);
});

test("TASK-015 roles page renders the permissions matrix through the server section builder", () => {
  const page = readProjectFile("src/app/shop/roles/page.tsx");
  const sectionData = readProjectFile("src/server/shop-admin/shop-section-data.ts");

  assert.match(page, /searchParams/);
  assert.match(page, /getShopSectionForRequest\(\s*"roles"/);
  assert.doesNotMatch(page, /shopSections\.roles/);
  assert.match(sectionData, /buildRolesSection/);
  assert.match(sectionData, /SHOP_ADMIN_PERMISSION_MATRIX/);
});
