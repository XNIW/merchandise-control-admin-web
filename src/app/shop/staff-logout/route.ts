import { NextRequest, NextResponse } from "next/server";
import {
  isSameOriginPostRequest,
  requestOriginFromRequest,
} from "@/lib/auth/oauth-redirect";
import {
  isSecureStaffWebCookie,
  logoutStaffWebSession,
  STAFF_WEB_SESSION_COOKIE,
} from "@/server/shop-admin/staff-web-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  let logout: Awaited<ReturnType<typeof logoutStaffWebSession>>;

  try {
    logout = await logoutStaffWebSession();
  } catch {
    return noStoreFailure("logout_failed", 503);
  }

  if (!logout.ok) {
    return noStoreFailure("logout_failed", 503);
  }

  const requestUrl = new URL(request.url);
  const origin = requestOriginFromRequest(request) || requestUrl.origin;
  const loginUrl = new URL("/auth/login", origin);
  loginUrl.searchParams.set("mode", "shop-code");
  loginUrl.searchParams.set("next", "/shop");

  const response = NextResponse.redirect(loginUrl, 303);
  response.cookies.set(STAFF_WEB_SESSION_COOKIE, "", {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: isSecureStaffWebCookie({
      forwardedHost: request.headers.get("x-forwarded-host"),
      forwardedProto: request.headers.get("x-forwarded-proto"),
      host: request.headers.get("host"),
      userAgent: request.headers.get("user-agent"),
    }),
  });
  return hardenSuccessfulLogoutResponse(response);
}
