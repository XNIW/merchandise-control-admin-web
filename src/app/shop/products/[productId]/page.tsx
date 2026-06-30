import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import type { AdminDataTableRow } from "@/components/admin/AdminDataTable";
import { getShopCatalogDetailSectionForRequest } from "@/server/shop-admin/shop-section-data";
import { getI18n } from "@/i18n/get-locale";
import { createLocalizedPageMetadata } from "@/i18n/metadata";
import { translateText } from "@/i18n/translate-sections";

export function generateMetadata() {
  return createLocalizedPageMetadata("Product Detail");
}

export const dynamic = "force-dynamic";

type ShopPageParams = Promise<{
  productId: string;
}>;
type ShopPageSearchParams = Promise<{
  shop_id?: string | string[];
}>;

function getRequestedShopId(searchParams: { shop_id?: string | string[] }) {
  const value = searchParams.shop_id;

  return Array.isArray(value) ? value[0] : value;
}

function buildHistoryDetailHref(entryId: string, requestedShopId?: string) {
  const query = requestedShopId
    ? `?${new URLSearchParams({ shop_id: requestedShopId }).toString()}`
    : "";

  return `/shop/history/${encodeURIComponent(entryId)}${query}`;
}

function ProductHistoryRowActions({
  label,
  requestedShopId,
  row,
}: {
  label: string;
  requestedShopId?: string;
  row: AdminDataTableRow;
}) {
  if (!row.rowKey?.startsWith("session:") && !row.rowKey?.startsWith("sync:")) {
    return null;
  }

  return (
    <a
      className="inline-flex h-8 items-center rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-900 hover:border-emerald-400 hover:text-emerald-800"
      href={buildHistoryDetailHref(row.rowKey, requestedShopId)}
    >
      {label}
    </a>
  );
}

export default async function ShopProductDetailPage({
  params,
  searchParams,
}: {
  params: ShopPageParams;
  searchParams: ShopPageSearchParams;
}) {
  const [{ productId }, query] = await Promise.all([params, searchParams]);
  const { dictionary } = await getI18n();
  const requestedShopId = getRequestedShopId(query);
  const section = await getShopCatalogDetailSectionForRequest(
    "product",
    productId,
    requestedShopId,
  );

  return (
    <ShopSectionPage
      section={section}
      secondaryRowActions={{
        label: translateText(dictionary, "Detail"),
        renderForTable: (table) => table.title === "History entries",
        render: (row) => (
          <ProductHistoryRowActions
            label={translateText(dictionary, "History detail")}
            requestedShopId={requestedShopId}
            row={row}
          />
        ),
      }}
    />
  );
}
