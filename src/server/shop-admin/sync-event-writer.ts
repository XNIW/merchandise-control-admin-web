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
type SyncEventInsertOutcome =
  | { ok: true }
  | {
      error: unknown;
      ok: false;
    };

type CatalogSyncRow = Pick<
  Tables<"inventory_categories">,
  "deleted_at" | "id" | "owner_user_id" | "shop_id" | "updated_at"
>;
type LegacyCatalogSyncRow = Omit<CatalogSyncRow, "shop_id">;
type BulkProductSyncRow = Pick<
  Tables<"inventory_products">,
  "deleted_at" | "id" | "owner_user_id" | "shop_id" | "updated_at"
>;
type BulkPriceSyncRow = Pick<
  Tables<"inventory_product_prices">,
  "created_at" | "id" | "owner_user_id" | "product_id" | "shop_id"
>;

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

function catalogScopeForRow(row: { shop_id: string | null }) {
  return row.shop_id ? "shop_scoped" : "legacy_owner_bridge";
}

function buildAdminWebClientEventId(seed: string) {
  const digest = createHash("sha256").update(seed).digest("hex").slice(0, 48);

  return `admin_web:${digest}`;
}

function uniqueSorted(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
    .sort();
}

function* chunkRows<T>(rows: readonly T[], chunkSize: number) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    yield rows.slice(index, index + chunkSize);
  }
}

function isDuplicateSyncEventError(error: unknown) {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    (error as { code?: unknown }).code === "23505"
  );
}

function syncEventErrorCode(error: unknown) {
  return error && typeof error === "object"
    ? String((error as { code?: unknown }).code ?? "")
    : "";
}

function syncEventErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") {
    return 0;
  }

  const status = (error as { status?: unknown }).status;

  return typeof status === "number" ? status : 0;
}

function isRetryableSyncEventWriteError(error: unknown) {
  const code = syncEventErrorCode(error);
  const status = syncEventErrorStatus(error);

  return (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status >= 500 ||
    code === "08000" ||
    code === "08003" ||
    code === "08006" ||
    code === "40001" ||
    code === "40P01" ||
    code === "53300" ||
    code === "57P03"
  );
}

function isLegacySyncSchemaError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: unknown }).code;

  return code === "42703" || code === "PGRST204" || code === "PGRST205";
}

const SYNC_EVENT_WRITE_RETRY_DELAYS_MS = [0, 120, 360] as const;

async function waitForSyncEventRetry(attemptIndex: number) {
  const delayMs = SYNC_EVENT_WRITE_RETRY_DELAYS_MS[attemptIndex] ?? 0;

  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function actorKind(context: ReadyShopActionContext) {
  return context.principalKind;
}

async function insertSyncEventWithLegacyFallback(
  input: AdminWebSyncEventInput,
  row: {
    changed_count: number;
    client_event_id: string;
    domain: AdminWebSyncDomain;
    entity_ids: Json;
    event_type: AdminWebSyncEventType;
    metadata: Record<string, Json>;
    owner_user_id: string;
    shop_id: string | null;
    source: "admin_web";
    source_device_id: null;
  },
): Promise<SyncEventInsertOutcome> {
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

    return { error: legacyError, ok: false };
  }

  return { error, ok: false };
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
    source: "admin_web" as const,
    source_device_id: null,
  };

  let lastError: unknown = null;

  for (const attemptIndex of SYNC_EVENT_WRITE_RETRY_DELAYS_MS.keys()) {
    await waitForSyncEventRetry(attemptIndex);

    const outcome = await insertSyncEventWithLegacyFallback(input, row);

    if (outcome.ok) {
      return { ok: true };
    }

    lastError = outcome.error;

    if (!isRetryableSyncEventWriteError(outcome.error)) {
      break;
    }
  }

  if (lastError && isDuplicateSyncEventError(lastError)) {
    return { ok: true };
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
      catalog_scope: catalogScopeForRow(data),
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
  const productIds = uniqueSorted(input.productIds);

  if (productIds.length === 0) {
    return { ok: true };
  }

  const supabase = adminClientForContext(input.context);

  if (!supabase) {
    return { code: "not_configured", ok: false };
  }

  const { data, error } = await supabase
    .from("inventory_products")
    .select("id,owner_user_id,shop_id,updated_at,deleted_at")
    .in("id", productIds)
    .limit(productIds.length)
    .returns<BulkProductSyncRow[]>();

  if (error) {
    return { code: "db_failure", ok: false };
  }

  const rows = data ?? [];

  if (rows.length !== productIds.length) {
    return { code: "not_found", ok: false };
  }

  const groups = new Map<
    string,
    {
      ownerUserId: string;
      rows: BulkProductSyncRow[];
      scope: "legacy_owner_bridge" | "shop_scoped";
      shopId: string;
    }
  >();

  for (const row of rows) {
    const scope = catalogScopeForRow(row);
    const shopId = row.shop_id ?? input.context.selectedShop.shopId;
    const key = [row.owner_user_id, shopId, scope].join(":");
    const group = groups.get(key);

    if (group) {
      group.rows.push(row);
      continue;
    }

    groups.set(key, {
      ownerUserId: row.owner_user_id,
      rows: [row],
      scope,
      shopId,
    });
  }

  for (const group of groups.values()) {
    const sortedProductIds = group.rows.map((row) => row.id).sort();
    const latestUpdatedAt = group.rows
      .map((row) => row.updated_at)
      .sort()
      .at(-1);
    const result = await writeAdminWebSyncEvent({
      changedCount: sortedProductIds.length,
      clientEventSeed: [
        "catalog",
        "product",
        "bulk_import",
        group.ownerUserId,
        group.shopId,
        group.scope,
        latestUpdatedAt ?? "unknown",
        ...sortedProductIds,
      ].join(":"),
      domain: "catalog",
      entityIds: {
        product_ids: sortedProductIds,
      },
      eventType: "catalog_changed",
      metadata: {
        actor_kind: actorKind(input.context),
        catalog_scope: group.scope,
        entity_type: "product",
        operation: "bulk_import",
        payload_version: 1,
      },
      ownerUserId: group.ownerUserId,
      shopId: group.shopId,
      supabase,
    });

    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

const PRICE_SYNC_EVENT_CHUNK_SIZE = 100;

export async function emitPriceHistoryImportSyncEvent(input: {
  context: ReadyShopActionContext;
  priceIds: readonly string[];
}): Promise<SyncWriteResult> {
  const priceIds = uniqueSorted(input.priceIds);

  if (priceIds.length === 0) {
    return { ok: true };
  }

  const supabase = adminClientForContext(input.context);

  if (!supabase) {
    return { code: "not_configured", ok: false };
  }

  for (const priceIdChunk of chunkRows(priceIds, PRICE_SYNC_EVENT_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("inventory_product_prices")
      .select("id,owner_user_id,shop_id,product_id,created_at")
      .in("id", priceIdChunk)
      .limit(priceIdChunk.length)
      .returns<BulkPriceSyncRow[]>();

    if (error) {
      return { code: "db_failure", ok: false };
    }

    const rows = data ?? [];

    if (rows.length !== priceIdChunk.length) {
      return { code: "not_found", ok: false };
    }

    const groups = new Map<
      string,
      {
        ownerUserId: string;
        rows: BulkPriceSyncRow[];
        scope: "legacy_owner_bridge" | "shop_scoped";
        shopId: string;
      }
    >();

    for (const row of rows) {
      const scope = catalogScopeForRow(row);
      const shopId = row.shop_id ?? input.context.selectedShop.shopId;
      const key = [row.owner_user_id, shopId, scope].join(":");
      const group = groups.get(key);

      if (group) {
        group.rows.push(row);
        continue;
      }

      groups.set(key, {
        ownerUserId: row.owner_user_id,
        rows: [row],
        scope,
        shopId,
      });
    }

    for (const group of groups.values()) {
      const sortedPriceIds = uniqueSorted(group.rows.map((row) => row.id));
      const sortedProductIds = uniqueSorted(
        group.rows.map((row) => row.product_id),
      );
      const latestCreatedAt = group.rows
        .map((row) => row.created_at)
        .sort()
        .at(-1);
      const result = await writeAdminWebSyncEvent({
        changedCount: sortedPriceIds.length,
        clientEventSeed: [
          "prices",
          "price_history",
          "workbook_import",
          group.ownerUserId,
          group.shopId,
          group.scope,
          latestCreatedAt ?? "unknown",
          ...sortedPriceIds,
        ].join(":"),
        domain: "prices",
        entityIds: {
          price_ids: sortedPriceIds,
          product_ids: sortedProductIds,
        },
        eventType: "prices_changed",
        metadata: {
          actor_kind: actorKind(input.context),
          catalog_scope: group.scope,
          entity_type: "price_history",
          operation: "workbook_import",
          payload_version: 1,
        },
        ownerUserId: group.ownerUserId,
        shopId: group.shopId,
        supabase,
      });

      if (!result.ok) {
        return result;
      }
    }
  }

  return { ok: true };
}
