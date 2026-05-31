"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import {
  createPlatformShop,
  createPlatformPendingOwnerInvite,
  emergencyRevokePlatformDevice,
  reactivatePlatformShop,
  restorePlatformShop,
  softDeletePlatformShop,
  suspendPlatformShop,
} from "@/server/platform-admin/shop-actions";

function value(formData: FormData, key: string) {
  const raw = formData.get(key);

  return typeof raw === "string" ? raw : "";
}

function revalidatePlatformOperations() {
  revalidatePath("/platform/operations");
  revalidatePath("/platform/shops");
  revalidatePath("/platform/devices");
}

function redirectWithActionResult(
  operation:
    | "create"
    | "pending_owner_invite"
    | "suspend"
    | "reactivate"
    | "restore"
    | "soft_delete"
    | "device_revoke",
  result: Awaited<ReturnType<typeof createPlatformShop>>,
) {
  revalidatePlatformOperations();
  redirect(
    `/platform/operations?operation=${operation}&result=${result.code}`,
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

  redirectWithActionResult("create", result);
}

export async function createPlatformPendingOwnerInviteAction(formData: FormData) {
  const result = await createPlatformPendingOwnerInvite({
    ownerContact: value(formData, "ownerEmail"),
    reason: value(formData, "reason"),
    shopCode: value(formData, "shopCode"),
    shopName: value(formData, "shopName"),
  });

  redirectWithActionResult("pending_owner_invite", result);
}

export async function suspendPlatformShopAction(formData: FormData) {
  const result = await suspendPlatformShop({
    confirmation: value(formData, "confirmation"),
    reason: value(formData, "reason"),
    shopId: value(formData, "shopId"),
  });

  redirectWithActionResult("suspend", result);
}

export async function reactivatePlatformShopAction(formData: FormData) {
  const result = await reactivatePlatformShop({
    confirmation: value(formData, "confirmation"),
    reason: value(formData, "reason"),
    shopId: value(formData, "shopId"),
  });

  redirectWithActionResult("reactivate", result);
}

export async function softDeletePlatformShopAction(formData: FormData) {
  const result = await softDeletePlatformShop({
    reason: value(formData, "reason"),
    shopCodeConfirmation: value(formData, "shopCodeConfirmation"),
    shopId: value(formData, "shopId"),
  });

  redirectWithActionResult("soft_delete", result);
}

export async function restorePlatformShopAction(formData: FormData) {
  const result = await restorePlatformShop({
    reason: value(formData, "reason"),
    shopCodeConfirmation: value(formData, "shopCodeConfirmation"),
    shopId: value(formData, "shopId"),
  });

  redirectWithActionResult("restore", result);
}

export async function emergencyRevokePlatformDeviceAction(formData: FormData) {
  const result = await emergencyRevokePlatformDevice({
    confirmation: value(formData, "confirmation"),
    reason: value(formData, "reason"),
    shopDeviceId: value(formData, "shopDeviceId"),
  });

  redirectWithActionResult("device_revoke", result);
}
