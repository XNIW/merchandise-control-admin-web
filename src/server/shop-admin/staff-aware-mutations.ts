import "server-only";

import { randomUUID } from "node:crypto";
import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import {
  shopAdminActionResult,
  type ShopAdminActionContext,
  type ShopAdminActionResult,
} from "./action-context";
import {
  hasStaffFullShopAdminWebAccess,
  isShopStaffWebPermission,
  SHOP_STAFF_WEB_PERMISSION_TREE,
  SHOP_STAFF_WEB_ROLE_TEMPLATES,
  type ShopStaffWebPermission,
  type ShopStaffWebRoleTemplateKey,
} from "./staff-web-permissions";

type StaffAwareContext = Extract<
  ShopAdminActionContext,
  { principalKind: "pos_staff_manager"; status: "ready" }
>;

type PersonalAwareContext = Extract<
  ShopAdminActionContext,
  { principalKind: "personal_account"; status: "ready" }
>;

type JsonRecord = { [key: string]: Json | undefined };

type MutationError = {
  code?: string;
};

type InventoryCatalogScope = "legacy_owner_bridge" | "shop_scoped";

export type CatalogProductAssignmentScope = {
  catalogScope: InventoryCatalogScope;
  legacyOwnerUserId: string | null;
  selectedShopId: string;
};

type InventoryOwnerResult =
  | {
      catalogScope: InventoryCatalogScope;
      ok: true;
      ownerUserId: string;
    }
  | { ok: false; result: ShopAdminActionResult };

type InventoryScopedRow = {
  id: string;
  owner_user_id: string;
  shop_id: string | null;
};

type CatalogEntityInput = {
  name: string;
};

type CatalogEntityUpdateInput = CatalogEntityInput & {
  id: string;
};

type CatalogArchiveInput = {
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

const STAFF_WEB_SESSION_REVOKED_STATUS = "revoked";
const STAFF_WEB_PERMISSION_KEYS: readonly ShopStaffWebPermission[] =
  SHOP_STAFF_WEB_PERMISSION_TREE.flatMap((group) =>
    group.permissions.map((permission) => permission.key),
  );
const STAFF_AWARE_BULK_PRODUCT_IMPORT_CHUNK_SIZE = 500;
const STAFF_AWARE_BULK_PRICE_HISTORY_IMPORT_CHUNK_SIZE = 1_000;

function nowIso() {
  return new Date().toISOString();
}

function normalizeLabel(value: string | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function isUniqueViolation(error: unknown) {
  return (error as MutationError | null)?.code === "23505";
}

function catalogAuditMetadata(
  owner: { catalogScope: InventoryCatalogScope },
  metadata: JsonRecord = {},
): JsonRecord {
  return {
    catalog_scope: owner.catalogScope,
    source: "admin_web",
    ...metadata,
  };
}

function isInventoryScopedToShop(
  row: Pick<InventoryScopedRow, "owner_user_id" | "shop_id">,
  input: {
    ownerUserId: string;
    shopId: string;
  },
) {
  return (
    row.shop_id === input.shopId ||
    (row.shop_id === null && row.owner_user_id === input.ownerUserId)
  );
}

async function auditResult(
  context: StaffAwareContext,
  input: {
    code: Parameters<typeof shopAdminActionResult>[0];
    eventKey: string;
    metadata?: JsonRecord;
    ok?: boolean;
    result: "blocked" | "failure" | "success";
    severity: "critical" | "info" | "warning";
    targetId?: string;
    targetType: string;
  },
) {
  const auditEventId = await write_staff_shop_admin_audit(context, {
    code: input.code,
    eventKey: input.eventKey,
    metadata: input.metadata,
    result: input.result,
    severity: input.severity,
    targetId: input.targetId,
    targetType: input.targetType,
  });

  return shopAdminActionResult(input.code, {
    auditEventId,
    ok: input.ok,
    shopId: context.selectedShop.shopId,
    targetId: input.targetId,
  });
}

export async function write_staff_shop_admin_audit(
  context: StaffAwareContext,
  input: {
    code: string;
    eventKey: string;
    metadata?: JsonRecord;
    result: "blocked" | "failure" | "success";
    severity: "critical" | "info" | "warning";
    targetId?: string;
    targetType: string;
  },
) {
  const { data, error } = await context.supabase
    .from("audit_logs")
    .insert({
      actor_profile_id: null,
      actor_staff_id: context.actorStaffId,
      event_key: input.eventKey,
      metadata_redacted: {
        actor_kind: "pos_staff_manager",
        code: input.code,
        source: "TASK-039",
        ...(input.metadata ?? {}),
      },
      result: input.result,
      scope: "shop",
      severity: input.severity,
      shop_id: context.selectedShop.shopId,
      target_id: input.targetId,
      target_type: input.targetType,
    })
    .select("audit_log_id")
    .maybeSingle<Pick<Tables<"audit_logs">, "audit_log_id">>();

  return error ? undefined : data?.audit_log_id;
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
    supabase: SupabaseAdminClient,
  ) => Promise<ShopAdminActionResult>,
) {
  const staffResult = await runStaffAwareShopAdminMutation(
    context,
    staffMutation,
  );

  if (staffResult) {
    return staffResult;
  }

  const supabase = createSupabaseAdminClient(resolveSupabaseAdminConfig());

  if (!supabase) {
    return shopAdminActionResult("not_configured", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  if (context.principalKind !== "personal_account") {
    return shopAdminActionResult("unauthorized", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  return personalMutation(context, supabase);
}

async function writePersonalStaffLifecycleAudit(
  context: PersonalAwareContext,
  supabase: SupabaseAdminClient,
  input: {
    code: string;
    eventKey: string;
    metadata?: JsonRecord;
    result: "blocked" | "failure" | "success";
    severity: "critical" | "info" | "warning";
    targetId?: string;
    targetType: string;
  },
) {
  const { data, error } = await supabase
    .from("audit_logs")
    .insert({
      actor_profile_id: context.actorProfileId,
      actor_staff_id: null,
      event_key: input.eventKey,
      metadata_redacted: {
        actor_kind: "personal_account",
        code: input.code,
        source: "TASK-039",
        ...(input.metadata ?? {}),
      },
      result: input.result,
      scope: "shop",
      severity: input.severity,
      shop_id: context.selectedShop.shopId,
      target_id: input.targetId,
      target_type: input.targetType,
    })
    .select("audit_log_id")
    .maybeSingle<Pick<Tables<"audit_logs">, "audit_log_id">>();

  return error ? undefined : data?.audit_log_id;
}

async function revokeActiveStaffWebSessionsForPersonalAccount(
  context: PersonalAwareContext,
  supabase: SupabaseAdminClient,
  input: {
    reason: string;
    staffId: string;
  },
) {
  await supabase
    .from("staff_web_sessions")
    .update({
      revoked_at: nowIso(),
      revoked_reason: input.reason.slice(0, 240),
      status: STAFF_WEB_SESSION_REVOKED_STATUS,
      updated_at: nowIso(),
    })
    .eq("shop_id", context.selectedShop.shopId)
    .eq("staff_id", input.staffId)
    .eq("status", "active");
}

export async function revokeStaffWebAccessAsPersonalAccount(
  context: PersonalAwareContext,
  supabase: SupabaseAdminClient,
  input: {
    reason: string;
    staffId: string;
  },
) {
  const revokedAt = nowIso();
  const reason = normalizeLabel(input.reason);
  const { data, error } = await supabase
    .from("staff_accounts")
    .update({
      session_invalidated_at: revokedAt,
      updated_at: revokedAt,
      web_access_revoked_at: revokedAt,
      web_access_revoked_by_staff_id: null,
      web_access_revoked_reason: reason.slice(0, 240),
    })
    .eq("shop_id", context.selectedShop.shopId)
    .eq("staff_id", input.staffId)
    .neq("status", "archived")
    .select("staff_id")
    .maybeSingle<Pick<Tables<"staff_accounts">, "staff_id">>();

  if (error || !data) {
    const auditEventId = await writePersonalStaffLifecycleAudit(
      context,
      supabase,
      {
        code: error ? "db_failure" : "invalid_state_or_not_found",
        eventKey: "shop.staff.web_access.revoke.failure",
        metadata: { reason_redacted: reason },
        result: error ? "failure" : "blocked",
        severity: error ? "critical" : "warning",
        targetId: input.staffId,
        targetType: "staff",
      },
    );

    return shopAdminActionResult(
      error ? "db_failure" : "invalid_state_or_not_found",
      {
        auditEventId,
        ok: false,
        shopId: context.selectedShop.shopId,
        targetId: input.staffId,
      },
    );
  }

  await revokeActiveStaffWebSessionsForPersonalAccount(context, supabase, {
    reason: "web_access_revoked",
    staffId: input.staffId,
  });

  const auditEventId = await writePersonalStaffLifecycleAudit(context, supabase, {
    code: "success",
    eventKey: "shop.staff.web_access.revoke.success",
    metadata: { reason_redacted: reason },
    result: "success",
    severity: "warning",
    targetId: input.staffId,
    targetType: "staff",
  });

  return shopAdminActionResult("success", {
    auditEventId,
    shopId: context.selectedShop.shopId,
    targetId: input.staffId,
  });
}

export async function revokeStaffWebSessionsAsPersonalAccount(
  context: PersonalAwareContext,
  supabase: SupabaseAdminClient,
  input: {
    reason: string;
    staffId: string;
  },
) {
  const revokedAt = nowIso();
  const reason = normalizeLabel(input.reason);
  const { data, error } = await supabase
    .from("staff_accounts")
    .update({
      session_invalidated_at: revokedAt,
      updated_at: revokedAt,
    })
    .eq("shop_id", context.selectedShop.shopId)
    .eq("staff_id", input.staffId)
    .neq("status", "archived")
    .select("staff_id")
    .maybeSingle<Pick<Tables<"staff_accounts">, "staff_id">>();

  if (error || !data) {
    const auditEventId = await writePersonalStaffLifecycleAudit(
      context,
      supabase,
      {
        code: error ? "db_failure" : "invalid_state_or_not_found",
        eventKey: "shop.staff.web_sessions.revoke.failure",
        metadata: { reason_redacted: reason },
        result: error ? "failure" : "blocked",
        severity: error ? "critical" : "warning",
        targetId: input.staffId,
        targetType: "staff",
      },
    );

    return shopAdminActionResult(
      error ? "db_failure" : "invalid_state_or_not_found",
      {
        auditEventId,
        ok: false,
        shopId: context.selectedShop.shopId,
        targetId: input.staffId,
      },
    );
  }

  await revokeActiveStaffWebSessionsForPersonalAccount(context, supabase, {
    reason,
    staffId: input.staffId,
  });

  const auditEventId = await writePersonalStaffLifecycleAudit(context, supabase, {
    code: "success",
    eventKey: "shop.staff.web_sessions.revoke.success",
    metadata: { reason_redacted: reason },
    result: "success",
    severity: "warning",
    targetId: input.staffId,
    targetType: "staff",
  });

  return shopAdminActionResult("success", {
    auditEventId,
    shopId: context.selectedShop.shopId,
    targetId: input.staffId,
  });
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

function staleStaffWebPermissions(
  permissions: readonly ShopStaffWebPermission[],
) {
  const requestedPermissions = new Set(permissions);

  return STAFF_WEB_PERMISSION_KEYS.filter(
    (permission) => !requestedPermissions.has(permission),
  );
}

async function replaceStaffRolePermissions(
  supabase: SupabaseAdminClient,
  input: {
    permissions: readonly ShopStaffWebPermission[];
    roleKey: string;
    shopId: string;
    updatedByProfileId?: string;
  },
) {
  const stalePermissions = staleStaffWebPermissions(input.permissions);

  if (stalePermissions.length > 0) {
    const { error } = await supabase
      .from("staff_role_permissions")
      .delete()
      .eq("shop_id", input.shopId)
      .eq("role_key", input.roleKey)
      .in("permission_key", stalePermissions);

    if (error) {
      return error;
    }
  }

  if (input.permissions.length === 0) {
    return null;
  }

  const updatedAt = nowIso();
  const { error } = await supabase.from("staff_role_permissions").upsert(
    input.permissions.map((permission) => ({
      enabled: true,
      permission_key: permission,
      role_key: input.roleKey,
      shop_id: input.shopId,
      updated_at: updatedAt,
      updated_by_profile_id: input.updatedByProfileId ?? null,
    })),
    { onConflict: "shop_id,role_key,permission_key" },
  );

  return error ?? null;
}

export async function updateStaffRolePermissionsAsPersonalAccount(
  context: PersonalAwareContext,
  supabase: SupabaseAdminClient,
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

  const error = await replaceStaffRolePermissions(supabase, {
    permissions,
    roleKey,
    shopId: context.selectedShop.shopId,
    updatedByProfileId: context.actorProfileId,
  });

  if (error) {
    const auditEventId = await writePersonalStaffLifecycleAudit(
      context,
      supabase,
      {
        code: "db_failure",
        eventKey: "shop.staff.permissions.update.failure",
        metadata: {
          permission_count: permissions.length,
          role_key: roleKey,
        },
        result: "failure",
        severity: "critical",
        targetId: roleKey,
        targetType: "staff_role",
      },
    );

    return shopAdminActionResult("db_failure", {
      auditEventId,
      ok: false,
      shopId: context.selectedShop.shopId,
      targetId: roleKey,
    });
  }

  const auditEventId = await writePersonalStaffLifecycleAudit(context, supabase, {
    code: "success",
    eventKey: "shop.staff.permissions.update.success",
    metadata: {
      permission_count: permissions.length,
      role_key: roleKey,
    },
    result: "success",
    severity: "warning",
    targetId: roleKey,
    targetType: "staff_role",
  });

  return shopAdminActionResult("success", {
    auditEventId,
    shopId: context.selectedShop.shopId,
    targetId: roleKey,
  });
}

async function resolveShopScopedCompatibilityOwner(
  context: StaffAwareContext,
) {
  const shopOwnerResult = await context.supabase
    .from("shops")
    .select("created_by_profile_id")
    .eq("shop_id", context.selectedShop.shopId)
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

  const memberOwnerResult = await context.supabase
    .from("shop_members")
    .select("profile_id,role_key")
    .eq("shop_id", context.selectedShop.shopId)
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

async function resolveInventoryOwner(
  context: StaffAwareContext,
): Promise<InventoryOwnerResult> {
  const { data, error } = await context.supabase
    .from("shop_inventory_sources")
    .select("owner_user_id,mapping_state")
    .eq("shop_id", context.selectedShop.shopId)
    .is("disabled_at", null)
    .limit(10);

  if (error) {
    return {
      ok: false,
      result: await auditResult(context, {
        code: "db_failure",
        eventKey: "shop.inventory_source.resolve.failure",
        ok: false,
        result: "failure",
        severity: "critical",
        targetId: context.selectedShop.shopId,
        targetType: "shop",
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
      result: await auditResult(context, {
        code: "unauthorized_or_unmapped",
        eventKey: "shop.inventory_source.resolve.failure",
        ok: false,
        result: "blocked",
        severity: "warning",
        targetId: context.selectedShop.shopId,
        targetType: "shop",
      }),
    };
  }

  const shopScopedOwner = await resolveShopScopedCompatibilityOwner(context);

  if (shopScopedOwner.error) {
    return {
      ok: false,
      result: await auditResult(context, {
        code: "db_failure",
        eventKey: "shop.inventory_source.resolve.failure",
        ok: false,
        result: "failure",
        severity: "critical",
        targetId: context.selectedShop.shopId,
        targetType: "shop",
      }),
    };
  }

  if (!shopScopedOwner.ownerUserId) {
    return {
      ok: false,
      result: await auditResult(context, {
        code: "unauthorized_or_unmapped",
        eventKey: "shop.inventory_source.resolve.failure",
        ok: false,
        result: "blocked",
        severity: "warning",
        targetId: context.selectedShop.shopId,
        targetType: "shop",
      }),
    };
  }

  return {
    catalogScope: "shop_scoped",
    ok: true,
    ownerUserId: shopScopedOwner.ownerUserId,
  };
}

function* chunkRows<T>(rows: readonly T[], chunkSize: number) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    yield rows.slice(index, index + chunkSize);
  }
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

function staffBulkOwnerRowError(
  owner: Extract<InventoryOwnerResult, { ok: false }>,
  sheet: "PriceHistory" | "Products",
): StaffAwareBulkImportRowError {
  return {
    code: owner.result.code,
    field: "catalogOwner",
    message: "Shop catalog owner is not available for staff database import.",
    row: 0,
    sheet,
  };
}

async function loadScopedInventoryRowIds(
  context: StaffAwareContext,
  input: {
    ids: readonly string[];
    ownerUserId: string;
    table: "inventory_categories" | "inventory_products" | "inventory_suppliers";
  },
) {
  const scopedIds = new Set<string>();
  const ids = Array.from(new Set(input.ids.filter(Boolean)));

  for (const idChunk of chunkRows(ids, 100)) {
    const { data, error } = await context.supabase
      .from(input.table)
      .select("id,shop_id,owner_user_id")
      .in("id", idChunk)
      .is("deleted_at", null);

    if (error) {
      return { ids: scopedIds, ok: false as const };
    }

    for (const row of data ?? []) {
      if (
        isInventoryScopedToShop(row, {
          ownerUserId: input.ownerUserId,
          shopId: context.selectedShop.shopId,
        })
      ) {
        scopedIds.add(row.id);
      }
    }
  }

  return { ids: scopedIds, ok: true as const };
}

export async function applyStaffAwareBulkProductImport(
  context: StaffAwareContext,
  productPayload: readonly StaffAwareBulkProductImportPayload[],
) {
  const owner = await resolveInventoryOwner(context);

  if (!owner.ok) {
    return {
      failedRows: productPayload.length,
      productIds: [] as StaffAwareBulkAppliedProduct[],
      productsApplied: 0,
      rowErrors: [staffBulkOwnerRowError(owner, "Products")],
    };
  }

  let failedRows = 0;
  let productsApplied = 0;
  const productIds: StaffAwareBulkAppliedProduct[] = [];
  const rowErrors: StaffAwareBulkImportRowError[] = [];

  for (const [chunkIndex, productChunk] of Array.from(chunkRows(
    productPayload,
    STAFF_AWARE_BULK_PRODUCT_IMPORT_CHUNK_SIZE,
  )).entries()) {
    const updatedAt = nowIso();
    const scopedProductIds = await loadScopedInventoryRowIds(context, {
      ids: productChunk.map((product) => product.product_id ?? ""),
      ownerUserId: owner.ownerUserId,
      table: "inventory_products",
    });

    if (!scopedProductIds.ok) {
      failedRows += productChunk.length;
      rowErrors.push({
        field: "products",
        message:
          "Products import chunk failed while validating shop-scoped product references.",
        row: chunkIndex + 1,
        sheet: "Products",
      });
      continue;
    }

    const productRows = productChunk.map((product) => ({
      barcode: product.barcode,
      category_id: product.category_id ?? null,
      id:
        product.product_id && scopedProductIds.ids.has(product.product_id)
          ? product.product_id
          : randomUUID(),
      item_number: product.item_number ?? null,
      owner_user_id: owner.ownerUserId,
      product_name: product.product_name,
      purchase_price: product.purchase_price ?? null,
      retail_price: product.retail_price ?? null,
      second_product_name: product.second_product_name ?? null,
      shop_id: context.selectedShop.shopId,
      stock_quantity: product.stock_quantity ?? null,
      supplier_id: product.supplier_id ?? null,
      updated_at: updatedAt,
    }));

    const { data, error } = await context.supabase
      .from("inventory_products")
      .upsert(productRows, { onConflict: "id" })
      .select("id,barcode,item_number");

    if (error) {
      failedRows += productChunk.length;
      rowErrors.push({
        field: "products",
        message:
          "Products import chunk failed before completion. Re-run preview before retrying.",
        row: chunkIndex + 1,
        sheet: "Products",
      });
      continue;
    }

    const appliedRows = data ?? [];

    for (const product of appliedRows) {
      productIds.push({
        barcode: product.barcode,
        itemNumber: product.item_number,
        productId: product.id,
      });
    }

    productsApplied += appliedRows.length;
    failedRows += Math.max(productChunk.length - appliedRows.length, 0);
  }

  return {
    failedRows,
    productIds,
    productsApplied,
    rowErrors,
  };
}

export async function applyStaffAwareBulkPriceHistoryImport(
  context: StaffAwareContext,
  pricePayload: readonly StaffAwareBulkPriceHistoryImportPayload[],
) {
  const owner = await resolveInventoryOwner(context);

  if (!owner.ok) {
    return {
      failedRows: pricePayload.length,
      priceIds: [] as string[],
      priceHistoryApplied: 0,
      rowErrors: [staffBulkOwnerRowError(owner, "PriceHistory")],
    };
  }

  let failedRows = 0;
  let priceHistoryApplied = 0;
  const priceIds: string[] = [];
  const rowErrors: StaffAwareBulkImportRowError[] = [];

  for (const [chunkIndex, priceChunk] of Array.from(chunkRows(
    pricePayload,
    STAFF_AWARE_BULK_PRICE_HISTORY_IMPORT_CHUNK_SIZE,
  )).entries()) {
    const scopedProductIds = await loadScopedInventoryRowIds(context, {
      ids: priceChunk.map((price) => price.product_id),
      ownerUserId: owner.ownerUserId,
      table: "inventory_products",
    });

    if (!scopedProductIds.ok) {
      failedRows += priceChunk.length;
      rowErrors.push({
        field: "product_id",
        message:
          "Price history import chunk failed while validating shop-scoped product references.",
        row: chunkIndex + 1,
        sheet: "PriceHistory",
      });
      continue;
    }

    const scopedPriceChunk = priceChunk.filter((price) =>
      scopedProductIds.ids.has(price.product_id),
    );
    const rejectedRows = priceChunk.length - scopedPriceChunk.length;

    if (rejectedRows > 0) {
      failedRows += rejectedRows;
      rowErrors.push({
        field: "product_id",
        message:
          "PriceHistory product reference is not available in this shop.",
        row: chunkIndex + 1,
        sheet: "PriceHistory",
      });
    }

    if (scopedPriceChunk.length === 0) {
      continue;
    }

    const priceRows = scopedPriceChunk.map((price) => ({
      created_at: price.created_at ?? price.effective_at,
      effective_at: price.effective_at,
      id: price.price_id ?? randomUUID(),
      note: price.note ?? null,
      owner_user_id: owner.ownerUserId,
      price: price.price,
      product_id: price.product_id,
      shop_id: context.selectedShop.shopId,
      source: price.source ?? null,
      type: price.type,
    }));

    const { data, error } = await context.supabase
      .from("inventory_product_prices")
      .upsert(priceRows, {
        onConflict: "owner_user_id,product_id,type,effective_at",
      })
      .select("id");

    if (error) {
      failedRows += scopedPriceChunk.length;
      rowErrors.push({
        field: "priceHistory",
        message:
          "Price history import chunk failed before completion. Re-run preview before retrying.",
        row: chunkIndex + 1,
        sheet: "PriceHistory",
      });
      continue;
    }

    const appliedRows = data ?? [];
    priceIds.push(...appliedRows.map((row) => row.id));
    priceHistoryApplied += appliedRows.length;
    failedRows += Math.max(scopedPriceChunk.length - appliedRows.length, 0);
  }

  return {
    failedRows,
    priceIds,
    priceHistoryApplied,
    rowErrors,
  };
}

async function assertInventoryRelation(
  context: StaffAwareContext,
  input: {
    id?: string;
    ownerUserId: string;
    table: "inventory_categories" | "inventory_products" | "inventory_suppliers";
  },
) {
  if (!input.id) {
    return true;
  }

  const { data, error } = await context.supabase
    .from(input.table)
    .select("id,shop_id,owner_user_id")
    .eq("id", input.id)
    .is("deleted_at", null)
    .maybeSingle<InventoryScopedRow>();

  return (
    !error &&
    data !== null &&
    isInventoryScopedToShop(data, {
      ownerUserId: input.ownerUserId,
      shopId: context.selectedShop.shopId,
    })
  );
}

export async function createSupplierAsStaff(
  context: StaffAwareContext,
  input: CatalogEntityInput,
) {
  const owner = await resolveInventoryOwner(context);

  if (!owner.ok) {
    return owner.result;
  }

  const name = normalizeLabel(input.name);
  const { data, error } = await context.supabase
    .from("inventory_suppliers")
    .insert({
      name,
      owner_user_id: owner.ownerUserId,
      shop_id: context.selectedShop.shopId,
      updated_at: nowIso(),
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    const code = isUniqueViolation(error) ? "conflict" : "db_failure";

    return auditResult(context, {
      code,
      eventKey: "shop.catalog.supplier.create.failure",
      metadata: catalogAuditMetadata(owner),
      ok: false,
      result: code === "conflict" ? "blocked" : "failure",
      severity: code === "conflict" ? "warning" : "critical",
      targetType: "supplier",
    });
  }

  return auditResult(context, {
    code: "success",
    eventKey: "shop.catalog.supplier.create.success",
    metadata: catalogAuditMetadata(owner, { name_length: name.length }),
    result: "success",
    severity: "info",
    targetId: data.id,
    targetType: "supplier",
  });
}

export async function updateSupplierAsStaff(
  context: StaffAwareContext,
  input: CatalogEntityUpdateInput,
) {
  const owner = await resolveInventoryOwner(context);

  if (!owner.ok) {
    return owner.result;
  }

  const name = normalizeLabel(input.name);
  if (
    !(await assertInventoryRelation(context, {
      id: input.id,
      ownerUserId: owner.ownerUserId,
      table: "inventory_suppliers",
    }))
  ) {
    return auditResult(context, {
      code: "not_found",
      eventKey: "shop.catalog.supplier.update.failure",
      metadata: catalogAuditMetadata(owner),
      ok: false,
      result: "blocked",
      severity: "warning",
      targetId: input.id,
      targetType: "supplier",
    });
  }

  const { data, error } = await context.supabase
    .from("inventory_suppliers")
    .update({ name, updated_at: nowIso() })
    .eq("id", input.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    const code = isUniqueViolation(error) ? "conflict" : error ? "db_failure" : "not_found";

    return auditResult(context, {
      code,
      eventKey: "shop.catalog.supplier.update.failure",
      metadata: catalogAuditMetadata(owner),
      ok: false,
      result: code === "db_failure" ? "failure" : "blocked",
      severity: code === "db_failure" ? "critical" : "warning",
      targetId: input.id,
      targetType: "supplier",
    });
  }

  return auditResult(context, {
    code: "success",
    eventKey: "shop.catalog.supplier.update.success",
    metadata: catalogAuditMetadata(owner, { name_length: name.length }),
    result: "success",
    severity: "info",
    targetId: input.id,
    targetType: "supplier",
  });
}

export async function archiveSupplierAsStaff(
  context: StaffAwareContext,
  input: CatalogArchiveInput,
) {
  const owner = await resolveInventoryOwner(context);

  if (!owner.ok) {
    return owner.result;
  }

  if (
    !(await assertInventoryRelation(context, {
      id: input.id,
      ownerUserId: owner.ownerUserId,
      table: "inventory_suppliers",
    }))
  ) {
    return auditResult(context, {
      code: "not_found",
      eventKey: "shop.catalog.supplier.archive.failure",
      metadata: catalogAuditMetadata(owner, {
        reason_redacted: normalizeLabel(input.reason),
      }),
      ok: false,
      result: "blocked",
      severity: "warning",
      targetId: input.id,
      targetType: "supplier",
    });
  }

  const { data, error } = await context.supabase
    .from("inventory_suppliers")
    .update({ deleted_at: nowIso(), updated_at: nowIso() })
    .eq("id", input.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    return auditResult(context, {
      code: error ? "db_failure" : "not_found",
      eventKey: "shop.catalog.supplier.archive.failure",
      metadata: catalogAuditMetadata(owner, {
        reason_redacted: normalizeLabel(input.reason),
      }),
      ok: false,
      result: error ? "failure" : "blocked",
      severity: error ? "critical" : "warning",
      targetId: input.id,
      targetType: "supplier",
    });
  }

  return auditResult(context, {
    code: "success",
    eventKey: "shop.catalog.supplier.archive.success",
    metadata: catalogAuditMetadata(owner, {
      reason_redacted: normalizeLabel(input.reason),
    }),
    result: "success",
    severity: "warning",
    targetId: input.id,
    targetType: "supplier",
  });
}

export async function createCategoryAsStaff(
  context: StaffAwareContext,
  input: CatalogEntityInput,
) {
  const owner = await resolveInventoryOwner(context);

  if (!owner.ok) {
    return owner.result;
  }

  const name = normalizeLabel(input.name);
  const { data, error } = await context.supabase
    .from("inventory_categories")
    .insert({
      name,
      owner_user_id: owner.ownerUserId,
      shop_id: context.selectedShop.shopId,
      updated_at: nowIso(),
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    const code = isUniqueViolation(error) ? "conflict" : "db_failure";

    return auditResult(context, {
      code,
      eventKey: "shop.catalog.category.create.failure",
      metadata: catalogAuditMetadata(owner),
      ok: false,
      result: code === "conflict" ? "blocked" : "failure",
      severity: code === "conflict" ? "warning" : "critical",
      targetType: "category",
    });
  }

  return auditResult(context, {
    code: "success",
    eventKey: "shop.catalog.category.create.success",
    metadata: catalogAuditMetadata(owner, { name_length: name.length }),
    result: "success",
    severity: "info",
    targetId: data.id,
    targetType: "category",
  });
}

export async function updateCategoryAsStaff(
  context: StaffAwareContext,
  input: CatalogEntityUpdateInput,
) {
  const owner = await resolveInventoryOwner(context);

  if (!owner.ok) {
    return owner.result;
  }

  const name = normalizeLabel(input.name);
  if (
    !(await assertInventoryRelation(context, {
      id: input.id,
      ownerUserId: owner.ownerUserId,
      table: "inventory_categories",
    }))
  ) {
    return auditResult(context, {
      code: "not_found",
      eventKey: "shop.catalog.category.update.failure",
      metadata: catalogAuditMetadata(owner),
      ok: false,
      result: "blocked",
      severity: "warning",
      targetId: input.id,
      targetType: "category",
    });
  }

  const { data, error } = await context.supabase
    .from("inventory_categories")
    .update({ name, updated_at: nowIso() })
    .eq("id", input.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    const code = isUniqueViolation(error) ? "conflict" : error ? "db_failure" : "not_found";

    return auditResult(context, {
      code,
      eventKey: "shop.catalog.category.update.failure",
      metadata: catalogAuditMetadata(owner),
      ok: false,
      result: code === "db_failure" ? "failure" : "blocked",
      severity: code === "db_failure" ? "critical" : "warning",
      targetId: input.id,
      targetType: "category",
    });
  }

  return auditResult(context, {
    code: "success",
    eventKey: "shop.catalog.category.update.success",
    metadata: catalogAuditMetadata(owner, { name_length: name.length }),
    result: "success",
    severity: "info",
    targetId: input.id,
    targetType: "category",
  });
}

export async function archiveCategoryAsStaff(
  context: StaffAwareContext,
  input: CatalogArchiveInput,
) {
  const owner = await resolveInventoryOwner(context);

  if (!owner.ok) {
    return owner.result;
  }

  if (
    !(await assertInventoryRelation(context, {
      id: input.id,
      ownerUserId: owner.ownerUserId,
      table: "inventory_categories",
    }))
  ) {
    return auditResult(context, {
      code: "not_found",
      eventKey: "shop.catalog.category.archive.failure",
      metadata: catalogAuditMetadata(owner, {
        reason_redacted: normalizeLabel(input.reason),
      }),
      ok: false,
      result: "blocked",
      severity: "warning",
      targetId: input.id,
      targetType: "category",
    });
  }

  const { data, error } = await context.supabase
    .from("inventory_categories")
    .update({ deleted_at: nowIso(), updated_at: nowIso() })
    .eq("id", input.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    return auditResult(context, {
      code: error ? "db_failure" : "not_found",
      eventKey: "shop.catalog.category.archive.failure",
      metadata: catalogAuditMetadata(owner, {
        reason_redacted: normalizeLabel(input.reason),
      }),
      ok: false,
      result: error ? "failure" : "blocked",
      severity: error ? "critical" : "warning",
      targetId: input.id,
      targetType: "category",
    });
  }

  return auditResult(context, {
    code: "success",
    eventKey: "shop.catalog.category.archive.success",
    metadata: catalogAuditMetadata(owner, {
      reason_redacted: normalizeLabel(input.reason),
    }),
    result: "success",
    severity: "warning",
    targetId: input.id,
    targetType: "category",
  });
}

export async function createProductAsStaff(
  context: StaffAwareContext,
  input: ProductMutationInput,
) {
  const owner = await resolveInventoryOwner(context);

  if (!owner.ok) {
    return owner.result;
  }

  if (
    !(await assertInventoryRelation(context, {
      id: input.supplierId,
      ownerUserId: owner.ownerUserId,
      table: "inventory_suppliers",
    }))
  ) {
    return shopAdminActionResult("invalid_supplier", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  if (
    !(await assertInventoryRelation(context, {
      id: input.categoryId,
      ownerUserId: owner.ownerUserId,
      table: "inventory_categories",
    }))
  ) {
    return shopAdminActionResult("invalid_category", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const { data, error } = await context.supabase
    .from("inventory_products")
    .insert({
      barcode: normalizeLabel(input.barcode),
      category_id: input.categoryId,
      item_number: input.itemNumber,
      owner_user_id: owner.ownerUserId,
      product_name: normalizeLabel(input.productName),
      purchase_price: input.purchasePrice,
      retail_price: input.retailPrice,
      second_product_name: input.secondProductName,
      shop_id: context.selectedShop.shopId,
      stock_quantity: input.stockQuantity,
      supplier_id: input.supplierId,
      updated_at: nowIso(),
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    const code = isUniqueViolation(error) ? "conflict" : "db_failure";

    return auditResult(context, {
      code,
      eventKey: "shop.catalog.product.create.failure",
      metadata: catalogAuditMetadata(owner),
      ok: false,
      result: code === "conflict" ? "blocked" : "failure",
      severity: code === "conflict" ? "warning" : "critical",
      targetType: "product",
    });
  }

  return auditResult(context, {
    code: "success",
    eventKey: "shop.catalog.product.create.success",
    metadata: catalogAuditMetadata(owner, {
      barcode_length: normalizeLabel(input.barcode).length,
      has_category: Boolean(input.categoryId),
      has_supplier: Boolean(input.supplierId),
    }),
    result: "success",
    severity: "info",
    targetId: data.id,
    targetType: "product",
  });
}

export async function updateProductAsStaff(
  context: StaffAwareContext,
  input: ProductUpdateInput,
) {
  const owner = await resolveInventoryOwner(context);

  if (!owner.ok) {
    return owner.result;
  }

  if (
    !(await assertInventoryRelation(context, {
      id: input.supplierId,
      ownerUserId: owner.ownerUserId,
      table: "inventory_suppliers",
    }))
  ) {
    return shopAdminActionResult("invalid_supplier", {
      ok: false,
      shopId: context.selectedShop.shopId,
      targetId: input.productId,
    });
  }

  if (
    !(await assertInventoryRelation(context, {
      id: input.categoryId,
      ownerUserId: owner.ownerUserId,
      table: "inventory_categories",
    }))
  ) {
    return shopAdminActionResult("invalid_category", {
      ok: false,
      shopId: context.selectedShop.shopId,
      targetId: input.productId,
    });
  }

  if (
    !(await assertInventoryRelation(context, {
      id: input.productId,
      ownerUserId: owner.ownerUserId,
      table: "inventory_products",
    }))
  ) {
    return auditResult(context, {
      code: "not_found",
      eventKey: "shop.catalog.product.update.failure",
      metadata: catalogAuditMetadata(owner),
      ok: false,
      result: "blocked",
      severity: "warning",
      targetId: input.productId,
      targetType: "product",
    });
  }

  const { data, error } = await context.supabase
    .from("inventory_products")
    .update({
      barcode: normalizeLabel(input.barcode),
      category_id: input.categoryId,
      item_number: input.itemNumber,
      product_name: normalizeLabel(input.productName),
      purchase_price: input.purchasePrice,
      retail_price: input.retailPrice,
      second_product_name: input.secondProductName,
      stock_quantity: input.stockQuantity,
      supplier_id: input.supplierId,
      updated_at: nowIso(),
    })
    .eq("id", input.productId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    const code = isUniqueViolation(error) ? "conflict" : error ? "db_failure" : "not_found";

    return auditResult(context, {
      code,
      eventKey: "shop.catalog.product.update.failure",
      metadata: catalogAuditMetadata(owner),
      ok: false,
      result: code === "db_failure" ? "failure" : "blocked",
      severity: code === "db_failure" ? "critical" : "warning",
      targetId: input.productId,
      targetType: "product",
    });
  }

  return auditResult(context, {
    code: "success",
    eventKey: "shop.catalog.product.update.success",
    metadata: catalogAuditMetadata(owner),
    result: "success",
    severity: "info",
    targetId: input.productId,
    targetType: "product",
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
  const owner = await resolveInventoryOwner(context);

  if (!owner.ok) {
    return owner.result;
  }

  if (
    !(await assertInventoryRelation(context, {
      id: input.id,
      ownerUserId: owner.ownerUserId,
      table: "inventory_products",
    }))
  ) {
    return auditResult(context, {
      code: "invalid_state_or_not_found",
      eventKey: archived
        ? "shop.catalog.product.archive.failure"
        : "shop.catalog.product.restore.failure",
      metadata: catalogAuditMetadata(owner, {
        reason_redacted: normalizeLabel(input.reason),
      }),
      ok: false,
      result: "blocked",
      severity: "warning",
      targetId: input.id,
      targetType: "product",
    });
  }

  const productUpdate = context.supabase
    .from("inventory_products")
    .update({ deleted_at: archived ? nowIso() : null, updated_at: nowIso() })
    .eq("id", input.id);
  const filteredProductUpdate = archived
    ? productUpdate.is("deleted_at", null)
    : productUpdate.not("deleted_at", "is", null);
  const { data, error } = await filteredProductUpdate
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    return auditResult(context, {
      code: error ? "db_failure" : "invalid_state_or_not_found",
      eventKey: archived
        ? "shop.catalog.product.archive.failure"
        : "shop.catalog.product.restore.failure",
      metadata: catalogAuditMetadata(owner, {
        reason_redacted: normalizeLabel(input.reason),
      }),
      ok: false,
      result: error ? "failure" : "blocked",
      severity: error ? "critical" : "warning",
      targetId: input.id,
      targetType: "product",
    });
  }

  return auditResult(context, {
    code: "success",
    eventKey: archived
      ? "shop.catalog.product.archive.success"
      : "shop.catalog.product.restore.success",
    metadata: catalogAuditMetadata(owner, {
      reason_redacted: normalizeLabel(input.reason),
    }),
    result: "success",
    severity: "warning",
    targetId: input.id,
    targetType: "product",
  });
}

async function revokeActiveStaffWebSessions(
  context: StaffAwareContext,
  input: {
    reason: string;
    staffId: string;
  },
) {
  await context.supabase
    .from("staff_web_sessions")
    .update({
      revoked_at: nowIso(),
      revoked_reason: input.reason.slice(0, 240),
      status: STAFF_WEB_SESSION_REVOKED_STATUS,
      updated_at: nowIso(),
    })
    .eq("shop_id", context.selectedShop.shopId)
    .eq("staff_id", input.staffId)
    .eq("status", "active");
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
  const { data, error } = await context.supabase
    .from("staff_accounts")
    .insert({
      credential_hash: credentialHash,
      credential_kind: credentialKind,
      credential_status: "rotation_required",
      credential_updated_at: nowIso(),
      display_name: displayName,
      must_change_credential: true,
      role_key: roleKey,
      shop_id: context.selectedShop.shopId,
      staff_code: staffCode,
      status: "active",
      updated_at: nowIso(),
    })
    .select("staff_id")
    .maybeSingle<Pick<Tables<"staff_accounts">, "staff_id">>();

  if (error || !data) {
    const code = isUniqueViolation(error) ? "duplicate_staff_code" : "db_failure";

    return auditResult(context, {
      code,
      eventKey: "shop.staff.create.failure",
      metadata: { role_key: roleKey, staff_code_length: staffCode.length },
      ok: false,
      result: code === "duplicate_staff_code" ? "blocked" : "failure",
      severity: code === "duplicate_staff_code" ? "warning" : "critical",
      targetType: "staff",
    });
  }

  return auditResult(context, {
    code: "success",
    eventKey: "shop.staff.create.success",
    metadata: { credential_kind: credentialKind, role_key: roleKey },
    result: "success",
    severity: "info",
    targetId: data.staff_id,
    targetType: "staff",
  });
}

async function getStaffCredentialVersion(
  context: StaffAwareContext,
  staffId: string,
) {
  const { data } = await context.supabase
    .from("staff_accounts")
    .select("credential_version")
    .eq("shop_id", context.selectedShop.shopId)
    .eq("staff_id", staffId)
    .neq("status", "archived")
    .maybeSingle<Pick<Tables<"staff_accounts">, "credential_version">>();

  return data?.credential_version;
}

export async function resetStaffCredentialAsStaff(
  context: StaffAwareContext,
  input: StaffMutationInput,
) {
  const staffId = normalizeLabel(input.staffId);
  const version = await getStaffCredentialVersion(context, staffId);

  if (!version) {
    return shopAdminActionResult("not_found", {
      ok: false,
      shopId: context.selectedShop.shopId,
      targetId: staffId,
    });
  }

  const { data, error } = await context.supabase
    .from("staff_accounts")
    .update({
      credential_hash: normalizeLabel(input.credentialHash),
      credential_kind: normalizeLabel(input.credentialKind),
      credential_status: "rotation_required",
      credential_updated_at: nowIso(),
      credential_version: version + 1,
      failed_attempts: 0,
      locked_until: null,
      must_change_credential: true,
      session_invalidated_at: nowIso(),
      status: "active",
      updated_at: nowIso(),
    })
    .eq("shop_id", context.selectedShop.shopId)
    .eq("staff_id", staffId)
    .neq("status", "archived")
    .select("staff_id")
    .maybeSingle<Pick<Tables<"staff_accounts">, "staff_id">>();

  if (error || !data) {
    return auditResult(context, {
      code: error ? "db_failure" : "not_found",
      eventKey: "shop.staff.credential.reset.failure",
      metadata: { reason_redacted: normalizeLabel(input.reason) },
      ok: false,
      result: error ? "failure" : "blocked",
      severity: error ? "critical" : "warning",
      targetId: staffId,
      targetType: "staff",
    });
  }

  await revokeActiveStaffWebSessions(context, {
    reason: "credential_reset",
    staffId,
  });

  return auditResult(context, {
    code: "success",
    eventKey: "shop.staff.credential.reset.success",
    metadata: {
      credential_kind: normalizeLabel(input.credentialKind),
      reason_redacted: normalizeLabel(input.reason),
      session_invalidated: true,
    },
    result: "success",
    severity: "warning",
    targetId: staffId,
    targetType: "staff",
  });
}

export async function setStaffStatusAsStaff(
  context: StaffAwareContext,
  input: StaffMutationInput & {
    eventBase: string;
    nextStatus: "active" | "archived" | "suspended";
  },
) {
  const staffId = normalizeLabel(input.staffId);
  const { data, error } = await context.supabase
    .from("staff_accounts")
    .update({
      session_invalidated_at: input.nextStatus === "active" ? undefined : nowIso(),
      status: input.nextStatus,
      updated_at: nowIso(),
    })
    .eq("shop_id", context.selectedShop.shopId)
    .eq("staff_id", staffId)
    .neq("status", "archived")
    .select("staff_id")
    .maybeSingle<Pick<Tables<"staff_accounts">, "staff_id">>();

  if (error || !data) {
    return auditResult(context, {
      code: error ? "db_failure" : "invalid_state_or_not_found",
      eventKey: `${input.eventBase}.failure`,
      metadata: { reason_redacted: normalizeLabel(input.reason) },
      ok: false,
      result: error ? "failure" : "blocked",
      severity: error ? "critical" : "warning",
      targetId: staffId,
      targetType: "staff",
    });
  }

  if (input.nextStatus !== "active") {
    await revokeActiveStaffWebSessions(context, {
      reason: input.nextStatus,
      staffId,
    });
  }

  return auditResult(context, {
    code: "success",
    eventKey: `${input.eventBase}.success`,
    metadata: { reason_redacted: normalizeLabel(input.reason) },
    result: "success",
    severity: input.nextStatus === "active" ? "info" : "warning",
    targetId: staffId,
    targetType: "staff",
  });
}

export async function forceStaffCredentialRotationAsStaff(
  context: StaffAwareContext,
  input: StaffMutationInput,
) {
  const staffId = normalizeLabel(input.staffId);
  const { data, error } = await context.supabase
    .from("staff_accounts")
    .update({
      credential_status: "rotation_required",
      must_change_credential: true,
      session_invalidated_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("shop_id", context.selectedShop.shopId)
    .eq("staff_id", staffId)
    .neq("status", "archived")
    .select("staff_id")
    .maybeSingle<Pick<Tables<"staff_accounts">, "staff_id">>();

  if (error || !data) {
    return auditResult(context, {
      code: error ? "db_failure" : "invalid_state_or_not_found",
      eventKey: "shop.staff.credential.rotation.force.failure",
      metadata: { reason_redacted: normalizeLabel(input.reason) },
      ok: false,
      result: error ? "failure" : "blocked",
      severity: error ? "critical" : "warning",
      targetId: staffId,
      targetType: "staff",
    });
  }

  await revokeActiveStaffWebSessions(context, {
    reason: "credential_rotation_required",
    staffId,
  });

  return auditResult(context, {
    code: "success",
    eventKey: "shop.staff.credential.rotation.force.success",
    metadata: { reason_redacted: normalizeLabel(input.reason) },
    result: "success",
    severity: "warning",
    targetId: staffId,
    targetType: "staff",
  });
}

export async function clearStaffLockoutAsStaff(
  context: StaffAwareContext,
  input: StaffMutationInput,
) {
  const staffId = normalizeLabel(input.staffId);
  const { data, error } = await context.supabase
    .from("staff_accounts")
    .update({
      credential_status: "active",
      failed_attempts: 0,
      locked_until: null,
      updated_at: nowIso(),
    })
    .eq("shop_id", context.selectedShop.shopId)
    .eq("staff_id", staffId)
    .neq("status", "archived")
    .select("staff_id")
    .maybeSingle<Pick<Tables<"staff_accounts">, "staff_id">>();

  if (error || !data) {
    return auditResult(context, {
      code: error ? "db_failure" : "invalid_state_or_not_found",
      eventKey: "shop.staff.lockout.clear.failure",
      metadata: { reason_redacted: normalizeLabel(input.reason) },
      ok: false,
      result: error ? "failure" : "blocked",
      severity: error ? "critical" : "warning",
      targetId: staffId,
      targetType: "staff",
    });
  }

  return auditResult(context, {
    code: "success",
    eventKey: "shop.staff.lockout.clear.success",
    metadata: { reason_redacted: normalizeLabel(input.reason) },
    result: "success",
    severity: "info",
    targetId: staffId,
    targetType: "staff",
  });
}

export async function revokeStaffWebAccessAsStaff(
  context: StaffAwareContext,
  input: StaffMutationInput,
) {
  const staffId = normalizeLabel(input.staffId);
  const reason = normalizeLabel(input.reason);
  const { data, error } = await context.supabase
    .from("staff_accounts")
    .update({
      session_invalidated_at: nowIso(),
      updated_at: nowIso(),
      web_access_revoked_at: nowIso(),
      web_access_revoked_by_staff_id: context.actorStaffId,
      web_access_revoked_reason: reason.slice(0, 240),
    })
    .eq("shop_id", context.selectedShop.shopId)
    .eq("staff_id", staffId)
    .neq("status", "archived")
    .select("staff_id")
    .maybeSingle<Pick<Tables<"staff_accounts">, "staff_id">>();

  if (error || !data) {
    return auditResult(context, {
      code: error ? "db_failure" : "invalid_state_or_not_found",
      eventKey: "shop.staff.web_access.revoke.failure",
      metadata: { reason_redacted: reason },
      ok: false,
      result: error ? "failure" : "blocked",
      severity: error ? "critical" : "warning",
      targetId: staffId,
      targetType: "staff",
    });
  }

  await revokeActiveStaffWebSessions(context, {
    reason: "web_access_revoked",
    staffId,
  });

  return auditResult(context, {
    code: "success",
    eventKey: "shop.staff.web_access.revoke.success",
    metadata: { reason_redacted: reason },
    result: "success",
    severity: "warning",
    targetId: staffId,
    targetType: "staff",
  });
}

export async function revokeStaffWebSessionsAsStaff(
  context: StaffAwareContext,
  input: StaffMutationInput,
) {
  const staffId = normalizeLabel(input.staffId);
  const reason = normalizeLabel(input.reason) || "operator_revoked_sessions";
  const revokedAt = nowIso();
  const { data, error } = await context.supabase
    .from("staff_accounts")
    .update({
      session_invalidated_at: revokedAt,
      updated_at: revokedAt,
    })
    .eq("shop_id", context.selectedShop.shopId)
    .eq("staff_id", staffId)
    .neq("status", "archived")
    .select("staff_id")
    .maybeSingle<Pick<Tables<"staff_accounts">, "staff_id">>();

  if (error || !data) {
    return auditResult(context, {
      code: error ? "db_failure" : "invalid_state_or_not_found",
      eventKey: "shop.staff.web_sessions.revoke.failure",
      metadata: { reason_redacted: reason },
      ok: false,
      result: error ? "failure" : "blocked",
      severity: error ? "critical" : "warning",
      targetId: staffId,
      targetType: "staff",
    });
  }

  await revokeActiveStaffWebSessions(context, {
    reason,
    staffId,
  });

  return auditResult(context, {
    code: "success",
    eventKey: "shop.staff.web_sessions.revoke.success",
    metadata: { reason_redacted: reason },
    result: "success",
    severity: "warning",
    targetId: staffId,
    targetType: "staff",
  });
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

  if (!hasStaffFullShopAdminWebAccess(context.staffPermissions)) {
    return auditResult(context, {
      code: "unauthorized",
      eventKey: "shop.staff.permissions.update.failure",
      metadata: { permission_count: permissions.length, role_key: roleKey },
      ok: false,
      result: "blocked",
      severity: "warning",
      targetId: roleKey,
      targetType: "staff_role",
    });
  }

  const error = await replaceStaffRolePermissions(context.supabase, {
    permissions,
    roleKey,
    shopId: context.selectedShop.shopId,
  });

  if (error) {
    return auditResult(context, {
      code: "db_failure",
      eventKey: "shop.staff.permissions.update.failure",
      metadata: { permission_count: permissions.length, role_key: roleKey },
      ok: false,
      result: "failure",
      severity: "critical",
      targetId: roleKey,
      targetType: "staff_role",
    });
  }

  return auditResult(context, {
    code: "success",
    eventKey: "shop.staff.permissions.update.success",
    metadata: { permission_count: permissions.length, role_key: roleKey },
    result: "success",
    severity: "warning",
    targetId: roleKey,
    targetType: "staff_role",
  });
}

export async function registerDeviceAsStaff(
  context: StaffAwareContext,
  input: DeviceMutationInput,
) {
  const deviceIdentifier = normalizeLabel(input.deviceIdentifier);
  const displayName = normalizeLabel(input.displayName) || deviceIdentifier;
  const existing = await context.supabase
    .from("shop_devices")
    .select("shop_device_id,status")
    .eq("shop_id", context.selectedShop.shopId)
    .eq("device_identifier", deviceIdentifier)
    .maybeSingle<Pick<Tables<"shop_devices">, "shop_device_id" | "status">>();

  if (existing.error) {
    return auditResult(context, {
      code: "db_failure",
      eventKey: "shop.device.register.failure",
      ok: false,
      result: "failure",
      severity: "critical",
      targetType: "device",
    });
  }

  const seenAt = nowIso();
  const nextStatus =
    existing.data?.status === "revoked" || existing.data?.status === "suspicious"
      ? existing.data.status
      : "active";
  const mutationResult = existing.data
    ? await context.supabase
        .from("shop_devices")
        .update({
          app_version: input.appVersion,
          device_type: input.deviceType ?? "unknown",
          display_name: displayName,
          last_seen_at: seenAt,
          last_seen_principal_kind: "pos_staff",
          last_seen_profile_id: null,
          last_seen_staff_id: context.actorStaffId,
          metadata_redacted: {},
          status: nextStatus,
          updated_at: seenAt,
        })
        .eq("shop_id", context.selectedShop.shopId)
        .eq("shop_device_id", existing.data.shop_device_id)
        .select("shop_device_id")
        .maybeSingle<Pick<Tables<"shop_devices">, "shop_device_id">>()
    : await context.supabase
        .from("shop_devices")
        .insert({
          app_version: input.appVersion,
          device_identifier: deviceIdentifier,
          device_type: input.deviceType ?? "unknown",
          display_name: displayName,
          last_seen_at: seenAt,
          last_seen_principal_kind: "pos_staff",
          last_seen_staff_id: context.actorStaffId,
          metadata_redacted: {},
          shop_id: context.selectedShop.shopId,
          status: "active",
          updated_at: seenAt,
        })
        .select("shop_device_id")
        .maybeSingle<Pick<Tables<"shop_devices">, "shop_device_id">>();
  const { data, error } = mutationResult;

  if (error || !data) {
    return auditResult(context, {
      code: "db_failure",
      eventKey: "shop.device.register.failure",
      ok: false,
      result: "failure",
      severity: "critical",
      targetType: "device",
    });
  }

  return auditResult(context, {
    code: "success",
    eventKey: "shop.device.register.success",
    metadata: { device_type: input.deviceType ?? "unknown" },
    result: "success",
    severity: "info",
    targetId: data.shop_device_id,
    targetType: "device",
  });
}

export async function renameDeviceAsStaff(
  context: StaffAwareContext,
  input: DeviceMutationInput,
) {
  const deviceId = normalizeLabel(input.deviceId);
  const { data, error } = await context.supabase
    .from("shop_devices")
    .update({ display_name: normalizeLabel(input.displayName), updated_at: nowIso() })
    .eq("shop_id", context.selectedShop.shopId)
    .eq("shop_device_id", deviceId)
    .select("shop_device_id")
    .maybeSingle<Pick<Tables<"shop_devices">, "shop_device_id">>();

  if (error || !data) {
    return auditResult(context, {
      code: error ? "db_failure" : "not_found",
      eventKey: "shop.device.rename.failure",
      ok: false,
      result: error ? "failure" : "blocked",
      severity: error ? "critical" : "warning",
      targetId: deviceId,
      targetType: "device",
    });
  }

  return auditResult(context, {
    code: "success",
    eventKey: "shop.device.rename.success",
    metadata: { name_length: normalizeLabel(input.displayName).length },
    result: "success",
    severity: "info",
    targetId: deviceId,
    targetType: "device",
  });
}

export async function setDeviceStatusAsStaff(
  context: StaffAwareContext,
  input: DeviceMutationInput & { nextStatus: "active" | "revoked" },
) {
  const deviceId = normalizeLabel(input.deviceId);
  const now = nowIso();
  const { data, error } = await context.supabase
    .from("shop_devices")
    .update({
      reactivated_at: input.nextStatus === "active" ? now : null,
      revoked_at: input.nextStatus === "revoked" ? now : null,
      status: input.nextStatus,
      updated_at: now,
    })
    .eq("shop_id", context.selectedShop.shopId)
    .eq("shop_device_id", deviceId)
    .select("shop_device_id")
    .maybeSingle<Pick<Tables<"shop_devices">, "shop_device_id">>();

  if (error || !data) {
    return auditResult(context, {
      code: error ? "db_failure" : "invalid_state_or_not_found",
      eventKey:
        input.nextStatus === "active"
          ? "shop.device.reactivate.failure"
          : "shop.device.revoke.failure",
      metadata: { reason_redacted: normalizeLabel(input.reason) },
      ok: false,
      result: error ? "failure" : "blocked",
      severity: error ? "critical" : "warning",
      targetId: deviceId,
      targetType: "device",
    });
  }

  return auditResult(context, {
    code: "success",
    eventKey:
      input.nextStatus === "active"
        ? "shop.device.reactivate.success"
        : "shop.device.revoke.success",
    metadata: { reason_redacted: normalizeLabel(input.reason) },
    result: "success",
    severity: "warning",
    targetId: deviceId,
    targetType: "device",
  });
}
