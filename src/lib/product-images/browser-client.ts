const MAIN_MAX_SIDE = 1600;
const MAIN_TARGET_BYTES = 750 * 1024;
const MAIN_MAX_BYTES = 1024 * 1024;
const THUMB_MAX_SIDE = 384;
const THUMB_MAX_BYTES = 90 * 1024;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_INPUT_PIXELS = 64_000_000;
const READ_BATCH_LIMIT = 100;
const CACHE_NAME = "task137-product-images-v1";
export const PRODUCT_IMAGE_PREPROCESS_MEASURE =
  "task137-product-image-preprocess";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CACHE_SCOPE_PATTERN = /^[0-9a-f]{64}$/;

export type ProductImageVariant = "main" | "thumb";

export type ProductImageRef = {
  productId: string;
  shopId: string;
  variant: ProductImageVariant;
  versionId: string;
};

export type ProductImageMetadata = {
  bytes: number;
  height: number;
  mimeType: "image/jpeg";
  sha256: string;
  width: number;
};

export type PreparedProductImage = {
  main: { blob: Blob; metadata: ProductImageMetadata };
  thumb: { blob: Blob; metadata: ProductImageMetadata };
};

export type ProductImageLoadResult = {
  cacheScope: string;
  objectUrl: string;
  source: "cache" | "network";
};

type DecodedImage = {
  dispose: () => void;
  height: number;
  source: CanvasImageSource;
  width: number;
};

type ReadResponseItem = {
  expiresAt?: string;
  productId: string;
  signedUrl?: string;
  status: "not_found" | "ready";
  variant: ProductImageVariant;
  versionId: string;
};

type ReadResponse = {
  cacheScope?: string;
  items?: ReadResponseItem[];
  ok?: boolean;
};

type PendingRead = {
  ref: ProductImageRef;
  reject: (error: Error) => void;
  resolve: (value: { cacheScope: string; item: ReadResponseItem }) => void;
};

let pendingReads: PendingRead[] = [];
let readFlushQueued = false;

function imageError(code: string) {
  const error = new Error(code);
  error.name = "ProductImageError";
  return error;
}

function assertRef(ref: ProductImageRef) {
  if (
    !UUID_PATTERN.test(ref.shopId) ||
    !UUID_PATTERN.test(ref.productId) ||
    !UUID_PATTERN.test(ref.versionId) ||
    (ref.variant !== "main" && ref.variant !== "thumb")
  ) {
    throw imageError("image_reference_invalid");
  }
}

async function sniffInput(file: File) {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const jpeg =
    header.length >= 3 &&
    header[0] === 0xff &&
    header[1] === 0xd8 &&
    header[2] === 0xff;
  const png =
    header.length >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a;

  if (!jpeg && !png) {
    throw imageError("image_input_format_unsupported");
  }
}

async function decodeInput(file: File): Promise<DecodedImage> {
  if (file.size < 1 || file.size > MAX_INPUT_BYTES) {
    throw imageError("image_input_size_invalid");
  }
  await sniffInput(file);

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        dispose: () => bitmap.close(),
        height: bitmap.height,
        source: bitmap,
        width: bitmap.width,
      };
    } catch {
      // Safari and older browsers can decode through HTMLImageElement instead.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;
  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(objectUrl);
    throw imageError("image_decode_failed");
  }

  return {
    dispose: () => URL.revokeObjectURL(objectUrl),
    height: image.naturalHeight,
    source: image,
    width: image.naturalWidth,
  };
}

function outputDimensions(width: number, height: number, maxSide: number) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > MAX_INPUT_PIXELS
  ) {
    throw imageError("image_dimensions_invalid");
  }

  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  };
}

function renderCanvas(
  decoded: DecodedImage,
  maxSide: number,
): HTMLCanvasElement {
  const dimensions = outputDimensions(decoded.width, decoded.height, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d", {
    alpha: false,
    colorSpace: "srgb",
  });
  if (!context) {
    throw imageError("image_canvas_unavailable");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, dimensions.width, dimensions.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(decoded.source, 0, 0, dimensions.width, dimensions.height);
  return canvas;
}

function encodeCanvas(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.type !== "image/jpeg") {
          reject(imageError("image_encode_failed"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

async function encodeWithinBudget(input: {
  decoded: DecodedImage;
  hardMaxBytes: number;
  initialMaxSide: number;
  minimumSide: number;
  qualities: readonly number[];
  targetBytes: number;
}) {
  const sourceLongestSide = Math.max(input.decoded.width, input.decoded.height);
  let maximumSide = Math.min(input.initialMaxSide, sourceLongestSide);
  let fallback: { blob: Blob; canvas: HTMLCanvasElement } | null = null;

  while (maximumSide > 0) {
    const canvas = renderCanvas(input.decoded, maximumSide);
    for (const quality of input.qualities) {
      const blob = await encodeCanvas(canvas, quality);
      if (
        blob.size <= input.hardMaxBytes &&
        (!fallback || blob.size < fallback.blob.size)
      ) {
        fallback = { blob, canvas };
      }
      if (blob.size <= input.targetBytes) {
        return { blob, canvas };
      }
    }

    if (
      maximumSide <= input.minimumSide ||
      (maximumSide >= sourceLongestSide && sourceLongestSide < input.minimumSide)
    ) {
      break;
    }
    const reduced = Math.max(
      input.minimumSide,
      Math.floor(maximumSide * 0.85),
    );
    if (reduced >= maximumSide) {
      break;
    }
    maximumSide = Math.min(reduced, sourceLongestSide);
  }

  if (fallback && fallback.blob.size <= input.hardMaxBytes) {
    return fallback;
  }
  throw imageError("image_output_budget_exceeded");
}

async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function metadata(
  blob: Blob,
  canvas: HTMLCanvasElement,
): Promise<ProductImageMetadata> {
  return {
    bytes: blob.size,
    height: canvas.height,
    mimeType: "image/jpeg",
    sha256: await sha256(blob),
    width: canvas.width,
  };
}

export async function prepareProductImage(
  file: File,
): Promise<PreparedProductImage> {
  const startedAt = performance.now();
  try {
    const decoded = await decodeInput(file);
    try {
      const [main, thumb] = await Promise.all([
        encodeWithinBudget({
          decoded,
          hardMaxBytes: MAIN_MAX_BYTES,
          initialMaxSide: MAIN_MAX_SIDE,
          minimumSide: 640,
          qualities: [0.82, 0.76, 0.7],
          targetBytes: MAIN_TARGET_BYTES,
        }),
        encodeWithinBudget({
          decoded,
          hardMaxBytes: THUMB_MAX_BYTES,
          initialMaxSide: THUMB_MAX_SIDE,
          minimumSide: 128,
          qualities: [0.75, 0.68, 0.6, 0.52],
          targetBytes: THUMB_MAX_BYTES,
        }),
      ]);
      const [mainMetadata, thumbMetadata] = await Promise.all([
        metadata(main.blob, main.canvas),
        metadata(thumb.blob, thumb.canvas),
      ]);

      return {
        main: { blob: main.blob, metadata: mainMetadata },
        thumb: { blob: thumb.blob, metadata: thumbMetadata },
      };
    } finally {
      decoded.dispose();
    }
  } finally {
    performance.clearMeasures(PRODUCT_IMAGE_PREPROCESS_MEASURE);
    performance.measure(PRODUCT_IMAGE_PREPROCESS_MEASURE, {
      end: performance.now(),
      start: startedAt,
    });
  }
}

function readKey(ref: ProductImageRef) {
  return `${ref.shopId}:${ref.productId}:${ref.versionId}:${ref.variant}`;
}

function cacheRequest(cacheScope: string, ref: ProductImageRef) {
  if (!CACHE_SCOPE_PATTERN.test(cacheScope)) {
    throw imageError("image_cache_scope_invalid");
  }
  assertRef(ref);
  const path = [
    "",
    "__task137-product-image-cache",
    cacheScope,
    ref.shopId,
    ref.productId,
    ref.versionId,
    `${ref.variant}.jpg`,
  ].join("/");
  return new Request(new URL(path, window.location.origin), { method: "GET" });
}

async function readCachedBlob(cacheScope: string, ref: ProductImageRef) {
  if (!("caches" in window)) {
    return null;
  }
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(cacheRequest(cacheScope, ref));
  if (!response) {
    return null;
  }
  const blob = await response.blob();
  const maxBytes = ref.variant === "main" ? MAIN_MAX_BYTES : THUMB_MAX_BYTES;
  return blob.type === "image/jpeg" && blob.size > 0 && blob.size <= maxBytes
    ? blob
    : null;
}

export async function cacheProductImageBlob(
  cacheScope: string,
  ref: ProductImageRef,
  blob: Blob,
) {
  if (!("caches" in window)) {
    return;
  }
  const maxBytes = ref.variant === "main" ? MAIN_MAX_BYTES : THUMB_MAX_BYTES;
  if (blob.type !== "image/jpeg" || blob.size < 1 || blob.size > maxBytes) {
    throw imageError("image_cache_blob_invalid");
  }
  const cache = await caches.open(CACHE_NAME);
  await cache.put(
    cacheRequest(cacheScope, ref),
    new Response(blob, {
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Type": "image/jpeg",
      },
    }),
  );
}

export async function purgeProductImageCache(input: {
  cacheScope: string;
  keepVersionId?: string;
  productId: string;
  shopId: string;
}) {
  if (!("caches" in window) || !CACHE_SCOPE_PATTERN.test(input.cacheScope)) {
    return;
  }
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  const prefix = `/__task137-product-image-cache/${input.cacheScope}/${input.shopId}/${input.productId}/`;
  await Promise.all(
    keys.map(async (key) => {
      const pathname = new URL(key.url).pathname;
      if (!pathname.startsWith(prefix)) {
        return;
      }
      const versionId = pathname.slice(prefix.length).split("/")[0];
      if (!input.keepVersionId || versionId !== input.keepVersionId) {
        await cache.delete(key);
      }
    }),
  );
}

export function safeProductImageStorageUrl(
  value: string,
  mode: "read" | "upload",
) {
  const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!configuredSupabaseUrl) {
    throw imageError("image_signed_url_invalid");
  }

  let storageOrigin: string;
  try {
    storageOrigin = new URL(configuredSupabaseUrl).origin;
  } catch {
    throw imageError("image_signed_url_invalid");
  }

  const url = new URL(value, window.location.origin);
  const localHttp =
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  const marker =
    mode === "upload"
      ? "/storage/v1/object/upload/sign/product-images/"
      : "/storage/v1/object/sign/product-images/";
  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.origin !== storageOrigin ||
    url.username !== "" ||
    url.password !== "" ||
    !url.pathname.startsWith(marker)
  ) {
    throw imageError("image_signed_url_invalid");
  }
  return url.toString();
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal) {
  const response = await fetch(path, {
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });
  let parsed: T | null = null;
  try {
    parsed = (await response.json()) as T;
  } catch {
    // The client never exposes raw backend or Storage errors.
  }
  if (!response.ok || !parsed) {
    throw imageError(`image_request_failed_${response.status}`);
  }
  return parsed;
}

async function flushPendingReads() {
  readFlushQueued = false;
  const batch = pendingReads;
  pendingReads = [];
  const grouped = new Map<string, PendingRead[]>();

  for (const pending of batch) {
    const rows = grouped.get(pending.ref.shopId) ?? [];
    rows.push(pending);
    grouped.set(pending.ref.shopId, rows);
  }

  await Promise.all(
    Array.from(grouped.entries()).flatMap(([shopId, rows]) => {
      const operations: Promise<void>[] = [];
      for (let offset = 0; offset < rows.length; offset += READ_BATCH_LIMIT) {
        const chunk = rows.slice(offset, offset + READ_BATCH_LIMIT);
        operations.push(
          (async () => {
            try {
              const response = await postJson<ReadResponse>(
                "/api/shop/product-images/read-urls",
                {
                  refs: chunk.map(({ ref }) => ({
                    productId: ref.productId,
                    variant: ref.variant,
                    versionId: ref.versionId,
                  })),
                  shopId,
                },
              );
              if (
                response.ok !== true ||
                !response.cacheScope ||
                !CACHE_SCOPE_PATTERN.test(response.cacheScope) ||
                !Array.isArray(response.items)
              ) {
                throw imageError("image_read_contract_invalid");
              }
              const items = new Map(
                response.items.map((item) => [
                  `${shopId}:${item.productId}:${item.versionId}:${item.variant}`,
                  item,
                ]),
              );
              for (const pending of chunk) {
                const item = items.get(readKey(pending.ref));
                if (!item) {
                  pending.reject(imageError("image_read_contract_invalid"));
                } else {
                  pending.resolve({
                    cacheScope: response.cacheScope,
                    item,
                  });
                }
              }
            } catch (error) {
              const safeError =
                error instanceof Error
                  ? error
                  : imageError("image_read_failed");
              chunk.forEach(({ reject }) => reject(safeError));
            }
          })(),
        );
      }
      return operations;
    }),
  );
}

function requestSignedRead(ref: ProductImageRef) {
  assertRef(ref);
  return new Promise<{ cacheScope: string; item: ReadResponseItem }>(
    (resolve, reject) => {
      pendingReads.push({ ref, reject, resolve });
      if (!readFlushQueued) {
        readFlushQueued = true;
        queueMicrotask(() => {
          void flushPendingReads();
        });
      }
    },
  );
}

export async function loadProductImage(
  ref: ProductImageRef,
  knownCacheScope?: string,
): Promise<ProductImageLoadResult> {
  assertRef(ref);
  if (knownCacheScope && CACHE_SCOPE_PATTERN.test(knownCacheScope)) {
    const cached = await readCachedBlob(knownCacheScope, ref);
    if (cached) {
      return {
        cacheScope: knownCacheScope,
        objectUrl: URL.createObjectURL(cached),
        source: "cache",
      };
    }
  }
  if (navigator.onLine === false) {
    throw imageError("image_offline_not_cached");
  }

  const resolved = await requestSignedRead(ref);
  if (resolved.item.status !== "ready" || !resolved.item.signedUrl) {
    throw imageError("image_not_found");
  }
  const response = await fetch(
    safeProductImageStorageUrl(resolved.item.signedUrl, "read"),
    {
      cache: "no-store",
      credentials: "omit",
    },
  );
  if (!response.ok) {
    throw imageError("image_download_failed");
  }
  const blob = await response.blob();
  const maxBytes = ref.variant === "main" ? MAIN_MAX_BYTES : THUMB_MAX_BYTES;
  if (blob.type !== "image/jpeg" || blob.size < 1 || blob.size > maxBytes) {
    throw imageError("image_download_invalid");
  }
  await cacheProductImageBlob(resolved.cacheScope, ref, blob);
  await purgeProductImageCache({
    cacheScope: resolved.cacheScope,
    keepVersionId: ref.versionId,
    productId: ref.productId,
    shopId: ref.shopId,
  });
  return {
    cacheScope: resolved.cacheScope,
    objectUrl: URL.createObjectURL(blob),
    source: "network",
  };
}

async function putSignedJpeg(url: string, blob: Blob, signal?: AbortSignal) {
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", blob, "image.jpg");
  const response = await fetch(safeProductImageStorageUrl(url, "upload"), {
    body,
    cache: "no-store",
    credentials: "omit",
    headers: {
      "x-upsert": "false",
    },
    method: "PUT",
    signal,
  });
  if (!response.ok) {
    throw imageError("image_upload_failed");
  }
}

type IntentResponse = {
  cacheScope?: string;
  mainUploadUrl?: string;
  ok?: boolean;
  status?: "noop" | "upload_required";
  thumbUploadUrl?: string;
  versionId?: string;
};

type FinalizeResponse = {
  ok?: boolean;
  status?: "already_finalized" | "finalized";
  versionId?: string;
};

export async function uploadProductImage(input: {
  prepared: PreparedProductImage;
  productId: string;
  shopId: string;
  signal?: AbortSignal;
}) {
  const intent = await postJson<IntentResponse>(
    "/api/shop/product-images/intent",
    {
      main: input.prepared.main.metadata,
      productId: input.productId,
      shopId: input.shopId,
      thumb: input.prepared.thumb.metadata,
    },
    input.signal,
  );
  if (intent.ok !== true || !intent.versionId || !UUID_PATTERN.test(intent.versionId)) {
    throw imageError("image_intent_contract_invalid");
  }
  if (intent.status === "noop") {
    return {
      cacheScope: intent.cacheScope,
      status: "noop" as const,
      versionId: intent.versionId,
    };
  }
  if (
    intent.status !== "upload_required" ||
    !intent.mainUploadUrl ||
    !intent.thumbUploadUrl
  ) {
    throw imageError("image_intent_contract_invalid");
  }

  await Promise.all([
    putSignedJpeg(intent.mainUploadUrl, input.prepared.main.blob, input.signal),
    putSignedJpeg(intent.thumbUploadUrl, input.prepared.thumb.blob, input.signal),
  ]);
  const finalized = await postJson<FinalizeResponse>(
    "/api/shop/product-images/finalize",
    {
      productId: input.productId,
      shopId: input.shopId,
      versionId: intent.versionId,
    },
    input.signal,
  );
  if (
    finalized.ok !== true ||
    finalized.versionId !== intent.versionId ||
    (finalized.status !== "finalized" && finalized.status !== "already_finalized")
  ) {
    throw imageError("image_finalize_contract_invalid");
  }
  return {
    cacheScope: intent.cacheScope,
    status: finalized.status,
    versionId: intent.versionId,
  };
}

export async function removeProductImage(input: {
  productId: string;
  shopId: string;
  versionId: string;
}) {
  const response = await postJson<{ ok?: boolean; status?: string }>(
    "/api/shop/product-images/remove",
    {
      expectedVersionId: input.versionId,
      productId: input.productId,
      shopId: input.shopId,
    },
  );
  if (response.ok !== true) {
    throw imageError("image_remove_failed");
  }
  return response.status ?? "removed";
}
