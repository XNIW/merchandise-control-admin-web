import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const smokePath =
  "scripts/testing/task-085-workers-dev-runtime-smoke.mjs";
const fixturePath =
  "scripts/testing/task-085-staging-products-fixture.mjs";

test("TASK-085 authenticated products smoke uses a personal synthetic owner boundary", async () => {
  const smoke = await readFile(smokePath, "utf8");

  assert.match(smoke, /TASK085_OWNER_EMAIL/);
  assert.match(smoke, /TASK085_OWNER_PASSWORD/);
  assert.match(smoke, /mode=admin-account&next=\/shop\/products/);
  assert.match(smoke, /TASK085_REQUIRE_AUTHENTICATED_PRODUCTS/);
  assert.doesNotMatch(smoke, /TASK085_SHOP_CODE/);
  assert.doesNotMatch(smoke, /TASK085_STAFF_CODE/);
  assert.doesNotMatch(smoke, /TASK085_STAFF_PIN/);
});

test("TASK-085 staging fixture provisions through audited RPCs and cleans exact IDs", async () => {
  const fixture = await readFile(fixturePath, "utf8");

  assert.match(fixture, /assertTargetEnv\("staging"/);
  assert.match(fixture, /TASK085_STAGING_HOST_ALLOWLIST/);
  assert.match(fixture, /\.rpc\("platform_create_shop"/);
  assert.match(fixture, /\.rpc\("platform_map_shop_inventory_source"/);
  assert.match(fixture, /\.rpc\("platform_soft_delete_shop"/);
  assert.match(fixture, /\.eq\("shop_inventory_source_id", lifecycle\.mappingId\)/);
  assert.match(fixture, /\.eq\("shop_member_id", lifecycle\.memberId\)/);
  assert.match(fixture, /deleteUser\(userId, true\)/);
  assert.match(fixture, /PASS_ZERO_RESIDUE/);
  assert.doesNotMatch(fixture, /\.from\("shops"\)\.insert\(/);
  assert.doesNotMatch(fixture, /\.from\("shops"\)\.delete\(/);
  assert.doesNotMatch(fixture, /\.like\(/);
  assert.doesNotMatch(fixture, /\.ilike\(/);
});

test("TASK-085 package command exposes the authenticated staging wrapper", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(
    packageJson.scripts["smoke:task085:staging:authenticated"],
    "node scripts/testing/task-085-staging-products-fixture.mjs",
  );
});
