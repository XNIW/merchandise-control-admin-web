import "server-only";

import type { Json } from "@/lib/supabase/database.types";
import {
  mapShopAdminRpcResult,
  resolveShopActionContext,
  shopAdminActionResult,
  type ShopAdminActionResult,
} from "./action-context";
import {
  registerDeviceAsStaff,
  renameDeviceAsStaff,
  runStaffAwareShopAdminMutation,
  setDeviceStatusAsStaff,
} from "./staff-aware-mutations";

type RegisterDeviceInput = {
  appVersion?: string;
  deviceIdentifier: string;
  deviceType?: string;
  displayName?: string;
  requestedShopId?: string;
};

type DeviceTargetInput = {
  deviceId: string;
  reason?: string;
  requestedShopId?: string;
};

type RenameDeviceInput = DeviceTargetInput & {
  displayName: string;
};

function reasonRequired(value: string | undefined): value is string {
  return Boolean(value?.trim());
}

function deviceReasonRequiredResult() {
  return shopAdminActionResult("reason_required", {
    fieldErrors: {
      reason: "A reason is required for device status actions.",
    },
    ok: false,
  });
}

async function deviceRpcResult(
  requestedShopId: string | undefined,
  staffCall: (
    context: Extract<
      Awaited<ReturnType<typeof resolveShopActionContext>>,
      { principalKind: "pos_staff_manager"; status: "ready" }
    >,
  ) => Promise<ShopAdminActionResult>,
  call: (
    context: Extract<
      Awaited<ReturnType<typeof resolveShopActionContext>>,
      { status: "ready" }
    >,
  ) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<ShopAdminActionResult> {
  const context = await resolveShopActionContext(
    requestedShopId,
    "devices.manage",
  );

  if (context.status !== "ready") {
    return context.result;
  }

  const staffResult = await runStaffAwareShopAdminMutation(context, staffCall);

  if (staffResult) {
    return staffResult;
  }

  const { data, error } = await call(context);

  if (error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  return mapShopAdminRpcResult(data);
}

export async function registerDevice(
  input: RegisterDeviceInput,
): Promise<ShopAdminActionResult> {
  if (!input.deviceIdentifier.trim()) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  return deviceRpcResult(
    input.requestedShopId,
    (context) => registerDeviceAsStaff(context, input),
    (context) =>
      context.supabase.rpc("shop_device_register", {
        p_app_version: input.appVersion,
        p_device_identifier: input.deviceIdentifier,
        p_device_type: input.deviceType,
        p_display_name: input.displayName,
        p_metadata: {} satisfies Json,
        p_shop_id: context.selectedShop.shopId,
      }),
  );
}

export async function renameDevice(
  input: RenameDeviceInput,
): Promise<ShopAdminActionResult> {
  if (!input.deviceId.trim() || !input.displayName.trim()) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  return deviceRpcResult(
    input.requestedShopId,
    (context) => renameDeviceAsStaff(context, input),
    (context) =>
      context.supabase.rpc("shop_device_rename", {
        p_display_name: input.displayName,
        p_shop_device_id: input.deviceId,
        p_shop_id: context.selectedShop.shopId,
      }),
  );
}

export async function revokeDevice(
  input: DeviceTargetInput,
): Promise<ShopAdminActionResult> {
  if (!input.deviceId.trim()) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  if (!reasonRequired(input.reason)) {
    return deviceReasonRequiredResult();
  }

  const reason = input.reason.trim();

  return deviceRpcResult(
    input.requestedShopId,
    (context) =>
      setDeviceStatusAsStaff(context, {
        ...input,
        nextStatus: "revoked",
        reason,
      }),
    (context) =>
      context.supabase.rpc("shop_device_revoke", {
        p_reason: reason,
        p_shop_device_id: input.deviceId,
        p_shop_id: context.selectedShop.shopId,
      }),
  );
}

export async function reactivateDevice(
  input: DeviceTargetInput,
): Promise<ShopAdminActionResult> {
  if (!input.deviceId.trim()) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  if (!reasonRequired(input.reason)) {
    return deviceReasonRequiredResult();
  }

  const reason = input.reason.trim();

  return deviceRpcResult(
    input.requestedShopId,
    (context) =>
      setDeviceStatusAsStaff(context, {
        ...input,
        nextStatus: "active",
        reason,
      }),
    (context) =>
      context.supabase.rpc("shop_device_reactivate", {
        p_reason: reason,
        p_shop_device_id: input.deviceId,
        p_shop_id: context.selectedShop.shopId,
      }),
  );
}
