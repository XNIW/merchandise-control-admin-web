import type { Metadata } from "next";
import { CanonicalPolicyDocument } from "@/app/_components/CanonicalPolicyDocument";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const localized = await createLocalizedPageMetadata("Account Deletion");

  return {
    ...localized,
    description:
      "Current assisted account-deletion path for MerchandiseControl staging.",
    robots: { follow: false, index: false },
  };
}

export default function Page() {
  return <CanonicalPolicyDocument kind="deletion" />;
}
