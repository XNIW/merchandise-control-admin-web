import { NextResponse } from "next/server";
import { isWeChatSurfaceReady, resolveWeChatRuntimeConfig } from "@/server/auth/wechat-config";
import { callWeChatUserRpc } from "@/server/wechat/user-rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T[^\s]{1,40}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shopId = url.searchParams.get("shop_id") ?? "";
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const search = url.searchParams.get("search");
  const categoryId = url.searchParams.get("category_id");
  const supplierId = url.searchParams.get("supplier_id");
  const hasImageText = url.searchParams.get("has_image");
  const sort = url.searchParams.get("sort") ?? "updated_desc";
  const cursorAt = url.searchParams.get("cursor_at");
  const cursorText = url.searchParams.get("cursor_text");
  const cursorId = url.searchParams.get("cursor_id");
  if (
    !uuidPattern.test(shopId) || !Number.isInteger(limit) || limit < 1 || limit > 100 ||
    (search !== null && (search.length < 1 || search.length > 80)) ||
    (categoryId !== null && !uuidPattern.test(categoryId)) ||
    (supplierId !== null && !uuidPattern.test(supplierId)) ||
    (hasImageText !== null && !["true", "false"].includes(hasImageText)) ||
    !["updated_desc", "name_asc", "barcode_asc"].includes(sort) ||
    (cursorAt !== null && !timestampPattern.test(cursorAt)) ||
    (cursorText !== null && cursorText.length > 200) ||
    ((cursorAt !== null || cursorText !== null) !== (cursorId !== null)) ||
    (cursorId !== null && !uuidPattern.test(cursorId))
  ) {
    return NextResponse.json({ code: "validation_failed", ok: false }, { status: 400 });
  }
  if (!isWeChatSurfaceReady("mini_program", resolveWeChatRuntimeConfig())) {
    return NextResponse.json({ code: "provider_not_configured", ok: false }, { status: 503 });
  }
  const result = await callWeChatUserRpc({
    authorization: request.headers.get("authorization"),
    deviceId: request.headers.get("x-wechat-device-id"),
    params: {
      p_category_id: categoryId, p_cursor_at: cursorAt, p_cursor_id: cursorId,
      p_cursor_text: cursorText, p_has_image: hasImageText === null ? null : hasImageText === "true",
      p_limit: limit, p_search: search, p_shop_id: shopId, p_sort: sort, p_supplier_id: supplierId,
    },
    rpc: "wechat_catalog_page_v1",
  });
  return NextResponse.json(result.ok ? { ok: true, products: result.data } : result, {
    headers: { "Cache-Control": "no-store, max-age=0" }, status: result.status,
  });
}
