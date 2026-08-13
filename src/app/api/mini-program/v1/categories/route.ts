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
  const search = url.searchParams.get("search");
  const afterName = url.searchParams.get("after_name");
  const afterId = url.searchParams.get("after_id");
  if (!uuidPattern.test(shopId) || !Number.isInteger(limit) || limit < 1 || limit > 100 ||
    (search !== null && (search.length < 1 || search.length > 80)) ||
    ((afterName === null) !== (afterId === null)) || (afterName !== null && afterName.length > 200) ||
    (afterId !== null && !uuidPattern.test(afterId))) {
    return NextResponse.json({ code: "validation_failed", ok: false }, { status: 400 });
  }
  if (!isWeChatSurfaceReady("mini_program", resolveWeChatRuntimeConfig())) {
    return NextResponse.json({ code: "provider_not_configured", ok: false }, { status: 503 });
  }
  const result = await callWeChatUserRpc({ authorization: request.headers.get("authorization"),
    deviceId: request.headers.get("x-wechat-device-id"),
    params: { p_after_id: afterId, p_after_name: afterName, p_limit: limit, p_search: search, p_shop_id: shopId },
    rpc: "wechat_categories_page_v1" });
  return NextResponse.json(result.ok ? { categories: result.data, ok: true } : result,
    { headers: { "Cache-Control": "no-store, max-age=0" }, status: result.status });
}
