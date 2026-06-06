"use server";

import { revalidatePath } from "next/cache";
import {
  provisionPlatformStaffManager,
  recoverInitialManager1001,
  type PlatformStaffManagerProvisionResult,
} from "@/server/platform-admin/staff-manager-provisioning";
import {
  createPlatformPendingOwnerInviteWithFiscal,
  createPlatformPosFirstShop,
  createPlatformShopWithOwnerBootstrap,
} from "@/server/platform-admin/shop-actions";
import type { PlatformShopProvisioningResult } from "@/server/platform-admin/action-types";

export type PlatformStaffManagerProvisionState =
  PlatformStaffManagerProvisionResult;

// temporaryCredential is returned only through useActionState, never through URL params.
export type PlatformShopProvisioningState = PlatformShopProvisioningResult;
type OwnerSetupMode = "existing-owner" | "pending-email" | "pos-first";

function value(formData: FormData, key: string) {
  const raw = formData.get(key);

  return typeof raw === "string" ? raw : "";
}

function fiscalValues(formData: FormData) {
  return {
    businessAddress: value(formData, "businessAddress"),
    businessCity: value(formData, "businessCity"),
    businessGiro: value(formData, "businessGiro"),
    companyRut: value(formData, "companyRut"),
    legalRepresentativeRut: value(formData, "legalRepresentativeRut"),
  };
}

function revalidateProvisioning() {
  revalidatePath("/platform/provisioning");
  revalidatePath("/platform/shops");
  revalidatePath("/platform/users");
  revalidatePath("/shop/settings");
}

function ownerSetupModeFromForm(formData: FormData): OwnerSetupMode | null {
  const mode = value(formData, "ownerSetupMode");

  if (
    mode === "existing-owner" ||
    mode === "pending-email" ||
    mode === "pos-first"
  ) {
    return mode;
  }

  return null;
}

function ownerStatusForMode(mode: OwnerSetupMode) {
  if (mode === "existing-owner") {
    return "Personal owner linked";
  }

  if (mode === "pending-email") {
    return "Pending owner setup recorded";
  }

  return "No personal owner yet";
}

function ownerModeForMode(mode: OwnerSetupMode) {
  if (mode === "existing-owner") {
    return "Existing personal owner";
  }

  if (mode === "pending-email") {
    return "Pending owner setup";
  }

  return "POS-first";
}

export async function createPlatformShopFromUnifiedProvisioningAction(
  _previousState: PlatformShopProvisioningState,
  formData: FormData,
): Promise<PlatformShopProvisioningState> {
  const ownerSetupMode = ownerSetupModeFromForm(formData);

  if (!ownerSetupMode) {
    return {
      code: "validation_failed",
      credentialGenerated: false,
      fieldErrors: {
        ownerSetupMode: "Choose owner setup.",
      },
      message: "Check the required fields and try again.",
      ok: false,
    };
  }

  const commonInput = {
    ...fiscalValues(formData),
    reason: value(formData, "reason"),
    shopCode: value(formData, "shopCode"),
    shopName: value(formData, "shopName"),
  };
  const result =
    ownerSetupMode === "existing-owner"
      ? await createPlatformShopWithOwnerBootstrap({
          ...commonInput,
          ownerProfileId: value(formData, "ownerProfileId"),
        })
      : ownerSetupMode === "pending-email"
        ? await createPlatformPendingOwnerInviteWithFiscal({
            ...commonInput,
            ownerContact: value(formData, "ownerEmail"),
          })
        : await createPlatformPosFirstShop(commonInput);

  revalidateProvisioning();

  return {
    ...result,
    companyRut: result.ok ? commonInput.companyRut : result.companyRut,
    ownerMode: result.ok ? ownerModeForMode(ownerSetupMode) : undefined,
    ownerStatus: result.ok ? ownerStatusForMode(ownerSetupMode) : undefined,
    shopName: result.ok ? commonInput.shopName : undefined,
  };
}

export async function createPlatformShopWithOwnerBootstrapAction(
  _previousState: PlatformShopProvisioningState,
  formData: FormData,
): Promise<PlatformShopProvisioningState> {
  const result = await createPlatformShopWithOwnerBootstrap({
    ...fiscalValues(formData),
    ownerProfileId: value(formData, "ownerProfileId"),
    reason: value(formData, "reason"),
    shopCode: value(formData, "shopCode"),
    shopName: value(formData, "shopName"),
  });

  revalidateProvisioning();

  return result;
}

export async function createPlatformPosFirstShopAction(
  _previousState: PlatformShopProvisioningState,
  formData: FormData,
): Promise<PlatformShopProvisioningState> {
  const result = await createPlatformPosFirstShop({
    ...fiscalValues(formData),
    reason: value(formData, "reason"),
    shopCode: value(formData, "shopCode"),
    shopName: value(formData, "shopName"),
  });

  revalidateProvisioning();

  return result;
}

export async function createPlatformPendingOwnerInviteWithFiscalAction(
  _previousState: PlatformShopProvisioningState,
  formData: FormData,
): Promise<PlatformShopProvisioningState> {
  const result = await createPlatformPendingOwnerInviteWithFiscal({
    ...fiscalValues(formData),
    ownerContact: value(formData, "ownerEmail"),
    reason: value(formData, "reason"),
    shopCode: value(formData, "shopCode"),
    shopName: value(formData, "shopName"),
  });

  revalidateProvisioning();

  return result;
}

export async function provisionPlatformStaffManagerAction(
  _previousState: PlatformStaffManagerProvisionState,
  formData: FormData,
): Promise<PlatformStaffManagerProvisionState> {
  const result = await provisionPlatformStaffManager({
    reason: value(formData, "reason"),
    shopId: value(formData, "shopId"),
    staffCode: value(formData, "staffCode"),
  });

  revalidateProvisioning();

  return result;
}

export async function recoverInitialManager1001Action(
  _previousState: PlatformStaffManagerProvisionState,
  formData: FormData,
): Promise<PlatformStaffManagerProvisionState> {
  const result = await recoverInitialManager1001({
    reason: value(formData, "reason"),
    shopId: value(formData, "shopId"),
    staffCode: "1001",
  });

  revalidateProvisioning();

  return result;
}
