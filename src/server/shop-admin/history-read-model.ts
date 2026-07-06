import "server-only";

import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
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
type SharedSheetSessionListRow = Pick<
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

export type ShopHistorySyncState =
  | "failed"
  | "not_available"
  | "pending"
  | "success";

export type ShopHistorySessionAnalysis = {
  remoteId: string;
  displayName: string;
  displayTitle: string;
  supplier: string;
  category: string;
  entryDate: string;
  timestamp: string;
  updatedAt: string;
  deletedAt: string | null;
  payloadVersion: number;
  state: "active" | "tombstone";
  sourceScope: ShopHistorySourceScope;
  isManualEntry: boolean;
  isTechnicalEntry: boolean;
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
  diagnosticsAvailable: boolean;
  latestRelatedSyncAt: string | null;
  latestRelatedSyncEvent: string | null;
  orderTotal: string;
  paymentTotal: string;
  syncState: ShopHistorySyncState;
  syncStateLabel: string;
  totalQuantity: string;
};

export type ShopHistorySession = ShopHistorySessionAnalysis & {
  dataSummary: string;
  overlaySummary: string;
};

export type ShopHistoryTablePreviewRow = {
  rowKey: string;
  rowNumber: string;
  complete: string;
  countedQuantity: string;
  editable: string;
  item: string;
  barcode: string;
  name: string;
  quantity: string;
  oldPurchasePrice: string;
  oldRetailPrice: string;
  purchasePrice: string;
  retailPrice: string;
  salePrice: string;
  sourceQuantity: string;
  values: string;
};

export type ShopHistorySummary = {
  historySessionsTotal: number;
  historySessionsTotalAvailable: boolean;
  latestChangedAt: string | null;
  latestFailedSyncEvents: number;
  syncEventsTotal: number;
  syncEventsTotalAvailable: boolean;
};

export type ShopHistoryStatusFilter =
  | "active_issues"
  | "active"
  | "all"
  | "deleted"
  | "issues"
  | "technical";

export type ShopHistoryReadModel = {
  status: ShopHistoryReadModelStatus;
  selectedShop: ShopAdminShellShop | null;
  mapping: ShopHistoryMapping | null;
  listMode?: "light";
  syncEvents: readonly ShopSyncEventActivity[];
  sessions: readonly ShopHistorySession[];
  filters?: {
    month: string | null;
    query: string | null;
    status: ShopHistoryStatusFilter;
  };
  pagination?: {
    currentPageRows: number;
    from: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    page: number;
    pageSize: 10 | 25 | 50 | 100 | 200;
    rangeEnd: number;
    rangeStart: number;
    to: number;
    totalCount: number;
    totalCountStatus: "deferred" | "exact";
    totalPages: number;
  };
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
  filters?: {
    month?: string | null;
    query?: string | null;
    status?: ShopHistoryStatusFilter | string | null;
  };
  page?: number | string | null;
  pageSize?: number | string | null;
  requestedShopId?: string | null;
};
type ShopHistoryReadClient = SupabaseAdminClient | SupabaseServerClient;

const emptyRows = {
  selectedShop: null,
  mapping: null,
  syncEvents: [],
  sessions: [],
  summary: {
    historySessionsTotal: 0,
    historySessionsTotalAvailable: false,
    latestChangedAt: null,
    latestFailedSyncEvents: 0,
    syncEventsTotal: 0,
    syncEventsTotalAvailable: false,
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
const HISTORY_PREVIEW_ROW_LIMIT = 200;
export const HISTORY_LIGHT_LIST_LIMIT = 200;
const HISTORY_LIST_PAGE_SIZES = [10, 25, 50, 100, 200] as const;
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

type ScopedSharedSheetSessionListRow = SharedSheetSessionListRow & {
  sourceScope: ShopHistorySourceScope;
};

type ScopedSharedSheetSessionDetailRow = SharedSheetSessionDetailRow & {
  sourceScope: ShopHistorySourceScope;
};
type LegacySyncEventRow = Omit<SyncEventRow, "shop_id">;
type LegacySyncEventDetailRow = Omit<SyncEventDetailRow, "shop_id">;
type LegacySharedSheetSessionRow = Omit<SharedSheetSessionRow, "shop_id">;
type LegacySharedSheetSessionListRow = Omit<
  SharedSheetSessionListRow,
  "shop_id"
>;
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
    /mcpos_(?:device|session)_[a-z0-9_-]+/i.test(trimmed) ||
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

type HistoryPreviewColumn =
  | "barcode"
  | "countedQuantity"
  | "complete"
  | "item"
  | "name"
  | "oldPurchasePrice"
  | "oldRetailPrice"
  | "purchasePrice"
  | "quantity"
  | "retailPrice"
  | "salePrice"
  | "rowNumber";

function normalizeHeaderCell(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function inferHistoryPreviewColumns(headerRow: readonly string[]) {
  const columns: Partial<Record<HistoryPreviewColumn, number>> = {};

  headerRow.forEach((cell, index) => {
    if (cell === "RetailPrice") {
      columns.salePrice ??= index;
      return;
    }

    if (cell === "realQuantity") {
      columns.countedQuantity ??= index;
      return;
    }

    if (cell === "complete") {
      columns.complete ??= index;
      return;
    }

    if (cell === "oldPurchasePrice") {
      columns.oldPurchasePrice ??= index;
      return;
    }

    if (cell === "oldRetailPrice") {
      columns.oldRetailPrice ??= index;
      return;
    }

    const normalized = normalizeHeaderCell(cell);

    if (!normalized) {
      return;
    }

    if (
      columns.rowNumber === undefined &&
      /^(no|n|row|row number|source row|source index|#)$/.test(normalized)
    ) {
      columns.rowNumber = index;
      return;
    }

    if (
      columns.item === undefined &&
      /^(item|item code|item number|sku|code)$/.test(normalized)
    ) {
      columns.item = index;
      return;
    }

    if (
      columns.barcode === undefined &&
      /^(barcode|bar code|ean|upc)$/.test(normalized)
    ) {
      columns.barcode = index;
      return;
    }

    if (
      columns.name === undefined &&
      /^(product|product name|name|description)$/.test(normalized)
    ) {
      columns.name = index;
      return;
    }

    if (
      columns.quantity === undefined &&
      /^(quantity|qty|stock quantity)$/.test(normalized)
    ) {
      columns.quantity = index;
      return;
    }

    if (
      columns.countedQuantity === undefined &&
      /^(real quantity|counted quantity|import quantity)$/.test(normalized)
    ) {
      columns.countedQuantity = index;
      return;
    }

    if (
      columns.purchasePrice === undefined &&
      /^(purchase|purchase price|buy price|cost)$/.test(normalized)
    ) {
      columns.purchasePrice = index;
      return;
    }

    if (
      columns.oldPurchasePrice === undefined &&
      /^(old purchase|old purchase price|previous purchase|previous purchase price)$/.test(
        normalized,
      )
    ) {
      columns.oldPurchasePrice = index;
      return;
    }

    if (
      columns.retailPrice === undefined &&
      /^(retail|retail price|list price|source retail price)$/.test(normalized)
    ) {
      columns.retailPrice = index;
      return;
    }

    if (
      columns.oldRetailPrice === undefined &&
      /^(old retail|old retail price|previous retail|previous retail price)$/.test(
        normalized,
      )
    ) {
      columns.oldRetailPrice = index;
      return;
    }

    if (
      columns.salePrice === undefined &&
      /^(sale price|sell price|selling price|final price)$/.test(normalized)
    ) {
      columns.salePrice = index;
    }
  });

  return columns;
}

function historyPreviewColumnValue(
  row: readonly string[],
  columnIndex: number | undefined,
) {
  return columnIndex === undefined ? "" : (row[columnIndex] ?? "");
}

function numericHistoryCell(value: string | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, "").replace(",", ".");

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function formatHistoryAmount(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Not available";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function historyBusinessMetrics(input: {
  data: Json | null;
  overlayStatus: ShopHistoryOverlayStatus;
  sessionOverlay: Json | null;
}) {
  const grid = stringGridFromJson(input.data);
  const columns = inferHistoryPreviewColumns(grid[0] ?? []);
  const overlay =
    input.overlayStatus === "ok"
      ? previewOverlay(input.sessionOverlay)
      : { complete: [], editable: [] };
  let totalQuantity = 0;
  let orderTotal = 0;
  let paymentTotal = 0;
  let hasQuantity = false;
  let hasOrder = false;
  let hasPayment = false;

  for (let rowIndex = 1; rowIndex < grid.length; rowIndex += 1) {
    const row = grid[rowIndex] ?? [];
    const sourceQuantity = numericHistoryCell(
      historyPreviewColumnValue(row, columns.quantity),
    );
    const purchasePrice = numericHistoryCell(
      historyPreviewColumnValue(row, columns.purchasePrice),
    );

    if (sourceQuantity !== null) {
      totalQuantity += sourceQuantity;
      hasQuantity = true;
    }

    if (sourceQuantity !== null && purchasePrice !== null) {
      orderTotal += sourceQuantity * purchasePrice;
      hasOrder = true;
    }

    if (overlay.complete[rowIndex] !== true) {
      continue;
    }

    const editableRow = overlay.editable[rowIndex] ?? [];
    const countedQuantity =
      numericHistoryCell(editableRow[0]) ??
      numericHistoryCell(
        historyPreviewColumnValue(row, columns.countedQuantity),
      ) ??
      sourceQuantity;
    const salePrice =
      numericHistoryCell(editableRow[1]) ??
      numericHistoryCell(historyPreviewColumnValue(row, columns.salePrice)) ??
      numericHistoryCell(historyPreviewColumnValue(row, columns.retailPrice)) ??
      purchasePrice;

    if (countedQuantity !== null && salePrice !== null) {
      paymentTotal += countedQuantity * salePrice;
      hasPayment = true;
    }
  }

  return {
    orderTotal: formatHistoryAmount(hasOrder ? orderTotal : null),
    paymentTotal: formatHistoryAmount(hasPayment ? paymentTotal : null),
    totalQuantity: formatHistoryAmount(hasQuantity ? totalQuantity : null),
  };
}

function firstHistoryDataCell(
  row: readonly string[],
  excludedIndexes: readonly (number | undefined)[],
) {
  const excluded = new Set(
    excludedIndexes.filter((value): value is number => value !== undefined),
  );

  return (
    row.find((cell, index) => !excluded.has(index) && cell.trim().length > 0) ??
    ""
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
  const columns = inferHistoryPreviewColumns(grid[0] ?? []);
  const canUseOverlay = overlayStatus === "ok";
  const overlay = canUseOverlay
    ? previewOverlay(sessionOverlay)
    : { complete: [], editable: [] };

  return grid.map((row, index) => {
    const editableRow = overlay.editable[index] ?? [];
    const isComplete = overlay.complete[index] === true;
    const barcode = historyPreviewColumnValue(row, columns.barcode) || inferBarcode(row);
    const name = historyPreviewColumnValue(row, columns.name) || inferName(row, barcode);
    const item =
      historyPreviewColumnValue(row, columns.item) ||
      firstHistoryDataCell(row, [columns.rowNumber]);
    const sourceQuantity = historyPreviewColumnValue(row, columns.quantity);
    const oldPurchasePrice = historyPreviewColumnValue(
      row,
      columns.oldPurchasePrice,
    );
    const oldRetailPrice = historyPreviewColumnValue(row, columns.oldRetailPrice);
    const countedQuantity =
      editableRow[0]?.trim() ||
      historyPreviewColumnValue(row, columns.countedQuantity);
    const sourceRetailPrice = historyPreviewColumnValue(row, columns.retailPrice);
    const salePrice =
      editableRow[1]?.trim() ||
      historyPreviewColumnValue(row, columns.salePrice);

    return {
      rowKey: `preview:${index + 1}`,
      rowNumber: safeHistoryCell(
        historyPreviewColumnValue(row, columns.rowNumber) || String(index + 1),
        16,
      ),
      complete: canUseOverlay
        ? isComplete
          ? "Complete"
          : "Missing"
        : "Overlay unavailable",
      countedQuantity: safeHistoryCell(countedQuantity, 24),
      editable:
        !canUseOverlay
          ? "Overlay unavailable"
          : editableRow.filter((cell) => cell.trim().length > 0).length > 0
          ? editableRow.map((cell) => safeHistoryCell(cell, 36)).join(" / ")
          : "Not set",
      item: safeHistoryCell(item),
      barcode: safeHistoryCell(barcode),
      name: safeHistoryCell(name),
      oldPurchasePrice: safeHistoryCell(oldPurchasePrice, 24),
      oldRetailPrice: safeHistoryCell(oldRetailPrice, 24),
      purchasePrice: safeHistoryCell(
        historyPreviewColumnValue(row, columns.purchasePrice),
        24,
      ),
      quantity: safeHistoryCell(sourceQuantity, 24),
      retailPrice: safeHistoryCell(sourceRetailPrice, 24),
      salePrice: safeHistoryCell(salePrice, 24),
      sourceQuantity: safeHistoryCell(sourceQuantity, 24),
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

  return events
    .filter(
      (event) =>
        event.domain === "history" &&
        event.sessionIds.includes(normalizedRemoteId),
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function sourceScopeDisplayName(sourceScope: ShopHistorySourceScope) {
  const labels: Record<ShopHistorySourceScope, string> = {
    legacy_owner_bridge: "Legacy owner bridge",
    shop_scoped: "Shop scoped",
  };

  return labels[sourceScope];
}

function compactHistoryDisplayValue(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeHistoryPage(value: GetShopHistoryReadModelOptions["page"]) {
  const numericValue = Math.floor(Number(value));

  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 1;
}

function normalizeHistoryPageSize(
  value: GetShopHistoryReadModelOptions["pageSize"],
): 10 | 25 | 50 | 100 | 200 {
  const numericValue = Number(value);

  return HISTORY_LIST_PAGE_SIZES.includes(
    numericValue as (typeof HISTORY_LIST_PAGE_SIZES)[number],
  )
    ? (numericValue as 10 | 25 | 50 | 100 | 200)
    : 10;
}

function normalizeHistoryStatusFilter(
  value: GetShopHistoryReadModelOptions["filters"] extends infer Filters
    ? Filters extends { status?: infer Status }
      ? Status
      : never
    : never,
): ShopHistoryStatusFilter {
  if (isHistoryActiveIssuesAlias(typeof value === "string" ? value : null)) {
    return "active_issues";
  }

  return value === "active" ||
    value === "all" ||
    value === "deleted" ||
    value === "issues" ||
    value === "technical"
    ? value
    : "active_issues";
}

function normalizeHistoryFilterValue(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim();

  return normalized ? normalized.slice(0, 120) : null;
}

function hasActiveHistoryListFilters(
  filters: NonNullable<ShopHistoryReadModel["filters"]>,
) {
  return Boolean(filters.month || filters.query || filters.status !== "active_issues");
}

function isHistoryActiveIssuesAlias(value: string | null | undefined) {
  return value === "active_issues" || value === "active_with_issues";
}

function normalizeHistoryMonthFilter(value: string | null | undefined) {
  const normalized = value?.trim();

  return normalized && /^\d{4}-\d{2}$/.test(normalized) ? normalized : null;
}

function historyMonthBounds(month: string | null) {
  if (!month) {
    return null;
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));

  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const end = new Date(Date.UTC(year, monthNumber, 1));

  return {
    end: end.toISOString(),
    start: start.toISOString(),
  };
}

function sanitizeHistorySearchQuery(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/[,%*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return normalized || null;
}

function historyDateLabel(value: string | null | undefined) {
  const compact = compactHistoryDisplayValue(value);

  if (!compact) {
    return "date not set";
  }

  const date = new Date(compact);

  if (Number.isNaN(date.getTime())) {
    return compact.slice(0, 16);
  }

  return date.toISOString().slice(0, 10);
}

function compactRemoteId(value: string) {
  const compact = compactHistoryDisplayValue(value);

  if (compact.length <= 32) {
    return compact;
  }

  return `${compact.slice(0, 20)}...${compact.slice(-8)}`;
}

function isUserFacingHistoryIdentifier(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toUpperCase();

  return (
    normalized.length === 0 ||
    (!normalized.startsWith("APPLY_IMPORT_") &&
      !normalized.startsWith("FULL_IMPORT_") &&
      !normalized.startsWith("TASK135_MATRIX_"))
  );
}

function isGenericHistoryDisplayName(value: string | null | undefined) {
  const normalized = compactHistoryDisplayValue(value).toLowerCase();

  return (
    normalized.length === 0 ||
    normalized === "history" ||
    normalized === "history entry" ||
    normalized === "mobile history" ||
    normalized === "mobile history entry" ||
    normalized === "manual entry" ||
    normalized === "shared sheet session" ||
    normalized === "not set" ||
    normalized === "untitled"
  );
}

function isTechnicalHistorySessionIdentity(input: {
  display_name: string | null | undefined;
  remote_id: string | null | undefined;
}) {
  return (
    !isUserFacingHistoryIdentifier(input.remote_id) ||
      !isUserFacingHistoryIdentifier(input.display_name)
  );
}

export function resolveHistorySessionEntryDate(input: {
  timestamp?: string | null | undefined;
  updated_at?: string | null | undefined;
  updatedAt?: string | null | undefined;
}) {
  return (
    compactHistoryDisplayValue(input.timestamp) ||
    compactHistoryDisplayValue(input.updated_at) ||
    compactHistoryDisplayValue(input.updatedAt)
  );
}

export function buildHistorySessionDisplayTitle(input: {
  category?: string | null | undefined;
  display_name?: string | null | undefined;
  displayName?: string | null | undefined;
  is_manual_entry?: boolean | null | undefined;
  isManualEntry?: boolean | null | undefined;
  remote_id?: string | null | undefined;
  remoteId?: string | null | undefined;
  supplier?: string | null | undefined;
  timestamp?: string | null | undefined;
  updated_at?: string | null | undefined;
  updatedAt?: string | null | undefined;
}) {
  const displayName = compactHistoryDisplayValue(
    input.display_name ?? input.displayName,
  );
  const remoteId = compactHistoryDisplayValue(input.remote_id ?? input.remoteId);

  if (
    !isGenericHistoryDisplayName(displayName) &&
    isUserFacingHistoryIdentifier(displayName) &&
    displayName.toLowerCase() !== remoteId.toLowerCase()
  ) {
    return displayName;
  }

  const isManualEntry = Boolean(input.is_manual_entry ?? input.isManualEntry);
  const entryDate = resolveHistorySessionEntryDate(input);

  if (isManualEntry) {
    return `Manual inventory - ${historyDateLabel(entryDate)}`;
  }

  const supplier = compactHistoryDisplayValue(input.supplier);
  const category = compactHistoryDisplayValue(input.category);
  const supplierCategory = [supplier, category].filter(Boolean).join(" / ");

  if (supplierCategory) {
    return supplierCategory;
  }

  return remoteId ? `History ${compactRemoteId(remoteId)}` : "History entry";
}

export function deriveHistorySessionSyncState(
  relatedEvents: readonly ShopSyncEventActivity[],
) {
  const latestEvent = relatedEvents[0] ?? null;

  if (!latestEvent) {
    return {
      latestRelatedSyncAt: null,
      latestRelatedSyncEvent: null,
      syncState: "not_available" as const,
      syncStateLabel: "Sync state not available",
    };
  }

  const labels: Record<Exclude<ShopHistorySyncState, "not_available">, string> = {
    failed: "Sync failed",
    pending: "Sync pending",
    success: "Synced",
  };

  return {
    latestRelatedSyncAt: latestEvent.createdAt,
    latestRelatedSyncEvent: latestEvent.eventType,
    syncState: latestEvent.status,
    syncStateLabel: `${labels[latestEvent.status]}: ${latestEvent.eventType}`,
  };
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

function mapLegacySessionListRow(
  row: LegacySharedSheetSessionListRow,
  sourceScope: ShopHistorySourceScope,
): ScopedSharedSheetSessionListRow {
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

function mapSessionList(
  row: ScopedSharedSheetSessionListRow,
  events: readonly ShopSyncEventActivity[],
): ShopHistorySession {
  const overlayStatus: ShopHistoryOverlayStatus =
    row.payload_version < SESSION_PAYLOAD_VERSION ? "legacy_v1" : "ok";
  const relatedEvents = mapRelatedHistorySyncEvents(row.remote_id, events);
  const syncState = deriveHistorySessionSyncState(relatedEvents);
  const entryDate = resolveHistorySessionEntryDate(row);
  const displayTitle = buildHistorySessionDisplayTitle(row);

  return {
    remoteId: row.remote_id,
    displayName: row.display_name,
    displayTitle,
    supplier: row.supplier,
    category: row.category,
    entryDate,
    timestamp: row.timestamp,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    payloadVersion: row.payload_version,
    state: row.deleted_at ? "tombstone" : "active",
    sourceScope: row.sourceScope,
    isManualEntry: row.is_manual_entry,
    isTechnicalEntry: isTechnicalHistorySessionIdentity(row),
    rowCount: 0,
    itemRowCount: 0,
    columnCount: 0,
    completeCount: 0,
    missingCount: 0,
    overlayStatus,
    overlaySchema: null,
    overlayBytes: 0,
    editableRows: 0,
    completeRows: 0,
    relatedSyncEventCount: relatedEvents.length,
    diagnosticsAvailable: false,
    ...syncState,
    orderTotal: "Not available",
    paymentTotal: "Not available",
    totalQuantity: "Not available",
    dataSummary: "Deferred to detail",
    overlaySummary: "Deferred to detail",
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
  const businessMetrics = historyBusinessMetrics({
    data: row.data,
    overlayStatus: overlayAnalysis.overlayStatus,
    sessionOverlay: row.session_overlay,
  });
  const relatedEvents = mapRelatedHistorySyncEvents(row.remote_id, events);
  const syncState = deriveHistorySessionSyncState(relatedEvents);
  const entryDate = resolveHistorySessionEntryDate(row);
  const displayTitle = buildHistorySessionDisplayTitle(row);

  return {
    remoteId: row.remote_id,
    displayName: row.display_name,
    displayTitle,
    supplier: row.supplier,
    category: row.category,
    entryDate,
    timestamp: row.timestamp,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    payloadVersion: row.payload_version,
    state: row.deleted_at ? "tombstone" : "active",
    sourceScope: row.sourceScope,
    isManualEntry: row.is_manual_entry,
    isTechnicalEntry: isTechnicalHistorySessionIdentity(row),
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
    diagnosticsAvailable: true,
    ...syncState,
    orderTotal: businessMetrics.orderTotal,
    paymentTotal: businessMetrics.paymentTotal,
    totalQuantity: businessMetrics.totalQuantity,
    dataSummary: summarizeJson(row.data),
    overlaySummary: summarizeJson(row.session_overlay),
  };
}

function mapSessionDiagnostics(
  row: ScopedSharedSheetSessionDiagnosticsRow,
  events: readonly ShopSyncEventActivity[],
): ShopHistorySession {
  const relatedEvents = mapRelatedHistorySyncEvents(row.remote_id, events);
  const syncState = deriveHistorySessionSyncState(relatedEvents);
  const overlayStatus = row.overlay_status as ShopHistoryOverlayStatus;
  const entryDate = resolveHistorySessionEntryDate(row);
  const displayTitle = buildHistorySessionDisplayTitle(row);

  return {
    remoteId: row.remote_id,
    displayName: row.display_name,
    displayTitle,
    supplier: row.supplier,
    category: row.category,
    entryDate,
    timestamp: row.timestamp,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    payloadVersion: row.payload_version,
    state: row.deleted_at ? "tombstone" : "active",
    sourceScope: row.sourceScope,
    isManualEntry: row.is_manual_entry,
    isTechnicalEntry: isTechnicalHistorySessionIdentity(row),
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
    diagnosticsAvailable: true,
    ...syncState,
    orderTotal: "Not available",
    paymentTotal: "Not available",
    totalQuantity: "Not available",
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

type HistoryListQuery<Row> = {
  eq: (column: string, value: string) => HistoryListQuery<Row>;
  gt: (column: string, value: number | string) => HistoryListQuery<Row>;
  gte: (column: string, value: string) => HistoryListQuery<Row>;
  is: (column: string, value: null) => HistoryListQuery<Row>;
  lt: (column: string, value: string) => HistoryListQuery<Row>;
  not: (
    column: string,
    operator: string,
    value: null | string,
  ) => HistoryListQuery<Row>;
  or: (filters: string) => HistoryListQuery<Row>;
  order: (
    column: string,
    options: {
      ascending: boolean;
    },
  ) => HistoryListQuery<Row>;
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{
    count: number | null;
    data: Row[] | null;
    error: unknown | null;
  }>;
};

type HistoryListTable<Row> = {
  select: (
    columns: string,
    options?: {
      count: "exact";
    },
  ) => HistoryListQuery<Row>;
};

function historyListSelectOptions(
  filters: NonNullable<ShopHistoryReadModel["filters"]>,
) {
  return hasActiveHistoryListFilters(filters)
    ? undefined
    : ({ count: "exact" } as const);
}

function historyListRangeTo(input: {
  filters: NonNullable<ShopHistoryReadModel["filters"]>;
  to: number;
}) {
  return hasActiveHistoryListFilters(input.filters) ? input.to + 1 : input.to;
}

function historyListTotal(input: {
  count: number | null | undefined;
  from: number;
  rowCount: number;
  usesDeferredCount: boolean;
}) {
  return input.usesDeferredCount
    ? input.from + input.rowCount
    : input.count ?? input.rowCount;
}

function historyListTotalStatus(
  filters: NonNullable<ShopHistoryReadModel["filters"]>,
) {
  return hasActiveHistoryListFilters(filters) ? "deferred" as const : "exact" as const;
}

type SupportedHistoryCountTable =
  | "shared_sheet_sessions"
  | "shared_sheet_session_diagnostics"
  | "sync_events";

const SUPPORTED_HISTORY_TOTAL_TABLES = [
  "shared_sheet_sessions",
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
      historySessionsTotalAvailable: !error,
      latestChangedAt: null,
      latestFailedSyncEvents: 0,
      syncEventsTotal,
      syncEventsTotalAvailable: !error,
    } satisfies ShopHistorySummary,
  };
}

async function loadShopScopedHistoryPresence(input: {
  selectedShopId: string;
  supabase: SupabaseServerClient;
}) {
  const [diagnosticsResult, sessionsResult] = await Promise.all([
    countHistoryRows({
      scope: {
        kind: "shop_scoped",
        shopId: input.selectedShopId,
      },
      supabase: input.supabase,
      table: "shared_sheet_session_diagnostics",
    }),
    countHistoryRows({
      scope: {
        kind: "shop_scoped",
        shopId: input.selectedShopId,
      },
      supabase: input.supabase,
      table: "shared_sheet_sessions",
    }),
  ]);
  const error = diagnosticsResult.error ?? sessionsResult.error ?? null;
  const count = (diagnosticsResult.count ?? 0) + (sessionsResult.count ?? 0);

  return {
    count,
    error,
    hasRows: count > 0,
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
    const shopScopedHistoryPresence = await loadShopScopedHistoryPresence({
      selectedShopId: selectedShop.shopId,
      supabase,
    });

    if (!shopScopedHistoryPresence.error && shopScopedHistoryPresence.hasRows) {
      return {
        blockingSource: null,
        error: null,
        legacyOwnerUserId: null,
        mapping: null,
      };
    }

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
    title: analysis.displayTitle,
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
      detailField("entryDate", "Entry date", analysis.entryDate),
      detailField("rows", "Data rows", analysis.rowCount),
      detailField("columns", "Columns", analysis.columnCount),
      detailField("totalQuantity", "Total quantity", analysis.totalQuantity),
      detailField("orderTotal", "Order total", analysis.orderTotal),
      detailField("paymentTotal", "Paid total", analysis.paymentTotal),
      detailField("completed", "Completed rows", analysis.completeCount),
      detailField("missing", "Missing rows", analysis.missingCount),
      detailField("overlay", "Overlay status", overlayStatusDisplayName(analysis.overlayStatus)),
      detailField("overlayTrust", "Overlay trust", overlayTrust),
      detailField("overlaySchema", "Overlay schema", analysis.overlaySchema),
      detailField("overlayBytes", "Overlay bytes", analysis.overlayBytes),
      detailField("editableRows", "Editable rows", analysis.editableRows),
      detailField("completeRows", "Complete flags", analysis.completeRows),
      detailField("relatedEvents", "Related sync events", relatedSyncEvents.length),
      detailField("syncState", "Sync state", analysis.syncStateLabel),
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

const historyListSessionSelect =
  "remote_id,shop_id,display_name,supplier,category,timestamp,updated_at,deleted_at,payload_version,is_manual_entry";
const legacyHistoryListSessionSelect =
  "remote_id,display_name,supplier,category,timestamp,updated_at,deleted_at,payload_version,is_manual_entry";
const historyDiagnosticsSessionSelect =
  "remote_id,shop_id,owner_user_id,display_name,supplier,category,timestamp,updated_at,deleted_at,payload_version,is_manual_entry,data_rows,item_rows,column_count,overlay_status,overlay_schema,overlay_bytes,editable_rows,complete_rows,complete_count,missing_count,data_summary,overlay_summary";

function applyHistoryListFilters<Row>(
  query: HistoryListQuery<Row>,
  filters: NonNullable<ShopHistoryReadModel["filters"]>,
  mode: "diagnostics" | "sessions",
) {
  let nextQuery = query;
  const monthBounds = historyMonthBounds(filters.month);
  const searchQuery = sanitizeHistorySearchQuery(filters.query);

  if (filters.status === "deleted") {
    nextQuery = nextQuery.not("deleted_at", "is", null);
  } else if (filters.status !== "all") {
    nextQuery = nextQuery.is("deleted_at", null);
  }

  if (mode === "diagnostics" && filters.status === "issues") {
    nextQuery = nextQuery.or("missing_count.gt.0,overlay_status.neq.ok");
  }

  if (monthBounds) {
    nextQuery = nextQuery
      .gte("timestamp", monthBounds.start)
      .lt("timestamp", monthBounds.end);
  }

  if (searchQuery) {
    nextQuery = nextQuery.or(
      [
        `remote_id.ilike.*${searchQuery}*`,
        `display_name.ilike.*${searchQuery}*`,
        `supplier.ilike.*${searchQuery}*`,
        `category.ilike.*${searchQuery}*`,
      ].join(","),
    );
  }

  return nextQuery;
}

function compareHistoryListRows(
  left: { remote_id: string; timestamp: string; updated_at: string },
  right: { remote_id: string; timestamp: string; updated_at: string },
) {
  return (
    right.timestamp.localeCompare(left.timestamp) ||
    right.updated_at.localeCompare(left.updated_at) ||
    left.remote_id.localeCompare(right.remote_id)
  );
}

function compareMappedHistorySessions(
  left: { remoteId: string; timestamp: string; updatedAt: string },
  right: { remoteId: string; timestamp: string; updatedAt: string },
) {
  return (
    right.timestamp.localeCompare(left.timestamp) ||
    right.updatedAt.localeCompare(left.updatedAt) ||
    left.remoteId.localeCompare(right.remoteId)
  );
}

function isHistoryRangeNotSatisfiableError(error: unknown) {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    (error as { code?: unknown }).code === "PGRST103"
  );
}

function mergeHistoryPageRows<
  Row extends { remote_id: string; timestamp: string; updated_at: string },
>(
  primaryRows: readonly Row[],
  fallbackRows: readonly Row[],
  pageSize: number,
  from = 0,
) {
  return mergeRowsByKey(primaryRows, fallbackRows, (row) => row.remote_id)
    .sort(compareHistoryListRows)
    .slice(from, from + pageSize);
}

async function loadHistoryListDiagnostics(input: {
  filters: NonNullable<ShopHistoryReadModel["filters"]>;
  from: number;
  legacyOwnerUserId: string | null;
  pageSize: number;
  selectedShop: ShopAdminShellShop;
  supabase: ShopHistoryReadClient;
  to: number;
}) {
  const diagnosticsTable = input.supabase.from(
    "shared_sheet_session_diagnostics",
  ) as unknown as HistoryListTable<SharedSheetSessionDiagnosticsRow>;
  const usesDeferredCount = hasActiveHistoryListFilters(input.filters);
  const rangeTo = historyListRangeTo(input);
  const directDiagnosticsQuery = applyHistoryListFilters(
    diagnosticsTable
      .select(historyDiagnosticsSessionSelect, historyListSelectOptions(input.filters))
      .eq("shop_id", input.selectedShop.shopId),
    input.filters,
    "diagnostics",
  )
    .order("timestamp", { ascending: false })
    .order("remote_id", { ascending: true });
  const directDiagnosticsResult = await directDiagnosticsQuery.range(
    input.legacyOwnerUserId ? 0 : input.from,
    rangeTo,
  );

  if (isHistoryRangeNotSatisfiableError(directDiagnosticsResult.error)) {
    return {
      diagnostics: [] as ScopedSharedSheetSessionDiagnosticsRow[],
      error: null,
      fallbackToSessions: false,
      totalCount: 0,
      totalCountStatus: "deferred" as const,
    };
  }

  if (
    directDiagnosticsResult.error &&
    !isLegacyHistorySchemaError(directDiagnosticsResult.error)
  ) {
    return {
      diagnostics: [] as ScopedSharedSheetSessionDiagnosticsRow[],
      error: null,
      fallbackToSessions: true,
      totalCount: 0,
      totalCountStatus: "deferred" as const,
    };
  }

  if (directDiagnosticsResult.error) {
    return {
      diagnostics: [] as ScopedSharedSheetSessionDiagnosticsRow[],
      error: null,
      fallbackToSessions: true,
      totalCount: 0,
      totalCountStatus: "deferred" as const,
    };
  }

  const directDiagnostics: ScopedSharedSheetSessionDiagnosticsRow[] = ((
    directDiagnosticsResult.data ?? []
  ) as SharedSheetSessionDiagnosticsRow[])
    .slice(0, input.legacyOwnerUserId ? undefined : input.pageSize)
    .map((row) => ({
      ...row,
      sourceScope: "shop_scoped" as const,
    }));

  if (!input.legacyOwnerUserId) {
    return {
      diagnostics: directDiagnostics,
      error: null,
      fallbackToSessions: false,
      totalCount: historyListTotal({
        count: directDiagnosticsResult.count,
        from: input.from,
        rowCount: directDiagnostics.length,
        usesDeferredCount,
      }),
      totalCountStatus: historyListTotalStatus(input.filters),
    };
  }

  const legacyDiagnosticsQuery = applyHistoryListFilters(
    diagnosticsTable
      .select(historyDiagnosticsSessionSelect, historyListSelectOptions(input.filters))
      .is("shop_id", null)
      .eq("owner_user_id", input.legacyOwnerUserId),
    input.filters,
    "diagnostics",
  )
    .order("timestamp", { ascending: false })
    .order("remote_id", { ascending: true });
  const legacyDiagnosticsResult = await legacyDiagnosticsQuery.range(
    0,
    rangeTo,
  );

  if (isHistoryRangeNotSatisfiableError(legacyDiagnosticsResult.error)) {
    return {
      diagnostics: mergeHistoryPageRows(
        directDiagnostics,
        [],
        input.pageSize,
        input.from,
      ),
      error: null,
      fallbackToSessions: false,
      totalCount: directDiagnosticsResult.count ?? directDiagnostics.length,
      totalCountStatus: "deferred" as const,
    };
  }

  if (
    legacyDiagnosticsResult.error &&
    !isLegacyHistorySchemaError(legacyDiagnosticsResult.error)
  ) {
    return {
      diagnostics: directDiagnostics,
      error: legacyDiagnosticsResult.error,
      fallbackToSessions: false,
      totalCount: directDiagnosticsResult.count ?? directDiagnostics.length,
      totalCountStatus: "deferred" as const,
    };
  }

  if (legacyDiagnosticsResult.error) {
    return {
      diagnostics: directDiagnostics,
      error: null,
      fallbackToSessions: directDiagnostics.length === 0,
      totalCount: directDiagnosticsResult.count ?? directDiagnostics.length,
      totalCountStatus: "deferred" as const,
    };
  }

  const legacyDiagnostics: ScopedSharedSheetSessionDiagnosticsRow[] = ((
    legacyDiagnosticsResult.data ?? []
  ) as SharedSheetSessionDiagnosticsRow[]).map((row) => ({
    ...row,
    sourceScope: "legacy_owner_bridge" as const,
  }));
  const mergedDiagnostics = mergeHistoryPageRows(
    directDiagnostics,
    legacyDiagnostics,
    input.pageSize,
    input.from,
  );

  return {
    diagnostics: mergedDiagnostics,
    error: null,
    fallbackToSessions: false,
    totalCount: usesDeferredCount
      ? input.from + mergedDiagnostics.length
      : (directDiagnosticsResult.count ?? directDiagnostics.length) +
        (legacyDiagnosticsResult.count ?? legacyDiagnostics.length),
    totalCountStatus: historyListTotalStatus(input.filters),
  };
}

async function loadHistoryListSessions(input: {
  filters: NonNullable<ShopHistoryReadModel["filters"]>;
  from: number;
  legacyOwnerUserId: string | null;
  pageSize: number;
  selectedShop: ShopAdminShellShop;
  supabase: ShopHistoryReadClient;
  to: number;
}) {
  const sessionsTable = input.supabase.from(
    "shared_sheet_sessions",
  ) as unknown as HistoryListTable<SharedSheetSessionListRow>;
  const usesDeferredCount = hasActiveHistoryListFilters(input.filters);
  const rangeTo = historyListRangeTo(input);
  const directSessionsQuery = applyHistoryListFilters(
    sessionsTable
      .select(historyListSessionSelect, historyListSelectOptions(input.filters))
      .eq("shop_id", input.selectedShop.shopId),
    input.filters,
    "sessions",
  )
    .order("timestamp", { ascending: false })
    .order("remote_id", { ascending: true });
  const directSessionsResult = await directSessionsQuery.range(
    input.legacyOwnerUserId ? 0 : input.from,
    rangeTo,
  );

  if (isHistoryRangeNotSatisfiableError(directSessionsResult.error)) {
    return {
      error: null,
      sessions: [] as ScopedSharedSheetSessionListRow[],
      totalCount: 0,
      totalCountStatus: "deferred" as const,
    };
  }

  if (
    directSessionsResult.error &&
    !isLegacyHistorySchemaError(directSessionsResult.error)
  ) {
    return {
      error: directSessionsResult.error,
      sessions: [] as ScopedSharedSheetSessionListRow[],
      totalCount: 0,
      totalCountStatus: "deferred" as const,
    };
  }

  const directSessions: ScopedSharedSheetSessionListRow[] =
    directSessionsResult.error
      ? []
      : ((directSessionsResult.data ?? []) as SharedSheetSessionListRow[])
          .slice(0, input.legacyOwnerUserId ? undefined : input.pageSize)
          .map((row) => ({
            ...row,
            sourceScope: "shop_scoped" as const,
          }));

  if (!input.legacyOwnerUserId) {
    return {
      error: null,
      sessions: directSessions,
      totalCount: historyListTotal({
        count: directSessionsResult.count,
        from: input.from,
        rowCount: directSessions.length,
        usesDeferredCount: usesDeferredCount || Boolean(directSessionsResult.error),
      }),
      totalCountStatus: directSessionsResult.error
        ? "deferred" as const
        : historyListTotalStatus(input.filters),
    };
  }

  const ownerSessionsQuery = applyHistoryListFilters(
    sessionsTable
      .select(historyListSessionSelect, historyListSelectOptions(input.filters))
      .is("shop_id", null)
      .eq("owner_user_id", input.legacyOwnerUserId),
    input.filters,
    "sessions",
  )
    .order("timestamp", { ascending: false })
    .order("remote_id", { ascending: true });
  const ownerSessionsResult = await ownerSessionsQuery.range(
    0,
    rangeTo,
  );

  if (isHistoryRangeNotSatisfiableError(ownerSessionsResult.error)) {
    return {
      error: null,
      sessions: mergeHistoryPageRows(
        directSessions,
        [],
        input.pageSize,
        input.from,
      ),
      totalCount: directSessionsResult.count ?? directSessions.length,
      totalCountStatus: "deferred" as const,
    };
  }

  if (
    ownerSessionsResult.error &&
    !isLegacyHistorySchemaError(ownerSessionsResult.error)
  ) {
    return {
      error: ownerSessionsResult.error,
      sessions: directSessions,
      totalCount: directSessionsResult.count ?? directSessions.length,
      totalCountStatus: "deferred" as const,
    };
  }

  if (
    ownerSessionsResult.error &&
    isLegacyHistorySchemaError(ownerSessionsResult.error)
  ) {
    const legacySessionsTable = input.supabase.from(
      "shared_sheet_sessions",
    ) as unknown as HistoryListTable<LegacySharedSheetSessionListRow>;
    const legacyOwnerSessionsQuery = applyHistoryListFilters(
      legacySessionsTable
        .select(legacyHistoryListSessionSelect, historyListSelectOptions(input.filters))
        .eq("owner_user_id", input.legacyOwnerUserId),
      input.filters,
      "sessions",
    )
      .order("timestamp", { ascending: false })
      .order("remote_id", { ascending: true });
    const legacyOwnerSessionsResult = await legacyOwnerSessionsQuery.range(
      0,
      rangeTo,
    );

    if (isHistoryRangeNotSatisfiableError(legacyOwnerSessionsResult.error)) {
      return {
        error: null,
        sessions: mergeHistoryPageRows(
          directSessions,
          [],
          input.pageSize,
          input.from,
        ),
        totalCount: directSessionsResult.count ?? directSessions.length,
        totalCountStatus: "deferred" as const,
      };
    }

    if (legacyOwnerSessionsResult.error) {
      return {
        error: legacyOwnerSessionsResult.error,
        sessions: directSessions,
        totalCount: directSessionsResult.count ?? directSessions.length,
        totalCountStatus: "deferred" as const,
      };
    }

    const legacySessions = ((legacyOwnerSessionsResult.data ??
      []) as LegacySharedSheetSessionListRow[]).map((row) =>
      mapLegacySessionListRow(row, "legacy_owner_bridge"),
    );
    const mergedSessions = mergeHistoryPageRows(
      directSessions,
      legacySessions,
      input.pageSize,
      input.from,
    );

    return {
      error: null,
      sessions: mergedSessions,
      totalCount: usesDeferredCount
        ? input.from + mergedSessions.length
        : (directSessionsResult.count ?? directSessions.length) +
          (legacyOwnerSessionsResult.count ?? legacySessions.length),
      totalCountStatus: historyListTotalStatus(input.filters),
    };
  }

  const ownerSessions = ((ownerSessionsResult.data ??
    []) as SharedSheetSessionListRow[]).map((row) => ({
    ...row,
    sourceScope: "legacy_owner_bridge" as const,
  }));
  const mergedSessions = mergeHistoryPageRows(
    ownerSessions,
    directSessions,
    input.pageSize,
    input.from,
  );

  return {
    error: null,
    sessions: mergedSessions,
    totalCount: usesDeferredCount
      ? input.from + mergedSessions.length
      : (ownerSessionsResult.count ?? ownerSessions.length) +
        (directSessionsResult.count ?? directSessions.length),
    totalCountStatus: historyListTotalStatus(input.filters),
  };
}

async function loadHistoryListMetricSessions(input: {
  legacyOwnerUserId: string | null;
  remoteIds: readonly string[];
  selectedShop: ShopAdminShellShop;
  supabase: SupabaseAdminClient | SupabaseServerClient;
}) {
  if (input.remoteIds.length === 0) {
    return [];
  }

  const directSessionsResult = await input.supabase
    .from("shared_sheet_sessions")
    .select(
      "remote_id,shop_id,display_name,supplier,category,timestamp,updated_at,deleted_at,payload_version,is_manual_entry,data,session_overlay",
    )
    .eq("shop_id", input.selectedShop.shopId)
    .in("remote_id", input.remoteIds)
    .order("timestamp", { ascending: false })
    .limit(input.remoteIds.length);

  const directSessions: ScopedSharedSheetSessionRow[] =
    directSessionsResult.error
      ? []
      : ((directSessionsResult.data ?? []) as SharedSheetSessionRow[]).map(
          (row) => ({
            ...row,
            sourceScope: "shop_scoped" as const,
          }),
        );

  if (!input.legacyOwnerUserId) {
    return directSessions;
  }

  const ownerSessionsResult = await input.supabase
    .from("shared_sheet_sessions")
    .select(
      "remote_id,shop_id,display_name,supplier,category,timestamp,updated_at,deleted_at,payload_version,is_manual_entry,data,session_overlay",
    )
    .is("shop_id", null)
    .eq("owner_user_id", input.legacyOwnerUserId)
    .in("remote_id", input.remoteIds)
    .order("timestamp", { ascending: false })
    .limit(input.remoteIds.length);

  if (ownerSessionsResult.error && !isLegacyHistorySchemaError(ownerSessionsResult.error)) {
    return directSessions;
  }

  if (ownerSessionsResult.error && isLegacyHistorySchemaError(ownerSessionsResult.error)) {
    const legacyOwnerSessionsResult = await input.supabase
      .from("shared_sheet_sessions")
      .select(
        "remote_id,display_name,supplier,category,timestamp,updated_at,deleted_at,payload_version,is_manual_entry,data,session_overlay",
      )
      .eq("owner_user_id", input.legacyOwnerUserId)
      .in("remote_id", input.remoteIds)
      .order("timestamp", { ascending: false })
      .limit(input.remoteIds.length);

    if (legacyOwnerSessionsResult.error) {
      return directSessions;
    }

    const legacySessions = ((legacyOwnerSessionsResult.data ??
      []) as LegacySharedSheetSessionRow[]).map((row) =>
      mapLegacySessionRow(row, "legacy_owner_bridge"),
    );

    return mergeRowsByKey(
      directSessions,
      legacySessions,
      (session) => session.remote_id,
    );
  }

  const ownerSessions = ((ownerSessionsResult.data ??
    []) as SharedSheetSessionRow[]).map((row) => ({
    ...row,
    sourceScope: "legacy_owner_bridge" as const,
  }));

  return mergeRowsByKey(
    ownerSessions,
    directSessions,
    (session) => session.remote_id,
  );
}

export async function getShopHistoryListReadModel(
  options: GetShopHistoryReadModelOptions = {},
): Promise<ShopHistoryReadModel> {
  const access = await resolveShopAdminDataAccess(options);
  const page = normalizeHistoryPage(options.page);
  const pageSize = normalizeHistoryPageSize(options.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const filters: NonNullable<ShopHistoryReadModel["filters"]> = {
    month: normalizeHistoryMonthFilter(options.filters?.month),
    query: normalizeHistoryFilterValue(options.filters?.query),
    status: normalizeHistoryStatusFilter(options.filters?.status ?? null),
  };
  const emptyPagination: NonNullable<ShopHistoryReadModel["pagination"]> = {
    currentPageRows: 0,
    from,
    hasNextPage: false,
    hasPreviousPage: page > 1,
    page,
    pageSize,
    rangeEnd: 0,
    rangeStart: 0,
    to,
    totalCount: 0,
    totalCountStatus: "deferred",
    totalPages: 1,
  };

  if (access.status !== "ready") {
    return {
      status:
        access.status === "not_configured" || access.status === "error"
          ? access.status
          : "unauthorized",
      ...emptyRows,
      filters,
      pagination: emptyPagination,
      listMode: "light",
      readOnly: true,
      source: "supabase_server",
      reason: access.reason,
    };
  }

  const { selectedShop, supabase } = access;
  const historyListClient =
    access.principalKind === "personal_account"
      ? createSupabaseAdminClient(resolveSupabaseAdminConfig()) ?? supabase
      : supabase;
  const sourceState = await resolveHistorySourceState(supabase, selectedShop);

  if (sourceState.error) {
    return {
      status: "error",
      selectedShop,
      mapping: null,
      syncEvents: [],
      sessions: [],
      summary: emptyRows.summary,
      filters,
      pagination: emptyPagination,
      listMode: "light",
      readOnly: true,
      source: "supabase_server",
      reason: "Mobile history mapping could not be loaded.",
      error: redactHistoryReadModelError(sourceState.error),
    };
  }

  const mapping = sourceState.mapping ?? null;
  const legacyOwnerUserId = sourceState.legacyOwnerUserId ?? null;
  const syncEventsResult = await loadHistorySyncEventsForShop(
    supabase,
    selectedShop,
    legacyOwnerUserId,
  );
  const syncEvents = syncEventsResult.error ? [] : syncEventsResult.events;
  const diagnosticsResult = await loadHistoryListDiagnostics({
    filters,
    from,
    legacyOwnerUserId,
    pageSize,
    selectedShop,
    supabase: historyListClient,
    to,
  });

  if (diagnosticsResult.error) {
    return {
      status: "error",
      selectedShop,
      mapping,
      syncEvents,
      sessions: [],
      summary: emptyRows.summary,
      filters,
      pagination: emptyPagination,
      listMode: "light",
      readOnly: true,
      source: "supabase_server",
      reason: "Lightweight mobile history rows could not be loaded through RLS.",
      error: redactHistoryReadModelError(diagnosticsResult.error),
    };
  }

  const supplementDiagnosticsWithSessions =
    !diagnosticsResult.fallbackToSessions &&
    hasActiveHistoryListFilters(filters);
  const sessionResult =
    diagnosticsResult.fallbackToSessions ||
    supplementDiagnosticsWithSessions
      ? await loadHistoryListSessions({
          filters,
          from,
          legacyOwnerUserId,
          pageSize,
          selectedShop,
          supabase: historyListClient,
          to,
        })
      : {
          error: null,
          sessions: [] as ScopedSharedSheetSessionListRow[],
          totalCount: diagnosticsResult.totalCount,
          totalCountStatus: diagnosticsResult.totalCountStatus,
        };
  const metricSessions =
    diagnosticsResult.diagnostics.length > 0
      ? await loadHistoryListMetricSessions({
          legacyOwnerUserId,
          remoteIds: diagnosticsResult.diagnostics.map(
            (session) => session.remote_id,
          ),
          selectedShop,
          supabase: historyListClient,
        })
      : [];
  const metricSessionsByRemoteId = new Map(
    metricSessions.map((session) => [
      session.remote_id,
      mapSession(session, syncEvents),
    ]),
  );
  const shopScopedHistoryPresence =
    sourceState.blockingSource && !legacyOwnerUserId
      ? await loadShopScopedHistoryPresence({
          selectedShopId: selectedShop.shopId,
          supabase,
        })
      : { count: 0, error: null, hasRows: false };

  if (sessionResult.error) {
    return {
      status: "error",
      selectedShop,
      mapping,
      syncEvents,
      sessions: [],
      summary: emptyRows.summary,
      filters,
      pagination: emptyPagination,
      listMode: "light",
      readOnly: true,
      source: "supabase_server",
      reason:
        "Lightweight mobile history fallback rows could not be loaded through RLS.",
      error: redactHistoryReadModelError(sessionResult.error),
    };
  }

  if (
    sourceState.blockingSource &&
    !legacyOwnerUserId &&
    page === 1 &&
    !hasActiveHistoryListFilters(filters) &&
    !shopScopedHistoryPresence.hasRows
  ) {
    return {
      status: "unmapped",
      selectedShop,
      mapping: null,
      syncEvents: [],
      sessions: [],
      summary: emptyRows.summary,
      filters,
      pagination: emptyPagination,
      listMode: "light",
      readOnly: true,
      source: "supabase_server",
      reason:
        "A legacy mobile source exists for this shop, but it is not mapped yet.",
    };
  }

  const sessions = (() => {
    if (diagnosticsResult.diagnostics.length > 0) {
      const diagnosticsSessions = diagnosticsResult.diagnostics.map((session) => {
        const diagnosticsSession = mapSessionDiagnostics(session, syncEvents);
        const metricSession = metricSessionsByRemoteId.get(session.remote_id);

        return metricSession
          ? {
              ...diagnosticsSession,
              orderTotal: metricSession.orderTotal,
              paymentTotal: metricSession.paymentTotal,
              totalQuantity: metricSession.totalQuantity,
            }
          : diagnosticsSession;
      });
      const supplementalSessions = supplementDiagnosticsWithSessions
        ? sessionResult.sessions.map((session) =>
            mapSessionList(session, syncEvents),
          )
        : [];

      return mergeRowsByKey(
        diagnosticsSessions,
        supplementalSessions,
        (session) => session.remoteId,
      )
        .sort(compareMappedHistorySessions)
        .slice(0, pageSize);
    }

    return sessionResult.sessions.map((session) =>
      mapSessionList(session, syncEvents),
    );
  })();
  const totalCount = diagnosticsResult.fallbackToSessions
    ? sessionResult.totalCount
    : supplementDiagnosticsWithSessions
      ? from + sessions.length
      : diagnosticsResult.totalCount;
  const totalCountStatus = diagnosticsResult.fallbackToSessions
    ? sessionResult.totalCountStatus
    : diagnosticsResult.totalCountStatus;
  const totalPages =
    totalCountStatus === "exact" && totalCount > 0
      ? Math.max(1, Math.ceil(totalCount / pageSize))
      : Math.max(1, page + (sessions.length >= pageSize ? 1 : 0));
  const rangeStart = sessions.length === 0 ? 0 : from + 1;
  const rangeEnd = sessions.length === 0 ? 0 : from + sessions.length;
  const latestChangedAt = sessions.reduce<string | null>(
    (latest, session) =>
      !latest || session.entryDate > latest ? session.entryDate : latest,
    null,
  );
  let historyListReason =
    "Lightweight mobile history list loaded from shared_sheet_session_diagnostics server-side.";

  if (diagnosticsResult.fallbackToSessions) {
    historyListReason =
      "Lightweight mobile history list loaded from shared_sheet_sessions fallback; diagnostics are deferred to detail.";
  } else if (
    legacyOwnerUserId &&
    sessions.some((session) => session.sourceScope === "legacy_owner_bridge")
  ) {
    historyListReason =
      "Lightweight mobile history list loaded from diagnostics with legacy owner fallback.";
  }

  return {
    status: "ready",
    selectedShop,
    mapping,
    syncEvents,
    sessions,
    filters,
    pagination: {
      currentPageRows: sessions.length,
      from,
      hasNextPage:
        totalCountStatus === "exact" ? page < totalPages : sessions.length >= pageSize,
      hasPreviousPage: page > 1,
      page,
      pageSize,
      rangeEnd,
      rangeStart,
      to,
      totalCount,
      totalCountStatus,
      totalPages,
    },
    summary: {
      historySessionsTotal: totalCount,
      historySessionsTotalAvailable: totalCountStatus === "exact",
      latestChangedAt,
      latestFailedSyncEvents: syncEvents.filter(
        (event) => event.status === "failed",
      ).length,
      syncEventsTotal: syncEvents.length,
      syncEventsTotalAvailable: !syncEventsResult.error,
    },
    listMode: "light",
    readOnly: true,
    source: "supabase_server",
    reason: historyListReason,
  };
}

export async function getShopSyncReadModel(
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
      reason: "Mobile sync mapping could not be loaded.",
      error: redactHistoryReadModelError(sourceState.error),
    };
  }

  const mapping = sourceState.mapping ?? null;
  const legacyOwnerUserId = sourceState.legacyOwnerUserId ?? null;
  const directSyncEventsResult = await supabase
    .from("sync_events")
    .select(
      "id,shop_id,batch_id,client_event_id,domain,event_type,source,source_device_id,changed_count,entity_ids,metadata,created_at",
    )
    .eq("shop_id", selectedShop.shopId)
    .in("domain", ["history", "catalog", "prices"])
    .order("created_at", { ascending: false })
    .limit(25);

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
      summary: emptyRows.summary,
      readOnly: true,
      source: "supabase_server",
      reason: "Shop-scoped sync events could not be loaded through RLS.",
      error: redactHistoryReadModelError(directSyncEventsResult.error),
    };
  }

  const directSyncEventRows: ScopedSyncEventRow[] =
    directSyncEventsResult.error
      ? []
      : ((directSyncEventsResult.data ?? []) as SyncEventRow[]).map((row) => ({
          ...row,
          sourceScope: "shop_scoped" as const,
        }));
  let legacySyncEvents: ScopedSyncEventRow[] = [];

  if (legacyOwnerUserId && directSyncEventRows.length === 0) {
    const legacySyncEventsResult = await supabase
      .from("sync_events")
      .select(
        "id,shop_id,batch_id,client_event_id,domain,event_type,source,source_device_id,changed_count,entity_ids,metadata,created_at",
      )
      .is("shop_id", null)
      .eq("owner_user_id", legacyOwnerUserId)
      .in("domain", ["history", "catalog", "prices"])
      .order("created_at", { ascending: false })
      .limit(25);

    if (
      legacySyncEventsResult.error &&
      !isLegacyHistorySchemaError(legacySyncEventsResult.error)
    ) {
      return {
        status: "error",
        selectedShop,
        mapping,
        syncEvents: [],
        sessions: [],
        summary: emptyRows.summary,
        readOnly: true,
        source: "supabase_server",
        reason: "Legacy mobile sync rows could not be loaded through RLS.",
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
        .limit(25);

      if (legacyOwnerSyncEventsResult.error) {
        return {
          status: "error",
          selectedShop,
          mapping,
          syncEvents: [],
          sessions: [],
          summary: emptyRows.summary,
          readOnly: true,
          source: "supabase_server",
          reason: "Legacy mobile sync rows could not be loaded through RLS.",
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
  }

  if (
    sourceState.blockingSource &&
    !legacyOwnerUserId &&
    directSyncEventRows.length === 0
  ) {
    return {
      status: "unmapped",
      selectedShop,
      mapping: null,
      syncEvents: [],
      sessions: [],
      summary: emptyRows.summary,
      readOnly: true,
      source: "supabase_server",
      reason:
        "A legacy mobile source exists for this shop, but it is not mapped yet.",
    };
  }

  const syncEvents = mergeRowsByKey(
    directSyncEventRows,
    legacySyncEvents,
    (event) => String(event.id),
  ).map(mapSyncEvent);
  const latestChangedAt = syncEvents.reduce<string | null>(
    (latest, event) =>
      !latest || event.createdAt > latest ? event.createdAt : latest,
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
    sessions: [],
    summary: {
      historySessionsTotal: 0,
      historySessionsTotalAvailable: true,
      latestChangedAt,
      latestFailedSyncEvents,
      syncEventsTotal: syncEvents.length,
      syncEventsTotalAvailable: true,
    },
    readOnly: true,
    source: "supabase_server",
    reason:
      legacySyncEvents.length > 0
        ? "Lightweight sync event list loaded with legacy owner fallback."
        : "Lightweight sync event list loaded server-side.",
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
    .select(historyDiagnosticsSessionSelect)
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
      .select(historyDiagnosticsSessionSelect)
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
