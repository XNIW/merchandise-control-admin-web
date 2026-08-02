import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  parseStorefrontImageIntent,
  parseStorefrontImageSource,
  parseStorefrontImageTarget,
  readStorefrontImageJson,
} from "../../src/server/shop-admin/storefront-images/contract.ts";
import {
  inspectStorefrontWebp,
  verifyStorefrontWebp,
} from "../../src/server/shop-admin/storefront-images/webp-validator.ts";
import { sanitizeStorefrontWebp } from "../../src/app/shop/storefront/storefront-webp-sanitizer.ts";
import {
  isCanonicalStorefrontImagePath,
  validateStagingTarget,
} from "../../scripts/admin/storefront-v1-image-cleanup.mjs";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const migration = read(
  "supabase/migrations/20260802023000_storefront_v1_public_images.sql",
);
const component = read("src/app/shop/storefront/StorefrontImagesControl.tsx");
const service = read("src/server/shop-admin/storefront-images/service.ts");
const page = read("src/app/shop/storefront/page.tsx");
const cleanupWorkflow = read(
  ".github/workflows/storefront-v1-image-cleanup.yml",
);
const stagingMigrationWorkflow = read(
  ".github/workflows/storefront-v1-staging-migrations.yml",
);
const SHOP = "10000000-0000-4000-8000-000000020090";
const PUBLICATION = "50000000-0000-4000-8000-000000020090";
const SOURCE = "60000000-0000-4000-8000-000000020090";
const IMAGE = "70000000-0000-4000-8000-000000020090";

function riff(chunks) {
  const body = [0x57, 0x45, 0x42, 0x50];
  for (const { data, type } of chunks) {
    body.push(...Buffer.from(type, "ascii"));
    const size = data.length;
    body.push(
      size & 255,
      (size >> 8) & 255,
      (size >> 16) & 255,
      (size >> 24) & 255,
    );
    body.push(...data);
    if (size % 2) body.push(0);
  }
  const size = body.length;
  return Uint8Array.from([
    ...Buffer.from("RIFF", "ascii"),
    size & 255,
    (size >> 8) & 255,
    (size >> 16) & 255,
    (size >> 24) & 255,
    ...body,
  ]);
}

function vp8l(width = 32, height = 24) {
  const w = width - 1;
  const h = height - 1;
  return riff([
    {
      type: "VP8L",
      data: [
        0x2f,
        w & 255,
        ((w >> 8) & 0x3f) | ((h & 3) << 6),
        (h >> 2) & 255,
        (h >> 10) & 0x0f,
      ],
    },
  ]);
}

function validIntent() {
  return {
    publicationId: PUBLICATION,
    shopId: SHOP,
    sourceImageVersionId: SOURCE,
    variants: {
      thumb: {
        bytes: 1000,
        height: 200,
        mimeType: "image/webp",
        sha256: "a".repeat(64),
        width: 200,
      },
      card: {
        bytes: 2000,
        height: 600,
        mimeType: "image/webp",
        sha256: "b".repeat(64),
        width: 600,
      },
      detail: {
        bytes: 3000,
        height: 1200,
        mimeType: "image/webp",
        sha256: "c".repeat(64),
        width: 1200,
      },
    },
  };
}

test("TASK-009 contract accepts only three bounded, same-ratio WebP variants", () => {
  assert.deepEqual(parseStorefrontImageIntent(validIntent()), validIntent());
  for (const mutate of [
    (value) => {
      value.variants.thumb.mimeType = "image/jpeg";
    },
    (value) => {
      value.variants.detail.bytes = 900 * 1024 + 1;
    },
    (value) => {
      value.variants.card.width = 1;
    },
    (value) => {
      delete value.variants.thumb;
    },
    (value) => {
      value.sourceImageVersionId = "../private";
    },
  ]) {
    const input = structuredClone(validIntent());
    mutate(input);
    assert.equal(parseStorefrontImageIntent(input), null);
  }
  assert.deepEqual(
    parseStorefrontImageSource({
      publicationId: PUBLICATION,
      shopId: SHOP,
      sourceImageVersionId: SOURCE,
    }),
    {
      publicationId: PUBLICATION,
      shopId: SHOP,
      sourceImageVersionId: SOURCE,
    },
  );
  assert.deepEqual(
    parseStorefrontImageTarget({ imagePublicationId: IMAGE, shopId: SHOP }),
    {
      imagePublicationId: IMAGE,
      shopId: SHOP,
    },
  );
});

test("TASK-009 JSON reader enforces content type and a hard byte budget", async () => {
  const accepted = await readStorefrontImageJson(
    new Request("https://fixture.invalid", {
      body: JSON.stringify(validIntent()),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  assert.equal(accepted.shopId, SHOP);
  assert.equal(
    await readStorefrontImageJson(
      new Request("https://fixture.invalid", {
        body: "{}",
        headers: { "Content-Type": "text/plain" },
        method: "POST",
      }),
    ),
    null,
  );
  assert.equal(
    await readStorefrontImageJson(
      new Request("https://fixture.invalid", {
        body: "x".repeat(33 * 1024),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    ),
    null,
  );
});

test("TASK-009 WebP inspector rejects metadata, animation and malformed containers", () => {
  const baseline = vp8l();
  assert.deepEqual(inspectStorefrontWebp(baseline), {
    height: 24,
    ok: true,
    sha256: createHash("sha256").update(baseline).digest("hex"),
    width: 32,
  });
  for (const invalid of [
    riff([
      { type: "EXIF", data: [1, 2, 3, 4] },
      { type: "VP8L", data: [0x2f, 1, 0, 0, 0] },
    ]),
    riff([{ type: "ANIM", data: [0, 0, 0, 0, 0, 0] }]),
    riff([{ type: "JUNK", data: [1, 2] }]),
    Uint8Array.from([...baseline, 0]),
  ])
    assert.equal(inspectStorefrontWebp(invalid).ok, false);
});

test("TASK-009 browser WebP sanitizer removes ICC/EXIF/XMP and fixes RIFF length", () => {
  const withMetadata = riff([
    {
      type: "VP8X",
      data: [0x2c, 0, 0, 0, 31, 0, 0, 23, 0, 0],
    },
    { type: "ICCP", data: [1, 2, 3, 4] },
    { type: "EXIF", data: [5, 6, 7] },
    { type: "XMP ", data: [8, 9] },
    {
      type: "VP8L",
      data: [0x2f, 31, (23 & 3) << 6, 23 >> 2, 0],
    },
  ]);
  const sanitized = sanitizeStorefrontWebp(withMetadata);
  assert.ok(sanitized);
  assert.equal(Buffer.from(sanitized).includes(Buffer.from("ICCP")), false);
  assert.equal(Buffer.from(sanitized).includes(Buffer.from("EXIF")), false);
  assert.equal(Buffer.from(sanitized).includes(Buffer.from("XMP ")), false);
  assert.equal(sanitized[20], 0);
  assert.equal(inspectStorefrontWebp(sanitized).ok, true);
  assert.equal(
    sanitizeStorefrontWebp(riff([{ type: "ANIM", data: [] }])),
    null,
  );
});

test("TASK-009 verified WebP binds MIME, bytes, dimensions and SHA-256", () => {
  const bytes = vp8l(64, 48);
  const expected = {
    bytes: bytes.length,
    height: 48,
    mimeType: "image/webp",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    width: 64,
  };
  assert.equal(
    verifyStorefrontWebp({ blobMimeType: "image/webp", bytes, expected }).ok,
    true,
  );
  assert.equal(
    verifyStorefrontWebp({ blobMimeType: "image/jpeg", bytes, expected }).ok,
    false,
  );
  assert.equal(
    verifyStorefrontWebp({
      blobMimeType: "image/webp",
      bytes,
      expected: { ...expected, width: 65 },
    }).ok,
    false,
  );
  assert.equal(
    verifyStorefrontWebp({
      blobMimeType: "image/webp",
      bytes,
      expected: { ...expected, sha256: "0".repeat(64) },
    }).ok,
    false,
  );
});

test("TASK-009 control plane has no file input and uses private-source to immutable-public flow", () => {
  assert.doesNotMatch(component, /type=["']file["']/);
  for (const marker of [
    "/api/shop/storefront/images/source",
    "/api/shop/storefront/images/intent",
    "/api/shop/storefront/images/finalize",
    "/api/shop/storefront/images/rollback",
    'credentials: "omit"',
    '"x-upsert": "false"',
    'form.append("cacheControl", "31536000")',
    'mimeType: "image/webp"',
    'colorSpace: "srgb"',
  ])
    assert.match(
      component,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  assert.match(page, /StorefrontImagesControl/);
  assert.match(page, /images\.card/);
  assert.match(service, /verifyDownloadedProductImageJpeg/);
  assert.match(service, /verifyStorefrontWebp/);
  assert.match(service, /storefront_image_configure_origin_v1/);
});

test("TASK-009 SQL boundary is isolated, lease-bound, idempotent, audited and cleanup-safe", () => {
  for (const marker of [
    "storefront-product-images",
    "storefront_image_publication_variants",
    "storefront.images.manage",
    "storefront_admin_authorized_v1",
    "pg_advisory_xact_lock",
    "for update",
    "shop.storefront.image.publish.success",
    "shop.storefront.image.rollback.success",
    "cleanup_pending",
    "for update skip locked",
    "public_asset_origin",
    "auth.role() <> 'service_role'",
    "force row level security",
  ])
    assert.match(
      migration,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
    );
  assert.doesNotMatch(
    migration,
    /create policy[\s\S]{0,200}storefront-product-images/i,
  );
  assert.match(
    migration,
    /revoke all on table public\.storefront_image_publication_variants[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.storefront_image_cleanup_claim_v1[\s\S]*to service_role/,
  );
});

test("TASK-009 cleanup accepts only canonical objects on an allowlisted staging project", () => {
  const ref = "abcdefghijklmnopqrst";
  assert.deepEqual(
    validateStagingTarget({
      ALLOWED_STAGING_SUPABASE_PROJECT_REFS: ref,
      NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
      STAGING_SUPABASE_PROJECT_REF: ref,
      STOREFRONT_IMAGE_CLEANUP_ALLOW_STAGING: "yes",
    }),
    { projectRef: ref, url: `https://${ref}.supabase.co` },
  );
  for (const invalid of [
    { STOREFRONT_IMAGE_CLEANUP_ALLOW_STAGING: "no" },
    {
      ALLOWED_STAGING_SUPABASE_PROJECT_REFS: ref,
      NEXT_PUBLIC_SUPABASE_URL: "https://production.invalid",
      STAGING_SUPABASE_PROJECT_REF: ref,
      STOREFRONT_IMAGE_CLEANUP_ALLOW_STAGING: "yes",
    },
  ])
    assert.throws(() => validateStagingTarget(invalid));
  assert.equal(
    isCanonicalStorefrontImagePath(
      `shops/${SHOP}/products/20000000-0000-4000-8000-000000020090/public/${IMAGE}/thumb-${"a".repeat(16)}.webp`,
    ),
    true,
  );
  assert.equal(
    isCanonicalStorefrontImagePath(`shops/${SHOP}/../private.jpg`),
    false,
  );
  assert.match(cleanupWorkflow, /schedule:[\s\S]*cron: "21 5 \* \* \*"/);
  assert.match(cleanupWorkflow, /environment: cloudflare-staging/);
  assert.match(
    cleanupWorkflow,
    /STOREFRONT_IMAGE_CLEANUP_ALLOW_STAGING: "yes"/,
  );
});

test("TASK-009 staging migration is exact-SHA guarded and verifies the image boundary", () => {
  assert.match(
    stagingMigrationWorkflow,
    /EXPECTED_MIGRATION_VERSION: "20260802023000"/,
  );
  assert.match(
    stagingMigrationWorkflow,
    /EXPECTED_MIGRATION_NAME: storefront_v1_public_images/,
  );
  for (const marker of [
    "publicImageBucketBoundary",
    "publicImageVariantBoundary",
    "publicImageAdminFunctionsHardened",
    "publicImageServiceFunctionsConfined",
  ]) {
    assert.match(stagingMigrationWorkflow, new RegExp(marker));
  }
});
