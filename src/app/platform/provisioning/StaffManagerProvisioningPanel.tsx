"use client";

import { useActionState } from "react";
import {
  provisionPlatformStaffManagerAction,
  type PlatformStaffManagerProvisionState,
} from "./actions";

type StaffManagerProvisioningPanelProps = {
  shops: readonly {
    label: string;
    shopId: string;
  }[];
};

const initialState: PlatformStaffManagerProvisionState = {
  code: "success",
  message: "Action ready.",
  ok: true,
};

function FieldError({
  field,
  state,
}: {
  field: string;
  state: PlatformStaffManagerProvisionState;
}) {
  const message = state.fieldErrors?.[field];

  return message ? (
    <span className="text-xs font-medium text-red-700">{message}</span>
  ) : null;
}

export function StaffManagerProvisioningPanel({
  shops,
}: StaffManagerProvisioningPanelProps) {
  const [state, formAction, pending] = useActionState(
    provisionPlatformStaffManagerAction,
    initialState,
  );
  const hasResult = state.message !== initialState.message;
  const hasShops = shops.length > 0;

  return (
    <form action={formAction} className="grid gap-4 lg:grid-cols-2">
      <label className="grid gap-1.5 text-sm font-medium text-slate-800 lg:col-span-2">
        <span>Shop</span>
        <select
          name="shopId"
          required
          className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
        >
          <option value="">Select active shop</option>
          {shops.map((shop) => (
            <option key={shop.shopId} value={shop.shopId}>
              {shop.label}
            </option>
          ))}
        </select>
        <FieldError field="shopId" state={state} />
      </label>

      <label className="grid gap-1.5 text-sm font-medium text-slate-800">
        <span>Staff code</span>
        <input
          name="staffCode"
          required
          className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm uppercase text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
        />
        <FieldError field="staffCode" state={state} />
      </label>

      <label className="grid gap-1.5 text-sm font-medium text-slate-800">
        <span>Display name</span>
        <input
          name="displayName"
          required
          className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
        />
        <FieldError field="displayName" state={state} />
      </label>

      <label className="grid gap-1.5 text-sm font-medium text-slate-800 lg:col-span-2">
        <span>Reason</span>
        <textarea
          name="reason"
          required
          rows={3}
          className="min-h-20 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
        />
        <FieldError field="reason" state={state} />
      </label>

      <div className="flex flex-col gap-3 lg:col-span-2">
        <button
          type="submit"
          aria-disabled={!hasShops || pending}
          disabled={!hasShops || pending}
          className="min-h-10 rounded-md border border-slate-950 bg-slate-950 px-3 py-2 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
        >
          {pending ? "Provisioning access" : "Provision manager access"}
        </button>

        {hasResult ? (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              state.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                : "border-red-200 bg-red-50 text-red-950"
            }`}
            role={state.ok ? "status" : "alert"}
          >
            <span className="block font-medium">{state.message}</span>
            {state.oneTimeSignInValue ? (
              <>
                <span className="mt-2 block text-xs text-emerald-900">
                  Shown once in this response. Share it manually with the
                  manager; it is not stored for later display.
                </span>
                <code className="mt-2 block break-all rounded bg-white px-2 py-1 text-slate-950">
                  {state.oneTimeSignInValue}
                </code>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </form>
  );
}
