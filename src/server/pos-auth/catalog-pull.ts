import "server-only";

import { createHash } from "node:crypto";
import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import {
  buildPosPolicyPayload,
  buildPosShopPayload,
  POS_SHOP_SELECT,
  type PosPolicyPayload,
  type PosShopPayload,
  type PosShopPayloadRow,
} from "./shop-payload";
import { POS_CATALOG_SCHEMA_VERSION } from "./pos-contract";
import {
  buildCatalogV2Cursor,
  catalogV2TimestampsEqual,
  nextCatalogV2Lane,
  parseCatalogSyncRequest,
  resolveCatalogSyncRequest,
  splitCatalogTombstones,
  type CatalogSyncRequest,
  type CatalogV2CursorContext,
  type CatalogV2Lane,
  type CatalogV2Manifest,
} from "./catalog-sync-contract";
import {
  buildCatalogRevision,
  loadCatalogPageV2,
  type CatalogPageV2,
} from "./catalog-revision";
import { verifyPosSecret } from "./tokens";

type ShopRow = PosShopPayloadRow;
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
  | "stock_quantity"
  | "supplier_id"
  | "updated_at"
>;
type CategoryRow = Pick<
  Tables<"inventory_categories">,
  "deleted_at" | "id" | "name" | "updated_at"
>;
type SupplierRow = Pick<
  Tables<"inventory_suppliers">,
  "deleted_at" | "id" | "name" | "updated_at"
>;
type PriceRow = Pick<
  Tables<"inventory_product_prices">,
  | "created_at"
  | "effective_at"
  | "id"
  | "price"
  | "product_id"
  | "source"
  | "type"
  | "updated_at"
>;

type JsonRecord = { [key: string]: Json | undefined };

type PosCatalogFailureCode =
  | "catalog_cursor_expired"
  | "catalog_cursor_rejected"
  | "db_failure"
  | "denied"
  | "not_configured"
  | "unmapped"
  | "validation_failed";

type CatalogPayload = {
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
        catalog: CatalogPayload;
        catalogRevision: string;
        catalogSummary: CatalogV2Manifest["catalogSummary"];
        catalogVersion: string;
        code: "success";
        generatedAt: string;
        hasMore: boolean;
        ok: true;
        policy: PosPolicyPayload;
        schemaVersion: typeof POS_CATALOG_SCHEMA_VERSION;
        serverTime: string;
        shop: PosShopPayload;
        snapshotAt: string;
        syncCursor: string;
        syncMode: "delta" | "full_refresh";
        updatedSince: string | null;
      };
      status: 200;
    };

export type PosCatalogPullRequestMeta = {
  clientRequestId?: string;
  requestId?: string;
  route?: string;
  userAgent?: string;
};

type ParsedCatalogPullInput = {
  appVersion?: string;
  deviceToken: string;
  posSessionId: string;
  sessionToken: string;
  shopDeviceId: string;
  syncRequest: CatalogSyncRequest;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_POS_SECRET_LENGTH = 256;
const CATALOG_CURSOR_TTL_SECONDS = 7 * 24 * 60 * 60;

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
        : code === "catalog_cursor_expired" ||
            code === "catalog_cursor_rejected"
          ? "Catalog continuation was rejected."
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

function parseCatalogPullInput(input: unknown): ParsedCatalogPullInput | null {
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
  const syncRequest = parseCatalogSyncRequest(input);

  if (
    !syncRequest ||
    !UUID_PATTERN.test(posSessionId) ||
    !UUID_PATTERN.test(shopDeviceId) ||
    deviceToken.length === 0 ||
    deviceToken.length > MAX_POS_SECRET_LENGTH ||
    sessionToken.length === 0 ||
    sessionToken.length > MAX_POS_SECRET_LENGTH
  ) {
    return null;
  }

  return {
    appVersion,
    deviceToken,
    posSessionId,
    sessionToken,
    shopDeviceId,
    syncRequest,
  };
}

function requestMetadata(meta: PosCatalogPullRequestMeta): JsonRecord {
  return {
    ...(meta.clientRequestId ? { client_request_id: meta.clientRequestId } : {}),
    ...(meta.requestId ? { request_id: meta.requestId } : {}),
    ...(meta.route ? { route: meta.route } : {}),
    source: "TASK-139",
    user_agent_length: meta.userAgent?.length ?? 0,
    user_agent_present: Boolean(meta.userAgent),
  };
}

function cursorFingerprint(syncCursor: string) {
  return syncCursor
    ? `sha256:${createHash("sha256")
        .update(syncCursor, "utf8")
        .digest("hex")
        .slice(0, 16)}`
    : "none";
}

async function getSupabaseForPosCatalog() {
  const config = resolveSupabaseAdminConfig();

  if (config.status !== "configured") {
    return null;
  }

  const supabase = createSupabaseAdminClient(config);
  return supabase
    ? { cursorSigningKey: config.serviceRoleKey, supabase }
    : null;
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

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function parseCategoryRows(page: CatalogPageV2) {
  if (page.entity !== "categories") {
    return [] as CategoryRow[];
  }

  if (
    !page.rows.every(
      (row) =>
        typeof row.id === "string" &&
        typeof row.name === "string" &&
        isTimestamp(row.updated_at) &&
        isStringOrNull(row.deleted_at),
    )
  ) {
    return null;
  }

  return page.rows as unknown as CategoryRow[];
}

function parseSupplierRows(page: CatalogPageV2) {
  if (page.entity !== "suppliers") {
    return [] as SupplierRow[];
  }

  if (
    !page.rows.every(
      (row) =>
        typeof row.id === "string" &&
        typeof row.name === "string" &&
        isTimestamp(row.updated_at) &&
        isStringOrNull(row.deleted_at),
    )
  ) {
    return null;
  }

  return page.rows as unknown as SupplierRow[];
}

function parseProductRows(page: CatalogPageV2) {
  if (page.entity !== "products") {
    return [] as ProductRow[];
  }

  if (
    !page.rows.every(
      (row) =>
        typeof row.id === "string" &&
        typeof row.barcode === "string" &&
        isTimestamp(row.updated_at) &&
        isStringOrNull(row.deleted_at) &&
        isStringOrNull(row.category_id) &&
        isStringOrNull(row.item_number) &&
        isStringOrNull(row.product_name) &&
        isStringOrNull(row.second_product_name) &&
        isStringOrNull(row.supplier_id) &&
        isNumberOrNull(row.purchase_price) &&
        isNumberOrNull(row.retail_price) &&
        isNumberOrNull(row.stock_quantity),
    )
  ) {
    return null;
  }

  return page.rows as unknown as ProductRow[];
}

function parsePriceRows(page: CatalogPageV2) {
  if (page.entity !== "prices") {
    return [] as PriceRow[];
  }

  if (
    !page.rows.every(
      (row) =>
        typeof row.id === "string" &&
        typeof row.product_id === "string" &&
        typeof row.type === "string" &&
        typeof row.price === "number" &&
        typeof row.effective_at === "string" &&
        typeof row.created_at === "string" &&
        isTimestamp(row.updated_at) &&
        isStringOrNull(row.source),
    )
  ) {
    return null;
  }

  return page.rows as unknown as PriceRow[];
}

function emptyCatalog(): CatalogPayload {
  return {
    categories: [],
    prices: [],
    products: [],
    suppliers: [],
    tombstones: {
      categories: [],
      products: [],
      suppliers: [],
    },
  };
}

function mapCatalogPage(page: CatalogPageV2): CatalogPayload | null {
  const categoryRows = parseCategoryRows(page);
  const supplierRows = parseSupplierRows(page);
  const productRows = parseProductRows(page);
  const priceRows = parsePriceRows(page);

  if (!categoryRows || !supplierRows || !productRows || !priceRows) {
    return null;
  }

  const { active: categories, tombstones: categoryTombstones } =
    splitCatalogTombstones(categoryRows);
  const { active: suppliers, tombstones: supplierTombstones } =
    splitCatalogTombstones(supplierRows);
  const { active: products, tombstones: productTombstones } =
    splitCatalogTombstones(productRows);
  const catalog = emptyCatalog();

  catalog.categories = categories.map((category) => ({
    categoryId: category.id,
    name: category.name,
    updatedAt: category.updated_at,
  }));
  catalog.suppliers = suppliers.map((supplier) => ({
    name: supplier.name,
    supplierId: supplier.id,
    updatedAt: supplier.updated_at,
  }));
  catalog.products = products.map((product) => ({
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
  }));
  catalog.prices = priceRows.map((price) => ({
    effectiveAt: price.effective_at,
    price: price.price,
    priceId: price.id,
    productId: price.product_id,
    source: price.source,
    type: price.type,
  }));
  catalog.tombstones.categories = categoryTombstones.map((category) => ({
    categoryId: category.id,
    deletedAt: category.deleted_at ?? category.updated_at,
    updatedAt: category.updated_at,
  }));
  catalog.tombstones.suppliers = supplierTombstones.map((supplier) => ({
    deletedAt: supplier.deleted_at ?? supplier.updated_at,
    supplierId: supplier.id,
    updatedAt: supplier.updated_at,
  }));
  catalog.tombstones.products = productTombstones.map((product) => ({
    deletedAt: product.deleted_at ?? product.updated_at,
    productId: product.id,
    updatedAt: product.updated_at,
  }));

  return catalog;
}

function rowCountFor(catalog: CatalogPayload, lane: CatalogV2Lane | "done") {
  switch (lane) {
    case "categories":
      return catalog.categories.length + catalog.tombstones.categories.length;
    case "suppliers":
      return catalog.suppliers.length + catalog.tombstones.suppliers.length;
    case "products":
      return catalog.products.length + catalog.tombstones.products.length;
    case "prices":
      return catalog.prices.length;
    default:
      return 0;
  }
}

function lastKey(page: CatalogPageV2) {
  const last = page.rows[page.rows.length - 1];

  return last && typeof last.id === "string" && isTimestamp(last.updated_at)
    ? { id: last.id, updatedAt: last.updated_at }
    : null;
}

export async function handlePosCatalogPull(
  input: unknown,
  meta: PosCatalogPullRequestMeta = {},
): Promise<PosCatalogEndpointResult> {
  const requestTime = nowIso();
  const backend = await getSupabaseForPosCatalog();

  if (!backend) {
    return failure("not_configured", 503);
  }

  const { cursorSigningKey, supabase } = backend;
  const parsed = parseCatalogPullInput(input);

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
        .select(POS_SHOP_SELECT)
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

  const cursorContext: CatalogV2CursorContext = {
    posSessionId: session.pos_session_id,
    shopDeviceId: session.shop_device_id,
    shopId: session.shop_id,
    signingKey: cursorSigningKey,
  };
  const syncResolution = resolveCatalogSyncRequest(
    parsed.syncRequest,
    requestTime,
    cursorContext,
  );

  if (!syncResolution.ok) {
    const cursorFailure =
      syncResolution.code === "catalog_cursor_expired" ||
      syncResolution.code === "catalog_cursor_rejected";

    return auditedFailure(supabase, {
      code: syncResolution.code,
      metadata: {
        ...requestMetadata(meta),
        cursor_fingerprint: cursorFingerprint(parsed.syncRequest.syncCursor),
      },
      shopId: session.shop_id,
      status: cursorFailure ? 409 : 400,
      targetId: session.shop_device_id,
      targetType: "device",
    });
  }

  const sync = syncResolution.request;
  const continuation = sync.continuation;
  const page = await loadCatalogPageV2(supabase, {
    afterId: continuation?.afterId ?? null,
    afterUpdatedAt: continuation?.afterUpdatedAt ?? null,
    entity: continuation?.lane ?? null,
    expectedRevision: continuation?.revision ?? null,
    expectedScopeKey: continuation?.scopeKey ?? null,
    expectedScopeKind: continuation?.scopeKind ?? null,
    includeManifest: !continuation,
    limit: sync.limit,
    lowerBound: sync.lowerBound,
    mode: sync.mode,
    shopId: session.shop_id,
    snapshotAt: sync.snapshotAt,
  });

  if (page.status !== "ok") {
    const code: PosCatalogFailureCode =
      page.status === "unmapped"
        ? "unmapped"
        : page.status === "snapshot_changed"
          ? "catalog_cursor_rejected"
          : "db_failure";

    return auditedFailure(supabase, {
      code,
      metadata: {
        ...requestMetadata(meta),
        cursor_fingerprint: cursorFingerprint(parsed.syncRequest.syncCursor),
        reason:
          page.status === "snapshot_changed"
            ? "snapshot_revision_or_scope_changed"
            : page.status,
      },
      shopId: session.shop_id,
      status: code === "unmapped" || code === "catalog_cursor_rejected" ? 409 : 500,
      targetId: session.shop_device_id,
      targetType: "device",
    });
  }

  const manifest = page.manifest ?? continuation?.manifest ?? null;
  const catalog = mapCatalogPage(page);

  if (
    !manifest ||
    !catalog ||
    (page.entityHasMore && page.rows.length !== sync.limit) ||
    (continuation &&
      (!catalogV2TimestampsEqual(page.snapshotAt, continuation.snapshotAt) ||
        page.entity !== continuation.lane ||
        page.revision !== continuation.revision ||
        page.scopeKey !== continuation.scopeKey ||
        page.scopeKind !== continuation.scopeKind))
  ) {
    return auditedFailure(supabase, {
      code: "db_failure",
      metadata: {
        ...requestMetadata(meta),
        reason: "catalog_v2_page_contract_invalid",
      },
      shopId: session.shop_id,
      status: 500,
      targetId: session.shop_device_id,
      targetType: "device",
    });
  }

  const revisionDescriptor = {
    revision: page.revision,
    scopeKey: page.scopeKey,
    scopeKind: page.scopeKind,
  } as const;
  const catalogRevision = buildCatalogRevision(
    session.shop_id,
    revisionDescriptor,
  );
  const nextLane =
    page.entity === "done" || page.entityHasMore
      ? null
      : nextCatalogV2Lane(page.entity, manifest.windowCounts);
  const hasMore = page.entityHasMore || nextLane !== null;
  const key = lastKey(page);
  let syncCursor = page.snapshotAt;

  if (hasMore) {
    const lane =
      page.entityHasMore && page.entity !== "done" ? page.entity : nextLane;

    if (!lane || (page.entityHasMore && !key)) {
      return auditedFailure(supabase, {
        code: "db_failure",
        metadata: {
          ...requestMetadata(meta),
          reason: "catalog_v2_next_cursor_invalid",
        },
        shopId: session.shop_id,
        status: 500,
        targetId: session.shop_device_id,
        targetType: "device",
      });
    }

    try {
      syncCursor = buildCatalogV2Cursor(
        {
          afterId: page.entityHasMore ? key?.id ?? null : null,
          afterUpdatedAt: page.entityHasMore ? key?.updatedAt ?? null : null,
          expiresAtUnixSeconds:
            continuation?.expiresAtUnixSeconds ??
            Math.floor(Date.parse(page.snapshotAt) / 1000) +
              CATALOG_CURSOR_TTL_SECONDS,
          lane,
          lowerBound: sync.lowerBound,
          manifest,
          mode: sync.mode,
          pageSize: sync.limit,
          revision: page.revision,
          scopeKey: page.scopeKey,
          scopeKind: page.scopeKind,
          snapshotAt: page.snapshotAt,
        },
        cursorContext,
      );
    } catch {
      return auditedFailure(supabase, {
        code: "db_failure",
        metadata: {
          ...requestMetadata(meta),
          reason: "catalog_v2_cursor_build_failed",
        },
        shopId: session.shop_id,
        status: 500,
        targetId: session.shop_device_id,
        targetType: "device",
      });
    }
  }

  const auditOk = await writePosCatalogAudit(supabase, {
    code: "success",
    metadata: {
      ...requestMetadata(meta),
      app_version_present: Boolean(parsed.appVersion),
      catalog_revision: catalogRevision,
      catalog_scope: page.scopeKind,
      categories: catalog.categories.length,
      category_tombstones: catalog.tombstones.categories.length,
      cursor_fingerprint: cursorFingerprint(syncCursor),
      cursor_source: sync.cursorSource,
      entity: page.entity,
      has_more: hasMore,
      page_rows: rowCountFor(catalog, page.entity),
      prices: catalog.prices.length,
      products: catalog.products.length,
      product_tombstones: catalog.tombstones.products.length,
      snapshot_at: page.snapshotAt,
      supplier_tombstones: catalog.tombstones.suppliers.length,
      suppliers: catalog.suppliers.length,
      sync_mode: sync.mode,
      updated_since: sync.lowerBound,
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
      catalog,
      catalogRevision,
      catalogSummary: manifest.catalogSummary,
      catalogVersion: catalogRevision,
      code: "success",
      generatedAt: requestTime,
      hasMore,
      ok: true,
      policy: buildPosPolicyPayload(),
      schemaVersion: POS_CATALOG_SCHEMA_VERSION,
      serverTime: page.snapshotAt,
      shop: buildPosShopPayload(shop),
      snapshotAt: page.snapshotAt,
      syncCursor,
      syncMode: sync.mode,
      updatedSince: sync.lowerBound,
    },
    status: 200,
  };
}
