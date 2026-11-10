import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";
import { redirect } from "next/navigation";
import { resolveShopAdminDataAccess } from "@/server/shop-admin/data-access";
import { staffShopLanding } from "@/server/shop-admin/shell-capabilities";

export function generateMetadata() {
  return createLocalizedPageMetadata("Admin Console");
}

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
  const access = await resolveShopAdminDataAccess({
    requestedShopId: getRequestedShopId(params),
    strictRequestedShop: true,
  });
  const landing = access.status === "ready" ? staffShopLanding(access) : null;
  if (landing) redirect(landing);
  const section = await getShopSectionForRequest(
    "overview",
    getRequestedShopId(params),
  );

  return <ShopSectionPage section={section} />;
}
