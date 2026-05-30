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
          Static platform placeholder table. Rows are synthetic and not fetched.
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
          {rows.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${columns[0]?.key ?? "row"}`}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className="border-b border-slate-100 px-3 py-3 text-slate-700 first:pl-0 last:pr-0"
                >
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-slate-500">
        Pagination controls are intentionally not implemented in TASK-002.
      </p>
    </div>
  );
}
