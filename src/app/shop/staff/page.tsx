import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import {
  StaffActionPanel,
  type StaffActionPanelLabels,
} from "@/app/shop/_components/StaffActionPanel";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getI18n } from "@/i18n/get-locale";
import { translateText } from "@/i18n/translate-sections";
import { resolveShopActionContext } from "@/server/shop-admin/action-context";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";
import { hasStaffFullShopAdminWebAccess } from "@/server/shop-admin/staff-web-permissions";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("POS / Staff");
}

export const dynamic = "force-dynamic";

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

function staffActionLabels(t: (value: string) => string): StaffActionPanelLabels {
  return {
    archive: t("Archive"),
    clearLockout: t("Clear lockout"),
    createStaff: t("Create staff"),
    credentialType: t("Credential type"),
    custom: t("Custom"),
    displayName: t("Display name"),
    forceCredentialRotation: t("Force credential rotation"),
    forceRotation: t("Force rotation"),
    oneTimeSignInValue: t("One-time sign-in value"),
    passwordLabel: t("Password"),
    pinLabel: t("PIN"),
    reactivate: t("Reactivate"),
    reason: t("Reason"),
    resetCredential: t("Reset credential"),
    revokeSessions: t("Revoke sessions"),
    revokeWebAccess: t("Revoke web access"),
    role: t("Role"),
    roleOptions: {
      cashier: t("Cashier"),
      manager: t("Manager"),
      viewer: t("Viewer"),
    },
    sessionStatus: t("Session status"),
    staffCode: t("Staff code"),
    staffRolePermissions: t("Staff role permissions"),
    staffRowId: t("Staff row id"),
    staffWebAccess: t("Staff web access"),
    suspend: t("Suspend"),
    template: t("Template"),
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

export default async function ShopStaffPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const params = await searchParams;
  const { dictionary } = await getI18n();
  const t = (value: string) => translateText(dictionary, value);
  const requestedShopId = getParam(params, "shop_id");
  const section = await getShopSectionForRequest(
    "staff",
    requestedShopId,
  );
  const staffActionContext = await resolveShopActionContext(
    requestedShopId,
    "staff.manage",
  );
  const canManageStaff = staffActionContext.status === "ready";
  const canManageRolePermissions =
    staffActionContext.status === "ready" &&
    (staffActionContext.principalKind === "personal_account" ||
      hasStaffFullShopAdminWebAccess(staffActionContext.staffPermissions));

  return (
    <div className="grid gap-5">
      <ShopSectionPage section={section} />
      <ActionResultBanner
        action={getParam(params, "action")}
        result={getParam(params, "result")}
      />
      {canManageStaff ? (
        <StaffActionPanel
          canManageRolePermissions={canManageRolePermissions}
          labels={staffActionLabels(t)}
          selectedShopId={requestedShopId}
        />
      ) : null}
    </div>
  );
}
