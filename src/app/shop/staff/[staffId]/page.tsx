import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getShopStaffDetailSectionForRequest } from "@/server/shop-admin/shop-section-data";

export const metadata: Metadata = {
  title: "Staff Detail | MerchandiseControl Admin Web",
  description: "Shop Admin POS staff detail for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

type ShopPageParams = Promise<{
  staffId: string;
}>;
type ShopPageSearchParams = Promise<{
  shop_id?: string | string[];
}>;

function getRequestedShopId(searchParams: { shop_id?: string | string[] }) {
  const value = searchParams.shop_id;

  return Array.isArray(value) ? value[0] : value;
}

export default async function ShopStaffDetailPage({
  params,
  searchParams,
}: {
  params: ShopPageParams;
  searchParams: ShopPageSearchParams;
}) {
  const [{ staffId }, query] = await Promise.all([params, searchParams]);
  const section = await getShopStaffDetailSectionForRequest(
    staffId,
    getRequestedShopId(query),
  );

  return <ShopSectionPage section={section} />;
}
