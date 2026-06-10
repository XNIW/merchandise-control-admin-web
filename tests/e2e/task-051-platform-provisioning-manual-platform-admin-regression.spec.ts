import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { Database } from "../../src/lib/supabase/database.types";

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

type ReadyRuntime = {
  publishableKey: string;
  serviceRoleKey: string;
  supabaseUrl: string;
};

type SupabaseResult = {
  error: unknown;
};

type CreatedShopState = {
  attemptKeyHash?: string;
  shopCode?: string;
  shopId?: string;
};

type ProvisioningResponse = {
  code?: string;
  ok?: boolean;
  oneTimeSignInValue?: string;
  shopCode?: string;
  shopId?: string;
  temporaryCredential?: string;
};

const email =
  process.env.DEV_PLATFORM_ADMIN_EMAIL?.trim() || "platform.local@example.test";
const password = process.env.DEV_PLATFORM_ADMIN_PASSWORD?.trim() || "";
const staffCode = "1001";

function runtimeFromEnv(): ReadyRuntime {
  if (process.env.CONFIRM_TASK051_MANUAL_REGRESSION_TEST !== "yes") {
    throw new Error("BLOCKED_TASK051_MANUAL_REGRESSION_CONFIRMATION_REQUIRED");
  }

  if (process.env.TEST_TARGET !== "local") {
    throw new Error("BLOCKED_TASK051_MANUAL_REGRESSION_REQUIRES_LOCAL_TARGET");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const url = supabaseUrl ? new URL(supabaseUrl) : null;

  if (
    !url ||
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
    url.port !== "54321"
  ) {
    throw new Error("BLOCKED_TASK051_MANUAL_REGRESSION_REQUIRES_LOCAL_SUPABASE");
  }

  if (!publishableKey || !serviceRoleKey) {
    throw new Error("BLOCKED_TASK051_MANUAL_REGRESSION_REQUIRES_LOCAL_KEYS");
  }

  return { publishableKey, serviceRoleKey, supabaseUrl };
}

function appBaseUrl() {
  return process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3050";
}

function nonce() {
  return `${Date.now()}_${randomBytes(4).toString("hex").toUpperCase()}`;
}

function uniqueRutDigits() {
  return `${randomInt(10_000_000, 99_999_999)}${randomInt(0, 10)}`;
}

function hashStaffWebAttemptKey(shopCode: string, code: string) {
  return `sha256:${createHash("sha256")
    .update(`${shopCode}:${code}`, "utf8")
    .digest("hex")}`;
}

function assertTemporaryPin(label: string, value: string | undefined) {
  if (!value || !/^\d{5}$/.test(value)) {
    throw new Error(`${label}_PIN_FORMAT_INVALID`);
  }
}

function base64Url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function staleJwtLikeBearer() {
  return [
    base64Url({ alg: "HS256", typ: "JWT" }),
    base64Url({
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 600,
      role: "authenticated",
      sub: randomBytes(16).toString("hex"),
    }),
    "stale-signature",
  ].join(".");
}

async function optionalDelete(
  label: string,
  result: PromiseLike<SupabaseResult>,
) {
  const resolved = await result;

  if (resolved.error) {
    throw new Error(`TASK051_MANUAL_${label}_CLEANUP_FAILED`);
  }
}

async function mustSingle<T>(
  label: string,
  result: PromiseLike<{ data?: T | null; error: unknown }>,
) {
  const resolved = await result;

  if (resolved.error || !resolved.data) {
    throw new Error(`TASK051_MANUAL_${label}_FAILED`);
  }

  return resolved.data;
}

async function findUserByEmail(
  supabase: SupabaseClient<Database>,
  targetEmail: string,
) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      throw new Error("TASK051_MANUAL_PLATFORM_USER_LIST_FAILED");
    }

    const match = data.users.find(
      (user) => user.email?.toLowerCase() === targetEmail.toLowerCase(),
    );

    if (match?.id) {
      return match;
    }

    if (data.users.length < 1000) {
      return null;
    }
  }

  throw new Error("TASK051_MANUAL_PLATFORM_USER_LIST_TOO_LARGE");
}

function runSeed() {
  const result = spawnSync(
    process.execPath,
    ["scripts/platform/local-login-setup.mjs", "seed"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.status !== 0) {
    throw new Error(
      [
        "TASK-051 manual regression local login seed failed.",
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

async function createMismatchedBearer(runtime: ReadyRuntime) {
  const serviceClient = createClient<Database>(
    runtime.supabaseUrl,
    runtime.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  const publicClient = createClient<Database>(
    runtime.supabaseUrl,
    runtime.publishableKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  const mismatchEmail = `task051-mismatch-${nonce().toLowerCase()}@example.invalid`;
  const mismatchPassword = `Task051Mismatch-${randomBytes(24).toString("base64url")}`;
  const createdUser = await serviceClient.auth.admin.createUser({
    email: mismatchEmail,
    email_confirm: true,
    password: mismatchPassword,
  });
  const userId = createdUser.data.user?.id;

  if (createdUser.error || !userId) {
    throw new Error("TASK051_MANUAL_MISMATCH_USER_CREATE_FAILED");
  }

  await optionalDelete(
    "MISMATCH_PROFILE_CREATE",
    serviceClient.from("profiles").upsert(
      {
        display_name: "TASK051 Mismatch User",
        profile_id: userId,
        profile_status: "active",
      },
      { onConflict: "profile_id" },
    ),
  );

  const signIn = await publicClient.auth.signInWithPassword({
    email: mismatchEmail,
    password: mismatchPassword,
  });
  const accessToken = signIn.data.session?.access_token;

  if (signIn.error || !accessToken) {
    throw new Error("TASK051_MANUAL_MISMATCH_USER_SIGN_IN_FAILED");
  }

  return {
    accessToken,
    cleanup: async () => {
      const now = new Date().toISOString();

      await optionalDelete(
        "MISMATCH_PROFILE_DISABLE",
        serviceClient
          .from("profiles")
          .update({
            disabled_at: now,
            disabled_by_profile_id: null,
            profile_status: "disabled",
            updated_at: now,
          })
          .eq("profile_id", userId),
      );
      await serviceClient.auth.admin.deleteUser(userId);
    },
  };
}

async function cleanupCreatedShop(
  supabase: SupabaseClient<Database>,
  created: CreatedShopState,
  actorProfileId: string,
) {
  if (!created.shopId) {
    return;
  }

  const shopId = created.shopId;
  const now = new Date().toISOString();

  await optionalDelete(
    "STAFF_WEB_SESSIONS_DELETE",
    supabase.from("staff_web_sessions").delete().eq("shop_id", shopId),
  );
  await optionalDelete(
    "STAFF_ROLE_PERMISSIONS_DELETE",
    supabase.from("staff_role_permissions").delete().eq("shop_id", shopId),
  );
  await optionalDelete(
    "STAFF_ACCOUNTS_DELETE",
    supabase.from("staff_accounts").delete().eq("shop_id", shopId),
  );
  await optionalDelete(
    "SHOP_MEMBERS_DELETE",
    supabase.from("shop_members").delete().eq("shop_id", shopId),
  );
  await optionalDelete(
    "SHOP_INVENTORY_SOURCES_DELETE",
    supabase.from("shop_inventory_sources").delete().eq("shop_id", shopId),
  );
  await optionalDelete(
    "PLATFORM_OWNER_INVITES_DELETE",
    supabase.from("platform_owner_invites").delete().eq("shop_id", shopId),
  );
  await optionalDelete(
    "POS_SALE_LINES_DELETE",
    supabase.from("pos_sale_lines").delete().eq("shop_id", shopId),
  );
  await optionalDelete(
    "POS_SALES_DELETE",
    supabase.from("pos_sales").delete().eq("shop_id", shopId),
  );
  await optionalDelete(
    "POS_SALES_SYNC_BATCHES_DELETE",
    supabase.from("pos_sales_sync_batches").delete().eq("shop_id", shopId),
  );
  await optionalDelete(
    "POS_SESSIONS_DELETE",
    supabase.from("pos_sessions").delete().eq("shop_id", shopId),
  );
  await optionalDelete(
    "POS_DEVICE_CREDENTIALS_DELETE",
    supabase.from("pos_device_credentials").delete().eq("shop_id", shopId),
  );
  await optionalDelete(
    "SHOP_DEVICES_DELETE",
    supabase.from("shop_devices").delete().eq("shop_id", shopId),
  );

  if (created.attemptKeyHash) {
    await optionalDelete(
      "STAFF_WEB_LOGIN_ATTEMPTS_DELETE",
      supabase
        .from("staff_web_login_attempts")
        .delete()
        .eq("attempt_key_hash", created.attemptKeyHash),
    );
  }

  await optionalDelete(
    "SHOP_ARCHIVE",
    supabase
      .from("shops")
      .update({
        archived_at: now,
        archived_by_profile_id: actorProfileId,
        shop_status: "archived",
        status_changed_at: now,
        status_changed_by_profile_id: actorProfileId,
        status_reason_redacted:
          "TASK-051 manual regression cleanup archived temporary local shop.",
        suspended_at: null,
        suspended_by_profile_id: null,
        updated_at: now,
      })
      .eq("shop_id", shopId)
      .neq("shop_status", "archived"),
  );
}

async function signInMaster(page: Page) {
  await page.goto("/auth/login?next=/platform");
  await expect(
    page.getByRole("heading", { level: 1, name: "Master Console sign in" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForFunction(() => window.location.pathname === "/platform"),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
  await expect(
    page.getByRole("heading", { level: 1, name: "Platform Overview" }),
  ).toBeVisible();
}

async function postProvisioningForm(
  page: Page,
  input: {
    authorization: string;
    fields: Record<string, string>;
    url: string;
  },
) {
  return page.evaluate(async ({ authorization, fields, url }) => {
    const formData = new FormData();

    for (const [key, value] of Object.entries(fields)) {
      formData.set(key, value);
    }

    const response = await window.fetch(url, {
      body: formData,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${authorization}`,
      },
      method: "POST",
    });

    return {
      body: (await response.json()) as ProvisioningResponse,
      ok: response.ok,
      status: response.status,
    };
  }, input);
}

async function createShopWithStaleBearer(page: Page, authorization: string) {
  const companyRut = uniqueRutDigits();
  const legalRepresentativeRut = uniqueRutDigits();
  const shopName = `TASK051 MANUAL ${nonce()}`;
  const response = await postProvisioningForm(page, {
    authorization,
    fields: {
      businessAddress: "Av. TASK051 Manual 1234",
      businessCity: "Santiago",
      businessGiro: "TASK051 manual regression",
      companyRut,
      legalRepresentativeRut,
      ownerSetupMode: "pos-first",
      reason: "TASK-051 manual platform admin regression create shop.",
      shopCode: companyRut,
      shopName,
      useCompanyRutAsShopCode: "true",
    },
    url: "/platform/provisioning/create-shop",
  });

  expect(response.ok).toBe(true);
  expect(response.body.ok, response.body.code ?? "missing_code").toBe(true);
  expect(response.body.code).toBe("success");
  assertTemporaryPin("TASK051_MANUAL_INITIAL", response.body.temporaryCredential);

  return {
    initialPin: response.body.temporaryCredential as string,
    shopCode: response.body.shopCode ?? companyRut,
    shopId: response.body.shopId,
  };
}

async function recoverWithStaleBearer(
  page: Page,
  input: {
    authorization: string;
    shopCode: string;
    shopId: string;
  },
) {
  const response = await postProvisioningForm(page, {
    authorization: input.authorization,
    fields: {
      reason: "TASK-051 manual platform admin regression recovery.",
      shopCode: input.shopCode,
      shopId: input.shopId,
    },
    url: "/platform/provisioning/recover-manager-1001",
  });

  expect(response.ok).toBe(true);
  expect(response.body.ok, response.body.code ?? "missing_code").toBe(true);
  expect(response.body.code).toBe("success");
  assertTemporaryPin("TASK051_MANUAL_RECOVERY", response.body.oneTimeSignInValue);

  return response.body.oneTimeSignInValue as string;
}

async function openShopCodeLoginPage(browser: Browser) {
  const context = await browser.newContext({ baseURL: appBaseUrl() });
  const page = await context.newPage();

  await page.goto("/auth/login?next=/shop&mode=shop-code");
  await expect(
    page.getByRole("heading", { level: 1, name: "Admin Console sign in" }),
  ).toBeVisible();

  return { context, page };
}

async function assertOldPinRejected(
  browser: Browser,
  input: {
    oldPin: string;
    shopCode: string;
  },
) {
  const { context, page } = await openShopCodeLoginPage(browser);

  await page.getByRole("textbox", { name: "Shop code" }).fill(input.shopCode);
  await page.getByRole("textbox", { name: "Staff code" }).fill(staffCode);
  await page.getByLabel("PIN / password").fill(input.oldPin);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByText("PIN/password is not correct for this staff account."),
  ).toBeVisible({ timeout: 20_000 });
  await context.close();
}

async function loginShopCodeSuccessfully(
  browser: Browser,
  input: {
    pin: string;
    shopCode: string;
  },
) {
  const { context, page } = await openShopCodeLoginPage(browser);

  await page.getByRole("textbox", { name: "Shop code" }).fill(input.shopCode);
  await page.getByRole("textbox", { name: "Staff code" }).fill(staffCode);
  await page.getByLabel("PIN / password").fill(input.pin);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/shop", { timeout: 20_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
  await expect(
    page.getByRole("heading", { level: 1, name: "Shop Overview" }),
  ).toBeVisible();
  await expect(page.getByText(input.shopCode).first()).toBeVisible();
  await page.goto("/shop/staff-logout");
  await page.waitForURL((url) => url.pathname === "/auth/login", {
    timeout: 20_000,
  });
  await context.close();
}

test.describe("TASK-051 manual Platform Admin provisioning regression", () => {
  test.skip(
    process.env.CONFIRM_TASK051_MANUAL_REGRESSION_TEST !== "yes",
    "Set CONFIRM_TASK051_MANUAL_REGRESSION_TEST=yes and DEV_PLATFORM_ADMIN_PASSWORD to run.",
  );
  test.setTimeout(180_000);

  test.beforeAll(() => {
    expect(password.length).toBeGreaterThanOrEqual(12);
    runSeed();
  });

  test("platform.local@example.test can create and recover with cookie auth even when a stale bearer is present", async ({
    browser,
    page,
  }) => {
    const runtime = runtimeFromEnv();
    const serviceClient = createClient<Database>(
      runtime.supabaseUrl,
      runtime.serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    );
    const created: CreatedShopState = {};
    const mismatch = await createMismatchedBearer(runtime);
    const platformUser = await findUserByEmail(serviceClient, email);

    try {
      if (!platformUser?.id) {
        throw new Error("TASK051_MANUAL_PLATFORM_USER_NOT_FOUND");
      }

      await signInMaster(page);
      await page.goto("/platform/provisioning");
      await expect(
        page.getByRole("heading", { level: 1, name: "Shop Provisioning" }),
      ).toBeVisible();

      const mismatchResponse = await postProvisioningForm(page, {
        authorization: mismatch.accessToken,
        fields: {
          businessAddress: "Av. TASK051 Mismatch 1234",
          businessCity: "Santiago",
          businessGiro: "TASK051 mismatch regression",
          companyRut: uniqueRutDigits(),
          legalRepresentativeRut: uniqueRutDigits(),
          ownerSetupMode: "pos-first",
          reason: "TASK-051 manual regression mismatch must fail closed.",
          shopCode: uniqueRutDigits(),
          shopName: `TASK051 MISMATCH ${nonce()}`,
          useCompanyRutAsShopCode: "false",
        },
        url: "/platform/provisioning/create-shop",
      });

      expect(mismatchResponse.ok).toBe(true);
      expect(mismatchResponse.body.ok).toBe(false);
      expect(mismatchResponse.body.code).toBe("auth_mismatch");

      const provisioned = await createShopWithStaleBearer(
        page,
        staleJwtLikeBearer(),
      );

      created.shopCode = provisioned.shopCode;
      created.shopId =
        provisioned.shopId ??
        (
          await mustSingle<{ shop_id: string }>(
            "CREATED_SHOP_LOOKUP",
            serviceClient
              .from("shops")
              .select("shop_id")
              .eq("shop_code", provisioned.shopCode)
              .maybeSingle(),
          )
        ).shop_id;
      created.attemptKeyHash = hashStaffWebAttemptKey(
        provisioned.shopCode,
        staffCode,
      );

      await loginShopCodeSuccessfully(browser, {
        pin: provisioned.initialPin,
        shopCode: provisioned.shopCode,
      });

      const recoveredPin = await recoverWithStaleBearer(page, {
        authorization: staleJwtLikeBearer(),
        shopCode: provisioned.shopCode,
        shopId: created.shopId,
      });

      await assertOldPinRejected(browser, {
        oldPin: provisioned.initialPin,
        shopCode: provisioned.shopCode,
      });
      await loginShopCodeSuccessfully(browser, {
        pin: recoveredPin,
        shopCode: provisioned.shopCode,
      });
    } finally {
      await cleanupCreatedShop(serviceClient, created, platformUser?.id ?? "");
      await mismatch.cleanup();
    }
  });
});
