"use client";

import { useFormStatus } from "react-dom";

type PendingSubmitButtonProps = {
  children: string;
  danger?: boolean;
  disabled?: boolean;
  pendingLabel: string;
};

export function PendingSubmitButton({
  children,
  danger = false,
  disabled = false,
  pendingLabel,
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      type="submit"
      aria-busy={pending ? "true" : undefined}
      aria-disabled={isDisabled}
      disabled={isDisabled}
      className={[
        "min-h-10 rounded-md px-3 py-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        isDisabled
          ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
          : danger
            ? "border border-rose-700 bg-rose-700 text-white focus-visible:ring-rose-700"
            : "border border-slate-950 bg-slate-950 text-white focus-visible:ring-slate-950",
      ].join(" ")}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
