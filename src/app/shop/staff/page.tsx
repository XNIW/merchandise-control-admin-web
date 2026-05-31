import type { Metadata } from "next";
import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import { StaffActionPanel } from "@/app/shop/_components/StaffActionPanel";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";

export const metadata: Metadata = {
  title: "POS / Staff | MerchandiseControl Admin Web",
  description: "Shop Admin POS and staff shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

type ShopPageSearchParams = Promise<{
  action?: string | string[];
  result?: string | string[];
  shop_id?: string | string[];
}>;

function getParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];

  return Array.isArray(value) ? value[0] : value;
}

export default async function ShopStaffPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const params = await searchParams;
  const requestedShopId = getParam(params, "shop_id");
  const section = await getShopSectionForRequest(
    "staff",
    requestedShopId,
  );

  return (
    <div className="grid gap-5">
      <ShopSectionPage section={section} />
      <ActionResultBanner
        action={getParam(params, "action")}
        result={getParam(params, "result")}
      />
      <StaffActionPanel selectedShopId={requestedShopId} />
    </div>
  );
}
