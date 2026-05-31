import { expect, test } from "@playwright/test";

const protectedPlatformRoutes = [
  {
    path: "/platform/overview",
    title: "Platform Overview | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/users/00000000-0000-0000-0000-000000000000",
    title: "User Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/shops/new",
    title: "Provision Shop | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/shops/00000000-0000-0000-0000-000000000000",
    title: "Shop Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/provisioning",
    title: "Provisioning | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/admins",
    title: "Platform Admins | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/audit/00000000-0000-0000-0000-000000000000",
    title: "Audit Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/data",
    title: "Data Health | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/devices",
    title: "Global Devices | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/sync",
    title: "Global Sync | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/history",
    title: "Global History | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/support",
    title: "Support Diagnostics | MerchandiseControl Admin Web",
  },
];

test.describe("TASK-016 Platform Admin smoke", () => {
  for (const route of protectedPlatformRoutes) {
    test(`protects ${route.path}`, async ({ page }) => {
      await page.goto(route.path);

      await expect(page).toHaveTitle(route.title);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Platform Admin access required",
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "Platform sections" }),
      ).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Create shop" })).toHaveCount(0);
    });
  }
});
