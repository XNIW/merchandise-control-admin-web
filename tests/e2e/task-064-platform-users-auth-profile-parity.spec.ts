import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "@/lib/supabase/database.types";

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

type SupabaseAdminClient = SupabaseClient<Database>;

const runId = `task064-${Date.now()}-${randomUUID().slice(0, 8)}`;
const adminEmail = `${runId}-admin@example.test`;
const profileOkEmail = `${runId}-profile-ok@example.test`;
const shopAdminEmail = `${runId}-shop-admin@example.test`;
const historicalShopAdminEmail = `${runId}-historical-shop-admin@example.test`;
const authOnlyEmail = `${runId}-auth-only@example.test`;
const adminPassword = `Task064-${randomUUID()}-Aa1!`;
const profileOkDisplayName = "TASK064 Profile OK";
const shopAdminDisplayName = "TASK064 Shop Admin";
const historicalShopAdminDisplayName = "TASK064 Historical Shop Admin";
const authOnlyDisplayName = "TASK064 Auth Only";
const shopCode = `T64${Date.now().toString().slice(-8)}`;
const historicalShopCode = `H64${Date.now().toString().slice(-8)}`;
const TASK073_EVIDENCE_DIR = "docs/TASKS/EVIDENCE/TASK-073";

const createdAuthUserIds = new Set<string>();
const createdShopIds = new Set<string>();
let authOnlyUserId = "";
let profileOkUserId = "";
let shopId = "";

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`BLOCKED_ENV_REQUIRED: ${name}`);
  }

  return value;
}

function createAdminClient(): SupabaseAdminClient {
  return createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: {
        headers: {
          "X-Client-Info": "merchandise-control-admin-web/task064-e2e",
        },
      },
    },
  );
}

async function expectOk<T>(
  label: string,
  resultPromise: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  options: { allowNull?: boolean } = {},
) {
  const result = await resultPromise;

  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }

  if (result.data === null && !options.allowNull) {
    throw new Error(`${label}: missing data`);
  }

  return result.data as T;
}

async function createAuthUser(input: {
  displayName: string;
  email: string;
  password?: string;
  supabase: SupabaseAdminClient;
}) {
  const { data, error } = await input.supabase.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
    password: input.password ?? `Task064-${randomUUID()}-Aa1!`,
    user_metadata: {
      name: input.displayName,
      source: "TASK064_platform_users_auth_profile_parity",
    },
  });

  if (error || !data.user?.id) {
    throw new Error(
      `BLOCKED_AUTH_CREATE_FAILED: ${error?.message ?? "missing user"}`,
    );
  }

  createdAuthUserIds.add(data.user.id);

  return data.user.id;
}

async function expectMutationOk(
  label: string,
  resultPromise: PromiseLike<{ error: { message: string } | null }>,
) {
  const result = await resultPromise;

  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
}

async function task064AuthUserIds(supabase: SupabaseAdminClient) {
  const userIds = new Set(createdAuthUserIds);
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      throw new Error(`BLOCKED_TASK064_AUTH_CLEANUP_LIST_FAILED: ${error.message}`);
    }

    for (const user of data.users) {
      const email = user.email ?? "";
      const metadataSource =
        typeof user.user_metadata?.source === "string"
          ? user.user_metadata.source
          : "";
      const isTask064Email =
        email.startsWith("task064-") && email.endsWith("@example.test");

      if (
        isTask064Email ||
        metadataSource === "TASK064_platform_users_auth_profile_parity"
      ) {
        userIds.add(user.id);
      }
    }

    if (page >= data.lastPage || data.users.length === 0) {
      break;
    }

    page += 1;
  }

  return Array.from(userIds);
}

async function task064ShopIds(supabase: SupabaseAdminClient) {
  const shopIds = new Set(createdShopIds);
  const { data, error } = await supabase
    .from("shops")
    .select("shop_id")
    .in("shop_name", ["TASK064 Search Shop", "TASK064 Historical Shop"]);

  if (error) {
    throw new Error(`BLOCKED_TASK064_SHOP_CLEANUP_LIST_FAILED: ${error.message}`);
  }

  for (const shop of data ?? []) {
    shopIds.add(shop.shop_id);
  }

  return Array.from(shopIds);
}

async function cleanup() {
  const supabase = createAdminClient();
  const shopIds = await task064ShopIds(supabase);
  const userIds = await task064AuthUserIds(supabase);

  for (const shopId of shopIds) {
    await expectMutationOk(
      "BLOCKED_TASK064_SHOP_MEMBER_CLEANUP_FAILED",
      supabase.from("shop_members").delete().eq("shop_id", shopId),
    );
    await expectMutationOk(
      "BLOCKED_TASK064_SHOP_CLEANUP_FAILED",
      supabase.from("shops").delete().eq("shop_id", shopId),
    );
  }

  for (const userId of userIds) {
    await expectMutationOk(
      "BLOCKED_TASK064_PLATFORM_ADMIN_CLEANUP_FAILED",
      supabase.from("platform_admins").delete().eq("profile_id", userId),
    );
    await expectMutationOk(
      "BLOCKED_TASK064_PROFILE_MEMBER_CLEANUP_FAILED",
      supabase.from("shop_members").delete().eq("profile_id", userId),
    );
    await expectMutationOk(
      "BLOCKED_TASK064_AUTH_CLEANUP_FAILED",
      supabase.auth.admin.deleteUser(userId),
    );
    await expectMutationOk(
      "BLOCKED_TASK064_PROFILE_CLEANUP_FAILED",
      supabase.from("profiles").delete().eq("profile_id", userId),
    );
  }

  await expectMutationOk(
    "BLOCKED_TASK064_DISPLAY_PROFILE_CLEANUP_FAILED",
    supabase
      .from("profiles")
      .delete()
      .in("display_name", [
        "TASK064 Platform Admin",
        profileOkDisplayName,
        shopAdminDisplayName,
        historicalShopAdminDisplayName,
        authOnlyDisplayName,
      ]),
  );
}

test.beforeAll(async () => {
  test.skip(
    process.env.CONFIRM_TASK064_PLATFORM_USERS_TEST !== "yes",
    "Set CONFIRM_TASK064_PLATFORM_USERS_TEST=yes to run TASK-064 local users E2E.",
  );
  expect(process.env.TEST_TARGET).toBe("local");

  await cleanup();

  const supabase = createAdminClient();
  const adminUserId = await createAuthUser({
    displayName: "TASK064 Platform Admin",
    email: adminEmail,
    password: adminPassword,
    supabase,
  });
  profileOkUserId = await createAuthUser({
    displayName: profileOkDisplayName,
    email: profileOkEmail,
    supabase,
  });
  const shopAdminUserId = await createAuthUser({
    displayName: shopAdminDisplayName,
    email: shopAdminEmail,
    supabase,
  });
  const historicalShopAdminUserId = await createAuthUser({
    displayName: historicalShopAdminDisplayName,
    email: historicalShopAdminEmail,
    supabase,
  });
  authOnlyUserId = await createAuthUser({
    displayName: authOnlyDisplayName,
    email: authOnlyEmail,
    supabase,
  });

  await expectOk<{ profile_id: string }>(
    "BLOCKED_TRIGGER_PROFILE_ADMIN_MISSING",
    supabase
      .from("profiles")
      .select("profile_id")
      .eq("profile_id", adminUserId)
      .single(),
  );
  await expectOk<{ profile_id: string }>(
    "BLOCKED_TRIGGER_PROFILE_TARGET_MISSING",
    supabase
      .from("profiles")
      .select("profile_id")
      .eq("profile_id", profileOkUserId)
      .single(),
  );
  await expectOk<{ profile_id: string }>(
    "BLOCKED_TRIGGER_PROFILE_SHOP_ADMIN_MISSING",
    supabase
      .from("profiles")
      .select("profile_id")
      .eq("profile_id", shopAdminUserId)
      .single(),
  );
  await expectOk<{ profile_id: string }>(
    "BLOCKED_TRIGGER_PROFILE_HISTORICAL_SHOP_ADMIN_MISSING",
    supabase
      .from("profiles")
      .select("profile_id")
      .eq("profile_id", historicalShopAdminUserId)
      .single(),
  );

  await expectOk<null>(
    "BLOCKED_PLATFORM_ADMIN_CREATE_FAILED",
    supabase.from("platform_admins").insert({
      profile_id: adminUserId,
      reason_redacted: "TASK064 local users auth/profile parity E2E.",
      status: "active",
    }),
    { allowNull: true },
  );

  const shop = await expectOk<{ shop_id: string }>(
    "BLOCKED_SHOP_CREATE_FAILED",
    supabase
      .from("shops")
      .insert({
        created_by_profile_id: adminUserId,
        shop_code: shopCode,
        shop_name: "TASK064 Search Shop",
        shop_status: "active",
      })
      .select("shop_id")
      .single(),
  );

  createdShopIds.add(shop.shop_id);
  shopId = shop.shop_id;

  const historicalShop = await expectOk<{ shop_id: string }>(
    "BLOCKED_HISTORICAL_SHOP_CREATE_FAILED",
    supabase
      .from("shops")
      .insert({
        archived_at: new Date().toISOString(),
        archived_by_profile_id: adminUserId,
        created_by_profile_id: adminUserId,
        shop_code: historicalShopCode,
        shop_name: "TASK064 Historical Shop",
        shop_status: "archived",
      })
      .select("shop_id")
      .single(),
  );

  createdShopIds.add(historicalShop.shop_id);

  await expectOk<null>(
    "BLOCKED_SHOP_MEMBER_CREATE_FAILED",
    supabase.from("shop_members").insert({
      profile_id: shopAdminUserId,
      role_key: "shop_owner",
      shop_id: shop.shop_id,
    }),
    { allowNull: true },
  );

  await expectOk<null>(
    "BLOCKED_HISTORICAL_SHOP_MEMBER_CREATE_FAILED",
    supabase.from("shop_members").insert({
      profile_id: historicalShopAdminUserId,
      role_key: "shop_manager",
      shop_id: historicalShop.shop_id,
    }),
    { allowNull: true },
  );

  await expectOk<null>(
    "BLOCKED_AUTH_ONLY_PROFILE_DELETE_FAILED",
    supabase.from("profiles").delete().eq("profile_id", authOnlyUserId),
    { allowNull: true },
  );
});

test.afterAll(async () => {
  await cleanup();
});

async function signInPlatformAdmin(page: Page) {
  await page.goto("/auth/login?next=/platform");
  await expect(
    page.getByRole("heading", { level: 1, name: "Master Console sign in" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(adminPassword);
  await Promise.all([
    page.waitForFunction(() => window.location.pathname === "/platform"),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
  await page.goto("/platform/users");
  await expect(
    page.getByRole("heading", { level: 1, name: "Personal Accounts" }),
  ).toBeVisible();
}

async function submitServerSearch(
  page: Page,
  query: string,
  expectedUrl: RegExp = /\/platform\/users\?q=/,
) {
  await page.getByLabel("Search").fill(query);
  await Promise.all([
    page.waitForURL(expectedUrl),
    page.getByRole("button", { name: "Search" }).click(),
  ]);
}

test("TASK-064 separates normal users, shop admins, and auth-only accounts", async ({
  page,
}) => {
  const supabase = createAdminClient();
  const { data: authOnlyProfile } = await supabase
    .from("profiles")
    .select("profile_id")
    .eq("display_name", authOnlyDisplayName)
    .maybeSingle();
  const { data: profileOkProfile } = await supabase
    .from("profiles")
    .select("profile_id")
    .eq("display_name", profileOkDisplayName)
    .single();

  expect(authOnlyProfile).toBeNull();
  const profileOkProfileId = profileOkProfile?.profile_id;

  expect(profileOkProfileId).toBeTruthy();

  if (!profileOkProfileId) {
    throw new Error("BLOCKED_PROFILE_OK_ID_MISSING");
  }

  await signInPlatformAdmin(page);

  await submitServerSearch(page, adminEmail);
  await expect(page.getByText("Data status").first()).toBeVisible();
  await expect(page.getByText(adminEmail).first()).toBeVisible();
  await expect(
    page.getByText("Platform Admin / Master Console").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { exact: true, name: "Open Platform Admins" }),
  ).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: `${TASK073_EVIDENCE_DIR}/browser-platform-users-account-identity.png`,
  });
  await page.goto("/platform/admins");
  await expect(page.getByText(adminEmail).first()).toBeVisible();
  await expect(page.getByText("Platform Admin (Master Console)").first()).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: `${TASK073_EVIDENCE_DIR}/browser-platform-admins-account-identity.png`,
  });
  await page.goto("/platform/users");

  await submitServerSearch(page, profileOkEmail);
  await expect(page.getByText(profileOkEmail).first()).toBeVisible();
  await expect(page.getByText("No mobile data").first()).toBeVisible();
  await expect(
    page
      .getByRole("button", {
        name: new RegExp(profileOkEmail),
      })
      .first(),
  ).toBeVisible();

  await submitServerSearch(page, profileOkProfileId);
  await expect(page.getByText(profileOkDisplayName).first()).toBeVisible();

  await page.goto("/platform/shop-admins");
  await expect(page.getByRole("heading", { level: 1, name: "Shop Admins" })).toBeVisible();
  await submitServerSearch(page, shopAdminEmail, /\/platform\/shop-admins\?q=/);
  await expect(page.getByText(shopAdminEmail).first()).toBeVisible();
  await expect(
    page
      .getByRole("button", {
        name: new RegExp(shopAdminEmail),
      })
      .first(),
  ).toBeVisible();
  await expect(page.getByText(shopCode).first()).toBeVisible();
  await expect(page.getByText("Owner").first()).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: `${TASK073_EVIDENCE_DIR}/browser-platform-shop-admins-account-identity.png`,
  });

  await submitServerSearch(
    page,
    historicalShopAdminEmail,
    /\/platform\/shop-admins\?q=/,
  );
  await expect(page.getByText(historicalShopAdminEmail).first()).toBeVisible();
  await expect(page.getByText(historicalShopAdminDisplayName).first()).toBeVisible();
  await expect(page.getByText(historicalShopCode).first()).toBeVisible();
  await expect(page.getByText("Historical only").first()).toBeVisible();
  await expect(page.getByText("Manager").first()).toBeVisible();

  await page.goto("/platform/users");
  await expect(
    page.getByRole("heading", { level: 1, name: "Personal Accounts" }),
  ).toBeVisible();

  await submitServerSearch(page, historicalShopAdminEmail);
  await expect(page.getByText(historicalShopAdminEmail).first()).toBeVisible();
  await expect(page.getByText(historicalShopAdminDisplayName).first()).toBeVisible();
  await expect(page.getByText("Shop Admin").first()).toBeVisible();

  await submitServerSearch(page, authOnlyEmail);
  await expect(page.getByText(authOnlyEmail).first()).toBeVisible();
  await expect(page.getByText(authOnlyDisplayName).first()).toBeVisible();
  await expect(page.getByText("Auth only").first()).toBeVisible();

  await page.getByLabel("Account type").selectOption("Normal account");
  await expect(
    page.getByText("No normal accounts match this filter").first(),
  ).toBeVisible();
  await expect(
    page.getByText(
      "No normal accounts match this filter. Platform Admins are hidden by this filter.",
    ),
  ).toBeVisible();
  await page.getByLabel("Account type").selectOption("");

  await submitServerSearch(page, authOnlyDisplayName);
  await expect(page.getByText(authOnlyEmail).first()).toBeVisible();

  const authOnlyRow = page
    .getByRole("button", { name: new RegExp(authOnlyDisplayName) })
    .first();

  await authOnlyRow.click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"))
    .toBe(authOnlyDisplayName);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("selected"))
    .toBe(authOnlyUserId);

  const inspector = page.locator("aside").filter({ hasText: authOnlyDisplayName });

  await expect(inspector.getByText("Auth only").first()).toBeVisible();
  await expect(inspector.getByText(authOnlyEmail).first()).toBeVisible();
  await expect(
    inspector.getByText(/Mobile (inventory data|data \/ linked shop)/).first(),
  ).toBeVisible();
  await expect(inspector.getByText("No mobile data").first()).toBeVisible();

  await Promise.all([
    page.waitForURL(new RegExp(`/platform/users/${authOnlyUserId}`)),
    inspector.getByRole("link", { name: "Open full detail" }).click(),
  ]);

  await expect(page.getByRole("heading", { level: 1, name: authOnlyDisplayName })).toBeVisible();
  await expect(page.getByText("Auth only").first()).toBeVisible();
  await expect(page.getByText(authOnlyEmail).first()).toBeVisible();
  await expect(
    page.getByText(/Mobile (inventory data|data \/ linked shop)/).first(),
  ).toBeVisible();
  await expect(page.getByText("No mobile data").first()).toBeVisible();

  const backHref = await page
    .getByRole("link", { name: "Back to Users" })
    .getAttribute("href");

  expect(backHref).toMatch(/^\/platform\/users\?/);

  await page.goto(backHref ?? "/platform/users");
  await expect.poll(() => new URL(page.url()).pathname).toBe("/platform/users");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"))
    .toBe(authOnlyDisplayName);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("selected"))
    .toBe(authOnlyUserId);
  await expect(page.getByText(authOnlyDisplayName).first()).toBeVisible();

  await submitServerSearch(page, `${runId}-missing-user`);
  await expect(page.getByText("No matching rows")).toBeVisible();
  await expect(
    page.getByText("Client filters are hiding rows returned by the server boundary."),
  ).toBeVisible();

  await page.goto("/platform/admins");
  const currentAccount = page.getByRole("region", {
    name: "Current Platform Admin account",
  });
  await expect(currentAccount).toBeVisible();
  await expect(currentAccount.getByText(adminEmail)).toBeVisible();
  await expect(currentAccount.getByText("Current session")).toBeVisible();
  await expect(
    currentAccount.getByText("Platform Admin (Master Console)"),
  ).toBeVisible();
  await expect(page.getByText("Current account").first()).toBeVisible();

  expect(shopId).toBeTruthy();
  await page.goto(`/platform/shops/${shopId}`);
  await expect(page.getByText(shopCode).first()).toBeVisible();
  await expect(page.getByText("Admin access / Ownership").first()).toBeVisible();
  await expect(page.getByText(shopAdminEmail).first()).toBeVisible();
  await expect(page.getByText("Email").first()).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: `${TASK073_EVIDENCE_DIR}/browser-platform-shop-detail-ownership-account-identity.png`,
  });
});
