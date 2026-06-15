import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";
import { getI18n } from "@/i18n/get-locale";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";

export const metadata: Metadata = {
  title: "Settings | MerchandiseControl Admin Web",
  description: "Shop Admin settings shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

type ShopPageSearchParams = Promise<{
  shop_id?: string | string[];
}>;

function getParam(
  searchParams: Awaited<ShopPageSearchParams>,
  key: keyof Awaited<ShopPageSearchParams>,
) {
  const value = searchParams[key];

  return Array.isArray(value) ? value[0] : value;
}

export default async function ShopSettingsPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const { dictionary } = await getI18n();
  const params = await searchParams;
  const section = await getShopSectionForRequest(
    "settings",
    getParam(params, "shop_id"),
  );

  return (
    <div className="grid gap-5">
      <ShopSectionPage section={section} />
      <section className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950`}>
        <p className="font-semibold">{dictionary.settings.masterOnly}</p>
        <p className="mt-1">{dictionary.settings.readOnlyCopy}</p>
      </section>
    </div>
  );
}
