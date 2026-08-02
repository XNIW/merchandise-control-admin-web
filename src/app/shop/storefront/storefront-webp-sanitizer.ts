const ALLOWED_CHUNKS = new Set(["VP8X", "ALPH", "VP8 ", "VP8L"]);
const METADATA_CHUNKS = new Set(["ICCP", "EXIF", "XMP "]);

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function readU32(bytes: Uint8Array, start: number) {
  return (
    (bytes[start] |
      (bytes[start + 1] << 8) |
      (bytes[start + 2] << 16) |
      (bytes[start + 3] << 24)) >>>
    0
  );
}

function writeU32(bytes: Uint8Array, start: number, value: number) {
  bytes[start] = value & 0xff;
  bytes[start + 1] = (value >>> 8) & 0xff;
  bytes[start + 2] = (value >>> 16) & 0xff;
  bytes[start + 3] = (value >>> 24) & 0xff;
}

/**
 * Canvas encoders can attach an ICC profile even when drawing into an sRGB
 * context. Storefront artifacts deliberately carry pixels only: strip the
 * three metadata chunks and their VP8X feature flags before hashing/upload.
 */
export function sanitizeStorefrontWebp(bytes: Uint8Array) {
  if (
    bytes.length < 20 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 4) !== "WEBP" ||
    readU32(bytes, 4) + 8 !== bytes.length
  ) {
    return null;
  }

  const chunks: Uint8Array[] = [];
  let imageChunks = 0;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const size = readU32(bytes, offset + 4);
    const end = offset + 8 + size;
    const paddedEnd = end + (size % 2);
    if (end > bytes.length || paddedEnd > bytes.length) return null;
    if (type === "ANIM" || type === "ANMF") return null;
    if (METADATA_CHUNKS.has(type)) {
      offset = paddedEnd;
      continue;
    }
    if (!ALLOWED_CHUNKS.has(type)) return null;
    if (type === "VP8 " || type === "VP8L") imageChunks += 1;
    const chunk = bytes.slice(offset, paddedEnd);
    if (type === "VP8X") {
      if (size !== 10 || (chunk[8] & 0x02) !== 0) return null;
      chunk[8] &= ~0x2c;
    }
    chunks.push(chunk);
    offset = paddedEnd;
  }
  if (offset !== bytes.length || imageChunks !== 1) return null;

  const outputLength =
    12 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(outputLength);
  output.set(bytes.subarray(0, 12), 0);
  writeU32(output, 4, outputLength - 8);
  let target = 12;
  for (const chunk of chunks) {
    output.set(chunk, target);
    target += chunk.length;
  }
  return output;
}
