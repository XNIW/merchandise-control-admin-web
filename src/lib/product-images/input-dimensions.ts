const MAX_HEADER_BYTES = 256 * 1024;

export type InputImageDimensions = {
  height: number;
  width: number;
};

function dimensionsAreBounded(
  dimensions: InputImageDimensions,
  maxPixels: number,
) {
  return (
    Number.isSafeInteger(dimensions.width) &&
    Number.isSafeInteger(dimensions.height) &&
    dimensions.width >= 1 &&
    dimensions.height >= 1 &&
    dimensions.height <= Math.floor(maxPixels / dimensions.width)
  );
}

function readPngDimensions(bytes: Uint8Array) {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a ||
    bytes[12] !== 0x49 ||
    bytes[13] !== 0x48 ||
    bytes[14] !== 0x44 ||
    bytes[15] !== 0x52
  ) {
    return null;
  }
  return {
    height:
      bytes[20] * 0x1000000 +
      bytes[21] * 0x10000 +
      bytes[22] * 0x100 +
      bytes[23],
    width:
      bytes[16] * 0x1000000 +
      bytes[17] * 0x10000 +
      bytes[18] * 0x100 +
      bytes[19],
  };
}

function readJpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let index = 2;
  while (index + 3 < bytes.length) {
    if (bytes[index] !== 0xff) return null;
    while (index < bytes.length && bytes[index] === 0xff) index += 1;
    if (index >= bytes.length) return null;
    const marker = bytes[index];
    index += 1;
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (index + 1 >= bytes.length) return null;
    const length = (bytes[index] << 8) | bytes[index + 1];
    if (length < 2 || index + length > bytes.length) return null;
    const isFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (length < 7) return null;
      return {
        height: (bytes[index + 3] << 8) | bytes[index + 4],
        width: (bytes[index + 5] << 8) | bytes[index + 6],
      };
    }
    index += length;
  }
  return null;
}

export function inspectInputImageHeader(
  bytes: Uint8Array,
  mimeType: string,
  maxPixels: number,
) {
  const dimensions =
    mimeType === "image/jpeg"
      ? readJpegDimensions(bytes)
      : mimeType === "image/png"
        ? readPngDimensions(bytes)
        : null;
  return dimensions && dimensionsAreBounded(dimensions, maxPixels)
    ? dimensions
    : null;
}

export async function preflightInputImageDimensions(
  file: File,
  maxPixels: number,
) {
  const bytes = new Uint8Array(
    await file.slice(0, Math.min(file.size, MAX_HEADER_BYTES)).arrayBuffer(),
  );
  return inspectInputImageHeader(bytes, file.type, maxPixels);
}
