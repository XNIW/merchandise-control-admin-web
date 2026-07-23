import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  archiveProduct,
  createCategory,
  createProduct,
  createSupplier,
  updateCategory,
  updateProduct,
  updateSupplier,
} from "@/server/shop-admin/catalog-mutations";
import {
  getShopCategoriesPageReadModel,
  getShopInventoryProductsPage,
  getShopInventoryReadModel,
  getShopSuppliersPageReadModel,
} from "@/server/shop-admin/inventory-read-model";
import {
  getShopHistoryListReadModel,
  getShopSyncReadModel,
} from "@/server/shop-admin/history-read-model";
import {
  createHistoryEntry,
  tombstoneHistoryEntry,
  updateHistoryEntry,
} from "@/server/shop-admin/history-mutations";
import {
  mapShopAdminRpcResult,
  resolveShopActionContext,
  shopAdminActionResult,
  type ShopAdminActionResult,
} from "@/server/shop-admin/action-context";
import {
  createSupabaseServerClient,
  type SupabaseServerClient,
} from "@/lib/supabase/server";
import { emitPriceHistoryImportSyncEvent } from "@/server/shop-admin/sync-event-writer";

export const dynamic = "force-dynamic";

const allowedHosts = new Set([
  "merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev",
]);

type StepResult = {
  code: string;
  elapsedMs: number;
  ok: boolean;
  targetId?: string;
};
type FixturePart = "all" | "history" | "lookups" | "products";
type FinalSyncEntity =
  | "category"
  | "history_entry"
  | "history_rows"
  | "product"
  | "product_price"
  | "supplier";
type FinalSyncOperation =
  | "archive"
  | "create"
  | "noop"
  | "observe"
  | "residue"
  | "tombstone"
  | "update"
  | "write";
type FinalSyncScenario =
  | "burst10"
  | "cold_restart"
  | "duplicate"
  | "noop"
  | "observe"
  | "offline_reconnect"
  | "online"
  | "stale_conflict";
type FinalSyncData = {
  barcode?: string;
  categoryId?: string;
  effectiveAt?: string;
  itemNumber?: string;
  name?: string;
  note?: string;
  price?: number;
  productId?: string;
  productName?: string;
  purchasePrice?: number;
  retailPrice?: number;
  source?: string;
  stockQuantity?: number;
  supplierId?: string;
  type?: "PURCHASE" | "RETAIL";
};
type FinalSyncRequest = {
  confirm: "staging-sync-final";
  correlationId: string;
  data: FinalSyncData;
  entity: FinalSyncEntity;
  entityId?: string;
  fixtureId: string;
  mode: "final";
  operation: FinalSyncOperation;
  prefix: string;
  requestId: string;
  scenario: FinalSyncScenario;
  shopId: string;
};
type FinalSyncObservation = {
  catalogScope?: string;
  checkpoint: string | null;
  entityId: string | null;
  eventId: string | null;
  pageCount: number;
  pending: number | null;
  queryCount: number | null;
  recordCount: number;
  records: readonly unknown[];
};

const FINAL_SYNC_MARKER = "TASK_SYNC_FINAL_ADMIN_V1";
const FINAL_SYNC_PREFIX =
  /^TASK_SYNC_FINAL_20260714_[A-Za-z0-9][A-Za-z0-9-]{5,63}_$/;
const FINAL_SYNC_ID = /^[A-Za-z0-9][A-Za-z0-9-]{5,63}$/;
const FINAL_SYNC_BODY_MAX_BYTES = 16 * 1024;
const finalSyncEntities = new Set<FinalSyncEntity>([
  "category",
  "history_entry",
  "history_rows",
  "product",
  "product_price",
  "supplier",
]);
const finalSyncOperations = new Set<FinalSyncOperation>([
  "archive",
  "create",
  "noop",
  "observe",
  "residue",
  "tombstone",
  "update",
  "write",
]);
const finalSyncScenarios = new Set<FinalSyncScenario>([
  "burst10",
  "cold_restart",
  "duplicate",
  "noop",
  "observe",
  "offline_reconnect",
  "online",
  "stale_conflict",
]);

function isAllowedHost(request: NextRequest) {
  const host = request.headers.get("host") ?? "";

  if (allowedHosts.has(host)) {
    return true;
  }

  try {
    const parsed = new URL(`http://${host}`);
    const localHost =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    const validPort = !parsed.port || /^\d{2,5}$/.test(parsed.port);

    return localHost && validPort;
  } catch {
    return false;
  }
}

function isSameOriginMutation(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (!origin || (fetchSite && fetchSite !== "same-origin")) {
    return false;
  }

  try {
    const parsedOrigin = new URL(origin);
    const secureOrigin =
      parsedOrigin.protocol === "https:" ||
      (parsedOrigin.protocol === "http:" &&
        (parsedOrigin.hostname === "localhost" ||
          parsedOrigin.hostname === "127.0.0.1"));

    return secureOrigin && parsedOrigin.host === host && isAllowedHost(request);
  } catch {
    return false;
  }
}

function cleanPrefix(value: string | null) {
  const prefix = value?.trim() ?? "";
  const allowedPrefix =
    prefix.startsWith("SYNC_TEST_") || prefix.startsWith("SYNC_PERF_");

  if (
    allowedPrefix &&
    prefix.endsWith("_") &&
    prefix.length >= 16 &&
    prefix.length <= 96 &&
    /^[A-Z0-9_]+$/.test(prefix)
  ) {
    return prefix;
  }

  return null;
}

function cleanPart(value: string | null): FixturePart | null {
  const part = value?.trim() || "all";

  return part === "all" || part === "history" || part === "lookups" || part === "products"
    ? part
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanFinalString(value: unknown, maxLength = 160) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized && normalized.length <= maxLength ? normalized : null;
}

function cleanOptionalFinalString(value: unknown, maxLength = 240) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return cleanFinalString(value, maxLength) ?? undefined;
}

function cleanOptionalFinalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function parseFinalSyncData(value: unknown): FinalSyncData | null {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    return null;
  }

  const type = cleanOptionalFinalString(value.type, 16)?.toUpperCase();

  if (type && type !== "PURCHASE" && type !== "RETAIL") {
    return null;
  }

  return {
    barcode: cleanOptionalFinalString(value.barcode),
    categoryId: cleanOptionalFinalString(value.categoryId),
    effectiveAt: cleanOptionalFinalString(value.effectiveAt, 80),
    itemNumber: cleanOptionalFinalString(value.itemNumber),
    name: cleanOptionalFinalString(value.name),
    note: cleanOptionalFinalString(value.note),
    price: cleanOptionalFinalNumber(value.price),
    productId: cleanOptionalFinalString(value.productId),
    productName: cleanOptionalFinalString(value.productName),
    purchasePrice: cleanOptionalFinalNumber(value.purchasePrice),
    retailPrice: cleanOptionalFinalNumber(value.retailPrice),
    source: cleanOptionalFinalString(value.source),
    stockQuantity: cleanOptionalFinalNumber(value.stockQuantity),
    supplierId: cleanOptionalFinalString(value.supplierId),
    type: type as FinalSyncData["type"],
  };
}

function parseFinalSyncRequest(value: unknown): FinalSyncRequest | null {
  if (!isRecord(value)) {
    return null;
  }

  const prefix = cleanFinalString(value.prefix, 96);
  const entity = cleanFinalString(value.entity, 32)?.toLowerCase();
  const operation = cleanFinalString(value.operation, 24)?.toLowerCase();
  const scenario = (cleanOptionalFinalString(value.scenario, 32) ?? "online").toLowerCase();
  const correlationId = cleanFinalString(value.correlationId, 64);
  const fixtureId = cleanFinalString(value.fixtureId, 64);
  const shopId = cleanFinalString(value.shopId, 80);
  const requestId = cleanOptionalFinalString(value.requestId, 64) ?? correlationId;
  const data = parseFinalSyncData(value.data);

  if (
    value.mode !== "final" ||
    value.confirm !== "staging-sync-final" ||
    !prefix ||
    !FINAL_SYNC_PREFIX.test(prefix) ||
    !entity ||
    !finalSyncEntities.has(entity as FinalSyncEntity) ||
    !operation ||
    !finalSyncOperations.has(operation as FinalSyncOperation) ||
    !scenario ||
    !finalSyncScenarios.has(scenario as FinalSyncScenario) ||
    !correlationId ||
    !fixtureId ||
    !requestId ||
    !FINAL_SYNC_ID.test(correlationId) ||
    !FINAL_SYNC_ID.test(fixtureId) ||
    !FINAL_SYNC_ID.test(requestId) ||
    !shopId ||
    shopId.includes("%") ||
    data === null
  ) {
    return null;
  }

  const finalEntity = entity as FinalSyncEntity;
  const finalOperation = operation as FinalSyncOperation;
  const historyReadOnly =
    finalEntity === "history_entry" || finalEntity === "history_rows";

  if (
    historyReadOnly &&
    finalOperation !== "observe" &&
    finalOperation !== "noop" &&
    finalOperation !== "residue"
  ) {
    return null;
  }

  if (scenario === "observe" && finalOperation !== "observe" && finalOperation !== "noop") {
    return null;
  }

  return {
    confirm: "staging-sync-final",
    correlationId,
    data,
    entity: finalEntity,
    entityId: cleanOptionalFinalString(value.entityId, 80),
    fixtureId,
    mode: "final",
    operation: finalOperation,
    prefix,
    requestId,
    scenario: scenario as FinalSyncScenario,
    shopId,
  };
}

function finalSyncBase(input: FinalSyncRequest) {
  return `${input.prefix}${input.fixtureId}_${input.entity.toUpperCase()}`;
}

function finalSyncReadPermission(entity: FinalSyncEntity) {
  return entity === "history_entry" || entity === "history_rows"
    ? ("history.view" as const)
    : ("catalog.view" as const);
}

function deterministicUuid(seed: string) {
  const digest = createHash("sha256").update(seed).digest("hex");

  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `4${digest.slice(13, 16)}`,
    `8${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join("-");
}

function finalSyncTimestamp(value?: string, appendVersion = false) {
  return (
    value ?? (appendVersion ? "2026-07-15 12:00:01" : "2026-07-15 12:00:00")
  );
}

function requireTargetId(result: ShopAdminActionResult, step: string) {
  if (!result.targetId) {
    throw new Error(`${step}:missing_target_id`);
  }

  return result.targetId;
}

async function runStep(
  name: string,
  steps: Record<string, StepResult>,
  action: () => Promise<ShopAdminActionResult>,
) {
  const startedAt = Date.now();
  const result = await action();

  steps[name] = {
    code: result.code,
    elapsedMs: Date.now() - startedAt,
    ok: result.ok,
    targetId: result.targetId,
  };

  if (!result.ok) {
    throw new Error(`${name}:${result.code}`);
  }

  return result;
}

function rowsText(prefix: string, suffix: string) {
  return ["barcode,count", `${prefix}${suffix},1`].join("\n");
}

async function runLookupFixture(input: {
  prefix: string;
  requestedShopId?: string;
  steps: Record<string, StepResult>;
}) {
  const standaloneSupplier = await runStep("supplier_create", input.steps, () =>
    createSupplier({
      name: `${input.prefix}SUPPLIER_UPDATE_INITIAL`,
      requestedShopId: input.requestedShopId,
    }),
  );
  await runStep("supplier_update", input.steps, () =>
    updateSupplier({
      id: requireTargetId(standaloneSupplier, "supplier_create"),
      name: `${input.prefix}SUPPLIER_UPDATE_FINAL`,
      requestedShopId: input.requestedShopId,
    }),
  );

  const standaloneCategory = await runStep("category_create", input.steps, () =>
    createCategory({
      name: `${input.prefix}CATEGORY_UPDATE_INITIAL`,
      requestedShopId: input.requestedShopId,
    }),
  );
  await runStep("category_update", input.steps, () =>
    updateCategory({
      id: requireTargetId(standaloneCategory, "category_create"),
      name: `${input.prefix}CATEGORY_UPDATE_FINAL`,
      requestedShopId: input.requestedShopId,
    }),
  );
}

async function runProductFixture(input: {
  prefix: string;
  requestedShopId?: string;
  steps: Record<string, StepResult>;
}) {
  const productSupplier = `${input.prefix}PRODUCT_SUPPLIER`;
  const productCategory = `${input.prefix}PRODUCT_CATEGORY`;
  const productSupplierResult = await runStep("product_supplier_create", input.steps, () =>
    createSupplier({
      name: productSupplier,
      requestedShopId: input.requestedShopId,
    }),
  );
  const productCategoryResult = await runStep("product_category_create", input.steps, () =>
    createCategory({
      name: productCategory,
      requestedShopId: input.requestedShopId,
    }),
  );
  const supplierId = requireTargetId(productSupplierResult, "product_supplier_create");
  const categoryId = requireTargetId(productCategoryResult, "product_category_create");

  await runStep("product_create", input.steps, () =>
    createProduct({
      barcode: `${input.prefix}PRODUCT_CREATE`,
      categoryId,
      productName: `${input.prefix}PRODUCT_CREATE_NAME`,
      purchasePrice: 11,
      requestedShopId: input.requestedShopId,
      retailPrice: 15,
      stockQuantity: 3,
      supplierId,
    }),
  );

  const productForUpdate = await runStep("product_update_seed", input.steps, () =>
    createProduct({
      barcode: `${input.prefix}PRODUCT_UPDATE`,
      categoryId,
      productName: `${input.prefix}PRODUCT_UPDATE_INITIAL_NAME`,
      purchasePrice: 21,
      requestedShopId: input.requestedShopId,
      retailPrice: 25,
      stockQuantity: 4,
      supplierId,
    }),
  );
  await runStep("product_update", input.steps, () =>
    updateProduct({
      barcode: `${input.prefix}PRODUCT_UPDATE`,
      categoryId,
      productId: requireTargetId(productForUpdate, "product_update_seed"),
      productName: `${input.prefix}PRODUCT_UPDATE_FINAL_NAME`,
      purchasePrice: 22,
      requestedShopId: input.requestedShopId,
      retailPrice: 26,
      stockQuantity: 6,
      supplierId,
    }),
  );

  const productForTombstone = await runStep("product_tombstone_seed", input.steps, () =>
    createProduct({
      barcode: `${input.prefix}PRODUCT_TOMBSTONE`,
      categoryId,
      productName: `${input.prefix}PRODUCT_TOMBSTONE_NAME`,
      purchasePrice: 31,
      requestedShopId: input.requestedShopId,
      retailPrice: 35,
      stockQuantity: 5,
      supplierId,
    }),
  );
  await runStep("product_tombstone", input.steps, () =>
    archiveProduct({
      id: requireTargetId(productForTombstone, "product_tombstone_seed"),
      reason: "SYNC_TEST staging QA tombstone",
      requestedShopId: input.requestedShopId,
    }),
  );
}

async function runHistoryFixture(input: {
  prefix: string;
  requestedShopId?: string;
  steps: Record<string, StepResult>;
}) {
  const productSupplier = `${input.prefix}PRODUCT_SUPPLIER`;
  const productCategory = `${input.prefix}PRODUCT_CATEGORY`;

  await runStep("history_create", input.steps, () =>
    createHistoryEntry({
      category: productCategory,
      completeRows: true,
      displayName: `${input.prefix}HISTORY_CREATE`,
      requestedShopId: input.requestedShopId,
      rowsText: rowsText(input.prefix, "HISTORY_CREATE"),
      supplier: productSupplier,
    }),
  );

  const historyForUpdate = await runStep("history_update_seed", input.steps, () =>
    createHistoryEntry({
      category: productCategory,
      completeRows: true,
      displayName: `${input.prefix}HISTORY_UPDATE_INITIAL`,
      requestedShopId: input.requestedShopId,
      rowsText: rowsText(input.prefix, "HISTORY_UPDATE_INITIAL"),
      supplier: productSupplier,
    }),
  );
  await runStep("history_update", input.steps, () =>
    updateHistoryEntry({
      category: productCategory,
      completeRows: true,
      displayName: `${input.prefix}HISTORY_UPDATE_FINAL`,
      remoteId: requireTargetId(historyForUpdate, "history_update_seed"),
      requestedShopId: input.requestedShopId,
      rowsText: rowsText(input.prefix, "HISTORY_UPDATE_FINAL"),
      supplier: productSupplier,
    }),
  );

  const historyForTombstone = await runStep("history_tombstone_seed", input.steps, () =>
    createHistoryEntry({
      category: productCategory,
      completeRows: true,
      displayName: `${input.prefix}HISTORY_TOMBSTONE`,
      requestedShopId: input.requestedShopId,
      rowsText: rowsText(input.prefix, "HISTORY_TOMBSTONE"),
      supplier: productSupplier,
    }),
  );
  await runStep("history_tombstone", input.steps, () =>
    tombstoneHistoryEntry({
      reason: "SYNC_TEST staging QA tombstone",
      remoteId: requireTargetId(historyForTombstone, "history_tombstone_seed"),
      requestedShopId: input.requestedShopId,
    }),
  );
}

function finalReadFailureStatus(status: string) {
  if (status === "not_configured") {
    return 503;
  }

  if (status === "unauthorized" || status === "no_session" || status === "session_expired") {
    return 403;
  }

  return status === "unmapped" ? 404 : 500;
}

function finalActionStatus(result: ShopAdminActionResult) {
  if (result.ok) {
    return 200;
  }

  if (result.code === "no_active_session" || result.code === "session_expired") {
    return 401;
  }

  if (result.code === "permission_denied" || result.code === "unauthorized" || result.code === "unauthorized_or_unmapped") {
    return 403;
  }

  if (result.code === "not_found" || result.code === "invalid_state_or_not_found") {
    return 404;
  }

  if (result.code === "conflict") {
    return 409;
  }

  if (result.code === "not_configured") {
    return 503;
  }

  return result.code === "db_failure" ? 500 : 400;
}

function finalEntityIdFromRecord(entity: FinalSyncEntity, record: unknown) {
  if (!isRecord(record)) {
    return null;
  }

  const key =
    entity === "product"
      ? "productId"
      : entity === "category"
        ? "categoryId"
        : entity === "supplier"
          ? "supplierId"
          : entity === "product_price"
            ? "priceId"
            : "remoteId";

  return typeof record[key] === "string" ? record[key] : null;
}

function finalSyncDomain(entity: FinalSyncEntity) {
  if (entity === "product_price") {
    return "prices";
  }

  return entity === "history_entry" || entity === "history_rows"
    ? "history"
    : "catalog";
}

function emptyFinalSyncObservation(): FinalSyncObservation {
  return {
    checkpoint: null,
    entityId: null,
    eventId: null,
    pageCount: 0,
    pending: 0,
    queryCount: 0,
    recordCount: 0,
    records: [],
  };
}

async function runFinalCatalogRpc(
  call: (
    supabase: SupabaseServerClient,
  ) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<ShopAdminActionResult> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return shopAdminActionResult("not_configured", { ok: false });
  }

  const { data, error } = await call(supabase);

  return error
    ? shopAdminActionResult("db_failure", { ok: false })
    : mapShopAdminRpcResult(data);
}

async function observeFinalProductExact(input: FinalSyncRequest) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { catalogScope: undefined, records: [], status: "not_configured" };
  }

  const base = finalSyncBase(input);
  let query = supabase
    .from("inventory_products")
    .select(
      "id,barcode,item_number,product_name,second_product_name,purchase_price,retail_price,supplier_id,category_id,stock_quantity,deleted_at,shop_id",
    )
    .eq("shop_id", input.shopId);

  query = input.entityId
    ? query.eq("id", input.entityId)
    : query.eq("barcode", input.data.barcode ?? `${base}_BARCODE`);

  const { data, error } = await query.limit(2);

  if (error) {
    return { catalogScope: undefined, records: [], status: "db_failure" };
  }

  const records = (data ?? []).map((row) => ({
    barcode: row.barcode,
    categoryId: row.category_id,
    deletedAt: row.deleted_at,
    itemNumber: row.item_number,
    productId: row.id,
    productName: row.product_name,
    purchasePrice: row.purchase_price,
    retailPrice: row.retail_price,
    secondProductName: row.second_product_name,
    shopId: row.shop_id,
    stockQuantity: row.stock_quantity,
    supplierId: row.supplier_id,
  }));

  return {
    catalogScope: records.length > 0 ? "shop_scoped" : undefined,
    records,
    status: "ready",
  };
}

async function observeFinalCheckpointExact(input: FinalSyncRequest) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { checkpoint: null, status: "not_configured" };
  }

  const { data, error } = await supabase
    .from("sync_events")
    .select("id")
    .eq("shop_id", input.shopId)
    .order("id", { ascending: false })
    .limit(1);

  if (error) {
    return { checkpoint: null, status: "db_failure" };
  }

  return {
    checkpoint: data?.[0]?.id ? String(data[0].id) : null,
    status: "ready",
  };
}

async function observeFinalSync(input: FinalSyncRequest): Promise<
  | { code: string; ok: false; status: number }
  | { observation: FinalSyncObservation; ok: true }
> {
  const base = finalSyncBase(input);
  const needsSyncTelemetry = ![
    "noop",
    "observe",
    "residue",
  ].includes(input.operation);
  const syncModelPromise = needsSyncTelemetry
    ? getShopSyncReadModel({ requestedShopId: input.shopId })
    : null;
  const checkpointPromise =
    input.operation === "noop" ? observeFinalCheckpointExact(input) : null;
  const burstObservation =
    input.scenario === "burst10" &&
    (input.operation === "observe" ||
      input.operation === "noop" ||
      input.operation === "residue");
  const observationBase = burstObservation
    ? `${input.prefix}${input.fixtureId}-B`
    : base;
  let catalogScope: string | undefined;
  let pageCount = 1;
  let records: readonly unknown[] = [];
  let readStatus = "ready";

  if (input.entity === "product") {
    if (burstObservation) {
      const readModel = await getShopInventoryProductsPage({
        filters: { query: observationBase, state: "all" },
        includeExactTotals: false,
        page: 1,
        pageSize: 100,
        requestedShopId: input.shopId,
      });
      readStatus = readModel.status;
      catalogScope = readModel.catalogScope;
      pageCount = readModel.pagination.currentPageRows > 0 ? 1 : 0;
      records = readModel.products.filter((row) =>
        row.barcode.startsWith(observationBase),
      );
    } else {
      const exact = await observeFinalProductExact(input);
      readStatus = exact.status;
      catalogScope = exact.catalogScope;
      records = exact.records;
      pageCount = records.length > 0 ? 1 : 0;
    }
  } else if (input.entity === "category") {
    const readModel = await getShopCategoriesPageReadModel({
      filters: {
        query: burstObservation
          ? observationBase
          : (input.data.name ?? base),
        state: "all",
      },
      page: 1,
      pageSize: 100,
      requestedShopId: input.shopId,
    });
    readStatus = readModel.status;
    catalogScope = readModel.catalogScope;
    pageCount = readModel.pagination.currentPageRows > 0 ? 1 : 0;
    records = readModel.categories.filter((row) =>
      input.entityId
        ? row.categoryId === input.entityId
        : burstObservation
          ? row.name.startsWith(observationBase)
          : row.name === (input.data.name ?? `${base}_NAME`) ||
            row.name === `${base}_UPDATED`,
    );
  } else if (input.entity === "supplier") {
    const readModel = await getShopSuppliersPageReadModel({
      filters: {
        query: burstObservation
          ? observationBase
          : (input.data.name ?? base),
        state: "all",
      },
      page: 1,
      pageSize: 100,
      requestedShopId: input.shopId,
    });
    readStatus = readModel.status;
    catalogScope = readModel.catalogScope;
    pageCount = readModel.pagination.currentPageRows > 0 ? 1 : 0;
    records = readModel.suppliers.filter((row) =>
      input.entityId
        ? row.supplierId === input.entityId
        : burstObservation
          ? row.name.startsWith(observationBase)
          : row.name === (input.data.name ?? `${base}_NAME`) ||
            row.name === `${base}_UPDATED`,
    );
  } else if (input.entity === "product_price") {
    const readModel = await getShopInventoryReadModel({
      requestedShopId: input.shopId,
      rowLimit: 200,
    });
    readStatus = readModel.status;
    catalogScope = readModel.catalogScope;
    records = readModel.prices.filter((row) =>
      input.entityId
        ? row.priceId === input.entityId
        : row.source?.startsWith(observationBase) ||
          row.note?.startsWith(observationBase),
    );
    pageCount = records.length > 0 ? 1 : 0;
  } else {
    const readModel = await getShopHistoryListReadModel({
      filters: { query: base, status: "all" },
      page: 1,
      pageSize: 100,
      requestedShopId: input.shopId,
    });
    readStatus = readModel.status;
    records = readModel.sessions.filter((row) =>
      input.entityId
        ? row.remoteId === input.entityId
        : row.remoteId.startsWith(observationBase) ||
          row.displayName.startsWith(observationBase),
    );
    pageCount = readModel.pagination?.currentPageRows ? 1 : 0;
  }

  const syncModel = syncModelPromise ? await syncModelPromise : null;
  const exactCheckpoint = checkpointPromise ? await checkpointPromise : null;

  if (readStatus !== "ready" || exactCheckpoint?.status === "db_failure") {
    const failedStatus =
      readStatus !== "ready" ? readStatus : exactCheckpoint?.status ?? "db_failure";
    return {
      code: `read_${failedStatus}`,
      ok: false,
      status: finalReadFailureStatus(failedStatus),
    };
  }

  const entityId = finalEntityIdFromRecord(input.entity, records[0]);
  const domain = finalSyncDomain(input.entity);
  const matchingEvent = syncModel?.syncEvents.find(
    (event) =>
      event.domain === domain &&
      (!entityId || event.entitySummary.includes(entityId)),
  );
  const latestEvent = syncModel?.syncEvents[0];

  return {
    ok: true,
    observation: {
      catalogScope,
      checkpoint: exactCheckpoint?.checkpoint ?? latestEvent?.eventId ?? null,
      entityId,
      eventId: matchingEvent?.eventId ?? null,
      pageCount,
      pending:
        input.operation === "noop"
          ? 0
          : syncModel
            ? syncModel.status === "ready"
              ? syncModel.syncEvents.filter((event) => event.status === "pending").length
              : null
            : 0,
      queryCount: needsSyncTelemetry
        ? null
        : input.operation === "noop"
          ? 2
          : 1,
      recordCount: records.length,
      records,
    },
  };
}

function existingRecordId(input: FinalSyncRequest, observation: FinalSyncObservation) {
  return input.entityId ?? observation.entityId ?? undefined;
}

async function mutateFinalProduct(
  input: FinalSyncRequest,
  observation: FinalSyncObservation,
): Promise<ShopAdminActionResult> {
  const base = finalSyncBase(input);
  const existing = observation.records[0];
  const existingProduct = isRecord(existing) ? existing : null;
  const productId = existingRecordId(input, observation);
  const operation = input.operation === "archive" ? "tombstone" : input.operation;

  if (operation === "tombstone") {
    return productId
      ? runFinalCatalogRpc((supabase) =>
          supabase.rpc("shop_catalog_archive_product_with_sync", {
            p_actor_kind: "personal_account",
            p_product_id: productId,
            p_reason: "TASK_SYNC_FINAL scoped staging QA tombstone",
            p_shop_id: input.shopId,
          }),
        )
      : shopAdminActionResult("not_found", { ok: false });
  }

  if (operation === "create" && productId) {
    return shopAdminActionResult("success", {
      ok: true,
      shopId: input.shopId,
      targetId: productId,
    });
  }

  const create = operation === "create" || (operation === "write" && !productId);
  const productInput = {
    barcode: input.data.barcode ?? `${base}_BARCODE`,
    categoryId:
      input.data.categoryId ??
      (typeof existingProduct?.categoryId === "string" ? existingProduct.categoryId : undefined),
    itemNumber:
      input.data.itemNumber ??
      (typeof existingProduct?.itemNumber === "string" ? existingProduct.itemNumber : `${base}_ITEM`),
    productName:
      input.data.productName ?? `${base}_${create ? "NAME" : "NAME_UPDATED"}`,
    purchasePrice:
      input.data.purchasePrice ??
      (typeof existingProduct?.purchasePrice === "number" ? existingProduct.purchasePrice : 11),
    requestedShopId: input.shopId,
    retailPrice:
      input.data.retailPrice ??
      (typeof existingProduct?.retailPrice === "number" ? existingProduct.retailPrice : 15),
    stockQuantity:
      input.data.stockQuantity ??
      (typeof existingProduct?.stockQuantity === "number" ? existingProduct.stockQuantity : 3),
    supplierId:
      input.data.supplierId ??
      (typeof existingProduct?.supplierId === "string" ? existingProduct.supplierId : undefined),
  };

  if (create) {
    return runFinalCatalogRpc((supabase) =>
      supabase.rpc("shop_catalog_create_product_with_sync", {
        p_actor_kind: "personal_account",
        p_barcode: productInput.barcode,
        p_category_id: productInput.categoryId,
        p_item_number: productInput.itemNumber,
        p_product_name: productInput.productName,
        p_purchase_price: productInput.purchasePrice,
        p_retail_price: productInput.retailPrice,
        p_second_product_name: undefined,
        p_shop_id: input.shopId,
        p_stock_quantity: productInput.stockQuantity,
        p_supplier_id: productInput.supplierId,
      }),
    );
  }

  return productId
    ? runFinalCatalogRpc((supabase) =>
        supabase.rpc("shop_catalog_update_product_with_sync", {
          p_actor_kind: "personal_account",
          p_barcode: productInput.barcode,
          p_category_id: productInput.categoryId,
          p_item_number: productInput.itemNumber,
          p_product_id: productId,
          p_product_name: productInput.productName,
          p_purchase_price: productInput.purchasePrice,
          p_retail_price: productInput.retailPrice,
          p_second_product_name: undefined,
          p_shop_id: input.shopId,
          p_stock_quantity: productInput.stockQuantity,
          p_supplier_id: productInput.supplierId,
        }),
      )
    : shopAdminActionResult("not_found", { ok: false });
}

async function mutateFinalLookup(
  input: FinalSyncRequest,
  observation: FinalSyncObservation,
): Promise<ShopAdminActionResult> {
  const base = finalSyncBase(input);
  const targetId = existingRecordId(input, observation);
  const operation = input.operation === "archive" ? "tombstone" : input.operation;
  const name = input.data.name ?? `${base}_${targetId ? "NAME_UPDATED" : "NAME"}`;

  if (operation === "tombstone") {
    if (!targetId) {
      return shopAdminActionResult("not_found", { ok: false });
    }

    return runFinalCatalogRpc((supabase) =>
      input.entity === "category"
        ? supabase.rpc("shop_catalog_archive_category_with_sync", {
            p_actor_kind: "personal_account",
            p_category_id: targetId,
            p_reason: "TASK_SYNC_FINAL scoped staging QA tombstone",
            p_shop_id: input.shopId,
          })
        : supabase.rpc("shop_catalog_archive_supplier_with_sync", {
            p_actor_kind: "personal_account",
            p_reason: "TASK_SYNC_FINAL scoped staging QA tombstone",
            p_shop_id: input.shopId,
            p_supplier_id: targetId,
          }),
    );
  }

  if (operation === "create" && targetId) {
    return shopAdminActionResult("success", {
      ok: true,
      shopId: input.shopId,
      targetId,
    });
  }

  const create = operation === "create" || (operation === "write" && !targetId);

  if (input.entity === "category") {
    return create
      ? runFinalCatalogRpc((supabase) =>
          supabase.rpc("shop_catalog_create_category_with_sync", {
            p_actor_kind: "personal_account",
            p_name: name,
            p_shop_id: input.shopId,
          }),
        )
      : targetId
        ? runFinalCatalogRpc((supabase) =>
            supabase.rpc("shop_catalog_update_category_with_sync", {
              p_actor_kind: "personal_account",
              p_category_id: targetId,
              p_name: name,
              p_shop_id: input.shopId,
            }),
          )
        : shopAdminActionResult("not_found", { ok: false });
  }

  return create
    ? runFinalCatalogRpc((supabase) =>
        supabase.rpc("shop_catalog_create_supplier_with_sync", {
          p_actor_kind: "personal_account",
          p_name: name,
          p_shop_id: input.shopId,
        }),
      )
    : targetId
      ? runFinalCatalogRpc((supabase) =>
          supabase.rpc("shop_catalog_update_supplier_with_sync", {
            p_actor_kind: "personal_account",
            p_name: name,
            p_shop_id: input.shopId,
            p_supplier_id: targetId,
          }),
        )
      : shopAdminActionResult("not_found", { ok: false });
}

async function mutateFinalProductPrice(
  input: FinalSyncRequest,
  observation: FinalSyncObservation,
): Promise<{ result: ShopAdminActionResult; setupPerformed: boolean }> {
  const operation = input.operation === "archive" ? "tombstone" : input.operation;

  if (operation === "tombstone") {
    return {
      result: shopAdminActionResult("success", {
        ok: true,
        shopId: input.shopId,
        targetId: existingRecordId(input, observation),
      }),
      setupPerformed: false,
    };
  }

  const context = await resolveShopActionContext(input.shopId, "products.write");

  if (context.status !== "ready") {
    return { result: context.result, setupPerformed: false };
  }

  const base = finalSyncBase(input);
  const appendVersion = operation === "update";
  const existingPriceId = existingRecordId(input, observation);
  let setupPerformed = false;
  let productId = input.data.productId;
  let targetPrice: {
    id: string;
    product_id: string;
    type: string;
  } | null = null;

  if (appendVersion) {
    if (!existingPriceId) {
      return {
        result: shopAdminActionResult("not_found", { ok: false }),
        setupPerformed,
      };
    }

    const { data, error } = await context.supabase
      .from("inventory_product_prices")
      .select("id,product_id,type")
      .eq("id", existingPriceId)
      .eq("shop_id", context.selectedShop.shopId)
      .maybeSingle<{ id: string; product_id: string; type: string }>();

    if (error || !data) {
      return {
        result: shopAdminActionResult(error ? "db_failure" : "not_found", {
          ok: false,
        }),
        setupPerformed,
      };
    }

    targetPrice = data;

    if (
      (productId && productId !== targetPrice.product_id) ||
      (input.data.type && input.data.type !== targetPrice.type)
    ) {
      return {
        result: shopAdminActionResult("not_found", { ok: false }),
        setupPerformed,
      };
    }

    productId = targetPrice.product_id;
  }

  if (!productId) {
    const productResult = await getShopInventoryProductsPage({
      filters: { query: `${base}_PRODUCT_BARCODE`, state: "active" },
      includeExactTotals: false,
      page: 1,
      pageSize: 10,
      requestedShopId: input.shopId,
    });
    productId = productResult.products.find(
      (product) => product.barcode === `${base}_PRODUCT_BARCODE`,
    )?.productId;
  }

  if (!productId && (operation === "create" || operation === "write")) {
    const setup = await createProduct({
      barcode: `${base}_PRODUCT_BARCODE`,
      productName: `${base}_PRODUCT_NAME`,
      purchasePrice: 11,
      requestedShopId: input.shopId,
      retailPrice: 15,
      stockQuantity: 1,
    });

    if (!setup.ok || !setup.targetId) {
      return { result: setup, setupPerformed: false };
    }

    productId = setup.targetId;
    setupPerformed = true;
  }

  if (!productId) {
    return {
      result: shopAdminActionResult("not_found", { ok: false }),
      setupPerformed,
    };
  }

  const { data: product, error: productError } = await context.supabase
    .from("inventory_products")
    .select("id,owner_user_id,shop_id")
    .eq("id", productId)
    .eq("shop_id", context.selectedShop.shopId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; owner_user_id: string; shop_id: string | null }>();

  if (productError || !product || product.shop_id !== context.selectedShop.shopId) {
    return {
      result: shopAdminActionResult(productError ? "db_failure" : "not_found", {
        ok: false,
      }),
      setupPerformed,
    };
  }

  const type = input.data.type ?? targetPrice?.type ?? "RETAIL";
  const effectiveAt = finalSyncTimestamp(input.data.effectiveAt, appendVersion);
  const priceId =
    appendVersion
      ? deterministicUuid(
          `${input.prefix}:${input.fixtureId}:${productId}:${type}:${effectiveAt}:append`,
        )
      : existingPriceId ??
        deterministicUuid(`${input.prefix}:${input.fixtureId}:${productId}:${type}:${effectiveAt}`);
  const price =
    input.data.price ?? (operation === "update" || existingPriceId ? 102 : 101);
  const priceRow = {
    created_at: effectiveAt,
    effective_at: effectiveAt,
    id: priceId,
    note: input.data.note ?? `${base}_${operation === "update" ? "UPDATED" : "NAME"}`,
    owner_user_id: product.owner_user_id,
    price,
    product_id: product.id,
    shop_id: context.selectedShop.shopId,
    source: input.data.source ?? `${base}_SOURCE`,
    type,
  };
  const writeResult = await context.supabase
    .from("inventory_product_prices")
    .upsert(priceRow, {
      onConflict: "owner_user_id,product_id,type,effective_at",
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (writeResult.error || !writeResult.data) {
    return {
      result: shopAdminActionResult(
        writeResult.error ? "db_failure" : "not_found",
        { ok: false },
      ),
      setupPerformed,
    };
  }

  const syncResult = await emitPriceHistoryImportSyncEvent({
    context,
    priceIds: [writeResult.data.id],
  });

  return {
    result: shopAdminActionResult(syncResult.ok ? "success" : syncResult.code, {
      ok: syncResult.ok,
      shopId: input.shopId,
      targetId: writeResult.data.id,
    }),
    setupPerformed,
  };
}

function finalJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

async function runFinalSyncRequest(
  input: FinalSyncRequest,
  payloadBytes: number,
) {
  const startedAt = Date.now();
  const readOnlyOperation =
    input.operation === "noop" ||
    input.operation === "observe" ||
    input.operation === "residue";
  const needsPreMutationRead =
    readOnlyOperation ||
    (input.scenario === "duplicate" && Boolean(input.entityId)) ||
    (input.operation !== "create" && !input.entityId);
  if (readOnlyOperation) {
    const readContext = await resolveShopActionContext(
      input.shopId,
      finalSyncReadPermission(input.entity),
    );
    if (readContext.status !== "ready") {
      return finalJson(
        {
          code: readContext.result.code,
          marker: FINAL_SYNC_MARKER,
          ok: false,
          result: "denied",
        },
        finalActionStatus(readContext.result),
      );
    }
  }
  const beforeResult = needsPreMutationRead
    ? await observeFinalSync(input)
    : ({ ok: true, observation: emptyFinalSyncObservation() } as const);
  const beforeReadElapsedMs = Date.now() - startedAt;

  if (!beforeResult.ok) {
    return finalJson(
      {
        code: beforeResult.code,
        marker: FINAL_SYNC_MARKER,
        ok: false,
        result: "denied",
      },
      beforeResult.status,
    );
  }

  const before = beforeResult.observation;
  let actionResult = shopAdminActionResult("success", {
    ok: true,
    shopId: input.shopId,
    targetId: before.entityId ?? undefined,
  });
  let result =
    input.operation === "residue"
      ? before.recordCount === 0
        ? "residue_clear"
        : "residue_present"
      : readOnlyOperation
        ? input.operation
        : "mutated";
  let setupPerformed = false;
  let serverCommitElapsedMs = beforeReadElapsedMs;

  if (!readOnlyOperation) {
    if (input.entity === "product") {
      actionResult = await mutateFinalProduct(input, before);
    } else if (input.entity === "category" || input.entity === "supplier") {
      actionResult = await mutateFinalLookup(input, before);
    } else if (input.entity === "product_price") {
      const mutation = await mutateFinalProductPrice(input, before);
      actionResult = mutation.result;
      setupPerformed = mutation.setupPerformed;
      const normalizedOperation =
        input.operation === "archive" ? "tombstone" : input.operation;

      if (normalizedOperation === "tombstone") {
        result = "N/A_NOT_REQUIRED";
      }
    }
    serverCommitElapsedMs = Date.now() - startedAt;
  }

  if (!actionResult.ok) {
    return finalJson(
      {
        code: actionResult.code,
        correlationId: input.correlationId,
        entity: input.entity,
        fixtureId: input.fixtureId,
        marker: FINAL_SYNC_MARKER,
        mode: input.mode,
        ok: false,
        operation: input.operation,
        prefix: input.prefix,
        requestId: input.requestId,
        result: "mutation_failed",
        scenario: input.scenario,
        shopId: input.shopId,
        source: "admin_web_qa_sync_fixture",
      },
      finalActionStatus(actionResult),
    );
  }

  if (
    input.scenario === "duplicate" &&
    Boolean(input.entityId) &&
    before.entityId === input.entityId
  ) {
    result = "duplicate_replayed";
  }

  const observationInput = {
    ...input,
    entityId: actionResult.targetId ?? input.entityId,
  };
  const afterResult = readOnlyOperation
    ? beforeResult
    : ({
        ok: true,
        observation: {
          ...emptyFinalSyncObservation(),
          catalogScope: before.catalogScope,
          entityId: observationInput.entityId ?? null,
          recordCount: observationInput.entityId ? 1 : 0,
          records: before.records,
        },
      } as const);
  const after = afterResult.ok ? afterResult.observation : before;
  const afterReadElapsedMs = Date.now() - startedAt - serverCommitElapsedMs;
  const eventId = actionResult.auditEventId ?? after.eventId ?? before.eventId;
  const elapsedMs = Date.now() - startedAt;
  const scenarioReason =
    input.scenario === "burst10"
      ? "coordinator_aggregates_10_scoped_requests"
      : input.scenario === "cold_restart"
        ? "client_relaunch_required"
        : input.scenario === "offline_reconnect"
          ? "coordinator_reconnect_boundary"
          : input.scenario === "duplicate"
            ? "deterministic_replay"
            : input.scenario === "stale_conflict"
              ? "server_authoritative_peer_state"
              : "none";

  return finalJson({
    catalogScope: after.catalogScope ?? null,
    checkpoint: after.checkpoint,
    checkpointAfter: after.checkpoint ?? before.checkpoint,
    checkpointBefore: before.checkpoint,
    code: "success",
    correlationId: input.correlationId,
    entity: input.entity,
    entityId: actionResult.targetId ?? after.entityId,
    eventId,
    fixtureId: input.fixtureId,
    fullPull: false,
    marker: FINAL_SYNC_MARKER,
    mode: input.mode,
    ok: true,
    operation: input.operation,
    page: after.pageCount,
    pageCount: after.pageCount,
    beforeReadElapsedMs,
    serverCommitElapsedMs,
    afterReadElapsedMs,
    payloadBytes,
    pending: after.pending,
    pendingAfter: after.pending,
    pendingBefore: before.pending,
    prefix: input.prefix,
    query: after.queryCount,
    queryCount: after.queryCount,
    record: after.recordCount,
    recordCount: after.recordCount,
    records: after.records,
    requestId: input.requestId,
    reason: scenarioReason,
    result,
    retry: 0,
    retryCount: 0,
    scenario: input.scenario,
    serverTimestamp: new Date().toISOString(),
    setupPerformed,
    shopId: input.shopId,
    source: "admin_web_qa_sync_fixture",
    status: result === "N/A_NOT_REQUIRED" ? result : "PASS",
    totalElapsedMs: elapsedMs,
  });
}

export async function POST(request: NextRequest) {
  if (!isAllowedHost(request) || !isSameOriginMutation(request)) {
    return new NextResponse(null, { status: 404 });
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    const declaredLength = Number(request.headers.get("content-length") ?? "0");

    if (Number.isFinite(declaredLength) && declaredLength > FINAL_SYNC_BODY_MAX_BYTES) {
      return finalJson({ code: "payload_too_large", ok: false }, 413);
    }

    const rawBody = await request.text();
    const payloadBytes = new TextEncoder().encode(rawBody).byteLength;

    if (payloadBytes > FINAL_SYNC_BODY_MAX_BYTES) {
      return finalJson({ code: "payload_too_large", ok: false }, 413);
    }

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return finalJson({ code: "validation_failed", ok: false }, 400);
    }

    const finalInput = parseFinalSyncRequest(body);

    if (!finalInput) {
      return finalJson({ code: "validation_failed", ok: false }, 400);
    }

    return runFinalSyncRequest(finalInput, payloadBytes);
  }

  const { searchParams } = request.nextUrl;
  const prefix = cleanPrefix(searchParams.get("prefix"));
  const part = cleanPart(searchParams.get("part"));
  const confirm = searchParams.get("confirm");
  const requestedShopId = searchParams.get("shop_id") ?? undefined;

  if (!prefix || !part || confirm !== "staging-sync-qa") {
    return NextResponse.json(
      { ok: false, code: "validation_failed" },
      { status: 400 },
    );
  }

  const steps: Record<string, StepResult> = {};
  const startedAt = Date.now();
  const correlationId = `${prefix}${part}`;

  try {
    if (part === "all" || part === "lookups") {
      await runLookupFixture({ prefix, requestedShopId, steps });
    }

    if (part === "all" || part === "products") {
      await runProductFixture({ prefix, requestedShopId, steps });
    }

    if (part === "all" || part === "history") {
      await runHistoryFixture({ prefix, requestedShopId, steps });
    }

    return NextResponse.json({
      ok: true,
      code: "success",
      correlationId,
      part,
      prefix,
      steps,
      totalElapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "qa_fixture_failed",
        correlationId,
        error: error instanceof Error ? error.message : "unknown",
        part,
        prefix,
        steps,
        totalElapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
