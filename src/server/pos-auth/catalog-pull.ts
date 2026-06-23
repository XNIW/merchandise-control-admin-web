import "server-only";

import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import {
  buildNextCatalogSyncCursor,
  catalogPriceTimestampFor,
  catalogRangeFor,
  computeCatalogVersion,
  hasMoreCatalogRows,
  pageCatalogRows,
  parseCatalogSyncOptions,
  splitCatalogTombstones,
  type CatalogPageState,
  type CatalogSyncEntity,
  type CatalogSyncOptions,
} from "./catalog-sync-contract";
import { verifyPosSecret } from "./tokens";

type ShopRow = Pick<
  Tables<"shops">,
  "shop_code" | "shop_id" | "shop_name" | "shop_status"
>;
type StaffAccountRow = Pick<
  Tables<"staff_accounts">,
  | "credential_status"
  | "credential_version"
  | "locked_until"
  | "must_change_credential"
  | "session_invalidated_at"
  | "shop_id"
  | "staff_id"
  | "status"
>;
type ShopDeviceRow = Pick<
  Tables<"shop_devices">,
  "shop_device_id" | "shop_id" | "status"
>;
type PosDeviceCredentialRow = Pick<
  Tables<"pos_device_credentials">,
  | "expires_at"
  | "pos_device_credential_id"
  | "shop_device_id"
  | "shop_id"
  | "staff_credential_version"
  | "staff_id"
  | "status"
  | "token_hash"
>;
type PosSessionRow = Pick<
  Tables<"pos_sessions">,
  | "expires_at"
  | "issued_at"
  | "pos_device_credential_id"
  | "pos_session_id"
  | "session_token_hash"
  | "shop_device_id"
  | "shop_id"
  | "staff_credential_version"
  | "staff_id"
  | "status"
>;
type InventorySourceRow = Pick<
  Tables<"shop_inventory_sources">,
  "mapping_state" | "owner_user_id" | "shop_id"
>;
type ProductRow = Pick<
  Tables<"inventory_products">,
  | "barcode"
  | "category_id"
  | "deleted_at"
  | "id"
  | "item_number"
  | "product_name"
  | "purchase_price"
  | "retail_price"
  | "second_product_name"
  | "shop_id"
  | "stock_quantity"
  | "supplier_id"
  | "updated_at"
>;
type CategoryRow = Pick<
  Tables<"inventory_categories">,
  "deleted_at" | "id" | "name" | "shop_id" | "updated_at"
>;
type SupplierRow = Pick<
  Tables<"inventory_suppliers">,
  "deleted_at" | "id" | "name" | "shop_id" | "updated_at"
>;
type PriceRow = Pick<
  Tables<"inventory_product_prices">,
  | "created_at"
  | "effective_at"
  | "id"
  | "price"
  | "product_id"
  | "shop_id"
  | "source"
  | "type"
>;
type ProductScopeRow = Pick<
  Tables<"inventory_products">,
  "id" | "owner_user_id" | "shop_id"
>;

type JsonRecord = { [key: string]: Json | undefined };

type PosCatalogFailureCode =
  | "db_failure"
  | "denied"
  | "not_configured"
  | "unmapped"
  | "validation_failed";

type PosCatalogEndpointResult =
  | {
      body: {
        code: PosCatalogFailureCode;
        message: string;
        ok: false;
      };
      status: 400 | 401 | 409 | 500 | 503;
    }
  | {
      body: {
        catalog: {
          categories: Array<{
            categoryId: string;
            name: string;
            updatedAt: string;
          }>;
          prices: Array<{
            effectiveAt: string;
            price: number;
            priceId: string;
            productId: string;
            source: string | null;
            type: string;
          }>;
          products: Array<{
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
            updatedAt: string;
          }>;
          suppliers: Array<{
            name: string;
            supplierId: string;
            updatedAt: string;
          }>;
          tombstones: {
            categories: Array<{
              categoryId: string;
              deletedAt: string;
              updatedAt: string;
            }>;
            products: Array<{
              deletedAt: string;
              productId: string;
              updatedAt: string;
            }>;
            suppliers: Array<{
              deletedAt: string;
              supplierId: string;
              updatedAt: string;
            }>;
          };
        };
        catalogVersion: string;
        code: "success";
        generatedAt: string;
        hasMore: boolean;
        ok: true;
        schemaVersion: 2;
        serverTime: string;
        shop: {
          shopCode: string;
          shopId: string;
          shopName: string;
        };
        syncCursor: string;
        syncMode: "delta" | "full_refresh";
        updatedSince: string | null;
      };
      status: 200;
    };

export type PosCatalogPullRequestMeta = {
  userAgent?: string;
};

type ParsedCatalogPullInput = {
  appVersion?: string;
  deviceToken: string;
  posSessionId: string;
  sessionToken: string;
  shopDeviceId: string;
  syncOptions: CatalogSyncOptions;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_POS_SECRET_LENGTH = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringField(record: Record<string, unknown>, ...keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string") {
      return value;
    }
  }

  return "";
}

function normalizeLabel(value: string, maxLength: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function nowIso() {
  return new Date().toISOString();
}

function isFutureTimestamp(value: string | null) {
  return Boolean(value && Date.parse(value) > Date.now());
}

function isAfterTimestamp(left: string | null, right: string) {
  return Boolean(left && Date.parse(left) > Date.parse(right));
}

function failure(
  code: PosCatalogFailureCode,
  status: 400 | 401 | 409 | 500 | 503,
): PosCatalogEndpointResult {
  const message =
    code === "not_configured"
      ? "POS catalog backend is not configured."
      : code === "validation_failed"
        ? "Request payload is invalid."
        : code === "unmapped"
          ? "This shop has a legacy catalog bridge that is not mapped."
          : "POS catalog pull was denied.";

  return {
    body: {
      code,
      message,
      ok: false,
    },
    status,
  };
}

function parseCatalogPullInput(
  input: unknown,
  serverTime: string,
): ParsedCatalogPullInput | null {
  if (!isRecord(input)) {
    return null;
  }

  const appVersion =
    normalizeLabel(stringField(input, "appVersion", "app_version"), 80) ||
    undefined;
  const deviceToken = stringField(input, "deviceToken", "device_token");
  const posSessionId = stringField(input, "posSessionId", "pos_session_id");
  const sessionToken = stringField(input, "sessionToken", "session_token");
  const shopDeviceId = stringField(input, "shopDeviceId", "shop_device_id");

  if (
    !UUID_PATTERN.test(posSessionId) ||
    !UUID_PATTERN.test(shopDeviceId) ||
    deviceToken.length === 0 ||
    deviceToken.length > MAX_POS_SECRET_LENGTH ||
    sessionToken.length === 0 ||
    sessionToken.length > MAX_POS_SECRET_LENGTH
  ) {
    return null;
  }

  const syncOptions = parseCatalogSyncOptions(input, serverTime);

  if (!syncOptions.ok) {
    return null;
  }

  return {
    appVersion,
    deviceToken,
    posSessionId,
    sessionToken,
    shopDeviceId,
    syncOptions: syncOptions.options,
  };
}

function requestMetadata(meta: PosCatalogPullRequestMeta): JsonRecord {
  return {
    source: "TASK-027",
    user_agent_length: meta.userAgent?.length ?? 0,
    user_agent_present: Boolean(meta.userAgent),
  };
}

function previewSyncCursor(syncCursor: string) {
  return syncCursor.startsWith("catalog-v1:")
    ? `${syncCursor.slice(0, 24)}...`
    : syncCursor;
}

function mergeCatalogRowsById<Row extends { id: string }>(
  shopRows: readonly Row[],
  legacyRows: readonly Row[],
) {
  const rows = [...shopRows];
  const seen = new Set(shopRows.map((row) => row.id));

  for (const row of legacyRows) {
    if (!seen.has(row.id)) {
      rows.push(row);
    }
  }

  return rows;
}

function compareUpdatedCatalogRows<
  Row extends { id: string; updated_at: string },
>(left: Row, right: Row) {
  const byUpdatedAt = Date.parse(left.updated_at) - Date.parse(right.updated_at);

  return byUpdatedAt === 0 ? left.id.localeCompare(right.id) : byUpdatedAt;
}

function compareCreatedCatalogRows<
  Row extends { created_at: string; id: string },
>(left: Row, right: Row) {
  const byCreatedAt = Date.parse(left.created_at) - Date.parse(right.created_at);

  return byCreatedAt === 0 ? left.id.localeCompare(right.id) : byCreatedAt;
}

function chunkValues<T>(values: readonly T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

async function filterCatalogPricesByProductScope(
  supabase: SupabaseAdminClient,
  input: {
    ownerUserId: string | null;
    prices: readonly PriceRow[];
    shopId: string;
  },
) {
  const productIds = Array.from(
    new Set(
      input.prices
        .map((price) => price.product_id)
        .filter(
          (productId): productId is string =>
            typeof productId === "string" && productId.length > 0,
        ),
    ),
  );

  if (productIds.length === 0) {
    return { error: null, prices: [...input.prices] };
  }

  const authorizedProductIds = new Set<string>();

  for (const productChunk of chunkValues(productIds, 500)) {
    const { data, error } = await supabase
      .from("inventory_products")
      .select("id,shop_id,owner_user_id")
      .in("id", productChunk);

    if (error) {
      return { error, prices: [] };
    }

    for (const row of (data ?? []) as ProductScopeRow[]) {
      if (
        row.shop_id === input.shopId ||
        (row.shop_id === null &&
          Boolean(input.ownerUserId) &&
          row.owner_user_id === input.ownerUserId)
      ) {
        authorizedProductIds.add(row.id);
      }
    }
  }

  return {
    error: null,
    prices: input.prices.filter((price) =>
      typeof price.product_id === "string" &&
      authorizedProductIds.has(price.product_id),
    ),
  };
}

function pageCatalogScopeRows<Row extends { id: string }>(
  rows: readonly Row[],
  range: { from: number; to: number },
  limit: number,
) {
  return pageCatalogRows(rows.slice(range.from, range.to + 1), limit);
}

async function getSupabaseForPosCatalog() {
  const config = resolveSupabaseAdminConfig();

  if (config.status !== "configured") {
    return null;
  }

  return createSupabaseAdminClient(config);
}

async function writePosCatalogAudit(
  supabase: SupabaseAdminClient,
  input: {
    code: string;
    metadata?: JsonRecord;
    result: "blocked" | "failure" | "success";
    severity: "critical" | "info" | "warning";
    shopId?: string;
    targetId?: string;
    targetType?: string;
  },
) {
  const { error } = await supabase.from("audit_logs").insert({
    actor_profile_id: null,
    event_key:
      input.result === "success"
        ? "pos.catalog.pull.success"
        : "pos.catalog.pull.failure",
    metadata_redacted: {
      code: input.code,
      ...(input.metadata ?? {}),
    },
    result: input.result,
    scope: input.shopId ? "shop" : "global",
    severity: input.severity,
    shop_id: input.shopId ?? null,
    target_id: input.targetId,
    target_type: input.targetType,
  });

  return !error;
}

async function auditedFailure(
  supabase: SupabaseAdminClient,
  input: {
    code: PosCatalogFailureCode;
    metadata?: JsonRecord;
    shopId?: string;
    status: 400 | 401 | 409 | 500;
    targetId?: string;
    targetType?: string;
  },
): Promise<PosCatalogEndpointResult> {
  const auditOk = await writePosCatalogAudit(supabase, {
    code: input.code,
    metadata: input.metadata,
    result: input.status === 500 ? "failure" : "blocked",
    severity: input.status === 500 ? "critical" : "warning",
    shopId: input.shopId,
    targetId: input.targetId,
    targetType: input.targetType,
  });

  if (!auditOk) {
    return failure("db_failure", 500);
  }

  return failure(input.code, input.status);
}

function isStaffUsable(staff: StaffAccountRow | null) {
  return Boolean(
    staff &&
      staff.status === "active" &&
      staff.credential_status === "active" &&
      !staff.must_change_credential &&
      !isFutureTimestamp(staff.locked_until),
  );
}

export async function handlePosCatalogPull(
  input: unknown,
  meta: PosCatalogPullRequestMeta = {},
): Promise<PosCatalogEndpointResult> {
  const serverTime = nowIso();
  const supabase = await getSupabaseForPosCatalog();

  if (!supabase) {
    return failure("not_configured", 503);
  }

  const parsed = parseCatalogPullInput(input, serverTime);

  if (!parsed) {
    return auditedFailure(supabase, {
      code: "validation_failed",
      metadata: requestMetadata(meta),
      status: 400,
    });
  }

  const sessionResult = await supabase
    .from("pos_sessions")
    .select(
      "pos_session_id,shop_id,shop_device_id,staff_id,pos_device_credential_id,session_token_hash,staff_credential_version,status,issued_at,expires_at",
    )
    .eq("pos_session_id", parsed.posSessionId)
    .eq("shop_device_id", parsed.shopDeviceId)
    .maybeSingle<PosSessionRow>();

  if (sessionResult.error) {
    return auditedFailure(supabase, {
      code: "db_failure",
      metadata: requestMetadata(meta),
      status: 500,
    });
  }

  const session = sessionResult.data;
  const sessionValid = Boolean(
    session &&
      session.status === "active" &&
      isFutureTimestamp(session.expires_at) &&
      verifyPosSecret(parsed.sessionToken, session.session_token_hash),
  );

  if (!session || !sessionValid) {
    return auditedFailure(supabase, {
      code: "denied",
      metadata: requestMetadata(meta),
      shopId: session?.shop_id,
      status: 401,
      targetId: session?.pos_session_id,
      targetType: session ? "pos_session" : undefined,
    });
  }

  const [credentialResult, shopResult, staffResult, deviceResult] =
    await Promise.all([
      supabase
        .from("pos_device_credentials")
        .select(
          "pos_device_credential_id,shop_id,shop_device_id,staff_id,token_hash,staff_credential_version,status,expires_at",
        )
        .eq("pos_device_credential_id", session.pos_device_credential_id)
        .maybeSingle<PosDeviceCredentialRow>(),
      supabase
        .from("shops")
        .select("shop_id,shop_code,shop_name,shop_status")
        .eq("shop_id", session.shop_id)
        .maybeSingle<ShopRow>(),
      supabase
        .from("staff_accounts")
        .select(
          "staff_id,shop_id,status,credential_version,credential_status,locked_until,must_change_credential,session_invalidated_at",
        )
        .eq("staff_id", session.staff_id)
        .eq("shop_id", session.shop_id)
        .maybeSingle<StaffAccountRow>(),
      supabase
        .from("shop_devices")
        .select("shop_device_id,shop_id,status")
        .eq("shop_device_id", session.shop_device_id)
        .eq("shop_id", session.shop_id)
        .maybeSingle<ShopDeviceRow>(),
    ]);

  if (
    credentialResult.error ||
    shopResult.error ||
    staffResult.error ||
    deviceResult.error
  ) {
    return auditedFailure(supabase, {
      code: "db_failure",
      metadata: requestMetadata(meta),
      shopId: session.shop_id,
      status: 500,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }

  const credential = credentialResult.data;
  const shop = shopResult.data;
  const staff = staffResult.data;
  const device = deviceResult.data;
  const credentialMatchesSession = Boolean(
    credential &&
      credential.pos_device_credential_id === session.pos_device_credential_id &&
      credential.shop_id === session.shop_id &&
      credential.shop_device_id === session.shop_device_id &&
      credential.staff_id === session.staff_id,
  );
  const credentialValid = Boolean(
    credential &&
      credential.status === "active" &&
      isFutureTimestamp(credential.expires_at) &&
      verifyPosSecret(parsed.deviceToken, credential.token_hash),
  );
  const runtimeValid = Boolean(
    credentialMatchesSession &&
      credentialValid &&
      shop?.shop_status === "active" &&
      isStaffUsable(staff) &&
      device?.status === "active" &&
      staff &&
      staff.credential_version === credential?.staff_credential_version &&
      session.staff_credential_version === staff.credential_version &&
      !isAfterTimestamp(staff.session_invalidated_at, session.issued_at),
  );

  if (!runtimeValid || !shop) {
    return auditedFailure(supabase, {
      code: "denied",
      metadata: {
        ...requestMetadata(meta),
        app_version_present: Boolean(parsed.appVersion),
        device_resolved: Boolean(device),
        shop_resolved: Boolean(shop),
        staff_resolved: Boolean(staff),
      },
      shopId: session.shop_id,
      status: 401,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }

  const mappingResult = await supabase
    .from("shop_inventory_sources")
    .select("shop_id,owner_user_id,mapping_state")
    .eq("shop_id", session.shop_id)
    .is("disabled_at", null)
    .limit(10);

  if (mappingResult.error) {
    return auditedFailure(supabase, {
      code: "db_failure",
      metadata: requestMetadata(meta),
      shopId: session.shop_id,
      status: 500,
      targetId: session.shop_device_id,
      targetType: "device",
    });
  }

  const mappingRows = (mappingResult.data ?? []) as InventorySourceRow[];
  const mappedSource = mappingRows.find(
    (row) => row.mapping_state === "mapped" && row.owner_user_id,
  );
  const blockingSource = mappingRows.find(
    (row) => row.mapping_state !== "mapped",
  );
  const ownerUserId = mappedSource?.owner_user_id ?? null;

  const syncOptions = parsed.syncOptions;
  const productRange = catalogRangeFor(syncOptions, "products");
  const categoryRange = catalogRangeFor(syncOptions, "categories");
  const supplierRange = catalogRangeFor(syncOptions, "suppliers");
  const priceRange = catalogRangeFor(syncOptions, "prices");
  const priceUpperBound = catalogPriceTimestampFor(syncOptions.upperBound);
  const priceLowerBound = catalogPriceTimestampFor(syncOptions.lowerBound);

  let productsQuery = supabase
    .from("inventory_products")
    .select(
      "id,shop_id,barcode,item_number,product_name,second_product_name,purchase_price,retail_price,stock_quantity,supplier_id,category_id,updated_at,deleted_at",
    )
    .eq("shop_id", session.shop_id)
    .lte("updated_at", syncOptions.upperBound)
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true });

  let categoriesQuery = supabase
    .from("inventory_categories")
    .select("id,shop_id,name,updated_at,deleted_at")
    .eq("shop_id", session.shop_id)
    .lte("updated_at", syncOptions.upperBound)
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true });

  let suppliersQuery = supabase
    .from("inventory_suppliers")
    .select("id,shop_id,name,updated_at,deleted_at")
    .eq("shop_id", session.shop_id)
    .lte("updated_at", syncOptions.upperBound)
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true });

  let pricesQuery = supabase
    .from("inventory_product_prices")
    .select("id,shop_id,product_id,type,price,effective_at,source,created_at")
    .eq("shop_id", session.shop_id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (syncOptions.lowerBound) {
    productsQuery = productsQuery.gte("updated_at", syncOptions.lowerBound);
    categoriesQuery = categoriesQuery.gte("updated_at", syncOptions.lowerBound);
    suppliersQuery = suppliersQuery.gte("updated_at", syncOptions.lowerBound);

    if (priceLowerBound) {
      pricesQuery = pricesQuery.gte("created_at", priceLowerBound);
    }
  } else {
    productsQuery = productsQuery.is("deleted_at", null);
    categoriesQuery = categoriesQuery.is("deleted_at", null);
    suppliersQuery = suppliersQuery.is("deleted_at", null);
  }

  if (priceUpperBound) {
    pricesQuery = pricesQuery.lte("created_at", priceUpperBound);
  }

  const [productsResult, categoriesResult, suppliersResult, pricesResult] =
    await Promise.all([
      productsQuery.range(0, productRange.to),
      categoriesQuery.range(0, categoryRange.to),
      suppliersQuery.range(0, supplierRange.to),
      pricesQuery.range(0, priceRange.to),
    ]);

  if (
    productsResult.error ||
    categoriesResult.error ||
    suppliersResult.error ||
    pricesResult.error
  ) {
    return auditedFailure(supabase, {
      code: "db_failure",
      metadata: requestMetadata(meta),
      shopId: session.shop_id,
      status: 500,
      targetId: session.shop_device_id,
      targetType: "device",
    });
  }

  const shopProducts = (productsResult.data ?? []) as ProductRow[];
  const shopCategories = (categoriesResult.data ?? []) as CategoryRow[];
  const shopSuppliers = (suppliersResult.data ?? []) as SupplierRow[];
  const shopPrices = (pricesResult.data ?? []) as PriceRow[];
  const shopScopedRowsPresent =
    shopProducts.length > 0 ||
    shopCategories.length > 0 ||
    shopSuppliers.length > 0 ||
    shopPrices.length > 0;
  let legacyProducts: ProductRow[] = [];
  let legacyCategories: CategoryRow[] = [];
  let legacySuppliers: SupplierRow[] = [];
  let legacyPrices: PriceRow[] = [];

  if (ownerUserId) {
    let legacyProductsQuery = supabase
      .from("inventory_products")
      .select(
        "id,shop_id,barcode,item_number,product_name,second_product_name,purchase_price,retail_price,stock_quantity,supplier_id,category_id,updated_at,deleted_at",
      )
      .is("shop_id", null)
      .eq("owner_user_id", ownerUserId)
      .lte("updated_at", syncOptions.upperBound)
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true });

    let legacyCategoriesQuery = supabase
      .from("inventory_categories")
      .select("id,shop_id,name,updated_at,deleted_at")
      .is("shop_id", null)
      .eq("owner_user_id", ownerUserId)
      .lte("updated_at", syncOptions.upperBound)
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true });

    let legacySuppliersQuery = supabase
      .from("inventory_suppliers")
      .select("id,shop_id,name,updated_at,deleted_at")
      .is("shop_id", null)
      .eq("owner_user_id", ownerUserId)
      .lte("updated_at", syncOptions.upperBound)
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true });

    let legacyPricesQuery = supabase
      .from("inventory_product_prices")
      .select("id,shop_id,product_id,type,price,effective_at,source,created_at")
      .is("shop_id", null)
      .eq("owner_user_id", ownerUserId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (syncOptions.lowerBound) {
      legacyProductsQuery = legacyProductsQuery.gte(
        "updated_at",
        syncOptions.lowerBound,
      );
      legacyCategoriesQuery = legacyCategoriesQuery.gte(
        "updated_at",
        syncOptions.lowerBound,
      );
      legacySuppliersQuery = legacySuppliersQuery.gte(
        "updated_at",
        syncOptions.lowerBound,
      );

      if (priceLowerBound) {
        legacyPricesQuery = legacyPricesQuery.gte(
          "created_at",
          priceLowerBound,
        );
      }
    } else {
      legacyProductsQuery = legacyProductsQuery.is("deleted_at", null);
      legacyCategoriesQuery = legacyCategoriesQuery.is("deleted_at", null);
      legacySuppliersQuery = legacySuppliersQuery.is("deleted_at", null);
    }

    if (priceUpperBound) {
      legacyPricesQuery = legacyPricesQuery.lte("created_at", priceUpperBound);
    }

    const [
      legacyProductsResult,
      legacyCategoriesResult,
      legacySuppliersResult,
      legacyPricesResult,
    ] = await Promise.all([
      legacyProductsQuery.range(0, productRange.to),
      legacyCategoriesQuery.range(0, categoryRange.to),
      legacySuppliersQuery.range(0, supplierRange.to),
      legacyPricesQuery.range(0, priceRange.to),
    ]);

    if (
      legacyProductsResult.error ||
      legacyCategoriesResult.error ||
      legacySuppliersResult.error ||
      legacyPricesResult.error
    ) {
      return auditedFailure(supabase, {
        code: "db_failure",
        metadata: requestMetadata(meta),
        shopId: session.shop_id,
        status: 500,
        targetId: session.shop_device_id,
        targetType: "device",
      });
    }

    legacyProducts = (legacyProductsResult.data ?? []) as ProductRow[];
    legacyCategories = (legacyCategoriesResult.data ?? []) as CategoryRow[];
    legacySuppliers = (legacySuppliersResult.data ?? []) as SupplierRow[];
    legacyPrices = (legacyPricesResult.data ?? []) as PriceRow[];
  }

  if (!ownerUserId && blockingSource && !shopScopedRowsPresent) {
    return auditedFailure(supabase, {
      code: "unmapped",
      metadata: requestMetadata(meta),
      shopId: session.shop_id,
      status: 409,
      targetId: session.shop_device_id,
      targetType: "device",
    });
  }

  const catalogScope =
    shopScopedRowsPresent || !ownerUserId
      ? "shop_scoped"
      : "legacy_owner_bridge";
  const productRows = mergeCatalogRowsById(shopProducts, legacyProducts).sort(
    compareUpdatedCatalogRows,
  );
  const categoryRows = mergeCatalogRowsById(
    shopCategories,
    legacyCategories,
  ).sort(compareUpdatedCatalogRows);
  const supplierRows = mergeCatalogRowsById(
    shopSuppliers,
    legacySuppliers,
  ).sort(compareUpdatedCatalogRows);
  const scopedPriceRows = await filterCatalogPricesByProductScope(supabase, {
    ownerUserId,
    prices: mergeCatalogRowsById(shopPrices, legacyPrices),
    shopId: session.shop_id,
  });

  if (scopedPriceRows.error) {
    return auditedFailure(supabase, {
      code: "db_failure",
      metadata: {
        ...requestMetadata(meta),
        reason: "price_product_scope_validation",
      },
      shopId: session.shop_id,
      status: 500,
      targetId: session.shop_device_id,
      targetType: "device",
    });
  }

  const priceRows = scopedPriceRows.prices.sort(
    compareCreatedCatalogRows,
  );
  const productPage = pageCatalogScopeRows(
    productRows,
    productRange,
    syncOptions.limit,
  );
  const categoryPage = pageCatalogScopeRows(
    categoryRows,
    categoryRange,
    syncOptions.limit,
  );
  const supplierPage = pageCatalogScopeRows(
    supplierRows,
    supplierRange,
    syncOptions.limit,
  );
  const pricePage = pageCatalogScopeRows(
    priceRows,
    priceRange,
    syncOptions.limit,
  );
  const { active: products, tombstones: productTombstones } =
    splitCatalogTombstones(productPage.rows);
  const { active: categories, tombstones: categoryTombstones } =
    splitCatalogTombstones(categoryPage.rows);
  const { active: suppliers, tombstones: supplierTombstones } =
    splitCatalogTombstones(supplierPage.rows);
  const prices = pricePage.rows;
  const pageState: Record<CatalogSyncEntity, CatalogPageState> = {
    categories: {
      hasMore: categoryPage.hasMore,
      returned: categoryPage.returned,
    },
    prices: {
      hasMore: pricePage.hasMore,
      returned: pricePage.returned,
    },
    products: {
      hasMore: productPage.hasMore,
      returned: productPage.returned,
    },
    suppliers: {
      hasMore: supplierPage.hasMore,
      returned: supplierPage.returned,
    },
  };
  const hasMore = hasMoreCatalogRows(pageState);
  const syncCursor = buildNextCatalogSyncCursor(syncOptions, pageState);
  const catalogVersion = computeCatalogVersion({
    categories: categoryPage.rows,
    prices,
    products: productPage.rows,
    suppliers: supplierPage.rows,
  });
  const auditOk = await writePosCatalogAudit(supabase, {
    code: "success",
    metadata: {
      ...requestMetadata(meta),
      app_version_present: Boolean(parsed.appVersion),
      catalog_scope: catalogScope,
      catalog_version: catalogVersion,
      categories: categories.length,
      category_tombstones: categoryTombstones.length,
      cursor_source: syncOptions.cursorSource,
      has_more: hasMore,
      prices: prices.length,
      products: products.length,
      product_tombstones: productTombstones.length,
      server_time: syncOptions.upperBound,
      supplier_tombstones: supplierTombstones.length,
      suppliers: suppliers.length,
      sync_cursor_present: Boolean(syncCursor),
      sync_cursor_preview: previewSyncCursor(syncCursor),
      sync_mode: syncOptions.mode,
      updated_since: syncOptions.lowerBound,
    },
    result: "success",
    severity: "info",
    shopId: session.shop_id,
    targetId: session.shop_device_id,
    targetType: "device",
  });

  if (!auditOk) {
    return failure("db_failure", 500);
  }

  return {
    body: {
      catalog: {
        categories: categories.map((category) => ({
          categoryId: category.id,
          name: category.name,
          updatedAt: category.updated_at,
        })),
        prices: prices.map((price) => ({
          effectiveAt: price.effective_at,
          price: price.price,
          priceId: price.id,
          productId: price.product_id,
          source: price.source,
          type: price.type,
        })),
        products: products.map((product) => ({
          barcode: product.barcode,
          categoryId: product.category_id,
          itemNumber: product.item_number,
          productId: product.id,
          productName: product.product_name,
          purchasePrice: product.purchase_price,
          retailPrice: product.retail_price,
          secondProductName: product.second_product_name,
          stockQuantity: product.stock_quantity,
          supplierId: product.supplier_id,
          updatedAt: product.updated_at,
        })),
        suppliers: suppliers.map((supplier) => ({
          name: supplier.name,
          supplierId: supplier.id,
          updatedAt: supplier.updated_at,
        })),
        tombstones: {
          categories: categoryTombstones.map((category) => ({
            categoryId: category.id,
            deletedAt: category.deleted_at ?? category.updated_at,
            updatedAt: category.updated_at,
          })),
          products: productTombstones.map((product) => ({
            deletedAt: product.deleted_at ?? product.updated_at,
            productId: product.id,
            updatedAt: product.updated_at,
          })),
          suppliers: supplierTombstones.map((supplier) => ({
            deletedAt: supplier.deleted_at ?? supplier.updated_at,
            supplierId: supplier.id,
            updatedAt: supplier.updated_at,
          })),
        },
      },
      catalogVersion,
      code: "success",
      generatedAt: serverTime,
      hasMore,
      ok: true,
      schemaVersion: 2,
      serverTime: syncOptions.upperBound,
      shop: {
        shopCode: shop.shop_code,
        shopId: shop.shop_id,
        shopName: shop.shop_name,
      },
      syncCursor,
      syncMode: syncOptions.mode,
      updatedSince: syncOptions.lowerBound,
    },
    status: 200,
  };
}
