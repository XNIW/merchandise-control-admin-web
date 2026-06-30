"use client";

import { type ReactNode, useMemo } from "react";
import type { AdminDataTableRow } from "@/components/admin/AdminDataTable";
import type { ShopSection } from "@/components/shop/shopSections";
import type { SupportedLocale } from "@/i18n/locales";

type HistoryStatusFilter =
  | "active_issues"
  | "active"
  | "all"
  | "deleted"
  | "issues"
  | "technical";
type HistoryIconName =
  | "calendar"
  | "check"
  | "clock"
  | "file"
  | "folder"
  | "package"
  | "search"
  | "sync"
  | "truck"
  | "warning";

type HistoryEntriesClientListProps = {
  detailLabel: string;
  labels?: Record<string, string>;
  liveData: NonNullable<ShopSection["liveData"]>;
  locale: SupportedLocale;
  pagination?: HistoryPaginationState;
  rawRows: AdminDataTableRow[];
  requestedShopId?: string | null;
  selectedFilters?: {
    month: string | null;
    query: string | null;
    status: HistoryStatusFilter;
  };
};

type HistoryPaginationState = {
  currentPageRows: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  page: number;
  pageSize: 10 | 25 | 50 | 100 | 200;
  rangeEnd: number;
  rangeStart: number;
  totalCount: number;
  totalCountStatus: "deferred" | "exact";
  totalPages: number;
};

type HistoryEntryView = {
  classification: {
    deleted: boolean;
    issue: boolean;
    status: string;
    technical: boolean;
  };
  date: Date | null;
  displayRow: AdminDataTableRow;
  rawRow: AdminDataTableRow;
};

function HistoryListIcon({ name }: { name: HistoryIconName }) {
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
  const paths: Record<HistoryIconName, ReactNode> = {
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
    package: (
      <>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
        <path d="M4.5 7.5 12 12l7.5-4.5" />
        <path d="M12 12v9" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="6" />
        <path d="m16 16 4 4" />
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

function rowString(row: AdminDataTableRow, key: string) {
  const value = row[key];

  return typeof value === "string" ? value : "";
}

function translateLabel(labels: Record<string, string> | undefined, value: string) {
  return labels?.[value] ?? value;
}

function buildHistoryHref(input: {
  month?: string | null;
  page?: number | string | null;
  pageSize?: number | string | null;
  query?: string | null;
  requestedShopId?: string | null;
  status?: HistoryStatusFilter | null;
}) {
  const nextParams = new URLSearchParams();

  if (input.requestedShopId) {
    nextParams.set("shop_id", input.requestedShopId);
  }

  if (input.query) {
    nextParams.set("q", input.query);
  }

  if (input.month) {
    nextParams.set("month", input.month);
  }

  if (input.status && input.status !== "active_issues") {
    nextParams.set("status", input.status);
  }

  if (input.page && String(input.page) !== "1") {
    nextParams.set("page", String(input.page));
  }

  if (input.pageSize && String(input.pageSize) !== "10") {
    nextParams.set("pageSize", String(input.pageSize));
  }

  const query = nextParams.toString();

  return query ? `/shop/history?${query}` : "/shop/history";
}

function buildHistoryDetailHref(
  entryId: string,
  input: {
    month?: string | null;
    page?: number | string | null;
    pageSize?: number | string | null;
    query?: string | null;
    requestedShopId?: string | null;
    status?: HistoryStatusFilter | null;
  },
) {
  const listHref = buildHistoryHref(input);
  const query = listHref.includes("?") ? listHref.slice(listHref.indexOf("?")) : "";

  return `/shop/history/${encodeURIComponent(entryId)}${query}`;
}

function splitSupplierCategory(
  value: string,
  labels?: Record<string, string>,
) {
  const [supplier, ...categoryParts] = value.split(" / ");
  const category = categoryParts.join(" / ");

  return {
    category: category || translateLabel(labels, "Category not set"),
    supplier: supplier || translateLabel(labels, "Supplier not set"),
  };
}

function parseRowDate(displayRow: AdminDataTableRow, rawRow: AdminDataTableRow) {
  const value =
    rowString(rawRow, "entryDate") ||
    rowString(displayRow, "entryDate") ||
    rowString(rawRow, "timestamp") ||
    rowString(displayRow, "timestamp") ||
    rowString(rawRow, "created") ||
    rowString(displayRow, "created") ||
    rowString(rawRow, "updated") ||
    rowString(displayRow, "updated");

  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function classifyHistoryRow(
  displayRow: AdminDataTableRow,
  rawRow: AdminDataTableRow,
  labels?: Record<string, string>,
) {
  const status =
    rowString(displayRow, "status") ||
    rowString(displayRow, "state") ||
    rowString(rawRow, "status") ||
    rowString(rawRow, "state") ||
    translateLabel(labels, "Active");
  const normalized = [
    status,
    rowString(displayRow, "overlay"),
    rowString(displayRow, "payload"),
    rowString(rawRow, "overlay"),
    rowString(rawRow, "payload"),
  ]
    .join(" ")
    .toLowerCase();
  const deleted =
    normalized.includes("deleted") ||
    normalized.includes("tombstone") ||
    normalized.includes("deleted_at");
  const technical =
    rowString(displayRow, "technical") === "true" ||
    rowString(rawRow, "technical") === "true" ||
    normalized.includes("technical");
  const issue =
    !technical &&
    (normalized.includes("issue") ||
      normalized.includes("legacy") ||
      normalized.includes("missing") ||
      normalized.includes("invalid") ||
      normalized.includes("failed") ||
      normalized.includes("unsupported") ||
      normalized.includes("too large"));

  return { deleted, issue, status, technical };
}

function monthKey(date: Date | null) {
  if (!date) {
    return "unknown";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const intlLocaleBySupportedLocale: Record<SupportedLocale, string> = {
  en: "en-US",
  es: "es-CL",
  it: "it-IT",
  "zh-CN": "zh-CN",
};

function intlLocale(locale: SupportedLocale) {
  return intlLocaleBySupportedLocale[locale] ?? intlLocaleBySupportedLocale.en;
}

function formatNumber(value: number, locale: SupportedLocale = "en") {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

function monthTitle(
  key: string,
  labels?: Record<string, string>,
  locale: SupportedLocale = "en",
) {
  if (key === "unknown") {
    return translateLabel(labels, "Unknown month");
  }

  const [year, month] = key.split("-").map(Number);

  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function historyMetricChips(row: AdminDataTableRow) {
  const items = rowString(row, "items") || rowString(row, "rows");
  const totalQuantity = rowString(row, "totalQuantity");
  const orderTotal = rowString(row, "orderTotal");
  const paidTotal = rowString(row, "paidTotal");
  const missing = rowString(row, "missing") || rowString(row, "missingRows");
  const chips: Array<{
    icon: HistoryIconName;
    label: string;
    value: string;
  }> = [];

  if (items) {
    chips.push({ icon: "file", label: "Items", value: items });
  }

  if (totalQuantity) {
    chips.push({ icon: "package", label: "Total quantity", value: totalQuantity });
  }

  if (orderTotal) {
    chips.push({ icon: "truck", label: "Order", value: orderTotal });
  }

  if (paidTotal) {
    chips.push({ icon: "check", label: "Paid", value: paidTotal });
  }

  if (missing) {
    chips.push({ icon: "warning", label: "Missing", value: missing });
  }

  return {
    chips,
    diagnostic: "",
  };
}

function metricValue(
  metrics: ReturnType<typeof historyMetricChips>,
  label: string,
) {
  return metrics.chips.find((chip) => chip.label === label)?.value ?? "";
}

function isPositiveMetric(value: string) {
  const normalized = value.replace(/[^\d-]/g, "");

  return normalized !== "" && Number(normalized) > 0;
}

function MobileMetricLine({
  label,
  strong = false,
  tone = "default",
  value,
}: {
  label: string;
  strong?: boolean;
  tone?: "default" | "danger";
  value: string;
}) {
  const isDanger = tone === "danger";

  return (
    <div
      className={[
        "min-w-0 rounded-md px-2.5 py-1.5 text-sm",
        isDanger ? "bg-rose-50 text-rose-700" : "bg-zinc-50 text-zinc-700",
        strong ? "ring-1 ring-zinc-200" : "",
      ].join(" ")}
    >
      <dt
        className={[
          "truncate text-xs leading-4",
          isDanger ? "text-rose-600" : "text-zinc-500",
        ].join(" ")}
      >
        {label}
      </dt>
      <dd
        className={[
          "min-w-0 truncate font-semibold",
          isDanger ? "text-rose-700" : "text-zinc-950",
        ].join(" ")}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function StatusBadge({
  classification,
}: {
  classification: HistoryEntryView["classification"];
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold",
        classification.deleted
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : classification.technical
            ? "border-zinc-200 bg-zinc-50 text-zinc-700"
            : classification.issue
            ? "border-rose-200 bg-rose-50 text-rose-800"
            : "border-emerald-200 bg-emerald-50 text-emerald-800",
      ].join(" ")}
    >
      <HistoryListIcon
        name={
          classification.deleted || classification.issue || classification.technical
            ? "warning"
            : "check"
        }
      />
      {classification.status}
    </span>
  );
}

function HistoryPagination({
  filters,
  labels,
  locale = "en",
  pagination,
  placement,
  requestedShopId,
}: {
  filters: NonNullable<HistoryEntriesClientListProps["selectedFilters"]>;
  labels?: Record<string, string>;
  locale?: SupportedLocale;
  pagination?: HistoryPaginationState;
  placement: "bottom" | "top";
  requestedShopId?: string | null;
}) {
  if (!pagination) {
    return null;
  }

  const hasExactTotal = pagination.totalCountStatus === "exact";
  const previousPage = Math.max(1, pagination.page - 1);
  const nextPage = hasExactTotal
    ? Math.min(pagination.totalPages, pagination.page + 1)
    : pagination.page + 1;
  const baseLinkInput = {
    month: filters.month,
    pageSize: pagination.pageSize,
    query: filters.query,
    requestedShopId,
    status: filters.status,
  };
  const hiddenFields = [
    requestedShopId ? ["shop_id", requestedShopId] : null,
    filters.query ? ["q", filters.query] : null,
    filters.month ? ["month", filters.month] : null,
    filters.status !== "active_issues" ? ["status", filters.status] : null,
    pagination.pageSize !== 10 ? ["pageSize", String(pagination.pageSize)] : null,
  ].filter((field): field is [string, string] => Boolean(field));
  const range =
    pagination.rangeStart > 0 && pagination.rangeEnd > 0
      ? `${formatNumber(pagination.rangeStart, locale)}-${formatNumber(
          pagination.rangeEnd,
          locale,
        )}`
      : "0";
  const totalLabel = hasExactTotal
    ? formatNumber(pagination.totalCount, locale)
    : `${translateLabel(labels, "at least")} ${formatNumber(
        pagination.totalCount,
        locale,
      )}`;

  return (
    <nav
      aria-label={`${translateLabel(labels, "History pagination")} ${placement}`}
      className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-700 shadow-sm lg:flex-row lg:items-center lg:justify-between"
      data-history-pagination={placement}
    >
      <div className="min-w-0">
        <p className="font-medium text-zinc-950">
          {range} {translateLabel(labels, "of")} {totalLabel} ·{" "}
          {translateLabel(labels, "Page")} {pagination.page}
          {hasExactTotal
            ? ` ${translateLabel(labels, "of")} ${pagination.totalPages}`
            : pagination.hasNextPage
              ? ` ${translateLabel(labels, "of")} ${pagination.totalPages}+`
              : ""}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {translateLabel(labels, "Rows on this page")}:{" "}
          {pagination.currentPageRows}
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        {pagination.hasPreviousPage ? (
          <a
            className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 hover:border-emerald-400 hover:text-emerald-800"
            href={buildHistoryHref({
              ...baseLinkInput,
              page: previousPage,
            })}
          >
            {translateLabel(labels, "Previous")}
          </a>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-200 px-3 text-sm font-medium text-zinc-400"
          >
            {translateLabel(labels, "Previous")}
          </span>
        )}
        <form
          action="/shop/history"
          className="flex min-w-0 flex-wrap items-end gap-2"
          method="get"
        >
          {hiddenFields.map(([name, value]) => (
            <input key={name} name={name} type="hidden" value={value} />
          ))}
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-normal text-zinc-500">
            {translateLabel(labels, "Go to page")}
            <input
              className="h-9 w-20 rounded-md border border-zinc-300 bg-white px-2.5 text-sm font-medium text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
              defaultValue={String(pagination.page)}
              inputMode="numeric"
              max={hasExactTotal ? pagination.totalPages : undefined}
              min={1}
              name="page"
              required
              type="number"
            />
          </label>
          <button
            className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 hover:border-emerald-400 hover:text-emerald-800"
            type="submit"
          >
            {translateLabel(labels, "Go")}
          </button>
        </form>
        {pagination.hasNextPage ? (
          <a
            className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 hover:border-emerald-400 hover:text-emerald-800"
            href={buildHistoryHref({
              ...baseLinkInput,
              page: nextPage,
            })}
          >
            {translateLabel(labels, "Next")}
          </a>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-200 px-3 text-sm font-medium text-zinc-400"
          >
            {translateLabel(labels, "Next")}
          </span>
        )}
      </div>
    </nav>
  );
}

export function HistoryEntriesClientList({
  detailLabel,
  labels,
  liveData,
  locale,
  pagination,
  rawRows,
  requestedShopId,
  selectedFilters,
}: HistoryEntriesClientListProps) {
  const filters = selectedFilters ?? {
    month: null,
    query: null,
    status: "active_issues" as const,
  };
  const selectedMonth = filters.month ?? "";
  const selectedQuery = filters.query ?? "";
  const selectedStatus = filters.status;
  const rawRowsByKey = useMemo(
    () => new Map(rawRows.map((row) => [row.rowKey ?? "", row])),
    [rawRows],
  );
  const entries = useMemo(
    () =>
      liveData.rows.map((displayRow) => {
        const rawRow = rawRowsByKey.get(displayRow.rowKey ?? "") ?? displayRow;

        return {
          classification: classifyHistoryRow(displayRow, rawRow, labels),
          date: parseRowDate(displayRow, rawRow),
          displayRow,
          rawRow,
        };
      }),
    [labels, liveData.rows, rawRowsByKey],
  );
  const visibleEntries = entries;
  const groups = useMemo(() => {
    const nextGroups = new Map<string, HistoryEntryView[]>();

    for (const entry of visibleEntries) {
      const key = monthKey(entry.date);
      const group = nextGroups.get(key) ?? [];
      group.push(entry);
      nextGroups.set(key, group);
    }

    return Array.from(nextGroups.entries()).sort(([left], [right]) => {
      if (left === "unknown") {
        return 1;
      }

      if (right === "unknown") {
        return -1;
      }

      return right.localeCompare(left);
    });
  }, [visibleEntries]);
  const statusButtons: Array<{ key: HistoryStatusFilter; label: string }> = [
    { key: "active_issues", label: "Active + issues" },
    { key: "active", label: "Active" },
    { key: "issues", label: "Issues" },
    { key: "technical", label: "Technical" },
    { key: "deleted", label: "Deleted" },
    { key: "all", label: "All" },
  ];
  const currentMonth = monthKey(new Date());

  return (
    <div className="grid gap-4" data-history-entries-list>
      <section className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
        <p className="text-sm text-zinc-700">
          {translateLabel(
            labels,
            "Search, status, month and pagination run server-side before rows are rendered.",
          )}
        </p>
        <form
          action="/shop/history"
          className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_minmax(0,9rem)_auto] xl:items-end"
          method="get"
        >
          {requestedShopId ? (
            <input name="shop_id" type="hidden" value={requestedShopId} />
          ) : null}
          <input name="page" type="hidden" value="1" />
          {selectedStatus !== "active_issues" ? (
            <input name="status" type="hidden" value={selectedStatus} />
          ) : null}
          <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
            <span className="inline-flex items-center gap-1.5">
              <HistoryListIcon name="search" />
              {translateLabel(labels, "Search history")}
            </span>
            <input
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
              defaultValue={selectedQuery}
              name="q"
              placeholder={translateLabel(labels, "Entry name, supplier, category")}
              type="search"
            />
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
            <span className="inline-flex items-center gap-1.5">
              <HistoryListIcon name="calendar" />
              {translateLabel(labels, "Month")}
            </span>
            <input
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
              defaultValue={selectedMonth}
              name="month"
              type="month"
            />
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
            {translateLabel(labels, "Page size")}
            <select
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
              defaultValue={String(pagination?.pageSize ?? 10)}
              name="pageSize"
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
          </label>
          <div className="flex min-w-0 flex-wrap items-end gap-2">
            <button
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-zinc-950 px-3 text-sm font-medium text-white hover:bg-zinc-800"
              type="submit"
            >
              <HistoryListIcon name="search" />
              {translateLabel(labels, "Apply filters")}
            </button>
            <a
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 hover:border-emerald-400 hover:text-emerald-800"
              href={buildHistoryHref({
                requestedShopId,
              })}
            >
              {translateLabel(labels, "Clear")}
            </a>
          </div>
        </form>
        <div className="flex min-w-0 flex-wrap gap-2">
          <a
            aria-current={!selectedMonth ? "true" : undefined}
            className={[
              "inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold",
              !selectedMonth
                ? "border-emerald-700 bg-emerald-50 text-emerald-800"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
            ].join(" ")}
            href={buildHistoryHref({
              pageSize: pagination?.pageSize,
              query: selectedQuery,
              requestedShopId,
              status: selectedStatus,
            })}
          >
            {translateLabel(labels, "All time")}
          </a>
          <a
            aria-current={selectedMonth === currentMonth ? "true" : undefined}
            className={[
              "inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold",
              selectedMonth === currentMonth
                ? "border-emerald-700 bg-emerald-50 text-emerald-800"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
            ].join(" ")}
            href={buildHistoryHref({
              month: currentMonth,
              pageSize: pagination?.pageSize,
              query: selectedQuery,
              requestedShopId,
              status: selectedStatus,
            })}
          >
            {translateLabel(labels, "This month")}
          </a>
          {selectedMonth && selectedMonth !== currentMonth ? (
            <span className="inline-flex h-8 items-center rounded-md border border-emerald-700 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800">
              {translateLabel(labels, "Selected month")}: {selectedMonth}
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          {statusButtons.map((item) => (
            <a
              aria-current={selectedStatus === item.key ? "true" : undefined}
              className={[
                "inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold",
                selectedStatus === item.key
                  ? "border-emerald-700 bg-emerald-50 text-emerald-800"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
              ].join(" ")}
              href={buildHistoryHref({
                month: selectedMonth,
                pageSize: pagination?.pageSize,
                query: selectedQuery,
                requestedShopId,
                status: item.key,
              })}
              key={item.key}
            >
              {translateLabel(labels, item.label)}
            </a>
          ))}
        </div>
      </section>

      <HistoryPagination
        filters={filters}
        labels={labels}
        locale={locale}
        pagination={pagination}
        placement="top"
        requestedShopId={requestedShopId}
      />

      <p className="text-xs font-medium uppercase tracking-normal text-zinc-500">
        {translateLabel(labels, "Rows on this page")}: {visibleEntries.length}
      </p>

      {groups.length > 0 ? (
        <div className="grid gap-5" role="list">
          {groups.map(([key, groupEntries]) => {
            const summary = groupEntries.reduce(
              (counts, entry) => {
                if (entry.classification.deleted) {
                  counts.deleted += 1;
                } else if (entry.classification.technical) {
                  counts.technical += 1;
                } else if (entry.classification.issue) {
                  counts.issues += 1;
                } else {
                  counts.active += 1;
                }

                return counts;
              },
              { active: 0, deleted: 0, issues: 0, technical: 0 },
            );

            return (
              <section className="grid gap-3" key={key}>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
                    <HistoryListIcon name="calendar" />
                    {monthTitle(key, labels, locale)}
                    <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                      {groupEntries.length}
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-500">
                    {translateLabel(labels, "Active")}: {summary.active} ·{" "}
                    {translateLabel(labels, "Issues")}: {summary.issues} ·{" "}
                    {translateLabel(labels, "Technical")}: {summary.technical} ·{" "}
                    {translateLabel(labels, "Deleted")}: {summary.deleted}
                  </p>
                </div>
                <div className="grid gap-3" role="list">
                  {groupEntries.map(({ classification, date, displayRow, rawRow }) => {
                    const entryName =
                      rowString(displayRow, "entryName") ||
                      rowString(displayRow, "event") ||
                      translateLabel(labels, "History entry");
                    const supplierCategory = splitSupplierCategory(
                      rowString(displayRow, "supplierCategory"),
                      labels,
                    );
                    const title = supplierCategory.supplier;
                    const updated =
                      rowString(displayRow, "updated") ||
                      rowString(rawRow, "updated") ||
                      translateLabel(labels, "Not set");
                    const entryDate =
                      rowString(displayRow, "entryDate") ||
                      rowString(rawRow, "entryDate") ||
                      (date ? date.toISOString() : "") ||
                      translateLabel(labels, "Not set");
                    const metrics = historyMetricChips(displayRow);
                    const items = metricValue(metrics, "Items");
                    const totalQuantity = metricValue(metrics, "Total quantity");
                    const orderTotal = metricValue(metrics, "Order");
                    const paidTotal = metricValue(metrics, "Paid");
                    const missing = metricValue(metrics, "Missing");
                    const hasMissingRows = isPositiveMetric(missing);
                    const entryId = displayRow.rowKey ?? "";

                    return (
                      <article
                        className={[
                          "grid min-w-0 gap-2.5 rounded-md border bg-white p-3 shadow-sm [contain-intrinsic-size:140px] [content-visibility:auto]",
                          hasMissingRows ? "border-rose-100" : "border-zinc-200",
                        ].join(" ")}
                        data-history-entry-row
                        key={entryId}
                        role="listitem"
                      >
                        <section className="min-w-0">
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p
                                className="line-clamp-2 break-words text-base font-semibold leading-5 text-zinc-950 [overflow-wrap:anywhere]"
                                title={title}
                              >
                                {title}
                              </p>
                              <p className="mt-0.5 text-sm text-zinc-500">
                                {date ? entryDate : translateLabel(labels, "Not set")}
                              </p>
                            </div>
                            <span className="grid size-8 shrink-0 place-items-center rounded-md border border-sky-200 bg-sky-50 text-sky-800">
                              <HistoryListIcon name="file" />
                            </span>
                          </div>
                          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-zinc-500">
                            <span
                              className="inline-flex min-w-0 items-center gap-1.5"
                              title={supplierCategory.category}
                            >
                              <HistoryListIcon name="folder" />
                              <span className="min-w-0 truncate">
                                {supplierCategory.category}
                              </span>
                            </span>
                            <span
                              className="inline-flex min-w-0 items-center gap-1.5"
                              title={entryName}
                            >
                              <HistoryListIcon name="truck" />
                              <span className="min-w-0 truncate">{entryName}</span>
                            </span>
                          </div>
                        </section>

                        <section className="min-w-0">
                          {metrics.chips.length > 0 ? (
                            <dl className="grid min-w-0 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                              {items ? (
                                <MobileMetricLine
                                  label={`${translateLabel(labels, "Summary")}:`}
                                  value={`${items} ${translateLabel(labels, "Products")}`}
                                />
                              ) : null}
                              {totalQuantity ? (
                                <MobileMetricLine
                                  label={`${translateLabel(labels, "Total quantity")}:`}
                                  value={totalQuantity}
                                />
                              ) : null}
                              {orderTotal ? (
                                <MobileMetricLine
                                  label={`${translateLabel(labels, "Order")}:`}
                                  value={orderTotal}
                                />
                              ) : null}
                              {missing ? (
                                <MobileMetricLine
                                  label={`${translateLabel(labels, "Missing products")}:`}
                                  tone={hasMissingRows ? "danger" : "default"}
                                  value={missing}
                                />
                              ) : null}
                              {paidTotal ? (
                                <MobileMetricLine
                                  label={`${translateLabel(labels, "Paid")}:`}
                                  strong
                                  value={paidTotal}
                                />
                              ) : null}
                            </dl>
                          ) : (
                            <p className="mt-2 text-sm text-zinc-700">
                              {translateLabel(labels, "Summary loads from Detail")}
                            </p>
                          )}
                          {metrics.diagnostic ? (
                            <p
                              className="mt-2 line-clamp-1 text-xs text-zinc-500 [overflow-wrap:anywhere]"
                              title={metrics.diagnostic}
                            >
                              {metrics.diagnostic}
                            </p>
                          ) : null}
                        </section>

                        <section className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-2.5">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <StatusBadge classification={classification} />
                            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                              <HistoryListIcon name="sync" />
                              {translateLabel(labels, "Updated")}: {updated}
                            </span>
                          </div>
                          {entryId ? (
                            <a
                              className="inline-flex h-8 items-center justify-center rounded-md border border-emerald-700 bg-emerald-900 px-2.5 text-sm font-medium text-white hover:bg-emerald-800"
                              data-history-detail-id={entryId}
                              data-history-detail-trigger
                              href={buildHistoryDetailHref(entryId, {
                                month: selectedMonth,
                                page: pagination?.page,
                                pageSize: pagination?.pageSize,
                                query: selectedQuery,
                                requestedShopId,
                                status: selectedStatus,
                              })}
                            >
                              {detailLabel}
                            </a>
                          ) : null}
                        </section>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
          {translateLabel(labels, "No history entries match these filters.")}
        </div>
      )}

      <HistoryPagination
        filters={filters}
        labels={labels}
        locale={locale}
        pagination={pagination}
        placement="bottom"
        requestedShopId={requestedShopId}
      />
    </div>
  );
}
