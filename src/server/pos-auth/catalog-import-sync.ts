import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import type { Json, Tables, TablesInsert } from "@/lib/supabase/database.types";
import {
  buildPosShopPayload,
  POS_SHOP_SELECT,
  type PosShopPayload,
  type PosShopPayloadRow,
} from "./shop-payload";
import { POS_CATALOG_IMPORT_SCHEMA_VERSION } from "./pos-contract";
import { verifyPosSecret } from "./tokens";

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
type InventorySourceRow = Pick<
  Tables<"shop_inventory_sources">,
  "mapping_state" | "owner_user_id" | "shop_id"
>;
type ProductRow = Pick<
  Tables<"inventory_products">,
  | "barcode"
  | "category_id"
  | "id"
  | "item_number"
  | "owner_user_id"
  | "product_name"
  | "purchase_price"
  | "retail_price"
  | "second_product_name"
  | "shop_id"
  | "stock_quantity"
  | "supplier_id"
>;
type CategoryRow = Pick<
  Tables<"inventory_categories">,
  "id" | "name" | "owner_user_id" | "shop_id"
>;
type SupplierRow = Pick<
  Tables<"inventory_suppliers">,
  "id" | "name" | "owner_user_id" | "shop_id"
>;
type ExistingImportBatchRow = Pick<
  Tables<"pos_catalog_import_batches">,
  | "client_import_id"
  | "idempotency_key"
  | "payload_hash"
  | "pos_catalog_import_batch_id"
  | "status"
>;

type PosCatalogImportFailureCode =
  | "auth_denied"
  | "conflict"
  | "db_failure"
  | "not_configured"
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
          clientImportId: string;
          posCatalogImportBatchId: string;
          status: "accepted" | "duplicate" | "idempotent";
        };
        code: "success";
        items: Array<{
          clientItemId: string;
          code?: string;
          remoteProductId?: string;
          status: "accepted" | "duplicate" | "skipped";
        }>;
        ok: true;
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
  items: Array<{
    clientItemId: string;
    remoteProductId?: string;
    status: "accepted" | "skipped";
  }>;
  productCount: number;
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
  const normalized = normalizeText(value, 200);
  return SAFE_ID_PATTERN.test(normalized) && !SENSITIVE_TEXT_PATTERN.test(normalized)
    ? normalized
    : "";
}

function normalizeHashText(value: string) {
  const normalized = normalizeText(value, 128);
  return /^[A-Za-z0-9:_-]{16,128}$/.test(normalized) &&
    !SENSITIVE_TEXT_PATTERN.test(normalized)
    ? normalized
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

function catalogTimestampText(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(
    date.getUTCSeconds(),
  )}`;
}

function stableHash(value: unknown) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex")}`;
}

function hasDuplicateValues(values: readonly string[]) {
  return new Set(values).size !== values.length;
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
  const barcode = normalizeText(stringField(input, "barcode"), 80);
  const rowNumber = integerField(input, "rowNumber", "row_number") ?? index + 1;
  const productName = normalizedOptionalText(
    stringField(input, "productName", "product_name"),
    240,
  );
  const purchasePrice = nonNegativeNumber(
    numberField(input, "purchasePrice", "purchase_price"),
  );
  const retailPrice = nonNegativeNumber(
    numberField(input, "retailPrice", "retail_price"),
  );
  const quantity = nonNegativeNumber(numberField(input, "quantity", "stockQuantity"));

  if (!changeKind || !clientItemId || rowNumber <= 0) {
    return null;
  }

  if (
    (changeKind === "new" || changeKind === "updated") &&
    (!barcode || !productName)
  ) {
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
    category: normalizedOptionalText(stringField(input, "category"), 120),
    changeKind,
    clientItemId,
    diffSummary: normalizedOptionalText(
      stringField(input, "diffSummary", "diff_summary"),
      500,
    ),
    itemNumber: normalizedOptionalText(stringField(input, "itemNumber", "item_number"), 120),
    productName,
    purchasePrice,
    quantity,
    retailPrice,
    rowNumber,
    secondProductName: normalizedOptionalText(
      stringField(input, "secondProductName", "second_product_name"),
      240,
    ),
    supplier: normalizedOptionalText(stringField(input, "supplier"), 120),
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
    hasDuplicateValues(
      parsedItems
        .filter((item) => item.changeKind === "new" || item.changeKind === "updated")
        .map((item) => item.barcode.toUpperCase()),
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
  const shopCode =
    normalizedOptionalText(stringField(input, "shopCode", "shop_code"), 80) ??
    undefined;
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
      staff.credential_status === "active" &&
      !staff.must_change_credential &&
      !isFutureTimestamp(staff.locked_until),
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
  const { error } = await supabase.from("audit_logs").insert({
    actor_profile_id: null,
    actor_staff_id: input.staffId ?? null,
    event_key:
      input.result === "success"
        ? "pos.catalog.import_sync.success"
        : "pos.catalog.import_sync.failure",
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
        code: "auth_denied",
        metadata: requestMetadata(meta),
        shopId: session?.shop_id,
        status: 401,
        targetId: session?.pos_session_id,
        targetType: session ? "pos_session" : undefined,
      }),
    };
  }

  const [credentialResult, shopResult, staffResult, deviceResult, mappingResult] =
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
        .select(POS_SHOP_SELECT)
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
      supabase
        .from("shop_inventory_sources")
        .select("shop_id,owner_user_id,mapping_state")
        .eq("shop_id", session.shop_id)
        .is("disabled_at", null)
        .limit(10),
    ]);

  if (
    credentialResult.error ||
    shopResult.error ||
    staffResult.error ||
    deviceResult.error ||
    mappingResult.error
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

  const credential = credentialResult.data;
  const shop = shopResult.data;
  const staff = staffResult.data;
  const device = deviceResult.data;
  const mappedSource = ((mappingResult.data ?? []) as InventorySourceRow[]).find(
    (row) => row.mapping_state === "mapped" && row.owner_user_id,
  );
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
        code: "auth_denied",
        metadata: {
          ...requestMetadata(meta),
          app_version_present: Boolean(parsed.appVersion),
          device_resolved: Boolean(device),
          shop_code_matches: !parsed.shopCode || parsed.shopCode === shop?.shop_code,
          shop_resolved: Boolean(shop),
          staff_resolved: Boolean(staff),
        },
        shopId: session.shop_id,
        staffId: staff?.staff_id,
        status: 401,
        targetId: session.pos_session_id,
        targetType: "pos_session",
      }),
    };
  }

  if (!mappedSource?.owner_user_id) {
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
      ownerUserId: mappedSource.owner_user_id,
      session,
      shop,
      staff,
    },
  };
}

async function findExistingImportBatch(
  supabase: SupabaseAdminClient,
  parsed: ParsedCatalogImportInput,
  session: PosSessionRow,
) {
  const [byIdempotency, byClientImport] = await Promise.all([
    supabase
      .from("pos_catalog_import_batches")
      .select(
        "pos_catalog_import_batch_id,client_import_id,idempotency_key,payload_hash,status",
      )
      .eq("shop_id", session.shop_id)
      .eq("shop_device_id", session.shop_device_id)
      .eq("idempotency_key", parsed.idempotencyKey)
      .maybeSingle<ExistingImportBatchRow>(),
    supabase
      .from("pos_catalog_import_batches")
      .select(
        "pos_catalog_import_batch_id,client_import_id,idempotency_key,payload_hash,status",
      )
      .eq("shop_id", session.shop_id)
      .eq("shop_device_id", session.shop_device_id)
      .eq("client_import_id", parsed.clientImportId)
      .maybeSingle<ExistingImportBatchRow>(),
  ]);

  if (byIdempotency.error || byClientImport.error) {
    return { data: null, error: byIdempotency.error ?? byClientImport.error };
  }

  return { data: byIdempotency.data ?? byClientImport.data ?? null, error: null };
}

async function ensureCatalogNameRow(
  supabase: SupabaseAdminClient,
  input: {
    name: string | null;
    ownerUserId: string;
    shopId: string;
    table: "inventory_categories" | "inventory_suppliers";
  },
) {
  if (!input.name) {
    return { error: null, id: null };
  }

  const selectColumns = "id,shop_id,owner_user_id,name";
  const [shopScoped, legacyScoped] = await Promise.all([
    supabase
      .from(input.table)
      .select(selectColumns)
      .eq("shop_id", input.shopId)
      .eq("owner_user_id", input.ownerUserId)
      .eq("name", input.name)
      .is("deleted_at", null)
      .maybeSingle<CategoryRow | SupplierRow>(),
    supabase
      .from(input.table)
      .select(selectColumns)
      .is("shop_id", null)
      .eq("owner_user_id", input.ownerUserId)
      .eq("name", input.name)
      .is("deleted_at", null)
      .maybeSingle<CategoryRow | SupplierRow>(),
  ]);

  if (shopScoped.error || legacyScoped.error) {
    return { error: shopScoped.error ?? legacyScoped.error, id: null };
  }

  const existing = shopScoped.data ?? legacyScoped.data;

  if (existing) {
    return { error: null, id: existing.id };
  }

  const insertResult = await supabase
    .from(input.table)
    .insert({
      name: input.name,
      owner_user_id: input.ownerUserId,
      shop_id: input.shopId,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle<Pick<CategoryRow | SupplierRow, "id">>();

  return {
    error: insertResult.error,
    id: insertResult.data?.id ?? null,
  };
}

async function loadExistingProductsByBarcode(
  supabase: SupabaseAdminClient,
  input: {
    barcodes: readonly string[];
    ownerUserId: string;
    shopId: string;
  },
) {
  if (input.barcodes.length === 0) {
    return { error: null, rows: [] as ProductRow[] };
  }

  const columns =
    "id,shop_id,owner_user_id,barcode,item_number,product_name,second_product_name,purchase_price,retail_price,stock_quantity,supplier_id,category_id";
  const [shopScoped, legacyScoped] = await Promise.all([
    supabase
      .from("inventory_products")
      .select(columns)
      .eq("shop_id", input.shopId)
      .eq("owner_user_id", input.ownerUserId)
      .in("barcode", input.barcodes)
      .is("deleted_at", null),
    supabase
      .from("inventory_products")
      .select(columns)
      .is("shop_id", null)
      .eq("owner_user_id", input.ownerUserId)
      .in("barcode", input.barcodes)
      .is("deleted_at", null),
  ]);

  if (shopScoped.error || legacyScoped.error) {
    return { error: shopScoped.error ?? legacyScoped.error, rows: [] };
  }

  return {
    error: null,
    rows: [
      ...((shopScoped.data ?? []) as ProductRow[]),
      ...((legacyScoped.data ?? []) as ProductRow[]),
    ],
  };
}

async function insertPriceRows(
  supabase: SupabaseAdminClient,
  input: {
    batchCreatedAt: string;
    ownerUserId: string;
    rows: Array<{
      productId: string;
      purchasePrice: number | null;
      retailPrice: number | null;
      shopId: string | null;
    }>;
  },
) {
  const effectiveAt = catalogTimestampText(input.batchCreatedAt);
  const createdAt = catalogTimestampText(new Date().toISOString());
  const priceRows: Array<TablesInsert<"inventory_product_prices">> = [];

  for (const row of input.rows) {
    if (row.purchasePrice !== null) {
      priceRows.push({
        created_at: createdAt,
        effective_at: effectiveAt,
        id: randomUUID(),
        owner_user_id: input.ownerUserId,
        price: row.purchasePrice,
        product_id: row.productId,
        shop_id: row.shopId,
        source: "pos_supplier_excel",
        type: "PURCHASE",
      });
    }

    if (row.retailPrice !== null) {
      priceRows.push({
        created_at: createdAt,
        effective_at: effectiveAt,
        id: randomUUID(),
        owner_user_id: input.ownerUserId,
        price: row.retailPrice,
        product_id: row.productId,
        shop_id: row.shopId,
        source: "pos_supplier_excel",
        type: "RETAIL",
      });
    }
  }

  if (priceRows.length === 0) {
    return null;
  }

  const { error } = await supabase.from("inventory_product_prices").insert(priceRows);
  return error;
}

async function applyCatalogImport(
  supabase: SupabaseAdminClient,
  parsed: ParsedCatalogImportInput,
  context: PosCatalogImportAuthContext,
): Promise<
  | { applied: AppliedCatalogImport; error?: never }
  | { applied?: never; error: "db_failure" | "validation_failed" }
> {
  const writeItems = parsed.items.filter(
    (item) => item.changeKind === "new" || item.changeKind === "updated",
  );
  const barcodes = Array.from(new Set(writeItems.map((item) => item.barcode)));
  const productsResult = await loadExistingProductsByBarcode(supabase, {
    barcodes,
    ownerUserId: context.ownerUserId,
    shopId: context.session.shop_id,
  });

  if (productsResult.error) {
    return { error: "db_failure" };
  }

  const productByBarcode = new Map(
    productsResult.rows.map((row) => [row.barcode.toUpperCase(), row]),
  );
  const priceInputs: Parameters<typeof insertPriceRows>[1]["rows"] = [];
  const itemAcks: AppliedCatalogImport["items"] = [];
  let acceptedItemCount = 0;

  for (const item of parsed.items) {
    if (item.changeKind === "skipped" || item.changeKind === "no_change") {
      itemAcks.push({ clientItemId: item.clientItemId, status: "skipped" });
      continue;
    }

    const existing = productByBarcode.get(item.barcode.toUpperCase()) ?? null;
    const [categoryResult, supplierResult] = await Promise.all([
      ensureCatalogNameRow(supabase, {
        name: item.category,
        ownerUserId: context.ownerUserId,
        shopId: context.session.shop_id,
        table: "inventory_categories",
      }),
      ensureCatalogNameRow(supabase, {
        name: item.supplier,
        ownerUserId: context.ownerUserId,
        shopId: context.session.shop_id,
        table: "inventory_suppliers",
      }),
    ]);

    if (categoryResult.error || supplierResult.error) {
      return { error: "db_failure" };
    }

    const nextProduct = {
      barcode: item.barcode,
      category_id: categoryResult.id ?? existing?.category_id ?? null,
      deleted_at: null,
      item_number: item.itemNumber ?? existing?.item_number ?? null,
      owner_user_id: context.ownerUserId,
      product_name: item.productName ?? existing?.product_name ?? item.barcode,
      purchase_price: item.purchasePrice ?? existing?.purchase_price ?? null,
      retail_price: item.retailPrice ?? existing?.retail_price ?? null,
      second_product_name:
        item.secondProductName ?? existing?.second_product_name ?? null,
      shop_id: existing?.shop_id ?? context.session.shop_id,
      stock_quantity: item.quantity ?? existing?.stock_quantity ?? null,
      supplier_id: supplierResult.id ?? existing?.supplier_id ?? null,
      updated_at: new Date().toISOString(),
    };
    let productId: string;

    if (existing) {
      const updateResult = await supabase
        .from("inventory_products")
        .update(nextProduct)
        .eq("id", existing.id)
        .eq("owner_user_id", context.ownerUserId)
        .select("id,shop_id,owner_user_id,barcode,item_number,product_name,second_product_name,purchase_price,retail_price,stock_quantity,supplier_id,category_id")
        .maybeSingle<ProductRow>();

      if (updateResult.error || !updateResult.data) {
        return { error: "db_failure" };
      }

      productId = updateResult.data.id;
      productByBarcode.set(item.barcode.toUpperCase(), updateResult.data);
    } else {
      const insertResult = await supabase
        .from("inventory_products")
        .insert(nextProduct)
        .select("id,shop_id,owner_user_id,barcode,item_number,product_name,second_product_name,purchase_price,retail_price,stock_quantity,supplier_id,category_id")
        .maybeSingle<ProductRow>();

      if (insertResult.error || !insertResult.data) {
        return { error: "db_failure" };
      }

      productId = insertResult.data.id;
      productByBarcode.set(item.barcode.toUpperCase(), insertResult.data);
    }

    priceInputs.push({
      productId,
      purchasePrice:
        item.purchasePrice !== null && item.purchasePrice !== existing?.purchase_price
          ? item.purchasePrice
          : null,
      retailPrice:
        item.retailPrice !== null && item.retailPrice !== existing?.retail_price
          ? item.retailPrice
          : null,
      shopId: nextProduct.shop_id,
    });
    itemAcks.push({
      clientItemId: item.clientItemId,
      remoteProductId: productId,
      status: "accepted",
    });
    acceptedItemCount++;
  }

  const priceError = await insertPriceRows(supabase, {
    batchCreatedAt: parsed.batchCreatedAt,
    ownerUserId: context.ownerUserId,
    rows: priceInputs,
  });

  if (priceError) {
    return { error: "db_failure" };
  }

  return {
    applied: {
      acceptedItemCount,
      items: itemAcks,
      productCount: writeItems.length,
    },
  };
}

async function createProcessingBatch(
  supabase: SupabaseAdminClient,
  parsed: ParsedCatalogImportInput,
  context: PosCatalogImportAuthContext,
  meta: PosCatalogImportRequestMeta,
) {
  const insert: TablesInsert<"pos_catalog_import_batches"> = {
    client_import_id: parsed.clientImportId,
    idempotency_key: parsed.idempotencyKey,
    metadata_redacted: {
      ...requestMetadata(meta),
      app_version_present: Boolean(parsed.appVersion),
      declared_payload_hash_present: Boolean(parsed.declaredPayloadHash),
      item_count: parsed.items.length,
      source_file_present: Boolean(parsed.sourceFileName),
      summary_new_products: parsed.summary.newProducts,
      summary_updated_products: parsed.summary.updatedProducts,
    },
    payload_hash: parsed.payloadHash,
    pos_session_id: context.session.pos_session_id,
    product_count: 0,
    schema_version: parsed.schemaVersion,
    shop_device_id: context.session.shop_device_id,
    shop_id: context.session.shop_id,
    source: parsed.source,
    staff_id: context.staff.staff_id,
    status: "processing",
  };
  const result = await supabase
    .from("pos_catalog_import_batches")
    .insert(insert)
    .select("pos_catalog_import_batch_id")
    .maybeSingle<Pick<Tables<"pos_catalog_import_batches">, "pos_catalog_import_batch_id">>();

  return { error: result.error, id: result.data?.pos_catalog_import_batch_id ?? null };
}

async function updateBatchStatus(
  supabase: SupabaseAdminClient,
  input: {
    acceptedItemCount?: number;
    batchId: string;
    duplicateItemCount?: number;
    productCount?: number;
    status: "accepted" | "failed" | "processing";
  },
) {
  const { error } = await supabase
    .from("pos_catalog_import_batches")
    .update({
      ...(input.acceptedItemCount !== undefined
        ? { accepted_item_count: input.acceptedItemCount }
        : {}),
      ...(input.duplicateItemCount !== undefined
        ? { duplicate_item_count: input.duplicateItemCount }
        : {}),
      ...(input.productCount !== undefined ? { product_count: input.productCount } : {}),
      status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq("pos_catalog_import_batch_id", input.batchId);

  return error;
}

function successResponse(input: {
  applied: AppliedCatalogImport;
  batchId: string;
  parsed: ParsedCatalogImportInput;
  serverTime: string;
  shop: ShopRow;
  status: "accepted" | "duplicate" | "idempotent";
}): PosCatalogImportEndpointResult {
  return {
    body: {
      batch: {
        clientImportId: input.parsed.clientImportId,
        posCatalogImportBatchId: input.batchId,
        status: input.status,
      },
      code: "success",
      items: input.applied.items.map((item) => ({
        clientItemId: item.clientItemId,
        ...(item.remoteProductId ? { remoteProductId: item.remoteProductId } : {}),
        status: input.status === "accepted" ? item.status : "duplicate",
      })),
      ok: true,
      serverTime: input.serverTime,
      shop: buildPosShopPayload(input.shop),
      summary: {
        acceptedItemCount:
          input.status === "accepted" ? input.applied.acceptedItemCount : 0,
        duplicateItemCount:
          input.status === "accepted" ? 0 : input.parsed.items.length,
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
  const supabase = await getSupabaseForPosCatalogImport();

  if (!supabase) {
    return failure("not_configured", 503);
  }

  const parsed = parseCatalogImportInput(input);

  if (!parsed) {
    return auditedFailure(supabase, {
      code: "validation_failed",
      metadata: requestMetadata(meta),
      status: 400,
    });
  }

  const auth = await validatePosCatalogImportAuth(supabase, parsed, meta);

  if (auth.result) {
    return auth.result;
  }

  const { session, shop, staff } = auth.context;
  const existingBatch = await findExistingImportBatch(supabase, parsed, session);

  if (existingBatch.error) {
    return auditedFailure(supabase, {
      code: "db_failure",
      metadata: requestMetadata(meta),
      shopId: session.shop_id,
      staffId: staff.staff_id,
      status: 500,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }

  if (existingBatch.data) {
    const duplicate =
      existingBatch.data.payload_hash === parsed.payloadHash &&
      existingBatch.data.client_import_id === parsed.clientImportId &&
      existingBatch.data.idempotency_key === parsed.idempotencyKey;

    const auditOk = await writePosCatalogImportAudit(supabase, {
      code: duplicate ? "duplicate_batch" : "conflict_batch",
      metadata: {
        ...requestMetadata(meta),
        item_count: parsed.items.length,
      },
      result: duplicate ? "success" : "blocked",
      severity: duplicate ? "info" : "warning",
      shopId: session.shop_id,
      staffId: staff.staff_id,
      targetId: existingBatch.data.pos_catalog_import_batch_id,
      targetType: "pos_catalog_import_batch",
    });

    if (!auditOk) {
      return failure("db_failure", 500);
    }

    if (!duplicate) {
      return failure("conflict", 409);
    }

    if (existingBatch.data.status === "processing") {
      return failure("db_failure", 500);
    }

    if (existingBatch.data.status !== "failed") {
      return successResponse({
        applied: {
          acceptedItemCount: 0,
          items: parsed.items.map((item) => ({
            clientItemId: item.clientItemId,
            status: "skipped",
          })),
          productCount: parsed.items.filter(
            (item) => item.changeKind === "new" || item.changeKind === "updated",
          ).length,
        },
        batchId: existingBatch.data.pos_catalog_import_batch_id,
        parsed,
        serverTime,
        shop,
        status: "duplicate",
      });
    }

    const markProcessingError = await updateBatchStatus(supabase, {
      batchId: existingBatch.data.pos_catalog_import_batch_id,
      status: "processing",
    });

    if (markProcessingError) {
      return failure("db_failure", 500);
    }
  }

  const batchId =
    existingBatch.data?.status === "failed"
      ? existingBatch.data.pos_catalog_import_batch_id
      : (await createProcessingBatch(supabase, parsed, auth.context, meta)).id;

  if (!batchId) {
    return auditedFailure(supabase, {
      code: "db_failure",
      metadata: requestMetadata(meta),
      shopId: session.shop_id,
      staffId: staff.staff_id,
      status: 500,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }

  const appliedResult = await applyCatalogImport(supabase, parsed, auth.context);

  if (appliedResult.error) {
    await updateBatchStatus(supabase, { batchId, status: "failed" });
    return auditedFailure(supabase, {
      code: appliedResult.error,
      metadata: {
        ...requestMetadata(meta),
        item_count: parsed.items.length,
      },
      shopId: session.shop_id,
      staffId: staff.staff_id,
      status: appliedResult.error === "validation_failed" ? 400 : 500,
      targetId: batchId,
      targetType: "pos_catalog_import_batch",
    });
  }

  const updateError = await updateBatchStatus(supabase, {
    acceptedItemCount: appliedResult.applied.acceptedItemCount,
    batchId,
    duplicateItemCount: 0,
    productCount: appliedResult.applied.productCount,
    status: "accepted",
  });

  if (updateError) {
    return auditedFailure(supabase, {
      code: "db_failure",
      metadata: requestMetadata(meta),
      shopId: session.shop_id,
      staffId: staff.staff_id,
      status: 500,
      targetId: batchId,
      targetType: "pos_catalog_import_batch",
    });
  }

  const auditOk = await writePosCatalogImportAudit(supabase, {
    code: "accepted",
    metadata: {
      ...requestMetadata(meta),
      accepted_item_count: appliedResult.applied.acceptedItemCount,
      item_count: parsed.items.length,
      product_count: appliedResult.applied.productCount,
    },
    result: "success",
    severity: "info",
    shopId: session.shop_id,
    staffId: staff.staff_id,
    targetId: batchId,
    targetType: "pos_catalog_import_batch",
  });

  if (!auditOk) {
    return failure("db_failure", 500);
  }

  return successResponse({
    applied: appliedResult.applied,
    batchId,
    parsed,
    serverTime,
    shop,
    status: "accepted",
  });
}
