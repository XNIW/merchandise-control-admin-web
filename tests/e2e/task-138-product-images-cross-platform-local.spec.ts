import { expect, test, type Page } from "@playwright/test";
import { chmodSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

test.use({ screenshot: "only-on-failure", trace: "off", video: "off" });
test.setTimeout(60_000);

const MANIFEST_PATH = "/tmp/task138-product-images-fixture.json";

type FixtureManifest = {
  productAId: string;
  productAName: string;
  productBId: string;
  productBName: string;
  shopId: string;
  target: "local";
  users: { owner: { email: string; password: string } };
  versionId: string;
};

function requireLocalManifest() {
  const baseUrl = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "");
  if (
    process.env.CONFIRM_TASK138_LOCAL_FIXTURE !== "yes" ||
    process.env.TEST_TARGET !== "local" ||
    baseUrl.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "::1"].includes(baseUrl.hostname)
  ) {
    throw new Error("BLOCKED_TASK138_EXPLICIT_LOCAL_FIXTURE_REQUIRED");
  }
  const mode = statSync(MANIFEST_PATH).mode & 0o777;
  if (mode !== 0o600) {
    throw new Error("BLOCKED_TASK138_FIXTURE_MANIFEST_PERMISSIONS");
  }
  const manifest = JSON.parse(
    readFileSync(MANIFEST_PATH, "utf8"),
  ) as FixtureManifest;
  if (manifest.target !== "local") {
    throw new Error("BLOCKED_TASK138_FIXTURE_TARGET_INVALID");
  }
  return manifest;
}

async function signIn(page: Page, owner: FixtureManifest["users"]["owner"]) {
  await page.goto("/auth/login?mode=admin-account&next=/shop");
  await page.evaluate(
    ({ email, password }) => {
      for (const [name, value] of Object.entries({ email, password })) {
        const input = document.querySelector<HTMLInputElement>(
          `input[name="${name}"]`,
        );
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (!input || !setter) throw new Error("login input unavailable");
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    owner,
  );
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/shop"),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

test("Admin reflects the current mobile product-image state", async ({
  page,
}) => {
  const fixture = requireLocalManifest();
  const source = process.env.TASK138_EXPECTED_SOURCE;
  if (source !== "android" && source !== "ios") {
    throw new Error("BLOCKED_TASK138_EXPECTED_MOBILE_SOURCE_REQUIRED");
  }
  const expectedState = process.env.TASK138_EXPECTED_STATE ?? "ready";
  if (expectedState !== "ready" && expectedState !== "absent") {
    throw new Error("BLOCKED_TASK138_EXPECTED_IMAGE_STATE_REQUIRED");
  }
  const refs: Array<{
    productId?: string;
    variant?: string;
    versionId?: string;
  }> = [];
  page.on("request", (request) => {
    if (!request.url().includes("/api/shop/product-images/read-urls")) return;
    try {
      const body = request.postDataJSON() as { refs?: typeof refs };
      refs.push(...(body.refs ?? []));
    } catch {
      // The assertions below fail closed if the request cannot be parsed.
    }
  });

  await signIn(page, fixture.users.owner);
  await page.goto(`/shop/products?shop_id=${fixture.shopId}`);
  const rowA = page
    .locator("[data-product-catalog-row]")
    .filter({ hasText: fixture.productAName });
  const rowB = page
    .locator("[data-product-catalog-row]")
    .filter({ hasText: fixture.productBName });
  await expect(rowA).toBeVisible();
  await expect(rowA.locator("img")).toHaveCount(0);
  if (expectedState === "absent") {
    await expect(rowB.locator("img")).toHaveCount(0);
    await page.waitForTimeout(250);
    expect(refs.some((ref) => ref.productId === fixture.productBId)).toBe(false);
    await page.screenshot({
      path: join(
        process.cwd(),
        `docs/TASKS/EVIDENCE/TASK-138/admin-after-${source}-remove.png`,
      ),
      fullPage: true,
    });
    return;
  }
  await expect(rowB.getByRole("img", { name: fixture.productBName })).toBeVisible();

  await expect
    .poll(() =>
      refs.find(
        (ref) =>
          ref.productId === fixture.productBId && ref.variant === "thumb",
      )?.versionId,
    )
    .not.toBeUndefined();
  expect(refs.some((ref) => ref.productId === fixture.productAId)).toBe(false);
  const mobileVersion = refs.find(
    (ref) => ref.productId === fixture.productBId && ref.variant === "thumb",
  )?.versionId;
  expect(mobileVersion).not.toBe(fixture.versionId);

  await rowB.getByRole("link", { name: /Detail:/ }).click();
  const editor = page.getByRole("dialog").locator("[data-product-image-editor]");
  await expect(editor.getByRole("img", { name: fixture.productBName })).toBeVisible();
  await expect
    .poll(() =>
      refs.find(
        (ref) =>
          ref.productId === fixture.productBId && ref.variant === "main",
      )?.versionId,
    )
    .toBe(mobileVersion);

  const evidencePath = join(
    process.cwd(),
    `docs/TASKS/EVIDENCE/TASK-138/admin-after-${source}-replace.png`,
  );
  await page.screenshot({ path: evidencePath, fullPage: true });
  chmodSync(evidencePath, 0o644);
});
