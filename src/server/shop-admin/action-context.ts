import "server-only";

import {
  createSupabaseServerClient,
  resolveSupabaseServerConfig,
  type SupabaseServerClient,
} from "@/lib/supabase/server";
import { canShopAdmin, type ShopAdminPermission } from "./permissions";
import {
  resolveCurrentShopAdminShellAccess,
  type ShopAdminShellShop,
} from "./shop-access";

export type ShopAdminActionCode =
  | "success"
  | "not_configured"
  | "unauthorized"
  | "validation_failed"
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
  | "preview_required"
  | "preview_mismatch"
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
      status: "ready";
      selectedShop: ShopAdminShellShop;
      supabase: SupabaseServerClient;
    }
  | {
      status: "blocked";
      result: ShopAdminActionResult;
    };

const messages: Record<ShopAdminActionCode, string> = {
  success: "Action completed.",
  not_configured: "Supabase runtime is not configured.",
  unauthorized: "This account is not authorized for this shop action.",
  validation_failed: "Check the highlighted fields and try again.",
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
  invalid_file_type: "Upload a .xlsx workbook.",
  preview_required: "Preview the workbook and confirm before applying it.",
  preview_mismatch: "The uploaded workbook no longer matches the preview digest.",
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
    "unauthorized",
    "validation_failed",
    "unauthorized_or_unmapped",
    "not_found",
    "conflict",
    "duplicate_staff_code",
    "invalid_state",
    "invalid_state_or_not_found",
    "invalid_supplier",
    "invalid_category",
    "reason_required",
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
  const config = resolveSupabaseServerConfig();

  if (config.status !== "configured") {
    return {
      status: "blocked",
      result: shopAdminActionResult("not_configured", { ok: false }),
    };
  }

  const supabase = await createSupabaseServerClient(config);

  if (!supabase) {
    return {
      status: "blocked",
      result: shopAdminActionResult("not_configured", { ok: false }),
    };
  }

  const access = await resolveCurrentShopAdminShellAccess(supabase);

  if (access.status !== "shop_admin") {
    return {
      status: "blocked",
      result: shopAdminActionResult("unauthorized", { ok: false }),
    };
  }

  const selectedShop =
    access.availableShops.find((shop) => shop.shopId === requestedShopId) ??
    access.selectedShop;

  if (!canShopAdmin(selectedShop.role, permission)) {
    return {
      status: "blocked",
      result: shopAdminActionResult("unauthorized", {
        ok: false,
        shopId: selectedShop.shopId,
      }),
    };
  }

  return {
    status: "ready",
    selectedShop,
    supabase,
  };
}
