import Link from "next/link";
import { getLocale } from "@/i18n/get-locale";
import policies from "@/lib/legal/policies.json";
import { PolicySection, PublicPolicyPage } from "./PublicPolicyPage";

export async function CanonicalPolicyDocument({
  kind,
}: {
  kind: "privacy" | "deletion";
}) {
  const locale = await getLocale();
  const text = policies.locales[locale === "zh-CN" ? "zh-Hans" : locale];
  const document = text[kind];
  return (
    <PublicPolicyPage
      title={document.title}
      description={document.description}
      eyebrow={text.eyebrow}
      notice={text.notice}
    >
      {document.sections.map((section) => (
        <PolicySection key={section.title} title={section.title}>
          {section.blocks.map((block) => (
            <p key={block.text}>
              {block.kind === "item" ? "• " : ""}
              {block.text}
            </p>
          ))}
        </PolicySection>
      ))}
      <p className="text-sm text-slate-500">
        {text.versionLabel}: {policies.contentVersion}
      </p>
      <div className="flex flex-wrap gap-4">
        <Link
          className="text-emerald-800 underline"
          href={kind === "privacy" ? "/account-deletion" : "/privacy"}
        >
          {kind === "privacy" ? text.deletionLabel : text.privacyLabel}
        </Link>
        {kind === "deletion" && (
          <Link className="text-emerald-800 underline" href="/account/profile">
            {text.profileLabel}
          </Link>
        )}
      </div>
    </PublicPolicyPage>
  );
}
