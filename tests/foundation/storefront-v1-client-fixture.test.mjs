import assert from "node:assert/strict";
import test from "node:test";

import { validateClientFixtureTarget } from "../../scripts/admin/storefront-v1-client-fixture.mjs";

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
