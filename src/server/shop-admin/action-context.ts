import "server-only";

import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveShopAdminDataAccess } from "./data-access";
import { canShopAdmin, type ShopAdminPermission } from "./permissions";
import type { ShopAdminShellShop } from "./shop-access";
import { canStaffWebPerformShopAdminAction } from "./staff-web-permissions";

export type ShopAdminActionCode =
  | "success"
  | "not_configured"
  | "no_active_session"
  | "session_expired"
  | "unauthorized"
  | "validation_failed"
  | "permission_denied"
  | "partial_failure"
  | "unauthorized_or_unmapped"
  | "not_found"
  | "conflict"
  | "duplicate_staff_code"
  | "invalid_state"
  | "invalid_state_or_not_found"
  | "invalid_supplier"
  | "invalid_category"
  | "reason_required"
  | "file_too_large"
  | "row_limit_exceeded"
  | "invalid_file_type"
  | "invalid_workbook"
  | "preview_required"
  | "preview_mismatch"
  | "shop_settings_managed_by_master_console"
  | "db_failure";

export type ShopAdminActionResult = {
  auditEventId?: string;
  code: ShopAdminActionCode;
  fieldErrors?: Record<string, string>;
  message: string;
  ok: boolean;
  shopId?: string;
  targetId?: string;
};

export type ShopAdminActionContext =
  | {
      actorProfileId: string;
      principalKind: "personal_account";
      status: "ready";
      selectedShop: ShopAdminShellShop;
      supabase: SupabaseServerClient;
    }
  | {
      actorStaffId: string;
      principalKind: "pos_staff_manager";
      staffPermissions: readonly string[];
      status: "ready";
      selectedShop: ShopAdminShellShop;
      supabase: SupabaseAdminClient;
    }
  | {
      status: "blocked";
      result: ShopAdminActionResult;
    };

const messages: Record<ShopAdminActionCode, string> = {
  success: "Action completed.",
  not_configured: "Supabase runtime is not configured.",
  no_active_session: "Session expired. Please sign in again.",
  session_expired: "Session expired. Please sign in again.",
  unauthorized: "This account is not authorized for this shop action.",
  validation_failed: "Check the highlighted fields and try again.",
  permission_denied: "You do not have permission for this shop action.",
  partial_failure:
    "Some rows could not be imported. Re-run preview and review the import summary before retrying.",
  unauthorized_or_unmapped:
    "This shop is not authorized or has no mapped inventory source.",
  not_found: "The requested row was not found for this shop.",
  conflict: "A row with the same active unique value already exists.",
  duplicate_staff_code: "A staff account with this code already exists.",
  invalid_state: "The target row is not in a valid state for this action.",
  invalid_state_or_not_found:
    "The target row was not found or is not in a valid state.",
  invalid_supplier: "The selected supplier does not belong to this shop source.",
  invalid_category: "The selected category does not belong to this shop source.",
  reason_required: "A reason is required for this sensitive action.",
  file_too_large: "The workbook is larger than the allowed import limit.",
  row_limit_exceeded: "The workbook contains more rows than allowed.",
  invalid_file_type: "Upload a .xlsx or .xls workbook.",
  invalid_workbook: "The workbook could not be read as a valid .xlsx or .xls file.",
  preview_required: "Preview the workbook and confirm before applying it.",
  preview_mismatch: "The uploaded workbook no longer matches the preview digest.",
  shop_settings_managed_by_master_console:
    "SHOP_SETTINGS_MANAGED_BY_MASTER_CONSOLE: Shop profile and fiscal identity are managed by Master Console.",
  db_failure: "The database action failed without exposing internal details.",
};

export function shopAdminActionResult(
  code: ShopAdminActionCode,
  options: {
    auditEventId?: string;
    fieldErrors?: Record<string, string>;
    ok?: boolean;
    shopId?: string;
    targetId?: string;
  } = {},
): ShopAdminActionResult {
  return {
    auditEventId: options.auditEventId,
    code,
    fieldErrors: options.fieldErrors,
    message: messages[code],
    ok: options.ok ?? code === "success",
    shopId: options.shopId,
    targetId: options.targetId,
  };
}

export function formString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export function optionalFormString(formData: FormData, key: string) {
  const value = formString(formData, key).trim();

  return value.length > 0 ? value : undefined;
}

export function optionalFormNumber(formData: FormData, key: string) {
  const raw = optionalFormString(formData, key);

  if (raw === undefined) {
    return undefined;
  }

  const value = Number(raw);

  return Number.isFinite(value) ? value : Number.NaN;
}

type RpcJson = {
  audit_event_id?: unknown;
  code?: unknown;
  ok?: unknown;
  shop_id?: unknown;
  target_id?: unknown;
};

function mapRpcCode(value: unknown): ShopAdminActionCode {
  const code = typeof value === "string" ? value : "db_failure";
  const allowedCodes = new Set<ShopAdminActionCode>([
    "success",
    "not_configured",
    "no_active_session",
    "session_expired",
    "unauthorized",
    "validation_failed",
    "permission_denied",
    "partial_failure",
    "unauthorized_or_unmapped",
    "not_found",
    "conflict",
    "duplicate_staff_code",
    "invalid_state",
    "invalid_state_or_not_found",
    "invalid_supplier",
    "invalid_category",
    "reason_required",
    "shop_settings_managed_by_master_console",
    "db_failure",
  ]);

  return allowedCodes.has(code as ShopAdminActionCode)
    ? (code as ShopAdminActionCode)
    : "db_failure";
}

export function mapShopAdminRpcResult(data: unknown): ShopAdminActionResult {
  const rpc = data && typeof data === "object" ? (data as RpcJson) : {};
  const code = mapRpcCode(rpc.code);

  return shopAdminActionResult(code, {
    auditEventId:
      typeof rpc.audit_event_id === "string" ? rpc.audit_event_id : undefined,
    ok: rpc.ok === true,
    shopId: typeof rpc.shop_id === "string" ? rpc.shop_id : undefined,
    targetId: typeof rpc.target_id === "string" ? rpc.target_id : undefined,
  });
}

export async function resolveShopActionContext(
  requestedShopId: string | undefined,
  permission: ShopAdminPermission,
): Promise<ShopAdminActionContext> {
  const access = await resolveShopAdminDataAccess({
    requestedShopId,
    strictRequestedShop: true,
  });

  if (access.status !== "ready") {
    const code =
      access.status === "not_configured"
        ? "not_configured"
        : access.status === "session_expired"
          ? "session_expired"
          : access.status === "no_active_session" || access.status === "no_session"
            ? "no_active_session"
            : "permission_denied";

    return {
      status: "blocked",
      result: shopAdminActionResult(code, { ok: false }),
    };
  }

  const selectedShop = access.selectedShop;

  if (
    access.principalKind === "personal_account" &&
    !canShopAdmin(selectedShop.role, permission)
  ) {
    return {
      status: "blocked",
      result: shopAdminActionResult("permission_denied", {
        ok: false,
        shopId: selectedShop.shopId,
      }),
    };
  }

  if (
    access.principalKind === "pos_staff_manager" &&
    !canStaffWebPerformShopAdminAction(
      access.principal.permissions,
      permission,
    )
  ) {
    return {
      status: "blocked",
      result: shopAdminActionResult("permission_denied", {
        ok: false,
        shopId: selectedShop.shopId,
      }),
    };
  }

  if (access.principalKind === "personal_account") {
    return {
      actorProfileId: access.principal.userId,
      principalKind: "personal_account",
      status: "ready",
      selectedShop,
      supabase: access.supabase,
    };
  }

  return {
    actorStaffId: access.principal.staff.staffId,
    principalKind: "pos_staff_manager",
    staffPermissions: access.principal.permissions,
    status: "ready",
    selectedShop,
    supabase: access.supabase,
  };
}
