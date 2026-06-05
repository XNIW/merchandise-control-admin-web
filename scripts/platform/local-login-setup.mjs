#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  assertLocalTargetEnv,
  parseSupabaseStatusEnv,
} from "../testing/target-guardrails.mjs";

const defaultEmail = "platform.local@example.test";
const displayName = "TASK046 Platform Local Login";
const localPrefix = "TASK046_";
const seedEventKey = "task046.platform_local_login.seed";
const cleanupEventKey = "task046.platform_local_login.cleanup";
const allowedCommands = new Set(["seed", "cleanup", "status"]);
const command = process.argv[2] ?? "status";

function fail(code, message, status = 2) {
  console.error(`[platform-local] FAIL ${code}: ${message}`);
  process.exit(status);
}

function pass(message) {
  console.log(`[platform-local] PASS ${message}`);
}

function info(message) {
  console.log(`[platform-local] ${message}`);
}

function loadLocalSupabaseEnv() {
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

  const values = parseSupabaseStatusEnv(output);
  const env = {
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      values.PUBLISHABLE_KEY || values.ANON_KEY || "",
    NEXT_PUBLIC_SUPABASE_URL: values.API_URL || "",
    SUPABASE_PROJECT_REF: values.PROJECT_REF || "local",
    SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY || "",
    TEST_TARGET: "local",
  };

  try {
    assertLocalTargetEnv(env);
  } catch (error) {
    fail(error.code ?? "BLOCKED_LOCAL_SUPABASE_URL_REQUIRED", error.message);
  }

  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    fail(
      "BLOCKED_LOCAL_SUPABASE_KEYS_REQUIRED",
      "Local Supabase publishable and server-only setup keys are required.",
    );
  }

  return env;
}

function localEmail() {
  const email = (process.env.DEV_PLATFORM_ADMIN_EMAIL || defaultEmail)
    .trim()
    .toLowerCase();

  if (!email.endsWith(".test")) {
    fail(
      "BLOCKED_LOCAL_EMAIL_REQUIRED",
      "Use a synthetic .test email for the local Platform Admin account.",
    );
  }

  return email;
}

function passwordFromEnv() {
  const password = process.env.DEV_PLATFORM_ADMIN_PASSWORD?.trim() ?? "";

  if (password.length < 12) {
    fail(
      "BLOCKED_PASSWORD_REQUIRED",
      "Set DEV_PLATFORM_ADMIN_PASSWORD to a local password with at least 12 characters.",
    );
  }

  return password;
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
        "X-Client-Info": "merchandise-control-admin-web/task046-local-login-setup",
      },
    },
  });
}

function hashId(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
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

async function expectOk(label, resultPromise) {
  const result = await resultPromise;

  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }

  return result;
}

async function seed() {
  const env = loadLocalSupabaseEnv();
  const supabase = createAdminClient(env);
  const email = localEmail();
  const password = passwordFromEnv();
  const existingUser = await findUserByEmail(supabase, email);
  let userId = existingUser?.id ?? "";
  let userMode = "existing";

  if (existingUser) {
    const { data, error } = await supabase.auth.admin.updateUserById(userId, {
      password,
      user_metadata: {
        source: "TASK046_platform_local_login",
      },
    });

    if (error || !data.user) {
      throw new Error(
        `BLOCKED_AUTH_UPDATE_FAILED: ${error?.message ?? "missing updated user"}`,
      );
    }
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
      user_metadata: {
        source: "TASK046_platform_local_login",
      },
    });

    if (error || !data.user?.id) {
      throw new Error(
        `BLOCKED_AUTH_CREATE_FAILED: ${error?.message ?? "missing created user"}`,
      );
    }

    userId = data.user.id;
    userMode = "created";
  }

  const now = new Date().toISOString();

  await expectOk(
    "BLOCKED_PROFILE_UPSERT_FAILED",
    supabase.from("profiles").upsert(
      {
        disabled_at: null,
        disabled_by_profile_id: null,
        display_name: displayName,
        profile_id: userId,
        profile_status: "active",
        updated_at: now,
      },
      { onConflict: "profile_id" },
    ),
  );

  const { data: activeAdmins, error: activeAdminError } = await supabase
    .from("platform_admins")
    .select("platform_admin_id")
    .eq("profile_id", userId)
    .eq("status", "active")
    .is("revoked_at", null);

  if (activeAdminError) {
    throw new Error(`BLOCKED_PLATFORM_ADMIN_READ_FAILED: ${activeAdminError.message}`);
  }

  const adminMode = activeAdmins.length > 0 ? "already_active" : "created";

  if (activeAdmins.length === 0) {
    await expectOk(
      "BLOCKED_PLATFORM_ADMIN_CREATE_FAILED",
      supabase.from("platform_admins").insert({
        profile_id: userId,
        reason_redacted: "TASK046 local Platform Master Console login setup.",
        status: "active",
      }),
    );
  }

  await expectOk(
    "BLOCKED_AUDIT_CREATE_FAILED",
    supabase.from("audit_logs").insert({
      actor_profile_id: null,
      event_key: seedEventKey,
      metadata_redacted: {
        account: "platform.local@example.test",
        mode: "persistent_local_manual_login",
        prefix: localPrefix,
        source: "scripts/platform/local-login-setup.mjs",
      },
      result: "success",
      scope: "global",
      severity: "info",
      target_id: userId,
      target_type: "platform_admin",
    }),
  );

  pass("local Platform Admin login is ready");
  info(`email=${email}`);
  info("password_source=DEV_PLATFORM_ADMIN_PASSWORD");
  info(`auth_user=${userMode}`);
  info(`platform_admin=${adminMode}`);
  info(`profile_sha256_12=${hashId(userId)}`);
  info("login_url=http://127.0.0.1:3000/auth/login?next=/platform");
  info("platform_url=http://127.0.0.1:3000/platform");
}

async function cleanup() {
  const env = loadLocalSupabaseEnv();
  const supabase = createAdminClient(env);
  const email = localEmail();
  const existingUser = await findUserByEmail(supabase, email);

  if (!existingUser?.id) {
    pass("no local Platform Admin auth user exists");
    return;
  }

  const userId = existingUser.id;
  const now = new Date().toISOString();

  await expectOk(
    "BLOCKED_PLATFORM_ADMIN_REVOKE_FAILED",
    supabase
      .from("platform_admins")
      .update({
        reason_redacted: "TASK046 local Platform Master Console login cleanup.",
        revoked_at: now,
        revoked_by_profile_id: null,
        status: "revoked",
      })
      .eq("profile_id", userId)
      .eq("status", "active"),
  );

  await expectOk(
    "BLOCKED_CLEANUP_AUDIT_CREATE_FAILED",
    supabase.from("audit_logs").insert({
      actor_profile_id: null,
      event_key: cleanupEventKey,
      metadata_redacted: {
        account: "platform.local@example.test",
        mode: "local_manual_login_cleanup",
        prefix: localPrefix,
        source: "scripts/platform/local-login-setup.mjs",
      },
      result: "success",
      scope: "global",
      severity: "info",
      target_id: userId,
      target_type: "platform_admin",
    }),
  );

  const deleteResult = await supabase.auth.admin.deleteUser(userId);

  if (deleteResult.error) {
    await expectOk(
      "BLOCKED_PROFILE_DISABLE_FAILED",
      supabase
        .from("profiles")
        .update({
          disabled_at: now,
          disabled_by_profile_id: null,
          profile_status: "disabled",
          updated_at: now,
        })
        .eq("profile_id", userId),
    );
    info(`cleanup_note=auth_user_retained_disabled:${deleteResult.error.message}`);
  } else {
    info("cleanup_note=auth_user_deleted_profile_cascade_expected");
  }

  pass("local Platform Admin login cleanup completed; audit append-only rows are retained");
  info(`email=${email}`);
  info(`profile_sha256_12=${hashId(userId)}`);
}

async function status() {
  const env = loadLocalSupabaseEnv();
  const supabase = createAdminClient(env);
  const email = localEmail();
  const existingUser = await findUserByEmail(supabase, email);

  pass("local Supabase guardrail passed");
  info(`email=${email}`);

  if (!existingUser?.id) {
    info("auth_user=missing");
    return;
  }

  const userId = existingUser.id;
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("profile_status")
    .eq("profile_id", userId)
    .limit(1);

  if (profileError) {
    throw new Error(`BLOCKED_PROFILE_STATUS_FAILED: ${profileError.message}`);
  }

  const { data: activeAdmins, error: adminError } = await supabase
    .from("platform_admins")
    .select("platform_admin_id")
    .eq("profile_id", userId)
    .eq("status", "active")
    .is("revoked_at", null);

  if (adminError) {
    throw new Error(`BLOCKED_PLATFORM_ADMIN_STATUS_FAILED: ${adminError.message}`);
  }

  info("auth_user=present");
  info(`profile_status=${profiles[0]?.profile_status ?? "missing"}`);
  info(`active_platform_admin=${activeAdmins.length > 0 ? "yes" : "no"}`);
  info(`profile_sha256_12=${hashId(userId)}`);
}

if (!allowedCommands.has(command)) {
  fail("BLOCKED_COMMAND_REQUIRED", "Use seed, cleanup, or status.");
}

try {
  if (command === "seed") {
    await seed();
  } else if (command === "cleanup") {
    await cleanup();
  } else {
    await status();
  }
} catch (error) {
  fail("BLOCKED_PLATFORM_LOCAL_LOGIN_SETUP", error.message, 1);
}
