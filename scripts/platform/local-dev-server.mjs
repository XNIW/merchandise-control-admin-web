#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import {
  assertLocalTargetEnv,
  parseSupabaseStatusEnv,
} from "../testing/target-guardrails.mjs";

function fail(code, message) {
  console.error(`[platform-local-dev] FAIL ${code}: ${message}`);
  process.exit(2);
}

function loadLocalBrowserEnv() {
  let output = "";

  try {
    output = execFileSync("supabase", ["status", "--output", "env"], {
      encoding: "utf8",
      env: {
        ...process.env,
        DO_NOT_TRACK: "1",
        SUPABASE_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const text = [error.stdout?.toString() ?? "", error.stderr?.toString() ?? ""]
      .join("")
      .trim();
    fail(
      "BLOCKED_LOCAL_SUPABASE_REQUIRED",
      `Start Supabase locally first. ${text || "supabase status failed."}`,
    );
  }

  const values = parseSupabaseStatusEnv(output);
  const env = {
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      values.PUBLISHABLE_KEY || values.ANON_KEY || "",
    NEXT_PUBLIC_SUPABASE_URL: values.API_URL || "",
    TEST_TARGET: "local",
  };

  try {
    assertLocalTargetEnv(env);
  } catch (error) {
    fail(error.code ?? "BLOCKED_LOCAL_SUPABASE_URL_REQUIRED", error.message);
  }

  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    fail(
      "BLOCKED_LOCAL_PUBLISHABLE_KEY_REQUIRED",
      "Local Supabase publishable key is required for browser sign-in.",
    );
  }

  return env;
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
  const requestedPort = process.env.PLATFORM_LOCAL_DEV_PORT?.trim();

  if (requestedPort) {
    if (await isPortAvailable(requestedPort)) {
      return requestedPort;
    }

    fail(
      "BLOCKED_LOCAL_DEV_PORT_IN_USE",
      `Port ${requestedPort} is already in use. Stop the existing server or choose another PLATFORM_LOCAL_DEV_PORT.`,
    );
  }

  for (const candidate of ["3000", "3050", "3051", "3052"]) {
    if (await isPortAvailable(candidate)) {
      if (candidate !== "3000") {
        console.log(
          `[platform-local-dev] INFO port 3000 is busy; using http://127.0.0.1:${candidate}`,
        );
      }

      return candidate;
    }
  }

  fail(
    "BLOCKED_LOCAL_DEV_PORTS_IN_USE",
    "Ports 3000, 3050, 3051 and 3052 are already in use. Stop an existing dev server or set PLATFORM_LOCAL_DEV_PORT.",
  );
}

const localEnv = loadLocalBrowserEnv();
const port = await resolveAvailablePort();
const childEnv = { ...process.env, ...localEnv };
const bundler = process.env.PLATFORM_LOCAL_DEV_BUNDLER?.trim() || "webpack";
const bundlerFlag = bundler === "turbopack" || bundler === "turbo" ? "--turbopack" : "--webpack";

delete childEnv["SUPABASE_" + "SERVICE_ROLE_KEY"];

console.log("[platform-local-dev] PASS local Supabase browser env loaded");
console.log(`[platform-local-dev] URL http://127.0.0.1:${port}`);
console.log(`[platform-local-dev] bundler=${bundlerFlag.slice(2)}`);

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
