import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import {
  DeviceActionPanel,
  type DeviceActionPanelLabels,
} from "@/app/shop/_components/DeviceActionPanel";
import {
  DeviceRegistryView,
  normalizeDeviceFilter,
} from "@/app/shop/_components/DeviceRegistryView";
import { createLocalizedPageMetadata } from "@/i18n/metadata";
import { getI18n } from "@/i18n/get-locale";
import { translateText } from "@/i18n/translate-sections";
import { resolveShopActionContext } from "@/server/shop-admin/action-context";
import { getShopDeviceReadModel } from "@/server/shop-admin/device-read-model";

export function generateMetadata() {
  return createLocalizedPageMetadata("Devices");
}

export const dynamic = "force-dynamic";

type ShopPageSearchParams = Promise<{
  action?: string | string[];
  device_filter?: string | string[];
  device_q?: string | string[];
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

function cleanSearchQuery(value: string | undefined) {
  return value ? value.trim().slice(0, 80) : "";
}

function deviceActionLabels(
  t: (value: string) => string,
): DeviceActionPanelLabels {
  return {
    advancedManualActions: t("Advanced manual actions"),
    advancedManualActionsDescription: t(
      "Use these forms only for recovery or diagnostics. Normally devices appear automatically after login or sync from updated clients.",
    ),
    appVersion: t("App version"),
    deviceIdentifier: t("Device identifier"),
    deviceRowId: t("Device row id"),
    deviceType: t("Device type"),
    displayName: t("Display name"),
    manualFallback: t("Manual register fallback"),
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
  const { dictionary, locale } = await getI18n();
  const t = (value: string) => translateText(dictionary, value);
  const requestedShopId = getParam(params, "shop_id");
  const filter = normalizeDeviceFilter(getParam(params, "device_filter"));
  const searchQuery = cleanSearchQuery(getParam(params, "device_q"));
  const [readModel, actionContext] = await Promise.all([
    getShopDeviceReadModel({ requestedShopId }),
    resolveShopActionContext(requestedShopId, "devices.manage"),
  ]);
  const canManageDevices = actionContext.status === "ready";

  return (
    <div className="grid gap-5">
      <DeviceRegistryView
        canManageDevices={canManageDevices}
        filter={filter}
        locale={locale}
        readModel={readModel}
        requestedShopId={requestedShopId}
        searchQuery={searchQuery}
        t={t}
      />
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
