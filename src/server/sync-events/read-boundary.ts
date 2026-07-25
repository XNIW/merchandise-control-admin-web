import "server-only";

import type { Json } from "@/lib/supabase/database.types";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import {
  canonicalPostgresUuid,
  isCanonicalPostgresUuid,
} from "@/server/shared/postgres-uuid";

export type SafeSyncEventRow = {
  authorizedShopId: string | null;
  batchId: string | null;
  changedCount: number;
  clientEventKey: string | null;
  createdAt: string;
  domain: string;
  entityIds: Json | null;
  eventId: string;
  eventType: string;
  expiresAt: string | null;
  metadata: Json;
  ownerUserId: string;
  registeredShopDeviceId: string | null;
  requiresFullRecovery: boolean;
  shopId: string | null;
  source: string;
  sourceDeviceKey: string | null;
  sourceScope: "legacy_owner_bridge" | "shop_scoped";
  storeId: string | null;
};

export type AdminSyncEventRead = {
  eventMarker: string;
  maxId: string | null;
  rows: readonly SafeSyncEventRow[];
  scope: {
    kind:
      | "authorized_shop_plus_legacy"
      | "platform_global"
      | "shop_scoped";
    ownerUserId: string | null;
    mappedLegacyOwnerUserId: string | null;
    shopId: string | null;
  };
  totalCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nullableString(value: unknown) {
  return value === null || typeof value === "string" ? value : undefined;
}

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const BIGINT_PATTERN = /^(?:0|[1-9][0-9]{0,18})$/;
const MAX_BIGINT = BigInt("9223372036854775807");
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const SUPPORTED_DOMAINS = ["catalog", "history", "prices"] as const;
const SUPPORTED_SOURCES = new Set([
  "admin_web",
  "android",
  "database_atomic",
  "ios",
  "pos_catalog_import_sync",
  "product_image_api",
  "supplier_excel",
]);

type NormalizedReadInput = {
  domains: (typeof SUPPORTED_DOMAINS)[number][] | null;
  eventId: string | null;
  limit: number;
  ownerUserId: string | null;
  shopId: string | null;
};

function canonicalUuid(value: unknown) {
  return canonicalPostgresUuid(value);
}

function canonicalPositiveBigint(value: unknown) {
  if (
    typeof value !== "string" ||
    !BIGINT_PATTERN.test(value) ||
    value === "0"
  ) {
    return null;
  }
  return BigInt(value) <= MAX_BIGINT ? value : null;
}

function canonicalTimestamp(value: unknown) {
  return (
    typeof value === "string" &&
    TIMESTAMP_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function hasCompleteCanonicalEntityIds(
  domain: (typeof SUPPORTED_DOMAINS)[number],
  changedCount: number,
  value: unknown,
) {
  if (value === null) {
    return changedCount === 0;
  }
  if (!isRecord(value)) {
    return false;
  }

  const allowedKeys =
    domain === "catalog"
      ? ["supplier_ids", "category_ids", "product_ids"]
      : domain === "prices"
        ? ["price_ids", "product_ids"]
        : ["session_ids"];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    return false;
  }

  const arrays = new Map<string, readonly string[]>();
  for (const key of allowedKeys) {
    const raw = value[key];
    if (raw === undefined) continue;
    if (
      !Array.isArray(raw) ||
      !raw.every(
        (id): id is string =>
          typeof id === "string" &&
          isCanonicalPostgresUuid(id),
      ) ||
      new Set(raw).size !== raw.length
    ) {
      return false;
    }
    arrays.set(key, raw);
  }

  const primaryCount =
    domain === "catalog"
      ? ["supplier_ids", "category_ids", "product_ids"].reduce(
          (count, key) => count + (arrays.get(key)?.length ?? 0),
          0,
        )
      : arrays.get(domain === "prices" ? "price_ids" : "session_ids")
          ?.length ?? 0;
  if (primaryCount !== changedCount) {
    return false;
  }
  if (domain !== "prices") {
    return true;
  }

  const productCount = arrays.get("product_ids")?.length ?? 0;
  return changedCount === 0
    ? productCount === 0
    : productCount >= 1 && productCount <= changedCount;
}

function parseRow(
  value: unknown,
  expected: NormalizedReadInput,
): SafeSyncEventRow | null {
  if (!isRecord(value)) {
    return null;
  }

  const authorizedShopId = nullableString(value.authorized_shop_id);
  const batchId = nullableString(value.batch_id);
  const clientEventKey = nullableString(value.client_event_key);
  const expiresAt = nullableString(value.expires_at);
  const registeredShopDeviceId = nullableString(
    value.registered_shop_device_id,
  );
  const shopId = nullableString(value.shop_id);
  const sourceDeviceKey = nullableString(value.source_device_key);
  const storeId = nullableString(value.store_id);
  const createdAt =
    typeof value.created_at === "string" ? value.created_at : null;
  const eventId = canonicalPositiveBigint(value.id);
  const ownerUserId = canonicalUuid(value.owner_user_id);
  const normalizedAuthorizedShopId =
    authorizedShopId === null ? null : canonicalUuid(authorizedShopId);
  const normalizedShopId = shopId === null ? null : canonicalUuid(shopId);
  const normalizedBatchId = batchId === null ? null : canonicalUuid(batchId);
  const normalizedRegisteredDeviceId =
    registeredShopDeviceId === null
      ? null
      : canonicalUuid(registeredShopDeviceId);
  const normalizedStoreId = storeId === null ? null : canonicalUuid(storeId);
  const supportedEventType =
    (value.domain === "catalog" &&
      (value.event_type === "catalog_changed" ||
        value.event_type === "catalog_tombstone")) ||
    (value.domain === "prices" && value.event_type === "prices_changed") ||
    (value.domain === "history" &&
      (value.event_type === "history_changed" ||
        value.event_type === "history_tombstone"));
  const unsupportedSentinel =
    value.domain === "unsupported" &&
    value.event_type === "unsupported" &&
    value.source === "other" &&
    value.entity_ids === null &&
    isRecord(value.metadata) &&
    Object.keys(value.metadata).length === 0 &&
    value.requires_full_recovery === true;
  const supportedDomain = SUPPORTED_DOMAINS.includes(
    value.domain as (typeof SUPPORTED_DOMAINS)[number],
  )
    ? (value.domain as (typeof SUPPORTED_DOMAINS)[number])
    : null;

  if (
    authorizedShopId === undefined ||
    batchId === undefined ||
    clientEventKey === undefined ||
    expiresAt === undefined ||
    registeredShopDeviceId === undefined ||
    shopId === undefined ||
    sourceDeviceKey === undefined ||
    storeId === undefined ||
    eventId === null ||
    ownerUserId === null ||
    (authorizedShopId !== null && normalizedAuthorizedShopId === null) ||
    (shopId !== null && normalizedShopId === null) ||
    (batchId !== null && normalizedBatchId === null) ||
    (registeredShopDeviceId !== null && normalizedRegisteredDeviceId === null) ||
    (storeId !== null && normalizedStoreId === null) ||
    (clientEventKey !== null && !HASH_PATTERN.test(clientEventKey)) ||
    (sourceDeviceKey !== null && !HASH_PATTERN.test(sourceDeviceKey)) ||
    (!supportedEventType && !unsupportedSentinel) ||
    (supportedEventType && !SUPPORTED_SOURCES.has(String(value.source))) ||
    (expected.domains !== null &&
      value.domain !== "unsupported" &&
      !expected.domains.includes(
        value.domain as (typeof SUPPORTED_DOMAINS)[number],
      )) ||
    (expected.eventId !== null && eventId !== expected.eventId) ||
    (expected.ownerUserId !== null && ownerUserId !== expected.ownerUserId) ||
    (expected.shopId !== null &&
      (normalizedAuthorizedShopId !== expected.shopId ||
        (normalizedShopId !== expected.shopId && normalizedShopId !== null))) ||
    (expected.shopId === null &&
      normalizedAuthorizedShopId !== normalizedShopId) ||
    typeof value.domain !== "string" ||
    typeof value.event_type !== "string" ||
    typeof value.source !== "string" ||
    (value.source_scope !== "shop_scoped" &&
      value.source_scope !== "legacy_owner_bridge") ||
    typeof value.changed_count !== "number" ||
    !Number.isSafeInteger(value.changed_count) ||
    value.changed_count < 0 ||
    typeof value.requires_full_recovery !== "boolean" ||
    typeof value.timestamp_valid !== "boolean" ||
    createdAt === null ||
    !canonicalTimestamp(createdAt) ||
    (expiresAt !== null && !canonicalTimestamp(expiresAt)) ||
    !isRecord(value.metadata) ||
    (value.entity_ids !== null && !isRecord(value.entity_ids)) ||
    (value.requires_full_recovery === true && value.entity_ids !== null) ||
    (value.timestamp_valid === false &&
      value.requires_full_recovery !== true) ||
    (supportedEventType &&
      value.requires_full_recovery === false &&
      (supportedDomain === null ||
        !hasCompleteCanonicalEntityIds(
          supportedDomain,
          value.changed_count,
          value.entity_ids,
        ))) ||
    (normalizedShopId === null && value.source_scope !== "legacy_owner_bridge") ||
    (normalizedShopId !== null && value.source_scope !== "shop_scoped")
  ) {
    return null;
  }

  return {
    authorizedShopId: normalizedAuthorizedShopId,
    batchId: normalizedBatchId,
    changedCount: value.changed_count,
    clientEventKey,
    createdAt,
    domain: value.domain,
    entityIds: (value.entity_ids ?? null) as Json | null,
    eventId,
    eventType: value.event_type,
    expiresAt,
    metadata: value.metadata as Json,
    ownerUserId,
    registeredShopDeviceId: normalizedRegisteredDeviceId,
    requiresFullRecovery: value.requires_full_recovery,
    shopId: normalizedShopId,
    source: value.source,
    sourceDeviceKey,
    sourceScope: value.source_scope,
    storeId: normalizedStoreId,
  };
}

function parseEnvelope(
  value: unknown,
  expected: NormalizedReadInput,
): AdminSyncEventRead | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== "admin-sync-event-read-v1" ||
    !isRecord(value.scope) ||
    !Array.isArray(value.rows) ||
    typeof value.eventMarker !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.eventMarker) ||
    typeof value.totalCount !== "number" ||
    !Number.isSafeInteger(value.totalCount) ||
    value.totalCount < 0
  ) {
    return null;
  }

  const maxId = nullableString(value.maxId);
  const rawOwnerUserId = nullableString(value.scope.ownerUserId);
  const rawMappedLegacyOwnerUserId = nullableString(
    value.scope.mappedLegacyOwnerUserId,
  );
  const rawShopId = nullableString(value.scope.shopId);
  const ownerUserId =
    rawOwnerUserId === null ? null : canonicalUuid(rawOwnerUserId);
  const shopId = rawShopId === null ? null : canonicalUuid(rawShopId);
  const mappedLegacyOwnerUserId =
    rawMappedLegacyOwnerUserId === null
      ? null
      : canonicalUuid(rawMappedLegacyOwnerUserId);
  const kind = value.scope.kind;
  const rows = value.rows.map((row) => parseRow(row, expected));
  const payloadBytes = value.payloadBytes;
  const maxResponseBytes = value.maxResponseBytes;
  const parsedMaxId = maxId === null ? null : canonicalPositiveBigint(maxId);
  const parsedRows = rows.filter((row): row is SafeSyncEventRow => row !== null);
  const rowIds = parsedRows.map((row) => row.eventId);
  const maxRowId = rowIds.length > 0
    ? rowIds.reduce((left, right) =>
        BigInt(left) > BigInt(right) ? left : right,
      )
    : null;

  if (
    maxId === undefined ||
    (maxId !== null && parsedMaxId === null) ||
    rawOwnerUserId === undefined ||
    (rawOwnerUserId !== null && ownerUserId === null) ||
    rawShopId === undefined ||
    (rawShopId !== null && shopId === null) ||
    rawMappedLegacyOwnerUserId === undefined ||
    (rawMappedLegacyOwnerUserId !== null &&
      mappedLegacyOwnerUserId === null) ||
    (kind !== "authorized_shop_plus_legacy" &&
      kind !== "platform_global" &&
      kind !== "shop_scoped") ||
    (expected.shopId === null && kind !== "platform_global") ||
    (expected.shopId !== null && kind === "platform_global") ||
    shopId !== expected.shopId ||
    ownerUserId !== expected.ownerUserId ||
    (kind === "authorized_shop_plus_legacy" &&
      mappedLegacyOwnerUserId === null) ||
    (kind !== "authorized_shop_plus_legacy" &&
      mappedLegacyOwnerUserId !== null) ||
    (kind === "authorized_shop_plus_legacy" &&
      parsedRows.some(
        (row) =>
          row.sourceScope === "legacy_owner_bridge" &&
          row.ownerUserId !== mappedLegacyOwnerUserId,
      )) ||
    (kind === "shop_scoped" &&
      parsedRows.some((row) => row.sourceScope === "legacy_owner_bridge")) ||
    rows.some((row) => row === null) ||
    parsedRows.length > expected.limit ||
    parsedRows.length > value.totalCount ||
    new Set(rowIds).size !== rowIds.length ||
    (value.totalCount === 0 && (parsedRows.length !== 0 || parsedMaxId !== null)) ||
    (value.totalCount > 0 && (parsedRows.length === 0 || parsedMaxId === null)) ||
    (parsedMaxId !== null && maxRowId !== null &&
      BigInt(parsedMaxId) < BigInt(maxRowId)) ||
    (expected.eventId !== null &&
      (value.totalCount > 1 ||
        (value.totalCount === 1 && parsedMaxId !== expected.eventId))) ||
    typeof payloadBytes !== "number" ||
    !Number.isSafeInteger(payloadBytes) ||
    payloadBytes < 0 ||
    maxResponseBytes !== 4_194_304 ||
    payloadBytes > maxResponseBytes
  ) {
    return null;
  }

  return {
    eventMarker: value.eventMarker,
    maxId: parsedMaxId,
    rows: parsedRows,
    scope: { kind, mappedLegacyOwnerUserId, ownerUserId, shopId },
    totalCount: value.totalCount,
  };
}

export async function readSafeSyncEvents(
  supabase: SupabaseServerClient,
  input: {
    domains?: readonly ("catalog" | "history" | "prices")[];
    eventId?: string;
    limit?: number;
    ownerUserId?: string;
    shopId?: string;
  },
) {
  const domains = input.domains;
  const eventId = input.eventId === undefined
    ? null
    : canonicalPositiveBigint(input.eventId);
  const limit = input.limit ?? 100;
  const ownerUserId = input.ownerUserId === undefined
    ? null
    : canonicalUuid(input.ownerUserId);
  const shopId = input.shopId === undefined
    ? null
    : canonicalUuid(input.shopId);
  const domainsAreValid =
    domains === undefined ||
    (Array.isArray(domains) &&
      domains.length >= 1 &&
      domains.length <= SUPPORTED_DOMAINS.length &&
      domains.every((domain) => SUPPORTED_DOMAINS.includes(domain)) &&
      new Set(domains).size === domains.length);

  if (
    !domainsAreValid ||
    (input.eventId !== undefined && eventId === null) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 300 ||
    (input.ownerUserId !== undefined && ownerUserId === null) ||
    (input.shopId !== undefined && shopId === null)
  ) {
    return { data: null, error: "sync_event_read_input_invalid" } as const;
  }
  const normalized: NormalizedReadInput = {
    domains: domains ? [...domains] : null,
    eventId,
    limit,
    ownerUserId,
    shopId,
  };

  const { data, error } = await supabase.rpc("admin_sync_event_read_v1", {
    p_domains: normalized.domains,
    p_event_id: normalized.eventId,
    p_limit: normalized.limit,
    p_owner_user_id: normalized.ownerUserId,
    p_shop_id: normalized.shopId,
  });

  if (error) {
    return { data: null, error: "sync_event_read_failed" } as const;
  }

  const parsed = parseEnvelope(data, normalized);
  return parsed
    ? ({ data: parsed, error: null } as const)
    : ({ data: null, error: "sync_event_read_contract_invalid" } as const);
}
