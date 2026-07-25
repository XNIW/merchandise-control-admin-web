import { expect, test } from "@playwright/test";
import * as SheetJS from "@e965/xlsx";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID, scrypt } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

type Runtime = {
  baseUrl: string;
  databaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  supabaseUrl: string;
};

type Dataset = {
  categoryId: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerUserId: string;
  posCredential: string;
  posStaffExpiry: string;
  posStaffId: string;
  productId: string;
  runId: string;
  shopCode: string;
  shopId: string;
  staffCode: string;
  supplierId: string;
  webStaffId: string;
};

type PosAuth = {
  deviceToken: string;
  posSessionId: string;
  sessionExpiresAt: string;
  sessionToken: string;
  shopDeviceId: string;
};

type ProxyStats = {
  activeRpcRequests: number;
  peakRpcRequests: number;
  rpcDelayMs: number;
  rpcRequests: number;
};

const PROXY_CONTROL_URL = "http://127.0.0.1:56320/__task139_control";
const state: {
  dataset?: Dataset;
  foreignOwnerId?: string;
  foreignShopId?: string;
  runtime?: Runtime;
  supabase?: SupabaseClient;
} = {};

function resolveRuntime(): Runtime | null {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim() ?? "";
  const databaseUrl = process.env.TASK139_LOCAL_DB_URL?.trim() ?? "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const isLoopback = (value: string) => {
    try {
      return ["127.0.0.1", "localhost", "::1"].includes(
        new URL(value).hostname,
      );
    } catch {
      return false;
    }
  };

  if (
    process.env.TEST_TARGET !== "local" ||
    !isLoopback(baseUrl) ||
    !isLoopback(databaseUrl) ||
    !isLoopback(supabaseUrl) ||
    !publishableKey ||
    !serviceRoleKey
  ) {
    return null;
  }

  return {
    baseUrl,
    databaseUrl,
    publishableKey,
    serviceRoleKey,
    supabaseUrl,
  };
}

function sqlVariables(values: Record<string, string | number>) {
  return Object.entries(values).flatMap(([key, value]) => [
    "--set",
    `${key}=${String(value)}`,
  ]);
}

function runLocalSql(
  runtime: Runtime,
  sql: string,
  values: Record<string, string | number> = {},
) {
  const database = new URL(runtime.databaseUrl);
  if (!["127.0.0.1", "localhost", "::1"].includes(database.hostname)) {
    fail("database seed target is not loopback");
  }
  try {
    return execFileSync(
      "psql",
      ["-X", "-qAt", "--set", "ON_ERROR_STOP=1", ...sqlVariables(values)],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PGDATABASE: database.pathname.replace(/^\//, "") || "postgres",
          PGHOST: database.hostname,
          PGPASSWORD: decodeURIComponent(database.password),
          PGPORT: database.port || "5432",
          PGUSER: decodeURIComponent(database.username),
        },
        input: sql,
        stdio: ["pipe", "pipe", "pipe"],
      },
    ).trim();
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr)
        : "unknown psql error";
    fail(
      `local SQL failed: ${stderr
        .replaceAll(/\$scrypt-v1\$[^\s'"]+/g, "[REDACTED_HASH]")
        .trim()
        .slice(0, 1_000)}`,
    );
  }
}

function queryLocalJson<T>(
  runtime: Runtime,
  sql: string,
  values: Record<string, string | number> = {},
): T {
  const output = runLocalSql(runtime, sql, values);
  if (!output) {
    fail("local SQL query returned no JSON");
  }
  return JSON.parse(output) as T;
}

function fail(message: string): never {
  throw new Error(`TASK139_FINAL_LOCAL: ${message}`);
}

function formatError(error: unknown) {
  if (!error || typeof error !== "object") {
    return String(error ?? "unknown");
  }
  const record = error as Record<string, unknown>;
  return ["message", "code", "details", "hint"]
    .map((key) =>
      typeof record[key] === "string" && record[key]
        ? `${key}=${record[key]}`
        : "",
    )
    .filter(Boolean)
    .join("; ");
}

function deriveScryptKey(plaintext: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      plaintext,
      salt,
      64,
      {
        N: 16384,
        maxmem: 64 * 1024 * 1024,
        p: 1,
        r: 8,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(Buffer.from(derivedKey));
      },
    );
  });
}

async function hashStaffCredential(plaintext: string) {
  const salt = randomBytes(16);
  const key = await deriveScryptKey(plaintext, salt);
  return [
    "",
    "scrypt-v1",
    "n=16384,r=8,p=1,l=64",
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

function hashSecret(value: string) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

async function setProxyDelay(delayMs: number): Promise<ProxyStats> {
  const response = await fetch(`${PROXY_CONTROL_URL}?delayMs=${delayMs}`, {
    method: "POST",
  });
  if (!response.ok) {
    fail(`proxy control reset returned ${response.status}`);
  }
  return response.json() as Promise<ProxyStats>;
}

async function getProxyStats(): Promise<ProxyStats> {
  const response = await fetch(PROXY_CONTROL_URL);
  if (!response.ok) {
    fail(`proxy control read returned ${response.status}`);
  }
  return response.json() as Promise<ProxyStats>;
}

async function createDataset(supabase: SupabaseClient): Promise<Dataset> {
  const runtime = state.runtime;
  if (!runtime) {
    fail("local runtime unavailable during seed");
  }
  const runId = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
  const now = new Date();
  const posStaffExpiry = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
  const ownerEmail = `task139-final-${runId.toLowerCase()}@example.test`;
  const ownerPassword = `Task139-${randomBytes(18).toString("base64url")}`;
  const posCredential = `Task139-POS-${randomBytes(18).toString("base64url")}`;
  const shopCode = `T139_${runId}`;
  const staffCode = `POS_${runId}`;
  const user = await supabase.auth.admin.createUser({
    email: ownerEmail,
    email_confirm: true,
    password: ownerPassword,
    user_metadata: { source: "TASK-139-final-local" },
  });
  if (user.error || !user.data.user) {
    fail(`owner create: ${formatError(user.error)}`);
  }
  const ownerUserId = user.data.user.id;
  const posCredentialHash = await hashStaffCredential(posCredential);
  const webCredentialHash = await hashStaffCredential(
    `Task139-Web-${randomBytes(14).toString("base64url")}`,
  );
  const seeded = queryLocalJson<{
    categoryId: string;
    posStaffId: string;
    shopId: string;
    supplierId: string;
    webStaffId: string;
  }>(
    runtime,
    `
      with profile_insert as (
        insert into public.profiles (
          profile_id, display_name, profile_status
        ) values (
          (:'owner_id')::uuid, :'owner_name', 'active'
        )
        on conflict (profile_id) do update
        set display_name = excluded.display_name,
            profile_status = 'active',
            disabled_at = null
        returning profile_id
      ),
      shop_insert as (
        insert into public.shops (
          created_by_profile_id, shop_code, shop_name, shop_status,
          status_changed_by_profile_id
        )
        select profile_id, :'shop_code', :'shop_name', 'active', profile_id
        from profile_insert
        returning shop_id
      ),
      member_insert as (
        insert into public.shop_members (
          invited_by_profile_id, membership_status, profile_id, role_key, shop_id
        )
        select (:'owner_id')::uuid, 'active', (:'owner_id')::uuid,
               'shop_owner', shop_id
        from shop_insert
        returning shop_id
      ),
      source_insert as (
        insert into public.shop_inventory_sources (
          created_by_profile_id, mapping_state, owner_user_id, shop_id,
          source_kind, verified_at, verified_by_profile_id
        )
        select (:'owner_id')::uuid, 'mapped', (:'owner_id')::uuid, shop_id,
               'mobile_owner', (:'now')::timestamptz, (:'owner_id')::uuid
        from shop_insert
        returning shop_id
      ),
      supplier_insert as (
        insert into public.inventory_suppliers (name, owner_user_id)
        values (:'supplier_name', (:'owner_id')::uuid)
        returning id
      ),
      category_insert as (
        insert into public.inventory_categories (name, owner_user_id)
        values (:'category_name', (:'owner_id')::uuid)
        returning id
      ),
      pos_staff_insert as (
        insert into public.staff_accounts (
          created_by_profile_id, credential_expires_at, credential_hash,
          credential_kind, credential_status, credential_updated_at,
          credential_version, display_name, failed_attempts,
          must_change_credential, role_key, shop_id, staff_code, status,
          updated_by_profile_id
        )
        select
          (:'owner_id')::uuid, (:'pos_expiry')::timestamptz,
          :'pos_credential_hash', 'password', 'active',
          (:'now')::timestamptz, 1, :'pos_name', 0, false, 'cashier',
          shop_id, :'staff_code', 'active', (:'owner_id')::uuid
        from shop_insert
        returning staff_id
      ),
      web_staff_insert as (
        insert into public.staff_accounts (
          created_by_profile_id, credential_hash, credential_kind,
          credential_status, credential_updated_at, credential_version,
          display_name, failed_attempts, must_change_credential, role_key,
          shop_id, staff_code, status, updated_by_profile_id
        )
        select
          (:'owner_id')::uuid, :'web_credential_hash', 'password', 'active',
          (:'now')::timestamptz, 1, :'web_name', 0, false, 'viewer',
          shop_id, :'web_staff_code', 'active', (:'owner_id')::uuid
        from shop_insert
        returning staff_id
      ),
      permission_delete as (
        delete from public.staff_role_permissions
        where shop_id = (select shop_id from shop_insert)
          and role_key in ('cashier', 'viewer')
        returning staff_role_permission_id
      ),
      permission_insert as (
        insert into public.staff_role_permissions (
          enabled, permission_key, role_key, shop_id, updated_by_profile_id
        )
        select true, permission_key, role_key,
               (select shop_id from shop_insert), (:'owner_id')::uuid
        from (
          values
            ('pos.sell', 'cashier'),
            ('pos.pay', 'cashier'),
            ('catalog.read', 'viewer')
        ) permissions(permission_key, role_key)
        returning staff_role_permission_id
      )
      select json_build_object(
        'categoryId', (select id from category_insert),
        'posStaffId', (select staff_id from pos_staff_insert),
        'shopId', (select shop_id from shop_insert),
        'supplierId', (select id from supplier_insert),
        'webStaffId', (select staff_id from web_staff_insert)
      );
    `,
    {
      category_name: `TASK139_CATEGORY_${runId}`,
      now: now.toISOString(),
      owner_id: ownerUserId,
      owner_name: `TASK-139 Owner ${runId}`,
      pos_credential_hash: posCredentialHash,
      pos_expiry: posStaffExpiry,
      pos_name: `TASK-139 POS ${runId}`,
      shop_code: shopCode,
      shop_name: `TASK-139 Final ${runId}`,
      staff_code: staffCode,
      supplier_name: `TASK139_SUPPLIER_${runId}`,
      web_credential_hash: webCredentialHash,
      web_name: `TASK-139 Web ${runId}`,
      web_staff_code: `WEB_${runId}`,
    },
  );

  return {
    categoryId: seeded.categoryId,
    ownerEmail,
    ownerPassword,
    ownerUserId,
    posCredential,
    posStaffExpiry,
    posStaffId: seeded.posStaffId,
    productId: "",
    runId,
    shopCode,
    shopId: seeded.shopId,
    staffCode,
    supplierId: seeded.supplierId,
    webStaffId: seeded.webStaffId,
  };
}

async function createForeignShop(supabase: SupabaseClient) {
  const runtime = state.runtime;
  if (!runtime) {
    fail("local runtime unavailable during foreign seed");
  }
  const nonce = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
  const created = await supabase.auth.admin.createUser({
    email: `task139-foreign-${nonce.toLowerCase()}@example.test`,
    email_confirm: true,
    password: `Task139-${randomBytes(18).toString("base64url")}`,
  });
  if (created.error || !created.data.user) {
    fail(`foreign owner create: ${formatError(created.error)}`);
  }
  const ownerId = created.data.user.id;
  const shop = queryLocalJson<{ shopId: string }>(
    runtime,
    `
      with profile_insert as (
        insert into public.profiles (
          display_name, profile_id, profile_status
        ) values (
          :'owner_name', (:'owner_id')::uuid, 'active'
        )
        on conflict (profile_id) do update
        set display_name = excluded.display_name,
            profile_status = 'active',
            disabled_at = null
        returning profile_id
      ),
      shop_insert as (
        insert into public.shops (
          created_by_profile_id, shop_code, shop_name, shop_status,
          status_changed_by_profile_id
        )
        select profile_id, :'shop_code', :'shop_name', 'active', profile_id
        from profile_insert
        returning shop_id
      )
      select json_build_object(
        'shopId', (select shop_id from shop_insert)
      );
    `,
    {
      owner_id: ownerId,
      owner_name: `TASK-139 Foreign ${nonce}`,
      shop_code: `F139_${nonce}`,
      shop_name: `TASK-139 Foreign ${nonce}`,
    },
  );
  state.foreignOwnerId = ownerId;
  state.foreignShopId = shop.shopId;
}

async function insertProducts(
  _supabase: SupabaseClient,
  dataset: Dataset,
  start: number,
  count: number,
) {
  const runtime = state.runtime;
  if (!runtime) {
    fail("local runtime unavailable during product seed");
  }
  const result = queryLocalJson<{ firstProductId: string }>(
    runtime,
    `
      with inserted as (
        insert into public.inventory_products (
          barcode, category_id, item_number, owner_user_id, product_name,
          purchase_price, retail_price, stock_quantity, supplier_id
        )
        select
          'T139_' || :'run_id' || '_' || lpad(series::text, 5, '0'),
          (:'category_id')::uuid,
          'T139_ITEM_' || :'run_id' || '_' || lpad(series::text, 5, '0'),
          (:'owner_id')::uuid,
          'TASK139 Product ' || :'run_id' || ' ' || lpad(series::text, 5, '0'),
          100, 1000, 10, (:'supplier_id')::uuid
        from generate_series(
          (:'start_index')::integer,
          (:'start_index')::integer + (:'row_count')::integer - 1
        ) series
        returning id
      )
      select json_build_object(
        'firstProductId', (select id from inserted limit 1)
      );
    `,
    {
      category_id: dataset.categoryId,
      owner_id: dataset.ownerUserId,
      row_count: count,
      run_id: dataset.runId,
      start_index: start,
      supplier_id: dataset.supplierId,
    },
  );
  return result.firstProductId;
}

async function successfulExportAuditCount(
  _supabase: SupabaseClient,
  shopId: string,
) {
  const runtime = state.runtime;
  if (!runtime) {
    fail("local runtime unavailable during audit query");
  }
  return Number(
    runLocalSql(
      runtime,
      `
        select count(*)
        from public.audit_logs
        where shop_id = (:'shop_id')::uuid
          and event_key = 'shop.catalog.export'
          and result = 'success';
      `,
      { shop_id: shopId },
    ),
  );
}

async function firstLogin(
  request: import("@playwright/test").APIRequestContext,
  dataset: Dataset,
  deviceIdentifier: string,
): Promise<PosAuth> {
  const response = await request.post("/api/pos/auth/first-login", {
    data: {
      credential: dataset.posCredential,
      device: {
        appVersion: "TASK139-final-local",
        deviceIdentifier,
        displayName: `TASK-139 ${deviceIdentifier}`,
      },
      shopCode: dataset.shopCode,
      staffCode: dataset.staffCode,
    },
    headers: { "User-Agent": "TASK-139 final local E2E" },
  });
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(200);
  expect(body.ok).toBe(true);
  expect(Date.parse(body.session.expiresAt)).toBeLessThanOrEqual(
    Date.parse(dataset.posStaffExpiry),
  );
  expect(Date.parse(body.session.expiresAt)).toBeGreaterThan(
    Date.parse(body.serverTime),
  );
  return {
    deviceToken: body.trustedDeviceToken,
    posSessionId: body.session.posSessionId,
    sessionExpiresAt: body.session.expiresAt,
    sessionToken: body.session.sessionToken,
    shopDeviceId: body.device.shopDeviceId,
  };
}

async function signInOwner(
  runtime: Runtime,
  page: import("@playwright/test").Page,
  dataset: Dataset,
) {
  const storage = new Map<string, string>();
  const client = createClient(runtime.supabaseUrl, runtime.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: true,
      storage: {
        getItem(key) {
          return storage.get(key) ?? null;
        },
        removeItem(key) {
          storage.delete(key);
        },
        setItem(key, value) {
          storage.set(key, value);
        },
      },
    },
  });
  const signedIn = await client.auth.signInWithPassword({
    email: dataset.ownerEmail,
    password: dataset.ownerPassword,
  });
  expect(signedIn.error).toBeNull();
  expect(signedIn.data.user?.id).toBe(dataset.ownerUserId);

  const storageKey = `sb-${
    new URL(runtime.supabaseUrl).hostname.split(".")[0]
  }-auth-token`;
  const rawSession = storage.get(storageKey);
  if (!rawSession) {
    fail("owner login did not persist a local session");
  }
  const encoded = `base64-${Buffer.from(rawSession, "utf8").toString(
    "base64url",
  )}`;
  const maxChunkSize = 3_180;
  const chunks =
    encoded.length <= maxChunkSize
      ? [{ name: storageKey, value: encoded }]
      : Array.from(
          { length: Math.ceil(encoded.length / maxChunkSize) },
          (_, index) => ({
            name: `${storageKey}.${index}`,
            value: encoded.slice(
              index * maxChunkSize,
              (index + 1) * maxChunkSize,
            ),
          }),
        );
  await page.context().addCookies(
    chunks.map((cookie) => ({
      ...cookie,
      httpOnly: false,
      sameSite: "Lax" as const,
      secure: false,
      url: runtime.baseUrl,
    })),
  );
  await page.goto(`/shop?shop_id=${dataset.shopId}`);
  expect(page.url()).toContain("/shop");
}

function deniedSalePayload(dataset: Dataset, auth: PosAuth, batchId: string) {
  const clientSaleId = `T139_SALE_${dataset.runId}`;
  const occurredAt = new Date().toISOString();
  return {
    ...auth,
    appVersion: "TASK139-final-local",
    batch: {
      clientBatchId: batchId,
      idempotencyKey: `idem-${batchId}`,
    },
    sales: [
      {
        amounts: {
          changeClp: 0,
          discountClp: 0,
          grossClp: 1000,
          netClp: 1000,
          paidClp: 1000,
          taxClp: 0,
        },
        businessDate: occurredAt.slice(0, 10),
        clientSaleId,
        currency: "CLP",
        fiscal: {
          documentNumber: null,
          documentType: null,
          printedAt: null,
          status: "not_reported",
        },
        idempotencyKey: `idem-${clientSaleId}`,
        kind: "sale",
        lines: [
          {
            amountClp: 1000,
            clientLineId: `line-${clientSaleId}`,
            linePosition: 1,
            lineTotal: 1000,
            lineType: "item",
            productId: dataset.productId,
            productName: "TASK139 denied sale",
            quantity: 1,
            stockQuantityDelta: -1,
            unitAmountClp: 1000,
            unitPrice: 1000,
          },
        ],
        occurredAt,
        payments: [
          {
            amountClp: 1000,
            changeClp: 0,
            clientPaymentId: `payment-${clientSaleId}`,
            method: "cash",
          },
        ],
        saleNumber: `TASK139-${dataset.runId}`,
        total: 1000,
      },
    ],
    schemaVersion: "pos-sales-ledger-v2",
    shopCode: dataset.shopCode,
  };
}

async function softCleanup() {
  const { dataset, foreignOwnerId, foreignShopId, supabase } = state;
  const runtime = state.runtime;
  if (!runtime || !supabase) return;
  const now = new Date().toISOString();
  for (const shopId of [dataset?.shopId, foreignShopId].filter(
    (value): value is string => Boolean(value),
  )) {
    runLocalSql(
      runtime,
      `
        begin;
        update public.pos_sessions
        set revoked_at = (:'now')::timestamptz,
            revoked_reason = 'task139_final_cleanup',
            status = 'revoked',
            updated_at = (:'now')::timestamptz
        where shop_id = (:'shop_id')::uuid and status = 'active';
        update public.pos_device_credentials
        set revoked_at = (:'now')::timestamptz,
            revoked_reason = 'task139_final_cleanup',
            status = 'revoked',
            updated_at = (:'now')::timestamptz
        where shop_id = (:'shop_id')::uuid and status = 'active';
        update public.shop_devices
        set revoked_at = (:'now')::timestamptz,
            status = 'revoked',
            updated_at = (:'now')::timestamptz
        where shop_id = (:'shop_id')::uuid and status = 'active';
        update public.staff_accounts
        set credential_hash = null,
            credential_kind = null,
            credential_status = 'rotation_required',
            must_change_credential = true,
            status = 'archived',
            updated_at = (:'now')::timestamptz
        where shop_id = (:'shop_id')::uuid;
        update public.shop_inventory_sources
        set disabled_at = (:'now')::timestamptz
        where shop_id = (:'shop_id')::uuid and disabled_at is null;
        update public.shop_members
        set membership_status = 'suspended',
            suspended_at = (:'now')::timestamptz,
            updated_at = (:'now')::timestamptz
        where shop_id = (:'shop_id')::uuid and membership_status = 'active';
        update public.shops
        set archived_at = (:'now')::timestamptz,
            archived_by_profile_id = created_by_profile_id,
            shop_status = 'archived',
            status_changed_at = (:'now')::timestamptz,
            status_changed_by_profile_id = created_by_profile_id,
            status_reason_redacted = 'task139_final_cleanup',
            updated_at = (:'now')::timestamptz
        where shop_id = (:'shop_id')::uuid;
        commit;
      `,
      { now, shop_id: shopId },
    );
  }
  for (const ownerId of [dataset?.ownerUserId, foreignOwnerId].filter(
    (value): value is string => Boolean(value),
  )) {
    runLocalSql(
      runtime,
      `
        update public.inventory_products
        set deleted_at = (:'now')::timestamptz,
            updated_at = (:'now')::timestamptz
        where owner_user_id = (:'owner_id')::uuid and deleted_at is null;
        update public.profiles
        set disabled_at = (:'now')::timestamptz,
            profile_status = 'disabled',
            updated_at = (:'now')::timestamptz
        where profile_id = (:'owner_id')::uuid;
      `,
      { now, owner_id: ownerId },
    );
    await supabase.auth.admin.deleteUser(ownerId);
  }
}

test.describe("TASK-139 definitive local runtime closeout", () => {
  const runtime = resolveRuntime();
  test.skip(
    runtime === null,
    "requires an explicitly local OpenNext + Supabase runtime",
  );

  test.beforeAll(async () => {
    if (!runtime) return;
    state.runtime = runtime;
    state.supabase = createClient(runtime.supabaseUrl, runtime.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    state.dataset = await createDataset(state.supabase);
    await createForeignShop(state.supabase);
  });

  test.afterAll(async () => {
    await setProxyDelay(0).catch(() => undefined);
    await softCleanup();
  });

  test("bounds workbook export and rejects a revoked first-login sale at the real sink", async ({
    browser,
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const { dataset, foreignShopId, supabase } = state;
    if (!runtime || !dataset || !foreignShopId || !supabase) {
      fail("runtime fixture was not created");
    }

    await signInOwner(runtime, page, dataset);

    const ownerRequest = page.context().request;
    const emptyExport = await ownerRequest.get(
      `/shop/import-export/export?shop_id=${dataset.shopId}`,
    );
    expect(emptyExport.status(), await emptyExport.text()).toBe(200);
    const emptyWorkbook = SheetJS.read(await emptyExport.body());
    expect(emptyWorkbook.SheetNames).toEqual([
      "Products",
      "Suppliers",
      "Categories",
      "PriceHistory",
    ]);
    expect(
      SheetJS.utils.sheet_to_json(emptyWorkbook.Sheets.Products, {
        header: 1,
      }),
    ).toHaveLength(1);

    dataset.productId = await insertProducts(supabase, dataset, 1, 2);
    const smallExport = await ownerRequest.get(
      `/shop/import-export/export?shop_id=${dataset.shopId}`,
    );
    expect(smallExport.status(), await smallExport.text()).toBe(200);
    expect(
      SheetJS.utils.sheet_to_json(
        SheetJS.read(await smallExport.body()).Sheets.Products,
        { header: 1 },
      ),
    ).toHaveLength(3);

    await insertProducts(supabase, dataset, 3, 1_998);
    const auditBeforeCancellation = await successfulExportAuditCount(
      supabase,
      dataset.shopId,
    );
    await setProxyDelay(100);
    const cancellation = await ownerRequest.get(
      `/shop/import-export/export?shop_id=${dataset.shopId}`,
      {
        headers: {
          "x-mc-workbook-deadline-ms": "350",
        },
      },
    );
    expect(cancellation.status()).toBe(408);
    expect(await cancellation.json()).toMatchObject({
      code: "resource_deadline_exceeded",
      ok: false,
    });
    await page.waitForTimeout(500);
    const cancelledStats = await getProxyStats();
    expect(cancelledStats.rpcRequests).toBeGreaterThan(1);
    expect(cancelledStats.rpcRequests).toBeLessThanOrEqual(20);
    expect(cancelledStats.peakRpcRequests).toBeLessThanOrEqual(2);
    expect(await successfulExportAuditCount(supabase, dataset.shopId)).toBe(
      auditBeforeCancellation,
    );

    await setProxyDelay(0);
    const rssBefore = process.memoryUsage().rss;
    const exactStartedAt = performance.now();
    const exactExport = await ownerRequest.get(
      `/shop/import-export/export?shop_id=${dataset.shopId}`,
    );
    const exactDurationMs = Math.round(performance.now() - exactStartedAt);
    const exactBuffer = await exactExport.body();
    const rssDeltaBytes = Math.max(0, process.memoryUsage().rss - rssBefore);
    expect(exactExport.status(), exactBuffer.toString("utf8")).toBe(200);
    expect(exactBuffer.byteLength).toBeLessThanOrEqual(8 * 1024 * 1024);
    const exactWorkbook = SheetJS.read(exactBuffer);
    expect(
      SheetJS.utils.sheet_to_json(exactWorkbook.Sheets.Products, {
        header: 1,
      }),
    ).toHaveLength(2_001);
    const exactStats = await getProxyStats();
    expect(exactStats.rpcRequests).toBeGreaterThan(1);
    expect(exactStats.rpcRequests).toBeLessThanOrEqual(80);
    expect(exactStats.peakRpcRequests).toBeLessThanOrEqual(2);

    await insertProducts(supabase, dataset, 2_001, 1);
    const overLimitAuditBefore = await successfulExportAuditCount(
      supabase,
      dataset.shopId,
    );
    const overLimit = await ownerRequest.get(
      `/shop/import-export/export?shop_id=${dataset.shopId}`,
    );
    expect(overLimit.status()).toBe(413);
    expect(overLimit.headers()["content-type"]).toContain("application/json");
    expect(await overLimit.json()).toMatchObject({
      code: "resource_limit_exceeded",
      ok: false,
    });
    expect(await successfulExportAuditCount(supabase, dataset.shopId)).toBe(
      overLimitAuditBefore,
    );

    const foreignExport = await ownerRequest.get(
      `/shop/import-export/export?shop_id=${foreignShopId}`,
    );
    expect(foreignExport.status()).not.toBe(200);

    const rawWebSession = `mcstaff_web_${randomBytes(32).toString("base64url")}`;
    runLocalSql(
      runtime,
      `
        insert into public.staff_web_sessions (
          expires_at, metadata_redacted, session_token_hash, shop_id,
          staff_credential_version, staff_id, status
        ) values (
          (:'expires_at')::timestamptz,
          '{"source":"TASK-139-final-local"}'::jsonb,
          :'session_hash',
          (:'shop_id')::uuid,
          1,
          (:'staff_id')::uuid,
          'active'
        );
      `,
      {
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        session_hash: hashSecret(rawWebSession),
        shop_id: dataset.shopId,
        staff_id: dataset.webStaffId,
      },
    );
    const staffContext = await browser.newContext({ baseURL: runtime.baseUrl });
    await staffContext.addCookies([
      {
        httpOnly: true,
        name: "mc_staff_web_session",
        sameSite: "Lax",
        secure: false,
        url: runtime.baseUrl,
        value: rawWebSession,
      },
    ]);
    const deniedStaffExport = await staffContext.request.get(
      `/shop/import-export/export?shop_id=${dataset.shopId}`,
    );
    expect(deniedStaffExport.status()).toBe(400);
    expect(await deniedStaffExport.json()).toMatchObject({
      ok: false,
    });
    await staffContext.close();

    const posAuth = await firstLogin(
      ownerRequest,
      dataset,
      `TASK139_DEVICE_${dataset.runId}`,
    );
    const persistedSession = queryLocalJson<{ expiresAt: string }>(
      runtime,
      `
        select json_build_object('expiresAt', expires_at)
        from public.pos_sessions
        where pos_session_id = (:'session_id')::uuid;
      `,
      { session_id: posAuth.posSessionId },
    );
    expect(Date.parse(persistedSession.expiresAt)).toBeLessThanOrEqual(
      Date.parse(dataset.posStaffExpiry),
    );

    const expiredAt = new Date(Date.now() - 1_000).toISOString();
    runLocalSql(
      runtime,
      `
        update public.staff_accounts
        set credential_expires_at = (:'expired_at')::timestamptz,
            updated_at = clock_timestamp()
        where staff_id = (:'staff_id')::uuid;
      `,
      { expired_at: expiredAt, staff_id: dataset.posStaffId },
    );
    const publication = await supabase.rpc(
      "pos_runtime_lease_publish_success_v2",
      {
        p_expected_catalog_revision: null,
        p_expected_catalog_scope_key: null,
        p_pos_session_id: posAuth.posSessionId,
        p_publication_kind: "first_login",
        p_shop_device_id: posAuth.shopDeviceId,
        p_shop_id: dataset.shopId,
        p_staff_id: dataset.posStaffId,
      },
    );
    expect(publication.error).toBeNull();
    expect(publication.data).toMatchObject({ status: "denied" });

    const retryLogin = await ownerRequest.post("/api/pos/auth/first-login", {
      data: {
        credential: dataset.posCredential,
        device: {
          appVersion: "TASK139-final-local",
          deviceIdentifier: `TASK139_RETRY_${dataset.runId}`,
          displayName: `TASK-139 retry ${dataset.runId}`,
        },
        shopCode: dataset.shopCode,
        staffCode: dataset.staffCode,
      },
    });
    expect(retryLogin.status()).toBe(401);

    const batchId = `T139_BATCH_${dataset.runId}`;
    const deniedPayload = deniedSalePayload(dataset, posAuth, batchId);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const deniedSale = await ownerRequest.post("/api/pos/sales/sync", {
        data: deniedPayload,
        headers: {
          "Idempotency-Key": `idem-${batchId}`,
          "User-Agent": "TASK-139 final local E2E",
        },
      });
      expect(deniedSale.status()).toBe(401);
    }
    const deniedSinkCounts = queryLocalJson<{
      batches: number;
      sales: number;
    }>(
      runtime,
      `
        select json_build_object(
          'batches', (
            select count(*)
            from public.pos_sales_sync_batches
            where shop_id = (:'shop_id')::uuid
              and client_batch_id = :'batch_id'
          ),
          'sales', (
            select count(*)
            from public.pos_sales
            where shop_id = (:'shop_id')::uuid
              and client_sale_id = :'sale_id'
          )
        );
      `,
      {
        batch_id: batchId,
        sale_id: `T139_SALE_${dataset.runId}`,
        shop_id: dataset.shopId,
      },
    );
    expect(deniedSinkCounts).toEqual({ batches: 0, sales: 0 });

    const metrics = {
      cancellation: cancelledStats,
      exactCap: {
        bufferBytes: exactBuffer.byteLength,
        durationMs: exactDurationMs,
        productRows: 2_000,
        rpc: exactStats,
        runnerRssDeltaBytes: rssDeltaBytes,
      },
      firstLogin: {
        canonicalStaffExpiry: dataset.posStaffExpiry,
        persistedSessionExpiry: persistedSession.expiresAt,
        publicationAfterExpiry: publication.data,
      },
      overLimit: {
        productRows: 2_001,
        status: overLimit.status(),
      },
    };
    await testInfo.attach("task139-final-local-metrics.json", {
      body: Buffer.from(JSON.stringify(metrics, null, 2)),
      contentType: "application/json",
    });
    console.log(`TASK139_FINAL_LOCAL_METRICS ${JSON.stringify(metrics)}`);
  });
});
