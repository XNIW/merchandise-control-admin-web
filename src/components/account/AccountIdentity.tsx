import {
  accountIdentityPrimaryText,
  accountOriginLabel,
  accountProfileLabel,
  shortAccountProfileId,
  type AccountIdentitySummary,
} from "@/lib/account-identity";
import { DEFAULT_LOCALE, type SupportedLocale } from "@/i18n/locales";

type AccountIdentityProps = {
  identity: AccountIdentitySummary;
  locale?: SupportedLocale;
};

function ProviderIcon({ origin }: { origin: AccountIdentitySummary["origin"] }) {
  const commonClassName = "size-4";

  if (origin === "google") {
    return (
      <span
        aria-hidden="true"
        className="text-[0.8rem] font-bold leading-none text-sky-700"
      >
        G
      </span>
    );
  }

  if (origin === "email") {
    return (
      <svg
        aria-hidden="true"
        className={commonClassName}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        viewBox="0 0 24 24"
      >
        <path d="M4 6h16v12H4z" />
        <path d="m4 7 8 6 8-6" />
      </svg>
    );
  }

  if (origin === "apple") {
    return (
      <span
        aria-hidden="true"
        className="text-[0.78rem] font-bold leading-none text-slate-900"
      >
        A
      </span>
    );
  }

  if (origin === "wechat") {
    return (
      <svg
        aria-hidden="true"
        className={commonClassName}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        viewBox="0 0 24 24"
      >
        <path d="M9 15.5c-3 0-5.5-1.9-5.5-4.3S6 7 9 7s5.5 1.9 5.5 4.2S12 15.5 9 15.5Z" />
        <path d="M13.5 12.5c3.1.2 5.5 2 5.5 4.2 0 1-.5 1.9-1.3 2.6" />
        <path d="M6.8 15.1 5 17" />
        <path d="m16.8 19.2 1.7 1.4" />
        <path d="M7.3 10.7h.1" />
        <path d="M10.8 10.7h.1" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className={commonClassName}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
    >
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function iconTone(origin: AccountIdentitySummary["origin"]) {
  switch (origin) {
    case "apple":
      return "border-slate-200 bg-slate-50 text-slate-900";
    case "email":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "google":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "wechat":
      return "border-teal-200 bg-teal-50 text-teal-800";
    case "unknown":
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

export function AccountIdentity({
  identity,
  locale = DEFAULT_LOCALE,
}: AccountIdentityProps) {
  const primary = accountIdentityPrimaryText(identity, locale);
  const originLabel = accountOriginLabel(identity.origin, locale);
  const profileLabel = accountProfileLabel(locale);
  const profileId = shortAccountProfileId(identity.profileId);
  const displayNameSecondary =
    identity.displayName && identity.displayName !== primary
      ? identity.displayName
      : null;

  return (
    <div className="flex min-w-0 items-start gap-2">
      <span
        className={[
          "mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md border",
          iconTone(identity.origin),
        ].join(" ")}
      >
        <ProviderIcon origin={identity.origin} />
      </span>
      <span className="grid min-w-0 gap-1">
        <span className="min-w-0 break-words text-sm font-semibold leading-5 text-slate-950 [overflow-wrap:anywhere]">
          {primary}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="inline-flex max-w-full items-center rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[0.72rem] font-semibold leading-4 text-slate-700">
            {originLabel}
          </span>
          {displayNameSecondary ? (
            <span className="max-w-full break-words text-xs leading-4 text-slate-600 [overflow-wrap:anywhere]">
              {displayNameSecondary}
            </span>
          ) : null}
        </span>
        <span className="font-mono text-xs leading-4 text-slate-500">
          {profileLabel}: {profileId}
        </span>
      </span>
    </div>
  );
}
