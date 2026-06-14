"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";

type ImportExportActionPanelProps = {
  authPrincipalKind?: AuthPrincipalKind;
  canExport?: boolean;
  canImport?: boolean;
  categories?: CatalogOption[];
  embedded?: boolean;
  selectedShopId?: string;
  suppliers?: CatalogOption[];
};

type ImportMode = "supplier" | "database";
type ImportWizardStep = "workbook" | "mapping" | "preview";
type AuthPrincipalKind = "personal_account" | "pos_staff_manager";
type AuthPrompt = {
  href: string;
  message: string;
};

type HeaderBackState = {
  label: string;
  onBack: () => void;
};

export type HeaderFileState = {
  extension: string;
  name: string;
  sizeLabel: string;
};

type CatalogOption = {
  id?: string;
  name: string;
};

type CatalogImportField =
  | "barcode"
  | "categoryName"
  | "discount"
  | "discountedPrice"
  | "itemNumber"
  | "lineTotal"
  | "productName"
  | "purchasePrice"
  | "retailPrice"
  | "secondProductName"
  | "stockQuantity"
  | "supplierName";

type MappingOverrideState = Partial<Record<CatalogImportField, number | null>>;

type RecognizedColumnSource = {
  columnIndex: number | null;
  columnLabel?: string;
  confidence?: "high" | "medium" | "low";
  reason?: string;
  source?: "alias" | "pattern" | "generated" | "manual";
};

type ImportIssue = {
  field: string;
  message: string;
  row: number;
  sheet: string;
};

type PreviewRow = {
  barcode: string;
  categoryName?: string;
  currentPurchasePrice?: number;
  currentRetailPrice?: number;
  currentStockQuantity?: number;
  itemNumber?: string;
  productName: string;
  recognizedDiscount?: number;
  recognizedDiscountedPrice?: number;
  recognizedLineTotal?: number;
  recognizedPurchasePrice?: number;
  recognizedQuantity?: number;
  recognizedRetailPrice?: number;
  retailPrice?: number;
  rowFingerprint: string;
  rowNumber: number;
  secondProductName?: string;
  status: "Ready" | "Warning" | "Blocked" | "Duplicate" | "Update" | "New";
  stockQuantity?: number;
  supplierName?: string;
  warnings: number;
};

type RawPreviewRow = {
  cells: string[];
  isDataPreview: boolean;
  isHeader: boolean;
  rowNumber: number;
};

type RawPreviewColumn = {
  columnIndex: number;
  label: string;
};

type PreviewResponse = {
  code: string;
  detectedHeaderRow?: number | null;
  detectedMapping?: Partial<
    Record<
      CatalogImportField,
      { columnIndex: number; columnLabel: string; confidence?: "high" | "medium" }
    >
  >;
  message: string;
  ok: boolean;
  originalColumns?: string[];
  previewDigest?: string;
  previewRows?: PreviewRow[];
  previewRowsTruncated?: boolean;
  rawPreviewColumns?: RawPreviewColumn[];
  rawPreviewRows?: RawPreviewRow[];
  rawWorkbookContextRows?: RawPreviewRow[];
  recognizedColumnSources?: Partial<Record<CatalogImportField, RecognizedColumnSource>>;
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
  categoryName?: string;
  retailPrice?: string;
  stockQuantity?: string;
  supplierName?: string;
};

const importExportCardClassName =
  "flex min-w-0 flex-col rounded-md border border-zinc-200 bg-white p-4 shadow-sm";
const importExportFormClassName = "mt-3 flex min-w-0 flex-1 flex-col gap-3";
const importExportInputClassName =
  "h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950";
const importExportFileInputClassName = "sr-only";
const importExportButtonClassName =
  "inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400 sm:w-auto";
const importExportWarningButtonClassName =
  "inline-flex h-10 w-full items-center justify-center rounded-md border border-amber-400 bg-amber-50 px-4 text-sm font-medium text-amber-950 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";
const importExportSecondaryButtonClassName =
  "inline-flex h-10 w-full items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";
const supportedWorkbookAccept =
  ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/octet-stream";
const canonicalMappingFields: Array<{
  field: CatalogImportField;
  label: string;
  required?: boolean;
  strength: "required" | "recommended" | "optional";
}> = [
  { field: "barcode", label: "Barcode", required: true, strength: "required" },
  { field: "productName", label: "Product name", required: true, strength: "required" },
  { field: "itemNumber", label: "Item number", strength: "recommended" },
  { field: "secondProductName", label: "Second name", strength: "recommended" },
  { field: "stockQuantity", label: "Quantity", strength: "recommended" },
  { field: "purchasePrice", label: "Purchase price", strength: "recommended" },
  { field: "retailPrice", label: "Retail price", strength: "optional" },
  { field: "discount", label: "Discount", strength: "optional" },
  { field: "discountedPrice", label: "Discounted price", strength: "optional" },
  { field: "lineTotal", label: "Total price", strength: "optional" },
  { field: "supplierName", label: "Supplier", strength: "optional" },
  { field: "categoryName", label: "Category", strength: "optional" },
];
const supplierHiddenMappingFields = new Set<CatalogImportField>([
  "categoryName",
  "retailPrice",
  "supplierName",
]);
const visibleSupplierMappingFields = canonicalMappingFields.filter(
  (entry) => !supplierHiddenMappingFields.has(entry.field),
);
const optionalDefaultOffFields = new Set<CatalogImportField>([
  "discount",
  "discountedPrice",
  "lineTotal",
  "retailPrice",
]);
const numericMappingFields = new Set<CatalogImportField>([
  "discount",
  "discountedPrice",
  "lineTotal",
  "purchasePrice",
  "stockQuantity",
]);

function shopQuery(selectedShopId?: string) {
  return selectedShopId
    ? `?${new URLSearchParams({ shop_id: selectedShopId }).toString()}`
    : "";
}

function fileExtension(fileName: string) {
  return fileName.split(".").pop()?.toUpperCase() ?? "";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }

  const kb = bytes / 1024;

  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  return `${(kb / 1024).toFixed(1)} MB`;
}

function isSupportedWorkbook(fileName: string) {
  const lowerName = fileName.toLowerCase();

  return lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls");
}

function mappingOverridePayload(mappingOverrides: MappingOverrideState) {
  const entries = Object.entries(mappingOverrides).filter(
    (entry): entry is [CatalogImportField, number | null] =>
      entry[1] !== undefined,
  );

  return entries.length > 0 ? JSON.stringify(Object.fromEntries(entries)) : "";
}

function optionNameSet(options: readonly CatalogOption[]) {
  return new Set(options.map((option) => option.name.trim().toLowerCase()));
}

function unknownNameWarning(
  label: "category" | "supplier",
  value: string,
  knownNames: ReadonlySet<string>,
) {
  return value.trim() && !knownNames.has(value.trim().toLowerCase())
    ? `New ${label} names are not created automatically; this value will be left unlinked unless it matches an existing ${label}.`
    : "";
}

function previewColumns(preview: PreviewResponse): RawPreviewColumn[] {
  if (preview.rawPreviewColumns?.length) {
    return preview.rawPreviewColumns;
  }

  return (preview.originalColumns ?? []).map((label, index) => ({
    columnIndex: index,
    label,
  }));
}

function columnDisplayLabel(column: RawPreviewColumn) {
  return `${column.label || `Column ${column.columnIndex + 1}`} (Col ${column.columnIndex + 1})`;
}

function compactColumnDisplayLabel(column: RawPreviewColumn | undefined) {
  return column ? columnDisplayLabel(column) : "None";
}

function parsePreviewNumber(value: string) {
  const normalized = value
    .trim()
    .replace(
      /(^|\s)(ars|brl|clp|cny|cop|eur|gbp|mxn|pen|rmb|usd|uyu)(?=\s|$)/gi,
      " ",
    )
    .replace(/[$€£¥₩₽₹]/g, "");

  if (/[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u4E00-\u9FFF]/.test(normalized)) {
    return Number.NaN;
  }

  const compact = normalized.replace(/\s+/g, "").replace(/[^\d,.-]/g, "");

  if (!compact) {
    return Number.NaN;
  }

  if (!/^-?[\d.,]+$/.test(compact)) {
    return Number.NaN;
  }

  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(compact)) {
    return Number(compact.replace(/\./g, "").replace(",", "."));
  }

  if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(compact)) {
    return Number(compact.replace(/,/g, ""));
  }

  return Number(compact.replace(",", "."));
}

function columnSampleValues(
  preview: PreviewResponse,
  columnIndex: number,
  limit = 8,
) {
  const columns = previewColumns(preview);
  const sampleIndex = columns.findIndex(
    (column) => column.columnIndex === columnIndex,
  );

  if (sampleIndex < 0) {
    return [];
  }

  return (preview.rawPreviewRows ?? [])
    .filter((row) => !row.isHeader)
    .map((row) => row.cells[sampleIndex] ?? "")
    .map((cell) => cell.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function isNumericColumnCompatible(
  preview: PreviewResponse,
  columnIndex: number,
) {
  const values = columnSampleValues(preview, columnIndex);

  return values.length === 0 ||
    values.every((value) => {
      const numeric = parsePreviewNumber(value);

      return Number.isFinite(numeric) && numeric >= 0;
    });
}

function appendShopId(formData: FormData, selectedShopId?: string) {
  if (selectedShopId) {
    formData.set("shop_id", selectedShopId);
  }
}

function importEndpoint(path: string, selectedShopId?: string) {
  return `${path}${shopQuery(selectedShopId)}`;
}

function isSessionAuthCode(code: string) {
  return code === "session_expired" || code === "no_active_session";
}

function importErrorMessage(result: { code: string; message?: string }) {
  if (isSessionAuthCode(result.code)) {
    return "Session expired. Please sign in again.";
  }

  if (result.code === "permission_denied" || result.code === "unauthorized") {
    return "You do not have permission to import catalog data for this shop.";
  }

  return result.message ?? "Catalog import failed.";
}

function authLoginHref(authPrincipalKind: AuthPrincipalKind | undefined) {
  const nextPath =
    typeof window === "undefined"
      ? "/shop/products"
      : `${window.location.pathname}${window.location.search}`;
  const params = new URLSearchParams({ next: nextPath });
  const path =
    authPrincipalKind === "pos_staff_manager"
      ? "/shop/staff-login"
      : "/auth/login";

  return `${path}?${params.toString()}`;
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

function effectiveMappingIndex(
  preview: PreviewResponse,
  mappingOverrides: MappingOverrideState,
  field: CatalogImportField,
) {
  if (Object.prototype.hasOwnProperty.call(mappingOverrides, field)) {
    return mappingOverrides[field] ?? null;
  }

  if (optionalDefaultOffFields.has(field)) {
    return null;
  }

  return preview.detectedMapping?.[field]?.columnIndex ??
    preview.recognizedColumnSources?.[field]?.columnIndex ??
    null;
}

function defaultMappingIndex(preview: PreviewResponse, field: CatalogImportField) {
  return preview.recognizedColumnSources?.[field]?.columnIndex ??
    preview.detectedMapping?.[field]?.columnIndex ??
    null;
}

function isMappingFieldEnabled(
  preview: PreviewResponse,
  mappingOverrides: MappingOverrideState,
  field: CatalogImportField,
  required = false,
) {
  if (required) {
    return true;
  }

  if (Object.prototype.hasOwnProperty.call(mappingOverrides, field)) {
    return mappingOverrides[field] !== null;
  }

  return effectiveMappingIndex(preview, mappingOverrides, field) !== null;
}

function requiredMappingIssues(
  preview: PreviewResponse,
  mappingOverrides: MappingOverrideState,
) {
  return canonicalMappingFields
    .filter((entry) => entry.required)
    .map(({ field, label }) => {
      const columnIndex = effectiveMappingIndex(preview, mappingOverrides, field);
      const source = preview.recognizedColumnSources?.[field];

      if (columnIndex === null) {
        return `${label} is required. Choose a source column.`;
      }

      if (source?.confidence === "low" && mappingOverrides[field] === undefined) {
        return `${label} was detected with low confidence. Confirm it manually.`;
      }

      return "";
    })
    .filter(Boolean);
}

function numericMappingIssues(
  preview: PreviewResponse,
  mappingOverrides: MappingOverrideState,
) {
  const columns = previewColumns(preview);
  const columnByIndex = new Map(
    columns.map((column) => [column.columnIndex, column]),
  );

  return visibleSupplierMappingFields
    .map(({ field, label }) => {
      if (!numericMappingFields.has(field)) {
        return "";
      }

      const columnIndex = effectiveMappingIndex(preview, mappingOverrides, field);

      if (columnIndex === null) {
        return "";
      }

      if (isNumericColumnCompatible(preview, columnIndex)) {
        return "";
      }

      return `${label} must use a numeric source column. ${compactColumnDisplayLabel(
        columnByIndex.get(columnIndex),
      )} contains text or empty sample values.`;
    })
    .filter(Boolean);
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

function WizardSteps({
  step,
}: {
  step: ImportWizardStep;
}) {
  const steps: Array<{ key: ImportWizardStep; label: string }> = [
    { key: "workbook", label: "Workbook file" },
    { key: "mapping", label: "Check columns" },
    { key: "preview", label: "Import preview" },
  ];
  const activeIndex = steps.findIndex((entry) => entry.key === step);

  return (
    <ol className="grid gap-2 text-sm sm:grid-cols-3" data-import-wizard-steps>
      {steps.map((entry, index) => {
        const isActive = entry.key === step;
        const isComplete = index < activeIndex;

        return (
          <li
            className={`flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 ${
              isActive
                ? "border-emerald-500 bg-emerald-50 text-emerald-950"
                : isComplete
                  ? "border-zinc-300 bg-white text-zinc-700"
                  : "border-zinc-200 bg-zinc-50 text-zinc-500"
            }`}
            key={entry.key}
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-current text-xs font-semibold">
              {index + 1}
            </span>
            <span className="truncate font-medium">{entry.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function wizardStepDescription({
  isDatabase,
  step,
}: {
  isDatabase: boolean;
  step: ImportWizardStep;
}) {
  if (isDatabase) {
    if (step === "workbook") {
      return "Preview first. Choose the transfer workbook; catalog rows are not changed while checking the file.";
    }

    if (step === "mapping") {
      return "Check detected columns and re-run preview after any mapping change before continuing.";
    }

    return "Review counts and editable values before confirming the database transfer.";
  }

  if (step === "workbook") {
    return "Preview first. Choose or replace the supplier workbook; no catalog rows are changed while checking the file.";
  }

  if (step === "mapping") {
    return "Check detected headers, defaults and required column mapping; re-run preview after any mapping change.";
  }

  return "No catalog rows are changed in preview. Review counts, then edit only quantity or retail price values you want to import before typing APPLY.";
}

function RawPreviewTable({
  columns,
  contextRows,
  rawRows,
}: {
  columns?: readonly RawPreviewColumn[];
  contextRows?: readonly RawPreviewRow[];
  rawRows?: readonly RawPreviewRow[];
}) {
  if (!rawRows || rawRows.length === 0) {
    return null;
  }

  const displayedRows = rawRows.filter((row) => !row.isHeader).slice(0, 5);
  const visibleColumns =
    columns && columns.length > 0
      ? columns
      : Array.from(
          { length: Math.max(0, ...rawRows.map((row) => row.cells.length)) },
          (_value, index) => ({
            columnIndex: index,
            label: `Column ${index + 1}`,
          }),
        );

  if (displayedRows.length === 0) {
    return null;
  }

  return (
    <section
      className="grid gap-2 rounded-md border border-zinc-200 bg-white p-3"
      data-product-row-sample
    >
      <div>
        <h3 className="text-sm font-semibold text-zinc-950">Product row sample</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-600">
          Shows the first five product rows using the detected header labels.
        </p>
      </div>
      <div className="max-h-64 overflow-auto rounded-md border border-zinc-200">
        <table
          className="min-w-full text-left text-xs"
          data-product-row-sample-table
        >
          <thead className="sticky top-0 bg-zinc-50 text-zinc-500 shadow-sm">
            <tr>
              {visibleColumns.map((column) => (
                <th className="min-w-32 px-2 py-2" key={column.columnIndex}>
                  {columnDisplayLabel(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {displayedRows.map((row) => (
              <tr
                className="bg-white"
                key={row.rowNumber}
              >
                {visibleColumns.map((column, index) => (
                  <td
                    className="max-w-56 truncate px-2 py-2"
                    key={column.columnIndex}
                  >
                    {row.cells[index] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {contextRows?.length ? (
        <details className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
          <summary className="cursor-pointer font-medium text-zinc-900">
            Show raw workbook context
          </summary>
          <div className="mt-3 max-h-52 overflow-auto rounded-md border border-zinc-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-zinc-50 text-zinc-500 shadow-sm">
                <tr>
                  <th className="sticky left-0 z-10 w-16 bg-zinc-50 px-2 py-2">
                    Row
                  </th>
                  {Array.from(
                    {
                      length: Math.max(
                        0,
                        ...contextRows.map((row) => row.cells.length),
                      ),
                    },
                    (_value, index) => (
                      <th className="min-w-32 px-2 py-2" key={index}>
                        Col {index + 1}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {contextRows.map((row) => (
                  <tr
                    className={row.isHeader ? "bg-emerald-50" : "bg-white"}
                    key={row.rowNumber}
                  >
                    <td className="sticky left-0 z-10 bg-inherit px-2 py-2 font-mono">
                      {row.rowNumber}
                      {row.isHeader ? (
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 font-sans text-[0.65rem] font-semibold text-emerald-900">
                          header
                        </span>
                      ) : null}
                    </td>
                    {Array.from(
                      {
                        length: Math.max(
                          0,
                          ...contextRows.map((contextRow) => contextRow.cells.length),
                        ),
                      },
                      (_value, index) => (
                        <td className="max-w-56 truncate px-2 py-2" key={index}>
                          {row.cells[index] ?? ""}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </section>
  );
}

function WorkbookDropTarget({
  file,
  fileInputId,
  fileInputRef,
  isDatabase,
  isDraggingFile,
  onDropFile,
  onRemoveFile,
  onReplaceFile,
  setIsDraggingFile,
}: {
  file: File | null;
  fileInputId: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isDatabase: boolean;
  isDraggingFile: boolean;
  onDropFile: (file: File | null) => void;
  onRemoveFile: () => void;
  onReplaceFile: () => void;
  setIsDraggingFile: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div className="grid gap-2">
      <label
        aria-label={file ? `Selected workbook ${file.name}` : undefined}
        className={`grid min-h-28 cursor-pointer place-items-center rounded-md border border-dashed px-4 py-5 text-center text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
          isDraggingFile
            ? "border-emerald-500 bg-emerald-50 text-emerald-950"
            : "border-zinc-300 bg-zinc-50 text-zinc-700 hover:border-emerald-400"
        }`}
        htmlFor={fileInputId}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDraggingFile(false);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDraggingFile(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDraggingFile(false);
          onDropFile(event.dataTransfer.files.item(0));
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }

          event.preventDefault();
          fileInputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
      >
        {file ? (
          <span className="grid max-w-full gap-2">
            <span className="mx-auto inline-flex w-fit items-center rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
              {fileExtension(file.name)} ready
            </span>
            <span className="break-all text-sm font-medium text-zinc-950">
              {file.name}
            </span>
            <span className="text-xs text-zinc-500">{formatBytes(file.size)}</span>
          </span>
        ) : (
          <span>
            {isDatabase
              ? "Drop a catalog database .xlsx or .xls workbook here or choose a file."
              : "Drop a supplier .xlsx or .xls workbook here or choose a file."}
          </span>
        )}
      </label>
      {file ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            className={importExportSecondaryButtonClassName}
            onClick={onReplaceFile}
            type="button"
          >
            Replace file
          </button>
          <button
            className={importExportSecondaryButtonClassName}
            onClick={onRemoveFile}
            type="button"
          >
            Remove file
          </button>
        </div>
      ) : null}
    </div>
  );
}

function WorkbookFileChip({ file }: { file: File | null }) {
  if (!file) {
    return null;
  }

  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700">
      <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-900">
        {fileExtension(file.name)}
      </span>
      <span className="max-w-64 truncate font-medium text-zinc-900">
        {file.name}
      </span>
      <span className="text-zinc-500">{formatBytes(file.size)}</span>
    </div>
  );
}

function WizardHeader({
  file,
  isDatabase,
  onBack,
  step,
}: {
  file: File | null;
  isDatabase: boolean;
  onBack?: () => void;
  step: ImportWizardStep;
}) {
  const isWorkbookStep = step === "workbook";
  const backLabel =
    step === "preview" ? "Back to check columns" : "Back to workbook file";
  const description = wizardStepDescription({ isDatabase, step });

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-start gap-2">
        {!isWorkbookStep && onBack ? (
          <button
            aria-label={backLabel}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            onClick={onBack}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M19 12H5" />
              <path d="m12 5-7 7 7 7" />
            </svg>
            {backLabel}
          </button>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-zinc-950">
            {isDatabase ? "Advanced database transfer" : "Import supplier Excel"}
          </h2>
          <p className="mt-1 break-words text-sm leading-6 text-zinc-600">
            {description}
          </p>
        </div>
      </div>
      {!isWorkbookStep ? <WorkbookFileChip file={file} /> : null}
      </div>
    </div>
  );
}

function DefaultImportSettings({
  categoryNames,
  defaultCategoryName,
  defaultSupplierName,
  setDefaultCategoryName,
  setDefaultSupplierName,
  supplierNames,
}: {
  categoryNames: ReadonlySet<string>;
  defaultCategoryName: string;
  defaultSupplierName: string;
  setDefaultCategoryName: Dispatch<SetStateAction<string>>;
  setDefaultSupplierName: Dispatch<SetStateAction<string>>;
  supplierNames: ReadonlySet<string>;
}) {
  const unknownSupplierWarning = unknownNameWarning(
    "supplier",
    defaultSupplierName,
    supplierNames,
  );
  const unknownCategoryWarning = unknownNameWarning(
    "category",
    defaultCategoryName,
    categoryNames,
  );

  return (
    <section className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 md:grid-cols-2">
      <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
        Default supplier
        <input
          className={importExportInputClassName}
          list="supplier-import-supplier-options"
          onChange={(event) =>
            setDefaultSupplierName(event.currentTarget.value)}
          value={defaultSupplierName}
        />
        {unknownSupplierWarning ? (
          <span className="text-xs font-normal text-amber-700">
            {unknownSupplierWarning}
          </span>
        ) : (
          <span className="text-xs font-normal text-zinc-500">
            Matched existing supplier for imported rows.
          </span>
        )}
      </label>
      <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
        Default category
        <input
          className={importExportInputClassName}
          list="supplier-import-category-options"
          onChange={(event) =>
            setDefaultCategoryName(event.currentTarget.value)}
          value={defaultCategoryName}
        />
        {unknownCategoryWarning ? (
          <span className="text-xs font-normal text-amber-700">
            {unknownCategoryWarning}
          </span>
        ) : (
          <span className="text-xs font-normal text-zinc-500">
            Matched existing category for imported rows.
          </span>
        )}
      </label>
    </section>
  );
}

function ColumnMappingEditor({
  disabled,
  mappingOverrides,
  onChange,
  preview,
}: {
  disabled: boolean;
  mappingOverrides: MappingOverrideState;
  onChange: (field: CatalogImportField, value: number | null) => void;
  preview: PreviewResponse;
}) {
  const columns = previewColumns(preview);
  const dataRows = (preview.rawPreviewRows ?? []).filter((row) => !row.isHeader);

  if (columns.length === 0) {
    return null;
  }

  const columnByIndex = new Map(columns.map((column) => [column.columnIndex, column]));
  const mappedIndexes = new Set<number>();

  for (const { field } of visibleSupplierMappingFields) {
    const columnIndex = effectiveMappingIndex(preview, mappingOverrides, field);

    if (columnIndex !== null) {
      mappedIndexes.add(columnIndex);
    }
  }

  const ignoredColumns = columns.filter(
    (column) => !mappedIndexes.has(column.columnIndex),
  );

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-950">Column mapping</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            Use enabled columns are included in the digest and product preview.
            Optional references start off until you turn them on.
          </p>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto rounded-md border border-zinc-200">
        <table className="w-full min-w-[76rem] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-normal text-zinc-500">
            <tr>
              <th className="w-20 px-3 py-2">Use</th>
              <th className="w-36 px-3 py-2">Field</th>
              <th className="w-32 px-3 py-2">Requirement</th>
              <th className="w-56 px-3 py-2">Detected Excel column</th>
              <th className="w-28 px-3 py-2">Confidence</th>
              <th className="px-3 py-2">Sample values</th>
              <th className="w-56 px-3 py-2">Override</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visibleSupplierMappingFields.map(({ field, label, required, strength }) => {
          const source = preview.recognizedColumnSources?.[field];
          const hasOverride = Object.prototype.hasOwnProperty.call(
            mappingOverrides,
            field,
          );
          const enabled = isMappingFieldEnabled(
            preview,
            mappingOverrides,
            field,
            Boolean(required),
          );
          const selectedIndex = effectiveMappingIndex(
            preview,
            mappingOverrides,
            field,
          );
          const detectedIndex = defaultMappingIndex(preview, field);
          const effectiveColumn =
            enabled && selectedIndex !== null
              ? columnByIndex.get(selectedIndex)
              : undefined;
          const detectedColumn =
            detectedIndex === null
              ? undefined
              : columnByIndex.get(detectedIndex);
          const sampleColumn = effectiveColumn ?? detectedColumn;
          const sampleValues = sampleColumn
            ? dataRows
                .map((row) => row.cells[columns.findIndex(
                  (column) => column.columnIndex === sampleColumn.columnIndex,
                )])
                .filter((cell) => cell && cell.trim().length > 0)
                .slice(0, 3)
            : [];
          const confidence = hasOverride
            ? "manual"
            : (source?.confidence ?? preview.detectedMapping?.[field]?.confidence ?? "none");
          const selectValue =
            enabled && selectedIndex !== null ? String(selectedIndex) : "ignore";
          const incompatibleNumericColumn =
            enabled &&
            selectedIndex !== null &&
            numericMappingFields.has(field) &&
            !isNumericColumnCompatible(preview, selectedIndex);

          return (
            <tr
              className={
                incompatibleNumericColumn
                  ? "bg-red-50/60"
                  : required
                    ? "bg-emerald-50/40"
                    : "bg-white"
              }
              key={field}
            >
              <td className="px-3 py-2">
                <input
                  aria-label={`Use ${label}`}
                  checked={enabled}
                  disabled={disabled || Boolean(required)}
                  onChange={(event) => {
                    if (event.currentTarget.checked) {
                      onChange(
                        field,
                        detectedIndex ?? columns[0]?.columnIndex ?? null,
                      );
                      return;
                    }

                    onChange(field, null);
                  }}
                  type="checkbox"
                />
              </td>
              <td className="px-3 py-2 font-medium text-zinc-950">
                {label}
              </td>
              <td className="px-3 py-2 text-xs text-zinc-600">
                {required ? (
                  <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 font-semibold text-emerald-900">
                    Required
                  </span>
                ) : (
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-zinc-600">
                    {strength === "recommended" ? "Recommended" : "Optional"}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-zinc-700">
                {compactColumnDisplayLabel(detectedColumn)}
              </td>
              <td className="px-3 py-2 text-xs text-zinc-600">
                {confidence}
              </td>
              <td className="max-w-72 px-3 py-2 text-xs text-zinc-700">
                <span>{sampleValues.length > 0 ? sampleValues.join(" | ") : "None"}</span>
                {incompatibleNumericColumn ? (
                  <span className="mt-1 block font-medium text-red-700">
                    Choose a numeric column before continuing.
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2">
                <select
	                  aria-label={`${label} column`}
	                  className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-950"
	                  disabled={disabled || !enabled}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value;

                    onChange(
                      field,
                      nextValue === "ignore" ? null : Number(nextValue),
                    );
                  }}
                  value={selectValue}
                >
                  <option value="ignore">Ignore</option>
                  {columns.map((column) => (
                    <option
                      key={`${column.label}:${column.columnIndex}`}
                      value={column.columnIndex}
                    >
                      {columnDisplayLabel(column)}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          );
            })}
          </tbody>
        </table>
      </div>
      {ignoredColumns.length ? (
        <details className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
          <summary className="cursor-pointer font-medium text-zinc-900">
            Ignored columns
          </summary>
          <p className="mt-2 leading-5">
            {ignoredColumns.map(columnDisplayLabel).join(", ")}
          </p>
        </details>
      ) : null}
    </section>
  );
}

function displayNumber(value: number | undefined) {
  return value === undefined ? "" : String(value);
}

type NumberMetric = {
  label: string;
  value: number;
};

function numberMetric(label: string, value: number | undefined) {
  return value === undefined ? null : { label, value };
}

function MetricGrid({
  metrics,
  responsive = false,
}: {
  metrics: readonly NumberMetric[];
  responsive?: boolean;
}) {
  if (metrics.length === 0) {
    return null;
  }

  return (
    <dl
      className={`grid gap-2 text-xs text-zinc-700 ${
        responsive ? "sm:grid-cols-2 xl:grid-cols-3" : ""
      }`}
    >
      {metrics.map((metric) => (
        <div
          className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5"
          key={metric.label}
        >
          <dt className="text-zinc-500">{metric.label}</dt>
          <dd className="mt-1 font-mono font-semibold text-zinc-900">
            {displayNumber(metric.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function PreviewTable({
  edits,
  isDatabase,
  previewRows,
  setEdits,
}: {
  edits: Record<number, EditedRow>;
  isDatabase: boolean;
  previewRows: PreviewRow[];
  setEdits: Dispatch<SetStateAction<Record<number, EditedRow>>>;
}) {
  if (previewRows.length === 0) {
    return null;
  }

  if (isDatabase) {
    return (
      <div className="max-h-[min(70vh,54rem)] overflow-auto rounded-md border border-zinc-200">
        <table className="min-w-[118rem] divide-y divide-zinc-200 text-left text-sm">
          <thead className="sticky top-0 z-20 bg-white text-xs uppercase tracking-normal text-zinc-500 shadow-sm">
            <tr>
              <th className="sticky left-0 z-30 w-20 bg-white px-3 py-2">Row</th>
              <th className="sticky left-20 z-30 w-28 bg-white px-3 py-2">
                Status
              </th>
              <th className="sticky left-48 z-30 w-36 bg-white px-3 py-2">
                Barcode
              </th>
              <th className="px-3 py-2">Item number</th>
              <th className="w-64 px-3 py-2">Product name</th>
              <th className="w-64 px-3 py-2">Second name</th>
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
                <tr className="bg-white" key={`${row.rowNumber}:${row.rowFingerprint}`}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 font-mono text-xs">
                    {row.rowNumber}
                  </td>
                  <td className="sticky left-20 z-10 bg-white px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        row.status === "Blocked" || row.status === "Duplicate"
                          ? "bg-red-50 text-red-800"
                          : row.status === "Warning"
                            ? "bg-amber-50 text-amber-800"
                            : "bg-emerald-50 text-emerald-800"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="sticky left-48 z-10 bg-white px-3 py-2 font-mono text-xs">
                    {row.barcode}
                  </td>
                  <td className="px-3 py-2">{row.itemNumber ?? ""}</td>
                  <td className="whitespace-normal px-3 py-2 leading-5">
                    {row.productName}
                  </td>
                  <td className="whitespace-normal px-3 py-2 leading-5">
                    {row.secondProductName ?? ""}
                  </td>
                  <td className="px-3 py-2">{row.supplierName ?? ""}</td>
                  <td className="px-3 py-2">{row.categoryName ?? ""}</td>
                  <td className="px-3 py-2">
                    <input
                      className={importExportInputClassName}
                      inputMode="decimal"
                      onChange={(event) => {
                        const value = event.currentTarget.value;

                        setEdits((current) => ({
                          ...current,
                          [row.rowNumber]: {
                            ...current[row.rowNumber],
                            retailPrice: value,
                          },
                        }));
                      }}
                      value={edit.retailPrice ?? row.retailPrice ?? ""}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={importExportInputClassName}
                      inputMode="decimal"
                      onChange={(event) => {
                        const value = event.currentTarget.value;

                        setEdits((current) => ({
                          ...current,
                          [row.rowNumber]: {
                            ...current[row.rowNumber],
                            stockQuantity: value,
                          },
                        }));
                      }}
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

  return (
    <div
      className="max-h-[min(70vh,54rem)] overflow-auto rounded-md border border-zinc-200"
      data-preview-table-scroll
    >
      <table className="w-full min-w-[72rem] divide-y divide-zinc-200 text-left text-sm">
        <thead className="sticky top-0 z-20 bg-white text-xs uppercase tracking-normal text-zinc-500 shadow-sm">
          <tr>
            <th className="w-14 px-3 py-2">No.</th>
            <th className="w-24 px-3 py-2">Status</th>
            <th className="w-[30%] px-3 py-2">Product</th>
            <th className="w-[18%] px-3 py-2">Current catalog values</th>
            <th className="w-[26%] px-3 py-2">Recognized from file</th>
            <th className="w-[20%] px-3 py-2">Import values</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {previewRows.map((row, rowIndex) => {
            const edit = edits[row.rowNumber] ?? {};
            const currentMetrics = [
              numberMetric("Purchase", row.currentPurchasePrice),
              numberMetric("Retail", row.currentRetailPrice),
              numberMetric("Stock", row.currentStockQuantity),
            ].filter((metric): metric is NumberMetric => metric !== null);
            const recognizedMetrics = [
              numberMetric("Qty", row.recognizedQuantity),
              numberMetric("Purchase", row.recognizedPurchasePrice),
              numberMetric("Discount", row.recognizedDiscount),
              numberMetric("Discounted price", row.recognizedDiscountedPrice),
              numberMetric("Total price", row.recognizedLineTotal),
            ].filter((metric): metric is NumberMetric => metric !== null);

            return (
              <tr className="bg-white align-top" key={`${row.rowNumber}:${row.rowFingerprint}`}>
                <td className="px-3 py-3 font-mono text-xs">{rowIndex + 1}</td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                      row.status === "Blocked" || row.status === "Duplicate"
                        ? "bg-red-50 text-red-800"
                        : row.status === "Warning"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-emerald-50 text-emerald-800"
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="min-w-0 px-3 py-3">
                  <div className="grid min-w-0 gap-3 leading-5 lg:grid-cols-[minmax(9rem,0.9fr)_minmax(13rem,1.4fr)]">
                    <div className="grid min-w-0 gap-1">
                      <span className="truncate font-mono text-xs text-zinc-600">
                        {row.barcode}
                      </span>
                      {row.itemNumber ? (
                        <span className="truncate text-xs text-zinc-500">
                          Item {row.itemNumber}
                        </span>
                      ) : null}
                    </div>
                    <div className="grid min-w-0 gap-1">
                      <span className="whitespace-normal font-medium text-zinc-950">
                        {row.productName}
                      </span>
                      {row.secondProductName ? (
                        <span className="whitespace-normal text-zinc-600">
                          {row.secondProductName}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  {currentMetrics.length > 0 ? (
                    <MetricGrid metrics={currentMetrics} />
                  ) : row.status === "New" ? (
                    <div className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-600">
                      New product
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  <MetricGrid metrics={recognizedMetrics} responsive />
                </td>
                <td className="px-3 py-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs font-medium text-zinc-700">
                      Quantity
                      <input
                        aria-label={`Quantity to import for row ${row.rowNumber}`}
                        className={importExportInputClassName}
                        inputMode="decimal"
                        onChange={(event) => {
                          const value = event.currentTarget.value;

                          setEdits((current) => ({
                            ...current,
                            [row.rowNumber]: {
                              ...current[row.rowNumber],
                              stockQuantity: value,
                            },
                          }));
                        }}
                        value={edit.stockQuantity ?? ""}
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-medium text-zinc-700">
                      Retail price
                      <input
                        aria-label={`Retail price to import for row ${row.rowNumber}`}
                        className={importExportInputClassName}
                        inputMode="decimal"
                        onChange={(event) => {
                          const value = event.currentTarget.value;

                          setEdits((current) => ({
                            ...current,
                            [row.rowNumber]: {
                              ...current[row.rowNumber],
                              retailPrice: value,
                            },
                          }));
                        }}
                        value={edit.retailPrice ?? ""}
                      />
                    </label>
                  </div>
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
  mode: ImportMode,
) {
  return previewRows
    .map((row) => {
      const edit = edits[row.rowNumber];

      if (!edit) {
        return null;
      }

      if (
        mode === "supplier" &&
        !edit.categoryName?.trim() &&
        !edit.retailPrice?.trim() &&
        !edit.stockQuantity?.trim() &&
        !edit.supplierName?.trim()
      ) {
        return null;
      }

      return {
        categoryName:
          edit.categoryName === undefined ? undefined : edit.categoryName,
        retailPrice:
          edit.retailPrice === undefined ? undefined : edit.retailPrice,
        rowFingerprint: row.rowFingerprint,
        rowNumber: row.rowNumber,
        stockQuantity:
          edit.stockQuantity === undefined ? undefined : edit.stockQuantity,
        supplierName:
          edit.supplierName === undefined ? undefined : edit.supplierName,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

function ImportWizard({
  authPrincipalKind,
  categories = [],
  mode,
  onHeaderBackStateChange,
  onHeaderFileStateChange,
  selectedShopId,
  suppliers = [],
}: {
  authPrincipalKind?: AuthPrincipalKind;
  categories?: readonly CatalogOption[];
  mode: ImportMode;
  onHeaderBackStateChange?: (state: HeaderBackState | null) => void;
  onHeaderFileStateChange?: (state: HeaderFileState | null) => void;
  selectedShopId?: string;
  suppliers?: readonly CatalogOption[];
}) {
  const [applyConfirmation, setApplyConfirmation] = useState("");
  const [applyResult, setApplyResult] = useState<ApplyResponse | null>(null);
  const [authPrompt, setAuthPrompt] = useState<AuthPrompt | null>(null);
  const [defaultCategoryName, setDefaultCategoryName] = useState("");
  const [defaultSupplierName, setDefaultSupplierName] = useState("");
  const [edits, setEdits] = useState<Record<number, EditedRow>>({});
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [mappingDirty, setMappingDirty] = useState(false);
  const [mappingOverrides, setMappingOverrides] = useState<MappingOverrideState>({});
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [showEditedRowsOnly, setShowEditedRowsOnly] = useState(false);
  const [showIssueRowsOnly, setShowIssueRowsOnly] = useState(false);
  const [step, setStep] = useState<ImportWizardStep>("workbook");
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewRequestId = useRef(0);
  const isDatabase = mode === "database";
  const confirmationWord = isDatabase ? "IMPORT DATABASE" : "APPLY";
  const previewButtonLabel = isDatabase
    ? "Preview database workbook"
    : "Preview supplier workbook";
  const previewRows = useMemo(() => preview?.previewRows ?? [], [preview]);
  const supplierNames = useMemo(() => optionNameSet(suppliers), [suppliers]);
  const categoryNames = useMemo(() => optionNameSet(categories), [categories]);
  const displayedPreviewRows = useMemo(
    () =>
      previewRows.filter((row) => {
        const edit = edits[row.rowNumber];
        const edited =
          Boolean(edit?.categoryName?.trim()) ||
          Boolean(edit?.retailPrice?.trim()) ||
          Boolean(edit?.stockQuantity?.trim()) ||
          Boolean(edit?.supplierName?.trim());
        const hasIssue =
          row.status === "Blocked" ||
          row.status === "Duplicate" ||
          row.status === "Warning" ||
          row.warnings > 0;

        return (!showEditedRowsOnly || edited) && (!showIssueRowsOnly || hasIssue);
      }),
    [edits, previewRows, showEditedRowsOnly, showIssueRowsOnly],
  );
  const blockedRows = preview?.summary?.errors ?? 0;
  const mappingIssues = preview
    ? [
        ...requiredMappingIssues(preview, mappingOverrides),
        ...numericMappingIssues(preview, mappingOverrides),
      ]
    : [];
  const canApply =
    Boolean(file && preview?.previewDigest) &&
    step === "preview" &&
    applyConfirmation.trim().toUpperCase() === confirmationWord &&
    blockedRows === 0 &&
    !authPrompt &&
    !isApplying;
  const applyDisabledReason = step !== "preview"
    ? "Continue to import preview before apply."
    : !preview?.previewDigest
    ? "Preview is required before apply."
    : blockedRows > 0
      ? "Fix blocked rows before apply."
      : applyConfirmation.trim().toUpperCase() !== confirmationWord
        ? `Type ${confirmationWord} to enable apply.`
        : "";

  function resetWorkbookState(nextFile: File | null) {
    previewRequestId.current += 1;
    setApplyConfirmation("");
    setApplyResult(null);
    setAuthPrompt(null);
    setEdits({});
    setError("");
    setFile(nextFile);
    setMappingDirty(false);
    setMappingOverrides({});
    setPreview(null);
    setShowEditedRowsOnly(false);
    setShowIssueRowsOnly(false);
    setStep("workbook");
  }

  function handleImportFailure(result: { code: string; message?: string }) {
    const message = importErrorMessage(result);

    setError(message);

    if (isSessionAuthCode(result.code)) {
      setAuthPrompt({
        href: authLoginHref(authPrincipalKind),
        message,
      });
      return;
    }

    setAuthPrompt(null);
  }

  function selectWorkbook(nextFile: File | null) {
    if (!nextFile) {
      resetWorkbookState(null);
      return;
    }

    if (!isSupportedWorkbook(nextFile.name)) {
      resetWorkbookState(null);
      setError("Upload a .xlsx or .xls workbook.");
      return;
    }

    resetWorkbookState(nextFile);
  }

  async function requestPreview() {
    setApplyResult(null);
    setAuthPrompt(null);
    setEdits({});
    setError("");

    if (!file) {
      setError("Choose a .xlsx or .xls workbook first.");
      return;
    }

    const formData = new FormData();
    const mappingOverride = mappingOverridePayload(mappingOverrides);

    formData.set("workbook", file);
    formData.set("importMode", mode);
    if (mappingOverride) {
      formData.set("mappingOverride", mappingOverride);
    }

    appendShopId(formData, selectedShopId);
    setIsPreviewing(true);
    const requestId = previewRequestId.current + 1;
    previewRequestId.current = requestId;

    try {
      const response = await fetch(
        importEndpoint("/shop/import-export/preview", selectedShopId),
        {
          body: formData,
          credentials: "same-origin",
          method: "POST",
        },
      );
      const result = await readJsonResponse<PreviewResponse>(response);

      if (requestId !== previewRequestId.current) {
        return;
      }

      if (!result.ok) {
        if (
          result.code === "validation_failed" &&
          ((result.originalColumns?.length ?? 0) > 0 ||
            (result.rawPreviewRows?.length ?? 0) > 0 ||
            (result.previewRows?.length ?? 0) > 0)
        ) {
          setAuthPrompt(null);
          setPreview(result);
          setMappingDirty(false);
          setStep("mapping");
          setError(result.message ?? "Review column mapping before continuing.");
          return;
        }

        handleImportFailure(result);
        setPreview(null);
        return;
      }

      setPreview(result);
      setMappingDirty(false);
      setStep("mapping");
    } catch {
      setError("Preview failed before the server returned a response.");
    } finally {
      setIsPreviewing(false);
    }
  }

  async function previewWorkbook(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestPreview();
  }

  async function applyWorkbook(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplyResult(null);
    setAuthPrompt(null);
    setError("");

    if (!file || !preview?.previewDigest || step !== "preview") {
      setError("Continue to import preview before applying it.");
      return;
    }

    const formData = new FormData();
    const mappingOverride = mappingOverridePayload(mappingOverrides);

    formData.set("workbook", file);
    formData.set("importMode", mode);
    formData.set("previewDigest", preview.previewDigest);
    formData.set("confirmApply", applyConfirmation);
    if (mappingOverride) {
      formData.set("mappingOverride", mappingOverride);
    }

    if (!isDatabase) {
      formData.set("defaultSupplierName", defaultSupplierName);
      formData.set("defaultCategoryName", defaultCategoryName);
    }

    formData.set(
      "rowAdjustments",
      JSON.stringify(rowAdjustments(previewRows, edits, mode)),
    );
    appendShopId(formData, selectedShopId);
    setIsApplying(true);

    try {
      const response = await fetch(
        importEndpoint("/shop/import-export/apply", selectedShopId),
        {
          body: formData,
          credentials: "same-origin",
          method: "POST",
        },
      );
      const result = await readJsonResponse<ApplyResponse>(response);

      if (!result.ok) {
        setApplyResult(null);
        handleImportFailure(result);
        return;
      }

      setApplyResult(result);
    } catch {
      setError("Apply failed before the server returned a response.");
    } finally {
      setIsApplying(false);
    }
  }

  function handleMappingChange(field: CatalogImportField, value: number | null) {
    setMappingOverrides((current) => ({
      ...current,
      [field]: value,
    }));
    setMappingDirty(true);
    setApplyConfirmation("");
    setApplyResult(null);
    setEdits({});
    setError("");
    setStep("mapping");
  }

  function continueToImportPreview() {
    setError("");

    if (!preview?.previewDigest) {
      setError("Preview the workbook before continuing.");
      return;
    }

    if (mappingDirty) {
      setError("Re-run preview with mapping before continuing.");
      return;
    }

    if (mappingIssues.length > 0) {
      setError("Fix column mapping before continuing.");
      return;
    }

    setStep("preview");
  }

  const goBackFromStep = useCallback(() => {
    setStep((currentStep) =>
      currentStep === "preview" ? "mapping" : "workbook",
    );
  }, []);
  const headerBackState = useMemo<HeaderBackState | null>(() => {
    if (step === "workbook") {
      return null;
    }

    return {
      label:
        step === "preview" ? "Back to check columns" : "Back to workbook file",
      onBack: goBackFromStep,
    };
  }, [goBackFromStep, step]);

  useEffect(() => {
    if (!onHeaderBackStateChange) {
      return;
    }

    onHeaderBackStateChange(headerBackState);

    return () => {
      onHeaderBackStateChange(null);
    };
  }, [headerBackState, onHeaderBackStateChange]);

  useEffect(() => {
    if (!onHeaderFileStateChange) {
      return;
    }

    if (file && step !== "workbook") {
      onHeaderFileStateChange({
        extension: fileExtension(file.name),
        name: file.name,
        sizeLabel: formatBytes(file.size),
      });
    } else {
      onHeaderFileStateChange(null);
    }

    return () => {
      onHeaderFileStateChange(null);
    };
  }, [file, onHeaderFileStateChange, step]);

  return (
    <section
      className={`${importExportCardClassName} gap-4`}
      data-catalog-flow={isDatabase ? "database-transfer" : "supplier-excel-wizard"}
    >
      <WizardSteps step={step} />
      {isDatabase ? (
        <WizardHeader
          file={file}
          isDatabase={isDatabase}
          onBack={goBackFromStep}
          step={step}
        />
      ) : null}
      {authPrompt ? (
        <section
          className="grid gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950"
          role="alert"
        >
          <p className="font-semibold">{authPrompt.message}</p>
          <p>
            For security, the browser will ask you to select the workbook again
            after sign-in.
          </p>
          <a
            className={importExportSecondaryButtonClassName}
            href={authPrompt.href}
          >
            Sign in again
          </a>
        </section>
      ) : null}
      {step === "workbook" ? (
        <section
          className="rounded-md border border-zinc-200 bg-white p-3"
          data-import-step="workbook-file"
        >
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Workbook file</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-600">
              {isDatabase
                ? "Upload or replace the workbook before checking detected columns."
                : "Upload or replace the supplier workbook. Preview only checks the file and does not change catalog data."}
            </p>
          </div>
          <form
            className={importExportFormClassName}
            encType="multipart/form-data"
            onSubmit={previewWorkbook}
          >
            <input
              accept={supportedWorkbookAccept}
              className={importExportFileInputClassName}
              id={fileInputId}
              onChange={(event) => {
                selectWorkbook(event.currentTarget.files?.[0] ?? null);
              }}
              ref={fileInputRef}
              type="file"
            />
            <WorkbookDropTarget
              file={file}
              fileInputId={fileInputId}
              fileInputRef={fileInputRef}
              isDatabase={isDatabase}
              isDraggingFile={isDraggingFile}
              onDropFile={selectWorkbook}
              onRemoveFile={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }

                resetWorkbookState(null);
              }}
              onReplaceFile={() => fileInputRef.current?.click()}
              setIsDraggingFile={setIsDraggingFile}
            />
            <button
              aria-label="Preview workbook"
              className={importExportButtonClassName}
              disabled={isPreviewing || !file || Boolean(authPrompt)}
            >
              {isPreviewing ? "Previewing..." : previewButtonLabel}
            </button>
          </form>
        </section>
      ) : null}
      {!isDatabase ? (
        <>
          <datalist id="supplier-import-supplier-options">
            {suppliers.map((supplier) => (
              <option key={supplier.id ?? supplier.name} value={supplier.name} />
            ))}
          </datalist>
          <datalist id="supplier-import-category-options">
            {categories.map((category) => (
              <option key={category.id ?? category.name} value={category.name} />
            ))}
          </datalist>
        </>
      ) : null}
      {preview && step === "mapping" ? (
        <section
          className="grid min-h-0 gap-4 rounded-md border border-zinc-200 bg-white p-3"
          data-import-step="check-columns"
        >
          <div>
            <h3 className="text-base font-semibold text-zinc-950">
              Verify detected product columns
            </h3>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              Confirm which workbook columns should be used before opening the
              editable product preview.
            </p>
          </div>
          <RawPreviewTable
            columns={previewColumns(preview)}
            contextRows={preview.rawWorkbookContextRows}
            rawRows={preview.rawPreviewRows}
          />
          <ColumnMappingEditor
            disabled={isPreviewing || !file}
            mappingOverrides={mappingOverrides}
            onChange={handleMappingChange}
            preview={preview}
          />
          {!isDatabase ? (
            <section className="grid gap-3">
              <div>
                <h4 className="text-sm font-semibold text-zinc-950">
                  Default values for imported rows
                </h4>
                <p className="mt-1 text-xs leading-5 text-zinc-600">
                  Applied only to imported rows and only when matching an
                  existing supplier/category in this shop.
                </p>
              </div>
              <DefaultImportSettings
                categoryNames={categoryNames}
                defaultCategoryName={defaultCategoryName}
                defaultSupplierName={defaultSupplierName}
                setDefaultCategoryName={setDefaultCategoryName}
                setDefaultSupplierName={setDefaultSupplierName}
                supplierNames={supplierNames}
              />
            </section>
          ) : null}
          {mappingDirty ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Mapping changed. Re-run preview with mapping before continuing.
            </p>
          ) : null}
          {mappingIssues.length > 0 ? (
            <section
              className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
              role="alert"
            >
              <h4 className="font-semibold">Column mapping needs review</h4>
              <ul className="mt-2 grid gap-1">
                {mappingIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </section>
          ) : null}
          <SummaryGrid preview={preview} />
          <IssueList issues={preview.rowWarnings} title="Warnings" />
          <div className="flex w-full flex-wrap justify-end gap-2">
            <button
              className={importExportSecondaryButtonClassName}
              disabled={isPreviewing || !file}
              onClick={() => {
                void requestPreview();
              }}
              type="button"
            >
              {isPreviewing ? "Previewing..." : "Re-run preview with mapping"}
            </button>
            <button
              className={importExportButtonClassName}
              disabled={mappingDirty || mappingIssues.length > 0 || isPreviewing}
              onClick={continueToImportPreview}
              type="button"
            >
              Continue to import preview
            </button>
          </div>
        </section>
      ) : null}
      {preview && step === "preview" ? (
        <div
          className="grid min-h-0 gap-4 rounded-md border border-zinc-200 bg-white p-3"
          data-import-step="import-preview"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-zinc-950">
                Import preview
              </h3>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                Review product rows. Recognized values are read-only; only typed
                import values will be applied.
              </p>
            </div>
          </div>
          <SummaryGrid preview={preview} />
          <IssueList issues={preview.rowErrors} title="Blocked rows" />
          <IssueList issues={preview.rowWarnings} title="Warnings" />
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600">
            <p>
              Showing {displayedPreviewRows.length} of {previewRows.length} preview rows
              {preview.previewRowsTruncated ? " (bounded preview)" : ""}.
            </p>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2">
                <input
                  checked={showIssueRowsOnly}
                  onChange={(event) =>
                    setShowIssueRowsOnly(event.currentTarget.checked)}
                  type="checkbox"
                />
                Show warnings/errors
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  checked={showEditedRowsOnly}
                  onChange={(event) =>
                    setShowEditedRowsOnly(event.currentTarget.checked)}
                  type="checkbox"
                />
                Show edited rows
              </label>
            </div>
          </div>
          <PreviewTable
            edits={edits}
            isDatabase={isDatabase}
            previewRows={displayedPreviewRows}
            setEdits={setEdits}
          />
          <form
            className="sticky bottom-0 z-30 border-t border-zinc-200 bg-white py-3"
            encType="multipart/form-data"
            onSubmit={applyWorkbook}
          >
            <div className="grid gap-2 lg:grid-cols-[auto_minmax(14rem,1fr)_auto_minmax(12rem,auto)] lg:items-center">
              <label
                className="text-sm font-medium text-zinc-800"
                htmlFor={`${fileInputId}-apply-confirmation`}
              >
                Confirm {confirmationWord}
              </label>
              <input
                aria-label={`Confirm ${confirmationWord}`}
                className={importExportInputClassName}
                id={`${fileInputId}-apply-confirmation`}
                onChange={(event) => setApplyConfirmation(event.currentTarget.value)}
                value={applyConfirmation}
              />
              <button
                className={`${isDatabase ? importExportWarningButtonClassName : importExportButtonClassName} lg:w-auto lg:min-w-56`}
                disabled={!canApply}
              >
                {isApplying ? "Applying..." : isDatabase ? "Import database workbook" : "Apply confirmed import"}
              </button>
              {applyDisabledReason ? (
                <p className="text-xs leading-5 text-zinc-500 lg:text-right">
                  {applyDisabledReason}
                </p>
              ) : null}
            </div>
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
      {error && !authPrompt ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function SupplierExcelImportWizard({
  authPrincipalKind,
  categories,
  onHeaderBackStateChange,
  onHeaderFileStateChange,
  selectedShopId,
  suppliers,
}: {
  authPrincipalKind?: AuthPrincipalKind;
  categories?: readonly CatalogOption[];
  onHeaderBackStateChange?: (state: HeaderBackState | null) => void;
  onHeaderFileStateChange?: (state: HeaderFileState | null) => void;
  selectedShopId?: string;
  suppliers?: readonly CatalogOption[];
}) {
  return (
    <ImportWizard
      authPrincipalKind={authPrincipalKind}
      categories={categories}
      mode="supplier"
      onHeaderBackStateChange={onHeaderBackStateChange}
      onHeaderFileStateChange={onHeaderFileStateChange}
      selectedShopId={selectedShopId}
      suppliers={suppliers}
    />
  );
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
  authPrincipalKind,
  canExport = false,
  canImport = false,
  categories = [],
  embedded = false,
  selectedShopId,
  suppliers = [],
}: ImportExportActionPanelProps) {
  const panelClassName = embedded
    ? "grid gap-4 lg:grid-cols-2"
    : `${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-4 lg:grid-cols-2`;
  const query = useMemo(() => shopQuery(selectedShopId), [selectedShopId]);

  return (
    <div className={panelClassName}>
      {canImport ? (
        <SupplierExcelImportWizard
          authPrincipalKind={authPrincipalKind}
          categories={categories}
          selectedShopId={selectedShopId}
          suppliers={suppliers}
        />
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
