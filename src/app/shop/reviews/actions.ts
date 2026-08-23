"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  formString,
  optionalFormNumber,
  optionalFormString,
  shopAdminActionResult,
} from "@/server/shop-admin/action-context";
import { moderateCustomerReview } from "@/server/shop-admin/customer-commerce-mutations";

export async function moderateReviewAction(formData: FormData) {
  const reviewId = formString(formData, "review_id");
  const expectedVersion = optionalFormNumber(formData, "expected_version");
  const requestedShopId = optionalFormString(formData, "shop_id");
  const reason = optionalFormString(formData, "reason");
  const target = formString(formData, "target_status");
  const confirmed = formString(formData, "confirmed") === "yes";
  const targetStatus = target === "published" || target === "rejected" ? target : null;
  const result = !confirmed || !targetStatus || expectedVersion === undefined
    ? shopAdminActionResult("validation_failed", { ok: false })
    : await moderateCustomerReview({
        expectedVersion,
        reason,
        requestedShopId,
        reviewId,
        targetStatus,
      });

  revalidatePath("/shop/reviews");
  const params = new URLSearchParams({
    action: result.code,
    result: result.ok ? "success" : "error",
  });
  if (requestedShopId) params.set("shop", requestedShopId);
  redirect(`/shop/reviews?${params.toString()}`);
}
