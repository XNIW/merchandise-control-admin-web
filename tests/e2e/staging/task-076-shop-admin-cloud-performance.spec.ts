import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance as nodePerformance } from "node:perf_hooks";
import type { Database } from "../../../src/lib/supabase/database.types";

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

type Task076Fixture = {
  categoryName: string;
  cleanup: () => Promise<CleanupSummary>;
  deviceDisplayName: string;
  email: string;
  password: string;
  productName: string;
  shopCode: string;
  shopId: string;
  staffCode: string;
  supplierName: string;
};

type RouteMeasurement = {
  activeMs: number | null;
  contentStatus?: "missing" | "not_checked" | "visible";
  consoleErrors: readonly string[];
  finalMs: number | null;
  finalPathname?: string | null;
  finalStatus: "ready" | "timeout";
  finalTitleText?: string | null;
  label: string;
  navigationError?: string;
  path: string;
  pendingMs: number | null;
  pendingStatus: "observed" | "not_observed" | "final_under_300ms";
  shopParamStatus?: "different" | "matched" | "missing";
  ttfbMs: number | null;
  ttfbStatus: number | null;
};

type RouteCheck = {
  hiddenFromPrimaryNav?: boolean;
  key: string;
  label: string;
  path: string;
  text?: (fixture: Task076Fixture) => RegExp | string;
  title: string;
};

type CountQuery = {
  eq: (column: string, value: string) => CountQuery;
  ilike: (column: string, value: string) => CountQuery;
  like: (column: string, value: string) => CountQuery;
} & PromiseLike<{
  count: number | null;
  error: unknown;
}>;

const evidenceDir = "docs/TASKS/EVIDENCE/TASK-076";
const taskPrefix = "TASK076_";
const taskPrefixLowercase = taskPrefix.toLowerCase();
const routeChecks: readonly RouteCheck[] = [
  {
    key: "overview",
    label: "Overview",
    path: "/shop/overview",
    title: "Shop Overview",
    text: (fixture: Task076Fixture) => fixture.shopCode,
  },
  {
    key: "products",
    label: "Products",
    path: "/shop/products",
    title: "Products",
    text: () => new RegExp(`^${taskPrefix}Product `),
  },
  {
    key: "categories",
    label: "Categories",
    path: "/shop/categories",
    title: "Categories",
    text: (fixture: Task076Fixture) => fixture.categoryName,
  },
  {
    key: "suppliers",
    label: "Suppliers",
    path: "/shop/suppliers",
    title: "Suppliers",
    text: (fixture: Task076Fixture) => fixture.supplierName,
  },
  {
    key: "importExport",
    hiddenFromPrimaryNav: true,
    label: "Import / Export",
    path: "/shop/import-export",
    text: () => "Moved to Products",
    title: "Import / Export",
  },
  {
    key: "staff",
    label: "Staff",
    path: "/shop/staff",
    title: "POS / Staff",
    text: (fixture: Task076Fixture) => fixture.staffCode,
  },
  {
    key: "devices",
    label: "Devices",
    path: "/shop/devices",
    title: "Devices",
  },
  {
    key: "history",
    label: "History Entries",
    path: "/shop/history",
    title: "Android / iOS History Entries",
  },
  {
    key: "sync",
    label: "Sync Center",
    path: "/shop/sync",
    title: "Sync Center",
  },
  {
    key: "members",
    label: "Members",
    path: "/shop/members",
    title: "Members",
  },
  {
    key: "roles",
    label: "Roles",
    path: "/shop/roles",
    title: "Roles",
  },
  {
    key: "settings",
    label: "Settings",
    path: "/shop/settings",
    title: "Settings",
    text: (fixture: Task076Fixture) => fixture.shopCode,
  },
] as const;

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`BLOCKED_TASK076_ENV_REQUIRED: ${name}`);
  }

  return value;
}

function formatSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") {
    return String(error);
  }

  const candidate = error as {
    code?: unknown;
    message?: unknown;
  };
  const code = typeof candidate.code === "string" ? candidate.code : "supabase_error";
  const message =
    typeof candidate.message === "string" ? candidate.message : "operation failed";

  return `${code}: ${message}`;
}

async function must<T>(
  label: string,
  result: PromiseLike<{ data: T; error: unknown }>,
) {
  const { data, error } = await result;

  if (error) {
    throw new Error(`BLOCKED_TASK076_${label}: ${formatSupabaseError(error)}`);
  }

  return data;
}

async function mustSingle<T>(
  label: string,
  result: PromiseLike<{ data: T | null; error: unknown }>,
) {
  const data = await must(label, result);

  if (!data) {
    throw new Error(`BLOCKED_TASK076_${label}: missing row`);
  }

  return data;
}

function createAdminClient() {
  return createClient<Database>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: {
        headers: {
          "X-Client-Info": "merchandise-control-admin-web/task-076-cloud-performance",
        },
      },
    },
  );
}

async function countRows(
  supabase: AdminClient,
  table: string,
  column: string,
  apply: (query: CountQuery) => PromiseLike<{
    count: number | null;
    error: unknown;
  }>,
) {
  const query = supabase
    .from(table as never)
    .select(column, {
      count: "exact",
      head: true,
    }) as unknown as CountQuery;
  const result = await apply(query);

  if (result.error) {
    throw new Error(`BLOCKED_TASK076_CLEANUP_COUNT: ${formatSupabaseError(result.error)}`);
  }

  return result.count ?? 0;
}

async function countResidualRows(
  supabase: AdminClient,
  input: {
    shopId: string;
    shopCode: string;
    userId: string;
  },
) {
  const counts = await Promise.all([
    countRows(supabase, "sync_events", "id", (query) =>
      query.eq("owner_user_id", input.userId).like("source", `${taskPrefix}%`),
    ),
    countRows(supabase, "shared_sheet_sessions", "remote_id", (query) =>
      query
        .eq("owner_user_id", input.userId)
        .ilike("remote_id", `${taskPrefixLowercase}%`),
    ),
    countRows(supabase, "shop_devices", "shop_device_id", (query) =>
      query.eq("shop_id", input.shopId),
    ),
    countRows(supabase, "staff_role_permissions", "staff_role_permission_id", (query) =>
      query.eq("shop_id", input.shopId),
    ),
    countRows(supabase, "staff_accounts", "staff_id", (query) =>
      query.eq("shop_id", input.shopId),
    ),
    countRows(supabase, "shop_inventory_sources", "shop_inventory_source_id", (query) =>
      query.eq("shop_id", input.shopId),
    ),
    countRows(supabase, "shop_members", "shop_member_id", (query) =>
      query.eq("shop_id", input.shopId),
    ),
    countRows(supabase, "shops", "shop_id", (query) =>
      query.eq("shop_code", input.shopCode),
    ),
    countRows(supabase, "inventory_products", "id", (query) =>
      query.eq("owner_user_id", input.userId).like("barcode", `${taskPrefix}%`),
    ),
    countRows(supabase, "inventory_categories", "id", (query) =>
      query.eq("owner_user_id", input.userId).like("name", `${taskPrefix}%`),
    ),
    countRows(supabase, "inventory_suppliers", "id", (query) =>
      query.eq("owner_user_id", input.userId).like("name", `${taskPrefix}%`),
    ),
    countRows(supabase, "profiles", "profile_id", (query) =>
      query.eq("profile_id", input.userId),
    ),
  ]);

  return counts.reduce((total, count) => total + count, 0);
}

async function createTask076Fixture(): Promise<Task076Fixture> {
  const supabase = createAdminClient();
  const nonce = randomBytes(6).toString("hex").toUpperCase();
  const email = `task076-${nonce.toLowerCase()}@example.test`;
  const password = `Task076-${randomBytes(18).toString("base64url")}-Aa1!`;
  const shopCode = `${taskPrefix}${nonce}`;
  const rutSeed = Number.parseInt(nonce.slice(0, 8), 16);
  const companyRut = `${String(1_000_000 + (rutSeed % 8_000_000))}-${rutSeed % 10}`;
  const legalRepresentativeRut = `${String(9_000_000 + (rutSeed % 900_000))}-${
    (rutSeed + 3) % 10
  }`;
  const remoteSessionId = `${taskPrefixLowercase}session_${nonce.toLowerCase()}`;
  const now = new Date().toISOString();
  let userId = "";
  let shopId = "";

  async function cleanup(): Promise<CleanupSummary> {
    const cleanupErrors: string[] = [];

    async function recordCleanup(
      label: string,
      result: PromiseLike<{ error: unknown }>,
    ) {
      const { error } = await result;

      if (error) {
        cleanupErrors.push(`${label}: ${formatSupabaseError(error)}`);
      }
    }

    if (userId) {
      await recordCleanup(
        "SYNC_EVENT_DELETE",
        supabase
          .from("sync_events")
          .delete()
          .eq("owner_user_id", userId)
          .like("source", `${taskPrefix}%`),
      );
      await recordCleanup(
        "SHARED_SHEET_SESSION_DELETE",
        supabase
          .from("shared_sheet_sessions")
          .delete()
          .eq("owner_user_id", userId)
          .ilike("remote_id", `${taskPrefixLowercase}%`),
      );
    }

    if (shopId) {
      await recordCleanup(
        "DEVICE_DELETE",
        supabase.from("shop_devices").delete().eq("shop_id", shopId),
      );
      await recordCleanup(
        "STAFF_ROLE_PERMISSION_DELETE",
        supabase.from("staff_role_permissions").delete().eq("shop_id", shopId),
      );
      await recordCleanup(
        "STAFF_DELETE",
        supabase.from("staff_accounts").delete().eq("shop_id", shopId),
      );
      await recordCleanup(
        "INVENTORY_MAPPING_DELETE",
        supabase.from("shop_inventory_sources").delete().eq("shop_id", shopId),
      );
      await recordCleanup(
        "MEMBERSHIP_DELETE",
        supabase.from("shop_members").delete().eq("shop_id", shopId),
      );
      await recordCleanup(
        "SHOP_DELETE",
        supabase.from("shops").delete().eq("shop_id", shopId),
      );
    }

    if (userId) {
      await recordCleanup(
        "PRODUCT_DELETE",
        supabase
          .from("inventory_products")
          .delete()
          .eq("owner_user_id", userId)
          .like("barcode", `${taskPrefix}%`),
      );
      await recordCleanup(
        "CATEGORY_DELETE",
        supabase
          .from("inventory_categories")
          .delete()
          .eq("owner_user_id", userId)
          .like("name", `${taskPrefix}%`),
      );
      await recordCleanup(
        "SUPPLIER_DELETE",
        supabase
          .from("inventory_suppliers")
          .delete()
          .eq("owner_user_id", userId)
          .like("name", `${taskPrefix}%`),
      );
      await recordCleanup(
        "PROFILE_DELETE",
        supabase.from("profiles").delete().eq("profile_id", userId),
      );
    }

    let userDeleted = true;
    if (userId) {
      const userDelete = await supabase.auth.admin.deleteUser(userId);
      userDeleted = !userDelete.error;

      if (userDelete.error) {
        cleanupErrors.push(`AUTH_USER_DELETE: ${formatSupabaseError(userDelete.error)}`);
      }
    }

    const residualRows =
      userId && shopId
        ? await countResidualRows(supabase, { shopCode, shopId, userId })
        : 0;

    if (residualRows > 0) {
      cleanupErrors.push(`RESIDUAL_ROWS: ${residualRows}`);
    }

    return {
      cleanupErrors,
      residualRows,
      userDeleted,
    };
  }

  try {
    const createdUser = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    });
    const maybeUserId = createdUser.data.user?.id;

    if (createdUser.error || !maybeUserId) {
      throw new Error(
        `BLOCKED_TASK076_AUTH_USER_CREATE: ${formatSupabaseError(createdUser.error)}`,
      );
    }

    userId = maybeUserId;

    await must(
      "PROFILE_CREATE",
      supabase.from("profiles").upsert(
        {
          display_name: `${taskPrefix}Shop Admin ${nonce}`,
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
          business_address: `Av. ${taskPrefix} ${nonce}`,
          business_city: "Santiago",
          business_giro: "TASK-076 cloud performance synthetic retail",
          company_rut: companyRut,
          created_by_profile_id: userId,
          legal_representative_rut: legalRepresentativeRut,
          shop_code: shopCode,
          shop_name: `${taskPrefix}Cloud Performance Shop ${nonce}`,
          shop_status: "active",
          status_changed_by_profile_id: userId,
        })
        .select("shop_id")
        .single(),
    );

    shopId = shop.shop_id;

    await must(
      "MEMBERSHIP_CREATE",
      supabase.from("shop_members").insert({
        invited_by_profile_id: userId,
        membership_status: "active",
        profile_id: userId,
        role_key: "shop_owner",
        shop_id: shopId,
      }),
    );
    await must(
      "INVENTORY_MAPPING_CREATE",
      supabase.from("shop_inventory_sources").insert({
        created_by_profile_id: userId,
        mapping_state: "mapped",
        owner_user_id: userId,
        shop_id: shopId,
        source_kind: "mobile_owner",
        verified_at: now,
        verified_by_profile_id: userId,
      }),
    );

    const supplierName = `${taskPrefix}Supplier ${nonce}`;
    const categoryName = `${taskPrefix}Category ${nonce}`;
    const supplier = await mustSingle<{ id: string }>(
      "SUPPLIER_CREATE",
      supabase
        .from("inventory_suppliers")
        .insert({
          name: supplierName,
          owner_user_id: userId,
          shop_id: shopId,
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
          shop_id: shopId,
        })
        .select("id")
        .single(),
    );
    const productRows = Array.from({ length: 121 }, (_, index) => {
      const padded = String(index + 1).padStart(3, "0");

      return {
        barcode: `${taskPrefix}${nonce}_${padded}`,
        category_id: category.id,
        item_number: `TASK076-${padded}`,
        owner_user_id: userId,
        product_name: `${taskPrefix}Product ${padded}`,
        purchase_price: 1 + index,
        retail_price: 2 + index,
        shop_id: shopId,
        stock_quantity: index + 1,
        supplier_id: supplier.id,
      };
    });

    await must(
      "PRODUCTS_CREATE",
      supabase.from("inventory_products").insert(productRows),
    );

    const staffRows = Array.from({ length: 5 }, (_, index) => {
      const padded = String(index + 1).padStart(2, "0");

      return {
        created_by_profile_id: userId,
        credential_kind: null,
        credential_status: "pending_setup",
        credential_updated_at: null,
        credential_version: 1,
        display_name: `${taskPrefix}Staff ${padded}`,
        failed_attempts: 0,
        must_change_credential: false,
        role_key: index === 0 ? "manager" : "cashier",
        shop_id: shopId,
        staff_code: `${taskPrefix}STAFF_${padded}_${nonce.slice(0, 4)}`,
        status: "pending_credential",
        updated_by_profile_id: userId,
      };
    });
    await must("STAFF_CREATE", supabase.from("staff_accounts").insert(staffRows));
    await must(
      "STAFF_PERMISSION_CREATE",
      supabase.from("staff_role_permissions").upsert(
        {
          enabled: true,
          permission_key: "shop_admin.full_access",
          role_key: "manager",
          shop_id: shopId,
          updated_by_profile_id: userId,
        },
        { onConflict: "shop_id,role_key,permission_key" },
      ),
    );

    const deviceDisplayName = `${taskPrefix}Device ${nonce}`;
    await must(
      "DEVICES_CREATE",
      supabase.from("shop_devices").insert([
        {
          app_version: `${taskPrefix}CLOUD_PERF`,
          created_by_profile_id: userId,
          device_identifier: `${taskPrefix}DEVICE_${nonce}_01`,
          device_type: "pos",
          display_name: deviceDisplayName,
          last_seen_at: now,
          last_seen_principal_kind: "personal_account",
          last_seen_profile_id: userId,
          metadata_redacted: { source: "TASK-076" },
          shop_id: shopId,
          status: "active",
          updated_by_profile_id: userId,
        },
        {
          app_version: `${taskPrefix}CLOUD_PERF`,
          created_by_profile_id: userId,
          device_identifier: `${taskPrefix}DEVICE_${nonce}_02`,
          device_type: "pos",
          display_name: `${taskPrefix}Backup Device ${nonce}`,
          last_seen_at: now,
          last_seen_principal_kind: "personal_account",
          last_seen_profile_id: userId,
          metadata_redacted: { source: "TASK-076" },
          shop_id: shopId,
          status: "active",
          updated_by_profile_id: userId,
        },
      ]),
    );
    await must(
      "SHARED_SHEET_SESSION_CREATE",
      supabase.from("shared_sheet_sessions").insert({
        category: categoryName,
        data: [
          ["barcode", "name", "quantity"],
          [`${taskPrefix}${nonce}_001`, `${taskPrefix}History Product`, "1"],
        ],
        display_name: `${taskPrefix}Session ${nonce}`,
        is_manual_entry: false,
        owner_user_id: userId,
        payload_version: 2,
        remote_id: remoteSessionId,
        session_overlay: null,
        shop_id: shopId,
        supplier: supplierName,
        timestamp: now,
      }),
    );
    await must(
      "SYNC_EVENTS_CREATE",
      supabase.from("sync_events").insert([
        {
          changed_count: 121,
          client_event_id: `${taskPrefix}SYNC_${nonce}_01`,
          domain: "catalog",
          entity_ids: { sessions: [remoteSessionId] },
          event_type: "catalog_changed",
          metadata: { status: "success", task: "TASK-076" },
          owner_user_id: userId,
          shop_id: shopId,
          source: `${taskPrefix}cloud_performance`,
          source_device_id: `${taskPrefix}DEVICE_${nonce}_01`,
        },
        {
          changed_count: 1,
          client_event_id: `${taskPrefix}SYNC_${nonce}_02`,
          domain: "history",
          entity_ids: { staff: [] },
          event_type: "history_changed",
          metadata: { status: "success", task: "TASK-076" },
          owner_user_id: userId,
          shop_id: shopId,
          source: `${taskPrefix}cloud_performance`,
          source_device_id: `${taskPrefix}DEVICE_${nonce}_02`,
        },
      ]),
    );

    return {
      categoryName,
      cleanup,
      deviceDisplayName,
      email,
      password,
      productName: `${taskPrefix}Product 001`,
      shopCode,
      shopId,
      staffCode: staffRows[0].staff_code,
      supplierName,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

function routeUrl(path: string, shopId: string) {
  const url = new URL(path, requiredEnv("PLAYWRIGHT_BASE_URL"));

  url.searchParams.set("shop_id", shopId);
  return url;
}

async function signIn(page: Page, fixture: Task076Fixture) {
  await page.goto("/auth/login?next=/shop");
  await expect(
    page.getByRole("heading", { level: 1, name: "Admin Console sign in" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(fixture.email);
  await page.getByLabel("Password").fill(fixture.password);

  await Promise.all([
    page.waitForURL((url) => url.pathname === "/shop", { timeout: 20_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
  await page.goto(routeUrl("/shop", fixture.shopId).toString());
  await expectRouteTitle(page, "Shop Overview", 20_000);
}

async function expectRouteTitle(page: Page, title: string, timeout = 12_000) {
  const titleById = page.locator("#shop-shell-page-title");
  const legacyTitleById = page.locator("#shop-page-title");
  const visibleHeading = page.getByRole("heading", {
    level: 1,
    name: title,
  });

  await expect(titleById.or(legacyTitleById).or(visibleHeading).first()).toContainText(
    title,
    { timeout },
  );
}

async function cookieHeader(context: BrowserContext) {
  const cookies = await context.cookies(requiredEnv("PLAYWRIGHT_BASE_URL"));

  return cookies
    .map((cookie) => `${encodeURIComponent(cookie.name)}=${encodeURIComponent(cookie.value)}`)
    .join("; ");
}

async function measureTtfb(context: BrowserContext, path: string, shopId: string) {
  const url = routeUrl(path, shopId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const start = nodePerformance.now();

  try {
    const response = await fetch(url, {
      headers: {
        cookie: await cookieHeader(context),
      },
      redirect: "manual",
      signal: controller.signal,
    });
    const elapsed = nodePerformance.now() - start;

    await response.body?.cancel();

    return {
      ms: Math.round(elapsed),
      status: response.status,
    };
  } catch {
    return {
      ms: null,
      status: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function installPendingObserver(page: Page) {
  await page.evaluate(() => {
    type Task076Window = typeof window & {
      __task076PendingEvents?: number[];
      __task076PendingObserver?: MutationObserver;
    };
    const taskWindow = window as Task076Window;
    const selector = [
      '[data-shop-navigation-pending="true"]',
      "[data-shop-loading]",
      "[data-products-loading]",
      "[data-products-loading-rows]",
      "[data-shop-route-loading]",
    ].join(",");
    const record = () => {
      if (document.querySelector(selector)) {
        taskWindow.__task076PendingEvents = [
          ...(taskWindow.__task076PendingEvents ?? []),
          window.performance.now(),
        ];
      }
    };

    taskWindow.__task076PendingObserver?.disconnect();
    taskWindow.__task076PendingEvents = [];
    taskWindow.__task076PendingObserver = new MutationObserver(record);
    taskWindow.__task076PendingObserver.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    record();
  });
}

async function firstPendingMs(page: Page, start: number) {
  try {
    await page.waitForFunction(
      (startedAt) => {
        const taskWindow = window as typeof window & {
          __task076PendingEvents?: number[];
        };

        return (taskWindow.__task076PendingEvents ?? []).some(
          (eventTime) => eventTime >= startedAt,
        );
      },
      start,
      { timeout: 300 },
    );

    const first = await page.evaluate((startedAt) => {
      const taskWindow = window as typeof window & {
        __task076PendingEvents?: number[];
      };

      return (taskWindow.__task076PendingEvents ?? []).find(
        (eventTime) => eventTime >= startedAt,
      ) ?? null;
    }, start);

    return first === null ? null : Math.round(first - start);
  } catch {
    return null;
  }
}

async function measureRouteNavigation(
  page: Page,
  context: BrowserContext,
  fixture: Task076Fixture,
  route: (typeof routeChecks)[number],
  consoleErrors: readonly string[],
): Promise<RouteMeasurement> {
  const ttfb = await measureTtfb(context, route.path, fixture.shopId);
  const link = route.hiddenFromPrimaryNav
    ? null
    : page.getByRole("link", { name: route.label, exact: true }).first();

  await installPendingObserver(page);
  const startedAt = await page.evaluate(() => window.performance.now());
  try {
    if (route.hiddenFromPrimaryNav) {
      await page.goto(routeUrl(route.path, fixture.shopId).toString());
    } else {
      await link?.click({ timeout: 3_000 });
    }
  } catch (error) {
    return {
      activeMs: null,
      consoleErrors: consoleErrors.slice(),
      finalMs: null,
      finalStatus: "timeout",
      label: route.label,
      navigationError:
        error instanceof Error ? error.message.slice(0, 180) : "click_failed",
      path: route.path,
      pendingMs: null,
      pendingStatus: "not_observed",
      ttfbMs: ttfb.ms,
      ttfbStatus: ttfb.status,
    };
  }

  const activeMs = await (async () => {
    if (!link) {
      return null;
    }

    try {
      await expect(link).toHaveAttribute("aria-current", "page", {
        timeout: 1_000,
      });

      return Math.round(
        (await page.evaluate(() => window.performance.now())) - startedAt,
      );
    } catch {
      return null;
    }
  })();
  const pendingMs = await firstPendingMs(page, startedAt);
  let contentStatus: RouteMeasurement["contentStatus"] = route.text
    ? "missing"
    : "not_checked";
  let finalMs: number | null = null;
  let finalPathname: string | null = null;
  let finalStatus: RouteMeasurement["finalStatus"] = "timeout";
  let finalTitleText: string | null = null;
  let shopParamStatus: RouteMeasurement["shopParamStatus"];

  try {
    await expect(page.locator("[data-shop-route-loading-target]")).toHaveCount(0, {
      timeout: 12_000,
    });
    await expectRouteTitle(page, route.title);
    const currentUrl = new URL(page.url());
    const shopParam = currentUrl.searchParams.get("shop_id");

    finalPathname = currentUrl.pathname;
    finalTitleText = await page.locator("#shop-shell-page-title").textContent({
      timeout: 500,
    }).catch(() => null);
    expect(currentUrl.pathname).toBe(route.path);

    finalMs = Math.round(
      (await page.evaluate(() => window.performance.now())) - startedAt,
    );
    finalStatus = "ready";
    shopParamStatus =
      shopParam === fixture.shopId ? "matched" : shopParam ? "different" : "missing";

    if (route.text) {
      contentStatus = await page
        .getByText(route.text(fixture))
        .first()
        .isVisible({ timeout: 3_000 })
        .then((visible) => (visible ? "visible" : "missing"))
        .catch(() => "missing");
    }
  } catch {
    try {
      finalPathname = new URL(page.url()).pathname;
    } catch {
      finalPathname = null;
    }
    finalTitleText = await page.locator("#shop-shell-page-title").textContent({
      timeout: 500,
    }).catch(() => null);
    finalMs = null;
  }

  const pendingStatus =
    pendingMs === null && finalMs !== null && finalMs <= 300
      ? "final_under_300ms"
      : pendingMs === null
        ? "not_observed"
        : "observed";

  return {
    activeMs,
    contentStatus,
    consoleErrors: consoleErrors.slice(),
    finalMs,
    finalPathname,
    finalStatus,
    finalTitleText,
    label: route.label,
    path: route.path,
    pendingMs,
    pendingStatus,
    shopParamStatus,
    ttfbMs: ttfb.ms,
    ttfbStatus: ttfb.status,
  };
}

function writeReport(input: {
  cleanup: CleanupSummary | null;
  measurements: readonly RouteMeasurement[];
  phase: string;
}) {
  mkdirSync(evidenceDir, { recursive: true });

  const payload = {
    cleanup: input.cleanup,
    generatedAt: new Date().toISOString(),
    measurements: input.measurements,
    phase: input.phase,
    target: {
      baseUrl: requiredEnv("PLAYWRIGHT_BASE_URL"),
      class: "cloud-staging",
      testTarget: process.env.TEST_TARGET,
    },
  };
  const outputPath = join(evidenceDir, `task-076-cloud-performance-${input.phase}.json`);

  writeFileSync(`${outputPath}.tmp`, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[task-076-cloud-performance] report=${outputPath}`);
  console.log(`[task-076-cloud-performance] measurements=${JSON.stringify(input.measurements)}`);
}

test("TASK-076 measures authenticated Shop Admin cloud navigation latency", async ({
  context,
  page,
}) => {
  test.setTimeout(300_000);
  expect(process.env.TEST_TARGET).toBe("staging");
  expect(process.env.CONFIRM_TASK076_CLOUD_PERFORMANCE).toBe("yes");
  expect(taskPrefix).toBe("TASK076_");

  const fixture = await createTask076Fixture();
  const measurements: RouteMeasurement[] = [];
  const routeConsoleErrors: string[] = [];
  let cleanupSummary: CleanupSummary | null = null;

  page.on("console", (message) => {
    if (message.type() === "error") {
      routeConsoleErrors.push(message.text().slice(0, 300));
    }
  });
  page.on("pageerror", (error) => {
    routeConsoleErrors.push(error.message.slice(0, 300));
  });

  try {
    await signIn(page, fixture);

    for (const route of routeChecks) {
      routeConsoleErrors.length = 0;
      measurements.push(
        await measureRouteNavigation(page, context, fixture, route, routeConsoleErrors),
      );
      writeReport({
        cleanup: null,
        measurements,
        phase: process.env.TASK076_PERF_PHASE ?? "manual",
      });
    }
  } finally {
    cleanupSummary = await fixture.cleanup();
    writeReport({
      cleanup: cleanupSummary,
      measurements,
      phase: process.env.TASK076_PERF_PHASE ?? "manual",
    });
  }

  expect(cleanupSummary.cleanupErrors).toEqual([]);
  expect(cleanupSummary.residualRows).toBe(0);
  expect(cleanupSummary.userDeleted).toBe(true);
  expect(measurements).toHaveLength(routeChecks.length);

  if (process.env.TASK076_ENFORCE_THRESHOLDS === "yes") {
    expect(
      measurements.every(
        (measurement) =>
          measurement.finalStatus === "ready" &&
          measurement.finalMs !== null &&
          measurement.finalMs <= 2_000 &&
          (measurement.pendingStatus === "observed" ||
            measurement.pendingStatus === "final_under_300ms"),
      ),
    ).toBe(true);
  }
});
