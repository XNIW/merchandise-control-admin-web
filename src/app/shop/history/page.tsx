import type { AdminDataTableRow } from "@/components/admin/AdminDataTable";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Mobile History");
}

export const dynamic = "force-dynamic";

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

function HistoryRowActions({
  requestedShopId,
  row,
}: {
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
      Detail
    </a>
  );
}

export default async function ShopHistoryPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const params = await searchParams;
  const requestedShopId = getRequestedShopId(params);
  const section = await getShopSectionForRequest(
    "history",
    requestedShopId,
  );

  return (
    <ShopSectionPage
      section={section}
      rowActions={{
        label: "Detail",
        render: (row) => (
          <HistoryRowActions requestedShopId={requestedShopId} row={row} />
        ),
      }}
      secondaryRowActions={{
        label: "Detail",
        renderForTable: (table) => table.title === "Related history sync events",
        render: (row) => (
          <HistoryRowActions requestedShopId={requestedShopId} row={row} />
        ),
      }}
    />
  );
}
