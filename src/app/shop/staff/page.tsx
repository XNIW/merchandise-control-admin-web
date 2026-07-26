import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import {
  StaffActionPanel,
  type StaffActionPanelLabels,
  type StaffActionTargetOption,
} from "@/app/shop/_components/StaffActionPanel";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getI18n } from "@/i18n/get-locale";
import { translateText } from "@/i18n/translate-sections";
import { buildStaffSection } from "@/server/shop-admin/shop-section-data";
import {
  resolveStaffPageBundle,
  type ShopStaffReadModelStaffAccount,
} from "@/server/shop-admin/staff-read-model";
import {
  OWNER_ONLY_STAFF_WEB_PERMISSIONS,
  SHOP_STAFF_WEB_ROLE_TEMPLATES,
} from "@/server/shop-admin/staff-web-permissions";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("POS / Staff");
}

export const dynamic = "force-dynamic";

const ownerOnlyPermissionKeys = Array.from(
  OWNER_ONLY_STAFF_WEB_PERMISSIONS,
);
const ownerOnlyTemplateKeys = Object.entries(SHOP_STAFF_WEB_ROLE_TEMPLATES)
  .filter(([, permissions]) =>
    permissions.some((permission) =>
      OWNER_ONLY_STAFF_WEB_PERMISSIONS.has(permission),
    ),
  )
  .map(([templateKey]) => templateKey);

type ShopPageSearchParams = Promise<{
  action?: string | string[];
  result?: string | string[];
  shop_id?: string | string[];
}>;

function getParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];

  return Array.isArray(value) ? value[0] : value;
}

function staffActionLabels(
  t: (value: string) => string,
): StaffActionPanelLabels {
  return {
    accessWebAndSessions: t("Web access and sessions"),
    actionsAppliedTo: t("Actions applied to:"),
    advancedCredentialActions: t("Advanced credential actions"),
    advancedRolePermissions: t("Advanced — staff role web permissions"),
    archive: t("Archive"),
    archiveDangerHelp: t(
      "Archive is a destructive staff lifecycle action. Use it only when this staff should no longer be used.",
    ),
    affectedStaff: t("Affected staff"),
    clearLockout: t("Clear lockout"),
    changeStaff: t("Change staff"),
    copied: t("Copied"),
    copy: t("Copy"),
    createStaff: t("Create staff"),
    credentialCurrentHiddenNotice: t(
      "The current credential is never shown. Use reset to generate a new temporary value to communicate to staff.",
    ),
    credentialHelp: t(
      "Both are staff credentials; the old credential is never visible.",
    ),
    credentialResetHelper: t(
      "The current credential is not visible and cannot be recovered. Reset generates a new temporary value to communicate to staff.",
    ),
    credentials: t("Credentials"),
    credentialsTab: t("Credentials"),
    custom: t("Custom"),
    displayName: t("Display name"),
    doesNotCreateRoles: t("This does not create new roles."),
    findAndSelectStaff: t("Find and select staff"),
    forceCredentialRotation: t("Force credential rotation"),
    forceRotation: t("Force rotation"),
    manageThisStaff: t("Manage this staff"),
    manageStaffDescription: t(
      "Search for a staff member, select them, then manage credentials, status and web access.",
    ),
    manageStaffTitle: t("Manage POS staff"),
    noStaffSelected: t("No staff selected"),
    noStaffAccountsAvailable: t("No staff accounts available"),
    noStaffMatches: t("No staff matches this search"),
    openRoles: t("Open Roles"),
    oneTimeSignInValue: t("One-time sign-in value"),
    ownerOnlyStaffWarning: t(
      "Only a shop owner or platform administrator can manage this protected staff identity or role.",
    ),
    permissionLabels: {
      "audit.read": t("Audit — read"),
      "catalog.export": t("Catalog — export"),
      "catalog.import": t("Catalog — import"),
      "catalog.read": t("Catalog — read"),
      "catalog.write": t("Catalog — edit"),
      "devices.read": t("Devices — read"),
      "devices.write": t("Devices — manage"),
      "pos.dashboard.read": t("POS dashboard — read"),
      "settings.read": t("Settings — read"),
      "settings.write": t("Settings — edit"),
      "staff.read": t("Staff — read"),
      "staff.write": t("Staff — manage"),
      "sync.read": t("Sync — read"),
    },
    permissionsCustomHelp: t(
      "Custom does not create a new role. It only lets you choose the web permissions below for the selected existing role.",
    ),
    permissionsRoleNotice: t(
      "This section does NOT create new roles. It changes web permissions for the selected role in this shop. The change applies to every staff account with that role.",
    ),
    permissionsTemplate: t("Permission model"),
    passwordHelp: t("Password: longer alphanumeric option."),
    passwordLabel: t("Alphanumeric password, advanced use"),
    pinHelp: t("PIN POS numeric: recommended for Win7POS."),
    pinLabel: t("PIN (6 digits)"),
    posAdminMissingWarning: t(
      "No POS staff has full administrative permissions. Create or promote a POS Admin staff member to manage Win7POS.",
    ),
    reactivate: t("Reactivate"),
    reason: t("Reason"),
    resetCredential: t("Reset credential"),
    revokeSessions: t("Revoke sessions"),
    revokeWebAccess: t("Revoke web access"),
    role: t("Role"),
    rolePermissionsAdvancedHelp: t(
      "Does not create new roles. It only changes web permissions for the selected existing role.",
    ),
    rolePermissionsAdvancedTitle: t(
      "Advanced — edit existing role permissions",
    ),
    roleToModify: t("Role to modify"),
    rolesAndPermissionsDescription: t(
      "Permissions belong to shop roles, not to a single staff account. To create or modify roles, go to Roles.",
    ),
    rolesAndPermissionsTitle: t("Roles and permissions"),
    roleOptions: {
      cashier: t("Cashier"),
      manager: t("Manager"),
      pos_admin: t("POS Admin"),
      viewer: t("Viewer"),
    },
    sessionStatus: t("Session status"),
    select: t("Select"),
    selectStaffStep: t("1. Select staff"),
    selectStaffStepDescription: t(
      "Choose the POS staff member to manage. Actions below are enabled only after selection.",
    ),
    selectStaffFirst: t("Select a staff member first."),
    selectedStaff: t("Selected staff"),
    staffCredential: t("Staff credential"),
    staffCredentialKind: t("New credential type"),
    staffCode: t("Staff code"),
    staffRolePermissions: t("Advanced — staff role web permissions"),
    staffSearch: t("Search staff"),
    staffSearchPlaceholder: t("Type staff code or name"),
    staffStatusTab: t("Staff status"),
    staffStatus: t("Staff status"),
    staffActionsStep: t("2. Selected staff actions"),
    staffActionsLockedDescription: t(
      "Select a staff member first to use these actions.",
    ),
    staffWebAccess: t("Staff web access"),
    staffWebAccessHelp: t(
      "These actions do not change the POS PIN/password. They only affect staff web access and sessions.",
    ),
    suspend: t("Suspend"),
    target: t("Target"),
    template: t("Template"),
    temporaryCredentialDescription: t(
      "Shown once. Copy it now and communicate it securely to staff.",
    ),
    temporaryCredentialTitle: t("New temporary credential"),
    templateDescriptions: {
      catalog_manager: t("Products, categories, suppliers, import and export."),
      custom: t("Choose the existing role permissions manually below."),
      shop_manager_full: t("All shop web permissions."),
      staff_manager: t("Staff, devices and audit."),
      viewer: t("Read-only web access."),
    },
    templateLabels: {
      catalog_manager: t("Catalog manager"),
      shop_manager_full: t("Shop manager full"),
      staff_manager: t("Staff manager"),
      viewer: t("Viewer"),
    },
    typeArchiveConfirmation: t("Type ARCHIVE as confirmation"),
    typeClearConfirmation: t("Type CLEAR as confirmation"),
    typePermissionsConfirmation: t("Type PERMISSIONS as confirmation"),
    typeReactivateConfirmation: t("Type REACTIVATE as confirmation"),
    typeResetConfirmation: t("Type RESET as confirmation"),
    typeRevokeConfirmation: t("Type REVOKE as confirmation"),
    typeRotateConfirmation: t("Type ROTATE as confirmation"),
    typeSessionsConfirmation: t("Type SESSIONS as confirmation"),
    typeSuspendConfirmation: t("Type SUSPEND as confirmation"),
    updatePermissions: t("Update permissions"),
  };
}

function staffTargetOptions(
  staffAccounts: readonly ShopStaffReadModelStaffAccount[],
) {
  return staffAccounts.map((staff): StaffActionTargetOption => ({
    credentialKind: staff.credentialKind,
    credentialStatus: staff.credentialStatus,
    displayName: staff.displayName,
    lockedUntil: staff.lockedUntil,
    mustChangeCredential: staff.mustChangeCredential,
    roleKey: staff.roleKey,
    staffCode: staff.staffCode,
    staffId: staff.staffId,
    status: staff.status,
    updatedAt: staff.updatedAt,
  }));
}

export default async function ShopStaffPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const params = await searchParams;
  const { dictionary } = await getI18n();
  const t = (value: string) => translateText(dictionary, value);
  const requestedShopId = getParam(params, "shop_id");
  const bundle = await resolveStaffPageBundle(requestedShopId);
  const section = buildStaffSection(bundle.readModel);

  return (
    <div className="grid gap-5">
      <ShopSectionPage section={section} />
      <ActionResultBanner
        action={getParam(params, "action")}
        result={getParam(params, "result")}
      />
      {bundle.canManageStaff ? (
        <StaffActionPanel
          canManageOwnerOnlyPermissions={bundle.canManagePosAdminRole}
          canManagePosAdminRole={bundle.canManagePosAdminRole}
          canManageRolePermissions={bundle.canManageRolePermissions}
          labels={staffActionLabels(t)}
          ownerOnlyPermissionKeys={ownerOnlyPermissionKeys}
          ownerOnlyRoleKeys={bundle.ownerOnlyRoleKeys}
          ownerOnlyTemplateKeys={ownerOnlyTemplateKeys}
          selectedShopId={requestedShopId}
          staffOptions={staffTargetOptions(bundle.readModel.staffAccounts)}
        />
      ) : null}
    </div>
  );
}
