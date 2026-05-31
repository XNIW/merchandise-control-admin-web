import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformShopDetailForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "Shop Detail | MerchandiseControl Admin Web",
  description: "Platform Admin shop detail.",
};

export const dynamic = "force-dynamic";

type ShopDetailParams = Promise<{
  shopId: string;
}>;

export default async function PlatformShopDetailPage({
  params,
}: {
  params: ShopDetailParams;
}) {
  const { shopId } = await params;
  const section = await getPlatformShopDetailForRequest(shopId);

  return <PlatformPage section={section} />;
}
