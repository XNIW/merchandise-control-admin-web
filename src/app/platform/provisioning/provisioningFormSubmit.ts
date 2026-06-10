import "server-only";

import { revalidatePath } from "next/cache";
import {
  recoverInitialManager1001,
  type PlatformStaffManagerProvisionResult,
} from "@/server/platform-admin/staff-manager-provisioning";
import {
  createPlatformPendingOwnerInviteWithFiscal,
  createPlatformPosFirstShop,
  createPlatformShopWithOwnerBootstrap,
} from "@/server/platform-admin/shop-actions";
import {
  deriveShopCodeFromRut,
  formatRutForDisplay,
  normalizeOwnerContact,
  normalizeShopCode,
  normalizeShopName,
} from "@/server/platform-admin/shop-action-validation";
import type {
  PlatformShopProvisioningFormValues,
  PlatformShopProvisioningResult,
} from "@/server/platform-admin/action-types";
import type { PlatformProvisioningRequestAuthDiagnostics } from "@/server/platform-admin/provisioning-request-auth";

export type { PlatformShopProvisioningFormValues } from "@/server/platform-admin/action-types";

export type PlatformProvisioningAuthContext = {
  authorizationHeader?: string | null;
  browserSupabaseHost?: string | null;
  diagnostics?: PlatformProvisioningRequestAuthDiagnostics;
  formMode?: string | null;
  requestContentType?: string | null;
};

export type PlatformStaffManagerProvisionState =
  PlatformStaffManagerProvisionResult;
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

function booleanValue(formData: FormData, key: string) {
  return formData.get(key) === "true";
}

function displayRutValue(raw: string) {
  return formatRutForDisplay(raw);
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

function formValuesFromFormData(
  formData: FormData,
  ownerSetupMode = ownerSetupModeFromForm(formData) ?? "pos-first",
): PlatformShopProvisioningFormValues {
  const useCompanyRutAsShopCode = booleanValue(
    formData,
    "useCompanyRutAsShopCode",
  );
  const companyRut = displayRutValue(value(formData, "companyRut"));

  return {
    ...fiscalValues(formData),
    businessAddress: value(formData, "businessAddress").trim(),
    businessCity: value(formData, "businessCity").trim(),
    businessGiro: value(formData, "businessGiro").trim(),
    companyRut,
    legalRepresentativeRut: displayRutValue(
      value(formData, "legalRepresentativeRut"),
    ),
    ownerContact: normalizeOwnerContact(value(formData, "ownerEmail")),
    ownerProfileId: value(formData, "ownerProfileId"),
    ownerSetupMode,
    reason: value(formData, "reason").trim(),
    shopCode: useCompanyRutAsShopCode
      ? deriveShopCodeFromRut(companyRut)
      : normalizeShopCode(value(formData, "shopCode")),
    shopName: normalizeShopName(value(formData, "shopName")),
    useCompanyRutAsShopCode,
  };
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

function revalidateProvisioning() {
  revalidatePath("/platform/provisioning");
  revalidatePath("/platform/shops");
  revalidatePath("/platform/users");
  revalidatePath("/shop/settings");
}

export async function submitUnifiedPlatformShopProvisioningForm(
  formData: FormData,
  authContext: PlatformProvisioningAuthContext = {},
): Promise<PlatformShopProvisioningState> {
  const ownerSetupMode = ownerSetupModeFromForm(formData);
  const submittedValues = formValuesFromFormData(
    formData,
    ownerSetupMode ?? "pos-first",
  );

  if (!ownerSetupMode) {
    return {
      code: "validation_failed",
      credentialGenerated: false,
      fieldErrors: {
        ownerSetupMode: "Choose owner setup.",
      },
      formError: "Choose owner setup.",
      message: "Check the required fields and try again.",
      ok: false,
      values: submittedValues,
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
      ? await createPlatformShopWithOwnerBootstrap(
          {
            ...commonInput,
            ownerProfileId: value(formData, "ownerProfileId"),
          },
          authContext,
        )
      : ownerSetupMode === "pending-email"
        ? await createPlatformPendingOwnerInviteWithFiscal(
            {
              ...commonInput,
              ownerContact: value(formData, "ownerEmail"),
            },
            authContext,
          )
        : await createPlatformPosFirstShop(commonInput, authContext);

  if (result.ok) {
    revalidateProvisioning();
  }

  return {
    ...result,
    companyRut: result.ok
      ? submittedValues.companyRut
      : (result.companyRut ?? submittedValues.companyRut),
    formError: result.ok ? undefined : result.message,
    ownerMode: result.ok ? ownerModeForMode(ownerSetupMode) : undefined,
    ownerStatus: result.ok ? ownerStatusForMode(ownerSetupMode) : undefined,
    shopName: result.ok ? result.shopName : undefined,
    values: result.ok ? undefined : submittedValues,
  };
}

export async function submitInitialManager1001RecoveryForm(
  formData: FormData,
  authContext: PlatformProvisioningAuthContext = {},
): Promise<PlatformStaffManagerProvisionState> {
  const result = await recoverInitialManager1001(
    {
      reason: value(formData, "reason"),
      shopCode: value(formData, "shopCode"),
      shopId: value(formData, "shopId"),
      staffCode: "1001",
    },
    authContext,
  );

  revalidateProvisioning();

  return result;
}
