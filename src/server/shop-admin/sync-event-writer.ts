import "server-only";

import { createHash } from "node:crypto";
import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import type {
  ShopAdminActionContext,
  ShopAdminActionResult,
} from "./action-context";

type ReadyShopActionContext = Extract<
  ShopAdminActionContext,
  { status: "ready" }
>;

export type AdminWebSyncDomain = "catalog" | "history" | "prices";
export type AdminWebSyncEventType =
  | "catalog_changed"
  | "catalog_tombstone"
  | "history_changed"
  | "history_tombstone"
  | "prices_changed"
  | "prices_tombstone";

export type CatalogSyncEntity = "category" | "product" | "supplier";
export type CatalogSyncOperation = "archive" | "create" | "restore" | "update";

type CatalogEntityIdsKey = "category_ids" | "product_ids" | "supplier_ids";
type SyncWriteResult =
  | { ok: true }
  | {
      code: "not_configured" | "db_failure" | "not_found";
      ok: false;
    };

type CatalogSyncRow = Pick<
  Tables<"inventory_categories">,
  "deleted_at" | "id" | "owner_user_id" | "shop_id" | "updated_at"
>;
type LegacyCatalogSyncRow = Omit<CatalogSyncRow, "shop_id">;
type ProductBulkSyncRow = Pick<
  Tables<"inventory_products">,
  "deleted_at" | "id" | "owner_user_id" | "shop_id" | "updated_at"
>;
type LegacyProductBulkSyncRow = Omit<ProductBulkSyncRow, "shop_id">;
type PriceBulkSyncRow = Pick<
  Tables<"inventory_product_prices">,
  "created_at" | "effective_at" | "id" | "owner_user_id" | "product_id" | "shop_id"
>;
type LegacyPriceBulkSyncRow = Omit<PriceBulkSyncRow, "shop_id">;
type OwnerShopSyncRow = {
  id: string;
  owner_user_id: string;
  shop_id: string | null;
};

type AdminWebSyncEventInput = {
  changedCount?: number;
  clientEventSeed: string;
  domain: AdminWebSyncDomain;
  entityIds: Json;
  eventType: AdminWebSyncEventType;
  metadata: Record<string, Json>;
  ownerUserId: string;
  shopId: string | null;
  supabase: SupabaseAdminClient;
};

const catalogEntityConfig: Record<
  CatalogSyncEntity,
  {
    entityIdsKey: CatalogEntityIdsKey;
    table:
      | "inventory_categories"
      | "inventory_products"
      | "inventory_suppliers";
  }
> = {
  category: {
    entityIdsKey: "category_ids",
    table: "inventory_categories",
  },
  product: {
    entityIdsKey: "product_ids",
    table: "inventory_products",
  },
  supplier: {
    entityIdsKey: "supplier_ids",
    table: "inventory_suppliers",
  },
};

function omitShopId<T extends { shop_id: unknown }>(row: T): Omit<T, "shop_id"> {
  const legacyRow = { ...row };
  Reflect.deleteProperty(legacyRow, "shop_id");
  return legacyRow;
}

function adminClientForContext(context: ReadyShopActionContext) {
  if (context.principalKind === "pos_staff_manager") {
    return context.supabase;
  }

  return createSupabaseAdminClient(resolveSupabaseAdminConfig());
}

function syncEventTypeForCatalogOperation(operation: CatalogSyncOperation) {
  return operation === "archive" ? "catalog_tombstone" : "catalog_changed";
}

function buildAdminWebClientEventId(seed: string) {
  const digest = createHash("sha256").update(seed).digest("hex").slice(0, 48);

  return `admin_web:${digest}`;
}

function isDuplicateSyncEventError(error: unknown) {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    (error as { code?: unknown }).code === "23505"
  );
}

function isLegacySyncSchemaError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: unknown }).code;

  return code === "42703" || code === "PGRST204" || code === "PGRST205";
}

function actorKind(context: ReadyShopActionContext) {
  return context.principalKind;
}

function uniqueNonEmptyIds(ids: readonly string[]) {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean))).sort();
}

function shortSyncDigest(parts: readonly string[]) {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 32);
}

function catalogScopeForRows(rows: readonly OwnerShopSyncRow[]) {
  return rows.every((row) => row.shop_id === null)
    ? "legacy_owner_bridge"
    : "shop_scoped";
}

function groupRowsByOwnerAndShop<T extends OwnerShopSyncRow>(
  rows: readonly T[],
  selectedShopId: string,
) {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const groupShopId = row.shop_id ?? selectedShopId;
    const key = `${row.owner_user_id}:${groupShopId}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return groups;
}

async function loadCatalogSyncRow(
  supabase: SupabaseAdminClient,
  entity: CatalogSyncEntity,
  id: string,
) {
  const config = catalogEntityConfig[entity];

  const result = await supabase
    .from(config.table)
    .select("id,owner_user_id,shop_id,updated_at,deleted_at")
    .eq("id", id)
    .maybeSingle<CatalogSyncRow>();

  if (!result.error || !isLegacySyncSchemaError(result.error)) {
    return result;
  }

  const legacyResult = await supabase
    .from(config.table)
    .select("id,owner_user_id,updated_at,deleted_at")
    .eq("id", id)
    .maybeSingle<LegacyCatalogSyncRow>();

  return {
    data: legacyResult.data
      ? ({ ...legacyResult.data, shop_id: null } satisfies CatalogSyncRow)
      : null,
    error: legacyResult.error,
  };
}

async function loadProductBulkSyncRows(
  supabase: SupabaseAdminClient,
  ids: readonly string[],
) {
  const result = await supabase
    .from("inventory_products")
    .select("id,owner_user_id,shop_id,updated_at,deleted_at")
    .in("id", ids)
    .returns<ProductBulkSyncRow[]>();

  if (!result.error || !isLegacySyncSchemaError(result.error)) {
    return result;
  }

  const legacyResult = await supabase
    .from("inventory_products")
    .select("id,owner_user_id,updated_at,deleted_at")
    .in("id", ids)
    .returns<LegacyProductBulkSyncRow[]>();

  return {
    data: legacyResult.data
      ? legacyResult.data.map((row) => ({ ...row, shop_id: null }))
      : null,
    error: legacyResult.error,
  };
}

async function loadPriceBulkSyncRows(
  supabase: SupabaseAdminClient,
  ids: readonly string[],
) {
  const result = await supabase
    .from("inventory_product_prices")
    .select("id,owner_user_id,shop_id,product_id,created_at,effective_at")
    .in("id", ids)
    .returns<PriceBulkSyncRow[]>();

  if (!result.error || !isLegacySyncSchemaError(result.error)) {
    return result;
  }

  const legacyResult = await supabase
    .from("inventory_product_prices")
    .select("id,owner_user_id,product_id,created_at,effective_at")
    .in("id", ids)
    .returns<LegacyPriceBulkSyncRow[]>();

  return {
    data: legacyResult.data
      ? legacyResult.data.map((row) => ({ ...row, shop_id: null }))
      : null,
    error: legacyResult.error,
  };
}

export async function writeAdminWebSyncEvent(
  input: AdminWebSyncEventInput,
): Promise<SyncWriteResult> {
  const clientEventId = buildAdminWebClientEventId(input.clientEventSeed);
  const metadata = {
    source: "admin_web",
    status: "success",
    ...(input.metadata ?? {}),
  } satisfies Record<string, Json>;
  const row = {
    changed_count: input.changedCount ?? 1,
    client_event_id: clientEventId,
    domain: input.domain,
    entity_ids: input.entityIds,
    event_type: input.eventType,
    metadata,
    owner_user_id: input.ownerUserId,
    shop_id: input.shopId,
    source: "admin_web",
    source_device_id: null,
  };

  const { error } = await input.supabase.from("sync_events").insert(row);

  if (!error || isDuplicateSyncEventError(error)) {
    return { ok: true };
  }

  if (isLegacySyncSchemaError(error)) {
    const legacyRow = omitShopId(row);
    const { error: legacyError } = await input.supabase
      .from("sync_events")
      .insert(legacyRow);

    if (!legacyError || isDuplicateSyncEventError(legacyError)) {
      return { ok: true };
    }
  }

  return { code: "db_failure", ok: false };
}

export async function emitCatalogMutationSyncEvent(input: {
  context: ReadyShopActionContext;
  entity: CatalogSyncEntity;
  operation: CatalogSyncOperation;
  result: ShopAdminActionResult;
}): Promise<SyncWriteResult> {
  if (!input.result.ok || input.result.code !== "success" || !input.result.targetId) {
    return { ok: true };
  }

  const supabase = adminClientForContext(input.context);

  if (!supabase) {
    return { code: "not_configured", ok: false };
  }

  const { data, error } = await loadCatalogSyncRow(
    supabase,
    input.entity,
    input.result.targetId,
  );

  if (error) {
    return { code: "db_failure", ok: false };
  }

  if (!data) {
    return { code: "not_found", ok: false };
  }

  const config = catalogEntityConfig[input.entity];
  const shopId = data.shop_id ?? input.context.selectedShop.shopId;

  return writeAdminWebSyncEvent({
    clientEventSeed: [
      "catalog",
      input.entity,
      input.operation,
      data.id,
      data.updated_at,
      data.deleted_at ?? "active",
    ].join(":"),
    domain: "catalog",
    entityIds: {
      [config.entityIdsKey]: [data.id],
    },
    eventType: syncEventTypeForCatalogOperation(input.operation),
    metadata: {
      actor_kind: actorKind(input.context),
      catalog_scope: data.shop_id ? "shop_scoped" : "legacy_owner_bridge",
      entity_type: input.entity,
      operation:
        input.operation === "archive" ? "tombstone" : input.operation,
      payload_version: 1,
    },
    ownerUserId: data.owner_user_id,
    shopId,
    supabase,
  });
}

export async function emitCatalogBulkProductImportSyncEvent(input: {
  context: ReadyShopActionContext;
  productIds: readonly string[];
}): Promise<SyncWriteResult> {
  const productIds = uniqueNonEmptyIds(input.productIds);

  if (productIds.length === 0) {
    return { ok: true };
  }

  const supabase = adminClientForContext(input.context);

  if (!supabase) {
    return { code: "not_configured", ok: false };
  }

  const { data, error } = await loadProductBulkSyncRows(supabase, productIds);

  if (error) {
    return { code: "db_failure", ok: false };
  }

  if (!data || data.length !== productIds.length) {
    return { code: "not_found", ok: false };
  }

  for (const rows of groupRowsByOwnerAndShop(
    data,
    input.context.selectedShop.shopId,
  ).values()) {
    const rowIds = rows.map((row) => row.id).sort();
    const rowVersions = rows
      .map((row) => `${row.id}:${row.updated_at}:${row.deleted_at ?? "active"}`)
      .sort();
    const representative = rows[0];

    const syncResult = await writeAdminWebSyncEvent({
      changedCount: rowIds.length,
      clientEventSeed: [
        "catalog",
        "product",
        "bulk_import",
        representative.owner_user_id,
        representative.shop_id ?? input.context.selectedShop.shopId,
        shortSyncDigest(rowVersions),
      ].join(":"),
      domain: "catalog",
      entityIds: {
        product_ids: rowIds,
      },
      eventType: "catalog_changed",
      metadata: {
        actor_kind: actorKind(input.context),
        catalog_scope: catalogScopeForRows(rows),
        entity_type: "product",
        operation: "bulk_import",
        payload_version: 1,
      },
      ownerUserId: representative.owner_user_id,
      shopId: representative.shop_id ?? input.context.selectedShop.shopId,
      supabase,
    });

    if (!syncResult.ok) {
      return syncResult;
    }
  }

  return { ok: true };
}

export async function emitPriceHistoryImportSyncEvent(input: {
  context: ReadyShopActionContext;
  priceIds: readonly string[];
}): Promise<SyncWriteResult> {
  const priceIds = uniqueNonEmptyIds(input.priceIds);

  if (priceIds.length === 0) {
    return { ok: true };
  }

  const supabase = adminClientForContext(input.context);

  if (!supabase) {
    return { code: "not_configured", ok: false };
  }

  const { data, error } = await loadPriceBulkSyncRows(supabase, priceIds);

  if (error) {
    return { code: "db_failure", ok: false };
  }

  if (!data || data.length !== priceIds.length) {
    return { code: "not_found", ok: false };
  }

  const seedTimestamp = new Date().toISOString();

  for (const rows of groupRowsByOwnerAndShop(
    data,
    input.context.selectedShop.shopId,
  ).values()) {
    const rowIds = rows.map((row) => row.id).sort();
    const productIds = uniqueNonEmptyIds(rows.map((row) => row.product_id));
    const rowVersions = rows
      .map((row) => `${row.id}:${row.product_id}:${row.created_at}:${row.effective_at}`)
      .sort();
    const representative = rows[0];

    const syncResult = await writeAdminWebSyncEvent({
      changedCount: rowIds.length,
      clientEventSeed: [
        "prices",
        "bulk_import",
        representative.owner_user_id,
        representative.shop_id ?? input.context.selectedShop.shopId,
        seedTimestamp,
        shortSyncDigest(rowVersions),
      ].join(":"),
      domain: "prices",
      entityIds: {
        price_ids: rowIds,
        product_ids: productIds,
      },
      eventType: "prices_changed",
      metadata: {
        actor_kind: actorKind(input.context),
        catalog_scope: catalogScopeForRows(rows),
        operation: "bulk_import",
        payload_version: 1,
        price_count: rowIds.length,
        product_count: productIds.length,
      },
      ownerUserId: representative.owner_user_id,
      shopId: representative.shop_id ?? input.context.selectedShop.shopId,
      supabase,
    });

    if (!syncResult.ok) {
      return syncResult;
    }
  }

  return { ok: true };
}
