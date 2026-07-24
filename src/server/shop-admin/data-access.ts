import "server-only";

import { cache } from "react";
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
import {
  canShopAdmin,
  type ShopAdminPermission,
} from "./permissions";
import type { ShopAdminShellShop } from "./shop-access";
import { canStaffWebPerformShopAdminAction } from "./staff-web-permissions";

export type ShopAdminDataClient = SupabaseServerClient;

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
  requiredPermission?: ShopAdminPermission;
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

    const selectedShop = staffShellShop({
      companyRut: staffShop.companyRut,
      shopCode: staffShop.shopCode,
      shopId: staffShop.shopId,
      shopName: staffShop.shopName,
      shopStatus: staffShop.shopStatus,
    });

    if (selectedShop.shopStatus !== "active") {
      return {
        reason: "Selected shop is not operational.",
        status: "unauthorized",
      };
    }

    return {
      principalKind: "pos_staff_manager",
      principal: staffResolution.principal,
      selectedShop,
      status: "ready",
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

      if (
        options.strictRequestedShop !== false &&
        options.requestedShopId &&
        !requestedShop
      ) {
        return {
          reason: "Requested shop is not authorized for this principal.",
          status: "unauthorized",
        };
      }

      const selectedShop = requestedShop ?? personalResolution.principal.selectedShop;

      if (selectedShop.shopStatus !== "active") {
        return {
          reason: "Selected shop is not operational.",
          status: "unauthorized",
        };
      }

      return {
        principalKind: "personal_account",
        principal: personalResolution.principal,
        selectedShop,
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
  const access = options.client
    ? await resolveShopAdminDataAccessUncached(options)
    : await resolveShopAdminDataAccessForRequest(
        options.requestedShopId ?? null,
        options.strictRequestedShop !== false,
      );

  if (access.status !== "ready" || !options.requiredPermission) {
    return access;
  }

  const authorized =
    access.principalKind === "personal_account"
      ? canShopAdmin(access.selectedShop.role, options.requiredPermission)
      : canStaffWebPerformShopAdminAction(
          access.principal.permissions,
          options.requiredPermission,
        );

  return authorized
    ? access
    : {
        reason: `Required shop permission is missing: ${options.requiredPermission}.`,
        status: "unauthorized",
      };
}

export async function revalidateShopAdminDataAccessForPublish(
  access: Extract<ShopAdminDataAccess, { status: "ready" }>,
  requiredPermission: ShopAdminPermission,
) {
  if (access.principalKind === "personal_account") {
    const refreshed = await resolveCurrentShopAdminPrincipal(access.supabase);
    if (
      refreshed.status !== "ready" ||
      refreshed.principal.kind !== "personal_account" ||
      refreshed.principal.userId !== access.principal.userId
    ) {
      return false;
    }
    const refreshedShop = refreshed.principal.availableShops.find(
      (shop) => shop.shopId === access.selectedShop.shopId,
    );
    return Boolean(
      refreshedShop &&
        refreshedShop.shopStatus === "active" &&
        refreshedShop.role === access.selectedShop.role &&
        canShopAdmin(refreshedShop.role, requiredPermission),
    );
  }

  const refreshed = await resolveStaffWebSessionPrincipal();
  if (
    refreshed.status !== "ready" ||
    refreshed.principal.kind !== "pos_staff_manager"
  ) {
    return false;
  }
  const previousSession = access.principal.staffWebSession;
  const refreshedSession = refreshed.principal.staffWebSession;
  return Boolean(
    previousSession &&
      refreshedSession &&
      refreshed.principal.shop.shopId === access.selectedShop.shopId &&
      refreshed.principal.shop.shopStatus === "active" &&
      refreshed.principal.staff.staffId === access.principal.staff.staffId &&
      refreshedSession.sessionId === previousSession.sessionId &&
      refreshedSession.sessionTokenHash === previousSession.sessionTokenHash &&
      refreshedSession.credentialVersion === previousSession.credentialVersion &&
      canStaffWebPerformShopAdminAction(
        refreshed.principal.permissions,
        requiredPermission,
      ),
  );
}
