import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseAdminClient } from "@/lib/supabase/admin";
import { isCanonicalPostgresUuid } from "../shared/postgres-uuid.ts";
import type {
  CatalogV2Lane,
  CatalogV2Manifest,
  CatalogV2Summary,
  CatalogV2WindowCounts,
} from "./catalog-sync-contract";

export type CatalogScopeKind =
  "authorized_shop_plus_legacy" | "legacy_owner_bridge" | "shop_scoped";

export type CatalogRevisionDescriptor = {
  revision: string;
  scopeKey: string;
  scopeKind: CatalogScopeKind;
};

export type CatalogPageV2 = CatalogRevisionDescriptor & {
  entity: CatalogV2Lane | "done";
  entityHasMore: boolean;
  manifest: CatalogV2Manifest | null;
  pageLimit: number;
  rows: readonly Record<string, unknown>[];
  scopeOwnerId: string | null;
  snapshotAt: string;
  status: "ok";
};

export type CatalogPageV2Failure = {
  reason?:
    | "catalog_rpc_error"
    | "catalog_rpc_response_invalid"
    | "catalog_rpc_statement_timeout"
    | "catalog_v2_page_contract_invalid";
  stage?: CatalogV2Lane | "manifest";
  status:
    | "db_failure"
    | "denied"
    | "integrity_blocked"
    | "invalid"
    | "resource_exceeded"
    | "snapshot_changed"
    | "unmapped";
};

export type CatalogRevisionV2Result =
  (CatalogRevisionDescriptor & { status: "ok" }) | CatalogPageV2Failure;

const SCOPE_KEY_PATTERN = /^[0-9a-f]{32}$/;
const REVISION_PATTERN = /^[0-9]{1,19}$/;
const CATALOG_REVISION_PATTERN = /^catalog:v2:[0-9a-f]{32}$/;
const POSTGRES_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const LEGACY_PRICE_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isSafeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function canonicalUuid(value: unknown) {
  return isCanonicalPostgresUuid(value) ? value : null;
}

function timestampMicros(value: unknown) {
  if (typeof value !== "string" || !POSTGRES_TIMESTAMP_PATTERN.test(value)) {
    return null;
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    return null;
  }
  const fraction = /\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] ?? "";
  const microsWithinMillisecond = Number(fraction.padEnd(6, "0").slice(3, 6));
  return BigInt(milliseconds) * BigInt(1_000) + BigInt(microsWithinMillisecond);
}

function catalogPriceTimestampIsValid(value: unknown) {
  if (timestampMicros(value) !== null) {
    return true;
  }
  if (
    typeof value !== "string" ||
    !LEGACY_PRICE_TIMESTAMP_PATTERN.test(value)
  ) {
    return false;
  }

  const normalized = value.replace(" ", "T");
  const parsed = new Date(`${normalized}Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 19) === normalized.slice(0, 19)
  );
}

function scopeKeyForPage(
  shopId: string,
  scopeKind: CatalogScopeKind,
  scopeOwnerId: string | null,
) {
  const scopeId = scopeKind === "shop_scoped" ? shopId : scopeOwnerId;
  return createHash("sha256")
    .update(
      `${shopId.toLowerCase()}:${scopeKind}:${scopeId?.toLowerCase() ?? "-"}`,
      "utf8",
    )
    .digest("hex")
    .slice(0, 32);
}

function rowMatchesPageContract(
  row: Record<string, unknown>,
  input: { shopId: string },
  scopeKind: CatalogScopeKind,
  scopeOwnerId: string | null,
  entity: CatalogV2Lane,
  snapshotMicros: bigint,
) {
  const id = canonicalUuid(row.id);
  const ownerUserId = canonicalUuid(row.owner_user_id);
  const shopId = row.shop_id === null ? null : canonicalUuid(row.shop_id);
  const updatedAtMicros = timestampMicros(row.updated_at);
  const scopeMatches =
    (shopId !== null &&
      (scopeKind === "shop_scoped" ||
        scopeKind === "authorized_shop_plus_legacy") &&
      shopId === input.shopId.toLowerCase()) ||
    (shopId === null &&
      (scopeKind === "legacy_owner_bridge" ||
        scopeKind === "authorized_shop_plus_legacy") &&
      scopeOwnerId !== null &&
      ownerUserId === scopeOwnerId);
  if (
    id === null ||
    ownerUserId === null ||
    (row.shop_id !== null && shopId === null) ||
    updatedAtMicros === null ||
    updatedAtMicros > snapshotMicros ||
    !scopeMatches
  ) {
    return null;
  }

  const deletedAtValid =
    row.deleted_at === null || timestampMicros(row.deleted_at) !== null;
  const optionalUuid = (value: unknown) =>
    value === null || canonicalUuid(value) !== null;
  const finiteNumberOrNull = (value: unknown) =>
    value === null || (typeof value === "number" && Number.isFinite(value));
  const valid =
    entity === "categories" || entity === "suppliers"
      ? typeof row.name === "string" && deletedAtValid
      : entity === "products"
        ? typeof row.barcode === "string" &&
          (row.item_number === null || typeof row.item_number === "string") &&
          (row.product_name === null || typeof row.product_name === "string") &&
          (row.second_product_name === null ||
            typeof row.second_product_name === "string") &&
          optionalUuid(row.supplier_id) &&
          optionalUuid(row.category_id) &&
          finiteNumberOrNull(row.purchase_price) &&
          finiteNumberOrNull(row.retail_price) &&
          finiteNumberOrNull(row.stock_quantity) &&
          deletedAtValid
        : canonicalUuid(row.product_id) !== null &&
          typeof row.type === "string" &&
          typeof row.price === "number" &&
          Number.isFinite(row.price) &&
          catalogPriceTimestampIsValid(row.effective_at) &&
          catalogPriceTimestampIsValid(row.created_at) &&
          (row.source === null || typeof row.source === "string");

  return valid ? { id, updatedAtMicros } : null;
}

function parseDescriptor(value: Record<string, unknown>) {
  const scopeKind = value.scopeKind;
  const scopeKey = value.scopeKey;
  const revision = value.revision;

  if (
    (scopeKind !== "authorized_shop_plus_legacy" &&
      scopeKind !== "legacy_owner_bridge" &&
      scopeKind !== "shop_scoped") ||
    typeof scopeKey !== "string" ||
    !SCOPE_KEY_PATTERN.test(scopeKey) ||
    typeof revision !== "string" ||
    !REVISION_PATTERN.test(revision)
  ) {
    return null;
  }

  return { revision, scopeKey, scopeKind } satisfies CatalogRevisionDescriptor;
}

function parseSummary(value: unknown): CatalogV2Summary | null {
  if (!isRecord(value)) {
    return null;
  }

  const activeProducts = value.activeProducts;
  const categories = value.categories;
  const prices = value.prices;
  const products = value.products;
  const suppliers = value.suppliers;

  if (
    !isSafeCount(activeProducts) ||
    !isSafeCount(categories) ||
    !isSafeCount(prices) ||
    !isSafeCount(products) ||
    !isSafeCount(suppliers) ||
    activeProducts > products
  ) {
    return null;
  }

  return { activeProducts, categories, prices, products, suppliers };
}

function parseWindowCounts(value: unknown): CatalogV2WindowCounts | null {
  if (!isRecord(value)) {
    return null;
  }

  const categories = value.categories;
  const prices = value.prices;
  const products = value.products;
  const suppliers = value.suppliers;

  if (
    !isSafeCount(categories) ||
    !isSafeCount(prices) ||
    !isSafeCount(products) ||
    !isSafeCount(suppliers)
  ) {
    return null;
  }

  return { categories, prices, products, suppliers };
}

function parseManifest(value: unknown): CatalogV2Manifest | null {
  if (!isRecord(value)) {
    return null;
  }

  const catalogSummary = parseSummary(value.catalogSummary);
  const windowCounts = parseWindowCounts(value.windowCounts);

  return catalogSummary && windowCounts
    ? { catalogSummary, windowCounts }
    : null;
}

function parseStatus(value: unknown): CatalogPageV2Failure["status"] | null {
  return value === "denied" ||
    value === "integrity_blocked" ||
    value === "invalid" ||
    value === "resource_exceeded" ||
    value === "snapshot_changed" ||
    value === "unmapped"
    ? value
    : null;
}

export function buildCatalogRevision(
  shopId: string,
  descriptor: CatalogRevisionDescriptor,
) {
  const digest = createHash("sha256")
    .update(
      [
        "catalog-v2",
        shopId,
        descriptor.scopeKind,
        descriptor.scopeKey,
        descriptor.revision,
      ].join("\n"),
      "utf8",
    )
    .digest("hex")
    .slice(0, 32);

  return `catalog:v2:${digest}`;
}

export function normalizeCatalogRevision(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return CATALOG_REVISION_PATTERN.test(normalized) ? normalized : null;
}

export async function loadCatalogRevisionV2(
  supabase: SupabaseAdminClient,
  shopId: string,
  lease: {
    posSessionId: string;
    shopDeviceId: string;
    staffId: string;
  },
): Promise<CatalogRevisionV2Result> {
  const { data, error } = await supabase.rpc("pos_catalog_revision_for_lease_v3", {
    p_pos_session_id: lease.posSessionId,
    p_shop_device_id: lease.shopDeviceId,
    p_shop_id: shopId,
    p_staff_id: lease.staffId,
  });

  if (error || !isRecord(data)) {
    return { status: "db_failure" };
  }

  if (data.status !== "ok") {
    return { status: parseStatus(data.status) ?? "db_failure" };
  }

  const descriptor = parseDescriptor(data);

  return descriptor
    ? { ...descriptor, status: "ok" }
    : { status: "db_failure" };
}

export async function loadCatalogPageV2(
  supabase: SupabaseAdminClient,
  input: {
    afterId: string | null;
    afterUpdatedAt: string | null;
    entity: CatalogV2Lane | null;
    expectedRevision: string | null;
    expectedScopeKey: string | null;
    expectedScopeKind: CatalogScopeKind | null;
    includeManifest: boolean;
    limit: number;
    lowerBound: string | null;
    mode: "delta" | "full_refresh";
    posSessionId: string;
    shopId: string;
    shopDeviceId: string;
    snapshotAt: string | null;
    staffId: string;
  },
): Promise<CatalogPageV2 | CatalogPageV2Failure> {
  const { data, error } = await supabase.rpc("pos_catalog_pull_page_for_lease_v3", {
    p_after_id: input.afterId,
    p_after_updated_at: input.afterUpdatedAt,
    p_entity: input.entity,
    p_expected_revision: input.expectedRevision,
    p_expected_scope_key: input.expectedScopeKey,
    p_expected_scope_kind: input.expectedScopeKind,
    p_include_manifest: input.includeManifest,
    p_limit: input.limit,
    p_lower_bound: input.lowerBound,
    p_mode: input.mode,
    p_pos_session_id: input.posSessionId,
    p_shop_device_id: input.shopDeviceId,
    p_shop_id: input.shopId,
    p_snapshot_at: input.snapshotAt,
    p_staff_id: input.staffId,
  });
  const stage = input.includeManifest
    ? "manifest"
    : (input.entity ?? "manifest");

  if (error) {
    return {
      reason:
        error.code === "57014"
          ? "catalog_rpc_statement_timeout"
          : "catalog_rpc_error",
      stage,
      status: "db_failure",
    };
  }

  if (!isRecord(data)) {
    return {
      reason: "catalog_rpc_response_invalid",
      stage,
      status: "db_failure",
    };
  }

  if (data.status !== "ok") {
    const status = parseStatus(data.status);

    return status
      ? { status }
      : {
          reason: "catalog_rpc_response_invalid",
          stage,
          status: "db_failure",
        };
  }

  const descriptor = parseDescriptor(data);
  const entity = data.entity;
  const snapshotAt =
    typeof data.snapshotAt === "string" ? data.snapshotAt : null;
  const rows = data.rows;
  const pageLimit = data.pageLimit;
  const rawScopeOwnerId = data.scopeOwnerId;
  const manifest = data.manifest === null ? null : parseManifest(data.manifest);
  const scopeOwnerId =
    rawScopeOwnerId === null ? null : canonicalUuid(rawScopeOwnerId);
  const snapshotMicros = timestampMicros(snapshotAt);

  if (
    !descriptor ||
    !canonicalUuid(input.shopId) ||
    (entity !== "done" &&
      entity !== "categories" &&
      entity !== "suppliers" &&
      entity !== "products" &&
      entity !== "prices") ||
    typeof data.entityHasMore !== "boolean" ||
    !Number.isSafeInteger(pageLimit) ||
    (pageLimit as number) < 1 ||
    (pageLimit as number) > input.limit ||
    snapshotMicros === null ||
    (rawScopeOwnerId !== null && scopeOwnerId === null) ||
    (descriptor?.scopeKind === "shop_scoped" && scopeOwnerId !== null) ||
    (descriptor?.scopeKind !== "shop_scoped" && scopeOwnerId === null) ||
    (descriptor !== null &&
      scopeKeyForPage(input.shopId, descriptor.scopeKind, scopeOwnerId) !==
        descriptor.scopeKey) ||
    (input.expectedRevision !== null &&
      descriptor?.revision !== input.expectedRevision) ||
    (input.expectedScopeKey !== null &&
      descriptor?.scopeKey !== input.expectedScopeKey) ||
    (input.expectedScopeKind !== null &&
      descriptor?.scopeKind !== input.expectedScopeKind) ||
    (input.snapshotAt !== null &&
      timestampMicros(input.snapshotAt) !== snapshotMicros) ||
    (input.entity !== null && entity !== input.entity) ||
    (input.afterId === null) !== (input.afterUpdatedAt === null) ||
    (input.afterId !== null && canonicalUuid(input.afterId) === null) ||
    (input.afterUpdatedAt !== null &&
      timestampMicros(input.afterUpdatedAt) === null) ||
    !Array.isArray(rows) ||
    rows.length > input.limit ||
    rows.length > (pageLimit as number) ||
    !rows.every(isRecord) ||
    (input.includeManifest && !manifest) ||
    (!input.includeManifest && manifest !== null) ||
    (data.entityHasMore && rows.length !== pageLimit) ||
    (entity === "done" && (rows.length !== 0 || data.entityHasMore))
  ) {
    return {
      reason: "catalog_v2_page_contract_invalid",
      stage,
      status: "db_failure",
    };
  }

  if (entity !== "done") {
    const parsedRows = (rows as Record<string, unknown>[]).map((row) =>
      rowMatchesPageContract(
        row,
        input,
        descriptor.scopeKind,
        scopeOwnerId,
        entity,
        snapshotMicros,
      ),
    );
    const afterMicros = timestampMicros(input.afterUpdatedAt);
    const seenIds = new Set<string>();
    let previous: { id: string; updatedAtMicros: bigint } | null =
      input.afterId !== null && afterMicros !== null
        ? { id: input.afterId.toLowerCase(), updatedAtMicros: afterMicros }
        : null;

    for (const parsedRow of parsedRows) {
      if (
        parsedRow === null ||
        seenIds.has(parsedRow.id) ||
        (previous !== null &&
          (parsedRow.updatedAtMicros < previous.updatedAtMicros ||
            (parsedRow.updatedAtMicros === previous.updatedAtMicros &&
              parsedRow.id <= previous.id)))
      ) {
        return {
          reason: "catalog_v2_page_contract_invalid",
          stage,
          status: "db_failure",
        };
      }
      seenIds.add(parsedRow.id);
      previous = parsedRow;
    }
  }

  return {
    ...descriptor,
    entity,
    entityHasMore: data.entityHasMore,
    manifest,
    pageLimit: pageLimit as number,
    rows: rows as Record<string, unknown>[],
    scopeOwnerId,
    snapshotAt: snapshotAt as string,
    status: "ok",
  };
}
