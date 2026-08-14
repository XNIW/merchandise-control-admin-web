import type { Metadata } from "next";
import Link from "next/link";
import {
  PolicySection,
  PublicPolicyPage,
} from "@/app/_components/PublicPolicyPage";
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

export default function AccountDeletionPage() {
  return (
    <PublicPolicyPage
      description="The current assisted request path and the limits that apply to personal accounts and shop data."
      eyebrow="MerchandiseControl shared staging"
      title="Request account deletion"
    >
      <PolicySection title="Current request path">
        <p>
          There is no self-service deletion endpoint in the current staging
          application. This page does not submit or delete an account.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Open the{" "}
            <Link
              className="font-medium text-emerald-800 underline"
              href="/account/profile"
            >
              authenticated account profile
            </Link>{" "}
            and confirm which personal account is signed in.
          </li>
          <li>
            Use the support channel already established with the owner or
            manager of your authorized shop and ask for a personal-account
            deletion request to be escalated to the MerchandiseControl platform
            operator.
          </li>
          <li>
            The operator verifies the requester, memberships, linked login
            methods and records that must be retained for security, audit,
            transaction integrity or legal review before applying any change.
          </li>
          <li>
            Receive the outcome through that same established support channel.
          </li>
        </ol>
        <p>
          Do not send a password, WeChat AppSecret, client secret, token,
          session key, QR/2FA challenge or private signing key with the request.
        </p>
      </PolicySection>

      <PolicySection title="What the request can cover">
        <p>
          After identity and scope review, the request can cover the personal
          Auth account, profile and linked identity records. Shop business data,
          financial records, append-only audit evidence and security records may
          need to be retained, restricted or de-identified rather than erased.
          The operator must report the actual outcome instead of promising a
          deletion that the current system cannot perform safely.
        </p>
      </PolicySection>

      <PolicySection title="POS staff credentials">
        <p>
          POS staff credentials are shop-scoped and separate from the personal
          account. Ask the shop owner or manager to suspend or remove a staff
          credential separately when that is also required.
        </p>
      </PolicySection>

      <PolicySection title="Client data after completion">
        <p>
          Log out on every client. Pending offline catalog or image work should
          be discarded when requested, and application storage should be cleared
          or the app removed where appropriate. These client actions do not
          replace the server-side request.
        </p>
      </PolicySection>

      <p className="text-sm text-slate-500">
        Last factual update: 14 August 2026.
      </p>
    </PublicPolicyPage>
  );
}
