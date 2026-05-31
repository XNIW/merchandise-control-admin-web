import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getShopDeviceDetailSectionForRequest } from "@/server/shop-admin/shop-section-data";

export const metadata: Metadata = {
  title: "Device Detail | MerchandiseControl Admin Web",
  description: "Shop Admin device detail for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

type ShopPageParams = Promise<{
  deviceId: string;
}>;
type ShopPageSearchParams = Promise<{
  shop_id?: string | string[];
}>;

function getRequestedShopId(searchParams: { shop_id?: string | string[] }) {
  const value = searchParams.shop_id;

  return Array.isArray(value) ? value[0] : value;
}

export default async function ShopDeviceDetailPage({
  params,
  searchParams,
}: {
  params: ShopPageParams;
  searchParams: ShopPageSearchParams;
}) {
  const [{ deviceId }, query] = await Promise.all([params, searchParams]);
  const section = await getShopDeviceDetailSectionForRequest(
    deviceId,
    getRequestedShopId(query),
  );

  return <ShopSectionPage section={section} />;
}
