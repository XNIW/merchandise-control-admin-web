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

const CANONICAL_START_OF_FRAME_MARKERS = new Set([0xc0, 0xc2]);
const JPEG_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
  0xcf,
]);

function isCanonicalJfifApp0(
  bytes: Uint8Array,
  dataStart: number,
  dataLength: number,
) {
  return (
    dataLength === 14 &&
    bytes[dataStart] === 0x4a &&
    bytes[dataStart + 1] === 0x46 &&
    bytes[dataStart + 2] === 0x49 &&
    bytes[dataStart + 3] === 0x46 &&
    bytes[dataStart + 4] === 0x00 &&
    bytes[dataStart + 5] === 0x01 &&
    bytes[dataStart + 7] <= 0x02 &&
    bytes[dataStart + 12] === 0x00 &&
    bytes[dataStart + 13] === 0x00
  );
}

function isValidQuantizationTable(
  bytes: Uint8Array,
  dataStart: number,
  dataLength: number,
  tableIds: Set<number>,
) {
  const dataEnd = dataStart + dataLength;
  let index = dataStart;

  while (index < dataEnd) {
    const table = bytes[index];
    const precision = table >> 4;
    const tableId = table & 0x0f;
    const valuesLength = precision === 0 ? 64 : precision === 1 ? 128 : 0;
    if (tableId > 3 || valuesLength === 0 || index + 1 + valuesLength > dataEnd) {
      return false;
    }
    tableIds.add(tableId);
    index += 1 + valuesLength;
  }

  return index === dataEnd;
}

function isValidHuffmanTable(
  bytes: Uint8Array,
  dataStart: number,
  dataLength: number,
  tableIds: Set<number>,
) {
  const dataEnd = dataStart + dataLength;
  let index = dataStart;

  while (index < dataEnd) {
    if (index + 17 > dataEnd) return false;
    const table = bytes[index];
    const tableClass = table >> 4;
    const tableId = table & 0x0f;
    if (tableClass > 1 || tableId > 3) return false;

    let codeSpace = 1;
    let valueCount = 0;
    for (let offset = 1; offset <= 16; offset += 1) {
      const count = bytes[index + offset];
      valueCount += count;
      // Annex C reserves the all-ones codeword.  A full tree (zero remaining
      // code space) is therefore invalid, in addition to an oversubscribed
      // tree that would make decoding ambiguous.
      codeSpace = codeSpace * 2 - count;
      if (codeSpace <= 0) return false;
    }
    if (
      valueCount === 0 ||
      valueCount > 256 ||
      index + 17 + valueCount > dataEnd
    ) {
      return false;
    }
    tableIds.add((tableClass << 4) | tableId);
    index += 17 + valueCount;
  }

  return index === dataEnd;
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
  let frameMarker: number | null = null;
  let frameComponentIds = new Set<number>();
  let frameQuantizationTableIds = new Set<number>();
  const huffmanTableIds = new Set<number>();
  const quantizationTableIds = new Set<number>();
  let sawHuffmanTable = false;
  let sawJfifApp0 = false;
  let sawQuantizationTable = false;
  let sawScan = false;

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
      if (index !== bytes.length) {
        return { code: "jpeg_structure_invalid", ok: false };
      }
      return dimensions && sawQuantizationTable && sawHuffmanTable && sawScan
        ? { inspection: dimensions, ok: true }
        : { code: "jpeg_structure_invalid", ok: false };
    }

    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      return { code: "jpeg_structure_invalid", ok: false };
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

    // Canonical product-image JPEGs preserve pixels only. COM and every
    // non-JFIF application segment may carry EXIF/GPS/XMP/ICC/vendor bytes,
    // so reject them before an object can become a durable image version.
    if (
      marker === 0xfe ||
      (marker === 0xe0 &&
        (!isCanonicalJfifApp0(bytes, dataStart, dataLength) ||
          sawJfifApp0 ||
          frameMarker !== null ||
          sawScan)) ||
      (marker >= 0xe1 && marker <= 0xef)
    ) {
      return { code: "jpeg_metadata_forbidden", ok: false };
    }

    if (marker === 0xe0) sawJfifApp0 = true;

    if (![0xc0, 0xc2, 0xc4, 0xda, 0xdb, 0xdd, 0xe0].includes(marker)) {
      return { code: "jpeg_structure_invalid", ok: false };
    }

    if (marker === 0xdd && dataLength !== 2) {
      return { code: "jpeg_structure_invalid", ok: false };
    }

    if (marker === 0xdb) {
      if (
        !isValidQuantizationTable(
          bytes,
          dataStart,
          dataLength,
          quantizationTableIds,
        )
      ) {
        return { code: "jpeg_structure_invalid", ok: false };
      }
      sawQuantizationTable = true;
    }

    if (marker === 0xc4) {
      if (
        !isValidHuffmanTable(bytes, dataStart, dataLength, huffmanTableIds)
      ) {
        return { code: "jpeg_structure_invalid", ok: false };
      }
      sawHuffmanTable = true;
    }

    if (JPEG_FRAME_MARKERS.has(marker)) {
      if (
        !CANONICAL_START_OF_FRAME_MARKERS.has(marker) ||
        frameMarker !== null ||
        sawScan ||
        dataLength < 9 ||
        bytes[dataStart] !== 8
      ) {
        return { code: "jpeg_structure_invalid", ok: false };
      }

      const componentCount = bytes[dataStart + 5];
      if (
        componentCount < 1 ||
        componentCount > 4 ||
        dataLength !== 6 + componentCount * 3
      ) {
        return { code: "jpeg_structure_invalid", ok: false };
      }

      const componentIds = new Set<number>();
      const componentQuantizationTableIds = new Set<number>();
      for (let offset = 0; offset < componentCount; offset += 1) {
        const componentStart = dataStart + 6 + offset * 3;
        const componentId = bytes[componentStart];
        const sampling = bytes[componentStart + 1];
        const quantizationTable = bytes[componentStart + 2];
        if (
          componentId === 0 ||
          componentIds.has(componentId) ||
          (sampling >> 4) === 0 ||
          (sampling & 0x0f) === 0 ||
          quantizationTable > 3
        ) {
          return { code: "jpeg_structure_invalid", ok: false };
        }
        componentIds.add(componentId);
        componentQuantizationTableIds.add(quantizationTable);
      }

      const height = (bytes[dataStart + 1] << 8) | bytes[dataStart + 2];
      const width = (bytes[dataStart + 3] << 8) | bytes[dataStart + 4];

      if (width < 1 || height < 1) {
        return { code: "jpeg_dimensions_invalid", ok: false };
      }

      dimensions = { height, width };
      frameMarker = marker;
      frameComponentIds = componentIds;
      frameQuantizationTableIds = componentQuantizationTableIds;
    }

    if (marker === 0xda) {
      const componentCount = bytes[dataStart];
      if (
        frameMarker === null ||
        !sawQuantizationTable ||
        !sawHuffmanTable ||
        componentCount < 1 ||
        componentCount > frameComponentIds.size ||
        dataLength !== 4 + componentCount * 2
      ) {
        return { code: "jpeg_structure_invalid", ok: false };
      }

      const scanComponentIds = new Set<number>();
      for (let offset = 0; offset < componentCount; offset += 1) {
        const componentStart = dataStart + 1 + offset * 2;
        const componentId = bytes[componentStart];
        const selectors = bytes[componentStart + 1];
        const dcTableId = selectors >> 4;
        const acTableId = selectors & 0x0f;
        if (!frameComponentIds.has(componentId) || scanComponentIds.has(componentId)) {
          return { code: "jpeg_structure_invalid", ok: false };
        }

        if (frameMarker === 0xc0) {
          if (
            dcTableId > 1 ||
            acTableId > 1 ||
            !huffmanTableIds.has(dcTableId) ||
            !huffmanTableIds.has(0x10 | acTableId)
          ) {
            return { code: "jpeg_structure_invalid", ok: false };
          }
        } else if (dcTableId > 3 || acTableId > 3) {
          return { code: "jpeg_structure_invalid", ok: false };
        }

        scanComponentIds.add(componentId);
      }

      if (
        Array.from(frameQuantizationTableIds).some(
          (tableId) => !quantizationTableIds.has(tableId),
        )
      ) {
        return { code: "jpeg_structure_invalid", ok: false };
      }

      const spectralStart = bytes[dataStart + dataLength - 3];
      const spectralEnd = bytes[dataStart + dataLength - 2];
      const approximation = bytes[dataStart + dataLength - 1];
      const successiveHigh = approximation >> 4;
      const successiveLow = approximation & 0x0f;

      if (
        frameMarker === 0xc0 &&
        (spectralStart !== 0 || spectralEnd !== 63 || approximation !== 0)
      ) {
        return { code: "jpeg_structure_invalid", ok: false };
      }

      if (frameMarker === 0xc2) {
        if (
          successiveHigh > 13 ||
          successiveLow > 13 ||
          (successiveHigh !== 0 && successiveHigh !== successiveLow + 1)
        ) {
          return { code: "jpeg_structure_invalid", ok: false };
        }

        if (spectralStart === 0) {
          if (spectralEnd !== 0) {
            return { code: "jpeg_structure_invalid", ok: false };
          }

          for (let offset = 0; offset < componentCount; offset += 1) {
            const selectors = bytes[dataStart + 2 + offset * 2];
            if (!huffmanTableIds.has(selectors >> 4)) {
              return { code: "jpeg_structure_invalid", ok: false };
            }
          }
        } else {
          if (
            componentCount !== 1 ||
            spectralStart > spectralEnd ||
            spectralEnd > 63
          ) {
            return { code: "jpeg_structure_invalid", ok: false };
          }

          const selectors = bytes[dataStart + 2];
          if (!huffmanTableIds.has(0x10 | (selectors & 0x0f))) {
            return { code: "jpeg_structure_invalid", ok: false };
          }
        }
      }
      sawScan = true;
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
