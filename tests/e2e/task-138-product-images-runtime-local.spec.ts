import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

test.use({
  screenshot: "only-on-failure",
  trace: "retain-on-failure",
  video: "off",
});
test.setTimeout(120_000);

const MANIFEST_PATH = "/tmp/task138-product-images-fixture.json";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Manifest = {
  productAId: string;
  productAName: string;
  productBId: string;
  productBName: string;
  shopId: string;
  target: "local";
  users: { owner: { email: string; id: string; password: string } };
  versionId: string;
};

type PreparedVariantCapture = {
  actualSha256: string;
  bytes: number;
  declared: {
    bytes: number;
    height: number;
    mimeType: "image/jpeg";
    sha256: string;
    width: number;
  };
  height: number;
  jpegMarkersValid: boolean;
  metadataSegments: {
    exif: boolean;
    icc: boolean;
    iptc: boolean;
    xmp: boolean;
  };
  mimeType: string;
  width: number;
};

type PreparedCapture = {
  main: PreparedVariantCapture;
  thumb: PreparedVariantCapture;
  timing: {
    browserTotalMs: number;
    decodeAndValidateMs: number;
    mainEncodeMs: number;
    metadataHashMs: number;
    pipelineMs: number;
    runtime: "main-thread" | "worker";
    thumbEncodeMs: number;
  };
};

function localGuard() {
  const appUrl = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "");
  const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (
    process.env.TEST_TARGET !== "local" ||
    process.env.CONFIRM_TASK138_LOCAL_FIXTURE !== "yes" ||
    appUrl.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "::1"].includes(appUrl.hostname) ||
    supabaseUrl.port !== "54321" ||
    !["127.0.0.1", "localhost", "::1"].includes(supabaseUrl.hostname) ||
    !existsSync(MANIFEST_PATH)
  ) {
    throw new Error("BLOCKED_TASK138_EXPLICIT_LOCAL_RUNTIME_REQUIRED");
  }
}

function manifest() {
  localGuard();
  const value = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  const ids = [
    value.productAId,
    value.productBId,
    value.shopId,
    value.users.owner.id,
    value.versionId,
  ];
  if (value.target !== "local" || ids.some((id) => !UUID_PATTERN.test(id))) {
    throw new Error("BLOCKED_TASK138_RUNTIME_MANIFEST_INVALID");
  }
  return value;
}

function databaseUrl() {
  const output = execFileSync("supabase", ["status", "--output", "env"], {
    encoding: "utf8",
    env: {
      ...process.env,
      DO_NOT_TRACK: "1",
      SUPABASE_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const value = output.match(/^DB_URL="?([^"\n]+)"?$/m)?.[1];
  if (!value?.includes("127.0.0.1:54322")) {
    throw new Error("BLOCKED_TASK138_LOCAL_DATABASE_REQUIRED");
  }
  return value;
}

function executeSql(sql: string) {
  execFileSync("psql", [databaseUrl(), "-v", "ON_ERROR_STOP=1", "-c", sql], {
    env: { ...process.env, PGCONNECT_TIMEOUT: "5" },
    stdio: ["ignore", "ignore", "pipe"],
  });
}

async function signIn(page: Page, fixture: Manifest) {
  await page.goto("/auth/login?mode=admin-account&next=/shop");
  await expect(
    page.getByRole("heading", { level: 1, name: "Admin Console sign in" }),
  ).toBeVisible();
  await page.evaluate(({ email, password }) => {
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
  }, fixture.users.owner);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/shop", { timeout: 20_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

async function heapBytes(session: CDPSession) {
  const result = await session.send("Performance.getMetrics");
  const value = result.metrics.find(
    (metric) => metric.name === "JSHeapUsedSize",
  )?.value;
  if (!Number.isFinite(value)) {
    throw new Error("BLOCKED_TASK138_HEAP_METRIC_MISSING");
  }
  return value as number;
}

async function sampleHeapDuring<T>(
  session: CDPSession,
  operation: () => Promise<T>,
) {
  const samplingIntervalMs = 20;
  const samples = [Math.round(await heapBytes(session))];
  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      await new Promise((resolve) => setTimeout(resolve, samplingIntervalMs));
      if (sampling) samples.push(Math.round(await heapBytes(session)));
    }
  })();
  let failed = false;
  let operationError: unknown;
  let value!: T;
  try {
    value = await operation();
  } catch (error) {
    failed = true;
    operationError = error;
  } finally {
    sampling = false;
    await sampler;
  }
  const afterBytes = Math.round(await heapBytes(session));
  samples.push(afterBytes);
  const beforeBytes = samples[0];
  const maximumSampledBytes = Math.max(...samples);
  if (failed) throw operationError;
  return {
    memory: {
      afterBytes,
      beforeBytes,
      maximumSampledBytes,
      maximumSampledDeltaBytes: Math.max(0, maximumSampledBytes - beforeBytes),
      sampleCount: samples.length,
      samplingIntervalMs,
    },
    value,
  };
}

function cleanupRuntimeProducts(fixture: Manifest, marker: string) {
  executeSql(`
    begin;
    select set_config('request.jwt.claim.role', 'service_role', true);
    select set_config('request.jwt.claims', '{"role":"service_role"}', true);
    update public.inventory_products
    set primary_image_version_id = null, primary_image_updated_at = null
    where shop_id = '${fixture.shopId}' and product_name like '${marker}%';
    delete from public.inventory_products
    where shop_id = '${fixture.shopId}' and product_name like '${marker}%';
    commit;
  `);
}

function seedRuntimeProducts(fixture: Manifest, marker: string) {
  cleanupRuntimeProducts(fixture, marker);
  executeSql(`
    begin;
    select set_config('request.jwt.claim.role', 'service_role', true);
    select set_config('request.jwt.claims', '{"role":"service_role"}', true);
    create temp table task138_runtime_ids on commit drop as
    select g, gen_random_uuid() as product_id, gen_random_uuid() as version_id
    from generate_series(1, 200) as g;

    insert into public.inventory_products (
      id, owner_user_id, shop_id, barcode, item_number, product_name,
      purchase_price, retail_price, stock_quantity, updated_at
    )
    select product_id, '${fixture.users.owner.id}', '${fixture.shopId}',
      'T138-RUNTIME-' || product_id::text,
      'T138-' || lpad(g::text, 3, '0'),
      '${marker}' || lpad(g::text, 3, '0'),
      10, 20, 1, now()
    from task138_runtime_ids;

    insert into public.inventory_product_image_versions (
      id, shop_id, product_id, previous_version_id, status, main_path, thumb_path,
      expected_main_sha256, expected_main_bytes, expected_main_width,
      expected_main_height, expected_main_mime_type, expected_thumb_sha256,
      expected_thumb_bytes, expected_thumb_width, expected_thumb_height,
      expected_thumb_mime_type, verified_main_sha256, verified_main_bytes,
      verified_main_width, verified_main_height, verified_main_mime_type,
      verified_thumb_sha256, verified_thumb_bytes, verified_thumb_width,
      verified_thumb_height, verified_thumb_mime_type, requested_by_profile_id,
      finalized_by_profile_id, actor_kind, created_at, expires_at, finalized_at
    )
    select ids.version_id, '${fixture.shopId}', ids.product_id, null, 'ready',
      'shops/${fixture.shopId}/products/' || ids.product_id::text ||
        '/primary/' || ids.version_id::text || '/main.jpg',
      'shops/${fixture.shopId}/products/' || ids.product_id::text ||
        '/primary/' || ids.version_id::text || '/thumb.jpg',
      template.expected_main_sha256, template.expected_main_bytes,
      template.expected_main_width, template.expected_main_height,
      template.expected_main_mime_type, template.expected_thumb_sha256,
      template.expected_thumb_bytes, template.expected_thumb_width,
      template.expected_thumb_height, template.expected_thumb_mime_type,
      template.verified_main_sha256, template.verified_main_bytes,
      template.verified_main_width, template.verified_main_height,
      template.verified_main_mime_type, template.verified_thumb_sha256,
      template.verified_thumb_bytes, template.verified_thumb_width,
      template.verified_thumb_height, template.verified_thumb_mime_type,
      '${fixture.users.owner.id}', '${fixture.users.owner.id}',
      'personal_account', now(), now() + interval '2 hours', now()
    from task138_runtime_ids ids
    cross join public.inventory_product_image_versions template
    where template.id = '${fixture.versionId}';

    update public.inventory_products product
    set primary_image_version_id = ids.version_id,
        primary_image_updated_at = now()
    from task138_runtime_ids ids
    where product.id = ids.product_id;
    commit;
  `);
}

test("TASK-138 shared Product A/B runtime has zero no-image I/O, thumb/main and offline cache", async ({
  page,
}, testInfo) => {
  const fixture = manifest();
  await signIn(page, fixture);
  await page.evaluate(async () => caches.delete("task137-product-images-v1"));

  const referencedProducts = new Set<string>();
  const listVariants = new Set<string>();
  let mainDownloadMode: "delay" | "error" = "delay";
  let storageRequests = 0;
  await page.route(
    (url) =>
      url.pathname.includes("/storage/v1/object/sign/product-images/") &&
      url.pathname.endsWith("/main.jpg"),
    async (route) => {
      if (mainDownloadMode === "error") {
        await route.fulfill({ body: "", status: 503 });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      await route.continue();
    },
  );
  page.on("request", (request) => {
    if (request.url().includes("/api/shop/product-images/read-urls")) {
      const body = request.postDataJSON() as {
        refs?: Array<{ productId?: string; variant?: string }>;
      };
      for (const ref of body.refs ?? []) {
        if (ref.productId) referencedProducts.add(ref.productId);
        if (ref.variant) listVariants.add(ref.variant);
      }
    }
    if (
      request.url().includes("/storage/v1/object/") &&
      request.url().includes("product-images")
    ) {
      storageRequests += 1;
    }
  });

  await page.goto(`/shop/products?shop_id=${fixture.shopId}`);
  const rowA = page
    .locator("[data-product-catalog-row]")
    .filter({ hasText: fixture.productAName });
  const rowB = page
    .locator("[data-product-catalog-row]")
    .filter({ hasText: fixture.productBName });
  await expect(rowA).toBeVisible();
  await expect(rowA.locator("img")).toHaveCount(0);
  await expect(
    rowA.getByRole("img", {
      name: `No product image: ${fixture.productAName}`,
    }),
  ).toBeVisible();
  await rowA.screenshot({
    path: `docs/TASKS/EVIDENCE/TASK-138/admin-product-list-no-image-${testInfo.project.name}.png`,
  });
  await rowB.scrollIntoViewIfNeeded();
  await expect
    .poll(
      async () => ({
        error: await rowB
          .locator("[data-product-image-thumbnail]")
          .getAttribute("data-product-image-error"),
        images: await rowB.locator("img").count(),
      }),
      { timeout: 20_000 },
    )
    .toEqual({ error: null, images: 1 });
  const [placeholderBox, listThumbBox] = await Promise.all([
    rowA.locator("[data-product-image-thumbnail]").boundingBox(),
    rowB.locator("[data-product-image-thumbnail] img").boundingBox(),
  ]);
  expect(placeholderBox?.width).toBe(56);
  expect(placeholderBox?.height).toBe(56);
  expect(listThumbBox?.width).toBe(56);
  expect(listThumbBox?.height).toBe(56);
  expect([...listVariants]).not.toContain("main");
  await rowB.screenshot({
    path: `docs/TASKS/EVIDENCE/TASK-138/admin-product-list-thumb-${testInfo.project.name}.png`,
  });
  await page.screenshot({
    fullPage: false,
    path: `docs/TASKS/EVIDENCE/TASK-138/admin-product-list-${testInfo.project.name}.png`,
  });
  const thumbCachedBeforeDetail = await page.evaluate(async (versionId) => {
    const cache = await caches.open("task137-product-images-v1");
    return (await cache.keys()).some((request) =>
      new URL(request.url).pathname.endsWith(`/${versionId}/thumb.jpg`),
    );
  }, fixture.versionId);
  expect(thumbCachedBeforeDetail).toBe(true);
  await rowB.getByRole("link", { name: /Detail:/ }).click();
  const editor = page
    .getByRole("dialog")
    .locator("[data-product-image-editor]");
  const progressive = editor.locator("[data-product-image-progressive-stage]");
  await expect(progressive).toHaveAttribute(
    "data-product-image-progressive-stage",
    "thumb",
    { timeout: 20_000 },
  );
  const previewBox = await progressive.boundingBox();
  expect(previewBox).not.toBeNull();
  expect(
    Math.abs((previewBox?.width ?? 0) - (previewBox?.height ?? 0)),
  ).toBeLessThan(1);
  await page.screenshot({
    fullPage: false,
    path: `docs/TASKS/EVIDENCE/TASK-138/admin-detail-thumb-preview-${testInfo.project.name}.png`,
  });
  await expect(progressive).toHaveAttribute(
    "data-product-image-progressive-stage",
    "main",
    { timeout: 20_000 },
  );
  await expect(
    progressive.getByRole("img", { name: fixture.productBName }),
  ).toBeVisible();
  const mainBox = await progressive.boundingBox();
  expect(
    Math.abs((previewBox?.width ?? 0) - (mainBox?.width ?? 0)),
  ).toBeLessThan(1);
  expect(
    Math.abs((previewBox?.height ?? 0) - (mainBox?.height ?? 0)),
  ).toBeLessThan(1);
  await page.screenshot({
    fullPage: false,
    path: `docs/TASKS/EVIDENCE/TASK-138/admin-detail-main-${testInfo.project.name}.png`,
  });

  if (testInfo.project.name === "chromium-desktop") {
    await page.setViewportSize({ height: 844, width: 390 });
    await expect(editor).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      fullPage: false,
      path: `docs/TASKS/EVIDENCE/TASK-138/admin-detail-mobile-390-${testInfo.project.name}.png`,
    });
    await page.setViewportSize({ height: 900, width: 1440 });
  }

  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(async (versionId) => {
    const cache = await caches.open("task137-product-images-v1");
    for (const request of await cache.keys()) {
      if (new URL(request.url).pathname.endsWith(`/${versionId}/main.jpg`)) {
        await cache.delete(request);
      }
    }
  }, fixture.versionId);
  mainDownloadMode = "error";
  await rowB.getByRole("link", { name: /Detail:/ }).click();
  await expect(progressive).toHaveAttribute(
    "data-product-image-progressive-stage",
    "error",
    { timeout: 20_000 },
  );
  await expect(progressive.locator("img")).toBeVisible();
  await expect(
    editor.getByRole("button", { name: "Retry image" }),
  ).toBeVisible();
  await page.screenshot({
    fullPage: false,
    path: `docs/TASKS/EVIDENCE/TASK-138/admin-detail-error-${testInfo.project.name}.png`,
  });
  mainDownloadMode = "delay";
  await editor.getByRole("button", { name: "Retry image" }).click();
  await expect(progressive).toHaveAttribute(
    "data-product-image-progressive-stage",
    "main",
    { timeout: 20_000 },
  );
  const beforeOfflineRequests = storageRequests;
  await page.getByRole("button", { name: "Prices" }).click();
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.getByRole("button", { name: "Overview" }).click();
  await expect(
    editor.getByText(/Offline: cached images remain visible/),
  ).toBeVisible();
  await expect(progressive).toHaveAttribute(
    "data-product-image-progressive-stage",
    "main",
  );
  await expect(
    progressive.getByRole("img", { name: fixture.productBName }),
  ).toBeVisible();
  expect(storageRequests).toBe(beforeOfflineRequests);
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  const cacheKeys = await page.evaluate(async () => {
    const cache = await caches.open("task137-product-images-v1");
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(
    cacheKeys.some((key) => key.endsWith(`/${fixture.versionId}/main.jpg`)),
  ).toBe(true);
  expect(
    cacheKeys.some((key) => key.endsWith(`/${fixture.versionId}/thumb.jpg`)),
  ).toBe(true);
  expect(referencedProducts.has(fixture.productAId)).toBe(false);
  expect(await page.content()).not.toContain(
    "/storage/v1/object/sign/product-images/",
  );
  await page.screenshot({
    fullPage: false,
    path: `docs/TASKS/EVIDENCE/TASK-138/admin-product-ab-${testInfo.project.name}.png`,
  });
  const productReport = {
    cacheEntries: cacheKeys.length,
    offlineAdditionalStorageRequests: storageRequests - beforeOfflineRequests,
    productAImageReferences: referencedProducts.has(fixture.productAId) ? 1 : 0,
    result: "PASS",
    storageRequests,
  };
  writeFileSync(
    `docs/TASKS/EVIDENCE/TASK-138/admin-product-ab-${testInfo.project.name}.json`,
    `${JSON.stringify(productReport, null, 2)}\n`,
    { encoding: "utf8", mode: 0o644 },
  );
  await testInfo.attach("task138-product-ab-redacted", {
    body: Buffer.from(JSON.stringify(productReport)),
    contentType: "application/json",
  });
});

test("TASK-138 200-product viewport starts only visible work and remains bounded", async ({
  page,
}, testInfo) => {
  const fixture = manifest();
  const marker = `TASK138 Runtime 200 ${testInfo.project.name} `;
  seedRuntimeProducts(fixture, marker);
  const readBatchSizes: number[] = [];
  const referencedProducts = new Set<string>();
  let activeStorage = 0;
  let peakStorage = 0;
  const finishStorage = (request: { url: () => string }) => {
    if (
      request.url().includes("/storage/v1/object/") &&
      request.url().includes("product-images")
    ) {
      activeStorage = Math.max(0, activeStorage - 1);
    }
  };

  try {
    await signIn(page, fixture);
    await page.evaluate(async () => caches.delete("task137-product-images-v1"));
    const session = await page.context().newCDPSession(page);
    await session.send("Performance.enable");
    const heapBefore = await heapBytes(session);
    page.on("request", (request) => {
      if (request.url().includes("/api/shop/product-images/read-urls")) {
        const body = request.postDataJSON() as {
          refs?: Array<{ productId?: string }>;
        };
        readBatchSizes.push(body.refs?.length ?? 0);
        for (const ref of body.refs ?? []) {
          if (ref.productId) referencedProducts.add(ref.productId);
        }
      }
      if (
        request.url().includes("/storage/v1/object/") &&
        request.url().includes("product-images")
      ) {
        activeStorage += 1;
        peakStorage = Math.max(peakStorage, activeStorage);
      }
    });
    page.on("requestfinished", finishStorage);
    page.on("requestfailed", finishStorage);

    await page.goto(`/shop/products?shop_id=${fixture.shopId}&pageSize=200`);
    await expect(page.locator("[data-product-catalog-row]")).toHaveCount(200, {
      timeout: 30_000,
    });
    await expect
      .poll(() => referencedProducts.size, { timeout: 20_000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(1_000);
    const heapAfter = await heapBytes(session);
    const heapDelta = Math.max(0, heapAfter - heapBefore);

    expect(referencedProducts.size).toBeLessThan(200);
    expect(readBatchSizes.every((size) => size > 0 && size <= 100)).toBe(true);
    expect(peakStorage).toBeLessThanOrEqual(4);
    expect(heapDelta).toBeLessThan(96 * 1024 * 1024);
    const cacheEntries = await page.evaluate(async () => {
      const cache = await caches.open("task137-product-images-v1");
      return (await cache.keys()).length;
    });
    expect(cacheEntries).toBe(0);

    await page.screenshot({
      fullPage: false,
      path: `docs/TASKS/EVIDENCE/TASK-138/admin-200-visible-${testInfo.project.name}.png`,
    });
    const report = {
      cacheEntries,
      heapDeltaBytesSample: heapDelta,
      peakConcurrentStorageRequests: peakStorage,
      readBatchSizes,
      referencedProducts: referencedProducts.size,
      renderedProducts: 200,
      result: "PASS",
    };
    writeFileSync(
      `docs/TASKS/EVIDENCE/TASK-138/admin-200-visible-${testInfo.project.name}.json`,
      `${JSON.stringify(report, null, 2)}\n`,
      { encoding: "utf8", mode: 0o644 },
    );
    await testInfo.attach("task138-200-visible-redacted", {
      body: Buffer.from(JSON.stringify(report)),
      contentType: "application/json",
    });
  } finally {
    await page.context().setOffline(false);
    cleanupRuntimeProducts(fixture, marker);
  }
});

test("TASK-138 preprocessing baseline edge cases stay off-main and cancellable", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-desktop",
    "The expensive 48 MP preprocessing sample runs once on desktop Chromium.",
  );
  const fixture = manifest();
  const makeImage = (width: number, height: number, format: "jpeg" | "png") => {
    const image = sharp({
      create: {
        background:
          format === "png" ? { alpha: 0.45, b: 210, g: 120, r: 20 } : "#147d64",
        channels: format === "png" ? 4 : 3,
        height,
        width,
      },
    });
    return format === "png"
      ? image.png({ compressionLevel: 6 }).toBuffer()
      : image.jpeg({ quality: 88 }).toBuffer();
  };
  const landscape = await makeImage(2400, 1600, "jpeg");
  const highResolution = await makeImage(8000, 6000, "jpeg");
  const progressive = await sharp({
    create: {
      background: "#6d28d9",
      channels: 3,
      height: 1400,
      width: 2100,
    },
  })
    .jpeg({ progressive: true, quality: 86 })
    .toBuffer();
  const oriented = await sharp({
    create: {
      background: "#c2410c",
      channels: 3,
      height: 1200,
      width: 1800,
    },
  })
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 86 })
    .toBuffer();
  const multiFrameGif = Buffer.from(
    "R0lGODlhAgACAIAAAExpcf///yH/C05FVFNDQVBFMi4wAwEAAAAh+QQJCgAAACwAAAAAAgACAAACAoxTACH5BAUKAAAALAAAAAACAAIAAAIChFEAOw==",
    "base64",
  );
  expect(
    (await sharp(multiFrameGif, { animated: true }).metadata()).pages,
  ).toBe(2);
  const accepted = [
    {
      bytes: landscape,
      input: [2400, 1600],
      mimeType: "image/jpeg",
      name: "landscape.jpg",
    },
    {
      bytes: await makeImage(1600, 2400, "jpeg"),
      input: [1600, 2400],
      mimeType: "image/jpeg",
      name: "portrait.jpg",
    },
    {
      bytes: await makeImage(2000, 2000, "jpeg"),
      input: [2000, 2000],
      mimeType: "image/jpeg",
      name: "square.jpg",
    },
    {
      bytes: await makeImage(1200, 900, "png"),
      input: [1200, 900],
      mimeType: "image/png",
      name: "alpha.png",
    },
    {
      bytes: oriented,
      input: [1800, 1200],
      mimeType: "image/jpeg",
      name: "orientation-6.jpg",
    },
    {
      bytes: await makeImage(120, 80, "jpeg"),
      input: [120, 80],
      mimeType: "image/jpeg",
      name: "small.jpg",
    },
    {
      bytes: highResolution,
      input: [8000, 6000],
      mimeType: "image/jpeg",
      name: "48mp.jpg",
    },
    {
      bytes: progressive,
      input: [2100, 1400],
      mimeType: "image/jpeg",
      name: "progressive.jpg",
    },
  ];

  await signIn(page, fixture);
  await page.goto(
    `/shop/products?shop_id=${fixture.shopId}&product_action=detail&product_id=${fixture.productBId}`,
  );
  const editor = page
    .getByRole("dialog")
    .locator("[data-product-image-editor]");
  const input = editor.locator('input[type="file"]');
  const measurements: Array<Record<string, unknown>> = [];
  let maximumTimerGapMs = 0;

  for (const sample of accepted) {
    await page.evaluate(() => {
      const state = { active: true, last: performance.now(), maximum: 0 };
      (window as typeof window & { task138Timer?: typeof state }).task138Timer =
        state;
      const tick = () => {
        const now = performance.now();
        state.maximum = Math.max(state.maximum, now - state.last);
        state.last = now;
        if (state.active) setTimeout(tick, 16);
      };
      setTimeout(tick, 16);
    });
    await input.setInputFiles({
      buffer: sample.bytes,
      mimeType: sample.mimeType,
      name: sample.name,
    });
    await expect(editor.getByText("Image ready to upload.")).toBeVisible({
      timeout: 60_000,
    });
    const output = await editor
      .getByRole("img", { name: "Selected product image preview" })
      .evaluate(async (image: HTMLImageElement) => {
        const blob = await fetch(image.src).then((response) => response.blob());
        const duration = performance
          .getEntriesByName("task137-product-image-preprocess")
          .at(-1)?.duration;
        const timer = (
          window as typeof window & {
            task138Timer?: { active: boolean; maximum: number };
          }
        ).task138Timer;
        if (timer) timer.active = false;
        return {
          bytes: blob.size,
          durationMs: duration ?? null,
          height: image.naturalHeight,
          maximumTimerGapMs: timer?.maximum ?? null,
          type: blob.type,
          width: image.naturalWidth,
        };
      });
    if (sample.name === "small.jpg") {
      expect([output.width, output.height]).toEqual(sample.input);
    }
    expect(output.type).toBe("image/jpeg");
    expect(output.bytes).toBeLessThanOrEqual(1024 * 1024);
    expect(Math.max(output.width, output.height)).toBeLessThanOrEqual(1600);
    if (typeof output.maximumTimerGapMs === "number") {
      maximumTimerGapMs = Math.max(maximumTimerGapMs, output.maximumTimerGapMs);
    }
    measurements.push({
      inputBytes: sample.bytes.length,
      inputHeight: sample.input[1],
      inputWidth: sample.input[0],
      name: sample.name,
      output,
      result: "PASS",
    });
    await editor.getByRole("button", { name: "Discard selection" }).click();
  }

  const rejected = [
    {
      bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      expected: /could not be decoded safely/,
      mimeType: "image/jpeg",
      name: "corrupt.jpg",
    },
    {
      bytes: landscape,
      expected: /Choose a JPEG or PNG image/,
      mimeType: "application/octet-stream",
      name: "wrong-mime.jpg",
    },
    {
      bytes: multiFrameGif,
      expected: /Choose a JPEG or PNG image/,
      mimeType: "image/gif",
      name: "animated-multiframe.gif",
    },
  ];
  for (const sample of rejected) {
    await input.setInputFiles({
      buffer: sample.bytes,
      mimeType: sample.mimeType,
      name: sample.name,
    });
    await expect(editor.getByText(sample.expected)).toBeVisible({
      timeout: 20_000,
    });
    measurements.push({
      inputBytes: sample.bytes.length,
      name: sample.name,
      result: "REJECTED_AS_EXPECTED",
    });
  }

  await input.setInputFiles({
    buffer: highResolution,
    mimeType: "image/jpeg",
    name: "48mp-cancel.jpg",
  });
  await editor.getByRole("button", { name: "Cancel operation" }).click();
  await expect(editor.getByText(/Image operation cancelled/)).toBeVisible({
    timeout: 20_000,
  });
  expect(maximumTimerGapMs).toBeLessThan(750);

  const report = {
    accepted: accepted.length,
    cancelled48MP: "PASS",
    maximumTimerGapMsSample: maximumTimerGapMs,
    measurements,
    rejected: rejected.length,
    result: "PASS",
    sampleCount: accepted.length + rejected.length,
  };
  writeFileSync(
    `docs/TASKS/EVIDENCE/TASK-138/admin-preprocessing-baseline-${testInfo.project.name}.json`,
    `${JSON.stringify(report, null, 2)}\n`,
    { encoding: "utf8", mode: 0o644 },
  );
  await testInfo.attach("task138-preprocessing-redacted", {
    body: Buffer.from(JSON.stringify(report)),
    contentType: "application/json",
  });
});

test("TASK-138 representative preprocessing distribution measures main and thumb", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-desktop",
    "The representative preprocessing distribution runs once on desktop Chromium.",
  );
  testInfo.setTimeout(300_000);
  const fixture = manifest();

  const round = (value: number, digits = 3) => Number(value.toFixed(digits));
  const nearestRank = (values: number[], percentile: number) => {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.max(0, Math.ceil(sorted.length * percentile) - 1)];
  };
  const distribution = (values: number[], digits = 3) => ({
    count: values.length,
    maximum: round(Math.max(...values), digits),
    mean: round(
      values.reduce((sum, value) => sum + value, 0) / values.length,
      digits,
    ),
    minimum: round(Math.min(...values), digits),
    p50: round(nearestRank(values, 0.5), digits),
    p90: round(nearestRank(values, 0.9), digits),
    p95: round(nearestRank(values, 0.95), digits),
  });
  const makeImage = (width: number, height: number, format: "jpeg" | "png") => {
    const image = sharp({
      create: {
        background:
          format === "png" ? { alpha: 0.45, b: 210, g: 120, r: 20 } : "#147d64",
        channels: format === "png" ? 4 : 3,
        height,
        width,
      },
    });
    return format === "png"
      ? image.png({ compressionLevel: 6 }).toBuffer()
      : image.jpeg({ quality: 88 }).toBuffer();
  };
  const makeSvgJpeg = (
    width: number,
    height: number,
    body: string,
    quality = 90,
  ) =>
    sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
      ),
    )
      .jpeg({ quality })
      .toBuffer();

  const landscape = await makeImage(2400, 1600, "jpeg");
  const highResolution = await makeImage(8000, 6000, "jpeg");
  const progressive = await sharp({
    create: {
      background: "#6d28d9",
      channels: 3,
      height: 1400,
      width: 2100,
    },
  })
    .jpeg({ progressive: true, quality: 86 })
    .toBuffer();
  const oriented = await sharp({
    create: {
      background: "#c2410c",
      channels: 3,
      height: 1200,
      width: 1800,
    },
  })
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 86 })
    .toBuffer();
  const packagingText = await makeSvgJpeg(
    2400,
    1600,
    `<defs><linearGradient id="bg" x1="0" x2="1"><stop stop-color="#f7f0df"/><stop offset="1" stop-color="#d6e5f4"/></linearGradient></defs>
     <rect width="2400" height="1600" fill="url(#bg)"/>
     <rect x="520" y="180" width="1360" height="1240" rx="72" fill="#fefefe" stroke="#172554" stroke-width="20"/>
     <circle cx="1200" cy="680" r="310" fill="#f97316"/>
     <path d="M930 680h540M1200 410v540" stroke="#fff" stroke-width="42"/>
     <text x="1200" y="1130" text-anchor="middle" font-family="sans-serif" font-size="150" font-weight="700" fill="#172554">MERCH 138</text>
     <text x="1200" y="1280" text-anchor="middle" font-family="sans-serif" font-size="68" fill="#475569">PACKAGING SAMPLE</text>`,
  );
  const noiseWidth = 1920;
  const noiseHeight = 1280;
  const noisePixels = Buffer.allocUnsafe(noiseWidth * noiseHeight * 3);
  let randomState = 0x1382026;
  for (let offset = 0; offset < noisePixels.length; offset += 1) {
    randomState = (Math.imul(1_664_525, randomState) + 1_013_904_223) >>> 0;
    noisePixels[offset] = randomState >>> 24;
  }
  const deterministicNoise = await sharp(noisePixels, {
    raw: { channels: 3, height: noiseHeight, width: noiseWidth },
  })
    .jpeg({ quality: 92 })
    .toBuffer();
  const darkLowContrast = await makeSvgJpeg(
    2400,
    1600,
    `<defs><radialGradient id="dark"><stop stop-color="#273044"/><stop offset="1" stop-color="#05070d"/></radialGradient></defs>
     <rect width="2400" height="1600" fill="url(#dark)"/>
     <path d="M0 1300L520 900l420 210 430-510 1030 700v300H0z" fill="#111827"/>
     <circle cx="1760" cy="420" r="190" fill="#374151" opacity="0.7"/>`,
    92,
  );
  const panorama = await makeSvgJpeg(
    5000,
    1200,
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#38bdf8"/><stop offset="1" stop-color="#fef3c7"/></linearGradient></defs>
     <rect width="5000" height="1200" fill="url(#sky)"/>
     <path d="M0 930L650 420l560 390 720-610 650 600 780-520 740 590 900-390v720H0z" fill="#166534"/>
     <path d="M0 1010Q900 830 1750 1010T3500 990T5000 970v230H0z" fill="#0f766e"/>`,
    90,
  );

  const accepted = [
    {
      bytes: landscape,
      decoded: [2400, 1600],
      mimeType: "image/jpeg",
      name: "landscape.jpg",
    },
    {
      bytes: await makeImage(1600, 2400, "jpeg"),
      decoded: [1600, 2400],
      mimeType: "image/jpeg",
      name: "portrait.jpg",
    },
    {
      bytes: await makeImage(2000, 2000, "jpeg"),
      decoded: [2000, 2000],
      mimeType: "image/jpeg",
      name: "square.jpg",
    },
    {
      bytes: await makeImage(1200, 900, "png"),
      decoded: [1200, 900],
      mimeType: "image/png",
      name: "alpha.png",
    },
    {
      bytes: oriented,
      decoded: [1200, 1800],
      mimeType: "image/jpeg",
      name: "orientation-6.jpg",
    },
    {
      bytes: await makeImage(120, 80, "jpeg"),
      decoded: [120, 80],
      mimeType: "image/jpeg",
      name: "small-no-upscale.jpg",
    },
    {
      bytes: highResolution,
      decoded: [8000, 6000],
      mimeType: "image/jpeg",
      name: "48mp.jpg",
    },
    {
      bytes: progressive,
      decoded: [2100, 1400],
      mimeType: "image/jpeg",
      name: "progressive.jpg",
    },
    {
      bytes: packagingText,
      decoded: [2400, 1600],
      mimeType: "image/jpeg",
      name: "packaging-text.jpg",
    },
    {
      bytes: deterministicNoise,
      decoded: [noiseWidth, noiseHeight],
      mimeType: "image/jpeg",
      name: "deterministic-noise.jpg",
    },
    {
      bytes: darkLowContrast,
      decoded: [2400, 1600],
      mimeType: "image/jpeg",
      name: "dark-low-contrast.jpg",
    },
    {
      bytes: panorama,
      decoded: [5000, 1200],
      mimeType: "image/jpeg",
      name: "panorama.jpg",
    },
  ];
  expect(accepted).toHaveLength(12);

  await signIn(page, fixture);
  await page.goto(
    `/shop/products?shop_id=${fixture.shopId}&product_action=detail&product_id=${fixture.productBId}`,
  );
  const editor = page
    .getByRole("dialog")
    .locator("[data-product-image-editor]");
  const input = editor.locator('input[type="file"]');
  await page.evaluate(() => {
    document.documentElement.dataset.productImageMetrics = "enabled";
    const target = window as typeof window & {
      task138PreparedReports?: Array<Promise<PreparedCapture>>;
    };
    target.task138PreparedReports = [];

    const inspectVariant = async (variant: {
      blob: Blob;
      metadata: PreparedVariantCapture["declared"];
    }): Promise<PreparedVariantCapture> => {
      const bytes = new Uint8Array(await variant.blob.arrayBuffer());
      const metadataSegments = {
        exif: false,
        icc: false,
        iptc: false,
        xmp: false,
      };
      let offset = 2;
      while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
        const marker = bytes[offset + 1];
        if (marker === 0xd9 || marker === 0xda) break;
        if (marker >= 0xd0 && marker <= 0xd7) {
          offset += 2;
          continue;
        }
        const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
        if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length)
          break;
        const payload = bytes.subarray(
          offset + 4,
          Math.min(bytes.length, offset + 2 + segmentLength),
        );
        const prefix = String.fromCharCode(...payload.subarray(0, 80));
        if (marker === 0xe1) {
          metadataSegments.exif ||= prefix.startsWith("Exif\u0000\u0000");
          metadataSegments.xmp ||= prefix.includes("ns.adobe.com/xap/1.0");
        }
        if (marker === 0xe2) {
          metadataSegments.icc ||= prefix.startsWith("ICC_PROFILE\u0000");
        }
        if (marker === 0xed) {
          metadataSegments.iptc ||= prefix.includes("Photoshop 3.0");
        }
        offset += 2 + segmentLength;
      }
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const actualSha256 = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const bitmap = await createImageBitmap(variant.blob);
      const dimensions = { height: bitmap.height, width: bitmap.width };
      bitmap.close();
      return {
        actualSha256,
        bytes: variant.blob.size,
        declared: variant.metadata,
        ...dimensions,
        jpegMarkersValid:
          bytes[0] === 0xff &&
          bytes[1] === 0xd8 &&
          bytes.at(-2) === 0xff &&
          bytes.at(-1) === 0xd9,
        metadataSegments,
        mimeType: variant.blob.type,
      };
    };

    window.addEventListener(
      "merchandise-control:product-image-prepared",
      (event) => {
        const detail = (
          event as CustomEvent<{
            main: {
              blob: Blob;
              metadata: PreparedVariantCapture["declared"];
            };
            thumb: {
              blob: Blob;
              metadata: PreparedVariantCapture["declared"];
            };
            timing: PreparedCapture["timing"];
          }>
        ).detail;
        target.task138PreparedReports?.push(
          Promise.all([
            inspectVariant(detail.main),
            inspectVariant(detail.thumb),
          ]).then(([main, thumb]) => ({ main, thumb, timing: detail.timing })),
        );
      },
    );
  });
  const session = await page.context().newCDPSession(page);
  await session.send("Performance.enable");
  const measurements: Array<Record<string, unknown>> = [];
  let maximumTimerGapMs = 0;

  for (const [index, sample] of accepted.entries()) {
    const inputMetadata = await sharp(sample.bytes, {
      animated: true,
    }).metadata();
    await page.evaluate(() => {
      const state = { active: true, last: performance.now(), maximum: 0 };
      (window as typeof window & { task138Timer?: typeof state }).task138Timer =
        state;
      const tick = () => {
        const now = performance.now();
        state.maximum = Math.max(state.maximum, now - state.last);
        state.last = now;
        if (state.active) setTimeout(tick, 16);
      };
      setTimeout(tick, 16);
    });
    const { memory } = await sampleHeapDuring(session, async () => {
      await input.setInputFiles({
        buffer: sample.bytes,
        mimeType: sample.mimeType,
        name: sample.name,
      });
      await expect(editor.getByText("Image ready to upload.")).toBeVisible({
        timeout: 60_000,
      });
      await page.waitForFunction((expected) => {
        const reports = (
          window as typeof window & {
            task138PreparedReports?: Array<Promise<PreparedCapture>>;
          }
        ).task138PreparedReports;
        return (reports?.length ?? 0) > expected;
      }, index);
    });
    const output = await page.evaluate(async (outputIndex) => {
      const reports = (
        window as typeof window & {
          task138PreparedReports?: Array<Promise<PreparedCapture>>;
        }
      ).task138PreparedReports;
      if (!reports?.[outputIndex]) throw new Error("prepared capture missing");
      return reports[outputIndex];
    }, index);
    const rendered = await editor.evaluate(async (element) => {
      const image = element.querySelector<HTMLImageElement>(
        'img[alt="Selected product image preview"]',
      );
      const summary = element.querySelector<HTMLElement>(
        "[data-product-image-prepared-summary]",
      );
      const timer = (
        window as typeof window & {
          task138Timer?: { active: boolean; maximum: number };
        }
      ).task138Timer;
      if (!image || !summary) throw new Error("prepared preview unavailable");
      if (timer) timer.active = false;
      return {
        durationMeasureMs:
          performance
            .getEntriesByName("task137-product-image-preprocess")
            .at(-1)?.duration ?? null,
        mainBytes: Number(summary.dataset.productImageMainBytes),
        mainHeight: Number(summary.dataset.productImageMainHeight),
        mainWidth: Number(summary.dataset.productImageMainWidth),
        maximumTimerGapMs: timer?.maximum ?? null,
        previewHeight: image.naturalHeight,
        previewWidth: image.naturalWidth,
        summaryText: summary.textContent,
        thumbBytes: Number(summary.dataset.productImageThumbBytes),
        thumbHeight: Number(summary.dataset.productImageThumbHeight),
        thumbWidth: Number(summary.dataset.productImageThumbWidth),
      };
    });

    for (const [variantName, variant, maxBytes, maxSide] of [
      ["main", output.main, 1024 * 1024, 1600],
      ["thumb", output.thumb, 90 * 1024, 384],
    ] as const) {
      expect(variant.mimeType, variantName).toBe("image/jpeg");
      expect(variant.jpegMarkersValid, variantName).toBe(true);
      expect(variant.bytes, variantName).toBe(variant.declared.bytes);
      expect(variant.width, variantName).toBe(variant.declared.width);
      expect(variant.height, variantName).toBe(variant.declared.height);
      expect(variant.actualSha256, variantName).toBe(variant.declared.sha256);
      expect(variant.bytes, variantName).toBeLessThanOrEqual(maxBytes);
      expect(
        Math.max(variant.width, variant.height),
        variantName,
      ).toBeLessThanOrEqual(maxSide);
      expect(variant.width, `${variantName} no upscale`).toBeLessThanOrEqual(
        sample.decoded[0],
      );
      expect(variant.height, `${variantName} no upscale`).toBeLessThanOrEqual(
        sample.decoded[1],
      );
      expect(variant.metadataSegments.exif, variantName).toBe(false);
      expect(variant.metadataSegments.xmp, variantName).toBe(false);
      expect(variant.metadataSegments.iptc, variantName).toBe(false);
    }
    expect(output.timing.runtime).toBe("worker");
    for (const value of [
      output.timing.browserTotalMs,
      output.timing.decodeAndValidateMs,
      output.timing.mainEncodeMs,
      output.timing.thumbEncodeMs,
      output.timing.metadataHashMs,
      output.timing.pipelineMs,
    ]) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(rendered.mainBytes).toBe(output.main.bytes);
    expect(rendered.mainWidth).toBe(output.main.width);
    expect(rendered.mainHeight).toBe(output.main.height);
    expect(rendered.thumbBytes).toBe(output.thumb.bytes);
    expect(rendered.thumbWidth).toBe(output.thumb.width);
    expect(rendered.thumbHeight).toBe(output.thumb.height);
    expect(rendered.previewWidth).toBe(output.main.width);
    expect(rendered.previewHeight).toBe(output.main.height);
    if (sample.name === "small-no-upscale.jpg") {
      expect([output.main.width, output.main.height]).toEqual(sample.decoded);
      expect([output.thumb.width, output.thumb.height]).toEqual(sample.decoded);
    }
    if (typeof rendered.maximumTimerGapMs === "number") {
      maximumTimerGapMs = Math.max(
        maximumTimerGapMs,
        rendered.maximumTimerGapMs,
      );
    }
    measurements.push({
      input: {
        bytes: sample.bytes.length,
        channels: inputMetadata.channels ?? null,
        decodedHeight: sample.decoded[1],
        decodedWidth: sample.decoded[0],
        encodedHeight: inputMetadata.height ?? null,
        encodedWidth: inputMetadata.width ?? null,
        format: inputMetadata.format ?? null,
        hasAlpha: inputMetadata.hasAlpha ?? false,
        hasProfile: inputMetadata.hasProfile ?? false,
        isProgressive: inputMetadata.isProgressive ?? false,
        mimeType: sample.mimeType,
        orientation: inputMetadata.orientation ?? null,
        pages: inputMetadata.pages ?? 1,
      },
      memory,
      metadataRemoval: {
        main: output.main.metadataSegments,
        result: "PASS_NO_EXIF_XMP_IPTC",
        thumb: output.thumb.metadataSegments,
      },
      name: sample.name,
      noUpscale: {
        main:
          output.main.width <= sample.decoded[0] &&
          output.main.height <= sample.decoded[1],
        thumb:
          output.thumb.width <= sample.decoded[0] &&
          output.thumb.height <= sample.decoded[1],
      },
      output: {
        main: output.main,
        thumb: output.thumb,
        totalBytes: output.main.bytes + output.thumb.bytes,
      },
      rendering: rendered,
      result: "PASS",
      timing: output.timing,
    });
    await editor.getByRole("button", { name: "Discard selection" }).click();
  }

  const multiFrameGif = Buffer.from(
    "R0lGODlhAgACAIAAAExpcf///yH/C05FVFNDQVBFMi4wAwEAAAAh+QQJCgAAACwAAAAAAgACAAACAoxTACH5BAUKAAAALAAAAAACAAIAAAIChFEAOw==",
    "base64",
  );
  expect(
    (await sharp(multiFrameGif, { animated: true }).metadata()).pages,
  ).toBe(2);
  const rejected = [
    {
      bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      expected: /could not be decoded safely/,
      mimeType: "image/jpeg",
      name: "corrupt.jpg",
      reason: "decode_failed",
    },
    {
      bytes: landscape,
      expected: /Choose a JPEG or PNG image/,
      mimeType: "application/octet-stream",
      name: "wrong-mime.jpg",
      reason: "mime_rejected",
    },
    {
      bytes: multiFrameGif,
      expected: /Choose a JPEG or PNG image/,
      mimeType: "image/gif",
      name: "animated-multiframe.gif",
      reason: "animated_format_rejected",
    },
  ];
  for (const sample of rejected) {
    const { memory } = await sampleHeapDuring(session, async () => {
      await input.setInputFiles({
        buffer: sample.bytes,
        mimeType: sample.mimeType,
        name: sample.name,
      });
      await expect(editor.getByText(sample.expected)).toBeVisible({
        timeout: 20_000,
      });
    });
    measurements.push({
      input: { bytes: sample.bytes.length, mimeType: sample.mimeType },
      memory,
      name: sample.name,
      reason: sample.reason,
      result: "REJECTED_AS_EXPECTED",
    });
  }

  await input.setInputFiles({
    buffer: highResolution,
    mimeType: "image/jpeg",
    name: "48mp-cancel.jpg",
  });
  await editor.getByRole("button", { name: "Cancel operation" }).click();
  await expect(editor.getByText(/Image operation cancelled/)).toBeVisible({
    timeout: 20_000,
  });
  expect(maximumTimerGapMs).toBeLessThan(750);

  const passedMeasurements = measurements.filter(
    (measurement) => measurement.result === "PASS",
  ) as Array<{
    input: { bytes: number };
    memory: { maximumSampledDeltaBytes: number };
    output: {
      main: { bytes: number };
      thumb: { bytes: number };
      totalBytes: number;
    };
    timing: PreparedCapture["timing"];
  }>;
  const distributions = {
    inputBytes: distribution(
      passedMeasurements.map((measurement) => measurement.input.bytes),
      0,
    ),
    mainBytes: distribution(
      passedMeasurements.map((measurement) => measurement.output.main.bytes),
      0,
    ),
    memoryMaximumSampledDeltaBytes: distribution(
      passedMeasurements.map(
        (measurement) => measurement.memory.maximumSampledDeltaBytes,
      ),
      0,
    ),
    thumbBytes: distribution(
      passedMeasurements.map((measurement) => measurement.output.thumb.bytes),
      0,
    ),
    timingBrowserTotalMs: distribution(
      passedMeasurements.map(
        (measurement) => measurement.timing.browserTotalMs,
      ),
    ),
    timingDecodeAndValidateMs: distribution(
      passedMeasurements.map(
        (measurement) => measurement.timing.decodeAndValidateMs,
      ),
    ),
    timingMainEncodeMs: distribution(
      passedMeasurements.map((measurement) => measurement.timing.mainEncodeMs),
    ),
    timingMetadataHashMs: distribution(
      passedMeasurements.map(
        (measurement) => measurement.timing.metadataHashMs,
      ),
    ),
    timingThumbEncodeMs: distribution(
      passedMeasurements.map((measurement) => measurement.timing.thumbEncodeMs),
    ),
    totalBytes: distribution(
      passedMeasurements.map((measurement) => measurement.output.totalBytes),
      0,
    ),
  };
  const storageProjections = [1, 1_000, 10_000, 20_000, 100_000].map(
    (imageCount) => ({
      imageCount,
      profiles: Object.fromEntries(
        (["mean", "p50", "p90", "p95"] as const).map((profile) => [
          profile,
          {
            mainGbDecimal: round(
              (distributions.mainBytes[profile] * imageCount) / 1_000_000_000,
              9,
            ),
            thumbGbDecimal: round(
              (distributions.thumbBytes[profile] * imageCount) / 1_000_000_000,
              9,
            ),
            totalGbDecimal: round(
              (distributions.totalBytes[profile] * imageCount) / 1_000_000_000,
              9,
            ),
          },
        ]),
      ),
    }),
  );
  const report = {
    acceptedRepresentative: passedMeasurements.length,
    cancelled48MP: "PASS",
    distributions,
    generatedAt: new Date().toISOString(),
    maximumTimerGapMsSample: round(maximumTimerGapMs),
    measurements,
    memoryMethod: {
      caveat:
        "CDP page JS heap checkpoints sampled every 20 ms; excludes complete worker, canvas and native decode memory and is not an absolute process peak.",
      metric: "Performance.getMetrics.JSHeapUsedSize",
      source: "Chromium DevTools Protocol page session",
    },
    percentileMethod: "nearest-rank over 12 accepted representative outputs",
    rejectedValidation: rejected.length,
    result: "PASS",
    sampleCount: measurements.length,
    schemaVersion: 2,
    storageAssumptions: {
      bytesPerVersion: "one main object plus one thumb object",
      excludes:
        "superseded versions, object metadata, pending objects, backups and egress",
      percentileTotal:
        "computed over paired main+thumb outputs, not by summing marginal percentiles",
      unit: "decimal GB",
    },
    storageProjections,
  };
  expect(report.acceptedRepresentative).toBe(12);
  expect(report.sampleCount).toBe(15);
  writeFileSync(
    `docs/TASKS/EVIDENCE/TASK-138/admin-preprocessing-${testInfo.project.name}.json`,
    `${JSON.stringify(report, null, 2)}\n`,
    { encoding: "utf8", mode: 0o644 },
  );
  await testInfo.attach("task138-preprocessing-distribution-redacted", {
    body: Buffer.from(JSON.stringify(report)),
    contentType: "application/json",
  });
});
