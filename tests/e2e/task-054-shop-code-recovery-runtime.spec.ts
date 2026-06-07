import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomInt, scrypt } from "node:crypto";
import type { Database } from "../../src/lib/supabase/database.types";

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

type ReadyRuntime = {
  publishableKey: string;
  serviceRoleKey: string;
  status: "ready";
  supabaseUrl: string;
};

const STAFF_CREDENTIAL_SCHEME = "scrypt-v1";
const STAFF_KEY_LENGTH = 64;
const STAFF_SALT_BYTES = 16;
const STAFF_SCRYPT_PARAMS = {
  N: 16384,
  p: 1,
  r: 8,
};
const STAFF_SCRYPT_MAXMEM = 64 * 1024 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function runtimeFromEnv(): ReadyRuntime | { reason: string; status: "blocked" } {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (process.env.TEST_TARGET !== "local") {
    return { reason: "TASK-054 runtime harness is local-target only.", status: "blocked" };
  }

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return { reason: "Local Supabase env is missing.", status: "blocked" };
  }

  const url = new URL(supabaseUrl);

  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    return { reason: "Refusing to run TASK-054 harness against non-local Supabase.", status: "blocked" };
  }

  return {
    publishableKey,
    serviceRoleKey,
    status: "ready",
    supabaseUrl,
  };
}

function task054Code(nonce: string, label: string) {
  return `TASK054_${label}_${nonce}`.slice(0, 32);
}

async function must(label: string, result: PromiseLike<{ error: unknown }>) {
  const resolved = await result;

  if (resolved.error) {
    throw new Error(`TASK054_${label}_FAILED`);
  }
}

async function mustSingle<T>(
  label: string,
  result: PromiseLike<{ data?: T | null; error: unknown }>,
) {
  const resolved = await result;

  if (resolved.error || !resolved.data) {
    throw new Error(`TASK054_${label}_FAILED`);
  }

  return resolved.data;
}

function staffHashParams() {
  return [
    `n=${STAFF_SCRYPT_PARAMS.N}`,
    `r=${STAFF_SCRYPT_PARAMS.r}`,
    `p=${STAFF_SCRYPT_PARAMS.p}`,
    `l=${STAFF_KEY_LENGTH}`,
  ].join(",");
}

async function deriveStaffScrypt(plaintext: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      plaintext,
      salt,
      STAFF_KEY_LENGTH,
      {
        ...STAFF_SCRYPT_PARAMS,
        maxmem: STAFF_SCRYPT_MAXMEM,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

async function hashStaffCredentialForFixture(plaintext: string) {
  const salt = randomBytes(STAFF_SALT_BYTES);
  const key = await deriveStaffScrypt(plaintext, salt);

  return [
    "",
    STAFF_CREDENTIAL_SCHEME,
    staffHashParams(),
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

function hashStaffWebAttemptKey(shopCode: string, staffCode: string) {
  return `sha256:${createHash("sha256")
    .update(`${shopCode}:${staffCode}`, "utf8")
    .digest("hex")}`;
}

function nextDifferentPin(pin: string) {
  const next = ((Number(pin) - 10000 + 1) % 90000) + 10000;

  return next.toString();
}

function localDatabaseUrl() {
  const output = execFileSync("supabase", ["status", "--output", "env"], {
    encoding: "utf8",
    env: {
      ...process.env,
      DO_NOT_TRACK: "1",
      SUPABASE_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "ignore"],
  });
  const dbUrl = output.match(/^DB_URL="?([^"\n]+)"?$/m)?.[1];

  if (!dbUrl) {
    throw new Error("TASK054_LOCAL_DB_URL_MISSING");
  }

  return dbUrl;
}

function deleteTask054AuditRows(shopId: string) {
  if (!UUID_PATTERN.test(shopId)) {
    throw new Error("TASK054_AUDIT_CLEANUP_SHOP_ID_INVALID");
  }

  execFileSync(
    "psql",
    [
      localDatabaseUrl(),
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      [
        "alter table public.audit_logs disable trigger user",
        `delete from public.audit_logs where shop_id = '${shopId}'`,
        "alter table public.audit_logs enable trigger user",
      ].join(";"),
    ],
    {
      env: {
        ...process.env,
        PGCONNECT_TIMEOUT: "5",
      },
      stdio: "ignore",
    },
  );
}

async function createTask054Fixture(runtime: ReadyRuntime) {
  const supabase = createClient<Database>(runtime.supabaseUrl, runtime.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const nonce = randomBytes(5).toString("hex").toUpperCase();
  const email = `task054-${nonce.toLowerCase()}@example.invalid`;
  const temporaryPin = randomInt(10000, 100000).toString();
  const shopCode = task054Code(nonce, "SHOP");
  const staffCode = "1001";
  const now = new Date().toISOString();
  const createdUser = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password: randomBytes(24).toString("base64url"),
  });
  const maybeUserId = createdUser.data.user?.id;

  if (createdUser.error || !maybeUserId) {
    throw new Error("TASK054_AUTH_USER_CREATE_FAILED");
  }

  const userId = maybeUserId;
  let shopId = "";
  const attemptKeyHash = hashStaffWebAttemptKey(shopCode, staffCode);

  async function cleanup() {
    const errors: string[] = [];

    async function record(label: string, result: PromiseLike<{ error: unknown }>) {
      const { error } = await result;

      if (error) {
        errors.push(label);
      }
    }

    if (shopId) {
      await record(
        "STAFF_WEB_SESSION_DELETE",
        supabase.from("staff_web_sessions").delete().eq("shop_id", shopId),
      );
      await record(
        "STAFF_ROLE_PERMISSION_DELETE",
        supabase.from("staff_role_permissions").delete().eq("shop_id", shopId),
      );
      await record("STAFF_DELETE", supabase.from("staff_accounts").delete().eq("shop_id", shopId));
      try {
        deleteTask054AuditRows(shopId);
      } catch {
        errors.push("AUDIT_DELETE");
      }
      await record("SHOP_DELETE", supabase.from("shops").delete().eq("shop_id", shopId));
    }

    await record(
      "STAFF_WEB_LOGIN_ATTEMPT_DELETE",
      supabase
        .from("staff_web_login_attempts")
        .delete()
        .eq("attempt_key_hash", attemptKeyHash),
    );
    await record("PROFILE_DELETE", supabase.from("profiles").delete().eq("profile_id", userId));

    const deletedUser = await supabase.auth.admin.deleteUser(userId);

    if (deletedUser.error) {
      errors.push("AUTH_USER_DELETE");
    }

    expect(errors).toEqual([]);
  }

  await must(
    "PROFILE_CREATE",
    supabase.from("profiles").upsert(
      {
        display_name: `TASK054 Shop Login ${nonce}`,
        profile_id: userId,
        profile_status: "active",
      },
      { onConflict: "profile_id" },
    ),
  );

  const shop = await mustSingle<{ shop_id: string }>(
    "SHOP_CREATE",
    supabase
      .from("shops")
      .insert({
        created_by_profile_id: userId,
        shop_code: shopCode,
        shop_name: `TASK054 Shop ${nonce}`,
        shop_status: "active",
        status_changed_by_profile_id: userId,
      })
      .select("shop_id")
      .single(),
  );

  shopId = shop.shop_id;

  await must(
    "ROLE_PERMISSION_CREATE",
    supabase.from("staff_role_permissions").upsert(
      {
        enabled: true,
        permission_key: "shop_admin.full_access",
        role_key: "manager",
        shop_id: shopId,
        updated_by_profile_id: userId,
      },
      { onConflict: "shop_id,role_key,permission_key" },
    ),
  );

  await must(
    "STAFF_CREATE",
    supabase.from("staff_accounts").insert({
      created_by_profile_id: userId,
      credential_hash: await hashStaffCredentialForFixture(temporaryPin),
      credential_kind: "password",
      credential_status: "active",
      credential_updated_at: now,
      credential_version: 1,
      display_name: "manager",
      failed_attempts: 0,
      must_change_credential: false,
      role_key: "manager",
      shop_id: shopId,
      staff_code: staffCode,
      status: "active",
      updated_by_profile_id: userId,
    }),
  );

  return {
    cleanup,
    shopCode,
    staffCode,
    temporaryPin,
  };
}

test("TASK-054 Shop code login diagnoses wrong PIN, preserves safe fields, and accepts a 5 digit manager PIN", async ({
  page,
}) => {
  const runtime = runtimeFromEnv();

  if (runtime.status !== "ready") {
    test.skip(true, runtime.reason);
    return;
  }

  const fixture = await createTask054Fixture(runtime);

  try {
    await page.goto("/auth/login?next=/shop&mode=shop-code");
    await expect(
      page.getByRole("heading", { level: 1, name: "Admin Console sign in" }),
    ).toBeVisible();

    await page.getByRole("textbox", { name: "Shop code" }).fill(fixture.shopCode);
    await page.getByRole("textbox", { name: "Staff code" }).fill(fixture.staffCode);
    await page.getByLabel("PIN / password").fill(nextDifferentPin(fixture.temporaryPin));
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(
      page.getByText("PIN/password is not correct for this staff account."),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Shop code" })).toHaveValue(
      fixture.shopCode,
    );
    await expect(page.getByRole("textbox", { name: "Staff code" })).toHaveValue(
      fixture.staffCode,
    );
    await expect(page.getByLabel("PIN / password")).toBeFocused();
    await expect(page.getByLabel("PIN / password")).toHaveValue("");

    await page.getByLabel("PIN / password").fill(fixture.temporaryPin);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/shop", { timeout: 15_000 }),
      page.getByRole("button", { name: "Sign in" }).click(),
    ]);

    await expect(
      page.getByRole("heading", { level: 1, name: "Shop Overview" }),
    ).toBeVisible();
    await expect(page.getByText(fixture.shopCode).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(fixture.temporaryPin);
  } finally {
    await fixture.cleanup();
  }
});
