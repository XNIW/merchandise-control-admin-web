import "server-only";

import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import {
  createSupabaseServerClient,
  resolveSupabaseServerConfig,
  type SupabaseServerClient,
} from "@/lib/supabase/server";
import { resolveCurrentShopAdminPrincipal } from "./access-principal";
import type {
  ShopAdminPersonalAccountPrincipal,
  ShopAdminPosStaffManagerPrincipal,
} from "./access-principal";
import { resolveStaffWebSessionPrincipal } from "./staff-web-auth";
import type { ShopAdminShellShop } from "./shop-access";

export type ShopAdminDataClient = SupabaseAdminClient | SupabaseServerClient;

export type ShopAdminDataAccess =
  | {
      principalKind: "personal_account";
      principal: ShopAdminPersonalAccountPrincipal;
      selectedShop: ShopAdminShellShop;
      status: "ready";
      supabase: SupabaseServerClient;
    }
  | {
      principalKind: "pos_staff_manager";
      principal: ShopAdminPosStaffManagerPrincipal;
      selectedShop: ShopAdminShellShop;
      status: "ready";
      supabase: SupabaseAdminClient;
    }
  | {
      reason: string;
      status:
        | "not_configured"
        | "no_session"
        | "viewer_only"
        | "no_shop"
        | "error"
        | "unauthorized";
    };

type ResolveShopAdminDataAccessOptions = {
  client?: SupabaseServerClient | null;
  requestedShopId?: string | null;
  strictRequestedShop?: boolean;
};

type BlockedShopAdminDataAccess = Extract<
  ShopAdminDataAccess,
  { status: Exclude<ShopAdminDataAccess["status"], "ready"> }
>;

function statusForAccessState(
  status: string,
): BlockedShopAdminDataAccess["status"] {
  if (
    status === "not_configured" ||
    status === "no_session" ||
    status === "viewer_only" ||
    status === "no_shop" ||
    status === "error" ||
    status === "unauthorized"
  ) {
    return status;
  }

  return "unauthorized";
}

function staffShellShop(input: {
  shopCode: string;
  shopId: string;
}): ShopAdminShellShop {
  return {
    role: "shop_manager",
    shopCode: input.shopCode,
    shopId: input.shopId,
    shopName: input.shopCode,
    shopStatus: "active",
  };
}

export async function resolveShopAdminDataAccess(
  options: ResolveShopAdminDataAccessOptions = {},
): Promise<ShopAdminDataAccess> {
  const serverConfig = resolveSupabaseServerConfig();
  const serverClient =
    options.client ??
    (serverConfig.status === "configured"
      ? await createSupabaseServerClient(serverConfig)
      : null);

  if (serverClient) {
    const personalResolution = await resolveCurrentShopAdminPrincipal(serverClient);

    if (
      personalResolution.status === "ready" &&
      personalResolution.principal.kind === "personal_account"
    ) {
      const requestedShop = options.requestedShopId
        ? personalResolution.principal.availableShops.find(
            (shop) => shop.shopId === options.requestedShopId,
          )
        : null;

      if (options.strictRequestedShop && options.requestedShopId && !requestedShop) {
        return {
          reason: "Requested shop is not authorized for this principal.",
          status: "unauthorized",
        };
      }

      return {
        principalKind: "personal_account",
        principal: personalResolution.principal,
        selectedShop: requestedShop ?? personalResolution.principal.selectedShop,
        status: "ready",
        supabase: serverClient,
      };
    }
  }

  const staffResolution = await resolveStaffWebSessionPrincipal();

  if (staffResolution.status !== "ready") {
    const fallbackStatus =
      serverConfig.status === "not_configured"
        ? "not_configured"
        : statusForAccessState(staffResolution.status);

    return {
      reason:
        staffResolution.reason ??
        "No personal account or staff web session is authorized for Shop Admin.",
      status: fallbackStatus,
    };
  }

  if (staffResolution.principal.kind !== "pos_staff_manager") {
    return {
      reason: "Resolved staff web session did not produce a POS staff manager principal.",
      status: "unauthorized",
    };
  }

  const staffShop = staffResolution.principal.shop;

  if (options.requestedShopId && options.requestedShopId !== staffShop.shopId) {
    return {
      reason: "Staff web access is limited to the staff account shop.",
      status: "unauthorized",
    };
  }

  const adminConfig = resolveSupabaseAdminConfig();

  if (adminConfig.status !== "configured") {
    return {
      reason:
        "Supabase admin runtime is required for staff web Shop Admin data access.",
      status: "not_configured",
    };
  }

  const adminClient = createSupabaseAdminClient(adminConfig);

  if (!adminClient) {
    return {
      reason: "Supabase admin client is unavailable for staff web data access.",
      status: "not_configured",
    };
  }

  return {
    principalKind: "pos_staff_manager",
    principal: staffResolution.principal,
    selectedShop: staffShellShop(staffShop),
    status: "ready",
    supabase: adminClient,
  };
}
