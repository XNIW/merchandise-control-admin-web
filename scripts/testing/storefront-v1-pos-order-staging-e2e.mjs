#!/usr/bin/env node

import { randomBytes, randomUUID, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";

const deriveScrypt = promisify(scrypt);
const MARKER = "TASK030";
const DEFAULT_STAGING_HOST =
  "merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev";
const sensitivePattern =
  /(SUPABASE_SERVICE_ROLE_KEY|sb_secret_|mcpos_(?:device|session)_[A-Za-z0-9_-]+|credential_hash|sessionToken|deviceToken|trustedDeviceToken|password\s*[:=])/i;
const forbiddenPayloadKeys = new Set([
  "addressLine1",
  "customerAddress",
  "customerEmail",
  "deviceToken",
  "ownerUserId",
  "sessionToken",
  "sourceProductId",
  "storagePath",
]);

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
  if (!value) throw new E2EError(`Missing required env ${key}.`);
  return value;
}

function projectRefFromUrl(value) {
  try {
    const host = new URL(value).hostname;
    return host.endsWith(".supabase.co")
      ? host.slice(0, -".supabase.co".length)
      : "";
  } catch {
    return "";
  }
}

function assertStagingTarget(baseUrl, supabaseUrl, projectRef) {
  const target = new URL(baseUrl);
  const allowedHosts = new Set(
    (envValue("TASK030_POS_E2E_STAGING_HOST_ALLOWLIST") || DEFAULT_STAGING_HOST)
      .split(/[\s,]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  const expectedRef =
    envValue("TASK030_POS_E2E_STAGING_PROJECT_REF") ||
    envValue("STAGING_SUPABASE_PROJECT_REF") ||
    envValue("SUPABASE_PROJECT_REF");
  if (envValue("TASK030_POS_E2E_ALLOW_STAGING") !== "yes") {
    throw new E2EError("TASK-030 staging E2E is not explicitly enabled.");
  }
  if (
    target.protocol !== "https:" ||
    !allowedHosts.has(target.hostname.toLowerCase())
  ) {
    throw new E2EError("Admin staging host is not allowlisted.", {
      host: target.hostname,
    });
  }
  if (
    !expectedRef ||
    projectRef !== expectedRef ||
    projectRefFromUrl(supabaseUrl) !== expectedRef
  ) {
    throw new E2EError("Supabase staging project mismatch.", {
      expectedRef,
      projectRef,
      urlRef: projectRefFromUrl(supabaseUrl),
    });
  }
}

function adminClient(supabaseUrl, serviceRoleKey, clientInfo) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": clientInfo } },
  });
}

async function authenticatedClient(
  supabaseUrl,
  serviceRoleKey,
  email,
  password,
) {
  const client = adminClient(
    supabaseUrl,
    serviceRoleKey,
    "merchandise-control-admin-web/task-030-authenticated-fixture",
  );
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    throw new E2EError("Fixture actor authentication failed.", {
      code: error?.code,
    });
  }
  return client;
}

async function mustOk(label, operation) {
  const { error } = await operation;
  if (error) throw new E2EError(`${label} failed.`, { code: error.code });
}

async function insertOne(label, operation) {
  const { data, error } = await operation;
  if (error || !data) {
    throw new E2EError(`${label} failed.`, { code: error?.code });
  }
  return data;
}

async function mustAction(label, operation) {
  const { data, error } = await operation;
  if (error || data?.ok !== true) {
    throw new E2EError(`${label} failed.`, {
      actionCode: data?.code,
      code: error?.code,
    });
  }
  return data;
}

async function hashStaffCredential(plaintext) {
  const salt = randomBytes(16);
  const key = await deriveScrypt(plaintext, salt, 64, {
    N: 16384,
    maxmem: 64 * 1024 * 1024,
    p: 1,
    r: 8,
  });
  return [
    "",
    "scrypt-v1",
    "n=16384,r=8,p=1,l=64",
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

function requestId(result) {
  return result.headers.get("x-request-id") || result.body?.requestId || "";
}

async function requestJson(baseUrl, method, path, body, clientRequestId) {
  const response = await fetch(new URL(path, baseUrl), {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers:
      body === undefined
        ? { "x-client-request-id": clientRequestId }
        : {
            "content-type": "application/json",
            "x-client-request-id": clientRequestId,
          },
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

function containsForbiddenKey(value) {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, child]) =>
      forbiddenPayloadKeys.has(key) || containsForbiddenKey(child),
  );
}

function assertSuccess(label, result, schemaVersion) {
  if (
    result.status !== 200 ||
    result.body?.ok !== true ||
    result.body?.code !== "success" ||
    result.body?.schemaVersion !== schemaVersion ||
    !result.noStore
  ) {
    throw new E2EError(`${label} failed.`, {
      code: result.body?.code,
      requestId: requestId(result),
      status: result.status,
    });
  }
}

function assertFailure(label, result, status, code) {
  if (
    result.status !== status ||
    result.body?.ok !== false ||
    result.body?.code !== code ||
    !result.noStore
  ) {
    throw new E2EError(`${label} returned an unexpected result.`, {
      code: result.body?.code,
      requestId: requestId(result),
      status: result.status,
    });
  }
}

async function setupFixture(client, runtime, runId) {
  const ownerEmail = `task030-owner-${runId.toLowerCase()}@example.invalid`;
  const ownerPassword = randomBytes(24).toString("base64url");
  const platformEmail = `task030-platform-${runId.toLowerCase()}@example.invalid`;
  const platformPassword = randomBytes(24).toString("base64url");
  const credential = `Task030-${runId}-Credential!`;
  const timestamp = new Date().toISOString();

  const ownerResult = await client.auth.admin.createUser({
    email: ownerEmail,
    email_confirm: true,
    password: ownerPassword,
    user_metadata: { source: MARKER },
  });
  if (ownerResult.error || !ownerResult.data.user) {
    throw new E2EError("Owner fixture creation failed.", {
      code: ownerResult.error?.code,
    });
  }
  runtime.ownerId = ownerResult.data.user.id;

  const platformResult = await client.auth.admin.createUser({
    email: platformEmail,
    email_confirm: true,
    password: platformPassword,
    user_metadata: { source: MARKER },
  });
  if (platformResult.error || !platformResult.data.user) {
    throw new E2EError("Platform fixture creation failed.", {
      code: platformResult.error?.code,
    });
  }
  runtime.platformId = platformResult.data.user.id;

  await mustOk(
    "Fixture profiles",
    client.from("profiles").upsert(
      [
        {
          display_name: `TASK030_TEST_OWNER_${runId}`,
          profile_id: runtime.ownerId,
          profile_status: "active",
        },
        {
          display_name: `TASK030_TEST_PLATFORM_${runId}`,
          profile_id: runtime.platformId,
          profile_status: "active",
        },
      ],
      { onConflict: "profile_id" },
    ),
  );
  await mustOk(
    "Platform grant",
    client.from("platform_admins").insert({
      granted_by_profile_id: runtime.platformId,
      profile_id: runtime.platformId,
      reason_redacted: "TASK030 isolated staging fixture",
      status: "active",
    }),
  );
  runtime.platformClient = await authenticatedClient(
    runtime.supabaseUrl,
    runtime.serviceRoleKey,
    platformEmail,
    platformPassword,
  );
  runtime.shopCode = `TASK030_TEST_SHOP_${runId}`.slice(0, 32);
  const shop = await mustAction(
    "Audited shop create",
    runtime.platformClient.rpc("platform_create_shop", {
      p_owner_profile_id: runtime.ownerId,
      p_reason: "TASK030 isolated staging fixture",
      p_shop_code: runtime.shopCode,
      p_shop_name: `TASK030_TEST_SHOP_${runId}`,
    }),
  );
  runtime.shopId = shop.shop_id;

  const ownerClient = await authenticatedClient(
    runtime.supabaseUrl,
    runtime.serviceRoleKey,
    ownerEmail,
    ownerPassword,
  );
  runtime.staffCode = `TASK030_POS_${runId}`.slice(0, 32);
  const staff = await mustAction(
    "Audited staff create",
    ownerClient.rpc("shop_staff_create", {
      p_credential_expires_at: null,
      p_credential_hash: await hashStaffCredential(credential),
      p_credential_kind: "password",
      p_display_name: `TASK030 POS ${runId}`,
      p_role_key: "cashier",
      p_shop_id: runtime.shopId,
      p_staff_code: runtime.staffCode,
    }),
  );
  runtime.staffId = staff.target_id;

  const pickup = await insertOne(
    "Pickup fixture",
    client
      .from("storefront_pickup_points")
      .insert({
        address_line_1: "Fixture staging TASK030",
        commune: "Ñuñoa",
        enabled: true,
        public_name: `Retiro ${runId}`,
        region: "Metropolitana",
        shop_id: runtime.shopId,
      })
      .select("id")
      .single(),
  );
  const slotStart = new Date(Date.now() + 60 * 60 * 1000);
  const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
  const slot = await insertOne(
    "Slot fixture",
    client
      .from("storefront_fulfillment_slots")
      .insert({
        capacity: 10,
        enabled: true,
        ends_at: slotEnd.toISOString(),
        fulfillment_mode: "pickup",
        pickup_point_id: pickup.id,
        public_label: `Retiro TASK030 ${runId}`,
        shop_id: runtime.shopId,
        starts_at: slotStart.toISOString(),
      })
      .select("id")
      .single(),
  );
  const product = await insertOne(
    "Product fixture",
    client
      .from("inventory_products")
      .insert({
        barcode: `TASK030-${runId}`,
        owner_user_id: runtime.ownerId,
        product_name: `Producto público TASK030 ${runId}`,
        retail_price: 1900,
        shop_id: runtime.shopId,
        stock_quantity: 5,
        updated_at: timestamp,
      })
      .select("id")
      .single(),
  );
  const publication = await insertOne(
    "Publication fixture",
    client
      .from("storefront_product_publications")
      .insert({
        availability_mode: "available",
        pickup_enabled: true,
        price_source_mode: "override",
        public_name: `Producto público TASK030 ${runId}`,
        publication_status: "paused",
        published_at: timestamp,
        retail_price_clp: 1900,
        shop_id: runtime.shopId,
        source_product_id: product.id,
      })
      .select("id")
      .single(),
  );
  const order = await insertOne(
    "Customer order fixture",
    client
      .from("customer_orders")
      .insert({
        currency_code: "CLP",
        delivery_fee_clp: 0,
        fulfillment_mode: "pickup",
        fulfillment_snapshot: {
          mode: "pickup",
          pickupPoint: {
            commune: "Ñuñoa",
            publicName: `Retiro ${runId}`,
            region: "Metropolitana",
          },
          slot: {
            endsAt: slotEnd.toISOString(),
            label: `Retiro TASK030 ${runId}`,
            startsAt: slotStart.toISOString(),
          },
        },
        placed_at: timestamp,
        quote_version: 1,
        shop_id: runtime.shopId,
        slot_id: slot.id,
        status: "accepted",
        status_version: 2,
        subtotal_clp: 1900,
        total_clp: 1900,
        updated_at: timestamp,
        user_id: runtime.ownerId,
      })
      .select("id,public_order_code")
      .single(),
  );
  runtime.orderId = order.id;
  await mustOk(
    "Customer order item fixture",
    client.from("customer_order_items").insert({
      line_position: 1,
      line_total_clp: 1900,
      order_id: order.id,
      public_name: `Producto público TASK030 ${runId}`,
      publication_id: publication.id,
      quantity: 1,
      shop_id: runtime.shopId,
      source_product_id: product.id,
      unit_price_clp: 1900,
    }),
  );
  await mustOk(
    "Order status fixtures",
    client.from("customer_order_status_events").insert([
      {
        actor_kind: "system",
        event_version: 1,
        metadata_redacted: { source: MARKER },
        order_id: order.id,
        shop_id: runtime.shopId,
        status: "confirmed",
      },
      {
        actor_kind: "admin",
        event_version: 2,
        metadata_redacted: { source: MARKER },
        order_id: order.id,
        shop_id: runtime.shopId,
        status: "accepted",
      },
    ]),
  );
  const correlationId = randomUUID();
  await mustOk(
    "Order handoff fixture",
    client.from("customer_order_outbox").insert({
      event_type: "customer_order.accepted.v1",
      idempotency_key: randomUUID(),
      order_id: order.id,
      payload: {
        apiVersion: "customer-order-outbox.v1",
        correlationId,
        documentKind: "customer_order",
        eventType: "customer_order.accepted.v1",
        fiscalStatus: "not_created",
        occurredAt: timestamp,
        orderCode: order.public_order_code,
        orderId: order.id,
        shopId: runtime.shopId,
        source: MARKER,
        status: "accepted",
        statusVersion: 2,
      },
      shop_id: runtime.shopId,
      status: "pending",
    }),
  );

  return {
    credential,
    deviceIdentifier: `TASK030_DEVICE_${runId}`,
    order,
  };
}

async function firstLogin(baseUrl, runtime, fixture, runId) {
  const result = await requestJson(
    baseUrl,
    "POST",
    "/api/pos/auth/first-login",
    {
      credential: fixture.credential,
      device: {
        appVersion: "task-030-staging-e2e",
        deviceIdentifier: fixture.deviceIdentifier,
        displayName: `TASK030 Device ${runId}`,
      },
      shopCode: runtime.shopCode,
      staffCode: runtime.staffCode,
    },
    `task030-first-login-${runId}`,
  );
  if (result.status !== 200 || result.body?.ok !== true || !result.noStore) {
    throw new E2EError("POS first login failed.", {
      code: result.body?.code,
      requestId: requestId(result),
      status: result.status,
    });
  }
  return {
    deviceToken: result.body.trustedDeviceToken,
    posSessionId: result.body.session.posSessionId,
    sessionToken: result.body.session.sessionToken,
    shopDeviceId: result.body.device.shopDeviceId,
  };
}

async function exerciseContract(baseUrl, runtime, fixture, auth, runId) {
  const requestIds = {};
  const methodCheck = await requestJson(
    baseUrl,
    "GET",
    "/api/pos/orders/claim",
    undefined,
    `task030-get-${runId}`,
  );
  assertFailure("GET claim", methodCheck, 405, "method_not_allowed");

  const denied = await requestJson(
    baseUrl,
    "POST",
    "/api/pos/orders/claim",
    {
      ...authPayload(auth),
      deviceToken: "invalid-device-token",
      limit: 10,
      schemaVersion: "pos-customer-order-handoff-v1",
      sessionToken: "invalid-session-token",
    },
    `task030-denied-${runId}`,
  );
  assertFailure("Denied claim", denied, 401, "denied");
  requestIds.denied = requestId(denied);

  const claimBody = {
    ...authPayload(auth),
    appVersion: "task-030-staging-e2e",
    limit: 10,
    schemaVersion: "pos-customer-order-handoff-v1",
  };
  const claimStartedAt = Date.now();
  const claim = await requestJson(
    baseUrl,
    "POST",
    "/api/pos/orders/claim",
    claimBody,
    `task030-claim-${runId}`,
  );
  assertSuccess("Order claim", claim, "pos-customer-order-handoff-v1");
  if (
    claim.body.handoffs?.length !== 1 ||
    claim.body.handoffs[0]?.eventType !== "customer_order.accepted.v1" ||
    claim.body.handoffs[0]?.order?.orderId !== fixture.order.id ||
    claim.body.handoffs[0]?.order?.documentKind !== "customer_order" ||
    claim.body.handoffs[0]?.order?.fiscalStatus !== "not_created" ||
    claim.body.handoffs[0]?.order?.items?.length !== 1 ||
    containsForbiddenKey(claim.body)
  ) {
    throw new E2EError(
      "Claim payload is not the expected privacy-safe envelope.",
    );
  }
  const handoff = claim.body.handoffs[0];
  requestIds.claim = requestId(claim);

  const replayClaim = await requestJson(
    baseUrl,
    "POST",
    "/api/pos/orders/claim",
    claimBody,
    `task030-claim-replay-${runId}`,
  );
  assertSuccess("Claim replay", replayClaim, "pos-customer-order-handoff-v1");
  if (
    replayClaim.body.handoffs?.length !== 1 ||
    replayClaim.body.handoffs[0]?.handoffId !== handoff.handoffId ||
    replayClaim.body.handoffs[0]?.leaseToken !== handoff.leaseToken ||
    replayClaim.body.handoffs[0]?.attemptCount !== handoff.attemptCount
  ) {
    throw new E2EError("Live lease replay changed identity or attempt count.");
  }

  const acceptedRequest = {
    ...authPayload(auth),
    appVersion: "task-030-staging-e2e",
    expectedStatusVersion: handoff.order.statusVersion,
    handoffId: handoff.handoffId,
    idempotencyKey: randomUUID(),
    leaseToken: handoff.leaseToken,
    outcome: "accepted",
    schemaVersion: "pos-customer-order-ack-v1",
  };
  const accepted = await requestJson(
    baseUrl,
    "POST",
    "/api/pos/orders/ack",
    acceptedRequest,
    `task030-accepted-${runId}`,
  );
  assertSuccess("Accepted ack", accepted, "pos-customer-order-ack-v1");
  if (
    accepted.body.idempotent !== false ||
    accepted.body.fiscalStatus !== "not_created"
  ) {
    throw new E2EError("Accepted acknowledgement crossed the fiscal boundary.");
  }
  requestIds.accepted = requestId(accepted);

  const acceptedReplay = await requestJson(
    baseUrl,
    "POST",
    "/api/pos/orders/ack",
    acceptedRequest,
    `task030-accepted-replay-${runId}`,
  );
  assertSuccess("Accepted replay", acceptedReplay, "pos-customer-order-ack-v1");
  if (acceptedReplay.body.idempotent !== true) {
    throw new E2EError("Accepted acknowledgement replay was not idempotent.");
  }

  const stalePrepared = await requestJson(
    baseUrl,
    "POST",
    "/api/pos/orders/ack",
    {
      ...acceptedRequest,
      expectedStatusVersion: 1,
      idempotencyKey: randomUUID(),
      outcome: "prepared",
    },
    `task030-stale-${runId}`,
  );
  assertFailure("Stale prepared ack", stalePrepared, 409, "version_conflict");

  const preparedRequest = {
    ...acceptedRequest,
    expectedStatusVersion: accepted.body.orderStatusVersion,
    idempotencyKey: randomUUID(),
    outcome: "prepared",
  };
  const prepared = await requestJson(
    baseUrl,
    "POST",
    "/api/pos/orders/ack",
    preparedRequest,
    `task030-prepared-${runId}`,
  );
  assertSuccess("Prepared ack", prepared, "pos-customer-order-ack-v1");
  if (
    prepared.body.orderStatus !== "ready" ||
    prepared.body.orderStatusVersion !== 4
  ) {
    throw new E2EError("Prepared transition did not produce the ready state.");
  }

  const bogusFiscal = await requestJson(
    baseUrl,
    "POST",
    "/api/pos/orders/ack",
    {
      ...acceptedRequest,
      expectedStatusVersion: prepared.body.orderStatusVersion,
      idempotencyKey: randomUUID(),
      outcome: "completed",
      posSaleId: randomUUID(),
    },
    `task030-fiscal-mismatch-${runId}`,
  );
  assertFailure(
    "Bogus fiscal completion",
    bogusFiscal,
    409,
    "fiscal_sale_mismatch",
  );

  const completedRequest = {
    ...acceptedRequest,
    expectedStatusVersion: prepared.body.orderStatusVersion,
    idempotencyKey: randomUUID(),
    outcome: "completed",
  };
  const completed = await requestJson(
    baseUrl,
    "POST",
    "/api/pos/orders/ack",
    completedRequest,
    `task030-completed-${runId}`,
  );
  assertSuccess("Completed ack", completed, "pos-customer-order-ack-v1");
  if (
    completed.body.orderStatus !== "completed" ||
    completed.body.orderStatusVersion !== 5 ||
    completed.body.fiscalStatus !== "not_created" ||
    completed.body.posSaleId !== undefined
  ) {
    throw new E2EError(
      "Non-fiscal completion returned an invalid boundary state.",
    );
  }
  requestIds.completed = requestId(completed);

  const afterComplete = await requestJson(
    baseUrl,
    "POST",
    "/api/pos/orders/claim",
    claimBody,
    `task030-after-complete-${runId}`,
  );
  assertSuccess(
    "Post-completion claim",
    afterComplete,
    "pos-customer-order-handoff-v1",
  );
  if (afterComplete.body.handoffs?.length !== 0) {
    throw new E2EError("POS received its own terminal status event.");
  }

  return {
    requestIds,
    timings: { claimMs: Date.now() - claimStartedAt },
  };
}

async function databaseProof(client, runtime) {
  const [order, receipts, sales, acceptedOutbox] = await Promise.all([
    client
      .from("customer_orders")
      .select("id,status,status_version")
      .eq("id", runtime.orderId)
      .single(),
    client
      .from("customer_order_pos_receipts")
      .select("outcome,pos_sale_id")
      .eq("order_id", runtime.orderId),
    client
      .from("pos_sales")
      .select("pos_sale_id")
      .eq("shop_id", runtime.shopId),
    client
      .from("customer_order_outbox")
      .select("status")
      .eq("order_id", runtime.orderId)
      .eq("event_type", "customer_order.accepted.v1")
      .single(),
  ]);
  const firstError = [order, receipts, sales, acceptedOutbox].find(
    (result) => result.error,
  )?.error;
  if (firstError) {
    throw new E2EError("Database proof query failed.", {
      code: firstError.code,
    });
  }
  const outcomes = (receipts.data ?? []).map((row) => row.outcome).sort();
  const proof = {
    acceptedOutboxStatus: acceptedOutbox.data?.status,
    fiscalReferenceCount: (receipts.data ?? []).filter((row) => row.pos_sale_id)
      .length,
    orderStatus: order.data?.status,
    orderStatusVersion: order.data?.status_version,
    posSaleCount: sales.data?.length ?? 0,
    receiptOutcomes: outcomes,
  };
  if (
    proof.acceptedOutboxStatus !== "delivered" ||
    proof.fiscalReferenceCount !== 0 ||
    proof.orderStatus !== "completed" ||
    proof.orderStatusVersion !== 5 ||
    proof.posSaleCount !== 0 ||
    JSON.stringify(outcomes) !==
      JSON.stringify(["accepted", "completed", "prepared"])
  ) {
    throw new E2EError(
      "Database proof did not preserve the fiscal boundary.",
      proof,
    );
  }
  return proof;
}

async function cleanup(client, runtime) {
  const timestamp = new Date().toISOString();
  if (runtime.shopId) {
    await mustOk(
      "Session cleanup",
      client
        .from("pos_sessions")
        .update({
          revoked_at: timestamp,
          revoked_reason: "task030_final_cleanup",
          status: "revoked",
          updated_at: timestamp,
        })
        .eq("shop_id", runtime.shopId)
        .eq("status", "active"),
    );
    await mustOk(
      "Credential cleanup",
      client
        .from("pos_device_credentials")
        .update({
          revoked_at: timestamp,
          revoked_reason: "task030_final_cleanup",
          status: "revoked",
          updated_at: timestamp,
        })
        .eq("shop_id", runtime.shopId)
        .eq("status", "active"),
    );
    await mustOk(
      "Device cleanup",
      client
        .from("shop_devices")
        .update({
          revoked_at: timestamp,
          status: "revoked",
          updated_at: timestamp,
        })
        .eq("shop_id", runtime.shopId)
        .eq("status", "active"),
    );
    await mustOk(
      "Staff cleanup",
      client
        .from("staff_accounts")
        .update({
          credential_hash: null,
          credential_kind: null,
          credential_status: "rotation_required",
          must_change_credential: true,
          status: "archived",
          updated_at: timestamp,
        })
        .eq("shop_id", runtime.shopId)
        .eq("status", "active"),
    );
    if (runtime.platformClient && runtime.shopCode) {
      await mustAction(
        "Audited shop cleanup",
        runtime.platformClient.rpc("platform_soft_delete_shop", {
          p_reason: "TASK030 final staging cleanup",
          p_shop_code_confirmation: runtime.shopCode,
          p_shop_id: runtime.shopId,
        }),
      );
    }
  }
  if (runtime.platformId) {
    await mustOk(
      "Platform grant cleanup",
      client
        .from("platform_admins")
        .update({
          reason_redacted: "task030_final_cleanup",
          revoked_at: timestamp,
          revoked_by_profile_id: runtime.platformId,
          status: "revoked",
        })
        .eq("profile_id", runtime.platformId)
        .eq("status", "active"),
    );
  }
  const profileIds = [runtime.ownerId, runtime.platformId].filter(Boolean);
  if (profileIds.length > 0) {
    await mustOk(
      "Profile cleanup",
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
}

async function cleanupProof(client, runtime) {
  if (!runtime.shopId) return { activeRows: 0, shopArchived: true };
  const [shops, sessions, devices, credentials, staff] = await Promise.all([
    client.from("shops").select("shop_status").eq("shop_id", runtime.shopId),
    client
      .from("pos_sessions")
      .select("pos_session_id")
      .eq("shop_id", runtime.shopId)
      .eq("status", "active"),
    client
      .from("shop_devices")
      .select("shop_device_id")
      .eq("shop_id", runtime.shopId)
      .eq("status", "active"),
    client
      .from("pos_device_credentials")
      .select("pos_device_credential_id")
      .eq("shop_id", runtime.shopId)
      .eq("status", "active"),
    client
      .from("staff_accounts")
      .select("staff_id")
      .eq("shop_id", runtime.shopId)
      .eq("status", "active"),
  ]);
  const firstError = [shops, sessions, devices, credentials, staff].find(
    (result) => result.error,
  )?.error;
  if (firstError)
    throw new E2EError("Cleanup proof query failed.", {
      code: firstError.code,
    });
  const activeRows =
    (sessions.data?.length ?? 0) +
    (devices.data?.length ?? 0) +
    (credentials.data?.length ?? 0) +
    (staff.data?.length ?? 0);
  const proof = {
    activeRows,
    shopArchived: shops.data?.[0]?.shop_status === "archived",
  };
  if (activeRows !== 0 || !proof.shopArchived) {
    throw new E2EError("Synthetic staging fixture cleanup failed.", proof);
  }
  return proof;
}

async function main() {
  const startedAt = Date.now();
  const baseUrl = requiredEnv("TASK030_POS_E2E_BASE_URL");
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const projectRef =
    envValue("TASK030_POS_E2E_STAGING_PROJECT_REF") ||
    envValue("STAGING_SUPABASE_PROJECT_REF") ||
    envValue("SUPABASE_PROJECT_REF") ||
    projectRefFromUrl(supabaseUrl);
  assertStagingTarget(baseUrl, supabaseUrl, projectRef);

  const client = adminClient(
    supabaseUrl,
    serviceRoleKey,
    "merchandise-control-admin-web/task-030-pos-order-staging-e2e",
  );
  const runId = `${Date.now().toString(36).toUpperCase()}${randomUUID()
    .replaceAll("-", "")
    .slice(0, 6)
    .toUpperCase()}`.slice(0, 18);
  const runtime = {
    orderId: null,
    ownerId: null,
    platformClient: null,
    platformId: null,
    serviceRoleKey,
    shopCode: null,
    shopId: null,
    staffCode: null,
    staffId: null,
    supabaseUrl,
  };
  let fixture;
  let httpProof;
  let proof;
  try {
    fixture = await setupFixture(client, runtime, runId);
    const auth = await firstLogin(baseUrl, runtime, fixture, runId);
    httpProof = await exerciseContract(baseUrl, runtime, fixture, auth, runId);
    proof = await databaseProof(client, runtime);
  } finally {
    await cleanup(client, runtime);
  }
  const cleanupResult = await cleanupProof(client, runtime);
  const output = {
    cleanup: cleanupResult,
    ok: true,
    productionWriteRequested: false,
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
    throw new E2EError("Refusing to print sensitive TASK-030 evidence.");
  }
  console.log(serialized);
}

main().catch((error) => {
  const payload = {
    details: error instanceof E2EError ? error.details : {},
    error: String(error?.message ?? error).replace(
      sensitivePattern,
      "[REDACTED]",
    ),
    ok: false,
  };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
});
