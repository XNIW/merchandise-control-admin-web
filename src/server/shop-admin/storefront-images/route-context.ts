import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { resolveShopActionContext } from "../action-context";
import type { ShopAdminActionContext } from "../action-context";
import { resolveProductImageRequestActor } from "../product-images/auth";
import { storefrontImageJson } from "./contract";

type ReadyContext = Extract<ShopAdminActionContext, { status: "ready" }>;
export type StorefrontImageServiceContext = ReadyContext | {
  actorProfileId: string;
  principalKind: "personal_account";
  supabase: SupabaseClient<Database>;
};
type RouteContextResult =
  | { context: StorefrontImageServiceContext; status: "ready" }
  | { response: Response; status: "blocked" };

export async function resolveStorefrontImageRouteContext(
  request: Request,
  shopId: string,
): Promise<RouteContextResult> {
  if (request.headers.has("authorization")) {
    const mobile = await resolveProductImageRequestActor(
      request,
      shopId,
      "storefront.images.manage",
      "personal_shop_member",
    );
    if (mobile.status === "authorized" && mobile.actor.supabase) {
      return {
        context: {
          actorProfileId: mobile.actor.actorProfileId,
          principalKind: "personal_account",
          supabase: mobile.actor.supabase,
        },
        status: "ready",
      };
    }
    const code = mobile.status === "blocked" ? mobile.code : "unauthorized";
    return {
      response: storefrontImageJson(
        { code, message: "Request is not authorized.", ok: false },
        code === "not_configured" ? 503 : code === "unauthorized" ? 401 : 403,
      ),
      status: "blocked",
    };
  }

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
