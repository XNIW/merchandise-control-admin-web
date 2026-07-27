import "server-only";

import { createHash } from "node:crypto";
import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import {
  CATALOG_TEXT_LIMITS,
  canonicalizeCatalogDisplayText,
  validateCatalogIdentityText,
} from "@/lib/catalog-text-policy";
import { isStaffCredentialLockStateUsable } from "@/server/shop-admin/access-principal";
import {
  buildPosShopPayload,
  type PosShopPayload,
  type PosShopPayloadRow,
} from "./shop-payload";
import { POS_CATALOG_IMPORT_SCHEMA_VERSION } from "./pos-contract";
import { verifyPosSecret } from "./tokens";
import { loadPosRuntimeLease, writePosRuntimeAudit } from "./runtime-boundary";

export const MAX_POS_CATALOG_IMPORT_JSON_BODY_BYTES = 512 * 1024;

type JsonRecord = { [key: string]: Json | undefined };

type ShopRow = PosShopPayloadRow;
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
type PosCatalogImportFailureCode =
  | "auth_denied"
  | "conflict"
  | "db_failure"
  | "not_configured"
  | "scope_changed"
  | "validation_failed";
type PosCatalogImportFailureStatus = 400 | 401 | 409 | 500 | 503;

export type PosCatalogImportEndpointResult =
  | {
      body: {
        code: PosCatalogImportFailureCode;
        message: string;
        ok: false;
      };
      status: PosCatalogImportFailureStatus;
    }
  | {
      body: {
        batch: {
          attemptCount: number;
          clientImportId: string;
          idempotencyKey: string;
          payloadHash: string;
          posCatalogImportBatchId: string;
          serverImportId: string;
          serverRequestId: string;
          status: "accepted" | "duplicate" | "idempotent";
        };
        code: "success";
        items: Array<{
          barcode?: string;
          clientItemId: string;
          code?: string;
          priceType?: "purchase" | "retail";
          remotePriceId?: string;
          remoteProductId?: string;
          status: "accepted" | "duplicate" | "skipped";
        }>;
        nextAction: "catalog_pull";
        ok: true;
        pullRequired: true;
        remotePriceIds: Array<{
          barcode: string;
          clientItemId: string;
          priceType: "purchase" | "retail";
          remotePriceId: string;
          remoteProductId?: string;
        }>;
        remoteProductIds: Array<{
          barcode: string;
          clientItemId: string;
          remoteProductId: string;
        }>;
        serverImportId: string;
        serverRequestId: string;
        serverTime: string;
        shop: PosShopPayload;
        summary: {
          acceptedItemCount: number;
          duplicateItemCount: number;
          productCount: number;
        };
      };
      status: 200;
    };

export type PosCatalogImportRequestMeta = {
  cfRay?: string;
  clientRequestId?: string;
  requestId?: string;
  route?: string;
  userAgent?: string;
};

type ParsedCatalogImportItem = {
  barcode: string;
  category: string | null;
  changeKind: "new" | "no_change" | "skipped" | "updated";
  clientItemId: string;
  diffSummary: string | null;
  itemNumber: string | null;
  productName: string | null;
  purchasePrice: number | null;
  quantity: number | null;
  retailPrice: number | null;
  rowNumber: number;
  secondProductName: string | null;
  supplier: string | null;
};

type ParsedCatalogImportInput = {
  appVersion?: string;
  attemptCount: number;
  batchCreatedAt: string;
  clientImportId: string;
  declaredPayloadHash?: string;
  deviceToken: string;
  idempotencyKey: string;
  items: ParsedCatalogImportItem[];
  payloadHash: string;
  posSessionId: string;
  schemaVersion: typeof POS_CATALOG_IMPORT_SCHEMA_VERSION;
  sessionToken: string;
  shopCode?: string;
  shopDeviceId: string;
  source: "supplier_excel";
  sourceFileName: string | null;
  summary: {
    newProducts: number;
    noChangeRows: number;
    skippedRows: number;
    updatedProducts: number;
    warningCount: number;
  };
};

type PosCatalogImportAuthContext = {
  ownerUserId: string;
  session: PosSessionRow;
  shop: ShopRow;
  staff: StaffAccountRow;
};

type AppliedCatalogImport = {
  acceptedItemCount: number;
  batchId: string;
  duplicateItemCount: number;
  items: Array<{
    barcode?: string;
    clientItemId: string;
    priceType?: "purchase" | "retail";
    remotePriceId?: string;
    remoteProductId?: string;
    status: "accepted" | "duplicate" | "skipped";
  }>;
  productCount: number;
  remotePriceIds: Array<{
    barcode: string;
    clientItemId: string;
    priceType: "purchase" | "retail";
    remotePriceId: string;
    remoteProductId?: string;
  }>;
  remoteProductIds: Array<{
    barcode: string;
    clientItemId: string;
    remoteProductId: string;
  }>;
  status: "accepted" | "duplicate" | "idempotent";
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/g;
const NUMERIC_TEXT_PATTERN = /^-?\d+(?:[.,]\d+)?$/;
const MAX_POS_SECRET_LENGTH = 256;
const MAX_IMPORT_ITEMS = 1_000;
const SENSITIVE_TEXT_PATTERN =
  /(mcpos_(?:device|session)_|bearer\s+|token|secret|password|credential|pin|access[_-]?token|refresh[_-]?token|eyJ|SUPABASE_SERVICE_ROLE_KEY)/i;

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
      const normalized = value.trim().replace(",", ".");

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

function integerField(record: Record<string, unknown>, ...keys: readonly string[]) {
  const value = numberField(record, ...keys);
  return value !== null && Number.isInteger(value) ? value : null;
}

function normalizeText(value: string, maxLength: number) {
  return value
    .replace(CONTROL_CHAR_PATTERN, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function normalizedOptionalText(value: string, maxLength: number) {
  const normalized = normalizeText(value, maxLength);
  return normalized.length === 0 ? null : normalized;
}

function safeIdText(value: string) {
  const result = validateCatalogIdentityText(value, {
    maxLength: 200,
    required: false,
  });
  return result.status !== "rejected" &&
    SAFE_ID_PATTERN.test(result.value) &&
    !SENSITIVE_TEXT_PATTERN.test(result.value)
    ? result.value
    : "";
}

function normalizeHashText(value: string) {
  const result = validateCatalogIdentityText(value, {
    maxLength: 128,
    required: false,
  });
  return result.status !== "rejected" &&
    /^[A-Za-z0-9:_-]{16,128}$/.test(result.value) &&
    !SENSITIVE_TEXT_PATTERN.test(result.value)
    ? result.value
    : "";
}

function nonNegativeNumber(value: number | null) {
  return value !== null && value >= 0 && value <= 999_999_999
    ? Number(value.toFixed(3))
    : null;
}

function sourceFileNameIsSafe(value: string | null) {
  return !value || !/[\\/:]/.test(value);
}

function parseIsoTimestamp(value: string) {
  const normalized = value.trim();
  const timestamp = Date.parse(normalized);

  if (!normalized || !Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function stableHash(value: unknown) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex")}`;
}

function hasDuplicateValues(values: readonly string[]) {
  return new Set(values).size !== values.length;
}

function hasIdentityCollisionAfterTrim(
  itemsInput: readonly unknown[],
  parsedItems: readonly ParsedCatalogImportItem[],
  field: "barcode" | "itemNumber",
) {
  const rawByCanonical = new Map<string, string>();

  for (const [index, parsedItem] of parsedItems.entries()) {
    if (
      parsedItem.changeKind !== "new" &&
      parsedItem.changeKind !== "updated"
    ) {
      continue;
    }

    const input = itemsInput[index];
    if (!isRecord(input)) {
      return true;
    }

    const raw = field === "barcode"
      ? stringField(input, "barcode")
      : stringField(input, "itemNumber", "item_number");
    const canonical = field === "barcode"
      ? parsedItem.barcode
      : (parsedItem.itemNumber ?? "");

    if (!canonical) {
      continue;
    }

    const previousRaw = rawByCanonical.get(canonical);
    if (previousRaw !== undefined && previousRaw !== raw) {
      return true;
    }

    rawByCanonical.set(canonical, raw);
  }

  return false;
}

function failure(
  code: PosCatalogImportFailureCode,
  status: PosCatalogImportFailureStatus,
): PosCatalogImportEndpointResult {
  const message =
    code === "not_configured"
      ? "POS catalog import backend is not configured."
      : code === "validation_failed"
        ? "Request payload is invalid."
        : code === "conflict"
          ? "POS catalog import idempotency conflict."
          : code === "auth_denied"
            ? "POS catalog import authentication was denied."
            : "POS catalog import request failed.";

  return {
    body: {
      code,
      message,
      ok: false,
    },
    status,
  };
}

function requestMetadata(meta: PosCatalogImportRequestMeta): JsonRecord {
  return {
    ...(meta.cfRay ? { cf_ray_present: true } : {}),
    ...(meta.clientRequestId ? { client_request_id: meta.clientRequestId } : {}),
    ...(meta.requestId ? { request_id: meta.requestId } : {}),
    ...(meta.route ? { route: meta.route } : {}),
    source: "pos_catalog_import_sync",
    user_agent_length: meta.userAgent?.length ?? 0,
    user_agent_present: Boolean(meta.userAgent),
  };
}

function parseChangeKind(value: string) {
  const normalized = normalizeText(value, 40).toLowerCase().replace(/-/g, "_");

  if (normalized === "new" || normalized === "updated" || normalized === "skipped") {
    return normalized;
  }

  if (normalized === "nochange" || normalized === "no_change") {
    return "no_change";
  }

  return null;
}

function parseCatalogImportItem(
  input: unknown,
  index: number,
): ParsedCatalogImportItem | null {
  if (!isRecord(input)) {
    return null;
  }

  const changeKind = parseChangeKind(stringField(input, "changeKind", "change_kind"));
  const clientItemId =
    safeIdText(stringField(input, "clientItemId", "client_item_id")) ||
    `row-${index + 1}`;
  const rowNumber = integerField(input, "rowNumber", "row_number") ?? index + 1;
  const writesProduct = changeKind === "new" || changeKind === "updated";
  const barcodeResult = validateCatalogIdentityText(
    stringField(input, "barcode"),
    { maxLength: CATALOG_TEXT_LIMITS.barcode, required: writesProduct },
  );
  const itemNumberResult = validateCatalogIdentityText(
    stringField(input, "itemNumber", "item_number"),
    { maxLength: CATALOG_TEXT_LIMITS.itemNumber, required: false },
  );
  const productNameResult = canonicalizeCatalogDisplayText(
    stringField(input, "productName", "product_name"),
    { maxLength: CATALOG_TEXT_LIMITS.productName, required: false },
  );
  const secondProductNameResult = canonicalizeCatalogDisplayText(
    stringField(input, "secondProductName", "second_product_name"),
    { maxLength: CATALOG_TEXT_LIMITS.secondProductName, required: false },
  );
  const categoryResult = canonicalizeCatalogDisplayText(
    stringField(input, "category"),
    { maxLength: CATALOG_TEXT_LIMITS.categoryName, required: false },
  );
  const supplierResult = canonicalizeCatalogDisplayText(
    stringField(input, "supplier"),
    { maxLength: CATALOG_TEXT_LIMITS.supplierName, required: false },
  );
  const purchasePrice = nonNegativeNumber(
    numberField(input, "purchasePrice", "purchase_price"),
  );
  const retailPrice = nonNegativeNumber(
    numberField(input, "retailPrice", "retail_price"),
  );
  const quantity = nonNegativeNumber(numberField(input, "quantity", "stockQuantity"));

  if (
    !changeKind ||
    !clientItemId ||
    rowNumber <= 0 ||
    barcodeResult.status === "rejected" ||
    itemNumberResult.status === "rejected" ||
    productNameResult.status === "rejected" ||
    secondProductNameResult.status === "rejected" ||
    categoryResult.status === "rejected" ||
    supplierResult.status === "rejected"
  ) {
    return null;
  }

  const barcode = barcodeResult.value;
  const itemNumber = itemNumberResult.value || null;
  const secondProductName = secondProductNameResult.value || null;
  const productName =
    productNameResult.value || secondProductName || itemNumber;

  if (writesProduct && (!barcode || !productName)) {
    return null;
  }

  if (
    [barcode, productName, stringField(input, "diffSummary", "diff_summary")]
      .filter((value): value is string => Boolean(value))
      .some((value) => SENSITIVE_TEXT_PATTERN.test(value))
  ) {
    return null;
  }

  return {
    barcode,
    category: categoryResult.value || null,
    changeKind,
    clientItemId,
    diffSummary: normalizedOptionalText(
      stringField(input, "diffSummary", "diff_summary"),
      500,
    ),
    itemNumber,
    productName,
    purchasePrice,
    quantity,
    retailPrice,
    rowNumber,
    secondProductName,
    supplier: supplierResult.value || null,
  };
}

function parseCatalogImportInput(input: unknown): ParsedCatalogImportInput | null {
  if (!isRecord(input)) {
    return null;
  }

  const schemaVersion = stringField(input, "schemaVersion", "schema_version");
  const source = stringField(input, "source");
  const batch = childRecord(input, "batch");
  const summaryRecord = childRecord(input, "summary");
  const itemsInput = Array.isArray(input.items) ? input.items : [];
  const batchCreatedAt = parseIsoTimestamp(stringField(batch, "createdAt", "created_at"));
  const clientImportId = safeIdText(
    stringField(batch, "clientImportId", "client_import_id"),
  );
  const idempotencyKey = safeIdText(
    stringField(batch, "idempotencyKey", "idempotency_key") ||
      stringField(input, "idempotencyKey", "idempotency_key"),
  );
  const sourceFileName = normalizedOptionalText(
    stringField(batch, "sourceFileName", "source_file_name"),
    120,
  );
  const attemptCount = integerField(batch, "attemptCount", "attempt_count") ?? 0;
  const deviceToken = stringField(input, "deviceToken", "device_token");
  const sessionToken = stringField(input, "sessionToken", "session_token");
  const posSessionId = stringField(input, "posSessionId", "pos_session_id");
  const shopDeviceId = stringField(input, "shopDeviceId", "shop_device_id");
  const declaredPayloadHash = normalizeHashText(
    stringField(input, "payloadHash", "payload_hash"),
  );

  if (
    schemaVersion !== POS_CATALOG_IMPORT_SCHEMA_VERSION ||
    source !== "supplier_excel" ||
    !batchCreatedAt ||
    !clientImportId ||
    !idempotencyKey ||
    attemptCount <= 0 ||
    !sourceFileNameIsSafe(sourceFileName) ||
    !UUID_PATTERN.test(posSessionId) ||
    !UUID_PATTERN.test(shopDeviceId) ||
    deviceToken.length === 0 ||
    deviceToken.length > MAX_POS_SECRET_LENGTH ||
    sessionToken.length === 0 ||
    sessionToken.length > MAX_POS_SECRET_LENGTH ||
    itemsInput.length === 0 ||
    itemsInput.length > MAX_IMPORT_ITEMS
  ) {
    return null;
  }

  const items = itemsInput.map(parseCatalogImportItem);

  if (items.some((item) => !item)) {
    return null;
  }

  const parsedItems = items as ParsedCatalogImportItem[];

  if (
    hasDuplicateValues(parsedItems.map((item) => item.clientItemId)) ||
    hasIdentityCollisionAfterTrim(itemsInput, parsedItems, "barcode") ||
    hasIdentityCollisionAfterTrim(itemsInput, parsedItems, "itemNumber") ||
    hasDuplicateValues(
      parsedItems
        .filter((item) => item.changeKind === "new" || item.changeKind === "updated")
        .map((item) => item.barcode),
    )
  ) {
    return null;
  }

  const summary = {
    newProducts: integerField(summaryRecord, "newProducts", "new_products") ?? 0,
    noChangeRows: integerField(summaryRecord, "noChangeRows", "no_change_rows") ?? 0,
    skippedRows: integerField(summaryRecord, "skippedRows", "skipped_rows") ?? 0,
    updatedProducts: integerField(summaryRecord, "updatedProducts", "updated_products") ?? 0,
    warningCount: integerField(summaryRecord, "warningCount", "warning_count") ?? 0,
  };
  const itemNewCount = parsedItems.filter((item) => item.changeKind === "new").length;
  const itemUpdatedCount = parsedItems.filter((item) => item.changeKind === "updated").length;

  if (
    Object.values(summary).some((value) => value < 0) ||
    summary.newProducts < itemNewCount ||
    summary.updatedProducts < itemUpdatedCount
  ) {
    return null;
  }

  const appVersion =
    normalizedOptionalText(stringField(input, "appVersion", "app_version"), 80) ??
    undefined;
  const shopCodeResult = validateCatalogIdentityText(
    stringField(input, "shopCode", "shop_code"),
    { maxLength: 80, required: false },
  );

  if (shopCodeResult.status === "rejected") {
    return null;
  }

  const shopCode = shopCodeResult.value || undefined;
  const payloadHash = stableHash({
    appVersion,
    batch: {
      clientImportId,
      createdAt: batchCreatedAt,
      idempotencyKey,
      previewFingerprint: normalizedOptionalText(
        stringField(batch, "previewFingerprint", "preview_fingerprint"),
        128,
      ),
      sourceFileName,
    },
    items: parsedItems,
    schemaVersion,
    source,
    summary,
  });

  return {
    appVersion,
    attemptCount,
    batchCreatedAt,
    clientImportId,
    declaredPayloadHash: declaredPayloadHash || undefined,
    deviceToken,
    idempotencyKey,
    items: parsedItems,
    payloadHash,
    posSessionId,
    schemaVersion,
    sessionToken,
    shopCode,
    shopDeviceId,
    source,
    sourceFileName,
    summary,
  };
}

function isFutureTimestamp(value: string | null) {
  return Boolean(value && Date.parse(value) > Date.now());
}

function isAfterTimestamp(left: string | null, right: string | null) {
  return Boolean(left && right && Date.parse(left) > Date.parse(right));
}

function isStaffUsable(staff: StaffAccountRow | null) {
  return Boolean(
    staff &&
      staff.status === "active" &&
      isStaffCredentialLockStateUsable({
        credentialStatus: staff.credential_status,
        lockedUntil: staff.locked_until,
      }) &&
      !staff.must_change_credential,
  );
}

async function getSupabaseForPosCatalogImport() {
  const config = resolveSupabaseAdminConfig();

  if (config.status !== "configured") {
    return null;
  }

  return createSupabaseAdminClient(config);
}

async function writePosCatalogImportAudit(
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
        ? "pos.catalog.import_sync.success"
        : "pos.catalog.import_sync.failure",
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
    code: PosCatalogImportFailureCode;
    metadata?: JsonRecord;
    shopId?: string;
    staffId?: string;
    status: PosCatalogImportFailureStatus;
    targetId?: string;
    targetType?: string;
  },
): Promise<PosCatalogImportEndpointResult> {
  const auditOk = await writePosCatalogImportAudit(supabase, {
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

async function validatePosCatalogImportAuth(
  supabase: SupabaseAdminClient,
  parsed: ParsedCatalogImportInput,
  meta: PosCatalogImportRequestMeta,
): Promise<
  | { context: PosCatalogImportAuthContext; result?: never }
  | { context?: never; result: PosCatalogImportEndpointResult }
> {
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
        code: "auth_denied",
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
        code: "auth_denied",
        metadata: requestMetadata(meta),
        shopId: session.shop_id,
        status: 401,
        targetId: session.pos_session_id,
        targetType: "pos_session",
      }),
    };
  }

  const scopeResult = await supabase.rpc("pos_catalog_import_scope_v1", {
    p_shop_device_id: session.shop_device_id,
    p_shop_id: session.shop_id,
  });

  if (
    scopeResult.error ||
    !isRecord(scopeResult.data) ||
    (scopeResult.data.status !== "ok" &&
      scopeResult.data.status !== "unmapped" &&
      scopeResult.data.status !== "device_denied")
  ) {
    return {
      result: await auditedFailure(supabase, {
        code: "db_failure",
        metadata: requestMetadata(meta),
        shopId: session.shop_id,
        status: 500,
        targetId: session.pos_session_id,
        targetType: "pos_session",
      }),
    };
  }

  const scope = scopeResult.data as Record<string, unknown>;
  const scopeStatus = stringField(scope, "status");
  const mappedOwnerId = stringField(scope, "ownerUserId");
  const mappingResolved =
    scopeStatus === "ok" && UUID_PATTERN.test(mappedOwnerId);
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
      scopeStatus !== "device_denied" &&
      staff.credential_version === credential.staff_credential_version &&
      session.staff_credential_version === staff.credential_version &&
      !isAfterTimestamp(staff.session_invalidated_at, session.issued_at),
  );

  if (!runtimeValid) {
    return {
      result: await auditedFailure(supabase, {
        code: "auth_denied",
        metadata: {
          ...requestMetadata(meta),
          app_version_present: Boolean(parsed.appVersion),
          device_resolved: scopeStatus !== "device_denied",
          shop_code_matches: !parsed.shopCode || parsed.shopCode === shop.shop_code,
          shop_resolved: true,
          staff_resolved: true,
        },
        shopId: session.shop_id,
        staffId: staff.staff_id,
        status: 401,
        targetId: session.pos_session_id,
        targetType: "pos_session",
      }),
    };
  }

  if (!mappingResolved) {
    return {
      result: await auditedFailure(supabase, {
        code: "not_configured",
        metadata: {
          ...requestMetadata(meta),
          reason: "shop_inventory_source_not_mapped",
        },
        shopId: session.shop_id,
        staffId: staff.staff_id,
        status: 503,
        targetId: session.shop_device_id,
        targetType: "device",
      }),
    };
  }

  return {
    context: {
      ownerUserId: mappedOwnerId,
      session,
      shop,
      staff,
    },
  };
}

async function applyCatalogImport(
  supabase: SupabaseAdminClient,
  parsed: ParsedCatalogImportInput,
  context: PosCatalogImportAuthContext,
  meta: PosCatalogImportRequestMeta,
): Promise<
  | { applied: AppliedCatalogImport; error?: never }
  | {
      applied?: never;
      error:
        | "auth_denied"
        | "conflict"
        | "db_failure"
        | "not_configured"
        | "scope_changed"
        | "validation_failed";
    }
> {
  const result = await supabase.rpc("pos_catalog_import_apply_v2", {
    p_batch_created_at: parsed.batchCreatedAt,
    p_client_import_id: parsed.clientImportId,
    p_idempotency_key: parsed.idempotencyKey,
    p_items: parsed.items as unknown as Json,
    p_metadata_redacted: requestMetadata(meta) as Json,
    p_owner_user_id: context.ownerUserId,
    p_payload_hash: parsed.payloadHash,
    p_pos_session_id: context.session.pos_session_id,
    p_schema_version: parsed.schemaVersion,
    p_shop_device_id: context.session.shop_device_id,
    p_shop_id: context.session.shop_id,
    p_source: parsed.source,
    p_staff_id: context.staff.staff_id,
    p_summary: parsed.summary as unknown as Json,
  });

  if (result.error || !isRecord(result.data)) {
    return { error: "db_failure" };
  }

  const data = result.data;
  if (data.ok !== true) {
    const code = stringField(data, "code");
    return {
      error:
        code === "auth_denied"
          ? "auth_denied"
          : code === "conflict"
          ? "conflict"
          : code === "not_configured"
            ? "not_configured"
            : code === "scope_changed"
              ? "scope_changed"
          : code === "validation_failed"
            ? "validation_failed"
            : "db_failure",
    };
  }

  const summary = childRecord(data, "summary");
  const status = stringField(data, "status");
  const applied = parseAppliedCatalogImport(data, summary, status, parsed);

  return applied ? { applied } : { error: "db_failure" };
}

function canonicalResponseUuid(value: string) {
  return value === value.toLowerCase() && UUID_PATTERN.test(value)
    ? value
    : null;
}

function parseAppliedCatalogImport(
  data: Record<string, unknown>,
  summary: Record<string, unknown>,
  statusValue: string,
  parsed: ParsedCatalogImportInput,
): AppliedCatalogImport | null {
  const status =
    statusValue === "accepted" ||
    statusValue === "duplicate" ||
    statusValue === "idempotent"
      ? statusValue
      : null;
  const batchId = canonicalResponseUuid(stringField(data, "batchId"));
  const acceptedItemCount = integerField(summary, "acceptedItemCount");
  const duplicateItemCount = integerField(summary, "duplicateItemCount");
  const productCount = integerField(summary, "productCount");
  if (
    !status ||
    !batchId ||
    acceptedItemCount === null ||
    duplicateItemCount === null ||
    productCount === null ||
    acceptedItemCount < 0 ||
    duplicateItemCount < 0 ||
    productCount < 0 ||
    !Array.isArray(data.items) ||
    !Array.isArray(data.remoteProductIds) ||
    !Array.isArray(data.remotePriceIds) ||
    data.items.length !== parsed.items.length
  ) {
    return null;
  }

  const expectedByClientId = new Map(
    parsed.items.map((item) => [item.clientItemId, item]),
  );
  const changedItems = parsed.items.filter(
    (item) => item.changeKind === "new" || item.changeKind === "updated",
  );
  const changedByClientId = new Map(
    changedItems.map((item) => [item.clientItemId, item]),
  );
  const productMapCandidates =
    status === "accepted" ? changedByClientId : expectedByClientId;
  const items = data.items.map((value) => {
    if (!isRecord(value)) return null;
    const clientItemId = stringField(value, "clientItemId");
    const expected = expectedByClientId.get(clientItemId);
    const barcode = stringField(value, "barcode");
    const responseStatus = stringField(value, "status");
    const originalStatus =
      expected?.changeKind === "new" || expected?.changeKind === "updated"
        ? "accepted"
        : "skipped";
    const responseStatusValid =
      status === "accepted"
        ? responseStatus === originalStatus
        : responseStatus === "duplicate" || responseStatus === originalStatus;
    const priceType = normalizedPriceType(stringField(value, "priceType"));
    const remoteProductId = stringField(value, "remoteProductId");
    const remotePriceId = stringField(value, "remotePriceId");
    if (
      !expected ||
      barcode !== expected.barcode ||
      !responseStatusValid ||
      (remoteProductId && !canonicalResponseUuid(remoteProductId)) ||
      (remotePriceId && !canonicalResponseUuid(remotePriceId))
    ) {
      return null;
    }
    return {
      ...(barcode ? { barcode } : {}),
      clientItemId,
      ...(priceType ? { priceType } : {}),
      ...(remotePriceId ? { remotePriceId } : {}),
      ...(remoteProductId ? { remoteProductId } : {}),
      status: responseStatus as AppliedCatalogImport["items"][number]["status"],
    } as AppliedCatalogImport["items"][number];
  });
  if (
    items.some((item) => item === null) ||
    new Set(items.map((item) => item?.clientItemId)).size !== items.length
  ) {
    return null;
  }

  const remoteProductIds = data.remoteProductIds.map((value) => {
    if (!isRecord(value)) return null;
    const clientItemId = stringField(value, "clientItemId");
    const barcode = stringField(value, "barcode");
    const remoteProductId = canonicalResponseUuid(
      stringField(value, "remoteProductId"),
    );
    const expected = productMapCandidates.get(clientItemId);
    return expected && barcode === expected.barcode && remoteProductId
      ? { barcode, clientItemId, remoteProductId }
      : null;
  });
  if (
    remoteProductIds.some((item) => item === null) ||
    (status === "accepted" &&
      remoteProductIds.length !== changedItems.length) ||
    remoteProductIds.length > parsed.items.length ||
    new Set(remoteProductIds.map((item) => item?.clientItemId)).size !==
      remoteProductIds.length ||
    new Set(remoteProductIds.map((item) => item?.remoteProductId)).size !==
      remoteProductIds.length
  ) {
    return null;
  }
  const productIdByClientId = new Map(
    remoteProductIds.map((item) => [item?.clientItemId, item?.remoteProductId]),
  );
  if (
    changedItems.some(
      (item) => !productIdByClientId.has(item.clientItemId),
    )
  ) {
    return null;
  }
  const requiredPriceKeys = new Set(
    changedItems.flatMap((item) => [
      ...(item.purchasePrice === null
        ? []
        : [`${item.clientItemId}:purchase`]),
      ...(item.retailPrice === null
        ? []
        : [`${item.clientItemId}:retail`]),
    ]),
  );
  const allowedPriceKeys =
    status === "accepted"
      ? requiredPriceKeys
      : new Set(
          parsed.items.flatMap((item) => [
            ...(item.purchasePrice === null
              ? []
              : [`${item.clientItemId}:purchase`]),
            ...(item.retailPrice === null
              ? []
              : [`${item.clientItemId}:retail`]),
          ]),
        );
  const remotePriceIds = data.remotePriceIds.map((value) => {
    if (!isRecord(value)) return null;
    const clientItemId = stringField(value, "clientItemId");
    const barcode = stringField(value, "barcode");
    const priceType = normalizedPriceType(stringField(value, "priceType"));
    const remotePriceId = canonicalResponseUuid(
      stringField(value, "remotePriceId"),
    );
    const remoteProductId = canonicalResponseUuid(
      stringField(value, "remoteProductId"),
    );
    const expected = productMapCandidates.get(clientItemId);
    if (
      !expected ||
      barcode !== expected.barcode ||
      !priceType ||
      !allowedPriceKeys.has(`${clientItemId}:${priceType}`) ||
      !remotePriceId ||
      !remoteProductId ||
      remoteProductId !== productIdByClientId.get(clientItemId)
    ) {
      return null;
    }
    return {
      barcode,
      clientItemId,
      priceType,
      remotePriceId,
      remoteProductId,
    } as AppliedCatalogImport["remotePriceIds"][number];
  });
  if (
    remotePriceIds.some((item) => item === null) ||
    (status === "accepted" &&
      remotePriceIds.length !== requiredPriceKeys.size) ||
    remotePriceIds.length > allowedPriceKeys.size ||
    new Set(
      remotePriceIds.map((item) => `${item?.clientItemId}:${item?.priceType}`),
    ).size !== remotePriceIds.length ||
    new Set(remotePriceIds.map((item) => item?.remotePriceId)).size !==
      remotePriceIds.length
  ) {
    return null;
  }
  const returnedPriceKeys = new Set(
    remotePriceIds.map((item) => `${item?.clientItemId}:${item?.priceType}`),
  );
  if (
    Array.from(requiredPriceKeys).some((key) => !returnedPriceKeys.has(key))
  ) {
    return null;
  }

  const priceIdByKey = new Map(
    remotePriceIds.map((item) => [
      `${item?.clientItemId}:${item?.priceType}`,
      item?.remotePriceId,
    ]),
  );
  for (const item of items) {
    if (!item) return null;
    const expected = expectedByClientId.get(item.clientItemId);
    if (!expected) return null;
    const changed = changedByClientId.has(item.clientItemId);
    if (!changed) {
      if (status === "accepted") {
        if (item.remoteProductId || item.remotePriceId || item.priceType) {
          return null;
        }
        continue;
      }
      const mappedProductId = productIdByClientId.get(item.clientItemId);
      if (
        (item.remoteProductId || mappedProductId) &&
        item.remoteProductId !== mappedProductId
      ) {
        return null;
      }
      if (
        item.priceType ||
        item.remotePriceId
      ) {
        if (
          !item.priceType ||
          !item.remotePriceId ||
          item.remotePriceId !==
            priceIdByKey.get(`${item.clientItemId}:${item.priceType}`)
        ) {
          return null;
        }
      }
      if (item.remoteProductId && !productIdByClientId.has(item.clientItemId)) {
        return null;
      }
      continue;
    }
    if (item.remoteProductId !== productIdByClientId.get(item.clientItemId)) {
      return null;
    }
    const chosenPriceType = expected.retailPrice !== null
      ? "retail"
      : expected.purchasePrice !== null
        ? "purchase"
        : null;
    if (
      chosenPriceType === null
        ? Boolean(item.priceType || item.remotePriceId)
        : item.priceType !== chosenPriceType ||
          item.remotePriceId !==
            priceIdByKey.get(`${item.clientItemId}:${chosenPriceType}`)
    ) {
      return null;
    }
  }

  const expectedAccepted = status === "accepted" ? changedItems.length : 0;
  const expectedDuplicate = status === "accepted" ? 0 : changedItems.length;
  if (
    acceptedItemCount !== expectedAccepted ||
    duplicateItemCount !== expectedDuplicate ||
    productCount !== changedItems.length
  ) {
    return null;
  }

  return {
    acceptedItemCount,
    batchId,
    duplicateItemCount,
    items: items as AppliedCatalogImport["items"],
    productCount,
    remotePriceIds: remotePriceIds as AppliedCatalogImport["remotePriceIds"],
    remoteProductIds:
      remoteProductIds as AppliedCatalogImport["remoteProductIds"],
    status,
  };
}

function normalizedPriceType(value: string): "purchase" | "retail" | undefined {
  const normalized = value.trim().toLowerCase();
  return normalized === "purchase" || normalized === "retail"
    ? normalized
    : undefined;
}

function successResponse(input: {
  applied: AppliedCatalogImport;
  parsed: ParsedCatalogImportInput;
  requestId?: string;
  serverTime: string;
  shop: ShopRow;
}): PosCatalogImportEndpointResult {
  const serverImportId = input.applied.batchId;
  const serverRequestId = input.requestId ?? "";

  return {
    body: {
      batch: {
        attemptCount: input.parsed.attemptCount,
        clientImportId: input.parsed.clientImportId,
        idempotencyKey: input.parsed.idempotencyKey,
        payloadHash: input.parsed.declaredPayloadHash ?? input.parsed.payloadHash,
        posCatalogImportBatchId: input.applied.batchId,
        serverImportId,
        serverRequestId,
        status: input.applied.status,
      },
      code: "success",
      items: input.applied.items.map((item) => ({
        ...(item.barcode ? { barcode: item.barcode } : {}),
        clientItemId: item.clientItemId,
        ...(item.priceType ? { priceType: item.priceType } : {}),
        ...(item.remotePriceId ? { remotePriceId: item.remotePriceId } : {}),
        ...(item.remoteProductId ? { remoteProductId: item.remoteProductId } : {}),
        status: input.applied.status === "accepted" ? item.status : "duplicate",
      })),
      nextAction: "catalog_pull",
      ok: true,
      pullRequired: true,
      remotePriceIds: input.applied.remotePriceIds,
      remoteProductIds: input.applied.remoteProductIds,
      serverImportId,
      serverRequestId,
      serverTime: input.serverTime,
      shop: buildPosShopPayload(input.shop),
      summary: {
        acceptedItemCount: input.applied.acceptedItemCount,
        duplicateItemCount: input.applied.duplicateItemCount,
        productCount: input.applied.productCount,
      },
    },
    status: 200,
  };
}

export async function handlePosCatalogImportSync(
  input: unknown,
  meta: PosCatalogImportRequestMeta = {},
): Promise<PosCatalogImportEndpointResult> {
  const serverTime = new Date().toISOString();
  const parsed = parseCatalogImportInput(input);

  if (!parsed) {
    return failure("validation_failed", 400);
  }

  const supabase = await getSupabaseForPosCatalogImport();

  if (!supabase) {
    return failure("not_configured", 503);
  }

  const auth = await validatePosCatalogImportAuth(supabase, parsed, meta);

  if (auth.result) {
    return auth.result;
  }

  const { session, shop, staff } = auth.context;
  const appliedResult = await applyCatalogImport(supabase, parsed, auth.context, meta);

  if (appliedResult.error) {
    if (appliedResult.error === "conflict") {
      return failure("conflict", 409);
    }

    const mappingChanged = appliedResult.error === "scope_changed";
    const notConfigured = appliedResult.error === "not_configured";
    const authDenied = appliedResult.error === "auth_denied";

    return auditedFailure(supabase, {
      code: mappingChanged ? "not_configured" : appliedResult.error,
      metadata: {
        ...requestMetadata(meta),
        item_count: parsed.items.length,
        ...(mappingChanged ? { reason: "catalog_scope_changed" } : {}),
        ...(authDenied ? { reason: "runtime_lease_changed" } : {}),
      },
      shopId: session.shop_id,
      staffId: staff.staff_id,
      status:
        authDenied
          ? 401
          : appliedResult.error === "validation_failed"
          ? 400
          : mappingChanged
            ? 409
            : notConfigured
              ? 503
              : 500,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }

  return successResponse({
    applied: appliedResult.applied,
    parsed,
    requestId: meta.requestId,
    serverTime,
    shop,
  });
}
