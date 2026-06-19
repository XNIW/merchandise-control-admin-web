import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes, scrypt } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { Database } from "../../src/lib/supabase/database.types";

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

type AdminClient = SupabaseClient<Database>;

type CleanupSummary = {
  cleanupErrors: readonly string[];
  residualRows: number;
  userDeleted: boolean;
};

type Task035Fixture = {
  blockedShopCode: string;
  blockedShopId: string;
  cashierCredential: string;
  categoryId: string;
  cleanup: () => Promise<CleanupSummary>;
  email: string;
  password: string;
  productName: string;
  shopCode: string;
  shopId: string;
  staffCode: string;
  staffId: string;
  staffManagerCode: string;
  staffManagerCredential: string;
  staffManagerId: string;
  staffWebAttemptKeyHash: string;
  supplierId: string;
  userId: string;
};

type Runtime =
  | {
      reason: string;
      status: "blocked";
      supabaseTargetKind: string;
    }
  | {
      publishableKey: string;
      serviceRoleKey: string;
      status: "ready";
      supabaseTargetKind: "local";
      supabaseUrl: string;
    };

const guardedShopRoutes = [
  "/shop",
  "/shop/products",
  "/shop/import-export",
  "/shop/devices",
  "/shop/pos",
] as const;
const STAFF_CREDENTIAL_SCHEME = "scrypt-v1";
const STAFF_KEY_LENGTH = 64;
const STAFF_SALT_BYTES = 16;
const STAFF_SCRYPT_PARAMS = {
  N: 16384,
  p: 1,
  r: 8,
};
const STAFF_SCRYPT_MAXMEM = 64 * 1024 * 1024;

const authenticatedSmokeRoutes: Array<{
  assertText?: (fixture: Task035Fixture) => string;
  heading: string;
  path: string;
}> = [
  { heading: "Shop Overview", path: "/shop", assertText: (fixture) => fixture.shopCode },
  {
    heading: "Products",
    path: "/shop/products",
    assertText: (fixture) => fixture.productName,
  },
  { heading: "Categories", path: "/shop/categories", assertText: () => "TASK035_Category" },
  { heading: "Suppliers", path: "/shop/suppliers", assertText: () => "TASK035_Supplier" },
  { heading: "Import / Export", path: "/shop/import-export", assertText: () => "Preview before apply" },
  { heading: "Members", path: "/shop/members", assertText: () => "Shop Owner" },
  { heading: "Roles", path: "/shop/roles", assertText: () => "Shop Owner" },
  { heading: "POS / Staff", path: "/shop/staff", assertText: (fixture) => fixture.staffCode },
  { heading: "Devices", path: "/shop/devices", assertText: () => "Reason" },
  { heading: "Audit", path: "/shop/audit", assertText: () => "No shop audit rows are visible" },
  { heading: "Settings", path: "/shop/settings", assertText: () => "Server verified" },
  { heading: "POS Live", path: "/shop/pos", assertText: () => "TASK035_SMOKE" },
  { heading: "Sync Center", path: "/shop/sync", assertText: () => "without triggering synchronization" },
];

function loadEnvFile(path: string) {
  if (!existsSync(path)) {
    return;
  }

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && value && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readRuntimeEnv() {
  for (const path of [".env.local", ".env.development.local", ".env"]) {
    loadEnvFile(path);
  }
}

function supabaseTargetKind(value: string | undefined) {
  if (!value) {
    return "missing";
  }

  try {
    const url = new URL(value);

    if (isLocalSupabaseUrl(url)) {
      return "local";
    }

    if (url.hostname.endsWith(".supabase.co")) {
      return "supabase_cloud";
    }

    return "custom_remote";
  } catch {
    return "invalid";
  }
}

function isLocalSupabaseUrl(url: URL) {
  return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
}

function resolveRuntime(): Runtime {
  readRuntimeEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const targetKind = supabaseTargetKind(supabaseUrl);

  if (!supabaseUrl) {
    return {
      reason: "BLOCKED_NO_AUTH_SESSION: NEXT_PUBLIC_SUPABASE_URL is not configured.",
      status: "blocked",
      supabaseTargetKind: targetKind,
    };
  }

  if (targetKind !== "local") {
    return {
      reason:
        "BLOCKED_NO_AUTH_SESSION: TASK-035 creates TASK035_* data only on local Supabase, not on cloud/remote targets.",
      status: "blocked",
      supabaseTargetKind: targetKind,
    };
  }

  if (!publishableKey) {
    return {
      reason:
        "BLOCKED_NO_AUTH_SESSION: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required for browser login and SSR session cookies.",
      status: "blocked",
      supabaseTargetKind: targetKind,
    };
  }

  if (!serviceRoleKey) {
    return {
      reason:
        "BLOCKED_NO_AUTH_SESSION: local SUPABASE_SERVICE_ROLE_KEY is required for synthetic setup and cleanup.",
      status: "blocked",
      supabaseTargetKind: targetKind,
    };
  }

  return {
    publishableKey,
    serviceRoleKey,
    status: "ready",
    supabaseTargetKind: "local",
    supabaseUrl,
  };
}

async function must<T>(
  label: string,
  result: PromiseLike<{ data: T; error: unknown }>,
) {
  const { data, error } = await result;

  if (error) {
    throw new Error(`BLOCKED_TASK035_${label}`);
  }

  return data;
}

async function mustSingle<T>(
  label: string,
  result: PromiseLike<{ data: T | null; error: unknown }>,
) {
  const { data, error } = await result;

  if (error || data === null) {
    throw new Error(`BLOCKED_TASK035_${label}`);
  }

  return data;
}

function task035Code(nonce: string, suffix: string) {
  return `TASK035_${suffix}_${nonce}`;
}

function staffHashParams() {
  return [
    `n=${STAFF_SCRYPT_PARAMS.N}`,
    `r=${STAFF_SCRYPT_PARAMS.r}`,
    `p=${STAFF_SCRYPT_PARAMS.p}`,
    `l=${STAFF_KEY_LENGTH}`,
  ].join(",");
}

function deriveStaffScrypt(plaintext: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      plaintext,
      salt,
      STAFF_KEY_LENGTH,
      {
        ...STAFF_SCRYPT_PARAMS,
        maxmem: STAFF_SCRYPT_MAXMEM,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

async function hashStaffCredential(plaintext: string) {
  const salt = randomBytes(STAFF_SALT_BYTES);
  const key = await deriveStaffScrypt(plaintext, salt);

  return [
    "",
    STAFF_CREDENTIAL_SCHEME,
    staffHashParams(),
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

function hashStaffWebAttemptKey(shopCode: string, staffCode: string) {
  return `sha256:${createHash("sha256")
    .update(`${shopCode}:${staffCode}`, "utf8")
    .digest("hex")}`;
}

function hashStaffWebSecret(secret: string) {
  return `sha256:${createHash("sha256").update(secret, "utf8").digest("hex")}`;
}

async function createTask035Fixture(runtime: Extract<Runtime, { status: "ready" }>) {
  const supabase = createClient<Database>(runtime.supabaseUrl, runtime.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const nonce = randomBytes(5).toString("hex").toUpperCase();
  const email = `task035-${nonce.toLowerCase()}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  const shopCode = task035Code(nonce, "SHOP");
  const blockedShopCode = task035Code(nonce, "BLOCKED");
  const categoryName = `TASK035_Category_${nonce}`;
  const supplierName = `TASK035_Supplier_${nonce}`;
  const productName = `TASK035_Product_${nonce}`;
  const staffCode = task035Code(nonce, "STAFF");
  const cashierCredential = `task035_cashier_${randomBytes(18).toString("base64url")}`;
  const staffManagerCode = task035Code(nonce, "MANAGER");
  const staffManagerCredential = `task035_manager_${randomBytes(18).toString("base64url")}`;
  const staffWebAttemptKeyHash = hashStaffWebAttemptKey(
    shopCode,
    staffManagerCode,
  );
  const now = new Date().toISOString();

  const createdUser = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });
  const maybeUserId = createdUser.data.user?.id;

  if (createdUser.error || !maybeUserId) {
    throw new Error("BLOCKED_TASK035_AUTH_USER_CREATE");
  }

  const userId = maybeUserId;
  let authorizedShopId = "";
  let blockedShopId = "";

  async function cleanup(): Promise<CleanupSummary> {
    const shopIds = [authorizedShopId, blockedShopId].filter(Boolean);
    const cleanupErrors: string[] = [];

    async function recordCleanup(
      label: string,
      result: PromiseLike<{ error: unknown }>,
    ) {
      const { error } = await result;

      if (error) {
        cleanupErrors.push(label);
      }
    }

    if (shopIds.length > 0) {
      await recordCleanup(
        "AUDIT_DELETE",
        supabase.from("audit_logs").delete().in("shop_id", shopIds),
      );
      await recordCleanup(
        "DEVICE_DELETE",
        supabase.from("shop_devices").delete().in("shop_id", shopIds),
      );
      await recordCleanup(
        "STAFF_WEB_SESSION_DELETE",
        supabase.from("staff_web_sessions").delete().in("shop_id", shopIds),
      );
      await recordCleanup(
        "STAFF_ROLE_PERMISSION_DELETE",
        supabase.from("staff_role_permissions").delete().in("shop_id", shopIds),
      );
      await recordCleanup(
        "STAFF_DELETE",
        supabase.from("staff_accounts").delete().in("shop_id", shopIds),
      );
      await recordCleanup(
        "INVENTORY_MAPPING_DELETE",
        supabase.from("shop_inventory_sources").delete().in("shop_id", shopIds),
      );
      await recordCleanup(
        "MEMBERSHIP_DELETE",
        supabase.from("shop_members").delete().in("shop_id", shopIds),
      );
      await recordCleanup(
        "SHOP_DELETE",
        supabase.from("shops").delete().in("shop_id", shopIds),
      );
    }

    await recordCleanup(
      "STAFF_WEB_LOGIN_ATTEMPT_DELETE",
      supabase
        .from("staff_web_login_attempts")
        .delete()
        .eq("attempt_key_hash", staffWebAttemptKeyHash),
    );

    await recordCleanup(
      "PRODUCT_DELETE",
      supabase
        .from("inventory_products")
        .delete()
        .eq("owner_user_id", userId)
        .like("barcode", "TASK035_%"),
    );
    await recordCleanup(
      "CATEGORY_DELETE",
      supabase
        .from("inventory_categories")
        .delete()
        .eq("owner_user_id", userId)
        .like("name", "TASK035_%"),
    );
    await recordCleanup(
      "SUPPLIER_DELETE",
      supabase
        .from("inventory_suppliers")
        .delete()
        .eq("owner_user_id", userId)
        .like("name", "TASK035_%"),
    );
    await recordCleanup(
      "PROFILE_DELETE",
      supabase.from("profiles").delete().eq("profile_id", userId),
    );

    const userDelete = await supabase.auth.admin.deleteUser(userId);
    if (userDelete.error) {
      cleanupErrors.push("AUTH_USER_DELETE");
    }

    const residualRows = await countTask035ResidualRows(supabase, {
      blockedShopCode,
      shopCode,
      shopIds,
      staffWebAttemptKeyHash,
      userId,
    });
    if (residualRows > 0) {
      cleanupErrors.push("RESIDUAL_ROWS");
    }

    return {
      cleanupErrors,
      residualRows,
      userDeleted: !userDelete.error,
    };
  }

  try {
    await must(
      "PROFILE_CREATE",
      supabase.from("profiles").upsert(
        {
          display_name: `TASK035 Shop Admin ${nonce}`,
          profile_id: userId,
          profile_status: "active",
        },
        { onConflict: "profile_id" },
      ),
    );

    const authorizedShop = await mustSingle<{ shop_id: string }>(
      "AUTHORIZED_SHOP_CREATE",
      supabase
        .from("shops")
        .insert({
          created_by_profile_id: userId,
          shop_code: shopCode,
          shop_name: `TASK035 Authorized Shop ${nonce}`,
          shop_status: "active",
          status_changed_by_profile_id: userId,
        })
        .select("shop_id")
        .single(),
    );
    const blockedShop = await mustSingle<{ shop_id: string }>(
      "BLOCKED_SHOP_CREATE",
      supabase
        .from("shops")
        .insert({
          created_by_profile_id: userId,
          shop_code: blockedShopCode,
          shop_name: `TASK035 Blocked Shop ${nonce}`,
          shop_status: "active",
          status_changed_by_profile_id: userId,
        })
        .select("shop_id")
        .single(),
    );

    authorizedShopId = authorizedShop.shop_id;
    blockedShopId = blockedShop.shop_id;

    await must(
      "MEMBERSHIP_CREATE",
      supabase.from("shop_members").insert({
        invited_by_profile_id: userId,
        membership_status: "active",
        profile_id: userId,
        role_key: "shop_owner",
        shop_id: authorizedShopId,
      }),
    );
    await must(
      "INVENTORY_MAPPING_CREATE",
      supabase.from("shop_inventory_sources").insert({
        created_by_profile_id: userId,
        mapping_state: "mapped",
        owner_user_id: userId,
        shop_id: authorizedShopId,
        source_kind: "mobile_owner",
        verified_at: now,
        verified_by_profile_id: userId,
      }),
    );

    const supplier = await mustSingle<{ id: string }>(
      "SUPPLIER_CREATE",
      supabase
        .from("inventory_suppliers")
        .insert({
          name: supplierName,
          owner_user_id: userId,
        })
        .select("id")
        .single(),
    );
    const category = await mustSingle<{ id: string }>(
      "CATEGORY_CREATE",
      supabase
        .from("inventory_categories")
        .insert({
          name: categoryName,
          owner_user_id: userId,
        })
        .select("id")
        .single(),
    );

    await must(
      "PRODUCT_CREATE",
      supabase.from("inventory_products").insert({
        barcode: task035Code(nonce, "BARCODE"),
        category_id: category.id,
        item_number: task035Code(nonce, "ITEM"),
        owner_user_id: userId,
        product_name: productName,
        purchase_price: 1.25,
        retail_price: 2.5,
        stock_quantity: 3,
        supplier_id: supplier.id,
      }),
    );
    const cashierCredentialHash = await hashStaffCredential(cashierCredential);
    const managerCredentialHash = await hashStaffCredential(staffManagerCredential);

    const cashierStaff = await mustSingle<{ staff_id: string }>(
      "STAFF_CREATE",
      supabase
        .from("staff_accounts")
        .insert({
          created_by_profile_id: userId,
          credential_hash: cashierCredentialHash,
          credential_kind: "password",
          credential_status: "active",
          credential_updated_at: now,
          credential_version: 1,
          display_name: `TASK035 Staff ${nonce}`,
          failed_attempts: 0,
          must_change_credential: false,
          role_key: "cashier",
          shop_id: authorizedShopId,
          staff_code: staffCode,
          status: "active",
          updated_by_profile_id: userId,
        })
        .select("staff_id")
        .single(),
    );
    await must(
      "STAFF_MANAGER_PERMISSION_CREATE",
      supabase.from("staff_role_permissions").upsert(
        {
          enabled: true,
          permission_key: "shop_admin.full_access",
          role_key: "manager",
          shop_id: authorizedShopId,
          updated_by_profile_id: userId,
        },
        { onConflict: "shop_id,role_key,permission_key" },
      ),
    );
    const managerStaff = await mustSingle<{ staff_id: string }>(
      "STAFF_MANAGER_CREATE",
      supabase
        .from("staff_accounts")
        .insert({
          created_by_profile_id: userId,
          credential_hash: managerCredentialHash,
          credential_kind: "password",
          credential_status: "active",
          credential_updated_at: now,
          credential_version: 1,
          display_name: `TASK035 Manager ${nonce}`,
          failed_attempts: 0,
          must_change_credential: false,
          role_key: "manager",
          shop_id: authorizedShopId,
          staff_code: staffManagerCode,
          status: "active",
          updated_by_profile_id: userId,
        })
        .select("staff_id")
        .single(),
    );
    await must(
      "DEVICE_CREATE",
      supabase.from("shop_devices").insert({
        app_version: "TASK035_SMOKE",
        created_by_profile_id: userId,
        device_identifier: task035Code(nonce, "DEVICE"),
        device_type: "pos",
        display_name: `TASK035 Device ${nonce}`,
        metadata_redacted: { source: "TASK035_smoke" },
        shop_id: authorizedShopId,
        status: "active",
        updated_by_profile_id: userId,
      }),
    );
    return {
      blockedShopCode,
      blockedShopId,
      categoryId: category.id,
      cleanup,
      email,
      password,
      productName,
      shopCode,
      shopId: authorizedShopId,
      cashierCredential,
      staffCode,
      staffId: cashierStaff.staff_id,
      staffManagerCode,
      staffManagerCredential,
      staffManagerId: managerStaff.staff_id,
      staffWebAttemptKeyHash,
      supplierId: supplier.id,
      userId,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function createTask068KProducts(
  runtime: Extract<Runtime, { status: "ready" }>,
  fixture: Task035Fixture,
) {
  const supabase = createClient<Database>(
    runtime.supabaseUrl,
    runtime.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  const rows = Array.from({ length: 105 }, (_, index) => {
    const padded = String(index + 1).padStart(3, "0");

    return {
      barcode: `TASK035_PAGE_${fixture.userId.slice(0, 8)}_${padded}`,
      category_id: fixture.categoryId,
      item_number: `TASK035-PAGE-${padded}`,
      owner_user_id: fixture.userId,
      product_name: `TASK035 Page Product ${padded}`,
      purchase_price: 1 + index,
      retail_price: 2 + index,
      stock_quantity: index + 1,
      supplier_id: fixture.supplierId,
    };
  });

  await must("TASK068K_PRODUCTS_CREATE", supabase.from("inventory_products").insert(rows));
}

async function countTask035ResidualRows(
  supabase: AdminClient,
  input: {
    blockedShopCode: string;
    shopCode: string;
    shopIds: readonly string[];
    staffWebAttemptKeyHash: string;
    userId: string;
  },
) {
  const childTableCounts =
    input.shopIds.length > 0
      ? [
          supabase
            .from("audit_logs")
            .select("audit_log_id", { count: "exact", head: true })
            .in("shop_id", input.shopIds),
          supabase
            .from("shop_devices")
            .select("shop_device_id", { count: "exact", head: true })
            .in("shop_id", input.shopIds),
          supabase
            .from("staff_accounts")
            .select("staff_id", { count: "exact", head: true })
            .in("shop_id", input.shopIds),
          supabase
            .from("staff_role_permissions")
            .select("staff_role_permission_id", { count: "exact", head: true })
            .in("shop_id", input.shopIds),
          supabase
            .from("staff_web_sessions")
            .select("staff_web_session_id", { count: "exact", head: true })
            .in("shop_id", input.shopIds),
          supabase
            .from("shop_inventory_sources")
            .select("shop_inventory_source_id", { count: "exact", head: true })
            .in("shop_id", input.shopIds),
          supabase
            .from("shop_members")
            .select("shop_member_id", { count: "exact", head: true })
            .in("shop_id", input.shopIds),
        ]
      : [];
  const [shops, products, categories, suppliers, profile, ...children] =
    await Promise.all([
    supabase
      .from("shops")
      .select("shop_id", { count: "exact", head: true })
      .in("shop_code", [input.shopCode, input.blockedShopCode]),
    supabase
      .from("inventory_products")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", input.userId)
      .like("barcode", "TASK035_%"),
    supabase
      .from("inventory_categories")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", input.userId)
      .like("name", "TASK035_%"),
    supabase
      .from("inventory_suppliers")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", input.userId)
      .like("name", "TASK035_%"),
    supabase
      .from("profiles")
      .select("profile_id", { count: "exact", head: true })
      .eq("profile_id", input.userId),
    supabase
      .from("staff_web_login_attempts")
      .select("attempt_key_hash", { count: "exact", head: true })
      .eq("attempt_key_hash", input.staffWebAttemptKeyHash),
    ...childTableCounts,
  ]);
  const countResults = [shops, products, categories, suppliers, profile, ...children];
  const failedCount = countResults.find((result) => result.error);

  if (failedCount) {
    throw new Error("BLOCKED_TASK035_CLEANUP_FAILED");
  }

  return countResults.reduce(
    (total, result) => total + (result.count ?? 0),
    0,
  );
}

async function signInWithTask035Credentials(
  page: import("@playwright/test").Page,
  fixture: Task035Fixture,
) {
  await page.goto("/auth/login?next=/shop");
  await expect(
    page.getByRole("heading", { level: 1, name: "Admin Console sign in" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(fixture.email);
  await page.getByLabel("Password").fill(fixture.password);

  await Promise.all([
    page.waitForURL((url) => url.pathname === "/shop", { timeout: 15_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

async function createTask035StaffWebSession(
  runtime: Extract<Runtime, { status: "ready" }>,
  fixture: Task035Fixture,
  staffId: string,
) {
  const supabase = createClient<Database>(runtime.supabaseUrl, runtime.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const rawSession = `mcstaff_web_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await must(
    "STAFF_WEB_SESSION_CREATE",
    supabase.from("staff_web_sessions").insert({
      expires_at: expiresAt,
      metadata_redacted: {
        source: "TASK035_staff_web_session_smoke",
      },
      session_token_hash: hashStaffWebSecret(rawSession),
      shop_id: fixture.shopId,
      staff_credential_version: 1,
      staff_id: staffId,
      status: "active",
    }),
  );

  return rawSession;
}

async function setTask035StaffWebCookie(
  page: import("@playwright/test").Page,
  rawSession: string,
) {
  await page.context().addCookies([
    {
      httpOnly: true,
      name: "mc_staff_web_session",
      sameSite: "Lax",
      secure: false,
      url: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3036",
      value: rawSession,
    },
  ]);
}

async function assertNoSensitiveText(
  page: import("@playwright/test").Page,
  sensitiveValues: readonly string[] = [],
) {
  const body = await page.locator("body").innerText();

  expect(body).not.toMatch(/\b(access_token|refresh_token|service_role|credential_hash|password_hash|pin_hash)\b/i);
  expect(body).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);

  for (const value of sensitiveValues) {
    if (value) {
      expect(body.includes(value)).toBe(false);
    }
  }
}

test.describe("TASK-035 Shop Admin authenticated smoke harness", () => {
  const runtime = resolveRuntime();

  test("confirms Shop Admin access guard without a session", async ({ page }) => {
    for (const route of guardedShopRoutes) {
      await page.goto(route);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Admin Console access required",
        }),
      ).toBeVisible();
      await expect(page.getByText("No active session")).toBeVisible();
      await assertNoSensitiveText(page);
    }

    await page.goto("/shop/devices");
    await page.screenshot({
      fullPage: true,
      path: "docs/TASKS/EVIDENCE/TASK-035/browser-shop-devices-auth-required.png",
    });
  });

  test("uses TASK035_* local synthetic data for authenticated Shop Admin smoke and cleanup", async ({
    page,
  }) => {
    if (runtime.status !== "ready") {
      test.skip(true, runtime.reason);
      return;
    }

    const fixture = await createTask035Fixture(runtime);

    try {
      await signInWithTask035Credentials(page, fixture);

      for (const route of authenticatedSmokeRoutes) {
        await page.goto(`${route.path}?shop_id=${fixture.shopId}`);
        await expect(
          page.getByRole("heading", { level: 1, name: route.heading }),
        ).toBeVisible();

        if (route.assertText) {
          await expect(page.getByText(route.assertText(fixture)).first()).toBeVisible();
        }

        await assertNoSensitiveText(page, [
          fixture.cashierCredential,
          fixture.password,
          fixture.staffManagerCredential,
          runtime.publishableKey,
          runtime.serviceRoleKey,
        ]);
      }

      await page.goto(`/shop?shop_id=${fixture.blockedShopId}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Shop Overview" }),
      ).toBeVisible();
      const blockedRequestHeader = page.getByRole("group", {
        name: /Shop workspace/,
      });

      await expect(blockedRequestHeader.getByText(/^Company RUT:/)).toBeVisible();
      await expect(blockedRequestHeader).not.toContainText("Shop code:");
      await expect(blockedRequestHeader).not.toContainText(
        fixture.blockedShopCode,
      );
      await expect(page.getByText(fixture.blockedShopCode)).toHaveCount(0);

      await page.screenshot({
        fullPage: true,
        path: "docs/TASKS/EVIDENCE/TASK-035/browser-shop-overview-authenticated.png",
      });

      await page.goto("/auth/logout");
      await page.goto("/shop");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Admin Console access required",
        }),
      ).toBeVisible();
    } finally {
      const cleanup = await fixture.cleanup();

      expect(cleanup.cleanupErrors).toEqual([]);
      expect(cleanup.userDeleted).toBe(true);
      expect(cleanup.residualRows).toBe(0);
    }
  });

  test("TASK-054 preserves personal account auth across Shop Admin sidebar navigation", async ({
    page,
  }) => {
    if (runtime.status !== "ready") {
      test.skip(true, runtime.reason);
      return;
    }

    const fixture = await createTask035Fixture(runtime);

    try {
      await signInWithTask035Credentials(page, fixture);

      await page.goto(
        `/shop/products?${new URLSearchParams({
          category_id: "leaked-category",
          event: "leaked-event",
          query: fixture.productName,
          shop_id: fixture.shopId,
          status: "failed",
          supplier_id: "leaked-supplier",
          target_id: "leaked-target",
        }).toString()}`,
      );

      const navigation = page.getByRole("navigation", { name: "Shop sections" });
      const flow = [
        { heading: "Products", label: "Products", text: fixture.productName },
        { heading: "Categories", label: "Categories", text: "TASK035_Category" },
        { heading: "Suppliers", label: "Suppliers", text: "TASK035_Supplier" },
        { heading: "POS / Staff", label: "Staff", text: fixture.staffCode },
        { heading: "Devices", label: "Devices", text: "Reason" },
        { heading: "Shop Overview", label: "Overview", text: fixture.shopCode },
      ] as const;

      for (const step of flow) {
        await navigation.getByRole("link", { name: step.label }).click();
        await expect(
          page.getByRole("heading", { level: 1, name: step.heading }),
        ).toBeVisible();
        await expect(page.getByText(step.text).first()).toBeVisible();

        const currentUrl = new URL(page.url());

        expect(currentUrl.searchParams.get("shop_id")).toBe(fixture.shopId);
        expect([...currentUrl.searchParams.keys()]).toEqual(["shop_id"]);
        await expect(page.locator("body")).not.toContainText(
          "No staff web session cookie is present",
        );
        await expect(page.locator("body")).not.toContainText("Unauthorized");
      }

      await assertNoSensitiveText(page, [
        fixture.cashierCredential,
        fixture.password,
        fixture.staffManagerCredential,
        runtime.publishableKey,
        runtime.serviceRoleKey,
      ]);
    } finally {
      const cleanup = await fixture.cleanup();

      expect(cleanup.cleanupErrors).toEqual([]);
      expect(cleanup.userDeleted).toBe(true);
      expect(cleanup.residualRows).toBe(0);
    }
  });

  test("TASK-068K products UX smoke covers pagination, search, reset, and sidebar icons", async ({
    page,
  }) => {
    if (runtime.status !== "ready") {
      test.skip(true, runtime.reason);
      return;
    }

    const fixture = await createTask035Fixture(runtime);

    try {
      await createTask068KProducts(runtime, fixture);
      await signInWithTask035Credentials(page, fixture);
      await page.goto(`/shop/products?shop_id=${fixture.shopId}`);

      await expect(
        page.getByRole("heading", { level: 1, name: "Products" }),
      ).toBeVisible();
      await expect(page.locator("[data-product-catalog-list]")).toBeVisible();
      await expect(page.locator("[data-product-catalog-row]")).toHaveCount(100);

      const firstCatalogRow = page.locator("[data-product-catalog-row]").first();
      await expect(firstCatalogRow.locator("[data-product-identity]")).toContainText(
        /TASK035/,
      );
      await expect(firstCatalogRow.locator("[data-product-codes]")).toContainText(
        "Barcode",
      );
      await expect(firstCatalogRow.locator("[data-product-codes]")).toContainText(
        "Item number",
      );
      await expect(
        firstCatalogRow.locator(
          '[data-product-action-toolbar] svg[aria-hidden="true"]',
        ),
      ).toHaveCount(3);

      const shopNavigation = page.getByRole("navigation", {
        name: "Shop sections",
      });
      await expect(
        shopNavigation
          .getByRole("link", { name: "Products" })
          .locator('svg[aria-hidden="true"]'),
      ).toHaveCount(1);
      await expect(
        page
          .getByRole("button", { name: "New product" })
          .locator('svg[aria-hidden="true"]'),
      ).toHaveCount(1);
      await expect(
        page
          .getByRole("button", { name: "Import supplier Excel" })
          .locator('svg[aria-hidden="true"]'),
      ).toHaveCount(1);
      await page.getByRole("button", { name: "Import supplier Excel" }).click();
      await expect(
        page.getByRole("dialog", { name: "Supplier workbook preview" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Close" }).click();
      await expect(
        page
          .getByRole("button", { name: "Export catalog Excel" })
          .locator('svg[aria-hidden="true"]'),
      ).toHaveCount(1);
      await expect(
        page
          .getByRole("button", { name: "Database transfer" })
          .locator('svg[aria-hidden="true"]'),
      ).toHaveCount(1);

      const topPagination = page.getByRole("navigation", {
        name: "Products pagination top",
      });
      const bottomPagination = page.getByRole("navigation", {
        name: "Products pagination bottom",
      });

      await expect(topPagination).toContainText(/1-100 of 106/);
      await expect(topPagination).toContainText("Page 1 of 2");
      await expect(bottomPagination).toContainText(/1-100 of 106/);
      await expect(bottomPagination).toContainText("Page 1 of 2");

      await topPagination.getByRole("link", { name: /Next: page 2/ }).click();
      await expect(page).toHaveURL(/[\?&]page=2(?:&|$)/);
      await expect(
        page.getByRole("navigation", { name: "Products pagination bottom" }),
      ).toContainText("Page 2 of 2");

      const searchInput = page.getByPlaceholder(
        "Search barcode, item number, product name",
      );

      await searchInput.fill("TASK035 Page Product 104");
      await searchInput.press("Enter");
      await expect(page).toHaveURL(/[\?&]q=TASK035\+Page\+Product\+104(?:&|$)/);
      await expect(page.getByText("TASK035 Page Product 104")).toBeVisible();
      await expect(page.getByText(/Filters active: 1/)).toBeVisible();

      await page.getByRole("link", { name: "Reset filters" }).click();
      await expect(page).not.toHaveURL(/[\?&]q=/);
      await expect(
        page.getByPlaceholder("Search barcode, item number, product name"),
      ).toHaveValue("");

      const resetBottomPagination = page.getByRole("navigation", {
        name: "Products pagination bottom",
      });
      await resetBottomPagination.getByLabel("Go to page").fill("2");
      await resetBottomPagination.getByRole("button", { name: "Go" }).click();
      await expect(page).toHaveURL(/[\?&]page=2(?:&|$)/);

      await page.setViewportSize({ width: 390, height: 820 });
      await page.goto(`/shop/products?shop_id=${fixture.shopId}`);
      await expect(page.locator("[data-product-catalog-row]").first()).toBeVisible();
      await expect(
        page
          .locator("[data-product-catalog-row]")
          .first()
          .locator("[data-product-action-toolbar]"),
      ).toBeVisible();
      const hasDocumentOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(hasDocumentOverflow).toBe(false);
    } finally {
      const cleanup = await fixture.cleanup();

      expect(cleanup.cleanupErrors).toEqual([]);
      expect(cleanup.userDeleted).toBe(true);
      expect(cleanup.residualRows).toBe(0);
    }
  });

  test("uses TASK035_* local synthetic data for staff manager web session and cashier denial", async ({
    page,
  }) => {
    if (runtime.status !== "ready") {
      test.skip(true, runtime.reason);
      return;
    }

    const fixture = await createTask035Fixture(runtime);

    try {
      await signInWithTask035Credentials(page, fixture);

      const managerSession = await createTask035StaffWebSession(
        runtime,
        fixture,
        fixture.staffManagerId,
      );

      await setTask035StaffWebCookie(page, managerSession);
      await page.goto("/shop");

      await expect(
        page.getByRole("heading", { level: 1, name: "Shop Overview" }),
      ).toBeVisible();
      await expect(page.getByText(fixture.shopCode).first()).toBeVisible();
      await expect(page.locator("#shop-switcher")).toHaveCount(0);
      await expect(
        page.getByLabel("Shop status").getByText("Shop Manager"),
      ).toBeVisible();
      await expect(
        page.getByLabel("Shop status").getByText("Shop Owner"),
      ).toHaveCount(0);

      for (const route of [
        { heading: "Products", path: "/shop/products", text: fixture.productName },
        { heading: "POS / Staff", path: "/shop/staff", text: fixture.staffManagerCode },
        { heading: "POS Live", path: "/shop/pos", text: "TASK035_SMOKE" },
      ]) {
        await page.goto(`${route.path}?shop_id=${fixture.shopId}`);
        await expect(
          page.getByRole("heading", { level: 1, name: route.heading }),
        ).toBeVisible();
        await expect(page.getByText(route.text).first()).toBeVisible();
        await expect(page.locator("#shop-switcher")).toHaveCount(0);
        await expect(
          page.getByLabel("Shop status").getByText("Shop Manager"),
        ).toBeVisible();
        await assertNoSensitiveText(page, [
          fixture.cashierCredential,
          fixture.password,
          fixture.staffManagerCredential,
          runtime.publishableKey,
          runtime.serviceRoleKey,
        ]);
      }

      await page.goto(`/shop?shop_id=${fixture.blockedShopId}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Shop Overview" }),
      ).toBeVisible();
      await expect(page.locator("#shop-switcher")).toHaveCount(0);
      await expect(
        page.getByLabel("Shop status").getByText("Shop Manager"),
      ).toBeVisible();
      const blockedRequestHeader = page.getByRole("group", {
        name: /Shop workspace/,
      });

      await expect(blockedRequestHeader.getByText(/^Company RUT:/)).toBeVisible();
      await expect(blockedRequestHeader).not.toContainText("Shop code:");
      await expect(blockedRequestHeader).not.toContainText(
        fixture.blockedShopCode,
      );
      await expect(page.getByText(fixture.blockedShopCode)).toHaveCount(0);

      await page.context().clearCookies();
      await page.goto("/shop");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Admin Console access required",
        }),
      ).toBeVisible();

      const cashierSession = await createTask035StaffWebSession(
        runtime,
        fixture,
        fixture.staffId,
      );
      await setTask035StaffWebCookie(page, cashierSession);
      await page.goto("/shop");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Admin Console access required",
        }),
      ).toBeVisible();
      await assertNoSensitiveText(page, [
        fixture.cashierCredential,
        fixture.password,
        fixture.staffManagerCredential,
        runtime.publishableKey,
        runtime.serviceRoleKey,
      ]);
    } finally {
      const cleanup = await fixture.cleanup();

      expect(cleanup.cleanupErrors).toEqual([]);
      expect(cleanup.userDeleted).toBe(true);
      expect(cleanup.residualRows).toBe(0);
    }
  });
});
