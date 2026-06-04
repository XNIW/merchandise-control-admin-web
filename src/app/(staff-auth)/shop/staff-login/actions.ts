"use server";

import { headers } from "next/headers";
import { redirect, RedirectType } from "next/navigation";
import { authenticateStaffManagerWebLogin } from "@/server/shop-admin/staff-web-auth";

function value(formData: FormData, key: string) {
  const raw = formData.get(key);

  return typeof raw === "string" ? raw : "";
}

function resultPath(result: string) {
  return `/shop/staff-login?result=${encodeURIComponent(result)}`;
}

export async function staffManagerWebLoginAction(formData: FormData) {
  const headerStore = await headers();
  const result = await authenticateStaffManagerWebLogin(
    {
      credential: value(formData, "credential"),
      staffCode: value(formData, "staffCode"),
      shopCode: value(formData, "shopCode"),
    },
    {
      userAgent: headerStore.get("user-agent"),
    },
  );

  if (result.ok) {
    redirect("/shop", RedirectType.replace);
  }

  redirect(resultPath(result.code), RedirectType.replace);
}
