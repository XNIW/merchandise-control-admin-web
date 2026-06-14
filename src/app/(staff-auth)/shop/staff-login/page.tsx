import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type StaffManagerWebLoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeNextPath(value: string | undefined) {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return "/shop";
  }

  return value;
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
