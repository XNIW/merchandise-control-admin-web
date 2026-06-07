import {
  expect,
  test,
  type Browser,
  type Page,
  type Request,
} from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomInt } from "node:crypto";
import type { Database } from "../../src/lib/supabase/database.types";

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

type ReadyRuntime = {
  serviceRoleKey: string;
  supabaseUrl: string;
};

type RuntimeFixture = {
  cleanup: () => Promise<void>;
  email: string;
  password: string;
  supabase: SupabaseClient<Database>;
  userId: string;
};

type CreatedShopState = {
  attemptKeyHash?: string;
  shopCode?: string;
  shopId?: string;
};

type AdminAccountFixture = {
  cleanup: () => Promise<void>;
  email: string;
  password: string;
  userId: string;
};

type SupabaseResult = {
  error: unknown;
};

type ShopRow = {
  shop_id: string;
  shop_code: string;
  shop_status: string;
};

type StaffRow = {
  credential_status: string;
  credential_version: number | null;
  role_key: string;
  staff_id: string;
  status: string;
};

const staffCode = "1001";

function runtimeFromEnv(): ReadyRuntime {
  if (process.env.CONFIRM_TASK051_FULL_E2E !== "yes") {
    throw new Error("BLOCKED_TASK051_CONFIRMATION_REQUIRED");
  }

  if (process.env.TEST_TARGET !== "local") {
    throw new Error("BLOCKED_TASK051_REQUIRES_TEST_TARGET_LOCAL");
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
    throw new Error("BLOCKED_TASK051_REQUIRES_LOCAL_SUPABASE_URL");
  }

  if (!publishableKey || !serviceRoleKey) {
    throw new Error("BLOCKED_TASK051_REQUIRES_LOCAL_SUPABASE_KEYS");
  }

  return { serviceRoleKey, supabaseUrl };
}

function appBaseUrl() {
  return process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
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

function assertTemporaryPin(label: string, value: string) {
  if (!/^\d{5}$/.test(value)) {
    throw new Error(`${label}_PIN_FORMAT_INVALID`);
  }
}

function redactedProvisioningFailure(value: unknown) {
  const result = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const diagnostics =
    result.diagnostics && typeof result.diagnostics === "object"
      ? (result.diagnostics as Record<string, unknown>)
      : null;

  return {
    code: typeof result.code === "string" ? result.code : null,
    diagnostics: diagnostics
      ? {
          authorizationHeaderPresent:
            diagnostics.authorizationHeaderPresent === true,
          authSourceUsed:
            typeof diagnostics.authSourceUsed === "string"
              ? diagnostics.authSourceUsed
              : null,
          bearerLooksLikeJwt: diagnostics.bearerLooksLikeJwt === true,
          bearerResponseAud:
            typeof diagnostics.bearerResponseAud === "string"
              ? diagnostics.bearerResponseAud
              : null,
          bearerResponseHasUserId:
            diagnostics.bearerResponseHasUserId === true,
          bearerResponseOk: diagnostics.bearerResponseOk === true,
          bearerResponseRole:
            typeof diagnostics.bearerResponseRole === "string"
              ? diagnostics.bearerResponseRole
              : null,
          bearerResponseStatus:
            typeof diagnostics.bearerResponseStatus === "number"
              ? diagnostics.bearerResponseStatus
              : null,
          bearerUserResolved: diagnostics.bearerUserResolved === true,
          codeBranch:
            typeof diagnostics.codeBranch === "string"
              ? diagnostics.codeBranch
              : null,
          platformAdminResolved: diagnostics.platformAdminResolved === true,
          verificationApiKeySource:
            typeof diagnostics.verificationApiKeySource === "string"
              ? diagnostics.verificationApiKeySource
              : null,
        }
      : null,
    ok: result.ok === true,
  };
}

function redactedJwtClaimsFromAuthorization(authorization: string | undefined) {
  const match = authorization?.match(/^Bearer\s+([^.]+\.[^.]+\.[^.]+)$/);
  const token = match?.[1];

  if (!token) {
    return {
      aud: null,
      expDeltaSeconds: null,
      issHost: null,
      parseOk: false,
      role: null,
      subPresent: false,
    };
  }

  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const exp =
      typeof payload.exp === "number"
        ? payload.exp - Math.floor(Date.now() / 1000)
        : null;
    const issHost =
      typeof payload.iss === "string" ? new URL(payload.iss).host : null;

    return {
      aud: typeof payload.aud === "string" ? payload.aud : null,
      expDeltaSeconds: exp,
      issHost,
      parseOk: true,
      role: typeof payload.role === "string" ? payload.role : null,
      subPresent: typeof payload.sub === "string" && payload.sub.length > 0,
    };
  } catch {
    return {
      aud: null,
      expDeltaSeconds: null,
      issHost: null,
      parseOk: false,
      role: null,
      subPresent: false,
    };
  }
}

async function must(label: string, result: PromiseLike<SupabaseResult>) {
  const resolved = await result;

  if (resolved.error) {
    throw new Error(`TASK051_${label}_FAILED`);
  }
}

async function mustSingle<T>(
  label: string,
  result: PromiseLike<{ data?: T | null; error: unknown }>,
) {
  const resolved = await result;

  if (resolved.error || !resolved.data) {
    throw new Error(`TASK051_${label}_FAILED`);
  }

  return resolved.data;
}

async function optionalDelete(label: string, result: PromiseLike<SupabaseResult>) {
  const resolved = await result;

  if (resolved.error) {
    throw new Error(`TASK051_${label}_CLEANUP_FAILED`);
  }
}

async function createTemporaryPlatformAdmin(): Promise<RuntimeFixture> {
  const runtime = runtimeFromEnv();
  const supabase = createClient<Database>(
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
  const userNonce = nonce().toLowerCase();
  const email = `task051-${userNonce}@example.invalid`;
  const password = `Task051-${randomBytes(24).toString("base64url")}`;
  const createdUser = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });
  const userId = createdUser.data.user?.id;

  if (createdUser.error || !userId) {
    throw new Error("TASK051_PLATFORM_USER_CREATE_FAILED");
  }

  const platformUserId = userId;

  async function cleanup() {
    const now = new Date().toISOString();

    await optionalDelete(
      "PLATFORM_ADMIN_REVOKE",
      supabase
        .from("platform_admins")
        .update({
          reason_redacted: "TASK-051 full E2E cleanup revoked temporary admin.",
          revoked_at: now,
          revoked_by_profile_id: platformUserId,
          status: "revoked",
        })
        .eq("profile_id", platformUserId)
        .eq("status", "active"),
    );
    await optionalDelete(
      "PROFILE_DISABLE",
      supabase
        .from("profiles")
        .update({
          disabled_at: now,
          disabled_by_profile_id: null,
          profile_status: "disabled",
          updated_at: now,
        })
        .eq("profile_id", platformUserId),
    );
    const activeAdmins = await supabase
      .from("platform_admins")
      .select("platform_admin_id")
      .eq("profile_id", platformUserId)
      .eq("status", "active");

    if (activeAdmins.error || (activeAdmins.data?.length ?? 0) !== 0) {
      throw new Error("TASK051_ACTIVE_ADMIN_CLEANUP_FAILED");
    }
  }

  await must(
    "PROFILE_CREATE",
    supabase.from("profiles").upsert(
      {
        display_name: "TASK051 Full E2E Platform Admin",
        profile_id: platformUserId,
        profile_status: "active",
      },
      { onConflict: "profile_id" },
    ),
  );
  await must(
    "PLATFORM_ADMIN_CREATE",
    supabase.from("platform_admins").insert({
      profile_id: platformUserId,
      reason_redacted: "TASK-051 full E2E temporary platform admin.",
      status: "active",
    }),
  );

  return {
    cleanup,
    email,
    password,
    supabase,
    userId: platformUserId,
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
          "TASK-051 full E2E cleanup archived temporary local shop.",
        suspended_at: null,
        suspended_by_profile_id: null,
        updated_at: now,
      })
      .eq("shop_id", shopId)
      .neq("shop_status", "archived"),
  );

  const [staffRows, permissionRows, sessionRows, activeShopRows] =
    await Promise.all([
      supabase.from("staff_accounts").select("staff_id").eq("shop_id", shopId),
      supabase
        .from("staff_role_permissions")
        .select("staff_role_permission_id")
        .eq("shop_id", shopId),
      supabase
        .from("staff_web_sessions")
        .select("staff_web_session_id")
        .eq("shop_id", shopId),
      supabase
        .from("shops")
        .select("shop_id")
        .eq("shop_id", shopId)
        .neq("shop_status", "archived"),
    ]);

  if (
    staffRows.error ||
    permissionRows.error ||
    sessionRows.error ||
    activeShopRows.error ||
    (staffRows.data?.length ?? 0) !== 0 ||
    (permissionRows.data?.length ?? 0) !== 0 ||
    (sessionRows.data?.length ?? 0) !== 0 ||
    (activeShopRows.data?.length ?? 0) !== 0
  ) {
    throw new Error("TASK051_SHOP_CLEANUP_VERIFICATION_FAILED");
  }
}

async function createTemporaryShopAdminAccount(
  fixture: RuntimeFixture,
  shopId: string,
): Promise<AdminAccountFixture> {
  const userNonce = nonce().toLowerCase();
  const email = `task051-shop-admin-${userNonce}@example.invalid`;
  const password = `Task051Admin-${randomBytes(24).toString("base64url")}`;
  const createdUser = await fixture.supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });
  const userId = createdUser.data.user?.id;

  if (createdUser.error || !userId) {
    throw new Error("TASK051_SHOP_ADMIN_USER_CREATE_FAILED");
  }

  try {
    await must(
      "SHOP_ADMIN_PROFILE_CREATE",
      fixture.supabase.from("profiles").upsert(
        {
          display_name: "TASK051 Full E2E Shop Admin",
          profile_id: userId,
          profile_status: "active",
        },
        { onConflict: "profile_id" },
      ),
    );
    await must(
      "SHOP_ADMIN_MEMBERSHIP_CREATE",
      fixture.supabase.from("shop_members").insert({
        invited_by_profile_id: fixture.userId,
        membership_status: "active",
        profile_id: userId,
        role_key: "shop_owner",
        shop_id: shopId,
      }),
    );
  } catch (error) {
    await optionalDelete(
      "SHOP_ADMIN_MEMBER_PARTIAL_CLEANUP",
      fixture.supabase
        .from("shop_members")
        .delete()
        .eq("profile_id", userId)
        .eq("shop_id", shopId),
    );
    await optionalDelete(
      "SHOP_ADMIN_PROFILE_PARTIAL_CLEANUP",
      fixture.supabase.from("profiles").delete().eq("profile_id", userId),
    );
    await fixture.supabase.auth.admin.deleteUser(userId);

    throw error;
  }

  return {
    cleanup: async () => {
      const now = new Date().toISOString();

      await optionalDelete(
        "SHOP_ADMIN_MEMBER_DELETE",
        fixture.supabase
          .from("shop_members")
          .delete()
          .eq("profile_id", userId)
          .eq("shop_id", shopId),
      );
      await optionalDelete(
        "SHOP_ADMIN_PROFILE_DISABLE",
        fixture.supabase
          .from("profiles")
          .update({
            disabled_at: now,
            disabled_by_profile_id: null,
            profile_status: "disabled",
            updated_at: now,
          })
          .eq("profile_id", userId),
      );
    },
    email,
    password,
    userId,
  };
}

async function signInMaster(page: Page, fixture: RuntimeFixture) {
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

async function createPosFirstShop(page: Page) {
  const runNonce = nonce();
  const shopName = `TASK051 E2E ${runNonce}`;
  const companyRut = uniqueRutDigits();
  const legalRepresentativeRut = uniqueRutDigits();
  const shopCode = companyRut;
  const createSection = page.locator("section").filter({
    has: page.getByRole("heading", { level: 2, name: "Create shop" }),
  });

  await page.goto("/platform/provisioning");
  await expect(
    page.getByRole("heading", { level: 1, name: "Shop Provisioning" }),
  ).toBeVisible();
  await expect(createSection).toBeVisible();

  await createSection.getByLabel("Shop name").fill(shopName);
  await createSection.getByLabel("Shop name").blur();
  await createSection
    .getByRole("textbox", { name: "Company RUT" })
    .fill(companyRut);
  await createSection.getByRole("textbox", { name: "Company RUT" }).blur();
  await expect(createSection.getByRole("textbox", { name: "Shop code" })).toHaveValue(
    shopCode,
  );
  await createSection.getByLabel("Business giro").fill("TASK051 retail testing");
  await createSection.getByLabel("Address").fill("Av. TASK051 1234");
  await createSection.getByLabel("City").fill("Santiago");
  await createSection
    .getByLabel("Legal representative RUT")
    .fill(legalRepresentativeRut);
  await createSection.getByLabel("Legal representative RUT").blur();
  await createSection
    .getByLabel("Reason")
    .fill("TASK-051 full local E2E creates a POS-first shop.");
  const createShopRequests: Request[] = [];
  const trackCreateShopRequest = (request: Request) => {
    if (
      request.method() === "POST" &&
      request.url().endsWith("/platform/provisioning/create-shop")
    ) {
      createShopRequests.push(request);
    }
  };
  const createShopResponsePromise = page.waitForResponse(
    (response) => {
      const request = response.request();

      return (
        request.method() === "POST" &&
        response.url().endsWith("/platform/provisioning/create-shop")
      );
    },
    { timeout: 60_000 },
  );

  page.on("request", trackCreateShopRequest);
  await createSection.getByRole("button", { name: "Create POS-first shop" }).click();
  const createShopResponse = await createShopResponsePromise.catch(async (error) => {
    const firstRequestHeaders = createShopRequests[0]?.headers();

    throw new Error(
      `TASK051_CREATE_SHOP_RESPONSE_TIMEOUT ${JSON.stringify({
        authorizationHeaderPresent: Boolean(firstRequestHeaders?.authorization),
        bearerClaims: redactedJwtClaimsFromAuthorization(
          firstRequestHeaders?.authorization,
        ),
        nextActionHeaderPresent: Boolean(firstRequestHeaders?.["next-action"]),
        requestCount: createShopRequests.length,
      })}`,
      {
        cause: error,
      },
    );
  });

  await page.waitForTimeout(250);
  page.off("request", trackCreateShopRequest);

  expect(createShopRequests).toHaveLength(1);
  expect(createShopResponse.ok()).toBe(true);

  const createShopRequestHeaders = createShopRequests[0].headers();
  const createShopResponseBody = (await createShopResponse.json()) as {
    ok?: unknown;
  };

  expect(createShopRequestHeaders.authorization).toMatch(/^Bearer\s+\S+\.\S+\.\S+$/);
  expect(createShopRequestHeaders["next-action"]).toBeUndefined();
  expect(
    redactedJwtClaimsFromAuthorization(createShopRequestHeaders.authorization),
  ).toMatchObject({
    aud: "authenticated",
    parseOk: true,
    role: "authenticated",
    subPresent: true,
  });
  expect(
    createShopResponseBody.ok,
    JSON.stringify({
      bearerClaims: redactedJwtClaimsFromAuthorization(
        createShopRequestHeaders.authorization,
      ),
      provisioningFailure: redactedProvisioningFailure(createShopResponseBody),
    }),
  ).toBe(true);

  const result = page.getByRole("status").filter({ hasText: "Shop created" });
  await expect(result).toBeVisible({ timeout: 20_000 });
  await expect(result).toContainText(shopCode);
  await expect(result).toContainText("1001");

  const temporaryPin = (await result.locator("code").innerText()).trim();

  assertTemporaryPin("TASK051_INITIAL", temporaryPin);

  return {
    initialPin: temporaryPin,
    shopCode,
    shopName: shopName.toUpperCase(),
  };
}

async function assertProvisionedDatabaseState(
  fixture: RuntimeFixture,
  created: CreatedShopState,
) {
  const shop = await mustSingle<ShopRow>(
    "SHOP_CREATED_LOOKUP",
    fixture.supabase
      .from("shops")
      .select("shop_id,shop_code,shop_status")
      .eq("shop_code", created.shopCode ?? "")
      .maybeSingle(),
  );
  const staff = await mustSingle<StaffRow>(
    "STAFF_1001_CREATED_LOOKUP",
    fixture.supabase
      .from("staff_accounts")
      .select("staff_id,status,credential_status,credential_version,role_key")
      .eq("shop_id", shop.shop_id)
      .eq("staff_code", staffCode)
      .maybeSingle(),
  );
  const permission = await mustSingle<{ enabled: boolean }>(
    "STAFF_FULL_ACCESS_PERMISSION_LOOKUP",
    fixture.supabase
      .from("staff_role_permissions")
      .select("enabled")
      .eq("shop_id", shop.shop_id)
      .eq("role_key", "manager")
      .eq("permission_key", "shop_admin.full_access")
      .maybeSingle(),
  );

  expect(shop.shop_status).toBe("active");
  expect(staff.status).toBe("active");
  expect(staff.credential_status).toBe("active");
  expect(staff.role_key).toBe("manager");
  expect(permission.enabled).toBe(true);

  created.shopId = shop.shop_id;
  created.attemptKeyHash = hashStaffWebAttemptKey(shop.shop_code, staffCode);

  return {
    credentialVersion: staff.credential_version ?? 0,
    shopId: shop.shop_id,
    staffId: staff.staff_id,
  };
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

async function assertPinIsNotRenderedAfterLogin(page: Page, pin: string) {
  const bodyText = await page.locator("body").innerText();

  if (bodyText.includes(pin)) {
    throw new Error("TASK051_PIN_RENDERED_AFTER_LOGIN");
  }
}

async function assertPasswordIsNotRenderedAfterLogin(page: Page, password: string) {
  const bodyText = await page.locator("body").innerText();

  if (bodyText.includes(password)) {
    throw new Error("TASK051_ADMIN_PASSWORD_RENDERED_AFTER_LOGIN");
  }
}

async function loginAdminAccountSuccessfully(
  browser: Browser,
  input: {
    email: string;
    password: string;
    shopCode: string;
  },
) {
  const context = await browser.newContext({ baseURL: appBaseUrl() });
  const page = await context.newPage();

  await page.goto("/auth/login?next=/shop");
  await expect(
    page.getByRole("heading", { level: 1, name: "Admin Console sign in" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Admin account credentials" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(input.email);
  await page.getByLabel("Password").fill(input.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/shop", { timeout: 20_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
  await expect(
    page.getByRole("heading", { level: 1, name: "Shop Overview" }),
  ).toBeVisible();
  await expect(page.getByText(input.shopCode).first()).toBeVisible();
  await assertPasswordIsNotRenderedAfterLogin(page, input.password);

  await page.goto("/auth/logout");
  await page.waitForURL((url) => url.pathname === "/auth/login", {
    timeout: 20_000,
  });
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
  await assertPinIsNotRenderedAfterLogin(page, input.pin);

  await page.goto("/shop/staff-logout");
  await page.waitForURL((url) => url.pathname === "/auth/login", {
    timeout: 20_000,
  });
  await context.close();
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
  await expect(page.getByRole("textbox", { name: "Shop code" })).toHaveValue(
    input.shopCode,
  );
  await expect(page.getByRole("textbox", { name: "Staff code" })).toHaveValue(
    staffCode,
  );
  await expect(page.getByLabel("PIN / password")).toBeFocused();
  await expect(page.getByLabel("PIN / password")).toHaveValue("");
  await context.close();
}

async function recoverManager1001(
  page: Page,
  input: {
    shopCode: string;
  },
) {
  const provisioningHeading = page.getByRole("heading", {
    level: 1,
    name: "Shop Provisioning",
  });

  if (!(await provisioningHeading.isVisible({ timeout: 1_000 }).catch(() => false))) {
    await page.goto("/platform/provisioning");
  }

  await expect(
    provisioningHeading,
  ).toBeVisible();
  await page
    .getByText("Emergency recovery: recover initial manager 1001")
    .click();

  const recoveryForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Recover manager 1001" }),
  });

  await recoveryForm.getByPlaceholder("Search target shops").fill(input.shopCode);

  const matchingShopOption = recoveryForm
    .getByRole("option")
    .filter({ hasText: input.shopCode });

  if (await matchingShopOption.first().isVisible({ timeout: 1_000 }).catch(() => false)) {
    await matchingShopOption.first().click();
    await expect(recoveryForm.getByText("Selected shop")).toContainText(
      input.shopCode,
    );
  }

  await recoveryForm
    .getByLabel("Reason")
    .fill("TASK-051 full local E2E recovers manager 1001.");
  await recoveryForm.getByRole("button", { name: "Recover manager 1001" }).click();

  const result = recoveryForm.getByRole("status");

  await expect(result).toContainText("Staff manager web access was provisioned.", {
    timeout: 20_000,
  });
  await expect(result).toContainText(input.shopCode);
  await expect(result).toContainText("1001");

  const recoveredPin = (await result.locator("code").innerText()).trim();

  assertTemporaryPin("TASK051_RECOVERY", recoveredPin);

  return recoveredPin;
}

test.describe("TASK-051 full local shop provisioning and recovery E2E", () => {
  test.skip(
    process.env.CONFIRM_TASK051_FULL_E2E !== "yes",
    "Set CONFIRM_TASK051_FULL_E2E=yes and run through the local target wrapper.",
  );
  test.setTimeout(180_000);

  test("creates a POS-first shop, verifies Admin account and Shop code access, recovers PIN, and logs in with the new PIN", async ({
    browser,
    page,
  }) => {
    const fixture = await createTemporaryPlatformAdmin();
    const created: CreatedShopState = {};
    let shopAdminAccount: AdminAccountFixture | null = null;

    try {
      await signInMaster(page, fixture);

      const provisioned = await createPosFirstShop(page);
      created.shopCode = provisioned.shopCode;

      const initialDatabaseState = await assertProvisionedDatabaseState(
        fixture,
        created,
      );

      shopAdminAccount = await createTemporaryShopAdminAccount(
        fixture,
        initialDatabaseState.shopId,
      );
      await loginAdminAccountSuccessfully(browser, {
        email: shopAdminAccount.email,
        password: shopAdminAccount.password,
        shopCode: provisioned.shopCode,
      });
      await loginShopCodeSuccessfully(browser, {
        pin: provisioned.initialPin,
        shopCode: provisioned.shopCode,
      });

      const recoveredPin = await recoverManager1001(page, {
        shopCode: provisioned.shopCode,
      });

      if (recoveredPin === provisioned.initialPin) {
        throw new Error("TASK051_RECOVERY_PIN_NOT_ROTATED");
      }

      const recoveredStaff = await mustSingle<StaffRow>(
        "STAFF_1001_RECOVERY_LOOKUP",
        fixture.supabase
          .from("staff_accounts")
          .select("staff_id,status,credential_status,credential_version,role_key")
          .eq("shop_id", initialDatabaseState.shopId)
          .eq("staff_code", staffCode)
          .maybeSingle(),
      );

      if (
        (recoveredStaff.credential_version ?? 0) <=
        initialDatabaseState.credentialVersion
      ) {
        throw new Error("TASK051_RECOVERY_CREDENTIAL_VERSION_NOT_INCREMENTED");
      }

      await assertOldPinRejected(browser, {
        oldPin: provisioned.initialPin,
        shopCode: provisioned.shopCode,
      });
      await loginShopCodeSuccessfully(browser, {
        pin: recoveredPin,
        shopCode: provisioned.shopCode,
      });
    } finally {
      await shopAdminAccount?.cleanup();
      await cleanupCreatedShop(fixture.supabase, created, fixture.userId);
      await fixture.cleanup();
    }
  });
});
