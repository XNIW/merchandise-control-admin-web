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
  assert.doesNotMatch(workflow, /resolve_pos_catalog_scope_v2\s*\(/i);
  assert.doesNotMatch(workflow, /for\s+(?:share|update)/i);
  assert.match(workflow, /from target scope[\s\S]*?scope\.blocked is false/);
  assert.match(workflow, /select count\(\*\) from target\) = 1/);
  assert.match(workflow, /from diagnostic_target/);
  assert.doesNotMatch(workflow, /\b(?:delete|update|insert|truncate)\s+(?:from|into|public\.|app_private\.)/i);
  assert.doesNotMatch(workflow, /production/i);
});

test("TASK-150 catalog diagnostic accepts only a digest and emits no raw IDs", () => {
  assert.match(workflow, /shop_code_sha256:/);
  assert.match(workflow, /\^\[0-9a-f\]\{64\}\$/);
  assert.match(workflow, /exactSetSha256/);
  assert.match(workflow, /priceFailureCounts/);
  assert.match(workflow, /recoveryRowDoesNotFit/);
  assert.match(workflow, /priceTimestampShapes/);
  assert.match(workflow, /effectiveIsoUtc/);
  assert.match(workflow, /project', '\[STAGING_REF\]'/);
  assert.match(workflow, /convert_to\(shop\.shop_code, 'UTF8'\)/);
  assert.equal(workflow.match(/\bshop\.shop_code\b/g)?.length, 1);
  assert.doesNotMatch(workflow, /jsonb_build_object\([^)]*\b(?:shopId|productId|supplierId|categoryId|priceId)\b/i);
});
