import "server-only";

import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import {
  resolveShopActionContext,
  shopAdminActionResult,
  type ShopAdminActionResult,
} from "./action-context";
import { redactShopAdminJson } from "./history-read-model";

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

type ScopedTargetMetadata = {
  client_batch_id?: string;
  client_sale_id?: string;
  movement_key?: string;
  status?: string;
};

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

function actorColumns(context: ReadyShopActionContext) {
  return {
    actor_profile_id:
      context.principalKind === "personal_account" ? context.actorProfileId : null,
    actor_staff_id:
      context.principalKind === "pos_staff_manager" ? context.actorStaffId : null,
  };
}

function adminClientForContext(
  context: ReadyShopActionContext,
): SupabaseAdminClient | null {
  if (context.principalKind === "pos_staff_manager") {
    return context.supabase;
  }

  const config = resolveSupabaseAdminConfig();

  if (config.status !== "configured") {
    return null;
  }

  return createSupabaseAdminClient(config);
}

async function loadScopedTarget(
  supabase: SupabaseAdminClient,
  shopId: string,
  target: PosSyncRecoveryTarget,
): Promise<ScopedTargetMetadata | null> {
  if (target.type === "pos_shop") {
    return target.id === shopId ? { status: "shop_scoped" } : null;
  }

  if (target.type === "pos_sales_sync_batch") {
    const { data, error } = await supabase
      .from("pos_sales_sync_batches")
      .select("client_batch_id,status")
      .eq("shop_id", shopId)
      .eq("pos_sales_sync_batch_id", target.id)
      .maybeSingle<Pick<Tables<"pos_sales_sync_batches">, "client_batch_id" | "status">>();

    if (error || !data) {
      return null;
    }

    return {
      client_batch_id: data.client_batch_id,
      status: data.status,
    };
  }

  if (target.type === "pos_sale") {
    const { data, error } = await supabase
      .from("pos_sales")
      .select("client_sale_id,status")
      .eq("shop_id", shopId)
      .eq("pos_sale_id", target.id)
      .maybeSingle<Pick<Tables<"pos_sales">, "client_sale_id" | "status">>();

    if (error || !data) {
      return null;
    }

    return {
      client_sale_id: data.client_sale_id,
      status: data.status,
    };
  }

  const { data, error } = await supabase
    .from("pos_sale_stock_movements")
    .select("movement_key,status")
    .eq("shop_id", shopId)
    .eq("pos_sale_stock_movement_id", target.id)
    .maybeSingle<
      Pick<Tables<"pos_sale_stock_movements">, "movement_key" | "status">
    >();

  if (error || !data) {
    return null;
  }

  return {
    movement_key: data.movement_key,
    status: data.status,
  };
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

  const targetMetadata = await loadScopedTarget(
    adminClient,
    context.selectedShop.shopId,
    target,
  );

  if (!targetMetadata) {
    return shopAdminActionResult("not_found", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const metadata = redactShopAdminJson({
    action_type: actionType,
    actor_kind: context.principalKind,
    behavior: "append_only_audit_no_sales_stock_outbox_mutation",
    note_redacted: note || null,
    request_pos_retry_effect:
      actionType === "request_pos_retry"
        ? "audit_only_pos_polling_not_implemented"
        : "not_requested",
    source: "admin_web_pos_sync_recovery",
    target: targetMetadata,
  } satisfies Record<string, Json>) as Json;

  const { data, error } = await adminClient
    .from("audit_logs")
    .insert({
      ...actorColumns(context),
      event_key: `pos.sync.recovery.${actionType}.success`,
      metadata_redacted: metadata,
      result: "success",
      scope: "shop",
      severity: actionType === "request_pos_retry" ? "warning" : "info",
      shop_id: context.selectedShop.shopId,
      target_id: target.id,
      target_type: target.type,
    })
    .select("audit_log_id")
    .maybeSingle<Pick<Tables<"audit_logs">, "audit_log_id">>();

  if (error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  return shopAdminActionResult("success", {
    auditEventId: data?.audit_log_id,
    ok: true,
    shopId: context.selectedShop.shopId,
    targetId: target.id,
  });
}
