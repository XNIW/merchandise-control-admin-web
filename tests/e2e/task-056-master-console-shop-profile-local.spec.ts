import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import type { Database } from "../../src/lib/supabase/database.types";

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

type AdminClient = SupabaseClient<Database>;

type Task056Fixture = {
  cleanup: () => Promise<void>;
  email: string;
  initialAddress: string;
  initialCity: string;
  initialCompanyRut: string;
  initialGiro: string;
  initialLegalRepresentativeRut: string;
  initialShopName: string;
  password: string;
  shopCode: string;
  shopId: string;
  supabase: AdminClient;
  userId: string;
};

type RuntimeEnv = {
  publishableKey: string;
  serviceRoleKey: string;
  supabaseUrl: string;
};

function runtimeEnv(): RuntimeEnv {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(supabaseUrl)) {
    throw new Error("BLOCKED_TASK056_REQUIRES_LOCAL_SUPABASE_URL");
  }

  if (!publishableKey || !serviceRoleKey) {
    throw new Error("BLOCKED_TASK056_REQUIRES_LOCAL_SUPABASE_KEYS");
  }

  return { publishableKey, serviceRoleKey, supabaseUrl };
}

function nonce() {
  return `${Date.now()}_${randomBytes(4).toString("hex").toUpperCase()}`;
}

function testRut(offset: number) {
  const body = String(
    1_000_000 + ((Date.now() + offset * 12_289) % 8_000_000),
  );
  const checkDigit = offset % 2 === 0 ? "K" : String(offset % 10);

  return `${body}-${checkDigit}`;
}

async function must<T>(
  label: string,
  result: PromiseLike<{ data: T | null; error: unknown }>,
) {
  const { data, error } = await result;

  if (error || data === null) {
    throw new Error(`BLOCKED_TASK056_${label}`);
  }

  return data;
}

async function mustOk(label: string, result: PromiseLike<{ error: unknown }>) {
  const { error } = await result;

  if (error) {
    throw new Error(`BLOCKED_TASK056_${label}`);
  }
}

async function createFixture(): Promise<Task056Fixture> {
  const { serviceRoleKey, supabaseUrl } = runtimeEnv();
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const testNonce = nonce();
  const email = `task056-${testNonce.toLowerCase()}@example.invalid`;
  const password = `Task056-${randomBytes(18).toString("base64url")}`;
  const shopCode = `TASK056_${testNonce}`.slice(0, 32);
  const initialShopName = `TASK056 SHOP ${testNonce}`.slice(0, 120);
  const initialCompanyRut = testRut(11);
  const initialLegalRepresentativeRut = testRut(12);
  const initialGiro = "TASK-056 LOCAL PROFILE REVIEW";
  const initialAddress = "TASK-056 REVIEW ADDRESS 123";
  const initialCity = "SANTIAGO";
  const { data: createdUser, error: createUserError } =
    await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    });
  const userId = createdUser.user?.id;

  if (createUserError || !userId) {
    throw new Error("BLOCKED_TASK056_AUTH_USER_CREATE");
  }

  await mustOk(
    "PROFILE_UPSERT",
    supabase.from("profiles").upsert(
      {
        display_name: "TASK056 Platform Profile Edit",
        profile_id: userId,
        profile_status: "active",
      },
      { onConflict: "profile_id" },
    ),
  );
  await mustOk(
    "PLATFORM_ADMIN_INSERT",
    supabase.from("platform_admins").insert({
      profile_id: userId,
      reason_redacted: "TASK-056 local shop profile E2E temporary admin.",
      status: "active",
    }),
  );
  const shop = await must<Array<{ shop_id: string }>>(
    "SHOP_INSERT",
    supabase
      .from("shops")
      .insert({
        business_address: initialAddress,
        business_city: initialCity,
        business_giro: initialGiro,
        company_rut: initialCompanyRut,
        created_by_profile_id: userId,
        fiscal_identity_locked_by_platform: true,
        fiscal_identity_updated_at: new Date().toISOString(),
        fiscal_identity_updated_by_profile_id: userId,
        legal_representative_rut: initialLegalRepresentativeRut,
        shop_code: shopCode,
        shop_name: initialShopName,
        shop_status: "active",
        status_changed_by_profile_id: userId,
        status_reason_redacted: "TASK-056 local profile E2E seed.",
      })
      .select("shop_id"),
  );
  const shopId = shop[0]?.shop_id;

  if (!shopId) {
    throw new Error("BLOCKED_TASK056_SHOP_ID_MISSING");
  }

  await mustOk(
    "SEED_AUDIT",
    supabase.from("audit_logs").insert({
      actor_profile_id: userId,
      event_key: "task056.platform_shop_profile.seed",
      metadata_redacted: {
        mode: "temporary_local_test_fixture",
        source: "tests/e2e/task-056-master-console-shop-profile-local.spec.ts",
      },
      result: "success",
      scope: "shop",
      severity: "info",
      shop_id: shopId,
      target_id: shopId,
      target_type: "shop",
    }),
  );

  const cleanup = async () => {
    const now = new Date().toISOString();

    await mustOk(
      "SHOP_ARCHIVE_CLEANUP",
      supabase
        .from("shops")
        .update({
          archived_at: now,
          archived_by_profile_id: userId,
          shop_status: "archived",
          status_changed_at: now,
          status_changed_by_profile_id: userId,
          status_reason_redacted:
            "TASK-056 local profile E2E cleanup archived synthetic shop.",
          suspended_at: null,
          suspended_by_profile_id: null,
          updated_at: now,
        })
        .eq("shop_id", shopId)
        .neq("shop_status", "archived"),
    );
    await mustOk(
      "PLATFORM_ADMIN_REVOKE_CLEANUP",
      supabase
        .from("platform_admins")
        .update({
          reason_redacted: "TASK-056 local shop profile E2E cleanup.",
          revoked_at: now,
          revoked_by_profile_id: userId,
          status: "revoked",
        })
        .eq("profile_id", userId)
        .eq("status", "active"),
    );
    await mustOk(
      "PROFILE_DISABLE_CLEANUP",
      supabase
        .from("profiles")
        .update({
          disabled_at: now,
          disabled_by_profile_id: null,
          profile_status: "disabled",
          updated_at: now,
        })
        .eq("profile_id", userId),
    );
    await supabase.auth.admin.deleteUser(userId);

    const activeAdmins = await must<Array<{ platform_admin_id: string }>>(
      "ACTIVE_ADMIN_RESIDUAL_CHECK",
      supabase
        .from("platform_admins")
        .select("platform_admin_id")
        .eq("profile_id", userId)
        .eq("status", "active"),
    );
    const nonArchivedShops = await must<Array<{ shop_id: string }>>(
      "SHOP_RESIDUAL_CHECK",
      supabase
        .from("shops")
        .select("shop_id")
        .eq("shop_code", shopCode)
        .neq("shop_status", "archived"),
    );

    expect(activeAdmins).toHaveLength(0);
    expect(nonArchivedShops).toHaveLength(0);
  };

  return {
    cleanup,
    email,
    initialAddress,
    initialCity,
    initialCompanyRut,
    initialGiro,
    initialLegalRepresentativeRut,
    initialShopName,
    password,
    shopCode,
    shopId,
    supabase,
    userId,
  };
}

async function signIn(page: Page, fixture: Task056Fixture) {
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
  await page.goto("/platform/shops");
}

async function openDetailWithEnter(page: Page, fixture: Task056Fixture) {
  await page.goto("/platform/shops");
  const row = page.locator("tbody tr", { hasText: fixture.shopCode }).first();

  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(
    new RegExp(`/platform/shops\\?selected=${fixture.shopId}`),
  );
  await expect(
    page.getByRole("heading", { level: 3, name: fixture.initialShopName }),
  ).toBeVisible();

  await row.getByRole("button", { name: new RegExp(`Copy shop code ${fixture.shopCode}`) }).click();
  await expect(page).toHaveURL(
    new RegExp(`/platform/shops\\?selected=${fixture.shopId}`),
  );

  await row.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/platform/shops/${fixture.shopId}`));
}

async function openDetailWithDoubleClick(page: Page, fixture: Task056Fixture) {
  await page.goto(`/platform/shops?selected=${fixture.shopId}`);
  const row = page.locator("tbody tr", { hasText: fixture.shopCode }).first();

  await expect(row).toBeVisible();
  await row.dblclick();
  await expect(page).toHaveURL(new RegExp(`/platform/shops/${fixture.shopId}`));
}

test.describe("TASK-056 Master Console local shop profile E2E", () => {
  test.skip(
    process.env.CONFIRM_TASK056_PLATFORM_PROFILE_E2E !== "yes",
    "Set CONFIRM_TASK056_PLATFORM_PROFILE_E2E=yes with local Supabase env to run.",
  );

  test("row shortcuts open detail and audited profile update preserves shop code", async ({
    page,
  }) => {
    const fixture = await createFixture();
    const updatedShopName = `TASK056 UPDATED ${nonce()}`.slice(0, 120);
    const updatedCompanyRut = testRut(21);
    const updatedLegalRepresentativeRut = testRut(22);
    const updatedGiro = "TASK-056 UPDATED GIRO";
    const updatedAddress = "TASK-056 UPDATED ADDRESS 456";
    const updatedCity = "VALPARAISO";

    try {
      await signIn(page, fixture);
      await openDetailWithEnter(page, fixture);
      await openDetailWithDoubleClick(page, fixture);

      const profileSection = page.locator("section").filter({
        has: page.getByRole("heading", {
          level: 2,
          name: "Shop profile & fiscal identity",
        }),
      }).last();

      await expect(profileSection).toBeVisible();
      for (const text of [
        "Shop name",
        "Shop code",
        "Shop ID",
        "Status",
        "Company RUT",
        "Giro",
        "Address",
        "City",
        "Legal representative RUT",
        "Created",
        "Updated",
      ]) {
        await expect(profileSection.getByText(text, { exact: true })).toBeVisible();
      }
      await expect(profileSection.getByTitle(fixture.shopCode)).toBeVisible();

      await page
        .getByRole("button", { name: "Edit shop profile and fiscal identity" })
        .click();
      const dialog = page.getByRole("dialog", { name: "Edit shop profile" });

      await expect(dialog).toBeVisible();
      await dialog.getByLabel("Shop name").fill(updatedShopName);
      await dialog.getByLabel("Company RUT").fill(updatedCompanyRut);
      await dialog.getByLabel("Giro").fill(updatedGiro);
      await dialog.getByLabel("Address").fill(updatedAddress);
      await dialog.getByLabel("City").fill(updatedCity);
      await dialog
        .getByLabel("Legal representative RUT")
        .fill(updatedLegalRepresentativeRut);
      await dialog
        .getByLabel("Reason")
        .fill("TASK-056 local E2E audited profile update.");
      await dialog
        .getByLabel("Type UPDATE SHOP PROFILE as confirmation")
        .fill("UPDATE SHOP PROFILE");
      await dialog.getByRole("button", { name: "Update shop profile" }).click();
      await expect(dialog.getByText("Shop profile updated.")).toBeVisible();
      await dialog.getByRole("button", { name: "Close" }).click();

      await page.reload();
      await expect(
        page.getByRole("heading", { level: 1, name: updatedShopName }),
      ).toBeVisible();
      const updatedProfileSection = page.locator("section").filter({
        has: page.getByRole("heading", {
          level: 2,
          name: "Shop profile & fiscal identity",
        }),
      }).last();

      await expect(updatedProfileSection.getByTitle(fixture.shopCode)).toBeVisible();
      await expect(updatedProfileSection.getByText(updatedGiro)).toBeVisible();
      await expect(updatedProfileSection.getByText(updatedAddress)).toBeVisible();
      await expect(updatedProfileSection.getByText(updatedCity)).toBeVisible();

      const { data: shopRows, error: shopError } = await fixture.supabase
        .from("shops")
        .select(
          "shop_code,shop_name,company_rut,business_giro,business_address,business_city,legal_representative_rut",
        )
        .eq("shop_id", fixture.shopId);
      expect(shopError).toBeNull();
      expect(shopRows).toHaveLength(1);
      expect(shopRows?.[0]).toMatchObject({
        business_address: updatedAddress,
        business_city: updatedCity,
        business_giro: updatedGiro,
        company_rut: updatedCompanyRut,
        legal_representative_rut: updatedLegalRepresentativeRut,
        shop_code: fixture.shopCode,
        shop_name: updatedShopName,
      });

      const { data: auditRows, error: auditError } = await fixture.supabase
        .from("audit_logs")
        .select("event_key,metadata_redacted")
        .eq("shop_id", fixture.shopId)
        .eq("event_key", "platform.shop.profile_update.success");
      expect(auditError).toBeNull();
      expect(auditRows?.length ?? 0).toBeGreaterThan(0);
      expect(JSON.stringify(auditRows)).not.toMatch(
        /password|credential|token|pin|hash/i,
      );
    } finally {
      await fixture.cleanup();
    }
  });
});
