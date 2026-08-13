import { NextResponse } from "next/server";
import { isWeChatSurfaceReady, resolveWeChatRuntimeConfig } from "@/server/auth/wechat-config";
import { callWeChatUserRpc } from "@/server/wechat/user-rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shopId = url.searchParams.get("shop_id") ?? "";
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const beforeIdText = url.searchParams.get("before_id");
  const beforeId = beforeIdText === null ? null : Number(beforeIdText);
  if (!uuidPattern.test(shopId) || !Number.isInteger(limit) || limit < 1 || limit > 100 ||
    (beforeId !== null && (!Number.isSafeInteger(beforeId) || beforeId < 1))) {
    return NextResponse.json({ code: "validation_failed", ok: false }, { status: 400 });
  }
  if (!isWeChatSurfaceReady("mini_program", resolveWeChatRuntimeConfig())) {
    return NextResponse.json({ code: "provider_not_configured", ok: false }, { status: 503 });
  }
  const result = await callWeChatUserRpc({ authorization: request.headers.get("authorization"),
    deviceId: request.headers.get("x-wechat-device-id"),
    params: { p_before_id: beforeId, p_limit: limit, p_shop_id: shopId },
    rpc: "wechat_sync_history_page_v1" });
  return NextResponse.json(result.ok ? { events: result.data, ok: true } : result,
    { headers: { "Cache-Control": "no-store, max-age=0" }, status: result.status });
}
