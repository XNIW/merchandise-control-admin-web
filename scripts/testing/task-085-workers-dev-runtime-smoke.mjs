#!/usr/bin/env node
import { chromium, devices, expect } from "@playwright/test";

const baseUrl =
  process.env.PLAYWRIGHT_BASE_URL?.trim() || process.env.TASK085_BASE_URL?.trim();
const repeatCount = Number(process.env.TASK085_OAUTH_REPEAT_COUNT || 5);
const shopCode = process.env.TASK085_SHOP_CODE?.trim() ?? "";
const staffCode = process.env.TASK085_STAFF_CODE?.trim() ?? "";
const staffPin = process.env.TASK085_STAFF_PIN?.trim() ?? "";
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
      )} provider=${reachedProvider}`,
    );
  } finally {
    await context.close();
  }
}

async function runProductsProbe(browser, origin) {
  if (!shopCode || !staffCode || !staffPin) {
    log("SKIP products authenticated smoke: TASK085_SHOP_CODE/STAFF_CODE/STAFF_PIN not set.");
    return;
  }

  const context = await browser.newContext({
    ...devices["iPhone 13"],
    locale: "en-US",
  });
  const page = await context.newPage();

  try {
    await page.goto(`${origin}/auth/login?mode=shop-code&next=/shop/products`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("textbox", { name: /^shop code$/i }).fill(shopCode);
    await page.getByRole("textbox", { name: /^staff code$/i }).fill(staffCode);
    await page.locator('input[name="credential"]').fill(staffPin);
    await page.getByRole("button", { name: /sign in|access|continue|entra/i }).click();
    await page.waitForURL((url) => url.origin === origin && url.pathname.startsWith("/shop"), {
      timeout: 20000,
    });
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
