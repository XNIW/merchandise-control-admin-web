import { NextResponse } from "next/server";
import {
  isWeChatSurfaceReady,
  resolveWeChatRuntimeConfig,
} from "@/server/auth/wechat-config";
import { callWeChatUserRpc } from "@/server/wechat/user-rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shopId = url.searchParams.get("shop_id") ?? "";
  const date = url.searchParams.get("date");
  if (!uuidPattern.test(shopId) || (date !== null && !datePattern.test(date))) {
    return NextResponse.json(
      { code: "validation_failed", ok: false },
      { status: 400 },
    );
  }
  if (!isWeChatSurfaceReady("mini_program", resolveWeChatRuntimeConfig())) {
    return NextResponse.json(
      { code: "provider_not_configured", ok: false },
      { status: 503 },
    );
  }
  const result = await callWeChatUserRpc({
    authorization: request.headers.get("authorization"),
    deviceId: request.headers.get("x-wechat-device-id"),
    params: { p_business_date: date, p_shop_id: shopId },
    rpc: "wechat_daily_sales_summary_v1",
  });
  return NextResponse.json(result.ok ? { ok: true, summary: result.data } : result, {
    headers: { "Cache-Control": "no-store, max-age=0" },
    status: result.status,
  });
}
