import "server-only";

import { createHash } from "node:crypto";
import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import type { Json, Tables, TablesInsert } from "@/lib/supabase/database.types";
import { verifyPosSecret } from "./tokens";

export const MAX_POS_SALES_SYNC_JSON_BODY_BYTES = 256 * 1024;

type JsonRecord = { [key: string]: Json | undefined };

type ShopRow = Pick<Tables<"shops">, "shop_code" | "shop_id" | "shop_status">;
type StaffAccountRow = Pick<
  Tables<"staff_accounts">,
  | "credential_status"
  | "credential_version"
  | "locked_until"
  | "must_change_credential"
  | "session_invalidated_at"
  | "shop_id"
  | "staff_id"
  | "status"
>;
type ShopDeviceRow = Pick<Tables<"shop_devices">, "shop_device_id" | "shop_id" | "status">;
type PosDeviceCredentialRow = Pick<
  Tables<"pos_device_credentials">,
  | "expires_at"
  | "pos_device_credential_id"
  | "shop_device_id"
  | "shop_id"
  | "staff_credential_version"
  | "staff_id"
  | "status"
  | "token_hash"
>;
type PosSessionRow = Pick<
  Tables<"pos_sessions">,
  | "expires_at"
  | "issued_at"
  | "pos_device_credential_id"
  | "pos_session_id"
  | "session_token_hash"
  | "shop_device_id"
  | "shop_id"
  | "staff_credential_version"
  | "staff_id"
  | "status"
>;
type ExistingBatchRow = Pick<
  Tables<"pos_sales_sync_batches">,
  | "client_batch_id"
  | "idempotency_key"
  | "payload_hash"
  | "pos_sales_sync_batch_id"
  | "status"
>;
type ExistingSaleRow = Pick<
  Tables<"pos_sales">,
  "client_sale_id" | "idempotency_key" | "payload_hash" | "pos_sale_id" | "status"
>;
type InventorySourceRow = Pick<
  Tables<"shop_inventory_sources">,
  "mapping_state" | "owner_user_id" | "shop_id"
>;
type InventoryProductScopeRow = Pick<
  Tables<"inventory_products">,
  "id" | "owner_user_id" | "shop_id"
>;

type PosSalesSyncFailureCode =
  | "conflict"
  | "db_failure"
  | "denied"
  | "duplicate"
  | "not_configured"
  | "validation_failed";
type PosSalesSyncFailureStatus = 400 | 401 | 409 | 500 | 503;

type PosSalesSyncEndpointResult =
  | {
      body: {
        code: PosSalesSyncFailureCode;
        message: string;
        ok: false;
      };
      status: 400 | 401 | 409 | 500 | 503;
    }
  | {
      body: {
        batch: {
          acceptedSaleCount: number;
          clientBatchId: string;
          conflictCount: number;
          duplicateSaleCount: number;
          lineCount: number;
          posSalesSyncBatchId: string;
          saleCount: number;
          status: "accepted" | "duplicate";
        };
        code: "success" | "duplicate";
        ok: true;
        sales: Array<{
          clientSaleId: string;
          posSaleId: string | null;
          status: "accepted" | "duplicate";
        }>;
        serverTime: string;
        shop: {
          shopCode: string;
          shopId: string;
        };
      };
      status: 200;
    };

export type PosSalesSyncRequestMeta = {
  idempotencyKeyHeader?: string;
  userAgent?: string;
};

type PosSalesSchemaVersion = "pos-sales-v1" | "pos-sales-ledger-v2";
type PosSaleBusinessKind = "refund" | "sale" | "void";
type PosLedgerLineType = "adjustment" | "discount" | "item" | "tax";
type PosPaymentMethod = "card" | "cash" | "other" | "transfer";
type PosFiscalStatus =
  | "accepted_authority"
  | "issued_external"
  | "not_printed_card_policy"
  | "not_reported"
  | "not_required"
  | "printed_local_pdf"
  | "voided";

type ParsedSalesLine = {
  amountClp: number | null;
  barcode: string | null;
  clientLineId: string;
  itemNumber: string | null;
  lineType: PosLedgerLineType;
  linePosition: number;
  lineTotal: number;
  localProductId: string | null;
  productId: string | null;
  productName: string | null;
  quantity: number;
  stockQuantityDelta: number;
  unitAmountClp: number | null;
  unitPrice: number;
};

type ParsedPayment = {
  amountClp: number;
  changeClp: number;
  clientPaymentId: string;
  method: PosPaymentMethod;
};

type ParsedSale = {
  businessDate: string | null;
  businessKind: PosSaleBusinessKind;
  changeAmountClp: number;
  clientSaleId: string;
  clientOriginalSaleId: string | null;
  currency: string;
  discountAmountClp: number | null;
  discountTotal: number;
  fiscalDocumentNumberRedacted: string | null;
  fiscalDocumentType: string | null;
  fiscalPrintedAt: string | null;
  fiscalStatus: PosFiscalStatus;
  grossAmountClp: number | null;
  idempotencyKey: string;
  lines: ParsedSalesLine[];
  netAmountClp: number | null;
  occurredAt: string;
  paidAmountClp: number | null;
  payloadHash: string;
  payments: ParsedPayment[];
  reversalReasonRedacted: string | null;
  saleNumber: string | null;
  sourceSchemaVersion: PosSalesSchemaVersion;
  subtotal: number;
  taxAmountClp: number | null;
  taxTotal: number;
  total: number;
};

type ParsedSalesSyncInput = {
  appVersion?: string;
  batchPayloadHash: string;
  clientBatchId: string;
  deviceToken: string;
  idempotencyKey: string;
  posSessionId: string;
  sales: ParsedSale[];
  schemaVersion: PosSalesSchemaVersion;
  sessionToken: string;
  shopCode?: string;
  shopDeviceId: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_POS_SECRET_LENGTH = 256;
const MAX_SYNC_SALES = 100;
const MAX_SYNC_LINES = 1000;
const CENT_TOLERANCE = 0.01;
const MAX_CLP_AMOUNT = 999_999_999_999;
const SAFE_TEXT_PATTERN = /^[\w .:/#@-]+$/u;
const NUMERIC_TEXT_PATTERN = /^-?\d+(?:\.\d+)?$/;
const INTEGER_TEXT_PATTERN = /^-?\d+$/;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/g;

function failure(
  code: PosSalesSyncFailureCode,
  status: PosSalesSyncFailureStatus,
): PosSalesSyncEndpointResult {
  return {
    body: {
      code,
      message: "POS sales sync request was not accepted.",
      ok: false,
    },
    status,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function childRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return isRecord(value) ? value : {};
}

function stringField(record: Record<string, unknown>, ...keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string") {
      return value;
    }
  }

  return "";
}

function numberField(record: Record<string, unknown>, ...keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim();

      if (!NUMERIC_TEXT_PATTERN.test(normalized)) {
        continue;
      }

      const parsed = Number(normalized);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeText(value: string, maxLength: number) {
  return value
    .replace(CONTROL_CHAR_PATTERN, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function safeText(value: string, maxLength: number) {
  const normalized = normalizeText(value, maxLength);
  return normalized && SAFE_TEXT_PATTERN.test(normalized) ? normalized : "";
}

function positiveAmount(value: number | null) {
  return value !== null && value >= 0 && value <= 999999999 ? Number(value.toFixed(2)) : null;
}

function positiveQuantity(value: number | null) {
  return value !== null && value > 0 && value <= 999999 ? Number(value.toFixed(3)) : null;
}

function parseIsoTimestamp(value: string) {
  const normalized = value.trim();
  const timestamp = Date.parse(normalized);

  if (!normalized || Number.isNaN(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function parseBusinessDate(value: string) {
  const normalized = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? normalized
    : null;
}

function stableHash(value: unknown) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex")}`;
}

function hasDuplicateValues(values: readonly (number | string)[]) {
  return new Set(values).size !== values.length;
}

function chunkValues<T>(values: readonly T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

function amountsClose(left: number, right: number) {
  return Math.abs(left - right) <= CENT_TOLERANCE;
}

function saleTotalsAreConsistent(input: {
  discountTotal: number;
  lines: readonly ParsedSalesLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
}) {
  const lineSubtotal = Number(
    input.lines.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2),
  );
  const calculatedTotal = Number(
    (input.subtotal - input.discountTotal + input.taxTotal).toFixed(2),
  );

  return (
    amountsClose(lineSubtotal, input.subtotal) &&
    amountsClose(calculatedTotal, input.total)
  );
}

function isFutureTimestamp(value: string | null) {
  if (!value) {
    return false;
  }

  return Date.parse(value) > Date.now();
}

function isAfterTimestamp(candidate: string | null, reference: string | null) {
  if (!candidate || !reference) {
    return false;
  }

  return Date.parse(candidate) > Date.parse(reference);
}

function isStaffUsable(staff: StaffAccountRow | null) {
  if (!staff) {
    return false;
  }

  return (
    staff.status === "active" &&
    staff.credential_status === "active" &&
    !staff.must_change_credential &&
    !isFutureTimestamp(staff.locked_until)
  );
}

function requestMetadata(meta: PosSalesSyncRequestMeta): JsonRecord {
  return {
    source: "TASK-041",
    task_081_sales_ledger_enabled: true,
    user_agent_length: meta.userAgent?.length ?? 0,
    user_agent_present: Boolean(meta.userAgent),
  };
}

function clpAmount(value: number | null, options: { signed?: boolean } = {}) {
  if (value === null || !Number.isSafeInteger(value) || Math.abs(value) > MAX_CLP_AMOUNT) {
    return null;
  }

  return options.signed ? value : Math.abs(value);
}

function integerField(record: Record<string, unknown>, ...keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isSafeInteger(value)) {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim();

      if (!INTEGER_TEXT_PATTERN.test(normalized)) {
        continue;
      }

      const parsed = Number(normalized);

      if (Number.isSafeInteger(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function enumValue<T extends string>(
  value: string,
  allowed: readonly T[],
  fallback: T,
) {
  const normalized = normalizeCode(value).toLowerCase().replace(/-/g, "_");

  return allowed.includes(normalized as T) ? (normalized as T) : fallback;
}

function enumValueOrNull<T extends string>(
  value: string,
  allowed: readonly T[],
) {
  const normalized = normalizeCode(value).toLowerCase().replace(/-/g, "_");

  return allowed.includes(normalized as T) ? (normalized as T) : null;
}

function parseSchemaVersion(input: Record<string, unknown>): PosSalesSchemaVersion | null {
  const value = stringField(input, "schemaVersion", "schema_version").trim();

  if (!value || value === "pos-sales-v1") {
    return "pos-sales-v1";
  }

  return value === "pos-sales-ledger-v2" ? "pos-sales-ledger-v2" : null;
}

function parseBusinessKind(
  record: Record<string, unknown>,
  strict: boolean,
): PosSaleBusinessKind | null {
  const value = stringField(record, "kind", "businessKind", "business_kind");
  const allowed = ["sale", "refund", "void"] as const;

  return strict ? enumValueOrNull(value, allowed) : enumValue(value, allowed, "sale");
}

function parseLineType(
  record: Record<string, unknown>,
  strict: boolean,
): PosLedgerLineType | null {
  const value = stringField(record, "lineType", "line_type");
  const allowed = ["adjustment", "discount", "item", "tax"] as const;

  return strict ? enumValueOrNull(value, allowed) : enumValue(value, allowed, "item");
}

function parsePaymentMethod(
  record: Record<string, unknown>,
  strict: boolean,
): PosPaymentMethod | null {
  const value = stringField(record, "method", "paymentMethod", "payment_method");
  const allowed = ["card", "cash", "other", "transfer"] as const;

  return strict ? enumValueOrNull(value, allowed) : enumValue(value, allowed, "other");
}

function parseFiscalStatus(
  record: Record<string, unknown>,
  strict: boolean,
): PosFiscalStatus | null {
  const value = stringField(record, "status", "fiscalStatus", "fiscal_status");
  const allowed = [
    "accepted_authority",
    "issued_external",
    "not_printed_card_policy",
    "not_reported",
    "not_required",
    "printed_local_pdf",
    "voided",
  ] as const;

  return strict ? enumValueOrNull(value, allowed) : enumValue(value, allowed, "not_reported");
}

function redactFiscalDocumentNumber(value: string) {
  const normalized = safeText(value, 80);

  if (!normalized) {
    return null;
  }

  return normalized.length <= 4 ? normalized : `***${normalized.slice(-4)}`;
}

function parsePayment(input: unknown, index: number, strict: boolean): ParsedPayment | null {
  if (!isRecord(input)) {
    return null;
  }

  const clientPaymentId =
    safeText(stringField(input, "clientPaymentId", "client_payment_id"), 160) ||
    `payment-${index + 1}`;
  const amountClp = clpAmount(
    integerField(input, "amountClp", "amount_clp", "amount"),
    { signed: true },
  );
  const changeClp = clpAmount(
    integerField(input, "changeClp", "change_clp", "change"),
  );

  const method = parsePaymentMethod(input, strict);

  if (amountClp === null || changeClp === null || !method) {
    return null;
  }

  return {
    amountClp,
    changeClp,
    clientPaymentId,
    method,
  };
}

function parseDerivedPayments(input: Record<string, unknown>, signedNetClp: number) {
  const paymentSummary = {
    ...childRecord(input, "paymentSummary"),
    ...childRecord(input, "paymentsSummary"),
  };
  const cashClp = clpAmount(
    integerField(paymentSummary, "cashClp", "cash_clp", "paidCash", "paid_cash"),
    { signed: true },
  );
  const cardClp = clpAmount(
    integerField(paymentSummary, "cardClp", "card_clp", "paidCard", "paid_card"),
    { signed: true },
  );
  const transferClp = clpAmount(
    integerField(paymentSummary, "transferClp", "transfer_clp"),
    { signed: true },
  );
  const otherClp = clpAmount(
    integerField(paymentSummary, "otherClp", "other_clp"),
    { signed: true },
  );
  const changeClp =
    clpAmount(integerField(paymentSummary, "changeClp", "change_clp", "change")) ?? 0;
  const rows: ParsedPayment[] = [];

  for (const [method, amountClp] of [
    ["cash", cashClp],
    ["card", cardClp],
    ["transfer", transferClp],
    ["other", otherClp],
  ] as const) {
    if (amountClp !== null && amountClp !== 0) {
      rows.push({
        amountClp,
        changeClp: method === "cash" ? changeClp : 0,
        clientPaymentId: `derived-${method}`,
        method,
      });
    }
  }

  if (rows.length === 0 && signedNetClp !== 0) {
    rows.push({
      amountClp: signedNetClp,
      changeClp: 0,
      clientPaymentId: "derived-other",
      method: "other",
    });
  }

  return rows;
}

function paymentTotalsAreConsistent(input: {
  changeAmountClp: number;
  netAmountClp: number;
  paidAmountClp: number | null;
  payments: readonly ParsedPayment[];
}) {
  const tendered = input.payments.reduce((sum, payment) => sum + payment.amountClp, 0);
  const change = input.payments.reduce((sum, payment) => sum + payment.changeClp, 0);
  const expectedPaid = input.paidAmountClp ?? tendered;

  return (
    tendered === expectedPaid &&
    tendered - change === input.netAmountClp
  );
}

function parseLine(
  input: unknown,
  index: number,
  schemaVersion: PosSalesSchemaVersion,
  businessKind: PosSaleBusinessKind,
): ParsedSalesLine | null {
  if (!isRecord(input)) {
    return null;
  }

  const clientLineId =
    safeText(stringField(input, "clientLineId", "client_line_id"), 160) ||
    `line-${index + 1}`;
  const linePosition = Math.trunc(numberField(input, "linePosition", "line_position") ?? index + 1);
  const quantity = positiveQuantity(numberField(input, "quantity", "qty"));
  const lineType = parseLineType(input, schemaVersion === "pos-sales-ledger-v2");
  const amountClp =
    schemaVersion === "pos-sales-ledger-v2"
      ? clpAmount(
          integerField(input, "amountClp", "amount_clp", "lineTotalClp", "line_total_clp"),
          { signed: true },
        )
      : null;
  const unitAmountClp =
    schemaVersion === "pos-sales-ledger-v2"
      ? clpAmount(integerField(input, "unitAmountClp", "unit_amount_clp", "unitPriceClp"))
      : null;
  const unitPrice = positiveAmount(
    numberField(input, "unitPrice", "unit_price") ??
      (unitAmountClp === null ? null : Math.abs(unitAmountClp)),
  );
  const lineTotal = positiveAmount(
    numberField(input, "lineTotal", "line_total", "total") ??
      (amountClp === null ? null : Math.abs(amountClp)),
  );
  const productId = stringField(input, "productId", "product_id").trim();
  const localProductId =
    safeText(stringField(input, "localProductId", "local_product_id"), 120) || null;
  const stockQuantityDelta =
    schemaVersion === "pos-sales-ledger-v2"
      ? numberField(input, "stockQuantityDelta", "stock_quantity_delta")
      : null;
  const defaultStockDelta =
    lineType !== "item"
      ? 0
      : businessKind === "sale"
        ? -(quantity ?? 0)
        : quantity ?? 0;
  const normalizedStockDelta =
    stockQuantityDelta === null
      ? defaultStockDelta
      : Number(stockQuantityDelta.toFixed(3));

  if (
    !lineType ||
    linePosition < 1 ||
    linePosition > MAX_SYNC_LINES ||
    quantity === null ||
    unitPrice === null ||
    lineTotal === null ||
    (schemaVersion === "pos-sales-v1" &&
      !amountsClose(Number((quantity * unitPrice).toFixed(2)), lineTotal)) ||
    (schemaVersion === "pos-sales-ledger-v2" && amountClp === null) ||
    Math.abs(normalizedStockDelta) > 999999 ||
    (productId && !UUID_PATTERN.test(productId))
  ) {
    return null;
  }

  return {
    amountClp,
    barcode: safeText(stringField(input, "barcode"), 80) || null,
    clientLineId,
    itemNumber: safeText(stringField(input, "itemNumber", "item_number"), 80) || null,
    lineType,
    linePosition,
    lineTotal,
    localProductId,
    productId: productId || null,
    productName: normalizeText(stringField(input, "productName", "product_name"), 160) || null,
    quantity,
    stockQuantityDelta: normalizedStockDelta,
    unitAmountClp,
    unitPrice,
  };
}

function parseSale(
  input: unknown,
  schemaVersion: PosSalesSchemaVersion,
): ParsedSale | null {
  if (!isRecord(input)) {
    return null;
  }

  const clientSaleId = safeText(stringField(input, "clientSaleId", "client_sale_id"), 160);
  const idempotencyKey =
    safeText(stringField(input, "idempotencyKey", "idempotency_key"), 200) ||
    clientSaleId;
  const occurredAt = parseIsoTimestamp(stringField(input, "occurredAt", "occurred_at"));
  const currency = normalizeCode(stringField(input, "currency") || "CLP");
  const strict = schemaVersion === "pos-sales-ledger-v2";
  const businessKind = parseBusinessKind(input, strict);

  if (!businessKind) {
    return null;
  }

  const amounts = childRecord(input, "amounts");
  const grossAmountClp =
    schemaVersion === "pos-sales-ledger-v2"
      ? clpAmount(
          integerField(amounts, "grossClp", "gross_clp", "subtotalClp", "subtotal_clp"),
        )
      : null;
  const discountAmountClp =
    schemaVersion === "pos-sales-ledger-v2"
      ? clpAmount(integerField(amounts, "discountClp", "discount_clp"))
      : null;
  const taxAmountClp =
    schemaVersion === "pos-sales-ledger-v2"
      ? clpAmount(integerField(amounts, "taxClp", "tax_clp")) ?? 0
      : null;
  const netAmountFromPayload =
    schemaVersion === "pos-sales-ledger-v2"
      ? clpAmount(integerField(amounts, "netClp", "net_clp", "totalClp", "total_clp"), {
          signed: true,
        })
      : null;
  const paidAmountClp =
    schemaVersion === "pos-sales-ledger-v2"
      ? clpAmount(integerField(amounts, "paidClp", "paid_clp"), { signed: true })
      : null;
  const changeAmountClp =
    schemaVersion === "pos-sales-ledger-v2"
      ? clpAmount(integerField(amounts, "changeClp", "change_clp")) ?? 0
      : 0;
  const subtotal = positiveAmount(
    numberField(input, "subtotal", "sub_total") ??
      (grossAmountClp === null ? null : Math.abs(grossAmountClp)),
  );
  const discountTotal = positiveAmount(
    numberField(input, "discountTotal", "discount_total", "discount") ??
      (discountAmountClp === null ? null : Math.abs(discountAmountClp)),
  );
  const taxTotal = positiveAmount(
    numberField(input, "taxTotal", "tax_total", "tax") ??
      (taxAmountClp === null ? null : Math.abs(taxAmountClp)),
  );
  const derivedNetAmountClp =
    schemaVersion === "pos-sales-ledger-v2" &&
    grossAmountClp !== null &&
    discountAmountClp !== null &&
    taxAmountClp !== null
      ? (businessKind === "sale" ? 1 : -1) *
        (grossAmountClp - discountAmountClp + taxAmountClp)
      : null;
  const netAmountClp = netAmountFromPayload ?? derivedNetAmountClp;
  const total = positiveAmount(
    numberField(input, "total", "saleTotal", "sale_total") ??
      (netAmountClp === null ? null : Math.abs(netAmountClp)),
  );
  const rawLines = Array.isArray(input.lines) ? input.lines : [];
  const lines = rawLines
    .map((line, index) => parseLine(line, index, schemaVersion, businessKind))
    .filter((line): line is ParsedSalesLine => Boolean(line));
  const rawPayments = Array.isArray(input.payments) ? input.payments : [];
  const parsedPayments = rawPayments
    .map((payment, index) => parsePayment(payment, index, strict))
    .filter((payment): payment is ParsedPayment => Boolean(payment));
  const payments =
    parsedPayments.length > 0 || netAmountClp === null
      ? parsedPayments
      : parseDerivedPayments(input, netAmountClp);
  const lineAmountTotalClp =
    schemaVersion === "pos-sales-ledger-v2"
      ? lines.reduce((sum, line) => sum + (line.amountClp ?? 0), 0)
      : null;
  const hasDiscountLine = lines.some((line) => line.lineType === "discount");
  const hasTaxLine = lines.some((line) => line.lineType === "tax");
  const lineNetAmountClp =
    schemaVersion === "pos-sales-ledger-v2" &&
    lineAmountTotalClp !== null &&
    discountAmountClp !== null &&
    taxAmountClp !== null
      ? lineAmountTotalClp -
        (hasDiscountLine ? 0 : discountAmountClp) +
        (hasTaxLine ? 0 : taxAmountClp)
      : null;
  const fiscal = childRecord(input, "fiscal");
  const fiscalPrintedAtRaw = stringField(fiscal, "printedAt", "printed_at");
  const fiscalPrintedAt = fiscalPrintedAtRaw ? parseIsoTimestamp(fiscalPrintedAtRaw) : null;
  const businessDateRaw = stringField(input, "businessDate", "business_date");
  const businessDate = businessDateRaw ? parseBusinessDate(businessDateRaw) : null;
  const clientOriginalSaleId =
    safeText(
      stringField(
        input,
        "clientOriginalSaleId",
        "client_original_sale_id",
        "originalClientSaleId",
        "original_client_sale_id",
      ),
      160,
    ) || null;
  const reversalReasonRedacted =
    normalizeText(stringField(input, "reversalReason", "reversal_reason"), 240) || null;
  const fiscalStatus =
    businessKind === "void" ? "voided" : parseFiscalStatus(fiscal, strict);
  const saleNumber = safeText(stringField(input, "saleNumber", "sale_number", "saleCode"), 80) || null;

  if (
    !fiscalStatus ||
    !clientSaleId ||
    !idempotencyKey ||
    !occurredAt ||
    (schemaVersion === "pos-sales-ledger-v2"
      ? currency !== "CLP"
      : !/^[A-Z]{3}$/.test(currency)) ||
    subtotal === null ||
    discountTotal === null ||
    taxTotal === null ||
    total === null ||
    (schemaVersion === "pos-sales-ledger-v2" && netAmountClp === null) ||
    (schemaVersion === "pos-sales-ledger-v2" &&
      (grossAmountClp === null || discountAmountClp === null || taxAmountClp === null)) ||
    (schemaVersion === "pos-sales-ledger-v2" && !businessDate) ||
    (schemaVersion === "pos-sales-ledger-v2" &&
      derivedNetAmountClp !== null &&
      netAmountClp !== derivedNetAmountClp) ||
    (schemaVersion === "pos-sales-ledger-v2" &&
      lineNetAmountClp !== null &&
      netAmountClp !== lineNetAmountClp) ||
    (schemaVersion === "pos-sales-ledger-v2" &&
      !paymentTotalsAreConsistent({
        changeAmountClp,
        netAmountClp: netAmountClp ?? 0,
        paidAmountClp,
        payments,
      })) ||
    (businessDateRaw.length > 0 && !businessDate) ||
    rawLines.length === 0 ||
    lines.length !== rawLines.length ||
    rawPayments.length !== parsedPayments.length ||
    hasDuplicateValues(lines.map((line) => line.clientLineId)) ||
    hasDuplicateValues(lines.map((line) => line.linePosition)) ||
    hasDuplicateValues(payments.map((payment) => payment.clientPaymentId)) ||
    (schemaVersion === "pos-sales-v1" &&
      !saleTotalsAreConsistent({
        discountTotal,
        lines,
        subtotal,
        taxTotal,
        total,
      })) ||
    (fiscalPrintedAtRaw.length > 0 && !fiscalPrintedAt)
  ) {
    return null;
  }

  const saleForHash = {
    businessDate,
    businessKind,
    changeAmountClp,
    clientSaleId,
    clientOriginalSaleId,
    currency,
    discountAmountClp,
    discountTotal,
    fiscalDocumentNumberRedacted: redactFiscalDocumentNumber(
      stringField(fiscal, "documentNumber", "document_number", "number"),
    ),
    fiscalDocumentType:
      safeText(stringField(fiscal, "documentType", "document_type", "type"), 40) || null,
    fiscalPrintedAt,
    fiscalStatus,
    grossAmountClp,
    idempotencyKey,
    lines,
    netAmountClp,
    occurredAt,
    paidAmountClp,
    payments,
    reversalReasonRedacted,
    saleNumber,
    sourceSchemaVersion: schemaVersion,
    subtotal,
    taxAmountClp,
    taxTotal,
    total,
  };

  return {
    ...saleForHash,
    payloadHash: stableHash(saleForHash),
  };
}

function parseSalesSyncInput(
  input: unknown,
  meta: PosSalesSyncRequestMeta,
): ParsedSalesSyncInput | null {
  if (!isRecord(input)) {
    return null;
  }

  const schemaVersion = parseSchemaVersion(input);

  if (!schemaVersion) {
    return null;
  }

  const batch = childRecord(input, "batch");
  const salesInput = Array.isArray(input.sales) ? input.sales : [];
  const sales = salesInput
    .map((sale) => parseSale(sale, schemaVersion))
    .filter((sale): sale is ParsedSale => Boolean(sale));
  const lineCount = sales.reduce((sum, sale) => sum + sale.lines.length, 0);
  const clientBatchId = safeText(
    stringField(batch, "clientBatchId", "client_batch_id") ||
      stringField(input, "clientBatchId", "client_batch_id"),
    160,
  );
  const idempotencyKey =
    safeText(
      stringField(batch, "idempotencyKey", "idempotency_key") ||
        stringField(input, "idempotencyKey", "idempotency_key") ||
        (meta.idempotencyKeyHeader ?? ""),
      200,
    ) || clientBatchId;
  const deviceToken = stringField(input, "deviceToken", "device_token");
  const posSessionId = stringField(input, "posSessionId", "pos_session_id");
  const sessionToken = stringField(input, "sessionToken", "session_token");
  const shopDeviceId = stringField(input, "shopDeviceId", "shop_device_id");
  const shopCode = normalizeCode(stringField(input, "shopCode", "shop_code"));
  const appVersion = normalizeText(stringField(input, "appVersion", "app_version"), 80) || undefined;

  if (
    !clientBatchId ||
    !idempotencyKey ||
    !UUID_PATTERN.test(posSessionId) ||
    !UUID_PATTERN.test(shopDeviceId) ||
    deviceToken.length === 0 ||
    deviceToken.length > MAX_POS_SECRET_LENGTH ||
    sessionToken.length === 0 ||
    sessionToken.length > MAX_POS_SECRET_LENGTH ||
    salesInput.length === 0 ||
    salesInput.length > MAX_SYNC_SALES ||
    sales.length !== salesInput.length ||
    lineCount === 0 ||
    lineCount > MAX_SYNC_LINES ||
    hasDuplicateValues(sales.map((sale) => sale.clientSaleId)) ||
    hasDuplicateValues(sales.map((sale) => sale.idempotencyKey))
  ) {
    return null;
  }

  return {
    appVersion,
    batchPayloadHash: stableHash({
      clientBatchId,
      idempotencyKey,
      sales: sales.map((sale) => ({
        clientSaleId: sale.clientSaleId,
        idempotencyKey: sale.idempotencyKey,
        payloadHash: sale.payloadHash,
      })),
    }),
    clientBatchId,
    deviceToken,
    idempotencyKey,
    posSessionId,
    sales,
    schemaVersion,
    sessionToken,
    shopCode: shopCode || undefined,
    shopDeviceId,
  };
}

async function getSupabaseForPosSales() {
  const config = resolveSupabaseAdminConfig();

  if (config.status !== "configured") {
    return null;
  }

  return createSupabaseAdminClient(config);
}

async function writePosSalesAudit(
  supabase: SupabaseAdminClient,
  input: {
    code: string;
    metadata?: JsonRecord;
    result: "blocked" | "failure" | "success";
    severity: "critical" | "info" | "warning";
    shopId?: string;
    staffId?: string;
    targetId?: string;
    targetType?: string;
  },
) {
  const { error } = await supabase.from("audit_logs").insert({
    actor_profile_id: null,
    actor_staff_id: input.staffId ?? null,
    event_key:
      input.result === "success"
        ? "pos.sales.sync.success"
        : "pos.sales.sync.failure",
    metadata_redacted: {
      code: input.code,
      ...(input.metadata ?? {}),
    },
    result: input.result,
    scope: input.shopId ? "shop" : "global",
    severity: input.severity,
    shop_id: input.shopId ?? null,
    target_id: input.targetId,
    target_type: input.targetType,
  });

  return !error;
}

async function auditedFailure(
  supabase: SupabaseAdminClient,
  input: {
    code: PosSalesSyncFailureCode;
    metadata?: JsonRecord;
    shopId?: string;
    staffId?: string;
    status: 400 | 401 | 409 | 500;
    targetId?: string;
    targetType?: string;
  },
): Promise<PosSalesSyncEndpointResult> {
  const auditOk = await writePosSalesAudit(supabase, {
    code: input.code,
    metadata: input.metadata,
    result: input.status === 500 ? "failure" : "blocked",
    severity: input.status === 500 ? "critical" : "warning",
    shopId: input.shopId,
    staffId: input.staffId,
    targetId: input.targetId,
    targetType: input.targetType,
  });

  if (!auditOk) {
    return failure("db_failure", 500);
  }

  return failure(input.code, input.status);
}

type PosSalesSyncAuthContext = {
  session: PosSessionRow;
  shop: ShopRow;
  staff: StaffAccountRow;
};

type PosSalesSyncAuthResult =
  | {
      context: PosSalesSyncAuthContext;
      result?: never;
    }
  | {
      context?: never;
      result: PosSalesSyncEndpointResult;
    };

async function validatePosSession(
  supabase: SupabaseAdminClient,
  parsed: ParsedSalesSyncInput,
  meta: PosSalesSyncRequestMeta,
): Promise<PosSalesSyncAuthResult> {
  const sessionResult = await supabase
    .from("pos_sessions")
    .select(
      "pos_session_id,shop_id,shop_device_id,staff_id,pos_device_credential_id,session_token_hash,staff_credential_version,status,issued_at,expires_at",
    )
    .eq("pos_session_id", parsed.posSessionId)
    .eq("shop_device_id", parsed.shopDeviceId)
    .maybeSingle<PosSessionRow>();

  if (sessionResult.error) {
    return {
      result: await auditedFailure(supabase, {
        code: "db_failure",
        metadata: requestMetadata(meta),
        status: 500,
      }),
    };
  }

  const session = sessionResult.data;
  const sessionValid = Boolean(
    session &&
      session.status === "active" &&
      isFutureTimestamp(session.expires_at) &&
      verifyPosSecret(parsed.sessionToken, session.session_token_hash),
  );

  if (!session || !sessionValid) {
    return {
      result: await auditedFailure(supabase, {
        code: "denied",
        metadata: requestMetadata(meta),
        shopId: session?.shop_id,
        status: 401,
        targetId: session?.pos_session_id,
        targetType: session ? "pos_session" : undefined,
      }),
    };
  }

  const [credentialResult, shopResult, staffResult, deviceResult] =
    await Promise.all([
      supabase
        .from("pos_device_credentials")
        .select(
          "pos_device_credential_id,shop_id,shop_device_id,staff_id,token_hash,staff_credential_version,status,expires_at",
        )
        .eq("pos_device_credential_id", session.pos_device_credential_id)
        .maybeSingle<PosDeviceCredentialRow>(),
      supabase
        .from("shops")
        .select("shop_id,shop_code,shop_status")
        .eq("shop_id", session.shop_id)
        .maybeSingle<ShopRow>(),
      supabase
        .from("staff_accounts")
        .select(
          "staff_id,shop_id,status,credential_version,credential_status,locked_until,must_change_credential,session_invalidated_at",
        )
        .eq("staff_id", session.staff_id)
        .eq("shop_id", session.shop_id)
        .maybeSingle<StaffAccountRow>(),
      supabase
        .from("shop_devices")
        .select("shop_device_id,shop_id,status")
        .eq("shop_device_id", session.shop_device_id)
        .eq("shop_id", session.shop_id)
        .maybeSingle<ShopDeviceRow>(),
    ]);

  if (
    credentialResult.error ||
    shopResult.error ||
    staffResult.error ||
    deviceResult.error
  ) {
    return {
      result: await auditedFailure(supabase, {
        code: "db_failure",
        metadata: requestMetadata(meta),
        shopId: session.shop_id,
        staffId: session.staff_id,
        status: 500,
        targetId: session.pos_session_id,
        targetType: "pos_session",
      }),
    };
  }

  const credential = credentialResult.data;
  const shop = shopResult.data;
  const staff = staffResult.data;
  const device = deviceResult.data;
  const credentialMatchesSession = Boolean(
    credential &&
      credential.pos_device_credential_id === session.pos_device_credential_id &&
      credential.shop_id === session.shop_id &&
      credential.shop_device_id === session.shop_device_id &&
      credential.staff_id === session.staff_id,
  );
  const credentialValid = Boolean(
    credential &&
      credential.status === "active" &&
      isFutureTimestamp(credential.expires_at) &&
      verifyPosSecret(parsed.deviceToken, credential.token_hash),
  );
  const runtimeValid = Boolean(
    credentialMatchesSession &&
      credentialValid &&
      shop?.shop_status === "active" &&
      (!parsed.shopCode || parsed.shopCode === shop.shop_code) &&
      isStaffUsable(staff) &&
      device?.status === "active" &&
      staff &&
      staff.credential_version === credential?.staff_credential_version &&
      session.staff_credential_version === staff.credential_version &&
      !isAfterTimestamp(staff.session_invalidated_at, session.issued_at),
  );

  if (!runtimeValid || !shop || !staff) {
    return {
      result: await auditedFailure(supabase, {
        code: "denied",
        metadata: {
          ...requestMetadata(meta),
          app_version_present: Boolean(parsed.appVersion),
          device_resolved: Boolean(device),
          shop_resolved: Boolean(shop),
          staff_resolved: Boolean(staff),
        },
        shopId: session.shop_id,
        staffId: session.staff_id,
        status: 401,
        targetId: session.pos_session_id,
        targetType: "pos_session",
      }),
    };
  }

  return {
    context: {
      session,
      shop,
      staff,
    },
  };
}

async function findExistingBatch(
  supabase: SupabaseAdminClient,
  parsed: ParsedSalesSyncInput,
  shopId: string,
) {
  const byIdempotency = await supabase
    .from("pos_sales_sync_batches")
    .select("pos_sales_sync_batch_id,client_batch_id,idempotency_key,payload_hash,status")
    .eq("shop_id", shopId)
    .eq("shop_device_id", parsed.shopDeviceId)
    .eq("idempotency_key", parsed.idempotencyKey)
    .maybeSingle<ExistingBatchRow>();

  if (byIdempotency.error || byIdempotency.data) {
    return byIdempotency;
  }

  return supabase
    .from("pos_sales_sync_batches")
    .select("pos_sales_sync_batch_id,client_batch_id,idempotency_key,payload_hash,status")
    .eq("shop_id", shopId)
    .eq("shop_device_id", parsed.shopDeviceId)
    .eq("client_batch_id", parsed.clientBatchId)
    .maybeSingle<ExistingBatchRow>();
}

async function findExistingSales(
  supabase: SupabaseAdminClient,
  parsed: ParsedSalesSyncInput,
  shopId: string,
) {
  const clientSaleIds = parsed.sales.map((sale) => sale.clientSaleId);
  const idempotencyKeys = parsed.sales.map((sale) => sale.idempotencyKey);
  const [byClientSale, byIdempotency] = await Promise.all([
    supabase
      .from("pos_sales")
      .select("pos_sale_id,client_sale_id,idempotency_key,payload_hash,status")
      .eq("shop_id", shopId)
      .eq("shop_device_id", parsed.shopDeviceId)
      .in("client_sale_id", clientSaleIds)
      .returns<ExistingSaleRow[]>(),
    supabase
      .from("pos_sales")
      .select("pos_sale_id,client_sale_id,idempotency_key,payload_hash,status")
      .eq("shop_id", shopId)
      .eq("shop_device_id", parsed.shopDeviceId)
      .in("idempotency_key", idempotencyKeys)
      .returns<ExistingSaleRow[]>(),
  ]);

  if (byClientSale.error) {
    return { error: byClientSale.error, rows: [] };
  }

  if (byIdempotency.error) {
    return { error: byIdempotency.error, rows: [] };
  }

  const rowsById = new Map<string, ExistingSaleRow>();

  for (const row of [...(byClientSale.data ?? []), ...(byIdempotency.data ?? [])]) {
    rowsById.set(row.pos_sale_id, row);
  }

  return { error: null, rows: [...rowsById.values()] };
}

function productIdsForSales(sales: readonly ParsedSale[]) {
  const productIds = new Set<string>();

  for (const sale of sales) {
    for (const line of sale.lines) {
      if (line.productId) {
        productIds.add(line.productId);
      }
    }
  }

  return [...productIds];
}

async function validateSalesLineProductScope(
  supabase: SupabaseAdminClient,
  sales: readonly ParsedSale[],
  shopId: string,
): Promise<ProductScopeResolution> {
  const productIds = productIdsForSales(sales);

  if (productIds.length === 0) {
    return {
      invalidProductCount: 0,
      ok: true,
      productIdCount: 0,
      scopedProductIds: new Set<string>(),
    };
  }

  const mappingResult = await supabase
    .from("shop_inventory_sources")
    .select("shop_id,owner_user_id,mapping_state")
    .eq("shop_id", shopId)
    .is("disabled_at", null)
    .limit(10);

  if (mappingResult.error) {
    return {
      code: "db_failure" as const,
      invalidProductCount: 0,
      ok: false as const,
      productIdCount: productIds.length,
      reason: "inventory_mapping_lookup_failed",
      scopedProductIds: new Set<string>(),
    };
  }

  const mappingRows = (mappingResult.data ?? []) as InventorySourceRow[];
  const ownerUserId =
    mappingRows.find((row) => row.mapping_state === "mapped" && row.owner_user_id)
      ?.owner_user_id ?? null;
  const scopedProductIds = new Set<string>();

  for (const productChunk of chunkValues(productIds, 100)) {
    const productsResult = await supabase
      .from("inventory_products")
      .select("id,owner_user_id,shop_id")
      .in("id", productChunk)
      .is("deleted_at", null)
      .returns<InventoryProductScopeRow[]>();

    if (productsResult.error) {
      return {
        code: "db_failure" as const,
        invalidProductCount: 0,
        ok: false as const,
        productIdCount: productIds.length,
        reason: "inventory_product_scope_lookup_failed",
        scopedProductIds: new Set<string>(),
      };
    }

    for (const row of productsResult.data ?? []) {
      const shopScoped = row.shop_id === shopId;
      const mappedLegacyScoped =
        row.shop_id === null && Boolean(ownerUserId) && row.owner_user_id === ownerUserId;

      if (shopScoped || mappedLegacyScoped) {
        scopedProductIds.add(row.id);
      }
    }
  }

  const invalidProductCount = productIds.filter(
    (productId) => !scopedProductIds.has(productId),
  ).length;

  return {
    invalidProductCount,
    ok: true,
    productIdCount: productIds.length,
    scopedProductIds,
  };
}

async function cleanupPosSalesBatch(
  supabase: SupabaseAdminClient,
  batchId: string,
) {
  const { error } = await supabase
    .from("pos_sales_sync_batches")
    .delete()
    .eq("pos_sales_sync_batch_id", batchId);

  return !error;
}

type InsertedLineRow = {
  client_line_id: string;
  pos_sale_id: string;
  pos_sale_line_id: string;
  product_id: string | null;
  stock_quantity_delta: number;
};

type PosRevenueLedgerEntryInsert = {
  amount_clp: number;
  barcode: string | null;
  business_date: string | null;
  client_entry_id: string;
  currency: "CLP";
  entry_type:
    | "change"
    | "discount"
    | "item"
    | "payment"
    | "refund_item"
    | "refund_payment"
    | "tax"
    | "void_marker";
  item_number: string | null;
  line_position: number | null;
  local_product_id: string | null;
  metadata_redacted: JsonRecord;
  occurred_at: string;
  original_client_entry_id: string | null;
  payment_method: PosPaymentMethod | null;
  pos_sale_id: string;
  pos_sales_sync_batch_id: string;
  pos_session_id: string;
  product_id: string | null;
  product_name: string | null;
  quantity: number | null;
  shop_device_id: string;
  shop_id: string;
  staff_id: string;
};

type ProductScopeResolution =
  | {
      code?: never;
      invalidProductCount: number;
      ok: true;
      productIdCount: number;
      reason?: never;
      scopedProductIds: Set<string>;
    }
  | {
      code: "db_failure";
      invalidProductCount: number;
      ok: false;
      productIdCount: number;
      reason: string;
      scopedProductIds: Set<string>;
    };

type StockMovementRpcRow = {
  issue_code: string | null;
  status:
    | "applied"
    | "failed"
    | "not_applicable"
    | "stock_conflict"
    | "unresolved_product";
  stock_after: number | null;
  stock_before: number | null;
};

type DbMutationError = {
  code?: string;
  message?: string;
};

type UntypedSupabaseMutationTable = {
  insert(rows: readonly Record<string, unknown>[] | Record<string, unknown>): Promise<{
    error: DbMutationError | null;
  }>;
  select<Row>(columns: string): {
    in(column: string, values: readonly string[]): Promise<{
      data: Row[] | null;
      error: DbMutationError | null;
    }>;
  };
  update(values: Record<string, unknown>): {
    eq(column: string, value: string): Promise<{
      error: DbMutationError | null;
    }>;
  };
};

type UntypedSupabaseRpcClient = {
  from(table: string): UntypedSupabaseMutationTable;
  rpc(
    fn: "pos_apply_sale_stock_movement",
    args: Record<string, unknown>,
  ): Promise<{
    data: StockMovementRpcRow[] | null;
    error: DbMutationError | null;
  }>;
};

function untypedSupabase(client: SupabaseAdminClient) {
  return client as unknown as UntypedSupabaseRpcClient;
}

function signedLineAmountClp(line: ParsedSalesLine, sale: ParsedSale) {
  const amount = line.amountClp ?? Math.round(line.lineTotal);

  if (line.lineType === "discount") {
    return -Math.abs(amount);
  }

  if (line.lineType === "tax") {
    return sale.businessKind === "sale" ? Math.abs(amount) : -Math.abs(amount);
  }

  return sale.businessKind === "sale" ? Math.abs(amount) : -Math.abs(amount);
}

function ledgerEntryType(line: ParsedSalesLine, sale: ParsedSale) {
  if (line.lineType === "discount") {
    return "discount" as const;
  }

  if (line.lineType === "tax") {
    return "tax" as const;
  }

  return sale.businessKind === "sale" ? ("item" as const) : ("refund_item" as const);
}

function buildLedgerRows(input: {
  batchId: string;
  insertedSaleByClientId: Map<string, string>;
  sale: ParsedSale;
  scopedProductIds: Set<string>;
  session: PosSessionRow;
  shopId: string;
  staffId: string;
}) {
  const saleId = input.insertedSaleByClientId.get(input.sale.clientSaleId);

  if (!saleId) {
    return [];
  }

  const rows: PosRevenueLedgerEntryInsert[] = input.sale.lines.map((line) => ({
    amount_clp: signedLineAmountClp(line, input.sale),
    barcode: line.barcode,
    business_date: input.sale.businessDate,
    client_entry_id: `line:${line.clientLineId}`,
    currency: "CLP",
    entry_type: ledgerEntryType(line, input.sale),
    item_number: line.itemNumber,
    line_position: line.linePosition,
    local_product_id: line.localProductId,
    metadata_redacted: {
      line_type: line.lineType,
      source: "TASK-081",
    },
    occurred_at: input.sale.occurredAt,
    original_client_entry_id: null,
    payment_method: null,
    pos_sale_id: saleId,
    pos_sales_sync_batch_id: input.batchId,
    pos_session_id: input.session.pos_session_id,
    product_id: scopedProductId(line.productId, input.scopedProductIds),
    product_name: line.productName,
    quantity: line.quantity,
    shop_device_id: input.session.shop_device_id,
    shop_id: input.shopId,
    staff_id: input.staffId,
  }));
  const hasDiscountLine = input.sale.lines.some((line) => line.lineType === "discount");
  const hasTaxLine = input.sale.lines.some((line) => line.lineType === "tax");

  if (!hasDiscountLine && input.sale.discountAmountClp && input.sale.discountAmountClp > 0) {
    rows.push({
      amount_clp: -Math.abs(input.sale.discountAmountClp),
      barcode: null,
      business_date: input.sale.businessDate,
      client_entry_id: "summary:discount",
      currency: "CLP",
      entry_type: "discount",
      item_number: null,
      line_position: null,
      local_product_id: null,
      metadata_redacted: {
        source: "TASK-081",
      },
      occurred_at: input.sale.occurredAt,
      original_client_entry_id: null,
      payment_method: null,
      pos_sale_id: saleId,
      pos_sales_sync_batch_id: input.batchId,
      pos_session_id: input.session.pos_session_id,
      product_id: null,
      product_name: null,
      quantity: null,
      shop_device_id: input.session.shop_device_id,
      shop_id: input.shopId,
      staff_id: input.staffId,
    });
  }

  if (!hasTaxLine && input.sale.taxAmountClp && input.sale.taxAmountClp > 0) {
    rows.push({
      amount_clp:
        input.sale.businessKind === "sale"
          ? input.sale.taxAmountClp
          : -Math.abs(input.sale.taxAmountClp),
      barcode: null,
      business_date: input.sale.businessDate,
      client_entry_id: "summary:tax",
      currency: "CLP",
      entry_type: "tax",
      item_number: null,
      line_position: null,
      local_product_id: null,
      metadata_redacted: {
        source: "TASK-081",
      },
      occurred_at: input.sale.occurredAt,
      original_client_entry_id: null,
      payment_method: null,
      pos_sale_id: saleId,
      pos_sales_sync_batch_id: input.batchId,
      pos_session_id: input.session.pos_session_id,
      product_id: null,
      product_name: null,
      quantity: null,
      shop_device_id: input.session.shop_device_id,
      shop_id: input.shopId,
      staff_id: input.staffId,
    });
  }

  for (const payment of input.sale.payments) {
    rows.push({
      amount_clp: payment.amountClp,
      barcode: null,
      business_date: input.sale.businessDate,
      client_entry_id: `payment:${payment.clientPaymentId}`,
      currency: "CLP",
      entry_type:
        input.sale.businessKind === "sale" ? "payment" : "refund_payment",
      item_number: null,
      line_position: null,
      local_product_id: null,
      metadata_redacted: {
        source: "TASK-081",
      },
      occurred_at: input.sale.occurredAt,
      original_client_entry_id: null,
      payment_method: payment.method,
      pos_sale_id: saleId,
      pos_sales_sync_batch_id: input.batchId,
      pos_session_id: input.session.pos_session_id,
      product_id: null,
      product_name: null,
      quantity: null,
      shop_device_id: input.session.shop_device_id,
      shop_id: input.shopId,
      staff_id: input.staffId,
    });

    if (payment.changeClp > 0) {
      rows.push({
        amount_clp: -Math.abs(payment.changeClp),
        barcode: null,
        business_date: input.sale.businessDate,
        client_entry_id: `change:${payment.clientPaymentId}`,
        currency: "CLP",
        entry_type: "change",
        item_number: null,
        line_position: null,
        local_product_id: null,
        metadata_redacted: {
          source: "TASK-081",
        },
        occurred_at: input.sale.occurredAt,
        original_client_entry_id: null,
        payment_method: payment.method,
        pos_sale_id: saleId,
        pos_sales_sync_batch_id: input.batchId,
        pos_session_id: input.session.pos_session_id,
        product_id: null,
        product_name: null,
        quantity: null,
        shop_device_id: input.session.shop_device_id,
        shop_id: input.shopId,
        staff_id: input.staffId,
      });
    }
  }

  if (input.sale.businessKind === "void") {
    rows.push({
      amount_clp: 0,
      barcode: null,
      business_date: input.sale.businessDate,
      client_entry_id: `void:${input.sale.clientSaleId}`,
      currency: "CLP",
      entry_type: "void_marker",
      item_number: null,
      line_position: null,
      local_product_id: null,
      metadata_redacted: {
        source: "TASK-081",
      },
      occurred_at: input.sale.occurredAt,
      original_client_entry_id: input.sale.clientOriginalSaleId,
      payment_method: null,
      pos_sale_id: saleId,
      pos_sales_sync_batch_id: input.batchId,
      pos_session_id: input.session.pos_session_id,
      product_id: null,
      product_name: null,
      quantity: null,
      shop_device_id: input.session.shop_device_id,
      shop_id: input.shopId,
      staff_id: input.staffId,
    });
  }

  return rows;
}

function scopedProductId(productId: string | null, scopedProductIds: Set<string>) {
  return productId && scopedProductIds.has(productId) ? productId : null;
}

function stockMovementKind(sale: ParsedSale, quantityDelta: number) {
  if (quantityDelta === 0) {
    return "no_stock";
  }

  if (sale.businessKind === "void") {
    return "void_reverse";
  }

  return quantityDelta < 0 ? "sale_decrement" : "refund_increment";
}

async function findExistingSaleLinesForSales(
  supabase: SupabaseAdminClient,
  saleIds: readonly string[],
) {
  const rows: InsertedLineRow[] = [];

  for (const saleIdChunk of chunkValues(saleIds, 100)) {
    const result = await untypedSupabase(supabase)
      .from("pos_sale_lines")
      .select<InsertedLineRow>(
        "pos_sale_line_id,pos_sale_id,client_line_id,product_id,stock_quantity_delta",
      )
      .in("pos_sale_id", saleIdChunk);

    if (result.error) {
      return { error: result.error, rows: [] };
    }

    rows.push(...(result.data ?? []));
  }

  return { error: null, rows };
}

type StockApplicationResult =
  | {
      ok: true;
      stockMovementSaleCount: number;
    }
  | {
      ok: false;
      result: PosSalesSyncEndpointResult;
    };

async function applyStockMovements(input: {
  lineRows: readonly InsertedLineRow[];
  meta: PosSalesSyncRequestMeta;
  productScope: ProductScopeResolution & { ok: true };
  saleIdByClientId: ReadonlyMap<string, string>;
  sales: readonly ParsedSale[];
  session: PosSessionRow;
  shopId: string;
  staffId: string;
  supabase: SupabaseAdminClient;
  targetId: string;
}): Promise<StockApplicationResult> {
  const insertedLineBySaleAndClientLineId = new Map(
    input.lineRows.map((line) => [
      `${line.pos_sale_id}:${line.client_line_id}`,
      line,
    ]),
  );
  const stockStatusesBySaleId = new Map<string, StockMovementRpcRow[]>();

  for (const sale of input.sales) {
    if (sale.sourceSchemaVersion !== "pos-sales-ledger-v2") {
      continue;
    }

    const saleId = input.saleIdByClientId.get(sale.clientSaleId);

    if (!saleId) {
      continue;
    }

    for (const line of sale.lines) {
      const insertedLine = insertedLineBySaleAndClientLineId.get(
        `${saleId}:${line.clientLineId}`,
      );

      if (!insertedLine) {
        return {
          ok: false,
          result: await auditedFailure(input.supabase, {
            code: "db_failure",
            metadata: {
              ...requestMetadata(input.meta),
              reason: "stock_sale_line_missing",
            },
            shopId: input.shopId,
            staffId: input.staffId,
            status: 500,
            targetId: input.targetId,
            targetType: "pos_sales_sync_batch",
          }),
        };
      }

      const movementKind = stockMovementKind(sale, line.stockQuantityDelta);
      const movement = await untypedSupabase(input.supabase).rpc(
        "pos_apply_sale_stock_movement",
        {
          p_metadata_redacted: {
            client_line_id_present: true,
            client_sale_id_present: true,
            source: "TASK-081",
          },
          p_movement_key: `${input.shopId}:${input.session.shop_device_id}:${sale.clientSaleId}:${line.clientLineId}:${movementKind}`,
          p_movement_kind: movementKind,
          p_pos_sale_id: saleId,
          p_pos_sale_line_id: insertedLine.pos_sale_line_id,
          p_product_id: scopedProductId(line.productId, input.productScope.scopedProductIds),
          p_quantity_delta: line.stockQuantityDelta,
          p_shop_id: input.shopId,
        },
      );

      if (movement.error || !movement.data?.[0]) {
        return {
          ok: false,
          result: await auditedFailure(input.supabase, {
            code: "db_failure",
            metadata: {
              ...requestMetadata(input.meta),
              reason: "stock_movement_rpc_failed",
            },
            shopId: input.shopId,
            staffId: input.staffId,
            status: 500,
            targetId: input.targetId,
            targetType: "pos_sales_sync_batch",
          }),
        };
      }

      const stockResult = movement.data[0];
      const existing = stockStatusesBySaleId.get(saleId) ?? [];
      existing.push(stockResult);
      stockStatusesBySaleId.set(saleId, existing);

      const lineStatusUpdate = await untypedSupabase(input.supabase)
        .from("pos_sale_lines")
        .update({
          stock_issue_code: stockResult.issue_code,
          stock_sync_status: stockResult.status,
        })
        .eq("pos_sale_line_id", insertedLine.pos_sale_line_id);

      if (lineStatusUpdate.error) {
        return {
          ok: false,
          result: await auditedFailure(input.supabase, {
            code: "db_failure",
            metadata: {
              ...requestMetadata(input.meta),
              reason: "stock_line_status_update_failed",
            },
            shopId: input.shopId,
            staffId: input.staffId,
            status: 500,
            targetId: input.targetId,
            targetType: "pos_sales_sync_batch",
          }),
        };
      }
    }
  }

  for (const [saleId, stockRows] of stockStatusesBySaleId) {
    const warningCount = stockRows.filter(
      (row) => row.status !== "applied" && row.status !== "not_applicable",
    ).length;
    const saleStockStatus =
      warningCount === 0
        ? stockRows.some((row) => row.status === "applied")
          ? "applied"
          : "not_applicable"
        : stockRows.some((row) => row.status === "stock_conflict")
          ? "stock_conflict"
          : "stock_warning";
    const saleStatusUpdate = await untypedSupabase(input.supabase)
      .from("pos_sales")
      .update({
        stock_sync_status: saleStockStatus,
        stock_warning_count: warningCount,
      })
      .eq("pos_sale_id", saleId);

    if (saleStatusUpdate.error) {
      return {
        ok: false,
        result: await auditedFailure(input.supabase, {
          code: "db_failure",
          metadata: {
            ...requestMetadata(input.meta),
            reason: "stock_sale_status_update_failed",
          },
          shopId: input.shopId,
          staffId: input.staffId,
          status: 500,
          targetId: input.targetId,
          targetType: "pos_sales_sync_batch",
        }),
      };
    }
  }

  return {
    ok: true,
    stockMovementSaleCount: stockStatusesBySaleId.size,
  };
}

export async function handlePosSalesSync(
  input: unknown,
  meta: PosSalesSyncRequestMeta = {},
): Promise<PosSalesSyncEndpointResult> {
  const serverTime = new Date().toISOString();
  const supabase = await getSupabaseForPosSales();

  if (!supabase) {
    return failure("not_configured", 503);
  }

  const parsed = parseSalesSyncInput(input, meta);

  if (!parsed) {
    return auditedFailure(supabase, {
      code: "validation_failed",
      metadata: requestMetadata(meta),
      status: 400,
    });
  }

  const auth = await validatePosSession(supabase, parsed, meta);

  if (auth.result) {
    return auth.result;
  }

  const { session, shop, staff } = auth.context;
  const lineCount = parsed.sales.reduce((sum, sale) => sum + sale.lines.length, 0);
  const existingBatch = await findExistingBatch(supabase, parsed, shop.shop_id);

  if (existingBatch.error) {
    return auditedFailure(supabase, {
      code: "db_failure",
      metadata: requestMetadata(meta),
      shopId: shop.shop_id,
      staffId: staff.staff_id,
      status: 500,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }

  if (existingBatch.data) {
    const duplicate = existingBatch.data.payload_hash === parsed.batchPayloadHash;

    const auditOk = await writePosSalesAudit(supabase, {
      code: duplicate ? "duplicate_batch" : "conflict_batch",
      metadata: {
        ...requestMetadata(meta),
        client_batch_id_present: true,
        line_count: lineCount,
        sale_count: parsed.sales.length,
      },
      result: duplicate ? "success" : "blocked",
      severity: duplicate ? "info" : "warning",
      shopId: shop.shop_id,
      staffId: staff.staff_id,
      targetId: existingBatch.data.pos_sales_sync_batch_id,
      targetType: "pos_sales_sync_batch",
    });

    if (!auditOk) {
      return failure("db_failure", 500);
    }

    if (!duplicate) {
      return failure("conflict", 409);
    }

    const duplicateExistingSales = await findExistingSales(supabase, parsed, shop.shop_id);

    if (duplicateExistingSales.error) {
      return auditedFailure(supabase, {
        code: "db_failure",
        metadata: requestMetadata(meta),
        shopId: shop.shop_id,
        staffId: staff.staff_id,
        status: 500,
        targetId: existingBatch.data.pos_sales_sync_batch_id,
        targetType: "pos_sales_sync_batch",
      });
    }

    const duplicateByClientSaleId = new Map(
      duplicateExistingSales.rows.map((row) => [row.client_sale_id, row]),
    );
    const duplicateByIdempotencyKey = new Map(
      duplicateExistingSales.rows.map((row) => [row.idempotency_key, row]),
    );
    const duplicateSaleIdByClientId = new Map<string, string>();

    for (const sale of parsed.sales) {
      const existing =
        duplicateByClientSaleId.get(sale.clientSaleId) ??
        duplicateByIdempotencyKey.get(sale.idempotencyKey);

      if (!existing) {
        return auditedFailure(supabase, {
          code: "db_failure",
          metadata: {
            ...requestMetadata(meta),
            reason: "duplicate_sale_missing",
          },
          shopId: shop.shop_id,
          staffId: staff.staff_id,
          status: 500,
          targetId: existingBatch.data.pos_sales_sync_batch_id,
          targetType: "pos_sales_sync_batch",
        });
      }

      duplicateSaleIdByClientId.set(sale.clientSaleId, existing.pos_sale_id);
    }

    const duplicateProductScope = await validateSalesLineProductScope(
      supabase,
      parsed.sales,
      shop.shop_id,
    );

    if (!duplicateProductScope.ok) {
      return auditedFailure(supabase, {
        code: "db_failure",
        metadata: {
          ...requestMetadata(meta),
          invalid_product_id_count: duplicateProductScope.invalidProductCount,
          product_id_count: duplicateProductScope.productIdCount,
          reason: duplicateProductScope.reason,
        },
        shopId: shop.shop_id,
        staffId: staff.staff_id,
        status: 500,
        targetId: existingBatch.data.pos_sales_sync_batch_id,
        targetType: "pos_sales_sync_batch",
      });
    }

    const duplicateLineRows = await findExistingSaleLinesForSales(
      supabase,
      [...duplicateSaleIdByClientId.values()],
    );

    if (duplicateLineRows.error) {
      return auditedFailure(supabase, {
        code: "db_failure",
        metadata: {
          ...requestMetadata(meta),
          reason: "duplicate_sale_line_lookup_failed",
        },
        shopId: shop.shop_id,
        staffId: staff.staff_id,
        status: 500,
        targetId: existingBatch.data.pos_sales_sync_batch_id,
        targetType: "pos_sales_sync_batch",
      });
    }

    const duplicateStockRepair = await applyStockMovements({
      lineRows: duplicateLineRows.rows,
      meta,
      productScope: duplicateProductScope,
      saleIdByClientId: duplicateSaleIdByClientId,
      sales: parsed.sales,
      session,
      shopId: shop.shop_id,
      staffId: staff.staff_id,
      supabase,
      targetId: existingBatch.data.pos_sales_sync_batch_id,
    });

    if (!duplicateStockRepair.ok) {
      return duplicateStockRepair.result;
    }

    return {
      body: {
        batch: {
          acceptedSaleCount: 0,
          clientBatchId: parsed.clientBatchId,
          conflictCount: 0,
          duplicateSaleCount: parsed.sales.length,
          lineCount,
          posSalesSyncBatchId: existingBatch.data.pos_sales_sync_batch_id,
          saleCount: parsed.sales.length,
          status: "duplicate",
        },
        code: "success",
        ok: true,
        sales: parsed.sales.map((sale) => {
          const existing =
            duplicateByClientSaleId.get(sale.clientSaleId) ??
            duplicateByIdempotencyKey.get(sale.idempotencyKey);

          return {
            clientSaleId: sale.clientSaleId,
            posSaleId:
              existing?.pos_sale_id ??
              duplicateSaleIdByClientId.get(sale.clientSaleId) ??
              null,
            status: "duplicate",
          };
        }),
        serverTime,
        shop: {
          shopCode: shop.shop_code,
          shopId: shop.shop_id,
        },
      },
      status: 200,
    };
  }

  const existingSales = await findExistingSales(supabase, parsed, shop.shop_id);

  if (existingSales.error) {
    return auditedFailure(supabase, {
      code: "db_failure",
      metadata: requestMetadata(meta),
      shopId: shop.shop_id,
      staffId: staff.staff_id,
      status: 500,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }

  const existingByClientSaleId = new Map(
    existingSales.rows.map((row) => [row.client_sale_id, row]),
  );
  const existingByIdempotencyKey = new Map(
    existingSales.rows.map((row) => [row.idempotency_key, row]),
  );
  const duplicateSales: ExistingSaleRow[] = [];
  const acceptedSales: ParsedSale[] = [];

  for (const sale of parsed.sales) {
    const existing =
      existingByClientSaleId.get(sale.clientSaleId) ??
      existingByIdempotencyKey.get(sale.idempotencyKey);

    if (!existing) {
      acceptedSales.push(sale);
      continue;
    }

    if (existing.payload_hash !== sale.payloadHash) {
      return auditedFailure(supabase, {
        code: "conflict",
        metadata: {
          ...requestMetadata(meta),
          client_sale_id_present: true,
          sale_count: parsed.sales.length,
        },
        shopId: shop.shop_id,
        staffId: staff.staff_id,
        status: 409,
        targetId: existing.pos_sale_id,
        targetType: "pos_sale",
      });
    }

    duplicateSales.push(existing);
  }

  const productScope = await validateSalesLineProductScope(
    supabase,
    acceptedSales,
    shop.shop_id,
  );

  if (!productScope.ok) {
    return auditedFailure(supabase, {
      code: "db_failure",
      metadata: {
        ...requestMetadata(meta),
        accepted_sale_count: acceptedSales.length,
        duplicate_sale_count: duplicateSales.length,
        invalid_product_id_count: productScope.invalidProductCount,
        line_count: lineCount,
        product_id_count: productScope.productIdCount,
        reason: productScope.reason,
        sale_count: parsed.sales.length,
      },
      shopId: shop.shop_id,
      staffId: staff.staff_id,
      status: 500,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }

  const hasV1ProductScopeMismatch = acceptedSales.some(
    (sale) =>
      sale.sourceSchemaVersion === "pos-sales-v1" &&
      sale.lines.some(
        (line) => line.productId && !productScope.scopedProductIds.has(line.productId),
      ),
  );

  if (hasV1ProductScopeMismatch) {
    return auditedFailure(supabase, {
      code: "validation_failed",
      metadata: {
        ...requestMetadata(meta),
        accepted_sale_count: acceptedSales.length,
        duplicate_sale_count: duplicateSales.length,
        invalid_product_id_count: productScope.invalidProductCount,
        line_count: lineCount,
        product_id_count: productScope.productIdCount,
        reason: "product_scope_mismatch",
        sale_count: parsed.sales.length,
      },
      shopId: shop.shop_id,
      staffId: staff.staff_id,
      status: 400,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }

  const batchInsert: TablesInsert<"pos_sales_sync_batches"> = {
    client_batch_id: parsed.clientBatchId,
    conflict_count: 0,
    idempotency_key: parsed.idempotencyKey,
    line_count: lineCount,
    metadata_redacted: {
      app_version_present: Boolean(parsed.appVersion),
      duplicate_sale_count: duplicateSales.length,
      source: "TASK-041",
      source_schema_version: parsed.schemaVersion,
      task_081_sales_ledger_enabled: parsed.schemaVersion === "pos-sales-ledger-v2",
    },
    payload_hash: parsed.batchPayloadHash,
    pos_session_id: session.pos_session_id,
    sale_count: parsed.sales.length,
    shop_code: shop.shop_code,
    shop_device_id: session.shop_device_id,
    shop_id: shop.shop_id,
    staff_id: staff.staff_id,
    status: "accepted",
  };
  const batchResult = await supabase
    .from("pos_sales_sync_batches")
    .insert(batchInsert)
    .select("pos_sales_sync_batch_id")
    .maybeSingle<Pick<Tables<"pos_sales_sync_batches">, "pos_sales_sync_batch_id">>();

  if (batchResult.error || !batchResult.data) {
    return auditedFailure(supabase, {
      code: batchResult.error?.code === "23505" ? "conflict" : "db_failure",
      metadata: requestMetadata(meta),
      shopId: shop.shop_id,
      staffId: staff.staff_id,
      status: batchResult.error?.code === "23505" ? 409 : 500,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }

  const batchId = batchResult.data.pos_sales_sync_batch_id;
  const saleRows: Array<TablesInsert<"pos_sales"> & Record<string, unknown>> = acceptedSales.map((sale) => ({
    business_date: sale.businessDate,
    business_kind: sale.businessKind,
    change_amount_clp: sale.changeAmountClp,
    client_original_sale_id: sale.clientOriginalSaleId,
    client_sale_id: sale.clientSaleId,
    currency: sale.currency,
    discount_amount_clp: sale.discountAmountClp,
    discount_total: sale.discountTotal,
    fiscal_document_number_redacted: sale.fiscalDocumentNumberRedacted,
    fiscal_document_type: sale.fiscalDocumentType,
    fiscal_printed_at: sale.fiscalPrintedAt,
    fiscal_status: sale.fiscalStatus,
    gross_amount_clp: sale.grossAmountClp,
    idempotency_key: sale.idempotencyKey,
    metadata_redacted: {
      line_count: sale.lines.length,
      source: "TASK-041",
      source_schema_version: sale.sourceSchemaVersion,
      task_081_sales_ledger_enabled: sale.sourceSchemaVersion === "pos-sales-ledger-v2",
    },
    net_amount_clp: sale.netAmountClp,
    occurred_at: sale.occurredAt,
    paid_amount_clp: sale.paidAmountClp,
    payload_hash: sale.payloadHash,
    pos_sales_sync_batch_id: batchId,
    pos_session_id: session.pos_session_id,
    reversal_reason_redacted: sale.reversalReasonRedacted,
    sale_number: sale.saleNumber,
    shop_code: shop.shop_code,
    shop_device_id: session.shop_device_id,
    shop_id: shop.shop_id,
    source_schema_version: sale.sourceSchemaVersion,
    staff_id: staff.staff_id,
    status: "accepted",
    stock_sync_status:
      sale.sourceSchemaVersion === "pos-sales-ledger-v2" ? "not_applicable" : "not_applicable",
    subtotal: sale.subtotal,
    tax_amount_clp: sale.taxAmountClp,
    tax_total: sale.taxTotal,
    total: sale.total,
  }));
  const insertedSales =
    saleRows.length > 0
      ? await supabase
          .from("pos_sales")
          .insert(saleRows as TablesInsert<"pos_sales">[])
          .select("pos_sale_id,client_sale_id")
          .returns<Array<Pick<Tables<"pos_sales">, "client_sale_id" | "pos_sale_id">>>()
      : { data: [], error: null };

  if (insertedSales.error || !insertedSales.data) {
    const cleanupOk = await cleanupPosSalesBatch(supabase, batchId);

    return auditedFailure(supabase, {
      code: insertedSales.error?.code === "23505" ? "conflict" : "db_failure",
      metadata: {
        ...requestMetadata(meta),
        cleanup_ok: cleanupOk,
      },
      shopId: shop.shop_id,
      staffId: staff.staff_id,
      status: insertedSales.error?.code === "23505" ? 409 : 500,
      targetId: batchId,
      targetType: "pos_sales_sync_batch",
    });
  }

  const insertedSaleByClientId = new Map(
    insertedSales.data.map((sale) => [sale.client_sale_id, sale.pos_sale_id]),
  );
  const lineRows: Array<TablesInsert<"pos_sale_lines"> & Record<string, unknown>> = acceptedSales.flatMap((sale) => {
    const saleId = insertedSaleByClientId.get(sale.clientSaleId);

    if (!saleId) {
      return [];
    }

    return sale.lines.map((line) => ({
      amount_clp: line.amountClp,
      barcode: line.barcode,
      client_line_id: line.clientLineId,
      item_number: line.itemNumber,
      line_type: line.lineType,
      line_position: line.linePosition,
      line_total: line.lineTotal,
      local_product_id: line.localProductId,
      metadata_redacted: {
        source: "TASK-041",
        source_schema_version: sale.sourceSchemaVersion,
        task_081_sales_ledger_enabled: sale.sourceSchemaVersion === "pos-sales-ledger-v2",
      },
      pos_sale_id: saleId,
      pos_sales_sync_batch_id: batchId,
      product_id: scopedProductId(line.productId, productScope.scopedProductIds),
      product_name: line.productName,
      quantity: line.quantity,
      shop_id: shop.shop_id,
      stock_quantity_delta: line.stockQuantityDelta,
      stock_sync_status:
        sale.sourceSchemaVersion === "pos-sales-ledger-v2" ? "not_applicable" : "not_applicable",
      unit_amount_clp: line.unitAmountClp,
      unit_price: line.unitPrice,
    }));
  });
  const lineInsert =
    lineRows.length > 0
      ? await supabase
          .from("pos_sale_lines")
          .insert(lineRows as TablesInsert<"pos_sale_lines">[])
          .select(
            "pos_sale_line_id,pos_sale_id,client_line_id,product_id,stock_quantity_delta",
          )
          .returns<InsertedLineRow[]>()
      : { data: [], error: null };

  if (lineInsert.error || !lineInsert.data) {
    const cleanupOk = await cleanupPosSalesBatch(supabase, batchId);

    return auditedFailure(supabase, {
      code: lineInsert.error?.code === "23505" ? "conflict" : "db_failure",
      metadata: {
        ...requestMetadata(meta),
        cleanup_ok: cleanupOk,
      },
      shopId: shop.shop_id,
      staffId: staff.staff_id,
      status: lineInsert.error?.code === "23505" ? 409 : 500,
      targetId: batchId,
      targetType: "pos_sales_sync_batch",
    });
  }

  const ledgerRows = acceptedSales.flatMap((sale) =>
    sale.sourceSchemaVersion === "pos-sales-ledger-v2"
      ? buildLedgerRows({
          batchId,
          insertedSaleByClientId,
          sale,
          scopedProductIds: productScope.scopedProductIds,
          session,
          shopId: shop.shop_id,
          staffId: staff.staff_id,
        })
      : [],
  );
  const ledgerInsert =
    ledgerRows.length > 0
      ? await untypedSupabase(supabase)
          .from("pos_revenue_ledger_entries")
          .insert(ledgerRows)
      : { error: null };

  if (ledgerInsert.error) {
    const cleanupOk = await cleanupPosSalesBatch(supabase, batchId);

    return auditedFailure(supabase, {
      code: ledgerInsert.error.code === "23505" ? "conflict" : "db_failure",
      metadata: {
        ...requestMetadata(meta),
        cleanup_ok: cleanupOk,
      },
      shopId: shop.shop_id,
      staffId: staff.staff_id,
      status: ledgerInsert.error.code === "23505" ? 409 : 500,
      targetId: batchId,
      targetType: "pos_sales_sync_batch",
    });
  }

  const stockApplication = await applyStockMovements({
    lineRows: lineInsert.data ?? [],
    meta,
    productScope,
    saleIdByClientId: insertedSaleByClientId,
    sales: acceptedSales,
    session,
    shopId: shop.shop_id,
    staffId: staff.staff_id,
    supabase,
    targetId: batchId,
  });

  if (!stockApplication.ok) {
    return stockApplication.result;
  }

  const successAuditOk = await writePosSalesAudit(supabase, {
    code: "success",
    metadata: {
      ...requestMetadata(meta),
      accepted_sale_count: acceptedSales.length,
      duplicate_sale_count: duplicateSales.length,
      line_count: lineCount,
      ledger_entry_count: ledgerRows.length,
      sale_count: parsed.sales.length,
      source_schema_version: parsed.schemaVersion,
      stock_movement_sale_count: stockApplication.stockMovementSaleCount,
    },
    result: "success",
    severity: "info",
    shopId: shop.shop_id,
    staffId: staff.staff_id,
    targetId: batchId,
    targetType: "pos_sales_sync_batch",
  });

  if (!successAuditOk) {
    return failure("db_failure", 500);
  }

  const duplicateByClientId = new Map(
    duplicateSales.map((sale) => [sale.client_sale_id, sale]),
  );

  return {
    body: {
      batch: {
        acceptedSaleCount: acceptedSales.length,
        clientBatchId: parsed.clientBatchId,
        conflictCount: 0,
        duplicateSaleCount: duplicateSales.length,
        lineCount,
        posSalesSyncBatchId: batchId,
        saleCount: parsed.sales.length,
        status: "accepted",
      },
      code: "success",
      ok: true,
      sales: parsed.sales.map((sale) => {
        const duplicate = duplicateByClientId.get(sale.clientSaleId);

        return {
          clientSaleId: sale.clientSaleId,
          posSaleId:
            insertedSaleByClientId.get(sale.clientSaleId) ??
            duplicate?.pos_sale_id ??
            null,
          status: duplicate ? "duplicate" : "accepted",
        };
      }),
      serverTime,
      shop: {
        shopCode: shop.shop_code,
        shopId: shop.shop_id,
      },
    },
    status: 200,
  };
}
