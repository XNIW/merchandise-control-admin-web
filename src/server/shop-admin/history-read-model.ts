import "server-only";

import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { resolveShopAdminDataAccess } from "./data-access";
import type { ShopAdminShellShop } from "./shop-access";
import type {
  ShopAdminReadModelError,
  ShopAdminReadModelStatus,
} from "./read-model";

type InventorySourceRow = Pick<
  Tables<"shop_inventory_sources">,
  | "shop_inventory_source_id"
  | "shop_id"
  | "owner_user_id"
  | "mapping_state"
  | "source_kind"
>;
type SyncEventRow = Pick<
  Tables<"sync_events">,
  | "id"
  | "shop_id"
  | "domain"
  | "event_type"
  | "source"
  | "source_device_id"
  | "changed_count"
  | "entity_ids"
  | "metadata"
  | "created_at"
>;
type SyncEventDetailRow = Pick<
  Tables<"sync_events">,
  | "id"
  | "shop_id"
  | "batch_id"
  | "client_event_id"
  | "store_id"
  | "domain"
  | "event_type"
  | "source"
  | "source_device_id"
  | "changed_count"
  | "entity_ids"
  | "metadata"
  | "created_at"
  | "expires_at"
>;
type SharedSheetSessionRow = Pick<
  Tables<"shared_sheet_sessions">,
  | "remote_id"
  | "shop_id"
  | "display_name"
  | "supplier"
  | "category"
  | "timestamp"
  | "updated_at"
  | "deleted_at"
  | "payload_version"
  | "data"
  | "session_overlay"
>;
type SharedSheetSessionDetailRow = Pick<
  Tables<"shared_sheet_sessions">,
  | "remote_id"
  | "shop_id"
  | "display_name"
  | "supplier"
  | "category"
  | "timestamp"
  | "updated_at"
  | "deleted_at"
  | "payload_version"
  | "data"
  | "session_overlay"
  | "is_manual_entry"
>;

export type ShopHistoryReadModelStatus =
  | ShopAdminReadModelStatus
  | "unmapped";

export type ShopHistoryMapping = {
  mappingId: string;
  ownerUserId: string;
  sourceKind: string;
};

export type ShopSyncEventActivity = {
  eventId: string;
  domain: string;
  eventType: string;
  status: "pending" | "success" | "failed";
  source: string | null;
  sourceDeviceId: string | null;
  changedCount: number;
  entitySummary: string;
  metadataSummary: string;
  createdAt: string;
};

export type ShopHistorySession = {
  remoteId: string;
  displayName: string;
  supplier: string;
  category: string;
  timestamp: string;
  updatedAt: string;
  deletedAt: string | null;
  payloadVersion: number;
  dataSummary: string;
  overlaySummary: string;
};

export type ShopHistoryReadModel = {
  status: ShopHistoryReadModelStatus;
  selectedShop: ShopAdminShellShop | null;
  mapping: ShopHistoryMapping | null;
  syncEvents: readonly ShopSyncEventActivity[];
  sessions: readonly ShopHistorySession[];
  readOnly: true;
  source: "supabase_server";
  reason: string;
  error?: ShopAdminReadModelError;
};

export type ShopHistoryDetailStatus =
  | ShopHistoryReadModelStatus
  | "not_found"
  | "invalid_entry";

export type ShopHistoryDetailField = {
  key: string;
  label: string;
  value: string;
};

export type ShopHistoryDetail = {
  entryId: string;
  kind: "sync_event" | "shared_sheet_session";
  title: string;
  source: string;
  sourceDeviceId: string | null;
  eventType: string;
  tableSummary: string;
  recordCount: number;
  payloadSummary: string;
  rawJsonPreview: string;
  createdAt: string;
  fields: readonly ShopHistoryDetailField[];
};

export type ShopHistoryDetailReadModel = {
  status: ShopHistoryDetailStatus;
  selectedShop: ShopAdminShellShop | null;
  mapping: ShopHistoryMapping | null;
  detail: ShopHistoryDetail | null;
  readOnly: true;
  source: "supabase_server";
  reason: string;
  error?: ShopAdminReadModelError;
};

type GetShopHistoryReadModelOptions = {
  client?: SupabaseServerClient | null;
  requestedShopId?: string | null;
};

const emptyRows = {
  selectedShop: null,
  mapping: null,
  syncEvents: [],
  sessions: [],
} as const;

const emptyDetail = {
  selectedShop: null,
  mapping: null,
  detail: null,
} as const;

function redactHistoryReadModelError(error: unknown): ShopAdminReadModelError {
  const code =
    error instanceof Error && error.name ? error.name : "history_read_error";

  return {
    code,
    message: "Shop mobile history read model could not be loaded.",
  };
}

function mapMapping(row: InventorySourceRow): ShopHistoryMapping | null {
  if (!row.owner_user_id) {
    return null;
  }

  return {
    mappingId: row.shop_inventory_source_id,
    ownerUserId: row.owner_user_id,
    sourceKind: row.source_kind,
  };
}

function isSensitiveJsonKey(key: string) {
  const normalized = key.toLowerCase();

  return [
    "token",
    "secret",
    "password",
    "pin",
    "hash",
    "credential",
    "auth",
    "email",
    "path",
    "file",
    "excel",
    "workbook",
  ].some((part) => normalized.includes(part));
}

export function redactShopAdminJson(value: Json): Json {
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactShopAdminJson(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const safeItem = item ?? null;
        const isSensitive = isSensitiveJsonKey(key);

        return [
          isSensitive ? "redacted" : key,
          isSensitive ? "[redacted]" : redactShopAdminJson(safeItem),
        ];
      }),
    );
  }

  return value;
}

function summarizeJson(value: Json | null) {
  if (value === null) {
    return "None";
  }

  const redacted = redactShopAdminJson(value);

  if (Array.isArray(redacted)) {
    return `${redacted.length} array items`;
  }

  if (redacted && typeof redacted === "object") {
    return `${Object.keys(redacted).length} object keys`;
  }

  return String(redacted);
}

function inferSyncStatus(
  metadata: Json | null,
  eventType: string,
): ShopSyncEventActivity["status"] {
  if (eventType.toLowerCase().includes("pending")) {
    return "pending";
  }

  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const metadataObject = metadata as Record<string, Json>;
    const statusValue = metadataObject.status;

    if (
      statusValue === "pending" ||
      statusValue === "success" ||
      statusValue === "failed"
    ) {
      return statusValue;
    }

    if (
      Object.keys(metadataObject).some((key) =>
        ["error", "errors", "failure", "failures"].some((part) =>
          key.toLowerCase().includes(part),
        ),
      )
    ) {
      return "failed";
    }
  }

  return "success";
}

export function stringifyRedactedJson(value: Json | null, maxLength = 900) {
  if (value === null) {
    return "None";
  }

  const rendered = JSON.stringify(redactShopAdminJson(value));

  if (rendered.length <= maxLength) {
    return rendered;
  }

  return `${rendered.slice(0, maxLength)}... [truncated]`;
}

function mapSyncEvent(row: SyncEventRow): ShopSyncEventActivity {
  return {
    eventId: String(row.id),
    domain: row.domain,
    eventType: row.event_type,
    status: inferSyncStatus(row.metadata, row.event_type),
    source: row.source,
    sourceDeviceId: row.source_device_id,
    changedCount: row.changed_count,
    entitySummary: summarizeJson(row.entity_ids),
    metadataSummary: summarizeJson(row.metadata),
    createdAt: row.created_at,
  };
}

function mapSession(row: SharedSheetSessionRow): ShopHistorySession {
  return {
    remoteId: row.remote_id,
    displayName: row.display_name,
    supplier: row.supplier,
    category: row.category,
    timestamp: row.timestamp,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    payloadVersion: row.payload_version,
    dataSummary: summarizeJson(row.data),
    overlaySummary: summarizeJson(row.session_overlay),
  };
}

function mergeRowsByKey<Row>(
  directRows: readonly Row[],
  legacyRows: readonly Row[],
  getKey: (row: Row) => string,
) {
  const rows = [...directRows];
  const seen = new Set(rows.map(getKey));

  for (const row of legacyRows) {
    const key = getKey(row);

    if (!seen.has(key)) {
      rows.push(row);
      seen.add(key);
    }
  }

  return rows;
}

async function resolveHistorySourceState(
  supabase: SupabaseServerClient,
  selectedShop: ShopAdminShellShop,
) {
  const sourcesResult = await supabase
    .from("shop_inventory_sources")
    .select("shop_inventory_source_id,shop_id,owner_user_id,mapping_state,source_kind")
    .eq("shop_id", selectedShop.shopId)
    .is("disabled_at", null)
    .order("created_at", { ascending: false });

  if (sourcesResult.error) {
    return { error: sourcesResult.error };
  }

  const sources = (sourcesResult.data ?? []) as InventorySourceRow[];
  const mappedSource =
    sources.find(
      (source) =>
        source.mapping_state === "mapped" && Boolean(source.owner_user_id),
    ) ?? null;
  const blockingSource =
    sources.find((source) => source.mapping_state !== "mapped") ?? null;

  return {
    blockingSource,
    error: null,
    legacyOwnerUserId: mappedSource?.owner_user_id ?? null,
    mapping: mappedSource ? mapMapping(mappedSource) : null,
  };
}

type ParsedHistoryEntry =
  | {
      kind: "sync_event";
      value: number;
    }
  | {
      kind: "shared_sheet_session";
      value: string;
    }
  | {
      kind: "invalid";
      value: string;
    };

export function parseHistoryEntryId(entryId: string): ParsedHistoryEntry {
  let normalized: string;

  try {
    normalized = decodeURIComponent(entryId).trim();
  } catch {
    return { kind: "invalid", value: "" };
  }

  if (normalized.startsWith("sync:")) {
    const numericId = Number(normalized.slice("sync:".length));

    if (Number.isSafeInteger(numericId) && numericId > 0) {
      return { kind: "sync_event", value: numericId };
    }
  }

  if (normalized.startsWith("session:")) {
    const remoteId = normalized.slice("session:".length).trim();

    if (remoteId.length > 0 && remoteId.length <= 160) {
      return { kind: "shared_sheet_session", value: remoteId };
    }
  }

  return { kind: "invalid", value: normalized };
}

function detailField(
  key: string,
  label: string,
  value: string | number | boolean | null | undefined,
): ShopHistoryDetailField {
  return {
    key,
    label,
    value:
      value === null || value === undefined || value === ""
        ? "Not set"
        : String(value),
  };
}

function summarizeSyncErrors(metadata: Json) {
  const redacted = redactShopAdminJson(metadata);

  if (!redacted || typeof redacted !== "object" || Array.isArray(redacted)) {
    return "None";
  }

  const errorKeys = Object.keys(redacted).filter((key) =>
    ["error", "errors", "failure", "failures"].some((part) =>
      key.toLowerCase().includes(part),
    ),
  );

  return errorKeys.length > 0 ? errorKeys.join(", ") : "None";
}

function mapSyncEventDetail(row: SyncEventDetailRow): ShopHistoryDetail {
  const payloadSummary = `${summarizeJson(row.entity_ids)}; ${summarizeJson(
    row.metadata,
  )}`;
  const rawJsonPreview = stringifyRedactedJson({
    entity_ids: row.entity_ids,
    metadata: row.metadata,
  });

  return {
    entryId: `sync:${row.id}`,
    kind: "sync_event",
    title: `${row.domain}:${row.event_type}`,
    source: row.source ?? "Unknown",
    sourceDeviceId: row.source_device_id,
    eventType: row.event_type,
    tableSummary: row.domain,
    recordCount: row.changed_count,
    payloadSummary,
    rawJsonPreview,
    createdAt: row.created_at,
    fields: [
      detailField("entry", "Entry", `sync:${row.id}`),
      detailField("type", "Type", "Sync event"),
      detailField("domain", "Domain", row.domain),
      detailField("event", "Event type", row.event_type),
      detailField("source", "Source", row.source),
      detailField("device", "Device", row.source_device_id),
      detailField("store", "Store", row.store_id),
      detailField("batch", "Batch", row.batch_id),
      detailField("client", "Client event", row.client_event_id),
      detailField("records", "Record count", row.changed_count),
      detailField("tables", "Tables involved", row.domain),
      detailField("payload", "Payload summary", payloadSummary),
      detailField("errors", "Sync errors", summarizeSyncErrors(row.metadata)),
      detailField("raw", "Redacted JSON", rawJsonPreview),
      detailField("created", "Created", row.created_at),
      detailField("expires", "Expires", row.expires_at),
    ],
  };
}

function mapSessionDetail(row: SharedSheetSessionDetailRow): ShopHistoryDetail {
  const payloadSummary = `${summarizeJson(row.data)}; ${summarizeJson(
    row.session_overlay,
  )}`;
  const rawJsonPreview = stringifyRedactedJson({
    data: row.data,
    session_overlay: row.session_overlay,
  });

  return {
    entryId: `session:${row.remote_id}`,
    kind: "shared_sheet_session",
    title: row.display_name,
    source: [row.supplier, row.category].filter(Boolean).join(" / ") || "Unknown",
    sourceDeviceId: null,
    eventType: row.deleted_at ? "history_tombstone" : "history_session",
    tableSummary: "shared_sheet_sessions",
    recordCount: 1,
    payloadSummary,
    rawJsonPreview,
    createdAt: row.timestamp,
    fields: [
      detailField("entry", "Entry", `session:${row.remote_id}`),
      detailField("type", "Type", row.deleted_at ? "History tombstone" : "History session"),
      detailField("display", "Display name", row.display_name),
      detailField("supplier", "Supplier", row.supplier),
      detailField("category", "Category", row.category),
      detailField("manual", "Manual entry", row.is_manual_entry),
      detailField("version", "Payload version", row.payload_version),
      detailField("records", "Record count", 1),
      detailField("tables", "Tables involved", "shared_sheet_sessions"),
      detailField("payload", "Payload summary", payloadSummary),
      detailField("raw", "Redacted JSON", rawJsonPreview),
      detailField("timestamp", "Timestamp", row.timestamp),
      detailField("updated", "Updated", row.updated_at),
      detailField("deleted", "Deleted", row.deleted_at),
    ],
  };
}

export async function getShopHistoryReadModel(
  options: GetShopHistoryReadModelOptions = {},
): Promise<ShopHistoryReadModel> {
  const access = await resolveShopAdminDataAccess(options);

  if (access.status !== "ready") {
    return {
      status:
        access.status === "not_configured" || access.status === "error"
          ? access.status
          : "unauthorized",
      ...emptyRows,
      readOnly: true,
      source: "supabase_server",
      reason: access.reason,
    };
  }

  const { selectedShop, supabase } = access;
  const sourceState = await resolveHistorySourceState(supabase, selectedShop);

  if (sourceState.error) {
    return {
      status: "error",
      selectedShop,
      mapping: null,
      syncEvents: [],
      sessions: [],
      readOnly: true,
      source: "supabase_server",
      reason: "Mobile history mapping could not be loaded.",
      error: redactHistoryReadModelError(sourceState.error),
    };
  }

  const mapping = sourceState.mapping ?? null;
  const legacyOwnerUserId = sourceState.legacyOwnerUserId ?? null;

  const directSyncEventsResult = await supabase
    .from("sync_events")
    .select(
      "id,shop_id,domain,event_type,source,source_device_id,changed_count,entity_ids,metadata,created_at",
    )
    .eq("shop_id", selectedShop.shopId)
    .in("domain", ["history", "catalog", "prices"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (directSyncEventsResult.error) {
    return {
      status: "error",
      selectedShop,
      mapping,
      syncEvents: [],
      sessions: [],
      readOnly: true,
      source: "supabase_server",
      reason: "Shop-scoped sync events could not be loaded through RLS.",
      error: redactHistoryReadModelError(directSyncEventsResult.error),
    };
  }

  const directSessionsResult = await supabase
    .from("shared_sheet_sessions")
    .select(
      "remote_id,shop_id,display_name,supplier,category,timestamp,updated_at,deleted_at,payload_version,data,session_overlay",
    )
    .eq("shop_id", selectedShop.shopId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (directSessionsResult.error) {
    return {
      status: "error",
      selectedShop,
      mapping,
      syncEvents: (directSyncEventsResult.data ?? []).map(mapSyncEvent),
      sessions: [],
      readOnly: true,
      source: "supabase_server",
      reason: "Shop-scoped mobile sessions could not be loaded through RLS.",
      error: redactHistoryReadModelError(directSessionsResult.error),
    };
  }

  let legacySyncEvents: SyncEventRow[] = [];
  let legacySessions: SharedSheetSessionRow[] = [];

  if (legacyOwnerUserId) {
    const [legacySyncEventsResult, legacySessionsResult] = await Promise.all([
      supabase
        .from("sync_events")
        .select(
          "id,shop_id,domain,event_type,source,source_device_id,changed_count,entity_ids,metadata,created_at",
        )
        .is("shop_id", null)
        .eq("owner_user_id", legacyOwnerUserId)
        .in("domain", ["history", "catalog", "prices"])
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("shared_sheet_sessions")
        .select(
          "remote_id,shop_id,display_name,supplier,category,timestamp,updated_at,deleted_at,payload_version,data,session_overlay",
        )
        .is("shop_id", null)
        .eq("owner_user_id", legacyOwnerUserId)
        .order("updated_at", { ascending: false })
        .limit(50),
    ]);

    const legacyError = legacySyncEventsResult.error ?? legacySessionsResult.error;

    if (legacyError) {
      return {
        status: "error",
        selectedShop,
        mapping,
        syncEvents: (directSyncEventsResult.data ?? []).map(mapSyncEvent),
        sessions: (directSessionsResult.data ?? []).map(mapSession),
        readOnly: true,
        source: "supabase_server",
        reason: "Legacy mobile history rows could not be loaded through RLS.",
        error: redactHistoryReadModelError(legacyError),
      };
    }

    legacySyncEvents = legacySyncEventsResult.data ?? [];
    legacySessions = legacySessionsResult.data ?? [];
  }

  const directSyncEvents = directSyncEventsResult.data ?? [];
  const directSessions = directSessionsResult.data ?? [];

  if (
    sourceState.blockingSource &&
    !legacyOwnerUserId &&
    directSyncEvents.length === 0 &&
    directSessions.length === 0
  ) {
    return {
      status: "unmapped",
      selectedShop,
      mapping: null,
      syncEvents: [],
      sessions: [],
      readOnly: true,
      source: "supabase_server",
      reason:
        "A legacy mobile source exists for this shop, but it is not mapped yet.",
    };
  }

  const syncEvents = mergeRowsByKey(
    directSyncEvents,
    legacySyncEvents,
    (event) => String(event.id),
  );
  const sessions = mergeRowsByKey(
    directSessions,
    legacySessions,
    (session) => session.remote_id,
  );

  return {
    status: "ready",
    selectedShop,
    mapping,
    syncEvents: syncEvents.map(mapSyncEvent),
    sessions: sessions.map(mapSession),
    readOnly: true,
    source: "supabase_server",
    reason:
      legacyOwnerUserId
        ? "Shop-scoped mobile history entries loaded with legacy owner fallback."
        : "Shop-scoped mobile history entries loaded server-side.",
  };
}

export async function getShopHistoryDetailReadModel(
  entryId: string,
  options: GetShopHistoryReadModelOptions = {},
): Promise<ShopHistoryDetailReadModel> {
  const parsedEntry = parseHistoryEntryId(entryId);

  if (parsedEntry.kind === "invalid") {
    return {
      status: "invalid_entry",
      ...emptyDetail,
      readOnly: true,
      source: "supabase_server",
      reason: "The requested history entry id is not a supported detail key.",
    };
  }

  const access = await resolveShopAdminDataAccess(options);

  if (access.status !== "ready") {
    return {
      status:
        access.status === "not_configured" || access.status === "error"
          ? access.status
          : "unauthorized",
      ...emptyDetail,
      readOnly: true,
      source: "supabase_server",
      reason: access.reason,
    };
  }

  const { selectedShop, supabase } = access;
  const sourceState = await resolveHistorySourceState(supabase, selectedShop);

  if (sourceState.error) {
    return {
      status: "error",
      selectedShop,
      mapping: null,
      detail: null,
      readOnly: true,
      source: "supabase_server",
      reason: "Mobile history detail mapping could not be loaded.",
      error: redactHistoryReadModelError(sourceState.error),
    };
  }

  const mapping = sourceState.mapping ?? null;
  const legacyOwnerUserId = sourceState.legacyOwnerUserId ?? null;

  if (parsedEntry.kind === "sync_event") {
    const syncEventResult = await supabase
      .from("sync_events")
      .select(
        "id,shop_id,batch_id,client_event_id,store_id,domain,event_type,source,source_device_id,changed_count,entity_ids,metadata,created_at,expires_at",
      )
      .eq("shop_id", selectedShop.shopId)
      .eq("id", parsedEntry.value)
      .in("domain", ["history", "catalog", "prices"])
      .maybeSingle();

    if (syncEventResult.error) {
      return {
        status: "error",
        selectedShop,
        mapping,
        detail: null,
        readOnly: true,
        source: "supabase_server",
        reason: "Shop-scoped sync event detail could not be loaded through RLS.",
        error: redactHistoryReadModelError(syncEventResult.error),
      };
    }

    if (!syncEventResult.data && legacyOwnerUserId) {
      const legacySyncEventResult = await supabase
        .from("sync_events")
        .select(
          "id,shop_id,batch_id,client_event_id,store_id,domain,event_type,source,source_device_id,changed_count,entity_ids,metadata,created_at,expires_at",
        )
        .is("shop_id", null)
        .eq("owner_user_id", legacyOwnerUserId)
        .eq("id", parsedEntry.value)
        .in("domain", ["history", "catalog", "prices"])
        .maybeSingle();

      if (legacySyncEventResult.error) {
        return {
          status: "error",
          selectedShop,
          mapping,
          detail: null,
          readOnly: true,
          source: "supabase_server",
          reason: "Legacy sync event detail could not be loaded through RLS.",
          error: redactHistoryReadModelError(legacySyncEventResult.error),
        };
      }

      if (legacySyncEventResult.data) {
        return {
          status: "ready",
          selectedShop,
          mapping,
          detail: mapSyncEventDetail(legacySyncEventResult.data),
          readOnly: true,
          source: "supabase_server",
          reason:
            "Legacy sync event detail loaded server-side with recursive redaction.",
        };
      }
    }

    if (!syncEventResult.data && sourceState.blockingSource && !legacyOwnerUserId) {
      return {
        status: "unmapped",
        selectedShop,
        mapping: null,
        detail: null,
        readOnly: true,
        source: "supabase_server",
        reason:
          "A legacy mobile source exists for this shop, but it is not mapped yet.",
      };
    }

    return {
      status: syncEventResult.data ? "ready" : "not_found",
      selectedShop,
      mapping,
      detail: syncEventResult.data
        ? mapSyncEventDetail(syncEventResult.data)
        : null,
      readOnly: true,
      source: "supabase_server",
      reason: syncEventResult.data
        ? "Shop-scoped sync event detail loaded server-side with recursive redaction."
        : "No sync event detail is visible for the verified shop scope.",
    };
  }

  const sessionResult = await supabase
    .from("shared_sheet_sessions")
    .select(
      "remote_id,shop_id,display_name,supplier,category,timestamp,updated_at,deleted_at,payload_version,data,session_overlay,is_manual_entry",
    )
    .eq("shop_id", selectedShop.shopId)
    .eq("remote_id", parsedEntry.value)
    .maybeSingle();

  if (sessionResult.error) {
    return {
      status: "error",
      selectedShop,
      mapping,
      detail: null,
      readOnly: true,
      source: "supabase_server",
      reason: "Shop-scoped history session detail could not be loaded through RLS.",
      error: redactHistoryReadModelError(sessionResult.error),
    };
  }

  if (!sessionResult.data && legacyOwnerUserId) {
    const legacySessionResult = await supabase
      .from("shared_sheet_sessions")
      .select(
        "remote_id,shop_id,display_name,supplier,category,timestamp,updated_at,deleted_at,payload_version,data,session_overlay,is_manual_entry",
      )
      .is("shop_id", null)
      .eq("owner_user_id", legacyOwnerUserId)
      .eq("remote_id", parsedEntry.value)
      .maybeSingle();

    if (legacySessionResult.error) {
      return {
        status: "error",
        selectedShop,
        mapping,
        detail: null,
        readOnly: true,
        source: "supabase_server",
        reason: "Legacy history session detail could not be loaded through RLS.",
        error: redactHistoryReadModelError(legacySessionResult.error),
      };
    }

    if (legacySessionResult.data) {
      return {
        status: "ready",
        selectedShop,
        mapping,
        detail: mapSessionDetail(legacySessionResult.data),
        readOnly: true,
        source: "supabase_server",
        reason:
          "Legacy history session detail loaded server-side with recursive redaction.",
      };
    }
  }

  if (!sessionResult.data && sourceState.blockingSource && !legacyOwnerUserId) {
    return {
      status: "unmapped",
      selectedShop,
      mapping: null,
      detail: null,
      readOnly: true,
      source: "supabase_server",
      reason:
        "A legacy mobile source exists for this shop, but it is not mapped yet.",
    };
  }

  return {
    status: sessionResult.data ? "ready" : "not_found",
    selectedShop,
    mapping,
    detail: sessionResult.data ? mapSessionDetail(sessionResult.data) : null,
    readOnly: true,
    source: "supabase_server",
    reason: sessionResult.data
      ? "Shop-scoped history session detail loaded server-side with recursive redaction."
      : "No history session detail is visible for the verified shop scope.",
  };
}
