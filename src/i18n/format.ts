import { DEFAULT_LOCALE, type SupportedLocale } from "./locales";

const intlLocaleBySupportedLocale: Record<SupportedLocale, string> = {
  en: "en-US",
  es: "es-CL",
  it: "it-IT",
  "zh-CN": "zh-CN",
};

const notSetByLocale: Record<SupportedLocale, string> = {
  en: "Not set",
  es: "Sin configurar",
  it: "Non impostato",
  "zh-CN": "未设置",
};

function parseDateValue(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function localeForIntl(locale: SupportedLocale) {
  return intlLocaleBySupportedLocale[locale] ?? intlLocaleBySupportedLocale[DEFAULT_LOCALE];
}

function notSet(locale: SupportedLocale) {
  return notSetByLocale[locale] ?? notSetByLocale[DEFAULT_LOCALE];
}

function dateTimeParts(locale: SupportedLocale, value: Date) {
  const formatter = new Intl.DateTimeFormat(localeForIntl(locale), {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "numeric",
    year: "numeric",
  });

  return Object.fromEntries(
    formatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

export function formatDateTime(
  locale: SupportedLocale,
  value: string | Date | null | undefined,
) {
  const date = parseDateValue(value);

  if (!date) {
    return notSet(locale);
  }

  if (locale === "zh-CN") {
    const parts = dateTimeParts(locale, date);

    return `${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`;
  }

  return new Intl.DateTimeFormat(localeForIntl(locale), {
    day: "numeric",
    hour: locale === "en" ? "numeric" : "2-digit",
    hour12: locale === "en",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDate(
  locale: SupportedLocale,
  value: string | Date | null | undefined,
) {
  const date = parseDateValue(value);

  if (!date) {
    return notSet(locale);
  }

  if (locale === "zh-CN") {
    const parts = dateTimeParts(locale, date);

    return `${parts.year}年${parts.month}月${parts.day}日`;
  }

  return new Intl.DateTimeFormat(localeForIntl(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatTime(
  locale: SupportedLocale,
  value: string | Date | null | undefined,
) {
  const date = parseDateValue(value);

  if (!date) {
    return notSet(locale);
  }

  return new Intl.DateTimeFormat(localeForIntl(locale), {
    hour: locale === "en" ? "numeric" : "2-digit",
    hour12: locale === "en",
    minute: "2-digit",
  }).format(date);
}
