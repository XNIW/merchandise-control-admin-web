import { NextRequest, NextResponse } from "next/server";
import {
  loginErrorUrl,
  requestOriginFromRequest,
  safeInternalNextPath,
} from "@/lib/auth/oauth-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = requestOriginFromRequest(request) || requestUrl.origin;
  const code = requestUrl.searchParams.get("code");
  const nextPath = safeInternalNextPath(requestUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      loginErrorUrl(origin, nextPath, "callback_missing_code"),
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

  return NextResponse.redirect(new URL(nextPath, origin));
}
