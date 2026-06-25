import { redirect } from "next/navigation";
import { safeShopAdminNextPath } from "@/lib/auth/oauth-redirect";

export const dynamic = "force-dynamic";

type StaffManagerWebLoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeNextPath(value: string | undefined) {
  return safeShopAdminNextPath(value, "/shop");
}

export default async function StaffManagerWebLoginPage({
  searchParams,
}: StaffManagerWebLoginPageProps) {
  const params = await searchParams;
  const loginParams = new URLSearchParams({
    mode: "shop-code",
    next: safeNextPath(firstParam(params.next)),
  });

  redirect(`/auth/login?${loginParams.toString()}`);
}
