"use client";

import { useActionState } from "react";
import {
  type AccountProfileActionState,
  initialAccountProfileActionState,
  sendPasswordResetEmailAction,
} from "./actions";

export type PasswordResetPanelLabels = {
  description: string;
  messages: Record<AccountProfileActionState["code"], string>;
  pending: string;
  submit: string;
  title: string;
};

type PasswordResetPanelProps = {
  labels: PasswordResetPanelLabels;
};

export function PasswordResetPanel({ labels }: PasswordResetPanelProps) {
  const [state, formAction, pending] = useActionState(
    sendPasswordResetEmailAction,
    initialAccountProfileActionState,
  );
  const stateMessage = labels.messages[state.code] || state.message;

  return (
    <form action={formAction} className="grid gap-3">
      <div>
        <h2 className="text-base font-semibold text-zinc-950">
          {labels.title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-zinc-600">
          {labels.description}
        </p>
      </div>
      <button
        className="w-fit rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
        disabled={pending}
      >
        {pending ? labels.pending : labels.submit}
      </button>
      {stateMessage ? (
        <p
          className={[
            "rounded-md border px-3 py-2 text-sm",
            state.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-900",
          ].join(" ")}
        >
          {stateMessage}
        </p>
      ) : null}
    </form>
  );
}
