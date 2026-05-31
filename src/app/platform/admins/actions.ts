"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import {
  grantPlatformAdmin,
  revokePlatformAdmin,
} from "@/server/platform-admin/admin-actions";

function value(formData: FormData, key: string) {
  const raw = formData.get(key);

  return typeof raw === "string" ? raw : "";
}

function revalidatePlatformAdmins() {
  revalidatePath("/platform/admins");
  revalidatePath("/platform/operations");
  revalidatePath("/platform/users");
}

function redirectWithAdminResult(
  operation: "admin_grant" | "admin_revoke",
  result: Awaited<ReturnType<typeof grantPlatformAdmin>>,
) {
  revalidatePlatformAdmins();
  redirect(
    `/platform/admins?operation=${operation}&result=${result.code}`,
    RedirectType.replace,
  );
}

export async function grantPlatformAdminAction(formData: FormData) {
  const result = await grantPlatformAdmin({
    confirmation: value(formData, "confirmation"),
    profileId: value(formData, "profileId"),
    reason: value(formData, "reason"),
  });

  redirectWithAdminResult("admin_grant", result);
}

export async function revokePlatformAdminAction(formData: FormData) {
  const result = await revokePlatformAdmin({
    confirmation: value(formData, "confirmation"),
    profileId: value(formData, "profileId"),
    reason: value(formData, "reason"),
  });

  redirectWithAdminResult("admin_revoke", result);
}
