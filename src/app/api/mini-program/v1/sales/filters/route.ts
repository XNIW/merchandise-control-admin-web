import { NextResponse } from "next/server";
import {
  isWeChatSurfaceReady,
  resolveWeChatRuntimeConfig,
} from "@/server/auth/wechat-config";
import { callWeChatUserRpc } from "@/server/wechat/user-rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shopId = url.searchParams.get("shop_id") ?? "";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (
    !uuidPattern.test(shopId) ||
    !datePattern.test(from) ||
    !datePattern.test(to)
  ) {
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
    params: { p_from_date: from, p_shop_id: shopId, p_to_date: to },
    rpc: "wechat_sales_filter_options_v1",
  });
  const filters =
    result.ok && Array.isArray(result.data) ? (result.data[0] ?? null) : null;
  return NextResponse.json(result.ok ? { filters, ok: true } : result, {
    headers: { "Cache-Control": "no-store, max-age=0" },
    status: result.status,
  });
}
