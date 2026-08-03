import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  buildClientFixtureAssets,
  validateClientFixtureTarget,
} from "../../scripts/admin/storefront-v1-client-fixture.mjs";

const projectRef = "abcdefghijklmnopqrst";
const valid = {
  ALLOWED_STAGING_SUPABASE_PROJECT_REFS: projectRef,
  GITHUB_REF: "refs/heads/integration/storefront-v1",
  NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
  STAGING_SUPABASE_PROJECT_REF: projectRef,
  STOREFRONT_CLIENT_FIXTURE_ALLOW_STAGING: "yes",
  STOREFRONT_CLIENT_FIXTURE_SHOP_SLUG: "storefront-v1-staging",
  STOREFRONT_STAGING_DATABASE_URL: `postgresql://postgres.${projectRef}:redacted@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require`,
  TEST_TARGET: "staging",
};
const source = readFileSync(
  join(process.cwd(), "scripts/admin/storefront-v1-client-fixture.mjs"),
  "utf8",
);

test("client fixture accepts only the exact guarded staging target", () => {
  const result = validateClientFixtureTarget(valid);

  assert.equal(result.projectRef, projectRef);
  assert.equal(result.supabaseOrigin, `https://${projectRef}.supabase.co`);
});

test("client fixture rejects branch, allow-list, origin, database and slug drift", () => {
  const mutations = [
    { GITHUB_REF: "refs/heads/main" },
    { ALLOWED_STAGING_SUPABASE_PROJECT_REFS: "other-project-ref000" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid" },
    {
      STOREFRONT_STAGING_DATABASE_URL:
        "postgresql://postgres:redacted@production.invalid/postgres?sslmode=require",
    },
    { STOREFRONT_CLIENT_FIXTURE_SHOP_SLUG: "another-shop" },
    { STOREFRONT_CLIENT_FIXTURE_ALLOW_STAGING: "no" },
  ];
  for (const mutation of mutations) {
    assert.throws(() => validateClientFixtureTarget({ ...valid, ...mutation }));
  }
});

test("client fixture resolves only its synthetic user through the guarded database", () => {
  assert.match(source, /select id from auth\.users where email=/);
  assert.match(source, /rows\.length !== 1 \|\| !UUID\.test\(rows\[0\]\)/);
  assert.doesNotMatch(source, /auth\.admin\.listUsers/);
  assert.match(source, /auth\.admin\.createUser/);
});

test("client fixture refresh is idempotent and never deletes the persistent shop", () => {
  assert.doesNotMatch(source, /delete from public\.shops/);
  assert.doesNotMatch(source, /delete from public\.audit_logs/);
  assert.match(source, /on conflict \(shop_id\) do update set/);
  assert.match(source, /on conflict \(id\) do update set/);
  assert.match(source, /on conflict \(image_publication_id,variant\) do update set/);
  assert.match(source, /client_fixture_seed_\$\{seedFailureCode\(error\)\}/);
});

test("client fixture generates decodable deterministic WebP variants", async () => {
  const assets = await buildClientFixtureAssets("https://example.invalid");
  assert.equal(assets.origin, "https://example.invalid");
  for (const [variant, size] of Object.entries({
    thumb: 320,
    card: 720,
    detail: 1200,
  })) {
    const asset = assets.variants[variant];
    assert.equal(asset.width, size);
    assert.equal(asset.height, size);
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    assert.ok(asset.bytes.length > 0);
  }
});
