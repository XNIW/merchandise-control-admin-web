import "server-only";

import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { verifyPosSecret } from "./tokens";

type ShopRow = Pick<
  Tables<"shops">,
  "shop_code" | "shop_id" | "shop_name" | "shop_status"
>;
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
type ShopDeviceRow = Pick<
  Tables<"shop_devices">,
  "shop_device_id" | "shop_id" | "status"
>;
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
  "owner_user_id" | "shop_id"
>;
type ProductRow = Pick<
  Tables<"inventory_products">,
  | "barcode"
  | "category_id"
  | "id"
  | "item_number"
  | "product_name"
  | "purchase_price"
  | "retail_price"
  | "second_product_name"
  | "stock_quantity"
  | "supplier_id"
  | "updated_at"
>;
type CategoryRow = Pick<Tables<"inventory_categories">, "id" | "name" | "updated_at">;
type SupplierRow = Pick<Tables<"inventory_suppliers">, "id" | "name" | "updated_at">;
type PriceRow = Pick<
  Tables<"inventory_product_prices">,
  "created_at" | "effective_at" | "id" | "price" | "product_id" | "source" | "type"
>;

type JsonRecord = { [key: string]: Json | undefined };

type PosCatalogFailureCode =
  | "db_failure"
  | "denied"
  | "not_configured"
  | "unmapped"
  | "validation_failed";

type PosCatalogEndpointResult =
  | {
      body: {
        code: PosCatalogFailureCode;
        message: string;
        ok: false;
      };
      status: 400 | 401 | 409 | 500 | 503;
    }
  | {
      body: {
        catalog: {
          categories: Array<{
            categoryId: string;
            name: string;
            updatedAt: string;
          }>;
          prices: Array<{
            effectiveAt: string;
            price: number;
            priceId: string;
            productId: string;
            source: string | null;
            type: string;
          }>;
          products: Array<{
            barcode: string;
            categoryId: string | null;
            itemNumber: string | null;
            productId: string;
            productName: string | null;
            purchasePrice: number | null;
            retailPrice: number | null;
            secondProductName: string | null;
            stockQuantity: number | null;
            supplierId: string | null;
            updatedAt: string;
          }>;
          suppliers: Array<{
            name: string;
            supplierId: string;
            updatedAt: string;
          }>;
        };
        code: "success";
        generatedAt: string;
        ok: true;
        schemaVersion: 1;
        shop: {
          shopCode: string;
          shopId: string;
          shopName: string;
        };
        syncCursor: string | null;
        syncMode: "full_refresh";
      };
      status: 200;
    };

export type PosCatalogPullRequestMeta = {
  userAgent?: string;
};

type ParsedCatalogPullInput = {
  appVersion?: string;
  deviceToken: string;
  posSessionId: string;
  sessionToken: string;
  shopDeviceId: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_POS_SECRET_LENGTH = 256;
const MAX_CATALOG_ROWS = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

function normalizeLabel(value: string, maxLength: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function nowIso() {
  return new Date().toISOString();
}

function isFutureTimestamp(value: string | null) {
  return Boolean(value && Date.parse(value) > Date.now());
}

function isAfterTimestamp(left: string | null, right: string) {
  return Boolean(left && Date.parse(left) > Date.parse(right));
}

function failure(
  code: PosCatalogFailureCode,
  status: 400 | 401 | 409 | 500 | 503,
): PosCatalogEndpointResult {
  const message =
    code === "not_configured"
      ? "POS catalog backend is not configured."
      : code === "validation_failed"
        ? "Request payload is invalid."
        : code === "unmapped"
          ? "This shop has no mapped catalog source."
          : "POS catalog pull was denied.";

  return {
    body: {
      code,
      message,
      ok: false,
    },
    status,
  };
}

function parseCatalogPullInput(input: unknown): ParsedCatalogPullInput | null {
  if (!isRecord(input)) {
    return null;
  }

  const appVersion =
    normalizeLabel(stringField(input, "appVersion", "app_version"), 80) ||
    undefined;
  const deviceToken = stringField(input, "deviceToken", "device_token");
  const posSessionId = stringField(input, "posSessionId", "pos_session_id");
  const sessionToken = stringField(input, "sessionToken", "session_token");
  const shopDeviceId = stringField(input, "shopDeviceId", "shop_device_id");

  if (
    !UUID_PATTERN.test(posSessionId) ||
    !UUID_PATTERN.test(shopDeviceId) ||
    deviceToken.length === 0 ||
    deviceToken.length > MAX_POS_SECRET_LENGTH ||
    sessionToken.length === 0 ||
    sessionToken.length > MAX_POS_SECRET_LENGTH
  ) {
    return null;
  }

  return {
    appVersion,
    deviceToken,
    posSessionId,
    sessionToken,
    shopDeviceId,
  };
}

function requestMetadata(meta: PosCatalogPullRequestMeta): JsonRecord {
  return {
    source: "TASK-026",
    user_agent_length: meta.userAgent?.length ?? 0,
    user_agent_present: Boolean(meta.userAgent),
  };
}

async function getSupabaseForPosCatalog() {
  const config = resolveSupabaseAdminConfig();

  if (config.status !== "configured") {
    return null;
  }

  return createSupabaseAdminClient(config);
}

async function writePosCatalogAudit(
  supabase: SupabaseAdminClient,
  input: {
    code: string;
    metadata?: JsonRecord;
    result: "blocked" | "failure" | "success";
    severity: "critical" | "info" | "warning";
    shopId?: string;
    targetId?: string;
    targetType?: string;
  },
) {
  const { error } = await supabase.from("audit_logs").insert({
    actor_profile_id: null,
    event_key:
      input.result === "success"
        ? "pos.catalog.pull.success"
        : "pos.catalog.pull.failure",
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
    code: PosCatalogFailureCode;
    metadata?: JsonRecord;
    shopId?: string;
    status: 400 | 401 | 409 | 500;
    targetId?: string;
    targetType?: string;
  },
): Promise<PosCatalogEndpointResult> {
  const auditOk = await writePosCatalogAudit(supabase, {
    code: input.code,
    metadata: input.metadata,
    result: input.status === 500 ? "failure" : "blocked",
    severity: input.status === 500 ? "critical" : "warning",
    shopId: input.shopId,
    targetId: input.targetId,
    targetType: input.targetType,
  });

  if (!auditOk) {
    return failure("db_failure", 500);
  }

  return failure(input.code, input.status);
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

function maxUpdatedAt(...collections: Array<readonly { updated_at?: string }[]>) {
  const values = collections
    .flatMap((collection) => collection.map((row) => row.updated_at))
    .filter((value): value is string => Boolean(value));

  return values.length > 0
    ? values.reduce((latest, value) =>
        Date.parse(value) > Date.parse(latest) ? value : latest,
      )
    : null;
}

export async function handlePosCatalogPull(
  input: unknown,
  meta: PosCatalogPullRequestMeta = {},
): Promise<PosCatalogEndpointResult> {
  const supabase = await getSupabaseForPosCatalog();

  if (!supabase) {
    return failure("not_configured", 503);
  }

  const parsed = parseCatalogPullInput(input);

  if (!parsed) {
    return auditedFailure(supabase, {
      code: "validation_failed",
      metadata: requestMetadata(meta),
      status: 400,
    });
  }

  const sessionResult = await supabase
    .from("pos_sessions")
    .select(
      "pos_session_id,shop_id,shop_device_id,staff_id,pos_device_credential_id,session_token_hash,staff_credential_version,status,issued_at,expires_at",
    )
    .eq("pos_session_id", parsed.posSessionId)
    .eq("shop_device_id", parsed.shopDeviceId)
    .maybeSingle<PosSessionRow>();

  if (sessionResult.error) {
    return auditedFailure(supabase, {
      code: "db_failure",
      metadata: requestMetadata(meta),
      status: 500,
    });
  }

  const session = sessionResult.data;
  const sessionValid = Boolean(
    session &&
      session.status === "active" &&
      isFutureTimestamp(session.expires_at) &&
      verifyPosSecret(parsed.sessionToken, session.session_token_hash),
  );

  if (!session || !sessionValid) {
    return auditedFailure(supabase, {
      code: "denied",
      metadata: requestMetadata(meta),
      shopId: session?.shop_id,
      status: 401,
      targetId: session?.pos_session_id,
      targetType: session ? "pos_session" : undefined,
    });
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
        .select("shop_id,shop_code,shop_name,shop_status")
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
    return auditedFailure(supabase, {
      code: "db_failure",
      metadata: requestMetadata(meta),
      shopId: session.shop_id,
      status: 500,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
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
      isStaffUsable(staff) &&
      device?.status === "active" &&
      staff &&
      staff.credential_version === credential?.staff_credential_version &&
      session.staff_credential_version === staff.credential_version &&
      !isAfterTimestamp(staff.session_invalidated_at, session.issued_at),
  );

  if (!runtimeValid || !shop) {
    return auditedFailure(supabase, {
      code: "denied",
      metadata: {
        ...requestMetadata(meta),
        app_version_present: Boolean(parsed.appVersion),
        device_resolved: Boolean(device),
        shop_resolved: Boolean(shop),
        staff_resolved: Boolean(staff),
      },
      shopId: session.shop_id,
      status: 401,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }

  const mappingResult = await supabase
    .from("shop_inventory_sources")
    .select("shop_id,owner_user_id")
    .eq("shop_id", session.shop_id)
    .eq("mapping_state", "mapped")
    .is("disabled_at", null)
    .not("owner_user_id", "is", null)
    .maybeSingle<InventorySourceRow>();

  if (mappingResult.error) {
    return auditedFailure(supabase, {
      code: "db_failure",
      metadata: requestMetadata(meta),
      shopId: session.shop_id,
      status: 500,
      targetId: session.shop_device_id,
      targetType: "device",
    });
  }

  const ownerUserId = mappingResult.data?.owner_user_id;

  if (!ownerUserId) {
    return auditedFailure(supabase, {
      code: "unmapped",
      metadata: requestMetadata(meta),
      shopId: session.shop_id,
      status: 409,
      targetId: session.shop_device_id,
      targetType: "device",
    });
  }

  const [productsResult, categoriesResult, suppliersResult, pricesResult] =
    await Promise.all([
      supabase
        .from("inventory_products")
        .select(
          "id,barcode,item_number,product_name,second_product_name,purchase_price,retail_price,stock_quantity,supplier_id,category_id,updated_at",
        )
        .eq("owner_user_id", ownerUserId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(MAX_CATALOG_ROWS),
      supabase
        .from("inventory_categories")
        .select("id,name,updated_at")
        .eq("owner_user_id", ownerUserId)
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .limit(MAX_CATALOG_ROWS),
      supabase
        .from("inventory_suppliers")
        .select("id,name,updated_at")
        .eq("owner_user_id", ownerUserId)
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .limit(MAX_CATALOG_ROWS),
      supabase
        .from("inventory_product_prices")
        .select("id,product_id,type,price,effective_at,source,created_at")
        .eq("owner_user_id", ownerUserId)
        .order("created_at", { ascending: false })
        .limit(MAX_CATALOG_ROWS),
    ]);

  if (
    productsResult.error ||
    categoriesResult.error ||
    suppliersResult.error ||
    pricesResult.error
  ) {
    return auditedFailure(supabase, {
      code: "db_failure",
      metadata: requestMetadata(meta),
      shopId: session.shop_id,
      status: 500,
      targetId: session.shop_device_id,
      targetType: "device",
    });
  }

  const products = (productsResult.data ?? []) as ProductRow[];
  const categories = (categoriesResult.data ?? []) as CategoryRow[];
  const suppliers = (suppliersResult.data ?? []) as SupplierRow[];
  const prices = (pricesResult.data ?? []) as PriceRow[];
  const auditOk = await writePosCatalogAudit(supabase, {
    code: "success",
    metadata: {
      ...requestMetadata(meta),
      app_version_present: Boolean(parsed.appVersion),
      categories: categories.length,
      prices: prices.length,
      products: products.length,
      suppliers: suppliers.length,
      sync_mode: "full_refresh",
    },
    result: "success",
    severity: "info",
    shopId: session.shop_id,
    targetId: session.shop_device_id,
    targetType: "device",
  });

  if (!auditOk) {
    return failure("db_failure", 500);
  }

  return {
    body: {
      catalog: {
        categories: categories.map((category) => ({
          categoryId: category.id,
          name: category.name,
          updatedAt: category.updated_at,
        })),
        prices: prices.map((price) => ({
          effectiveAt: price.effective_at,
          price: price.price,
          priceId: price.id,
          productId: price.product_id,
          source: price.source,
          type: price.type,
        })),
        products: products.map((product) => ({
          barcode: product.barcode,
          categoryId: product.category_id,
          itemNumber: product.item_number,
          productId: product.id,
          productName: product.product_name,
          purchasePrice: product.purchase_price,
          retailPrice: product.retail_price,
          secondProductName: product.second_product_name,
          stockQuantity: product.stock_quantity,
          supplierId: product.supplier_id,
          updatedAt: product.updated_at,
        })),
        suppliers: suppliers.map((supplier) => ({
          name: supplier.name,
          supplierId: supplier.id,
          updatedAt: supplier.updated_at,
        })),
      },
      code: "success",
      generatedAt: nowIso(),
      ok: true,
      schemaVersion: 1,
      shop: {
        shopCode: shop.shop_code,
        shopId: shop.shop_id,
        shopName: shop.shop_name,
      },
      syncCursor: maxUpdatedAt(products, categories, suppliers),
      syncMode: "full_refresh",
    },
    status: 200,
  };
}
