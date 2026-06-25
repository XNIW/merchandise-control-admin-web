export type OAuthLoginResultCode =
  | "callback_blocked"
  | "callback_missing_code"
  | "auth_not_configured"
  | "oauth_blocked"
  | "oauth_google_client_id_invalid"
  | "oauth_not_configured"
  | "oauth_origin_missing"
  | "oauth_provider_not_enabled"
  | "oauth_redirect_misconfigured"
  | "unsafe_next";

export function isSafeInternalNextPath(
  value: string | null | undefined,
): value is string {
  return Boolean(
    value?.startsWith("/") &&
      !value.startsWith("//") &&
      !value.includes("\\") &&
      !/[\u0000-\u001F\u007F]/.test(value),
  );
}

export function safeInternalNextPath(
  value: string | null | undefined,
  fallback = "/",
) {
  return isSafeInternalNextPath(value) ? value : fallback;
}

export function hasUnsafeInternalNextPath(value: string | null | undefined) {
  return Boolean(value && !isSafeInternalNextPath(value));
}

export function isSafeShopAdminNextPath(
  value: string | null | undefined,
): value is string {
  return Boolean(
    isSafeInternalNextPath(value) &&
      (value === "/shop" ||
        value.startsWith("/shop/") ||
        value.startsWith("/shop?")),
  );
}

export function safeShopAdminNextPath(
  value: string | null | undefined,
  fallback = "/shop",
) {
  return isSafeShopAdminNextPath(value) ? value : fallback;
}

export function firstHeaderValue(value: string | null | undefined) {
  return value?.split(",")[0]?.trim() || "";
}

export function safeHttpOrigin(value: string | null | undefined) {
  const origin = firstHeaderValue(value);

  if (!origin) {
    return "";
  }

  try {
    const parsed = new URL(origin);

    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.origin
      : "";
  } catch {
    return "";
  }
}

function forwardedProto(headers: { get(name: string): string | null }) {
  const proto = firstHeaderValue(headers.get("x-forwarded-proto"));

  if (proto === "https" || proto === "http") {
    return proto;
  }

  try {
    const cfVisitor = headers.get("cf-visitor");
    const parsed = cfVisitor ? JSON.parse(cfVisitor) : null;
    const scheme = parsed?.scheme;

    return scheme === "https" || scheme === "http" ? scheme : "";
  } catch {
    return "";
  }
}

function hostnameFromHost(host: string) {
  const normalized = host.trim();

  if (normalized.startsWith("[") && normalized.includes("]")) {
    return normalized.slice(1, normalized.indexOf("]"));
  }

  return normalized.split(":")[0] ?? "";
}

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

export function requestOriginFromHeaders(headers: {
  get(name: string): string | null;
}) {
  const protoFromHeaders = forwardedProto(headers);
  const host = firstHeaderValue(
    headers.get("x-forwarded-host") ?? headers.get("host"),
  );
  const hostname = hostnameFromHost(host);
  const proto =
    protoFromHeaders || (isLocalHostname(hostname) ? "http" : "https");
  const hostOrigin = safeHttpOrigin(host ? `${proto}://${host}` : null);

  if (hostOrigin) {
    return hostOrigin;
  }

  return safeHttpOrigin(headers.get("origin"));
}

export function requestOriginFromRequest(request: {
  headers: { get(name: string): string | null };
  url: string;
}) {
  const headerOrigin = requestOriginFromHeaders(request.headers);

  if (headerOrigin) {
    return headerOrigin;
  }

  try {
    return safeHttpOrigin(new URL(request.url).origin);
  } catch {
    return "";
  }
}

export function buildOAuthCallbackUrl(origin: string, nextPath: string) {
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", safeInternalNextPath(nextPath));

  return callbackUrl.toString();
}

export function loginResultUrl(nextPath: string, result: OAuthLoginResultCode) {
  const params = new URLSearchParams({
    mode: "admin-account",
    next: safeInternalNextPath(nextPath),
    result,
  });

  return `/auth/login?${params.toString()}`;
}

export function loginErrorUrl(
  origin: string,
  nextPath: string,
  error: OAuthLoginResultCode,
) {
  const loginUrl = new URL("/auth/login", origin);
  loginUrl.searchParams.set("mode", "admin-account");
  loginUrl.searchParams.set("next", safeInternalNextPath(nextPath));
  loginUrl.searchParams.set("error", error);

  return loginUrl;
}

export function isVercelHost(hostname: string) {
  return hostname === "vercel.app" || hostname.endsWith(".vercel.app");
}

export function hasMisconfiguredOAuthRedirectUrl(
  oauthUrl: string,
  currentOrigin: string,
) {
  try {
    const parsedOAuthUrl = new URL(oauthUrl);
    const currentOriginUrl = new URL(currentOrigin);

    if (isVercelHost(parsedOAuthUrl.hostname)) {
      return true;
    }

    const redirectTo = parsedOAuthUrl.searchParams.get("redirect_to");

    if (!redirectTo) {
      return false;
    }

    const parsedRedirectTo = new URL(redirectTo);

    if (parsedRedirectTo.origin !== currentOriginUrl.origin) {
      return true;
    }

    return isVercelHost(parsedRedirectTo.hostname);
  } catch {
    return true;
  }
}

export function isOAuthProviderNotEnabledBody(body: string) {
  return /Unsupported provider|provider is not enabled/i.test(body);
}

export function isGoogleOAuthAccountsLocation(
  location: string | null | undefined,
) {
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

export function hasInvalidGoogleOAuthClientIdLocation(
  location: string | null | undefined,
) {
  if (!location) {
    return true;
  }

  try {
    const parsed = new URL(location);
    const clientId = parsed.searchParams.get("client_id") ?? "";

    return (
      parsed.hostname === "accounts.google.com" &&
      (!clientId ||
        /^env\(/i.test(clientId) ||
        !clientId.endsWith(".apps.googleusercontent.com"))
    );
  } catch {
    return false;
  }
}
