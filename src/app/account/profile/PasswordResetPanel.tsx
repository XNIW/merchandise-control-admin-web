"use client";

import { useActionState } from "react";
import {
  initialAccountProfileActionState,
  sendPasswordResetEmailAction,
} from "./actions";

export function PasswordResetPanel() {
  const [state, formAction, pending] = useActionState(
    sendPasswordResetEmailAction,
    initialAccountProfileActionState,
  );

  return (
    <form action={formAction} className="grid gap-3">
      <div>
        <h2 className="text-base font-semibold text-zinc-950">
          Password reset email
        </h2>
        <p className="mt-1 text-sm leading-6 text-zinc-600">
          Request a Supabase Auth reset link for the signed-in personal account.
        </p>
      </div>
      <button
        className="w-fit rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
        disabled={pending}
      >
        {pending ? "Sending" : "Send reset email"}
      </button>
      {state.message ? (
        <p
          className={[
            "rounded-md border px-3 py-2 text-sm",
            state.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-900",
          ].join(" ")}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
