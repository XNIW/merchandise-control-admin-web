"use server";

import { revalidatePath } from "next/cache";
import {
  provisionPlatformStaffManager,
  type PlatformStaffManagerProvisionResult,
} from "@/server/platform-admin/staff-manager-provisioning";

export type PlatformStaffManagerProvisionState =
  PlatformStaffManagerProvisionResult;

function value(formData: FormData, key: string) {
  const raw = formData.get(key);

  return typeof raw === "string" ? raw : "";
}

export async function provisionPlatformStaffManagerAction(
  _previousState: PlatformStaffManagerProvisionState,
  formData: FormData,
): Promise<PlatformStaffManagerProvisionState> {
  const result = await provisionPlatformStaffManager({
    displayName: value(formData, "displayName"),
    reason: value(formData, "reason"),
    shopId: value(formData, "shopId"),
    staffCode: value(formData, "staffCode"),
  });

  revalidatePath("/platform/provisioning");
  revalidatePath("/platform/shops");
  revalidatePath("/platform/users");

  return result;
}
