import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getShopMemberDetailSectionForRequest } from "@/server/shop-admin/shop-section-data";

export const metadata: Metadata = {
  title: "Member Detail | MerchandiseControl Admin Web",
  description: "Shop Admin member detail for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

type ShopPageParams = Promise<{
  memberId: string;
}>;
type ShopPageSearchParams = Promise<{
  shop_id?: string | string[];
}>;

function getRequestedShopId(searchParams: { shop_id?: string | string[] }) {
  const value = searchParams.shop_id;

  return Array.isArray(value) ? value[0] : value;
}

export default async function ShopMemberDetailPage({
  params,
  searchParams,
}: {
  params: ShopPageParams;
  searchParams: ShopPageSearchParams;
}) {
  const [{ memberId }, query] = await Promise.all([params, searchParams]);
  const section = await getShopMemberDetailSectionForRequest(
    memberId,
    getRequestedShopId(query),
  );

  return <ShopSectionPage section={section} />;
}
