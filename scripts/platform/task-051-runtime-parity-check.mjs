#!/usr/bin/env node
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import {
  assertTargetEnv,
  parseSupabaseStatusEnv,
  readLinkedProjectRef,
} from "../testing/target-guardrails.mjs";

const { loadEnvConfig } = nextEnv;

const DEFAULT_SHOP_CODE = "123456789";
const DEFAULT_STAFF_CODE = "1001";

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));

  return match ? match.slice(prefix.length).trim() : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function isLocalSupabaseUrl(value) {
  try {
    const url = new URL(value);

    return ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function redactSupabaseTarget(value) {
  if (!value) {
    return "missing";
  }

  try {
    const url = new URL(value);
    const cloudRef = url.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i)?.[1];

    if (cloudRef) {
      return `cloud:${cloudRef.slice(0, 4)}...${cloudRef.slice(-4)}`;
    }

    if (isLocalSupabaseUrl(value)) {
      return `${url.protocol}//${url.hostname}:${url.port || "54321"}`;
    }

    return `${url.protocol}//${url.hostname}`;
  } catch {
    return "invalid";
  }
}

function previewShopCode(value) {
  const normalized = value.trim().toUpperCase();

  if (!normalized) {
    return null;
  }

  if (normalized.length <= 4) {
    return `${"*".repeat(Math.max(0, normalized.length - 1))}${normalized.slice(-1)}`;
  }

  return `${normalized.slice(0, 2)}...${normalized.slice(-2)}`;
}

async function safeMaybeSingle(label, operation) {
  const { data, error } = await operation;

  return {
    data,
    error_code: error?.code ?? null,
    label,
    ok: !error,
  };
}

function requireReadableRuntime() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  let env = { ...process.env };
  const target = argValue("target", hasFlag("local") ? "local" : env.TEST_TARGET);

  if (target === "local") {
    const output = execFileSync("supabase", ["status", "--output", "env"], {
      encoding: "utf8",
      env: {
        ...process.env,
        DO_NOT_TRACK: "1",
        SUPABASE_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const values = parseSupabaseStatusEnv(output);

    env = {
      ...env,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        values.PUBLISHABLE_KEY || values.ANON_KEY,
      NEXT_PUBLIC_SUPABASE_URL: values.API_URL,
      SUPABASE_PROJECT_REF:
        values.PROJECT_REF || readLinkedProjectRef() || "local",
      SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY,
      TEST_TARGET: "local",
    };

    assertTargetEnv("local", env);
  }

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey =
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  return {
    publishableKey,
    serviceRoleKey,
    supabaseUrl,
  };
}

async function main() {
  const shopCode = argValue("shop-code", DEFAULT_SHOP_CODE).toUpperCase();
  const staffCode = argValue("staff-code", DEFAULT_STAFF_CODE).toUpperCase();
  const writeChecksRequested = process.argv.includes("--write-checks");
  const runtime = requireReadableRuntime();
  const localTarget = isLocalSupabaseUrl(runtime.supabaseUrl);

  if (writeChecksRequested && !localTarget) {
    throw new Error("Refusing write checks against non-local Supabase");
  }

  const report = {
    checks: {
      full_access_permission_present: false,
      shop_code_present: false,
      staff_1001_present: false,
    },
    env: {
      next_public_supabase_publishable_key_present: Boolean(runtime.publishableKey),
      next_public_supabase_url_present: Boolean(runtime.supabaseUrl),
      service_role_key_present: Boolean(runtime.serviceRoleKey),
    },
    input: {
      selected_shop_code_preview: previewShopCode(shopCode),
      shop_code_present: Boolean(shopCode),
      staff_code_present: Boolean(staffCode),
    },
    notes: [],
    target: redactSupabaseTarget(runtime.supabaseUrl),
    title: "TASK-051 runtime parity",
    write_checks_allowed: writeChecksRequested && localTarget,
  };

  const key = runtime.serviceRoleKey || runtime.publishableKey;

  if (!runtime.supabaseUrl || !key) {
    report.notes.push("Runtime env missing Supabase URL or API key.");
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const supabase = createClient(runtime.supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const shopResult = await safeMaybeSingle(
    "shop_by_shop_code",
    supabase
      .from("shops")
      .select("shop_id,shop_code,shop_status")
      .eq("shop_code", shopCode)
      .maybeSingle(),
  );
  const shop = shopResult.data;

  report.checks.shop_lookup_ok = shopResult.ok;
  report.checks.shop_lookup_error_code = shopResult.error_code;
  report.checks.shop_code_present = Boolean(shop);
  report.checks.shop_status = shop?.shop_status ?? null;

  if (shop?.shop_id) {
    const staffResult = await safeMaybeSingle(
      "staff_1001_by_shop",
      supabase
        .from("staff_accounts")
        .select("staff_id,status,credential_status,role_key")
        .eq("shop_id", shop.shop_id)
        .eq("staff_code", staffCode)
        .maybeSingle(),
    );
    const staff = staffResult.data;

    report.checks.staff_lookup_ok = staffResult.ok;
    report.checks.staff_lookup_error_code = staffResult.error_code;
    report.checks.staff_1001_present = Boolean(staff);
    report.checks.staff_status = staff?.status ?? null;
    report.checks.staff_credential_status = staff?.credential_status ?? null;
    report.checks.staff_role_key = staff?.role_key ?? null;

    const permissionResult = await safeMaybeSingle(
      "manager_full_access_permission",
      supabase
        .from("staff_role_permissions")
        .select("enabled")
        .eq("shop_id", shop.shop_id)
        .eq("role_key", "manager")
        .eq("permission_key", "shop_admin.full_access")
        .maybeSingle(),
    );

    report.checks.permission_lookup_ok = permissionResult.ok;
    report.checks.permission_lookup_error_code = permissionResult.error_code;
    report.checks.full_access_permission_present =
      permissionResult.data?.enabled === true;
  } else {
    report.notes.push("Shop code is absent on this runtime target.");
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : "Unknown TASK-051 parity error.",
        title: "TASK-051 runtime parity",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
