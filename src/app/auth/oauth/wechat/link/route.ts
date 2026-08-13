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
  isWeChatLinkingReady,
  resolveWeChatRuntimeConfig,
} from "@/server/auth/wechat-config";
import {
  beginWeChatLinkAttempt,
  failWeChatLinkAttempt,
  reconcileWeChatLinkAttempts,
} from "@/server/auth/wechat-link-saga";

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
    return NextResponse.redirect(loginErrorUrl(origin, "/", "unsafe_next"));
  }

  const nextPath = safeInternalNextPath(requestedNext, "/account/profile");
  const config = resolveWeChatRuntimeConfig();
  if (!isWeChatLinkingReady(config)) {
    return redirectToLogin(origin, nextPath, "wechat_not_configured");
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return redirectToLogin(origin, nextPath, "oauth_not_configured");
  }
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    const response = NextResponse.redirect(
      loginErrorUrl(origin, nextPath, "oauth_blocked"),
    );
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  }

  if (!(await reconcileWeChatLinkAttempts(userData.user.id))) {
    return redirectToLogin(origin, nextPath, "wechat_temporary");
  }
  const attempt = await beginWeChatLinkAttempt({
    actorProfileId: userData.user.id,
    config,
    surface: "web",
  });
  if (!attempt) {
    return redirectToLogin(origin, nextPath, "wechat_temporary");
  }
  const callbackUrl = new URL(buildOAuthCallbackUrl(origin, nextPath));
  callbackUrl.searchParams.set("wechat_link_attempt", attempt.attemptId);
  callbackUrl.searchParams.set("wechat_link_nonce", attempt.nonce);

  const { data, error } = await supabase.auth.linkIdentity({
    provider: config.oidcProvider,
    options: { redirectTo: callbackUrl.toString() },
  });
  if (error || !data.url) {
    await failWeChatLinkAttempt({
      actorProfileId: userData.user.id,
      attemptId: attempt.attemptId,
      conflict: true,
      failureCode: "provider_start_failed",
    });
    return redirectToLogin(origin, nextPath, "wechat_identity_conflict");
  }
  if (hasMisconfiguredOAuthRedirectUrl(data.url, origin)) {
    await failWeChatLinkAttempt({
      actorProfileId: userData.user.id,
      attemptId: attempt.attemptId,
      failureCode: "redirect_misconfigured",
    });
    return redirectToLogin(origin, nextPath, "oauth_redirect_misconfigured");
  }

  const response = NextResponse.redirect(data.url);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
