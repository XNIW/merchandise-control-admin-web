import { expect, test } from "@playwright/test";

const entryRoute = {
  path: "/",
  heading: "Admin Web access required",
  title: "Admin Access | MerchandiseControl Admin Web",
};

const protectedPlatformRoutes = [
  {
    path: "/platform",
    heading: "Platform Admin access required",
    title: "Platform Overview | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/users",
    heading: "Platform Admin access required",
    title: "Users / Profiles | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/users/00000000-0000-0000-0000-000000000000",
    heading: "Platform Admin access required",
    title: "User Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/shops",
    heading: "Platform Admin access required",
    title: "Shops | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/shops/new",
    heading: "Platform Admin access required",
    title: "Provision Shop | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/shops/00000000-0000-0000-0000-000000000000",
    heading: "Platform Admin access required",
    title: "Shop Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/provisioning",
    heading: "Platform Admin access required",
    title: "Provisioning | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/admins",
    heading: "Platform Admin access required",
    title: "Platform Admins | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/audit",
    heading: "Platform Admin access required",
    title: "Audit | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/audit/00000000-0000-0000-0000-000000000000",
    heading: "Platform Admin access required",
    title: "Audit Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/system",
    heading: "Platform Admin access required",
    title: "System Status | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/data",
    heading: "Platform Admin access required",
    title: "Data Health | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/devices",
    heading: "Platform Admin access required",
    title: "Global Devices | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/sync",
    heading: "Platform Admin access required",
    title: "Global Sync | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/history",
    heading: "Platform Admin access required",
    title: "Global History | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/operations",
    heading: "Platform Admin access required",
    title: "Controlled Operations | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/support",
    heading: "Platform Admin access required",
    title: "Support Diagnostics | MerchandiseControl Admin Web",
  },
];

const shopRoute = {
  path: "/shop",
  heading: "Shop Admin access required",
  title: "Shop Admin | MerchandiseControl Admin Web",
};

const protectedShopRoutes = [
  {
    path: "/shop/overview",
    heading: "Shop Admin access required",
    title: "Shop Overview | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/products",
    heading: "Shop Admin access required",
    title: "Products | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/products/product:1",
    heading: "Shop Admin access required",
    title: "Product Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/categories",
    heading: "Shop Admin access required",
    title: "Categories | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/categories/category:1",
    heading: "Shop Admin access required",
    title: "Category Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/suppliers",
    heading: "Shop Admin access required",
    title: "Suppliers | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/suppliers/supplier:1",
    heading: "Shop Admin access required",
    title: "Supplier Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/import-export",
    heading: "Shop Admin access required",
    title: "Import / Export | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/members",
    heading: "Shop Admin access required",
    title: "Members | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/members/00000000-0000-0000-0000-000000000000",
    heading: "Shop Admin access required",
    title: "Member Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/roles",
    heading: "Shop Admin access required",
    title: "Roles | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/staff",
    heading: "Shop Admin access required",
    title: "POS / Staff | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/staff/00000000-0000-0000-0000-000000000000",
    heading: "Shop Admin access required",
    title: "Staff Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/devices",
    heading: "Shop Admin access required",
    title: "Devices | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/devices/00000000-0000-0000-0000-000000000000",
    heading: "Shop Admin access required",
    title: "Device Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/settings",
    heading: "Shop Admin access required",
    title: "Settings | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/history",
    heading: "Shop Admin access required",
    title: "Mobile History | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/history/sync:1",
    heading: "Shop Admin access required",
    title: "History Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/audit",
    heading: "Shop Admin access required",
    title: "Shop Audit | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/audit/00000000-0000-0000-0000-000000000000",
    heading: "Shop Admin access required",
    title: "Audit Event Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/sync",
    heading: "Shop Admin access required",
    title: "Sync Center | MerchandiseControl Admin Web",
  },
];

async function expectAccessState(page: import("@playwright/test").Page) {
  await expect(page.getByRole("main")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Platform sections" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Shop sections" }),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Create shop" })).toHaveCount(0);
}

test.describe("Admin Web smoke", () => {
  test("routes the root entrypoint through server-side access state", async ({
    page,
  }) => {
    await page.goto(entryRoute.path);

    await expectAccessState(page);
    await expect(page).toHaveTitle(entryRoute.title);
    await expect(
      page.getByRole("heading", { level: 1, name: entryRoute.heading }),
    ).toBeVisible();
  });

  for (const route of protectedPlatformRoutes) {
    test(`protects ${route.path}`, async ({ page }) => {
      await page.goto(route.path);

      await expectAccessState(page);
      await expect(page).toHaveTitle(route.title);
      await expect(
        page.getByRole("heading", { level: 1, name: route.heading }),
      ).toBeVisible();
    });
  }

  test("protects the Shop Admin entrypoint", async ({ page }) => {
    await page.goto(shopRoute.path);

    await expectAccessState(page);
    await expect(page).toHaveTitle(shopRoute.title);
    await expect(
      page.getByRole("heading", { level: 1, name: shopRoute.heading }),
    ).toBeVisible();
  });

  for (const route of protectedShopRoutes) {
    test(`protects ${route.path}`, async ({ page }) => {
      await page.goto(route.path);

      await expectAccessState(page);
      await expect(page).toHaveTitle(route.title);
      await expect(
        page.getByRole("heading", { level: 1, name: route.heading }),
      ).toBeVisible();
    });
  }

  test("controlled operations are not exposed without Platform Admin access", async ({
    page,
  }) => {
    await page.goto("/platform/operations");

    await expectAccessState(page);
    await expect(page.getByRole("heading", { name: "Create shop" })).toHaveCount(0);
    await expect(page.getByLabel("Platform status")).toHaveCount(0);
  });

  test("auth login page renders without exposing admin data", async ({ page }) => {
    await page.goto("/auth/login");

    await expect(page).toHaveTitle("Admin Sign In | MerchandiseControl Admin Web");
    await expect(
      page.getByRole("heading", { level: 1, name: "Admin sign in" }),
    ).toBeVisible();
    await expect(page.getByRole("form", { name: "Admin sign in" })).toBeVisible();
    await expect(page.getByText("No service key in browser")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Create shop" })).toHaveCount(0);
  });

  test("access state sign-in link preserves the requested console", async ({
    page,
  }) => {
    await page.goto("/platform");

    const signInLink = page.getByRole("link", { name: "Sign in" });

    if ((await signInLink.count()) > 0) {
      await expect(signInLink).toHaveAttribute("href", "/auth/login?next=/platform");
    } else {
      await expect(page.getByText("Runtime not configured")).toBeVisible();
    }
  });
});
