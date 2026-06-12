import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";

type ImportExportActionPanelProps = {
  canExport?: boolean;
  canImport?: boolean;
  selectedShopId?: string;
};

const importExportCardClassName =
  "flex min-w-0 flex-col rounded-md border border-zinc-200 bg-white p-4 shadow-sm";
const importExportFormClassName = "mt-3 flex min-w-0 flex-1 flex-col gap-3";
const importExportInputClassName =
  "h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950";
const importExportFileInputClassName =
  "h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-950 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-zinc-800";
const importExportButtonClassName =
  "inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white sm:w-auto";
const importExportWarningButtonClassName =
  "inline-flex h-10 w-full items-center justify-center rounded-md border border-amber-400 bg-amber-50 px-4 text-sm font-medium text-amber-950 sm:w-auto";

function shopQuery(selectedShopId?: string) {
  return selectedShopId
    ? `?${new URLSearchParams({ shop_id: selectedShopId }).toString()}`
    : "";
}

function HiddenShopInput({ selectedShopId }: { selectedShopId?: string }) {
  return selectedShopId ? (
    <input name="shop_id" type="hidden" value={selectedShopId} />
  ) : null;
}

export function ImportExportActionPanel({
  canExport = false,
  canImport = false,
  selectedShopId,
}: ImportExportActionPanelProps) {
  const query = shopQuery(selectedShopId);

  return (
    <div className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-4 lg:grid-cols-2`}>
      {canImport ? (
        <section className={importExportCardClassName}>
          <h2 className="text-base font-semibold text-zinc-950">
            Preview workbook
          </h2>
          <p className="mt-2 break-words text-sm leading-6 text-zinc-600">
            Preview first. No catalog rows are changed in preview.
          </p>
          <form
            action="/shop/import-export/preview"
            className={importExportFormClassName}
            encType="multipart/form-data"
            method="post"
          >
            <HiddenShopInput selectedShopId={selectedShopId} />
            <input
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className={importExportFileInputClassName}
              name="workbook"
              required
              type="file"
            />
            <button className={importExportButtonClassName}>
              Preview workbook
            </button>
          </form>
        </section>
      ) : null}

      {canImport ? (
        <section className={importExportCardClassName}>
          <h2 className="text-base font-semibold text-zinc-950">
            Apply confirmed import
          </h2>
          <p className="mt-2 break-words text-sm leading-6 text-zinc-600">
            Use the preview digest returned by the preview step. APPLY only after reviewing errors, warnings and counts.
          </p>
          <form
            action="/shop/import-export/apply"
            className={importExportFormClassName}
            encType="multipart/form-data"
            method="post"
          >
            <HiddenShopInput selectedShopId={selectedShopId} />
            <input
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className={importExportFileInputClassName}
              name="workbook"
              required
              type="file"
            />
            <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
              Preview digest
              <input
                className={importExportInputClassName}
                name="previewDigest"
                required
                type="text"
              />
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
              Type APPLY as confirmation
              <input
                className={importExportInputClassName}
                name="confirmApply"
                required
                type="text"
              />
            </label>
            <button className={importExportWarningButtonClassName}>
              Apply confirmed import
            </button>
          </form>
        </section>
      ) : null}

      {canExport ? (
        <a
          className={`${importExportCardClassName} text-sm font-medium text-zinc-950 hover:border-emerald-300`}
          href={`/shop/import-export/export${query}`}
        >
          <span className="block text-base font-semibold">Download export</span>
          <span className="mt-2 block break-words text-zinc-600">
            Products, categories, suppliers and recent prices.
          </span>
        </a>
      ) : null}

      {canImport || canExport ? (
        <a
          className={`${importExportCardClassName} text-sm font-medium text-zinc-950 hover:border-emerald-300`}
          href={`/shop/import-export/template${query}`}
        >
          <span className="block text-base font-semibold">Download template</span>
          <span className="mt-2 block break-words text-zinc-600">
            Empty workbook with the accepted columns.
          </span>
        </a>
      ) : null}
    </div>
  );
}
