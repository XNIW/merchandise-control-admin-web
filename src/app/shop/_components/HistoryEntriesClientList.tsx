"use client";

import { type ReactNode, useMemo, useState } from "react";
import type { AdminDataTableRow } from "@/components/admin/AdminDataTable";
import type { ShopSection } from "@/components/shop/shopSections";

type HistoryStatusFilter =
  | "active_issues"
  | "active"
  | "all"
  | "deleted"
  | "issues"
  | "technical";
type HistoryPeriodFilter = "all" | "last_3_months" | "month" | "this_month";
type HistoryIconName =
  | "calendar"
  | "check"
  | "clock"
  | "file"
  | "folder"
  | "search"
  | "sync"
  | "truck"
  | "warning";

type HistoryEntriesClientListProps = {
  detailLabel: string;
  labels?: Record<string, string>;
  liveData: NonNullable<ShopSection["liveData"]>;
  rawRows: AdminDataTableRow[];
  requestedShopId?: string | null;
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

function buildHistoryDetailHref(entryId: string, requestedShopId?: string | null) {
  const query = requestedShopId
    ? `?${new URLSearchParams({ shop_id: requestedShopId }).toString()}`
    : "";

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
    rowString(rawRow, "updated") ||
    rowString(displayRow, "updated") ||
    rowString(rawRow, "created") ||
    rowString(displayRow, "created");

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

function monthTitle(key: string, labels?: Record<string, string>) {
  if (key === "unknown") {
    return translateLabel(labels, "Unknown month");
  }

  const [year, month] = key.split("-").map(Number);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function matchesPeriod(
  entry: HistoryEntryView,
  periodFilter: HistoryPeriodFilter,
  selectedMonth: string,
) {
  if (periodFilter === "all") {
    return true;
  }

  if (!entry.date) {
    return false;
  }

  const now = new Date();

  if (periodFilter === "this_month") {
    return (
      entry.date.getFullYear() === now.getFullYear() &&
      entry.date.getMonth() === now.getMonth()
    );
  }

  if (periodFilter === "last_3_months") {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    return entry.date >= cutoff;
  }

  return monthKey(entry.date) === selectedMonth;
}

function matchesStatus(entry: HistoryEntryView, statusFilter: HistoryStatusFilter) {
  if (statusFilter === "all") {
    return true;
  }

  if (statusFilter === "deleted") {
    return entry.classification.deleted;
  }

  if (statusFilter === "issues") {
    return entry.classification.issue && !entry.classification.deleted;
  }

  if (statusFilter === "technical") {
    return entry.classification.technical && !entry.classification.deleted;
  }

  if (statusFilter === "active") {
    return (
      !entry.classification.deleted &&
      !entry.classification.issue &&
      !entry.classification.technical
    );
  }

  return !entry.classification.deleted && !entry.classification.technical;
}

function searchText(row: AdminDataTableRow) {
  return [
    rowString(row, "entryName"),
    rowString(row, "event"),
    rowString(row, "supplierCategory"),
    rowString(row, "type"),
    rowString(row, "status"),
    rowString(row, "updated"),
  ]
    .join(" ")
    .toLowerCase();
}

function compactFacts(row: AdminDataTableRow, labels?: Record<string, string>) {
  const payload = rowString(row, "payload");
  const overlay = rowString(row, "overlay");
  const rows = rowString(row, "rows");
  const missing = rowString(row, "missing") || rowString(row, "missingRows");
  const completed = rowString(row, "completed") || rowString(row, "completeRows");
  const facts = [
    rows ? `${translateLabel(labels, "Rows")}: ${rows}` : null,
    completed ? `${translateLabel(labels, "Completed")}: ${completed}` : null,
    missing ? `${translateLabel(labels, "Missing")}: ${missing}` : null,
    overlay ? `${translateLabel(labels, "Sync")}: ${overlay}` : null,
    !overlay && payload ? `${translateLabel(labels, "Payload")}: ${payload}` : null,
  ].filter((item): item is string => Boolean(item));

  return facts.join(" · ");
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

export function HistoryEntriesClientList({
  detailLabel,
  labels,
  liveData,
  rawRows,
  requestedShopId,
}: HistoryEntriesClientListProps) {
  const [periodFilter, setPeriodFilter] = useState<HistoryPeriodFilter>("all");
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));
  const [statusFilter, setStatusFilter] =
    useState<HistoryStatusFilter>("active_issues");
  const [query, setQuery] = useState("");
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
  const normalizedQuery = query.trim().toLowerCase();
  const visibleEntries = entries.filter(
    (entry) =>
      matchesPeriod(entry, periodFilter, selectedMonth) &&
      matchesStatus(entry, statusFilter) &&
      (!normalizedQuery ||
        searchText(entry.displayRow).includes(normalizedQuery) ||
        searchText(entry.rawRow).includes(normalizedQuery)),
  );
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
  const periodButtons: Array<{ key: HistoryPeriodFilter; label: string }> = [
    { key: "all", label: "All time" },
    { key: "this_month", label: "This month" },
    { key: "last_3_months", label: "Last 3 months" },
  ];
  const statusButtons: Array<{ key: HistoryStatusFilter; label: string }> = [
    { key: "active_issues", label: "Active + issues" },
    { key: "active", label: "Active" },
    { key: "issues", label: "Issues" },
    { key: "technical", label: "Technical" },
    { key: "deleted", label: "Deleted" },
    { key: "all", label: "All" },
  ];

  if (liveData.rows.length === 0) {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
        <p className="font-medium text-zinc-900">{liveData.emptyState.title}</p>
        <p className="mt-1 leading-6">{liveData.emptyState.description}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4" data-history-entries-list>
      <section className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
        <p className="text-sm text-zinc-700">
          {translateLabel(
            labels,
            "Client-side filters apply only to visible rows. Rows and diagnostics load when opening Detail.",
          )}
        </p>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
            <span className="inline-flex items-center gap-1.5">
              <HistoryListIcon name="search" />
              {translateLabel(labels, "Search history")}
            </span>
            <input
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={translateLabel(labels, "Entry name, supplier, category")}
              type="search"
              value={query}
            />
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
            <span className="inline-flex items-center gap-1.5">
              <HistoryListIcon name="calendar" />
              {translateLabel(labels, "Month")}
            </span>
            <input
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
              onChange={(event) => {
                setSelectedMonth(event.target.value || monthKey(new Date()));
                setPeriodFilter("month");
              }}
              type="month"
              value={selectedMonth}
            />
          </label>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          {periodButtons.map((item) => (
            <button
              aria-pressed={periodFilter === item.key}
              className={[
                "inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold",
                periodFilter === item.key
                  ? "border-emerald-700 bg-emerald-50 text-emerald-800"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
              ].join(" ")}
              key={item.key}
              onClick={() => setPeriodFilter(item.key)}
              type="button"
            >
              {translateLabel(labels, item.label)}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          {statusButtons.map((item) => (
            <button
              aria-pressed={statusFilter === item.key}
              className={[
                "inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold",
                statusFilter === item.key
                  ? "border-emerald-700 bg-emerald-50 text-emerald-800"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
              ].join(" ")}
              key={item.key}
              onClick={() => setStatusFilter(item.key)}
              type="button"
            >
              {translateLabel(labels, item.label)}
            </button>
          ))}
        </div>
      </section>

      <p className="text-xs font-medium uppercase tracking-normal text-zinc-500">
        {translateLabel(labels, "Visible entries")}: {visibleEntries.length}
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
                    {monthTitle(key, labels)}
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
                    const updated =
                      rowString(displayRow, "updated") ||
                      rowString(rawRow, "updated") ||
                      translateLabel(labels, "Not set");
                    const facts = compactFacts(displayRow, labels);
                    const entryId = displayRow.rowKey ?? "";

                    return (
                      <article
                        className="grid min-w-0 gap-3 rounded-md border border-zinc-200 bg-white p-3 shadow-sm [contain-intrinsic-size:150px] [content-visibility:auto] xl:grid-cols-[minmax(16rem,1.5fr)_minmax(13rem,1fr)_minmax(14rem,1fr)_auto] xl:items-center"
                        data-history-entry-row
                        key={entryId}
                        role="listitem"
                      >
                        <section className="min-w-0">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="grid size-9 shrink-0 place-items-center rounded-md border border-sky-200 bg-sky-50 text-sky-800">
                              <HistoryListIcon name="file" />
                            </span>
                            <div className="min-w-0">
                              <p
                                className="line-clamp-2 break-words text-base font-semibold leading-6 text-zinc-950 [overflow-wrap:anywhere]"
                                title={entryName}
                              >
                                {entryName}
                              </p>
                              <p className="mt-1 text-xs font-medium uppercase tracking-normal text-zinc-500">
                                {rowString(displayRow, "type") ||
                                  translateLabel(labels, "Mobile history entry")}
                              </p>
                            </div>
                          </div>
                        </section>

                        <section className="min-w-0">
                          <dl className="grid gap-2 text-sm">
                            <div className="min-w-0">
                              <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-normal text-zinc-500">
                                <HistoryListIcon name="truck" />
                                {translateLabel(labels, "Supplier")}
                              </dt>
                              <dd
                                className="mt-1 line-clamp-1 break-words font-medium text-zinc-950 [overflow-wrap:anywhere]"
                                title={supplierCategory.supplier}
                              >
                                {supplierCategory.supplier}
                              </dd>
                            </div>
                            <div className="min-w-0">
                              <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-normal text-zinc-500">
                                <HistoryListIcon name="folder" />
                                {translateLabel(labels, "Category")}
                              </dt>
                              <dd
                                className="mt-1 line-clamp-1 break-words text-zinc-600 [overflow-wrap:anywhere]"
                                title={supplierCategory.category}
                              >
                                {supplierCategory.category}
                              </dd>
                            </div>
                          </dl>
                        </section>

                        <section className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <StatusBadge classification={classification} />
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-600">
                              <HistoryListIcon name="clock" />
                              {date ? updated : translateLabel(labels, "Not set")}
                            </span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm text-zinc-700 [overflow-wrap:anywhere]">
                            {facts || translateLabel(labels, "Summary loads from Detail")}
                          </p>
                        </section>

                        <section className="min-w-0">
                          {entryId ? (
                            <a
                              className="inline-flex h-9 items-center justify-center rounded-md border border-emerald-700 bg-emerald-900 px-3 text-sm font-medium text-white hover:bg-emerald-800"
                              data-history-detail-id={entryId}
                              data-history-detail-trigger
                              href={buildHistoryDetailHref(entryId, requestedShopId)}
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
    </div>
  );
}
