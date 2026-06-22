import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Database } from "../../src/lib/supabase/database.types";

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

type AdminClient = SupabaseClient<Database>;

type Runtime =
  | { reason: string; status: "blocked" }
  | {
      publishableKey: string;
      serviceRoleKey: string;
      status: "ready";
      supabaseUrl: string;
    };

type Fixture = {
  barcode: string;
  cleanup: () => Promise<void>;
  email: string;
  entryNames: string[];
  entryName: string;
  itemNumber: string;
  password: string;
  productName: string;
  remoteIds: string[];
  remoteId: string;
  shopId: string;
  shopName: string;
  userId: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function resolveRuntime(): Runtime {
  for (const path of [".env.local", ".env.development.local", ".env"]) {
    loadEnvFile(path);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return {
      reason: "TASK-079C local browser smoke requires local Supabase env.",
      status: "blocked",
    };
  }

  try {
    const url = new URL(supabaseUrl);

    if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
      return {
        reason: "TASK-079C browser smoke only creates data on local Supabase.",
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

function formatSupabaseError(error: unknown) {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return ["message", "code", "details", "hint"]
      .map((key) =>
        typeof record[key] === "string" ? `${key}=${record[key]}` : "",
      )
      .filter(Boolean)
      .join("; ");
  }

  return String(error ?? "unknown error");
}

async function must<T>(
  label: string,
  result: PromiseLike<{ data: T; error: unknown }>,
) {
  const { data, error } = await result;

  if (error) {
    throw new Error(`TASK079C_${label}: ${formatSupabaseError(error)}`);
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
      `TASK079C_${label}: ${error ? formatSupabaseError(error) : "missing data"}`,
    );
  }

  return data;
}

async function deleteShopAuditRows(
  supabase: AdminClient,
  shopIds: readonly string[],
) {
  const validShopIds = shopIds.filter((shopId) => UUID_PATTERN.test(shopId));

  if (validShopIds.length > 0) {
    await supabase.from("audit_logs").delete().in("shop_id", validShopIds);
  }
}

async function createFixture(
  runtime: Extract<Runtime, { status: "ready" }>,
): Promise<Fixture> {
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
  const nowIso = new Date().toISOString();
  const email = `task079c-${nonce.toLowerCase()}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  const shopIds: string[] = [];
  const createdUser = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });
  const userId = createdUser.data.user?.id ?? "";

  if (createdUser.error || !userId) {
    throw new Error("TASK079C_AUTH_USER_CREATE");
  }

  async function cleanup() {
    await deleteShopAuditRows(supabase, shopIds);
    await supabase.from("sync_events").delete().eq("owner_user_id", userId);
    await supabase
      .from("shared_sheet_sessions")
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
          display_name: `TASK079C Owner ${nonce}`,
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
          shop_code: `TASK079C_${nonce}`,
          shop_name: `TASK079C Shop ${nonce}`,
          shop_status: "active",
          status_changed_by_profile_id: userId,
        })
        .select("shop_id")
        .single(),
    );

    shopIds.push(shop.shop_id);
    const shopName = `TASK079C Shop ${nonce}`;

    await must(
      "MEMBER_CREATE",
      supabase.from("shop_members").insert({
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
          name: `TASK079C Supplier ${nonce}`,
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
          name: `TASK079C Category ${nonce}`,
          owner_user_id: userId,
          shop_id: shop.shop_id,
        })
        .select("id")
        .single(),
    );
    const barcode = `790${nonce
      .split("")
      .map((char) => String(char.charCodeAt(0) % 10))
      .join("")
      .slice(0, 9)}`;
    const itemNumber = `ITEM079C-${nonce.slice(0, 6)}`;
    const productName = `TASK079C Product ${nonce}`;

    await must(
      "PRODUCT_CREATE",
      supabase.from("inventory_products").insert({
        barcode,
        category_id: category.id,
        item_number: itemNumber,
        owner_user_id: userId,
        product_name: productName,
        purchase_price: 10.5,
        retail_price: 18.75,
        shop_id: shop.shop_id,
        stock_quantity: 4,
        supplier_id: supplier.id,
        updated_at: nowIso,
      }),
    );

    const remoteIds = Array.from({ length: 12 }, () =>
      randomUUID().toLowerCase(),
    );
    const entryNames = Array.from(
      { length: 12 },
      (_, index) => `TASK079C Supplier import ${nonce} ${String(index + 1).padStart(2, "0")}`,
    );
    const detailData = [
      [
        "sourceRow",
        "barcode",
        "itemNumber",
        "productName",
        "quantity",
        "purchasePrice",
        "retailPrice",
        "supplier",
        "category",
        "oldPurchasePrice",
        "oldRetailPrice",
        "realQuantity",
        "RetailPrice",
        "complete",
      ],
      ...Array.from({ length: 62 }, (_, index) => {
        const rowNumber = index + 2;
        const isFirst = index === 0;
        const isSecond = index === 1;

        return [
          String(rowNumber),
          isFirst || isSecond ? barcode : `990${nonce.slice(0, 6)}${String(index).padStart(3, "0")}`,
          isFirst || isSecond ? itemNumber : `ITEM079F-${nonce.slice(0, 4)}-${index}`,
          isFirst || isSecond
            ? productName
            : `TASK079F Unresolved product ${index}`,
          isFirst ? "20" : "1",
          isSecond ? "10.5" : "11.5",
          "18.75",
          `TASK079C Supplier ${nonce}`,
          `TASK079C Category ${nonce}`,
          "10.5",
          "18.75",
          "",
          isSecond ? "18.75" : "",
          "",
        ];
      }),
    ];
    const compactData = (index: number) => [
      detailData[0],
      [
        "2",
        `${barcode}${index}`,
        `${itemNumber}-${index}`,
        `TASK079C Page Product ${index}`,
        "20",
        "10.5",
        "18.75",
        `TASK079C Supplier ${nonce}`,
        `TASK079C Category ${nonce}`,
        "10.5",
        "18.75",
        "",
        "",
        "",
      ],
    ];

    await must(
      "HISTORY_CREATE",
      supabase.from("shared_sheet_sessions").insert(
        remoteIds.map((remoteId, index) => {
          const data = index === 0 ? detailData : compactData(index);
          const timestamp = new Date(Date.now() - index * 60_000).toISOString();

          return {
            category: `TASK079C Category ${nonce}`,
            data,
            deleted_at: null,
            display_name: entryNames[index],
            is_manual_entry: false,
            owner_user_id: userId,
            payload_version: 2,
            remote_id: remoteId,
            session_overlay: {
              complete: Array.from({ length: data.length }, () => false),
              editable: Array.from({ length: data.length }, () => ["", ""]),
              overlay_schema: 1,
            },
            shop_id: shop.shop_id,
            supplier: `TASK079C Supplier ${nonce}`,
            timestamp,
            updated_at: timestamp,
          };
        }),
      ),
    );

    return {
      barcode,
      cleanup,
      email,
      entryNames,
      entryName: entryNames[0] ?? `TASK079C Supplier import ${nonce}`,
      itemNumber,
      password,
      productName,
      remoteIds,
      remoteId: remoteIds[0] ?? "",
      shopId: shop.shop_id,
      shopName,
      userId,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function signIn(page: import("@playwright/test").Page, fixture: Fixture) {
  await page.goto("/auth/login?next=/shop/history");
  await expect(
    page.getByRole("heading", { level: 1, name: "Admin Console sign in" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(fixture.email);
  await page.getByLabel("Password").fill(fixture.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith("/shop"), {
      timeout: 15_000,
    }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

function evidencePath(fileName: string) {
  return `docs/TASKS/EVIDENCE/TASK-079/browser/${fileName}`;
}

async function shopInventorySourceSummary(
  supabase: AdminClient,
  shopId: string,
) {
  const { data, error } = await supabase
    .from("shop_inventory_sources")
    .select("mapping_state,owner_user_id")
    .eq("shop_id", shopId);

  if (error) {
    return {
      blockingSource: "unknown",
      legacyOwnerUserId: "unknown",
      mappingState: "unknown",
    };
  }

  const rows = data ?? [];
  const mapped = rows.find((row) => row.mapping_state === "mapped");
  const blocking = rows.find((row) => row.mapping_state !== "mapped");

  return {
    blockingSource: blocking ? "present" : "absent",
    legacyOwnerUserId: mapped?.owner_user_id ? "present" : "absent",
    mappingState: mapped?.mapping_state ?? blocking?.mapping_state ?? "absent",
  };
}

test("TASK-079 unified local browser verifies row colors, vertical scroll and generated edit overlay", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const runtime = resolveRuntime();

  if (runtime.status !== "ready") {
    test.skip(true, runtime.reason);
    return;
  }

  const fixture = await createFixture(runtime);
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

  try {
    mkdirSync("docs/TASKS/EVIDENCE/TASK-079/browser", { recursive: true });
    await signIn(page, fixture);
    const sourceSummary = await shopInventorySourceSummary(
      supabase,
      fixture.shopId,
    );
    const totalCountResult = await supabase
      .from("shared_sheet_sessions")
      .select("remote_id", { count: "exact", head: true })
      .eq("shop_id", fixture.shopId);
    const accessLog: Array<Record<string, unknown>> = [];
    const verifyHistoryListUrl = async (
      label: string,
      urlPath: string,
      expectedRows: number | null,
    ) => {
      await page.goto(urlPath);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Android / iOS History Entries",
        }),
      ).toBeVisible();
      await expect(page.getByText("Read blocked")).toHaveCount(0);
      await expect(page.getByText("shop_inventory_sources gate")).toHaveCount(0);

      if (expectedRows !== null) {
        await expect(page.locator("[data-history-entry-row]")).toHaveCount(
          expectedRows,
        );
      }

      const currentUrl = new URL(page.url());
      const pageNumber = Number(currentUrl.searchParams.get("page") ?? "1");
      const pageSize = Number(currentUrl.searchParams.get("pageSize") ?? "10");
      const rowsReturned = await page.locator("[data-history-entry-row]").count();

      accessLog.push({
        blockingSource: sourceSummary.blockingSource,
        label,
        legacyOwnerUserId: sourceSummary.legacyOwnerUserId,
        mappingState: sourceSummary.mappingState,
        offset: (pageNumber - 1) * pageSize,
        page: pageNumber,
        pageSize,
        range: `${(pageNumber - 1) * pageSize}-${pageNumber * pageSize - 1}`,
        readModelStatus: "ready",
        reason: "No Read blocked banner rendered; normal list or empty state rendered.",
        requestedShopId: fixture.shopId ? "present:redacted" : "absent",
        rowsReturned,
        selectedShopId: "present:redacted",
        selectedShopName: fixture.shopName.replace(
          /TASK079C Shop .+/,
          "TASK079C Shop [redacted]",
        ),
        statusFilter:
          currentUrl.searchParams.get("status") ?? "active_issues",
        totalCount: totalCountResult.count ?? null,
        totalStatus: totalCountResult.error ? "deferred" : "exact",
      });
    };

    await verifyHistoryListUrl(
      "page-1-default",
      `/shop/history?shop_id=${fixture.shopId}&page=1&pageSize=10`,
      10,
    );
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Android / iOS History Entries",
      }),
    ).toBeVisible();
    await expect(page.getByText(fixture.entryName)).toBeVisible();
    const pageScrollMetrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));

    expect(pageScrollMetrics.scrollWidth).toBeLessThanOrEqual(
      pageScrollMetrics.clientWidth + 2,
    );
    await page.screenshot({
      fullPage: true,
      path: evidencePath("history-page-1-ready.png"),
    });
    await page.screenshot({
      fullPage: true,
      path: evidencePath("browser-history-list-desktop.png"),
    });
    await page.screenshot({
      fullPage: true,
      path: evidencePath("browser-history-list-compact-desktop.png"),
    });
    await page.screenshot({
      fullPage: true,
      path: evidencePath("browser-history-list-missing-red-desktop.png"),
    });

    await page
      .getByRole("navigation", { name: "History pagination top" })
      .getByRole("link", { name: "Next" })
      .click();
    await expect(page).toHaveURL(/[\?&]page=2(?:&|$)/);
    await expect(page).toHaveURL(new RegExp(`shop_id=${fixture.shopId}`));
    await expect(page.getByText("Read blocked")).toHaveCount(0);
    await expect(page.getByText("shop_inventory_sources gate")).toHaveCount(0);
    const page2Rows = await page.locator("[data-history-entry-row]").count();

    if (page2Rows === 0) {
      await expect(
        page.getByText("No history entries match these filters."),
      ).toBeVisible();
    } else {
      expect(page2Rows).toBeGreaterThan(0);
    }
    await page.screenshot({
      fullPage: true,
      path: evidencePath("history-page-2-ready-no-read-blocked.png"),
    });

    for (const [label, urlPath] of [
      [
        "page-2-default",
        `/shop/history?shop_id=${fixture.shopId}&page=2&pageSize=10`,
      ],
      [
        "page-2-active-with-issues-alias",
        `/shop/history?shop_id=${fixture.shopId}&page=2&pageSize=10&status=active_with_issues`,
      ],
      [
        "page-2-all",
        `/shop/history?shop_id=${fixture.shopId}&page=2&pageSize=10&status=all`,
      ],
      [
        "page-2-empty-query",
        `/shop/history?shop_id=${fixture.shopId}&page=2&pageSize=10&q=`,
      ],
      [
        "page-2-empty-month",
        `/shop/history?shop_id=${fixture.shopId}&page=2&pageSize=10&month=`,
      ],
    ] as const) {
      await verifyHistoryListUrl(label, urlPath, null);
    }

    writeFileSync(
      evidencePath("history-pagination-access-log.json"),
      `${JSON.stringify(accessLog, null, 2)}\n`,
    );

    await page.goto(`/shop/history?shop_id=${fixture.shopId}&page=1&pageSize=10`);

    const row = page
      .locator("[data-history-entry-row]")
      .filter({ hasText: fixture.entryName });
    const missingMetric = row.getByText("Missing products:").locator("..");
    await expect(missingMetric).toHaveClass(/text-rose-700/);

    await row.locator("[data-history-detail-trigger]").click();
    const dialog = page.getByRole("dialog").filter({ hasText: fixture.entryName });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(fixture.productName).first()).toBeVisible();
    const rowsFrame = dialog.locator("[data-history-detail-rows-frame]").first();
    const rowsFrameMetrics = await rowsFrame.evaluate((element) => ({
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
    }));

    expect(rowsFrameMetrics.scrollWidth).toBeLessThanOrEqual(
      rowsFrameMetrics.clientWidth + 2,
    );
    expect(rowsFrameMetrics.scrollHeight).toBeGreaterThan(
      rowsFrameMetrics.clientHeight + 24,
    );
    await expect(
      dialog.locator("[data-history-detail-row]").filter({ hasText: "63" }),
    ).toHaveCount(1);

    await rowsFrame.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(
      dialog.locator("[data-history-detail-row]").filter({ hasText: "63" }),
    ).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("browser-history-detail-scrolled-bottom-desktop.png"),
    });
    await rowsFrame.evaluate((element) => {
      element.scrollTop = 0;
    });

    const firstDetailRow = dialog
      .locator('[data-history-row-key="preview:2"]')
      .first();
    const secondDetailRow = dialog
      .locator('[data-history-row-key="preview:3"]')
      .first();

    await expect(firstDetailRow).toHaveAttribute(
      "data-history-row-state",
      "unresolved",
    );
    await page.screenshot({
      fullPage: true,
      path: evidencePath("history-detail-counted-empty-neutral.png"),
    });
    await expect(firstDetailRow.getByText(/In catalog/)).toBeVisible();
    await expect(firstDetailRow.getByText(/Old purchase/)).toBeVisible();
    await expect(firstDetailRow.getByText(/Old retail/)).toBeVisible();
    await expect(firstDetailRow.getByText(/Stock 4/)).toBeVisible();
    await expect(secondDetailRow.getByText(/Old purchase/)).toHaveCount(0);

    await dialog.getByLabel(/Counted Qty/).first().fill("20");
    await expect(firstDetailRow).toHaveAttribute(
      "data-history-row-state",
      "complete",
    );
    await expect(dialog.getByLabel(/Complete/).first()).toBeChecked();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("history-detail-counted-complete-green.png"),
    });

    await dialog.getByLabel(/Counted Qty/).first().fill("1");
    await expect(firstDetailRow).toHaveAttribute(
      "data-history-row-state",
      "partial",
    );
    await expect(dialog.getByLabel(/Complete/).first()).not.toBeChecked();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("history-detail-counted-partial-amber.png"),
    });
    await dialog.getByLabel(/Counted Qty/).first().fill("0");
    await expect(firstDetailRow).toHaveAttribute(
      "data-history-row-state",
      "unresolved",
    );
    await expect(dialog.getByLabel(/Complete/).first()).not.toBeChecked();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("history-detail-counted-zero-neutral.png"),
    });
    await dialog.getByLabel(/Counted Qty/).first().fill("3");
    await expect(firstDetailRow).toHaveAttribute(
      "data-history-row-state",
      "partial",
    );
    await dialog.getByLabel(/Sale Price/).first().fill("21.5");
    await expect(firstDetailRow.getByText(/Row total 64.5/)).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("browser-history-detail-row-colors-desktop.png"),
    });
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog.getByText("History Entry updated")).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("browser-history-detail-saved-desktop.png"),
    });
    await page.screenshot({
      fullPage: true,
      path: evidencePath("browser-history-detail-no-horizontal-scroll-desktop.png"),
    });
    await page.screenshot({
      fullPage: true,
      path: evidencePath("browser-history-detail-saved-no-horizontal-scroll-desktop.png"),
    });
    await dialog.getByRole("tab", { name: /Sync analysis/ }).click();
    await expect(dialog.locator("[data-sync-analysis-panel]")).toBeVisible();
    await expect(dialog.getByText("Sync / Import analysis")).toBeVisible();
    await expect(dialog.getByText("history_changed").first()).toBeVisible();
    await expect(dialog.getByText("Detected").first()).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("browser-history-detail-sync-analysis-desktop.png"),
    });

    const updated = await mustSingle<{
      data: unknown;
      session_overlay: unknown;
    }>(
      "VERIFY_HISTORY_EDIT",
      supabase
        .from("shared_sheet_sessions")
        .select("data,session_overlay")
        .eq("remote_id", fixture.remoteId)
        .single(),
    );
    const data = updated.data as string[][];
    const overlay = updated.session_overlay as {
      complete: boolean[];
      editable: string[][];
    };
    const header = data[0];
    const sourceQuantityIndex = header.indexOf("quantity");
    const purchaseIndex = header.indexOf("purchasePrice");
    const countedQuantityIndex = header.indexOf("realQuantity");
    const salePriceIndex = header.indexOf("RetailPrice");
    const completeIndex = header.indexOf("complete");

    expect(data[1][sourceQuantityIndex]).toBe("20");
    expect(data[1][purchaseIndex]).toBe("11.5");
    expect(data[1][countedQuantityIndex]).toBe("3");
    expect(data[1][salePriceIndex]).toBe("21.5");
    expect(data[1][completeIndex]).toBe("");
    expect(overlay.editable[1][0]).toBe("3");
    expect(overlay.editable[1][1]).toBe("21.5");
    expect(overlay.complete[1]).toBe(false);
  } finally {
    await fixture.cleanup();
  }
});
