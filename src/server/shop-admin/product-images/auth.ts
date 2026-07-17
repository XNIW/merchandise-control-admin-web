import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
} from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import {
  createSupabaseServerClient,
  resolveSupabaseServerConfig,
} from "@/lib/supabase/server";
import { canShopAdmin, type ShopAdminPermission } from "../permissions";

export type ProductImageActorKind = "personal_account" | "platform_admin";

export type ProductImageRequestActor = {
  actorKind: ProductImageActorKind;
  actorProfileId: string;
  shopId: string;
};

export type ProductImageActorResolution =
  | { actor: ProductImageRequestActor; status: "authorized" }
  | {
      actorKind?: ProductImageActorKind;
      actorProfileId?: string;
      code: "not_configured" | "permission_denied" | "unauthorized";
      status: "blocked";
    };

function readBearerToken(header: string | null) {
  if (!header) {
    return { present: false as const, token: null };
  }

  const [scheme, token, extra] = header.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token || extra) {
    return { present: true as const, token: null };
  }

  return { present: true as const, token };
}

async function resolveAuthenticatedUserId(request: Request) {
  const serverConfig = resolveSupabaseServerConfig();

  if (serverConfig.status !== "configured") {
    return { code: "not_configured" as const, userId: null };
  }

  const bearer = readBearerToken(request.headers.get("authorization"));

  if (bearer.present && !bearer.token) {
    return { code: "unauthorized" as const, userId: null };
  }

  const client = bearer.token
    ? createClient<Database>(serverConfig.url, serverConfig.publishableKey, {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
        global: {
          headers: {
            Authorization: `Bearer ${bearer.token}`,
            "X-Client-Info": "merchandise-control-admin-web/product-images",
          },
        },
      })
    : await createSupabaseServerClient(serverConfig);

  if (!client) {
    return { code: "not_configured" as const, userId: null };
  }

  const userResult = await client.auth.getUser();

  return userResult.error || !userResult.data.user?.id
    ? { code: "unauthorized" as const, userId: null }
    : { code: "authorized" as const, userId: userResult.data.user.id };
}

export async function resolveProductImageRequestActor(
  request: Request,
  shopId: string,
  permission: Extract<ShopAdminPermission, "products.read" | "products.write">,
): Promise<ProductImageActorResolution> {
  const identity = await resolveAuthenticatedUserId(request);

  if (!identity.userId) {
    return {
      code:
        identity.code === "not_configured"
          ? "not_configured"
          : "unauthorized",
      status: "blocked",
    };
  }

  const adminConfig = resolveSupabaseAdminConfig();
  const admin =
    adminConfig.status === "configured"
      ? createSupabaseAdminClient(adminConfig)
      : null;

  if (!admin) {
    return {
      actorProfileId: identity.userId,
      code: "not_configured",
      status: "blocked",
    };
  }

  const [profileResult, shopResult, membershipResult, platformResult] =
    await Promise.all([
      admin
        .from("profiles")
        .select("profile_id,profile_status")
        .eq("profile_id", identity.userId)
        .maybeSingle(),
      admin
        .from("shops")
        .select("shop_id,shop_status")
        .eq("shop_id", shopId)
        .maybeSingle(),
      admin
        .from("shop_members")
        .select("role_key,membership_status")
        .eq("profile_id", identity.userId)
        .eq("shop_id", shopId)
        .maybeSingle(),
      admin
        .from("platform_admins")
        .select("status,revoked_at")
        .eq("profile_id", identity.userId)
        .eq("status", "active")
        .is("revoked_at", null)
        .maybeSingle(),
    ]);

  if (
    profileResult.error ||
    shopResult.error ||
    membershipResult.error ||
    platformResult.error
  ) {
    return {
      actorProfileId: identity.userId,
      code: "not_configured",
      status: "blocked",
    };
  }

  if (
    profileResult.data?.profile_status !== "active" ||
    shopResult.data?.shop_status !== "active"
  ) {
    return {
      actorProfileId: identity.userId,
      code: "permission_denied",
      status: "blocked",
    };
  }

  if (platformResult.data) {
    return {
      actor: {
        actorKind: "platform_admin",
        actorProfileId: identity.userId,
        shopId,
      },
      status: "authorized",
    };
  }

  const membership = membershipResult.data;
  const role =
    membership?.role_key === "shop_owner" ||
    membership?.role_key === "shop_manager" ||
    membership?.role_key === "viewer"
      ? membership.role_key
      : null;

  if (
    membership?.membership_status !== "active" ||
    !role ||
    !canShopAdmin(role, permission)
  ) {
    return {
      actorKind: "personal_account",
      actorProfileId: identity.userId,
      code: "permission_denied",
      status: "blocked",
    };
  }

  return {
    actor: {
      actorKind: "personal_account",
      actorProfileId: identity.userId,
      shopId,
    },
    status: "authorized",
  };
}
