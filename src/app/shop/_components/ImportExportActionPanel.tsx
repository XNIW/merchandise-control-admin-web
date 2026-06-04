type ImportExportActionPanelProps = {
  canExport?: boolean;
  canImport?: boolean;
  selectedShopId?: string;
};

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
    <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-4">
      {canImport ? (
        <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-zinc-950">
            Preview workbook
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Preview first. No catalog rows are changed in preview.
          </p>
          <form
            action="/shop/import-export/preview"
            className="mt-3 grid gap-3"
            encType="multipart/form-data"
            method="post"
          >
            <HiddenShopInput selectedShopId={selectedShopId} />
            <input
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950"
              name="workbook"
              required
              type="file"
            />
            <button className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
              Preview workbook
            </button>
          </form>
        </section>
      ) : null}

      {canImport ? (
        <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-zinc-950">
            Apply confirmed import
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Use the preview digest returned by the preview step. APPLY only after reviewing errors, warnings and counts.
          </p>
          <form
            action="/shop/import-export/apply"
            className="mt-3 grid gap-3"
            encType="multipart/form-data"
            method="post"
          >
            <HiddenShopInput selectedShopId={selectedShopId} />
            <input
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950"
              name="workbook"
              required
              type="file"
            />
            <label className="grid gap-1 text-sm font-medium text-zinc-800">
              Preview digest
              <input
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950"
                name="previewDigest"
                required
                type="text"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-zinc-800">
              Type APPLY as confirmation
              <input
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950"
                name="confirmApply"
                required
                type="text"
              />
            </label>
            <button className="rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950">
              Apply confirmed import
            </button>
          </form>
        </section>
      ) : null}

      {canExport ? (
        <a
          className="rounded-md border border-zinc-200 bg-white p-4 text-sm font-medium text-zinc-950 shadow-sm hover:border-emerald-300"
          href={`/shop/import-export/export${query}`}
        >
          <span className="block text-base font-semibold">Download export</span>
          <span className="mt-2 block text-zinc-600">
            Products, categories, suppliers and recent prices.
          </span>
        </a>
      ) : null}

      {canImport || canExport ? (
        <a
          className="rounded-md border border-zinc-200 bg-white p-4 text-sm font-medium text-zinc-950 shadow-sm hover:border-emerald-300"
          href={`/shop/import-export/template${query}`}
        >
          <span className="block text-base font-semibold">Download template</span>
          <span className="mt-2 block text-zinc-600">
            Empty workbook with the accepted columns.
          </span>
        </a>
      ) : null}
    </div>
  );
}
