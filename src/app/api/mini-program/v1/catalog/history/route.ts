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
const isoTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const entityTypes = new Set(["product", "category", "supplier"]);
const operations = new Set([
  "created",
  "updated",
  "archived",
  "restored",
  "price_changed",
  "category_changed",
  "supplier_changed",
  "image_added",
  "image_replaced",
  "image_removed",
]);
const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};
const maxHistoryRangeMs = 366 * 24 * 60 * 60 * 1_000;

function parseTimestamp(value: string | null): number | null {
  if (
    value === null ||
    value.length > 40 ||
    !isoTimestampPattern.test(value)
  ) {
    return value === null ? null : Number.NaN;
  }
  return Date.parse(value);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shopId = url.searchParams.get("shop_id") ?? "";
  const limitText = url.searchParams.get("limit") ?? "50";
  const limit = Number(limitText);
  const entityType = url.searchParams.get("entity_type");
  const operation = url.searchParams.get("operation");
  const fromAt = url.searchParams.get("from_at");
  const toAt = url.searchParams.get("to_at");
  const entityId = url.searchParams.get("entity_id");
  const beforeCreatedAt = url.searchParams.get("before_created_at");
  const beforeAuditLogId = url.searchParams.get("before_audit_log_id");
  const parsedFromAt = parseTimestamp(fromAt);
  const parsedToAt = parseTimestamp(toAt);
  const parsedBeforeCreatedAt = parseTimestamp(beforeCreatedAt);

  if (
    !uuidPattern.test(shopId) ||
    !/^[1-9]\d{0,2}$/.test(limitText) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (entityType !== null && !entityTypes.has(entityType)) ||
    (operation !== null && !operations.has(operation)) ||
    (entityId !== null && !uuidPattern.test(entityId)) ||
    !Number.isFinite(parsedFromAt ?? 0) ||
    !Number.isFinite(parsedToAt ?? 0) ||
    !Number.isFinite(parsedBeforeCreatedAt ?? 0) ||
    (fromAt !== null &&
      toAt !== null &&
      (parsedToAt! < parsedFromAt! ||
        parsedToAt! - parsedFromAt! > maxHistoryRangeMs)) ||
    (beforeCreatedAt === null) !== (beforeAuditLogId === null) ||
    (beforeAuditLogId !== null && !uuidPattern.test(beforeAuditLogId))
  ) {
    return NextResponse.json(
      { code: "validation_failed", ok: false },
      { headers: responseHeaders, status: 400 },
    );
  }

  if (!isWeChatSurfaceReady("mini_program", resolveWeChatRuntimeConfig())) {
    return NextResponse.json(
      { code: "provider_not_configured", ok: false },
      { headers: responseHeaders, status: 503 },
    );
  }

  const result = await callWeChatUserRpc({
    authorization: request.headers.get("authorization"),
    deviceId: request.headers.get("x-wechat-device-id"),
    params: {
      p_before_audit_log_id: beforeAuditLogId,
      p_before_created_at: beforeCreatedAt,
      p_entity_id: entityId,
      p_entity_type: entityType,
      p_from_at: fromAt,
      p_limit: limit,
      p_operation: operation,
      p_shop_id: shopId,
      p_to_at: toAt,
    },
    rpc: "wechat_catalog_history_page_v1",
  });

  return NextResponse.json(
    result.ok ? { events: result.data, ok: true } : result,
    { headers: responseHeaders, status: result.status },
  );
}
