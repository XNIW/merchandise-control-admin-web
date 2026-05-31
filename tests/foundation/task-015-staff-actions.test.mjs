import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readTask015Migrations() {
  return readdirSync(join(root, "supabase/migrations"))
    .filter((file) => file.endsWith(".sql") && file.includes("task_015"))
    .map((file) => readProjectFile(`supabase/migrations/${file}`))
    .join("\n");
}

test("TASK-015 staff mutations are implemented through audited RPCs and safe one-time credential handling", () => {
  const mutationPath = "src/server/shop-admin/staff-mutations.ts";
  const actionsPath = "src/app/shop/actions.ts";
  const panelPath = "src/app/shop/_components/StaffActionPanel.tsx";

  assert.equal(existsSync(join(root, mutationPath)), true, `${mutationPath} is missing`);
  assert.equal(existsSync(join(root, actionsPath)), true, `${actionsPath} is missing`);
  assert.equal(existsSync(join(root, panelPath)), true, `${panelPath} is missing`);

  const migration = readTask015Migrations();
  const mutations = readProjectFile(mutationPath);
  const actions = readProjectFile(actionsPath);
  const panel = readProjectFile(panelPath);
  const staffUi = [
    "src/app/shop/staff/page.tsx",
    "src/components/shop/ShopSectionPage.tsx",
    "src/components/shop/shopSections.ts",
    panelPath,
  ]
    .map(readProjectFile)
    .join("\n");

  for (const rpcName of [
    "shop_staff_create",
    "shop_staff_reset_credential",
    "shop_staff_suspend",
    "shop_staff_reactivate",
    "shop_staff_archive",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${rpcName}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpcName}`));
    assert.match(mutations, new RegExp(`\\.rpc\\("${rpcName}"`));
  }

  assert.match(migration, /app_private\.is_active_shop_staff_admin_member/);
  assert.match(migration, /shop\.staff\./);
  assert.match(migration, /must_change_credential/);
  assert.doesNotMatch(
    migration,
    /grant\s+(insert|update|delete|all)[\s\S]*on table public\.staff_accounts[\s\S]*to authenticated/i,
  );

  assert.match(mutations, /import "server-only"/);
  assert.match(mutations, /hashStaffCredential/);
  assert.match(mutations, /generateTemporaryStaffCredential/);
  assert.match(mutations, /temporaryCredential/);
  assert.match(mutations, /staff\.manage/);
  assert.match(actions, /^"use server";/);
  assert.match(actions, /createStaffAction/);
  assert.match(actions, /resetStaffCredentialAction/);
  assert.match(actions, /suspendStaffAction/);
  assert.match(actions, /reactivateStaffAction/);
  assert.match(actions, /archiveStaffAction/);
  assert.match(panel, /useActionState/);
  assert.match(panel, /Create staff/);
  assert.match(panel, /Reset credential/);
  assert.match(panel, /Suspend/);
  assert.match(panel, /Reactivate/);
  assert.match(panel, /Archive/);
  assert.match(panel, /one-time/i);
  assert.doesNotMatch(mutations, /\.(insert|update|delete|upsert)\s*\(/);
  assert.doesNotMatch(
    staffUi,
    /credential_hash|pin_hash|password_hash|hashStaffCredential|verifyStaffCredential/,
  );
});
