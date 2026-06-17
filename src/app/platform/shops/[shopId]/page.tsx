import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import {
  getPlatformShopAccessForRequest,
  getPlatformShopDetailForRequest,
  getPlatformShopProfileForRequest,
} from "@/server/platform-admin/platform-section-data";
import { formatRutForDisplay } from "@/server/platform-admin/shop-action-validation";
import { ShopAdminAccessActions } from "./ShopAdminAccessActions";
import { ShopDangerZoneActions } from "./ShopDangerZoneActions";
import { ShopLifecycleActions } from "./ShopLifecycleActions";
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
  operation?: string | string[];
  profileQuery?: string | string[];
  result?: string | string[];
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
  const profileQuery = firstParam(query.profileQuery);
  const [section, profile, access] = await Promise.all([
    getPlatformShopDetailForRequest(shopId),
    getPlatformShopProfileForRequest(shopId),
    getPlatformShopAccessForRequest(shopId, profileQuery),
  ]);
  const lastResult = {
    operation: firstParam(query.operation),
    result: firstParam(query.result),
  };

  return (
    <PlatformPage
      detailSectionActions={{
        "Shop lifecycle management":
          profile.status === "ready" ? (
            <ShopLifecycleActions
              lastResult={lastResult}
              returnTo={`/platform/shops/${profile.shop.shopId}`}
              shop={{
                shop_code: profile.shop.shopCode,
                shop_id: profile.shop.shopId,
                shop_name: profile.shop.shopName,
                shop_status: profile.shop.shopStatus,
              }}
            />
          ) : null,
        "Admin access / Ownership":
          access.status === "ready" ? (
            <ShopAdminAccessActions
              candidates={access.candidates}
              lastResult={lastResult}
              memberships={access.memberships}
              returnTo={`/platform/shops/${access.shop.shopId}?profileQuery=${encodeURIComponent(
                access.searchQuery,
              )}`}
              searchQuery={access.searchQuery}
              shop={{
                shopCode: access.shop.shopCode,
                shopId: access.shop.shopId,
              }}
            />
          ) : null,
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
        "Danger Zone":
          access.status === "ready" ? (
            <ShopDangerZoneActions
              dependencies={access.dependencies}
              lastResult={lastResult}
              purgeBlockedReasons={access.purgeBlockedReasons}
              returnTo={`/platform/shops/${access.shop.shopId}`}
              shop={{
                shop_code: access.shop.shopCode,
                shop_id: access.shop.shopId,
                shop_name: access.shop.shopName,
                shop_status: access.shop.shopStatus,
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
