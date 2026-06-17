#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { parseSupabaseStatusEnv } from "./target-guardrails.mjs";

const prefix = "[task-065-oauth-local]";
const authorizeTimeoutMs = 3_000;
const googleProbeTimeoutMs = 5_000;
const defaultAppOrigin = "http://127.0.0.1:3050";

function log(status, message) {
  console.log(`${prefix} ${status} ${message}`);
}

function finish(status, code, message, exitCode) {
  const output = `${prefix} ${status} ${code}: ${message}`;

  if (exitCode === 0) {
    console.log(output);
  } else {
    console.error(output);
  }

  process.exit(exitCode);
}

function blockedExternalConfig(code, message) {
  finish("BLOCKED_EXTERNAL_CONFIG", code, message, 3);
}

function failCodeRegression(code, message) {
  finish("FAIL_CODE_REGRESSION", code, message, 2);
}

function localSupabaseUrl(value) {
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

function loadLocalSupabaseUrl() {
  const explicitUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (explicitUrl) {
    return explicitUrl;
  }

  try {
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

    return values.API_URL ?? "";
  } catch {
    return "";
  }
}

function providerNotEnabled(body) {
  return /Unsupported provider|provider is not enabled/i.test(body);
}

function googleAccountsLocation(location) {
  if (!location) {
    return false;
  }

  try {
    const parsed = new URL(location);

    return parsed.protocol === "https:" && parsed.hostname === "accounts.google.com";
  } catch {
    return false;
  }
}

function googleClientId(location) {
  try {
    const parsed = new URL(location ?? "");

    return parsed.searchParams.get("client_id") ?? "";
  } catch {
    return "";
  }
}

function redirectTargets() {
  const explicitRedirect = process.env.TASK065_OAUTH_REDIRECT_TO?.trim();

  if (explicitRedirect) {
    return [explicitRedirect];
  }

  return ["/platform", "/shop"].map((nextPath) => {
    const callbackUrl = new URL("/auth/callback", defaultAppOrigin);
    callbackUrl.searchParams.set("next", nextPath);

    return callbackUrl.toString();
  });
}

async function fetchAuthorizeUrl(authorizeUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, authorizeTimeoutMs);

  try {
    return await fetch(authorizeUrl, {
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
  } catch {
    blockedExternalConfig(
      "GOOGLE_AUTHORIZE_UNREACHABLE",
      "Local Supabase Auth authorize endpoint could not be reached within the OAuth smoke timeout.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyGoogleOAuthLocation(location) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, googleProbeTimeoutMs);

  try {
    const response = await fetch(location, {
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
    const nextLocation = response.headers.get("location") ?? response.url ?? "";

    if (response.status >= 400) {
      const body = await response.text();
      const bodyClass = /invalid_client|redirect_uri_mismatch|error 400/i.test(body)
        ? "Google OAuth configuration error"
        : `Google returned HTTP ${response.status}`;

      blockedExternalConfig(
        "GOOGLE_OAUTH_ERROR_PAGE",
        `${bodyClass}. Check the Google OAuth client and authorized redirect URI settings.`,
      );
    }

    if (/\/signin\/oauth\/error/i.test(nextLocation)) {
      blockedExternalConfig(
        "GOOGLE_OAUTH_ERROR_PAGE",
        "Google returned an OAuth error page for the configured client ID. Check the Google OAuth client and authorized redirect URI settings.",
      );
    }
  } catch {
    blockedExternalConfig(
      "GOOGLE_OAUTH_LOCATION_UNREACHABLE",
      "The Google OAuth location could not be probed within the OAuth smoke timeout.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function checkRedirectTo(supabaseUrl, redirectTo) {
  const authorizeUrl = new URL("/auth/v1/authorize", supabaseUrl);
  authorizeUrl.searchParams.set("provider", "google");
  authorizeUrl.searchParams.set("redirect_to", redirectTo);

  const response = await fetchAuthorizeUrl(authorizeUrl);

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    const clientId = googleClientId(location);

    if (location && /vercel\.app/i.test(location)) {
      failCodeRegression(
        "GOOGLE_REDIRECT_VERCEL",
        "Local Supabase Auth redirected Google OAuth through a stale Vercel URL.",
      );
    }

    if (
      googleAccountsLocation(location) &&
      (!clientId ||
        /^env\(/i.test(clientId) ||
        !clientId.endsWith(".apps.googleusercontent.com"))
    ) {
      blockedExternalConfig(
        "GOOGLE_CLIENT_ID_PLACEHOLDER",
        "Local Supabase Auth redirected to Google with a missing or placeholder OAuth client ID. Export real Google OAuth env values and restart Supabase.",
      );
    }

    if (googleAccountsLocation(location)) {
      await verifyGoogleOAuthLocation(location);
      return;
    }

    failCodeRegression(
      "GOOGLE_REDIRECT_LOCATION_UNEXPECTED",
      "Local Supabase Auth returned a redirect, but not to accounts.google.com.",
    );
  }

  if (response.status === 400) {
    const body = await response.text();

    if (providerNotEnabled(body)) {
      blockedExternalConfig(
        "GOOGLE_PROVIDER_NOT_ENABLED",
        "Local Supabase Auth returned provider is not enabled. Set SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID and SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET, then restart Supabase.",
      );
    }

    failCodeRegression(
      "GOOGLE_AUTHORIZE_400",
      "Local Supabase Auth returned HTTP 400 for Google authorize.",
    );
  }

  failCodeRegression(
    "GOOGLE_AUTHORIZE_UNEXPECTED_STATUS",
    `Local Supabase Auth returned HTTP ${response.status} for Google authorize.`,
  );
}

const supabaseUrl = loadLocalSupabaseUrl();

if (!localSupabaseUrl(supabaseUrl)) {
  blockedExternalConfig(
    "BLOCKED_LOCAL_SUPABASE_REQUIRED",
    "Local Supabase Auth must be reachable at http://127.0.0.1:54321 or localhost:54321.",
  );
}

const targets = redirectTargets();

for (const redirectTo of targets) {
  await checkRedirectTo(supabaseUrl, redirectTo);
}

log(
  "PASS",
  `local Supabase Google provider redirects to accounts.google.com for ${targets.length} app callback target(s)`,
);
