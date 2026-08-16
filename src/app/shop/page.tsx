import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";
import { redirect } from "next/navigation";
import { resolveShopAdminDataAccess } from "@/server/shop-admin/data-access";

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
  if (
    access.status === "ready" &&
    access.principalKind === "pos_staff_manager" &&
    access.principal.roleKey === "courier"
  ) {
    redirect("/shop/courier");
  }
  const section = await getShopSectionForRequest(
    "overview",
    getRequestedShopId(params),
  );

  return <ShopSectionPage section={section} />;
}
