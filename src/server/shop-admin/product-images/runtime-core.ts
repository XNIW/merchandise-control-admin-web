import "server-only";

import { createHash } from "node:crypto";
import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
} from "@/lib/supabase/admin";
import { inspectJpeg } from "./jpeg-validator";

export function resolveProductImageAdminClient() {
  const config = resolveSupabaseAdminConfig();
  return config.status === "configured"
    ? createSupabaseAdminClient(config)
    : null;
}

export function isCanonicalProductImagePath(input: {
  path: string | null;
  productId: string;
  shopId: string;
  variant: "main" | "thumb";
  versionId: string;
}) {
  return (
    input.path ===
    `shops/${input.shopId}/products/${input.productId}/primary/${input.versionId}/${input.variant}.jpg`
  );
}

const PRODUCT_IMAGE_STORAGE_NOT_FOUND_CODES = new Set([
  "404",
  "no_such_key",
  "nosuchkey",
  "not_found",
  "notfound",
  "object_not_found",
  "objectnotfound",
]);

export function isProductImageStorageObjectMissingError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const record = error as Record<string, unknown>;
  if (record.status === 404) return true;

  return ["statusCode", "code"].some((key) => {
    const value = record[key];
    if (typeof value !== "string") return false;
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    return PRODUCT_IMAGE_STORAGE_NOT_FOUND_CODES.has(normalized);
  });
}

export function productImageSha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifyDownloadedProductImageJpeg(input: {
  blobMimeType: string;
  bytes: Uint8Array;
  expectedBytes: number;
  expectedHeight: number;
  expectedSha256: string;
  expectedWidth: number;
  maxBytes: number;
  maxSide: number;
}) {
  const mimeType = input.blobMimeType.split(";")[0]?.trim().toLowerCase();
  if (mimeType !== "image/jpeg") {
    return { code: "jpeg_mime_invalid" as const, ok: false as const };
  }
  if (
    input.bytes.byteLength < 1 ||
    input.bytes.byteLength > input.maxBytes ||
    input.bytes.byteLength !== input.expectedBytes
  ) {
    return { code: "jpeg_byte_count_mismatch" as const, ok: false as const };
  }

  const inspection = inspectJpeg(input.bytes);
  if (!inspection.ok) {
    return inspection;
  }
  if (
    inspection.inspection.width > input.maxSide ||
    inspection.inspection.height > input.maxSide ||
    inspection.inspection.width !== input.expectedWidth ||
    inspection.inspection.height !== input.expectedHeight
  ) {
    return { code: "jpeg_dimensions_invalid" as const, ok: false as const };
  }

  const digest = productImageSha256(input.bytes);
  if (digest !== input.expectedSha256) {
    return { code: "jpeg_checksum_mismatch" as const, ok: false as const };
  }

  return {
    height: inspection.inspection.height,
    ok: true as const,
    sha256: digest,
    width: inspection.inspection.width,
  };
}
