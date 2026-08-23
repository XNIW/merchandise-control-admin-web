import Link from "next/link";
import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";
import { createLocalizedPageMetadata } from "@/i18n/metadata";
import {
  getReviewQueueReadModel,
  reviewStatuses,
  type ReviewStatus,
} from "@/server/shop-admin/customer-commerce-read-model";
import { moderateReviewAction } from "./actions";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return createLocalizedPageMetadata("Verified reviews");
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
function param(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

const statusLabels: Record<ReviewStatus, string> = {
  pending: "In attesa",
  published: "Pubblicate",
  rejected: "Rifiutate",
  withdrawn: "Ritirate",
};

export default async function ReviewsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const shopId = param(params, "shop") ?? param(params, "shop_id");
  const rawStatus = param(params, "status");
  const status = reviewStatuses.includes(rawStatus as ReviewStatus)
    ? (rawStatus as ReviewStatus)
    : "pending";
  const model = await getReviewQueueReadModel({ requestedShopId: shopId, status });

  return (
    <div className="grid gap-5 pb-8" data-admin-reviews-page>
      <header className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-2`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Storefront · Moderazione</p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">Recensioni verificate</h1>
        <p className="max-w-3xl text-sm leading-6 text-zinc-600">Solo acquisti completati e owner-scoped entrano nella coda. Pubblicazione e aggregati sono server-authoritative; non sono previste immagini o risposte del venditore.</p>
      </header>
      <ActionResultBanner action={param(params, "action")} result={param(params, "result")} />
      <nav aria-label="Filtri recensioni" className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} flex gap-2 overflow-x-auto pb-1`}>
        {reviewStatuses.map((value) => {
          const query = new URLSearchParams({ status: value });
          if (shopId) query.set("shop", shopId);
          return <Link aria-current={status === value ? "page" : undefined} className={`inline-flex min-h-12 shrink-0 items-center rounded-full border px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${status === value ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-zinc-300 bg-white text-zinc-700"}`} href={`/shop/reviews?${query.toString()}`} key={value}>{statusLabels[value]}</Link>;
        })}
      </nav>
      <section aria-live="polite" className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-4`}>
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-zinc-950">{statusLabels[status]}</h2><span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">{model.total} recensioni</span></div>
        {model.status !== "ready" ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{model.reason}</p> : model.rows.length === 0 ? <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-600">Nessuna recensione in questa coda.</p> : model.rows.map((row) => (
          <article className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" key={row.reviewId}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-zinc-950">{row.productName}</h3><p className="mt-1 text-sm text-amber-700" aria-label={`${row.rating} stelle su 5`}>{"★".repeat(row.rating)}{"☆".repeat(5 - row.rating)}</p></div><span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">{statusLabels[row.status]}</span></div>
            <p className="text-sm leading-6 text-zinc-700">{row.comment ?? "Nessun commento."}</p>
            <p className="font-mono text-xs text-zinc-500">Ordine {row.orderId.slice(0, 8)} · Prodotto {row.publicationId.slice(0, 8)}</p>
            {row.reason ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">Motivo: {row.reason}</p> : null}
            {model.canManage && row.status !== "withdrawn" ? (
              <div className="grid gap-3 border-t border-zinc-100 pt-4 sm:grid-cols-2">
                {row.status !== "published" ? <form action={moderateReviewAction} className="grid gap-2">
                  <input name="review_id" type="hidden" value={row.reviewId} /><input name="expected_version" type="hidden" value={row.version} /><input name="target_status" type="hidden" value="published" /><input name="confirmed" type="hidden" value="yes" />{model.selectedShopId ? <input name="shop_id" type="hidden" value={model.selectedShopId} /> : null}
                  <button className="min-h-12 rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2" type="submit">Pubblica</button>
                </form> : null}
                {row.status !== "rejected" ? <form action={moderateReviewAction} className="grid gap-2">
                  <input name="review_id" type="hidden" value={row.reviewId} /><input name="expected_version" type="hidden" value={row.version} /><input name="target_status" type="hidden" value="rejected" /><input name="confirmed" type="hidden" value="yes" />{model.selectedShopId ? <input name="shop_id" type="hidden" value={model.selectedShopId} /> : null}
                  <label className="grid gap-1 text-xs font-medium text-zinc-700">Motivo rifiuto<input className="min-h-12 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" maxLength={240} name="reason" required /></label>
                  <button className="min-h-12 rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold text-red-800 outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2" type="submit">Rifiuta</button>
                </form> : null}
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}
