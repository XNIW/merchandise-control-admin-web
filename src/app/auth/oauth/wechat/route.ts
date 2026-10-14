import { NextRequest, NextResponse } from "next/server";
import {
  buildOAuthCallbackUrl,
  hasMisconfiguredOAuthRedirectUrl,
  hasUnsafeInternalNextPath,
  loginErrorUrl,
  loginResultUrl,
  requestOriginFromRequest,
  safeInternalNextPath,
} from "@/lib/auth/oauth-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isWeChatSurfaceReady,
  resolveWeChatRuntimeConfig,
} from "@/server/auth/wechat-config";

export const dynamic = "force-dynamic";

function redirectToLogin(
  origin: string,
  nextPath: string,
  result: Parameters<typeof loginResultUrl>[1],
) {
  const response = NextResponse.redirect(
    new URL(loginResultUrl(nextPath, result), origin),
  );
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
  const config = resolveWeChatRuntimeConfig();
  if (!isWeChatSurfaceReady("web", config)) {
    return redirectToLogin(origin, nextPath, "wechat_not_configured");
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return redirectToLogin(origin, nextPath, "oauth_not_configured");
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: config.oidcProvider,
    options: {
      redirectTo: buildOAuthCallbackUrl(origin, nextPath),
    },
  });

  if (error || !data.url) {
    return redirectToLogin(origin, nextPath, "wechat_temporary");
  }
  if (hasMisconfiguredOAuthRedirectUrl(data.url, origin)) {
    return redirectToLogin(origin, nextPath, "oauth_redirect_misconfigured");
  }

  const response = NextResponse.redirect(data.url);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
