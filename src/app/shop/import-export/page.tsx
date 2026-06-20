import Link from "next/link";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";
import { getI18n } from "@/i18n/get-locale";
import { translateText } from "@/i18n/translate-sections";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Import / Export");
}

export const dynamic = "force-dynamic";

type ShopPageSearchParams = Promise<{
  shop_id?: string | string[];
}>;

function getRequestedShopId(searchParams: { shop_id?: string | string[] }) {
  const value = searchParams.shop_id;

  return Array.isArray(value) ? value[0] : value;
}

function productsHref(selectedShopId?: string) {
  return selectedShopId
    ? `/shop/products?${new URLSearchParams({ shop_id: selectedShopId }).toString()}`
    : "/shop/products";
}

export default async function ShopImportExportPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const { dictionary } = await getI18n();
  const params = await searchParams;
  const requestedShopId = getRequestedShopId(params);

  return (
    <section
      className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950`}
    >
      <h2 className="text-base font-semibold">
        {translateText(dictionary, "Moved to Products")}
      </h2>
      <p className="mt-1">
        {translateText(
          dictionary,
          "Import and export actions now live on the Products page. This compatibility page keeps existing import/export links available.",
        )}
      </p>
      <Link
        className="mt-3 inline-flex h-10 items-center justify-center rounded-md bg-emerald-900 px-4 text-sm font-medium text-white"
        href={productsHref(requestedShopId)}
      >
        {translateText(dictionary, "Open Products")}
      </Link>
    </section>
  );
}
