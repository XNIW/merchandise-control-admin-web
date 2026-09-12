import type { Metadata } from "next";
import { CanonicalPolicyDocument } from "@/app/_components/CanonicalPolicyDocument";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const localized = await createLocalizedPageMetadata("Privacy Notice");

  return {
    ...localized,
    description:
      "Factual staging privacy summary for MerchandiseControl clients.",
    robots: { follow: false, index: false },
  };
}

export default function Page() {
  return <CanonicalPolicyDocument kind="privacy" />;
}
