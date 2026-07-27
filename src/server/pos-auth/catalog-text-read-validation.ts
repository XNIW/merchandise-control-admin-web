const DISPLAY_NON_CANONICAL_PATTERN =
  /[\u0000-\u001f\u007f-\u009f\u00a0\u1680\u2000-\u200a\u200b\u2028\u2029\u202a-\u202e\u202f\u205f\u2060\u2066-\u2069\u3000\ufeff]/u;
const IDENTITY_REJECTED_PATTERN =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2028\u2029\u202a-\u202e\u2060\u2066-\u2069\ufeff]/u;

export const POS_CATALOG_TEXT_LIMITS = {
  barcode: 96,
  categoryName: 160,
  itemNumber: 120,
  productName: 240,
  secondProductName: 240,
  supplierName: 160,
} as const;

function hasUnpairedUtf16Surrogate(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const current = value.charCodeAt(index);

    if (current >= 0xd800 && current <= 0xdbff) {
      const next = value.charCodeAt(index + 1);

      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return true;
      }

      index += 1;
      continue;
    }

    if (current >= 0xdc00 && current <= 0xdfff) {
      return true;
    }
  }

  return false;
}

export function isCanonicalCatalogDisplayText(
  value: string | null,
  maxLength: number,
  required: boolean,
) {
  const candidate = value ?? "";

  return (
    (!required || candidate.length > 0) &&
    candidate.length <= maxLength &&
    !hasUnpairedUtf16Surrogate(candidate) &&
    !DISPLAY_NON_CANONICAL_PATTERN.test(candidate) &&
    !candidate.startsWith(" ") &&
    !candidate.endsWith(" ") &&
    !candidate.includes("  ") &&
    candidate.normalize("NFC") === candidate
  );
}

export function isCanonicalCatalogIdentityText(
  value: string | null,
  maxLength: number,
  required: boolean,
) {
  const candidate = value ?? "";

  return (
    (!required || candidate.length > 0) &&
    candidate.length <= maxLength &&
    !hasUnpairedUtf16Surrogate(candidate) &&
    !IDENTITY_REJECTED_PATTERN.test(candidate) &&
    candidate.trim() === candidate
  );
}
