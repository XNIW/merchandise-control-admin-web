import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import {
  getPlatformShopDetailForRequest,
  getPlatformShopProfileForRequest,
} from "@/server/platform-admin/platform-section-data";
import { formatRutForDisplay } from "@/server/platform-admin/shop-action-validation";
import { ShopProfileEditForm } from "./ShopProfileEditForm";

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
  const [section, profile] = await Promise.all([
    getPlatformShopDetailForRequest(shopId),
    getPlatformShopProfileForRequest(shopId),
  ]);

  return (
    <PlatformPage
      detailSectionActions={{
        "Shop profile & fiscal identity":
          profile.status === "ready" ? (
            <ShopProfileEditForm
              endpoint={`/platform/shops/${profile.shop.shopId}/profile`}
              initialValues={{
                businessAddress: profile.shop.businessAddress,
                businessCity: profile.shop.businessCity,
                businessGiro: profile.shop.businessGiro,
                companyRut: formatRutForDisplay(profile.shop.companyRut),
                confirmation: "",
                legalRepresentativeRut: formatRutForDisplay(
                  profile.shop.legalRepresentativeRut,
                ),
                reason: "",
                shopName: profile.shop.shopName,
              }}
            />
          ) : null,
      }}
      section={{
        ...section,
        backHref: safeReturnTo(firstParam(query.returnTo), fallbackBackHref),
        backLabel: "Back to Shops",
      }}
    />
  );
}
