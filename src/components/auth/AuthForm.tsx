"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useMemo } from "react";
import {
  accountSignInAction,
  googleSignInAction,
  type AccountSignInState,
} from "@/app/auth/login/actions";
import { isSafeInternalNextPath } from "@/lib/auth/oauth-redirect";
import type { Dictionary } from "@/i18n/dictionaries";

type AuthFormProps = {
  labels: Dictionary["authForm"];
  isConfigured: boolean;
  formLabel?: string;
  resultMessage?: string;
};

const initialState: AccountSignInState = {
  message: "",
  status: "idle",
};

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 flex-none"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M17.64 9.2c0-.63-.06-1.24-.16-1.82H9v3.44h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.6Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.46-.8 5.95-2.19l-2.91-2.26c-.8.54-1.84.86-3.04.86-2.35 0-4.33-1.58-5.04-3.71H.95v2.33A9 9 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.96 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.16.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.82.95 4.03l3.01-2.33Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.58-2.58A8.63 8.63 0 0 0 9 0 9 9 0 0 0 .95 4.97L3.96 7.3C4.67 5.16 6.65 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function isSafeRequestedNextPath(
  requested: string | null,
): requested is string {
  return Boolean(
    requested?.startsWith("/") &&
      !requested.startsWith("//") &&
      isSafeInternalNextPath(requested),
  );
}

export function AuthForm({
  formLabel = "Admin account sign in",
  isConfigured,
  labels,
  resultMessage,
}: AuthFormProps) {
  const searchParams = useSearchParams();
  const [state, formAction, pending] = useActionState(
    accountSignInAction,
    initialState,
  );
  const nextPath = useMemo(() => {
    const requested = searchParams.get("next");

    return isSafeRequestedNextPath(requested) ? requested : "/";
  }, [searchParams]);

  return (
    <div className="grid gap-4">
      <form
        action={googleSignInAction}
        aria-label={`${formLabel} Google`}
        className="grid"
      >
        <input name="next" type="hidden" value={nextPath} />
        <button
          type="submit"
          disabled={!isConfigured}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
        >
          <GoogleIcon />
          <span>{labels.googleSubmit}</span>
        </button>
      </form>

      {resultMessage ? (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          {resultMessage}
        </p>
      ) : null}

      <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
        <span className="h-px flex-1 bg-slate-200" />
        <span>{labels.passwordDivider}</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form
        action={formAction}
        className="grid gap-4"
        aria-label={formLabel}
      >
        <input name="next" type="hidden" value={nextPath} />
        <div className="grid gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-slate-800">
            {labels.email}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/15"
          />
        </div>

        <div className="grid gap-1.5">
          <label
            htmlFor="password"
            className="text-sm font-medium text-slate-800"
          >
            {labels.password}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/15"
          />
        </div>

        <button
          type="submit"
          disabled={pending || !isConfigured}
          className="inline-flex h-11 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white outline-none transition hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
        >
          {pending ? labels.pending : labels.submit}
        </button>

        {state.message ? (
          <p
            role="status"
            aria-live="polite"
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
