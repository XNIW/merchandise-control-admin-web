import { NextRequest, NextResponse } from "next/server";
import {
  loginErrorUrl,
  requestOriginFromRequest,
  safeInternalNextPath,
} from "@/lib/auth/oauth-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isWeChatLinkingReady,
  resolveWeChatRuntimeConfig,
} from "@/server/auth/wechat-config";
import {
  finalizeWeChatLinkAttempt,
  reconcileCurrentWeChatLink,
} from "@/server/auth/wechat-link-saga";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = requestOriginFromRequest(request) || requestUrl.origin;
  const code = requestUrl.searchParams.get("code");
  const nextPath = safeInternalNextPath(requestUrl.searchParams.get("next"));
  const linkAttemptId = requestUrl.searchParams.get("wechat_link_attempt");
  const linkNonce = requestUrl.searchParams.get("wechat_link_nonce");

  if (!code) {
    return NextResponse.redirect(
      loginErrorUrl(origin, nextPath, "callback_missing_code"),
    );
  }

  // Reject a partially stripped link callback before consuming the PKCE code.
  // Once exchanged, the provider identity may already be attached and the
  // application must not lose the attempt needed to finalize its audit saga.
  if ((linkAttemptId === null) !== (linkNonce === null)) {
    return NextResponse.redirect(
      loginErrorUrl(origin, nextPath, "wechat_state_invalid"),
    );
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.redirect(
      loginErrorUrl(origin, nextPath, "auth_not_configured"),
    );
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      loginErrorUrl(origin, nextPath, "callback_blocked"),
    );
  }

  const config = resolveWeChatRuntimeConfig();
  if (linkAttemptId && linkNonce) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (
      userError ||
      !userData.user ||
      !(await finalizeWeChatLinkAttempt({
        actorProfileId: userData.user.id,
        attemptId: linkAttemptId,
        config,
        nonce: linkNonce,
      }))
    ) {
      return NextResponse.redirect(
        loginErrorUrl(origin, nextPath, "wechat_temporary"),
      );
    }
  } else if (isWeChatLinkingReady(config)) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (
      userError ||
      !userData.user ||
      !(await reconcileCurrentWeChatLink(userData.user.id, config))
    ) {
      return NextResponse.redirect(
        loginErrorUrl(origin, nextPath, "wechat_temporary"),
      );
    }
  }

  return NextResponse.redirect(new URL(nextPath, origin));
}
