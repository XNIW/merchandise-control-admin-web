export type CatalogImportRowIssueCode =
  | "duplicate_category_name"
  | "duplicate_product_barcode"
  | "duplicate_product_sku"
  | "duplicate_supplier_name"
  | "product_barcode_conflict"
  | "unknown_category"
  | "unknown_supplier";

export type CatalogImportRowIssue = {
  code: CatalogImportRowIssueCode;
  field: string;
  message: string;
  row: number;
  sheet: string;
};

export type CatalogImportProductRow = {
  barcode: string;
  categoryId?: string;
  categoryName?: string;
  discount?: number;
  discountedPrice?: number;
  itemNumber?: string;
  lineTotal?: number;
  productId?: string;
  productName: string;
  purchasePrice?: number;
  retailPrice?: number;
  rowNumber: number;
  secondProductName?: string;
  stockQuantity?: number;
  supplierId?: string;
  supplierName?: string;
};

export type CatalogImportSupplierRow = {
  name: string;
  rowNumber: number;
  supplierId?: string;
};

export type CatalogImportCategoryRow = {
  categoryId?: string;
  name: string;
  rowNumber: number;
};

export type CatalogImportParsedRows = {
  categories: readonly CatalogImportCategoryRow[];
  products: readonly CatalogImportProductRow[];
  suppliers: readonly CatalogImportSupplierRow[];
};

export type CatalogImportField =
  | "barcode"
  | "categoryId"
  | "categoryName"
  | "discount"
  | "discountedPrice"
  | "itemNumber"
  | "lineTotal"
  | "productId"
  | "productName"
  | "purchasePrice"
  | "retailPrice"
  | "secondProductName"
  | "stockQuantity"
  | "supplierId"
  | "supplierName";

export const CATALOG_IMPORT_FIELDS = [
  "barcode",
  "categoryId",
  "categoryName",
  "discount",
  "discountedPrice",
  "itemNumber",
  "lineTotal",
  "productId",
  "productName",
  "purchasePrice",
  "retailPrice",
  "secondProductName",
  "stockQuantity",
  "supplierId",
  "supplierName",
] as const satisfies readonly CatalogImportField[];

export type CatalogImportColumnSource = {
  columnIndex: number | null;
  columnLabel?: string;
  confidence: "high" | "medium" | "low";
  reason?: string;
  score?: number;
  source: "alias" | "pattern" | "generated" | "manual";
};

export const CATALOG_IMPORT_COLUMN_ALIASES: Record<
  CatalogImportField,
  readonly string[]
> = {
  barcode: [
    "barcode",
    "code",
    "ean",
    "bar code",
    "cod.barra",
    "cod barra",
    "codbarra",
    "cod.barras",
    "codbarras",
    "codigo",
    "codigo_barra",
    "codigo_barras",
    "codigo_de_barra",
    "codigo_de_barras",
    "código de barra",
    "código de barras",
    "codigo barras",
    "código barras",
    "codice a barre",
    "co.barra",
    "条码",
    "條碼",
    "条形码",
  ],
  categoryId: ["category_id", "categoria_id", "id_categoria"],
  categoryName: [
    "category_name",
    "category",
    "categoria",
    "categoría",
    "reparto",
    "department",
    "分类",
    "类别",
  ],
  itemNumber: [
    "item_number",
    "itemnumber",
    "item",
    "ref",
    "sku",
    "codice",
    "codice articolo",
    "product_code",
    "product code",
    "productcode",
    "codigo_producto",
    "código producto",
    "código_producto",
    "codigo_de_producto",
    "código de producto",
    "codigo de producto",
    "codigodeproducto",
    "codigo del articulo",
    "código del artículo",
    "número de artículo",
    "numero de artículo",
    "número de producto",
    "numero de producto",
    "cod_art",
    "cod. art.",
    "item code",
    "referencia",
    "articulo",
    "artículo",
    "产品货号",
    "產品貨號",
    "货号",
    "貨號",
  ],
  productId: ["product_id", "id"],
  productName: [
    "product_name",
    "product name",
    "productname",
    "product",
    "name",
    "中文名",
    "商品信息",
    "nome",
    "nombre_producto",
    "nombre producto",
    "nombre_del_producto",
    "nombre del producto",
    "nombre",
    "descripcion",
    "descripción",
    "producto",
    "articulo",
    "artículo",
    "产品名1",
    "產品名1",
    "产品品名",
    "產品品名",
    "商品名1",
    "商品名称",
    "品名",
  ],
  purchasePrice: [
    "purchase_price",
    "purchase",
    "cost",
    "cost_price",
    "purchaseprice",
    "new purchase price",
    "buy price",
    "prezzo acquisto",
    "precio",
    "precio_compra",
    "precio de compra",
    "precio compra",
    "precio adquisición",
    "compra",
    "costo",
    "precio unitario",
    "v. unit. bruto",
    "pre/u",
    "销售单价",
    "单价",
    "單價",
    "进价",
    "進價",
    "unit price",
  ],
  retailPrice: [
    "retail_price",
    "retail",
    "sale_price",
    "sale price",
    "precio_venta",
    "precio de venta",
    "precio venta",
    "venta",
    "零售价",
    "零售價",
  ],
  discount: [
    "discount",
    "discount_percent",
    "discount %",
    "discount%",
    "sconto",
    "descuento",
    "rebaja",
    "dto%",
    "dcto",
    "d%",
    "d.%",
    "折扣",
    "折",
  ],
  discountedPrice: [
    "discounted_price",
    "discountedprice",
    "discounted price",
    "prezzo scontato",
    "prezzoscontato",
    "precio con descuento",
    "precio descontado",
    "precio rebajado",
    "after discount price",
    "final price",
    "prezzo finale",
    "售价",
    "售價",
    "折后价",
    "折後價",
    "折后单价(含税)",
    "折後單價(含稅)",
  ],
  lineTotal: [
    "line_total",
    "line total",
    "total_price",
    "totalprice",
    "total price",
    "total",
    "totale",
    "importe",
    "importe total",
    "subtotal",
    "price total",
    "precio total",
    "总价",
    "總價",
    "合计",
    "合計",
    "总计",
    "總計",
    "金额",
    "金額",
  ],
  secondProductName: [
    "second_product_name",
    "second_name",
    "second name",
    "second product name",
    "local_descripcion",
    "local descripcion",
    "local descripción",
    "外文名",
    "零售名称",
    "productname2",
    "product name 2",
    "nombre_2",
    "nombre2",
    "nombre 2",
    "descripcion_2",
    "descripción_2",
    "segundo_nombre_del_producto",
    "segundo nombre del producto",
    "产品名2",
    "產品名2",
    "产品品名2",
    "產品品名2",
    "商品名2",
    "西语名称",
    "西語名稱",
    "物料描述",
  ],
  stockQuantity: [
    "stock_quantity",
    "stock",
    "stockquantity",
    "cnt",
    "qty",
    "quantity",
    "cantidad",
    "quantita",
    "quantità",
    "existencias",
    "cantid",
    "amount",
    "numero",
    "número",
    "unds.",
    "giacenza",
    "scorte",
    "数量",
    "數量",
    "总数量",
    "總數量",
    "库存",
    "庫存",
    "库存数量",
    "庫存數量",
  ],
  supplierId: ["supplier_id", "proveedor_id", "id_proveedor"],
  supplierName: [
    "supplier_name",
    "supplier",
    "suppliername",
    "proveedor",
    "empresa proveedora",
    "fornitore",
    "fornitore/azienda",
    "vendor",
    "provider",
    "vendedor",
    "distribuidor",
    "fabricante",
    "供应商",
    "供應商",
  ],
};

export type CatalogImportExistingProduct = {
  barcode: string;
  categoryId: string | null;
  itemNumber: string | null;
  productId: string;
  productName: string | null;
  purchasePrice: number | null;
  retailPrice: number | null;
  secondProductName: string | null;
  stockQuantity: number | null;
  supplierId: string | null;
};

export type CatalogImportExistingCategory = {
  categoryId: string;
  name: string;
};

export type CatalogImportExistingSupplier = {
  name: string;
  supplierId: string;
};

export type CatalogImportExistingRows = {
  categories: readonly CatalogImportExistingCategory[];
  products: readonly CatalogImportExistingProduct[];
  suppliers: readonly CatalogImportExistingSupplier[];
};

export type CatalogImportValidation = {
  rowErrors: CatalogImportRowIssue[];
  rowWarnings: CatalogImportRowIssue[];
  summary: {
    categories: number;
    errors: number;
    newProducts: number;
    products: number;
    suppliers: number;
    updatedProducts: number;
    warnings: number;
  };
};

export type CatalogImportLookupMaps = {
  categoryIdsByName: ReadonlyMap<string, string>;
  supplierIdsByName: ReadonlyMap<string, string>;
};

export type CatalogImportHeaderDetection = {
  dataStartRowIndex: number;
  headerRowIndex: number | null;
  headers: Map<CatalogImportField, number>;
  recognizedColumnSources: Partial<Record<CatalogImportField, CatalogImportColumnSource>>;
  score: number;
};

export function normalizeCatalogImportHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-./]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

const normalizedImportAliases = new Map<string, CatalogImportField>();

for (const [field, aliases] of Object.entries(
  CATALOG_IMPORT_COLUMN_ALIASES,
) as Array<[CatalogImportField, readonly string[]]>) {
  for (const alias of aliases) {
    normalizedImportAliases.set(normalizeCatalogImportHeader(alias), field);
  }
}

function headerDetectionScore(headers: Map<CatalogImportField, number>) {
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

function headerColumnLabel(row: readonly unknown[] | undefined, index: number) {
  return String(row?.[index] ?? "").trim();
}

function aliasColumnSources(
  row: readonly unknown[] | undefined,
  headers: ReadonlyMap<CatalogImportField, number>,
) {
  const sources: Partial<Record<CatalogImportField, CatalogImportColumnSource>> = {};

  for (const [field, columnIndex] of headers.entries()) {
    sources[field] = {
      columnIndex,
      columnLabel: headerColumnLabel(row, columnIndex) || undefined,
      confidence:
        field === "barcode" || field === "productName" ? "high" : "medium",
      reason: "header-alias",
      source: "alias",
    };
  }

  return sources;
}

function withGeneratedMinimumSources(
  sources: Partial<Record<CatalogImportField, CatalogImportColumnSource>>,
) {
  for (const field of ["barcode", "productName"] satisfies CatalogImportField[]) {
    if (!sources[field]) {
      sources[field] = {
        columnIndex: null,
        confidence: "low",
        reason: "missing-required-column",
        source: "generated",
      };
    }
  }

  return sources;
}

function stringValue(value: unknown) {
  return String(value ?? "").trim();
}

function numberLike(value: unknown) {
  const normalized = stringValue(value).replace(/[^\d,.-]/g, "");

  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized.replace(",", "."));

  return Number.isFinite(numeric) ? numeric : null;
}

function rowLooksProductDataLike(row: readonly unknown[]) {
  const values = row.map(stringValue).filter(Boolean);
  const numericCount = values.filter((value) => numberLike(value) !== null)
    .length;
  const textCount = values.length - numericCount;

  return values.length >= 4 && numericCount >= 2 && textCount >= 1;
}

function ratio(count: number, total: number) {
  return total > 0 ? count / total : 0;
}

function scorePatternColumn(
  field: CatalogImportField,
  values: readonly unknown[],
) {
  const nonBlank = values.map(stringValue).filter(Boolean);
  const numeric = nonBlank.map(numberLike).filter((value) => value !== null);

  if (nonBlank.length < 2) {
    return 0;
  }

  if (field === "barcode") {
    return ratio(
      nonBlank.filter((value) => /^\d{8,14}$/.test(value.replace(/\D/g, "")))
        .length,
      nonBlank.length,
    );
  }

  if (field === "itemNumber") {
    return ratio(
      nonBlank.filter((value) => {
        const compact = value.replace(/\s+/g, "");

        return compact.length >= 3 &&
          compact.length <= 16 &&
          /[A-Za-z0-9]/.test(compact) &&
          !/^\d{8,14}$/.test(compact);
      }).length,
      nonBlank.length,
    );
  }

  if (field === "productName" || field === "secondProductName") {
    return ratio(
      nonBlank.filter((value) => value.length >= 3 && numberLike(value) === null)
        .length,
      nonBlank.length,
    );
  }

  if (field === "stockQuantity") {
    return ratio(
      numeric.filter((value) =>
        Number.isInteger(value) && value >= 0 && value <= 100_000
      ).length,
      nonBlank.length,
    );
  }

  if (
    field === "purchasePrice" ||
    field === "retailPrice" ||
    field === "discount" ||
    field === "discountedPrice" ||
    field === "lineTotal"
  ) {
    return ratio(
      numeric.filter((value) => value >= 0 && value <= 100_000_000).length,
      nonBlank.length,
    );
  }

  return 0;
}

function selectPatternColumn(
  field: CatalogImportField,
  rows: readonly (readonly unknown[])[],
  usedColumns: ReadonlySet<number>,
  maxColumnCount: number,
) {
  const candidates = Array.from({ length: maxColumnCount }, (_value, columnIndex) => {
    const score = usedColumns.has(columnIndex)
      ? 0
      : scorePatternColumn(field, rows.map((row) => row[columnIndex]));

    return { columnIndex, score };
  }).sort((left, right) =>
    right.score - left.score || left.columnIndex - right.columnIndex,
  );
  const selected = candidates[0];
  const runnerUp = candidates[1];

  if (!selected || selected.score < 0.72) {
    return null;
  }

  if (runnerUp && selected.score - runnerUp.score < 0.12) {
    return null;
  }

  return selected;
}

function detectPatternImportHeaderRow(
  rows: readonly (readonly unknown[])[],
): CatalogImportHeaderDetection | null {
  const dataStartRowIndex = rows
    .slice(0, 25)
    .findIndex((row) => rowLooksProductDataLike(row));

  if (dataStartRowIndex < 0) {
    return null;
  }

  const sampleRows = rows
    .slice(dataStartRowIndex, dataStartRowIndex + 40)
    .filter(rowLooksProductDataLike);
  const maxColumnCount = Math.max(0, ...sampleRows.map((row) => row.length));
  const headers = new Map<CatalogImportField, number>();
  const recognizedColumnSources: Partial<Record<CatalogImportField, CatalogImportColumnSource>> = {};
  const usedColumns = new Set<number>();

  for (const field of [
    "barcode",
    "itemNumber",
    "productName",
    "stockQuantity",
    "purchasePrice",
    "retailPrice",
  ] satisfies CatalogImportField[]) {
    const selected = selectPatternColumn(
      field,
      sampleRows,
      usedColumns,
      maxColumnCount,
    );

    if (!selected) {
      continue;
    }

    headers.set(field, selected.columnIndex);
    usedColumns.add(selected.columnIndex);
    recognizedColumnSources[field] = {
      columnIndex: selected.columnIndex,
      confidence: selected.score >= 0.9 ? "high" : "medium",
      reason: "pattern-score",
      score: selected.score,
      source: "pattern",
    };
  }

  if (!headers.has("barcode") || !(headers.has("productName") || headers.has("itemNumber"))) {
    return null;
  }

  return {
    dataStartRowIndex,
    headerRowIndex: null,
    headers,
    recognizedColumnSources: withGeneratedMinimumSources(
      recognizedColumnSources,
    ),
    score: headerDetectionScore(headers),
  };
}

export function detectCatalogImportHeaderRow(
  rows: readonly (readonly unknown[])[],
): CatalogImportHeaderDetection | null {
  let best: CatalogImportHeaderDetection | null = null;

  for (const [headerRowIndex, row] of rows.slice(0, 25).entries()) {
    const headers = new Map<CatalogImportField, number>();

    for (const [index, cell] of row.entries()) {
      const field = normalizedImportAliases.get(normalizeCatalogImportHeader(cell));

      if (field && !headers.has(field)) {
        headers.set(field, index);
      }
    }

    const score = headerDetectionScore(headers);

    const hasStrongIdentity =
      headers.has("barcode") &&
      (headers.has("productName") || headers.has("itemNumber"));
    const hasGeneratedBarcodeCandidate =
      headers.has("productName") && headers.has("itemNumber");

    if (
      (hasStrongIdentity || hasGeneratedBarcodeCandidate) &&
      (!best || score > best.score)
    ) {
      best = {
        dataStartRowIndex: headerRowIndex + 1,
        headerRowIndex,
        headers,
        recognizedColumnSources: withGeneratedMinimumSources(
          aliasColumnSources(row, headers),
        ),
        score,
      };
    }
  }

  return best ?? detectPatternImportHeaderRow(rows);
}

function normalized(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function issue(
  code: CatalogImportRowIssueCode,
  sheet: string,
  row: number,
  field: string,
  message: string,
): CatalogImportRowIssue {
  return { code, field, message, row, sheet };
}

function indexBy<T>(
  rows: readonly T[],
  getKey: (row: T) => string | null | undefined,
) {
  const indexed = new Map<string, T>();

  for (const row of rows) {
    const key = normalized(getKey(row));

    if (key) {
      indexed.set(key, row);
    }
  }

  return indexed;
}

function duplicateRows<T>(
  rows: readonly T[],
  getKey: (row: T) => string | null | undefined,
) {
  const seen = new Set<string>();
  const duplicates = new Set<T>();

  for (const row of rows) {
    const key = normalized(getKey(row));

    if (!key) {
      continue;
    }

    if (seen.has(key)) {
      duplicates.add(row);
    } else {
      seen.add(key);
    }
  }

  return duplicates;
}

export function validateCatalogImportRows(
  parsed: CatalogImportParsedRows,
  existing: CatalogImportExistingRows,
): CatalogImportValidation {
  const rowErrors: CatalogImportRowIssue[] = [];
  const rowWarnings: CatalogImportRowIssue[] = [];
  const existingProductsById = indexBy(
    existing.products,
    (product) => product.productId,
  );
  const existingProductsByBarcode = indexBy(
    existing.products,
    (product) => product.barcode,
  );
  const existingSuppliersById = indexBy(
    existing.suppliers,
    (supplier) => supplier.supplierId,
  );
  const existingSuppliersByName = indexBy(
    existing.suppliers,
    (supplier) => supplier.name,
  );
  const existingCategoriesById = indexBy(
    existing.categories,
    (category) => category.categoryId,
  );
  const existingCategoriesByName = indexBy(
    existing.categories,
    (category) => category.name,
  );
  const workbookSuppliersByName = indexBy(
    parsed.suppliers,
    (supplier) => supplier.name,
  );
  const workbookCategoriesByName = indexBy(
    parsed.categories,
    (category) => category.name,
  );
  const duplicateProductsByBarcode = duplicateRows(
    parsed.products,
    (product) => product.barcode,
  );
  const duplicateProductsBySku = duplicateRows(
    parsed.products,
    (product) => product.itemNumber,
  );

  for (const product of duplicateProductsByBarcode) {
    rowErrors.push(
      issue(
        "duplicate_product_barcode",
        "Products",
        product.rowNumber,
        "barcode",
        "Product barcode appears more than once in the workbook.",
      ),
    );
  }

  for (const product of duplicateProductsBySku) {
    rowWarnings.push(
      issue(
        "duplicate_product_sku",
        "Products",
        product.rowNumber,
        "itemNumber",
        "Product SKU appears more than once in the workbook.",
      ),
    );
  }

  for (const supplier of duplicateRows(parsed.suppliers, (row) => row.name)) {
    rowErrors.push(
      issue(
        "duplicate_supplier_name",
        "Suppliers",
        supplier.rowNumber,
        "name",
        "Supplier name appears more than once in the workbook.",
      ),
    );
  }

  for (const category of duplicateRows(parsed.categories, (row) => row.name)) {
    rowErrors.push(
      issue(
        "duplicate_category_name",
        "Categories",
        category.rowNumber,
        "name",
        "Category name appears more than once in the workbook.",
      ),
    );
  }

  const updatedProductIds = new Set<string>();

  for (const product of parsed.products) {
    const existingById = product.productId
      ? existingProductsById.get(normalized(product.productId))
      : undefined;
    const existingByBarcode = existingProductsByBarcode.get(
      normalized(product.barcode),
    );

    if (
      existingById &&
      existingByBarcode &&
      existingById.productId !== existingByBarcode.productId
    ) {
      rowErrors.push(
        issue(
          "product_barcode_conflict",
          "Products",
          product.rowNumber,
          "barcode",
          "Product barcode belongs to another active product in this shop.",
        ),
      );
    }

    if (!duplicateProductsByBarcode.has(product)) {
      const target = existingByBarcode ?? existingById;

      if (target) {
        updatedProductIds.add(target.productId);
      }
    }

    if (product.supplierId) {
      const supplierExists = existingSuppliersById.has(normalized(product.supplierId));

      if (!supplierExists) {
        rowErrors.push(
          issue(
            "unknown_supplier",
            "Products",
            product.rowNumber,
            "supplierId",
            "Supplier id is not active in this shop.",
          ),
        );
      }
    } else if (product.supplierName) {
      const supplierName = normalized(product.supplierName);
      const supplierExists =
        existingSuppliersByName.has(supplierName) ||
        workbookSuppliersByName.has(supplierName);

      if (!supplierExists) {
        rowErrors.push(
          issue(
            "unknown_supplier",
            "Products",
            product.rowNumber,
            "supplierName",
            "Supplier name must exist in the active catalog or Suppliers sheet.",
          ),
        );
      }
    }

    if (product.categoryId) {
      const categoryExists = existingCategoriesById.has(normalized(product.categoryId));

      if (!categoryExists) {
        rowErrors.push(
          issue(
            "unknown_category",
            "Products",
            product.rowNumber,
            "categoryId",
            "Category id is not active in this shop.",
          ),
        );
      }
    } else if (product.categoryName) {
      const categoryName = normalized(product.categoryName);
      const categoryExists =
        existingCategoriesByName.has(categoryName) ||
        workbookCategoriesByName.has(categoryName);

      if (!categoryExists) {
        rowErrors.push(
          issue(
            "unknown_category",
            "Products",
            product.rowNumber,
            "categoryName",
            "Category name must exist in the active catalog or Categories sheet.",
          ),
        );
      }
    }
  }

  const duplicateProductRows = new Set([
    ...duplicateProductsByBarcode,
  ]);
  const effectiveProductRows = parsed.products.length - duplicateProductRows.size;

  return {
    rowErrors,
    rowWarnings,
    summary: {
      categories: parsed.categories.length,
      errors: rowErrors.length,
      newProducts: Math.max(0, effectiveProductRows - updatedProductIds.size),
      products: parsed.products.length,
      suppliers: parsed.suppliers.length,
      updatedProducts: updatedProductIds.size,
      warnings: rowWarnings.length,
    },
  };
}

function valueOrExisting<T>(
  value: T | undefined,
  existing: T | null | undefined,
) {
  return value === undefined ? (existing ?? undefined) : value;
}

function textOrExisting(value: string | undefined, existing: string | null) {
  return value && value.trim().length > 0 ? value : (existing ?? undefined);
}

export function mergeProductImportForApply(
  row: CatalogImportProductRow,
  existing: CatalogImportExistingProduct | undefined,
  lookups: CatalogImportLookupMaps,
) {
  const categoryFromName = row.categoryName
    ? lookups.categoryIdsByName.get(normalized(row.categoryName))
    : undefined;
  const supplierFromName = row.supplierName
    ? lookups.supplierIdsByName.get(normalized(row.supplierName))
    : undefined;

  return {
    barcode: textOrExisting(row.barcode, existing?.barcode ?? null) ?? "",
    categoryId: row.categoryId ?? categoryFromName ?? existing?.categoryId ?? undefined,
    itemNumber: textOrExisting(row.itemNumber, existing?.itemNumber ?? null),
    productName:
      textOrExisting(row.productName, existing?.productName ?? null) ?? "",
    purchasePrice: valueOrExisting(row.purchasePrice, existing?.purchasePrice),
    retailPrice: valueOrExisting(row.retailPrice, existing?.retailPrice),
    secondProductName: textOrExisting(
      row.secondProductName,
      existing?.secondProductName ?? null,
    ),
    stockQuantity: valueOrExisting(row.stockQuantity, existing?.stockQuantity),
    supplierId: row.supplierId ?? supplierFromName ?? existing?.supplierId ?? undefined,
  };
}
