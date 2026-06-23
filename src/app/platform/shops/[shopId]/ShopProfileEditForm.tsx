"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent, MouseEvent } from "react";
import { useCallback, useId, useState } from "react";
import { useModalFocusTrap } from "@/app/shop/_components/useModalFocusTrap";
import type {
  PlatformShopProfileFormValues,
  PlatformShopProfileUpdateState,
} from "./profile/updateFormSubmit";

type ShopProfileEditFormProps = {
  endpoint: string;
  initialValues: PlatformShopProfileFormValues;
};

const emptyState: PlatformShopProfileUpdateState = {
  code: "success",
  message: "Ready to update shop profile.",
  ok: true,
};

const requestFailedState: PlatformShopProfileUpdateState = {
  code: "db_failure",
  formError: "The controlled profile update request failed.",
  message: "The controlled database action failed without exposing internal details.",
  ok: false,
};

const fieldClassName =
  "h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none focus:border-slate-950 focus-visible:ring-2 focus-visible:ring-slate-950";
const labelClassName = "grid min-w-0 gap-1 text-sm font-semibold text-slate-800";

function normalizeRutInput(raw: string) {
  return raw.trim().replace(/[.\-\s]/g, "").toUpperCase();
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

function resultTone(state: PlatformShopProfileUpdateState) {
  if (state.ok) {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }

  return "border-amber-200 bg-amber-50 text-amber-950";
}

function ResultBanner({ state }: { state: PlatformShopProfileUpdateState }) {
  if (state === emptyState) {
    return null;
  }

  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${resultTone(state)}`}>
      <p className="font-semibold">
        {state.ok ? "Shop profile updated." : "Shop profile update blocked."}
      </p>
      <p className="mt-1">{state.formError ?? state.message}</p>
      {state.auditEventId ? (
        <p className="mt-1 font-mono text-xs">Audit {state.auditEventId}</p>
      ) : null}
    </div>
  );
}

export function ShopProfileEditForm({
  endpoint,
  initialValues,
}: ShopProfileEditFormProps) {
  const router = useRouter();
  const dialogId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const [formValues, setFormValues] = useState(initialValues);
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [state, setState] =
    useState<PlatformShopProfileUpdateState>(emptyState);
  const requestClose = useCallback(() => {
    if (!pending) {
      setDialogOpen(false);
    }
  }, [pending]);
  const dialogRef = useModalFocusTrap<HTMLDivElement>(
    isDialogOpen,
    pending ? undefined : requestClose,
  );

  function updateValue(key: keyof PlatformShopProfileFormValues, value: string) {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleBackdropMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (!pending && event.target === event.currentTarget) {
      requestClose();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending) {
      return;
    }

    setPending(true);

    try {
      const payload = new FormData(event.currentTarget);
      const response = await window.fetch(endpoint, {
        body: payload,
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        setState(requestFailedState);
        return;
      }

      const nextState = (await response.json()) as PlatformShopProfileUpdateState;

      setState(nextState);

      if (nextState.values) {
        setFormValues(nextState.values);
      }

      if (nextState.ok) {
        router.refresh();
      }
    } catch {
      setState(requestFailedState);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        aria-controls={dialogId}
        aria-expanded={isDialogOpen}
        aria-haspopup="dialog"
        aria-label="Edit shop profile and fiscal identity"
        className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-950"
        onClick={() => setDialogOpen(true)}
        type="button"
      >
        Edit
      </button>

      {isDialogOpen ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 px-3 py-4 sm:px-6 sm:py-8"
          onMouseDown={handleBackdropMouseDown}
        >
          <div className="mx-auto flex min-h-full w-full max-w-4xl items-center">
            <div
              aria-describedby={descriptionId}
              aria-labelledby={titleId}
              aria-modal="true"
              className="max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-xl"
              id={dialogId}
              ref={dialogRef}
              role="dialog"
              tabIndex={-1}
            >
              <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <h2
                    className="text-lg font-semibold tracking-normal text-slate-950"
                    id={titleId}
                  >
                    Edit shop profile
                  </h2>
                  <p
                    className="mt-1 text-sm leading-6 text-slate-600"
                    id={descriptionId}
                  >
                    Master Console controls shop identity and fiscal/boleta fields. Changes are audited.
                  </p>
                </div>
                <button
                  aria-label="Close edit shop profile dialog"
                  className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={pending}
                  onClick={requestClose}
                  type="button"
                >
                  Close
                </button>
              </div>

              <div className="grid gap-4 px-4 py-4 sm:px-5 sm:py-5">
                <ResultBanner state={state} />

                <form className="grid gap-4" onSubmit={handleSubmit}>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <label className={labelClassName}>
                      Shop name
                      <input
                        className={fieldClassName}
                        name="shopName"
                        onBlur={() =>
                          updateValue(
                            "shopName",
                            formValues.shopName.trim().toUpperCase(),
                          )
                        }
                        onChange={(event) =>
                          updateValue("shopName", event.target.value)
                        }
                        required
                        type="text"
                        value={formValues.shopName}
                      />
                    </label>
                    <label className={labelClassName}>
                      Company RUT
                      <input
                        className={fieldClassName}
                        name="companyRut"
                        onBlur={() =>
                          updateValue(
                            "companyRut",
                            formatRutForDisplay(formValues.companyRut),
                          )
                        }
                        onChange={(event) =>
                          updateValue("companyRut", event.target.value)
                        }
                        required
                        type="text"
                        value={formValues.companyRut}
                      />
                    </label>
                    <label className={labelClassName}>
                      Giro
                      <input
                        className={fieldClassName}
                        name="businessGiro"
                        onChange={(event) =>
                          updateValue("businessGiro", event.target.value)
                        }
                        required
                        type="text"
                        value={formValues.businessGiro}
                      />
                    </label>
                    <label className={labelClassName}>
                      Address
                      <input
                        className={fieldClassName}
                        name="businessAddress"
                        onChange={(event) =>
                          updateValue("businessAddress", event.target.value)
                        }
                        required
                        type="text"
                        value={formValues.businessAddress}
                      />
                    </label>
                    <label className={labelClassName}>
                      City
                      <input
                        className={fieldClassName}
                        name="businessCity"
                        onChange={(event) =>
                          updateValue("businessCity", event.target.value)
                        }
                        required
                        type="text"
                        value={formValues.businessCity}
                      />
                    </label>
                    <label className={labelClassName}>
                      Legal representative RUT
                      <input
                        className={fieldClassName}
                        name="legalRepresentativeRut"
                        onBlur={() =>
                          updateValue(
                            "legalRepresentativeRut",
                            formatRutForDisplay(
                              formValues.legalRepresentativeRut,
                            ),
                          )
                        }
                        onChange={(event) =>
                          updateValue(
                            "legalRepresentativeRut",
                            event.target.value,
                          )
                        }
                        required
                        type="text"
                        value={formValues.legalRepresentativeRut}
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
                    <label className={labelClassName}>
                      Reason
                      <input
                        className={fieldClassName}
                        maxLength={240}
                        name="reason"
                        onChange={(event) =>
                          updateValue("reason", event.target.value)
                        }
                        placeholder="Why this profile update is approved"
                        required
                        type="text"
                        value={formValues.reason}
                      />
                    </label>
                    <label className={labelClassName}>
                      Type UPDATE SHOP PROFILE as confirmation
                      <input
                        className={fieldClassName}
                        name="confirmation"
                        onChange={(event) =>
                          updateValue("confirmation", event.target.value)
                        }
                        required
                        type="text"
                        value={formValues.confirmation}
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <p>
                      Shop code, lifecycle, owner/member changes, staff credentials,
                      device state and catalog changes stay outside this form.
                    </p>
                    <Link
                      className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-950"
                      href="/platform/operations"
                    >
                      Controlled Operations
                    </Link>
                  </div>

                  <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
                    <button
                      className="inline-flex h-10 w-full items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 sm:w-fit"
                      disabled={pending}
                      onClick={requestClose}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="inline-flex h-10 w-full items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit"
                      disabled={pending}
                      type="submit"
                    >
                      {pending ? "Updating..." : "Update shop profile"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
