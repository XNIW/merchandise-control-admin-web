#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertNoProductionProjectRef,
  assertTargetEnv,
  isStagingSupabaseUrl,
} from "./target-guardrails.mjs";

const root = process.cwd();
const envFile = ".env.local";
const evidenceDir = "docs/TASKS/EVIDENCE/TASK-077";
const task077bEvidenceDir = "docs/TASKS/EVIDENCE/TASK-077B";
const defaultLocalBaseUrl = "http://127.0.0.1:3077";
const defaultBaseUrl =
  "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev";
const requiredEnvNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const routeKeys = new Set([
  "overview",
  "products",
  "categories",
  "suppliers",
  "staff",
  "history",
  "sync",
  "devices",
  "settings",
]);
const routePathToKey = new Map([
  ["/shop/overview", "overview"],
  ["/shop/products", "products"],
  ["/shop/categories", "categories"],
  ["/shop/suppliers", "suppliers"],
  ["/shop/staff", "staff"],
  ["/shop/history", "history"],
  ["/shop/sync", "sync"],
  ["/shop/devices", "devices"],
  ["/shop/settings", "settings"],
]);

function fail(code, message) {
  console.error(`[task-077-cloud-performance] FAIL ${code}: ${message}`);
  process.exit(2);
}

function parseEnvFile(relativePath) {
  const path = join(root, relativePath);

  if (!existsSync(path)) {
    fail("BLOCKED_TASK077_ENV_FILE_REQUIRED", `${relativePath} is required.`);
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
        "BLOCKED_TASK077_CLOUD_SUPABASE_URL_REQUIRED",
        "TASK-077 requires an https://*.supabase.co Supabase target.",
      );
    }

    return url.hostname.split(".")[0] ?? "";
  } catch {
    fail("BLOCKED_TASK077_CLOUD_SUPABASE_URL_INVALID", "Supabase URL is invalid.");
  }
}

function assertBaseUrl(value, appTarget) {
  let url;

  try {
    url = new URL(value);
  } catch {
    fail("BLOCKED_TASK077_BASE_URL_INVALID", "PLAYWRIGHT_BASE_URL must be a valid URL.");
  }

  if (appTarget === "local-cloud") {
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "::1"].includes(url.hostname)
    ) {
      fail(
        "BLOCKED_TASK077_LOCAL_APP_URL_REQUIRED",
        "TASK077_APP_TARGET=local-cloud requires a local http PLAYWRIGHT_BASE_URL.",
      );
    }

    return;
  }

  if (
    url.protocol !== "https:" ||
    ["127.0.0.1", "localhost", "::1"].includes(url.hostname)
  ) {
    fail(
      "BLOCKED_TASK077_STAGING_APP_URL_REQUIRED",
      "TASK077_APP_TARGET=staging requires an https non-local Admin Web URL.",
    );
  }

  if (/prod|production/i.test(url.hostname)) {
    fail(
      "BLOCKED_TASK077_PRODUCTION_URL_FORBIDDEN",
      "PLAYWRIGHT_BASE_URL hostname looks production-like.",
    );
  }

  if (!/(staging|dev|preview|workers\.dev|vercel\.app)/i.test(url.hostname)) {
    fail(
      "BLOCKED_TASK077_NON_PRODUCTION_URL_UNCLEAR",
      "Use a staging/dev/preview Admin Web URL for TASK-077.",
    );
  }
}

function redactRef(ref) {
  return ref ? `${ref.slice(0, 4)}...${ref.slice(-3)}` : "unknown";
}

function parseDataset(value) {
  const normalized = value || "both";

  if (normalized === "both") {
    return ["fixture", "real-shop"];
  }

  if (normalized === "fixture" || normalized === "real-shop") {
    return [normalized];
  }

  fail(
    "BLOCKED_TASK077_DATASET_INVALID",
    "TASK077_PERF_DATASET must be fixture, real-shop or both.",
  );
}

function copyFixtureEvidence(phase) {
  const source = join(
    "docs/TASKS/EVIDENCE/TASK-076",
    `task-076-cloud-performance-task-077-${phase}-fixture.json`,
  );
  const target = join(
    evidenceDir,
    `task-077-cloud-performance-fixture-${phase}.json`,
  );
  const task077bTarget = join(
    task077bEvidenceDir,
    `task-077b-shop-performance-fixture-${phase}.json`,
  );

  if (!existsSync(source)) {
    fail(
      "BLOCKED_TASK077_FIXTURE_REPORT_MISSING",
      `Fixture report was not produced: ${source}`,
    );
  }

  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(task077bEvidenceDir, { recursive: true });
  const parsed = JSON.parse(readFileSync(source, "utf8"));
  const payload = {
    ...parsed,
    dataset: "synthetic-fixture",
    copiedFrom: source,
    phase,
  };

  writeFileSync(`${target}.tmp`, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(`${task077bTarget}.tmp`, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(task077bTarget, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[task-077-cloud-performance] fixture_report=${target}`);
  console.log(`[task-077-cloud-performance] fixture_report_task077b=${task077bTarget}`);
}

function runCommand(label, args, env) {
  const result = spawnSync(process.execPath, args, {
    env,
    stdio: "inherit",
  });

  if ((result.status ?? 1) !== 0) {
    fail(`BLOCKED_TASK077_${label}`, `${label} failed.`);
  }
}

function reportPathForRealShopPhase(phase) {
  return join(evidenceDir, `task-077-cloud-performance-real-shop-${phase}.json`);
}

function task077bReportPathForRealShopPhase(phase) {
  return join(
    task077bEvidenceDir,
    `task-077b-shop-performance-real-shop-${phase}.json`,
  );
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

function maxNumericMeta(traces, key) {
  const values = traces
    .map((trace) => numericMeta(trace, key))
    .filter((value) => value !== null);

  return values.length > 0 ? Math.max(...values) : 0;
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
    catalogOptionsBytesMax: maxNumericMeta(traces, "catalogOptionsBytes"),
    clientProductOptionsMax: maxNumericMeta(traces, "clientProductOptions"),
    estimatedSectionBytesMax: maxNumericMeta(traces, "estimatedSectionBytes"),
    latestQueryCount: queryCount(latest),
    latestTotalMs: latest.totalMs,
    liveDataRowsMax: maxNumericMeta(traces, "liveDataRows"),
    pageRowsMax: maxNumericMeta(traces, "pageRows"),
    productsPageBytesMax: maxNumericMeta(traces, "productsPageBytes"),
    queryCountPerRenderMax: Math.max(...traces.map(queryCount)),
    queryLabels: Array.from(labels).sort(),
    readModelsLoaded: Array.from(readModels).sort(),
    renderCount: traces.length,
    scopeLabels: Array.from(scopes).sort(),
    serverTotalMsMax: Math.max(...traces.map((trace) => trace.totalMs ?? 0)),
    status: "captured",
    totalCountMax: maxNumericMeta(traces, "totalCount"),
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

function routeKeyForTrace(trace) {
  const routeKey = trace.meta?.routeKey;

  if (typeof routeKey === "string" && routeKeys.has(routeKey)) {
    return routeKey;
  }

  const routePath = trace.meta?.route;

  if (typeof routePath === "string") {
    const key = routePathToKey.get(routePath);

    if (key) {
      return key;
    }
  }

  if (trace.scope === "shop.products") {
    return "products";
  }

  return null;
}

function augmentRealShopReport(reportPath, rawTraces, appTarget, phase) {
  if (!existsSync(reportPath)) {
    return;
  }

  const parsed = JSON.parse(readFileSync(reportPath, "utf8"));
  const serverPerfTraces = rawTraces.map(sanitizeTrace);
  const tracesByRoute = new Map();

  for (const trace of serverPerfTraces) {
    const routeKey = routeKeyForTrace(trace);

    if (!routeKey) {
      continue;
    }

    const traces = tracesByRoute.get(routeKey) ?? [];
    traces.push(trace);
    tracesByRoute.set(routeKey, traces);
  }

  const payload = {
    ...parsed,
    measurements: (parsed.measurements ?? []).map((measurement) => {
      const key = routePathToKey.get(measurement.path) ?? measurement.path;

      return {
        ...measurement,
        key,
        serverTraceSummary: summarizeRouteTrace(tracesByRoute.get(key) ?? []),
      };
    }),
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

  mkdirSync(task077bEvidenceDir, { recursive: true });
  const task077bPath = task077bReportPathForRealShopPhase(phase);
  writeFileSync(`${task077bPath}.tmp`, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(task077bPath, `${JSON.stringify(payload, null, 2)}\n`);
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
        "BLOCKED_TASK077_LOCAL_SERVER_EXITED",
        "Next local server exited before becoming ready.",
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

  fail("BLOCKED_TASK077_LOCAL_SERVER_TIMEOUT", "Next local server did not become ready.");
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
    fail("BLOCKED_TASK077_BUILD_FAILED", "next build failed before benchmark.");
  }
}

function startLocalServer(env, traces) {
  const baseUrl = new URL(env.PLAYWRIGHT_BASE_URL);
  const port = baseUrl.port || "3077";
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const serverMode = env.TASK077_LOCAL_SERVER || "start";
  const serverArgs =
    serverMode === "dev"
      ? ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", port]
      : ["run", "start", "--", "--hostname", "127.0.0.1", "--port", port];
  const child = spawn(command, serverArgs, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdoutBuffer = "";
  let stderrBuffer = "";
  const handleLine = (line) => {
    if (parsePerfLine(line, traces)) {
      return;
    }

    if (/ready|started server|local:/i.test(line)) {
      console.log(`[task-077-cloud-performance] server ${line}`);
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

async function stopLocalServer(child) {
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
const appTarget = process.env.TASK077_APP_TARGET || "staging";
const env = {
  ...fileEnv,
  ...process.env,
  ADMIN_WEB_PERF_DEBUG:
    process.env.ADMIN_WEB_PERF_DEBUG || (appTarget === "local-cloud" ? "1" : undefined),
  PLAYWRIGHT_BASE_URL:
    process.env.PLAYWRIGHT_BASE_URL ||
    (appTarget === "local-cloud" ? defaultLocalBaseUrl : defaultBaseUrl),
  TEST_TARGET: "staging",
};
env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
env.SUPABASE_ANON_KEY =
  env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
env.TASK077_PERF_PHASE = env.TASK077_PERF_PHASE || "manual";
env.ALLOWED_STAGING_SUPABASE_PROJECT_REFS =
  env.ALLOWED_STAGING_SUPABASE_PROJECT_REFS || env.SUPABASE_PROJECT_REF;

const missing = requiredEnvNames.filter((name) => !env[name]?.trim());
if (missing.length > 0) {
  fail(
    "BLOCKED_TASK077_ENV_REQUIRED",
    `${envFile} or process env is missing required keys: ${missing.join(", ")}.`,
  );
}

if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()) {
  fail(
    "BLOCKED_TASK077_PUBLISHABLE_KEY_REQUIRED",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY is required.",
  );
}

const refFromUrl = cloudRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL);
if (env.SUPABASE_PROJECT_REF.trim() !== refFromUrl) {
  fail(
    "BLOCKED_TASK077_PROJECT_REF_MISMATCH",
    "SUPABASE_PROJECT_REF must match the Supabase URL project ref.",
  );
}

assertBaseUrl(env.PLAYWRIGHT_BASE_URL, appTarget);

try {
  assertNoProductionProjectRef(env);
  assertTargetEnv("staging", env, { requireConfirmation: true });
} catch (error) {
  fail(error.code ?? "BLOCKED_TASK077_TARGET_GUARDRAIL", error.message);
}

const datasets = parseDataset(env.TASK077_PERF_DATASET);
const extraArgs = process.argv.slice(2);
const hasProjectArg = extraArgs.some(
  (arg) => arg === "--project" || arg.startsWith("--project="),
);

console.log("[task-077-cloud-performance] PASS cloud guardrails passed");
console.log(
  `[task-077-cloud-performance] target_ref=${redactRef(env.SUPABASE_PROJECT_REF)}`,
);
console.log(`[task-077-cloud-performance] app_target=${appTarget}`);
console.log(`[task-077-cloud-performance] dataset=${datasets.join(",")}`);
console.log(`[task-077-cloud-performance] phase=${env.TASK077_PERF_PHASE}`);

const traces = [];
let localServer = null;
let realShopExitCode = 0;

try {
  if (appTarget === "local-cloud") {
    if ((env.TASK077_LOCAL_SERVER || "start") === "start") {
      await runBuild(env);
    }

    localServer = startLocalServer(env, traces);
    await waitForServer(env.PLAYWRIGHT_BASE_URL, localServer);
    env.PLAYWRIGHT_DISABLE_WEB_SERVER = "1";
  } else {
    env.PLAYWRIGHT_DISABLE_WEB_SERVER = "1";
  }

if (datasets.includes("fixture")) {
  if (env.CONFIRM_TASK077_FIXTURE_CLOUD_PERFORMANCE !== "yes") {
    fail(
      "BLOCKED_TASK077_FIXTURE_CONFIRMATION_REQUIRED",
      "Set CONFIRM_TASK077_FIXTURE_CLOUD_PERFORMANCE=yes before creating TASK076_* synthetic fixture data.",
    );
  }

  const fixtureEnv = {
    ...env,
    CONFIRM_TASK076_CLOUD_PERFORMANCE: "yes",
    TASK076_ENFORCE_THRESHOLDS: env.TASK077_ENFORCE_THRESHOLDS,
    TASK076_PERF_PHASE: `task-077-${env.TASK077_PERF_PHASE}-fixture`,
  };

  if (appTarget === "local-cloud") {
    const fixtureArgs = [
      "playwright",
      "test",
      "tests/e2e/staging/task-076-shop-admin-cloud-performance.spec.ts",
      ...(hasProjectArg ? [] : ["--project=chromium-desktop"]),
      ...extraArgs,
    ];
    const result = spawnSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      fixtureArgs,
      {
        env: {
          ...fixtureEnv,
          PLAYWRIGHT_DISABLE_WEB_SERVER: "1",
          PLAYWRIGHT_REUSE_SERVER: "1",
        },
        stdio: "inherit",
      },
    );

    if ((result.status ?? 1) !== 0) {
      fail("BLOCKED_TASK077_FIXTURE_PERFORMANCE", "fixture performance failed.");
    }
  } else {
    runCommand(
      "FIXTURE_PERFORMANCE",
      ["scripts/testing/task-076-shop-cloud-performance.mjs", ...extraArgs],
      fixtureEnv,
    );
  }
  copyFixtureEvidence(env.TASK077_PERF_PHASE);
}

if (datasets.includes("real-shop")) {
  if (env.CONFIRM_TASK077_REAL_SHOP_READONLY !== "yes") {
    fail(
      "BLOCKED_TASK077_REAL_SHOP_CONFIRMATION_REQUIRED",
      "Set CONFIRM_TASK077_REAL_SHOP_READONLY=yes before generating a read-only real-shop auth session.",
    );
  }

  const playwrightArgs = [
    "playwright",
    "test",
    "tests/e2e/staging/task-077-shop-admin-real-cloud-performance.spec.ts",
    ...(hasProjectArg ? [] : ["--project=chromium-desktop"]),
    ...extraArgs,
  ];
  const realShopEnv = {
    ...env,
    PLAYWRIGHT_DISABLE_WEB_SERVER:
      appTarget === "staging" ? "1" : env.PLAYWRIGHT_DISABLE_WEB_SERVER,
    PLAYWRIGHT_REUSE_SERVER:
      appTarget === "local-cloud"
        ? "1"
        : env.PLAYWRIGHT_REUSE_SERVER,
  };

  const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", playwrightArgs, {
    env: realShopEnv,
    stdio: "inherit",
  });

  if ((result.status ?? 1) !== 0) {
    realShopExitCode = result.status ?? 1;
  }
}
} finally {
  await stopLocalServer(localServer);
  augmentRealShopReport(
    reportPathForRealShopPhase(env.TASK077_PERF_PHASE),
    traces,
    appTarget,
    env.TASK077_PERF_PHASE,
  );
}

if (realShopExitCode !== 0) {
  fail("BLOCKED_TASK077_REAL_SHOP_PERFORMANCE", "real-shop performance failed.");
}
