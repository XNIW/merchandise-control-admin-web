#!/usr/bin/env node

import { randomBytes, randomUUID, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_BASE_URL =
  "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev";
const DEFAULT_PROJECT_REF = "jpgoimipbothfgkokyvm";
const MARKER = "TASK094";
const SHOP_PREFIX = "TASK094_TEST_SHOP_";
const STAFF_PREFIX = "TASK094_POS_";
const DEVICE_PREFIX = "TASK094_DEVICE_";
const PRODUCT_PREFIX = "TASK094_BARCODE_";
const CATEGORY_PREFIX = "TASK094_TEST_CATEGORY_";
const SUPPLIER_PREFIX = "TASK094_TEST_SUPPLIER_";
const STAFF_CREDENTIAL_SCHEME = "scrypt-v1";
const STAFF_KEY_LENGTH = 64;
const STAFF_SALT_BYTES = 16;
const STAFF_SCRYPT_PARAMS = { N: 16384, p: 1, r: 8 };
const STAFF_SCRYPT_MAXMEM = 64 * 1024 * 1024;
const deriveScrypt = promisify(scrypt);
const sensitivePattern =
  /(SUPABASE_SERVICE_ROLE_KEY|sb_secret_|mcpos_(?:device|session)_[A-Za-z0-9_-]+|credential_hash|sessionToken|deviceToken|trustedDeviceToken|password\s*[:=])/i;

class E2EError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "E2EError";
    this.details = details;
  }
}

function envValue(key) {
  return process.env[key]?.trim() ?? "";
}

function requiredEnv(key) {
  const value = envValue(key);
  if (!value) {
    throw new E2EError(`Missing required env ${key}.`);
  }
  return value;
}

function normalizeRunId(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function uniqueRunId() {
  const requested = normalizeRunId(envValue("TASK094_POS_E2E_TEST_RUN_ID"));
  const suffix = randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  return `${requested || "STG"}${suffix}`.slice(0, 18);
}

function projectRefFromUrl(value) {
  try {
    const url = new URL(value);
    const suffix = ".supabase.co";
    return url.protocol === "https:" && url.hostname.endsWith(suffix)
      ? url.hostname.slice(0, -suffix.length)
      : "";
  } catch {
    return "";
  }
}

function assertStagingTarget(baseUrl, supabaseUrl, projectRef) {
  const base = new URL(baseUrl);
  const hostAllowlist = new Set(
    (envValue("TASK094_POS_E2E_STAGING_HOST_ALLOWLIST") ||
      "merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev")
      .split(/[\s,]+/)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
  const expectedRef =
    envValue("TASK094_POS_E2E_STAGING_PROJECT_REF") ||
    envValue("STAGING_SUPABASE_PROJECT_REF") ||
    envValue("SUPABASE_PROJECT_REF") ||
    DEFAULT_PROJECT_REF;

  if (envValue("TASK094_POS_E2E_ALLOW_STAGING") !== "yes") {
    throw new E2EError("Set TASK094_POS_E2E_ALLOW_STAGING=yes to run staging E2E.");
  }
  if (base.protocol !== "https:" || !hostAllowlist.has(base.hostname.toLowerCase())) {
    throw new E2EError("Staging Admin Web host is not explicitly allowlisted.", {
      host: base.hostname,
    });
  }
  if (projectRef !== expectedRef || projectRefFromUrl(supabaseUrl) !== expectedRef) {
    throw new E2EError("Supabase project ref mismatch for staging E2E.", {
      expectedRef,
      projectRef,
      urlRef: projectRefFromUrl(supabaseUrl),
    });
  }
}

function staffHashParams() {
  return [
    `n=${STAFF_SCRYPT_PARAMS.N}`,
    `r=${STAFF_SCRYPT_PARAMS.r}`,
    `p=${STAFF_SCRYPT_PARAMS.p}`,
    `l=${STAFF_KEY_LENGTH}`,
  ].join(",");
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
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

function nowIso() {
  return new Date().toISOString();
}

function redactError(error) {
  if (!error) {
    return null;
  }
  return {
    code: error.code ?? undefined,
    message: String(error.message ?? error).replace(sensitivePattern, "[REDACTED]"),
  };
}

async function mustOk(label, query) {
  const { error } = await query;
  if (error) {
    throw new E2EError(`${label} failed.`, { error: redactError(error) });
  }
}

async function mustSingle(label, query) {
  const { data, error } = await query;
  if (error || !data) {
    throw new E2EError(`${label} failed.`, { error: redactError(error) });
  }
  return data;
}

function buildClient(supabaseUrl, serviceRoleKey) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "merchandise-control-admin-web/task-094-catalog-import-e2e",
      },
    },
  });
}

async function queryTask094ShopIds(client) {
  const { data, error } = await client
    .from("shops")
    .select("shop_id,created_by_profile_id")
    .like("shop_code", `${SHOP_PREFIX}%`);
  if (error) {
    throw new E2EError("TASK094 shop lookup failed.", { error: redactError(error) });
  }
  return data ?? [];
}

async function cleanupTask094(client, reason) {
  const timestamp = nowIso();
  const shops = await queryTask094ShopIds(client);
  const shopIds = shops.map((shop) => shop.shop_id).filter(Boolean);
  const ownerIds = Array.from(
    new Set(shops.map((shop) => shop.created_by_profile_id).filter(Boolean)),
  );

  if (shopIds.length > 0) {
    await mustOk(
      "TASK094 session revoke",
      client
        .from("pos_sessions")
        .update({ revoked_at: timestamp, revoked_reason: reason, status: "revoked", updated_at: timestamp })
        .in("shop_id", shopIds)
        .eq("status", "active"),
    );
    await mustOk(
      "TASK094 credential revoke",
      client
        .from("pos_device_credentials")
        .update({ revoked_at: timestamp, revoked_reason: reason, status: "revoked", updated_at: timestamp })
        .in("shop_id", shopIds)
        .eq("status", "active"),
    );
    await mustOk(
      "TASK094 device revoke",
      client
        .from("shop_devices")
        .update({ revoked_at: timestamp, status: "revoked", updated_at: timestamp })
        .in("shop_id", shopIds)
        .eq("status", "active"),
    );
    await mustOk(
      "TASK094 staff archive",
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
        .in("shop_id", shopIds)
        .like("staff_code", `${STAFF_PREFIX}%`),
    );
    await mustOk(
      "TASK094 mapping disable",
      client
        .from("shop_inventory_sources")
        .update({ disabled_at: timestamp })
        .in("shop_id", shopIds)
        .is("disabled_at", null),
    );
    await mustOk(
      "TASK094 member suspend",
      client
        .from("shop_members")
        .update({ membership_status: "suspended", suspended_at: timestamp, updated_at: timestamp })
        .in("shop_id", shopIds)
        .eq("membership_status", "active"),
    );
    for (const shop of shops) {
      const actorProfileId = shop.created_by_profile_id;
      await mustOk(
        "TASK094 shop archive",
        client
          .from("shops")
          .update({
            archived_at: timestamp,
            archived_by_profile_id: actorProfileId,
            shop_status: "archived",
            status_reason_redacted: reason,
            status_changed_at: timestamp,
            status_changed_by_profile_id: actorProfileId,
            suspended_at: null,
            suspended_by_profile_id: null,
            updated_at: timestamp,
          })
          .eq("shop_id", shop.shop_id),
      );
    }
  }

  await mustOk(
    "TASK094 product tombstone",
    client
      .from("inventory_products")
      .update({ deleted_at: timestamp, updated_at: timestamp })
      .like("barcode", `${PRODUCT_PREFIX}%`)
      .is("deleted_at", null),
  );
  await mustOk(
    "TASK094 category tombstone",
    client
      .from("inventory_categories")
      .update({ deleted_at: timestamp, updated_at: timestamp })
      .like("name", `${CATEGORY_PREFIX}%`)
      .is("deleted_at", null),
  );
  await mustOk(
    "TASK094 supplier tombstone",
    client
      .from("inventory_suppliers")
      .update({ deleted_at: timestamp, updated_at: timestamp })
      .like("name", `${SUPPLIER_PREFIX}%`)
      .is("deleted_at", null),
  );
  await mustOk(
    "TASK094 profile disable",
    client
      .from("profiles")
      .update({ disabled_at: timestamp, profile_status: "disabled", updated_at: timestamp })
      .like("display_name", "TASK094_TEST_OWNER_%")
      .neq("profile_status", "disabled"),
  );

  if (ownerIds.length > 0) {
    await mustOk(
      "TASK094 owner profile disable",
      client
        .from("profiles")
        .update({ disabled_at: timestamp, profile_status: "disabled", updated_at: timestamp })
        .in("profile_id", ownerIds),
    );
  }
}

async function verifyTask094Cleanup(client) {
  const shops = await queryTask094ShopIds(client);
  const shopIds = shops.map((shop) => shop.shop_id).filter(Boolean);
  const counts = {
    activeCredentials: 0,
    activeDevices: 0,
    activeMappings: 0,
    activeProducts: 0,
    activeSessions: 0,
    activeShopMembers: 0,
    activeShops: 0,
    activeStaff: 0,
    activeTestCategories: 0,
    activeTestSuppliers: 0,
  };

  const [activeShops, activeProducts, activeCategories, activeSuppliers] =
    await Promise.all([
      client
        .from("shops")
        .select("shop_id")
        .like("shop_code", `${SHOP_PREFIX}%`)
        .neq("shop_status", "archived"),
      client
        .from("inventory_products")
        .select("id")
        .like("barcode", `${PRODUCT_PREFIX}%`)
        .is("deleted_at", null),
      client
        .from("inventory_categories")
        .select("id")
        .like("name", `${CATEGORY_PREFIX}%`)
        .is("deleted_at", null),
      client
        .from("inventory_suppliers")
        .select("id")
        .like("name", `${SUPPLIER_PREFIX}%`)
        .is("deleted_at", null),
    ]);

  for (const [label, result] of Object.entries({
    activeProducts,
    activeShops,
    activeTestCategories: activeCategories,
    activeTestSuppliers: activeSuppliers,
  })) {
    if (result.error) {
      throw new E2EError(`TASK094 cleanup proof query failed: ${label}.`, {
        error: redactError(result.error),
      });
    }
    counts[label] = result.data?.length ?? 0;
  }

  if (shopIds.length > 0) {
    const [
      activeStaff,
      activeDevices,
      activeSessions,
      activeCredentials,
      activeMappings,
      activeShopMembers,
    ] = await Promise.all([
      client
        .from("staff_accounts")
        .select("staff_id")
        .in("shop_id", shopIds)
        .like("staff_code", `${STAFF_PREFIX}%`)
        .neq("status", "archived"),
      client.from("shop_devices").select("shop_device_id").in("shop_id", shopIds).eq("status", "active"),
      client.from("pos_sessions").select("pos_session_id").in("shop_id", shopIds).eq("status", "active"),
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
    ]);

    for (const [label, result] of Object.entries({
      activeCredentials,
      activeDevices,
      activeMappings,
      activeSessions,
      activeShopMembers,
      activeStaff,
    })) {
      if (result.error) {
        throw new E2EError(`TASK094 cleanup proof query failed: ${label}.`, {
          error: redactError(result.error),
        });
      }
      counts[label] = result.data?.length ?? 0;
    }
  }

  const activeLeftovers = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return {
    counts,
    ok: activeLeftovers === 0,
  };
}

async function setupDataset(client, runId) {
  const ownerEmail = `task094-test-${runId.toLowerCase()}@example.invalid`;
  const ownerSecret = randomBytes(24).toString("base64url");
  const credential = `Task094-${runId}-Credential!`;
  const staffHash = await hashStaffCredential(credential);
  const timestamp = nowIso();

  const userResult = await client.auth.admin.createUser({
    email: ownerEmail,
    email_confirm: true,
    password: ownerSecret,
    user_metadata: { source: MARKER },
  });
  if (userResult.error || !userResult.data.user) {
    throw new E2EError("TASK094 auth user creation failed.", {
      error: redactError(userResult.error),
    });
  }

  const ownerUserId = userResult.data.user.id;
  const shopCode = `${SHOP_PREFIX}${runId}`.slice(0, 32);
  const staffCode = `${STAFF_PREFIX}${runId}`.slice(0, 32);

  await mustOk(
    "TASK094 profile upsert",
    client.from("profiles").upsert(
      {
        display_name: `TASK094_TEST_OWNER_${runId}`,
        profile_id: ownerUserId,
        profile_status: "active",
      },
      { onConflict: "profile_id" },
    ),
  );
  const shop = await mustSingle(
    "TASK094 shop insert",
    client
      .from("shops")
      .insert({
        created_by_profile_id: ownerUserId,
        shop_code: shopCode,
        shop_name: `TASK094_TEST_SHOP_${runId}`,
        shop_status: "active",
      })
      .select("shop_id,shop_code")
      .maybeSingle(),
  );
  await mustOk(
    "TASK094 shop member insert",
    client.from("shop_members").insert({
      membership_status: "active",
      profile_id: ownerUserId,
      role_key: "shop_owner",
      shop_id: shop.shop_id,
    }),
  );
  const staff = await mustSingle(
    "TASK094 staff insert",
    client
      .from("staff_accounts")
      .insert({
        credential_hash: staffHash,
        credential_kind: "password",
        credential_status: "active",
        credential_updated_at: timestamp,
        credential_version: 1,
        display_name: `TASK094_POS_STAFF_${runId}`,
        failed_attempts: 0,
        must_change_credential: false,
        role_key: "cashier",
        shop_id: shop.shop_id,
        staff_code: staffCode,
        status: "active",
      })
      .select("staff_id,staff_code")
      .maybeSingle(),
  );
  await mustOk(
    "TASK094 inventory source insert",
    client.from("shop_inventory_sources").insert({
      mapping_state: "mapped",
      owner_user_id: ownerUserId,
      shop_id: shop.shop_id,
      source_kind: "mobile_owner",
      verified_at: timestamp,
      verified_by_profile_id: ownerUserId,
    }),
  );

  return {
    barcode: `${PRODUCT_PREFIX}${runId}`.slice(0, 80),
    categoryName: `${CATEGORY_PREFIX}${runId}`,
    credential,
    deviceIdentifier: `${DEVICE_PREFIX}${runId}`,
    ownerUserId,
    productName: `TASK094_TEST_PRODUCT_${runId}`,
    runId,
    shopCode: shop.shop_code,
    shopId: shop.shop_id,
    staffCode: staff.staff_code,
    staffId: staff.staff_id,
    supplierName: `${SUPPLIER_PREFIX}${runId}`,
  };
}

function requestIdFrom(result) {
  return (
    result.headers.get("x-request-id") ||
    result.body?.requestId ||
    result.body?.batch?.serverRequestId ||
    ""
  );
}

async function requestJson(baseUrl, method, path, body, clientRequestId) {
  const response = await fetch(new URL(path, baseUrl), {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined
      ? { "x-client-request-id": clientRequestId }
      : { "content-type": "application/json", "x-client-request-id": clientRequestId },
    method,
  });
  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  return {
    body: parsed,
    headers: response.headers,
    noStore: (response.headers.get("cache-control") ?? "").includes("no-store"),
    status: response.status,
  };
}

function authPayload(auth) {
  return {
    deviceToken: auth.deviceToken,
    posSessionId: auth.posSessionId,
    sessionToken: auth.sessionToken,
    shopDeviceId: auth.shopDeviceId,
  };
}

function importPayload(dataset, auth, overrides = {}) {
  const runId = dataset.runId;
  const item = {
    barcode: dataset.barcode,
    category: dataset.categoryName,
    changeKind: "new",
    clientItemId: `TASK094_ITEM_${runId}`,
    itemNumber: `TASK094_ITEM_NO_${runId}`,
    productName: overrides.productName ?? dataset.productName,
    purchasePrice: overrides.purchasePrice ?? 101,
    quantity: overrides.quantity ?? 4,
    retailPrice: overrides.retailPrice ?? 151,
    rowNumber: 1,
    supplier: dataset.supplierName,
  };

  return {
    ...authPayload(auth),
    appVersion: "task-094-e2e",
    batch: {
      attemptCount: 1,
      clientImportId: `TASK094_IMPORT_${runId}`,
      createdAt: "2026-07-06T12:00:00.000Z",
      idempotencyKey: `TASK094_IDEMP_${runId}`,
      sourceFileName: `task094-${runId}.xlsx`,
    },
    items: [item],
    payloadHash: `client_payload_hash_${runId}`,
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

async function firstLogin(baseUrl, dataset) {
  const result = await requestJson(
    baseUrl,
    "POST",
    "/api/pos/auth/first-login",
    {
      credential: dataset.credential,
      device: {
        appVersion: "task-094-e2e",
        deviceIdentifier: dataset.deviceIdentifier,
        displayName: `TASK094 Device ${dataset.runId}`,
      },
      shopCode: dataset.shopCode,
      staffCode: dataset.staffCode,
    },
    `task094-first-login-${dataset.runId}`,
  );
  if (result.status !== 200 || result.body?.ok !== true) {
    throw new E2EError("TASK094 first-login failed.", {
      code: result.body?.code,
      requestId: requestIdFrom(result),
      status: result.status,
    });
  }
  if (!result.noStore) {
    throw new E2EError("TASK094 first-login response missing no-store.");
  }
  return {
    deviceToken: result.body.trustedDeviceToken,
    posSessionId: result.body.session.posSessionId,
    sessionToken: result.body.session.sessionToken,
    shopDeviceId: result.body.device.shopDeviceId,
  };
}

function assertStatus(label, result, status, code) {
  if (result.status !== status || result.body?.code !== code || result.body?.ok !== false) {
    throw new E2EError(`${label} returned unexpected status.`, {
      code: result.body?.code,
      requestId: requestIdFrom(result),
      status: result.status,
    });
  }
  if (!result.noStore) {
    throw new E2EError(`${label} response missing no-store.`);
  }
}

async function runHttpProofs(baseUrl, dataset, auth) {
  const getResult = await requestJson(
    baseUrl,
    "GET",
    "/api/pos/catalog/import-sync",
    undefined,
    `task094-get-${dataset.runId}`,
  );
  assertStatus("GET import-sync", getResult, 405, "method_not_allowed");

  const invalidPayloadResult = await requestJson(
    baseUrl,
    "POST",
    "/api/pos/catalog/import-sync",
    {},
    `task094-post400-${dataset.runId}`,
  );
  assertStatus("POST empty import-sync", invalidPayloadResult, 400, "validation_failed");

  const invalidAuthResult = await requestJson(
    baseUrl,
    "POST",
    "/api/pos/catalog/import-sync",
    importPayload(dataset, {
      deviceToken: "fake-device-token",
      posSessionId: "00000000-0000-4000-8000-000000000001",
      sessionToken: "fake-session-token",
      shopDeviceId: "00000000-0000-4000-8000-000000000002",
    }),
    `task094-auth-denied-${dataset.runId}`,
  );
  assertStatus("Invalid auth import-sync", invalidAuthResult, 401, "auth_denied");

  const acceptedStart = Date.now();
  const accepted = await requestJson(
    baseUrl,
    "POST",
    "/api/pos/catalog/import-sync",
    importPayload(dataset, auth),
    `task094-accepted-${dataset.runId}`,
  );
  if (
    accepted.status !== 200 ||
    accepted.body?.ok !== true ||
    accepted.body?.batch?.status !== "accepted" ||
    accepted.body?.batch?.clientImportId !== `TASK094_IMPORT_${dataset.runId}` ||
    accepted.body?.batch?.idempotencyKey !== `TASK094_IDEMP_${dataset.runId}` ||
    accepted.body?.batch?.attemptCount !== 1 ||
    accepted.body?.remoteProductIds?.length !== 1 ||
    accepted.body?.remotePriceIds?.length < 2
  ) {
    throw new E2EError("Accepted import proof failed.", {
      requestId: requestIdFrom(accepted),
      status: accepted.status,
      responseCode: accepted.body?.code,
      batchStatus: accepted.body?.batch?.status,
    });
  }

  const duplicate = await requestJson(
    baseUrl,
    "POST",
    "/api/pos/catalog/import-sync",
    importPayload(dataset, auth),
    `task094-duplicate-${dataset.runId}`,
  );
  if (duplicate.status !== 200 || duplicate.body?.batch?.status !== "duplicate") {
    throw new E2EError("Duplicate import proof failed.", {
      requestId: requestIdFrom(duplicate),
      status: duplicate.status,
      batchStatus: duplicate.body?.batch?.status,
    });
  }

  const conflict = await requestJson(
    baseUrl,
    "POST",
    "/api/pos/catalog/import-sync",
    importPayload(dataset, auth, { productName: `${dataset.productName}_CONFLICT` }),
    `task094-conflict-${dataset.runId}`,
  );
  assertStatus("Conflict import-sync", conflict, 409, "conflict");

  const pullStart = Date.now();
  const catalogPull = await requestJson(
    baseUrl,
    "POST",
    "/api/pos/catalog/pull",
    {
      ...authPayload(auth),
      appVersion: "task-094-e2e",
      limit: 50,
    },
    `task094-catalog-pull-${dataset.runId}`,
  );
  if (
    catalogPull.status !== 200 ||
    catalogPull.body?.ok !== true ||
    !Array.isArray(catalogPull.body?.catalog?.products) ||
    !catalogPull.body.catalog.products.some((product) => product.barcode === dataset.barcode) ||
    !Array.isArray(catalogPull.body?.catalog?.prices) ||
    catalogPull.body.catalog.prices.length < 2
  ) {
    throw new E2EError("Catalog pull proof after import failed.", {
      requestId: requestIdFrom(catalogPull),
      status: catalogPull.status,
      productCount: catalogPull.body?.catalog?.products?.length,
      priceCount: catalogPull.body?.catalog?.prices?.length,
    });
  }

  return {
    timings: {
      catalogPullMs: Date.now() - pullStart,
      importMs: Date.now() - acceptedStart,
    },
    requestIds: {
      accepted: requestIdFrom(accepted),
      authDenied: requestIdFrom(invalidAuthResult),
      catalogPull: requestIdFrom(catalogPull),
      conflict: requestIdFrom(conflict),
      duplicate: requestIdFrom(duplicate),
      get405: requestIdFrom(getResult),
      post400: requestIdFrom(invalidPayloadResult),
    },
    serverImportId: accepted.body.batch.serverImportId,
  };
}

async function sqlProof(client, dataset, serverImportId) {
  const [products, batches] = await Promise.all([
    client
      .from("inventory_products")
      .select("id,barcode,deleted_at")
      .eq("shop_id", dataset.shopId)
      .eq("barcode", dataset.barcode),
    client
      .from("pos_catalog_import_batches")
      .select("pos_catalog_import_batch_id,status,ack_response")
      .eq("shop_id", dataset.shopId)
      .eq("client_import_id", `TASK094_IMPORT_${dataset.runId}`),
  ]);
  if (products.error || batches.error) {
    throw new E2EError("TASK094 SQL proof query failed.", {
      batchError: redactError(batches.error),
      productError: redactError(products.error),
    });
  }
  const productIds = (products.data ?? []).map((product) => product.id);
  const batch = (batches.data ?? [])[0];
  const [prices, events] = await Promise.all([
    productIds.length > 0
      ? client
          .from("inventory_product_prices")
          .select("id,type,source")
          .eq("shop_id", dataset.shopId)
          .in("product_id", productIds)
      : { data: [], error: null },
    serverImportId
      ? client
          .from("sync_events")
          .select("id,domain")
          .eq("shop_id", dataset.shopId)
          .eq("batch_id", serverImportId)
      : { data: [], error: null },
  ]);
  if (prices.error || events.error) {
    throw new E2EError("TASK094 SQL proof detail query failed.", {
      eventError: redactError(events.error),
      priceError: redactError(prices.error),
    });
  }

  const domains = new Set((events.data ?? []).map((event) => event.domain));
  const proof = {
    ackResponseStored: Boolean(batch?.ack_response && Object.keys(batch.ack_response).length > 0),
    batchStatus: batch?.status ?? null,
    importBatchRows: batches.data?.length ?? 0,
    priceRows: prices.data?.length ?? 0,
    productRows: products.data?.length ?? 0,
    syncEventRows: events.data?.length ?? 0,
    syncEventDomains: Array.from(domains).sort(),
  };

  if (
    proof.productRows !== 1 ||
    proof.priceRows < 2 ||
    proof.importBatchRows !== 1 ||
    proof.batchStatus !== "accepted" ||
    !proof.ackResponseStored ||
    !domains.has("catalog") ||
    !domains.has("prices")
  ) {
    throw new E2EError("TASK094 SQL proof counts failed.", proof);
  }

  return proof;
}

async function main() {
  const startedAt = Date.now();
  const baseUrl = envValue("TASK094_POS_E2E_BASE_URL") || DEFAULT_BASE_URL;
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const projectRef =
    envValue("TASK094_POS_E2E_STAGING_PROJECT_REF") ||
    envValue("STAGING_SUPABASE_PROJECT_REF") ||
    envValue("SUPABASE_PROJECT_REF") ||
    projectRefFromUrl(supabaseUrl);
  assertStagingTarget(baseUrl, supabaseUrl, projectRef);

  const client = buildClient(supabaseUrl, serviceRoleKey);
  const runId = uniqueRunId();
  let dataset = null;
  let auth = null;
  let httpProof = null;
  let proof = null;

  await cleanupTask094(client, "task094_pre_setup_cleanup");
  try {
    dataset = await setupDataset(client, runId);
    auth = await firstLogin(baseUrl, dataset);
    httpProof = await runHttpProofs(baseUrl, dataset, auth);
    proof = await sqlProof(client, dataset, httpProof.serverImportId);
  } finally {
    await cleanupTask094(client, "task094_final_cleanup");
  }

  const cleanup = await verifyTask094Cleanup(client);
  if (!cleanup.ok) {
    throw new E2EError("TASK094 cleanup left active synthetic rows.", cleanup.counts);
  }

  const output = {
    cleanup: cleanup.counts,
    ok: true,
    projectRef,
    proof,
    requestIds: httpProof.requestIds,
    runId,
    timings: {
      ...httpProof.timings,
      totalMs: Date.now() - startedAt,
    },
  };
  const serialized = JSON.stringify(output, null, 2);
  if (sensitivePattern.test(serialized)) {
    throw new E2EError("Refusing to print sensitive TASK094 E2E output.");
  }
  console.log(serialized);
}

main().catch((error) => {
  const details = error instanceof E2EError ? error.details : {};
  const payload = {
    details,
    error: String(error?.message ?? error).replace(sensitivePattern, "[REDACTED]"),
    ok: false,
  };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
});
