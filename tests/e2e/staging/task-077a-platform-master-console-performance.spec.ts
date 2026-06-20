import { expect, test, type BrowserContext, type Page, type Response } from "@playwright/test";
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

type PlatformAdminTarget = {
  source: "env" | "discovered";
  email: string;
};

type RouteCheck = {
  heading: string;
  key: string;
  label: string;
  path: string;
};

type RouteMeasurement = {
  activeMs: number | null;
  consoleErrors: readonly string[];
  documentBytes?: number | null;
  documentMs?: number | null;
  finalMs: number | null;
  finalStatus: "ready" | "timeout";
  heading: string;
  key: string;
  label: string;
  navigationError?: string;
  path: string;
  pendingMs: number | null;
  pendingStatus: "observed" | "not_observed" | "final_under_300ms";
  rscBytes?: number | null;
  rscResponseCount?: number;
  ttfbMs: number | null;
  ttfbStatus: number | null;
  visualReplacementMs: number | null;
  visualReplacementStatus: "observed" | "not_observed" | "final_under_300ms";
};

type PlatformAdminRow = {
  profile_id: string;
};

const evidenceDir = "docs/TASKS/EVIDENCE/TASK-077A";
const routeChecks: readonly RouteCheck[] = [
  {
    heading: "Platform Overview",
    key: "overview",
    label: "Overview",
    path: "/platform",
  },
  {
    heading: "Personal Accounts",
    key: "users",
    label: "Users",
    path: "/platform/users",
  },
  {
    heading: "Shop Admins",
    key: "shopAdmins",
    label: "Shop Admins",
    path: "/platform/shop-admins",
  },
  {
    heading: "Platform Admins",
    key: "admins",
    label: "Platform Admins",
    path: "/platform/admins",
  },
  {
    heading: "Shops",
    key: "shops",
    label: "Shops",
    path: "/platform/shops",
  },
  {
    heading: "Controlled Operations",
    key: "operations",
    label: "Operations",
    path: "/platform/operations",
  },
  {
    heading: "Audit",
    key: "audit",
    label: "Audit",
    path: "/platform/audit",
  },
  {
    heading: "System Status",
    key: "system",
    label: "System",
    path: "/platform/system",
  },
] as const;

function selectedRouteChecks() {
  const raw = process.env.TASK077A_PLATFORM_ROUTE_KEYS?.trim();

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
    (route) =>
      requested.has(route.key) ||
      requested.has(route.path) ||
      requested.has(route.label),
  );

  if (selected.length === 0) {
    throw new Error(
      "BLOCKED_TASK077A_ROUTE_KEYS_EMPTY: no matching Platform route keys were selected.",
    );
  }

  return selected;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`BLOCKED_TASK077A_ENV_REQUIRED: ${name}`);
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
            "merchandise-control-admin-web/task-077a-platform-performance",
        },
      },
    },
  );
}

async function emailForProfile(supabase: AdminClient, profileId: string) {
  const { data, error } = await supabase.auth.admin.getUserById(profileId);

  if (error) {
    return null;
  }

  return data.user?.email ?? null;
}

async function resolvePlatformAdminTarget(
  supabase: AdminClient,
): Promise<PlatformAdminTarget> {
  const envEmail = optionalEnv("TASK077A_PLATFORM_ADMIN_EMAIL");

  if (envEmail) {
    return {
      email: envEmail,
      source: "env",
    };
  }

  const { data, error } = await supabase
    .from("platform_admins")
    .select("profile_id")
    .eq("status", "active")
    .is("revoked_at", null)
    .limit(20);

  if (error) {
    throw new Error(
      `BLOCKED_TASK077A_PLATFORM_ADMIN_DISCOVERY: ${formatSupabaseError(error)}`,
    );
  }

  for (const row of (data ?? []) as PlatformAdminRow[]) {
    const email = await emailForProfile(supabase, row.profile_id);

    if (email) {
      return {
        email,
        source: "discovered",
      };
    }
  }

  throw new Error(
    "BLOCKED_TASK077A_PLATFORM_ADMIN_UNAVAILABLE: provide TASK077A_PLATFORM_ADMIN_EMAIL or keep one active Platform Admin auth identity available.",
  );
}

function baseUrl() {
  return requiredEnv("PLAYWRIGHT_BASE_URL");
}

function routeUrl(path: string) {
  return new URL(path, baseUrl());
}

async function signInWithMagicLink(page: Page, target: PlatformAdminTarget) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    email: target.email,
    type: "magiclink",
  });
  const emailOtp = data?.properties?.email_otp;

  if (error || !emailOtp) {
    throw new Error(
      `BLOCKED_TASK077A_MAGIC_LINK_UNAVAILABLE: ${formatSupabaseError(error)}`,
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
      `BLOCKED_TASK077A_MAGIC_OTP_VERIFY_FAILED: ${formatSupabaseError(
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
  await page.goto(routeUrl("/platform/system").toString());
  await expectRouteHeading(page, "System Status", 20_000);
}

async function expectRouteHeading(
  page: Page,
  heading: string,
  timeout = 12_000,
) {
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible({
    timeout,
  });
  await expect(page.getByText("Read blocked")).toHaveCount(0);
  await expect(
    page.getByText("The Platform Admin read model could not be loaded through RLS"),
  ).toHaveCount(0);
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

async function measureTtfb(context: BrowserContext, path: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const start = nodePerformance.now();

  try {
    const response = await fetch(routeUrl(path), {
      headers: {
        cookie: await cookieHeader(context),
      },
      redirect: "manual",
      signal: controller.signal,
    });
    const elapsed = nodePerformance.now() - start;
    let documentBytes: number | null = null;
    let documentMs: number | null = null;

    if (process.env.TASK077A_CAPTURE_PAYLOAD_BYTES === "yes") {
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
    type Task077AWindow = typeof window & {
      __task077aPendingEvents?: number[];
      __task077aPendingObserver?: MutationObserver;
    };
    const taskWindow = window as Task077AWindow;
    const selector = [
      '[aria-busy="true"]',
      "[data-platform-route-loading]",
      '[data-platform-navigation-pending="true"]',
    ].join(",");
    const record = () => {
      if (document.querySelector(selector)) {
        taskWindow.__task077aPendingEvents = [
          ...(taskWindow.__task077aPendingEvents ?? []),
          window.performance.now(),
        ];
      }
    };

    taskWindow.__task077aPendingObserver?.disconnect();
    taskWindow.__task077aPendingEvents = [];
    taskWindow.__task077aPendingObserver = new MutationObserver(record);
    taskWindow.__task077aPendingObserver.observe(document.body, {
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
          __task077aPendingEvents?: number[];
        };

        return (taskWindow.__task077aPendingEvents ?? []).some(
          (eventTime) => eventTime >= startedAt,
        );
      },
      start,
      { timeout: 300 },
    );

    const first = await page.evaluate((startedAt) => {
      const taskWindow = window as typeof window & {
        __task077aPendingEvents?: number[];
      };

      return (
        (taskWindow.__task077aPendingEvents ?? []).find(
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
  route: RouteCheck,
  consoleErrors: readonly string[],
): Promise<RouteMeasurement> {
  const ttfb = await measureTtfb(context, route.path);
  const link = page.locator(`a[href="${route.path}"]`).first();
  const rscPayloads: Array<{ bytes: number; url: string }> = [];
  const capturePayloads = process.env.TASK077A_CAPTURE_PAYLOAD_BYTES === "yes";
  const responseHandler = async (response: Response) => {
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
    await expect(link).toBeVisible({ timeout: 5_000 });
    await link.click({ timeout: 5_000 });
  } catch (error) {
    page.off("response", responseHandler);

    return {
      activeMs: null,
      consoleErrors: consoleErrors.slice(),
      finalMs: null,
      finalStatus: "timeout",
      heading: route.heading,
      key: route.key,
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
  let finalStatus: RouteMeasurement["finalStatus"] = "timeout";

  try {
    await expectRouteHeading(page, route.heading);
    const currentUrl = new URL(page.url());

    expect(currentUrl.pathname).toBe(route.path);

    finalMs = Math.round(nodePerformance.now() - wallStartedAt);
    finalStatus = "ready";
  } catch {
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
    finalStatus,
    heading: route.heading,
    key: route.key,
    label: route.label,
    path: route.path,
    pendingMs,
    pendingStatus,
    rscBytes: rscPayloads.reduce((total, payload) => total + payload.bytes, 0),
    rscResponseCount: rscPayloads.length,
    ttfbMs: ttfb.ms,
    ttfbStatus: ttfb.status,
    visualReplacementMs: pendingMs,
    visualReplacementStatus: pendingStatus,
  };
}

function writeReport(input: {
  measurements: readonly RouteMeasurement[];
  phase: string;
  target: PlatformAdminTarget;
}) {
  mkdirSync(evidenceDir, { recursive: true });

  const outputPath = join(
    evidenceDir,
    `task-077a-platform-performance-${input.phase}.json`,
  );
  const payload = {
    dataset: "platform-master-console-readonly",
    generatedAt: new Date().toISOString(),
    measurements: input.measurements,
    phase: input.phase,
    platformAdmin: {
      source: input.target.source,
      user: "redacted",
    },
    target: {
      baseUrl: baseUrl(),
      class: "cloud-supabase-readonly",
      testTarget: process.env.TEST_TARGET,
    },
  };

  writeFileSync(`${outputPath}.tmp`, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[task-077a-platform-performance] report=${outputPath}`);
  console.log(
    `[task-077a-platform-performance] measurements=${JSON.stringify(
      input.measurements,
    )}`,
  );
}

test("TASK-077A measures Platform Master Console cloud data latency", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  expect(process.env.CONFIRM_TASK077A_PLATFORM_READONLY).toBe("yes");

  const target = await resolvePlatformAdminTarget(createAdminClient());
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
      await measureRouteNavigation(page, context, route, routeConsoleErrors),
    );
    writeReport({
      measurements,
      phase: process.env.TASK077A_PERF_PHASE ?? "local-cloud-before",
      target,
    });
  }

  expect(measurements).toHaveLength(routes.length);

  if (process.env.TASK077A_ENFORCE_THRESHOLDS === "yes") {
    expect(
      measurements.every(
        (measurement) =>
          measurement.finalStatus === "ready" &&
          measurement.visualReplacementStatus !== "not_observed" &&
          (measurement.visualReplacementMs ?? 0) <= 200 &&
          (measurement.finalMs ?? Number.POSITIVE_INFINITY) <= 2_000,
      ),
    ).toBe(true);
  }
});
