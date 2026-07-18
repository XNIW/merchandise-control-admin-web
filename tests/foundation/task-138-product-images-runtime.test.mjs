import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  activateProductImageCacheScope,
  cacheProductImageBlob,
  getProductImageRuntimeStats,
  loadProductImage,
  PRODUCT_IMAGE_CACHE_MAX_BYTES,
  PRODUCT_IMAGE_CACHE_MAX_ENTRIES,
  PRODUCT_IMAGE_DOWNLOAD_CONCURRENCY,
  releaseProductImageObjectUrl,
  uploadProductImage,
} from "../../src/lib/product-images/browser-client.ts";

const SHOP_ID = "10000000-0000-4000-8000-000000000138";
const CACHE_SCOPE = "a".repeat(64);
const SUPABASE_ORIGIN = "http://127.0.0.1:54321";

function uuid(prefix, index) {
  return `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function jpegBlob() {
  return new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], {
    type: "image/jpeg",
  });
}

function installBrowserGlobals({ caches } = {}) {
  const descriptors = new Map();
  for (const name of [
    "caches",
    "createImageBitmap",
    "fetch",
    "navigator",
    "window",
  ]) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: true },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      ...(caches ? { caches } : {}),
      location: { origin: "http://127.0.0.1:3000" },
    },
  });
  if (caches) {
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: caches,
    });
  }
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: async () => ({ close() {}, height: 1, width: 1 }),
    writable: true,
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;

  return () => {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  };
}

test("TASK-138 batches 205 visible refs, coalesces duplicates and bounds network concurrency", async () => {
  const restore = installBrowserGlobals();
  const readBatchSizes = [];
  let readActive = 0;
  let readPeak = 0;
  let downloadActive = 0;
  let downloadPeak = 0;
  let downloadCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url === "/api/shop/product-images/read-urls") {
      readActive += 1;
      readPeak = Math.max(readPeak, readActive);
      const body = JSON.parse(String(init.body));
      readBatchSizes.push(body.refs.length);
      await new Promise((resolve) => setTimeout(resolve, 4));
      readActive -= 1;
      return Response.json({
        cacheScope: CACHE_SCOPE,
        items: body.refs.map((ref) => ({
          ...ref,
          signedUrl: `${SUPABASE_ORIGIN}/storage/v1/object/sign/product-images/shops/${SHOP_ID}/products/${ref.productId}/primary/${ref.versionId}/${ref.variant}.jpg?token=ephemeral`,
          status: "ready",
        })),
        ok: true,
      });
    }
    if (url.startsWith(`${SUPABASE_ORIGIN}/storage/v1/object/sign/`)) {
      downloadCount += 1;
      downloadActive += 1;
      downloadPeak = Math.max(downloadPeak, downloadActive);
      await new Promise((resolve) => setTimeout(resolve, 2));
      downloadActive -= 1;
      return new Response(jpegBlob());
    }
    throw new Error("unexpected request");
  };

  try {
    const refs = Array.from({ length: 205 }, (_, index) => ({
      productId: uuid("2", index + 1),
      shopId: SHOP_ID,
      variant: "thumb",
      versionId: uuid("3", index + 1),
    }));
    const results = await Promise.all(
      refs.flatMap((ref) => [loadProductImage(ref), loadProductImage(ref)]),
    );
    results.forEach((result) => releaseProductImageObjectUrl(result.objectUrl));

    assert.deepEqual(
      readBatchSizes.sort((a, b) => b - a),
      [100, 100, 5],
    );
    assert.equal(
      readBatchSizes.reduce((sum, size) => sum + size, 0),
      205,
    );
    assert.equal(downloadCount, 205);
    assert.ok(readPeak <= 2, `read peak ${readPeak}`);
    assert.ok(
      downloadPeak <= PRODUCT_IMAGE_DOWNLOAD_CONCURRENCY,
      `download peak ${downloadPeak}`,
    );
    assert.equal(downloadPeak, PRODUCT_IMAGE_DOWNLOAD_CONCURRENCY);
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test("TASK-138 keeps signed URL leases memory-only, coalesces consumers and stops after double 403", async () => {
  const restore = installBrowserGlobals();
  const originalFetch = globalThis.fetch;
  let readRequests = 0;
  let storageRequests = 0;
  const sharedRef = {
    productId: uuid("4", 1),
    shopId: SHOP_ID,
    variant: "thumb",
    versionId: uuid("5", 1),
  };
  const nearExpiryRef = {
    productId: uuid("4", 2),
    shopId: SHOP_ID,
    variant: "thumb",
    versionId: uuid("5", 2),
  };
  const forbiddenRef = {
    productId: uuid("4", 3),
    shopId: SHOP_ID,
    variant: "main",
    versionId: uuid("5", 3),
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url === "/api/shop/product-images/read-urls") {
      readRequests += 1;
      const body = JSON.parse(String(init.body));
      return Response.json({
        cacheScope: CACHE_SCOPE,
        items: body.refs.map((ref) => ({
          ...ref,
          expiresAt: new Date(
            Date.now() +
              (ref.productId === nearExpiryRef.productId ? 5_000 : 5 * 60_000),
          ).toISOString(),
          signedUrl: `${SUPABASE_ORIGIN}/storage/v1/object/sign/product-images/shops/${SHOP_ID}/products/${ref.productId}/primary/${ref.versionId}/${ref.variant}.jpg?token=ephemeral-${readRequests}`,
          status: "ready",
        })),
        ok: true,
      });
    }
    if (url.startsWith(`${SUPABASE_ORIGIN}/storage/v1/object/sign/`)) {
      storageRequests += 1;
      if (url.includes(forbiddenRef.productId)) {
        return new Response(null, { status: 403 });
      }
      return new Response(jpegBlob());
    }
    throw new Error("unexpected request");
  };

  try {
    const shared = await Promise.all(
      Array.from({ length: 20 }, () =>
        loadProductImage(sharedRef, CACHE_SCOPE),
      ),
    );
    shared.forEach((result) => releaseProductImageObjectUrl(result.objectUrl));
    assert.equal(readRequests, 1);
    assert.equal(storageRequests, 1);

    const rerender = await loadProductImage(sharedRef, CACHE_SCOPE);
    releaseProductImageObjectUrl(rerender.objectUrl);
    assert.equal(readRequests, 1, "valid lease avoids a second read-urls call");
    assert.equal(storageRequests, 2);

    const nearExpiryFirst = await loadProductImage(nearExpiryRef, CACHE_SCOPE);
    releaseProductImageObjectUrl(nearExpiryFirst.objectUrl);
    const nearExpirySecond = await loadProductImage(nearExpiryRef, CACHE_SCOPE);
    releaseProductImageObjectUrl(nearExpirySecond.objectUrl);
    assert.equal(readRequests, 3, "safety window forces a fresh signed URL");

    await assert.rejects(
      loadProductImage(forbiddenRef, CACHE_SCOPE),
      /image_download_failed_403/,
    );
    assert.equal(readRequests, 5, "one initial lease and one refresh only");
    assert.equal(storageRequests, 6, "double 403 performs no third download");

    await activateProductImageCacheScope({
      cacheScope: "b".repeat(64),
      shopId: SHOP_ID,
    });
    const afterScopeSwitch = await loadProductImage(sharedRef, CACHE_SCOPE);
    releaseProductImageObjectUrl(afterScopeSwitch.objectUrl);
    assert.equal(
      readRequests,
      6,
      "account/cache boundary switch clears the previous in-memory lease",
    );
    assert.equal(storageRequests, 7);
    assert.equal((await getProductImageRuntimeStats()).activeObjectUrls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test("TASK-138 rejects corrupt decoded bytes before cache commit and purges old scope", async () => {
  const deleted = [];
  let putCount = 0;
  const oldRequest = new Request(
    `http://127.0.0.1:3000/__task137-product-image-cache/${"b".repeat(64)}/${SHOP_ID}/${uuid("2", 1)}/${uuid("3", 1)}/thumb.jpg`,
  );
  const keepRequest = new Request(
    `http://127.0.0.1:3000/__task137-product-image-cache/${CACHE_SCOPE}/${SHOP_ID}/${uuid("2", 2)}/${uuid("3", 2)}/thumb.jpg`,
  );
  const stored = new Map([
    [oldRequest.url, new Response(jpegBlob())],
    [keepRequest.url, new Response(jpegBlob())],
  ]);
  const cache = {
    async delete(request) {
      deleted.push(request.url);
      stored.delete(request.url);
      return true;
    },
    async keys() {
      return Array.from(stored.keys(), (url) => new Request(url));
    },
    async match(request) {
      return stored.get(request.url)?.clone();
    },
    async put(request, response) {
      putCount += 1;
      stored.set(request.url, response.clone());
    },
  };
  const cacheStorage = {
    async open() {
      return cache;
    },
  };
  const restore = installBrowserGlobals({ caches: cacheStorage });
  const ref = {
    productId: uuid("2", 10),
    shopId: SHOP_ID,
    variant: "thumb",
    versionId: uuid("3", 10),
  };

  try {
    globalThis.createImageBitmap = async () => {
      throw new Error("decode failed");
    };
    await assert.rejects(
      cacheProductImageBlob(CACHE_SCOPE, ref, jpegBlob()),
      /image_download_invalid/,
    );
    assert.equal(putCount, 0);

    globalThis.createImageBitmap = async () => ({
      close() {},
      height: 1,
      width: 1,
    });
    await cacheProductImageBlob(CACHE_SCOPE, ref, jpegBlob());
    assert.equal(putCount, 1);

    await activateProductImageCacheScope({
      cacheScope: CACHE_SCOPE,
      shopId: SHOP_ID,
    });
    assert.deepEqual(deleted, [oldRequest.url]);
  } finally {
    restore();
  }
});

test("TASK-138 Cache Storage enforces byte and entry budgets with LRU eviction", async () => {
  const stored = new Map();
  let oldestUrl = "";
  for (let index = 0; index < 32; index += 1) {
    const request = new Request(
      `http://127.0.0.1:3000/__task137-product-image-cache/${CACHE_SCOPE}/${SHOP_ID}/${uuid("6", index + 1)}/${uuid("7", index + 1)}/main.jpg`,
    );
    if (index === 0) oldestUrl = request.url;
    stored.set(
      request.url,
      new Response(jpegBlob(), {
        headers: {
          "Content-Type": "image/jpeg",
          "X-MC-Image-Accessed-At": String(index + 1),
          "X-MC-Image-Bytes": String(1024 * 1024),
        },
      }),
    );
  }
  for (let index = 32; index < PRODUCT_IMAGE_CACHE_MAX_ENTRIES; index += 1) {
    const request = new Request(
      `http://127.0.0.1:3000/__task137-product-image-cache/${CACHE_SCOPE}/${SHOP_ID}/${uuid("6", index + 1)}/${uuid("7", index + 1)}/thumb.jpg`,
    );
    stored.set(
      request.url,
      new Response(jpegBlob(), {
        headers: {
          "Content-Type": "image/jpeg",
          "X-MC-Image-Accessed-At": String(index + 1),
          "X-MC-Image-Bytes": "4",
        },
      }),
    );
  }
  const cache = {
    async delete(request) {
      return stored.delete(request.url);
    },
    async keys() {
      return Array.from(stored.keys(), (url) => new Request(url));
    },
    async match(request) {
      return stored.get(request.url)?.clone();
    },
    async put(request, response) {
      stored.set(request.url, response.clone());
    },
  };
  const restore = installBrowserGlobals({
    caches: {
      async open() {
        return cache;
      },
    },
  });
  try {
    await cacheProductImageBlob(
      CACHE_SCOPE,
      {
        productId: uuid("8", 1),
        shopId: SHOP_ID,
        variant: "thumb",
        versionId: uuid("9", 1),
      },
      jpegBlob(),
    );
    const stats = await getProductImageRuntimeStats();
    assert.ok(stats.cacheEntries <= PRODUCT_IMAGE_CACHE_MAX_ENTRIES);
    assert.ok(stats.cacheBytes <= PRODUCT_IMAGE_CACHE_MAX_BYTES);
    assert.equal(stored.has(oldestUrl), false);
  } finally {
    restore();
  }
});

test("TASK-138 exposes upload phases and aborts before partial finalize", async () => {
  const restore = installBrowserGlobals();
  const controller = new AbortController();
  const stages = [];
  let finalizeCount = 0;
  let uploadCount = 0;
  const productId = uuid("2", 20);
  const versionId = uuid("3", 20);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url === "/api/shop/product-images/intent") {
      return Response.json({
        cacheScope: CACHE_SCOPE,
        mainUploadUrl: `${SUPABASE_ORIGIN}/storage/v1/object/upload/sign/product-images/shops/${SHOP_ID}/products/${productId}/primary/${versionId}/main.jpg?token=ephemeral`,
        ok: true,
        status: "upload_required",
        thumbUploadUrl: `${SUPABASE_ORIGIN}/storage/v1/object/upload/sign/product-images/shops/${SHOP_ID}/products/${productId}/primary/${versionId}/thumb.jpg?token=ephemeral`,
        versionId,
      });
    }
    if (url.startsWith(`${SUPABASE_ORIGIN}/storage/v1/object/upload/`)) {
      if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      uploadCount += 1;
      return new Response(null, { status: 200 });
    }
    if (url === "/api/shop/product-images/finalize") {
      finalizeCount += 1;
      return Response.json({ ok: true, status: "finalized", versionId });
    }
    throw new Error("unexpected request");
  };
  const metadata = {
    bytes: 4,
    height: 1,
    mimeType: "image/jpeg",
    sha256: "c".repeat(64),
    width: 1,
  };

  try {
    await assert.rejects(
      uploadProductImage({
        onProgress(stage) {
          stages.push(stage);
          if (stage === "upload-thumb") controller.abort();
        },
        prepared: {
          main: { blob: jpegBlob(), metadata },
          thumb: { blob: jpegBlob(), metadata },
        },
        productId,
        shopId: SHOP_ID,
        signal: controller.signal,
      }),
      /image_operation_cancelled/,
    );
    assert.deepEqual(stages, ["intent", "upload-main", "upload-thumb"]);
    assert.equal(uploadCount, 1);
    assert.equal(finalizeCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test("TASK-138 UI gates thumbnails, renders progressive detail and clears image cache on logout", async () => {
  const [controls, accountLogout, staffLogout, client, worker] =
    await Promise.all([
      readFile("src/app/shop/_components/ProductImageControls.tsx", "utf8"),
      readFile("src/app/auth/logout/route.ts", "utf8"),
      readFile("src/app/shop/staff-logout/route.ts", "utf8"),
      readFile("src/lib/product-images/browser-client.ts", "utf8"),
      readFile("src/lib/product-images/product-image-worker.ts", "utf8"),
    ]);
  assert.match(controls, /new IntersectionObserver/);
  assert.match(
    controls,
    /loadProductImage\(ref, input\.cacheScope, controller\.signal\)/,
  );
  assert.match(controls, /Cancel operation/);
  assert.match(controls, /predecodeObjectUrl/);
  assert.match(controls, /data-product-image-progressive-stage/);
  assert.match(controls, /motion-reduce:transition-none/);
  assert.match(controls, /dataset\.productImageMetrics !== "enabled"/);
  assert.match(controls, /data-product-image-thumb-bytes/);
  assert.match(
    client,
    /new Worker\(\s*new URL\("\.\/product-image-worker\.ts"/,
  );
  assert.match(client, /browserTotalMs/);
  assert.match(client, /metadataHashMs/);
  assert.doesNotMatch(worker, /Promise\.all\(\[\s*encodeWithinBudget/);
  assert.match(worker, /source: main\.canvas/);
  assert.match(worker, /releaseCanvas\(main\.canvas\)/);
  assert.match(worker, /decodeAndValidateMs/);
  assert.match(worker, /mainEncodeMs/);
  assert.match(worker, /thumbEncodeMs/);
  assert.match(worker, /metadataHashMs/);
  assert.match(accountLogout, /Clear-Site-Data/);
  assert.match(staffLogout, /Clear-Site-Data/);
});
