import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  ".github/workflows/task150-price-timestamp-normalization.yml",
  "utf8",
);

test("TASK-150 timestamp normalization is staging-only and exact-set guarded", () => {
  assert.match(workflow, /environment: cloudflare-staging/);
  assert.match(workflow, /exactCheckout:/);
  assert.match(workflow, /EXPECTED_INVALID_SET_SHA256/);
  assert.match(workflow, /task150_invalid_price_exact_set_changed/);
  assert.match(workflow, /expectedCount >= 1 && expectedCount <= 100/);
  assert.match(workflow, /NORMALIZE_TASK150_PRICE_TIMESTAMPS/);
  assert.doesNotMatch(workflow, /production/i);
});

test("TASK-150 timestamp normalization updates only proven rows", () => {
  assert.match(workflow, /update public\.inventory_product_prices row/);
  assert.match(workflow, /from task150_invalid_prices invalid/);
  assert.match(workflow, /row\.id=invalid\.id/);
  assert.match(workflow, /row\.effective_at=invalid\.old_effective_at/);
  assert.match(workflow, /row\.created_at=invalid\.old_created_at/);
  assert.match(workflow, /get diagnostics changed = row_count/);
  assert.match(workflow, /post_integrity <> 0/);
  assert.match(
    workflow,
    /disable trigger task088_mobile_price_append_only[\s\S]*disable trigger task088_mobile_sync_event[\s\S]*update public\.inventory_product_prices row[\s\S]*enable trigger task088_mobile_sync_event[\s\S]*enable trigger task088_mobile_price_append_only/,
  );
  assert.doesNotMatch(workflow, /\b(?:delete|truncate|drop\s+table\s+public\.)\b/i);
});

test("TASK-150 timestamp normalization limits the database secret to URL construction", () => {
  const jobEnv = workflow.match(/\n    env:\n([\s\S]*?)\n    steps:/)?.[1] || "";
  const buildUrlStep = workflow.match(
    /- name: Build protected database URL\n([\s\S]*?)\n      - name: Guard and normalize/,
  )?.[1] || "";

  assert.doesNotMatch(jobEnv, /SUPABASE_DB_PASSWORD/);
  assert.match(
    buildUrlStep,
    /env:\n\s+SUPABASE_DB_PASSWORD: \$\{\{ secrets\.SUPABASE_DB_PASSWORD \}\}/,
  );
});
