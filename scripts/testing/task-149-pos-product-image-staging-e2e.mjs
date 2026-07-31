#!/usr/bin/env node

import { createHash, randomBytes, randomUUID, scrypt } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import {
  assertNoProductionProjectRef,
  assertTargetEnv,
  normalizeTarget,
} from "./target-guardrails.mjs";

const APP_VERSION = "task149-forward-compatible-unknown-client";
const SCHEMA_VERSION = "pos-product-image-v1";
const PRODUCT_IMAGE_BUCKET = "product-images";
const CLEANUP_RPC = "task_149_pos_product_image_fixture_cleanup_v1";
const CONFIRMATION_VALUE = "TASK149_SYNTHETIC_ONLY";
const MAX_CATALOG_PAGES = 676;
const READ_URL_TTL_SECONDS = 300;
const URL_EXPIRY_GRACE_MILLISECONDS = 3_000;
const URL_EXPIRY_MAX_WAIT_MILLISECONDS = 330_000;
const REQUEST_TIMEOUT_MILLISECONDS = 45_000;
const CLEANUP_PENDING_MAX_WAIT_MILLISECONDS = 5_000;
const CLEANUP_PENDING_POLL_MILLISECONDS = 250;
const POS_UPLOAD_CAPABILITY_MAX_WINDOW_MILLISECONDS =
  2 * 60 * 60 * 1000 + 6 * 60_000;
const POS_UPLOAD_CAPABILITY_EXPIRY_GRACE_MILLISECONDS = 5_000;
const STAFF_CREDENTIAL_SCHEME = "scrypt-v1";
const STAFF_KEY_LENGTH = 64;
const STAFF_SALT_BYTES = 16;
const STAFF_SCRYPT_PARAMS = { N: 16384, p: 1, r: 8 };
const STAFF_SCRYPT_MAXMEM = 64 * 1024 * 1024;
const AUTH_USER_PAGE_SIZE = 1_000;
const AUTH_USER_MAX_PAGES = 1_000;
const CATALOG_MANIFEST_PAGE_SIZE = 1_000;
const CATALOG_MANIFEST_MAX_PAGES = 8;
const CLEANED_ACTOR_SOURCE = "TASK149_CLEANED";
const HARNESS_COOPERATIVE_ABORT_SIGNAL = "SIGUSR2";
const deriveScrypt = promisify(scrypt);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUN_ID_PATTERN = /^[A-Z0-9]{6,12}$/;
const SAFE_CODE_PATTERN = /^[a-z][a-z0-9_]{1,79}$/;
const RESOURCE_FAILURE_PATTERN =
  /exceededCpu|exceededMemory|worker exceeded resource|error 1102|total unavailable/i;
const FORBIDDEN_DURABLE_TEXT_PATTERN =
  /https?:\\*\/\\*\/|signedUrl|uploadUrl|deviceToken|sessionToken|trustedDeviceToken|service_role|sb_secret_|shops\\*\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\*\/products\\*\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\*\/primary\\*\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\*\/(?:main|thumb)\.jpg/i;
const FORBIDDEN_OUTPUT_PATTERN =
  /https?:\/\/|sb_secret_|eyJ[A-Za-z0-9_-]*\.|mcpos_(?:device|session)_[A-Za-z0-9_-]+|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const REQUEST_LABEL_PATTERN = /^[a-z0-9][a-z0-9_-]{0,95}$/;
const RUN_MARKER_HEADER = "x-task149-run-marker";
const REQUEST_LABEL_HEADER = "x-task149-request-label";
const REQUEST_SEQUENCE_HEADER = "x-task149-request-sequence";
const CLEANUP_COUNT_KEYS = Object.freeze([
  "sync_events",
  "receipts",
  "image_versions",
  "products",
  "write_budget_rows",
]);

// Stable evidence markers for cases that this harness exercises against the
// deployed runtime. They are emitted only after the corresponding assertion.
const REQUIRED_CASE_MARKERS = Object.freeze([
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

const ACCEPTANCE_STEP_NAMES = Object.freeze([
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

class HarnessError extends Error {
  constructor(code, stage, details = {}) {
    super(code);
    this.name = "HarnessError";
    this.code = code;
    this.stage = stage;
    this.details = details;
  }
}

const lifecycleAbortController = new AbortController();
let cleanupInProgress = false;

function handleCooperativeAbort() {
  if (cleanupInProgress || lifecycleAbortController.signal.aborted) return;
  lifecycleAbortController.abort(
    new HarnessError(
      "BLOCKED_TASK149_COOPERATIVE_ABORT_REQUESTED",
      "cooperative_abort",
    ),
  );
}

process.on(HARNESS_COOPERATIVE_ABORT_SIGNAL, handleCooperativeAbort);

function envValue(name) {
  return process.env[name]?.trim() ?? "";
}

function requiredEnv(name) {
  const value = envValue(name);
  if (!value) {
    throw new HarnessError("BLOCKED_TASK149_ENV_REQUIRED", "config", {
      requiredEnv: name,
    });
  }
  return value;
}

function requireExactEnv(name, expected) {
  const value = envValue(name);
  if (value !== expected) {
    throw new HarnessError("BLOCKED_TASK149_CONFIRMATION_REQUIRED", "config", {
      expected,
      requiredEnv: name,
    });
  }
}

function splitList(value) {
  return String(value ?? "")
    .split(/[\s,]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isLoopbackHostname(hostname) {
  return ["127.0.0.1", "::1", "localhost"].includes(hostname);
}

function isExplicitNonProductionHostname(hostname) {
  return (
    /(^|[-.])(dev|stage|staging|test|qa|sandbox)([-.]|$)/i.test(hostname) ||
    hostname.endsWith(".workers.dev")
  );
}

function validateBaseUrl(target, rawValue) {
  let url;
  try {
    url = new URL(rawValue);
  } catch {
    throw new HarnessError("BLOCKED_TASK149_BASE_URL_INVALID", "config");
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new HarnessError("BLOCKED_TASK149_BASE_URL_INVALID", "config");
  }

  if (/prod|production/i.test(url.hostname)) {
    throw new HarnessError("BLOCKED_TASK149_PRODUCTION_FORBIDDEN", "config");
  }

  if (target === "local") {
    if (url.protocol !== "http:" || !isLoopbackHostname(url.hostname)) {
      throw new HarnessError(
        "BLOCKED_TASK149_LOCAL_BASE_URL_REQUIRED",
        "config",
      );
    }
    return url;
  }

  const allowlist = splitList(
    requiredEnv("TASK149_POS_IMAGE_E2E_STAGING_HOST_ALLOWLIST"),
  );
  if (
    url.protocol !== "https:" ||
    !allowlist.includes(url.hostname.toLowerCase()) ||
    !isExplicitNonProductionHostname(url.hostname)
  ) {
    throw new HarnessError(
      "BLOCKED_TASK149_STAGING_HOST_NOT_ALLOWLISTED",
      "config",
      {
        requiredEnv: "TASK149_POS_IMAGE_E2E_STAGING_HOST_ALLOWLIST",
      },
    );
  }

  return url;
}

function buildOperationIds(runMarker) {
  const scope = runMarker.toLowerCase();
  return Object.freeze({
    finalizeFirst: `task149.${scope}.finalize.1`,
    finalizeSecond: `task149.${scope}.finalize.2`,
    intentFirst: `task149.${scope}.intent.1`,
    intentSecond: `task149.${scope}.intent.2`,
    removeSecond: `task149.${scope}.remove.2`,
    staleFinalizeThird: `task149.${scope}.stale-finalize.3`,
    staleIntentThird: `task149.${scope}.intent.3`,
    staleRemoveFirst: `task149.${scope}.stale-remove.1`,
  });
}

function buildIdempotencyKeys(runMarker) {
  const scope = runMarker.toLowerCase();
  return Object.freeze({
    finalizeFirst: `task149.${scope}.idem.finalize.1`,
    finalizeSecond: `task149.${scope}.idem.finalize.2`,
    intentFirst: `task149.${scope}.idem.intent.1`,
    intentSecond: `task149.${scope}.idem.intent.2`,
    removeSecond: `task149.${scope}.idem.remove.2`,
    staleFinalizeThird: `task149.${scope}.idem.stale-finalize.3`,
    staleIntentThird: `task149.${scope}.idem.intent.3`,
    staleRemoveFirst: `task149.${scope}.idem.stale-remove.1`,
  });
}

function validateConfig() {
  const target = normalizeTarget();
  assertNoProductionProjectRef(process.env);
  assertTargetEnv(target, process.env, {
    requireConfirmation: target === "staging",
  });

  requireExactEnv("CONFIRM_TASK149_POS_PRODUCT_IMAGE_E2E", CONFIRMATION_VALUE);
  requireExactEnv("TASK149_POS_IMAGE_E2E_ALLOW_SETUP", "yes");
  requireExactEnv("TASK149_POS_IMAGE_E2E_ALLOW_CLEANUP", "yes");
  requireExactEnv("TASK149_POS_IMAGE_E2E_PROVE_URL_EXPIRY", "yes");

  const configuredCleanupRpc =
    envValue("TASK149_POS_IMAGE_E2E_CLEANUP_RPC") || CLEANUP_RPC;
  if (configuredCleanupRpc !== CLEANUP_RPC) {
    throw new HarnessError(
      "BLOCKED_TASK149_CLEANUP_RPC_NAME_INVALID",
      "config",
      {
        requiredRpc: CLEANUP_RPC,
      },
    );
  }

  const rawRunId = requiredEnv("TASK149_POS_IMAGE_E2E_RUN_ID").toUpperCase();
  if (!RUN_ID_PATTERN.test(rawRunId)) {
    throw new HarnessError("BLOCKED_TASK149_RUN_ID_INVALID", "config", {
      requiredFormat: "[A-Z0-9]{6,12}",
    });
  }

  const baseUrl = validateBaseUrl(
    target,
    requiredEnv("TASK149_POS_IMAGE_E2E_BASE_URL"),
  );
  const runMarker = `TASK149_${rawRunId}`;
  const operationIds = buildOperationIds(runMarker);
  const operationIdList = [
    operationIds.intentFirst,
    operationIds.finalizeFirst,
    operationIds.intentSecond,
    operationIds.finalizeSecond,
    operationIds.staleIntentThird,
    operationIds.staleFinalizeThird,
    operationIds.staleRemoveFirst,
    operationIds.removeSecond,
  ];

  return {
    baseUrl,
    cleanupRpc: configuredCleanupRpc,
    idempotencyKeys: buildIdempotencyKeys(runMarker),
    operationIdList,
    operationIds,
    rawRunId,
    runMarker,
    serviceRoleKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    supabaseUrl: requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    target,
  };
}

function safeDetails(details) {
  const safe = {};
  for (const [key, value] of Object.entries(details ?? {})) {
    if (
      typeof value === "string" &&
      !FORBIDDEN_OUTPUT_PATTERN.test(value) &&
      value.length <= 160
    ) {
      safe[key] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      safe[key] = value;
    } else if (typeof value === "boolean") {
      safe[key] = value;
    } else if (
      Array.isArray(value) &&
      value.length <= 20 &&
      value.every(
        (item) =>
          typeof item === "string" &&
          !FORBIDDEN_OUTPUT_PATTERN.test(item) &&
          item.length <= 100,
      )
    ) {
      safe[key] = value;
    }
  }
  return safe;
}

function fail(code, stage, details = {}) {
  throw new HarnessError(code, stage, safeDetails(details));
}

function assert(condition, code, stage, details = {}) {
  if (!condition) fail(code, stage, details);
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function nowIso() {
  return new Date().toISOString();
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalMetadata(metadata) {
  return {
    bytes: metadata.bytes,
    height: metadata.height,
    mimeType: metadata.mimeType,
    sha256: metadata.sha256,
    width: metadata.width,
  };
}

function canonicalMutationProjection(input) {
  const common = {
    schemaVersion: SCHEMA_VERSION,
    operation: input.operation,
    shopId: input.shopId.toLowerCase(),
    productId: input.productId.toLowerCase(),
    expectedCurrentVersionId:
      input.expectedCurrentVersionId?.toLowerCase() ?? null,
  };

  if (input.operation === "intent") {
    return {
      ...common,
      main: canonicalMetadata(input.main),
      thumb: canonicalMetadata(input.thumb),
    };
  }

  if (input.operation === "finalize") {
    return {
      ...common,
      versionId: input.versionId.toLowerCase(),
    };
  }

  return common;
}

function payloadHash(input) {
  return `sha256:${sha256Text(JSON.stringify(canonicalMutationProjection(input)))}`;
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
    `n=${STAFF_SCRYPT_PARAMS.N},r=${STAFF_SCRYPT_PARAMS.r},p=${STAFF_SCRYPT_PARAMS.p},l=${STAFF_KEY_LENGTH}`,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

async function createSyntheticJpegSet(seed) {
  let sharp;
  try {
    ({ default: sharp } = await import("sharp"));
  } catch {
    fail("BLOCKED_TASK149_JPEG_GENERATOR_UNAVAILABLE", "jpeg_generation", {
      requiredModule: "sharp",
    });
  }

  const color =
    seed === 1 ? { b: 47, g: 104, r: 211 } : { b: 169, g: 91, r: 37 };
  const make = async (width, height, quality) => {
    const bytes = await sharp({
      create: {
        background: color,
        channels: 3,
        height,
        width,
      },
    })
      .jpeg({
        chromaSubsampling: "4:2:0",
        optimizeCoding: true,
        progressive: false,
        quality,
      })
      .toBuffer();
    return {
      bytes,
      metadata: {
        bytes: bytes.byteLength,
        height,
        mimeType: "image/jpeg",
        sha256: sha256Bytes(bytes),
        width,
      },
    };
  };

  const [main, thumb] = await Promise.all([
    make(800, 600, seed === 1 ? 86 : 83),
    make(320, 240, seed === 1 ? 82 : 79),
  ]);
  assert(
    main.metadata.bytes <= 1024 * 1024 && thumb.metadata.bytes <= 90 * 1024,
    "TASK149_GENERATED_JPEG_LIMIT_EXCEEDED",
    "jpeg_generation",
  );
  return { main, thumb };
}

function buildServiceClient(config) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: fetchWithTimeout,
      headers: {
        "X-Client-Info": "merchandise-control-admin-web/task-149-pos-image-e2e",
      },
    },
  });
}

async function buildAuthenticatedClient(config, email, password) {
  const client = buildServiceClient(config);
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    fail("TASK149_FIXTURE_AUTHENTICATION_FAILED", "fixture_setup", {
      backendCode: error?.code ?? "unknown",
    });
  }
  return client;
}

async function mustQuery(label, query, options = {}) {
  const { data, error } = await query;
  if (error) {
    fail("TASK149_DATABASE_OPERATION_FAILED", label, {
      backendCode: error.code ?? "unknown",
    });
  }
  if (options.requireData && (data === null || data === undefined)) {
    fail("TASK149_DATABASE_RESULT_MISSING", label);
  }
  return data;
}

async function mustAction(label, query) {
  const data = await mustQuery(label, query, { requireData: true });
  if (!isRecord(data) || data.ok !== true) {
    fail("TASK149_AUDITED_ACTION_FAILED", label, {
      actionCode:
        isRecord(data) && typeof data.code === "string" ? data.code : "unknown",
    });
  }
  return data;
}

function emptyFixtureState(config) {
  const actorIdentities = Object.freeze({
    owner: Object.freeze({
      email: `task149-owner-${config.rawRunId.toLowerCase()}@example.invalid`,
      role: "owner",
      runMarker: config.runMarker,
    }),
    platform: Object.freeze({
      email: `task149-platform-${config.rawRunId.toLowerCase()}@example.invalid`,
      role: "platform_actor",
      runMarker: config.runMarker,
    }),
  });
  return {
    actorIdentities,
    actorSecrets: {
      owner: `Task149-Owner-${randomBytes(24).toString("base64url")}`,
      platform: `Task149-Platform-${randomBytes(24).toString("base64url")}`,
    },
    auditRowsBeforeCleanup: null,
    cleanupApplied: false,
    mappingId: null,
    ownerUserId: null,
    platformActorId: null,
    platformClient: null,
    posDeviceCredentialId: null,
    posSessionId: null,
    productId: null,
    shopCode: `TASK149_SHOP_${config.rawRunId}`.slice(0, 32),
    shopDeviceId: null,
    shopId: null,
    shopName: `TASK149_SYNTHETIC_SHOP_${config.rawRunId}`,
    staffCode: `TASK149_POS_${config.rawRunId}`.slice(0, 32),
    staffCredentialVersion: null,
    staffId: null,
    storagePaths: [],
  };
}

function actorAttributes(identity, source = identity.runMarker) {
  return {
    app_metadata: {
      task149_fixture_role: identity.role,
      task149_run_marker: identity.runMarker,
    },
    email: identity.email,
    email_confirm: true,
    user_metadata: {
      fixtureRole: identity.role,
      source,
    },
  };
}

function actorMetadataMatches(user, identity, allowedSources) {
  return (
    isRecord(user) &&
    typeof user.email === "string" &&
    user.email.toLowerCase() === identity.email &&
    isRecord(user.app_metadata) &&
    user.app_metadata.task149_fixture_role === identity.role &&
    user.app_metadata.task149_run_marker === identity.runMarker &&
    isRecord(user.user_metadata) &&
    user.user_metadata.fixtureRole === identity.role &&
    allowedSources.has(user.user_metadata.source)
  );
}

async function listAllAuthUsers(client, stage) {
  const users = [];
  const seenIds = new Set();
  let complete = false;

  for (let page = 1; page <= AUTH_USER_MAX_PAGES; page += 1) {
    const result = await client.auth.admin.listUsers({
      page,
      perPage: AUTH_USER_PAGE_SIZE,
    });
    if (result.error || !Array.isArray(result.data?.users)) {
      fail("BLOCKED_TASK149_AUTH_ACTOR_LIST_FAILED", stage, {
        backendCode: result.error?.code ?? "unknown",
      });
    }
    for (const user of result.data.users) {
      assert(
        isUuid(user?.id) && !seenIds.has(user.id),
        "BLOCKED_TASK149_AUTH_ACTOR_LIST_INVALID",
        stage,
      );
      seenIds.add(user.id);
      users.push(user);
    }
    if (result.data.users.length < AUTH_USER_PAGE_SIZE) {
      complete = true;
      break;
    }
  }

  assert(
    complete,
    "BLOCKED_TASK149_AUTH_ACTOR_LIST_BOUNDEDNESS_EXCEEDED",
    stage,
  );
  return users;
}

function selectFixtureAuthActors(users, state, allowedSources, stage) {
  const selected = {};
  const identities = Object.entries(state.actorIdentities);
  const expectedEmails = new Set(
    identities.map(([, identity]) => identity.email),
  );

  for (const user of users) {
    const appMetadata = isRecord(user?.app_metadata) ? user.app_metadata : {};
    const userMetadata = isRecord(user?.user_metadata)
      ? user.user_metadata
      : {};
    const carriesRunMarker =
      appMetadata.task149_run_marker ===
        state.actorIdentities.owner.runMarker ||
      userMetadata.source === state.actorIdentities.owner.runMarker;
    if (carriesRunMarker) {
      assert(
        typeof user.email === "string" &&
          expectedEmails.has(user.email.toLowerCase()),
        "BLOCKED_TASK149_AUTH_ACTOR_IDENTITY_MISMATCH",
        stage,
      );
    }
  }

  for (const [key, identity] of identities) {
    const knownId = key === "owner" ? state.ownerUserId : state.platformActorId;
    const emailMatches = users.filter(
      (user) =>
        typeof user.email === "string" &&
        user.email.toLowerCase() === identity.email,
    );
    assert(
      emailMatches.length <= 1,
      "BLOCKED_TASK149_AUTH_ACTOR_IDENTITY_AMBIGUOUS",
      stage,
    );
    if (emailMatches.length === 0) {
      assert(
        knownId === null,
        "BLOCKED_TASK149_AUTH_ACTOR_IDENTITY_MISSING",
        stage,
      );
      selected[key] = null;
      continue;
    }
    const user = emailMatches[0];
    assert(
      actorMetadataMatches(user, identity, allowedSources),
      "BLOCKED_TASK149_AUTH_ACTOR_IDENTITY_MISMATCH",
      stage,
    );
    assert(
      knownId === null || knownId === user.id,
      "BLOCKED_TASK149_AUTH_ACTOR_IDENTITY_MISMATCH",
      stage,
    );
    selected[key] = user;
  }

  return selected;
}

async function recoverFixtureAuthActors(client, state, stage) {
  const users = await listAllAuthUsers(client, stage);
  const selected = selectFixtureAuthActors(
    users,
    state,
    new Set([state.actorIdentities.owner.runMarker, CLEANED_ACTOR_SOURCE]),
    stage,
  );
  if (selected.owner) state.ownerUserId = selected.owner.id;
  if (selected.platform) state.platformActorId = selected.platform.id;
  return selected;
}

async function assertFixtureAuthActorsAbsent(client, state) {
  const users = await listAllAuthUsers(client, "fixture_auth_preflight");
  const selected = selectFixtureAuthActors(
    users,
    state,
    new Set([state.actorIdentities.owner.runMarker, CLEANED_ACTOR_SOURCE]),
    "fixture_auth_preflight",
  );
  assert(
    selected.owner === null && selected.platform === null,
    "BLOCKED_TASK149_AUTH_ACTOR_RUN_ID_NOT_CLEAN",
    "fixture_auth_preflight",
  );
}

function cleanupRpcArgs(config, state, action) {
  return {
    p_action: action,
    p_operation_ids: config.operationIdList,
    p_product_id: state.productId,
    p_run_id: config.runMarker,
    p_shop_id: state.shopId,
  };
}

function parseCleanupCounts(data, stage) {
  assert(
    isRecord(data) && isRecord(data.counts),
    "BLOCKED_TASK149_CLEANUP_RPC_CONTRACT_INVALID",
    stage,
    { requiredRpc: CLEANUP_RPC },
  );
  const observedKeys = Object.keys(data.counts).sort();
  const expectedKeys = [...CLEANUP_COUNT_KEYS].sort();
  assert(
    observedKeys.length === expectedKeys.length &&
      observedKeys.every((key, index) => key === expectedKeys[index]),
    "BLOCKED_TASK149_CLEANUP_RPC_CONTRACT_INVALID",
    stage,
    { requiredRpc: CLEANUP_RPC },
  );
  const counts = {};
  for (const key of CLEANUP_COUNT_KEYS) {
    const value = data.counts[key];
    assert(
      Number.isSafeInteger(value) && value >= 0,
      "BLOCKED_TASK149_CLEANUP_RPC_CONTRACT_INVALID",
      stage,
      { requiredRpc: CLEANUP_RPC },
    );
    counts[key] = value;
  }
  return counts;
}

async function callCleanupRpc(client, config, state, action) {
  const { data, error } = await client.rpc(
    config.cleanupRpc,
    cleanupRpcArgs(config, state, action),
  );
  if (error) {
    fail("BLOCKED_TASK149_CLEANUP_RPC_REQUIRED", `cleanup_${action}`, {
      backendCode: error.code ?? "unknown",
      requiredEnv: "TASK149_POS_IMAGE_E2E_CLEANUP_RPC",
      requiredRpc: CLEANUP_RPC,
    });
  }
  assert(
    isRecord(data) && data.ok === true,
    "BLOCKED_TASK149_CLEANUP_RPC_CONTRACT_INVALID",
    `cleanup_${action}`,
    { requiredRpc: CLEANUP_RPC },
  );
  const expectedCode = {
    apply: "cleanup_applied",
    preflight: "preflight_ready",
    verify: "cleanup_verified",
  }[action];
  assert(
    data.code === expectedCode,
    "BLOCKED_TASK149_CLEANUP_RPC_CONTRACT_INVALID",
    `cleanup_${action}`,
    { requiredRpc: CLEANUP_RPC },
  );
  return {
    counts: parseCleanupCounts(data, `cleanup_${action}`),
  };
}

async function assertCleanupPreflight(client, config) {
  const state = emptyFixtureState(config);
  const preflight = await callCleanupRpc(client, config, state, "preflight");
  const existing = Object.values(preflight.counts).reduce(
    (sum, value) => sum + value,
    0,
  );
  assert(
    existing === 0,
    "BLOCKED_TASK149_RUN_ID_NOT_CLEAN",
    "cleanup_preflight",
    {
      requiredAction: "exact_cleanup_with_saved_shop_and_product_ids",
    },
  );
}

async function setupFixture(client, config, state) {
  const posCredential = `Task149-POS-${randomBytes(24).toString("base64url")}`;
  const timestamp = nowIso();

  await assertFixtureAuthActorsAbsent(client, state);

  const ownerIdentity = state.actorIdentities.owner;
  const ownerResult = await client.auth.admin.createUser({
    ...actorAttributes(ownerIdentity),
    password: state.actorSecrets.owner,
  });
  if (ownerResult.error || !ownerResult.data.user) {
    fail("TASK149_OWNER_CREATE_FAILED", "fixture_setup", {
      backendCode: ownerResult.error?.code ?? "unknown",
    });
  }
  assert(
    actorMetadataMatches(
      ownerResult.data.user,
      ownerIdentity,
      new Set([config.runMarker]),
    ),
    "TASK149_OWNER_CREATE_IDENTITY_INVALID",
    "fixture_setup",
  );
  state.ownerUserId = ownerResult.data.user.id;

  const platformIdentity = state.actorIdentities.platform;
  const platformResult = await client.auth.admin.createUser({
    ...actorAttributes(platformIdentity),
    password: state.actorSecrets.platform,
  });
  if (platformResult.error || !platformResult.data.user) {
    fail("TASK149_PLATFORM_ACTOR_CREATE_FAILED", "fixture_setup", {
      backendCode: platformResult.error?.code ?? "unknown",
    });
  }
  assert(
    actorMetadataMatches(
      platformResult.data.user,
      platformIdentity,
      new Set([config.runMarker]),
    ),
    "TASK149_PLATFORM_ACTOR_CREATE_IDENTITY_INVALID",
    "fixture_setup",
  );
  state.platformActorId = platformResult.data.user.id;

  await mustQuery(
    "fixture_profiles_upsert",
    client.from("profiles").upsert(
      [
        {
          display_name: `TASK149_SYNTHETIC_OWNER_${config.rawRunId}`,
          profile_id: state.ownerUserId,
          profile_status: "active",
        },
        {
          display_name: `TASK149_SYNTHETIC_PLATFORM_${config.rawRunId}`,
          profile_id: state.platformActorId,
          profile_status: "active",
        },
      ],
      { onConflict: "profile_id" },
    ),
  );
  await mustQuery(
    "fixture_platform_actor_insert",
    client.from("platform_admins").insert({
      granted_by_profile_id: state.platformActorId,
      profile_id: state.platformActorId,
      reason_redacted: "TASK149 isolated synthetic fixture",
      status: "active",
    }),
  );

  state.platformClient = await buildAuthenticatedClient(
    config,
    platformIdentity.email,
    state.actorSecrets.platform,
  );
  const shopAction = await mustAction(
    "fixture_shop_create",
    state.platformClient.rpc("platform_create_shop", {
      p_owner_profile_id: state.ownerUserId,
      p_reason: "TASK149 isolated synthetic fixture",
      p_shop_code: state.shopCode,
      p_shop_name: state.shopName,
    }),
  );
  assert(
    isUuid(shopAction.shop_id),
    "TASK149_FIXTURE_SHOP_ID_INVALID",
    "fixture_setup",
  );
  state.shopId = shopAction.shop_id;

  const ownerClient = await buildAuthenticatedClient(
    config,
    ownerIdentity.email,
    state.actorSecrets.owner,
  );
  const credentialHash = await hashStaffCredential(posCredential);
  const staffAction = await mustAction(
    "fixture_staff_create",
    ownerClient.rpc("shop_staff_create", {
      p_credential_expires_at: null,
      p_credential_hash: credentialHash,
      p_credential_kind: "password",
      p_display_name: `TASK149_SYNTHETIC_STAFF_${config.rawRunId}`,
      p_role_key: "pos_admin",
      p_shop_id: state.shopId,
      p_staff_code: state.staffCode,
    }),
  );
  assert(
    isUuid(staffAction.target_id),
    "TASK149_FIXTURE_STAFF_ID_INVALID",
    "fixture_setup",
  );
  state.staffId = staffAction.target_id;

  const staffRows = await mustQuery(
    "fixture_staff_lookup",
    client
      .from("staff_accounts")
      .select("credential_version")
      .eq("staff_id", state.staffId)
      .eq("shop_id", state.shopId),
  );
  assert(
    Array.isArray(staffRows) &&
      staffRows.length === 1 &&
      Number.isSafeInteger(staffRows[0]?.credential_version) &&
      staffRows[0].credential_version >= 1,
    "TASK149_FIXTURE_STAFF_VERSION_INVALID",
    "fixture_setup",
  );
  state.staffCredentialVersion = staffRows[0].credential_version;

  const mappingRows = await mustQuery(
    "fixture_mapping_insert",
    client
      .from("shop_inventory_sources")
      .insert({
        created_by_profile_id: state.ownerUserId,
        mapping_state: "mapped",
        owner_user_id: state.ownerUserId,
        shop_id: state.shopId,
        source_kind: "mobile_owner",
        verified_at: timestamp,
        verified_by_profile_id: state.ownerUserId,
      })
      .select("shop_inventory_source_id"),
  );
  assert(
    Array.isArray(mappingRows) &&
      mappingRows.length === 1 &&
      isUuid(mappingRows[0]?.shop_inventory_source_id),
    "TASK149_FIXTURE_MAPPING_INVALID",
    "fixture_setup",
  );
  state.mappingId = mappingRows[0].shop_inventory_source_id;

  state.productId = randomUUID();
  const productRows = await mustQuery(
    "fixture_product_insert",
    client
      .from("inventory_products")
      .insert({
        barcode: `TASK149_BARCODE_${config.rawRunId}`,
        id: state.productId,
        item_number: `TASK149_ITEM_${config.rawRunId}`,
        owner_user_id: state.ownerUserId,
        product_name: `TASK149_SYNTHETIC_PRODUCT_${config.rawRunId}`,
        purchase_price: 149,
        retail_price: 249,
        shop_id: state.shopId,
        stock_quantity: 3,
      })
      .select("id"),
  );
  assert(
    Array.isArray(productRows) &&
      productRows.length === 1 &&
      productRows[0]?.id === state.productId,
    "TASK149_FIXTURE_PRODUCT_INVALID",
    "fixture_setup",
  );

  return {
    deviceIdentifier: `TASK149_DEVICE_${config.rawRunId}`,
    posCredential,
  };
}

function createRequestTracker() {
  return {
    caseMarkers: new Set(),
    coldCandidate: null,
    maxDurationMilliseconds: 0,
    observabilityEndedAt: null,
    observabilityStartedAt: null,
    requestCount: 0,
    requestSequence: 0,
    resourceFailureCount: 0,
    routeTimings: {
      authenticated: new Map(),
      light: new Map(),
    },
    serverErrorCount: 0,
    status503Count: 0,
    statuses: new Map(),
    stepResults: new Map(),
  };
}

function markCase(tracker, marker) {
  tracker.caseMarkers.add(marker);
}

function passStep(tracker, name, details = {}) {
  assert(
    ACCEPTANCE_STEP_NAMES.includes(name),
    "TASK149_UNKNOWN_ACCEPTANCE_STEP",
    "harness",
  );
  tracker.stepResults.set(name, {
    ...safeDetails(details),
    status: "PASS",
  });
}

function inspectResourceFailure(value) {
  if (typeof value === "string") {
    return RESOURCE_FAILURE_PATTERN.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(inspectResourceFailure);
  }
  if (isRecord(value)) {
    return Object.values(value).some(inspectResourceFailure);
  }
  return false;
}

function imageRouteName(path) {
  const prefix = "/api/pos/catalog/product-images/";
  return path.startsWith(prefix) ? path.slice(prefix.length) : null;
}

function pushRouteTiming(tracker, requestClass, route, durationMilliseconds) {
  if (
    !route ||
    (requestClass !== "light" && requestClass !== "authenticated")
  ) {
    return;
  }
  const timings = tracker.routeTimings[requestClass];
  const samples = timings.get(route) ?? [];
  samples.push(durationMilliseconds);
  timings.set(route, samples);
}

function recordResponse(
  tracker,
  response,
  body,
  durationMilliseconds,
  metadata = {},
) {
  const workerRequest = metadata.workerRequest === true;
  const observedAt = nowIso();
  if (workerRequest) {
    tracker.observabilityStartedAt ??= observedAt;
    tracker.observabilityEndedAt = observedAt;
    tracker.requestCount += 1;
    tracker.maxDurationMilliseconds = Math.max(
      tracker.maxDurationMilliseconds,
      durationMilliseconds,
    );
    tracker.statuses.set(
      response.status,
      (tracker.statuses.get(response.status) ?? 0) + 1,
    );
    if (response.status === 503) tracker.status503Count += 1;
    if (response.status >= 500) tracker.serverErrorCount += 1;
    if (inspectResourceFailure(body)) tracker.resourceFailureCount += 1;
  }
  const route = imageRouteName(metadata.path ?? "");
  if (workerRequest) {
    pushRouteTiming(
      tracker,
      metadata.requestClass,
      route,
      durationMilliseconds,
    );
  }
  if (
    workerRequest &&
    metadata.coldCandidate === true &&
    tracker.coldCandidate === null
  ) {
    tracker.coldCandidate = {
      durationMilliseconds,
      route,
      status: response.status,
    };
  }

  if (
    response.status === 503 ||
    response.status >= 500 ||
    inspectResourceFailure(body)
  ) {
    fail("TASK149_RESOURCE_FAILURE_OBSERVED", "http_request", {
      status: response.status,
    });
  }
}

async function fetchWithTimeout(input, init = {}) {
  const signals = [AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS)];
  if (init.signal) signals.push(init.signal);
  if (!cleanupInProgress) signals.push(lifecycleAbortController.signal);
  return fetch(input, {
    ...init,
    signal: AbortSignal.any(signals),
  });
}

function throwIfLifecycleAbortRequested() {
  if (!lifecycleAbortController.signal.aborted) return;
  const reason = lifecycleAbortController.signal.reason;
  throw reason instanceof HarnessError
    ? reason
    : new HarnessError(
        "BLOCKED_TASK149_COOPERATIVE_ABORT_REQUESTED",
        "cooperative_abort",
      );
}

async function lifecycleDelay(milliseconds) {
  throwIfLifecycleAbortRequested();
  try {
    await delay(milliseconds, undefined, {
      signal: lifecycleAbortController.signal,
    });
  } catch (error) {
    throwIfLifecycleAbortRequested();
    throw error;
  }
}

async function runCooperativeAbortSelfTest() {
  let cooperativeAbortObserved = false;
  let guardedFinallyRan = false;
  const trigger = setTimeout(() => {
    process.kill(process.pid, HARNESS_COOPERATIVE_ABORT_SIGNAL);
  }, 0);
  try {
    await lifecycleDelay(5_000);
  } catch (error) {
    cooperativeAbortObserved =
      error instanceof HarnessError &&
      error.code === "BLOCKED_TASK149_COOPERATIVE_ABORT_REQUESTED";
  } finally {
    clearTimeout(trigger);
    cleanupInProgress = true;
    guardedFinallyRan = true;
  }
  assert(
    cooperativeAbortObserved && guardedFinallyRan,
    "TASK149_COOPERATIVE_ABORT_SELF_TEST_FAILED",
    "self_test",
  );
  process.stdout.write(
    `${JSON.stringify({
      cooperativeAbortObserved,
      guardedFinallyRan,
      status: "PASS_SELF_TEST_NO_LIVE_EVIDENCE",
    })}\n`,
  );
}

async function requestJson(tracker, config, path, body, requestLabel) {
  assert(
    REQUEST_LABEL_PATTERN.test(requestLabel),
    "TASK149_REQUEST_LABEL_INVALID",
    "http_request",
  );
  const requestSequence = tracker.requestSequence + 1;
  tracker.requestSequence = requestSequence;
  const startedAt = performance.now();
  let response;
  try {
    response = await fetchWithTimeout(new URL(path, config.baseUrl), {
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "omit",
      headers: {
        "content-type": "application/json",
        "x-client-request-id": `task149-${sha256Text(`${config.runMarker}:${requestLabel}`).slice(0, 24)}`,
        [REQUEST_LABEL_HEADER]: requestLabel,
        [REQUEST_SEQUENCE_HEADER]: String(requestSequence),
        [RUN_MARKER_HEADER]: config.runMarker,
      },
      method: "POST",
    });
  } catch {
    fail("TASK149_HTTP_REQUEST_FAILED", requestLabel);
  }

  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  recordResponse(tracker, response, parsed, performance.now() - startedAt, {
    coldCandidate: requestLabel === "cold_candidate_intent",
    path,
    requestClass:
      imageRouteName(path) === null
        ? "other"
        : body?.schemaVersion === SCHEMA_VERSION
          ? "authenticated"
          : "light",
    workerRequest: true,
  });
  const cacheControl = response.headers.get("cache-control") ?? "";
  const nosniff = response.headers.get("x-content-type-options") ?? "";
  assert(
    cacheControl.toLowerCase().includes("no-store"),
    "TASK149_RESPONSE_NOT_NO_STORE",
    requestLabel,
    { status: response.status },
  );
  assert(
    nosniff.toLowerCase() === "nosniff",
    "TASK149_RESPONSE_NOSNIFF_MISSING",
    requestLabel,
    { status: response.status },
  );
  return {
    body: parsed,
    status: response.status,
  };
}

function assertSuccess(result, operation, stage, statuses = [200]) {
  assert(
    statuses.includes(result.status) &&
      isRecord(result.body) &&
      result.body.ok === true &&
      result.body.code === "success" &&
      result.body.schemaVersion === SCHEMA_VERSION &&
      result.body.operation === operation,
    "TASK149_ENDPOINT_SUCCESS_INVALID",
    stage,
    {
      responseCode:
        isRecord(result.body) && typeof result.body.code === "string"
          ? result.body.code
          : "unknown",
      status: result.status,
    },
  );
  return result.body;
}

function assertFailure(result, stage, expectedStatuses, expectedCodes) {
  const code =
    isRecord(result.body) && typeof result.body.code === "string"
      ? result.body.code
      : "";
  assert(
    expectedStatuses.includes(result.status) &&
      isRecord(result.body) &&
      result.body.ok === false &&
      expectedCodes.includes(code),
    "TASK149_ENDPOINT_FAILURE_INVALID",
    stage,
    {
      responseCode: SAFE_CODE_PATTERN.test(code) ? code : "unknown",
      status: result.status,
    },
  );
}

async function runImageRouteLightProbes(tracker, config) {
  const routes = ["intent", "finalize", "read-urls", "remove"];
  const coldCandidate = await requestJson(
    tracker,
    config,
    "/api/pos/catalog/product-images/intent",
    {},
    "cold_candidate_intent",
  );
  assertFailure(
    coldCandidate,
    "cold_candidate_intent",
    [400],
    ["validation_failed"],
  );

  for (const route of routes) {
    for (let sample = 1; sample <= 3; sample += 1) {
      const result = await requestJson(
        tracker,
        config,
        `/api/pos/catalog/product-images/${route}`,
        {},
        `light_${route}_${sample}`,
      );
      assertFailure(
        result,
        `light_${route}_${sample}`,
        [400],
        ["validation_failed"],
      );
    }
  }

  markCase(tracker, "TASK149_CASE_06");
  markCase(tracker, "TASK149_CASE_45");
}

async function firstLogin(tracker, config, state, fixture) {
  const result = await requestJson(
    tracker,
    config,
    "/api/pos/auth/first-login",
    {
      credential: fixture.posCredential,
      device: {
        appVersion: APP_VERSION,
        deviceIdentifier: fixture.deviceIdentifier,
        displayName: `TASK149 Synthetic Device ${config.rawRunId}`,
      },
      shopCode: state.shopCode,
      staffCode: state.staffCode,
    },
    "first_login",
  );
  assert(
    result.status === 200 &&
      isRecord(result.body) &&
      result.body.ok === true &&
      typeof result.body.trustedDeviceToken === "string" &&
      typeof result.body.session?.sessionToken === "string" &&
      isUuid(result.body.session?.posSessionId) &&
      isUuid(result.body.device?.shopDeviceId),
    "TASK149_FIRST_LOGIN_INVALID",
    "first_login",
    { status: result.status },
  );

  const auth = {
    deviceToken: result.body.trustedDeviceToken,
    posSessionId: result.body.session.posSessionId,
    sessionToken: result.body.session.sessionToken,
    shopDeviceId: result.body.device.shopDeviceId,
  };
  state.posSessionId = auth.posSessionId;
  state.shopDeviceId = auth.shopDeviceId;

  const sessions = await mustQuery(
    "fixture_session_lookup",
    buildServiceClient(config)
      .from("pos_sessions")
      .select("pos_device_credential_id")
      .eq("pos_session_id", state.posSessionId)
      .eq("shop_device_id", state.shopDeviceId)
      .eq("shop_id", state.shopId)
      .eq("staff_id", state.staffId),
  );
  assert(
    Array.isArray(sessions) &&
      sessions.length === 1 &&
      isUuid(sessions[0]?.pos_device_credential_id),
    "TASK149_POS_SESSION_PERSISTENCE_INVALID",
    "first_login",
  );
  state.posDeviceCredentialId = sessions[0].pos_device_credential_id;

  const heartbeat = await requestJson(
    tracker,
    config,
    "/api/pos/session/heartbeat",
    {
      ...auth,
      appVersion: APP_VERSION,
    },
    "session_heartbeat",
  );
  assert(
    heartbeat.status === 200 &&
      isRecord(heartbeat.body) &&
      heartbeat.body.ok === true &&
      heartbeat.body.session?.posSessionId === state.posSessionId,
    "TASK149_HEARTBEAT_INVALID",
    "session_heartbeat",
    { status: heartbeat.status },
  );
  passStep(tracker, "trusted_pos_session");
  markCase(tracker, "TASK149_CASE_01");
  markCase(tracker, "TASK149_CASE_07");
  return auth;
}

function trustedRuntimeEnvelope(state, auth) {
  return {
    appVersion: APP_VERSION,
    deviceToken: auth.deviceToken,
    posSessionId: auth.posSessionId,
    schemaVersion: SCHEMA_VERSION,
    sessionToken: auth.sessionToken,
    shopDeviceId: auth.shopDeviceId,
    shopId: state.shopId,
    staffCredentialVersion: state.staffCredentialVersion,
    staffId: state.staffId,
  };
}

function intentEnvelope(config, state, auth, input) {
  const canonical = {
    expectedCurrentVersionId: input.expectedCurrentVersionId,
    main: input.images.main.metadata,
    operation: "intent",
    productId: state.productId,
    schemaVersion: SCHEMA_VERSION,
    shopId: state.shopId,
    thumb: input.images.thumb.metadata,
  };
  return {
    ...trustedRuntimeEnvelope(state, auth),
    expectedCurrentVersionId: input.expectedCurrentVersionId,
    idempotencyKey: config.idempotencyKeys[input.key],
    main: input.images.main.metadata,
    operation: "intent",
    operationId: config.operationIds[input.key],
    payloadHash: payloadHash(canonical),
    productId: state.productId,
    thumb: input.images.thumb.metadata,
  };
}

function finalizeEnvelope(config, state, auth, input) {
  const canonical = {
    expectedCurrentVersionId: input.expectedCurrentVersionId,
    operation: "finalize",
    productId: state.productId,
    schemaVersion: SCHEMA_VERSION,
    shopId: state.shopId,
    versionId: input.versionId,
  };
  return {
    ...trustedRuntimeEnvelope(state, auth),
    expectedCurrentVersionId: input.expectedCurrentVersionId,
    idempotencyKey: config.idempotencyKeys[input.key],
    operation: "finalize",
    operationId: config.operationIds[input.key],
    payloadHash: payloadHash(canonical),
    productId: state.productId,
    versionId: input.versionId,
  };
}

function removeEnvelope(config, state, auth, input) {
  const canonical = {
    expectedCurrentVersionId: input.expectedCurrentVersionId,
    operation: "remove",
    productId: state.productId,
    schemaVersion: SCHEMA_VERSION,
    shopId: state.shopId,
  };
  return {
    ...trustedRuntimeEnvelope(state, auth),
    expectedCurrentVersionId: input.expectedCurrentVersionId,
    idempotencyKey: config.idempotencyKeys[input.key],
    operation: "remove",
    operationId: config.operationIds[input.key],
    payloadHash: payloadHash(canonical),
    productId: state.productId,
  };
}

function readEnvelope(state, auth, versionId) {
  return {
    ...trustedRuntimeEnvelope(state, auth),
    refs: [
      {
        productId: state.productId,
        variant: "main",
        versionId,
      },
      {
        productId: state.productId,
        variant: "thumb",
        versionId,
      },
    ],
  };
}

async function putSignedJpeg(tracker, signedUrl, image, stage) {
  assert(
    typeof signedUrl === "string" && signedUrl.length <= 4096,
    "TASK149_SIGNED_UPLOAD_URL_INVALID",
    stage,
  );
  let parsed;
  try {
    parsed = new URL(signedUrl);
  } catch {
    fail("TASK149_SIGNED_UPLOAD_URL_INVALID", stage);
  }
  assert(
    !parsed.username &&
      !parsed.password &&
      (parsed.protocol === "https:" ||
        (parsed.protocol === "http:" && isLoopbackHostname(parsed.hostname))),
    "TASK149_SIGNED_UPLOAD_URL_INVALID",
    stage,
  );

  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", new Blob([image.bytes], { type: "image/jpeg" }), "image.jpg");
  const startedAt = performance.now();
  let response;
  try {
    response = await fetchWithTimeout(signedUrl, {
      body: form,
      cache: "no-store",
      credentials: "omit",
      headers: { "x-upsert": "false" },
      method: "PUT",
    });
  } catch {
    fail("TASK149_SIGNED_UPLOAD_FAILED", stage);
  }
  recordResponse(tracker, response, null, performance.now() - startedAt);
  assert(response.ok, "TASK149_SIGNED_UPLOAD_FAILED", stage, {
    status: response.status,
  });
}

async function uploadIntentImages(tracker, intent, images, stage) {
  await Promise.all([
    putSignedJpeg(tracker, intent.mainUploadUrl, images.main, `${stage}_main`),
    putSignedJpeg(
      tracker,
      intent.thumbUploadUrl,
      images.thumb,
      `${stage}_thumb`,
    ),
  ]);
}

function assertIntentResponse(result, stage, expectedReplay) {
  const body = assertSuccess(result, "intent", stage, [200, 201]);
  assert(
    body.status === "upload_required" &&
      isUuid(body.versionId) &&
      typeof body.mainUploadUrl === "string" &&
      typeof body.thumbUploadUrl === "string" &&
      body.replayed === expectedReplay,
    "TASK149_INTENT_RESPONSE_INVALID",
    stage,
    { status: result.status },
  );
  return body;
}

function assertFinalizeResponse(result, stage, expectedReplay) {
  const body = assertSuccess(result, "finalize", stage);
  assert(
    (body.status === "finalized" || body.status === "already_finalized") &&
      isUuid(body.versionId) &&
      body.replayed === expectedReplay &&
      typeof body.imageUpdatedAt === "string",
    "TASK149_FINALIZE_RESPONSE_INVALID",
    stage,
  );
  return body;
}

function assertUniqueCatalogLane(rows, key, stage) {
  assert(
    Array.isArray(rows) &&
      rows.every((row) => isRecord(row) && typeof row[key] === "string"),
    "TASK149_CATALOG_EXACTNESS_FAILED",
    stage,
    { laneKey: key },
  );
  const ids = rows.map((row) => row[key]);
  assert(
    new Set(ids).size === ids.length,
    "TASK149_CATALOG_EXACTNESS_FAILED",
    stage,
    { laneKey: key },
  );
  return new Set(ids);
}

function assertSameIdSet(actual, expected, stage) {
  assert(
    actual.size === expected.size &&
      [...actual].every((id) => expected.has(id)),
    "TASK149_CATALOG_AUTHORITATIVE_MANIFEST_MISMATCH",
    stage,
    {
      actualCount: actual.size,
      expectedCount: expected.size,
    },
  );
}

async function loadScopedManifestRows(
  client,
  state,
  table,
  columns,
  snapshotAt,
  stage,
) {
  const rows = [];
  const scopes = [
    {
      apply(query) {
        return query.eq("shop_id", state.shopId);
      },
      name: "shop",
    },
    {
      apply(query) {
        return query.is("shop_id", null).eq("owner_user_id", state.ownerUserId);
      },
      name: "legacy",
    },
  ];

  for (const scope of scopes) {
    let expectedCount = null;
    let complete = false;
    let scopedRows = 0;

    for (let page = 0; page < CATALOG_MANIFEST_MAX_PAGES; page += 1) {
      const first = page * CATALOG_MANIFEST_PAGE_SIZE;
      const last = first + CATALOG_MANIFEST_PAGE_SIZE - 1;
      let query = client
        .from(table)
        .select(columns, { count: "exact" })
        .lte("updated_at", snapshotAt)
        .order("updated_at", { ascending: true })
        .order("id", { ascending: true })
        .range(first, last);
      query = scope.apply(query);
      const result = await query;
      if (result.error || !Array.isArray(result.data)) {
        fail("BLOCKED_TASK149_CATALOG_MANIFEST_QUERY_FAILED", stage, {
          backendCode: result.error?.code ?? "unknown",
          scope: scope.name,
        });
      }
      assert(
        Number.isSafeInteger(result.count) && result.count >= 0,
        "BLOCKED_TASK149_CATALOG_MANIFEST_COUNT_INVALID",
        stage,
        { scope: scope.name },
      );
      expectedCount ??= result.count;
      assert(
        result.count === expectedCount,
        "BLOCKED_TASK149_CATALOG_MANIFEST_CHANGED",
        stage,
        { scope: scope.name },
      );
      scopedRows += result.data.length;
      rows.push(...result.data);
      if (scopedRows === expectedCount) {
        complete = true;
        break;
      }
      assert(
        result.data.length === CATALOG_MANIFEST_PAGE_SIZE &&
          scopedRows < expectedCount,
        "BLOCKED_TASK149_CATALOG_MANIFEST_PAGINATION_INVALID",
        stage,
        { scope: scope.name },
      );
    }

    assert(
      complete,
      "BLOCKED_TASK149_CATALOG_MANIFEST_BOUNDEDNESS_EXCEEDED",
      stage,
      { scope: scope.name },
    );
  }

  const ids = new Set();
  for (const row of rows) {
    assert(
      isRecord(row) &&
        isUuid(row.id) &&
        isUuid(row.owner_user_id) &&
        row.owner_user_id === state.ownerUserId &&
        (row.shop_id === state.shopId ||
          (row.shop_id === null && row.owner_user_id === state.ownerUserId)) &&
        !ids.has(row.id),
      "BLOCKED_TASK149_CATALOG_MANIFEST_ROW_INVALID",
      stage,
    );
    ids.add(row.id);
  }
  return rows;
}

async function loadAuthoritativeFullCatalogManifest(
  client,
  state,
  snapshotAt,
  requestedLimit,
) {
  assert(
    typeof snapshotAt === "string" &&
      Number.isFinite(Date.parse(snapshotAt)) &&
      isUuid(state.shopId) &&
      isUuid(state.ownerUserId) &&
      Number.isSafeInteger(requestedLimit) &&
      requestedLimit >= 1 &&
      requestedLimit <= 1_000,
    "BLOCKED_TASK149_CATALOG_MANIFEST_INPUT_INVALID",
    "catalog_authoritative_manifest",
  );

  const entityColumns = "deleted_at,id,owner_user_id,shop_id,updated_at";
  const [categoryRows, supplierRows, productRows, priceRows] =
    await Promise.all([
      loadScopedManifestRows(
        client,
        state,
        "inventory_categories",
        entityColumns,
        snapshotAt,
        "catalog_authoritative_categories",
      ),
      loadScopedManifestRows(
        client,
        state,
        "inventory_suppliers",
        entityColumns,
        snapshotAt,
        "catalog_authoritative_suppliers",
      ),
      loadScopedManifestRows(
        client,
        state,
        "inventory_products",
        entityColumns,
        snapshotAt,
        "catalog_authoritative_products",
      ),
      loadScopedManifestRows(
        client,
        state,
        "inventory_product_prices",
        "id,owner_user_id,product_id,shop_id,updated_at",
        snapshotAt,
        "catalog_authoritative_prices",
      ),
    ]);

  const activeCategories = categoryRows.filter(
    (row) => row.deleted_at === null,
  );
  const activeSuppliers = supplierRows.filter((row) => row.deleted_at === null);
  const activeProducts = productRows.filter((row) => row.deleted_at === null);
  const activeProductIds = new Set(activeProducts.map((row) => row.id));
  const activePrices = priceRows.filter(
    (row) => isUuid(row.product_id) && activeProductIds.has(row.product_id),
  );

  assert(
    categoryRows.length === 0 &&
      supplierRows.length === 0 &&
      productRows.length === 1 &&
      activeProducts.length === 1 &&
      activeProducts[0].id === state.productId &&
      priceRows.length === activePrices.length,
    "BLOCKED_TASK149_CATALOG_FIXTURE_SCOPE_NOT_EXACT",
    "catalog_authoritative_manifest",
    {
      categoryCount: categoryRows.length,
      priceCount: priceRows.length,
      productCount: productRows.length,
      supplierCount: supplierRows.length,
    },
  );

  const ids = {
    categories: new Set(activeCategories.map((row) => row.id)),
    prices: new Set(activePrices.map((row) => row.id)),
    products: activeProductIds,
    suppliers: new Set(activeSuppliers.map((row) => row.id)),
    tombstones: {
      categories: new Set(),
      products: new Set(),
      suppliers: new Set(),
    },
  };
  const counts = {
    categories: ids.categories.size,
    prices: ids.prices.size,
    products: ids.products.size,
    suppliers: ids.suppliers.size,
  };
  const laneLimits = {
    categories: Math.min(requestedLimit, 240),
    prices: Math.min(requestedLimit, 120),
    products: Math.min(requestedLimit, 60),
    suppliers: Math.min(requestedLimit, 240),
  };
  const expectedPageCount = Object.entries(counts).reduce(
    (sum, [lane, count]) =>
      sum + (count === 0 ? 0 : Math.ceil(count / laneLimits[lane])),
    0,
  );

  return {
    catalogSummary: {
      activeProducts: counts.products,
      ...counts,
    },
    expectedPageCount,
    ids,
  };
}

function assertCatalogDrainExactness(
  firstPage,
  aggregate,
  authoritativeManifest = null,
  pageCount = null,
) {
  const categoryIds = assertUniqueCatalogLane(
    aggregate.categories,
    "categoryId",
    "catalog_categories_exactness",
  );
  const supplierIds = assertUniqueCatalogLane(
    aggregate.suppliers,
    "supplierId",
    "catalog_suppliers_exactness",
  );
  const productIds = assertUniqueCatalogLane(
    aggregate.products,
    "productId",
    "catalog_products_exactness",
  );
  const priceIds = assertUniqueCatalogLane(
    aggregate.prices,
    "priceId",
    "catalog_prices_exactness",
  );
  const categoryTombstoneIds = assertUniqueCatalogLane(
    aggregate.tombstones.categories,
    "categoryId",
    "catalog_category_tombstones_exactness",
  );
  const supplierTombstoneIds = assertUniqueCatalogLane(
    aggregate.tombstones.suppliers,
    "supplierId",
    "catalog_supplier_tombstones_exactness",
  );
  const productTombstoneIds = assertUniqueCatalogLane(
    aggregate.tombstones.products,
    "productId",
    "catalog_product_tombstones_exactness",
  );

  for (const [activeIds, tombstoneIds, lane] of [
    [categoryIds, categoryTombstoneIds, "categories"],
    [supplierIds, supplierTombstoneIds, "suppliers"],
    [productIds, productTombstoneIds, "products"],
  ]) {
    assert(
      [...activeIds].every((id) => !tombstoneIds.has(id)),
      "TASK149_CATALOG_EXACTNESS_FAILED",
      `catalog_${lane}_active_tombstone_overlap`,
    );
  }

  if (firstPage.syncMode !== "full_refresh") return;

  const summary = firstPage.catalogSummary;
  if (authoritativeManifest) {
    assertSameIdSet(
      categoryIds,
      authoritativeManifest.ids.categories,
      "catalog_authoritative_categories_exactness",
    );
    assertSameIdSet(
      supplierIds,
      authoritativeManifest.ids.suppliers,
      "catalog_authoritative_suppliers_exactness",
    );
    assertSameIdSet(
      productIds,
      authoritativeManifest.ids.products,
      "catalog_authoritative_products_exactness",
    );
    assertSameIdSet(
      priceIds,
      authoritativeManifest.ids.prices,
      "catalog_authoritative_prices_exactness",
    );
    assertSameIdSet(
      categoryTombstoneIds,
      authoritativeManifest.ids.tombstones.categories,
      "catalog_authoritative_category_tombstones_exactness",
    );
    assertSameIdSet(
      supplierTombstoneIds,
      authoritativeManifest.ids.tombstones.suppliers,
      "catalog_authoritative_supplier_tombstones_exactness",
    );
    assertSameIdSet(
      productTombstoneIds,
      authoritativeManifest.ids.tombstones.products,
      "catalog_authoritative_product_tombstones_exactness",
    );
    assert(
      Object.entries(authoritativeManifest.catalogSummary).every(
        ([key, value]) => summary?.[key] === value,
      ) &&
        Object.keys(summary ?? {}).length ===
          Object.keys(authoritativeManifest.catalogSummary).length &&
        pageCount === authoritativeManifest.expectedPageCount,
      "TASK149_CATALOG_AUTHORITATIVE_MANIFEST_MISMATCH",
      "catalog_full_manifest_exactness",
      {
        actualPages: pageCount,
        expectedPages: authoritativeManifest.expectedPageCount,
      },
    );
  }
  assert(
    isRecord(summary) &&
      ["activeProducts", "categories", "prices", "products", "suppliers"].every(
        (key) => Number.isSafeInteger(summary[key]) && summary[key] >= 0,
      ) &&
      summary.activeProducts === aggregate.products.length &&
      summary.categories ===
        aggregate.categories.length + aggregate.tombstones.categories.length &&
      summary.prices === aggregate.prices.length &&
      summary.products ===
        aggregate.products.length + aggregate.tombstones.products.length &&
      summary.suppliers ===
        aggregate.suppliers.length + aggregate.tombstones.suppliers.length,
    "TASK149_CATALOG_SUMMARY_EXACTNESS_FAILED",
    "catalog_full_manifest_exactness",
  );
}

async function pullCatalog(client, tracker, config, state, auth, options = {}) {
  let cursor = "";
  let firstPage = null;
  let invariant = null;
  let lastPage = null;
  let pageCount = 0;
  const seenCursors = new Set();
  const requestedLimit = options.limit ?? 1;
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

  do {
    pageCount += 1;
    assert(
      pageCount <= MAX_CATALOG_PAGES,
      "TASK149_CATALOG_DRAIN_BOUND_EXCEEDED",
      "catalog_pull",
      { maximumPages: MAX_CATALOG_PAGES },
    );
    const result = await requestJson(
      tracker,
      config,
      "/api/pos/catalog/pull",
      {
        ...auth,
        appVersion: APP_VERSION,
        limit: requestedLimit,
        ...(cursor
          ? { syncCursor: cursor }
          : options.updatedSince
            ? { updatedSince: options.updatedSince }
            : {}),
      },
      `catalog_pull_${options.label ?? "full"}_${pageCount}`,
    );
    assert(
      result.status === 200 &&
        isRecord(result.body) &&
        result.body.ok === true &&
        result.body.code === "success" &&
        isRecord(result.body.catalog) &&
        Array.isArray(result.body.catalog.products) &&
        Array.isArray(result.body.catalog.categories) &&
        Array.isArray(result.body.catalog.prices) &&
        Array.isArray(result.body.catalog.suppliers) &&
        isRecord(result.body.catalog.tombstones) &&
        typeof result.body.hasMore === "boolean",
      "TASK149_CATALOG_RESPONSE_INVALID",
      "catalog_pull",
      { status: result.status },
    );

    const page = result.body;
    firstPage ??= page;
    lastPage = page;
    const currentInvariant = JSON.stringify({
      catalogRevision: page.catalogRevision,
      catalogSummary: page.catalogSummary,
      snapshotAt: page.snapshotAt,
      syncMode: page.syncMode,
    });
    invariant ??= currentInvariant;
    assert(
      currentInvariant === invariant,
      "TASK149_CATALOG_SNAPSHOT_CHANGED_DURING_DRAIN",
      "catalog_pull",
    );

    aggregate.categories.push(...page.catalog.categories);
    aggregate.prices.push(...page.catalog.prices);
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

    if (page.hasMore === false) {
      cursor = "";
      break;
    }
    cursor = typeof page.syncCursor === "string" ? page.syncCursor : "";
    assert(
      cursor.startsWith("catalog-v2:") && !seenCursors.has(cursor),
      "TASK149_CATALOG_CURSOR_MISSING",
      "catalog_pull",
    );
    seenCursors.add(cursor);
  } while (cursor);

  assert(
    isRecord(firstPage) && isRecord(lastPage) && lastPage.hasMore === false,
    "TASK149_CATALOG_TERMINATION_INVALID",
    "catalog_pull",
  );
  const authoritativeManifest =
    firstPage.syncMode === "full_refresh"
      ? await loadAuthoritativeFullCatalogManifest(
          client,
          state,
          firstPage.snapshotAt,
          requestedLimit,
        )
      : null;
  assertCatalogDrainExactness(
    firstPage,
    aggregate,
    authoritativeManifest,
    pageCount,
  );
  const targetProducts = aggregate.products.filter(
    (product) => product.productId === state.productId,
  );
  assert(
    targetProducts.length <= 1,
    "TASK149_CATALOG_EXACTNESS_FAILED",
    "catalog_pull",
  );

  return {
    ...firstPage,
    catalog: aggregate,
    pageCount,
    targetProduct: targetProducts[0] ?? null,
  };
}

function assertCatalogImageFields(product, expectedVersionId, stage) {
  assert(
    isRecord(product) &&
      Object.hasOwn(product, "primaryImageVersionId") &&
      Object.hasOwn(product, "primaryImageUpdatedAt") &&
      product.primaryImageVersionId === expectedVersionId &&
      (expectedVersionId === null
        ? product.primaryImageUpdatedAt === null ||
          typeof product.primaryImageUpdatedAt === "string"
        : typeof product.primaryImageUpdatedAt === "string") &&
      !Object.keys(product).some((key) =>
        /signed|url|path|sha|bytes|width|height/i.test(key),
      ),
    "TASK149_CATALOG_IMAGE_FIELDS_INVALID",
    stage,
  );
}

async function requestReadUrls(tracker, config, state, auth, versionId, label) {
  const result = await requestJson(
    tracker,
    config,
    "/api/pos/catalog/product-images/read-urls",
    readEnvelope(state, auth, versionId),
    label,
  );
  const body = assertSuccess(result, "read-urls", label);
  assert(
    Array.isArray(body.items) &&
      body.items.length === 2 &&
      body.items[0]?.variant === "main" &&
      body.items[1]?.variant === "thumb" &&
      body.items.every(
        (item) =>
          item.status === "ready" &&
          item.productId === state.productId &&
          item.versionId === versionId &&
          typeof item.signedUrl === "string" &&
          typeof item.expiresAt === "string" &&
          isRecord(item.metadata),
      ),
    "TASK149_READ_RESPONSE_INVALID",
    label,
  );
  const now = Date.now();
  for (const item of body.items) {
    const ttl = Date.parse(item.expiresAt) - now;
    assert(
      ttl >= (READ_URL_TTL_SECONDS - 5) * 1000 &&
        ttl <= (READ_URL_TTL_SECONDS + 5) * 1000,
      "TASK149_READ_URL_TTL_INVALID",
      label,
      { ttlSeconds: Math.round(ttl / 1000) },
    );
  }
  return body;
}

async function downloadAndValidate(tracker, items, expectedImages, label) {
  const expectedByVariant = {
    main: expectedImages.main,
    thumb: expectedImages.thumb,
  };
  for (const item of items) {
    const expected = expectedByVariant[item.variant];
    const startedAt = performance.now();
    let response;
    try {
      response = await fetchWithTimeout(item.signedUrl, {
        cache: "no-store",
        credentials: "omit",
      });
    } catch {
      fail("TASK149_SIGNED_DOWNLOAD_FAILED", label);
    }
    recordResponse(tracker, response, null, performance.now() - startedAt);
    assert(response.ok, "TASK149_SIGNED_DOWNLOAD_FAILED", label, {
      status: response.status,
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert(
      response.headers.get("content-type")?.split(";")[0].trim() ===
        "image/jpeg" &&
        bytes.byteLength === expected.metadata.bytes &&
        sha256Bytes(bytes) === expected.metadata.sha256 &&
        item.metadata.bytes === expected.metadata.bytes &&
        item.metadata.sha256 === expected.metadata.sha256 &&
        item.metadata.width === expected.metadata.width &&
        item.metadata.height === expected.metadata.height,
      "TASK149_DOWNLOADED_JPEG_VALIDATION_FAILED",
      label,
    );
  }
}

async function waitForSignedUrlExpiry(expiresAt) {
  const deadline = Date.parse(expiresAt) + URL_EXPIRY_GRACE_MILLISECONDS;
  assert(
    Number.isFinite(deadline),
    "TASK149_READ_URL_EXPIRY_INVALID",
    "expired_url_renewal",
  );
  const waitMilliseconds = Math.max(0, deadline - Date.now());
  assert(
    waitMilliseconds <= URL_EXPIRY_MAX_WAIT_MILLISECONDS,
    "TASK149_READ_URL_EXPIRY_WAIT_UNBOUNDED",
    "expired_url_renewal",
    { maximumSeconds: URL_EXPIRY_MAX_WAIT_MILLISECONDS / 1000 },
  );

  let lastProgressBucket = null;
  while (Date.now() < deadline) {
    const remainingMilliseconds = deadline - Date.now();
    const progressBucket = Math.ceil(remainingMilliseconds / 45_000);
    if (progressBucket !== lastProgressBucket) {
      lastProgressBucket = progressBucket;
      const progress = {
        event: "TASK149_URL_EXPIRY_WAIT",
        remainingSeconds: Math.ceil(remainingMilliseconds / 1000),
      };
      process.stderr.write(`${JSON.stringify(progress)}\n`);
    }
    await lifecycleDelay(Math.min(15_000, remainingMilliseconds));
  }
}

function isDeterministicExpiredSignedUrlRejection(response) {
  return (
    response instanceof Response &&
    [400, 401, 403, 404, 410].includes(response.status)
  );
}

async function waitForPreDeadlinePendingCleanup(
  client,
  state,
  versionId,
  expectedVersionStatus,
  stage,
) {
  const waitDeadline =
    performance.now() + CLEANUP_PENDING_MAX_WAIT_MILLISECONDS;

  while (true) {
    const rows = await mustQuery(
      `${stage}_lookup`,
      client
        .from("inventory_product_image_versions")
        .select(
          "cleanup_status,id,main_path,pos_upload_capability_expires_at,status,thumb_path",
        )
        .eq("shop_id", state.shopId)
        .eq("product_id", state.productId)
        .eq("id", versionId),
    );
    assert(
      Array.isArray(rows) &&
        rows.length === 1 &&
        rows[0].status === expectedVersionStatus,
      "TASK149_CLEANUP_VERSION_STATE_INVALID",
      stage,
    );

    const row = rows[0];
    const capabilityRemainingMilliseconds =
      Date.parse(row.pos_upload_capability_expires_at) - Date.now();
    assert(
      Number.isFinite(capabilityRemainingMilliseconds) &&
        capabilityRemainingMilliseconds > 0 &&
        capabilityRemainingMilliseconds <=
          POS_UPLOAD_CAPABILITY_MAX_WINDOW_MILLISECONDS,
      "TASK149_UPLOAD_CAPABILITY_WINDOW_INVALID",
      stage,
    );
    assert(
      row.cleanup_status !== "complete",
      "TASK149_CLEANUP_COMPLETED_BEFORE_CAPABILITY_EXPIRY",
      stage,
    );

    if (row.cleanup_status === "pending") {
      return canonicalStoragePaths([row], state, stage);
    }
    if (performance.now() >= waitDeadline) {
      fail("TASK149_CLEANUP_PENDING_NOT_OBSERVED", stage);
    }
    await lifecycleDelay(CLEANUP_PENDING_POLL_MILLISECONDS);
  }
}

async function proveExpiredUrlRenewal(
  tracker,
  config,
  state,
  auth,
  versionId,
  images,
) {
  const lease = await requestReadUrls(
    tracker,
    config,
    state,
    auth,
    versionId,
    "read_before_expiry",
  );
  const oldMain = lease.items[0];
  await waitForSignedUrlExpiry(oldMain.expiresAt);

  let expiredResponse;
  const startedAt = performance.now();
  try {
    expiredResponse = await fetchWithTimeout(oldMain.signedUrl, {
      cache: "no-store",
      credentials: "omit",
    });
  } catch {
    fail(
      "BLOCKED_TASK149_EXPIRED_URL_OBSERVATION_UNAVAILABLE",
      "expired_url_renewal",
    );
  }
  recordResponse(tracker, expiredResponse, null, performance.now() - startedAt);
  assert(
    isDeterministicExpiredSignedUrlRejection(expiredResponse),
    "TASK149_EXPIRED_URL_NOT_DETERMINISTICALLY_REJECTED",
    "expired_url_renewal",
    { status: expiredResponse.status },
  );

  const renewed = await requestReadUrls(
    tracker,
    config,
    state,
    auth,
    versionId,
    "read_after_expiry",
  );
  assert(
    renewed.items[0].signedUrl !== oldMain.signedUrl &&
      Date.parse(renewed.items[0].expiresAt) > Date.parse(oldMain.expiresAt),
    "TASK149_READ_URL_NOT_RENEWED",
    "expired_url_renewal",
  );
  await downloadAndValidate(tracker, renewed.items, images, "renewed_download");
}

async function verifyDurableRedaction(client, config, state, auth) {
  const receipts = await mustQuery(
    "receipt_redaction_lookup",
    client
      .from("pos_product_image_mutation_receipts")
      .select(
        "operation_id,idempotency_key,payload_hash,outcome_status,outcome_code",
      )
      .eq("shop_id", state.shopId)
      .in("operation_id", config.operationIdList),
  );
  assert(
    Array.isArray(receipts) && receipts.length >= 5,
    "TASK149_RECEIPT_PERSISTENCE_INVALID",
    "durable_redaction",
  );

  const audit = await mustQuery(
    "audit_redaction_lookup",
    client
      .from("audit_logs")
      .select("event_key,metadata_redacted,target_type")
      .eq("shop_id", state.shopId)
      .gte("created_at", state.acceptanceStartedAt)
      .like("event_key", "pos.catalog.product_image.%"),
  );
  assert(
    Array.isArray(audit) && audit.length >= 5,
    "TASK149_AUDIT_PERSISTENCE_INVALID",
    "durable_redaction",
  );
  const durableText = JSON.stringify({ audit, receipts });
  assert(
    !FORBIDDEN_DURABLE_TEXT_PATTERN.test(durableText) &&
      !durableText.includes(auth.deviceToken) &&
      !durableText.includes(auth.sessionToken),
    "TASK149_DURABLE_SECRET_OR_URL_LEAK",
    "durable_redaction",
  );
  state.auditRowsBeforeCleanup = audit.length;
}

async function runLifecycle(client, tracker, config, state, auth) {
  state.acceptanceStartedAt = nowIso();
  const [imagesFirst, imagesSecond] = await Promise.all([
    createSyntheticJpegSet(1),
    createSyntheticJpegSet(2),
  ]);

  const baselineCatalog = await pullCatalog(
    client,
    tracker,
    config,
    state,
    auth,
    {
      label: "baseline",
    },
  );
  assert(
    baselineCatalog.targetProduct,
    "TASK149_SYNTHETIC_PRODUCT_NOT_IN_CATALOG",
    "catalog_without_image",
  );
  assertCatalogImageFields(
    baselineCatalog.targetProduct,
    null,
    "catalog_without_image",
  );
  assert(
    baselineCatalog.targetProduct.primaryImageUpdatedAt === null,
    "TASK149_INITIAL_IMAGE_TIMESTAMP_NOT_NULL",
    "catalog_without_image",
  );
  passStep(tracker, "catalog_without_image");
  passStep(tracker, "full_catalog_drain", {
    pages: baselineCatalog.pageCount,
  });
  markCase(tracker, "TASK149_CASE_36");
  markCase(tracker, "TASK149_CASE_41");

  const firstIntentEnvelope = intentEnvelope(config, state, auth, {
    expectedCurrentVersionId: null,
    images: imagesFirst,
    key: "intentFirst",
  });
  const firstIntentResult = await requestJson(
    tracker,
    config,
    "/api/pos/catalog/product-images/intent",
    firstIntentEnvelope,
    "intent_first",
  );
  const firstIntent = assertIntentResponse(
    firstIntentResult,
    "intent_first",
    false,
  );
  passStep(tracker, "intent");

  const replayIntentResult = await requestJson(
    tracker,
    config,
    "/api/pos/catalog/product-images/intent",
    firstIntentEnvelope,
    "intent_first_replay",
  );
  const replayIntent = assertIntentResponse(
    replayIntentResult,
    "intent_first_replay",
    true,
  );
  assert(
    replayIntent.versionId === firstIntent.versionId,
    "TASK149_INTENT_REPLAY_VERSION_CHANGED",
    "intent_first_replay",
  );
  markCase(tracker, "TASK149_CASE_12");

  await uploadIntentImages(tracker, firstIntent, imagesFirst, "upload_first");
  passStep(tracker, "canonical_upload");
  markCase(tracker, "TASK149_CASE_44");

  const firstFinalizeEnvelope = finalizeEnvelope(config, state, auth, {
    expectedCurrentVersionId: null,
    key: "finalizeFirst",
    versionId: firstIntent.versionId,
  });
  const firstFinalizeResult = await requestJson(
    tracker,
    config,
    "/api/pos/catalog/product-images/finalize",
    firstFinalizeEnvelope,
    "finalize_first",
  );
  assertFinalizeResponse(firstFinalizeResult, "finalize_first", false);
  passStep(tracker, "finalize");
  markCase(tracker, "TASK149_CASE_14");

  const replayFinalizeResult = await requestJson(
    tracker,
    config,
    "/api/pos/catalog/product-images/finalize",
    firstFinalizeEnvelope,
    "finalize_first_replay",
  );
  const replayFinalize = assertFinalizeResponse(
    replayFinalizeResult,
    "finalize_first_replay",
    true,
  );
  assert(
    replayFinalize.versionId === firstIntent.versionId,
    "TASK149_FINALIZE_REPLAY_VERSION_CHANGED",
    "finalize_first_replay",
  );
  passStep(tracker, "durable_replay");
  markCase(tracker, "TASK149_CASE_21");

  const firstDelta = await pullCatalog(client, tracker, config, state, auth, {
    label: "first_image_delta",
    updatedSince: baselineCatalog.snapshotAt,
  });
  assertCatalogImageFields(
    firstDelta.targetProduct,
    firstIntent.versionId,
    "catalog_new_version_delta",
  );
  passStep(tracker, "catalog_new_version_delta");
  markCase(tracker, "TASK149_CASE_23");

  const firstRead = await requestReadUrls(
    tracker,
    config,
    state,
    auth,
    firstIntent.versionId,
    "read_first",
  );
  passStep(tracker, "read_urls");
  markCase(tracker, "TASK149_CASE_25");
  markCase(tracker, "TASK149_CASE_29");
  await downloadAndValidate(
    tracker,
    firstRead.items,
    imagesFirst,
    "download_first",
  );
  passStep(tracker, "download_hash_validation");

  const secondIntentEnvelope = intentEnvelope(config, state, auth, {
    expectedCurrentVersionId: firstIntent.versionId,
    images: imagesSecond,
    key: "intentSecond",
  });
  const secondIntentResult = await requestJson(
    tracker,
    config,
    "/api/pos/catalog/product-images/intent",
    secondIntentEnvelope,
    "intent_second",
  );
  const secondIntent = assertIntentResponse(
    secondIntentResult,
    "intent_second",
    false,
  );
  assert(
    secondIntent.versionId !== firstIntent.versionId,
    "TASK149_REPLACEMENT_VERSION_NOT_NEW",
    "intent_second",
  );
  markCase(tracker, "TASK149_CASE_08");
  await uploadIntentImages(
    tracker,
    secondIntent,
    imagesSecond,
    "upload_second",
  );

  const secondFinalizeEnvelope = finalizeEnvelope(config, state, auth, {
    expectedCurrentVersionId: firstIntent.versionId,
    key: "finalizeSecond",
    versionId: secondIntent.versionId,
  });
  const secondFinalizeResult = await requestJson(
    tracker,
    config,
    "/api/pos/catalog/product-images/finalize",
    secondFinalizeEnvelope,
    "finalize_second",
  );
  assertFinalizeResponse(secondFinalizeResult, "finalize_second", false);
  passStep(tracker, "replacement");

  await waitForPreDeadlinePendingCleanup(
    client,
    state,
    firstIntent.versionId,
    "superseded",
    "replacement_cleanup_status",
  );
  const currentVersionRows = await mustQuery(
    "replacement_current_version_status_lookup",
    client
      .from("inventory_product_image_versions")
      .select("cleanup_status,status")
      .eq("shop_id", state.shopId)
      .eq("product_id", state.productId)
      .eq("id", secondIntent.versionId),
  );
  assert(
    Array.isArray(currentVersionRows) &&
      currentVersionRows.length === 1 &&
      currentVersionRows[0].status === "ready" &&
      currentVersionRows[0].cleanup_status === "not_due",
    "TASK149_REPLACEMENT_STATUS_INVALID",
    "replacement_status",
  );
  passStep(tracker, "first_version_superseded");

  const replacementDelta = await pullCatalog(
    client,
    tracker,
    config,
    state,
    auth,
    {
      label: "replacement_delta",
      updatedSince: firstDelta.snapshotAt,
    },
  );
  assertCatalogImageFields(
    replacementDelta.targetProduct,
    secondIntent.versionId,
    "replacement_delta",
  );
  markCase(tracker, "TASK149_CASE_37");

  const staleRemove = await requestJson(
    tracker,
    config,
    "/api/pos/catalog/product-images/remove",
    removeEnvelope(config, state, auth, {
      expectedCurrentVersionId: firstIntent.versionId,
      key: "staleRemoveFirst",
    }),
    "stale_remove_first",
  );
  assertFailure(
    staleRemove,
    "stale_remove_first",
    [409],
    ["expected_version_conflict", "stale_conflict"],
  );

  const deniedRead = await requestJson(
    tracker,
    config,
    "/api/pos/catalog/product-images/read-urls",
    {
      ...readEnvelope(state, auth, secondIntent.versionId),
      deviceToken: "task149-invalid-device-capability",
      sessionToken: "task149-invalid-session-capability",
    },
    "read_auth_denied",
  );
  assertFailure(deniedRead, "read_auth_denied", [401], ["auth_denied"]);
  assert(
    !inspectResourceFailure(deniedRead.body) &&
      !Object.keys(deniedRead.body ?? {}).some((key) =>
        /signed|url|token/i.test(key),
      ),
    "TASK149_AUTH_DENIAL_LEAKED_CAPABILITY",
    "read_auth_denied",
  );
  passStep(tracker, "auth_denial");

  await proveExpiredUrlRenewal(
    tracker,
    config,
    state,
    auth,
    secondIntent.versionId,
    imagesSecond,
  );
  passStep(tracker, "expired_url_renewal");

  const staleIntentResult = await requestJson(
    tracker,
    config,
    "/api/pos/catalog/product-images/intent",
    intentEnvelope(config, state, auth, {
      expectedCurrentVersionId: secondIntent.versionId,
      images: imagesFirst,
      key: "staleIntentThird",
    }),
    "intent_stale_third",
  );
  const staleIntent = assertIntentResponse(
    staleIntentResult,
    "intent_stale_third",
    false,
  );

  const removeEnvelopeSecond = removeEnvelope(config, state, auth, {
    expectedCurrentVersionId: secondIntent.versionId,
    key: "removeSecond",
  });
  const removeResult = await requestJson(
    tracker,
    config,
    "/api/pos/catalog/product-images/remove",
    removeEnvelopeSecond,
    "remove_second",
  );
  const remove = assertSuccess(removeResult, "remove", "remove_second");
  assert(
    remove.replayed === false &&
      remove.status === "removed" &&
      remove.versionId === secondIntent.versionId &&
      remove.currentImageVersionId === null &&
      remove.cleanupStatus === "pending" &&
      typeof remove.imageUpdatedAt === "string",
    "TASK149_REMOVE_RESPONSE_INVALID",
    "remove_second",
  );
  const removedVersionPaths = await waitForPreDeadlinePendingCleanup(
    client,
    state,
    secondIntent.versionId,
    "removed",
    "remove_cleanup_status",
  );

  await assertExactStoragePathsAbsent(
    client,
    removedVersionPaths,
    "remove_storage_delete",
  );
  await putSignedJpeg(
    tracker,
    secondIntent.mainUploadUrl,
    imagesSecond.main,
    "removed_upload_capability_reuse",
  );
  await waitForPreDeadlinePendingCleanup(
    client,
    state,
    secondIntent.versionId,
    "removed",
    "remove_cleanup_after_capability_reuse",
  );
  await removeExactStoragePaths(
    client,
    removedVersionPaths,
    "remove_capability_exact_storage_cleanup",
  );
  await waitForPreDeadlinePendingCleanup(
    client,
    state,
    secondIntent.versionId,
    "removed",
    "remove_cleanup_after_exact_storage_cleanup",
  );
  passStep(tracker, "remove");
  passStep(tracker, "cleanup_status_contract", {
    capabilityReuseBounded: true,
    cleanupOutcome: "pending",
    exactStorageResiduals: 0,
  });
  markCase(tracker, "TASK149_CASE_31");
  markCase(tracker, "TASK149_CASE_34");

  const staleFinalize = await requestJson(
    tracker,
    config,
    "/api/pos/catalog/product-images/finalize",
    finalizeEnvelope(config, state, auth, {
      expectedCurrentVersionId: secondIntent.versionId,
      key: "staleFinalizeThird",
      versionId: staleIntent.versionId,
    }),
    "stale_finalize_pending_third",
  );
  assertFailure(
    staleFinalize,
    "stale_finalize_pending_third",
    [409],
    ["expected_version_conflict", "stale_conflict"],
  );
  passStep(tracker, "stale_conflicts");

  const removeReplayResult = await requestJson(
    tracker,
    config,
    "/api/pos/catalog/product-images/remove",
    removeEnvelopeSecond,
    "remove_second_replay",
  );
  const removeReplay = assertSuccess(
    removeReplayResult,
    "remove",
    "remove_second_replay",
  );
  assert(
    removeReplay.replayed === true &&
      removeReplay.versionId === secondIntent.versionId &&
      removeReplay.currentImageVersionId === null &&
      (removeReplay.status === "removed" ||
        removeReplay.status === "already_removed"),
    "TASK149_REMOVE_REPLAY_INVALID",
    "remove_second_replay",
  );
  markCase(tracker, "TASK149_CASE_33");

  const removalDelta = await pullCatalog(client, tracker, config, state, auth, {
    label: "removal_delta",
    updatedSince: replacementDelta.snapshotAt,
  });
  assertCatalogImageFields(
    removalDelta.targetProduct,
    null,
    "catalog_removal_delta",
  );
  assert(
    typeof removalDelta.targetProduct?.primaryImageUpdatedAt === "string" &&
      removalDelta.targetProduct.primaryImageUpdatedAt !==
        replacementDelta.targetProduct?.primaryImageUpdatedAt,
    "TASK149_CATALOG_REMOVAL_TIMESTAMP_INVALID",
    "catalog_removal_delta",
  );
  passStep(tracker, "catalog_removal_delta");
  markCase(tracker, "TASK149_CASE_38");

  await verifyDurableRedaction(client, config, state, auth);
  passStep(tracker, "durable_redaction");
}

function canonicalStoragePaths(rows, state, stage = "cleanup_storage") {
  const paths = [];
  for (const row of rows) {
    assert(
      isUuid(row.id) &&
        typeof row.main_path === "string" &&
        typeof row.thumb_path === "string",
      "BLOCKED_TASK149_STORAGE_PATH_RESOLUTION_INVALID",
      stage,
    );
    const prefix = `shops/${state.shopId}/products/${state.productId}/primary/${row.id}/`;
    assert(
      row.main_path === `${prefix}main.jpg` &&
        row.thumb_path === `${prefix}thumb.jpg`,
      "BLOCKED_TASK149_STORAGE_PATH_NOT_CANONICAL",
      stage,
    );
    paths.push(row.main_path, row.thumb_path);
  }
  return [...new Set(paths)];
}

function isStorageObjectNotFoundError(error) {
  if (!error || typeof error !== "object") return false;
  if (error.status === 404) return true;
  return ["statusCode", "code"].some((key) => {
    const value = error[key];
    if (typeof value !== "string") return false;
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    return [
      "404",
      "no_such_key",
      "nosuchkey",
      "not_found",
      "notfound",
      "object_not_found",
      "objectnotfound",
    ].includes(normalized);
  });
}

async function assertExactStoragePathsAbsent(client, paths, stage) {
  for (const path of paths) {
    const probe = await client.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .download(path);
    assert(
      isStorageObjectNotFoundError(probe.error) && !probe.data,
      "BLOCKED_TASK149_STORAGE_RESIDUAL",
      stage,
    );
  }
}

async function removeExactStoragePaths(client, paths, stage) {
  const exactPaths = [...new Set(paths)];
  assert(
    exactPaths.length > 0,
    "BLOCKED_TASK149_STORAGE_PATH_RESOLUTION_INVALID",
    stage,
  );
  const removal = await client.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .remove(exactPaths);
  if (removal.error) {
    fail("BLOCKED_TASK149_EXACT_STORAGE_CLEANUP_FAILED", stage, {
      backendCode: removal.error.name ?? "unknown",
    });
  }
  await assertExactStoragePathsAbsent(client, exactPaths, stage);
  return exactPaths.length;
}

async function cleanupStorage(client, state) {
  const rows = await mustQuery(
    "cleanup_storage_path_lookup",
    client
      .from("inventory_product_image_versions")
      .select("id,main_path,thumb_path")
      .eq("shop_id", state.shopId)
      .eq("product_id", state.productId),
  );
  const paths = canonicalStoragePaths(rows ?? [], state);
  state.storagePaths = paths;
  return paths.length > 0
    ? removeExactStoragePaths(client, paths, "cleanup_storage")
    : 0;
}

async function waitForUploadCapabilityExpiry(client, state) {
  let lastProgressBucket = null;

  while (true) {
    const rows = await mustQuery(
      "cleanup_capability_deadline_lookup",
      client
        .from("inventory_product_image_versions")
        .select("actor_kind,id,pos_upload_capability_expires_at")
        .eq("shop_id", state.shopId)
        .eq("product_id", state.productId),
    );
    assert(
      Array.isArray(rows),
      "BLOCKED_TASK149_UPLOAD_CAPABILITY_STATE_INVALID",
      "cleanup_capability_wait",
    );
    if (rows.length === 0) return;
    assert(
      rows.every(
        (row) =>
          row.actor_kind === "pos_staff" &&
          isUuid(row.id) &&
          typeof row.pos_upload_capability_expires_at === "string",
      ),
      "BLOCKED_TASK149_UPLOAD_CAPABILITY_STATE_INVALID",
      "cleanup_capability_wait",
    );

    const deadlines = rows.map((row) =>
      Date.parse(row.pos_upload_capability_expires_at),
    );
    assert(
      deadlines.every(Number.isFinite),
      "BLOCKED_TASK149_UPLOAD_CAPABILITY_STATE_INVALID",
      "cleanup_capability_wait",
    );
    const latestDeadline = Math.max(...deadlines);
    const remainingUntilDeadline = latestDeadline - Date.now();
    assert(
      remainingUntilDeadline <= POS_UPLOAD_CAPABILITY_MAX_WINDOW_MILLISECONDS,
      "BLOCKED_TASK149_UPLOAD_CAPABILITY_WAIT_UNBOUNDED",
      "cleanup_capability_wait",
      {
        maximumSeconds: POS_UPLOAD_CAPABILITY_MAX_WINDOW_MILLISECONDS / 1000,
      },
    );

    const remainingMilliseconds =
      remainingUntilDeadline + POS_UPLOAD_CAPABILITY_EXPIRY_GRACE_MILLISECONDS;
    if (remainingMilliseconds <= 0) return;

    const progressBucket = Math.ceil(remainingMilliseconds / 45_000);
    if (progressBucket !== lastProgressBucket) {
      lastProgressBucket = progressBucket;
      process.stderr.write(
        `${JSON.stringify({
          event: "TASK149_UPLOAD_CAPABILITY_EXPIRY_WAIT",
          remainingSeconds: Math.ceil(remainingMilliseconds / 1000),
        })}\n`,
      );
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(15_000, remainingMilliseconds)),
    );
  }
}

function resolveRecoveredFixtureShopId(rows, state) {
  assert(
    Array.isArray(rows) && rows.length <= 1,
    "BLOCKED_TASK149_FIXTURE_SHOP_RECOVERY_AMBIGUOUS",
    "cleanup_shop_recovery",
  );
  if (rows.length === 0) return null;

  const row = rows[0];
  assert(
    isUuid(row.shop_id) &&
      isUuid(state.platformActorId) &&
      row.shop_code === state.shopCode &&
      row.shop_name === state.shopName &&
      row.created_by_profile_id === state.platformActorId,
    "BLOCKED_TASK149_FIXTURE_SHOP_RECOVERY_IDENTITY_INVALID",
    "cleanup_shop_recovery",
  );
  return row.shop_id;
}

async function recoverFixtureShopForCleanup(client, state) {
  if (state.shopId !== null) {
    assert(
      isUuid(state.shopId),
      "BLOCKED_TASK149_FIXTURE_SHOP_RECOVERY_STATE_INVALID",
      "cleanup_shop_recovery",
    );
    return;
  }

  const rows = await mustQuery(
    "cleanup_shop_recovery_lookup",
    client
      .from("shops")
      .select("created_by_profile_id,shop_code,shop_id,shop_name")
      .eq("shop_code", state.shopCode)
      .limit(2),
  );
  const recoveredShopId = resolveRecoveredFixtureShopId(rows, state);
  if (recoveredShopId !== null) state.shopId = recoveredShopId;
}

async function ensurePlatformCleanupClient(config, state) {
  if (state.platformClient || !state.platformActorId) return;
  state.platformClient = await buildAuthenticatedClient(
    config,
    state.actorIdentities.platform.email,
    state.actorSecrets.platform,
  );
}

async function preparePlatformCleanupClient(client, config, state) {
  if (!state.shopId || state.platformClient) return;
  const rows = await mustQuery(
    "cleanup_platform_client_shop_lookup",
    client
      .from("shops")
      .select("shop_status")
      .eq("shop_id", state.shopId)
      .limit(2),
  );
  assert(
    Array.isArray(rows) && rows.length === 1,
    "BLOCKED_TASK149_PLATFORM_CLEANUP_SHOP_INVALID",
    "cleanup_shop_archive",
  );
  if (rows[0].shop_status !== "archived") {
    await ensurePlatformCleanupClient(config, state);
  }
}

async function cleanupActors(client, state) {
  const timestamp = nowIso();
  const reason = "TASK149 exact synthetic fixture cleanup";

  if (state.shopId) {
    if (state.posSessionId) {
      await mustQuery(
        "cleanup_session_revoke",
        client
          .from("pos_sessions")
          .update({
            revoked_at: timestamp,
            revoked_reason: reason,
            status: "revoked",
            updated_at: timestamp,
          })
          .eq("shop_id", state.shopId)
          .eq("pos_session_id", state.posSessionId),
      );
    }
    if (state.posDeviceCredentialId) {
      await mustQuery(
        "cleanup_device_credential_revoke",
        client
          .from("pos_device_credentials")
          .update({
            revoked_at: timestamp,
            revoked_reason: reason,
            status: "revoked",
            updated_at: timestamp,
          })
          .eq("shop_id", state.shopId)
          .eq("pos_device_credential_id", state.posDeviceCredentialId),
      );
    }
    if (state.shopDeviceId) {
      await mustQuery(
        "cleanup_device_revoke",
        client
          .from("shop_devices")
          .update({
            revoked_at: timestamp,
            status: "revoked",
            updated_at: timestamp,
          })
          .eq("shop_id", state.shopId)
          .eq("shop_device_id", state.shopDeviceId),
      );
    }
    if (state.staffId) {
      await mustQuery(
        "cleanup_staff_archive",
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
          .eq("shop_id", state.shopId)
          .eq("staff_id", state.staffId),
      );
    }
    if (state.mappingId) {
      await mustQuery(
        "cleanup_mapping_disable",
        client
          .from("shop_inventory_sources")
          .update({ disabled_at: timestamp })
          .eq("shop_id", state.shopId)
          .eq("shop_inventory_source_id", state.mappingId)
          .is("disabled_at", null),
      );
    }
    if (state.ownerUserId) {
      await mustQuery(
        "cleanup_member_suspend",
        client
          .from("shop_members")
          .update({
            membership_status: "suspended",
            suspended_at: timestamp,
            updated_at: timestamp,
          })
          .eq("shop_id", state.shopId)
          .eq("profile_id", state.ownerUserId)
          .eq("membership_status", "active"),
      );
    }

    const shopRows = await mustQuery(
      "cleanup_shop_lookup",
      client
        .from("shops")
        .select("shop_code,shop_status")
        .eq("shop_id", state.shopId),
    );
    if (shopRows?.[0]?.shop_status !== "archived") {
      assert(
        state.platformClient,
        "BLOCKED_TASK149_PLATFORM_CLEANUP_ACTOR_REQUIRED",
        "cleanup_shop_archive",
      );
      await mustAction(
        "cleanup_shop_archive",
        state.platformClient.rpc("platform_soft_delete_shop", {
          p_reason: reason,
          p_shop_code_confirmation: shopRows[0]?.shop_code,
          p_shop_id: state.shopId,
        }),
      );
    }
  }

  if (state.platformActorId) {
    await mustQuery(
      "cleanup_platform_actor_revoke",
      client
        .from("platform_admins")
        .update({
          reason_redacted: reason,
          revoked_at: timestamp,
          revoked_by_profile_id: state.platformActorId,
          status: "revoked",
        })
        .eq("profile_id", state.platformActorId),
    );
  }

  const actorEntries = [
    {
      id: state.ownerUserId,
      identity: state.actorIdentities.owner,
    },
    {
      id: state.platformActorId,
      identity: state.actorIdentities.platform,
    },
  ].filter((entry) => isUuid(entry.id));
  const profileIds = actorEntries.map((entry) => entry.id);
  if (profileIds.length > 0) {
    await mustQuery(
      "cleanup_profiles_disable",
      client
        .from("profiles")
        .update({
          disabled_at: timestamp,
          profile_status: "disabled",
          updated_at: timestamp,
        })
        .in("profile_id", profileIds),
    );
  }

  for (const actor of actorEntries) {
    const result = await client.auth.admin.updateUserById(actor.id, {
      ban_duration: "876000h",
      user_metadata: {
        fixtureRole: actor.identity.role,
        source: CLEANED_ACTOR_SOURCE,
      },
    });
    if (result.error) {
      const recovered = await recoverFixtureAuthActors(
        client,
        state,
        "cleanup_auth_actor_disable_recovery",
      );
      const candidate =
        actor.identity.role === state.actorIdentities.owner.role
          ? recovered.owner
          : recovered.platform;
      const bannedUntil = Date.parse(candidate?.banned_until ?? "");
      assert(
        candidate?.id === actor.id &&
          Number.isFinite(bannedUntil) &&
          bannedUntil > Date.now() &&
          actorMetadataMatches(
            candidate,
            actor.identity,
            new Set([CLEANED_ACTOR_SOURCE]),
          ),
        "BLOCKED_TASK149_AUTH_ACTOR_DISABLE_FAILED",
        "cleanup_actors",
        { backendCode: result.error.code ?? "unknown" },
      );
    }
  }
}

async function verifyActorCleanup(client, state) {
  const queries = [
    client
      .from("shops")
      .select("shop_id")
      .eq("shop_code", state.shopCode)
      .neq("shop_status", "archived"),
  ];
  if (state.shopId) {
    queries.push(
      client
        .from("shops")
        .select("shop_id")
        .eq("shop_id", state.shopId)
        .neq("shop_status", "archived"),
      client
        .from("staff_accounts")
        .select("staff_id")
        .eq("shop_id", state.shopId)
        .neq("status", "archived"),
      client
        .from("shop_devices")
        .select("shop_device_id")
        .eq("shop_id", state.shopId)
        .eq("status", "active"),
      client
        .from("pos_sessions")
        .select("pos_session_id")
        .eq("shop_id", state.shopId)
        .eq("status", "active"),
      client
        .from("pos_device_credentials")
        .select("pos_device_credential_id")
        .eq("shop_id", state.shopId)
        .eq("status", "active"),
      client
        .from("shop_inventory_sources")
        .select("shop_inventory_source_id")
        .eq("shop_id", state.shopId)
        .is("disabled_at", null),
      client
        .from("shop_members")
        .select("shop_member_id")
        .eq("shop_id", state.shopId)
        .eq("membership_status", "active"),
    );
  }
  if (state.platformActorId) {
    queries.push(
      client
        .from("platform_admins")
        .select("profile_id")
        .eq("profile_id", state.platformActorId)
        .eq("status", "active"),
    );
  }
  const profileIds = [state.ownerUserId, state.platformActorId].filter(isUuid);
  if (profileIds.length > 0) {
    queries.push(
      client
        .from("profiles")
        .select("profile_id")
        .in("profile_id", profileIds)
        .eq("profile_status", "active"),
    );
  }
  const results = await Promise.all(queries);
  let activeActorRows = 0;
  for (const result of results) {
    if (result.error) {
      fail("BLOCKED_TASK149_ACTOR_CLEANUP_VERIFY_FAILED", "cleanup_verify", {
        backendCode: result.error.code ?? "unknown",
      });
    }
    activeActorRows += result.data?.length ?? 0;
  }
  assert(
    activeActorRows === 0,
    "BLOCKED_TASK149_ACTIVE_FIXTURE_RESIDUAL",
    "cleanup_verify",
    { activeActorRows },
  );

  const authActors = await recoverFixtureAuthActors(
    client,
    state,
    "cleanup_auth_actor_verify",
  );
  let activeAuthActors = 0;
  const expectedAuthActors = [
    {
      actor: authActors.owner,
      id: state.ownerUserId,
      identity: state.actorIdentities.owner,
    },
    {
      actor: authActors.platform,
      id: state.platformActorId,
      identity: state.actorIdentities.platform,
    },
  ];
  for (const expected of expectedAuthActors) {
    if (expected.id === null) {
      assert(
        expected.actor === null,
        "BLOCKED_TASK149_AUTH_ACTOR_IDENTITY_MISMATCH",
        "cleanup_auth_actor_verify",
      );
      continue;
    }
    assert(
      expected.actor?.id === expected.id,
      "BLOCKED_TASK149_AUTH_ACTOR_IDENTITY_MISSING",
      "cleanup_auth_actor_verify",
    );
    const bannedUntil = Date.parse(expected.actor.banned_until ?? "");
    const inactive =
      Number.isFinite(bannedUntil) &&
      bannedUntil > Date.now() &&
      actorMetadataMatches(
        expected.actor,
        expected.identity,
        new Set([CLEANED_ACTOR_SOURCE]),
      );
    if (!inactive) activeAuthActors += 1;
  }
  assert(
    activeAuthActors === 0,
    "BLOCKED_TASK149_ACTIVE_AUTH_ACTOR_RESIDUAL",
    "cleanup_auth_actor_verify",
    { activeAuthActors },
  );
  return { activeActorRows, activeAuthActors };
}

async function cleanupFixture(client, config, state) {
  await recoverFixtureAuthActors(client, state, "cleanup_auth_actor_recovery");
  await recoverFixtureShopForCleanup(client, state);
  await preparePlatformCleanupClient(client, config, state);
  if (!state.productId || !state.shopId) {
    await cleanupActors(client, state);
    const actors = await verifyActorCleanup(client, state);
    return {
      ...actors,
      auditRowsPreserved: 0,
      databaseResidualRows: 0,
      storageObjectsRemoved: 0,
      writeBudgetResidualRows: 0,
    };
  }

  await cleanupActors(client, state);
  await waitForUploadCapabilityExpiry(client, state);
  const storageObjectsRemoved = await cleanupStorage(client, state);
  const applied = await callCleanupRpc(client, config, state, "apply");
  state.cleanupApplied = true;
  const verified = await callCleanupRpc(client, config, state, "verify");
  const databaseResidualRows = Object.values(verified.counts).reduce(
    (sum, value) => sum + value,
    0,
  );
  const writeBudgetResidualRows = verified.counts.write_budget_rows;
  assert(
    databaseResidualRows === 0,
    "BLOCKED_TASK149_DATABASE_RESIDUAL",
    "cleanup_verify",
    { databaseResidualRows },
  );
  assert(
    writeBudgetResidualRows === 0,
    "BLOCKED_TASK149_WRITE_BUDGET_RESIDUAL",
    "cleanup_verify",
    { writeBudgetResidualRows },
  );
  assert(
    applied.counts.products <= 1,
    "BLOCKED_TASK149_CLEANUP_SCOPE_INVALID",
    "cleanup_apply",
  );

  const auditRows = await mustQuery(
    "cleanup_audit_preservation_lookup",
    client
      .from("audit_logs")
      .select("audit_log_id")
      .eq("shop_id", state.shopId)
      .gte("created_at", state.acceptanceStartedAt ?? "1970-01-01T00:00:00Z")
      .like("event_key", "pos.catalog.product_image.%"),
  );
  const auditRowsPreserved = auditRows?.length ?? 0;
  assert(
    state.auditRowsBeforeCleanup === null ||
      auditRowsPreserved >= state.auditRowsBeforeCleanup,
    "BLOCKED_TASK149_AUDIT_NOT_PRESERVED",
    "cleanup_verify",
  );

  const actors = await verifyActorCleanup(client, state);
  return {
    ...actors,
    auditRowsPreserved,
    databaseResidualRows,
    storageObjectsRemoved,
    writeBudgetResidualRows,
  };
}

function summarizeSamples(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    averageMilliseconds: Math.round(total / sorted.length),
    count: sorted.length,
    maxMilliseconds: Math.round(sorted.at(-1)),
    minMilliseconds: Math.round(sorted[0]),
    p50Milliseconds: Math.round(sorted[Math.floor((sorted.length - 1) * 0.5)]),
  };
}

function summarizeRouteTimings(tracker) {
  const routes = ["intent", "finalize", "read-urls", "remove"];
  const summary = { authenticated: {}, light: {} };
  for (const requestClass of ["light", "authenticated"]) {
    for (const route of routes) {
      const samples = tracker.routeTimings[requestClass].get(route) ?? [];
      assert(
        samples.length >= 2,
        "TASK149_ROUTE_WARM_SERIES_INCOMPLETE",
        "result",
        { requestClass, route, sampleCount: samples.length },
      );
      summary[requestClass][route] = summarizeSamples(samples);
    }
  }
  return summary;
}

function buildSafeOutput(config, tracker, cleanup, elapsedMilliseconds) {
  for (const marker of REQUIRED_CASE_MARKERS) {
    assert(
      tracker.caseMarkers.has(marker),
      "TASK149_CASE_MARKER_NOT_EXERCISED",
      "result",
      { marker },
    );
  }
  for (const step of ACCEPTANCE_STEP_NAMES) {
    assert(
      tracker.stepResults.get(step)?.status === "PASS",
      "TASK149_ACCEPTANCE_STEP_NOT_COMPLETE",
      "result",
      { acceptanceStep: step },
    );
  }
  assert(
    tracker.status503Count === 0 &&
      tracker.serverErrorCount === 0 &&
      tracker.resourceFailureCount === 0,
    "TASK149_RESOURCE_FAILURE_OBSERVED",
    "result",
  );
  assert(
    tracker.coldCandidate?.route === "intent" &&
      tracker.coldCandidate.status === 400 &&
      typeof tracker.observabilityStartedAt === "string" &&
      typeof tracker.observabilityEndedAt === "string",
    "TASK149_COLD_CANDIDATE_TIMING_MISSING",
    "result",
  );

  const output = {
    acceptance: Object.fromEntries(
      ACCEPTANCE_STEP_NAMES.map((name) => [
        name,
        tracker.stepResults.get(name),
      ]),
    ),
    caseMarkers: [...tracker.caseMarkers].sort(),
    cleanup,
    elapsedMilliseconds: Math.round(elapsedMilliseconds),
    mode: "execution",
    acceptanceComplete: false,
    localChecksOk: true,
    ok: false,
    requiredExternalPostRun: [
      "cloudflare_cpu_memory",
      "cloudflare_runtime_log_scan",
    ],
    resourceStatus: {
      cloudflareCpuMemoryQuery: "REQUIRED_EXTERNAL_POST_RUN",
      coldCandidate: {
        durationMilliseconds: Math.round(
          tracker.coldCandidate.durationMilliseconds,
        ),
        route: tracker.coldCandidate.route,
        status: tracker.coldCandidate.status,
      },
      externalLogScan: "REQUIRED_EXTERNAL_POST_RUN",
      maxRequestMilliseconds: Math.round(tracker.maxDurationMilliseconds),
      observabilityWindowUtc: {
        endedAt: tracker.observabilityEndedAt,
        startedAt: tracker.observabilityStartedAt,
      },
      requestCount: tracker.requestCount,
      resourceFailures: tracker.resourceFailureCount,
      routeTimings: summarizeRouteTimings(tracker),
      serverErrors: tracker.serverErrorCount,
      status503: tracker.status503Count,
    },
    runMarker: config.runMarker,
    status: "PASS_LOCAL_AWAITING_EXTERNAL",
    target: config.target,
  };
  const serialized = JSON.stringify(output, null, 2);
  assert(
    !FORBIDDEN_OUTPUT_PATTERN.test(serialized),
    "TASK149_REFUSING_SENSITIVE_OUTPUT",
    "result",
  );
  return serialized;
}

async function main() {
  if (
    process.argv.length === 3 &&
    process.argv[2] === "--self-test-cooperative-abort"
  ) {
    await runCooperativeAbortSelfTest();
    return;
  }
  const startedAt = performance.now();
  const config = validateConfig();
  const dryRun = process.argv.includes("--dry-run");
  const client = buildServiceClient(config);

  if (dryRun) {
    const output = {
      cleanupContract: {
        countKeys: [...CLEANUP_COUNT_KEYS],
        exactOperationCount: config.operationIdList.length,
        requiredRpc: config.cleanupRpc,
        storagePaths: "database_derived_only",
      },
      mode: "dry-run",
      ok: true,
      production: "FORBIDDEN",
      runMarker: config.runMarker,
      status: "PASS_CONFIG_DRY_RUN",
      target: config.target,
      wouldMutate: false,
    };
    const serialized = JSON.stringify(output, null, 2);
    assert(
      !FORBIDDEN_OUTPUT_PATTERN.test(serialized),
      "TASK149_REFUSING_SENSITIVE_OUTPUT",
      "dry_run",
    );
    process.stdout.write(`${serialized}\n`);
    return;
  }

  const tracker = createRequestTracker();
  const state = emptyFixtureState(config);
  let primaryError = null;
  let cleanup = null;

  try {
    throwIfLifecycleAbortRequested();
    await assertCleanupPreflight(client, config);
    throwIfLifecycleAbortRequested();
    await runImageRouteLightProbes(tracker, config);
    throwIfLifecycleAbortRequested();
    const fixture = await setupFixture(client, config, state);
    throwIfLifecycleAbortRequested();
    const auth = await firstLogin(tracker, config, state, fixture);
    throwIfLifecycleAbortRequested();
    await runLifecycle(client, tracker, config, state, auth);
    throwIfLifecycleAbortRequested();
    process.stderr.write(
      `${JSON.stringify({
        event: "TASK149_REQUEST_PHASE_COMPLETE",
        observabilityWindowUtc: {
          endedAt: tracker.observabilityEndedAt,
          startedAt: tracker.observabilityStartedAt,
        },
        requestCount: tracker.requestCount,
      })}\n`,
    );
  } catch (error) {
    primaryError = error;
  } finally {
    cleanupInProgress = true;
    try {
      cleanup = await cleanupFixture(client, config, state);
    } catch (cleanupError) {
      throw new HarnessError(
        "BLOCKED_TASK149_GUARDED_CLEANUP_FAILED",
        "cleanup_finally",
        {
          cleanupCode:
            cleanupError instanceof HarnessError
              ? cleanupError.code
              : "unknown",
          primaryCode:
            primaryError instanceof HarnessError
              ? primaryError.code
              : primaryError
                ? "TASK149_UNEXPECTED_FAILURE"
                : "none",
          requiredRpc: CLEANUP_RPC,
        },
      );
    }
  }

  if (primaryError) throw primaryError;
  process.stdout.write(
    `${buildSafeOutput(
      config,
      tracker,
      cleanup,
      performance.now() - startedAt,
    )}\n`,
  );
}

main()
  .catch((error) => {
    const payload = {
      code:
        error instanceof HarnessError
          ? error.code
          : "TASK149_UNEXPECTED_FAILURE",
      details: error instanceof HarnessError ? safeDetails(error.details) : {},
      ok: false,
      stage: error instanceof HarnessError ? error.stage : "unhandled",
      status:
        error instanceof HarnessError && error.code.startsWith("BLOCKED_")
          ? "BLOCKED"
          : "FAIL",
    };
    const serialized = JSON.stringify(payload, null, 2);
    if (FORBIDDEN_OUTPUT_PATTERN.test(serialized)) {
      process.stderr.write(
        '{"code":"TASK149_REFUSING_SENSITIVE_OUTPUT","ok":false,"status":"FAIL"}\n',
      );
    } else {
      process.stderr.write(`${serialized}\n`);
    }
    process.exitCode = 1;
  })
  .finally(() => {
    process.off(HARNESS_COOPERATIVE_ABORT_SIGNAL, handleCooperativeAbort);
  });
