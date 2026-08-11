import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const migrationPattern = /^(\d{8}|\d{14})_(.+)\.sql$/;

function duplicateVersions(rows) {
  const counts = new Map();
  for (const row of rows) {
    counts.set(row.version, (counts.get(row.version) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count !== 1)
    .map(([version, count]) => ({ version, count }));
}

function migrationRowsMatch(left, right) {
  return (
    left.length === right.length &&
    left.every(
      (row, index) =>
        row.version === right[index]?.version &&
        row.name === right[index]?.name,
    )
  );
}

export function reconcileMigrationDelta({
  local,
  remote,
  expected,
  approvedRemoteRemaps,
  approvedRemoteOnly = [],
  localFilenameViolations = [],
  allowExpectedAlreadyApplied = false,
}) {
  const localDuplicates = duplicateVersions(local);
  const remoteDuplicates = duplicateVersions(remote);
  const localByVersion = new Map(local.map((row) => [row.version, row]));
  const remapViolations = approvedRemoteRemaps.filter((remap) => {
    const localRow = localByVersion.get(remap.localVersion);
    const exactRemoteRows = remote.filter(
      (row) => row.version === remap.remoteVersion && row.name === remap.name,
    );
    const conflictingRemoteRows = remote.filter(
      (row) => row.version === remap.remoteVersion && row.name !== remap.name,
    );
    return (
      !localRow ||
      localRow.name !== remap.name ||
      exactRemoteRows.length !== 1 ||
      conflictingRemoteRows.length !== 0 ||
      remote.some((row) => row.version === remap.localVersion)
    );
  });
  const normalizedRemote = remote.map((row) => {
    const remap = approvedRemoteRemaps.find(
      (candidate) =>
        row.version === candidate.remoteVersion && row.name === candidate.name,
    );
    return remap ? { version: remap.localVersion, name: row.name } : row;
  });
  const remoteOnly = normalizedRemote.filter(
    (row) => !localByVersion.has(row.version),
  );
  const approvedRemoteOnlyShapeValid = Array.isArray(approvedRemoteOnly);
  const approvedRemoteOnlyRows = approvedRemoteOnlyShapeValid
    ? approvedRemoteOnly
    : [];
  const approvedRemoteOnlyViolations = approvedRemoteOnlyRows
    .map((row, index) => ({ row, index }))
    .filter(
      ({ row }) =>
        !row ||
        typeof row !== "object" ||
        !/^(\d{8}|\d{14})$/.test(row.version ?? "") ||
        !/^[a-z0-9][a-z0-9_]*$/.test(row.name ?? "") ||
        Object.keys(row).sort().join(",") !== "name,version",
    )
    .map(({ index }) => index);
  const approvedRemoteOnlyDuplicates = duplicateVersions(
    approvedRemoteOnlyRows.filter(
      (row) =>
        row && typeof row === "object" && typeof row.version === "string",
    ),
  );
  const approvedRemoteOnlyOrderValid =
    approvedRemoteOnlyViolations.length === 0 &&
    approvedRemoteOnlyRows.every(
      (row, index) =>
        index === 0 ||
        approvedRemoteOnlyRows[index - 1].version.localeCompare(row.version) <
          0,
    );
  const remoteOnlyMatchesApproved =
    approvedRemoteOnlyShapeValid &&
    approvedRemoteOnlyViolations.length === 0 &&
    approvedRemoteOnlyDuplicates.length === 0 &&
    approvedRemoteOnlyOrderValid &&
    migrationRowsMatch(remoteOnly, approvedRemoteOnlyRows);
  const nameMismatches = normalizedRemote.filter((row) => {
    const match = localByVersion.get(row.version);
    return match && match.name !== row.name;
  });
  const remoteVersions = new Set(normalizedRemote.map((row) => row.version));
  const pending = local.filter((row) => !remoteVersions.has(row.version));
  const expectedPending =
    JSON.stringify(pending) === JSON.stringify(expected);
  const expectedRowsApplied = expected.every((expectedRow) =>
      normalizedRemote.some(
        (remoteRow) =>
          remoteRow.version === expectedRow.version &&
          remoteRow.name === expectedRow.name,
      ),
    );
  const latestExpectedVersion = expected.at(-1)?.version ?? "";
  const pendingRowsAreFuture =
    expected.length > 0 &&
    pending.every((row) => row.version.localeCompare(latestExpectedVersion) > 0);
  const expectedAlreadyApplied = expectedRowsApplied && pendingRowsAreFuture;
  const expectedState = expectedPending
    ? "pending"
    : expectedAlreadyApplied
      ? "applied"
      : "invalid";
  const status =
    localFilenameViolations.length === 0 &&
    localDuplicates.length === 0 &&
    remoteDuplicates.length === 0 &&
    remapViolations.length === 0 &&
    remoteOnlyMatchesApproved &&
    nameMismatches.length === 0 &&
    (expectedPending ||
      (allowExpectedAlreadyApplied && expectedAlreadyApplied))
      ? "PASS"
      : "FAIL";
  return {
    status,
    localMigrationCount: local.length,
    remoteMigrationCount: remote.length,
    approvedRemoteRemaps,
    localFilenameViolations,
    localDuplicates,
    remoteDuplicates,
    remapViolations,
    approvedRemoteOnly: approvedRemoteOnlyRows,
    approvedRemoteOnlyShapeValid,
    approvedRemoteOnlyViolations,
    approvedRemoteOnlyDuplicates,
    approvedRemoteOnlyOrderValid,
    remoteOnlyMatchesApproved,
    remoteOnly,
    nameMismatches,
    pending,
    pendingRowsAreFuture,
    expectedState,
    expectedPending,
    expectedAlreadyApplied,
    allowExpectedAlreadyApplied,
  };
}

function requiredEnvironment(name, environment = process.env) {
  const value = environment[name] ?? "";
  if (!value) throw new Error(`missing_environment:${name}`);
  return value;
}

export function expectedMigrationsFromEnvironment(environment = process.env) {
  const expectedHead = {
    version: requiredEnvironment("EXPECTED_MIGRATION_VERSION", environment),
    name: requiredEnvironment("EXPECTED_MIGRATION_NAME", environment),
    fileName: requiredEnvironment("EXPECTED_MIGRATION_FILE", environment),
  };
  const predecessorValues = [
    environment.EXPECTED_PREDECESSOR_MIGRATION_VERSION ?? "",
    environment.EXPECTED_PREDECESSOR_MIGRATION_NAME ?? "",
    environment.EXPECTED_PREDECESSOR_MIGRATION_FILE ?? "",
  ];
  const hasPredecessor = predecessorValues.every(Boolean);
  if (!hasPredecessor && predecessorValues.some(Boolean)) {
    throw new Error("incomplete_expected_predecessor");
  }
  const expected = hasPredecessor
    ? [
        {
          version: predecessorValues[0],
          name: predecessorValues[1],
          fileName: predecessorValues[2],
        },
        expectedHead,
      ]
    : [expectedHead];
  if (
    expected.some(
      (row, index) =>
        index > 0 &&
        expected[index - 1].version.localeCompare(row.version) >= 0,
    )
  ) {
    throw new Error("expected_migrations_not_strictly_ordered");
  }
  return expected;
}

function runCli() {
  const [
    migrationDirectory,
    remoteLedgerPath,
    outputPath,
    approvedRemoteOnlyPath,
  ] = process.argv.slice(2);
  if (!migrationDirectory || !remoteLedgerPath || !outputPath) {
    throw new Error(
      "usage:migration-directory remote-ledger output [approved-remote-only-json]",
    );
  }
  const migrationFiles = readdirSync(migrationDirectory).filter((fileName) =>
    fileName.toLowerCase().endsWith(".sql"),
  );
  const localFilenameViolations = migrationFiles.filter(
    (fileName) => !migrationPattern.test(fileName),
  );
  const local = migrationFiles
    .map((fileName) => {
      const match = fileName.match(migrationPattern);
      return match ? { version: match[1], name: match[2], fileName } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.version.localeCompare(right.version));
  const remote = readFileSync(remoteLedgerPath, "utf8")
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
  const expected = expectedMigrationsFromEnvironment();
  const approvedRemoteRemaps = [
    {
      localVersion: requiredEnvironment("REMAPPED_LOCAL_MIGRATION_VERSION"),
      remoteVersion: requiredEnvironment("REMAPPED_REMOTE_MIGRATION_VERSION"),
      name: requiredEnvironment("REMAPPED_MIGRATION_NAME"),
    },
  ];
  const approvedRemoteOnly = approvedRemoteOnlyPath
    ? JSON.parse(readFileSync(approvedRemoteOnlyPath, "utf8"))
    : [];
  const result = reconcileMigrationDelta({
    local,
    remote,
    expected,
    approvedRemoteRemaps,
    approvedRemoteOnly,
    localFilenameViolations,
    allowExpectedAlreadyApplied:
      process.env.ALLOW_EXPECTED_ALREADY_APPLIED === "true",
  });
  const report = { workflowCommit: process.env.GITHUB_SHA ?? "", ...result };
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify({
      status: report.status,
      remoteMigrationCount: report.remoteMigrationCount,
      localMigrationCount: report.localMigrationCount,
      pending: report.pending,
      expectedState: report.expectedState,
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
