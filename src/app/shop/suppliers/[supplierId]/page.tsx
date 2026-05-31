import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getShopCatalogDetailSectionForRequest } from "@/server/shop-admin/shop-section-data";

export const metadata: Metadata = {
  title: "Supplier Detail | MerchandiseControl Admin Web",
  description: "Shop Admin supplier detail for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

type ShopPageParams = Promise<{
  supplierId: string;
}>;
type ShopPageSearchParams = Promise<{
  shop_id?: string | string[];
}>;

function getRequestedShopId(searchParams: { shop_id?: string | string[] }) {
  const value = searchParams.shop_id;

  return Array.isArray(value) ? value[0] : value;
}

export default async function ShopSupplierDetailPage({
  params,
  searchParams,
}: {
  params: ShopPageParams;
  searchParams: ShopPageSearchParams;
}) {
  const [{ supplierId }, query] = await Promise.all([params, searchParams]);
  const section = await getShopCatalogDetailSectionForRequest(
    "supplier",
    supplierId,
    getRequestedShopId(query),
  );

  return <ShopSectionPage section={section} />;
}
