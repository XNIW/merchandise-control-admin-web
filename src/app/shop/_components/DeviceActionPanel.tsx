import {
  reactivateDeviceAction,
  registerDeviceAction,
  renameDeviceAction,
  revokeDeviceAction,
} from "@/app/shop/actions";

type DeviceActionPanelProps = {
  selectedShopId?: string;
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

export function DeviceActionPanel({ selectedShopId }: DeviceActionPanelProps) {
  return (
    <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-4">
      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          Register device
        </h2>
        <form action={registerDeviceAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Device identifier" name="deviceIdentifier" required />
          <TextInput label="Display name" name="displayName" />
          <TextInput label="Device type" name="deviceType" />
          <TextInput label="App version" name="appVersion" />
          <button className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
            Register device
          </button>
        </form>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">Rename device</h2>
        <form action={renameDeviceAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Device row id" name="deviceId" required />
          <TextInput label="Display name" name="displayName" required />
          <button className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
            Rename device
          </button>
        </form>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">Revoke device</h2>
        <form action={revokeDeviceAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Device row id" name="deviceId" required />
          <TextInput label="Reason" name="reason" required />
          <TextInput label="Type REVOKE as confirmation" name="confirmation" required />
          <button className="rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950">
            Revoke device
          </button>
        </form>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          Reactivate device
        </h2>
        <form action={reactivateDeviceAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Device row id" name="deviceId" required />
          <TextInput label="Reason" name="reason" required />
          <TextInput
            label="Type REACTIVATE as confirmation"
            name="confirmation"
            required
          />
          <button className="rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-950">
            Reactivate device
          </button>
        </form>
      </section>
    </div>
  );
}
