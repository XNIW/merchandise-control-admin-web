"use client";

import { useActionState, useEffect, useMemo, useRef } from "react";
import {
  staffManagerWebLoginFormAction,
  type ShopCodeLoginFormState,
} from "@/app/(staff-auth)/shop/staff-login/actions";
import type { Dictionary } from "@/i18n/dictionaries";

type ShopCodeLoginFormProps = {
  labels: Dictionary["shopCodeLogin"];
  nextPath?: string;
  result?: string | null;
};

const loginCodes = [
  "credential_invalid",
  "database_error",
  "locked",
  "not_configured",
  "server_admin_not_configured",
  "shop_inactive",
  "shop_not_found",
  "staff_inactive",
  "staff_not_allowed",
  "staff_not_found",
  "success",
  "unknown_error",
  "validation_failed",
] as const satisfies readonly ShopCodeLoginFormState["code"][];

function resultCode(result: string | null | undefined): ShopCodeLoginFormState["code"] {
  if (!result) {
    return "idle";
  }

  return loginCodes.includes(result as (typeof loginCodes)[number])
    ? (result as ShopCodeLoginFormState["code"])
    : "unknown_error";
}

function initialStateForResult(
  result: string | null | undefined,
  labels: Dictionary["shopCodeLogin"],
): ShopCodeLoginFormState {
  const code = resultCode(result);

  return {
    code,
    message: labels.messages[code],
    ok: code === "idle" || code === "success",
    shouldFocusCredential: false,
    values: {
      shopCode: "",
      staffCode: "",
    },
  };
}

export function ShopCodeLoginForm({
  labels,
  nextPath = "/shop",
  result,
}: ShopCodeLoginFormProps) {
  const initialState = useMemo(
    () => initialStateForResult(result, labels),
    [labels, result],
  );
  const [state, formAction, pending] = useActionState(
    staffManagerWebLoginFormAction,
    initialState,
  );
  const credentialRef = useRef<HTMLInputElement>(null);
  const formKey = `${state.code}:${state.values.shopCode}:${state.values.staffCode}`;

  useEffect(() => {
    if (!state.ok && state.shouldFocusCredential) {
      credentialRef.current?.focus();
    }
  }, [state.code, state.ok, state.shouldFocusCredential]);

  return (
    <>
      <form
        key={formKey}
        action={formAction}
        aria-label={labels.formLabel}
        className="grid gap-4"
      >
        <input name="next" type="hidden" value={nextPath} />
        <div className="grid gap-1.5">
          <label htmlFor="shopCode" className="text-sm font-medium text-slate-800">
            {labels.shopCode}
          </label>
          <input
            id="shopCode"
            name="shopCode"
            autoComplete="organization"
            defaultValue={state.values.shopCode}
            required
            className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
          />
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="staffCode" className="text-sm font-medium text-slate-800">
            {labels.staffCode}
          </label>
          <input
            id="staffCode"
            name="staffCode"
            autoComplete="username"
            defaultValue={state.values.staffCode}
            required
            className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
          />
        </div>

        <div className="grid gap-1.5">
          <label
            htmlFor="credential"
            className="text-sm font-medium text-slate-800"
          >
            {labels.credential}
          </label>
          <input
            ref={credentialRef}
            id="credential"
            name="credential"
            type="password"
            autoComplete="current-password"
            required
            className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white outline-none transition hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-emerald-700/60"
        >
          {pending ? labels.pending : labels.submit}
        </button>
      </form>

      {state.message ? (
        <p
          role={state.ok ? "status" : "alert"}
          aria-live="polite"
          className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          {state.message}
        </p>
      ) : null}
    </>
  );
}
