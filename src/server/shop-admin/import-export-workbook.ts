import "server-only";

import { createHash } from "node:crypto";
import readXlsxFile, { type SheetData } from "read-excel-file/node";
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
  type ShopInventoryProduct,
  type ShopInventorySupplier,
} from "./inventory-read-model";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type CatalogWorkbookInput = {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
  requestedShopId?: string;
};

type WorkbookRowError = {
  field: string;
  message: string;
  row: number;
  sheet: string;
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

type ParsedWorkbook = {
  categories: ParsedCategoryRow[];
  digest: string;
  products: ParsedProductRow[];
  rowErrors: WorkbookRowError[];
  rowWarnings: WorkbookRowError[];
  suppliers: ParsedSupplierRow[];
};

export type CatalogWorkbookPreview = ShopAdminActionResult & {
  previewDigest?: string;
  rowErrors?: WorkbookRowError[];
  rowWarnings?: WorkbookRowError[];
  summary?: {
    categories: number;
    errors: number;
    newProducts: number;
    products: number;
    suppliers: number;
    updatedProducts: number;
    warnings: number;
  };
};

export type CatalogWorkbookApplyResult = ShopAdminActionResult & {
  previewDigest?: string;
  rowErrors?: WorkbookRowError[];
  summary?: {
    categoriesApplied: number;
    failedRows: number;
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

  const numeric = Number(normalized);

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
    const name = textValue(headers, row, ["name", "supplier_name", "supplier"]);
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
    const name = textValue(headers, row, ["name", "category_name", "category"]);
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

function isProductSummaryRow(row: readonly unknown[]) {
  const summaryLabels = new Set([
    "total",
    "totales",
    "valor_total",
    "总数",
    "總數",
    "总价",
    "總價",
  ]);

  return row.some((cell) => summaryLabels.has(normalizeCatalogImportHeader(cell)));
}

function parseProducts(rows: SheetData, rowErrors: WorkbookRowError[]) {
  if (rows.length === 0) {
    return [];
  }

  const detection = detectCatalogImportHeaderRow(rows);
  const parsed: ParsedProductRow[] = [];

  if (!detection) {
    rowErrors.push({
      field: "header",
      message:
        "Products sheet must include recognizable barcode and product columns.",
      row: 1,
      sheet: "Products",
    });

    return parsed;
  }

  for (const { row, rowNumber } of nonEmptyRows(
    rows,
    detection.headerRowIndex + 1,
  )) {
    if (isProductSummaryRow(row)) {
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
        sheet: "Products",
      });
    }

    if (!productName) {
      rowErrors.push({
        field: "productName",
        message: "Product name is required.",
        row: rowNumber,
        sheet: "Products",
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
        "Products",
        rowNumber,
        "purchasePrice",
        rowErrors,
      ),
      retailPrice: productNumberValue(
        detection.headers,
        row,
        "retailPrice",
        "Products",
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
        "Products",
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

  return parsed;
}

async function parseWorkbook(input: CatalogWorkbookInput): Promise<ParsedWorkbook | ShopAdminActionResult> {
  const fileError = validateWorkbookFile(input);

  if (fileError) {
    return fileError;
  }

  const sheets = await readXlsxFile(input.bytes);
  const totalRows = sheets.reduce(
    (count, sheet) => count + Math.max(0, sheet.data.length - 1),
    0,
  );

  if (totalRows > MAX_IMPORT_ROWS) {
    return shopAdminActionResult("row_limit_exceeded", { ok: false });
  }

  const rowErrors: WorkbookRowError[] = [];
  const rowWarnings: WorkbookRowError[] = [];
  const products = parseProducts(
    getSheetRows(sheets, "Products", { fallbackToFirstSheet: true }),
    rowErrors,
  );
  const suppliers = parseSuppliers(getSheetRows(sheets, "Suppliers"), rowErrors);
  const categories = parseCategories(getSheetRows(sheets, "Categories"), rowErrors);

  for (const product of products) {
    for (const [field, value] of Object.entries(product)) {
      if (
        typeof value === "string" &&
        value.startsWith("'") &&
        ["barcode", "productName", "supplierName", "categoryName"].includes(field)
      ) {
        rowWarnings.push({
          field,
          message: "Leading formula character escaped.",
          row: product.rowNumber,
          sheet: "Products",
        });
      }
    }
  }

  return {
    categories,
    digest: previewDigest(input.bytes),
    products,
    rowErrors,
    rowWarnings,
    suppliers,
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
  const rowErrors = [...parsed.rowErrors, ...validation.rowErrors];
  const rowWarnings = [...parsed.rowWarnings, ...validation.rowWarnings];

  const auditResult = await auditImportExport(
    context.selectedShop.shopId,
    "catalog.import",
    "shop.catalog.import.preview",
    rowErrors.length > 0 ? "blocked" : "success",
    rowErrors.length > 0 ? "validation_failed" : "success",
    {
      digest: parsed.digest,
      errors: rowErrors.length,
      "no_purge": true,
      products: parsed.products.length,
      "preview.valid": rowErrors.length === 0,
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
    previewDigest: parsed.digest,
    rowErrors,
    rowWarnings,
    summary: {
      ...validation.summary,
      errors: rowErrors.length,
      warnings: rowWarnings.length,
    },
  };
}

export async function applyCatalogWorkbookImport(
  input: CatalogWorkbookInput & {
    confirmApply: string;
    previewDigest: string;
  },
): Promise<CatalogWorkbookApplyResult> {
  const context = await resolveShopActionContext(
    input.requestedShopId,
    "catalog.import",
  );

  if (context.status !== "ready") {
    return context.result;
  }

  if (input.confirmApply.trim().toUpperCase() !== "APPLY") {
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

  if (parsed.rowErrors.length > 0) {
    return {
      ...shopAdminActionResult("validation_failed", {
        ok: false,
        shopId: context.selectedShop.shopId,
      }),
      previewDigest: parsed.digest,
      rowErrors: parsed.rowErrors,
    };
  }

  const readModel = await getShopInventoryReadModel({
    client: context.supabase,
    requestedShopId: context.selectedShop.shopId,
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
  const rowErrors = [...parsed.rowErrors, ...validation.rowErrors];

  if (rowErrors.length > 0) {
    return {
      ...shopAdminActionResult("validation_failed", {
        ok: false,
        shopId: context.selectedShop.shopId,
      }),
      previewDigest: parsed.digest,
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
  let suppliersApplied = 0;
  let categoriesApplied = 0;
  let productsApplied = 0;
  let failedRows = 0;

  for (const row of parsed.suppliers) {
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

  for (const row of parsed.categories) {
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

  for (const row of parsed.products) {
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
      productsApplied += 1;
    } else {
      failedRows += 1;
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
      digest: parsed.digest,
      failedRows,
      "no_purge": true,
      productsApplied,
      "preview.valid": true,
      suppliersApplied,
    },
  );

  const summary = {
    categoriesApplied,
    failedRows,
    productsApplied,
    suppliersApplied,
  };

  if (!auditResult.ok) {
    return {
      ...auditResult,
      previewDigest: parsed.digest,
      summary,
    };
  }

  return {
    ...shopAdminActionResult(failedRows > 0 ? "db_failure" : "success", {
      ok: failedRows === 0,
      shopId: context.selectedShop.shopId,
    }),
    previewDigest: parsed.digest,
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
  });

  if (readModel.status !== "ready") {
    return shopAdminActionResult("unauthorized_or_unmapped", {
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
        ["price_id", "product_id", "type", "price", "effective_at", "source"],
        ...readModel.prices.map((price) => [
          price.priceId,
          price.productId,
          stringCell(price.type),
          price.price,
          price.effectiveAt,
          stringCell(price.source),
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
      data: [["price_id", "product_id", "type", "price", "effective_at", "source"]],
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
