"use client";

import { useState } from "react";
import { PendingSubmitButton } from "@/components/platform/PendingSubmitButton";
import type { Shop } from "@/domain/platform-admin/types";
import {
  purgePlatformShopAction,
  softDeletePlatformShopAction,
} from "@/app/platform/operations/actions";

type PlatformShopDependencyPreviewItem = {
  label: string;
  managedByForcePurge: boolean;
  value: string;
  blocksPurge: boolean;
};

type ShopDangerZoneActionsProps = {
  dependencies: readonly PlatformShopDependencyPreviewItem[];
  lastResult?: {
    operation?: string;
    result?: string;
  };
  purgeBlockedReasons: readonly string[];
  returnTo: string;
  shop: Pick<Shop, "shop_code" | "shop_id" | "shop_name" | "shop_status">;
};

const dangerOperations = new Set(["soft_delete", "purge", "force_purge"]);
const fieldClassName =
  "h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none focus:border-slate-950 focus-visible:ring-2 focus-visible:ring-slate-950 disabled:bg-slate-100 disabled:text-slate-400";
const labelClassName = "grid min-w-0 gap-1 text-sm font-semibold text-slate-800";

function resultMessage(lastResult?: ShopDangerZoneActionsProps["lastResult"]) {
  if (
    !lastResult?.operation ||
    !lastResult.result ||
    !dangerOperations.has(lastResult.operation)
  ) {
    return null;
  }

  return `${lastResult.operation}: ${lastResult.result}`;
}

export function ShopDangerZoneActions({
  dependencies,
  lastResult,
  purgeBlockedReasons,
  returnTo,
  shop,
}: ShopDangerZoneActionsProps) {
  const message = resultMessage(lastResult);
  const archiveAvailable = shop.shop_status !== "archived";
  const purgeConfirmation = `DELETE ${shop.shop_code}`;
  const [purgeReason, setPurgeReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const forceManagedDependencies = dependencies.filter(
    (dependency) => dependency.blocksPurge && dependency.managedByForcePurge,
  );
  const forcePurgeMode = forceManagedDependencies.length > 0;
  const purgePrerequisitesOk =
    shop.shop_status === "archived" && purgeBlockedReasons.length === 0;
  const purgeReady =
    purgePrerequisitesOk &&
    purgeReason.trim().length > 0 &&
    confirmation.trim() === purgeConfirmation;

  return (
    <div className="grid gap-4">
      {message ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
          Last danger-zone action: {message}
        </p>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-md border border-rose-200 bg-white p-4">
          <div>
            <h3 className="text-sm font-semibold text-rose-950">Archive shop</h3>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              Reversible cleanup. Operational access is disabled, while the
              Master Console record, dependencies, and audit stay available.
            </p>
          </div>
          {archiveAvailable ? (
            <form action={softDeletePlatformShopAction} className="mt-4 grid gap-3">
              <input name="shopId" type="hidden" value={shop.shop_id} />
              <input name="returnTo" type="hidden" value={returnTo} />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <label className={labelClassName}>
                  Reason
                  <input
                    className={fieldClassName}
                    maxLength={240}
                    name="reason"
                    placeholder="Why archiving is approved"
                    required
                    type="text"
                  />
                </label>
                <label className={labelClassName}>
                  Confirm shop code
                  <input
                    className={fieldClassName}
                    name="shopCodeConfirmation"
                    placeholder={shop.shop_code}
                    required
                    type="text"
                  />
                </label>
              </div>
              <div>
                <PendingSubmitButton danger pendingLabel="Archiving...">
                  Archive shop
                </PendingSubmitButton>
              </div>
            </form>
          ) : (
            <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Already archived. Reopen from lifecycle management when the shop
              should return to operational access.
            </p>
          )}
        </section>

        <section className="rounded-md border border-slate-300 bg-slate-50 p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">
              {forcePurgeMode ? "Safe force purge test shop" : "Normal purge test shop"}
            </h3>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              {forcePurgeMode
                ? "Snapshots shop history to global audit, revokes membership, deletes manageable test dependencies, then removes the archived synthetic shop."
                : "Physical delete is permanent and limited to archived synthetic test/local/staging shops with no dependencies."}
            </p>
          </div>
          <form action={purgePlatformShopAction} className="mt-4 grid gap-3">
            <input
              name="purgeMode"
              type="hidden"
              value={forcePurgeMode ? "force_test" : "normal"}
            />
            <input name="shopId" type="hidden" value={shop.shop_id} />
            <input name="returnTo" type="hidden" value="/platform/shops" />
            {forcePurgeMode ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-950">
                {forceManagedDependencies.length} dependency group
                {forceManagedDependencies.length === 1 ? "" : "s"} will be
                copied into a global snapshot and removed only after server-side
                recheck.
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              <label className={labelClassName}>
                Reason
                <input
                  className={fieldClassName}
                  disabled={!purgePrerequisitesOk}
                  maxLength={240}
                  name="reason"
                  onChange={(event) => setPurgeReason(event.target.value)}
                  placeholder="Why physical delete is safe"
                  required
                  type="text"
                  value={purgeReason}
                />
              </label>
              <label className={labelClassName}>
                Confirm phrase
                <input
                  className={fieldClassName}
                  disabled={!purgePrerequisitesOk}
                  name="confirmation"
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder={purgeConfirmation}
                  required
                  type="text"
                  value={confirmation}
                />
              </label>
            </div>
            <div>
              <PendingSubmitButton
                danger
                disabled={!purgeReady}
                pendingLabel={forcePurgeMode ? "Force purging..." : "Purging..."}
              >
                {forcePurgeMode ? "Force purge test shop" : "Purge shop"}
              </PendingSubmitButton>
            </div>
          </form>
        </section>
      </div>

      <details className="rounded-md border border-slate-200 bg-white" open>
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-slate-950">
          Dependency preview
        </summary>
        <div className="border-t border-slate-200 p-3">
          <dl className="mb-3 grid gap-2 md:grid-cols-4">
            {[
              ["Shop ID", shop.shop_id],
              ["Shop code", shop.shop_code],
              ["Shop name", shop.shop_name],
              ["Status", shop.shop_status],
            ].map(([label, value]) => (
              <div
                className="rounded-md border border-slate-200 bg-white px-3 py-2"
                key={label}
              >
                <dt className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                  {label}
                </dt>
                <dd className="mt-1 truncate text-sm text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
          <dl className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {dependencies.map((item) => (
              <div
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                key={item.label}
              >
                <dt className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                  {item.label}
                </dt>
                <dd className="mt-1 text-sm text-slate-800">{item.value}</dd>
                {item.blocksPurge && item.managedByForcePurge ? (
                  <dd className="mt-1 text-xs font-semibold text-amber-700">
                    Force-managed for test shop purge
                  </dd>
                ) : null}
              </div>
            ))}
          </dl>
          {purgeBlockedReasons.length > 0 ? (
            <ul className="mt-3 grid gap-2">
              {purgeBlockedReasons.map((reason) => (
                <li
                  key={reason}
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-950"
                >
                  {reason}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950">
              No blocking dependencies visible. The purge RPC will recheck this
              server-side before deleting.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
