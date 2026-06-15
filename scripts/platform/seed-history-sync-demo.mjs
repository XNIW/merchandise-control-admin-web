#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  assertLocalTargetEnv,
  isLocalSupabaseUrl,
  parseSupabaseStatusEnv,
} from "../testing/target-guardrails.mjs";

const allowedCommands = new Set(["seed", "cleanup"]);
const command = process.argv[2] ?? "seed";
const defaultEmail = "platform.local@example.test";
const demoPrefix = "TASK_HISTORY_DEMO_";
const sourceName = "task_history_demo_seed";
const preferredShopName = "COMERCIALIZADORA TEST 1";
const fallbackShopCode = "TASKHIST1";
const fallbackShopMarker = "TASK_HISTORY_DEMO_CREATED_LOCAL_SHOP";
const demoMobileOwnerEmail = "history.demo.mobile-owner@example.test";
const demoDiagnosticOwnerEmail = "history.demo.diagnostic-owner@example.test";

const sessionRemoteIds = {
  valid: uuidFromHash(`${demoPrefix}remote-valid-qiaoxiang-inventory`),
  manual: uuidFromHash(`${demoPrefix}remote-manual-may-23-2026`),
  tombstone: uuidFromHash(`${demoPrefix}remote-tombstone-deleted-session`),
  invalid: uuidFromHash(`${demoPrefix}remote-invalid-overlay-shape`),
  legacy: uuidFromHash(`${demoPrefix}remote-legacy-v1-no-overlay`),
};
const sessionDisplayNames = {
  valid: "TASK_HISTORY_DEMO_VALID_Qiaoxiang_Inventory",
  manual: "TASK_HISTORY_DEMO_MANUAL_May_23_2026",
  tombstone: "TASK_HISTORY_DEMO_TOMBSTONE_DELETED_SESSION",
  invalid: "TASK_HISTORY_DEMO_INVALID_OVERLAY_SHAPE",
  legacy: "TASK_HISTORY_DEMO_LEGACY_V1_NO_OVERLAY",
};

function fail(code, message, status = 2) {
  console.error(`[history-demo] FAIL ${code}: ${message}`);
  process.exit(status);
}

function pass(message) {
  console.log(`[history-demo] PASS ${message}`);
}

function info(message) {
  console.log(`[history-demo] ${message}`);
}

function loadDotEnvLocal() {
  const values = {};
  const path = ".env.local";

  if (!existsSync(path)) {
    return values;
  }

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

function loadLocalSupabaseEnv() {
  const envLocal = loadDotEnvLocal();
  const envLocalUrl = envLocal.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (envLocalUrl && !isLocalSupabaseUrl(envLocalUrl)) {
    fail(
      "BLOCKED_REMOTE_TARGET",
      ".env.local NEXT_PUBLIC_SUPABASE_URL is not a local Supabase URL.",
    );
  }

  let output = "";

  try {
    output = execFileSync("supabase", ["status", "--output", "env"], {
      encoding: "utf8",
      env: {
        ...process.env,
        DO_NOT_TRACK: "1",
        SUPABASE_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const text = [error.stdout?.toString() ?? "", error.stderr?.toString() ?? ""]
      .join("")
      .trim();
    fail(
      "BLOCKED_LOCAL_SUPABASE_REQUIRED",
      `Start Supabase locally first. ${text || "supabase status failed."}`,
    );
  }

  const statusValues = parseSupabaseStatusEnv(output);
  const env = {
    ...envLocal,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      statusValues.PUBLISHABLE_KEY || statusValues.ANON_KEY || "",
    NEXT_PUBLIC_SUPABASE_URL: statusValues.API_URL || "",
    SUPABASE_PROJECT_REF: statusValues.PROJECT_REF || "local",
    SUPABASE_SERVICE_ROLE_KEY: statusValues.SERVICE_ROLE_KEY || "",
    TEST_TARGET: "local",
  };

  try {
    assertLocalTargetEnv(env);
  } catch (error) {
    fail(error.code ?? "BLOCKED_LOCAL_SUPABASE_URL_REQUIRED", error.message);
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    fail(
      "BLOCKED_LOCAL_SERVICE_ROLE_KEY_REQUIRED",
      "Local Supabase service-role key is required for server-only demo seeding.",
    );
  }

  return env;
}

function createAdminClient(env) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "merchandise-control-admin-web/task-history-demo-seed",
      },
    },
  });
}

async function expectOk(label, resultPromise) {
  const result = await resultPromise;

  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }

  return result;
}

async function expectSingle(label, resultPromise) {
  const result = await expectOk(label, resultPromise);

  if (!result.data) {
    throw new Error(`${label}: missing row`);
  }

  return result.data;
}

function localEmail() {
  return (process.env.DEV_PLATFORM_ADMIN_EMAIL || defaultEmail).trim().toLowerCase();
}

async function findUserByEmail(supabase, email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      throw new Error(`BLOCKED_AUTH_LIST_FAILED: ${error.message}`);
    }

    const match = data.users.find(
      (user) => user.email?.toLowerCase() === email,
    );

    if (match) {
      return match;
    }

    if (data.users.length < 1000) {
      return null;
    }
  }

  throw new Error("BLOCKED_AUTH_LIST_TOO_LARGE: local auth user list is unexpectedly large.");
}

function uuidFromHash(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function offsetIso(minutes) {
  return new Date(Date.UTC(2026, 4, 23, 14, 0 + minutes, 0)).toISOString();
}

function historyGrid(prefix, count) {
  const header = [
    "No",
    "itemNumber",
    "barcode",
    "productName",
    "quantity",
    "purchasePrice",
    "retailPrice",
    "discount",
    "discountedPrice",
  ];

  const rows = Array.from({ length: count }, (_, index) => {
    const item = index + 1;
    const purchasePrice = 1800 + item * 110;
    const retailPrice = 3900 + item * 150;
    const discount = item % 3 === 0 ? 10 : 0;
    const discountedPrice = Math.round(retailPrice * (1 - discount / 100));

    return [
      String(item),
      `${prefix}-${String(item).padStart(3, "0")}`,
      `78000010${String(item).padStart(4, "0")}`,
      `${prefix} product ${item}`,
      String(6 + item),
      String(purchasePrice),
      String(retailPrice),
      String(discount),
      String(discountedPrice),
    ];
  });

  return [header, ...rows];
}

function overlayForGrid(grid, overrides = {}) {
  return {
    overlay_schema: 1,
    editable:
      overrides.editable ??
      grid.map((row, index) =>
        row.map((cell, columnIndex) => {
          if (index === 0) {
            return "";
          }

          return columnIndex === 4 ? String(Number(cell) + (index % 2)) : "";
        }),
      ),
    complete:
      overrides.complete ??
      grid.map((_, index) => index === 0 || index % 3 !== 0),
  };
}

async function resolveLocalActor(supabase) {
  const email = localEmail();
  const user = await findUserByEmail(supabase, email);

  if (!user?.id) {
    throw new Error(
      "BLOCKED_PLATFORM_LOCAL_SEED_REQUIRED: run npm run platform:local:seed before seeding history demo data.",
    );
  }

  await expectOk(
    "PROFILE_UPSERT_FAILED",
    supabase.from("profiles").upsert(
      {
        display_name: "TASK History Demo Local Admin",
        profile_id: user.id,
        profile_status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    ),
  );

  return { email, userId: user.id };
}

async function ensureLocalAuthUser(supabase, email, displayName) {
  const normalizedEmail = email.trim().toLowerCase();
  let user = await findUserByEmail(supabase, normalizedEmail);

  if (!user?.id) {
    const temporaryPassword = `HistoryDemo-${randomUUID()}-aA1!`;
    const created = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: true,
      password: temporaryPassword,
      user_metadata: {
        created_by: sourceName,
        purpose: "local_history_sync_demo",
      },
    });

    if (created.error || !created.data.user?.id) {
      throw new Error(
        `BLOCKED_DEMO_AUTH_USER_CREATE_FAILED: ${created.error?.message ?? "missing user"}`,
      );
    }

    user = created.data.user;
  }

  await expectOk(
    "DEMO_PROFILE_UPSERT_FAILED",
    supabase.from("profiles").upsert(
      {
        display_name: displayName,
        profile_id: user.id,
        profile_status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    ),
  );

  return { email: normalizedEmail, userId: user.id };
}

async function resolveDemoOwners(supabase) {
  const mobileOwner = await ensureLocalAuthUser(
    supabase,
    demoMobileOwnerEmail,
    "TASK History Demo Mobile Owner",
  );
  const diagnosticOwner = await ensureLocalAuthUser(
    supabase,
    demoDiagnosticOwnerEmail,
    "TASK History Demo Diagnostic Owner",
  );

  return {
    diagnosticOwner,
    diagnosticOwnerId: diagnosticOwner.userId,
    mobileOwner,
    mobileOwnerId: mobileOwner.userId,
  };
}

async function resolveShop(supabase, actorProfileId) {
  const existingFallback = await expectOk(
    "DEMO_SHOP_LOOKUP_FAILED",
    supabase
      .from("shops")
      .select("shop_id,shop_code,shop_name,shop_status")
      .eq("shop_code", fallbackShopCode)
      .limit(1),
  );

  if (existingFallback.data?.[0]) {
    const row = await expectSingle(
      "DEMO_SHOP_REACTIVATE_FAILED",
      supabase
        .from("shops")
        .update({
          archived_at: null,
          archived_by_profile_id: null,
          shop_name: preferredShopName,
          shop_status: "active",
          status_changed_at: new Date().toISOString(),
          status_changed_by_profile_id: actorProfileId,
          status_reason_redacted: fallbackShopMarker,
          suspended_at: null,
          suspended_by_profile_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("shop_id", existingFallback.data[0].shop_id)
        .select("shop_id,shop_code,shop_name,shop_status")
        .single(),
    );

    return { created: false, shop: row };
  }

  const created = await expectSingle(
    "DEMO_SHOP_CREATE_FAILED",
    supabase
      .from("shops")
      .insert({
        created_by_profile_id: actorProfileId,
        shop_code: fallbackShopCode,
        shop_name: preferredShopName,
        shop_status: "active",
        status_changed_by_profile_id: actorProfileId,
        status_reason_redacted: fallbackShopMarker,
      })
      .select("shop_id,shop_code,shop_name,shop_status")
      .single(),
  );

  return { created: true, shop: created };
}

async function ensureShopMembership(supabase, shopId, actorProfileId) {
  await expectOk(
    "SHOP_MEMBERSHIP_UPSERT_FAILED",
    supabase.from("shop_members").upsert(
      {
        invited_by_profile_id: actorProfileId,
        membership_status: "active",
        profile_id: actorProfileId,
        role_key: "shop_owner",
        shop_id: shopId,
        suspended_at: null,
        suspended_by_profile_id: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,shop_id" },
    ),
  );
}

async function ensureInventorySource(supabase, shopId, actorProfileId, ownerUserId) {
  const existingForShop = await expectOk(
    "SHOP_INVENTORY_SOURCE_LOOKUP_FAILED",
    supabase
      .from("shop_inventory_sources")
      .select("shop_inventory_source_id,owner_user_id,shop_id,mapping_state")
      .eq("shop_id", shopId)
      .is("disabled_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
  );

  const sourcesForShop = existingForShop.data ?? [];
  const activeSource = sourcesForShop.find(
    (source) => source.mapping_state === "mapped" && source.owner_user_id,
  );

  if (activeSource?.owner_user_id) {
    return { created: false, ownerUserId: activeSource.owner_user_id };
  }

  const blockingSource = sourcesForShop.find(
    (source) => source.mapping_state !== "mapped" || !source.owner_user_id,
  );

  if (blockingSource) {
    throw new Error(
      `BLOCKED_DEMO_SHOP_SOURCE_NOT_MAPPED: shop ${shopId} already has an active non-mapped or ownerless inventory source.`,
    );
  }

  const ownerActiveSource = await expectOk(
    "DEMO_OWNER_INVENTORY_SOURCE_LOOKUP_FAILED",
    supabase
      .from("shop_inventory_sources")
      .select("shop_inventory_source_id,shop_id")
      .eq("owner_user_id", ownerUserId)
      .is("disabled_at", null)
      .limit(1),
  );
  const existingOwnerSource = ownerActiveSource.data?.[0] ?? null;

  if (existingOwnerSource?.shop_id && existingOwnerSource.shop_id !== shopId) {
    throw new Error(
      `BLOCKED_DEMO_OWNER_ALREADY_MAPPED: demo mobile owner is already mapped to shop ${existingOwnerSource.shop_id}.`,
    );
  }

  if (existingOwnerSource?.shop_id === shopId) {
    return { created: false, ownerUserId };
  }

  const inserted = await expectSingle(
    "SHOP_INVENTORY_SOURCE_CREATE_FAILED",
    supabase
      .from("shop_inventory_sources")
      .insert({
        created_by_profile_id: actorProfileId,
        mapping_state: "mapped",
        owner_user_id: ownerUserId,
        shop_id: shopId,
        source_kind: "mobile_owner",
        verified_at: new Date().toISOString(),
        verified_by_profile_id: actorProfileId,
      })
      .select("owner_user_id")
      .single(),
  );

  return { created: true, ownerUserId: inserted.owner_user_id };
}

function historySessions({ diagnosticOwnerUserId, ownerUserId, shopId }) {
  const validGrid = historyGrid("Qiaoxiang", 8);
  const manualGrid = historyGrid("ManualMay23", 5);
  const tombstoneGrid = historyGrid("Deleted", 2);
  const invalidGrid = historyGrid("InvalidOverlay", 3);
  const legacyGrid = historyGrid("LegacyV1", 2);
  const invalidOverlay = overlayForGrid(invalidGrid, {
    editable: invalidGrid.slice(0, 1).map((row) => row.map(() => "")),
    complete: invalidGrid.map((_, index) => index === 0),
  });

  return [
    {
      category: "Bolsos",
      data: validGrid,
      deleted_at: null,
      display_name: sessionDisplayNames.valid,
      is_manual_entry: false,
      owner_user_id: ownerUserId,
      payload_version: 2,
      remote_id: sessionRemoteIds.valid,
      session_overlay: overlayForGrid(validGrid),
      shop_id: shopId,
      supplier: "Qiaoxiang",
      timestamp: offsetIso(0),
      updated_at: offsetIso(40),
    },
    {
      category: "Manual adjustments",
      data: manualGrid,
      deleted_at: null,
      display_name: sessionDisplayNames.manual,
      is_manual_entry: true,
      owner_user_id: ownerUserId,
      payload_version: 2,
      remote_id: sessionRemoteIds.manual,
      session_overlay: overlayForGrid(manualGrid, {
        complete: manualGrid.map((_, index) => index <= 3),
      }),
      shop_id: shopId,
      supplier: "Manual",
      timestamp: offsetIso(10),
      updated_at: offsetIso(50),
    },
    {
      category: "Deleted",
      data: tombstoneGrid,
      deleted_at: offsetIso(70),
      display_name: sessionDisplayNames.tombstone,
      is_manual_entry: false,
      owner_user_id: ownerUserId,
      payload_version: 2,
      remote_id: sessionRemoteIds.tombstone,
      session_overlay: overlayForGrid(tombstoneGrid),
      shop_id: shopId,
      supplier: "Archive",
      timestamp: offsetIso(20),
      updated_at: offsetIso(75),
    },
    {
      category: "Diagnostics",
      data: invalidGrid,
      deleted_at: null,
      display_name: sessionDisplayNames.invalid,
      is_manual_entry: false,
      owner_user_id: diagnosticOwnerUserId,
      payload_version: 2,
      remote_id: sessionRemoteIds.invalid,
      session_overlay: invalidOverlay,
      shop_id: shopId,
      supplier: "Overlay QA",
      timestamp: offsetIso(30),
      updated_at: offsetIso(60),
    },
    {
      category: "Legacy",
      data: legacyGrid,
      deleted_at: null,
      display_name: sessionDisplayNames.legacy,
      is_manual_entry: false,
      owner_user_id: ownerUserId,
      payload_version: 1,
      remote_id: sessionRemoteIds.legacy,
      session_overlay: null,
      shop_id: shopId,
      supplier: "Legacy import",
      timestamp: offsetIso(35),
      updated_at: offsetIso(55),
    },
  ];
}

function historySyncEvents({ diagnosticOwnerUserId, ownerUserId, shopId }) {
  return [
    {
      batch_id: uuidFromHash(`${demoPrefix}batch-success`),
      changed_count: 9,
      client_event_id: `${demoPrefix}EVENT_SUCCESS_VALID`,
      created_at: offsetIso(80),
      domain: "history",
      entity_ids: {
        history_session_ids: [sessionRemoteIds.valid],
        session_ids: [sessionRemoteIds.valid],
      },
      event_type: "history_changed",
      metadata: {
        batchLabel: `${demoPrefix}BATCH_SUCCESS`,
        demoPrefix,
        overlayStatus: "ok",
        status: "success",
      },
      owner_user_id: ownerUserId,
      shop_id: shopId,
      source: sourceName,
      source_device_id: `${demoPrefix}DEVICE_IOS`,
      store_id: shopId,
    },
    {
      batch_id: uuidFromHash(`${demoPrefix}batch-failed`),
      changed_count: 0,
      client_event_id: `${demoPrefix}EVENT_FAILED_INVALID_OVERLAY`,
      created_at: offsetIso(85),
      domain: "history",
      entity_ids: {
        sessionIds: [sessionRemoteIds.invalid],
      },
      event_type: "history_changed",
      metadata: {
        batchLabel: `${demoPrefix}BATCH_FAILED`,
        diagnosticOwner: true,
        demoPrefix,
        error_code: "invalid_overlay_shape",
        failure: "Editable row count does not match data row count.",
        status: "failed",
      },
      owner_user_id: diagnosticOwnerUserId,
      shop_id: shopId,
      source: sourceName,
      source_device_id: `${demoPrefix}DEVICE_ANDROID`,
      store_id: shopId,
    },
    {
      batch_id: uuidFromHash(`${demoPrefix}batch-pending-diagnostic`),
      changed_count: 1,
      client_event_id: `${demoPrefix}EVENT_PENDING_TOMBSTONE_DIAGNOSTIC`,
      created_at: offsetIso(90),
      domain: "history",
      entity_ids: {
        sessionId: sessionRemoteIds.tombstone,
        session_id: sessionRemoteIds.tombstone,
      },
      event_type: "history_tombstone",
      metadata: {
        batchLabel: `${demoPrefix}BATCH_PENDING_DIAGNOSTIC`,
        demoPrefix,
        diagnostic: "Tombstone propagation pending local verification.",
        status: "pending",
      },
      owner_user_id: ownerUserId,
      shop_id: shopId,
      source: sourceName,
      source_device_id: `${demoPrefix}DEVICE_DIAGNOSTIC`,
      store_id: shopId,
    },
  ];
}

async function cleanupDemoRows(supabase) {
  const syncBySource = await expectOk(
    "SYNC_EVENTS_CLEANUP_BY_SOURCE_FAILED",
    supabase.from("sync_events").delete().eq("source", sourceName),
  );
  const syncByClient = await expectOk(
    "SYNC_EVENTS_CLEANUP_BY_CLIENT_FAILED",
    supabase.from("sync_events").delete().like("client_event_id", `${demoPrefix}%`),
  );
  const sessions = await expectOk(
    "SESSIONS_CLEANUP_UUID_FAILED",
    supabase
      .from("shared_sheet_sessions")
      .delete()
      .in("remote_id", Object.values(sessionRemoteIds)),
  );
  const legacySessions = await expectOk(
    "SESSIONS_CLEANUP_BY_DISPLAY_NAME_FAILED",
    supabase
      .from("shared_sheet_sessions")
      .delete()
      .like("display_name", `${demoPrefix}%`),
  );

  return {
    sessionsTouched: sessions.count ?? "unknown",
    legacySessionsTouched: legacySessions.count ?? "unknown",
    syncClientTouched: syncByClient.count ?? "unknown",
    syncSourceTouched: syncBySource.count ?? "unknown",
  };
}

async function seed() {
  const env = loadLocalSupabaseEnv();
  const supabase = createAdminClient(env);
  const actor = await resolveLocalActor(supabase);
  const { created: shopCreated, shop } = await resolveShop(supabase, actor.userId);
  const owners = await resolveDemoOwners(supabase);

  await ensureShopMembership(supabase, shop.shop_id, actor.userId);
  const source = await ensureInventorySource(
    supabase,
    shop.shop_id,
    actor.userId,
    owners.mobileOwnerId,
  );
  await cleanupDemoRows(supabase);

  await expectOk(
    "SESSIONS_UPSERT_FAILED",
    supabase.from("shared_sheet_sessions").upsert(
      historySessions({
        diagnosticOwnerUserId: owners.diagnosticOwnerId,
        ownerUserId: source.ownerUserId,
        shopId: shop.shop_id,
      }),
      { onConflict: "remote_id" },
    ),
  );
  await expectOk(
    "SYNC_EVENTS_INSERT_FAILED",
    supabase.from("sync_events").insert(
      historySyncEvents({
        diagnosticOwnerUserId: owners.diagnosticOwnerId,
        ownerUserId: source.ownerUserId,
        shopId: shop.shop_id,
      }),
    ),
  );

  pass("History Sync Console demo data seeded");
  info(`shop=${shop.shop_name} (${shop.shop_code})`);
  info(`shop_id=${shop.shop_id}`);
  info(`shop_created=${shopCreated ? "yes" : "no"}`);
  info(`member_profile=${actor.email}`);
  info(`demo_mobile_owner=${owners.mobileOwner.email}`);
  info(`demo_diagnostic_owner=${owners.diagnosticOwner.email}`);
  info(`inventory_owner=${source.ownerUserId}`);
  info(`inventory_source_created=${source.created ? "yes" : "no"}`);
  info(`sessions=${Object.values(sessionRemoteIds).join(",")}`);
  info(`login_url=http://127.0.0.1:3000/auth/login?next=/shop/history`);
  info(`history_url=http://127.0.0.1:3000/shop/history?shop_id=${shop.shop_id}`);
}

async function cleanup() {
  const env = loadLocalSupabaseEnv();
  const supabase = createAdminClient(env);
  const summary = await cleanupDemoRows(supabase);

  pass("History Sync Console demo rows cleaned up");
  info(`sessions_touched=${summary.sessionsTouched}`);
  info(`sync_events_by_source_touched=${summary.syncSourceTouched}`);
  info(`sync_events_by_client_touched=${summary.syncClientTouched}`);
  info("local_demo_shop_membership_mapping_and_owner_users_retained=yes");
}

if (!allowedCommands.has(command)) {
  fail("BLOCKED_COMMAND_REQUIRED", "Use seed or cleanup.");
}

try {
  if (command === "cleanup") {
    await cleanup();
  } else {
    await seed();
  }
} catch (error) {
  fail("BLOCKED_HISTORY_DEMO_SEED", error.message, 1);
}
