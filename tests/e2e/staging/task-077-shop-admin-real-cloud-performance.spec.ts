import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

type RealShopTarget = {
  email: string;
  shopId: string;
  source: "env" | "discovered";
};

type RouteMeasurement = {
  activeMs: number | null;
  consoleErrors: readonly string[];
  documentBytes?: number | null;
  documentMs?: number | null;
  finalMs: number | null;
  finalPathname?: string | null;
  finalTitleText?: string | null;
  finalStatus: "ready" | "timeout";
  label: string;
  navigationError?: string;
  path: string;
  pendingMs: number | null;
  pendingStatus: "observed" | "not_observed" | "final_under_300ms";
  ttfbMs: number | null;
  ttfbStatus: number | null;
  rscBytes?: number | null;
  rscResponseCount?: number;
  shopParamStatus?: "different" | "matched" | "missing";
  visualReplacementMs: number | null;
  visualReplacementStatus: "observed" | "not_observed" | "final_under_300ms";
};

type RouteCheck = {
  key: string;
  label: string;
  path: string;
  title: string;
};

type ShopCandidateRow = {
  shop_code: string | null;
  shop_id: string;
  shop_members?: Array<{
    membership_status: string | null;
    profile_id: string | null;
    role_key: string | null;
  }>;
};

const evidenceDir = "docs/TASKS/EVIDENCE/TASK-077";
const routeChecks: readonly RouteCheck[] = [
  {
    key: "overview",
    label: "Overview",
    path: "/shop/overview",
    title: "Overview",
  },
  {
    key: "products",
    label: "Products",
    path: "/shop/products",
    title: "Products",
  },
  {
    key: "categories",
    label: "Categories",
    path: "/shop/categories",
    title: "Categories",
  },
  {
    key: "suppliers",
    label: "Suppliers",
    path: "/shop/suppliers",
    title: "Suppliers",
  },
  {
    key: "staff",
    label: "POS / Staff",
    path: "/shop/staff",
    title: "POS / Staff",
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
    key: "devices",
    label: "Devices",
    path: "/shop/devices",
    title: "Devices",
  },
  {
    key: "settings",
    label: "Settings",
    path: "/shop/settings",
    title: "Settings",
  },
] as const;

function selectedRouteChecks() {
  const raw = process.env.TASK077_ROUTE_KEYS?.trim();

  if (!raw) {
    return routeChecks;
  }

  const requested = new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const selected = routeChecks.filter(
    (route) => requested.has(route.key) || requested.has(route.path),
  );

  if (selected.length === 0) {
    throw new Error(
      "BLOCKED_TASK077_ROUTE_KEYS_EMPTY: no matching route keys were selected.",
    );
  }

  return selected;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`BLOCKED_TASK077_ENV_REQUIRED: ${name}`);
  }

  return value;
}

function optionalEnv(name: string) {
  return process.env[name]?.trim() || null;
}

function formatSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") {
    return String(error);
  }

  const candidate = error as {
    code?: unknown;
    message?: unknown;
  };
  const code =
    typeof candidate.code === "string" ? candidate.code : "supabase_error";
  const message =
    typeof candidate.message === "string"
      ? candidate.message
      : "operation failed";

  return `${code}: ${message}`;
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
          "X-Client-Info":
            "merchandise-control-admin-web/task-077-real-shop-performance",
        },
      },
    },
  );
}

function isSyntheticShopCode(value: string | null | undefined) {
  return /^(TASK|TEST|FIXTURE|DEMO)[0-9_-]/i.test(value ?? "");
}

async function emailForProfile(supabase: AdminClient, profileId: string) {
  const { data, error } = await supabase.auth.admin.getUserById(profileId);

  if (error) {
    return null;
  }

  return data.user?.email ?? null;
}

async function resolveRealShopTarget(
  supabase: AdminClient,
): Promise<RealShopTarget> {
  const envShopId = optionalEnv("TASK077_REAL_SHOP_ID");
  const envEmail = optionalEnv("TASK077_REAL_SHOP_USER_EMAIL");

  if (envShopId && envEmail) {
    return {
      email: envEmail,
      shopId: envShopId,
      source: "env",
    };
  }

  let query = supabase
    .from("shops")
    .select(
      "shop_id,shop_code,shop_members!inner(profile_id,role_key,membership_status)",
    )
    .eq("shop_status", "active")
    .eq("shop_members.membership_status", "active")
    .in("shop_members.role_key", ["shop_owner", "shop_manager"])
    .limit(50);

  if (envShopId) {
    query = query.eq("shop_id", envShopId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `BLOCKED_TASK077_REAL_SHOP_DISCOVERY: ${formatSupabaseError(error)}`,
    );
  }

  const rows = ((data ?? []) as ShopCandidateRow[]).filter(
    (row) => envShopId || !isSyntheticShopCode(row.shop_code),
  );

  for (const row of rows) {
    for (const member of row.shop_members ?? []) {
      if (!member.profile_id) {
        continue;
      }

      const email = envEmail ?? (await emailForProfile(supabase, member.profile_id));

      if (email) {
        return {
          email,
          shopId: row.shop_id,
          source: envShopId || envEmail ? "env" : "discovered",
        };
      }
    }
  }

  throw new Error(
    "BLOCKED_TASK077_REAL_SHOP_UNAVAILABLE: provide TASK077_REAL_SHOP_ID and TASK077_REAL_SHOP_USER_EMAIL or keep one active non-synthetic shop owner/manager available.",
  );
}

function baseUrl() {
  return requiredEnv("PLAYWRIGHT_BASE_URL");
}

function routeUrl(path: string, shopId: string) {
  const url = new URL(path, baseUrl());

  url.searchParams.set("shop_id", shopId);
  return url;
}

async function signInWithMagicLink(page: Page, target: RealShopTarget) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    email: target.email,
    type: "magiclink",
  });
  const emailOtp = data?.properties?.email_otp;

  if (error || !emailOtp) {
    throw new Error(
      `BLOCKED_TASK077_MAGIC_LINK_UNAVAILABLE: ${formatSupabaseError(error)}`,
    );
  }

  const cookiesToSet: {
    name: string;
    options: {
      httpOnly?: boolean;
      sameSite?: boolean | "lax" | "none" | "strict";
      secure?: boolean;
    };
    value: string;
  }[] = [];
  const authClient = createServerClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll(nextCookies) {
          cookiesToSet.push(...nextCookies);
        },
      },
    },
  );
  const { error: verifyError } = await authClient.auth.verifyOtp({
    email: target.email,
    token: emailOtp,
    type: "magiclink",
  });

  if (verifyError || cookiesToSet.length === 0) {
    throw new Error(
      `BLOCKED_TASK077_MAGIC_OTP_VERIFY_FAILED: ${formatSupabaseError(
        verifyError,
      )}`,
    );
  }

  await page.context().clearCookies();
  await page.context().addCookies(
    cookiesToSet.map((cookie) => ({
      httpOnly: cookie.options.httpOnly,
      name: cookie.name,
      sameSite:
        cookie.options.sameSite === "strict" || cookie.options.sameSite === true
          ? "Strict"
          : cookie.options.sameSite === "none"
            ? "None"
            : "Lax",
      secure: cookie.options.secure ?? false,
      url: baseUrl(),
      value: cookie.value,
    })),
  );
  await page.goto(routeUrl("/shop/overview", target.shopId).toString());
  await expectRouteTitle(page, "Overview", 20_000);
}

async function expectRouteTitle(page: Page, title: string, timeout = 12_000) {
  const titleById = page.locator("#shop-shell-page-title");
  const visibleHeading = page.getByRole("heading", {
    level: 1,
    name: title,
  });

  await expect(titleById.or(visibleHeading).first()).toContainText(title, {
    timeout,
  });
}

async function cookieHeader(context: BrowserContext) {
  const cookies = await context.cookies(baseUrl());

  return cookies
    .map(
      (cookie) =>
        `${encodeURIComponent(cookie.name)}=${encodeURIComponent(cookie.value)}`,
    )
    .join("; ");
}

async function measureTtfb(
  context: BrowserContext,
  path: string,
  shopId: string,
) {
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
    let documentBytes: number | null = null;
    let documentMs: number | null = null;

    if (process.env.TASK077_CAPTURE_PAYLOAD_BYTES === "yes") {
      const bodyStart = nodePerformance.now();
      const bytes = await response.arrayBuffer();

      documentBytes = bytes.byteLength;
      documentMs = Math.round(nodePerformance.now() - bodyStart);
    } else {
      await response.body?.cancel();
    }

    return {
      documentBytes,
      documentMs,
      ms: Math.round(elapsed),
      status: response.status,
    };
  } catch {
    return {
      documentBytes: null,
      documentMs: null,
      ms: null,
      status: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function installPendingObserver(page: Page) {
  await page.evaluate(() => {
    type Task077Window = typeof window & {
      __task077PendingEvents?: number[];
      __task077PendingObserver?: MutationObserver;
    };
    const taskWindow = window as Task077Window;
    const selector = [
      '[data-shop-route-loading-target]',
      '[data-shop-route-loading]',
      '[data-shop-navigation-pending="true"]',
      "[data-products-loading]",
      "[data-products-loading-rows]",
    ].join(",");
    const record = () => {
      if (document.querySelector(selector)) {
        taskWindow.__task077PendingEvents = [
          ...(taskWindow.__task077PendingEvents ?? []),
          window.performance.now(),
        ];
      }
    };

    taskWindow.__task077PendingObserver?.disconnect();
    taskWindow.__task077PendingEvents = [];
    taskWindow.__task077PendingObserver = new MutationObserver(record);
    taskWindow.__task077PendingObserver.observe(document.body, {
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
          __task077PendingEvents?: number[];
        };

        return (taskWindow.__task077PendingEvents ?? []).some(
          (eventTime) => eventTime >= startedAt,
        );
      },
      start,
      { timeout: 300 },
    );

    const first = await page.evaluate((startedAt) => {
      const taskWindow = window as typeof window & {
        __task077PendingEvents?: number[];
      };

      return (
        (taskWindow.__task077PendingEvents ?? []).find(
          (eventTime) => eventTime >= startedAt,
        ) ?? null
      );
    }, start);

    return first === null ? null : Math.round(first - start);
  } catch {
    return null;
  }
}

async function measureRouteNavigation(
  page: Page,
  context: BrowserContext,
  target: RealShopTarget,
  route: RouteCheck,
  consoleErrors: readonly string[],
): Promise<RouteMeasurement> {
  const ttfb = await measureTtfb(context, route.path, target.shopId);
  const link = page.locator(`a[href*="${route.path}"]`).first();
  const rscPayloads: Array<{ bytes: number; url: string }> = [];
  const capturePayloads = process.env.TASK077_CAPTURE_PAYLOAD_BYTES === "yes";
  const responseHandler = async (response: import("@playwright/test").Response) => {
    if (!capturePayloads) {
      return;
    }

    const responseUrl = new URL(response.url());

    if (
      responseUrl.pathname !== route.path ||
      !responseUrl.searchParams.has("_rsc")
    ) {
      return;
    }

    try {
      const body = await response.body();

      rscPayloads.push({
        bytes: body.byteLength,
        url: "redacted",
      });
    } catch {
      rscPayloads.push({
        bytes: 0,
        url: "redacted",
      });
    }
  };

  page.on("response", responseHandler);
  await installPendingObserver(page);
  const startedAt = await page.evaluate(() => window.performance.now());
  const wallStartedAt = nodePerformance.now();
  try {
    await link.click({ timeout: 3_000 });
  } catch (error) {
    page.off("response", responseHandler);

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
      rscBytes: null,
      rscResponseCount: 0,
      ttfbMs: ttfb.ms,
      ttfbStatus: ttfb.status,
      visualReplacementMs: null,
      visualReplacementStatus: "not_observed",
    };
  }

  const activeMs = await (async () => {
    try {
      await expect(link).toHaveAttribute("aria-current", "page", {
        timeout: 1_000,
      });

      return Math.round(nodePerformance.now() - wallStartedAt);
    } catch {
      return null;
    }
  })();
  const pendingMs = await firstPendingMs(page, startedAt);
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

    finalMs = Math.round(nodePerformance.now() - wallStartedAt);
    finalStatus = "ready";
    shopParamStatus =
      shopParam === target.shopId ? "matched" : shopParam ? "different" : "missing";
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
  } finally {
    page.off("response", responseHandler);
  }

  const pendingStatus =
    pendingMs === null && finalMs !== null && finalMs <= 300
      ? "final_under_300ms"
      : pendingMs === null
        ? "not_observed"
        : "observed";

  return {
    activeMs,
    consoleErrors: consoleErrors.slice(),
    documentBytes: ttfb.documentBytes,
    documentMs: ttfb.documentMs,
    finalMs,
    finalPathname,
    finalStatus,
    finalTitleText,
    label: route.label,
    path: route.path,
    pendingMs,
    pendingStatus,
    rscBytes: rscPayloads.reduce((total, payload) => total + payload.bytes, 0),
    rscResponseCount: rscPayloads.length,
    shopParamStatus,
    ttfbMs: ttfb.ms,
    ttfbStatus: ttfb.status,
    visualReplacementMs: pendingMs,
    visualReplacementStatus: pendingStatus,
  };
}

function writeReport(input: {
  measurements: readonly RouteMeasurement[];
  phase: string;
  target: RealShopTarget;
}) {
  mkdirSync(evidenceDir, { recursive: true });

  const payload = {
    dataset: "real-shop-readonly",
    generatedAt: new Date().toISOString(),
    measurements: input.measurements,
    phase: input.phase,
    shop: {
      id: "redacted",
      source: input.target.source,
    },
    target: {
      baseUrl: baseUrl(),
      class: "cloud-supabase-readonly",
      testTarget: process.env.TEST_TARGET,
    },
  };
  const outputPath = join(
    evidenceDir,
    `task-077-cloud-performance-real-shop-${input.phase}.json`,
  );

  writeFileSync(`${outputPath}.tmp`, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[task-077-real-shop-performance] report=${outputPath}`);
  console.log(
    `[task-077-real-shop-performance] measurements=${JSON.stringify(
      input.measurements,
    )}`,
  );
}

test("TASK-077 measures real Shop Admin read-only cloud data latency", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  expect(process.env.CONFIRM_TASK077_REAL_SHOP_READONLY).toBe("yes");

  const target = await resolveRealShopTarget(createAdminClient());
  const measurements: RouteMeasurement[] = [];
  const routeConsoleErrors: string[] = [];
  const routes = selectedRouteChecks();

  page.on("console", (message) => {
    if (message.type() === "error") {
      routeConsoleErrors.push(message.text().slice(0, 300));
    }
  });
  page.on("pageerror", (error) => {
    routeConsoleErrors.push(error.message.slice(0, 300));
  });

  await signInWithMagicLink(page, target);

  for (const route of routes) {
    routeConsoleErrors.length = 0;
    measurements.push(
      await measureRouteNavigation(
        page,
        context,
        target,
        route,
        routeConsoleErrors,
      ),
    );
    writeReport({
      measurements,
      phase: process.env.TASK077_PERF_PHASE ?? "manual",
      target,
    });
  }

  expect(measurements).toHaveLength(routes.length);

  if (process.env.TASK077_ENFORCE_THRESHOLDS === "yes") {
    expect(
      measurements.every(
        (measurement) =>
          measurement.finalStatus === "ready" &&
          measurement.visualReplacementStatus !== "not_observed" &&
          (measurement.visualReplacementMs ?? 0) <= 2_000,
      ),
    ).toBe(true);
    expect(
      measurements.find((measurement) => measurement.path === "/shop/history")
        ?.finalStatus,
    ).toBe("ready");
  }
});
