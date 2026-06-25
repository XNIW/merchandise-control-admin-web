import { NextRequest, NextResponse } from "next/server";
import { safeInternalNextPath } from "@/lib/auth/oauth-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function targetFromRequest(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const requestedNext = safeInternalNextPath(
    requestUrl.searchParams.get("next"),
    "",
  );

  if (requestedNext === "/shop" || requestedNext.startsWith("/shop/")) {
    return "/shop";
  }

  if (
    requestedNext === "/platform" ||
    requestedNext.startsWith("/platform/")
  ) {
    return "/platform";
  }

  const referer = request.headers.get("referer");

  if (referer) {
    try {
      const refererPath = new URL(referer).pathname;

      if (refererPath === "/shop" || refererPath.startsWith("/shop/")) {
        return "/shop";
      }
    } catch {
      return "/platform";
    }
  }

  return "/platform";
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const nextPath = targetFromRequest(request);
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  const loginUrl = new URL("/auth/login", requestUrl.origin);
  loginUrl.searchParams.set("mode", "admin-account");
  loginUrl.searchParams.set("next", nextPath);

  const response = NextResponse.redirect(loginUrl);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
