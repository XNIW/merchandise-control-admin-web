import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "@e965/xlsx";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomBytes, scrypt } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import type { Database } from "../../src/lib/supabase/database.types";

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

type AdminClient = SupabaseClient<Database>;

type Runtime =
  | {
      reason: string;
      status: "blocked";
      supabaseTargetKind: string;
    }
  | {
      publishableKey: string;
      serviceRoleKey: string;
      status: "ready";
      supabaseTargetKind: "local";
      supabaseUrl: string;
    };

type Task060Fixture = {
  categoryId: string;
  cleanup: () => Promise<readonly string[]>;
  email: string;
  password: string;
  shopCode: string;
  shopId: string;
  staffCode: string;
  staffCredential: string;
  staffId: string;
  supplierId: string;
  supabase: AdminClient;
  userId: string;
};

const TASK060_BARCODE = "9060600000012";
const TASK060_NEW_BARCODE = "9060600000029";
const TASK060_BELINA_BARCODE = "9060600000036";
const TASK060_CATEGORY_NAME = "TASK060 Category";
const TASK060_SUPPLIER_NAME = "TASK060 Supplier";
const STAFF_CREDENTIAL_SCHEME = "scrypt-v1";
const STAFF_KEY_LENGTH = 64;
const STAFF_SALT_BYTES = 16;
const REAL_DINGLI_WORKBOOK_PATH =
  process.env.TASK060_REAL_DINGLI_PATH ??
  "/Users/minxiang/Downloads/Vs20260519-456(Dingli).xlsx";
const REAL_BELINA_WORKBOOK_PATH =
  process.env.TASK060_REAL_BELINA_PATH ??
  "/Users/minxiang/Downloads/2604137549-Belina.xls";
const STAFF_SCRYPT_PARAMS = {
  N: 16384,
  p: 1,
  r: 8,
};
const STAFF_SCRYPT_MAXMEM = 64 * 1024 * 1024;

function loadEnvFile(path: string) {
  if (!existsSync(path)) {
    return;
  }

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
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
}

function parseSupabaseStatusEnv(output: string) {
  const values: Record<string, string> = {};

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);

    if (match) {
      values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }

  return values;
}

function localSupabaseStatusEnv() {
  return parseSupabaseStatusEnv(
    execFileSync("supabase", ["status", "--output", "env"], {
      encoding: "utf8",
      env: {
        ...process.env,
        DO_NOT_TRACK: "1",
        SUPABASE_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
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

function isLocalSupabaseUrl(url: URL) {
  return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
}

function supabaseTargetKind(value: string | undefined) {
  if (!value) {
    return "missing";
  }

  try {
    const url = new URL(value);

    if (isLocalSupabaseUrl(url)) {
      return "local";
    }

    if (url.hostname.endsWith(".supabase.co")) {
      return "supabase_cloud";
    }

    return "custom_remote";
  } catch {
    return "invalid";
  }
}

function resolveRuntime(): Runtime {
  readRuntimeEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const targetKind = supabaseTargetKind(supabaseUrl);

  if (!supabaseUrl) {
    return {
      reason: "BLOCKED_TASK060_BROWSER_QA: NEXT_PUBLIC_SUPABASE_URL is not configured.",
      status: "blocked",
      supabaseTargetKind: targetKind,
    };
  }

  if (targetKind !== "local") {
    return {
      reason:
        "BLOCKED_TASK060_BROWSER_QA: supplier import browser QA writes only TASK060_* local synthetic data.",
      status: "blocked",
      supabaseTargetKind: targetKind,
    };
  }

  if (!publishableKey) {
    return {
      reason:
        "BLOCKED_TASK060_BROWSER_QA: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required.",
      status: "blocked",
      supabaseTargetKind: targetKind,
    };
  }

  if (!serviceRoleKey) {
    return {
      reason:
        "BLOCKED_TASK060_BROWSER_QA: local SUPABASE_SERVICE_ROLE_KEY is required for synthetic cleanup.",
      status: "blocked",
      supabaseTargetKind: targetKind,
    };
  }

  return {
    publishableKey,
    serviceRoleKey,
    status: "ready",
    supabaseTargetKind: "local",
    supabaseUrl,
  };
}

function cleanupTask060LocalRows(attemptKeyHash?: string) {
  const env = localSupabaseStatusEnv();
  const dbUrl = env.DB_URL;

  if (!dbUrl) {
    return ["DB_URL_MISSING"];
  }

  const sql = String.raw`
BEGIN;
SET LOCAL session_replication_role = replica;
CREATE TEMP TABLE task060_users AS
  SELECT created_by_profile_id AS id
  FROM public.shops
  WHERE shop_code LIKE 'TASK060_%' AND created_by_profile_id IS NOT NULL
  UNION
  SELECT profile_id AS id
  FROM public.profiles
  WHERE display_name LIKE 'TASK060%'
  UNION
  SELECT id
  FROM auth.users
  WHERE email LIKE 'task060-%@example.invalid';
CREATE TEMP TABLE task060_shops AS
  SELECT shop_id
  FROM public.shops
  WHERE shop_code LIKE 'TASK060_%'
     OR created_by_profile_id IN (SELECT id FROM task060_users);
DELETE FROM public.audit_logs
WHERE shop_id IN (SELECT shop_id FROM task060_shops)
   OR actor_profile_id IN (SELECT id FROM task060_users)
   OR actor_staff_id IN (
     SELECT staff_id FROM public.staff_accounts
     WHERE shop_id IN (SELECT shop_id FROM task060_shops)
   );
DELETE FROM public.staff_web_sessions
WHERE shop_id IN (SELECT shop_id FROM task060_shops)
   OR staff_id IN (
     SELECT staff_id FROM public.staff_accounts
     WHERE shop_id IN (SELECT shop_id FROM task060_shops)
   );
DELETE FROM public.staff_role_permissions
WHERE shop_id IN (SELECT shop_id FROM task060_shops);
DELETE FROM public.staff_accounts
WHERE shop_id IN (SELECT shop_id FROM task060_shops);
DELETE FROM public.inventory_product_prices
WHERE owner_user_id IN (SELECT id FROM task060_users)
   OR shop_id IN (SELECT shop_id FROM task060_shops);
DELETE FROM public.inventory_products
WHERE owner_user_id IN (SELECT id FROM task060_users)
   OR shop_id IN (SELECT shop_id FROM task060_shops);
DELETE FROM public.inventory_categories
WHERE owner_user_id IN (SELECT id FROM task060_users)
   OR shop_id IN (SELECT shop_id FROM task060_shops);
DELETE FROM public.inventory_suppliers
WHERE owner_user_id IN (SELECT id FROM task060_users)
   OR shop_id IN (SELECT shop_id FROM task060_shops);
DELETE FROM public.shop_inventory_sources
WHERE shop_id IN (SELECT shop_id FROM task060_shops)
   OR owner_user_id IN (SELECT id FROM task060_users);
DELETE FROM public.shop_members
WHERE shop_id IN (SELECT shop_id FROM task060_shops)
   OR profile_id IN (SELECT id FROM task060_users);
DELETE FROM public.shops
WHERE shop_id IN (SELECT shop_id FROM task060_shops);
DELETE FROM public.profiles
WHERE profile_id IN (SELECT id FROM task060_users);
DELETE FROM auth.users
WHERE id IN (SELECT id FROM task060_users);
COMMIT;
`;
  const result = spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    return ["SQL_CLEANUP_FAILED"];
  }

  if (!attemptKeyHash) {
    return [];
  }

  const safeAttemptKeyHash = attemptKeyHash.replace(/'/g, "''");
  const attemptCleanup = spawnSync(
    "psql",
    [
      dbUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `delete from public.staff_web_login_attempts where attempt_key_hash = '${safeAttemptKeyHash}'`,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  return attemptCleanup.status === 0 ? [] : ["ATTEMPT_CLEANUP_FAILED"];
}

async function must<T>(
  label: string,
  result: PromiseLike<{ data: T; error: unknown }>,
) {
  const { data, error } = await result;

  if (error) {
    throw new Error(`BLOCKED_TASK060_${label}`);
  }

  return data;
}

async function mustSingle<T>(
  label: string,
  result: PromiseLike<{ data: T | null; error: unknown }>,
) {
  const { data, error } = await result;

  if (error || data === null) {
    throw new Error(`BLOCKED_TASK060_${label}`);
  }

  return data;
}

async function createTask060Fixture(
  runtime: Extract<Runtime, { status: "ready" }>,
  options: {
    permissions?: readonly string[];
  } = {},
): Promise<Task060Fixture> {
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
  const nonce = randomBytes(5).toString("hex").toUpperCase();
  const email = `task060-${nonce.toLowerCase()}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  const shopCode = `TASK060_SHOP_${nonce}`;
  const staffCode = `TASK060_STAFF_${nonce}`;
  const staffCredential = `task060_staff_${randomBytes(18).toString("base64url")}`;
  const attemptKeyHash = hashStaffWebAttemptKey(shopCode, staffCode);
  const permissions = options.permissions ?? ["shop_admin.full_access"];
  const now = new Date().toISOString();
  const createdUser = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });
  const maybeUserId = createdUser.data.user?.id;

  if (createdUser.error || !maybeUserId) {
    throw new Error("BLOCKED_TASK060_AUTH_USER_CREATE");
  }

  const userId = maybeUserId;
  let shopId = "";
  let categoryId = "";
  let staffId = "";
  let supplierId = "";

  async function cleanup() {
    return cleanupTask060LocalRows(attemptKeyHash);
  }

  try {
    await must(
      "PROFILE_CREATE",
      supabase.from("profiles").upsert(
        {
          display_name: `TASK060 Shop Admin ${nonce}`,
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
          shop_name: `TASK060 Authorized Shop ${nonce}`,
          shop_status: "active",
          status_changed_by_profile_id: userId,
        })
        .select("shop_id")
        .single(),
    );

    shopId = shop.shop_id;

    await must(
      "MEMBERSHIP_CREATE",
      supabase.from("shop_members").insert({
        invited_by_profile_id: userId,
        membership_status: "active",
        profile_id: userId,
        role_key: "shop_owner",
        shop_id: shopId,
      }),
    );
    await must(
      "INVENTORY_MAPPING_CREATE",
      supabase.from("shop_inventory_sources").insert({
        created_by_profile_id: userId,
        mapping_state: "mapped",
        owner_user_id: userId,
        shop_id: shopId,
        source_kind: "mobile_owner",
        verified_at: now,
        verified_by_profile_id: userId,
      }),
    );
    await must(
      "ROLE_PERMISSION_CREATE",
      supabase.from("staff_role_permissions").upsert(
        permissions.map((permission) => ({
          enabled: true,
          permission_key: permission,
          role_key: "manager",
          shop_id: shopId,
          updated_by_profile_id: userId,
        })),
        { onConflict: "shop_id,role_key,permission_key" },
      ),
    );
    const supplier = await mustSingle<{ id: string }>(
      "SUPPLIER_CREATE",
      supabase
        .from("inventory_suppliers")
        .insert({
          name: TASK060_SUPPLIER_NAME,
          owner_user_id: userId,
          shop_id: shopId,
        })
        .select("id")
        .single(),
    );
    supplierId = supplier.id;
    const category = await mustSingle<{ id: string }>(
      "CATEGORY_CREATE",
      supabase
        .from("inventory_categories")
        .insert({
          name: TASK060_CATEGORY_NAME,
          owner_user_id: userId,
          shop_id: shopId,
        })
        .select("id")
        .single(),
    );
    categoryId = category.id;
    const staff = await mustSingle<{ staff_id: string }>(
      "STAFF_CREATE",
      supabase
        .from("staff_accounts")
        .insert({
          created_by_profile_id: userId,
          credential_hash: await hashStaffCredentialForFixture(staffCredential),
          credential_kind: "password",
          credential_status: "active",
          credential_updated_at: now,
          credential_version: 1,
          display_name: `TASK060 Manager ${nonce}`,
          failed_attempts: 0,
          must_change_credential: false,
          role_key: "manager",
          shop_id: shopId,
          staff_code: staffCode,
          status: "active",
          updated_by_profile_id: userId,
        })
        .select("staff_id")
        .single(),
    );
    staffId = staff.staff_id;
    await must(
      "EXISTING_PRODUCT_CREATE",
      supabase.from("inventory_products").insert({
        barcode: TASK060_BARCODE,
        item_number: "TASK060-EXISTING",
        owner_user_id: userId,
        product_name: "Existing TASK060 Cafe",
        purchase_price: 4.56,
        retail_price: 2.5,
        shop_id: shopId,
        stock_quantity: 5,
      }),
    );
  } catch (error) {
    await cleanup();
    throw error;
  }

  return {
    categoryId,
    cleanup,
    email,
    password,
    shopCode,
    shopId,
    staffCode,
    staffCredential,
    staffId,
    supplierId,
    supabase,
    userId,
  };
}

async function signInWithShopCode(
  page: Page,
  fixture: Task060Fixture,
  nextPath = "/shop",
) {
  await page.goto(
    `/auth/login?${new URLSearchParams({
      mode: "shop-code",
      next: nextPath,
    }).toString()}`,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Admin Console sign in" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Shop code" }).fill(fixture.shopCode);
  await page.getByRole("textbox", { name: "Staff code" }).fill(fixture.staffCode);
  await page.getByLabel("PIN / password", { exact: true }).fill(fixture.staffCredential);

  await Promise.all([
    page.waitForURL((url) => `${url.pathname}${url.search}` === nextPath, {
      timeout: 15_000,
    }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

async function writeDingliSupplierWorkbook(path: string) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["订单ID", "TASK060 synthetic Dingli-like supplier workbook"],
    ["客户", "redacted local fixture"],
    [],
    ["订单日期", "2026-06-13 10:00:00"],
    [],
    [],
    [
      "NO",
      "产品货号",
      "条码",
      "产品名1",
      "产品名2",
      "数量",
      "单价",
      "折扣",
      "售价",
      "总价",
    ],
    [
      1,
      "TASK060-EXISTING",
      TASK060_BARCODE,
      "TASK060 Existing Cafe",
      "TASK060 Cafe ES",
      7,
      1.25,
      0,
      2.5,
      8.75,
    ],
    [
      2,
      "TASK060-NEW-ITEM",
      TASK060_NEW_BARCODE,
      "TASK060 New Dingli Tea",
      "TASK060 Tea ES",
      14,
      3.1,
      0,
      6.2,
      43.4,
    ],
    [
      3,
      "TASK060-SAMPLE-3",
      "9060600000043",
      "TASK060 Sample Dingli 3",
      "TASK060 Sample ES 3",
      5,
      4.4,
      0,
      8.8,
      22,
    ],
    [
      4,
      "TASK060-SAMPLE-4",
      "9060600000050",
      "TASK060 Sample Dingli 4",
      "TASK060 Sample ES 4",
      6,
      5.5,
      0,
      11,
      33,
    ],
    [
      5,
      "TASK060-SAMPLE-5",
      "9060600000067",
      "TASK060 Sample Dingli 5",
      "TASK060 Sample ES 5",
      7,
      6.6,
      0,
      13.2,
      46.2,
    ],
    [
      6,
      "TASK060-SAMPLE-6",
      "9060600000074",
      "TASK060 Sample Dingli 6",
      "TASK060 Sample ES 6",
      8,
      7.7,
      0,
      15.4,
      61.6,
    ],
  ]);
  const workbookType: "xls" | "xlsx" = path.toLowerCase().endsWith(".xls")
    ? "xls"
    : "xlsx";

  XLSX.utils.book_append_sheet(workbook, worksheet, "产品");

  const buffer = XLSX.write(workbook, {
    bookType: workbookType,
    type: "buffer",
  });

  await writeFile(path, buffer);
}

async function writeBelinaSupplierWorkbook(path: string) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Documento", "2604137549"],
    ["Proveedor", "TASK060 Belina synthetic workbook"],
    [],
    [
      "Ref",
      "Código Barras",
      "Descripción",
      "Local Descripción",
      "CNT",
      "Precio",
      "IMP(CLP)",
    ],
    [
      "TASK060-BELINA-EXISTING",
      TASK060_BARCODE,
      "TASK060 Belina Existing Cafe",
      "TASK060 Belina Local ES",
      4,
      11.11,
      9999,
    ],
    [
      "TASK060-BELINA-NEW",
      TASK060_BELINA_BARCODE,
      "TASK060 Belina New Tea",
      "TASK060 Belina Tea Local",
      9,
      22.22,
      8888,
    ],
  ]);

  XLSX.utils.book_append_sheet(workbook, worksheet, "Belina");

  const buffer = XLSX.write(workbook, {
    bookType: "xls",
    type: "buffer",
  });

  await writeFile(path, buffer);
}

async function openSupplierImportDialog(
  page: Page,
  fixture: Task060Fixture,
  workbookPath: string,
) {
  await page.goto(`/shop/products?shop_id=${fixture.shopId}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Products" }),
  ).toBeVisible();
  await expect(page.getByText("Shop Manager")).toBeVisible();
  await page.getByRole("button", { name: "Import supplier Excel" }).click();

  const dialog = page.getByRole("dialog", {
    name: "Supplier workbook preview",
  });

  await expect(dialog).toBeVisible();
  await dialog.locator('input[type="file"]').setInputFiles(workbookPath);
  await expect(
    dialog.getByText(workbookPath.split(/[/\\]/).pop() ?? workbookPath),
  ).toBeVisible();

  return dialog;
}

async function expireActiveStaffWebSession(fixture: Task060Fixture) {
  await must(
    "STAFF_SESSION_EXPIRE",
    fixture.supabase
      .from("staff_web_sessions")
      .update({
        expires_at: new Date(Date.now() - 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("shop_id", fixture.shopId)
      .eq("staff_id", fixture.staffId)
      .eq("status", "active"),
  );
}

async function deleteActiveStaffWebSession(fixture: Task060Fixture) {
  await must(
    "STAFF_SESSION_DELETE",
    fixture.supabase
      .from("staff_web_sessions")
      .delete()
      .eq("shop_id", fixture.shopId)
      .eq("staff_id", fixture.staffId)
      .eq("status", "active"),
  );
}

test.describe("TASK-060 supplier Excel preview/import browser QA", () => {
  const runtime = resolveRuntime();

  test("Shop Code manager previews Dingli-like supplier workbook and creates products", async ({
    page,
  }, testInfo) => {
    if (runtime.status !== "ready") {
      test.skip(true, runtime.reason);
      return;
    }

    const fixture = await createTask060Fixture(runtime);
    const workbookPath = testInfo.outputPath("task060-supplier.xlsx");

    await writeDingliSupplierWorkbook(workbookPath);

    try {
      await signInWithShopCode(page, fixture);
      await page.goto(`/shop/products?shop_id=${fixture.shopId}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Products" }),
      ).toBeVisible();
      await expect(page.getByText("Shop Manager")).toBeVisible();

      await page.getByRole("button", { name: "Import supplier Excel" }).click();
      const dialog = page.getByRole("dialog", {
        name: "Supplier workbook preview",
      });

      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByText("Drop a supplier .xlsx or .xls workbook here or choose a file."),
      ).toBeVisible();

      await dialog.locator('input[type="file"]').setInputFiles(workbookPath);
      await expect(dialog.getByText(/task060-supplier\.xlsx/)).toBeVisible();
      await dialog.getByRole("button", { name: "Preview workbook" }).click();

      await expect(
        dialog.getByRole("heading", { name: "Verify detected product columns" }),
      ).toBeVisible();
      await expect(dialog.locator('[data-import-step="workbook-file"]')).toHaveCount(0);
      await expect(
        dialog.getByText("Drop a supplier .xlsx or .xls workbook here or choose a file."),
      ).toHaveCount(0);
      await expect(dialog.getByLabel("Default supplier")).toBeVisible();
      await expect(dialog.getByLabel("Default category")).toBeVisible();
      await dialog.getByLabel("Default supplier").fill(TASK060_SUPPLIER_NAME);
      await dialog.getByLabel("Default category").fill(TASK060_CATEGORY_NAME);
      await expect(dialog.getByText("Product row sample")).toBeVisible();
      await expect(dialog.getByText("Show raw workbook context")).toBeVisible();
      const sampleSection = dialog.locator("[data-product-row-sample]");
      const visibleSampleTable = sampleSection.locator("[data-product-row-sample-table]");

      await expect(
        visibleSampleTable.getByRole("columnheader", { name: "Row" }),
      ).toHaveCount(0);
      await expect(
        visibleSampleTable.locator("tbody tr"),
      ).toHaveCount(5);
      await expect(
        dialog.getByRole("columnheader", { name: "条码 (Col 3)" }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("columnheader", { name: "产品名1 (Col 4)" }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("cell", { exact: true, name: "TASK060 Existing Cafe" }).first(),
      ).toBeVisible();
      await sampleSection.screenshot({
        path: "docs/TASKS/EVIDENCE/TASK-060/browser-fix7-step2-dingli-sample.png",
      });
      await expect(dialog.getByRole("columnheader", { name: "Detected Excel column" })).toBeVisible();
      await expect(dialog.getByRole("columnheader", { name: "Use" })).toBeVisible();
      await expect(dialog.getByRole("columnheader", { name: "Requirement" })).toBeVisible();
      await expect(dialog.getByRole("columnheader", { name: "Sample values" })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Apply confirmed import" })).toHaveCount(0);
      await expect(dialog.getByLabel("Barcode column")).toHaveValue("2");
      await expect(dialog.getByLabel("Product name column")).toHaveValue("3");
      await expect(dialog.getByLabel("Second name column")).toHaveValue("4");
      await expect(dialog.getByLabel("Purchase price column")).toHaveValue("6");
      await expect(dialog.getByLabel("Retail price column")).toHaveCount(0);
      await expect(dialog.getByLabel("Use Retail price")).toHaveCount(0);
      await expect(dialog.getByLabel("Use Barcode")).toBeChecked();
      await expect(dialog.getByLabel("Use Barcode")).toBeDisabled();
      await expect(dialog.getByLabel("Use Product name")).toBeChecked();
      await expect(dialog.getByLabel("Use Product name")).toBeDisabled();
      await dialog.getByLabel("Purchase price column").selectOption("4");
      await expect(
        dialog.getByText("Choose a numeric column before continuing."),
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Continue to import preview" }),
      ).toBeDisabled();
      await dialog.getByLabel("Purchase price column").selectOption("6");
      await expect(dialog.getByLabel("Use Discount", { exact: true })).not.toBeChecked();
      await expect(
        dialog.getByLabel("Use Discounted price", { exact: true }),
      ).not.toBeChecked();
      await expect(dialog.getByLabel("Use Total price", { exact: true })).not.toBeChecked();
      await dialog.getByLabel("Use Discount", { exact: true }).check();
      await dialog.getByLabel("Use Discounted price", { exact: true }).check();
      await dialog.getByLabel("Use Total price", { exact: true }).check();
      await expect(
        dialog.getByText("Mapping changed. Re-run preview with mapping before continuing."),
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Continue to import preview" }),
      ).toBeDisabled();
      await dialog.getByRole("button", { name: "Re-run preview with mapping" }).click();
      await expect(
        dialog.getByText("Mapping changed. Re-run preview with mapping before continuing."),
      ).toHaveCount(0);
      await dialog.screenshot({
        path: "docs/TASKS/EVIDENCE/TASK-060/browser-fix7-step2-dingli-mapping.png",
      });
      await dialog.getByRole("button", { name: "Continue to import preview" }).click();
      await expect(dialog.getByRole("heading", { name: "Import preview" })).toBeVisible();
      await expect(dialog.getByRole("heading", { name: "Blocked rows" })).toHaveCount(0);
      await expect(dialog.locator('[data-import-step="workbook-file"]')).toHaveCount(0);
      await expect(dialog.getByLabel("Default supplier")).toHaveCount(0);
      await expect(dialog.getByLabel("Default category")).toHaveCount(0);
      await expect(
        dialog.getByRole("columnheader", { name: "Product" }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("columnheader", { exact: true, name: "Recognized" }),
      ).toHaveCount(0);
      await expect(
        dialog.getByRole("columnheader", { name: "Recognized from file" }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("columnheader", { name: "Current catalog values" }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("columnheader", { name: "Import values" }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("columnheader", { exact: true, name: "Supplier" }),
      ).toHaveCount(0);
      await expect(
        dialog.getByRole("columnheader", { exact: true, name: "Category" }),
      ).toHaveCount(0);
      await expect(dialog.getByText(TASK060_BARCODE)).toBeVisible();
      await expect(
        dialog.getByRole("cell", { exact: true, name: "TASK060 Cafe" }),
      ).toHaveCount(0);
      await expect(
        dialog.getByText("TASK060 Existing Cafe"),
      ).toBeVisible();
      await expect(dialog.getByText(TASK060_NEW_BARCODE)).toBeVisible();
      await expect(
        dialog.getByText("TASK060 New Dingli Tea"),
      ).toBeVisible();
      await expect(dialog.getByText("Discount", { exact: true }).first()).toBeVisible();
      await expect(
        dialog.getByText("Discounted price", { exact: true }).first(),
      ).toBeVisible();
      await expect(dialog.getByText("Total price", { exact: true }).first()).toBeVisible();
      await expect(dialog.getByText("New product").first()).toBeVisible();
      await dialog.screenshot({
        path: "docs/TASKS/EVIDENCE/TASK-060/browser-fix7-step3-dingli-preview.png",
      });
      await dialog.screenshot({
        path: "docs/TASKS/EVIDENCE/TASK-060/browser-supplier-preview.png",
      });

      const quantityInputs = dialog.getByLabel(/Quantity to import for row/);
      const retailInputs = dialog.getByLabel(/Retail price to import for row/);
      const quantityInput = quantityInputs.first();
      const retailInput = retailInputs.first();
      const previewScroller = dialog.locator("[data-preview-table-scroll]");
      const scrollMetrics = await previewScroller.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollLeft: element.scrollLeft,
        scrollWidth: element.scrollWidth,
      }));

      await expect(quantityInput).toHaveValue("");
      await expect(retailInput).toHaveValue("");
      await expect(quantityInput).toBeInViewport();
      await expect(retailInput).toBeInViewport();
      expect(scrollMetrics.scrollLeft).toBe(0);
      expect(scrollMetrics.scrollWidth).toBeLessThanOrEqual(
        scrollMetrics.clientWidth + 2,
      );
      await expect(quantityInputs.nth(1)).toHaveValue("");
      await expect(retailInputs.nth(1)).toHaveValue("");
      await dialog.getByRole("button", { name: "Back to check columns" }).click();
      await expect(
        dialog.getByRole("heading", { name: "Verify detected product columns" }),
      ).toBeVisible();
      await expect(dialog.getByLabel("Default supplier")).toHaveValue(TASK060_SUPPLIER_NAME);
      await dialog.getByRole("button", { name: "Back to workbook file" }).click();
      await expect(dialog.locator('[data-import-step="workbook-file"]')).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Replace file" })).toBeVisible();
      await dialog.getByRole("button", { name: "Preview workbook" }).click();
      await expect(
        dialog.getByRole("heading", { name: "Verify detected product columns" }),
      ).toBeVisible();
      await dialog.getByRole("button", { name: "Continue to import preview" }).click();
      await expect(dialog.getByRole("heading", { name: "Import preview" })).toBeVisible();

      const retryRetailInput = dialog.getByLabel(/Retail price to import for row/).first();

      await expect(retryRetailInput).toHaveValue("");
      await retryRetailInput.fill("9.99");
      await dialog.getByLabel("Confirm APPLY").fill("APPLY");
      await expect(
        dialog.getByRole("button", { name: "Apply confirmed import" }),
      ).toBeEnabled();
      await dialog.getByRole("button", { name: "Apply confirmed import" }).click();
      await expect(dialog.getByText("Result summary")).toBeVisible({
        timeout: 15_000,
      });
      await expect(dialog.getByText(/Products 6,/)).toBeVisible();
      await expect(dialog.locator("[data-sync-analysis-panel]")).toBeVisible();
      await expect(dialog.getByText("Sync / Import analysis")).toBeVisible();
      await expect(dialog.getByText("history_changed").first()).toBeVisible();
      await expect(dialog.getByRole("link", { name: "Open History Entry" })).toBeVisible();
      await dialog.screenshot({
        path: "docs/TASKS/EVIDENCE/TASK-079/browser/browser-products-import-apply-sync-analysis.png",
      });

      const { data: existingProduct, error: existingError } = await fixture.supabase
        .from("inventory_products")
        .select("category_id, item_number, product_name, purchase_price, retail_price, stock_quantity, supplier_id")
        .eq("shop_id", fixture.shopId)
        .eq("barcode", TASK060_BARCODE)
        .maybeSingle();
      const { data: newProduct, error: newError } = await fixture.supabase
        .from("inventory_products")
        .select("category_id, item_number, product_name, second_product_name, purchase_price, retail_price, stock_quantity, supplier_id")
        .eq("shop_id", fixture.shopId)
        .eq("barcode", TASK060_NEW_BARCODE)
        .maybeSingle();

      expect(existingError).toBeNull();
      expect(existingProduct?.item_number).toBe("TASK060-EXISTING");
      expect(existingProduct?.product_name).toBe("TASK060 Existing Cafe");
      expect(existingProduct?.supplier_id).toBe(fixture.supplierId);
      expect(existingProduct?.category_id).toBe(fixture.categoryId);
      expect(Number(existingProduct?.purchase_price)).toBe(1.25);
      expect(Number(existingProduct?.retail_price)).toBe(9.99);
      expect(Number(existingProduct?.stock_quantity)).toBe(5);
      expect(newError).toBeNull();
      expect(newProduct?.item_number).toBe("TASK060-NEW-ITEM");
      expect(newProduct?.product_name).toBe("TASK060 New Dingli Tea");
      expect(newProduct?.second_product_name).toBe("TASK060 Tea ES");
      expect(newProduct?.supplier_id).toBe(fixture.supplierId);
      expect(newProduct?.category_id).toBe(fixture.categoryId);
      expect(Number(newProduct?.purchase_price)).toBe(3.1);
      expect(newProduct?.retail_price).toBeNull();
      expect(newProduct?.stock_quantity).toBeNull();
    } finally {
      const cleanupErrors = await fixture.cleanup();

      expect(cleanupErrors).toEqual([]);
    }
  });

  test("Shop Code manager previews Belina XLS aliases without IMP(CLP) retail mapping", async ({
    page,
  }, testInfo) => {
    if (runtime.status !== "ready") {
      test.skip(true, runtime.reason);
      return;
    }

    const fixture = await createTask060Fixture(runtime);
    const workbookPath = testInfo.outputPath("task060-belina.xls");

    await writeBelinaSupplierWorkbook(workbookPath);

    try {
      await signInWithShopCode(page, fixture);

      const dialog = await openSupplierImportDialog(page, fixture, workbookPath);

      await dialog.getByRole("button", { name: "Preview workbook" }).click();
      await expect(
        dialog.getByRole("heading", { name: "Verify detected product columns" }),
      ).toBeVisible();
      await expect(dialog.locator('[data-import-step="workbook-file"]')).toHaveCount(0);
      await expect(dialog.getByLabel("Default supplier")).toBeVisible();
      await expect(dialog.getByLabel("Default category")).toBeVisible();
      await expect(
        dialog.getByRole("columnheader", { name: "Código Barras (Col 2)" }),
      ).toBeVisible();
      await expect(
        dialog
          .getByRole("cell", { exact: true, name: "TASK060 Belina Existing Cafe" })
          .first(),
      ).toBeVisible();
      await dialog.getByText("Ignored columns").click();
      await expect(
        dialog
          .locator("details")
          .filter({ hasText: "Ignored columns" })
          .getByText("IMP(CLP) (Col 7)"),
      ).toBeVisible();
      await expect(dialog.getByLabel("Item number column")).toHaveValue("0");
      await expect(dialog.getByLabel("Barcode column")).toHaveValue("1");
      await expect(dialog.getByLabel("Product name column")).toHaveValue("2");
      await expect(dialog.getByLabel("Second name column")).toHaveValue("3");
      await expect(dialog.getByLabel("Quantity column")).toHaveValue("4");
      await expect(dialog.getByLabel("Purchase price column")).toHaveValue("5");
      await expect(dialog.getByLabel("Retail price column")).toHaveCount(0);
      await expect(dialog.getByLabel("Use Retail price")).toHaveCount(0);
      await dialog.getByLabel("Default supplier").fill(TASK060_SUPPLIER_NAME);
      await dialog.getByLabel("Default category").fill(TASK060_CATEGORY_NAME);

      await dialog.getByRole("button", { name: "Continue to import preview" }).click();
      await expect(dialog.getByRole("heading", { name: "Import preview" })).toBeVisible();
      await expect(dialog.getByLabel("Default supplier")).toHaveCount(0);
      await expect(dialog.locator('[data-import-step="workbook-file"]')).toHaveCount(0);
      await expect(dialog.getByText("9999")).toHaveCount(0);
      await expect(dialog.getByText("8888")).toHaveCount(0);
      await expect(
        dialog.getByRole("columnheader", { exact: true, name: "Recognized" }),
      ).toHaveCount(0);
      await expect(
        dialog.getByRole("columnheader", { name: "Recognized from file" }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("columnheader", { name: "Current catalog values" }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("columnheader", { name: "Import values" }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("columnheader", { exact: true, name: "Supplier" }),
      ).toHaveCount(0);
      await expect(
        dialog.getByRole("columnheader", { exact: true, name: "Category" }),
      ).toHaveCount(0);

      const quantityInput = dialog.getByLabel(/Quantity to import for row/).first();

      await expect(quantityInput).toHaveValue("");
      await quantityInput.fill("12");
      await dialog.getByLabel("Confirm APPLY").fill("APPLY");
      await dialog.getByRole("button", { name: "Apply confirmed import" }).click();
      await expect(dialog.getByText("Result summary")).toBeVisible({
        timeout: 15_000,
      });

      const { data: existingProduct, error: existingError } = await fixture.supabase
        .from("inventory_products")
        .select("category_id, item_number, product_name, second_product_name, purchase_price, retail_price, stock_quantity, supplier_id")
        .eq("shop_id", fixture.shopId)
        .eq("barcode", TASK060_BARCODE)
        .maybeSingle();
      const { data: newProduct, error: newError } = await fixture.supabase
        .from("inventory_products")
        .select("category_id, item_number, product_name, second_product_name, purchase_price, retail_price, stock_quantity, supplier_id")
        .eq("shop_id", fixture.shopId)
        .eq("barcode", TASK060_BELINA_BARCODE)
        .maybeSingle();

      expect(existingError).toBeNull();
      expect(existingProduct?.item_number).toBe("TASK060-BELINA-EXISTING");
      expect(existingProduct?.product_name).toBe("TASK060 Belina Existing Cafe");
      expect(existingProduct?.second_product_name).toBe("TASK060 Belina Local ES");
      expect(existingProduct?.supplier_id).toBe(fixture.supplierId);
      expect(existingProduct?.category_id).toBe(fixture.categoryId);
      expect(Number(existingProduct?.purchase_price)).toBe(11.11);
      expect(Number(existingProduct?.retail_price)).toBe(2.5);
      expect(Number(existingProduct?.stock_quantity)).toBe(12);
      expect(newError).toBeNull();
      expect(newProduct?.item_number).toBe("TASK060-BELINA-NEW");
      expect(newProduct?.product_name).toBe("TASK060 Belina New Tea");
      expect(newProduct?.second_product_name).toBe("TASK060 Belina Tea Local");
      expect(newProduct?.supplier_id).toBe(fixture.supplierId);
      expect(newProduct?.category_id).toBe(fixture.categoryId);
      expect(Number(newProduct?.purchase_price)).toBe(22.22);
      expect(newProduct?.retail_price).toBeNull();
      expect(newProduct?.stock_quantity).toBeNull();
    } finally {
      const cleanupErrors = await fixture.cleanup();

      expect(cleanupErrors).toEqual([]);
    }
  });

  test("real Dingli workbook from Downloads previews and applies in local browser QA", async ({
    page,
  }) => {
    if (runtime.status !== "ready") {
      test.skip(true, runtime.reason);
      return;
    }

    if (!existsSync(REAL_DINGLI_WORKBOOK_PATH)) {
      test.skip(true, "TASK060 real Dingli workbook is not available locally.");
      return;
    }

    const fixture = await createTask060Fixture(runtime);

    try {
      await signInWithShopCode(page, fixture);

      const dialog = await openSupplierImportDialog(
        page,
        fixture,
        REAL_DINGLI_WORKBOOK_PATH,
      );

      await dialog.getByRole("button", { name: "Preview workbook" }).click();
      await expect(
        dialog.getByRole("heading", { name: "Verify detected product columns" }),
      ).toBeVisible();
      await expect(dialog.getByLabel("Barcode column")).toHaveValue("2");
      await expect(dialog.getByLabel("Product name column")).toHaveValue("3");
      await expect(dialog.getByLabel("Second name column")).toHaveValue("4");
      await expect(dialog.getByLabel("Quantity column")).toHaveValue("5");
      await expect(dialog.getByLabel("Purchase price column")).toHaveValue("6");
      await expect(dialog.getByLabel("Retail price column")).toHaveCount(0);
      await expect(dialog.getByLabel("Use Retail price")).toHaveCount(0);
      await expect(
        dialog.getByRole("columnheader", { name: "条码 (Col 3)" }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("columnheader", { name: "产品名1 (Col 4)" }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("columnheader", { name: "产品名2 (Col 5)" }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("columnheader", { name: "单价 (Col 7)" }),
      ).toBeVisible();
      await dialog.getByLabel("Default supplier").fill(TASK060_SUPPLIER_NAME);
      await dialog.getByLabel("Default category").fill(TASK060_CATEGORY_NAME);
      await dialog.getByRole("button", { name: "Continue to import preview" }).click();
      await expect(dialog.getByRole("heading", { name: "Import preview" })).toBeVisible();
      await expect(dialog.getByRole("heading", { name: "Blocked rows" })).toHaveCount(0);
      await expect(dialog.getByLabel(/Quantity to import for row/).first()).toHaveValue("");
      await expect(dialog.getByLabel(/Retail price to import for row/).first()).toHaveValue("");
      await dialog.getByLabel(/Retail price to import for row/).first().fill("9.99");
      await dialog.getByLabel("Confirm APPLY").fill("APPLY");
      await dialog.getByRole("button", { name: "Apply confirmed import" }).click();
      await expect(dialog.getByText("Result summary")).toBeVisible({
        timeout: 20_000,
      });
      await expect(dialog.getByText(/failed rows 0/i)).toBeVisible();

      const { count, error } = await fixture.supabase
        .from("inventory_products")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", fixture.shopId);

      expect(error).toBeNull();
      expect(count ?? 0).toBeGreaterThan(1);
    } finally {
      const cleanupErrors = await fixture.cleanup();

      expect(cleanupErrors).toEqual([]);
    }
  });

  test("real Belina XLS from Downloads previews aliases without IMP(CLP) retail mapping", async ({
    page,
  }) => {
    if (runtime.status !== "ready") {
      test.skip(true, runtime.reason);
      return;
    }

    if (!existsSync(REAL_BELINA_WORKBOOK_PATH)) {
      test.skip(true, "TASK060 real Belina workbook is not available locally.");
      return;
    }

    const fixture = await createTask060Fixture(runtime);

    try {
      await signInWithShopCode(page, fixture);

      const dialog = await openSupplierImportDialog(
        page,
        fixture,
        REAL_BELINA_WORKBOOK_PATH,
      );

      await dialog.getByRole("button", { name: "Preview workbook" }).click();
      await expect(
        dialog.getByRole("heading", { name: "Verify detected product columns" }),
      ).toBeVisible();
      await expect(dialog.getByLabel("Item number column")).toHaveValue("0");
      await expect(dialog.getByLabel("Barcode column")).toHaveValue("1");
      await expect(dialog.getByLabel("Product name column")).toHaveValue("2");
      await expect(dialog.getByLabel("Second name column")).toHaveValue("3");
      await expect(dialog.getByLabel("Quantity column")).toHaveValue("4");
      await expect(dialog.getByLabel("Purchase price column")).toHaveValue("5");
      await expect(dialog.getByLabel("Retail price column")).toHaveCount(0);
      await expect(dialog.getByLabel("Use Retail price")).toHaveCount(0);
      await dialog.getByText("Ignored columns").click();
      await expect(
        dialog
          .locator("details")
          .filter({ hasText: "Ignored columns" })
          .getByText("IMP(CLP) (Col 7)"),
      ).toBeVisible();
      await dialog.getByRole("button", { name: "Continue to import preview" }).click();
      await expect(dialog.getByRole("heading", { name: "Import preview" })).toBeVisible();
      await expect(dialog.getByText("9999")).toHaveCount(0);
      await expect(dialog.getByText("8888")).toHaveCount(0);
    } finally {
      const cleanupErrors = await fixture.cleanup();

      expect(cleanupErrors).toEqual([]);
    }
  });

  test("expired Shop Code session shows sign-in UX and preview works again after login", async ({
    page,
  }, testInfo) => {
    if (runtime.status !== "ready") {
      test.skip(true, runtime.reason);
      return;
    }

    const fixture = await createTask060Fixture(runtime);
    const workbookPath = testInfo.outputPath("task060-supplier.xlsx");

    await writeDingliSupplierWorkbook(workbookPath);

    try {
      await signInWithShopCode(page, fixture);

      const dialog = await openSupplierImportDialog(page, fixture, workbookPath);

      await expireActiveStaffWebSession(fixture);
      await dialog.getByRole("button", { name: "Preview workbook" }).click();
      await expect(
        dialog.getByText("Session expired. Please sign in again."),
      ).toBeVisible();
      await expect(
        dialog.getByText("This account is not authorized for this shop action."),
      ).toHaveCount(0);
      await expect(dialog.getByText("Sheet: Unknown")).toHaveCount(0);
      await expect(
        dialog.getByText(
          "For security, the browser will ask you to select the workbook again after sign-in.",
        ),
      ).toBeVisible();
      await dialog.screenshot({
        path: "docs/TASKS/EVIDENCE/TASK-060/browser-session-expired.png",
      });

      const signInAgain = dialog.getByRole("link", { name: "Sign in again" });
      await expect(signInAgain).toBeVisible();
      await expect(signInAgain).toHaveAttribute(
        "href",
        /\/shop\/staff-login\?next=%2Fshop%2Fproducts%3Fshop_id%3D/,
      );
      await signInAgain.click();
      await expect(page).toHaveURL(/\/auth\/login\?.*mode=shop-code/);
      await signInWithShopCode(
        page,
        fixture,
        `/shop/products?shop_id=${fixture.shopId}`,
      );

      const retryDialog = await openSupplierImportDialog(page, fixture, workbookPath);

      await retryDialog.getByRole("button", { name: "Preview workbook" }).click();
      await expect(
        retryDialog.getByRole("heading", { name: "Verify detected product columns" }),
      ).toBeVisible();
      await expect(
        retryDialog.getByText("Session expired. Please sign in again."),
      ).toHaveCount(0);
      await retryDialog.screenshot({
        path: "docs/TASKS/EVIDENCE/TASK-060/browser-session-relogin-preview.png",
      });
    } finally {
      const cleanupErrors = await fixture.cleanup();

      expect(cleanupErrors).toEqual([]);
    }
  });

  test("deleted Shop Code session shows session recovery UX without fake preview", async ({
    page,
  }, testInfo) => {
    if (runtime.status !== "ready") {
      test.skip(true, runtime.reason);
      return;
    }

    const fixture = await createTask060Fixture(runtime);
    const workbookPath = testInfo.outputPath("task060-supplier.xlsx");

    await writeDingliSupplierWorkbook(workbookPath);

    try {
      await signInWithShopCode(page, fixture);

      const dialog = await openSupplierImportDialog(page, fixture, workbookPath);

      await deleteActiveStaffWebSession(fixture);
      await dialog.getByRole("button", { name: "Preview workbook" }).click();
      await expect(
        dialog.getByText("Session expired. Please sign in again."),
      ).toBeVisible();
      await expect(dialog.getByText("Sheet: Unknown")).toHaveCount(0);
      await expect(
        dialog.getByRole("button", { name: "Preview workbook" }),
      ).toBeDisabled();
    } finally {
      const cleanupErrors = await fixture.cleanup();

      expect(cleanupErrors).toEqual([]);
    }
  });

  test("staff without catalog import cannot see or call supplier import", async ({
    page,
  }, testInfo) => {
    if (runtime.status !== "ready") {
      test.skip(true, runtime.reason);
      return;
    }

    const fixture = await createTask060Fixture(runtime, {
      permissions: ["catalog.read"],
    });
    const workbookPath = testInfo.outputPath("task060-supplier.xlsx");

    await writeDingliSupplierWorkbook(workbookPath);

    try {
      await signInWithShopCode(page, fixture);
      await page.goto(`/shop/products?shop_id=${fixture.shopId}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Products" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Import supplier Excel" }),
      ).toHaveCount(0);

      const directPreview = await page.evaluate(async (shopId) => {
        const formData = new FormData();

        formData.set("importMode", "supplier");
        formData.set("shop_id", shopId);
        formData.set(
          "workbook",
          new File(["not parsed before auth"], "task060-supplier.xls", {
            type: "application/vnd.ms-excel",
          }),
        );

        const response = await fetch(
          `/shop/import-export/preview?${new URLSearchParams({ shop_id: shopId }).toString()}`,
          {
            body: formData,
            credentials: "same-origin",
            method: "POST",
          },
        );

        return {
          body: await response.json(),
          status: response.status,
        };
      }, fixture.shopId);

      expect(directPreview.status).toBe(403);
      expect(directPreview.body.ok).toBe(false);
      expect(directPreview.body.code).toBe("permission_denied");
      expect(directPreview.body.message).not.toBe(
        "This account is not authorized for this shop action.",
      );
    } finally {
      const cleanupErrors = await fixture.cleanup();

      expect(cleanupErrors).toEqual([]);
    }
  });
});
