import { PlatformPage } from "@/components/platform/PlatformPage";
import { getI18n } from "@/i18n/get-locale";
import { createLocalizedPageMetadata } from "@/i18n/metadata";
import { translateText } from "@/i18n/translate-sections";
import { getPlatformShopAdminDetailForRequest } from "@/server/platform-admin/platform-section-data";

export function generateMetadata() {
  return createLocalizedPageMetadata("Shop Admin Detail");
}

export const dynamic = "force-dynamic";

type ShopAdminDetailParams = Promise<{
  profileId: string;
}>;

type ShopAdminDetailSearchParams = Promise<{
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
      parsed.pathname !== "/platform/shop-admins"
    ) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export default async function PlatformShopAdminDetailPage({
  params,
  searchParams,
}: {
  params: ShopAdminDetailParams;
  searchParams?: ShopAdminDetailSearchParams;
}) {
  const { profileId } = await params;
  const query = searchParams ? await searchParams : {};
  const fallbackBackHref = `/platform/shop-admins?selected=${encodeURIComponent(
    profileId,
  )}`;
  const { dictionary } = await getI18n();
  const section = await getPlatformShopAdminDetailForRequest(profileId);

  return (
    <PlatformPage
      section={{
        ...section,
        backHref: safeReturnTo(firstParam(query.returnTo), fallbackBackHref),
        backLabel: translateText(dictionary, "Back to Shop Admins"),
      }}
    />
  );
}
