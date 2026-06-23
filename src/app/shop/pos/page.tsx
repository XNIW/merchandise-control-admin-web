import { createLocalizedPageMetadata } from "@/i18n/metadata";
import { getShopPosRevenueReadModel } from "@/server/shop-admin/pos-revenue-read-model";
import { PosRevenueDashboard } from "./PosRevenueDashboard";

export function generateMetadata() {
  return createLocalizedPageMetadata("Incassi POS");
}

export const dynamic = "force-dynamic";

type ShopPageSearchParams = Promise<{
  month?: string | string[];
  shop_id?: string | string[];
  year?: string | string[];
}>;

function getSearchParam(
  searchParams: Awaited<ShopPageSearchParams>,
  key: keyof Awaited<ShopPageSearchParams>,
) {
  const value = searchParams[key];

  return Array.isArray(value) ? value[0] : value;
}

export default async function ShopPosRevenuePage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const params = await searchParams;
  const requestedShopId = getSearchParam(params, "shop_id");
  const month = getSearchParam(params, "month") ?? "";
  const year = getSearchParam(params, "year") ?? "";
  const readModel = await getShopPosRevenueReadModel({
    month,
    requestedShopId,
    year,
  });

  return (
    <PosRevenueDashboard
      initialData={readModel}
      month={readModel.filters.month}
      shopId={requestedShopId}
      year={readModel.filters.year}
    />
  );
}
