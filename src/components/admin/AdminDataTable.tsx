export type AdminDataTableColumn = {
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
};

const nowrapColumns = new Set(["date", "granted", "lastSeen"]);

export function AdminDataTable({
  caption,
  columns,
  rows,
  emptyState,
  footer,
}: AdminDataTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[56rem] border-separate border-spacing-0 text-left text-sm">
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
          {rows.length > 0 ? (
            rows.map((row, rowIndex) => (
              <tr key={row.rowKey ?? `${rowIndex}-${columns[0]?.key ?? "row"}`}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={[
                      "max-w-72 break-words border-b border-slate-100 px-3 py-3 align-top text-slate-700 first:pl-0 last:pr-0",
                      nowrapColumns.has(column.key) ? "whitespace-nowrap" : "",
                    ].join(" ")}
                  >
                    {row[column.key] ?? ""}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={columns.length}
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
