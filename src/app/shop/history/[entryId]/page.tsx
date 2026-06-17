import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getShopHistoryDetailSectionForRequest } from "@/server/shop-admin/shop-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("History Detail");
}

export const dynamic = "force-dynamic";

type ShopHistoryDetailPageParams = Promise<{
  entryId: string;
}>;

type ShopHistoryDetailPageSearchParams = Promise<{
  shop_id?: string | string[];
}>;

function getRequestedShopId(searchParams: { shop_id?: string | string[] }) {
  const value = searchParams.shop_id;

  return Array.isArray(value) ? value[0] : value;
}

export default async function ShopHistoryDetailPage({
  params,
  searchParams,
}: {
  params: ShopHistoryDetailPageParams;
  searchParams: ShopHistoryDetailPageSearchParams;
}) {
  const routeParams = await params;
  const query = await searchParams;
  const section = await getShopHistoryDetailSectionForRequest(
    routeParams.entryId,
    getRequestedShopId(query),
  );

  return <ShopSectionPage section={section} />;
}
