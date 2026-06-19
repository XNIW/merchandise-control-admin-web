import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import {
  CatalogActionPanel,
  type CatalogSupplierOption,
} from "@/app/shop/_components/CatalogActionPanel";
import type { AdminDataTableRow } from "@/components/admin/AdminDataTable";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";
import { getI18n } from "@/i18n/get-locale";
import { translateText } from "@/i18n/translate-sections";
import { resolveShopActionContext } from "@/server/shop-admin/action-context";
import { getShopInventoryReadModel } from "@/server/shop-admin/inventory-read-model";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Suppliers");
}

export const dynamic = "force-dynamic";

type ShopPageSearchParams = Promise<{
  action?: string | string[];
  query?: string | string[];
  result?: string | string[];
  shop_id?: string | string[];
  supplier_action?: string | string[];
  supplier_id?: string | string[];
}>;

function getParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];

  return Array.isArray(value) ? value[0] : value;
}

function buildClearFiltersHref(requestedShopId?: string) {
  if (!requestedShopId) {
    return "/shop/suppliers";
  }

  return `/shop/suppliers?${new URLSearchParams({
    shop_id: requestedShopId,
  }).toString()}`;
}

function mapSupplierOptions(
  rows: Awaited<ReturnType<typeof getShopInventoryReadModel>>["suppliers"],
): CatalogSupplierOption[] {
  return rows.map((supplier) => ({
    name: supplier.name,
    supplierId: supplier.supplierId,
  }));
}

function getSupplierDialog(action?: string) {
  if (action === "edit") {
    return "editSupplier" as const;
  }

  if (action === "archive") {
    return "archiveSupplier" as const;
  }

  return null;
}

function buildSupplierActionHref(
  params: Record<string, string | string[] | undefined>,
  action: "archive" | "edit",
  supplierId: string,
) {
  const nextParams = new URLSearchParams();

  for (const key of ["shop_id", "query"]) {
    const value = getParam(params, key);

    if (value) {
      nextParams.set(key, value);
    }
  }

  nextParams.set("supplier_action", action);
  nextParams.set("supplier_id", supplierId);

  return `/shop/suppliers?${nextParams.toString()}`;
}

function SupplierRowActions({
  labels,
  params,
  row,
}: {
  labels: {
    archive: string;
    update: string;
  };
  params: Record<string, string | string[] | undefined>;
  row: AdminDataTableRow;
}) {
  if (!row.rowKey) {
    return null;
  }

  const supplierId = row.rowKey;

  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {[
        { action: "edit" as const, label: labels.update },
        { action: "archive" as const, label: labels.archive },
      ].map((item) => (
        <a
          key={item.action}
          className="inline-flex h-8 items-center rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-900 hover:border-emerald-400 hover:text-emerald-800"
          href={buildSupplierActionHref(params, item.action, supplierId)}
        >
          {item.label}
        </a>
      ))}
    </div>
  );
}

export default async function ShopSuppliersPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const { dictionary } = await getI18n();
  const params = await searchParams;
  const requestedShopId = getParam(params, "shop_id");
  const activeFilterCount = [getParam(params, "query")].filter((value) =>
    Boolean(value?.trim()),
  ).length;
  const [inventoryReadModel, suppliersContext] = await Promise.all([
    getShopInventoryReadModel({ requestedShopId }),
    resolveShopActionContext(requestedShopId, "suppliers.write"),
  ]);
  const section = await getShopSectionForRequest("suppliers", requestedShopId, {
    catalogFilters: {
      query: getParam(params, "query"),
    },
    inventoryReadModel,
  });
  const canManageSuppliers = suppliersContext.status === "ready";
  const supplierOptions = mapSupplierOptions(inventoryReadModel.suppliers);
  const supplierDialog = getSupplierDialog(getParam(params, "supplier_action"));
  const supplierDialogId = getParam(params, "supplier_id") ?? "";
  const rowActionLabels = {
    archive: translateText(dictionary, "Archive"),
    update: translateText(dictionary, "Update"),
  };
  const catalogToolbar = canManageSuppliers ? (
    <CatalogActionPanel
      embedded
      initialDialog={supplierDialog}
      initialEntityId={supplierDialogId}
      labels={dictionary.exact}
      scope="suppliers"
      selectedShopId={requestedShopId}
      suppliers={supplierOptions}
    />
  ) : null;

  return (
    <div className="grid gap-5">
      <form
        action="/shop/suppliers"
        className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-3 rounded-md border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_auto]`}
      >
        {requestedShopId ? (
          <input name="shop_id" type="hidden" value={requestedShopId} />
        ) : null}
        <label className="grid gap-1 text-sm font-medium text-zinc-800">
          {dictionary.shopFilters.search}
          <input
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
            defaultValue={getParam(params, "query") ?? ""}
            name="query"
            type="search"
          />
        </label>
        <div className="flex flex-wrap items-end gap-2 self-end">
          <button className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
            {dictionary.common.applyFilters}
          </button>
          {activeFilterCount > 0 ? (
            <a
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800"
              href={buildClearFiltersHref(requestedShopId)}
            >
              {dictionary.common.clearFilters}
            </a>
          ) : null}
        </div>
      </form>
      <ActionResultBanner
        action={getParam(params, "action")}
        result={getParam(params, "result")}
      />
      <ShopSectionPage
        liveDataToolbar={catalogToolbar}
        rowActions={
          canManageSuppliers
            ? {
                label: dictionary.common.actions,
                render: (row) => (
                  <SupplierRowActions
                    labels={rowActionLabels}
                    params={params}
                    row={row}
                  />
                ),
              }
            : undefined
        }
        section={section}
      />
    </div>
  );
}
