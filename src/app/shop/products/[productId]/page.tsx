import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getShopCatalogDetailSectionForRequest } from "@/server/shop-admin/shop-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Product Detail");
}

export const dynamic = "force-dynamic";

type ShopPageParams = Promise<{
  productId: string;
}>;
type ShopPageSearchParams = Promise<{
  shop_id?: string | string[];
}>;

function getRequestedShopId(searchParams: { shop_id?: string | string[] }) {
  const value = searchParams.shop_id;

  return Array.isArray(value) ? value[0] : value;
}

export default async function ShopProductDetailPage({
  params,
  searchParams,
}: {
  params: ShopPageParams;
  searchParams: ShopPageSearchParams;
}) {
  const [{ productId }, query] = await Promise.all([params, searchParams]);
  const section = await getShopCatalogDetailSectionForRequest(
    "product",
    productId,
    getRequestedShopId(query),
  );

  return <ShopSectionPage section={section} />;
}
