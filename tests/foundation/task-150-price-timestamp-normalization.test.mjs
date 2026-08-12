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
  assert.doesNotMatch(workflow, /\b(?:delete|truncate|drop\s+table\s+public\.)\b/i);
});
