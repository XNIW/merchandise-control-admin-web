import Link from "next/link";
import { getI18n } from "@/i18n/get-locale";
import { translateText } from "@/i18n/translate-sections";

type AccessStateStatus =
  | "not_configured"
  | "no_active_session"
  | "no_session"
  | "session_expired"
  | "revoked"
  | "viewer_only"
  | "no_shop"
  | "error"
  | "unauthorized"
  | "staff_web_login_not_implemented";

type AccessStateProps = {
  area: string;
  status: AccessStateStatus;
  reason: string;
  loginHref?: string;
};

export async function AccessState({
  area,
  status,
  reason,
  loginHref = "/auth/login",
}: AccessStateProps) {
  const { dictionary } = await getI18n();
  const showLogin =
    status === "no_session" ||
    status === "no_active_session" ||
    status === "session_expired";
  const title = dictionary.access.titles[status] ?? status;
  const formattedArea = dictionary.access.accessRequired.replace(
    "{area}",
    translateText(dictionary, area),
  );

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <section
        aria-labelledby="access-state-title"
        className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col justify-center"
      >
        <p className="text-xs font-semibold uppercase text-slate-500">
          {title}
        </p>
        <h1
          id="access-state-title"
          className="mt-3 text-3xl font-semibold tracking-normal text-slate-950"
        >
          {formattedArea}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700">
          {translateText(dictionary, reason)}
        </p>
        {showLogin ? (
          <Link
            href={loginHref}
            className="mt-6 inline-flex h-11 w-fit items-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white outline-none transition hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
          >
            {dictionary.access.signIn}
          </Link>
        ) : null}
      </section>
    </main>
  );
}
