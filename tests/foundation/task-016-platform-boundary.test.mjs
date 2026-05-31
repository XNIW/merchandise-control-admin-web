import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-016 Platform routes are complete and protected server-side", () => {
  const routeFiles = [
    "src/app/platform/overview/page.tsx",
    "src/app/platform/users/[profileId]/page.tsx",
    "src/app/platform/shops/[shopId]/page.tsx",
    "src/app/platform/shops/new/page.tsx",
    "src/app/platform/provisioning/page.tsx",
    "src/app/platform/admins/page.tsx",
    "src/app/platform/data/page.tsx",
    "src/app/platform/devices/page.tsx",
    "src/app/platform/sync/page.tsx",
    "src/app/platform/history/page.tsx",
    "src/app/platform/support/page.tsx",
  ];

  for (const relativePath of routeFiles) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
    assert.match(readProjectFile(relativePath), /dynamic = "force-dynamic"/);
  }

  const layout = readProjectFile("src/app/platform/layout.tsx");
  assert.match(layout, /resolveCurrentAdminRouteAccess/);
  assert.match(layout, /status !== "platform_admin"/);
  assert.doesNotMatch(layout, /^["']use client["'];?/m);

  const navigation = readProjectFile("src/components/platform/platformData.ts");
  for (const href of [
    "/platform/users",
    "/platform/shops",
    "/platform/provisioning",
    "/platform/admins",
    "/platform/audit",
    "/platform/system",
    "/platform/data",
    "/platform/devices",
    "/platform/sync",
    "/platform/operations",
    "/platform/support",
  ]) {
    assert.match(navigation, new RegExp(href.replaceAll("/", "\\/")));
  }
});

test("TASK-016 Platform boundary does not duplicate Shop Admin operations", () => {
  const platformSource = [
    "src/app/platform/page.tsx",
    "src/app/platform/overview/page.tsx",
    "src/app/platform/users/page.tsx",
    "src/app/platform/shops/page.tsx",
    "src/app/platform/devices/page.tsx",
    "src/app/platform/support/page.tsx",
    "src/server/platform-admin/read-model.ts",
  ]
    .filter((relativePath) => existsSync(join(root, relativePath)))
    .map(readProjectFile)
    .join("\n");

  assert.doesNotMatch(platformSource, /shop_catalog_|import-export|Import Excel|Export Excel/);
  assert.doesNotMatch(platformSource, /shop_staff_create|shop_staff_reset_credential/);
  assert.doesNotMatch(platformSource, /\bPIN\b|credential_hash|password/i);
});
