import "server-only";

import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
} from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import {
  resolveShopActionContext,
  shopAdminActionResult,
  type ShopAdminActionResult,
} from "./action-context";

type UpdateShopSettingsInput = {
  reason?: string;
  requestedShopId?: string;
  shopName: string;
};

type JsonRecord = { [key: string]: Json | undefined };
type SettingsAdminClient = NonNullable<
  ReturnType<typeof createSupabaseAdminClient>
>;

function normalizeLabel(value: string | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

async function writeSettingsAudit(
  adminClient: SettingsAdminClient,
  context: Extract<
    Awaited<ReturnType<typeof resolveShopActionContext>>,
    { status: "ready" }
  >,
  input: {
    code: string;
    metadata?: JsonRecord;
    result: "blocked" | "failure" | "success";
    severity: "critical" | "info" | "warning";
  },
) {
  const { data, error } = await adminClient
    .from("audit_logs")
    .insert({
      actor_profile_id:
        context.principalKind === "personal_account"
          ? context.actorProfileId
          : null,
      actor_staff_id:
        context.principalKind === "pos_staff_manager"
          ? context.actorStaffId
          : null,
      event_key:
        input.result === "success"
          ? "shop.settings.update.success"
          : "shop.settings.update.failure",
      metadata_redacted: {
        actor_kind: context.principalKind,
        code: input.code,
        source: "TASK-039",
        ...(input.metadata ?? {}),
      },
      result: input.result,
      scope: "shop",
      severity: input.severity,
      shop_id: context.selectedShop.shopId,
      target_id: context.selectedShop.shopId,
      target_type: "shop",
    })
    .select("audit_log_id")
    .maybeSingle<Pick<Tables<"audit_logs">, "audit_log_id">>();

  return error ? undefined : data?.audit_log_id;
}

export async function updateShopSettings(
  input: UpdateShopSettingsInput,
): Promise<ShopAdminActionResult> {
  const shopName = normalizeLabel(input.shopName);
  const reason = normalizeLabel(input.reason);

  if (!shopName || !reason) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: {
        reason: "A reason is required for settings changes.",
        shopName: "Shop name is required.",
      },
      ok: false,
    });
  }

  const context = await resolveShopActionContext(
    input.requestedShopId,
    "settings.write",
  );

  if (context.status !== "ready") {
    return context.result;
  }

  if (context.principalKind === "pos_staff_manager") {
    return updateShopSettingsWithAdminClient(context, context.supabase, {
      reason,
      shopName,
    });
  }

  const adminConfig = resolveSupabaseAdminConfig();

  if (adminConfig.status !== "configured") {
    return shopAdminActionResult("not_configured", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const adminClient = createSupabaseAdminClient(adminConfig);

  if (!adminClient) {
    return shopAdminActionResult("not_configured", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  return updateShopSettingsWithAdminClient(context, adminClient, {
    reason,
    shopName,
  });
}

async function updateShopSettingsWithAdminClient(
  context: Extract<
    Awaited<ReturnType<typeof resolveShopActionContext>>,
    { status: "ready" }
  >,
  adminClient: SettingsAdminClient,
  input: {
    reason: string;
    shopName: string;
  },
): Promise<ShopAdminActionResult> {
  const { data, error } = await adminClient
    .from("shops")
    .update({
      shop_name: input.shopName,
      status_changed_at: new Date().toISOString(),
      status_reason_redacted: input.reason.slice(0, 240),
      updated_at: new Date().toISOString(),
    })
    .eq("shop_id", context.selectedShop.shopId)
    .eq("shop_status", "active")
    .select("shop_id")
    .maybeSingle<Pick<Tables<"shops">, "shop_id">>();

  if (error || !data) {
    const auditEventId = await writeSettingsAudit(adminClient, context, {
      code: error ? "db_failure" : "not_found",
      metadata: {
        name_length: input.shopName.length,
        reason_redacted: input.reason,
      },
      result: error ? "failure" : "blocked",
      severity: error ? "critical" : "warning",
    });

    return shopAdminActionResult(error ? "db_failure" : "not_found", {
      auditEventId,
      ok: false,
      shopId: context.selectedShop.shopId,
      targetId: context.selectedShop.shopId,
    });
  }

  const auditEventId = await writeSettingsAudit(adminClient, context, {
    code: "success",
    metadata: {
      name_length: input.shopName.length,
      reason_redacted: input.reason,
    },
    result: "success",
    severity: "warning",
  });

  return shopAdminActionResult("success", {
    auditEventId,
    shopId: context.selectedShop.shopId,
    targetId: context.selectedShop.shopId,
  });
}
