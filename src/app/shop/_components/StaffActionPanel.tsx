"use client";

import { useActionState } from "react";
import {
  archiveStaffAction,
  createStaffAction,
  reactivateStaffAction,
  resetStaffCredentialAction,
  suspendStaffAction,
  type ShopAdminActionState,
} from "@/app/shop/actions";

type StaffActionPanelProps = {
  selectedShopId?: string;
};

const emptyState: ShopAdminActionState = {
  code: "success",
  message: "Action ready.",
  ok: true,
};

function HiddenShopInput({ selectedShopId }: { selectedShopId?: string }) {
  return selectedShopId ? (
    <input name="shop_id" type="hidden" value={selectedShopId} />
  ) : null;
}

function TextInput({
  label,
  name,
  required,
}: {
  label: string;
  name: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-zinc-800">
      {label}
      <input
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
        name={name}
        required={required}
        type="text"
      />
    </label>
  );
}

function OneTimeDisplay({ state }: { state: ShopAdminActionState }) {
  if (!state.temporaryCredential) {
    return null;
  }

  return (
    <div
      className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
      role="status"
    >
      <span className="block font-medium">One-time sign-in value</span>
      <code className="mt-1 block break-all rounded bg-white px-2 py-1 text-zinc-950">
        {state.temporaryCredential}
      </code>
    </div>
  );
}

export function StaffActionPanel({ selectedShopId }: StaffActionPanelProps) {
  const [createState, createFormAction] = useActionState(
    createStaffAction,
    emptyState,
  );
  const [resetState, resetFormAction] = useActionState(
    resetStaffCredentialAction,
    emptyState,
  );

  return (
    <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-5">
      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">Create staff</h2>
        <form action={createFormAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Staff code" name="staffCode" required />
          <TextInput label="Display name" name="displayName" required />
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            Role
            <select
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
              name="roleKey"
              required
            >
              <option value="cashier">Cashier</option>
              <option value="manager">Manager</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <button className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
            Create staff
          </button>
        </form>
        <OneTimeDisplay state={createState} />
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          Reset credential
        </h2>
        <form action={resetFormAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Staff row id" name="staffId" required />
          <TextInput label="Type RESET as confirmation" name="confirmation" required />
          <button className="rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950">
            Reset credential
          </button>
        </form>
        <OneTimeDisplay state={resetState} />
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">Suspend</h2>
        <form action={suspendStaffAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Staff row id" name="staffId" required />
          <TextInput label="Reason" name="reason" />
          <TextInput label="Type SUSPEND as confirmation" name="confirmation" required />
          <button className="rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950">
            Suspend
          </button>
        </form>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">Reactivate</h2>
        <form action={reactivateStaffAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Staff row id" name="staffId" required />
          <TextInput label="Reason" name="reason" />
          <TextInput
            label="Type REACTIVATE as confirmation"
            name="confirmation"
            required
          />
          <button className="rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-950">
            Reactivate
          </button>
        </form>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">Archive</h2>
        <form action={archiveStaffAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Staff row id" name="staffId" required />
          <TextInput label="Reason" name="reason" />
          <TextInput label="Type ARCHIVE as confirmation" name="confirmation" required />
          <button className="rounded-md border border-zinc-400 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950">
            Archive
          </button>
        </form>
      </section>
    </div>
  );
}
