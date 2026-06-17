import "server-only";

import type { Metadata } from "next";
import { getI18n } from "./get-locale";
import { translateText } from "./translate-sections";

const appTitle = "MerchandiseControl Admin Web";

export async function createRootMetadata(): Promise<Metadata> {
  const { dictionary } = await getI18n();

  return {
    description: translateText(
      dictionary,
      "Admin Web for MerchandiseControl Platform and Shop consoles.",
    ),
    title: appTitle,
  };
}

export async function createLocalizedPageMetadata(
  titleKey: string,
): Promise<Metadata> {
  const { dictionary } = await getI18n();
  const title = translateText(dictionary, titleKey);

  return {
    title: `${title} | ${appTitle}`,
  };
}
