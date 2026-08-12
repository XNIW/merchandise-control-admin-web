import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  ".github/workflows/task150-catalog-integrity-diagnostic.yml",
  "utf8",
);

test("TASK-150 catalog diagnostic is staging-only and read-only", () => {
  assert.match(workflow, /environment: cloudflare-staging/);
  assert.match(workflow, /ALLOWED_STAGING_SUPABASE_PROJECT_REFS/);
  assert.match(workflow, /exactMain: process\.env\.GITHUB_REF === "refs\/heads\/main"/);
  assert.match(workflow, /begin transaction read only;/);
  assert.match(workflow, /rollback;/);
  assert.doesNotMatch(workflow, /create\s+(?:temporary|temp)\s+table/i);
  assert.doesNotMatch(workflow, /resolve_pos_catalog_scope_v2/i);
  assert.match(workflow, /mapped_owner_id[\s\S]*?has_blocking_mapping/);
  assert.match(workflow, /has_shop_rows[\s\S]*?has_legacy_rows/);
  assert.match(workflow, /from resolved_target resolved[\s\S]*?resolved\.blocked is false/);
  assert.match(workflow, /select count\(\*\) from resolved_target\) = 1/);
  assert.doesNotMatch(workflow, /\b(?:delete|update|insert|truncate)\s+(?:from|into|public\.|app_private\.)/i);
  assert.doesNotMatch(workflow, /production/i);
});

test("TASK-150 catalog diagnostic accepts only a digest and emits no raw IDs", () => {
  assert.match(workflow, /shop_code_sha256:/);
  assert.match(workflow, /\^\[0-9a-f\]\{64\}\$/);
  assert.match(workflow, /exactSetSha256/);
  assert.match(workflow, /scopeBlocked: report\.scopeBlocked/);
  assert.match(workflow, /report\.scopeBlocked !== false/);
  assert.match(workflow, /project', '\[STAGING_REF\]'/);
  const selectLists = Array.from(
    workflow.matchAll(/\bselect\b([\s\S]*?)\bfrom\b/gi),
    (match) => match[1],
  );
  assert.ok(selectLists.length > 0);
  for (const selectList of selectLists) {
    assert.doesNotMatch(selectList, /\bshop_code\b/i);
  }
  assert.doesNotMatch(workflow, /jsonb_build_object\([^)]*\b(?:shopId|productId|supplierId|categoryId|priceId)\b/i);
});
