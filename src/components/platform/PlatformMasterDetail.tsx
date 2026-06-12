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
import type {
  PlatformFilter,
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
  selectedRowKey?: string;
  footer?: string;
};

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

function displayValueForSegment(value: string) {
  if (isLikelyIdentifier(value)) {
    return {
      fullValue: value,
      text: shortIdentifier(value),
    };
  }

  if (isIsoTimestamp(value)) {
    return {
      fullValue: value,
      text: formatTimestampUtc(value),
    };
  }

  return formatDisplayValue(value);
}

function renderCellValue(value: string, columnKey: string) {
  const segments = value.split("\n").filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  return (
    <div className="grid min-w-0 gap-1">
      {segments.map((segment, index) => {
        const { text, fullValue } = displayValueForSegment(segment);
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

        return (
          <span
            key={`${segment}-${index}`}
            title={fullValue}
            className={[
              "min-w-0 break-words leading-5",
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

function renderDetailGroups(detail: RowDetailPanel) {
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
                  const { text, fullValue } = displayValueForSegment(field.value);

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
}: PlatformMasterDetailProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
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
  const selectedListHref = selectedDetail
    ? `${pathname}?selected=${encodeURIComponent(selectedDetail.rowKey)}`
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
    const listHref = `${pathname}?selected=${encodeURIComponent(rowKey)}`;

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

  if (rows.length === 0) {
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
        <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_auto]">
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Search
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={searchPlaceholder ?? "Search rows"}
              className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
            />
          </label>
          {filters && filters.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
              {filters.map((filter) => (
                <label
                  key={filter.key}
                  className="grid gap-1 text-sm font-semibold text-slate-700"
                >
                  {filter.label}
                  <select
                    value={activeFilters[filter.key] ?? ""}
                    onChange={(event) =>
                      setActiveFilters((current) => ({
                        ...current,
                        [filter.key]: event.target.value,
                      }))
                    }
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
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
                      ? `${isSelected ? "selected row" : "select row"} ${
                          row[columns[0]?.key ?? ""] ?? rowKey
                        }. Double click to open full detail.`
                      : undefined
                  }
                  title={
                    canOpenFullDetail
                      ? "Double click to open full detail"
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
                    canOpenFullDetail ? () => openFullDetail(rowKey) : undefined
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
                        "max-w-80 break-words border-b border-slate-100 px-3 py-3 text-slate-700 first:pl-0 last:pr-0",
                        isSelected && column.key === columns[0]?.key
                          ? "font-semibold text-slate-950"
                          : "",
                      ].join(" ")}
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <div className="min-w-0 flex-1">
                          {renderCellValue(row[column.key] ?? "", column.key)}
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
                              if (event.key === "Enter" || event.key === " ") {
                                event.stopPropagation();
                              }
                            }}
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-950"
                            aria-label={`Copy shop code ${row[column.key]}`}
                          >
                            {copiedCode === row[column.key] ? "Copied" : "Copy"}
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
                    No matching rows
                  </span>
                  <span className="mt-1 block leading-6">
                    Adjust search or filters to show rows already returned by the
                    server boundary.
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
              Inspector
            </p>
            <h3 className="mt-2 text-base font-semibold text-slate-950">
              {selectedDetail.title}
            </h3>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              {selectedDetail.subtitle}
            </p>
          </div>
          <div className="p-4 pt-3">
            {renderDetailGroups(selectedDetail)}
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
                Open full detail
              </Link>
            </div>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
