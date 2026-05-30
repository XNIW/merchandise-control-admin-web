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
      .getByText("Read-only", { exact: true }),
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
      page.getByRole("heading", { level: 1, name: "Platform Admin sign in" }),
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
      await expectAuthorizedReadOnlyPlatform(page, "Disabled");
      for (const label of ["Create shop", "Assign owner", "Suspend shop"]) {
        await expect(page.getByRole("button", { name: label })).toBeDisabled();
      }

      await page.goto("/auth/logout");
      await page.goto("/platform");
      await expect(
        page
          .locator('section[aria-labelledby="platform-page-title"]')
          .getByText("Unauthorized", { exact: true }),
      ).toBeVisible();
    } finally {
      await credentials.cleanup();
    }
  });
});
