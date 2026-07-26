#!/usr/bin/env node
import { chromium, devices, expect } from "@playwright/test";

const baseUrl =
  process.env.PLAYWRIGHT_BASE_URL?.trim() || process.env.TASK085_BASE_URL?.trim();
const repeatCount = Number(process.env.TASK085_OAUTH_REPEAT_COUNT || 5);
const ownerEmail = process.env.TASK085_OWNER_EMAIL?.trim() ?? "";
const ownerPassword = process.env.TASK085_OWNER_PASSWORD ?? "";
const requireAuthenticatedProducts =
  process.env.TASK085_REQUIRE_AUTHENTICATED_PRODUCTS?.trim().toLowerCase() ===
  "yes";
const forbiddenBodyPattern =
  /Error 1102|Worker exceeded resource limits|Total unavailable|Server-side count unavailable/i;

function fail(message) {
  console.error(`[task-085-smoke] FAIL ${message}`);
  process.exitCode = 1;
}

function log(message) {
  console.log(`[task-085-smoke] ${message}`);
}

function requireBaseUrl() {
  if (!baseUrl) {
    throw new Error("Set PLAYWRIGHT_BASE_URL or TASK085_BASE_URL.");
  }

  const parsed = new URL(baseUrl);

  if (
    parsed.protocol !== "https:" ||
    ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
  ) {
    throw new Error("TASK-085 workers.dev smoke requires an HTTPS non-local URL.");
  }

  return parsed.origin;
}

function redactedLocation(value) {
  try {
    const parsed = new URL(value);

    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return "unparseable";
  }
}

async function bodyText(page) {
  try {
    return await page.locator("body").innerText({ timeout: 3000 });
  } catch {
    return "";
  }
}

async function assertNoForbiddenBody(page, label) {
  const text = await bodyText(page);

  if (forbiddenBodyPattern.test(text)) {
    throw new Error(`${label} rendered forbidden runtime/error copy.`);
  }
}

async function runOAuthProbe(browser, origin, index) {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    locale: "en-US",
  });
  const page = await context.newPage();
  const supabaseProviderHosts = new Set();

  page.on("request", (request) => {
    const requestUrl = new URL(request.url());

    if (requestUrl.hostname.endsWith(".supabase.co")) {
      supabaseProviderHosts.add(requestUrl.hostname);
    }
  });

  try {
    await page.goto(`${origin}/auth/login?mode=admin-account&next=/shop`, {
      waitUntil: "domcontentloaded",
    });
    await assertNoForbiddenBody(page, `oauth login ${index}`);

    const clickPromise = page
      .getByRole("button", { name: /google/i })
      .click();
    const navigationPromise = page.waitForURL(
      (url) => {
        const host = url.hostname;

        return (
          host.endsWith(".supabase.co") ||
          host === "accounts.google.com" ||
          url.origin === origin
        );
      },
      { timeout: 20000 },
    );

    await Promise.all([clickPromise, navigationPromise]);
    await assertNoForbiddenBody(page, `oauth result ${index}`);

    const finalUrl = new URL(page.url());
    const reachedProvider =
      finalUrl.hostname.endsWith(".supabase.co") ||
      finalUrl.hostname === "accounts.google.com";
    const safeLocalOAuthResult =
      finalUrl.origin === origin &&
      finalUrl.pathname === "/auth/login" &&
      (finalUrl.searchParams.has("result") || finalUrl.searchParams.has("error"));

    if (!reachedProvider && !safeLocalOAuthResult) {
      throw new Error(
        `OAuth probe ${index} stopped at unexpected location ${redactedLocation(
          page.url(),
        )}`,
      );
    }

    log(
      `PASS oauth mobile ${index}: final=${redactedLocation(
        page.url(),
      )} provider=${reachedProvider} supabase_host=${
        supabaseProviderHosts.size > 0 ? "observed" : "not-observed"
      }`,
    );
  } finally {
    await context.close();
  }
}

async function runProductsProbe(browser, origin) {
  if (!ownerEmail || !ownerPassword) {
    if (requireAuthenticatedProducts) {
      throw new Error(
        "TASK085_REQUIRE_AUTHENTICATED_PRODUCTS=yes requires TASK085_OWNER_EMAIL/TASK085_OWNER_PASSWORD.",
      );
    }

    log("SKIP products authenticated smoke: TASK085_OWNER_EMAIL/TASK085_OWNER_PASSWORD not set.");
    return;
  }

  const context = await browser.newContext({
    ...devices["iPhone 13"],
    locale: "en-US",
  });
  const page = await context.newPage();
  const navigationPaths = [];

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      const location = new URL(frame.url());

      navigationPaths.push(
        `${location.pathname}${
          location.searchParams.has("result")
            ? `?result=${location.searchParams.get("result")}`
            : ""
        }`,
      );
    }
  });

  try {
    await page.goto(`${origin}/auth/login?mode=admin-account&next=/shop/products`, {
      waitUntil: "networkidle",
    });
    await page.getByRole("textbox", { name: /^email$/i }).fill(ownerEmail);
    await page.locator('input[name="password"]').fill(ownerPassword);
    const submitButton = page.getByRole("button", { name: /^sign in$/i });

    await expect(submitButton).toBeEnabled();
    const actionResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().startsWith(`${origin}/auth/login`),
      { timeout: 180000 },
    );

    await submitButton.click();
    const completedAction = await actionResponse;
    await page
      .waitForURL(
        (url) => url.origin === origin && url.pathname.startsWith("/shop"),
        { timeout: 10000 },
      )
      .catch(() => undefined);

    if (
      !page
        .url()
        .startsWith(`${origin}/shop`)
    ) {
      const publicAlerts = (await page.getByRole("alert").allTextContents())
        .map((value) => value.trim())
        .filter(Boolean)
        .join(" ");
      const currentLocation = new URL(page.url());
      const safeCookies = (await context.cookies(origin)).map((cookie) => ({
        domain: cookie.domain,
        name: cookie.name,
        path: cookie.path,
        secure: cookie.secure,
      }));
      const actionRedirect =
        completedAction.headers()["x-action-redirect"] ?? "none";

      throw new Error(
        [
          "Products authenticated login did not redirect to /shop.",
          `action_status=${completedAction.status()}`,
          `action_redirect=${actionRedirect}`,
          `location=${currentLocation.pathname}`,
          `navigations=${navigationPaths.join(">")}`,
          `cookies=${JSON.stringify(safeCookies)}`,
          publicAlerts ? `alert=${publicAlerts}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    }
    await page.goto(`${origin}/shop/products`, { waitUntil: "domcontentloaded" });
    await assertNoForbiddenBody(page, "products page");
    await expect(page.getByText(/Total products/i).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/Loading total/i)).toHaveCount(0);
    await expect(page.getByText(/Unable to load total/i)).toHaveCount(0);
    const productsText = await bodyText(page);

    if (!/\d[\d,]*-\d[\d,]* of \d/i.test(productsText)) {
      throw new Error("Products page did not render a visible exact range total.");
    }

    log("PASS products mobile: exact total visible and unavailable copy absent");
  } finally {
    await context.close();
  }
}

async function main() {
  const origin = requireBaseUrl();
  const browser = await chromium.launch({ headless: true });

  try {
    for (let index = 1; index <= repeatCount; index += 1) {
      await runOAuthProbe(browser, origin, index);
    }

    await runProductsProbe(browser, origin);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
