import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import type { CDPSession } from "@playwright/test";
import type { Database } from "../../src/lib/supabase/database.types";

test.use({ screenshot: "only-on-failure", trace: "retain-on-failure", video: "off" });
test.setTimeout(120_000);

type Runtime = {
  publishableKey: string;
  serviceRoleKey: string;
  supabaseUrl: string;
};

type Baseline = {
  auditLogs: number;
  authUsers: number;
  imageObjects: number;
  imageVersions: number;
  inventoryMappings: number;
  products: number;
  profiles: number;
  shopMembers: number;
  shops: number;
  syncEvents: number;
};

type Fixture = {
  cleanup: () => Promise<Baseline>;
  email: string;
  password: string;
  productId: string;
  productName: string;
  shopId: string;
  userId: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREPROCESS_MEASURE = "task137-product-image-preprocess";

async function jsHeapUsedBytes(session: CDPSession) {
  const result = await session.send("Performance.getMetrics");
  const value = result.metrics.find((metric) => metric.name === "JSHeapUsedSize")
    ?.value;
  if (!Number.isFinite(value)) {
    throw new Error("BLOCKED_TASK137_JS_HEAP_METRIC_MISSING");
  }
  return value as number;
}

function runtime(): Runtime {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim() ?? "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  let local = false;
  let appLocal = false;
  try {
    const url = new URL(supabaseUrl);
    local =
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "::1"].includes(url.hostname) &&
      url.port === "54321";
  } catch {
    local = false;
  }
  try {
    const url = new URL(baseUrl);
    appLocal =
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    appLocal = false;
  }
  if (
    process.env.TEST_TARGET !== "local" ||
    !local ||
    !appLocal ||
    !publishableKey ||
    !serviceRoleKey
  ) {
    throw new Error("BLOCKED_TASK137_EXPLICIT_LOCAL_SUPABASE_REQUIRED");
  }
  return { publishableKey, serviceRoleKey, supabaseUrl };
}

function localDatabaseUrl() {
  const output = execFileSync("supabase", ["status", "--output", "env"], {
    encoding: "utf8",
    env: {
      ...process.env,
      DO_NOT_TRACK: "1",
      SUPABASE_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const dbUrl = output.match(/^DB_URL="?([^"\n]+)"?$/m)?.[1];
  if (!dbUrl || !dbUrl.includes("127.0.0.1:54322")) {
    throw new Error("BLOCKED_TASK137_LOCAL_DATABASE_URL_REQUIRED");
  }
  return dbUrl;
}

function baseline(): Baseline {
  const sql = `
    select json_build_object(
      'auditLogs', (select count(*) from public.audit_logs),
      'authUsers', (select count(*) from auth.users),
      'imageObjects', (select count(*) from storage.objects where bucket_id = 'product-images'),
      'imageVersions', (select count(*) from public.inventory_product_image_versions),
      'inventoryMappings', (select count(*) from public.shop_inventory_sources),
      'products', (select count(*) from public.inventory_products),
      'profiles', (select count(*) from public.profiles),
      'shopMembers', (select count(*) from public.shop_members),
      'shops', (select count(*) from public.shops),
      'syncEvents', (select count(*) from public.sync_events)
    )::text;
  `;
  const output = execFileSync(
    "psql",
    [localDatabaseUrl(), "-Atq", "-v", "ON_ERROR_STOP=1", "-c", sql],
    {
      encoding: "utf8",
      env: { ...process.env, PGCONNECT_TIMEOUT: "5" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
  return JSON.parse(output) as Baseline;
}

function queryJson<T>(sql: string) {
  const output = execFileSync(
    "psql",
    [localDatabaseUrl(), "-Atq", "-v", "ON_ERROR_STOP=1", "-c", sql],
    {
      encoding: "utf8",
      env: { ...process.env, PGCONNECT_TIMEOUT: "5" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
  return JSON.parse(output) as T;
}

function deleteFixtureDatabaseRows(input: {
  productId: string;
  shopId: string;
  userId: string;
}) {
  for (const value of [input.productId, input.shopId, input.userId]) {
    if (!UUID_PATTERN.test(value)) {
      throw new Error("BLOCKED_TASK137_CLEANUP_UUID_INVALID");
    }
  }
  const sql = `
    begin;
    select set_config('request.jwt.claims', '{"role":"service_role"}', true);
    alter table public.audit_logs disable trigger user;
    delete from public.audit_logs where shop_id = '${input.shopId}';
    alter table public.audit_logs enable trigger user;
    alter table public.sync_events disable trigger user;
    delete from public.sync_events where shop_id = '${input.shopId}';
    alter table public.sync_events enable trigger user;
    update public.inventory_products
    set primary_image_version_id = null,
        primary_image_updated_at = null
    where id = '${input.productId}';
    delete from public.inventory_product_image_versions where product_id = '${input.productId}';
    delete from public.shop_inventory_sources where shop_id = '${input.shopId}';
    delete from public.shop_members where shop_id = '${input.shopId}';
    delete from public.inventory_products where id = '${input.productId}';
    delete from public.shops where shop_id = '${input.shopId}';
    delete from public.profiles where profile_id = '${input.userId}';
    commit;
  `;
  execFileSync(
    "psql",
    [localDatabaseUrl(), "-v", "ON_ERROR_STOP=1", "-c", sql],
    {
      env: { ...process.env, PGCONNECT_TIMEOUT: "5" },
      stdio: "ignore",
    },
  );
}

async function createFixture(
  target: Runtime,
  expectedBaseline: Baseline,
): Promise<Fixture> {
  const admin = createClient<Database>(target.supabaseUrl, target.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const nonce = randomBytes(6).toString("hex").toUpperCase();
  const email = `task137-${nonce.toLowerCase()}@example.invalid`;
  const password = `T137-${randomBytes(24).toString("base64url")}`;
  const productName = `TASK137 Product Image ${nonce}`;
  const authResult = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: { source: "TASK137_product_image_local_e2e" },
  });
  const maybeUserId = authResult.data.user?.id;
  if (authResult.error || !maybeUserId) {
    throw new Error("BLOCKED_TASK137_AUTH_USER_CREATE");
  }
  const userId = maybeUserId;

  const shopId = randomUUID();
  const productId = randomUUID();

  async function cleanup() {
    if (productId) {
      const versions = await admin
        .from("inventory_product_image_versions")
        .select("main_path,thumb_path")
        .eq("product_id", productId);
      if (versions.error) {
        throw new Error("BLOCKED_TASK137_CLEANUP_VERSION_READ");
      }
      const paths = (versions.data ?? []).flatMap((row) => [
        row.main_path,
        row.thumb_path,
      ]);
      if (paths.length > 0) {
        const removed = await admin.storage.from("product-images").remove(paths);
        if (removed.error) {
          throw new Error("BLOCKED_TASK137_CLEANUP_STORAGE_REMOVE");
        }
      }
    }
    if (shopId && productId) {
      deleteFixtureDatabaseRows({ productId, shopId, userId });
    }
    const deletedUser = await admin.auth.admin.deleteUser(userId);
    if (deletedUser.error) {
      throw new Error("BLOCKED_TASK137_CLEANUP_AUTH_USER");
    }
    const finalBaseline = baseline();
    expect(finalBaseline).toEqual(expectedBaseline);
    return finalBaseline;
  }

  try {
    execFileSync(
      "psql",
      [
        localDatabaseUrl(),
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `
          begin;
          insert into public.profiles (profile_id, display_name, profile_status)
          values ('${userId}','TASK137 Owner ${nonce}','active')
          on conflict (profile_id) do update
          set display_name = excluded.display_name,
              profile_status = excluded.profile_status;

          insert into public.shops (
            shop_id,
            shop_code,
            shop_name,
            shop_status,
            created_by_profile_id,
            status_changed_by_profile_id
          )
          values (
            '${shopId}',
            'TASK137_${nonce}',
            'TASK137 Image Shop ${nonce}',
            'active',
            '${userId}',
            '${userId}'
          );

          insert into public.shop_members (
            profile_id,
            shop_id,
            role_key,
            membership_status,
            invited_by_profile_id
          )
          values ('${userId}','${shopId}','shop_owner','active','${userId}');

          insert into public.shop_inventory_sources (
            owner_user_id,
            shop_id,
            source_kind,
            mapping_state,
            verified_at,
            verified_by_profile_id,
            created_by_profile_id
          )
          values (
            '${userId}',
            '${shopId}',
            'mobile_owner',
            'mapped',
            now(),
            '${userId}',
            '${userId}'
          );

          insert into public.inventory_products (
            id,
            owner_user_id,
            shop_id,
            barcode,
            item_number,
            product_name,
            purchase_price,
            retail_price,
            stock_quantity
          )
          values (
            '${productId}',
            '${userId}',
            '${shopId}',
            'TASK137_BARCODE_${nonce}',
            'TASK137_ITEM_${nonce}',
            '${productName}',
            10.5,
            14.75,
            9
          );
          commit;
        `,
      ],
      {
        env: { ...process.env, PGCONNECT_TIMEOUT: "5" },
        stdio: "ignore",
      },
    );
    return { cleanup, email, password, productId, productName, shopId, userId };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function syntheticPng(page: import("@playwright/test").Page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 900;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas unavailable");
    const gradient = context.createLinearGradient(0, 0, 1200, 900);
    gradient.addColorStop(0, "rgba(16, 185, 129, 0.72)");
    gradient.addColorStop(1, "rgba(15, 23, 42, 0.92)");
    context.clearRect(0, 0, 1200, 900);
    context.fillStyle = gradient;
    context.fillRect(80, 70, 1040, 760);
    context.fillStyle = "rgba(255,255,255,0.9)";
    context.font = "bold 96px sans-serif";
    context.fillText("TASK-137", 330, 490);
    return canvas.toDataURL("image/png").split(",")[1] ?? "";
  });
  return {
    buffer: Buffer.from(base64, "base64"),
    height: 900,
    width: 1200,
  };
}

async function signIn(
  page: import("@playwright/test").Page,
  fixture: Fixture,
) {
  await page.goto("/auth/login?mode=admin-account&next=/shop");
  await expect(
    page.getByRole("heading", { level: 1, name: "Admin Console sign in" }),
  ).toBeVisible();
  await page.evaluate(
    ({ email, password }) => {
      const values = { email, password };
      for (const [name, value] of Object.entries(values)) {
        const input = document.querySelector<HTMLInputElement>(
          `input[name="${name}"]`,
        );
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (!input || !setter) {
          throw new Error("login input unavailable");
        }
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    { email: fixture.email, password: fixture.password },
  );
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/shop", { timeout: 20_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

function versionHash(versionId: string) {
  return createHash("sha256").update(versionId).digest("hex").slice(0, 12);
}

test("TASK-137 local Admin image upload, no-op, offline cache, remove and cleanup", async ({
  page,
}, testInfo) => {
  const target = runtime();
  const before = baseline();
  const fixture = await createFixture(target, before);
  let browserPerformance: {
    inputBytes: number;
    inputHeight: number;
    inputWidth: number;
    jsHeapAfterBytes: number;
    jsHeapBeforeBytes: number;
    jsHeapObservedPeakBytes: number;
    preprocessMilliseconds: number;
  } | null = null;

  try {
    await signIn(page, fixture);
    await page.goto(`/shop/products?shop_id=${fixture.shopId}`);
    const row = page
      .locator("[data-product-catalog-row]")
      .filter({ hasText: fixture.productName });
    await expect(row).toBeVisible();
    await row.getByRole("link", { name: /Detail:/ }).click();
    const editor = page.locator("[data-product-image-editor]");
    await expect(editor).toBeVisible();

    const png = await syntheticPng(page);
    const input = editor.locator('input[type="file"]');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    await page.evaluate((measureName) => performance.clearMeasures(measureName), PREPROCESS_MEASURE);
    const jsHeapBeforeBytes = await jsHeapUsedBytes(cdp);
    let jsHeapObservedPeakBytes = jsHeapBeforeBytes;
    let sampleHeap = true;
    const heapSampler = (async () => {
      while (sampleHeap) {
        jsHeapObservedPeakBytes = Math.max(
          jsHeapObservedPeakBytes,
          await jsHeapUsedBytes(cdp),
        );
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    })();
    try {
      await input.setInputFiles({
        buffer: png.buffer,
        mimeType: "image/png",
        name: "task137-fixture.png",
      });
      await expect(editor.getByText("Image ready to upload.")).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      sampleHeap = false;
      await heapSampler;
    }
    const jsHeapAfterBytes = await jsHeapUsedBytes(cdp);
    const preprocessMilliseconds = await page.evaluate((measureName) => {
      const entries = performance.getEntriesByName(measureName);
      return entries.length > 0 ? entries[entries.length - 1].duration : null;
    }, PREPROCESS_MEASURE);
    expect(preprocessMilliseconds).not.toBeNull();
    expect(preprocessMilliseconds).toBeGreaterThan(0);
    browserPerformance = {
      inputBytes: png.buffer.byteLength,
      inputHeight: png.height,
      inputWidth: png.width,
      jsHeapAfterBytes,
      jsHeapBeforeBytes,
      jsHeapObservedPeakBytes,
      preprocessMilliseconds: preprocessMilliseconds as number,
    };
    await testInfo.attach("task137-browser-performance", {
      body: Buffer.from(JSON.stringify(browserPerformance, null, 2)),
      contentType: "application/json",
    });
    await cdp.detach();
    await editor.getByRole("button", { name: "Upload image" }).click();
    await expect(editor.getByText("Product image updated.")).toBeVisible({
      timeout: 30_000,
    });

    const product = queryJson<{
      primary_image_updated_at: string | null;
      primary_image_version_id: string | null;
    }>(`
      select json_build_object(
        'primary_image_version_id', primary_image_version_id,
        'primary_image_updated_at', primary_image_updated_at
      )::text
      from public.inventory_products
      where id = '${fixture.productId}';
    `);
    expect(product.primary_image_version_id).toMatch(UUID_PATTERN);
    expect(product.primary_image_updated_at).toBeTruthy();
    const versionId = product.primary_image_version_id as string;
    expect(versionId).toMatch(UUID_PATTERN);
    const version = queryJson<{
      cleanup_status: string;
      expected_main_bytes: number;
      expected_thumb_bytes: number;
      status: string;
      verified_main_bytes: number | null;
      verified_thumb_bytes: number | null;
    }>(`
      select json_build_object(
        'status', status,
        'cleanup_status', cleanup_status,
        'expected_main_bytes', expected_main_bytes,
        'expected_thumb_bytes', expected_thumb_bytes,
        'verified_main_bytes', verified_main_bytes,
        'verified_thumb_bytes', verified_thumb_bytes
      )::text
      from public.inventory_product_image_versions
      where id = '${versionId}';
    `);
    expect(version.status).toBe("ready");
    expect(version.cleanup_status).toBe("not_due");
    expect(version.expected_main_bytes).toBeLessThanOrEqual(1024 * 1024);
    expect(version.expected_thumb_bytes).toBeLessThanOrEqual(90 * 1024);
    expect(version.verified_main_bytes).toBe(version.expected_main_bytes);
    expect(version.verified_thumb_bytes).toBe(version.expected_thumb_bytes);

    const readyVersions = queryJson<number>(`
      select to_json(count(*)::integer)::text
      from public.inventory_product_image_versions
      where product_id = '${fixture.productId}';
    `);
    expect(readyVersions).toBe(1);
    const syncAfterFinalize = queryJson<number>(`
      select to_json(count(*)::integer)::text
      from public.sync_events
      where shop_id = '${fixture.shopId}'
        and source = 'product_image_api';
    `);
    expect(syncAfterFinalize).toBe(1);

    await expect(editor.getByRole("img", { name: fixture.productName })).toBeVisible();
    const cacheKeys = await page.evaluate(async () => {
      const cache = await caches.open("task137-product-images-v1");
      return (await cache.keys()).map((request) => new URL(request.url).pathname);
    });
    expect(cacheKeys.some((key) => key.endsWith(`/${versionId}/main.jpg`))).toBe(
      true,
    );
    expect(cacheKeys.some((key) => key.endsWith(`/${versionId}/thumb.jpg`))).toBe(
      true,
    );
    expect(cacheKeys.every((key) => key.includes(`/${fixture.shopId}/`))).toBe(true);

    await input.setInputFiles({
      buffer: png.buffer,
      mimeType: "image/png",
      name: "task137-fixture.png",
    });
    await expect(editor.getByText("Image ready to upload.")).toBeVisible({
      timeout: 30_000,
    });
    await editor.getByRole("button", { name: "Upload image" }).click();
    await expect(editor.getByText("This image is already current.")).toBeVisible({
      timeout: 30_000,
    });
    const versionsAfterNoop = queryJson<number>(`
      select to_json(count(*)::integer)::text
      from public.inventory_product_image_versions
      where product_id = '${fixture.productId}';
    `);
    const syncAfterNoop = queryJson<number>(`
      select to_json(count(*)::integer)::text
      from public.sync_events
      where shop_id = '${fixture.shopId}'
        and source = 'product_image_api';
    `);
    expect(versionsAfterNoop).toBe(1);
    expect(syncAfterNoop).toBe(1);

    await page.getByRole("button", { name: "Prices" }).click();
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await page.getByRole("button", { name: "Overview" }).click();
    await expect(
      editor.getByText(/Offline: cached images remain visible/),
    ).toBeVisible();
    await expect(editor.getByRole("img", { name: fixture.productName })).toBeVisible();
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await page.screenshot({
      fullPage: false,
      path: "docs/TASKS/EVIDENCE/TASK-137/admin-web-product-image-local.png",
    });

    await editor.getByRole("button", { name: "Remove image" }).click();
    await editor.getByRole("button", { name: "Confirm removal" }).click();
    await expect(editor.getByText("Product image removed.")).toBeVisible({
      timeout: 30_000,
    });
    const removedProduct = queryJson<{
      primary_image_version_id: string | null;
    }>(`
      select json_build_object(
        'primary_image_version_id', primary_image_version_id
      )::text
      from public.inventory_products
      where id = '${fixture.productId}';
    `);
    expect(removedProduct.primary_image_version_id).toBeNull();
    const removedVersion = queryJson<{
      cleanup_status: string;
      status: string;
    }>(`
      select json_build_object(
        'status', status,
        'cleanup_status', cleanup_status
      )::text
      from public.inventory_product_image_versions
      where id = '${versionId}';
    `);
    expect(removedVersion.status).toBe("removed");
    expect(removedVersion.cleanup_status).toBe("complete");

    const repeatedRemove = await page.evaluate(
      async ({ productId, shopId, versionId: expectedVersionId }) => {
        const response = await fetch("/api/shop/product-images/remove", {
          body: JSON.stringify({ expectedVersionId, productId, shopId }),
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        return { body: await response.json(), status: response.status };
      },
      { productId: fixture.productId, shopId: fixture.shopId, versionId },
    );
    expect(repeatedRemove.status).toBe(200);
    expect(repeatedRemove.body).toMatchObject({ ok: true, status: "already_removed" });
    const syncAfterRemove = queryJson<number>(`
      select to_json(count(*)::integer)::text
      from public.sync_events
      where shop_id = '${fixture.shopId}'
        and source = 'product_image_api';
    `);
    expect(syncAfterRemove).toBe(2);

    const audit = queryJson<
      Array<{ event_key: string; metadata_redacted: unknown }>
    >(`
      select coalesce(
        json_agg(json_build_object(
          'event_key', event_key,
          'metadata_redacted', metadata_redacted
        )),
        '[]'::json
      )::text
      from public.audit_logs
      where shop_id = '${fixture.shopId}'
        and event_key like 'shop.product_image.%';
    `);
    expect(audit.some((row) => row.event_key === "shop.product_image.finalized")).toBe(
      true,
    );
    expect(audit.some((row) => row.event_key === "shop.product_image.removed")).toBe(
      true,
    );
    const auditText = JSON.stringify(audit);
    expect(auditText).not.toMatch(
      /signed_url|upload_url|main_path|thumb_path|token|image_bytes|exif|gps|local_path/i,
    );

    const liveCounts = baseline();
    expect(liveCounts.imageObjects).toBe(before.imageObjects);
    await testInfo.attach("task137-local-result", {
      body: Buffer.from(
        JSON.stringify(
          {
            baselineBefore: before,
            browserPerformance,
            mainBytes: version.expected_main_bytes,
            result: "PASS",
            target: "local",
            thumbBytes: version.expected_thumb_bytes,
            versionSha256_12: versionHash(versionId),
          },
          null,
          2,
        ),
      ),
      contentType: "application/json",
    });
  } finally {
    await page.context().setOffline(false);
    const after = await fixture.cleanup();
    await testInfo.attach("task137-cleanup-baseline", {
      body: Buffer.from(JSON.stringify({ after, before }, null, 2)),
      contentType: "application/json",
    });
  }
});
