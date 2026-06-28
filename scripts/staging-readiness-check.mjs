#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WORKERS_DEV_URL =
  "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev";
const POS_ENDPOINTS = [
  "/api/pos/auth/first-login",
  "/api/pos/session/heartbeat",
  "/api/pos/catalog/pull",
  "/api/pos/sales/sync",
];
const SENSITIVE_PATTERN =
  /\b(stack|trace|SUPABASE_SERVICE_ROLE_KEY|service_role|mcpos_(?:device|session)_[A-Za-z0-9_-]+|trustedDeviceToken|sessionToken|deviceToken|pin|password)\b/i;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const args = new Set(process.argv.slice(2));
const publicOnly = args.has("--public-only");
const customDomainOnly = args.has("--custom-domain-only");
const results = [];

function loadDotEnvLocal() {
  const envPath = ".env.local";

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if (!/^[A-Z0-9_]+$/.test(key) || process.env[key]) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function addResult(name, status, critical, note = "") {
  results.push({ critical, name, note, status });
  console.log(
    `[staging-check] ${status} ${name}${note ? ` - ${note}` : ""}`,
  );
}

function normalizeOrigin(value) {
  if (!value) {
    return null;
  }

  const raw = value.trim();
  const withProtocol = raw.startsWith("http://") || raw.startsWith("https://")
    ? raw
    : `https://${raw}`;
  const parsed = new URL(withProtocol);

  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("Staging checks require HTTPS URL without credentials.");
  }

  if (LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error("Staging checks cannot target localhost or loopback.");
  }

  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";

  return parsed.origin;
}

function assertNoSensitiveBody(body, label) {
  if (SENSITIVE_PATTERN.test(body)) {
    throw new Error(`${label} response contains sensitive/debug text.`);
  }
}

async function checkRoot(origin, label) {
  const response = await fetch(`${origin}/`, { method: "HEAD", redirect: "manual" });

  if (response.status < 200 || response.status >= 400) {
    throw new Error(`${label} root returned HTTP ${response.status}.`);
  }

  const cacheControl = response.headers.get("cache-control") ?? "";
  const csp = response.headers.get("content-security-policy") ?? "";
  const xFrame = response.headers.get("x-frame-options") ?? "";
  const xContentType = response.headers.get("x-content-type-options") ?? "";

  if (!/no-store/i.test(cacheControl)) {
    throw new Error(`${label} root is missing no-store cache control.`);
  }

  if (!csp || !/DENY/i.test(xFrame) || !/nosniff/i.test(xContentType)) {
    throw new Error(`${label} root is missing expected security headers.`);
  }
}

async function checkPosApi(origin, endpoint) {
  const response = await fetch(`${origin}${endpoint}`, {
    body: "{}",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body = await response.text();
  const cacheControl = response.headers.get("cache-control") ?? "";
  const contentType = response.headers.get("content-type") ?? "";

  assertNoSensitiveBody(body, endpoint);

  if (response.status !== 400) {
    throw new Error(`${endpoint} returned HTTP ${response.status}, expected 400.`);
  }

  if (!/application\/json/i.test(contentType)) {
    throw new Error(`${endpoint} did not return JSON.`);
  }

  if (!/no-store/i.test(cacheControl)) {
    throw new Error(`${endpoint} missing no-store cache control.`);
  }

  const parsed = JSON.parse(body);

  if (parsed.ok !== false || typeof parsed.code !== "string") {
    throw new Error(`${endpoint} error contract is invalid.`);
  }
}

async function checkOrigin(origin, label, critical = true) {
  try {
    await checkRoot(origin, label);

    for (const endpoint of POS_ENDPOINTS) {
      await checkPosApi(origin, endpoint);
    }

    addResult(label, "PASS", critical, origin);
  } catch (error) {
    addResult(label, "FAIL", critical, error instanceof Error ? error.message : String(error));
  }
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runSupabaseLinkedCheck() {
  const version = run("supabase", ["--version"]);

  if (version.error?.code === "ENOENT") {
    addResult("Supabase CLI", "SKIPPED_ENV_MISSING", false, "supabase command not found");
    return;
  }

  if (version.status !== 0) {
    addResult("Supabase CLI", "FAIL", true, "supabase --version failed");
    return;
  }

  addResult("Supabase CLI", "PASS", false, version.stdout.trim());

  const migrations = run("supabase", ["migration", "list", "--linked"]);

  if (migrations.status !== 0) {
    addResult("Supabase linked migrations", "FAIL", true, "migration list failed");
    return;
  }

  addResult("Supabase linked migrations", "PASS", true);
}

async function checkTask032Cleanup() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    addResult(
      "TASK032 cleanup active zero",
      "SKIPPED_ENV_MISSING",
      false,
      "NEXT_PUBLIC_SUPABASE_URL or server-only service role env missing",
    );
    return;
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const must = async (label, query) => {
    const { data, error } = await query;

    if (error) {
      throw new Error(`${label}: ${error.message}`);
    }

    return data ?? [];
  };

  try {
    const shops = await must(
      "shops",
      client.from("shops").select("shop_id,shop_status").like("shop_code", "TASK032_TEST_SHOP_%"),
    );
    const shopIds = shops.map((row) => row.shop_id).filter(Boolean);
    const active = {
      categories: (
        await must(
          "categories",
          client
            .from("inventory_categories")
            .select("id")
            .like("name", "TASK032_TEST_CATEGORY_%")
            .is("deleted_at", null),
        )
      ).length,
      credentials: 0,
      devices: 0,
      mappings: 0,
      members: 0,
      products: (
        await must(
          "products",
          client
            .from("inventory_products")
            .select("id")
            .like("barcode", "TASK032_BARCODE_%")
            .is("deleted_at", null),
        )
      ).length,
      sessions: 0,
      shops: shops.filter((row) => row.shop_status !== "archived").length,
      staff: 0,
      suppliers: (
        await must(
          "suppliers",
          client
            .from("inventory_suppliers")
            .select("id")
            .like("name", "TASK032_TEST_SUPPLIER_%")
            .is("deleted_at", null),
        )
      ).length,
    };

    if (shopIds.length > 0) {
      const [staff, devices, sessions, credentials, mappings, members] = await Promise.all([
        must(
          "staff",
          client
            .from("staff_accounts")
            .select("staff_id")
            .in("shop_id", shopIds)
            .like("staff_code", "TASK032_POS_%")
            .neq("status", "archived"),
        ),
        must(
          "devices",
          client.from("shop_devices").select("shop_device_id").in("shop_id", shopIds).eq("status", "active"),
        ),
        must(
          "sessions",
          client.from("pos_sessions").select("pos_session_id").in("shop_id", shopIds).eq("status", "active"),
        ),
        must(
          "credentials",
          client
            .from("pos_device_credentials")
            .select("pos_device_credential_id")
            .in("shop_id", shopIds)
            .eq("status", "active"),
        ),
        must(
          "mappings",
          client
            .from("shop_inventory_sources")
            .select("shop_inventory_source_id")
            .in("shop_id", shopIds)
            .eq("mapping_state", "mapped")
            .is("disabled_at", null),
        ),
        must(
          "members",
          client
            .from("shop_members")
            .select("shop_member_id")
            .in("shop_id", shopIds)
            .eq("membership_status", "active"),
        ),
      ]);

      active.credentials = credentials.length;
      active.devices = devices.length;
      active.mappings = mappings.length;
      active.members = members.length;
      active.sessions = sessions.length;
      active.staff = staff.length;
    }

    const activeTotal = Object.values(active).reduce((sum, value) => sum + value, 0);

    if (activeTotal !== 0) {
      addResult("TASK032 cleanup active zero", "FAIL", true, `activeTotal=${activeTotal}`);
      return;
    }

    addResult("TASK032 cleanup active zero", "PASS", true, `task032ShopRows=${shops.length}`);
  } catch (error) {
    addResult(
      "TASK032 cleanup active zero",
      "FAIL",
      true,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function runStagingDryRun() {
  const projectRef =
    process.env.TASK032_POS_E2E_STAGING_PROJECT_REF?.trim() ||
    process.env.SUPABASE_PROJECT_REF?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (!projectRef || !supabaseUrl) {
    addResult(
      "POS staging harness dry-run",
      "SKIPPED_ENV_MISSING",
      false,
      "TASK032_POS_E2E_STAGING_PROJECT_REF/SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL missing",
    );
    return;
  }

  const host = new URL(WORKERS_DEV_URL).hostname;
  const result = run("npm", ["run", "test:pos-staging-harness:dry-run"], {
    env: {
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      TASK032_POS_E2E_BASE_URL: WORKERS_DEV_URL,
      TASK032_POS_E2E_STAGING_HOST_ALLOWLIST: host,
      TASK032_POS_E2E_STAGING_PROJECT_REF: projectRef,
      TASK032_POS_E2E_TEST_RUN_ID: "STGCHK",
    },
  });

  if (result.status !== 0) {
    addResult("POS staging harness dry-run", "FAIL", true, "dry-run command failed");
    if (result.stdout.trim()) {
      console.log(result.stdout.trim());
    }
    if (result.stderr.trim()) {
      console.error(result.stderr.trim());
    }
    return;
  }

  addResult("POS staging harness dry-run", "PASS", true);
}

async function main() {
  loadDotEnvLocal();

  if (!customDomainOnly) {
    await checkOrigin(WORKERS_DEV_URL, "workers.dev public smoke", true);
  }

  const customDomain =
    process.env.STAGING_CUSTOM_DOMAIN?.trim() ||
    process.env.CF_STAGING_CUSTOM_DOMAIN?.trim();

  if (customDomain) {
    await checkOrigin(normalizeOrigin(customDomain), "custom domain smoke", true);
  } else if (!publicOnly) {
    addResult(
      "custom domain smoke",
      "READY_TO_CONFIGURE",
      false,
      "set STAGING_CUSTOM_DOMAIN after DNS/Cloudflare route is authorized",
    );
  } else if (customDomainOnly) {
    addResult(
      "custom domain smoke",
      "READY_TO_CONFIGURE",
      false,
      "set STAGING_CUSTOM_DOMAIN after DNS/Cloudflare route is authorized",
    );
  }

  if (!publicOnly && !customDomainOnly) {
    runSupabaseLinkedCheck();
    await checkTask032Cleanup();
    runStagingDryRun();
  }

  const failed = results.filter((result) => result.critical && result.status === "FAIL");

  if (failed.length > 0) {
    console.error(`[staging-check] RESULT FAIL criticalFailures=${failed.length}`);
    process.exit(1);
  }

  console.log("[staging-check] RESULT PASS");
}

main().catch((error) => {
  addResult("staging readiness", "FAIL", true, error instanceof Error ? error.message : String(error));
  process.exit(1);
});
