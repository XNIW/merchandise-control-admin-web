#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import WebSocket from "ws";

const require = createRequire(import.meta.url);
const WRANGLER_VERSION = require("wrangler/package.json").version;
const RESULT_SCHEMA_VERSION = "task149-pos-product-image-resource-gate-v2";
const EXPECTED_WORKER_NAME = "merchandise-control-admin-web-staging";
const CLOUDFLARE_API_BASE_URL = "https://api.cloudflare.com/client/v4";
const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";
const HARNESS_SCRIPT =
  "scripts/testing/task-149-pos-product-image-staging-e2e.mjs";
const WRANGLER_BIN = join(process.cwd(), "node_modules", ".bin", "wrangler");
const MEMORY_LIMIT_BYTES = 128 * 1024 * 1024;
const MAX_CHILD_OUTPUT_BYTES = 1024 * 1024;
const MAX_TAIL_EVENT_BYTES = 512 * 1024;
const MAX_TAIL_EVENTS = 2_000;
const MAX_TAIL_CHANNEL_RECORDS = 1_000;
const MAX_TAIL_CPU_MILLISECONDS = 5 * 60 * 1_000;
const MAX_TAIL_CONTROL_PLANE_BYTES = 64 * 1024;
const MAX_TAIL_DIAGNOSTIC_BYTES = 64 * 1024;
const MAX_TAIL_DIAGNOSTIC_LINE_BYTES = 4 * 1024;
const TAIL_CONNECTION_TIMEOUT_MILLISECONDS = 30_000;
const TAIL_DELIVERY_TIMEOUT_MILLISECONDS = 30_000;
const TAIL_HEARTBEAT_INTERVAL_MILLISECONDS = 10_000;
const REQUEST_PHASE_TIMEOUT_MILLISECONDS = 40 * 60 * 1_000;
const HARNESS_TOTAL_TIMEOUT_MILLISECONDS = 175 * 60 * 1_000;
const CHILD_STOP_GRACE_MILLISECONDS = 5_000;
const HARNESS_COOPERATIVE_ABORT_SIGNAL = "SIGUSR2";
const TAIL_MINIMUM_REMAINING_MILLISECONDS =
  REQUEST_PHASE_TIMEOUT_MILLISECONDS + 5 * 60 * 1_000;
const TAIL_READINESS_PING = Buffer.from("task149-tail-readiness-v1");
const TAIL_PROTOCOL = "trace-v1";
const TAIL_WEBSOCKET_HOSTNAME = "tail.developers.workers.dev";
const GRAPHQL_ATTEMPTS = 12;
const GRAPHQL_RETRY_MILLISECONDS = 10_000;
const RUN_MARKER_PATTERN = /^TASK149_[A-Z0-9]{6,12}$/;
const RUN_ID_PATTERN = /^[A-Z0-9]{6,12}$/;
const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const REQUEST_LABEL_PATTERN = /^[a-z0-9][a-z0-9_-]{0,95}$/;
const RUN_MARKER_HEADER = "x-task149-run-marker";
const REQUEST_LABEL_HEADER = "x-task149-request-label";
const REQUEST_SEQUENCE_HEADER = "x-task149-request-sequence";
const TAIL_CONNECTED_DIAGNOSTIC = `Connected to ${EXPECTED_WORKER_NAME}, waiting for logs...`;
const ANSI_ESCAPE_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const HARNESS_ENVIRONMENT_KEYS = Object.freeze([
  "ALLOW_STAGING_E2E",
  "ALLOWED_STAGING_SUPABASE_PROJECT_REFS",
  "CONFIRM_STAGING_E2E",
  "CONFIRM_TASK149_POS_PRODUCT_IMAGE_E2E",
  "NEXT_PUBLIC_SUPABASE_URL",
  "PRODUCTION_SUPABASE_PROJECT_REFS",
  "STAGING_SUPABASE_PROJECT_REF",
  "SUPABASE_PRODUCTION_PROJECT_REF",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TASK149_POS_IMAGE_E2E_ALLOW_CLEANUP",
  "TASK149_POS_IMAGE_E2E_ALLOW_SETUP",
  "TASK149_POS_IMAGE_E2E_BASE_URL",
  "TASK149_POS_IMAGE_E2E_CLEANUP_RPC",
  "TASK149_POS_IMAGE_E2E_PROVE_URL_EXPIRY",
  "TASK149_POS_IMAGE_E2E_RUN_ID",
  "TASK149_POS_IMAGE_E2E_STAGING_HOST_ALLOWLIST",
  "TEST_TARGET",
]);
const FINAL_CASE_MARKERS = Object.freeze([
  "TASK149_CASE_46",
  "TASK149_CASE_48",
]);
const REQUIRED_EXTERNAL_POST_RUN = Object.freeze([
  "cloudflare_cpu_memory",
  "cloudflare_runtime_log_scan",
]);
const REQUIRED_HARNESS_CASE_MARKERS = Object.freeze([
  "TASK149_CASE_01",
  "TASK149_CASE_06",
  "TASK149_CASE_07",
  "TASK149_CASE_08",
  "TASK149_CASE_12",
  "TASK149_CASE_14",
  "TASK149_CASE_21",
  "TASK149_CASE_23",
  "TASK149_CASE_25",
  "TASK149_CASE_29",
  "TASK149_CASE_31",
  "TASK149_CASE_33",
  "TASK149_CASE_34",
  "TASK149_CASE_36",
  "TASK149_CASE_37",
  "TASK149_CASE_38",
  "TASK149_CASE_41",
  "TASK149_CASE_44",
  "TASK149_CASE_45",
]);
const REQUIRED_ACCEPTANCE_STEPS = Object.freeze([
  "trusted_pos_session",
  "catalog_without_image",
  "intent",
  "canonical_upload",
  "finalize",
  "catalog_new_version_delta",
  "read_urls",
  "download_hash_validation",
  "durable_replay",
  "replacement",
  "first_version_superseded",
  "stale_conflicts",
  "remove",
  "catalog_removal_delta",
  "cleanup_status_contract",
  "auth_denial",
  "expired_url_renewal",
  "durable_redaction",
  "full_catalog_drain",
]);
const FORBIDDEN_LOG_PATTERN =
  /(?:https?|wss?):\\*\/\\*\/|\bbearer\b|(?:access|refresh|session|device)[_-]?token|signed[_-]?url|(?:^|[?&])(?:token|signature|x-amz-[^=]+)=|sb_(?:secret|publishable)_|service[_-]?role|mcpos_(?:device|session)_|eyJ[A-Za-z0-9_-]*\.|shops\\*\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\*\/products\\*\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\*\/primary\\*\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\*\/(?:main|thumb)\.jpg/i;

class GateError extends Error {
  constructor(code) {
    super(code);
    this.name = "GateError";
    this.code = code;
  }
}

function reject(code) {
  throw new GateError(code);
}

function assertGate(condition, code) {
  if (!condition) reject(code);
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
}

function exactArray(actual, expected, code) {
  assertGate(
    Array.isArray(actual) &&
      actual.length === expected.length &&
      actual.every((value, index) => value === expected[index]),
    code,
  );
}

function exactKeys(value, expected, code) {
  assertGate(isRecord(value), code);
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  exactArray(actualKeys, expectedKeys, code);
}

function finiteNonnegative(value, code) {
  assertGate(
    typeof value === "number" && Number.isFinite(value) && value >= 0,
    code,
  );
}

function tailCpuMillisecondsToMicroseconds(value) {
  finiteNonnegative(value, "TASK149_TAIL_CPU_INVALID");
  assertGate(value <= MAX_TAIL_CPU_MILLISECONDS, "TASK149_TAIL_CPU_INVALID");
  const microseconds = value * 1_000;
  assertGate(
    Number.isFinite(microseconds) &&
      microseconds >= 0 &&
      microseconds <= Number.MAX_SAFE_INTEGER,
    "TASK149_TAIL_CPU_INVALID",
  );
  return microseconds;
}

function safeInteger(value, code, { positive = false } = {}) {
  assertGate(
    Number.isSafeInteger(value) && (positive ? value > 0 : value >= 0),
    code,
  );
}

function parseTimestamp(value, code) {
  const milliseconds =
    typeof value === "number" ? value : Date.parse(String(value));
  assertGate(Number.isFinite(milliseconds), code);
  return milliseconds;
}

function parseJson(serialized, code) {
  try {
    return JSON.parse(serialized);
  } catch {
    reject(code);
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim() ?? "";
  assertGate(value.length > 0, `BLOCKED_TASK149_${name}_REQUIRED`);
  return value;
}

function liveConfiguration() {
  const apiToken = requiredEnv("CLOUDFLARE_API_TOKEN");
  const accountId = requiredEnv("CLOUDFLARE_ACCOUNT_ID");
  const runId = requiredEnv("TASK149_POS_IMAGE_E2E_RUN_ID").toUpperCase();
  const rawBaseUrl = requiredEnv("TASK149_POS_IMAGE_E2E_BASE_URL");
  assertGate(
    ACCOUNT_ID_PATTERN.test(accountId),
    "BLOCKED_TASK149_CLOUDFLARE_ACCOUNT_ID_INVALID",
  );
  assertGate(RUN_ID_PATTERN.test(runId), "BLOCKED_TASK149_RUN_ID_INVALID");

  let baseUrl;
  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    reject("BLOCKED_TASK149_BASE_URL_INVALID");
  }
  assertGate(
    baseUrl.protocol === "https:" &&
      !baseUrl.username &&
      !baseUrl.password &&
      !baseUrl.search &&
      !baseUrl.hash &&
      baseUrl.pathname === "/" &&
      /(^|[-.])(stage|staging|test|qa|sandbox)([-.]|$)|\.workers\.dev$/i.test(
        baseUrl.hostname,
      ) &&
      !/prod|production/i.test(baseUrl.hostname),
    "BLOCKED_TASK149_STAGING_ORIGIN_INVALID",
  );

  const allowlist = requiredEnv("TASK149_POS_IMAGE_E2E_STAGING_HOST_ALLOWLIST")
    .split(/[\s,]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  assertGate(
    allowlist.includes(baseUrl.hostname.toLowerCase()),
    "BLOCKED_TASK149_STAGING_ORIGIN_NOT_ALLOWLISTED",
  );

  return {
    accountId,
    apiToken,
    baseUrl,
    runMarker: `TASK149_${runId}`,
  };
}

function validateDeploymentStatus(value) {
  assertGate(isRecord(value), "TASK149_DEPLOYMENT_STATUS_INVALID");
  assertGate(
    OPAQUE_ID_PATTERN.test(value.id) &&
      Array.isArray(value.versions) &&
      value.versions.length === 1,
    "TASK149_DEPLOYMENT_STATUS_INVALID",
  );
  const version = value.versions[0];
  assertGate(
    isRecord(version) &&
      OPAQUE_ID_PATTERN.test(version.version_id) &&
      version.percentage === 100,
    "TASK149_DEPLOYMENT_STATUS_INVALID",
  );
  return {
    deploymentId: value.id,
    versionId: version.version_id,
  };
}

function selectEnvironment(sourceEnvironment, keys) {
  assertGate(
    isRecord(sourceEnvironment) && Array.isArray(keys),
    "TASK149_CHILD_ENVIRONMENT_INVALID",
  );
  const selected = {};
  for (const key of keys) {
    const value = sourceEnvironment[key];
    if (typeof value === "string") selected[key] = value;
  }
  return selected;
}

function wranglerEnvironment(config, sourceEnvironment) {
  assertGate(
    isRecord(config) &&
      typeof config.accountId === "string" &&
      config.accountId.length > 0 &&
      typeof config.apiToken === "string" &&
      config.apiToken.length > 0,
    "TASK149_WRANGLER_ENVIRONMENT_INVALID",
  );
  const path = sourceEnvironment.PATH;
  assertGate(
    typeof path === "string" && path.length > 0 && !path.includes("\0"),
    "BLOCKED_TASK149_WRANGLER_PATH_REQUIRED",
  );
  const environment = {
    CLOUDFLARE_ACCOUNT_ID: config.accountId,
    CLOUDFLARE_API_TOKEN: config.apiToken,
    PATH: path,
    WRANGLER_WRITE_LOGS: "false",
  };
  exactKeys(
    environment,
    [
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_API_TOKEN",
      "PATH",
      "WRANGLER_WRITE_LOGS",
    ],
    "TASK149_WRANGLER_ENVIRONMENT_INVALID",
  );
  return environment;
}

function harnessEnvironment(sourceEnvironment) {
  return selectEnvironment(sourceEnvironment, HARNESS_ENVIRONMENT_KEYS);
}

function runChild(command, args, options = {}) {
  assertGate(
    isRecord(options.spawn) && isRecord(options.spawn.env),
    "TASK149_CHILD_ENVIRONMENT_REQUIRED",
  );
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    ...options.spawn,
  });
  let stdout = "";
  let stderrBytes = 0;
  let overflow = false;

  child.stdout.on("data", (chunk) => {
    if (overflow) return;
    stdout += chunk.toString("utf8");
    if (Buffer.byteLength(stdout) > MAX_CHILD_OUTPUT_BYTES) {
      overflow = true;
      stdout = "";
    }
  });
  child.stderr.on("data", (chunk) => {
    stderrBytes += chunk.length;
    options.onStderr?.(chunk);
    if (stderrBytes > MAX_CHILD_OUTPUT_BYTES) overflow = true;
  });

  const done = new Promise((resolve) => {
    child.once("error", () => {
      resolve({ code: null, overflow: true, stdout: "" });
    });
    child.once("close", (code, signal) => {
      resolve({ code, overflow, signal, stdout });
    });
  });
  return { child, done };
}

async function liveDeploymentStatus(config) {
  const execution = runChild(
    WRANGLER_BIN,
    ["deployments", "status", "--env", "staging", "--json"],
    {
      spawn: { env: wranglerEnvironment(config, process.env) },
    },
  );
  const result = await execution.done;
  assertGate(
    result.code === 0 && result.overflow === false,
    "BLOCKED_TASK149_DEPLOYMENT_STATUS_UNAVAILABLE",
  );
  return validateDeploymentStatus(
    parseJson(result.stdout.trim(), "TASK149_DEPLOYMENT_STATUS_INVALID"),
  );
}

function getHeader(headers, name) {
  if (isRecord(headers)) {
    const entry = Object.entries(headers).find(
      ([key]) => key.toLowerCase() === name,
    );
    if (!entry) return "";
    if (typeof entry[1] === "string") return entry[1];
    if (
      Array.isArray(entry[1]) &&
      entry[1].length === 1 &&
      typeof entry[1][0] === "string"
    ) {
      return entry[1][0];
    }
    return "";
  }
  if (Array.isArray(headers)) {
    const matches = headers.filter(
      (entry) =>
        isRecord(entry) &&
        String(entry.name ?? "").toLowerCase() === name &&
        typeof entry.value === "string",
    );
    return matches.length === 1 ? matches[0].value : "";
  }
  return "";
}

function containsForbiddenLogValue(value) {
  const pending = [value];
  let visited = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    visited += 1;
    assertGate(visited <= 10_000, "TASK149_TAIL_LOG_TOO_COMPLEX");
    if (typeof current === "string") {
      if (FORBIDDEN_LOG_PATTERN.test(current)) return true;
    } else if (Array.isArray(current)) {
      pending.push(...current);
    } else if (isRecord(current)) {
      for (const [key, value] of Object.entries(current)) {
        pending.push(key, value);
      }
    }
  }
  return false;
}

function createProcessDiagnosticScanner({
  expectedConnectionDiagnostic = null,
} = {}) {
  const buffers = new Map([
    ["stderr", ""],
    ["stdout", ""],
  ]);
  let bytesScanned = 0;
  let connectionDiagnosticCount = 0;
  let failureCode = "";

  function fail(code) {
    failureCode ||= code;
  }

  function acceptLine(channel, rawLine) {
    if (failureCode) return;
    const normalized = rawLine
      .replace(ANSI_ESCAPE_PATTERN, "")
      .replace(/\r$/, "");
    if (containsForbiddenLogValue(normalized)) {
      fail("TASK149_TAIL_PROCESS_DIAGNOSTIC_LEAK");
      return;
    }
    if (normalized !== expectedConnectionDiagnostic) return;
    if (channel !== "stdout" || connectionDiagnosticCount !== 0) {
      fail("TASK149_TAIL_CONNECTION_DIAGNOSTIC_INVALID");
      return;
    }
    connectionDiagnosticCount = 1;
  }

  function acceptChunk(channel, chunk) {
    if (failureCode) return;
    assertGate(buffers.has(channel), "TASK149_TAIL_PROCESS_DIAGNOSTIC_INVALID");
    bytesScanned += chunk.length;
    if (bytesScanned > MAX_TAIL_DIAGNOSTIC_BYTES) {
      fail("TASK149_TAIL_PROCESS_DIAGNOSTIC_OVERFLOW");
      return;
    }

    let buffer = buffers.get(channel) + chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    if (
      Buffer.byteLength(buffer) > MAX_TAIL_DIAGNOSTIC_LINE_BYTES ||
      lines.some(
        (line) => Buffer.byteLength(line) > MAX_TAIL_DIAGNOSTIC_LINE_BYTES,
      )
    ) {
      fail("TASK149_TAIL_PROCESS_DIAGNOSTIC_LINE_TOO_LARGE");
      buffers.set(channel, "");
      return;
    }
    buffers.set(channel, buffer);
    for (const line of lines) acceptLine(channel, line);
  }

  function finish() {
    for (const [channel, buffer] of buffers) {
      if (buffer) acceptLine(channel, buffer);
      buffers.set(channel, "");
    }
  }

  return {
    acceptChunk,
    finish,
    get bytesScanned() {
      return bytesScanned;
    },
    get connected() {
      return connectionDiagnosticCount === 1;
    },
    get connectionDiagnosticCount() {
      return connectionDiagnosticCount;
    },
    get failureCode() {
      return failureCode;
    },
  };
}

function createTailAggregator({
  expectedOrigin,
  expectedVersionId,
  runMarker,
}) {
  const events = new Map();
  let currentJson = "";
  let currentJsonBytes = 0;
  let depth = 0;
  let escaped = false;
  let failureCode = "";
  let inString = false;
  let diagnosticsChannelEventCount = 0;
  let logRecordCount = 0;

  function fail(code) {
    failureCode ||= code;
  }

  function acceptObject(value) {
    try {
      assertGate(isRecord(value), "TASK149_TAIL_EVENT_INVALID");
      assertGate(
        value.scriptName === EXPECTED_WORKER_NAME &&
          value.scriptVersion?.id === expectedVersionId &&
          value.outcome === "ok" &&
          value.truncated === false,
        "TASK149_TAIL_IDENTITY_OR_OUTCOME_INVALID",
      );
      const cpuMicroseconds = tailCpuMillisecondsToMicroseconds(value.cpuTime);
      finiteNonnegative(value.wallTime, "TASK149_TAIL_WALL_TIME_INVALID");
      const timestamp = parseTimestamp(
        value.eventTimestamp,
        "TASK149_TAIL_TIMESTAMP_INVALID",
      );
      const request = value.event?.request;
      const response = value.event?.response;
      assertGate(
        isRecord(request) &&
          isRecord(response) &&
          request.method === "POST" &&
          Number.isSafeInteger(response.status) &&
          response.status !== 503 &&
          response.status < 500,
        "TASK149_TAIL_HTTP_INVALID",
      );

      let requestUrl;
      try {
        requestUrl = new URL(request.url);
      } catch {
        reject("TASK149_TAIL_REQUEST_INVALID");
      }
      assertGate(
        requestUrl.protocol === "https:" &&
          requestUrl.origin === expectedOrigin &&
          !requestUrl.username &&
          !requestUrl.password &&
          !requestUrl.search &&
          !requestUrl.hash,
        "TASK149_TAIL_REQUEST_INVALID",
      );

      const marker = getHeader(request.headers, RUN_MARKER_HEADER);
      const label = getHeader(request.headers, REQUEST_LABEL_HEADER);
      const sequenceText = getHeader(request.headers, REQUEST_SEQUENCE_HEADER);
      assertGate(
        marker === runMarker &&
          RUN_MARKER_PATTERN.test(marker) &&
          REQUEST_LABEL_PATTERN.test(label) &&
          /^(?:0|[1-9]\d{0,3})$/.test(sequenceText),
        "TASK149_TAIL_CORRELATION_INVALID",
      );
      const sequence = Number(sequenceText);
      assertGate(
        !events.has(sequence) && events.size < MAX_TAIL_EVENTS,
        "TASK149_TAIL_DUPLICATE_OR_EXCESS_EVENT",
      );

      const logs = Array.isArray(value.logs) ? value.logs : null;
      const exceptions = Array.isArray(value.exceptions)
        ? value.exceptions
        : null;
      const diagnosticsChannelEvents =
        value.diagnosticsChannelEvents === undefined
          ? []
          : Array.isArray(value.diagnosticsChannelEvents)
            ? value.diagnosticsChannelEvents
            : null;
      assertGate(
        logs !== null &&
          exceptions !== null &&
          diagnosticsChannelEvents !== null &&
          logs.length <= MAX_TAIL_CHANNEL_RECORDS &&
          exceptions.length <= MAX_TAIL_CHANNEL_RECORDS &&
          diagnosticsChannelEvents.length <= MAX_TAIL_CHANNEL_RECORDS &&
          exceptions.length === 0 &&
          !containsForbiddenLogValue(logs) &&
          !containsForbiddenLogValue(exceptions) &&
          !containsForbiddenLogValue(diagnosticsChannelEvents),
        "TASK149_TAIL_LOG_EXCEPTION_OR_DIAGNOSTIC_FAILURE",
      );
      logRecordCount += logs.length;
      diagnosticsChannelEventCount += diagnosticsChannelEvents.length;

      let route = "other";
      if (requestUrl.pathname === "/api/pos/catalog/product-images/intent") {
        route = "intent";
      } else if (requestUrl.pathname === "/api/pos/catalog/pull") {
        route = "catalog";
      }
      events.set(sequence, {
        cpuMicroseconds,
        label,
        route,
        status: response.status,
        timestamp,
      });
    } catch (error) {
      fail(
        error instanceof GateError ? error.code : "TASK149_TAIL_EVENT_INVALID",
      );
    }
  }

  function acceptSerialized(serialized) {
    if (!serialized.trim()) return;
    if (Buffer.byteLength(serialized) > MAX_TAIL_EVENT_BYTES) {
      fail("TASK149_TAIL_EVENT_TOO_LARGE");
      return;
    }
    try {
      acceptObject(JSON.parse(serialized));
    } catch {
      fail("TASK149_TAIL_JSON_INVALID");
    }
  }

  function acceptChunk(chunk) {
    if (failureCode) return;
    const text = chunk.toString("utf8");
    for (const character of text) {
      if (depth === 0) {
        if (/\s/.test(character)) continue;
        if (character !== "{") {
          fail("TASK149_TAIL_JSON_INVALID");
          return;
        }
        currentJson = "{";
        currentJsonBytes = 1;
        depth = 1;
        escaped = false;
        inString = false;
        continue;
      }

      currentJson += character;
      currentJsonBytes += Buffer.byteLength(character);
      if (currentJsonBytes > MAX_TAIL_EVENT_BYTES) {
        fail("TASK149_TAIL_EVENT_TOO_LARGE");
        currentJson = "";
        depth = 0;
        return;
      }

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === "{" || character === "[") {
        depth += 1;
      } else if (character === "}" || character === "]") {
        depth -= 1;
        if (depth < 0) {
          fail("TASK149_TAIL_JSON_INVALID");
          return;
        }
        if (depth === 0) {
          acceptSerialized(currentJson);
          currentJson = "";
          currentJsonBytes = 0;
        }
      }
    }
  }

  function finish() {
    if (depth !== 0 || currentJson.trim()) {
      fail("TASK149_TAIL_JSON_INCOMPLETE");
    }
    currentJson = "";
    currentJsonBytes = 0;
    depth = 0;
  }

  return {
    acceptChunk,
    acceptObject,
    events,
    finish,
    get failureCode() {
      return failureCode;
    },
    get diagnosticsChannelEventCount() {
      return diagnosticsChannelEventCount;
    },
    get logRecordCount() {
      return logRecordCount;
    },
  };
}

function tailArguments(config, deployment, format) {
  return [
    "tail",
    "--env",
    "staging",
    "--format",
    format,
    "--header",
    `${RUN_MARKER_HEADER}:${config.runMarker}`,
    "--version-id",
    deployment.versionId,
  ];
}

function startTailConnectionAttestation(config, deployment) {
  const diagnostics = createProcessDiagnosticScanner({
    expectedConnectionDiagnostic: TAIL_CONNECTED_DIAGNOSTIC,
  });
  const child = spawn(
    WRANGLER_BIN,
    tailArguments(config, deployment, "pretty"),
    {
      cwd: process.cwd(),
      env: wranglerEnvironment(config, process.env),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let closed = false;
  child.stdout.on("data", (chunk) => diagnostics.acceptChunk("stdout", chunk));
  child.stderr.on("data", (chunk) => diagnostics.acceptChunk("stderr", chunk));
  const done = new Promise((resolve) => {
    child.once("error", () => {
      closed = true;
      diagnostics.finish();
      resolve({ code: null, signal: null });
    });
    child.once("close", (code, signal) => {
      closed = true;
      diagnostics.finish();
      resolve({ code, signal });
    });
  });
  return {
    child,
    diagnostics,
    done,
    get closed() {
      return closed;
    },
  };
}

async function attestTailConnection(config, deployment) {
  const attestation = startTailConnectionAttestation(config, deployment);
  try {
    await waitForCondition(
      () =>
        attestation.diagnostics.connected ||
        Boolean(attestation.diagnostics.failureCode) ||
        attestation.closed,
      TAIL_CONNECTION_TIMEOUT_MILLISECONDS,
      "BLOCKED_TASK149_TAIL_CONNECTION_DIAGNOSTIC_NOT_OBSERVED",
    );
    assertGate(
      !attestation.closed &&
        !attestation.diagnostics.failureCode &&
        attestation.diagnostics.connected &&
        attestation.diagnostics.connectionDiagnosticCount === 1,
      attestation.diagnostics.failureCode ||
        "BLOCKED_TASK149_TAIL_CONNECTION_DIAGNOSTIC_NOT_OBSERVED",
    );
  } finally {
    await stopWranglerTail(attestation);
  }
  assertGate(
    !attestation.diagnostics.failureCode &&
      attestation.diagnostics.connected &&
      attestation.diagnostics.connectionDiagnosticCount === 1,
    attestation.diagnostics.failureCode ||
      "BLOCKED_TASK149_TAIL_CONNECTION_DIAGNOSTIC_NOT_OBSERVED",
  );
}

async function boundedResponseText(response, maximumBytes, code) {
  assertGate(
    response?.body && Number.isSafeInteger(maximumBytes) && maximumBytes > 0,
    code,
  );
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      assertGate(value instanceof Uint8Array, code);
      bytes += value.byteLength;
      assertGate(bytes <= maximumBytes, code);
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // The caller still receives the original bounded-read failure.
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, bytes).toString("utf8");
}

function liveTailApiUrl(config, tailId = "") {
  assertGate(
    ACCOUNT_ID_PATTERN.test(config.accountId) &&
      (tailId === "" || OPAQUE_ID_PATTERN.test(tailId)),
    "TASK149_TAIL_CONTROL_PLANE_INVALID",
  );
  const base =
    `${CLOUDFLARE_API_BASE_URL}/accounts/${config.accountId}` +
    `/workers/scripts/${EXPECTED_WORKER_NAME}/tails`;
  return tailId ? `${base}/${encodeURIComponent(tailId)}` : base;
}

async function liveTailApiRequest(config, url, init, code) {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(TAIL_CONNECTION_TIMEOUT_MILLISECONDS),
    });
    if (!response.ok) {
      await response.body?.cancel();
      reject(code);
    }
    const serialized = await boundedResponseText(
      response,
      MAX_TAIL_CONTROL_PLANE_BYTES,
      code,
    );
    const payload = parseJson(serialized, code);
    assertGate(
      isRecord(payload) &&
        payload.success === true &&
        Array.isArray(payload.errors) &&
        payload.errors.length === 0,
      code,
    );
    return payload.result;
  } catch (error) {
    if (error instanceof GateError) throw error;
    reject(code);
  }
}

function tailMessageChunk(data) {
  if (typeof data === "string") return Buffer.from(data, "utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  reject("TASK149_TAIL_MESSAGE_INVALID");
}

function validateLiveTailRecord(result, now = Date.now()) {
  assertGate(
    isRecord(result) &&
      OPAQUE_ID_PATTERN.test(result.id) &&
      typeof result.url === "string" &&
      typeof result.expires_at === "string" &&
      Number.isFinite(now),
    "TASK149_TAIL_CONTROL_PLANE_INVALID",
  );
  let websocketUrl;
  try {
    websocketUrl = new URL(result.url);
  } catch {
    reject("TASK149_TAIL_CONTROL_PLANE_INVALID");
  }
  assertGate(
    websocketUrl.protocol === "wss:" &&
      websocketUrl.hostname === TAIL_WEBSOCKET_HOSTNAME &&
      websocketUrl.port === "" &&
      !websocketUrl.username &&
      !websocketUrl.password &&
      !websocketUrl.hash &&
      Number.isFinite(Date.parse(result.expires_at)) &&
      Date.parse(result.expires_at) - now >=
        TAIL_MINIMUM_REMAINING_MILLISECONDS,
    "TASK149_TAIL_CONTROL_PLANE_INVALID",
  );
  return {
    id: result.id,
    websocketUrl,
  };
}

function createTailHeartbeatState() {
  let waitingForPong = false;
  return {
    acceptPong(data) {
      if (
        !Buffer.isBuffer(data) ||
        Buffer.compare(data, TAIL_READINESS_PING) !== 0
      ) {
        return false;
      }
      waitingForPong = false;
      return true;
    },
    beginPing() {
      if (waitingForPong) return false;
      waitingForPong = true;
      return true;
    },
    get waitingForPong() {
      return waitingForPong;
    },
  };
}

async function waitForPromiseWithin(promise, timeoutMilliseconds) {
  assertGate(
    promise instanceof Promise &&
      Number.isSafeInteger(timeoutMilliseconds) &&
      timeoutMilliseconds >= 0,
    "TASK149_BOUNDED_WAIT_INVALID",
  );
  if (timeoutMilliseconds === 0) {
    return { completed: false, value: null };
  }
  const timeout = new AbortController();
  try {
    return await Promise.race([
      promise.then((value) => ({ completed: true, value })),
      delay(
        timeoutMilliseconds,
        { completed: false, value: null },
        { signal: timeout.signal },
      ),
    ]);
  } finally {
    timeout.abort();
  }
}

async function createLiveTail(config, deployment) {
  const result = await liveTailApiRequest(
    config,
    liveTailApiUrl(config),
    {
      body: JSON.stringify({
        filters: [
          {
            header: {
              key: RUN_MARKER_HEADER,
              query: config.runMarker,
            },
          },
          { scriptVersion: deployment.versionId },
        ],
      }),
      method: "POST",
    },
    "BLOCKED_TASK149_TAIL_CREATE_FAILED",
  );
  const safeTailId =
    isRecord(result) && OPAQUE_ID_PATTERN.test(result.id) ? result.id : "";
  let tailRecord;
  try {
    tailRecord = validateLiveTailRecord(result);
  } catch (error) {
    if (safeTailId) {
      await liveTailApiRequest(
        config,
        liveTailApiUrl(config, safeTailId),
        { method: "DELETE" },
        "BLOCKED_TASK149_TAIL_DELETE_FAILED",
      );
    }
    throw error;
  }

  const aggregator = createTailAggregator({
    expectedOrigin: config.baseUrl.origin,
    expectedVersionId: deployment.versionId,
    runMarker: config.runMarker,
  });
  let websocket;
  try {
    websocket = new WebSocket(tailRecord.websocketUrl, TAIL_PROTOCOL, {
      handshakeTimeout: TAIL_CONNECTION_TIMEOUT_MILLISECONDS,
      headers: {
        "User-Agent": `wrangler/${WRANGLER_VERSION}`,
      },
      maxPayload: MAX_TAIL_EVENT_BYTES,
      perMessageDeflate: false,
    });
  } catch {
    await liveTailApiRequest(
      config,
      liveTailApiUrl(config, tailRecord.id),
      { method: "DELETE" },
      "BLOCKED_TASK149_TAIL_DELETE_FAILED",
    );
    reject("BLOCKED_TASK149_TAIL_WEBSOCKET_FAILED");
  }
  let closed = false;
  let failureCode = "";
  let opened = false;
  let heartbeat = null;
  let deletePromise = null;
  const heartbeatState = createTailHeartbeatState();
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });

  function failWebsocket(code) {
    failureCode ||= code;
    resolveReady();
    cancelHeartbeat();
    try {
      websocket.terminate();
    } catch {
      // The control-plane delete below is the authoritative teardown.
    }
  }

  function cancelHeartbeat() {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
  }

  function deleteTailOnce() {
    deletePromise ??= liveTailApiRequest(
      config,
      liveTailApiUrl(config, tailRecord.id),
      { method: "DELETE" },
      "BLOCKED_TASK149_TAIL_DELETE_FAILED",
    );
    return deletePromise;
  }

  function sendHeartbeat() {
    if (closed || failureCode) return;
    if (
      websocket.readyState !== WebSocket.OPEN ||
      !heartbeatState.beginPing()
    ) {
      failWebsocket("BLOCKED_TASK149_TAIL_HEARTBEAT_FAILED");
      return;
    }
    try {
      websocket.ping(TAIL_READINESS_PING);
    } catch {
      failWebsocket("BLOCKED_TASK149_TAIL_HEARTBEAT_FAILED");
    }
  }

  websocket.on("open", () => {
    try {
      assertGate(
        websocket.protocol === TAIL_PROTOCOL,
        "BLOCKED_TASK149_TAIL_PROTOCOL_INVALID",
      );
      websocket.send(
        JSON.stringify({ debug: false }),
        {
          binary: false,
          compress: false,
          fin: true,
          mask: false,
        },
        (error) => {
          if (error) {
            failWebsocket("BLOCKED_TASK149_TAIL_WEBSOCKET_FAILED");
          }
        },
      );
      sendHeartbeat();
      heartbeat = setInterval(
        sendHeartbeat,
        TAIL_HEARTBEAT_INTERVAL_MILLISECONDS,
      );
    } catch (error) {
      failWebsocket(
        error instanceof GateError
          ? error.code
          : "BLOCKED_TASK149_TAIL_WEBSOCKET_FAILED",
      );
    }
  });
  websocket.on("pong", (data) => {
    if (!heartbeatState.acceptPong(data)) return;
    if (!opened) {
      opened = true;
      resolveReady();
    }
  });
  websocket.on("message", (data) => {
    try {
      aggregator.acceptChunk(tailMessageChunk(data));
    } catch (error) {
      failureCode ||=
        error instanceof GateError
          ? error.code
          : "TASK149_TAIL_MESSAGE_INVALID";
    }
  });
  websocket.on("error", () => {
    failWebsocket("BLOCKED_TASK149_TAIL_WEBSOCKET_FAILED");
  });
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });
  websocket.on("close", () => {
    if (!closed) {
      if (!opened) {
        failureCode ||= "BLOCKED_TASK149_TAIL_CLOSED_BEFORE_READY";
        resolveReady();
      }
      closed = true;
      cancelHeartbeat();
      aggregator.finish();
      resolveDone();
    }
  });

  async function teardownCreatedTail() {
    cancelHeartbeat();
    if (!closed) {
      try {
        websocket.terminate();
      } catch {
        // The control-plane delete below is the authoritative teardown.
      }
    }
    let completed = (await waitForPromiseWithin(done, 5_000)).completed;
    await deleteTailOnce();
    if (!completed) {
      completed = (await waitForPromiseWithin(done, 5_000)).completed;
    }
    return completed && closed;
  }

  const readiness = await waitForPromiseWithin(
    ready,
    TAIL_CONNECTION_TIMEOUT_MILLISECONDS,
  );
  if (!readiness.completed || !opened || closed || failureCode) {
    assertGate(
      await teardownCreatedTail(),
      "BLOCKED_TASK149_TAIL_CLOSE_FAILED",
    );
    reject(failureCode || "BLOCKED_TASK149_TAIL_CONNECTION_TIMEOUT");
  }

  return {
    aggregator,
    cancelHeartbeat,
    config,
    deleteTailOnce,
    done,
    id: tailRecord.id,
    websocket,
    get closed() {
      return closed;
    },
    get failureCode() {
      return failureCode;
    },
  };
}

async function stopWranglerTail(tail) {
  if (tail.closed) {
    await tail.done;
    return;
  }
  await stopChildBoundedly(
    tail,
    "BLOCKED_TASK149_TAIL_ATTESTATION_STOP_FAILED",
  );
}

async function stopLiveTail(tail) {
  tail.cancelHeartbeat();
  if (!tail.closed) {
    try {
      tail.websocket.terminate();
    } catch {
      // The control-plane delete below is the authoritative teardown.
    }
  }
  let completed = (await waitForPromiseWithin(tail.done, 5_000)).completed;
  await tail.deleteTailOnce();
  if (!completed) {
    completed = (await waitForPromiseWithin(tail.done, 5_000)).completed;
  }
  assertGate(completed && tail.closed, "BLOCKED_TASK149_TAIL_CLOSE_FAILED");
}

async function waitForCondition(predicate, timeoutMilliseconds, code) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() <= deadline) {
    if (predicate()) return;
    await delay(100);
  }
  reject(code);
}

function parsePhaseSignal(value) {
  exactKeys(
    value,
    ["event", "observabilityWindowUtc", "requestCount"],
    "TASK149_HARNESS_PHASE_SIGNAL_INVALID",
  );
  assertGate(
    value.event === "TASK149_REQUEST_PHASE_COMPLETE",
    "TASK149_HARNESS_PHASE_SIGNAL_INVALID",
  );
  safeInteger(value.requestCount, "TASK149_HARNESS_PHASE_SIGNAL_INVALID", {
    positive: true,
  });
  exactKeys(
    value.observabilityWindowUtc,
    ["endedAt", "startedAt"],
    "TASK149_HARNESS_PHASE_SIGNAL_INVALID",
  );
  const startedAt = parseTimestamp(
    value.observabilityWindowUtc.startedAt,
    "TASK149_HARNESS_PHASE_SIGNAL_INVALID",
  );
  const endedAt = parseTimestamp(
    value.observabilityWindowUtc.endedAt,
    "TASK149_HARNESS_PHASE_SIGNAL_INVALID",
  );
  assertGate(startedAt <= endedAt, "TASK149_HARNESS_PHASE_SIGNAL_INVALID");
  return { ...value, endedAt, startedAt };
}

async function stopChildBoundedly(
  execution,
  failureCode,
  { graceMilliseconds = CHILD_STOP_GRACE_MILLISECONDS } = {},
) {
  assertGate(
    isRecord(execution) &&
      isRecord(execution.child) &&
      execution.done instanceof Promise &&
      typeof execution.child.kill === "function" &&
      /^[A-Z][A-Z0-9_]{2,100}$/.test(failureCode) &&
      Number.isSafeInteger(graceMilliseconds) &&
      graceMilliseconds > 0,
    failureCode,
  );
  for (const signal of ["SIGINT", "SIGTERM", "SIGKILL"]) {
    if (
      execution.child.exitCode === null &&
      execution.child.signalCode === null
    ) {
      try {
        execution.child.kill(signal);
      } catch {
        // The bounded wait and next escalation remain authoritative.
      }
    }
    const stopped = await waitForPromiseWithin(
      execution.done,
      graceMilliseconds,
    );
    if (stopped.completed) return stopped.value;
  }
  reject(failureCode);
}

async function waitForHarnessCompletion(harness) {
  assertGate(
    isRecord(harness) &&
      Number.isSafeInteger(harness.startedAt) &&
      harness.startedAt > 0,
    "BLOCKED_TASK149_HARNESS_TOTAL_TIMEOUT",
  );
  const remainingMilliseconds = Math.max(
    0,
    harness.startedAt + HARNESS_TOTAL_TIMEOUT_MILLISECONDS - Date.now(),
  );
  const completed = await waitForPromiseWithin(
    harness.done,
    remainingMilliseconds,
  );
  if (completed.completed) return completed.value;
  await stopChildBoundedly(harness, "BLOCKED_TASK149_HARNESS_STOP_FAILED");
  reject("BLOCKED_TASK149_HARNESS_TOTAL_TIMEOUT");
}

async function completeHarnessAfterTailTeardown(harness, tailStopError) {
  const harnessExecution = await waitForHarnessCompletion(harness);
  assertGate(
    isRecord(harnessExecution) &&
      harnessExecution.code === 0 &&
      harnessExecution.overflow === false &&
      (harnessExecution.signal === null ||
        harnessExecution.signal === undefined),
    "BLOCKED_TASK149_HARNESS_FAILED",
  );
  if (tailStopError) throw tailStopError;
  return harnessExecution;
}

function requestHarnessCooperativeAbort(harness) {
  assertGate(
    isRecord(harness) &&
      isRecord(harness.child) &&
      typeof harness.child.kill === "function",
    "BLOCKED_TASK149_HARNESS_ABORT_SIGNAL_FAILED",
  );
  if (harness.child.exitCode !== null || harness.child.signalCode !== null) {
    return false;
  }
  let signaled = false;
  try {
    signaled = harness.child.kill(HARNESS_COOPERATIVE_ABORT_SIGNAL);
  } catch {
    // The state check below remains authoritative.
  }
  assertGate(
    signaled ||
      harness.child.exitCode !== null ||
      harness.child.signalCode !== null,
    "BLOCKED_TASK149_HARNESS_ABORT_SIGNAL_FAILED",
  );
  return signaled;
}

function startHarness() {
  const environment = harnessEnvironment(process.env);
  const startedAt = Date.now();
  let stderrBuffer = "";
  let phaseSignal = null;
  let resolvePhase;
  const phase = new Promise((resolve) => {
    resolvePhase = resolve;
  });
  const execution = runChild(process.execPath, [HARNESS_SCRIPT], {
    onStderr(chunk) {
      if (phaseSignal) return;
      stderrBuffer += chunk.toString("utf8");
      if (Buffer.byteLength(stderrBuffer) > MAX_CHILD_OUTPUT_BYTES) {
        stderrBuffer = "";
        return;
      }
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.includes("TASK149_REQUEST_PHASE_COMPLETE")) continue;
        try {
          phaseSignal = parsePhaseSignal(JSON.parse(line));
          resolvePhase(phaseSignal);
        } catch {
          // The final result remains fail-closed if no exact signal arrives.
        }
      }
    },
    spawn: { env: environment },
  });
  return { ...execution, phase, startedAt };
}

function validateHarnessOutput(harness, phaseSignal) {
  exactKeys(
    harness,
    [
      "acceptance",
      "acceptanceComplete",
      "caseMarkers",
      "cleanup",
      "elapsedMilliseconds",
      "localChecksOk",
      "mode",
      "ok",
      "requiredExternalPostRun",
      "resourceStatus",
      "runMarker",
      "status",
      "target",
    ],
    "TASK149_HARNESS_SCHEMA_INVALID",
  );
  assertGate(
    harness.mode === "execution" &&
      harness.status === "PASS_LOCAL_AWAITING_EXTERNAL" &&
      harness.target === "staging" &&
      harness.localChecksOk === true &&
      harness.acceptanceComplete === false &&
      harness.ok === false &&
      RUN_MARKER_PATTERN.test(harness.runMarker),
    "TASK149_HARNESS_STATE_INVALID",
  );
  exactArray(
    harness.requiredExternalPostRun,
    REQUIRED_EXTERNAL_POST_RUN,
    "TASK149_HARNESS_EXTERNAL_GATES_INVALID",
  );
  exactArray(
    harness.caseMarkers,
    REQUIRED_HARNESS_CASE_MARKERS,
    "TASK149_HARNESS_MARKERS_INVALID",
  );
  exactKeys(
    harness.acceptance,
    REQUIRED_ACCEPTANCE_STEPS,
    "TASK149_HARNESS_ACCEPTANCE_INVALID",
  );
  for (const step of REQUIRED_ACCEPTANCE_STEPS) {
    assertGate(
      isRecord(harness.acceptance[step]) &&
        harness.acceptance[step].status === "PASS",
      "TASK149_HARNESS_ACCEPTANCE_INVALID",
    );
  }
  safeInteger(
    harness.acceptance.full_catalog_drain.pages,
    "TASK149_HARNESS_FULL_DRAIN_INVALID",
    { positive: true },
  );
  exactKeys(
    harness.cleanup,
    [
      "activeActorRows",
      "activeAuthActors",
      "auditRowsPreserved",
      "databaseResidualRows",
      "storageObjectsRemoved",
      "writeBudgetResidualRows",
    ],
    "TASK149_HARNESS_CLEANUP_INVALID",
  );
  for (const key of [
    "activeActorRows",
    "activeAuthActors",
    "databaseResidualRows",
    "writeBudgetResidualRows",
  ]) {
    assertGate(harness.cleanup[key] === 0, "TASK149_HARNESS_CLEANUP_INVALID");
  }
  safeInteger(
    harness.cleanup.auditRowsPreserved,
    "TASK149_HARNESS_CLEANUP_INVALID",
  );
  safeInteger(
    harness.cleanup.storageObjectsRemoved,
    "TASK149_HARNESS_CLEANUP_INVALID",
  );
  assertGate(
    isRecord(harness.resourceStatus) &&
      harness.resourceStatus.cloudflareCpuMemoryQuery ===
        "REQUIRED_EXTERNAL_POST_RUN" &&
      harness.resourceStatus.externalLogScan === "REQUIRED_EXTERNAL_POST_RUN" &&
      harness.resourceStatus.status503 === 0 &&
      harness.resourceStatus.serverErrors === 0 &&
      harness.resourceStatus.resourceFailures === 0 &&
      harness.resourceStatus.requestCount === phaseSignal.requestCount,
    "TASK149_HARNESS_RESOURCE_FAILURE",
  );
  assertGate(
    harness.resourceStatus.observabilityWindowUtc.startedAt ===
      phaseSignal.observabilityWindowUtc.startedAt &&
      harness.resourceStatus.observabilityWindowUtc.endedAt ===
        phaseSignal.observabilityWindowUtc.endedAt,
    "TASK149_HARNESS_WINDOW_INVALID",
  );
  return harness;
}

function validateTailCoverage(aggregator, harness, expectedRequestCount) {
  assertGate(
    !aggregator.failureCode,
    aggregator.failureCode || "TASK149_TAIL_FAILED",
  );
  assertGate(
    aggregator.events.size === expectedRequestCount,
    "TASK149_TAIL_COVERAGE_INCOMPLETE",
  );

  const harnessEvents = [];
  for (let sequence = 1; sequence <= expectedRequestCount; sequence += 1) {
    const event = aggregator.events.get(sequence);
    assertGate(event, "TASK149_TAIL_SEQUENCE_GAP");
    harnessEvents.push(event);
  }
  assertGate(
    [...aggregator.events.keys()].every(
      (sequence) => sequence >= 1 && sequence <= expectedRequestCount,
    ),
    "TASK149_TAIL_UNEXPECTED_EVENT",
  );

  const cold = harnessEvents.filter(
    (event) => event.label === "cold_candidate_intent",
  );
  assertGate(
    cold.length === 1 &&
      cold[0].route === "intent" &&
      harnessEvents[0] === cold[0],
    "TASK149_TAIL_COLD_CLASSIFICATION_INVALID",
  );
  const fullDrain = harnessEvents.filter((event) =>
    /^catalog_pull_baseline_[1-9]\d*$/.test(event.label),
  );
  const fullDrainPages = harness.acceptance.full_catalog_drain.pages;
  assertGate(
    fullDrain.length === fullDrainPages &&
      fullDrain.every((event) => event.route === "catalog") &&
      new Set(
        fullDrain.map((event) =>
          Number(event.label.slice("catalog_pull_baseline_".length)),
        ),
      ).size === fullDrainPages &&
      Array.from({ length: fullDrainPages }, (_, index) => index + 1).every(
        (page) =>
          fullDrain.some(
            (event) => event.label === `catalog_pull_baseline_${page}`,
          ),
      ),
    "TASK149_TAIL_FULL_DRAIN_COVERAGE_INVALID",
  );
  const warm = harnessEvents.filter(
    (event) =>
      event.label !== "cold_candidate_intent" &&
      !event.label.startsWith("catalog_pull_baseline_"),
  );
  assertGate(warm.length > 0, "TASK149_TAIL_WARM_CLASSIFICATION_INVALID");

  return {
    all: harnessEvents,
    cold,
    fullDrain,
    warm,
  };
}

function distribution(values, code) {
  assertGate(Array.isArray(values) && values.length > 0, code);
  const sorted = [...values].sort((left, right) => left - right);
  sorted.forEach((value) => finiteNonnegative(value, code));
  const percentile = (ratio) =>
    sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
  return {
    p50: percentile(0.5),
    p90: percentile(0.9),
    p99: percentile(0.99),
    p999: percentile(0.999),
    max: sorted.at(-1),
  };
}

function validateDistribution(value, code, { memory = false } = {}) {
  exactKeys(value, ["max", "p50", "p90", "p99", "p999"], code);
  const ordered = ["p50", "p90", "p99", "p999", "max"];
  ordered.forEach((key) => finiteNonnegative(value[key], code));
  assertGate(
    ordered.every(
      (key, index) => index === 0 || value[ordered[index - 1]] <= value[key],
    ),
    code,
  );
  if (memory) {
    assertGate(
      ordered.every((key) => value[key] < MEMORY_LIMIT_BYTES),
      "TASK149_MEMORY_LIMIT_EXCEEDED",
    );
  }
}

const GRAPHQL_QUERY = `
query Task149LiveResourceGate(
  $accountTag: String!
  $filter: AccountWorkersInvocationsAdaptiveFilter_InputObject!
) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersInvocationsAdaptive(limit: 100, filter: $filter) {
        dimensions {
          environmentName
          scriptName
          scriptVersion
          status
        }
        max {
          cpuTime
          memoryUsageBytes
        }
        quantiles {
          cpuTimeP50
          cpuTimeP90
          cpuTimeP99
          cpuTimeP999
          memoryUsageBytesP50
          memoryUsageBytesP90
          memoryUsageBytesP99
          memoryUsageBytesP999
        }
        sum {
          errors
          requests
        }
      }
    }
  }
}`;

function validateGraphqlResult(payload, deployment, exactTailCount) {
  assertGate(
    isRecord(payload) &&
      (!Object.hasOwn(payload, "errors") || payload.errors === null) &&
      Array.isArray(payload.data?.viewer?.accounts) &&
      payload.data.viewer.accounts.length === 1,
    "TASK149_GRAPHQL_RESPONSE_INVALID",
  );
  const rows = payload.data.viewer.accounts[0]?.workersInvocationsAdaptive;
  assertGate(
    Array.isArray(rows) && rows.length === 1,
    "TASK149_GRAPHQL_COVERAGE_INVALID",
  );
  const row = rows[0];
  assertGate(
    row.dimensions?.scriptName === EXPECTED_WORKER_NAME &&
      row.dimensions?.scriptVersion === deployment.versionId &&
      row.dimensions?.status === "success" &&
      Number.isSafeInteger(row.sum?.requests) &&
      row.sum.requests >= exactTailCount &&
      row.sum?.errors === 0,
    "TASK149_GRAPHQL_RESOURCE_FAILURE",
  );
  const cpu = {
    max: row.max?.cpuTime,
    p50: row.quantiles?.cpuTimeP50,
    p90: row.quantiles?.cpuTimeP90,
    p99: row.quantiles?.cpuTimeP99,
    p999: row.quantiles?.cpuTimeP999,
  };
  const memory = {
    max: row.max?.memoryUsageBytes,
    p50: row.quantiles?.memoryUsageBytesP50,
    p90: row.quantiles?.memoryUsageBytesP90,
    p99: row.quantiles?.memoryUsageBytesP99,
    p999: row.quantiles?.memoryUsageBytesP999,
  };
  validateDistribution(cpu, "TASK149_GRAPHQL_CPU_INVALID");
  validateDistribution(memory, "TASK149_GRAPHQL_MEMORY_INVALID", {
    memory: true,
  });
  return {
    cpu,
    environmentName: row.dimensions.environmentName,
    errors: row.sum.errors,
    memory,
    requests: row.sum.requests,
  };
}

async function queryLiveGraphql(config, deployment, window, exactTailCount) {
  const variables = {
    accountTag: config.accountId,
    filter: {
      datetime_geq: new Date(window.startedAt - 1_000).toISOString(),
      datetime_leq: new Date(window.endedAt + 1_000).toISOString(),
      scriptName: EXPECTED_WORKER_NAME,
      scriptVersion: deployment.versionId,
    },
  };

  for (let attempt = 1; attempt <= GRAPHQL_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(GRAPHQL_ENDPOINT, {
        body: JSON.stringify({ query: GRAPHQL_QUERY, variables }),
        headers: {
          authorization: `Bearer ${config.apiToken}`,
          "content-type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) {
        const serialized = await response.text();
        if (Buffer.byteLength(serialized) <= MAX_CHILD_OUTPUT_BYTES) {
          const result = validateGraphqlResult(
            parseJson(serialized, "TASK149_GRAPHQL_RESPONSE_INVALID"),
            deployment,
            exactTailCount,
          );
          return result;
        }
      } else {
        await response.body?.cancel();
      }
    } catch {
      // Retry boundedly for analytics ingestion/transient API availability.
    }
    if (attempt < GRAPHQL_ATTEMPTS) {
      await delay(GRAPHQL_RETRY_MILLISECONDS);
    }
  }
  reject("BLOCKED_TASK149_GRAPHQL_LIVE_EVIDENCE_UNAVAILABLE");
}

function eventWindow(events) {
  const timestamps = events.map((event) => event.timestamp);
  assertGate(timestamps.length > 0, "TASK149_TAIL_WINDOW_INVALID");
  return {
    endedAt: Math.max(...timestamps),
    startedAt: Math.min(...timestamps),
  };
}

function redactedResult({
  aggregator,
  caseMarkers,
  deployment,
  graphql,
  groups,
  runMarker,
}) {
  const cpu = (events) =>
    distribution(
      events.map((event) => event.cpuMicroseconds),
      "TASK149_TAIL_CPU_INVALID",
    );
  const tailCoverageMaterial = [...aggregator.events.entries()]
    .sort(([left], [right]) => left - right)
    .map(
      ([sequence, event]) =>
        `${sequence}:${event.label}:${event.status}:${event.cpuMicroseconds}`,
    )
    .join("|");
  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    status: "PASS",
    caseMarkers,
    digests: {
      deploymentIdSha256: sha256(deployment.deploymentId),
      runMarkerSha256: sha256(runMarker),
      tailCoverageSha256: sha256(tailCoverageMaterial),
      versionIdSha256: sha256(deployment.versionId),
    },
    counts: {
      catalogFullDrainInvocations: groups.fullDrain.length,
      coldInvocations: groups.cold.length,
      correlatedTailEvents: groups.all.length,
      diagnosticsChannelEventsScanned: aggregator.diagnosticsChannelEventCount,
      errors: graphql.errors,
      exceptions: 0,
      forbiddenDiagnosticMatches: 0,
      forbiddenLogMatches: 0,
      graphqlRequests: graphql.requests,
      logRecordsScanned: aggregator.logRecordCount,
      warmInvocations: groups.warm.length,
    },
    percentiles: {
      graphql: {
        cpuTime: graphql.cpu,
        memoryUsageBytes: graphql.memory,
      },
      tailCpuMicroseconds: {
        catalogFullDrain: cpu(groups.fullDrain),
        cold: cpu(groups.cold),
        overall: cpu(groups.all),
        warm: cpu(groups.warm),
      },
    },
  };
}

function markCase(tracker, marker) {
  assertGate(
    FINAL_CASE_MARKERS.includes(marker) &&
      !tracker.caseMarkers.includes(marker),
    "TASK149_RESULT_MARKER_INVALID",
  );
  tracker.caseMarkers.push(marker);
}

function syntheticTailEvent({
  cpuTime = 1,
  label,
  marker,
  origin,
  sequence,
  versionId,
}) {
  return {
    cpuTime,
    event: {
      request: {
        headers: {
          [REQUEST_LABEL_HEADER]: label,
          [REQUEST_SEQUENCE_HEADER]: String(sequence),
          [RUN_MARKER_HEADER]: marker,
        },
        method: "POST",
        url: `${origin}${
          label.startsWith("catalog_pull_")
            ? "/api/pos/catalog/pull"
            : "/api/pos/catalog/product-images/intent"
        }`,
      },
      response: { status: 400 },
    },
    diagnosticsChannelEvents: [],
    eventTimestamp: Date.now() + sequence,
    exceptions: [],
    logs: [],
    outcome: "ok",
    scriptName: EXPECTED_WORKER_NAME,
    scriptVersion: { id: versionId },
    truncated: false,
    wallTime: 2,
  };
}

async function runSelfTest() {
  const marker = "TASK149_SELF01";
  const versionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const origin = "https://task149-staging.example.invalid";
  const aggregator = createTailAggregator({
    expectedOrigin: origin,
    expectedVersionId: versionId,
    runMarker: marker,
  });
  const serializedEvents = [
    [1, "cold_candidate_intent"],
    [2, "catalog_pull_baseline_1"],
    [3, "intent_first"],
  ]
    .map(([sequence, label]) => {
      const event = syntheticTailEvent({
        cpuTime: sequence === 1 ? 1.5 : 1,
        label,
        marker,
        origin,
        sequence,
        versionId,
      });
      if (sequence === 1) {
        event.diagnosticsChannelEvents = [
          { channel: "task149", message: ["safe { structured } diagnostic"] },
        ];
      }
      return JSON.stringify(event, null, 2);
    })
    .join("");
  for (
    let offset = 0, chunkSize = 1;
    offset < serializedEvents.length;
    chunkSize = chunkSize === 17 ? 1 : chunkSize + 1
  ) {
    aggregator.acceptChunk(serializedEvents.slice(offset, offset + chunkSize));
    offset += chunkSize;
  }
  aggregator.finish();
  const harness = {
    acceptance: { full_catalog_drain: { pages: 1 } },
  };
  const groups = validateTailCoverage(aggregator, harness, 3);
  assertGate(
    groups.cold.length === 1 &&
      groups.fullDrain.length === 1 &&
      groups.warm.length === 1 &&
      groups.cold[0].cpuMicroseconds === 1_500 &&
      aggregator.diagnosticsChannelEventCount === 1,
    "TASK149_SELF_TEST_FAILED",
  );

  const syntheticParentEnvironment = {
    CLOUDFLARE_ACCOUNT_ID: "parent-account-must-not-flow",
    CLOUDFLARE_API_TOKEN: "parent-token-must-not-flow",
    NEXT_PUBLIC_SUPABASE_URL: "https://staging.supabase.co",
    PATH: "/usr/bin:/bin",
    SUPABASE_SERVICE_ROLE_KEY: "sensitive-parent-value",
    TASK149_POS_IMAGE_E2E_RUN_ID: "SELF01",
    TEST_TARGET: "staging",
    UNRELATED_SECRET: "must-not-flow",
  };
  const isolatedWranglerEnvironment = wranglerEnvironment(
    {
      accountId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      apiToken: "scoped-cloudflare-token",
    },
    syntheticParentEnvironment,
  );
  const isolatedHarnessEnvironment = harnessEnvironment(
    syntheticParentEnvironment,
  );
  const inheritsServiceRole = Object.hasOwn(
    isolatedWranglerEnvironment,
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  const harnessUsesExplicitAllowlist =
    Object.keys(isolatedHarnessEnvironment).every((key) =>
      HARNESS_ENVIRONMENT_KEYS.includes(key),
    ) &&
    isolatedHarnessEnvironment.SUPABASE_SERVICE_ROLE_KEY ===
      syntheticParentEnvironment.SUPABASE_SERVICE_ROLE_KEY &&
    !Object.hasOwn(isolatedHarnessEnvironment, "CLOUDFLARE_API_TOKEN") &&
    !Object.hasOwn(isolatedHarnessEnvironment, "UNRELATED_SECRET") &&
    isolatedWranglerEnvironment.CLOUDFLARE_API_TOKEN ===
      "scoped-cloudflare-token" &&
    !Object.hasOwn(isolatedWranglerEnvironment, "UNRELATED_SECRET");
  assertGate(
    inheritsServiceRole === false && harnessUsesExplicitAllowlist,
    "TASK149_SELF_TEST_FAILED",
  );

  const selfTestWindow = {
    endedAt: "2026-07-30T00:00:03.000Z",
    startedAt: "2026-07-30T00:00:00.000Z",
  };
  const selfTestPhaseSignal = {
    observabilityWindowUtc: selfTestWindow,
    requestCount: 3,
  };
  const selfTestAcceptance = Object.fromEntries(
    REQUIRED_ACCEPTANCE_STEPS.map((step) => [step, { status: "PASS" }]),
  );
  selfTestAcceptance.full_catalog_drain = { pages: 1, status: "PASS" };
  const selfTestHarness = {
    acceptance: selfTestAcceptance,
    acceptanceComplete: false,
    caseMarkers: [...REQUIRED_HARNESS_CASE_MARKERS],
    cleanup: {
      activeActorRows: 0,
      activeAuthActors: 0,
      auditRowsPreserved: 1,
      databaseResidualRows: 0,
      storageObjectsRemoved: 1,
      writeBudgetResidualRows: 0,
    },
    elapsedMilliseconds: 1,
    localChecksOk: true,
    mode: "execution",
    ok: false,
    requiredExternalPostRun: [...REQUIRED_EXTERNAL_POST_RUN],
    resourceStatus: {
      cloudflareCpuMemoryQuery: "REQUIRED_EXTERNAL_POST_RUN",
      externalLogScan: "REQUIRED_EXTERNAL_POST_RUN",
      observabilityWindowUtc: selfTestWindow,
      requestCount: 3,
      resourceFailures: 0,
      serverErrors: 0,
      status503: 0,
    },
    runMarker: marker,
    status: "PASS_LOCAL_AWAITING_EXTERNAL",
    target: "staging",
  };
  validateHarnessOutput(selfTestHarness, selfTestPhaseSignal);
  let activeAuthActorResidualRejected = false;
  try {
    validateHarnessOutput(
      {
        ...selfTestHarness,
        cleanup: {
          ...selfTestHarness.cleanup,
          activeAuthActors: 1,
        },
      },
      selfTestPhaseSignal,
    );
  } catch {
    activeAuthActorResidualRejected = true;
  }
  assertGate(activeAuthActorResidualRejected, "TASK149_SELF_TEST_FAILED");

  const truncatedJson = createTailAggregator({
    expectedOrigin: origin,
    expectedVersionId: versionId,
    runMarker: marker,
  });
  truncatedJson.acceptChunk('{\n  "cpuTime": 1,\n  "event": {');
  truncatedJson.finish();
  const truncatedJsonRejected =
    truncatedJson.failureCode === "TASK149_TAIL_JSON_INCOMPLETE";

  const nonJson = createTailAggregator({
    expectedOrigin: origin,
    expectedVersionId: versionId,
    runMarker: marker,
  });
  nonJson.acceptChunk("not-json");
  nonJson.finish();
  const nonJsonRejected = nonJson.failureCode === "TASK149_TAIL_JSON_INVALID";

  const malformedJson = createTailAggregator({
    expectedOrigin: origin,
    expectedVersionId: versionId,
    runMarker: marker,
  });
  malformedJson.acceptChunk('{"cpuTime": nope}');
  malformedJson.finish();
  const malformedJsonRejected =
    malformedJson.failureCode === "TASK149_TAIL_JSON_INVALID";
  const parserFailClosed =
    truncatedJsonRejected && nonJsonRejected && malformedJsonRejected;
  assertGate(parserFailClosed, "TASK149_SELF_TEST_FAILED");

  const excessiveCpu = createTailAggregator({
    expectedOrigin: origin,
    expectedVersionId: versionId,
    runMarker: marker,
  });
  excessiveCpu.acceptObject(
    syntheticTailEvent({
      cpuTime: MAX_TAIL_CPU_MILLISECONDS + 1,
      label: "cold_candidate_intent",
      marker,
      origin,
      sequence: 1,
      versionId,
    }),
  );
  assertGate(
    excessiveCpu.failureCode === "TASK149_TAIL_CPU_INVALID",
    "TASK149_SELF_TEST_FAILED",
  );

  const omittedDiagnostic = createTailAggregator({
    expectedOrigin: origin,
    expectedVersionId: versionId,
    runMarker: marker,
  });
  const omittedDiagnosticEvent = syntheticTailEvent({
    label: "cold_candidate_intent",
    marker,
    origin,
    sequence: 1,
    versionId,
  });
  delete omittedDiagnosticEvent.diagnosticsChannelEvents;
  omittedDiagnostic.acceptObject(omittedDiagnosticEvent);
  assertGate(
    !omittedDiagnostic.failureCode &&
      omittedDiagnostic.events.size === 1 &&
      omittedDiagnostic.diagnosticsChannelEventCount === 0,
    "TASK149_SELF_TEST_FAILED",
  );

  const incomplete = createTailAggregator({
    expectedOrigin: origin,
    expectedVersionId: versionId,
    runMarker: marker,
  });
  incomplete.acceptObject(
    syntheticTailEvent({
      label: "cold_candidate_intent",
      marker,
      origin,
      sequence: 1,
      versionId,
    }),
  );
  let incompleteRejected = false;
  try {
    validateTailCoverage(incomplete, harness, 3);
  } catch {
    incompleteRejected = true;
  }
  const coverageFailClosed = incompleteRejected;
  assertGate(coverageFailClosed, "TASK149_SELF_TEST_FAILED");

  const forbidden = createTailAggregator({
    expectedOrigin: origin,
    expectedVersionId: versionId,
    runMarker: marker,
  });
  const forbiddenEvent = syntheticTailEvent({
    label: "cold_candidate_intent",
    marker,
    origin,
    sequence: 1,
    versionId,
  });
  forbiddenEvent.logs = [{ message: ["https://example.invalid/?token=x"] }];
  forbidden.acceptObject(forbiddenEvent);
  const forbiddenLogRejected =
    forbidden.failureCode ===
    "TASK149_TAIL_LOG_EXCEPTION_OR_DIAGNOSTIC_FAILURE";
  assertGate(forbiddenLogRejected, "TASK149_SELF_TEST_FAILED");

  const forbiddenKey = createTailAggregator({
    expectedOrigin: origin,
    expectedVersionId: versionId,
    runMarker: marker,
  });
  const forbiddenKeyEvent = syntheticTailEvent({
    label: "cold_candidate_intent",
    marker,
    origin,
    sequence: 1,
    versionId,
  });
  forbiddenKeyEvent.logs = [{ accessToken: "opaque" }];
  forbiddenKey.acceptObject(forbiddenKeyEvent);
  const forbiddenKeyRejected =
    forbiddenKey.failureCode ===
    "TASK149_TAIL_LOG_EXCEPTION_OR_DIAGNOSTIC_FAILURE";
  assertGate(forbiddenKeyRejected, "TASK149_SELF_TEST_FAILED");

  const forbiddenUrlKey = createTailAggregator({
    expectedOrigin: origin,
    expectedVersionId: versionId,
    runMarker: marker,
  });
  const forbiddenUrlKeyEvent = syntheticTailEvent({
    label: "cold_candidate_intent",
    marker,
    origin,
    sequence: 1,
    versionId,
  });
  forbiddenUrlKeyEvent.diagnosticsChannelEvents = [
    { "https://example.invalid/signed": "opaque" },
  ];
  forbiddenUrlKey.acceptObject(forbiddenUrlKeyEvent);
  const forbiddenUrlKeyRejected =
    forbiddenUrlKey.failureCode ===
    "TASK149_TAIL_LOG_EXCEPTION_OR_DIAGNOSTIC_FAILURE";
  assertGate(forbiddenUrlKeyRejected, "TASK149_SELF_TEST_FAILED");

  const canonicalMainPath =
    "shops/00000000-0000-4000-8000-000000000001/products/00000000-0000-4000-8000-000000000002/primary/00000000-0000-4000-8000-000000000003/main.jpg";
  const forbiddenStorageLog = createTailAggregator({
    expectedOrigin: origin,
    expectedVersionId: versionId,
    runMarker: marker,
  });
  const forbiddenStorageLogEvent = syntheticTailEvent({
    label: "cold_candidate_intent",
    marker,
    origin,
    sequence: 1,
    versionId,
  });
  forbiddenStorageLogEvent.logs = [{ message: [canonicalMainPath] }];
  forbiddenStorageLog.acceptObject(forbiddenStorageLogEvent);
  const forbiddenStorageLogRejected =
    forbiddenStorageLog.failureCode ===
    "TASK149_TAIL_LOG_EXCEPTION_OR_DIAGNOSTIC_FAILURE";
  assertGate(forbiddenStorageLogRejected, "TASK149_SELF_TEST_FAILED");

  const forbiddenStorageDiagnostic = createTailAggregator({
    expectedOrigin: origin,
    expectedVersionId: versionId,
    runMarker: marker,
  });
  const forbiddenStorageDiagnosticEvent = syntheticTailEvent({
    label: "cold_candidate_intent",
    marker,
    origin,
    sequence: 1,
    versionId,
  });
  forbiddenStorageDiagnosticEvent.diagnosticsChannelEvents = [
    { message: [canonicalMainPath.replace("/main.jpg", "/thumb.jpg")] },
  ];
  forbiddenStorageDiagnostic.acceptObject(forbiddenStorageDiagnosticEvent);
  const forbiddenStorageDiagnosticRejected =
    forbiddenStorageDiagnostic.failureCode ===
    "TASK149_TAIL_LOG_EXCEPTION_OR_DIAGNOSTIC_FAILURE";
  assertGate(forbiddenStorageDiagnosticRejected, "TASK149_SELF_TEST_FAILED");

  const forbiddenDiagnostic = createTailAggregator({
    expectedOrigin: origin,
    expectedVersionId: versionId,
    runMarker: marker,
  });
  const forbiddenDiagnosticEvent = syntheticTailEvent({
    label: "cold_candidate_intent",
    marker,
    origin,
    sequence: 1,
    versionId,
  });
  forbiddenDiagnosticEvent.diagnosticsChannelEvents = [
    { message: ["mcpos_session_forbidden"] },
  ];
  forbiddenDiagnostic.acceptObject(forbiddenDiagnosticEvent);
  const forbiddenDiagnosticRejected =
    forbiddenDiagnostic.failureCode ===
    "TASK149_TAIL_LOG_EXCEPTION_OR_DIAGNOSTIC_FAILURE";
  assertGate(forbiddenDiagnosticRejected, "TASK149_SELF_TEST_FAILED");

  const connectionDiagnostic = createProcessDiagnosticScanner({
    expectedConnectionDiagnostic: TAIL_CONNECTED_DIAGNOSTIC,
  });
  const connectionMaterial = [
    "Wrangler control-plane attestation\n",
    `${TAIL_CONNECTED_DIAGNOSTIC}\n`,
  ].join("");
  for (let offset = 0; offset < connectionMaterial.length; offset += 7) {
    connectionDiagnostic.acceptChunk(
      "stdout",
      Buffer.from(connectionMaterial.slice(offset, offset + 7)),
    );
  }
  connectionDiagnostic.finish();
  assertGate(
    connectionDiagnostic.connected &&
      connectionDiagnostic.connectionDiagnosticCount === 1 &&
      !connectionDiagnostic.failureCode,
    "TASK149_SELF_TEST_FAILED",
  );

  const leakingProcessDiagnostic = createProcessDiagnosticScanner();
  leakingProcessDiagnostic.acceptChunk(
    "stderr",
    Buffer.from("diagnostic bearer forbidden-value\n"),
  );
  leakingProcessDiagnostic.finish();
  const leakingProcessDiagnosticRejected =
    leakingProcessDiagnostic.failureCode ===
    "TASK149_TAIL_PROCESS_DIAGNOSTIC_LEAK";

  const escapedUrlProcessDiagnostic = createProcessDiagnosticScanner();
  escapedUrlProcessDiagnostic.acceptChunk(
    "stderr",
    Buffer.from(
      `${String.raw`{"detail":"https:\/\/example.invalid\/signed"}`}\n`,
    ),
  );
  escapedUrlProcessDiagnostic.finish();
  const escapedUrlProcessDiagnosticRejected =
    escapedUrlProcessDiagnostic.failureCode ===
    "TASK149_TAIL_PROCESS_DIAGNOSTIC_LEAK";

  const escapedPathProcessDiagnostic = createProcessDiagnosticScanner();
  escapedPathProcessDiagnostic.acceptChunk(
    "stderr",
    Buffer.from(
      `${String.raw`{"detail":"shops\/00000000-0000-4000-8000-000000000001\/products\/00000000-0000-4000-8000-000000000002\/primary\/00000000-0000-4000-8000-000000000003\/thumb.jpg"}`}\n`,
    ),
  );
  escapedPathProcessDiagnostic.finish();
  const escapedPathProcessDiagnosticRejected =
    escapedPathProcessDiagnostic.failureCode ===
    "TASK149_TAIL_PROCESS_DIAGNOSTIC_LEAK";

  const benignProcessDiagnostic = createProcessDiagnosticScanner();
  benignProcessDiagnostic.acceptChunk(
    "stderr",
    Buffer.from('{"route":"shops-list","state":"https-status-ok"}\n'),
  );
  benignProcessDiagnostic.finish();
  const benignProcessDiagnosticAccepted =
    benignProcessDiagnostic.failureCode === "";

  const logScanFailClosed =
    forbiddenLogRejected &&
    forbiddenKeyRejected &&
    forbiddenUrlKeyRejected &&
    forbiddenStorageLogRejected &&
    forbiddenStorageDiagnosticRejected &&
    forbiddenDiagnosticRejected &&
    leakingProcessDiagnosticRejected &&
    escapedUrlProcessDiagnosticRejected &&
    escapedPathProcessDiagnosticRejected &&
    benignProcessDiagnosticAccepted;
  assertGate(logScanFailClosed, "TASK149_SELF_TEST_FAILED");

  let deploymentRejected = false;
  try {
    validateDeploymentStatus({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      versions: [{ percentage: 99, version_id: versionId }],
    });
  } catch {
    deploymentRejected = true;
  }
  const deploymentFailClosed = deploymentRejected;
  assertGate(deploymentFailClosed, "TASK149_SELF_TEST_FAILED");

  const tailRecordNow = Date.parse("2026-07-30T12:00:00.000Z");
  const validTailRecord = validateLiveTailRecord(
    {
      expires_at: new Date(
        tailRecordNow + TAIL_MINIMUM_REMAINING_MILLISECONDS + 1,
      ).toISOString(),
      id: "tail-record-0001",
      url: `wss://${TAIL_WEBSOCKET_HOSTNAME}/opaque?capability=synthetic`,
    },
    tailRecordNow,
  );
  let invalidTailHostRejected = false;
  let insufficientTailExpiryRejected = false;
  try {
    validateLiveTailRecord(
      {
        expires_at: new Date(
          tailRecordNow + TAIL_MINIMUM_REMAINING_MILLISECONDS + 1,
        ).toISOString(),
        id: "tail-record-0002",
        url: "wss://example.invalid/opaque?capability=synthetic",
      },
      tailRecordNow,
    );
  } catch {
    invalidTailHostRejected = true;
  }
  try {
    validateLiveTailRecord(
      {
        expires_at: new Date(
          tailRecordNow + TAIL_MINIMUM_REMAINING_MILLISECONDS - 1,
        ).toISOString(),
        id: "tail-record-0003",
        url: `wss://${TAIL_WEBSOCKET_HOSTNAME}/opaque?capability=synthetic`,
      },
      tailRecordNow,
    );
  } catch {
    insufficientTailExpiryRejected = true;
  }
  const controlPlaneFailClosed =
    validTailRecord.id === "tail-record-0001" &&
    validTailRecord.websocketUrl.hostname === TAIL_WEBSOCKET_HOSTNAME &&
    invalidTailHostRejected &&
    insufficientTailExpiryRejected;
  assertGate(controlPlaneFailClosed, "TASK149_SELF_TEST_FAILED");

  const heartbeatState = createTailHeartbeatState();
  const firstPingAccepted = heartbeatState.beginPing();
  const duplicatePingRejected = !heartbeatState.beginPing();
  const unrelatedPongIgnored = !heartbeatState.acceptPong(
    Buffer.from("unrelated-pong"),
  );
  const matchingPongAccepted = heartbeatState.acceptPong(TAIL_READINESS_PING);
  const heartbeatRecovered =
    !heartbeatState.waitingForPong && heartbeatState.beginPing();
  const heartbeatFailClosed =
    firstPingAccepted &&
    duplicatePingRejected &&
    unrelatedPongIgnored &&
    matchingPongAccepted &&
    heartbeatRecovered;
  assertGate(heartbeatFailClosed, "TASK149_SELF_TEST_FAILED");

  const cooperativeAbortSignals = [];
  const cooperativeAbortRequested = requestHarnessCooperativeAbort({
    child: {
      exitCode: null,
      signalCode: null,
      kill(signal) {
        cooperativeAbortSignals.push(signal);
        return true;
      },
    },
  });

  let resolveEscalatedChild;
  const escalationSignals = [];
  const escalatedChild = {
    exitCode: null,
    signalCode: null,
    kill(signal) {
      escalationSignals.push(signal);
      if (signal === "SIGTERM") {
        this.signalCode = signal;
        resolveEscalatedChild({
          code: null,
          overflow: false,
          signal,
          stdout: "",
        });
      }
      return true;
    },
  };
  const escalatedDone = new Promise((resolve) => {
    resolveEscalatedChild = resolve;
  });
  await stopChildBoundedly(
    { child: escalatedChild, done: escalatedDone },
    "TASK149_SELF_TEST_FAILED",
    { graceMilliseconds: 1 },
  );

  let resolveTimedOutChild;
  const timeoutSignals = [];
  const timedOutChild = {
    exitCode: null,
    signalCode: null,
    kill(signal) {
      timeoutSignals.push(signal);
      this.signalCode = signal;
      resolveTimedOutChild({
        code: null,
        overflow: false,
        signal,
        stdout: "",
      });
      return true;
    },
  };
  const timedOutDone = new Promise((resolve) => {
    resolveTimedOutChild = resolve;
  });
  let harnessTimeoutRejected = false;
  const syntheticTailStopError = new GateError(
    "BLOCKED_TASK149_TAIL_CLOSE_FAILED",
  );
  try {
    await completeHarnessAfterTailTeardown(
      {
        child: timedOutChild,
        done: timedOutDone,
        startedAt: Date.now() - HARNESS_TOTAL_TIMEOUT_MILLISECONDS - 1,
      },
      syntheticTailStopError,
    );
  } catch (error) {
    harnessTimeoutRejected =
      error instanceof GateError &&
      error.code === "BLOCKED_TASK149_HARNESS_TOTAL_TIMEOUT";
  }
  let tailStopErrorPreserved = false;
  try {
    await completeHarnessAfterTailTeardown(
      {
        child: timedOutChild,
        done: Promise.resolve({
          code: 0,
          overflow: false,
          signal: null,
          stdout: "",
        }),
        startedAt: Date.now(),
      },
      syntheticTailStopError,
    );
  } catch (error) {
    tailStopErrorPreserved = error === syntheticTailStopError;
  }
  const harnessLifecycleFailClosed =
    cooperativeAbortRequested &&
    cooperativeAbortSignals.join(",") === HARNESS_COOPERATIVE_ABORT_SIGNAL &&
    escalationSignals.join(",") === "SIGINT,SIGTERM" &&
    timeoutSignals.join(",") === "SIGINT" &&
    harnessTimeoutRejected &&
    tailStopErrorPreserved;
  assertGate(harnessLifecycleFailClosed, "TASK149_SELF_TEST_FAILED");

  return {
    environmentIsolation: {
      harnessUsesExplicitAllowlist,
      inheritsServiceRole,
    },
    schemaVersion: RESULT_SCHEMA_VERSION,
    status: "PASS_SELF_TEST_NO_LIVE_EVIDENCE",
    validators: {
      controlPlaneFailClosed,
      coverageFailClosed,
      deploymentFailClosed,
      harnessLifecycleFailClosed,
      heartbeatFailClosed,
      logScanFailClosed,
      parserFailClosed,
    },
  };
}

async function runLiveGate() {
  const config = liveConfiguration();
  const beforeDeployment = await liveDeploymentStatus(config);
  await attestTailConnection(config, beforeDeployment);
  const tail = await createLiveTail(config, beforeDeployment);
  let harness = null;
  let phaseSignal = null;
  let phaseError = null;
  let tailStopError = null;

  try {
    assertGate(
      !tail.closed && !tail.failureCode,
      "BLOCKED_TASK149_TAIL_UNAVAILABLE",
    );

    harness = startHarness();
    const phaseTimeout = new AbortController();
    let phaseOutcome;
    try {
      phaseOutcome = await Promise.race([
        harness.phase.then((value) => ({ type: "phase", value })),
        harness.done.then((value) => ({ type: "done", value })),
        delay(
          REQUEST_PHASE_TIMEOUT_MILLISECONDS,
          { type: "timeout", value: null },
          { signal: phaseTimeout.signal },
        ),
      ]);
    } finally {
      phaseTimeout.abort();
    }
    if (phaseOutcome.type === "timeout") {
      phaseError = new GateError(
        "BLOCKED_TASK149_HARNESS_REQUEST_PHASE_TIMEOUT",
      );
      try {
        requestHarnessCooperativeAbort(harness);
      } catch (error) {
        phaseError = error;
      }
    } else if (phaseOutcome.type !== "phase") {
      phaseError = new GateError(
        "BLOCKED_TASK149_HARNESS_REQUEST_PHASE_INCOMPLETE",
      );
    } else {
      phaseSignal = phaseOutcome.value;
      try {
        await waitForCondition(
          () =>
            tail.aggregator.events.size >= phaseSignal.requestCount ||
            Boolean(tail.aggregator.failureCode) ||
            Boolean(tail.failureCode) ||
            tail.closed,
          TAIL_DELIVERY_TIMEOUT_MILLISECONDS,
          "BLOCKED_TASK149_TAIL_COVERAGE_INCOMPLETE",
        );
        assertGate(
          !tail.closed &&
            !tail.aggregator.failureCode &&
            !tail.failureCode &&
            tail.aggregator.events.size === phaseSignal.requestCount,
          tail.aggregator.failureCode ||
            tail.failureCode ||
            "BLOCKED_TASK149_TAIL_COVERAGE_INCOMPLETE",
        );
      } catch (error) {
        phaseError = error;
      }
    }
  } finally {
    try {
      await stopLiveTail(tail);
    } catch (error) {
      tailStopError = error;
    }
  }

  if (!harness) {
    if (tailStopError) throw tailStopError;
    reject("BLOCKED_TASK149_HARNESS_NOT_STARTED");
  }
  const harnessExecution = await completeHarnessAfterTailTeardown(
    harness,
    tailStopError,
  );
  assertGate(
    !tail.failureCode,
    tail.failureCode || "BLOCKED_TASK149_TAIL_WEBSOCKET_FAILED",
  );
  if (phaseError && !phaseSignal) throw phaseError;
  assertGate(
    phaseSignal &&
      harnessExecution.code === 0 &&
      harnessExecution.overflow === false,
    "BLOCKED_TASK149_HARNESS_FAILED",
  );
  const harnessOutput = validateHarnessOutput(
    parseJson(harnessExecution.stdout.trim(), "TASK149_HARNESS_OUTPUT_INVALID"),
    phaseSignal,
  );
  assertGate(
    harnessOutput.runMarker === config.runMarker,
    "TASK149_HARNESS_RUN_MARKER_MISMATCH",
  );
  if (phaseError) throw phaseError;
  const groups = validateTailCoverage(
    tail.aggregator,
    harnessOutput,
    phaseSignal.requestCount,
  );

  const afterDeployment = await liveDeploymentStatus(config);
  assertGate(
    afterDeployment.deploymentId === beforeDeployment.deploymentId &&
      afterDeployment.versionId === beforeDeployment.versionId,
    "BLOCKED_TASK149_DEPLOYMENT_CHANGED_DURING_RUN",
  );

  const graphql = await queryLiveGraphql(
    config,
    beforeDeployment,
    eventWindow(groups.all),
    phaseSignal.requestCount,
  );
  const tracker = { caseMarkers: [] };
  markCase(tracker, "TASK149_CASE_46");
  markCase(tracker, "TASK149_CASE_48");
  exactArray(
    tracker.caseMarkers,
    FINAL_CASE_MARKERS,
    "TASK149_RESULT_MARKER_INVALID",
  );
  return redactedResult({
    aggregator: tail.aggregator,
    caseMarkers: tracker.caseMarkers,
    deployment: beforeDeployment,
    graphql,
    groups,
    runMarker: config.runMarker,
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--self-test") {
    return runSelfTest();
  }
  assertGate(args.length === 0, "TASK149_ARGUMENTS_INVALID");
  return runLiveGate();
}

try {
  const result = await main();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  const code =
    error instanceof GateError ? error.code : "TASK149_RESOURCE_GATE_REJECTED";
  process.stderr.write(
    `${JSON.stringify({
      code: /^[A-Z][A-Z0-9_]{2,100}$/.test(code)
        ? code
        : "TASK149_RESOURCE_GATE_REJECTED",
      schemaVersion: RESULT_SCHEMA_VERSION,
      status: code.startsWith("BLOCKED_") ? "BLOCKED" : "FAIL",
    })}\n`,
  );
  process.exitCode = 1;
}
