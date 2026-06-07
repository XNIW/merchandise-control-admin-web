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

function runtimeEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(supabaseUrl)) {
    throw new Error("BLOCKED_TASK044_REQUIRES_LOCAL_SUPABASE_URL");
  }

  if (!publishableKey || !serviceRoleKey) {
    throw new Error("BLOCKED_TASK044_REQUIRES_LOCAL_SUPABASE_KEYS");
  }

  return { publishableKey, serviceRoleKey, supabaseUrl };
}

async function cleanupCreatedShops(
  supabase: SupabaseClient,
  shopCodes: readonly string[],
) {
  if (shopCodes.length === 0) {
    return;
  }

  const { data: shops } = await supabase
    .from("shops")
    .select("shop_id")
    .in("shop_code", [...shopCodes]);
  const shopIds = shops?.map((shop) => shop.shop_id).filter(Boolean) ?? [];

  if (shopIds.length === 0) {
    return;
  }

  const { data: staffRows } = await supabase
    .from("staff_accounts")
    .select("staff_id")
    .in("shop_id", shopIds);
  const staffIds = staffRows?.map((staff) => staff.staff_id).filter(Boolean) ?? [];

  if (staffIds.length > 0) {
    await supabase.from("audit_logs").delete().in("target_id", staffIds);
  }

  await supabase.from("audit_logs").delete().in("shop_id", shopIds);
  await supabase.from("staff_role_permissions").delete().in("shop_id", shopIds);
  await supabase.from("staff_accounts").delete().in("shop_id", shopIds);
  await supabase.from("platform_owner_invites").delete().in("shop_id", shopIds);
  await supabase.from("shop_members").delete().in("shop_id", shopIds);
  await supabase.from("shops").delete().in("shop_id", shopIds);
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
  const email = `task044-${nonce}@example.invalid`;
  const password = `Task044-${randomBytes(18).toString("base64url")}`;
  const { data: createdUser, error: createError } =
    await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    });
  const userId = createdUser.user?.id;

  if (createError || !userId) {
    throw new Error("BLOCKED_TASK044_USER_CREATE_FAILED");
  }

  const cleanup = async () => {
    await supabase.from("audit_logs").delete().eq("target_id", userId);
    await supabase.from("platform_admins").delete().eq("profile_id", userId);
    await supabase.from("profiles").delete().eq("profile_id", userId);
    await supabase.auth.admin.deleteUser(userId);
  };

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      display_name: "TASK044 Platform Runtime",
      profile_id: userId,
      profile_status: "active",
    },
    { onConflict: "profile_id" },
  );

  if (profileError) {
    await cleanup();
    throw new Error("BLOCKED_TASK044_PROFILE_CREATE_FAILED");
  }

  const { error: adminError } = await supabase.from("platform_admins").insert({
    profile_id: userId,
    reason_redacted: "TASK-044 runtime harness platform admin.",
    status: "active",
  });

  if (adminError) {
    await cleanup();
    throw new Error("BLOCKED_TASK044_PLATFORM_ADMIN_CREATE_FAILED");
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
  await page.goto("/auth/login?next=/platform/provisioning");
  await expect(
    page.getByRole("heading", { level: 1, name: "Admin Console sign in" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(fixture.email);
  await page.getByLabel("Password").fill(fixture.password);
  await Promise.all([
    page.waitForFunction(() => window.location.pathname === "/platform/provisioning"),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

test.describe("TASK-044 Platform provisioning UX runtime", () => {
  test.skip(
    process.env.CONFIRM_TASK044_PLATFORM_RUNTIME_TEST !== "yes",
    "Set CONFIRM_TASK044_PLATFORM_RUNTIME_TEST=yes with local Supabase env to run.",
  );

  test("provisioning avoids double create, stays on page, and provisions manager access", async ({
    page,
  }) => {
    const fixture = await createTemporaryPlatformAdmin();
    const shopCode = `T044${randomBytes(4).toString("hex").toUpperCase()}`;
    const pendingShopCode = `T044P${randomBytes(4).toString("hex").toUpperCase()}`;
    const staffCode = `MGR${randomBytes(4).toString("hex").toUpperCase()}`;

    try {
      await signIn(page, fixture);
      await expect(
        page.getByRole("heading", { level: 1, name: "Provisioning" }),
      ).toBeVisible();

      const createSection = page.locator("section").filter({
        has: page.getByRole("heading", {
          level: 2,
          name: "Create shop with existing owner",
        }),
      });
      await createSection.getByLabel("Shop name").fill("TASK044 Main Shop");
      await createSection.getByLabel("Shop code").fill(shopCode);
      await createSection.getByLabel("Initial owner").selectOption(fixture.userId);
      await createSection.getByLabel("Reason").fill("TASK-044 double submit proof.");
      await createSection.getByRole("button", { name: "Create shop" }).dblclick();
      await page.waitForURL(/\/platform\/provisioning\?operation=create&result=success/);
      await expect(page.getByText("Shop created.")).toBeVisible();
      await expect(page.getByText("Rendering...")).toHaveCount(0);

      const { data: createdShops, error: createdShopError } = await fixture.supabase
        .from("shops")
        .select("shop_id,shop_code,shop_name")
        .eq("shop_code", shopCode);

      expect(createdShopError).toBeNull();
      expect(createdShops).toHaveLength(1);
      const shopId = createdShops?.[0]?.shop_id;
      expect(shopId).toBeTruthy();

      const pendingSection = page.locator("section").filter({
        has: page.getByRole("heading", {
          level: 2,
          name: "Create pending owner invite",
        }),
      });
      await pendingSection.getByLabel("Shop name").fill("TASK044 Pending Shop");
      await pendingSection.getByLabel("Shop code").fill(pendingShopCode);
      await pendingSection
        .getByLabel("Owner email")
        .fill(`owner-${pendingShopCode.toLowerCase()}@example.invalid`);
      await pendingSection
        .getByLabel("Reason")
        .fill("TASK-044 pending owner invite proof.");
      await pendingSection.getByRole("button", { name: "Create pending invite" }).click();
      await page.waitForURL(/\/platform\/provisioning\?operation=pending_owner_invite&result=success/);
      await expect(page.getByText("Pending owner invite created.")).toBeVisible();

      const managerSection = page.locator("section").filter({
        has: page.getByRole("heading", {
          level: 2,
          name: "Provision POS manager web access",
        }),
      });
      await managerSection.getByLabel("Shop").selectOption(shopId ?? "");
      await managerSection.getByLabel("Staff code").fill(staffCode);
      await managerSection.getByLabel("Display name").fill("TASK044 POS Manager");
      await managerSection
        .getByLabel("Reason")
        .fill("TASK-044 manager web access proof.");
      await managerSection
        .getByRole("button", { name: "Recover manager 1001" })
        .click();
      await expect(
        managerSection.getByText("Staff manager web access was provisioned."),
      ).toBeVisible();
      await expect(managerSection.getByText("Temporary PIN", { exact: false })).toBeVisible();
      await expect(managerSection.locator("code")).toHaveText(/^[1-9][0-9]{4}$/);

      const { data: staffRows, error: staffError } = await fixture.supabase
        .from("staff_accounts")
        .select("staff_id,role_key,status")
        .eq("shop_id", shopId)
        .eq("staff_code", staffCode);
      expect(staffError).toBeNull();
      expect(staffRows).toHaveLength(1);
      expect(staffRows?.[0]?.role_key).toBe("manager");

      const { data: permissionRows, error: permissionError } = await fixture.supabase
        .from("staff_role_permissions")
        .select("enabled")
        .eq("shop_id", shopId)
        .eq("role_key", "manager")
        .eq("permission_key", "shop_admin.full_access");
      expect(permissionError).toBeNull();
      expect(permissionRows).toEqual([{ enabled: true }]);
    } finally {
      await cleanupCreatedShops(fixture.supabase, [shopCode, pendingShopCode]);
      await fixture.cleanup();
    }
  });

  test("sidebar active state does not fall back to Overview during navigation", async ({
    page,
  }) => {
    const fixture = await createTemporaryPlatformAdmin();

    try {
      await signIn(page, fixture);
      await page.goto("/platform/provisioning");
      await expect(page.getByRole("link", { name: "Provisioning" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await page.getByRole("link", { name: "Users" }).click();

      for (const delay of [0, 50, 100, 200]) {
        await page.waitForTimeout(delay);
        await expect(page.getByRole("link", { name: "Overview" })).not.toHaveAttribute(
          "aria-current",
          "page",
        );
      }

      await page.waitForURL("**/platform/users");
      await expect(page.getByRole("link", { name: "Users" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    } finally {
      await fixture.cleanup();
    }
  });
});
