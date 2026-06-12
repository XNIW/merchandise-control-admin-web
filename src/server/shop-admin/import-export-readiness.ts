import "server-only";

export const EXCEL_WORKBOOK_SHEETS = [
  "Products",
  "Suppliers",
  "Categories",
  "PriceHistory",
] as const;

export const MAX_IMPORT_ROWS = 80_000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const FORMULA_INJECTION_PREFIXES = ["=", "+", "-", "@", "\t", "\r"] as const;
// Static audit pattern: ^[=+\-@\t\r]
export const FORMULA_INJECTION_PATTERN_SOURCE = "^[=+\\-@\\t\\r]";
export const FORMULA_INJECTION_PATTERN = new RegExp(
  FORMULA_INJECTION_PATTERN_SOURCE,
);

export type ImportExportReadiness = {
  excelLibraryStatus: "configured";
  previewStatus: "available";
  applyStatus: "available";
  exportStatus: "available";
  workbookSheets: readonly (typeof EXCEL_WORKBOOK_SHEETS)[number][];
  maxImportRows: number;
  maxImportBytes: number;
  reason: string;
};

export function sanitizeSpreadsheetCell(value: string) {
  if (!value) {
    return value;
  }

  return FORMULA_INJECTION_PATTERN.test(value)
    ? `'${value}`
    : value;
}

export function getImportExportReadiness(): ImportExportReadiness {
  return {
    excelLibraryStatus: "configured",
    previewStatus: "available",
    applyStatus: "available",
    exportStatus: "available",
    workbookSheets: EXCEL_WORKBOOK_SHEETS,
    maxImportRows: MAX_IMPORT_ROWS,
    maxImportBytes: MAX_IMPORT_BYTES,
    reason:
      "Excel preview, confirmed apply, export and template generation run server-side through audited catalog boundaries.",
  };
}
