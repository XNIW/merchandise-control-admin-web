import "server-only";

import { createHash } from "node:crypto";
import { DOMParser, type Element as XmlElement } from "@xmldom/xmldom";
import * as SheetJS from "@e965/xlsx";
import readXlsxFile, { type SheetData } from "read-excel-file/node";
import * as unzipper from "unzipper-esm";
import writeXlsxFile, {
  type SheetData as WritableSheetData,
} from "write-excel-file/node";
import type { Json } from "@/lib/supabase/database.types";
import {
  CATALOG_TEXT_LIMITS,
  canonicalizeCatalogDisplayText,
  catalogTextReasonMessage,
  validateCatalogIdentityText,
} from "@/lib/catalog-text-policy";
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
  type ShopAdminActionCode,
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
  type ShopInventoryReadModel,
  type ShopInventoryPrice,
  type ShopInventoryProduct,
  type ShopInventorySupplier,
} from "./inventory-read-model";
import {
  applyStaffAwareBulkProductImport,
  applyStaffAwareBulkPriceHistoryImport,
  write_staff_shop_admin_audit,
  type StaffAwareBulkPriceHistoryImportPayload,
  type StaffAwareBulkProductImportPayload,
} from "./staff-aware-mutations";
import { callStaffWebCatalogRead } from "./staff-web-lease-bound-rpc";
import {
  emitCatalogBulkProductImportSyncEvent,
  emitPriceHistoryImportSyncEvent,
} from "./sync-event-writer";
import { upsertSupplierImportHistoryEntry } from "./history-mutations";
import {
  formatMobileHistoryTimestamp,
  type SupplierImportHistoryGridRow,
} from "./supplier-import-history-entry-contract";
import {
  CATALOG_WORKBOOK_EXPORT_LIMITS,
  CatalogWorkbookExportResourceError,
  collectBoundedWorkbookPages,
  createCatalogWorkbookExportResourceEnvelope,
  finalizeBoundedWorkbookExport,
  type CatalogWorkbookExportMetrics,
} from "./workbook-export-resource-envelope";

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
// Supplier/category writes intentionally remain row-scoped for their detailed
// audit semantics. Keep their worst-case event contribution below the 10k
// recovery scan budget; products/prices are transactionally aggregated.
const MAX_IMPORT_DIMENSION_EVENT_ROWS = 5_000;
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
const SUPPLIER_ALWAYS_EXCLUDED_MAPPING_FIELDS = new Set<CatalogImportField>();
const SUPPLIER_DEFAULT_EXCLUDED_MAPPING_FIELDS = new Set<CatalogImportField>();
const NUMERIC_COMPATIBLE_MAPPING_FIELDS = new Set<CatalogImportField>([
  "discount",
  "discountedPrice",
  "oldPurchasePrice",
  "oldRetailPrice",
  "realQuantity",
  "totalPrice",
  "purchasePrice",
  "quantity",
]);
type CatalogWorkbookReadResource = Pick<
  ReturnType<typeof createCatalogWorkbookExportResourceEnvelope>,
  "assertCounts" | "assertPreflight" | "observeConcurrency" | "run" | "signal"
>;
const unboundedCatalogWorkbookReadSignal = new AbortController().signal;
const unboundedCatalogWorkbookReadResource: CatalogWorkbookReadResource = {
  assertCounts() {},
  assertPreflight() {},
  observeConcurrency() {},
  async run(operation) {
    return await operation(new AbortController().signal);
  },
  signal: unboundedCatalogWorkbookReadSignal,
};

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
  defaultCategoryName?: string;
  defaultSupplierName?: string;
  requestedShopId?: string;
  rowAdjustments?: string;
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
  category?: string;
  currentPurchasePrice?: number;
  currentRetailPrice?: number;
  currentQuantity?: number;
  itemNumber?: string;
  productName: string;
  recognizedDiscount?: number;
  recognizedDiscountedPrice?: number;
  recognizedTotalPrice?: number;
  recognizedPurchasePrice?: number;
  recognizedQuantity?: number;
  recognizedRetailPrice?: number;
  retailPrice?: number;
  rowFingerprint: string;
  rowNumber: number;
  secondProductName?: string;
  status: "Ready" | "Warning" | "Blocked" | "Duplicate" | "Update" | "New";
  quantity?: number;
  supplier?: string;
  totalPrice?: number;
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
  barcode?: string;
  category?: string;
  itemNumber?: string;
  purchasePrice?: number | null;
  productName?: string;
  quantity?: number | null;
  rawBarcode?: string;
  rawItemNumber?: string;
  retailPrice?: number | null;
  rowFingerprint: string;
  rowNumber: number;
  secondProductName?: string;
  skip?: boolean;
  supplier?: string;
};

export type CatalogWorkbookSyncDiff = {
  after: string | number | null;
  before: string | number | null;
  field: CatalogImportField;
};

export type CatalogWorkbookSyncProductRow = {
  barcode: string;
  category?: string;
  itemNumber?: string;
  productName: string;
  purchasePrice?: number | null;
  quantity?: number | null;
  retailPrice?: number | null;
  rowNumber: number;
  secondProductName?: string;
  supplier?: string;
};

export type CatalogWorkbookSyncUpdateRow = {
  barcode: string;
  diffs: CatalogWorkbookSyncDiff[];
  existing: CatalogWorkbookSyncProductRow;
  rowNumber: number;
  updated: CatalogWorkbookSyncProductRow;
};

export type CatalogWorkbookSyncSkippedRow = {
  barcode: string;
  itemNumber?: string;
  productName?: string;
  rowNumber: number;
};

export type CatalogWorkbookSyncPreview = {
  canApply: boolean;
  errors: WorkbookRowError[];
  fingerprint: string;
  newProducts: CatalogWorkbookSyncProductRow[];
  noChangeRows: CatalogWorkbookSyncProductRow[];
  skippedRows: CatalogWorkbookSyncSkippedRow[];
  summary: {
    errors: number;
    newProducts: number;
    noChangeRows: number;
    nonSkippedRows: number;
    skippedRows: number;
    totalRows: number;
    updatedProducts: number;
    warnings: number;
  };
  updatedProducts: CatalogWorkbookSyncUpdateRow[];
  warnings: WorkbookRowError[];
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
  syncPreview?: CatalogWorkbookSyncPreview;
  syncPreviewDigest?: string;
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
    textNormalizations?: number;
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
  metrics?: CatalogWorkbookExportMetrics;
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
    quantity: row.quantity ?? row.stockQuantity ?? null,
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
  const lowerMimeType = input.mimeType.toLowerCase();
  const mimeOk =
    WORKBOOK_MIME_TYPES.has(lowerMimeType) ||
    lowerMimeType === "" ||
    lowerMimeType === "application/octet-stream";
  const signatureOk = workbookKindFromBytes(input.bytes) !== "unknown";

  if (input.bytes.byteLength > MAX_IMPORT_BYTES) {
    return shopAdminActionResult("file_too_large", { ok: false });
  }

  if ((!extensionOk && !signatureOk) || !mimeOk) {
    return shopAdminActionResult("invalid_file_type", { ok: false });
  }

  return null;
}

function isLegacyWorkbookName(fileName: string) {
  return fileName.toLowerCase().endsWith(".xls");
}

function workbookKindFromBytes(bytes: Buffer) {
  if (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    return "xlsx";
  }
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1
  ) {
    return "xls";
  }
  return "unknown";
}

function isLegacyWorkbook(input: CatalogWorkbookInput) {
  return isLegacyWorkbookName(input.fileName) || workbookKindFromBytes(input.bytes) === "xls";
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

  return String(value ?? "");
}

const PRODUCT_BOUNDARY_HEADER_ALIASES = {
  categoryId: ["category_id", "categoria_id", "id_categoria"],
  productId: ["product_id", "id"],
  supplierId: ["supplier_id", "proveedor_id", "id_proveedor"],
} as const;

function productBoundaryTextValue(
  rows: SheetData,
  detection: NonNullable<ReturnType<typeof detectCatalogImportHeaderRow>>,
  row: readonly unknown[],
  field: keyof typeof PRODUCT_BOUNDARY_HEADER_ALIASES,
) {
  if (detection.headerRowIndex === null) {
    return "";
  }

  const headerRow = rows[detection.headerRowIndex];
  const aliases = new Set(
    PRODUCT_BOUNDARY_HEADER_ALIASES[field].map((alias) =>
      normalizeCatalogImportHeader(alias),
    ),
  );
  const columnIndex = headerRow.findIndex((cell) =>
    aliases.has(normalizeCatalogImportHeader(cell)),
  );

  return columnIndex < 0 ? "" : String(row[columnIndex] ?? "");
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
  const clean = value.trim().replace(/\s+/g, "");

  if (!clean) {
    return Number.NaN;
  }

  if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(clean)) {
    return Number(clean.replace(/\./g, "").replace(",", "."));
  }

  if (/^-?\d{1,3}(,\d{3})*\.\d+$/.test(clean)) {
    return Number(clean.replace(/,/g, ""));
  }

  if (/^-?[1-9]\d{0,2}(,\d{3})+$/.test(clean)) {
    return Number(clean.replace(/,/g, ""));
  }

  if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(clean)) {
    return Number(clean.replace(/\./g, ""));
  }

  return Number(clean.replace(",", "."));
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
      return String(row[index] ?? "");
    }
  }

  return "";
}

const CATALOG_TEXT_NORMALIZED_CODE = "catalog_text_normalized";
const CATALOG_TEXT_NORMALIZED_MESSAGE =
  "Spaces or hidden line breaks normalized.";

function catalogWorkbookDisplayText(input: {
  field: string;
  maxLength: number;
  required: boolean;
  row: number;
  rowErrors: WorkbookRowError[];
  rowWarnings: WorkbookRowError[];
  sheet: string;
  value: string;
}) {
  const result = canonicalizeCatalogDisplayText(input.value, {
    maxLength: input.maxLength,
    required: input.required,
  });

  if (result.status === "rejected") {
    input.rowErrors.push({
      code: `catalog_text_${result.reason}`,
      field: input.field,
      message: catalogTextReasonMessage(result.reason),
      row: input.row,
      sheet: input.sheet,
    });
    return "";
  }

  if (result.status === "normalized") {
    input.rowWarnings.push({
      code: CATALOG_TEXT_NORMALIZED_CODE,
      field: input.field,
      message: CATALOG_TEXT_NORMALIZED_MESSAGE,
      row: input.row,
      sheet: input.sheet,
    });
  }

  return result.value;
}

function catalogWorkbookIdentityText(input: {
  field: string;
  maxLength: number;
  required: boolean;
  row: number;
  rowErrors: WorkbookRowError[];
  rowWarnings: WorkbookRowError[];
  sheet: string;
  value: string;
}) {
  const result = validateCatalogIdentityText(input.value, {
    maxLength: input.maxLength,
    required: input.required,
  });

  if (result.status === "rejected") {
    input.rowErrors.push({
      code: `catalog_text_${result.reason}`,
      field: input.field,
      message: catalogTextReasonMessage(result.reason),
      row: input.row,
      sheet: input.sheet,
    });
    return "";
  }

  if (result.status === "normalized") {
    input.rowWarnings.push({
      code: CATALOG_TEXT_NORMALIZED_CODE,
      field: input.field,
      message: CATALOG_TEXT_NORMALIZED_MESSAGE,
      row: input.row,
      sheet: input.sheet,
    });
  }

  return result.value;
}

function parseSuppliers(
  rows: SheetData,
  rowErrors: WorkbookRowError[],
  rowWarnings: WorkbookRowError[],
) {
  const headers = headerMap(rows);
  const parsed: ParsedSupplierRow[] = [];

  for (const { row, rowNumber } of nonEmptyRows(rows)) {
    const name = catalogWorkbookDisplayText({
      field: "name",
      maxLength: CATALOG_TEXT_LIMITS.supplierName,
      required: true,
      row: rowNumber,
      rowErrors,
      rowWarnings,
      sheet: "Suppliers",
      value: textValue(headers, row, [
        "name",
        "nombre",
        "supplier_name",
        "supplier",
        "proveedor",
        "fornitore",
        "vendor",
        "provider",
      ]),
    });
    const supplierId = catalogWorkbookIdentityText({
      field: "supplierId",
      maxLength: 256,
      required: false,
      row: rowNumber,
      rowErrors,
      rowWarnings,
      sheet: "Suppliers",
      value: textValue(headers, row, ["supplier_id", "id"]),
    });

    if (!name) {
      continue;
    }

    parsed.push({ name, rowNumber, supplierId: supplierId || undefined });
  }

  return parsed;
}

function parseCategories(
  rows: SheetData,
  rowErrors: WorkbookRowError[],
  rowWarnings: WorkbookRowError[],
) {
  const headers = headerMap(rows);
  const parsed: ParsedCategoryRow[] = [];

  for (const { row, rowNumber } of nonEmptyRows(rows)) {
    const name = catalogWorkbookDisplayText({
      field: "name",
      maxLength: CATALOG_TEXT_LIMITS.categoryName,
      required: true,
      row: rowNumber,
      rowErrors,
      rowWarnings,
      sheet: "Categories",
      value: textValue(headers, row, [
        "name",
        "nombre",
        "category_name",
        "category",
        "categoria",
        "categoría",
        "department",
        "reparto",
      ]),
    });
    const categoryId = catalogWorkbookIdentityText({
      field: "categoryId",
      maxLength: 256,
      required: false,
      row: rowNumber,
      rowErrors,
      rowWarnings,
      sheet: "Categories",
      value: textValue(headers, row, ["category_id", "id"]),
    });

    if (!name) {
      continue;
    }

    parsed.push({ categoryId: categoryId || undefined, name, rowNumber });
  }

  return parsed;
}

function workbookDateText(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? ""
      : formatMobileHistoryTimestamp(value);
  }

  if (typeof value === "number" && value > 20_000 && value < 80_000) {
    const date = new Date(Math.round((value - 25569) * 86_400_000));

    return formatMobileHistoryTimestamp(date);
  }

  const normalized = normalizeWorkbookText(value);

  if (!normalized) {
    return "";
  }

  const legacyMatch = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,
  );

  if (legacyMatch) {
    const [, year, month, day, hour, minute, second] = legacyMatch;
    const parsed = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      ),
    );

    return formatMobileHistoryTimestamp(parsed) === normalized ? normalized : "";
  }

  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      normalized,
    )
  ) {
    const parsed = new Date(normalized);

    return Number.isNaN(parsed.getTime())
      ? ""
      : formatMobileHistoryTimestamp(parsed);
  }

  return "";
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

  const scaled = numeric * 1_000;
  const hasSubMillPrecision =
    Number.isFinite(scaled) &&
    Math.abs(scaled - Math.round(scaled)) >
      Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;

  if (
    !Number.isFinite(numeric) ||
    numeric < 0 ||
    numeric > 999_999_999_999.999 ||
    hasSubMillPrecision
  ) {
    rowErrors.push({
      field,
      message:
        "Value must be a non-negative finite number with at most three decimal places.",
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
  rowWarnings: WorkbookRowError[],
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
    const productId = catalogWorkbookIdentityText({
      field: "productId",
      maxLength: 256,
      required: false,
      row: rowNumber,
      rowErrors,
      rowWarnings,
      sheet,
      value: textValue(headers, row, ["product_id", "productId"]),
    });
    const productBarcode = catalogWorkbookIdentityText({
      field: "productBarcode",
      maxLength: CATALOG_TEXT_LIMITS.barcode,
      required: false,
      row: rowNumber,
      rowErrors,
      rowWarnings,
      sheet,
      value: textValue(headers, row, [
        "productBarcode",
        "product_barcode",
        "barcode",
        "codigo_de_barras",
        "código de barras",
      ]),
    });
    const productItemNumber = catalogWorkbookIdentityText({
      field: "productItemNumber",
      maxLength: CATALOG_TEXT_LIMITS.itemNumber,
      required: false,
      row: rowNumber,
      rowErrors,
      rowWarnings,
      sheet,
      value: textValue(headers, row, [
        "productItemNumber",
        "product_item_number",
        "item_number",
        "sku",
        "codigo_del_articulo",
        "código del artículo",
      ]),
    });
    const priceId = catalogWorkbookIdentityText({
      field: "priceId",
      maxLength: 256,
      required: false,
      row: rowNumber,
      rowErrors,
      rowWarnings,
      sheet,
      value: textValue(headers, row, ["price_id", "id"]),
    });
    const source = catalogWorkbookIdentityText({
      field: "source",
      maxLength: 256,
      required: false,
      row: rowNumber,
      rowErrors,
      rowWarnings,
      sheet,
      value: textValue(headers, row, ["source", "fuente"]),
    });
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
    isValidProductBarcode(barcode) ||
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
  const digits = barcodeDigits(value);

  return digits.length === 8 || digits.length === 12 || digits.length === 13;
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
const legacyDetectedMappingFields = new Set([
  "categoryName",
  "lineTotal",
  "stockQuantity",
  "supplierName",
]);

function detectionMapping(
  rows: SheetData,
  detection: NonNullable<ReturnType<typeof detectCatalogImportHeaderRow>>,
) {
  const headerRow = detection.headerRowIndex === null
    ? []
    : (rows[detection.headerRowIndex] ?? []);
  const mapping: ParsedWorkbook["detectedMapping"] = {};

  for (const [field, columnIndex] of detection.headers.entries()) {
    if (legacyDetectedMappingFields.has(field)) {
      continue;
    }

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
    category: product.category ?? product.categoryName,
    itemNumber: product.itemNumber,
    productName: product.productName,
    recognizedDiscount: product.discount,
    recognizedDiscountedPrice: product.discountedPrice,
    recognizedTotalPrice: product.totalPrice,
    recognizedPurchasePrice: product.purchasePrice,
    recognizedQuantity: product.quantity,
    recognizedRetailPrice: product.retailPrice,
    retailPrice: product.retailPrice,
    rowFingerprint: catalogImportRowFingerprint(product),
    rowNumber: product.rowNumber,
    secondProductName: product.secondProductName,
    status: "Ready",
    quantity: product.quantity,
    supplier: product.supplier ?? product.supplierName,
    totalPrice: product.totalPrice,
    warnings: 0,
  }));
}

function parseProducts(
  rows: SheetData,
  rowErrors: WorkbookRowError[],
  rowWarnings: WorkbookRowError[],
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

    const rawBarcode = productTextValue(detection.headers, row, "barcode");
    const barcode = catalogWorkbookIdentityText({
      field: "barcode",
      maxLength: CATALOG_TEXT_LIMITS.barcode,
      required: true,
      row: rowNumber,
      rowErrors,
      rowWarnings,
      sheet,
      value: rawBarcode,
    });
    const productName = catalogWorkbookDisplayText({
      field: "productName",
      maxLength: CATALOG_TEXT_LIMITS.productName,
      required: false,
      row: rowNumber,
      rowErrors,
      rowWarnings,
      sheet,
      value: productTextValue(detection.headers, row, "productName"),
    });
    const rawItemNumber = productTextValue(
      detection.headers,
      row,
      "itemNumber",
    );
    const itemNumber = catalogWorkbookIdentityText({
      field: "itemNumber",
      maxLength: CATALOG_TEXT_LIMITS.itemNumber,
      required: false,
      row: rowNumber,
      rowErrors,
      rowWarnings,
      sheet,
      value: rawItemNumber,
    }) || undefined;
    const categoryName = catalogWorkbookDisplayText({
      field: "category",
      maxLength: CATALOG_TEXT_LIMITS.categoryName,
      required: false,
      row: rowNumber,
      rowErrors,
      rowWarnings,
      sheet,
      value: productTextValue(detection.headers, row, "category"),
    }) || undefined;
    const supplierName = catalogWorkbookDisplayText({
      field: "supplier",
      maxLength: CATALOG_TEXT_LIMITS.supplierName,
      required: false,
      row: rowNumber,
      rowErrors,
      rowWarnings,
      sheet,
      value: productTextValue(detection.headers, row, "supplier"),
    }) || undefined;
    const categoryId = catalogWorkbookIdentityText({
      field: "categoryId",
      maxLength: 256,
      required: false,
      row: rowNumber,
      rowErrors,
      rowWarnings,
      sheet,
      value: productBoundaryTextValue(rows, detection, row, "categoryId"),
    }) || undefined;
    const productId = catalogWorkbookIdentityText({
      field: "productId",
      maxLength: 256,
      required: false,
      row: rowNumber,
      rowErrors,
      rowWarnings,
      sheet,
      value: productBoundaryTextValue(rows, detection, row, "productId"),
    }) || undefined;
    const supplierId = catalogWorkbookIdentityText({
      field: "supplierId",
      maxLength: 256,
      required: false,
      row: rowNumber,
      rowErrors,
      rowWarnings,
      sheet,
      value: productBoundaryTextValue(rows, detection, row, "supplierId"),
    }) || undefined;
    const secondProductName = catalogWorkbookDisplayText({
      field: "secondProductName",
      maxLength: CATALOG_TEXT_LIMITS.secondProductName,
      required: false,
      row: rowNumber,
      rowErrors,
      rowWarnings,
      sheet,
      value: productTextValue(detection.headers, row, "secondProductName"),
    }) || undefined;
    const totalPrice = productReferenceNumberValue(
      detection.headers,
      row,
      "totalPrice",
    );
    const realQuantity = productNumberValue(
      detection.headers,
      row,
      "realQuantity",
      sheet,
      rowNumber,
      "realQuantity",
      rowErrors,
    );
    const quantity = realQuantity ?? productNumberValue(
      detection.headers,
      row,
      "quantity",
      sheet,
      rowNumber,
      "quantity",
      rowErrors,
    );

    if (barcode && (
      options.allowFlexibleBarcode &&
      isAndroidDatabaseBarcodeTooLong(barcode)
    )) {
      rowErrors.push({
        field: "barcode",
        message:
          "Android database barcode must be at most 96 characters for Admin Web import.",
        row: rowNumber,
        sheet,
      });
    } else if (
      barcode &&
      !options.allowFlexibleBarcode &&
      !isValidProductBarcode(barcode)
    ) {
      rowErrors.push({
        field: "barcode",
        message: "Barcode must contain 8, 12, or 13 digits.",
        row: rowNumber,
        sheet,
      });
    }

    parsed.push({
      barcode,
      category: categoryName,
      categoryId,
      categoryName,
      complete:
        productTextValue(detection.headers, row, "complete") || undefined,
      discount: productReferenceNumberValue(detection.headers, row, "discount"),
      discountedPrice: productReferenceNumberValue(
        detection.headers,
        row,
        "discountedPrice",
      ),
      itemNumber,
      oldPurchasePrice: productReferenceNumberValue(
        detection.headers,
        row,
        "oldPurchasePrice",
      ),
      oldRetailPrice: productReferenceNumberValue(
        detection.headers,
        row,
        "oldRetailPrice",
      ),
      productId,
      productName,
      rawBarcode,
      rawItemNumber,
      purchasePrice: productNumberValue(
        detection.headers,
        row,
        "purchasePrice",
        sheet,
        rowNumber,
        "purchasePrice",
        rowErrors,
      ),
      quantity,
      realQuantity,
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
      secondProductName,
      stockQuantity: quantity,
      supplier: supplierName,
      supplierId,
      supplierName,
      totalPrice,
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
    validRows: parsed.filter((product) =>
      product.barcode &&
      (product.productName || product.secondProductName || product.itemNumber)
    ).length,
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
  return xmlElements(node, "t")
    .map((entry) => entry.textContent ?? "")
    .join("");
}

type XmlElementContainer = {
  getElementsByTagName(name: string): {
    item(index: number): XmlElement | null;
    length: number;
  };
};

function xmlElements(node: XmlElementContainer, localName: string) {
  const entries = node.getElementsByTagName("*");
  const matches: XmlElement[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries.item(index);

    if (!entry) {
      continue;
    }

    const candidate = entry as XmlElement & { localName?: string };

    if (
      candidate.localName === localName ||
      candidate.nodeName === localName ||
      candidate.nodeName.endsWith(`:${localName}`)
    ) {
      matches.push(entry);
    }
  }

  return matches;
}

function xmlAttribute(node: XmlElement, name: string) {
  const direct = node.getAttribute(name);

  if (direct) {
    return direct;
  }

  const localName = name.includes(":") ? name.split(":").pop() ?? name : name;
  for (const attribute of Array.from(node.attributes ?? [])) {
    if (
      attribute.name === name ||
      attribute.name === localName ||
      attribute.name.endsWith(`:${localName}`) ||
      attribute.localName === localName
    ) {
      return attribute.value;
    }
  }

  return null;
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
  const type = xmlAttribute(cell, "t");

  if (type === "inlineStr") {
    const inlineString = xmlElements(cell, "is")[0];

    return inlineString ? xmlText(inlineString as XmlElement) : "";
  }

  const rawValue = xmlElements(cell, "v")[0]?.textContent ?? "";

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

  return xmlElements(document, "si").map((item) => xmlText(item));
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

  for (const row of xmlElements(document, "row")) {
    const rowNumber = Number(xmlAttribute(row, "r"));
    const targetRowIndex = Number.isFinite(rowNumber)
      ? Math.max(0, rowNumber - 1)
      : parsedRows.length;
    const cells = xmlElements(row, "c");
    const parsedRow: Array<string | number | boolean | null> = [];

    for (const cell of cells) {
      const cellRef = xmlAttribute(cell, "r") ?? "";
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

  for (const relationship of xmlElements(relationships, "Relationship")) {
    const id = xmlAttribute(relationship, "Id");
    const target = xmlAttribute(relationship, "Target");

    if (id && target) {
      relationshipTargets.set(id, relationshipTargetPath(target));
    }
  }

  const sharedStrings = await readOoxmlSharedStrings(directory);
  const sheets: Array<{ data: SheetData; sheet: string }> = [];

  for (const sheet of xmlElements(workbook, "sheet")) {
    const name = xmlAttribute(sheet, "name") ?? "Sheet";
    const relationshipId = xmlAttribute(sheet, "r:id");
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
  if (isLegacyWorkbook(input)) {
    return readSheetJsWorkbook(input.bytes);
  }

  try {
    const sheets = await readXlsxFile<number>(input.bytes);

    if (sheets.length > 0) {
      return sheets;
    }
  } catch {
    // Fall through to the OOXML and SheetJS readers below.
  }

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
    rowWarnings,
    mappingOverride,
    selectedProductSheet.sheet,
    importMode,
    {
      allowFlexibleBarcode:
        importMode === "database" &&
        detectedFormat.kind === "android_database_export",
    },
  );
  const suppliers = parseSuppliers(supplierRows, rowErrors, rowWarnings);
  const categories = parseCategories(categoryRows, rowErrors, rowWarnings);
  const priceHistory = parsePriceHistory(
    priceHistoryRows,
    rowErrors,
    rowWarnings,
  );
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

  if (suppliers.length + categories.length > MAX_IMPORT_DIMENSION_EVENT_ROWS) {
    return shopAdminActionResult("row_limit_exceeded", { ok: false });
  }

  const formulaEscapeFields = new Set([
    "barcode",
    "category",
    "categoryName",
    "itemNumber",
    "productName",
    "secondProductName",
    "supplier",
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

function syncText(value: string | null | undefined) {
  return value?.trim() || "";
}

function syncNumber(value: number | null | undefined) {
  return value === undefined ? null : value;
}

function syncValue(value: string | number | null | undefined) {
  return typeof value === "string" ? syncText(value) : syncNumber(value);
}

function syncValuesEqual(
  left: string | number | null | undefined,
  right: string | number | null | undefined,
  caseSensitive = false,
) {
  const normalizedLeft = syncValue(left);
  const normalizedRight = syncValue(right);

  if (typeof normalizedLeft === "number" || typeof normalizedRight === "number") {
    return normalizedLeft === normalizedRight;
  }

  const leftText = String(normalizedLeft ?? "");
  const rightText = String(normalizedRight ?? "");
  return caseSensitive
    ? leftText === rightText
    : leftText.toLowerCase() === rightText.toLowerCase();
}

function supplierCategoryNameMaps(
  readModel: Pick<
    Awaited<ReturnType<typeof getShopInventoryReadModel>>,
    "categories" | "suppliers"
  >,
) {
  return {
    categoriesById: new Map(
      readModel.categories.map((category) => [category.categoryId, category.name]),
    ),
    suppliersById: new Map(
      readModel.suppliers.map((supplier) => [supplier.supplierId, supplier.name]),
    ),
  };
}

function syncRowFromExistingProduct(
  product: ShopInventoryProduct,
  readModel: Pick<
    Awaited<ReturnType<typeof getShopInventoryReadModel>>,
    "categories" | "suppliers"
  >,
): CatalogWorkbookSyncProductRow {
  const maps = supplierCategoryNameMaps(readModel);

  return {
    barcode: product.barcode,
    category: product.categoryId
      ? maps.categoriesById.get(product.categoryId)
      : undefined,
    itemNumber: product.itemNumber ?? undefined,
    productName: product.productName ?? "",
    purchasePrice: product.purchasePrice,
    quantity: product.stockQuantity,
    retailPrice: product.retailPrice,
    rowNumber: 0,
    secondProductName: product.secondProductName ?? undefined,
    supplier: product.supplierId ? maps.suppliersById.get(product.supplierId) : undefined,
  };
}

function syncRowFromParsedProduct(
  row: ParsedProductRow,
  merged: ReturnType<typeof mergeProductImportForApply>,
  readModel: Pick<
    Awaited<ReturnType<typeof getShopInventoryReadModel>>,
    "categories" | "suppliers"
  >,
): CatalogWorkbookSyncProductRow {
  const maps = supplierCategoryNameMaps(readModel);

  return {
    barcode: merged.barcode,
    category:
      row.category ??
      (merged.categoryId ? maps.categoriesById.get(merged.categoryId) : undefined),
    itemNumber: merged.itemNumber ?? undefined,
    productName: merged.productName,
    purchasePrice: merged.purchasePrice,
    quantity: merged.stockQuantity,
    retailPrice: merged.retailPrice,
    rowNumber: row.rowNumber,
    secondProductName: merged.secondProductName ?? undefined,
    supplier:
      row.supplier ??
      (merged.supplierId ? maps.suppliersById.get(merged.supplierId) : undefined),
  };
}

function addSyncDiff(
  diffs: CatalogWorkbookSyncDiff[],
  field: CatalogImportField,
  before: string | number | null | undefined,
  after: string | number | null | undefined,
) {
  if (syncValuesEqual(before, after, field === "itemNumber")) {
    return;
  }

  diffs.push({
    after: syncValue(after),
    before: syncValue(before),
    field,
  });
}

function syncDiffs(
  existing: CatalogWorkbookSyncProductRow,
  updated: CatalogWorkbookSyncProductRow,
) {
  const diffs: CatalogWorkbookSyncDiff[] = [];

  addSyncDiff(diffs, "itemNumber", existing.itemNumber, updated.itemNumber);
  addSyncDiff(diffs, "productName", existing.productName, updated.productName);
  addSyncDiff(
    diffs,
    "secondProductName",
    existing.secondProductName,
    updated.secondProductName,
  );
  addSyncDiff(
    diffs,
    "purchasePrice",
    existing.purchasePrice,
    updated.purchasePrice,
  );
  addSyncDiff(diffs, "retailPrice", existing.retailPrice, updated.retailPrice);
  addSyncDiff(diffs, "quantity", existing.quantity, updated.quantity);
  addSyncDiff(diffs, "supplier", existing.supplier, updated.supplier);
  addSyncDiff(diffs, "category", existing.category, updated.category);

  return diffs;
}

function supplierSyncPreviewFingerprint(input: {
  boundPreviewDigest: string;
  preview: Omit<CatalogWorkbookSyncPreview, "fingerprint">;
}) {
  return createHash("sha256")
    .update(JSON.stringify({
      boundPreviewDigest: input.boundPreviewDigest,
      errors: input.preview.errors,
      newProducts: input.preview.newProducts,
      noChangeRows: input.preview.noChangeRows,
      skippedRows: input.preview.skippedRows,
      updatedProducts: input.preview.updatedProducts,
      warnings: input.preview.warnings,
    }))
    .digest("hex");
}

function buildSupplierSyncPreview(input: {
  adjustedParsed: ParsedWorkbook;
  adjustments: readonly CatalogWorkbookRowAdjustment[];
  boundPreviewDigest: string;
  readModel: Pick<
    Awaited<ReturnType<typeof getShopInventoryReadModel>>,
    "categories" | "products" | "suppliers"
  >;
  rowErrors: readonly WorkbookRowError[];
  rowWarnings: readonly WorkbookRowError[];
  sourceParsed: ParsedWorkbook;
}): CatalogWorkbookSyncPreview {
  const supplierIdsByName = new Map(
    input.readModel.suppliers.map((supplier) => [
      supplier.name.toLowerCase(),
      supplier.supplierId,
    ]),
  );
  const categoryIdsByName = new Map(
    input.readModel.categories.map((category) => [
      category.name.toLowerCase(),
      category.categoryId,
    ]),
  );
  const skippedRows = new Set(
    input.adjustments
      .filter((adjustment) => adjustment.skip === true)
      .map((adjustment) => adjustment.rowNumber),
  );
  const skippedPreviewRows = input.sourceParsed.products
    .filter((product) => skippedRows.has(product.rowNumber))
    .map((product) => ({
      barcode: product.barcode,
      itemNumber: product.itemNumber,
      productName: product.productName,
      rowNumber: product.rowNumber,
    }));
  const errors = [...input.rowErrors];
  const warnings = [...input.rowWarnings];
  const effectiveProducts = effectiveProductRowsLastWins(input.adjustedParsed.products);
  const newProducts: CatalogWorkbookSyncProductRow[] = [];
  const updatedProducts: CatalogWorkbookSyncUpdateRow[] = [];
  const noChangeRows: CatalogWorkbookSyncProductRow[] = [];

  for (const row of effectiveProducts) {
    const existing = findProduct(input.readModel.products, row);
    const merged = mergeProductImportForApply(row, existing, {
      categoryIdsByName,
      supplierIdsByName,
    });
    const updated = syncRowFromParsedProduct(row, merged, input.readModel);

    if (!existing) {
      newProducts.push(updated);
      continue;
    }

    const current = {
      ...syncRowFromExistingProduct(existing, input.readModel),
      rowNumber: row.rowNumber,
    };
    const diffs = syncDiffs(current, updated);

    if (diffs.length === 0) {
      noChangeRows.push(updated);
    } else {
      updatedProducts.push({
        barcode: updated.barcode,
        diffs,
        existing: current,
        rowNumber: row.rowNumber,
        updated,
      });
    }
  }

  const withoutFingerprint = {
    canApply: errors.length === 0,
    errors,
    newProducts,
    noChangeRows,
    skippedRows: skippedPreviewRows,
    summary: {
      errors: errors.length,
      newProducts: newProducts.length,
      noChangeRows: noChangeRows.length,
      nonSkippedRows: effectiveProducts.length,
      skippedRows: skippedPreviewRows.length,
      totalRows: input.sourceParsed.products.length,
      updatedProducts: updatedProducts.length,
      warnings: warnings.length,
    },
    updatedProducts,
    warnings,
  } satisfies Omit<CatalogWorkbookSyncPreview, "fingerprint">;

  return {
    ...withoutFingerprint,
    fingerprint: supplierSyncPreviewFingerprint({
      boundPreviewDigest: input.boundPreviewDigest,
      preview: withoutFingerprint,
    }),
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
    barcodes.add(product.barcode);

    if (product.itemNumber) {
      itemNumbers.add(product.itemNumber);
    }
  }

  for (const product of products) {
    if (product.productId) {
      productIds.add(product.productId);
    }

    if (product.barcode) {
      barcodes.add(product.barcode);
    }

    if (product.itemNumber) {
      itemNumbers.add(product.itemNumber);
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
      references.barcodes.has(row.productBarcode);
    const hasItemNumber =
      row.productItemNumber &&
      references.itemNumbers.has(row.productItemNumber);

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
    readModel.products.map((product) => product.barcode),
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
    } else if (existingBarcodes.has(row.barcode)) {
      status = "Update";
    } else {
      status = "New";
    }

    return {
      ...row,
      currentPurchasePrice: maybeNumber(existing?.purchasePrice),
      currentRetailPrice: maybeNumber(existing?.retailPrice),
      currentQuantity: maybeNumber(existing?.stockQuantity),
      status,
      warnings: warningsByRow.get(row.rowNumber) ?? 0,
    };
  });
}

function parseAdjustmentNumber(
  value: unknown,
  field: "purchasePrice" | "quantity" | "retailPrice",
  rowNumber: number,
) {
  if (value === undefined || value === null || value === "") {
    return { ok: true as const, value: undefined };
  }

  const numeric = typeof value === "number"
    ? value
    : parseWorkbookNumber(String(value));

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
  field:
    | "barcode"
    | "category"
    | "itemNumber"
    | "productName"
    | "secondProductName"
    | "supplier",
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

  const options =
    field === "barcode"
      ? { class: "strict" as const, maxLength: CATALOG_TEXT_LIMITS.barcode }
      : field === "itemNumber"
        ? { class: "strict" as const, maxLength: CATALOG_TEXT_LIMITS.itemNumber }
        : field === "productName"
          ? { class: "display" as const, maxLength: CATALOG_TEXT_LIMITS.productName }
          : field === "secondProductName"
            ? {
                class: "display" as const,
                maxLength: CATALOG_TEXT_LIMITS.secondProductName,
              }
            : field === "supplier"
              ? {
                  class: "display" as const,
                  maxLength: CATALOG_TEXT_LIMITS.supplierName,
                }
              : {
                  class: "display" as const,
                  maxLength: CATALOG_TEXT_LIMITS.categoryName,
                };
  const result =
    options.class === "strict"
      ? validateCatalogIdentityText(value, {
          maxLength: options.maxLength,
          required: field === "barcode",
        })
      : canonicalizeCatalogDisplayText(value, {
          maxLength: options.maxLength,
          required: field === "productName",
        });

  if (result.status === "rejected") {
    return {
      error: {
        code: `catalog_text_${result.reason}`,
        field,
        message: catalogTextReasonMessage(result.reason),
        row: rowNumber,
        sheet: "Products",
      } satisfies WorkbookRowError,
      ok: false as const,
    };
  }

  return { ok: true as const, value: result.value || undefined };
}

function parseAdjustmentBarcode(value: unknown, rowNumber: number) {
  const parsed = parseAdjustmentText(value, "barcode", rowNumber);

  if (!parsed.ok || parsed.value === undefined) {
    return parsed;
  }

  if (!isValidProductBarcode(parsed.value)) {
    return {
      error: {
        field: "barcode",
        message: "Adjustment barcode must contain 8, 12, or 13 digits.",
        row: rowNumber,
        sheet: "Products",
      } satisfies WorkbookRowError,
      ok: false as const,
    };
  }

  return parsed;
}

function normalizeDefaultAssignment(
  value: string | undefined,
  field: "category" | "supplier",
) {
  const result = canonicalizeCatalogDisplayText(value ?? "", {
    maxLength:
      field === "supplier"
        ? CATALOG_TEXT_LIMITS.supplierName
        : CATALOG_TEXT_LIMITS.categoryName,
    required: false,
  });

  return result.status === "rejected" || !result.value
    ? undefined
    : result.value;
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
  const supplierResult = canonicalizeCatalogDisplayText(
    input.defaultSupplierName ?? "",
    { maxLength: CATALOG_TEXT_LIMITS.supplierName, required: false },
  );
  const categoryResult = canonicalizeCatalogDisplayText(
    input.defaultCategoryName ?? "",
    { maxLength: CATALOG_TEXT_LIMITS.categoryName, required: false },
  );

  if (supplierResult.status === "rejected") {
    rowErrors.push({
      code: `catalog_text_${supplierResult.reason}`,
      field: "defaultSupplierName",
      message: catalogTextReasonMessage(supplierResult.reason),
      row: 0,
      sheet: "Products",
    });
  }

  if (categoryResult.status === "rejected") {
    rowErrors.push({
      code: `catalog_text_${categoryResult.reason}`,
      field: "defaultCategoryName",
      message: catalogTextReasonMessage(categoryResult.reason),
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
    defaultCategoryName:
      categoryResult.status === "rejected" || !categoryResult.value
        ? undefined
        : categoryResult.value,
    defaultSupplierName:
      supplierResult.status === "rejected" || !supplierResult.value
        ? undefined
        : supplierResult.value,
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

    const skip = record.skip === true;

    if (skip) {
      adjustments.push({
        rowFingerprint,
        rowNumber,
        skip: true,
      });
      continue;
    }

    const barcode = parseAdjustmentBarcode(record.barcode, rowNumber);
    const retailPrice = parseAdjustmentNumber(
      record.retailPrice,
      "retailPrice",
      rowNumber,
    );
    const purchasePrice = parseAdjustmentNumber(
      record.purchasePrice,
      "purchasePrice",
      rowNumber,
    );
    const quantity = parseAdjustmentNumber(
      record.quantity,
      "quantity",
      rowNumber,
    );
    const supplier = parseAdjustmentText(
      record.supplier,
      "supplier",
      rowNumber,
    );
    const category = parseAdjustmentText(
      record.category,
      "category",
      rowNumber,
    );
    const itemNumber = parseAdjustmentText(
      record.itemNumber,
      "itemNumber",
      rowNumber,
    );
    const productName = parseAdjustmentText(
      record.productName,
      "productName",
      rowNumber,
    );
    const secondProductName = parseAdjustmentText(
      record.secondProductName,
      "secondProductName",
      rowNumber,
    );

    if (!barcode.ok) {
      rowErrors.push(barcode.error);
    }

    if (!retailPrice.ok) {
      rowErrors.push(retailPrice.error);
    }

    if (!purchasePrice.ok) {
      rowErrors.push(purchasePrice.error);
    }

    if (!quantity.ok) {
      rowErrors.push(quantity.error);
    }

    if (!supplier.ok) {
      rowErrors.push(supplier.error);
    }

    if (!category.ok) {
      rowErrors.push(category.error);
    }

    if (!itemNumber.ok) {
      rowErrors.push(itemNumber.error);
    }

    if (!productName.ok) {
      rowErrors.push(productName.error);
    }

    if (!secondProductName.ok) {
      rowErrors.push(secondProductName.error);
    }

    if (
      barcode.ok &&
      retailPrice.ok &&
      purchasePrice.ok &&
      quantity.ok &&
      supplier.ok &&
      category.ok &&
      itemNumber.ok &&
      productName.ok &&
      secondProductName.ok &&
      (barcode.value !== undefined ||
        retailPrice.value !== undefined ||
        purchasePrice.value !== undefined ||
        quantity.value !== undefined ||
        supplier.value !== undefined ||
        category.value !== undefined ||
        itemNumber.value !== undefined ||
        productName.value !== undefined ||
        secondProductName.value !== undefined)
    ) {
      adjustments.push({
        barcode: barcode.value,
        category: category.value,
        itemNumber: itemNumber.value,
        purchasePrice: purchasePrice.value,
        productName: productName.value,
        quantity: quantity.value,
        rawBarcode:
          barcode.value !== undefined && typeof record.barcode === "string"
            ? record.barcode
            : undefined,
        rawItemNumber:
          itemNumber.value !== undefined && typeof record.itemNumber === "string"
            ? record.itemNumber
            : undefined,
        retailPrice: retailPrice.value,
        rowFingerprint,
        rowNumber,
        secondProductName: secondProductName.value,
        supplier: supplier.value,
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
  const adjustedFieldsByRow = new Map(
    adjustments.map((adjustment) => [
      adjustment.rowNumber,
      new Set(
        (
          [
            "barcode",
            "category",
            "itemNumber",
            "productName",
            "secondProductName",
            "supplier",
          ] as const
        ).filter((field) => adjustment[field] !== undefined),
      ),
    ]),
  );
  const products = parsed.products.map((product) => {
    const adjustment = adjustmentsByRow.get(product.rowNumber);

    if (!adjustment) {
      return product;
    }

    return {
      ...product,
      barcode: adjustment.barcode ?? product.barcode,
      category: adjustment.category ?? product.category,
      categoryName: adjustment.category ?? product.categoryName,
      itemNumber: adjustment.itemNumber ?? product.itemNumber,
      rawBarcode:
        adjustment.rawBarcode ?? product.rawBarcode ?? product.barcode,
      rawItemNumber:
        adjustment.rawItemNumber ??
        product.rawItemNumber ??
        product.itemNumber,
      productName: adjustment.productName ?? product.productName,
      purchasePrice:
        adjustment.purchasePrice === undefined || adjustment.purchasePrice === null
          ? product.purchasePrice
          : adjustment.purchasePrice,
      retailPrice:
        adjustment.retailPrice === undefined || adjustment.retailPrice === null
          ? product.retailPrice
          : adjustment.retailPrice,
      secondProductName:
        adjustment.secondProductName ?? product.secondProductName,
      supplier: adjustment.supplier ?? product.supplier,
      supplierName: adjustment.supplier ?? product.supplierName,
      quantity:
        adjustment.quantity === undefined || adjustment.quantity === null
          ? (product.quantity ?? product.stockQuantity)
          : adjustment.quantity,
      stockQuantity:
        adjustment.quantity === undefined || adjustment.quantity === null
          ? product.stockQuantity
          : adjustment.quantity,
    };
  });

  return {
    ...parsed,
    products,
    previewRows: parsedPreviewRows(products),
    rowErrors: parsed.rowErrors.filter(
      (issue) => !adjustedFieldsByRow.get(issue.row)?.has(
        issue.field as
          | "barcode"
          | "category"
          | "itemNumber"
          | "productName"
          | "secondProductName"
          | "supplier",
      ),
    ),
    rowWarnings: parsed.rowWarnings.filter(
      (issue) => !adjustedFieldsByRow.get(issue.row)?.has(
        issue.field as
          | "barcode"
          | "category"
          | "itemNumber"
          | "productName"
          | "secondProductName"
          | "supplier",
      ),
    ),
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
  const skippedRows = new Set(
    adjustments
      .filter((adjustment) => adjustment.skip === true)
      .map((adjustment) => adjustment.rowNumber),
  );
  const correctedBarcodeRows = new Set(
    adjustments
      .filter((adjustment) => adjustment.barcode)
      .map((adjustment) => adjustment.rowNumber),
  );
  const adjustedFieldsByRow = new Map(
    adjustments.map((adjustment) => [
      adjustment.rowNumber,
      new Set(
        (
          [
            "barcode",
            "category",
            "itemNumber",
            "productName",
            "secondProductName",
            "supplier",
          ] as const
        ).filter((field) => adjustment[field] !== undefined),
      ),
    ]),
  );
  const defaultSupplierName = normalizeDefaultAssignment(
    defaults.defaultSupplierName,
    "supplier",
  );
  const defaultCategoryName = normalizeDefaultAssignment(
    defaults.defaultCategoryName,
    "category",
  );
  const products = parsed.products.flatMap((product) => {
    const adjustment = adjustmentsByRow.get(product.rowNumber);
    if (adjustment?.skip === true) {
      return [];
    }

    const adjustedBarcode = maybeText(adjustment?.barcode);
    const productForLookup = adjustedBarcode
      ? { ...product, barcode: adjustedBarcode }
      : product;
    const existing = findProduct(readModel.products, productForLookup);
    const manualSupplierName =
      maybeText(adjustment?.supplier) ??
      defaultSupplierName;
    const manualCategoryName =
      maybeText(adjustment?.category) ??
      defaultCategoryName;
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

    return [{
      ...product,
      barcode: adjustedBarcode ?? (product.barcode || existing?.barcode || ""),
      category: adjustment?.category ?? product.category,
      categoryId,
      categoryName: undefined,
      itemNumber:
        maybeText(adjustment?.itemNumber) ??
        maybeText(product.itemNumber) ??
        maybeText(existing?.itemNumber) ??
        undefined,
      productId: existing?.productId ?? product.productId,
      productName:
        adjustment?.productName ||
        product.productName ||
        existing?.productName ||
        "",
      rawBarcode:
        adjustment?.rawBarcode ?? product.rawBarcode ?? product.barcode,
      rawItemNumber:
        adjustment?.rawItemNumber ??
        product.rawItemNumber ??
        product.itemNumber,
      purchasePrice:
        adjustment?.purchasePrice !== undefined && adjustment.purchasePrice !== null
          ? adjustment.purchasePrice
          : (product.purchasePrice === undefined
            ? maybeNumber(existing?.purchasePrice)
            : product.purchasePrice),
      retailPrice:
        adjustment?.retailPrice === undefined || adjustment.retailPrice === null
          ? (product.retailPrice ??
            (existing ? maybeNumber(existing.retailPrice) : undefined))
          : adjustment.retailPrice,
      secondProductName:
        maybeText(adjustment?.secondProductName) ??
        maybeText(product.secondProductName) ??
        maybeText(existing?.secondProductName) ??
        undefined,
      stockQuantity:
        adjustment?.quantity === undefined ||
        adjustment.quantity === null
          ? (product.quantity ??
            (existing ? maybeNumber(existing.stockQuantity) : undefined))
          : adjustment.quantity,
      quantity:
        adjustment?.quantity === undefined ||
        adjustment.quantity === null
          ? (product.quantity ??
            (existing ? maybeNumber(existing.stockQuantity) : undefined))
          : adjustment.quantity,
      supplierId,
      supplierName: undefined,
      supplier: adjustment?.supplier ?? product.supplier,
    }];
  });
  const rowErrors = parsed.rowErrors.filter((issue) => {
    if (skippedRows.has(issue.row)) {
      return false;
    }
    if (
      (issue.field === "barcode" && correctedBarcodeRows.has(issue.row)) ||
      adjustedFieldsByRow.get(issue.row)?.has(
        issue.field as
          | "barcode"
          | "category"
          | "itemNumber"
          | "productName"
          | "secondProductName"
          | "supplier",
      )
    ) {
      return false;
    }
    return true;
  });
  const rowWarnings = parsed.rowWarnings.filter(
    (issue) =>
      !skippedRows.has(issue.row) &&
      !adjustedFieldsByRow.get(issue.row)?.has(
        issue.field as
          | "barcode"
          | "category"
          | "itemNumber"
          | "productName"
          | "secondProductName"
          | "supplier",
      ),
  );

  return {
    ...parsed,
    categories: [],
    priceHistory: [],
    products,
    rowErrors,
    rowWarnings,
    suppliers: [],
    previewRows: parsedPreviewRows(products),
  };
}

function buildProductIdMaps(products: readonly ShopInventoryProduct[]) {
  return {
    byImportedProductId: new Map(
      products.map((product) => [product.productId, product.productId]),
    ),
    byBarcode: new Map(
      products.map((product) => [product.barcode, product.productId]),
    ),
    byItemNumber: new Map(
      products
        .filter((product) => product.itemNumber)
        .map((product) => [
          product.itemNumber ?? "",
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
  if (row.productId) {
    maps.byImportedProductId.set(row.productId, productId);
  }

  maps.byProductId.add(productId);

  if (row.barcode) {
    maps.byBarcode.set(row.barcode, productId);
  }

  if (row.itemNumber) {
    maps.byItemNumber.set(row.itemNumber, productId);
  }
}

function resolvePriceHistoryProductId(
  maps: ReturnType<typeof buildProductIdMaps>,
  row: ParsedPriceHistoryRow,
) {
  if (row.productId && maps.byProductId.has(row.productId)) {
    return row.productId;
  }

  if (row.productId) {
    const byImportedProductId = maps.byImportedProductId.get(row.productId);

    if (byImportedProductId) {
      return byImportedProductId;
    }
  }

  if (row.productBarcode) {
    const byBarcode = maps.byBarcode.get(row.productBarcode);

    if (byBarcode) {
      return byBarcode;
    }
  }

  if (row.productItemNumber) {
    return maps.byItemNumber.get(row.productItemNumber);
  }

  return undefined;
}

function nonnegativeSafeIntegerFromPayload(value: unknown) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

/**
 * Workbook preview/apply/export needs a complete, internally consistent view
 * of the catalog. Personal accounts obtain that view through their normal RLS
 * reader. Staff must instead consume the already lease-bound, revision-pinned
 * snapshot RPC; exposing a table client here would reintroduce the boundary
 * this task deliberately removed.
 */
const STAFF_WORKBOOK_SNAPSHOT_PAGE_LIMITS = {
  categories: 240,
  prices: 120,
  products: 60,
  suppliers: 240,
} as const;

type StaffWorkbookSnapshotEntity =
  keyof typeof STAFF_WORKBOOK_SNAPSHOT_PAGE_LIMITS;
type StaffWorkbookCatalogScope = Exclude<
  ShopInventoryReadModel["catalogScope"],
  "blocked"
>;
type StaffWorkbookSnapshotScope = {
  catalogScope: StaffWorkbookCatalogScope;
  key: string;
  legacyOwnerUserId: string | null;
  mapping: ShopInventoryReadModel["mapping"];
};
type CatalogWorkbookSnapshotSummary = ShopInventoryReadModel["summary"] & {
  workbookTextBytes: number;
};
type StaffWorkbookSnapshotEnvelope = {
  pagination: {
    hasMore: boolean;
    nextAfterId: string | null;
  };
  revision: string;
  rows: Record<string, unknown>[];
  scope: StaffWorkbookSnapshotScope;
  summary: CatalogWorkbookSnapshotSummary | null;
};
type StaffWorkbookSnapshotFailure = {
  code: string;
  kind: "failure";
};
type StaffWorkbookSnapshotSuccess = {
  envelope: StaffWorkbookSnapshotEnvelope;
  kind: "success";
};

const STAFF_WORKBOOK_SCOPE_KEY_PATTERN = /^[0-9a-f]{64}$/;
const STAFF_WORKBOOK_REVISION_PATTERN = /^(0|[1-9][0-9]{0,18})$/;

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nullableStringValue(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function nullableFiniteNumberValue(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function validSnapshotTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    Number.isFinite(Date.parse(value))
  );
}

function validNullableSnapshotTimestamp(value: unknown): value is string | null {
  return value === null || validSnapshotTimestamp(value);
}

function validNullableUuid(value: unknown): value is string | null {
  return value === null || isCanonicalUuid(value);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseStaffWorkbookSnapshotSummary(
  value: unknown,
): CatalogWorkbookSnapshotSummary | null {
  const summary = recordValue(value);

  if (!summary) {
    return null;
  }

  const activeProducts = summary.activeProducts;
  const archivedProducts = summary.archivedProducts;
  const categories = summary.categories;
  const priceRows = summary.priceRows;
  const productsTotal = summary.productsTotal;
  const suppliers = summary.suppliers;
  const workbookTextBytes = summary.workbookTextBytes;

  if (
    !nonnegativeSafeInteger(activeProducts) ||
    !nonnegativeSafeInteger(archivedProducts) ||
    !nonnegativeSafeInteger(categories) ||
    !nonnegativeSafeInteger(priceRows) ||
    !nonnegativeSafeInteger(productsTotal) ||
    !nonnegativeSafeInteger(suppliers) ||
    !nonnegativeSafeInteger(workbookTextBytes) ||
    productsTotal !== activeProducts + archivedProducts
  ) {
    return null;
  }

  return {
    activeProducts,
    archivedProducts,
    categories,
    priceRows,
    productsTotal,
    suppliers,
    workbookTextBytes,
  };
}

function parseStaffWorkbookSnapshotScope(
  value: unknown,
): StaffWorkbookSnapshotScope | null {
  const scope = recordValue(value);

  if (!scope) {
    return null;
  }

  const catalogScope = scope.kind;
  const key = scope.key;
  const legacyOwnerUserId = scope.legacyOwnerUserId;

  if (
    (catalogScope !== "shop_scoped" &&
      catalogScope !== "legacy_owner_bridge" &&
      catalogScope !== "authorized_shop_plus_legacy") ||
    typeof key !== "string" ||
    !STAFF_WORKBOOK_SCOPE_KEY_PATTERN.test(key) ||
    !validNullableUuid(legacyOwnerUserId) ||
    (catalogScope === "shop_scoped" && legacyOwnerUserId !== null) ||
    (catalogScope !== "shop_scoped" && !isCanonicalUuid(legacyOwnerUserId))
  ) {
    return null;
  }

  const rawMapping = scope.mapping;
  let mapping: ShopInventoryReadModel["mapping"] = null;

  if (rawMapping !== null) {
    const source = recordValue(rawMapping);

    if (
      !source ||
      !isCanonicalUuid(source.id) ||
      !isCanonicalUuid(source.ownerUserId) ||
      source.state !== "mapped" ||
      source.kind !== "mobile_owner" ||
      !validSnapshotTimestamp(source.verifiedAt)
    ) {
      return null;
    }

    mapping = {
      mappingId: source.id,
      mappingState: source.state,
      ownerUserId: source.ownerUserId,
      sourceKind: source.kind,
      verifiedAt: source.verifiedAt,
    };
  }

  if (
    catalogScope !== "shop_scoped" &&
    (!mapping || mapping.ownerUserId !== legacyOwnerUserId)
  ) {
    return null;
  }

  return {
    catalogScope,
    key,
    legacyOwnerUserId,
    mapping,
  };
}

function parseStaffWorkbookSnapshotEnvelope(
  data: unknown,
  expected: {
    revision?: string;
    scopeKey?: string;
    shopId: string;
    summaryRequired: boolean;
  },
): StaffWorkbookSnapshotSuccess | StaffWorkbookSnapshotFailure {
  const root = recordValue(data);
  const code = typeof root?.code === "string" ? root.code : "db_failure";
  const revision = root?.revision;

  if (
    !root ||
    root.ok !== true ||
    code !== "success" ||
    root.schemaVersion !== "shop-catalog-admin-read-v1" ||
    root.shopId !== expected.shopId ||
    root.operation !== "snapshot_page" ||
    typeof revision !== "string" ||
    !STAFF_WORKBOOK_REVISION_PATTERN.test(revision) ||
    !Array.isArray(root.rows)
  ) {
    return { code, kind: "failure" };
  }

  const scope = parseStaffWorkbookSnapshotScope(root.scope);
  const pagination = recordValue(root.pagination);
  const summary = root.summary === null
    ? null
    : parseStaffWorkbookSnapshotSummary(root.summary);
  const nextAfterId = pagination?.nextAfterId;

  if (
    !scope ||
    !pagination ||
    typeof pagination.hasMore !== "boolean" ||
    !validNullableUuid(nextAfterId) ||
    (expected.summaryRequired && !summary) ||
    (expected.revision !== undefined && revision !== expected.revision) ||
    (expected.scopeKey !== undefined && scope.key !== expected.scopeKey)
  ) {
    return { code: "validation_failed", kind: "failure" };
  }

  const rows = root.rows.map(recordValue);

  if (rows.some((row) => row === null)) {
    return { code: "validation_failed", kind: "failure" };
  }

  return {
    envelope: {
      pagination: {
        hasMore: pagination.hasMore,
        nextAfterId,
      },
      revision,
      rows: rows as Record<string, unknown>[],
      scope,
      summary,
    },
    kind: "success",
  };
}

function mapStaffWorkbookSnapshotProduct(
  row: Record<string, unknown>,
): ShopInventoryProduct | null {
  if (
    !isCanonicalUuid(row.id) ||
    typeof row.barcode !== "string" ||
    !nullableStringValue(row.item_number) ||
    !nullableStringValue(row.product_name) ||
    !nullableStringValue(row.second_product_name) ||
    !nullableFiniteNumberValue(row.purchase_price) ||
    !nullableFiniteNumberValue(row.retail_price) ||
    !nullableFiniteNumberValue(row.stock_quantity) ||
    !validNullableUuid(row.supplier_id) ||
    !validNullableUuid(row.category_id) ||
    !validNullableUuid(row.primary_image_version_id) ||
    !validNullableSnapshotTimestamp(row.primary_image_updated_at) ||
    !validNullableSnapshotTimestamp(row.deleted_at) ||
    !validSnapshotTimestamp(row.updated_at)
  ) {
    return null;
  }

  return {
    barcode: row.barcode,
    categoryId: row.category_id,
    deletedAt: row.deleted_at,
    itemNumber: row.item_number,
    primaryImageUpdatedAt: row.primary_image_updated_at,
    primaryImageVersionId: row.primary_image_version_id,
    productId: row.id,
    productName: row.product_name,
    purchasePrice: row.purchase_price,
    retailPrice: row.retail_price,
    secondProductName: row.second_product_name,
    stockQuantity: row.stock_quantity,
    supplierId: row.supplier_id,
    updatedAt: row.updated_at,
  };
}

function mapStaffWorkbookSnapshotCategory(
  row: Record<string, unknown>,
): Omit<ShopInventoryCategory, "activeProductsCount"> | null {
  if (
    !isCanonicalUuid(row.id) ||
    typeof row.name !== "string" ||
    !validNullableSnapshotTimestamp(row.deleted_at) ||
    !validSnapshotTimestamp(row.updated_at)
  ) {
    return null;
  }

  return {
    categoryId: row.id,
    deletedAt: row.deleted_at,
    name: row.name,
    updatedAt: row.updated_at,
  };
}

function mapStaffWorkbookSnapshotSupplier(
  row: Record<string, unknown>,
): Omit<ShopInventorySupplier, "activeProductsCount"> | null {
  if (
    !isCanonicalUuid(row.id) ||
    typeof row.name !== "string" ||
    !validNullableSnapshotTimestamp(row.deleted_at) ||
    !validSnapshotTimestamp(row.updated_at)
  ) {
    return null;
  }

  return {
    deletedAt: row.deleted_at,
    name: row.name,
    supplierId: row.id,
    updatedAt: row.updated_at,
  };
}

function mapStaffWorkbookSnapshotPrice(
  row: Record<string, unknown>,
): ShopInventoryPrice | null {
  if (
    !isCanonicalUuid(row.id) ||
    !isCanonicalUuid(row.product_id) ||
    typeof row.type !== "string" ||
    typeof row.price !== "number" ||
    !Number.isFinite(row.price) ||
    !validSnapshotTimestamp(row.effective_at) ||
    !nullableStringValue(row.note) ||
    !nullableStringValue(row.source) ||
    !validSnapshotTimestamp(row.created_at)
  ) {
    return null;
  }

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

function sameStaffWorkbookSnapshotSummary(
  left: CatalogWorkbookSnapshotSummary,
  right: CatalogWorkbookSnapshotSummary,
) {
  return (
    left.activeProducts === right.activeProducts &&
    left.archivedProducts === right.archivedProducts &&
    left.categories === right.categories &&
    left.priceRows === right.priceRows &&
    left.productsTotal === right.productsTotal &&
    left.suppliers === right.suppliers &&
    left.workbookTextBytes === right.workbookTextBytes
  );
}

async function callCatalogWorkbookSnapshotRead(
  context: ReadyShopActionContext,
  request: Record<string, Json | undefined>,
  signal: AbortSignal,
) {
  if (context.principalKind === "pos_staff_manager") {
    return await callStaffWebCatalogRead(
      context,
      "snapshot_page",
      request,
      signal,
    );
  }

  const rpc = context.supabase.rpc("shop_catalog_admin_read_v1", {
    p_operation: "snapshot_page",
    p_request: request,
    p_shop_id: context.selectedShop.shopId,
  });
  return await rpc.abortSignal(signal);
}

function staffWorkbookSnapshotFailure(
  context: ReadyShopActionContext,
  code: string,
): ShopInventoryReadModel {
  const sessionFailure = code === "session_expired" || code === "permission_denied";

  return {
    archivedProducts: [],
    catalogScope: "blocked",
    categories: [],
    error: sessionFailure
      ? undefined
      : {
          code: "staff_workbook_snapshot_unavailable",
          message: "Shop inventory read model could not be loaded.",
        },
    legacyOwnerUserId: null,
    mapping: null,
    prices: [],
    products: [],
    readOnly: true,
    reason: sessionFailure
      ? "Staff catalog snapshot lease is no longer valid."
      : "Staff catalog workbook snapshot could not be verified.",
    selectedShop: context.selectedShop,
    source: "supabase_server",
    status: sessionFailure ? "unauthorized" : "error",
    summary: {
      activeProducts: 0,
      archivedProducts: 0,
      categories: 0,
      priceRows: 0,
      productsTotal: 0,
      suppliers: 0,
    },
    suppliers: [],
  };
}

async function loadStaffWorkbookSnapshotRows(
  context: ReadyShopActionContext,
  manifest: StaffWorkbookSnapshotEnvelope,
  entity: StaffWorkbookSnapshotEntity,
  expectedCount: number,
  resource: CatalogWorkbookReadResource,
): Promise<{ code: string; rows: Record<string, unknown>[] } | null> {
  const limit = STAFF_WORKBOOK_SNAPSHOT_PAGE_LIMITS[entity];
  const maximumRows =
    entity === "products"
      ? CATALOG_WORKBOOK_EXPORT_LIMITS.products
      : entity === "prices"
        ? CATALOG_WORKBOOK_EXPORT_LIMITS.prices
        : entity === "categories"
          ? CATALOG_WORKBOOK_EXPORT_LIMITS.categories
          : CATALOG_WORKBOOK_EXPORT_LIMITS.suppliers;

  try {
    const rows = await collectBoundedWorkbookPages<Record<string, unknown>>({
      expectedCount,
      getId(row) {
        return isCanonicalUuid(row.id) ? row.id : null;
      },
      loadPage: async ({ afterId, limit: pageLimit, signal }) => {
        const request = {
          ...(afterId ? { afterId } : {}),
          entity,
          expectedRevision: manifest.revision,
          expectedScopeKey: manifest.scope.key,
          limit: pageLimit,
          state:
            entity === "categories" || entity === "suppliers"
              ? "active"
              : "all",
        };
        const rpc = await resource.run(async (operationSignal) =>
          await callCatalogWorkbookSnapshotRead(
            context,
            request,
            operationSignal,
          ),
        );
        if (rpc.error) throw new Error("staff_workbook_page_db_failure");
        const parsed = parseStaffWorkbookSnapshotEnvelope(rpc.data, {
          revision: manifest.revision,
          scopeKey: manifest.scope.key,
          shopId: context.selectedShop.shopId,
          summaryRequired: false,
        });
        if (parsed.kind === "failure") {
          throw new Error(`staff_workbook_page_${parsed.code}`);
        }
        if (signal.aborted) {
          throw new CatalogWorkbookExportResourceError(
            signal.reason === "resource_deadline_exceeded"
              ? "resource_deadline_exceeded"
              : "request_cancelled",
          );
        }
        return {
          hasMore: parsed.envelope.pagination.hasMore,
          nextAfterId: parsed.envelope.pagination.nextAfterId,
          rows: parsed.envelope.rows,
        };
      },
      maxRows: maximumRows,
      pageSize: limit,
      signal: resource.signal,
    });
    return { code: "success", rows };
  } catch (error) {
    if (error instanceof CatalogWorkbookExportResourceError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (message === "staff_workbook_page_db_failure") {
      return { code: "db_failure", rows: [] };
    }
    return {
      code: message.startsWith("staff_workbook_page_")
        ? message.slice("staff_workbook_page_".length)
        : "validation_failed",
      rows: [],
    };
  }
}

async function getStaffWorkbookInventoryReadModel(
  context: ReadyShopActionContext,
  resource: CatalogWorkbookReadResource,
): Promise<ShopInventoryReadModel> {
  let manifestRpc: Awaited<
    ReturnType<typeof callCatalogWorkbookSnapshotRead>
  >;

  try {
    manifestRpc = await resource.run(async (signal) =>
      await callCatalogWorkbookSnapshotRead(
        context,
        { entity: "manifest" },
        signal,
      ),
    );
  } catch (error) {
    if (error instanceof CatalogWorkbookExportResourceError) throw error;
    return staffWorkbookSnapshotFailure(context, "db_failure");
  }

  if (manifestRpc.error) {
    return staffWorkbookSnapshotFailure(context, "db_failure");
  }

  const manifestResult = parseStaffWorkbookSnapshotEnvelope(manifestRpc.data, {
    shopId: context.selectedShop.shopId,
    summaryRequired: true,
  });

  if (manifestResult.kind === "failure") {
    return staffWorkbookSnapshotFailure(
      context,
      manifestResult.code,
    );
  }

  const manifest = manifestResult.envelope;
  const summary = manifest.summary;

  if (!summary) {
    return staffWorkbookSnapshotFailure(context, "validation_failed");
  }
  resource.assertPreflight({
    categories: summary.categories,
    prices: summary.priceRows,
    products: summary.productsTotal,
    sourceTextBytes: summary.workbookTextBytes,
    suppliers: summary.suppliers,
  });

  try {
    const [productsPage, suppliersPage] = await Promise.all([
      loadStaffWorkbookSnapshotRows(
        context,
        manifest,
        "products",
        summary.productsTotal,
        resource,
      ),
      loadStaffWorkbookSnapshotRows(
        context,
        manifest,
        "suppliers",
        summary.suppliers,
        resource,
      ),
    ]);
    const [categoriesPage, pricesPage] = await Promise.all([
      loadStaffWorkbookSnapshotRows(
        context,
        manifest,
        "categories",
        summary.categories,
        resource,
      ),
      loadStaffWorkbookSnapshotRows(
        context,
        manifest,
        "prices",
        summary.priceRows,
        resource,
      ),
    ]);

    if (!productsPage || productsPage.code !== "success") {
      return staffWorkbookSnapshotFailure(
        context,
        productsPage?.code ?? "validation_failed",
      );
    }

    if (!suppliersPage || suppliersPage.code !== "success") {
      return staffWorkbookSnapshotFailure(
        context,
        suppliersPage?.code ?? "validation_failed",
      );
    }

    if (!categoriesPage || categoriesPage.code !== "success") {
      return staffWorkbookSnapshotFailure(
        context,
        categoriesPage?.code ?? "validation_failed",
      );
    }

    if (!pricesPage || pricesPage.code !== "success") {
      return staffWorkbookSnapshotFailure(
        context,
        pricesPage?.code ?? "validation_failed",
      );
    }

    const finalManifestRpc = await resource.run(async (signal) =>
      await callCatalogWorkbookSnapshotRead(
        context,
        {
          entity: "manifest",
          expectedRevision: manifest.revision,
          expectedScopeKey: manifest.scope.key,
        },
        signal,
      ),
    );

    if (finalManifestRpc.error) {
      return staffWorkbookSnapshotFailure(context, "db_failure");
    }

    const finalManifestResult = parseStaffWorkbookSnapshotEnvelope(
      finalManifestRpc.data,
      {
        revision: manifest.revision,
        scopeKey: manifest.scope.key,
        shopId: context.selectedShop.shopId,
        summaryRequired: true,
      },
    );

    if (finalManifestResult.kind === "failure") {
      return staffWorkbookSnapshotFailure(
        context,
        finalManifestResult.code,
      );
    }

    const finalSummary = finalManifestResult.envelope.summary;

    if (
      !finalSummary ||
      !sameStaffWorkbookSnapshotSummary(summary, finalSummary)
    ) {
      return staffWorkbookSnapshotFailure(context, "validation_failed");
    }

    const products = productsPage.rows.map(mapStaffWorkbookSnapshotProduct);
    const suppliers = suppliersPage.rows.map(mapStaffWorkbookSnapshotSupplier);
    const categories = categoriesPage.rows.map(mapStaffWorkbookSnapshotCategory);
    const prices = pricesPage.rows.map(mapStaffWorkbookSnapshotPrice);

    if (
      products.some((row) => row === null) ||
      suppliers.some((row) => row === null) ||
      categories.some((row) => row === null) ||
      prices.some((row) => row === null)
    ) {
      return staffWorkbookSnapshotFailure(context, "validation_failed");
    }

    const mappedProducts = products as ShopInventoryProduct[];
    const mappedSuppliers = suppliers as Array<
      Omit<ShopInventorySupplier, "activeProductsCount">
    >;
    const mappedCategories = categories as Array<
      Omit<ShopInventoryCategory, "activeProductsCount">
    >;
    const mappedPrices = prices as ShopInventoryPrice[];
    const productIds = new Set(mappedProducts.map((product) => product.productId));

    if (mappedPrices.some((price) => !productIds.has(price.productId))) {
      return staffWorkbookSnapshotFailure(context, "validation_failed");
    }

    const activeProducts = mappedProducts.filter((product) => product.deletedAt === null);
    const archivedProducts = mappedProducts.filter(
      (product) => product.deletedAt !== null,
    );
    const categoryCounts = new Map<string, number>();
    const supplierCounts = new Map<string, number>();

    for (const product of activeProducts) {
      if (product.categoryId) {
        categoryCounts.set(
          product.categoryId,
          (categoryCounts.get(product.categoryId) ?? 0) + 1,
        );
      }

      if (product.supplierId) {
        supplierCounts.set(
          product.supplierId,
          (supplierCounts.get(product.supplierId) ?? 0) + 1,
        );
      }
    }

    const activeCategories = mappedCategories
      .filter((category) => category.deletedAt === null)
      .map((category) => ({
        ...category,
        activeProductsCount: categoryCounts.get(category.categoryId) ?? 0,
      }));
    const activeSuppliers = mappedSuppliers
      .filter((supplier) => supplier.deletedAt === null)
      .map((supplier) => ({
        ...supplier,
        activeProductsCount: supplierCounts.get(supplier.supplierId) ?? 0,
      }));

    if (
      activeProducts.length !== summary.activeProducts ||
      archivedProducts.length !== summary.archivedProducts ||
      activeCategories.length !== summary.categories ||
      activeSuppliers.length !== summary.suppliers ||
      mappedPrices.length !== summary.priceRows
    ) {
      return staffWorkbookSnapshotFailure(context, "validation_failed");
    }

    return {
      archivedProducts,
      catalogScope: manifest.scope.catalogScope,
      categories: activeCategories,
      legacyOwnerUserId: manifest.scope.legacyOwnerUserId,
      mapping: manifest.scope.mapping,
      prices: mappedPrices,
      products: activeProducts,
      readOnly: true,
      reason:
        "Revision-pinned, lease-bound staff catalog snapshot verified for workbook use.",
      selectedShop: context.selectedShop,
      source: "supabase_server",
      status: "ready",
      summary,
      suppliers: activeSuppliers,
    };
  } catch (error) {
    if (error instanceof CatalogWorkbookExportResourceError) throw error;
    return staffWorkbookSnapshotFailure(context, "db_failure");
  }
}

async function getCatalogWorkbookReadModel(
  context: ReadyShopActionContext,
  resource?: CatalogWorkbookReadResource,
): Promise<ShopInventoryReadModel> {
  const readResource = resource ?? unboundedCatalogWorkbookReadResource;
  if (resource || context.principalKind === "pos_staff_manager") {
    return getStaffWorkbookInventoryReadModel(context, readResource);
  }

  if (!resource) {
    return getShopInventoryReadModel({
      client: context.supabase,
      requestedShopId: context.selectedShop.shopId,
      rowLimit: "all",
    });
  }

  return getShopInventoryReadModel({
    client: context.supabase,
    requestedShopId: context.selectedShop.shopId,
    rowLimit: "all",
  });
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
  return Boolean(
    data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      (data as { ok?: unknown }).ok === true &&
      (data as { code?: unknown }).code === "success",
  );
}

function rpcChunkResultMatchesCounts(
  data: unknown,
  applied: number | null,
  failed: number | null,
  expectedRows: number,
) {
  if (
    applied === null ||
    failed === null ||
    applied + failed !== expectedRows
  ) {
    return false;
  }

  if (failed === 0) {
    return rpcResultOk(data);
  }

  return Boolean(
    data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      (data as { ok?: unknown }).ok === false &&
      (data as { code?: unknown }).code === "partial_failure",
  );
}

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_UUID_PATTERN.test(value);
}

function* chunkRows<T>(rows: readonly T[], chunkSize: number) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    yield rows.slice(index, index + chunkSize);
  }
}

function effectiveProductRowsLastWins(
  rows: readonly ParsedProductRow[],
): ParsedProductRow[] {
  const byBarcode = new Map<string, ParsedProductRow>();
  const withoutBarcode: ParsedProductRow[] = [];

  for (const row of rows) {
    const key = row.barcode.trim();
    if (!key) {
      withoutBarcode.push(row);
      continue;
    }
    byBarcode.set(key, row);
  }

  return [...withoutBarcode, ...byBarcode.values()];
}

function bulkProductSyncEventError(code: ShopAdminActionCode): WorkbookRowError {
  return {
    code,
    field: "sync_events",
    message:
      "Products were applied, but the catalog sync event could not be recorded.",
    row: 0,
    sheet: "Products",
  };
}

function priceHistorySyncEventError(code: ShopAdminActionCode): WorkbookRowError {
  return {
    code,
    field: "sync_events",
    message:
      "PriceHistory rows were applied, but the prices sync event could not be recorded.",
    row: 0,
    sheet: "PriceHistory",
  };
}

async function emitBulkProductImportSyncEvents(
  context: ReadyShopActionContext,
  productIds: readonly string[],
) {
  for (const productIdChunk of chunkRows(productIds, BULK_PRODUCT_IMPORT_CHUNK_SIZE)) {
    const syncResult = await emitCatalogBulkProductImportSyncEvent({
      context,
      productIds: productIdChunk,
    });

    if (!syncResult.ok) {
      return syncResult.code;
    }
  }

  return null;
}

async function emitPriceHistoryImportSyncEvents(
  context: ReadyShopActionContext,
  priceIds: readonly string[],
) {
  const syncResult = await emitPriceHistoryImportSyncEvent({
    context,
    priceIds,
  });

  return syncResult.ok ? null : syncResult.code;
}

function priceIdsFromPayload(value: unknown) {
  const payload = payloadRecord(value);
  const rawPriceIds = payload.priceIds;

  if (!Array.isArray(rawPriceIds)) {
    return [];
  }

  const priceIds: string[] = [];

  for (const item of rawPriceIds) {
    if (isCanonicalUuid(item)) {
      priceIds.push(item);
      continue;
    }

    if (!item || typeof item !== "object") {
      continue;
    }

    const priceId = (item as Record<string, unknown>).priceId;

    if (isCanonicalUuid(priceId)) {
      priceIds.push(priceId);
    }
  }

  return priceIds.length === new Set(priceIds).size ? priceIds : [];
}

type ProductPayloadReferenceIndex = {
  byBarcode: ReadonlyMap<string, StaffAwareBulkProductImportPayload>;
  byItemNumber: ReadonlyMap<string, StaffAwareBulkProductImportPayload>;
  byRequestedProductId: ReadonlyMap<
    string,
    StaffAwareBulkProductImportPayload
  >;
};

function buildProductPayloadReferenceIndex(
  payloadRows: readonly StaffAwareBulkProductImportPayload[],
): ProductPayloadReferenceIndex {
  const byBarcode = new Map<string, StaffAwareBulkProductImportPayload>();
  const byItemNumber = new Map<string, StaffAwareBulkProductImportPayload>();
  const byRequestedProductId = new Map<
    string,
    StaffAwareBulkProductImportPayload
  >();

  for (const row of payloadRows) {
    const barcode = row.barcode.trim();
    const itemNumber = row.item_number?.trim() ?? "";
    if (barcode) byBarcode.set(barcode, row);
    if (itemNumber) byItemNumber.set(itemNumber, row);
    if (row.product_id) byRequestedProductId.set(row.product_id, row);
  }

  return { byBarcode, byItemNumber, byRequestedProductId };
}

function rememberAppliedProductReference(
  maps: ReturnType<typeof buildProductIdMaps>,
  payloadRows: ProductPayloadReferenceIndex,
  product: {
    barcode?: string | null;
    itemNumber?: string | null;
    productId: string;
  },
) {
  const barcodeKey = product.barcode ?? "";
  const itemNumberKey = product.itemNumber ?? "";
  const sourceRow =
    payloadRows.byRequestedProductId.get(product.productId) ??
    (barcodeKey ? payloadRows.byBarcode.get(barcodeKey) : undefined) ??
    (itemNumberKey
      ? payloadRows.byItemNumber.get(itemNumberKey)
      : undefined);

  if (sourceRow?.product_id) {
    maps.byImportedProductId.set(sourceRow.product_id, product.productId);
  }

  maps.byProductId.add(product.productId);

  if (product.barcode) {
    maps.byBarcode.set(product.barcode, product.productId);
  }

  if (product.itemNumber) {
    maps.byItemNumber.set(product.itemNumber, product.productId);
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
      product_id: existing?.productId ?? row.productId,
      product_name: merged.productName,
      purchase_price: merged.purchasePrice,
      retail_price: merged.retailPrice,
      second_product_name: merged.secondProductName,
      stock_quantity: merged.stockQuantity,
      supplier_id: merged.supplierId,
    };
  });
  const productPayloadReferences =
    buildProductPayloadReferenceIndex(productPayload);

  if (context.principalKind === "pos_staff_manager") {
    const productImport = await applyStaffAwareBulkProductImport(
      context,
      productPayload,
    );

    for (const product of productImport.productIds) {
      rememberAppliedProductReference(
        productIdMaps,
        productPayloadReferences,
        product,
      );
    }

    const syncEventFailure = await emitBulkProductImportSyncEvents(
      context,
      productImport.productIds.map((product) => product.productId),
    );

    return syncEventFailure
      ? {
          ...productImport,
          rowErrors: [
            ...productImport.rowErrors,
            bulkProductSyncEventError(syncEventFailure),
          ],
          syncEventFailure,
        }
      : productImport;
  }

  let failedRows = 0;
  let productsApplied = 0;
  const rowErrors: WorkbookRowError[] = [];
  const productChunks = Array.from(
    chunkRows(productPayload, BULK_PRODUCT_IMPORT_CHUNK_SIZE),
  );

  for (const [chunkIndex, productChunk] of productChunks.entries()) {
    const remainingRows = productChunks
      .slice(chunkIndex)
      .reduce((count, chunk) => count + chunk.length, 0);
    const { data, error } = await context.supabase.rpc(
      "shop_catalog_import_products",
      {
        p_products: productChunk,
        p_shop_id: context.selectedShop.shopId,
      },
    );

    if (error) {
      failedRows += remainingRows;
      rowErrors.push({
        field: "products",
        message:
          "Products import chunk failed before completion. Re-run preview before retrying.",
        row: chunkIndex + 1,
        sheet: "Products",
      });
      break;
    }

    const payload = payloadRecord(data);
    const productIds = Array.isArray(payload.productIds)
      ? payload.productIds
      : [];
    const appliedProducts: Array<{
      barcode: string;
      itemNumber: string;
      productId: string;
    }> = [];
    const appliedProductIds: string[] = [];

    for (const product of productIds) {
      if (!product || typeof product !== "object") {
        continue;
      }

      const row = product as Record<string, unknown>;
      const productId = isCanonicalUuid(row.productId) ? row.productId : "";
      const barcode = typeof row.barcode === "string" ? row.barcode : "";
      const itemNumber =
        typeof row.itemNumber === "string" ? row.itemNumber : "";

      if (!productId) {
        continue;
      }

      appliedProductIds.push(productId);
      appliedProducts.push({
        barcode,
        itemNumber,
        productId,
      });
    }

    const rpcFailedRows = nonnegativeSafeIntegerFromPayload(payload.failedRows);
    const rpcProductsApplied = nonnegativeSafeIntegerFromPayload(
      payload.productsApplied,
    );
    const idsAreExact =
      rpcProductsApplied !== null &&
      appliedProductIds.length === rpcProductsApplied &&
      appliedProductIds.length === new Set(appliedProductIds).size;
    const validResult =
      idsAreExact &&
      rpcChunkResultMatchesCounts(
        data,
        rpcProductsApplied,
        rpcFailedRows,
        productChunk.length,
      );

    if (!validResult) {
      failedRows += remainingRows;
      rowErrors.push({
        field: "products",
        message:
          "Products import chunk returned an invalid result. Re-run preview before retrying.",
        row: chunkIndex + 1,
        sheet: "Products",
      });
      break;
    }
    const appliedCount = rpcProductsApplied ?? 0;
    const failedCount = rpcFailedRows ?? 0;

    for (const product of appliedProducts) {
      rememberAppliedProductReference(
        productIdMaps,
        productPayloadReferences,
        product,
      );
    }

    failedRows += failedCount;
    productsApplied += appliedCount;

    const syncEventFailure = await emitBulkProductImportSyncEvents(
      context,
      appliedProductIds,
    );

    if (syncEventFailure) {
      rowErrors.push(bulkProductSyncEventError(syncEventFailure));

      return {
        failedRows,
        productsApplied,
        rowErrors,
        syncEventFailure,
      };
    }

    if (failedCount > 0) {
      failedRows += productChunks
        .slice(chunkIndex + 1)
        .reduce((count, chunk) => count + chunk.length, 0);
      rowErrors.push({
        field: "products",
        message:
          "Products import stopped after a partial chunk. Re-run preview before retrying.",
        row: chunkIndex + 1,
        sheet: "Products",
      });
      break;
    }
  }

  return {
    failedRows,
    productsApplied,
    rowErrors,
    stoppedEarly: rowErrors.length > 0,
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
      requiredPermission: permission,
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

  const readModel = await getCatalogWorkbookReadModel(context);

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

  let previewParsed = parsed;
  let syncPreview: CatalogWorkbookSyncPreview | undefined;
  let syncAdjustments: CatalogWorkbookRowAdjustment[] = [];

  if (input.rowAdjustments !== undefined) {
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

    syncAdjustments = adjustmentValidation.adjustments;
    if (parsed.importMode === "supplier") {
      const defaultValidation = validateDefaultAssignments({
        defaultCategoryName: input.defaultCategoryName,
        defaultSupplierName: input.defaultSupplierName,
      });

      if (!defaultValidation.valid) {
        return {
          ...defaultValidation,
          previewDigest: boundPreviewDigest,
        };
      }

      previewParsed = applySupplierWorkbookRows(
        parsed,
        syncAdjustments,
        readModel,
        {
          defaultCategoryName: defaultValidation.defaultCategoryName,
          defaultSupplierName: defaultValidation.defaultSupplierName,
        },
      );
    } else {
      previewParsed = applyRowAdjustments(parsed, syncAdjustments);
    }
  }

  const validation = validateCatalogImportRows(
    previewParsed,
    readModelAsExistingRows(readModel),
  );
  const priceHistoryRowErrors = validatePriceHistoryRows(previewParsed, readModel);
  const rawRowErrors = [
    ...previewParsed.rowErrors,
    ...validation.rowErrors,
    ...priceHistoryRowErrors,
  ];
  const rowErrors = previewParsed.importMode === "supplier"
    ? supplierVisibleRowErrors(rawRowErrors)
    : rawRowErrors;
  const rawRowWarnings = [
    ...previewParsed.rowWarnings,
    ...validation.rowWarnings,
    ...(previewParsed.importMode === "supplier"
      ? supplierReferenceWarnings(rawRowErrors)
      : []),
  ];
  const safetyNotes = rawRowWarnings.filter(isSafetySanitizationIssue);
  const rowWarnings = rawRowWarnings.filter(
    (issue) => !isSafetySanitizationIssue(issue),
  );
  const sheetSummaries = decorateSheetSummaries(
    previewParsed.sheetSummaries,
    rowErrors,
    rowWarnings,
  );
  const previewRows = decorateCatalogPreviewRows(
    previewParsed,
    rowErrors,
    rowWarnings,
    readModel,
  );
  const duplicates = rowErrors.filter((issue) =>
    (issue.code ?? "").startsWith("duplicate_"),
  ).length;
  const supplierChanges = supplierChangeSummary(previewParsed.suppliers, readModel);
  const categoryChanges = categoryChangeSummary(previewParsed.categories, readModel);
  const priceHistoryPurchase = previewParsed.priceHistory.filter(
    (row) => row.type === "PURCHASE",
  ).length;
  const priceHistoryRetail = previewParsed.priceHistory.filter(
    (row) => row.type === "RETAIL",
  ).length;
  const blockedRows = uniqueIssueRowCount(rowErrors);
  const textNormalizations = rowWarnings.filter(
    (issue) => issue.code === CATALOG_TEXT_NORMALIZED_CODE,
  ).length;

  if (
    parsed.importMode === "database" ||
    input.rowAdjustments !== undefined
  ) {
    syncPreview = buildSupplierSyncPreview({
      adjustedParsed: previewParsed,
      adjustments: syncAdjustments,
      boundPreviewDigest,
      readModel,
      rowErrors,
      rowWarnings,
      sourceParsed: parsed,
    });
  }

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
      droppedRows: previewParsed.droppedRows,
      fileDigest: parsed.fileDigest,
      importMode: parsed.importMode,
      errors: rowErrors.length,
      "no_purge": true,
      priceHistory: previewParsed.priceHistory.length,
      products: previewParsed.products.length,
      "preview.valid": rowErrors.length === 0,
      selectedProductSheet: parsed.selectedProductSheet,
      safetySanitizations: safetyNotes.length,
      textNormalizations,
      validRows: previewParsed.validRows,
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
    previewRowsTruncated: previewParsed.previewRowsTruncated,
    rawPreviewColumns: parsed.rawPreviewColumns,
    rawPreviewRows: parsed.rawPreviewRows,
    rawWorkbookContextRows: parsed.rawWorkbookContextRows,
    recognizedColumnSources: parsed.recognizedColumnSources,
    rowErrors,
    rowWarnings,
    safetyNotes,
    selectedProductSheet: parsed.selectedProductSheet,
    sheetSummaries,
    syncPreview,
    syncPreviewDigest: syncPreview?.fingerprint,
    summary: {
      ...validation.summary,
      blockedRows,
      duplicates,
      droppedRows: previewParsed.droppedRows,
      errors: rowErrors.length,
      newCategories: categoryChanges.newCategories,
      newSuppliers: supplierChanges.newSuppliers,
      operationalWarnings: rowWarnings.length,
      priceHistory: previewParsed.priceHistory.length,
      priceHistoryPurchase,
      priceHistoryRetail,
      safetySanitizations: safetyNotes.length,
      textNormalizations,
      updatedCategories: categoryChanges.updatedCategories,
      updatedSuppliers: supplierChanges.updatedSuppliers,
      validRows: previewParsed.validRows,
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
    syncPreviewDigest?: string;
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

  const readModel = await getCatalogWorkbookReadModel(context);

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
  const rawRowWarnings = [
    ...adjustedParsed.rowWarnings,
    ...validation.rowWarnings,
    ...(adjustedParsed.importMode === "supplier"
      ? supplierReferenceWarnings(rawRowErrors)
      : []),
  ];
  const rowWarnings = rawRowWarnings.filter(
    (issue) => !isSafetySanitizationIssue(issue),
  );
  const syncPreview = buildSupplierSyncPreview({
    adjustedParsed,
    adjustments: adjustmentValidation.adjustments,
    boundPreviewDigest,
    readModel,
    rowErrors,
    rowWarnings,
    sourceParsed: parsed,
  });

  if (!input.syncPreviewDigest) {
    return shopAdminActionResult("preview_required", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  if (input.syncPreviewDigest !== syncPreview.fingerprint) {
    return {
      ...shopAdminActionResult("preview_mismatch", {
        ok: false,
        shopId: context.selectedShop.shopId,
      }),
      previewDigest: boundPreviewDigest,
      rowErrors: syncPreview.errors,
    };
  }

  if (!syncPreview.canApply) {
    return {
      ...shopAdminActionResult("validation_failed", {
        ok: false,
        shopId: context.selectedShop.shopId,
      }),
      previewDigest: boundPreviewDigest,
      rowErrors: syncPreview.errors,
    };
  }

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
  const effectiveProductsToApply = effectiveProductRowsLastWins(adjustedParsed.products);
  const changedSupplierRows = new Set(
    [
      ...syncPreview.newProducts.map((row) => `${row.rowNumber}:${row.barcode}`),
      ...syncPreview.updatedProducts.map((row) => `${row.rowNumber}:${row.barcode}`),
    ],
  );
  const productsToApply = effectiveProductsToApply.filter((row) =>
    changedSupplierRows.has(`${row.rowNumber}:${row.barcode}`),
  );
  let suppliersApplied = 0;
  let categoriesApplied = 0;
  let productsApplied = 0;
  let priceHistoryApplied = 0;
  let failedRows = 0;
  let bulkApplyStopped = false;
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

  if (productsToApply.length >= BULK_PRODUCT_IMPORT_THRESHOLD) {
    const productImport = await applyBulkProductImport(
      context,
      productsToApply,
      readModel.products,
      supplierIdsByName,
      categoryIdsByName,
      productIdMaps,
    );

    productsApplied += productImport.productsApplied;
    failedRows += productImport.failedRows;
    applyRowErrors.push(...productImport.rowErrors);
    bulkApplyStopped = productImport.stoppedEarly === true;

    const syncEventFailure = "syncEventFailure" in productImport
      ? productImport.syncEventFailure
      : null;

    if (syncEventFailure) {
      return {
        ...shopAdminActionResult(syncEventFailure, {
          ok: false,
          shopId: context.selectedShop.shopId,
        }),
        previewDigest: boundPreviewDigest,
        rowErrors: applyRowErrors,
        summary: {
          categoriesApplied,
          failedRows,
          priceHistoryApplied,
          productsApplied,
          suppliersApplied,
        },
      };
    }
  } else {
    for (const row of productsToApply) {
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
            expectedUpdatedAt: existing.updatedAt,
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
        applyRowErrors.push({
          code: result.code,
          field: "product",
          message:
            "Product row was rejected at the authoritative catalog boundary.",
          row: row.rowNumber,
          sheet: "Products",
        });
      }
    }
  }

  if (!bulkApplyStopped && adjustedParsed.priceHistory.length > 0) {
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
      bulkApplyStopped = priceImport.stoppedEarly;

      const syncEventFailure = await emitPriceHistoryImportSyncEvents(
        context,
        priceImport.priceIds,
      );

      if (syncEventFailure) {
        return {
          ...shopAdminActionResult(syncEventFailure, {
            ok: false,
            shopId: context.selectedShop.shopId,
          }),
          previewDigest: boundPreviewDigest,
          rowErrors: [
            ...applyRowErrors,
            priceHistorySyncEventError(syncEventFailure),
          ],
          summary: {
            categoriesApplied,
            failedRows,
            priceHistoryApplied,
            productsApplied,
            suppliersApplied,
          },
        };
      }
    } else {
      const priceChunks = Array.from(
        chunkRows(pricePayload, BULK_PRICE_HISTORY_IMPORT_CHUNK_SIZE),
      );

      for (const [chunkIndex, priceChunk] of priceChunks.entries()) {
        if (priceChunk.length === 0) {
          continue;
        }

        const remainingRows = priceChunks
          .slice(chunkIndex)
          .reduce((count, chunk) => count + chunk.length, 0);

        const { data, error } = await context.supabase.rpc(
          "shop_catalog_import_price_history",
          {
            p_prices: priceChunk,
            p_shop_id: context.selectedShop.shopId,
          },
        );

        if (error) {
          failedRows += remainingRows;
          applyRowErrors.push({
            field: "priceHistory",
            message:
              "Price history import chunk failed before completion. Re-run preview before retrying.",
            row: 0,
            sheet: "PriceHistory",
          });
          break;
        } else {
          const payload = payloadRecord(data);
          const rpcFailedRows = nonnegativeSafeIntegerFromPayload(
            payload.failedRows,
          );
          const rpcPriceHistoryApplied = nonnegativeSafeIntegerFromPayload(
            payload.priceHistoryApplied,
          );
          const priceIds = priceIdsFromPayload(data);
          const idsAreExact =
            rpcPriceHistoryApplied !== null &&
            priceIds.length === rpcPriceHistoryApplied;
          const validResult =
            idsAreExact &&
            rpcChunkResultMatchesCounts(
              data,
              rpcPriceHistoryApplied,
              rpcFailedRows,
              priceChunk.length,
            );

          if (!validResult) {
            failedRows += remainingRows;
            applyRowErrors.push({
              field: "priceHistory",
              message:
                "Price history import chunk returned an invalid result. Re-run preview before retrying.",
              row: 0,
              sheet: "PriceHistory",
            });
            break;
          }
          const appliedCount = rpcPriceHistoryApplied ?? 0;
          const failedCount = rpcFailedRows ?? 0;

          priceHistoryApplied += appliedCount;
          failedRows += failedCount;

          const syncEventFailure = await emitPriceHistoryImportSyncEvents(
            context,
            priceIds,
          );

          if (syncEventFailure) {
            return {
              ...shopAdminActionResult(syncEventFailure, {
                ok: false,
                shopId: context.selectedShop.shopId,
              }),
              previewDigest: boundPreviewDigest,
              rowErrors: [
                ...applyRowErrors,
                priceHistorySyncEventError(syncEventFailure),
              ],
              summary: {
                categoriesApplied,
                failedRows,
                priceHistoryApplied,
                productsApplied,
                suppliersApplied,
              },
            };
          }

          if (failedCount > 0) {
            failedRows += priceChunks
              .slice(chunkIndex + 1)
              .reduce((count, chunk) => count + chunk.length, 0);
            applyRowErrors.push({
              field: "priceHistory",
              message:
                "Price history import stopped after a partial chunk. Re-run preview before retrying.",
              row: 0,
              sheet: "PriceHistory",
            });
            break;
          }
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
    productsToApply.length > 0
  ) {
    const historyResult = await upsertSupplierImportHistoryEntry({
      appliedAt: new Date(),
      categoryName: defaultValidation.defaultCategoryName,
      context,
      fileName: input.fileName,
      previewDigest: boundPreviewDigest,
      rows: supplierImportHistoryRows(productsToApply, readModel),
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

async function serializeBoundedCatalogWorkbook(
  sheets: { data: WritableSheetData; sheet: string }[],
  signal: AbortSignal,
) {
  if (signal.aborted) {
    throw new CatalogWorkbookExportResourceError(
      signal.reason === "resource_deadline_exceeded"
        ? "resource_deadline_exceeded"
        : "request_cancelled",
    );
  }
  // write-excel-file materializes all worksheet XML before producing either a
  // stream or a buffer. The authoritative preflight therefore bounds source
  // text and worst-case expansion before this allocation; toStream() would not
  // reduce peak memory and would create a misleading streaming guarantee.
  const buffer = await writeXlsxFile(sheets).toBuffer();
  if (signal.aborted) {
    throw new CatalogWorkbookExportResourceError(
      signal.reason === "resource_deadline_exceeded"
        ? "resource_deadline_exceeded"
        : "request_cancelled",
    );
  }
  return buffer;
}

export async function buildCatalogWorkbookExport(
  requestedShopId?: string,
  options: {
    deadlineMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<CatalogWorkbookExport> {
  const context = await resolveShopActionContext(requestedShopId, "catalog.export");

  if (context.status !== "ready") {
    return context.result;
  }
  const resource = createCatalogWorkbookExportResourceEnvelope(options);

  try {
    const readModel = await getCatalogWorkbookReadModel(context, resource);

    if (readModel.status !== "ready") {
      return shopAdminActionResult("unauthorized_or_unmapped", {
        ok: false,
        shopId: context.selectedShop.shopId,
      });
    }

    const finalized = await finalizeBoundedWorkbookExport({
      audit: (metrics) =>
        auditImportExport(
          context.selectedShop.shopId,
          "catalog.export",
          "shop.catalog.export",
          "success",
          "success",
          {
            categories: readModel.categories.length,
            priceHistory: readModel.prices.length,
            products: readModel.products.length,
            resourceDeadlineMs: metrics.deadlineMs,
            resourceElapsedMs: metrics.elapsedMs,
            resourceEstimatedBytes: metrics.estimatedBytes,
            resourceFinalBytes: metrics.finalBytes,
            resourcePeakConcurrency: metrics.peakConcurrency,
            resourceSourceTextBytes: metrics.sourceTextBytes,
            resourceTotalCells: metrics.totalCells,
            resourceTotalRows: metrics.totalRows,
            suppliers: readModel.suppliers.length,
          },
        ),
      counts: {
        categories: readModel.categories.length,
        prices: readModel.prices.length,
        products:
          readModel.products.length + readModel.archivedProducts.length,
        suppliers: readModel.suppliers.length,
      },
      resource,
      serialize: (signal) =>
        serializeBoundedCatalogWorkbook([
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
              ...readModel.prices.map((price) => [
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
        ], signal),
    });
    const { auditResult, buffer, metrics } = finalized;

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
      metrics,
    };
  } catch (error) {
    if (error instanceof CatalogWorkbookExportResourceError) {
      return {
        ...shopAdminActionResult(error.code, {
          ok: false,
          shopId: context.selectedShop.shopId,
        }),
        metrics: resource.metrics(),
      };
    }
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  } finally {
    resource.dispose();
  }
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
