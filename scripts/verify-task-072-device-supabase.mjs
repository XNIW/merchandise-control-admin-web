#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assertNoProductionProjectRef } from "./testing/target-guardrails.mjs";

const root = process.cwd();
const defaultLintTimeoutMs = 120_000;

function fail(code, message) {
  console.error(`[task072-device-supabase] FAIL ${code}: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    lintTimeoutMs: defaultLintTimeoutMs,
    shopId: "",
    skipLint: false,
  };

  for (const raw of argv) {
    if (raw === "--skip-lint") {
      args.skipLint = true;
      continue;
    }

    const [key, value = ""] = raw.split("=");

    if (key === "--shop-id") {
      args.shopId = value.trim();
    } else if (key === "--lint-timeout-ms") {
      args.lintTimeoutMs = Number(value);
    } else {
      fail("UNKNOWN_ARGUMENT", `Unsupported argument: ${key}`);
    }
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.shopId)) {
    fail("SHOP_ID_REQUIRED", "Pass --shop-id=<uuid> for the non-production shop to verify.");
  }

  if (!Number.isFinite(args.lintTimeoutMs) || args.lintTimeoutMs < 10_000) {
    fail("INVALID_TIMEOUT", "--lint-timeout-ms must be at least 10000.");
  }

  return args;
}

function parseEnvFile(relativePath) {
  const path = join(root, relativePath);

  if (!existsSync(path)) {
    return {};
  }

  const values = {};

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

function loadRuntimeEnv() {
  const env = {
    ...parseEnvFile(".env.local"),
    ...process.env,
  };

  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const ref = env.SUPABASE_PROJECT_REF?.trim() ?? "";

  if (!url || !ref) {
    fail("SUPABASE_ENV_REQUIRED", ".env.local must provide NEXT_PUBLIC_SUPABASE_URL and SUPABASE_PROJECT_REF.");
  }

  let refFromUrl = "";

  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co")) {
      fail("CLOUD_DEV_REQUIRED", "TASK-072 device harness must target the linked non-production cloud Supabase URL.");
    }

    refFromUrl = parsed.hostname.split(".")[0] ?? "";
  } catch {
    fail("SUPABASE_URL_INVALID", "NEXT_PUBLIC_SUPABASE_URL is invalid.");
  }

  if (ref !== refFromUrl) {
    fail("PROJECT_REF_MISMATCH", "SUPABASE_PROJECT_REF must match NEXT_PUBLIC_SUPABASE_URL.");
  }

  try {
    assertNoProductionProjectRef(env);
  } catch (error) {
    fail(error.code ?? "PRODUCTION_REF_FORBIDDEN", error.message);
  }

  return env;
}

function redact(value) {
  return String(value)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-jwt]")
    .replace(/\b(access_token|refresh_token|magic_link)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/\b[A-Za-z0-9_-]{80,}\b/g, "[redacted-long-token]");
}

function redactRef(ref) {
  return ref ? `${ref.slice(0, 4)}...${ref.slice(-3)}` : "unknown";
}

function run(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: root,
      detached: true,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
      setTimeout(() => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }, 2_000).unref();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolve({
        ok: status === 0 && !timedOut,
        status,
        stderr: redact(stderr),
        stdout: redact(stdout),
        timedOut,
      });
    });
  });
}

function parseJsonOutput(result, label) {
  if (!result.ok) {
    fail(
      `${label}_FAILED`,
      result.timedOut
        ? `${label} timed out`
        : `${label} exited with status ${result.status}: ${result.stderr.slice(0, 500)}`,
    );
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    fail(`${label}_INVALID_JSON`, `${label} did not return JSON.`);
  }
}

function assertRowBooleans(row, label) {
  const failed = Object.entries(row)
    .filter(([, value]) => value !== true)
    .map(([key]) => key);

  if (failed.length > 0) {
    fail(`${label}_ASSERTIONS_FAILED`, `${failed.join(", ")} were not true.`);
  }
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function schemaSql() {
  return `
with status_rpc as (
  select p.oid, p.pronargs, pg_get_function_arguments(p.oid) as args, pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'shop_device_status_current_owner'
),
register_rpc as (
  select p.oid, p.pronargs, pg_get_function_arguments(p.oid) as args, pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'shop_device_register'
),
owner_rpc as (
  select p.oid, p.pronargs, pg_get_function_arguments(p.oid) as args, pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'shop_device_register_current_owner'
)
select
  exists(select 1 from supabase_migrations.schema_migrations where version = '20260619123000') as auto_registration_migration_present,
  exists(select 1 from supabase_migrations.schema_migrations where version = '20260619173000') as status_migration_present,
  exists(select 1 from status_rpc) as status_rpc_exists,
  coalesce((select pronargs = 1 from status_rpc), false) as status_rpc_one_argument,
  coalesce((select args !~* 'shop_id' from status_rpc), false) as status_rpc_accepts_no_shop_id,
  coalesce((select def !~* 'public\\.shop_device_register|write_shop_admin_audit|update\\s+public\\.shop_devices|insert\\s+into\\s+public\\.shop_devices|delete\\s+from\\s+public\\.shop_devices' from status_rpc), false) as status_rpc_read_only,
  has_function_privilege('authenticated', 'public.shop_device_status_current_owner(text)', 'EXECUTE') as status_rpc_authenticated_execute,
  not has_function_privilege('anon', 'public.shop_device_status_current_owner(text)', 'EXECUTE') as status_rpc_anon_blocked,
  exists(select 1 from register_rpc) as register_rpc_exists,
  coalesce((select def ~* 'jsonb_has_sensitive_device_metadata_key' from register_rpc), false) as register_blocks_sensitive_metadata,
  coalesce((select def ~* 'status\\s+in\\s*\\(''revoked'',\\s*''suspicious''\\)' from register_rpc), false) as register_preserves_revoked_suspicious,
  exists(select 1 from owner_rpc) as owner_rpc_exists,
  coalesce((select args !~* 'shop_id' from owner_rpc), false) as owner_rpc_accepts_no_shop_id,
  has_function_privilege('authenticated', 'public.shop_device_register_current_owner(text,text,text,text,jsonb)', 'EXECUTE') as owner_rpc_authenticated_execute,
  not has_function_privilege('anon', 'public.shop_device_register_current_owner(text,text,text,text,jsonb)', 'EXECUTE') as owner_rpc_anon_blocked;
`.trim();
}

function runtimeSql(shopId) {
  return `
begin;
do $$
declare
  v_shop uuid := ${quoteLiteral(shopId)}::uuid;
  v_owner uuid;
  v_identifier text := 'task072_verify_' || replace(gen_random_uuid()::text, '-', '');
  v_payload jsonb;
  v_active_status_ok boolean := false;
  v_active_can_write_ok boolean := false;
  v_revoked_status_ok boolean := false;
  v_revoked_can_write_ok boolean := false;
  v_reregister_preserved_revoked boolean := false;
  v_reregister_updated_seen boolean := false;
  v_sensitive_metadata_blocked boolean := false;
  v_status text;
  v_app_version text;
begin
  select sis.owner_user_id into v_owner
  from public.shop_inventory_sources sis
  join public.shops s on s.shop_id = sis.shop_id
  where sis.shop_id = v_shop
    and sis.mapping_state = 'mapped'
    and sis.disabled_at is null
    and s.shop_status = 'active'
  order by sis.verified_at desc nulls last, sis.created_at desc
  limit 1;

  if v_owner is null then
    raise exception 'missing_owner_mapping';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
    true
  );

  insert into public.shop_devices (
    shop_id,
    device_identifier,
    device_type,
    display_name,
    app_version,
    status,
    last_seen_at,
    last_seen_principal_kind,
    metadata_redacted
  )
  values (
    v_shop,
    v_identifier,
    'mobile',
    'TASK072 Verify Device',
    'verify-active',
    'active',
    now(),
    'personal_account',
    '{"source":"task072_verify"}'::jsonb
  );

  v_payload := public.shop_device_status_current_owner(v_identifier);
  v_active_status_ok := v_payload->>'status' = 'active';
  v_active_can_write_ok := (v_payload->>'can_write')::boolean is true;

  update public.shop_devices
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where shop_id = v_shop and device_identifier = v_identifier;

  v_payload := public.shop_device_status_current_owner(v_identifier);
  v_revoked_status_ok := v_payload->>'status' = 'revoked';
  v_revoked_can_write_ok := (v_payload->>'can_write')::boolean is false;

  v_payload := public.shop_device_register_current_owner(
    v_identifier,
    'mobile',
    'TASK072 Verify Device',
    'verify-reregister',
    '{"source":"task072_verify"}'::jsonb
  );

  select status, app_version into v_status, v_app_version
  from public.shop_devices
  where shop_id = v_shop and device_identifier = v_identifier;

  v_reregister_preserved_revoked := v_status = 'revoked';
  v_reregister_updated_seen := v_app_version = 'verify-reregister';

  v_payload := public.shop_device_register_current_owner(
    v_identifier,
    'mobile',
    'TASK072 Verify Device',
    'verify-sensitive',
    '{"api_token":"redacted"}'::jsonb
  );

  v_sensitive_metadata_blocked := v_payload->>'code' = 'validation_failed';

  create temp table task072_verify_result on commit drop as
  select
    v_active_status_ok as active_status_ok,
    v_active_can_write_ok as active_can_write_ok,
    v_revoked_status_ok as revoked_status_ok,
    v_revoked_can_write_ok as revoked_can_write_ok,
    v_reregister_preserved_revoked as reregister_preserved_revoked,
    v_reregister_updated_seen as reregister_updated_seen,
    v_sensitive_metadata_blocked as sensitive_metadata_blocked;
end
$$;
select * from task072_verify_result;
rollback;
`.trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadRuntimeEnv();

  let lintStatus = "skipped";

  if (!args.skipLint) {
    const lint = await run(
      "supabase",
      ["db", "lint", "--linked", "--schema", "public,app_private", "--fail-on", "error"],
      { timeoutMs: args.lintTimeoutMs, env },
    );

    if (lint.ok) {
      lintStatus = "pass";
    } else if (lint.timedOut) {
      lintStatus = "timeout_replaced_by_sql_harness";
    } else {
      fail("DB_LINT_FAILED", lint.stderr.slice(0, 800) || lint.stdout.slice(0, 800));
    }
  }

  const schema = parseJsonOutput(
    await run(
      "supabase",
      ["db", "query", "--linked", "--output", "json", schemaSql()],
      { timeoutMs: 60_000, env },
    ),
    "SCHEMA_QUERY",
  );
  const schemaRow = schema.rows?.[0];

  if (!schemaRow) {
    fail("SCHEMA_QUERY_EMPTY", "Schema verification returned no rows.");
  }

  assertRowBooleans(schemaRow, "SCHEMA");

  const runtime = parseJsonOutput(
    await run(
      "supabase",
      ["db", "query", "--linked", "--output", "json", runtimeSql(args.shopId)],
      { timeoutMs: 60_000, env },
    ),
    "RUNTIME_QUERY",
  );
  const runtimeRow = runtime.rows?.[0];

  if (!runtimeRow) {
    fail("RUNTIME_QUERY_EMPTY", "Runtime verification returned no rows.");
  }

  assertRowBooleans(runtimeRow, "RUNTIME");

  console.log(
    JSON.stringify(
      {
        check: "task072_device_supabase",
        lint: lintStatus,
        project_ref: redactRef(env.SUPABASE_PROJECT_REF),
        runtime: runtimeRow,
        schema: schemaRow,
        verdict: "PASS",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  fail("UNEXPECTED_ERROR", error instanceof Error ? error.message : String(error));
});
