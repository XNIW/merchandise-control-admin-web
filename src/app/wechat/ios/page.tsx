import type { Metadata } from "next";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const localized = await createLocalizedPageMetadata("WeChat iOS Return");

  return {
    ...localized,
    description:
      "Staging fallback for the MerchandiseControl iOS WeChat Universal Link.",
    robots: { follow: false, index: false },
  };
}

export default function WeChatIOSReturnPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-5 text-slate-950">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
          Shared staging
        </p>
        <h1 className="mt-3 text-2xl font-semibold">
          Return to MerchandiseControl
        </h1>
        <p className="mt-4 leading-7 text-slate-700">
          This path is reserved for iOS WeChat return handling and
          associated-domain verification. If the installed app did not open,
          return to MerchandiseControl and retry after the AppID and Universal
          Link have been approved.
        </p>
      </section>
    </main>
  );
}
