"use client";

import { useActionState, useEffect, useMemo, useRef } from "react";
import {
  staffManagerWebLoginFormAction,
  type ShopCodeLoginFormState,
} from "@/app/(staff-auth)/shop/staff-login/actions";

type ShopCodeLoginFormProps = {
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

function statusMessage(code: ShopCodeLoginFormState["code"]) {
  const messages: Record<ShopCodeLoginFormState["code"], string> = {
    credential_invalid: "PIN/password is not correct for this staff account.",
    database_error:
      "Sign-in could not be verified because of a server/database error.",
    idle: "",
    locked:
      "Sign-in is temporarily blocked. Try again later or ask an admin to reset access.",
    not_configured: "Shop-code staff access is not configured in this runtime.",
    server_admin_not_configured:
      "Sign-in cannot be verified because the server admin runtime is not configured.",
    shop_inactive: "This shop is not active. Contact platform support.",
    shop_not_found: "Shop code was not found. Check the shop code and try again.",
    staff_inactive:
      "This staff account cannot open Admin Console. Ask a manager to reset access.",
    staff_not_allowed:
      "This staff account cannot open Admin Console. Use a manager staff account.",
    staff_not_found: "Staff code was not found for this shop.",
    success: "",
    unknown_error: "Sign-in could not be verified. Try again.",
    validation_failed: "Check Shop code, Staff code, and PIN/password and try again.",
  };

  return messages[code];
}

function initialStateForResult(result: string | null | undefined): ShopCodeLoginFormState {
  const code = resultCode(result);

  return {
    code,
    message: statusMessage(code),
    ok: code === "idle" || code === "success",
    shouldFocusCredential: false,
    values: {
      shopCode: "",
      staffCode: "",
    },
  };
}

export function ShopCodeLoginForm({ result }: ShopCodeLoginFormProps) {
  const initialState = useMemo(() => initialStateForResult(result), [result]);
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
        aria-label="Shop code sign in"
        className="grid gap-4"
      >
        <div className="grid gap-1.5">
          <label htmlFor="shopCode" className="text-sm font-medium text-slate-800">
            Shop code
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
            Staff code
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
            PIN / password
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
          {pending ? "Signing in" : "Sign in"}
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
