import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-016 provisioning supports existing owner and pending owner invite boundaries", () => {
  const provisioningPagePath = "src/app/platform/provisioning/page.tsx";
  const newShopPagePath = "src/app/platform/shops/new/page.tsx";
  const operationsActionsPath = "src/app/platform/operations/actions.ts";
  const shopActionsPath = "src/server/platform-admin/shop-actions.ts";
  const validationPath = "src/server/platform-admin/shop-action-validation.ts";
  const completionMigrationPath =
    "supabase/migrations/20260531210000_task_016_platform_completion.sql";

  for (const relativePath of [
    provisioningPagePath,
    newShopPagePath,
    operationsActionsPath,
    shopActionsPath,
    validationPath,
    completionMigrationPath,
  ]) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const provisioningPage = readProjectFile(provisioningPagePath);
  const provisioningForms = readProjectFile(
    "src/app/platform/provisioning/ShopProvisioningForms.tsx",
  );
  const newShopPage = readProjectFile(newShopPagePath);
  const operationsActions = readProjectFile(operationsActionsPath);
  const shopActions = readProjectFile(shopActionsPath);
  const validation = readProjectFile(validationPath);
  const migration = readProjectFile(completionMigrationPath);

  assert.match(
    `${provisioningPage}\n${provisioningForms}\n${newShopPage}`,
    /createPlatformShopAction|createPlatformShopWithOwnerBootstrapAction/,
  );
  assert.match(
    `${provisioningPage}\n${provisioningForms}\n${newShopPage}`,
    /createPlatformPendingOwnerInviteAction|createPlatformPendingOwnerInviteWithFiscalAction/,
  );
  assert.match(`${provisioningPage}\n${provisioningForms}\n${newShopPage}`, /PASS_WITH_NOTES_EMAIL_DELIVERY|Email delivery pending|Email delivery is not active yet/i);
  assert.doesNotMatch(`${provisioningPage}\n${newShopPage}`, /BLOCKED_AUTH_PROVISIONING/);
  assert.match(operationsActions, /^"use server";/);
  assert.match(operationsActions, /pending_owner_invite/);
  assert.match(shopActions, /\.rpc\("platform_create_shop"/);
  assert.match(shopActions, /\.rpc\("platform_create_shop_with_pending_owner_invite"/);
  assert.match(validation, /normalizeShopCode/);
  assert.match(validation, /validatePendingOwnerInviteInput/);
  assert.match(migration, /create table if not exists public\.platform_owner_invites/);
  assert.match(migration, /owner_contact_redacted/);
  assert.match(migration, /owner_contact_digest/);
  assert.match(migration, /platform_create_shop_with_pending_owner_invite/);
  assert.match(migration, /platform\.shop\.pending_owner_invite\.success/);
  assert.doesNotMatch(`${provisioningPage}\n${newShopPage}\n${shopActions}\n${migration}`, /magic_link|access_token|refresh_token/i);
});

test("TASK-016 provisioning does not create unsafe auth or POS credentials", () => {
  const source = [
    "src/app/platform/provisioning/page.tsx",
    "src/app/platform/shops/new/page.tsx",
    "src/server/platform-admin/shop-actions.ts",
    "src/app/platform/operations/actions.ts",
    "supabase/migrations/20260531210000_task_016_platform_completion.sql",
  ]
    .filter((relativePath) => existsSync(join(root, relativePath)))
    .map(readProjectFile)
    .join("\n");

  assert.doesNotMatch(source, /auth\.admin|inviteUser|generateLink|signUp|createUser/i);
  assert.doesNotMatch(source, /shop_staff_create|credential_raw|raw_credential/i);
  assert.match(source, /ownerProfileId/);
  assert.match(source, /ownerEmail|owner_contact/);
  assert.match(source, /reason/);
});
