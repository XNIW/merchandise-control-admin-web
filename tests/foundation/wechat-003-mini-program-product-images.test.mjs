import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = process.cwd();
const require = createRequire(import.meta.url);
const ts = require("typescript");

const PROFILE_ID = "10000000-0000-4000-8000-000000000003";
const SHOP_ID = "20000000-0000-4000-8000-000000000003";

const routes = [
  ["intent", "intent"],
  ["finalize", "finalize"],
  ["remove", "remove"],
  ["read-urls", "read-urls"],
];

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function loadTypeScriptModule(relativePath, mockedRequires = {}) {
  const output = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  }).outputText;
  const cjsModule = { exports: {} };

  vm.runInNewContext(
    output,
    {
      Headers,
      Request,
      Response,
      TextDecoder,
      Uint8Array,
      exports: cjsModule.exports,
      module: cjsModule,
      require(specifier) {
        if (Object.hasOwn(mockedRequires, specifier)) {
          return mockedRequires[specifier];
        }
        return require(specifier);
      },
    },
    { filename: relativePath },
  );

  return cjsModule.exports;
}

const permissions = loadTypeScriptModule(
  "src/server/shop-admin/permissions.ts",
  { "server-only": {} },
);

function loadAuth(overrides = {}) {
  const rows = {
    platform_admins: { revoked_at: null, status: "active" },
    profiles: { profile_id: PROFILE_ID, profile_status: "active" },
    shop_members: { membership_status: "active", role_key: "shop_owner" },
    shops: { shop_id: SHOP_ID, shop_status: "active" },
    ...overrides,
  };
  const queriedTables = [];
  const admin = {
    from(table) {
      queriedTables.push(table);
      const query = {
        eq() {
          return query;
        },
        is() {
          return query;
        },
        async maybeSingle() {
          return { data: rows[table] ?? null, error: null };
        },
        select() {
          return query;
        },
      };
      return query;
    },
  };
  const authenticatedClient = {
    auth: {
      async getUser() {
        return {
          data: { user: { id: PROFILE_ID } },
          error: null,
        };
      },
    },
  };
  const auth = loadTypeScriptModule(
    "src/server/shop-admin/product-images/auth.ts",
    {
      "@/lib/supabase/admin": {
        createSupabaseAdminClient() {
          return admin;
        },
        resolveSupabaseAdminConfig() {
          return {
            serviceRoleKey: "service-role-test-key",
            status: "configured",
            url: "https://project.supabase.co",
          };
        },
      },
      "@/lib/supabase/server": {
        async createSupabaseServerClient() {
          return authenticatedClient;
        },
        resolveSupabaseServerConfig() {
          return {
            publishableKey: "publishable-test-key",
            status: "configured",
            url: "https://project.supabase.co",
          };
        },
      },
      "@/server/auth/wechat-config": {
        resolveWeChatRuntimeConfig: () => ({ hashSalt: "test-salt" }),
      },
      "@/server/auth/wechat-mini-session": {
        async resolveWeChatMiniSession(input) {
          return input.authorization
            ? {
                accountFingerprint: "f".repeat(64),
                actorProfileId: PROFILE_ID,
                expiresAt: 2_000_000_000,
                generation: 1,
                ok: true,
                sessionId: "90000000-0000-4000-8000-000000000003",
              }
            : { code: "session_expired", ok: false };
        },
      },
      "@supabase/supabase-js": {
        createClient() {
          return authenticatedClient;
        },
      },
      "../permissions": permissions,
      "server-only": {},
    },
  );

  return { auth, queriedTables };
}

function authenticatedRequest() {
  return new Request("https://admin.example.test/mini-images", {
    headers: { Authorization: "Bearer user-token" },
  });
}

function miniHandlerMocks(overrides = {}) {
  return {
    "@/server/auth/wechat-config": {
      isWeChatSurfaceReady: () => true,
      resolveWeChatRuntimeConfig: () => ({ activation: "ready" }),
    },
    "@/server/wechat/catalog-mutation-gateway": {
      isMiniProgramCatalogMutationReady: () => true,
    },
    ...overrides,
  };
}

test("WECHAT-003 Mini image routes bind each operation to the shared boundary", () => {
  for (const [path, operation] of routes) {
    const source = read(
      `src/app/api/mini-program/v1/product-images/${path}/route.ts`,
    );
    assert.match(source, /handleMiniProgramProductImageRequest/);
    assert.match(
      source,
      new RegExp(`handleMiniProgramProductImageRequest\\(request, "${operation}"\\)`),
    );
    assert.match(source, /export const dynamic = "force-dynamic"/);
    assert.match(source, /export const runtime = "nodejs"/);
    assert.doesNotMatch(source, /formData\(|arrayBuffer\(|File\b|Blob\b/);
  }

  const handler = read(
    "src/server/shop-admin/product-images/mini-program-handler.ts",
  );
  for (const parser of [
    "parseProductImageIntentInput",
    "parseProductImageFinalizeInput",
    "parseProductImageRemoveInput",
    "parseProductImageReadInput",
  ]) {
    assert.match(handler, new RegExp(parser));
  }
  for (const service of [
    "createProductImageIntent",
    "finalizeProductImage",
    "removeProductImage",
    "readProductImageUrls",
  ]) {
    assert.match(handler, new RegExp(service));
  }
  assert.match(handler, /"personal_catalog_member"/);
  assert.match(handler, /recordProductImageDenied/);
  assert.match(handler, /productImageJson/);
});

test("WECHAT-003 keeps the shop default platform-admin behavior explicit", async () => {
  const { auth, queriedTables } = loadAuth({ shop_members: null });
  const result = await auth.resolveProductImageRequestActor(
    authenticatedRequest(),
    SHOP_ID,
    "products.write",
  );

  assert.equal(result.status, "authorized");
  assert.equal(result.actor.actorKind, "platform_admin");
  assert.ok(queriedTables.includes("platform_admins"));
});

test("WECHAT-003 Mini policy denies platform-admin bypass and keeps a member personal", async () => {
  const withoutMembership = loadAuth({ shop_members: null });
  const denied = await withoutMembership.auth.resolveProductImageRequestActor(
    authenticatedRequest(),
    SHOP_ID,
    "products.read",
    "personal_catalog_member",
  );

  assert.equal(denied.status, "blocked");
  assert.equal(denied.code, "permission_denied");
  assert.equal(denied.actorKind, "personal_account");
  assert.equal(
    withoutMembership.queriedTables.includes("platform_admins"),
    false,
  );

  const withMembership = loadAuth();
  const authorized =
    await withMembership.auth.resolveProductImageRequestActor(
      authenticatedRequest(),
      SHOP_ID,
      "products.write",
      "personal_catalog_member",
    );

  assert.equal(authorized.status, "authorized");
  assert.equal(authorized.actor.actorKind, "personal_account");
  assert.equal(authorized.actor.actorProfileId, PROFILE_ID);
});

test("WECHAT-003 Mini policy gives viewers image read but not image write", async () => {
  const { auth } = loadAuth({
    platform_admins: null,
    shop_members: { membership_status: "active", role_key: "viewer" },
  });
  const readResult = await auth.resolveProductImageRequestActor(
    authenticatedRequest(),
    SHOP_ID,
    "products.read",
    "personal_catalog_member",
  );
  const writeResult = await auth.resolveProductImageRequestActor(
    authenticatedRequest(),
    SHOP_ID,
    "products.write",
    "personal_catalog_member",
  );

  assert.equal(readResult.status, "authorized");
  assert.equal(readResult.actor.actorKind, "personal_account");
  assert.equal(writeResult.status, "blocked");
  assert.equal(writeResult.code, "permission_denied");
});

test("WECHAT-003 Mini image boundary rejects malformed JSON before auth", async () => {
  const contract = loadTypeScriptModule(
    "src/server/shop-admin/product-images/contract.ts",
    {
      "../../shared/postgres-uuid.ts": {
        isPostgresUuid(value) {
          return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
        },
      },
    },
  );
  let authCalls = 0;
  let serviceCalls = 0;
  const service = {
    async createProductImageIntent() {
      serviceCalls += 1;
    },
    async finalizeProductImage() {
      serviceCalls += 1;
    },
    async readProductImageUrls() {
      serviceCalls += 1;
    },
    async recordProductImageDenied() {
      serviceCalls += 1;
    },
    async removeProductImage() {
      serviceCalls += 1;
    },
  };
  const handler = loadTypeScriptModule(
    "src/server/shop-admin/product-images/mini-program-handler.ts",
    {
      "./auth": {
        async resolveProductImageRequestActor() {
          authCalls += 1;
          throw new Error("auth must not run for malformed input");
        },
      },
      "./contract": contract,
      "./service": service,
      ...miniHandlerMocks(),
      "server-only": {},
    },
  );
  const request = new Request("https://admin.example.test/mini-images", {
    body: "{}",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": PROFILE_ID,
      "X-Correlation-ID": SHOP_ID,
    },
    method: "POST",
  });

  const response = await handler.handleMiniProgramProductImageRequest(
    request,
    "intent",
  );

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.deepEqual(await response.json(), {
    code: "validation_failed",
    message: "Invalid request.",
    ok: false,
  });
  assert.equal(authCalls, 0);
  assert.equal(serviceCalls, 0);
});

test("WECHAT-003 Mini image boundary is fail-closed behind surface and mutation flags", async () => {
  const contract = loadTypeScriptModule(
    "src/server/shop-admin/product-images/contract.ts",
    {
      "../../shared/postgres-uuid.ts": {
        isPostgresUuid(value) {
          return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
        },
      },
    },
  );
  let authCalls = 0;
  let serviceCalls = 0;
  const request = new Request("https://admin.example.test/mini-images", {
    body: JSON.stringify({
      productId: PROFILE_ID,
      shopId: SHOP_ID,
      versionId: PROFILE_ID,
    }),
    headers: {
      Authorization: "Bearer user-token",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const handler = loadTypeScriptModule(
    "src/server/shop-admin/product-images/mini-program-handler.ts",
    {
      "./auth": {
        async resolveProductImageRequestActor() {
          authCalls += 1;
          throw new Error("disabled surface must stop before auth");
        },
      },
      "./contract": contract,
      "./service": {
        async createProductImageIntent() {
          serviceCalls += 1;
        },
        async finalizeProductImage() {
          serviceCalls += 1;
        },
        async readProductImageUrls() {
          serviceCalls += 1;
        },
        async recordProductImageDenied() {},
        async removeProductImage() {
          serviceCalls += 1;
        },
      },
      ...miniHandlerMocks({
        "@/server/auth/wechat-config": {
          isWeChatSurfaceReady: () => false,
          resolveWeChatRuntimeConfig: () => ({ activation: "disabled" }),
        },
        "@/server/wechat/catalog-mutation-gateway": {
          isMiniProgramCatalogMutationReady: () => false,
        },
      }),
      "server-only": {},
    },
  );

  for (const operation of ["intent", "finalize", "remove", "read-urls"]) {
    const response = await handler.handleMiniProgramProductImageRequest(
      request.clone(),
      operation,
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "provider_not_configured");
  }
  assert.equal(authCalls, 0);
  assert.equal(serviceCalls, 0);
});

test("WECHAT-003 Mini personal image policy requires an explicit bearer", async () => {
  const { auth } = loadAuth();
  const denied = await auth.resolveProductImageRequestActor(
    new Request("https://admin.example.test/mini-images"),
    SHOP_ID,
    "products.read",
    "personal_catalog_member",
  );

  assert.equal(denied.status, "blocked");
  assert.equal(denied.code, "unauthorized");
});

test("WECHAT-003 Mini image errors are normalized to the public catalog taxonomy", async () => {
  const contract = loadTypeScriptModule(
    "src/server/shop-admin/product-images/contract.ts",
    {
      "../../shared/postgres-uuid.ts": {
        isPostgresUuid(value) {
          return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
        },
      },
    },
  );
  const handler = loadTypeScriptModule(
    "src/server/shop-admin/product-images/mini-program-handler.ts",
    {
      "./auth": {
        async resolveProductImageRequestActor() {
          return {
            actor: {
              actorKind: "personal_account",
              actorProfileId: PROFILE_ID,
              shopId: SHOP_ID,
            },
            status: "authorized",
          };
        },
      },
      "./contract": contract,
      "./service": {
        async createProductImageIntent() {
          throw new Error("unused");
        },
        async finalizeProductImage() {
          return {
            body: {
              code: "jpeg_truncated",
              message: "internal detail",
              ok: false,
            },
            status: 422,
          };
        },
        async readProductImageUrls() {
          throw new Error("unused");
        },
        async recordProductImageDenied() {},
        async removeProductImage() {
          throw new Error("unused");
        },
      },
      ...miniHandlerMocks(),
      "server-only": {},
    },
  );
  const response = await handler.handleMiniProgramProductImageRequest(
    new Request("https://admin.example.test/mini-images", {
      body: JSON.stringify({
        productId: PROFILE_ID,
        shopId: SHOP_ID,
        versionId: PROFILE_ID,
      }),
      headers: {
        Authorization: "Bearer user-token",
        "Content-Type": "application/json",
        "Idempotency-Key": PROFILE_ID,
        "X-Correlation-ID": SHOP_ID,
      },
      method: "POST",
    }),
    "finalize",
  );

  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    code: "image_invalid",
    message: "Product image operation could not be completed.",
    ok: false,
  });
});

test("WECHAT-003 Mini image intent keeps the RPC receiver bound and sends the exact personal contract", async () => {
  const calls = [];
  const admin = {
    async rpc(name, params) {
      assert.equal(this, admin);
      calls.push({ name, params });
      return {
        data: {
          code: "success",
          ok: true,
          status: "noop",
          version_id: PROFILE_ID,
        },
        error: null,
      };
    },
  };
  const service = loadTypeScriptModule(
    "src/server/shop-admin/product-images/service.ts",
    {
      "./cache-scope": {
        createProductImageCacheScope: () => "personal:test",
      },
      "./contract": {
        PRODUCT_IMAGE_BUCKET: "product-images",
        PRODUCT_IMAGE_MAIN_MAX_BYTES: 1024 * 1024,
        PRODUCT_IMAGE_MAIN_MAX_SIDE: 1600,
        PRODUCT_IMAGE_READ_RESPONSE_LIMIT: 64 * 1024,
        PRODUCT_IMAGE_READ_URL_TTL_SECONDS: 300,
        PRODUCT_IMAGE_THUMB_MAX_BYTES: 90 * 1024,
        PRODUCT_IMAGE_THUMB_MAX_SIDE: 384,
      },
      "./runtime-core": {
        isCanonicalProductImagePath: () => true,
        isProductImageStorageObjectMissingError: () => false,
        resolveProductImageAdminClient: () => admin,
        verifyDownloadedProductImageJpeg: () => ({ status: "verified" }),
      },
      "server-only": {},
    },
  );
  const correlationId = "30000000-0000-4000-8000-000000000003";
  const idempotencyKey = "40000000-0000-4000-8000-000000000003";
  const image = {
    bytes: 1,
    height: 1,
    mimeType: "image/jpeg",
    sha256: "a".repeat(64),
    width: 1,
  };

  const result = await service.createProductImageIntent(
    {
      actorKind: "personal_account",
      actorProfileId: PROFILE_ID,
      shopId: SHOP_ID,
    },
    { main: image, productId: PROFILE_ID, shopId: SHOP_ID, thumb: image },
    { correlationId, idempotencyKey },
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.status, "noop");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "product_image_create_intent_wechat_v1");
  assert.equal(calls[0].params.p_actor_profile_id, PROFILE_ID);
  assert.equal(calls[0].params.p_shop_id, SHOP_ID);
  assert.equal(calls[0].params.p_correlation_id, correlationId);
  assert.equal(calls[0].params.p_idempotency_key, idempotencyKey);
  assert.equal(Object.hasOwn(calls[0].params, "p_actor_kind"), false);
});

test("WECHAT-003 image intent never re-signs an expired upload capability", async () => {
  let storageCalls = 0;
  const admin = {
    async rpc() {
      return {
        data: {
          code: "upload_required",
          expires_at: "2000-01-01T00:00:00.000Z",
          main_path: `shops/${SHOP_ID}/products/${PROFILE_ID}/primary/${PROFILE_ID}/main.jpg`,
          ok: true,
          status: "upload_required",
          thumb_path: `shops/${SHOP_ID}/products/${PROFILE_ID}/primary/${PROFILE_ID}/thumb.jpg`,
          version_id: PROFILE_ID,
        },
        error: null,
      };
    },
    storage: {
      from() {
        storageCalls += 1;
        throw new Error("expired intent must stop before Storage signing");
      },
    },
  };
  const service = loadTypeScriptModule(
    "src/server/shop-admin/product-images/service.ts",
    {
      "./cache-scope": {
        createProductImageCacheScope: () => "personal:test",
      },
      "./contract": {
        PRODUCT_IMAGE_BUCKET: "product-images",
        PRODUCT_IMAGE_MAIN_MAX_BYTES: 1024 * 1024,
        PRODUCT_IMAGE_MAIN_MAX_SIDE: 1600,
        PRODUCT_IMAGE_READ_RESPONSE_LIMIT: 64 * 1024,
        PRODUCT_IMAGE_READ_URL_TTL_SECONDS: 300,
        PRODUCT_IMAGE_THUMB_MAX_BYTES: 90 * 1024,
        PRODUCT_IMAGE_THUMB_MAX_SIDE: 384,
      },
      "./runtime-core": {
        isCanonicalProductImagePath: () => true,
        isProductImageStorageObjectMissingError: () => false,
        resolveProductImageAdminClient: () => admin,
        verifyDownloadedProductImageJpeg: () => ({ status: "verified" }),
      },
      "server-only": {},
    },
  );
  const image = {
    bytes: 1,
    height: 1,
    mimeType: "image/jpeg",
    sha256: "a".repeat(64),
    width: 1,
  };

  const result = await service.createProductImageIntent(
    {
      actorKind: "personal_account",
      actorProfileId: PROFILE_ID,
      shopId: SHOP_ID,
    },
    { main: image, productId: PROFILE_ID, shopId: SHOP_ID, thumb: image },
    {
      correlationId: "30000000-0000-4000-8000-000000000003",
      idempotencyKey: "40000000-0000-4000-8000-000000000003",
    },
  );

  assert.equal(result.status, 503);
  assert.equal(result.body.code, "backend_contract_invalid");
  assert.equal(storageCalls, 0);
});
