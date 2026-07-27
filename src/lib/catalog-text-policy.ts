export const CATALOG_TEXT_POLICY_VERSION = "catalog_text_policy_v1" as const;

export const CATALOG_TEXT_LIMITS = {
  barcode: 96,
  categoryName: 160,
  itemNumber: 120,
  productName: 240,
  secondProductName: 240,
  supplierName: 160,
} as const;

export type CatalogTextChange =
  | "line_break_to_space"
  | "space_collapsed"
  | "space_separator_to_space"
  | "tab_to_space"
  | "trimmed"
  | "unicode_nfc";

export type CatalogTextRejectionReason =
  | "empty_required"
  | "identity_collision_after_trim"
  | "invalid_utf16"
  | "invalid_utf8"
  | "prohibited_bidi"
  | "prohibited_bom"
  | "prohibited_control"
  | "prohibited_line_separator"
  | "prohibited_zero_width"
  | "too_long";

export type CatalogTextAcceptedResult = {
  changes: CatalogTextChange[];
  status: "normalized" | "unchanged";
  value: string;
};

export type CatalogTextRejectedResult = {
  reason: CatalogTextRejectionReason;
  status: "rejected";
};

export type CatalogTextResult =
  | CatalogTextAcceptedResult
  | CatalogTextRejectedResult;

export type CatalogTextOptions = {
  maxLength: number;
  required: boolean;
};

const NON_ASCII_SPACE_SEPARATOR_PATTERN =
  /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/gu;
const RESIDUAL_CONTROL_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const LINE_SEPARATOR_PATTERN = /[\u2028\u2029]/u;
const DISPLAY_ZERO_WIDTH_PATTERN = /[\u200b\u2060]/u;
const STRICT_ZERO_WIDTH_PATTERN = /[\u200b\u200c\u200d\u2060]/u;
const BOM_PATTERN = /\ufeff/u;
const BIDI_PATTERN = /[\u202a-\u202e\u2066-\u2069]/u;
const STRICT_CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;

function pushChange(
  changes: CatalogTextChange[],
  change: CatalogTextChange,
) {
  if (!changes.includes(change)) {
    changes.push(change);
  }
}

export function hasUnpairedUtf16Surrogate(value: string) {
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

function rejectedReasonForDisplay(
  value: string,
): CatalogTextRejectionReason | null {
  if (RESIDUAL_CONTROL_PATTERN.test(value)) {
    return "prohibited_control";
  }

  if (LINE_SEPARATOR_PATTERN.test(value)) {
    return "prohibited_line_separator";
  }

  if (DISPLAY_ZERO_WIDTH_PATTERN.test(value)) {
    return "prohibited_zero_width";
  }

  if (BOM_PATTERN.test(value)) {
    return "prohibited_bom";
  }

  if (BIDI_PATTERN.test(value)) {
    return "prohibited_bidi";
  }

  return null;
}

function rejectedReasonForStrict(
  value: string,
): CatalogTextRejectionReason | null {
  if (STRICT_CONTROL_PATTERN.test(value)) {
    return "prohibited_control";
  }

  if (LINE_SEPARATOR_PATTERN.test(value)) {
    return "prohibited_line_separator";
  }

  if (STRICT_ZERO_WIDTH_PATTERN.test(value)) {
    return "prohibited_zero_width";
  }

  if (BOM_PATTERN.test(value)) {
    return "prohibited_bom";
  }

  if (BIDI_PATTERN.test(value)) {
    return "prohibited_bidi";
  }

  return null;
}

function accepted(
  original: string,
  value: string,
  changes: CatalogTextChange[],
): CatalogTextAcceptedResult {
  return {
    changes,
    status:
      changes.length === 0 && value === original ? "unchanged" : "normalized",
    value,
  };
}

export function canonicalizeCatalogDisplayText(
  input: string,
  options: CatalogTextOptions,
): CatalogTextResult {
  if (hasUnpairedUtf16Surrogate(input)) {
    return { reason: "invalid_utf16", status: "rejected" };
  }

  const changes: CatalogTextChange[] = [];
  let value = input.normalize("NFC");

  if (value !== input) {
    pushChange(changes, "unicode_nfc");
  }

  if (/[\r\n]/u.test(value)) {
    pushChange(changes, "line_break_to_space");
  }

  if (/\t/u.test(value)) {
    pushChange(changes, "tab_to_space");
  }

  if (NON_ASCII_SPACE_SEPARATOR_PATTERN.test(value)) {
    pushChange(changes, "space_separator_to_space");
    NON_ASCII_SPACE_SEPARATOR_PATTERN.lastIndex = 0;
  }

  value = value
    .replace(/\r\n/gu, " ")
    .replace(/[\r\n]/gu, " ")
    .replace(/\t/gu, " ")
    .replace(NON_ASCII_SPACE_SEPARATOR_PATTERN, " ");

  const collapsed = value.replace(/ {2,}/gu, " ");

  if (collapsed !== value) {
    pushChange(changes, "space_collapsed");
    value = collapsed;
  }

  const trimmed = value.replace(/^ +| +$/gu, "");

  if (trimmed !== value) {
    pushChange(changes, "trimmed");
    value = trimmed;
  }

  const rejection = rejectedReasonForDisplay(value);

  if (rejection) {
    return { reason: rejection, status: "rejected" };
  }

  if (options.required && value.length === 0) {
    return { reason: "empty_required", status: "rejected" };
  }

  if (value.length > options.maxLength) {
    return { reason: "too_long", status: "rejected" };
  }

  return accepted(input, value, changes);
}

export function validateCatalogIdentityText(
  input: string,
  options: CatalogTextOptions,
): CatalogTextResult {
  if (hasUnpairedUtf16Surrogate(input)) {
    return { reason: "invalid_utf16", status: "rejected" };
  }

  const rejection = rejectedReasonForStrict(input);

  if (rejection) {
    return { reason: rejection, status: "rejected" };
  }

  const value = input.trim();
  const changes: CatalogTextChange[] =
    value === input ? [] : ["trimmed"];

  if (options.required && value.length === 0) {
    return { reason: "empty_required", status: "rejected" };
  }

  if (value.length > options.maxLength) {
    return { reason: "too_long", status: "rejected" };
  }

  return accepted(input, value, changes);
}

export function decodeCatalogUtf8(
  bytes: Uint8Array,
  options: CatalogTextOptions & { class: "display" | "strict" },
): CatalogTextResult {
  let value: string;

  try {
    value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { reason: "invalid_utf8", status: "rejected" };
  }

  return options.class === "display"
    ? canonicalizeCatalogDisplayText(value, options)
    : validateCatalogIdentityText(value, options);
}

export function findCatalogIdentityCollision(
  inputs: readonly string[],
  options: CatalogTextOptions,
): CatalogTextRejectedResult | null {
  const seen = new Set<string>();

  for (const input of inputs) {
    const result = validateCatalogIdentityText(input, options);

    if (result.status === "rejected") {
      return result;
    }

    if (seen.has(result.value)) {
      return {
        reason: "identity_collision_after_trim",
        status: "rejected",
      };
    }

    seen.add(result.value);
  }

  return null;
}

export function catalogTextReasonMessage(
  reason: CatalogTextRejectionReason,
) {
  switch (reason) {
    case "empty_required":
      return "A required catalog text value is empty after normalization.";
    case "identity_collision_after_trim":
      return "Two catalog identities would collide after trimming.";
    case "invalid_utf16":
    case "invalid_utf8":
      return "Catalog text contains invalid Unicode.";
    case "prohibited_bidi":
      return "Catalog text contains a prohibited bidirectional control.";
    case "prohibited_bom":
      return "Catalog text contains an embedded byte-order mark.";
    case "prohibited_control":
      return "Catalog text contains a prohibited control character.";
    case "prohibited_line_separator":
      return "Catalog text contains a prohibited line separator.";
    case "prohibited_zero_width":
      return "Catalog text contains a prohibited zero-width character.";
    case "too_long":
      return "Catalog text exceeds the allowed length after normalization.";
  }
}
