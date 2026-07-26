"use client";

import {
  useActionState,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
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
  canManageOwnerOnlyPermissions?: boolean;
  canManagePosAdminRole?: boolean;
  canManageRolePermissions?: boolean;
  labels?: StaffActionPanelLabels;
  ownerOnlyPermissionKeys?: readonly string[];
  ownerOnlyRoleKeys?: readonly string[];
  ownerOnlyTemplateKeys?: readonly string[];
  selectedShopId?: string;
  staffOptions?: readonly StaffActionTargetOption[];
};

type StaffRoleOptionKey = "cashier" | "manager" | "pos_admin" | "viewer";
type StaffTemplateKey =
  "catalog_manager" | "shop_manager_full" | "staff_manager" | "viewer";

type StaffWebPermissionKey =
  | "catalog.read"
  | "catalog.write"
  | "catalog.import"
  | "catalog.export"
  | "staff.read"
  | "staff.write"
  | "devices.read"
  | "devices.write"
  | "audit.read"
  | "settings.read"
  | "settings.write"
  | "pos.dashboard.read"
  | "sync.read";

type StaffActionTab = "credentials" | "status" | "web";

type ButtonTone = "danger" | "neutral" | "primary" | "success" | "warning";

export type StaffActionTargetOption = {
  credentialKind: string | null;
  credentialStatus: string;
  displayName: string;
  lockedUntil: string | null;
  mustChangeCredential: boolean;
  roleKey: string;
  staffCode: string;
  staffId: string;
  status: string;
  updatedAt: string;
};

export type StaffActionPanelLabels = {
  accessWebAndSessions: string;
  actionsAppliedTo: string;
  advancedCredentialActions: string;
  advancedRolePermissions: string;
  archive: string;
  archiveDangerHelp: string;
  affectedStaff: string;
  clearLockout: string;
  changeStaff: string;
  copied: string;
  copy: string;
  createStaff: string;
  credentialCurrentHiddenNotice: string;
  credentialHelp: string;
  credentialResetHelper: string;
  credentials: string;
  credentialsTab: string;
  custom: string;
  displayName: string;
  doesNotCreateRoles: string;
  findAndSelectStaff: string;
  forceCredentialRotation: string;
  forceRotation: string;
  manageThisStaff: string;
  manageStaffDescription: string;
  manageStaffTitle: string;
  noStaffSelected: string;
  noStaffAccountsAvailable: string;
  noStaffMatches: string;
  openRoles: string;
  permissionLabels: Record<StaffWebPermissionKey, string>;
  permissionsCustomHelp: string;
  permissionsRoleNotice: string;
  permissionsTemplate: string;
  oneTimeSignInValue: string;
  ownerOnlyStaffWarning: string;
  passwordHelp: string;
  passwordLabel: string;
  pinHelp: string;
  pinLabel: string;
  posAdminMissingWarning: string;
  reactivate: string;
  reason: string;
  resetCredential: string;
  revokeSessions: string;
  revokeWebAccess: string;
  role: string;
  rolePermissionsAdvancedHelp: string;
  rolePermissionsAdvancedTitle: string;
  roleToModify: string;
  rolesAndPermissionsDescription: string;
  rolesAndPermissionsTitle: string;
  roleOptions: Record<StaffRoleOptionKey, string>;
  select: string;
  selectStaffStep: string;
  selectStaffStepDescription: string;
  selectStaffFirst: string;
  selectedStaff: string;
  sessionStatus: string;
  staffCode: string;
  staffCredential: string;
  staffCredentialKind: string;
  staffRolePermissions: string;
  staffSearch: string;
  staffSearchPlaceholder: string;
  staffStatusTab: string;
  staffStatus: string;
  staffActionsStep: string;
  staffActionsLockedDescription: string;
  staffWebAccess: string;
  staffWebAccessHelp: string;
  suspend: string;
  target: string;
  template: string;
  templateDescriptions: Record<StaffTemplateKey | "custom", string>;
  templateLabels: Record<StaffTemplateKey, string>;
  temporaryCredentialDescription: string;
  temporaryCredentialTitle: string;
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
  accessWebAndSessions: "Web access and sessions",
  actionsAppliedTo: "Actions applied to:",
  advancedCredentialActions: "Advanced credential actions",
  advancedRolePermissions: "Advanced — staff role web permissions",
  archive: "Archive",
  archiveDangerHelp:
    "Archive is a destructive staff lifecycle action. Use it only when this staff should no longer be used.",
  affectedStaff: "Affected staff",
  clearLockout: "Clear lockout",
  changeStaff: "Change staff",
  copied: "Copied",
  copy: "Copy",
  createStaff: "Create staff",
  credentialCurrentHiddenNotice:
    "The current credential is never shown. Use reset to generate a new temporary value to communicate to staff.",
  credentialHelp:
    "Both are staff credentials; the old credential is never visible.",
  credentialResetHelper:
    "The current credential is not visible and cannot be recovered. Reset generates a new temporary value to communicate to staff.",
  credentials: "Credentials",
  credentialsTab: "Credentials",
  custom: "Custom",
  displayName: "Display name",
  doesNotCreateRoles: "This does not create new roles.",
  findAndSelectStaff: "Find and select staff",
  forceCredentialRotation: "Force credential rotation",
  forceRotation: "Force rotation",
  manageThisStaff: "Manage this staff",
  manageStaffDescription:
    "Search for a staff member, select them, then manage credentials, status and web access.",
  manageStaffTitle: "Manage POS staff",
  noStaffSelected: "No staff selected",
  noStaffAccountsAvailable: "No staff accounts available",
  noStaffMatches: "No staff matches this search",
  openRoles: "Open Roles",
  oneTimeSignInValue: "One-time sign-in value",
  ownerOnlyStaffWarning:
    "Only a shop owner or platform administrator can manage this protected staff identity or role.",
  permissionLabels: {
    "audit.read": "Audit — read",
    "catalog.export": "Catalog — export",
    "catalog.import": "Catalog — import",
    "catalog.read": "Catalog — read",
    "catalog.write": "Catalog — edit",
    "devices.read": "Devices — read",
    "devices.write": "Devices — manage",
    "pos.dashboard.read": "POS dashboard — read",
    "settings.read": "Settings — read",
    "settings.write": "Settings — edit",
    "staff.read": "Staff — read",
    "staff.write": "Staff — manage",
    "sync.read": "Sync — read",
  },
  permissionsCustomHelp:
    "Custom does not create a new role. It only lets you choose the web permissions below for the selected existing role.",
  permissionsRoleNotice:
    "This section does NOT create new roles. It changes web permissions for the selected role in this shop. The change applies to every staff account with that role.",
  permissionsTemplate: "Permission model",
  passwordHelp: "Password: longer alphanumeric option.",
  passwordLabel: "Alphanumeric password, advanced use",
  pinHelp: "PIN POS numeric: recommended for Win7POS.",
  pinLabel: "PIN (6 digits)",
  posAdminMissingWarning:
    "No POS staff has full administrative permissions. Create or promote a POS Admin staff member to manage Win7POS.",
  reactivate: "Reactivate",
  reason: "Reason",
  resetCredential: "Reset credential",
  revokeSessions: "Revoke sessions",
  revokeWebAccess: "Revoke web access",
  role: "Role",
  rolePermissionsAdvancedHelp:
    "Does not create new roles. It only changes web permissions for the selected existing role.",
  rolePermissionsAdvancedTitle: "Advanced — edit existing role permissions",
  roleToModify: "Role to modify",
  rolesAndPermissionsDescription:
    "Permissions belong to shop roles, not to a single staff account. To create or modify roles, go to Roles.",
  rolesAndPermissionsTitle: "Roles and permissions",
  roleOptions: {
    cashier: "Cashier",
    manager: "Manager",
    pos_admin: "POS Admin",
    viewer: "Viewer",
  },
  select: "Select",
  selectStaffStep: "1. Select staff",
  selectStaffStepDescription:
    "Choose the POS staff member to manage. Actions below are enabled only after selection.",
  selectStaffFirst: "Select a staff member first.",
  selectedStaff: "Selected staff",
  sessionStatus: "Session status",
  staffCode: "Staff code",
  staffCredential: "Staff credential",
  staffCredentialKind: "New credential type",
  staffRolePermissions: "Advanced — staff role web permissions",
  staffSearch: "Search staff",
  staffSearchPlaceholder: "Type staff code or name",
  staffStatusTab: "Staff status",
  staffStatus: "Staff status",
  staffActionsStep: "2. Selected staff actions",
  staffActionsLockedDescription:
    "Select a staff member first to use these actions.",
  staffWebAccess: "Staff web access",
  staffWebAccessHelp:
    "These actions do not change the POS PIN/password. They only affect staff web access and sessions.",
  suspend: "Suspend",
  target: "Target",
  template: "Template",
  templateDescriptions: {
    catalog_manager: "Products, categories, suppliers, import and export.",
    custom: "Choose the existing role permissions manually below.",
    shop_manager_full: "All shop web permissions.",
    staff_manager: "Staff, devices and audit.",
    viewer: "Read-only web access.",
  },
  templateLabels: {
    catalog_manager: "Catalog manager",
    shop_manager_full: "Shop manager full",
    staff_manager: "Staff manager",
    viewer: "Viewer",
  },
  temporaryCredentialDescription:
    "Shown once. Copy it now and communicate it securely to staff.",
  temporaryCredentialTitle: "New temporary credential",
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

const staffWebPermissions: StaffWebPermissionKey[] = [
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

const SHOP_STAFF_WEB_ROLE_TEMPLATES = [
  { key: "shop_manager_full" },
  { key: "catalog_manager" },
  { key: "staff_manager" },
  { key: "viewer" },
] satisfies Array<{ key: StaffTemplateKey }>;

const staffRoleOptionKeys = new Set<string>([
  "cashier",
  "manager",
  "pos_admin",
  "viewer",
]);
const orderedStaffRoleOptions: readonly StaffRoleOptionKey[] = [
  "pos_admin",
  "manager",
  "cashier",
  "viewer",
];

const buttonToneClasses: Record<ButtonTone, string> = {
  danger: "border-red-300 bg-red-50 text-red-950 hover:bg-red-100",
  neutral: "border-zinc-300 bg-white text-zinc-950 hover:bg-zinc-50",
  primary: "border-zinc-950 bg-zinc-950 text-white hover:bg-zinc-800",
  success:
    "border-emerald-400 bg-emerald-50 text-emerald-950 hover:bg-emerald-100",
  warning: "border-amber-400 bg-amber-50 text-amber-950 hover:bg-amber-100",
};

function HiddenShopInput({ selectedShopId }: { selectedShopId?: string }) {
  return selectedShopId ? (
    <input name="shop_id" type="hidden" value={selectedShopId} />
  ) : null;
}

function HiddenStaffInput({
  selectedStaff,
}: {
  selectedStaff?: StaffActionTargetOption;
}) {
  return selectedStaff ? (
    <input name="staffId" type="hidden" value={selectedStaff.staffId} />
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
        className="min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 sm:min-h-0"
        name={name}
        required={required}
        type="text"
      />
    </label>
  );
}

function SelectField({
  children,
  label,
  name,
  required,
}: {
  children: ReactNode;
  label: string;
  name: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-zinc-800">
      {label}
      <select
        className="min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 sm:min-h-0"
        name={name}
        required={required}
      >
        {children}
      </select>
    </label>
  );
}

function CredentialKindSelect({ labels }: { labels: StaffActionPanelLabels }) {
  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-sm font-medium text-zinc-800">
        {labels.staffCredentialKind}
        <select
          className="min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 sm:min-h-0"
          defaultValue="pin"
          name="credentialKind"
          required
        >
          <option value="pin">{labels.pinLabel}</option>
          <option value="password">{labels.passwordLabel}</option>
        </select>
      </label>
      <div className="grid gap-1 text-xs leading-5 text-zinc-600">
        <p>{labels.pinHelp}</p>
        <p>{labels.passwordHelp}</p>
        <p>{labels.credentialHelp}</p>
      </div>
    </div>
  );
}

function CopyCredentialButton({
  labels,
  value,
}: {
  labels: StaffActionPanelLabels;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      className="min-h-9 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-950 outline-none hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-700"
      onClick={handleCopy}
      type="button"
    >
      {copied ? labels.copied : labels.copy}
    </button>
  );
}

function OneTimeDisplay({
  labels,
  state,
  targetLabel,
  testId,
}: {
  labels: StaffActionPanelLabels;
  state: ShopAdminActionState;
  targetLabel?: string;
  testId?: string;
}) {
  if (!state.temporaryCredential || !targetLabel) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950 shadow-sm"
      data-testid={testId}
      role="status"
    >
      <span className="block font-semibold">
        {labels.temporaryCredentialTitle}
      </span>
      <span className="mt-1 block text-xs leading-5">
        {labels.temporaryCredentialDescription}
      </span>
      <span className="mt-2 block text-xs font-semibold">
        {labels.target}: {targetLabel}
      </span>
      <code className="mt-3 block break-all rounded bg-white px-3 py-3 font-mono text-2xl font-semibold text-zinc-950">
        {state.temporaryCredential}
      </code>
      <div className="mt-2">
        <CopyCredentialButton
          labels={labels}
          value={state.temporaryCredential}
        />
      </div>
    </div>
  );
}

function ActionResultNotice({
  state,
  testId,
}: {
  state: ShopAdminActionState;
  testId?: string;
}) {
  if (state === emptyState) {
    return null;
  }

  return (
    <p
      className={[
        "rounded-md border px-3 py-2 text-sm",
        state.ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
          : "border-red-200 bg-red-50 text-red-950",
      ].join(" ")}
      data-testid={testId}
      role={state.ok ? "status" : "alert"}
    >
      {state.message}
    </p>
  );
}

function ActionPanelCard({
  children,
  className = "",
  description,
  testId,
  title,
}: {
  children: ReactNode;
  className?: string;
  description?: string;
  testId?: string;
  title: string;
}) {
  return (
    <section
      className={[
        "rounded-md border border-zinc-200 bg-white p-4 shadow-sm",
        className,
      ].join(" ")}
      data-testid={testId}
    >
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm leading-6 text-zinc-600">{description}</p>
      ) : null}
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

function FormBlock({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <div className="grid gap-3 border-t border-zinc-100 pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-zinc-950">{title}</h3>
      {description ? (
        <p className="text-xs leading-5 text-zinc-600">{description}</p>
      ) : null}
      {children}
    </div>
  );
}

function SubmitButton({
  children,
  disabled,
  tone,
}: {
  children: ReactNode;
  disabled?: boolean;
  tone: ButtonTone;
}) {
  return (
    <button
      className={[
        "min-h-11 rounded-md border px-4 py-2 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-700 sm:min-h-0",
        buttonToneClasses[tone],
        disabled ? "cursor-not-allowed opacity-50 hover:bg-inherit" : "",
      ].join(" ")}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function TargetActionForm({
  action,
  buttonLabel,
  children,
  formTestId,
  labels,
  selectedShopId,
  selectedStaff,
  tone,
}: {
  action: ComponentProps<"form">["action"];
  buttonLabel: string;
  children: ReactNode;
  formTestId?: string;
  labels: StaffActionPanelLabels;
  selectedShopId?: string;
  selectedStaff?: StaffActionTargetOption;
  tone: ButtonTone;
}) {
  const hasTarget = Boolean(selectedStaff);
  const targetLabel = selectedStaff
    ? `${selectedStaff.staffCode} · ${selectedStaff.displayName}`
    : "";

  return (
    <form action={action} className="grid gap-3" data-testid={formTestId}>
      <HiddenShopInput selectedShopId={selectedShopId} />
      <HiddenStaffInput selectedStaff={selectedStaff} />
      {hasTarget ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-950">
          {labels.target}: {targetLabel}
        </p>
      ) : (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          {labels.selectStaffFirst}
        </p>
      )}
      <fieldset
        className={[
          "grid gap-3",
          hasTarget ? "" : "pointer-events-none opacity-55",
        ].join(" ")}
        disabled={!hasTarget}
      >
        {children}
      </fieldset>
      <SubmitButton disabled={!hasTarget} tone={tone}>
        {buttonLabel}
      </SubmitButton>
    </form>
  );
}

function formatToken(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function roleLabel(labels: StaffActionPanelLabels, roleKey: string) {
  if (staffRoleOptionKeys.has(roleKey)) {
    return labels.roleOptions[roleKey as StaffRoleOptionKey];
  }

  return formatToken(roleKey);
}

function credentialLabel(
  labels: StaffActionPanelLabels,
  option: StaffActionTargetOption,
) {
  const kind =
    option.credentialKind === "pin"
      ? labels.pinLabel
      : option.credentialKind === "password"
        ? labels.passwordLabel
        : formatToken(option.credentialKind);

  return `${kind} / ${formatToken(option.credentialStatus)}`;
}

function staffSearchText(option: StaffActionTargetOption) {
  return [
    option.staffCode,
    option.displayName,
    option.roleKey,
    option.status,
    option.credentialKind ?? "",
    option.credentialStatus,
  ]
    .join(" ")
    .toLowerCase();
}

function staffActionTargetText(
  labels: StaffActionPanelLabels,
  staff: StaffActionTargetOption,
) {
  return `${staff.staffCode} · ${staff.displayName} · ${roleLabel(
    labels,
    staff.roleKey,
  )} · ${formatToken(staff.status)}`;
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "active";
  const isSuspended = status === "suspended";

  return (
    <span
      className={[
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold",
        isActive
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : isSuspended
            ? "border-amber-300 bg-amber-50 text-amber-800"
            : "border-zinc-300 bg-zinc-50 text-zinc-700",
      ].join(" ")}
    >
      {formatToken(status)}
    </span>
  );
}

function StaffActionContextBar({
  labels,
  onChangeStaff,
  selectedStaff,
}: {
  labels: StaffActionPanelLabels;
  onChangeStaff: () => void;
  selectedStaff?: StaffActionTargetOption;
}) {
  if (!selectedStaff) {
    return (
      <div
        className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
        data-testid="staff-action-context-bar"
      >
        <p className="font-semibold">{labels.noStaffSelected}</p>
        <p className="mt-1 text-xs leading-5">
          {labels.staffActionsLockedDescription}
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950 shadow-sm"
      data-testid="staff-action-context-bar"
    >
      <div
        className="flex flex-wrap items-start justify-between gap-3"
        data-testid="selected-staff-summary"
      >
        <div className="grid gap-1">
          <p className="font-semibold">
            {labels.selectedStaff}: {selectedStaff.staffCode} ·{" "}
            {selectedStaff.displayName}
          </p>
          <p className="text-xs leading-5">
            {labels.actionsAppliedTo}{" "}
            {staffActionTargetText(labels, selectedStaff)}
          </p>
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5">
            <div className="flex gap-1">
              <dt className="font-semibold">{labels.role}:</dt>
              <dd>{roleLabel(labels, selectedStaff.roleKey)}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="font-semibold">{labels.staffCredential}:</dt>
              <dd>{credentialLabel(labels, selectedStaff)}</dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={selectedStaff.status} />
          <button
            className="min-h-9 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-950 outline-none hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-700"
            data-testid="selected-staff-change-button"
            onClick={onChangeStaff}
            type="button"
          >
            {labels.changeStaff}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionTabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={[
        "min-h-10 rounded-md border px-2.5 py-1.5 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-700 sm:text-sm",
        active
          ? "border-zinc-950 bg-zinc-950 text-white"
          : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
      ].join(" ")}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function StaffTargetPicker({
  labels,
  onSelect,
  selectedStaff,
  staffOptions,
}: {
  labels: StaffActionPanelLabels;
  onSelect: (staffId: string) => void;
  selectedStaff?: StaffActionTargetOption;
  staffOptions: readonly StaffActionTargetOption[];
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredStaff = useMemo(() => {
    const matches = normalizedQuery
      ? staffOptions.filter((option) =>
          staffSearchText(option).includes(normalizedQuery),
        )
      : staffOptions;

    return matches.slice(0, 8);
  }, [normalizedQuery, staffOptions]);

  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-sm font-medium text-zinc-800">
        {labels.staffSearch}
        <input
          className="min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 sm:min-h-0"
          data-testid="staff-target-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={labels.staffSearchPlaceholder}
          type="search"
          value={query}
        />
      </label>

      <div className="grid max-h-[22rem] gap-2 overflow-y-auto pr-1">
        {staffOptions.length === 0 ? (
          <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
            {labels.noStaffAccountsAvailable}
          </p>
        ) : filteredStaff.length === 0 ? (
          <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
            {labels.noStaffMatches}
          </p>
        ) : (
          filteredStaff.map((option) => {
            const isSelected = option.staffId === selectedStaff?.staffId;

            return (
              <article
                className={[
                  "grid gap-3 rounded-md border p-3 text-sm transition",
                  isSelected
                    ? "border-emerald-400 bg-emerald-50 text-emerald-950"
                    : "border-zinc-200 bg-white text-zinc-800",
                ].join(" ")}
                data-testid="staff-target-option"
                key={option.staffId}
              >
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-zinc-100 px-2 py-1 font-mono text-base font-semibold text-zinc-950">
                      {option.staffCode}
                    </code>
                    <span className="font-medium text-zinc-950">
                      {option.displayName}
                    </span>
                  </div>
                  <dl className="grid gap-1 text-xs text-zinc-600">
                    <div>
                      <dt className="font-semibold text-zinc-700">
                        {labels.role}
                      </dt>
                      <dd>{roleLabel(labels, option.roleKey)}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-zinc-700">
                        {labels.staffStatus}
                      </dt>
                      <dd>{formatToken(option.status)}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-zinc-700">
                        {labels.staffCredential}
                      </dt>
                      <dd>{credentialLabel(labels, option)}</dd>
                    </div>
                  </dl>
                </div>
                <button
                  aria-pressed={isSelected}
                  className={[
                    "min-h-10 w-full rounded-md border px-3 py-2 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-700",
                    isSelected
                      ? "border-emerald-500 bg-emerald-600 text-white"
                      : "border-zinc-300 bg-white text-zinc-950 hover:bg-zinc-50",
                  ].join(" ")}
                  data-testid="staff-target-select-button"
                  onClick={() => onSelect(option.staffId)}
                  type="button"
                >
                  {labels.manageThisStaff}
                </button>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

function StaffRolePermissionsPanel({
  canManageOwnerOnlyPermissions,
  canManageRolePermissions,
  labels,
  ownerOnlyPermissionKeys,
  ownerOnlyRoleKeys,
  ownerOnlyTemplateKeys,
  rolesHref,
  selectedShopId,
  staffOptions,
}: {
  canManageOwnerOnlyPermissions: boolean;
  canManageRolePermissions: boolean;
  labels: StaffActionPanelLabels;
  ownerOnlyPermissionKeys: readonly string[];
  ownerOnlyRoleKeys: readonly string[];
  ownerOnlyTemplateKeys: readonly string[];
  rolesHref: string;
  selectedShopId?: string;
  staffOptions: readonly StaffActionTargetOption[];
}) {
  const availableRoleKeys = orderedStaffRoleOptions.filter(
    (candidateRoleKey) =>
      candidateRoleKey !== "pos_admin" &&
      (canManageOwnerOnlyPermissions ||
        !ownerOnlyRoleKeys.includes(candidateRoleKey)),
  );
  const [roleKey, setRoleKey] = useState<StaffRoleOptionKey>(
    availableRoleKeys[0] ?? "viewer",
  );
  const effectiveRoleKey = availableRoleKeys.includes(roleKey)
    ? roleKey
    : (availableRoleKeys[0] ?? "viewer");
  const affectedStaff = staffOptions.filter(
    (staff) => staff.roleKey === effectiveRoleKey,
  );
  const templateOptions: Array<{
    description: string;
    key: StaffTemplateKey | "custom";
    label: string;
    value: string;
  }> = [
    ...SHOP_STAFF_WEB_ROLE_TEMPLATES.filter(
      ({ key }) => !ownerOnlyTemplateKeys.includes(key),
    ).map(({ key }) => ({
        description: labels.templateDescriptions[key],
        key,
        label: labels.templateLabels[key],
        value: key,
      })),
    {
      description: labels.templateDescriptions.custom,
      key: "custom",
      label: labels.custom,
      value: "",
    },
  ];

  return (
    <ActionPanelCard
      className="min-w-0"
      description={labels.rolesAndPermissionsDescription}
      testId="staff-roles-permissions-card"
      title={labels.rolesAndPermissionsTitle}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-700">
        <p>
          <strong className="text-zinc-950">{labels.doesNotCreateRoles}</strong>{" "}
          {labels.permissionsRoleNotice}
        </p>
        <a
          className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-950 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-700"
          href={rolesHref}
        >
          {labels.openRoles}
        </a>
      </div>
      {canManageRolePermissions ? (
        <details
          className="rounded-md border border-zinc-200 bg-white p-3"
          data-testid="staff-role-permissions-advanced"
        >
          <summary className="cursor-pointer text-sm font-semibold text-zinc-950">
            {labels.rolePermissionsAdvancedTitle}
          </summary>
          <div className="mt-3 grid gap-4">
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950">
              {labels.rolePermissionsAdvancedHelp}
            </p>
            {availableRoleKeys.length > 0 ? (
            <form
              action={updateStaffRolePermissionsAction}
              className="grid gap-4"
            >
              <HiddenShopInput selectedShopId={selectedShopId} />
              <label className="grid gap-1 text-sm font-medium text-zinc-800">
                {labels.roleToModify}
                <select
                  className="min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 sm:min-h-0"
                  name="roleKey"
                  onChange={(event) =>
                    setRoleKey(event.target.value as StaffRoleOptionKey)
                  }
                  required
                  value={effectiveRoleKey}
                >
                  {availableRoleKeys.map((availableRoleKey) => (
                    <option key={availableRoleKey} value={availableRoleKey}>
                      {labels.roleOptions[availableRoleKey]}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
                <p className="font-semibold">
                  {labels.affectedStaff}: {affectedStaff.length}{" "}
                  {roleLabel(labels, effectiveRoleKey)}
                </p>
                {affectedStaff.length > 0 ? (
                  <p className="mt-1 text-xs leading-5">
                    {affectedStaff
                      .slice(0, 6)
                      .map(
                        (staff) => `${staff.staffCode} · ${staff.displayName}`,
                      )
                      .join(", ")}
                  </p>
                ) : null}
              </div>

              <fieldset className="grid gap-2">
                <legend className="text-sm font-semibold text-zinc-950">
                  {labels.permissionsTemplate}
                </legend>
                <div className="grid gap-2 lg:grid-cols-2">
                  {templateOptions.map((template) => (
                    <label
                      className="grid gap-1 rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-800"
                      key={template.key}
                    >
                      <span className="flex items-center gap-2 font-semibold text-zinc-950">
                        <input
                          defaultChecked={template.key === "custom"}
                          name="templateKey"
                          type="radio"
                          value={template.value}
                        />
                        {template.label}
                      </span>
                      <span className="text-xs leading-5 text-zinc-600">
                        {template.description}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="grid gap-2">
                <legend className="text-sm font-semibold text-zinc-950">
                  {labels.custom}
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {staffWebPermissions
                    .filter(
                      (permission) =>
                        !ownerOnlyPermissionKeys.includes(permission),
                    )
                    .map((permission) => (
                    <label
                      className="flex min-h-11 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 sm:min-h-0"
                      key={permission}
                    >
                      <input
                        name="permissions"
                        type="checkbox"
                        value={permission}
                      />
                      <span>{labels.permissionLabels[permission]}</span>
                    </label>
                    ))}
                </div>
              </fieldset>
              <TextInput
                label={labels.typePermissionsConfirmation}
                name="confirmation"
                required
              />
              <SubmitButton tone="neutral">
                {labels.updatePermissions}
              </SubmitButton>
            </form>
            ) : (
              <p
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium leading-6 text-amber-950"
                data-testid="owner-only-role-permissions-warning"
                role="alert"
              >
                {labels.ownerOnlyStaffWarning}
              </p>
            )}
          </div>
        </details>
      ) : null}
    </ActionPanelCard>
  );
}

export function StaffActionPanel({
  canManageOwnerOnlyPermissions = false,
  canManagePosAdminRole = false,
  canManageRolePermissions = false,
  labels = defaultStaffActionLabels,
  ownerOnlyPermissionKeys = [],
  ownerOnlyRoleKeys = ["pos_admin"],
  ownerOnlyTemplateKeys = [],
  selectedShopId,
  staffOptions = [],
}: StaffActionPanelProps) {
  const [createState, createFormAction] = useActionState(
    createStaffAction,
    emptyState,
  );
  const [resetState, resetFormAction] = useActionState(
    resetStaffCredentialAction,
    emptyState,
  );
  const [suspendState, suspendFormAction] = useActionState(
    suspendStaffAction,
    emptyState,
  );
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [actionTab, setActionTab] = useState<StaffActionTab>("credentials");
  const selectedStaff = staffOptions.find(
    (option) => option.staffId === selectedStaffId,
  );
  const selectedStaffIsOwnerOnly = Boolean(
    selectedStaff &&
      !canManageOwnerOnlyPermissions &&
      ownerOnlyRoleKeys.includes(selectedStaff.roleKey),
  );
  const clearSelectedStaff = () => setSelectedStaffId("");
  const orderedStatusBlocks =
    selectedStaff?.status === "suspended"
      ? (["reactivate", "suspend"] as const)
      : (["suspend", "reactivate"] as const);
  const rolesHref = selectedShopId
    ? `/shop/roles?shop_id=${encodeURIComponent(selectedShopId)}`
    : "/shop/roles";
  const hasPosAdminStaff = staffOptions.some(
    (staff) => staff.roleKey === "pos_admin" && staff.status !== "archived",
  );

  return (
    <div className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-4`}>
      {!hasPosAdminStaff ? (
        <div
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium leading-6 text-amber-950 shadow-sm"
          role="alert"
        >
          {labels.posAdminMissingWarning}
        </div>
      ) : null}

      <ActionPanelCard
        className="min-w-0"
        description={labels.manageStaffDescription}
        testId="staff-management-card"
        title={labels.manageStaffTitle}
      >
        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="grid min-w-0 content-start gap-3 lg:border-r lg:border-zinc-100 lg:pr-4">
            <StaffTargetPicker
              labels={labels}
              onSelect={setSelectedStaffId}
              selectedStaff={selectedStaff}
              staffOptions={staffOptions}
            />
          </div>

          <div className="grid min-w-0 content-start gap-3">
            <StaffActionContextBar
              labels={labels}
              onChangeStaff={clearSelectedStaff}
              selectedStaff={selectedStaff}
            />

            {selectedStaffIsOwnerOnly ? (
              <p
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium leading-6 text-amber-950"
                data-testid="owner-only-staff-action-warning"
                role="alert"
              >
                {labels.ownerOnlyStaffWarning}
              </p>
            ) : (
              <>
            <div className="grid grid-cols-3 gap-2 border-t border-zinc-100 pt-3">
              <ActionTabButton
                active={actionTab === "credentials"}
                onClick={() => setActionTab("credentials")}
              >
                {labels.credentialsTab}
              </ActionTabButton>
              <ActionTabButton
                active={actionTab === "status"}
                onClick={() => setActionTab("status")}
              >
                {labels.staffStatusTab}
              </ActionTabButton>
              <ActionTabButton
                active={actionTab === "web"}
                onClick={() => setActionTab("web")}
              >
                {labels.accessWebAndSessions}
              </ActionTabButton>
            </div>

            {actionTab === "credentials" ? (
              <div className="grid gap-4">
                <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-6 text-zinc-700">
                  {labels.credentialCurrentHiddenNotice}
                </p>
                <FormBlock
                  description={labels.credentialResetHelper}
                  title={labels.resetCredential}
                >
                  <TargetActionForm
                    action={resetFormAction}
                    buttonLabel={labels.resetCredential}
                    formTestId="reset-staff-credential-form"
                    labels={labels}
                    selectedShopId={selectedShopId}
                    selectedStaff={selectedStaff}
                    tone="warning"
                  >
                    <CredentialKindSelect labels={labels} />
                    <TextInput label={labels.reason} name="reason" required />
                    <TextInput
                      label={labels.typeResetConfirmation}
                      name="confirmation"
                      required
                    />
                  </TargetActionForm>
                  <OneTimeDisplay
                    labels={labels}
                    state={resetState}
                    targetLabel={
                      selectedStaff &&
                      resetState.targetId === selectedStaff.staffId
                        ? `${selectedStaff.staffCode} · ${selectedStaff.displayName}`
                        : undefined
                    }
                    testId="staff-reset-temporary-credential"
                  />
                  <ActionResultNotice
                    state={resetState}
                    testId="staff-reset-result"
                  />
                </FormBlock>
                <details className="rounded-md border border-zinc-200 bg-white p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-zinc-950">
                    {labels.advancedCredentialActions}
                  </summary>
                  <div className="mt-3 grid gap-4">
                    <FormBlock title={labels.forceCredentialRotation}>
                      <TargetActionForm
                        action={forceStaffCredentialRotationAction}
                        buttonLabel={labels.forceRotation}
                        labels={labels}
                        selectedShopId={selectedShopId}
                        selectedStaff={selectedStaff}
                        tone="warning"
                      >
                        <TextInput
                          label={labels.reason}
                          name="reason"
                          required
                        />
                        <TextInput
                          label={labels.typeRotateConfirmation}
                          name="confirmation"
                          required
                        />
                      </TargetActionForm>
                    </FormBlock>
                    <FormBlock title={labels.clearLockout}>
                      <TargetActionForm
                        action={clearStaffLockoutAction}
                        buttonLabel={labels.clearLockout}
                        labels={labels}
                        selectedShopId={selectedShopId}
                        selectedStaff={selectedStaff}
                        tone="success"
                      >
                        <TextInput
                          label={labels.reason}
                          name="reason"
                          required
                        />
                        <TextInput
                          label={labels.typeClearConfirmation}
                          name="confirmation"
                          required
                        />
                      </TargetActionForm>
                    </FormBlock>
                  </div>
                </details>
              </div>
            ) : null}

            {actionTab === "status" ? (
              <div className="grid gap-4">
                {selectedStaff ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                    <span className="font-semibold text-zinc-950">
                      {labels.staffStatus}:
                    </span>
                    <StatusBadge status={selectedStaff.status} />
                  </div>
                ) : null}
                {orderedStatusBlocks.map((block) =>
                  block === "suspend" ? (
                    <FormBlock key={block} title={labels.suspend}>
                      <TargetActionForm
                        action={suspendFormAction}
                        buttonLabel={labels.suspend}
                        labels={labels}
                        selectedShopId={selectedShopId}
                        selectedStaff={selectedStaff}
                        tone="warning"
                      >
                        <TextInput
                          label={labels.reason}
                          name="reason"
                          required
                        />
                        <TextInput
                          label={labels.typeSuspendConfirmation}
                          name="confirmation"
                          required
                        />
                      </TargetActionForm>
                      <ActionResultNotice
                        state={suspendState}
                        testId="staff-suspend-result"
                      />
                    </FormBlock>
                  ) : (
                    <FormBlock key={block} title={labels.reactivate}>
                      <TargetActionForm
                        action={reactivateStaffAction}
                        buttonLabel={labels.reactivate}
                        labels={labels}
                        selectedShopId={selectedShopId}
                        selectedStaff={selectedStaff}
                        tone="success"
                      >
                        <TextInput
                          label={labels.reason}
                          name="reason"
                          required
                        />
                        <TextInput
                          label={labels.typeReactivateConfirmation}
                          name="confirmation"
                          required
                        />
                      </TargetActionForm>
                    </FormBlock>
                  ),
                )}
                <details className="rounded-md border border-red-200 bg-red-50 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-red-950">
                    {labels.archive}
                  </summary>
                  <p className="mt-2 text-xs leading-5 text-red-900">
                    {labels.archiveDangerHelp}
                  </p>
                  <div className="mt-3">
                    <TargetActionForm
                      action={archiveStaffAction}
                      buttonLabel={labels.archive}
                      labels={labels}
                      selectedShopId={selectedShopId}
                      selectedStaff={selectedStaff}
                      tone="danger"
                    >
                      <TextInput label={labels.reason} name="reason" required />
                      <TextInput
                        label={labels.typeArchiveConfirmation}
                        name="confirmation"
                        required
                      />
                    </TargetActionForm>
                  </div>
                </details>
              </div>
            ) : null}

            {actionTab === "web" ? (
              <div className="grid gap-4">
                <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-6 text-zinc-700">
                  {labels.staffWebAccessHelp}
                </p>
                <FormBlock title={labels.staffWebAccess}>
                  <TargetActionForm
                    action={revokeStaffWebAccessAction}
                    buttonLabel={labels.revokeWebAccess}
                    labels={labels}
                    selectedShopId={selectedShopId}
                    selectedStaff={selectedStaff}
                    tone="danger"
                  >
                    <TextInput label={labels.reason} name="reason" required />
                    <TextInput
                      label={labels.typeRevokeConfirmation}
                      name="confirmation"
                      required
                    />
                  </TargetActionForm>
                </FormBlock>
                <FormBlock title={labels.sessionStatus}>
                  <TargetActionForm
                    action={revokeStaffWebSessionsAction}
                    buttonLabel={labels.revokeSessions}
                    labels={labels}
                    selectedShopId={selectedShopId}
                    selectedStaff={selectedStaff}
                    tone="warning"
                  >
                    <TextInput label={labels.reason} name="reason" required />
                    <TextInput
                      label={labels.typeSessionsConfirmation}
                      name="confirmation"
                      required
                    />
                  </TargetActionForm>
                </FormBlock>
              </div>
            ) : null}
              </>
            )}
          </div>
        </div>
      </ActionPanelCard>

      <div className="grid gap-4 lg:grid-cols-[minmax(18rem,30rem)_minmax(0,1fr)] lg:items-start">
        <ActionPanelCard
          className="max-w-lg lg:max-w-none"
          title={labels.createStaff}
        >
          {orderedStaffRoleOptions.some(
            (roleKey) =>
              (roleKey !== "pos_admin" || canManagePosAdminRole) &&
              (canManageOwnerOnlyPermissions ||
                !ownerOnlyRoleKeys.includes(roleKey)),
          ) ? (
          <form action={createFormAction} className="grid gap-3">
            <HiddenShopInput selectedShopId={selectedShopId} />
            <TextInput label={labels.staffCode} name="staffCode" required />
            <TextInput label={labels.displayName} name="displayName" required />
            <CredentialKindSelect labels={labels} />
            <SelectField label={labels.role} name="roleKey" required>
              {orderedStaffRoleOptions
                .filter(
                  (roleKey) =>
                    (roleKey !== "pos_admin" || canManagePosAdminRole) &&
                    (canManageOwnerOnlyPermissions ||
                      !ownerOnlyRoleKeys.includes(roleKey)),
                )
                .map((roleKey) => (
                  <option key={roleKey} value={roleKey}>
                    {labels.roleOptions[roleKey]}
                  </option>
                ))}
            </SelectField>
            <SubmitButton tone="primary">{labels.createStaff}</SubmitButton>
          </form>
          ) : (
            <p
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium leading-6 text-amber-950"
              data-testid="owner-only-create-staff-warning"
              role="alert"
            >
              {labels.ownerOnlyStaffWarning}
            </p>
          )}
          <OneTimeDisplay
            labels={labels}
            state={createState}
            targetLabel={createState.temporaryCredentialTargetLabel}
          />
          <ActionResultNotice
            state={createState}
            testId="staff-create-result"
          />
        </ActionPanelCard>

        <StaffRolePermissionsPanel
          canManageOwnerOnlyPermissions={canManageOwnerOnlyPermissions}
          canManageRolePermissions={canManageRolePermissions}
          labels={labels}
          ownerOnlyPermissionKeys={ownerOnlyPermissionKeys}
          ownerOnlyRoleKeys={ownerOnlyRoleKeys}
          ownerOnlyTemplateKeys={ownerOnlyTemplateKeys}
          rolesHref={rolesHref}
          selectedShopId={selectedShopId}
          staffOptions={staffOptions}
        />
      </div>
    </div>
  );
}
