import "server-only";

import type { SupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
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
  | "prices_changed";

export type CatalogSyncEntity = "category" | "product" | "supplier";
export type CatalogSyncOperation = "archive" | "create" | "restore" | "update";

type SyncWriteResult =
  | { ok: true }
  | {
      code: "not_configured" | "db_failure" | "not_found";
      ok: false;
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

/**
 * Compatibility acknowledgement for legacy call sites.
 *
 * Catalog, price and history row mutations are published by statement-level
 * database triggers in the same transaction. A second post-write RPC would
 * duplicate the event and could turn a committed staff mutation into a false
 * UI failure because that maintenance RPC is intentionally service-only.
 */
export async function writeAdminWebSyncEvent(
  input: AdminWebSyncEventInput,
): Promise<SyncWriteResult> {
  void input;
  return { ok: true };
}

export async function emitCatalogMutationSyncEvent(input: {
  context: ReadyShopActionContext;
  entity: CatalogSyncEntity;
  operation: CatalogSyncOperation;
  result: ShopAdminActionResult;
}): Promise<SyncWriteResult> {
  void input;
  return { ok: true };
}

export async function emitCatalogBulkProductImportSyncEvent(input: {
  context: ReadyShopActionContext;
  productIds: readonly string[];
}): Promise<SyncWriteResult> {
  void input;
  return { ok: true };
}

export async function emitPriceHistoryImportSyncEvent(input: {
  context: ReadyShopActionContext;
  priceIds: readonly string[];
}): Promise<SyncWriteResult> {
  void input;
  return { ok: true };
}
