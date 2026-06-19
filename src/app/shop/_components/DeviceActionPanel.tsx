import {
  reactivateDeviceAction,
  registerDeviceAction,
  renameDeviceAction,
  revokeDeviceAction,
} from "@/app/shop/actions";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";

type DeviceActionPanelProps = {
  labels?: DeviceActionPanelLabels;
  selectedShopId?: string;
};

export type DeviceActionPanelLabels = {
  advancedManualActions?: string;
  advancedManualActionsDescription?: string;
  appVersion: string;
  deviceIdentifier: string;
  deviceRowId: string;
  deviceType: string;
  displayName: string;
  manualFallback: string;
  reactivateDevice: string;
  reason: string;
  registerDevice: string;
  renameDevice: string;
  revokeDevice: string;
  typeReactivateConfirmation: string;
  typeRevokeConfirmation: string;
};

const defaultDeviceActionLabels: DeviceActionPanelLabels = {
  advancedManualActions: "Advanced manual actions",
  advancedManualActionsDescription:
    "Use these forms only for recovery or diagnostics. Normally devices appear automatically after login or sync from updated clients.",
  appVersion: "App version",
  deviceIdentifier: "Device identifier",
  deviceRowId: "Device row id",
  deviceType: "Device type",
  displayName: "Display name",
  manualFallback: "Manual device fallback",
  reactivateDevice: "Reactivate device",
  reason: "Reason",
  registerDevice: "Register device",
  renameDevice: "Rename device",
  revokeDevice: "Revoke device",
  typeReactivateConfirmation: "Type REACTIVATE as confirmation",
  typeRevokeConfirmation: "Type REVOKE as confirmation",
};

const deviceActionCardClassName =
  "flex min-h-[14rem] min-w-0 flex-col rounded-md border border-zinc-200 bg-white p-4 shadow-sm";
const deviceFormClassName = "mt-3 flex min-w-0 flex-1 flex-col gap-3";
const deviceInputClassName =
  "h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none";
const deviceButtonClassName =
  "mt-auto inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white sm:w-auto";
const deviceWarningButtonClassName =
  "mt-auto inline-flex h-10 w-full items-center justify-center rounded-md border border-amber-400 bg-amber-50 px-4 text-sm font-medium text-amber-950 sm:w-auto";
const deviceSuccessButtonClassName =
  "mt-auto inline-flex h-10 w-full items-center justify-center rounded-md border border-emerald-400 bg-emerald-50 px-4 text-sm font-medium text-emerald-950 sm:w-auto";

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
    <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
      {label}
      <input
        className={deviceInputClassName}
        name={name}
        required={required}
        type="text"
      />
    </label>
  );
}

export function DeviceActionPanel({
  labels = defaultDeviceActionLabels,
  selectedShopId,
}: DeviceActionPanelProps) {
  const usesDefaultLabels = labels === defaultDeviceActionLabels;
  const title = labels.advancedManualActions ?? "Advanced manual actions";
  const description =
    labels.advancedManualActionsDescription ??
    "Use these forms only for recovery or diagnostics. Normally devices appear automatically after login or sync from updated clients.";

  return (
    <details
      className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} rounded-md border border-slate-200 bg-white p-5`}
    >
      <summary className="cursor-pointer text-base font-semibold text-slate-950">
        {title}
      </summary>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        {description}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <section className={deviceActionCardClassName}>
          <h2 className="text-base font-semibold text-zinc-950">
            {labels.manualFallback}
          </h2>
          <form action={registerDeviceAction} className={deviceFormClassName}>
            <HiddenShopInput selectedShopId={selectedShopId} />
            <TextInput
              label={labels.deviceIdentifier}
              name="deviceIdentifier"
              required
            />
            <TextInput label={labels.displayName} name="displayName" />
            <TextInput label={labels.deviceType} name="deviceType" />
            <TextInput label={labels.appVersion} name="appVersion" />
            <button className={deviceButtonClassName}>
              {labels.registerDevice}
            </button>
          </form>
        </section>

        <section className={deviceActionCardClassName}>
          <h2 className="text-base font-semibold text-zinc-950">
            {labels.renameDevice}
          </h2>
          <form action={renameDeviceAction} className={deviceFormClassName}>
            <HiddenShopInput selectedShopId={selectedShopId} />
            <TextInput label={labels.deviceRowId} name="deviceId" required />
            <TextInput label={labels.displayName} name="displayName" required />
            <button className={deviceButtonClassName}>
              {labels.renameDevice}
            </button>
          </form>
        </section>

        <section className={deviceActionCardClassName}>
          <h2 className="text-base font-semibold text-zinc-950">
            {labels.revokeDevice}
          </h2>
          <form action={revokeDeviceAction} className={deviceFormClassName}>
            <HiddenShopInput selectedShopId={selectedShopId} />
            <TextInput label={labels.deviceRowId} name="deviceId" required />
            {usesDefaultLabels ? (
              <TextInput label="Reason" name="reason" required />
            ) : (
              <TextInput label={labels.reason} name="reason" required />
            )}
            <TextInput
              label={labels.typeRevokeConfirmation}
              name="confirmation"
              required
            />
            <button className={deviceWarningButtonClassName}>
              {labels.revokeDevice}
            </button>
          </form>
        </section>

        <section className={deviceActionCardClassName}>
          <h2 className="text-base font-semibold text-zinc-950">
            {labels.reactivateDevice}
          </h2>
          <form action={reactivateDeviceAction} className={deviceFormClassName}>
            <HiddenShopInput selectedShopId={selectedShopId} />
            <TextInput label={labels.deviceRowId} name="deviceId" required />
            {usesDefaultLabels ? (
              <TextInput label="Reason" name="reason" required />
            ) : (
              <TextInput label={labels.reason} name="reason" required />
            )}
            <TextInput
              label={labels.typeReactivateConfirmation}
              name="confirmation"
              required
            />
            <button className={deviceSuccessButtonClassName}>
              {labels.reactivateDevice}
            </button>
          </form>
        </section>
      </div>
    </details>
  );
}
