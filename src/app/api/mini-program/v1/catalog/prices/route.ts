import { NextResponse } from "next/server";
import { isWeChatSurfaceReady, resolveWeChatRuntimeConfig } from "@/server/auth/wechat-config";
import { callWeChatUserRpc } from "@/server/wechat/user-rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shopId = url.searchParams.get("shop_id") ?? "";
  const productId = url.searchParams.get("product_id") ?? "";
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const beforeAt = url.searchParams.get("before_at");
  const beforeId = url.searchParams.get("before_id");
  if (!uuidPattern.test(shopId) || !uuidPattern.test(productId) || !Number.isInteger(limit) ||
    limit < 1 || limit > 100 || ((beforeAt === null) !== (beforeId === null)) ||
    (beforeAt !== null && beforeAt.length > 80) || (beforeId !== null && !uuidPattern.test(beforeId))) {
    return NextResponse.json({ code: "validation_failed", ok: false }, { status: 400 });
  }
  if (!isWeChatSurfaceReady("mini_program", resolveWeChatRuntimeConfig())) {
    return NextResponse.json({ code: "provider_not_configured", ok: false }, { status: 503 });
  }
  const result = await callWeChatUserRpc({
    authorization: request.headers.get("authorization"),
    deviceId: request.headers.get("x-wechat-device-id"),
    params: { p_before_effective_at: beforeAt, p_before_id: beforeId, p_limit: limit, p_product_id: productId, p_shop_id: shopId },
    rpc: "wechat_price_history_page_v1",
  });
  return NextResponse.json(result.ok ? { ok: true, prices: result.data } : result, {
    headers: { "Cache-Control": "no-store, max-age=0" }, status: result.status,
  });
}
