import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformUserDetailForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "User Detail | MerchandiseControl Admin Web",
  description: "Platform Admin user detail.",
};

export const dynamic = "force-dynamic";

type UserDetailParams = Promise<{
  profileId: string;
}>;

type UserDetailSearchParams = Promise<{
  returnTo?: string | string[];
}>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeReturnTo(value: string | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "http://platform.local");

    if (
      parsed.origin !== "http://platform.local" ||
      parsed.pathname !== "/platform/users"
    ) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export default async function PlatformUserDetailPage({
  params,
  searchParams,
}: {
  params: UserDetailParams;
  searchParams?: UserDetailSearchParams;
}) {
  const { profileId } = await params;
  const query = searchParams ? await searchParams : {};
  const fallbackBackHref = `/platform/users?selected=${encodeURIComponent(profileId)}`;
  const section = await getPlatformUserDetailForRequest(profileId);

  return (
    <PlatformPage
      section={{
        ...section,
        backHref: safeReturnTo(firstParam(query.returnTo), fallbackBackHref),
        backLabel: "Back to Users",
      }}
    />
  );
}
