import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(
  readFileSync("scripts/wechat-006-staging-migrations.json", "utf8"),
);
const workflow = readFileSync(
  ".github/workflows/wechat-006-shared-staging-migrations.yml",
  "utf8",
);

test("WECHAT-006 staging migration manifest is exact and checksum-pinned", () => {
  assert.equal(manifest.length, 7);
  assert.deepEqual(
    manifest.map((row) => row.version),
    [
      "20260813002817",
      "20260813022833",
      "20260813035221",
      "20260813043000",
      "20260813044500",
      "20260813160232",
      "20260813160233",
    ],
  );
  for (const row of manifest) {
    assert.equal(row.file, `${row.version}_${row.name}.sql`);
    const actual = createHash("sha256")
      .update(readFileSync(`supabase/migrations/${row.file}`))
      .digest("hex");
    assert.equal(actual, row.sha256);
  }
});

test("WECHAT-006 workflow is exact-target, dry-run-first, and fail-closed", () => {
  for (const token of [
    "jpgoimipbothfgkokyvm",
    "refs/heads/main",
    "APPLY_WECHAT006_SHARED_STAGING",
    "supabase@2.113.0",
    "--dry-run",
    "pre-operation-ledger.tsv",
    "pre-apply-ledger.tsv",
    "post-apply-ledger.tsv",
    "wechat-006-reconcile-migration-delta.mjs",
    "ALLOW_EXPECTED_ALREADY_APPLIED=true",
    "Run WECHAT pgTAP against shared staging",
    "Run remote database lint",
    "if: always()",
  ]) {
    assert.match(
      workflow,
      new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
  assert.doesNotMatch(workflow, /upload-artifact|SUPABASE_SERVICE_ROLE_KEY/);
});
