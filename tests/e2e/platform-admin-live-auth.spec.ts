import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

type ApiKeyEntry = {
  api_key?: string;
  apiKey?: string;
  key?: string;
  key_name?: string;
  name?: string;
  role?: string;
  token?: string;
  type?: string;
  value?: string;
};

function loadEnvFile(path: string) {
  if (!existsSync(path)) {
    return;
  }

  const contents = readFileSync(path, "utf8");

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && value && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readRuntimeEnv() {
  for (const path of [".env.local", ".env.development.local", ".env"]) {
    loadEnvFile(path);
  }

  if (!process.env.SUPABASE_PROJECT_REF && existsSync("supabase/.temp/project-ref")) {
    process.env.SUPABASE_PROJECT_REF = readFileSync(
      "supabase/.temp/project-ref",
      "utf8",
    ).trim();
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_PROJECT_REF
  ) {
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      `https://${process.env.SUPABASE_PROJECT_REF}.supabase.co`;
  }
}

function entryName(entry: ApiKeyEntry) {
  return String(
    entry.name ?? entry.key_name ?? entry.type ?? entry.role ?? "",
  ).toLowerCase();
}

function entryValue(entry: ApiKeyEntry) {
  return (
    entry.api_key ??
    entry.apiKey ??
    entry.key ??
    entry.value ??
    entry.token ??
    ""
  );
}

function resolveServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  }

  if (!process.env.SUPABASE_PROJECT_REF) {
    throw new Error("BLOCKED_MISSING_PROJECT_REF");
  }

  const result = spawnSync(
    "supabase",
    [
      "projects",
      "api-keys",
      "--project-ref",
      process.env.SUPABASE_PROJECT_REF,
      "--output",
      "json",
    ],
    {
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    throw new Error("BLOCKED_API_KEYS_UNAVAILABLE");
  }

  const apiKeys = JSON.parse(result.stdout) as ApiKeyEntry[];
  const serviceKey = apiKeys.find((entry) =>
    /service|secret/.test(entryName(entry)),
  );
  const value = serviceKey ? entryValue(serviceKey) : "";

  if (!value) {
    throw new Error("BLOCKED_SERVICE_ROLE_UNAVAILABLE");
  }

  return value;
}

async function createTemporaryPlatformAdminCredentials() {
  readRuntimeEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = resolveServiceRoleKey();

  if (!supabaseUrl) {
    throw new Error("BLOCKED_SUPABASE_URL_UNAVAILABLE");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const nonce = `${Date.now()}-${randomBytes(6).toString("hex")}`;
  const email = `task005k-${nonce}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  const { data: createdUser, error: createError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  const userId = createdUser.user?.id;

  if (createError || !userId) {
    throw new Error("BLOCKED_DEV_TEST_USER_CREATE_FAILED");
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      display_name: "Platform Admin Live Test",
      profile_id: userId,
      profile_status: "active",
    },
    { onConflict: "profile_id" },
  );

  if (profileError) {
    await supabase.auth.admin.deleteUser(userId);
    throw new Error("BLOCKED_DEV_TEST_PROFILE_CREATE_FAILED");
  }

  const { data: existingAdmin, error: existingAdminError } = await supabase
    .from("platform_admins")
    .select("platform_admin_id")
    .eq("profile_id", userId)
    .eq("status", "active")
    .is("revoked_at", null)
    .maybeSingle();

  if (existingAdminError) {
    await supabase.auth.admin.deleteUser(userId);
    throw new Error("BLOCKED_DEV_TEST_ADMIN_LOOKUP_FAILED");
  }

  if (!existingAdmin) {
    const { error: adminInsertError } = await supabase
      .from("platform_admins")
      .insert({
        profile_id: userId,
        reason_redacted: "TASK-005K temporary live browser gate user.",
        status: "active",
      });

    if (adminInsertError) {
      await supabase.auth.admin.deleteUser(userId);
      throw new Error("BLOCKED_DEV_TEST_ADMIN_CREATE_FAILED");
    }
  }

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor_profile_id: null,
    event_key: "platform_admin.live_browser_test.bootstrap",
    metadata_redacted: {
      mode: "temporary_dev_test_user",
      source: "tests/e2e/platform-admin-live-auth.spec.ts",
    },
    result: "success",
    scope: "global",
    severity: "warning",
    target_id: userId,
    target_type: "platform_admin",
  });

  if (auditError) {
    await supabase.auth.admin.deleteUser(userId);
    throw new Error("BLOCKED_DEV_TEST_AUDIT_CREATE_FAILED");
  }

  return {
    cleanup: async () => {
      await supabase.auth.admin.deleteUser(userId);
    },
    email,
    password,
    supabase,
    userId,
  };
}

async function createTemporaryShopAdminFixture() {
  const credentials = await createTemporaryPlatformAdminCredentials();
  const nonce = randomBytes(5).toString("hex").toUpperCase();
  const shopCode = `TASK014QA_${nonce}`;
  const shopName = `Authenticated QA Shop ${nonce}`;

  const { data: createdShop, error: shopError } = await credentials.supabase
    .from("shops")
    .insert({
      created_by_profile_id: credentials.userId,
      shop_code: shopCode,
      shop_name: shopName,
      shop_status: "active",
      status_changed_by_profile_id: credentials.userId,
    })
    .select("shop_id")
    .single();

  const shopId = createdShop?.shop_id;

  if (shopError || !shopId) {
    await credentials.cleanup();
    throw new Error("BLOCKED_DEV_TEST_SHOP_CREATE_FAILED");
  }

  const { error: membershipError } = await credentials.supabase
    .from("shop_members")
    .insert({
      invited_by_profile_id: credentials.userId,
      membership_status: "active",
      profile_id: credentials.userId,
      role_key: "shop_owner",
      shop_id: shopId,
    });

  if (membershipError) {
    await credentials.supabase.from("shops").delete().eq("shop_id", shopId);
    await credentials.cleanup();
    throw new Error("BLOCKED_DEV_TEST_SHOP_MEMBER_CREATE_FAILED");
  }

  return {
    ...credentials,
    cleanup: async () => {
      const membershipDelete = await credentials.supabase
        .from("shop_members")
        .delete()
        .eq("shop_id", shopId)
        .eq("profile_id", credentials.userId);
      const shopDelete = await credentials.supabase
        .from("shops")
        .delete()
        .eq("shop_id", shopId);

      await credentials.cleanup();

      if (membershipDelete.error || shopDelete.error) {
        throw new Error("BLOCKED_DEV_TEST_SHOP_FIXTURE_CLEANUP_FAILED");
      }
    },
    shopCode,
    shopId,
    shopName,
  };
}

async function signInWithCredentials(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);

  await Promise.all([
    page.waitForURL(/\/platform$/, { timeout: 15_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]).catch(() => {
    throw new Error("BLOCKED_BROWSER_SIGN_IN_FAILED");
  });
}

async function expectAuthorizedReadOnlyPlatform(
  page: import("@playwright/test").Page,
  allowedHeaderStatus = "Read-only",
  shellStatus = "Read-only",
) {
  const pageHeader = page.locator(
    'section[aria-labelledby="platform-page-title"]',
  );

  await expect(
    pageHeader.getByText(allowedHeaderStatus, { exact: true }),
  ).toBeVisible();
  await expect(pageHeader.getByText("Not configured", { exact: true })).toHaveCount(0);
  await expect(pageHeader.getByText("Unauthorized", { exact: true })).toHaveCount(0);
  await expect(page.getByText("No fallback mock rows are rendered")).toHaveCount(0);
  await expect(
    page
      .getByLabel("Platform status")
      .getByText(shellStatus, { exact: true }),
  ).toBeVisible();
}

test.describe("Platform Admin live auth gate", () => {
  test.skip(
    process.env.CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST !== "yes",
    "Set CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST=yes to run the live Supabase browser gate.",
  );

  test("uses a real Platform Admin session for read-only pages", async ({
    baseURL,
    page,
  }) => {
    if (!baseURL) {
      throw new Error("BLOCKED_BASE_URL_UNAVAILABLE");
    }

    await page.goto("/auth/login");
    await expect(
      page.getByRole("heading", { level: 1, name: "Admin sign in" }),
    ).toBeVisible();

    const credentials = await createTemporaryPlatformAdminCredentials();

    try {
      await signInWithCredentials(page, credentials.email, credentials.password);
      await expect(page.getByRole("heading", { level: 1, name: "Platform Overview" })).toBeVisible();
      await expectAuthorizedReadOnlyPlatform(page);
      await expect(page.getByText("Visible through Platform Admin")).toBeVisible();

      for (const route of ["/platform/users", "/platform/shops", "/platform/audit"]) {
        await page.goto(route);
        await expectAuthorizedReadOnlyPlatform(page);
      }

      await page.goto("/platform/operations");
      await expectAuthorizedReadOnlyPlatform(
        page,
        "Live actions",
        "Controlled actions",
      );
      await expect(page.getByRole("heading", { name: "Create shop" })).toBeVisible();

      await page.goto("/auth/logout");
      await page.goto("/platform");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Platform Admin access required",
        }),
      ).toBeVisible();
    } finally {
      await credentials.cleanup();
    }
  });

  test("uses a real session for Platform and Shop authenticated screenshots", async ({
    page,
  }) => {
    await page.goto("/auth/login");
    const fixture = await createTemporaryShopAdminFixture();

    try {
      await signInWithCredentials(page, fixture.email, fixture.password);

      await page.goto("/platform");
      await expect(
        page.getByRole("heading", { level: 1, name: "Platform Overview" }),
      ).toBeVisible();
      await expectAuthorizedReadOnlyPlatform(page);
      await page.screenshot({
        fullPage: true,
        path: "docs/TASKS/EVIDENCE/TASK-014/browser-platform-authenticated.png",
      });

      await page.goto("/platform/users");
      await expectAuthorizedReadOnlyPlatform(page);

      await page.goto(`/shop?shop_id=${fixture.shopId}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Shop Overview" }),
      ).toBeVisible();

      await page.goto(`/shop/overview?shop_id=${fixture.shopId}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Shop Overview" }),
      ).toBeVisible();
      await expect(
        page
          .getByLabel("Shop Overview status")
          .getByText(fixture.shopCode, { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: "docs/TASKS/EVIDENCE/TASK-014/browser-shop-overview-authenticated.png",
      });

      await page.goto(`/shop/staff?shop_id=${fixture.shopId}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "POS / Staff" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Staff credential-safe read model" }),
      ).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: "docs/TASKS/EVIDENCE/TASK-014/browser-shop-staff-authenticated.png",
      });

      await page.goto(`/shop/products?shop_id=${fixture.shopId}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Products" }),
      ).toBeVisible();

      await page.goto("/auth/logout");
      await page.goto("/shop");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Shop Admin access required",
        }),
      ).toBeVisible();
    } finally {
      await fixture.cleanup();
    }
  });

  test("runs TASK-006 controlled shop actions on synthetic data", async ({
    page,
  }) => {
    test.skip(
      process.env.CONFIRM_PLATFORM_ADMIN_TASK006_LIVE_TEST !== "yes",
      "Set CONFIRM_PLATFORM_ADMIN_TASK006_LIVE_TEST=yes to run TASK-006 controlled actions.",
    );

    await page.goto("/auth/login");
    const credentials = await createTemporaryPlatformAdminCredentials();
    const nonce = Date.now().toString(36).toUpperCase();
    const shopCode = `TASK006_TEST_${nonce}`;
    const shopName = `TASK006_TEST Shop ${nonce}`;

    try {
      await signInWithCredentials(page, credentials.email, credentials.password);
      await page.goto("/platform/operations");
      await expectAuthorizedReadOnlyPlatform(
        page,
        "Live actions",
        "Controlled actions",
      );

      const createSection = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: "Create shop" }) });
      await createSection.getByLabel("Shop name").fill(shopName);
      await createSection.getByLabel("Shop code").fill(shopCode);
      await createSection.getByLabel("Initial owner").selectOption(credentials.userId);
      await createSection.getByLabel("Reason").fill("TASK-006 live create synthetic shop.");
      await createSection.getByRole("button", { name: "Create shop" }).click();
      await expect(page.getByRole("heading", { name: shopName })).toBeVisible({
        timeout: 15_000,
      });

      const createdShop = await credentials.supabase
        .from("shops")
        .select("shop_id,shop_status")
        .eq("shop_code", shopCode)
        .maybeSingle();

      if (createdShop.error || !createdShop.data) {
        throw new Error("BLOCKED_TASK006_SHOP_CREATE_VERIFY_FAILED");
      }

      const shopId = createdShop.data.shop_id;

      const createdMembership = await credentials.supabase
        .from("shop_members")
        .select("shop_member_id")
        .eq("shop_id", shopId)
        .eq("profile_id", credentials.userId)
        .eq("role_key", "shop_owner")
        .eq("membership_status", "active")
        .maybeSingle();

      if (createdMembership.error || !createdMembership.data) {
        throw new Error("BLOCKED_TASK006_OWNER_MEMBERSHIP_VERIFY_FAILED");
      }

      let shopArticle = page.locator("article").filter({ hasText: shopCode });
      await shopArticle
        .locator("form")
        .nth(0)
        .getByLabel("Reason")
        .fill("TASK-006 live suspend synthetic shop.");
      await shopArticle.getByLabel("Type shop code to suspend").fill(shopCode);
      await shopArticle.getByRole("button", { name: "Suspend shop" }).click();
      await expect(shopArticle.getByText("Suspended")).toBeVisible({
        timeout: 15_000,
      });

      shopArticle = page.locator("article").filter({ hasText: shopCode });
      await shopArticle
        .locator("form")
        .nth(1)
        .getByLabel("Reason")
        .fill("TASK-006 live reactivate synthetic shop.");
      await shopArticle.getByLabel("Type shop code to reactivate").fill(shopCode);
      await shopArticle.getByRole("button", { name: "Reactivate shop" }).click();
      await expect(shopArticle.getByText("Active")).toBeVisible({
        timeout: 15_000,
      });

      shopArticle = page.locator("article").filter({ hasText: shopCode });
      await shopArticle
        .locator("form")
        .nth(2)
        .getByLabel("Reason")
        .fill("TASK-006 live archive synthetic shop.");
      await shopArticle.getByLabel("Type shop code to archive").fill(shopCode);
      await shopArticle.getByRole("button", { name: "Soft delete shop" }).click();
      await expect(shopArticle.getByText("Archived")).toBeVisible({
        timeout: 15_000,
      });

      const archivedShop = await credentials.supabase
        .from("shops")
        .select("shop_status")
        .eq("shop_id", shopId)
        .maybeSingle();

      if (archivedShop.error || archivedShop.data?.shop_status !== "archived") {
        throw new Error("BLOCKED_TASK006_ARCHIVE_VERIFY_FAILED");
      }

      const auditEvents = await credentials.supabase
        .from("audit_logs")
        .select("event_key")
        .eq("shop_id", shopId)
        .in("event_key", [
          "platform.shop.create.success",
          "platform.shop.suspend.success",
          "platform.shop.reactivate.success",
          "platform.shop.soft_delete.success",
        ]);

      if (auditEvents.error || (auditEvents.data ?? []).length < 4) {
        throw new Error("BLOCKED_TASK006_AUDIT_VERIFY_FAILED");
      }

      await page.goto("/auth/logout");
      await page.goto("/platform/operations");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Platform Admin access required",
        }),
      ).toBeVisible();
    } finally {
      await credentials.cleanup();
    }
  });
});
