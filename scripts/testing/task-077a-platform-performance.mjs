#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertNoProductionProjectRef,
  assertTargetEnv,
  isStagingSupabaseUrl,
} from "./target-guardrails.mjs";

const root = process.cwd();
const envFile = ".env.local";
const evidenceDir = "docs/TASKS/EVIDENCE/TASK-077A";
const defaultLocalBaseUrl = "http://127.0.0.1:3078";
const defaultStagingBaseUrl =
  "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev";
const requiredEnvNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const routeKeys = new Set([
  "overview",
  "users",
  "shopAdmins",
  "admins",
  "shops",
  "operations",
  "audit",
  "system",
]);

function fail(code, message) {
  console.error(`[task-077a-platform-performance] FAIL ${code}: ${message}`);
  process.exit(2);
}

function parseEnvFile(relativePath) {
  const path = join(root, relativePath);

  if (!existsSync(path)) {
    fail("BLOCKED_TASK077A_ENV_FILE_REQUIRED", `${relativePath} is required.`);
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
        "BLOCKED_TASK077A_CLOUD_SUPABASE_URL_REQUIRED",
        "TASK-077A requires an https://*.supabase.co Supabase target.",
      );
    }

    return url.hostname.split(".")[0] ?? "";
  } catch {
    fail("BLOCKED_TASK077A_CLOUD_SUPABASE_URL_INVALID", "Supabase URL is invalid.");
  }
}

function assertBaseUrl(value, appTarget) {
  let url;

  try {
    url = new URL(value);
  } catch {
    fail(
      "BLOCKED_TASK077A_BASE_URL_INVALID",
      "PLAYWRIGHT_BASE_URL must be a valid URL.",
    );
  }

  if (appTarget === "local-cloud") {
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "::1"].includes(url.hostname)
    ) {
      fail(
        "BLOCKED_TASK077A_LOCAL_APP_URL_REQUIRED",
        "TASK077A_APP_TARGET=local-cloud requires a local http PLAYWRIGHT_BASE_URL.",
      );
    }

    return;
  }

  if (
    url.protocol !== "https:" ||
    ["127.0.0.1", "localhost", "::1"].includes(url.hostname)
  ) {
    fail(
      "BLOCKED_TASK077A_STAGING_APP_URL_REQUIRED",
      "TASK077A_APP_TARGET=staging requires an https non-local Admin Web URL.",
    );
  }

  if (/prod|production/i.test(url.hostname)) {
    fail(
      "BLOCKED_TASK077A_PRODUCTION_URL_FORBIDDEN",
      "PLAYWRIGHT_BASE_URL hostname looks production-like.",
    );
  }

  if (!/(staging|dev|preview|workers\.dev|vercel\.app)/i.test(url.hostname)) {
    fail(
      "BLOCKED_TASK077A_NON_PRODUCTION_URL_UNCLEAR",
      "Use a staging/dev/preview Admin Web URL for TASK-077A.",
    );
  }
}

function redactRef(ref) {
  return ref ? `${ref.slice(0, 4)}...${ref.slice(-3)}` : "unknown";
}

function reportPathForPhase(phase) {
  return join(evidenceDir, `task-077a-platform-performance-${phase}.json`);
}

function queryCount(trace) {
  return Object.values(trace.queries ?? {}).reduce(
    (total, value) => total + Number(value ?? 0),
    0,
  );
}

function numericMeta(trace, key) {
  const value = trace.meta?.[key];

  return typeof value === "number" ? value : null;
}

function summarizeRouteTrace(traces) {
  if (traces.length === 0) {
    return {
      status: "not_captured",
    };
  }

  const latest = traces[traces.length - 1];
  const labels = new Set();
  const readModels = new Set();
  const scopes = new Set();

  for (const trace of traces) {
    scopes.add(trace.scope);

    for (const label of Object.keys(trace.queries ?? {})) {
      labels.add(label);
    }

    if (typeof trace.meta?.readModel === "string") {
      readModels.add(trace.meta.readModel);
    }
  }

  return {
    latestQueryCount: queryCount(latest),
    latestTotalMs: latest.totalMs,
    pagePayloadBytesMax: Math.max(
      0,
      ...traces
        .map((trace) => numericMeta(trace, "pagePayloadBytes"))
        .filter((value) => value !== null),
    ),
    queryCountPerRenderMax: Math.max(...traces.map(queryCount)),
    queryLabels: Array.from(labels).sort(),
    readModelsLoaded: Array.from(readModels).sort(),
    renderCount: traces.length,
    scopeLabels: Array.from(scopes).sort(),
    sectionBytesMax: Math.max(
      0,
      ...traces
        .map((trace) => numericMeta(trace, "sectionBytes"))
        .filter((value) => value !== null),
    ),
    serverTotalMsMax: Math.max(...traces.map((trace) => trace.totalMs ?? 0)),
    status: "captured",
  };
}

function sanitizeTrace(trace) {
  return {
    marks: Array.isArray(trace.marks) ? trace.marks : [],
    meta: trace.meta ?? {},
    queries: trace.queries ?? {},
    queryCount: queryCount(trace),
    scope: trace.scope,
    timings: Array.isArray(trace.timings) ? trace.timings : [],
    totalMs: trace.totalMs,
  };
}

function augmentReport(reportPath, rawTraces, appTarget) {
  if (!existsSync(reportPath)) {
    return;
  }

  const parsed = JSON.parse(readFileSync(reportPath, "utf8"));
  const serverPerfTraces = rawTraces.map(sanitizeTrace);
  const tracesByRoute = new Map();

  for (const trace of serverPerfTraces) {
    const routeKey = trace.meta?.routeKey;

    if (typeof routeKey !== "string" || !routeKeys.has(routeKey)) {
      continue;
    }

    const traces = tracesByRoute.get(routeKey) ?? [];
    traces.push(trace);
    tracesByRoute.set(routeKey, traces);
  }

  const payload = {
    ...parsed,
    measurements: (parsed.measurements ?? []).map((measurement) => ({
      ...measurement,
      serverTraceSummary: summarizeRouteTrace(
        tracesByRoute.get(measurement.key) ?? [],
      ),
    })),
    serverPerfTraces,
    serverTraceCapture: {
      appTarget,
      status: appTarget === "local-cloud" ? "captured" : "remote_not_captured",
      tracesCount: serverPerfTraces.length,
    },
  };

  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(`${reportPath}.tmp`, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function splitLines(buffer, chunk, onLine) {
  const text = buffer + chunk.toString("utf8");
  const lines = text.split(/\r?\n/);
  const nextBuffer = lines.pop() ?? "";

  for (const line of lines) {
    onLine(line);
  }

  return nextBuffer;
}

function parsePerfLine(line, traces) {
  const marker = "[admin-web-perf]";
  const index = line.indexOf(marker);

  if (index === -1) {
    return false;
  }

  const jsonText = line.slice(index + marker.length).trim();

  try {
    traces.push(JSON.parse(jsonText));
  } catch {
    traces.push({
      meta: { parseError: true },
      queries: {},
      scope: "parse_error",
      timings: [],
      totalMs: 0,
    });
  }

  return true;
}

async function sleep(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      fail(
        "BLOCKED_TASK077A_DEV_SERVER_EXITED",
        "Next dev server exited before becoming ready.",
      );
    }

    try {
      const response = await fetch(baseUrl, { redirect: "manual" });

      if (response.status > 0) {
        await response.body?.cancel();
        return;
      }
    } catch {
      await sleep(500);
    }
  }

  fail("BLOCKED_TASK077A_DEV_SERVER_TIMEOUT", "Next dev server did not become ready.");
}

async function runBuild(env) {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(command, ["run", "build"], {
    env,
    stdio: "inherit",
  });

  const exitCode = await new Promise((resolve) => {
    child.on("exit", (code) => {
      resolve(code ?? 1);
    });
  });

  if (exitCode !== 0) {
    fail("BLOCKED_TASK077A_BUILD_FAILED", "next build failed before benchmark.");
  }
}

function startLocalServer(env, traces) {
  const baseUrl = new URL(env.PLAYWRIGHT_BASE_URL);
  const port = baseUrl.port || "3078";
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const serverMode = env.TASK077A_LOCAL_SERVER || "start";
  const serverArgs =
    serverMode === "dev"
      ? ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", port]
      : ["run", "start", "--", "--hostname", "127.0.0.1", "--port", port];
  const child = spawn(
    command,
    serverArgs,
    {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdoutBuffer = "";
  let stderrBuffer = "";
  const handleLine = (line) => {
    if (parsePerfLine(line, traces)) {
      return;
    }

    if (/ready|started server|local:/i.test(line)) {
      console.log(`[task-077a-platform-performance] server ${line}`);
    } else if (/error|exception|failed|TypeError|ReferenceError/i.test(line)) {
      console.error(`[task-077a-platform-performance] server ${line}`);
    }
  };

  child.stdout.on("data", (chunk) => {
    stdoutBuffer = splitLines(stdoutBuffer, chunk, handleLine);
  });
  child.stderr.on("data", (chunk) => {
    stderrBuffer = splitLines(stderrBuffer, chunk, handleLine);
  });

  return child;
}

async function runPlaywright(env, extraArgs) {
  const args = [
    "playwright",
    "test",
    "tests/e2e/staging/task-077a-platform-master-console-performance.spec.ts",
    "--project=chromium-desktop",
    ...extraArgs,
  ];
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const child = spawn(command, args, {
    env,
    stdio: "inherit",
  });

  return await new Promise((resolve) => {
    child.on("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}

async function stopDevServer(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.on("exit", resolve)),
    sleep(5_000),
  ]);

  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

const fileEnv = parseEnvFile(envFile);
const appTarget = process.env.TASK077A_APP_TARGET || "local-cloud";
const env = {
  ...fileEnv,
  ...process.env,
  ADMIN_WEB_PERF_DEBUG: "1",
  PLAYWRIGHT_BASE_URL:
    process.env.PLAYWRIGHT_BASE_URL ||
    (appTarget === "local-cloud" ? defaultLocalBaseUrl : defaultStagingBaseUrl),
  TASK077A_PERF_PHASE:
    process.env.TASK077A_PERF_PHASE ||
    (appTarget === "local-cloud" ? "local-cloud-before" : "staging-before"),
  TEST_TARGET: "staging",
};
env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
env.SUPABASE_ANON_KEY =
  env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
env.ALLOWED_STAGING_SUPABASE_PROJECT_REFS =
  env.ALLOWED_STAGING_SUPABASE_PROJECT_REFS || env.SUPABASE_PROJECT_REF;

const missing = requiredEnvNames.filter((name) => !env[name]?.trim());
if (missing.length > 0) {
  fail(
    "BLOCKED_TASK077A_ENV_REQUIRED",
    `${envFile} or process env is missing required keys: ${missing.join(", ")}.`,
  );
}

if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()) {
  fail(
    "BLOCKED_TASK077A_PUBLISHABLE_KEY_REQUIRED",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY is required.",
  );
}

const refFromUrl = cloudRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL);
if (env.SUPABASE_PROJECT_REF.trim() !== refFromUrl) {
  fail(
    "BLOCKED_TASK077A_PROJECT_REF_MISMATCH",
    "SUPABASE_PROJECT_REF must match the Supabase URL project ref.",
  );
}

assertBaseUrl(env.PLAYWRIGHT_BASE_URL, appTarget);

try {
  assertNoProductionProjectRef(env);
  assertTargetEnv("staging", env, { requireConfirmation: true });
} catch (error) {
  fail(error.code ?? "BLOCKED_TASK077A_TARGET_GUARDRAIL", error.message);
}

if (env.CONFIRM_TASK077A_PLATFORM_READONLY !== "yes") {
  fail(
    "BLOCKED_TASK077A_PLATFORM_CONFIRMATION_REQUIRED",
    "Set CONFIRM_TASK077A_PLATFORM_READONLY=yes before generating a read-only Platform Admin auth session.",
  );
}

const extraArgs = process.argv.slice(2);
const reportPath = reportPathForPhase(env.TASK077A_PERF_PHASE);
const traces = [];
let devServer = null;
let exitCode = 1;

console.log("[task-077a-platform-performance] PASS cloud guardrails passed");
console.log(
  `[task-077a-platform-performance] target_ref=${redactRef(env.SUPABASE_PROJECT_REF)}`,
);
console.log(`[task-077a-platform-performance] app_target=${appTarget}`);
console.log(`[task-077a-platform-performance] phase=${env.TASK077A_PERF_PHASE}`);

try {
  if (appTarget === "local-cloud") {
    if ((env.TASK077A_LOCAL_SERVER || "start") === "start") {
      await runBuild(env);
    }

    devServer = startLocalServer(env, traces);
    await waitForServer(env.PLAYWRIGHT_BASE_URL, devServer);
    env.PLAYWRIGHT_DISABLE_WEB_SERVER = "1";
  } else {
    env.PLAYWRIGHT_DISABLE_WEB_SERVER = "1";
  }

  exitCode = await runPlaywright(env, extraArgs);
} finally {
  await stopDevServer(devServer);
  augmentReport(reportPath, traces, appTarget);
}

if (exitCode !== 0) {
  fail("BLOCKED_TASK077A_PLATFORM_PERFORMANCE", "platform performance failed.");
}

console.log(`[task-077a-platform-performance] report=${reportPath}`);
