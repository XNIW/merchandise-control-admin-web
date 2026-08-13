import { isWeChatSurfaceReady, resolveWeChatRuntimeConfig } from "@/server/auth/wechat-config";
import { getWeChatMiniSyncCheckpoint } from "@/server/wechat/sync-gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  if (!isWeChatSurfaceReady("mini_program", resolveWeChatRuntimeConfig())) {
    return Response.json(
      { code: "provider_not_configured", ok: false },
      { headers: responseHeaders, status: 503 },
    );
  }
  const url = new URL(request.url);
  const result = await getWeChatMiniSyncCheckpoint({
    afterId: url.searchParams.get("after_id") ?? "0",
    authorization: request.headers.get("authorization"),
    deviceId: request.headers.get("x-wechat-device-id"),
    expectedScopeKey: url.searchParams.get("scope_key"),
    lastReconciledAt: url.searchParams.get("last_reconciled_at"),
    shopId: url.searchParams.get("shop_id") ?? "",
  });
  return Response.json(
    result.ok ? { checkpoint: result.data, ok: true } : result,
    { headers: responseHeaders, status: result.status },
  );
}
