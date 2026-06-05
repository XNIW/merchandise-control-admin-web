import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const targets = new Set(["local", "staging"]);

export function guardedError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

export function normalizeTarget(value = process.env.TEST_TARGET) {
  if (!value || !targets.has(value)) {
    throw guardedError(
      "BLOCKED_TEST_TARGET_REQUIRED",
      "Set TEST_TARGET explicitly to local or staging.",
    );
  }

  return value;
}

export function isLocalSupabaseUrl(value) {
  try {
    const url = new URL(value);

    return (
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "::1"].includes(url.hostname) &&
      url.port === "54321"
    );
  } catch {
    return false;
  }
}

export function isStagingSupabaseUrl(value) {
  try {
    const url = new URL(value);

    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

function splitList(value) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function allowedStagingRefs(env = process.env) {
  return [
    ...splitList(env.ALLOWED_STAGING_SUPABASE_PROJECT_REFS),
    ...splitList(env.STAGING_SUPABASE_PROJECT_REF),
  ];
}

export function productionRefs(env = process.env) {
  return [
    ...splitList(env.PRODUCTION_SUPABASE_PROJECT_REFS),
    ...splitList(env.SUPABASE_PRODUCTION_PROJECT_REF),
  ];
}

export function assertNoProductionProjectRef(env = process.env) {
  const projectRef = env.SUPABASE_PROJECT_REF?.trim() ?? "";
  const blockedRefs = productionRefs(env);

  if (blockedRefs.includes(projectRef)) {
    throw guardedError(
      "BLOCKED_PRODUCTION_PROJECT_REF_FORBIDDEN",
      "The selected Supabase project ref is marked as production.",
    );
  }

  if (/production|prod/i.test(projectRef)) {
    throw guardedError(
      "BLOCKED_PRODUCTION_PROJECT_REF_FORBIDDEN",
      "The selected Supabase project ref looks production-like.",
    );
  }
}

export function assertLocalTargetEnv(env = process.env) {
  if (env.TEST_TARGET !== "local") {
    throw guardedError(
      "BLOCKED_TEST_TARGET_REQUIRED",
      "Local test scripts must set TEST_TARGET=local.",
    );
  }

  if (!isLocalSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL)) {
    throw guardedError(
      "BLOCKED_LOCAL_SUPABASE_URL_REQUIRED",
      "Local tests require NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 or localhost:54321.",
    );
  }
}

export function assertStagingTargetEnv(env = process.env, options = {}) {
  if (env.TEST_TARGET !== "staging") {
    throw guardedError(
      "BLOCKED_TEST_TARGET_REQUIRED",
      "Staging test scripts must set TEST_TARGET=staging.",
    );
  }

  if (!isStagingSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL)) {
    throw guardedError(
      "BLOCKED_STAGING_SUPABASE_URL_REQUIRED",
      "Staging tests require an https://*.supabase.co Supabase URL.",
    );
  }

  assertNoProductionProjectRef(env);

  const projectRef = env.SUPABASE_PROJECT_REF?.trim() ?? "";
  const allowedRefs = allowedStagingRefs(env);

  if (!projectRef || allowedRefs.length === 0 || !allowedRefs.includes(projectRef)) {
    throw guardedError(
      "BLOCKED_STAGING_PROJECT_REF_NOT_ALLOWLISTED",
      "Set SUPABASE_PROJECT_REF and allowlist it with ALLOWED_STAGING_SUPABASE_PROJECT_REFS or STAGING_SUPABASE_PROJECT_REF.",
    );
  }

  if (env.ALLOW_STAGING_E2E !== "yes") {
    throw guardedError(
      "BLOCKED_STAGING_CONFIRMATION_REQUIRED",
      "Set ALLOW_STAGING_E2E=yes before staging checks.",
    );
  }

  if (options.requireConfirmation && env.CONFIRM_STAGING_E2E !== "yes") {
    throw guardedError(
      "BLOCKED_STAGING_CONFIRMATION_REQUIRED",
      "Set CONFIRM_STAGING_E2E=yes before staging E2E.",
    );
  }
}

export function assertTargetEnv(target, env = process.env, options = {}) {
  const normalized = normalizeTarget(target);

  if (normalized === "local") {
    assertLocalTargetEnv(env);
    return;
  }

  assertStagingTargetEnv(env, options);
}

export function parseSupabaseStatusEnv(output) {
  const values = {};

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || !line.includes("=")) {
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

export function readLinkedProjectRef() {
  const linkedProjectPath = join(root, "supabase/.temp/linked-project.json");

  if (!existsSync(linkedProjectPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(linkedProjectPath, "utf8"));
    const ref = typeof parsed.ref === "string" ? parsed.ref : null;
    const name = typeof parsed.name === "string" ? parsed.name : "";

    if (ref && /dev|staging/i.test(name) && !/prod|production/i.test(name)) {
      return ref;
    }
  } catch {
    return null;
  }

  return null;
}
