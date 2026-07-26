#!/usr/bin/env node

import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import {
  assertTargetEnv,
  readLinkedProjectRef,
} from "./target-guardrails.mjs";

const { loadEnvConfig } = nextEnv;
const lifecycle = {};
const cleanupErrors = [];

loadEnvConfig(process.cwd(), true);

function required(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment: ${name}`);
  }

  return value;
}

function splitList(value) {
  return String(value ?? "")
    .split(/[\s,]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function assertFixtureTarget(input) {
  const appTarget = new URL(input.appOrigin);
  const supabaseTarget = new URL(input.supabaseUrl);
  const linkedProjectRef = readLinkedProjectRef();
  const allowedHosts = splitList(
    process.env.TASK085_STAGING_HOST_ALLOWLIST,
  );

  assertTargetEnv("staging", process.env, { requireConfirmation: true });

  if (
    input.projectRef !== linkedProjectRef ||
    supabaseTarget.protocol !== "https:" ||
    supabaseTarget.hostname !== `${input.projectRef}.supabase.co` ||
    appTarget.protocol !== "https:" ||
    appTarget.username ||
    appTarget.password ||
    !allowedHosts.includes(appTarget.hostname.toLowerCase()) ||
    !/(?:^|[.-])(?:staging|dev|preview)(?:[.-]|$)|workers\.dev$/i.test(
      appTarget.hostname,
    ) ||
    /(?:^|[.-])prod(?:[.-]|$)|production/i.test(appTarget.hostname)
  ) {
    throw new Error("BLOCKED_TASK085_STAGING_FIXTURE_TARGET_MISMATCH");
  }

  return {
    appOrigin: appTarget.origin,
    supabaseUrl: supabaseTarget.origin,
  };
}

function resultObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

async function mustOk(label, promise) {
  const result = await promise;

  if (result.error) {
    throw new Error(`${label} failed`);
  }

  return result.data;
}

async function mustAction(label, promise) {
  const data = await mustOk(label, promise);
  const action = resultObject(data);

  if (action?.ok !== true) {
    throw new Error(`${label} returned ${String(action?.code ?? "invalid")}`);
  }

  return action;
}

async function authenticatedClient(input, email, password) {
  const client = createClient(input.supabaseUrl, input.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    throw new Error("Synthetic platform actor authentication failed");
  }

  return client;
}

async function setup(admin, input) {
  const runId = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  const ownerEmail = `task085-owner-${runId.toLowerCase()}@example.invalid`;
  const platformEmail =
    `task085-platform-${runId.toLowerCase()}@example.invalid`;
  const ownerPassword = `Task085-${randomBytes(24).toString("base64url")}`;
  const platformPassword =
    `Task085-Platform-${randomBytes(24).toString("base64url")}`;
  const shopCode = `TASK085_TEST_${runId}`;
  const reason = "TASK-085 authenticated products staging fixture";

  Object.assign(lifecycle, {
    ownerEmail,
    ownerPassword,
    reason,
    runId,
    shopCode,
  });

  const ownerResult = await admin.auth.admin.createUser({
    email: ownerEmail,
    email_confirm: true,
    password: ownerPassword,
    user_metadata: { source: "TASK-085", test_run_id: runId },
  });
  if (ownerResult.error || !ownerResult.data.user) {
    throw new Error("Synthetic owner Auth creation failed");
  }
  lifecycle.ownerUserId = ownerResult.data.user.id;

  const platformResult = await admin.auth.admin.createUser({
    email: platformEmail,
    email_confirm: true,
    password: platformPassword,
    user_metadata: { source: "TASK-085", test_run_id: runId },
  });
  if (platformResult.error || !platformResult.data.user) {
    throw new Error("Synthetic platform Auth creation failed");
  }
  lifecycle.platformActorId = platformResult.data.user.id;

  await mustOk(
    "Synthetic profiles",
    admin.from("profiles").upsert(
      [
        {
          display_name: `TASK085 OWNER ${runId}`,
          profile_id: lifecycle.ownerUserId,
          profile_status: "active",
        },
        {
          display_name: `TASK085 PLATFORM ${runId}`,
          profile_id: lifecycle.platformActorId,
          profile_status: "active",
        },
      ],
      { onConflict: "profile_id" },
    ),
  );
  await mustOk(
    "Synthetic platform actor",
    admin.from("platform_admins").insert({
      granted_by_profile_id: lifecycle.platformActorId,
      profile_id: lifecycle.platformActorId,
      reason_redacted: reason,
      status: "active",
    }),
  );

  lifecycle.platformClient = await authenticatedClient(
    input,
    platformEmail,
    platformPassword,
  );
  const shop = await mustAction(
    "Audited shop create",
    lifecycle.platformClient.rpc("platform_create_shop", {
      p_owner_profile_id: lifecycle.ownerUserId,
      p_reason: reason,
      p_shop_code: shopCode,
      p_shop_name: `TASK085 TEST SHOP ${runId}`,
    }),
  );
  lifecycle.shopId = shop.shop_id;

  const ownerMember = await mustOk(
    "Owner membership lookup",
    admin
      .from("shop_members")
      .select("shop_member_id")
      .eq("shop_id", lifecycle.shopId)
      .eq("profile_id", lifecycle.ownerUserId)
      .maybeSingle(),
  );
  if (!ownerMember?.shop_member_id) {
    throw new Error("Synthetic owner membership missing");
  }
  lifecycle.memberId = ownerMember.shop_member_id;

  const mapping = await mustAction(
    "Audited inventory mapping",
    lifecycle.platformClient.rpc("platform_map_shop_inventory_source", {
      p_owner_user_id: lifecycle.ownerUserId,
      p_reason: reason,
      p_shop_id: lifecycle.shopId,
    }),
  );
  lifecycle.mappingId = mapping.shop_inventory_source_id;

  console.log("[task085-fixture] PASS synthetic setup");
}

async function cleanupStep(label, action) {
  try {
    await action();
    console.log(`[task085-fixture] PASS cleanup ${label}`);
  } catch {
    cleanupErrors.push(label);
    console.error(`[task085-fixture] FAIL cleanup ${label}`);
  }
}

async function cleanup(admin) {
  const timestamp = new Date().toISOString();

  if (lifecycle.mappingId && lifecycle.shopId) {
    await cleanupStep("mapping exact disable", async () => {
      await mustOk(
        "Mapping exact disable",
        admin
          .from("shop_inventory_sources")
          .update({ disabled_at: timestamp })
          .eq("shop_inventory_source_id", lifecycle.mappingId)
          .eq("shop_id", lifecycle.shopId)
          .is("disabled_at", null),
      );
    });
  }

  if (lifecycle.memberId && lifecycle.shopId) {
    await cleanupStep("membership exact suspend", async () => {
      await mustOk(
        "Membership exact suspend",
        admin
          .from("shop_members")
          .update({
            membership_status: "suspended",
            suspended_at: timestamp,
            updated_at: timestamp,
          })
          .eq("shop_member_id", lifecycle.memberId)
          .eq("shop_id", lifecycle.shopId)
          .eq("membership_status", "active"),
      );
    });
  }

  if (lifecycle.platformClient && lifecycle.shopId) {
    await cleanupStep("shop audited archive", async () => {
      await mustAction(
        "Shop audited archive",
        lifecycle.platformClient.rpc("platform_soft_delete_shop", {
          p_reason: lifecycle.reason,
          p_shop_code_confirmation: lifecycle.shopCode,
          p_shop_id: lifecycle.shopId,
        }),
      );
    });
  }

  if (lifecycle.platformActorId) {
    await cleanupStep("platform actor exact revoke", async () => {
      await mustOk(
        "Platform actor exact revoke",
        admin
          .from("platform_admins")
          .update({
            reason_redacted: lifecycle.reason,
            revoked_at: timestamp,
            revoked_by_profile_id: lifecycle.platformActorId,
            status: "revoked",
          })
          .eq("profile_id", lifecycle.platformActorId)
          .eq("status", "active"),
      );
    });
  }

  const profileIds = [
    lifecycle.ownerUserId,
    lifecycle.platformActorId,
  ].filter(Boolean);
  if (profileIds.length > 0) {
    await cleanupStep("profiles exact disable", async () => {
      await mustOk(
        "Profiles exact disable",
        admin
          .from("profiles")
          .update({
            disabled_at: timestamp,
            profile_status: "disabled",
            updated_at: timestamp,
          })
          .in("profile_id", profileIds),
      );
    });
  }

  for (const userId of profileIds) {
    await cleanupStep("Auth exact soft-delete", async () => {
      const result = await admin.auth.admin.deleteUser(userId, true);

      if (result.error) {
        throw new Error("Auth soft-delete failed");
      }
    });
  }
}

async function verifyCleanup(admin) {
  const noMatch = "00000000-0000-0000-0000-000000000000";
  const profileIds = [
    lifecycle.ownerUserId,
    lifecycle.platformActorId,
  ].filter(Boolean);
  const checks = await Promise.all([
    admin
      .from("shops")
      .select("shop_id")
      .eq("shop_id", lifecycle.shopId ?? noMatch)
      .neq("shop_status", "archived"),
    admin
      .from("shop_inventory_sources")
      .select("shop_inventory_source_id")
      .eq("shop_inventory_source_id", lifecycle.mappingId ?? noMatch)
      .is("disabled_at", null),
    admin
      .from("shop_members")
      .select("shop_member_id")
      .eq("shop_member_id", lifecycle.memberId ?? noMatch)
      .eq("membership_status", "active"),
    admin
      .from("profiles")
      .select("profile_id")
      .in("profile_id", profileIds)
      .eq("profile_status", "active"),
    admin
      .from("platform_admins")
      .select("platform_admin_id")
      .eq("profile_id", lifecycle.platformActorId ?? noMatch)
      .eq("status", "active")
      .is("revoked_at", null),
  ]);
  const labels = [
    "shops",
    "mappings",
    "members",
    "profiles",
    "platform_admins",
  ];
  const counts = {};

  checks.forEach((result, index) => {
    if (result.error) {
      throw new Error(`Cleanup verification failed: ${labels[index]}`);
    }
    counts[labels[index]] = result.data?.length ?? 0;
  });

  if (
    cleanupErrors.length > 0 ||
    Object.values(counts).some((count) => count !== 0)
  ) {
    throw new Error(
      `Cleanup left active residue: ${JSON.stringify(counts)} failures=${cleanupErrors.join(",")}`,
    );
  }

  console.log(
    `[task085-fixture] PASS_ZERO_RESIDUE ${Object.entries(counts)
      .map(([label, count]) => `${label}=${count}`)
      .join(" ")}`,
  );
}

async function main() {
  const input = assertFixtureTarget({
    appOrigin:
      process.env.PLAYWRIGHT_BASE_URL?.trim() ||
      process.env.TASK085_BASE_URL?.trim() ||
      "",
    projectRef: required("SUPABASE_PROJECT_REF"),
    supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
  });
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(input.supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  let smokeStatus = 1;

  try {
    await setup(admin, { ...input, serviceRoleKey });
    const smoke = spawnSync("npm", ["run", "smoke:task085:staging"], {
      env: {
        ...process.env,
        PLAYWRIGHT_BASE_URL: input.appOrigin,
        TASK085_OWNER_EMAIL: lifecycle.ownerEmail,
        TASK085_OWNER_PASSWORD: lifecycle.ownerPassword,
        TASK085_REQUIRE_AUTHENTICATED_PRODUCTS: "yes",
      },
      stdio: "inherit",
    });
    smokeStatus = smoke.status ?? 1;
  } finally {
    await cleanup(admin);
    await verifyCleanup(admin);
  }

  if (smokeStatus !== 0) {
    throw new Error("TASK-085 authenticated smoke failed");
  }
}

main().catch((error) => {
  console.error(
    `[task085-fixture] FAIL ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
