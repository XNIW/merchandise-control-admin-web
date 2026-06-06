"use client";

import { useMemo, useState } from "react";
import type {
  AuditLog,
  PlatformDeviceOverview,
  Profile,
  Shop,
  ShopMember,
} from "@/domain/platform-admin/types";
import { PendingSubmitButton } from "@/components/platform/PendingSubmitButton";
import { EmptyState } from "@/components/platform/components/EmptyState";
import { SectionCard } from "@/components/platform/components/SectionCard";
import {
  emergencyRevokePlatformDeviceAction,
  reactivatePlatformShopAction,
  restorePlatformShopAction,
  softDeletePlatformShopAction,
  suspendPlatformShopAction,
} from "@/app/platform/operations/actions";

type WorkflowActionKey =
  | "suspend"
  | "reactivate"
  | "archive"
  | "restore"
  | "device_revoke";

type ServerAction = (formData: FormData) => void | Promise<void>;

type WorkflowAction = {
  key: WorkflowActionKey;
  label: string;
  action: ServerAction;
  danger?: boolean;
  enabled: boolean;
  note: string;
};

type ControlledOperationsWorkflowProps = {
  shops: readonly Shop[];
  devices: readonly PlatformDeviceOverview[];
  profiles: readonly Profile[];
  members: readonly ShopMember[];
  auditLogs: readonly AuditLog[];
};

const formatToken = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

function profileNameById(profiles: readonly Profile[], profileId?: string) {
  if (!profileId) {
    return "System";
  }

  return (
    profiles.find((profile) => profile.profile_id === profileId)?.display_name ??
    "Platform User"
  );
}

function ownerNameForShop(
  shop: Shop,
  profiles: readonly Profile[],
  members: readonly ShopMember[],
) {
  const owner = members.find(
    (member) => member.shop_id === shop.shop_id && member.role_id === "shop_owner",
  );

  return owner ? profileNameById(profiles, owner.profile_id) : "Unassigned";
}

function firstAvailableAction(
  shop: Shop | undefined,
  shopDevices: readonly PlatformDeviceOverview[],
): WorkflowActionKey {
  if (!shop) {
    return "suspend";
  }

  if (shop.shop_status === "suspended") {
    return "reactivate";
  }

  if (shop.shop_status === "archived") {
    return "restore";
  }

  if (shop.shop_status === "active" || shop.shop_status === "pending_setup") {
    return "suspend";
  }

  return shopDevices.length > 0 ? "device_revoke" : "archive";
}

function shopActions(
  shop: Shop | undefined,
  selectedDevice: PlatformDeviceOverview | undefined,
): WorkflowAction[] {
  const readModelUnavailable = "Read model unavailable";
  const canSuspend =
    shop?.shop_status === "active" || shop?.shop_status === "pending_setup";
  const canReactivate = shop?.shop_status === "suspended";
  const canArchive = shop !== undefined && shop.shop_status !== "archived";
  const canRestore = shop?.shop_status === "archived";
  const canRevokeDevice =
    shop !== undefined &&
    selectedDevice !== undefined &&
    selectedDevice.status !== "revoked";

  return [
    {
      action: suspendPlatformShopAction,
      enabled: canSuspend,
      key: "suspend",
      label: "Suspend shop",
      note: !shop ? readModelUnavailable : canSuspend ? "Requires reason and shop code confirmation." : "Requires active shop",
    },
    {
      action: reactivatePlatformShopAction,
      enabled: canReactivate,
      key: "reactivate",
      label: "Reactivate shop",
      note: !shop ? readModelUnavailable : canReactivate ? "Requires reason and shop code confirmation." : "Requires suspended shop",
    },
    {
      action: softDeletePlatformShopAction,
      danger: true,
      enabled: canArchive,
      key: "archive",
      label: "Archive shop",
      note: !shop ? readModelUnavailable : canArchive ? "Requires reason and shop code confirmation." : "Already archived",
    },
    {
      action: restorePlatformShopAction,
      enabled: canRestore,
      key: "restore",
      label: "Restore shop",
      note: !shop ? readModelUnavailable : canRestore ? "Requires reason and shop code confirmation." : "Requires archived shop",
    },
    {
      action: emergencyRevokePlatformDeviceAction,
      danger: true,
      enabled: canRevokeDevice,
      key: "device_revoke",
      label: "Emergency revoke device",
      note: !shop
        ? readModelUnavailable
        : !selectedDevice
          ? "No device selected"
          : selectedDevice.status === "revoked"
            ? "Already revoked"
            : "Requires selected device, reason, and shop code confirmation.",
    },
  ];
}

export function ControlledOperationsWorkflow({
  auditLogs,
  devices,
  members,
  profiles,
  shops,
}: ControlledOperationsWorkflowProps) {
  const [selectedShopId, setSelectedShopId] = useState(shops[0]?.shop_id ?? "");
  const selectedShop = shops.find((shop) => shop.shop_id === selectedShopId);
  const shopDevices = useMemo(
    () =>
      selectedShop
        ? devices.filter((device) => device.shop_id === selectedShop.shop_id)
        : [],
    [devices, selectedShop],
  );
  const [selectedDeviceId, setSelectedDeviceId] = useState(
    shopDevices[0]?.shop_device_id ?? "",
  );
  const selectedDevice =
    shopDevices.find((device) => device.shop_device_id === selectedDeviceId) ??
    shopDevices[0];
  const [selectedAction, setSelectedAction] = useState<WorkflowActionKey>(
    firstAvailableAction(selectedShop, shopDevices),
  );
  const actions = shopActions(selectedShop, selectedDevice);
  const activeAction =
    actions.find((action) => action.key === selectedAction) ?? actions[0];
  const confirmationFieldName =
    activeAction.key === "archive" || activeAction.key === "restore"
      ? "shopCodeConfirmation"
      : "confirmation";
  const selectedShopAudit = selectedShop
    ? auditLogs.filter((log) => log.shop_id === selectedShop.shop_id).slice(0, 3)
    : [];

  function selectShop(shop: Shop) {
    const nextDevices = devices.filter((device) => device.shop_id === shop.shop_id);

    setSelectedShopId(shop.shop_id);
    setSelectedDeviceId(nextDevices[0]?.shop_device_id ?? "");
    setSelectedAction(firstAvailableAction(shop, nextDevices));
  }

  if (shops.length === 0) {
    return (
      <SectionCard
        title="Choose target shop"
        description="Operations need a visible shop from the server read model."
      >
        <EmptyState
          title="No shops visible"
          description="Read model unavailable or no shops are visible for this Platform Admin session."
        />
      </SectionCard>
    );
  }

  return (
    <section
      aria-label="Controlled operations workflow"
      className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]"
    >
      <SectionCard
        title="Choose target shop"
        description="Pick one shop before selecting the audited action."
      >
        <div className="grid max-h-[36rem] gap-2 overflow-y-auto pr-1">
          {shops.map((shop) => {
            const isSelected = shop.shop_id === selectedShopId;

            return (
              <button
                key={shop.shop_id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => selectShop(shop)}
                className={[
                  "min-w-0 rounded-md border p-3 text-left text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-slate-950",
                  isSelected
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-300 hover:bg-white",
                ].join(" ")}
              >
                <span title={shop.shop_name} className="block break-words font-semibold">
                  {shop.shop_name}
                </span>
                <span
                  title={shop.shop_code}
                  className={isSelected ? "block break-all text-slate-200" : "block break-all text-slate-500"}
                >
                  {shop.shop_code} / {formatToken(shop.shop_status)}
                </span>
                <span className={isSelected ? "block text-slate-200" : "block text-slate-500"}>
                  Owner: {ownerNameForShop(shop, profiles, members)}
                </span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="Choose action"
        description="Operations are dangerous, audited, and not daily shop management. Daily shop management belongs to Admin Console. Device emergency operations are global exceptions. Daily device management belongs to Admin Console."
      >
        <div className="grid gap-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {actions.map((action) => {
              const isSelected = action.key === activeAction.key;

              return (
                <button
                  key={action.key}
                  type="button"
                  disabled={!action.enabled}
                  aria-pressed={isSelected}
                  onClick={() => {
                    if (action.enabled) {
                      setSelectedAction(action.key);
                    }
                  }}
                  className={[
                    "rounded-md border p-3 text-left text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-slate-950",
                    isSelected
                      ? "border-slate-950 bg-slate-950 text-white"
                      : action.enabled
                        ? "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                        : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400",
                  ].join(" ")}
                >
                  <span className="block font-semibold">{action.label}</span>
                  <span className={isSelected ? "mt-1 block text-slate-200" : "mt-1 block text-slate-500"}>
                    {action.note}
                  </span>
                </button>
              );
            })}
          </div>

          {activeAction.key === "device_revoke" ? (
            <label className="grid gap-1.5 text-sm font-medium text-slate-800">
              <span>Device</span>
              <select
                value={selectedDevice?.shop_device_id ?? ""}
                onChange={(event) => setSelectedDeviceId(event.target.value)}
                className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
              >
                {shopDevices.length === 0 ? (
                  <option value="">No device selected</option>
                ) : (
                  shopDevices.map((device) => (
                    <option key={device.shop_device_id} value={device.shop_device_id}>
                      {device.display_name} / {formatToken(device.status)}
                    </option>
                  ))
                )}
              </select>
            </label>
          ) : null}

          <form action={activeAction.action} className="grid gap-4">
            {activeAction.key === "device_revoke" ? (
              <input
                type="hidden"
                name="shopDeviceId"
                value={selectedDevice?.shop_device_id ?? ""}
              />
            ) : (
              <input type="hidden" name="shopId" value={selectedShop?.shop_id ?? ""} />
            )}

            <label className="grid gap-1.5 text-sm font-medium text-slate-800">
              <span>Reason</span>
              <textarea
                name="reason"
                required
                rows={3}
                className="min-h-20 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
              />
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-slate-800">
              <span>Type shop code to confirm</span>
              <input
                name={confirmationFieldName}
                placeholder={selectedShop?.shop_code ?? ""}
                required
                className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
              />
            </label>

            <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 md:flex-row md:items-center md:justify-between">
              <p className="text-sm leading-5 text-slate-600">
                Selected target:{" "}
                <span className="font-semibold text-slate-950">
                  {selectedShop?.shop_name ?? "Read model unavailable"}
                </span>
              </p>
              <PendingSubmitButton
                danger={activeAction.danger}
                disabled={!activeAction.enabled}
                pendingLabel={`${activeAction.label}...`}
              >
                {activeAction.label}
              </PendingSubmitButton>
            </div>
          </form>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
              Recent audit for selected shop
            </p>
            {selectedShopAudit.length > 0 ? (
              <ul className="mt-2 grid gap-1 text-sm text-slate-700">
                {selectedShopAudit.map((log) => (
                  <li key={log.audit_log_id}>
                    {log.event} / {formatToken(log.result)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                No audit rows visible for this shop.
              </p>
            )}
          </div>
        </div>
      </SectionCard>
    </section>
  );
}
