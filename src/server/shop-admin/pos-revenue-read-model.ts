import "server-only";

import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { resolveShopAdminDataAccess } from "./data-access";
import type { ShopAdminShellShop } from "./shop-access";
import type {
  ShopAdminReadModelError,
  ShopAdminReadModelStatus,
} from "./read-model";

type QueryRows<T> = { data: T[] | null; error: unknown | null };
type QuerySingle<T> = { data: T | null; error: unknown | null };

type QueryBuilder<T> = PromiseLike<QueryRows<T>> & {
  eq(column: string, value: unknown): QueryBuilder<T>;
  gte(column: string, value: unknown): QueryBuilder<T>;
  in(column: string, values: readonly unknown[]): QueryBuilder<T>;
  lt(column: string, value: unknown): QueryBuilder<T>;
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  maybeSingle(): Promise<QuerySingle<T>>;
};

type UntypedReadClient = {
  from<T>(table: string): {
    select(columns: string): QueryBuilder<T>;
  };
};

type DailySummaryRow = {
  business_date: string | null;
  card_received_clp: number | string | null;
  cash_received_clp: number | string | null;
  change_given_clp: number | string | null;
  documented_revenue_clp: number | string | null;
  latest_ledger_at: string | null;
  net_revenue_clp: number | string | null;
  other_received_clp: number | string | null;
  refund_count: number | string | null;
  sale_count: number | string | null;
  shop_id: string;
  stock_warning_count: number | string | null;
  transaction_count: number | string | null;
  transfer_received_clp: number | string | null;
  verification_revenue_clp: number | string | null;
  void_count: number | string | null;
};

type PosSaleRow = Pick<
  Tables<"pos_sales">,
  | "business_date"
  | "client_sale_id"
  | "occurred_at"
  | "pos_sale_id"
  | "sale_number"
  | "shop_device_id"
  | "staff_id"
  | "status"
  | "total"
> & {
  business_kind?: string | null;
  client_original_sale_id?: string | null;
  fiscal_status?: string | null;
  net_amount_clp?: number | string | null;
  stock_sync_status?: string | null;
  stock_warning_count?: number | string | null;
};

type BatchRow = Pick<
  Tables<"pos_sales_sync_batches">,
  | "client_batch_id"
  | "created_at"
  | "line_count"
  | "pos_sales_sync_batch_id"
  | "received_at"
  | "sale_count"
  | "shop_device_id"
  | "staff_id"
  | "status"
>;

type DeviceRow = Pick<
  Tables<"shop_devices">,
  "display_name" | "last_seen_at" | "shop_device_id" | "status"
>;

type StaffRow = {
  display_name: string | null;
  staff_code: string | null;
  staff_id: string;
  status: string | null;
};

type StockWarningRow = {
  created_at: string;
  issue_code: string | null;
  movement_kind: string;
  pos_sale_id: string;
  product_id: string | null;
  quantity_delta: number | string | null;
  status: string;
  stock_after: number | string | null;
  stock_before: number | string | null;
};

export type ShopPosRevenueSummary = {
  cardClp: number;
  cashClp: number;
  changeGivenClp: number;
  documentedRevenueClp: number;
  latestLedgerAt: string | null;
  netRevenueClp: number;
  otherClp: number;
  refundCount: number;
  saleCount: number;
  stockWarningCount: number;
  ticketAverageClp: number;
  transactionCount: number;
  transferClp: number;
  verificationRevenueClp: number;
  voidCount: number;
};

export type ShopPosRevenueDailyRow = ShopPosRevenueSummary & {
  businessDate: string;
};

export type ShopPosRevenueMonthlyRow = ShopPosRevenueSummary & {
  month: string;
};

export type ShopPosRevenueSaleRow = {
  businessDate: string | null;
  clientOriginalSaleId: string | null;
  clientSaleId: string;
  device: string;
  fiscalStatus: string;
  occurredAt: string;
  paymentSummary: string;
  posSaleId: string;
  saleKind: string;
  saleNumber: string | null;
  staff: string;
  status: string;
  stockStatus: string;
  stockWarningCount: number;
  totalClp: number;
};

export type ShopPosRevenueSyncBatchRow = {
  clientBatchId: string;
  createdAt: string;
  device: string;
  lineCount: number;
  receivedAt: string;
  saleCount: number;
  staff: string;
  status: string;
  syncBatchId: string;
};

export type ShopPosRevenueStockWarningRow = {
  createdAt: string;
  issueCode: string | null;
  movementKind: string;
  productId: string | null;
  quantityDelta: number;
  status: string;
  stockAfter: number | null;
  stockBefore: number | null;
};

export type ShopPosRevenueReadModel = {
  status: ShopAdminReadModelStatus;
  selectedShop: ShopAdminShellShop | null;
  filters: {
    month: string;
    today: string;
    year: string;
  };
  today: ShopPosRevenueSummary;
  month: {
    days: readonly ShopPosRevenueDailyRow[];
    summary: ShopPosRevenueSummary;
  };
  year: {
    months: readonly ShopPosRevenueMonthlyRow[];
    summary: ShopPosRevenueSummary;
  };
  recentSales: readonly ShopPosRevenueSaleRow[];
  syncBatches: readonly ShopPosRevenueSyncBatchRow[];
  stockWarnings: readonly ShopPosRevenueStockWarningRow[];
  realtime: {
    deviceCount: number;
    lastSyncAt: string | null;
    staleAfterSeconds: number;
    status: "live" | "offline" | "stale";
  };
  readOnly: true;
  source: "supabase_admin_server";
  reason: string;
  error?: ShopAdminReadModelError;
};

type GetShopPosRevenueReadModelOptions = {
  adminClient?: SupabaseAdminClient | null;
  client?: SupabaseServerClient | null;
  month?: string | null;
  requestedShopId?: string | null;
  year?: string | null;
};

const emptySummary: ShopPosRevenueSummary = {
  cardClp: 0,
  cashClp: 0,
  changeGivenClp: 0,
  documentedRevenueClp: 0,
  latestLedgerAt: null,
  netRevenueClp: 0,
  otherClp: 0,
  refundCount: 0,
  saleCount: 0,
  stockWarningCount: 0,
  ticketAverageClp: 0,
  transactionCount: 0,
  transferClp: 0,
  verificationRevenueClp: 0,
  voidCount: 0,
};

function asReadClient(client: SupabaseAdminClient): UntypedReadClient {
  return client as unknown as UntypedReadClient;
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

function datePartsInChile(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Santiago",
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    day: values.day,
    month: values.month,
    today: `${values.year}-${values.month}-${values.day}`,
    year: values.year,
  };
}

function normalizeMonth(value: string | null | undefined) {
  const candidate = value?.trim() ?? "";

  if (/^\d{4}-\d{2}$/.test(candidate)) {
    return candidate;
  }

  const parts = datePartsInChile();

  return `${parts.year}-${parts.month}`;
}

function normalizeYear(value: string | null | undefined) {
  const candidate = value?.trim() ?? "";

  if (/^\d{4}$/.test(candidate)) {
    return candidate;
  }

  return datePartsInChile().year;
}

function addMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1, 1));
  date.setUTCMonth(date.getUTCMonth() + 1);

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function summaryFromRow(row: DailySummaryRow | null | undefined): ShopPosRevenueSummary {
  if (!row) {
    return emptySummary;
  }

  const transactionCount = numberValue(row.transaction_count);
  const netRevenueClp = numberValue(row.net_revenue_clp);

  return {
    cardClp: numberValue(row.card_received_clp),
    cashClp: numberValue(row.cash_received_clp),
    changeGivenClp: numberValue(row.change_given_clp),
    documentedRevenueClp: numberValue(row.documented_revenue_clp),
    latestLedgerAt: row.latest_ledger_at,
    netRevenueClp,
    otherClp: numberValue(row.other_received_clp),
    refundCount: numberValue(row.refund_count),
    saleCount: numberValue(row.sale_count),
    stockWarningCount: numberValue(row.stock_warning_count),
    ticketAverageClp:
      transactionCount > 0 ? Math.round(netRevenueClp / transactionCount) : 0,
    transactionCount,
    transferClp: numberValue(row.transfer_received_clp),
    verificationRevenueClp: numberValue(row.verification_revenue_clp),
    voidCount: numberValue(row.void_count),
  };
}

function mergeSummaries(rows: readonly ShopPosRevenueSummary[]) {
  const latestLedgerAt =
    rows
      .map((row) => row.latestLedgerAt)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
  const totals = rows.reduce<ShopPosRevenueSummary>(
    (acc, row) => ({
      ...acc,
      cardClp: acc.cardClp + row.cardClp,
      cashClp: acc.cashClp + row.cashClp,
      changeGivenClp: acc.changeGivenClp + row.changeGivenClp,
      documentedRevenueClp: acc.documentedRevenueClp + row.documentedRevenueClp,
      netRevenueClp: acc.netRevenueClp + row.netRevenueClp,
      otherClp: acc.otherClp + row.otherClp,
      refundCount: acc.refundCount + row.refundCount,
      saleCount: acc.saleCount + row.saleCount,
      stockWarningCount: acc.stockWarningCount + row.stockWarningCount,
      transactionCount: acc.transactionCount + row.transactionCount,
      transferClp: acc.transferClp + row.transferClp,
      verificationRevenueClp:
        acc.verificationRevenueClp + row.verificationRevenueClp,
      voidCount: acc.voidCount + row.voidCount,
    }),
    { ...emptySummary },
  );

  return {
    ...totals,
    latestLedgerAt,
    ticketAverageClp:
      totals.transactionCount > 0
        ? Math.round(totals.netRevenueClp / totals.transactionCount)
        : 0,
  };
}

function rowToDaily(row: DailySummaryRow): ShopPosRevenueDailyRow {
  return {
    ...summaryFromRow(row),
    businessDate: row.business_date ?? "",
  };
}

function annualMonths(rows: readonly ShopPosRevenueDailyRow[]) {
  const byMonth = new Map<string, ShopPosRevenueSummary[]>();

  for (const row of rows) {
    const month = row.businessDate.slice(0, 7);
    const existing = byMonth.get(month) ?? [];
    existing.push(row);
    byMonth.set(month, existing);
  }

  return [...byMonth.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map<ShopPosRevenueMonthlyRow>(([month, summaries]) => ({
      ...mergeSummaries(summaries),
      month,
    }));
}

function latestTimestamp(values: readonly (string | null | undefined)[]) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function realtimeStatus(lastSyncAt: string | null) {
  if (!lastSyncAt) {
    return "offline" as const;
  }

  const ageMs = Date.now() - Date.parse(lastSyncAt);

  if (ageMs <= 30_000) {
    return "live" as const;
  }

  return ageMs <= 5 * 60_000 ? ("stale" as const) : ("offline" as const);
}

function nameById<T extends { id: string }>(
  rows: readonly T[],
  getName: (row: T) => string,
) {
  return new Map(rows.map((row) => [row.id, getName(row)]));
}

function paymentSummary(row: PosSaleRow) {
  return row.business_kind === "refund"
    ? "Refund"
    : row.business_kind === "void"
      ? "Void"
      : "Ledger";
}

function errorResult(
  selectedShop: ShopAdminShellShop | null,
  status: ShopAdminReadModelStatus,
  reason: string,
  error?: unknown,
): ShopPosRevenueReadModel {
  const parts = datePartsInChile();
  const month = `${parts.year}-${parts.month}`;
  const year = parts.year;

  return {
    status,
    selectedShop,
    filters: {
      month,
      today: parts.today,
      year,
    },
    today: emptySummary,
    month: {
      days: [],
      summary: emptySummary,
    },
    year: {
      months: [],
      summary: emptySummary,
    },
    recentSales: [],
    syncBatches: [],
    stockWarnings: [],
    realtime: {
      deviceCount: 0,
      lastSyncAt: null,
      staleAfterSeconds: 30,
      status: "offline",
    },
    readOnly: true,
    source: "supabase_admin_server",
    reason,
    error: error
      ? {
          code: error instanceof Error && error.name ? error.name : "pos_revenue_read_error",
          message: "POS revenue read model could not be loaded.",
        }
      : undefined,
  };
}

export async function getShopPosRevenueReadModel(
  options: GetShopPosRevenueReadModelOptions = {},
): Promise<ShopPosRevenueReadModel> {
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
      "Supabase service-role runtime env is not configured for POS revenue reads.",
    );
  }

  const adminClient = options.adminClient ?? createSupabaseAdminClient(adminConfig);

  if (!adminClient) {
    return errorResult(
      access.selectedShop,
      "not_configured",
      "Supabase admin client is unavailable for POS revenue reads.",
    );
  }

  const selectedShop = access.selectedShop;
  const readClient = asReadClient(adminClient);
  const parts = datePartsInChile();
  const month = normalizeMonth(options.month);
  const year = normalizeYear(options.year);
  const nextMonth = addMonth(month);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${Number(year) + 1}-01-01`;
  const [
    todayResult,
    monthResult,
    yearResult,
    recentSalesResult,
    batchesResult,
    devicesResult,
    staffResult,
    stockWarningsResult,
  ] = await Promise.all([
    readClient
      .from<DailySummaryRow>("pos_revenue_daily_summary_v")
      .select("*")
      .eq("shop_id", selectedShop.shopId)
      .eq("business_date", parts.today)
      .maybeSingle(),
    readClient
      .from<DailySummaryRow>("pos_revenue_daily_summary_v")
      .select("*")
      .eq("shop_id", selectedShop.shopId)
      .gte("business_date", `${month}-01`)
      .lt("business_date", `${nextMonth}-01`)
      .order("business_date", { ascending: true })
      .limit(62),
    readClient
      .from<DailySummaryRow>("pos_revenue_daily_summary_v")
      .select("*")
      .eq("shop_id", selectedShop.shopId)
      .gte("business_date", yearStart)
      .lt("business_date", yearEnd)
      .order("business_date", { ascending: true })
      .limit(370),
    adminClient
      .from("pos_sales")
      .select(
        "pos_sale_id,client_sale_id,sale_number,occurred_at,business_date,total,status,shop_device_id,staff_id,business_kind,client_original_sale_id,fiscal_status,net_amount_clp,stock_sync_status,stock_warning_count",
      )
      .eq("shop_id", selectedShop.shopId)
      .eq("status", "accepted")
      .order("occurred_at", { ascending: false })
      .limit(50)
      .returns<PosSaleRow[]>(),
    adminClient
      .from("pos_sales_sync_batches")
      .select(
        "pos_sales_sync_batch_id,client_batch_id,status,sale_count,line_count,shop_device_id,staff_id,received_at,created_at",
      )
      .eq("shop_id", selectedShop.shopId)
      .order("created_at", { ascending: false })
      .limit(25)
      .returns<BatchRow[]>(),
    adminClient
      .from("shop_devices")
      .select("shop_device_id,display_name,status,last_seen_at")
      .eq("shop_id", selectedShop.shopId)
      .eq("device_type", "pos")
      .order("updated_at", { ascending: false })
      .limit(100)
      .returns<DeviceRow[]>(),
    readClient
      .from<StaffRow>("staff_accounts_safe")
      .select("staff_id,staff_code,display_name,status")
      .eq("shop_id", selectedShop.shopId)
      .limit(200),
    readClient
      .from<StockWarningRow>("pos_sale_stock_movements")
      .select(
        "created_at,issue_code,movement_kind,pos_sale_id,product_id,quantity_delta,status,stock_after,stock_before",
      )
      .eq("shop_id", selectedShop.shopId)
      .in("status", ["unresolved_product", "stock_conflict", "failed"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const error =
    todayResult.error ??
    monthResult.error ??
    yearResult.error ??
    recentSalesResult.error ??
    batchesResult.error ??
    devicesResult.error ??
    staffResult.error ??
    stockWarningsResult.error;

  if (error) {
    return errorResult(
      selectedShop,
      "error",
      "POS revenue rows could not be loaded through the server boundary.",
      error,
    );
  }

  const monthDays = (monthResult.data ?? [])
    .map(rowToDaily)
    .filter((row) => row.businessDate);
  const yearDays = (yearResult.data ?? [])
    .map(rowToDaily)
    .filter((row) => row.businessDate);
  const months = annualMonths(yearDays);
  const deviceNames = nameById(
    (devicesResult.data ?? []).map((row) => ({
      id: row.shop_device_id,
      name: row.display_name,
      status: row.status,
    })),
    (row) => row.name || row.status || "POS device",
  );
  const staffNames = nameById(
    (staffResult.data ?? []).map((row) => ({
      id: row.staff_id,
      name: row.display_name || row.staff_code,
      status: row.status,
    })),
    (row) => row.name || row.status || "POS staff",
  );
  const recentSales = (recentSalesResult.data ?? []).map<ShopPosRevenueSaleRow>(
    (row) => ({
      businessDate: row.business_date,
      clientOriginalSaleId: row.client_original_sale_id ?? null,
      clientSaleId: row.client_sale_id,
      device: deviceNames.get(row.shop_device_id) ?? "POS device",
      fiscalStatus: row.fiscal_status ?? "not_reported",
      occurredAt: row.occurred_at,
      paymentSummary: paymentSummary(row),
      posSaleId: row.pos_sale_id,
      saleKind: row.business_kind ?? "sale",
      saleNumber: row.sale_number,
      staff: staffNames.get(row.staff_id) ?? "POS staff",
      status: row.status,
      stockStatus: row.stock_sync_status ?? "not_applicable",
      stockWarningCount: numberValue(row.stock_warning_count),
      totalClp: numberValue(row.net_amount_clp ?? row.total),
    }),
  );
  const syncBatches = (batchesResult.data ?? []).map<ShopPosRevenueSyncBatchRow>(
    (row) => ({
      clientBatchId: row.client_batch_id,
      createdAt: row.created_at,
      device: deviceNames.get(row.shop_device_id) ?? "POS device",
      lineCount: row.line_count,
      receivedAt: row.received_at,
      saleCount: row.sale_count,
      staff: staffNames.get(row.staff_id) ?? "POS staff",
      status: row.status,
      syncBatchId: row.pos_sales_sync_batch_id,
    }),
  );
  const stockWarnings = (stockWarningsResult.data ?? [])
    .map<ShopPosRevenueStockWarningRow>((row) => ({
      createdAt: row.created_at,
      issueCode: row.issue_code,
      movementKind: row.movement_kind,
      productId: row.product_id,
      quantityDelta: numberValue(row.quantity_delta),
      status: row.status,
      stockAfter:
        row.stock_after === null || row.stock_after === undefined
          ? null
          : numberValue(row.stock_after),
      stockBefore:
        row.stock_before === null || row.stock_before === undefined
          ? null
          : numberValue(row.stock_before),
    }));
  const lastSyncAt = latestTimestamp([
    summaryFromRow(todayResult.data).latestLedgerAt,
    ...syncBatches.map((row) => row.receivedAt),
  ]);

  return {
    status: "ready",
    selectedShop,
    filters: {
      month,
      today: parts.today,
      year,
    },
    today: summaryFromRow(todayResult.data),
    month: {
      days: monthDays,
      summary: mergeSummaries(monthDays),
    },
    year: {
      months,
      summary: mergeSummaries(months),
    },
    recentSales,
    syncBatches,
    stockWarnings,
    realtime: {
      deviceCount: devicesResult.data?.length ?? 0,
      lastSyncAt,
      staleAfterSeconds: 30,
      status: realtimeStatus(lastSyncAt),
    },
    readOnly: true,
    source: "supabase_admin_server",
    reason:
      "POS revenue rows are loaded server-side from the signed ledger and selected shop boundary.",
  };
}
