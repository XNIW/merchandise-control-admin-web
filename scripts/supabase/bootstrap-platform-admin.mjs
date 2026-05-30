#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const envFiles = [".env", ".env.local", ".env.development.local"];
const defaultReason = "Initial platform admin bootstrap approved by project owner";
const redactedReason =
  "Initial platform admin bootstrap approved by project owner; value redacted.";
const eventKey = "platform_admin.bootstrap.granted";

function fail(code, message, status = 1) {
  process.stderr.write(`${code}: ${message}\n`);
  process.exit(status);
}

function loadEnvFiles() {
  for (const envFile of envFiles) {
    if (!existsSync(envFile)) {
      continue;
    }

    const contents = readFileSync(envFile, "utf8");

    for (const rawLine of contents.split(/\r?\n/)) {
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

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function env(name) {
  const value = process.env[name]?.trim();

  return value ? value : "";
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function redactSupabaseOutput(text) {
  return text
    .replace(/[a-z0-9]{20}\.supabase\.co/gi, "[PROJECT_REF].supabase.co")
    .replace(/postgres\.[a-z0-9]{20}/gi, "postgres.[PROJECT_REF]")
    .replace(/db\.[a-z0-9]{20}/gi, "db.[PROJECT_REF]");
}

loadEnvFiles();

const explicitProfileId = env("PLATFORM_ADMIN_BOOTSTRAP_PROFILE_ID");
const bootstrapEmail = env("PLATFORM_ADMIN_BOOTSTRAP_EMAIL");
const testEmail = env("PLATFORM_ADMIN_TEST_EMAIL");
const reason = env("PLATFORM_ADMIN_BOOTSTRAP_REASON") || defaultReason;
const confirmed = env("CONFIRM_PLATFORM_ADMIN_BOOTSTRAP");
const shouldApply = confirmed === "yes";
const identityEmail = bootstrapEmail || testEmail;
const identitySource = explicitProfileId
  ? "profile_id_env"
  : bootstrapEmail
    ? "bootstrap_email_env"
    : testEmail
      ? "test_email_env"
      : "exactly one auth user";

if (explicitProfileId && !uuidPattern.test(explicitProfileId)) {
  fail(
    "BLOCKED_INPUT_REQUIRED",
    "PLATFORM_ADMIN_BOOTSTRAP_PROFILE_ID must be a UUID.",
    2,
  );
}

if (reason.length < 8 || reason.length > 240) {
  fail(
    "BLOCKED_INPUT_REQUIRED",
    "PLATFORM_ADMIN_BOOTSTRAP_REASON must be between 8 and 240 characters.",
    2,
  );
}

const transactionEnd = shouldApply ? "commit;" : "rollback;";
const tempDir = mkdtempSync(join(tmpdir(), "mc-admin-bootstrap-"));
const sqlPath = join(tempDir, "bootstrap-platform-admin.sql");

const sql = `
begin;

create temp table bootstrap_platform_admin_result (
  target_profile_id uuid not null,
  identity_source text not null,
  already_active boolean not null
) on commit drop;

do $$
declare
  input_profile_id text := nullif(${sqlLiteral(explicitProfileId)}, '');
  input_email text := lower(nullif(${sqlLiteral(identityEmail)}, ''));
  resolved_identity_source text := ${sqlLiteral(identitySource)};
  target_profile_id uuid;
  auth_user_count integer;
  matching_user_count integer;
  active_admin_exists boolean;
begin
  if input_profile_id is not null then
    target_profile_id := input_profile_id::uuid;

    if not exists (select 1 from auth.users where id = target_profile_id) then
      raise exception 'BLOCKED_INPUT_REQUIRED: auth user does not exist';
    end if;
  elsif input_email is not null then
    select count(*)
    into matching_user_count
    from auth.users
    where lower(email) = input_email;

    if matching_user_count <> 1 then
      raise exception 'BLOCKED_INPUT_REQUIRED: email did not resolve to exactly one auth user';
    end if;

    select id
    into target_profile_id
    from auth.users
    where lower(email) = input_email
    order by created_at asc
    limit 1;
  else
    select count(*)
    into auth_user_count
    from auth.users;

    if auth_user_count <> 1 then
      raise exception 'BLOCKED_INPUT_REQUIRED: expected exactly one auth user for automatic bootstrap';
    end if;

    select id
    into target_profile_id
    from auth.users
    order by created_at asc
    limit 1;
  end if;

  insert into public.profiles (
    profile_id,
    display_name,
    profile_status
  )
  values (
    target_profile_id,
    'Platform Admin',
    'active'
  )
  on conflict (profile_id) do nothing;

  select exists (
    select 1
    from public.platform_admins
    where profile_id = target_profile_id
      and status = 'active'
      and revoked_at is null
  ) into active_admin_exists;

  if not active_admin_exists then
    insert into public.platform_admins (
      profile_id,
      status,
      reason_redacted
    )
    values (
      target_profile_id,
      'active',
      ${sqlLiteral(redactedReason)}
    );
  end if;

  insert into public.audit_logs (
    actor_profile_id,
    scope,
    event_key,
    severity,
    result,
    target_type,
    target_id,
    metadata_redacted
  )
  values (
    null,
    'global',
    ${sqlLiteral(eventKey)},
    'critical',
    ${shouldApply ? "'success'" : "'simulated'"},
    'platform_admin',
    target_profile_id::text,
    jsonb_build_object(
      'reason', ${sqlLiteral(redactedReason)},
      'source', 'scripts/supabase/bootstrap-platform-admin.mjs',
      'mode', ${shouldApply ? "'apply'" : "'dry_run'"},
      'identity_source', resolved_identity_source,
      'already_active', active_admin_exists,
      'confirmation', ${shouldApply ? "'env_confirmed_or_prompt_approved'" : "'dry_run'"}
    )
  );

  insert into bootstrap_platform_admin_result (
    target_profile_id,
    identity_source,
    already_active
  )
  values (
    target_profile_id,
    resolved_identity_source,
    active_admin_exists
  );
end $$;

select
  ${shouldApply ? "'APPLY_READY'" : "'DRY_RUN_ROLLBACK'"} as mode,
  r.identity_source,
  r.already_active,
  substring(encode(sha256(r.target_profile_id::text::bytea), 'hex') from 1 for 12) as "PROFILE_ID_SHA256_12",
  exists (
    select 1
    from public.profiles
    where profile_id = r.target_profile_id
  ) as profile_exists,
  exists (
    select 1
    from public.platform_admins
    where profile_id = r.target_profile_id
      and status = 'active'
      and revoked_at is null
  ) as active_platform_admin_exists,
  exists (
    select 1
    from public.platform_admins
    where profile_id = r.target_profile_id
      and status = 'revoked'
      and revoked_at is not null
  ) as revoked_rows_ignored,
  count(a.audit_log_id) filter (
    where a.event_key = ${sqlLiteral(eventKey)}
      and a.target_id = r.target_profile_id::text
  ) as bootstrap_audit_events
from bootstrap_platform_admin_result r
left join public.audit_logs a on a.target_id = r.target_profile_id::text
group by r.target_profile_id, r.identity_source, r.already_active;

${transactionEnd}
`;

try {
  writeFileSync(sqlPath, sql, { mode: 0o600 });

  const result = spawnSync(
    "supabase",
    ["db", "query", "--linked", "--file", sqlPath],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  if (result.stdout) {
    process.stdout.write(redactSupabaseOutput(result.stdout));
  }

  if (result.stderr) {
    process.stderr.write(redactSupabaseOutput(result.stderr));
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  if (!shouldApply) {
    process.stdout.write(
      "DRY_RUN_COMPLETE: transaction ended with rollback. Set CONFIRM_PLATFORM_ADMIN_BOOTSTRAP=yes to apply after reviewing this output.\n",
    );
  } else {
    process.stdout.write(
      "APPLY_COMPLETE: platform_admin bootstrap transaction committed with redacted audit metadata.\n",
    );
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
