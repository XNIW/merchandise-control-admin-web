"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  formatDisplayValue,
  formatTimestampUtc,
  isIsoTimestamp,
  isLikelyIdentifier,
  shortIdentifier,
} from "./displayFormat";
import { DEFAULT_LOCALE, type SupportedLocale } from "@/i18n/locales";
import type {
  PlatformFilter,
  PlatformServerSearch,
  RowDetailPanel,
  TableColumn,
  TableRow,
} from "./platformData";

type PlatformMasterDetailProps = {
  caption: string;
  columns: TableColumn[];
  rows: TableRow[];
  rowDetails: RowDetailPanel[];
  emptyState: {
    title: string;
    description: string;
  };
  filters?: PlatformFilter[];
  searchPlaceholder?: string;
  serverSearch?: PlatformServerSearch;
  selectedRowKey?: string;
  footer?: string;
  labels?: PlatformMasterDetailLabels;
  locale?: SupportedLocale;
};

export type PlatformMasterDetailLabels = {
  adjustSearchOrFilters: string;
  copied: string;
  copy: string;
  copyShopCode: string;
  doubleClickToOpenFullDetail: string;
  inspector: string;
  noMatchingRows: string;
  openFullDetail: string;
  search: string;
  searchRows: string;
  selectRow: string;
  selectedRow: string;
};

const defaultLabels: PlatformMasterDetailLabels = {
  adjustSearchOrFilters:
    "Adjust search or filters to show rows already returned by the server boundary.",
  copied: "Copied",
  copy: "Copy",
  copyShopCode: "Copy shop code",
  doubleClickToOpenFullDetail: "Double click to open full detail",
  inspector: "Inspector",
  noMatchingRows: "No matching rows",
  openFullDetail: "Open full detail",
  search: "Search",
  searchRows: "Search rows",
  selectRow: "select row",
  selectedRow: "selected row",
};

const noWrapTableColumns = new Set([
  "access",
  "health",
  "origin",
  "state",
  "status",
]);
const noWrapCellColumns = new Set(["access", "health", "origin", "status"]);

function tableColumnClass(columnKey: string) {
  if (columnKey === "email") {
    return "min-w-60";
  }

  if (columnKey === "profile" || columnKey === "shop") {
    return "min-w-44";
  }

  if (columnKey === "origin" || columnKey === "access") {
    return "min-w-28";
  }

  if (columnKey === "shops" || columnKey === "owners") {
    return "min-w-56";
  }

  if (columnKey === "state" || columnKey === "health") {
    return "min-w-40";
  }

  return "min-w-32";
}

function rowKeyFor(row: TableRow, columns: TableColumn[], rowIndex: number) {
  return row.rowKey ?? `${rowIndex}-${columns[0]?.key ?? "row"}`;
}

function rowDomId(rowKey: string) {
  return `platform-row-${rowKey.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase();
}

function rowMatchesSearch(row: TableRow, term: string) {
  if (!term) {
    return true;
  }

  return Object.values(row).some((value) =>
    normalizeSearch(value).includes(term),
  );
}

function rowMatchesFilters(
  row: TableRow,
  filters: PlatformFilter[] | undefined,
  activeFilters: Record<string, string>,
) {
  if (!filters || filters.length === 0) {
    return true;
  }

  return filters.every((filter) => {
    const selectedValue = activeFilters[filter.key];

    if (!selectedValue) {
      return true;
    }

    return normalizeSearch(row[filter.key] ?? "").includes(
      normalizeSearch(selectedValue),
    );
  });
}

function isStatusSegment(value: string) {
  return [
    "Active",
    "Archived",
    "Disabled",
    "Pending Setup",
    "Revoked",
    "Review",
    "Suspended",
    "Unknown",
  ].includes(value);
}

function statusToneClassForSegment(value: string) {
  if (value === "Active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (value === "Disabled" || value === "Revoked") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }

  if (value === "Pending Setup" || value === "Review" || value === "Suspended") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  return "border-slate-200 bg-slate-100 text-slate-700";
}

function displayValueForSegment(
  value: string,
  locale: SupportedLocale = DEFAULT_LOCALE,
) {
  if (isLikelyIdentifier(value)) {
    return {
      fullValue: value,
      text: shortIdentifier(value),
    };
  }

  if (isIsoTimestamp(value)) {
    return {
      fullValue: value,
      text: formatTimestampUtc(value, locale),
    };
  }

  return formatDisplayValue(value, locale);
}

function renderCellValue(
  value: string,
  columnKey: string,
  locale: SupportedLocale = DEFAULT_LOCALE,
) {
  const segments = value.split("\n").filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  return (
    <div className="grid min-w-0 gap-1">
      {segments.map((segment, index) => {
        const { text, fullValue } = displayValueForSegment(segment, locale);
        const isMeta =
          index > 0 ||
          segment.startsWith("ID ") ||
          segment.startsWith("Profile ID ") ||
          segment.startsWith("Code ") ||
          segment.startsWith("Shop code ") ||
          segment.startsWith("+");
        const isCode =
          columnKey === "code" ||
          segment.startsWith("Code ") ||
          segment.startsWith("Shop code ");
        const keepSegmentTogether =
          noWrapTableColumns.has(columnKey) &&
          !isLikelyIdentifier(segment) &&
          segment.length <= 36 &&
          (columnKey !== "state" || index === 0);

        return (
          <span
            key={`${segment}-${index}`}
            title={fullValue}
            className={[
              "min-w-0 leading-5",
              keepSegmentTogether ? "whitespace-nowrap" : "break-words",
              index === 0 ? "font-medium text-slate-900" : "text-slate-600",
              isMeta ? "text-xs" : "",
              isCode ? "font-mono" : "",
              isLikelyIdentifier(segment) ? "font-mono break-all" : "",
              isStatusSegment(segment)
                ? `inline-flex w-fit rounded-md border px-2 py-0.5 text-xs font-semibold ${statusToneClassForSegment(segment)}`
                : "",
            ].join(" ")}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}

function renderDetailGroups(
  detail: RowDetailPanel,
  locale: SupportedLocale = DEFAULT_LOCALE,
) {
  const groups =
    detail.groups ??
    (detail.fields
      ? [
          {
            fields: detail.fields,
            title: "Details",
          },
        ]
      : []);

  return (
    <div className="mt-4 grid gap-4">
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <h4 className="text-sm font-semibold text-slate-900">{group.title}</h4>
          <dl className="mt-2 grid gap-3 text-sm">
            {group.fields.map((field) => (
              <div key={field.label}>
                <dt className="font-semibold text-slate-500">{field.label}</dt>
                {(() => {
                  const { text, fullValue } = displayValueForSegment(
                    field.value,
                    locale,
                  );

                  return (
                    <dd
                      title={fullValue}
                      className={[
                        "mt-0.5 break-words text-slate-800",
                        isLikelyIdentifier(field.value) ? "font-mono break-all" : "",
                      ].join(" ")}
                    >
                      {text}
                    </dd>
                  );
                })()}
              </div>
            ))}
          </dl>
          {group.notes && group.notes.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {group.notes.map((note) => (
                <p
                  key={note}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-5 text-slate-700"
                >
                  {note}
                </p>
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

export function PlatformMasterDetail({
  caption,
  columns,
  rows,
  rowDetails,
  emptyState,
  filters,
  searchPlaceholder,
  selectedRowKey,
  footer,
  labels = defaultLabels,
  locale = DEFAULT_LOCALE,
  serverSearch,
}: PlatformMasterDetailProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState(serverSearch?.value ?? "");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const detailsByRowKey = useMemo(
    () => new Map(rowDetails.map((detail) => [detail.rowKey, detail])),
    [rowDetails],
  );
  const normalizedSearchTerm = normalizeSearch(searchTerm.trim());
  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          rowMatchesSearch(row, normalizedSearchTerm) &&
          rowMatchesFilters(row, filters, activeFilters),
      ),
    [activeFilters, filters, normalizedSearchTerm, rows],
  );
  const selectedKeyFromUrl =
    selectedRowKey && detailsByRowKey.has(selectedRowKey)
      ? selectedRowKey
      : null;
  const firstDetailKey = rowDetails[0]?.rowKey ?? "";
  const [manualSelectedKey, setManualSelectedKey] = useState<string | null>(null);
  const selectedKey = manualSelectedKey ?? selectedKeyFromUrl ?? firstDetailKey;
  const selectedDetail =
    detailsByRowKey.get(selectedKey) ?? rowDetails[0] ?? null;
  function listHrefFor(rowKey: string) {
    const params = new URLSearchParams();

    if (serverSearch?.value) {
      params.set(serverSearch.paramName, serverSearch.value);
    }

    params.set("selected", rowKey);

    return `${pathname}?${params.toString()}`;
  }

  const selectedListHref = selectedDetail
    ? listHrefFor(selectedDetail.rowKey)
    : pathname;
  const selectedDetailHref =
    selectedDetail?.href && selectedDetail
      ? `${selectedDetail.href}?returnTo=${encodeURIComponent(selectedListHref)}`
      : null;

  useEffect(() => {
    if (!selectedKeyFromUrl) {
      return;
    }

    window.requestAnimationFrame(() => {
      document
        .getElementById(rowDomId(selectedKeyFromUrl))
        ?.scrollIntoView({ block: "center", inline: "nearest" });
    });
  }, [selectedKeyFromUrl]);

  function selectRow(rowKey: string) {
    setManualSelectedKey(rowKey);

    const params = new URLSearchParams(window.location.search);
    params.set("selected", rowKey);
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }

  function fullDetailHrefFor(rowKey: string) {
    const detail = detailsByRowKey.get(rowKey);
    const listHref = listHrefFor(rowKey);

    return detail?.href
      ? `${detail.href}?returnTo=${encodeURIComponent(listHref)}`
      : null;
  }

  function openFullDetail(rowKey: string) {
    const href = fullDetailHrefFor(rowKey);

    if (!href) {
      selectRow(rowKey);
      return;
    }

    router.push(href);
  }

  async function copyCode(value: string) {
    if (!navigator.clipboard) {
      setCopiedCode("Clipboard unavailable");
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopiedCode(value);
  }

  if (rows.length === 0 && !serverSearch) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-white p-4">
        <p className="text-sm font-semibold text-slate-800">
          {emptyState.title}
        </p>
        <p className="mt-1 text-sm leading-5 text-slate-600">
          {emptyState.description}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <div className="mb-4 grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 lg:grid-cols-[minmax(18rem,1fr)_auto]">
          {serverSearch ? (
            <form
              action={pathname}
              method="get"
              className="grid min-w-0 gap-2 text-sm font-semibold text-slate-700 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
            >
              <label htmlFor="platform-master-search" className="sr-only">
                {labels.search}
              </label>
              <input
                id="platform-master-search"
                name={serverSearch.paramName}
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={searchPlaceholder ?? labels.searchRows}
                className="min-h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
              />
              <button
                type="submit"
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-950 bg-slate-950 px-3 py-2 text-sm font-semibold text-white outline-none hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
              >
                {serverSearch.submitLabel}
              </button>
              {serverSearch.value ? (
                <Link
                  href={pathname}
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-950"
                >
                  {serverSearch.clearLabel}
                </Link>
              ) : null}
            </form>
          ) : (
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              <span className="sr-only">{labels.search}</span>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={searchPlaceholder ?? labels.searchRows}
                className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
              />
            </label>
          )}
          {filters && filters.length > 0 ? (
            <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:w-[22rem] xl:w-[24rem]">
              {filters.map((filter) => (
                <label
                  key={filter.key}
                  className="grid min-w-0 text-sm font-semibold text-slate-700"
                >
                  <span className="sr-only">{filter.label}</span>
                  <select
                    value={activeFilters[filter.key] ?? ""}
                    onChange={(event) =>
                      setActiveFilters((current) => ({
                        ...current,
                        [filter.key]: event.target.value,
                      }))
                    }
                    className="min-h-10 w-full min-w-36 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                  >
                    {filter.options.map((option) => (
                      <option key={option.label} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className="border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-normal text-slate-500 first:pl-0 last:pr-0"
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length > 0 ? (
                filteredRows.map((row, rowIndex) => {
                  const rowKey = rowKeyFor(row, columns, rowIndex);
                  const hasDetail = detailsByRowKey.has(rowKey);
                  const isSelected = rowKey === selectedDetail?.rowKey;
                  const canOpenFullDetail = Boolean(fullDetailHrefFor(rowKey));

                  return (
                    <tr
                      id={rowDomId(rowKey)}
                      key={rowKey}
                      aria-selected={hasDetail ? isSelected : undefined}
                      aria-label={
                        hasDetail
                          ? `${
                              isSelected
                                ? labels.selectedRow
                                : labels.selectRow
                            } ${
                              row[columns[0]?.key ?? ""] ?? rowKey
                            }. ${labels.doubleClickToOpenFullDetail}.`
                          : undefined
                      }
                      title={
                        canOpenFullDetail
                          ? labels.doubleClickToOpenFullDetail
                          : undefined
                      }
                      className={[
                        "scroll-mt-24 border-l-4 align-top outline-none",
                        hasDetail
                          ? "cursor-pointer transition hover:bg-slate-50 focus-visible:bg-slate-50"
                          : "",
                        isSelected
                          ? "border-l-slate-950 bg-slate-50"
                          : "border-l-transparent",
                      ].join(" ")}
                      onClick={hasDetail ? () => selectRow(rowKey) : undefined}
                      onDoubleClick={
                        canOpenFullDetail
                          ? () => openFullDetail(rowKey)
                          : undefined
                      }
                      onKeyDown={
                        hasDetail
                          ? (event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                openFullDetail(rowKey);
                              }

                              if (event.key === " ") {
                                event.preventDefault();
                                selectRow(rowKey);
                              }
                            }
                          : undefined
                      }
                      role={hasDetail ? "button" : undefined}
                      tabIndex={hasDetail ? 0 : undefined}
                    >
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={[
                            "max-w-80 border-b border-slate-100 px-3 py-3 align-top text-slate-700 first:pl-0 last:pr-0",
                            tableColumnClass(column.key),
                            noWrapCellColumns.has(column.key)
                              ? "whitespace-nowrap"
                              : "break-words",
                            isSelected && column.key === columns[0]?.key
                              ? "font-semibold text-slate-950"
                              : "",
                          ].join(" ")}
                        >
                          <div className="flex min-w-0 items-start gap-2">
                            <div className="min-w-0 flex-1">
                              {renderCellValue(
                                row[column.key] ?? "",
                                column.key,
                                locale,
                              )}
                            </div>
                            {column.key === "code" && row[column.key] ? (
                              <button
                                type="button"
                                onDoubleClick={(event) => {
                                  event.stopPropagation();
                                }}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void copyCode(row[column.key] ?? "");
                                }}
                                onKeyDown={(event) => {
                                  if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                  ) {
                                    event.stopPropagation();
                                  }
                                }}
                                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-950"
                                aria-label={`${labels.copyShopCode} ${row[column.key]}`}
                              >
                                {copiedCode === row[column.key]
                                  ? labels.copied
                                  : labels.copy}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="border-b border-slate-100 px-3 py-6 text-sm text-slate-500 first:pl-0 last:pr-0"
                  >
                    <span className="font-medium text-slate-700">
                      {labels.noMatchingRows}
                    </span>
                    <span className="mt-1 block leading-6">
                      {labels.adjustSearchOrFilters}
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {footer ? <p className="mt-3 text-xs text-slate-500">{footer}</p> : null}
      </div>

      {selectedDetail ? (
        <aside
          id="platform-row-detail"
          className="self-start overflow-hidden rounded-md border border-slate-200 bg-slate-50 2xl:sticky 2xl:top-20 2xl:max-h-[calc(100vh-7rem)] 2xl:overflow-y-auto"
        >
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
              {labels.inspector}
            </p>
            <h3 className="mt-2 text-base font-semibold text-slate-950">
              {selectedDetail.title}
            </h3>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              {selectedDetail.subtitle}
            </p>
          </div>
          <div className="p-4 pt-3">
            {renderDetailGroups(selectedDetail, locale)}
            {selectedDetail.notes && selectedDetail.notes.length > 0 ? (
              <div className="mt-4 grid gap-2">
                {selectedDetail.notes.map((note) => (
                  <p
                    key={note}
                    className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm leading-5 text-emerald-950"
                  >
                    {note}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
          {selectedDetailHref ? (
            <div className="sticky bottom-0 border-t border-slate-200 bg-slate-50 p-4">
              <Link
                href={selectedDetailHref}
                className="inline-flex min-h-9 w-full items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-950"
              >
                {labels.openFullDetail}
              </Link>
            </div>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
