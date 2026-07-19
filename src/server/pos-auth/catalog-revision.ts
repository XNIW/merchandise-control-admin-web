import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  CatalogV2Lane,
  CatalogV2Manifest,
  CatalogV2Summary,
  CatalogV2WindowCounts,
} from "./catalog-sync-contract";

export type CatalogScopeKind = "legacy_owner_bridge" | "shop_scoped";

export type CatalogRevisionDescriptor = {
  revision: string;
  scopeKey: string;
  scopeKind: CatalogScopeKind;
};

export type CatalogPageV2 = CatalogRevisionDescriptor & {
  entity: CatalogV2Lane | "done";
  entityHasMore: boolean;
  manifest: CatalogV2Manifest | null;
  rows: readonly Record<string, unknown>[];
  snapshotAt: string;
  status: "ok";
};

export type CatalogPageV2Failure = {
  status: "db_failure" | "invalid" | "snapshot_changed" | "unmapped";
};

const SCOPE_KEY_PATTERN = /^[0-9a-f]{32}$/;
const REVISION_PATTERN = /^[0-9]{1,19}$/;
const CATALOG_REVISION_PATTERN = /^catalog:v2:[0-9a-f]{32}$/;
const POSTGRES_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isSafeCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function parseDescriptor(value: Record<string, unknown>) {
  const scopeKind = value.scopeKind;
  const scopeKey = value.scopeKey;
  const revision = value.revision;

  if (
    (scopeKind !== "legacy_owner_bridge" && scopeKind !== "shop_scoped") ||
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
  return value === "invalid" ||
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
): Promise<CatalogRevisionDescriptor | null> {
  const { data, error } = await supabase.rpc("pos_catalog_revision_v2", {
    p_shop_id: shopId,
  });

  if (error || !isRecord(data) || data.status !== "ok") {
    return null;
  }

  return parseDescriptor(data);
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
    shopId: string;
    snapshotAt: string | null;
  },
): Promise<CatalogPageV2 | CatalogPageV2Failure> {
  const { data, error } = await supabase.rpc("pos_catalog_pull_page_v2", {
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
    p_shop_id: input.shopId,
    p_snapshot_at: input.snapshotAt,
  });

  if (error || !isRecord(data)) {
    return { status: "db_failure" };
  }

  if (data.status !== "ok") {
    return { status: parseStatus(data.status) ?? "db_failure" };
  }

  const descriptor = parseDescriptor(data);
  const entity = data.entity;
  const snapshotAt = data.snapshotAt;
  const rows = data.rows;
  const manifest = data.manifest === null ? null : parseManifest(data.manifest);

  if (
    !descriptor ||
    (entity !== "done" &&
      entity !== "categories" &&
      entity !== "suppliers" &&
      entity !== "products" &&
      entity !== "prices") ||
    typeof data.entityHasMore !== "boolean" ||
    typeof snapshotAt !== "string" ||
    !POSTGRES_TIMESTAMP_PATTERN.test(snapshotAt) ||
    !Number.isFinite(Date.parse(snapshotAt)) ||
    !Array.isArray(rows) ||
    rows.length > input.limit ||
    !rows.every(isRecord) ||
    (input.includeManifest && !manifest) ||
    (!input.includeManifest && manifest !== null) ||
    (entity === "done" && (rows.length !== 0 || data.entityHasMore))
  ) {
    return { status: "db_failure" };
  }

  return {
    ...descriptor,
    entity,
    entityHasMore: data.entityHasMore,
    manifest,
    rows: rows as Record<string, unknown>[],
    snapshotAt,
    status: "ok",
  };
}
