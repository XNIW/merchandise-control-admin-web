import { expect, test } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

type OwnerProfile = {
  displayName: string;
  email: string;
  emailConfirmed: boolean;
  isPlatformAdmin: boolean;
  profileId: string;
  profileStatus: string;
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

function createServiceClient() {
  readRuntimeEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = resolveServiceRoleKey();

  if (!supabaseUrl) {
    throw new Error("BLOCKED_SUPABASE_URL_UNAVAILABLE");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function findOwnerByEmail(
  supabase: SupabaseClient,
  ownerEmail: string,
): Promise<OwnerProfile> {
  const users = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (users.error) {
    throw new Error("BLOCKED_TASK011_AUTH_USERS_UNAVAILABLE");
  }

  const matches = users.data.users.filter(
    (user) => user.email?.toLowerCase() === ownerEmail.toLowerCase(),
  );

  if (matches.length !== 1) {
    throw new Error("BLOCKED_TASK011_OWNER_EMAIL_NOT_UNIQUE");
  }

  const ownerUser = matches[0];
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("profile_id,display_name,profile_status")
    .eq("profile_id", ownerUser.id)
    .maybeSingle();

  if (profileError || !profile) {
    throw new Error("BLOCKED_TASK011_OWNER_PROFILE_MISSING");
  }

  const { data: platformAdminRows, error: platformAdminError } = await supabase
    .from("platform_admins")
    .select("platform_admin_id")
    .eq("profile_id", ownerUser.id)
    .eq("status", "active")
    .is("revoked_at", null);

  if (platformAdminError) {
    throw new Error("BLOCKED_TASK011_PLATFORM_ADMIN_LOOKUP_FAILED");
  }

  return {
    displayName: profile.display_name,
    email: ownerEmail,
    emailConfirmed: Boolean(ownerUser.email_confirmed_at),
    isPlatformAdmin: (platformAdminRows ?? []).length > 0,
    profileId: profile.profile_id,
    profileStatus: profile.profile_status,
  };
}

async function signInWithMagicLink(
  page: import("@playwright/test").Page,
  supabase: SupabaseClient,
  ownerEmail: string,
  baseURL: string,
  nextPath: string,
) {
  const { data, error } = await supabase.auth.admin.generateLink({
    email: ownerEmail,
    type: "magiclink",
  });

  const emailOtp = data?.properties?.email_otp;

  if (error || !emailOtp) {
    throw new Error("BLOCKED_TASK011_MAGIC_LINK_UNAVAILABLE");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const cookiesToSet: {
    name: string;
    options: {
      httpOnly?: boolean;
      sameSite?: boolean | "lax" | "none" | "strict";
      secure?: boolean;
    };
    value: string;
  }[] = [];

  if (!supabaseUrl || !publishableKey) {
    throw new Error("BLOCKED_TASK011_BROWSER_AUTH_ENV_UNAVAILABLE");
  }

  const authClient = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll(nextCookies) {
        cookiesToSet.push(...nextCookies);
      },
    },
  });

  const { error: verifyError } = await authClient.auth.verifyOtp({
    email: ownerEmail,
    token: emailOtp,
    type: "magiclink",
  });

  if (verifyError || cookiesToSet.length === 0) {
    throw new Error("BLOCKED_TASK011_MAGIC_OTP_VERIFY_FAILED");
  }

  await page.context().clearCookies();
  await page.context().addCookies(
    cookiesToSet.map((cookie) => ({
      httpOnly: cookie.options.httpOnly,
      name: cookie.name,
      sameSite:
        cookie.options.sameSite === "strict" || cookie.options.sameSite === true
          ? "Strict"
          : cookie.options.sameSite === "none"
            ? "None"
            : "Lax",
      secure: cookie.options.secure ?? false,
      url: baseURL,
      value: cookie.value,
    })),
  );
  await page.goto(nextPath);
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

async function archiveShopFromOperations(
  page: import("@playwright/test").Page,
  shopCode: string,
) {
  await page.goto("/platform/operations");
  await expect(
    page.getByRole("heading", { name: "Controlled Operations" }),
  ).toBeVisible();

  const shopArticle = page.locator("article").filter({ hasText: shopCode });

  await expect(shopArticle).toBeVisible({ timeout: 15_000 });
  await shopArticle
    .locator("form")
    .nth(2)
    .getByLabel("Reason")
    .fill("TASK-011 onboarding live gate cleanup.");
  await shopArticle.getByLabel("Type shop code to archive").fill(shopCode);
  await shopArticle.getByRole("button", { name: "Soft delete shop" }).click();
  await expect(shopArticle.getByText("Archived")).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("TASK-011 shop onboarding live gate", () => {
  test.skip(
    process.env.CONFIRM_TASK011_SHOP_ONBOARDING_LIVE_TEST !== "yes",
    "Set CONFIRM_TASK011_SHOP_ONBOARDING_LIVE_TEST=yes to run TASK-011 live gate.",
  );

  test("creates a synthetic shop for the provided owner and verifies Shop Admin access", async ({
    baseURL,
    page,
  }) => {
    test.setTimeout(120_000);

    if (!baseURL) {
      throw new Error("BLOCKED_BASE_URL_UNAVAILABLE");
    }

    const ownerEmail = process.env.TASK011_OWNER_EMAIL?.trim();

    if (!ownerEmail) {
      throw new Error("BLOCKED_TASK011_OWNER_EMAIL_REQUIRED");
    }

    const supabase = createServiceClient();
    const owner = await findOwnerByEmail(supabase, ownerEmail);

    if (!owner.emailConfirmed || owner.profileStatus !== "active") {
      throw new Error("BLOCKED_TASK011_OWNER_NOT_ACTIVE");
    }

    const nonce = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`.toUpperCase();
    const shopCode = `TASK011_TEST_${nonce}`;
    const shopName = `TASK011 Onboarding Test ${nonce}`;
    let createdShopId = "";
    let shopArchived = false;
    let ownerGateFailure = "";

    try {
      await signInWithMagicLink(
        page,
        supabase,
        owner.email,
        baseURL,
        "/platform/operations",
      );
      await expect(
        page.getByRole("heading", { name: "Controlled Operations" }),
      ).toBeVisible();

      await page.goto("/platform/users");
      await expect(
        page.getByRole("heading", {
          exact: true,
          level: 1,
          name: "Personal Accounts",
        }),
      ).toBeVisible();
      await expect(page.getByText(owner.displayName).first()).toBeVisible();

      await page.goto("/platform/operations");
      const createSection = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: "Create shop" }) });

      await createSection.getByLabel("Shop name").fill(shopName);
      await createSection.getByLabel("Shop code").fill(shopCode);
      await createSection.getByLabel("Initial owner").selectOption(owner.profileId);
      await createSection
        .getByLabel("Reason")
        .fill("TASK-011 onboarding live gate");
      await createSection.getByRole("button", { name: "Create shop" }).click();
      await expect(page.getByRole("heading", { name: shopName })).toBeVisible({
        timeout: 15_000,
      });

      const createdShop = await supabase
        .from("shops")
        .select("shop_id,shop_status")
        .eq("shop_code", shopCode)
        .maybeSingle();

      if (createdShop.error || !createdShop.data) {
        throw new Error("BLOCKED_TASK011_SHOP_CREATE_VERIFY_FAILED");
      }

      createdShopId = createdShop.data.shop_id;

      if (createdShop.data.shop_status !== "active") {
        throw new Error("BLOCKED_TASK011_SHOP_NOT_ACTIVE");
      }

      const createdMembership = await supabase
        .from("shop_members")
        .select("shop_member_id")
        .eq("shop_id", createdShopId)
        .eq("profile_id", owner.profileId)
        .eq("role_key", "shop_owner")
        .eq("membership_status", "active")
        .maybeSingle();

      if (createdMembership.error || !createdMembership.data) {
        throw new Error("BLOCKED_TASK011_OWNER_MEMBERSHIP_VERIFY_FAILED");
      }

      const auditEvents = await supabase
        .from("audit_logs")
        .select("event_key")
        .eq("shop_id", createdShopId)
        .in("event_key", [
          "platform.shop.create.success",
          "platform.shop.owner.assign.success",
        ]);

      if (auditEvents.error || (auditEvents.data ?? []).length < 2) {
        throw new Error("BLOCKED_TASK011_AUDIT_VERIFY_FAILED");
      }

      await page.goto("/auth/logout");
      await signInWithMagicLink(page, supabase, owner.email, baseURL, "/shop");

      if (
        (await page
          .getByRole("heading", { name: "Admin Console access required" })
          .count()) > 0
      ) {
        ownerGateFailure = owner.isPlatformAdmin
          ? "BLOCKED_TASK011_OWNER_IS_ACTIVE_PLATFORM_ADMIN"
          : "BLOCKED_TASK011_OWNER_SHOP_ACCESS_REQUIRED";
      } else {
        await expect(page.getByRole("heading", { name: "Shop Overview" })).toBeVisible();
        await expect(page.getByLabel("Switch shop")).toContainText(shopCode);

        for (const route of [
          "/shop/overview",
          "/shop/members",
          "/shop/audit",
        ]) {
          await page.goto(`${route}?shop_id=${createdShopId}`);
          await expect(page.getByLabel("Switch shop")).toContainText(shopCode);
          await expect(
            page.getByRole("heading", { name: "Live shop data" }),
          ).toBeVisible();
        }

        await page.goto(
          "/shop?shop_id=00000000-0000-4000-8000-000000000000",
        );
        await expect(page.getByLabel("Switch shop")).toContainText(shopCode);
        await expect(page.getByText("00000000-0000-4000-8000-000000000000")).toHaveCount(0);
      }
    } finally {
      if (createdShopId && !shopArchived) {
        await signInWithMagicLink(
          page,
          supabase,
          owner.email,
          baseURL,
          "/platform/operations",
        );
        await archiveShopFromOperations(page, shopCode);

        const archivedShop = await supabase
          .from("shops")
          .select("shop_status")
          .eq("shop_id", createdShopId)
          .maybeSingle();

        if (!archivedShop.error && archivedShop.data?.shop_status === "archived") {
          shopArchived = true;
        }
      }
    }

    if (ownerGateFailure) {
      throw new Error(ownerGateFailure);
    }
  });
});
