import type { TableColumn, TableRow } from "../platformData";

type DataTableProps = {
  columns: TableColumn[];
  rows: TableRow[];
};

export function DataTable({ columns, rows }: DataTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
        <caption className="sr-only">
          Platform Admin read-only table rendered from server-provided rows.
        </caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className="border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 first:pl-0 last:pr-0"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row, rowIndex) => (
              <tr key={`${rowIndex}-${columns[0]?.key ?? "row"}`}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className="break-words border-b border-slate-100 px-3 py-3 text-slate-700 first:pl-0 last:pr-0"
                  >
                    {row[column.key]}
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
                No rows returned through the server boundary.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-slate-500">
        Rows are server-limited for the current read-only boundary.
      </p>
    </div>
  );
}
