"use client";

import { useActionState, useMemo, useState } from "react";
import {
  createPlatformShopFromUnifiedProvisioningAction,
  type PlatformShopProvisioningState,
} from "./actions";
import {
  SearchableEntityPicker,
  type SearchableEntityPickerItem,
} from "./SearchableEntityPicker";

type OwnerProfileOption = {
  displayName: string;
  profileId: string;
  shortProfileId: string;
  status: string;
};

type ShopProvisioningFormsProps = {
  ownerProfiles: readonly OwnerProfileOption[];
};

type OwnerSetupMode = "existing-owner" | "pending-email" | "pos-first";

const initialState: PlatformShopProvisioningState = {
  code: "success",
  message: "Ready.",
  ok: true,
};

const ownerSetupOptions: readonly {
  description: string;
  label: string;
  mode: OwnerSetupMode;
}[] = [
  {
    description: "Create the shop and initial manager before linking a personal owner.",
    label: "No personal owner now / POS-first",
    mode: "pos-first",
  },
  {
    description: "Attach an active personal profile as shop owner during creation.",
    label: "Link existing personal owner",
    mode: "existing-owner",
  },
  {
    description: "Record a pending setup email without activating email delivery.",
    label: "Record pending owner email",
    mode: "pending-email",
  },
];

const submitLabelByMode: Record<OwnerSetupMode, string> = {
  "existing-owner": "Create shop with owner",
  "pending-email": "Create pending owner setup",
  "pos-first": "Create POS-first shop",
};

const ownerStatusLabelByMode: Record<OwnerSetupMode, string> = {
  "existing-owner": "Personal owner linked",
  "pending-email": "Pending owner setup recorded",
  "pos-first": "No personal owner yet",
};

const pendingLabelByMode: Record<OwnerSetupMode, string> = {
  "existing-owner": "Creating shop with owner",
  "pending-email": "Creating pending owner setup",
  "pos-first": "Creating POS-first shop",
};

function shopCodeFromCompanyRut(value: string) {
  return value.trim().replace(/[.\-\s]/g, "").toUpperCase();
}

function formatRutForFiscalDisplay(value: string) {
  const compactRut = shopCodeFromCompanyRut(value);

  if (compactRut.length < 2) {
    return compactRut;
  }

  const body = compactRut.slice(0, -1);
  const checkDigit = compactRut.slice(-1);
  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${formattedBody}-${checkDigit}`;
}

function inputClassName(extra = "") {
  return [
    "min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

function submitClassName() {
  return "min-h-10 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300";
}

function FieldError({
  field,
  state,
}: {
  field: string;
  state: PlatformShopProvisioningState;
}) {
  const message = state.fieldErrors?.[field];

  return message ? (
    <span className="text-xs font-medium text-red-700">{message}</span>
  ) : null;
}

function CopyCredentialButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
  }

  return (
    <button
      className="min-h-9 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-950 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
      onClick={handleCopy}
      type="button"
    >
      {copied ? "Copied" : "Copy credential"}
    </button>
  );
}

function ProvisioningResultBanner({
  state,
}: {
  state: PlatformShopProvisioningState;
}) {
  if (state.message === initialState.message) {
    return null;
  }

  return (
    <section
      aria-live="polite"
      className={[
        "rounded-md border p-4 text-sm",
        state.ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
          : "border-red-200 bg-red-50 text-red-950",
      ].join(" ")}
      role={state.ok ? "status" : "alert"}
    >
      <p className="font-semibold">{state.ok ? "Shop created" : state.message}</p>
      {state.ok ? (
        <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs uppercase text-emerald-800">Shop name</dt>
            <dd className="text-sm">{state.shopName ?? "Not returned"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-emerald-800">Company RUT</dt>
            <dd className="font-mono text-sm">
              {state.companyRut ?? "Not returned"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-emerald-800">Shop code</dt>
            <dd className="font-mono text-sm">{state.shopCode ?? "Not returned"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-emerald-800">Owner mode</dt>
            <dd className="text-sm">{state.ownerMode ?? "Not returned"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-emerald-800">
              Staff code
            </dt>
            <dd className="font-mono text-sm">{state.staffCode ?? "1001"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-emerald-800">
              Temporary credential/PIN shown once
            </dt>
            <dd className="text-sm">
              {state.temporaryCredential
                ? "Shown below"
                : "Not returned by this action"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-emerald-800">Owner status</dt>
            <dd className="text-sm">
              {state.ownerStatus ?? "No personal owner yet"}
            </dd>
          </div>
        </dl>
      ) : null}
      {state.temporaryCredential ? (
        <>
          <div className="mt-3 grid gap-2 rounded-md border border-emerald-200 bg-white p-3">
            <p className="text-xs font-semibold text-emerald-950">
              Save this credential now. It will not be shown again.
            </p>
            <code className="block break-all rounded bg-emerald-50 px-2 py-1 text-slate-950">
              {state.temporaryCredential}
            </code>
            <div>
              <CopyCredentialButton value={state.temporaryCredential} />
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function ShopIdentityFields({
  companyRut,
  onCompanyRutBlur,
  onCompanyRutChange,
  onShopCodeChange,
  onUseCompanyRutAsShopCodeChange,
  shopCode,
  state,
  useCompanyRutAsShopCode,
}: {
  companyRut: string;
  onCompanyRutBlur: () => void;
  onCompanyRutChange: (value: string) => void;
  onShopCodeChange: (value: string) => void;
  onUseCompanyRutAsShopCodeChange: (checked: boolean) => void;
  shopCode: string;
  state: PlatformShopProvisioningState;
  useCompanyRutAsShopCode: boolean;
}) {
  return (
    <fieldset className="grid gap-4 rounded-md border border-slate-200 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-900">
        Shop identity
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium text-slate-800">
          <span>Shop name</span>
          <input
            className={inputClassName()}
            name="shopName"
            placeholder="Acme Santiago"
            required
          />
          <FieldError field="shopName" state={state} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-800">
          <span>Company RUT</span>
          <input
            className={inputClassName("font-mono uppercase")}
            name="companyRut"
            onBlur={onCompanyRutBlur}
            onChange={(event) => onCompanyRutChange(event.target.value)}
            placeholder="76.123.456-7"
            required
            value={companyRut}
          />
          <FieldError field="companyRut" state={state} />
        </label>
      </div>
      <label className="grid gap-1.5 text-sm font-medium text-slate-800">
        <span>Shop code</span>
        <span className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal text-slate-700">
          <input
            checked={useCompanyRutAsShopCode}
            className="mt-0.5 h-4 w-4 accent-slate-950"
            onChange={(event) =>
              onUseCompanyRutAsShopCodeChange(event.target.checked)
            }
            type="checkbox"
          />
          <span>Use Company RUT as Shop code</span>
        </span>
        <input
          className={inputClassName("font-mono uppercase")}
          name="shopCode"
          onChange={(event) => onShopCodeChange(event.target.value)}
          placeholder="761234567"
          readOnly={useCompanyRutAsShopCode}
          required
          value={shopCode}
        />
        <span className="text-xs font-normal leading-5 text-slate-600">
          Shop code is used for POS/Admin Console login. By default it uses Company RUT without dots or dash.
        </span>
        <span className="text-xs font-normal leading-5 text-slate-600">
          {"Example: 76.123.456-7 -> 761234567; 76.123.456-K -> 76123456K."}
        </span>
        <FieldError field="shopCode" state={state} />
      </label>
    </fieldset>
  );
}

function FiscalIdentityFields({
  state,
}: {
  state: PlatformShopProvisioningState;
}) {
  return (
    <fieldset className="grid gap-4 rounded-md border border-slate-200 p-4 sm:grid-cols-2">
      <legend className="px-1 text-sm font-semibold text-slate-900">
        Fiscal / Boleta identity
      </legend>
      <p className="text-xs leading-5 text-slate-600 sm:col-span-2">
        Fiscal identity is managed by Master Console and shown read-only in Admin Console.
      </p>
      <label className="grid gap-1.5 text-sm font-medium text-slate-800">
        <span>Business giro</span>
        <input
          className={inputClassName()}
          name="businessGiro"
          placeholder="Retail and POS operations"
          required
        />
        <FieldError field="businessGiro" state={state} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-slate-800">
        <span>Address</span>
        <input
          className={inputClassName()}
          name="businessAddress"
          placeholder="Av. Providencia 1234"
          required
        />
        <FieldError field="businessAddress" state={state} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-slate-800">
        <span>City</span>
        <input
          className={inputClassName()}
          name="businessCity"
          placeholder="Santiago"
          required
        />
        <FieldError field="businessCity" state={state} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-slate-800 sm:col-span-2">
        <span>Legal representative RUT</span>
        <input
          className={inputClassName("font-mono uppercase")}
          name="legalRepresentativeRut"
          placeholder="12.345.678-9"
          required
        />
        <FieldError field="legalRepresentativeRut" state={state} />
      </label>
    </fieldset>
  );
}

function OwnerProfilePicker({
  profiles,
  state,
}: {
  profiles: readonly OwnerProfileOption[];
  state: PlatformShopProvisioningState;
}) {
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const pickerItems = useMemo(
    () =>
      profiles.map((profile) => ({
        ...profile,
        id: profile.profileId,
        searchText: [
          profile.displayName,
          profile.profileId,
          profile.shortProfileId,
          profile.status,
        ].join(" "),
        title: profile.profileId,
      })),
    [profiles],
  ) satisfies readonly (OwnerProfileOption & SearchableEntityPickerItem)[];

  return (
    <div className="grid gap-2">
      <SearchableEntityPicker
        emptyState="No profiles match this search"
        hiddenInputName="ownerProfileId"
        items={pickerItems}
        label="Initial owner"
        onSelect={setSelectedProfileId}
        renderItemStatus={(profile) => profile.status}
        renderItemSubtitle={(profile) => profile.shortProfileId}
        renderItemTitle={(profile) => profile.displayName}
        searchPlaceholder="Search profiles"
        selectedId={selectedProfileId}
        selectedSummaryLabel="Selected owner"
      />
      <FieldError field="ownerProfileId" state={state} />
    </div>
  );
}

function InitialManagerSummary() {
  const summaryItems = [
    "Staff code: 1001",
    "Display name: manager",
    "Access: full Admin Console access",
    "Temporary credential. It is shown once after creation and should be changed after first access.",
  ];

  return (
    <section className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-900">
        Initial manager access
      </h3>
      <ul className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        {summaryItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function OwnerSetupFields({
  mode,
  onChange,
  ownerProfiles,
  state,
}: {
  mode: OwnerSetupMode;
  onChange: (mode: OwnerSetupMode) => void;
  ownerProfiles: readonly OwnerProfileOption[];
  state: PlatformShopProvisioningState;
}) {
  return (
    <fieldset className="grid gap-3 rounded-md border border-slate-200 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-900">
        Owner setup
      </legend>
      <div className="grid gap-2">
        {ownerSetupOptions.map((option) => {
          const selected = option.mode === mode;

          return (
            <label
              className={[
                "grid cursor-pointer gap-1 rounded-md border px-3 py-2 text-sm outline-none transition",
                selected
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-800 hover:border-slate-400",
              ].join(" ")}
              key={option.mode}
              title={ownerStatusLabelByMode[option.mode]}
            >
              <span className="flex items-center gap-2 font-semibold">
                <input
                  checked={selected}
                  className="h-4 w-4 accent-slate-950"
                  name="ownerSetupMode"
                  onChange={() => onChange(option.mode)}
                  type="radio"
                  value={option.mode}
                />
                {option.label}
              </span>
              <span className="pl-6 text-xs leading-5 opacity-80">
                {option.description}
              </span>
            </label>
          );
        })}
      </div>
      <FieldError field="ownerSetupMode" state={state} />

      {mode === "existing-owner" ? (
        <OwnerProfilePicker profiles={ownerProfiles} state={state} />
      ) : null}

      {mode === "pending-email" ? (
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm font-medium text-slate-800">
            <span>Future owner email</span>
            <input
              className={inputClassName()}
              name="ownerEmail"
              placeholder="owner@example.com"
              required
              type="email"
            />
            <FieldError field="ownerContact" state={state} />
          </label>
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            This records a pending owner setup. Email delivery is not active yet.
          </p>
        </div>
      ) : null}
    </fieldset>
  );
}

function ReasonField({ state }: { state: PlatformShopProvisioningState }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-800">
      <span>Reason</span>
      <textarea
        className="min-h-20 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
        name="reason"
        placeholder="Why this provisioning action is approved"
        required
        rows={3}
      />
      <FieldError field="reason" state={state} />
    </label>
  );
}

export function ShopProvisioningForms({
  ownerProfiles,
}: ShopProvisioningFormsProps) {
  const [ownerSetupMode, setOwnerSetupMode] =
    useState<OwnerSetupMode>("pos-first");
  const [companyRut, setCompanyRut] = useState("");
  const [shopCode, setShopCode] = useState("");
  const [useCompanyRutAsShopCode, setUseCompanyRutAsShopCode] = useState(true);
  const [state, formAction, createShopPending] = useActionState(
    createPlatformShopFromUnifiedProvisioningAction,
    initialState,
  );

  function handleCompanyRutChange(value: string) {
    setCompanyRut(value);

    if (useCompanyRutAsShopCode) {
      setShopCode(shopCodeFromCompanyRut(value));
    }
  }

  function handleCompanyRutBlur() {
    const formattedRut = formatRutForFiscalDisplay(companyRut);

    setCompanyRut(formattedRut);

    if (useCompanyRutAsShopCode) {
      setShopCode(shopCodeFromCompanyRut(formattedRut));
    }
  }

  function handleUseCompanyRutAsShopCodeChange(checked: boolean) {
    setUseCompanyRutAsShopCode(checked);

    if (checked) {
      setShopCode(shopCodeFromCompanyRut(companyRut));
    }
  }

  return (
    <section className="grid gap-4 rounded-md border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Create shop</h2>
        <p className="mt-1 text-sm text-slate-600">
          Create the shop, fiscal identity, initial manager access, and optional owner setup.
        </p>
      </div>

      <ProvisioningResultBanner state={state} />

      <form action={formAction} className="grid gap-4">
        <ShopIdentityFields
          companyRut={companyRut}
          onCompanyRutBlur={handleCompanyRutBlur}
          onCompanyRutChange={handleCompanyRutChange}
          onShopCodeChange={setShopCode}
          onUseCompanyRutAsShopCodeChange={handleUseCompanyRutAsShopCodeChange}
          shopCode={shopCode}
          state={state}
          useCompanyRutAsShopCode={useCompanyRutAsShopCode}
        />
        <FiscalIdentityFields state={state} />
        <InitialManagerSummary />
        <OwnerSetupFields
          mode={ownerSetupMode}
          onChange={setOwnerSetupMode}
          ownerProfiles={ownerProfiles}
          state={state}
        />
        <ReasonField state={state} />
        <div className="flex justify-end border-t border-slate-200 pt-4">
          <button
            className={submitClassName()}
            disabled={createShopPending}
            type="submit"
          >
            {createShopPending
              ? pendingLabelByMode[ownerSetupMode]
              : submitLabelByMode[ownerSetupMode]}
          </button>
        </div>
      </form>
    </section>
  );
}
