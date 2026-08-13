import { NextResponse } from "next/server";
import { isWeChatSurfaceReady, resolveWeChatRuntimeConfig } from "@/server/auth/wechat-config";
import { callWeChatUserRpc } from "@/server/wechat/user-rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shopId = url.searchParams.get("shop_id") ?? "";
  const fromDate = url.searchParams.get("from") ?? "";
  const toDate = url.searchParams.get("to") ?? "";
  if (!uuidPattern.test(shopId) || !datePattern.test(fromDate) || !datePattern.test(toDate)) {
    return NextResponse.json({ code: "validation_failed", ok: false }, { status: 400 });
  }
  if (!isWeChatSurfaceReady("mini_program", resolveWeChatRuntimeConfig())) {
    return NextResponse.json({ code: "provider_not_configured", ok: false }, { status: 503 });
  }
  const result = await callWeChatUserRpc({
    authorization: request.headers.get("authorization"),
    deviceId: request.headers.get("x-wechat-device-id"),
    params: { p_from_date: fromDate, p_shop_id: shopId, p_to_date: toDate },
    rpc: "wechat_sales_period_summary_v1",
  });
  return NextResponse.json(result.ok ? { days: result.data, ok: true } : result, {
    headers: { "Cache-Control": "no-store, max-age=0" },
    status: result.status,
  });
}
