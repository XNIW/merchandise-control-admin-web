import { formatDateTime } from "@/i18n/format";
import { DEFAULT_LOCALE, type SupportedLocale } from "@/i18n/locales";

export function formatToken(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function isIsoTimestamp(value: string | null | undefined) {
  return Boolean(
    value &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(
        value,
      ),
  );
}

export function formatTimestampUtc(
  value: string | null | undefined,
  locale: SupportedLocale = DEFAULT_LOCALE,
) {
  if (!value || !isIsoTimestamp(value)) {
    return formatDateTime(locale, value);
  }

  return formatDateTime(locale, value);
}

export function shortIdentifier(
  value: string | null | undefined,
  visibleStart = 8,
  visibleEnd = 4,
) {
  if (!value) {
    return "none";
  }

  if (value.length <= visibleStart + visibleEnd + 3) {
    return value;
  }

  return `${value.slice(0, visibleStart)}...${value.slice(-visibleEnd)}`;
}

export function isLikelyIdentifier(value: string | null | undefined) {
  if (!value || value.includes("\n")) {
    return false;
  }

  return (
    /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value) ||
    /^[A-Za-z0-9_-]{24,}$/.test(value)
  );
}

export function readableBoundaryStatus(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  const labels: Record<string, string> = {
    "42501": "Blocked by grants",
    BLOCKED: "Blocked",
    NOT_RUN: "Not checked",
    PASS: "OK",
    PASS_WITH_NOTES: "Needs review",
    configured: "Configured",
    not_configured: "Not configured",
  };

  return labels[value] ?? formatToken(value);
}

export function formatDisplayValue(
  value: string,
  locale: SupportedLocale = DEFAULT_LOCALE,
) {
  if (isIsoTimestamp(value)) {
    return {
      fullValue: value,
      isIdentifier: false,
      text: formatTimestampUtc(value, locale),
    };
  }

  if (isLikelyIdentifier(value)) {
    return {
      fullValue: value,
      isIdentifier: true,
      text: shortIdentifier(value),
    };
  }

  return {
    fullValue: value,
    isIdentifier: false,
    text: value,
  };
}
