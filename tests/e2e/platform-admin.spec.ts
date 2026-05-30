import { expect, test } from "@playwright/test";

const routes = [
  {
    path: "/",
    heading: "Platform Overview",
    title: "Platform Overview | MerchandiseControl Admin Web",
  },
  {
    path: "/platform",
    heading: "Platform Overview",
    title: "Platform Overview | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/users",
    heading: "Users / Profiles",
    title: "Users / Profiles | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/shops",
    heading: "Shops",
    title: "Shops | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/audit",
    heading: "Audit",
    title: "Audit | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/system",
    heading: "System Status",
    title: "System Status | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/operations",
    heading: "Safe Operations",
    title: "Safe Operations | MerchandiseControl Admin Web",
  },
];

async function expectPlatformShell(page: import("@playwright/test").Page) {
  await expect(page.getByText("MerchandiseControl").first()).toBeVisible();
  await expect(page.getByText("Platform Admin Console").first()).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Platform sections" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByText("Master console", { exact: true })).toBeVisible();
  await expect(
    page
      .getByLabel("Platform status")
      .getByText("Read-only", { exact: true }),
  ).toBeVisible();
}

test.describe("Platform Admin smoke", () => {
  for (const route of routes) {
    test(`loads ${route.path}`, async ({ page }) => {
      await page.goto(route.path);

      await expectPlatformShell(page);
      await expect(page).toHaveTitle(route.title);
      await expect(
        page.getByRole("heading", { level: 1, name: route.heading }),
      ).toBeVisible();
    });
  }

  test("platform navigation uses accessible links", async ({ page }) => {
    await page.goto("/platform");

    const nav = page.getByRole("navigation", { name: "Platform sections" });
    await expect(nav.getByRole("link", { name: "Overview" })).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Users / Profiles" }),
    ).toBeVisible();
    await expect(nav.getByRole("link", { name: "Shops" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Audit" })).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "System Status" }),
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Safe Operations" }),
    ).toBeVisible();

    await nav.getByRole("link", { name: "Users / Profiles" }).click();
    await expect(page).toHaveURL(/\/platform\/users$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Users / Profiles" }),
    ).toBeVisible();
  });

  test("safe operations are visible and disabled", async ({ page }) => {
    await page.goto("/platform/operations");

    await expectPlatformShell(page);
    await expect(
      page.getByRole("heading", { level: 1, name: "Safe Operations" }),
    ).toBeVisible();
    await expect(page.getByText("Disabled safe operations")).toBeVisible();

    for (const label of ["Create shop", "Assign owner", "Suspend shop"]) {
      await expect(page.getByRole("button", { name: label })).toBeDisabled();
    }
  });

  test("skip link moves keyboard focus to main content", async ({ page }) => {
    await page.goto("/platform");

    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to platform content" }),
    ).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.locator("#platform-content")).toBeFocused();
  });
});
