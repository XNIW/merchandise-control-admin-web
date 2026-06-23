import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID, scrypt } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  assertLocalTargetEnv,
  parseSupabaseStatusEnv,
} from "../../scripts/testing/target-guardrails.mjs";

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

type RuntimeEnv = {
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  TEST_TARGET: "local";
};

type SupabaseStatusEnv = {
  ANON_KEY?: string;
  API_URL?: string;
  PUBLISHABLE_KEY?: string;
  SERVICE_ROLE_KEY?: string;
};

type Dataset = {
  categoryId: string;
  deviceIdentifier: string;
  email: string;
  ownerUserId: string;
  password: string;
  posCredential: string;
  productBarcode: string;
  productId: string;
  productName: string;
  runId: string;
  shopCode: string;
  shopId: string;
  staffCode: string;
  staffId: string;
  supplierId: string;
};

type PosAuth = {
  deviceToken: string;
  posSessionId: string;
  sessionToken: string;
  shopDeviceId: string;
};

type SaleSeed = {
  amountClp: number;
  businessDate: string;
  clientOriginalSaleId?: string;
  clientSaleId: string;
  fiscalStatus: string;
  kind: "refund" | "sale" | "void";
  method: "card" | "cash";
  productId?: string | null;
  quantity: number;
  saleNumber: string;
  stockQuantityDelta: number;
};

type HarnessState = {
  auth?: PosAuth;
  dataset?: Dataset;
  runtime?: RuntimeEnv;
  supabase?: SupabaseClient;
};

const state: HarnessState = {};
const screenshotDir = "/tmp/task081-e2e";

function fail(message: string): never {
  throw new Error(`TASK081_E2E: ${message}`);
}

function nowIso() {
  return new Date().toISOString();
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function chileToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Santiago",
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function previousMonthDate(today: string) {
  const [year, month] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 15));
  date.setUTCMonth(date.getUTCMonth() - 1);
  return dateOnly(date);
}

function safeRunId() {
  return randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

function legacyTimestamp(date = new Date()) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function loadLocalSupabaseEnv(): RuntimeEnv {
  const output = execFileSync("supabase", ["status", "--output", "env"], {
    encoding: "utf8",
    env: {
      ...process.env,
      DO_NOT_TRACK: "1",
      SUPABASE_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const values = parseSupabaseStatusEnv(output) as SupabaseStatusEnv;
  const env = {
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      values.PUBLISHABLE_KEY || values.ANON_KEY || "",
    NEXT_PUBLIC_SUPABASE_URL: values.API_URL || "",
    SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY || "",
    TEST_TARGET: "local" as const,
  };

  assertLocalTargetEnv({ ...process.env, ...env });

  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    fail("local Supabase publishable and server-only keys are required.");
  }

  return env;
}

function createAdminClient(env: RuntimeEnv) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "merchandise-control-admin-web/task081-e2e",
      },
    },
  });
}

function createPublicClient(env: RuntimeEnv) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "merchandise-control-admin-web/task081-e2e-public",
      },
    },
  });
}

async function must<T>(
  label: string,
  result: PromiseLike<{ data: T | null; error: unknown }>,
): Promise<T> {
  const { data, error } = await result;

  if (error) {
    fail(`${label}: ${formatSupabaseError(error)}`);
  }

  return data as T;
}

async function mustSingle<T>(
  label: string,
  result: PromiseLike<{ data: T | null; error: unknown }>,
) {
  const { data, error } = await result;

  if (error || data === null) {
    fail(`${label}: ${error ? formatSupabaseError(error) : "missing data"}`);
  }

  return data;
}

function formatSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") {
    return String(error ?? "unknown");
  }

  const record = error as Record<string, unknown>;
  return ["message", "code", "details", "hint"]
    .map((key) =>
      typeof record[key] === "string" && record[key]
        ? `${key}=${record[key]}`
        : "",
    )
    .filter(Boolean)
    .join("; ");
}

async function hashStaffCredential(plaintext: string) {
  const salt = randomBytes(16);
  const key = await deriveScryptKey(plaintext, salt);

  return [
    "",
    "scrypt-v1",
    "n=16384,r=8,p=1,l=64",
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

function deriveScryptKey(plaintext: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      plaintext,
      salt,
      64,
      {
        N: 16384,
        maxmem: 64 * 1024 * 1024,
        p: 1,
        r: 8,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(Buffer.from(derivedKey));
      },
    );
  });
}

async function activeTask081ShopIds(supabase: SupabaseClient, shopId?: string) {
  const query = supabase.from("shops").select("shop_id,shop_code");
  const { data, error } = shopId
    ? await query.eq("shop_id", shopId)
    : await query.like("shop_code", "TASK081_E2E_%");

  if (error) {
    fail(`synthetic shop lookup: ${formatSupabaseError(error)}`);
  }

  return (data ?? []).map((row) => row.shop_id as string);
}

async function ownerIdsForShops(supabase: SupabaseClient, shopIds: readonly string[]) {
  if (shopIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("shop_inventory_sources")
    .select("owner_user_id")
    .in("shop_id", shopIds);

  if (error) {
    fail(`synthetic owner lookup: ${formatSupabaseError(error)}`);
  }

  return [
    ...new Set(
      (data ?? [])
        .map((row) => row.owner_user_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ];
}

async function cleanupSyntheticDataset(
  supabase: SupabaseClient,
  input: { ownerUserId?: string; reason: string; shopId?: string },
) {
  const timestamp = nowIso();
  const shopIds = await activeTask081ShopIds(supabase, input.shopId);
  const ownerIds = input.ownerUserId
    ? [input.ownerUserId]
    : await ownerIdsForShops(supabase, shopIds);

  for (const shopId of shopIds) {
    const ownerId = input.ownerUserId ?? (await ownerIdsForShops(supabase, [shopId]))[0];

    await must(
      "session soft cleanup",
      supabase
        .from("pos_sessions")
        .update({
          revoked_at: timestamp,
          revoked_reason: input.reason,
          status: "revoked",
          updated_at: timestamp,
        })
        .eq("shop_id", shopId)
        .eq("status", "active"),
    );
    await must(
      "device credential soft cleanup",
      supabase
        .from("pos_device_credentials")
        .update({
          revoked_at: timestamp,
          revoked_reason: input.reason,
          status: "revoked",
          updated_at: timestamp,
        })
        .eq("shop_id", shopId)
        .eq("status", "active"),
    );
    await must(
      "device soft cleanup",
      supabase
        .from("shop_devices")
        .update({
          revoked_at: timestamp,
          status: "revoked",
          updated_at: timestamp,
        })
        .eq("shop_id", shopId)
        .eq("status", "active"),
    );
    await must(
      "staff soft cleanup",
      supabase
        .from("staff_accounts")
        .update({
          credential_hash: null,
          credential_kind: null,
          credential_status: "rotation_required",
          credential_updated_at: null,
          must_change_credential: true,
          status: "archived",
          updated_at: timestamp,
        })
        .eq("shop_id", shopId)
        .like("staff_code", "TASK081_POS_%"),
    );
    await must(
      "mapping soft cleanup",
      supabase
        .from("shop_inventory_sources")
        .update({
          disabled_at: timestamp,
        })
        .eq("shop_id", shopId)
        .is("disabled_at", null),
    );
    await must(
      "member soft cleanup",
      supabase
        .from("shop_members")
        .update({
          membership_status: "suspended",
          suspended_at: timestamp,
          updated_at: timestamp,
        })
        .eq("shop_id", shopId)
        .eq("membership_status", "active"),
    );
    await must(
      "shop soft cleanup",
      supabase
        .from("shops")
        .update({
          archived_at: timestamp,
          archived_by_profile_id: ownerId ?? null,
          shop_status: "archived",
          status_changed_at: timestamp,
          status_changed_by_profile_id: ownerId ?? null,
          status_reason_redacted: input.reason,
          suspended_at: null,
          suspended_by_profile_id: null,
          updated_at: timestamp,
        })
        .eq("shop_id", shopId),
    );
  }

  for (const ownerUserId of ownerIds) {
    await must(
      "price cleanup",
      supabase.from("inventory_product_prices").delete().eq("owner_user_id", ownerUserId),
    );
    await must(
      "product tombstone",
      supabase
        .from("inventory_products")
        .update({
          deleted_at: timestamp,
          updated_at: timestamp,
        })
        .eq("owner_user_id", ownerUserId)
        .like("barcode", "TASK081_BARCODE_%"),
    );
    await must(
      "category tombstone",
      supabase
        .from("inventory_categories")
        .update({
          deleted_at: timestamp,
          updated_at: timestamp,
        })
        .eq("owner_user_id", ownerUserId)
        .like("name", "TASK081_CATEGORY_%"),
    );
    await must(
      "supplier tombstone",
      supabase
        .from("inventory_suppliers")
        .update({
          deleted_at: timestamp,
          updated_at: timestamp,
        })
        .eq("owner_user_id", ownerUserId)
        .like("name", "TASK081_SUPPLIER_%"),
    );
    await must(
      "profile disable",
      supabase
        .from("profiles")
        .update({
          disabled_at: timestamp,
          profile_status: "disabled",
          updated_at: timestamp,
        })
        .eq("profile_id", ownerUserId),
    );
    await supabase.auth.admin.deleteUser(ownerUserId);
  }
}

async function verifyCleanup(supabase: SupabaseClient, dataset: Dataset) {
  const shopIds = await activeTask081ShopIds(supabase, dataset.shopId);
  const cleanupResults = await Promise.all([
    supabase.from("shops").select("shop_id").in("shop_id", shopIds).neq("shop_status", "archived"),
    supabase.from("staff_accounts").select("staff_id").in("shop_id", shopIds).neq("status", "archived"),
    supabase.from("shop_devices").select("shop_device_id").in("shop_id", shopIds).eq("status", "active"),
    supabase.from("pos_sessions").select("pos_session_id").in("shop_id", shopIds).eq("status", "active"),
    supabase.from("shop_inventory_sources").select("shop_inventory_source_id").in("shop_id", shopIds).is("disabled_at", null),
    supabase.from("inventory_products").select("id").eq("owner_user_id", dataset.ownerUserId).is("deleted_at", null),
  ]);

  cleanupResults.forEach((result, index) => {
    if (result.error) {
      fail(`synthetic cleanup verification query ${index + 1}: ${formatSupabaseError(result.error)}`);
    }
  });

  const [{ data: shops }, { data: staff }, { data: devices }, { data: sessions }, { data: mappings }, { data: products }] =
    cleanupResults;
  const leftovers =
    (shops?.length ?? 0) +
    (staff?.length ?? 0) +
    (devices?.length ?? 0) +
    (sessions?.length ?? 0) +
    (mappings?.length ?? 0) +
    (products?.length ?? 0);

  expect(leftovers, "synthetic active rows after cleanup").toBe(0);
}

async function setupSyntheticDataset(supabase: SupabaseClient): Promise<Dataset> {
  const runId = safeRunId();
  const email = `task081-e2e-${runId.toLowerCase()}@example.test`;
  const password = `Task081-${randomBytes(18).toString("base64url")}`;
  const posCredential = `Task081-POS-${randomBytes(14).toString("base64url")}`;
  const shopCode = `TASK081_E2E_${runId}`;
  const staffCode = `TASK081_POS_${runId}`;
  const productBarcode = `TASK081_BARCODE_${runId}`;
  const productName = `TASK081_PRODUCT_${runId}`;
  const timestamp = nowIso();

  await cleanupSyntheticDataset(supabase, {
    reason: "task081_pre_setup_cleanup",
  });

  const user = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: {
      source: "TASK-081",
    },
  });

  if (user.error || !user.data.user) {
    fail(`auth user create: ${formatSupabaseError(user.error)}`);
  }

  const ownerUserId = user.data.user.id;
  const staffHash = await hashStaffCredential(posCredential);

  await must(
    "profile upsert",
    supabase.from("profiles").upsert(
      {
        display_name: `TASK081 Owner ${runId}`,
        profile_id: ownerUserId,
        profile_status: "active",
      },
      { onConflict: "profile_id" },
    ),
  );
  const shop = await mustSingle<{ shop_id: string; shop_code: string }>(
    "shop insert",
    supabase
      .from("shops")
      .insert({
        created_by_profile_id: ownerUserId,
        shop_code: shopCode,
        shop_name: `TASK081 E2E Shop ${runId}`,
        shop_status: "active",
      })
      .select("shop_id,shop_code")
      .maybeSingle(),
  );

  await must(
    "shop member insert",
    supabase.from("shop_members").insert({
      membership_status: "active",
      profile_id: ownerUserId,
      role_key: "shop_owner",
      shop_id: shop.shop_id,
    }),
  );
  const staff = await mustSingle<{ staff_id: string }>(
    "staff insert",
    supabase
      .from("staff_accounts")
      .insert({
        credential_hash: staffHash,
        credential_kind: "password",
        credential_status: "active",
        credential_updated_at: timestamp,
        credential_version: 1,
        display_name: `TASK081 POS Staff ${runId}`,
        failed_attempts: 0,
        must_change_credential: false,
        role_key: "cashier",
        shop_id: shop.shop_id,
        staff_code: staffCode,
        status: "active",
      })
      .select("staff_id")
      .maybeSingle(),
  );
  await must(
    "inventory source insert",
    supabase.from("shop_inventory_sources").insert({
      mapping_state: "mapped",
      owner_user_id: ownerUserId,
      shop_id: shop.shop_id,
      source_kind: "mobile_owner",
      verified_at: timestamp,
      verified_by_profile_id: ownerUserId,
    }),
  );
  const supplier = await mustSingle<{ id: string }>(
    "supplier insert",
    supabase
      .from("inventory_suppliers")
      .insert({
        name: `TASK081_SUPPLIER_${runId}`,
        owner_user_id: ownerUserId,
      })
      .select("id")
      .maybeSingle(),
  );
  const category = await mustSingle<{ id: string }>(
    "category insert",
    supabase
      .from("inventory_categories")
      .insert({
        name: `TASK081_CATEGORY_${runId}`,
        owner_user_id: ownerUserId,
      })
      .select("id")
      .maybeSingle(),
  );
  const product = await mustSingle<{ id: string }>(
    "product insert",
    supabase
      .from("inventory_products")
      .insert({
        barcode: productBarcode,
        category_id: category.id,
        item_number: `TASK081_ITEM_${runId}`,
        owner_user_id: ownerUserId,
        product_name: productName,
        purchase_price: 100,
        retail_price: 1000,
        stock_quantity: 10,
        supplier_id: supplier.id,
      })
      .select("id")
      .maybeSingle(),
  );
  await must(
    "price insert",
    supabase.from("inventory_product_prices").insert([
      {
        created_at: legacyTimestamp(),
        effective_at: legacyTimestamp(),
        id: randomUUID(),
        owner_user_id: ownerUserId,
        price: 100,
        product_id: product.id,
        source: "TASK-081",
        type: "PURCHASE",
      },
      {
        created_at: legacyTimestamp(),
        effective_at: legacyTimestamp(),
        id: randomUUID(),
        owner_user_id: ownerUserId,
        price: 1000,
        product_id: product.id,
        source: "TASK-081",
        type: "RETAIL",
      },
    ]),
  );

  return {
    categoryId: category.id,
    deviceIdentifier: `TASK081_DEVICE_${runId}`,
    email,
    ownerUserId,
    password,
    posCredential,
    productBarcode,
    productId: product.id,
    productName,
    runId,
    shopCode: shop.shop_code,
    shopId: shop.shop_id,
    staffCode,
    staffId: staff.staff_id,
    supplierId: supplier.id,
  };
}

async function firstLogin(request: APIRequestContext, dataset: Dataset): Promise<PosAuth> {
  const response = await request.post("/api/pos/auth/first-login", {
    data: {
      credential: dataset.posCredential,
      device: {
        appVersion: "TASK081-e2e",
        deviceIdentifier: dataset.deviceIdentifier,
        displayName: `TASK081 Device ${dataset.runId}`,
      },
      shopCode: dataset.shopCode,
      staffCode: dataset.staffCode,
    },
    headers: {
      "User-Agent": "TASK081 E2E",
    },
  });
  const body = await response.json();

  expect(response.status(), "first-login status").toBe(200);
  expect(body.ok, "first-login ok").toBe(true);

  return {
    deviceToken: body.trustedDeviceToken,
    posSessionId: body.session.posSessionId,
    sessionToken: body.session.sessionToken,
    shopDeviceId: body.device.shopDeviceId,
  };
}

function sale(input: SaleSeed, index: number) {
  const occurredAt = new Date(
    `${input.businessDate}T13:${String(index).padStart(2, "0")}:00.000Z`,
  ).toISOString();
  const signedNet = input.kind === "sale" ? input.amountClp : -input.amountClp;

  return {
    amounts: {
      changeClp: 0,
      discountClp: 0,
      grossClp: input.amountClp,
      netClp: signedNet,
      paidClp: signedNet,
      taxClp: 0,
    },
    businessDate: input.businessDate,
    clientOriginalSaleId: input.clientOriginalSaleId,
    clientSaleId: input.clientSaleId,
    currency: "CLP",
    fiscal: {
      documentNumber: `F-${input.clientSaleId.slice(-4)}`,
      documentType: input.fiscalStatus === "not_reported" ? null : "boleta",
      printedAt: input.fiscalStatus === "printed_local_pdf" ? occurredAt : null,
      status: input.fiscalStatus,
    },
    idempotencyKey: `idem-${input.clientSaleId}`,
    kind: input.kind,
    lines: [
      {
        amountClp: signedNet,
        barcode: input.productId ? undefined : `TASK081_UNKNOWN_${input.clientSaleId}`,
        clientLineId: `line-${input.clientSaleId}`,
        itemNumber: input.productId ? undefined : `TASK081_UNKNOWN_ITEM_${input.clientSaleId}`,
        linePosition: 1,
        lineTotal: input.amountClp,
        lineType: "item",
        productId: input.productId,
        productName: input.productId ? "TASK081_PRODUCT_LINE" : "TASK081_UNRESOLVED_LINE",
        quantity: input.quantity,
        stockQuantityDelta: input.stockQuantityDelta,
        unitAmountClp: Math.round(input.amountClp / input.quantity),
        unitPrice: Math.round(input.amountClp / input.quantity),
      },
    ],
    occurredAt,
    payments: [
      {
        amountClp: signedNet,
        changeClp: 0,
        clientPaymentId: `payment-${input.clientSaleId}`,
        method: input.method,
      },
    ],
    reversalReason: input.kind === "sale" ? undefined : "TASK081 synthetic reversal",
    saleNumber: input.saleNumber,
    total: input.amountClp,
  };
}

function buildSalesPayload(input: {
  auth: PosAuth;
  batchId: string;
  dataset: Dataset;
  sales: ReturnType<typeof sale>[];
}) {
  return {
    ...input.auth,
    appVersion: "TASK081-e2e",
    batch: {
      clientBatchId: input.batchId,
      idempotencyKey: `idem-${input.batchId}`,
    },
    sales: input.sales,
    schemaVersion: "pos-sales-ledger-v2",
    shopCode: input.dataset.shopCode,
  };
}

async function postSales(
  request: APIRequestContext,
  payload: Record<string, unknown>,
  expectedStatus = 200,
) {
  const response = await request.post("/api/pos/sales/sync", {
    data: payload,
    headers: {
      "Idempotency-Key": String((payload.batch as { idempotencyKey?: string }).idempotencyKey),
      "User-Agent": "TASK081 E2E",
    },
  });
  const body = await response.json();

  expect(response.status(), JSON.stringify(body)).toBe(expectedStatus);
  expect(response.headers()["cache-control"]?.toLowerCase()).toContain("no-store");
  return body;
}

async function postRawSales(
  request: APIRequestContext,
  rawBody: string,
  expectedStatus: number,
) {
  const response = await request.post("/api/pos/sales/sync", {
    data: rawBody,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `raw-${randomUUID()}`,
      "User-Agent": "TASK081 E2E raw body",
    },
  });
  const text = await response.text();

  expect(response.status(), text).toBe(expectedStatus);
  expect(response.headers()["cache-control"]?.toLowerCase()).toContain("no-store");
  return text;
}

async function expectProductStock(
  supabase: SupabaseClient,
  productId: string,
  expected: number,
) {
  const product = await mustSingle<{ stock_quantity: number }>(
    "product stock lookup",
    supabase
      .from("inventory_products")
      .select("stock_quantity")
      .eq("id", productId)
      .maybeSingle(),
  );
  expect(Number(product.stock_quantity), "product stock").toBe(expected);
}

async function verifyDatabaseState(supabase: SupabaseClient, dataset: Dataset) {
  const sales = await must<{
    business_kind: string;
    client_sale_id: string;
    fiscal_status: string;
    net_amount_clp: number;
    pos_sale_id: string;
    status: string;
    stock_sync_status: string;
    stock_warning_count: number;
  }[]>(
    "sales lookup",
    supabase
      .from("pos_sales")
      .select("pos_sale_id,client_sale_id,business_kind,status,fiscal_status,net_amount_clp,stock_sync_status,stock_warning_count")
      .eq("shop_id", dataset.shopId)
      .like("client_sale_id", `TASK081_${dataset.runId}_%`),
  );
  expect(sales).toHaveLength(6);
  expect(sales.every((row) => row.status === "accepted")).toBe(true);
  expect(sales.find((row) => row.client_sale_id.endsWith("_UNRES"))?.stock_sync_status).toBe("stock_warning");
  expect(sales.find((row) => row.client_sale_id.endsWith("_CONFLICT"))?.stock_sync_status).toBe("stock_conflict");

  const ledger = await must<{ amount_clp: number; entry_type: string; payment_method: string | null }[]>(
    "ledger lookup",
    supabase
      .from("pos_revenue_ledger_entries")
      .select("entry_type,payment_method,amount_clp")
      .eq("shop_id", dataset.shopId),
  );
  expect(ledger.some((row) => row.entry_type === "payment" && row.payment_method === "cash")).toBe(true);
  expect(ledger.some((row) => row.entry_type === "payment" && row.payment_method === "card")).toBe(true);
  expect(ledger.some((row) => row.entry_type === "refund_item" && Number(row.amount_clp) < 0)).toBe(true);
  expect(ledger.some((row) => row.entry_type === "void_marker")).toBe(true);

  const movements = await must<{
    issue_code: string | null;
    movement_kind: string;
    quantity_delta: number;
    status: string;
  }[]>(
    "stock movements lookup",
    supabase
      .from("pos_sale_stock_movements")
      .select("movement_kind,quantity_delta,status,issue_code")
      .eq("shop_id", dataset.shopId),
  );
  expect(movements.filter((row) => row.status === "applied")).toHaveLength(3);
  expect(movements.some((row) => row.status === "unresolved_product")).toBe(true);
  expect(movements.some((row) => row.status === "stock_conflict")).toBe(true);
}

async function fetchBrowserJson(page: Page, path: string) {
  return page.evaluate(async (inputPath) => {
    const response = await fetch(inputPath, {
      credentials: "same-origin",
    });

    return {
      body: await response.json(),
      status: response.status,
    };
  }, path);
}

async function verifyRevenueApi(page: Page, dataset: Dataset) {
  const { body, status } = await fetchBrowserJson(
    page,
    `/api/shop/pos/revenue?shop_id=${dataset.shopId}`,
  );

  expect(status, JSON.stringify(body)).toBe(200);
  expect(body.status).toBe("ready");
  expect(body.today.netRevenueClp).toBe(10400);
  expect(body.today.documentedRevenueClp).toBe(1000);
  expect(body.today.verificationRevenueClp).toBe(9400);
  expect(body.today.cashClp).toBe(10400);
  expect(body.today.cardClp).toBe(0);
  expect(body.today.refundCount).toBe(1);
  expect(body.today.voidCount).toBe(1);
  expect(body.today.stockWarningCount).toBe(2);
  expect(body.month.summary.netRevenueClp).toBe(10400);
  expect(body.year.summary.netRevenueClp).toBe(11150);
  expect(body.recentSales.length).toBeGreaterThanOrEqual(5);

  const documentedSale = body.recentSales.find((row: { clientSaleId: string; saleNumber: string | null }) =>
    row.saleNumber?.endsWith("-DOC") || row.clientSaleId.endsWith("_DOC"),
  );
  expect(documentedSale?.posSaleId).toBeTruthy();

  const detail = await fetchBrowserJson(
    page,
    `/api/shop/pos/revenue/sale-detail?shop_id=${dataset.shopId}&pos_sale_id=${documentedSale.posSaleId}`,
  );
  expect(detail.status, JSON.stringify(detail.body)).toBe(200);
  expect(detail.body.lines.some((line: { entryType: string; lineTotalClp: number }) =>
    line.entryType === "item" && line.lineTotalClp === 2000,
  )).toBe(true);
}

async function loginShopAdmin(page: Page, dataset: Dataset) {
  await page.goto(`/auth/login?next=/shop/pos?shop_id=${dataset.shopId}`);
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.getByLabel("Email").fill(dataset.email);
  await page.getByLabel("Password").fill(dataset.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/shop/pos"),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

async function verifyRevenueUi(page: Page, dataset: Dataset, mode: "desktop" | "mobile") {
  const expectText = async (text: string) => {
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
  };

  await expect(
    page.locator("#shop-content").getByRole("heading", { level: 1, name: "Incassi POS" }),
  ).toBeVisible();
  await expectText("Incasso completo");
  await expectText("$10.400");
  await expectText("Incasso documentato");
  await expectText("$1.000");
  await expectText("Da verificare");
  await expectText("$9.400");
  await expectText("2 warning stock");
  await expectText("Storico mensile");
  await expectText("Storico annuale");
  await expectText(`TASK081-${dataset.runId}-DOC`);

  const openButton = page
    .locator("tr", { hasText: `TASK081-${dataset.runId}-DOC` })
    .getByRole("button", { name: "Apri" });
  await openButton.click();
  await expect(page.getByText("TASK081_PRODUCT_LINE").first()).toBeVisible();
  await expect(page.getByText("item").first()).toBeVisible();

  mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({
    fullPage: false,
    path: join(screenshotDir, `task081-${dataset.runId}-${mode}.png`),
  });
}

test.beforeAll(async () => {
  const runtime = loadLocalSupabaseEnv();
  const supabase = createAdminClient(runtime);
  const dataset = await setupSyntheticDataset(supabase);

  state.runtime = runtime;
  state.supabase = supabase;
  state.dataset = dataset;
});

test.afterAll(async () => {
  if (state.supabase && state.dataset) {
    await cleanupSyntheticDataset(state.supabase, {
      ownerUserId: state.dataset.ownerUserId,
      reason: "task081_e2e_cleanup",
      shopId: state.dataset.shopId,
    });
    await verifyCleanup(state.supabase, state.dataset);
  }
});

test("TASK-081 local Admin Web sales sync, revenue UI, stock and cleanup E2E", async ({
  page,
  request,
}) => {
  const { dataset, runtime, supabase } = state;

  if (!dataset || !runtime || !supabase) {
    fail("dataset was not initialized.");
  }

  const today = chileToday();
  const previousMonth = previousMonthDate(today);
  const auth = await firstLogin(request, dataset);
  state.auth = auth;

  const saleSeeds: SaleSeed[] = [
    {
      amountClp: 2000,
      businessDate: today,
      clientSaleId: `TASK081_${dataset.runId}_DOC`,
      fiscalStatus: "printed_local_pdf",
      kind: "sale",
      method: "cash",
      productId: dataset.productId,
      quantity: 2,
      saleNumber: `TASK081-${dataset.runId}-DOC`,
      stockQuantityDelta: -2,
    },
    {
      amountClp: 500,
      businessDate: today,
      clientSaleId: `TASK081_${dataset.runId}_UNRES`,
      fiscalStatus: "not_reported",
      kind: "sale",
      method: "cash",
      productId: null,
      quantity: 1,
      saleNumber: `TASK081-${dataset.runId}-UNRES`,
      stockQuantityDelta: -1,
    },
    {
      amountClp: 750,
      businessDate: previousMonth,
      clientSaleId: `TASK081_${dataset.runId}_CARD`,
      fiscalStatus: "printed_local_pdf",
      kind: "sale",
      method: "card",
      productId: dataset.productId,
      quantity: 1,
      saleNumber: `TASK081-${dataset.runId}-CARD`,
      stockQuantityDelta: 0,
    },
    {
      amountClp: 1000,
      businessDate: today,
      clientOriginalSaleId: `TASK081_${dataset.runId}_DOC`,
      clientSaleId: `TASK081_${dataset.runId}_REFUND`,
      fiscalStatus: "accepted_authority",
      kind: "refund",
      method: "cash",
      productId: dataset.productId,
      quantity: 1,
      saleNumber: `TASK081-${dataset.runId}-REFUND`,
      stockQuantityDelta: 1,
    },
    {
      amountClp: 1000,
      businessDate: today,
      clientOriginalSaleId: `TASK081_${dataset.runId}_DOC`,
      clientSaleId: `TASK081_${dataset.runId}_VOID`,
      fiscalStatus: "voided",
      kind: "void",
      method: "cash",
      productId: dataset.productId,
      quantity: 1,
      saleNumber: `TASK081-${dataset.runId}-VOID`,
      stockQuantityDelta: 1,
    },
    {
      amountClp: 9900,
      businessDate: today,
      clientSaleId: `TASK081_${dataset.runId}_CONFLICT`,
      fiscalStatus: "not_reported",
      kind: "sale",
      method: "cash",
      productId: dataset.productId,
      quantity: 99,
      saleNumber: `TASK081-${dataset.runId}-CONFLICT`,
      stockQuantityDelta: -99,
    },
  ];
  const sales = saleSeeds.map((seed, index) => sale(seed, index));
  const batchId = `TASK081_BATCH_${dataset.runId}`;
  const payload = buildSalesPayload({ auth, batchId, dataset, sales });
  const success = await postSales(request, payload);

  expect(success.ok).toBe(true);
  expect(success.batch.status).toBe("accepted");
  expect(success.batch.acceptedSaleCount).toBe(6);

  await expectProductStock(supabase, dataset.productId, 10);

  const duplicate = await postSales(request, payload);
  expect(duplicate.ok).toBe(true);
  expect(duplicate.batch.status).toBe("duplicate");
  expect(duplicate.sales.every((row: { status: string }) => row.status === "duplicate")).toBe(true);
  await expectProductStock(supabase, dataset.productId, 10);

  const conflictPayload = {
    ...payload,
    sales: [
      {
        ...sales[0],
        amounts: {
          ...sales[0].amounts,
          grossClp: 2100,
          netClp: 2100,
          paidClp: 2100,
        },
        lines: [
          {
            ...sales[0].lines[0],
            amountClp: 2100,
            lineTotal: 2100,
            unitAmountClp: 1050,
            unitPrice: 1050,
          },
        ],
        payments: [
          {
            ...sales[0].payments[0],
            amountClp: 2100,
          },
        ],
        total: 2100,
      },
    ],
  };
  await postSales(request, conflictPayload, 409);

  await postSales(request, { ...payload, schemaVersion: "unknown" }, 400);
  await postSales(request, { ...payload, sales: [{ ...sales[0], businessDate: "2026-99-99" }] }, 400);
  await postSales(request, { ...payload, sales: [{ ...sales[0], kind: "bad_kind" }] }, 400);
  await postRawSales(request, "{", 400);
  await postRawSales(
    request,
    JSON.stringify({
      ...payload,
      oversizedPadding: "x".repeat(260 * 1024),
    }),
    400,
  );

  const revokedSessionPayload = { ...payload };
  await must(
    "revoked device setup",
    supabase
      .from("shop_devices")
      .update({ status: "revoked", updated_at: nowIso() })
      .eq("shop_device_id", auth.shopDeviceId),
  );
  await postSales(request, revokedSessionPayload, 401);
  await must(
    "reactivate device setup",
    supabase
      .from("shop_devices")
      .update({ status: "active", updated_at: nowIso() })
      .eq("shop_device_id", auth.shopDeviceId),
  );
  await must(
    "suspended staff setup",
    supabase
      .from("staff_accounts")
      .update({ status: "suspended", updated_at: nowIso() })
      .eq("staff_id", dataset.staffId),
  );
  await postSales(request, payload, 401);
  await must(
    "reactivate staff setup",
    supabase
      .from("staff_accounts")
      .update({ status: "active", updated_at: nowIso() })
      .eq("staff_id", dataset.staffId),
  );
  await must(
    "suspended shop setup",
    supabase
      .from("shops")
      .update({
        shop_status: "suspended",
        status_changed_at: nowIso(),
        status_changed_by_profile_id: dataset.ownerUserId,
        suspended_at: nowIso(),
        suspended_by_profile_id: dataset.ownerUserId,
        updated_at: nowIso(),
      })
      .eq("shop_id", dataset.shopId),
  );
  await postSales(request, payload, 401);
  await must(
    "reactivate shop setup",
    supabase
      .from("shops")
      .update({
        shop_status: "active",
        status_changed_at: nowIso(),
        status_changed_by_profile_id: dataset.ownerUserId,
        suspended_at: null,
        suspended_by_profile_id: null,
        updated_at: nowIso(),
      })
      .eq("shop_id", dataset.shopId),
  );
  await must(
    "expired session setup",
    supabase
      .from("pos_sessions")
      .update({ expires_at: "2020-01-01T00:00:00.000Z", updated_at: nowIso() })
      .eq("pos_session_id", auth.posSessionId),
  );
  await postSales(request, payload, 401);

  const freshAuth = await firstLogin(request, dataset);
  const crossShopPayload = {
    ...buildSalesPayload({
      auth: freshAuth,
      batchId: `TASK081_CROSS_${dataset.runId}`,
      dataset,
      sales: [saleSeeds.map((seed, index) => sale(seed, index))[0]],
    }),
    shopCode: "TASK081_E2E_OTHER",
  };
  await postSales(request, crossShopPayload, 401);

  await verifyDatabaseState(supabase, dataset);

  await loginShopAdmin(page, dataset);
  await verifyRevenueApi(page, dataset);
  await verifyRevenueUi(page, dataset, "desktop");

  await page.setViewportSize({ height: 844, width: 390 });
  await page.reload();
  await verifyRevenueUi(page, dataset, "mobile");

  const publicClient = createPublicClient(runtime);
  const signIn = await publicClient.auth.signInWithPassword({
    email: dataset.email,
    password: dataset.password,
  });
  expect(signIn.error).toBeNull();
});
