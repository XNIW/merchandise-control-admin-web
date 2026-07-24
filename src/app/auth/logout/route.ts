import { NextRequest, NextResponse } from "next/server";
import {
  isSameOriginPostRequest,
  requestOriginFromRequest,
  safeInternalNextPath,
} from "@/lib/auth/oauth-redirect";
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

function noStoreFailure(code: "logout_failed" | "same_origin_required", status: number) {
  return NextResponse.json(
    { code },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
      status,
    },
  );
}

function hardenSuccessfulLogoutResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Clear-Site-Data", '"cache", "storage"');
  return response;
}

export async function POST(request: NextRequest) {
  if (!isSameOriginPostRequest(request)) {
    return noStoreFailure("same_origin_required", 403);
  }

  const requestUrl = new URL(request.url);
  const nextPath = targetFromRequest(request);

  try {
    const supabase = await createSupabaseServerClient();

    if (!supabase) {
      return noStoreFailure("logout_failed", 503);
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      return noStoreFailure("logout_failed", 503);
    }
  } catch {
    return noStoreFailure("logout_failed", 503);
  }

  const origin = requestOriginFromRequest(request) || requestUrl.origin;
  const loginUrl = new URL("/auth/login", origin);
  loginUrl.searchParams.set("mode", "admin-account");
  loginUrl.searchParams.set("next", nextPath);

  return hardenSuccessfulLogoutResponse(NextResponse.redirect(loginUrl, 303));
}
