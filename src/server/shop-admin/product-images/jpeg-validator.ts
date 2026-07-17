export type JpegInspection = {
  height: number;
  width: number;
};

export type JpegInspectionResult =
  | { inspection: JpegInspection; ok: true }
  | {
      code:
        | "jpeg_dimensions_invalid"
        | "jpeg_magic_invalid"
        | "jpeg_metadata_forbidden"
        | "jpeg_structure_invalid"
        | "jpeg_truncated";
      ok: false;
    };

const START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
  0xcf,
]);

function isStandaloneMarker(marker: number) {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9);
}

function nextMarkerAfterScan(bytes: Uint8Array, start: number) {
  let index = start;

  while (index < bytes.length - 1) {
    if (bytes[index] !== 0xff) {
      index += 1;
      continue;
    }

    let markerIndex = index + 1;
    while (markerIndex < bytes.length && bytes[markerIndex] === 0xff) {
      markerIndex += 1;
    }

    if (markerIndex >= bytes.length) {
      return null;
    }

    const marker = bytes[markerIndex];
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
      index = markerIndex + 1;
      continue;
    }

    return index;
  }

  return null;
}

export function inspectJpeg(bytes: Uint8Array): JpegInspectionResult {
  if (
    bytes.length < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[bytes.length - 2] !== 0xff ||
    bytes[bytes.length - 1] !== 0xd9
  ) {
    return { code: "jpeg_magic_invalid", ok: false };
  }

  let index = 2;
  let dimensions: JpegInspection | null = null;

  while (index < bytes.length) {
    if (bytes[index] !== 0xff) {
      return { code: "jpeg_structure_invalid", ok: false };
    }

    while (index < bytes.length && bytes[index] === 0xff) {
      index += 1;
    }

    if (index >= bytes.length) {
      return { code: "jpeg_truncated", ok: false };
    }

    const marker = bytes[index];
    index += 1;

    if (marker === 0xd9) {
      return dimensions
        ? { inspection: dimensions, ok: true }
        : { code: "jpeg_dimensions_invalid", ok: false };
    }

    if (marker === 0xd8 || isStandaloneMarker(marker)) {
      continue;
    }

    if (index + 1 >= bytes.length) {
      return { code: "jpeg_truncated", ok: false };
    }

    const segmentLength = (bytes[index] << 8) | bytes[index + 1];
    if (segmentLength < 2 || index + segmentLength > bytes.length) {
      return { code: "jpeg_truncated", ok: false };
    }

    const dataStart = index + 2;
    const dataLength = segmentLength - 2;

    // APP1 carries EXIF/GPS or XMP. TASK-137 output must have metadata stripped.
    if (marker === 0xe1) {
      return { code: "jpeg_metadata_forbidden", ok: false };
    }

    if (START_OF_FRAME_MARKERS.has(marker)) {
      if (dataLength < 6) {
        return { code: "jpeg_dimensions_invalid", ok: false };
      }

      const height = (bytes[dataStart + 1] << 8) | bytes[dataStart + 2];
      const width = (bytes[dataStart + 3] << 8) | bytes[dataStart + 4];

      if (width < 1 || height < 1) {
        return { code: "jpeg_dimensions_invalid", ok: false };
      }

      if (
        dimensions &&
        (dimensions.width !== width || dimensions.height !== height)
      ) {
        return { code: "jpeg_dimensions_invalid", ok: false };
      }

      dimensions = { height, width };
    }

    index += segmentLength;

    if (marker === 0xda) {
      const nextMarker = nextMarkerAfterScan(bytes, index);
      if (nextMarker === null) {
        return { code: "jpeg_truncated", ok: false };
      }
      index = nextMarker;
    }
  }

  return { code: "jpeg_truncated", ok: false };
}
