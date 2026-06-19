import {
  formatTimestampUtc,
  isIsoTimestamp,
} from "@/components/platform/displayFormat";
import { DEFAULT_LOCALE, type SupportedLocale } from "@/i18n/locales";
import type { ReactNode } from "react";

type AdminDataTableColumnIcon = "archive" | "barcode" | "package";
type AdminDataTableCellVariant = "code" | "primary" | "state";

export type AdminDataTableColumn = {
  cellVariant?: AdminDataTableCellVariant;
  icon?: AdminDataTableColumnIcon;
  key: string;
  label: string;
};

export type AdminDataTableRow = Record<string, string> & {
  rowKey?: string;
};

type AdminDataTableProps = {
  caption: string;
  columns: AdminDataTableColumn[];
  rows: AdminDataTableRow[];
  emptyState: {
    title: string;
    description: string;
  };
  footer?: string;
  locale?: SupportedLocale;
  rowActions?: {
    label: string;
    render: (row: AdminDataTableRow) => ReactNode;
  };
};

const nowrapColumns = new Set(["date", "granted", "lastSeen"]);
const archivedStateLabels: Record<SupportedLocale, string> = {
  en: "Archived",
  es: "Archivado",
  it: "Archiviato",
  "zh-CN": "已归档",
};

function TableColumnIcon({
  className = "size-3.5",
  name,
}: {
  className?: string;
  name: AdminDataTableColumnIcon;
}) {
  const commonProps = {
    "aria-hidden": true,
    className: `${className} shrink-0`,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  if (name === "archive") {
    return (
      <svg {...commonProps}>
        <path d="M4 7h16" />
        <path d="M6 7v12h12V7" />
        <path d="M9 11h6" />
        <path d="M8 4h8l1 3H7l1-3Z" />
      </svg>
    );
  }

  if (name === "barcode") {
    return (
      <svg {...commonProps}>
        <path d="M4 5v14" />
        <path d="M7 5v14" />
        <path d="M11 5v14" />
        <path d="M14 5v14" />
        <path d="M17 5v14" />
        <path d="M20 5v14" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="M4.5 7.5 12 12l7.5-4.5" />
      <path d="M12 12v9" />
    </svg>
  );
}

function tableCellClassName(column: AdminDataTableColumn) {
  return [
    "border-b border-slate-100 px-3 py-2.5 align-top text-slate-700 first:pl-0 last:pr-0",
    column.cellVariant === "primary"
      ? "min-w-64 max-w-96 break-words"
      : "max-w-72 break-words",
    nowrapColumns.has(column.key) ? "whitespace-nowrap" : "",
  ].join(" ");
}

function renderCellValue(
  column: AdminDataTableColumn,
  locale: SupportedLocale,
  rawValue: string,
  value: string,
) {
  if (column.cellVariant === "code") {
    return (
      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.78rem] leading-5 text-slate-900 [overflow-wrap:anywhere]">
        {value}
      </code>
    );
  }

  if (column.cellVariant === "primary") {
    return (
      <span className="flex min-w-0 items-start gap-2 font-medium leading-5 text-slate-900">
        {column.icon ? (
          <TableColumnIcon
            className="mt-0.5 size-4 text-emerald-700"
            name={column.icon}
          />
        ) : null}
        <span className="min-w-0 break-words [overflow-wrap:anywhere]">
          {value}
        </span>
      </span>
    );
  }

  if (
    column.cellVariant === "state" &&
    rawValue === archivedStateLabels[locale]
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
        <TableColumnIcon name="archive" />
        {value}
      </span>
    );
  }

  return value;
}

export function AdminDataTable({
  caption,
  columns,
  rows,
  emptyState,
  footer,
  locale = DEFAULT_LOCALE,
  rowActions,
}: AdminDataTableProps) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="min-w-[64rem] border-separate border-spacing-0 text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className="border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-normal text-slate-500 first:pl-0 last:pr-0"
              >
                <span className="inline-flex items-center gap-1.5">
                  {column.icon ? <TableColumnIcon name={column.icon} /> : null}
                  {column.label}
                </span>
              </th>
            ))}
            {rowActions ? (
              <th
                scope="col"
                className="border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-normal text-slate-500 first:pl-0 last:pr-0"
              >
                {rowActions.label}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row, rowIndex) => (
              <tr key={row.rowKey ?? `${rowIndex}-${columns[0]?.key ?? "row"}`}>
                {columns.map((column) => {
                  const rawValue = row[column.key] ?? "";
                  const value = isIsoTimestamp(rawValue)
                    ? formatTimestampUtc(rawValue, locale)
                    : rawValue;

                  return (
                    <td
                      key={column.key}
                      title={rawValue}
                      className={tableCellClassName(column)}
                    >
                      {renderCellValue(column, locale, rawValue, value)}
                    </td>
                  );
                })}
                {rowActions ? (
                  <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5 align-top text-slate-700 first:pl-0 last:pr-0">
                    {rowActions.render(row)}
                  </td>
                ) : null}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={columns.length + (rowActions ? 1 : 0)}
                className="border-b border-slate-100 px-3 py-6 text-sm text-slate-500 first:pl-0 last:pr-0"
              >
                <span className="font-medium text-slate-700">
                  {emptyState.title}
                </span>
                <span className="mt-1 block leading-6">
                  {emptyState.description}
                </span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {footer ? <p className="mt-3 text-xs text-slate-500">{footer}</p> : null}
    </div>
  );
}
