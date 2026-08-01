import Link from "next/link";
import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";
import type { Json } from "@/lib/supabase/database.types";
import { createLocalizedPageMetadata } from "@/i18n/metadata";
import {
  getStorefrontPublicationsReadModel,
  type StorefrontPublicationRow,
  type StorefrontPublicationsReadModel,
} from "@/server/shop-admin/storefront-read-model";
import {
  bulkPauseStorefrontAction,
  bulkPublishStorefrontAction,
  saveStorefrontPublicationAction,
} from "./actions";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return createLocalizedPageMetadata("Storefront");
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const areas = [
  ["catalog", "Catalogo"],
  ["categories", "Categorie pubbliche"],
  ["promotions", "Promozioni"],
  ["images", "Immagini pubbliche"],
  ["preview", "Anteprima"],
  ["settings", "Impostazioni"],
  ["audit", "Audit"],
] as const;

type StorefrontArea = (typeof areas)[number][0];

const fieldClassName =
  "h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15";
const buttonClassName =
  "inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300";
const secondaryButtonClassName =
  "inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-400";

function param(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function integerParam(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanParam(value: string | undefined) {
  return value === "yes" ? true : value === "no" ? false : null;
}

function areaParam(value: string | undefined): StorefrontArea {
  return areas.some(([area]) => area === value)
    ? (value as StorefrontArea)
    : "catalog";
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
  return query ? `/shop/storefront?${query}` : "/shop/storefront";
}

function clp(value: number | null) {
  return value === null
    ? "—"
    : new Intl.NumberFormat("es-CL", {
        currency: "CLP",
        maximumFractionDigits: 0,
        style: "currency",
      }).format(value);
}

function statusTone(status: string) {
  if (status === "published") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "paused" || status === "ended") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-zinc-200 bg-zinc-100 text-zinc-700";
}

function Metric({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <article className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-zinc-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p>
    </article>
  );
}

function Filters({ params }: { params: Record<string, string | string[] | undefined> }) {
  const shopId = param(params, "shop_id");
  return (
    <form className="grid gap-3 rounded-md border border-zinc-200 bg-white p-4 shadow-sm lg:grid-cols-7" method="get">
      {shopId ? <input name="shop_id" type="hidden" value={shopId} /> : null}
      <label className="grid gap-1 text-xs font-medium text-zinc-700 lg:col-span-2">
        Cerca
        <input className={fieldClassName} defaultValue={param(params, "q")} maxLength={160} name="q" placeholder="Nome, barcode, marca o categoria" />
      </label>
      <label className="grid gap-1 text-xs font-medium text-zinc-700">
        Stato
        <select className={fieldClassName} defaultValue={param(params, "status") ?? ""} name="status">
          <option value="">Tutti</option>
          <option value="unpublished">Non pubblicato</option>
          <option value="draft">Bozza</option>
          <option value="scheduled">Programmato</option>
          <option value="published">Pubblicato</option>
          <option value="paused">In pausa</option>
          <option value="ended">Terminato</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium text-zinc-700">
        Disponibilità
        <select className={fieldClassName} defaultValue={param(params, "availability") ?? ""} name="availability">
          <option value="">Tutte</option>
          <option value="available">Disponibile</option>
          <option value="low_stock">Scorte basse</option>
          <option value="unavailable">Non disponibile</option>
          <option value="reservation_only">Solo prenotazione</option>
          <option value="pickup_only">Solo ritiro</option>
          <option value="delivery_only">Solo consegna</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium text-zinc-700">
        Sconto
        <select className={fieldClassName} defaultValue={param(params, "discounted") ?? ""} name="discounted">
          <option value="">Tutti</option>
          <option value="yes">Con sconto</option>
          <option value="no">Senza sconto</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium text-zinc-700">
        Immagine
        <select className={fieldClassName} defaultValue={param(params, "missing_image") ?? ""} name="missing_image">
          <option value="">Tutte</option>
          <option value="yes">Mancante</option>
          <option value="no">Presente</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium text-zinc-700">
        Ordina
        <select className={fieldClassName} defaultValue={param(params, "sort") ?? "updated_desc"} name="sort">
          <option value="updated_desc">Ultima modifica</option>
          <option value="name_asc">Nome</option>
          <option value="status_asc">Stato</option>
          <option value="price_asc">Prezzo</option>
          <option value="sort_rank_asc">Ordine catalogo</option>
        </select>
      </label>
      <div className="flex items-end gap-2 lg:col-span-7">
        <button className={buttonClassName} type="submit">Applica filtri</button>
        <Link className={secondaryButtonClassName} href={buildHref(params, { availability: null, discounted: null, missing_image: null, page: null, q: null, sort: null, status: null })}>Azzera</Link>
      </div>
    </form>
  );
}

function PublicationEditor({ model, row }: { model: StorefrontPublicationsReadModel; row: StorefrontPublicationRow }) {
  const images = model.images.filter((image) => image.sourceProductId === row.sourceProductId);
  const defaultPrice = row.retailPriceClp ?? row.operationalPrice ?? 0;
  return (
    <details className="border-t border-zinc-200 bg-zinc-50 px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Modifica pubblicazione</summary>
      <form action={saveStorefrontPublicationAction} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {model.selectedShopId ? <input name="shop_id" type="hidden" value={model.selectedShopId} /> : null}
        <input name="sourceProductId" type="hidden" value={row.sourceProductId} />
        <label className="grid gap-1 text-xs font-medium text-zinc-700 md:col-span-2">
          Nome pubblico
          <input className={fieldClassName} defaultValue={row.publicName ?? row.operationalName ?? ""} maxLength={200} name="publicName" required />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Categoria pubblica
          <select className={fieldClassName} defaultValue={row.publicCategoryId ?? ""} name="publicCategoryId">
            <option value="">Seleziona categoria</option>
            {model.categories.map((category) => <option key={category.id} value={category.id}>{category.name} · {category.status}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Marca pubblica
          <input className={fieldClassName} defaultValue={row.publicBrand ?? ""} maxLength={120} name="publicBrand" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700 md:col-span-2 xl:col-span-4">
          Descrizione pubblica
          <textarea className="min-h-24 w-full rounded-md border border-zinc-300 bg-white p-3 text-sm outline-none focus:border-emerald-700" defaultValue={row.publicDescription ?? ""} maxLength={5000} name="publicDescription" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Modalità prezzo
          <select className={fieldClassName} defaultValue={row.priceSourceMode ?? "operational"} name="priceSourceMode">
            <option value="operational">Segue prezzo operativo</option>
            <option value="override">Override cliente</option>
            <option value="promotion">Promozione</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Prezzo cliente CLP
          <input className={fieldClassName} defaultValue={defaultPrice} min={0} name="retailPriceClp" required step={1} type="number" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Prezzo precedente CLP
          <input className={fieldClassName} defaultValue={row.compareAtPriceClp ?? ""} min={0} name="compareAtPriceClp" step={1} type="number" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Ordine catalogo
          <input className={fieldClassName} defaultValue={row.sortRank} name="sortRank" required step={1} type="number" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Inizio promozione
          <input className={fieldClassName} defaultValue={row.promotionStartsAt?.slice(0, 16) ?? ""} name="promotionStartsAt" type="datetime-local" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Fine promozione
          <input className={fieldClassName} defaultValue={row.promotionEndsAt?.slice(0, 16) ?? ""} name="promotionEndsAt" type="datetime-local" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Immagine pubblicata
          <select className={fieldClassName} defaultValue={row.publishedImageVersionId ?? ""} name="publishedImageVersionId">
            <option value="">Nessuna immagine</option>
            {images.map((image) => <option key={image.id} value={image.id}>{image.status} · {image.id.slice(0, 8)}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Disponibilità commerciale
          <select className={fieldClassName} defaultValue={row.availabilityMode ?? "available"} name="availabilityMode">
            <option value="available">Disponibile</option>
            <option value="low_stock">Scorte basse</option>
            <option value="unavailable">Non disponibile</option>
            <option value="reservation_only">Solo prenotazione</option>
            <option value="pickup_only">Solo ritiro</option>
            <option value="delivery_only">Solo consegna</option>
          </select>
        </label>
        <fieldset className="grid gap-2 rounded-md border border-zinc-200 bg-white p-3 text-sm md:col-span-2">
          <legend className="px-1 text-xs font-semibold text-zinc-700">Fulfillment e visibilità</legend>
          <label><input defaultChecked={row.pickupEnabled} name="pickupEnabled" type="checkbox" /> <span className="ml-2">Ritiro</span></label>
          <label><input defaultChecked={row.deliveryEnabled} name="deliveryEnabled" type="checkbox" /> <span className="ml-2">Consegna</span></label>
          <label><input defaultChecked={row.reservationEnabled} name="reservationEnabled" type="checkbox" /> <span className="ml-2">Prenotazione</span></label>
          <label><input defaultChecked={row.featured} name="featured" type="checkbox" /> <span className="ml-2">In evidenza</span></label>
        </fieldset>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Stato pubblicazione
          <select className={fieldClassName} defaultValue={row.publicationStatus === "unpublished" ? "draft" : row.publicationStatus} name="publicationStatus">
            <option value="draft">Bozza</option>
            <option disabled={!model.permissions.canPublish} value="scheduled">Programmato</option>
            <option disabled={!model.permissions.canPublish} value="published">Pubblicato</option>
            <option disabled={!model.permissions.canPublish} value="paused">In pausa</option>
            <option disabled={!model.permissions.canPublish} value="ended">Terminato</option>
          </select>
        </label>
        <div className="flex items-end md:col-span-2 xl:col-span-3">
          <button className={buttonClassName} disabled={!model.permissions.canEdit && !model.permissions.canPublish} type="submit">Salva e rivalida server-side</button>
        </div>
      </form>
    </details>
  );
}

function Catalog({ model, params }: { model: StorefrontPublicationsReadModel; params: Record<string, string | string[] | undefined> }) {
  return (
    <div className="grid gap-5">
      <Filters params={params} />
      <form className="flex flex-wrap gap-2" id="storefront-bulk-form">
        {model.selectedShopId ? <input name="shop_id" type="hidden" value={model.selectedShopId} /> : null}
        <button className={buttonClassName} disabled={!model.permissions.canBulkPublish} formAction={bulkPublishStorefrontAction}>Pubblica selezionati</button>
        <button className={secondaryButtonClassName} disabled={!model.permissions.canBulkPublish} formAction={bulkPauseStorefrontAction}>Metti in pausa</button>
        <p className="self-center text-xs text-zinc-500">Le operazioni multiple sono atomiche e limitate a 100 righe.</p>
      </form>
      <section aria-label="Pubblicazioni Storefront" className="overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm">
        {model.rows.length === 0 ? (
          <div className="p-8 text-center"><h2 className="font-semibold">Nessun prodotto trovato</h2><p className="mt-1 text-sm text-zinc-500">Modifica i filtri o verifica la mappatura inventario del negozio.</p></div>
        ) : model.rows.map((row) => (
          <article className="border-b border-zinc-200 last:border-b-0" key={row.sourceProductId}>
            <div className="grid gap-3 p-4 md:grid-cols-[auto_minmax(0,2fr)_repeat(4,minmax(0,1fr))] md:items-center">
              <input aria-label={`Seleziona ${row.publicName ?? row.operationalName ?? row.barcode}`} disabled={!row.publicationId || !model.permissions.canBulkPublish} form="storefront-bulk-form" name="publicationIds" type="checkbox" value={row.publicationId ?? ""} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-zinc-950">{row.publicName ?? row.operationalName ?? "Prodotto senza nome"}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{row.barcode} · interno: {row.operationalName ?? "—"}</p>
              </div>
              <div><p className="text-xs text-zinc-500">Stato</p><span className={`mt-1 inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${statusTone(row.publicationStatus)}`}>{row.publicationStatus}</span></div>
              <div><p className="text-xs text-zinc-500">Prezzo operativo</p><p className="mt-1 text-sm font-semibold">{clp(row.operationalPrice)}</p></div>
              <div><p className="text-xs text-zinc-500">Prezzo cliente</p><p className="mt-1 text-sm font-semibold">{clp(row.retailPriceClp)}</p></div>
              <div><p className="text-xs text-zinc-500">Categoria / immagine</p><p className="mt-1 truncate text-sm">{row.publicCategoryName ?? "—"} · {row.publishedImageVersionId ? "pronta" : "mancante"}</p></div>
            </div>
            <PublicationEditor model={model} row={row} />
          </article>
        ))}
      </section>
      <nav aria-label="Paginazione pubblicazioni" className="flex items-center justify-between rounded-md border border-zinc-200 bg-white p-3 text-sm">
        <Link aria-disabled={model.pagination.page <= 1} className={secondaryButtonClassName} href={buildHref(params, { page: Math.max(1, model.pagination.page - 1) })}>Precedente</Link>
        <span>Pagina {model.pagination.page} di {model.pagination.totalPages} · {model.pagination.total} prodotti</span>
        <Link aria-disabled={model.pagination.page >= model.pagination.totalPages} className={secondaryButtonClassName} href={buildHref(params, { page: Math.min(model.pagination.totalPages, model.pagination.page + 1) })}>Successiva</Link>
      </nav>
    </div>
  );
}

function jsonObject(value: Json | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : null;
}

function Preview({ preview }: { preview: Json }) {
  const root = jsonObject(preview);
  const items = root && Array.isArray(root.featured) ? root.featured : [];
  const offers = root && Array.isArray(root.offers) ? root.offers : [];
  return (
    <section className="grid gap-4 rounded-[2rem] border-8 border-zinc-900 bg-zinc-50 p-5 shadow-xl md:mx-auto md:max-w-md" aria-label="Anteprima mobile cliente">
      <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase text-emerald-700">Anteprima cliente</p><h2 className="text-xl font-semibold">Storefront</h2></div><span className="size-3 rounded-full bg-emerald-500" /></div>
      <div className="rounded-xl bg-emerald-800 p-4 text-white"><p className="text-sm">Catalogo pubblico</p><p className="mt-1 text-2xl font-semibold">{root?.status === "ok" ? "Disponibile" : "Non disponibile"}</p></div>
      <div><h3 className="font-semibold">In evidenza</h3><div className="mt-2 grid grid-cols-2 gap-2">{items.slice(0, 4).map((item, index) => <PreviewCard item={item} key={index} />)}</div></div>
      <div><h3 className="font-semibold">Offerte</h3><div className="mt-2 grid grid-cols-2 gap-2">{offers.slice(0, 4).map((item, index) => <PreviewCard item={item} key={index} />)}</div></div>
      {items.length === 0 && offers.length === 0 ? <p className="rounded-md border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500">Nessun prodotto pubblico nel contratto Home v1.</p> : null}
      <p className="text-xs text-zinc-500">Questa anteprima usa il payload restituito da storefront_home_v1, lo stesso contratto del client.</p>
    </section>
  );
}

function PreviewCard({ item }: { item: Json }) {
  const value = jsonObject(item);
  const name = typeof value?.name === "string" ? value.name : "Prodotto";
  const price = typeof value?.priceClp === "number" ? value.priceClp : null;
  return <article className="rounded-lg border border-zinc-200 bg-white p-3"><div className="aspect-square rounded-md bg-zinc-100" /><p className="mt-2 line-clamp-2 text-sm font-medium">{name}</p><p className="mt-1 text-sm font-semibold text-emerald-800">{clp(price)}</p></article>;
}

function PlaceholderArea({ area, model }: { area: Exclude<StorefrontArea, "catalog" | "preview" | "audit">; model: StorefrontPublicationsReadModel }) {
  const descriptions: Record<typeof area, string> = {
    categories: "Le categorie pubbliche disponibili sono già validate e usate dall’editor prodotto. La gestione completa viene attivata in TASK-007/TASK-008 senza esporre la tassonomia interna.",
    promotions: "Il modello promozioni è disponibile; creazione, conflitti e scheduling completo vengono consegnati in TASK-008.",
    images: "Sono selezionabili solo immagini ready/published. La pipeline pubblica separata e le varianti thumb/card/detail vengono consegnate in TASK-009.",
    settings: "Le impostazioni Storefront restano server-side e feature-flagged. Il control plane completo viene abilitato nei task pertinenti.",
  };
  const counts: Record<typeof area, string> = {
    categories: `${model.categories.length} categorie`,
    promotions: "Feature flag OFF",
    images: `${model.images.length} immagini pronte`,
    settings: "Produzione OFF",
  };
  return <section className="rounded-md border border-zinc-200 bg-white p-6 shadow-sm"><p className="text-xs font-semibold uppercase text-emerald-700">{counts[area]}</p><h2 className="mt-2 text-xl font-semibold">{areas.find(([key]) => key === area)?.[1]}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{descriptions[area]}</p></section>;
}

function Audit({ model }: { model: StorefrontPublicationsReadModel }) {
  if (!model.permissions.canViewAudit) return <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Permesso storefront.audit.view richiesto.</p>;
  return <section className="overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm"><div className="border-b border-zinc-200 p-4"><h2 className="font-semibold">Audit Storefront</h2><p className="text-sm text-zinc-500">Attore, operazione e snapshot pubblico prima/dopo; nessun secret.</p></div>{model.audit.length === 0 ? <p className="p-6 text-sm text-zinc-500">Nessun evento Storefront.</p> : <ul>{model.audit.map((event) => <li className="grid gap-2 border-b border-zinc-100 p-4 text-sm md:grid-cols-4" key={event.id}><div><p className="text-xs text-zinc-500">Evento</p><p className="font-medium">{event.eventKey}</p></div><div><p className="text-xs text-zinc-500">Attore</p><p>{event.actorKind}</p></div><div><p className="text-xs text-zinc-500">Esito</p><p>{event.result} · {event.updatedCount ?? 1} righe</p></div><div><p className="text-xs text-zinc-500">Quando</p><time dateTime={event.createdAt}>{event.createdAt}</time></div></li>)}</ul>}</section>;
}

export default async function StorefrontPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const area = areaParam(param(params, "area"));
  const model = await getStorefrontPublicationsReadModel({
    availability: param(params, "availability"),
    discounted: booleanParam(param(params, "discounted")),
    missingImage: booleanParam(param(params, "missing_image")),
    page: integerParam(param(params, "page"), 1),
    pageSize: integerParam(param(params, "pageSize"), 25),
    query: param(params, "q"),
    requestedShopId: param(params, "shop_id"),
    sort: param(params, "sort"),
    status: param(params, "status"),
  });
  const published = model.rows.filter((row) => row.publicationStatus === "published").length;
  const discounted = model.rows.filter((row) => row.compareAtPriceClp !== null && row.retailPriceClp !== null && row.compareAtPriceClp > row.retailPriceClp).length;
  const missingImages = model.rows.filter((row) => !row.publishedImageVersionId).length;

  return (
    <div className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-5`}>
      <ActionResultBanner action={param(params, "action")} result={param(params, "result")} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Riepilogo Storefront">
        <Metric detail="Scope negozio autorizzato" label="Prodotti" value={String(model.pagination.total)} />
        <Metric detail="Nella pagina corrente" label="Pubblicati" value={String(published)} />
        <Metric detail="Compare-at maggiore del prezzo" label="In sconto" value={String(discounted)} />
        <Metric detail="Bloccano publish se l’immagine è obbligatoria" label="Immagine mancante" value={String(missingImages)} />
      </section>
      <nav aria-label="Sezioni Storefront" className="flex gap-2 overflow-x-auto rounded-md border border-zinc-200 bg-white p-2 shadow-sm">{areas.map(([key, label]) => <Link aria-current={area === key ? "page" : undefined} className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold ${area === key ? "bg-emerald-800 text-white" : "text-zinc-700 hover:bg-zinc-100"}`} href={buildHref(params, { area: key, page: null })} key={key}>{label}</Link>)}</nav>
      {model.status !== "ready" ? <section className="rounded-md border border-amber-200 bg-amber-50 p-5"><h2 className="font-semibold text-amber-950">Storefront non disponibile</h2><p className="mt-1 text-sm text-amber-900">{model.reason}</p></section> : area === "catalog" ? <Catalog model={model} params={params} /> : area === "preview" ? <Preview preview={model.preview} /> : area === "audit" ? <Audit model={model} /> : <PlaceholderArea area={area} model={model} />}
    </div>
  );
}
