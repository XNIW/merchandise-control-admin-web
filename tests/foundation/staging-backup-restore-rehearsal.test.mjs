import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("staging rehearsal packages the Storage inventory from its actual backup directory", () => {
  const workflow = read(
    ".github/workflows/staging-backup-restore-rehearsal.yml",
  );
  const storageBackup = read("scripts/staging-backup-storage.mjs");

  assert.match(
    workflow,
    /STAGING_BACKUP_OUTPUT_DIR="\$PWD\/_backup\/storage"/,
  );
  assert.match(
    storageBackup,
    /path\.join\(backupRoot, "storage-object-inventory\.json"\)/,
  );
  assert.match(
    workflow,
    /migrations-schema\.sql migrations-data\.sql \\\s+storage \\\s+source-fingerprint\.json restored-fingerprint\.json/,
  );
  assert.doesNotMatch(
    workflow,
    /migrations-schema\.sql migrations-data\.sql \\\s+storage storage-object-inventory\.json/,
  );
});
