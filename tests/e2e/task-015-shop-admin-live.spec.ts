import { expect, test } from "@playwright/test";

const protectedRoutes = [
  "/shop/products",
  "/shop/categories",
  "/shop/suppliers",
  "/shop/import-export",
  "/shop/history",
  "/shop/history/sync:1",
  "/shop/staff",
  "/shop/devices",
  "/shop/roles",
  "/shop/settings",
  "/shop/audit",
];

test.describe("TASK-015 Shop Admin protected readiness", () => {
  for (const route of protectedRoutes) {
    test(`protects ${route} without exposing live controls anonymously`, async ({
      page,
    }) => {
      await page.goto(route);

      await expect(page.getByRole("main")).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 1, name: "Admin Console access required" }),
      ).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "Shop sections" }),
      ).toHaveCount(0);
      await expect(page.getByText("temporary credential", { exact: false })).toHaveCount(0);
      await expect(page.getByText("credential_hash", { exact: false })).toHaveCount(0);
    });
  }
});
