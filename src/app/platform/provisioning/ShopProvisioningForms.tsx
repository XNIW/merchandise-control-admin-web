"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  PlatformShopProvisioningFormValues,
  PlatformShopProvisioningState,
} from "./provisioningFormSubmit";
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

type OwnerProfileOption = {
  displayName: string;
  profileId: string;
  shortProfileId: string;
  status: string;
};

type ShopProvisioningFormsProps = {
  labels?: PlatformProvisioningLabels;
  ownerProfiles: readonly OwnerProfileOption[];
};

type OwnerSetupMode = "existing-owner" | "pending-email" | "pos-first";
type FieldErrorMap = Record<string, string>;
type RegisteredField = HTMLInputElement | HTMLTextAreaElement;
type PlatformProvisioningT = (value: string) => string;

const initialState: PlatformShopProvisioningState = {
  code: "success",
  message: "Ready.",
  ok: true,
};

const requestFailedState: PlatformShopProvisioningState = {
  code: "db_failure",
  credentialGenerated: false,
  message: "The controlled database action failed without exposing internal details.",
  ok: false,
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

const emptyFormValues: PlatformShopProvisioningFormValues = {
  businessAddress: "",
  businessCity: "",
  businessGiro: "",
  companyRut: "",
  legalRepresentativeRut: "",
  ownerContact: "",
  ownerProfileId: "",
  ownerSetupMode: "pos-first",
  reason: "",
  shopCode: "",
  shopName: "",
  useCompanyRutAsShopCode: true,
};

const invalidFieldFocusOrder = [
  "shopName",
  "companyRut",
  "shopCode",
  "businessGiro",
  "businessAddress",
  "businessCity",
  "legalRepresentativeRut",
  "ownerSetupMode",
  "ownerProfileId",
  "ownerContact",
  "reason",
] as const;

function normalizeOwnerSetupMode(value: string): OwnerSetupMode {
  if (
    value === "existing-owner" ||
    value === "pending-email" ||
    value === "pos-first"
  ) {
    return value;
  }

  return "pos-first";
}

function normalizeRutInput(raw: string) {
  return raw.trim().replace(/[.\-\s]/g, "").toUpperCase();
}

function deriveShopCodeFromRut(raw: string) {
  return normalizeRutInput(raw);
}

function shopCodeFromCompanyRut(value: string) {
  return deriveShopCodeFromRut(value);
}

function validateRutFormat(raw: string) {
  const compactRut = normalizeRutInput(raw);

  if (!compactRut) {
    return "RUT is required.";
  }

  if (/[^0-9K]/.test(compactRut) || compactRut.slice(0, -1).includes("K")) {
    return "RUT can contain numbers and K only as the final check digit.";
  }

  if (!/^[0-9]{7,8}[0-9K]$/.test(compactRut)) {
    return "Enter a valid Chilean RUT. You can enter only numbers; for example 123456789.";
  }

  return undefined;
}

function formatRutForDisplay(raw: string) {
  const compactRut = normalizeRutInput(raw);

  if (
    compactRut.length < 3 ||
    !/^[0-9]{1,8}[0-9K]?$/.test(compactRut) ||
    compactRut.slice(0, -1).includes("K")
  ) {
    return raw.trim().toUpperCase();
  }

  const body = compactRut.slice(0, -1);
  const checkDigit = compactRut.slice(-1);
  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${formattedBody}-${checkDigit}`;
}

function formatRutForFiscalDisplay(value: string) {
  return formatRutForDisplay(value);
}

function normalizeShopCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeShopNameForInput(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
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
  id,
  message,
}: {
  field: string;
  id: string;
  message?: string;
}) {
  return message ? (
    <span className="text-xs font-medium text-red-700" data-field={field} id={id}>
      {message}
    </span>
  ) : null;
}

type FieldErrorHelpers = {
  fieldErrorId: (field: string) => string;
  fieldHasError: (field: string) => boolean;
  fieldMessage: (field: string) => string | undefined;
  registerField: (field: string) => (element: RegisteredField | null) => void;
};

function CopyPinButton({
  t,
  value,
}: {
  t: PlatformProvisioningT;
  value: string;
}) {
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
      {copied ? t("Copied") : t("Copy PIN")}
    </button>
  );
}

function ProvisioningResultBanner({
  state,
  t,
}: {
  state: PlatformShopProvisioningState;
  t: PlatformProvisioningT;
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
      <p className="font-semibold">
        {state.ok ? t("Shop created") : t(state.message)}
      </p>
      {state.ok ? (
        <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs uppercase text-emerald-800">
              {t("Shop name")}
            </dt>
            <dd className="text-sm">{state.shopName ?? t("Not returned")}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-emerald-800">
              {t("Company RUT")}
            </dt>
            <dd className="font-mono text-sm">
              {state.companyRut ?? t("Not returned")}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-emerald-800">
              {t("Shop code")}
            </dt>
            <dd className="font-mono text-sm">
              {state.shopCode ?? t("Not returned")}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-emerald-800">
              {t("Owner mode")}
            </dt>
            <dd className="text-sm">
              {state.ownerMode ? t(state.ownerMode) : t("Not returned")}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-emerald-800">
              {t("Staff code")}
            </dt>
            <dd className="font-mono text-sm">{state.staffCode ?? "1001"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-emerald-800">
              {t("Temporary PIN shown once")}
            </dt>
            <dd className="text-sm">
              {state.temporaryCredential
                ? t("Shown below")
                : t("Not returned by this action")}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-emerald-800">
              {t("Owner status")}
            </dt>
            <dd className="text-sm">
              {state.ownerStatus
                ? t(state.ownerStatus)
                : t("No personal owner yet")}
            </dd>
          </div>
        </dl>
      ) : null}
      {state.temporaryCredential ? (
        <>
          <div className="mt-3 grid gap-2 rounded-md border border-emerald-200 bg-white p-3">
            <p className="text-xs font-semibold text-emerald-950">
              {t("Save this PIN now. It will not be shown again.")}
            </p>
            <p className="text-xs text-emerald-900">
              {t(
                "Use this PIN with shop code and staff code 1001 for the first Admin Console / Win7POS access. The shop should change it after first access.",
              )}
            </p>
            <code className="block rounded bg-emerald-50 px-3 py-2 font-mono text-2xl font-semibold text-slate-950">
              {state.temporaryCredential}
            </code>
            <div>
              <CopyPinButton t={t} value={state.temporaryCredential} />
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function ShopIdentityFields({
  fieldErrorId,
  fieldHasError,
  fieldMessage,
  formValues,
  onCompanyRutBlur,
  onCompanyRutChange,
  onShopNameBlur,
  onShopNameChange,
  onShopCodeChange,
  onUseCompanyRutAsShopCodeChange,
  registerField,
  t,
}: FieldErrorHelpers & {
  formValues: PlatformShopProvisioningFormValues;
  onCompanyRutBlur: () => void;
  onCompanyRutChange: (value: string) => void;
  onShopNameBlur: () => void;
  onShopNameChange: (value: string) => void;
  onShopCodeChange: (value: string) => void;
  onUseCompanyRutAsShopCodeChange: (checked: boolean) => void;
  t: PlatformProvisioningT;
}) {
  return (
    <fieldset className="grid gap-4 rounded-md border border-slate-200 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-900">
        {t("Shop identity")}
      </legend>
      <p className="text-xs leading-5 text-slate-600">
        {t(
          "RUT can be typed with or without dots/dash. Shop code uses the compact RUT for login.",
        )}
      </p>
      <div
        className="grid items-start gap-4 sm:grid-cols-2"
        data-layout="shop-identity-primary-row"
      >
        <label className="grid gap-1.5 text-sm font-medium text-slate-800">
          <span>{t("Shop name")}</span>
          <input
            aria-describedby={fieldErrorId("shopName")}
            aria-invalid={fieldHasError("shopName")}
            className={inputClassName()}
            name="shopName"
            onBlur={onShopNameBlur}
            onChange={(event) => onShopNameChange(event.target.value)}
            placeholder="Acme Santiago"
            ref={registerField("shopName")}
            required
            value={formValues.shopName}
          />
          <FieldError
            field="shopName"
            id={fieldErrorId("shopName")}
            message={fieldMessage("shopName")}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-800">
          <span>{t("Company RUT")}</span>
          <input
            aria-describedby={fieldErrorId("companyRut")}
            aria-invalid={fieldHasError("companyRut")}
            className={inputClassName("font-mono uppercase")}
            name="companyRut"
            onBlur={onCompanyRutBlur}
            onChange={(event) => onCompanyRutChange(event.target.value)}
            placeholder="76.123.456-7"
            ref={registerField("companyRut")}
            required
            value={formValues.companyRut}
          />
          <FieldError
            field="companyRut"
            id={fieldErrorId("companyRut")}
            message={fieldMessage("companyRut")}
          />
        </label>
      </div>
      <label
        className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal text-slate-700"
        data-layout="shop-code-toggle-row"
      >
        <input
          checked={formValues.useCompanyRutAsShopCode}
          className="mt-0.5 h-4 w-4 accent-slate-950"
          name="useCompanyRutAsShopCode"
          onChange={(event) =>
            onUseCompanyRutAsShopCodeChange(event.target.checked)
          }
          type="checkbox"
          value="true"
        />
        <span>{t("Use Company RUT as Shop code")}</span>
      </label>
      <label
        className="grid gap-1.5 text-sm font-medium text-slate-800"
        data-layout="shop-code-row"
      >
        <span>{t("Shop code")}</span>
        <input
          aria-describedby={fieldErrorId("shopCode")}
          aria-invalid={fieldHasError("shopCode")}
          className={inputClassName("font-mono uppercase")}
          name="shopCode"
          onChange={(event) => onShopCodeChange(event.target.value)}
          placeholder="761234567"
          readOnly={formValues.useCompanyRutAsShopCode}
          ref={registerField("shopCode")}
          required
          value={formValues.shopCode}
        />
        <FieldError
          field="shopCode"
          id={fieldErrorId("shopCode")}
          message={fieldMessage("shopCode")}
        />
      </label>
    </fieldset>
  );
}

function FiscalIdentityFields({
  fieldErrorId,
  fieldHasError,
  fieldMessage,
  formValues,
  onFieldChange,
  onLegalRepresentativeRutBlur,
  registerField,
  t,
}: FieldErrorHelpers & {
  formValues: PlatformShopProvisioningFormValues;
  onFieldChange: (
    field: keyof PlatformShopProvisioningFormValues,
    value: string,
  ) => void;
  onLegalRepresentativeRutBlur: () => void;
  t: PlatformProvisioningT;
}) {
  return (
    <fieldset className="grid gap-4 rounded-md border border-slate-200 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-900">
        {t("Fiscal / Boleta identity")}
      </legend>
      <p className="text-xs leading-5 text-slate-600">
        {t(
          "Fiscal identity is managed by Master Console and shown read-only in Admin Console.",
        )}
      </p>
      <div
        className="grid items-start gap-4 sm:grid-cols-2"
        data-layout="fiscal-primary-row"
      >
        <label className="grid gap-1.5 text-sm font-medium text-slate-800">
          <span>{t("Business giro")}</span>
          <input
            aria-describedby={fieldErrorId("businessGiro")}
            aria-invalid={fieldHasError("businessGiro")}
            className={inputClassName()}
            name="businessGiro"
            onChange={(event) =>
              onFieldChange("businessGiro", event.target.value)
            }
            placeholder={t("Retail and POS operations")}
            ref={registerField("businessGiro")}
            required
            value={formValues.businessGiro}
          />
          <FieldError
            field="businessGiro"
            id={fieldErrorId("businessGiro")}
            message={fieldMessage("businessGiro")}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-800">
          <span>{t("Address")}</span>
          <input
            aria-describedby={fieldErrorId("businessAddress")}
            aria-invalid={fieldHasError("businessAddress")}
            className={inputClassName()}
            name="businessAddress"
            onChange={(event) =>
              onFieldChange("businessAddress", event.target.value)
            }
            placeholder="Av. Providencia 1234"
            ref={registerField("businessAddress")}
            required
            value={formValues.businessAddress}
          />
          <FieldError
            field="businessAddress"
            id={fieldErrorId("businessAddress")}
            message={fieldMessage("businessAddress")}
          />
        </label>
      </div>
      <div
        className="grid items-start gap-4 sm:grid-cols-2"
        data-layout="fiscal-secondary-row"
      >
        <label className="grid gap-1.5 text-sm font-medium text-slate-800">
          <span>{t("City")}</span>
          <input
            aria-describedby={fieldErrorId("businessCity")}
            aria-invalid={fieldHasError("businessCity")}
            className={inputClassName()}
            name="businessCity"
            onChange={(event) =>
              onFieldChange("businessCity", event.target.value)
            }
            placeholder="Santiago"
            ref={registerField("businessCity")}
            required
            value={formValues.businessCity}
          />
          <FieldError
            field="businessCity"
            id={fieldErrorId("businessCity")}
            message={fieldMessage("businessCity")}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-800">
          <span>{t("Legal representative RUT")}</span>
          <input
            aria-describedby={fieldErrorId("legalRepresentativeRut")}
            aria-invalid={fieldHasError("legalRepresentativeRut")}
            className={inputClassName("font-mono uppercase")}
            name="legalRepresentativeRut"
            onBlur={onLegalRepresentativeRutBlur}
            onChange={(event) =>
              onFieldChange("legalRepresentativeRut", event.target.value)
            }
            placeholder="12.345.678-9"
            ref={registerField("legalRepresentativeRut")}
            required
            value={formValues.legalRepresentativeRut}
          />
          <FieldError
            field="legalRepresentativeRut"
            id={fieldErrorId("legalRepresentativeRut")}
            message={fieldMessage("legalRepresentativeRut")}
          />
        </label>
      </div>
    </fieldset>
  );
}

function OwnerProfilePicker({
  fieldErrorId,
  fieldMessage,
  onSelect,
  profiles,
  selectedProfileId,
  t,
}: Pick<FieldErrorHelpers, "fieldErrorId" | "fieldMessage"> & {
  onSelect: (profileId: string) => void;
  profiles: readonly OwnerProfileOption[];
  selectedProfileId: string;
  t: PlatformProvisioningT;
}) {
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
        emptyState={t("No profiles match this search")}
        hiddenInputName="ownerProfileId"
        items={pickerItems}
        label={t("Initial owner")}
        noResultsLabel={t("No results.")}
        noneLabel={t("None")}
        onSelect={onSelect}
        renderItemStatus={(profile) => profile.status}
        renderItemSubtitle={(profile) => profile.shortProfileId}
        renderItemTitle={(profile) => profile.displayName}
        searchPlaceholder={t("Search profiles")}
        selectedId={selectedProfileId}
        selectedSummaryLabel={t("Selected owner")}
      />
      <FieldError
        field="ownerProfileId"
        id={fieldErrorId("ownerProfileId")}
        message={fieldMessage("ownerProfileId")}
      />
    </div>
  );
}

function InitialManagerSummary({ t }: { t: PlatformProvisioningT }) {
  const summaryItems = [
    "Staff code: 1001",
    "Display name: manager",
    "Access: full Admin Console access",
    "Temporary PIN. It is shown once after creation and should be changed after first access.",
  ];

  return (
    <section className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-900">
        {t("Initial manager access")}
      </h3>
      <ul className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        {summaryItems.map((item) => (
          <li key={item}>{t(item)}</li>
        ))}
      </ul>
    </section>
  );
}

function OwnerSetupFields({
  fieldErrorId,
  fieldHasError,
  fieldMessage,
  formValues,
  onChange,
  onFieldChange,
  onOwnerProfileSelect,
  ownerProfiles,
  registerField,
  t,
}: FieldErrorHelpers & {
  formValues: PlatformShopProvisioningFormValues;
  onChange: (mode: OwnerSetupMode) => void;
  onFieldChange: (
    field: keyof PlatformShopProvisioningFormValues,
    value: string,
  ) => void;
  onOwnerProfileSelect: (profileId: string) => void;
  ownerProfiles: readonly OwnerProfileOption[];
  t: PlatformProvisioningT;
}) {
  return (
    <fieldset className="grid gap-3 rounded-md border border-slate-200 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-900">
        {t("Owner setup")}
      </legend>
      <div className="grid gap-2">
        {ownerSetupOptions.map((option) => {
          const selected = option.mode === formValues.ownerSetupMode;

          return (
            <label
              className={[
                "grid cursor-pointer gap-1 rounded-md border px-3 py-2 text-sm outline-none transition",
                selected
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-800 hover:border-slate-400",
              ].join(" ")}
              key={option.mode}
              title={t(ownerStatusLabelByMode[option.mode])}
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
                {t(option.label)}
              </span>
              <span className="pl-6 text-xs leading-5 opacity-80">
                {t(option.description)}
              </span>
            </label>
          );
        })}
      </div>
      <FieldError
        field="ownerSetupMode"
        id={fieldErrorId("ownerSetupMode")}
        message={fieldMessage("ownerSetupMode")}
      />

      {formValues.ownerSetupMode === "existing-owner" ? (
          <OwnerProfilePicker
            fieldErrorId={fieldErrorId}
            fieldMessage={fieldMessage}
            onSelect={onOwnerProfileSelect}
            profiles={ownerProfiles}
            selectedProfileId={formValues.ownerProfileId}
            t={t}
          />
      ) : null}

      {formValues.ownerSetupMode === "pending-email" ? (
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm font-medium text-slate-800">
            <span>{t("Future owner email")}</span>
            <input
              aria-describedby={fieldErrorId("ownerContact")}
              aria-invalid={fieldHasError("ownerContact")}
              className={inputClassName()}
              name="ownerEmail"
              onChange={(event) =>
                onFieldChange("ownerContact", event.target.value)
              }
              placeholder="owner@example.com"
              ref={registerField("ownerContact")}
              required
              type="email"
              value={formValues.ownerContact}
            />
            <FieldError
              field="ownerContact"
              id={fieldErrorId("ownerContact")}
              message={fieldMessage("ownerContact")}
            />
          </label>
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            {t(
              "This records a pending owner setup. Email delivery is not active yet.",
            )}
          </p>
        </div>
      ) : null}
    </fieldset>
  );
}

function ReasonField({
  fieldErrorId,
  fieldHasError,
  fieldMessage,
  formValues,
  onFieldChange,
  registerField,
  t,
}: FieldErrorHelpers & {
  formValues: PlatformShopProvisioningFormValues;
  onFieldChange: (
    field: keyof PlatformShopProvisioningFormValues,
    value: string,
  ) => void;
  t: PlatformProvisioningT;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-800">
      <span>{t("Reason")}</span>
      <textarea
        aria-describedby={fieldErrorId("reason")}
        aria-invalid={fieldHasError("reason")}
        className="min-h-20 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
        name="reason"
        onChange={(event) => onFieldChange("reason", event.target.value)}
        placeholder={t("Why this provisioning action is approved")}
        ref={registerField("reason")}
        required
        rows={3}
        value={formValues.reason}
      />
      <FieldError
        field="reason"
        id={fieldErrorId("reason")}
        message={fieldMessage("reason")}
      />
    </label>
  );
}

export function ShopProvisioningForms({
  labels = defaultPlatformProvisioningLabels,
  ownerProfiles,
}: ShopProvisioningFormsProps) {
  const t = useMemo(
    () => createPlatformProvisioningTranslator(labels),
    [labels],
  );
  const fieldRefs = useRef<Partial<Record<string, RegisteredField>>>({});
  const createShopPendingRef = useRef(false);
  const [formValues, setFormValues] =
    useState<PlatformShopProvisioningFormValues>(emptyFormValues);
  const [clientFieldErrors, setClientFieldErrors] = useState<FieldErrorMap>({});
  const [state, setState] =
    useState<PlatformShopProvisioningState>(initialState);
  const [createShopPending, setCreateShopPending] = useState(false);
  const ownerSetupMode = normalizeOwnerSetupMode(formValues.ownerSetupMode);
  const fieldErrors = useMemo(
    () => ({
      ...(state.fieldErrors ?? {}),
      ...clientFieldErrors,
    }),
    [clientFieldErrors, state.fieldErrors],
  );

  const focusFirstInvalidField = useCallback((errors: FieldErrorMap) => {
    const errorFields = new Set(Object.keys(errors));

    for (const field of invalidFieldFocusOrder) {
      if (!errorFields.has(field)) {
        continue;
      }

      fieldRefs.current[field]?.focus({ preventScroll: false });
      return;
    }
  }, []);

  useEffect(() => {
    if (state.values) {
      let cancelled = false;

      queueMicrotask(() => {
        if (!cancelled) {
          setFormValues(state.values ?? emptyFormValues);
          setClientFieldErrors({});
        }
      });

      return () => {
        cancelled = true;
      };
    }

    return undefined;
  }, [state.values]);

  useEffect(() => {
    if (!state.ok && state.fieldErrors) {
      focusFirstInvalidField(state.fieldErrors);
    }
  }, [focusFirstInvalidField, state.fieldErrors, state.ok]);

  function fieldErrorId(field: string) {
    return `platform-provisioning-${field}-error`;
  }

  function fieldHasError(field: string) {
    return Boolean(fieldErrors[field]);
  }

  function fieldMessage(field: string) {
    const message = fieldErrors[field];

    return message ? t(message) : undefined;
  }

  function registerField(field: string) {
    return (element: RegisteredField | null) => {
      if (element) {
        fieldRefs.current[field] = element;
      } else {
        delete fieldRefs.current[field];
      }
    };
  }

  function clearClientFieldError(field: string) {
    setClientFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];

      return next;
    });
  }

  function setClientFieldError(field: string, message: string | undefined) {
    setClientFieldErrors((current) => {
      const next = { ...current };

      if (message) {
        next[field] = message;
      } else {
        delete next[field];
      }

      return next;
    });
  }

  function updateFormValue<K extends keyof PlatformShopProvisioningFormValues>(
    field: K,
    value: PlatformShopProvisioningFormValues[K],
  ) {
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }));
    clearClientFieldError(String(field));
  }

  function handleCompanyRutChange(value: string) {
    setFormValues((current) => ({
      ...current,
      companyRut: value,
      shopCode: current.useCompanyRutAsShopCode
        ? shopCodeFromCompanyRut(value)
        : current.shopCode,
    }));
    clearClientFieldError("companyRut");
  }

  function handleCompanyRutBlur() {
    const formattedRut = formatRutForFiscalDisplay(formValues.companyRut);

    setFormValues((current) => ({
      ...current,
      companyRut: formattedRut,
      shopCode: current.useCompanyRutAsShopCode
        ? shopCodeFromCompanyRut(formattedRut)
        : current.shopCode,
    }));
    setClientFieldError("companyRut", validateRutFormat(formattedRut));
  }

  function handleLegalRepresentativeRutBlur() {
    const formattedRut = formatRutForDisplay(formValues.legalRepresentativeRut);

    setFormValues((current) => ({
      ...current,
      legalRepresentativeRut: formattedRut,
    }));
    setClientFieldError(
      "legalRepresentativeRut",
      validateRutFormat(formattedRut),
    );
  }

  function handleShopNameBlur() {
    setFormValues((current) => ({
      ...current,
      shopName: normalizeShopNameForInput(current.shopName),
    }));
  }

  function handleUseCompanyRutAsShopCodeChange(checked: boolean) {
    setFormValues((current) => ({
      ...current,
      shopCode: checked ? shopCodeFromCompanyRut(current.companyRut) : current.shopCode,
      useCompanyRutAsShopCode: checked,
    }));
  }

  function handleOwnerSetupModeChange(mode: OwnerSetupMode) {
    setFormValues((current) => ({
      ...current,
      ownerContact: mode === "pending-email" ? current.ownerContact : "",
      ownerProfileId: mode === "existing-owner" ? current.ownerProfileId : "",
      ownerSetupMode: mode,
    }));
    clearClientFieldError("ownerSetupMode");
  }

  async function handleCreateShop() {
    if (createShopPendingRef.current) {
      return;
    }

    createShopPendingRef.current = true;
    setCreateShopPending(true);

    try {
      const payload = new FormData();

      payload.set("businessAddress", formValues.businessAddress);
      payload.set("businessCity", formValues.businessCity);
      payload.set("businessGiro", formValues.businessGiro);
      payload.set("companyRut", formValues.companyRut);
      payload.set("legalRepresentativeRut", formValues.legalRepresentativeRut);
      payload.set("ownerEmail", formValues.ownerContact);
      payload.set("ownerProfileId", formValues.ownerProfileId);
      payload.set("ownerSetupMode", formValues.ownerSetupMode);
      payload.set("reason", formValues.reason);
      payload.set("shopCode", formValues.shopCode);
      payload.set("shopName", formValues.shopName);
      payload.set(
        "useCompanyRutAsShopCode",
        formValues.useCompanyRutAsShopCode ? "true" : "false",
      );

      const response = await submitPlatformProvisioningForm(
        "/platform/provisioning/create-shop",
        payload,
      );

      if (!response.ok) {
        setState(requestFailedState);
        return;
      }

      setState((await response.json()) as PlatformShopProvisioningState);
    } catch {
      setState(requestFailedState);
    } finally {
      createShopPendingRef.current = false;
      setCreateShopPending(false);
    }
  }

  return (
    <section className="grid gap-4 rounded-md border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">
          {t("Create shop")}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {t(
            "Create the shop, fiscal identity, initial manager access, and optional owner setup.",
          )}
        </p>
      </div>

      <ProvisioningResultBanner state={state} t={t} />

      <div className="grid gap-4">
        <ShopIdentityFields
          fieldErrorId={fieldErrorId}
          fieldHasError={fieldHasError}
          fieldMessage={fieldMessage}
          formValues={formValues}
          onCompanyRutBlur={handleCompanyRutBlur}
          onCompanyRutChange={handleCompanyRutChange}
          onShopNameBlur={handleShopNameBlur}
          onShopNameChange={(value) => updateFormValue("shopName", value)}
          onShopCodeChange={(value) =>
            updateFormValue("shopCode", normalizeShopCode(value))
          }
          onUseCompanyRutAsShopCodeChange={handleUseCompanyRutAsShopCodeChange}
          registerField={registerField}
          t={t}
        />
        <FiscalIdentityFields
          fieldErrorId={fieldErrorId}
          fieldHasError={fieldHasError}
          fieldMessage={fieldMessage}
          formValues={formValues}
          onFieldChange={updateFormValue}
          onLegalRepresentativeRutBlur={handleLegalRepresentativeRutBlur}
          registerField={registerField}
          t={t}
        />
        <InitialManagerSummary t={t} />
        <OwnerSetupFields
          fieldErrorId={fieldErrorId}
          fieldHasError={fieldHasError}
          fieldMessage={fieldMessage}
          formValues={formValues}
          onChange={handleOwnerSetupModeChange}
          onFieldChange={updateFormValue}
          onOwnerProfileSelect={(profileId) =>
            updateFormValue("ownerProfileId", profileId)
          }
          ownerProfiles={ownerProfiles}
          registerField={registerField}
          t={t}
        />
        <ReasonField
          fieldErrorId={fieldErrorId}
          fieldHasError={fieldHasError}
          fieldMessage={fieldMessage}
          formValues={formValues}
          onFieldChange={updateFormValue}
          registerField={registerField}
          t={t}
        />
        <div className="flex justify-end border-t border-slate-200 pt-4">
          <button
            className={submitClassName()}
            disabled={createShopPending}
            onClick={handleCreateShop}
            type="button"
          >
            {createShopPending
              ? t(pendingLabelByMode[ownerSetupMode])
              : t(submitLabelByMode[ownerSetupMode])}
          </button>
        </div>
      </div>
    </section>
  );
}
