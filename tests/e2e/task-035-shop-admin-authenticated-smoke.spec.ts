import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
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
  cleanup: () => Promise<CleanupSummary>;
  email: string;
  password: string;
  productName: string;
  shopCode: string;
  shopId: string;
  staffCode: string;
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
    await must(
      "STAFF_CREATE",
      supabase.from("staff_accounts").insert({
        created_by_profile_id: userId,
        credential_status: "pending_setup",
        display_name: `TASK035 Staff ${nonce}`,
        role_key: "cashier",
        shop_id: authorizedShopId,
        staff_code: staffCode,
        status: "pending_credential",
        updated_by_profile_id: userId,
      }),
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
      cleanup,
      email,
      password,
      productName,
      shopCode,
      shopId: authorizedShopId,
      staffCode,
      userId,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function countTask035ResidualRows(
  supabase: AdminClient,
  input: {
    blockedShopCode: string;
    shopCode: string;
    shopIds: readonly string[];
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
    page.getByRole("heading", { level: 1, name: "Admin sign in" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(fixture.email);
  await page.getByLabel("Password").fill(fixture.password);

  await Promise.all([
    page.waitForURL((url) => url.pathname === "/shop", { timeout: 15_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
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
          name: "Shop Admin access required",
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
          fixture.password,
          runtime.publishableKey,
          runtime.serviceRoleKey,
        ]);
      }

      await page.goto(`/shop?shop_id=${fixture.blockedShopId}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Shop Overview" }),
      ).toBeVisible();
      await expect(page.getByText(fixture.shopCode).first()).toBeVisible();
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
          name: "Shop Admin access required",
        }),
      ).toBeVisible();
    } finally {
      const cleanup = await fixture.cleanup();

      expect(cleanup.cleanupErrors).toEqual([]);
      expect(cleanup.userDeleted).toBe(true);
      expect(cleanup.residualRows).toBe(0);
    }
  });
});
