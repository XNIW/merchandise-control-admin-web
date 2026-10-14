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
const lifecycleStates = new Set(["active", "archived", "all"]);
const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function isValidTimestamp(value: string | null): boolean {
  return (
    value === null ||
    (value.length <= 40 &&
      isoTimestampPattern.test(value) &&
      Number.isFinite(Date.parse(value)))
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shopId = url.searchParams.get("shop_id") ?? "";
  const entityType = url.searchParams.get("entity_type") ?? "product";
  const state = url.searchParams.get("state") ?? "all";
  const limitText = url.searchParams.get("limit") ?? "50";
  const limit = Number(limitText);
  const beforeUpdatedAt = url.searchParams.get("before_updated_at");
  const beforeId = url.searchParams.get("before_id");

  if (
    !uuidPattern.test(shopId) ||
    !entityTypes.has(entityType) ||
    !lifecycleStates.has(state) ||
    !/^[1-9]\d{0,2}$/.test(limitText) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (beforeUpdatedAt === null) !== (beforeId === null) ||
    !isValidTimestamp(beforeUpdatedAt) ||
    (beforeId !== null && !uuidPattern.test(beforeId))
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
      p_before_id: beforeId,
      p_before_updated_at: beforeUpdatedAt,
      p_entity_type: entityType,
      p_limit: limit,
      p_shop_id: shopId,
      p_state: state,
    },
    rpc: "wechat_catalog_lifecycle_page_v2",
  });

  return NextResponse.json(
    result.ok ? { entities: result.data, ok: true } : result,
    { headers: responseHeaders, status: result.status },
  );
}
