import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import type { Database } from "../../src/lib/supabase/database.types";

test.use({ screenshot: "only-on-failure", trace: "off", video: "off" });
test.setTimeout(120_000);

const MANIFEST_PATH = "/tmp/task138-product-images-fixture.json";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Runtime = {
  publishableKey: string;
  serviceRoleKey: string;
  supabaseUrl: string;
};

type RoleKey = "cashier" | "manager" | "owner" | "viewer";

type LocalUser = {
  email: string;
  id: string;
  password: string;
  role: RoleKey;
};

type FixtureManifest = {
  createdAt: string;
  productAId: string;
  productAName: string;
  productBId: string;
  productBName: string;
  runId: string;
  shopId: string;
  target: "local";
  users: Record<RoleKey, LocalUser>;
  versionId: string;
};

type ImageMetadata = {
  mainBytes: number;
  mainHeight: number;
  mainSha256: string;
  mainWidth: number;
  thumbBytes: number;
  thumbHeight: number;
  thumbSha256: string;
  thumbWidth: number;
};

function runtime(): Runtime {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const appUrl = process.env.PLAYWRIGHT_BASE_URL?.trim() ?? "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  const isLocal = (value: string, port?: string) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost", "::1"].includes(url.hostname) &&
        (!port || url.port === port)
      );
    } catch {
      return false;
    }
  };

  if (
    process.env.CONFIRM_TASK138_LOCAL_FIXTURE !== "yes" ||
    process.env.TEST_TARGET !== "local" ||
    !isLocal(supabaseUrl, "54321") ||
    !isLocal(appUrl) ||
    !publishableKey ||
    !serviceRoleKey
  ) {
    throw new Error("BLOCKED_TASK138_EXPLICIT_LOCAL_FIXTURE_REQUIRED");
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
    throw new Error("BLOCKED_TASK138_LOCAL_DATABASE_URL_REQUIRED");
  }
  return dbUrl;
}

function assertUuids(...values: string[]) {
  if (values.some((value) => !UUID_PATTERN.test(value))) {
    throw new Error("BLOCKED_TASK138_FIXTURE_UUID_INVALID");
  }
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

function executeFixtureSql(label: string, sql: string) {
  try {
    execFileSync(
      "psql",
      [localDatabaseUrl(), "-v", "ON_ERROR_STOP=1", "-c", sql],
      {
        encoding: "utf8",
        env: { ...process.env, PGCONNECT_TIMEOUT: "5" },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
  } catch (error) {
    const stderr =
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      (typeof error.stderr === "string" || Buffer.isBuffer(error.stderr))
        ? String(error.stderr)
        : "";
    const diagnostic = stderr
      .split("\n")
      .map((line) => line.trim())
      .find((line) => /^(ERROR|DETAIL|CONTEXT):/.test(line));
    const redacted = diagnostic
      ?.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<uuid>")
      .replace(/task138-[^\s'\"]+/gi, "<fixture>")
      .slice(0, 240);
    throw new Error(
      `BLOCKED_TASK138_${label}${redacted ? `: ${redacted}` : ""}`,
    );
  }
}

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error("BLOCKED_TASK138_FIXTURE_MANIFEST_MISSING");
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as FixtureManifest;
  assertUuids(
    manifest.shopId,
    manifest.productAId,
    manifest.productBId,
    manifest.versionId,
    ...Object.values(manifest.users).map((user) => user.id),
  );
  if (manifest.target !== "local") {
    throw new Error("BLOCKED_TASK138_FIXTURE_TARGET_INVALID");
  }
  return manifest;
}

function persistManifest(manifest: FixtureManifest) {
  const temporaryPath = `${MANIFEST_PATH}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, MANIFEST_PATH);
  chmodSync(MANIFEST_PATH, 0o600);
}

async function createUser(
  admin: ReturnType<typeof createClient<Database>>,
  role: RoleKey,
  runId: string,
): Promise<LocalUser> {
  const email = `task138-${role}-${runId.toLowerCase()}@example.invalid`;
  const password = `T138-${randomBytes(24).toString("base64url")}`;
  const result = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: { source: "TASK138_product_images_shared_fixture" },
  });
  const id = result.data.user?.id;
  if (result.error || !id) {
    throw new Error(`BLOCKED_TASK138_${role.toUpperCase()}_CREATE`);
  }
  return { email, id, password, role };
}

async function accessToken(target: Runtime, user: LocalUser) {
  const client = createClient<Database>(target.supabaseUrl, target.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  const token = result.data.session?.access_token;
  if (result.error || !token) {
    throw new Error(`BLOCKED_TASK138_${user.role.toUpperCase()}_SIGN_IN`);
  }
  return token;
}

async function cleanupFixture(
  admin: ReturnType<typeof createClient<Database>>,
  manifest: Omit<FixtureManifest, "createdAt" | "target" | "versionId"> & {
    versionId?: string;
  },
) {
  assertUuids(
    manifest.shopId,
    manifest.productAId,
    manifest.productBId,
    ...Object.values(manifest.users).map((user) => user.id),
  );

  const versions = await admin
    .from("inventory_product_image_versions")
    .select("main_path,thumb_path")
    .in("product_id", [manifest.productAId, manifest.productBId]);
  if (versions.error) {
    throw new Error("BLOCKED_TASK138_FIXTURE_VERSION_READ");
  }
  const paths = (versions.data ?? []).flatMap((row) => [
    row.main_path,
    row.thumb_path,
  ]);
  if (paths.length > 0) {
    const removed = await admin.storage.from("product-images").remove(paths);
    if (removed.error) {
      throw new Error("BLOCKED_TASK138_FIXTURE_STORAGE_CLEANUP");
    }
  }

  const userIds = Object.values(manifest.users)
    .map((user) => `'${user.id}'`)
    .join(",");
  executeFixtureSql(
    "FIXTURE_CLEANUP_SQL",
    `
        begin;
        select set_config('request.jwt.claims', '{"role":"service_role"}', true);
        update public.inventory_products
        set primary_image_version_id = null,
            primary_image_updated_at = null
        where id in ('${manifest.productAId}','${manifest.productBId}');
        delete from public.inventory_product_image_versions
        where product_id in ('${manifest.productAId}','${manifest.productBId}');
        alter table public.audit_logs disable trigger user;
        delete from public.audit_logs where shop_id = '${manifest.shopId}';
        alter table public.audit_logs enable trigger user;
        alter table public.sync_events disable trigger user;
        delete from public.sync_events where shop_id = '${manifest.shopId}';
        alter table public.sync_events enable trigger user;
        delete from public.staff_accounts where staff_id in (${userIds});
        delete from public.shop_inventory_sources where shop_id = '${manifest.shopId}';
        delete from public.shop_members where shop_id = '${manifest.shopId}';
        delete from public.inventory_products
        where id in ('${manifest.productAId}','${manifest.productBId}');
        delete from public.shops where shop_id = '${manifest.shopId}';
        delete from public.profiles where profile_id in (${userIds});
        commit;
      `,
  );

  for (const user of Object.values(manifest.users)) {
    const result = await admin.auth.admin.deleteUser(user.id);
    if (result.error) {
      throw new Error("BLOCKED_TASK138_FIXTURE_AUTH_CLEANUP");
    }
  }
}

async function signIn(page: Page, user: LocalUser) {
  await page.goto("/auth/login?mode=admin-account&next=/shop");
  await expect(
    page.getByRole("heading", { level: 1, name: "Admin Console sign in" }),
  ).toBeVisible();
  await page.evaluate(
    ({ email, password }) => {
      for (const [name, value] of Object.entries({ email, password })) {
        const input = document.querySelector<HTMLInputElement>(
          `input[name="${name}"]`,
        );
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (!input || !setter) throw new Error("login input unavailable");
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    { email: user.email, password: user.password },
  );
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/shop", { timeout: 20_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

async function syntheticPng(page: Page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 900;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas unavailable");
    const gradient = context.createLinearGradient(0, 0, 1200, 900);
    gradient.addColorStop(0, "rgba(14, 165, 233, 0.72)");
    gradient.addColorStop(1, "rgba(15, 23, 42, 0.94)");
    context.fillStyle = "white";
    context.fillRect(0, 0, 1200, 900);
    context.fillStyle = gradient;
    context.fillRect(80, 70, 1040, 760);
    context.fillStyle = "rgba(255,255,255,0.92)";
    context.font = "bold 88px sans-serif";
    context.fillText("TASK-138 B", 300, 490);
    return canvas.toDataURL("image/png").split(",")[1] ?? "";
  });
  return Buffer.from(base64, "base64");
}

async function postJson(
  request: APIRequestContext,
  path: string,
  token: string,
  data: Record<string, unknown>,
) {
  return request.post(path, {
    data,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

function fixtureState(manifest: FixtureManifest) {
  return queryJson<{
    imageObjects: number;
    imageVersions: number;
    memberRoles: string[];
    productACurrent: string | null;
    productBCurrent: string | null;
    products: number;
    staffRoles: string[];
  }>(`
    select json_build_object(
      'imageObjects', (
        select count(*) from storage.objects
        where bucket_id = 'product-images'
          and name like 'shops/${manifest.shopId}/products/%'
      ),
      'imageVersions', (
        select count(*) from public.inventory_product_image_versions
        where product_id in ('${manifest.productAId}','${manifest.productBId}')
      ),
      'memberRoles', (
        select coalesce(json_agg(role_key order by role_key), '[]'::json)
        from public.shop_members where shop_id = '${manifest.shopId}'
      ),
      'productACurrent', (
        select primary_image_version_id from public.inventory_products
        where id = '${manifest.productAId}'
      ),
      'productBCurrent', (
        select primary_image_version_id from public.inventory_products
        where id = '${manifest.productBId}'
      ),
      'products', (
        select count(*) from public.inventory_products
        where id in ('${manifest.productAId}','${manifest.productBId}')
      ),
      'staffRoles', (
        select coalesce(json_agg(role_key order by role_key), '[]'::json)
        from public.staff_accounts where shop_id = '${manifest.shopId}'
      )
    )::text;
  `);
}

test("TASK-138 persistent local multi-role Product A/B fixture", async ({
  page,
  request,
}, testInfo) => {
  const target = runtime();
  const mode = process.env.TASK138_FIXTURE_MODE?.trim() || "seed";
  const admin = createClient<Database>(target.supabaseUrl, target.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (mode === "status") {
    const manifest = readManifest();
    const state = fixtureState(manifest);
    expect(state).toMatchObject({
      imageObjects: 2,
      imageVersions: 1,
      memberRoles: ["shop_manager", "shop_owner", "viewer"],
      productACurrent: null,
      productBCurrent: manifest.versionId,
      products: 2,
      staffRoles: ["cashier"],
    });
    await testInfo.attach("task138-fixture-status-redacted", {
      body: Buffer.from(
        JSON.stringify({
          imageObjects: state.imageObjects,
          imageVersions: state.imageVersions,
          memberRoles: state.memberRoles,
          productAHasImage: state.productACurrent !== null,
          productBHasImage: state.productBCurrent !== null,
          products: state.products,
          result: "PASS",
          staffRoles: state.staffRoles,
          target: "local",
        }),
      ),
      contentType: "application/json",
    });
    return;
  }

  if (mode === "cleanup") {
    const manifest = readManifest();
    await cleanupFixture(admin, manifest);
    unlinkSync(MANIFEST_PATH);
    await testInfo.attach("task138-fixture-cleanup-redacted", {
      body: Buffer.from(JSON.stringify({ result: "PASS", target: "local" })),
      contentType: "application/json",
    });
    return;
  }

  if (mode !== "seed") {
    throw new Error("BLOCKED_TASK138_FIXTURE_MODE_INVALID");
  }
  if (existsSync(MANIFEST_PATH)) {
    throw new Error("BLOCKED_TASK138_FIXTURE_ALREADY_EXISTS");
  }

  const runId = randomBytes(5).toString("hex").toUpperCase();
  const shopId = randomUUID();
  const productAId = randomUUID();
  const productBId = randomUUID();
  const productAName = `TASK138 Product A No Image ${runId}`;
  const productBName = `TASK138 Product B With Image ${runId}`;
  const createdUsers: LocalUser[] = [];
  let partialManifest: Omit<
    FixtureManifest,
    "createdAt" | "target" | "versionId"
  > | null = null;

  try {
    const owner = await createUser(admin, "owner", runId);
    createdUsers.push(owner);
    const manager = await createUser(admin, "manager", runId);
    createdUsers.push(manager);
    const viewer = await createUser(admin, "viewer", runId);
    createdUsers.push(viewer);
    const cashier = await createUser(admin, "cashier", runId);
    createdUsers.push(cashier);
    const users = { cashier, manager, owner, viewer };
    partialManifest = {
      productAId,
      productAName,
      productBId,
      productBName,
      runId,
      shopId,
      users,
    };
    assertUuids(shopId, productAId, productBId, ...createdUsers.map((user) => user.id));

    executeFixtureSql(
      "FIXTURE_SEED_SQL",
      `
          begin;
          insert into public.profiles (profile_id, display_name, profile_status)
          values
            ('${owner.id}','TASK138 Owner ${runId}','active'),
            ('${manager.id}','TASK138 Manager ${runId}','active'),
            ('${viewer.id}','TASK138 Viewer ${runId}','active'),
            ('${cashier.id}','TASK138 Cashier ${runId}','active')
          on conflict (profile_id) do update
          set display_name = excluded.display_name,
              profile_status = excluded.profile_status;

          insert into public.shops (
            shop_id, shop_code, shop_name, shop_status, created_by_profile_id,
            status_changed_by_profile_id
          ) values (
            '${shopId}','T138${runId}','TASK138 Image Shop ${runId}','active',
            '${owner.id}','${owner.id}'
          );

          insert into public.shop_members (
            profile_id, shop_id, role_key, membership_status, invited_by_profile_id
          ) values
            ('${owner.id}','${shopId}','shop_owner','active','${owner.id}'),
            ('${manager.id}','${shopId}','shop_manager','active','${owner.id}'),
            ('${viewer.id}','${shopId}','viewer','active','${owner.id}');

          insert into public.staff_accounts (
            staff_id, shop_id, staff_code, display_name, role_key, status,
            credential_kind, credential_hash, credential_updated_at,
            must_change_credential, credential_status, created_by_profile_id,
            updated_by_profile_id
          ) values (
            '${cashier.id}','${shopId}','C${runId}','TASK138 Cashier ${runId}',
            'cashier','active','pin',repeat('0',64),now(),false,'active',
            '${owner.id}','${owner.id}'
          );

          insert into public.shop_inventory_sources (
            owner_user_id, shop_id, source_kind, mapping_state, verified_at,
            verified_by_profile_id, created_by_profile_id
          ) values (
            '${owner.id}','${shopId}','mobile_owner','mapped',now(),
            '${owner.id}','${owner.id}'
          );

          insert into public.inventory_products (
            id, owner_user_id, shop_id, barcode, item_number, product_name,
            purchase_price, retail_price, stock_quantity
          ) values
            (
              '${productAId}','${owner.id}','${shopId}','T138-A-${runId}',
              'T138-A-${runId}','${productAName}',10,15,5
            ),
            (
              '${productBId}','${owner.id}','${shopId}','T138-B-${runId}',
              'T138-B-${runId}','${productBName}',20,30,8
            );
          commit;
        `,
    );

    const referencedProducts = new Set<string>();
    const imageNetworkUrls: string[] = [];
    page.on("request", (networkRequest) => {
      const url = networkRequest.url();
      if (url.includes("/api/shop/product-images/read-urls")) {
        try {
          const body = networkRequest.postDataJSON() as {
            refs?: Array<{ productId?: string }>;
          };
          for (const ref of body.refs ?? []) {
            if (typeof ref.productId === "string") referencedProducts.add(ref.productId);
          }
        } catch {
          // The assertion below fails if Product A appears in any parseable request.
        }
      }
      if (url.includes("/storage/v1/object/") && url.includes("product-images")) {
        imageNetworkUrls.push(url);
      }
    });

    await signIn(page, owner);
    await page.goto(`/shop/products?shop_id=${shopId}`);
    const rowA = page
      .locator("[data-product-catalog-row]")
      .filter({ hasText: productAName });
    const rowB = page
      .locator("[data-product-catalog-row]")
      .filter({ hasText: productBName });
    await expect(rowA).toBeVisible();
    await expect(rowB).toBeVisible();
    await expect(rowA.locator("img")).toHaveCount(0);

    await rowB.getByRole("link", { name: /Detail:/ }).click();
    const dialog = page.getByRole("dialog");
    const editor = dialog.locator("[data-product-image-editor]");
    await expect(editor).toBeVisible();
    const png = await syntheticPng(page);
    await editor.locator('input[type="file"]').setInputFiles({
      buffer: png,
      mimeType: "image/png",
      name: "task138-product-b.png",
    });
    await expect(editor.getByText("Image ready to upload.")).toBeVisible({
      timeout: 30_000,
    });
    await editor.getByRole("button", { name: "Upload image" }).click();
    await expect(editor.getByText("Product image updated.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(editor.getByRole("img", { name: productBName })).toBeVisible();

    const image = queryJson<
      ImageMetadata & { productACurrent: string | null; versionId: string }
    >(`
      select json_build_object(
        'productACurrent', (
          select primary_image_version_id from public.inventory_products
          where id = '${productAId}'
        ),
        'versionId', v.id,
        'mainBytes', v.expected_main_bytes,
        'mainHeight', v.expected_main_height,
        'mainSha256', v.expected_main_sha256,
        'mainWidth', v.expected_main_width,
        'thumbBytes', v.expected_thumb_bytes,
        'thumbHeight', v.expected_thumb_height,
        'thumbSha256', v.expected_thumb_sha256,
        'thumbWidth', v.expected_thumb_width
      )::text
      from public.inventory_product_image_versions v
      join public.inventory_products p on p.primary_image_version_id = v.id
      where p.id = '${productBId}';
    `);
    expect(image.productACurrent).toBeNull();
    assertUuids(image.versionId);

    const uploadPayload = {
      main: {
        bytes: image.mainBytes,
        height: image.mainHeight,
        mimeType: "image/jpeg",
        sha256: image.mainSha256,
        width: image.mainWidth,
      },
      productId: productBId,
      shopId,
      thumb: {
        bytes: image.thumbBytes,
        height: image.thumbHeight,
        mimeType: "image/jpeg",
        sha256: image.thumbSha256,
        width: image.thumbWidth,
      },
    };

    const managerToken = await accessToken(target, manager);
    const viewerToken = await accessToken(target, viewer);
    const cashierToken = await accessToken(target, cashier);
    const managerIntent = await postJson(
      request,
      "/api/shop/product-images/intent",
      managerToken,
      uploadPayload,
    );
    expect(managerIntent.status()).toBe(200);
    expect(await managerIntent.json()).toMatchObject({ ok: true, status: "noop" });

    for (const token of [viewerToken, cashierToken]) {
      const denied = await postJson(
        request,
        "/api/shop/product-images/intent",
        token,
        uploadPayload,
      );
      expect(denied.status()).toBe(403);
      expect(await denied.json()).toMatchObject({
        code: "permission_denied",
        ok: false,
      });
    }

    for (const token of [managerToken, viewerToken]) {
      const read = await postJson(
        request,
        "/api/shop/product-images/read-urls",
        token,
        {
          refs: [
            { productId: productBId, variant: "thumb", versionId: image.versionId },
          ],
          shopId,
        },
      );
      expect(read.status()).toBe(200);
      const body = (await read.json()) as {
        items?: Array<{ status?: string; variant?: string }>;
        ok?: boolean;
      };
      expect(body.ok).toBe(true);
      expect(body.items).toHaveLength(1);
      expect(body.items?.[0]).toMatchObject({ status: "ready", variant: "thumb" });
    }
    const cashierRead = await postJson(
      request,
      "/api/shop/product-images/read-urls",
      cashierToken,
      {
        refs: [
          { productId: productBId, variant: "thumb", versionId: image.versionId },
        ],
        shopId,
      },
    );
    expect(cashierRead.status()).toBe(403);
    expect(await cashierRead.json()).toMatchObject({
      code: "permission_denied",
      ok: false,
    });

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(rowA.locator("img")).toHaveCount(0);
    await expect(rowB.getByRole("img", { name: productBName })).toBeVisible({
      timeout: 20_000,
    });
    expect(referencedProducts.has(productAId)).toBe(false);
    expect(imageNetworkUrls.some((url) => url.includes(productAId))).toBe(false);
    const cacheKeys = await page.evaluate(async () => {
      const cache = await caches.open("task137-product-images-v1");
      return (await cache.keys()).map((entry) => new URL(entry.url).pathname);
    });
    expect(cacheKeys.some((key) => key.includes(productAId))).toBe(false);

    const manifest: FixtureManifest = {
      ...partialManifest,
      createdAt: new Date().toISOString(),
      target: "local",
      versionId: image.versionId,
    };
    persistManifest(manifest);
    const state = fixtureState(manifest);
    expect(state).toMatchObject({
      imageObjects: 2,
      imageVersions: 1,
      memberRoles: ["shop_manager", "shop_owner", "viewer"],
      productACurrent: null,
      productBCurrent: image.versionId,
      products: 2,
      staffRoles: ["cashier"],
    });
    await testInfo.attach("task138-fixture-seed-redacted", {
      body: Buffer.from(
        JSON.stringify({
          imageObjects: state.imageObjects,
          imageVersions: state.imageVersions,
          managerWrite: "PASS_NOOP",
          productANetworkAndCache: "ZERO",
          productBMainAndThumb: "PASS",
          products: state.products,
          readRoles: ["manager", "viewer"],
          result: "PASS",
          target: "local",
          accessDeniedRoles: ["cashier"],
          writeDeniedRoles: ["cashier", "viewer"],
        }),
      ),
      contentType: "application/json",
    });
  } catch (error) {
    if (partialManifest) {
      await cleanupFixture(admin, partialManifest);
    } else {
      for (const user of createdUsers) {
        await admin.auth.admin.deleteUser(user.id);
      }
    }
    if (existsSync(MANIFEST_PATH)) unlinkSync(MANIFEST_PATH);
    throw error;
  }
});
