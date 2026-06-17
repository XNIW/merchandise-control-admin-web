import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getShopMemberDetailSectionForRequest } from "@/server/shop-admin/shop-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Member Detail");
}

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
