import "server-only";

import { randomUUID } from "node:crypto";
import { parseLocalizedNumberText } from "@/lib/localized-number";
import type { Json, Tables } from "@/lib/supabase/database.types";
import {
  mapShopAdminRpcResult,
  resolveShopActionContext,
  shopAdminActionResult,
  type ShopAdminActionContext,
  type ShopAdminActionResult,
} from "./action-context";
import {
  buildSupplierImportHistoryEntryPayload,
  formatMobileHistoryTimestamp,
  supplierImportHistoryPayloadJson,
  type SupplierImportHistoryEntryPayload,
  type SupplierImportHistoryGridRow,
} from "./supplier-import-history-entry-contract";
import { callStaffWebHistoryMutation } from "./staff-web-lease-bound-rpc";

export type ReadyShopActionContext = Extract<
  ShopAdminActionContext,
  { status: "ready" }
>;
type HistorySessionWriteRow = Pick<
  Tables<"shared_sheet_sessions">,
  | "data"
  | "deleted_at"
  | "display_name"
  | "owner_user_id"
  | "payload_version"
  | "remote_id"
  | "session_overlay"
  | "shop_id"
  | "timestamp"
  | "updated_at"
>;
type StaffHistoryContext = ReadyShopActionContext;
type StaffHistoryPayload = { [key: string]: Json | undefined };
const HISTORY_WRITE_PAYLOAD_MAX_BYTES = 512 * 1024;

function historyWritePayloadFits(payload: StaffHistoryPayload) {
  return new TextEncoder().encode(JSON.stringify(payload)).length <=
    HISTORY_WRITE_PAYLOAD_MAX_BYTES;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function staffHistoryRpc(
  context: StaffHistoryContext,
  operation: string,
  payload: StaffHistoryPayload,
) {
  if (context.principalKind === "pos_staff_manager") {
    return callStaffWebHistoryMutation(context, operation, payload);
  }

  return context.supabase.rpc("staff_web_history_mutate_v1", {
    p_expected_credential_version: null,
    p_operation: operation,
    p_payload: payload,
    p_session_token_hash: null,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: null,
    p_staff_web_session_id: null,
  });
}

async function staffHistoryMutation(
  context: StaffHistoryContext,
  operation: string,
  payload: StaffHistoryPayload,
) {
  if (!historyWritePayloadFits(payload)) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: { rows: "History payload is too large." },
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }
  const { data, error } = await staffHistoryRpc(context, operation, payload);
  const result = error ? null : mapShopAdminRpcResult(data);
  const expectedTarget = typeof payload.remoteId === "string"
    ? payload.remoteId
    : undefined;

  return !result || !staffHistoryResultIsBound(
    result,
    context,
    expectedTarget,
  )
    ? shopAdminActionResult("db_failure", {
        ok: false,
        shopId: context.selectedShop.shopId,
      })
    : result;
}

function staffHistoryResultIsBound(
  result: ShopAdminActionResult,
  context: StaffHistoryContext,
  expectedTarget?: string,
) {
  return (
    result.shopId === context.selectedShop.shopId &&
    result.ok === (result.code === "success") &&
    (!result.ok || expectedTarget === undefined || result.targetId === expectedTarget)
  );
}

function parseStaffHistoryRow(data: unknown): HistorySessionWriteRow | null {
  if (!isJsonRecord(data) || data.ok !== true || !isJsonRecord(data.payload)) {
    return null;
  }
  const row = data.payload.row;

  if (
    !isJsonRecord(row) ||
    typeof row.remote_id !== "string" ||
    typeof row.owner_user_id !== "string" ||
    (row.shop_id !== null && typeof row.shop_id !== "string") ||
    typeof row.display_name !== "string" ||
    typeof row.timestamp !== "string" ||
    typeof row.updated_at !== "string" ||
    (row.deleted_at !== null && typeof row.deleted_at !== "string") ||
    !Number.isSafeInteger(row.payload_version) ||
    !Array.isArray(row.data) ||
    (row.session_overlay !== null && !isJsonRecord(row.session_overlay))
  ) {
    return null;
  }

  return {
    data: row.data as Json,
    deleted_at: row.deleted_at,
    display_name: row.display_name,
    owner_user_id: row.owner_user_id,
    payload_version: row.payload_version as number,
    remote_id: row.remote_id,
    session_overlay: row.session_overlay as Json,
    shop_id: row.shop_id,
    timestamp: row.timestamp,
    updated_at: row.updated_at,
  };
}

async function loadStaffHistorySession(
  context: StaffHistoryContext,
  remoteId: string,
) {
  const { data, error } = await staffHistoryRpc(context, "load", {
    remoteId,
  });

  if (error) {
    return { result: shopAdminActionResult("db_failure", { ok: false }), row: null };
  }
  const actionResult = mapShopAdminRpcResult(data);

  if (!staffHistoryResultIsBound(actionResult, context, remoteId)) {
    return {
      result: shopAdminActionResult("db_failure", {
        ok: false,
        shopId: context.selectedShop.shopId,
      }),
      row: null,
    };
  }
  if (!actionResult.ok) {
    return { result: actionResult, row: null };
  }
  const row = parseStaffHistoryRow(data);
  const rowIsBound =
    row !== null &&
    row.remote_id === remoteId &&
    (row.shop_id === context.selectedShop.shopId ||
      row.shop_id === null);

  return rowIsBound
    ? { result: actionResult, row }
    : {
        result: shopAdminActionResult("db_failure", {
          ok: false,
          shopId: context.selectedShop.shopId,
        }),
        row: null,
      };
}

export type HistoryEntryMutationInput = {
  category?: string;
  completeRows?: boolean;
  displayName: string;
  remoteId?: string;
  requestedShopId?: string;
  rowsText?: string;
  supplier?: string;
};
export type SupplierImportHistoryEntryUpsertResult =
  | {
      action: "created" | "updated";
      displayName: string;
      href: string;
      ok: true;
      remoteId: string;
      rowCount: number;
    }
  | {
      code: ShopAdminActionResult["code"];
      message: string;
      ok: false;
      remoteId?: string;
    };

export type SupplierImportHistoryEntryUpsertInput = {
  appliedAt?: Date | string;
  categoryName?: string;
  context: ReadyShopActionContext;
  fileName: string;
  previewDigest: string;
  rows: readonly SupplierImportHistoryGridRow[];
  supplierName?: string;
};

export type HistoryEntryGeneratedRowPatch = {
  complete?: boolean;
  countedQuantity?: string;
  expectedUpdatedAt?: string;
  quantity?: string;
  retailPrice?: string;
  rowIndex?: number;
  rowKey?: string;
  salePrice?: string;
};

export type HistoryEntryGeneratedRowsUpdateInput = {
  expectedUpdatedAt?: string;
  remoteId?: string;
  requestedShopId?: string;
  rows: readonly HistoryEntryGeneratedRowPatch[];
};

type ParsedRows =
  | {
      data: string[][];
      ok: true;
    }
  | {
      ok: false;
      result: ShopAdminActionResult;
    };

const SESSION_PAYLOAD_VERSION = 2;
const SESSION_OVERLAY_SCHEMA = 1;
const SESSION_OVERLAY_MAX_BYTES = 512 * 1024;
const HISTORY_ENTRY_MAX_ROWS = 200;
const HISTORY_ENTRY_MAX_COLUMNS = 40;
const HISTORY_ENTRY_MAX_CELL_LENGTH = 120;

function normalizeLabel(value: string | undefined, fallback = "") {
  const normalized = value?.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

  return (normalized && normalized.length > 0 ? normalized : fallback).slice(0, 120);
}

function normalizeRemoteId(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
}

function byteSize(value: Json) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function splitHistoryRow(line: string) {
  if (line.includes("\t")) {
    return line.split("\t");
  }

  if (line.includes(";")) {
    return line.split(";");
  }

  if (line.includes(",")) {
    return line.split(",");
  }

  return [line];
}

function normalizeCell(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, HISTORY_ENTRY_MAX_CELL_LENGTH);
}

function parseHistoryRows(rowsText: string | undefined, required: boolean): ParsedRows {
  const lines = (rowsText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return required
      ? shopAdminValidationError("rows", "History rows are required.")
      : { data: [], ok: true };
  }

  if (lines.length > HISTORY_ENTRY_MAX_ROWS) {
    return shopAdminActionRowLimitError();
  }

  const data = lines.map((line) =>
    splitHistoryRow(line)
      .slice(0, HISTORY_ENTRY_MAX_COLUMNS)
      .map(normalizeCell),
  );

  return { data, ok: true };
}

function jsonGridFromExistingData(value: Json): string[][] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, HISTORY_ENTRY_MAX_ROWS).map((row) => {
    if (!Array.isArray(row)) {
      return [];
    }

    return row
      .slice(0, HISTORY_ENTRY_MAX_COLUMNS)
      .map((cell) =>
        cell === null ||
        typeof cell === "string" ||
        typeof cell === "number" ||
        typeof cell === "boolean"
          ? normalizeCell(String(cell ?? ""))
          : normalizeCell(JSON.stringify(cell)),
      );
  });
}

function shopAdminValidationError(field: string, message: string): ParsedRows {
  return {
    ok: false,
    result: shopAdminActionResult("validation_failed", {
      fieldErrors: { [field]: message },
      ok: false,
    }),
  };
}

function shopAdminActionRowLimitError(): ParsedRows {
  return {
    ok: false,
    result: shopAdminActionResult("row_limit_exceeded", { ok: false }),
  };
}

function buildHistoryOverlay(data: readonly string[][], completeRows: boolean) {
  return {
    complete: data.map((_, index) => index === 0 || completeRows),
    editable: data.map(() => ["", ""]),
    overlay_schema: SESSION_OVERLAY_SCHEMA,
  } satisfies Record<string, Json>;
}

function normalizedHeaderKey(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function findGeneratedColumn(header: readonly string[], exactName: string) {
  const exactIndex = header.findIndex((cell) => cell === exactName);

  if (exactIndex >= 0) {
    return exactIndex;
  }

  const normalizedName = normalizedHeaderKey(exactName);

  return header.findIndex((cell) => normalizedHeaderKey(cell) === normalizedName);
}

function ensureRowHasIndex(row: string[], columnIndex: number) {
  while (row.length <= columnIndex) {
    row.push("");
  }
}

function ensureHistoryGeneratedColumns(data: string[][]) {
  const header = data[0] ?? [];
  const columnsAdded: string[] = [];
  const ensureColumn = (name: "RetailPrice" | "complete" | "realQuantity") => {
    const existingIndex = findGeneratedColumn(header, name);

    if (existingIndex >= 0) {
      return existingIndex;
    }

    const nextIndex = header.length;
    header.push(name);
    columnsAdded.push(name);

    for (let rowIndex = 1; rowIndex < data.length; rowIndex += 1) {
      ensureRowHasIndex(data[rowIndex], nextIndex);
      data[rowIndex][nextIndex] = "";
    }

    return nextIndex;
  };

  return {
    columnsAdded,
    complete: ensureColumn("complete"),
    countedQuantity: ensureColumn("realQuantity"),
    salePrice: ensureColumn("RetailPrice"),
  };
}

function parseGeneratedRowIndex(input: HistoryEntryGeneratedRowPatch) {
  if (typeof input.rowIndex === "number" && Number.isInteger(input.rowIndex)) {
    return input.rowIndex;
  }

  const rowKeyMatch = input.rowKey?.match(/^preview:(\d+)$/);

  if (!rowKeyMatch) {
    return null;
  }

  return Number(rowKeyMatch[1]) - 1;
}

function normalizeGeneratedNumber(input: {
  field: "countedQuantity" | "salePrice";
  rowIndex: number;
  value: string | undefined;
}) {
  const raw = input.value?.trim();

  if (raw === undefined) {
    return { present: false as const };
  }

  if (raw.length === 0) {
    return { present: true as const, value: "" };
  }

  const parsed = parseLocalizedNumberText(raw);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return {
      present: false as const,
      error: `Row ${input.rowIndex + 1} ${input.field} must be a non-negative number.`,
    };
  }

  return { present: true as const, value: String(parsed) };
}

function overlayRowsFromJson(value: Json) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const overlay = value as Record<string, Json>;
  const overlaySchema = overlay.overlay_schema;
  const complete = overlay.complete;
  const editable = overlay.editable;

  if (
    overlaySchema !== SESSION_OVERLAY_SCHEMA ||
    !Array.isArray(complete) ||
    !complete.every((row) => typeof row === "boolean") ||
    !Array.isArray(editable) ||
    !editable.every((row) => Array.isArray(row))
  ) {
    return null;
  }

  return {
    complete: complete.map((row) => row === true),
    editable: editable.map((row) =>
      row.map((cell) =>
        cell === null ||
        typeof cell === "string" ||
        typeof cell === "number" ||
        typeof cell === "boolean"
          ? normalizeCell(String(cell ?? ""))
          : normalizeCell(JSON.stringify(cell)),
      ),
    ),
    overlay_schema: SESSION_OVERLAY_SCHEMA,
  };
}

function applyGeneratedRowPatches(input: {
  data: string[][];
  overlay: Json;
  patches: readonly HistoryEntryGeneratedRowPatch[];
}) {
  const overlay = overlayRowsFromJson(input.overlay);

  if (
    !overlay ||
    overlay.complete.length !== input.data.length ||
    overlay.editable.length !== input.data.length
  ) {
    return {
      fieldErrors: {
        rows: "History overlay must be payload v2 with rows aligned to data.",
      },
      ok: false as const,
    };
  }

  const data = input.data.map((row) => [...row]);
  const columns = ensureHistoryGeneratedColumns(data);
  const editable = overlay.editable.map((row) => [...row]);
  const complete = [...overlay.complete];
  const changedFields = new Set<"complete" | "countedQuantity" | "salePrice">();
  const changedRows = new Set<number>();

  for (const patch of input.patches) {
    const rowIndex = parseGeneratedRowIndex(patch);

    if (rowIndex === null || rowIndex <= 0 || rowIndex >= data.length) {
      return {
        fieldErrors: {
          rows: "History row edits must target an existing data row.",
        },
        ok: false as const,
      };
    }

    const nextCountedQuantity = normalizeGeneratedNumber({
      field: "countedQuantity",
      rowIndex,
      value: patch.countedQuantity ?? patch.quantity,
    });
    const nextSalePrice = normalizeGeneratedNumber({
      field: "salePrice",
      rowIndex,
      value: patch.salePrice ?? patch.retailPrice,
    });

    const countedQuantityError =
      "error" in nextCountedQuantity ? nextCountedQuantity.error : null;
    const salePriceError =
      "error" in nextSalePrice ? nextSalePrice.error : null;

    if (countedQuantityError) {
      return {
        fieldErrors: { countedQuantity: countedQuantityError },
        ok: false as const,
      };
    }

    if (salePriceError) {
      return {
        fieldErrors: { salePrice: salePriceError },
        ok: false as const,
      };
    }

    ensureRowHasIndex(data[rowIndex], columns.countedQuantity);
    ensureRowHasIndex(data[rowIndex], columns.salePrice);
    ensureRowHasIndex(data[rowIndex], columns.complete);

    if (
      nextCountedQuantity.present &&
      data[rowIndex][columns.countedQuantity] !== nextCountedQuantity.value
    ) {
      data[rowIndex][columns.countedQuantity] = nextCountedQuantity.value;
      changedFields.add("countedQuantity");
      changedRows.add(rowIndex);
    }

    if (
      nextSalePrice.present &&
      data[rowIndex][columns.salePrice] !== nextSalePrice.value
    ) {
      data[rowIndex][columns.salePrice] = nextSalePrice.value;
      changedFields.add("salePrice");
      changedRows.add(rowIndex);
    }

    if (!editable[rowIndex]) {
      editable[rowIndex] = [];
    }

    if (nextCountedQuantity.present) {
      ensureRowHasIndex(editable[rowIndex], 0);

      if (editable[rowIndex][0] !== nextCountedQuantity.value) {
        editable[rowIndex][0] = nextCountedQuantity.value;
        changedFields.add("countedQuantity");
        changedRows.add(rowIndex);
      }
    }

    if (nextSalePrice.present) {
      ensureRowHasIndex(editable[rowIndex], 1);

      if (editable[rowIndex][1] !== nextSalePrice.value) {
        editable[rowIndex][1] = nextSalePrice.value;
        changedFields.add("salePrice");
        changedRows.add(rowIndex);
      }
    }

    if (typeof patch.complete === "boolean") {
      const completeCellValue = patch.complete ? "1" : "";

      if (complete[rowIndex] !== patch.complete) {
        complete[rowIndex] = patch.complete;
        changedFields.add("complete");
        changedRows.add(rowIndex);
      }

      if (data[rowIndex][columns.complete] !== completeCellValue) {
        data[rowIndex][columns.complete] = completeCellValue;
        changedFields.add("complete");
        changedRows.add(rowIndex);
      }
    }
  }

  if (columns.columnsAdded.length > 0 && changedRows.size > 0) {
    columns.columnsAdded.forEach((field) => {
      if (field === "realQuantity") {
        changedFields.add("countedQuantity");
      } else if (field === "RetailPrice") {
        changedFields.add("salePrice");
      } else if (field === "complete") {
        changedFields.add("complete");
      }
    });
  }

  const nextOverlay = {
    complete,
    editable,
    overlay_schema: SESSION_OVERLAY_SCHEMA,
  } satisfies Record<string, Json>;

  if (byteSize(nextOverlay) > SESSION_OVERLAY_MAX_BYTES) {
    return {
      fieldErrors: { rows: "History overlay is too large." },
      ok: false as const,
    };
  }

  return {
    changedFields: Array.from(changedFields),
    changedRows: Array.from(changedRows),
    data,
    ok: true as const,
    overlay: nextOverlay,
  };
}

async function resolveHistoryWriteContext(requestedShopId: string | undefined) {
  const context = await resolveShopActionContext(requestedShopId, "history.write");

  if (context.status !== "ready") {
    return { context, ok: false as const, result: context.result };
  }

  return {
    context,
    ok: true as const,
    staff: context.principalKind === "pos_staff_manager",
  };
}

export async function upsertSupplierImportHistoryEntry(
  input: SupplierImportHistoryEntryUpsertInput,
): Promise<SupplierImportHistoryEntryUpsertResult> {
  if (input.rows.length === 0) {
    return {
      code: "validation_failed",
      message: "No supplier import rows are available for History Entry.",
      ok: false,
    };
  }

  const payload = buildSupplierImportHistoryEntryPayload({
    appliedAt: input.appliedAt,
    categoryName: input.categoryName,
    fileName: input.fileName,
    previewDigest: input.previewDigest,
    rows: input.rows,
    shopId: input.context.selectedShop.shopId,
    supplierName: input.supplierName,
  });
  const payloadJson = supplierImportHistoryPayloadJson(payload);
  const writePayload: StaffHistoryPayload = {
    category: payload.category,
    data: payloadJson.data,
    displayName: payload.displayName,
    isManualEntry: payload.isManualEntry,
    overlay: payloadJson.sessionOverlay,
    payloadVersion: payload.payloadVersion,
    remoteId: payload.remoteId,
    supplier: payload.supplier,
    timestamp: payload.timestamp,
  };

  if (!historyWritePayloadFits(writePayload)) {
    return {
      code: "validation_failed",
      message: "History payload is too large.",
      ok: false,
      remoteId: payload.remoteId,
    };
  }

  const { data, error } = await staffHistoryRpc(
    input.context,
    "upsert_import",
    writePayload,
  );
  const actionResult = error
    ? shopAdminActionResult("db_failure", { ok: false })
    : mapShopAdminRpcResult(data);
  const resultIsBound =
    !error && staffHistoryResultIsBound(
      actionResult,
      input.context,
      payload.remoteId,
    );
  const rpcPayload = isJsonRecord(data) && isJsonRecord(data.payload)
    ? data.payload
    : null;
  const action = rpcPayload?.action;

  if (
    !resultIsBound ||
    !actionResult.ok ||
    (action !== "created" && action !== "updated")
  ) {
    return {
      code: !resultIsBound || actionResult.ok ? "db_failure" : actionResult.code,
      message: !resultIsBound || actionResult.ok
        ? shopAdminActionResult("db_failure").message
        : actionResult.message,
      ok: false,
      remoteId: payload.remoteId,
    };
  }

  return {
    action,
    displayName: payload.displayName,
    href:
      `/shop/history/${encodeURIComponent(payload.remoteId)}` +
      `?shop_id=${encodeURIComponent(input.context.selectedShop.shopId)}`,
    ok: true,
    remoteId: payload.remoteId,
    rowCount: payload.rowCount,
  };
}

export async function createHistoryEntry(
  input: HistoryEntryMutationInput,
): Promise<ShopAdminActionResult> {
  const ready = await resolveHistoryWriteContext(input.requestedShopId);

  if (!ready.ok) {
    return ready.result;
  }

  const parsedRows = parseHistoryRows(input.rowsText, true);

  if (!parsedRows.ok) {
    return parsedRows.result;
  }

  const overlay = buildHistoryOverlay(parsedRows.data, input.completeRows === true);

  if (byteSize(overlay) > SESSION_OVERLAY_MAX_BYTES) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: { rows: "History overlay is too large." },
      ok: false,
      shopId: ready.context.selectedShop.shopId,
    });
  }

  const remoteId = randomUUID().toLowerCase();
  const timestamp = formatMobileHistoryTimestamp(new Date());
  const writePayload: StaffHistoryPayload = {
    category: normalizeLabel(input.category),
    data: parsedRows.data,
    displayName: normalizeLabel(input.displayName, "Manual History Entry"),
    isManualEntry: true,
    overlay,
    payloadVersion: SESSION_PAYLOAD_VERSION,
    remoteId,
    supplier: normalizeLabel(input.supplier),
    timestamp,
  };

  if (!historyWritePayloadFits(writePayload)) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: { rows: "History payload is too large." },
      ok: false,
      shopId: ready.context.selectedShop.shopId,
    });
  }

  if (ready.staff) {
    return staffHistoryMutation(ready.context, "create", writePayload);
  }

  return staffHistoryMutation(ready.context, "create", writePayload);

}


export async function updateHistoryEntry(
  input: HistoryEntryMutationInput,
): Promise<ShopAdminActionResult> {
  const remoteId = normalizeRemoteId(input.remoteId);

  if (!isUuid(remoteId)) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: { remoteId: "History remote_id must be a lowercase UUID." },
      ok: false,
    });
  }

  const ready = await resolveHistoryWriteContext(input.requestedShopId);

  if (!ready.ok) {
    return ready.result;
  }

  const loaded = await loadStaffHistorySession(
    ready.context,
    remoteId,
  );

  if (!loaded.row) {
    return loaded.result;
  }
  const existing = loaded.row;

  if (existing.deleted_at) {
    return shopAdminActionResult("invalid_state", {
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  const parsedRows = parseHistoryRows(input.rowsText, false);

  if (!parsedRows.ok) {
    return parsedRows.result;
  }

  const data =
    parsedRows.data.length > 0
      ? parsedRows.data
      : jsonGridFromExistingData(existing.data);

  if (data.length === 0) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: { rows: "History rows are required." },
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  const overlay = buildHistoryOverlay(data, input.completeRows === true);

  if (byteSize(overlay) > SESSION_OVERLAY_MAX_BYTES) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: { rows: "History overlay is too large." },
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  const displayName = normalizeLabel(
    input.displayName,
    existing.display_name || "Manual History Entry",
  );
  const category = normalizeLabel(input.category);
  const supplier = normalizeLabel(input.supplier);
  const writePayload: StaffHistoryPayload = {
    category,
    data,
    displayName,
    expectedUpdatedAt: existing.updated_at,
    isManualEntry: true,
    overlay,
    payloadVersion: SESSION_PAYLOAD_VERSION,
    remoteId,
    supplier,
    timestamp: existing.timestamp,
  };

  if (!historyWritePayloadFits(writePayload)) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: { rows: "History payload is too large." },
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  if (ready.staff) {
    return staffHistoryMutation(ready.context, "update", writePayload);
  }

  return staffHistoryMutation(ready.context, "update", writePayload);
}


export async function updateHistoryEntryGeneratedRows(
  input: HistoryEntryGeneratedRowsUpdateInput,
): Promise<ShopAdminActionResult> {
  const remoteId = normalizeRemoteId(input.remoteId);

  if (!isUuid(remoteId)) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: { remoteId: "History remote_id must be a lowercase UUID." },
      ok: false,
    });
  }

  if (input.rows.length === 0 || input.rows.length > HISTORY_ENTRY_MAX_ROWS) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: { rows: "At least one bounded History row edit is required." },
      ok: false,
    });
  }

  const ready = await resolveHistoryWriteContext(input.requestedShopId);

  if (!ready.ok) {
    return ready.result;
  }

  const loaded = await loadStaffHistorySession(
    ready.context,
    remoteId,
  );

  if (!loaded.row) {
    return loaded.result;
  }
  const existing = loaded.row;

  if (existing.deleted_at) {
    return shopAdminActionResult("invalid_state", {
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  if (existing.payload_version !== SESSION_PAYLOAD_VERSION) {
    return shopAdminActionResult("invalid_state", {
      fieldErrors: {
        rows: "Only payload v2 History Entries can be edited from generated rows.",
      },
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  const data = jsonGridFromExistingData(existing.data);

  if (data.length === 0) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: { rows: "History rows are required." },
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  const patched = applyGeneratedRowPatches({
    data,
    overlay: existing.session_overlay,
    patches: input.rows,
  });

  if (!patched.ok) {
    const fieldErrors = Object.fromEntries(
      Object.entries(patched.fieldErrors).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );

    return shopAdminActionResult("validation_failed", {
      fieldErrors,
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  if (patched.changedRows.length === 0) {
    return shopAdminActionResult("success", {
      ok: true,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  const currentData = JSON.stringify(data);
  const nextData = JSON.stringify(patched.data);
  const currentOverlay = JSON.stringify(existing.session_overlay);
  const nextOverlay = JSON.stringify(patched.overlay);
  const changed = currentData !== nextData || currentOverlay !== nextOverlay;

  if (!changed) {
    return shopAdminActionResult("success", {
      ok: true,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  const expectedUpdatedAt =
    input.expectedUpdatedAt ??
    input.rows.find((row) => row.expectedUpdatedAt)?.expectedUpdatedAt;

  if (expectedUpdatedAt && expectedUpdatedAt !== existing.updated_at) {
    return shopAdminActionResult("conflict", {
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  const writePayload: StaffHistoryPayload = {
    data: patched.data,
    expectedUpdatedAt: existing.updated_at,
    overlay: patched.overlay,
    payloadVersion: SESSION_PAYLOAD_VERSION,
    remoteId,
  };

  if (!historyWritePayloadFits(writePayload)) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: { rows: "History payload is too large." },
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  if (ready.staff) {
    return staffHistoryMutation(ready.context, "generated_update", writePayload);
  }

  return staffHistoryMutation(ready.context, "generated_update", writePayload);

}


export async function tombstoneHistoryEntry(input: {
  reason?: string;
  remoteId?: string;
  requestedShopId?: string;
}): Promise<ShopAdminActionResult> {
  const remoteId = normalizeRemoteId(input.remoteId);

  if (!isUuid(remoteId)) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: { remoteId: "History remote_id must be a lowercase UUID." },
      ok: false,
    });
  }

  if (!normalizeLabel(input.reason)) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: { reason: "A reason is required for history tombstone." },
      ok: false,
    });
  }

  const ready = await resolveHistoryWriteContext(input.requestedShopId);

  if (!ready.ok) {
    return ready.result;
  }

  if (ready.staff) {
    return staffHistoryMutation(ready.context, "tombstone", { remoteId });
  }

  return staffHistoryMutation(ready.context, "tombstone", { remoteId });
}
