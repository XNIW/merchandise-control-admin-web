"use client";

import { useActionState } from "react";
import {
  archiveStaffAction,
  clearStaffLockoutAction,
  createStaffAction,
  forceStaffCredentialRotationAction,
  reactivateStaffAction,
  revokeStaffWebAccessAction,
  revokeStaffWebSessionsAction,
  resetStaffCredentialAction,
  suspendStaffAction,
  updateStaffRolePermissionsAction,
  type ShopAdminActionState,
} from "@/app/shop/actions";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";

type StaffActionPanelProps = {
  canManageRolePermissions?: boolean;
  selectedShopId?: string;
};

const emptyState: ShopAdminActionState = {
  code: "success",
  message: "Action ready.",
  ok: true,
};

const SHOP_STAFF_WEB_ROLE_TEMPLATES = [
  { key: "shop_manager_full", label: "Shop manager full" },
  { key: "catalog_manager", label: "Catalog manager" },
  { key: "staff_manager", label: "Staff manager" },
  { key: "viewer", label: "Viewer" },
];

const staffWebPermissions = [
  "catalog.read",
  "catalog.write",
  "catalog.import",
  "catalog.export",
  "staff.read",
  "staff.write",
  "devices.read",
  "devices.write",
  "audit.read",
  "settings.read",
  "settings.write",
  "pos.dashboard.read",
  "sync.read",
];

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

function CredentialKindSelect() {
  return (
    <label className="grid gap-1 text-sm font-medium text-zinc-800">
      Credential type
      <select
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
        name="credentialKind"
        required
      >
        <option value="password">Password</option>
        <option value="pin">PIN</option>
      </select>
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

export function StaffActionPanel({
  canManageRolePermissions = false,
  selectedShopId,
}: StaffActionPanelProps) {
  const [createState, createFormAction] = useActionState(
    createStaffAction,
    emptyState,
  );
  const [resetState, resetFormAction] = useActionState(
    resetStaffCredentialAction,
    emptyState,
  );

  return (
    <div className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-4 md:grid-cols-2 xl:grid-cols-4`}>
      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">Create staff</h2>
        <form action={createFormAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Staff code" name="staffCode" required />
          <TextInput label="Display name" name="displayName" required />
          <CredentialKindSelect />
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
          <CredentialKindSelect />
          <TextInput label="Reason" name="reason" required />
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
          <TextInput label="Reason" name="reason" required />
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
          <TextInput label="Reason" name="reason" required />
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
          <TextInput label="Reason" name="reason" required />
          <TextInput label="Type ARCHIVE as confirmation" name="confirmation" required />
          <button className="rounded-md border border-zinc-400 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950">
            Archive
          </button>
        </form>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          Force credential rotation
        </h2>
        <form
          action={forceStaffCredentialRotationAction}
          className="mt-3 grid gap-3"
        >
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Staff row id" name="staffId" required />
          <TextInput label="Reason" name="reason" required />
          <TextInput label="Type ROTATE as confirmation" name="confirmation" required />
          <button className="rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950">
            Force rotation
          </button>
        </form>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          Clear lockout
        </h2>
        <form action={clearStaffLockoutAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Staff row id" name="staffId" required />
          <TextInput label="Reason" name="reason" required />
          <TextInput label="Type CLEAR as confirmation" name="confirmation" required />
          <button className="rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-950">
            Clear lockout
          </button>
        </form>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          Staff web access
        </h2>
        <form action={revokeStaffWebAccessAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Staff row id" name="staffId" required />
          <TextInput label="Reason" name="reason" required />
          <TextInput label="Type REVOKE as confirmation" name="confirmation" required />
          <button className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-950">
            Revoke web access
          </button>
        </form>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          Session status
        </h2>
        <form action={revokeStaffWebSessionsAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Staff row id" name="staffId" required />
          <TextInput label="Reason" name="reason" required />
          <TextInput
            label="Type SESSIONS as confirmation"
            name="confirmation"
            required
          />
          <button className="rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950">
            Revoke sessions
          </button>
        </form>
      </section>

      {canManageRolePermissions ? (
        <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm xl:col-span-2">
          <h2 className="text-base font-semibold text-zinc-950">
            Staff role permissions
          </h2>
          <form action={updateStaffRolePermissionsAction} className="mt-3 grid gap-3">
            <HiddenShopInput selectedShopId={selectedShopId} />
            <label className="grid gap-1 text-sm font-medium text-zinc-800">
              Role
              <select
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
                name="roleKey"
                required
              >
                <option value="manager">Manager</option>
                <option value="cashier">Cashier</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-zinc-800">
              Template
              <select
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
                name="templateKey"
              >
                <option value="">Custom</option>
                {SHOP_STAFF_WEB_ROLE_TEMPLATES.map((template) => (
                  <option key={template.key} value={template.key}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {staffWebPermissions.map((permission) => (
                <label
                  className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800"
                  key={permission}
                >
                  <input name="permissions" type="checkbox" value={permission} />
                  <span>{permission}</span>
                </label>
              ))}
            </div>
            <TextInput
              label="Type PERMISSIONS as confirmation"
              name="confirmation"
              required
            />
            <button className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-950">
              Update permissions
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
