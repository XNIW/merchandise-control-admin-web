import type { Metadata } from "next";
import { ImportExportActionPanel } from "@/app/shop/_components/ImportExportActionPanel";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";
import { resolveShopActionContext } from "@/server/shop-admin/action-context";
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
  const params = await searchParams;
  const requestedShopId = getRequestedShopId(params);
  const section = await getShopSectionForRequest(
    "importExport",
    requestedShopId,
  );
  const [importContext, exportContext] = await Promise.all([
    resolveShopActionContext(requestedShopId, "catalog.import"),
    resolveShopActionContext(requestedShopId, "catalog.export"),
  ]);
  const canImport = importContext.status === "ready";
  const canExport = exportContext.status === "ready";

  return (
    <div className="grid gap-5">
      <ShopSectionPage section={section} />
      <section
        className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950`}
      >
        <h2 className="text-base font-semibold">Moved to Products</h2>
        <p className="mt-1">
          Import and export actions now live in the Products Catalog Workspace.
          This compatibility page keeps existing import/export links available.
        </p>
        <a
          className="mt-3 inline-flex h-10 items-center justify-center rounded-md bg-emerald-900 px-4 text-sm font-medium text-white"
          href={productsHref(requestedShopId)}
        >
          Open Products
        </a>
      </section>
      {canImport || canExport ? (
        <ImportExportActionPanel
          canExport={canExport}
          canImport={canImport}
          selectedShopId={requestedShopId}
        />
      ) : null}
    </div>
  );
}
