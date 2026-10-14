"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  formString,
  optionalFormNumber,
  optionalFormString,
  shopAdminActionResult,
} from "@/server/shop-admin/action-context";
import {
  afterSalesTransitionTargets,
  transitionCustomerAfterSales,
  type AfterSalesTransitionTarget,
} from "@/server/shop-admin/customer-commerce-mutations";
import { createAfterSalesEvidenceSignedUrl } from "@/server/shop-admin/customer-commerce-evidence";

export async function transitionAfterSalesAction(formData: FormData) {
  const caseId = formString(formData, "case_id");
  const expectedVersion = optionalFormNumber(formData, "expected_version");
  const target = formString(formData, "target_status");
  const requestedShopId = optionalFormString(formData, "shop_id");
  const noteKey = optionalFormString(formData, "note_key");
  const confirmed = formString(formData, "confirmed") === "yes";
  const targetStatus = afterSalesTransitionTargets.includes(
    target as AfterSalesTransitionTarget,
  )
    ? (target as AfterSalesTransitionTarget)
    : null;
  const result = !confirmed || !targetStatus || expectedVersion === undefined
    ? shopAdminActionResult("validation_failed", { ok: false })
    : await transitionCustomerAfterSales({
        caseId,
        expectedVersion,
        noteKey,
        requestedShopId,
        targetStatus,
      });

  revalidatePath("/shop/after-sales");
  const params = new URLSearchParams({
    action: result.code,
    result: result.ok ? "success" : "error",
  });
  if (requestedShopId) params.set("shop", requestedShopId);
  redirect(`/shop/after-sales?${params.toString()}`);
}

export async function viewAfterSalesEvidenceAction(formData: FormData) {
  const evidenceId = formString(formData, "evidence_id");
  const requestedShopId = optionalFormString(formData, "shop_id");
  const result = await createAfterSalesEvidenceSignedUrl({
    evidenceId,
    requestedShopId,
  });
  if (result.ok) redirect(result.signedUrl);
  const params = new URLSearchParams({ action: result.code, result: "error" });
  if (requestedShopId) params.set("shop", requestedShopId);
  redirect(`/shop/after-sales?${params.toString()}`);
}
