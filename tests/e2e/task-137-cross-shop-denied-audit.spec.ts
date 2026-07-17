import { expect, test, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import type { Database, Json } from "../../src/lib/supabase/database.types";

test.setTimeout(120_000);

type Runtime = {
  publishableKey: string;
  serviceRoleKey: string;
  supabaseUrl: string;
};

type LocalUser = {
  email: string;
  id: string;
  password: string;
};

type Fixture = {
  attacker: LocalUser;
  cashier: LocalUser;
  cleanup: () => Promise<void>;
  productId: string;
  shopAId: string;
  shopBId: string;
  suspended: LocalUser;
  versionId: string;
  victimOwner: LocalUser;
  viewer: LocalUser;
};

type VictimState = {
  auditRows: number;
  currentVersionId: string | null;
  imageVersionRows: number;
  pendingCleanupRows: number;
  storageRows: number;
  syncRows: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function assertUuid(...values: string[]) {
  if (values.some((value) => !UUID_PATTERN.test(value))) {
    throw new Error("BLOCKED_TASK137_FIXTURE_UUID_INVALID");
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

function victimState(fixture: Fixture): VictimState {
  assertUuid(fixture.attacker.id, fixture.productId, fixture.shopBId);
  return queryJson<VictimState>(`
    select json_build_object(
      'auditRows', (
        select count(*) from public.audit_logs
        where shop_id = '${fixture.shopBId}'
          and event_key like 'shop.product_image.%'
      ),
      'currentVersionId', (
        select primary_image_version_id from public.inventory_products
        where id = '${fixture.productId}'
      ),
      'imageVersionRows', (
        select count(*) from public.inventory_product_image_versions
        where product_id = '${fixture.productId}'
      ),
      'pendingCleanupRows', (
        select count(*) from public.inventory_product_image_versions
        where product_id = '${fixture.productId}'
          and cleanup_status <> 'not_due'
      ),
      'storageRows', (
        select count(*) from storage.objects
        where bucket_id = 'product-images'
          and name like 'shops/${fixture.shopBId}/products/${fixture.productId}/%'
      ),
      'syncRows', (
        select count(*) from public.sync_events
        where shop_id = '${fixture.shopBId}'
          and source = 'product_image_api'
      )
    )::text;
  `);
}

function deniedAuditCount(shopId: string, actorId: string) {
  assertUuid(shopId, actorId);
  return queryJson<number>(`
    select to_json(count(*)::integer)::text
    from public.audit_logs
    where shop_id = '${shopId}'
      and actor_profile_id = '${actorId}'
      and event_key like 'shop.product_image.%_denied';
  `);
}

async function must<T>(
  label: string,
  operation: PromiseLike<{ data: T; error: unknown }>,
) {
  const result = await operation;
  if (result.error) {
    const code =
      typeof result.error === "object" &&
      result.error !== null &&
      "code" in result.error &&
      typeof result.error.code === "string" &&
      /^[A-Z0-9_]{1,32}$/i.test(result.error.code)
        ? result.error.code
        : "UNKNOWN";
    throw new Error(`BLOCKED_TASK137_${label}_${code}`);
  }
  return result.data;
}

async function createUser(
  admin: ReturnType<typeof createClient<Database>>,
  label: string,
  nonce: string,
): Promise<LocalUser> {
  const email = `task137-${label}-${nonce.toLowerCase()}@example.invalid`;
  const password = `T137-${randomBytes(24).toString("base64url")}`;
  const result = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: { source: "TASK137_cross_shop_denied_audit" },
  });
  const id = result.data.user?.id;
  if (result.error || !id) {
    throw new Error(`BLOCKED_TASK137_${label.toUpperCase()}_CREATE`);
  }
  return { email, id, password };
}

async function accessToken(target: Runtime, user: LocalUser) {
  const client = createClient<Database>(
    target.supabaseUrl,
    target.publishableKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const result = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  const token = result.data.session?.access_token;
  if (result.error || !token) {
    throw new Error("BLOCKED_TASK137_FIXTURE_SIGN_IN");
  }
  return token;
}

function rpcObject(value: Json | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : {};
}

async function createFixture(target: Runtime): Promise<Fixture> {
  const admin = createClient<Database>(target.supabaseUrl, target.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const nonce = randomBytes(5).toString("hex").toUpperCase();
  const users: LocalUser[] = [];
  let shopAId = "";
  let shopBId = "";
  let productId = "";
  let versionId = "";

  const createTrackedUser = async (label: string) => {
    const user = await createUser(admin, label, nonce);
    users.push(user);
    return user;
  };

  const cleanup = async () => {
    if (productId) {
      const versions = await admin
        .from("inventory_product_image_versions")
        .select("main_path,thumb_path")
        .eq("product_id", productId);
      if (versions.error) {
        throw new Error("BLOCKED_TASK137_FIXTURE_VERSION_READ");
      }
      const paths = (versions.data ?? []).flatMap((row) => [
        row.main_path,
        row.thumb_path,
      ]);
      if (paths.length > 0) {
        const removed = await admin.storage.from("product-images").remove(paths);
        if (removed.error) {
          throw new Error("BLOCKED_TASK137_FIXTURE_STORAGE_CLEANUP");
        }
      }
    }

    if (productId && shopAId && shopBId && users.length > 0) {
      assertUuid(productId, shopAId, shopBId, ...users.map((user) => user.id));
      const userIds = users.map((user) => `'${user.id}'`).join(",");
      execFileSync(
        "psql",
        [
          localDatabaseUrl(),
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          `
            begin;
            select set_config('request.jwt.claims', '{"role":"service_role"}', true);
            update public.inventory_products
            set primary_image_version_id = null,
                primary_image_updated_at = null
            where id = '${productId}';
            delete from public.inventory_product_image_versions where product_id = '${productId}';
            delete from public.inventory_products where id = '${productId}';
            alter table public.audit_logs disable trigger user;
            delete from public.audit_logs where shop_id in ('${shopAId}','${shopBId}');
            alter table public.audit_logs enable trigger user;
            alter table public.sync_events disable trigger user;
            delete from public.sync_events where shop_id in ('${shopAId}','${shopBId}');
            alter table public.sync_events enable trigger user;
            delete from public.staff_accounts where staff_id in (${userIds});
            delete from public.shop_members where shop_id in ('${shopAId}','${shopBId}');
            delete from public.shops where shop_id in ('${shopAId}','${shopBId}');
            delete from public.profiles where profile_id in (${userIds});
            commit;
          `,
        ],
        {
          env: { ...process.env, PGCONNECT_TIMEOUT: "5" },
          stdio: "ignore",
        },
      );
    }

    for (const user of users) {
      const result = await admin.auth.admin.deleteUser(user.id);
      if (result.error) {
        throw new Error("BLOCKED_TASK137_FIXTURE_AUTH_CLEANUP");
      }
    }
  };

  try {
    const attacker = await createTrackedUser("attacker");
    const victimOwner = await createTrackedUser("victim");
    const viewer = await createTrackedUser("viewer");
    const cashier = await createTrackedUser("cashier");
    const suspended = await createTrackedUser("suspended");
    shopAId = randomUUID();
    shopBId = randomUUID();
    productId = randomUUID();
    assertUuid(shopAId, shopBId, productId, ...users.map((user) => user.id));

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
          values
            ('${attacker.id}','TASK137 attacker ${nonce}','active'),
            ('${victimOwner.id}','TASK137 victim ${nonce}','active'),
            ('${viewer.id}','TASK137 viewer ${nonce}','active'),
            ('${cashier.id}','TASK137 cashier ${nonce}','active'),
            ('${suspended.id}','TASK137 suspended ${nonce}','active')
          on conflict (profile_id) do update
          set display_name = excluded.display_name,
              profile_status = excluded.profile_status;

          insert into public.shops (
            shop_id, shop_code, shop_name, shop_status, created_by_profile_id
          )
          values
            ('${shopAId}','T137A${nonce}','TASK137 attacker shop ${nonce}','active','${attacker.id}'),
            ('${shopBId}','T137B${nonce}','TASK137 victim shop ${nonce}','active','${victimOwner.id}');

          insert into public.shop_members (
            profile_id, shop_id, role_key, membership_status, suspended_at
          )
          values
            ('${attacker.id}','${shopAId}','shop_owner','active',null),
            ('${victimOwner.id}','${shopBId}','shop_owner','active',null),
            ('${viewer.id}','${shopBId}','viewer','active',null),
            ('${suspended.id}','${shopBId}','shop_manager','suspended',now());

          insert into public.staff_accounts (
            staff_id,
            shop_id,
            staff_code,
            display_name,
            role_key,
            status,
            credential_kind,
            credential_hash,
            credential_updated_at,
            must_change_credential,
            credential_status,
            created_by_profile_id,
            updated_by_profile_id
          )
          values (
            '${cashier.id}',
            '${shopBId}',
            'T137C${nonce}',
            'TASK137 cashier ${nonce}',
            'cashier',
            'active',
            'pin',
            repeat('0', 64),
            now(),
            false,
            'active',
            '${victimOwner.id}',
            '${victimOwner.id}'
          );

          insert into public.inventory_products (
            id, owner_user_id, shop_id, barcode, product_name
          )
          values (
            '${productId}',
            '${victimOwner.id}',
            '${shopBId}',
            'T137-CROSS-${nonce}',
            'TASK137 victim product ${nonce}'
          );
          commit;
        `,
      ],
      {
        env: { ...process.env, PGCONNECT_TIMEOUT: "5" },
        stdio: "ignore",
      },
    );

    const intent = rpcObject(
      await must(
        "VICTIM_INTENT_CREATE",
        admin.rpc("product_image_create_intent", {
          p_actor_kind: "personal_account",
          p_actor_profile_id: victimOwner.id,
          p_main_bytes: 1_000,
          p_main_height: 120,
          p_main_sha256: "a".repeat(64),
          p_main_width: 160,
          p_product_id: productId,
          p_shop_id: shopBId,
          p_thumb_bytes: 500,
          p_thumb_height: 60,
          p_thumb_sha256: "b".repeat(64),
          p_thumb_width: 80,
        }),
      ),
    );
    versionId = typeof intent.version_id === "string" ? intent.version_id : "";
    assertUuid(versionId);

    const finalized = rpcObject(
      await must(
        "VICTIM_FINALIZE",
        admin.rpc("product_image_finalize", {
          p_actor_kind: "personal_account",
          p_actor_profile_id: victimOwner.id,
          p_main_bytes: 1_000,
          p_main_height: 120,
          p_main_sha256: "a".repeat(64),
          p_main_width: 160,
          p_product_id: productId,
          p_shop_id: shopBId,
          p_thumb_bytes: 500,
          p_thumb_height: 60,
          p_thumb_sha256: "b".repeat(64),
          p_thumb_width: 80,
          p_version_id: versionId,
        }),
      ),
    );
    if (finalized.status !== "finalized") {
      throw new Error("BLOCKED_TASK137_VICTIM_FINALIZE_CONTRACT");
    }

    return {
      attacker,
      cashier,
      cleanup,
      productId,
      shopAId,
      shopBId,
      suspended,
      versionId,
      victimOwner,
      viewer,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function postDenied(
  request: APIRequestContext,
  path: string,
  token: string,
  data: Record<string, unknown>,
) {
  const response = await request.post(path, {
    data,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const body = (await response.json()) as Record<string, unknown>;
  expect(response.status()).toBe(403);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(body).toMatchObject({
    code: "permission_denied",
    ok: false,
  });
  expect(JSON.stringify(body)).not.toMatch(
    /signed.?url|upload.?url|object.?path|storage.?token|shops\//i,
  );
  return body;
}

test("TASK-137 denied cross-shop routes have zero victim side effects", async ({
  request,
}) => {
  const target = runtime();
  const fixture = await createFixture(target);

  try {
    const attackerToken = await accessToken(target, fixture.attacker);
    const before = victimState(fixture);
    expect(before.currentVersionId).toBe(fixture.versionId);
    expect(before.imageVersionRows).toBe(1);
    expect(before.pendingCleanupRows).toBe(0);
    expect(before.storageRows).toBe(0);
    expect(before.syncRows).toBe(1);

    await postDenied(request, "/api/shop/product-images/intent", attackerToken, {
      main: {
        bytes: 1_000,
        height: 120,
        mimeType: "image/jpeg",
        sha256: "c".repeat(64),
        width: 160,
      },
      productId: fixture.productId,
      shopId: fixture.shopBId,
      thumb: {
        bytes: 500,
        height: 60,
        mimeType: "image/jpeg",
        sha256: "d".repeat(64),
        width: 80,
      },
    });
    await postDenied(request, "/api/shop/product-images/finalize", attackerToken, {
      productId: fixture.productId,
      shopId: fixture.shopBId,
      versionId: fixture.versionId,
    });
    await postDenied(request, "/api/shop/product-images/read-urls", attackerToken, {
      refs: [
        {
          productId: fixture.productId,
          variant: "main",
          versionId: fixture.versionId,
        },
      ],
      shopId: fixture.shopBId,
    });
    await postDenied(request, "/api/shop/product-images/remove", attackerToken, {
      expectedVersionId: fixture.versionId,
      productId: fixture.productId,
      shopId: fixture.shopBId,
    });

    expect(victimState(fixture)).toEqual(before);
    expect(deniedAuditCount(fixture.shopBId, fixture.attacker.id)).toBe(0);

    const viewerToken = await accessToken(target, fixture.viewer);
    await postDenied(request, "/api/shop/product-images/intent", viewerToken, {
      main: {
        bytes: 1_000,
        height: 120,
        mimeType: "image/jpeg",
        sha256: "e".repeat(64),
        width: 160,
      },
      productId: fixture.productId,
      shopId: fixture.shopBId,
      thumb: {
        bytes: 500,
        height: 60,
        mimeType: "image/jpeg",
        sha256: "f".repeat(64),
        width: 80,
      },
    });
    expect(deniedAuditCount(fixture.shopBId, fixture.viewer.id)).toBe(1);

    const cashierToken = await accessToken(target, fixture.cashier);
    await postDenied(request, "/api/shop/product-images/intent", cashierToken, {
      main: {
        bytes: 1_000,
        height: 120,
        mimeType: "image/jpeg",
        sha256: "e".repeat(64),
        width: 160,
      },
      productId: fixture.productId,
      shopId: fixture.shopBId,
      thumb: {
        bytes: 500,
        height: 60,
        mimeType: "image/jpeg",
        sha256: "f".repeat(64),
        width: 80,
      },
    });
    expect(deniedAuditCount(fixture.shopBId, fixture.cashier.id)).toBe(0);

    const suspendedToken = await accessToken(target, fixture.suspended);
    await postDenied(request, "/api/shop/product-images/intent", suspendedToken, {
      main: {
        bytes: 1_000,
        height: 120,
        mimeType: "image/jpeg",
        sha256: "e".repeat(64),
        width: 160,
      },
      productId: fixture.productId,
      shopId: fixture.shopBId,
      thumb: {
        bytes: 500,
        height: 60,
        mimeType: "image/jpeg",
        sha256: "f".repeat(64),
        width: 80,
      },
    });
    expect(deniedAuditCount(fixture.shopBId, fixture.suspended.id)).toBe(0);

    assertUuid(fixture.shopBId, fixture.victimOwner.id);
    execFileSync(
      "psql",
      [
        localDatabaseUrl(),
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `
          update public.shops
          set shop_status = 'suspended',
              status_changed_by_profile_id = '${fixture.victimOwner.id}',
              status_reason_redacted = 'TASK-137 local regression fixture',
              suspended_at = now(),
              suspended_by_profile_id = '${fixture.victimOwner.id}'
          where shop_id = '${fixture.shopBId}';
        `,
      ],
      {
        env: { ...process.env, PGCONNECT_TIMEOUT: "5" },
        stdio: "ignore",
      },
    );
    await postDenied(request, "/api/shop/product-images/intent", viewerToken, {
      main: {
        bytes: 1_000,
        height: 120,
        mimeType: "image/jpeg",
        sha256: "e".repeat(64),
        width: 160,
      },
      productId: fixture.productId,
      shopId: fixture.shopBId,
      thumb: {
        bytes: 500,
        height: 60,
        mimeType: "image/jpeg",
        sha256: "f".repeat(64),
        width: 80,
      },
    });
    expect(deniedAuditCount(fixture.shopBId, fixture.viewer.id)).toBe(1);
  } finally {
    await fixture.cleanup();
  }
});
