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
  labels?: StaffActionPanelLabels;
  selectedShopId?: string;
};

type StaffRoleOptionKey = "cashier" | "manager" | "viewer";
type StaffTemplateKey =
  | "catalog_manager"
  | "shop_manager_full"
  | "staff_manager"
  | "viewer";

export type StaffActionPanelLabels = {
  archive: string;
  clearLockout: string;
  createStaff: string;
  credentialType: string;
  custom: string;
  displayName: string;
  forceCredentialRotation: string;
  forceRotation: string;
  oneTimeSignInValue: string;
  passwordLabel: string;
  pinLabel: string;
  reactivate: string;
  reason: string;
  resetCredential: string;
  revokeSessions: string;
  revokeWebAccess: string;
  role: string;
  roleOptions: Record<StaffRoleOptionKey, string>;
  sessionStatus: string;
  staffCode: string;
  staffRolePermissions: string;
  staffRowId: string;
  staffWebAccess: string;
  suspend: string;
  template: string;
  templateLabels: Record<StaffTemplateKey, string>;
  typeArchiveConfirmation: string;
  typeClearConfirmation: string;
  typePermissionsConfirmation: string;
  typeReactivateConfirmation: string;
  typeResetConfirmation: string;
  typeRevokeConfirmation: string;
  typeRotateConfirmation: string;
  typeSessionsConfirmation: string;
  typeSuspendConfirmation: string;
  updatePermissions: string;
};

const emptyState: ShopAdminActionState = {
  code: "success",
  message: "Action ready.",
  ok: true,
};

const defaultStaffActionLabels: StaffActionPanelLabels = {
  archive: "Archive",
  clearLockout: "Clear lockout",
  createStaff: "Create staff",
  credentialType: "Credential type",
  custom: "Custom",
  displayName: "Display name",
  forceCredentialRotation: "Force credential rotation",
  forceRotation: "Force rotation",
  oneTimeSignInValue: "One-time sign-in value",
  passwordLabel: "Password",
  pinLabel: "PIN",
  reactivate: "Reactivate",
  reason: "Reason",
  resetCredential: "Reset credential",
  revokeSessions: "Revoke sessions",
  revokeWebAccess: "Revoke web access",
  role: "Role",
  roleOptions: {
    cashier: "Cashier",
    manager: "Manager",
    viewer: "Viewer",
  },
  sessionStatus: "Session status",
  staffCode: "Staff code",
  staffRolePermissions: "Staff role permissions",
  staffRowId: "Staff row id",
  staffWebAccess: "Staff web access",
  suspend: "Suspend",
  template: "Template",
  templateLabels: {
    catalog_manager: "Catalog manager",
    shop_manager_full: "Shop manager full",
    staff_manager: "Staff manager",
    viewer: "Viewer",
  },
  typeArchiveConfirmation: "Type ARCHIVE as confirmation",
  typeClearConfirmation: "Type CLEAR as confirmation",
  typePermissionsConfirmation: "Type PERMISSIONS as confirmation",
  typeReactivateConfirmation: "Type REACTIVATE as confirmation",
  typeResetConfirmation: "Type RESET as confirmation",
  typeRevokeConfirmation: "Type REVOKE as confirmation",
  typeRotateConfirmation: "Type ROTATE as confirmation",
  typeSessionsConfirmation: "Type SESSIONS as confirmation",
  typeSuspendConfirmation: "Type SUSPEND as confirmation",
  updatePermissions: "Update permissions",
};

const SHOP_STAFF_WEB_ROLE_TEMPLATES = [
  { key: "shop_manager_full" },
  { key: "catalog_manager" },
  { key: "staff_manager" },
  { key: "viewer" },
] satisfies Array<{ key: StaffTemplateKey }>;

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
        className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none sm:min-h-0"
        name={name}
        required={required}
        type="text"
      />
    </label>
  );
}

function CredentialKindSelect({
  labels,
}: {
  labels: StaffActionPanelLabels;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-zinc-800">
      {labels.credentialType}
      <select
        className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none sm:min-h-0"
        name="credentialKind"
        required
      >
        <option value="password">{labels.passwordLabel}</option>
        <option value="pin">{labels.pinLabel}</option>
      </select>
    </label>
  );
}

function OneTimeDisplay({
  label,
  state,
}: {
  label: string;
  state: ShopAdminActionState;
}) {
  if (!state.temporaryCredential) {
    return null;
  }

  return (
    <div
      className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
      role="status"
    >
      <span className="block font-medium">{label}</span>
      <code className="mt-1 block break-all rounded bg-white px-2 py-1 text-zinc-950">
        {state.temporaryCredential}
      </code>
    </div>
  );
}

export function StaffActionPanel({
  canManageRolePermissions = false,
  labels = defaultStaffActionLabels,
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
        <h2 className="text-base font-semibold text-zinc-950">
          {labels.createStaff}
        </h2>
        <form action={createFormAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label={labels.staffCode} name="staffCode" required />
          <TextInput label={labels.displayName} name="displayName" required />
          <CredentialKindSelect labels={labels} />
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            {labels.role}
            <select
              className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none sm:min-h-0"
              name="roleKey"
              required
            >
              <option value="cashier">{labels.roleOptions.cashier}</option>
              <option value="manager">{labels.roleOptions.manager}</option>
              <option value="viewer">{labels.roleOptions.viewer}</option>
            </select>
          </label>
          <button className="min-h-11 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white sm:min-h-0">
            {labels.createStaff}
          </button>
        </form>
        <OneTimeDisplay
          label={labels.oneTimeSignInValue}
          state={createState}
        />
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          {labels.resetCredential}
        </h2>
        <form action={resetFormAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label={labels.staffRowId} name="staffId" required />
          <CredentialKindSelect labels={labels} />
          <TextInput label={labels.reason} name="reason" required />
          <TextInput
            label={labels.typeResetConfirmation}
            name="confirmation"
            required
          />
          <button className="min-h-11 rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950 sm:min-h-0">
            {labels.resetCredential}
          </button>
        </form>
        <OneTimeDisplay
          label={labels.oneTimeSignInValue}
          state={resetState}
        />
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          {labels.suspend}
        </h2>
        <form action={suspendStaffAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label={labels.staffRowId} name="staffId" required />
          <TextInput label={labels.reason} name="reason" required />
          <TextInput
            label={labels.typeSuspendConfirmation}
            name="confirmation"
            required
          />
          <button className="min-h-11 rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950 sm:min-h-0">
            {labels.suspend}
          </button>
        </form>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          {labels.reactivate}
        </h2>
        <form action={reactivateStaffAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label={labels.staffRowId} name="staffId" required />
          <TextInput label={labels.reason} name="reason" required />
          <TextInput
            label={labels.typeReactivateConfirmation}
            name="confirmation"
            required
          />
          <button className="min-h-11 rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-950 sm:min-h-0">
            {labels.reactivate}
          </button>
        </form>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          {labels.archive}
        </h2>
        <form action={archiveStaffAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label={labels.staffRowId} name="staffId" required />
          <TextInput label={labels.reason} name="reason" required />
          <TextInput
            label={labels.typeArchiveConfirmation}
            name="confirmation"
            required
          />
          <button className="min-h-11 rounded-md border border-zinc-400 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 sm:min-h-0">
            {labels.archive}
          </button>
        </form>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          {labels.forceCredentialRotation}
        </h2>
        <form
          action={forceStaffCredentialRotationAction}
          className="mt-3 grid gap-3"
        >
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label={labels.staffRowId} name="staffId" required />
          <TextInput label={labels.reason} name="reason" required />
          <TextInput
            label={labels.typeRotateConfirmation}
            name="confirmation"
            required
          />
          <button className="min-h-11 rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950 sm:min-h-0">
            {labels.forceRotation}
          </button>
        </form>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          {labels.clearLockout}
        </h2>
        <form action={clearStaffLockoutAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label={labels.staffRowId} name="staffId" required />
          <TextInput label={labels.reason} name="reason" required />
          <TextInput
            label={labels.typeClearConfirmation}
            name="confirmation"
            required
          />
          <button className="min-h-11 rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-950 sm:min-h-0">
            {labels.clearLockout}
          </button>
        </form>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          {labels.sessionStatus}
        </h2>
        <form action={revokeStaffWebAccessAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label={labels.staffRowId} name="staffId" required />
          <TextInput label={labels.reason} name="reason" required />
          <TextInput
            label={labels.typeRevokeConfirmation}
            name="confirmation"
            required
          />
          <button className="min-h-11 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-950 sm:min-h-0">
            {labels.revokeWebAccess}
          </button>
        </form>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          {labels.staffWebAccess}
        </h2>
        <form action={revokeStaffWebSessionsAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label={labels.staffRowId} name="staffId" required />
          <TextInput label={labels.reason} name="reason" required />
          <TextInput
            label={labels.typeSessionsConfirmation}
            name="confirmation"
            required
          />
          <button className="min-h-11 rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950 sm:min-h-0">
            {labels.revokeSessions}
          </button>
        </form>
      </section>

      {canManageRolePermissions ? (
        <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm xl:col-span-2">
          <h2 className="text-base font-semibold text-zinc-950">
            {labels.staffRolePermissions}
          </h2>
          <form action={updateStaffRolePermissionsAction} className="mt-3 grid gap-3">
            <HiddenShopInput selectedShopId={selectedShopId} />
            <label className="grid gap-1 text-sm font-medium text-zinc-800">
              {labels.role}
              <select
                className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none sm:min-h-0"
                name="roleKey"
                required
              >
                <option value="manager">{labels.roleOptions.manager}</option>
                <option value="cashier">{labels.roleOptions.cashier}</option>
                <option value="viewer">{labels.roleOptions.viewer}</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-zinc-800">
              {labels.template}
              <select
                className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none sm:min-h-0"
                name="templateKey"
              >
                <option value="">{labels.custom}</option>
                {SHOP_STAFF_WEB_ROLE_TEMPLATES.map((template) => (
                  <option key={template.key} value={template.key}>
                    {labels.templateLabels[template.key]}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {staffWebPermissions.map((permission) => (
                <label
                  className="flex min-h-11 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 sm:min-h-0"
                  key={permission}
                >
                  <input name="permissions" type="checkbox" value={permission} />
                  <span>{permission}</span>
                </label>
              ))}
            </div>
            <TextInput
              label={labels.typePermissionsConfirmation}
              name="confirmation"
              required
            />
            <button className="min-h-11 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-950 sm:min-h-0">
              {labels.updatePermissions}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
