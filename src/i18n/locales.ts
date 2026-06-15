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

export function isSupportedLocale(
  value: string | null | undefined,
): value is SupportedLocale {
  return Boolean(value && supportedLocaleSet.has(value));
}

export function normalizeLocale(value: string | null | undefined): SupportedLocale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}
