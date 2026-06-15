import "server-only";

import { cookies } from "next/headers";
import { getDictionary, type Dictionary } from "./dictionaries";
import {
  LOCALE_COOKIE_NAME,
  normalizeLocale,
  type SupportedLocale,
} from "./locales";

export async function getLocale(): Promise<SupportedLocale> {
  const cookieStore = await cookies();

  return normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
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
