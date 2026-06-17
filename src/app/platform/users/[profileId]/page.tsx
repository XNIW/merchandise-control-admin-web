import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformUserDetailForRequest } from "@/server/platform-admin/platform-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("User Detail");
}

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

    if (parsed.origin !== "http://platform.local") {
      return fallback;
    }

    if (
      parsed.pathname !== "/platform/users" &&
      parsed.pathname !== "/platform/shop-admins"
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
  const backHref = safeReturnTo(firstParam(query.returnTo), fallbackBackHref);
  const section = await getPlatformUserDetailForRequest(profileId);
  const fromShopAdmins = backHref.startsWith("/platform/shop-admins");

  return (
    <PlatformPage
      section={{
        ...section,
        key: fromShopAdmins ? "shopAdmins" : section.key,
        backHref,
        backLabel: fromShopAdmins ? "Back to Shop Admins" : "Back to Users",
      }}
    />
  );
}
