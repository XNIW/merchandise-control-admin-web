import "server-only";

import { createHash } from "node:crypto";
import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { isStaffCredentialLockStateUsable } from "@/server/shop-admin/access-principal";
import {
  buildPosShopPayload,
  type PosShopPayload,
  type PosShopPayloadRow,
} from "./shop-payload";
import {
  POS_LEGACY_SALES_SCHEMA_VERSION,
  POS_SALES_SCHEMA_VERSION,
  type PosSalesSchemaVersion,
} from "./pos-contract";
import { verifyPosSecret } from "./tokens";
import { loadPosRuntimeLease, writePosRuntimeAudit } from "./runtime-boundary";

export const MAX_POS_SALES_SYNC_JSON_BODY_BYTES = 256 * 1024;

type JsonRecord = { [key: string]: Json | undefined };

type ShopRow = PosShopPayloadRow;
type StaffAccountRow = Pick<
  Tables<"staff_accounts">,
  | "credential_status"
  | "credential_expires_at"
  | "credential_version"
  | "locked_until"
  | "must_change_credential"
  | "session_invalidated_at"
  | "shop_id"
  | "staff_id"
  | "status"
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
        shop: PosShopPayload;
      };
      status: 200;
    };

export type PosSalesSyncRequestMeta = {
  clientRequestId?: string;
  idempotencyKeyHeader?: string;
  requestId?: string;
  route?: string;
  userAgent?: string;
};

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
  clientOriginalLineId: string | null;
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
const SENSITIVE_TEXT_PATTERN =
  /(mcpos_(?:device|session)_|bearer\s+|token|secret|password|credential|pin|access[_-]?token|refresh[_-]?token|eyJ)/i;

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

function redactPosFreeText(value: string) {
  const normalized = normalizeText(value, 240);

  if (!normalized) {
    return null;
  }

  return SENSITIVE_TEXT_PATTERN.test(normalized) ? "[redacted]" : normalized;
}

function containsSensitiveText(value: string | null | undefined) {
  return Boolean(value && SENSITIVE_TEXT_PATTERN.test(value));
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
    isStaffCredentialLockStateUsable({
      credentialStatus: staff.credential_status,
      lockedUntil: staff.locked_until,
    }) &&
    (!staff.credential_expires_at ||
      isFutureTimestamp(staff.credential_expires_at)) &&
    !staff.must_change_credential
  );
}

function requestMetadata(meta: PosSalesSyncRequestMeta): JsonRecord {
  return {
    ...(meta.clientRequestId ? { client_request_id: meta.clientRequestId } : {}),
    ...(meta.requestId ? { request_id: meta.requestId } : {}),
    ...(meta.route ? { route: meta.route } : {}),
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

  if (!value || value === POS_LEGACY_SALES_SCHEMA_VERSION) {
    return POS_LEGACY_SALES_SCHEMA_VERSION;
  }

  return value === POS_SALES_SCHEMA_VERSION ? POS_SALES_SCHEMA_VERSION : null;
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
    change === input.changeAmountClp &&
    tendered - change === input.netAmountClp
  );
}

function paymentDirectionsAreConsistent(
  businessKind: PosSaleBusinessKind,
  payments: readonly ParsedPayment[],
) {
  return businessKind === "sale"
    ? payments.every((payment) => payment.amountClp >= 0)
    : payments.every(
        (payment) => payment.amountClp <= 0 && payment.changeClp === 0,
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
  const clientOriginalLineId =
    safeText(
      stringField(
        input,
        "clientOriginalLineId",
        "client_original_line_id",
        "originalClientLineId",
        "original_client_line_id",
      ),
      160,
    ) || null;
  const linePosition = Math.trunc(numberField(input, "linePosition", "line_position") ?? index + 1);
  const quantity = positiveQuantity(numberField(input, "quantity", "qty"));
  const lineType = parseLineType(input, schemaVersion === POS_SALES_SCHEMA_VERSION);
  const amountClp =
    schemaVersion === POS_SALES_SCHEMA_VERSION
      ? clpAmount(
          integerField(input, "amountClp", "amount_clp", "lineTotalClp", "line_total_clp"),
          { signed: true },
        )
      : null;
  const unitAmountClp =
    schemaVersion === POS_SALES_SCHEMA_VERSION
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
    schemaVersion === POS_SALES_SCHEMA_VERSION
      ? numberField(input, "stockQuantityDelta", "stock_quantity_delta")
      : null;
  const defaultStockDelta =
    lineType !== "item"
      ? 0
      : businessKind === "sale"
        ? -(quantity ?? 0)
        : quantity ?? 0;
  const normalizedStockDelta =
    Number(defaultStockDelta.toFixed(3));
  const suppliedStockDelta =
    stockQuantityDelta === null
      ? normalizedStockDelta
      : Number(stockQuantityDelta.toFixed(3));

  if (
    !lineType ||
    linePosition < 1 ||
    linePosition > MAX_SYNC_LINES ||
    quantity === null ||
    unitPrice === null ||
    lineTotal === null ||
    (schemaVersion === POS_LEGACY_SALES_SCHEMA_VERSION &&
      !amountsClose(Number((quantity * unitPrice).toFixed(2)), lineTotal)) ||
    (schemaVersion === POS_SALES_SCHEMA_VERSION && amountClp === null) ||
    suppliedStockDelta !== normalizedStockDelta ||
    Math.abs(normalizedStockDelta) > 999999 ||
    (productId && !UUID_PATTERN.test(productId))
  ) {
    return null;
  }

  return {
    amountClp,
    barcode: safeText(stringField(input, "barcode"), 80) || null,
    clientLineId,
    clientOriginalLineId,
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

  if (containsSensitiveText(clientSaleId) || containsSensitiveText(idempotencyKey)) {
    return null;
  }

  const occurredAt = parseIsoTimestamp(stringField(input, "occurredAt", "occurred_at"));
  const currency = normalizeCode(stringField(input, "currency") || "CLP");
  const strict = schemaVersion === POS_SALES_SCHEMA_VERSION;
  const businessKind = parseBusinessKind(input, strict);

  if (!businessKind) {
    return null;
  }

  const amounts = childRecord(input, "amounts");
  const grossAmountClp =
    schemaVersion === POS_SALES_SCHEMA_VERSION
      ? clpAmount(
          integerField(amounts, "grossClp", "gross_clp", "subtotalClp", "subtotal_clp"),
        )
      : null;
  const discountAmountClp =
    schemaVersion === POS_SALES_SCHEMA_VERSION
      ? clpAmount(integerField(amounts, "discountClp", "discount_clp"))
      : null;
  const taxAmountClp =
    schemaVersion === POS_SALES_SCHEMA_VERSION
      ? clpAmount(integerField(amounts, "taxClp", "tax_clp")) ?? 0
      : null;
  const netAmountFromPayload =
    schemaVersion === POS_SALES_SCHEMA_VERSION
      ? clpAmount(integerField(amounts, "netClp", "net_clp", "totalClp", "total_clp"), {
          signed: true,
        })
      : null;
  const paidAmountClp =
    schemaVersion === POS_SALES_SCHEMA_VERSION
      ? clpAmount(integerField(amounts, "paidClp", "paid_clp"), { signed: true })
      : null;
  const changeAmountClp =
    schemaVersion === POS_SALES_SCHEMA_VERSION
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
    schemaVersion === POS_SALES_SCHEMA_VERSION &&
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
    schemaVersion === POS_SALES_SCHEMA_VERSION
      ? lines.reduce((sum, line) => sum + (line.amountClp ?? 0), 0)
      : null;
  const hasDiscountLine = lines.some((line) => line.lineType === "discount");
  const hasTaxLine = lines.some((line) => line.lineType === "tax");
  const lineNetAmountClp =
    schemaVersion === POS_SALES_SCHEMA_VERSION &&
    lineAmountTotalClp !== null &&
    discountAmountClp !== null &&
    taxAmountClp !== null
      ? businessKind === "sale"
        ? lineAmountTotalClp -
          (hasDiscountLine ? 0 : discountAmountClp) +
          (hasTaxLine ? 0 : taxAmountClp)
        : lineAmountTotalClp +
          (hasDiscountLine ? 0 : discountAmountClp) -
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
  const reversalReasonRedacted = redactPosFreeText(
    stringField(input, "reversalReason", "reversal_reason"),
  );
  const fiscalStatus =
    businessKind === "void" ? "voided" : parseFiscalStatus(fiscal, strict);
  const saleNumber = safeText(stringField(input, "saleNumber", "sale_number", "saleCode"), 80) || null;

  if (
    !fiscalStatus ||
    !clientSaleId ||
    !idempotencyKey ||
    !occurredAt ||
    (schemaVersion === POS_SALES_SCHEMA_VERSION
      ? currency !== "CLP"
      : !/^[A-Z]{3}$/.test(currency)) ||
    subtotal === null ||
    discountTotal === null ||
    taxTotal === null ||
    total === null ||
    (schemaVersion === POS_SALES_SCHEMA_VERSION && netAmountClp === null) ||
    (schemaVersion === POS_SALES_SCHEMA_VERSION &&
      (grossAmountClp === null || discountAmountClp === null || taxAmountClp === null)) ||
    (schemaVersion === POS_SALES_SCHEMA_VERSION && !businessDate) ||
    (businessKind !== "sale" && !clientOriginalSaleId) ||
    (schemaVersion === POS_SALES_SCHEMA_VERSION &&
      derivedNetAmountClp !== null &&
      netAmountClp !== derivedNetAmountClp) ||
    (schemaVersion === POS_SALES_SCHEMA_VERSION &&
      lineNetAmountClp !== null &&
      netAmountClp !== lineNetAmountClp) ||
    (schemaVersion === POS_SALES_SCHEMA_VERSION &&
      !paymentDirectionsAreConsistent(businessKind, payments)) ||
    (schemaVersion === POS_SALES_SCHEMA_VERSION &&
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
    (schemaVersion === POS_LEGACY_SALES_SCHEMA_VERSION &&
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
  const appVersionRaw = normalizeText(stringField(input, "appVersion", "app_version"), 80);
  const appVersion =
    appVersionRaw && !containsSensitiveText(appVersionRaw) ? appVersionRaw : undefined;

  if (
    !clientBatchId ||
    !idempotencyKey ||
    containsSensitiveText(clientBatchId) ||
    containsSensitiveText(idempotencyKey) ||
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
  return writePosRuntimeAudit(supabase, {
    code: input.code,
    eventKey:
      input.result === "success"
        ? "pos.sales.sync.success"
        : "pos.sales.sync.failure",
    metadata: input.metadata,
    result: input.result,
    severity: input.severity,
    shopId: input.shopId,
    staffId: input.staffId,
    targetId: input.targetId,
    targetType: input.targetType,
  });
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
  const lease = await loadPosRuntimeLease(supabase, {
    posSessionId: parsed.posSessionId,
    shopDeviceId: parsed.shopDeviceId,
  });

  if (lease.status === "db_failure") {
    return {
      result: await auditedFailure(supabase, {
        code: "db_failure",
        metadata: requestMetadata(meta),
        status: 500,
      }),
    };
  }

  if (lease.status === "denied") {
    return {
      result: await auditedFailure(supabase, {
        code: "denied",
        metadata: requestMetadata(meta),
        status: 401,
      }),
    };
  }

  const { credential, device, session, shop, staff } = lease;
  const sessionValid = Boolean(
    session &&
      session.status === "active" &&
      isFutureTimestamp(session.expires_at) &&
      verifyPosSecret(parsed.sessionToken, session.session_token_hash),
  );

  if (!sessionValid) {
    return {
      result: await auditedFailure(supabase, {
        code: "denied",
        metadata: requestMetadata(meta),
        shopId: session.shop_id,
        status: 401,
        targetId: session.pos_session_id,
        targetType: "pos_session",
      }),
    };
  }

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
      shop.shop_status === "active" &&
      (!parsed.shopCode || parsed.shopCode === shop.shop_code) &&
      isStaffUsable(staff) &&
      device.status === "active" &&
      staff.credential_version === credential.staff_credential_version &&
      session.staff_credential_version === staff.credential_version &&
      !isAfterTimestamp(staff.session_invalidated_at, session.issued_at),
  );

  if (!runtimeValid) {
    return {
      result: await auditedFailure(supabase, {
        code: "denied",
        metadata: {
          ...requestMetadata(meta),
          app_version_present: Boolean(parsed.appVersion),
          device_resolved: true,
          shop_resolved: true,
          staff_resolved: true,
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

type AtomicSalesRpcResponse = {
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
  code: "success";
  ok: true;
  sales: Array<{
    clientSaleId: string;
    posSaleId: string | null;
    status: "accepted" | "duplicate";
  }>;
};

function atomicSalesRpcResponse(
  input: unknown,
  expected: ParsedSalesSyncInput,
  expectedLineCount: number,
): AtomicSalesRpcResponse | null {
  if (
    !isRecord(input) ||
    input.ok !== true ||
    input.code !== "success" ||
    !isRecord(input.batch) ||
    !Array.isArray(input.sales)
  ) {
    return null;
  }

  const batch = input.batch;
  const acceptedSaleCount = integerField(batch, "acceptedSaleCount");
  const conflictCount = integerField(batch, "conflictCount");
  const duplicateSaleCount = integerField(batch, "duplicateSaleCount");
  const lineCount = integerField(batch, "lineCount");
  const saleCount = integerField(batch, "saleCount");
  const status =
    batch.status === "accepted" || batch.status === "duplicate"
      ? batch.status
      : null;
  const sales = input.sales
    .map((sale) => {
      if (
        !isRecord(sale) ||
        typeof sale.clientSaleId !== "string" ||
        (sale.posSaleId !== null &&
          (typeof sale.posSaleId !== "string" ||
            sale.posSaleId !== sale.posSaleId.toLowerCase() ||
            !UUID_PATTERN.test(sale.posSaleId))) ||
        (sale.status !== "accepted" && sale.status !== "duplicate")
      ) {
        return null;
      }

      return {
        clientSaleId: sale.clientSaleId,
        posSaleId: sale.posSaleId,
        status: sale.status,
      };
    })
    .filter(
      (
        sale,
      ): sale is {
        clientSaleId: string;
        posSaleId: string | null;
        status: "accepted" | "duplicate";
      } => Boolean(sale),
    );

  if (
    !status ||
    acceptedSaleCount === null ||
    acceptedSaleCount < 0 ||
    batch.clientBatchId !== expected.clientBatchId ||
    conflictCount !== 0 ||
    duplicateSaleCount === null ||
    duplicateSaleCount < 0 ||
    lineCount !== expectedLineCount ||
    typeof batch.posSalesSyncBatchId !== "string" ||
    batch.posSalesSyncBatchId !== batch.posSalesSyncBatchId.toLowerCase() ||
    !UUID_PATTERN.test(batch.posSalesSyncBatchId) ||
    saleCount !== expected.sales.length ||
    sales.length !== input.sales.length
  ) {
    return null;
  }

  const expectedSaleIds = new Set(expected.sales.map((sale) => sale.clientSaleId));
  const returnedSaleIds = sales.map((sale) => sale.clientSaleId);
  const acceptedCount = sales.filter((sale) => sale.status === "accepted").length;
  const duplicateCount = sales.length - acceptedCount;
  if (
    returnedSaleIds.some((clientSaleId) => !expectedSaleIds.has(clientSaleId)) ||
    new Set(returnedSaleIds).size !== returnedSaleIds.length ||
    acceptedCount !== acceptedSaleCount ||
    duplicateCount !== duplicateSaleCount ||
    acceptedCount + duplicateCount !== saleCount ||
    sales.some((sale) => sale.posSaleId === null) ||
    (status === "duplicate" && acceptedCount !== 0) ||
    (status === "accepted" && acceptedCount === 0)
  ) {
    return null;
  }

  return {
    batch: {
      acceptedSaleCount,
      clientBatchId: batch.clientBatchId,
      conflictCount,
      duplicateSaleCount,
      lineCount,
      posSalesSyncBatchId: batch.posSalesSyncBatchId,
      saleCount,
      status,
    },
    code: "success",
    ok: true,
    sales,
  };
}

function atomicSalesFailureCode(input: unknown): PosSalesSyncFailureCode {
  if (!isRecord(input) || input.ok !== false) {
    return "db_failure";
  }

  if (
    input.code === "conflict" ||
    input.code === "denied" ||
    input.code === "validation_failed"
  ) {
    return input.code;
  }

  return "db_failure";
}

function failureStatusForAtomicCode(
  code: PosSalesSyncFailureCode,
): 400 | 401 | 409 | 500 {
  if (code === "validation_failed") {
    return 400;
  }

  if (code === "denied") {
    return 401;
  }

  if (code === "conflict") {
    return 409;
  }

  return 500;
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

  if (!parsed || parsed.schemaVersion !== POS_SALES_SCHEMA_VERSION) {
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
  const lineCount = parsed.sales.reduce(
    (sum, sale) => sum + sale.lines.length,
    0,
  );

  const rpcResult = await supabase.rpc("pos_sales_sync_apply_v1", {
    p_client_batch_id: parsed.clientBatchId,
    p_idempotency_key: parsed.idempotencyKey,
    p_metadata_redacted: {
      app_version_present: Boolean(parsed.appVersion),
      source: "TASK-088",
      source_schema_version: parsed.schemaVersion,
    },
    p_payload_hash: parsed.batchPayloadHash,
    p_pos_session_id: session.pos_session_id,
    p_sales: parsed.sales as unknown as Json,
    p_schema_version: parsed.schemaVersion,
    p_shop_code: shop.shop_code,
    p_shop_device_id: session.shop_device_id,
    p_shop_id: shop.shop_id,
    p_staff_id: staff.staff_id,
  });

  if (rpcResult.error) {
    const code =
      rpcResult.error.code === "23505" ? "conflict" : "db_failure";
    return auditedFailure(supabase, {
      code,
      metadata: {
        ...requestMetadata(meta),
        reason: "atomic_sales_rpc_failed",
      },
      shopId: shop.shop_id,
      staffId: staff.staff_id,
      status: code === "conflict" ? 409 : 500,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }

  const atomicResult = atomicSalesRpcResponse(
    rpcResult.data,
    parsed,
    lineCount,
  );

  if (!atomicResult) {
    const code = atomicSalesFailureCode(rpcResult.data);
    return auditedFailure(supabase, {
      code,
      metadata: {
        ...requestMetadata(meta),
        reason: "atomic_sales_rpc_rejected",
      },
      shopId: shop.shop_id,
      staffId: staff.staff_id,
      status: failureStatusForAtomicCode(code),
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }

  const auditOk = await writePosSalesAudit(supabase, {
    code:
      atomicResult.batch.status === "duplicate"
        ? "duplicate_batch"
        : "success",
    metadata: {
      ...requestMetadata(meta),
      accepted_sale_count: atomicResult.batch.acceptedSaleCount,
      app_version: parsed.appVersion ?? null,
      client_batch_id: parsed.clientBatchId,
      duplicate_sale_count: atomicResult.batch.duplicateSaleCount,
      line_count: lineCount,
      sale_count: parsed.sales.length,
      source_schema_version: parsed.schemaVersion,
    },
    result: "success",
    severity: "info",
    shopId: shop.shop_id,
    staffId: staff.staff_id,
    targetId: atomicResult.batch.posSalesSyncBatchId,
    targetType: "pos_sales_sync_batch",
  });

  if (!auditOk) {
    return failure("db_failure", 500);
  }

  return {
    body: {
      ...atomicResult,
      serverTime,
      shop: buildPosShopPayload(shop),
    },
    status: 200,
  };
}
