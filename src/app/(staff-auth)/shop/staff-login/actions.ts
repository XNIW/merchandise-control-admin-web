"use server";

import { headers } from "next/headers";
import { redirect, RedirectType } from "next/navigation";
import { safeShopAdminNextPath } from "@/lib/auth/oauth-redirect";
import {
  authenticateStaffManagerWebLogin,
  type StaffWebLoginCode,
  type StaffWebLoginResult,
} from "@/server/shop-admin/staff-web-auth";

type ShopCodeLoginFormCode = StaffWebLoginCode | "idle";
type PublicShopCodeLoginFormCode = ShopCodeLoginFormCode | "sign_in_blocked";

export type ShopCodeLoginFormState = {
  code: PublicShopCodeLoginFormCode;
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

function nextPathFromForm(formData: FormData) {
  const requested = value(formData, "next");

  return safeShopAdminNextPath(requested, "/shop");
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

const staffWebIdentityFailureCodes = new Set<StaffWebLoginCode>([
  "credential_invalid",
  "locked",
  "shop_inactive",
  "shop_not_found",
  "staff_inactive",
  "staff_not_allowed",
  "staff_not_found",
]);

function publicStaffWebLoginCode(code: StaffWebLoginCode): PublicShopCodeLoginFormCode {
  return staffWebIdentityFailureCodes.has(code) ? "sign_in_blocked" : code;
}

function messageForStaffWebLoginCode(code: PublicShopCodeLoginFormCode) {
  const signInBlockedMessage =
    "Sign-in was blocked. Check the credentials or try again later.";
  const messages: Record<PublicShopCodeLoginFormCode, string> = {
    credential_invalid: signInBlockedMessage,
    database_error:
      "Sign-in could not be verified because of a server/database error.",
    idle: "",
    locked: signInBlockedMessage,
    not_configured: "Shop-code staff access is not configured in this runtime.",
    server_admin_not_configured:
      "Sign-in cannot be verified because the server admin runtime is not configured.",
    shop_inactive: signInBlockedMessage,
    shop_not_found: signInBlockedMessage,
    sign_in_blocked: signInBlockedMessage,
    staff_inactive: signInBlockedMessage,
    staff_not_allowed: signInBlockedMessage,
    staff_not_found: signInBlockedMessage,
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
      forwardedHost: headerStore.get("x-forwarded-host"),
      forwardedProto: headerStore.get("x-forwarded-proto"),
      host: headerStore.get("host"),
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

  const publicCode = publicStaffWebLoginCode(result.code);

  return {
    code: publicCode,
    message: messageForStaffWebLoginCode(publicCode),
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

  redirect(resultPath(publicStaffWebLoginCode(result.code), nextPath), RedirectType.replace);
}
