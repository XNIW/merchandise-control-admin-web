import type { Metadata } from "next";
import { ImportExportActionPanel } from "@/app/shop/_components/ImportExportActionPanel";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";

export const metadata: Metadata = {
  title: "Import / Export | MerchandiseControl Admin Web",
  description:
    "Shop Admin import and export shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

type ShopPageSearchParams = Promise<{
  shop_id?: string | string[];
}>;

function getRequestedShopId(searchParams: { shop_id?: string | string[] }) {
  const value = searchParams.shop_id;

  return Array.isArray(value) ? value[0] : value;
}

export default async function ShopImportExportPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const params = await searchParams;
  const requestedShopId = getRequestedShopId(params);
  const section = await getShopSectionForRequest(
    "importExport",
    requestedShopId,
  );

  return (
    <div className="grid gap-5">
      <ShopSectionPage section={section} />
      <ImportExportActionPanel selectedShopId={requestedShopId} />
    </div>
  );
}
