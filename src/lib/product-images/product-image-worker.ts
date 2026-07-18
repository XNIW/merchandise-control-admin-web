const MAIN_MAX_SIDE = 1600;
const MAIN_TARGET_BYTES = 750 * 1024;
const MAIN_MAX_BYTES = 1024 * 1024;
const THUMB_MAX_SIDE = 384;
const THUMB_MAX_BYTES = 90 * 1024;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_INPUT_PIXELS = 64_000_000;

type Encoded = {
  blob: Blob;
  canvas: OffscreenCanvas;
  height: number;
  width: number;
};

type RasterSource = {
  height: number;
  source: CanvasImageSource;
  width: number;
};

const OUTPUT_SIDE_FACTORS = [1, 0.85, 0.72, 0.61, 0.52, 0.44, 0.4] as const;

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<{ file?: File }>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

function fail(code: string): never {
  const error = new Error(code);
  error.name = "ProductImageWorkerError";
  throw error;
}

async function assertInput(file: File) {
  if (file.size < 1 || file.size > MAX_INPUT_BYTES) {
    fail("image_input_size_invalid");
  }
  if (file.type !== "image/jpeg" && file.type !== "image/png") {
    fail("image_input_format_unsupported");
  }
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
  if (!jpeg && !png) fail("image_input_format_unsupported");
}

function outputDimensions(width: number, height: number, maximumSide: number) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    height > Math.floor(MAX_INPUT_PIXELS / width)
  ) {
    fail("image_dimensions_invalid");
  }
  const scale = Math.min(1, maximumSide / Math.max(width, height));
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  };
}

function releaseCanvas(canvas: OffscreenCanvas) {
  canvas.width = 1;
  canvas.height = 1;
}

function renderCanvas(image: RasterSource, maximumSide: number) {
  const dimensions = outputDimensions(image.width, image.height, maximumSide);
  const canvas = new OffscreenCanvas(dimensions.width, dimensions.height);
  const context = canvas.getContext("2d", {
    alpha: false,
    colorSpace: "srgb",
  });
  if (!context) fail("image_canvas_unavailable");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, dimensions.width, dimensions.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image.source, 0, 0, dimensions.width, dimensions.height);
  return { canvas, ...dimensions };
}

async function encodeCanvas(canvas: OffscreenCanvas, quality: number) {
  const blob = await canvas.convertToBlob({ quality, type: "image/jpeg" });
  if (blob.type !== "image/jpeg" || blob.size < 1) fail("image_encode_failed");
  return blob;
}

function outputSideSchedule(
  sourceLongestSide: number,
  initialMaximumSide: number,
  minimumSide: number,
) {
  const maximum = Math.min(sourceLongestSide, initialMaximumSide);
  if (maximum <= minimumSide || sourceLongestSide < minimumSide) {
    return [maximum];
  }
  return Array.from(
    new Set([
      ...OUTPUT_SIDE_FACTORS.map((factor) =>
        Math.max(minimumSide, Math.floor(maximum * factor)),
      ),
      minimumSide,
    ]),
  ).filter((side) => side <= maximum);
}

async function encodeWithinBudget(input: {
  hardMaxBytes: number;
  image: RasterSource;
  initialMaxSide: number;
  minimumSide: number;
  qualities: readonly number[];
  targetBytes: number;
}) {
  const sourceLongestSide = Math.max(input.image.width, input.image.height);
  let fallback: { blob: Blob; maximumSide: number } | null = null;
  const sides = outputSideSchedule(
    sourceLongestSide,
    input.initialMaxSide,
    input.minimumSide,
  );

  for (const maximumSide of sides) {
    const rendered = renderCanvas(input.image, maximumSide);
    for (const quality of input.qualities) {
      const blob = await encodeCanvas(rendered.canvas, quality);
      if (
        blob.size <= input.hardMaxBytes &&
        (!fallback || blob.size < fallback.blob.size)
      ) {
        fallback = { blob, maximumSide };
      }
      if (blob.size <= input.targetBytes) {
        return {
          blob,
          canvas: rendered.canvas,
          height: rendered.height,
          width: rendered.width,
        };
      }
    }
    releaseCanvas(rendered.canvas);
  }
  if (fallback && fallback.blob.size <= input.hardMaxBytes) {
    const rendered = renderCanvas(input.image, fallback.maximumSide);
    return {
      blob: fallback.blob,
      canvas: rendered.canvas,
      height: rendered.height,
      width: rendered.width,
    };
  }
  fail("image_output_budget_exceeded");
}

async function metadataAndBytes(encoded: Encoded) {
  const bytes = await encoded.blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return {
    bytes,
    metadata: {
      bytes: encoded.blob.size,
      height: encoded.height,
      mimeType: "image/jpeg" as const,
      sha256,
      width: encoded.width,
    },
  };
}

workerScope.onmessage = async (event: MessageEvent<{ file?: File }>) => {
  const pipelineStartedAt = performance.now();
  try {
    const file = event.data.file;
    if (!(file instanceof File)) fail("image_input_invalid");
    const decodeStartedAt = performance.now();
    await assertInput(file);
    let image: ImageBitmap;
    try {
      image = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      fail("image_decode_failed");
    }
    const decodeAndValidateMs = performance.now() - decodeStartedAt;
    let imageClosed = false;
    let main: Encoded | null = null;
    let thumb: Encoded | null = null;
    try {
      outputDimensions(image.width, image.height, MAIN_MAX_SIDE);
      const mainStartedAt = performance.now();
      main = await encodeWithinBudget({
        hardMaxBytes: MAIN_MAX_BYTES,
        image: { height: image.height, source: image, width: image.width },
        initialMaxSide: MAIN_MAX_SIDE,
        minimumSide: 640,
        qualities: [0.82, 0.76, 0.7],
        targetBytes: MAIN_TARGET_BYTES,
      });
      const mainEncodeMs = performance.now() - mainStartedAt;
      image.close();
      imageClosed = true;
      const thumbStartedAt = performance.now();
      thumb = await encodeWithinBudget({
        hardMaxBytes: THUMB_MAX_BYTES,
        image: {
          height: main.height,
          source: main.canvas,
          width: main.width,
        },
        initialMaxSide: THUMB_MAX_SIDE,
        minimumSide: 128,
        qualities: [0.75, 0.68, 0.6, 0.52],
        targetBytes: THUMB_MAX_BYTES,
      });
      const thumbEncodeMs = performance.now() - thumbStartedAt;
      const metadataStartedAt = performance.now();
      const [mainResult, thumbResult] = await Promise.all([
        metadataAndBytes(main),
        metadataAndBytes(thumb),
      ]);
      const metadataHashMs = performance.now() - metadataStartedAt;
      workerScope.postMessage(
        {
          main: mainResult,
          ok: true,
          thumb: thumbResult,
          timing: {
            decodeAndValidateMs,
            mainEncodeMs,
            metadataHashMs,
            pipelineMs: performance.now() - pipelineStartedAt,
            thumbEncodeMs,
          },
        },
        [mainResult.bytes, thumbResult.bytes],
      );
    } finally {
      if (!imageClosed) image.close();
      if (main) releaseCanvas(main.canvas);
      if (thumb) releaseCanvas(thumb.canvas);
    }
  } catch (error) {
    workerScope.postMessage({
      code:
        error instanceof Error && /^image_[a-z0-9_]+$/.test(error.message)
          ? error.message
          : "image_worker_failed",
      ok: false,
    });
  }
};

export {};
