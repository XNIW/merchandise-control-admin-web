#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const MIN_VERSION = "2.107.0";
const TESTED_VERSION = "2.107.0";
const RECOMMENDED_VERSION = "2.108.0";

function parseVersion(value) {
  const match = String(value ?? "").trim().match(/(\d+)\.(\d+)\.(\d+)/);

  if (!match) {
    return null;
  }

  return match.slice(1).map((part) => Number(part));
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);

  if (!a || !b) {
    return 0;
  }

  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) {
      return a[index] - b[index];
    }
  }

  return 0;
}

function run(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function print(status, message) {
  console.log(`[supabase-tooling] ${status} ${message}`);
}

const versionResult = run("supabase", ["--version"]);

if (versionResult.error?.code === "ENOENT") {
  print("FAIL", "Supabase CLI not found. Install with: brew install supabase/tap/supabase");
  process.exit(1);
}

if (versionResult.status !== 0) {
  print("FAIL", "Supabase CLI version check failed.");
  process.exit(versionResult.status ?? 1);
}

const version = versionResult.stdout.trim();
const belowMin = compareVersions(version, MIN_VERSION) < 0;
const belowRecommended = compareVersions(version, RECOMMENDED_VERSION) < 0;

if (belowMin) {
  print(
    "FAIL",
    `Supabase CLI ${version} is below minimum ${MIN_VERSION}. Update with: brew upgrade supabase`,
  );
  process.exit(1);
}

print(
  "PASS",
  `Supabase CLI ${version}; tested ${TESTED_VERSION}; recommended ${RECOMMENDED_VERSION}`,
);

if (belowRecommended) {
  print("WARN", "Patch update available; not a repo blocker when linked migrations pass.");
  print("INFO", "Homebrew update command: brew upgrade supabase");
}

if (process.argv.includes("--linked")) {
  const migrationResult = run("supabase", ["migration", "list", "--linked"]);

  if (migrationResult.status !== 0) {
    print("FAIL", "supabase migration list --linked failed.");
    if (migrationResult.stderr.trim()) {
      console.error(migrationResult.stderr.trim());
    }
    process.exit(migrationResult.status ?? 1);
  }

  print("PASS", "supabase migration list --linked completed.");
}
