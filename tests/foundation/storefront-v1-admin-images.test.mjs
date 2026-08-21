import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
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
  runStorefrontImageCleanup,
  validateStagingTarget,
} from "../../scripts/admin/storefront-v1-image-cleanup.mjs";
import {
  expectedMigrationsFromEnvironment,
  reconcileMigrationDelta,
} from "../../scripts/task-150-reconcile-migration-delta.mjs";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const migration = read(
  "supabase/migrations/20260802023000_storefront_v1_public_images.sql",
);
const fencingMigration = read(
  "supabase/migrations/20260811230000_storefront_v1_image_finalize_fencing.sql",
);
const cleanupLifecycleMigration = read(
  "supabase/migrations/20260811234500_storefront_v1_image_cleanup_lifecycle.sql",
);
const imageMigrations = `${migration}\n${fencingMigration}\n${cleanupLifecycleMigration}`;
const component = read("src/app/shop/storefront/StorefrontImagesControl.tsx");
const service = read("src/server/shop-admin/storefront-images/service.ts");
const routeContext = read(
  "src/server/shop-admin/storefront-images/route-context.ts",
);
const adoptRoute = read(
  "src/app/api/shop/storefront/images/adopt/route.ts",
);
const page = read("src/app/shop/storefront/page.tsx");
const cleanupWorkflow = read(
  ".github/workflows/storefront-v1-image-cleanup.yml",
);
const stagingMigrationWorkflow = read(
  ".github/workflows/storefront-v1-staging-migrations.yml",
);
const performanceFixture = read(
  "scripts/testing/storefront-v1-contract-load.sql",
);
const performanceFixtureRunner = read(
  "scripts/testing/storefront-v1-contract-load.sh",
);
const SHOP = "10000000-0000-4000-8000-000000020090";
const PUBLICATION = "50000000-0000-4000-8000-000000020090";
const SOURCE = "60000000-0000-4000-8000-000000020090";
const IMAGE = "70000000-0000-4000-8000-000000020090";

function workflowInputDefault(triggerBlock, inputName) {
  const lines = triggerBlock.split("\n");
  const inputIndex = lines.findIndex((line) => line === `      ${inputName}:`);
  assert.notEqual(inputIndex, -1, `missing workflow input ${inputName}`);
  const nextInputIndex = lines.findIndex(
    (line, index) => index > inputIndex && /^      [a-z_]+:$/.test(line),
  );
  const inputLines = lines.slice(
    inputIndex + 1,
    nextInputIndex === -1 ? undefined : nextInputIndex,
  );
  const defaultLine = inputLines.find((line) => line.startsWith("        default: "));
  assert.ok(defaultLine, `missing default for workflow input ${inputName}`);
  return defaultLine.slice("        default: ".length);
}

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
    "IMAGE_OPERATION_TIMEOUT_MS",
    "image_operation_timeout",
    "uploadOrigin",
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
  assert.match(service, /storage_origin_mismatch/);
  assert.doesNotMatch(component, /NEXT_PUBLIC_SUPABASE_URL/);
});

test("TASK-152 mobile image adoption reuses the verified server pipeline", () => {
  for (const marker of [
    "adoptStorefrontSourceImage",
    "readStorefrontSourceImage",
    "createStorefrontImageIntent",
    "finalizeStorefrontImage",
    "sharp",
    ".rotate()",
    "withoutEnlargement: true",
    "verifyStorefrontWebp",
    "upsert: false",
  ]) {
    assert.match(
      service,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
  assert.match(adoptRoute, /parseStorefrontImageSource/);
  assert.match(adoptRoute, /resolveStorefrontImageRouteContext\(request, input\.shopId\)/);
  assert.match(routeContext, /personal_shop_member/);
  assert.match(routeContext, /storefront\.images\.manage/);
  assert.doesNotMatch(adoptRoute, /service[_-]?role|SUPABASE_SERVICE_ROLE_KEY/i);
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
      imageMigrations,
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
    fencingMigration,
    /grant execute on function public\.storefront_image_cleanup_claim_v2[\s\S]*to service_role/,
  );
  assert.match(
    fencingMigration,
    /revoke all on function public\.admin_storefront_image_finalize_v1[\s\S]*from authenticated, service_role/,
  );
  assert.match(
    fencingMigration,
    /admin_storefront_image_finalize_server_v2[\s\S]*cleanup_claim_token[\s\S]*cleanup_fence_active/,
  );
  assert.match(service, /verifyStoredVariants[\s\S]*admin_storefront_image_finalize_server_v2/);
  assert.match(
    fencingMigration,
    /storefront_image_cleanup_complete_v2[\s\S]*cleanup_claim_token = p_claim_token/,
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
  assert.match(
    read("scripts/admin/storefront-v1-image-cleanup.mjs"),
    /storefront_image_cleanup_claim_v2[\s\S]*cleanup_claim_token[\s\S]*storefront_image_cleanup_complete_v2/,
  );
});

test("TASK-009 cleanup forwards the exact v2 claim token to completion", async () => {
  const variantId = "71000000-0000-4000-8000-000000020090";
  const claimToken = "72000000-0000-4000-8000-000000020090";
  const objectPath = `shops/${SHOP}/products/20000000-0000-4000-8000-000000020090/public/${IMAGE}/thumb-${"a".repeat(16)}.webp`;
  const calls = [];
  let claimed = false;
  const client = {
    rpc: async (name, args) => {
      calls.push({ args, name });
      if (name === "storefront_image_cleanup_claim_v2") {
        if (claimed) return { data: { items: [], ok: true }, error: null };
        claimed = true;
        return {
          data: {
            items: [
              {
                cleanup_claim_token: claimToken,
                id: variantId,
                object_path: objectPath,
              },
            ],
            ok: true,
          },
          error: null,
        };
      }
      return { data: { ok: true }, error: null };
    },
    storage: {
      from: () => ({ remove: async () => ({ error: null }) }),
    },
  };

  assert.deepEqual(
    await runStorefrontImageCleanup({ client, maxBatches: 2 }),
    { claimed: 1, failed: 0, removed: 1 },
  );
  assert.deepEqual(calls[1], {
    args: {
      p_claim_token: claimToken,
      p_error_code: null,
      p_removed: true,
      p_variant_id: variantId,
    },
    name: "storefront_image_cleanup_complete_v2",
  });
});

test("Storefront staging migration is exact-SHA guarded and retains the image boundary", () => {
  assert.match(
    stagingMigrationWorkflow,
    /expected_migration_version:[\s\S]*default: "20260811234500"/,
  );
  assert.match(
    stagingMigrationWorkflow,
    /EXPECTED_MIGRATION_VERSION: \$\{\{ inputs\.expected_migration_version \}\}/,
  );
  assert.match(
    stagingMigrationWorkflow,
    /expected_migration_name:[\s\S]*default: storefront_v1_image_cleanup_lifecycle/,
  );
  assert.match(
    stagingMigrationWorkflow,
    /EXPECTED_MIGRATION_NAME: \$\{\{ inputs\.expected_migration_name \}\}/,
  );
  assert.match(stagingMigrationWorkflow, /publicImagesLedgerRetained/);
  assert.match(
    stagingMigrationWorkflow,
    /ALLOW_EXPECTED_ALREADY_APPLIED: "true"/,
  );
  assert.match(stagingMigrationWorkflow, /id: migration_delta/);
  assert.match(stagingMigrationWorkflow, /expected_state == 'pending'/);
  assert.match(stagingMigrationWorkflow, /catalogVersionLedgerRetained/);
  for (const marker of [
    "publicImageBucketBoundary",
    "publicImageVariantBoundary",
    "publicImageAdminFunctionsHardened",
    "publicImageFinalizeServerBoundary",
    "publicImageServiceFunctionsConfined",
  ]) {
    assert.match(stagingMigrationWorkflow, new RegExp(marker));
  }
  assert.match(
    stagingMigrationWorkflow,
    /const requiredTrue = \[[\s\S]*"publicImageFinalizeServerBoundary"[\s\S]*\];/,
  );
  const workflowCall = stagingMigrationWorkflow.match(
    /  workflow_call:\n    inputs:\n([\s\S]*?)  workflow_dispatch:/,
  )?.[1];
  const workflowDispatch = stagingMigrationWorkflow.match(
    /  workflow_dispatch:\n    inputs:\n([\s\S]*?)\npermissions:/,
  )?.[1];
  assert.ok(workflowCall, "missing workflow_call inputs");
  assert.ok(workflowDispatch, "missing workflow_dispatch inputs");
  assert.deepEqual(
    [
      workflowInputDefault(workflowCall, "expected_predecessor_migration_version"),
      workflowInputDefault(workflowCall, "expected_predecessor_migration_name"),
      workflowInputDefault(workflowCall, "expected_predecessor_migration_file"),
    ],
    ['""', '""', '""'],
  );
  assert.deepEqual(
    [
      workflowInputDefault(workflowDispatch, "expected_predecessor_migration_version"),
      workflowInputDefault(workflowDispatch, "expected_predecessor_migration_name"),
      workflowInputDefault(workflowDispatch, "expected_predecessor_migration_file"),
    ],
    ['""', '""', '""'],
  );
});

test("Storefront migration predecessor is an atomic tuple across every caller", () => {
  const head = {
    EXPECTED_MIGRATION_VERSION: "20260811234500",
    EXPECTED_MIGRATION_NAME: "storefront_v1_image_cleanup_lifecycle",
    EXPECTED_MIGRATION_FILE:
      "20260811234500_storefront_v1_image_cleanup_lifecycle.sql",
  };
  assert.deepEqual(expectedMigrationsFromEnvironment(head), [
    {
      version: head.EXPECTED_MIGRATION_VERSION,
      name: head.EXPECTED_MIGRATION_NAME,
      fileName: head.EXPECTED_MIGRATION_FILE,
    },
  ]);
  for (const partial of [
    { EXPECTED_PREDECESSOR_MIGRATION_VERSION: "20260811230000" },
    { EXPECTED_PREDECESSOR_MIGRATION_NAME: "storefront_v1_image_finalize_fencing" },
    {
      EXPECTED_PREDECESSOR_MIGRATION_FILE:
        "20260811230000_storefront_v1_image_finalize_fencing.sql",
    },
  ]) {
    assert.throws(
      () => expectedMigrationsFromEnvironment({ ...head, ...partial }),
      /incomplete_expected_predecessor/,
    );
  }

  const workflowFiles = readdirSync(join(root, ".github/workflows"))
    .filter((fileName) => fileName.endsWith(".yml"))
    .map((fileName) => ({
      fileName,
      source: read(`.github/workflows/${fileName}`),
    }));
  const reusableCallers = workflowFiles.filter(({ source }) =>
    source.includes("uses: ./.github/workflows/storefront-v1-staging-migrations.yml"),
  );
  const twoMigrationCallers = reusableCallers.filter(({ source }) =>
    source.includes("expected_predecessor_migration_version:"),
  );
  const defaultBridgeCallers = reusableCallers.filter(
    ({ source }) => !source.includes("expected_migration_version:"),
  );
  assert.equal(reusableCallers.length, 16);
  assert.deepEqual(
    twoMigrationCallers.map(({ fileName }) => fileName).sort(),
    [
      "task-026-checkout-staging.yml",
      "task-027-customer-order-staging.yml",
    ],
  );
  for (const { source } of twoMigrationCallers) {
    for (const field of ["version", "name", "file"]) {
      assert.match(source, new RegExp(`expected_predecessor_migration_${field}:\\s+\\S+`));
    }
  }
  assert.deepEqual(
    defaultBridgeCallers.map(({ fileName }) => fileName),
    ["staging-catalog-v2-deploy.yml"],
  );
  assert.equal(
    reusableCallers.length - twoMigrationCallers.length - defaultBridgeCallers.length,
    13,
  );
});

test("cleanup lifecycle accepts complete verified or unverified tuples only", () => {
  assert.match(
    cleanupLifecycleMigration,
    /publication_status in \('pending', 'failed', 'cleanup_pending', 'removed'\)[\s\S]*verified_bytes is null[\s\S]*public_url is null[\s\S]*ready_at is null/,
  );
  assert.match(
    cleanupLifecycleMigration,
    /publication_status in \('ready', 'superseded', 'cleanup_pending', 'removed'\)[\s\S]*verified_bytes is not null[\s\S]*verified_sha256 is not null[\s\S]*verified_bytes = expected_bytes[\s\S]*public_url is not null[\s\S]*ready_at is not null/,
  );
  assert.match(
    fencingMigration,
    /bool_and\([\s\S]*verified\.bytes is not null[\s\S]*verified\.sha256 is not null[\s\S]*stored\.expected_bytes = verified\.bytes/,
  );
});

test("Storefront staging rerun accepts an applied checkpoint with only later pending migrations", () => {
  const remap = {
    localVersion: "20260727055520",
    remoteVersion: "20260727084040",
    name: "task_142_catalog_text_policy_v1",
  };
  const expected = {
    version: "20260811230000",
    name: "storefront_v1_image_finalize_fencing",
    fileName: "20260811230000_storefront_v1_image_finalize_fencing.sql",
  };
  const input = {
    local: [
      {
        version: remap.localVersion,
        name: remap.name,
        fileName: `${remap.localVersion}_${remap.name}.sql`,
      },
      expected,
    ],
    remote: [
      { version: remap.remoteVersion, name: remap.name },
      { version: expected.version, name: expected.name },
    ],
    expected: [expected],
    approvedRemoteRemaps: [remap],
  };

  assert.equal(reconcileMigrationDelta(input).status, "FAIL");
  const applied = reconcileMigrationDelta({
    ...input,
    allowExpectedAlreadyApplied: true,
  });
  assert.equal(applied.status, "PASS");
  assert.equal(applied.expectedState, "applied");
  assert.equal(applied.expectedAlreadyApplied, true);

  const future = {
    version: "20260812020000",
    name: "storefront_v1_checkout_fulfillment",
    fileName: "20260803020000_storefront_v1_checkout_fulfillment.sql",
  };
  const appliedWithFuturePending = reconcileMigrationDelta({
    ...input,
    local: [...input.local, future],
    allowExpectedAlreadyApplied: true,
  });
  assert.equal(appliedWithFuturePending.status, "PASS");
  assert.equal(appliedWithFuturePending.expectedState, "applied");
  assert.equal(appliedWithFuturePending.pendingRowsAreFuture, true);
  assert.deepEqual(appliedWithFuturePending.pending, [future]);

  const drifted = reconcileMigrationDelta({
    ...input,
    remote: [
      { version: remap.remoteVersion, name: remap.name },
      { version: expected.version, name: `${expected.name}_drift` },
    ],
    allowExpectedAlreadyApplied: true,
  });
  assert.equal(drifted.status, "FAIL");
  assert.equal(drifted.expectedState, "invalid");
});

test("TASK-019 image fixture exposes a UUID version compatible with the client contract", () => {
  assert.match(
    performanceFixture,
    /'70000000-0000-4000-8000-' \|\| pg_catalog\.lpad\(pg_catalog\.to_hex\(series\.id\), 12, '0'\)/,
  );
  assert.doesNotMatch(performanceFixture, /task019-image-/);
  assert.match(
    performanceFixtureRunner,
    /storefront_cleanup_strict >\/dev\/null[\s\S]*storefront_result=/,
  );
});

test("TASK-009 staging acceptance executes the bounded cleanup before handoff", () => {
  const workflow = read(".github/workflows/final-staging-auth-performance.yml");
  for (const expected of [
    "STAGING_SUPABASE_PROJECT_REF: ${{ vars.STAGING_SUPABASE_PROJECT_REF }}",
    'STOREFRONT_IMAGE_CLEANUP_ALLOW_STAGING: "yes"',
    "Verify bounded public image cleanup",
    "npm run storefront:images:cleanup",
  ]) {
    assert.ok(workflow.includes(expected), `missing ${expected}`);
  }
});
