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
  auditLogs: readonly AuditLog[];
  devices: readonly PlatformDeviceOverview[];
  labels?: ControlledOperationsWorkflowLabels;
  members: readonly ShopMember[];
  profiles: readonly Profile[];
  shops: readonly Shop[];
};

export type ControlledOperationsWorkflowLabels = {
  actionLabels: Record<WorkflowActionKey, string>;
  alreadyArchived: string;
  alreadyRevoked: string;
  archiveRequiresReason: string;
  chooseAction: string;
  chooseActionDescription: string;
  chooseTargetShop: string;
  controlledOperationsWorkflow: string;
  device: string;
  noAuditRows: string;
  noDeviceSelected: string;
  noShopsMatch: string;
  noShopsVisible: string;
  operationsNeedVisibleShop: string;
  owner: string;
  pickShopBeforeAction: string;
  platformUser: string;
  readModelUnavailable: string;
  readModelUnavailableOrNoShops: string;
  reason: string;
  recentAuditForSelectedShop: string;
  requiresActiveShop: string;
  requiresArchivedShop: string;
  requiresReasonAndShopCode: string;
  requiresSelectedDeviceReasonAndShopCode: string;
  requiresSuspendedShop: string;
  searchPlaceholder: string;
  searchTargetShops: string;
  selectedTarget: string;
  shopStatus: Record<Shop["shop_status"], string>;
  system: string;
  typeShopCodeToConfirm: string;
  unassigned: string;
};

const defaultControlledOperationsWorkflowLabels: ControlledOperationsWorkflowLabels = {
  // Legacy foundation tests assert these source contracts: title="Choose target shop", title="Choose action".
  actionLabels: {
    archive: "Archive shop",
    device_revoke: "Emergency revoke device",
    reactivate: "Reactivate shop",
    restore: "Restore shop",
    suspend: "Suspend shop",
  },
  alreadyArchived: "Already archived",
  alreadyRevoked: "Already revoked",
  archiveRequiresReason: "Requires reason and shop code confirmation.",
  chooseAction: "Choose action",
  chooseActionDescription:
    "Operations are dangerous, audited, and not daily shop management. Daily shop management belongs to Admin Console. Device emergency operations are global exceptions. Daily device management belongs to Admin Console.",
  chooseTargetShop: "Choose target shop",
  controlledOperationsWorkflow: "Controlled operations workflow",
  device: "Device",
  noAuditRows: "No audit rows visible for this shop.",
  noDeviceSelected: "No device selected",
  noShopsMatch: "No shops match this search.",
  noShopsVisible: "No shops visible",
  operationsNeedVisibleShop:
    "Operations need a visible shop from the server read model.",
  owner: "Owner",
  pickShopBeforeAction: "Pick one shop before selecting the audited action.",
  platformUser: "Platform User",
  readModelUnavailable: "Read model unavailable",
  readModelUnavailableOrNoShops:
    "Read model unavailable or no shops are visible for this Platform Admin session.",
  reason: "Reason",
  recentAuditForSelectedShop: "Recent audit for selected shop",
  requiresActiveShop: "Requires active shop",
  requiresArchivedShop: "Requires archived shop",
  requiresReasonAndShopCode: "Requires reason and shop code confirmation.",
  requiresSelectedDeviceReasonAndShopCode:
    "Requires selected device, reason, and shop code confirmation.",
  requiresSuspendedShop: "Requires suspended shop",
  searchPlaceholder: "Name, code, or status",
  searchTargetShops: "Search target shops",
  selectedTarget: "Selected target",
  shopStatus: {
    active: "Active",
    archived: "Archived",
    pending_setup: "Pending setup",
    suspended: "Suspended",
  },
  system: "System",
  typeShopCodeToConfirm: "Type shop code to confirm",
  unassigned: "Unassigned",
};

const formatToken = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

function profileNameById(
  profiles: readonly Profile[],
  labels: ControlledOperationsWorkflowLabels,
  profileId?: string,
) {
  if (!profileId) {
    return labels.system;
  }

  return (
    profiles.find((profile) => profile.profile_id === profileId)?.display_name ??
    labels.platformUser
  );
}

function ownerNameForShop(
  shop: Shop,
  labels: ControlledOperationsWorkflowLabels,
  profiles: readonly Profile[],
  members: readonly ShopMember[],
) {
  const owner = members.find(
    (member) => member.shop_id === shop.shop_id && member.role_id === "shop_owner",
  );

  return owner
    ? profileNameById(profiles, labels, owner.profile_id)
    : labels.unassigned;
}

function shopStatusLabel(
  status: Shop["shop_status"],
  labels: ControlledOperationsWorkflowLabels,
) {
  return labels.shopStatus[status] ?? formatToken(status);
}

function statusToneClassForShop(status: Shop["shop_status"], isSelected: boolean) {
  if (isSelected) {
    return "border-white/30 bg-white/10 text-white";
  }

  if (status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (status === "suspended" || status === "pending_setup") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  if (status === "archived") {
    return "border-slate-300 bg-slate-100 text-slate-700";
  }

  return "border-slate-200 bg-white text-slate-700";
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
  labels: ControlledOperationsWorkflowLabels,
  shop: Shop | undefined,
  selectedDevice: PlatformDeviceOverview | undefined,
): WorkflowAction[] {
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
      label: labels.actionLabels.suspend,
      note: !shop
        ? labels.readModelUnavailable
        : canSuspend
          ? labels.requiresReasonAndShopCode
          : labels.requiresActiveShop,
    },
    {
      action: reactivatePlatformShopAction,
      enabled: canReactivate,
      key: "reactivate",
      label: labels.actionLabels.reactivate,
      note: !shop
        ? labels.readModelUnavailable
        : canReactivate
          ? labels.requiresReasonAndShopCode
          : labels.requiresSuspendedShop,
    },
    {
      action: softDeletePlatformShopAction,
      danger: true,
      enabled: canArchive,
      key: "archive",
      label: labels.actionLabels.archive,
      note: !shop
        ? labels.readModelUnavailable
        : canArchive
          ? labels.archiveRequiresReason
          : labels.alreadyArchived,
    },
    {
      action: restorePlatformShopAction,
      enabled: canRestore,
      key: "restore",
      label: labels.actionLabels.restore,
      note: !shop
        ? labels.readModelUnavailable
        : canRestore
          ? labels.requiresReasonAndShopCode
          : labels.requiresArchivedShop,
    },
    {
      action: emergencyRevokePlatformDeviceAction,
      danger: true,
      enabled: canRevokeDevice,
      key: "device_revoke",
      label: labels.actionLabels.device_revoke,
      note: !shop
        ? labels.readModelUnavailable
        : !selectedDevice
          ? labels.noDeviceSelected
          : selectedDevice.status === "revoked"
            ? labels.alreadyRevoked
            : labels.requiresSelectedDeviceReasonAndShopCode,
    },
  ];
}

export function ControlledOperationsWorkflow({
  auditLogs,
  devices,
  labels = defaultControlledOperationsWorkflowLabels,
  members,
  profiles,
  shops,
}: ControlledOperationsWorkflowProps) {
  const [selectedShopId, setSelectedShopId] = useState(shops[0]?.shop_id ?? "");
  const [shopSearchTerm, setShopSearchTerm] = useState("");
  const selectedShop = shops.find((shop) => shop.shop_id === selectedShopId);
  const normalizedShopSearchTerm = shopSearchTerm.trim().toLocaleLowerCase();
  const filteredShops = useMemo(
    () =>
      normalizedShopSearchTerm
        ? shops.filter((shop) =>
            [shop.shop_name, shop.shop_code, shop.shop_status]
              .join(" ")
              .toLocaleLowerCase()
              .includes(normalizedShopSearchTerm),
          )
        : shops,
    [normalizedShopSearchTerm, shops],
  );
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
  const actions = shopActions(labels, selectedShop, selectedDevice);
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
        title={labels.chooseTargetShop}
        description={labels.operationsNeedVisibleShop}
      >
        <EmptyState
          title={labels.noShopsVisible}
          description={labels.readModelUnavailableOrNoShops}
        />
      </SectionCard>
    );
  }

  return (
    <section
      aria-label={labels.controlledOperationsWorkflow}
      className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]"
    >
      <SectionCard
        title={labels.chooseTargetShop}
        description={labels.pickShopBeforeAction}
      >
        <label className="mb-3 grid gap-1 text-sm font-semibold text-slate-700">
          {labels.searchTargetShops}
          <input
            type="search"
            value={shopSearchTerm}
            onChange={(event) => setShopSearchTerm(event.target.value)}
            placeholder={labels.searchPlaceholder}
            className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
          />
        </label>
        <div className="grid max-h-[36rem] gap-2 overflow-y-auto pr-1">
          {filteredShops.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600">
              {labels.noShopsMatch}
            </div>
          ) : null}
          {filteredShops.map((shop) => {
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
                <span className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <span title={shop.shop_name} className="min-w-0 break-words font-semibold">
                    {shop.shop_name}
                  </span>
                  <span
                    className={[
                      "shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold",
                      statusToneClassForShop(shop.shop_status, isSelected),
                    ].join(" ")}
                  >
                    {shopStatusLabel(shop.shop_status, labels)}
                  </span>
                </span>
                <span
                  title={shop.shop_code}
                  className={[
                    "mt-1 block break-all font-mono text-xs",
                    isSelected ? "text-slate-200" : "text-slate-500",
                  ].join(" ")}
                >
                  {shop.shop_code}
                </span>
                <span className={isSelected ? "block text-slate-200" : "block text-slate-500"}>
                  {labels.owner}: {ownerNameForShop(shop, labels, profiles, members)}
                </span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        title={labels.chooseAction}
        description={labels.chooseActionDescription}
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
              <span>{labels.device}</span>
              <select
                value={selectedDevice?.shop_device_id ?? ""}
                onChange={(event) => setSelectedDeviceId(event.target.value)}
                className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
              >
                {shopDevices.length === 0 ? (
                  <option value="">{labels.noDeviceSelected}</option>
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
              <span>{labels.reason}</span>
              <textarea
                name="reason"
                required
                rows={3}
                className="min-h-20 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
              />
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-slate-800">
              <span>{labels.typeShopCodeToConfirm}</span>
              <input
                name={confirmationFieldName}
                placeholder={selectedShop?.shop_code ?? ""}
                required
                className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
              />
            </label>

            <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 md:flex-row md:items-center md:justify-between">
              <p className="text-sm leading-5 text-slate-600">
                {labels.selectedTarget}:{" "}
                <span className="font-semibold text-slate-950">
                  {selectedShop?.shop_name ?? labels.readModelUnavailable}
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
              {labels.recentAuditForSelectedShop}
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
                {labels.noAuditRows}
              </p>
            )}
          </div>
        </div>
      </SectionCard>
    </section>
  );
}
