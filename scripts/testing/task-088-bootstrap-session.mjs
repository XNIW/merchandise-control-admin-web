#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const DEFAULT_ANDROID_SESSION_PATH =
  "/private/tmp/task088-session-android.json";
const DEFAULT_IOS_SESSION_PATH = "/private/tmp/task088-session-ios.json";
const DEFAULT_RUNTIME_META_PATH = "/private/tmp/task088-runtime-meta.json";
const SYNTHETIC_SHOP_NAME = "TASK-088 Final Sync";

class BootstrapError extends Error {
  constructor(code) {
    super(code);
    this.name = "BootstrapError";
    this.code = code;
  }
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new BootstrapError(`${name}_MISSING`);
  }
  return value;
}

function selectedPath(name, fallback) {
  return process.env[name]?.trim() || fallback;
}

function validateOutputPath(pathValue) {
  const normalized = resolve(pathValue);
  if (
    dirname(normalized) !== "/private/tmp" ||
    !basename(normalized).startsWith("task088-")
  ) {
    throw new BootstrapError("OUTPUT_PATH_NOT_ALLOWLISTED");
  }
  return normalized;
}

function sha256Prefix(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function validateSupabaseTarget(urlValue, projectRef, linkedProjectRef) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new BootstrapError("SUPABASE_URL_INVALID");
  }

  const expectedHostname = `${projectRef}.supabase.co`;
  if (
    url.protocol !== "https:" ||
    url.hostname !== expectedHostname ||
    linkedProjectRef !== projectRef
  ) {
    throw new BootstrapError("SUPABASE_TARGET_MISMATCH");
  }
  return url.origin;
}

function validateAdminTarget(urlValue) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new BootstrapError("ADMIN_URL_INVALID");
  }

  const local =
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  const staging =
    url.protocol === "https:" &&
    url.hostname ===
      "merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev";

  if (!local && !staging) {
    throw new BootstrapError("ADMIN_TARGET_NOT_ALLOWLISTED");
  }
  return url;
}

async function requestJson(url, init, failureCode) {
  let response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new BootstrapError(`${failureCode}_NETWORK`);
  }

  if (!response.ok) {
    throw new BootstrapError(`${failureCode}_HTTP_${response.status}`);
  }

  try {
    return await response.json();
  } catch {
    throw new BootstrapError(`${failureCode}_JSON`);
  }
}

async function atomicWrite(pathValue, content) {
  const temporary = `${pathValue}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, pathValue);
    await chmod(pathValue, 0o600);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

function serviceHeaders(serviceKey) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };
}

function restUrl(baseUrl, table, parameters) {
  const url = new URL(`/rest/v1/${table}`, baseUrl);
  for (const [name, value] of Object.entries(parameters)) {
    url.searchParams.set(name, value);
  }
  return url;
}

async function findSyntheticShop(baseUrl, serviceKey, expectedHash) {
  const shops = await requestJson(
    restUrl(baseUrl, "shops", {
      select: "shop_id,shop_name,shop_status",
      shop_name: `eq.${SYNTHETIC_SHOP_NAME}`,
      shop_status: "eq.active",
      limit: "100",
    }),
    { headers: serviceHeaders(serviceKey) },
    "SHOP_QUERY",
  );

  if (!Array.isArray(shops)) {
    throw new BootstrapError("SHOP_QUERY_SHAPE");
  }

  const matches = shops.filter(
    (shop) =>
      typeof shop?.shop_id === "string" &&
      sha256Prefix(shop.shop_id) === expectedHash,
  );
  if (matches.length !== 1) {
    throw new BootstrapError("SYNTHETIC_SHOP_NOT_UNIQUE");
  }
  return matches[0].shop_id;
}

async function findSyntheticOwner(baseUrl, serviceKey, shopId) {
  const members = await requestJson(
    restUrl(baseUrl, "shop_members", {
      select: "profile_id",
      shop_id: `eq.${shopId}`,
      role_key: "eq.shop_owner",
      membership_status: "eq.active",
      limit: "10",
    }),
    { headers: serviceHeaders(serviceKey) },
    "OWNER_QUERY",
  );
  const ownerIds = [
    ...new Set(
      Array.isArray(members)
        ? members
            .map((member) => member?.profile_id)
            .filter((value) => typeof value === "string")
        : [],
    ),
  ];
  if (ownerIds.length !== 1) {
    throw new BootstrapError("SYNTHETIC_OWNER_NOT_UNIQUE");
  }

  const mappings = await requestJson(
    restUrl(baseUrl, "shop_inventory_sources", {
      select: "owner_user_id",
      shop_id: `eq.${shopId}`,
      mapping_state: "eq.mapped",
      limit: "10",
    }),
    { headers: serviceHeaders(serviceKey) },
    "MAPPING_QUERY",
  );
  const mappedOwnerIds = [
    ...new Set(
      Array.isArray(mappings)
        ? mappings
            .map((mapping) => mapping?.owner_user_id)
            .filter((value) => typeof value === "string")
        : [],
    ),
  ];
  if (
    mappedOwnerIds.length !== 1 ||
    mappedOwnerIds[0] !== ownerIds[0]
  ) {
    throw new BootstrapError("SYNTHETIC_OWNER_MAPPING_MISMATCH");
  }
  return ownerIds[0];
}

async function findUserEmail(baseUrl, serviceKey, userId) {
  const user = await requestJson(
    new URL(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, baseUrl),
    { headers: serviceHeaders(serviceKey) },
    "AUTH_USER_QUERY",
  );
  if (typeof user?.email !== "string" || !user.email.trim()) {
    throw new BootstrapError("AUTH_USER_EMAIL_MISSING");
  }
  return user.email;
}

async function passwordSession(baseUrl, publishableKey, email, password) {
  return requestJson(
    new URL("/auth/v1/token?grant_type=password", baseUrl),
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    },
    "PASSWORD_AUTH",
  );
}

async function magicLinkSession(
  baseUrl,
  publishableKey,
  serviceKey,
  email,
) {
  const generated = await requestJson(
    new URL("/auth/v1/admin/generate_link", baseUrl),
    {
      method: "POST",
      headers: {
        ...serviceHeaders(serviceKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "magiclink", email }),
    },
    "MAGIC_LINK_GENERATE",
  );
  const tokenHash =
    generated?.hashed_token ?? generated?.properties?.hashed_token;
  if (typeof tokenHash !== "string" || !tokenHash) {
    throw new BootstrapError("MAGIC_LINK_HASH_MISSING");
  }

  return requestJson(
    new URL("/auth/v1/verify", baseUrl),
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
    },
    "MAGIC_LINK_VERIFY",
  );
}

async function authenticate(
  baseUrl,
  publishableKey,
  serviceKey,
  email,
) {
  const password = process.env.DEV_PLATFORM_ADMIN_PASSWORD?.trim();
  if (password) {
    try {
      return await passwordSession(baseUrl, publishableKey, email, password);
    } catch (error) {
      if (
        !(error instanceof BootstrapError) ||
        !["PASSWORD_AUTH_HTTP_400", "PASSWORD_AUTH_HTTP_401"].includes(
          error.code,
        )
      ) {
        throw error;
      }
    }
  }
  return magicLinkSession(baseUrl, publishableKey, serviceKey, email);
}

function validateSession(session) {
  if (
    typeof session?.access_token !== "string" ||
    typeof session?.refresh_token !== "string" ||
    !Number.isInteger(session?.expires_at)
  ) {
    throw new BootstrapError("AUTH_SESSION_INVALID");
  }
}

async function main() {
  const projectRef = requiredEnvironment("SUPABASE_PROJECT_REF");
  const linkedProjectRef = (
    await readFile("supabase/.temp/project-ref", "utf8")
  ).trim();
  const baseUrl = validateSupabaseTarget(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    projectRef,
    linkedProjectRef,
  );
  const publishableKey = requiredEnvironment(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
  const serviceKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const expectedHash = requiredEnvironment(
    "TASK088_FINAL_SYNC_SHOP_HASH",
  ).toLowerCase();
  if (!/^[a-f0-9]{12}$/.test(expectedHash)) {
    throw new BootstrapError("SHOP_HASH_INVALID");
  }

  const adminUrl = validateAdminTarget(
    requiredEnvironment("MC_ADMIN_BASE_URL"),
  );
  const androidSessionPath = validateOutputPath(
    selectedPath(
      "MC_ANDROID_TASK072_SESSION_FILE",
      DEFAULT_ANDROID_SESSION_PATH,
    ),
  );
  const iosSessionPath = validateOutputPath(
    selectedPath(
      "TASK088_FINAL_SYNC_SESSION_FILE",
      DEFAULT_IOS_SESSION_PATH,
    ),
  );
  const cookiePath = validateOutputPath(
    requiredEnvironment("MC_ADMIN_SESSION_COOKIE_FILE"),
  );
  const runtimeMetaPath = validateOutputPath(
    selectedPath("TASK088_RUNTIME_META_FILE", DEFAULT_RUNTIME_META_PATH),
  );

  const shopId = await findSyntheticShop(baseUrl, serviceKey, expectedHash);
  const ownerId = await findSyntheticOwner(baseUrl, serviceKey, shopId);
  const email = await findUserEmail(baseUrl, serviceKey, ownerId);
  const session = await authenticate(
    baseUrl,
    publishableKey,
    serviceKey,
    email,
  );
  validateSession(session);

  const mobileSession = JSON.stringify({
    access: session.access_token,
    refresh: session.refresh_token,
  });
  await Promise.all([
    atomicWrite(androidSessionPath, mobileSession),
    atomicWrite(iosSessionPath, mobileSession),
  ]);

  const cookieName = `sb-${projectRef}-auth-token`;
  const cookieValue = `base64-${Buffer.from(
    JSON.stringify(session),
    "utf8",
  )
    .toString("base64")
    .replace(/=+$/u, "")}`;
  const cookie = [
    "# Netscape HTTP Cookie File",
    "# Generated for the disposable TASK-088 synthetic session.",
    "",
    `${adminUrl.hostname}\tFALSE\t/\t${
      adminUrl.protocol === "https:" ? "TRUE" : "FALSE"
    }\t${session.expires_at}\t${cookieName}\t${cookieValue}`,
    "",
  ].join("\n");
  await atomicWrite(cookiePath, cookie);
  await atomicWrite(
    runtimeMetaPath,
    JSON.stringify({ shopId, shopIdHash: expectedHash }),
  );

  console.log(
    JSON.stringify({
      status: "PASS",
      shopIdHash: expectedHash,
      sessionFileCount: 2,
      cookieFileCount: 1,
      runtimeMetaFileCount: 1,
      mode: "0600",
    }),
  );
}

main().catch((error) => {
  const code =
    error instanceof BootstrapError
      ? error.code
      : `UNEXPECTED_${error?.constructor?.name ?? "ERROR"}`;
  console.error(`[task088-bootstrap] FAIL ${code}`);
  process.exitCode = 1;
});
