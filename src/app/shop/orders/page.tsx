import { randomUUID } from "node:crypto";
import Link from "next/link";
import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";
import type { Json } from "@/lib/supabase/database.types";
import { createLocalizedPageMetadata } from "@/i18n/metadata";
import {
  getAdminOrdersReadModel,
  type AdminOrderFulfillmentMode,
  type AdminOrderStatus,
} from "@/server/shop-admin/order-read-model";
import {
  OrderTransitionPanel,
  type OrderTransitionOption,
} from "./OrderTransitionPanel";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return createLocalizedPageMetadata("Customer orders");
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const fieldClassName =
  "h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15";
const secondaryButtonClassName =
  "inline-flex min-h-12 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 outline-none transition hover:border-emerald-500 hover:text-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2";

function param(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function dateParam(value: string | undefined, end = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function buildHref(
  params: Record<string, string | string[] | undefined>,
  changes: Record<string, string | number | null | undefined>,
) {
  const next = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && key !== "action" && key !== "result") next.set(key, value);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined || value === "") next.delete(key);
    else next.set(key, String(value));
  }
  const query = next.toString();
  return query ? `/shop/orders?${query}` : "/shop/orders";
}

function clp(value: number) {
  return new Intl.NumberFormat("es-CL", {
    currency: "CLP",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(new Date(value));
}

const statusLabels: Record<AdminOrderStatus, string> = {
  accepted: "Accettato",
  cancelled: "Annullato",
  completed: "Completato",
  confirmed: "Confermato",
  out_for_delivery: "In consegna",
  preparing: "In preparazione",
  ready: "Pronto",
  rejected: "Rifiutato",
};

function statusTone(status: AdminOrderStatus) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "rejected" || status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-800";
  }
  if (status === "confirmed") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-sky-200 bg-sky-50 text-sky-800";
}

function StatusChip({ status }: { status: AdminOrderStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(status)}`}
    >
      {statusLabels[status]}
    </span>
  );
}

function modeLabel(mode: AdminOrderFulfillmentMode) {
  return {
    delivery: "Consegna",
    pickup: "Ritiro",
    reservation: "Prenotazione",
  }[mode];
}

function transitionOptions(
  status: AdminOrderStatus,
  mode: AdminOrderFulfillmentMode,
): readonly OrderTransitionOption[] {
  if (status === "confirmed") {
    return [
      { label: "Accetta ordine", operation: "accept", tone: "primary" },
      { label: "Rifiuta ordine", operation: "reject", tone: "danger" },
      { label: "Annulla ordine", operation: "cancel", tone: "danger" },
    ];
  }
  if (status === "accepted") {
    return [
      { label: "Avvia preparazione", operation: "preparing", tone: "primary" },
      { label: "Annulla ordine", operation: "cancel", tone: "danger" },
    ];
  }
  if (status === "preparing") {
    return [
      { label: "Segna come pronto", operation: "ready", tone: "primary" },
      { label: "Annulla ordine", operation: "cancel", tone: "danger" },
    ];
  }
  if (status === "ready") {
    return [
      mode === "delivery"
        ? {
            label: "Avvia consegna",
            operation: "out_for_delivery",
            tone: "primary",
          }
        : {
            label: "Completa ordine",
            operation: "complete",
            tone: "primary",
          },
      { label: "Annulla ordine", operation: "cancel", tone: "danger" },
    ];
  }
  if (status === "out_for_delivery") {
    return [
      { label: "Completa consegna", operation: "complete", tone: "primary" },
      { label: "Annulla ordine", operation: "cancel", tone: "danger" },
    ];
  }
  return [];
}

function jsonRecord(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : {};
}

function text(value: Json | undefined) {
  return typeof value === "string" && value.trim() ? value : null;
}

function FulfillmentCard({ fulfillment }: { fulfillment: Json }) {
  const root = jsonRecord(fulfillment);
  const address = jsonRecord(root.address ?? null);
  const pickup = jsonRecord(root.pickupPoint ?? null);
  const zone = jsonRecord(root.deliveryZone ?? null);
  const slot = jsonRecord(root.slot ?? null);
  const addressLines = [
    text(address.addressLine1),
    text(address.addressLine2),
    [text(address.commune), text(address.region)].filter(Boolean).join(", "),
    text(address.postalCode),
  ].filter(Boolean);
  const pickupLines = [
    text(pickup.addressLine1),
    text(pickup.addressLine2),
    [text(pickup.commune), text(pickup.region)].filter(Boolean).join(", "),
  ].filter(Boolean);
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-zinc-950">Fulfillment confermato</h3>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        {text(address.recipientName) ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Destinatario</dt>
            <dd className="mt-1 font-medium text-zinc-900">{text(address.recipientName)}</dd>
          </div>
        ) : null}
        {addressLines.length > 0 ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Indirizzo</dt>
            <dd className="mt-1 text-zinc-800">{addressLines.join(" · ")}</dd>
          </div>
        ) : null}
        {text(pickup.name) ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Punto di ritiro</dt>
            <dd className="mt-1 text-zinc-800">
              {[text(pickup.name), ...pickupLines].filter(Boolean).join(" · ")}
            </dd>
          </div>
        ) : null}
        {text(zone.name) ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Zona</dt>
            <dd className="mt-1 text-zinc-800">
              {[text(zone.name), text(zone.region)].filter(Boolean).join(" · ")}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Fascia</dt>
          <dd className="mt-1 text-zinc-800">
            {[text(slot.label), text(slot.startsAt), text(slot.endsAt)]
              .filter(Boolean)
              .join(" · ") || "Non disponibile"}
          </dd>
        </div>
      </dl>
      {text(address.deliveryInstructions) || text(pickup.instructions) ? (
        <p className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm leading-6 text-zinc-700">
          {text(address.deliveryInstructions) ?? text(pickup.instructions)}
        </p>
      ) : null}
    </section>
  );
}

function Metric({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-zinc-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p>
    </article>
  );
}

export default async function ShopOrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const shopId = param(params, "shop_id");
  const query = param(params, "q");
  const status = param(params, "status");
  const mode = param(params, "mode");
  const placedFrom = dateParam(param(params, "from"));
  const placedTo = dateParam(param(params, "to"), true);
  const orderId = param(params, "order_id");
  const model = await getAdminOrdersReadModel({
    afterId: param(params, "after_id"),
    afterPlacedAt: param(params, "after_placed_at"),
    fulfillmentMode: mode,
    limit: 25,
    orderId,
    placedFrom,
    placedTo,
    query,
    requestedShopId: shopId,
    status,
  });
  const activeCount = ["accepted", "preparing", "ready", "out_for_delivery"]
    .reduce((total, key) => total + (model.statusCounts[key] ?? 0), 0);
  const attentionCount =
    (model.statusCounts.rejected ?? 0) + (model.statusCounts.cancelled ?? 0);
  const selectedOrderId = model.detail?.order.orderId ?? orderId;
  const returnTo = buildHref(params, {});

  return (
    <div className="grid gap-5 pb-8" data-admin-orders-page>
      <header className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-2`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          Commerce · Storefront
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
              Ordini cliente
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600">
              Coda shop-scoped con snapshot immutabili, transizioni idempotenti e
              audit. Un ordine cliente non è una vendita fiscale POS.
            </p>
          </div>
          <Link className={secondaryButtonClassName} href={buildHref(params, {})}>
            Aggiorna coda
          </Link>
        </div>
      </header>

      <ActionResultBanner
        action={param(params, "action")}
        result={param(params, "result")}
      />

      <section
        aria-label="Riepilogo ordini"
        className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-3 sm:grid-cols-2 xl:grid-cols-4`}
      >
        <Metric
          detail="Da accettare o rifiutare"
          label="Nuovi"
          value={String(model.statusCounts.confirmed ?? 0)}
        />
        <Metric
          detail="Accettati, in preparazione, pronti o in consegna"
          label="In lavorazione"
          value={String(activeCount)}
        />
        <Metric
          detail="Conclusi nel dataset corrente"
          label="Completati"
          value={String(model.statusCounts.completed ?? 0)}
        />
        <Metric
          detail="Rifiutati o annullati"
          label="Da monitorare"
          value={String(attentionCount)}
        />
      </section>

      <form
        aria-label="Filtri ordini"
        className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm lg:sticky lg:top-16 lg:z-10 lg:grid-cols-6`}
        method="get"
      >
        {shopId ? <input name="shop_id" type="hidden" value={shopId} /> : null}
        <div className="flex flex-wrap items-center justify-between gap-2 lg:col-span-6">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950">Filtri persistenti</h2>
            <p className="text-xs text-zinc-500">Ricerca, stato, fulfillment e periodo restano nell’URL.</p>
          </div>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700" role="status">
            {model.pagination.totalMatching} risultati
          </span>
        </div>
        <label className="grid gap-1 text-xs font-medium text-zinc-700 lg:col-span-2">
          Cerca
          <input
            className={fieldClassName}
            defaultValue={query}
            maxLength={160}
            name="q"
            placeholder="Codice ordine o prodotto"
            type="search"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Stato
          <select className={fieldClassName} defaultValue={status ?? ""} name="status">
            <option value="">Tutti</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Fulfillment
          <select className={fieldClassName} defaultValue={mode ?? ""} name="mode">
            <option value="">Tutti</option>
            <option value="pickup">Ritiro</option>
            <option value="reservation">Prenotazione</option>
            <option value="delivery">Consegna</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Dal
          <input className={fieldClassName} defaultValue={param(params, "from")} name="from" type="date" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Al
          <input className={fieldClassName} defaultValue={param(params, "to")} name="to" type="date" />
        </label>
        <div className="flex flex-wrap items-end gap-2 lg:col-span-6">
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
            type="submit"
          >
            Applica filtri
          </button>
          <Link
            className={secondaryButtonClassName}
            href={buildHref(params, {
              after_id: null,
              after_placed_at: null,
              from: null,
              mode: null,
              order_id: null,
              q: null,
              status: null,
              to: null,
            })}
          >
            Azzera
          </Link>
        </div>
      </form>

      {model.status !== "ready" ? (
        <section className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950`} role="alert">
          <h2 className="font-semibold">Coda non disponibile</h2>
          <p className="mt-1 text-sm leading-6">{model.reason}</p>
          <Link className={`${secondaryButtonClassName} mt-4`} href={buildHref(params, {})}>
            Riprova
          </Link>
        </section>
      ) : (
        <section className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid min-w-0 gap-4 xl:grid-cols-[minmax(22rem,0.85fr)_minmax(0,1.25fr)] xl:items-start`}>
          <div className="min-w-0 rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4">
              <div>
                <h2 className="font-semibold text-zinc-950">Coda ordini</h2>
                <p className="text-xs text-zinc-500">Più recenti prima · massimo 25 per pagina</p>
              </div>
              <span className="text-xs font-semibold text-zinc-600">{model.rows.length} visibili</span>
            </div>
            {model.rows.length === 0 ? (
              <div className="p-8 text-center">
                <h3 className="font-semibold text-zinc-950">Nessun ordine trovato</h3>
                <p className="mt-1 text-sm text-zinc-600">Modifica i filtri o aggiorna la coda.</p>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-200" aria-label="Risultati ordini">
                {model.rows.map((row) => {
                  const selected = row.orderId === selectedOrderId;
                  return (
                    <li key={row.orderId}>
                      <Link
                        aria-current={selected ? "page" : undefined}
                        className={`block min-h-24 p-4 outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700 ${selected ? "bg-emerald-50" : "hover:bg-zinc-50"}`}
                        href={buildHref(params, {
                          order_id: row.orderId,
                        })}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-mono text-sm font-semibold text-zinc-950">{row.orderCode}</p>
                            <p className="mt-1 text-xs text-zinc-500">{dateTime(row.placedAt)} · {modeLabel(row.fulfillmentMode)}</p>
                          </div>
                          <StatusChip status={row.orderStatus} />
                        </div>
                        <p className="mt-3 line-clamp-2 text-sm leading-5 text-zinc-700">{row.itemSummary}</p>
                        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
                          <span>{row.itemCount} {row.itemCount === 1 ? "articolo" : "articoli"}</span>
                          <strong className="text-sm text-zinc-950">{clp(row.totalClp)}</strong>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 p-4">
              <p className="text-xs text-zinc-500">Paginazione keyset stabile per data e ordine.</p>
              {model.pagination.hasMore && model.pagination.nextId && model.pagination.nextPlacedAt ? (
                <Link
                  className={secondaryButtonClassName}
                  href={buildHref(params, {
                    after_id: model.pagination.nextId,
                    after_placed_at: model.pagination.nextPlacedAt,
                    order_id: null,
                  })}
                >
                  Mostra successivi
                </Link>
              ) : null}
            </div>
          </div>

          <div className="min-w-0 xl:sticky xl:top-48">
            {!model.detail ? (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
                <h2 className="font-semibold text-zinc-950">Seleziona un ordine</h2>
                <p className="mt-1 text-sm leading-6 text-zinc-600">Apri una riga per consultare snapshot, timeline, handoff e azioni disponibili.</p>
              </div>
            ) : (
              <article className="grid min-w-0 gap-4" aria-labelledby="order-detail-title">
                <header className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Dettaglio operativo</p>
                      <h2 className="mt-1 font-mono text-xl font-semibold text-zinc-950" id="order-detail-title">{model.detail.order.orderCode}</h2>
                      <p className="mt-1 text-sm text-zinc-500">{dateTime(model.detail.order.placedAt)} · {modeLabel(model.detail.order.fulfillmentMode)}</p>
                    </div>
                    <StatusChip status={model.detail.order.orderStatus} />
                  </div>
                  <dl className="mt-5 grid gap-3 border-t border-zinc-200 pt-4 sm:grid-cols-3">
                    <div><dt className="text-xs text-zinc-500">Subtotale</dt><dd className="mt-1 font-semibold text-zinc-950">{clp(model.detail.order.subtotalClp)}</dd></div>
                    <div><dt className="text-xs text-zinc-500">Consegna</dt><dd className="mt-1 font-semibold text-zinc-950">{clp(model.detail.order.deliveryFeeClp)}</dd></div>
                    <div><dt className="text-xs text-zinc-500">Totale server</dt><dd className="mt-1 text-lg font-semibold text-zinc-950">{clp(model.detail.order.totalClp)}</dd></div>
                  </dl>
                </header>

                <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                  <div className="border-b border-zinc-200 p-4"><h3 className="text-sm font-semibold text-zinc-950">Articoli confermati</h3></div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[34rem] text-left text-sm">
                      <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                        <tr><th className="px-4 py-3">Prodotto</th><th className="px-4 py-3">Quantità</th><th className="px-4 py-3 text-right">Unitario</th><th className="px-4 py-3 text-right">Totale</th></tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200">
                        {model.detail.items.map((item) => (
                          <tr key={item.linePosition}>
                            <td className="px-4 py-3"><p className="font-medium text-zinc-950">{item.publicName}</p>{item.promotionName ? <p className="mt-1 text-xs text-emerald-700">{item.promotionName}</p> : null}</td>
                            <td className="px-4 py-3 text-zinc-700">{item.quantity}</td>
                            <td className="px-4 py-3 text-right text-zinc-700">{clp(item.unitPriceClp)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-zinc-950">{clp(item.lineTotalClp)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <FulfillmentCard fulfillment={model.detail.order.fulfillment} />

                <section className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-zinc-950">Timeline ordine</h3>
                    <ol className="mt-4 grid gap-3 border-l border-zinc-200 pl-4">
                      {model.detail.timeline.map((event) => (
                        <li className="relative" key={event.eventVersion}>
                          <span className="absolute -left-[1.28rem] top-1 size-2 rounded-full bg-emerald-700" aria-hidden="true" />
                          <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-zinc-950">{statusLabels[event.status]}</strong><span className="text-xs text-zinc-500">v{event.eventVersion}</span></div>
                          <p className="mt-1 text-xs text-zinc-500">{dateTime(event.createdAt)} · {event.actorKind}{event.reasonCode ? ` · ${event.reasonCode}` : ""}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-zinc-950">Handoff</h3>
                    <dl className="mt-4 grid gap-3 text-sm">
                      <div className="rounded-lg bg-zinc-50 p-3"><dt className="text-xs text-zinc-500">POS order outbox</dt><dd className="mt-1 font-semibold text-zinc-950">{model.detail.delivery.pos.status}</dd><dd className="mt-1 text-xs text-zinc-500">{model.detail.delivery.pos.attemptCount} tentativi · vendita fiscale non creata</dd></div>
                      <div className="rounded-lg bg-zinc-50 p-3"><dt className="text-xs text-zinc-500">Push</dt><dd className="mt-1 font-semibold text-zinc-950">{model.detail.delivery.push.status}</dd><dd className="mt-1 text-xs text-zinc-500">Il sender sarà attivato in TASK-031.</dd></div>
                    </dl>
                  </div>
                </section>

                {model.permissions.canManage ? (
                  <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <div className="mb-4"><h3 className="text-sm font-semibold text-zinc-950">Avanza stato</h3><p className="mt-1 text-xs leading-5 text-zinc-500">Il server rivalida ruolo, shop, arco e versione prima del commit atomico.</p></div>
                    <OrderTransitionPanel
                      correlationId={randomUUID()}
                      expectedStatusVersion={model.detail.order.orderVersion}
                      idempotencyKey={randomUUID()}
                      options={transitionOptions(model.detail.order.orderStatus, model.detail.order.fulfillmentMode)}
                      orderId={model.detail.order.orderId}
                      returnTo={returnTo}
                      shopId={model.selectedShopId!}
                    />
                  </section>
                ) : null}

                <details className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <summary className="cursor-pointer text-sm font-semibold text-zinc-950 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">Audit amministrativo ({model.detail.audit.length})</summary>
                  <ol className="mt-4 grid gap-3">
                    {model.detail.audit.length === 0 ? <li className="text-sm text-zinc-500">Nessuna transizione Admin registrata.</li> : model.detail.audit.map((event) => (
                      <li className="rounded-lg bg-zinc-50 p-3 text-sm" key={event.auditId}>
                        <div className="flex flex-wrap justify-between gap-2"><strong className="text-zinc-950">{event.fromStatus ?? "—"} → {event.toStatus ?? "—"}</strong><span className="text-xs text-zinc-500">{dateTime(event.createdAt)}</span></div>
                        <p className="mt-1 text-xs text-zinc-600">{event.actorKind}{event.reasonCode ? ` · ${event.reasonCode}` : ""} · correlation {event.correlationId ?? "non disponibile"}</p>
                      </li>
                    ))}
                  </ol>
                </details>
              </article>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
