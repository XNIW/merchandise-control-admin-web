import { isPostgresUuid } from "../../shared/postgres-uuid.ts";

export const STOREFRONT_IMAGE_BUCKET = "storefront-product-images";
export const STOREFRONT_IMAGE_SOURCE_BUCKET = "product-images";
export const STOREFRONT_IMAGE_JSON_LIMIT = 32 * 1024;

export const STOREFRONT_IMAGE_LIMITS = {
  thumb: { maxBytes: 120 * 1024, maxSide: 384 },
  card: { maxBytes: 360 * 1024, maxSide: 960 },
  detail: { maxBytes: 900 * 1024, maxSide: 1600 },
} as const;

export type StorefrontImageVariant = keyof typeof STOREFRONT_IMAGE_LIMITS;
export type StorefrontImageMetadata = {
  bytes: number;
  height: number;
  mimeType: "image/webp";
  sha256: string;
  width: number;
};
export type StorefrontImageIntentInput = {
  publicationId: string;
  shopId: string;
  sourceImageVersionId: string;
  variants: Record<StorefrontImageVariant, StorefrontImageMetadata>;
};
export type StorefrontImageTargetInput = {
  imagePublicationId: string;
  shopId: string;
};
export type StorefrontImageSourceInput = {
  publicationId: string;
  shopId: string;
  sourceImageVersionId: string;
};

type JsonObject = Record<string, unknown>;
const SHA256 = /^[0-9a-f]{64}$/;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && isPostgresUuid(value);
}

function metadata(
  value: unknown,
  variant: StorefrontImageVariant,
): StorefrontImageMetadata | null {
  const item = object(value);
  const limits = STOREFRONT_IMAGE_LIMITS[variant];
  if (
    !item ||
    item.mimeType !== "image/webp" ||
    typeof item.sha256 !== "string" ||
    !SHA256.test(item.sha256) ||
    !Number.isSafeInteger(item.bytes) ||
    (item.bytes as number) < 1 ||
    (item.bytes as number) > limits.maxBytes ||
    !Number.isSafeInteger(item.width) ||
    (item.width as number) < 1 ||
    (item.width as number) > limits.maxSide ||
    !Number.isSafeInteger(item.height) ||
    (item.height as number) < 1 ||
    (item.height as number) > limits.maxSide
  ) {
    return null;
  }
  return {
    bytes: item.bytes as number,
    height: item.height as number,
    mimeType: "image/webp",
    sha256: item.sha256,
    width: item.width as number,
  };
}

export function parseStorefrontImageIntent(
  value: unknown,
): StorefrontImageIntentInput | null {
  const input = object(value);
  const variants = input ? object(input.variants) : null;
  if (
    !input ||
    !variants ||
    !uuid(input.shopId) ||
    !uuid(input.publicationId) ||
    !uuid(input.sourceImageVersionId)
  )
    return null;

  const thumb = metadata(variants.thumb, "thumb");
  const card = metadata(variants.card, "card");
  const detail = metadata(variants.detail, "detail");
  if (!thumb || !card || !detail) return null;
  const ratios = [thumb, card, detail].map((item) => item.width / item.height);
  if (Math.max(...ratios) - Math.min(...ratios) > 0.02) return null;
  return {
    publicationId: input.publicationId,
    shopId: input.shopId,
    sourceImageVersionId: input.sourceImageVersionId,
    variants: { card, detail, thumb },
  };
}

export function parseStorefrontImageTarget(
  value: unknown,
): StorefrontImageTargetInput | null {
  const input = object(value);
  return input && uuid(input.shopId) && uuid(input.imagePublicationId)
    ? { imagePublicationId: input.imagePublicationId, shopId: input.shopId }
    : null;
}

export function parseStorefrontImageSource(
  value: unknown,
): StorefrontImageSourceInput | null {
  const input = object(value);
  return input &&
    uuid(input.shopId) &&
    uuid(input.publicationId) &&
    uuid(input.sourceImageVersionId)
    ? {
        publicationId: input.publicationId,
        shopId: input.shopId,
        sourceImageVersionId: input.sourceImageVersionId,
      }
    : null;
}

export async function readStorefrontImageJson(request: Request) {
  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim();
  if (contentType !== "application/json" || !request.body) return null;
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > STOREFRONT_IMAGE_JSON_LIMIT) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > STOREFRONT_IMAGE_JSON_LIMIT) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  if (total < 2) return null;
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

export function storefrontImageJson(body: unknown, status = 200) {
  return Response.json(body, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
    status,
  });
}
