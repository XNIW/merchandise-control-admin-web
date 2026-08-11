import { createHash } from "node:crypto";
import type { StorefrontImageMetadata } from "./contract";

type WebpResult =
  | { height: number; ok: true; sha256: string; width: number }
  | { code: string; ok: false };

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}
function u24(bytes: Uint8Array, start: number) {
  return bytes[start] | (bytes[start + 1] << 8) | (bytes[start + 2] << 16);
}
function u32(bytes: Uint8Array, start: number) {
  return (
    (bytes[start] |
      (bytes[start + 1] << 8) |
      (bytes[start + 2] << 16) |
      (bytes[start + 3] << 24)) >>>
    0
  );
}

export function inspectStorefrontWebp(bytes: Uint8Array): WebpResult {
  if (
    bytes.length < 20 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 4) !== "WEBP" ||
    u32(bytes, 4) + 8 !== bytes.length
  )
    return { code: "webp_container_invalid", ok: false };

  let offset = 12;
  let dimensions: { height: number; width: number } | null = null;
  let imageChunks = 0;
  const forbidden = new Set(["EXIF", "XMP ", "ICCP", "ANIM", "ANMF"]);
  const allowed = new Set(["VP8 ", "VP8L", "VP8X", "ALPH"]);
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const size = u32(bytes, offset + 4);
    const data = offset + 8;
    const end = data + size;
    if (end > bytes.length || forbidden.has(type) || !allowed.has(type)) {
      return {
        code: forbidden.has(type)
          ? "webp_metadata_forbidden"
          : "webp_chunk_invalid",
        ok: false,
      };
    }
    if (type === "VP8 ") {
      imageChunks += 1;
      if (
        size < 10 ||
        bytes[data + 3] !== 0x9d ||
        bytes[data + 4] !== 0x01 ||
        bytes[data + 5] !== 0x2a
      )
        return { code: "webp_bitstream_invalid", ok: false };
      dimensions = {
        height: (bytes[data + 8] | (bytes[data + 9] << 8)) & 0x3fff,
        width: (bytes[data + 6] | (bytes[data + 7] << 8)) & 0x3fff,
      };
    } else if (type === "VP8L") {
      imageChunks += 1;
      if (size < 5 || bytes[data] !== 0x2f)
        return { code: "webp_bitstream_invalid", ok: false };
      dimensions = {
        height:
          1 +
          (bytes[data + 2] >> 6) +
          (bytes[data + 3] << 2) +
          ((bytes[data + 4] & 0x0f) << 10),
        width: 1 + bytes[data + 1] + ((bytes[data + 2] & 0x3f) << 8),
      };
    } else if (type === "VP8X") {
      if (size !== 10 || (bytes[data] & 0x3e) !== 0) {
        return { code: "webp_extended_features_forbidden", ok: false };
      }
      dimensions = {
        height: 1 + u24(bytes, data + 7),
        width: 1 + u24(bytes, data + 4),
      };
    }
    offset = end + (size % 2);
  }
  if (
    offset !== bytes.length ||
    imageChunks !== 1 ||
    !dimensions ||
    dimensions.width < 1 ||
    dimensions.height < 1
  ) {
    return { code: "webp_structure_invalid", ok: false };
  }
  return {
    ...dimensions,
    ok: true,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function verifyStorefrontWebp(input: {
  blobMimeType: string;
  bytes: Uint8Array;
  expected: StorefrontImageMetadata;
}): WebpResult {
  if (input.blobMimeType.split(";")[0]?.trim().toLowerCase() !== "image/webp") {
    return { code: "webp_mime_invalid", ok: false };
  }
  if (input.bytes.byteLength !== input.expected.bytes) {
    return { code: "webp_byte_count_mismatch", ok: false };
  }
  const result = inspectStorefrontWebp(input.bytes);
  if (!result.ok) return result;
  if (
    result.width !== input.expected.width ||
    result.height !== input.expected.height ||
    result.sha256 !== input.expected.sha256
  )
    return { code: "webp_verified_metadata_mismatch", ok: false };
  return result;
}
