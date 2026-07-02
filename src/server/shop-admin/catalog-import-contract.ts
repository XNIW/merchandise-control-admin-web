export type CatalogImportRowIssueCode =
  | "duplicate_category_name"
  | "duplicate_product_barcode"
  | "duplicate_product_sku"
  | "duplicate_supplier_name"
  | "missing_product_identity"
  | "missing_required_retail_price"
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
  category?: string;
  complete?: boolean | string;
  discount?: number;
  discountedPrice?: number;
  itemNumber?: string;
  productName: string;
  oldPurchasePrice?: number;
  oldRetailPrice?: number;
  purchasePrice?: number;
  quantity?: number;
  realQuantity?: number;
  retailPrice?: number;
  rowNumber: number;
  secondProductName?: string;
  supplier?: string;
  totalPrice?: number;
};

type CatalogImportBoundaryLegacyProductFields = {
  categoryName?: string;
  stockQuantity?: number;
  supplierName?: string;
};

type CatalogImportBoundaryIdentityProductFields = {
  categoryId?: string;
  productId?: string;
  supplierId?: string;
};

type CatalogImportBoundaryProductFields =
  & CatalogImportBoundaryIdentityProductFields
  & CatalogImportBoundaryLegacyProductFields;

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
  | "category"
  | "complete"
  | "discount"
  | "discountedPrice"
  | "itemNumber"
  | "oldPurchasePrice"
  | "oldRetailPrice"
  | "productName"
  | "purchasePrice"
  | "quantity"
  | "realQuantity"
  | "retailPrice"
  | "rowNumber"
  | "secondProductName"
  | "supplier"
  | "totalPrice";

export const CATALOG_IMPORT_FIELDS = [
  "barcode",
  "category",
  "complete",
  "discount",
  "discountedPrice",
  "itemNumber",
  "oldPurchasePrice",
  "oldRetailPrice",
  "productName",
  "purchasePrice",
  "quantity",
  "realQuantity",
  "retailPrice",
  "rowNumber",
  "secondProductName",
  "supplier",
  "totalPrice",
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
  category: [
    "category",
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
    "codice prodotto",
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
    "prezzo vendita",
    "prezzo di vendita",
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
  oldPurchasePrice: [
    "oldPurchasePrice",
    "old_purchase_price",
    "old purchase price",
    "previous purchase price",
    "prevPurchase",
    "prev purchase",
  ],
  oldRetailPrice: [
    "oldRetailPrice",
    "old_retail_price",
    "old retail price",
    "previous retail price",
    "prevRetail",
    "prev retail",
  ],
  totalPrice: [
    "totalPrice",
    "total_price",
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
  quantity: [
    "quantity",
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
  realQuantity: [
    "realQuantity",
    "real_quantity",
    "real quantity",
    "actual quantity",
    "quantita reale",
    "quantità reale",
    "cantidad real",
    "实际数量",
    "實際數量",
  ],
  rowNumber: [
    "rowNumber",
    "row_number",
    "row",
    "rowno",
    "no",
    "n.",
    "serial",
    "serialnumber",
    "progressivo",
    "numeroriga",
    "numero",
    "número",
    "序号",
    "序號",
    "行号",
    "#",
  ],
  supplier: [
    "supplier",
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
  complete: [
    "complete",
    "completed",
    "completo",
    "completa",
    "completato",
    "completata",
    "完成",
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
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

const normalizedImportAliases = new Map<string, CatalogImportField>();

for (const [field, aliases] of Object.entries(
  CATALOG_IMPORT_COLUMN_ALIASES,
) as Array<[CatalogImportField, readonly string[]]>) {
  for (const alias of aliases) {
    normalizedImportAliases.set(normalizeCatalogImportHeader(alias), field);
  }
}

const ANDROID_REQUIRED_IMPORT_FIELDS = [
  "barcode",
  "productName",
  "purchasePrice",
] as const satisfies readonly CatalogImportField[];

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

function withGeneratedMinimumSources(
  sources: Partial<Record<CatalogImportField, CatalogImportColumnSource>>,
) {
  for (const field of ANDROID_REQUIRED_IMPORT_FIELDS) {
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
  const clean = stringValue(value).replace(/\s+/g, "");

  if (!clean) {
    return null;
  }

  let normalized = clean;

  if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(clean)) {
    normalized = clean.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(,\d{3})*\.\d+$/.test(clean)) {
    normalized = clean.replace(/,/g, "");
  } else if (/^-?[1-9]\d{0,2}(,\d{3})+$/.test(clean)) {
    normalized = clean.replace(/,/g, "");
  } else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(clean)) {
    normalized = clean.replace(/\./g, "");
  } else {
    normalized = clean.replace(",", ".");
  }

  const numeric = Number(normalized);

  return Number.isFinite(numeric) ? numeric : null;
}

function rowLooksProductDataLike(row: readonly unknown[]) {
  const values = row.map(stringValue).filter(Boolean);
  const numericCount = values.filter((value) => numberLike(value) !== null)
    .length;
  const textCount = values.length - numericCount;

  return numericCount >= 3 && textCount >= 1;
}

function ratio(count: number, total: number) {
  return total > 0 ? count / total : 0;
}

function isPatternBarcode(value: string) {
  const digits = value.replace(/\D/g, "");

  return digits.length === 8 || digits.length === 12 ||
    digits.length === 13;
}

function isPatternItemNumber(value: string) {
  const compact = value.trim();

  return compact.length >= 4 &&
    compact.length <= 12 &&
    /[\p{L}\p{N}]/u.test(compact) &&
    !isPatternBarcode(compact);
}

function scorePatternColumn(
  field: CatalogImportField,
  values: readonly unknown[],
) {
  const nonBlank = values.map(stringValue).filter(Boolean);
  const numeric = nonBlank
    .map(numberLike)
    .filter((value): value is number => value !== null);

  if (nonBlank.length < 2) {
    return 0;
  }

  if (field === "barcode") {
    return ratio(
      nonBlank.filter(isPatternBarcode).length,
      nonBlank.length,
    );
  }

  if (field === "itemNumber") {
    return ratio(
      nonBlank.filter(isPatternItemNumber).length,
      nonBlank.length,
    );
  }

  if (field === "productName" || field === "secondProductName") {
    return ratio(
      nonBlank.filter((value) =>
        value.length >= 3 &&
        numberLike(value) === null &&
        !isPatternItemNumber(value)
      )
        .length,
      nonBlank.length,
    );
  }

  if (field === "quantity") {
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
    field === "discountedPrice" ||
    field === "totalPrice"
  ) {
    return ratio(
      numeric.filter((value) => value > 0 && value <= 100_000_000).length,
      nonBlank.length,
    );
  }

  if (field === "discount") {
    return ratio(
      nonBlank.filter((value) =>
        /^(0[.,]\d{1,2}|\d{1,2}%?)$/.test(value.trim())
      ).length,
      nonBlank.length,
    );
  }

  if (field === "rowNumber") {
    return ratio(
      nonBlank.filter((value) => /^\d{1,6}$/.test(value.trim())).length,
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
  threshold = 0.7,
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

  if (!selected || selected.score < threshold) {
    return null;
  }

  return selected;
}

function addPatternColumnSource(
  sources: Partial<Record<CatalogImportField, CatalogImportColumnSource>>,
  field: CatalogImportField,
  columnIndex: number,
  score: number,
) {
  sources[field] = {
    columnIndex,
    confidence: score >= 0.9 ? "high" : "medium",
    reason: "pattern-score",
    score,
    source: "pattern",
  };
}

function multiplicationMatch(
  rows: readonly (readonly unknown[])[],
  quantityColumn: number,
  purchaseColumn: number,
  totalColumn: number,
) {
  let informative = 0;
  let matches = 0;

  for (const row of rows.slice(0, 40)) {
    const quantity = numberLike(row[quantityColumn]);
    const purchase = numberLike(row[purchaseColumn]);
    const total = numberLike(row[totalColumn]);

    if (quantity === null || purchase === null || total === null) {
      continue;
    }

    informative += 1;
    const expected = quantity * purchase;
    const epsilon = 0.1 * Math.max(expected, 1);

    if (Math.abs(total - expected) <= epsilon) {
      matches += 1;
    }
  }

  return ratio(matches, informative);
}

function inferPurchaseAndTotal(
  headers: Map<CatalogImportField, number>,
  sources: Partial<Record<CatalogImportField, CatalogImportColumnSource>>,
  sampleRows: readonly (readonly unknown[])[],
  usedColumns: Set<number>,
  maxColumnCount: number,
) {
  const quantityColumn = headers.get("quantity");

  if (quantityColumn !== undefined && !headers.has("purchasePrice")) {
    let bestPurchase = -1;
    let bestTotal = -1;
    let bestMatch = 0;

    for (let purchaseColumn = 0; purchaseColumn < maxColumnCount; purchaseColumn += 1) {
      if (usedColumns.has(purchaseColumn)) {
        continue;
      }

      for (let totalColumn = 0; totalColumn < maxColumnCount; totalColumn += 1) {
        if (totalColumn === purchaseColumn || usedColumns.has(totalColumn)) {
          continue;
        }

        const match = multiplicationMatch(
          sampleRows,
          quantityColumn,
          purchaseColumn,
          totalColumn,
        );

        if (match > bestMatch) {
          bestMatch = match;
          bestPurchase = purchaseColumn;
          bestTotal = totalColumn;
        }
      }
    }

    if (bestMatch >= 0.7) {
      headers.set("purchasePrice", bestPurchase);
      headers.set("totalPrice", bestTotal);
      usedColumns.add(bestPurchase);
      usedColumns.add(bestTotal);
      addPatternColumnSource(sources, "purchasePrice", bestPurchase, bestMatch);
      addPatternColumnSource(sources, "totalPrice", bestTotal, bestMatch);
      return;
    }
  }

  if (!headers.has("purchasePrice")) {
    const selected = selectPatternColumn(
      "purchasePrice",
      sampleRows,
      usedColumns,
      maxColumnCount,
      0.7,
    );

    if (selected) {
      headers.set("purchasePrice", selected.columnIndex);
      usedColumns.add(selected.columnIndex);
      addPatternColumnSource(
        sources,
        "purchasePrice",
        selected.columnIndex,
        selected.score,
      );
    }
  }
}

function inferPatternColumns(
  headers: Map<CatalogImportField, number>,
  sources: Partial<Record<CatalogImportField, CatalogImportColumnSource>>,
  sampleRows: readonly (readonly unknown[])[],
  hasHeader: boolean,
) {
  const maxColumnCount = Math.max(0, ...sampleRows.map((row) => row.length));
  const usedColumns = new Set(headers.values());
  const assign = (field: CatalogImportField, threshold: number) => {
    if (headers.has(field)) {
      return;
    }

    const selected = selectPatternColumn(
      field,
      sampleRows,
      usedColumns,
      maxColumnCount,
      threshold,
    );

    if (!selected) {
      return;
    }

    headers.set(field, selected.columnIndex);
    usedColumns.add(selected.columnIndex);
    addPatternColumnSource(sources, field, selected.columnIndex, selected.score);
  };

  assign("barcode", 0.7);
  assign("productName", 0.5);
  assign("itemNumber", 0.5);
  assign("quantity", 0.7);
  inferPurchaseAndTotal(headers, sources, sampleRows, usedColumns, maxColumnCount);

  if (!hasHeader) {
    assign("retailPrice", 0.7);
    assign("secondProductName", 0.5);
    assign("supplier", 0.5);
    assign("discount", 0.5);
    assign("discountedPrice", 0.7);
    assign("rowNumber", 0.5);
  }
}

export function detectCatalogImportHeaderRow(
  rows: readonly (readonly unknown[])[],
): CatalogImportHeaderDetection | null {
  const dataStartRowIndex = rows
    .slice(0, 25)
    .findIndex((row) => rowLooksProductDataLike(row));

  if (dataStartRowIndex < 0) {
    return null;
  }

  const hasHeader = dataStartRowIndex > 0;
  const headerRowIndex = hasHeader ? dataStartRowIndex - 1 : null;
  const headerRow = headerRowIndex === null ? undefined : rows[headerRowIndex];
  const headers = new Map<CatalogImportField, number>();
  const recognizedColumnSources: Partial<Record<CatalogImportField, CatalogImportColumnSource>> = {};

  if (headerRow) {
    for (const [index, cell] of headerRow.entries()) {
      const field = normalizedImportAliases.get(normalizeCatalogImportHeader(cell));

      if (field && !headers.has(field)) {
        headers.set(field, index);
        recognizedColumnSources[field] = {
          columnIndex: index,
          columnLabel: stringValue(cell) || undefined,
          confidence:
            field === "barcode" || field === "productName" ||
              field === "purchasePrice"
              ? "high"
              : "medium",
          reason: "header-alias",
          source: "alias",
        };
      }
    }
  }

  const sampleRows = rows
    .slice(dataStartRowIndex, dataStartRowIndex + 40)
    .filter((row) => row.some((cell) => stringValue(cell).length > 0));

  inferPatternColumns(
    headers,
    recognizedColumnSources,
    sampleRows,
    hasHeader,
  );

  return {
    dataStartRowIndex,
    headerRowIndex,
    headers,
    recognizedColumnSources: withGeneratedMinimumSources(
      recognizedColumnSources,
    ),
    score: headerDetectionScore(headers),
  };
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

function duplicateRowGroups<T>(
  rows: readonly T[],
  getKey: (row: T) => string | null | undefined,
) {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const key = normalized(getKey(row));

    if (!key) {
      continue;
    }

    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return new Map([...groups].filter(([, group]) => group.length > 1));
}

function effectiveLastProductRows(
  rows: readonly CatalogImportProductRow[],
) {
  const byBarcode = new Map<string, CatalogImportProductRow>();
  const withoutBarcode: CatalogImportProductRow[] = [];

  for (const row of rows) {
    const key = normalized(row.barcode);
    if (!key) {
      withoutBarcode.push(row);
      continue;
    }
    byBarcode.set(key, row);
  }

  return [...withoutBarcode, ...byBarcode.values()];
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
  const duplicateProductBarcodeGroups = duplicateRowGroups(
    parsed.products,
    (product) => product.barcode,
  );
  const duplicateProductsBySku = duplicateRows(
    parsed.products,
    (product) => product.itemNumber,
  );

  for (const group of duplicateProductBarcodeGroups.values()) {
    for (const product of group) {
      rowWarnings.push(
        issue(
          "duplicate_product_barcode",
          "Products",
          product.rowNumber,
          "barcode",
          "Product barcode appears more than once in the workbook; the last occurrence is used.",
        ),
      );
    }
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
    const boundaryProduct = product as CatalogImportProductRow & CatalogImportBoundaryProductFields;
    const existingById = boundaryProduct.productId
      ? existingProductsById.get(normalized(boundaryProduct.productId))
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
          "missing_product_identity",
          "Products",
          product.rowNumber,
          "barcode",
          "Product barcode belongs to another active product in this shop.",
        ),
      );
    }

    const target = existingByBarcode ?? existingById;

    if (!target && !product.productName && !product.itemNumber) {
      rowErrors.push(
        issue(
          "product_barcode_conflict",
          "Products",
          product.rowNumber,
          "productName",
          "New product requires productName or itemNumber.",
        ),
      );
    }

    if (!target && product.retailPrice === undefined) {
      rowErrors.push(
        issue(
          "missing_required_retail_price",
          "Products",
          product.rowNumber,
          "retailPrice",
          "New product requires retailPrice before supplier import apply.",
        ),
      );
    }

    if (boundaryProduct.supplierId) {
      const supplierExists = existingSuppliersById.has(
        normalized(boundaryProduct.supplierId),
      );

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
    } else if (product.supplier ?? boundaryProduct.supplierName) {
      const supplierName = normalized(
        product.supplier ?? boundaryProduct.supplierName,
      );
      const supplierExists =
        existingSuppliersByName.has(supplierName) ||
        workbookSuppliersByName.has(supplierName);

      if (!supplierExists) {
        rowErrors.push(
          issue(
            "unknown_supplier",
            "Products",
            product.rowNumber,
            "supplier",
            "Supplier name must exist in the active catalog or Suppliers sheet.",
          ),
        );
      }
    }

    if (boundaryProduct.categoryId) {
      const categoryExists = existingCategoriesById.has(
        normalized(boundaryProduct.categoryId),
      );

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
    } else if (product.category ?? boundaryProduct.categoryName) {
      const categoryName = normalized(
        product.category ?? boundaryProduct.categoryName,
      );
      const categoryExists =
        existingCategoriesByName.has(categoryName) ||
        workbookCategoriesByName.has(categoryName);

      if (!categoryExists) {
        rowErrors.push(
          issue(
            "unknown_category",
            "Products",
            product.rowNumber,
            "category",
            "Category name must exist in the active catalog or Categories sheet.",
          ),
        );
      }
    }
  }

  const effectiveProducts = effectiveLastProductRows(parsed.products);
  for (const product of effectiveProducts) {
    const boundaryProduct = product as CatalogImportProductRow & CatalogImportBoundaryProductFields;
    const existingById = boundaryProduct.productId
      ? existingProductsById.get(normalized(boundaryProduct.productId))
      : undefined;
    const existingByBarcode = existingProductsByBarcode.get(
      normalized(product.barcode),
    );
    const target = existingByBarcode ?? existingById;
    if (target) {
      updatedProductIds.add(target.productId);
    }
  }
  const effectiveProductRows = effectiveProducts.length;

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
  const boundaryRow = row as CatalogImportProductRow & CatalogImportBoundaryProductFields;
  const categoryName = row.category ?? boundaryRow.categoryName;
  const supplierName = row.supplier ?? boundaryRow.supplierName;
  const quantity = row.realQuantity ?? row.quantity ?? boundaryRow.stockQuantity;
  const categoryFromName = categoryName
    ? lookups.categoryIdsByName.get(normalized(categoryName))
    : undefined;
  const supplierFromName = supplierName
    ? lookups.supplierIdsByName.get(normalized(supplierName))
    : undefined;

  return {
    barcode: textOrExisting(row.barcode, existing?.barcode ?? null) ?? "",
    categoryId:
      boundaryRow.categoryId ?? categoryFromName ?? existing?.categoryId ?? undefined,
    itemNumber: textOrExisting(row.itemNumber, existing?.itemNumber ?? null),
    productName:
      textOrExisting(row.productName, existing?.productName ?? null) ?? "",
    purchasePrice: valueOrExisting(row.purchasePrice, existing?.purchasePrice),
    retailPrice: valueOrExisting(row.retailPrice, existing?.retailPrice),
    secondProductName: textOrExisting(
      row.secondProductName,
      existing?.secondProductName ?? null,
    ),
    stockQuantity: valueOrExisting(quantity, existing?.stockQuantity),
    supplierId:
      boundaryRow.supplierId ?? supplierFromName ?? existing?.supplierId ?? undefined,
  };
}
