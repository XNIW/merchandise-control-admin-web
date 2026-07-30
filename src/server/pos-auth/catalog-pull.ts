import "server-only";

import { createHash } from "node:crypto";
import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import {
  isCanonicalCatalogDisplayText,
  isCanonicalCatalogIdentityText,
  POS_CATALOG_TEXT_LIMITS,
} from "./catalog-text-read-validation";
import { isStaffCredentialLockStateUsable } from "./staff-credential-lock-state";
import {
  buildPosPolicyPayload,
  buildPosShopPayload,
  type PosPolicyPayload,
  type PosShopPayload,
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
  type CatalogV2Manifest,
} from "./catalog-sync-contract";
import {
  buildCatalogRevision,
  loadCatalogPageV2,
  type CatalogPageV2,
} from "./catalog-revision";
import { verifyPosSecret } from "./tokens";
import {
  loadPosRuntimeLease,
  publishPosRuntimeLeaseSuccess,
  writePosRuntimeAudit,
} from "./runtime-boundary";
import { canonicalizePosRevisionTimestamp } from "./pos-revision-timestamp";

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
type ProductRow = Pick<
  Tables<"inventory_products">,
  | "barcode"
  | "category_id"
  | "deleted_at"
  | "id"
  | "item_number"
  | "primary_image_updated_at"
  | "primary_image_version_id"
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
  | "catalog_integrity_blocked"
  | "catalog_revision_timestamp_invalid"
  | "catalog_cursor_expired"
  | "catalog_cursor_rejected"
  | "db_failure"
  | "denied"
  | "not_configured"
  | "unmapped"
  | "validation_failed";

type PosCatalogFailureRoot =
  | "audit_unavailable"
  | "catalog_cursor"
  | "catalog_integrity"
  | "catalog_response_invalid"
  | "denied"
  | "publication_denied"
  | "publication_failure"
  | "publication_stale"
  | "rpc_failure"
  | "statement_timeout"
  | "unhandled_exception"
  | "unmapped"
  | "upstream_unavailable"
  | "validation"
  | "worker_binding_unavailable";

type PosCatalogFailureStage =
  | "audit"
  | "catalog_pull"
  | "categories"
  | "lease"
  | "manifest"
  | "prices"
  | "products"
  | "publication"
  | "suppliers";

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
    primaryImageUpdatedAt: string | null;
    primaryImageVersionId: string | null;
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
        root: PosCatalogFailureRoot;
        stage: PosCatalogFailureStage;
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
  edgeCorrelationHash?: string;
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
  details: {
    root?: PosCatalogFailureRoot;
    stage?: PosCatalogFailureStage;
  } = {},
): PosCatalogEndpointResult {
  const root: PosCatalogFailureRoot =
    details.root ??
    (code === "catalog_integrity_blocked"
      ? "catalog_integrity"
      : code === "catalog_cursor_expired" ||
          code === "catalog_cursor_rejected"
        ? "catalog_cursor"
        : code === "denied"
          ? "denied"
          : code === "not_configured"
            ? "worker_binding_unavailable"
            : code === "unmapped"
              ? "unmapped"
              : code === "validation_failed"
                ? "validation"
                : "rpc_failure");
  const message =
    code === "catalog_integrity_blocked"
      ? "Catalog integrity requires recovery before POS sync can continue."
      : code === "catalog_revision_timestamp_invalid"
        ? "Catalog revision timestamp is invalid."
      : code === "not_configured"
      ? "POS catalog backend is not configured."
      : code === "validation_failed"
        ? "Request payload is invalid."
        : code === "catalog_cursor_expired" ||
            code === "catalog_cursor_rejected"
          ? "Catalog continuation was rejected."
          : code === "unmapped"
            ? "This shop has a legacy catalog bridge that is not mapped."
            : code === "db_failure"
              ? "POS catalog pull failed."
              : "POS catalog pull was denied.";

  return {
    body: {
      code,
      message,
      ok: false,
      root,
      stage: details.stage ?? "catalog_pull",
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
    ...(meta.edgeCorrelationHash
      ? { edge_correlation_hash: meta.edgeCorrelationHash }
      : {}),
    ...(meta.requestId ? { request_id: meta.requestId } : {}),
    ...(meta.route ? { route: meta.route } : {}),
    source: "TASK-143",
    user_agent_length: meta.userAgent?.length ?? 0,
    user_agent_present: Boolean(meta.userAgent),
  };
}

function emitPosCatalogFailureLog(input: {
  code: PosCatalogFailureCode;
  meta: PosCatalogPullRequestMeta;
  root: PosCatalogFailureRoot;
  stage: PosCatalogFailureStage;
}) {
  console.error(
    JSON.stringify({
      code: input.code,
      event: "pos.catalog.pull.failure",
      ...(input.meta.edgeCorrelationHash
        ? { edgeCorrelationHash: input.meta.edgeCorrelationHash }
        : {}),
      ...(input.meta.requestId ? { requestId: input.meta.requestId } : {}),
      root: input.root,
      route: input.meta.route ?? "pos.catalog.pull",
      stage: input.stage,
    }),
  );
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
  return writePosRuntimeAudit(supabase, {
    code: input.code,
    eventKey:
      input.result === "success"
        ? "pos.catalog.pull.success"
        : "pos.catalog.pull.failure",
    metadata: input.metadata,
    result: input.result,
    severity: input.severity,
    shopId: input.shopId,
    targetId: input.targetId,
    targetType: input.targetType,
  });
}

async function auditedFailure(
  supabase: SupabaseAdminClient,
  input: {
    code: PosCatalogFailureCode;
    metadata?: JsonRecord;
    root?: PosCatalogFailureRoot;
    shopId?: string;
    stage?: PosCatalogFailureStage;
    status: 400 | 401 | 409 | 500 | 503;
    targetId?: string;
    targetType?: string;
  },
): Promise<PosCatalogEndpointResult> {
  const auditOk = await writePosCatalogAudit(supabase, {
    code: input.code,
    metadata: input.metadata,
    result: input.status >= 500 ? "failure" : "blocked",
    severity: input.status >= 500 ? "critical" : "warning",
    shopId: input.shopId,
    targetId: input.targetId,
    targetType: input.targetType,
  });

  if (!auditOk) {
    emitPosCatalogFailureLog({
      code: "db_failure",
      meta: {
        edgeCorrelationHash:
          typeof input.metadata?.edge_correlation_hash === "string"
            ? input.metadata.edge_correlation_hash
            : undefined,
        requestId:
          typeof input.metadata?.request_id === "string"
            ? input.metadata.request_id
            : undefined,
        route:
          typeof input.metadata?.route === "string"
            ? input.metadata.route
            : undefined,
      },
      root: "audit_unavailable",
      stage: "audit",
    });
    return failure("db_failure", 500, {
      root: "audit_unavailable",
      stage: "audit",
    });
  }

  return failure(input.code, input.status, {
    root: input.root,
    stage: input.stage,
  });
}

function isStaffUsable(staff: StaffAccountRow | null) {
  return Boolean(
    staff &&
      staff.status === "active" &&
      isStaffCredentialLockStateUsable({
        credentialStatus: staff.credential_status,
        lockedUntil: staff.locked_until,
      }) &&
      !staff.must_change_credential,
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
        typeof row.updated_at === "string" &&
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
        typeof row.updated_at === "string" &&
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
        typeof row.updated_at === "string" &&
        isStringOrNull(row.deleted_at) &&
        isStringOrNull(row.category_id) &&
        isStringOrNull(row.item_number) &&
        isStringOrNull(row.primary_image_updated_at) &&
        isStringOrNull(row.primary_image_version_id) &&
        (row.primary_image_version_id === null ||
          (row.primary_image_updated_at !== null &&
            isTimestamp(row.primary_image_updated_at))) &&
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

function hasCatalogRows(
  manifest: CatalogV2Manifest,
  mode: "delta" | "full_refresh",
) {
  const summary = manifest.catalogSummary;
  const window = manifest.windowCounts;
  const summaryHasRows =
    summary.categories > 0 ||
    summary.suppliers > 0 ||
    summary.products > 0 ||
    summary.prices > 0;

  return (
    summaryHasRows ||
    (mode === "delta" &&
      (window.categories > 0 ||
        window.suppliers > 0 ||
        window.products > 0 ||
        window.prices > 0))
  );
}

type CatalogPageMapping =
  | { catalog: CatalogPayload; status: "ok" }
  | {
      reason:
        | "catalog_page_content_invalid"
        | "catalog_revision_timestamp_invalid";
      status: "invalid";
    };

function mapCatalogPage(page: CatalogPageV2): CatalogPageMapping {
  const categoryRows = parseCategoryRows(page);
  const supplierRows = parseSupplierRows(page);
  const productRows = parseProductRows(page);
  const priceRows = parsePriceRows(page);

  if (!categoryRows || !supplierRows || !productRows || !priceRows) {
    return { reason: "catalog_page_content_invalid", status: "invalid" };
  }

  if (
    !categoryRows.every(
      (row) =>
        isCanonicalCatalogIdentityText(row.id, 256, true) &&
        isCanonicalCatalogDisplayText(
          row.name,
          POS_CATALOG_TEXT_LIMITS.categoryName,
          true,
        ),
    ) ||
    !supplierRows.every(
      (row) =>
        isCanonicalCatalogIdentityText(row.id, 256, true) &&
        isCanonicalCatalogDisplayText(
          row.name,
          POS_CATALOG_TEXT_LIMITS.supplierName,
          true,
        ),
    ) ||
    !productRows.every(
      (row) =>
        isCanonicalCatalogIdentityText(row.id, 256, true) &&
        isCanonicalCatalogIdentityText(
          row.barcode,
          POS_CATALOG_TEXT_LIMITS.barcode,
          true,
        ) &&
        isCanonicalCatalogIdentityText(
          row.item_number,
          POS_CATALOG_TEXT_LIMITS.itemNumber,
          false,
        ) &&
        isCanonicalCatalogDisplayText(
          row.product_name,
          POS_CATALOG_TEXT_LIMITS.productName,
          false,
        ) &&
        isCanonicalCatalogDisplayText(
          row.second_product_name,
          POS_CATALOG_TEXT_LIMITS.secondProductName,
          false,
        ) &&
        isCanonicalCatalogIdentityText(row.category_id, 256, false) &&
        isCanonicalCatalogIdentityText(row.supplier_id, 256, false) &&
        Boolean(row.product_name || row.second_product_name || row.item_number),
    )
  ) {
    return { reason: "catalog_page_content_invalid", status: "invalid" };
  }

  const { active: categories, tombstones: categoryTombstones } =
    splitCatalogTombstones(categoryRows);
  const { active: suppliers, tombstones: supplierTombstones } =
    splitCatalogTombstones(supplierRows);
  const { active: products, tombstones: productTombstones } =
    splitCatalogTombstones(productRows);
  const catalog = emptyCatalog();

  for (const category of categories) {
    const updatedAt = canonicalizePosRevisionTimestamp(category.updated_at);
    if (!updatedAt) {
      return {
        reason: "catalog_revision_timestamp_invalid",
        status: "invalid",
      };
    }
    catalog.categories.push({
      categoryId: category.id,
      name: category.name,
      updatedAt,
    });
  }
  for (const supplier of suppliers) {
    const updatedAt = canonicalizePosRevisionTimestamp(supplier.updated_at);
    if (!updatedAt) {
      return {
        reason: "catalog_revision_timestamp_invalid",
        status: "invalid",
      };
    }
    catalog.suppliers.push({
      name: supplier.name,
      supplierId: supplier.id,
      updatedAt,
    });
  }
  for (const product of products) {
    const updatedAt = canonicalizePosRevisionTimestamp(product.updated_at);
    const primaryImageUpdatedAt =
      product.primary_image_updated_at === null
        ? null
        : canonicalizePosRevisionTimestamp(product.primary_image_updated_at);
    if (
      !updatedAt ||
      (product.primary_image_updated_at !== null && !primaryImageUpdatedAt) ||
      (product.primary_image_version_id !== null && !primaryImageUpdatedAt)
    ) {
      return {
        reason: "catalog_revision_timestamp_invalid",
        status: "invalid",
      };
    }
    catalog.products.push({
      barcode: product.barcode,
      categoryId: product.category_id,
      itemNumber: product.item_number,
      primaryImageUpdatedAt,
      primaryImageVersionId: product.primary_image_version_id,
      productId: product.id,
      productName: product.product_name,
      purchasePrice: product.purchase_price,
      retailPrice: product.retail_price,
      secondProductName: product.second_product_name,
      stockQuantity: product.stock_quantity,
      supplierId: product.supplier_id,
      updatedAt,
    });
  }
  catalog.prices = priceRows.map((price) => ({
    effectiveAt: price.effective_at,
    price: price.price,
    priceId: price.id,
    productId: price.product_id,
    source: price.source,
    type: price.type,
  }));
  for (const category of categoryTombstones) {
    const deletedAt = canonicalizePosRevisionTimestamp(
      category.deleted_at ?? category.updated_at,
    );
    const updatedAt = canonicalizePosRevisionTimestamp(category.updated_at);
    if (!deletedAt || !updatedAt) {
      return {
        reason: "catalog_revision_timestamp_invalid",
        status: "invalid",
      };
    }
    catalog.tombstones.categories.push({
      categoryId: category.id,
      deletedAt,
      updatedAt,
    });
  }
  for (const supplier of supplierTombstones) {
    const deletedAt = canonicalizePosRevisionTimestamp(
      supplier.deleted_at ?? supplier.updated_at,
    );
    const updatedAt = canonicalizePosRevisionTimestamp(supplier.updated_at);
    if (!deletedAt || !updatedAt) {
      return {
        reason: "catalog_revision_timestamp_invalid",
        status: "invalid",
      };
    }
    catalog.tombstones.suppliers.push({
      deletedAt,
      supplierId: supplier.id,
      updatedAt,
    });
  }
  for (const product of productTombstones) {
    const deletedAt = canonicalizePosRevisionTimestamp(
      product.deleted_at ?? product.updated_at,
    );
    const updatedAt = canonicalizePosRevisionTimestamp(product.updated_at);
    if (!deletedAt || !updatedAt) {
      return {
        reason: "catalog_revision_timestamp_invalid",
        status: "invalid",
      };
    }
    catalog.tombstones.products.push({
      deletedAt,
      productId: product.id,
      updatedAt,
    });
  }

  return { catalog, status: "ok" };
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
    emitPosCatalogFailureLog({
      code: "not_configured",
      meta,
      root: "worker_binding_unavailable",
      stage: "catalog_pull",
    });
    return failure("not_configured", 503, {
      root: "worker_binding_unavailable",
      stage: "catalog_pull",
    });
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

  const lease = await loadPosRuntimeLease(supabase, {
    posSessionId: parsed.posSessionId,
    shopDeviceId: parsed.shopDeviceId,
  });

  if (lease.status === "db_failure") {
    return auditedFailure(supabase, {
      code: "db_failure",
      metadata: requestMetadata(meta),
      root: "rpc_failure",
      stage: "lease",
      status: 500,
    });
  }

  if (lease.status === "denied") {
    return auditedFailure(supabase, {
      code: "denied",
      metadata: requestMetadata(meta),
      root: "denied",
      stage: "lease",
      status: 401,
    });
  }

  const { credential, device, session, shop, staff } = lease;
  const sessionValid = Boolean(
    session &&
      session.status === "active" &&
      isFutureTimestamp(session.expires_at) &&
      verifyPosSecret(parsed.sessionToken, session.session_token_hash),
  );

  if (!sessionValid) {
    return auditedFailure(supabase, {
      code: "denied",
      metadata: requestMetadata(meta),
      root: "denied",
      shopId: session.shop_id,
      stage: "lease",
      status: 401,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }

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
      shop.shop_status === "active" &&
      isStaffUsable(staff) &&
      device.status === "active" &&
      staff.credential_version === credential.staff_credential_version &&
      session.staff_credential_version === staff.credential_version &&
      !isAfterTimestamp(staff.session_invalidated_at, session.issued_at),
  );

  if (!runtimeValid) {
    return auditedFailure(supabase, {
      code: "denied",
      metadata: {
        ...requestMetadata(meta),
        app_version_present: Boolean(parsed.appVersion),
        device_resolved: true,
        shop_resolved: true,
        staff_resolved: true,
      },
      root: "denied",
      shopId: session.shop_id,
      stage: "lease",
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
      root: "catalog_cursor",
      shopId: session.shop_id,
      stage: "catalog_pull",
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
    posSessionId: session.pos_session_id,
    shopDeviceId: session.shop_device_id,
    shopId: session.shop_id,
    snapshotAt: sync.snapshotAt,
    staffId: session.staff_id,
  });

  if (page.status !== "ok") {
    const code: PosCatalogFailureCode =
      page.status === "denied"
        ? "denied"
        : page.status === "unmapped"
        ? "unmapped"
        : page.status === "integrity_blocked"
          ? "catalog_integrity_blocked"
        : page.status === "snapshot_changed"
          ? "catalog_cursor_rejected"
          : "db_failure";

    return auditedFailure(supabase, {
      code,
      metadata: {
        ...requestMetadata(meta),
        cursor_fingerprint: cursorFingerprint(parsed.syncRequest.syncCursor),
        lane: page.stage === "manifest" ? null : (page.stage ?? null),
        manifest_requested: !continuation,
        reason:
          page.status === "snapshot_changed"
            ? "snapshot_revision_or_scope_changed"
            : (page.reason ?? page.status),
        stage: page.stage ?? (continuation?.lane ?? "manifest"),
      },
      root:
        page.reason === "catalog_rpc_statement_timeout"
          ? "statement_timeout"
          : page.reason === "catalog_rpc_upstream_unavailable"
            ? "upstream_unavailable"
          : page.reason === "catalog_rpc_response_invalid" ||
              page.reason === "catalog_v2_page_contract_invalid"
            ? "catalog_response_invalid"
            : code === "catalog_integrity_blocked"
              ? "catalog_integrity"
              : code === "unmapped"
                ? "unmapped"
                : code === "denied"
                  ? "denied"
                  : "rpc_failure",
      shopId: session.shop_id,
      stage: page.stage ?? (continuation?.lane ?? "manifest"),
      status:
        code === "denied"
          ? 401
          : page.reason === "catalog_rpc_upstream_unavailable"
            ? 503
          : code === "unmapped" ||
        code === "catalog_integrity_blocked" ||
        code === "catalog_cursor_rejected"
          ? 409
          : 500,
      targetId: session.shop_device_id,
      targetType: "device",
    });
  }

  const manifest = page.manifest ?? continuation?.manifest ?? null;
  const catalogMapping = mapCatalogPage(page);
  const catalog =
    catalogMapping.status === "ok" ? catalogMapping.catalog : null;
  const manifestHasRows = manifest
    ? hasCatalogRows(manifest, sync.mode)
    : false;

  if (
    !manifest ||
    !manifestHasRows ||
    !catalog ||
    (page.entityHasMore && page.rows.length !== page.pageLimit) ||
    (continuation &&
      (!catalogV2TimestampsEqual(page.snapshotAt, continuation.snapshotAt) ||
        page.entity !== continuation.lane ||
        page.revision !== continuation.revision ||
        page.scopeKey !== continuation.scopeKey ||
        page.scopeKind !== continuation.scopeKind))
  ) {
    const revisionTimestampInvalid =
      catalogMapping.status === "invalid" &&
      catalogMapping.reason === "catalog_revision_timestamp_invalid";
    const mappingFailureStage: PosCatalogFailureStage =
      revisionTimestampInvalid && page.entity !== "done"
        ? page.entity
        : manifest && !manifestHasRows
          ? "manifest"
          : (continuation?.lane ?? "manifest");
    return auditedFailure(supabase, {
      code: revisionTimestampInvalid
        ? "catalog_revision_timestamp_invalid"
        : "db_failure",
      metadata: {
        ...requestMetadata(meta),
        lane: page.entity,
        manifest_present: Boolean(manifest),
        reason:
          manifest && !manifestHasRows
            ? "catalog_v2_empty_manifest"
            : revisionTimestampInvalid
              ? "catalog_revision_timestamp_invalid"
              : "catalog_v2_page_contract_invalid",
        row_count: page.rows.length,
        stage: mappingFailureStage,
      },
      root: "catalog_response_invalid",
      shopId: session.shop_id,
      stage: mappingFailureStage,
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
        root: "catalog_response_invalid",
        shopId: session.shop_id,
        stage: page.entity === "done" ? "catalog_pull" : page.entity,
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
        root: "catalog_response_invalid",
        shopId: session.shop_id,
        stage: "catalog_pull",
        status: 500,
        targetId: session.shop_device_id,
        targetType: "device",
      });
    }
  }

  const successBody = {
    catalog,
    catalogRevision,
    catalogSummary: manifest.catalogSummary,
    catalogVersion: catalogRevision,
    code: "success" as const,
    generatedAt: requestTime,
    hasMore,
    ok: true as const,
    policy: buildPosPolicyPayload(),
    schemaVersion: POS_CATALOG_SCHEMA_VERSION,
    serverTime: page.snapshotAt,
    shop: buildPosShopPayload(shop),
    snapshotAt: page.snapshotAt,
    syncCursor,
    syncMode: sync.mode,
    updatedSince: sync.lowerBound,
  };

  // Build the complete body first, then make this the last await before
  // release.  The RPC rechecks the locked POS lease and writes the only
  // success audit atomically; a stale page/cursor is never exposed.
  const publication = await publishPosRuntimeLeaseSuccess(supabase, {
    catalogPublication: {
      expectedRevision: page.revision,
      expectedScopeKey: page.scopeKey,
    },
    posSessionId: session.pos_session_id,
    publicationKind: "catalog_pull",
    shopDeviceId: session.shop_device_id,
    shopId: session.shop_id,
    staffId: session.staff_id,
  });
  if (publication.status === "denied") {
    return auditedFailure(supabase, {
      code: "denied",
      metadata: {
        ...requestMetadata(meta),
        reason: "catalog_publication_denied",
        stage: "publication",
      },
      root: "publication_denied",
      shopId: session.shop_id,
      stage: "publication",
      status: 401,
      targetId: session.shop_device_id,
      targetType: "device",
    });
  }
  if (publication.status === "stale_catalog") {
    return auditedFailure(supabase, {
      code: "catalog_cursor_rejected",
      metadata: {
        ...requestMetadata(meta),
        reason: "catalog_publication_stale",
        stage: "publication",
      },
      root: "publication_stale",
      shopId: session.shop_id,
      stage: "publication",
      status: 409,
      targetId: session.shop_device_id,
      targetType: "device",
    });
  }
  if (publication.status !== "ok") {
    return auditedFailure(supabase, {
      code: "db_failure",
      metadata: {
        ...requestMetadata(meta),
        reason: "catalog_publication_failure",
        stage: "publication",
      },
      root: "publication_failure",
      shopId: session.shop_id,
      stage: "publication",
      status: 500,
      targetId: session.shop_device_id,
      targetType: "device",
    });
  }

  return { body: successBody, status: 200 };
}

export async function handlePosCatalogRouteFailure(
  meta: PosCatalogPullRequestMeta,
): Promise<PosCatalogEndpointResult> {
  try {
    const backend = await getSupabaseForPosCatalog();

    if (!backend) {
      emitPosCatalogFailureLog({
        code: "not_configured",
        meta,
        root: "worker_binding_unavailable",
        stage: "catalog_pull",
      });
      return failure("not_configured", 503, {
        root: "worker_binding_unavailable",
        stage: "catalog_pull",
      });
    }

    return auditedFailure(backend.supabase, {
      code: "db_failure",
      metadata: {
        ...requestMetadata(meta),
        reason: "catalog_route_unhandled_exception",
        stage: "catalog_pull",
      },
      root: "unhandled_exception",
      stage: "catalog_pull",
      status: 500,
    });
  } catch {
    emitPosCatalogFailureLog({
      code: "db_failure",
      meta,
      root: "unhandled_exception",
      stage: "catalog_pull",
    });
    return failure("db_failure", 500, {
      root: "unhandled_exception",
      stage: "catalog_pull",
    });
  }
}
