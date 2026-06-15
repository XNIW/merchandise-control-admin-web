"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import type { PlatformStaffManagerProvisionState } from "./provisioningFormSubmit";
import {
  SearchableEntityPicker,
  type SearchableEntityPickerItem,
} from "./SearchableEntityPicker";
import {
  createPlatformProvisioningTranslator,
  defaultPlatformProvisioningLabels,
  type PlatformProvisioningLabels,
} from "./provisioningLabels";
import { submitPlatformProvisioningForm } from "./platformProvisioningRequest";

type StaffManagerProvisioningPanelProps = {
  labels?: PlatformProvisioningLabels;
  shops: readonly {
    label: string;
    shopCode: string;
    shopId: string;
    shopName: string;
    status: string;
  }[];
};

type PlatformProvisioningT = (value: string) => string;

const initialState: PlatformStaffManagerProvisionState = {
  code: "success",
  message: "Action ready.",
  ok: true,
};

const requestFailedState: PlatformStaffManagerProvisionState = {
  code: "credential_update_database_error",
  message:
    "Recovery could not complete because the database boundary failed. Check server diagnostics.",
  ok: false,
};

const operationResultLabel: Record<string, string> = {
  credential_reset: "PIN reset",
  reactivated_reset: "Manager reactivated and PIN reset",
  recreated: "Manager recreated",
};

function FieldError({
  field,
  state,
  t,
}: {
  field: string;
  state: PlatformStaffManagerProvisionState;
  t: PlatformProvisioningT;
}) {
  const message = state.fieldErrors?.[field];

  return message ? (
    <span className="text-xs font-medium text-red-700">{t(message)}</span>
  ) : null;
}

function CopyPinButton({
  t,
  value,
}: {
  t: PlatformProvisioningT;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="min-h-9 rounded-md border border-emerald-900 bg-emerald-900 px-3 py-2 text-xs font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:ring-offset-2"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
      }}
      type="button"
    >
      {copied ? t("Copied") : t("Copy PIN")}
    </button>
  );
}

export function StaffManagerProvisioningPanel({
  labels = defaultPlatformProvisioningLabels,
  shops,
}: StaffManagerProvisioningPanelProps) {
  const t = useMemo(
    () => createPlatformProvisioningTranslator(labels),
    [labels],
  );
  const [shopCodeQuery, setShopCodeQuery] = useState("");
  const [selectedShopId, setSelectedShopId] = useState("");
  const [reason, setReason] = useState("");
  const [state, setState] =
    useState<PlatformStaffManagerProvisionState>(initialState);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const hasResult = state.message !== initialState.message;
  const hasShops = shops.length > 0;
  const shopItems = useMemo(
    () =>
      shops.map((shop) => ({
        ...shop,
        id: shop.shopId,
        searchText: [
          shop.shopName,
          shop.shopCode,
          shop.shopId,
          shop.status,
          shop.label,
        ].join(" "),
        title: `${shop.shopId} / ${shop.shopCode}`,
      })),
    [shops],
  ) satisfies readonly (StaffManagerProvisioningPanelProps["shops"][number] &
    SearchableEntityPickerItem)[];
  const operationResult = state.operationResult
    ? t(operationResultLabel[state.operationResult] ?? state.operationResult)
    : null;
  const selectedShop = useMemo(
    () => shops.find((shop) => shop.shopId === selectedShopId),
    [selectedShopId, shops],
  );
  const submittedShopCode = selectedShop?.shopCode ?? shopCodeQuery.trim();

  async function handleRecoverSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pendingRef.current) {
      return;
    }

    pendingRef.current = true;
    setPending(true);

    try {
      const payload = new FormData();

      payload.set("reason", reason);
      payload.set("shopCode", submittedShopCode);
      payload.set("shopId", selectedShopId);

      const responsePromise = submitPlatformProvisioningForm(
        "/platform/provisioning/recover-manager-1001",
        payload,
      );

      const response = await responsePromise;

      if (!response.ok) {
        setState(requestFailedState);
        return;
      }

      setState((await response.json()) as PlatformStaffManagerProvisionState);
    } catch {
      setState(requestFailedState);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleRecoverSubmit}>
      <section
        aria-labelledby="manager-recovery-action-title"
        className="grid gap-1 rounded-md border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 sm:col-span-2"
      >
        <h3
          className="text-sm font-semibold text-slate-950"
          id="manager-recovery-action-title"
        >
          {t("Recover initial manager 1001")}
        </h3>
        <p>
          {t(
            "This recovery always targets staff code 1001. Client-provided staff code values are ignored by the server.",
          )}
        </p>
      </section>

      <div className="grid gap-2 sm:col-span-2">
        <SearchableEntityPicker
          emptyState={t("No shops match this search")}
          hiddenInputName="shopId"
          items={shopItems}
          label={t("Target shop")}
          noResultsLabel={t("No results.")}
          noneLabel={t("None")}
          onQueryChange={setShopCodeQuery}
          onSelect={setSelectedShopId}
          renderItemStatus={(shop) => shop.status}
          renderItemSubtitle={(shop) => shop.shopCode}
          renderItemTitle={(shop) => shop.shopName}
          searchPlaceholder={t("Search target shops")}
          selectedId={selectedShopId}
          selectedSummaryLabel={t("Selected shop")}
        />
        <input name="shopCode" type="hidden" value={submittedShopCode} />
        <FieldError field="shopId" state={state} t={t} />
        <FieldError field="shopCode" state={state} t={t} />
      </div>

      <section
        aria-labelledby="manager-recovery-state-title"
        className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 sm:col-span-2"
      >
        <h3
          className="text-sm font-semibold text-slate-950"
          id="manager-recovery-state-title"
        >
          {t("Manager state")}
        </h3>
        <p>
          {t(
            "Manager availability is resolved at the server boundary after shop selection. Dynamic manager selection is not available in this read model yet.",
          )}
        </p>
        <p>
          {t(
            "If manager 1001 exists and is usable, recovery resets its PIN. If manager 1001 is suspended, archived, disabled or otherwise not usable, recovery reactivates it and resets its PIN. If manager 1001 is missing, recovery recreates manager 1001 with full access.",
          )}
        </p>
        <p>{t("New manager display name: manager")}</p>
      </section>

      <label className="grid gap-1.5 text-sm font-medium text-slate-800 sm:col-span-2">
        <span>{t("Reason")}</span>
        <textarea
          name="reason"
          onChange={(event) => setReason(event.target.value)}
          required
          rows={3}
          value={reason}
          className="min-h-20 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
        />
        <FieldError field="reason" state={state} t={t} />
      </label>

      <div className="flex flex-col gap-3 sm:col-span-2">
        <button
          type="submit"
          aria-disabled={!hasShops || pending}
          disabled={!hasShops || pending}
          className="min-h-10 rounded-md border border-slate-950 bg-slate-950 px-3 py-2 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
        >
          {pending ? t("Recovering manager 1001") : t("Recover manager 1001")}
        </button>

        {hasResult ? (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              state.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                : "border-red-200 bg-red-50 text-red-950"
            }`}
            role={state.ok ? "status" : "alert"}
          >
            <span className="block font-medium">{t(state.message)}</span>
            {state.ok ? (
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase text-emerald-800">
                    {t("Shop name")}
                  </dt>
                  <dd className="text-sm">{state.shopName ?? t("Not returned")}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-emerald-800">
                    {t("Shop code")}
                  </dt>
                  <dd className="text-sm">{state.shopCode ?? t("Not returned")}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-emerald-800">
                    {t("Staff code")}
                  </dt>
                  <dd className="text-sm">1001</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-emerald-800">
                    {t("Operation result")}
                  </dt>
                  <dd className="text-sm">{operationResult ?? t("Not returned")}</dd>
                </div>
              </dl>
            ) : null}
            {state.oneTimeSignInValue ? (
              <>
                <span className="mt-2 block text-xs text-emerald-900">
                  {t(
                    "Temporary PIN. Shown once in this response. It will not be shown again.",
                  )}
                </span>
                <p className="mt-2 text-xs text-emerald-900">
                  {t(
                    "Use this PIN with shop code and staff code 1001 for the first Admin Console / Win7POS access. The shop should change it after first access.",
                  )}
                </p>
                <code className="mt-2 block rounded bg-white px-3 py-2 font-mono text-2xl font-semibold text-slate-950">
                  {state.oneTimeSignInValue}
                </code>
                <div className="mt-2">
                  <CopyPinButton t={t} value={state.oneTimeSignInValue} />
                </div>
                <p className="mt-2 text-xs font-semibold text-emerald-950">
                  {t("Save this PIN now. It will not be shown again.")}
                </p>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </form>
  );
}
