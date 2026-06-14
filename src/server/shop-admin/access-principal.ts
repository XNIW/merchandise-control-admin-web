import "server-only";

import type { SupabaseServerClient } from "@/lib/supabase/server";
import {
  resolveCurrentShopAdminShellAccess,
  type ShopAdminShellAccess,
  type ShopAdminShellShop,
} from "./shop-access";
import { isShopStaffWebPermission } from "./staff-web-permissions";

export const POS_STAFF_WEB_REQUIRED_PERMISSION = "shop_admin.full_access" as const;
export const STAFF_WEB_LOGIN_NOT_IMPLEMENTED =
  "staff_web_login_not_implemented" as const;
export const POS_STAFF_WEB_CURRENT_SCHEMA_ROLE_KEY = "manager" as const;
export const POS_STAFF_WEB_FUTURE_ADMIN_ROLE_KEY = "admin" as const;

export type PosStaffWebCurrentRoleKey =
  typeof POS_STAFF_WEB_CURRENT_SCHEMA_ROLE_KEY;
export type PosStaffWebTargetRoleKey =
  | PosStaffWebCurrentRoleKey
  | typeof POS_STAFF_WEB_FUTURE_ADMIN_ROLE_KEY;

export type ShopAdminPrincipalKind = "personal_account" | "pos_staff_manager";

export type ShopAdminPersonalAccountPrincipal = {
  availableShops: readonly ShopAdminShellShop[];
  kind: "personal_account";
  selectedShop: ShopAdminShellShop;
  source: "supabase_auth_shop_members";
  userId: string;
};

export type ShopAdminPosStaffManagerPrincipal = {
  credentialStatus: "active";
  kind: "pos_staff_manager";
  permissions: readonly string[];
  roleKey: PosStaffWebCurrentRoleKey;
  shop: {
    shopCode: string;
    shopId: string;
  };
  source: "pos_staff_web_session_planned";
  staff: {
    staffCode: string;
    staffId: string;
  };
};

export type ShopAdminPrincipal =
  | ShopAdminPersonalAccountPrincipal
  | ShopAdminPosStaffManagerPrincipal;

export type ShopAdminPrincipalResolution =
  | {
      principal: ShopAdminPrincipal;
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
        | "unauthorized"
        | typeof STAFF_WEB_LOGIN_NOT_IMPLEMENTED;
      userId?: string;
    };

export type PosStaffWebEligibilityInput = {
  credentialStatus: string | null | undefined;
  lockedUntil?: string | null;
  mustChangeCredential?: boolean | null;
  permissions?: readonly string[] | null;
  roleKey: string | null | undefined;
  status: string | null | undefined;
};

export type PosStaffManagerWebPrincipalInput =
  PosStaffWebEligibilityInput & {
    shopCode: string | null | undefined;
    shopId: string | null | undefined;
    staffCode: string | null | undefined;
    staffId: string | null | undefined;
  };

function isFutureTimestamp(value: string | null | undefined) {
  return Boolean(value && Date.parse(value) > Date.now());
}

function hasFullWebPermission(input: PosStaffWebEligibilityInput) {
  return (
    input.permissions?.includes(POS_STAFF_WEB_REQUIRED_PERMISSION) ?? false
  );
}

function hasRecognizedWebPermission(input: PosStaffWebEligibilityInput) {
  return (
    input.permissions?.some((permission) => isShopStaffWebPermission(permission)) ??
    false
  );
}

export function isPosStaffEligibleForShopAdminWeb(
  input: PosStaffWebEligibilityInput,
) {
  return (
    input.roleKey === POS_STAFF_WEB_CURRENT_SCHEMA_ROLE_KEY &&
    input.status === "active" &&
    input.credentialStatus === "active" &&
    input.mustChangeCredential !== true &&
    !isFutureTimestamp(input.lockedUntil) &&
    (hasFullWebPermission(input) || hasRecognizedWebPermission(input))
  );
}

function toPersonalAccountPrincipal(
  access: Extract<ShopAdminShellAccess, { status: "shop_admin" }>,
): ShopAdminPersonalAccountPrincipal {
  return {
    availableShops: access.availableShops,
    kind: "personal_account",
    selectedShop: access.selectedShop,
    source: "supabase_auth_shop_members",
    userId: access.userId,
  };
}

export async function resolveCurrentShopAdminPrincipal(
  client?: SupabaseServerClient | null,
): Promise<ShopAdminPrincipalResolution> {
  const access = await resolveCurrentShopAdminShellAccess(client);

  if (access.status !== "shop_admin") {
    return {
      reason: access.reason,
      status: access.status,
      userId: access.userId,
    };
  }

  return {
    principal: toPersonalAccountPrincipal(access),
    status: "ready",
  };
}

export function resolvePosStaffManagerWebPrincipal(
  input: PosStaffManagerWebPrincipalInput,
): ShopAdminPrincipalResolution {
  if (!isPosStaffEligibleForShopAdminWeb(input)) {
    return {
      reason:
        "POS staff web access requires an active current-schema manager credential and an explicit staff web permission.",
      status: "unauthorized",
    };
  }

  if (!input.shopId || !input.shopCode || !input.staffId || !input.staffCode) {
    return {
      reason:
        "POS staff web access must resolve to one staff account and one shop.",
      status: "unauthorized",
    };
  }

  const additionalPermissions = Array.from(
    new Set(
      (input.permissions ?? []).filter(
        (permission) =>
          permission.length > 0 &&
          isShopStaffWebPermission(permission) &&
          permission !== POS_STAFF_WEB_REQUIRED_PERMISSION,
      ),
    ),
  );
  const permissions: ShopAdminPosStaffManagerPrincipal["permissions"] =
    hasFullWebPermission(input)
      ? [POS_STAFF_WEB_REQUIRED_PERMISSION, ...additionalPermissions]
      : additionalPermissions;

  return {
    principal: {
      credentialStatus: "active",
      kind: "pos_staff_manager",
      permissions,
      roleKey: POS_STAFF_WEB_CURRENT_SCHEMA_ROLE_KEY,
      shop: {
        shopCode: input.shopCode,
        shopId: input.shopId,
      },
      source: "pos_staff_web_session_planned",
      staff: {
        staffCode: input.staffCode,
        staffId: input.staffId,
      },
    },
    status: "ready",
  };
}
