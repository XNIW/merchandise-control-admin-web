import { expect, test } from "@playwright/test";

const entryRoute = {
  path: "/",
  heading: "Console access",
  title: "Console Access | MerchandiseControl Admin Web",
};

const protectedPlatformRoutes = [
  {
    path: "/platform",
    heading: "Master Console access required",
    title: "Platform Overview | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/users",
    heading: "Master Console access required",
    title: "Users / Profiles | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/users/00000000-0000-0000-0000-000000000000",
    heading: "Master Console access required",
    title: "User Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/shops",
    heading: "Master Console access required",
    title: "Shops | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/shops/new",
    heading: "Master Console access required",
    title: "Provision Shop | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/shops/00000000-0000-0000-0000-000000000000",
    heading: "Master Console access required",
    title: "Shop Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/provisioning",
    heading: "Master Console access required",
    title: "Provisioning | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/admins",
    heading: "Master Console access required",
    title: "Platform Admins | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/audit",
    heading: "Master Console access required",
    title: "Audit | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/audit/00000000-0000-0000-0000-000000000000",
    heading: "Master Console access required",
    title: "Audit Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/system",
    heading: "Master Console access required",
    title: "System Status | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/data",
    heading: "Master Console access required",
    title: "Data Health | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/devices",
    heading: "Master Console access required",
    title: "Device Signals | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/sync",
    heading: "Master Console access required",
    title: "Sync Signals | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/history",
    heading: "Master Console access required",
    title: "Global History | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/operations",
    heading: "Master Console access required",
    title: "Controlled Operations | MerchandiseControl Admin Web",
  },
  {
    path: "/platform/support",
    heading: "Master Console access required",
    title: "Support Diagnostics | MerchandiseControl Admin Web",
  },
];

const shopRoute = {
  path: "/shop",
  heading: "Admin Console access required",
  title: "Admin Console | MerchandiseControl Admin Web",
};

const protectedShopRoutes = [
  {
    path: "/shop/overview",
    heading: "Admin Console access required",
    title: "Shop Overview | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/products",
    heading: "Admin Console access required",
    title: "Products | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/products/product:1",
    heading: "Admin Console access required",
    title: "Product Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/categories",
    heading: "Admin Console access required",
    title: "Categories | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/categories/category:1",
    heading: "Admin Console access required",
    title: "Category Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/suppliers",
    heading: "Admin Console access required",
    title: "Suppliers | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/suppliers/supplier:1",
    heading: "Admin Console access required",
    title: "Supplier Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/import-export",
    heading: "Admin Console access required",
    title: "Import / Export | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/members",
    heading: "Admin Console access required",
    title: "Members | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/members/00000000-0000-0000-0000-000000000000",
    heading: "Admin Console access required",
    title: "Member Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/roles",
    heading: "Admin Console access required",
    title: "Roles | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/staff",
    heading: "Admin Console access required",
    title: "POS / Staff | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/staff/00000000-0000-0000-0000-000000000000",
    heading: "Admin Console access required",
    title: "Staff Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/devices",
    heading: "Admin Console access required",
    title: "Devices | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/devices/00000000-0000-0000-0000-000000000000",
    heading: "Admin Console access required",
    title: "Device Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/settings",
    heading: "Admin Console access required",
    title: "Settings | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/history",
    heading: "Admin Console access required",
    title: "Mobile History | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/history/sync:1",
    heading: "Admin Console access required",
    title: "History Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/audit",
    heading: "Admin Console access required",
    title: "Shop Audit | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/audit/00000000-0000-0000-0000-000000000000",
    heading: "Admin Console access required",
    title: "Audit Event Detail | MerchandiseControl Admin Web",
  },
  {
    path: "/shop/sync",
    heading: "Admin Console access required",
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
  test("renders the root console selection without exposing admin data", async ({
    page,
  }) => {
    await page.goto(entryRoute.path);

    await expectAccessState(page);
    await expect(page).toHaveTitle(entryRoute.title);
    await expect(
      page.getByRole("heading", { level: 1, name: entryRoute.heading }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Master Console" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Admin Console" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Master Console" })).toHaveAttribute(
      "href",
      "/auth/login?next=/platform",
    );
    await expect(page.getByRole("link", { name: "Use Admin account" })).toHaveAttribute(
      "href",
      "/auth/login?next=/shop",
    );
    await expect(page.getByRole("link", { name: "Use Shop code" })).toHaveAttribute(
      "href",
      "/shop/staff-login",
    );
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

    await expect(page).toHaveTitle("Admin Account Sign In | MerchandiseControl Admin Web");
    await expect(
      page.getByRole("heading", { level: 1, name: "Admin account sign in" }),
    ).toBeVisible();
    await expect(page.getByRole("form", { name: "Admin account sign in" })).toBeVisible();
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
