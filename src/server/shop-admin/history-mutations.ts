import "server-only";

import { randomUUID } from "node:crypto";
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
import { writeAdminWebSyncEvent } from "./sync-event-writer";

type ReadyShopActionContext = Extract<
  ShopAdminActionContext,
  { status: "ready" }
>;
type HistorySessionWriteRow = Pick<
  Tables<"shared_sheet_sessions">,
  | "data"
  | "deleted_at"
  | "display_name"
  | "owner_user_id"
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
  ownerUserId: string;
  remoteId: string;
  shopId: string;
  supabase: SupabaseAdminClient;
}) {
  const selectColumns =
    "remote_id,shop_id,owner_user_id,display_name,timestamp,updated_at,deleted_at,data,session_overlay";
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

  if (directResult.error && isLegacyHistorySchemaError(directResult.error)) {
    const legacyResult = await input.supabase
      .from("shared_sheet_sessions")
      .select(
        "remote_id,owner_user_id,display_name,timestamp,updated_at,deleted_at,data,session_overlay",
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
      "remote_id,owner_user_id,display_name,timestamp,updated_at,deleted_at,data,session_overlay",
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
