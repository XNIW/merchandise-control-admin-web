import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
} from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import {
  resolvePosStaffManagerWebPrincipal,
  type ShopAdminPrincipalResolution,
} from "./access-principal";
import { verifyStaffCredential } from "./staff-credentials";
import {
  commitStaffWebLogin,
  lookupStaffWebLogin,
  recordStaffWebLoginFailure,
  resolveStaffWebRuntimeSession,
  revokeStaffWebRuntimeSession,
  type StaffWebRuntimeStaff,
} from "./staff-web-runtime-boundary";

export const STAFF_WEB_SESSION_COOKIE = "mc_staff_web_session";
export const STAFF_WEB_SESSION_MISSING_REASON =
  "No staff web session cookie is present.";

type JsonRecord = { [key: string]: Json | undefined };

export type StaffWebLoginInput = {
  credential: string;
  staffCode: string;
  shopCode: string;
};

export type StaffWebRequestMeta = {
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  host?: string | null;
  userAgent?: string | null;
};

export type StaffWebLoginCode =
  | "success"
  | "credential_invalid"
  | "database_error"
  | "locked"
  | "not_configured"
  | "server_admin_not_configured"
  | "shop_inactive"
  | "shop_not_found"
  | "staff_inactive"
  | "staff_not_allowed"
  | "staff_not_found"
  | "unknown_error"
  | "validation_failed";

export type StaffWebLoginResult = {
  code: StaffWebLoginCode;
  ok: boolean;
};

const SHOP_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
const STAFF_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;
const MAX_CREDENTIAL_LENGTH = 256;
const STAFF_WEB_SESSION_TTL_SECONDS = 12 * 60 * 60;
const STAFF_WEB_SECRET_LENGTH = 32;

function addSeconds(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function isFutureTimestamp(value: string | null | undefined) {
  return Boolean(value && Date.parse(value) > Date.now());
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function requestMetadata(meta: StaffWebRequestMeta): JsonRecord {
  return {
    source: "TASK-038",
    user_agent_length: meta.userAgent?.length ?? 0,
    user_agent_present: Boolean(meta.userAgent),
  };
}

function staffWebLoginResult(code: StaffWebLoginCode): StaffWebLoginResult {
  return {
    code,
    ok: code === "success",
  };
}

function parseStaffWebLoginInput(input: StaffWebLoginInput) {
  const shopCode = normalizeCode(input.shopCode);
  const staffCode = normalizeCode(input.staffCode);
  const credential = input.credential;

  if (
    !SHOP_CODE_PATTERN.test(shopCode) ||
    !STAFF_CODE_PATTERN.test(staffCode) ||
    credential.length === 0 ||
    credential.length > MAX_CREDENTIAL_LENGTH
  ) {
    return null;
  }

  return {
    attemptKeyHash: hashStaffWebSecret(`${shopCode}:${staffCode}`),
    credential,
    staffCode,
    shopCode,
  };
}

export function generateStaffWebSecret() {
  return `mcstaff_web_${randomBytes(STAFF_WEB_SECRET_LENGTH).toString("base64url")}`;
}

export function hashStaffWebSecret(secret: string) {
  return `sha256:${createHash("sha256").update(secret, "utf8").digest("hex")}`;
}

export function verifyStaffWebSecret(secret: string, expectedHash: string) {
  if (!secret || !expectedHash) {
    return false;
  }

  const candidate = Buffer.from(hashStaffWebSecret(secret), "utf8");
  const expected = Buffer.from(expectedHash, "utf8");

  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function isSecureStaffWebCookie(meta: StaffWebRequestMeta = {}) {
  return resolveStaffWebCookieSecure(meta);
}

function firstHeaderValue(value: string | null | undefined) {
  return value?.split(",")[0]?.trim() || "";
}

function hostnameFromHost(host: string) {
  if (host.startsWith("[") && host.includes("]")) {
    return host.slice(1, host.indexOf("]"));
  }

  return host.split(":")[0] ?? "";
}

function isLocalStaffWebHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

function resolveStaffWebCookieSecure(meta: StaffWebRequestMeta = {}) {
  const proto = firstHeaderValue(meta.forwardedProto);
  const host = firstHeaderValue(meta.forwardedHost ?? meta.host);
  const hostname = hostnameFromHost(host);

  if (proto === "https") {
    return true;
  }

  if (proto === "http" && isLocalStaffWebHost(hostname)) {
    return false;
  }

  if (!proto && isLocalStaffWebHost(hostname)) {
    return false;
  }

  return true;
}

async function currentStaffWebRequestMeta(): Promise<StaffWebRequestMeta> {
  try {
    const headerStore = await headers();

    return {
      forwardedHost: headerStore.get("x-forwarded-host"),
      forwardedProto: headerStore.get("x-forwarded-proto"),
      host: headerStore.get("host"),
      userAgent: headerStore.get("user-agent"),
    };
  } catch {
    return {};
  }
}

async function getSupabaseForStaffWeb() {
  const config = resolveSupabaseAdminConfig();

  if (config.status !== "configured") {
    return null;
  }

  return createSupabaseAdminClient(config);
}

async function setStaffWebCookie(
  sessionToken: string,
  expiresAt: string,
  meta: StaffWebRequestMeta,
) {
  const cookieStore = await cookies();

  cookieStore.set(STAFF_WEB_SESSION_COOKIE, sessionToken, {
    expires: new Date(expiresAt),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: resolveStaffWebCookieSecure(meta),
  });
}

async function clearStaffWebCookie(meta?: StaffWebRequestMeta) {
  const cookieStore = await cookies();
  const cookieMeta = meta ?? (await currentStaffWebRequestMeta());

  try {
    cookieStore.set(STAFF_WEB_SESSION_COOKIE, "", {
      expires: new Date(0),
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: resolveStaffWebCookieSecure(cookieMeta),
    });
  } catch {
    // Server Components cannot always mutate cookies; authorization still fails closed.
  }
}

export async function authenticateStaffManagerWebLogin(
  input: StaffWebLoginInput,
  meta: StaffWebRequestMeta = {},
): Promise<StaffWebLoginResult> {
  const supabase = await getSupabaseForStaffWeb();

  if (!supabase) {
    return staffWebLoginResult("server_admin_not_configured");
  }

  const metadata = requestMetadata(meta);
  const parsed = parseStaffWebLoginInput(input);

  if (!parsed) {
    return staffWebLoginResult("validation_failed");
  }

  try {
    const lookup = await lookupStaffWebLogin(supabase, parsed);
    if (!lookup) {
      return staffWebLoginResult("database_error");
    }
    const fail = async (
      code: StaffWebLoginCode,
      runtime: {
        affectStaff?: boolean;
        shop?: typeof lookup.shop;
        staff?: StaffWebRuntimeStaff | null;
      } = {},
    ) => {
      const failureRecorded = await recordStaffWebLoginFailure(supabase, {
        affectStaff: runtime.affectStaff,
        attemptKeyHash: parsed.attemptKeyHash,
        code,
        expectedCredentialVersion: runtime.staff?.credentialVersion,
        metadata,
        shopId: runtime.shop?.shopId,
        staffId: runtime.staff?.staffId,
      });
      return staffWebLoginResult(failureRecorded ? code : "database_error");
    };

    const shop = lookup.shop;
    const staff = lookup.staff;
    // An audited staff reset/clear makes the staff record authoritative. The
    // attempt row remains telemetry until a successful commit clears it, so a
    // stale attempt lock cannot undo an explicit administrative recovery.
    const staffStateOverridesAttemptLock =
      staff?.credentialStatus === "active" && staff.lockedUntil === null;

    if (
      isFutureTimestamp(lookup.attempt?.lockedUntil) &&
      !staffStateOverridesAttemptLock
    ) {
      return staffWebLoginResult("locked");
    }
    if (!shop) return fail("shop_not_found");
    if (shop.shopStatus !== "active") return fail("shop_inactive", { shop });
    if (!staff) return fail("staff_not_found", { shop });
    if (
      staff.credentialStatus === "locked" ||
      isFutureTimestamp(staff.lockedUntil)
    ) {
      return staffWebLoginResult("locked");
    }
    if (
      staff.status !== "active" ||
      staff.credentialStatus !== "active" ||
      staff.mustChangeCredential ||
      staff.webAccessRevokedAt ||
      !staff.credentialHash ||
      (staff.credentialExpiresAt &&
        Date.parse(staff.credentialExpiresAt) <= Date.now())
    ) {
      return fail("staff_inactive", { shop, staff });
    }
    const principal = resolvePosStaffManagerWebPrincipal({
      credentialExpiresAt: staff.credentialExpiresAt,
      credentialStatus: staff.credentialStatus,
      lockedUntil: staff.lockedUntil,
      mustChangeCredential: staff.mustChangeCredential,
      permissions: lookup.permissions,
      roleKey: staff.roleKey,
      shopCode: shop.shopCode,
      shopId: shop.shopId,
      staffCode: staff.staffCode,
      staffId: staff.staffId,
      status: staff.status,
    });
    if (principal.status !== "ready") {
      return fail("staff_not_allowed", { shop, staff });
    }
    if (!(await verifyStaffCredential(parsed.credential, staff.credentialHash))) {
      return fail("credential_invalid", { affectStaff: true, shop, staff });
    }

    const sessionToken = generateStaffWebSecret();
    const expiresAt = addSeconds(STAFF_WEB_SESSION_TTL_SECONDS);
    const committed = await commitStaffWebLogin(supabase, {
      attemptKeyHash: parsed.attemptKeyHash,
      expectedCredentialVersion: staff.credentialVersion,
      expiresAt,
      metadata,
      sessionTokenHash: hashStaffWebSecret(sessionToken),
      shopId: shop.shopId,
      staffId: staff.staffId,
    });
    if (!committed) {
      return staffWebLoginResult("database_error");
    }
    if (!committed.ok) {
      return staffWebLoginResult(
        committed.code === "locked" ? "locked" : "staff_inactive",
      );
    }
    await setStaffWebCookie(sessionToken, committed.expiresAt, meta);

    return staffWebLoginResult("success");
  } catch {
    return staffWebLoginResult("unknown_error");
  }
}

export async function resolveStaffWebSessionPrincipal(): Promise<ShopAdminPrincipalResolution> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(STAFF_WEB_SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return {
      reason: STAFF_WEB_SESSION_MISSING_REASON,
      status: "no_session",
    };
  }

  const supabase = await getSupabaseForStaffWeb();

  if (!supabase) {
    return {
      reason: "Supabase admin runtime is not configured for staff web sessions.",
      status: "not_configured",
    };
  }

  const sessionTokenHash = hashStaffWebSecret(sessionToken);
  const runtimeResult = await resolveStaffWebRuntimeSession(
    supabase,
    sessionTokenHash,
  );

  if (runtimeResult.kind === "failed") {
    return {
      reason: "Staff web session could not be verified.",
      status: "error",
    };
  }

  if (runtimeResult.kind !== "ok") {
    await clearStaffWebCookie();
    return {
      reason:
        runtimeResult.kind === "expired"
          ? "Staff web session has expired."
          : "Staff web session is no longer active.",
      status:
        runtimeResult.kind === "expired"
          ? "session_expired"
          : "no_active_session",
    };
  }

  const runtime = runtimeResult.runtime;

  const principal = resolvePosStaffManagerWebPrincipal({
    credentialExpiresAt: runtime.staff.credentialExpiresAt,
    credentialStatus: runtime.staff.credentialStatus,
    lockedUntil: runtime.staff.lockedUntil,
    mustChangeCredential: runtime.staff.mustChangeCredential,
    permissions: runtime.permissions,
    roleKey: runtime.staff.roleKey,
    companyRut: runtime.shop.companyRut,
    shopCode: runtime.shop.shopCode,
    shopId: runtime.shop.shopId,
    shopName: runtime.shop.shopName,
    shopStatus: runtime.shop.shopStatus,
    staffCode: runtime.staff.staffCode,
    staffId: runtime.staff.staffId,
    staffWebSession: {
      credentialVersion: runtime.staff.credentialVersion,
      expiresAt: runtime.expiresAt,
      issuedAt: runtime.issuedAt,
      sessionId: runtime.sessionId,
      sessionTokenHash,
    },
    status: runtime.staff.status,
  });
  return principal;
}

export type StaffWebLogoutResult =
  | { code: "no_session" | "revoked" | "session_not_found"; ok: true }
  | { code: "not_configured" | "revocation_failed"; ok: false };

export async function logoutStaffWebSession(): Promise<StaffWebLogoutResult> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(STAFF_WEB_SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return { code: "no_session", ok: true };
  }

  const supabase = await getSupabaseForStaffWeb();

  if (!supabase) {
    return { code: "not_configured", ok: false };
  }

  const result = await revokeStaffWebRuntimeSession(supabase, {
    reason: "staff_web_logout",
    recordLogout: true,
    sessionTokenHash: hashStaffWebSecret(sessionToken),
  });

  if (result === "failed") {
    return { code: "revocation_failed", ok: false };
  }

  return {
    code: result === "revoked" ? "revoked" : "session_not_found",
    ok: true,
  };
}
