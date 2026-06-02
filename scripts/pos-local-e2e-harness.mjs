#!/usr/bin/env node

import { randomBytes, randomUUID, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_BASE_URL = "http://127.0.0.1:3005";
const MAX_POS_JSON_BODY_BYTES = 16 * 1024;
const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1"]);
const POSITIVE_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TASK032_POS_E2E_SHOP_CODE",
  "TASK032_POS_E2E_STAFF_CODE",
  "TASK032_POS_E2E_PIN_OR_PASSWORD",
  "TASK032_POS_E2E_DEVICE_NAME",
  "TASK032_POS_E2E_CLEANUP_CONFIRMED",
];
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

  if (!enabled) {
    return {
      ok: false,
      reason:
        "Set TASK032_POS_E2E_ENABLE_POSITIVE=yes only with a synthetic dataset and cleanup plan.",
      status: "BLOCKED_DATASET_NOT_CONFIGURED",
    };
  }

  const missing = POSITIVE_ENV_KEYS.filter((key) => !envValue(key));

  if (missing.length > 0) {
    return datasetBlocked("Positive POS E2E is missing required env names.", {
      missing,
    });
  }

  if (envValue("TASK032_POS_E2E_CLEANUP_CONFIRMED") !== "yes") {
    return datasetBlocked("Cleanup must be explicitly confirmed before positive POS E2E.");
  }

  if (!isLocalUrl(baseUrl.toString())) {
    return datasetBlocked("Admin Web base URL must be localhost or 127.0.0.1.");
  }

  const supabaseUrl = envValue("NEXT_PUBLIC_SUPABASE_URL");

  if (!isLocalUrl(supabaseUrl)) {
    return datasetBlocked("Supabase URL must be local for TASK-032 POS E2E.");
  }

  const shopCode = envValue("TASK032_POS_E2E_SHOP_CODE").toUpperCase();
  const staffCode = envValue("TASK032_POS_E2E_STAFF_CODE").toUpperCase();
  const deviceName = envValue("TASK032_POS_E2E_DEVICE_NAME");
  const posCredential = envValue("TASK032_POS_E2E_PIN_OR_PASSWORD");

  if (!shopCode.startsWith("TASK032_TEST_SHOP_")) {
    return datasetBlocked("Shop code must use TASK032_TEST_SHOP_ prefix.");
  }

  if (!staffCode.startsWith("TASK032_POS_")) {
    return datasetBlocked("Staff code must use TASK032_POS_ prefix.");
  }

  if (!deviceName.startsWith("TASK032_DEVICE_")) {
    return datasetBlocked("Device name must use TASK032_DEVICE_ prefix.");
  }

  if (posCredential.length < 8) {
    return datasetBlocked("POS credential must be at least 8 characters.");
  }

  return {
    deviceName,
    ok: true,
    posCredential,
    serviceRoleKey: envValue("SUPABASE_SERVICE_ROLE_KEY"),
    shopCode,
    staffCode,
    supabaseUrl,
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

function safeRunId() {
  return randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
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

async function queryShopIds(client, shopCode) {
  const query = client.from("shops").select("shop_id,shop_code");
  const { data, error } = shopCode
    ? await query.eq("shop_code", shopCode)
    : await query.like("shop_code", "TASK032_TEST_SHOP_%");

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

async function cleanupSyntheticDataset(client, input) {
  const timestamp = nowIso();
  const shopIds = input.shopId
    ? [input.shopId]
    : await queryShopIds(client, input.allTask032 ? undefined : input.shopCode);
  const ownerIds = input.ownerUserId
    ? [input.ownerUserId]
    : await queryOwnerIdsForShops(client, shopIds);
  const summary = {
    activeCredentialRowsTouched: 0,
    activeDeviceRowsTouched: 0,
    activeSessionRowsTouched: 0,
    inventoryOwnersTouched: ownerIds.length,
    shopRowsTouched: shopIds.length,
  };

  for (const shopId of shopIds) {
    const actorProfileId =
      input.ownerUserId ?? (await queryOwnerIdsForShops(client, [shopId]))[0];

    if (!actorProfileId) {
      throw new DatasetSetupError("Synthetic shop cleanup has no owner actor.");
    }

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
      (input.allTask032
        ? client
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
            .eq("shop_id", shopId)
            .like("staff_code", "TASK032_POS_%")
        : client
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
        .eq("shop_id", shopId)
            .eq("staff_code", input.staffCode)),
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
    await mustOk(
      "Synthetic price cleanup",
      client.from("inventory_product_prices").delete().eq("owner_user_id", ownerUserId),
    );

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
    : await queryShopIds(client, input.allTask032 ? undefined : input.shopCode);
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
        .like("staff_code", input.allTask032 ? "TASK032_POS_%" : input.staffCode)
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
    ]);

    for (const [label, result] of Object.entries({
      activeCredentials: credentials,
      activeDevices: devices,
      activeMappings: mappings,
      activeSessions: sessions,
      activeShopMembers: members,
      activeShops: shops,
      activeStaff: staff,
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

  const leftovers = Object.values(counts).reduce((total, value) => total + value, 0);

  return {
    counts,
    ok: leftovers === 0,
    status: leftovers === 0 ? "CLEANUP_VERIFIED" : "CLEANUP_LEFTOVERS_FOUND",
  };
}

async function setupSyntheticDataset(client, config) {
  const runId = safeRunId();
  const timestamp = nowIso();
  const ownerEmail = `task032-test-${runId.toLowerCase()}@example.invalid`;
  const generatedAuthSecret = randomBytes(24).toString("base64url");

  await cleanupSyntheticDataset(client, {
    allTask032: true,
    reason: "task032_pre_setup_cleanup",
  });

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
    "Synthetic profile insert",
    client.from("profiles").insert({
      display_name: `TASK032_TEST_OWNER_${runId}`,
      profile_id: ownerUserId,
      profile_status: "active",
    }),
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
  const response = await fetch(endpointUrl(path), {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
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
    noStore: (response.headers.get("Cache-Control") ?? "")
      .toLowerCase()
      .includes("no-store"),
    status: response.status,
    text,
  };
}

async function runNegativeCase(testCase) {
  const response = await fetch(endpointUrl(testCase.path), {
    body: testCase.body,
    headers: {
      "Content-Type": testCase.contentType,
      "User-Agent": "TASK-032 local POS harness",
    },
    method: "POST",
  });
  const text = await response.text();
  const cacheControl = response.headers.get("Cache-Control") ?? "";
  const statusOk = response.status >= 400 && response.status < 600;
  const noStore = cacheControl.toLowerCase().includes("no-store");
  const redacted = !sensitiveTextPattern.test(text);

  return {
    cacheControl,
    name: testCase.name,
    ok: statusOk && noStore && redacted,
    path: testCase.path,
    redacted,
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
    },
    status: "PASS_LOCAL_POS_E2E_READY_FOR_CLEANUP",
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
          allTask032: true,
          ...dataset,
          reason: "task032_positive_e2e_cleanup",
        });
        const cleanupVerification = await verifyCleanup(client, {
          allTask032: true,
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
      status: "PASS_LOCAL_POS_E2E_WITH_CLEANUP",
    },
  };
}

function outputIsSecretSafe(output) {
  return !sensitiveTextPattern.test(JSON.stringify(output));
}

async function main() {
  const startedAt = new Date().toISOString();
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
