#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assertNoProductionProjectRef } from "../testing/target-guardrails.mjs";

const root = process.cwd();
const envFile = ".env.local";
const requiredEnvNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function fail(code, message) {
  console.error(`[platform-cloud-probe] FAIL ${code}: ${message}`);
  process.exit(2);
}

function parseEnvFile(relativePath) {
  const path = join(root, relativePath);

  if (!existsSync(path)) {
    fail("BLOCKED_CLOUD_ENV_FILE_REQUIRED", `${relativePath} is required.`);
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

function cloudRefFromUrl(value) {
  try {
    const url = new URL(value);

    if (["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
      fail(
        "BLOCKED_LOCAL_SUPABASE_URL",
        "Cloud read-only probe must not run against local Supabase.",
      );
    }

    if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co")) {
      fail(
        "BLOCKED_CLOUD_SUPABASE_URL_REQUIRED",
        "Cloud read-only probe requires an https://*.supabase.co target.",
      );
    }

    return url.hostname.split(".")[0] ?? "";
  } catch {
    fail("BLOCKED_CLOUD_SUPABASE_URL_INVALID", "Supabase URL is invalid.");
  }
}

function redactRef(ref) {
  return ref ? `${ref.slice(0, 4)}...${ref.slice(-3)}` : "unknown";
}

function redactId(value) {
  return value ? `${value.slice(0, 8)}...${value.slice(-4)}` : null;
}

function redactEmail(value) {
  if (!value || !value.includes("@")) {
    return value ? "present_non_email" : null;
  }

  const [local, domain] = value.split("@");
  const suffix = domain.split(".").at(-1) ?? "domain";

  return `${local.slice(0, 4)}...@...${suffix}`;
}

function normalizeDisplayName(value, max = 80) {
  return typeof value === "string"
    ? value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function authDisplayName(user) {
  const metadata = user.user_metadata ?? {};

  for (const key of ["display_name", "full_name", "name"]) {
    const normalized = normalizeDisplayName(metadata[key]);

    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function providerSummary(user) {
  const providers = new Set();

  if (typeof user.app_metadata?.provider === "string") {
    providers.add(user.app_metadata.provider.toLowerCase());
  }

  for (const identity of user.identities ?? []) {
    if (typeof identity.provider === "string") {
      providers.add(identity.provider.toLowerCase());
    }
  }

  if (providers.size === 0 && user.email) {
    providers.add("email");
  }

  if (providers.size === 0 && user.phone) {
    providers.add("phone");
  }

  return Array.from(providers).sort().join(", ") || "unknown";
}

async function listAllUsers(admin) {
  const users = [];

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      throw new Error(`auth_list_failed:${error.message}`);
    }

    users.push(...data.users);

    if (page >= data.lastPage || data.users.length === 0) {
      break;
    }
  }

  return users;
}

async function countRows(admin, table, column) {
  const { count, error } = await admin
    .from(table)
    .select(column, { count: "exact", head: true });

  if (error) {
    throw new Error(`${table}_count_failed:${error.message}`);
  }

  return count ?? 0;
}

function loadCloudEnv() {
  if (process.env.CONFIRM_PLATFORM_CLOUD_READONLY !== "yes") {
    fail(
      "BLOCKED_CLOUD_READONLY_CONFIRMATION_REQUIRED",
      "Set CONFIRM_PLATFORM_CLOUD_READONLY=yes for this read-only cloud probe.",
    );
  }

  const probeEmail = process.env.PLATFORM_CLOUD_PROBE_EMAIL?.trim().toLowerCase();

  if (!probeEmail || !probeEmail.includes("@")) {
    fail(
      "BLOCKED_CLOUD_PROBE_EMAIL_REQUIRED",
      "Set PLATFORM_CLOUD_PROBE_EMAIL to the account to verify.",
    );
  }

  const env = parseEnvFile(envFile);
  const missing = requiredEnvNames.filter((name) => !env[name]?.trim());

  if (missing.length > 0) {
    fail(
      "BLOCKED_CLOUD_ENV_REQUIRED",
      `${envFile} is missing required runtime keys: ${missing.join(", ")}.`,
    );
  }

  const refFromUrl = cloudRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const configuredRef = env.SUPABASE_PROJECT_REF.trim();

  if (configuredRef !== refFromUrl) {
    fail(
      "BLOCKED_CLOUD_PROJECT_REF_MISMATCH",
      "SUPABASE_PROJECT_REF must match the Supabase URL project ref.",
    );
  }

  try {
    assertNoProductionProjectRef(env);
  } catch (error) {
    fail(error.code ?? "BLOCKED_PRODUCTION_PROJECT_REF_FORBIDDEN", error.message);
  }

  return { env, probeEmail };
}

const { env, probeEmail } = loadCloudEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
  global: {
    headers: {
      "X-Client-Info": "merchandise-control-admin-web/platform-cloud-readonly-probe",
    },
  },
});

const users = await listAllUsers(admin);
const authIds = new Set(users.map((user) => user.id));
const matchingUser = users.find(
  (user) => user.email?.trim().toLowerCase() === probeEmail,
);
const { data: profiles, error: profilesError } = await admin
  .from("profiles")
  .select("profile_id,display_name,profile_status");

if (profilesError) {
  throw new Error(`profiles_read_failed:${profilesError.message}`);
}

const profileRows = profiles ?? [];
const profileIds = new Set(profileRows.map((profile) => profile.profile_id));
const matchingProfile = matchingUser
  ? profileRows.find((profile) => profile.profile_id === matchingUser.id)
  : null;
const profileOk = Array.from(authIds).filter((id) => profileIds.has(id)).length;
const payload = {
  target: {
    class: "cloud",
    ref: redactRef(env.SUPABASE_PROJECT_REF),
    source: envFile,
  },
  counts: {
    authUsers: users.length,
    profiles: await countRows(admin, "profiles", "profile_id"),
    platformAdmins: await countRows(admin, "platform_admins", "platform_admin_id"),
    shopMembers: await countRows(admin, "shop_members", "shop_member_id"),
  },
  parity: {
    profile_ok: profileOk,
    auth_only: Array.from(authIds).filter((id) => !profileIds.has(id)).length,
    profile_only: Array.from(profileIds).filter((id) => !authIds.has(id)).length,
    origin_unavailable: 0,
  },
  probe: matchingUser
    ? {
        auth: "present",
        email: redactEmail(matchingUser.email),
        id: redactId(matchingUser.id),
        provider: providerSummary(matchingUser),
        authDisplayName: authDisplayName(matchingUser) || "not_available",
        profile: matchingProfile
          ? {
              state: "profile_ok",
              displayName: matchingProfile.display_name,
              profileStatus: matchingProfile.profile_status,
            }
          : { state: "auth_only" },
      }
    : {
        auth: "absent",
        email: redactEmail(probeEmail),
      },
};

console.log(JSON.stringify(payload, null, 2));
