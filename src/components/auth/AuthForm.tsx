"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useMemo } from "react";
import {
  accountSignInAction,
  googleSignInAction,
  type AccountSignInState,
} from "@/app/auth/login/actions";
import type { Dictionary } from "@/i18n/dictionaries";

type AuthFormProps = {
  labels: Dictionary["authForm"];
  isConfigured: boolean;
  formLabel?: string;
};

const initialState: AccountSignInState = {
  message: "",
  status: "idle",
};

function isSafeInternalNextPath(value: string | null): value is string {
  return Boolean(value?.startsWith("/") && !value.startsWith("//"));
}

export function AuthForm({
  formLabel = "Admin account sign in",
  isConfigured,
  labels,
}: AuthFormProps) {
  const searchParams = useSearchParams();
  const [state, formAction, pending] = useActionState(
    accountSignInAction,
    initialState,
  );
  const nextPath = useMemo(() => {
    const requested = searchParams.get("next");

    return isSafeInternalNextPath(requested) ? requested : "/";
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
          {labels.googleSubmit}
        </button>
      </form>

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
