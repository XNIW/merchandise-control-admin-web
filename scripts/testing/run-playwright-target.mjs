#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import {
  assertTargetEnv,
  parseSupabaseStatusEnv,
  readLinkedProjectRef,
} from "./target-guardrails.mjs";

const [target, ...playwrightArgs] = process.argv.slice(2);

function fail(message) {
  console.error(`[test-target] FAIL ${message}`);
  process.exit(2);
}

function loadLocalSupabaseEnv(env) {
  let output = "";

  try {
    output = execFileSync("supabase", ["status", "--output", "env"], {
      encoding: "utf8",
      env: {
        ...process.env,
        SUPABASE_TELEMETRY_DISABLED: "1",
        DO_NOT_TRACK: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    output = [
      error.stdout?.toString() ?? "",
      error.stderr?.toString() ?? "",
    ].join("");
    fail("supabase status --output env failed; start local Supabase first.");
  }

  const values = parseSupabaseStatusEnv(output);
  const supabaseUrl = values.API_URL;
  const publishableKey = values.PUBLISHABLE_KEY || values.ANON_KEY;
  const serviceRoleKey = values.SERVICE_ROLE_KEY;

  return {
    ...env,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: values.ANON_KEY || publishableKey,
    SUPABASE_PROJECT_REF: values.PROJECT_REF || readLinkedProjectRef() || "local",
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  };
}

function reloadLocalPostgrestSchema() {
  try {
    execFileSync(
      "supabase",
      ["db", "query", "notify pgrst, 'reload schema';", "--local"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          SUPABASE_TELEMETRY_DISABLED: "1",
          DO_NOT_TRACK: "1",
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
  } catch (error) {
    const stderr = error.stderr?.toString().trim();
    fail(
      [
        "local PostgREST schema cache reload failed; restart or repair local Supabase before browser E2E.",
        stderr,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
}

function portFromUrl(value) {
  try {
    return new URL(value).port || "80";
  } catch {
    return "3050";
  }
}

if (!target || playwrightArgs.length === 0) {
  fail("Usage: node scripts/testing/run-playwright-target.mjs local|staging <playwright args...>");
}

let env = {
  ...process.env,
  TEST_TARGET: target,
};

if (target === "local") {
  env = loadLocalSupabaseEnv(env);
  reloadLocalPostgrestSchema();
  env.CONFIRM_TASK043_PLATFORM_RUNTIME_TEST ??= "yes";
  env.CONFIRM_TASK044_PLATFORM_RUNTIME_TEST ??= "yes";
  env.CONFIRM_TASK045_PLATFORM_FINAL_REVIEW_TEST ??= "yes";
  env.CONFIRM_TASK056_PLATFORM_PROFILE_E2E ??= "yes";
  env.CONFIRM_TASK064_PLATFORM_USERS_TEST ??= "yes";
  env.PLAYWRIGHT_BASE_URL ??= "http://127.0.0.1:3050";
  env.PLAYWRIGHT_REUSE_SERVER ??= "0";
  env.PLAYWRIGHT_WEB_SERVER_COMMAND ??=
    `npm run dev -- --hostname 127.0.0.1 --port ${portFromUrl(env.PLAYWRIGHT_BASE_URL)}`;
} else if (target === "staging") {
  env.PLAYWRIGHT_DISABLE_WEB_SERVER = "1";

  if (!env.PLAYWRIGHT_BASE_URL) {
    fail("Set PLAYWRIGHT_BASE_URL to the non-production staging Admin Web URL.");
  }

  try {
    const appUrl = new URL(env.PLAYWRIGHT_BASE_URL);

    if (appUrl.protocol !== "https:" || ["127.0.0.1", "localhost", "::1"].includes(appUrl.hostname)) {
      fail("Staging E2E requires an https non-local PLAYWRIGHT_BASE_URL.");
    }
  } catch {
    fail("PLAYWRIGHT_BASE_URL must be a valid staging URL.");
  }
} else {
  fail("TEST_TARGET must be local or staging.");
}

try {
  assertTargetEnv(target, env, { requireConfirmation: target === "staging" });
} catch (error) {
  fail(error.message);
}

console.log(`[test-target] PASS TEST_TARGET=${target}`);
console.log(`[test-target] PASS Supabase target guardrails passed`);

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(executable, ["playwright", "test", ...playwrightArgs], {
  env,
  stdio: "inherit",
});

process.exitCode = result.status ?? 1;
