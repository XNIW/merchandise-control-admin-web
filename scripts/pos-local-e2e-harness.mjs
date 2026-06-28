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
const baseUrl = new URL(process.env.TASK032_POS_E2E_BASE_URL ?? DEFAULT_BASE_URL);
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
    throw new Error(`Synthetic prefix ${prefix} leaves insufficient identifier space.`);
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
  return envValue("TASK032_POS_E2E_REQUIRE_TEST_MARKER") || SYNTHETIC_SALES_PREFIX;
}

function validateRequiredTestMarker() {
  const marker = configuredTestMarker();

  if (marker !== SYNTHETIC_SALES_PREFIX) {
    return datasetBlocked("Test marker must be exactly TASK032 for positive POS E2E.", {
      marker,
    });
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
    return datasetBlocked("Staging POS E2E requires TASK032_POS_E2E_ALLOW_STAGING=yes.");
  }

  let parsedBaseUrl;
  try {
    parsedBaseUrl = new URL(baseUrl.toString());
  } catch {
    return datasetBlocked("Admin Web base URL is invalid.");
  }

  const baseHost = parsedBaseUrl.hostname.toLowerCase();
  const hostAllowlist = splitEnvList(envValue("TASK032_POS_E2E_STAGING_HOST_ALLOWLIST"));
  const expectedProjectRef = envValue("TASK032_POS_E2E_STAGING_PROJECT_REF")
    .toLowerCase();
  const actualProjectRef = supabaseProjectRefFromUrl(supabaseUrl);

  if (parsedBaseUrl.protocol !== "https:" || parsedBaseUrl.username || parsedBaseUrl.password) {
    return datasetBlocked("Staging Admin Web base URL must be HTTPS without URL credentials.");
  }

  if (baseHost.endsWith("vercel.app")) {
    return datasetBlocked("Vercel preview/production hosts are not allowed for POS positive staging E2E.");
  }

  if (!hostAllowlist.includes(baseHost)) {
    return datasetBlocked("Staging Admin Web host is not in TASK032_POS_E2E_STAGING_HOST_ALLOWLIST.", {
      baseHost,
    });
  }

  if (!isExplicitNonProductionHostname(baseHost)) {
    return datasetBlocked("Staging Admin Web host must contain an explicit non-production label.");
  }

  if (!/^[a-z0-9-]{6,63}$/.test(expectedProjectRef)) {
    return datasetBlocked("TASK032_POS_E2E_STAGING_PROJECT_REF is missing or invalid.");
  }

  if (actualProjectRef !== expectedProjectRef) {
    return datasetBlocked("Supabase URL does not match the allowlisted staging project ref.", {
      expectedProjectRef: redactProjectRef(expectedProjectRef),
      supabaseProjectRef: actualProjectRef ? redactProjectRef(actualProjectRef) : "unresolved",
    });
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
    ? Array.from(new Set([...POSITIVE_ENV_KEYS, ...STAGING_ENV_KEYS, "TASK032_POS_E2E_BASE_URL"]))
    : POSITIVE_ENV_KEYS;
  const missing = requiredEnvKeys.filter((key) => !envValue(key));

  if (missing.length > 0) {
    return datasetBlocked("Positive POS E2E is missing required env names.", {
      missing,
    });
  }

  if (envValue("TASK032_POS_E2E_ALLOW_DATASET_SETUP") !== "yes") {
    return datasetBlocked("Dataset setup must be explicitly allowed before positive POS E2E.");
  }

  if (envValue("TASK032_POS_E2E_ALLOW_CLEANUP") !== "yes") {
    return datasetBlocked("Cleanup must be explicitly allowed before positive POS E2E.");
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

  const requestedRunId = normalizeRunId(envValue("TASK032_POS_E2E_TEST_RUN_ID"));

  if (target.targetKind === "staging" && !requestedRunId) {
    return datasetBlocked("Staging POS E2E requires TASK032_POS_E2E_TEST_RUN_ID with at least 6 safe characters.");
  }

  const runId = requestedRunId
    ? `${requestedRunId}${safeRunId().slice(0, 4)}`
    : safeRunId();
  const identifierRunId = requestedRunId || runId;
  const shopCode = (
    envValue("TASK032_POS_E2E_SHOP_CODE") || syntheticCode(SYNTHETIC_SHOP_CODE_PREFIX, identifierRunId)
  ).toUpperCase();
  const staffCode = (
    envValue("TASK032_POS_E2E_STAFF_CODE") || syntheticCode(SYNTHETIC_STAFF_CODE_PREFIX, identifierRunId)
  ).toUpperCase();
  const deviceName =
    envValue("TASK032_POS_E2E_DEVICE_NAME") ||
    `${SYNTHETIC_DEVICE_PREFIX}${identifierRunId}${safeRunId().slice(0, 4)}`;
  const posCredential =
    envValue("TASK032_POS_E2E_PIN_OR_PASSWORD") ||
    `Task032-POS-${randomBytes(12).toString("base64url")}`;

  if (!shopCode.startsWith(SYNTHETIC_SHOP_CODE_PREFIX)) {
    return datasetBlocked(`Shop code must use ${SYNTHETIC_SHOP_CODE_PREFIX} prefix.`);
  }

  if (!staffCode.startsWith(SYNTHETIC_STAFF_CODE_PREFIX)) {
    return datasetBlocked(`Staff code must use ${SYNTHETIC_STAFF_CODE_PREFIX} prefix.`);
  }

  if (!deviceName.startsWith(SYNTHETIC_DEVICE_PREFIX)) {
    return datasetBlocked(`Device name must use ${SYNTHETIC_DEVICE_PREFIX} prefix.`);
  }

  if (
    target.targetKind === "staging" &&
    (!shopCode.startsWith(syntheticRequiredPrefix(SYNTHETIC_SHOP_CODE_PREFIX, requestedRunId)) ||
      !staffCode.startsWith(syntheticRequiredPrefix(SYNTHETIC_STAFF_CODE_PREFIX, requestedRunId)) ||
      !deviceName.toUpperCase().includes(requestedRunId))
  ) {
    return datasetBlocked("Staging synthetic identifiers must include TASK032_POS_E2E_TEST_RUN_ID.");
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
    return datasetBlocked("Staging dry-run requires TASK032_POS_E2E_STAGING_DRY_RUN=yes.");
  }

  if (envValue("TASK032_POS_E2E_ENABLE_POSITIVE") !== "yes") {
    return datasetBlocked("Staging dry-run requires TASK032_POS_E2E_ENABLE_POSITIVE=yes.");
  }

  const missing = STAGING_ENV_KEYS.filter((key) => !envValue(key));

  if (missing.length > 0) {
    return datasetBlocked("Staging dry-run is missing required env names.", {
      missing,
    });
  }

  if (envValue("TASK032_POS_E2E_ALLOW_DATASET_SETUP") !== "yes") {
    return datasetBlocked("Dataset setup must be explicitly allowed for staging precheck.");
  }

  if (envValue("TASK032_POS_E2E_ALLOW_CLEANUP") !== "yes") {
    return datasetBlocked("Cleanup must be explicitly allowed for staging precheck.");
  }

  const markerCheck = validateRequiredTestMarker();
  if (!markerCheck.ok) {
    return markerCheck;
  }

  const requestedRunId = normalizeRunId(envValue("TASK032_POS_E2E_TEST_RUN_ID"));
  if (!requestedRunId) {
    return datasetBlocked("Staging dry-run requires TASK032_POS_E2E_TEST_RUN_ID with at least 6 safe characters.");
  }

  const target = validatePositiveTarget(envValue("NEXT_PUBLIC_SUPABASE_URL"));
  if (!target.ok) {
    return target;
  }

  if (target.targetKind !== "staging") {
    return datasetBlocked("Staging dry-run must target an allowlisted non-local staging environment.");
  }

  const shopCodePrefix = syntheticRequiredPrefix(SYNTHETIC_SHOP_CODE_PREFIX, requestedRunId);

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

function legacyTimestamp(date = new Date()) {
  return date.toISOString().slice(0, 19).replace("T", " ");
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

async function queryShopIds(client, input = {}) {
  const query = client.from("shops").select("shop_id,shop_code");
  let result;

  if (input.shopCode) {
    result = await query.eq("shop_code", input.shopCode);
  } else if (input.shopCodeLike) {
    result = await query.like("shop_code", input.shopCodeLike);
  } else if (input.allTask032) {
    result = await query.like("shop_code", `${SYNTHETIC_SHOP_CODE_PREFIX}%`);
  } else {
    return [];
  }

  const { data, error } = result;

  if (error) {
    throw new DatasetSetupError("Existing synthetic shop lookup failed.", {
      error: redactError(error),
    });
  }

  return (data ?? []).map((row) => row.shop_id);
}

async function queryOwnerIdsForShops(client, shopIds) {
  if (shopIds.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("shop_inventory_sources")
    .select("owner_user_id")
    .in("shop_id", shopIds);

  if (error) {
    throw new DatasetSetupError("Existing synthetic owner lookup failed.", {
      error: redactError(error),
    });
  }

  return [
    ...new Set(
      (data ?? [])
        .map((row) => row.owner_user_id)
        .filter((value) => typeof value === "string" && value.length > 0),
    ),
  ];
}

function applySyntheticStaffScope(query, input) {
  if (input.allTask032) {
    return query.like("staff_code", `${SYNTHETIC_STAFF_CODE_PREFIX}%`);
  }

  if (input.staffCodeLike) {
    return query.like("staff_code", input.staffCodeLike);
  }

  return query.eq("staff_code", input.staffCode);
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

  const batchIds = (batchLookup.data ?? []).map((row) => row.pos_sales_sync_batch_id);
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
  const shopIds = input.shopId
    ? [input.shopId]
    : await queryShopIds(client, input);
  const ownerIds = input.ownerUserId
    ? [input.ownerUserId]
    : await queryOwnerIdsForShops(client, shopIds);
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
    const actorProfileId =
      input.ownerUserId ?? (await queryOwnerIdsForShops(client, [shopId]))[0];

    if (!actorProfileId) {
      throw new DatasetSetupError("Synthetic shop cleanup has no owner actor.");
    }

    const salesCleanup = await cleanupSyntheticSalesRecords(client, shopId);
    summary.immutableLedgerRowsRetained += salesCleanup.immutableLedgerRowsRetained;
    summary.immutableSaleLineRowsRetained += salesCleanup.immutableSaleLineRowsRetained;
    summary.immutableSaleRowsRetained += salesCleanup.immutableSaleRowsRetained;
    summary.immutableSalesBatchRowsRetained +=
      salesCleanup.immutableSalesBatchRowsRetained;
    summary.immutableStockMovementRowsRetained +=
      salesCleanup.immutableStockMovementRowsRetained;

    const activeSessions = await client
      .from("pos_sessions")
      .update({
        revoked_at: timestamp,
        revoked_reason: input.reason,
        status: "revoked",
        updated_at: timestamp,
      })
      .eq("shop_id", shopId)
      .eq("status", "active")
      .select("pos_session_id");
    if (activeSessions.error) {
      throw new DatasetSetupError("Synthetic session cleanup failed.", {
        error: redactError(activeSessions.error),
      });
    }
    summary.activeSessionRowsTouched += activeSessions.data?.length ?? 0;

    const activeCredentials = await client
      .from("pos_device_credentials")
      .update({
        revoked_at: timestamp,
        revoked_reason: input.reason,
        status: "revoked",
        updated_at: timestamp,
      })
      .eq("shop_id", shopId)
      .eq("status", "active")
      .select("pos_device_credential_id");
    if (activeCredentials.error) {
      throw new DatasetSetupError("Synthetic device credential cleanup failed.", {
        error: redactError(activeCredentials.error),
      });
    }
    summary.activeCredentialRowsTouched += activeCredentials.data?.length ?? 0;

    const activeDevices = await client
      .from("shop_devices")
      .update({
        revoked_at: timestamp,
        status: "revoked",
        updated_at: timestamp,
      })
      .eq("shop_id", shopId)
      .eq("status", "active")
      .select("shop_device_id");
    if (activeDevices.error) {
      throw new DatasetSetupError("Synthetic device cleanup failed.", {
        error: redactError(activeDevices.error),
      });
    }
    summary.activeDeviceRowsTouched += activeDevices.data?.length ?? 0;

    await mustOk(
      "Synthetic staff archive",
      applySyntheticStaffScope(
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
          .eq("shop_id", shopId),
        input,
      ),
    );

    await mustOk(
      "Synthetic mapping disable",
      client
        .from("shop_inventory_sources")
        .update({
          disabled_at: timestamp,
        })
        .eq("shop_id", shopId)
        .is("disabled_at", null),
    );

    await mustOk(
      "Synthetic member suspend",
      client
        .from("shop_members")
        .update({
          membership_status: "suspended",
          suspended_at: timestamp,
          updated_at: timestamp,
        })
        .eq("shop_id", shopId)
        .eq("membership_status", "active"),
    );

    await mustOk(
      "Synthetic shop archive",
      client
        .from("shops")
        .update({
          archived_at: timestamp,
          archived_by_profile_id: actorProfileId,
          shop_status: "archived",
          status_reason_redacted: input.reason,
          status_changed_at: timestamp,
          status_changed_by_profile_id: actorProfileId,
          suspended_at: null,
          suspended_by_profile_id: null,
          updated_at: timestamp,
        })
        .eq("shop_id", shopId),
    );
  }

  for (const ownerUserId of ownerIds) {
    const syntheticProducts = await client
      .from("inventory_products")
      .select("id")
      .eq("owner_user_id", ownerUserId)
      .like("barcode", "TASK032_BARCODE_%");

    if (syntheticProducts.error) {
      throw new DatasetSetupError("Synthetic price product lookup failed.", {
        error: redactError(syntheticProducts.error),
      });
    }

    const syntheticProductIds = (syntheticProducts.data ?? [])
      .map((row) => row.id)
      .filter(Boolean);

    if (syntheticProductIds.length > 0) {
      await mustOk(
        "Synthetic price cleanup",
        client
          .from("inventory_product_prices")
          .delete()
          .eq("owner_user_id", ownerUserId)
          .eq("source", "TASK-032")
          .in("product_id", syntheticProductIds),
      );
    }

    await mustOk(
      "Synthetic product tombstone",
      client
        .from("inventory_products")
        .update({
          deleted_at: timestamp,
          updated_at: timestamp,
        })
        .eq("owner_user_id", ownerUserId)
        .like("barcode", "TASK032_BARCODE_%"),
    );

    await mustOk(
      "Synthetic category tombstone",
      client
        .from("inventory_categories")
        .update({
          deleted_at: timestamp,
          updated_at: timestamp,
        })
        .eq("owner_user_id", ownerUserId)
        .like("name", "TASK032_TEST_CATEGORY_%"),
    );

    await mustOk(
      "Synthetic supplier tombstone",
      client
        .from("inventory_suppliers")
        .update({
          deleted_at: timestamp,
          updated_at: timestamp,
        })
        .eq("owner_user_id", ownerUserId)
        .like("name", "TASK032_TEST_SUPPLIER_%"),
    );

    await mustOk(
      "Synthetic profile disable",
      client
        .from("profiles")
        .update({
          disabled_at: timestamp,
          profile_status: "disabled",
          updated_at: timestamp,
        })
        .eq("profile_id", ownerUserId)
        .neq("profile_status", "disabled"),
    );

    const authDelete = await client.auth.admin.deleteUser(ownerUserId);

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
  const shopIds = input.shopId
    ? [input.shopId]
    : await queryShopIds(client, input);
  const ownerIds = input.ownerUserId
    ? [input.ownerUserId]
    : await queryOwnerIdsForShops(client, shopIds);
  const counts = {
    activeCredentials: 0,
    activeDevices: 0,
    activeMappings: 0,
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
      (input.allTask032
        ? client
            .from("shops")
            .select("shop_id")
            .like("shop_code", "TASK032_TEST_SHOP_%")
            .neq("shop_status", "archived")
        : client
            .from("shops")
            .select("shop_id")
            .eq("shop_code", input.shopCode)
            .neq("shop_status", "archived")),
      client
        .from("staff_accounts")
        .select("staff_id")
        .in("shop_id", shopIds)
        .like(
          "staff_code",
          input.allTask032
            ? `${SYNTHETIC_STAFF_CODE_PREFIX}%`
            : input.staffCodeLike ?? input.staffCode,
        )
        .neq("status", "archived"),
      client
        .from("shop_devices")
        .select("shop_device_id")
        .in("shop_id", shopIds)
        .eq("status", "active"),
      client
        .from("pos_sessions")
        .select("pos_session_id")
        .in("shop_id", shopIds)
        .eq("status", "active"),
      client
        .from("pos_device_credentials")
        .select("pos_device_credential_id")
        .in("shop_id", shopIds)
        .eq("status", "active"),
      client
        .from("shop_inventory_sources")
        .select("shop_inventory_source_id")
        .in("shop_id", shopIds)
        .eq("mapping_state", "mapped")
        .is("disabled_at", null),
      client
        .from("shop_members")
        .select("shop_member_id")
        .in("shop_id", shopIds)
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
        throw new DatasetSetupError(`Cleanup verification query failed: ${label}.`, {
          error: redactError(result.error),
        });
      }
      counts[label] = result.data?.length ?? 0;
    }
  }

  const ownerScopes = input.allTask032 ? [null] : ownerIds;

  for (const ownerUserId of ownerScopes) {
    const productQuery = client
      .from("inventory_products")
      .select("id")
      .like("barcode", "TASK032_BARCODE_%")
      .is("deleted_at", null);
    const categoryQuery = client
      .from("inventory_categories")
      .select("id")
      .like("name", "TASK032_TEST_CATEGORY_%")
      .is("deleted_at", null);
    const supplierQuery = client
      .from("inventory_suppliers")
      .select("id")
      .like("name", "TASK032_TEST_SUPPLIER_%")
      .is("deleted_at", null);
    const [products, categories, suppliers] = await Promise.all([
      ownerUserId ? productQuery.eq("owner_user_id", ownerUserId) : productQuery,
      ownerUserId ? categoryQuery.eq("owner_user_id", ownerUserId) : categoryQuery,
      ownerUserId ? supplierQuery.eq("owner_user_id", ownerUserId) : supplierQuery,
    ]);

    for (const [label, result] of Object.entries({
      activeTestCategories: categories,
      activeTestProducts: products,
      activeTestSuppliers: suppliers,
    })) {
      if (result.error) {
        throw new DatasetSetupError(`Cleanup verification query failed: ${label}.`, {
          error: redactError(result.error),
        });
      }
      counts[label] += result.data?.length ?? 0;
    }
  }

  const activeLeftovers = Object.entries(counts)
    .filter(([key]) => !key.startsWith("retainedImmutable"))
    .reduce((total, [, value]) => total + value, 0);

  return {
    counts,
    ok: activeLeftovers === 0,
    status: activeLeftovers === 0 ? "CLEANUP_VERIFIED" : "CLEANUP_LEFTOVERS_FOUND",
  };
}

async function setupSyntheticDataset(client, config) {
  const runId = config.runId;
  const timestamp = nowIso();
  const ownerEmail = `task032-test-${runId.toLowerCase()}@example.invalid`;
  const generatedAuthSecret = randomBytes(24).toString("base64url");

  await cleanupSyntheticDataset(
    client,
    config.targetKind === "staging"
      ? {
          reason: "task032_pre_setup_cleanup",
          shopCodeLike: `${syntheticRequiredPrefix(SYNTHETIC_SHOP_CODE_PREFIX, config.testRunId)}%`,
          staffCodeLike: `${syntheticRequiredPrefix(SYNTHETIC_STAFF_CODE_PREFIX, config.testRunId)}%`,
        }
      : {
          allTask032: true,
          reason: "task032_pre_setup_cleanup",
        },
  );

  const userResult = await client.auth.admin.createUser({
    email: ownerEmail,
    email_confirm: true,
    password: generatedAuthSecret,
    user_metadata: {
      source: "TASK-032",
    },
  });

  if (userResult.error || !userResult.data.user) {
    throw new DatasetSetupError("Synthetic auth user creation failed.", {
      error: redactError(userResult.error),
    });
  }

  const ownerUserId = userResult.data.user.id;
  const categoryName = `TASK032_TEST_CATEGORY_${runId}`;
  const supplierName = `TASK032_TEST_SUPPLIER_${runId}`;
  const productBarcode = `TASK032_BARCODE_${runId}`;
  const productName = `TASK032_TEST_PRODUCT_${runId}`;
  const staffHash = await hashStaffCredential(config.posCredential);

  await mustOk(
    "Synthetic profile upsert",
    client.from("profiles").upsert(
      {
        display_name: `TASK032_TEST_OWNER_${runId}`,
        profile_id: ownerUserId,
        profile_status: "active",
      },
      { onConflict: "profile_id" },
    ),
  );

  const shop = await mustSingle(
    "Synthetic shop insert",
    client
      .from("shops")
      .insert({
        created_by_profile_id: ownerUserId,
        shop_code: config.shopCode,
        shop_name: `TASK032_TEST_SHOP_${runId}`,
        shop_status: "active",
      })
      .select("shop_id,shop_code")
      .maybeSingle(),
  );

  await mustOk(
    "Synthetic shop member insert",
    client.from("shop_members").insert({
      membership_status: "active",
      profile_id: ownerUserId,
      role_key: "shop_owner",
      shop_id: shop.shop_id,
    }),
  );

  const staff = await mustSingle(
    "Synthetic staff insert",
    client
      .from("staff_accounts")
      .insert({
        credential_hash: staffHash,
        credential_kind: "password",
        credential_status: "active",
        credential_updated_at: timestamp,
        credential_version: 1,
        display_name: `TASK032_POS_STAFF_${runId}`,
        failed_attempts: 0,
        must_change_credential: false,
        role_key: "cashier",
        shop_id: shop.shop_id,
        staff_code: config.staffCode,
        status: "active",
      })
      .select("staff_id,staff_code")
      .maybeSingle(),
  );

  await mustOk(
    "Synthetic inventory source insert",
    client.from("shop_inventory_sources").insert({
      mapping_state: "mapped",
      owner_user_id: ownerUserId,
      shop_id: shop.shop_id,
      source_kind: "mobile_owner",
      verified_at: timestamp,
      verified_by_profile_id: ownerUserId,
    }),
  );

  const supplier = await mustSingle(
    "Synthetic supplier insert",
    client
      .from("inventory_suppliers")
      .insert({
        name: supplierName,
        owner_user_id: ownerUserId,
      })
      .select("id,name")
      .maybeSingle(),
  );

  const category = await mustSingle(
    "Synthetic category insert",
    client
      .from("inventory_categories")
      .insert({
        name: categoryName,
        owner_user_id: ownerUserId,
      })
      .select("id,name")
      .maybeSingle(),
  );

  const product = await mustSingle(
    "Synthetic product insert",
    client
      .from("inventory_products")
      .insert({
        barcode: productBarcode,
        category_id: category.id,
        item_number: `TASK032_ITEM_${runId}`,
        owner_user_id: ownerUserId,
        product_name: productName,
        purchase_price: 10.5,
        retail_price: 15.75,
        stock_quantity: 7,
        supplier_id: supplier.id,
      })
      .select("id,barcode,product_name")
      .maybeSingle(),
  );

  await mustOk(
    "Synthetic price insert",
    client.from("inventory_product_prices").insert([
      {
        created_at: legacyTimestamp(),
        effective_at: legacyTimestamp(),
        id: randomUUID(),
        owner_user_id: ownerUserId,
        price: 10.5,
        product_id: product.id,
        source: "TASK-032",
        type: "PURCHASE",
      },
      {
        created_at: legacyTimestamp(),
        effective_at: legacyTimestamp(),
        id: randomUUID(),
        owner_user_id: ownerUserId,
        price: 15.75,
        product_id: product.id,
        source: "TASK-032",
        type: "RETAIL",
      },
    ]),
  );

  return {
    categoryId: category.id,
    categoryName,
    ownerUserId,
    productBarcode,
    productId: product.id,
    productName,
    runId,
    shopCode: shop.shop_code,
    shopId: shop.shop_id,
    staffCode: staff.staff_code,
    staffId: staff.staff_id,
    supplierId: supplier.id,
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
    requestId: response.headers.get("X-Request-Id") ?? parsedBody?.requestId ?? "",
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
    requestId: response.headers.get("X-Request-Id") ?? parsedBody?.requestId ?? "",
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
  const requestId = response.headers.get("X-Request-Id") ?? parsedBody?.requestId ?? "";
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
    throw new E2EAssertionError(`${label} did not return Cache-Control no-store.`, {
      status: result.status,
    });
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
    throw new E2EAssertionError(`${label} did not return expected sales status.`, {
      code: result.body?.code,
      status: result.status,
      syncStatus: result.body?.batch?.status,
    });
  }

  return result.body;
}

function parseSalesSyncConflict(result) {
  assertNoStore("sales conflict", result);

  if (result.status !== 409 || result.body?.ok !== false || result.body?.code !== "conflict") {
    throw new E2EAssertionError("Sales conflict check did not return stable 409 conflict.", {
      code: result.body?.code,
      status: result.status,
    });
  }

  return true;
}

async function verifySalesPersistence(client, dataset, sale) {
  const productResult = await client
    .from("inventory_products")
    .select("stock_quantity")
    .eq("id", dataset.productId)
    .eq("owner_user_id", dataset.ownerUserId)
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
    throw new MalformedResponseError("POS first login success response is malformed.", {
      status: result.status,
    });
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
    throw new E2EAssertionError(`${label} did not return a valid catalog payload.`, {
      code: result.body?.code,
      status: result.status,
    });
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

function redactPositiveResult(input) {
  return {
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

  const heartbeatResult = await postJson("/api/pos/session/heartbeat", {
    ...auth,
    appVersion: "TASK-032-local",
  });
  const heartbeat = parseHeartbeatSuccess(heartbeatResult);

  const fullCatalogResult = await postJson("/api/pos/catalog/pull", {
    ...auth,
    limit: 25,
  });
  const fullCatalog = parseCatalogSuccess(fullCatalogResult, "catalog full pull");
  const productSeen = fullCatalog.catalog.products.some(
    (product) => product.productId === dataset.productId,
  );

  if (!productSeen) {
    throw new E2EAssertionError("Catalog full pull did not include synthetic product.", {
      products: fullCatalog.catalog.products.length,
    });
  }

  const tombstoneAt = nowIso();
  await mustOk(
    "Synthetic product tombstone for delta",
    client
      .from("inventory_products")
      .update({
        deleted_at: tombstoneAt,
        updated_at: tombstoneAt,
      })
      .eq("id", dataset.productId)
      .eq("owner_user_id", dataset.ownerUserId),
  );

  const tombstoneCatalogResult = await postJson("/api/pos/catalog/pull", {
    ...auth,
    limit: 25,
    updatedSince: fullCatalog.serverTime,
  });
  const tombstoneCatalog = parseCatalogSuccess(
    tombstoneCatalogResult,
    "catalog tombstone delta",
  );
  const tombstoneSeen = tombstoneCatalog.catalog.tombstones.products.some(
    (product) => product.productId === dataset.productId,
  );

  if (!tombstoneSeen) {
    throw new E2EAssertionError("Catalog delta did not include product tombstone.", {
      tombstones: tombstoneCatalog.catalog.tombstones.products.length,
    });
  }

  const restoreAt = nowIso();
  await mustOk(
    "Synthetic product restore for delta",
    client
      .from("inventory_products")
      .update({
        deleted_at: null,
        updated_at: restoreAt,
      })
      .eq("id", dataset.productId)
      .eq("owner_user_id", dataset.ownerUserId),
  );

  const restoreCatalogResult = await postJson("/api/pos/catalog/pull", {
    ...auth,
    limit: 25,
    updatedSince: tombstoneCatalog.serverTime,
  });
  const restoreCatalog = parseCatalogSuccess(
    restoreCatalogResult,
    "catalog restore delta",
  );
  const restoreSeen = restoreCatalog.catalog.products.some(
    (product) => product.productId === dataset.productId,
  );

  if (!restoreSeen) {
    throw new E2EAssertionError("Catalog delta did not include restored product.", {
      products: restoreCatalog.catalog.products.length,
    });
  }

  const sale = syntheticSale(dataset);
  const payload = salesPayload({ auth, dataset, sale });
  const acceptedResult = await postSalesJson(payload);
  const accepted = parseSalesSyncSuccess(acceptedResult, "sales accepted", "accepted");

  if (
    accepted.batch.acceptedSaleCount !== 1 ||
    accepted.batch.duplicateSaleCount !== 0 ||
    accepted.sales?.[0]?.status !== "accepted"
  ) {
    throw new E2EAssertionError("Sales accepted response counts are not stable.", {
      batch: accepted.batch,
      saleStatus: accepted.sales?.[0]?.status,
    });
  }

  const duplicateResult = await postSalesJson(payload);
  const duplicate = parseSalesSyncSuccess(duplicateResult, "sales duplicate", "duplicate");

  if (
    duplicate.batch.duplicateSaleCount !== 1 ||
    duplicate.sales?.[0]?.status !== "duplicate"
  ) {
    throw new E2EAssertionError("Sales duplicate response counts are not stable.", {
      batch: duplicate.batch,
      saleStatus: duplicate.sales?.[0]?.status,
    });
  }

  const conflictSale = syntheticSale(dataset, { amountClp: 1100 });
  const conflictResult = await postSalesJson(salesPayload({ auth, dataset, sale: conflictSale }));
  parseSalesSyncConflict(conflictResult);

  const salesPersistence = await verifySalesPersistence(client, dataset, sale);

  return redactPositiveResult({
    catalogFull: {
      categories: fullCatalog.catalog.categories.length,
      hasMore: fullCatalog.hasMore,
      prices: fullCatalog.catalog.prices.length,
      productSeen,
      products: fullCatalog.catalog.products.length,
      status: fullCatalogResult.status,
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
      restoreSeen,
      restoreStatus: restoreCatalogResult.status,
      tombstoneSeen,
      tombstoneStatus: tombstoneCatalogResult.status,
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
  let dataset = null;
  let positive = null;
  let setupError = null;
  let cleanup = {
    status: "NOT_RUN_NO_DATASET_CREATED",
  };

  try {
    dataset = await setupSyntheticDataset(client, config);
    positive = await runPositiveE2E(client, config, dataset);
  } catch (error) {
    const status =
      error instanceof DatasetSetupError ? "BLOCKED_DATASET_SETUP" : "CHANGES_REQUIRED";
    setupError = {
      error: redactError(error),
      ok: false,
      status,
    };
  } finally {
    if (dataset) {
      try {
        const cleanupExecution = await cleanupSyntheticDataset(client, {
          allTask032: config.targetKind !== "staging",
          ...dataset,
          reason: "task032_positive_e2e_cleanup",
        });
        const cleanupVerification = await verifyCleanup(client, {
          allTask032: config.targetKind !== "staging",
          ...dataset,
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
  } else if (positiveFlow.positive.status === "BLOCKED_DATASET_NOT_CONFIGURED") {
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
