import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isCanonicalProductImageObjectPath,
  isEligibleProductImageOrphan,
} from "../../scripts/admin/task-137-product-image-cleanup.mjs";
import { safeProductImageStorageUrl } from "../../src/lib/product-images/browser-client.ts";
import {
  PRODUCT_IMAGE_MAIN_MAX_BYTES,
  PRODUCT_IMAGE_READ_BATCH_LIMIT,
  PRODUCT_IMAGE_THUMB_MAX_BYTES,
  parseProductImageFinalizeInput,
  parseProductImageIntentInput,
  parseProductImageReadInput,
  parseProductImageRemoveInput,
  readProductImageJson,
} from "../../src/server/shop-admin/product-images/contract.ts";
import { inspectJpeg } from "../../src/server/shop-admin/product-images/jpeg-validator.ts";

const SHOP_ID = "10000000-0000-4000-8000-000000000137";
const PRODUCT_ID = "20000000-0000-4000-8000-000000000137";
const VERSION_ID = "30000000-0000-4000-8000-000000000137";

function jpeg(width, height, options = {}) {
  const frameMarker = options.progressive ? 0xc2 : 0xc0;
  const app1 = options.app1
    ? [0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00]
    : [];
  return Uint8Array.from([
    0xff,
    0xd8,
    ...app1,
    0xff,
    frameMarker,
    0x00,
    0x0b,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
    0xff,
    0xda,
    0x00,
    0x08,
    0x01,
    0x01,
    0x00,
    0x00,
    0x3f,
    0x00,
    0x01,
    0x02,
    0xff,
    0x00,
    0x03,
    0xff,
    0xd9,
  ]);
}

function validIntent() {
  return {
    main: {
      bytes: 700_000,
      height: 1200,
      mimeType: "image/jpeg",
      sha256: "a".repeat(64),
      width: 1600,
    },
    productId: PRODUCT_ID,
    shopId: SHOP_ID,
    thumb: {
      bytes: 90_000,
      height: 288,
      mimeType: "image/jpeg",
      sha256: "b".repeat(64),
      width: 384,
    },
  };
}

test("TASK-137 JPEG parser accepts baseline and progressive dimensions", () => {
  assert.deepEqual(inspectJpeg(jpeg(1600, 1200)), {
    inspection: { height: 1200, width: 1600 },
    ok: true,
  });
  assert.deepEqual(inspectJpeg(jpeg(384, 288, { progressive: true })), {
    inspection: { height: 288, width: 384 },
    ok: true,
  });
});

test("TASK-137 JPEG parser rejects APP1 metadata", () => {
  assert.deepEqual(inspectJpeg(jpeg(800, 600, { app1: true })), {
    code: "jpeg_metadata_forbidden",
    ok: false,
  });
});

test("TASK-137 JPEG parser rejects invalid magic and trailing bytes", () => {
  assert.equal(inspectJpeg(Uint8Array.from([1, 2, 3, 4])).ok, false);
  const withTrailingByte = Uint8Array.from([...jpeg(800, 600), 0x00]);
  assert.deepEqual(inspectJpeg(withTrailingByte), {
    code: "jpeg_magic_invalid",
    ok: false,
  });
});

test("TASK-137 intent parser freezes budgets and aspect ratio", () => {
  assert.deepEqual(parseProductImageIntentInput(validIntent()), validIntent());

  const oversizedMain = validIntent();
  oversizedMain.main.bytes = PRODUCT_IMAGE_MAIN_MAX_BYTES + 1;
  assert.equal(parseProductImageIntentInput(oversizedMain), null);

  const oversizedThumb = validIntent();
  oversizedThumb.thumb.bytes = PRODUCT_IMAGE_THUMB_MAX_BYTES + 1;
  assert.equal(parseProductImageIntentInput(oversizedThumb), null);

  const wrongAspect = validIntent();
  wrongAspect.thumb.height = 384;
  assert.equal(parseProductImageIntentInput(wrongAspect), null);
});

test("TASK-137 parser rejects non-JPEG metadata and malformed hashes", () => {
  const png = validIntent();
  png.main.mimeType = "image/png";
  assert.equal(parseProductImageIntentInput(png), null);

  const uppercaseHash = validIntent();
  uppercaseHash.main.sha256 = "A".repeat(64);
  assert.equal(parseProductImageIntentInput(uppercaseHash), null);
});

test("TASK-137 finalize and remove require opaque UUIDs", () => {
  assert.deepEqual(
    parseProductImageFinalizeInput({
      productId: PRODUCT_ID,
      shopId: SHOP_ID,
      versionId: VERSION_ID,
    }),
    { productId: PRODUCT_ID, shopId: SHOP_ID, versionId: VERSION_ID },
  );
  assert.deepEqual(
    parseProductImageRemoveInput({
      expectedVersionId: VERSION_ID,
      productId: PRODUCT_ID,
      shopId: SHOP_ID,
    }),
    {
      expectedVersionId: VERSION_ID,
      productId: PRODUCT_ID,
      shopId: SHOP_ID,
      versionId: VERSION_ID,
    },
  );
  assert.equal(
    parseProductImageFinalizeInput({
      productId: PRODUCT_ID,
      shopId: SHOP_ID,
      versionId: "product-name",
    }),
    null,
  );
});

test("TASK-137 read contract is bounded to 100 private references", () => {
  const ref = { productId: PRODUCT_ID, variant: "thumb", versionId: VERSION_ID };
  assert.equal(
    parseProductImageReadInput({
      refs: Array.from({ length: PRODUCT_IMAGE_READ_BATCH_LIMIT }, () => ref),
      shopId: SHOP_ID,
    })?.refs.length,
    PRODUCT_IMAGE_READ_BATCH_LIMIT,
  );
  assert.equal(
    parseProductImageReadInput({
      refs: Array.from({ length: PRODUCT_IMAGE_READ_BATCH_LIMIT + 1 }, () => ref),
      shopId: SHOP_ID,
    }),
    null,
  );
});

test("TASK-137 bounded JSON reader rejects wrong media type and oversized bodies", async () => {
  assert.equal(
    await readProductImageJson(
      new Request("http://localhost/api", {
        body: "{}",
        headers: { "content-type": "text/plain" },
        method: "POST",
      }),
    ),
    null,
  );

  assert.equal(
    await readProductImageJson(
      new Request("http://localhost/api", {
        body: JSON.stringify({ payload: "x".repeat(20_000) }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    ),
    null,
  );
});

test("TASK-137 migration keeps Storage private and RPCs service-only", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260717072959_task_137_product_catalog_images.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /'product-images',[\s\S]*?false,[\s\S]*?1048576/);
  assert.match(
    migration,
    /create policy task137_product_images_private_read[\s\S]*?for select[\s\S]*?to authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /create policy task137_product_images[^;]*?for (insert|update|delete|all)/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.product_image_create_intent[^;]+to service_role/,
  );
  assert.match(
    migration,
    /revoke all on function public\.product_image_create_intent[^;]+from public, anon, authenticated/,
  );
});

test("TASK-137 sync payload contains product IDs but no object path or URL", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260717073607_task_137_product_catalog_images_sync_fix.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const syncFunction = migration.slice(
    migration.indexOf("create or replace function app_private.emit_product_image_sync_event"),
  );

  assert.match(syncFunction, /jsonb_build_object\('product_ids'/);
  assert.match(syncFunction, /'catalog_changed'/);
  assert.doesNotMatch(syncFunction, /main_path|thumb_path|signed_url|upload_url|token/);
});

test("TASK-137 routes are no-store and never accept image bytes", async () => {
  const contract = await readFile(
    new URL(
      "../../src/server/shop-admin/product-images/contract.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const routes = await Promise.all(
    ["intent", "finalize", "read-urls", "remove"].map((route) =>
      readFile(
        new URL(
          `../../src/app/api/shop/product-images/${route}/route.ts`,
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );

  assert.match(contract, /"Cache-Control": "no-store"/);
  for (const route of routes) {
    assert.match(route, /readProductImageJson/);
    assert.doesNotMatch(route, /formData\(|arrayBuffer\(|File\b|Blob\b/);
  }
});

test("TASK-137 server never logs signed URLs, tokens or image bytes", async () => {
  const service = await readFile(
    new URL(
      "../../src/server/shop-admin/product-images/service.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(service, /console\.(log|info|warn|error)/);
  assert.doesNotMatch(service, /metadata_redacted[^\n]*(signed|token|path)/i);
});

test("TASK-137 browser pipeline freezes preprocessing, direct PUT and account-scoped byte cache", async () => {
  const client = await readFile(
    new URL(
      "../../src/lib/product-images/browser-client.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(client, /const MAIN_MAX_SIDE = 1600/);
  assert.match(client, /const MAIN_TARGET_BYTES = 750 \* 1024/);
  assert.match(client, /const MAIN_MAX_BYTES = 1024 \* 1024/);
  assert.match(client, /const THUMB_MAX_SIDE = 384/);
  assert.match(client, /const THUMB_MAX_BYTES = 90 \* 1024/);
  assert.match(client, /qualities: \[0\.82, 0\.76, 0\.7\]/);
  assert.match(client, /minimumSide: 640/);
  assert.match(client, /minimumSide: 128/);
  assert.match(client, /Math\.floor\(maximumSide \* 0\.85\)/);
  assert.match(client, /PRODUCT_IMAGE_PREPROCESS_MEASURE/);
  assert.match(client, /performance\.measure\(PRODUCT_IMAGE_PREPROCESS_MEASURE/);
  assert.match(client, /context\.fillStyle = "#ffffff"/);
  assert.match(client, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(client, /const body = new FormData\(\)/);
  assert.match(client, /method: "PUT"/);
  assert.match(client, /"x-upsert": "false"/);
  assert.match(
    client,
    /cacheScope,[\s\S]*?ref\.shopId,[\s\S]*?ref\.productId,[\s\S]*?ref\.versionId,[\s\S]*?`\$\{ref\.variant\}\.jpg`/,
  );
  assert.doesNotMatch(client, /localStorage|sessionStorage/);
  assert.doesNotMatch(client, /console\.(log|info|warn|error)/);
});

test("TASK-137 signed Storage URLs stay bound to the configured Supabase origin", () => {
  const previousSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousWindow = globalThis.window;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project-137.supabase.co";
  globalThis.window = { location: { origin: "https://admin.task137.invalid" } };

  try {
    assert.equal(
      safeProductImageStorageUrl(
        "https://project-137.supabase.co/storage/v1/object/sign/product-images/shops/path.jpg?token=redacted",
        "read",
      ),
      "https://project-137.supabase.co/storage/v1/object/sign/product-images/shops/path.jpg?token=redacted",
    );
    assert.throws(
      () =>
        safeProductImageStorageUrl(
          "https://attacker.invalid/storage/v1/object/sign/product-images/shops/path.jpg?token=redacted",
          "read",
        ),
      /image_signed_url_invalid/,
    );
    assert.throws(
      () =>
        safeProductImageStorageUrl(
          "https://project-137.supabase.co/redirect/storage/v1/object/sign/product-images/path.jpg",
          "read",
        ),
      /image_signed_url_invalid/,
    );
  } finally {
    if (previousSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = previousSupabaseUrl;
    }
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});

test("TASK-137 cleanup selects only aged canonical objects without lifecycle rows", () => {
  const path = `${"shops/10000000-0000-4000-8000-000000000137"}/products/${PRODUCT_ID}/primary/${VERSION_ID}/main.jpg`;
  const cutoffTime = Date.parse("2026-07-17T12:00:00Z");

  assert.equal(isCanonicalProductImageObjectPath(path), true);
  assert.equal(
    isEligibleProductImageOrphan(
      { createdAt: "2026-07-16T11:59:59Z", path },
      new Set(),
      cutoffTime,
    ),
    true,
  );
  assert.equal(
    isEligibleProductImageOrphan(
      { createdAt: "2026-07-16T11:59:59Z", path },
      new Set([path]),
      cutoffTime,
    ),
    false,
  );
  assert.equal(
    isEligibleProductImageOrphan(
      { createdAt: "2026-07-17T12:00:01Z", path },
      new Set(),
      cutoffTime,
    ),
    false,
  );
  assert.equal(
    isEligibleProductImageOrphan(
      { createdAt: "2026-07-16T11:59:59Z", path: "unscoped/main.jpg" },
      new Set(),
      cutoffTime,
    ),
    false,
  );
});

test("TASK-137 UI keeps image upload separate from product form and cleanup defaults to dry-run", async () => {
  const [controls, cleanup] = await Promise.all([
    readFile(
      new URL(
        "../../src/app/shop/_components/ProductImageControls.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../scripts/admin/task-137-product-image-cleanup.mjs",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(controls, /data-product-image-editor/);
  assert.match(controls, /accept="\.jpg,\.jpeg,\.png,image\/jpeg,image\/png"/);
  assert.doesNotMatch(controls, /<form\b/);
  assert.match(cleanup, /const execute = args\.has\("--execute"\)/);
  assert.match(cleanup, /mode=\$\{execute \? "execute" : "dry-run"\}/);
  assert.match(cleanup, /const batchLimit = 100/);
  assert.doesNotMatch(cleanup, /console\.log\([^\n]*(main_path|thumb_path)/);
});

test("TASK-137 operational report is bounded, read-only and redacts shop and object paths", async () => {
  const [report, packageJson] = await Promise.all([
    readFile(
      new URL(
        "../../scripts/admin/task-137-product-image-report.mjs",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(packageJson, /"task137:images:report"/);
  assert.match(report, /assertLocalTargetEnv/);
  assert.match(report, /assertStagingTargetEnv/);
  assert.match(report, /const maximumRows = 50_000/);
  assert.match(report, /const maximumStorageObjects = 50_000/);
  assert.match(report, /current_image_count/);
  assert.match(report, /storage_total_bytes/);
  assert.match(report, /unreferenced_object_count/);
  assert.match(report, /above_budget_version_count/);
  assert.match(report, /hashShopId/);
  assert.doesNotMatch(report, /info\([^\n]*(main_path|thumb_path|objectPath)/);
  assert.doesNotMatch(report, /\.(insert|delete|upsert|remove)\s*\(/);
  assert.doesNotMatch(
    report,
    /\.from\([^)]*\)[\s\S]{0,160}\.update\s*\(/,
  );
});
