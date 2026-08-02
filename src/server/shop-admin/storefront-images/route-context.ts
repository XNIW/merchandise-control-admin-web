import "server-only";

import { resolveShopActionContext } from "../action-context";
import type { ShopAdminActionContext } from "../action-context";
import { storefrontImageJson } from "./contract";

type ReadyContext = Extract<ShopAdminActionContext, { status: "ready" }>;
type RouteContextResult =
  | { context: ReadyContext; status: "ready" }
  | { response: Response; status: "blocked" };

export async function resolveStorefrontImageRouteContext(
  shopId: string,
): Promise<RouteContextResult> {
  const context = await resolveShopActionContext(
    shopId,
    "storefront.images.manage",
  );
  if (context.status === "ready") return { context, status: "ready" };
  const status =
    context.result.code === "not_configured"
      ? 503
      : context.result.code === "no_active_session" ||
          context.result.code === "session_expired"
        ? 401
        : 403;
  return {
    response: storefrontImageJson(
      {
        code: context.result.code,
        message: "Request is not authorized.",
        ok: false,
      },
      status,
    ),
    status: "blocked",
  };
}
