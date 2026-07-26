#!/usr/bin/env node

import { randomBytes, randomUUID, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_BASE_URL = "http://127.0.0.1:3005";
const MAX_POS_JSON_BODY_BYTES = 16 * 1024;
const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1"]);
const HTTPS_NON_PRODUCTION_TUNNEL_HOST_SUFFIXES = [
  "loca.lt",
  "trycloudflare.com",
  "ngrok-free.app",
  "ngrok.io",
  "localhost.run",
];
const POSITIVE_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TASK032_POS_E2E_ALLOW_DATASET_SETUP",
  "TASK032_POS_E2E_ALLOW_CLEANUP",
];
const STAGING_DRY_RUN_FLAG = "TASK032_POS_E2E_STAGING_DRY_RUN";
const STAGING_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "TASK032_POS_E2E_ALLOW_DATASET_SETUP",
  "TASK032_POS_E2E_ALLOW_CLEANUP",
  "TASK032_POS_E2E_ALLOW_STAGING",
  "TASK032_POS_E2E_STAGING_HOST_ALLOWLIST",
  "TASK032_POS_E2E_STAGING_PROJECT_REF",
  "TASK032_POS_E2E_TEST_RUN_ID",
];
const SYNTHETIC_SHOP_CODE_PREFIX = "TASK032_TEST_SHOP_";
const SYNTHETIC_STAFF_CODE_PREFIX = "TASK032_POS_";
const SYNTHETIC_DEVICE_PREFIX = "TASK032_DEVICE_";
const SYNTHETIC_SALES_PREFIX = "TASK032";
const STAFF_CREDENTIAL_SCHEME = "scrypt-v1";
const STAFF_KEY_LENGTH = 64;
const STAFF_SALT_BYTES = 16;
const STAFF_SCRYPT_PARAMS = {
  N: 16384,
  p: 1,
  r: 8,
};
const STAFF_SCRYPT_MAXMEM = 64 * 1024 * 1024;

const deriveScrypt = promisify(scrypt);
const baseUrl = new URL(
  process.env.TASK032_POS_E2E_BASE_URL ?? DEFAULT_BASE_URL,
);
const sensitiveFragments = [
  "https?:\\/\\/[^\\s/@:]+:[^\\s/@]+@",
  "sb_" + "secret_[A-Za-z0-9_-]+",
  "eyJ[A-Za-z0-9._-]+",
  "mcpos_(device|session)_[A-Za-z0-9_-]+",
  "credential_hash",
  "session" + "Token" + "[\"'\\s:]+[A-Za-z0-9_-]+",
  "trustedDevice" + "Token" + "[\"'\\s:]+[A-Za-z0-9_-]+",
  "password\\s*[:=]\\s*[^,}\\n]+",
];
const sensitiveTextPattern = new RegExp(sensitiveFragments.join("|"), "i");

const negativeCases = [
  {
    body: "{}",
    contentType: "text/plain",
    name: "first-login rejects text/plain",
    path: "/api/pos/auth/first-login",
  },
  {
    body: "{",
    contentType: "application/json",
    name: "first-login rejects malformed JSON",
    path: "/api/pos/auth/first-login",
  },
  {
    body: JSON.stringify({ padding: "x".repeat(MAX_POS_JSON_BODY_BYTES + 1) }),
    contentType: "application/json",
    name: "first-login rejects oversized body",
    path: "/api/pos/auth/first-login",
  },
  {
    body: "{",
    contentType: "application/json",
    name: "heartbeat rejects malformed JSON",
    path: "/api/pos/session/heartbeat",
  },
  {
    body: "{",
    contentType: "application/json",
    name: "catalog pull rejects malformed JSON",
    path: "/api/pos/catalog/pull",
  },
];

class DatasetSetupError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DatasetSetupError";
    this.details = details;
  }
}

class E2EAssertionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "E2EAssertionError";
    this.details = details;
  }
}

class MalformedResponseError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "MalformedResponseError";
    this.details = details;
  }
}

function endpointUrl(path) {
  return new URL(path, baseUrl).toString();
}

function baseUrlForOutput() {
  const redacted = new URL(baseUrl.toString());
  redacted.username = "";
  redacted.password = "";

  return redacted.toString();
}

function envValue(key) {
  return process.env[key]?.trim() ?? "";
}

function isLocalUrl(value) {
  try {
    const url = new URL(value);

    return LOCAL_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

function splitEnvList(value) {
  return String(value ?? "")
    .split(/[\s,]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isExplicitNonProductionHostname(hostname) {
  const normalized = hostname.toLowerCase();

  return (
    /(^|[-.])(dev|stage|staging|test|qa|sandbox)([-.]|$)/.test(normalized) ||
    HTTPS_NON_PRODUCTION_TUNNEL_HOST_SUFFIXES.some(
      (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`),
    )
  );
}

function supabaseProjectRefFromUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const suffix = ".supabase.co";

    if (url.protocol !== "https:" || !hostname.endsWith(suffix)) {
      return "";
    }

    return hostname.slice(0, -suffix.length);
  } catch {
    return "";
  }
}

function syntheticCode(prefix, runId, maxLength = 32) {
  const normalizedRunId = normalizeRunId(runId) || safeRunId();
  const availableLength = maxLength - prefix.length;

  if (availableLength < 6) {
    throw new Error(
      `Synthetic prefix ${prefix} leaves insufficient identifier space.`,
    );
  }

  const uniqueSuffix = safeRunId().slice(0, 4);
  const candidate = `${normalizedRunId}${uniqueSuffix}`;

  if (candidate.length <= availableLength) {
    return `${prefix}${candidate}`.toUpperCase();
  }

  const headLength = availableLength - uniqueSuffix.length - 1;

  return `${prefix}${normalizedRunId.slice(0, headLength)}_${uniqueSuffix}`.toUpperCase();
}

function syntheticRequiredPrefix(prefix, runId, maxLength = 32) {
  const normalizedRunId = normalizeRunId(runId);
  const availableLength = maxLength - prefix.length;

  if (!normalizedRunId || availableLength <= 0) {
    return prefix.toUpperCase();
  }

  if (normalizedRunId.length + 4 <= availableLength) {
    return `${prefix}${normalizedRunId}`.toUpperCase();
  }

  return `${prefix}${normalizedRunId.slice(0, Math.max(1, availableLength - 5))}`.toUpperCase();
}

function redactProjectRef(value) {
  const ref = String(value ?? "");

  if (ref.length <= 8) {
    return ref ? "[REDACTED_PROJECT_REF]" : "";
  }

  return `${ref.slice(0, 4)}...${ref.slice(-4)}`;
}

function configuredTestMarker() {
  return (
    envValue("TASK032_POS_E2E_REQUIRE_TEST_MARKER") || SYNTHETIC_SALES_PREFIX
  );
}

function validateRequiredTestMarker() {
  const marker = configuredTestMarker();

  if (marker !== SYNTHETIC_SALES_PREFIX) {
    return datasetBlocked(
      "Test marker must be exactly TASK032 for positive POS E2E.",
      {
        marker,
      },
    );
  }

  return { marker, ok: true };
}

function validatePositiveTarget(supabaseUrl) {
  const baseIsLocal = isLocalUrl(baseUrl.toString());
  const supabaseIsLocal = isLocalUrl(supabaseUrl);

  if (baseIsLocal && supabaseIsLocal) {
    return {
      baseHost: hostnameFromUrl(baseUrl.toString()),
      ok: true,
      targetKind: "local",
    };
  }

  if (baseIsLocal || supabaseIsLocal) {
    return datasetBlocked(
      "Admin Web base URL and Supabase URL must both be local or both be explicitly allowlisted staging.",
    );
  }

  if (envValue("TASK032_POS_E2E_ALLOW_STAGING") !== "yes") {
    return datasetBlocked(
      "Staging POS E2E requires TASK032_POS_E2E_ALLOW_STAGING=yes.",
    );
  }

  let parsedBaseUrl;
  try {
    parsedBaseUrl = new URL(baseUrl.toString());
  } catch {
    return datasetBlocked("Admin Web base URL is invalid.");
  }

  const baseHost = parsedBaseUrl.hostname.toLowerCase();
  const hostAllowlist = splitEnvList(
    envValue("TASK032_POS_E2E_STAGING_HOST_ALLOWLIST"),
  );
  const expectedProjectRef = envValue(
    "TASK032_POS_E2E_STAGING_PROJECT_REF",
  ).toLowerCase();
  const actualProjectRef = supabaseProjectRefFromUrl(supabaseUrl);

  if (
    parsedBaseUrl.protocol !== "https:" ||
    parsedBaseUrl.username ||
    parsedBaseUrl.password
  ) {
    return datasetBlocked(
      "Staging Admin Web base URL must be HTTPS without URL credentials.",
    );
  }

  if (baseHost.endsWith("vercel.app")) {
    return datasetBlocked(
      "Vercel preview/production hosts are not allowed for POS positive staging E2E.",
    );
  }

  if (!hostAllowlist.includes(baseHost)) {
    return datasetBlocked(
      "Staging Admin Web host is not in TASK032_POS_E2E_STAGING_HOST_ALLOWLIST.",
      {
        baseHost,
      },
    );
  }

  if (!isExplicitNonProductionHostname(baseHost)) {
    return datasetBlocked(
      "Staging Admin Web host must contain an explicit non-production label.",
    );
  }

  if (!/^[a-z0-9-]{6,63}$/.test(expectedProjectRef)) {
    return datasetBlocked(
      "TASK032_POS_E2E_STAGING_PROJECT_REF is missing or invalid.",
    );
  }

  if (actualProjectRef !== expectedProjectRef) {
    return datasetBlocked(
      "Supabase URL does not match the allowlisted staging project ref.",
      {
        expectedProjectRef: redactProjectRef(expectedProjectRef),
        supabaseProjectRef: actualProjectRef
          ? redactProjectRef(actualProjectRef)
          : "unresolved",
      },
    );
  }

  return {
    baseHost,
    ok: true,
    stagingProjectRef: actualProjectRef,
    targetKind: "staging",
  };
}

function redactError(error) {
  if (!error) {
    return undefined;
  }

  const message =
    error instanceof Error ? error.message : String(error.message ?? error);
  const details =
    error && typeof error === "object" && "details" in error
      ? error.details
      : undefined;

  return {
    code: typeof error.code === "string" ? error.code : undefined,
    details,
    message: message.replace(sensitiveTextPattern, "[REDACTED]"),
  };
}

function datasetBlocked(reason, extra = {}) {
  return {
    ...extra,
    ok: false,
    reason,
    status: "BLOCKED_DATASET_SETUP",
  };
}

function validatePositiveConfig() {
  const enabled = envValue("TASK032_POS_E2E_ENABLE_POSITIVE") === "yes";
  const requiresStagingTarget =
    envValue("TASK032_POS_E2E_REQUIRE_STAGING_TARGET") === "yes";

  if (!enabled) {
    return {
      ok: false,
      reason:
        "Set TASK032_POS_E2E_ENABLE_POSITIVE=yes only with a synthetic dataset and cleanup plan.",
      status: "BLOCKED_DATASET_NOT_CONFIGURED",
    };
  }

  const requiredEnvKeys = requiresStagingTarget
    ? Array.from(
        new Set([
          ...POSITIVE_ENV_KEYS,
          ...STAGING_ENV_KEYS,
          "TASK032_POS_E2E_BASE_URL",
        ]),
      )
    : POSITIVE_ENV_KEYS;
  const missing = requiredEnvKeys.filter((key) => !envValue(key));

  if (missing.length > 0) {
    return datasetBlocked("Positive POS E2E is missing required env names.", {
      missing,
    });
  }

  if (envValue("TASK032_POS_E2E_ALLOW_DATASET_SETUP") !== "yes") {
    return datasetBlocked(
      "Dataset setup must be explicitly allowed before positive POS E2E.",
    );
  }

  if (envValue("TASK032_POS_E2E_ALLOW_CLEANUP") !== "yes") {
    return datasetBlocked(
      "Cleanup must be explicitly allowed before positive POS E2E.",
    );
  }

  const markerCheck = validateRequiredTestMarker();
  if (!markerCheck.ok) {
    return markerCheck;
  }

  const supabaseUrl = envValue("NEXT_PUBLIC_SUPABASE_URL");
  const target = validatePositiveTarget(supabaseUrl);

  if (!target.ok) {
    return target;
  }

  if (requiresStagingTarget && target.targetKind !== "staging") {
    return datasetBlocked(
      "Staging POS E2E requires an allowlisted non-local staging Admin Web and Supabase target.",
    );
  }

  const requestedRunId = normalizeRunId(
    envValue("TASK032_POS_E2E_TEST_RUN_ID"),
  );

  if (target.targetKind === "staging" && !requestedRunId) {
    return datasetBlocked(
      "Staging POS E2E requires TASK032_POS_E2E_TEST_RUN_ID with at least 6 safe characters.",
    );
  }

  const runId = requestedRunId
    ? `${requestedRunId}${safeRunId().slice(0, 4)}`
    : safeRunId();
  const identifierRunId = requestedRunId || runId;
  const shopCode = (
    envValue("TASK032_POS_E2E_SHOP_CODE") ||
    syntheticCode(SYNTHETIC_SHOP_CODE_PREFIX, identifierRunId)
  ).toUpperCase();
  const staffCode = (
    envValue("TASK032_POS_E2E_STAFF_CODE") ||
    syntheticCode(SYNTHETIC_STAFF_CODE_PREFIX, identifierRunId)
  ).toUpperCase();
  const deviceName =
    envValue("TASK032_POS_E2E_DEVICE_NAME") ||
    `${SYNTHETIC_DEVICE_PREFIX}${identifierRunId}${safeRunId().slice(0, 4)}`;
  const posCredential =
    envValue("TASK032_POS_E2E_PIN_OR_PASSWORD") ||
    `Task032-POS-${randomBytes(12).toString("base64url")}`;

  if (!shopCode.startsWith(SYNTHETIC_SHOP_CODE_PREFIX)) {
    return datasetBlocked(
      `Shop code must use ${SYNTHETIC_SHOP_CODE_PREFIX} prefix.`,
    );
  }

  if (!staffCode.startsWith(SYNTHETIC_STAFF_CODE_PREFIX)) {
    return datasetBlocked(
      `Staff code must use ${SYNTHETIC_STAFF_CODE_PREFIX} prefix.`,
    );
  }

  if (!deviceName.startsWith(SYNTHETIC_DEVICE_PREFIX)) {
    return datasetBlocked(
      `Device name must use ${SYNTHETIC_DEVICE_PREFIX} prefix.`,
    );
  }

  if (
    target.targetKind === "staging" &&
    (!shopCode.startsWith(
      syntheticRequiredPrefix(SYNTHETIC_SHOP_CODE_PREFIX, requestedRunId),
    ) ||
      !staffCode.startsWith(
        syntheticRequiredPrefix(SYNTHETIC_STAFF_CODE_PREFIX, requestedRunId),
      ) ||
      !deviceName.toUpperCase().includes(requestedRunId))
  ) {
    return datasetBlocked(
      "Staging synthetic identifiers must include TASK032_POS_E2E_TEST_RUN_ID.",
    );
  }

  if (posCredential.length < 8) {
    return datasetBlocked("POS credential must be at least 8 characters.");
  }

  return {
    deviceName,
    ok: true,
    posCredential,
    runId,
    serviceRoleKey: envValue("SUPABASE_SERVICE_ROLE_KEY"),
    shopCode,
    staffCode,
    stagingProjectRef: redactProjectRef(target.stagingProjectRef),
    supabaseUrl,
    targetKind: target.targetKind,
    testMarker: markerCheck.marker,
    testRunId: requestedRunId || runId,
  };
}

function validateStagingDryRunConfig() {
  if (envValue(STAGING_DRY_RUN_FLAG) !== "yes") {
    return datasetBlocked(
      "Staging dry-run requires TASK032_POS_E2E_STAGING_DRY_RUN=yes.",
    );
  }

  if (envValue("TASK032_POS_E2E_ENABLE_POSITIVE") !== "yes") {
    return datasetBlocked(
      "Staging dry-run requires TASK032_POS_E2E_ENABLE_POSITIVE=yes.",
    );
  }

  const missing = STAGING_ENV_KEYS.filter((key) => !envValue(key));

  if (missing.length > 0) {
    return datasetBlocked("Staging dry-run is missing required env names.", {
      missing,
    });
  }

  if (envValue("TASK032_POS_E2E_ALLOW_DATASET_SETUP") !== "yes") {
    return datasetBlocked(
      "Dataset setup must be explicitly allowed for staging precheck.",
    );
  }

  if (envValue("TASK032_POS_E2E_ALLOW_CLEANUP") !== "yes") {
    return datasetBlocked(
      "Cleanup must be explicitly allowed for staging precheck.",
    );
  }

  const markerCheck = validateRequiredTestMarker();
  if (!markerCheck.ok) {
    return markerCheck;
  }

  const requestedRunId = normalizeRunId(
    envValue("TASK032_POS_E2E_TEST_RUN_ID"),
  );
  if (!requestedRunId) {
    return datasetBlocked(
      "Staging dry-run requires TASK032_POS_E2E_TEST_RUN_ID with at least 6 safe characters.",
    );
  }

  const target = validatePositiveTarget(envValue("NEXT_PUBLIC_SUPABASE_URL"));
  if (!target.ok) {
    return target;
  }

  if (target.targetKind !== "staging") {
    return datasetBlocked(
      "Staging dry-run must target an allowlisted non-local staging environment.",
    );
  }

  const shopCodePrefix = syntheticRequiredPrefix(
    SYNTHETIC_SHOP_CODE_PREFIX,
    requestedRunId,
  );

  return {
    baseHost: target.baseHost,
    cleanup: {
      appendOnlySalesRows: "retained_with_TASK032_marker",
      scope: "shop_code_prefix_and_shop_id_after_setup",
      shopCodePrefix,
      truncate: false,
    },
    dataset: {
      devicePrefix: `${SYNTHETIC_DEVICE_PREFIX}${requestedRunId}`,
      marker: markerCheck.marker,
      productBarcodePrefix: `TASK032_BARCODE_${requestedRunId}`,
      shopCodePrefix,
      staffCodePrefix: `${SYNTHETIC_STAFF_CODE_PREFIX}${requestedRunId}`,
      testRunId: requestedRunId,
    },
    ok: true,
    serviceRolePresent: Boolean(envValue("SUPABASE_SERVICE_ROLE_KEY")),
    stagingProjectRef: redactProjectRef(target.stagingProjectRef),
    status: "PASS_STAGING_PRECHECK_DRY_RUN",
    wouldCreateData: false,
    wouldSendSales: false,
  };
}

function createSupabaseAdmin(config) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "merchandise-control-admin-web/task-032-pos-e2e",
      },
    },
  });
}

async function buildAuthenticatedFixtureClient(config, email, password) {
  const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info":
          "merchandise-control-admin-web/task-032-authenticated-fixture",
      },
    },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    throw new DatasetSetupError(
      "Synthetic fixture actor authentication failed.",
      { error: redactError(error) },
    );
  }

  return client;
}

function staffHashParams() {
  return [
    `n=${STAFF_SCRYPT_PARAMS.N}`,
    `r=${STAFF_SCRYPT_PARAMS.r}`,
    `p=${STAFF_SCRYPT_PARAMS.p}`,
    `l=${STAFF_KEY_LENGTH}`,
  ].join(",");
}

function encodeBase64Url(value) {
  return value.toString("base64url");
}

async function hashStaffCredential(plaintext) {
  const salt = randomBytes(STAFF_SALT_BYTES);
  const key = await deriveScrypt(plaintext, salt, STAFF_KEY_LENGTH, {
    ...STAFF_SCRYPT_PARAMS,
    maxmem: STAFF_SCRYPT_MAXMEM,
  });

  return [
    "",
    STAFF_CREDENTIAL_SCHEME,
    staffHashParams(),
    encodeBase64Url(salt),
    encodeBase64Url(key),
  ].join("$");
}

function nowIso() {
  return new Date().toISOString();
}

function dateOnly(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function safeRunId() {
  return randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

function normalizeRunId(value) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);

  return normalized.length >= 6 ? normalized : "";
}

async function mustSingle(label, query) {
  const { data, error } = await query;

  if (error || !data) {
    throw new DatasetSetupError(`${label} failed.`, {
      error: redactError(error),
    });
  }

  return data;
}

async function mustOk(label, query) {
  const { error } = await query;

  if (error) {
    throw new DatasetSetupError(`${label} failed.`, {
      error: redactError(error),
    });
  }
}

async function mustAction(label, query) {
  const { data, error } = await query;

  if (error || data?.ok !== true) {
    throw new DatasetSetupError(`${label} failed.`, {
      actionCode: data?.code,
      error: redactError(error),
    });
  }

  return data;
}

async function countSelectedRows(label, query) {
  const { data, error } = await query;

  if (error) {
    throw new DatasetSetupError(`${label} failed.`, {
      error: redactError(error),
    });
  }

  return data?.length ?? 0;
}

async function cleanupSyntheticSalesRecords(client, shopId) {
  const batchLookup = await client
    .from("pos_sales_sync_batches")
    .select("pos_sales_sync_batch_id")
    .eq("shop_id", shopId)
    .like("client_batch_id", `${SYNTHETIC_SALES_PREFIX}%`);
  const saleLookup = await client
    .from("pos_sales")
    .select("pos_sale_id")
    .eq("shop_id", shopId)
    .like("client_sale_id", `${SYNTHETIC_SALES_PREFIX}%`);

  if (batchLookup.error || saleLookup.error) {
    throw new DatasetSetupError("Synthetic sales cleanup lookup failed.", {
      error: redactError(batchLookup.error ?? saleLookup.error),
    });
  }

  const batchIds = (batchLookup.data ?? []).map(
    (row) => row.pos_sales_sync_batch_id,
  );
  const saleIds = (saleLookup.data ?? []).map((row) => row.pos_sale_id);
  const summary = {
    immutableLedgerRowsRetained: 0,
    immutableSaleLineRowsRetained: 0,
    immutableSaleRowsRetained: saleIds.length,
    immutableSalesBatchRowsRetained: batchIds.length,
    immutableStockMovementRowsRetained: 0,
  };

  if (saleIds.length > 0) {
    summary.immutableStockMovementRowsRetained += await countSelectedRows(
      "Synthetic stock movement retention count",
      client
        .from("pos_sale_stock_movements")
        .select("pos_sale_stock_movement_id")
        .in("pos_sale_id", saleIds),
    );
    summary.immutableLedgerRowsRetained += await countSelectedRows(
      "Synthetic ledger retention count",
      client
        .from("pos_revenue_ledger_entries")
        .select("pos_revenue_ledger_entry_id")
        .in("pos_sale_id", saleIds),
    );
    summary.immutableSaleLineRowsRetained += await countSelectedRows(
      "Synthetic sale line retention count",
      client
        .from("pos_sale_lines")
        .select("pos_sale_line_id")
        .in("pos_sale_id", saleIds),
    );
  }

  return summary;
}

async function cleanupSyntheticDataset(client, input) {
  const timestamp = nowIso();
  const shopIds = input.shopId ? [input.shopId] : [];
  const ownerIds = input.ownerUserId ? [input.ownerUserId] : [];
  const authUserIds = [
    ...new Set(
      [input.ownerUserId, input.platformActorId].filter(
        (value) => typeof value === "string" && value.length > 0,
      ),
    ),
  ];
  const summary = {
    activeCredentialRowsTouched: 0,
    activeDeviceRowsTouched: 0,
    activeSessionRowsTouched: 0,
    authUsersDeleted: 0,
    authUsersDeleteSkipped: 0,
    inventoryOwnersTouched: ownerIds.length,
    immutableLedgerRowsRetained: 0,
    immutableSaleLineRowsRetained: 0,
    immutableSaleRowsRetained: 0,
    immutableSalesBatchRowsRetained: 0,
    immutableStockMovementRowsRetained: 0,
    shopRowsTouched: shopIds.length,
  };

  for (const shopId of shopIds) {
    const salesCleanup = await cleanupSyntheticSalesRecords(client, shopId);
    summary.immutableLedgerRowsRetained +=
      salesCleanup.immutableLedgerRowsRetained;
    summary.immutableSaleLineRowsRetained +=
      salesCleanup.immutableSaleLineRowsRetained;
    summary.immutableSaleRowsRetained += salesCleanup.immutableSaleRowsRetained;
    summary.immutableSalesBatchRowsRetained +=
      salesCleanup.immutableSalesBatchRowsRetained;
    summary.immutableStockMovementRowsRetained +=
      salesCleanup.immutableStockMovementRowsRetained;

    if (input.posSessionId) {
      const activeSessions = await client
        .from("pos_sessions")
        .update({
          revoked_at: timestamp,
          revoked_reason: input.reason,
          status: "revoked",
          updated_at: timestamp,
        })
        .eq("pos_session_id", input.posSessionId)
        .eq("shop_id", shopId)
        .eq("status", "active")
        .select("pos_session_id");
      if (activeSessions.error) {
        throw new DatasetSetupError("Synthetic session cleanup failed.", {
          error: redactError(activeSessions.error),
        });
      }
      summary.activeSessionRowsTouched += activeSessions.data?.length ?? 0;
    }

    if (input.posDeviceCredentialId) {
      const activeCredentials = await client
        .from("pos_device_credentials")
        .update({
          revoked_at: timestamp,
          revoked_reason: input.reason,
          status: "revoked",
          updated_at: timestamp,
        })
        .eq("pos_device_credential_id", input.posDeviceCredentialId)
        .eq("shop_id", shopId)
        .eq("status", "active")
        .select("pos_device_credential_id");
      if (activeCredentials.error) {
        throw new DatasetSetupError(
          "Synthetic device credential cleanup failed.",
          {
            error: redactError(activeCredentials.error),
          },
        );
      }
      summary.activeCredentialRowsTouched +=
        activeCredentials.data?.length ?? 0;
    }

    if (input.shopDeviceId) {
      const activeDevices = await client
        .from("shop_devices")
        .update({
          revoked_at: timestamp,
          status: "revoked",
          updated_at: timestamp,
        })
        .eq("shop_device_id", input.shopDeviceId)
        .eq("shop_id", shopId)
        .eq("status", "active")
        .select("shop_device_id");
      if (activeDevices.error) {
        throw new DatasetSetupError("Synthetic device cleanup failed.", {
          error: redactError(activeDevices.error),
        });
      }
      summary.activeDeviceRowsTouched += activeDevices.data?.length ?? 0;
    }

    if (input.staffId) {
      await mustOk(
        "Synthetic staff archive",
        client
          .from("staff_accounts")
          .update({
            credential_hash: null,
            credential_kind: null,
            credential_status: "rotation_required",
            credential_updated_at: null,
            must_change_credential: true,
            status: "archived",
            updated_at: timestamp,
          })
          .eq("staff_id", input.staffId)
          .eq("shop_id", shopId),
      );
    }

    if (input.mappingId) {
      await mustOk(
        "Synthetic mapping disable",
        client
          .from("shop_inventory_sources")
          .update({
            disabled_at: timestamp,
          })
          .eq("shop_inventory_source_id", input.mappingId)
          .eq("shop_id", shopId)
          .is("disabled_at", null),
      );
    }

    if (input.memberId) {
      await mustOk(
        "Synthetic member suspend",
        client
          .from("shop_members")
          .update({
            membership_status: "suspended",
            suspended_at: timestamp,
            updated_at: timestamp,
          })
          .eq("shop_member_id", input.memberId)
          .eq("shop_id", shopId)
          .eq("membership_status", "active"),
      );
    }

    const shopState = await mustSingle(
      "Synthetic shop cleanup lookup",
      client
        .from("shops")
        .select("shop_code,shop_status")
        .eq("shop_id", shopId)
        .maybeSingle(),
    );
    if (shopState.shop_status !== "archived") {
      if (!input.platformClient) {
        throw new DatasetSetupError(
          "Synthetic shop cleanup requires its authenticated platform actor.",
        );
      }
      await mustAction(
        "Synthetic audited shop archive",
        input.platformClient.rpc("platform_soft_delete_shop", {
          p_reason: input.reason,
          p_shop_code_confirmation: shopState.shop_code,
          p_shop_id: shopId,
        }),
      );
    }
  }

  for (const ownerUserId of ownerIds) {
    if (input.productId) {
      await mustOk(
        "Synthetic price cleanup",
        client
          .from("inventory_product_prices")
          .delete()
          .eq("owner_user_id", ownerUserId)
          .eq("source", "TASK-032")
          .eq("product_id", input.productId),
      );
    }

    if (input.productId) {
      await mustOk(
        "Synthetic product tombstone",
        client
          .from("inventory_products")
          .update({
            deleted_at: timestamp,
            updated_at: timestamp,
          })
          .eq("id", input.productId)
          .eq("owner_user_id", ownerUserId),
      );
    }

    if (input.categoryId) {
      await mustOk(
        "Synthetic category tombstone",
        client
          .from("inventory_categories")
          .update({
            deleted_at: timestamp,
            updated_at: timestamp,
          })
          .eq("id", input.categoryId)
          .eq("owner_user_id", ownerUserId),
      );
    }

    if (input.supplierId) {
      await mustOk(
        "Synthetic supplier tombstone",
        client
          .from("inventory_suppliers")
          .update({
            deleted_at: timestamp,
            updated_at: timestamp,
          })
          .eq("id", input.supplierId)
          .eq("owner_user_id", ownerUserId),
      );
    }
  }

  if (input.platformActorId) {
    await mustOk(
      "Synthetic platform actor revoke",
      client
        .from("platform_admins")
        .update({
          reason_redacted: input.reason,
          revoked_at: timestamp,
          revoked_by_profile_id: input.platformActorId,
          status: "revoked",
        })
        .eq("profile_id", input.platformActorId)
        .eq("status", "active"),
    );
  }

  if (authUserIds.length > 0) {
    await mustOk(
      "Synthetic fixture profiles disable",
      client
        .from("profiles")
        .update({
          disabled_at: timestamp,
          profile_status: "disabled",
          updated_at: timestamp,
        })
        .in("profile_id", authUserIds)
        .neq("profile_status", "disabled"),
    );
  }

  for (const authUserId of authUserIds) {
    const authDelete = await client.auth.admin.deleteUser(authUserId, true);

    if (authDelete.error) {
      summary.authUsersDeleteSkipped += 1;
    } else {
      summary.authUsersDeleted += 1;
    }
  }

  return {
    ok: true,
    status: "CLEANUP_EXECUTED",
    summary,
  };
}

async function verifyCleanup(client, input) {
  const shopIds = input.shopId ? [input.shopId] : [];
  const ownerIds = input.ownerUserId ? [input.ownerUserId] : [];
  const noMatchId = "00000000-0000-0000-0000-000000000000";
  const counts = {
    activeCredentials: 0,
    activeDevices: 0,
    activeFixtureProfiles: 0,
    activeMappings: 0,
    activePlatformAdmins: 0,
    activeSessions: 0,
    activeShopMembers: 0,
    activeShops: 0,
    activeStaff: 0,
    activeTestCategories: 0,
    activeTestProducts: 0,
    activeTestSuppliers: 0,
    retainedImmutableLedgerRows: 0,
    retainedImmutableSaleLines: 0,
    retainedImmutableSales: 0,
    retainedImmutableSalesBatches: 0,
    retainedImmutableStockMovements: 0,
  };

  if (shopIds.length > 0) {
    const [
      shops,
      staff,
      devices,
      sessions,
      credentials,
      mappings,
      members,
      salesBatches,
      sales,
      saleLines,
      ledger,
      stockMovements,
    ] = await Promise.all([
      client
        .from("shops")
        .select("shop_id")
        .eq("shop_id", input.shopId)
        .neq("shop_status", "archived"),
      client
        .from("staff_accounts")
        .select("staff_id")
        .eq("staff_id", input.staffId ?? noMatchId)
        .eq("shop_id", input.shopId)
        .neq("status", "archived"),
      client
        .from("shop_devices")
        .select("shop_device_id")
        .eq("shop_device_id", input.shopDeviceId ?? noMatchId)
        .eq("shop_id", input.shopId)
        .eq("status", "active"),
      client
        .from("pos_sessions")
        .select("pos_session_id")
        .eq("pos_session_id", input.posSessionId ?? noMatchId)
        .eq("shop_id", input.shopId)
        .eq("status", "active"),
      client
        .from("pos_device_credentials")
        .select("pos_device_credential_id")
        .eq(
          "pos_device_credential_id",
          input.posDeviceCredentialId ?? noMatchId,
        )
        .eq("shop_id", input.shopId)
        .eq("status", "active"),
      client
        .from("shop_inventory_sources")
        .select("shop_inventory_source_id")
        .eq("shop_inventory_source_id", input.mappingId ?? noMatchId)
        .eq("shop_id", input.shopId)
        .eq("mapping_state", "mapped")
        .is("disabled_at", null),
      client
        .from("shop_members")
        .select("shop_member_id")
        .eq("shop_member_id", input.memberId ?? noMatchId)
        .eq("shop_id", input.shopId)
        .eq("membership_status", "active"),
      client
        .from("pos_sales_sync_batches")
        .select("pos_sales_sync_batch_id")
        .in("shop_id", shopIds)
        .like("client_batch_id", `${SYNTHETIC_SALES_PREFIX}%`),
      client
        .from("pos_sales")
        .select("pos_sale_id")
        .in("shop_id", shopIds)
        .like("client_sale_id", `${SYNTHETIC_SALES_PREFIX}%`),
      client
        .from("pos_sale_lines")
        .select("pos_sale_line_id")
        .in("shop_id", shopIds)
        .like("client_line_id", `${SYNTHETIC_SALES_PREFIX}%`),
      client
        .from("pos_revenue_ledger_entries")
        .select("pos_revenue_ledger_entry_id")
        .in("shop_id", shopIds)
        .like("client_entry_id", `%${SYNTHETIC_SALES_PREFIX}%`),
      client
        .from("pos_sale_stock_movements")
        .select("pos_sale_stock_movement_id")
        .in("shop_id", shopIds)
        .like("movement_key", `%${SYNTHETIC_SALES_PREFIX}%`),
    ]);

    for (const [label, result] of Object.entries({
      activeCredentials: credentials,
      activeDevices: devices,
      activeMappings: mappings,
      activeSessions: sessions,
      activeShopMembers: members,
      activeShops: shops,
      activeStaff: staff,
      retainedImmutableLedgerRows: ledger,
      retainedImmutableSaleLines: saleLines,
      retainedImmutableSales: sales,
      retainedImmutableSalesBatches: salesBatches,
      retainedImmutableStockMovements: stockMovements,
    })) {
      if (result.error) {
        throw new DatasetSetupError(
          `Cleanup verification query failed: ${label}.`,
          {
            error: redactError(result.error),
          },
        );
      }
      counts[label] = result.data?.length ?? 0;
    }
  }

  for (const ownerUserId of ownerIds) {
    const [products, categories, suppliers] = await Promise.all([
      client
        .from("inventory_products")
        .select("id")
        .eq("id", input.productId ?? noMatchId)
        .eq("owner_user_id", ownerUserId)
        .is("deleted_at", null),
      client
        .from("inventory_categories")
        .select("id")
        .eq("id", input.categoryId ?? noMatchId)
        .eq("owner_user_id", ownerUserId)
        .is("deleted_at", null),
      client
        .from("inventory_suppliers")
        .select("id")
        .eq("id", input.supplierId ?? noMatchId)
        .eq("owner_user_id", ownerUserId)
        .is("deleted_at", null),
    ]);

    for (const [label, result] of Object.entries({
      activeTestCategories: categories,
      activeTestProducts: products,
      activeTestSuppliers: suppliers,
    })) {
      if (result.error) {
        throw new DatasetSetupError(
          `Cleanup verification query failed: ${label}.`,
          {
            error: redactError(result.error),
          },
        );
      }
      counts[label] += result.data?.length ?? 0;
    }
  }

  const fixtureProfileIds = [
    ...new Set(
      [input.ownerUserId, input.platformActorId].filter(
        (value) => typeof value === "string" && value.length > 0,
      ),
    ),
  ];
  if (fixtureProfileIds.length > 0) {
    const [profiles, platformAdmins] = await Promise.all([
      client
        .from("profiles")
        .select("profile_id")
        .in("profile_id", fixtureProfileIds)
        .eq("profile_status", "active"),
      client
        .from("platform_admins")
        .select("platform_admin_id")
        .in("profile_id", fixtureProfileIds)
        .eq("status", "active")
        .is("revoked_at", null),
    ]);

    for (const [label, result] of Object.entries({
      activeFixtureProfiles: profiles,
      activePlatformAdmins: platformAdmins,
    })) {
      if (result.error) {
        throw new DatasetSetupError(
          `Cleanup verification query failed: ${label}.`,
          { error: redactError(result.error) },
        );
      }
      counts[label] = result.data?.length ?? 0;
    }
  }

  const activeLeftovers = Object.entries(counts)
    .filter(([key]) => !key.startsWith("retainedImmutable"))
    .reduce((total, [, value]) => total + value, 0);

  return {
    counts,
    ok: activeLeftovers === 0,
    status:
      activeLeftovers === 0 ? "CLEANUP_VERIFIED" : "CLEANUP_LEFTOVERS_FOUND",
  };
}

async function setupSyntheticDataset(client, config, lifecycle) {
  const runId = config.runId;
  const ownerEmail = `task032-test-${runId.toLowerCase()}@example.invalid`;
  const platformEmail = `task032-platform-${runId.toLowerCase()}@example.invalid`;
  const ownerAuthSecret = randomBytes(24).toString("base64url");
  const platformAuthSecret = randomBytes(24).toString("base64url");

  const userResult = await client.auth.admin.createUser({
    email: ownerEmail,
    email_confirm: true,
    password: ownerAuthSecret,
    user_metadata: {
      source: "TASK-032",
      test_run_id: config.testRunId,
    },
  });

  if (userResult.error || !userResult.data.user) {
    throw new DatasetSetupError("Synthetic auth user creation failed.", {
      error: redactError(userResult.error),
    });
  }

  const ownerUserId = userResult.data.user.id;
  lifecycle.ownerUserId = ownerUserId;
  const platformUserResult = await client.auth.admin.createUser({
    email: platformEmail,
    email_confirm: true,
    password: platformAuthSecret,
    user_metadata: {
      source: "TASK-032",
      test_run_id: config.testRunId,
    },
  });

  if (platformUserResult.error || !platformUserResult.data.user) {
    throw new DatasetSetupError(
      "Synthetic platform auth user creation failed.",
      { error: redactError(platformUserResult.error) },
    );
  }

  const platformActorId = platformUserResult.data.user.id;
  lifecycle.platformActorId = platformActorId;
  const categoryName = `TASK032_TEST_CATEGORY_${runId}`;
  const supplierName = `TASK032_TEST_SUPPLIER_${runId}`;
  const productBarcode = `TASK032_BARCODE_${runId}`;
  const productName = `TASK032_TEST_PRODUCT_${runId}`;
  const staffHash = await hashStaffCredential(config.posCredential);

  await mustOk(
    "Synthetic fixture profiles upsert",
    client.from("profiles").upsert(
      [
        {
          display_name: `TASK032_TEST_OWNER_${runId}`,
          profile_id: ownerUserId,
          profile_status: "active",
        },
        {
          display_name: `TASK032_TEST_PLATFORM_${runId}`,
          profile_id: platformActorId,
          profile_status: "active",
        },
      ],
      { onConflict: "profile_id" },
    ),
  );

  await mustOk(
    "Synthetic platform fixture bootstrap",
    client.from("platform_admins").insert({
      granted_by_profile_id: platformActorId,
      profile_id: platformActorId,
      reason_redacted: "TASK-032 isolated POS harness fixture",
      status: "active",
    }),
  );

  const platformClient = await buildAuthenticatedFixtureClient(
    config,
    platformEmail,
    platformAuthSecret,
  );
  lifecycle.platformClient = platformClient;
  const shopAction = await mustAction(
    "Synthetic audited shop create",
    platformClient.rpc("platform_create_shop", {
      p_owner_profile_id: ownerUserId,
      p_reason: "TASK-032 isolated POS harness fixture",
      p_shop_code: config.shopCode,
      p_shop_name: `TASK032_TEST_SHOP_${runId}`,
    }),
  );
  const shopId = shopAction.shop_id;
  if (typeof shopId !== "string" || shopId.length === 0) {
    throw new DatasetSetupError(
      "Synthetic audited shop create returned no shop id.",
    );
  }
  lifecycle.shopId = shopId;
  const ownerMember = await mustSingle(
    "Synthetic owner membership lookup",
    client
      .from("shop_members")
      .select("shop_member_id")
      .eq("shop_id", shopId)
      .eq("profile_id", ownerUserId)
      .maybeSingle(),
  );
  lifecycle.memberId = ownerMember.shop_member_id;

  const ownerClient = await buildAuthenticatedFixtureClient(
    config,
    ownerEmail,
    ownerAuthSecret,
  );
  const staffAction = await mustAction(
    "Synthetic audited staff create",
    ownerClient.rpc("shop_staff_create", {
      p_credential_expires_at: null,
      p_credential_hash: staffHash,
      p_credential_kind: "password",
      p_display_name: `TASK032_POS_STAFF_${runId}`,
      p_role_key: "cashier",
      p_shop_id: shopId,
      p_staff_code: config.staffCode,
    }),
  );
  const staffId = staffAction.target_id;
  if (typeof staffId !== "string" || staffId.length === 0) {
    throw new DatasetSetupError(
      "Synthetic audited staff create returned no staff id.",
    );
  }
  lifecycle.staffId = staffId;

  const mappingAction = await mustAction(
    "Synthetic audited inventory source map",
    platformClient.rpc("platform_map_shop_inventory_source", {
      p_owner_user_id: ownerUserId,
      p_reason: "TASK-032 isolated POS harness fixture",
      p_shop_id: shopId,
    }),
  );
  const mappingId = mappingAction.shop_inventory_source_id;
  if (typeof mappingId !== "string" || mappingId.length === 0) {
    throw new DatasetSetupError(
      "Synthetic audited inventory source map returned no mapping id.",
    );
  }
  lifecycle.mappingId = mappingId;

  return {
    categoryId: null,
    categoryName,
    mappingId,
    memberId: ownerMember.shop_member_id,
    ownerUserId,
    posDeviceCredentialId: null,
    posSessionId: null,
    productBarcode,
    productId: null,
    productName,
    runId,
    shopCode: config.shopCode,
    shopDeviceId: null,
    shopId,
    staffCode: config.staffCode,
    staffId,
    supplierId: null,
    supplierName,
  };
}

async function postJson(path, body) {
  const clientRequestId = `TASK032-${safeRunId()}`;
  const response = await fetch(endpointUrl(path), {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "X-Client-Request-Id": clientRequestId,
      "User-Agent": "TASK-032 local POS harness",
    },
    method: "POST",
  });
  const text = await response.text();
  let parsedBody = null;

  try {
    parsedBody = JSON.parse(text);
  } catch {
    parsedBody = null;
  }

  return {
    body: parsedBody,
    cacheControl: response.headers.get("Cache-Control") ?? "",
    clientRequestId,
    noStore: (response.headers.get("Cache-Control") ?? "")
      .toLowerCase()
      .includes("no-store"),
    requestId:
      response.headers.get("X-Request-Id") ?? parsedBody?.requestId ?? "",
    status: response.status,
    text,
  };
}

async function postSalesJson(body) {
  const clientRequestId = `TASK032-${safeRunId()}`;
  const response = await fetch(endpointUrl("/api/pos/sales/sync"), {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": String(body.batch?.idempotencyKey ?? ""),
      "X-Client-Request-Id": clientRequestId,
      "User-Agent": "TASK-032 local POS harness",
    },
    method: "POST",
  });
  const text = await response.text();
  let parsedBody = null;

  try {
    parsedBody = JSON.parse(text);
  } catch {
    parsedBody = null;
  }

  return {
    body: parsedBody,
    cacheControl: response.headers.get("Cache-Control") ?? "",
    clientRequestId,
    noStore: (response.headers.get("Cache-Control") ?? "")
      .toLowerCase()
      .includes("no-store"),
    requestId:
      response.headers.get("X-Request-Id") ?? parsedBody?.requestId ?? "",
    status: response.status,
    text,
  };
}

async function runNegativeCase(testCase) {
  const clientRequestId = `TASK032-${safeRunId()}`;
  const response = await fetch(endpointUrl(testCase.path), {
    body: testCase.body,
    headers: {
      "Content-Type": testCase.contentType,
      "X-Client-Request-Id": clientRequestId,
      "User-Agent": "TASK-032 local POS harness",
    },
    method: "POST",
  });
  const text = await response.text();
  let parsedBody = null;

  try {
    parsedBody = JSON.parse(text);
  } catch {
    parsedBody = null;
  }

  const cacheControl = response.headers.get("Cache-Control") ?? "";
  const statusOk = response.status >= 400 && response.status < 600;
  const noStore = cacheControl.toLowerCase().includes("no-store");
  const redacted = !sensitiveTextPattern.test(text);
  const requestId =
    response.headers.get("X-Request-Id") ?? parsedBody?.requestId ?? "";
  const requestIdOk = /^posreq_[0-9a-f-]{36}$/i.test(requestId);

  return {
    cacheControl,
    clientRequestId,
    name: testCase.name,
    ok: statusOk && noStore && redacted && requestIdOk,
    path: testCase.path,
    redacted,
    requestId,
    status: response.status,
  };
}

function assertNoStore(label, result) {
  if (!result.noStore) {
    throw new E2EAssertionError(
      `${label} did not return Cache-Control no-store.`,
      {
        status: result.status,
      },
    );
  }
}

function syntheticSale(dataset, input = {}) {
  const amountClp = input.amountClp ?? 1000;
  const businessDate = dateOnly();
  const clientSaleId = `${SYNTHETIC_SALES_PREFIX}_${dataset.runId}_SALE_1`;
  const occurredAt = `${businessDate}T14:00:00.000Z`;

  return {
    amounts: {
      changeClp: 0,
      discountClp: 0,
      grossClp: amountClp,
      netClp: amountClp,
      paidClp: amountClp,
      taxClp: 0,
    },
    businessDate,
    clientSaleId,
    currency: "CLP",
    fiscal: {
      documentNumber: `TASK032-F-${dataset.runId}`,
      documentType: "boleta",
      printedAt: occurredAt,
      status: "printed_local_pdf",
    },
    idempotencyKey: `${SYNTHETIC_SALES_PREFIX}_IDEM_${dataset.runId}_SALE_1`,
    kind: "sale",
    lines: [
      {
        amountClp,
        clientLineId: `${SYNTHETIC_SALES_PREFIX}_${dataset.runId}_LINE_1`,
        linePosition: 1,
        lineTotal: amountClp,
        lineType: "item",
        productId: dataset.productId,
        productName: dataset.productName,
        quantity: 1,
        stockQuantityDelta: -1,
        unitAmountClp: amountClp,
        unitPrice: amountClp,
      },
    ],
    occurredAt,
    payments: [
      {
        amountClp,
        changeClp: 0,
        clientPaymentId: `${SYNTHETIC_SALES_PREFIX}_${dataset.runId}_PAYMENT_1`,
        method: "cash",
      },
    ],
    saleNumber: `${SYNTHETIC_SALES_PREFIX}-${dataset.runId}-SALE-1`,
    total: amountClp,
  };
}

function salesPayload(input) {
  return {
    ...input.auth,
    appVersion: "TASK-032-local",
    batch: {
      clientBatchId: `${SYNTHETIC_SALES_PREFIX}_BATCH_${input.dataset.runId}`,
      idempotencyKey: `${SYNTHETIC_SALES_PREFIX}_IDEM_BATCH_${input.dataset.runId}`,
    },
    sales: [input.sale],
    schemaVersion: "pos-sales-ledger-v2",
    shopCode: input.dataset.shopCode,
  };
}

function parseSalesSyncSuccess(result, label, expectedStatus) {
  assertNoStore(label, result);

  if (
    result.status !== 200 ||
    !result.body ||
    result.body.ok !== true ||
    result.body.batch?.status !== expectedStatus
  ) {
    throw new E2EAssertionError(
      `${label} did not return expected sales status.`,
      {
        code: result.body?.code,
        status: result.status,
        syncStatus: result.body?.batch?.status,
      },
    );
  }

  return result.body;
}

function parseSalesSyncConflict(result) {
  assertNoStore("sales conflict", result);

  if (
    result.status !== 409 ||
    result.body?.ok !== false ||
    result.body?.code !== "conflict"
  ) {
    throw new E2EAssertionError(
      "Sales conflict check did not return stable 409 conflict.",
      {
        code: result.body?.code,
        status: result.status,
      },
    );
  }

  return true;
}

async function verifySalesPersistence(client, dataset, sale) {
  const productResult = await client
    .from("inventory_products")
    .select("stock_quantity")
    .eq("id", dataset.productId)
    .eq("shop_id", dataset.shopId)
    .maybeSingle();
  const salesResult = await client
    .from("pos_sales")
    .select("pos_sale_id,status,stock_sync_status,stock_warning_count")
    .eq("shop_id", dataset.shopId)
    .eq("client_sale_id", sale.clientSaleId)
    .maybeSingle();

  if (productResult.error || salesResult.error || !salesResult.data) {
    throw new E2EAssertionError("Sales persistence lookup failed.", {
      productError: redactError(productResult.error),
      saleError: redactError(salesResult.error),
    });
  }

  const posSaleId = salesResult.data.pos_sale_id;
  const [ledger, movements, audit] = await Promise.all([
    client
      .from("pos_revenue_ledger_entries")
      .select("pos_revenue_ledger_entry_id")
      .eq("shop_id", dataset.shopId)
      .eq("pos_sale_id", posSaleId),
    client
      .from("pos_sale_stock_movements")
      .select("pos_sale_stock_movement_id,status")
      .eq("shop_id", dataset.shopId)
      .eq("pos_sale_id", posSaleId),
    client
      .from("audit_logs")
      .select("audit_log_id")
      .eq("shop_id", dataset.shopId)
      .eq("event_key", "pos.sales.sync.success")
      .eq("target_type", "pos_sales_sync_batch")
      .limit(5),
  ]);

  for (const [label, result] of Object.entries({ audit, ledger, movements })) {
    if (result.error) {
      throw new E2EAssertionError(`Sales ${label} verification failed.`, {
        error: redactError(result.error),
      });
    }
  }

  const stockQuantity = Number(productResult.data?.stock_quantity);

  if (
    stockQuantity !== 6 ||
    salesResult.data.status !== "accepted" ||
    salesResult.data.stock_sync_status !== "applied" ||
    Number(salesResult.data.stock_warning_count) !== 0 ||
    (ledger.data?.length ?? 0) === 0 ||
    !(movements.data ?? []).some((row) => row.status === "applied") ||
    (audit.data?.length ?? 0) === 0
  ) {
    throw new E2EAssertionError("Sales persistence verification failed.", {
      auditRows: audit.data?.length ?? 0,
      ledgerRows: ledger.data?.length ?? 0,
      movementRows: movements.data?.length ?? 0,
      saleStatus: salesResult.data.status,
      stockQuantity,
      stockSyncStatus: salesResult.data.stock_sync_status,
    });
  }

  return {
    auditRows: audit.data?.length ?? 0,
    ledgerRows: ledger.data?.length ?? 0,
    movementRows: movements.data?.length ?? 0,
    posSaleId,
    stockQuantity,
  };
}

function parseFirstLoginSuccess(result) {
  assertNoStore("first-login", result);

  if (result.status !== 200 || !result.body || result.body.ok !== true) {
    throw new E2EAssertionError("POS first login did not succeed.", {
      code: result.body?.code,
      status: result.status,
    });
  }

  const body = result.body;

  if (
    typeof body.trustedDeviceToken !== "string" ||
    typeof body.session?.sessionToken !== "string" ||
    typeof body.session?.posSessionId !== "string" ||
    typeof body.device?.shopDeviceId !== "string"
  ) {
    throw new MalformedResponseError(
      "POS first login success response is malformed.",
      {
        status: result.status,
      },
    );
  }

  return body;
}

function parseHeartbeatSuccess(result) {
  assertNoStore("heartbeat", result);

  if (
    result.status !== 200 ||
    !result.body ||
    result.body.ok !== true ||
    typeof result.body.session?.posSessionId !== "string"
  ) {
    throw new E2EAssertionError("POS heartbeat did not succeed.", {
      code: result.body?.code,
      status: result.status,
    });
  }

  return result.body;
}

function parseCatalogSuccess(result, label) {
  assertNoStore(label, result);

  if (
    result.status !== 200 ||
    !result.body ||
    result.body.ok !== true ||
    !result.body.catalog ||
    !Array.isArray(result.body.catalog.products) ||
    !Array.isArray(result.body.catalog.categories) ||
    !Array.isArray(result.body.catalog.suppliers) ||
    !result.body.catalog.tombstones
  ) {
    throw new E2EAssertionError(
      `${label} did not return a valid catalog payload.`,
      {
        code: result.body?.code,
        status: result.status,
      },
    );
  }

  return result.body;
}

function authPayload(session) {
  return {
    deviceToken: session.trustedDeviceToken,
    posSessionId: session.session.posSessionId,
    sessionToken: session.session.sessionToken,
    shopDeviceId: session.device.shopDeviceId,
  };
}

function catalogImportPayload(dataset, auth) {
  const clientItemId = `TASK032_ITEM_${dataset.runId}`;

  return {
    ...auth,
    appVersion: "TASK-032-local",
    batch: {
      attemptCount: 1,
      clientImportId: `TASK032_IMPORT_${dataset.runId}`,
      createdAt: nowIso(),
      idempotencyKey: `TASK032_IMPORT_IDEM_${dataset.runId}`,
      sourceFileName: `task032-${dataset.runId}.xlsx`,
    },
    items: [
      {
        barcode: dataset.productBarcode,
        category: dataset.categoryName,
        changeKind: "new",
        clientItemId,
        itemNumber: `TASK032_ITEM_NO_${dataset.runId}`,
        productName: dataset.productName,
        purchasePrice: 10.5,
        quantity: 7,
        retailPrice: 15.75,
        rowNumber: 1,
        supplier: dataset.supplierName,
      },
    ],
    payloadHash: `task032_payload_hash_${dataset.runId}`,
    schemaVersion: "pos-catalog-import-v1",
    shopCode: dataset.shopCode,
    shopDeviceId: auth.shopDeviceId,
    source: "supplier_excel",
    summary: {
      newProducts: 1,
      noChangeRows: 0,
      skippedRows: 0,
      updatedProducts: 0,
      warningCount: 0,
    },
  };
}

function parseCatalogImportSuccess(result, dataset) {
  assertNoStore("catalog import", result);

  const remoteProductId = result.body?.remoteProductIds?.[0]?.remoteProductId;
  if (
    result.status !== 200 ||
    result.body?.ok !== true ||
    result.body?.batch?.status !== "accepted" ||
    result.body?.batch?.clientImportId !== `TASK032_IMPORT_${dataset.runId}` ||
    typeof remoteProductId !== "string" ||
    result.body?.remoteProductIds?.length !== 1 ||
    result.body?.remotePriceIds?.length < 2
  ) {
    throw new E2EAssertionError(
      "Catalog import did not return the canonical accepted contract.",
      {
        batchStatus: result.body?.batch?.status,
        code: result.body?.code,
        remotePriceCount: result.body?.remotePriceIds?.length ?? 0,
        remoteProductCount: result.body?.remoteProductIds?.length ?? 0,
        status: result.status,
      },
    );
  }

  return {
    remotePriceCount: result.body.remotePriceIds.length,
    remoteProductId,
    status: result.status,
  };
}

async function loadImportedDatasetIds(client, dataset, remoteProductId) {
  const [product, category, supplier] = await Promise.all([
    mustSingle(
      "Synthetic imported product lookup",
      client
        .from("inventory_products")
        .select("id")
        .eq("shop_id", dataset.shopId)
        .eq("barcode", dataset.productBarcode)
        .maybeSingle(),
    ),
    mustSingle(
      "Synthetic imported category lookup",
      client
        .from("inventory_categories")
        .select("id")
        .eq("shop_id", dataset.shopId)
        .eq("name", dataset.categoryName)
        .maybeSingle(),
    ),
    mustSingle(
      "Synthetic imported supplier lookup",
      client
        .from("inventory_suppliers")
        .select("id")
        .eq("shop_id", dataset.shopId)
        .eq("name", dataset.supplierName)
        .maybeSingle(),
    ),
  ]);

  if (product.id !== remoteProductId) {
    throw new E2EAssertionError(
      "Catalog import response product id does not match persisted product.",
    );
  }

  dataset.categoryId = category.id;
  dataset.productId = product.id;
  dataset.supplierId = supplier.id;
}

async function pullCompleteCatalog(auth) {
  const aggregate = {
    categories: [],
    prices: [],
    products: [],
    suppliers: [],
    tombstones: {
      categories: [],
      products: [],
      suppliers: [],
    },
  };
  let invariant = null;
  let pageCount = 0;
  let syncCursor = "";
  let firstPage = null;

  do {
    pageCount += 1;
    if (pageCount > 20) {
      throw new E2EAssertionError(
        "Catalog full pull exceeded the bounded page count.",
      );
    }

    const result = await postJson("/api/pos/catalog/pull", {
      ...auth,
      appVersion: "TASK-032-local",
      limit: 25,
      ...(syncCursor ? { syncCursor } : {}),
    });
    const page = parseCatalogSuccess(
      result,
      `catalog full pull page ${pageCount}`,
    );
    firstPage ??= page;
    const currentInvariant = JSON.stringify({
      catalogRevision: page.catalogRevision,
      catalogSummary: page.catalogSummary,
      snapshotAt: page.snapshotAt,
      syncMode: page.syncMode,
    });
    invariant ??= currentInvariant;
    if (currentInvariant !== invariant) {
      throw new E2EAssertionError(
        "Catalog full pull snapshot changed across continuation pages.",
      );
    }

    aggregate.categories.push(...page.catalog.categories);
    aggregate.prices.push(...(page.catalog.prices ?? []));
    aggregate.products.push(...page.catalog.products);
    aggregate.suppliers.push(...page.catalog.suppliers);
    aggregate.tombstones.categories.push(
      ...(page.catalog.tombstones.categories ?? []),
    );
    aggregate.tombstones.products.push(
      ...(page.catalog.tombstones.products ?? []),
    );
    aggregate.tombstones.suppliers.push(
      ...(page.catalog.tombstones.suppliers ?? []),
    );

    if (page.hasMore !== true) {
      syncCursor = "";
      break;
    }
    syncCursor = typeof page.syncCursor === "string" ? page.syncCursor : "";
    if (!syncCursor.startsWith("catalog-v2:")) {
      throw new E2EAssertionError(
        "Catalog full pull continuation cursor is missing.",
      );
    }
  } while (syncCursor);

  return {
    ...firstPage,
    catalog: aggregate,
    pageCount,
  };
}

function redactPositiveResult(input) {
  return {
    catalogImport: input.catalogImport,
    catalogFull: input.catalogFull,
    heartbeat: input.heartbeat,
    malformedResponseGuard: input.malformedResponseGuard,
    ok: input.ok,
    salesSync: input.salesSync,
    setup: input.setup,
    status: input.status,
    tombstoneRestore: input.tombstoneRestore,
    trustedDevice: input.trustedDevice,
  };
}

async function runPositiveE2E(client, config, dataset) {
  const firstLoginResult = await postJson("/api/pos/auth/first-login", {
    credential: config.posCredential,
    device: {
      appVersion: "TASK-032-local",
      deviceIdentifier: `${config.deviceName}_${dataset.runId}`,
      displayName: config.deviceName,
    },
    shopCode: config.shopCode,
    staffCode: config.staffCode,
  });
  const firstLogin = parseFirstLoginSuccess(firstLoginResult);
  const auth = authPayload(firstLogin);
  dataset.shopDeviceId = auth.shopDeviceId;
  dataset.posSessionId = auth.posSessionId;
  const persistedSession = await mustSingle(
    "Synthetic POS session exact-ID lookup",
    client
      .from("pos_sessions")
      .select("pos_device_credential_id")
      .eq("pos_session_id", auth.posSessionId)
      .eq("shop_device_id", auth.shopDeviceId)
      .eq("shop_id", dataset.shopId)
      .eq("staff_id", dataset.staffId)
      .maybeSingle(),
  );
  dataset.posDeviceCredentialId = persistedSession.pos_device_credential_id;

  const heartbeatResult = await postJson("/api/pos/session/heartbeat", {
    ...auth,
    appVersion: "TASK-032-local",
  });
  const heartbeat = parseHeartbeatSuccess(heartbeatResult);

  const catalogImportResult = await postJson(
    "/api/pos/catalog/import-sync",
    catalogImportPayload(dataset, auth),
  );
  const catalogImport = parseCatalogImportSuccess(catalogImportResult, dataset);
  await loadImportedDatasetIds(client, dataset, catalogImport.remoteProductId);

  const fullCatalog = await pullCompleteCatalog(auth);
  const productSeen = fullCatalog.catalog.products.some(
    (product) => product.productId === dataset.productId,
  );

  if (!productSeen) {
    throw new E2EAssertionError(
      "Catalog full pull did not include synthetic product.",
      {
        products: fullCatalog.catalog.products.length,
      },
    );
  }

  const sale = syntheticSale(dataset);
  const payload = salesPayload({ auth, dataset, sale });
  const acceptedResult = await postSalesJson(payload);
  const accepted = parseSalesSyncSuccess(
    acceptedResult,
    "sales accepted",
    "accepted",
  );

  if (
    accepted.batch.acceptedSaleCount !== 1 ||
    accepted.batch.duplicateSaleCount !== 0 ||
    accepted.sales?.[0]?.status !== "accepted"
  ) {
    throw new E2EAssertionError(
      "Sales accepted response counts are not stable.",
      {
        batch: accepted.batch,
        saleStatus: accepted.sales?.[0]?.status,
      },
    );
  }

  const duplicateResult = await postSalesJson(payload);
  const duplicate = parseSalesSyncSuccess(
    duplicateResult,
    "sales duplicate",
    "duplicate",
  );

  if (
    duplicate.batch.duplicateSaleCount !== 1 ||
    duplicate.sales?.[0]?.status !== "duplicate"
  ) {
    throw new E2EAssertionError(
      "Sales duplicate response counts are not stable.",
      {
        batch: duplicate.batch,
        saleStatus: duplicate.sales?.[0]?.status,
      },
    );
  }

  const conflictSale = syntheticSale(dataset, { amountClp: 1100 });
  const conflictResult = await postSalesJson(
    salesPayload({ auth, dataset, sale: conflictSale }),
  );
  parseSalesSyncConflict(conflictResult);

  const salesPersistence = await verifySalesPersistence(client, dataset, sale);

  return redactPositiveResult({
    catalogImport: {
      remotePriceCount: catalogImport.remotePriceCount,
      remoteProductIdPresent: Boolean(catalogImport.remoteProductId),
      status: catalogImport.status,
    },
    catalogFull: {
      categories: fullCatalog.catalog.categories.length,
      hasMore: fullCatalog.hasMore,
      prices: fullCatalog.catalog.prices.length,
      pages: fullCatalog.pageCount,
      productSeen,
      products: fullCatalog.catalog.products.length,
      status: 200,
      suppliers: fullCatalog.catalog.suppliers.length,
      syncMode: fullCatalog.syncMode,
    },
    heartbeat: {
      ok: heartbeat.ok === true,
      posSessionIdMatches:
        heartbeat.session.posSessionId === firstLogin.session.posSessionId,
      status: heartbeatResult.status,
    },
    malformedResponseGuard: "PASS",
    ok: true,
    setup: {
      datasetPrefix: "TASK032_TEST_",
      productBarcode: dataset.productBarcode,
      shopCode: dataset.shopCode,
      staffCode: dataset.staffCode,
      testRunId: config.testRunId,
    },
    salesSync: {
      acceptedSaleCount: accepted.batch.acceptedSaleCount,
      auditRows: salesPersistence.auditRows,
      conflictStatus: conflictResult.status,
      duplicateSaleCount: duplicate.batch.duplicateSaleCount,
      ledgerRows: salesPersistence.ledgerRows,
      movementRows: salesPersistence.movementRows,
      posSaleIdPresent: Boolean(salesPersistence.posSaleId),
      stockQuantityAfterDuplicate: salesPersistence.stockQuantity,
    },
    status:
      config.targetKind === "staging"
        ? "PASS_STAGING_POS_E2E_READY_FOR_CLEANUP"
        : "PASS_LOCAL_POS_E2E_READY_FOR_CLEANUP",
    tombstoneRestore: {
      status: "NOT_RUN_OUT_OF_SCOPE_AFTER_CANONICAL_IMPORT",
    },
    trustedDevice: {
      deviceTrusted: firstLogin.device.trusted === true,
      shopCode: firstLogin.shop.shopCode,
      status: firstLoginResult.status,
    },
  });
}

async function runPositiveFlow() {
  const config = validatePositiveConfig();

  if (!config.ok) {
    return {
      cleanup: {
        status: "NOT_RUN_NO_DATASET_CREATED",
      },
      ok: config.status === "BLOCKED_DATASET_NOT_CONFIGURED",
      positive: config,
    };
  }

  const client = createSupabaseAdmin(config);
  const lifecycle = {
    categoryId: null,
    mappingId: null,
    memberId: null,
    ownerUserId: null,
    platformActorId: null,
    platformClient: null,
    posDeviceCredentialId: null,
    posSessionId: null,
    productId: null,
    runId: config.runId,
    shopCode: config.shopCode,
    shopDeviceId: null,
    shopId: null,
    staffCode: config.staffCode,
    staffId: null,
    supplierId: null,
  };
  let dataset = null;
  let positive = null;
  let setupError = null;
  let cleanup = {
    status: "NOT_RUN_NO_DATASET_CREATED",
  };

  try {
    dataset = await setupSyntheticDataset(client, config, lifecycle);
    positive = await runPositiveE2E(client, config, dataset);
  } catch (error) {
    const status =
      error instanceof DatasetSetupError
        ? "BLOCKED_DATASET_SETUP"
        : "CHANGES_REQUIRED";
    setupError = {
      error: redactError(error),
      ok: false,
      status,
    };
  } finally {
    if (
      lifecycle.ownerUserId ||
      lifecycle.platformActorId ||
      lifecycle.shopId
    ) {
      try {
        const cleanupScope = {
          ...lifecycle,
          ...(dataset ?? {}),
          reason: "task032_positive_e2e_cleanup",
        };
        const cleanupExecution = await cleanupSyntheticDataset(client, {
          ...cleanupScope,
        });
        const cleanupVerification = await verifyCleanup(client, {
          ...cleanupScope,
        });
        cleanup = {
          execution: cleanupExecution,
          ok: cleanupExecution.ok && cleanupVerification.ok,
          status: cleanupVerification.ok
            ? "CLEANUP_EXECUTED_AND_VERIFIED"
            : "CLEANUP_VERIFICATION_FAILED",
          verification: cleanupVerification,
        };
      } catch (error) {
        cleanup = {
          error: redactError(error),
          ok: false,
          status: "CLEANUP_FAILED",
        };
      }
    }
  }

  if (!positive) {
    return {
      cleanup,
      ok: false,
      positive: setupError ?? datasetBlocked("Positive POS E2E did not run."),
    };
  }

  if (!cleanup.ok) {
    return {
      cleanup,
      ok: false,
      positive: {
        ...positive,
        ok: false,
        status: "CHANGES_REQUIRED",
      },
    };
  }

  return {
    cleanup,
    ok: true,
    positive: {
      ...positive,
      status:
        config.targetKind === "staging"
          ? "PASS_STAGING_POS_E2E_WITH_CLEANUP"
          : "PASS_LOCAL_POS_E2E_WITH_CLEANUP",
    },
  };
}

function outputIsSecretSafe(output) {
  return !sensitiveTextPattern.test(JSON.stringify(output));
}

async function main() {
  const startedAt = new Date().toISOString();

  if (envValue(STAGING_DRY_RUN_FLAG) === "yes") {
    const stagingPrecheck = validateStagingDryRunConfig();
    const output = {
      baseUrl: baseUrlForOutput(),
      finishedAt: new Date().toISOString(),
      ok: stagingPrecheck.ok,
      stagingPrecheck,
      startedAt,
      status: stagingPrecheck.status,
    };

    if (!outputIsSecretSafe(output)) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            status: "CHANGES_REQUIRED",
            reason: "Harness output failed secret redaction guard.",
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
      return;
    }

    console.log(JSON.stringify(output, null, 2));

    if (!output.ok) {
      process.exitCode = 1;
    }

    return;
  }

  if (envValue("TASK032_POS_E2E_REQUIRE_STAGING_TARGET") === "yes") {
    const positiveConfig = validatePositiveConfig();

    if (!positiveConfig.ok) {
      const output = {
        baseUrl: baseUrlForOutput(),
        cleanup: { status: "NOT_RUN_NO_DATASET_CREATED" },
        finishedAt: new Date().toISOString(),
        ok: false,
        positive: positiveConfig,
        startedAt,
        status: positiveConfig.status,
      };

      if (!outputIsSecretSafe(output)) {
        console.error(
          JSON.stringify(
            {
              ok: false,
              status: "CHANGES_REQUIRED",
              reason: "Harness output failed secret redaction guard.",
            },
            null,
            2,
          ),
        );
        process.exitCode = 1;
        return;
      }

      console.log(JSON.stringify(output, null, 2));
      process.exitCode = 1;
      return;
    }
  }

  const negative = [];

  for (const testCase of negativeCases) {
    negative.push(await runNegativeCase(testCase));
  }

  const negativeFailed = negative.filter((result) => !result.ok);
  const positiveFlow = await runPositiveFlow();
  let status = positiveFlow.positive.status;

  if (negativeFailed.length > 0) {
    status = "CHANGES_REQUIRED";
  } else if (
    positiveFlow.positive.status === "BLOCKED_DATASET_NOT_CONFIGURED"
  ) {
    status = "PASS_NEGATIVE_HARNESS_ONLY";
  }

  const output = {
    baseUrl: baseUrlForOutput(),
    cleanup: positiveFlow.cleanup,
    finishedAt: new Date().toISOString(),
    negative,
    ok: negativeFailed.length === 0 && positiveFlow.ok,
    positive: positiveFlow.positive,
    startedAt,
    status,
  };

  if (!outputIsSecretSafe(output)) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          status: "CHANGES_REQUIRED",
          reason: "Harness output failed secret redaction guard.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(output, null, 2));

  if (!output.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        baseUrl: baseUrlForOutput(),
        error: redactError(error),
        ok: false,
        status: "BLOCKED_BASE_URL_UNAVAILABLE",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
