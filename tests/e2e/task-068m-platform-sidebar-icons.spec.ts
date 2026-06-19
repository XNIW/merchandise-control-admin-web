import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

type PlatformIconFixture = {
  cleanup: () => Promise<void>;
  email: string;
  password: string;
  supabase: SupabaseClient;
  userId: string;
};

const primaryPlatformRoutes = [
  { heading: "Platform Overview", label: "Overview", path: "/platform" },
  { heading: "Personal Accounts", label: "Users", path: "/platform/users" },
  { heading: "Shop Admins", label: "Shop Admins", path: "/platform/shop-admins" },
  { heading: "Shops", label: "Shops", path: "/platform/shops" },
  { heading: "Provisioning", label: "Provisioning", path: "/platform/provisioning" },
  { heading: "Platform Admins", label: "Platform Admins", path: "/platform/admins" },
  { heading: "Audit", label: "Audit", path: "/platform/audit" },
  { heading: "System Status", label: "System", path: "/platform/system" },
  { heading: "Data Health", label: "Data", path: "/platform/data" },
  { heading: "Global History", label: "History", path: "/platform/history" },
  {
    heading: "Controlled Operations",
    label: "Operations",
    path: "/platform/operations",
  },
  {
    heading: "Support Diagnostics",
    label: "Support",
    path: "/platform/support",
  },
] as const;

function localRuntimeEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(supabaseUrl)) {
    throw new Error("BLOCKED_TASK068M_REQUIRES_LOCAL_SUPABASE_URL");
  }

  if (!publishableKey || !serviceRoleKey) {
    throw new Error("BLOCKED_TASK068M_REQUIRES_LOCAL_SUPABASE_KEYS");
  }

  return { serviceRoleKey, supabaseUrl };
}

async function createPlatformIconFixture(): Promise<PlatformIconFixture> {
  const { serviceRoleKey, supabaseUrl } = localRuntimeEnv();
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const nonce = randomBytes(5).toString("hex").toLowerCase();
  const email = `task068m-${nonce}@example.invalid`;
  const password = `Task068M-${randomBytes(18).toString("base64url")}`;
  const createdUser = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });
  const userId = createdUser.data.user?.id;

  if (createdUser.error || !userId) {
    throw new Error("BLOCKED_TASK068M_USER_CREATE_FAILED");
  }

  const resolvedUserId = userId;

  async function cleanup() {
    await supabase.from("platform_admins").delete().eq("profile_id", resolvedUserId);
    await supabase.from("profiles").delete().eq("profile_id", resolvedUserId);
    await supabase.auth.admin.deleteUser(resolvedUserId);
  }

  const profile = await supabase.from("profiles").upsert(
    {
      display_name: "TASK068M Platform Sidebar Icons",
      profile_id: resolvedUserId,
      profile_status: "active",
    },
    { onConflict: "profile_id" },
  );

  if (profile.error) {
    await cleanup();
    throw new Error("BLOCKED_TASK068M_PROFILE_CREATE_FAILED");
  }

  const admin = await supabase.from("platform_admins").insert({
    profile_id: resolvedUserId,
    reason_redacted: "TASK-068M platform sidebar icon smoke.",
    status: "active",
  });

  if (admin.error) {
    await cleanup();
    throw new Error("BLOCKED_TASK068M_PLATFORM_ADMIN_CREATE_FAILED");
  }

  return {
    cleanup,
    email,
    password,
    supabase,
    userId: resolvedUserId,
  };
}

async function signIn(page: Page, fixture: PlatformIconFixture) {
  await page.goto("/auth/login?next=/platform");
  await expect(
    page.getByRole("heading", { level: 1, name: "Master Console sign in" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(fixture.email);
  await page.getByLabel("Password").fill(fixture.password);

  await Promise.all([
    page.waitForFunction(() => window.location.pathname === "/platform"),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

test.describe("TASK-068M Platform sidebar icon smoke", () => {
  test("primary Master Console routes render decorative sidebar icons", async ({
    page,
  }) => {
    const fixture = await createPlatformIconFixture();

    try {
      await signIn(page, fixture);

      for (const route of primaryPlatformRoutes) {
        await page.goto(route.path);
        await expect(
          page.getByRole("heading", { level: 1, name: route.heading }),
        ).toBeVisible();

        const link = page.getByRole("link", { name: route.label });

        await expect(link).toHaveAttribute("aria-current", "page");
        await expect(link.locator('svg[aria-hidden="true"]')).toHaveCount(1);
      }
    } finally {
      await fixture.cleanup();
    }
  });
});
