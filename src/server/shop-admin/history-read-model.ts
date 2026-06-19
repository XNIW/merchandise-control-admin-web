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
  | "batch_id"
  | "client_event_id"
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
  | "is_manual_entry"
  | "data"
  | "session_overlay"
>;
type SharedSheetSessionDiagnosticsRow = Pick<
  Tables<"shared_sheet_session_diagnostics">,
  | "remote_id"
  | "shop_id"
  | "owner_user_id"
  | "display_name"
  | "supplier"
  | "category"
  | "timestamp"
  | "updated_at"
  | "deleted_at"
  | "payload_version"
  | "is_manual_entry"
  | "data_rows"
  | "item_rows"
  | "column_count"
  | "overlay_status"
  | "overlay_schema"
  | "overlay_bytes"
  | "editable_rows"
  | "complete_rows"
  | "complete_count"
  | "missing_count"
  | "data_summary"
  | "overlay_summary"
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
  batchId: string | null;
  clientEventId: string | null;
  domain: string;
  eventType: string;
  status: "pending" | "success" | "failed";
  sourceScope: ShopHistorySourceScope;
  source: string | null;
  sourceDeviceId: string | null;
  changedCount: number;
  sessionIds: readonly string[];
  entitySummary: string;
  metadataSummary: string;
  createdAt: string;
};

export type ShopHistorySourceScope = "shop_scoped" | "legacy_owner_bridge";

export type ShopHistoryOverlayStatus =
  | "ok"
  | "missing"
  | "invalid_shape"
  | "schema_unsupported"
  | "too_large"
  | "legacy_v1";

export type ShopHistorySessionAnalysis = {
  remoteId: string;
  displayName: string;
  supplier: string;
  category: string;
  timestamp: string;
  updatedAt: string;
  deletedAt: string | null;
  payloadVersion: number;
  state: "active" | "tombstone";
  sourceScope: ShopHistorySourceScope;
  isManualEntry: boolean;
  rowCount: number;
  itemRowCount: number;
  columnCount: number;
  completeCount: number;
  missingCount: number;
  overlayStatus: ShopHistoryOverlayStatus;
  overlaySchema: number | null;
  overlayBytes: number;
  editableRows: number;
  completeRows: number;
  relatedSyncEventCount: number;
  latestRelatedSyncAt: string | null;
};

export type ShopHistorySession = ShopHistorySessionAnalysis & {
  dataSummary: string;
  overlaySummary: string;
};

export type ShopHistoryTablePreviewRow = {
  rowKey: string;
  rowNumber: string;
  complete: string;
  editable: string;
  item: string;
  barcode: string;
  name: string;
  values: string;
};

export type ShopHistorySummary = {
  historySessionsTotal: number;
  latestChangedAt: string | null;
  latestFailedSyncEvents: number;
  syncEventsTotal: number;
};

export type ShopHistoryReadModel = {
  status: ShopHistoryReadModelStatus;
  selectedShop: ShopAdminShellShop | null;
  mapping: ShopHistoryMapping | null;
  syncEvents: readonly ShopSyncEventActivity[];
  sessions: readonly ShopHistorySession[];
  summary: ShopHistorySummary;
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
  sessionAnalysis: ShopHistorySessionAnalysis | null;
  tablePreview: readonly ShopHistoryTablePreviewRow[];
  relatedSyncEvents: readonly ShopSyncEventActivity[];
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
  summary: {
    historySessionsTotal: 0,
    latestChangedAt: null,
    latestFailedSyncEvents: 0,
    syncEventsTotal: 0,
  },
} as const;

const emptyDetail = {
  selectedShop: null,
  mapping: null,
  detail: null,
} as const;

const SESSION_PAYLOAD_VERSION = 2;
const SESSION_OVERLAY_SCHEMA = 1;
const SESSION_OVERLAY_MAX_BYTES = 512 * 1024;
const HISTORY_PREVIEW_ROW_LIMIT = 8;
const HISTORY_CELL_MAX_LENGTH = 120;

export type SessionDataSummary = {
  grid: string[][];
  rowCount: number;
  itemRowCount: number;
  columnCount: number;
};

export type SessionOverlayAnalysis = {
  overlayStatus: ShopHistoryOverlayStatus;
  overlaySchema: number | null;
  overlayBytes: number;
  editableRows: number;
  completeRows: number;
  completeCount: number;
  missingCount: number;
};

type ScopedSyncEventRow = SyncEventRow & {
  sourceScope: ShopHistorySourceScope;
};

type ScopedSharedSheetSessionRow = SharedSheetSessionRow & {
  sourceScope: ShopHistorySourceScope;
};

type ScopedSharedSheetSessionDiagnosticsRow =
  SharedSheetSessionDiagnosticsRow & {
    sourceScope: ShopHistorySourceScope;
  };

type ScopedSharedSheetSessionDetailRow = SharedSheetSessionDetailRow & {
  sourceScope: ShopHistorySourceScope;
};
type LegacySyncEventRow = Omit<SyncEventRow, "shop_id">;
type LegacySyncEventDetailRow = Omit<SyncEventDetailRow, "shop_id">;
type LegacySharedSheetSessionRow = Omit<SharedSheetSessionRow, "shop_id">;
type LegacySharedSheetSessionDetailRow = Omit<
  SharedSheetSessionDetailRow,
  "shop_id"
>;

function isLegacyHistorySchemaError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: unknown }).code;

  return code === "42703" || code === "PGRST204" || code === "PGRST205";
}

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

function redactSensitiveText(value: string) {
  const trimmed = value.trim();

  if (
    /bearer\s+[a-z0-9._-]+/i.test(trimmed) ||
    /\beyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}/.test(trimmed) ||
    /\b(?:sk|pk|rk|sbp|ghp|github_pat)_[a-z0-9_]{12,}/i.test(trimmed) ||
    /\b(password|secret|token|credential|refresh[_-]?token|access[_-]?token|pin)\b/i.test(
      trimmed,
    )
  ) {
    return "[redacted]";
  }

  return value;
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

  if (typeof value === "string") {
    return redactSensitiveText(value);
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

export function safeJsonByteSize(value: Json | null) {
  if (value === null) {
    return 0;
  }

  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function stringGridFromJson(value: Json | null): string[][] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((row) => {
    if (!Array.isArray(row)) {
      return [];
    }

    return row.map((cell) => {
      if (
        cell === null ||
        typeof cell === "string" ||
        typeof cell === "number" ||
        typeof cell === "boolean"
      ) {
        return redactSensitiveText(String(cell ?? ""));
      }

      return stringifyRedactedJson(cell, HISTORY_CELL_MAX_LENGTH);
    });
  });
}

export function summarizeSessionDataGrid(data: Json | null): SessionDataSummary {
  const grid = stringGridFromJson(data);
  const rowCount = grid.length;
  const itemRowCount = grid.slice(1).filter((row) =>
    row.some((cell) => cell.trim().length > 0),
  ).length;
  const columnCount = grid.reduce(
    (currentMax, row) => Math.max(currentMax, row.length),
    0,
  );

  return { columnCount, grid, itemRowCount, rowCount };
}

function overlayObject(overlay: Json | null) {
  return overlay && typeof overlay === "object" && !Array.isArray(overlay)
    ? (overlay as Record<string, Json>)
    : null;
}

export function analyzeSessionOverlay({
  data,
  payloadVersion,
  sessionOverlay,
}: {
  data: Json | null;
  payloadVersion: number;
  sessionOverlay: Json | null;
}): SessionOverlayAnalysis {
  const dataSummary = summarizeSessionDataGrid(data);
  const overlayBytes = safeJsonByteSize(sessionOverlay);

  if (payloadVersion < SESSION_PAYLOAD_VERSION) {
    return {
      completeCount: 0,
      completeRows: 0,
      editableRows: 0,
      missingCount: dataSummary.itemRowCount,
      overlayBytes,
      overlaySchema: null,
      overlayStatus: "legacy_v1",
    };
  }

  if (sessionOverlay === null) {
    return {
      completeCount: 0,
      completeRows: 0,
      editableRows: 0,
      missingCount: dataSummary.itemRowCount,
      overlayBytes,
      overlaySchema: null,
      overlayStatus: "missing",
    };
  }

  if (overlayBytes > SESSION_OVERLAY_MAX_BYTES) {
    return {
      completeCount: 0,
      completeRows: 0,
      editableRows: 0,
      missingCount: dataSummary.itemRowCount,
      overlayBytes,
      overlaySchema: null,
      overlayStatus: "too_large",
    };
  }

  const overlay = overlayObject(sessionOverlay);
  const overlaySchema = overlay?.overlay_schema;
  const editable = overlay?.editable;
  const complete = overlay?.complete;
  const editableRows = Array.isArray(editable) ? editable.length : 0;
  const completeRows = Array.isArray(complete) ? complete.length : 0;
  const completeCount = Array.isArray(complete)
    ? complete.slice(1).filter((value) => value === true).length
    : 0;

  if (
    !overlay ||
    typeof overlaySchema !== "number" ||
    !Array.isArray(editable) ||
    !editable.every((row) => Array.isArray(row)) ||
    !Array.isArray(complete) ||
    !complete.every((value) => typeof value === "boolean")
  ) {
    return {
      completeCount: 0,
      completeRows: 0,
      editableRows: 0,
      missingCount: dataSummary.itemRowCount,
      overlayBytes,
      overlaySchema: typeof overlaySchema === "number" ? overlaySchema : null,
      overlayStatus: "invalid_shape",
    };
  }

  if (overlaySchema !== SESSION_OVERLAY_SCHEMA) {
    return {
      completeCount: 0,
      completeRows: 0,
      editableRows: 0,
      missingCount: dataSummary.itemRowCount,
      overlayBytes,
      overlaySchema,
      overlayStatus: "schema_unsupported",
    };
  }

  if (
    editableRows !== dataSummary.rowCount ||
    completeRows !== dataSummary.rowCount
  ) {
    return {
      completeCount: 0,
      completeRows: 0,
      editableRows: 0,
      missingCount: dataSummary.itemRowCount,
      overlayBytes,
      overlaySchema,
      overlayStatus: "invalid_shape",
    };
  }

  return {
    completeCount,
    completeRows,
    editableRows,
    missingCount: Math.max(0, dataSummary.itemRowCount - completeCount),
    overlayBytes,
    overlaySchema,
    overlayStatus: "ok",
  };
}

function safeHistoryCell(value: string | null | undefined, maxLength = 72) {
  const redacted = redactSensitiveText(value ?? "").replace(/\s+/g, " ").trim();

  if (!redacted) {
    return "Not set";
  }

  return redacted.length > maxLength
    ? `${redacted.slice(0, maxLength)}...`
    : redacted;
}

function previewOverlay(overlay: Json | null) {
  const value = overlayObject(overlay);
  const editable = value?.editable;
  const complete = value?.complete;

  return {
    complete: Array.isArray(complete) ? complete : [],
    editable: Array.isArray(editable) ? stringGridFromJson(editable) : [],
  };
}

function inferBarcode(row: readonly string[]) {
  return row.find((cell) => /^[0-9]{6,}$/.test(cell.trim())) ?? "";
}

function inferName(row: readonly string[], barcode: string) {
  return (
    row.find((cell) => {
      const trimmed = cell.trim();

      return trimmed.length > 0 && trimmed !== barcode && !/^[0-9.,-]+$/.test(trimmed);
    }) ?? ""
  );
}

export function safeHistoryTablePreview({
  data,
  overlayStatus,
  sessionOverlay,
}: {
  data: Json | null;
  overlayStatus?: ShopHistoryOverlayStatus;
  sessionOverlay: Json | null;
}): ShopHistoryTablePreviewRow[] {
  const grid = stringGridFromJson(data).slice(0, HISTORY_PREVIEW_ROW_LIMIT);
  const canUseOverlay = overlayStatus === "ok";
  const overlay = canUseOverlay
    ? previewOverlay(sessionOverlay)
    : { complete: [], editable: [] };

  return grid.map((row, index) => {
    const editableRow = overlay.editable[index] ?? [];
    const isComplete = overlay.complete[index] === true;
    const barcode = inferBarcode(row);
    const name = inferName(row, barcode);

    return {
      rowKey: `preview:${index + 1}`,
      rowNumber: String(index + 1),
      complete: canUseOverlay
        ? isComplete
          ? "Complete"
          : "Missing"
        : "Overlay unavailable",
      editable:
        !canUseOverlay
          ? "Overlay unavailable"
          : editableRow.filter((cell) => cell.trim().length > 0).length > 0
          ? editableRow.map((cell) => safeHistoryCell(cell, 36)).join(" / ")
          : "Not set",
      item: safeHistoryCell(row.find((cell) => cell.trim().length > 0)),
      barcode: safeHistoryCell(barcode),
      name: safeHistoryCell(name),
      values: row.slice(0, 6).map((cell) => safeHistoryCell(cell, 28)).join(" | "),
    };
  });
}

export function normalizeSessionIdsFromSyncEvent(
  entityIds: Json | null,
): string[] {
  const ids: string[] = [];

  const collect = (value: Json | undefined) => {
    if (typeof value === "string" && value.trim().length > 0) {
      ids.push(value.trim().toLowerCase());
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        collect(item);
      }
    }
  };

  if (entityIds && typeof entityIds === "object" && !Array.isArray(entityIds)) {
    const objectValue = entityIds as Record<string, Json>;

    collect(objectValue.history_session_ids);
    collect(objectValue.historySessionIds);
    collect(objectValue.history_session_id);
    collect(objectValue.historySessionId);
    collect(objectValue.session_ids);
    collect(objectValue.sessionIds);
    collect(objectValue.session_id);
    collect(objectValue.sessionId);
  } else {
    collect(entityIds ?? undefined);
  }

  return Array.from(new Set(ids)).slice(0, 250);
}

export function mapRelatedHistorySyncEvents(
  remoteId: string,
  events: readonly ShopSyncEventActivity[],
) {
  const normalizedRemoteId = remoteId.trim().toLowerCase();

  return events.filter(
    (event) =>
      event.domain === "history" && event.sessionIds.includes(normalizedRemoteId),
  );
}

function sourceScopeDisplayName(sourceScope: ShopHistorySourceScope) {
  const labels: Record<ShopHistorySourceScope, string> = {
    legacy_owner_bridge: "Legacy owner bridge",
    shop_scoped: "Shop scoped",
  };

  return labels[sourceScope];
}

function overlayStatusDisplayName(status: ShopHistoryOverlayStatus) {
  const labels: Record<ShopHistoryOverlayStatus, string> = {
    invalid_shape: "Invalid shape",
    legacy_v1: "Legacy v1",
    missing: "Missing",
    ok: "OK",
    schema_unsupported: "Unsupported schema",
    too_large: "Too large",
  };

  return labels[status];
}

function mapSyncEvent(row: ScopedSyncEventRow): ShopSyncEventActivity {
  return {
    eventId: String(row.id),
    batchId: row.batch_id,
    clientEventId: row.client_event_id,
    domain: row.domain,
    eventType: row.event_type,
    status: inferSyncStatus(row.metadata, row.event_type),
    sourceScope: row.sourceScope,
    source: row.source,
    sourceDeviceId: row.source_device_id,
    changedCount: row.changed_count,
    sessionIds: normalizeSessionIdsFromSyncEvent(row.entity_ids),
    entitySummary: summarizeJson(row.entity_ids),
    metadataSummary: summarizeJson(row.metadata),
    createdAt: row.created_at,
  };
}

function mapLegacySyncEventRow(
  row: LegacySyncEventRow,
  sourceScope: ShopHistorySourceScope,
): ScopedSyncEventRow {
  return {
    ...row,
    shop_id: null,
    sourceScope,
  };
}

function mapLegacySyncEventDetailRow(
  row: LegacySyncEventDetailRow,
): SyncEventDetailRow {
  return {
    ...row,
    shop_id: null,
  };
}

function mapLegacySessionRow(
  row: LegacySharedSheetSessionRow,
  sourceScope: ShopHistorySourceScope,
): ScopedSharedSheetSessionRow {
  return {
    ...row,
    shop_id: null,
    sourceScope,
  };
}

function mapLegacySessionDetailRow(
  row: LegacySharedSheetSessionDetailRow,
  sourceScope: ShopHistorySourceScope,
): ScopedSharedSheetSessionDetailRow {
  return {
    ...row,
    shop_id: null,
    sourceScope,
  };
}

function mapSession(
  row: ScopedSharedSheetSessionRow,
  events: readonly ShopSyncEventActivity[],
): ShopHistorySession {
  const dataSummary = summarizeSessionDataGrid(row.data);
  const overlayAnalysis = analyzeSessionOverlay({
    data: row.data,
    payloadVersion: row.payload_version,
    sessionOverlay: row.session_overlay,
  });
  const relatedEvents = mapRelatedHistorySyncEvents(row.remote_id, events);

  return {
    remoteId: row.remote_id,
    displayName: row.display_name,
    supplier: row.supplier,
    category: row.category,
    timestamp: row.timestamp,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    payloadVersion: row.payload_version,
    state: row.deleted_at ? "tombstone" : "active",
    sourceScope: row.sourceScope,
    isManualEntry: row.is_manual_entry,
    rowCount: dataSummary.rowCount,
    itemRowCount: dataSummary.itemRowCount,
    columnCount: dataSummary.columnCount,
    completeCount: overlayAnalysis.completeCount,
    missingCount: overlayAnalysis.missingCount,
    overlayStatus: overlayAnalysis.overlayStatus,
    overlaySchema: overlayAnalysis.overlaySchema,
    overlayBytes: overlayAnalysis.overlayBytes,
    editableRows: overlayAnalysis.editableRows,
    completeRows: overlayAnalysis.completeRows,
    relatedSyncEventCount: relatedEvents.length,
    latestRelatedSyncAt: relatedEvents[0]?.createdAt ?? null,
    dataSummary: summarizeJson(row.data),
    overlaySummary: summarizeJson(row.session_overlay),
  };
}

function mapSessionDiagnostics(
  row: ScopedSharedSheetSessionDiagnosticsRow,
  events: readonly ShopSyncEventActivity[],
): ShopHistorySession {
  const relatedEvents = mapRelatedHistorySyncEvents(row.remote_id, events);
  const overlayStatus = row.overlay_status as ShopHistoryOverlayStatus;

  return {
    remoteId: row.remote_id,
    displayName: row.display_name,
    supplier: row.supplier,
    category: row.category,
    timestamp: row.timestamp,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    payloadVersion: row.payload_version,
    state: row.deleted_at ? "tombstone" : "active",
    sourceScope: row.sourceScope,
    isManualEntry: row.is_manual_entry,
    rowCount: row.data_rows,
    itemRowCount: row.item_rows,
    columnCount: row.column_count,
    completeCount: row.complete_count,
    missingCount: row.missing_count,
    overlayStatus,
    overlaySchema: row.overlay_schema,
    overlayBytes: row.overlay_bytes,
    editableRows: row.editable_rows,
    completeRows: row.complete_rows,
    relatedSyncEventCount: relatedEvents.length,
    latestRelatedSyncAt: relatedEvents[0]?.createdAt ?? null,
    dataSummary: row.data_summary,
    overlaySummary: row.overlay_summary,
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

type HistoryCountResult = {
  count: number | null;
  error: unknown | null;
};

type HistoryCountQuery = {
  eq: (column: string, value: string) => HistoryCountQuery;
  in: (column: string, values: readonly string[]) => HistoryCountQuery;
  is: (column: string, value: null) => HistoryCountQuery;
} & PromiseLike<HistoryCountResult>;

type HistoryCountTable = {
  select: (
    columns: string,
    options: {
      count: "exact";
      head: true;
    },
  ) => HistoryCountQuery;
};

type SupportedHistoryCountTable =
  | "shared_sheet_session_diagnostics"
  | "sync_events";

const SUPPORTED_HISTORY_TOTAL_TABLES = [
  "shared_sheet_session_diagnostics",
  "sync_events",
] as const satisfies readonly SupportedHistoryCountTable[];

type HistoryCountScope =
  | {
      kind: "shop_scoped";
      shopId: string;
    }
  | {
      kind: "legacy_owner_bridge";
      ownerUserId: string;
    };

function isSupportedHistoryCountTable(
  table: string,
): table is SupportedHistoryCountTable {
  return SUPPORTED_HISTORY_TOTAL_TABLES.includes(
    table as SupportedHistoryCountTable,
  );
}

function isHistoryCountTable(value: unknown): value is HistoryCountTable {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { select?: unknown }).select === "function"
  );
}

function historyCountUnavailableError(table: string, reason: string) {
  const error = new Error(`history_read_unavailable:${reason}:${table}`);
  error.name = "history_read_unavailable";

  return error;
}

async function countHistoryRows(input: {
  domains?: readonly string[];
  scope: HistoryCountScope;
  supabase: SupabaseServerClient;
  table: string;
}) {
  if (!isSupportedHistoryCountTable(input.table)) {
    return {
      count: 0,
      error: historyCountUnavailableError(input.table, "unsupported_table"),
    };
  }

  const fromHistoryTable = input.supabase.from.bind(input.supabase) as unknown as (
    table: SupportedHistoryCountTable,
  ) => unknown;
  let table: unknown;

  try {
    table = fromHistoryTable(input.table);
  } catch {
    return {
      count: 0,
      error: historyCountUnavailableError(input.table, "table_builder_failed"),
    };
  }

  if (!isHistoryCountTable(table)) {
    return {
      count: 0,
      error: historyCountUnavailableError(input.table, "table_builder_missing"),
    };
  }

  let query = table.select("*", {
    count: "exact",
    head: true,
  });

  if (input.scope.kind === "shop_scoped") {
    query = query.eq("shop_id", input.scope.shopId);
  } else {
    query = query
      .is("shop_id", null)
      .eq("owner_user_id", input.scope.ownerUserId);
  }

  if (input.domains) {
    query = query.in("domain", input.domains);
  }

  const result = (await query) as HistoryCountResult;

  if (result.error && isLegacyHistorySchemaError(result.error)) {
    if (input.scope.kind === "shop_scoped") {
      return { count: 0, error: null };
    }

    const legacyTableName =
      input.table === "shared_sheet_session_diagnostics"
        ? "shared_sheet_sessions"
        : input.table;
    const legacyTable = fromHistoryTable(
      legacyTableName as SupportedHistoryCountTable,
    );

    if (!isHistoryCountTable(legacyTable)) {
      return {
        count: 0,
        error: historyCountUnavailableError(
          legacyTableName,
          "legacy_table_builder_missing",
        ),
      };
    }

    let legacyQuery = legacyTable
      .select("*", { count: "exact", head: true })
      .eq("owner_user_id", input.scope.ownerUserId);

    if (input.domains) {
      legacyQuery = legacyQuery.in("domain", input.domains);
    }

    return (await legacyQuery) as HistoryCountResult;
  }

  return result;
}

async function loadHistorySummary(input: {
  legacyOwnerUserId: string | null;
  selectedShopId: string;
  supabase: SupabaseServerClient;
}) {
  const scopes: HistoryCountScope[] = [
    {
      kind: "shop_scoped",
      shopId: input.selectedShopId,
    },
  ];

  if (input.legacyOwnerUserId) {
    scopes.push({
      kind: "legacy_owner_bridge",
      ownerUserId: input.legacyOwnerUserId,
    });
  }

  const results = await Promise.all(
    scopes.flatMap((scope) => [
      countHistoryRows({
        domains: ["history", "catalog", "prices"],
        scope,
        supabase: input.supabase,
        table: "sync_events",
      }),
      countHistoryRows({
        scope,
        supabase: input.supabase,
        table: "shared_sheet_session_diagnostics",
      }),
    ]),
  );
  const error = results.find((result) => result.error)?.error ?? null;
  let syncEventsTotal = 0;
  let historySessionsTotal = 0;

  for (let index = 0; index < results.length; index += 2) {
    syncEventsTotal += results[index]?.count ?? 0;
    historySessionsTotal += results[index + 1]?.count ?? 0;
  }

  return {
    error,
    summary: {
      historySessionsTotal,
      latestChangedAt: null,
      latestFailedSyncEvents: 0,
      syncEventsTotal,
    } satisfies ShopHistorySummary,
  };
}

async function resolveHistorySourceState(
  supabase: SupabaseServerClient,
  selectedShop: ShopAdminShellShop,
) {
  const [mappedSourceResult, blockingSourceResult] = await Promise.all([
    supabase
      .from("shop_inventory_sources")
      .select("shop_inventory_source_id,shop_id,owner_user_id,mapping_state,source_kind")
      .eq("shop_id", selectedShop.shopId)
      .eq("mapping_state", "mapped")
      .is("disabled_at", null)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("shop_inventory_sources")
      .select("shop_inventory_source_id,shop_id,owner_user_id,mapping_state,source_kind")
      .eq("shop_id", selectedShop.shopId)
      .neq("mapping_state", "mapped")
      .is("disabled_at", null)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const sourceError = mappedSourceResult.error ?? blockingSourceResult.error;

  if (sourceError) {
    return { error: sourceError };
  }

  const mappedSource =
    ((mappedSourceResult.data ?? []) as InventorySourceRow[]).find((source) =>
      Boolean(source.owner_user_id),
    ) ?? null;
  const blockingSource =
    ((blockingSourceResult.data ?? []) as InventorySourceRow[])[0] ?? null;

  return {
    blockingSource,
    error: null,
    legacyOwnerUserId: mappedSource?.owner_user_id ?? null,
    mapping: mappedSource ? mapMapping(mappedSource) : null,
  };
}

async function loadHistorySyncEventsForShop(
  supabase: SupabaseServerClient,
  selectedShop: ShopAdminShellShop,
  legacyOwnerUserId: string | null,
) {
  const directResult = await supabase
    .from("sync_events")
    .select(
      "id,shop_id,batch_id,client_event_id,domain,event_type,source,source_device_id,changed_count,entity_ids,metadata,created_at",
    )
    .eq("shop_id", selectedShop.shopId)
    .eq("domain", "history")
    .order("created_at", { ascending: false })
    .limit(80);

  if (directResult.error && !isLegacyHistorySchemaError(directResult.error)) {
    return { error: directResult.error, events: [] };
  }

  const directRows: ScopedSyncEventRow[] = directResult.error
    ? []
    : ((directResult.data ?? []) as SyncEventRow[]).map(
        (row) => ({
          ...row,
          sourceScope: "shop_scoped" as const,
        }),
      );

  if (!legacyOwnerUserId) {
    return { error: null, events: directRows.map(mapSyncEvent) };
  }

  const legacyResult = await supabase
    .from("sync_events")
    .select(
      "id,shop_id,batch_id,client_event_id,domain,event_type,source,source_device_id,changed_count,entity_ids,metadata,created_at",
    )
    .is("shop_id", null)
    .eq("owner_user_id", legacyOwnerUserId)
    .eq("domain", "history")
    .order("created_at", { ascending: false })
    .limit(80);

  if (legacyResult.error && !isLegacyHistorySchemaError(legacyResult.error)) {
    return { error: legacyResult.error, events: directRows.map(mapSyncEvent) };
  }

  let legacyRows: ScopedSyncEventRow[] = [];

  if (legacyResult.error && isLegacyHistorySchemaError(legacyResult.error)) {
    const legacyOwnerResult = await supabase
      .from("sync_events")
      .select(
        "id,batch_id,client_event_id,domain,event_type,source,source_device_id,changed_count,entity_ids,metadata,created_at",
      )
      .eq("owner_user_id", legacyOwnerUserId)
      .eq("domain", "history")
      .order("created_at", { ascending: false })
      .limit(80);

    if (legacyOwnerResult.error) {
      return {
        error: legacyOwnerResult.error,
        events: directRows.map(mapSyncEvent),
      };
    }

    legacyRows = ((legacyOwnerResult.data ?? []) as LegacySyncEventRow[]).map(
      (row) => mapLegacySyncEventRow(row, "legacy_owner_bridge"),
    );
  } else {
    legacyRows = ((legacyResult.data ?? []) as SyncEventRow[]).map(
      (row) => ({
        ...row,
        sourceScope: "legacy_owner_bridge" as const,
      }),
    );
  }
  const rows = mergeRowsByKey(directRows, legacyRows, (event) =>
    String(event.id),
  );

  return { error: null, events: rows.map(mapSyncEvent) };
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
      detailField("record", "Source table", "sync_events"),
      detailField(
        "meaning",
        "Record meaning",
        "Technical synchronization event linked to mobile history entries; it is not the History Entry itself.",
      ),
      detailField("domain", "Domain", row.domain),
      detailField("event", "Event type", row.event_type),
      detailField("source", "Source", row.source),
      detailField("device", "Device", row.source_device_id),
      detailField("store", "Store", row.store_id),
      detailField("batch", "Batch", row.batch_id),
      detailField("client", "Client event", row.client_event_id),
      detailField("records", "Record count", row.changed_count),
      detailField(
        "sessionIds",
        "History session IDs",
        normalizeSessionIdsFromSyncEvent(row.entity_ids).join(", "),
      ),
      detailField("tables", "Tables involved", row.domain),
      detailField("payload", "Payload summary", payloadSummary),
      detailField("errors", "Sync errors", summarizeSyncErrors(row.metadata)),
      detailField("raw", "Redacted JSON", rawJsonPreview),
      detailField("created", "Created", row.created_at),
      detailField("expires", "Expires", row.expires_at),
    ],
    sessionAnalysis: null,
    tablePreview: [],
    relatedSyncEvents: [],
  };
}

function mapSessionDetail(
  row: ScopedSharedSheetSessionDetailRow,
  historyEvents: readonly ShopSyncEventActivity[],
): ShopHistoryDetail {
  const relatedSyncEvents = mapRelatedHistorySyncEvents(row.remote_id, historyEvents);
  const analysis = mapSession(row, historyEvents);
  const payloadSummary = `${summarizeJson(row.data)}; ${summarizeJson(
    row.session_overlay,
  )}`;
  const rawJsonPreview = stringifyRedactedJson({
    data: row.data,
    session_overlay: row.session_overlay,
  });
  const overlayTrust =
    analysis.overlayStatus === "ok"
      ? "Overlay OK; completed and editable counts match the data rows."
      : "Diagnostic only; do not trust completed or editable counts for this overlay.";

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
      detailField("type", "Type", row.deleted_at ? "Deleted history entry" : "History entry"),
      detailField("record", "Source table", "shared_sheet_sessions"),
      detailField("remoteId", "Remote ID", row.remote_id),
      detailField(
        "identity",
        "Cross-platform identity",
        "remote_id is the Android/iOS identity for this shared_sheet_sessions record.",
      ),
      detailField("state", "State", analysis.state === "tombstone" ? "Tombstone" : "Active"),
      detailField(
        "deletedMeaning",
        "Deleted meaning",
        row.deleted_at
          ? "deleted_at means this shared_sheet_sessions record is a tombstone/deleted session."
          : "Not deleted; deleted_at is empty.",
      ),
      detailField("scope", "Source scope", sourceScopeDisplayName(analysis.sourceScope)),
      detailField("display", "Display name", row.display_name),
      detailField("supplier", "Supplier", row.supplier),
      detailField("category", "Category", row.category),
      detailField("manual", "Manual entry", row.is_manual_entry),
      detailField("version", "Payload version", row.payload_version),
      detailField("rows", "Data rows", analysis.rowCount),
      detailField("columns", "Columns", analysis.columnCount),
      detailField("completed", "Completed rows", analysis.completeCount),
      detailField("missing", "Missing rows", analysis.missingCount),
      detailField("overlay", "Overlay status", overlayStatusDisplayName(analysis.overlayStatus)),
      detailField("overlayTrust", "Overlay trust", overlayTrust),
      detailField("overlaySchema", "Overlay schema", analysis.overlaySchema),
      detailField("overlayBytes", "Overlay bytes", analysis.overlayBytes),
      detailField("editableRows", "Editable rows", analysis.editableRows),
      detailField("completeRows", "Complete flags", analysis.completeRows),
      detailField("relatedEvents", "Related sync events", relatedSyncEvents.length),
      detailField("tables", "Tables involved", "shared_sheet_sessions"),
      detailField("payload", "Payload summary", payloadSummary),
      detailField("raw", "Redacted JSON", rawJsonPreview),
      detailField("timestamp", "Timestamp", row.timestamp),
      detailField("updated", "Updated", row.updated_at),
      detailField("deleted", "Deleted", row.deleted_at),
    ],
    sessionAnalysis: analysis,
    tablePreview: safeHistoryTablePreview({
      data: row.data,
      overlayStatus: analysis.overlayStatus,
      sessionOverlay: row.session_overlay,
    }),
    relatedSyncEvents,
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
      summary: emptyRows.summary,
      readOnly: true,
      source: "supabase_server",
      reason: "Mobile history mapping could not be loaded.",
      error: redactHistoryReadModelError(sourceState.error),
    };
  }

  const mapping = sourceState.mapping ?? null;
  const legacyOwnerUserId = sourceState.legacyOwnerUserId ?? null;
  const historySummaryResult = await loadHistorySummary({
    legacyOwnerUserId,
    selectedShopId: selectedShop.shopId,
    supabase,
  });

  if (historySummaryResult.error) {
    return {
      status: "error",
      selectedShop,
      mapping,
      syncEvents: [],
      sessions: [],
      summary: emptyRows.summary,
      readOnly: true,
      source: "supabase_server",
      reason: "Mobile history totals could not be loaded through RLS.",
      error: redactHistoryReadModelError(historySummaryResult.error),
    };
  }

  const directSyncEventsResult = await supabase
    .from("sync_events")
    .select(
      "id,shop_id,batch_id,client_event_id,domain,event_type,source,source_device_id,changed_count,entity_ids,metadata,created_at",
    )
    .eq("shop_id", selectedShop.shopId)
    .in("domain", ["history", "catalog", "prices"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (
    directSyncEventsResult.error &&
    !isLegacyHistorySchemaError(directSyncEventsResult.error)
  ) {
    return {
      status: "error",
      selectedShop,
      mapping,
      syncEvents: [],
      sessions: [],
      summary: historySummaryResult.summary,
      readOnly: true,
      source: "supabase_server",
      reason: "Shop-scoped sync events could not be loaded through RLS.",
      error: redactHistoryReadModelError(directSyncEventsResult.error),
    };
  }

  const directSyncEventRows: ScopedSyncEventRow[] = directSyncEventsResult.error
    ? []
    : ((directSyncEventsResult.data ?? []) as SyncEventRow[]).map((row) => ({
        ...row,
        sourceScope: "shop_scoped" as const,
      }));

  const directSessionsResult = await supabase
    .from("shared_sheet_session_diagnostics")
    .select(
      "remote_id,shop_id,owner_user_id,display_name,supplier,category,timestamp,updated_at,deleted_at,payload_version,is_manual_entry,data_rows,item_rows,column_count,overlay_status,overlay_schema,overlay_bytes,editable_rows,complete_rows,complete_count,missing_count,data_summary,overlay_summary",
    )
    .eq("shop_id", selectedShop.shopId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (
    directSessionsResult.error &&
    !isLegacyHistorySchemaError(directSessionsResult.error)
  ) {
    return {
      status: "error",
      selectedShop,
      mapping,
      syncEvents: directSyncEventRows.map(mapSyncEvent),
      sessions: [],
      summary: historySummaryResult.summary,
      readOnly: true,
      source: "supabase_server",
      reason: "Shop-scoped mobile sessions could not be loaded through RLS.",
      error: redactHistoryReadModelError(directSessionsResult.error),
    };
  }

  const directSessionRows: ScopedSharedSheetSessionDiagnosticsRow[] =
    directSessionsResult.error
      ? []
      : ((directSessionsResult.data ??
          []) as SharedSheetSessionDiagnosticsRow[]).map((row) => ({
          ...row,
          sourceScope: "shop_scoped" as const,
        }));

  let legacySyncEvents: ScopedSyncEventRow[] = [];
  let legacySessions: ScopedSharedSheetSessionDiagnosticsRow[] = [];
  let legacyFullSessions: ScopedSharedSheetSessionRow[] = [];

  if (legacyOwnerUserId) {
    const legacySyncEventsResult = await supabase
      .from("sync_events")
      .select(
        "id,shop_id,batch_id,client_event_id,domain,event_type,source,source_device_id,changed_count,entity_ids,metadata,created_at",
      )
      .is("shop_id", null)
      .eq("owner_user_id", legacyOwnerUserId)
      .in("domain", ["history", "catalog", "prices"])
      .order("created_at", { ascending: false })
      .limit(50);

    if (
      legacySyncEventsResult.error &&
      !isLegacyHistorySchemaError(legacySyncEventsResult.error)
    ) {
      const directSyncEvents = directSyncEventRows.map(mapSyncEvent);

      return {
        status: "error",
        selectedShop,
        mapping,
        syncEvents: directSyncEvents,
        sessions: directSessionRows.map((session) =>
          mapSessionDiagnostics(session, directSyncEvents),
        ),
        summary: historySummaryResult.summary,
        readOnly: true,
        source: "supabase_server",
        reason: "Legacy mobile history rows could not be loaded through RLS.",
        error: redactHistoryReadModelError(legacySyncEventsResult.error),
      };
    }

    if (
      legacySyncEventsResult.error &&
      isLegacyHistorySchemaError(legacySyncEventsResult.error)
    ) {
      const legacyOwnerSyncEventsResult = await supabase
        .from("sync_events")
        .select(
          "id,batch_id,client_event_id,domain,event_type,source,source_device_id,changed_count,entity_ids,metadata,created_at",
        )
        .eq("owner_user_id", legacyOwnerUserId)
        .in("domain", ["history", "catalog", "prices"])
        .order("created_at", { ascending: false })
        .limit(50);

      if (legacyOwnerSyncEventsResult.error) {
        const directSyncEvents = directSyncEventRows.map(mapSyncEvent);

        return {
          status: "error",
          selectedShop,
          mapping,
          syncEvents: directSyncEvents,
          sessions: directSessionRows.map((session) =>
            mapSessionDiagnostics(session, directSyncEvents),
          ),
          summary: historySummaryResult.summary,
          readOnly: true,
          source: "supabase_server",
          reason: "Legacy mobile history rows could not be loaded through RLS.",
          error: redactHistoryReadModelError(legacyOwnerSyncEventsResult.error),
        };
      }

      legacySyncEvents = ((legacyOwnerSyncEventsResult.data ??
        []) as LegacySyncEventRow[]).map((row) =>
        mapLegacySyncEventRow(row, "legacy_owner_bridge"),
      );
    } else {
      legacySyncEvents = ((legacySyncEventsResult.data ??
        []) as SyncEventRow[]).map((row) => ({
        ...row,
        sourceScope: "legacy_owner_bridge" as const,
      }));
    }

    const legacySessionsResult = await supabase
      .from("shared_sheet_session_diagnostics")
      .select(
        "remote_id,shop_id,owner_user_id,display_name,supplier,category,timestamp,updated_at,deleted_at,payload_version,is_manual_entry,data_rows,item_rows,column_count,overlay_status,overlay_schema,overlay_bytes,editable_rows,complete_rows,complete_count,missing_count,data_summary,overlay_summary",
      )
      .is("shop_id", null)
      .eq("owner_user_id", legacyOwnerUserId)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (
      legacySessionsResult.error &&
      !isLegacyHistorySchemaError(legacySessionsResult.error)
    ) {
      const directSyncEvents = directSyncEventRows.map(mapSyncEvent);

      return {
        status: "error",
        selectedShop,
        mapping,
        syncEvents: directSyncEvents,
        sessions: directSessionRows.map((session) =>
          mapSessionDiagnostics(session, directSyncEvents),
        ),
        summary: historySummaryResult.summary,
        readOnly: true,
        source: "supabase_server",
        reason: "Legacy mobile history rows could not be loaded through RLS.",
        error: redactHistoryReadModelError(legacySessionsResult.error),
      };
    }

    if (
      legacySessionsResult.error &&
      isLegacyHistorySchemaError(legacySessionsResult.error)
    ) {
      const legacyFullSessionsResult = await supabase
        .from("shared_sheet_sessions")
        .select(
          "remote_id,display_name,supplier,category,timestamp,updated_at,deleted_at,payload_version,is_manual_entry,data,session_overlay",
        )
        .eq("owner_user_id", legacyOwnerUserId)
        .order("updated_at", { ascending: false })
        .limit(50);

      if (legacyFullSessionsResult.error) {
        const directSyncEvents = directSyncEventRows.map(mapSyncEvent);

        return {
          status: "error",
          selectedShop,
          mapping,
          syncEvents: directSyncEvents,
          sessions: directSessionRows.map((session) =>
            mapSessionDiagnostics(session, directSyncEvents),
          ),
          summary: historySummaryResult.summary,
          readOnly: true,
          source: "supabase_server",
          reason: "Legacy mobile history rows could not be loaded through RLS.",
          error: redactHistoryReadModelError(legacyFullSessionsResult.error),
        };
      }

      legacyFullSessions = ((legacyFullSessionsResult.data ??
        []) as LegacySharedSheetSessionRow[]).map((row) =>
        mapLegacySessionRow(row, "legacy_owner_bridge"),
      );
    } else {
      legacySessions = ((legacySessionsResult.data ??
        []) as SharedSheetSessionDiagnosticsRow[]).map((row) => ({
        ...row,
        sourceScope: "legacy_owner_bridge" as const,
      }));
    }
  }

  const directSyncEvents = directSyncEventRows;
  const directSessions = directSessionRows;

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
      summary: historySummaryResult.summary,
      readOnly: true,
      source: "supabase_server",
      reason:
        "A legacy mobile source exists for this shop, but it is not mapped yet.",
    };
  }

  const syncEventRows = mergeRowsByKey(
    directSyncEvents,
    legacySyncEvents,
    (event) => String(event.id),
  );
  const sessionRows = mergeRowsByKey(
    directSessions,
    legacySessions,
    (session) => session.remote_id,
  );
  const syncEvents = syncEventRows.map(mapSyncEvent);
  const diagnosticSessions = sessionRows.map((session) =>
    mapSessionDiagnostics(session, syncEvents),
  );
  const fullSessions = legacyFullSessions.map((session) =>
    mapSession(session, syncEvents),
  );
  const sessions = mergeRowsByKey(
    diagnosticSessions,
    fullSessions,
    (session) => session.remoteId,
  );
  const latestChangedAt = [
    ...syncEvents.map((event) => event.createdAt),
    ...sessions.map((session) => session.updatedAt),
  ].reduce<string | null>(
    (latest, value) => (!latest || value > latest ? value : latest),
    null,
  );
  const latestFailedSyncEvents = syncEvents.filter(
    (event) => event.status === "failed",
  ).length;

  return {
    status: "ready",
    selectedShop,
    mapping,
    syncEvents,
    sessions,
    summary: {
      ...historySummaryResult.summary,
      latestChangedAt,
      latestFailedSyncEvents,
    },
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

    if (
      syncEventResult.error &&
      !isLegacyHistorySchemaError(syncEventResult.error)
    ) {
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

      if (
        legacySyncEventResult.error &&
        !isLegacyHistorySchemaError(legacySyncEventResult.error)
      ) {
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

      if (
        legacySyncEventResult.error &&
        isLegacyHistorySchemaError(legacySyncEventResult.error)
      ) {
        const legacyOwnerSyncEventResult = await supabase
          .from("sync_events")
          .select(
            "id,batch_id,client_event_id,store_id,domain,event_type,source,source_device_id,changed_count,entity_ids,metadata,created_at,expires_at",
          )
          .eq("owner_user_id", legacyOwnerUserId)
          .eq("id", parsedEntry.value)
          .in("domain", ["history", "catalog", "prices"])
          .maybeSingle<LegacySyncEventDetailRow>();

        if (legacyOwnerSyncEventResult.error) {
          return {
            status: "error",
            selectedShop,
            mapping,
            detail: null,
            readOnly: true,
            source: "supabase_server",
            reason: "Legacy sync event detail could not be loaded through RLS.",
            error: redactHistoryReadModelError(
              legacyOwnerSyncEventResult.error,
            ),
          };
        }

        if (legacyOwnerSyncEventResult.data) {
          return {
            status: "ready",
            selectedShop,
            mapping,
            detail: mapSyncEventDetail(
              mapLegacySyncEventDetailRow(legacyOwnerSyncEventResult.data),
            ),
            readOnly: true,
            source: "supabase_server",
            reason:
              "Legacy sync event detail loaded server-side with recursive redaction.",
          };
        }
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

  if (
    sessionResult.error &&
    !isLegacyHistorySchemaError(sessionResult.error)
  ) {
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

  const historyEventsResult = await loadHistorySyncEventsForShop(
    supabase,
    selectedShop,
    legacyOwnerUserId,
  );

  if (historyEventsResult.error) {
    return {
      status: "error",
      selectedShop,
      mapping,
      detail: null,
      readOnly: true,
      source: "supabase_server",
      reason: "Related sync_events for this session could not be loaded.",
      error: redactHistoryReadModelError(historyEventsResult.error),
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
    const legacySessionError = legacySessionResult.error;

    if (
      legacySessionError &&
      !isLegacyHistorySchemaError(legacySessionError)
    ) {
      return {
        status: "error",
        selectedShop,
        mapping,
        detail: null,
        readOnly: true,
        source: "supabase_server",
        reason: "Legacy history session detail could not be loaded through RLS.",
        error: redactHistoryReadModelError(legacySessionError),
      };
    }

    if (legacySessionResult.data) {
      return {
        status: "ready",
        selectedShop,
        mapping,
        detail: mapSessionDetail(
          {
            ...legacySessionResult.data,
            sourceScope: "legacy_owner_bridge" as const,
          },
          historyEventsResult.events,
        ),
        readOnly: true,
        source: "supabase_server",
        reason:
          "Legacy history session detail loaded server-side with recursive redaction.",
      };
    }

    if (
      legacySessionError &&
      isLegacyHistorySchemaError(legacySessionError)
    ) {
      const legacyFullSessionResult = await supabase
        .from("shared_sheet_sessions")
        .select(
          "remote_id,display_name,supplier,category,timestamp,updated_at,deleted_at,payload_version,data,session_overlay,is_manual_entry",
        )
        .eq("owner_user_id", legacyOwnerUserId)
        .eq("remote_id", parsedEntry.value)
        .maybeSingle<LegacySharedSheetSessionDetailRow>();

      if (legacyFullSessionResult.error) {
        return {
          status: "error",
          selectedShop,
          mapping,
          detail: null,
          readOnly: true,
          source: "supabase_server",
          reason: "Legacy history session detail could not be loaded through RLS.",
          error: redactHistoryReadModelError(legacyFullSessionResult.error),
        };
      }

      if (legacyFullSessionResult.data) {
        return {
          status: "ready",
          selectedShop,
          mapping,
          detail: mapSessionDetail(
            mapLegacySessionDetailRow(
              legacyFullSessionResult.data,
              "legacy_owner_bridge",
            ),
            historyEventsResult.events,
          ),
          readOnly: true,
          source: "supabase_server",
          reason:
            "Legacy history session detail loaded server-side with recursive redaction.",
        };
      }
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
    detail: sessionResult.data
      ? mapSessionDetail(
          { ...sessionResult.data, sourceScope: "shop_scoped" as const },
          historyEventsResult.events,
        )
      : null,
    readOnly: true,
    source: "supabase_server",
    reason: sessionResult.data
      ? "Shop-scoped history session detail loaded server-side with recursive redaction."
      : "No history session detail is visible for the verified shop scope.",
  };
}
