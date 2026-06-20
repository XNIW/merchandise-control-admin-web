import "server-only";

import {
  getShopHistoryDetailReadModel,
  getShopHistoryReadModel,
  type ShopHistoryDetail,
  type ShopHistoryDetailReadModel,
  type ShopHistoryTablePreviewRow,
  type ShopSyncEventActivity,
} from "./history-read-model";
import {
  getShopInventoryProductDetailReadModel,
  getShopInventoryProductsPage,
  type ShopInventoryPrice,
  type ShopInventoryProduct,
  type ShopInventoryReadModel,
} from "./inventory-read-model";

type DetailStatus = "error" | "invalid_entry" | "not_found" | "ready" | "unmapped" | "unauthorized" | "not_configured" | "empty";

export type ProductDetailModalProduct = {
  productId: string;
  barcode: string;
  itemNumber: string | null;
  productName: string | null;
  secondProductName: string | null;
  purchasePrice: number | null;
  retailPrice: number | null;
  stockQuantity: number | null;
  supplierId: string | null;
  supplierName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  state: "active" | "archived";
  updatedAt: string;
  deletedAt: string | null;
};

export type ProductDetailModalHistoryEntry = {
  entryId: string;
  kind: "history_entry" | "sync_event";
  title: string;
  source: string;
  payload: string;
  updatedAt: string;
};

export type ProductDetailModalReadModel = {
  status: DetailStatus;
  reason: string;
  product: ProductDetailModalProduct | null;
  prices: readonly ShopInventoryPrice[];
  historyEntries: readonly ProductDetailModalHistoryEntry[];
  diagnostics: {
    catalogScope: string;
    mappingState: string;
    priceRows: number;
    historyRows: number;
    lastSyncAt: string | null;
    selectedShopName: string | null;
  };
};

export type HistoryDetailModalRow = {
  rowKey: string;
  rowNumber: string;
  itemCode: string;
  barcode: string;
  productName: string;
  quantity: string;
  purchasePrice: string;
  retailPrice: string;
  completion: string;
  productId: string | null;
  productLabel: string | null;
};

export type HistoryDetailModalReadModel = {
  status: ShopHistoryDetailReadModel["status"];
  reason: string;
  detail: ShopHistoryDetail | null;
  rows: readonly HistoryDetailModalRow[];
  missingRows: readonly HistoryDetailModalRow[];
  linkedProducts: readonly HistoryDetailModalRow[];
  syncEvents: readonly ShopSyncEventActivity[];
};

function productSearchTokens(product: ShopInventoryProduct) {
  return [
    product.productId,
    product.barcode,
    product.itemNumber,
    product.productName,
    product.secondProductName,
  ]
    .filter((value): value is string => Boolean(value && value.length >= 3))
    .map((value) => value.toLowerCase());
}

function includesAnyToken(value: string, tokens: readonly string[]) {
  const normalized = value.toLowerCase();

  return tokens.some((token) => normalized.includes(token));
}

function productHistoryEntries(
  product: ShopInventoryProduct,
  historyReadModel: Awaited<ReturnType<typeof getShopHistoryReadModel>>,
): ProductDetailModalHistoryEntry[] {
  if (historyReadModel.status !== "ready") {
    return [];
  }

  const tokens = productSearchTokens(product);
  const syncRows = historyReadModel.syncEvents
    .filter((event) =>
      includesAnyToken(
        [
          event.domain,
          event.eventType,
          event.entitySummary,
          event.metadataSummary,
          event.source,
          event.sourceDeviceId,
        ]
          .filter(Boolean)
          .join(" "),
        tokens,
      ),
    )
    .map((event) => ({
      entryId: `sync:${event.eventId}`,
      kind: "sync_event" as const,
      title: `${event.domain}:${event.eventType}`,
      source: event.sourceDeviceId ?? event.source ?? "Unknown",
      payload: event.entitySummary,
      updatedAt: event.createdAt,
    }));
  const sessionRows = historyReadModel.sessions
    .filter((session) =>
      includesAnyToken(
        [
          session.remoteId,
          session.displayName,
          session.supplier,
          session.category,
          session.dataSummary,
          session.overlaySummary,
        ].join(" "),
        tokens,
      ),
    )
    .map((session) => ({
      entryId: `session:${session.remoteId}`,
      kind: "history_entry" as const,
      title: session.displayName,
      source:
        [session.supplier, session.category].filter(Boolean).join(" / ") ||
        "Unknown",
      payload: `${session.dataSummary}; ${session.overlaySummary}`,
      updatedAt: session.updatedAt,
    }));

  return [...syncRows, ...sessionRows].slice(0, 25);
}

function productFromDetail(
  readModel: ShopInventoryReadModel,
  productId: string,
): ProductDetailModalProduct | null {
  const product = [...readModel.products, ...readModel.archivedProducts].find(
    (row) => row.productId === productId,
  );

  if (!product) {
    return null;
  }

  const supplier = product.supplierId
    ? readModel.suppliers.find((row) => row.supplierId === product.supplierId)
    : null;
  const category = product.categoryId
    ? readModel.categories.find((row) => row.categoryId === product.categoryId)
    : null;

  return {
    ...product,
    categoryName: category?.name ?? null,
    state: product.deletedAt ? "archived" : "active",
    supplierName: supplier?.name ?? null,
  };
}

export async function getShopProductDetailModalReadModel(input: {
  productId: string;
  requestedShopId?: string | null;
}): Promise<ProductDetailModalReadModel> {
  const inventoryReadModel = await getShopInventoryProductDetailReadModel({
    productId: input.productId,
    requestedShopId: input.requestedShopId,
  });
  const product = productFromDetail(inventoryReadModel, input.productId);

  if (inventoryReadModel.status !== "ready" || !product) {
    return {
      status:
        inventoryReadModel.status === "ready"
          ? "not_found"
          : inventoryReadModel.status,
      reason:
        inventoryReadModel.status === "ready"
          ? "No product row is visible for the verified shop scope."
          : inventoryReadModel.reason,
      product: null,
      prices: [],
      historyEntries: [],
      diagnostics: {
        catalogScope: inventoryReadModel.catalogScope,
        historyRows: 0,
        lastSyncAt: null,
        mappingState: inventoryReadModel.mapping?.mappingState ?? "not_mapped",
        priceRows: 0,
        selectedShopName: inventoryReadModel.selectedShop?.shopName ?? null,
      },
    };
  }

  const historyReadModel = await getShopHistoryReadModel({
    requestedShopId: input.requestedShopId,
  });
  const historyEntries = productHistoryEntries(
    {
      barcode: product.barcode,
      categoryId: product.categoryId,
      deletedAt: product.deletedAt,
      itemNumber: product.itemNumber,
      productId: product.productId,
      productName: product.productName,
      purchasePrice: product.purchasePrice,
      retailPrice: product.retailPrice,
      secondProductName: product.secondProductName,
      stockQuantity: product.stockQuantity,
      supplierId: product.supplierId,
      updatedAt: product.updatedAt,
    },
    historyReadModel,
  );
  const lastSyncAt =
    historyEntries
      .map((entry) => entry.updatedAt)
      .sort((left, right) => right.localeCompare(left))[0] ?? null;

  return {
    status: "ready",
    reason: inventoryReadModel.reason,
    product,
    prices: inventoryReadModel.prices,
    historyEntries,
    diagnostics: {
      catalogScope: inventoryReadModel.catalogScope,
      historyRows: historyEntries.length,
      lastSyncAt,
      mappingState: inventoryReadModel.mapping?.mappingState ?? "shop_scoped",
      priceRows: inventoryReadModel.prices.length,
      selectedShopName: inventoryReadModel.selectedShop?.shopName ?? null,
    },
  };
}

function usableHistoryCell(value: string) {
  return value && value !== "Not set" && value !== "Overlay unavailable";
}

function historyRowCodes(row: ShopHistoryTablePreviewRow) {
  return [row.barcode, row.item]
    .map((value) => value.trim())
    .filter((value) => usableHistoryCell(value) && value.length >= 3)
    .slice(0, 2);
}

async function resolveLinkedProduct(input: {
  code: string;
  requestedShopId?: string | null;
}) {
  const page = await getShopInventoryProductsPage({
    filters: {
      query: input.code,
      state: "all",
    },
    includeExactTotals: false,
    pageSize: 10,
    requestedShopId: input.requestedShopId,
  });

  if (page.status !== "ready") {
    return null;
  }

  return (
    page.products.find(
      (product) =>
        product.barcode === input.code || product.itemNumber === input.code,
    ) ?? null
  );
}

async function linkedProductsByCode(input: {
  requestedShopId?: string | null;
  rows: readonly ShopHistoryTablePreviewRow[];
}) {
  const codes = Array.from(
    new Set(input.rows.flatMap((row) => historyRowCodes(row))),
  ).slice(0, 12);
  const pairs = await Promise.all(
    codes.map(async (code) => [code, await resolveLinkedProduct({
      code,
      requestedShopId: input.requestedShopId,
    })] as const),
  );

  return new Map(
    pairs
      .filter((pair): pair is readonly [string, ShopInventoryProduct] =>
        Boolean(pair[1]),
      )
      .map(([code, product]) => [code, product]),
  );
}

function historyModalRow(
  row: ShopHistoryTablePreviewRow,
  productsByCode: Map<string, ShopInventoryProduct>,
): HistoryDetailModalRow {
  const product =
    historyRowCodes(row)
      .map((code) => productsByCode.get(code))
      .find(Boolean) ?? null;
  const itemCode =
    row.item !== row.barcode && row.item !== row.name && usableHistoryCell(row.item)
      ? row.item
      : "Not resolved";

  return {
    rowKey: row.rowKey,
    rowNumber: row.rowNumber,
    barcode: usableHistoryCell(row.barcode) ? row.barcode : "Not resolved",
    completion: row.complete,
    itemCode,
    productId: product?.productId ?? null,
    productLabel: product
      ? (product.productName ?? product.secondProductName ?? product.barcode)
      : null,
    productName: usableHistoryCell(row.name)
      ? row.name
      : (product?.productName ?? "Not resolved"),
    purchasePrice: "Not resolved",
    quantity: "Not resolved",
    retailPrice: "Not resolved",
  };
}

export async function getShopHistoryDetailModalReadModel(input: {
  entryId: string;
  requestedShopId?: string | null;
}): Promise<HistoryDetailModalReadModel> {
  const readModel = await getShopHistoryDetailReadModel(input.entryId, {
    requestedShopId: input.requestedShopId,
  });
  const detail = readModel.detail;

  if (readModel.status !== "ready" || !detail) {
    return {
      status: readModel.status,
      reason: readModel.reason,
      detail: null,
      linkedProducts: [],
      missingRows: [],
      rows: [],
      syncEvents: [],
    };
  }

  const productsByCode = await linkedProductsByCode({
    requestedShopId: input.requestedShopId,
    rows: detail.tablePreview,
  });
  const rows = detail.tablePreview.map((row) =>
    historyModalRow(row, productsByCode),
  );

  return {
    status: "ready",
    reason: readModel.reason,
    detail,
    linkedProducts: rows.filter((row) => Boolean(row.productId)),
    missingRows: rows.filter((row) => row.completion !== "Complete"),
    rows,
    syncEvents: detail.relatedSyncEvents,
  };
}
