import "server-only";

import { cache } from "react";
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
  ShopAdminPrincipalResolution,
  ShopAdminPersonalAccountPrincipal,
  ShopAdminPosStaffManagerPrincipal,
} from "./access-principal";
import {
  resolveStaffWebSessionPrincipal,
  STAFF_WEB_SESSION_MISSING_REASON,
} from "./staff-web-auth";
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
        | "no_active_session"
        | "no_session"
        | "session_expired"
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

type StaffShellShopRow = {
  company_rut?: string | null;
  shop_code: string;
  shop_id: string;
  shop_name: string;
  shop_status: string;
};

function statusForAccessState(
  status: string,
): BlockedShopAdminDataAccess["status"] {
  if (
    status === "not_configured" ||
    status === "no_active_session" ||
    status === "no_session" ||
    status === "session_expired" ||
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
  shopName?: string | null;
  shopStatus?: string | null;
  companyRut?: string | null;
}): ShopAdminShellShop {
  const shopName = input.shopName?.trim();

  return {
    companyRut: input.companyRut ?? undefined,
    role: "shop_manager",
    shopCode: input.shopCode,
    shopId: input.shopId,
    shopName: shopName || `Shop ${input.shopCode}`,
    shopStatus: input.shopStatus ?? "active",
  };
}

async function loadStaffShellShop(
  adminClient: SupabaseAdminClient,
  input: {
    shopCode: string;
    shopId: string;
  },
): Promise<ShopAdminShellShop> {
  const fiscalResult = await adminClient
    .from("shops")
    .select("shop_id,shop_code,shop_name,shop_status,company_rut")
    .eq("shop_id", input.shopId)
    .maybeSingle();

  if (!fiscalResult.error && fiscalResult.data) {
    const shop = fiscalResult.data as StaffShellShopRow;

    return {
      companyRut: shop.company_rut ?? undefined,
      role: "shop_manager",
      shopCode: shop.shop_code,
      shopId: shop.shop_id,
      shopName: shop.shop_name,
      shopStatus: shop.shop_status,
    };
  }

  const baseResult = await adminClient
    .from("shops")
    .select("shop_id,shop_code,shop_name,shop_status")
    .eq("shop_id", input.shopId)
    .maybeSingle();

  if (!baseResult.error && baseResult.data) {
    const shop = baseResult.data as StaffShellShopRow;

    return {
      role: "shop_manager",
      shopCode: shop.shop_code,
      shopId: shop.shop_id,
      shopName: shop.shop_name,
      shopStatus: shop.shop_status,
    };
  }

  return staffShellShop(input);
}

function toPersonalAccountBlockedAccess(
  personalResolution: Exclude<ShopAdminPrincipalResolution, { status: "ready" }>,
): BlockedShopAdminDataAccess {
  return {
    reason: personalResolution.reason,
    status: statusForAccessState(personalResolution.status),
  };
}

async function resolveShopAdminDataAccessUncached(
  options: ResolveShopAdminDataAccessOptions = {},
): Promise<ShopAdminDataAccess> {
  const staffResolution = await resolveStaffWebSessionPrincipal();

  if (staffResolution.status === "ready") {
    if (staffResolution.principal.kind !== "pos_staff_manager") {
      return {
        reason:
          "Resolved staff web session did not produce a POS staff manager principal.",
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
          "Supabase admin runtime is required for staff web Admin Console data access.",
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
      selectedShop: await loadStaffShellShop(adminClient, staffShop),
      status: "ready",
      supabase: adminClient,
    };
  }

  if (staffResolution.reason !== STAFF_WEB_SESSION_MISSING_REASON) {
    return {
      reason:
        staffResolution.reason ??
        "Staff web session is not authorized for Admin Console.",
      status: statusForAccessState(staffResolution.status),
    };
  }

  const serverConfig = resolveSupabaseServerConfig();
  const serverClient =
    options.client ??
    (serverConfig.status === "configured"
      ? await createSupabaseServerClient(serverConfig)
      : null);
  let personalAccountBlockedAccess: BlockedShopAdminDataAccess | null =
    serverConfig.status === "not_configured"
      ? {
          reason:
            "Supabase runtime env is not configured for Admin Console authorization.",
          status: "not_configured",
        }
      : null;

  if (serverConfig.status === "configured" && !serverClient) {
    personalAccountBlockedAccess = {
      reason: "Supabase server client is unavailable for Admin Console authorization.",
      status: "not_configured",
    };
  }

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

    personalAccountBlockedAccess =
      personalResolution.status === "ready"
        ? {
            reason:
              "Resolved personal account access did not produce a personal account principal.",
            status: "unauthorized",
          }
      : toPersonalAccountBlockedAccess(personalResolution);
  }

  if (
    personalAccountBlockedAccess &&
    staffResolution.reason === STAFF_WEB_SESSION_MISSING_REASON
  ) {
    return personalAccountBlockedAccess;
  }

  return (
    personalAccountBlockedAccess ?? {
      reason: "No personal account or staff web session is authorized for Admin Console.",
      status: "no_session",
    }
  );
}

const resolveShopAdminDataAccessForRequest = cache(
  async (requestedShopId: string | null, strictRequestedShop: boolean) =>
    resolveShopAdminDataAccessUncached({
      requestedShopId,
      strictRequestedShop,
    }),
);

export async function resolveShopAdminDataAccess(
  options: ResolveShopAdminDataAccessOptions = {},
): Promise<ShopAdminDataAccess> {
  if (options.client) {
    return resolveShopAdminDataAccessUncached(options);
  }

  return resolveShopAdminDataAccessForRequest(
    options.requestedShopId ?? null,
    options.strictRequestedShop === true,
  );
}
