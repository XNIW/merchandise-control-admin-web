import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID, scrypt } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
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

type HarnessState = {
  catalogDbPath?: string;
  dataset?: Dataset;
  runtime?: RuntimeEnv;
  sessionJsonPath?: string;
  supabase?: SupabaseClient;
};

const state: HarnessState = {};
const screenshotDir = "/tmp/task081-win7pos-http";

function fail(message: string): never {
  throw new Error(`TASK081Z_WIN7HTTP_E2E: ${message}`);
}

function nowIso() {
  return new Date().toISOString();
}

function safeRunId() {
  return randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

function legacyTimestamp(date = new Date()) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function loadLocalSupabaseEnv(): RuntimeEnv {
  const output = spawnSync("supabase", ["status", "--output", "env"], {
    encoding: "utf8",
    env: {
      ...process.env,
      DO_NOT_TRACK: "1",
      SUPABASE_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (output.status !== 0) {
    fail("supabase status --output env failed; start local Supabase first.");
  }

  const values = parseSupabaseStatusEnv(output.stdout) as SupabaseStatusEnv;
  const env = {
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      values.PUBLISHABLE_KEY || values.ANON_KEY || "",
    NEXT_PUBLIC_SUPABASE_URL: values.API_URL || "",
    SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY || "",
    TEST_TARGET: "local" as const,
  };

  assertLocalTargetEnv({ ...process.env, ...env });
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
        "X-Client-Info": "merchandise-control-admin-web/task081-win7-http-e2e",
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
        "X-Client-Info": "merchandise-control-admin-web/task081-win7-http-e2e-public",
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

async function activeTask081Win7HttpShopIds(supabase: SupabaseClient, shopId?: string) {
  const query = supabase.from("shops").select("shop_id,shop_code");
  const { data, error } = shopId
    ? await query.eq("shop_id", shopId)
    : await query.like("shop_code", "TASK081Z_WIN7HTTP_%");

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
  const shopIds = await activeTask081Win7HttpShopIds(supabase, input.shopId);
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
        .like("staff_code", "TASK081Z_WIN7HTTP_POS_%"),
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
        .like("barcode", "TASK081Z_WIN7HTTP_BARCODE_%"),
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
        .like("name", "TASK081Z_WIN7HTTP_CATEGORY_%"),
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
        .like("name", "TASK081Z_WIN7HTTP_SUPPLIER_%"),
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
  const shopIds = await activeTask081Win7HttpShopIds(supabase, dataset.shopId);
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

  const leftovers = cleanupResults.reduce(
    (sum, result) => sum + (result.data?.length ?? 0),
    0,
  );
  expect(leftovers, "synthetic active rows after cleanup").toBe(0);
}

async function setupSyntheticDataset(supabase: SupabaseClient): Promise<Dataset> {
  const runId = safeRunId();
  const email = `task081z-win7http-${runId.toLowerCase()}@example.test`;
  const password = `Task081-${randomBytes(18).toString("base64url")}`;
  const posCredential = `Task081-Win7POS-${randomBytes(14).toString("base64url")}`;
  const shopCode = `TASK081Z_WIN7HTTP_${runId}`;
  const staffCode = `TASK081Z_WIN7HTTP_POS_${runId}`;
  const productBarcode = `TASK081Z_WIN7HTTP_BARCODE_${runId}`;
  const productName = `TASK081Z_WIN7HTTP_PRODUCT_${runId}`;
  const timestamp = nowIso();

  await cleanupSyntheticDataset(supabase, {
    reason: "task081_win7http_pre_setup_cleanup",
  });

  const user = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: {
      source: "TASK-081Z-WIN7HTTP",
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
        display_name: `TASK081Z Win7HTTP Owner ${runId}`,
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
        shop_name: `TASK081Z Win7HTTP Shop ${runId}`,
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
        display_name: `TASK081Z Win7HTTP POS Staff ${runId}`,
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
        name: `TASK081Z_WIN7HTTP_SUPPLIER_${runId}`,
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
        name: `TASK081Z_WIN7HTTP_CATEGORY_${runId}`,
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
        item_number: `TASK081Z_WIN7HTTP_ITEM_${runId}`,
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
        source: "TASK-081Z-WIN7HTTP",
        type: "PURCHASE",
      },
      {
        created_at: legacyTimestamp(),
        effective_at: legacyTimestamp(),
        id: randomUUID(),
        owner_user_id: ownerUserId,
        price: 1000,
        product_id: product.id,
        source: "TASK-081Z-WIN7HTTP",
        type: "RETAIL",
      },
    ]),
  );

  return {
    categoryId: category.id,
    deviceIdentifier: `TASK081Z_WIN7HTTP_DEVICE_${runId}`,
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
        appVersion: "TASK081-win7http-e2e",
        deviceIdentifier: dataset.deviceIdentifier,
        displayName: `TASK081Z Win7HTTP Device ${dataset.runId}`,
      },
      shopCode: dataset.shopCode,
      staffCode: dataset.staffCode,
    },
    headers: {
      "User-Agent": "TASK081Z Win7HTTP E2E",
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

function writeSessionJson(dataset: Dataset, auth: PosAuth) {
  mkdirSync(screenshotDir, { recursive: true });
  const sessionJsonPath = join(screenshotDir, `task081z-win7http-${dataset.runId}-session.json`);
  writeFileSync(
    sessionJsonPath,
    JSON.stringify({
      deviceToken: auth.deviceToken,
      posSessionId: auth.posSessionId,
      remoteProductId: dataset.productId,
      runId: dataset.runId,
      sessionToken: auth.sessionToken,
      shopCode: dataset.shopCode,
      shopDeviceId: auth.shopDeviceId,
    }),
    { encoding: "utf8", mode: 0o600 },
  );
  state.sessionJsonPath = sessionJsonPath;
  return sessionJsonPath;
}

function cleanupSessionJsonFiles() {
  mkdirSync(screenshotDir, { recursive: true });

  for (const entry of readdirSync(screenshotDir)) {
    if (entry.endsWith("-session.json")) {
      rmSync(join(screenshotDir, entry), { force: true });
    }
  }
}

function runWin7PosCli(input: { args: string[]; dataset: Dataset; timeout?: number }) {
  const win7Repo = process.env.WIN7POS_REPO_PATH ?? resolve(process.cwd(), "..", "Win7POS");
  const cliProject = join(win7Repo, "src", "Win7POS.Cli", "Win7POS.Cli.csproj");
  const result = spawnSync(
    "dotnet",
    [
      "run",
      "--project",
      cliProject,
      "-c",
      "Release",
      "--",
      ...input.args,
    ],
    {
      cwd: win7Repo,
      encoding: "utf8",
      env: {
        ...process.env,
        DOTNET_CLI_TELEMETRY_OPTOUT: "1",
      },
      timeout: input.timeout ?? 120_000,
    },
  );
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");

  if (result.status !== 0) {
    fail(`Win7POS CLI harness failed for ${input.dataset.runId}\n${output}`);
  }

  return output;
}

function runWin7PosHttpHarness(input: { baseUrl: string; dataset: Dataset; sessionJsonPath: string }) {
  const output = runWin7PosCli({
    args: [
      "--task081-sales-sync-http-harness",
      "--base-url",
      input.baseUrl,
      "--session-json",
      input.sessionJsonPath,
    ],
    dataset: input.dataset,
  });

  expect(output).toContain("TASK-081 Win7POS HTTP sales sync harness: PASS");
  expect(output).toContain("accepted=6");
  expect(output).toContain("pending_after_accept=0");
  expect(output).toContain("duplicate=ok");
  expect(output).toContain("conflict=ok");
  expect(output).toContain("auth_denied_retry=1");
  return output;
}

function runWin7PosCatalogPriceHarness(input: {
  baseUrl: string;
  dataset: Dataset;
  expected: {
    itemNumber: string;
    productName: string;
    purchasePrice: number;
    retailPrice: number;
    stock: number;
  };
  expectTombstone?: boolean;
  sessionJsonPath: string;
}) {
  mkdirSync(screenshotDir, { recursive: true });
  const dbPath = state.catalogDbPath ?? join(screenshotDir, `task081z-win7http-${input.dataset.runId}-catalog.db`);
  state.catalogDbPath = dbPath;

  const args = [
    "--task081-catalog-price-sync-harness",
    "--base-url",
    input.baseUrl,
    "--session-json",
    input.sessionJsonPath,
    "--db",
    dbPath,
    "--expected-barcode",
    input.dataset.productBarcode,
    "--expected-product-name",
    input.expected.productName,
    "--expected-item-number",
    input.expected.itemNumber,
    "--expected-supplier-name",
    `TASK081Z_WIN7HTTP_SUPPLIER_${input.dataset.runId}`,
    "--expected-category-name",
    `TASK081Z_WIN7HTTP_CATEGORY_${input.dataset.runId}`,
    "--expected-purchase-price",
    String(input.expected.purchasePrice),
    "--expected-retail-price",
    String(input.expected.retailPrice),
    "--expected-stock",
    String(input.expected.stock),
  ];

  if (input.expectTombstone) {
    args.push("--expect-tombstone");
  }

  const output = runWin7PosCli({
    args,
    dataset: input.dataset,
  });

  expect(output).toContain("TASK-081Z catalog price sync harness: PASS");
  expect(output).toContain("PASS_CATALOG_PRICE_SYNC_RUNTIME");
  return output;
}

function runWin7PosOfflineReconnectHarness(input: {
  baseUrl: string;
  dataset: Dataset;
  sessionJsonPath: string;
}) {
  const output = runWin7PosCli({
    args: [
      "--task081-offline-reconnect-harness",
      "--base-url",
      input.baseUrl,
      "--session-json",
      input.sessionJsonPath,
    ],
    dataset: input.dataset,
  });

  expect(output).toContain("TASK-081Z offline reconnect harness: PASS");
  expect(output).toContain("PASS_OFFLINE_RECONNECT_RUNTIME");
  expect(output).toContain("pending_final=0");
  expect(output).toContain("duplicate=ok");
  return output;
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

async function updateCatalogForDeltaPull(supabase: SupabaseClient, dataset: Dataset) {
  const timestamp = nowIso();

  await must(
    "catalog delta product update",
    supabase
      .from("inventory_products")
      .update({
        item_number: `TASK081Z_WIN7HTTP_ITEM_${dataset.runId}_UPDATED`,
        product_name: `${dataset.productName}_UPDATED`,
        purchase_price: 120,
        retail_price: 1250,
        stock_quantity: 14,
        updated_at: timestamp,
      })
      .eq("id", dataset.productId),
  );
  await must(
    "catalog delta price insert",
    supabase.from("inventory_product_prices").insert([
      {
        created_at: legacyTimestamp(),
        effective_at: legacyTimestamp(),
        id: randomUUID(),
        owner_user_id: dataset.ownerUserId,
        price: 120,
        product_id: dataset.productId,
        source: "TASK-081Z-CATALOG-DELTA",
        type: "PURCHASE",
      },
      {
        created_at: legacyTimestamp(),
        effective_at: legacyTimestamp(),
        id: randomUUID(),
        owner_user_id: dataset.ownerUserId,
        price: 1250,
        product_id: dataset.productId,
        source: "TASK-081Z-CATALOG-DELTA",
        type: "RETAIL",
      },
    ]),
  );
}

async function tombstoneCatalogProduct(supabase: SupabaseClient, dataset: Dataset) {
  const timestamp = nowIso();

  await must(
    "catalog tombstone product",
    supabase
      .from("inventory_products")
      .update({
        deleted_at: timestamp,
        updated_at: timestamp,
      })
      .eq("id", dataset.productId),
  );
}

async function verifyDatabaseState(supabase: SupabaseClient, dataset: Dataset) {
  const sales = await must<{
    business_kind: string;
    client_original_sale_id: string | null;
    fiscal_status: string;
    net_amount_clp: number;
    pos_sale_id: string;
    sale_number: string | null;
    status: string;
    stock_sync_status: string;
    stock_warning_count: number;
  }[]>(
    "Win7HTTP sales lookup",
    supabase
      .from("pos_sales")
      .select("pos_sale_id,sale_number,business_kind,status,fiscal_status,net_amount_clp,client_original_sale_id,stock_sync_status,stock_warning_count")
      .eq("shop_id", dataset.shopId)
      .like("sale_number", `TASK081-WIN7HTTP-${dataset.runId}-%`),
  );
  expect(sales).toHaveLength(6);
  expect(sales.every((row) => row.status === "accepted")).toBe(true);
  expect(sales.every((row) => row.stock_sync_status === "applied")).toBe(true);
  expect(sales.every((row) => Number(row.stock_warning_count) === 0)).toBe(true);
  expect(sales.filter((row) => row.fiscal_status === "printed_local_pdf")).toHaveLength(4);
  expect(sales.find((row) => row.sale_number?.endsWith("-NODOC"))?.fiscal_status).toBe("not_reported");
  expect(sales.find((row) => row.sale_number?.endsWith("-REFUND"))?.business_kind).toBe("refund");
  expect(sales.find((row) => row.sale_number?.endsWith("-VOID"))?.business_kind).toBe("void");
  expect(sales.find((row) => row.sale_number?.endsWith("-VOID"))?.fiscal_status).toBe("voided");

  const batches = await must<{ status: string }[]>(
    "Win7HTTP batch lookup",
    supabase
      .from("pos_sales_sync_batches")
      .select("status")
      .eq("shop_id", dataset.shopId),
  );
  expect(batches.filter((row) => row.status === "accepted")).toHaveLength(6);

  const ledger = await must<{ amount_clp: number; entry_type: string; payment_method: string | null }[]>(
    "Win7HTTP ledger lookup",
    supabase
      .from("pos_revenue_ledger_entries")
      .select("entry_type,payment_method,amount_clp")
      .eq("shop_id", dataset.shopId),
  );
  expect(ledger.some((row) => row.entry_type === "payment" && row.payment_method === "cash")).toBe(true);
  expect(ledger.some((row) => row.entry_type === "payment" && row.payment_method === "card")).toBe(true);
  expect(ledger.some((row) => row.entry_type === "payment" && row.payment_method === "other")).toBe(true);
  expect(ledger.some((row) => row.entry_type === "refund_item" && Number(row.amount_clp) < 0)).toBe(true);
  expect(ledger.some((row) => row.entry_type === "void_marker")).toBe(true);

  const movements = await must<{
    movement_kind: string;
    quantity_delta: number;
    status: string;
  }[]>(
    "Win7HTTP stock movements lookup",
    supabase
      .from("pos_sale_stock_movements")
      .select("movement_kind,quantity_delta,status")
      .eq("shop_id", dataset.shopId),
  );
  expect(movements).toHaveLength(6);
  expect(movements.every((row) => row.status === "applied")).toBe(true);
  expect(movements.some((row) => row.movement_kind === "sale_decrement" && Number(row.quantity_delta) === -2)).toBe(true);
  expect(movements.some((row) => row.movement_kind === "refund_increment" && Number(row.quantity_delta) === 1)).toBe(true);
  expect(movements.some((row) => row.movement_kind === "void_reverse" && Number(row.quantity_delta) === 1)).toBe(true);

  const auditLogs = await must<{ metadata_redacted: Record<string, unknown>; result: string }[]>(
    "Win7HTTP audit lookup",
    supabase
      .from("audit_logs")
      .select("metadata_redacted,result")
      .eq("shop_id", dataset.shopId)
      .like("event_key", "pos.sales.sync.%"),
  );
  expect(auditLogs.some((row) => row.metadata_redacted?.code === "duplicate_batch" && row.result === "success")).toBe(true);
  expect(auditLogs.some((row) => row.metadata_redacted?.code === "conflict_batch" && row.result === "blocked")).toBe(true);

  await expectProductStock(supabase, dataset.productId, 11);
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
  expect(body.today.netRevenueClp).toBe(2250);
  expect(body.today.documentedRevenueClp).toBe(1750);
  expect(body.today.verificationRevenueClp).toBe(500);
  expect(body.today.cashClp).toBe(1500);
  expect(body.today.cardClp).toBe(750);
  expect(body.today.otherClp).toBe(0);
  expect(body.today.refundCount).toBe(1);
  expect(body.today.voidCount).toBe(1);
  expect(body.today.stockWarningCount).toBe(0);
  expect(body.month.summary.netRevenueClp).toBe(2250);
  expect(body.year.summary.netRevenueClp).toBe(2550);
  expect(body.year.summary.otherClp).toBe(300);
  expect(body.recentSales.some((row: { saleNumber: string | null }) =>
    row.saleNumber === `TASK081-WIN7HTTP-${dataset.runId}-DOC`,
  )).toBe(true);
}

async function verifyOfflineReconnectRevenueApi(page: Page, dataset: Dataset) {
  const { body, status } = await fetchBrowserJson(
    page,
    `/api/shop/pos/revenue?shop_id=${dataset.shopId}`,
  );

  expect(status, JSON.stringify(body)).toBe(200);
  expect(body.status).toBe("ready");
  expect(body.today.netRevenueClp).toBe(3250);
  expect(body.today.documentedRevenueClp).toBe(2750);
  expect(body.today.cashClp).toBe(2500);
  expect(body.today.cardClp).toBe(750);
  expect(body.today.refundCount).toBe(1);
  expect(body.today.voidCount).toBe(1);
  expect(body.month.summary.netRevenueClp).toBe(3250);
  expect(body.year.summary.netRevenueClp).toBe(3550);
  expect(body.recentSales.some((row: { saleNumber: string | null }) =>
    row.saleNumber === `TASK081-OFFLINE-${dataset.runId}-SALE`,
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
  await expectText("$2.250");
  await expectText("Incasso documentato");
  await expectText("$1.750");
  await expectText("Da verificare");
  await expectText("$500");
  await expectText("Storico mensile");
  await expectText("Storico annuale");
  await expectText(`TASK081-WIN7HTTP-${dataset.runId}-DOC`);

  const openButton = page
    .locator("tr", { hasText: `TASK081-WIN7HTTP-${dataset.runId}-DOC` })
    .getByRole("button", { name: "Apri" });
  await openButton.click();
  await expect(page.getByText(dataset.productName).first()).toBeVisible();
  await expect(page.getByText("item").first()).toBeVisible();

  mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({
    fullPage: false,
    path: join(screenshotDir, `task081z-win7http-${dataset.runId}-${mode}.png`),
  });
}

test.beforeAll(async () => {
  cleanupSessionJsonFiles();
  const runtime = loadLocalSupabaseEnv();
  const supabase = createAdminClient(runtime);
  const dataset = await setupSyntheticDataset(supabase);

  state.runtime = runtime;
  state.supabase = supabase;
  state.dataset = dataset;
});

test.afterAll(async () => {
  cleanupSessionJsonFiles();

  if (state.sessionJsonPath) {
    rmSync(state.sessionJsonPath, { force: true });
  }

  if (state.catalogDbPath) {
    rmSync(state.catalogDbPath, { force: true });
  }

  if (state.supabase && state.dataset) {
    await cleanupSyntheticDataset(state.supabase, {
      ownerUserId: state.dataset.ownerUserId,
      reason: "task081_win7http_e2e_cleanup",
      shopId: state.dataset.shopId,
    });
    await verifyCleanup(state.supabase, state.dataset);
  }
});

test("TASK-081 Win7POS real HTTP sales sync, revenue UI, stock and cleanup E2E", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const { dataset, runtime, supabase } = state;

  if (!dataset || !runtime || !supabase) {
    fail("dataset was not initialized.");
  }

  const auth = await firstLogin(request, dataset);
  const sessionJsonPath = writeSessionJson(dataset, auth);
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3050";
  runWin7PosCatalogPriceHarness({
    baseUrl,
    dataset,
    expected: {
      itemNumber: `TASK081Z_WIN7HTTP_ITEM_${dataset.runId}`,
      productName: dataset.productName,
      purchasePrice: 100,
      retailPrice: 1000,
      stock: 10,
    },
    sessionJsonPath,
  });
  await updateCatalogForDeltaPull(supabase, dataset);
  runWin7PosCatalogPriceHarness({
    baseUrl,
    dataset,
    expected: {
      itemNumber: `TASK081Z_WIN7HTTP_ITEM_${dataset.runId}_UPDATED`,
      productName: `${dataset.productName}_UPDATED`,
      purchasePrice: 120,
      retailPrice: 1250,
      stock: 14,
    },
    sessionJsonPath,
  });
  runWin7PosHttpHarness({ baseUrl, dataset, sessionJsonPath });

  await verifyDatabaseState(supabase, dataset);

  await loginShopAdmin(page, dataset);
  await verifyRevenueApi(page, dataset);
  await verifyRevenueUi(page, dataset, "desktop");

  await page.setViewportSize({ height: 844, width: 390 });
  await page.reload();
  await verifyRevenueUi(page, dataset, "mobile");

  runWin7PosOfflineReconnectHarness({ baseUrl, dataset, sessionJsonPath });
  await expectProductStock(supabase, dataset.productId, 10);
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.reload();
  await verifyOfflineReconnectRevenueApi(page, dataset);
  await expect(page.getByText(`TASK081-OFFLINE-${dataset.runId}-SALE`, { exact: true }).first()).toBeVisible();

  await tombstoneCatalogProduct(supabase, dataset);
  runWin7PosCatalogPriceHarness({
    baseUrl,
    dataset,
    expectTombstone: true,
    expected: {
      itemNumber: `TASK081Z_WIN7HTTP_ITEM_${dataset.runId}_UPDATED`,
      productName: `${dataset.productName}_UPDATED`,
      purchasePrice: 120,
      retailPrice: 1250,
      stock: 10,
    },
    sessionJsonPath,
  });

  const publicClient = createPublicClient(runtime);
  const signIn = await publicClient.auth.signInWithPassword({
    email: dataset.email,
    password: dataset.password,
  });
  expect(signIn.error).toBeNull();
});
