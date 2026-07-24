import "server-only";

import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import {
  resolveShopActionContext,
  shopAdminActionResult,
  type ShopAdminActionResult,
} from "./action-context";

export type PosSyncRecoveryActionType =
  | "add_note"
  | "mark_reviewed"
  | "request_pos_retry";

type PosSyncRecoveryTargetType =
  | "pos_sale"
  | "pos_sale_stock_movement"
  | "pos_sales_sync_batch"
  | "pos_shop";

type PosSyncRecoveryTarget = {
  id: string;
  type: PosSyncRecoveryTargetType;
};

type ReadyShopActionContext = Extract<
  Awaited<ReturnType<typeof resolveShopActionContext>>,
  { status: "ready" }
>;
type PersonalShopActionContext = Extract<
  ReadyShopActionContext,
  { principalKind: "personal_account" }
>;

const allowedActionTypes = new Set<PosSyncRecoveryActionType>([
  "add_note",
  "mark_reviewed",
  "request_pos_retry",
]);
const allowedTargetTypes = new Set<PosSyncRecoveryTargetType>([
  "pos_sale",
  "pos_sale_stock_movement",
  "pos_sales_sync_batch",
  "pos_shop",
]);
const MAX_NOTE_LENGTH = 600;

function parseActionType(value: string): PosSyncRecoveryActionType | null {
  const normalized = value.trim();

  return allowedActionTypes.has(normalized as PosSyncRecoveryActionType)
    ? (normalized as PosSyncRecoveryActionType)
    : null;
}

function parseTargetRef(value: string): PosSyncRecoveryTarget | null {
  const separator = value.indexOf("|");

  if (separator <= 0) {
    return null;
  }

  const type = value.slice(0, separator).trim();
  const id = value.slice(separator + 1).trim();

  if (!id || !allowedTargetTypes.has(type as PosSyncRecoveryTargetType)) {
    return null;
  }

  return {
    id,
    type: type as PosSyncRecoveryTargetType,
  };
}

function normalizeNote(value: string | undefined) {
  const normalized = (value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.slice(0, MAX_NOTE_LENGTH);
}

function adminClientForContext(
  context: PersonalShopActionContext,
): SupabaseAdminClient | null {
  const config = resolveSupabaseAdminConfig();

  if (config.status !== "configured") {
    return null;
  }

  return createSupabaseAdminClient(config);
}

export async function recordPosSyncRecoveryAction(input: {
  actionType: string;
  note?: string;
  requestedShopId?: string;
  targetRef: string;
}): Promise<ShopAdminActionResult> {
  const context = await resolveShopActionContext(
    input.requestedShopId,
    "sync.manage",
  );

  if (context.status !== "ready") {
    return context.result;
  }

  if (context.principalKind !== "personal_account") {
    return shopAdminActionResult("permission_denied", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const actionType = parseActionType(input.actionType);
  const target = parseTargetRef(input.targetRef);
  const note = normalizeNote(input.note);

  if (!actionType || !target || (actionType === "add_note" && !note)) {
    return shopAdminActionResult("validation_failed", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const adminClient = adminClientForContext(context);

  if (!adminClient) {
    return shopAdminActionResult("not_configured", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const { data, error } = await adminClient.rpc(
    "shop_pos_recovery_action_v1",
    {
      p_action_type: actionType,
      p_actor_profile_id: context.actorProfileId,
      p_note_redacted: note || null,
      p_shop_id: context.selectedShop.shopId,
      p_target_id: target.id,
      p_target_type: target.type,
    },
  );

  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const result = data as Record<string, Json | undefined>;
  if (result.ok !== true || result.code !== "success") {
    const code =
      result.code === "permission_denied" ||
      result.code === "not_found" ||
      result.code === "validation_failed"
        ? result.code
        : "db_failure";
    return shopAdminActionResult(code, {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  return shopAdminActionResult("success", {
    auditEventId:
      typeof result.auditEventId === "string"
        ? result.auditEventId
        : undefined,
    ok: true,
    shopId: context.selectedShop.shopId,
    targetId: target.id,
  });
}
