"use server";

import { headers } from "next/headers";
import { redirect, RedirectType } from "next/navigation";
import {
  authenticateStaffManagerWebLogin,
  type StaffWebLoginCode,
  type StaffWebLoginResult,
} from "@/server/shop-admin/staff-web-auth";

type ShopCodeLoginFormCode = StaffWebLoginCode | "idle";

export type ShopCodeLoginFormState = {
  code: ShopCodeLoginFormCode;
  message: string;
  ok: boolean;
  shouldFocusCredential: boolean;
  values: {
    shopCode: string;
    staffCode: string;
  };
};

function value(formData: FormData, key: string) {
  const raw = formData.get(key);

  return typeof raw === "string" ? raw : "";
}

function normalizeVisibleCode(raw: string) {
  return raw.trim().toUpperCase().slice(0, 32);
}

function isSafeInternalNextPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//");
}

function nextPathFromForm(formData: FormData) {
  const requested = value(formData, "next");

  return isSafeInternalNextPath(requested) ? requested : "/shop";
}

function submittedValues(formData: FormData): ShopCodeLoginFormState["values"] {
  return {
    shopCode: normalizeVisibleCode(value(formData, "shopCode")),
    staffCode: normalizeVisibleCode(value(formData, "staffCode")),
  };
}

function resultPath(result: string, nextPath: string) {
  const params = new URLSearchParams({
    mode: "shop-code",
    next: nextPath,
    result,
  });

  return `/auth/login?${params.toString()}`;
}

function messageForStaffWebLoginCode(code: ShopCodeLoginFormCode) {
  const messages: Record<ShopCodeLoginFormCode, string> = {
    credential_invalid: "PIN/password is not correct for this staff account.",
    database_error:
      "Sign-in could not be verified because of a server/database error.",
    idle: "",
    locked:
      "Sign-in is temporarily blocked. Try again later or ask an admin to reset access.",
    not_configured: "Shop-code staff access is not configured in this runtime.",
    server_admin_not_configured:
      "Sign-in cannot be verified because the server admin runtime is not configured.",
    shop_inactive: "This shop is not active. Contact platform support.",
    shop_not_found: "Shop code was not found. Check the shop code and try again.",
    staff_inactive:
      "This staff account cannot open Admin Console. Ask a manager to reset access.",
    staff_not_allowed:
      "This staff account cannot open Admin Console. Use a manager staff account.",
    staff_not_found: "Staff code was not found for this shop.",
    success: "",
    unknown_error: "Sign-in could not be verified. Try again.",
    validation_failed: "Check Shop code, Staff code, and PIN/password and try again.",
  };

  return messages[code];
}

async function authenticateFromFormData(
  formData: FormData,
): Promise<StaffWebLoginResult> {
  const headerStore = await headers();

  return authenticateStaffManagerWebLogin(
    {
      credential: value(formData, "credential"),
      staffCode: value(formData, "staffCode"),
      shopCode: value(formData, "shopCode"),
    },
    {
      userAgent: headerStore.get("user-agent"),
    },
  );
}

export async function staffManagerWebLoginFormAction(
  _previousState: ShopCodeLoginFormState,
  formData: FormData,
): Promise<ShopCodeLoginFormState> {
  const nextPath = nextPathFromForm(formData);
  const result = await authenticateFromFormData(formData);

  if (result.ok) {
    redirect(nextPath, RedirectType.replace);
  }

  return {
    code: result.code,
    message: messageForStaffWebLoginCode(result.code),
    ok: false,
    shouldFocusCredential: true,
    values: submittedValues(formData),
  };
}

export async function staffManagerWebLoginAction(formData: FormData) {
  const nextPath = nextPathFromForm(formData);
  const result = await authenticateFromFormData(formData);

  if (result.ok) {
    redirect(nextPath, RedirectType.replace);
  }

  redirect(resultPath(result.code, nextPath), RedirectType.replace);
}
