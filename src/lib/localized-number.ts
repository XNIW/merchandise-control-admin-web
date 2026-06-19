const CURRENCY_CODE_PATTERN =
  /(^|\s)(ars|brl|clp|cny|cop|eur|gbp|mxn|pen|rmb|usd|uyu)(?=\s|$)/gi;
const CURRENCY_SYMBOL_PATTERN = /[$€£¥₩₽₹]/g;
const LETTER_PATTERN =
  /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u4E00-\u9FFF]/;
const UNSUPPORTED_NUMBER_CHARACTER_PATTERN = /[^\d\s,.-]/;

export function parseLocalizedNumberText(value: string) {
  const normalized = value
    .trim()
    .replace(CURRENCY_CODE_PATTERN, " ")
    .replace(CURRENCY_SYMBOL_PATTERN, "");

  if (LETTER_PATTERN.test(normalized)) {
    return Number.NaN;
  }

  if (UNSUPPORTED_NUMBER_CHARACTER_PATTERN.test(normalized)) {
    return Number.NaN;
  }

  const compact = normalized.replace(/\s+/g, "");

  if (!compact || !/^-?[\d.,]+$/.test(compact)) {
    return Number.NaN;
  }

  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(compact)) {
    return Number(compact.replace(/\./g, "").replace(",", "."));
  }

  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(compact)) {
    return Number(compact.replace(/,/g, ""));
  }

  return Number(compact.replace(",", "."));
}
