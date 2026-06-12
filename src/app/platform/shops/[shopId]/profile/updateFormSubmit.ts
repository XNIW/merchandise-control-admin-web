import "server-only";

import { revalidatePath } from "next/cache";
import type {
  PlatformShopActionResult,
  PlatformShopProfileFormValues,
} from "@/server/platform-admin/action-types";
import { updatePlatformShopProfile } from "@/server/platform-admin/shop-profile-actions";
import {
  formatRutForDisplay,
  normalizeShopName,
} from "@/server/platform-admin/shop-action-validation";
import type { PlatformProvisioningRequestAuthDiagnostics } from "@/server/platform-admin/provisioning-request-auth";

export type { PlatformShopProfileFormValues } from "@/server/platform-admin/action-types";

export type PlatformShopProfileUpdateState = PlatformShopActionResult & {
  values?: PlatformShopProfileFormValues;
};

type PlatformShopProfileAuthContext = {
  authorizationHeader?: string | null;
  browserSupabaseHost?: string | null;
  diagnostics?: PlatformProvisioningRequestAuthDiagnostics;
  formMode?: string | null;
  requestContentType?: string | null;
};

function value(formData: FormData, key: string) {
  const raw = formData.get(key);

  return typeof raw === "string" ? raw : "";
}

function valuesFromFormData(formData: FormData): PlatformShopProfileFormValues {
  return {
    businessAddress: value(formData, "businessAddress").trim(),
    businessCity: value(formData, "businessCity").trim(),
    businessGiro: value(formData, "businessGiro").trim(),
    companyRut: formatRutForDisplay(value(formData, "companyRut")),
    confirmation: value(formData, "confirmation").trim(),
    legalRepresentativeRut: formatRutForDisplay(
      value(formData, "legalRepresentativeRut"),
    ),
    reason: value(formData, "reason").trim(),
    shopName: normalizeShopName(value(formData, "shopName")),
  };
}

function revalidateShopProfile(shopId: string) {
  revalidatePath(`/platform/shops/${shopId}`);
  revalidatePath("/platform/shops");
  revalidatePath("/shop/settings");
}

export async function submitPlatformShopProfileUpdateForm(
  shopId: string,
  formData: FormData,
  authContext: PlatformShopProfileAuthContext = {},
): Promise<PlatformShopProfileUpdateState> {
  const submittedValues = valuesFromFormData(formData);
  const result = await updatePlatformShopProfile(
    {
      ...submittedValues,
      shopId,
    },
    authContext,
  );

  if (result.ok) {
    revalidateShopProfile(shopId);
  }

  return {
    ...result,
    formError: result.ok ? undefined : result.message,
    values: result.ok ? undefined : submittedValues,
  };
}
