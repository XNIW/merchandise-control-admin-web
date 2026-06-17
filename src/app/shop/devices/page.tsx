import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import {
  DeviceActionPanel,
  type DeviceActionPanelLabels,
} from "@/app/shop/_components/DeviceActionPanel";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getI18n } from "@/i18n/get-locale";
import { translateText } from "@/i18n/translate-sections";
import { resolveShopActionContext } from "@/server/shop-admin/action-context";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Devices");
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

function deviceActionLabels(t: (value: string) => string): DeviceActionPanelLabels {
  return {
    appVersion: t("App version"),
    deviceIdentifier: t("Device identifier"),
    deviceRowId: t("Device row id"),
    deviceType: t("Device type"),
    displayName: t("Display name"),
    reactivateDevice: t("Reactivate device"),
    reason: t("Reason"),
    registerDevice: t("Register device"),
    renameDevice: t("Rename device"),
    revokeDevice: t("Revoke device"),
    typeReactivateConfirmation: t("Type REACTIVATE as confirmation"),
    typeRevokeConfirmation: t("Type REVOKE as confirmation"),
  };
}

export default async function ShopDevicesPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const params = await searchParams;
  const { dictionary } = await getI18n();
  const t = (value: string) => translateText(dictionary, value);
  const requestedShopId = getParam(params, "shop_id");
  const section = await getShopSectionForRequest(
    "devices",
    requestedShopId,
  );
  const canManageDevices =
    (await resolveShopActionContext(requestedShopId, "devices.manage"))
      .status === "ready";

  return (
    <div className="grid gap-5">
      <ShopSectionPage section={section} />
      <ActionResultBanner
        action={getParam(params, "action")}
        result={getParam(params, "result")}
      />
      {canManageDevices ? (
        <DeviceActionPanel
          labels={deviceActionLabels(t)}
          selectedShopId={requestedShopId}
        />
      ) : null}
    </div>
  );
}
