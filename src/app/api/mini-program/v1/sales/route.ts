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
const timestampPattern = /^\d{4}-\d{2}-\d{2}T[^\s]{1,40}$/;
const boundedTextPattern = /^[^\u0000-\u001f]{1,80}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shopId = url.searchParams.get("shop_id") ?? "";
  const fromDate = url.searchParams.get("from") ?? url.searchParams.get("date");
  const toDate = url.searchParams.get("to") ?? fromDate;
  const limitText = url.searchParams.get("limit") ?? "50";
  const beforeAt = url.searchParams.get("before_at");
  const beforeId = url.searchParams.get("before_id");
  const status = url.searchParams.get("status");
  const businessKind = url.searchParams.get("kind");
  const paymentMethod = url.searchParams.get("payment_method");
  const staffId = url.searchParams.get("staff_id");
  const deviceId = url.searchParams.get("device_id");
  const saleNumber = url.searchParams.get("sale_number");
  const limit = Number(limitText);
  if (
    !uuidPattern.test(shopId) ||
    !fromDate ||
    !toDate ||
    !datePattern.test(fromDate) ||
    !datePattern.test(toDate) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    ((beforeAt === null) !== (beforeId === null)) ||
    (beforeAt !== null && !timestampPattern.test(beforeAt)) ||
    (beforeId !== null && !uuidPattern.test(beforeId)) ||
    (staffId !== null && !uuidPattern.test(staffId)) ||
    (deviceId !== null && !uuidPattern.test(deviceId)) ||
    (status !== null && !["accepted", "duplicate", "conflict", "rejected"].includes(status)) ||
    (businessKind !== null && !["sale", "refund", "void"].includes(businessKind)) ||
    (paymentMethod !== null && !boundedTextPattern.test(paymentMethod)) ||
    (saleNumber !== null && !boundedTextPattern.test(saleNumber))
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
    params: {
      p_before_occurred_at: beforeAt,
      p_before_sale_id: beforeId,
      p_business_kind: businessKind,
      p_device_id: deviceId,
      p_from_date: fromDate,
      p_limit: limit,
      p_payment_method: paymentMethod,
      p_sale_number: saleNumber,
      p_shop_id: shopId,
      p_staff_id: staffId,
      p_status: status,
      p_to_date: toDate,
    },
    rpc: "wechat_sales_page_v2",
  });
  return NextResponse.json(result.ok ? { ok: true, sales: result.data } : result, {
    headers: { "Cache-Control": "no-store, max-age=0" },
    status: result.status,
  });
}
