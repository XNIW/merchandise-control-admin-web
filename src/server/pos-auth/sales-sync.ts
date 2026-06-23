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

type ParsedSalesLine = {
  barcode: string | null;
  clientLineId: string;
  itemNumber: string | null;
  linePosition: number;
  lineTotal: number;
  productId: string | null;
  productName: string | null;
  quantity: number;
  unitPrice: number;
};

type ParsedSale = {
  businessDate: string | null;
  clientSaleId: string;
  currency: string;
  discountTotal: number;
  idempotencyKey: string;
  lines: ParsedSalesLine[];
  occurredAt: string;
  payloadHash: string;
  saleNumber: string | null;
  subtotal: number;
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
const SAFE_TEXT_PATTERN = /^[\w .:/#@-]+$/u;
const NUMERIC_TEXT_PATTERN = /^-?\d+(?:\.\d+)?$/;
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
    user_agent_length: meta.userAgent?.length ?? 0,
    user_agent_present: Boolean(meta.userAgent),
  };
}

function parseLine(input: unknown, index: number): ParsedSalesLine | null {
  if (!isRecord(input)) {
    return null;
  }

  const clientLineId =
    safeText(stringField(input, "clientLineId", "client_line_id"), 160) ||
    `line-${index + 1}`;
  const linePosition = Math.trunc(numberField(input, "linePosition", "line_position") ?? index + 1);
  const quantity = positiveQuantity(numberField(input, "quantity", "qty"));
  const unitPrice = positiveAmount(numberField(input, "unitPrice", "unit_price"));
  const lineTotal = positiveAmount(numberField(input, "lineTotal", "line_total", "total"));
  const productId = stringField(input, "productId", "product_id").trim();

  if (
    linePosition < 1 ||
    linePosition > MAX_SYNC_LINES ||
    quantity === null ||
    unitPrice === null ||
    lineTotal === null ||
    !amountsClose(Number((quantity * unitPrice).toFixed(2)), lineTotal) ||
    (productId && !UUID_PATTERN.test(productId))
  ) {
    return null;
  }

  return {
    barcode: safeText(stringField(input, "barcode"), 80) || null,
    clientLineId,
    itemNumber: safeText(stringField(input, "itemNumber", "item_number"), 80) || null,
    linePosition,
    lineTotal,
    productId: productId || null,
    productName: normalizeText(stringField(input, "productName", "product_name"), 160) || null,
    quantity,
    unitPrice,
  };
}

function parseSale(input: unknown): ParsedSale | null {
  if (!isRecord(input)) {
    return null;
  }

  const clientSaleId = safeText(stringField(input, "clientSaleId", "client_sale_id"), 160);
  const idempotencyKey =
    safeText(stringField(input, "idempotencyKey", "idempotency_key"), 200) ||
    clientSaleId;
  const occurredAt = parseIsoTimestamp(stringField(input, "occurredAt", "occurred_at"));
  const currency = normalizeCode(stringField(input, "currency") || "CLP");
  const subtotal = positiveAmount(numberField(input, "subtotal", "sub_total"));
  const discountTotal = positiveAmount(
    numberField(input, "discountTotal", "discount_total", "discount"),
  );
  const taxTotal = positiveAmount(numberField(input, "taxTotal", "tax_total", "tax"));
  const total = positiveAmount(numberField(input, "total", "saleTotal", "sale_total"));
  const rawLines = Array.isArray(input.lines) ? input.lines : [];
  const lines = rawLines.map(parseLine).filter((line): line is ParsedSalesLine => Boolean(line));
  const businessDateRaw = stringField(input, "businessDate", "business_date");
  const businessDate = businessDateRaw ? parseBusinessDate(businessDateRaw) : null;

  if (
    !clientSaleId ||
    !idempotencyKey ||
    !occurredAt ||
    !/^[A-Z]{3}$/.test(currency) ||
    subtotal === null ||
    discountTotal === null ||
    taxTotal === null ||
    total === null ||
    (businessDateRaw.length > 0 && !businessDate) ||
    rawLines.length === 0 ||
    lines.length !== rawLines.length ||
    hasDuplicateValues(lines.map((line) => line.clientLineId)) ||
    hasDuplicateValues(lines.map((line) => line.linePosition)) ||
    !saleTotalsAreConsistent({
      discountTotal,
      lines,
      subtotal,
      taxTotal,
      total,
    })
  ) {
    return null;
  }

  const saleForHash = {
    businessDate,
    clientSaleId,
    currency,
    discountTotal,
    idempotencyKey,
    lines,
    occurredAt,
    saleNumber: safeText(stringField(input, "saleNumber", "sale_number"), 80) || null,
    subtotal,
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

  const batch = childRecord(input, "batch");
  const salesInput = Array.isArray(input.sales) ? input.sales : [];
  const sales = salesInput.map(parseSale).filter((sale): sale is ParsedSale => Boolean(sale));
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
) {
  const productIds = productIdsForSales(sales);

  if (productIds.length === 0) {
    return { ok: true as const, productIdCount: 0 };
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

  if (invalidProductCount > 0) {
    return {
      code: "validation_failed" as const,
      invalidProductCount,
      ok: false as const,
      productIdCount: productIds.length,
      reason: "product_scope_mismatch",
    };
  }

  return { ok: true as const, productIdCount: productIds.length };
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
        code: "duplicate",
        ok: true,
        sales: parsed.sales.map((sale) => ({
          clientSaleId: sale.clientSaleId,
          posSaleId: null,
          status: "duplicate",
        })),
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
      code: productScope.code,
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
      status: productScope.code === "db_failure" ? 500 : 400,
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
  const saleRows: TablesInsert<"pos_sales">[] = acceptedSales.map((sale) => ({
    business_date: sale.businessDate,
    client_sale_id: sale.clientSaleId,
    currency: sale.currency,
    discount_total: sale.discountTotal,
    idempotency_key: sale.idempotencyKey,
    metadata_redacted: {
      line_count: sale.lines.length,
      source: "TASK-041",
    },
    occurred_at: sale.occurredAt,
    payload_hash: sale.payloadHash,
    pos_sales_sync_batch_id: batchId,
    pos_session_id: session.pos_session_id,
    sale_number: sale.saleNumber,
    shop_code: shop.shop_code,
    shop_device_id: session.shop_device_id,
    shop_id: shop.shop_id,
    staff_id: staff.staff_id,
    status: "accepted",
    subtotal: sale.subtotal,
    tax_total: sale.taxTotal,
    total: sale.total,
  }));
  const insertedSales =
    saleRows.length > 0
      ? await supabase
          .from("pos_sales")
          .insert(saleRows)
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
  const lineRows: TablesInsert<"pos_sale_lines">[] = acceptedSales.flatMap((sale) => {
    const saleId = insertedSaleByClientId.get(sale.clientSaleId);

    if (!saleId) {
      return [];
    }

    return sale.lines.map((line) => ({
      barcode: line.barcode,
      client_line_id: line.clientLineId,
      item_number: line.itemNumber,
      line_position: line.linePosition,
      line_total: line.lineTotal,
      metadata_redacted: {
        source: "TASK-041",
      },
      pos_sale_id: saleId,
      pos_sales_sync_batch_id: batchId,
      product_id: line.productId,
      product_name: line.productName,
      quantity: line.quantity,
      shop_id: shop.shop_id,
      unit_price: line.unitPrice,
    }));
  });
  const lineInsert =
    lineRows.length > 0
      ? await supabase.from("pos_sale_lines").insert(lineRows)
      : { error: null };

  if (lineInsert.error) {
    const cleanupOk = await cleanupPosSalesBatch(supabase, batchId);

    return auditedFailure(supabase, {
      code: lineInsert.error.code === "23505" ? "conflict" : "db_failure",
      metadata: {
        ...requestMetadata(meta),
        cleanup_ok: cleanupOk,
      },
      shopId: shop.shop_id,
      staffId: staff.staff_id,
      status: lineInsert.error.code === "23505" ? 409 : 500,
      targetId: batchId,
      targetType: "pos_sales_sync_batch",
    });
  }

  const successAuditOk = await writePosSalesAudit(supabase, {
    code: "success",
    metadata: {
      ...requestMetadata(meta),
      accepted_sale_count: acceptedSales.length,
      duplicate_sale_count: duplicateSales.length,
      line_count: lineCount,
      sale_count: parsed.sales.length,
    },
    result: "success",
    severity: "info",
    shopId: shop.shop_id,
    staffId: staff.staff_id,
    targetId: batchId,
    targetType: "pos_sales_sync_batch",
  });

  if (!successAuditOk) {
    await cleanupPosSalesBatch(supabase, batchId);
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
