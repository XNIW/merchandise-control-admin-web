"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildHistoryDetailSyncAnalysisModel,
  SyncAnalysisPanel,
} from "./SyncAnalysisPanel";
import { useModalFocusTrap } from "@/app/shop/_components/useModalFocusTrap";
import type { SupportedLocale } from "@/i18n/locales";

type HistoryDetailField = {
  key: string;
  label: string;
  value: string;
};

type HistoryDetailModalRow = {
  rowKey: string;
  rowNumber: string;
  itemCode: string;
  barcode: string;
  productName: string;
  sourceQuantity: string;
  countedQuantity: string;
  purchasePrice: string;
  salePrice: string;
  completion: string;
  productId: string | null;
  productLabel: string | null;
  productState: "active" | "archived" | "unresolved";
  oldPurchasePrice: string | null;
  oldRetailPrice: string | null;
  stockQuantity: string | null;
  values: string;
};

type HistoryDetailModalReadModel = {
  status: string;
  reason: string;
  detail: {
    entryId: string;
    kind: "sync_event" | "shared_sheet_session";
    title: string;
    source: string;
    sourceDeviceId: string | null;
    eventType: string;
    tableSummary: string;
    recordCount: number;
    payloadSummary: string;
    rawJsonPreview: string;
    createdAt: string;
    fields: HistoryDetailField[];
    sessionAnalysis: {
      completeCount: number;
      entryDate: string;
      missingCount: number;
      orderTotal: string;
      paymentTotal: string;
      rowCount: number;
      state: "active" | "tombstone";
      syncStateLabel: string;
      totalQuantity: string;
      updatedAt: string;
    } | null;
  } | null;
  rows: HistoryDetailModalRow[];
  missingRows: HistoryDetailModalRow[];
  linkedProducts: HistoryDetailModalRow[];
  syncEvents: Array<{
    eventId: string;
    eventType: string;
    status: "pending" | "success" | "failed";
    source: string | null;
    sourceDeviceId: string | null;
    changedCount: number;
    clientEventId: string | null;
    createdAt: string;
  }>;
};

type HistoryDetailPatchResponse = {
  result?: {
    code: string;
    fieldErrors?: Record<string, string>;
    message: string;
    ok: boolean;
  };
  status: string;
};

type HistoryRowEditDraft = {
  complete: boolean;
  countedQuantity: string;
  salePrice: string;
};

type HistoryTab = "analysis" | "rows" | "missing" | "products" | "sync";
type HistoryRowFilter = "all" | "completed" | "ignored" | "missing";
type HistoryDetailIconName =
  | "calendar"
  | "check"
  | "clock"
  | "device"
  | "file"
  | "folder"
  | "link"
  | "package"
  | "source"
  | "sync"
  | "truck"
  | "warning";

const tabs: Array<{ icon: HistoryDetailIconName; key: HistoryTab; label: string }> = [
  { icon: "file", key: "rows", label: "Rows preview" },
  { icon: "sync", key: "analysis", label: "Sync analysis" },
  { icon: "warning", key: "missing", label: "Missing / errors" },
  { icon: "package", key: "products", label: "Linked products" },
  { icon: "sync", key: "sync", label: "Sync events" },
];

type TranslateFn = (value: string) => string;

const identityTranslate: TranslateFn = (value) => value;

function HistoryDetailIcon({ name }: { name: HistoryDetailIconName }) {
  const commonProps = {
    "aria-hidden": true,
    className: "size-4 shrink-0",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };
  const paths: Record<HistoryDetailIconName, ReactNode> = {
    calendar: (
      <>
        <rect height="16" rx="2" width="18" x="3" y="5" />
        <path d="M8 3v4" />
        <path d="M16 3v4" />
        <path d="M3 10h18" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="m8.5 12 2.4 2.4 4.8-5" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </>
    ),
    device: (
      <>
        <rect height="16" rx="2" width="10" x="7" y="4" />
        <path d="M11 18h2" />
      </>
    ),
    file: (
      <>
        <path d="M6 3h8l4 4v14H6V3Z" />
        <path d="M14 3v5h5" />
      </>
    ),
    folder: (
      <>
        <path d="M4 6h7l2 2h7v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" />
        <path d="M8 13h8" />
      </>
    ),
    link: (
      <>
        <path d="M10 13a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1 1" />
        <path d="M14 11a4 4 0 0 0-5.7 0L6 13.3A4 4 0 0 0 11.7 19l1-1" />
      </>
    ),
    package: (
      <>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
        <path d="M4.5 7.5 12 12l7.5-4.5" />
        <path d="M12 12v9" />
      </>
    ),
    source: (
      <>
        <path d="M5 5h14v14H5z" />
        <path d="M9 9h6" />
        <path d="M9 13h6" />
      </>
    ),
    sync: (
      <>
        <path d="M4 12a8 8 0 0 1 13.6-5.6" />
        <path d="M18 3v4h-4" />
        <path d="M20 12a8 8 0 0 1-13.6 5.6" />
        <path d="M6 21v-4h4" />
      </>
    ),
    truck: (
      <>
        <path d="M3 8h11v8H3z" />
        <path d="M14 11h4l3 3v2h-7" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
      </>
    ),
    warning: (
      <>
        <path d="M12 4 3 20h18L12 4Z" />
        <path d="M12 9v5" />
        <path d="M12 17h.01" />
      </>
    ),
  };

  return <svg {...commonProps}>{paths[name]}</svg>;
}

function fieldValue(
  value: string | number | null | undefined,
  translate: TranslateFn = identityTranslate,
) {
  return value === null || value === undefined || value === ""
    ? translate("Not set")
    : String(value);
}

function formatDate(
  value: string | null | undefined,
  translate: TranslateFn = identityTranslate,
  locale: SupportedLocale = "en",
) {
  if (!value) {
    return translate("Not set");
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(intlLocale(locale), {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function detailField(
  readModel: HistoryDetailModalReadModel | null,
  key: string,
) {
  return readModel?.detail?.fields.find((field) => field.key === key)?.value ?? "Not set";
}

function isUnresolvedValue(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();

  return (
    normalized === "" ||
    normalized === "not resolved" ||
    normalized === "not set" ||
    normalized === "overlay unavailable" ||
    normalized === "unknown"
  );
}

function displayCell(value: string | null | undefined) {
  return isUnresolvedValue(value) ? "—" : String(value);
}

function editableCell(value: string | null | undefined) {
  return isUnresolvedValue(value) ? "" : String(value);
}

function parseDetailNumber(value: string | null | undefined) {
  const raw = editableCell(value).trim();

  if (!raw) {
    return null;
  }

  const normalized = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/(?<=\d)[.,](?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

const intlLocaleBySupportedLocale: Record<SupportedLocale, string> = {
  en: "en-US",
  es: "es-CL",
  it: "it-IT",
  "zh-CN": "zh-CN",
};

function intlLocale(locale: SupportedLocale = "en") {
  return intlLocaleBySupportedLocale[locale] ?? intlLocaleBySupportedLocale.en;
}

function formatDetailNumber(value: number, locale: SupportedLocale = "en") {
  return new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function formatSignedDetailNumber(value: number, locale: SupportedLocale = "en") {
  if (value === 0) {
    return "0";
  }

  return `${value > 0 ? "+" : ""}${formatDetailNumber(value, locale)}`;
}

function numbersMatch(left: string | null | undefined, right: string | null | undefined) {
  const leftNumber = parseDetailNumber(left);
  const rightNumber = parseDetailNumber(right);

  if (leftNumber === null || rightNumber === null) {
    return false;
  }

  return leftNumber === rightNumber;
}

function shouldShowOldPrice(
  oldValue: string | null | undefined,
  currentValue: string | null | undefined,
) {
  const oldNumber = parseDetailNumber(oldValue);

  if (oldNumber === null || oldNumber === 0) {
    return false;
  }

  return !numbersMatch(oldValue, currentValue);
}

function deriveCompleteFromCountedQuantity(
  row: HistoryDetailModalRow,
  countedQuantity: string,
  fallbackComplete: boolean,
) {
  const supplierQuantity = parseDetailNumber(row.sourceQuantity);
  const counted = parseDetailNumber(countedQuantity);

  if (counted === null || counted <= 0) {
    return false;
  }

  if (supplierQuantity === null) {
    return fallbackComplete;
  }

  return counted >= supplierQuantity;
}

function baseRowEdit(row: HistoryDetailModalRow): HistoryRowEditDraft {
  const countedQuantity = editableCell(row.countedQuantity);

  return {
    complete: deriveCompleteFromCountedQuantity(
      row,
      countedQuantity,
      row.completion === "Complete",
    ),
    countedQuantity,
    salePrice: editableCell(row.salePrice),
  };
}

function rowDraft(
  row: HistoryDetailModalRow,
  edits: Record<string, HistoryRowEditDraft> = {},
) {
  return edits[row.rowKey] ?? baseRowEdit(row);
}

function isIgnoredHistoryRow(row: HistoryDetailModalRow) {
  const tokens = [
    row.rowNumber,
    row.itemCode,
    row.barcode,
    row.productName,
    row.sourceQuantity,
    row.countedQuantity,
    row.purchasePrice,
    row.salePrice,
    row.values,
  ]
    .join(" ")
    .toLowerCase();
  const headerMatches = [
    /\bbarcode\b/,
    /\bitem(\s+code|\s+number)?\b/,
    /\bproduct(\s+name)?\b/,
    /\bquantity\b|\bqty\b/,
    /\bpurchase\b/,
    /\bretail\b/,
  ].filter((pattern) => pattern.test(tokens));

  return headerMatches.length >= 2;
}

function rowFilterKind(
  row: HistoryDetailModalRow,
  draft: HistoryRowEditDraft = baseRowEdit(row),
): HistoryRowFilter {
  if (isIgnoredHistoryRow(row)) {
    return "ignored";
  }

  return draft.complete ? "completed" : "missing";
}

function countRowsByKind(
  rows: readonly HistoryDetailModalRow[],
  edits: Record<string, HistoryRowEditDraft> = {},
) {
  return rows.reduce(
    (counts, row) => {
      const kind = rowFilterKind(row, rowDraft(row, edits));
      counts[kind] += 1;
      if (kind !== "ignored") {
        counts.all += 1;
      }

      return counts;
    },
    { all: 0, completed: 0, ignored: 0, missing: 0 },
  );
}

function initialRowEdits(rows: readonly HistoryDetailModalRow[]) {
  return Object.fromEntries(
    rows.map((row) => [
      row.rowKey,
      baseRowEdit(row),
    ]),
  ) as Record<string, HistoryRowEditDraft>;
}

type HistoryRowVisualState = "complete" | "ignored" | "partial" | "unresolved";

function rowVisualState(
  row: HistoryDetailModalRow,
  draft: HistoryRowEditDraft,
): HistoryRowVisualState {
  if (isIgnoredHistoryRow(row)) {
    return "ignored";
  }

  if (!row.productId) {
    return "unresolved";
  }

  const supplierQuantity = parseDetailNumber(row.sourceQuantity);
  const counted = parseDetailNumber(effectiveCountedQuantity(row, draft));

  if (counted === null || counted <= 0) {
    return "unresolved";
  }

  if (supplierQuantity === null) {
    return draft.complete ? "complete" : "unresolved";
  }

  return counted >= supplierQuantity ? "complete" : "partial";
}

function rowStateClasses(state: HistoryRowVisualState) {
  if (state === "complete") {
    return "border-emerald-200 bg-emerald-50/80 text-emerald-950";
  }

  if (state === "partial") {
    return "border-amber-200 bg-amber-50/90 text-amber-950";
  }

  if (state === "ignored") {
    return "border-zinc-200 bg-zinc-50 text-zinc-600";
  }

  return "border-zinc-100 bg-white text-zinc-950";
}

function productStatusClasses(state: HistoryDetailModalRow["productState"]) {
  if (state === "archived") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (state === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  return "border-zinc-200 bg-white text-zinc-600";
}

function effectiveCountedQuantity(row: HistoryDetailModalRow, draft: HistoryRowEditDraft) {
  return draft.countedQuantity ?? editableCell(row.countedQuantity);
}

function effectiveSalePrice(row: HistoryDetailModalRow, draft: HistoryRowEditDraft) {
  return draft.salePrice ?? editableCell(row.salePrice);
}

function rowQuantityDelta(row: HistoryDetailModalRow, draft: HistoryRowEditDraft) {
  const supplier = parseDetailNumber(row.sourceQuantity);
  const counted = parseDetailNumber(effectiveCountedQuantity(row, draft));

  if (supplier === null || counted === null) {
    return null;
  }

  return counted - supplier;
}

function rowTotalValue(row: HistoryDetailModalRow, draft: HistoryRowEditDraft) {
  const counted = parseDetailNumber(effectiveCountedQuantity(row, draft));
  const salePrice = parseDetailNumber(effectiveSalePrice(row, draft));

  if (counted === null || salePrice === null) {
    return null;
  }

  return counted * salePrice;
}

function paymentTotalFromRows(
  rows: readonly HistoryDetailModalRow[],
  edits: Record<string, HistoryRowEditDraft>,
  locale: SupportedLocale = "en",
) {
  let total = 0;
  let hasValue = false;

  for (const row of rows) {
    if (isIgnoredHistoryRow(row)) {
      continue;
    }

    const draft = rowDraft(row, edits);

    if (!draft.complete) {
      continue;
    }

    const counted =
      parseDetailNumber(effectiveCountedQuantity(row, draft)) ??
      parseDetailNumber(row.sourceQuantity);
    const salePrice =
      parseDetailNumber(effectiveSalePrice(row, draft)) ??
      parseDetailNumber(row.purchasePrice);

    if (counted === null || salePrice === null) {
      continue;
    }

    total += counted * salePrice;
    hasValue = true;
  }

  return hasValue ? formatDetailNumber(total, locale) : null;
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: HistoryDetailIconName;
  label: string;
  value: string;
}) {
  const compactValue = value.length > 24 || value.includes("/");

  return (
    <article className="min-w-0 rounded-md border border-zinc-200 bg-zinc-50 p-2.5">
      <div className="flex min-w-0 items-start gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-md border border-zinc-200 bg-white text-emerald-800">
          <HistoryDetailIcon name={icon} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
            {label}
          </p>
          <p
            className={[
              "mt-1 break-words font-semibold text-zinc-950 [overflow-wrap:anywhere]",
              compactValue ? "line-clamp-2 text-sm leading-5" : "text-base",
            ].join(" ")}
            title={value}
          >
            {value}
          </p>
        </div>
      </div>
    </article>
  );
}

function HistorySkeleton() {
  return (
    <div className="grid gap-4 p-5" data-history-detail-loading>
      <div className="h-7 w-2/5 rounded-md bg-zinc-200" />
      <div className="grid gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div className="h-20 rounded-md bg-zinc-100" key={item} />
        ))}
      </div>
      <div className="h-80 rounded-md bg-zinc-100" />
    </div>
  );
}

function RowsTable({
  editable = false,
  edits = {},
  filter,
  labels,
  locale = "en",
  onEdit,
  onComplete,
  onFilterChange,
  rows,
  saving = false,
  showFilters = true,
}: {
  editable?: boolean;
  edits?: Record<string, HistoryRowEditDraft>;
  filter: HistoryRowFilter;
  labels?: Record<string, string>;
  locale?: SupportedLocale;
  onEdit?: (
    rowKey: string,
    field: "countedQuantity" | "salePrice",
    value: string,
  ) => void;
  onComplete?: (rowKey: string, value: boolean) => void;
  onFilterChange: (filter: HistoryRowFilter) => void;
  rows: readonly HistoryDetailModalRow[];
  saving?: boolean;
  showFilters?: boolean;
}) {
  const translate = (value: string) => labels?.[value] ?? value;
  const counts = countRowsByKind(rows, edits);
  const visibleRows =
    filter === "all"
      ? rows.filter((row) => rowFilterKind(row, rowDraft(row, edits)) !== "ignored")
      : rows.filter((row) => rowFilterKind(row, rowDraft(row, edits)) === filter);
  const filters: Array<{ key: HistoryRowFilter; label: string; show?: boolean }> = [
    { key: "all", label: "All" },
    { key: "missing", label: "Missing" },
    { key: "completed", label: "Completed" },
    { key: "ignored", label: "Ignored", show: counts.ignored > 0 },
  ];

  return (
    <div className="grid gap-3">
      {showFilters ? (
        <div
          className="flex min-w-0 flex-wrap gap-2"
          aria-label={translate("Row filters")}
        >
          {filters
            .filter((item) => item.show ?? true)
            .map((item) => (
              <button
                aria-pressed={filter === item.key}
                className={[
                  "inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold",
                  filter === item.key
                    ? "border-emerald-700 bg-emerald-50 text-emerald-800"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
                ].join(" ")}
                key={item.key}
                onClick={() => onFilterChange(item.key)}
                type="button"
              >
                {translate(item.label)} {counts[item.key]}
              </button>
            ))}
        </div>
      ) : null}
      <div
        className="h-[min(64dvh,44rem)] min-h-80 overflow-y-auto overflow-x-hidden rounded-md border border-zinc-200"
        data-history-detail-rows-frame
      >
        <table className="w-full table-fixed text-left text-sm">
        <colgroup>
          <col className="w-[4%]" />
          <col className="w-[34%]" />
          <col className="w-[9%]" />
          <col className="w-[9%]" />
          <col className="w-[11%]" />
          <col className="w-[13%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-zinc-50 text-xs uppercase tracking-normal text-zinc-500">
          <tr>
            <th className="bg-zinc-50 px-2 py-2" rowSpan={2} scope="col">
              {translate("No.")}
            </th>
            <th className="px-2 py-2" rowSpan={2} scope="col">
              {translate("Product")}
            </th>
            <th
              className="border-l border-zinc-200 px-2 py-2"
              colSpan={2}
              scope="colgroup"
            >
              {translate("Recognized from file")}
            </th>
            <th
              className="border-l border-zinc-200 px-2 py-2"
              colSpan={3}
              scope="colgroup"
            >
              {translate("Import values")}
            </th>
            <th className="px-2 py-2" rowSpan={2} scope="col">
              {translate("Product detail")}
            </th>
          </tr>
          <tr className="border-t border-zinc-200">
            <th className="border-l border-zinc-200 px-2 py-2" scope="col">
              <span className="sr-only">{translate("Quantity")}</span>
              {translate("Supplier Qty")}
            </th>
            <th className="px-2 py-2" scope="col">{translate("Purchase")}</th>
            <th className="border-l border-zinc-200 px-2 py-2" scope="col">
              {translate("Counted Qty")}
            </th>
            <th className="px-2 py-2" scope="col">
              <span className="sr-only">{translate("Retail")}</span>
              {translate("Sale Price")}
            </th>
            <th className="px-2 py-2" scope="col">{translate("Status")}</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.length > 0 ? (
            visibleRows.map((row) => {
              const draft = rowDraft(row, edits);
              const kind = rowFilterKind(row, draft);
              const visualState = rowVisualState(row, draft);
              const canEditRow = editable && kind !== "ignored";
              const oldPurchaseVisible = shouldShowOldPrice(
                row.oldPurchasePrice,
                row.purchasePrice,
              );
              const oldRetailVisible = shouldShowOldPrice(
                row.oldRetailPrice,
                effectiveSalePrice(row, draft),
              );
              const quantityDelta = rowQuantityDelta(row, draft);
              const rowTotal = rowTotalValue(row, draft);
              const productStatus =
                row.productState === "archived"
                  ? translate("Archived")
                  : row.productState === "active"
                    ? translate("In catalog")
                    : translate("No match");
              const status =
                kind === "ignored"
                  ? translate("Ignored header row")
                  : visualState === "complete"
                    ? translate("Completed")
                    : visualState === "partial"
                      ? translate("Partial")
                      : row.productId
                        ? translate("Missing")
                        : translate("No match");

              return (
              <tr
                className={[
                  "border-t align-top transition-colors",
                  rowStateClasses(visualState),
                ].join(" ")}
                data-history-detail-row
                data-history-row-key={row.rowKey}
                data-history-row-state={visualState}
                key={row.rowKey}
              >
                <td className="px-2 py-2 font-mono text-xs">
                  {row.rowNumber}
                </td>
                <td className="min-w-0 px-2 py-2" title={displayCell(row.productName)}>
                  <div className="min-w-0 space-y-1.5">
                    <p className="truncate font-medium text-zinc-950" title={displayCell(row.productName)}>
                      {displayCell(row.productName)}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xs text-zinc-500">
                      <span className="sr-only">{translate("Item code")} </span>
                      {displayCell(row.itemCode)}
                      <span className="mx-1 text-zinc-300">/</span>
                      <span className="sr-only">{translate("Barcode")} </span>
                      {displayCell(row.barcode)}
                    </p>
                    <div className="flex min-w-0 flex-wrap gap-1.5 text-[11px] leading-4">
                      <span
                        className={[
                          "inline-flex max-w-full items-center rounded-md border px-1.5 py-0.5 font-semibold",
                          productStatusClasses(row.productState),
                        ].join(" ")}
                      >
                        <span className="truncate">{productStatus}</span>
                      </span>
                      {row.stockQuantity ? (
                        <span className="inline-flex rounded-md border border-zinc-200 bg-white/70 px-1.5 py-0.5 text-zinc-600">
                          {translate("Stock")} {displayCell(row.stockQuantity)}
                        </span>
                      ) : null}
                      {oldPurchaseVisible ? (
                        <span className="inline-flex rounded-md border border-zinc-200 bg-white/70 px-1.5 py-0.5 text-zinc-600">
                          {translate("Old purchase")} {displayCell(row.oldPurchasePrice)}
                        </span>
                      ) : null}
                      {oldRetailVisible ? (
                        <span className="inline-flex rounded-md border border-zinc-200 bg-white/70 px-1.5 py-0.5 text-zinc-600">
                          {translate("Old retail")} {displayCell(row.oldRetailPrice)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="border-l border-zinc-100 px-2 py-2 font-mono text-sm">
                  <span
                    className="inline-flex max-w-full rounded-md bg-white/70 px-2 py-1 text-zinc-700"
                    title={displayCell(row.sourceQuantity)}
                  >
                    <span className="truncate">{displayCell(row.sourceQuantity)}</span>
                  </span>
                </td>
                <td className="px-2 py-2 font-mono text-sm">
                  <span
                    className="inline-flex max-w-full rounded-md bg-white/70 px-2 py-1 text-zinc-700"
                    title={displayCell(row.purchasePrice)}
                  >
                    <span className="truncate">{displayCell(row.purchasePrice)}</span>
                  </span>
                </td>
                <td className="border-l border-zinc-100 px-2 py-2">
                  {canEditRow ? (
                    <input
                      aria-label={`${translate("Counted Qty")} ${row.rowNumber}`}
                      className="h-8 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
                      disabled={saving}
                      inputMode="decimal"
                      onChange={(event) =>
                        onEdit?.(row.rowKey, "countedQuantity", event.target.value)
                      }
                      value={draft.countedQuantity}
                    />
                  ) : (
                    displayCell(row.countedQuantity)
                  )}
                  {quantityDelta !== null ? (
                    <p
                      className={[
                        "mt-1 truncate text-[11px] font-medium",
                        quantityDelta < 0
                          ? "text-amber-700"
                          : quantityDelta > 0
                            ? "text-sky-700"
                            : "text-emerald-700",
                      ].join(" ")}
                      title={`${translate("Delta")} ${formatSignedDetailNumber(quantityDelta, locale)}`}
                    >
                      {translate("Delta")} {formatSignedDetailNumber(quantityDelta, locale)}
                    </p>
                  ) : null}
                </td>
                <td className="px-2 py-2">
                  {canEditRow ? (
                    <input
                      aria-label={`${translate("Sale Price")} ${row.rowNumber}`}
                      className="h-8 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
                      disabled={saving}
                      inputMode="decimal"
                      onChange={(event) =>
                        onEdit?.(row.rowKey, "salePrice", event.target.value)
                      }
                      value={draft.salePrice}
                    />
                  ) : (
                    displayCell(row.salePrice)
                  )}
                  <p className="mt-1 truncate text-[11px] font-medium text-zinc-600">
                    {translate("Row total")}{" "}
                    {rowTotal === null ? "—" : formatDetailNumber(rowTotal, locale)}
                  </p>
                </td>
                <td className="px-2 py-2">
                  {canEditRow ? (
                    <label className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs font-medium text-zinc-800">
                      <input
                        aria-label={`${translate("Complete")} ${row.rowNumber}`}
                        checked={draft.complete}
                        className="size-4 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-700"
                        disabled={saving}
                        onChange={(event) =>
                          onComplete?.(row.rowKey, event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span className="truncate">
                        {status}
                      </span>
                    </label>
                  ) : (
                    <span
                      className={[
                        "inline-flex rounded-md border px-2 py-1 text-xs font-semibold",
                        visualState === "ignored"
                          ? "border-zinc-200 bg-zinc-50 text-zinc-700"
                          : visualState === "complete"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : visualState === "partial"
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : "border-zinc-200 bg-white text-zinc-700",
                      ].join(" ")}
                    >
                      {status}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {row.productId && kind !== "ignored" ? (
                    <a
                      className="inline-flex h-8 max-w-full items-center rounded-md border border-zinc-300 px-2 text-xs font-medium text-zinc-900 hover:border-emerald-400 hover:text-emerald-800"
                      data-product-detail-id={row.productId}
                      data-product-detail-trigger
                      href={`/shop/products/${encodeURIComponent(row.productId)}`}
                    >
                      {translate("Open")}
                    </a>
                  ) : (
                    <span
                      aria-disabled="true"
                      className="inline-flex h-8 max-w-full items-center rounded-md border border-zinc-200 px-2 text-xs font-medium text-zinc-500"
                      title={translate("Product not resolved from barcode or item code")}
                    >
                      <span className="truncate">
                        {kind === "ignored" ? translate("Ignored") : translate("No match")}
                      </span>
                    </span>
                  )}
                </td>
              </tr>
              );
            })
          ) : (
            <tr>
              <td className="px-3 py-5 text-zinc-500" colSpan={8}>
                {translate("No bounded row data is available for this entry.")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export function HistoryDetailModalController({
  labels,
  locale = "en",
  requestedShopId,
}: {
  labels?: Record<string, string>;
  locale?: SupportedLocale;
  requestedShopId?: string | null;
}) {
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<HistoryTab>("rows");
  const [rowFilter, setRowFilter] = useState<HistoryRowFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readModel, setReadModel] = useState<HistoryDetailModalReadModel | null>(null);
  const [rowEdits, setRowEdits] = useState<Record<string, HistoryRowEditDraft>>({});
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const detail = readModel?.detail ?? null;
  const translate = useCallback((value: string) => labels?.[value] ?? value, [labels]);
  const formatModalDate = useCallback(
    (value: string | null | undefined) => formatDate(value, translate, locale),
    [locale, translate],
  );
  const titleId = "history-detail-modal-title";
  const canEditRows =
    detail?.kind === "shared_sheet_session" &&
    detail.sessionAnalysis?.state === "active";

  const loadEntry = useCallback(
    async (entryId: string) => {
      const params = new URLSearchParams({ entry_id: entryId });

      if (requestedShopId) {
        params.set("shop_id", requestedShopId);
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/shop/history/detail?${params.toString()}`, {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        const body = (await response.json()) as HistoryDetailModalReadModel;

        if (!response.ok || body.status !== "ready") {
          setReadModel(body);
          setRowEdits(initialRowEdits(body.rows ?? []));
          setError(body.reason || translate("History detail is not available."));
          return;
        }

        setReadModel(body);
        setRowEdits(initialRowEdits(body.rows ?? []));
      } catch {
        setError(translate("History detail could not be loaded."));
      } finally {
        setLoading(false);
      }
    },
    [requestedShopId, translate],
  );

  const openEntry = useCallback(
    (entryId: string) => {
      setOpen(true);
      setTab("rows");
      setRowFilter("all");
      setReadModel(null);
      setRowEdits({});
      setSaveMessage(null);
      void loadEntry(entryId);
    },
    [loadEntry],
  );
  const closeModal = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => lastTriggerRef.current?.focus(), 0);
  }, []);
  const updateRowEdit = useCallback(
    (
      rowKey: string,
      field: "countedQuantity" | "salePrice",
      value: string,
    ) => {
      const row = readModel?.rows.find((item) => item.rowKey === rowKey);

      setRowEdits((current) => {
        const base = row
          ? rowDraft(row, current)
          : {
              complete: current[rowKey]?.complete ?? false,
              countedQuantity: current[rowKey]?.countedQuantity ?? "",
              salePrice: current[rowKey]?.salePrice ?? "",
            };
        const nextDraft = {
          ...base,
          [field]: value,
        };

        if (row && field === "countedQuantity") {
          nextDraft.complete = deriveCompleteFromCountedQuantity(
            row,
            value,
            base.complete,
          );
        }

        return {
          ...current,
          [rowKey]: nextDraft,
        };
      });
      setSaveMessage(null);
    },
    [readModel?.rows],
  );
  const updateRowComplete = useCallback(
    (rowKey: string, value: boolean) => {
      const row = readModel?.rows.find((item) => item.rowKey === rowKey);

      setRowEdits((current) => {
        const base = row
          ? rowDraft(row, current)
          : {
              complete: current[rowKey]?.complete ?? false,
              countedQuantity: current[rowKey]?.countedQuantity ?? "",
              salePrice: current[rowKey]?.salePrice ?? "",
            };

        return {
          ...current,
          [rowKey]: {
            ...base,
            complete: value
              ? row
                ? deriveCompleteFromCountedQuantity(
                    row,
                    base.countedQuantity,
                    true,
                  )
                : false
              : false,
          },
        };
      });
      setSaveMessage(null);
    },
    [readModel?.rows],
  );
  const rowEditPatches = useMemo(() => {
    const rows = readModel?.rows ?? [];

    return rows
      .map((row) => {
        const draft = rowDraft(row, rowEdits);
        const countedQuantityChanged =
          draft.countedQuantity !== editableCell(row.countedQuantity);
        const salePriceChanged = draft.salePrice !== editableCell(row.salePrice);
        const completeChanged = draft.complete !== (row.completion === "Complete");

        if (!countedQuantityChanged && !salePriceChanged && !completeChanged) {
          return null;
        }

        return {
          complete: draft.complete,
          countedQuantity: draft.countedQuantity,
          rowKey: row.rowKey,
          salePrice: draft.salePrice,
        };
      })
      .filter((row): row is {
        complete: boolean;
        countedQuantity: string;
        rowKey: string;
        salePrice: string;
      } => Boolean(row));
  }, [readModel?.rows, rowEdits]);
  const hasRowEditChanges = rowEditPatches.length > 0;
  const saveGeneratedRows = useCallback(async () => {
    if (!detail || !canEditRows || rowEditPatches.length === 0) {
      return;
    }

    const params = new URLSearchParams({ entry_id: detail.entryId });

    if (requestedShopId) {
      params.set("shop_id", requestedShopId);
    }

    setSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const response = await fetch(`/shop/history/detail?${params.toString()}`, {
        body: JSON.stringify({
          expectedUpdatedAt: detail.sessionAnalysis?.updatedAt,
          rows: rowEditPatches,
        }),
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });
      const body = (await response.json()) as HistoryDetailPatchResponse;

      if (!response.ok || body.result?.ok !== true) {
        const fieldError = body.result?.fieldErrors
          ? Object.values(body.result.fieldErrors)[0]
          : null;
        setError(fieldError ?? body.result?.message ?? translate("Save failed"));
        return;
      }

      await loadEntry(detail.entryId);
      setSaveMessage(translate("History Entry updated"));
    } catch {
      setError(translate("Save failed"));
    } finally {
      setSaving(false);
    }
  }, [
    canEditRows,
    detail,
    loadEntry,
    requestedShopId,
    rowEditPatches,
    translate,
  ]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const trigger = target.closest("[data-history-detail-trigger]");

      if (!(trigger instanceof HTMLElement)) {
        return;
      }

      const entryId = trigger.dataset.historyDetailId;

      if (!entryId) {
        return;
      }

      event.preventDefault();
      lastTriggerRef.current = trigger;
      openEntry(entryId);
    };

    document.addEventListener("click", onClick);

    return () => document.removeEventListener("click", onClick);
  }, [openEntry]);

  const summaryCards = useMemo(() => {
    const rows = readModel?.rows ?? [];
    const rowCounts = countRowsByKind(rows, rowEdits);
    const completed = rowCounts.completed;
    const missing = rowCounts.missing;
    const items = completed + missing;
    const livePaymentTotal = paymentTotalFromRows(rows, rowEdits, locale);
    const cards: Array<{
      icon: HistoryDetailIconName;
      label: string;
      value: string;
    }> = [
      {
        icon: "package" as const,
        label: translate("Items"),
        value: String(items),
      },
      {
        icon: "file" as const,
        label: translate("Total quantity"),
        value: fieldValue(detail?.sessionAnalysis?.totalQuantity, translate),
      },
      {
        icon: "truck" as const,
        label: translate("Order"),
        value: fieldValue(detail?.sessionAnalysis?.orderTotal, translate),
      },
      {
        icon: "check" as const,
        label: translate("Paid"),
        value: fieldValue(
          livePaymentTotal ?? detail?.sessionAnalysis?.paymentTotal,
          translate,
        ),
      },
      {
        icon: "warning" as const,
        label: translate("Missing"),
        value: String(missing),
      },
      {
        icon: "source" as const,
        label: translate("Source"),
        value: fieldValue(detail?.source, translate),
      },
    ];

    if (detail?.sourceDeviceId) {
      cards.push({
        icon: "device" as const,
        label: translate("Device"),
        value: detail.sourceDeviceId,
      });
    }

    return cards;
  }, [detail, locale, readModel, rowEdits, translate]);
  const syncAnalysisModel = useMemo(() => {
    const rows = readModel?.rows ?? [];
    const rowCounts = countRowsByKind(rows, rowEdits);
    const unresolvedProductRowCount = rows.filter(
      (row) => rowFilterKind(row, rowDraft(row, rowEdits)) !== "ignored" && !row.productId,
    ).length;

    return buildHistoryDetailSyncAnalysisModel({
      detail,
      linkedProductCount: readModel?.linkedProducts.length,
      missingRowCount: rowCounts.missing,
      rowCount: rows.length,
      syncEvents: readModel?.syncEvents,
      unresolvedProductRowCount,
    });
  }, [detail, readModel, rowEdits]);
  const closeDisabled = saving;
  const requestCloseModal = useCallback(() => {
    if (!closeDisabled) {
      closeModal();
    }
  }, [closeDisabled, closeModal]);
  const dialogRef = useModalFocusTrap<HTMLElement>(
    open,
    closeDisabled ? undefined : requestCloseModal,
  );

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-zinc-950/35 p-0 sm:p-6">
      <div className="flex min-h-full min-w-0 items-center justify-center">
        <section
          aria-label={translate("History entry detail")}
          aria-labelledby={titleId}
          aria-modal="true"
          className="flex h-dvh max-h-dvh w-full min-w-0 flex-col overflow-hidden rounded-none bg-white shadow-xl sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:w-[min(1120px,calc(100vw-48px))] sm:rounded-md xl:w-[min(1200px,calc(100vw-72px))]"
          ref={dialogRef}
          role="dialog"
          tabIndex={-1}
        >
          {loading && !readModel ? (
            <HistorySkeleton />
          ) : (
            <>
              <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white">
                <div className="flex min-w-0 flex-col gap-3 px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-md border border-sky-200 bg-sky-50 text-sky-800">
                      <HistoryDetailIcon name="file" />
                    </span>
                    <div className="min-w-0">
                      <h2
                        className="line-clamp-2 break-words text-xl font-semibold leading-7 text-zinc-950 [overflow-wrap:anywhere]"
                        id={titleId}
                        title={detail?.title ?? translate("History entry detail")}
                      >
                        {detail?.title ?? translate("History entry detail")}
                      </h2>
                      <div className="mt-2 flex min-w-0 flex-wrap gap-2 text-xs text-zinc-700">
                        <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1">
                          <HistoryDetailIcon name="truck" />
                          <span className="min-w-0 truncate">
                            {fieldValue(detailField(readModel, "supplier"), translate)}
                          </span>
                        </span>
                        <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1">
                          <HistoryDetailIcon name="folder" />
                          <span className="min-w-0 truncate">
                            {fieldValue(detailField(readModel, "category"), translate)}
                          </span>
                        </span>
                        <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1">
                          <HistoryDetailIcon name="source" />
                          <span className="min-w-0 truncate">
                            {fieldValue(detail?.source, translate)}
                          </span>
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">
                          <HistoryDetailIcon name={detail?.kind === "sync_event" ? "sync" : "file"} />
                          {detail?.kind === "sync_event"
                            ? translate("Sync event")
                            : translate("History entry")}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-700">
                          <HistoryDetailIcon name="calendar" />
                          {translate(
                            detail?.kind === "shared_sheet_session"
                              ? "Entry date"
                              : "Created",
                          )}{" "}
                          {formatModalDate(
                            detail?.sessionAnalysis?.entryDate ?? detail?.createdAt,
                          )}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-700">
                          <HistoryDetailIcon name="clock" />
                          {translate("Updated")}{" "}
                          {formatModalDate(detail?.sessionAnalysis?.updatedAt)}
                        </span>
                        <span
                          className={[
                            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold",
                            detail?.sessionAnalysis?.state === "tombstone"
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : "border-emerald-200 bg-emerald-50 text-emerald-800",
                          ].join(" ")}
                        >
                          <HistoryDetailIcon
                            name={
                              detail?.sessionAnalysis?.state === "tombstone"
                                ? "warning"
                                : "check"
                            }
                          />
                          {detail?.sessionAnalysis?.state === "tombstone"
                            ? translate("Deleted")
                            : detail?.kind === "sync_event"
                              ? translate("Synced")
                              : translate("Active")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {canEditRows ? (
                      <button
                        className={[
                          "inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium",
                          hasRowEditChanges && !saving
                            ? "border-emerald-700 bg-emerald-900 text-white hover:bg-emerald-800"
                            : "border-zinc-200 bg-zinc-100 text-zinc-500",
                        ].join(" ")}
                        disabled={!hasRowEditChanges || saving}
                        onClick={() => void saveGeneratedRows()}
                        type="button"
                      >
                        {saving
                          ? translate("Saving")
                          : translate("Save changes")}
                      </button>
                    ) : null}
                    <button
                      className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={closeDisabled}
                      onClick={requestCloseModal}
                      type="button"
                    >
                      {translate("Close")}
                    </button>
                  </div>
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                {error ? (
                  <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                    {error}
                  </p>
                ) : null}
                {saveMessage ? (
                  <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
                    {saveMessage}
                  </p>
                ) : null}
                {detail ? (
                  <div className="grid gap-5">
                    <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                      {summaryCards.map((card) => (
                        <SummaryCard
                          icon={card.icon}
                          key={card.label}
                          label={card.label}
                          value={card.value}
                        />
                      ))}
                    </section>

                    <nav
                      aria-label={translate("History detail tabs")}
                      className="flex min-w-0 gap-2 overflow-x-auto border-b border-zinc-200"
                    >
                      {tabs.map((item) => (
                        <button
                          aria-pressed={tab === item.key}
                          className={[
                            "inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700",
                            tab === item.key
                              ? "border-emerald-700 text-emerald-800"
                              : "border-transparent text-zinc-600 hover:text-zinc-950",
                          ].join(" ")}
                          id={`history-detail-tab-${item.key}`}
                          key={item.key}
                          onClick={() => setTab(item.key)}
                          type="button"
                        >
                          <HistoryDetailIcon name={item.icon} />
                          {translate(item.label)}
                        </button>
                      ))}
                    </nav>

                    {tab === "rows" ? (
                      <section
                        aria-labelledby="history-detail-tab-rows"
                        id="history-detail-panel-rows"
                      >
                        <RowsTable
                          editable={canEditRows}
                          edits={rowEdits}
	                          filter={rowFilter}
	                          labels={labels}
	                          locale={locale}
	                          onComplete={updateRowComplete}
                          onEdit={updateRowEdit}
                          onFilterChange={setRowFilter}
                          rows={readModel?.rows ?? []}
                          saving={saving}
                        />
                      </section>
                    ) : null}

                    {tab === "analysis" ? (
                      <section
                        aria-labelledby="history-detail-tab-analysis"
                        id="history-detail-panel-analysis"
                      >
                        <SyncAnalysisPanel
                          labels={labels}
                          model={syncAnalysisModel}
                        />
                      </section>
                    ) : null}

                    {tab === "missing" ? (
                      <section
                        aria-labelledby="history-detail-tab-missing"
                        className="grid gap-4"
                        id="history-detail-panel-missing"
                      >
                        {(readModel?.missingRows.length ?? 0) > 0 ? (
                          <RowsTable
	                            filter="all"
	                            labels={labels}
	                            locale={locale}
	                            onFilterChange={() => undefined}
                            rows={readModel?.missingRows ?? []}
                            showFilters={false}
                          />
                        ) : (
                          <p className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                            {translate("No missing products or row errors are visible in this bounded payload.")}
                          </p>
                        )}
                        {!["None", "Not set", ""].includes(detailField(readModel, "errors")) ? (
                          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                            <p className="font-semibold text-zinc-950">{translate("Errors")}</p>
                            <p className="mt-1">{detailField(readModel, "errors")}</p>
                          </div>
                        ) : null}
                      </section>
                    ) : null}

                    {tab === "products" ? (
                      <section
                        aria-labelledby="history-detail-tab-products"
                        className="grid gap-3"
                        id="history-detail-panel-products"
                      >
                        {readModel?.linkedProducts.length ? (
                          readModel.linkedProducts.map((row) => (
                            <article
                              className="grid gap-2 rounded-md border border-zinc-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                              key={`${row.rowKey}:${row.productId}`}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-zinc-950" title={row.productLabel ?? row.productName}>
                                  {displayCell(row.productLabel ?? row.productName)}
                                </p>
                                <p className="mt-1 text-xs text-zinc-600">
                                  {displayCell(row.barcode)} / {translate("row")} {row.rowNumber}
                                </p>
                              </div>
                              {row.productId ? (
                                <a
                                  className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-300 px-2.5 text-xs font-medium text-zinc-900 hover:border-emerald-400 hover:text-emerald-800"
                                  data-product-detail-id={row.productId}
                                  data-product-detail-trigger
                                  href={`/shop/products/${encodeURIComponent(row.productId)}`}
                                >
                                  {translate("Product detail")}
                                </a>
                              ) : null}
                            </article>
                          ))
                        ) : (
                          <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                            {translate("No product shortcuts were resolved from this bounded detail payload.")}
                          </p>
                        )}
                      </section>
                    ) : null}

                    {tab === "sync" ? (
                      <section
                        aria-labelledby="history-detail-tab-sync"
                        className="overflow-x-auto rounded-md border border-zinc-200"
                        id="history-detail-panel-sync"
                      >
                        <table className="w-full min-w-[56rem] text-left text-sm">
                          <thead className="bg-zinc-50 text-xs uppercase tracking-normal text-zinc-500">
                            <tr>
                              <th className="px-3 py-2">{translate("Event")}</th>
                              <th className="px-3 py-2">{translate("State")}</th>
                              <th className="px-3 py-2">{translate("Source")}</th>
                              <th className="px-3 py-2">{translate("Changed")}</th>
                              <th className="px-3 py-2">{translate("Client event")}</th>
                              <th className="px-3 py-2">{translate("Created")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {readModel?.syncEvents.length ? (
                              readModel.syncEvents.map((event) => (
                                <tr className="border-t border-zinc-100" key={event.eventId}>
                                  <td className="px-3 py-2">{event.eventType}</td>
                                  <td className="px-3 py-2">{event.status}</td>
                                  <td className="px-3 py-2">{fieldValue(event.sourceDeviceId ?? event.source, translate)}</td>
                                  <td className="px-3 py-2">{event.changedCount}</td>
                                  <td className="px-3 py-2">{displayCell(event.clientEventId)}</td>
	                                  <td className="px-3 py-2">{formatModalDate(event.createdAt)}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td className="px-3 py-5 text-zinc-500" colSpan={6}>
                                  {translate("No related sync events are visible for this entry.")}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </section>
                    ) : null}

                    <details className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-zinc-950">
                        {translate("Redacted diagnostics")}
                      </summary>
                      <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-zinc-950 p-3 text-xs leading-5 text-zinc-100">
                        {detail.rawJsonPreview}
                      </pre>
                    </details>
                  </div>
                ) : loading ? (
                  <HistorySkeleton />
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
