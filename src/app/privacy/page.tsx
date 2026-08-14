import type { Metadata } from "next";
import Link from "next/link";
import {
  PolicySection,
  PublicPolicyPage,
} from "@/app/_components/PublicPolicyPage";
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

export default function PrivacyPage() {
  return (
    <PublicPolicyPage
      description="How the current MerchandiseControl staging clients handle personal, shop and technical data."
      eyebrow="MerchandiseControl shared staging"
      title="Privacy notice"
    >
      <PolicySection title="Data handled in the current integration">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Personal-account identity data, including a profile identifier,
            display name, optional email, authentication providers and the
            server-side WeChat identity link when WeChat sign-in is enabled.
          </li>
          <li>
            Authorized shop memberships, shop names and the capabilities needed
            to decide which shop data and catalog actions are available.
          </li>
          <li>
            Shop-scoped catalog, price, sales, payment, refund, device, staff
            attribution, audit and synchronization information. Mini Program
            sales and staff surfaces are read-only.
          </li>
          <li>
            Product photos selected from the camera or photo library. The
            current flow processes bounded image variants and stores private
            product images behind short-lived signed access URLs.
          </li>
          <li>
            Security and reliability data such as opaque sessions, challenge
            state, timestamps, redacted error codes, device-scoped identifiers,
            rate-limit state and audit records.
          </li>
          <li>
            Mini Program local data such as locale, active shop, a random device
            identifier, sync watermarks and pending catalog/image work. The
            bearer session is designed to remain memory-only.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="Why this data is used">
        <p>
          The data is used to authenticate a personal account, enforce shop
          isolation and permissions, show authorized business information,
          process approved catalog changes, synchronize clients, protect the
          service and investigate operational failures.
        </p>
      </PolicySection>

      <PolicySection title="Systems involved">
        <p>
          The shared staging path uses the MerchandiseControl Admin boundary,
          Supabase Auth, Postgres and private Storage, and the applicable client
          platform. WeChat receives the data required for its authorization and
          platform flows. No client contains a Supabase service-role key,
          WeChat AppSecret or Mini Program session key.
        </p>
      </PolicySection>

      <PolicySection title="Camera and photo-library access">
        <p>
          Camera or photo-library access is requested only when an authorized
          user starts a product-image action. Cancelling the picker does not
          create or change a product image. Exact platform permission wording
          remains subject to portal and owner review.
        </p>
      </PolicySection>

      <PolicySection title="Retention and user controls">
        <p>
          Logout clears the active client session and scoped UI state. Business,
          security and audit records can remain subject to operational,
          integrity and legal requirements; this staging notice does not promise
          an unsupported retention period or deletion outcome.
        </p>
        <p>
          For the current deletion-request path, read the{" "}
          <Link
            className="font-medium text-emerald-800 underline"
            href="/account-deletion"
          >
            account deletion instructions
          </Link>
          .
        </p>
      </PolicySection>

      <PolicySection title="Personal accounts and POS staff are separate">
        <p>
          A MerchandiseControl personal account and a shop-scoped POS staff
          credential are separate authentication systems. Changing or deleting
          one does not automatically change or delete the other.
        </p>
      </PolicySection>

      <p className="text-sm text-slate-500">
        Last factual update: 14 August 2026.
      </p>
    </PublicPolicyPage>
  );
}
