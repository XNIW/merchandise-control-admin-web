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
  const session = await resolveWeChatMiniSession({
    authorization: input.authorization,
    config: resolveWeChatRuntimeConfig(),
    deviceId: input.deviceId,
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
  return data === null
    ? { code: "backend_temporary", ok: false, status: 503 }
    : { data, ok: true, status: 200 };
}
