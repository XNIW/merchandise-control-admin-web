import "server-only";

import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Database, Json, Tables } from "@/lib/supabase/database.types";
import { stringifyRedactedJson } from "./history-read-model";
import { resolveShopAdminDataAccess } from "./data-access";
import type { ShopAdminShellShop } from "./shop-access";
import type {
  ShopAdminReadModelError,
  ShopAdminReadModelStatus,
} from "./read-model";

type BatchRow = Pick<
  Tables<"pos_sales_sync_batches">,
  | "client_batch_id"
  | "conflict_count"
  | "created_at"
  | "line_count"
  | "metadata_redacted"
  | "pos_sales_sync_batch_id"
  | "received_at"
  | "sale_count"
  | "shop_device_id"
  | "staff_id"
  | "status"
>;

type SaleIssueRow = Pick<
  Tables<"pos_sales">,
  | "business_date"
  | "business_kind"
  | "client_sale_id"
  | "net_amount_clp"
  | "occurred_at"
  | "pos_sale_id"
  | "sale_number"
  | "shop_device_id"
  | "staff_id"
  | "status"
  | "stock_sync_status"
  | "stock_warning_count"
  | "total"
>;

type StockWarningRow = Pick<
  Tables<"pos_sale_stock_movements">,
  | "created_at"
  | "issue_code"
  | "movement_kind"
  | "movement_key"
  | "pos_sale_id"
  | "pos_sale_stock_movement_id"
  | "product_id"
  | "quantity_delta"
  | "status"
  | "stock_after"
  | "stock_before"
>;

type AuditLogRow = Pick<
  Tables<"audit_logs">,
  | "audit_log_id"
  | "created_at"
  | "event_key"
  | "metadata_redacted"
  | "result"
  | "severity"
  | "target_id"
  | "target_type"
>;

type AuditFailureRow = AuditLogRow;
type RecoveryActionRow = AuditLogRow;

type DeviceRow = Pick<
  Tables<"shop_devices">,
  "display_name" | "shop_device_id" | "status"
>;

type StaffRow = Pick<
  Database["public"]["Views"]["staff_accounts_safe"]["Row"],
  "display_name" | "staff_code" | "staff_id" | "status"
>;

export type PosRecoveryBatch = {
  acceptedSaleCount: number;
  clientBatchId: string;
  conflictCount: number;
  duplicateSaleCount: number;
  lineCount: number;
  receivedAt: string;
  salesSyncBatchId: string;
  saleCount: number;
  status: string;
  device: string;
  staff: string;
};

export type PosRecoverySaleIssue = {
  businessDate: string | null;
  clientSaleId: string;
  device: string;
  netAmountClp: number;
  occurredAt: string;
  posSaleId: string;
  saleKind: string;
  saleNumber: string | null;
  staff: string;
  status: string;
  stockStatus: string;
  stockWarningCount: number;
};

export type PosRecoveryStockWarning = {
  createdAt: string;
  issueCode: string | null;
  movementKind: string;
  movementKey: string;
  posSaleId: string;
  posSaleStockMovementId: string;
  productId: string | null;
  quantityDelta: number;
  status: string;
  stockAfter: number | null;
  stockBefore: number | null;
};

export type PosRecoveryAuditFailure = {
  auditLogId: string;
  createdAt: string;
  eventKey: string;
  metadataPreview: string;
  result: string;
  severity: string;
  targetId: string | null;
  targetType: string | null;
};

export type PosRecoveryAction = {
  actionType: string;
  auditLogId: string;
  createdAt: string;
  metadataPreview: string;
  result: string;
  severity: string;
  targetId: string | null;
  targetType: string | null;
};

export type ShopPosSyncRecoveryReadModel = {
  status: ShopAdminReadModelStatus;
  selectedShop: ShopAdminShellShop | null;
  latestBatch: PosRecoveryBatch | null;
  batchStatusCounts: Record<string, number>;
  issueSales: readonly PosRecoverySaleIssue[];
  recentFailures: readonly PosRecoveryAuditFailure[];
  recoveryActions: readonly PosRecoveryAction[];
  stockWarnings: readonly PosRecoveryStockWarning[];
  unavailableNotes: readonly string[];
  readOnly: true;
  recoveryActionsAppendOnly: true;
  source: "supabase_admin_server";
  reason: string;
  error?: ShopAdminReadModelError;
};

type GetShopPosSyncRecoveryReadModelOptions = {
  adminClient?: SupabaseAdminClient | null;
  client?: SupabaseServerClient | null;
  requestedShopId?: string | null;
};

const emptyRows = {
  batchStatusCounts: {},
  issueSales: [],
  latestBatch: null,
  recentFailures: [],
  recoveryActions: [],
  stockWarnings: [],
} as const;

const unavailableNotes = [
  "Le vendite ancora nella outbox locale del POS non sono visibili al server finche il dispositivo non invia un batch.",
  "Gli stati failed_blocked e needs_attention sono locali al POS finche non arrivano come audit o batch server-side.",
] as const;

function redactError(error: unknown): ShopAdminReadModelError {
  return {
    code:
      error instanceof Error && error.name
        ? error.name
        : "pos_sync_recovery_read_error",
    message: "POS sync recovery rows could not be loaded.",
  };
}

function errorResult(
  selectedShop: ShopAdminShellShop | null,
  status: ShopAdminReadModelStatus,
  reason: string,
  error?: unknown,
): ShopPosSyncRecoveryReadModel {
  return {
    ...emptyRows,
    status,
    selectedShop,
    unavailableNotes,
    readOnly: true,
    recoveryActionsAppendOnly: true,
    source: "supabase_admin_server",
    reason,
    error: error ? redactError(error) : undefined,
  };
}

function countByStatus(rows: readonly BatchRow[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
}

function numberValue(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function metadataRecord(value: Json | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function metadataCount(value: Json | null, key: string) {
  const record = metadataRecord(value);
  const candidate = record?.[key];

  return typeof candidate === "number" || typeof candidate === "string"
    ? numberValue(candidate)
    : null;
}

function displayDevice(row: DeviceRow | undefined) {
  if (!row) {
    return "Device non disponibile";
  }

  const name = row.display_name?.trim();

  return `${name || "POS device"} (${row.status})`;
}

function displayStaff(row: StaffRow | undefined) {
  if (!row) {
    return "Staff non disponibile";
  }

  const displayName = row.display_name?.trim();
  const staffCode = row.staff_code?.trim();

  return `${displayName || staffCode || "Staff POS"} (${row.status ?? "unknown"})`;
}

function mapLatestBatch(
  row: BatchRow | null,
  devicesById: ReadonlyMap<string, DeviceRow>,
  staffById: ReadonlyMap<string, StaffRow>,
): PosRecoveryBatch | null {
  if (!row) {
    return null;
  }

  const acceptedSaleCount =
    metadataCount(row.metadata_redacted, "accepted_sale_count") ??
    (row.status === "accepted" ? row.sale_count : 0);
  const duplicateSaleCount =
    metadataCount(row.metadata_redacted, "duplicate_sale_count") ??
    (row.status === "duplicate" ? row.sale_count : 0);

  return {
    acceptedSaleCount,
    clientBatchId: row.client_batch_id,
    conflictCount: row.conflict_count,
    duplicateSaleCount,
    lineCount: row.line_count,
    receivedAt: row.received_at ?? row.created_at,
    salesSyncBatchId: row.pos_sales_sync_batch_id,
    saleCount: row.sale_count,
    status: row.status,
    device: displayDevice(devicesById.get(row.shop_device_id)),
    staff: displayStaff(staffById.get(row.staff_id)),
  };
}

function mapSaleIssue(
  row: SaleIssueRow,
  devicesById: ReadonlyMap<string, DeviceRow>,
  staffById: ReadonlyMap<string, StaffRow>,
): PosRecoverySaleIssue {
  return {
    businessDate: row.business_date,
    clientSaleId: row.client_sale_id,
    device: displayDevice(devicesById.get(row.shop_device_id)),
    netAmountClp: numberValue(row.net_amount_clp ?? row.total),
    occurredAt: row.occurred_at,
    posSaleId: row.pos_sale_id,
    saleKind: row.business_kind,
    saleNumber: row.sale_number,
    staff: displayStaff(staffById.get(row.staff_id)),
    status: row.status,
    stockStatus: row.stock_sync_status,
    stockWarningCount: row.stock_warning_count,
  };
}

function mapStockWarning(row: StockWarningRow): PosRecoveryStockWarning {
  return {
    createdAt: row.created_at,
    issueCode: row.issue_code,
    movementKind: row.movement_kind,
    movementKey: row.movement_key,
    posSaleId: row.pos_sale_id,
    posSaleStockMovementId: row.pos_sale_stock_movement_id,
    productId: row.product_id,
    quantityDelta: numberValue(row.quantity_delta),
    status: row.status,
    stockAfter: row.stock_after === null ? null : numberValue(row.stock_after),
    stockBefore: row.stock_before === null ? null : numberValue(row.stock_before),
  };
}

function actionTypeFromEventKey(eventKey: string) {
  const match = /^pos\.sync\.recovery\.([a-z_]+)\.success$/.exec(eventKey);

  return match?.[1] ?? "recovery_action";
}

function mapAuditFailure(row: AuditFailureRow): PosRecoveryAuditFailure {
  return {
    auditLogId: row.audit_log_id,
    createdAt: row.created_at,
    eventKey: row.event_key,
    metadataPreview: stringifyRedactedJson(row.metadata_redacted as Json, 420),
    result: row.result,
    severity: row.severity,
    targetId: row.target_id,
    targetType: row.target_type,
  };
}

function mapRecoveryAction(row: RecoveryActionRow): PosRecoveryAction {
  return {
    actionType: actionTypeFromEventKey(row.event_key),
    auditLogId: row.audit_log_id,
    createdAt: row.created_at,
    metadataPreview: stringifyRedactedJson(row.metadata_redacted as Json, 420),
    result: row.result,
    severity: row.severity,
    targetId: row.target_id,
    targetType: row.target_type,
  };
}

export async function getShopPosSyncRecoveryReadModel(
  options: GetShopPosSyncRecoveryReadModelOptions = {},
): Promise<ShopPosSyncRecoveryReadModel> {
  const access = await resolveShopAdminDataAccess(options);

  if (access.status !== "ready") {
    return errorResult(
      null,
      access.status === "not_configured" || access.status === "error"
        ? access.status
        : "unauthorized",
      access.reason,
    );
  }

  const adminConfig = resolveSupabaseAdminConfig();

  if (adminConfig.status !== "configured") {
    return errorResult(
      access.selectedShop,
      "not_configured",
      "Supabase service-role runtime env is not configured for POS recovery reads.",
    );
  }

  const adminClient = options.adminClient ?? createSupabaseAdminClient(adminConfig);

  if (!adminClient) {
    return errorResult(
      access.selectedShop,
      "not_configured",
      "Supabase admin client is unavailable for POS recovery reads.",
    );
  }

  const selectedShop = access.selectedShop;
  const [
    batchesResult,
    salesResult,
    stockWarningsResult,
    auditFailuresResult,
    recoveryActionsResult,
    devicesResult,
    staffResult,
  ] = await Promise.all([
    adminClient
      .from("pos_sales_sync_batches")
      .select(
        "pos_sales_sync_batch_id,client_batch_id,status,sale_count,line_count,conflict_count,metadata_redacted,shop_device_id,staff_id,received_at,created_at",
      )
      .eq("shop_id", selectedShop.shopId)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<BatchRow[]>(),
    adminClient
      .from("pos_sales")
      .select(
        "pos_sale_id,client_sale_id,sale_number,occurred_at,business_date,total,status,shop_device_id,staff_id,business_kind,net_amount_clp,stock_sync_status,stock_warning_count",
      )
      .eq("shop_id", selectedShop.shopId)
      .or(
        "status.neq.accepted,stock_sync_status.in.(stock_warning,stock_conflict,failed),stock_warning_count.gt.0",
      )
      .order("occurred_at", { ascending: false })
      .limit(50)
      .returns<SaleIssueRow[]>(),
    adminClient
      .from("pos_sale_stock_movements")
      .select(
        "created_at,issue_code,movement_kind,movement_key,pos_sale_id,pos_sale_stock_movement_id,product_id,quantity_delta,status,stock_after,stock_before",
      )
      .eq("shop_id", selectedShop.shopId)
      .in("status", ["unresolved_product", "stock_conflict", "failed"])
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<StockWarningRow[]>(),
    adminClient
      .from("audit_logs")
      .select(
        "audit_log_id,event_key,severity,result,target_type,target_id,metadata_redacted,created_at",
      )
      .eq("shop_id", selectedShop.shopId)
      .eq("scope", "shop")
      .or(
        "event_key.like.pos.sales.sync.%,event_key.like.pos.auth.first_login.%,event_key.like.pos.session.heartbeat.%,event_key.like.pos.catalog.pull.%",
      )
      .neq("result", "success")
      .order("created_at", { ascending: false })
      .limit(25)
      .returns<AuditFailureRow[]>(),
    adminClient
      .from("audit_logs")
      .select(
        "audit_log_id,event_key,severity,result,target_type,target_id,metadata_redacted,created_at",
      )
      .eq("shop_id", selectedShop.shopId)
      .eq("scope", "shop")
      .like("event_key", "pos.sync.recovery.%")
      .order("created_at", { ascending: false })
      .limit(25)
      .returns<RecoveryActionRow[]>(),
    adminClient
      .from("shop_devices")
      .select("shop_device_id,display_name,status")
      .eq("shop_id", selectedShop.shopId)
      .eq("device_type", "pos")
      .limit(100)
      .returns<DeviceRow[]>(),
    adminClient
      .from("staff_accounts_safe")
      .select("staff_id,staff_code,display_name,status")
      .eq("shop_id", selectedShop.shopId)
      .limit(200)
      .returns<StaffRow[]>(),
  ]);

  const error =
    batchesResult.error ??
    salesResult.error ??
    stockWarningsResult.error ??
    auditFailuresResult.error ??
    recoveryActionsResult.error ??
    devicesResult.error ??
    staffResult.error;

  if (error) {
    return errorResult(
      selectedShop,
      "error",
      "POS sync recovery rows could not be loaded through the server boundary.",
      error,
    );
  }

  const devicesById = new Map(
    (devicesResult.data ?? []).map((device) => [device.shop_device_id, device]),
  );
  const staffById = new Map(
    (staffResult.data ?? [])
      .filter((staff): staff is StaffRow & { staff_id: string } =>
        Boolean(staff.staff_id),
      )
      .map((staff) => [staff.staff_id, staff]),
  );
  const batchRows = batchesResult.data ?? [];

  return {
    status: "ready",
    selectedShop,
    latestBatch: mapLatestBatch(batchRows[0] ?? null, devicesById, staffById),
    batchStatusCounts: countByStatus(batchRows),
    issueSales: (salesResult.data ?? []).map((row) =>
      mapSaleIssue(row, devicesById, staffById),
    ),
    recentFailures: (auditFailuresResult.data ?? []).map(mapAuditFailure),
    recoveryActions: (recoveryActionsResult.data ?? []).map(mapRecoveryAction),
    stockWarnings: (stockWarningsResult.data ?? []).map(mapStockWarning),
    unavailableNotes,
    readOnly: true,
    recoveryActionsAppendOnly: true,
    source: "supabase_admin_server",
    reason:
      "POS sync recovery reads are scoped to the selected shop; recovery actions are append-only audit events.",
  };
}
