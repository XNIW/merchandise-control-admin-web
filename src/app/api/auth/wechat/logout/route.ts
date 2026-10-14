import { NextResponse } from "next/server";
import { resolveWeChatRuntimeConfig } from "@/server/auth/wechat-config";
import { revokeWeChatMiniSession } from "@/server/auth/wechat-mini-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && contentLength !== "0") {
    return NextResponse.json(
      { code: "validation_failed", ok: false },
      { headers, status: 400 },
    );
  }
  const revoked = await revokeWeChatMiniSession({
    authorization: request.headers.get("authorization"),
    config: resolveWeChatRuntimeConfig(),
    deviceId: request.headers.get("x-wechat-device-id"),
  });
  return NextResponse.json(
    { ok: true, revoked },
    { headers, status: 200 },
  );
}
