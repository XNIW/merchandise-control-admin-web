export const LOCALE_COOKIE_NAME = "mc_admin_locale";
export const DEFAULT_LOCALE = "en";

export const SUPPORTED_LOCALES = ["it", "en", "es", "zh-CN"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export type SupportedLanguageOption = {
  code: SupportedLocale;
  label: string;
};

export const supportedLanguageOptions: readonly SupportedLanguageOption[] = [
  { code: "it", label: "Italiano" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "zh-CN", label: "简体中文" },
];

const supportedLocaleSet = new Set<string>(SUPPORTED_LOCALES);

const localeAliases: Record<string, SupportedLocale> = {
  chinese: "zh-CN",
  en: "en",
  english: "en",
  es: "es",
  español: "es",
  it: "it",
  italian: "it",
  italiano: "it",
  spanish: "es",
  zh: "zh-CN",
  "zh-cn": "zh-CN",
  "zh-hans": "zh-CN",
  "中文": "zh-CN",
};

export function isSupportedLocale(
  value: string | null | undefined,
): value is SupportedLocale {
  return Boolean(value && supportedLocaleSet.has(value));
}

export function normalizeLocaleAlias(
  value: string | null | undefined,
): SupportedLocale | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  if (isSupportedLocale(normalized)) {
    return normalized;
  }

  const lower = normalized.toLowerCase();

  if (localeAliases[lower]) {
    return localeAliases[lower];
  }

  const base = lower.split(/[-_]/)[0];

  if (localeAliases[base]) {
    return localeAliases[base];
  }

  return null;
}

export function normalizeLocale(value: string | null | undefined): SupportedLocale {
  return normalizeLocaleAlias(value) ?? DEFAULT_LOCALE;
}

export function resolvePreferredLocaleFromAcceptLanguage(
  value: string | null | undefined,
): SupportedLocale {
  if (!value) {
    return DEFAULT_LOCALE;
  }

  const candidates = value
    .split(",")
    .map((entry, index) => {
      const [rawLocale, ...parameters] = entry.trim().split(";");
      const qualityParameter = parameters.find((parameter) =>
        parameter.trim().toLowerCase().startsWith("q="),
      );
      const parsedQuality = qualityParameter
        ? Number.parseFloat(qualityParameter.split("=")[1] ?? "")
        : 1;

      return {
        index,
        locale: rawLocale.trim(),
        quality: Number.isFinite(parsedQuality) ? parsedQuality : 0,
      };
    })
    .filter((candidate) => candidate.locale && candidate.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  for (const candidate of candidates) {
    const locale = normalizeLocaleAlias(candidate.locale);

    if (locale) {
      return locale;
    }
  }

  return DEFAULT_LOCALE;
}
