import "server-only";

import { randomBytes } from "node:crypto";
import {
  mapShopAdminRpcResult,
  resolveShopActionContext,
  shopAdminActionResult,
  type ShopAdminActionResult,
} from "./action-context";
import { hashStaffCredential } from "./staff-credentials";

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

type ResetCredentialInput = StaffTargetInput & {
  credentialKind?: string;
};

function normalizeCredentialKind(value: string | undefined): StaffCredentialKind {
  return value === "pin" ? "pin" : "password";
}

export function generateTemporaryStaffCredential(kind: StaffCredentialKind) {
  if (kind === "pin") {
    const digits = String(randomBytes(4).readUInt32BE(0) % 1000000).padStart(
      6,
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

async function staffRpcResult(
  requestedShopId: string | undefined,
  call: (
    context: Extract<
      Awaited<ReturnType<typeof resolveShopActionContext>>,
      { status: "ready" }
    >,
  ) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<ShopAdminActionResult> {
  const context = await resolveShopActionContext(requestedShopId, "staff.manage");

  if (context.status !== "ready") {
    return context.result;
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
  const result = await staffRpcResult(input.requestedShopId, (context) =>
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
  const credentialKind = normalizeCredentialKind(input.credentialKind);

  if (!input.staffId.trim()) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  const { credentialHash, temporaryCredential } =
    await staffCredentialHash(credentialKind);
  const result = await staffRpcResult(input.requestedShopId, (context) =>
    context.supabase.rpc("shop_staff_reset_credential", {
      p_credential_hash: credentialHash,
      p_credential_kind: credentialKind,
      p_shop_id: context.selectedShop.shopId,
      p_staff_id: input.staffId,
    }),
  );

  return result.ok ? { ...result, temporaryCredential } : result;
}

export async function suspendStaff(
  input: StaffTargetInput,
): Promise<ShopAdminActionResult> {
  if (!input.staffId.trim()) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  return staffRpcResult(input.requestedShopId, (context) =>
    context.supabase.rpc("shop_staff_suspend", {
      p_reason: input.reason,
      p_shop_id: context.selectedShop.shopId,
      p_staff_id: input.staffId,
    }),
  );
}

export async function reactivateStaff(
  input: StaffTargetInput,
): Promise<ShopAdminActionResult> {
  if (!input.staffId.trim()) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  return staffRpcResult(input.requestedShopId, (context) =>
    context.supabase.rpc("shop_staff_reactivate", {
      p_reason: input.reason,
      p_shop_id: context.selectedShop.shopId,
      p_staff_id: input.staffId,
    }),
  );
}

export async function archiveStaff(
  input: StaffTargetInput,
): Promise<ShopAdminActionResult> {
  if (!input.staffId.trim()) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  return staffRpcResult(input.requestedShopId, (context) =>
    context.supabase.rpc("shop_staff_archive", {
      p_reason: input.reason,
      p_shop_id: context.selectedShop.shopId,
      p_staff_id: input.staffId,
    }),
  );
}
