import "server-only";

import { createHash } from "node:crypto";
import { DOMParser, type Element as XmlElement } from "@xmldom/xmldom";
import * as SheetJS from "@e965/xlsx";
import readXlsxFile, { type SheetData } from "read-excel-file/node";
import * as unzipper from "unzipper";
import writeXlsxFile, {
  type SheetData as WritableSheetData,
} from "write-excel-file/node";
import { parseLocalizedNumberText } from "@/lib/localized-number";
import type { Json } from "@/lib/supabase/database.types";
import {
  createCategory,
  createProduct,
  createSupplier,
  updateCategory,
  updateProduct,
  updateSupplier,
  type ProductMutationInput,
} from "./catalog-mutations";
import {
  mapShopAdminRpcResult,
  resolveShopActionContext,
  shopAdminActionResult,
  type ShopAdminActionResult,
} from "./action-context";
import {
  EXCEL_WORKBOOK_SHEETS,
  FORMULA_INJECTION_PATTERN,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  sanitizeSpreadsheetCell,
} from "./import-export-readiness";
import {
  CATALOG_IMPORT_FIELDS,
  detectCatalogImportHeaderRow,
  mergeProductImportForApply,
  normalizeCatalogImportHeader,
  validateCatalogImportRows,
  type CatalogImportColumnSource,
  type CatalogImportExistingRows,
  type CatalogImportField,
  type CatalogImportProductRow,
} from "./catalog-import-contract";
import {
  getShopInventoryReadModel,
  type ShopInventoryCategory,
  type ShopInventoryPrice,
  type ShopInventoryProduct,
  type ShopInventorySupplier,
} from "./inventory-read-model";
import {
  applyStaffAwareBulkPriceHistoryImport,
  applyStaffAwareBulkProductImport,
  write_staff_shop_admin_audit,
  type StaffAwareBulkPriceHistoryImportPayload,
  type StaffAwareBulkProductImportPayload,
} from "./staff-aware-mutations";
import { upsertSupplierImportHistoryEntry } from "./history-mutations";
import type { SupplierImportHistoryGridRow } from "./supplier-import-history-entry-contract";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLS_CONTENT_TYPE = "application/vnd.ms-excel";
const WORKBOOK_MIME_TYPES = new Set([
  "",
  XLSX_CONTENT_TYPE,
  XLS_CONTENT_TYPE,
  "application/octet-stream",
  "application/excel",
  "application/msexcel",
  "application/x-excel",
  "application/x-msexcel",
  "application/x-ms-excel",
  "application/vnd.ms-office",
  "text/html",
  "application/xhtml+xml",
]);
const BULK_PRODUCT_IMPORT_THRESHOLD = 500;
const BULK_PRODUCT_IMPORT_CHUNK_SIZE = 500;
const BULK_PRICE_HISTORY_IMPORT_CHUNK_SIZE = 1_000;
const MAX_PREVIEW_ROWS = 500;
const MAX_RAW_PREVIEW_ROWS = 14;
const MAX_RAW_PREVIEW_CELLS = 24;
const MAX_RAW_PREVIEW_CELL_LENGTH = 80;
const MAX_PRODUCT_SAMPLE_ROWS = 5;
const MAX_ROW_ADJUSTMENTS = MAX_PREVIEW_ROWS;
const MAX_ROW_ADJUSTMENTS_JSON_BYTES = 64_000;
const MAX_MAPPING_OVERRIDE_JSON_BYTES = 8_000;
const MAX_PRODUCT_BARCODE_LENGTH = 96;
const SAFETY_FORMULA_ESCAPE_CODE = "safety_formula_escape";
const SUPPLIER_ALWAYS_EXCLUDED_MAPPING_FIELDS = new Set<CatalogImportField>([
  "retailPrice",
]);
const SUPPLIER_DEFAULT_EXCLUDED_MAPPING_FIELDS = new Set<CatalogImportField>([
  "discount",
  "discountedPrice",
  "lineTotal",
]);
const NUMERIC_COMPATIBLE_MAPPING_FIELDS = new Set<CatalogImportField>([
  "discount",
  "discountedPrice",
  "lineTotal",
  "purchasePrice",
  "stockQuantity",
]);

type CatalogWorkbookImportMode = "supplier" | "database";
type CatalogWorkbookDetectedFormatKind =
  | "android_database_export"
  | "generic_product_import";
type CatalogWorkbookSheetRole =
  | "categories"
  | "priceHistory"
  | "products"
  | "suppliers"
  | "unsupported";
type AndroidDatabaseExpectedSheet =
  | "Categories"
  | "PriceHistory"
  | "Products"
  | "Suppliers";

type CatalogWorkbookInput = {
  bytes: Buffer;
  fileName: string;
  importMode?: CatalogWorkbookImportMode;
  mappingOverride?: string;
  mimeType: string;
  requestedShopId?: string;
};

type WorkbookRowError = {
  code?: string;
  field: string;
  message: string;
  row: number;
  sheet: string;
};
type ReadyShopActionContext = Extract<
  Awaited<ReturnType<typeof resolveShopActionContext>>,
  { status: "ready" }
>;
type CatalogExportPriceRow = {
  created_at: string;
  effective_at: string;
  id: string;
  note: string | null;
  price: number;
  product_id: string;
  shop_id: string | null;
  source: string | null;
  type: string;
};
type CatalogExportPagedQuery<Row> = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: Row[] | null;
    error: unknown | null;
  }>;
};
type ParsedSupplierRow = {
  name: string;
  rowNumber: number;
  supplierId?: string;
};

type ParsedCategoryRow = {
  categoryId?: string;
  name: string;
  rowNumber: number;
};

type ParsedProductRow = ProductMutationInput & CatalogImportProductRow & {
  categoryName?: string;
  productId?: string;
  rowNumber: number;
  supplierName?: string;
};

type ParsedPriceHistoryRow = {
  createdAt?: string;
  effectiveAt: string;
  note?: string;
  price: number;
  priceId?: string;
  productBarcode?: string;
  productId?: string;
  productItemNumber?: string;
  rowNumber: number;
  source?: string;
  type: "PURCHASE" | "RETAIL";
};

type CatalogWorkbookDetectedFormat = {
  confidence: "high" | "low" | "medium";
  ignoredSheets: string[];
  isPartial: boolean;
  kind: CatalogWorkbookDetectedFormatKind;
  label: string;
  missingSheets: AndroidDatabaseExpectedSheet[];
  presentSheets: AndroidDatabaseExpectedSheet[];
};

type ParsedWorkbook = {
  categories: ParsedCategoryRow[];
  confidence: number;
  detectedHeaderRow: number | null;
  detectedFormat: CatalogWorkbookDetectedFormat;
  detectedMapping: Partial<
    Record<
      CatalogImportField,
      {
        columnIndex: number;
        columnLabel: string;
        confidence: "high" | "medium";
      }
    >
  >;
  digest: string;
  droppedRows: number;
  fileDigest: string;
  importMode: CatalogWorkbookImportMode;
  mappingOverride: CatalogWorkbookMappingOverride;
  originalColumns: string[];
  priceHistory: ParsedPriceHistoryRow[];
  rawPreviewColumns: CatalogWorkbookRawPreviewColumn[];
  rawPreviewRows: CatalogWorkbookRawPreviewRow[];
  rawWorkbookContextRows: CatalogWorkbookRawPreviewRow[];
  previewRows: CatalogWorkbookPreviewRow[];
  previewRowsTruncated: boolean;
  products: ParsedProductRow[];
  recognizedColumnSources: Partial<Record<CatalogImportField, CatalogImportColumnSource>>;
  rowErrors: WorkbookRowError[];
  rowWarnings: WorkbookRowError[];
  selectedProductSheet: string;
  sheetSummaries: CatalogWorkbookSheetSummary[];
  suppliers: ParsedSupplierRow[];
  unmappedColumns: string[];
  validRows: number;
  workbookMetadata: CatalogWorkbookMetadata;
};

type CatalogWorkbookMappingOverride = Partial<
  Record<CatalogImportField, number | null>
>;

export type CatalogWorkbookMetadata = {
  fileName: string;
  headerRow: number | null;
  mimeType: string;
  parsedRows: number;
  previewRowsLimit: number;
  previewRowsTruncated: boolean;
  selectedSheet: string;
  sheetNames: string[];
  sizeBytes: number;
  totalRows: number;
};

export type CatalogWorkbookPreviewRow = {
  barcode: string;
  categoryName?: string;
  currentPurchasePrice?: number;
  currentRetailPrice?: number;
  currentStockQuantity?: number;
  itemNumber?: string;
  productName: string;
  recognizedDiscount?: number;
  recognizedDiscountedPrice?: number;
  recognizedLineTotal?: number;
  recognizedPurchasePrice?: number;
  recognizedQuantity?: number;
  recognizedRetailPrice?: number;
  retailPrice?: number;
  rowFingerprint: string;
  rowNumber: number;
  secondProductName?: string;
  status: "Ready" | "Warning" | "Blocked" | "Duplicate" | "Update" | "New";
  stockQuantity?: number;
  supplierName?: string;
  warnings: number;
};

export type CatalogWorkbookRawPreviewColumn = {
  columnIndex: number;
  label: string;
};

export type CatalogWorkbookRawPreviewRow = {
  cells: string[];
  isDataPreview: boolean;
  isHeader: boolean;
  rowNumber: number;
};

export type CatalogWorkbookSheetSummary = {
  blockedRows: number;
  columns: string[];
  expectedSheet: AndroidDatabaseExpectedSheet | null;
  importable: boolean;
  notes: string[];
  parsedRows: number;
  role: CatalogWorkbookSheetRole;
  sampleRows: string[][];
  sampleRowsTruncated: boolean;
  sheetName: string;
  status: "ignored" | "missing" | "present";
  totalRows: number;
  validRows: number;
  warningRows: number;
};

export type CatalogWorkbookRowAdjustment = {
  categoryName?: string;
  retailPrice?: number | null;
  rowFingerprint: string;
  rowNumber: number;
  stockQuantity?: number | null;
  supplierName?: string;
};

export type CatalogWorkbookPreview = ShopAdminActionResult & {
  confidence?: number;
  detectedFormat?: CatalogWorkbookDetectedFormat;
  detectedHeaderRow?: number | null;
  detectedMapping?: ParsedWorkbook["detectedMapping"];
  originalColumns?: string[];
  previewDigest?: string;
  previewRows?: CatalogWorkbookPreviewRow[];
  previewRowsTruncated?: boolean;
  rawPreviewColumns?: CatalogWorkbookRawPreviewColumn[];
  rawPreviewRows?: CatalogWorkbookRawPreviewRow[];
  rawWorkbookContextRows?: CatalogWorkbookRawPreviewRow[];
  recognizedColumnSources?: ParsedWorkbook["recognizedColumnSources"];
  rowErrors?: WorkbookRowError[];
  rowWarnings?: WorkbookRowError[];
  safetyNotes?: WorkbookRowError[];
  selectedProductSheet?: string;
  sheetSummaries?: CatalogWorkbookSheetSummary[];
  summary?: {
    blockedRows?: number;
    categories: number;
    duplicates?: number;
    droppedRows?: number;
    errors: number;
    newCategories?: number;
    newProducts: number;
    newSuppliers?: number;
    operationalWarnings?: number;
    priceHistory: number;
    priceHistoryPurchase?: number;
    priceHistoryRetail?: number;
    products: number;
    safetySanitizations?: number;
    suppliers: number;
    updatedCategories?: number;
    updatedProducts: number;
    updatedSuppliers?: number;
    validRows?: number;
    warnings: number;
  };
  unmappedColumns?: string[];
  workbookMetadata?: CatalogWorkbookMetadata;
};

export type CatalogWorkbookApplyResult = ShopAdminActionResult & {
  historyEntry?: {
    action: "created" | "updated";
    displayName: string;
    href: string;
    remoteId: string;
    rowCount: number;
  };
  previewDigest?: string;
  rowErrors?: WorkbookRowError[];
  summary?: {
    categoriesApplied: number;
    failedRows: number;
    priceHistoryApplied: number;
    productsApplied: number;
    suppliersApplied: number;
  };
};

export type CatalogWorkbookExport = ShopAdminActionResult & {
  buffer?: Buffer;
  contentType?: string;
  fileName?: string;
};

function previewDigest(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeImportMode(mode: CatalogWorkbookInput["importMode"]) {
  return mode === "database" ? "database" : "supplier";
}

const ANDROID_DATABASE_EXPECTED_SHEETS = [
  "Products",
  "Suppliers",
  "Categories",
  "PriceHistory",
] as const satisfies readonly AndroidDatabaseExpectedSheet[];

const ANDROID_PRODUCT_HEADER_SETS = [
  [
    "Barcode",
    "Item code",
    "Product name",
    "Second Product Name",
    "Purchase price",
    "Retail price",
    "Purchase (Old)",
    "Retail (Old)",
    "Supplier",
    "Category",
    "Stock Quantity",
  ],
  [
    "Código de barras",
    "Código del artículo",
    "Nombre del producto",
    "Segundo nombre del producto",
    "Precio de compra",
    "Precio de venta",
    "Compra (Antiguo)",
    "Venta (Antiguo)",
    "Proveedor",
    "Categoría",
    "Existencias",
  ],
  [
    "Codice a barre",
    "Codice articolo",
    "Nome prodotto",
    "Secondo nome prodotto",
    "Prezzo acquisto",
    "Prezzo vendita",
    "Acquisto (Vecchio)",
    "Vendita (Vecchio)",
    "Fornitore",
    "Categoria",
    "Giacenza",
  ],
  [
    "条码",
    "货号",
    "品名",
    "品名2",
    "进价",
    "零售价",
    "进价（旧）",
    "售价（旧）",
    "供应商",
    "类别",
    "库存数量",
  ],
] as const satisfies readonly (readonly string[])[];

const ANDROID_ENTITY_HEADERS = ["id", "name"] as const;
const ANDROID_PRICE_HISTORY_HEADERS = [
  "productBarcode",
  "timestamp",
  "type",
  "oldPrice",
  "newPrice",
  "source",
] as const;

function jsonDigest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function catalogImportRowFingerprint(row: ParsedProductRow) {
  return jsonDigest({
    barcode: row.barcode,
    itemNumber: row.itemNumber ?? "",
    productName: row.productName,
    retailPrice: row.retailPrice ?? null,
    rowNumber: row.rowNumber,
    stockQuantity: row.stockQuantity ?? null,
  });
}

function buildPreviewDigest(input: {
  detectedHeaderRow: number | null;
  detectedMapping: ParsedWorkbook["detectedMapping"];
  fileDigest: string;
  importMode: CatalogWorkbookImportMode;
  mappingConfirmed: true;
  mappingOverride: CatalogWorkbookMappingOverride;
  rowFingerprints: string[];
  selectedProductSheet: string;
}) {
  return jsonDigest(input);
}

function bindPreviewDigestToShop(input: {
  mappingId: string | null;
  parsedDigest: string;
  shopId: string;
}) {
  return jsonDigest(input);
}

function validateWorkbookFile(input: CatalogWorkbookInput) {
  const lowerName = input.fileName.toLowerCase();
  const extensionOk = lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls");
  const mimeOk = WORKBOOK_MIME_TYPES.has(input.mimeType.toLowerCase());

  if (input.bytes.byteLength > MAX_IMPORT_BYTES) {
    return shopAdminActionResult("file_too_large", { ok: false });
  }

  if (!extensionOk || !mimeOk) {
    return shopAdminActionResult("invalid_file_type", { ok: false });
  }

  return null;
}

function isLegacyWorkbookName(fileName: string) {
  return fileName.toLowerCase().endsWith(".xls");
}

function normalizeLabel(value: unknown) {
  return sanitizeSpreadsheetCell(String(value ?? "").replace(/\s+/g, " ").trim());
}

function normalizeWorkbookText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function needsSpreadsheetSafetyEscape(value: string) {
  return FORMULA_INJECTION_PATTERN.test(value);
}

function normalizedHeaderSet(values: readonly string[]) {
  return new Set(values.map((value) => normalizeCatalogImportHeader(value)));
}

function rowHeaderSet(rows: SheetData) {
  return normalizedHeaderSet((rows[0] ?? []).map((cell) => normalizeLabel(cell)));
}

function hasExpectedHeaders(
  rows: SheetData,
  expectedHeaders: readonly string[],
  mode: "all" | "any" = "all",
) {
  const headers = rowHeaderSet(rows);
  const expected = expectedHeaders.map((header) =>
    normalizeCatalogImportHeader(header),
  );

  return mode === "all"
    ? expected.every((header) => headers.has(header))
    : expected.some((header) => headers.has(header));
}

function hasAndroidProductHeaders(rows: SheetData) {
  const headers = rowHeaderSet(rows);

  return ANDROID_PRODUCT_HEADER_SETS.some((headerSet) =>
    headerSet
      .map((header) => normalizeCatalogImportHeader(header))
      .every((header) => headers.has(header)),
  );
}

function normalizedSheetName(value: string) {
  return normalizeCatalogImportHeader(value);
}

function findSheetByExpectedName(
  sheets: readonly { data: SheetData; sheet: string }[],
  expectedSheet: AndroidDatabaseExpectedSheet,
) {
  const expected = normalizedSheetName(expectedSheet);

  return sheets.find((entry) => normalizedSheetName(entry.sheet) === expected);
}

function androidSheetHasSignature(
  sheet: { data: SheetData; sheet: string },
  expectedSheet: AndroidDatabaseExpectedSheet,
) {
  if (expectedSheet === "Products") {
    return hasAndroidProductHeaders(sheet.data);
  }

  if (expectedSheet === "Suppliers" || expectedSheet === "Categories") {
    return hasExpectedHeaders(sheet.data, ANDROID_ENTITY_HEADERS);
  }

  return hasExpectedHeaders(sheet.data, ANDROID_PRICE_HISTORY_HEADERS);
}

function detectCatalogWorkbookFormat(
  sheets: readonly { data: SheetData; sheet: string }[],
  importMode: CatalogWorkbookImportMode,
): CatalogWorkbookDetectedFormat {
  if (importMode !== "database") {
    return {
      confidence: "medium",
      ignoredSheets: [],
      isPartial: false,
      kind: "generic_product_import",
      label: "Product import workbook",
      missingSheets: [],
      presentSheets: [],
    };
  }

  const presentSheets = ANDROID_DATABASE_EXPECTED_SHEETS.filter((sheet) =>
    findSheetByExpectedName(sheets, sheet),
  );
  const missingSheets = ANDROID_DATABASE_EXPECTED_SHEETS.filter(
    (sheet) => !presentSheets.includes(sheet),
  );
  const ignoredSheets = sheets
    .map((entry) => entry.sheet)
    .filter((sheetName) =>
      !ANDROID_DATABASE_EXPECTED_SHEETS.some(
        (expected) =>
          normalizedSheetName(expected) === normalizedSheetName(sheetName),
      ),
    );
  const matchingSignatures = presentSheets.filter((expected) => {
    const sheet = findSheetByExpectedName(sheets, expected);

    return sheet ? androidSheetHasSignature(sheet, expected) : false;
  });
  const kind = presentSheets.length > 0
    ? "android_database_export"
    : "generic_product_import";
  const confidence =
    matchingSignatures.length === presentSheets.length && presentSheets.length > 0
      ? "high"
      : presentSheets.length > 0
        ? "medium"
        : "low";

  return {
    confidence,
    ignoredSheets,
    isPartial:
      presentSheets.length > 0 &&
      presentSheets.length < ANDROID_DATABASE_EXPECTED_SHEETS.length,
    kind,
    label:
      kind === "android_database_export"
        ? "Android database export"
        : "Generic product import workbook",
    missingSheets,
    presentSheets,
  };
}

function productCellValue(
  headers: ReadonlyMap<CatalogImportField, number>,
  row: readonly unknown[],
  field: CatalogImportField,
) {
  const index = headers.get(field);

  return index === undefined ? undefined : row[index];
}

function productTextValue(
  headers: ReadonlyMap<CatalogImportField, number>,
  row: readonly unknown[],
  field: CatalogImportField,
) {
  const value = productCellValue(headers, row, field);

  return normalizeWorkbookText(value);
}

function productNumberValue(
  headers: ReadonlyMap<CatalogImportField, number>,
  row: readonly unknown[],
  sourceField: CatalogImportField,
  sheet: string,
  rowNumber: number,
  field: string,
  rowErrors: WorkbookRowError[],
) {
  const value = productCellValue(headers, row, sourceField);
  const normalized = normalizeWorkbookText(value);

  if (!normalized) {
    return undefined;
  }

  const numeric = parseWorkbookNumber(normalized);

  if (!Number.isFinite(numeric) || numeric < 0) {
    rowErrors.push({
      field,
      message: "Value must be a non-negative number.",
      row: rowNumber,
      sheet,
    });

    return undefined;
  }

  return numeric;
}

function productReferenceNumberValue(
  headers: ReadonlyMap<CatalogImportField, number>,
  row: readonly unknown[],
  sourceField: CatalogImportField,
) {
  const value = productCellValue(headers, row, sourceField);
  const normalized = normalizeWorkbookText(value);

  if (!normalized) {
    return undefined;
  }

  const numeric = parseWorkbookNumber(normalized);

  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}

function parseWorkbookNumber(value: string) {
  return parseLocalizedNumberText(value);
}

function getSheetRows(
  sheets: readonly { data: SheetData; sheet: string }[],
  sheet: string,
  options: { fallbackToFirstSheet?: boolean } = {},
) {
  const exact = sheets.find((entry) => entry.sheet === sheet)?.data;

  if (exact) {
    return exact;
  }

  return options.fallbackToFirstSheet ? (sheets[0]?.data ?? []) : [];
}

function headerMap(rows: SheetData) {
  const [headerRow] = rows;
  const headers = new Map<string, number>();

  for (const [index, cell] of (headerRow ?? []).entries()) {
    const key = normalizeCatalogImportHeader(cell);

    if (key) {
      headers.set(key, index);
    }
  }

  return headers;
}

function nonEmptyRows(rows: SheetData, startRowIndex = 1) {
  return rows
    .slice(startRowIndex)
    .map((row, index) => ({ row, rowNumber: startRowIndex + index + 1 }))
    .filter(({ row }) =>
      row.some((cell) => String(cell ?? "").trim().length > 0),
    );
}

function textValue(
  headers: Map<string, number>,
  row: readonly unknown[],
  aliases: readonly string[],
) {
  for (const alias of aliases) {
    const index = headers.get(normalizeCatalogImportHeader(alias));

    if (index !== undefined) {
      return normalizeWorkbookText(row[index]);
    }
  }

  return "";
}

function parseSuppliers(rows: SheetData, rowErrors: WorkbookRowError[]) {
  const headers = headerMap(rows);
  const parsed: ParsedSupplierRow[] = [];

  for (const { row, rowNumber } of nonEmptyRows(rows)) {
    const name = textValue(headers, row, [
      "name",
      "nombre",
      "supplier_name",
      "supplier",
      "proveedor",
      "fornitore",
      "vendor",
      "provider",
    ]);
    const supplierId = textValue(headers, row, ["supplier_id", "id"]);

    if (!name) {
      rowErrors.push({
        field: "name",
        message: "Supplier name is required.",
        row: rowNumber,
        sheet: "Suppliers",
      });
      continue;
    }

    parsed.push({ name, rowNumber, supplierId: supplierId || undefined });
  }

  return parsed;
}

function parseCategories(rows: SheetData, rowErrors: WorkbookRowError[]) {
  const headers = headerMap(rows);
  const parsed: ParsedCategoryRow[] = [];

  for (const { row, rowNumber } of nonEmptyRows(rows)) {
    const name = textValue(headers, row, [
      "name",
      "nombre",
      "category_name",
      "category",
      "categoria",
      "categoría",
      "department",
      "reparto",
    ]);
    const categoryId = textValue(headers, row, ["category_id", "id"]);

    if (!name) {
      rowErrors.push({
        field: "name",
        message: "Category name is required.",
        row: rowNumber,
        sheet: "Categories",
      });
      continue;
    }

    parsed.push({ categoryId: categoryId || undefined, name, rowNumber });
  }

  return parsed;
}

function workbookDateText(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "number" && value > 20_000 && value < 80_000) {
    const date = new Date(Math.round((value - 25569) * 86_400_000));

    return date.toISOString().replace("T", " ").slice(0, 19);
  }

  return normalizeWorkbookText(value);
}

function priceHistoryTextValue(
  headers: Map<string, number>,
  row: readonly unknown[],
  aliases: readonly string[],
) {
  for (const alias of aliases) {
    const index = headers.get(normalizeCatalogImportHeader(alias));

    if (index !== undefined) {
      return normalizeWorkbookText(row[index]);
    }
  }

  return "";
}

function priceHistoryDateValue(
  headers: Map<string, number>,
  row: readonly unknown[],
  aliases: readonly string[],
) {
  for (const alias of aliases) {
    const index = headers.get(normalizeCatalogImportHeader(alias));

    if (index !== undefined) {
      return workbookDateText(row[index]);
    }
  }

  return "";
}

function priceHistoryNumberValue(
  headers: Map<string, number>,
  row: readonly unknown[],
  aliases: readonly string[],
  sheet: string,
  rowNumber: number,
  field: string,
  rowErrors: WorkbookRowError[],
) {
  const rawValue = priceHistoryTextValue(headers, row, aliases);

  if (!rawValue) {
    return undefined;
  }

  const numeric = parseWorkbookNumber(rawValue);

  if (!Number.isFinite(numeric) || numeric < 0) {
    rowErrors.push({
      field,
      message: "Value must be a non-negative number.",
      row: rowNumber,
      sheet,
    });

    return undefined;
  }

  return numeric;
}

function normalizePriceHistoryType(value: string) {
  const normalized = normalizeCatalogImportHeader(value);

  if (
    ["purchase", "purchase_price", "compra", "precio_compra", "cost"].includes(
      normalized,
    )
  ) {
    return "PURCHASE" as const;
  }

  if (
    ["retail", "retail_price", "venta", "precio_venta", "sale"].includes(
      normalized,
    )
  ) {
    return "RETAIL" as const;
  }

  if (normalized === "purchase" || normalized === "retail") {
    return normalized.toUpperCase() as "PURCHASE" | "RETAIL";
  }

  return null;
}

function parsePriceHistory(
  rows: SheetData,
  rowErrors: WorkbookRowError[],
  sheet = "PriceHistory",
) {
  const headers = headerMap(rows);
  const parsed: ParsedPriceHistoryRow[] = [];

  for (const { row, rowNumber } of nonEmptyRows(rows)) {
    const type = normalizePriceHistoryType(
      priceHistoryTextValue(headers, row, ["type", "tipo"]),
    );
    const price = priceHistoryNumberValue(
      headers,
      row,
      ["newPrice", "new_price", "price", "precio", "new price"],
      sheet,
      rowNumber,
      "price",
      rowErrors,
    );
    const effectiveAt = priceHistoryDateValue(headers, row, [
      "effective_at",
      "timestamp",
      "date",
      "fecha",
      "created_at",
    ]);
    const productId = priceHistoryTextValue(headers, row, [
      "product_id",
      "productId",
    ]);
    const productBarcode = priceHistoryTextValue(headers, row, [
      "productBarcode",
      "product_barcode",
      "barcode",
      "codigo_de_barras",
      "código de barras",
    ]);
    const productItemNumber = priceHistoryTextValue(headers, row, [
      "productItemNumber",
      "product_item_number",
      "item_number",
      "sku",
      "codigo_del_articulo",
      "código del artículo",
    ]);
    const priceId = priceHistoryTextValue(headers, row, ["price_id", "id"]);
    const source = priceHistoryTextValue(headers, row, ["source", "fuente"]);
    const note = priceHistoryTextValue(headers, row, ["note", "nota", "reason"]);
    const oldPrice = priceHistoryTextValue(headers, row, [
      "oldPrice",
      "old_price",
      "previous_price",
    ]);

    if (!productId && !productBarcode && !productItemNumber) {
      rowErrors.push({
        field: "product",
        message:
          "PriceHistory row must reference product_id, productBarcode or productItemNumber.",
        row: rowNumber,
        sheet,
      });
    }

    if (!type) {
      rowErrors.push({
        field: "type",
        message: "PriceHistory type must be PURCHASE or RETAIL.",
        row: rowNumber,
        sheet,
      });
    }

    if (price === undefined) {
      rowErrors.push({
        field: "price",
        message: "PriceHistory price is required.",
        row: rowNumber,
        sheet,
      });
    }

    if (!effectiveAt) {
      rowErrors.push({
        field: "effectiveAt",
        message: "PriceHistory timestamp/effective_at is required.",
        row: rowNumber,
        sheet,
      });
    }

    if (!type || price === undefined || !effectiveAt) {
      continue;
    }

    parsed.push({
      createdAt: priceHistoryDateValue(headers, row, ["created_at"]) || effectiveAt,
      effectiveAt,
      note: [note, oldPrice ? `oldPrice=${oldPrice}` : ""]
        .filter(Boolean)
        .join("; ") || undefined,
      price,
      priceId: priceId || undefined,
      productBarcode: productBarcode || undefined,
      productId: productId || undefined,
      productItemNumber: productItemNumber || undefined,
      rowNumber,
      source: source || undefined,
      type,
    });
  }

  return parsed;
}

function hasPlausibleProductIdentity(
  row: readonly unknown[],
  headers: ReadonlyMap<CatalogImportField, number>,
) {
  const barcode = productTextValue(headers, row, "barcode");
  const itemNumber = productTextValue(headers, row, "itemNumber");
  const productName = productTextValue(headers, row, "productName");
  const secondProductName = productTextValue(headers, row, "secondProductName");

  return (
    /^\d{8,14}$/.test(barcode.replace(/\D/g, "")) ||
    itemNumber.length >= 4 ||
    (productName.length >= 3 && !Number.isFinite(parseWorkbookNumber(productName))) ||
    (secondProductName.length >= 3 &&
      !Number.isFinite(parseWorkbookNumber(secondProductName)))
  );
}

function barcodeDigits(value: string) {
  return value.replace(/\D/g, "");
}

function isValidProductBarcode(value: string) {
  return /^\d{8,14}$/.test(barcodeDigits(value));
}

function isAndroidDatabaseBarcodeTooLong(value: string) {
  return value.length > MAX_PRODUCT_BARCODE_LENGTH;
}

function isSafetySanitizationIssue(issue: WorkbookRowError) {
  return issue.code === SAFETY_FORMULA_ESCAPE_CODE;
}

function issueRowKey(issue: WorkbookRowError) {
  return `${normalizedSheetName(issue.sheet)}:${issue.row}`;
}

function issueMatchesSheet(issue: WorkbookRowError, sheetName: string) {
  return normalizedSheetName(issue.sheet) === normalizedSheetName(sheetName);
}

function isProductSummaryRow(
  row: readonly unknown[],
  headers: ReadonlyMap<CatalogImportField, number>,
) {
  const summaryLabels = new Set([
    "sum",
    "subtotal",
    "total",
    "tot",
    "totale",
    "totales",
    "resumen",
    "valor_total",
    "合计",
    "合計",
    "总计",
    "總計",
    "总数",
    "總數",
    "总价",
    "總價",
    "总数量",
    "總數量",
    "总金额",
    "總金額",
  ]);

  const hasSummaryToken = row.some((cell) =>
    summaryLabels.has(normalizeCatalogImportHeader(cell)),
  );
  const numericCells = row.filter((cell) =>
    Number.isFinite(parseWorkbookNumber(normalizeLabel(cell))),
  ).length;
  const barcode = productTextValue(headers, row, "barcode");
  const productName = productTextValue(headers, row, "productName");
  const secondProductName = productTextValue(headers, row, "secondProductName");
  const hasProductNameText = [productName, secondProductName].some(
    (value) => value && !Number.isFinite(parseWorkbookNumber(value)),
  );

  return hasSummaryToken &&
    numericCells >= 2 &&
    (!hasPlausibleProductIdentity(row, headers) ||
      (!isValidProductBarcode(barcode) && !hasProductNameText));
}

type ParsedProductsResult = {
  confidence: number;
  detectedHeaderRow: number | null;
  detectedMapping: ParsedWorkbook["detectedMapping"];
  droppedRows: number;
  products: ParsedProductRow[];
  recognizedColumnSources: ParsedWorkbook["recognizedColumnSources"];
  validRows: number;
};

function detectionMapping(
  rows: SheetData,
  detection: NonNullable<ReturnType<typeof detectCatalogImportHeaderRow>>,
) {
  const headerRow = detection.headerRowIndex === null
    ? []
    : (rows[detection.headerRowIndex] ?? []);
  const mapping: ParsedWorkbook["detectedMapping"] = {};

  for (const [field, columnIndex] of detection.headers.entries()) {
    const source = detection.recognizedColumnSources[field];

    if (source?.source === "generated") {
      continue;
    }

    mapping[field] = {
      columnIndex,
      columnLabel:
        source?.columnLabel ?? normalizeLabel(headerRow[columnIndex]),
      confidence:
        source?.confidence === "low" ? "medium" : (source?.confidence ?? (
          field === "barcode" || field === "productName" ? "high" : "medium"
        )),
    };
  }

  return mapping;
}

function headerDetectionScore(headers: ReadonlyMap<CatalogImportField, number>) {
  let score = headers.size;

  if (headers.has("barcode")) {
    score += 3;
  }

  if (headers.has("productName")) {
    score += 2;
  }

  if (headers.has("itemNumber")) {
    score += 1;
  }

  return score;
}

function maxColumnCount(rows: SheetData) {
  return Math.max(0, ...rows.map((row) => row.length));
}

function sheetColumnLabel(
  rows: SheetData,
  headerRowIndex: number | null,
  columnIndex: number,
) {
  const row = headerRowIndex === null ? undefined : rows[headerRowIndex];

  return normalizeLabel(row?.[columnIndex]) || `Column ${columnIndex + 1}`;
}

function originalColumns(
  rows: SheetData,
  detectedHeaderRow: number | null,
) {
  if (detectedHeaderRow) {
    return (rows[detectedHeaderRow - 1] ?? [])
      .map((cell, index) => normalizeLabel(cell) || `Column ${index + 1}`)
      .filter((label) => label.length > 0);
  }

  return Array.from({ length: maxColumnCount(rows) }, (_value, index) =>
    `Column ${index + 1}`
  );
}

function rawPreviewRows(
  rows: SheetData,
  detectedHeaderRow: number | null,
): CatalogWorkbookRawPreviewRow[] {
  return rows
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .filter(({ row }) =>
      row.some((cell) => String(cell ?? "").trim().length > 0),
    )
    .slice(0, MAX_RAW_PREVIEW_ROWS)
    .map(({ row, rowNumber }) => ({
      cells: row.slice(0, MAX_RAW_PREVIEW_CELLS).map((cell) =>
        normalizeLabel(cell).slice(0, MAX_RAW_PREVIEW_CELL_LENGTH),
      ),
      isDataPreview: detectedHeaderRow === null || rowNumber > detectedHeaderRow,
      isHeader: rowNumber === detectedHeaderRow,
      rowNumber,
    }));
}

function rawPreviewColumns(
  rows: SheetData,
  detectedHeaderRow: number | null,
): CatalogWorkbookRawPreviewColumn[] {
  const headerRow = detectedHeaderRow ? (rows[detectedHeaderRow - 1] ?? []) : [];
  const columnCount = Math.min(
    MAX_RAW_PREVIEW_CELLS,
    detectedHeaderRow ? headerRow.length : maxColumnCount(rows),
  );

  return Array.from({ length: columnCount }, (_value, index) => ({
    columnIndex: index,
    label: normalizeLabel(headerRow[index]) || `Column ${index + 1}`,
  })).filter((column) =>
    detectedHeaderRow ? column.label.length > 0 : true,
  );
}

function productPreviewRows(
  rows: SheetData,
  detectedHeaderRow: number | null,
  columns: readonly CatalogWorkbookRawPreviewColumn[],
): CatalogWorkbookRawPreviewRow[] {
  if (columns.length === 0) {
    return [];
  }

  const headerRowIndex = detectedHeaderRow ? detectedHeaderRow - 1 : null;
  const dataStartIndex = headerRowIndex === null ? 0 : headerRowIndex + 1;
  const headerRow = headerRowIndex === null ? null : rows[headerRowIndex];
  const sampleRows = rows
    .slice(dataStartIndex)
    .map((row, index) => ({ row, rowNumber: dataStartIndex + index + 1 }))
    .filter(({ row }) =>
      row.some((cell) => String(cell ?? "").trim().length > 0),
    )
    .slice(0, MAX_PRODUCT_SAMPLE_ROWS)
    .map(({ row, rowNumber }) => ({
      cells: columns.map((column) =>
        normalizeLabel(row[column.columnIndex]).slice(
          0,
          MAX_RAW_PREVIEW_CELL_LENGTH,
        ),
      ),
      isDataPreview: true,
      isHeader: false,
      rowNumber,
    }));

  return [
    ...(headerRow
      ? [{
          cells: columns.map((column) =>
            normalizeLabel(headerRow[column.columnIndex]).slice(
              0,
              MAX_RAW_PREVIEW_CELL_LENGTH,
            ) || column.label,
          ),
          isDataPreview: false,
          isHeader: true,
          rowNumber: detectedHeaderRow ?? 0,
        }]
      : []),
    ...sampleRows,
  ];
}

function sheetHeaderColumns(rows: SheetData) {
  return (rows[0] ?? [])
    .map((cell, index) => normalizeLabel(cell) || `Column ${index + 1}`)
    .filter(Boolean)
    .slice(0, MAX_RAW_PREVIEW_CELLS);
}

function sheetSampleRows(rows: SheetData) {
  return nonEmptyRows(rows)
    .slice(0, MAX_PRODUCT_SAMPLE_ROWS)
    .map(({ row }) =>
      row
        .slice(0, MAX_RAW_PREVIEW_CELLS)
        .map((cell) =>
          normalizeLabel(cell).slice(0, MAX_RAW_PREVIEW_CELL_LENGTH),
        ),
    );
}

function sheetDataRowCount(rows: SheetData) {
  return nonEmptyRows(rows).length;
}

function sheetRoleForExpectedSheet(
  expectedSheet: AndroidDatabaseExpectedSheet,
): Exclude<CatalogWorkbookSheetRole, "unsupported"> {
  if (expectedSheet === "Products") {
    return "products";
  }

  if (expectedSheet === "Suppliers") {
    return "suppliers";
  }

  if (expectedSheet === "Categories") {
    return "categories";
  }

  return "priceHistory";
}

function parsedRowsForExpectedSheet(
  parsed: Pick<
    ParsedWorkbook,
    "categories" | "priceHistory" | "products" | "suppliers" | "validRows"
  >,
  expectedSheet: AndroidDatabaseExpectedSheet,
) {
  if (expectedSheet === "Products") {
    return {
      parsedRows: parsed.products.length,
      validRows: parsed.validRows,
    };
  }

  if (expectedSheet === "Suppliers") {
    return {
      parsedRows: parsed.suppliers.length,
      validRows: parsed.suppliers.length,
    };
  }

  if (expectedSheet === "Categories") {
    return {
      parsedRows: parsed.categories.length,
      validRows: parsed.categories.length,
    };
  }

  return {
    parsedRows: parsed.priceHistory.length,
    validRows: parsed.priceHistory.length,
  };
}

function baseSheetSummaries(
  sheets: readonly { data: SheetData; sheet: string }[],
  parsed: Pick<
    ParsedWorkbook,
    "categories" | "priceHistory" | "products" | "suppliers" | "validRows"
  >,
): CatalogWorkbookSheetSummary[] {
  const summaries = ANDROID_DATABASE_EXPECTED_SHEETS.map((expectedSheet) => {
    const sheet = findSheetByExpectedName(sheets, expectedSheet);
    const parsedRows = parsedRowsForExpectedSheet(parsed, expectedSheet);
    const notes: string[] = [];

    if (!sheet) {
      notes.push("Sheet not included in this workbook.");
    } else if (!androidSheetHasSignature(sheet, expectedSheet)) {
      notes.push("Headers do not exactly match the audited Android export.");
    }

    return {
      blockedRows: 0,
      columns: sheet ? sheetHeaderColumns(sheet.data) : [],
      expectedSheet,
      importable: Boolean(sheet),
      notes,
      parsedRows: parsedRows.parsedRows,
      role: sheetRoleForExpectedSheet(expectedSheet),
      sampleRows: sheet ? sheetSampleRows(sheet.data) : [],
      sampleRowsTruncated:
        sheet ? sheetDataRowCount(sheet.data) > MAX_PRODUCT_SAMPLE_ROWS : false,
      sheetName: sheet?.sheet ?? expectedSheet,
      status: sheet ? "present" : "missing",
      totalRows: sheet ? sheetDataRowCount(sheet.data) : 0,
      validRows: parsedRows.validRows,
      warningRows: 0,
    } satisfies CatalogWorkbookSheetSummary;
  });

  const unsupported = sheets
    .filter((sheet) =>
      !ANDROID_DATABASE_EXPECTED_SHEETS.some(
        (expected) =>
          normalizedSheetName(expected) === normalizedSheetName(sheet.sheet),
      ),
    )
    .map((sheet) => ({
      blockedRows: 0,
      columns: sheetHeaderColumns(sheet.data),
      expectedSheet: null,
      importable: false,
      notes: ["Sheet is not part of the Android database export contract."],
      parsedRows: 0,
      role: "unsupported" as const,
      sampleRows: sheetSampleRows(sheet.data),
      sampleRowsTruncated: sheetDataRowCount(sheet.data) > MAX_PRODUCT_SAMPLE_ROWS,
      sheetName: sheet.sheet,
      status: "ignored" as const,
      totalRows: sheetDataRowCount(sheet.data),
      validRows: 0,
      warningRows: 0,
    }));

  return [...summaries, ...unsupported];
}

function decorateSheetSummaries(
  summaries: readonly CatalogWorkbookSheetSummary[],
  rowErrors: readonly WorkbookRowError[],
  rowWarnings: readonly WorkbookRowError[],
) {
  const uniqueIssueRowsForSheets = (
    issues: readonly WorkbookRowError[],
    sheetNames: ReadonlySet<string>,
  ) =>
    new Set(
      issues
        .filter((issue) => sheetNames.has(issue.sheet))
        .map((issue) => issueRowKey(issue)),
    ).size;

  return summaries.map((summary) => {
    const issueSheets = new Set([
      summary.sheetName,
      summary.expectedSheet ?? summary.sheetName,
    ]);

    return {
      ...summary,
      blockedRows: uniqueIssueRowsForSheets(rowErrors, issueSheets),
      warningRows: uniqueIssueRowsForSheets(rowWarnings, issueSheets),
    };
  });
}

function unmappedColumns(
  columns: readonly string[],
  mapping: ParsedWorkbook["detectedMapping"],
) {
  const mappedIndexes = new Set(
    Object.values(mapping).map((entry) => entry.columnIndex),
  );

  return columns.filter((_column, index) => !mappedIndexes.has(index));
}

function validationFailedWithRowErrors(rowErrors: WorkbookRowError[]) {
  return {
    ...shopAdminActionResult("validation_failed", { ok: false }),
    rowErrors,
  };
}

function validateMappingOverride(
  rawOverride: string | undefined,
  columnsCount: number,
):
  | { mappingOverride: CatalogWorkbookMappingOverride; valid: true }
  | (ShopAdminActionResult & { rowErrors: WorkbookRowError[]; valid: false }) {
  const raw = rawOverride?.trim();

  if (!raw) {
    return { mappingOverride: {}, valid: true };
  }

  if (raw.length > MAX_MAPPING_OVERRIDE_JSON_BYTES) {
    return {
      ...validationFailedWithRowErrors([
        {
          field: "mappingOverride",
          message: "Mapping override payload is too large.",
          row: 0,
          sheet: "Products",
        },
      ]),
      valid: false,
    };
  }

  let decoded: unknown;

  try {
    decoded = JSON.parse(raw);
  } catch {
    return {
      ...validationFailedWithRowErrors([
        {
          field: "mappingOverride",
          message: "Mapping override must be valid JSON.",
          row: 0,
          sheet: "Products",
        },
      ]),
      valid: false,
    };
  }

  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    return {
      ...validationFailedWithRowErrors([
        {
          field: "mappingOverride",
          message: "Mapping override must be an object.",
          row: 0,
          sheet: "Products",
        },
      ]),
      valid: false,
    };
  }

  const allowedFields = new Set<CatalogImportField>(CATALOG_IMPORT_FIELDS);
  const usedColumns = new Map<number, CatalogImportField>();
  const rowErrors: WorkbookRowError[] = [];
  const mappingOverride: CatalogWorkbookMappingOverride = {};

  for (const [field, value] of Object.entries(decoded)) {
    if (!allowedFields.has(field as CatalogImportField)) {
      rowErrors.push({
        field: "mappingOverride",
        message: `Unknown mapping field ${field}.`,
        row: 0,
        sheet: "Products",
      });
      continue;
    }

    if (value === null || value === "" || value === "ignore") {
      mappingOverride[field as CatalogImportField] = null;
      continue;
    }

    const columnIndex = Number(value);

    if (
      !Number.isInteger(columnIndex) ||
      columnIndex < 0 ||
      columnIndex >= columnsCount
    ) {
      rowErrors.push({
        field,
        message: "Mapping column index does not exist in the selected sheet.",
        row: 0,
        sheet: "Products",
      });
      continue;
    }

    const duplicateField = usedColumns.get(columnIndex);

    if (duplicateField) {
      rowErrors.push({
        field,
        message: `Column is already mapped to ${duplicateField}.`,
        row: 0,
        sheet: "Products",
      });
      continue;
    }

    usedColumns.set(columnIndex, field as CatalogImportField);
    mappingOverride[field as CatalogImportField] = columnIndex;
  }

  if (rowErrors.length > 0) {
    return {
      ...validationFailedWithRowErrors(rowErrors),
      valid: false,
    };
  }

  return { mappingOverride, valid: true };
}

function applyMappingOverride(
  rows: SheetData,
  detection: NonNullable<ReturnType<typeof detectCatalogImportHeaderRow>>,
  mappingOverride: CatalogWorkbookMappingOverride,
) {
  const headers = new Map(detection.headers);
  const ignoredFields = new Set<CatalogImportField>();
  const recognizedColumnSources = {
    ...detection.recognizedColumnSources,
  };

  for (const [field, columnIndex] of Object.entries(
    mappingOverride,
  ) as Array<[CatalogImportField, number | null | undefined]>) {
    if (columnIndex === undefined) {
      continue;
    }

    if (columnIndex === null) {
      ignoredFields.add(field);
      recognizedColumnSources[field] = {
        columnIndex: null,
        confidence: "high",
        reason: "manual-ignore",
        source: "manual",
      };
      continue;
    }

    headers.set(field, columnIndex);
    recognizedColumnSources[field] = {
      columnIndex,
      columnLabel: sheetColumnLabel(rows, detection.headerRowIndex, columnIndex),
      confidence: "high",
      reason: "manual-override",
      source: "manual",
    };
  }
  const effectiveHeaders = new Map(
    Array.from(headers.entries()).filter(([field]) => !ignoredFields.has(field)),
  );

  return {
    ...detection,
    headers: effectiveHeaders,
    recognizedColumnSources,
    score: headerDetectionScore(effectiveHeaders),
  };
}

function applySupplierDefaultFieldSelection(
  detection: NonNullable<ReturnType<typeof detectCatalogImportHeaderRow>>,
  mappingOverride: CatalogWorkbookMappingOverride,
) {
  const headers = new Map(
    Array.from(detection.headers.entries()).filter(([field]) => {
      if (SUPPLIER_ALWAYS_EXCLUDED_MAPPING_FIELDS.has(field)) {
        return false;
      }

      if (!SUPPLIER_DEFAULT_EXCLUDED_MAPPING_FIELDS.has(field)) {
        return true;
      }

      return Object.prototype.hasOwnProperty.call(mappingOverride, field);
    }),
  );

  return {
    ...detection,
    headers,
    score: headerDetectionScore(headers),
  };
}

function numericMappingCompatibilityErrors(
  rows: SheetData,
  detection: NonNullable<ReturnType<typeof detectCatalogImportHeaderRow>>,
  sheet: string,
) {
  const rowErrors: WorkbookRowError[] = [];
  const productRows = nonEmptyRows(rows, detection.dataStartRowIndex)
    .filter(({ row }) => !isProductSummaryRow(row, detection.headers))
    .slice(0, 20);
  const issueRow = detection.headerRowIndex === null
    ? detection.dataStartRowIndex + 1
    : detection.headerRowIndex + 1;

  for (const field of NUMERIC_COMPATIBLE_MAPPING_FIELDS) {
    const columnIndex = detection.headers.get(field);

    if (columnIndex === undefined) {
      continue;
    }

    const sampleValues = productRows
      .map(({ row }) => normalizeLabel(row[columnIndex]))
      .filter(Boolean)
      .slice(0, 8);
    const hasInvalidSample =
      sampleValues.length > 0 &&
      sampleValues.some((value) => {
        const numeric = parseWorkbookNumber(value);

        return !Number.isFinite(numeric) || numeric < 0;
      });

    if (hasInvalidSample) {
      rowErrors.push({
        code: "mapping_incompatible_type",
        field,
        message:
          "Mapped column must contain numeric values. Choose a numeric source column before import preview.",
        row: issueRow,
        sheet,
      });
    }
  }

  return rowErrors;
}

function parsedPreviewRows(
  products: readonly ParsedProductRow[],
): CatalogWorkbookPreviewRow[] {
  return products.slice(0, MAX_PREVIEW_ROWS).map((product) => ({
    barcode: product.barcode,
    categoryName: product.categoryName,
    itemNumber: product.itemNumber,
    productName: product.productName,
    recognizedDiscount: product.discount,
    recognizedDiscountedPrice: product.discountedPrice,
    recognizedLineTotal: product.lineTotal,
    recognizedPurchasePrice: product.purchasePrice,
    recognizedQuantity: product.stockQuantity,
    recognizedRetailPrice: product.retailPrice,
    retailPrice: product.retailPrice,
    rowFingerprint: catalogImportRowFingerprint(product),
    rowNumber: product.rowNumber,
    secondProductName: product.secondProductName,
    status: "Ready",
    stockQuantity: product.stockQuantity,
    supplierName: product.supplierName,
    warnings: 0,
  }));
}

function parseProducts(
  rows: SheetData,
  rowErrors: WorkbookRowError[],
  mappingOverride: CatalogWorkbookMappingOverride,
  sheet = "Products",
  importMode: CatalogWorkbookImportMode = "database",
  options: {
    allowFlexibleBarcode?: boolean;
  } = {},
): ParsedProductsResult {
  if (rows.length === 0) {
    return {
      confidence: 0,
      detectedHeaderRow: null,
      detectedMapping: {},
      droppedRows: 0,
      products: [],
      recognizedColumnSources: {},
      validRows: 0,
    };
  }

  const automaticDetection = detectCatalogImportHeaderRow(rows);
  const parsed: ParsedProductRow[] = [];
  let droppedRows = 0;

  if (!automaticDetection) {
    rowErrors.push({
      field: "header",
      message:
        "Products sheet must include recognizable barcode and product columns.",
      row: 1,
      sheet,
    });

    return {
      confidence: 0,
      detectedHeaderRow: null,
      detectedMapping: {},
      droppedRows,
      products: parsed,
      recognizedColumnSources: {},
      validRows: 0,
    };
  }

  const overrideDetection = Object.keys(mappingOverride).length > 0
    ? applyMappingOverride(rows, automaticDetection, mappingOverride)
    : automaticDetection;
  const detection = importMode === "supplier"
    ? applySupplierDefaultFieldSelection(overrideDetection, mappingOverride)
    : overrideDetection;
  const compatibilityErrors = numericMappingCompatibilityErrors(
    rows,
    detection,
    sheet,
  );

  if (compatibilityErrors.length > 0) {
    rowErrors.push(...compatibilityErrors);

    return {
      confidence: Math.min(1, detection.score / 12),
      detectedHeaderRow:
        detection.headerRowIndex === null ? null : detection.headerRowIndex + 1,
      detectedMapping: detectionMapping(rows, detection),
      droppedRows,
      products: parsed,
      recognizedColumnSources: detection.recognizedColumnSources,
      validRows: 0,
    };
  }

  for (const { row, rowNumber } of nonEmptyRows(
    rows,
    detection.dataStartRowIndex,
  )) {
    if (isProductSummaryRow(row, detection.headers)) {
      droppedRows += 1;
      continue;
    }

    const barcode = productTextValue(detection.headers, row, "barcode");
    const productName = productTextValue(
      detection.headers,
      row,
      "productName",
    );

    if (!barcode) {
      rowErrors.push({
        field: "barcode",
        message: "Barcode is required.",
        row: rowNumber,
        sheet,
      });
    } else if (
      options.allowFlexibleBarcode &&
      isAndroidDatabaseBarcodeTooLong(barcode)
    ) {
      rowErrors.push({
        field: "barcode",
        message:
          "Android database barcode must be at most 96 characters for Admin Web import.",
        row: rowNumber,
        sheet,
      });
    } else if (!options.allowFlexibleBarcode && !isValidProductBarcode(barcode)) {
      rowErrors.push({
        field: "barcode",
        message: "Barcode must contain 8 to 14 digits.",
        row: rowNumber,
        sheet,
      });
    }

    if (!productName) {
      rowErrors.push({
        field: "productName",
        message: "Product name is required.",
        row: rowNumber,
        sheet,
      });
    }

    parsed.push({
      barcode,
      categoryId:
        productTextValue(detection.headers, row, "categoryId") || undefined,
      categoryName:
        productTextValue(detection.headers, row, "categoryName") || undefined,
      discount: productReferenceNumberValue(detection.headers, row, "discount"),
      discountedPrice: productReferenceNumberValue(
        detection.headers,
        row,
        "discountedPrice",
      ),
      itemNumber:
        productTextValue(detection.headers, row, "itemNumber") || undefined,
      lineTotal: productReferenceNumberValue(detection.headers, row, "lineTotal"),
      productId:
        productTextValue(detection.headers, row, "productId") || undefined,
      productName,
      purchasePrice: productNumberValue(
        detection.headers,
        row,
        "purchasePrice",
        sheet,
        rowNumber,
        "purchasePrice",
        rowErrors,
      ),
      retailPrice: productNumberValue(
        detection.headers,
        row,
        "retailPrice",
        sheet,
        rowNumber,
        "retailPrice",
        rowErrors,
      ),
      rowNumber,
      secondProductName:
        productTextValue(detection.headers, row, "secondProductName") ||
        undefined,
      stockQuantity: productNumberValue(
        detection.headers,
        row,
        "stockQuantity",
        sheet,
        rowNumber,
        "stockQuantity",
        rowErrors,
      ),
      supplierId:
        productTextValue(detection.headers, row, "supplierId") || undefined,
      supplierName:
        productTextValue(detection.headers, row, "supplierName") || undefined,
    });
  }

  return {
    confidence: Math.min(1, detection.score / 12),
    detectedHeaderRow:
      detection.headerRowIndex === null ? null : detection.headerRowIndex + 1,
    detectedMapping: detectionMapping(rows, detection),
    droppedRows,
    products: parsed,
    recognizedColumnSources: detection.recognizedColumnSources,
    validRows: parsed.filter((product) => product.barcode && product.productName)
      .length,
  };
}

type OoxmlZipDirectory = Awaited<ReturnType<typeof unzipper.Open.buffer>>;

function parseXmlDocument(xml: string, path: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(xml, "application/xml");

  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error(`${path}: invalid XML`);
  }

  return document;
}

function xmlText(node: XmlElement) {
  return Array.from(node.getElementsByTagName("t"))
    .map((entry) => entry.textContent ?? "")
    .join("");
}

async function zipText(directory: OoxmlZipDirectory, path: string) {
  const entry = directory.files.find((file) => file.path === path);

  return entry ? (await entry.buffer()).toString("utf8") : null;
}

function relationshipTargetPath(target: string) {
  const normalized = target.replace(/^\/+/, "");

  return normalized.startsWith("xl/")
    ? normalized
    : `xl/${normalized.replace(/^\.?\//, "")}`;
}

function columnIndexFromCellRef(cellRef: string) {
  const letters = cellRef.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "";
  let index = 0;

  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }

  return Math.max(0, index - 1);
}

function parseOoxmlCellValue(
  cell: XmlElement,
  sharedStrings: readonly string[],
): string | number | boolean {
  const type = cell.getAttribute("t");

  if (type === "inlineStr") {
    const inlineString = cell.getElementsByTagName("is")[0];

    return inlineString ? xmlText(inlineString as XmlElement) : "";
  }

  const rawValue = cell.getElementsByTagName("v")[0]?.textContent ?? "";

  if (type === "s") {
    return sharedStrings[Number(rawValue)] ?? "";
  }

  if (type === "b") {
    return rawValue === "1";
  }

  if (type === "str") {
    return rawValue;
  }

  if (!rawValue) {
    return "";
  }

  const numeric = Number(rawValue);

  return Number.isFinite(numeric) ? numeric : rawValue;
}

async function readOoxmlSharedStrings(directory: OoxmlZipDirectory) {
  const xml = await zipText(directory, "xl/sharedStrings.xml");

  if (!xml) {
    return [];
  }

  const document = parseXmlDocument(xml, "xl/sharedStrings.xml");

  return Array.from(document.getElementsByTagName("si")).map((item) =>
    xmlText(item),
  );
}

async function readOoxmlWorksheet(
  directory: OoxmlZipDirectory,
  path: string,
  sharedStrings: readonly string[],
) {
  const xml = await zipText(directory, path);

  if (!xml) {
    return [];
  }

  const document = parseXmlDocument(xml, path);
  const parsedRows: SheetData = [];

  for (const row of Array.from(document.getElementsByTagName("row"))) {
    const rowNumber = Number(row.getAttribute("r"));
    const targetRowIndex = Number.isFinite(rowNumber)
      ? Math.max(0, rowNumber - 1)
      : parsedRows.length;
    const cells = Array.from(row.getElementsByTagName("c"));
    const parsedRow: Array<string | number | boolean | null> = [];

    for (const cell of cells) {
      const cellRef = cell.getAttribute("r") ?? "";
      const columnIndex = columnIndexFromCellRef(cellRef);

      parsedRow[columnIndex] = parseOoxmlCellValue(cell, sharedStrings);
    }

    parsedRows[targetRowIndex] = Array.from(
      { length: parsedRow.length },
      (_, index) => parsedRow[index] ?? null,
    );
  }

  return parsedRows;
}

async function readOoxmlWorkbookFallback(bytes: Buffer) {
  const directory = await unzipper.Open.buffer(bytes);
  const workbookXml = await zipText(directory, "xl/workbook.xml");
  const relationshipsXml = await zipText(
    directory,
    "xl/_rels/workbook.xml.rels",
  );

  if (!workbookXml || !relationshipsXml) {
    return [];
  }

  const workbook = parseXmlDocument(workbookXml, "xl/workbook.xml");
  const relationships = parseXmlDocument(
    relationshipsXml,
    "xl/_rels/workbook.xml.rels",
  );
  const relationshipTargets = new Map<string, string>();

  for (const relationship of Array.from(
    relationships.getElementsByTagName("Relationship"),
  )) {
    const id = relationship.getAttribute("Id");
    const target = relationship.getAttribute("Target");

    if (id && target) {
      relationshipTargets.set(id, relationshipTargetPath(target));
    }
  }

  const sharedStrings = await readOoxmlSharedStrings(directory);
  const sheets: Array<{ data: SheetData; sheet: string }> = [];

  for (const sheet of Array.from(workbook.getElementsByTagName("sheet"))) {
    const name = sheet.getAttribute("name") ?? "Sheet";
    const relationshipId = sheet.getAttribute("r:id");
    const targetPath = relationshipId
      ? relationshipTargets.get(relationshipId)
      : null;

    if (!targetPath) {
      continue;
    }

    sheets.push({
      data: await readOoxmlWorksheet(directory, targetPath, sharedStrings),
      sheet: name,
    });
  }

  return sheets;
}

function sheetJsCellValue(value: unknown): string | number | boolean | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function readSheetJsWorkbook(bytes: Buffer) {
  const workbook = SheetJS.read(bytes, {
    cellDates: false,
    type: "buffer",
  });

  return workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = SheetJS.utils.sheet_to_json<unknown[]>(worksheet, {
      blankrows: false,
      defval: null,
      header: 1,
      raw: true,
    });

    return {
      data: rows.map((row) => row.map(sheetJsCellValue)) as SheetData,
      sheet: sheetName,
    };
  });
}

async function readWorkbookSheets(input: CatalogWorkbookInput) {
  if (isLegacyWorkbookName(input.fileName)) {
    return readSheetJsWorkbook(input.bytes);
  }

  try {
    return await readXlsxFile<number>(input.bytes);
  } catch {
    try {
      const ooxmlSheets = await readOoxmlWorkbookFallback(input.bytes);

      if (ooxmlSheets.length > 0) {
        return ooxmlSheets;
      }
    } catch {
      // Fall through to the SheetJS reader, which also handles HTML-Excel files.
    }

    return readSheetJsWorkbook(input.bytes);
  }
}

function selectProductSheet(
  sheets: readonly { data: SheetData; sheet: string }[],
  options: { fallbackToFirstSheet?: boolean } = { fallbackToFirstSheet: true },
) {
  let selectedProductSheet:
    | {
        detection: ReturnType<typeof detectCatalogImportHeaderRow>;
        rows: SheetData;
        score: number;
        sheet: string;
      }
    | null = null;

  for (const sheet of sheets) {
    const detection = detectCatalogImportHeaderRow(sheet.data);
    const normalizedSheet = normalizeCatalogImportHeader(sheet.sheet);
    const nameBoost =
      normalizedSheet === "products" || normalizedSheet === "productos"
        ? 4
        : normalizedSheet === "产品" || normalizedSheet === "產品"
          ? 3
          : 0;
    const score = (detection?.score ?? 0) + nameBoost;

    if (!detection && nameBoost === 0) {
      continue;
    }

    if (!selectedProductSheet || score > selectedProductSheet.score) {
      selectedProductSheet = {
        detection,
        rows: sheet.data,
        score,
        sheet: sheet.sheet,
      };
    }
  }

  if (selectedProductSheet) {
    return selectedProductSheet;
  }

  if (options.fallbackToFirstSheet) {
    return {
      detection: null,
      rows: sheets[0]?.data ?? [],
      score: 0,
      sheet: sheets[0]?.sheet ?? "Products",
    };
  }

  return {
    detection: null,
    rows: [],
    score: 0,
    sheet: "Products",
  };
}

async function parseWorkbook(
  input: CatalogWorkbookInput,
): Promise<ParsedWorkbook | ShopAdminActionResult> {
  const fileError = validateWorkbookFile(input);

  if (fileError) {
    return fileError;
  }

  let sheets: Array<{ data: SheetData; sheet: string }>;

  try {
    sheets = await readWorkbookSheets(input);
  } catch {
    return shopAdminActionResult("invalid_workbook", { ok: false });
  }

  if (sheets.length === 0) {
    return shopAdminActionResult("invalid_workbook", { ok: false });
  }

  const rowErrors: WorkbookRowError[] = [];
  const rowWarnings: WorkbookRowError[] = [];
  const importMode = normalizeImportMode(input.importMode);
  const detectedFormat = detectCatalogWorkbookFormat(sheets, importMode);
  const selectedProductSheet = selectProductSheet(sheets, {
    fallbackToFirstSheet:
      importMode !== "database" ||
      detectedFormat.kind !== "android_database_export",
  });
  const mappingOverrideValidation = validateMappingOverride(
    input.mappingOverride,
    maxColumnCount(selectedProductSheet.rows),
  );

  if (!mappingOverrideValidation.valid) {
    return mappingOverrideValidation;
  }

  const mappingOverride = mappingOverrideValidation.mappingOverride;
  const supplierRows = importMode === "database"
    ? getSheetRows(sheets, "Suppliers")
    : [];
  const categoryRows = importMode === "database"
    ? getSheetRows(sheets, "Categories")
    : [];
  const priceHistoryRows = importMode === "database"
    ? getSheetRows(sheets, "PriceHistory")
    : [];
  const productResult = parseProducts(
    selectedProductSheet.rows,
    rowErrors,
    mappingOverride,
    selectedProductSheet.sheet,
    importMode,
    {
      allowFlexibleBarcode:
        importMode === "database" &&
        detectedFormat.kind === "android_database_export",
    },
  );
  const suppliers = parseSuppliers(supplierRows, rowErrors);
  const categories = parseCategories(categoryRows, rowErrors);
  const priceHistory = parsePriceHistory(priceHistoryRows, rowErrors);
  const sheetSummaries = importMode === "database"
    ? baseSheetSummaries(sheets, {
        categories,
        priceHistory,
        products: productResult.products,
        suppliers,
        validRows: productResult.validRows,
      })
    : [];
  const importableRowCount =
    productResult.products.length +
    suppliers.length +
    categories.length +
    priceHistory.length;

  if (importableRowCount > MAX_IMPORT_ROWS) {
    return shopAdminActionResult("row_limit_exceeded", { ok: false });
  }

  const formulaEscapeFields = new Set([
    "barcode",
    "categoryName",
    "itemNumber",
    "productName",
    "secondProductName",
    "supplierName",
  ]);

  for (const product of productResult.products) {
    for (const [field, value] of Object.entries(product)) {
      if (
        typeof value === "string" &&
        needsSpreadsheetSafetyEscape(value) &&
        formulaEscapeFields.has(field)
      ) {
        rowWarnings.push({
          code: SAFETY_FORMULA_ESCAPE_CODE,
          field,
          message:
            "Leading formula character will be escaped in spreadsheet output.",
          row: product.rowNumber,
          sheet: selectedProductSheet.sheet,
        });
      }
    }
  }

  const fileDigest = previewDigest(input.bytes);
  const columns = originalColumns(
    selectedProductSheet.rows,
    productResult.detectedHeaderRow,
  );
  const sampleColumns = rawPreviewColumns(
    selectedProductSheet.rows,
    productResult.detectedHeaderRow,
  );
  const mapping = productResult.detectedMapping;
  const rowFingerprints = productResult.products.map((product) =>
    catalogImportRowFingerprint(product),
  );
  const digest = buildPreviewDigest({
    detectedHeaderRow: productResult.detectedHeaderRow,
    detectedMapping: mapping,
    fileDigest,
    importMode,
    mappingConfirmed: true,
    mappingOverride,
    rowFingerprints,
    selectedProductSheet: selectedProductSheet.sheet,
  });

  return {
    categories,
    confidence: productResult.confidence,
    detectedHeaderRow: productResult.detectedHeaderRow,
    detectedFormat,
    detectedMapping: mapping,
    digest,
    droppedRows: productResult.droppedRows,
    fileDigest,
    importMode,
    mappingOverride,
    originalColumns: columns,
    priceHistory,
    rawPreviewColumns: sampleColumns,
    rawPreviewRows: productPreviewRows(
      selectedProductSheet.rows,
      productResult.detectedHeaderRow,
      sampleColumns,
    ),
    rawWorkbookContextRows: rawPreviewRows(
      selectedProductSheet.rows,
      productResult.detectedHeaderRow,
    ),
    previewRows: parsedPreviewRows(productResult.products),
    previewRowsTruncated: productResult.products.length > MAX_PREVIEW_ROWS,
    products: productResult.products,
    recognizedColumnSources: productResult.recognizedColumnSources,
    rowErrors,
    rowWarnings,
    selectedProductSheet: selectedProductSheet.sheet,
    sheetSummaries,
    suppliers,
    unmappedColumns: unmappedColumns(columns, mapping),
    validRows: productResult.validRows,
    workbookMetadata: {
      fileName: input.fileName,
      headerRow: productResult.detectedHeaderRow,
      mimeType: input.mimeType,
      parsedRows: productResult.products.length,
      previewRowsLimit: MAX_PREVIEW_ROWS,
      previewRowsTruncated: productResult.products.length > MAX_PREVIEW_ROWS,
      selectedSheet: selectedProductSheet.sheet,
      sheetNames: sheets.map((sheet) => sheet.sheet),
      sizeBytes: input.bytes.byteLength,
      totalRows: selectedProductSheet.rows.length,
    },
  };
}

function findProduct(
  products: readonly ShopInventoryProduct[],
  row: ParsedProductRow,
) {
  return (
    (row.productId
      ? products.find((product) => product.productId === row.productId)
      : undefined) ??
    products.find((product) => product.barcode === row.barcode)
  );
}

function findSupplier(
  suppliers: readonly ShopInventorySupplier[],
  row: ParsedSupplierRow,
) {
  return (
    (row.supplierId
      ? suppliers.find((supplier) => supplier.supplierId === row.supplierId)
      : undefined) ??
    suppliers.find(
      (supplier) => supplier.name.toLowerCase() === row.name.toLowerCase(),
    )
  );
}

function findCategory(
  categories: readonly ShopInventoryCategory[],
  row: ParsedCategoryRow,
) {
  return (
    (row.categoryId
      ? categories.find((category) => category.categoryId === row.categoryId)
      : undefined) ??
    categories.find(
      (category) => category.name.toLowerCase() === row.name.toLowerCase(),
    )
  );
}

function isSupplierReferenceOnlyIssue(issue: WorkbookRowError) {
  return issue.code === "unknown_supplier" || issue.code === "unknown_category";
}

function supplierVisibleRowErrors(issues: readonly WorkbookRowError[]) {
  return issues.filter((issue) => !isSupplierReferenceOnlyIssue(issue));
}

function uniqueIssueRowCount(issues: readonly WorkbookRowError[]) {
  return new Set(issues.map((issue) => issueRowKey(issue))).size;
}

function supplierChangeSummary(
  suppliers: readonly ParsedSupplierRow[],
  readModel: Pick<Awaited<ReturnType<typeof getShopInventoryReadModel>>, "suppliers">,
) {
  let updated = 0;

  for (const supplier of suppliers) {
    if (findSupplier(readModel.suppliers, supplier)) {
      updated += 1;
    }
  }

  return {
    newSuppliers: Math.max(0, suppliers.length - updated),
    updatedSuppliers: updated,
  };
}

function categoryChangeSummary(
  categories: readonly ParsedCategoryRow[],
  readModel: Pick<Awaited<ReturnType<typeof getShopInventoryReadModel>>, "categories">,
) {
  let updated = 0;

  for (const category of categories) {
    if (findCategory(readModel.categories, category)) {
      updated += 1;
    }
  }

  return {
    newCategories: Math.max(0, categories.length - updated),
    updatedCategories: updated,
  };
}

function maybeNumber(value: number | null | undefined) {
  return value === null ? undefined : value;
}

function maybeText(value: string | null | undefined) {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
}

function supplierImportHistoryRows(
  rows: readonly ParsedProductRow[],
  readModel: Pick<
    Awaited<ReturnType<typeof getShopInventoryReadModel>>,
    "categories" | "suppliers"
  >,
): SupplierImportHistoryGridRow[] {
  const supplierNamesById = new Map(
    readModel.suppliers.map((supplier) => [
      supplier.supplierId,
      supplier.name,
    ]),
  );
  const categoryNamesById = new Map(
    readModel.categories.map((category) => [
      category.categoryId,
      category.name,
    ]),
  );

  return rows.map((row) => ({
    barcode: row.barcode,
    categoryName: row.categoryId
      ? categoryNamesById.get(row.categoryId)
      : row.categoryName,
    itemNumber: row.itemNumber,
    productName: row.productName,
    purchasePrice: row.purchasePrice,
    retailPrice: row.retailPrice,
    rowNumber: row.rowNumber,
    stockQuantity: row.stockQuantity,
    supplierName: row.supplierId
      ? supplierNamesById.get(row.supplierId)
      : row.supplierName,
  }));
}

function jsonRecordMetadata(value: Json) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as { [key: string]: Json | undefined })
    : {};
}

function supplierReferenceWarnings(issues: readonly WorkbookRowError[]) {
  return issues
    .filter(isSupplierReferenceOnlyIssue)
    .map((issue) => ({
      ...issue,
      message:
        issue.code === "unknown_supplier"
          ? "Supplier reference was not matched in this shop and will be left empty."
          : "Category reference was not matched in this shop and will be left empty.",
    }));
}

function resolveSupplierIdForSupplierImport(
  row: ParsedProductRow,
  existing: ShopInventoryProduct | undefined,
  suppliers: readonly ShopInventorySupplier[],
) {
  if (
    row.supplierId &&
    suppliers.some((supplier) => supplier.supplierId === row.supplierId)
  ) {
    return row.supplierId;
  }

  if (row.supplierName) {
    return suppliers.find(
      (supplier) =>
        supplier.name.toLowerCase() === row.supplierName?.toLowerCase(),
    )?.supplierId;
  }

  return existing?.supplierId ?? undefined;
}

function resolveCategoryIdForSupplierImport(
  row: ParsedProductRow,
  existing: ShopInventoryProduct | undefined,
  categories: readonly ShopInventoryCategory[],
) {
  if (
    row.categoryId &&
    categories.some((category) => category.categoryId === row.categoryId)
  ) {
    return row.categoryId;
  }

  if (row.categoryName) {
    return categories.find(
      (category) =>
        category.name.toLowerCase() === row.categoryName?.toLowerCase(),
    )?.categoryId;
  }

  return existing?.categoryId ?? undefined;
}

function readModelAsExistingRows(
  readModel: Pick<
    Awaited<ReturnType<typeof getShopInventoryReadModel>>,
    "categories" | "products" | "suppliers"
  >,
): CatalogImportExistingRows {
  return {
    categories: readModel.categories.map((category) => ({
      categoryId: category.categoryId,
      name: category.name,
    })),
    products: readModel.products.map((product) => ({
      barcode: product.barcode,
      categoryId: product.categoryId,
      itemNumber: product.itemNumber,
      productId: product.productId,
      productName: product.productName,
      purchasePrice: product.purchasePrice,
      retailPrice: product.retailPrice,
      secondProductName: product.secondProductName,
      stockQuantity: product.stockQuantity,
      supplierId: product.supplierId,
    })),
    suppliers: readModel.suppliers.map((supplier) => ({
      name: supplier.name,
      supplierId: supplier.supplierId,
    })),
  };
}

function buildParsedProductReferenceSets(
  products: readonly ParsedProductRow[],
  readModel: Pick<Awaited<ReturnType<typeof getShopInventoryReadModel>>, "products">,
) {
  const productIds = new Set<string>();
  const barcodes = new Set<string>();
  const itemNumbers = new Set<string>();

  for (const product of readModel.products) {
    productIds.add(product.productId);
    barcodes.add(product.barcode.toLowerCase());

    if (product.itemNumber) {
      itemNumbers.add(product.itemNumber.toLowerCase());
    }
  }

  for (const product of products) {
    if (product.productId) {
      productIds.add(product.productId);
    }

    if (product.barcode) {
      barcodes.add(product.barcode.toLowerCase());
    }

    if (product.itemNumber) {
      itemNumbers.add(product.itemNumber.toLowerCase());
    }
  }

  return { barcodes, itemNumbers, productIds };
}

function validatePriceHistoryRows(
  parsed: ParsedWorkbook,
  readModel: Pick<Awaited<ReturnType<typeof getShopInventoryReadModel>>, "products">,
) {
  const references = buildParsedProductReferenceSets(parsed.products, readModel);
  const rowErrors: WorkbookRowError[] = [];

  for (const row of parsed.priceHistory) {
    const hasProductId =
      row.productId && references.productIds.has(row.productId);
    const hasBarcode =
      row.productBarcode &&
      references.barcodes.has(row.productBarcode.toLowerCase());
    const hasItemNumber =
      row.productItemNumber &&
      references.itemNumbers.has(row.productItemNumber.toLowerCase());

    if (!hasProductId && !hasBarcode && !hasItemNumber) {
      rowErrors.push({
        field: "product",
        message:
          "PriceHistory product reference must match a product in this shop or workbook.",
        row: row.rowNumber,
        sheet: "PriceHistory",
      });
    }
  }

  return rowErrors;
}

function issueCountByProductRow(
  issues: readonly WorkbookRowError[],
  productSheetName: string,
) {
  const counts = new Map<number, number>();

  for (const issue of issues.filter((entry) =>
    issueMatchesSheet(entry, productSheetName),
  )) {
    counts.set(issue.row, (counts.get(issue.row) ?? 0) + 1);
  }

  return counts;
}

function decorateCatalogPreviewRows(
  parsed: ParsedWorkbook,
  rowErrors: readonly WorkbookRowError[],
  rowWarnings: readonly WorkbookRowError[],
  readModel: Pick<Awaited<ReturnType<typeof getShopInventoryReadModel>>, "products">,
) {
  const productRowErrors = rowErrors.filter((issue) =>
    issueMatchesSheet(issue, parsed.selectedProductSheet),
  );
  const errorsByRow = issueCountByProductRow(
    rowErrors,
    parsed.selectedProductSheet,
  );
  const warningsByRow = issueCountByProductRow(
    rowWarnings,
    parsed.selectedProductSheet,
  );
  const parsedProductsByRow = new Map(
    parsed.products.map((product) => [product.rowNumber, product]),
  );
  const existingBarcodes = new Set(
    readModel.products.map((product) => product.barcode.toLowerCase()),
  );
  const errorTextByRow = new Map<number, string>();

  for (const issue of productRowErrors) {
    errorTextByRow.set(
      issue.row,
      `${errorTextByRow.get(issue.row) ?? ""} ${issue.code ?? ""} ${issue.message}`,
    );
  }

  return parsed.previewRows.map((row) => {
    const parsedProduct = parsedProductsByRow.get(row.rowNumber);
    const existing = parsedProduct
      ? findProduct(readModel.products, parsedProduct)
      : readModel.products.find((product) => product.barcode === row.barcode);
    const errorText = errorTextByRow.get(row.rowNumber)?.toLowerCase() ?? "";
    let status: CatalogWorkbookPreviewRow["status"] = "Ready";

    if (errorsByRow.has(row.rowNumber)) {
      status = errorText.includes("duplicate") ? "Duplicate" : "Blocked";
    } else if (warningsByRow.has(row.rowNumber)) {
      status = "Warning";
    } else if (existingBarcodes.has(row.barcode.toLowerCase())) {
      status = "Update";
    } else {
      status = "New";
    }

    return {
      ...row,
      currentPurchasePrice: maybeNumber(existing?.purchasePrice),
      currentRetailPrice: maybeNumber(existing?.retailPrice),
      currentStockQuantity: maybeNumber(existing?.stockQuantity),
      status,
      warnings: warningsByRow.get(row.rowNumber) ?? 0,
    };
  });
}

function parseAdjustmentNumber(
  value: unknown,
  field: "retailPrice" | "stockQuantity",
  rowNumber: number,
) {
  if (value === undefined || value === null || value === "") {
    return { ok: true as const, value: undefined };
  }

  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    return {
      error: {
        field,
        message: "Adjustment value must be a non-negative finite number.",
        row: rowNumber,
        sheet: "Products",
      } satisfies WorkbookRowError,
      ok: false as const,
    };
  }

  return { ok: true as const, value: numeric };
}

function parseAdjustmentText(
  value: unknown,
  field: "categoryName" | "supplierName",
  rowNumber: number,
) {
  if (value === undefined || value === null || value === "") {
    return { ok: true as const, value: undefined };
  }

  if (typeof value !== "string") {
    return {
      error: {
        field,
        message: "Adjustment value must be text.",
        row: rowNumber,
        sheet: "Products",
      } satisfies WorkbookRowError,
      ok: false as const,
    };
  }

  const normalized = normalizeLabel(value);

  if (normalized.length > 120) {
    return {
      error: {
        field,
        message: "Adjustment text must be at most 120 characters.",
        row: rowNumber,
        sheet: "Products",
      } satisfies WorkbookRowError,
      ok: false as const,
    };
  }

  return { ok: true as const, value: normalized || undefined };
}

function normalizeDefaultAssignment(value: string | undefined) {
  const normalized = normalizeLabel(value);

  return normalized && normalized.length <= 120 ? normalized : undefined;
}

function validateDefaultAssignments(input: {
  defaultCategoryName?: string;
  defaultSupplierName?: string;
}):
  | {
      defaultCategoryName?: string;
      defaultSupplierName?: string;
      valid: true;
    }
  | (ShopAdminActionResult & { rowErrors: WorkbookRowError[]; valid: false }) {
  const rowErrors: WorkbookRowError[] = [];
  const defaultSupplierName = normalizeLabel(input.defaultSupplierName);
  const defaultCategoryName = normalizeLabel(input.defaultCategoryName);

  if (defaultSupplierName.length > 120) {
    rowErrors.push({
      field: "defaultSupplierName",
      message: "Default supplier name must be at most 120 characters.",
      row: 0,
      sheet: "Products",
    });
  }

  if (defaultCategoryName.length > 120) {
    rowErrors.push({
      field: "defaultCategoryName",
      message: "Default category name must be at most 120 characters.",
      row: 0,
      sheet: "Products",
    });
  }

  if (rowErrors.length > 0) {
    return {
      ...shopAdminActionResult("validation_failed", { ok: false }),
      rowErrors,
      valid: false,
    };
  }

  return {
    defaultCategoryName: defaultCategoryName || undefined,
    defaultSupplierName: defaultSupplierName || undefined,
    valid: true,
  };
}

function validateRowAdjustments(
  parsed: ParsedWorkbook,
  rawAdjustments?: string,
):
  | { adjustments: CatalogWorkbookRowAdjustment[]; valid: true }
  | (ShopAdminActionResult & { rowErrors: WorkbookRowError[]; valid: false }) {
  const raw = rawAdjustments?.trim();

  if (!raw) {
    return { adjustments: [], valid: true };
  }

  if (raw.length > MAX_ROW_ADJUSTMENTS_JSON_BYTES) {
    return {
      ...shopAdminActionResult("validation_failed", { ok: false }),
      valid: false,
      rowErrors: [
        {
          field: "rowAdjustments",
          message: "Row adjustments payload is too large.",
          row: 0,
          sheet: "Products",
        },
      ],
    };
  }

  let decoded: unknown;

  try {
    decoded = JSON.parse(raw);
  } catch {
    return {
      ...shopAdminActionResult("validation_failed", { ok: false }),
      valid: false,
      rowErrors: [
        {
          field: "rowAdjustments",
          message: "Row adjustments must be valid JSON.",
          row: 0,
          sheet: "Products",
        },
      ],
    };
  }

  if (!Array.isArray(decoded) || decoded.length > MAX_ROW_ADJUSTMENTS) {
    return {
      ...shopAdminActionResult("validation_failed", { ok: false }),
      valid: false,
      rowErrors: [
        {
          field: "rowAdjustments",
          message: `Row adjustments must contain at most ${MAX_ROW_ADJUSTMENTS} rows.`,
          row: 0,
          sheet: "Products",
        },
      ],
    };
  }

  const productsByRow = new Map(
    parsed.products.map((product) => [product.rowNumber, product]),
  );
  const seenRows = new Set<number>();
  const adjustments: CatalogWorkbookRowAdjustment[] = [];
  const rowErrors: WorkbookRowError[] = [];

  for (const entry of decoded) {
    const record = entry && typeof entry === "object"
      ? (entry as Record<string, unknown>)
      : {};
    const rowNumber = Number(record.rowNumber);
    const rowFingerprint =
      typeof record.rowFingerprint === "string" ? record.rowFingerprint : "";

    if (!Number.isInteger(rowNumber) || rowNumber <= 0) {
      rowErrors.push({
        field: "rowNumber",
        message: "Adjustment rowNumber must be a positive integer.",
        row: 0,
        sheet: "Products",
      });
      continue;
    }

    if (seenRows.has(rowNumber)) {
      rowErrors.push({
        field: "rowNumber",
        message: "duplicate rowNumber in rowAdjustments.",
        row: rowNumber,
        sheet: "Products",
      });
      continue;
    }

    seenRows.add(rowNumber);
    const product = productsByRow.get(rowNumber);

    if (!product) {
      rowErrors.push({
        field: "rowNumber",
        message: "Adjustment rowNumber does not exist in the parsed workbook.",
        row: rowNumber,
        sheet: "Products",
      });
      continue;
    }

    if (!rowFingerprint || rowFingerprint !== catalogImportRowFingerprint(product)) {
      rowErrors.push({
        field: "rowFingerprint",
        message: "Adjustment rowFingerprint does not match the parsed workbook row.",
        row: rowNumber,
        sheet: "Products",
      });
      continue;
    }

    const retailPrice = parseAdjustmentNumber(
      record.retailPrice,
      "retailPrice",
      rowNumber,
    );
    const stockQuantity = parseAdjustmentNumber(
      record.stockQuantity,
      "stockQuantity",
      rowNumber,
    );
    const supplierName = parseAdjustmentText(
      record.supplierName,
      "supplierName",
      rowNumber,
    );
    const categoryName = parseAdjustmentText(
      record.categoryName,
      "categoryName",
      rowNumber,
    );

    if (!retailPrice.ok) {
      rowErrors.push(retailPrice.error);
    }

    if (!stockQuantity.ok) {
      rowErrors.push(stockQuantity.error);
    }

    if (!supplierName.ok) {
      rowErrors.push(supplierName.error);
    }

    if (!categoryName.ok) {
      rowErrors.push(categoryName.error);
    }

    if (
      retailPrice.ok &&
      stockQuantity.ok &&
      supplierName.ok &&
      categoryName.ok &&
      (retailPrice.value !== undefined ||
        stockQuantity.value !== undefined ||
        supplierName.value !== undefined ||
        categoryName.value !== undefined)
    ) {
      adjustments.push({
        categoryName: categoryName.value,
        retailPrice: retailPrice.value,
        rowFingerprint,
        rowNumber,
        stockQuantity: stockQuantity.value,
        supplierName: supplierName.value,
      });
    }
  }

  if (rowErrors.length > 0) {
    return {
      ...shopAdminActionResult("validation_failed", { ok: false }),
      valid: false,
      rowErrors,
    };
  }

  return { adjustments, valid: true };
}

function applyRowAdjustments(
  parsed: ParsedWorkbook,
  adjustments: readonly CatalogWorkbookRowAdjustment[],
): ParsedWorkbook {
  if (adjustments.length === 0) {
    return parsed;
  }

  const adjustmentsByRow = new Map(
    adjustments.map((adjustment) => [adjustment.rowNumber, adjustment]),
  );
  const products = parsed.products.map((product) => {
    const adjustment = adjustmentsByRow.get(product.rowNumber);

    if (!adjustment) {
      return product;
    }

    return {
      ...product,
      retailPrice:
        adjustment.retailPrice === undefined || adjustment.retailPrice === null
          ? product.retailPrice
          : adjustment.retailPrice,
      stockQuantity:
        adjustment.stockQuantity === undefined ||
        adjustment.stockQuantity === null
          ? product.stockQuantity
          : adjustment.stockQuantity,
    };
  });

  return {
    ...parsed,
    products,
  };
}

function applySupplierWorkbookRows(
  parsed: ParsedWorkbook,
  adjustments: readonly CatalogWorkbookRowAdjustment[],
  readModel: Pick<
    Awaited<ReturnType<typeof getShopInventoryReadModel>>,
    "categories" | "products" | "suppliers"
  >,
  defaults: {
    defaultCategoryName?: string;
    defaultSupplierName?: string;
  } = {},
): ParsedWorkbook {
  const adjustmentsByRow = new Map(
    adjustments.map((adjustment) => [adjustment.rowNumber, adjustment]),
  );
  const defaultSupplierName = normalizeDefaultAssignment(
    defaults.defaultSupplierName,
  );
  const defaultCategoryName = normalizeDefaultAssignment(
    defaults.defaultCategoryName,
  );
  const products = parsed.products.map((product) => {
    const adjustment = adjustmentsByRow.get(product.rowNumber);
    const existing = findProduct(readModel.products, product);
    const manualSupplierName =
      maybeText(adjustment?.supplierName) ?? defaultSupplierName;
    const manualCategoryName =
      maybeText(adjustment?.categoryName) ?? defaultCategoryName;
    const supplierReferenceRow = manualSupplierName
      ? {
          ...product,
          supplierId: undefined,
          supplierName: manualSupplierName,
        }
      : product;
    const categoryReferenceRow = manualCategoryName
      ? {
          ...product,
          categoryId: undefined,
          categoryName: manualCategoryName,
        }
      : product;
    const supplierId = resolveSupplierIdForSupplierImport(
      supplierReferenceRow,
      existing,
      readModel.suppliers,
    );
    const categoryId = resolveCategoryIdForSupplierImport(
      categoryReferenceRow,
      existing,
      readModel.categories,
    );

    return {
      ...product,
      barcode: product.barcode || existing?.barcode || "",
      categoryId,
      categoryName: undefined,
      itemNumber:
        maybeText(product.itemNumber) ?? maybeText(existing?.itemNumber) ??
        undefined,
      productId: existing?.productId ?? product.productId,
      productName: product.productName || existing?.productName || "",
      purchasePrice:
        product.purchasePrice === undefined
          ? maybeNumber(existing?.purchasePrice)
          : product.purchasePrice,
      retailPrice:
        adjustment?.retailPrice === undefined || adjustment.retailPrice === null
          ? (existing ? maybeNumber(existing.retailPrice) : undefined)
          : adjustment.retailPrice,
      secondProductName:
        maybeText(product.secondProductName) ??
        maybeText(existing?.secondProductName) ??
        undefined,
      stockQuantity:
        adjustment?.stockQuantity === undefined ||
        adjustment.stockQuantity === null
          ? (existing ? maybeNumber(existing.stockQuantity) : undefined)
          : adjustment.stockQuantity,
      supplierId,
      supplierName: undefined,
    };
  });

  return {
    ...parsed,
    categories: [],
    priceHistory: [],
    products,
    suppliers: [],
    previewRows: parsedPreviewRows(products),
  };
}

function buildProductIdMaps(products: readonly ShopInventoryProduct[]) {
  return {
    byBarcode: new Map(
      products.map((product) => [product.barcode.toLowerCase(), product.productId]),
    ),
    byItemNumber: new Map(
      products
        .filter((product) => product.itemNumber)
        .map((product) => [
          product.itemNumber?.toLowerCase() ?? "",
          product.productId,
        ]),
    ),
    byProductId: new Set(products.map((product) => product.productId)),
  };
}

function rememberProductId(
  maps: ReturnType<typeof buildProductIdMaps>,
  row: ParsedProductRow,
  productId: string,
) {
  maps.byProductId.add(productId);

  if (row.barcode) {
    maps.byBarcode.set(row.barcode.toLowerCase(), productId);
  }

  if (row.itemNumber) {
    maps.byItemNumber.set(row.itemNumber.toLowerCase(), productId);
  }
}

function resolvePriceHistoryProductId(
  maps: ReturnType<typeof buildProductIdMaps>,
  row: ParsedPriceHistoryRow,
) {
  if (row.productId && maps.byProductId.has(row.productId)) {
    return row.productId;
  }

  if (row.productBarcode) {
    const byBarcode = maps.byBarcode.get(row.productBarcode.toLowerCase());

    if (byBarcode) {
      return byBarcode;
    }
  }

  if (row.productItemNumber) {
    return maps.byItemNumber.get(row.productItemNumber.toLowerCase());
  }

  return undefined;
}

function numberFromPayload(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function fetchCatalogExportRows<Row>(
  queryFactory: () => CatalogExportPagedQuery<Row>,
) {
  const rows: Row[] = [];

  for (let from = 0; ; from += BULK_PRICE_HISTORY_IMPORT_CHUNK_SIZE) {
    const result = await queryFactory().range(
      from,
      from + BULK_PRICE_HISTORY_IMPORT_CHUNK_SIZE - 1,
    );

    if (result.error) {
      return { error: result.error, rows };
    }

    const page = result.data ?? [];
    rows.push(...page);

    if (page.length < BULK_PRICE_HISTORY_IMPORT_CHUNK_SIZE) {
      return { error: null, rows };
    }
  }
}

function mapCatalogExportPrice(row: CatalogExportPriceRow): ShopInventoryPrice {
  return {
    createdAt: row.created_at,
    effectiveAt: row.effective_at,
    note: row.note,
    price: row.price,
    priceId: row.id,
    productId: row.product_id,
    source: row.source,
    type: row.type,
  };
}

function mergeCatalogExportPriceRows(
  shopRows: readonly CatalogExportPriceRow[],
  legacyRows: readonly CatalogExportPriceRow[],
) {
  const rows = [...shopRows];
  const seen = new Set(shopRows.map((row) => row.id));

  for (const row of legacyRows) {
    if (!seen.has(row.id)) {
      rows.push(row);
      seen.add(row.id);
    }
  }

  return rows;
}

async function fetchCatalogExportPriceRows(
  context: ReadyShopActionContext,
  legacyOwnerUserId: string | null,
) {
  const priceSelect =
    "id,shop_id,product_id,type,price,effective_at,note,source,created_at";
  const shopPricesResult = await fetchCatalogExportRows<CatalogExportPriceRow>(
    () =>
      context.supabase
        .from("inventory_product_prices")
        .select(priceSelect)
        .eq("shop_id", context.selectedShop.shopId)
        .order("created_at", {
          ascending: false,
        }) as unknown as CatalogExportPagedQuery<CatalogExportPriceRow>,
  );

  if (shopPricesResult.error) {
    return { error: shopPricesResult.error, prices: [] };
  }

  if (!legacyOwnerUserId) {
    return {
      error: null,
      prices: shopPricesResult.rows.map(mapCatalogExportPrice),
    };
  }

  const legacyPricesResult = await fetchCatalogExportRows<CatalogExportPriceRow>(
    () =>
      context.supabase
        .from("inventory_product_prices")
        .select(priceSelect)
        .is("shop_id", null)
        .eq("owner_user_id", legacyOwnerUserId)
        .order("created_at", {
          ascending: false,
        }) as unknown as CatalogExportPagedQuery<CatalogExportPriceRow>,
  );

  if (legacyPricesResult.error) {
    return { error: legacyPricesResult.error, prices: [] };
  }

  return {
    error: null,
    prices: mergeCatalogExportPriceRows(
      shopPricesResult.rows,
      legacyPricesResult.rows,
    ).map(mapCatalogExportPrice),
  };
}

function payloadRecord(data: unknown) {
  if (!data || typeof data !== "object" || !("payload" in data)) {
    return {};
  }

  const payload = data.payload;

  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function rpcResultOk(data: unknown) {
  if (!data || typeof data !== "object" || !("ok" in data)) {
    return true;
  }

  return (data as { ok?: unknown }).ok === true;
}

function* chunkRows<T>(rows: readonly T[], chunkSize: number) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    yield rows.slice(index, index + chunkSize);
  }
}

async function applyBulkProductImport(
  context: ReadyShopActionContext,
  rows: readonly ParsedProductRow[],
  existingProducts: readonly ShopInventoryProduct[],
  supplierIdsByName: ReadonlyMap<string, string>,
  categoryIdsByName: ReadonlyMap<string, string>,
  productIdMaps: ReturnType<typeof buildProductIdMaps>,
) {
  const productPayload: StaffAwareBulkProductImportPayload[] = rows.map((row) => {
    const existing = findProduct(existingProducts, row);
    const merged = mergeProductImportForApply(row, existing, {
      categoryIdsByName,
      supplierIdsByName,
    });

    return {
      barcode: merged.barcode,
      category_id: merged.categoryId,
      item_number: merged.itemNumber,
      product_id: row.productId ?? existing?.productId,
      product_name: merged.productName,
      purchase_price: merged.purchasePrice,
      retail_price: merged.retailPrice,
      second_product_name: merged.secondProductName,
      stock_quantity: merged.stockQuantity,
      supplier_id: merged.supplierId,
    };
  });

  if (context.principalKind === "pos_staff_manager") {
    const productImport = await applyStaffAwareBulkProductImport(
      context,
      productPayload,
    );

    for (const product of productImport.productIds) {
      productIdMaps.byProductId.add(product.productId);

      if (product.barcode) {
        productIdMaps.byBarcode.set(
          product.barcode.toLowerCase(),
          product.productId,
        );
      }

      if (product.itemNumber) {
        productIdMaps.byItemNumber.set(
          product.itemNumber.toLowerCase(),
          product.productId,
        );
      }
    }

    return productImport;
  }

  let failedRows = 0;
  let productsApplied = 0;
  const rowErrors: WorkbookRowError[] = [];

  for (const [chunkIndex, productChunk] of Array.from(chunkRows(
    productPayload,
    BULK_PRODUCT_IMPORT_CHUNK_SIZE,
  )).entries()) {
    const { data, error } = await context.supabase.rpc(
      "shop_catalog_import_products",
      {
        p_products: productChunk,
        p_shop_id: context.selectedShop.shopId,
      },
    );

    if (error) {
      failedRows += productChunk.length;
      rowErrors.push({
        field: "products",
        message:
          "Products import chunk failed before completion. Re-run preview before retrying.",
        row: chunkIndex + 1,
        sheet: "Products",
      });
      continue;
    }

    const payload = payloadRecord(data);
    const productIds = Array.isArray(payload.productIds)
      ? payload.productIds
      : [];

    for (const product of productIds) {
      if (!product || typeof product !== "object") {
        continue;
      }

      const row = product as Record<string, unknown>;
      const productId = typeof row.productId === "string" ? row.productId : "";
      const barcode = typeof row.barcode === "string" ? row.barcode : "";
      const itemNumber =
        typeof row.itemNumber === "string" ? row.itemNumber : "";

      if (!productId) {
        continue;
      }

      productIdMaps.byProductId.add(productId);

      if (barcode) {
        productIdMaps.byBarcode.set(barcode.toLowerCase(), productId);
      }

      if (itemNumber) {
        productIdMaps.byItemNumber.set(itemNumber.toLowerCase(), productId);
      }
    }

    const rpcFailedRows = numberFromPayload(payload.failedRows);
    const rpcProductsApplied = numberFromPayload(payload.productsApplied);
    const rpcOk = rpcResultOk(data);

    if (!rpcOk) {
      rowErrors.push({
        field: "products",
        message:
          "Products import chunk returned a failed result. Re-run preview before retrying.",
        row: chunkIndex + 1,
        sheet: "Products",
      });
    }

    failedRows += rpcOk || rpcFailedRows > 0 || rpcProductsApplied > 0
      ? rpcFailedRows
      : productChunk.length;
    productsApplied += rpcProductsApplied;
  }

  return {
    failedRows,
    productsApplied,
    rowErrors,
  };
}

async function auditImportExport(
  requestedShopId: string | undefined,
  permission: "catalog.import" | "catalog.export",
  eventKey: string,
  result: "success" | "blocked" | "failure",
  code: string,
  metadata: Json,
) {
  const context = await resolveShopActionContext(requestedShopId, permission);

  if (context.status !== "ready") {
    return context.result;
  }

  if (context.principalKind === "pos_staff_manager") {
    const auditEventId = await write_staff_shop_admin_audit(context, {
      code,
      eventKey,
      metadata: jsonRecordMetadata(metadata),
      result,
      severity: result === "failure" ? "critical" : "info",
      targetId: context.selectedShop.shopId,
      targetType: "shop",
    });

    return auditEventId
      ? shopAdminActionResult("success", {
          auditEventId,
          ok: true,
          shopId: context.selectedShop.shopId,
          targetId: context.selectedShop.shopId,
        })
      : shopAdminActionResult("db_failure", {
          ok: false,
          shopId: context.selectedShop.shopId,
        });
  }

  const { data, error } = await context.supabase.rpc("shop_admin_audit_event", {
    p_code: code,
    p_event_key: eventKey,
    p_metadata: metadata,
    p_result: result,
    p_shop_id: context.selectedShop.shopId,
  });

  return error
    ? shopAdminActionResult("db_failure", {
        ok: false,
        shopId: context.selectedShop.shopId,
      })
    : mapShopAdminRpcResult(data);
}

export async function parseCatalogWorkbookPreview(
  input: CatalogWorkbookInput,
): Promise<CatalogWorkbookPreview> {
  const context = await resolveShopActionContext(
    input.requestedShopId,
    "catalog.import",
  );

  if (context.status !== "ready") {
    return context.result;
  }

  const parsed = await parseWorkbook(input);

  if ("ok" in parsed) {
    return parsed;
  }

  const readModel = await getShopInventoryReadModel({
    client: context.supabase,
    requestedShopId: context.selectedShop.shopId,
    rowLimit: "all",
  });

  if (readModel.status !== "ready") {
    return shopAdminActionResult("unauthorized_or_unmapped", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const boundPreviewDigest = bindPreviewDigestToShop({
    mappingId: readModel.mapping?.mappingId ?? null,
    parsedDigest: parsed.digest,
    shopId: context.selectedShop.shopId,
  });
  const validation = validateCatalogImportRows(
    parsed,
    readModelAsExistingRows(readModel),
  );
  const priceHistoryRowErrors = validatePriceHistoryRows(parsed, readModel);
  const rawRowErrors = [
    ...parsed.rowErrors,
    ...validation.rowErrors,
    ...priceHistoryRowErrors,
  ];
  const rowErrors = parsed.importMode === "supplier"
    ? supplierVisibleRowErrors(rawRowErrors)
    : rawRowErrors;
  const rawRowWarnings = [
    ...parsed.rowWarnings,
    ...validation.rowWarnings,
    ...(parsed.importMode === "supplier"
      ? supplierReferenceWarnings(rawRowErrors)
      : []),
  ];
  const safetyNotes = rawRowWarnings.filter(isSafetySanitizationIssue);
  const rowWarnings = rawRowWarnings.filter(
    (issue) => !isSafetySanitizationIssue(issue),
  );
  const sheetSummaries = decorateSheetSummaries(
    parsed.sheetSummaries,
    rowErrors,
    rowWarnings,
  );
  const previewRows = decorateCatalogPreviewRows(
    parsed,
    rowErrors,
    rowWarnings,
    readModel,
  );
  const duplicates = rowErrors.filter((issue) =>
    (issue.code ?? "").startsWith("duplicate_"),
  ).length;
  const supplierChanges = supplierChangeSummary(parsed.suppliers, readModel);
  const categoryChanges = categoryChangeSummary(parsed.categories, readModel);
  const priceHistoryPurchase = parsed.priceHistory.filter(
    (row) => row.type === "PURCHASE",
  ).length;
  const priceHistoryRetail = parsed.priceHistory.filter(
    (row) => row.type === "RETAIL",
  ).length;
  const blockedRows = uniqueIssueRowCount(rowErrors);

  const auditResult = await auditImportExport(
    context.selectedShop.shopId,
    "catalog.import",
    "shop.catalog.import.preview",
    rowErrors.length > 0 ? "blocked" : "success",
    rowErrors.length > 0 ? "validation_failed" : "success",
    {
      confidence: parsed.confidence,
      detectedHeaderRow: parsed.detectedHeaderRow,
      digest: boundPreviewDigest,
      droppedRows: parsed.droppedRows,
      fileDigest: parsed.fileDigest,
      importMode: parsed.importMode,
      errors: rowErrors.length,
      "no_purge": true,
      priceHistory: parsed.priceHistory.length,
      products: parsed.products.length,
      "preview.valid": rowErrors.length === 0,
      selectedProductSheet: parsed.selectedProductSheet,
      safetySanitizations: safetyNotes.length,
      validRows: parsed.validRows,
      warnings: rowWarnings.length,
    },
  );

  if (!auditResult.ok) {
    return auditResult;
  }

  return {
    ...shopAdminActionResult(
      rowErrors.length > 0 ? "validation_failed" : "success",
      { ok: rowErrors.length === 0, shopId: context.selectedShop.shopId },
    ),
    confidence: parsed.confidence,
    detectedFormat: parsed.detectedFormat,
    detectedHeaderRow: parsed.detectedHeaderRow,
    detectedMapping: parsed.detectedMapping,
    originalColumns: parsed.originalColumns,
    previewDigest: boundPreviewDigest,
    previewRows,
    previewRowsTruncated: parsed.previewRowsTruncated,
    rawPreviewColumns: parsed.rawPreviewColumns,
    rawPreviewRows: parsed.rawPreviewRows,
    rawWorkbookContextRows: parsed.rawWorkbookContextRows,
    recognizedColumnSources: parsed.recognizedColumnSources,
    rowErrors,
    rowWarnings,
    safetyNotes,
    selectedProductSheet: parsed.selectedProductSheet,
    sheetSummaries,
    summary: {
      ...validation.summary,
      blockedRows,
      duplicates,
      droppedRows: parsed.droppedRows,
      errors: rowErrors.length,
      newCategories: categoryChanges.newCategories,
      newSuppliers: supplierChanges.newSuppliers,
      operationalWarnings: rowWarnings.length,
      priceHistory: parsed.priceHistory.length,
      priceHistoryPurchase,
      priceHistoryRetail,
      safetySanitizations: safetyNotes.length,
      updatedCategories: categoryChanges.updatedCategories,
      updatedSuppliers: supplierChanges.updatedSuppliers,
      validRows: parsed.validRows,
      warnings: rowWarnings.length,
    },
    unmappedColumns: parsed.unmappedColumns,
    workbookMetadata: parsed.workbookMetadata,
  };
}

export async function applyCatalogWorkbookImport(
  input: CatalogWorkbookInput & {
    confirmApply: string;
    defaultCategoryName?: string;
    defaultSupplierName?: string;
    previewDigest: string;
    rowAdjustments?: string;
  },
): Promise<CatalogWorkbookApplyResult> {
  const context = await resolveShopActionContext(
    input.requestedShopId,
    "catalog.import",
  );

  if (context.status !== "ready") {
    return context.result;
  }

  const normalizedConfirmation = input.confirmApply.trim().toUpperCase();

  const importMode = normalizeImportMode(input.importMode);
  const requiredConfirmation =
    importMode === "database" ? "IMPORT DATABASE" : "APPLY";

  if (normalizedConfirmation !== requiredConfirmation) {
    return shopAdminActionResult("preview_required", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const defaultValidation = validateDefaultAssignments({
    defaultCategoryName: input.defaultCategoryName,
    defaultSupplierName: input.defaultSupplierName,
  });

  if (!defaultValidation.valid) {
    return defaultValidation;
  }

  const parsed = await parseWorkbook(input);

  if ("ok" in parsed) {
    return parsed;
  }

  const readModel = await getShopInventoryReadModel({
    client: context.supabase,
    requestedShopId: context.selectedShop.shopId,
    rowLimit: "all",
  });

  if (readModel.status !== "ready") {
    return shopAdminActionResult("unauthorized_or_unmapped", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const boundPreviewDigest = bindPreviewDigestToShop({
    mappingId: readModel.mapping?.mappingId ?? null,
    parsedDigest: parsed.digest,
    shopId: context.selectedShop.shopId,
  });

  if (!input.previewDigest || input.previewDigest !== boundPreviewDigest) {
    return shopAdminActionResult("preview_mismatch", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const adjustmentValidation = validateRowAdjustments(
    parsed,
    input.rowAdjustments,
  );

  if (!adjustmentValidation.valid) {
    return {
      ...adjustmentValidation,
      previewDigest: boundPreviewDigest,
    };
  }

  const adjustedParsed = parsed.importMode === "supplier"
    ? applySupplierWorkbookRows(
      parsed,
      adjustmentValidation.adjustments,
      readModel,
      {
        defaultCategoryName: defaultValidation.defaultCategoryName,
        defaultSupplierName: defaultValidation.defaultSupplierName,
      },
    )
    : applyRowAdjustments(parsed, adjustmentValidation.adjustments);

  if (adjustedParsed.rowErrors.length > 0) {
    return {
      ...shopAdminActionResult("validation_failed", {
        ok: false,
        shopId: context.selectedShop.shopId,
      }),
      previewDigest: boundPreviewDigest,
      rowErrors: adjustedParsed.rowErrors,
    };
  }

  const validation = validateCatalogImportRows(
    adjustedParsed,
    readModelAsExistingRows(readModel),
  );
  const priceHistoryRowErrors = validatePriceHistoryRows(adjustedParsed, readModel);
  const rawRowErrors = [
    ...adjustedParsed.rowErrors,
    ...validation.rowErrors,
    ...priceHistoryRowErrors,
  ];
  const rowErrors = adjustedParsed.importMode === "supplier"
    ? supplierVisibleRowErrors(rawRowErrors)
    : rawRowErrors;

  if (rowErrors.length > 0) {
    return {
      ...shopAdminActionResult("validation_failed", {
        ok: false,
        shopId: context.selectedShop.shopId,
      }),
      previewDigest: boundPreviewDigest,
      rowErrors,
    };
  }

  const supplierIdsByName = new Map(
    readModel.suppliers.map((supplier) => [
      supplier.name.toLowerCase(),
      supplier.supplierId,
    ]),
  );
  const categoryIdsByName = new Map(
    readModel.categories.map((category) => [
      category.name.toLowerCase(),
      category.categoryId,
    ]),
  );
  const productIdMaps = buildProductIdMaps(readModel.products);
  let suppliersApplied = 0;
  let categoriesApplied = 0;
  let productsApplied = 0;
  let priceHistoryApplied = 0;
  let failedRows = 0;
  const applyRowErrors: WorkbookRowError[] = [];

  for (const row of adjustedParsed.suppliers) {
    const existing = findSupplier(readModel.suppliers, row);
    const result = existing
      ? await updateSupplier({
          id: existing.supplierId,
          name: row.name,
          requestedShopId: context.selectedShop.shopId,
        })
      : await createSupplier({
          name: row.name,
          requestedShopId: context.selectedShop.shopId,
        });

    if (result.ok && result.targetId) {
      supplierIdsByName.set(row.name.toLowerCase(), result.targetId);
      suppliersApplied += 1;
    } else {
      failedRows += 1;
    }
  }

  for (const row of adjustedParsed.categories) {
    const existing = findCategory(readModel.categories, row);
    const result = existing
      ? await updateCategory({
          id: existing.categoryId,
          name: row.name,
          requestedShopId: context.selectedShop.shopId,
        })
      : await createCategory({
          name: row.name,
          requestedShopId: context.selectedShop.shopId,
        });

    if (result.ok && result.targetId) {
      categoryIdsByName.set(row.name.toLowerCase(), result.targetId);
      categoriesApplied += 1;
    } else {
      failedRows += 1;
    }
  }

  if (adjustedParsed.products.length >= BULK_PRODUCT_IMPORT_THRESHOLD) {
    const productImport = await applyBulkProductImport(
      context,
      adjustedParsed.products,
      readModel.products,
      supplierIdsByName,
      categoryIdsByName,
      productIdMaps,
    );

    productsApplied += productImport.productsApplied;
    failedRows += productImport.failedRows;
    applyRowErrors.push(...productImport.rowErrors);
  } else {
    for (const row of adjustedParsed.products) {
      const existing = findProduct(readModel.products, row);
      const productInput: ProductMutationInput = {
        ...mergeProductImportForApply(row, existing, {
          categoryIdsByName,
          supplierIdsByName,
        }),
        requestedShopId: context.selectedShop.shopId,
      };
      const result = existing
        ? await updateProduct({
            ...productInput,
            productId: existing.productId,
          })
        : await createProduct(productInput);

      if (result.ok) {
        const appliedProductId =
          result.targetId ?? existing?.productId ?? row.productId;

        if (appliedProductId) {
          rememberProductId(productIdMaps, row, appliedProductId);
        }

        productsApplied += 1;
      } else {
        failedRows += 1;
      }
    }
  }

  if (adjustedParsed.priceHistory.length > 0) {
    const pricePayload: StaffAwareBulkPriceHistoryImportPayload[] =
      adjustedParsed.priceHistory
      .map((row) => {
        const productId = resolvePriceHistoryProductId(productIdMaps, row);

        if (!productId) {
          failedRows += 1;
          applyRowErrors.push({
            field: "product",
            message:
              "PriceHistory product reference could not be resolved after product import.",
            row: row.rowNumber,
            sheet: "PriceHistory",
          });
          return null;
        }

        return {
          created_at: row.createdAt,
          effective_at: row.effectiveAt,
          note: row.note,
          price: row.price,
          price_id: row.priceId,
          product_id: productId,
          source: row.source,
          type: row.type,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (context.principalKind === "pos_staff_manager") {
      const priceImport = await applyStaffAwareBulkPriceHistoryImport(
        context,
        pricePayload,
      );

      priceHistoryApplied += priceImport.priceHistoryApplied;
      failedRows += priceImport.failedRows;
      applyRowErrors.push(...priceImport.rowErrors);
    } else {
      for (const priceChunk of chunkRows(
        pricePayload,
        BULK_PRICE_HISTORY_IMPORT_CHUNK_SIZE,
      )) {
        if (priceChunk.length === 0) {
          continue;
        }

        const { data, error } = await context.supabase.rpc(
          "shop_catalog_import_price_history",
          {
            p_prices: priceChunk,
            p_shop_id: context.selectedShop.shopId,
          },
        );

        if (error) {
          failedRows += priceChunk.length;
          applyRowErrors.push({
            field: "priceHistory",
            message:
              "Price history import chunk failed before completion. Re-run preview before retrying.",
            row: 0,
            sheet: "PriceHistory",
          });
        } else {
          const payload = payloadRecord(data);
          const rpcFailedRows = numberFromPayload(payload.failedRows);
          const rpcPriceHistoryApplied = numberFromPayload(
            payload.priceHistoryApplied,
          );
          const rpcOk = rpcResultOk(data);

          priceHistoryApplied += rpcPriceHistoryApplied;
          if (!rpcOk) {
            applyRowErrors.push({
              field: "priceHistory",
              message:
                "Price history import chunk returned a failed result. Re-run preview before retrying.",
              row: 0,
              sheet: "PriceHistory",
            });
          }
          failedRows += rpcOk || rpcFailedRows > 0 || rpcPriceHistoryApplied > 0
            ? rpcFailedRows
            : priceChunk.length;
        }
      }
    }
  }

  const auditResult = await auditImportExport(
    context.selectedShop.shopId,
    "catalog.import",
    "shop.catalog.import.apply",
    failedRows > 0 ? "failure" : "success",
    failedRows > 0 ? "partial_failure" : "success",
    {
      categoriesApplied,
      digest: boundPreviewDigest,
      failedRows,
      "no_purge": true,
      priceHistoryApplied,
      productsApplied,
      "preview.valid": true,
      rowAdjustments: adjustmentValidation.adjustments.length,
      suppliersApplied,
    },
  );

  const summary = {
    categoriesApplied,
    failedRows,
    priceHistoryApplied,
    productsApplied,
    suppliersApplied,
  };

  if (!auditResult.ok) {
    return {
      ...auditResult,
      previewDigest: boundPreviewDigest,
      summary,
    };
  }

  let historyEntry: CatalogWorkbookApplyResult["historyEntry"];

  if (
    adjustedParsed.importMode === "supplier" &&
    failedRows === 0 &&
    adjustedParsed.products.length > 0
  ) {
    const historyResult = await upsertSupplierImportHistoryEntry({
      appliedAt: new Date(),
      categoryName: defaultValidation.defaultCategoryName,
      context,
      fileName: input.fileName,
      previewDigest: boundPreviewDigest,
      rows: supplierImportHistoryRows(adjustedParsed.products, readModel),
      supplierName: defaultValidation.defaultSupplierName,
    });

    if (!historyResult.ok) {
      return {
        ...shopAdminActionResult("partial_failure", {
          ok: false,
          shopId: context.selectedShop.shopId,
          targetId: historyResult.remoteId,
        }),
        previewDigest: boundPreviewDigest,
        rowErrors: [
          ...applyRowErrors,
          {
            code: historyResult.code,
            field: "historyEntry",
            message:
              "Supplier import was applied, but the canonical History Entry could not be created.",
            row: 0,
            sheet: "History",
          },
        ],
        summary,
      };
    }

    historyEntry = {
      action: historyResult.action,
      displayName: historyResult.displayName,
      href: historyResult.href,
      remoteId: historyResult.remoteId,
      rowCount: historyResult.rowCount,
    };
  }

  return {
    ...shopAdminActionResult(failedRows > 0 ? "partial_failure" : "success", {
      ok: failedRows === 0,
      shopId: context.selectedShop.shopId,
    }),
    historyEntry,
    previewDigest: boundPreviewDigest,
    rowErrors: applyRowErrors,
    summary,
  };
}

function stringCell(value: string | null | undefined) {
  return sanitizeSpreadsheetCell(value ?? "");
}

function productSheet(products: readonly ShopInventoryProduct[]): WritableSheetData {
  return [
    [
      "product_id",
      "barcode",
      "product_name",
      "second_product_name",
      "item_number",
      "supplier_id",
      "category_id",
      "retail_price",
      "purchase_price",
      "stock_quantity",
      "updated_at",
    ],
    ...products.map((product) => [
      product.productId,
      stringCell(product.barcode),
      stringCell(product.productName),
      stringCell(product.secondProductName),
      stringCell(product.itemNumber),
      product.supplierId ?? "",
      product.categoryId ?? "",
      product.retailPrice,
      product.purchasePrice,
      product.stockQuantity,
      product.updatedAt,
    ]),
  ];
}

function supplierSheet(suppliers: readonly ShopInventorySupplier[]): WritableSheetData {
  return [
    ["supplier_id", "name", "updated_at"],
    ...suppliers.map((supplier) => [
      supplier.supplierId,
      stringCell(supplier.name),
      supplier.updatedAt,
    ]),
  ];
}

function categorySheet(categories: readonly ShopInventoryCategory[]): WritableSheetData {
  return [
    ["category_id", "name", "updated_at"],
    ...categories.map((category) => [
      category.categoryId,
      stringCell(category.name),
      category.updatedAt,
    ]),
  ];
}

export async function buildCatalogWorkbookExport(
  requestedShopId?: string,
): Promise<CatalogWorkbookExport> {
  const context = await resolveShopActionContext(requestedShopId, "catalog.export");

  if (context.status !== "ready") {
    return context.result;
  }

  const readModel = await getShopInventoryReadModel({
    client: context.supabase,
    requestedShopId: context.selectedShop.shopId,
    rowLimit: "all",
  });

  if (readModel.status !== "ready") {
    return shopAdminActionResult("unauthorized_or_unmapped", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const exportPrices = await fetchCatalogExportPriceRows(
    context,
    readModel.legacyOwnerUserId,
  );

  if (exportPrices.error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const buffer = await writeXlsxFile([
    { data: productSheet(readModel.products), sheet: "Products" },
    { data: supplierSheet(readModel.suppliers), sheet: "Suppliers" },
    { data: categorySheet(readModel.categories), sheet: "Categories" },
    {
      data: [
        [
          "price_id",
          "product_id",
          "type",
          "price",
          "effective_at",
          "source",
          "note",
        ],
        ...exportPrices.prices.map((price) => [
          price.priceId,
          price.productId,
          stringCell(price.type),
          price.price,
          price.effectiveAt,
          stringCell(price.source),
          stringCell(price.note),
        ]),
      ],
      sheet: "PriceHistory",
    },
  ]).toBuffer();

  const auditResult = await auditImportExport(
    context.selectedShop.shopId,
    "catalog.export",
    "shop.catalog.export",
    "success",
    "success",
    {
      categories: readModel.categories.length,
      priceHistory: exportPrices.prices.length,
      products: readModel.products.length,
      suppliers: readModel.suppliers.length,
    },
  );

  if (!auditResult.ok) {
    return auditResult;
  }

  return {
    ...shopAdminActionResult("success", {
      ok: true,
      shopId: context.selectedShop.shopId,
    }),
    buffer,
    contentType: XLSX_CONTENT_TYPE,
    fileName: "shop-catalog-export.xlsx",
  };
}

export async function buildCatalogImportTemplate(): Promise<CatalogWorkbookExport> {
  const sheets = EXCEL_WORKBOOK_SHEETS.map((sheet) => {
    if (sheet === "Products") {
      return {
        data: [
          [
            "product_id",
            "barcode",
            "product_name",
            "second_product_name",
            "item_number",
            "supplier_id",
            "supplier_name",
            "category_id",
            "category_name",
            "retail_price",
            "purchase_price",
            "stock_quantity",
          ],
        ],
        sheet,
      };
    }

    if (sheet === "Suppliers") {
      return {
        data: [["supplier_id", "name"]],
        sheet,
      };
    }

    if (sheet === "Categories") {
      return {
        data: [["category_id", "name"]],
        sheet,
      };
    }

    return {
      data: [
        [
          "price_id",
          "product_id",
          "productBarcode",
          "timestamp",
          "type",
          "oldPrice",
          "newPrice",
          "source",
          "note",
        ],
      ],
      sheet,
    };
  });
  const buffer = await writeXlsxFile(sheets).toBuffer();

  return {
    ...shopAdminActionResult("success", { ok: true }),
    buffer,
    contentType: XLSX_CONTENT_TYPE,
    fileName: "shop-catalog-import-template.xlsx",
  };
}
