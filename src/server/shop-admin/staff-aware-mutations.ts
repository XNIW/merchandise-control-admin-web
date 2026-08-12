import "server-only";

import { Buffer } from "node:buffer";
import type { Json } from "@/lib/supabase/database.types";
import {
  mapShopAdminRpcResult,
  shopAdminActionResult,
  type ShopAdminActionContext,
  type ShopAdminActionResult,
} from "./action-context";
import {
  isShopStaffWebPermission,
  SHOP_STAFF_WEB_ROLE_TEMPLATES,
  type ShopStaffWebPermission,
  type ShopStaffWebRoleTemplateKey,
} from "./staff-web-permissions";
import {
  callStaffWebAuditEvent,
  callStaffWebCatalogMutation,
  callStaffWebRevisionGuardedProductArchivedState,
  callStaffWebRevisionGuardedProductUpdate,
  callStaffWebLifecycleMutation,
} from "./staff-web-lease-bound-rpc";

type StaffAwareContext = Extract<
  ShopAdminActionContext,
  { principalKind: "pos_staff_manager"; status: "ready" }
>;

type PersonalAwareContext = Extract<
  ShopAdminActionContext,
  { principalKind: "personal_account"; status: "ready" }
>;

type JsonRecord = { [key: string]: Json | undefined };

type StaffLifecycleContext = StaffAwareContext | PersonalAwareContext;

type StaffLifecycleOperation =
  | "staff_create"
  | "staff_credential_reset"
  | "staff_status_set"
  | "staff_credential_rotation_force"
  | "staff_lockout_clear"
  | "staff_web_access_revoke"
  | "staff_web_sessions_revoke"
  | "staff_role_permissions_replace"
  | "device_register"
  | "device_rename"
  | "device_status_set";

function staffCatalogRpc(
  context: StaffAwareContext,
  operation: string,
  payload: JsonRecord,
) {
  return callStaffWebCatalogMutation(context, operation, payload);
}

async function staffCatalogMutation(
  context: StaffAwareContext,
  operation: string,
  payload: JsonRecord,
) {
  const { data, error } = await staffCatalogRpc(context, operation, payload);
  if (error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }
  const result = mapShopAdminRpcResult(data);
  const expectedTargetId =
    typeof payload.id === "string"
      ? payload.id
      : typeof payload.productId === "string"
        ? payload.productId
        : undefined;
  const createRequiresTarget =
    operation === "supplier_create" ||
    operation === "category_create" ||
    operation === "product_create";
  const rpcRoot =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  const rpcPayload =
    rpcRoot?.payload &&
    typeof rpcRoot.payload === "object" &&
    !Array.isArray(rpcRoot.payload)
      ? (rpcRoot.payload as Record<string, unknown>)
      : null;
  const assignmentCountIsBound =
    operation !== "product_assignments" ||
    (Array.isArray(payload.productIds) &&
      rpcPayload !== null &&
      rpcPayload.updatedCount === payload.productIds.length);
  const resultIsBound =
    result.shopId === context.selectedShop.shopId &&
    result.ok === (result.code === "success") &&
    (!result.ok || (
      (expectedTargetId === undefined || result.targetId === expectedTargetId) &&
      (!createRequiresTarget || (
        typeof result.targetId === "string" &&
        CANONICAL_UUID_PATTERN.test(result.targetId)
      )) &&
      assignmentCountIsBound
    ));

  return resultIsBound
    ? result
    : shopAdminActionResult("db_failure", {
        ok: false,
        shopId: context.selectedShop.shopId,
      });
}

function staffLifecycleRpc(
  context: StaffLifecycleContext,
  operation: StaffLifecycleOperation,
  payload: JsonRecord,
) {
  if (context.principalKind === "pos_staff_manager") {
    return callStaffWebLifecycleMutation(context, operation, payload);
  }

  return context.supabase.rpc("staff_web_lifecycle_mutate_v1", {
    p_expected_credential_version: null,
    p_operation: operation,
    p_payload: payload,
    p_session_token_hash: null,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: null,
    p_staff_web_session_id: null,
  });
}

async function staffLifecycleMutation(
  context: StaffLifecycleContext,
  operation: StaffLifecycleOperation,
  payload: JsonRecord,
  expectedTargetId?: string,
) {
  const { data, error } = await staffLifecycleRpc(context, operation, payload);

  if (error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const result = mapShopAdminRpcResult(data);
  const targetIsBound =
    expectedTargetId !== undefined
      ? result.targetId === expectedTargetId
      : typeof result.targetId === "string" &&
        CANONICAL_UUID_PATTERN.test(result.targetId);
  const resultIsBound =
    result.shopId === context.selectedShop.shopId &&
    result.ok === (result.code === "success") &&
    (!result.ok || targetIsBound);

  return resultIsBound
    ? result
    : shopAdminActionResult("db_failure", {
        ok: false,
        shopId: context.selectedShop.shopId,
      });
}

type InventoryCatalogScope = "legacy_owner_bridge" | "shop_scoped";

export type CatalogProductAssignmentScope = {
  catalogScope: InventoryCatalogScope;
  legacyOwnerUserId: string | null;
  selectedShopId: string;
};

type CatalogEntityInput = {
  name: string;
};

type CatalogEntityUpdateInput = CatalogEntityInput & {
  id: string;
};

type CatalogArchiveInput = {
  expectedUpdatedAt?: string;
  id: string;
  reason?: string;
};

type ProductMutationInput = {
  barcode: string;
  categoryId?: string;
  itemNumber?: string;
  productName: string;
  purchasePrice?: number;
  retailPrice?: number;
  secondProductName?: string;
  stockQuantity?: number;
  supplierId?: string;
};

type ProductUpdateInput = ProductMutationInput & {
  expectedUpdatedAt: string;
  productId: string;
};

export type StaffAwareBulkProductImportPayload = {
  barcode: string;
  category_id?: string | null;
  item_number?: string;
  product_id?: string;
  product_name: string;
  purchase_price?: number;
  retail_price?: number;
  second_product_name?: string;
  stock_quantity?: number;
  supplier_id?: string | null;
};

export type StaffAwareBulkPriceHistoryImportPayload = {
  created_at?: string;
  effective_at: string;
  note?: string;
  price: number;
  price_id?: string;
  product_id: string;
  source?: string;
  type: "PURCHASE" | "RETAIL";
};

export type StaffAwareBulkImportRowError = {
  code?: string;
  field: string;
  message: string;
  row: number;
  sheet: string;
};

export type StaffAwareBulkAppliedProduct = {
  barcode: string;
  itemNumber: string | null;
  productId: string;
};

type StaffMutationInput = {
  credentialHash?: string;
  credentialKind?: string;
  displayName?: string;
  reason?: string;
  roleKey?: string;
  staffCode?: string;
  staffId?: string;
};

type DeviceMutationInput = {
  appVersion?: string;
  deviceId?: string;
  deviceIdentifier?: string;
  deviceType?: string;
  displayName?: string;
  reason?: string;
};

const STAFF_AWARE_BULK_PRODUCT_IMPORT_CHUNK_SIZE = 500;
const STAFF_AWARE_BULK_PRICE_HISTORY_IMPORT_CHUNK_SIZE = 1_000;
// PostgreSQL rejects p_payload above 512 KiB.  Keep the JSON transport body at
// half that boundary so jsonb's internal representation and RPC envelope
// cannot turn a client-approved chunk into an oversized database request.
const STAFF_AWARE_BULK_RPC_JSON_BYTE_LIMIT = 262_144;
const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function nowIso() {
  return new Date().toISOString();
}

function normalizeLabel(value: string | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export async function write_staff_shop_admin_audit(
  context: StaffAwareContext,
  input: {
    code: string;
    eventKey: string;
    metadata?: JsonRecord;
    result: "blocked" | "failure" | "success";
    requiredPermission: "catalog.export" | "catalog.import";
    severity: "critical" | "info" | "warning";
    targetId?: string;
    targetType: string;
  },
) {
  const { data, error } = await callStaffWebAuditEvent(context, {
    code: input.code,
    eventKey: input.eventKey,
    metadata: input.metadata ?? {},
    requiredPermission: input.requiredPermission,
    result: input.result,
    severity: input.severity,
    targetId: input.targetId ?? null,
    targetType: input.targetType,
  });

  if (error) return undefined;
  const result = mapShopAdminRpcResult(data);
  return result.ok &&
    result.code === "success" &&
    result.shopId === context.selectedShop.shopId &&
    result.targetId === (input.targetId ?? undefined)
    ? result.auditEventId
    : undefined;
}

export async function runStaffAwareShopAdminMutation(
  context: Extract<ShopAdminActionContext, { status: "ready" }>,
  staffMutation: (context: StaffAwareContext) => Promise<ShopAdminActionResult>,
) {
  if (context.principalKind === "pos_staff_manager") {
    return staffMutation(context);
  }

  return null;
}

export async function runStaffWebLifecycleShopAdminMutation(
  context: Extract<ShopAdminActionContext, { status: "ready" }>,
  staffMutation: (context: StaffAwareContext) => Promise<ShopAdminActionResult>,
  personalMutation: (
    context: PersonalAwareContext,
  ) => Promise<ShopAdminActionResult>,
) {
  const staffResult = await runStaffAwareShopAdminMutation(
    context,
    staffMutation,
  );

  if (staffResult) {
    return staffResult;
  }

  if (context.principalKind !== "personal_account") {
    return shopAdminActionResult("unauthorized", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  return personalMutation(context);
}

export async function revokeStaffWebAccessAsPersonalAccount(
  context: PersonalAwareContext,
  input: {
    reason: string;
    staffId: string;
  },
) {
  const reason = normalizeLabel(input.reason);
  const staffId = normalizeLabel(input.staffId);

  return staffLifecycleMutation(
    context,
    "staff_web_access_revoke",
    { reason, staffId },
    staffId,
  );
}

export async function revokeStaffWebSessionsAsPersonalAccount(
  context: PersonalAwareContext,
  input: {
    reason: string;
    staffId: string;
  },
) {
  const staffId = normalizeLabel(input.staffId);

  return staffLifecycleMutation(
    context,
    "staff_web_sessions_revoke",
    { reason: normalizeLabel(input.reason), staffId },
    staffId,
  );
}

function normalizeStaffWebPermissions(input: {
  permissions?: readonly string[];
  templateKey?: string;
}) {
  const templatePermissions =
    input.templateKey &&
    Object.hasOwn(SHOP_STAFF_WEB_ROLE_TEMPLATES, input.templateKey)
      ? SHOP_STAFF_WEB_ROLE_TEMPLATES[
          input.templateKey as ShopStaffWebRoleTemplateKey
        ]
      : null;

  return Array.from(
    new Set(
      (templatePermissions ?? input.permissions ?? []).filter(
        (permission): permission is ShopStaffWebPermission =>
          typeof permission === "string" && isShopStaffWebPermission(permission),
      ),
    ),
  );
}

export async function updateStaffRolePermissionsAsPersonalAccount(
  context: PersonalAwareContext,
  input: {
    permissions?: readonly string[];
    roleKey: string;
    templateKey?: string;
  },
) {
  const roleKey = normalizeLabel(input.roleKey);
  const permissions = normalizeStaffWebPermissions(input);

  if (!["cashier", "manager", "viewer"].includes(roleKey)) {
    return shopAdminActionResult("validation_failed", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  return staffLifecycleMutation(
    context,
    "staff_role_permissions_replace",
    { permissions, roleKey },
    roleKey,
  );
}

function* chunkRows<T>(rows: readonly T[], chunkSize: number) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    yield rows.slice(index, index + chunkSize);
  }
}

type StaffAwareBulkChunk<T> = {
  rows: readonly T[];
  startIndex: number;
};

function staffAwareBulkPayloadBytes(rows: readonly unknown[]) {
  try {
    return Buffer.byteLength(JSON.stringify({ rows }), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function planStaffAwareBulkChunks<T>(
  rows: readonly T[],
  maxRows: number,
): {
  chunks: StaffAwareBulkChunk<T>[];
  oversizedRowIndexes: number[];
} {
  const chunks: StaffAwareBulkChunk<T>[] = [];
  const oversizedRowIndexes: number[] = [];
  let currentRows: T[] = [];
  let currentStartIndex = 0;

  const flush = () => {
    if (currentRows.length === 0) return;
    chunks.push({ rows: currentRows, startIndex: currentStartIndex });
    currentRows = [];
  };

  for (const [index, row] of rows.entries()) {
    const candidate = [...currentRows, row];
    if (
      candidate.length <= maxRows &&
      staffAwareBulkPayloadBytes(candidate) <=
        STAFF_AWARE_BULK_RPC_JSON_BYTE_LIMIT
    ) {
      if (currentRows.length === 0) currentStartIndex = index;
      currentRows = candidate;
      continue;
    }

    flush();
    if (
      staffAwareBulkPayloadBytes([row]) >
      STAFF_AWARE_BULK_RPC_JSON_BYTE_LIMIT
    ) {
      oversizedRowIndexes.push(index);
      continue;
    }
    currentRows = [row];
    currentStartIndex = index;
  }
  flush();

  return { chunks, oversizedRowIndexes };
}

function staffBulkChunkCountsAreValid(
  applied: unknown,
  failed: unknown,
  expectedRows: number,
) {
  return (
    typeof applied === "number" &&
    Number.isSafeInteger(applied) &&
    applied >= 0 &&
    typeof failed === "number" &&
    Number.isSafeInteger(failed) &&
    failed >= 0 &&
    applied + failed === expectedRows
  );
}

function staffBulkResultStatusMatchesCounts(
  root: Record<string, Json | undefined> | null,
  applied: number,
  failed: number,
) {
  return failed === 0
    ? root?.ok === true && root.code === "success"
    : root?.ok === false && root.code === "partial_failure";
}

function remainingStaffBulkRows<T>(
  chunks: readonly { rows: readonly T[] }[],
  fromIndex: number,
) {
  return chunks
    .slice(fromIndex)
    .reduce((count, chunk) => count + chunk.rows.length, 0);
}

export async function updateCatalogProductAssignments(
  context: Extract<ShopAdminActionContext, { status: "ready" }>,
  input: {
    entity: "category" | "supplier";
    productIds: readonly string[];
    replacementId: string | null;
    scope: CatalogProductAssignmentScope;
  },
): Promise<ShopAdminActionResult | null> {
  if (input.productIds.length === 0) {
    return null;
  }

  if (context.principalKind === "pos_staff_manager") {
    const result = await staffCatalogMutation(
      context,
      "product_assignments",
      {
        entity: input.entity,
        productIds: [...input.productIds],
        replacementId: input.replacementId,
      },
    );
    return result.ok ? null : result;
  }

  if (input.scope.selectedShopId !== context.selectedShop.shopId) {
    return shopAdminActionResult("unauthorized_or_unmapped", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  if (
    input.scope.catalogScope === "legacy_owner_bridge" &&
    !input.scope.legacyOwnerUserId
  ) {
    return shopAdminActionResult("unauthorized_or_unmapped", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const updatedAt = nowIso();
  const payload =
    input.entity === "supplier"
      ? {
          supplier_id: input.replacementId,
          updated_at: updatedAt,
        }
      : {
          category_id: input.replacementId,
          updated_at: updatedAt,
        };

  for (const productChunk of chunkRows(input.productIds, 100)) {
    const scopeCheck = await context.supabase
      .from("inventory_products")
      .select("id,shop_id,owner_user_id")
      .in("id", productChunk)
      .is("deleted_at", null);

    if (scopeCheck.error) {
      return shopAdminActionResult("db_failure", {
        ok: false,
        shopId: context.selectedShop.shopId,
      });
    }

    const scopedRows = scopeCheck.data ?? [];
    const scopedRowIds = new Set(scopedRows.map((row) => row.id));
    const allRowsMatchScope =
      scopedRows.length === productChunk.length &&
      productChunk.every((id) => scopedRowIds.has(id)) &&
      scopedRows.every((row) =>
        input.scope.catalogScope === "legacy_owner_bridge"
          ? row.shop_id === null &&
            row.owner_user_id === input.scope.legacyOwnerUserId
          : row.shop_id === input.scope.selectedShopId,
      );

    if (!allRowsMatchScope) {
      return shopAdminActionResult("partial_failure", {
        ok: false,
        shopId: context.selectedShop.shopId,
      });
    }

    const scopedUpdate = context.supabase
      .from("inventory_products")
      .update(payload)
      .in("id", productChunk)
      .is("deleted_at", null);
    const result =
      input.scope.catalogScope === "shop_scoped"
        ? await scopedUpdate.eq("shop_id", input.scope.selectedShopId).select("id")
        : await scopedUpdate.select("id");

    if (result.error) {
      return shopAdminActionResult("db_failure", {
        ok: false,
        shopId: context.selectedShop.shopId,
      });
    }

    if ((result.data?.length ?? 0) !== productChunk.length) {
      return shopAdminActionResult("partial_failure", {
        ok: false,
        shopId: context.selectedShop.shopId,
      });
    }
  }

  return null;
}

export async function applyStaffAwareBulkProductImport(
  context: StaffAwareContext,
  productPayload: readonly StaffAwareBulkProductImportPayload[],
) {
  const plan = planStaffAwareBulkChunks(
    productPayload,
    STAFF_AWARE_BULK_PRODUCT_IMPORT_CHUNK_SIZE,
  );
  let failedRows = plan.oversizedRowIndexes.length;
  let productsApplied = 0;
  const productIds: StaffAwareBulkAppliedProduct[] = [];
  const rowErrors: StaffAwareBulkImportRowError[] =
    plan.oversizedRowIndexes.map((rowIndex) => ({
      field: "products",
      message: "Product row exceeds the bounded staff import payload.",
      row: rowIndex + 1,
      sheet: "Products",
    }));

  let stoppedEarly = false;

  for (const [chunkIndex, chunk] of plan.chunks.entries()) {
    const rpc = await staffCatalogRpc(context, "bulk_products", {
      rows: [...chunk.rows] as Json,
    });
    const root =
      !rpc.error && rpc.data && typeof rpc.data === "object" && !Array.isArray(rpc.data)
        ? (rpc.data as Record<string, Json | undefined>)
        : null;
    const payload =
      root?.payload && typeof root.payload === "object" && !Array.isArray(root.payload)
        ? (root.payload as Record<string, Json | undefined>)
        : null;
    const applied = payload?.productsApplied;
    const failed = payload?.failedRows;
    const ids = payload?.productIds;
    const appliedCount = typeof applied === "number" ? applied : -1;
    const failedCount = typeof failed === "number" ? failed : -1;
    const parsedProductIds = Array.isArray(ids)
      ? ids.flatMap((value) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) {
            return [];
          }
          const row = value as Record<string, Json | undefined>;
          return typeof row.productId === "string" &&
            CANONICAL_UUID_PATTERN.test(row.productId) &&
            typeof row.barcode === "string"
            ? [{
                barcode: row.barcode,
                itemNumber:
                  typeof row.itemNumber === "string" ? row.itemNumber : null,
                productId: row.productId,
              }]
            : [];
        })
      : [];
    const validChunk =
      root !== null &&
      root.shop_id === context.selectedShop.shopId &&
      staffBulkChunkCountsAreValid(
        appliedCount,
        failedCount,
        chunk.rows.length,
      ) &&
      staffBulkResultStatusMatchesCounts(root, appliedCount, failedCount) &&
      parsedProductIds.length === appliedCount &&
      new Set(parsedProductIds.map((row) => row.productId)).size ===
        parsedProductIds.length;

    if (!validChunk) {
      failedRows += remainingStaffBulkRows(plan.chunks, chunkIndex);
      rowErrors.push({
        field: "products",
        message:
          "Product import chunk returned an invalid or unavailable staff boundary result.",
        row: chunk.startIndex + 1,
        sheet: "Products",
      });
      stoppedEarly = true;
      break;
    }

    productsApplied += appliedCount;
    failedRows += failedCount;
    productIds.push(...parsedProductIds);
    if (failedCount > 0) {
      failedRows += remainingStaffBulkRows(plan.chunks, chunkIndex + 1);
      rowErrors.push({
        field: "products",
        message:
          "Some product rows were rejected during the bounded shop-scope chunk.",
        row: chunk.startIndex + 1,
        sheet: "Products",
      });
      stoppedEarly = true;
      break;
    }
  }

  return {
    failedRows,
    productIds,
    productsApplied,
    rowErrors,
    stoppedEarly,
  };
}

export async function applyStaffAwareBulkPriceHistoryImport(
  context: StaffAwareContext,
  pricePayload: readonly StaffAwareBulkPriceHistoryImportPayload[],
) {
  const plan = planStaffAwareBulkChunks(
    pricePayload,
    STAFF_AWARE_BULK_PRICE_HISTORY_IMPORT_CHUNK_SIZE,
  );
  let failedRows = plan.oversizedRowIndexes.length;
  let priceHistoryApplied = 0;
  const priceIds: string[] = [];
  const rowErrors: StaffAwareBulkImportRowError[] =
    plan.oversizedRowIndexes.map((rowIndex) => ({
      field: "priceHistory",
      message: "Price row exceeds the bounded staff import payload.",
      row: rowIndex + 1,
      sheet: "PriceHistory",
    }));

  let stoppedEarly = false;

  for (const [chunkIndex, chunk] of plan.chunks.entries()) {
    const rpc = await staffCatalogRpc(context, "bulk_prices", {
      rows: [...chunk.rows] as Json,
    });
    const root =
      !rpc.error && rpc.data && typeof rpc.data === "object" && !Array.isArray(rpc.data)
        ? (rpc.data as Record<string, Json | undefined>)
        : null;
    const payload =
      root?.payload && typeof root.payload === "object" && !Array.isArray(root.payload)
        ? (root.payload as Record<string, Json | undefined>)
        : null;
    const applied = payload?.priceHistoryApplied;
    const failed = payload?.failedRows;
    const ids = payload?.priceIds;
    const appliedCount = typeof applied === "number" ? applied : -1;
    const failedCount = typeof failed === "number" ? failed : -1;
    const validChunk =
      root !== null &&
      root.shop_id === context.selectedShop.shopId &&
      staffBulkChunkCountsAreValid(
        appliedCount,
        failedCount,
        chunk.rows.length,
      ) &&
      Array.isArray(ids) &&
      ids.every(
        (value) =>
          typeof value === "string" && CANONICAL_UUID_PATTERN.test(value),
      ) &&
      staffBulkResultStatusMatchesCounts(root, appliedCount, failedCount) &&
      ids.length === appliedCount &&
      new Set(ids).size === ids.length;

    if (!validChunk) {
      failedRows += remainingStaffBulkRows(plan.chunks, chunkIndex);
      rowErrors.push({
        field: "priceHistory",
        message:
          "Price import chunk returned an invalid or unavailable staff boundary result.",
        row: chunk.startIndex + 1,
        sheet: "PriceHistory",
      });
      stoppedEarly = true;
      break;
    }

    priceHistoryApplied += appliedCount;
    failedRows += failedCount;
    priceIds.push(...(ids as string[]));
    if (failedCount > 0) {
      failedRows += remainingStaffBulkRows(plan.chunks, chunkIndex + 1);
      rowErrors.push({
        field: "priceHistory",
        message:
          "Some price rows were rejected during the bounded shop-scope chunk.",
        row: chunk.startIndex + 1,
        sheet: "PriceHistory",
      });
      stoppedEarly = true;
      break;
    }
  }

  return {
    failedRows,
    priceIds,
    priceHistoryApplied,
    rowErrors,
    stoppedEarly,
  };
}

export async function createSupplierAsStaff(
  context: StaffAwareContext,
  input: CatalogEntityInput,
) {
  return staffCatalogMutation(context, "supplier_create", { name: input.name });
}

export async function updateSupplierAsStaff(
  context: StaffAwareContext,
  input: CatalogEntityUpdateInput,
) {
  return staffCatalogMutation(context, "supplier_update", {
    id: input.id,
    name: input.name,
  });
}

export async function archiveSupplierAsStaff(
  context: StaffAwareContext,
  input: CatalogArchiveInput,
) {
  return staffCatalogMutation(context, "supplier_archive", {
    id: input.id,
    reason: input.reason,
  });
}

export async function createCategoryAsStaff(
  context: StaffAwareContext,
  input: CatalogEntityInput,
) {
  return staffCatalogMutation(context, "category_create", { name: input.name });
}

export async function updateCategoryAsStaff(
  context: StaffAwareContext,
  input: CatalogEntityUpdateInput,
) {
  return staffCatalogMutation(context, "category_update", {
    id: input.id,
    name: input.name,
  });
}

export async function archiveCategoryAsStaff(
  context: StaffAwareContext,
  input: CatalogArchiveInput,
) {
  return staffCatalogMutation(context, "category_archive", {
    id: input.id,
    reason: input.reason,
  });
}

export async function createProductAsStaff(
  context: StaffAwareContext,
  input: ProductMutationInput,
) {
  return staffCatalogMutation(context, "product_create", input);
}

export async function updateProductAsStaff(
  context: StaffAwareContext,
  input: ProductUpdateInput,
) {
  const { expectedUpdatedAt, ...payload } = input;
  const { data, error } = await callStaffWebRevisionGuardedProductUpdate(
    context,
    expectedUpdatedAt,
    payload,
  );

  if (error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const result = mapShopAdminRpcResult(data);
  const resultIsBound =
    result.shopId === context.selectedShop.shopId &&
    result.ok === (result.code === "success") &&
    (!result.ok || result.targetId === input.productId);

  return resultIsBound
    ? result
    : shopAdminActionResult("db_failure", {
        ok: false,
        shopId: context.selectedShop.shopId,
      });
}

export async function archiveProductAsStaff(
  context: StaffAwareContext,
  input: CatalogArchiveInput,
) {
  return setProductDeletedStateAsStaff(context, input, true);
}

export async function restoreProductAsStaff(
  context: StaffAwareContext,
  input: CatalogArchiveInput,
) {
  return setProductDeletedStateAsStaff(context, input, false);
}

async function setProductDeletedStateAsStaff(
  context: StaffAwareContext,
  input: CatalogArchiveInput,
  archived: boolean,
) {
  if (!input.expectedUpdatedAt) {
    return shopAdminActionResult("validation_failed", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const { data, error } = await callStaffWebRevisionGuardedProductArchivedState(
    context,
    input.expectedUpdatedAt,
    archived,
    { id: input.id, reason: input.reason },
  );

  if (error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const result = mapShopAdminRpcResult(data);
  return result.shopId === context.selectedShop.shopId &&
    result.ok === (result.code === "success") &&
    (!result.ok || result.targetId === input.id)
    ? result
    : shopAdminActionResult("db_failure", {
        ok: false,
        shopId: context.selectedShop.shopId,
      });
}

export async function createStaffAsStaff(
  context: StaffAwareContext,
  input: StaffMutationInput,
) {
  const staffCode = normalizeLabel(input.staffCode).toUpperCase();
  const displayName = normalizeLabel(input.displayName);
  const roleKey = normalizeLabel(input.roleKey);
  const credentialKind = normalizeLabel(input.credentialKind);
  const credentialHash = normalizeLabel(input.credentialHash);

  return staffLifecycleMutation(context, "staff_create", {
    credentialHash,
    credentialKind,
    displayName,
    roleKey,
    staffCode,
  });
}

export async function resetStaffCredentialAsStaff(
  context: StaffAwareContext,
  input: StaffMutationInput,
) {
  const staffId = normalizeLabel(input.staffId);

  return staffLifecycleMutation(
    context,
    "staff_credential_reset",
    {
      credentialHash: normalizeLabel(input.credentialHash),
      credentialKind: normalizeLabel(input.credentialKind),
      reason: normalizeLabel(input.reason),
      staffId,
    },
    staffId,
  );
}

export async function setStaffStatusAsStaff(
  context: StaffAwareContext,
  input: StaffMutationInput & {
    eventBase: string;
    nextStatus: "active" | "archived" | "suspended";
  },
) {
  const staffId = normalizeLabel(input.staffId);

  return staffLifecycleMutation(
    context,
    "staff_status_set",
    {
      nextStatus: input.nextStatus,
      reason: normalizeLabel(input.reason),
      staffId,
    },
    staffId,
  );
}

export async function forceStaffCredentialRotationAsStaff(
  context: StaffAwareContext,
  input: StaffMutationInput,
) {
  const staffId = normalizeLabel(input.staffId);

  return staffLifecycleMutation(
    context,
    "staff_credential_rotation_force",
    { reason: normalizeLabel(input.reason), staffId },
    staffId,
  );
}

export async function clearStaffLockoutAsStaff(
  context: StaffAwareContext,
  input: StaffMutationInput,
) {
  const staffId = normalizeLabel(input.staffId);

  return staffLifecycleMutation(
    context,
    "staff_lockout_clear",
    { reason: normalizeLabel(input.reason), staffId },
    staffId,
  );
}

export async function revokeStaffWebAccessAsStaff(
  context: StaffAwareContext,
  input: StaffMutationInput,
) {
  const staffId = normalizeLabel(input.staffId);
  const reason = normalizeLabel(input.reason);

  return staffLifecycleMutation(
    context,
    "staff_web_access_revoke",
    { reason, staffId },
    staffId,
  );
}

export async function revokeStaffWebSessionsAsStaff(
  context: StaffAwareContext,
  input: StaffMutationInput,
) {
  const staffId = normalizeLabel(input.staffId);
  const reason = normalizeLabel(input.reason) || "operator_revoked_sessions";

  return staffLifecycleMutation(
    context,
    "staff_web_sessions_revoke",
    { reason, staffId },
    staffId,
  );
}

export async function updateStaffRolePermissionsAsStaff(
  context: StaffAwareContext,
  input: {
    permissions?: readonly string[];
    roleKey: string;
    templateKey?: string;
  },
) {
  const roleKey = normalizeLabel(input.roleKey);
  const permissions = normalizeStaffWebPermissions(input);

  if (!["cashier", "manager", "viewer"].includes(roleKey)) {
    return shopAdminActionResult("validation_failed", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  return staffLifecycleMutation(
    context,
    "staff_role_permissions_replace",
    { permissions, roleKey },
    roleKey,
  );
}

export async function registerDeviceAsStaff(
  context: StaffAwareContext,
  input: DeviceMutationInput,
) {
  const deviceIdentifier = normalizeLabel(input.deviceIdentifier);
  const displayName = normalizeLabel(input.displayName) || deviceIdentifier;

  return staffLifecycleMutation(context, "device_register", {
    appVersion: normalizeLabel(input.appVersion) || undefined,
    deviceIdentifier,
    deviceType: normalizeLabel(input.deviceType) || "unknown",
    displayName,
  });
}

export async function renameDeviceAsStaff(
  context: StaffAwareContext,
  input: DeviceMutationInput,
) {
  const deviceId = normalizeLabel(input.deviceId);

  return staffLifecycleMutation(
    context,
    "device_rename",
    { deviceId, displayName: normalizeLabel(input.displayName) },
    deviceId,
  );
}

export async function setDeviceStatusAsStaff(
  context: StaffAwareContext,
  input: DeviceMutationInput & { nextStatus: "active" | "revoked" },
) {
  const deviceId = normalizeLabel(input.deviceId);

  return staffLifecycleMutation(
    context,
    "device_status_set",
    {
      deviceId,
      nextStatus: input.nextStatus,
      reason: normalizeLabel(input.reason),
    },
    deviceId,
  );
}
