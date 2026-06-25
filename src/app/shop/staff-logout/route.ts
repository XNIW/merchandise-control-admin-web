import { NextRequest, NextResponse } from "next/server";
import {
  isSecureStaffWebCookie,
  logoutStaffWebSession,
  STAFF_WEB_SESSION_COOKIE,
} from "@/server/shop-admin/staff-web-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  await logoutStaffWebSession();

  const requestUrl = new URL(request.url);
  const loginUrl = new URL("/auth/login", requestUrl.origin);
  loginUrl.searchParams.set("mode", "shop-code");
  loginUrl.searchParams.set("next", "/shop");

  const response = NextResponse.redirect(loginUrl);
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
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
