import "server-only";

import { randomUUID } from "node:crypto";
import { parseLocalizedNumberText } from "@/lib/localized-number";
import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import {
  resolveShopActionContext,
  shopAdminActionResult,
  type ShopAdminActionContext,
  type ShopAdminActionResult,
} from "./action-context";
import {
  buildSupplierImportHistoryEntryPayload,
  supplierImportHistoryPayloadJson,
  type SupplierImportHistoryEntryPayload,
  type SupplierImportHistoryGridRow,
} from "./supplier-import-history-entry-contract";
import { writeAdminWebSyncEvent } from "./sync-event-writer";

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
type LegacyHistorySessionWriteRow = Omit<HistorySessionWriteRow, "shop_id">;
type HistorySessionMutationRow = Pick<
  Tables<"shared_sheet_sessions">,
  "deleted_at" | "remote_id" | "updated_at"
>;

type HistoryOwnerScope =
  | {
      catalogScope: "legacy_owner_bridge" | "shop_scoped";
      ok: true;
      ownerUserId: string;
    }
  | {
      ok: false;
      result: ShopAdminActionResult;
    };

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

function nowIso() {
  return new Date().toISOString();
}

function omitShopId<T extends { shop_id: unknown }>(row: T): Omit<T, "shop_id"> {
  const legacyRow = { ...row };
  Reflect.deleteProperty(legacyRow, "shop_id");
  return legacyRow;
}

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

function isLegacyHistorySchemaError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: unknown }).code;

  return code === "42703" || code === "PGRST204" || code === "PGRST205";
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

function historyAdminClientForContext(context: ReadyShopActionContext) {
  if (context.principalKind === "pos_staff_manager") {
    return context.supabase;
  }

  return createSupabaseAdminClient(resolveSupabaseAdminConfig());
}

async function resolveShopScopedCompatibilityOwner(
  supabase: SupabaseAdminClient,
  shopId: string,
) {
  const shopOwnerResult = await supabase
    .from("shops")
    .select("created_by_profile_id")
    .eq("shop_id", shopId)
    .maybeSingle<Pick<Tables<"shops">, "created_by_profile_id">>();

  if (shopOwnerResult.error) {
    return { error: shopOwnerResult.error, ownerUserId: null };
  }

  if (shopOwnerResult.data?.created_by_profile_id) {
    return {
      error: null,
      ownerUserId: shopOwnerResult.data.created_by_profile_id,
    };
  }

  const memberOwnerResult = await supabase
    .from("shop_members")
    .select("profile_id,role_key")
    .eq("shop_id", shopId)
    .eq("membership_status", "active")
    .in("role_key", ["shop_owner", "shop_manager"])
    .order("role_key", { ascending: false })
    .limit(1);

  if (memberOwnerResult.error) {
    return { error: memberOwnerResult.error, ownerUserId: null };
  }

  return {
    error: null,
    ownerUserId: memberOwnerResult.data?.[0]?.profile_id ?? null,
  };
}

async function resolveHistoryOwner(
  context: ReadyShopActionContext,
  supabase: SupabaseAdminClient,
): Promise<HistoryOwnerScope> {
  const { data, error } = await supabase
    .from("shop_inventory_sources")
    .select("owner_user_id,mapping_state")
    .eq("shop_id", context.selectedShop.shopId)
    .is("disabled_at", null)
    .limit(10);

  if (error) {
    return {
      ok: false,
      result: shopAdminActionResult("db_failure", {
        ok: false,
        shopId: context.selectedShop.shopId,
      }),
    };
  }

  const mappedSource = (data ?? []).find(
    (row) => row.mapping_state === "mapped" && row.owner_user_id,
  );
  const blockingSource = (data ?? []).find(
    (row) => row.mapping_state !== "mapped",
  );

  if (mappedSource?.owner_user_id) {
    return {
      catalogScope: "legacy_owner_bridge",
      ok: true,
      ownerUserId: mappedSource.owner_user_id,
    };
  }

  if (blockingSource) {
    return {
      ok: false,
      result: shopAdminActionResult("unauthorized_or_unmapped", {
        ok: false,
        shopId: context.selectedShop.shopId,
      }),
    };
  }

  const shopScopedOwner = await resolveShopScopedCompatibilityOwner(
    supabase,
    context.selectedShop.shopId,
  );

  if (shopScopedOwner.error) {
    return {
      ok: false,
      result: shopAdminActionResult("db_failure", {
        ok: false,
        shopId: context.selectedShop.shopId,
      }),
    };
  }

  if (!shopScopedOwner.ownerUserId) {
    return {
      ok: false,
      result: shopAdminActionResult("unauthorized_or_unmapped", {
        ok: false,
        shopId: context.selectedShop.shopId,
      }),
    };
  }

  return {
    catalogScope: "shop_scoped",
    ok: true,
    ownerUserId: shopScopedOwner.ownerUserId,
  };
}

async function resolveHistoryWriteContext(requestedShopId: string | undefined) {
  const context = await resolveShopActionContext(requestedShopId, "history.write");

  if (context.status !== "ready") {
    return { context, ok: false as const, result: context.result };
  }

  const supabase = historyAdminClientForContext(context);

  if (!supabase) {
    return {
      context,
      ok: false as const,
      result: shopAdminActionResult("not_configured", {
        ok: false,
        shopId: context.selectedShop.shopId,
      }),
    };
  }

  const owner = await resolveHistoryOwner(context, supabase);

  if (!owner.ok) {
    return { context, ok: false as const, result: owner.result, supabase };
  }

  return { context, ok: true as const, owner, supabase };
}

async function loadHistorySessionForWrite(input: {
  allowLegacyOwnerBridge: boolean;
  ownerUserId: string;
  remoteId: string;
  shopId: string;
  supabase: SupabaseAdminClient;
}) {
  const selectColumns =
    "remote_id,shop_id,owner_user_id,display_name,timestamp,updated_at,deleted_at,payload_version,data,session_overlay";
  const directResult = await input.supabase
    .from("shared_sheet_sessions")
    .select(selectColumns)
    .eq("shop_id", input.shopId)
    .eq("remote_id", input.remoteId)
    .maybeSingle<HistorySessionWriteRow>();

  if (directResult.error && !isLegacyHistorySchemaError(directResult.error)) {
    return directResult;
  }

  if (directResult.data) {
    return directResult;
  }

  if (!input.allowLegacyOwnerBridge) {
    return directResult.error && isLegacyHistorySchemaError(directResult.error)
      ? directResult
      : { data: null, error: null };
  }

  if (directResult.error && isLegacyHistorySchemaError(directResult.error)) {
    const legacyResult = await input.supabase
      .from("shared_sheet_sessions")
      .select(
        "remote_id,owner_user_id,display_name,timestamp,updated_at,deleted_at,payload_version,data,session_overlay",
      )
      .eq("owner_user_id", input.ownerUserId)
      .eq("remote_id", input.remoteId)
      .maybeSingle<LegacyHistorySessionWriteRow>();

    return {
      data: legacyResult.data
        ? ({ ...legacyResult.data, shop_id: null } satisfies HistorySessionWriteRow)
        : null,
      error: legacyResult.error,
    };
  }

  const legacyScopedResult = await input.supabase
    .from("shared_sheet_sessions")
    .select(selectColumns)
    .is("shop_id", null)
    .eq("owner_user_id", input.ownerUserId)
    .eq("remote_id", input.remoteId)
    .maybeSingle<HistorySessionWriteRow>();

  if (!legacyScopedResult.error || !isLegacyHistorySchemaError(legacyScopedResult.error)) {
    return legacyScopedResult;
  }

  const legacyResult = await input.supabase
    .from("shared_sheet_sessions")
    .select(
      "remote_id,owner_user_id,display_name,timestamp,updated_at,deleted_at,payload_version,data,session_overlay",
    )
    .eq("owner_user_id", input.ownerUserId)
    .eq("remote_id", input.remoteId)
    .maybeSingle<LegacyHistorySessionWriteRow>();

  return {
    data: legacyResult.data
      ? ({ ...legacyResult.data, shop_id: null } satisfies HistorySessionWriteRow)
      : null,
    error: legacyResult.error,
  };
}

async function insertHistorySessionForWrite(input: {
  category: string;
  data: Json;
  displayName: string;
  ownerUserId: string;
  overlay: Json;
  remoteId: string;
  shopId: string;
  supplier: string;
  supabase: SupabaseAdminClient;
  timestamp: string;
}) {
  const row = {
    category: input.category,
    data: input.data,
    deleted_at: null,
    display_name: input.displayName,
    is_manual_entry: true,
    owner_user_id: input.ownerUserId,
    payload_version: SESSION_PAYLOAD_VERSION,
    remote_id: input.remoteId,
    session_overlay: input.overlay,
    shop_id: input.shopId,
    supplier: input.supplier,
    timestamp: input.timestamp,
  };
  const result = await input.supabase.from("shared_sheet_sessions").insert(row);

  if (!result.error || !isLegacyHistorySchemaError(result.error)) {
    return result;
  }

  const legacyRow = omitShopId(row);

  return input.supabase.from("shared_sheet_sessions").insert(legacyRow);
}

async function updateHistorySessionForWrite(input: {
  category: string;
  data: Json;
  displayName: string;
  existingShopId: string | null;
  ownerUserId: string;
  overlay: Json;
  remoteId: string;
  supplier: string;
  supabase: SupabaseAdminClient;
  timestamp: string;
}) {
  const row = {
    category: input.category,
    data: input.data,
    display_name: input.displayName,
    is_manual_entry: true,
    owner_user_id: input.ownerUserId,
    payload_version: SESSION_PAYLOAD_VERSION,
    session_overlay: input.overlay,
    shop_id: input.existingShopId,
    supplier: input.supplier,
    timestamp: input.timestamp,
  };
  let query = input.supabase
    .from("shared_sheet_sessions")
    .update(row)
    .eq("remote_id", input.remoteId)
    .eq("owner_user_id", input.ownerUserId);

  query = input.existingShopId
    ? query.eq("shop_id", input.existingShopId)
    : query.is("shop_id", null);

  const result = await query
    .select("remote_id,updated_at,deleted_at")
    .maybeSingle<HistorySessionMutationRow>();

  if (!result.error || !isLegacyHistorySchemaError(result.error)) {
    return result;
  }

  const legacyRow = omitShopId(row);

  return input.supabase
    .from("shared_sheet_sessions")
    .update(legacyRow)
    .eq("remote_id", input.remoteId)
    .eq("owner_user_id", input.ownerUserId)
    .select("remote_id,updated_at,deleted_at")
    .maybeSingle<HistorySessionMutationRow>();
}

async function updateGeneratedRowsHistorySessionForWrite(input: {
  data: Json;
  existingShopId: string | null;
  ownerUserId: string;
  overlay: Json;
  remoteId: string;
  supabase: SupabaseAdminClient;
  updatedAt: string;
}) {
  const row = {
    data: input.data,
    payload_version: SESSION_PAYLOAD_VERSION,
    session_overlay: input.overlay,
    shop_id: input.existingShopId,
    updated_at: input.updatedAt,
  };
  let query = input.supabase
    .from("shared_sheet_sessions")
    .update(row)
    .eq("remote_id", input.remoteId)
    .eq("owner_user_id", input.ownerUserId);

  query = input.existingShopId
    ? query.eq("shop_id", input.existingShopId)
    : query.is("shop_id", null);

  const result = await query
    .select("remote_id,updated_at,deleted_at")
    .maybeSingle<HistorySessionMutationRow>();

  if (!result.error || !isLegacyHistorySchemaError(result.error)) {
    return result;
  }

  const legacyRow = omitShopId(row);

  return input.supabase
    .from("shared_sheet_sessions")
    .update(legacyRow)
    .eq("remote_id", input.remoteId)
    .eq("owner_user_id", input.ownerUserId)
    .select("remote_id,updated_at,deleted_at")
    .maybeSingle<HistorySessionMutationRow>();
}

async function insertSupplierImportHistorySession(input: {
  ownerUserId: string;
  payload: SupplierImportHistoryEntryPayload;
  shopId: string;
  supabase: SupabaseAdminClient;
  updatedAt: string;
}) {
  const payloadJson = supplierImportHistoryPayloadJson(input.payload);
  const row = {
    category: input.payload.category,
    data: payloadJson.data,
    deleted_at: null,
    display_name: input.payload.displayName,
    is_manual_entry: input.payload.isManualEntry,
    owner_user_id: input.ownerUserId,
    payload_version: input.payload.payloadVersion,
    remote_id: input.payload.remoteId,
    session_overlay: payloadJson.sessionOverlay,
    shop_id: input.shopId,
    supplier: input.payload.supplier,
    timestamp: input.payload.timestamp,
    updated_at: input.updatedAt,
  };
  const result = await input.supabase.from("shared_sheet_sessions").insert(row);

  if (!result.error || !isLegacyHistorySchemaError(result.error)) {
    return result;
  }

  const legacyRow = omitShopId(row);

  return input.supabase.from("shared_sheet_sessions").insert(legacyRow);
}

async function updateSupplierImportHistorySession(input: {
  existingShopId: string | null;
  ownerUserId: string;
  payload: SupplierImportHistoryEntryPayload;
  supabase: SupabaseAdminClient;
  updatedAt: string;
}) {
  const payloadJson = supplierImportHistoryPayloadJson(input.payload);
  const row = {
    category: input.payload.category,
    data: payloadJson.data,
    deleted_at: null,
    display_name: input.payload.displayName,
    is_manual_entry: input.payload.isManualEntry,
    owner_user_id: input.ownerUserId,
    payload_version: input.payload.payloadVersion,
    session_overlay: payloadJson.sessionOverlay,
    shop_id: input.existingShopId,
    supplier: input.payload.supplier,
    timestamp: input.payload.timestamp,
    updated_at: input.updatedAt,
  };
  let query = input.supabase
    .from("shared_sheet_sessions")
    .update(row)
    .eq("remote_id", input.payload.remoteId)
    .eq("owner_user_id", input.ownerUserId);

  query = input.existingShopId
    ? query.eq("shop_id", input.existingShopId)
    : query.is("shop_id", null);

  const result = await query
    .select("remote_id,updated_at,deleted_at")
    .maybeSingle<HistorySessionMutationRow>();

  if (!result.error || !isLegacyHistorySchemaError(result.error)) {
    return result;
  }

  const legacyRow = omitShopId(row);

  return input.supabase
    .from("shared_sheet_sessions")
    .update(legacyRow)
    .eq("remote_id", input.payload.remoteId)
    .eq("owner_user_id", input.ownerUserId)
    .select("remote_id,updated_at,deleted_at")
    .maybeSingle<HistorySessionMutationRow>();
}

async function tombstoneHistorySessionForWrite(input: {
  deletedAt: string;
  existingShopId: string | null;
  ownerUserId: string;
  remoteId: string;
  supabase: SupabaseAdminClient;
}) {
  const row = {
    deleted_at: input.deletedAt,
    owner_user_id: input.ownerUserId,
    shop_id: input.existingShopId,
  };
  let query = input.supabase
    .from("shared_sheet_sessions")
    .update(row)
    .eq("remote_id", input.remoteId)
    .eq("owner_user_id", input.ownerUserId);

  query = input.existingShopId
    ? query.eq("shop_id", input.existingShopId)
    : query.is("shop_id", null);

  const result = await query
    .select("remote_id,updated_at,deleted_at")
    .maybeSingle<HistorySessionMutationRow>();

  if (!result.error || !isLegacyHistorySchemaError(result.error)) {
    return result;
  }

  const legacyRow = omitShopId(row);

  return input.supabase
    .from("shared_sheet_sessions")
    .update(legacyRow)
    .eq("remote_id", input.remoteId)
    .eq("owner_user_id", input.ownerUserId)
    .select("remote_id,updated_at,deleted_at")
    .maybeSingle<HistorySessionMutationRow>();
}

async function writeHistoryAudit(input: {
  code: string;
  context: ReadyShopActionContext;
  metadata?: Record<string, Json>;
  operation: "create" | "tombstone" | "update";
  owner: Extract<HistoryOwnerScope, { ok: true }>;
  remoteId: string;
  rowCount: number;
  severity: "critical" | "info" | "warning";
  supabase: SupabaseAdminClient;
}) {
  const { data, error } = await input.supabase
    .from("audit_logs")
    .insert({
      actor_profile_id:
        input.context.principalKind === "personal_account"
          ? input.context.actorProfileId
          : null,
      actor_staff_id:
        input.context.principalKind === "pos_staff_manager"
          ? input.context.actorStaffId
          : null,
      event_key: `shop.history.session.${input.operation}.success`,
      metadata_redacted: {
        actor_kind: input.context.principalKind,
        catalog_scope: input.owner.catalogScope,
        code: input.code,
        operation: input.operation,
        overlay_schema: SESSION_OVERLAY_SCHEMA,
        payload_version: SESSION_PAYLOAD_VERSION,
        row_count: input.rowCount,
        source: "admin_web",
        ...(input.metadata ?? {}),
      },
      result: "success",
      scope: "shop",
      severity: input.severity,
      shop_id: input.context.selectedShop.shopId,
      target_id: input.remoteId,
      target_type: "history_session",
    })
    .select("audit_log_id")
    .maybeSingle<Pick<Tables<"audit_logs">, "audit_log_id">>();

  return error ? undefined : data?.audit_log_id;
}

async function emitHistorySyncEvent(input: {
  context: ReadyShopActionContext;
  eventType: "history_changed" | "history_tombstone";
  metadata?: Record<string, Json>;
  operation: "create" | "tombstone" | "update";
  owner: Extract<HistoryOwnerScope, { ok: true }>;
  remoteId: string;
  rowCount: number;
  seedTimestamp: string;
  supabase: SupabaseAdminClient;
}) {
  return writeAdminWebSyncEvent({
    clientEventSeed: [
      "history",
      input.operation,
      input.remoteId,
      input.seedTimestamp,
    ].join(":"),
    domain: "history",
    entityIds: {
      session_ids: [input.remoteId],
    },
    eventType: input.eventType,
    metadata: {
      actor_kind: input.context.principalKind,
      catalog_scope: input.owner.catalogScope,
      operation: input.operation,
      overlay_schema: SESSION_OVERLAY_SCHEMA,
      payload_version: SESSION_PAYLOAD_VERSION,
      row_count: input.rowCount,
      ...(input.metadata ?? {}),
    },
    ownerUserId: input.owner.ownerUserId,
    shopId: input.context.selectedShop.shopId,
    supabase: input.supabase,
  });
}

function finalizeHistoryMutation(input: {
  auditEventId?: string;
  context: ReadyShopActionContext;
  remoteId: string;
  syncResult: Awaited<ReturnType<typeof emitHistorySyncEvent>>;
}) {
  if (!input.auditEventId) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: input.context.selectedShop.shopId,
      targetId: input.remoteId,
    });
  }

  if (!input.syncResult.ok) {
    return shopAdminActionResult(input.syncResult.code, {
      auditEventId: input.auditEventId,
      ok: false,
      shopId: input.context.selectedShop.shopId,
      targetId: input.remoteId,
    });
  }

  return shopAdminActionResult("success", {
    auditEventId: input.auditEventId,
    shopId: input.context.selectedShop.shopId,
    targetId: input.remoteId,
  });
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

  const supabase = historyAdminClientForContext(input.context);

  if (!supabase) {
    return {
      code: "not_configured",
      message: shopAdminActionResult("not_configured").message,
      ok: false,
    };
  }

  const owner = await resolveHistoryOwner(input.context, supabase);

  if (!owner.ok) {
    return {
      code: owner.result.code,
      message: owner.result.message,
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
  const existingResult = await loadHistorySessionForWrite({
    allowLegacyOwnerBridge: owner.catalogScope === "legacy_owner_bridge",
    ownerUserId: owner.ownerUserId,
    remoteId: payload.remoteId,
    shopId: input.context.selectedShop.shopId,
    supabase,
  });

  if (existingResult.error) {
    return {
      code: "db_failure",
      message: shopAdminActionResult("db_failure").message,
      ok: false,
      remoteId: payload.remoteId,
    };
  }

  const updatedAt = nowIso();
  let action: "created" | "updated" = existingResult.data ? "updated" : "created";
  const writeResult = existingResult.data
    ? await updateSupplierImportHistorySession({
        existingShopId: existingResult.data.shop_id,
        ownerUserId: owner.ownerUserId,
        payload,
        supabase,
        updatedAt,
      })
    : await insertSupplierImportHistorySession({
        ownerUserId: owner.ownerUserId,
        payload,
        shopId: input.context.selectedShop.shopId,
        supabase,
        updatedAt,
      });

  if (writeResult.error && writeResult.error.code === "23505") {
    action = "updated";
    const retryExistingResult = await loadHistorySessionForWrite({
      allowLegacyOwnerBridge: owner.catalogScope === "legacy_owner_bridge",
      ownerUserId: owner.ownerUserId,
      remoteId: payload.remoteId,
      shopId: input.context.selectedShop.shopId,
      supabase,
    });

    if (retryExistingResult.error || !retryExistingResult.data) {
      return {
        code: "db_failure",
        message: shopAdminActionResult("db_failure").message,
        ok: false,
        remoteId: payload.remoteId,
      };
    }

    const retryUpdateResult = await updateSupplierImportHistorySession({
      existingShopId: retryExistingResult.data.shop_id,
      ownerUserId: owner.ownerUserId,
      payload,
      supabase,
      updatedAt: nowIso(),
    });

    if (retryUpdateResult.error || !retryUpdateResult.data) {
      return {
        code: "db_failure",
        message: shopAdminActionResult("db_failure").message,
        ok: false,
        remoteId: payload.remoteId,
      };
    }
  } else if (writeResult.error) {
    return {
      code: "db_failure",
      message: shopAdminActionResult("db_failure").message,
      ok: false,
      remoteId: payload.remoteId,
    };
  } else if (existingResult.data && !writeResult.data) {
    return {
      code: "not_found",
      message: shopAdminActionResult("not_found").message,
      ok: false,
      remoteId: payload.remoteId,
    };
  }

  const auditEventId = await writeHistoryAudit({
    code: "success",
    context: input.context,
    operation: action === "created" ? "create" : "update",
    owner,
    remoteId: payload.remoteId,
    rowCount: payload.rowCount,
    severity: "info",
    supabase,
  });
  const syncResult = await emitHistorySyncEvent({
    context: input.context,
    eventType: "history_changed",
    metadata: {
      import_mode: "supplier",
      source_workflow: "supplier_import",
    },
    operation: action === "created" ? "create" : "update",
    owner,
    remoteId: payload.remoteId,
    rowCount: payload.rowCount,
    seedTimestamp: payload.payloadHash,
    supabase,
  });

  if (!auditEventId) {
    return {
      code: "db_failure",
      message: shopAdminActionResult("db_failure").message,
      ok: false,
      remoteId: payload.remoteId,
    };
  }

  if (!syncResult.ok) {
    return {
      code: syncResult.code,
      message: shopAdminActionResult(syncResult.code).message,
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
  const timestamp = nowIso();
  const { error } = await insertHistorySessionForWrite({
    category: normalizeLabel(input.category),
    data: parsedRows.data,
    displayName: normalizeLabel(input.displayName, "Manual History Entry"),
    ownerUserId: ready.owner.ownerUserId,
    overlay,
    remoteId,
    shopId: ready.context.selectedShop.shopId,
    supplier: normalizeLabel(input.supplier),
    supabase: ready.supabase,
    timestamp,
  });

  if (error) {
    return shopAdminActionResult(
      error.code === "23505" ? "conflict" : "db_failure",
      {
        ok: false,
        shopId: ready.context.selectedShop.shopId,
        targetId: remoteId,
      },
    );
  }

  const auditEventId = await writeHistoryAudit({
    code: "success",
    context: ready.context,
    operation: "create",
    owner: ready.owner,
    remoteId,
    rowCount: parsedRows.data.length,
    severity: "info",
    supabase: ready.supabase,
  });
  const syncResult = await emitHistorySyncEvent({
    context: ready.context,
    eventType: "history_changed",
    operation: "create",
    owner: ready.owner,
    remoteId,
    rowCount: parsedRows.data.length,
    seedTimestamp: timestamp,
    supabase: ready.supabase,
  });

  return finalizeHistoryMutation({
    auditEventId,
    context: ready.context,
    remoteId,
    syncResult,
  });
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

  const existingResult = await loadHistorySessionForWrite({
    allowLegacyOwnerBridge: ready.owner.catalogScope === "legacy_owner_bridge",
    ownerUserId: ready.owner.ownerUserId,
    remoteId,
    shopId: ready.context.selectedShop.shopId,
    supabase: ready.supabase,
  });

  if (existingResult.error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  if (!existingResult.data) {
    return shopAdminActionResult("not_found", {
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  if (existingResult.data.deleted_at) {
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
      : jsonGridFromExistingData(existingResult.data.data);

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

  const updateResult = await updateHistorySessionForWrite({
    category: normalizeLabel(input.category),
    data,
    displayName: normalizeLabel(
      input.displayName,
      existingResult.data.display_name || "Manual History Entry",
    ),
    existingShopId: existingResult.data.shop_id,
    ownerUserId: ready.owner.ownerUserId,
    overlay,
    remoteId,
    supplier: normalizeLabel(input.supplier),
    supabase: ready.supabase,
    timestamp: existingResult.data.timestamp,
  });

  if (updateResult.error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  if (!updateResult.data) {
    return shopAdminActionResult("not_found", {
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  const seedTimestamp = updateResult.data.updated_at;
  const auditEventId = await writeHistoryAudit({
    code: "success",
    context: ready.context,
    operation: "update",
    owner: ready.owner,
    remoteId,
    rowCount: data.length,
    severity: "info",
    supabase: ready.supabase,
  });
  const syncResult = await emitHistorySyncEvent({
    context: ready.context,
    eventType: "history_changed",
    operation: "update",
    owner: ready.owner,
    remoteId,
    rowCount: data.length,
    seedTimestamp,
    supabase: ready.supabase,
  });

  return finalizeHistoryMutation({
    auditEventId,
    context: ready.context,
    remoteId,
    syncResult,
  });
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

  const existingResult = await loadHistorySessionForWrite({
    allowLegacyOwnerBridge: ready.owner.catalogScope === "legacy_owner_bridge",
    ownerUserId: ready.owner.ownerUserId,
    remoteId,
    shopId: ready.context.selectedShop.shopId,
    supabase: ready.supabase,
  });

  if (existingResult.error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  if (!existingResult.data) {
    return shopAdminActionResult("not_found", {
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  if (existingResult.data.deleted_at) {
    return shopAdminActionResult("invalid_state", {
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  if (existingResult.data.payload_version !== SESSION_PAYLOAD_VERSION) {
    return shopAdminActionResult("invalid_state", {
      fieldErrors: {
        rows: "Only payload v2 History Entries can be edited from generated rows.",
      },
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  const data = jsonGridFromExistingData(existingResult.data.data);

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
    overlay: existingResult.data.session_overlay,
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
  const currentOverlay = JSON.stringify(existingResult.data.session_overlay);
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

  if (expectedUpdatedAt && expectedUpdatedAt !== existingResult.data.updated_at) {
    return shopAdminActionResult("conflict", {
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  const updateResult = await updateGeneratedRowsHistorySessionForWrite({
    data: patched.data,
    existingShopId: existingResult.data.shop_id,
    ownerUserId: ready.owner.ownerUserId,
    overlay: patched.overlay,
    remoteId,
    supabase: ready.supabase,
    updatedAt: nowIso(),
  });

  if (updateResult.error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  if (!updateResult.data) {
    return shopAdminActionResult("not_found", {
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  const changedRowCount = patched.changedRows.length;
  const metadata = {
    changed_fields: patched.changedFields,
    changed_rows: patched.changedRows,
    operation_detail: "generated_row_edit",
    source_workflow: "history_detail_generated_screen",
  } satisfies Record<string, Json>;
  const [auditEventId, syncResult] = await Promise.all([
    writeHistoryAudit({
      code: "success",
      context: ready.context,
      metadata,
      operation: "update",
      owner: ready.owner,
      remoteId,
      rowCount: changedRowCount,
      severity: "info",
      supabase: ready.supabase,
    }),
    emitHistorySyncEvent({
      context: ready.context,
      eventType: "history_changed",
      metadata,
      operation: "update",
      owner: ready.owner,
      remoteId,
      rowCount: changedRowCount,
      seedTimestamp: updateResult.data.updated_at,
      supabase: ready.supabase,
    }),
  ]);

  return finalizeHistoryMutation({
    auditEventId,
    context: ready.context,
    remoteId,
    syncResult,
  });
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

  const existingResult = await loadHistorySessionForWrite({
    allowLegacyOwnerBridge: ready.owner.catalogScope === "legacy_owner_bridge",
    ownerUserId: ready.owner.ownerUserId,
    remoteId,
    shopId: ready.context.selectedShop.shopId,
    supabase: ready.supabase,
  });

  if (existingResult.error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  if (!existingResult.data) {
    return shopAdminActionResult("not_found", {
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  if (existingResult.data.deleted_at) {
    return shopAdminActionResult("invalid_state", {
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  const deletedAt = nowIso();
  const tombstoneResult = await tombstoneHistorySessionForWrite({
    deletedAt,
    existingShopId: existingResult.data.shop_id,
    ownerUserId: ready.owner.ownerUserId,
    remoteId,
    supabase: ready.supabase,
  });

  if (tombstoneResult.error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  if (!tombstoneResult.data) {
    return shopAdminActionResult("not_found", {
      ok: false,
      shopId: ready.context.selectedShop.shopId,
      targetId: remoteId,
    });
  }

  const auditEventId = await writeHistoryAudit({
    code: "success",
    context: ready.context,
    operation: "tombstone",
    owner: ready.owner,
    remoteId,
    rowCount: jsonGridFromExistingData(existingResult.data.data).length,
    severity: "warning",
    supabase: ready.supabase,
  });
  const syncResult = await emitHistorySyncEvent({
    context: ready.context,
    eventType: "history_tombstone",
    operation: "tombstone",
    owner: ready.owner,
    remoteId,
    rowCount: 1,
    seedTimestamp: tombstoneResult.data.deleted_at ?? deletedAt,
    supabase: ready.supabase,
  });

  return finalizeHistoryMutation({
    auditEventId,
    context: ready.context,
    remoteId,
    syncResult,
  });
}
