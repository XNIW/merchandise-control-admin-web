import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";

export const metadata: Metadata = {
  title: "Admin Console | MerchandiseControl Admin Web",
  description:
    "Protected Admin Console entrypoint for MerchandiseControl.",
};

export const dynamic = "force-dynamic";

type ShopPageSearchParams = Promise<{
  shop_id?: string | string[];
}>;

function getRequestedShopId(searchParams: { shop_id?: string | string[] }) {
  const value = searchParams.shop_id;

  return Array.isArray(value) ? value[0] : value;
}

export default async function ShopAdminPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const params = await searchParams;
  const section = await getShopSectionForRequest(
    "overview",
    getRequestedShopId(params),
  );

  return <ShopSectionPage section={section} />;
}
