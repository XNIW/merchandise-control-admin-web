import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import type { Database } from "../../src/lib/supabase/database.types";

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

type AdminClient = SupabaseClient<Database>;

type Runtime =
  | {
      reason: string;
      status: "blocked";
    }
  | {
      publishableKey: string;
      serviceRoleKey: string;
      status: "ready";
      supabaseUrl: string;
    };

type Task078CFixture = {
  activeHistoryName: string;
  barcode: string;
  categoryName: string;
  cleanup: () => Promise<void>;
  deletedHistoryName: string;
  email: string;
  itemNumber: string;
  password: string;
  productName: string;
  shopId: string;
  shopName: string;
  supplierName: string;
  userId: string;
};

const EVIDENCE_DIR = "docs/TASKS/EVIDENCE/TASK-078C";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveRuntime(): Runtime {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return {
      reason: "Local Supabase env is required for TASK-078C visual QA.",
      status: "blocked",
    };
  }

  try {
    const url = new URL(supabaseUrl);

    if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
      return {
        reason: "TASK-078C visual QA only runs against local Supabase.",
        status: "blocked",
      };
    }
  } catch {
    return {
      reason: "NEXT_PUBLIC_SUPABASE_URL is not a valid URL.",
      status: "blocked",
    };
  }

  return {
    publishableKey,
    serviceRoleKey,
    status: "ready",
    supabaseUrl,
  };
}

async function must<T>(
  label: string,
  result: PromiseLike<{ data: T; error: unknown }>,
) {
  const { data, error } = await result;

  if (error) {
    throw new Error(`TASK078C_${label}: ${formatSupabaseError(error)}`);
  }

  return data;
}

async function mustSingle<T>(
  label: string,
  result: PromiseLike<{ data: T | null; error: unknown }>,
) {
  const { data, error } = await result;

  if (error || data === null) {
    throw new Error(
      `TASK078C_${label}: ${error ? formatSupabaseError(error) : "missing data"}`,
    );
  }

  return data;
}

function formatSupabaseError(error: unknown) {
  if (!error) {
    return "unknown error";
  }

  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = ["message", "code", "details", "hint"]
      .map((key) =>
        typeof record[key] === "string" && record[key]
          ? `${key}=${record[key]}`
          : "",
      )
      .filter(Boolean);

    if (parts.length > 0) {
      return parts.join("; ");
    }
  }

  return String(error);
}

function taskCode(nonce: string, suffix: string) {
  return `TASK078C_${suffix}_${nonce}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);

  return next.toISOString();
}

async function deleteShopAuditRows(
  supabase: AdminClient,
  shopIds: readonly string[],
) {
  const validShopIds = shopIds.filter((shopId) => UUID_PATTERN.test(shopId));

  if (validShopIds.length === 0) {
    return;
  }

  await supabase.from("audit_logs").delete().in("shop_id", validShopIds);
}

async function createTask078CFixture(
  runtime: Extract<Runtime, { status: "ready" }>,
): Promise<Task078CFixture> {
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
  const nonce = randomBytes(5).toString("hex").toUpperCase();
  const now = new Date();
  const nowIso = now.toISOString();
  const lastMonthIso = addDays(now, -35);
  const email = `task078c-${nonce.toLowerCase()}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  const shopName = `TASK078C Shop ${nonce}`;
  const shopCode = taskCode(nonce, "SHOP");
  const supplierName = `TASK078C Supplier ${nonce}`;
  const categoryName = `TASK078C Category ${nonce}`;
  const productName = `TASK078C Product ${nonce}`;
  const barcodeDigits = nonce
    .split("")
    .map((char) => String(char.charCodeAt(0) % 10))
    .join("");
  const barcode = `780${barcodeDigits.slice(0, 9)}`;
  const itemNumber = `ITEM078C-${nonce.slice(0, 6)}`;
  const activeRemoteId = `task078c-active-${nonce.toLowerCase()}`;
  const deletedRemoteId = `task078c-deleted-${nonce.toLowerCase()}`;
  const activeHistoryName = `TASK078C Import ${nonce}`;
  const deletedHistoryName = `TASK078C Deleted Import ${nonce}`;
  const createdUser = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });
  const userId = createdUser.data.user?.id ?? "";
  const shopIds: string[] = [];

  if (createdUser.error || !userId) {
    throw new Error("TASK078C_AUTH_USER_CREATE");
  }

  async function cleanup() {
    await deleteShopAuditRows(supabase, shopIds);
    await supabase.from("sync_events").delete().eq("owner_user_id", userId);
    await supabase
      .from("shared_sheet_sessions")
      .delete()
      .eq("owner_user_id", userId);
    await supabase
      .from("inventory_product_prices")
      .delete()
      .eq("owner_user_id", userId);
    await supabase.from("inventory_products").delete().eq("owner_user_id", userId);
    await supabase
      .from("inventory_categories")
      .delete()
      .eq("owner_user_id", userId);
    await supabase
      .from("inventory_suppliers")
      .delete()
      .eq("owner_user_id", userId);

    if (shopIds.length > 0) {
      await supabase.from("shop_inventory_sources").delete().in("shop_id", shopIds);
      await supabase.from("shop_members").delete().in("shop_id", shopIds);
      await supabase.from("shops").delete().in("shop_id", shopIds);
    }

    await supabase.from("profiles").delete().eq("profile_id", userId);
    await supabase.auth.admin.deleteUser(userId);
  }

  try {
    await must(
      "PROFILE_CREATE",
      supabase.from("profiles").upsert(
        {
          display_name: `TASK078C Owner ${nonce}`,
          profile_id: userId,
          profile_status: "active",
        },
        { onConflict: "profile_id" },
      ),
    );
    const shop = await mustSingle<{ shop_id: string }>(
      "SHOP_CREATE",
      supabase
        .from("shops")
        .insert({
          created_by_profile_id: userId,
          shop_code: shopCode,
          shop_name: shopName,
          shop_status: "active",
          status_changed_by_profile_id: userId,
        })
        .select("shop_id")
        .single(),
    );

    shopIds.push(shop.shop_id);
    await must(
      "MEMBERSHIP_CREATE",
      supabase.from("shop_members").insert({
        invited_by_profile_id: userId,
        membership_status: "active",
        profile_id: userId,
        role_key: "shop_owner",
        shop_id: shop.shop_id,
      }),
    );
    await must(
      "INVENTORY_MAPPING_CREATE",
      supabase.from("shop_inventory_sources").insert({
        created_by_profile_id: userId,
        mapping_state: "mapped",
        owner_user_id: userId,
        shop_id: shop.shop_id,
        source_kind: "mobile_owner",
        verified_at: nowIso,
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
          shop_id: shop.shop_id,
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
          shop_id: shop.shop_id,
        })
        .select("id")
        .single(),
    );
    const product = await mustSingle<{ id: string }>(
      "PRODUCT_CREATE",
      supabase
        .from("inventory_products")
        .insert({
          barcode,
          category_id: category.id,
          item_number: itemNumber,
          owner_user_id: userId,
          product_name: productName,
          purchase_price: 10.25,
          retail_price: 18.5,
          second_product_name: `TASK078C Secondary ${nonce}`,
          shop_id: shop.shop_id,
          stock_quantity: 42,
          supplier_id: supplier.id,
          updated_at: nowIso,
        })
        .select("id")
        .single(),
    );

    await must(
      "PRICE_HISTORY_CREATE",
      supabase.from("inventory_product_prices").insert([
        {
          created_at: addDays(now, -2),
          effective_at: addDays(now, -2),
          id: randomUUID(),
          note: "TASK078C current purchase",
          owner_user_id: userId,
          price: 10.25,
          product_id: product.id,
          shop_id: shop.shop_id,
          source: "task078c_fixture",
          type: "PURCHASE",
        },
        {
          created_at: addDays(now, -1),
          effective_at: addDays(now, -1),
          id: randomUUID(),
          note: "TASK078C current retail",
          owner_user_id: userId,
          price: 18.5,
          product_id: product.id,
          shop_id: shop.shop_id,
          source: "task078c_fixture",
          type: "RETAIL",
        },
      ]),
    );

    const activeData = [
      ["No.", "Item code", "Barcode", "Product", "Quantity", "Purchase", "Retail"],
      ["1", itemNumber, barcode, productName, "4", "10.25", "18.50"],
      ["2", "MISSING-078C", "078C000000", "TASK078C Missing Product", "1", "3.00", "4.00"],
    ];
    const overlay = {
      complete: [true, true, false],
      editable: activeData.map(() => ["", ""]),
      overlay_schema: 1,
    };

    await must(
      "HISTORY_CREATE",
      supabase.from("shared_sheet_sessions").insert([
        {
          category: categoryName,
          data: activeData,
          display_name: activeHistoryName,
          is_manual_entry: true,
          owner_user_id: userId,
          payload_version: 2,
          remote_id: activeRemoteId,
          session_overlay: overlay,
          shop_id: shop.shop_id,
          supplier: supplierName,
          timestamp: nowIso,
          updated_at: nowIso,
        },
        {
          category: categoryName,
          data: activeData,
          deleted_at: nowIso,
          display_name: deletedHistoryName,
          is_manual_entry: true,
          owner_user_id: userId,
          payload_version: 2,
          remote_id: deletedRemoteId,
          session_overlay: overlay,
          shop_id: shop.shop_id,
          supplier: supplierName,
          timestamp: lastMonthIso,
          updated_at: lastMonthIso,
        },
      ]),
    );
    await must(
      "SYNC_EVENT_CREATE",
      supabase.from("sync_events").insert({
        batch_id: randomUUID(),
        changed_count: 2,
        client_event_id: randomUUID(),
        created_at: nowIso,
        domain: "history",
        entity_ids: { sessionIds: [activeRemoteId] },
        event_type: "history_changed",
        metadata: { status: "success", task: "TASK-078C" },
        owner_user_id: userId,
        shop_id: shop.shop_id,
        source: "admin_web_fixture",
        source_device_id: `TASK078C_DEVICE_${nonce}`,
      }),
    );

    return {
      activeHistoryName,
      barcode,
      categoryName,
      cleanup,
      deletedHistoryName,
      email,
      itemNumber,
      password,
      productName,
      shopId: shop.shop_id,
      shopName,
      supplierName,
      userId,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function signIn(
  page: import("@playwright/test").Page,
  fixture: Task078CFixture,
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

test("TASK-078C visual QA covers polished product and month-grouped history modals", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const runtime = resolveRuntime();

  if (runtime.status !== "ready") {
    test.skip(true, runtime.reason);
    return;
  }

  const fixture = await createTask078CFixture(runtime);

  try {
    await signIn(page, fixture);
    await page.setViewportSize({ width: 1440, height: 980 });
    await page.goto(`/shop/products?shop_id=${fixture.shopId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Products" }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(fixture.productName).first()).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: `${EVIDENCE_DIR}/browser-products-list-polish-desktop.png`,
    });

    const productRow = page
      .locator("[data-product-catalog-row]")
      .filter({ hasText: fixture.productName });
    const productDetailTrigger = productRow
      .locator("[data-product-action-toolbar] [data-product-detail-trigger]")
      .first();

    await expect(productDetailTrigger).toBeVisible({ timeout: 15_000 });
    await productDetailTrigger.dispatchEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    const productDialog = page
      .getByRole("dialog")
      .filter({ hasText: fixture.productName });
    await expect(productDialog).toBeVisible({ timeout: 15_000 });
    await expect(productDialog.getByText(fixture.barcode).first()).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: `${EVIDENCE_DIR}/browser-product-detail-overview-desktop.png`,
    });

    await productDialog.getByRole("tab", { name: /Prices/ }).click();
    await expect(productDialog.getByText("TASK078C current retail")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: `${EVIDENCE_DIR}/browser-product-detail-prices-desktop.png`,
    });

    await productDialog.getByRole("tab", { name: /Inventory \/ Sync/ }).click();
    await expect(productDialog.getByText("Mapped to mobile inventory")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: `${EVIDENCE_DIR}/browser-product-detail-inventory-desktop.png`,
    });

    await productDialog.getByRole("tab", { name: /Advanced/ }).click();
    await expect(productDialog.getByText("Raw diagnostics")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: `${EVIDENCE_DIR}/browser-product-detail-advanced-collapsed-desktop.png`,
    });

    await productDialog.getByRole("button", { name: /Edit/ }).click();
    await expect(productDialog.getByText("Editing product")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: `${EVIDENCE_DIR}/browser-product-detail-edit-desktop.png`,
    });
    await productDialog.getByRole("button", { name: /Close/ }).click();
    await expect(productDialog).toBeHidden();

    await page.goto(`/shop/history?shop_id=${fixture.shopId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Android / iOS History Entries" }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(fixture.activeHistoryName)).toBeVisible();
    await expect(page.getByText("Visible entries")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: `${EVIDENCE_DIR}/browser-history-entries-grouped-desktop.png`,
    });

    await page.getByRole("button", { name: "Deleted" }).click();
    await expect(page.getByText(fixture.deletedHistoryName)).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: `${EVIDENCE_DIR}/browser-history-entries-filter-deleted-desktop.png`,
    });

    await page.getByRole("button", { name: "Active + issues" }).click();
    const historyRow = page
      .locator("[data-history-entry-row]")
      .filter({ hasText: fixture.activeHistoryName });

    await expect(historyRow.locator("[data-history-detail-trigger]")).toBeVisible({
      timeout: 15_000,
    });
    await historyRow.locator("[data-history-detail-trigger]").dispatchEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    const historyDialog = page
      .getByRole("dialog")
      .filter({ hasText: fixture.activeHistoryName });
    await expect(historyDialog).toBeVisible();
    await expect(historyDialog.getByText(fixture.activeHistoryName)).toBeVisible();
    await expect(historyDialog.getByRole("button", { name: /All/ })).toContainText(
      "2",
    );
    await page.screenshot({
      fullPage: true,
      path: `${EVIDENCE_DIR}/browser-history-entry-detail-rows-desktop.png`,
    });

    await historyDialog.getByRole("tab", { name: /Missing \/ errors/ }).click();
    await expect(historyDialog.getByText("MISSING-078C").first()).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: `${EVIDENCE_DIR}/browser-history-entry-detail-missing-errors-desktop.png`,
    });

    await historyDialog.getByRole("tab", { name: /Linked products/ }).click();
    const linkedProductsPanel = historyDialog.getByRole("tabpanel", {
      name: /Linked products/,
    });
    await expect(linkedProductsPanel.getByText(fixture.productName, { exact: true })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: `${EVIDENCE_DIR}/browser-history-entry-detail-linked-products-desktop.png`,
    });

    await historyDialog.getByRole("tab", { name: /Sync events/ }).click();
    await expect(historyDialog.getByText("history_changed")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: `${EVIDENCE_DIR}/browser-history-entry-detail-sync-events-desktop.png`,
    });
  } finally {
    await fixture.cleanup();
  }
});
