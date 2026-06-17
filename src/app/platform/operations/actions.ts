"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import {
  activatePlatformShop,
  assignPlatformShopMember,
  createPlatformShop,
  createPlatformPendingOwnerInvite,
  emergencyRevokePlatformDevice,
  reactivatePlatformShop,
  purgePlatformShop,
  restorePlatformShop,
  softDeletePlatformShop,
  suspendPlatformShop,
  revokePlatformShopMember,
} from "@/server/platform-admin/shop-actions";

function value(formData: FormData, key: string) {
  const raw = formData.get(key);

  return typeof raw === "string" ? raw : "";
}

function revalidatePlatformOperations() {
  revalidatePath("/platform/operations");
  revalidatePath("/platform/provisioning");
  revalidatePath("/platform/shops");
  revalidatePath("/platform/devices");
}

function safeReturnTo(formData?: FormData, fallback = "/platform/operations") {
  const returnTo = formData ? value(formData, "returnTo") : "";

  if (!returnTo) {
    return fallback;
  }

  try {
    const parsed = new URL(returnTo, "http://platform.local");

    if (parsed.origin !== "http://platform.local") {
      return fallback;
    }

    if (
      parsed.pathname === "/platform/operations" ||
      parsed.pathname === "/platform/provisioning" ||
      parsed.pathname === "/platform/shops" ||
      parsed.pathname.startsWith("/platform/shops/")
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function revalidateShopDetailFromForm(formData?: FormData) {
  const shopId = formData ? value(formData, "shopId") : "";

  if (shopId) {
    revalidatePath(`/platform/shops/${shopId}`);
  }
}

function redirectWithActionResult(
  operation:
    | "create"
    | "pending_owner_invite"
    | "activate"
    | "suspend"
    | "reactivate"
    | "restore"
    | "soft_delete"
    | "purge"
    | "force_purge"
    | "assign_member"
    | "revoke_member"
    | "device_revoke",
  result: Awaited<ReturnType<typeof createPlatformShop>>,
  formData?: FormData,
) {
  revalidatePlatformOperations();
  revalidateShopDetailFromForm(formData);

  const target = safeReturnTo(formData);
  const separator = target.includes("?") ? "&" : "?";

  redirect(
    `${target}${separator}operation=${operation}&result=${result.code}`,
    RedirectType.replace,
  );
}

export async function createPlatformShopAction(formData: FormData) {
  const result = await createPlatformShop({
    ownerProfileId: value(formData, "ownerProfileId"),
    reason: value(formData, "reason"),
    shopCode: value(formData, "shopCode"),
    shopName: value(formData, "shopName"),
  });

  redirectWithActionResult("create", result, formData);
}

export async function createPlatformPendingOwnerInviteAction(formData: FormData) {
  const result = await createPlatformPendingOwnerInvite({
    ownerContact: value(formData, "ownerEmail"),
    reason: value(formData, "reason"),
    shopCode: value(formData, "shopCode"),
    shopName: value(formData, "shopName"),
  });

  redirectWithActionResult("pending_owner_invite", result, formData);
}

export async function activatePlatformShopAction(formData: FormData) {
  const result = await activatePlatformShop({
    reason: value(formData, "reason"),
    shopCodeConfirmation: value(formData, "shopCodeConfirmation"),
    shopId: value(formData, "shopId"),
  });

  redirectWithActionResult("activate", result, formData);
}

export async function suspendPlatformShopAction(formData: FormData) {
  const result = await suspendPlatformShop({
    confirmation: value(formData, "confirmation"),
    reason: value(formData, "reason"),
    shopId: value(formData, "shopId"),
  });

  redirectWithActionResult("suspend", result, formData);
}

export async function reactivatePlatformShopAction(formData: FormData) {
  const result = await reactivatePlatformShop({
    confirmation: value(formData, "confirmation"),
    reason: value(formData, "reason"),
    shopId: value(formData, "shopId"),
  });

  redirectWithActionResult("reactivate", result, formData);
}

export async function softDeletePlatformShopAction(formData: FormData) {
  const result = await softDeletePlatformShop({
    reason: value(formData, "reason"),
    shopCodeConfirmation: value(formData, "shopCodeConfirmation"),
    shopId: value(formData, "shopId"),
  });

  redirectWithActionResult("soft_delete", result, formData);
}

export async function restorePlatformShopAction(formData: FormData) {
  const result = await restorePlatformShop({
    reason: value(formData, "reason"),
    shopCodeConfirmation: value(formData, "shopCodeConfirmation"),
    shopId: value(formData, "shopId"),
  });

  redirectWithActionResult("restore", result, formData);
}

export async function changePlatformShopStatusAction(formData: FormData) {
  const lifecycleAction = value(formData, "lifecycleAction");
  const shopId = value(formData, "shopId");
  const reason = value(formData, "reason");
  const shopCodeConfirmation = value(formData, "shopCodeConfirmation");

  if (lifecycleAction === "activate") {
    const result = await activatePlatformShop({
      reason,
      shopCodeConfirmation,
      shopId,
    });

    redirectWithActionResult("activate", result, formData);
  }

  if (lifecycleAction === "reactivate") {
    const result = await reactivatePlatformShop({
      confirmation: shopCodeConfirmation,
      reason,
      shopId,
    });

    redirectWithActionResult("reactivate", result, formData);
  }

  if (lifecycleAction === "restore") {
    const result = await restorePlatformShop({
      reason,
      shopCodeConfirmation,
      shopId,
    });

    redirectWithActionResult("restore", result, formData);
  }

  if (lifecycleAction === "suspend") {
    const result = await suspendPlatformShop({
      confirmation: shopCodeConfirmation,
      reason,
      shopId,
    });

    redirectWithActionResult("suspend", result, formData);
  }

  if (lifecycleAction === "soft_delete") {
    const result = await softDeletePlatformShop({
      reason,
      shopCodeConfirmation,
      shopId,
    });

    redirectWithActionResult("soft_delete", result, formData);
  }

  redirectWithActionResult(
    "suspend",
    {
      code: "invalid_state",
      message: "This operation is not available for the current shop state.",
      ok: false,
    },
    formData,
  );
}

export async function assignPlatformShopMemberAction(formData: FormData) {
  const result = await assignPlatformShopMember({
    profileId: value(formData, "profileId"),
    reason: value(formData, "reason"),
    roleKey: value(formData, "roleKey"),
    shopCodeConfirmation: value(formData, "shopCodeConfirmation"),
    shopId: value(formData, "shopId"),
  });

  redirectWithActionResult("assign_member", result, formData);
}

export async function revokePlatformShopMemberAction(formData: FormData) {
  const result = await revokePlatformShopMember({
    reason: value(formData, "reason"),
    shopCodeConfirmation: value(formData, "shopCodeConfirmation"),
    shopId: value(formData, "shopId"),
    shopMemberId: value(formData, "shopMemberId"),
  });

  redirectWithActionResult("revoke_member", result, formData);
}

export async function emergencyRevokePlatformDeviceAction(formData: FormData) {
  const result = await emergencyRevokePlatformDevice({
    confirmation: value(formData, "confirmation"),
    reason: value(formData, "reason"),
    shopDeviceId: value(formData, "shopDeviceId"),
  });

  redirectWithActionResult("device_revoke", result, formData);
}

export async function purgePlatformShopAction(formData: FormData) {
  const mode = value(formData, "purgeMode") === "force_test" ? "force_test" : "normal";
  const result = await purgePlatformShop({
    confirmation: value(formData, "confirmation"),
    mode,
    reason: value(formData, "reason"),
    shopId: value(formData, "shopId"),
  });

  redirectWithActionResult(mode === "force_test" ? "force_purge" : "purge", result, formData);
}
