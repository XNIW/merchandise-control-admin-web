import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformShopDetailForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "Shop Detail | MerchandiseControl Admin Web",
  description: "Platform Admin shop detail.",
};

export const dynamic = "force-dynamic";

type ShopDetailParams = Promise<{
  shopId: string;
}>;

type ShopDetailSearchParams = Promise<{
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
      parsed.pathname !== "/platform/shops"
    ) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export default async function PlatformShopDetailPage({
  params,
  searchParams,
}: {
  params: ShopDetailParams;
  searchParams?: ShopDetailSearchParams;
}) {
  const { shopId } = await params;
  const query = searchParams ? await searchParams : {};
  const fallbackBackHref = `/platform/shops?selected=${encodeURIComponent(shopId)}`;
  const section = await getPlatformShopDetailForRequest(shopId);

  return (
    <PlatformPage
      section={{
        ...section,
        backHref: safeReturnTo(firstParam(query.returnTo), fallbackBackHref),
        backLabel: "Back to Shops",
      }}
    />
  );
}
