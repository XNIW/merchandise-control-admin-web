import { NextRequest, NextResponse } from "next/server";
import {
  buildOAuthCallbackUrl,
  hasInvalidGoogleOAuthClientIdLocation,
  hasMisconfiguredOAuthRedirectUrl,
  hasUnsafeInternalNextPath,
  isGoogleOAuthAccountsLocation,
  isOAuthProviderNotEnabledBody,
  loginErrorUrl,
  loginResultUrl,
  requestOriginFromRequest,
  safeInternalNextPath,
} from "@/lib/auth/oauth-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const oauthAuthorizeProbeTimeoutMs = 3_000;

async function probeOAuthAuthorizeUrl(oauthUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, oauthAuthorizeProbeTimeoutMs);

  try {
    const response = await fetch(oauthUrl, {
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");

      if (!isGoogleOAuthAccountsLocation(location)) {
        return "blocked";
      }

      if (hasInvalidGoogleOAuthClientIdLocation(location)) {
        return "client_id_invalid";
      }

      return "redirect";
    }

    if (response.status === 400) {
      const body = await response.text();

      return isOAuthProviderNotEnabledBody(body)
        ? "provider_not_enabled"
        : "blocked";
    }

    return response.status >= 400 ? "blocked" : "passthrough";
  } catch {
    return "blocked";
  } finally {
    clearTimeout(timeout);
  }
}

function redirectToLogin(origin: string, nextPath: string, result: Parameters<typeof loginResultUrl>[1]) {
  const response = NextResponse.redirect(new URL(loginResultUrl(nextPath, result), origin));
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = requestOriginFromRequest(request) || requestUrl.origin;
  const requestedNext = requestUrl.searchParams.get("next");

  if (hasUnsafeInternalNextPath(requestedNext)) {
    const response = NextResponse.redirect(
      loginErrorUrl(origin, "/", "unsafe_next"),
    );
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  }

  const nextPath = safeInternalNextPath(requestedNext, "/shop");
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return redirectToLogin(origin, nextPath, "oauth_not_configured");
  }

  if (!origin) {
    return redirectToLogin(origin, nextPath, "oauth_origin_missing");
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: buildOAuthCallbackUrl(origin, nextPath),
    },
  });

  if (error || !data.url) {
    return redirectToLogin(origin, nextPath, "oauth_blocked");
  }

  if (hasMisconfiguredOAuthRedirectUrl(data.url, origin)) {
    return redirectToLogin(origin, nextPath, "oauth_redirect_misconfigured");
  }

  const authorizeProbe = await probeOAuthAuthorizeUrl(data.url);

  if (authorizeProbe === "client_id_invalid") {
    return redirectToLogin(origin, nextPath, "oauth_google_client_id_invalid");
  }

  if (authorizeProbe === "provider_not_enabled") {
    return redirectToLogin(origin, nextPath, "oauth_provider_not_enabled");
  }

  if (authorizeProbe === "blocked") {
    return redirectToLogin(origin, nextPath, "oauth_blocked");
  }

  const response = NextResponse.redirect(data.url);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
