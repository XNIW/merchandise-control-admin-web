import {
  reactivateDeviceAction,
  registerDeviceAction,
  renameDeviceAction,
  revokeDeviceAction,
} from "@/app/shop/actions";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";

type DeviceActionPanelProps = {
  selectedShopId?: string;
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

export function DeviceActionPanel({ selectedShopId }: DeviceActionPanelProps) {
  return (
    <div className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-4 md:grid-cols-2 xl:grid-cols-4`}>
      <section className={deviceActionCardClassName}>
        <h2 className="text-base font-semibold text-zinc-950">
          Register device
        </h2>
        <form action={registerDeviceAction} className={deviceFormClassName}>
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Device identifier" name="deviceIdentifier" required />
          <TextInput label="Display name" name="displayName" />
          <TextInput label="Device type" name="deviceType" />
          <TextInput label="App version" name="appVersion" />
          <button className={deviceButtonClassName}>
            Register device
          </button>
        </form>
      </section>

      <section className={deviceActionCardClassName}>
        <h2 className="text-base font-semibold text-zinc-950">Rename device</h2>
        <form action={renameDeviceAction} className={deviceFormClassName}>
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Device row id" name="deviceId" required />
          <TextInput label="Display name" name="displayName" required />
          <button className={deviceButtonClassName}>
            Rename device
          </button>
        </form>
      </section>

      <section className={deviceActionCardClassName}>
        <h2 className="text-base font-semibold text-zinc-950">Revoke device</h2>
        <form action={revokeDeviceAction} className={deviceFormClassName}>
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Device row id" name="deviceId" required />
          <TextInput label="Reason" name="reason" required />
          <TextInput label="Type REVOKE as confirmation" name="confirmation" required />
          <button className={deviceWarningButtonClassName}>
            Revoke device
          </button>
        </form>
      </section>

      <section className={deviceActionCardClassName}>
        <h2 className="text-base font-semibold text-zinc-950">
          Reactivate device
        </h2>
        <form action={reactivateDeviceAction} className={deviceFormClassName}>
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Device row id" name="deviceId" required />
          <TextInput label="Reason" name="reason" required />
          <TextInput
            label="Type REACTIVATE as confirmation"
            name="confirmation"
            required
          />
          <button className={deviceSuccessButtonClassName}>
            Reactivate device
          </button>
        </form>
      </section>
    </div>
  );
}
