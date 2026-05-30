import Link from "next/link";

type AccessStateStatus =
  | "not_configured"
  | "no_session"
  | "revoked"
  | "viewer_only"
  | "no_shop"
  | "error";

type AccessStateProps = {
  area: string;
  status: AccessStateStatus;
  reason: string;
  loginHref?: string;
};

const titleByStatus: Record<AccessStateStatus, string> = {
  not_configured: "Runtime not configured",
  no_session: "No active session",
  revoked: "Access revoked",
  viewer_only: "Admin access required",
  no_shop: "No shop access",
  error: "Access check failed",
};

function formatArea(area: string) {
  return `${area} access required`;
}

export function AccessState({
  area,
  status,
  reason,
  loginHref = "/auth/login",
}: AccessStateProps) {
  const showLogin = status === "no_session";

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <section
        aria-labelledby="access-state-title"
        className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col justify-center"
      >
        <p className="text-xs font-semibold uppercase text-slate-500">
          {titleByStatus[status]}
        </p>
        <h1
          id="access-state-title"
          className="mt-3 text-3xl font-semibold tracking-normal text-slate-950"
        >
          {formatArea(area)}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700">
          {reason}
        </p>
        {showLogin ? (
          <Link
            href={loginHref}
            className="mt-6 inline-flex h-11 w-fit items-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white outline-none transition hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
          >
            Sign in
          </Link>
        ) : null}
      </section>
    </main>
  );
}
