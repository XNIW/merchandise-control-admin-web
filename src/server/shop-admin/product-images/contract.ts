export const PRODUCT_IMAGE_BUCKET = "product-images";
export const PRODUCT_IMAGE_JSON_BODY_LIMIT = 16 * 1024;
export const PRODUCT_IMAGE_MAIN_MAX_BYTES = 1024 * 1024;
export const PRODUCT_IMAGE_MAIN_MAX_SIDE = 1600;
export const PRODUCT_IMAGE_THUMB_MAX_BYTES = 90 * 1024;
export const PRODUCT_IMAGE_THUMB_MAX_SIDE = 384;
export const PRODUCT_IMAGE_READ_BATCH_LIMIT = 100;
export const PRODUCT_IMAGE_READ_URL_TTL_SECONDS = 5 * 60;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type ProductImageVariant = "main" | "thumb";

export type ProductImageUploadMetadata = {
  bytes: number;
  height: number;
  mimeType: "image/jpeg";
  sha256: string;
  width: number;
};

export type ProductImageIntentInput = {
  main: ProductImageUploadMetadata;
  productId: string;
  shopId: string;
  thumb: ProductImageUploadMetadata;
};

export type ProductImageFinalizeInput = {
  productId: string;
  shopId: string;
  versionId: string;
};

export type ProductImageRemoveInput = ProductImageFinalizeInput & {
  expectedVersionId: string;
};

export type ProductImageReadRef = {
  productId: string;
  variant: ProductImageVariant;
  versionId: string;
};

export type ProductImageReadInput = {
  refs: ProductImageReadRef[];
  shopId: string;
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function parseUploadMetadata(
  value: unknown,
  limits: { maxBytes: number; maxSide: number },
): ProductImageUploadMetadata | null {
  if (!isObject(value)) {
    return null;
  }

  if (
    typeof value.sha256 !== "string" ||
    !SHA256_PATTERN.test(value.sha256) ||
    value.mimeType !== "image/jpeg" ||
    !isIntegerInRange(value.bytes, 1, limits.maxBytes) ||
    !isIntegerInRange(value.width, 1, limits.maxSide) ||
    !isIntegerInRange(value.height, 1, limits.maxSide)
  ) {
    return null;
  }

  return {
    bytes: value.bytes,
    height: value.height,
    mimeType: "image/jpeg",
    sha256: value.sha256,
    width: value.width,
  };
}

export function parseProductImageIntentInput(
  value: unknown,
): ProductImageIntentInput | null {
  if (!isObject(value) || !isUuid(value.shopId) || !isUuid(value.productId)) {
    return null;
  }

  const main = parseUploadMetadata(value.main, {
    maxBytes: PRODUCT_IMAGE_MAIN_MAX_BYTES,
    maxSide: PRODUCT_IMAGE_MAIN_MAX_SIDE,
  });
  const thumb = parseUploadMetadata(value.thumb, {
    maxBytes: PRODUCT_IMAGE_THUMB_MAX_BYTES,
    maxSide: PRODUCT_IMAGE_THUMB_MAX_SIDE,
  });

  if (!main || !thumb) {
    return null;
  }

  const mainAspectRatio = main.width / main.height;
  const thumbAspectRatio = thumb.width / thumb.height;

  if (Math.abs(mainAspectRatio - thumbAspectRatio) > 0.02) {
    return null;
  }

  return {
    main,
    productId: value.productId,
    shopId: value.shopId,
    thumb,
  };
}

export function parseProductImageFinalizeInput(
  value: unknown,
): ProductImageFinalizeInput | null {
  if (
    !isObject(value) ||
    !isUuid(value.shopId) ||
    !isUuid(value.productId) ||
    !isUuid(value.versionId)
  ) {
    return null;
  }

  return {
    productId: value.productId,
    shopId: value.shopId,
    versionId: value.versionId,
  };
}

export function parseProductImageRemoveInput(
  value: unknown,
): ProductImageRemoveInput | null {
  if (
    !isObject(value) ||
    !isUuid(value.shopId) ||
    !isUuid(value.productId) ||
    !isUuid(value.expectedVersionId)
  ) {
    return null;
  }

  return {
    expectedVersionId: value.expectedVersionId,
    productId: value.productId,
    shopId: value.shopId,
    versionId: value.expectedVersionId,
  };
}

export function parseProductImageReadInput(
  value: unknown,
): ProductImageReadInput | null {
  if (
    !isObject(value) ||
    !isUuid(value.shopId) ||
    !Array.isArray(value.refs) ||
    value.refs.length < 1 ||
    value.refs.length > PRODUCT_IMAGE_READ_BATCH_LIMIT
  ) {
    return null;
  }

  const refs: ProductImageReadRef[] = [];

  for (const candidate of value.refs) {
    if (
      !isObject(candidate) ||
      !isUuid(candidate.productId) ||
      !isUuid(candidate.versionId) ||
      (candidate.variant !== "main" && candidate.variant !== "thumb")
    ) {
      return null;
    }

    refs.push({
      productId: candidate.productId,
      variant: candidate.variant,
      versionId: candidate.versionId,
    });
  }

  return { refs, shopId: value.shopId };
}

async function readBoundedBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();

  if (mediaType !== "application/json") {
    return null;
  }

  const contentLength = request.headers.get("content-length");

  if (contentLength) {
    const parsedLength = Number(contentLength);

    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > PRODUCT_IMAGE_JSON_BODY_LIMIT
    ) {
      return null;
    }
  }

  if (!request.body) {
    return null;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    total += value.byteLength;
    if (total > PRODUCT_IMAGE_JSON_BODY_LIMIT) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  if (total === 0) {
    return null;
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

export async function readProductImageJson(request: Request) {
  return readBoundedBody(request);
}

export function productImageJson(body: unknown, status = 200) {
  return Response.json(body, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
    status,
  });
}
