import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { reconcileMigrationDelta } from "./task-150-reconcile-migration-delta.mjs";

const migrationPattern = /^(\d{8}|\d{14})_(.+)\.sql$/;
const remap = {
  localVersion: "20260727055520",
  remoteVersion: "20260727084040",
  name: "task_142_catalog_text_policy_v1",
};

function parseLocalMigrations(directory) {
  const files = readdirSync(directory).filter((file) => file.endsWith(".sql"));
  const violations = files.filter((file) => !migrationPattern.test(file));
  const rows = files
    .map((file) => {
      const match = file.match(migrationPattern);
      return match
        ? { version: match[1], name: match[2], fileName: file }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.version.localeCompare(right.version));
  return { rows, violations };
}

function parseRemoteLedger(file) {
  return readFileSync(file, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const fields = line.split("\t");
      if (fields.length !== 2 || !fields[0] || !fields[1]) {
        throw new Error("remote_ledger_shape_invalid");
      }
      return { version: fields[0], name: fields[1] };
    });
}

function parseManifest(file, migrationDirectory) {
  const rows = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(rows) || rows.length !== 7) {
    throw new Error("wechat006_manifest_count_invalid");
  }
  const violations = [];
  for (const [index, row] of rows.entries()) {
    const expectedKeys = "file,name,sha256,version";
    if (
      !row ||
      typeof row !== "object" ||
      Object.keys(row).sort().join(",") !== expectedKeys ||
      !/^\d{14}$/.test(row.version ?? "") ||
      !/^[a-z0-9][a-z0-9_]*$/.test(row.name ?? "") ||
      row.file !== `${row.version}_${row.name}.sql` ||
      !/^[0-9a-f]{64}$/.test(row.sha256 ?? "") ||
      (index > 0 && rows[index - 1].version >= row.version)
    ) {
      violations.push({ index, reason: "shape_or_order" });
      continue;
    }
    const bytes = readFileSync(join(migrationDirectory, row.file));
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== row.sha256) {
      violations.push({ index, reason: "checksum" });
    }
  }
  return { rows, violations };
}

export function reconcileWechat006MigrationDelta({
  migrationDirectory,
  remoteLedgerPath,
  manifestPath,
  allowExpectedAlreadyApplied = false,
}) {
  const local = parseLocalMigrations(migrationDirectory);
  const remote = parseRemoteLedger(remoteLedgerPath);
  const manifest = parseManifest(manifestPath, migrationDirectory);
  const expected = manifest.rows.map(({ version, name, file }) => ({
    version,
    name,
    fileName: file,
  }));
  const result = reconcileMigrationDelta({
    local: local.rows,
    remote,
    expected,
    approvedRemoteRemaps: [remap],
    approvedRemoteOnly: [],
    localFilenameViolations: local.violations,
    allowExpectedAlreadyApplied,
  });
  return {
    ...result,
    status:
      result.status === "PASS" && manifest.violations.length === 0
        ? "PASS"
        : "FAIL",
    manifestViolations: manifest.violations,
    expected,
  };
}

function runCli() {
  const [migrationDirectory, remoteLedgerPath, manifestPath, outputPath] =
    process.argv.slice(2);
  if (
    !migrationDirectory ||
    !remoteLedgerPath ||
    !manifestPath ||
    !outputPath
  ) {
    throw new Error(
      "usage:migration-directory remote-ledger manifest output-report",
    );
  }
  const report = reconcileWechat006MigrationDelta({
    migrationDirectory,
    remoteLedgerPath,
    manifestPath,
    allowExpectedAlreadyApplied:
      process.env.ALLOW_EXPECTED_ALREADY_APPLIED === "true",
  });
  writeFileSync(
    outputPath,
    `${JSON.stringify({ workflowCommit: process.env.GITHUB_SHA ?? "", ...report }, null, 2)}\n`,
  );
  console.log(
    JSON.stringify({
      status: report.status,
      remoteMigrationCount: report.remoteMigrationCount,
      localMigrationCount: report.localMigrationCount,
      expectedState: report.expectedState,
      pending: report.pending,
    }),
  );
  if (report.status !== "PASS") process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli();
}
