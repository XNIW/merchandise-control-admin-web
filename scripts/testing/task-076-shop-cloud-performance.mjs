#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertNoProductionProjectRef,
  assertTargetEnv,
  isStagingSupabaseUrl,
} from "./target-guardrails.mjs";

const root = process.cwd();
const envFile = ".env.local";
const defaultBaseUrl =
  "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev";
const requiredEnvNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function fail(code, message) {
  console.error(`[task-076-cloud-performance] FAIL ${code}: ${message}`);
  process.exit(2);
}

function parseEnvFile(relativePath) {
  const path = join(root, relativePath);

  if (!existsSync(path)) {
    fail("BLOCKED_TASK076_ENV_FILE_REQUIRED", `${relativePath} is required.`);
  }

  const values = {};

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function cloudRefFromUrl(value) {
  try {
    const url = new URL(value);

    if (!isStagingSupabaseUrl(value)) {
      fail(
        "BLOCKED_TASK076_CLOUD_SUPABASE_URL_REQUIRED",
        "TASK-076 cloud performance requires an https://*.supabase.co Supabase target.",
      );
    }

    return url.hostname.split(".")[0] ?? "";
  } catch {
    fail("BLOCKED_TASK076_CLOUD_SUPABASE_URL_INVALID", "Supabase URL is invalid.");
  }
}

function assertStagingBaseUrl(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    fail("BLOCKED_TASK076_BASE_URL_INVALID", "PLAYWRIGHT_BASE_URL must be a valid URL.");
  }

  if (
    url.protocol !== "https:" ||
    ["127.0.0.1", "localhost", "::1"].includes(url.hostname)
  ) {
    fail(
      "BLOCKED_TASK076_BASE_URL_REQUIRED",
      "TASK-076 cloud performance requires an https non-local Admin Web URL.",
    );
  }

  if (/prod|production/i.test(url.hostname)) {
    fail(
      "BLOCKED_TASK076_PRODUCTION_URL_FORBIDDEN",
      "PLAYWRIGHT_BASE_URL hostname looks production-like.",
    );
  }

  if (!/(staging|dev|preview|workers\.dev|vercel\.app)/i.test(url.hostname)) {
    fail(
      "BLOCKED_TASK076_NON_PRODUCTION_URL_UNCLEAR",
      "Use a staging/dev/preview Admin Web URL for TASK-076 cloud performance.",
    );
  }
}

function redactRef(ref) {
  return ref ? `${ref.slice(0, 4)}...${ref.slice(-3)}` : "unknown";
}

const fileEnv = parseEnvFile(envFile);
const env = {
  ...fileEnv,
  ...process.env,
  PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL || defaultBaseUrl,
  TEST_TARGET: "staging",
};
env.SUPABASE_ANON_KEY =
  env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
env.TASK076_PERF_PHASE = env.TASK076_PERF_PHASE || "manual";

const missing = requiredEnvNames.filter((name) => !env[name]?.trim());
if (missing.length > 0) {
  fail(
    "BLOCKED_TASK076_ENV_REQUIRED",
    `${envFile} or process env is missing required keys: ${missing.join(", ")}.`,
  );
}

const refFromUrl = cloudRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL);
if (env.SUPABASE_PROJECT_REF.trim() !== refFromUrl) {
  fail(
    "BLOCKED_TASK076_PROJECT_REF_MISMATCH",
    "SUPABASE_PROJECT_REF must match the Supabase URL project ref.",
  );
}

if (env.CONFIRM_TASK076_CLOUD_PERFORMANCE !== "yes") {
  fail(
    "BLOCKED_TASK076_CONFIRMATION_REQUIRED",
    "Set CONFIRM_TASK076_CLOUD_PERFORMANCE=yes before mutating staging with TASK076_* synthetic data.",
  );
}

assertStagingBaseUrl(env.PLAYWRIGHT_BASE_URL);

try {
  assertNoProductionProjectRef(env);
  assertTargetEnv("staging", env, { requireConfirmation: true });
} catch (error) {
  fail(error.code ?? "BLOCKED_TASK076_TARGET_GUARDRAIL", error.message);
}

const extraArgs = process.argv.slice(2);
const hasProjectArg = extraArgs.some((arg) => arg === "--project" || arg.startsWith("--project="));
const playwrightArgs = [
  "staging",
  "tests/e2e/staging/task-076-shop-admin-cloud-performance.spec.ts",
  ...(hasProjectArg ? [] : ["--project=chromium-desktop"]),
  ...extraArgs,
];

console.log("[task-076-cloud-performance] PASS staging guardrails passed");
console.log(
  `[task-076-cloud-performance] target_ref=${redactRef(env.SUPABASE_PROJECT_REF)}`,
);
console.log(`[task-076-cloud-performance] phase=${env.TASK076_PERF_PHASE}`);

const result = spawnSync(
  process.execPath,
  ["scripts/testing/run-playwright-target.mjs", ...playwrightArgs],
  {
    env,
    stdio: "inherit",
  },
);

process.exitCode = result.status ?? 1;
