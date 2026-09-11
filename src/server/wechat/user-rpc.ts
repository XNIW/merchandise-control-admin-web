import "server-only";

import { resolveWeChatRuntimeConfig } from "@/server/auth/wechat-config";
import {
  callTrustedWeChatRpc,
  resolveWeChatMiniSession,
} from "@/server/auth/wechat-mini-session";

const allowedRpcs = new Set([
  "wechat_account_profile_v1",
  "wechat_authorized_shops_v2",
  "wechat_catalog_history_page_v1",
  "wechat_catalog_lifecycle_page_v2",
  "wechat_catalog_page_v1",
  "wechat_categories_page_v1",
  "wechat_daily_sales_page_v1",
  "wechat_daily_sales_summary_v1",
  "wechat_price_history_page_v1",
  "wechat_product_detail_v1",
  "wechat_sale_detail_v1",
  "wechat_sale_detail_v2",
  "wechat_sales_page_v2",
  "wechat_sales_filter_options_v1",
  "wechat_sales_period_summary_v1",
  "wechat_suppliers_page_v1",
  "wechat_sync_history_page_v1",
]);

function shopRecord(value: unknown): value is Record<string, unknown> & { shop_id: string } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) &&
    "shop_id" in value && typeof value.shop_id === "string");
}

export type WeChatUserRpcResult =
  | { data: unknown; ok: true; status: 200 }
  | {
      code: "backend_temporary" | "session_expired";
      ok: false;
      status: 401 | 503;
    };

export async function callWeChatUserRpc(input: {
  authorization: string | null;
  deviceId: string | null;
  params: Record<string, unknown>;
  rpc: string;
}): Promise<WeChatUserRpcResult> {
  if (!allowedRpcs.has(input.rpc)) {
    return { code: "backend_temporary", ok: false, status: 503 };
  }
  const config = resolveWeChatRuntimeConfig();
  const session = await resolveWeChatMiniSession({
    authorization: input.authorization,
    config,
    deviceId: input.deviceId,
    shopId: input.rpc === "wechat_account_profile_v1" || input.rpc === "wechat_authorized_shops_v2"
      ? undefined : input.params.p_shop_id ?? null,
  });
  if (!session.ok) {
    return {
      code: session.code,
      ok: false,
      status: session.code === "session_expired" ? 401 : 503,
    };
  }
  const data = await callTrustedWeChatRpc(
    "wechat_mini_read_v1",
    {
      p_actor_profile_id: session.actorProfileId,
      p_params: input.params,
      p_rpc: input.rpc,
    },
    5_000,
    131_072,
  );
  if (input.rpc === "wechat_authorized_shops_v2" && data !== null) {
    if (!Array.isArray(data) || !data.every(shopRecord)) {
      return { code: "backend_temporary", ok: false, status: 503 };
    }
    const shops = data.filter((row) => config.miniAllowedShopIds.includes(row.shop_id.toLowerCase()))
      .map((row) => ({ ...row,
        can_write_products: config.miniCatalogMutationsEnabled && row.can_write_products === true,
        can_write_categories: config.miniCatalogMutationsEnabled && row.can_write_categories === true,
        can_write_suppliers: config.miniCatalogMutationsEnabled && row.can_write_suppliers === true,
        can_change_prices: config.miniCatalogMutationsEnabled && row.can_change_prices === true,
        can_manage_images: config.miniCatalogMutationsEnabled && row.can_manage_images === true,
      }));
    return { data: shops, ok: true, status: 200 };
  }
  return data === null
    ? { code: "backend_temporary", ok: false, status: 503 }
    : { data, ok: true, status: 200 };
}
