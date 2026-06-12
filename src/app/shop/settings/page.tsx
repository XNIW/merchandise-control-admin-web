import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";

export const metadata: Metadata = {
  title: "Settings | MerchandiseControl Admin Web",
  description: "Shop Admin settings shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

const SETTINGS_READ_ONLY_COPY =
  "Shop profile and fiscal identity are managed by Master Console. Admin Console can view these fields but cannot edit them.";

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
  const params = await searchParams;
  const section = await getShopSectionForRequest(
    "settings",
    getParam(params, "shop_id"),
  );

  return (
    <div className="grid gap-5">
      <ShopSectionPage section={section} />
      <section className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950`}>
        <p className="font-semibold">Master Console only</p>
        <p className="mt-1">{SETTINGS_READ_ONLY_COPY}</p>
      </section>
    </div>
  );
}
