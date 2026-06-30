import { createLocalizedPageMetadata } from "@/i18n/metadata";
import { getI18n } from "@/i18n/get-locale";
import { getShopPosRevenueReadModel } from "@/server/shop-admin/pos-revenue-read-model";
import { PosRevenueDashboard } from "./PosRevenueDashboard";

export function generateMetadata() {
  return createLocalizedPageMetadata("POS Revenue");
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
  const [{ dictionary, locale }, readModel] = await Promise.all([
    getI18n(),
    getShopPosRevenueReadModel({
      month,
      requestedShopId,
      year,
    }),
  ]);

  return (
    <PosRevenueDashboard
      initialData={readModel}
      labels={dictionary.exact}
      locale={locale}
      month={readModel.filters.month}
      shopId={requestedShopId}
      year={readModel.filters.year}
    />
  );
}
