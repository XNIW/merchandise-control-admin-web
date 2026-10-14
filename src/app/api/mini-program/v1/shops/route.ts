import { NextResponse } from "next/server";
import {
  isWeChatSurfaceReady,
  resolveWeChatRuntimeConfig,
} from "@/server/auth/wechat-config";
import { callWeChatUserRpc } from "@/server/wechat/user-rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  if (!isWeChatSurfaceReady("mini_program", resolveWeChatRuntimeConfig())) {
    return NextResponse.json(
      { code: "provider_not_configured", ok: false },
      { headers: responseHeaders, status: 503 },
    );
  }
  const result = await callWeChatUserRpc({
    authorization: request.headers.get("authorization"),
    deviceId: request.headers.get("x-wechat-device-id"),
    params: {},
    rpc: "wechat_authorized_shops_v2",
  });
  return NextResponse.json(result.ok ? { ok: true, shops: result.data } : result, {
    headers: responseHeaders,
    status: result.status,
  });
}
