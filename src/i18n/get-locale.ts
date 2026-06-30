import "server-only";

import { cookies, headers } from "next/headers";
import { getDictionary, type Dictionary } from "./dictionaries";
import {
  LOCALE_COOKIE_NAME,
  normalizeLocaleAlias,
  resolvePreferredLocaleFromAcceptLanguage,
  type SupportedLocale,
} from "./locales";

export async function getLocale(): Promise<SupportedLocale> {
  const cookieStore = await cookies();
  const cookieLocale = normalizeLocaleAlias(
    cookieStore.get(LOCALE_COOKIE_NAME)?.value,
  );

  if (cookieLocale) {
    return cookieLocale;
  }

  const requestHeaders = await headers();

  return resolvePreferredLocaleFromAcceptLanguage(
    requestHeaders.get("accept-language"),
  );
}

export async function getI18n(): Promise<{
  dictionary: Dictionary;
  locale: SupportedLocale;
}> {
  const locale = await getLocale();

  return {
    dictionary: getDictionary(locale),
    locale,
  };
}
