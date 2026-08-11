"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { transitionAdminOrderAction } from "./actions";

type AdminOrderTransitionOperation =
  | "accept"
  | "cancel"
  | "complete"
  | "out_for_delivery"
  | "preparing"
  | "ready"
  | "reject";

export type OrderTransitionOption = {
  label: string;
  operation: AdminOrderTransitionOperation;
  tone: "danger" | "primary" | "secondary";
};

const reasonOptions = [
  ["customer_request", "Richiesta del cliente"],
  ["item_unavailable", "Articolo non disponibile"],
  ["shop_closed", "Negozio chiuso"],
  ["capacity_unavailable", "Capacità non disponibile"],
  ["delivery_unavailable", "Consegna non disponibile"],
  ["payment_unavailable", "Pagamento non disponibile"],
  ["operational_error", "Errore operativo"],
  ["other", "Altro motivo operativo"],
] as const;

function SubmitButton({ tone }: { tone: OrderTransitionOption["tone"] }) {
  const { pending } = useFormStatus();
  const toneClass =
    tone === "danger"
      ? "bg-red-700 text-white hover:bg-red-800"
      : tone === "primary"
        ? "bg-zinc-950 text-white hover:bg-zinc-800"
        : "border border-zinc-300 bg-white text-zinc-900 hover:border-emerald-500";
  return (
    <button
      className={`inline-flex min-h-12 items-center justify-center rounded-lg px-4 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${toneClass}`}
      disabled={pending}
      type="submit"
    >
      {pending ? "Aggiornamento…" : "Conferma transizione"}
    </button>
  );
}

export function OrderTransitionPanel({
  correlationId,
  expectedStatusVersion,
  idempotencyKey,
  options,
  orderId,
  returnTo,
  shopId,
}: {
  correlationId: string;
  expectedStatusVersion: number;
  idempotencyKey: string;
  options: readonly OrderTransitionOption[];
  orderId: string;
  returnTo: string;
  shopId: string;
}) {
  const [operation, setOperation] = useState<AdminOrderTransitionOperation>(
    options[0]?.operation ?? "accept",
  );
  const selected = options.find((option) => option.operation === operation);
  const reasonRequired = operation === "reject" || operation === "cancel";

  if (options.length === 0) {
    return (
      <p className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
        Questo ordine è terminale: non sono disponibili altre transizioni.
      </p>
    );
  }

  return (
    <form
      action={transitionAdminOrderAction}
      className="grid gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4"
    >
      <input name="correlation_id" type="hidden" value={correlationId} />
      <input
        name="expected_status_version"
        type="hidden"
        value={expectedStatusVersion}
      />
      <input name="idempotency_key" type="hidden" value={idempotencyKey} />
      <input name="order_id" type="hidden" value={orderId} />
      <input name="return_to" type="hidden" value={returnTo} />
      <input name="shop_id" type="hidden" value={shopId} />

      <label className="grid gap-1.5 text-sm font-semibold text-zinc-900">
        Prossima azione
        <select
          className="h-12 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
          name="operation"
          onChange={(event) =>
            setOperation(event.target.value as AdminOrderTransitionOperation)
          }
          value={operation}
        >
          {options.map((option) => (
            <option key={option.operation} value={option.operation}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {reasonRequired ? (
        <label className="grid gap-1.5 text-sm font-semibold text-zinc-900">
          Motivo obbligatorio
          <select
            className="h-12 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
            defaultValue=""
            name="reason_code"
            required
          >
            <option disabled value="">
              Seleziona un motivo
            </option>
            {reasonOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="flex min-h-12 items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3 text-sm leading-5 text-zinc-700">
        <input
          className="mt-0.5 size-5 accent-emerald-700"
          name="confirmed"
          required
          type="checkbox"
          value="yes"
        />
        <span>
          Confermo di aver verificato stato, versione e fulfillment dell’ordine.
          L’operazione sarà registrata nell’audit.
        </span>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-zinc-500">
          Versione attesa {expectedStatusVersion}. Retry e doppio invio sono
          idempotenti.
        </p>
        <SubmitButton tone={selected?.tone ?? "secondary"} />
      </div>
    </form>
  );
}
