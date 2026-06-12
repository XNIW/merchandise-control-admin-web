import "server-only";

import { createHash } from "node:crypto";
import { DOMParser, type Element as XmlElement } from "@xmldom/xmldom";
import readXlsxFile, { type SheetData } from "read-excel-file/node";
import * as unzipper from "unzipper";
import writeXlsxFile, {
  type SheetData as WritableSheetData,
} from "write-excel-file/node";
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
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  sanitizeSpreadsheetCell,
} from "./import-export-readiness";
import {
  detectCatalogImportHeaderRow,
  mergeProductImportForApply,
  normalizeCatalogImportHeader,
  validateCatalogImportRows,
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

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const BULK_PRODUCT_IMPORT_THRESHOLD = 500;
const BULK_PRODUCT_IMPORT_CHUNK_SIZE = 500;
const BULK_PRICE_HISTORY_IMPORT_CHUNK_SIZE = 1_000;
const MAX_PREVIEW_ROWS = 500;
const MAX_ROW_ADJUSTMENTS = MAX_PREVIEW_ROWS;
const MAX_ROW_ADJUSTMENTS_JSON_BYTES = 64_000;

type CatalogWorkbookImportMode = "supplier" | "database";

type CatalogWorkbookInput = {
  bytes: Buffer;
  fileName: string;
  importMode?: CatalogWorkbookImportMode;
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

type ParsedWorkbook = {
  categories: ParsedCategoryRow[];
  confidence: number;
  detectedHeaderRow: number | null;
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
  originalColumns: string[];
  priceHistory: ParsedPriceHistoryRow[];
  previewRows: CatalogWorkbookPreviewRow[];
  previewRowsTruncated: boolean;
  products: ParsedProductRow[];
  rowErrors: WorkbookRowError[];
  rowWarnings: WorkbookRowError[];
  selectedProductSheet: string;
  suppliers: ParsedSupplierRow[];
  unmappedColumns: string[];
  validRows: number;
  workbookMetadata: CatalogWorkbookMetadata;
};

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
  itemNumber?: string;
  productName: string;
  retailPrice?: number;
  rowFingerprint: string;
  rowNumber: number;
  status: "Ready" | "Warning" | "Blocked" | "Duplicate" | "Update" | "New";
  stockQuantity?: number;
  supplierName?: string;
  warnings: number;
};

export type CatalogWorkbookRowAdjustment = {
  retailPrice?: number | null;
  rowFingerprint: string;
  rowNumber: number;
  stockQuantity?: number | null;
};

export type CatalogWorkbookPreview = ShopAdminActionResult & {
  confidence?: number;
  detectedHeaderRow?: number | null;
  detectedMapping?: ParsedWorkbook["detectedMapping"];
  originalColumns?: string[];
  previewDigest?: string;
  previewRows?: CatalogWorkbookPreviewRow[];
  previewRowsTruncated?: boolean;
  rowErrors?: WorkbookRowError[];
  rowWarnings?: WorkbookRowError[];
  selectedProductSheet?: string;
  summary?: {
    categories: number;
    duplicates?: number;
    droppedRows?: number;
    errors: number;
    newProducts: number;
    priceHistory: number;
    products: number;
    suppliers: number;
    updatedProducts: number;
    validRows?: number;
    warnings: number;
  };
  unmappedColumns?: string[];
  workbookMetadata?: CatalogWorkbookMetadata;
};

export type CatalogWorkbookApplyResult = ShopAdminActionResult & {
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
  rowFingerprints: string[];
  selectedProductSheet: string;
}) {
  return jsonDigest(input);
}

function validateWorkbookFile(input: CatalogWorkbookInput) {
  const extensionOk = input.fileName.toLowerCase().endsWith(".xlsx");
  const mimeOk =
    input.mimeType === XLSX_CONTENT_TYPE ||
    input.mimeType === "application/octet-stream" ||
    input.mimeType === "";

  if (input.bytes.byteLength > MAX_IMPORT_BYTES) {
    return shopAdminActionResult("file_too_large", { ok: false });
  }

  if (!extensionOk || !mimeOk) {
    return shopAdminActionResult("invalid_file_type", { ok: false });
  }

  return null;
}

function normalizeLabel(value: unknown) {
  return sanitizeSpreadsheetCell(String(value ?? "").replace(/\s+/g, " ").trim());
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

  return normalizeLabel(value);
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
  const normalized = normalizeLabel(value);

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

function parseWorkbookNumber(value: string) {
  const compact = value.trim().replace(/[^\d,.-]/g, "");

  if (!compact) {
    return Number.NaN;
  }

  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(compact)) {
    return Number(compact.replace(/\./g, "").replace(",", "."));
  }

  if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(compact)) {
    return Number(compact.replace(/,/g, ""));
  }

  return Number(compact.replace(",", "."));
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
      return normalizeLabel(row[index]);
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

  return normalizeLabel(value);
}

function priceHistoryTextValue(
  headers: Map<string, number>,
  row: readonly unknown[],
  aliases: readonly string[],
) {
  for (const alias of aliases) {
    const index = headers.get(normalizeCatalogImportHeader(alias));

    if (index !== undefined) {
      return normalizeLabel(row[index]);
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

function isProductSummaryRow(row: readonly unknown[]) {
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

  return row.some((cell) => summaryLabels.has(normalizeCatalogImportHeader(cell)));
}

type ParsedProductsResult = {
  confidence: number;
  detectedHeaderRow: number | null;
  detectedMapping: ParsedWorkbook["detectedMapping"];
  droppedRows: number;
  products: ParsedProductRow[];
  validRows: number;
};

function detectionMapping(
  rows: SheetData,
  detection: NonNullable<ReturnType<typeof detectCatalogImportHeaderRow>>,
) {
  const headerRow = rows[detection.headerRowIndex] ?? [];
  const mapping: ParsedWorkbook["detectedMapping"] = {};

  for (const [field, columnIndex] of detection.headers.entries()) {
    mapping[field] = {
      columnIndex,
      columnLabel: normalizeLabel(headerRow[columnIndex]),
      confidence:
        field === "barcode" || field === "productName" ? "high" : "medium",
    };
  }

  return mapping;
}

function originalColumns(
  rows: SheetData,
  detectedHeaderRow: number | null,
) {
  if (!detectedHeaderRow) {
    return [];
  }

  return (rows[detectedHeaderRow - 1] ?? [])
    .map((cell, index) => normalizeLabel(cell) || `Column ${index + 1}`)
    .filter((label) => label.length > 0);
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

function parsedPreviewRows(
  products: readonly ParsedProductRow[],
): CatalogWorkbookPreviewRow[] {
  return products.slice(0, MAX_PREVIEW_ROWS).map((product) => ({
    barcode: product.barcode,
    categoryName: product.categoryName,
    itemNumber: product.itemNumber,
    productName: product.productName,
    retailPrice: product.retailPrice,
    rowFingerprint: catalogImportRowFingerprint(product),
    rowNumber: product.rowNumber,
    status: "Ready",
    stockQuantity: product.stockQuantity,
    supplierName: product.supplierName,
    warnings: 0,
  }));
}

function parseProducts(
  rows: SheetData,
  rowErrors: WorkbookRowError[],
  sheet = "Products",
): ParsedProductsResult {
  if (rows.length === 0) {
    return {
      confidence: 0,
      detectedHeaderRow: null,
      detectedMapping: {},
      droppedRows: 0,
      products: [],
      validRows: 0,
    };
  }

  const detection = detectCatalogImportHeaderRow(rows);
  const parsed: ParsedProductRow[] = [];
  let droppedRows = 0;

  if (!detection) {
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
      validRows: 0,
    };
  }

  for (const { row, rowNumber } of nonEmptyRows(
    rows,
    detection.headerRowIndex + 1,
  )) {
    if (isProductSummaryRow(row)) {
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
      itemNumber:
        productTextValue(detection.headers, row, "itemNumber") || undefined,
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
    detectedHeaderRow: detection.headerRowIndex + 1,
    detectedMapping: detectionMapping(rows, detection),
    droppedRows,
    products: parsed,
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

function selectProductSheet(
  sheets: readonly { data: SheetData; sheet: string }[],
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

    if (!selectedProductSheet || score > selectedProductSheet.score) {
      selectedProductSheet = {
        detection,
        rows: sheet.data,
        score,
        sheet: sheet.sheet,
      };
    }
  }

  return (
    selectedProductSheet ?? {
      detection: null,
      rows: [],
      score: 0,
      sheet: "Products",
    }
  );
}

async function parseWorkbook(
  input: CatalogWorkbookInput,
): Promise<ParsedWorkbook | ShopAdminActionResult> {
  const fileError = validateWorkbookFile(input);

  if (fileError) {
    return fileError;
  }

  let sheets: Awaited<ReturnType<typeof readXlsxFile<number>>>;

  try {
    sheets = await readXlsxFile<number>(input.bytes);
  } catch {
    try {
      sheets = await readOoxmlWorkbookFallback(input.bytes);
    } catch {
      return shopAdminActionResult("invalid_workbook", { ok: false });
    }

    if (sheets.length === 0) {
      return shopAdminActionResult("invalid_workbook", { ok: false });
    }
  }
  const rowErrors: WorkbookRowError[] = [];
  const rowWarnings: WorkbookRowError[] = [];
  const selectedProductSheet = selectProductSheet(sheets);
  const supplierRows = getSheetRows(sheets, "Suppliers");
  const categoryRows = getSheetRows(sheets, "Categories");
  const priceHistoryRows = getSheetRows(sheets, "PriceHistory");
  const productResult = parseProducts(
    selectedProductSheet.rows,
    rowErrors,
    selectedProductSheet.sheet,
  );
  const suppliers = parseSuppliers(supplierRows, rowErrors);
  const categories = parseCategories(categoryRows, rowErrors);
  const priceHistory = parsePriceHistory(priceHistoryRows, rowErrors);
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
        value.startsWith("'") &&
        formulaEscapeFields.has(field)
      ) {
        rowWarnings.push({
          field,
          message: "Leading formula character escaped.",
          row: product.rowNumber,
          sheet: selectedProductSheet.sheet,
        });
      }
    }
  }

  const fileDigest = previewDigest(input.bytes);
  const importMode = normalizeImportMode(input.importMode);
  const columns = originalColumns(
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
    rowFingerprints,
    selectedProductSheet: selectedProductSheet.sheet,
  });

  return {
    categories,
    confidence: productResult.confidence,
    detectedHeaderRow: productResult.detectedHeaderRow,
    detectedMapping: mapping,
    digest,
    droppedRows: productResult.droppedRows,
    fileDigest,
    importMode,
    originalColumns: columns,
    priceHistory,
    previewRows: parsedPreviewRows(productResult.products),
    previewRowsTruncated: productResult.products.length > MAX_PREVIEW_ROWS,
    products: productResult.products,
    rowErrors,
    rowWarnings,
    selectedProductSheet: selectedProductSheet.sheet,
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

function issueCountByRow(issues: readonly WorkbookRowError[]) {
  const counts = new Map<number, number>();

  for (const issue of issues) {
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
  const errorsByRow = issueCountByRow(rowErrors);
  const warningsByRow = issueCountByRow(rowWarnings);
  const existingBarcodes = new Set(
    readModel.products.map((product) => product.barcode.toLowerCase()),
  );
  const errorTextByRow = new Map<number, string>();

  for (const issue of rowErrors) {
    errorTextByRow.set(
      issue.row,
      `${errorTextByRow.get(issue.row) ?? ""} ${issue.code ?? ""} ${issue.message}`,
    );
  }

  return parsed.previewRows.map((row) => {
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

    if (!retailPrice.ok) {
      rowErrors.push(retailPrice.error);
    }

    if (!stockQuantity.ok) {
      rowErrors.push(stockQuantity.error);
    }

    if (retailPrice.ok && stockQuantity.ok) {
      adjustments.push({
        retailPrice: retailPrice.value,
        rowFingerprint,
        rowNumber,
        stockQuantity: stockQuantity.value,
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
  const productPayload = rows.map((row) => {
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

  let failedRows = 0;
  let productsApplied = 0;

  for (const productChunk of chunkRows(
    productPayload,
    BULK_PRODUCT_IMPORT_CHUNK_SIZE,
  )) {
    const { data, error } = await context.supabase.rpc(
      "shop_catalog_import_products",
      {
        p_products: productChunk,
        p_shop_id: context.selectedShop.shopId,
      },
    );

    if (error) {
      failedRows += productChunk.length;
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

    failedRows += numberFromPayload(payload.failedRows);
    productsApplied += numberFromPayload(payload.productsApplied);
  }

  return {
    failedRows,
    productsApplied,
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

  const validation = validateCatalogImportRows(
    parsed,
    readModelAsExistingRows(readModel),
  );
  const priceHistoryRowErrors = validatePriceHistoryRows(parsed, readModel);
  const rowErrors = [
    ...parsed.rowErrors,
    ...validation.rowErrors,
    ...priceHistoryRowErrors,
  ];
  const rowWarnings = [...parsed.rowWarnings, ...validation.rowWarnings];
  const previewRows = decorateCatalogPreviewRows(
    parsed,
    rowErrors,
    rowWarnings,
    readModel,
  );
  const duplicates = rowErrors.filter((issue) =>
    (issue.code ?? "").startsWith("duplicate_"),
  ).length;

  const auditResult = await auditImportExport(
    context.selectedShop.shopId,
    "catalog.import",
    "shop.catalog.import.preview",
    rowErrors.length > 0 ? "blocked" : "success",
    rowErrors.length > 0 ? "validation_failed" : "success",
    {
      confidence: parsed.confidence,
      detectedHeaderRow: parsed.detectedHeaderRow,
      digest: parsed.digest,
      droppedRows: parsed.droppedRows,
      fileDigest: parsed.fileDigest,
      importMode: parsed.importMode,
      errors: rowErrors.length,
      "no_purge": true,
      priceHistory: parsed.priceHistory.length,
      products: parsed.products.length,
      "preview.valid": rowErrors.length === 0,
      selectedProductSheet: parsed.selectedProductSheet,
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
    detectedHeaderRow: parsed.detectedHeaderRow,
    detectedMapping: parsed.detectedMapping,
    originalColumns: parsed.originalColumns,
    previewDigest: parsed.digest,
    previewRows,
    previewRowsTruncated: parsed.previewRowsTruncated,
    rowErrors,
    rowWarnings,
    selectedProductSheet: parsed.selectedProductSheet,
    summary: {
      ...validation.summary,
      duplicates,
      droppedRows: parsed.droppedRows,
      errors: rowErrors.length,
      priceHistory: parsed.priceHistory.length,
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

  if (
    normalizedConfirmation !== "APPLY" &&
    normalizedConfirmation !== "IMPORT DATABASE"
  ) {
    return shopAdminActionResult("preview_required", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const parsed = await parseWorkbook(input);

  if ("ok" in parsed) {
    return parsed;
  }

  if (!input.previewDigest || input.previewDigest !== parsed.digest) {
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
      previewDigest: parsed.digest,
    };
  }

  const adjustedParsed = applyRowAdjustments(
    parsed,
    adjustmentValidation.adjustments,
  );

  if (adjustedParsed.rowErrors.length > 0) {
    return {
      ...shopAdminActionResult("validation_failed", {
        ok: false,
        shopId: context.selectedShop.shopId,
      }),
      previewDigest: adjustedParsed.digest,
      rowErrors: adjustedParsed.rowErrors,
    };
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

  const validation = validateCatalogImportRows(
    adjustedParsed,
    readModelAsExistingRows(readModel),
  );
  const priceHistoryRowErrors = validatePriceHistoryRows(adjustedParsed, readModel);
  const rowErrors = [
    ...adjustedParsed.rowErrors,
    ...validation.rowErrors,
    ...priceHistoryRowErrors,
  ];

  if (rowErrors.length > 0) {
    return {
      ...shopAdminActionResult("validation_failed", {
        ok: false,
        shopId: context.selectedShop.shopId,
      }),
      previewDigest: adjustedParsed.digest,
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
    const pricePayload = adjustedParsed.priceHistory
      .map((row) => {
        const productId = resolvePriceHistoryProductId(productIdMaps, row);

        if (!productId) {
          failedRows += 1;
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
      } else {
        const payload = payloadRecord(data);
        const rpcFailedRows = numberFromPayload(payload.failedRows);

        priceHistoryApplied += numberFromPayload(payload.priceHistoryApplied);
        failedRows += rpcFailedRows;
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
      digest: adjustedParsed.digest,
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
      previewDigest: adjustedParsed.digest,
      summary,
    };
  }

  return {
    ...shopAdminActionResult(failedRows > 0 ? "db_failure" : "success", {
      ok: failedRows === 0,
      shopId: context.selectedShop.shopId,
    }),
    previewDigest: adjustedParsed.digest,
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
