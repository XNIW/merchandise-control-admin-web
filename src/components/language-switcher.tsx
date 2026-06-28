"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ChangeEvent } from "react";
import {
  LOCALE_COOKIE_NAME,
  isSupportedLocale,
  supportedLanguageOptions,
  type SupportedLocale,
} from "@/i18n/locales";

type LanguageSwitcherProps = {
  className?: string;
  label: string;
  locale: SupportedLocale;
  tone?: "emerald" | "slate";
};

const toneClassNames: Record<NonNullable<LanguageSwitcherProps["tone"]>, string> = {
  emerald:
    "border-emerald-200 bg-white text-emerald-950 focus:border-emerald-700 focus:ring-emerald-700/20",
  slate:
    "border-slate-300 bg-white text-slate-900 focus:border-slate-950 focus:ring-slate-950/15",
};

export function LanguageSwitcher({
  className = "",
  label,
  locale,
  tone = "slate",
}: LanguageSwitcherProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function handleLocaleChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextLocale = event.target.value;

    if (!isSupportedLocale(nextLocale)) {
      return;
    }

    document.cookie = [
      `${LOCALE_COOKIE_NAME}=${encodeURIComponent(nextLocale)}`,
      "Path=/",
      "Max-Age=31536000",
      "SameSite=Lax",
    ].join("; ");

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <label
      className={[
        "inline-flex min-w-0 items-center gap-2 text-xs font-semibold text-inherit",
        className,
      ].join(" ")}
    >
      <span className="shrink-0 uppercase tracking-normal opacity-70">{label}</span>
      <select
        id="admin-locale"
        aria-label={label}
        className={[
          "h-11 min-w-28 rounded-md border px-3 text-sm font-medium outline-none transition focus:ring-2 md:h-8 md:px-2 md:text-xs",
          toneClassNames[tone],
        ].join(" ")}
        onChange={handleLocaleChange}
        value={locale}
      >
        {supportedLanguageOptions.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
