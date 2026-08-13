import { NextResponse } from "next/server";
import { isWeChatSurfaceReady, resolveWeChatRuntimeConfig } from "@/server/auth/wechat-config";
import { callWeChatUserRpc } from "@/server/wechat/user-rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isWeChatSurfaceReady("mini_program", resolveWeChatRuntimeConfig())) {
    return NextResponse.json({ code: "provider_not_configured", ok: false }, { status: 503 });
  }
  const result = await callWeChatUserRpc({
    authorization: request.headers.get("authorization"),
    deviceId: request.headers.get("x-wechat-device-id"),
    params: {},
    rpc: "wechat_account_profile_v1",
  });
  return NextResponse.json(result.ok ? { account: result.data, ok: true } : result, {
    headers: { "Cache-Control": "no-store, max-age=0" },
    status: result.status,
  });
}
