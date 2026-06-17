"use client";

import { useMemo, useState } from "react";
import { PendingSubmitButton } from "@/components/platform/PendingSubmitButton";
import type { Shop } from "@/domain/platform-admin/types";
import {
  shopOperationalAccessLabel,
  shopStatusDescription,
  shopStatusLabel,
} from "@/domain/platform-admin/semantics";
import { changePlatformShopStatusAction } from "@/app/platform/operations/actions";

type LifecycleActionKey =
  | "activate"
  | "reactivate"
  | "restore"
  | "soft_delete"
  | "suspend";

type LifecycleTarget = {
  actionKey?: LifecycleActionKey;
  buttonLabel?: string;
  description: string;
  disabledReason?: string;
  pendingLabel?: string;
  preview?: string;
  status: Shop["shop_status"];
  tone?: "danger";
};

type ShopLifecycleActionsProps = {
  lastResult?: {
    operation?: string;
    result?: string;
  };
  returnTo: string;
  shop: Pick<Shop, "shop_code" | "shop_id" | "shop_name" | "shop_status">;
};

const lifecycleOperations = new Set([
  "activate",
  "suspend",
  "reactivate",
  "restore",
  "soft_delete",
]);
const targetStatuses: Shop["shop_status"][] = [
  "active",
  "pending_setup",
  "suspended",
  "archived",
];

const fieldClassName =
  "h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none focus:border-slate-950 focus-visible:ring-2 focus-visible:ring-slate-950 disabled:bg-slate-100 disabled:text-slate-400";
const labelClassName = "grid min-w-0 gap-1 text-sm font-semibold text-slate-800";

function resultMessage(lastResult?: ShopLifecycleActionsProps["lastResult"]) {
  if (
    !lastResult?.operation ||
    !lastResult.result ||
    !lifecycleOperations.has(lastResult.operation)
  ) {
    return null;
  }

  return `${lastResult.operation}: ${lastResult.result}`;
}

function lifecycleTargetForShop(
  shop: ShopLifecycleActionsProps["shop"],
  status: Shop["shop_status"],
): LifecycleTarget {
  const description = shopStatusDescription(status);

  if (status === shop.shop_status) {
    return {
      description,
      disabledReason: "Current status",
      status,
    };
  }

  if (status === "active" && shop.shop_status === "pending_setup") {
    return {
      actionKey: "activate",
      buttonLabel: "Activate shop",
      description,
      pendingLabel: "Activating...",
      preview: "This will activate a pending shop and enable operational access.",
      status,
    };
  }

  if (status === "active" && shop.shop_status === "suspended") {
    return {
      actionKey: "reactivate",
      buttonLabel: "Reactivate shop",
      description,
      pendingLabel: "Reactivating...",
      preview:
        "This will reactivate a suspended shop and enable operational access.",
      status,
    };
  }

  if (status === "active" && shop.shop_status === "archived") {
    return {
      actionKey: "restore",
      buttonLabel: "Restore shop",
      description,
      pendingLabel: "Restoring...",
      preview:
        "This will restore an archived shop to active operational access.",
      status,
    };
  }

  if (status === "suspended" && shop.shop_status === "active") {
    return {
      actionKey: "suspend",
      buttonLabel: "Suspend shop",
      description,
      pendingLabel: "Suspending...",
      preview:
        "This will suspend operational access while preserving shop data.",
      status,
      tone: "danger",
    };
  }

  if (status === "archived" && shop.shop_status !== "archived") {
    return {
      actionKey: "soft_delete",
      buttonLabel: "Archive shop",
      description,
      pendingLabel: "Archiving...",
      preview:
        "This will archive the shop, disable operational access, and keep the record visible in Master Console.",
      status,
      tone: "danger",
    };
  }

  return {
    description,
    disabledReason: "This transition is not supported by the controlled lifecycle policy.",
    status,
  };
}

function statusToneClass(status: Shop["shop_status"], current: Shop["shop_status"]) {
  if (status === current) {
    return "border-slate-950 bg-slate-950 text-white";
  }

  return "border-slate-200 bg-white text-slate-600";
}

export function ShopLifecycleActions({
  lastResult,
  returnTo,
  shop,
}: ShopLifecycleActionsProps) {
  const message = resultMessage(lastResult);
  const targets = useMemo(
    () => targetStatuses.map((status) => lifecycleTargetForShop(shop, status)),
    [shop],
  );
  const defaultTarget =
    targets.find((target) => target.actionKey)?.status ?? shop.shop_status;
  const [targetStatus, setTargetStatus] =
    useState<Shop["shop_status"]>(defaultTarget);
  const selectedTarget =
    targets.find((target) => target.status === targetStatus) ?? targets[0];
  const unavailableTargets = targets.filter((target) => !target.actionKey);
  const canSubmit = Boolean(selectedTarget.actionKey);

  return (
    <div className="grid gap-4">
      {message ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
          Last lifecycle action: {message}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,320px)] md:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-slate-950 bg-slate-950 px-2.5 py-1 text-sm font-semibold text-white">
              Current: {shopStatusLabel(shop.shop_status)}
            </span>
            <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-sm font-semibold text-slate-700">
              Operational access: {shopOperationalAccessLabel(shop.shop_status)}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {targetStatuses.map((status) => (
              <span
                className={[
                  "rounded-md border px-2.5 py-1 text-xs font-semibold",
                  statusToneClass(status, shop.shop_status),
                ].join(" ")}
                key={status}
              >
                {shopStatusLabel(status)}
              </span>
            ))}
          </div>
        </div>

        <label className={labelClassName}>
          Change status to
          <select
            className={fieldClassName}
            onChange={(event) =>
              setTargetStatus(event.target.value as Shop["shop_status"])
            }
            value={targetStatus}
          >
            {targets.map((target) => (
              <option
                disabled={!target.actionKey}
                key={target.status}
                value={target.status}
              >
                {shopStatusLabel(target.status)}
                {target.actionKey ? "" : ` - ${target.disabledReason}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-sm font-semibold text-slate-950">
          {selectedTarget.preview ?? selectedTarget.disabledReason}
        </p>
        <p className="mt-1 text-sm leading-5 text-slate-600">
          {selectedTarget.description}
        </p>
      </div>

      <form action={changePlatformShopStatusAction} className="grid gap-3">
        <input
          name="lifecycleAction"
          type="hidden"
          value={selectedTarget.actionKey ?? ""}
        />
        <input name="shopId" type="hidden" value={shop.shop_id} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <div className="grid gap-3 md:grid-cols-2">
          <label className={labelClassName}>
            Reason
            <input
              className={fieldClassName}
              disabled={!canSubmit}
              maxLength={240}
              name="reason"
              placeholder="Approval reason"
              required
              type="text"
            />
          </label>
          <label className={labelClassName}>
            Confirm shop code
            <input
              className={fieldClassName}
              disabled={!canSubmit}
              name="shopCodeConfirmation"
              placeholder={shop.shop_code}
              required
              type="text"
            />
          </label>
        </div>
        <div>
          <PendingSubmitButton
            danger={selectedTarget.tone === "danger"}
            disabled={!canSubmit}
            pendingLabel={selectedTarget.pendingLabel ?? "Applying..."}
          >
            {selectedTarget.buttonLabel ?? "Apply status change"}
          </PendingSubmitButton>
        </div>
      </form>

      <details className="rounded-md border border-slate-200 bg-white">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-slate-950">
          Unavailable transitions
        </summary>
        <ul className="grid gap-2 border-t border-slate-200 p-3">
          {unavailableTargets.map((target) => (
            <li className="text-sm leading-5 text-slate-600" key={target.status}>
              {shopStatusLabel(target.status)}: {target.disabledReason}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
