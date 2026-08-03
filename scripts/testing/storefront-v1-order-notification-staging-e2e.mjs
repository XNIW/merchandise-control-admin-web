import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

import {
  CustomerOrderNotificationDispatcher,
  createSupabaseCustomerNotificationQueuePort,
} from "../../src/server/notifications/customer-order-notification-dispatcher.mjs";

const MIGRATION_VERSION = "20260803104431";
const MARKER = "TASK031_ORDER_NOTIFICATION_E2E";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

class E2EError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = "E2EError";
    this.context = context;
  }
}

function envValue(name) {
  return process.env[name]?.trim() ?? "";
}

function requiredEnv(name) {
  const value = envValue(name);
  if (!value) throw new E2EError(`Missing ${name}.`);
  return value;
}

function projectRefFromUrl(value) {
  try {
    const host = new URL(value).hostname;
    return host.endsWith(".supabase.co") ? host.split(".")[0] : "";
  } catch {
    return "";
  }
}

function verifyTarget(supabaseUrl) {
  const target = new URL(supabaseUrl);
  const local = ["127.0.0.1", "localhost", "::1"].includes(target.hostname);
  if (local) {
    if (envValue("TASK031_NOTIFICATION_E2E_ALLOW_LOCAL") !== "yes") {
      throw new E2EError("TASK-031 local E2E is not explicitly enabled.");
    }
    return "local";
  }
  const projectRef = requiredEnv("STAGING_SUPABASE_PROJECT_REF");
  if (
    envValue("TASK031_NOTIFICATION_E2E_ALLOW_STAGING") !== "yes" ||
    target.protocol !== "https:" ||
    projectRefFromUrl(supabaseUrl) !== projectRef
  ) {
    throw new E2EError("TASK-031 target is not the approved staging project.");
  }
  return "staging";
}

function databaseEnvironment(databaseUrl, target, projectRef) {
  const url = new URL(databaseUrl);
  const local = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (target === "local") {
    assert(local, "TASK-031 local database target mismatch.");
  } else {
    const allowedPooler = url.hostname === "aws-1-sa-east-1.pooler.supabase.com";
    assert(
      !local &&
        allowedPooler &&
        url.username === `postgres.${projectRef}` &&
        url.searchParams.get("sslmode") === "require",
      "TASK-031 staging database target mismatch.",
    );
  }
  return {
    ...process.env,
    PGDATABASE: url.pathname.replace(/^\//u, ""),
    PGHOST: url.hostname,
    PGPASSWORD: decodeURIComponent(url.password),
    PGPORT: url.port || "5432",
    PGSSLMODE: target === "local" ? "disable" : "require",
    PGUSER: decodeURIComponent(url.username),
  };
}

function runFixtureSql(runtime, sql, label) {
  const result = spawnSync("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
    encoding: "utf8",
    env: runtime.databaseEnvironment,
    input: sql,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new E2EError(`${label} failed.`, {
      code: result.error?.code || "psql_failed",
    });
  }
}

function bootstrapPlatformActor(runtime, platformId, runId) {
  assert(UUID_PATTERN.test(platformId), "Invalid platform fixture UUID.");
  runFixtureSql(
    runtime,
    `
begin;
update public.profiles
set display_name = 'TASK031_PLATFORM_${runId}',
    profile_status = 'active',
    disabled_at = null,
    updated_at = statement_timestamp()
where profile_id = '${platformId}'::uuid;
insert into public.platform_admins(
  profile_id, status, reason_redacted, granted_by_profile_id
) values (
  '${platformId}'::uuid, 'active',
  'TASK031 isolated notification fixture', '${platformId}'::uuid
);
insert into public.audit_logs(
  actor_profile_id, scope, event_key, severity, result,
  target_type, target_id, metadata_redacted
) values (
  null, 'global', 'platform_admin.bootstrap.granted', 'critical', 'success',
  'platform_admin', '${platformId}',
  '{"source":"TASK031_ORDER_NOTIFICATION_E2E","mode":"staging_fixture"}'::jsonb
);
commit;
`,
    "Platform fixture bootstrap",
  );
}

function disableFixtureActors(runtime) {
  const profileIds = [runtime.ownerId, runtime.platformId].filter((value) =>
    UUID_PATTERN.test(value),
  );
  if (profileIds.length === 0) return;
  const list = profileIds.map((value) => `'${value}'::uuid`).join(",");
  const platformCleanup = UUID_PATTERN.test(runtime.platformId)
    ? `
update public.platform_admins
set status = 'revoked',
    revoked_at = statement_timestamp(),
    revoked_by_profile_id = '${runtime.platformId}'::uuid,
    reason_redacted = 'task031_final_cleanup'
where profile_id = '${runtime.platformId}'::uuid
  and status = 'active';`
    : "";
  runFixtureSql(
    runtime,
    `
begin;
${platformCleanup}
update public.profiles
set profile_status = 'disabled',
    disabled_at = statement_timestamp(),
    updated_at = statement_timestamp()
where profile_id in (${list});
commit;
`,
    "Fixture actor cleanup",
  );
}

function clientFor(supabaseUrl, key, clientInfo) {
  return createClient(supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": clientInfo } },
  });
}

async function mustOk(label, operation) {
  const { error } = await operation;
  if (error) throw new E2EError(`${label} failed.`, { code: error.code });
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

async function one(label, operation) {
  const { data, error } = await operation;
  if (error || !data) {
    throw new E2EError(`${label} failed.`, { code: error?.code });
  }
  return data;
}

async function authenticate(supabaseUrl, key, email, password) {
  const client = clientFor(supabaseUrl, key, `${MARKER}/owner`);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new E2EError("Fixture owner authentication failed.", {
      code: error?.code,
    });
  }
  return client;
}

function assert(condition, message) {
  if (!condition) throw new E2EError(message);
}

function routeTokenFromDeepLink(value) {
  const uri = new URL(value);
  const segments = uri.pathname.split("/").filter(Boolean);
  assert(
    uri.protocol === "com.xniw.clientmerchandisecontrol:" &&
      uri.hostname === "storefront" &&
      segments.length === 3 &&
      segments[1] === "notification",
    "Provider observed an invalid opaque deep link.",
  );
  return { shopSlug: segments[0], routeToken: segments[2] };
}

async function cleanup(runtime) {
  const errors = [];
  const safe = async (label, operation) => {
    try {
      const { error } = await operation;
      if (error) errors.push({ label, code: error.code });
    } catch {
      errors.push({ label, code: "exception" });
    }
  };
  if (runtime.shopId) {
    await safe(
      "orders",
      runtime.admin.from("customer_orders").delete().eq("shop_id", runtime.shopId),
    );
    if (runtime.ownerId) {
      await safe(
        "devices",
        runtime.admin.from("customer_devices").delete().eq("user_id", runtime.ownerId),
      );
    }
    await safe(
      "slots",
      runtime.admin
        .from("storefront_fulfillment_slots")
        .delete()
        .eq("shop_id", runtime.shopId),
    );
    await safe(
      "pickup",
      runtime.admin
        .from("storefront_pickup_points")
        .delete()
        .eq("shop_id", runtime.shopId),
    );
    await safe(
      "settings",
      runtime.admin.from("storefront_settings").delete().eq("shop_id", runtime.shopId),
    );
    if (runtime.platformClient && runtime.shopCode) {
      try {
        await mustAction(
          "Audited shop cleanup",
          runtime.platformClient.rpc("platform_soft_delete_shop", {
            p_reason: "TASK031 final staging cleanup",
            p_shop_code_confirmation: runtime.shopCode,
            p_shop_id: runtime.shopId,
          }),
        );
      } catch (error) {
        errors.push({
          label: "shop_archive",
          code: error instanceof E2EError ? error.context.code ?? "failed" : "exception",
        });
      }
    }
  }
  try {
    disableFixtureActors(runtime);
  } catch (error) {
    errors.push({
      label: "fixture_actors",
      code: error instanceof E2EError ? error.context.code ?? "failed" : "exception",
    });
  }
  let activeRows = null;
  let shopArchived = runtime.shopId ? null : true;
  if (runtime.shopId) {
    const [events, shop] = await Promise.all([
      runtime.admin
        .from("customer_notification_events")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", runtime.shopId),
      runtime.admin
        .from("shops")
        .select("shop_status")
        .eq("shop_id", runtime.shopId)
        .single(),
    ]);
    if (events.error) errors.push({ label: "cleanup_verify", code: events.error.code });
    else activeRows = events.count;
    if (shop.error) errors.push({ label: "shop_verify", code: shop.error.code });
    else shopArchived = shop.data.shop_status === "archived";
  }
  return { activeRows, errors, shopArchived };
}

async function run() {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const databaseUrl = requiredEnv("STOREFRONT_ORDER_NOTIFICATION_DB_URL");
  const target = verifyTarget(supabaseUrl);
  const projectRef = envValue("STAGING_SUPABASE_PROJECT_REF");
  const runId = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const runtime = {
    admin: clientFor(supabaseUrl, serviceRoleKey, `${MARKER}/admin`),
    databaseEnvironment: databaseEnvironment(databaseUrl, target, projectRef),
    ownerId: "",
    platformId: "",
    shopId: "",
  };
  let cleanupResult = { activeRows: null, errors: [], shopArchived: null };
  try {
    const email = `task031-${runId}@example.invalid`;
    const password = `T31!${randomBytes(18).toString("base64url")}`;
    const created = await runtime.admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
      user_metadata: { source: MARKER },
    });
    if (created.error || !created.data.user) {
      throw new E2EError("Fixture owner creation failed.", {
        code: created.error?.code,
      });
    }
    runtime.ownerId = created.data.user.id;

    const platformEmail = `task031-platform-${runId}@example.invalid`;
    const platformPassword = `T31P!${randomBytes(18).toString("base64url")}`;
    const platformCreated = await runtime.admin.auth.admin.createUser({
      email: platformEmail,
      email_confirm: true,
      password: platformPassword,
      user_metadata: { source: MARKER },
    });
    if (platformCreated.error || !platformCreated.data.user) {
      throw new E2EError("Fixture platform actor creation failed.", {
        code: platformCreated.error?.code,
      });
    }
    runtime.platformId = platformCreated.data.user.id;
    bootstrapPlatformActor(runtime, runtime.platformId, runId);
    runtime.platformClient = await authenticate(
      supabaseUrl,
      serviceRoleKey,
      platformEmail,
      platformPassword,
    );
    const owner = await authenticate(supabaseUrl, serviceRoleKey, email, password);
    runtime.shopCode = `T31${runId}`.slice(0, 32).toUpperCase();
    const shop = await mustAction(
      "Audited shop fixture",
      runtime.platformClient.rpc("platform_create_shop", {
        p_owner_profile_id: runtime.ownerId,
        p_reason: "TASK031 isolated notification fixture",
        p_shop_code: runtime.shopCode,
        p_shop_name: `TASK-031 notification ${runId}`,
      }),
    );
    runtime.shopId = shop.shop_id;
    const shopSlug = `task031-${runId}`.slice(0, 63).toLowerCase();
    await mustOk(
      "Storefront settings fixture",
      runtime.admin.from("storefront_settings").insert({
        customer_order_push_enabled: true,
        delivery_enabled: false,
        pickup_enabled: true,
        public_slug: shopSlug,
        require_product_image: false,
        reservation_enabled: false,
        shop_id: runtime.shopId,
        storefront_enabled: true,
      }),
    );
    const pickup = await one(
      "Pickup fixture",
      runtime.admin
        .from("storefront_pickup_points")
        .insert({
          address_line_1: "Fixture headless TASK-031",
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
    const slot = await one(
      "Slot fixture",
      runtime.admin
        .from("storefront_fulfillment_slots")
        .insert({
          capacity: 10,
          enabled: true,
          ends_at: new Date(slotStart.getTime() + 60 * 60 * 1000).toISOString(),
          fulfillment_mode: "pickup",
          pickup_point_id: pickup.id,
          public_label: `Retiro TASK-031 ${runId}`,
          shop_id: runtime.shopId,
          starts_at: slotStart.toISOString(),
        })
        .select("id")
        .single(),
    );
    const order = await one(
      "Order fixture",
      runtime.admin
        .from("customer_orders")
        .insert({
          currency_code: "CLP",
          delivery_fee_clp: 0,
          fulfillment_mode: "pickup",
          fulfillment_snapshot: { mode: "pickup", publicLabel: `Retiro ${runId}` },
          public_order_code: `MC-${randomBytes(10).toString("hex").toUpperCase()}`,
          quote_version: 1,
          shop_id: runtime.shopId,
          slot_id: slot.id,
          status: "confirmed",
          status_version: 1,
          subtotal_clp: 1200,
          total_clp: 1200,
          user_id: runtime.ownerId,
        })
        .select("id")
        .single(),
    );

    const installationId = randomUUID();
    const originalToken = `task031-${randomBytes(32).toString("base64url")}`;
    const registration = await one(
      "Device registration",
      owner.rpc("customer_register_device_v1", {
        p_consent_status: "granted",
        p_idempotency_key: randomUUID(),
        p_installation_id: installationId,
        p_locale: "es-CL",
        p_permission_status: "authorized",
        p_platform: "android",
        p_push_token: originalToken,
      }),
    );
    assert(registration.status === "ok", "Device registration did not succeed.");

    await mustOk(
      "Confirmed status event",
      runtime.admin.from("customer_order_status_events").insert({
        actor_kind: "system",
        event_version: 1,
        metadata_redacted: { source: MARKER },
        order_id: order.id,
        shop_id: runtime.shopId,
        status: "confirmed",
      }),
    );

    const providerMessages = [];
    const provider = {
      async send(message) {
        assert(message.token === originalToken, "Dispatcher selected an unexpected token.");
        providerMessages.push({
          payload: message.payload,
          platform: message.platform,
        });
        return {
          kind: "delivered",
          providerMessageId: `recording-${randomUUID()}`,
        };
      },
    };
    const dispatcher = new CustomerOrderNotificationDispatcher({
      provider,
      queue: createSupabaseCustomerNotificationQueuePort(runtime.admin),
      uuidFactory: randomUUID,
    });
    const firstSummary = await dispatcher.drain({ dispatcherId: randomUUID() });
    assert(
      firstSummary.claimed === 1 && firstSummary.delivered === 1,
      "Confirmed notification was not delivered to the recording provider.",
    );
    assert(providerMessages.length === 1, "Recording provider delivery count mismatch.");

    const firstRoute = routeTokenFromDeepLink(providerMessages[0].payload.deepLink);
    const resolved = await one(
      "Owner opaque route",
      owner.rpc("customer_notification_route_v1", {
        p_route_token: firstRoute.routeToken,
        p_shop_slug: firstRoute.shopSlug,
      }),
    );
    assert(
      resolved.status === "ok" && resolved.target === "order" && resolved.orderId === order.id,
      "Owner-scoped notification route did not resolve to the authoritative order.",
    );

    await mustOk(
      "Disable fixture push flag",
      runtime.admin
        .from("storefront_settings")
        .update({ customer_order_push_enabled: false })
        .eq("shop_id", runtime.shopId),
    );
    await mustOk(
      "Advance order to ready",
      runtime.admin
        .from("customer_orders")
        .update({ status: "ready", status_version: 3 })
        .eq("id", order.id),
    );
    await mustOk(
      "Out-of-order status events",
      runtime.admin.from("customer_order_status_events").insert([
        {
          actor_kind: "admin",
          event_version: 3,
          metadata_redacted: {},
          order_id: order.id,
          shop_id: runtime.shopId,
          status: "ready",
        },
        {
          actor_kind: "admin",
          event_version: 2,
          metadata_redacted: {},
          order_id: order.id,
          shop_id: runtime.shopId,
          status: "preparing",
        },
      ]),
    );
    const flagOffSummary = await dispatcher.drain({ dispatcherId: randomUUID() });
    assert(flagOffSummary.claimed === 0, "Push flag OFF did not fail closed.");
    await mustOk(
      "Enable fixture push flag",
      runtime.admin
        .from("storefront_settings")
        .update({ customer_order_push_enabled: true })
        .eq("shop_id", runtime.shopId),
    );
    const orderedSummary = await dispatcher.drain({ dispatcherId: randomUUID() });
    assert(
      orderedSummary.claimed === 1 &&
        providerMessages.at(-1)?.payload.event === "ready",
      "Superseded out-of-order status was dispatched.",
    );

    await mustOk(
      "Disable flag before token rotation race",
      runtime.admin
        .from("storefront_settings")
        .update({ customer_order_push_enabled: false })
        .eq("shop_id", runtime.shopId),
    );
    await mustOk(
      "Out-for-delivery event",
      runtime.admin.from("customer_order_status_events").insert({
        actor_kind: "admin",
        event_version: 4,
        metadata_redacted: {},
        order_id: order.id,
        shop_id: runtime.shopId,
        status: "out_for_delivery",
      }),
    );
    const rotatedToken = `task031-${randomBytes(32).toString("base64url")}`;
    const rotation = await one(
      "Device token rotation",
      owner.rpc("customer_register_device_v1", {
        p_consent_status: "granted",
        p_idempotency_key: randomUUID(),
        p_installation_id: installationId,
        p_locale: "es-CL",
        p_permission_status: "authorized",
        p_platform: "android",
        p_push_token: rotatedToken,
      }),
    );
    assert(rotation.registrationVersion === 2, "Token rotation did not advance generation.");
    await mustOk(
      "Re-enable fixture push after rotation",
      runtime.admin
        .from("storefront_settings")
        .update({ customer_order_push_enabled: true })
        .eq("shop_id", runtime.shopId),
    );
    const rotationSummary = await dispatcher.drain({ dispatcherId: randomUUID() });
    assert(rotationSummary.claimed === 0, "Stale token generation was dispatched.");

    const revoke = await one(
      "Device revoke",
      owner.rpc("customer_revoke_device_v1", {
        p_idempotency_key: randomUUID(),
        p_installation_id: installationId,
      }),
    );
    assert(revoke.status === "revoked", "Device revoke failed.");
    await mustOk(
      "Completed event after revoke",
      runtime.admin.from("customer_order_status_events").insert({
        actor_kind: "admin",
        event_version: 5,
        metadata_redacted: {},
        order_id: order.id,
        shop_id: runtime.shopId,
        status: "completed",
      }),
    );
    const revokedSummary = await dispatcher.drain({ dispatcherId: randomUUID() });
    assert(revokedSummary.claimed === 0, "Revoked device received a notification.");

    const ledgers = await one(
      "Notification ledger proof",
      runtime.admin
        .from("customer_notification_deliveries")
        .select(
          "status,destination_generation,provider_message_id_hash,last_error_code,customer_notification_events!inner(shop_id,event_key,event_version)",
        )
        .eq("customer_notification_events.shop_id", runtime.shopId),
    );
    const serializedLedger = JSON.stringify(ledgers);
    assert(!serializedLedger.includes(originalToken), "Durable ledger leaked the original token.");
    assert(!serializedLedger.includes(rotatedToken), "Durable ledger leaked the rotated token.");
    assert(
      ledgers.some(
        (row) => row.status === "suppressed" && row.last_error_code === "superseded_event",
      ),
      "Superseded delivery evidence is missing.",
    );
    assert(
      ledgers.some(
        (row) =>
          row.status === "suppressed" && row.last_error_code === "destination_ineligible",
      ),
      "Generation-fence suppression evidence is missing.",
    );
    assert(
      ledgers.some(
        (row) => row.status === "delivered" && row.provider_message_id_hash !== null,
      ),
      "Hashed provider receipt evidence is missing.",
    );

    cleanupResult = await cleanup(runtime);
    assert(cleanupResult.errors.length === 0, "Fixture cleanup reported errors.");
    assert(cleanupResult.activeRows === 0, "Fixture cleanup left notification rows.");
    assert(cleanupResult.shopArchived === true, "Fixture shop was not archived.");
    return {
      cleanup: cleanupResult,
      exactHead: envValue("GITHUB_SHA") || "local-working-tree",
      migrationVersion: MIGRATION_VERSION,
      ok: true,
      productionWriteRequested: false,
      proof: {
        ackReplayContract: "covered_by_local_concurrency_gate",
        deliveredToRecordingProvider: firstSummary.delivered,
        flagOffClaimed: flagOffSummary.claimed,
        localizedPayload: providerMessages[0].payload.body === "Tu pedido fue confirmado.",
        opaqueOwnerRoute: resolved.status,
        outOfOrderEvent: providerMessages[1].payload.event,
        providerCredentialUsed: false,
        providerMessages: providerMessages.length,
        revokedClaimed: revokedSummary.claimed,
        rotationClaimed: rotationSummary.claimed,
      },
      target,
    };
  } finally {
    if (cleanupResult.activeRows !== 0 || cleanupResult.errors.length > 0) {
      cleanupResult = await cleanup(runtime);
    }
  }
}

try {
  console.log(JSON.stringify(await run()));
} catch (error) {
  const report = {
    error: error instanceof Error ? error.message : "Unknown TASK-031 E2E error.",
    ok: false,
    productionWriteRequested: false,
    ...(error instanceof E2EError && Object.keys(error.context).length > 0
      ? { context: error.context }
      : {}),
  };
  console.error(JSON.stringify(report));
  process.exitCode = 1;
}
