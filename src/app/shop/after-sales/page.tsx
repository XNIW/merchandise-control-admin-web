import Link from "next/link";
import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";
import { createLocalizedPageMetadata } from "@/i18n/metadata";
import {
  afterSalesStatuses,
  getAfterSalesReadModel,
  type AfterSalesRow,
  type AfterSalesStatus,
} from "@/server/shop-admin/customer-commerce-read-model";
import {
  transitionAfterSalesAction,
  viewAfterSalesEvidenceAction,
} from "./actions";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return createLocalizedPageMetadata("After-sales");
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function param(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

const labels: Record<AfterSalesStatus, string> = {
  approved: "Approvato",
  closed: "Chiuso",
  received: "Reso ricevuto",
  refundPending: "Rimborso in attesa",
  refunded: "Rimborsato",
  rejected: "Rifiutato",
  returnRequired: "Reso richiesto",
  reviewing: "In revisione",
  submitted: "Nuovo",
};

const tabs: readonly [string, string][] = [
  ["submitted", "Nuovi"],
  ["reviewing", "In revisione"],
  ["approved", "Approvati"],
  ["rejected", "Rifiutati"],
  ["refundPending", "Rimborso"],
  ["closed", "Chiusi"],
];

function transitions(row: AfterSalesRow): readonly [string, string][] {
  const refundAvailable = ["collected", "refund_pending", "refund_failed", "refunded"]
    .includes(row.paymentStatus ?? "");
  const refundTransition: [string, string][] = refundAvailable
    ? [["refundPending", "Avvia rimborso"]]
    : [];
  if (row.status === "submitted") return [["reviewing", "Prendi in carico"], ["rejected", "Rifiuta"], ["closed", "Chiudi"]];
  if (row.status === "reviewing") return [["approved", "Approva"], ["returnRequired", "Richiedi reso"], ...refundTransition, ["rejected", "Rifiuta"], ["closed", "Chiudi"]];
  if (row.status === "approved") return [["returnRequired", "Richiedi reso"], ...refundTransition, ["closed", "Chiudi"]];
  if (row.status === "returnRequired") return [["received", "Segna ricevuto"], ["closed", "Chiudi"]];
  if (row.status === "received") return [...refundTransition, ["closed", "Chiudi"]];
  return [];
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("it", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(new Date(value));
}

export default async function AfterSalesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const shopId = param(params, "shop") ?? param(params, "shop_id");
  const rawStatus = param(params, "status");
  const status = afterSalesStatuses.includes(rawStatus as AfterSalesStatus)
    ? (rawStatus as AfterSalesStatus)
    : "submitted";
  const model = await getAfterSalesReadModel({ requestedShopId: shopId, status });

  return (
    <div className="grid gap-5 pb-8" data-admin-after-sales-page>
      <header className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-2`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Commerce · Assistenza</p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">Post-vendita</h1>
        <p className="max-w-3xl text-sm leading-6 text-zinc-600">
          Coda shop-scoped per problemi ordine, resi e richieste rimborso. Lo stato “Rimborsato” può arrivare soltanto dall’aggregate pagamento dopo ACK provider o attestazione manuale autorizzata.
        </p>
      </header>

      <ActionResultBanner action={param(params, "action")} result={param(params, "result")} />

      <nav aria-label="Filtri post-vendita" className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} flex gap-2 overflow-x-auto pb-1`}>
        {tabs.map(([value, label]) => {
          const href = new URLSearchParams({ status: value });
          if (shopId) href.set("shop", shopId);
          return (
            <Link
              aria-current={status === value ? "page" : undefined}
              className={`inline-flex min-h-12 shrink-0 items-center rounded-full border px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${status === value ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-zinc-300 bg-white text-zinc-700"}`}
              href={`/shop/after-sales?${href.toString()}`}
              key={value}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <section aria-live="polite" className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-4`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-950">{labels[status]}</h2>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">{model.total} casi</span>
        </div>
        {model.status !== "ready" ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status">{model.reason}</p>
        ) : model.rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-600">Nessun caso in questa coda.</p>
        ) : (
          model.rows.map((row) => (
            <article className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" key={row.caseId}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-zinc-500">{row.caseCode} · {row.orderCode}</p>
                  <h3 className="mt-1 text-lg font-semibold text-zinc-950">{row.customerDisplay}</h3>
                  <p className="text-sm text-zinc-600">{row.type} · {row.reason} · {dateTime(row.submittedAt)}</p>
                </div>
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900">{labels[row.status]}</span>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-xs uppercase tracking-wide text-zinc-500">Righe</dt><dd className="mt-1 text-zinc-900">{row.lines.map((line) => `${line.quantity}× ${line.name}`).join(" · ")}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-zinc-500">Pagamento</dt><dd className="mt-1 text-zinc-900">{row.paymentMethod ?? "—"} · {row.paymentStatus ?? "—"}</dd></div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Prove private</dt>
                  <dd className="mt-1 flex flex-wrap gap-2 text-zinc-900">
                    {row.evidence.length === 0 ? "Nessuna" : row.evidence.map((item, index) => item.status === "safe" ? (
                      <form action={viewAfterSalesEvidenceAction} key={item.id}>
                        <input name="evidence_id" type="hidden" value={item.id} />
                        {model.selectedShopId ? <input name="shop_id" type="hidden" value={model.selectedShopId} /> : null}
                        <button className="inline-flex min-h-12 items-center rounded-lg border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" type="submit">Visualizza prova {index + 1}</button>
                      </form>
                    ) : <span className="inline-flex min-h-12 items-center rounded-lg bg-zinc-100 px-3 text-xs" key={item.id}>Prova {index + 1}: {item.status}</span>)}
                  </dd>
                </div>
              </dl>
              {row.note ? <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700">{row.note}</p> : null}
              <ol className="flex flex-wrap gap-2 text-xs text-zinc-600" aria-label="Timeline caso">
                {row.timeline.map((event, index) => <li className="rounded-full bg-zinc-100 px-3 py-1" key={`${event.createdAt}-${index}`}>{event.status} · {event.actorKind}</li>)}
              </ol>
              {model.canManage && transitions(row).length > 0 ? (
                <div className="grid gap-3 border-t border-zinc-100 pt-4">
                  <p className="text-xs text-zinc-500">Ogni azione è version-bound e auditata. Una richiesta COD/ritiro non riscossa non può diventare rimborso.</p>
                  <div className="flex flex-wrap gap-2">
                    {transitions(row).map(([target, label]) => (
                      <form action={transitionAfterSalesAction} className="flex items-center gap-2" key={target}>
                        <input name="case_id" type="hidden" value={row.caseId} />
                        <input name="expected_version" type="hidden" value={row.version} />
                        <input name="target_status" type="hidden" value={target} />
                        <input name="note_key" type="hidden" value={`afterSales.admin.${target}`} />
                        <input name="confirmed" type="hidden" value="yes" />
                        {model.selectedShopId ? <input name="shop_id" type="hidden" value={model.selectedShopId} /> : null}
                        <button className="inline-flex min-h-12 items-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 outline-none hover:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-700" type="submit">{label}</button>
                      </form>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
