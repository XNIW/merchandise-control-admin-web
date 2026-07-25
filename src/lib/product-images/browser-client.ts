import { preflightInputImageDimensions } from "./input-dimensions.ts";

const MAIN_MAX_SIDE = 1600;
const MAIN_TARGET_BYTES = 750 * 1024;
const MAIN_MAX_BYTES = 1024 * 1024;
const THUMB_MAX_SIDE = 384;
const THUMB_MAX_BYTES = 90 * 1024;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_INPUT_PIXELS = 64_000_000;
const READ_BATCH_LIMIT = 16;
const READ_REQUEST_CONCURRENCY = 2;
export const PRODUCT_IMAGE_DOWNLOAD_CONCURRENCY = 4;
export const PRODUCT_IMAGE_CACHE_MAX_BYTES = 32 * 1024 * 1024;
export const PRODUCT_IMAGE_CACHE_MAX_ENTRIES = 256;
const PRODUCT_IMAGE_SIGNED_URL_SAFETY_MS = 30_000;
const PRODUCT_IMAGE_SIGNED_URL_MAX_ENTRIES = 512;
const CACHE_NAME = "task137-product-images-v1";
export const PRODUCT_IMAGE_PREPROCESS_MEASURE =
  "task137-product-image-preprocess";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CACHE_SCOPE_PATTERN = /^[0-9a-f]{64}$/;
const OUTPUT_SIDE_FACTORS = [1, 0.85, 0.72, 0.61, 0.52, 0.44, 0.4] as const;

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

export type ProductImagePreprocessTiming = {
  browserTotalMs: number;
  decodeAndValidateMs: number;
  mainEncodeMs: number;
  metadataHashMs: number;
  pipelineMs: number;
  runtime: "main-thread" | "worker";
  thumbEncodeMs: number;
};

export type PreparedProductImage = {
  main: { blob: Blob; metadata: ProductImageMetadata };
  thumb: { blob: Blob; metadata: ProductImageMetadata };
  timing: ProductImagePreprocessTiming;
};

export type ProductImageOperationStage =
  "finalize" | "intent" | "preprocess" | "upload-main" | "upload-thumb";

export type ProductImageOperationOptions = {
  onProgress?: (stage: ProductImageOperationStage) => void;
  signal?: AbortSignal;
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

type ReadResponseItem =
  | {
      productId: string;
      status: "not_found";
      variant: ProductImageVariant;
      versionId: string;
    }
  | {
      expiresAt: string;
      metadata: ProductImageMetadata;
      productId: string;
      signedUrl: string;
      status: "ready";
      variant: ProductImageVariant;
      versionId: string;
    };

type ReadResponse = {
  cacheScope?: string;
  items?: ReadResponseItem[];
  ok?: boolean;
};

type PendingRead = {
  boundaryGeneration: number;
  ref: ProductImageRef;
  reject: (error: Error) => void;
  resolve: (value: { cacheScope: string; item: ReadResponseItem }) => void;
  signal?: AbortSignal;
};

type SignedUrlLease = {
  cacheScope: string;
  expiresAtMs: number;
  item: ReadResponseItem;
  lastAccessedAt: number;
};

type InFlightSignedRead = {
  boundaryGeneration: number;
  consumers: number;
  controller: AbortController;
  key: string;
  promise: Promise<SignedReadResolution>;
  settled: boolean;
};

let pendingReads: PendingRead[] = [];
let readFlushQueued = false;
let activeCacheBoundary = "";
let productImageBoundaryGeneration = 0;
let cacheMutationTail: Promise<void> = Promise.resolve();
const activeProductImageObjectUrls = new Set<string>();
const signedUrlLeases = new Map<string, SignedUrlLease>();
const inFlightSignedReads = new Map<string, InFlightSignedRead>();
const inFlightBoundaryOperations = new Map<AbortController, number>();

function productImageBoundary(cacheScope: string, shopId: string) {
  return `${cacheScope}/${shopId}`;
}

function productImageBoundaryIsCurrent(
  cacheScope: string,
  shopId: string,
  boundaryGeneration: number,
) {
  return (
    boundaryGeneration === productImageBoundaryGeneration &&
    (activeCacheBoundary.length === 0 ||
      activeCacheBoundary === productImageBoundary(cacheScope, shopId))
  );
}

function assertProductImageBoundaryCurrent(
  cacheScope: string,
  shopId: string,
  boundaryGeneration: number,
) {
  if (!productImageBoundaryIsCurrent(cacheScope, shopId, boundaryGeneration)) {
    throw imageError("image_scope_changed");
  }
}

function beginProductImageBoundaryOperation(signal?: AbortSignal) {
  const controller = new AbortController();
  const boundaryGeneration = productImageBoundaryGeneration;
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });
  if (signal?.aborted) controller.abort();
  inFlightBoundaryOperations.set(controller, boundaryGeneration);

  return {
    boundaryGeneration,
    release() {
      signal?.removeEventListener("abort", forwardAbort);
      inFlightBoundaryOperations.delete(controller);
    },
    signal: controller.signal,
  };
}

class BoundedScheduler {
  private active = 0;
  private readonly limit: number;
  private readonly queue: Array<{ start: () => void }> = [];

  constructor(limit: number) {
    this.limit = limit;
  }

  async run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) {
      throw imageError("image_operation_cancelled");
    }
    await new Promise<void>((resolve, reject) => {
      let queued = false;
      const cancelQueued = () => {
        if (!queued) return;
        queued = false;
        const index = this.queue.findIndex((item) => item.start === start);
        if (index >= 0) this.queue.splice(index, 1);
        signal?.removeEventListener("abort", cancelQueued);
        reject(imageError("image_operation_cancelled"));
      };
      const start = () => {
        queued = false;
        signal?.removeEventListener("abort", cancelQueued);
        if (signal?.aborted) {
          reject(imageError("image_operation_cancelled"));
          return;
        }
        this.active += 1;
        resolve();
      };
      if (this.active < this.limit) {
        start();
      } else {
        queued = true;
        this.queue.push({ start });
        signal?.addEventListener("abort", cancelQueued, { once: true });
      }
    });
    try {
      return await operation();
    } finally {
      this.active -= 1;
      this.pump();
    }
  }

  private pump() {
    while (this.active < this.limit && this.queue.length > 0) {
      this.queue.shift()?.start();
    }
  }
}

const readScheduler = new BoundedScheduler(READ_REQUEST_CONCURRENCY);
const downloadScheduler = new BoundedScheduler(
  PRODUCT_IMAGE_DOWNLOAD_CONCURRENCY,
);

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

function isProductImageMetadata(
  value: unknown,
  variant: ProductImageVariant,
): value is ProductImageMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const maxBytes = variant === "main" ? MAIN_MAX_BYTES : THUMB_MAX_BYTES;
  const maxSide = variant === "main" ? MAIN_MAX_SIDE : THUMB_MAX_SIDE;
  return (
    candidate.mimeType === "image/jpeg" &&
    typeof candidate.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(candidate.sha256) &&
    typeof candidate.bytes === "number" &&
    Number.isSafeInteger(candidate.bytes) &&
    candidate.bytes >= 1 &&
    candidate.bytes <= maxBytes &&
    typeof candidate.width === "number" &&
    Number.isSafeInteger(candidate.width) &&
    candidate.width >= 1 &&
    candidate.width <= maxSide &&
    typeof candidate.height === "number" &&
    Number.isSafeInteger(candidate.height) &&
    candidate.height >= 1 &&
    candidate.height <= maxSide
  );
}

function readResponseItemMatchesRef(
  value: unknown,
  ref: ProductImageRef,
): value is ReadResponseItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (
    item.productId !== ref.productId ||
    item.versionId !== ref.versionId ||
    item.variant !== ref.variant
  ) {
    return false;
  }
  if (item.status === "not_found") {
    return item.signedUrl === undefined && item.metadata === undefined;
  }
  return (
    item.status === "ready" &&
    typeof item.signedUrl === "string" &&
    item.signedUrl.length > 0 &&
    typeof item.expiresAt === "string" &&
    Number.isFinite(Date.parse(item.expiresAt)) &&
    isProductImageMetadata(item.metadata, ref.variant)
  );
}

async function sniffInput(file: File) {
  if (file.type !== "image/jpeg" && file.type !== "image/png") {
    throw imageError("image_input_format_unsupported");
  }
  const dimensions = await preflightInputImageDimensions(
    file,
    MAX_INPUT_PIXELS,
  );
  if (!dimensions) throw imageError("image_dimensions_invalid");
  return dimensions;
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

  const objectUrl = createProductImageObjectUrl(file);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;
  try {
    await image.decode();
  } catch {
    releaseProductImageObjectUrl(objectUrl);
    throw imageError("image_decode_failed");
  }

  return {
    dispose: () => releaseProductImageObjectUrl(objectUrl),
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
  const maximum = Math.min(input.initialMaxSide, sourceLongestSide);
  const sides =
    maximum <= input.minimumSide || sourceLongestSide < input.minimumSide
      ? [maximum]
      : Array.from(
          new Set([
            ...OUTPUT_SIDE_FACTORS.map((factor) =>
              Math.max(input.minimumSide, Math.floor(maximum * factor)),
            ),
            input.minimumSide,
          ]),
        ).filter((side) => side <= maximum);
  let fallback: { blob: Blob; maximumSide: number } | null = null;

  for (const maximumSide of sides) {
    const canvas = renderCanvas(input.decoded, maximumSide);
    for (const quality of input.qualities) {
      const blob = await encodeCanvas(canvas, quality);
      if (
        blob.size <= input.hardMaxBytes &&
        (!fallback || blob.size < fallback.blob.size)
      ) {
        fallback = { blob, maximumSide };
      }
      if (blob.size <= input.targetBytes) {
        return { blob, canvas };
      }
    }
    canvas.width = 1;
    canvas.height = 1;
  }

  if (fallback && fallback.blob.size <= input.hardMaxBytes) {
    return {
      blob: fallback.blob,
      canvas: renderCanvas(input.decoded, fallback.maximumSide),
    };
  }
  throw imageError("image_output_budget_exceeded");
}

async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
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

async function prepareProductImageOnMainThread(
  file: File,
): Promise<PreparedProductImage> {
  const pipelineStartedAt = performance.now();
  const decodeStartedAt = performance.now();
  const decoded = await decodeInput(file);
  const decodeAndValidateMs = performance.now() - decodeStartedAt;
  let decodedReleased = false;
  let mainCanvas: HTMLCanvasElement | null = null;
  let thumbCanvas: HTMLCanvasElement | null = null;
  try {
    const mainStartedAt = performance.now();
    const main = await encodeWithinBudget({
      decoded,
      hardMaxBytes: MAIN_MAX_BYTES,
      initialMaxSide: MAIN_MAX_SIDE,
      minimumSide: 640,
      qualities: [0.82, 0.76, 0.7],
      targetBytes: MAIN_TARGET_BYTES,
    });
    const mainEncodeMs = performance.now() - mainStartedAt;
    mainCanvas = main.canvas;
    decoded.dispose();
    decodedReleased = true;
    const thumbStartedAt = performance.now();
    const thumb = await encodeWithinBudget({
      decoded: {
        dispose: () => undefined,
        height: main.canvas.height,
        source: main.canvas,
        width: main.canvas.width,
      },
      hardMaxBytes: THUMB_MAX_BYTES,
      initialMaxSide: THUMB_MAX_SIDE,
      minimumSide: 128,
      qualities: [0.75, 0.68, 0.6, 0.52],
      targetBytes: THUMB_MAX_BYTES,
    });
    const thumbEncodeMs = performance.now() - thumbStartedAt;
    thumbCanvas = thumb.canvas;
    const metadataStartedAt = performance.now();
    const [mainMetadata, thumbMetadata] = await Promise.all([
      metadata(main.blob, main.canvas),
      metadata(thumb.blob, thumb.canvas),
    ]);
    const metadataHashMs = performance.now() - metadataStartedAt;

    return {
      main: { blob: main.blob, metadata: mainMetadata },
      thumb: { blob: thumb.blob, metadata: thumbMetadata },
      timing: {
        browserTotalMs: 0,
        decodeAndValidateMs,
        mainEncodeMs,
        metadataHashMs,
        pipelineMs: performance.now() - pipelineStartedAt,
        runtime: "main-thread",
        thumbEncodeMs,
      },
    };
  } finally {
    if (!decodedReleased) decoded.dispose();
    if (mainCanvas) {
      mainCanvas.width = 1;
      mainCanvas.height = 1;
    }
    if (thumbCanvas) {
      thumbCanvas.width = 1;
      thumbCanvas.height = 1;
    }
  }
}

type WorkerPreparedMessage =
  | {
      main: { bytes: ArrayBuffer; metadata: ProductImageMetadata };
      ok: true;
      thumb: { bytes: ArrayBuffer; metadata: ProductImageMetadata };
      timing: Omit<ProductImagePreprocessTiming, "browserTotalMs" | "runtime">;
    }
  | { code: string; ok: false };

async function prepareProductImageInWorker(file: File, signal?: AbortSignal) {
  return new Promise<PreparedProductImage>((resolve, reject) => {
    const worker = new Worker(
      new URL("./product-image-worker.ts", import.meta.url),
      {
        type: "module",
      },
    );
    let settled = false;
    const finish = (operation: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", cancel);
      worker.terminate();
      operation();
    };
    const cancel = () =>
      finish(() => reject(imageError("image_operation_cancelled")));
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) {
      cancel();
      return;
    }
    worker.onerror = () =>
      finish(() => reject(imageError("image_worker_failed")));
    worker.onmessage = (event: MessageEvent<WorkerPreparedMessage>) => {
      const message = event.data;
      if (!message.ok) {
        finish(() => reject(imageError(message.code)));
        return;
      }
      finish(() =>
        resolve({
          main: {
            blob: new Blob([message.main.bytes], { type: "image/jpeg" }),
            metadata: message.main.metadata,
          },
          thumb: {
            blob: new Blob([message.thumb.bytes], { type: "image/jpeg" }),
            metadata: message.thumb.metadata,
          },
          timing: {
            browserTotalMs: 0,
            ...message.timing,
            runtime: "worker",
          },
        }),
      );
    };
    worker.postMessage({ file });
  });
}

export async function prepareProductImage(
  file: File,
  options: ProductImageOperationOptions = {},
): Promise<PreparedProductImage> {
  const startedAt = performance.now();
  options.onProgress?.("preprocess");
  try {
    if (options.signal?.aborted) {
      throw imageError("image_operation_cancelled");
    }
    if (
      typeof Worker !== "undefined" &&
      typeof OffscreenCanvas !== "undefined" &&
      typeof createImageBitmap === "function"
    ) {
      const prepared = await prepareProductImageInWorker(file, options.signal);
      prepared.timing.browserTotalMs = performance.now() - startedAt;
      return prepared;
    }
    const prepared = await prepareProductImageOnMainThread(file);
    prepared.timing.browserTotalMs = performance.now() - startedAt;
    return prepared;
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

function leaseKey(cacheScope: string, ref: ProductImageRef) {
  return `${cacheScope}:${readKey(ref)}`;
}

function leaseIsUsable(lease: SignedUrlLease) {
  return Date.now() < lease.expiresAtMs - PRODUCT_IMAGE_SIGNED_URL_SAFETY_MS;
}

function rememberSignedUrlLease(
  cacheScope: string,
  ref: ProductImageRef,
  item: ReadResponseItem,
  boundaryGeneration: number,
) {
  if (
    item.status !== "ready" ||
    !item.signedUrl ||
    !item.expiresAt ||
    !CACHE_SCOPE_PATTERN.test(cacheScope) ||
    !productImageBoundaryIsCurrent(
      cacheScope,
      ref.shopId,
      boundaryGeneration,
    )
  ) {
    return;
  }
  const expiresAtMs = Date.parse(item.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return;
  const key = leaseKey(cacheScope, ref);
  signedUrlLeases.delete(key);
  signedUrlLeases.set(key, {
    cacheScope,
    expiresAtMs,
    item,
    lastAccessedAt: Date.now(),
  });
  while (signedUrlLeases.size > PRODUCT_IMAGE_SIGNED_URL_MAX_ENTRIES) {
    const oldest = signedUrlLeases.keys().next().value;
    if (typeof oldest !== "string") break;
    signedUrlLeases.delete(oldest);
  }
}

function readSignedUrlLease(
  cacheScope: string | undefined,
  ref: ProductImageRef,
  boundaryGeneration: number,
) {
  if (!cacheScope || !CACHE_SCOPE_PATTERN.test(cacheScope)) return null;
  if (!productImageBoundaryIsCurrent(cacheScope, ref.shopId, boundaryGeneration)) {
    return null;
  }
  const key = leaseKey(cacheScope, ref);
  const lease = signedUrlLeases.get(key);
  if (!lease || !leaseIsUsable(lease)) {
    signedUrlLeases.delete(key);
    return null;
  }
  lease.lastAccessedAt = Date.now();
  signedUrlLeases.delete(key);
  signedUrlLeases.set(key, lease);
  return { cacheScope: lease.cacheScope, item: lease.item };
}

function invalidateSignedUrlLease(
  cacheScope: string | undefined,
  ref: ProductImageRef,
) {
  if (cacheScope && CACHE_SCOPE_PATTERN.test(cacheScope)) {
    signedUrlLeases.delete(leaseKey(cacheScope, ref));
  }
}

function purgeSignedUrlLeases(input: {
  cacheScope?: string;
  keepVersionId?: string;
  productId?: string;
  shopId?: string;
}) {
  for (const [key, lease] of signedUrlLeases) {
    const parts = key.split(":");
    const [, shopId, productId, versionId] = parts;
    if (input.cacheScope && lease.cacheScope !== input.cacheScope) {
      signedUrlLeases.delete(key);
      continue;
    }
    if (input.shopId && shopId !== input.shopId) continue;
    if (input.productId && productId !== input.productId) continue;
    if (input.keepVersionId && versionId === input.keepVersionId) continue;
    signedUrlLeases.delete(key);
  }
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

function jpegMarkersAreValid(bytes: Uint8Array) {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  );
}

async function validateDecodedProductImage(
  blob: Blob,
  variant: ProductImageVariant,
  expected?: ProductImageMetadata,
): Promise<ProductImageMetadata> {
  const maxBytes = variant === "main" ? MAIN_MAX_BYTES : THUMB_MAX_BYTES;
  const maxSide = variant === "main" ? MAIN_MAX_SIDE : THUMB_MAX_SIDE;
  if (blob.type !== "image/jpeg" || blob.size < 1 || blob.size > maxBytes) {
    throw imageError("image_download_invalid");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!jpegMarkersAreValid(bytes)) {
    throw imageError("image_download_invalid");
  }

  let decodedWidth = 0;
  let decodedHeight = 0;
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      decodedWidth = bitmap.width;
      decodedHeight = bitmap.height;
      bitmap.close();
    } catch {
      // Fall through to a stable, redacted decode error.
      throw imageError("image_download_invalid");
    }
  } else if (typeof Image !== "undefined") {
    const objectUrl = createProductImageObjectUrl(blob);
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    try {
      await image.decode();
      decodedWidth = image.naturalWidth;
      decodedHeight = image.naturalHeight;
    } catch {
      throw imageError("image_download_invalid");
    } finally {
      releaseProductImageObjectUrl(objectUrl);
    }
  } else {
    throw imageError("image_download_invalid");
  }

  if (
    !Number.isSafeInteger(decodedWidth) ||
    !Number.isSafeInteger(decodedHeight) ||
    decodedWidth < 1 ||
    decodedHeight < 1 ||
    decodedWidth > maxSide ||
    decodedHeight > maxSide
  ) {
    throw imageError("image_download_invalid");
  }

  const observed: ProductImageMetadata = {
    bytes: blob.size,
    height: decodedHeight,
    mimeType: "image/jpeg",
    sha256: await sha256(blob),
    width: decodedWidth,
  };
  if (
    expected &&
    (observed.bytes !== expected.bytes ||
      observed.height !== expected.height ||
      observed.mimeType !== expected.mimeType ||
      observed.sha256 !== expected.sha256 ||
      observed.width !== expected.width)
  ) {
    throw imageError("image_download_metadata_mismatch");
  }
  return observed;
}

async function readBoundedProductImageResponse(
  response: Response,
  variant: ProductImageVariant,
  signal?: AbortSignal,
) {
  const maxBytes = variant === "main" ? MAIN_MAX_BYTES : THUMB_MAX_BYTES;
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 1 ||
      parsedLength > maxBytes
    ) {
      await response.body?.cancel();
      throw imageError("image_download_invalid");
    }
  }
  const contentType = response.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "image/jpeg" || !response.body) {
    await response.body?.cancel();
    throw imageError("image_download_invalid");
  }

  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let total = 0;
  const cancel = () => {
    void reader.cancel();
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (signal?.aborted) {
      await reader.cancel();
      throw imageError("image_operation_cancelled");
    }
    while (true) {
      if (signal?.aborted) {
        throw imageError("image_operation_cancelled");
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw imageError("image_download_invalid");
      }
      chunks.push(new Uint8Array(value).buffer);
    }
    if (signal?.aborted) {
      throw imageError("image_operation_cancelled");
    }
    if (total < 1) {
      throw imageError("image_download_invalid");
    }
    return new Blob(chunks, { type: "image/jpeg" });
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

async function withCacheMutation<T>(operation: () => Promise<T>) {
  let release: () => void = () => {};
  const previous = cacheMutationTail;
  cacheMutationTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

function cacheResponse(
  blob: Blob,
  metadata: ProductImageMetadata,
  accessedAt = Date.now(),
) {
  return new Response(blob, {
    headers: {
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Length": String(blob.size),
      "Content-Type": "image/jpeg",
      "X-MC-Image-Accessed-At": String(accessedAt),
      "X-MC-Image-Bytes": String(blob.size),
      "X-MC-Image-Height": String(metadata.height),
      "X-MC-Image-Mime-Type": metadata.mimeType,
      "X-MC-Image-SHA256": metadata.sha256,
      "X-MC-Image-Width": String(metadata.width),
    },
  });
}

function cachedMetadata(
  response: Response,
  variant: ProductImageVariant,
): ProductImageMetadata | null {
  const metadata = {
    bytes: Number(response.headers.get("X-MC-Image-Bytes")),
    height: Number(response.headers.get("X-MC-Image-Height")),
    mimeType: response.headers.get("X-MC-Image-Mime-Type"),
    sha256: response.headers.get("X-MC-Image-SHA256"),
    width: Number(response.headers.get("X-MC-Image-Width")),
  };
  return isProductImageMetadata(metadata, variant) ? metadata : null;
}

async function inspectProductImageCache(cache: Cache) {
  const entries: Array<{
    accessedAt: number;
    bytes: number;
    request: Request;
  }> = [];
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (!response) continue;
    const headerBytes = Number(response.headers.get("X-MC-Image-Bytes"));
    const bytes =
      Number.isSafeInteger(headerBytes) && headerBytes >= 0
        ? headerBytes
        : (await response.blob()).size;
    const headerAccessedAt = Number(
      response.headers.get("X-MC-Image-Accessed-At"),
    );
    entries.push({
      accessedAt: Number.isFinite(headerAccessedAt) ? headerAccessedAt : 0,
      bytes,
      request,
    });
  }
  return entries;
}

async function evictProductImageCache(cache: Cache, protectedUrl?: string) {
  const entries = await inspectProductImageCache(cache);
  let totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  let totalEntries = entries.length;
  const evictionOrder = entries
    .filter((entry) => entry.request.url !== protectedUrl)
    .sort((left, right) => left.accessedAt - right.accessedAt);
  for (const entry of evictionOrder) {
    if (
      totalEntries <= PRODUCT_IMAGE_CACHE_MAX_ENTRIES &&
      totalBytes <= PRODUCT_IMAGE_CACHE_MAX_BYTES
    ) {
      break;
    }
    if (await cache.delete(entry.request)) {
      totalEntries -= 1;
      totalBytes = Math.max(0, totalBytes - entry.bytes);
    }
  }
  return { totalBytes, totalEntries };
}

async function readCachedBlob(
  cacheScope: string,
  ref: ProductImageRef,
  boundaryGeneration: number,
) {
  if (!("caches" in window)) {
    return null;
  }
  assertProductImageBoundaryCurrent(
    cacheScope,
    ref.shopId,
    boundaryGeneration,
  );
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(cacheRequest(cacheScope, ref));
  if (!response) {
    return null;
  }
  const expected = cachedMetadata(response, ref.variant);
  if (!expected) {
    await cache.delete(cacheRequest(cacheScope, ref));
    return null;
  }
  const blob = await response.blob();
  try {
    await validateDecodedProductImage(blob, ref.variant, expected);
  } catch {
    await cache.delete(cacheRequest(cacheScope, ref));
    return null;
  }
  assertProductImageBoundaryCurrent(
    cacheScope,
    ref.shopId,
    boundaryGeneration,
  );
  try {
    await withCacheMutation(async () => {
      assertProductImageBoundaryCurrent(
        cacheScope,
        ref.shopId,
        boundaryGeneration,
      );
      await cache.put(
        cacheRequest(cacheScope, ref),
        cacheResponse(blob, expected),
      );
      if (!productImageBoundaryIsCurrent(
        cacheScope,
        ref.shopId,
        boundaryGeneration,
      )) {
        await cache.delete(cacheRequest(cacheScope, ref));
        throw imageError("image_scope_changed");
      }
      await evictProductImageCache(cache, cacheRequest(cacheScope, ref).url);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "image_scope_changed") {
      throw error;
    }
    // A valid offline hit remains usable even when best-effort LRU touch fails.
  }
  return blob;
}

export async function cacheProductImageBlob(
  cacheScope: string,
  ref: ProductImageRef,
  blob: Blob,
  expected: ProductImageMetadata,
  boundaryGeneration = productImageBoundaryGeneration,
) {
  if (!("caches" in window)) {
    return;
  }
  const maxBytes = ref.variant === "main" ? MAIN_MAX_BYTES : THUMB_MAX_BYTES;
  if (blob.type !== "image/jpeg" || blob.size < 1 || blob.size > maxBytes) {
    throw imageError("image_cache_blob_invalid");
  }
  assertProductImageBoundaryCurrent(
    cacheScope,
    ref.shopId,
    boundaryGeneration,
  );
  await validateDecodedProductImage(blob, ref.variant, expected);
  assertProductImageBoundaryCurrent(
    cacheScope,
    ref.shopId,
    boundaryGeneration,
  );
  await withCacheMutation(async () => {
    assertProductImageBoundaryCurrent(
      cacheScope,
      ref.shopId,
      boundaryGeneration,
    );
    const cache = await caches.open(CACHE_NAME);
    const request = cacheRequest(cacheScope, ref);
    await cache.put(request, cacheResponse(blob, expected));
    if (!productImageBoundaryIsCurrent(
      cacheScope,
      ref.shopId,
      boundaryGeneration,
    )) {
      await cache.delete(request);
      throw imageError("image_scope_changed");
    }
    await evictProductImageCache(cache, request.url);
  });
}

export async function activateProductImageCacheScope(input: {
  cacheScope?: string;
  shopId?: string;
}) {
  if (
    !input.cacheScope ||
    !CACHE_SCOPE_PATTERN.test(input.cacheScope) ||
    !input.shopId ||
    !UUID_PATTERN.test(input.shopId)
  ) {
    return;
  }
  const boundary = `${input.cacheScope}/${input.shopId}`;
  if (activeCacheBoundary === boundary) return;
  activeCacheBoundary = boundary;
  productImageBoundaryGeneration += 1;
  const activationGeneration = productImageBoundaryGeneration;
  for (const [controller, boundaryGeneration] of inFlightBoundaryOperations) {
    if (boundaryGeneration !== activationGeneration) {
      inFlightBoundaryOperations.delete(controller);
      controller.abort();
    }
  }
  for (const [key, entry] of inFlightImageLoads) {
    if (entry.boundaryGeneration !== activationGeneration) {
      inFlightImageLoads.delete(key);
      entry.controller.abort();
    }
  }
  for (const pending of pendingReads) {
    if (pending.boundaryGeneration !== activationGeneration) {
      pending.reject(imageError("image_scope_changed"));
    }
  }
  pendingReads = pendingReads.filter(
    (pending) => pending.boundaryGeneration === activationGeneration,
  );
  for (const [key, entry] of inFlightSignedReads) {
    if (entry.boundaryGeneration !== activationGeneration) {
      inFlightSignedReads.delete(key);
      entry.controller.abort();
    }
  }
  for (const [key, lease] of signedUrlLeases) {
    if (
      lease.cacheScope !== input.cacheScope ||
      !key.includes(`:${input.shopId}:`)
    ) {
      signedUrlLeases.delete(key);
    }
  }
  if ("caches" in window) {
    await withCacheMutation(async () => {
      if (!productImageBoundaryIsCurrent(
        input.cacheScope!,
        input.shopId!,
        activationGeneration,
      )) {
        return;
      }
      const cache = await caches.open(CACHE_NAME);
      const keys = await cache.keys();
      const keepPrefix = `/__task137-product-image-cache/${boundary}/`;
      for (const key of keys) {
        if (!productImageBoundaryIsCurrent(
          input.cacheScope!,
          input.shopId!,
          activationGeneration,
        )) {
          return;
        }
        if (!new URL(key.url).pathname.startsWith(keepPrefix)) {
          await cache.delete(key);
        }
      }
      await evictProductImageCache(cache);
    });
  }
}

export async function purgeProductImageCache(input: {
  boundaryGeneration?: number;
  cacheScope: string;
  keepVersionId?: string;
  productId: string;
  shopId: string;
}) {
  if (!CACHE_SCOPE_PATTERN.test(input.cacheScope)) {
    return;
  }
  const boundaryGeneration =
    input.boundaryGeneration ?? productImageBoundaryGeneration;
  assertProductImageBoundaryCurrent(
    input.cacheScope,
    input.shopId,
    boundaryGeneration,
  );
  try {
    if ("caches" in window) {
      await withCacheMutation(async () => {
        assertProductImageBoundaryCurrent(
          input.cacheScope,
          input.shopId,
          boundaryGeneration,
        );
        const cache = await caches.open(CACHE_NAME);
        const keys = await cache.keys();
        const prefix = `/__task137-product-image-cache/${input.cacheScope}/${input.shopId}/${input.productId}/`;
        for (const key of keys) {
          assertProductImageBoundaryCurrent(
            input.cacheScope,
            input.shopId,
            boundaryGeneration,
          );
          const pathname = new URL(key.url).pathname;
          if (!pathname.startsWith(prefix)) {
            continue;
          }
          const versionId = pathname.slice(prefix.length).split("/")[0];
          if (!input.keepVersionId || versionId !== input.keepVersionId) {
            await cache.delete(key);
          }
        }
      });
    }
  } finally {
    purgeSignedUrlLeases(input);
  }
}

export async function getProductImageRuntimeStats() {
  let cacheBytes = 0;
  let cacheEntries = 0;
  if (typeof window !== "undefined" && "caches" in window) {
    const cache = await caches.open(CACHE_NAME);
    const entries = await inspectProductImageCache(cache);
    cacheBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    cacheEntries = entries.length;
  }
  let storageEstimate: { quota?: number; usage?: number } | undefined;
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      storageEstimate = { quota: estimate.quota, usage: estimate.usage };
    } catch {
      // Storage quota diagnostics are optional and must not break rendering.
    }
  }
  return {
    activeObjectUrls: activeProductImageObjectUrls.size,
    cacheBytes,
    cacheEntries,
    cacheMaxBytes: PRODUCT_IMAGE_CACHE_MAX_BYTES,
    cacheMaxEntries: PRODUCT_IMAGE_CACHE_MAX_ENTRIES,
    signedUrlLeases: signedUrlLeases.size,
    storageEstimate,
  };
}

export function releaseProductImageObjectUrl(objectUrl: string | null) {
  if (!objectUrl) return;
  activeProductImageObjectUrls.delete(objectUrl);
  URL.revokeObjectURL(objectUrl);
}

export function createProductImageObjectUrl(blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);
  activeProductImageObjectUrls.add(objectUrl);
  return objectUrl;
}

export function safeProductImageStorageUrl(
  value: string,
  mode: "read" | "upload",
  expected: ProductImageRef,
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
  const objectPath = url.pathname.startsWith(marker)
    ? url.pathname.slice(marker.length)
    : "";
  assertRef(expected);
  const expectedObjectPath =
    `shops/${expected.shopId.toLowerCase()}/products/` +
    `${expected.productId.toLowerCase()}/primary/` +
    `${expected.versionId.toLowerCase()}/${expected.variant}.jpg`;
  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.origin !== storageOrigin ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    objectPath !== expectedObjectPath
  ) {
    throw imageError("image_signed_url_invalid");
  }
  return url.toString();
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(path, {
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
  } catch {
    if (signal?.aborted) throw imageError("image_operation_cancelled");
    throw imageError("image_request_failed_network");
  }
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
  const batch = pendingReads.filter((pending) => !pending.signal?.aborted);
  for (const pending of pendingReads) {
    if (pending.signal?.aborted) {
      pending.reject(imageError("image_operation_cancelled"));
    }
  }
  pendingReads = [];
  const unique = new Map<
    string,
    { ref: ProductImageRef; waiters: PendingRead[] }
  >();

  for (const pending of batch) {
    const key = readKey(pending.ref);
    const row = unique.get(key) ?? { ref: pending.ref, waiters: [] };
    row.waiters.push(pending);
    unique.set(key, row);
  }

  const grouped = new Map<
    string,
    Array<{ ref: ProductImageRef; waiters: PendingRead[] }>
  >();
  for (const row of unique.values()) {
    const rows = grouped.get(row.ref.shopId) ?? [];
    rows.push(row);
    grouped.set(row.ref.shopId, rows);
  }

  await Promise.all(
    Array.from(grouped.entries()).flatMap(([shopId, rows]) => {
      const operations: Promise<void>[] = [];
      for (let offset = 0; offset < rows.length; offset += READ_BATCH_LIMIT) {
        const chunk = rows.slice(offset, offset + READ_BATCH_LIMIT);
        const controller = new AbortController();
        const signals = Array.from(
          new Set(
            chunk.flatMap((row) =>
              row.waiters.flatMap((waiter) =>
                waiter.signal ? [waiter.signal] : [],
              ),
            ),
          ),
        );
        const hasUncancellableWaiter = chunk.some((row) =>
          row.waiters.some((waiter) => !waiter.signal),
        );
        const abortWhenUnused = () => {
          if (
            !hasUncancellableWaiter &&
            signals.length > 0 &&
            signals.every((signal) => signal.aborted)
          ) {
            controller.abort();
          }
        };
        signals.forEach((signal) =>
          signal.addEventListener("abort", abortWhenUnused, { once: true }),
        );
        abortWhenUnused();
        operations.push(
          readScheduler
            .run(async () => {
              try {
                const response = await postJson<ReadResponse>(
                  "/api/shop/product-images/read-urls",
                  {
                    refs: chunk.map((row) => ({
                      productId: row.ref.productId,
                      variant: row.ref.variant,
                      versionId: row.ref.versionId,
                    })),
                    shopId,
                  },
                  controller.signal,
                );
                if (
                  response.ok !== true ||
                  !response.cacheScope ||
                  !CACHE_SCOPE_PATTERN.test(response.cacheScope) ||
                  !Array.isArray(response.items) ||
                  response.items.length !== chunk.length
                ) {
                  throw imageError("image_read_contract_invalid");
                }
                if (
                  response.items.some(
                    (item, index) =>
                      !chunk[index] ||
                      !readResponseItemMatchesRef(item, chunk[index].ref),
                  )
                ) {
                  throw imageError("image_read_contract_invalid");
                }
                for (const [index, row] of chunk.entries()) {
                  const item = response.items[index];
                  for (const pending of row.waiters) {
                    if (pending.signal?.aborted) {
                      pending.reject(imageError("image_operation_cancelled"));
                    } else if (item) {
                      if (productImageBoundaryIsCurrent(
                        response.cacheScope,
                        row.ref.shopId,
                        pending.boundaryGeneration,
                      )) {
                        rememberSignedUrlLease(
                          response.cacheScope,
                          row.ref,
                          item,
                          pending.boundaryGeneration,
                        );
                        pending.resolve({
                          cacheScope: response.cacheScope,
                          item,
                        });
                      } else {
                        pending.reject(imageError("image_scope_changed"));
                      }
                    } else {
                      pending.reject(imageError("image_read_contract_invalid"));
                    }
                  }
                }
              } catch (error) {
                const safeError =
                  error instanceof Error
                    ? error
                    : imageError("image_read_failed");
                chunk.forEach((row) =>
                  row.waiters.forEach(({ reject }) => reject(safeError)),
                );
              }
            }, controller.signal)
            .catch((error) => {
              const safeError =
                error instanceof Error
                  ? error
                  : imageError("image_read_failed");
              chunk.forEach((row) =>
                row.waiters.forEach(({ reject }) => reject(safeError)),
              );
            })
            .finally(() => {
              signals.forEach((signal) =>
                signal.removeEventListener("abort", abortWhenUnused),
              );
            }),
        );
      }
      return operations;
    }),
  );
}

function enqueueSignedRead(
  ref: ProductImageRef,
  signal: AbortSignal | undefined,
  boundaryGeneration: number,
) {
  assertRef(ref);
  return new Promise<{ cacheScope: string; item: ReadResponseItem }>(
    (resolve, reject) => {
      pendingReads.push({ boundaryGeneration, ref, reject, resolve, signal });
      if (!readFlushQueued) {
        readFlushQueued = true;
        queueMicrotask(() => {
          void flushPendingReads();
        });
      }
    },
  );
}

type SignedReadResolution = {
  cacheScope: string;
  item: ReadResponseItem;
};

async function consumeSignedRead(
  promise: Promise<SignedReadResolution>,
  signal?: AbortSignal,
) {
  if (!signal) return promise;
  if (signal.aborted) throw imageError("image_operation_cancelled");
  let abortListener: () => void = () => {};
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        abortListener = () => reject(imageError("image_operation_cancelled"));
        signal.addEventListener("abort", abortListener, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", abortListener);
  }
}

function createInFlightSignedRead(
  key: string,
  ref: ProductImageRef,
  boundaryGeneration: number,
) {
  const controller = new AbortController();
  const entry: InFlightSignedRead = {
    boundaryGeneration,
    consumers: 0,
    controller,
    key,
    promise: Promise.resolve(null as never),
    settled: false,
  };
  entry.promise = enqueueSignedRead(
    ref,
    controller.signal,
    boundaryGeneration,
  ).finally(() => {
    entry.settled = true;
    if (inFlightSignedReads.get(key) === entry) {
      inFlightSignedReads.delete(key);
    }
  });
  inFlightSignedReads.set(key, entry);
  return entry;
}

async function consumeInFlightSignedRead(
  entry: InFlightSignedRead,
  signal?: AbortSignal,
) {
  entry.consumers += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    entry.consumers = Math.max(0, entry.consumers - 1);
    if (entry.consumers === 0 && !entry.settled) {
      if (inFlightSignedReads.get(entry.key) === entry) {
        inFlightSignedReads.delete(entry.key);
      }
      entry.controller.abort();
    }
  };
  let abortListener: (() => void) | undefined;
  try {
    if (!signal) return await entry.promise;
    if (signal.aborted) throw imageError("image_operation_cancelled");
    return await Promise.race([
      entry.promise,
      new Promise<never>((_resolve, reject) => {
        abortListener = () => reject(imageError("image_operation_cancelled"));
        signal.addEventListener("abort", abortListener, { once: true });
      }),
    ]);
  } finally {
    if (abortListener) signal?.removeEventListener("abort", abortListener);
    release();
  }
}

function requestSignedRead(
  ref: ProductImageRef,
  signal?: AbortSignal,
  knownCacheScope?: string,
  forceRefresh = false,
  boundaryGeneration = productImageBoundaryGeneration,
) {
  assertRef(ref);
  if (forceRefresh) invalidateSignedUrlLease(knownCacheScope, ref);
  const cached = forceRefresh
    ? null
    : readSignedUrlLease(knownCacheScope, ref, boundaryGeneration);
  if (cached) return consumeSignedRead(Promise.resolve(cached), signal);

  const inFlightKey = `${boundaryGeneration}:${knownCacheScope ?? "unknown"}:${readKey(ref)}`;
  const entry =
    inFlightSignedReads.get(inFlightKey) ??
    createInFlightSignedRead(inFlightKey, ref, boundaryGeneration);
  return consumeInFlightSignedRead(entry, signal);
}

export async function downloadProductImageWithOneAuthRefresh(input: {
  download: (signedUrl: string) => Promise<Response>;
  invalidateSignedRead?: (resolved: SignedReadResolution) => void;
  ref: ProductImageRef;
  resolveSignedRead: (forceRefresh: boolean) => Promise<SignedReadResolution>;
  signal?: AbortSignal;
}) {
  assertRef(input.ref);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const resolved = await input.resolveSignedRead(attempt === 1);
    if (resolved.item.status !== "ready" || !resolved.item.signedUrl) {
      throw imageError("image_not_found");
    }

    const response = await input.download(resolved.item.signedUrl);
    if (!response.ok) {
      if (
        attempt === 0 &&
        (response.status === 401 || response.status === 403)
      ) {
        input.invalidateSignedRead?.(resolved);
        continue;
      }
      throw imageError(`image_download_failed_${response.status}`);
    }

    const blob = await readBoundedProductImageResponse(
      response,
      input.ref.variant,
      input.signal,
    );
    const metadata = await validateDecodedProductImage(
      blob,
      input.ref.variant,
      resolved.item.metadata,
    );
    return { blob, cacheScope: resolved.cacheScope, metadata };
  }

  throw imageError("image_download_failed");
}

type ProductImageBytesResult = {
  blob: Blob;
  boundaryGeneration: number;
  cacheScope: string;
  source: "cache" | "network";
};

type InFlightImageLoad = {
  boundaryGeneration: number;
  consumers: number;
  controller: AbortController;
  key: string;
  promise: Promise<ProductImageBytesResult>;
  settled: boolean;
};

const inFlightImageLoads = new Map<string, InFlightImageLoad>();

async function loadProductImageBytes(
  ref: ProductImageRef,
  knownCacheScope: string | undefined,
  signal: AbortSignal,
  boundaryGeneration: number,
): Promise<ProductImageBytesResult> {
  if (knownCacheScope && CACHE_SCOPE_PATTERN.test(knownCacheScope)) {
    const cached = await readCachedBlob(
      knownCacheScope,
      ref,
      boundaryGeneration,
    );
    if (cached) {
      if (signal.aborted) throw imageError("image_operation_cancelled");
      assertProductImageBoundaryCurrent(
        knownCacheScope,
        ref.shopId,
        boundaryGeneration,
      );
      return {
        blob: cached,
        boundaryGeneration,
        cacheScope: knownCacheScope,
        source: "cache",
      };
    }
  }
  if (signal.aborted) throw imageError("image_operation_cancelled");
  if (navigator.onLine === false) {
    throw imageError("image_offline_not_cached");
  }

  const downloaded = await downloadProductImageWithOneAuthRefresh({
    download: (signedUrl) =>
      downloadScheduler.run(
        () =>
          fetch(safeProductImageStorageUrl(signedUrl, "read", ref), {
            cache: "no-store",
            credentials: "omit",
            signal,
          }),
        signal,
      ),
    ref,
    signal,
    invalidateSignedRead: (resolved) =>
      invalidateSignedUrlLease(resolved.cacheScope, ref),
    resolveSignedRead: (forceRefresh) =>
      requestSignedRead(
        ref,
        signal,
        knownCacheScope,
        forceRefresh,
        boundaryGeneration,
      ),
  });
  if (signal.aborted) throw imageError("image_operation_cancelled");
  assertProductImageBoundaryCurrent(
    downloaded.cacheScope,
    ref.shopId,
    boundaryGeneration,
  );
  await cacheProductImageBlob(
    downloaded.cacheScope,
    ref,
    downloaded.blob,
    downloaded.metadata,
    boundaryGeneration,
  );
  await purgeProductImageCache({
    boundaryGeneration,
    cacheScope: downloaded.cacheScope,
    keepVersionId: ref.versionId,
    productId: ref.productId,
    shopId: ref.shopId,
  });
  if (signal.aborted) throw imageError("image_operation_cancelled");
  assertProductImageBoundaryCurrent(
    downloaded.cacheScope,
    ref.shopId,
    boundaryGeneration,
  );
  return {
    blob: downloaded.blob,
    boundaryGeneration,
    cacheScope: downloaded.cacheScope,
    source: "network",
  };
}

function createInFlightImageLoad(
  key: string,
  ref: ProductImageRef,
  boundaryGeneration: number,
  knownCacheScope?: string,
) {
  const controller = new AbortController();
  const entry: InFlightImageLoad = {
    boundaryGeneration,
    consumers: 0,
    controller,
    key,
    promise: Promise.resolve(null as never),
    settled: false,
  };
  entry.promise = loadProductImageBytes(
    ref,
    knownCacheScope,
    controller.signal,
    boundaryGeneration,
  ).finally(() => {
    entry.settled = true;
    if (inFlightImageLoads.get(key) === entry) {
      inFlightImageLoads.delete(key);
    }
  });
  inFlightImageLoads.set(key, entry);
  return entry;
}

async function consumeInFlightImageLoad(
  entry: InFlightImageLoad,
  signal?: AbortSignal,
) {
  entry.consumers += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    entry.consumers = Math.max(0, entry.consumers - 1);
    if (entry.consumers === 0 && !entry.settled) {
      if (inFlightImageLoads.get(entry.key) === entry) {
        inFlightImageLoads.delete(entry.key);
      }
      entry.controller.abort();
    }
  };
  let abortListener: (() => void) | undefined;
  try {
    if (!signal) return await entry.promise;
    if (signal.aborted) throw imageError("image_operation_cancelled");
    return await Promise.race([
      entry.promise,
      new Promise<never>((_resolve, reject) => {
        abortListener = () => reject(imageError("image_operation_cancelled"));
        signal.addEventListener("abort", abortListener, { once: true });
      }),
    ]);
  } finally {
    if (abortListener) signal?.removeEventListener("abort", abortListener);
    release();
  }
}

export async function loadProductImage(
  ref: ProductImageRef,
  knownCacheScope?: string,
  signal?: AbortSignal,
): Promise<ProductImageLoadResult> {
  assertRef(ref);
  const normalizedScope =
    knownCacheScope && CACHE_SCOPE_PATTERN.test(knownCacheScope)
      ? knownCacheScope
      : undefined;
  const boundaryGeneration = productImageBoundaryGeneration;
  const key = `${boundaryGeneration}:${normalizedScope ?? "unknown"}:${readKey(ref)}`;
  const entry =
    inFlightImageLoads.get(key) ??
    createInFlightImageLoad(
      key,
      ref,
      boundaryGeneration,
      normalizedScope,
    );
  const loaded = await consumeInFlightImageLoad(entry, signal);
  assertProductImageBoundaryCurrent(
    loaded.cacheScope,
    ref.shopId,
    loaded.boundaryGeneration,
  );
  return {
    cacheScope: loaded.cacheScope,
    objectUrl: createProductImageObjectUrl(loaded.blob),
    source: loaded.source,
  };
}

async function putSignedJpeg(
  url: string,
  blob: Blob,
  expected: ProductImageRef,
  signal?: AbortSignal,
) {
  if (blob.type !== "image/jpeg") throw imageError("image_upload_invalid");
  const uploadUrl = safeProductImageStorageUrl(url, "upload", expected);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", blob, "image.jpg");
    let response: Response;
    try {
      response = await fetch(uploadUrl, {
        body,
        cache: "no-store",
        credentials: "omit",
        headers: {
          "x-upsert": "false",
        },
        method: "PUT",
        signal,
      });
    } catch {
      if (signal?.aborted) throw imageError("image_operation_cancelled");
      if (attempt === 0) continue;
      throw imageError("image_upload_failed");
    }
    if (response.ok) return;
    if (attempt === 0 && response.status >= 500 && response.status <= 599) {
      continue;
    }
    throw imageError("image_upload_failed");
  }
  throw imageError("image_upload_failed");
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
  onProgress?: (stage: ProductImageOperationStage) => void;
  prepared: PreparedProductImage;
  productId: string;
  shopId: string;
  signal?: AbortSignal;
}) {
  const operation = beginProductImageBoundaryOperation(input.signal);
  const { boundaryGeneration } = operation;
  try {
  input.onProgress?.("intent");
  const intent = await postJson<IntentResponse>(
    "/api/shop/product-images/intent",
    {
      main: input.prepared.main.metadata,
      productId: input.productId,
      shopId: input.shopId,
      thumb: input.prepared.thumb.metadata,
    },
    operation.signal,
  );
  if (
    intent.ok !== true ||
    !intent.cacheScope ||
    !CACHE_SCOPE_PATTERN.test(intent.cacheScope) ||
    !intent.versionId ||
    !UUID_PATTERN.test(intent.versionId)
  ) {
    throw imageError("image_intent_contract_invalid");
  }
  assertProductImageBoundaryCurrent(
    intent.cacheScope,
    input.shopId,
    boundaryGeneration,
  );
  if (intent.status === "noop") {
    return {
      boundaryGeneration,
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

  input.onProgress?.("upload-main");
  assertProductImageBoundaryCurrent(
    intent.cacheScope,
    input.shopId,
    boundaryGeneration,
  );
  await putSignedJpeg(
    intent.mainUploadUrl,
    input.prepared.main.blob,
    {
      productId: input.productId,
      shopId: input.shopId,
      variant: "main",
      versionId: intent.versionId,
    },
    operation.signal,
  );
  assertProductImageBoundaryCurrent(
    intent.cacheScope,
    input.shopId,
    boundaryGeneration,
  );
  input.onProgress?.("upload-thumb");
  await putSignedJpeg(
    intent.thumbUploadUrl,
    input.prepared.thumb.blob,
    {
      productId: input.productId,
      shopId: input.shopId,
      variant: "thumb",
      versionId: intent.versionId,
    },
    operation.signal,
  );
  assertProductImageBoundaryCurrent(
    intent.cacheScope,
    input.shopId,
    boundaryGeneration,
  );
  input.onProgress?.("finalize");
  const finalized = await postJson<FinalizeResponse>(
    "/api/shop/product-images/finalize",
    {
      productId: input.productId,
      shopId: input.shopId,
      versionId: intent.versionId,
    },
    operation.signal,
  );
  if (
    finalized.ok !== true ||
    finalized.versionId !== intent.versionId ||
    (finalized.status !== "finalized" &&
      finalized.status !== "already_finalized")
  ) {
    throw imageError("image_finalize_contract_invalid");
  }
  assertProductImageBoundaryCurrent(
    intent.cacheScope,
    input.shopId,
    boundaryGeneration,
  );
  return {
    boundaryGeneration,
    cacheScope: intent.cacheScope,
    status: finalized.status,
    versionId: intent.versionId,
  };
  } finally {
    operation.release();
  }
}

export async function removeProductImage(input: {
  cacheScope: string;
  productId: string;
  shopId: string;
  signal?: AbortSignal;
  versionId: string;
}) {
  if (!CACHE_SCOPE_PATTERN.test(input.cacheScope)) {
    throw imageError("image_cache_scope_invalid");
  }
  const operation = beginProductImageBoundaryOperation(input.signal);
  try {
    assertProductImageBoundaryCurrent(
      input.cacheScope,
      input.shopId,
      operation.boundaryGeneration,
    );
  const response = await postJson<{
    currentImageVersionId?: null;
    ok?: boolean;
    operation?: string;
    productId?: string;
    shopId?: string;
    status?: string;
    versionId?: string;
  }>(
    "/api/shop/product-images/remove",
    {
      expectedVersionId: input.versionId,
      productId: input.productId,
      shopId: input.shopId,
    },
    operation.signal,
  );
  if (
    response.ok !== true ||
    response.operation !== "remove" ||
    response.productId !== input.productId ||
    response.shopId !== input.shopId ||
    response.versionId !== input.versionId ||
    response.currentImageVersionId !== null ||
    (response.status !== "removed" && response.status !== "already_removed")
  ) {
    throw imageError("image_remove_contract_invalid");
  }
  assertProductImageBoundaryCurrent(
    input.cacheScope,
    input.shopId,
    operation.boundaryGeneration,
  );
  return {
    boundaryGeneration: operation.boundaryGeneration,
    status: response.status,
  };
  } finally {
    operation.release();
  }
}
