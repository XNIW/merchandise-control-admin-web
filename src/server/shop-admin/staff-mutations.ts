import "server-only";

import { randomBytes } from "node:crypto";
import {
  mapShopAdminRpcResult,
  resolveShopActionContext,
  shopAdminActionResult,
  type ShopAdminActionResult,
} from "./action-context";
import { hashStaffCredential } from "./staff-credentials";
import {
  clearStaffLockoutAsStaff,
  createStaffAsStaff,
  forceStaffCredentialRotationAsStaff,
  resetStaffCredentialAsStaff,
  revokeStaffWebAccessAsStaff,
  revokeStaffWebSessionsAsStaff,
  revokeStaffWebAccessAsPersonalAccount,
  revokeStaffWebSessionsAsPersonalAccount,
  runStaffAwareShopAdminMutation,
  runStaffWebLifecycleShopAdminMutation,
  setStaffStatusAsStaff,
  updateStaffRolePermissionsAsStaff,
  updateStaffRolePermissionsAsPersonalAccount,
} from "./staff-aware-mutations";

export type StaffCredentialKind = "password" | "pin";

export type StaffMutationResult = ShopAdminActionResult & {
  temporaryCredential?: string;
};

type CreateStaffInput = {
  credentialKind?: string;
  displayName: string;
  requestedShopId?: string;
  roleKey: string;
  staffCode: string;
};

type StaffTargetInput = {
  reason?: string;
  requestedShopId?: string;
  staffId: string;
};

type UpdateStaffRolePermissionsInput = {
  permissions?: readonly string[];
  requestedShopId?: string;
  roleKey: string;
  templateKey?: string;
};

type ReadyStaffMutationContext = Extract<
  Awaited<ReturnType<typeof resolveShopActionContext>>,
  { status: "ready" }
>;

type StaffManagerMutationContext = Extract<
  ReadyStaffMutationContext,
  { principalKind: "pos_staff_manager" }
>;

type ResetCredentialInput = StaffTargetInput & {
  credentialKind?: string;
};

function normalizeStaffTarget(input: StaffTargetInput) {
  return {
    reason: input.reason?.trim(),
    requestedShopId: input.requestedShopId,
    staffId: input.staffId.trim(),
  };
}

function normalizeCredentialKind(value: string | undefined): StaffCredentialKind {
  return value === "pin" ? "pin" : "password";
}

export function generateTemporaryStaffCredential(kind: StaffCredentialKind) {
  if (kind === "pin") {
    const digits = String(randomBytes(4).readUInt32BE(0) % 100000000).padStart(
      8,
      "0",
    );

    return digits;
  }

  return randomBytes(12).toString("base64url");
}

async function staffCredentialHash(kind: StaffCredentialKind) {
  const temporaryCredential = generateTemporaryStaffCredential(kind);
  const credentialHash = await hashStaffCredential(temporaryCredential);

  return { credentialHash, temporaryCredential };
}

function reasonRequired(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sensitiveReasonError() {
  return shopAdminActionResult("reason_required", {
    fieldErrors: {
      reason: "A reason is required for staff credential and status actions.",
    },
    ok: false,
  });
}

async function staffRpcResult(
  requestedShopId: string | undefined,
  staffCall: (
    context: StaffManagerMutationContext,
  ) => Promise<ShopAdminActionResult>,
  call: (
    context: ReadyStaffMutationContext,
  ) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<ShopAdminActionResult> {
  const context = await resolveShopActionContext(requestedShopId, "staff.manage");

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

export async function createStaff(
  input: CreateStaffInput,
): Promise<StaffMutationResult> {
  const staffCode = input.staffCode.trim();
  const displayName = input.displayName.trim();
  const roleKey = input.roleKey.trim();
  const credentialKind = normalizeCredentialKind(input.credentialKind);

  if (
    !staffCode ||
    !displayName ||
    !["cashier", "manager", "viewer"].includes(roleKey)
  ) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: {
        staff: "Staff code, display name and role are required.",
      },
      ok: false,
    });
  }

  const { credentialHash, temporaryCredential } =
    await staffCredentialHash(credentialKind);
  const result = await staffRpcResult(
    input.requestedShopId,
    (context) =>
      createStaffAsStaff(context, {
        credentialHash,
        credentialKind,
        displayName,
        roleKey,
        staffCode,
      }),
    (context) =>
      context.supabase.rpc("shop_staff_create", {
        p_credential_hash: credentialHash,
        p_credential_kind: credentialKind,
        p_display_name: displayName,
        p_role_key: roleKey,
        p_shop_id: context.selectedShop.shopId,
        p_staff_code: staffCode,
      }),
  );

  return result.ok ? { ...result, temporaryCredential } : result;
}

export async function resetStaffCredential(
  input: ResetCredentialInput,
): Promise<StaffMutationResult> {
  const target = normalizeStaffTarget(input);
  const credentialKind = normalizeCredentialKind(input.credentialKind);

  if (!target.staffId) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  if (!reasonRequired(target.reason)) {
    return sensitiveReasonError();
  }
  const reason = target.reason;

  const { credentialHash, temporaryCredential } =
    await staffCredentialHash(credentialKind);
  const result = await staffRpcResult(
    target.requestedShopId,
    (context) =>
      resetStaffCredentialAsStaff(context, {
        credentialHash,
        credentialKind,
        reason,
        staffId: target.staffId,
      }),
    (context) =>
      context.supabase.rpc("shop_staff_reset_credential", {
        p_credential_hash: credentialHash,
        p_credential_kind: credentialKind,
        p_reason: reason,
        p_shop_id: context.selectedShop.shopId,
        p_staff_id: target.staffId,
      }),
  );

  return result.ok ? { ...result, temporaryCredential } : result;
}

export async function suspendStaff(
  input: StaffTargetInput,
): Promise<ShopAdminActionResult> {
  const target = normalizeStaffTarget(input);

  if (!target.staffId) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  if (!reasonRequired(target.reason)) {
    return sensitiveReasonError();
  }
  const reason = target.reason;

  return staffRpcResult(
    target.requestedShopId,
    (context) =>
      setStaffStatusAsStaff(context, {
        eventBase: "shop.staff.suspend",
        nextStatus: "suspended",
        reason,
        staffId: target.staffId,
      }),
    (context) =>
      context.supabase.rpc("shop_staff_suspend", {
        p_reason: reason,
        p_shop_id: context.selectedShop.shopId,
        p_staff_id: target.staffId,
      }),
  );
}

export async function reactivateStaff(
  input: StaffTargetInput,
): Promise<ShopAdminActionResult> {
  const target = normalizeStaffTarget(input);

  if (!target.staffId) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  if (!reasonRequired(target.reason)) {
    return sensitiveReasonError();
  }
  const reason = target.reason;

  return staffRpcResult(
    target.requestedShopId,
    (context) =>
      setStaffStatusAsStaff(context, {
        eventBase: "shop.staff.reactivate",
        nextStatus: "active",
        reason,
        staffId: target.staffId,
      }),
    (context) =>
      context.supabase.rpc("shop_staff_reactivate", {
        p_reason: reason,
        p_shop_id: context.selectedShop.shopId,
        p_staff_id: target.staffId,
      }),
  );
}

export async function archiveStaff(
  input: StaffTargetInput,
): Promise<ShopAdminActionResult> {
  const target = normalizeStaffTarget(input);

  if (!target.staffId) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  if (!reasonRequired(target.reason)) {
    return sensitiveReasonError();
  }
  const reason = target.reason;

  return staffRpcResult(
    target.requestedShopId,
    (context) =>
      setStaffStatusAsStaff(context, {
        eventBase: "shop.staff.archive",
        nextStatus: "archived",
        reason,
        staffId: target.staffId,
      }),
    (context) =>
      context.supabase.rpc("shop_staff_archive", {
        p_reason: reason,
        p_shop_id: context.selectedShop.shopId,
        p_staff_id: target.staffId,
      }),
  );
}

export async function forceStaffCredentialRotation(
  input: StaffTargetInput,
): Promise<ShopAdminActionResult> {
  const target = normalizeStaffTarget(input);

  if (!target.staffId) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  if (!reasonRequired(target.reason)) {
    return sensitiveReasonError();
  }
  const reason = target.reason;

  return staffRpcResult(
    target.requestedShopId,
    (context) =>
      forceStaffCredentialRotationAsStaff(context, {
        reason,
        staffId: target.staffId,
      }),
    (context) =>
      context.supabase.rpc("shop_staff_force_credential_rotation", {
        p_reason: reason,
        p_shop_id: context.selectedShop.shopId,
        p_staff_id: target.staffId,
      }),
  );
}

export async function clearStaffLockout(
  input: StaffTargetInput,
): Promise<ShopAdminActionResult> {
  const target = normalizeStaffTarget(input);

  if (!target.staffId) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  if (!reasonRequired(target.reason)) {
    return sensitiveReasonError();
  }
  const reason = target.reason;

  return staffRpcResult(
    target.requestedShopId,
    (context) =>
      clearStaffLockoutAsStaff(context, {
        reason,
        staffId: target.staffId,
      }),
    (context) =>
      context.supabase.rpc("shop_staff_clear_lockout", {
        p_reason: reason,
        p_shop_id: context.selectedShop.shopId,
        p_staff_id: target.staffId,
      }),
  );
}

async function staffWebLifecycleResult(
  requestedShopId: string | undefined,
  staffCall: (
    context: StaffManagerMutationContext,
  ) => Promise<ShopAdminActionResult>,
  personalCall: Parameters<typeof runStaffWebLifecycleShopAdminMutation>[2],
) {
  const context = await resolveShopActionContext(requestedShopId, "staff.manage");

  if (context.status !== "ready") {
    return context.result;
  }

  return runStaffWebLifecycleShopAdminMutation(
    context,
    staffCall,
    personalCall,
  );
}

export async function revokeStaffWebAccess(
  input: StaffTargetInput,
): Promise<ShopAdminActionResult> {
  const target = normalizeStaffTarget(input);

  if (!target.staffId) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  if (!reasonRequired(target.reason)) {
    return sensitiveReasonError();
  }
  const reason = target.reason;

  return staffWebLifecycleResult(
    target.requestedShopId,
    (context) =>
      revokeStaffWebAccessAsStaff(context, {
        reason,
        staffId: target.staffId,
      }),
    (context, supabase) =>
      revokeStaffWebAccessAsPersonalAccount(context, supabase, {
        reason,
        staffId: target.staffId,
      }),
  );
}

export async function revokeStaffWebSessions(
  input: StaffTargetInput,
): Promise<ShopAdminActionResult> {
  const target = normalizeStaffTarget(input);

  if (!target.staffId) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  if (!reasonRequired(target.reason)) {
    return sensitiveReasonError();
  }
  const reason = target.reason;

  return staffWebLifecycleResult(
    target.requestedShopId,
    (context) =>
      revokeStaffWebSessionsAsStaff(context, {
        reason,
        staffId: target.staffId,
      }),
    (context, supabase) =>
      revokeStaffWebSessionsAsPersonalAccount(context, supabase, {
        reason,
        staffId: target.staffId,
      }),
  );
}

export async function updateStaffRolePermissions(
  input: UpdateStaffRolePermissionsInput,
): Promise<ShopAdminActionResult> {
  if (!input.roleKey.trim()) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  return staffWebLifecycleResult(
    input.requestedShopId,
    (context) =>
      updateStaffRolePermissionsAsStaff(context, {
        permissions: input.permissions,
        roleKey: input.roleKey,
        templateKey: input.templateKey,
      }),
    (context, supabase) =>
      updateStaffRolePermissionsAsPersonalAccount(context, supabase, input),
  );
}
