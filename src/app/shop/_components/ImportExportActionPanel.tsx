"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";

type ImportExportActionPanelProps = {
  canExport?: boolean;
  canImport?: boolean;
  embedded?: boolean;
  selectedShopId?: string;
};

type ImportMode = "supplier" | "database";

type ImportIssue = {
  field: string;
  message: string;
  row: number;
  sheet: string;
};

type PreviewRow = {
  barcode: string;
  categoryName?: string;
  itemNumber?: string;
  productName: string;
  retailPrice?: number;
  rowFingerprint: string;
  rowNumber: number;
  status: "Ready" | "Warning" | "Blocked" | "Duplicate" | "Update" | "New";
  stockQuantity?: number;
  supplierName?: string;
  warnings: number;
};

type PreviewResponse = {
  code: string;
  detectedHeaderRow?: number | null;
  detectedMapping?: Record<string, { columnIndex: number; columnLabel: string }>;
  message: string;
  ok: boolean;
  originalColumns?: string[];
  previewDigest?: string;
  previewRows?: PreviewRow[];
  previewRowsTruncated?: boolean;
  rowErrors?: ImportIssue[];
  rowWarnings?: ImportIssue[];
  selectedProductSheet?: string;
  summary?: {
    categories: number;
    duplicates?: number;
    droppedRows?: number;
    errors: number;
    newProducts: number;
    priceHistory: number;
    products: number;
    suppliers: number;
    updatedProducts: number;
    validRows?: number;
    warnings: number;
  };
  unmappedColumns?: string[];
  workbookMetadata?: {
    fileName: string;
    headerRow: number | null;
    parsedRows?: number;
    previewRowsLimit?: number;
    previewRowsTruncated?: boolean;
    selectedSheet: string;
    sheetNames: string[];
    sizeBytes: number;
    totalRows?: number;
  };
};

type ApplyResponse = {
  code: string;
  message: string;
  ok: boolean;
  rowErrors?: ImportIssue[];
  summary?: {
    categoriesApplied: number;
    failedRows: number;
    priceHistoryApplied: number;
    productsApplied: number;
    suppliersApplied: number;
  };
};

type EditedRow = {
  retailPrice?: string;
  stockQuantity?: string;
};

const importExportCardClassName =
  "flex min-w-0 flex-col rounded-md border border-zinc-200 bg-white p-4 shadow-sm";
const importExportFormClassName = "mt-3 flex min-w-0 flex-1 flex-col gap-3";
const importExportInputClassName =
  "h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950";
const importExportFileInputClassName =
  "h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-950 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-zinc-800";
const importExportButtonClassName =
  "inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400 sm:w-auto";
const importExportWarningButtonClassName =
  "inline-flex h-10 w-full items-center justify-center rounded-md border border-amber-400 bg-amber-50 px-4 text-sm font-medium text-amber-950 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";
const importExportSecondaryButtonClassName =
  "inline-flex h-10 w-full items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

function shopQuery(selectedShopId?: string) {
  return selectedShopId
    ? `?${new URLSearchParams({ shop_id: selectedShopId }).toString()}`
    : "";
}

function appendShopId(formData: FormData, selectedShopId?: string) {
  if (selectedShopId) {
    formData.set("shop_id", selectedShopId);
  }
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  const text = await response.text();

  return {
    code: "invalid_response",
    message: text || "The server returned a non-JSON response.",
    ok: false,
  } as T;
}

function SummaryGrid({ preview }: { preview: PreviewResponse }) {
  const summary = preview.summary;

  if (!summary) {
    return null;
  }

  const rows = [
    ["Products", summary.products],
    ["Valid rows", summary.validRows ?? 0],
    ["New", summary.newProducts],
    ["Update", summary.updatedProducts],
    ["Duplicate", summary.duplicates ?? 0],
    ["Blocked", summary.errors],
    ["Warnings", summary.warnings],
    ["Ignored", summary.droppedRows ?? 0],
  ];

  return (
    <dl className="grid gap-2 sm:grid-cols-4">
      {rows.map(([label, value]) => (
        <div
          className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2"
          key={label}
        >
          <dt className="text-xs font-medium text-zinc-500">{label}</dt>
          <dd className="text-lg font-semibold text-zinc-950">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function IssueList({
  issues,
  title,
}: {
  issues?: ImportIssue[];
  title: string;
}) {
  if (!issues || issues.length === 0) {
    return null;
  }

  return (
    <section className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <h3 className="font-semibold">{title}</h3>
      <ul className="mt-2 grid gap-1">
        {issues.slice(0, 8).map((issue, index) => (
          <li key={`${issue.sheet}:${issue.row}:${issue.field}:${index}`}>
            Row {issue.row} {issue.field}: {issue.message}
          </li>
        ))}
      </ul>
      {issues.length > 8 ? (
        <p className="mt-2 text-xs">Showing first 8 of {issues.length} issues.</p>
      ) : null}
    </section>
  );
}

function PreviewTable({
  edits,
  previewRows,
  setEdits,
}: {
  edits: Record<number, EditedRow>;
  previewRows: PreviewRow[];
  setEdits: Dispatch<SetStateAction<Record<number, EditedRow>>>;
}) {
  if (previewRows.length === 0) {
    return null;
  }

  return (
    <div className="max-h-[24rem] overflow-auto rounded-md border border-zinc-200">
      <table className="min-w-[58rem] divide-y divide-zinc-200 text-left text-sm">
        <thead className="sticky top-0 bg-white text-xs uppercase tracking-normal text-zinc-500">
          <tr>
            <th className="px-3 py-2">Row</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Barcode</th>
            <th className="px-3 py-2">Product</th>
            <th className="px-3 py-2">Supplier</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">Retail price</th>
            <th className="px-3 py-2">Stock quantity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {previewRows.map((row) => {
            const edit = edits[row.rowNumber] ?? {};

            return (
              <tr key={`${row.rowNumber}:${row.rowFingerprint}`}>
                <td className="px-3 py-2 font-mono text-xs">{row.rowNumber}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.barcode}</td>
                <td className="px-3 py-2">{row.productName}</td>
                <td className="px-3 py-2">{row.supplierName ?? ""}</td>
                <td className="px-3 py-2">{row.categoryName ?? ""}</td>
                <td className="px-3 py-2">
                  <input
                    className={importExportInputClassName}
                    inputMode="decimal"
                    onChange={(event) =>
                      setEdits((current) => ({
                        ...current,
                        [row.rowNumber]: {
                          ...current[row.rowNumber],
                          retailPrice: event.currentTarget.value,
                        },
                      }))
                    }
                    value={edit.retailPrice ?? row.retailPrice ?? ""}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className={importExportInputClassName}
                    inputMode="decimal"
                    onChange={(event) =>
                      setEdits((current) => ({
                        ...current,
                        [row.rowNumber]: {
                          ...current[row.rowNumber],
                          stockQuantity: event.currentTarget.value,
                        },
                      }))
                    }
                    value={edit.stockQuantity ?? row.stockQuantity ?? ""}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function rowAdjustments(
  previewRows: readonly PreviewRow[],
  edits: Record<number, EditedRow>,
) {
  return previewRows
    .map((row) => {
      const edit = edits[row.rowNumber];

      if (!edit) {
        return null;
      }

      return {
        retailPrice:
          edit.retailPrice === undefined ? undefined : edit.retailPrice,
        rowFingerprint: row.rowFingerprint,
        rowNumber: row.rowNumber,
        stockQuantity:
          edit.stockQuantity === undefined ? undefined : edit.stockQuantity,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

function ImportWizard({
  mode,
  selectedShopId,
}: {
  mode: ImportMode;
  selectedShopId?: string;
}) {
  const [applyConfirmation, setApplyConfirmation] = useState("");
  const [applyResult, setApplyResult] = useState<ApplyResponse | null>(null);
  const [edits, setEdits] = useState<Record<number, EditedRow>>({});
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const isDatabase = mode === "database";
  const confirmationWord = isDatabase ? "IMPORT DATABASE" : "APPLY";
  const previewButtonLabel = isDatabase
    ? "Preview database workbook"
    : "Preview supplier workbook";
  const previewRows = preview?.previewRows ?? [];
  const blockedRows = preview?.summary?.errors ?? 0;
  const canApply =
    Boolean(file && preview?.previewDigest) &&
    applyConfirmation.trim().toUpperCase() === confirmationWord &&
    blockedRows === 0 &&
    !isApplying;
  const applyDisabledReason = !preview?.previewDigest
    ? "Preview is required before apply."
    : blockedRows > 0
      ? "Fix blocked rows before apply."
      : applyConfirmation.trim().toUpperCase() !== confirmationWord
        ? `Type ${confirmationWord} to enable apply.`
        : "";

  async function previewWorkbook(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplyResult(null);
    setEdits({});
    setError("");

    if (!file) {
      setError("Choose an .xlsx workbook first.");
      return;
    }

    const formData = new FormData();
    formData.set("workbook", file);
    formData.set("importMode", mode);
    appendShopId(formData, selectedShopId);
    setIsPreviewing(true);

    try {
      const response = await fetch("/shop/import-export/preview", {
        body: formData,
        credentials: "same-origin",
        method: "POST",
      });
      const result = await readJsonResponse<PreviewResponse>(response);

      setPreview(result);

      if (!result.ok) {
        setError(result.message);
      }
    } catch {
      setError("Preview failed before the server returned a response.");
    } finally {
      setIsPreviewing(false);
    }
  }

  async function applyWorkbook(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplyResult(null);
    setError("");

    if (!file || !preview?.previewDigest) {
      setError("Preview the workbook before applying it.");
      return;
    }

    const formData = new FormData();
    formData.set("workbook", file);
    formData.set("importMode", mode);
    formData.set("previewDigest", preview.previewDigest);
    formData.set("confirmApply", applyConfirmation);
    formData.set(
      "rowAdjustments",
      JSON.stringify(rowAdjustments(previewRows, edits)),
    );
    appendShopId(formData, selectedShopId);
    setIsApplying(true);

    try {
      const response = await fetch("/shop/import-export/apply", {
        body: formData,
        credentials: "same-origin",
        method: "POST",
      });
      const result = await readJsonResponse<ApplyResponse>(response);

      setApplyResult(result);

      if (!result.ok) {
        setError(result.message);
      }
    } catch {
      setError("Apply failed before the server returned a response.");
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <section
      className={`${importExportCardClassName} gap-4`}
      data-catalog-flow={isDatabase ? "database-transfer" : "supplier-excel-wizard"}
    >
      <div>
        <h2 className="text-base font-semibold text-zinc-950">
          {isDatabase ? "Advanced database transfer" : "Import supplier Excel"}
        </h2>
        <p className="mt-2 break-words text-sm leading-6 text-zinc-600">
          {isDatabase
            ? "Preview first. Catalog workbook transfer only. Full database restore is not available yet."
            : "Preview first. Upload a supplier workbook, review mapping and edit retail price or stock before apply. No catalog rows are changed in preview. APPLY only after reviewing errors, warnings and counts."}
        </p>
      </div>
      <form
        className={importExportFormClassName}
        encType="multipart/form-data"
        onSubmit={previewWorkbook}
      >
        <input
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className={importExportFileInputClassName}
          onChange={(event) => {
            setFile(event.currentTarget.files?.[0] ?? null);
            setPreview(null);
            setApplyResult(null);
            setError("");
          }}
          required
          type="file"
        />
        {file ? (
          <p className="text-xs text-zinc-500">
            File: {file.name} ({file.size} bytes)
          </p>
        ) : null}
        <button
          aria-label="Preview workbook"
          className={importExportButtonClassName}
          disabled={isPreviewing}
        >
          {isPreviewing ? "Previewing..." : previewButtonLabel}
        </button>
      </form>
      {preview ? (
        <div className="grid gap-4">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
            <p>
              Sheet: {preview.selectedProductSheet ?? "Unknown"}; header row:{" "}
              {preview.detectedHeaderRow ?? "not detected"}.
            </p>
            <p className="mt-1">
              Columns: {(preview.originalColumns ?? []).join(", ") || "None"}.
            </p>
            <p className="mt-1">
              Unmapped columns: {(preview.unmappedColumns ?? []).join(", ") || "None"}.
            </p>
            {preview.previewRowsTruncated ? (
              <p className="mt-1">Preview rows are bounded for performance.</p>
            ) : null}
            <p className="mt-1">
              Use the preview digest returned by the preview step.
            </p>
          </div>
          <SummaryGrid preview={preview} />
          <IssueList issues={preview.rowErrors} title="Blocked rows" />
          <IssueList issues={preview.rowWarnings} title="Warnings" />
          <PreviewTable edits={edits} previewRows={previewRows} setEdits={setEdits} />
          <form
            className={importExportFormClassName}
            encType="multipart/form-data"
            onSubmit={applyWorkbook}
          >
            <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
              Confirm {confirmationWord}
              <input
                className={importExportInputClassName}
                onChange={(event) => setApplyConfirmation(event.currentTarget.value)}
                value={applyConfirmation}
              />
            </label>
            <button
              className={isDatabase ? importExportWarningButtonClassName : importExportButtonClassName}
              disabled={!canApply}
            >
              {isApplying ? "Applying..." : isDatabase ? "Import database workbook" : "Apply confirmed import"}
            </button>
            {applyDisabledReason ? (
              <p className="text-xs text-zinc-500">{applyDisabledReason}</p>
            ) : null}
          </form>
        </div>
      ) : null}
      {applyResult ? (
        <section className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
          <h3 className="font-semibold">Result summary</h3>
          <p className="mt-1">{applyResult.message}</p>
          {applyResult.summary ? (
            <p className="mt-1">
              Products {applyResult.summary.productsApplied}, suppliers{" "}
              {applyResult.summary.suppliersApplied}, categories{" "}
              {applyResult.summary.categoriesApplied}, failed rows{" "}
              {applyResult.summary.failedRows}.
            </p>
          ) : null}
        </section>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function SupplierExcelImportWizard({
  selectedShopId,
}: {
  selectedShopId?: string;
}) {
  return <ImportWizard mode="supplier" selectedShopId={selectedShopId} />;
}

export function DatabaseTransferPanel({
  selectedShopId,
}: {
  selectedShopId?: string;
}) {
  return (
    <details className="rounded-md border border-zinc-200 p-3" open>
      <summary className="cursor-pointer text-sm font-semibold text-zinc-800">
        Advanced transfer options
      </summary>
      <div className="pt-3">
        <ImportWizard mode="database" selectedShopId={selectedShopId} />
      </div>
    </details>
  );
}

export function CatalogExportPanel({
  selectedShopId,
}: {
  selectedShopId?: string;
}) {
  const [error, setError] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const query = useMemo(() => shopQuery(selectedShopId), [selectedShopId]);

  async function downloadExport() {
    setError("");
    setIsDownloading(true);

    try {
      const response = await fetch(`/shop/import-export/export${query}`, {
        credentials: "same-origin",
        method: "GET",
      });

      if (!response.ok) {
        const result = await readJsonResponse<{ message?: string }>(response);

        setError(result.message ?? "Catalog export failed.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const disposition = response.headers.get("content-disposition") ?? "";
      const fileName =
        disposition.match(/filename="([^"]+)"/)?.[1] ??
        "catalog-export.xlsx";
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Catalog export failed before the server returned a response.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <section
      className={`${importExportCardClassName} gap-3`}
      data-catalog-flow="catalog-export"
    >
      <h2 className="text-base font-semibold text-zinc-950">
        Export catalog Excel
      </h2>
      <p className="break-words text-sm leading-6 text-zinc-600">
        Download products, categories, suppliers and full price history for the
        selected shop only.
      </p>
      <button
        aria-label="Download export"
        className={importExportSecondaryButtonClassName}
        disabled={isDownloading}
        onClick={downloadExport}
        type="button"
      >
        {isDownloading ? "Preparing export..." : "Download catalog export"}
      </button>
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function ImportExportActionPanel({
  canExport = false,
  canImport = false,
  embedded = false,
  selectedShopId,
}: ImportExportActionPanelProps) {
  const panelClassName = embedded
    ? "grid gap-4 lg:grid-cols-2"
    : `${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-4 lg:grid-cols-2`;
  const query = useMemo(() => shopQuery(selectedShopId), [selectedShopId]);

  return (
    <div className={panelClassName}>
      {canImport ? (
        <SupplierExcelImportWizard selectedShopId={selectedShopId} />
      ) : null}
      {canExport ? <CatalogExportPanel selectedShopId={selectedShopId} /> : null}
      {canImport ? (
        <section
          className={`${importExportCardClassName} gap-3`}
          data-catalog-flow="catalog-template"
        >
          <h2 className="text-base font-semibold text-zinc-950">
            Import template
          </h2>
          <p className="break-words text-sm leading-6 text-zinc-600">
            Download a workbook template for the selected shop catalog.
          </p>
          <a
            className={importExportSecondaryButtonClassName}
            href={`/shop/import-export/template${query}`}
          >
            Download template
          </a>
        </section>
      ) : null}
      {canImport ? (
        <details className={`${importExportCardClassName} gap-3 lg:col-span-2`}>
          <summary className="cursor-pointer text-base font-semibold text-zinc-950">
            Advanced database transfer
          </summary>
          <div className="mt-3">
            <DatabaseTransferPanel selectedShopId={selectedShopId} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
