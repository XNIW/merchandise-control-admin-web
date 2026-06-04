import { NextRequest, NextResponse } from "next/server";
import { logoutStaffWebSession } from "@/server/shop-admin/staff-web-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  await logoutStaffWebSession();

  const requestUrl = new URL(request.url);
  const loginUrl = new URL("/shop/staff-login", requestUrl.origin);
  loginUrl.searchParams.set("logged_out", "1");

  return NextResponse.redirect(loginUrl);
}
