#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { assertNoProductionProjectRef } from "../testing/target-guardrails.mjs";

const root = process.cwd();
const envFile = ".env.local";
const requiredEnvNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function fail(code, message) {
  console.error(`[platform-cloud-dev] FAIL ${code}: ${message}`);
  process.exit(2);
}

function parseEnvFile(relativePath) {
  const path = join(root, relativePath);

  if (!existsSync(path)) {
    fail("BLOCKED_CLOUD_ENV_FILE_REQUIRED", `${relativePath} is required.`);
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

    if (["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
      fail(
        "BLOCKED_LOCAL_SUPABASE_URL",
        "platform:cloud:dev must not run against local Supabase.",
      );
    }

    if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co")) {
      fail(
        "BLOCKED_CLOUD_SUPABASE_URL_REQUIRED",
        "platform:cloud:dev requires an https://*.supabase.co target.",
      );
    }

    return url.hostname.split(".")[0] ?? "";
  } catch {
    fail("BLOCKED_CLOUD_SUPABASE_URL_INVALID", "Supabase URL is invalid.");
  }
}

function redactRef(ref) {
  return ref ? `${ref.slice(0, 4)}...${ref.slice(-3)}` : "unknown";
}

function loadCloudEnv() {
  const env = parseEnvFile(envFile);
  const missing = requiredEnvNames.filter((name) => !env[name]?.trim());

  if (missing.length > 0) {
    fail(
      "BLOCKED_CLOUD_ENV_REQUIRED",
      `${envFile} is missing required runtime keys: ${missing.join(", ")}.`,
    );
  }

  const refFromUrl = cloudRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const configuredRef = env.SUPABASE_PROJECT_REF.trim();

  if (configuredRef !== refFromUrl) {
    fail(
      "BLOCKED_CLOUD_PROJECT_REF_MISMATCH",
      "SUPABASE_PROJECT_REF must match the Supabase URL project ref.",
    );
  }

  try {
    assertNoProductionProjectRef(env);
  } catch (error) {
    fail(error.code ?? "BLOCKED_PRODUCTION_PROJECT_REF_FORBIDDEN", error.message);
  }

  return {
    ...env,
    SUPABASE_ANON_KEY:
      env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    TEST_TARGET: "cloud",
  };
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(Number(port), "127.0.0.1");
  });
}

async function resolveAvailablePort() {
  const requestedPort = process.env.PLATFORM_CLOUD_DEV_PORT?.trim();

  if (requestedPort) {
    if (await isPortAvailable(requestedPort)) {
      return requestedPort;
    }

    fail(
      "BLOCKED_CLOUD_DEV_PORT_IN_USE",
      `Port ${requestedPort} is already in use.`,
    );
  }

  for (const candidate of ["3000", "3055", "3056", "3057"]) {
    if (await isPortAvailable(candidate)) {
      if (candidate !== "3000") {
        console.log(
          `[platform-cloud-dev] INFO port 3000 is busy; using http://127.0.0.1:${candidate}`,
        );
      }

      return candidate;
    }
  }

  fail(
    "BLOCKED_CLOUD_DEV_PORTS_IN_USE",
    "Ports 3000, 3055, 3056 and 3057 are already in use.",
  );
}

const cloudEnv = loadCloudEnv();
const port = await resolveAvailablePort();
const bundler = process.env.PLATFORM_CLOUD_DEV_BUNDLER?.trim() || "webpack";
const bundlerFlag =
  bundler === "turbopack" || bundler === "turbo" ? "--turbopack" : "--webpack";
const childEnv = { ...process.env, ...cloudEnv };

console.log("[platform-cloud-dev] PASS cloud Supabase runtime env loaded");
console.log(
  `[platform-cloud-dev] target_ref=${redactRef(cloudEnv.SUPABASE_PROJECT_REF)}`,
);
console.log(`[platform-cloud-dev] URL http://127.0.0.1:${port}`);
console.log(`[platform-cloud-dev] bundler=${bundlerFlag.slice(2)}`);

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  executable,
  ["next", "dev", bundlerFlag, "--hostname", "127.0.0.1", "--port", port],
  {
    env: childEnv,
    stdio: "inherit",
  },
);

process.exitCode = result.status ?? 1;
