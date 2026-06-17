import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

type RuntimeFixture = {
  cleanup: () => Promise<void>;
  email: string;
  password: string;
  supabase: SupabaseClient;
  userId: string;
};

const coreRoutes = [
  { heading: "Platform Overview", label: "Overview", path: "/platform" },
  { heading: "Personal Accounts", label: "Users", path: "/platform/users" },
  { heading: "Shop Admins", label: "Shop Admins", path: "/platform/shop-admins" },
  { heading: "Shops", label: "Shops", path: "/platform/shops" },
  { heading: "Provisioning", label: "Provisioning", path: "/platform/provisioning" },
  { heading: "Audit", label: "Audit", path: "/platform/audit" },
  { heading: "System Status", label: "System", path: "/platform/system" },
] as const;

function runtimeEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(supabaseUrl)) {
    throw new Error("BLOCKED_TASK043_REQUIRES_LOCAL_SUPABASE_URL");
  }

  if (!publishableKey || !serviceRoleKey) {
    throw new Error("BLOCKED_TASK043_REQUIRES_LOCAL_SUPABASE_KEYS");
  }

  return { publishableKey, serviceRoleKey, supabaseUrl };
}

async function createTemporaryPlatformAdmin(): Promise<RuntimeFixture> {
  const { serviceRoleKey, supabaseUrl } = runtimeEnv();
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const nonce = `${Date.now()}-${randomBytes(5).toString("hex")}`;
  const email = `task043-${nonce}@example.invalid`;
  const password = `Task043-${randomBytes(18).toString("base64url")}`;
  const { data: createdUser, error: createError } =
    await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    });
  const userId = createdUser.user?.id;

  if (createError || !userId) {
    throw new Error("BLOCKED_TASK043_USER_CREATE_FAILED");
  }

  const cleanup = async () => {
    await supabase.from("audit_logs").delete().eq("target_id", userId);
    await supabase.from("platform_admins").delete().eq("profile_id", userId);
    await supabase.from("profiles").delete().eq("profile_id", userId);
    await supabase.auth.admin.deleteUser(userId);
  };

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      display_name: "TASK043 Platform Runtime",
      profile_id: userId,
      profile_status: "active",
    },
    { onConflict: "profile_id" },
  );

  if (profileError) {
    await cleanup();
    throw new Error("BLOCKED_TASK043_PROFILE_CREATE_FAILED");
  }

  const { error: adminError } = await supabase.from("platform_admins").insert({
    profile_id: userId,
    reason_redacted: "TASK-043 runtime harness platform admin.",
    status: "active",
  });

  if (adminError) {
    await cleanup();
    throw new Error("BLOCKED_TASK043_PLATFORM_ADMIN_CREATE_FAILED");
  }

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor_profile_id: userId,
    event_key: "task043.platform_admin.runtime_harness",
    metadata_redacted: {
      mode: "temporary_local_test_user",
      source: "tests/e2e/task-043-platform-admin-runtime.spec.ts",
    },
    result: "success",
    scope: "global",
    severity: "info",
    target_id: userId,
    target_type: "platform_admin",
  });

  if (auditError) {
    await cleanup();
    throw new Error("BLOCKED_TASK043_AUDIT_CREATE_FAILED");
  }

  return {
    cleanup,
    email,
    password,
    supabase,
    userId,
  };
}

async function signIn(page: Page, fixture: RuntimeFixture) {
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

async function expectPlatformPageReady(page: Page, heading: string) {
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await expect(page.getByText("Read blocked")).toHaveCount(0);
  await expect(
    page.getByText("The Platform Admin read model could not be loaded through RLS"),
  ).toHaveCount(0);
  await expect(page.getByText("Provisioning unavailable")).toHaveCount(0);
}

test.describe("TASK-043 Platform Admin runtime fixes", () => {
  test.skip(
    process.env.CONFIRM_TASK043_PLATFORM_RUNTIME_TEST !== "yes",
    "Set CONFIRM_TASK043_PLATFORM_RUNTIME_TEST=yes with local Supabase env to run.",
  );

  test("platform admin can visit core pages, navigate without full reload, and logout", async ({
    page,
  }) => {
    const fixture = await createTemporaryPlatformAdmin();

    try {
      await signIn(page, fixture);
      await expectPlatformPageReady(page, "Platform Overview");
      await expect(page.getByRole("link", { name: "Logout" })).toBeVisible();

      const latency: Array<{ from: string; ms: number; to: string }> = [];

      for (const route of coreRoutes) {
        await page.goto(route.path);
        await expectPlatformPageReady(page, route.heading);
      }

      for (const nextRoute of coreRoutes.slice(1)) {
        await page.evaluate(() => {
          window.sessionStorage.setItem("task043_nav_marker", "same_document");
        });
        const previousPath = await page.evaluate(() => window.location.pathname);
        const started = Date.now();
        await page.getByRole("link", { name: nextRoute.label }).click();
        await page.waitForFunction(
          (path) => window.location.pathname === path,
          nextRoute.path,
        );
        await expectPlatformPageReady(page, nextRoute.heading);
        const marker = await page.evaluate(() =>
          window.sessionStorage.getItem("task043_nav_marker"),
        );

        expect(marker).toBe("same_document");
        latency.push({
          from: previousPath,
          ms: Date.now() - started,
          to: nextRoute.path,
        });
      }

      console.log(`TASK043_NAV_LATENCY ${JSON.stringify(latency)}`);

      await page.getByRole("link", { name: "Logout" }).click();
      await page.waitForURL(/\/auth\/login\?logged_out=1/);
      await page.goto("/platform");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Master Console access required",
        }),
      ).toBeVisible();
    } finally {
      await fixture.cleanup();
    }
  });
});
